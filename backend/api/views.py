"""DRF views for CodeRepo API endpoints."""

import json
import logging
import queue
import threading

import httpx
from django.conf import settings
from django.contrib.auth.models import User
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from langchain.callbacks.base import BaseCallbackHandler

from api.models import Repo, ChatSession, Message, UserProfile
from ingestion.pipeline import run_ingestion

logger = logging.getLogger(__name__)

_SENTINEL = object()   # signals the token queue is done


class _TokenQueueCallback(BaseCallbackHandler):
    """Streams LLM tokens into a queue so the SSE generator can consume them."""

    def __init__(self, q: queue.Queue) -> None:
        self._q = q

    def on_llm_new_token(self, token: str, **kwargs) -> None:
        self._q.put(('token', token))


class GitHubAuthView(APIView):
    """POST /api/auth/github/ — exchange a GitHub OAuth code for a DRF token."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        code = request.data.get('code', '').strip()
        if not code:
            return Response({'error': 'code is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Step 1: exchange code for GitHub access token
        token_resp = httpx.post(
            'https://github.com/login/oauth/access_token',
            json={
                'client_id': settings.GITHUB_CLIENT_ID,
                'client_secret': settings.GITHUB_CLIENT_SECRET,
                'code': code,
            },
            headers={'Accept': 'application/json'},
            timeout=10,
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')
        if not access_token:
            error = token_data.get('error_description', 'GitHub auth failed')
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        # Step 2: fetch GitHub user info
        user_resp = httpx.get(
            'https://api.github.com/user',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/vnd.github+json',
            },
            timeout=10,
        )
        gh_user = user_resp.json()
        github_id = gh_user.get('id')
        github_username = gh_user.get('login', '')
        avatar_url = gh_user.get('avatar_url', '')
        email = gh_user.get('email') or ''

        # Step 3: get or create Django User + UserProfile
        user, _ = User.objects.get_or_create(
            username=github_username,
            defaults={'email': email},
        )
        profile, created = UserProfile.objects.get_or_create(
            github_id=github_id,
            defaults={
                'user': user,
                'github_username': github_username,
                'avatar_url': avatar_url,
                'github_access_token': access_token,
            },
        )
        if not created:
            profile.github_access_token = access_token
            profile.avatar_url = avatar_url
            profile.save(update_fields=['github_access_token', 'avatar_url'])

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                'username': github_username,
                'avatar_url': avatar_url,
                'github_username': github_username,
            },
        })


class CurrentUserView(APIView):
    """GET /api/auth/me/ — return the currently authenticated user's info."""

    def get(self, request: Request) -> Response:
        try:
            profile = request.user.profile
            avatar_url = profile.avatar_url
            github_username = profile.github_username
        except UserProfile.DoesNotExist:
            avatar_url = ''
            github_username = request.user.username
        return Response({
            'username': request.user.username,
            'avatar_url': avatar_url,
            'github_username': github_username,
        })


class LogoutView(APIView):
    """POST /api/auth/logout/ — invalidate the current token."""

    def post(self, request: Request) -> Response:
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IngestView(APIView):
    """POST /api/ingest/ — clone a GitHub repo and index it into Chroma."""

    def post(self, request: Request) -> Response:
        github_url = request.data.get('github_url', '').strip()
        if not github_url:
            return Response(
                {'error': 'github_url is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repo, created = Repo.objects.get_or_create(
            github_url=github_url,
            defaults={
                'name': _repo_name(github_url),
                'status': Repo.Status.INDEXING,
                'owner': request.user,
            },
        )
        if not created:
            repo.status = Repo.Status.INDEXING
            repo.save(update_fields=['status'])

        try:
            chunk_count = run_ingestion(github_url, str(repo.id))
            repo.status = Repo.Status.READY
            repo.chunk_count = chunk_count
            repo.save(update_fields=['status', 'chunk_count'])
            return Response(
                {'repo_id': str(repo.id), 'status': repo.status, 'chunk_count': chunk_count},
                status=status.HTTP_200_OK,
            )
        except Exception as exc:
            logger.exception("Ingestion failed for %s", github_url)
            repo.status = Repo.Status.FAILED
            repo.save(update_fields=['status'])
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChatStreamView(APIView):
    """POST /api/chat/stream/ — run the agent and stream the response as SSE."""

    def post(self, request: Request) -> StreamingHttpResponse:
        repo_id = request.data.get('repo_id', '').strip()
        question = request.data.get('question', '').strip()

        if not repo_id or not question:
            # StreamingHttpResponse can't return 400 easily; return plain Response here
            return Response(
                {'error': 'repo_id and question are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            repo = Repo.objects.get(id=repo_id, status=Repo.Status.READY)
        except Repo.DoesNotExist:
            return Response(
                {'error': 'repo not found or not ready'},
                status=status.HTTP_404_NOT_FOUND,
            )

        session = ChatSession.objects.create(repo=repo)
        Message.objects.create(session=session, role=Message.Role.USER, content=question)

        response = StreamingHttpResponse(
            self._stream(session, repo_id, question),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    def _stream(self, session: ChatSession, repo_id: str, question: str):
        from agent.graph import graph
        from agent.state import AgentState

        token_queue: queue.Queue = queue.Queue()
        callback = _TokenQueueCallback(token_queue)
        result_holder: dict = {}

        def run_graph():
            try:
                initial_state: AgentState = {
                    'repo_id': repo_id,
                    'question': question,
                    'chunks': [],
                    'answer': '',
                    'citations': [],
                    'retry_count': 0,
                    'is_grounded': False,
                    'corrective_hint': '',
                }
                result = graph.invoke(
                    initial_state,
                    config={'callbacks': [callback]},
                )
                result_holder['state'] = result
            except Exception as exc:
                logger.exception("Agent failed for repo_id=%s", repo_id)
                result_holder['error'] = str(exc)
            finally:
                token_queue.put(_SENTINEL)

        thread = threading.Thread(target=run_graph, daemon=True)
        thread.start()

        full_answer_parts: list[str] = []

        while True:
            item = token_queue.get()
            if item is _SENTINEL:
                break
            _, token = item
            full_answer_parts.append(token)
            yield _sse('token', {'text': token})

        thread.join()

        if 'error' in result_holder:
            yield _sse('error', {'error': result_holder['error']})
            return

        final_state = result_holder.get('state', {})
        full_answer = ''.join(full_answer_parts)

        # Persist assistant message + citations
        assistant_msg = Message.objects.create(
            session=session,
            role=Message.Role.ASSISTANT,
            content=full_answer,
        )
        citations = final_state.get('citations', [])
        _save_citations(assistant_msg, citations)

        yield _sse('citations', {'citations': citations})
        yield _sse('done', {})


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _save_citations(message: Message, citations: list[dict]) -> None:
    from api.models import Citation
    for c in citations:
        Citation.objects.create(
            message=message,
            file_path=c.get('file_path', ''),
            start_line=c.get('start_line', 0),
            end_line=c.get('end_line', 0),
            github_url=c.get('github_url', ''),
        )


def _repo_name(github_url: str) -> str:
    parts = github_url.rstrip('/').split('/')
    if len(parts) >= 2:
        return '/'.join(parts[-2:])
    return github_url

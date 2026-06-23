# CodeRepo — Claude Code Instructions

## What this project is
A SaaS app where developers connect a GitHub repo and ask questions about the codebase.
The AI agent retrieves relevant code chunks and answers with file + line citations.

## Current phase
**MVP (2-day build)** — get a working end-to-end demo: connect repo → index it → ask questions → get cited answers.
No auth, no billing, no multi-tenancy yet. Single user, local only.

## Tech stack
- Backend: Django + Django REST Framework (Python)
- Frontend: React + Vite + Tailwind CSS
- Agent: LangChain + LangGraph
- Vector store: Chroma (local, file-based at backend/chroma_store/)
- Database: SQLite (Django default)
- LLM: gpt-4o-mini (OpenAI)
- Embeddings: text-embedding-3-small (OpenAI)
- Code parsing: tree-sitter

## Project structure
coderepo/
  backend/          <- Django project root
    coderepo/       <- settings package
    api/            <- main Django app (models, views, urls, serializers)
    ingestion/      <- repo cloning, chunking, embedding pipeline
    agent/          <- LangGraph StateGraph, nodes, prompts
    chroma_store/   <- Chroma persisted data (gitignored)
    manage.py
    requirements.txt
    .env
  frontend/         <- Vite + React
    src/
      components/
      pages/
      hooks/
      api.js        <- ALL fetch/SSE calls go here, nowhere else
    vite.config.js  <- proxies /api/* to localhost:8000

## Coding rules — follow these strictly

### General
- Never hardcode API keys. Always use os.environ.get() and .env file.
- All secrets go in backend/.env, never committed. Use python-dotenv.
- Every new Python module needs a short docstring at the top explaining what it does.
- Keep functions small — one function, one job. Max ~40 lines per function.
- No print() for debugging. Use Python's logging module.

### Django / backend
- All API endpoints live under /api/ prefix.
- Use Django class-based views (APIView from DRF) not function-based views.
- Models go in api/models.py. Never put business logic inside models.
- Business logic goes in ingestion/ or agent/ modules, not in views.py.
- Views should only: validate input, call a service, return a response.
- For SSE streaming: use Django's StreamingHttpResponse with content_type='text/event-stream'.
- CORS is enabled for http://localhost:5173 (Vite dev server) only.
- Run Django with: cd backend && python manage.py runserver 8000

### LangGraph agent (agent/)
- State schema is defined in agent/state.py as a TypedDict. Never pass raw dicts.
- Each node is a separate function in agent/nodes.py — router, retriever, synthesiser, critic.
- The graph is compiled once at module load in agent/graph.py and reused across requests.
- Prompts are strings defined in agent/prompts.py — never inline prompts inside node functions.
- Always set LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY in .env for LangSmith.

### Ingestion pipeline (ingestion/)
- cloner.py: clones repo to a temp directory using PyGithub + git.
- chunker.py: uses tree-sitter to split code at function/class boundaries.
- embedder.py: takes chunks, calls OpenAI embeddings API, stores in Chroma.
- pipeline.py: calls cloner → chunker → embedder in sequence. This is what views.py calls.
- Chroma collection name = repo_id (UUID string) for isolation.
- Always clean up temp clone directory after ingestion (use try/finally).

### Frontend
- All API calls go through src/api.js. Never call fetch() directly in components.
- SSE streaming is handled by the custom hook src/hooks/useSSE.js.
- Components are functional with hooks only. No class components.
- Tailwind for all styling. No inline style objects.
- Pages go in src/pages/, reusable UI goes in src/components/.
- Run frontend with: cd frontend && npm run dev

### Vite proxy
vite.config.js proxies /api/* to http://localhost:8000 so frontend
calls /api/ingest/, /api/chat/ etc without CORS issues in dev.

## Environment variables needed (backend/.env)
OPENAI_API_KEY=
GITHUB_TOKEN=        <- personal access token for cloning repos
LANGCHAIN_API_KEY=   <- LangSmith (free at smith.langchain.com)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=coderepo-mvp
DJANGO_SECRET_KEY=
DEBUG=True

## MVP feature scope (build in this order)
1. Ingestion API: POST /api/ingest/ — takes github_url, clones, chunks, embeds, returns repo_id
2. Chat API: POST /api/chat/stream/ — takes repo_id + question, streams SSE response with citations
3. React frontend: repo connect form → ingestion progress → chat interface with citation cards
4. End-to-end test with a small real repo

## What is NOT in MVP scope (do not build yet)
- User authentication / GitHub OAuth
- Multi-user / multi-tenancy
- Billing / usage limits
- Redis / Celery (ingestion is synchronous for now)
- Deployment / Docker
- PR summaries, onboarding checklists (future features)

## API contracts

### POST /api/ingest/
Request:  { "github_url": "https://github.com/user/repo" }
Response: { "repo_id": "uuid", "status": "indexing", "chunk_count": 0 }
After ingestion completes: { "repo_id": "uuid", "status": "ready", "chunk_count": 142 }

### POST /api/chat/stream/
Request:  { "repo_id": "uuid", "question": "Where is the auth logic?" }
Response: SSE stream
  event: token
  data: {"text": "The auth"}

  event: token
  data: {"text": " logic is in"}

  event: citations
  data: {"citations": [{"file": "src/auth.py", "start_line": 12, "end_line": 34, "url": "..."}]}

  event: done
  data: {}

## Key technical decisions
- tree-sitter for chunking: splits at function/class level, not arbitrary characters.
  This is the most important quality decision in the whole project.
- Chroma collection per repo_id: simple isolation without multi-tenancy complexity.
- Self-critic node in LangGraph: checks if answer is grounded in retrieved chunks.
  If not grounded, routes back to synthesiser with corrective prompt (max 2 retries).
- SSE not WebSocket: simpler, works with Django, one-directional stream is all we need.

## When you are unsure
- Prefer simpler over clever.
- Prefer explicit over magic.
- If a feature is not in MVP scope, say so and skip it.
- Never mock data or add placeholder logic without a TODO comment explaining what's needed.
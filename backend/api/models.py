"""Data models for CodeRepo: repos, chat sessions, messages, and citations."""

import uuid
from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    """GitHub identity linked to a Django User created via OAuth."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile'
    )
    github_id = models.IntegerField(unique=True)
    github_username = models.CharField(max_length=255)
    avatar_url = models.URLField(blank=True)
    github_access_token = models.CharField(max_length=255)

    def __str__(self):
        return self.github_username


class Repo(models.Model):
    """A GitHub repository that has been ingested into the vector store."""

    class Status(models.TextChoices):
        INDEXING = 'indexing', 'Indexing'
        READY = 'ready', 'Ready'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        null=True, blank=True, related_name='repos'
    )
    github_url = models.URLField(unique=True)
    name = models.CharField(max_length=255)  # e.g. "owner/repo"
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INDEXING)
    chunk_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ChatSession(models.Model):
    """A conversation thread tied to a single indexed repo."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    repo = models.ForeignKey(Repo, on_delete=models.CASCADE, related_name='sessions')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Session {self.id} — {self.repo.name}"


class Message(models.Model):
    """A single turn (question or answer) within a ChatSession."""

    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"


class Citation(models.Model):
    """A source code reference attached to an assistant message."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='citations')
    file_path = models.CharField(max_length=512)
    start_line = models.IntegerField()
    end_line = models.IntegerField()
    github_url = models.URLField(blank=True)

    def __str__(self):
        return f"{self.file_path}:{self.start_line}-{self.end_line}"

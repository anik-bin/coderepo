"""URL patterns for the api app."""

from django.urls import path
from api.views import (
    IngestView,
    ChatStreamView,
    GitHubAuthView,
    CurrentUserView,
    LogoutView,
)

urlpatterns = [
    path('ingest/', IngestView.as_view(), name='ingest'),
    path('chat/stream/', ChatStreamView.as_view(), name='chat-stream'),
    path('auth/github/', GitHubAuthView.as_view(), name='auth-github'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
]

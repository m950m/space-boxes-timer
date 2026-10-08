"""Serve the V2 frontend and its JavaScript during local development."""

from django.conf import settings
from django.http import Http404
from django.urls import path
from django.views.generic import TemplateView
from django.views.static import serve


def serve_javascript(request, path):
    if not settings.DEBUG:
        raise Http404
    return serve(request, path, document_root=settings.FRONTEND_DIR / "js")


urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html")),
    path("js/<path:path>", serve_javascript),
]

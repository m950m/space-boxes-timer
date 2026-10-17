"""Serve the V2 frontend, its assets and the connected API during development."""

from django.conf import settings
from django.contrib import admin
from django.http import Http404
from django.urls import include, path
from django.views.generic import TemplateView
from django.views.static import serve


def serve_asset(request, path, directory):
    if not settings.DEBUG:
        raise Http404
    return serve(request, path, document_root=settings.FRONTEND_DIR / directory)


urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html")),
    path("classic", TemplateView.as_view(template_name="classic.html")),
    path("js/<path:path>", serve_asset, {"directory": "js"}),
    path("css/<path:path>", serve_asset, {"directory": "css"}),
    path("admin/", admin.site.urls),
    path("api/v2/", include("accounts.urls")),
    path("api/v2/", include("productivity.urls")),
]

"""WSGI entry point for the V2 Django project."""

import os

from django.core.wsgi import get_wsgi_application
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from whitenoise import WhiteNoise

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# Direct WSGI startup must not silently use development settings.
os.environ.setdefault("DJANGO_DEBUG", "0")
application = get_wsgi_application()

if not settings.DEBUG:
    if not (settings.REACT_DIST_DIR / "index.html").is_file():
        raise ImproperlyConfigured("React production build missing: build the release image")
    for asset in ("admin/css/base.css",):
        if not (settings.STATIC_ROOT / asset).is_file():
            raise ImproperlyConfigured("Release assets missing: run collectstatic before startup")

    def asset_headers(headers, path, url):
        headers["X-Content-Type-Options"] = "nosniff"

    application = WhiteNoise(
        application, root=settings.STATIC_ROOT, prefix=settings.STATIC_URL,
        max_age=0, add_headers_function=asset_headers,
    )
    # Preserve the shipped ES module URLs without publishing frontend tests/docs.
    for directory in ("js", "css", "assets"):
        application.add_files(settings.STATIC_ROOT / directory, prefix=f"/{directory}/")

"""Local development settings; not a production configuration.

Connected-product defaults follow ADR-004 (opaque server-side sessions in a
Secure/HttpOnly SameSite cookie) and OD-011 (temporary single-use rate-limited
recovery). PostgreSQL is configured through environment variables so the same
settings run locally and in CI; see v2/README.md.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "django-insecure-v2-local-development-only"
)
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "accounts",
    "productivity",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIR],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("SPACE_BOXES_DB_NAME", "space_boxes_v2"),
        "USER": os.environ.get("SPACE_BOXES_DB_USER", "spaceboxes"),
        "PASSWORD": os.environ.get("SPACE_BOXES_DB_PASSWORD", ""),
        "HOST": os.environ.get("SPACE_BOXES_DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("SPACE_BOXES_DB_PORT", "5434"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ADR-004: the cookie identifies the session; server-side state owns it.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_NAME = "spaceboxes_session"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True

# Recovery email uses the console backend locally; deployments configure SMTP.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = "no-reply@spaceboxes.local"

USE_TZ = True

STATIC_URL = "static/"

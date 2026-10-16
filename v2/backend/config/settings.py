"""Development defaults and fail-fast, environment-configured release settings."""

import os
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def env_bool(name, default):
    value = os.environ.get(name, "1" if default else "0").lower()
    if value not in {"0", "1", "true", "false"}:
        raise ImproperlyConfigured(f"{name} must be 0, 1, true or false")
    return value in {"1", "true"}


def env_list(name):
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


def required_env(name, default=""):
    value = os.environ.get(name, default)
    if not DEBUG and not value.strip():
        raise ImproperlyConfigured(f"{name} is required when DJANGO_DEBUG=0")
    return value

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

DEBUG = env_bool("DJANGO_DEBUG", True)
SECRET_KEY = required_env(
    "DJANGO_SECRET_KEY", "django-insecure-v2-local-development-only" if DEBUG else ""
)
if not DEBUG and (
    len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or SECRET_KEY.startswith("django-insecure-")
):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a strong, private random key")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS") or (
    ["localhost", "127.0.0.1", "[::1]"] if DEBUG else []
)
if not DEBUG and (not ALLOWED_HOSTS or any("*" in host for host in ALLOWED_HOSTS)):
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS requires explicit hosts, without wildcards")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
for origin in CSRF_TRUSTED_ORIGINS:
    parsed = urlsplit(origin)
    if (
        parsed.scheme not in ({"http", "https"} if DEBUG else {"https"})
        or not parsed.netloc or parsed.path or parsed.query or parsed.fragment
        or parsed.username or parsed.password or "*" in origin
    ):
        raise ImproperlyConfigured("DJANGO_CSRF_TRUSTED_ORIGINS requires explicit origins")

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
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
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
        "NAME": required_env("SPACE_BOXES_DB_NAME", "space_boxes_v2" if DEBUG else ""),
        "USER": required_env("SPACE_BOXES_DB_USER", "spaceboxes" if DEBUG else ""),
        "PASSWORD": required_env("SPACE_BOXES_DB_PASSWORD"),
        "HOST": required_env("SPACE_BOXES_DB_HOST", "127.0.0.1" if DEBUG else ""),
        "PORT": os.environ.get("SPACE_BOXES_DB_PORT", "5434"),
        "OPTIONS": {
            "connect_timeout": 5,
            "sslmode": os.environ.get("SPACE_BOXES_DB_SSLMODE", "prefer" if DEBUG else "require"),
        },
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
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 3600
# Subdomains/preload require a separate domain-wide operational decision.
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SECURE_REFERRER_POLICY = "same-origin"
# Enable only behind a trusted proxy which strips and overwrites this header.
if env_bool("DJANGO_TRUST_PROXY_HTTPS", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

EMAIL_BACKEND = (
    "django.core.mail.backends.console.EmailBackend" if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = required_env("SPACE_BOXES_EMAIL_HOST")
EMAIL_PORT = int(os.environ.get("SPACE_BOXES_EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("SPACE_BOXES_EMAIL_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("SPACE_BOXES_EMAIL_PASSWORD", "")
EMAIL_USE_TLS = env_bool("SPACE_BOXES_EMAIL_USE_TLS", not DEBUG)
EMAIL_USE_SSL = env_bool("SPACE_BOXES_EMAIL_USE_SSL", False)
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ImproperlyConfigured("Choose either email STARTTLS or implicit TLS")
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = required_env(
    "SPACE_BOXES_FROM_EMAIL", "no-reply@spaceboxes.local" if DEBUG else ""
)

USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR.parent / "staticfiles"
STATICFILES_DIRS = [(name, FRONTEND_DIR / name) for name in ("js", "css")]

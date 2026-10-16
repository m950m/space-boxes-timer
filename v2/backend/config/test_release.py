"""Release settings and HTTP security boundaries, without a database."""

import json
import os
import subprocess
import sys
from unittest.mock import patch

from django.conf import settings
from django.test import Client, SimpleTestCase, override_settings


class ReleaseSettingsTests(SimpleTestCase):
    def load_settings(self, changes=None, code=None):
        env = {key: value for key, value in os.environ.items()
               if not key.startswith(("DJANGO_", "SPACE_BOXES_"))}
        env.update({
            "DJANGO_SETTINGS_MODULE": "config.settings",
            "DJANGO_DEBUG": "0",
            "DJANGO_SECRET_KEY": "release-test-key-" * 5,
            "DJANGO_ALLOWED_HOSTS": "localhost,127.0.0.1",
            "SPACE_BOXES_DB_NAME": "release_test",
            "SPACE_BOXES_DB_USER": "release_test",
            "SPACE_BOXES_DB_PASSWORD": "test-only-password",
            "SPACE_BOXES_DB_HOST": "127.0.0.1",
            "SPACE_BOXES_EMAIL_HOST": "smtp.example.invalid",
            "SPACE_BOXES_FROM_EMAIL": "support@example.invalid",
        })
        for key, value in (changes or {}).items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = value
        return subprocess.run(
            [sys.executable, "-c", code or "import json; from config import settings as s; "
             "print(json.dumps({k: getattr(s, k, None) for k in "
             "['DEBUG', 'ALLOWED_HOSTS', 'CSRF_TRUSTED_ORIGINS', 'DATABASES', "
             "'SESSION_COOKIE_SECURE', 'SESSION_COOKIE_HTTPONLY', 'SESSION_COOKIE_SAMESITE', "
             "'CSRF_COOKIE_SECURE', 'SECURE_SSL_REDIRECT', 'SECURE_HSTS_SECONDS', "
             "'SECURE_PROXY_SSL_HEADER', 'EMAIL_BACKEND', 'EMAIL_USE_TLS']}))"],
            cwd=settings.BASE_DIR, env=env, capture_output=True, text=True, timeout=10,
        )

    def test_production_security_defaults(self):
        result = self.load_settings()
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        self.assertFalse(config["DEBUG"])
        for name in ("SESSION_COOKIE_SECURE", "SESSION_COOKIE_HTTPONLY", "CSRF_COOKIE_SECURE",
                     "SECURE_SSL_REDIRECT", "EMAIL_USE_TLS"):
            self.assertTrue(config[name], name)
        self.assertEqual(config["SESSION_COOKIE_SAMESITE"], "Lax")
        self.assertEqual(config["CSRF_TRUSTED_ORIGINS"], [])
        self.assertIsNone(config["SECURE_PROXY_SSL_HEADER"])
        self.assertGreater(config["SECURE_HSTS_SECONDS"], 0)
        self.assertEqual(config["DATABASES"]["default"]["OPTIONS"]["sslmode"], "require")
        self.assertEqual(config["EMAIL_BACKEND"], "django.core.mail.backends.smtp.EmailBackend")

    def test_deployment_checks_only_report_deferred_domain_advisories(self):
        result = self.load_settings(code="import json, django; django.setup(); "
                                    "from django.core.checks import run_checks; "
                                    "print(json.dumps([c.id for c in "
                                    "run_checks(include_deployment_checks=True)]))")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(json.loads(result.stdout)), {"security.W005", "security.W021"})

    def test_required_production_environment_fails_closed(self):
        for name in ("DJANGO_SECRET_KEY", "DJANGO_ALLOWED_HOSTS", "SPACE_BOXES_DB_NAME",
                     "SPACE_BOXES_DB_USER", "SPACE_BOXES_DB_PASSWORD", "SPACE_BOXES_DB_HOST",
                     "SPACE_BOXES_EMAIL_HOST", "SPACE_BOXES_FROM_EMAIL"):
            with self.subTest(name=name):
                result = self.load_settings({name: None})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(name, result.stderr)
                self.assertNotIn("test-only-password", result.stderr)

    def test_invalid_security_configuration_fails_closed(self):
        for changes in (
            {"DJANGO_DEBUG": "typo"},
            {"DJANGO_SECRET_KEY": "weak"},
            {"DJANGO_SECRET_KEY": "django-insecure-" + "abcde" * 15},
            {"DJANGO_ALLOWED_HOSTS": "*"},
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "http://example.com"},
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "https://example.com/path"},
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "https://*.example.com"},
            {"SPACE_BOXES_EMAIL_USE_SSL": "1"},
        ):
            with self.subTest(changes=changes):
                self.assertNotEqual(self.load_settings(changes).returncode, 0)

    def test_explicit_trusted_proxy_and_origin(self):
        result = self.load_settings({"DJANGO_TRUST_PROXY_HTTPS": "1",
                                     "DJANGO_CSRF_TRUSTED_ORIGINS": "https://app.example.com"})
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        self.assertEqual(config["SECURE_PROXY_SSL_HEADER"], ["HTTP_X_FORWARDED_PROTO", "https"])
        self.assertEqual(config["CSRF_TRUSTED_ORIGINS"], ["https://app.example.com"])

    def test_development_defaults_remain_usable_without_credentials(self):
        result = self.load_settings({"DJANGO_DEBUG": None, "DJANGO_SECRET_KEY": None,
                                     "DJANGO_ALLOWED_HOSTS": None, "SPACE_BOXES_DB_PASSWORD": None})
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        self.assertTrue(config["DEBUG"])
        self.assertFalse(config["SESSION_COOKIE_SECURE"])
        self.assertFalse(config["SECURE_SSL_REDIRECT"])

    def test_direct_wsgi_startup_requires_release_configuration_by_default(self):
        result = self.load_settings({"DJANGO_DEBUG": None, "DJANGO_SECRET_KEY": None},
                                    code="import config.wsgi")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", result.stderr)

    def test_explicit_development_wsgi_still_works(self):
        result = self.load_settings({"DJANGO_DEBUG": "1"}, code="import config.wsgi")
        self.assertEqual(result.returncode, 0, result.stderr)


@override_settings(DEBUG=False, ALLOWED_HOSTS=["testserver"], SECURE_SSL_REDIRECT=True,
                   SECURE_PROXY_SSL_HEADER=None, SESSION_COOKIE_SECURE=True,
                   CSRF_COOKIE_SECURE=True, SECURE_HSTS_SECONDS=3600)
class ReleaseHTTPTests(SimpleTestCase):
    def test_https_redirect_and_untrusted_forwarded_header(self):
        for headers in ({}, {"HTTP_X_FORWARDED_PROTO": "https"}):
            response = self.client.get("/", **headers)
            self.assertRedirects(response, "https://testserver/", fetch_redirect_response=False,
                                 status_code=301)

    def test_https_document_headers_and_host_rejection(self):
        response = self.client.get("/", secure=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Strict-Transport-Security"], "max-age=3600")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(self.client.get("/", secure=True, HTTP_HOST="evil.invalid").status_code, 400)

    def test_secure_csrf_cookie_and_mutation_rejection(self):
        client = Client(enforce_csrf_checks=True)
        response = client.get("/api/v2/csrf", secure=True)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.cookies["csrftoken"]["secure"])
        for headers in ({}, {"HTTP_ORIGIN": "https://evil.invalid"}):
            self.assertEqual(client.post("/api/v2/accounts/login", {}, secure=True,
                                         **headers).status_code, 403)

    def test_generic_error_pages_do_not_expose_debug_details(self):
        response = self.client.get("/unknown/", secure=True)
        self.assertEqual(response.status_code, 404)
        self.assertNotContains(response, "Using the URLconf", status_code=404)
        with patch("django.views.generic.TemplateView.get", side_effect=RuntimeError("private-detail")):
            with self.assertLogs("django.request", level="ERROR"):
                response = Client(raise_request_exception=False).get("/", secure=True)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(b"private-detail", response.content)

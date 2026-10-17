"""Account API tests: registration, login/logout, recovery, session security."""

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase

from .models import RecoveryToken

User = get_user_model()

PASSWORD = "long-and-uncommon-42"


class JsonClientMixin:
    def post_json(self, path, payload, **kwargs):
        return self.client.post(
            path, data=payload, content_type="application/json", **kwargs
        )


class RegistrationTests(JsonClientMixin, TestCase):
    def test_register_requires_verified_email_before_login(self):
        response = self.post_json("/api/v2/accounts/register", {
            "email": "New@Example.com", "password": PASSWORD,
        })
        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.json()["verificationRequired"])
        user = User.objects.get(email="new@example.com")
        self.assertTrue(user.ownership_scope)
        self.assertFalse(user.is_active)
        self.assertEqual(self.client.get("/api/v2/accounts/me").status_code, 401)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Confirm your Space Boxes email", mail.outbox[0].subject)
        token = self._token()
        verified = self.post_json("/api/v2/accounts/verify", {"token": token})
        self.assertEqual(verified.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertIsNotNone(user.email_verified_at)
        self.assertEqual(self.post_json("/api/v2/accounts/verify", {"token": token}).status_code, 400)
        login_response = self.post_json("/api/v2/accounts/login", {
            "email": user.email, "password": PASSWORD,
        })
        self.assertEqual(login_response.status_code, 200)

    def _token(self):
        from urllib.parse import parse_qs, urlparse
        link = next(line.split(": ", 1)[1] for line in mail.outbox[0].body.splitlines()
                    if line.startswith("Confirm your email: "))
        self.assertEqual(urlparse(link).scheme, "https")
        return parse_qs(urlparse(link).query)["verify"][0]

    def test_register_duplicate_is_generic(self):
        User.objects.create_user(email="taken@example.com", password=PASSWORD)
        known = self.post_json("/api/v2/accounts/register", {
            "email": "taken@example.com", "password": PASSWORD,
        })
        fresh = self.post_json("/api/v2/accounts/register", {
            "email": "available@example.com", "password": PASSWORD,
        })
        self.assertEqual(known.status_code, 202)
        self.assertEqual(known.json(), fresh.json())
        self.assertEqual(len(mail.outbox), 1)

    def test_register_rejects_weak_password_and_bad_email(self):
        for payload in (
            {"email": "not-an-email", "password": PASSWORD},
            {"email": "ok@example.com", "password": "short"},
            {"email": "ok@example.com"},
        ):
            with self.subTest(payload=payload):
                response = self.post_json("/api/v2/accounts/register", payload)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"]["code"], "validation")

    def test_invalid_verification_token(self):
        response = self.post_json("/api/v2/accounts/verify", {"token": "invalid"})
        self.assertEqual(response.status_code, 400)

    def test_resend_is_generic_for_unknown_account(self):
        self.post_json("/api/v2/accounts/register", {
            "email": "new@example.com", "password": PASSWORD,
        })
        first = self.post_json("/api/v2/accounts/verify/resend", {"email": "new@example.com"})
        unknown = self.post_json("/api/v2/accounts/verify/resend", {"email": "missing@example.com"})
        self.assertEqual(first.status_code, 202)
        self.assertEqual(unknown.status_code, 202)
        self.assertEqual(first.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 2)
        from .models import EmailVerificationToken
        self.assertEqual(EmailVerificationToken.objects.filter(user__email="new@example.com",
            used_at__isnull=True).count(), 1)

    def test_email_send_failure_rolls_back_new_account(self):
        from unittest.mock import patch
        with patch("accounts.api.send_verification_email", side_effect=OSError("SMTP unavailable")):
            response = self.post_json("/api/v2/accounts/register", {
                "email": "fail@example.com", "password": PASSWORD,
            })
        self.assertEqual(response.status_code, 503)
        self.assertFalse(User.objects.filter(email="fail@example.com").exists())


class LoginLogoutTests(JsonClientMixin, TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="u@example.com", password=PASSWORD
        )

    def login(self, password=PASSWORD):
        return self.post_json("/api/v2/accounts/login", {
            "email": "u@example.com", "password": password,
        })

    def test_login_success_and_failure_are_generic(self):
        ok = self.login()
        self.assertEqual(ok.status_code, 200)
        bad = self.login(password="wrong-password")
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.json()["error"]["code"], "invalid_credentials")

    def test_login_unknown_account_is_indistinguishable(self):
        response = self.post_json("/api/v2/accounts/login", {
            "email": "nobody@example.com", "password": "whatever-long",
        })
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "invalid_credentials")

    def test_inactive_account_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.login().status_code, 401)

    def test_logout_ends_session(self):
        self.login()
        self.assertEqual(self.client.get("/api/v2/accounts/me").status_code, 200)
        self.post_json("/api/v2/accounts/logout", {})
        self.assertEqual(self.client.get("/api/v2/accounts/me").status_code, 401)

    def test_logout_all_revokes_other_sessions(self):
        self.login()
        session_key = self.client.session.session_key
        self.client.cookies[f"spaceboxes_session"] = session_key
        self.post_json("/api/v2/accounts/logout-all", {})
        self.assertEqual(self.client.get("/api/v2/accounts/me").status_code, 401)
        from django.contrib.sessions.models import Session

        self.assertFalse(Session.objects.filter(pk=session_key).exists())

    def test_login_failure_throttles(self):
        for _ in range(10):
            self.login(password="wrong-password")
        response = self.login()  # correct password now also refused
        self.assertEqual(response.status_code, 401)


class RecoveryTests(JsonClientMixin, TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="r@example.com", password=PASSWORD
        )

    def request(self, email="r@example.com"):
        return self.post_json("/api/v2/accounts/recovery/request", {"email": email})

    def test_request_is_generic_for_unknown_email(self):
        known = self.request()
        unknown = self.request(email="ghost@example.com")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("single-use", mail.outbox[0].body)

    def test_confirm_changes_password_single_use_and_revokes_sessions(self):
        self.post_json("/api/v2/accounts/login", {
            "email": "r@example.com", "password": PASSWORD,
        })
        self.request()
        secret = self._extract_secret()
        response = self.post_json("/api/v2/accounts/recovery/confirm", {
            "token": secret, "password": "a-fresh-uncommon-99",
        })
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-fresh-uncommon-99"))
        # Old sessions revoked…
        self.assertEqual(self.client.get("/api/v2/accounts/me").status_code, 401)
        # …and the token cannot be replayed.
        replay = self.post_json("/api/v2/accounts/recovery/confirm", {
            "token": secret, "password": "another-uncommon-77",
        })
        self.assertEqual(replay.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password("another-uncommon-77"))

    def test_confirm_rejects_wrong_token(self):
        self.request()
        response = self.post_json("/api/v2/accounts/recovery/confirm", {
            "token": "bogus", "password": "a-fresh-uncommon-99",
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_token")

    def test_confirm_rate_limited(self):
        for _ in range(10):
            self.post_json("/api/v2/accounts/recovery/confirm", {
                "token": "bogus", "password": "a-fresh-uncommon-99",
            })
        response = self.post_json("/api/v2/accounts/recovery/confirm", {
            "token": "bogus", "password": "a-fresh-uncommon-99",
        })
        self.assertEqual(response.status_code, 429)

    def _extract_secret(self):
        import hashlib

        token = RecoveryToken.objects.get(user=self.user)
        for line in mail.outbox[0].body.splitlines():
            candidate = line.strip()
            if len(candidate) == 43 and hashlib.sha256(candidate.encode()).hexdigest() == token.token_hash:
                return candidate
        self.fail("secret not found in email")

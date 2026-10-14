"""Accounts model and recovery-policy tests (OD-011, ADR-004)."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from .models import RateLimitBucket, RecoveryToken
from .throttling import allowed_without_cost

User = get_user_model()


class RecoveryTokenTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="u@example.com", password="long-and-uncommon-42"
        )

    def test_issue_returns_secret_once_and_hashes_it(self):
        secret = RecoveryToken.issue(self.user)
        self.assertEqual(len(secret), 43)
        self.assertNotIn(secret, RecoveryToken.objects.get(user=self.user).token_hash)

    def test_find_valid_rejects_wrong_used_and_expired(self):
        secret = RecoveryToken.issue(self.user)
        self.assertIsNone(RecoveryToken.find_valid("wrong-secret"))
        self.assertIsNotNone(RecoveryToken.find_valid(secret))
        token = RecoveryToken.objects.get(user=self.user)
        token.used_at = timezone.now()
        token.save()
        self.assertIsNone(RecoveryToken.find_valid(secret))

    def test_find_valid_rejects_expired(self):
        secret = RecoveryToken.issue(self.user)
        RecoveryToken.objects.filter(user=self.user).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.assertIsNone(RecoveryToken.find_valid(secret))

    def test_consume_is_single_use_and_race_safe(self):
        RecoveryToken.issue(self.user)
        token = RecoveryToken.objects.get(user=self.user)
        self.assertTrue(token.consume())
        token.refresh_from_db()
        self.assertIsNotNone(token.used_at)
        self.assertFalse(token.consume())


class RateLimitTests(TestCase):
    KEY = "t"
    HOUR = timedelta(hours=1)

    def test_window_enforced_and_resets(self):
        for _ in range(3):
            self.assertTrue(RateLimitBucket.check_and_increment(self.KEY, 3, self.HOUR))
        self.assertFalse(RateLimitBucket.check_and_increment(self.KEY, 3, self.HOUR))
        bucket = RateLimitBucket.objects.get(key=self.KEY)
        bucket.window_start -= timedelta(hours=2)
        bucket.save()
        self.assertTrue(RateLimitBucket.check_and_increment(self.KEY, 3, self.HOUR))

    def test_peek_does_not_consume(self):
        for _ in range(2):
            self.assertTrue(allowed_without_cost("login", "user", "ip"))
        # Fill the login window (limit 10) directly, then peek must refuse.
        for _ in range(10):
            self.assertTrue(RateLimitBucket.check_and_increment("login:user:ip", 10, self.HOUR))
        self.assertFalse(allowed_without_cost("login", "user", "ip"))

"""PostgreSQL row-lock races. These tests deliberately require PostgreSQL."""
from datetime import timedelta
import threading
from django.db import connection, connections
from django.test import Client, TransactionTestCase
from .models import EmailVerificationToken, RateLimitBucket, User


class VerificationConcurrencyTests(TransactionTestCase):
    def race(self, action):
        self.assertEqual(connection.vendor, "postgresql", "Run concurrency gates on PostgreSQL")
        barrier = threading.Barrier(2)
        results = []
        def run(index):
            try:
                barrier.wait(timeout=10)
                results.append(action(index))
            except Exception as error:
                results.append(type(error).__name__)
            finally:
                connections.close_all()
        threads = [threading.Thread(target=run, args=(index,)) for index in range(2)]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=15)
        self.assertFalse(any(thread.is_alive() for thread in threads), "Deadlock in authentication operation")
        return results

    def test_different_tokens_for_same_account_have_one_winner(self):
        user = User.objects.create_user(email="race@example.com", password="private-test-password", is_active=False)
        tokens = [EmailVerificationToken.issue(user) for _ in range(2)]
        results = self.race(lambda index: Client().post("/api/v2/accounts/verify", {"token": tokens[index]}, content_type="application/json").status_code)
        self.assertCountEqual(results, [200, 400])
        self.assertFalse(EmailVerificationToken.objects.filter(used_at__isnull=True).exists())

    def test_first_throttle_requests_serialize(self):
        results = self.race(lambda _: RateLimitBucket.check_and_increment("race", 1, timedelta(hours=1)))
        self.assertCountEqual(results, [True, False])

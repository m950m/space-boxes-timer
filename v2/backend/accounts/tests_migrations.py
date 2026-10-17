"""Exercise the real additive migration, including established sessions."""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class VerificationMigrationTests(TransactionTestCase):
    def test_legacy_active_accounts_remain_active_and_inactive_stay_inactive(self):
        from django.contrib.auth import get_user_model
        active = get_user_model().objects.create_user(
            email="legacy@example.com", password="legacy-password-392!", is_active=True)
        self.client.force_login(active)
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial")])
        try:
            apps = executor.loader.project_state([("accounts", "0001_initial")]).apps
            User = apps.get_model("accounts", "User")
            active = User.objects.get(pk=active.pk)
            original_password = active.password
            inactive = User.objects.create(email="disabled@example.com", password="preserved", is_active=False)
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
            apps = executor.loader.project_state().apps
            User = apps.get_model("accounts", "User")
            active = User.objects.get(pk=active.pk)
            inactive = User.objects.get(pk=inactive.pk)
            self.assertTrue(active.is_active)
            self.assertIsNotNone(active.email_verified_at)
            self.assertEqual(active.password, original_password)
            self.assertFalse(inactive.is_active)
            self.assertIsNone(inactive.email_verified_at)
            response = self.client.get("/api/v2/accounts/me")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["account"]["email"], active.email)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())

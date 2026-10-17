"""Exercise the real additive migration, including established sessions."""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class VerificationMigrationTests(TransactionTestCase):
    def test_legacy_active_accounts_remain_active_and_inactive_stay_inactive(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial")])
        try:
            apps = executor.loader.project_state([("accounts", "0001_initial")]).apps
            User = apps.get_model("accounts", "User")
            active = User.objects.create(email="legacy@example.com", password="preserved", is_active=True)
            inactive = User.objects.create(email="disabled@example.com", password="preserved", is_active=False)
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
            apps = executor.loader.project_state().apps
            User = apps.get_model("accounts", "User")
            active = User.objects.get(pk=active.pk)
            inactive = User.objects.get(pk=inactive.pk)
            self.assertTrue(active.is_active)
            self.assertIsNotNone(active.email_verified_at)
            self.assertEqual(active.password, "preserved")
            self.assertFalse(inactive.is_active)
            self.assertIsNone(inactive.email_verified_at)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())

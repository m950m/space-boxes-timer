"""Narrow administration tests (FR-ADMIN-001, OD-010, AC-009).

Administrators get account-status support only; productivity content models
are not registered in the admin at all, so staff users have no default route
to task content, private notes or productivity history.
"""

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from productivity.models import Task
from productivity.services import create_scope_for_account

User = get_user_model()

PASSWORD = "long-and-uncommon-42"


class NarrowAdminTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin@example.com", password=PASSWORD
        )
        self.member = User.objects.create_user(
            email="member@example.com", password=PASSWORD
        )
        create_scope_for_account(self.member)
        from productivity.models import PlanDay
        import uuid

        day = PlanDay.objects.create(
            scope=self.member.ownership_scope, day_id="2026-10-14", timezone_name="UTC"
        )
        Task.objects.create(
            id=uuid.uuid4(),
            scope=self.member.ownership_scope,
            plan_day=day,
            title="Secret notes inside",
            planned_start="09:00",
            classification="extra",
        )
        self.client.force_login(self.admin)

    def test_productivity_models_are_not_registered(self):
        registered = {model.__name__ for model in admin.site._registry}
        self.assertIn("User", registered)
        for forbidden in ("Task", "ActualFocusSession", "ActivityEvidence",
                          "ReconciliationDecision", "TaskResource",
                          "ExposureRecord", "ReportPreferences"):
            self.assertNotIn(forbidden, registered)

    def test_admin_changelist_does_not_expose_task_content(self):
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "Secret notes inside")

    def test_productivity_admin_urls_do_not_exist(self):
        for route in ("/admin/productivity/task/",
                      "/admin/productivity/actualfocussession/",
                      "/admin/productivity/activityevidence/"):
            with self.subTest(route=route):
                self.assertEqual(self.client.get(route).status_code, 404)

    def test_account_status_support_is_available(self):
        response = self.client.get(
            reverse("admin:accounts_user_changelist")
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "member@example.com")

    def test_non_staff_cannot_enter_admin(self):
        self.client.force_login(self.member)
        response = self.client.get(reverse("admin:index"))
        # Login redirect for non-staff, not data.
        self.assertIn(response.status_code, (302, 403))

"""HTTP integration tests: auth boundaries, account isolation, data controls.

Every productivity endpoint resolves data through the authenticated account's
OwnershipScope. Cross-account access attempts must fail as if the records did
not exist. Mutating requests require the CSRF token (ADR-004).
"""

import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase

from productivity.models import OwnershipScope

User = get_user_model()

PASSWORD = "long-and-uncommon-42"
DAY = "2026-10-14"


class AuthenticatedJsonClient:
    """Small helper wrapping Django's test client with JSON + CSRF."""

    def __init__(self, client):
        self.client = client
        self.csrf = None

    def prime_csrf(self):
        response = self.client.get("/api/v2/csrf")
        self.csrf = response.json()["csrfToken"]
        return self.csrf

    def request(self, method, path, payload=None, **kwargs):
        headers = kwargs.pop("headers", {})
        if self.csrf:
            headers["HTTP_X_CSRFTOKEN"] = self.csrf
        return getattr(self.client, method)(
            path, data=payload, content_type="application/json", **headers, **kwargs
        )

    def get(self, path, **kwargs):
        return self.client.get(path, **kwargs)

    def post(self, path, payload, **kwargs):
        return self.request("post", path, payload, **kwargs)


def register(email="a@example.com", password=PASSWORD):
    """Create an independent actor with its own test client/session."""
    from django.test import Client

    client = Client()
    api = AuthenticatedJsonClient(client)
    api.prime_csrf()
    response = api.post("/api/v2/accounts/register", {"email": email, "password": password})
    assert response.status_code == 202, response.content
    from django.core import mail
    from urllib.parse import parse_qs, urlparse
    link = next(line.split(": ", 1)[1] for line in mail.outbox[-1].body.splitlines()
                if line.startswith("Confirm your email: "))
    token = parse_qs(urlparse(link).query)["verify"][0]
    verified = api.post("/api/v2/accounts/verify", {"token": token})
    assert verified.status_code == 200, verified.content
    logged_in = api.post("/api/v2/accounts/login", {"email": email, "password": password})
    assert logged_in.status_code == 200, logged_in.content
    api.prime_csrf()
    return api


class SyncBoundaryTests(TestCase):
    def setUp(self):
        self.alice = register("alice@example.com")
        self.push_day(self.alice, DAY)

    def push_day(self, api, day_id):
        return api.post("/api/v2/sync/push", {
            "ops": [{"kind": "plan_day", "record": {"id": day_id, "timezone": "UTC"}}]
        })

    def test_unauthenticated_sync_is_401(self):
        from django.test import Client

        self.client = Client()
        for method, path in (("get", "/api/v2/sync/pull?since=0"),
                             ("post", "/api/v2/sync/push"),
                             ("post", "/api/v2/focus/command"),
                             ("get", "/api/v2/focus/state"),
                             ("get", "/api/v2/account/export")):
            with self.subTest(path=path):
                response = getattr(self.client, method)(path, data={} if method == "post" else None,
                                                        content_type="application/json")
                self.assertEqual(response.status_code, 401)

    def test_cross_account_records_are_invisible(self):
        alice_task = str(uuid.uuid4())
        item = str(uuid.uuid4())
        self.alice.post("/api/v2/sync/push", {"ops": [{
            "kind": "task",
            "record": {"id": alice_task, "planDayId": DAY, "title": "Alice work",
                       "plannedStart": "09:00", "classification": "primary",
                       "sessionPlan": [{"id": item, "activeMinutes": 25}]},
        }]})
        # Bob cannot see or mutate Alice's records.
        bob = register("bob@example.com")
        self.push_day(bob, DAY)
        feed = bob.get("/api/v2/sync/pull?since=0").json()
        self.assertEqual(feed["tasks"], [])
        # Bob cannot update a record he does not own: it does not exist in his
        # scope, so a non-zero base revision is refused as a conflict.
        stolen = bob.post("/api/v2/sync/push", {"ops": [{
            "kind": "task", "baseRevision": 1,
            "record": {"id": alice_task, "planDayId": DAY, "title": "Hijacked",
                       "plannedStart": "09:00", "classification": "primary",
                       "sessionPlan": [{"id": item, "activeMinutes": 25}]},
        }]})
        self.assertEqual(stolen.json()["results"][0]["status"], "rejected")
        self.assertEqual(stolen.json()["results"][0]["code"], "conflict")
        # Alice's record is untouched.
        alice_feed = self.alice.get("/api/v2/sync/pull?since=0").json()
        alice_titles = [t["title"] for t in alice_feed["tasks"]]
        self.assertIn("Alice work", alice_titles)
        self.assertNotIn("Hijacked", alice_titles)

    def test_focus_command_requires_authentication(self):
        from django.test import Client

        response = Client().post("/api/v2/focus/command", {"type": "start"},
                                 content_type="application/json")
        self.assertEqual(response.status_code, 401)

    def test_push_requires_csrf_token(self):
        from django.test import Client

        bare = Client(enforce_csrf_checks=True)
        bare.get("/api/v2/csrf")
        response = bare.post(
            "/api/v2/sync/push",
            data='{"ops": []}', content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


class FocusHttpTests(TestCase):
    def setUp(self):
        self.api = register("f@example.com")
        self.api.post("/api/v2/sync/push", {
            "ops": [{"kind": "plan_day", "record": {"id": DAY, "timezone": "UTC"}}]
        })
        self.task_id, self.item_id = str(uuid.uuid4()), str(uuid.uuid4())
        self.api.post("/api/v2/sync/push", {"ops": [{
            "kind": "task",
            "record": {"id": self.task_id, "planDayId": DAY, "title": "Focus work",
                       "plannedStart": "09:00", "classification": "primary",
                       "sessionPlan": [{"id": self.item_id, "activeMinutes": 25}]},
        }]})

    def test_start_pause_end_over_http(self):
        state = self.api.post("/api/v2/focus/command", {
            "type": "start", "id": str(uuid.uuid4()), "contextId": "web",
            "at": 1760000000000, "expectedRevision": 0,
            "sessionId": str(uuid.uuid4()), "taskId": self.task_id,
            "plannedItemId": self.item_id, "timezone": "UTC",
            "evidenceId": str(uuid.uuid4()),
        })
        self.assertEqual(state.status_code, 200)
        revision = state.json()["revision"]
        state = self.api.post("/api/v2/focus/command", {
            "type": "pause", "id": str(uuid.uuid4()), "contextId": "web",
            "at": 1760000600000, "expectedRevision": revision,
            "evidenceId": str(uuid.uuid4()),
            "observation": {"at": 1760000600000, "certainty": "confirmed",
                            "elapsedMs": 600000},
        })
        self.assertEqual(state.status_code, 200)
        # Observer state endpoint mirrors without control.
        mirror = self.api.get("/api/v2/focus/state").json()
        self.assertEqual(mirror["reservation"]["state"], "paused")

    def test_stale_revision_over_http_is_409(self):
        response = self.api.post("/api/v2/focus/command", {
            "type": "start", "id": str(uuid.uuid4()), "contextId": "web",
            "at": 1760000000000, "expectedRevision": 99,
            "sessionId": str(uuid.uuid4()), "taskId": self.task_id,
            "plannedItemId": self.item_id, "timezone": "UTC",
            "evidenceId": str(uuid.uuid4()),
        })
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "stale_revision")


class DataControlTests(TestCase):
    def setUp(self):
        self.api = register("d@example.com")
        self.scope = OwnershipScope.objects.get(account__email="d@example.com")
        self.api.post("/api/v2/sync/push", {
            "ops": [
                {"kind": "plan_day", "record": {"id": DAY, "timezone": "UTC"}},
                {"kind": "task", "record": {
                    "id": str(uuid.uuid4()), "planDayId": DAY, "title": "Exported",
                    "plannedStart": "09:00", "classification": "extra",
                    "sessionPlan": [{"id": str(uuid.uuid4()), "activeMinutes": 25}],
                }},
            ]
        })

    def test_export_requires_authentication(self):
        from django.test import Client

        self.assertEqual(Client().get("/api/v2/account/export").status_code, 401)

    def test_export_contains_account_data_only(self):
        other = register("e@example.com")
        other.post("/api/v2/sync/push", {
            "ops": [
                {"kind": "plan_day", "record": {"id": DAY, "timezone": "UTC"}},
                {"kind": "task", "record": {
                    "id": str(uuid.uuid4()), "planDayId": DAY, "title": "Other account",
                    "plannedStart": "09:00", "classification": "extra",
                    "sessionPlan": [{"id": str(uuid.uuid4()), "activeMinutes": 25}],
                }},
            ]
        })
        response = self.api.get("/api/v2/account/export")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        payload = response.json()
        self.assertEqual(payload["format"], "space-boxes-v2-export/1")
        titles = [t["title"] for t in payload["tasks"]]
        self.assertIn("Exported", titles)
        self.assertNotIn("Other account", titles)

    def test_delete_requires_password_confirmation(self):
        no_password = self.api.post("/api/v2/account/delete", {})
        self.assertEqual(no_password.status_code, 403)
        wrong = self.api.post("/api/v2/account/delete", {"password": "wrong"})
        self.assertEqual(wrong.status_code, 403)

    def test_delete_removes_data_and_account(self):
        response = self.api.post("/api/v2/account/delete", {"password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            User.objects.filter(email="d@example.com").exists()
        )
        self.assertFalse(OwnershipScope.objects.filter(pk=self.scope.pk).exists())
        self.assertEqual(self.api.client.get("/api/v2/accounts/me").status_code, 401)


class V1IsolationTests(TestCase):
    def test_v1_surface_unchanged(self):
        """The V1 static surface stays on its original routes."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        # The Higgsfield design is the V2 root; the previous planner remains accessible
        # for rollback but is not the main user experience.
        self.assertContains(response, "space-boxes-new.js")
        self.assertContains(self.client.get("/classic"), "Local planner")

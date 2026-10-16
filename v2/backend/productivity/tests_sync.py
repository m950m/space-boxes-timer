"""Synchronization tests: idempotency, conflicts, isolation, history upload.

Covers the FR/workflow acceptance areas: task/planned-item identity,
revisions and conflict detection, duplicate prevention on retries, account
isolation, primary cap, append-only history, non-destructive connection
provenance, and export/deletion permissions.
"""

import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase

from common.json import ApiError
from productivity.models import OwnershipScope
from productivity.sync import SyncService

User = get_user_model()

PASSWORD = "long-and-uncommon-42"
DAY = "2026-10-14"
T0 = 1760000000000  # epoch ms base


def make_scope(email="s@example.com"):
    user = User.objects.create_user(email=email, password=PASSWORD)
    return OwnershipScope.objects.create(account=user)


def day_op(day_id=DAY, timezone="Europe/Berlin"):
    return {"kind": "plan_day", "record": {"id": day_id, "timezone": timezone}}


def task_record(**overrides):
    item_id, break_id = str(uuid.uuid4()), str(uuid.uuid4())
    record = {
        "id": str(uuid.uuid4()),
        "planDayId": DAY,
        "title": "Write tests",
        "plannedStart": "2026-10-14T09:00",
        "classification": "extra",
        "sessionPlan": [{"id": item_id, "activeMinutes": 25}],
        "originScopeKey": "local:abc",
    }
    record.update(overrides)
    return record


def push(scope, *ops):
    return SyncService(scope).push(list(ops))


class PlanDayTests(TestCase):
    def setUp(self):
        self.scope = make_scope()

    def test_create_then_duplicate_is_idempotent(self):
        first = push(self.scope, day_op())
        second = push(self.scope, day_op())
        self.assertEqual(first["results"][0]["status"], "accepted")
        self.assertEqual(second["results"][0]["status"], "duplicate")
        self.assertEqual(first["results"][0]["record"], second["results"][0]["record"])

    def test_scope_isolation_on_day_identity(self):
        other = make_scope("other@example.com")
        push(self.scope, day_op())
        result = push(other, day_op(timezone="UTC"))
        self.assertEqual(result["results"][0]["status"], "accepted")


class TaskSyncTests(TestCase):
    def setUp(self):
        self.scope = make_scope()
        push(self.scope, day_op())

    def accepted(self, *ops):
        result = push(self.scope, *ops)
        for row in result["results"]:
            self.assertEqual(row["status"], "accepted", row)
        return result

    def test_task_create_and_retry_idempotency(self):
        record = task_record()
        first = push(self.scope, {"kind": "task", "record": record})
        self.assertEqual(first["results"][0]["status"], "accepted")
        payload = first["results"][0]["record"]
        self.assertEqual(payload["title"], "Write tests")
        self.assertEqual(payload["sessionPlan"][0]["activeMinutes"], 25)
        self.assertEqual(payload["originScopeKey"], "local:abc")
        retry = push(self.scope, {"kind": "task", "record": record})
        self.assertEqual(retry["results"][0]["status"], "duplicate")
        # The canonical record comes back so the client can acknowledge it.
        self.assertEqual(retry["results"][0]["record"]["id"], record["id"])

    def test_stale_edit_is_conflict_not_last_write_wins(self):
        record = task_record()
        created = push(self.scope, {"kind": "task", "record": record})
        revision = created["results"][0]["record"]["recordRevision"]
        v2 = push(self.scope, {"kind": "task", "baseRevision": revision,
                               "record": {**record, "title": "Second edit"}})
        self.assertEqual(v2["results"][0]["status"], "accepted")
        # The stale first-party edit must be rejected with the server record.
        stale = push(self.scope, {"kind": "task", "baseRevision": revision,
                                  "record": {**record, "title": "Stale edit"}})
        self.assertEqual(stale["results"][0]["status"], "conflict")
        self.assertEqual(stale["results"][0]["record"]["title"], "Second edit")

    def scope_revision(self):
        from productivity.models import OwnershipScope

        return OwnershipScope.objects.get(pk=self.scope.pk).revision

    def test_identical_update_is_duplicate_without_revision_bump(self):
        record = task_record()
        created = push(self.scope, {"kind": "task", "record": record})
        revision = created["results"][0]["record"]["recordRevision"]
        before = self.scope_revision()
        no_op = push(self.scope, {"kind": "task", "baseRevision": revision,
                                  "record": {**record}})
        self.assertEqual(no_op["results"][0]["status"], "duplicate")
        self.assertEqual(no_op["results"][0]["record"]["recordRevision"], revision)
        self.assertEqual(self.scope_revision(), before,
                         "a no-op push must not enter the change feed")

    def test_accepted_edit_retried_with_stale_base_is_duplicate_not_conflict(self):
        # Lost acknowledgement: the first edit was applied server-side but the
        # client never recorded it. The retry carries the stale base and the
        # identical content, so the end state already matches.
        record = task_record()
        created = push(self.scope, {"kind": "task", "record": record})
        revision = created["results"][0]["record"]["recordRevision"]
        edited = push(self.scope, {"kind": "task", "baseRevision": revision,
                                   "record": {**record, "title": "Second edit"}})
        self.assertEqual(edited["results"][0]["status"], "accepted")
        retry = push(self.scope, {"kind": "task", "baseRevision": revision,
                                  "record": {**record, "title": "Second edit"}})
        self.assertEqual(retry["results"][0]["status"], "duplicate")
        self.assertEqual(retry["results"][0]["record"]["title"], "Second edit")
        self.assertEqual(retry["results"][0]["record"]["recordRevision"], revision + 1)

    def test_content_only_edits_are_new_revisions_not_duplicates(self):
        record = task_record(resources=[{"url": "https://example.com/a"}])
        created = push(self.scope, {"kind": "task", "record": record})
        revision = created["results"][0]["record"]["recordRevision"]
        before = self.scope_revision()
        cases = [
            {**record, "resources": [{"url": "https://example.com/a", "label": "Docs"}]},
            {**record, "note": "now annotated"},
            {**record, "completedAt": T0 + 5000},
            {**record, "sessionPlan": list(reversed(record["sessionPlan"]))},
        ]
        for index, changed in enumerate(cases):
            with self.subTest(case=index):
                result = push(self.scope, {"kind": "task", "baseRevision": revision,
                                           "record": changed})
                self.assertEqual(result["results"][0]["status"], "accepted", result)
                revision = result["results"][0]["record"]["recordRevision"]
        self.assertGreater(self.scope_revision(), before,
                           "each content edit must enter the change feed")

    def test_break_retirement_is_detected_as_content_change(self):
        break_id = str(uuid.uuid4())
        record = task_record(sessionPlan=[{"id": str(uuid.uuid4()), "activeMinutes": 25},
                                          {"id": str(uuid.uuid4()), "activeMinutes": 15}])
        record["plannedBreaks"] = [{"id": break_id, "breakMinutes": 5,
                                    "afterFocusItemId": record["sessionPlan"][0]["id"],
                                    "beforeFocusItemId": record["sessionPlan"][1]["id"]}]
        created = push(self.scope, {"kind": "task", "record": record})
        revision = created["results"][0]["record"]["recordRevision"]
        retired = {**record, "plannedBreaks": [],
                   "retiredPlannedBreaks": record["plannedBreaks"]}
        result = push(self.scope, {"kind": "task", "baseRevision": revision, "record": retired})
        self.assertEqual(result["results"][0]["status"], "accepted", result)
        payload = result["results"][0]["record"]
        self.assertEqual([b["id"] for b in payload.get("retiredPlannedBreaks") or []], [break_id])

    def test_fractional_durations_survive_synchronization(self):
        """Integration finding 2026-10-15: the approved domain accepts any
        positive finite minute value; the server previously rejected or lost
        fractional durations, so a locally valid task could never synchronize."""
        fractional = str(uuid.uuid4())
        integer = str(uuid.uuid4())
        record = task_record(sessionPlan=[{"id": fractional, "activeMinutes": 0.5},
                                          {"id": integer, "activeMinutes": 25}])
        record["plannedBreaks"] = [{"id": str(uuid.uuid4()), "breakMinutes": 2.5,
                                    "afterFocusItemId": fractional,
                                    "beforeFocusItemId": integer}]
        created = push(self.scope, {"kind": "task", "record": record})
        self.assertEqual(created["results"][0]["status"], "accepted", created)
        payload = created["results"][0]["record"]
        self.assertEqual(payload["sessionPlan"][0]["activeMinutes"], 0.5)
        self.assertEqual(payload["plannedBreaks"][0]["breakMinutes"], 2.5)
        # An identical retry stays a duplicate; the fractional content matches.
        retry = push(self.scope, {"kind": "task", "record": record})
        self.assertEqual(retry["results"][0]["status"], "duplicate")
        # A fractional edit against the accepted revision is a new revision.
        revision = payload["recordRevision"]
        edited = push(self.scope, {"kind": "task", "baseRevision": revision,
                                   "record": {**record,
                                              "sessionPlan": [{"id": fractional, "activeMinutes": 12.5},
                                                              {"id": integer, "activeMinutes": 25}]}})
        self.assertEqual(edited["results"][0]["status"], "accepted", edited)
        # The stale base stays a conflict for fractional content too.
        stale = push(self.scope, {"kind": "task", "baseRevision": revision,
                                  "record": {**record,
                                             "sessionPlan": [{"id": fractional, "activeMinutes": 0.75},
                                                             {"id": integer, "activeMinutes": 25}]}})
        self.assertEqual(stale["results"][0]["status"], "conflict")

    def test_zero_and_non_numeric_durations_are_rejected(self):
        for minutes in (0, -1, "25", None, True):
            record = task_record(sessionPlan=[{"id": str(uuid.uuid4()), "activeMinutes": minutes}])
            result = push(self.scope, {"kind": "task", "record": record})
            self.assertEqual(result["results"][0]["status"], "rejected", minutes)

    def test_malformed_record_identities_reject_their_own_op(self):
        """A non-UUID client identity is a malformed payload: it must reject
        its own op, never fail the whole push batch with a server error."""
        valid_record = task_record()
        result = push(self.scope,
                      {"kind": "task", "record": {**task_record(), "id": "orphan-task"}},
                      {"kind": "task", "record": valid_record})
        self.assertEqual(result["results"][0]["status"], "rejected")
        self.assertEqual(result["results"][0]["code"], "validation")
        self.assertIn("not a valid UUID", result["results"][0]["message"])
        self.assertEqual(result["results"][1]["status"], "accepted",
                         "a malformed op must not fail the rest of the batch")

    def test_pull_returns_session_plan_in_plan_order(self):
        first, second = str(uuid.uuid4()), str(uuid.uuid4())
        record = task_record(sessionPlan=[{"id": first, "activeMinutes": 25},
                                          {"id": second, "activeMinutes": 15}])
        created = push(self.scope, {"kind": "task", "record": record})
        revision = created["results"][0]["record"]["recordRevision"]
        reordered = {**record,
                     "sessionPlan": [{"id": second, "activeMinutes": 15},
                                     {"id": first, "activeMinutes": 25}]}
        push(self.scope, {"kind": "task", "baseRevision": revision, "record": reordered})
        feed = SyncService(self.scope).pull(0)
        payload = next(task for task in feed["tasks"] if task["id"] == record["id"])
        self.assertEqual([item["id"] for item in payload["sessionPlan"]], [second, first],
                         "pulled plan order must follow stored positions, not record identity")

    def test_missing_task_with_nonzero_base_is_conflict(self):
        result = push(self.scope, {"kind": "task", "baseRevision": 3,
                                   "record": task_record()})
        self.assertEqual(result["results"][0]["status"], "rejected")
        self.assertEqual(result["results"][0]["code"], "conflict")

    def test_task_requires_known_plan_day(self):
        result = push(self.scope, {"kind": "task",
                                   "record": task_record(planDayId="2099-01-01")})
        self.assertEqual(result["results"][0]["code"], "unknown_plan_day")

    def test_primary_cap_enforced(self):
        from productivity.models import Task

        days = push(self.scope, day_op())  # one shared day
        records = [task_record(classification="primary") for _ in range(4)]
        result = push(self.scope, *[{"kind": "task", "record": r} for r in records[:3]])
        self.assertTrue(all(r["status"] == "accepted" for r in result["results"]))
        fourth = push(self.scope, {"kind": "task", "record": records[3]})
        self.assertEqual(fourth["results"][0]["status"], "rejected")
        self.assertEqual(fourth["results"][0]["code"], "primary_cap")
        self.assertEqual(Task.objects.filter(scope=self.scope).count(), 3)

    def test_validation_rejections_report_reasons(self):
        cases = {
            "title": task_record(title="  "),
            "plannedStart": task_record(plannedStart=None),
            "classification": task_record(classification="urgent"),
            "sessionPlan": task_record(sessionPlan=[]),
        }
        for field, record in cases.items():
            with self.subTest(field=field):
                result = push(self.scope, {"kind": "task", "record": record})
                self.assertEqual(result["results"][0]["status"], "rejected")
                self.assertEqual(result["results"][0]["code"], "validation")

    def test_task_referencing_missing_parent_rejected(self):
        record = task_record(parentTaskId=str(uuid.uuid4()))
        result = push(self.scope, {"kind": "task", "record": record})
        self.assertEqual(result["results"][0]["code"], "validation")

    def test_cycle_rejected(self):
        parent = task_record(title="Parent")
        child = task_record(title="Child")
        push(self.scope, {"kind": "task", "record": parent})
        push(self.scope, {"kind": "task", "record": child})
        # child becomes a subtask of parent (accepted).
        push(self.scope, {"kind": "task", "baseRevision": 1,
                          "record": {**child, "parentTaskId": parent["id"]}})
        # Now parent under its own subtask must be rejected as a cycle.
        result = push(self.scope, {"kind": "task", "baseRevision": 1,
                                   "record": {**parent, "parentTaskId": child["id"]}})
        self.assertEqual(result["results"][0]["code"], "validation")
        self.assertIn("cycle", result["results"][0]["message"])

    def test_partial_batch_reports_each_op_independently(self):
        good, bad = task_record(title="Good"), task_record(title=" ")
        result = push(self.scope,
                      {"kind": "task", "record": good},
                      {"kind": "task", "record": bad},
                      {"kind": "task", "record": good})  # retry of the good one
        statuses = [r["status"] for r in result["results"]]
        self.assertEqual(statuses, ["accepted", "rejected", "duplicate"])


class SessionHistoryUploadTests(TestCase):
    """Historical evidence upload: append-only, validated, duplicate-free."""

    def setUp(self):
        self.scope = make_scope()
        push(self.scope, day_op())
        self.item = task_record()["sessionPlan"][0]

    def ended_session_op(self, session_id=None, focus_ms=1_500_000, start_ms=T0):
        session_id = session_id or str(uuid.uuid4())
        evidence_id = str(uuid.uuid4())
        return session_id, {
            "kind": "session",
            "record": {
                "id": session_id,
                "taskId": self.task_id,
                "plannedItemId": self.item["id"],
                "startingSnapshot": {"planDayId": DAY, "title": "T", "classification": "extra",
                                     "timezone": "UTC", "plannedStart": "09:00",
                                     "plannedItemId": self.item["id"], "activeMinutes": 25},
                "targetMs": 1_500_000,
                "actualStart": start_ms,
                "ending": {
                    "recordedAt": start_ms + focus_ms,
                    "outcome": "completed",
                    "point": None,
                },
                "evidence": [{
                    "id": evidence_id,
                    "sessionId": session_id,
                    "kind": "focus",
                    "startAt": start_ms,
                    "endAt": start_ms + focus_ms,
                    "elapsedMs": focus_ms,
                    "continuity": "confirmed",
                    "originContextId": "ctx",
                    "controlVersion": 1,
                }],
                "authorityChanges": [{
                    "id": str(uuid.uuid4()), "sessionId": session_id, "type": "start",
                    "at": start_ms, "originContextId": "ctx", "version": 1,
                    "priorControlVersion": None, "resultingControlVersion": 1,
                }],
            },
        }

    @classmethod
    def setUpTestData(cls):
        pass

    def test_ended_session_upload_then_retry_duplicate(self):
        self._create_task()
        session_id, op = self.ended_session_op()
        first = push(self.scope, op)
        self.assertEqual(first["results"][0]["status"], "accepted")
        retry = push(self.scope, op)
        self.assertEqual(retry["results"][0]["status"], "duplicate")

    def test_open_session_rejected(self):
        self._create_task()
        _, op = self.ended_session_op()
        record = op["record"]
        record = {**record, "ending": None}
        record["evidence"] = [{**record["evidence"][0], "endAt": None, "elapsedMs": None,
                               "continuity": None}]
        result = push(self.scope, {"kind": "session", "record": record})
        self.assertEqual(result["results"][0]["status"], "rejected")
        self.assertIn("open evidence", result["results"][0]["message"])

    def test_completion_requires_sufficient_focus(self):
        self._create_task()
        _, op = self.ended_session_op(focus_ms=100_000)
        op["record"]["targetMs"] = 1_500_000
        result = push(self.scope, op)
        self.assertEqual(result["results"][0]["status"], "rejected")

    def test_timeline_must_start_at_actual_start(self):
        self._create_task()
        _, op = self.ended_session_op()
        op["record"]["actualStart"] = T0 - 5
        result = push(self.scope, op)
        self.assertEqual(result["results"][0]["status"], "rejected")
        self.assertIn("starting evidence", result["results"][0]["message"])

    def _create_task(self):
        from productivity.models import Task

        record = task_record()
        push(self.scope, {"kind": "task", "record": record})
        self.task_id = record["id"]
        self.item = record["sessionPlan"][0]

    def test_cross_scope_session_reference_rejected(self):
        self._create_task()
        other = make_scope("other2@example.com")
        push(other, day_op())
        _, op = self.ended_session_op()
        result = push(other, op)  # task lives in the first scope
        self.assertEqual(result["results"][0]["status"], "rejected")


class PullTests(TestCase):
    def setUp(self):
        self.scope = make_scope()
        push(self.scope, day_op())

    def test_pull_change_feed_since_revision(self):
        record = task_record()
        push(self.scope, {"kind": "task", "record": record})
        feed = SyncService(self.scope).pull(0)
        self.assertEqual(feed["scopeRevision"], self.scope.revision)
        ids = [t["id"] for t in feed["tasks"]]
        self.assertIn(record["id"], ids)
        incremental = SyncService(self.scope).pull(self.scope.revision)
        self.assertEqual(incremental["tasks"], [])
        self.assertEqual(incremental["scopeRevision"], self.scope.revision)

    def test_pull_is_account_isolated(self):
        other = make_scope("island@example.com")
        record = task_record()
        push(self.scope, {"kind": "task", "record": record})
        feed = SyncService(other).pull(0)
        self.assertEqual(feed["tasks"], [])
        self.assertNotIn(record["id"], [t["id"] for t in feed["tasks"]])

"""Focus authority engine tests (ADR-006, FR-FOCUS-001/002).

Single reservation, stale revision rejection, controller exclusivity,
confirmed transfer, pause/resume semantics, auto-completion, reconciliation
and honest activity arithmetic mirroring activity-evidence.js.
"""

import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase

from common.json import ApiError
from productivity.focus import FocusEngine
from productivity.models import OwnershipScope
from productivity.sync import SyncService

User = get_user_model()

PASSWORD = "long-and-uncommon-42"
DAY = "2026-10-14"
T0 = 1760000000000


def make_scope(email="f@example.com"):
    user = User.objects.create_user(email=email, password=PASSWORD)
    return OwnershipScope.objects.create(account=user)


def seed(scope):
    SyncService(scope).push([
        {"kind": "plan_day", "record": {"id": DAY, "timezone": "UTC"}},
    ])
    item_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    SyncService(scope).push([
        {"kind": "task", "record": {
            "id": task_id, "planDayId": DAY, "title": "Deep work",
            "plannedStart": "09:00", "classification": "primary",
            "sessionPlan": [{"id": item_id, "activeMinutes": 25}],
        }},
    ])
    return task_id, item_id


def start_command(task_id, item_id, context="ctx-A", at=T0, revision=0,
                  session_id=None, evidence_id=None, command_id=None):
    return {
        "type": "start", "id": command_id or str(uuid.uuid4()),
        "contextId": context, "at": at, "expectedRevision": revision,
        "sessionId": session_id or str(uuid.uuid4()),
        "taskId": task_id, "plannedItemId": item_id,
        "timezone": "UTC", "evidenceId": evidence_id or str(uuid.uuid4()),
    }


class StartTests(TestCase):
    def setUp(self):
        self.scope = make_scope()
        self.task_id, self.item_id = seed(self.scope)

    def test_start_creates_reservation_running_evidence_and_authority(self):
        state = FocusEngine(self.scope).apply(
            start_command(self.task_id, self.item_id, revision=self.scope.focus_revision)
        )
        self.assertEqual(state["revision"], 1)
        self.assertEqual(state["reservation"]["state"], "running")
        self.assertEqual(state["reservation"]["controllerId"], "ctx-A")
        self.assertEqual(state["activity"]["confirmedActiveMs"], 0)
        self.assertEqual(state["session"]["startingSnapshot"]["planDayId"], DAY)

    def test_second_start_rejected_single_reservation(self):
        engine = FocusEngine(self.scope)
        engine.apply(start_command(self.task_id, self.item_id, revision=0))
        with self.assertRaises(ApiError) as caught:
            engine.apply(start_command(self.task_id, self.item_id, revision=1))
        self.assertEqual(caught.exception.code, "reservation_exists")

    def test_stale_revision_rejected(self):
        engine = FocusEngine(self.scope)
        engine.apply(start_command(self.task_id, self.item_id, revision=0))
        with self.assertRaises(ApiError) as caught:
            engine.apply(start_command(self.task_id, self.item_id, revision=0))
        self.assertEqual(caught.exception.code, "stale_revision")

    def test_boolean_revision_is_not_accepted(self):
        # Python's True == 1 must not smuggle a stale command through.
        engine = FocusEngine(self.scope)
        engine.apply(start_command(self.task_id, self.item_id, revision=0))
        with self.assertRaises(ApiError) as caught:
            engine.apply(start_command(self.task_id, self.item_id,
                                       revision=True, context="ctx-B"))
        self.assertEqual(caught.exception.code, "stale_revision")

    def test_duplicate_session_identity_rejected(self):
        engine = FocusEngine(self.scope)
        session_id = str(uuid.uuid4())
        engine.apply(start_command(self.task_id, self.item_id, revision=0,
                                   session_id=session_id))
        engine.scope.refresh_from_db()
        # End it, then try to reuse the identity.
        engine.apply({"type": "end", "id": str(uuid.uuid4()), "contextId": "ctx-A",
                      "at": T0 + 1000, "expectedRevision": 1,
                      "observation": {"at": T0 + 1000, "certainty": "confirmed",
                                      "elapsedMs": 1000}})
        engine.scope.refresh_from_db()
        with self.assertRaises(ApiError) as caught:
            engine.apply(start_command(self.task_id, self.item_id,
                                       revision=engine.scope.focus_revision,
                                       session_id=session_id))
        self.assertEqual(caught.exception.code, "duplicate_session")

    def test_retired_planned_item_cannot_start(self):
        from productivity.models import PlannedFocusItem

        PlannedFocusItem.objects.filter(pk=self.item_id).update(retired_at="2026-10-14T00:00:00Z")
        with self.assertRaises(ApiError) as caught:
            FocusEngine(self.scope).apply(
                start_command(self.task_id, self.item_id, revision=0)
            )
        self.assertEqual(caught.exception.code, "validation")


class ControlTests(TestCase):
    def setUp(self):
        self.scope = make_scope()
        self.task_id, self.item_id = seed(self.scope)
        self.engine = FocusEngine(self.scope)
        self.engine.apply(start_command(self.task_id, self.item_id, revision=0))
        self.scope.refresh_from_db()

    def command(self, ctype, **overrides):
        at = overrides.pop("at", T0 + 60_000)
        observation = overrides.pop("observation", None) or {
            "at": at, "certainty": "confirmed", "elapsedMs": at - T0,
        }
        command = {
            "type": ctype, "id": str(uuid.uuid4()), "contextId": "ctx-A",
            "at": at, "expectedRevision": self.scope.focus_revision,
            "evidenceId": str(uuid.uuid4()),
            "observation": observation,
        }
        command.update(overrides)
        return command

    def refresh(self):
        self.scope.refresh_from_db()

    def test_pause_resume_flow_preserves_reservation(self):
        self.engine.apply(self.command("pause"))
        self.refresh()
        state = self.engine.apply(self.command("resume", at=T0 + 120_000))
        self.refresh()
        self.assertEqual(state["reservation"]["state"], "running")
        self.assertEqual(state["activity"]["confirmedActiveMs"], 60_000)

    def test_double_pause_rejected(self):
        self.engine.apply(self.command("pause"))
        self.refresh()
        with self.assertRaises(ApiError) as caught:
            self.engine.apply(self.command("pause", at=T0 + 90_000))
        self.assertEqual(caught.exception.code, "invalid_state")

    def test_observing_controller_rejected(self):
        with self.assertRaises(ApiError) as caught:
            self.engine.apply(self.command("pause", contextId="ctx-B"))
        self.assertEqual(caught.exception.code, "stale_controller")

    def test_transfer_requires_confirmation_and_moves_control(self):
        with self.assertRaises(ApiError) as caught:
            self.engine.apply(self.command("transfer", contextId="ctx-B"))
        self.assertEqual(caught.exception.code, "validation")
        state = self.engine.apply(self.command("transfer", contextId="ctx-B", confirmed=True))
        self.refresh()
        self.assertEqual(state["reservation"]["controllerId"], "ctx-B")
        # Former controller cannot act anymore.
        with self.assertRaises(ApiError) as caught:
            self.engine.apply(self.command("pause"))
        self.assertEqual(caught.exception.code, "stale_controller")
        # New controller can.
        self.engine.apply(self.command("pause", contextId="ctx-B"))
        self.refresh()

    def test_end_records_ended_early_with_derived_duration(self):
        state = self.engine.apply(self.command("end"))
        self.refresh()
        self.assertIsNone(state["reservation"])
        self.assertEqual(state["session"]["ending"]["outcome"], "ended-early")
        self.assertEqual(state["activity"]["confirmedActiveMs"], 60_000)
        # Reservation is gone; new Start is possible.
        state = self.engine.apply(
            start_command(self.task_id, self.item_id,
                          revision=self.scope.focus_revision)
        )
        self.refresh()
        self.assertEqual(state["reservation"]["state"], "running")

    def test_auto_completion_at_target(self):
        # 25-minute target: 20 confirmed minutes, resume, then 5 more.
        self.engine.apply(self.command("pause", at=T0 + 1_200_000,
                                       observation={"at": T0 + 1_200_000,
                                                    "certainty": "confirmed",
                                                    "elapsedMs": 1_200_000}))
        self.refresh()
        self.engine.apply(self.command("resume", at=T0 + 1_200_000,
                                       observation={"at": T0 + 1_200_000,
                                                    "certainty": "confirmed",
                                                    "elapsedMs": 0}))
        self.refresh()
        state = self.engine.apply(self.command("end", at=T0 + 1_500_000,
                                               observation={"at": T0 + 1_500_000,
                                                            "certainty": "confirmed",
                                                            "elapsedMs": 300_000}))
        self.refresh()
        self.assertEqual(state["session"]["ending"]["outcome"], "completed")
        self.assertEqual(state["activity"]["confirmedActiveMs"], 1_500_000)
        self.assertEqual(state["activity"]["remainingMs"], 0)
        self.assertIsNone(state["reservation"])

    def test_uncertain_continuity_not_credited_as_focus(self):
        state = self.engine.apply(self.command("pause", at=T0 + 300_000, observation={
            "at": T0 + 300_000, "certainty": "uncertain", "elapsedMs": 300_000,
            "reason": "sleep",
        }))
        self.refresh()
        self.assertEqual(state["activity"]["confirmedActiveMs"], 0)
        from productivity.models import ActivityEvidence

        evidence = ActivityEvidence.objects.get(session__scope=self.scope,
                                                control_version=1)
        self.assertEqual(evidence.kind, "uncertain")
        self.assertEqual(evidence.reason, "sleep")


class ReconcileTests(TestCase):
    def setUp(self):
        self.scope = make_scope()
        self.task_id, self.item_id = seed(self.scope)
        self.engine = FocusEngine(self.scope)
        self.engine.apply(start_command(self.task_id, self.item_id, revision=0))
        self.scope.refresh_from_db()
        # Close the focus interval as uncertain (5 min gap).
        self.engine.apply({
            "type": "pause", "id": str(uuid.uuid4()), "contextId": "ctx-A",
            "at": T0 + 300_000, "expectedRevision": self.scope.focus_revision,
            "evidenceId": str(uuid.uuid4()),
            "observation": {"at": T0 + 300_000, "certainty": "uncertain",
                            "elapsedMs": 300_000, "reason": "disconnect"},
        })
        self.scope.refresh_from_db()

    def evidence_id(self):
        from productivity.models import ActivityEvidence

        return str(ActivityEvidence.objects.get(session__scope=self.scope, kind="uncertain").pk)

    def test_reconcile_confirmed_work_counts_and_duplicate_rejected(self):
        state = self.engine.apply({
            "type": "reconcile", "id": str(uuid.uuid4()), "contextId": "ctx-A",
            "at": T0 + 400_000, "expectedRevision": self.scope.focus_revision,
            "evidenceId": self.evidence_id(), "elapsedMs": 300_000,
            "parts": [{"kind": "focus", "elapsedMs": 200_000},
                      {"kind": "interruption", "elapsedMs": 100_000, "episodeId": "ep1"}],
        })
        self.scope.refresh_from_db()
        self.assertEqual(state["activity"]["confirmedActiveMs"], 200_000)
        self.assertEqual(state["activity"]["interruptionMs"], 100_000)
        self.assertEqual(state["activity"]["interruptionCount"], 1)
        with self.assertRaises(ApiError) as caught:
            self.engine.apply({
                "type": "reconcile", "id": str(uuid.uuid4()), "contextId": "ctx-A",
                "at": T0 + 500_000, "expectedRevision": self.scope.focus_revision,
                "evidenceId": self.evidence_id(), "elapsedMs": 300_000,
                "parts": [{"kind": "focus", "elapsedMs": 300_000}],
            })
        self.assertEqual(caught.exception.code, "duplicate_decision")

    def test_reconcile_parts_must_total_elapsed(self):
        with self.assertRaises(ApiError) as caught:
            self.engine.apply({
                "type": "reconcile", "id": str(uuid.uuid4()), "contextId": "ctx-A",
                "at": T0 + 400_000, "expectedRevision": self.scope.focus_revision,
                "evidenceId": self.evidence_id(), "elapsedMs": 300_000,
                "parts": [{"kind": "focus", "elapsedMs": 100_000}],
            })
        self.assertIn("entire uncertain interval", caught.exception.message)

    def test_reconcile_completion_auto_ends(self):
        # A full-target uncertain interval confirmed as work by reconciliation
        # auto-completes the session and releases the reservation.
        scope = make_scope("rc@example.com")
        task_id, item_id = seed(scope)
        engine = FocusEngine(scope)
        engine.apply(start_command(task_id, item_id, revision=0))
        scope.refresh_from_db()
        engine.apply({
            "type": "pause", "id": str(uuid.uuid4()), "contextId": "ctx-A",
            "at": T0 + 1_500_000, "expectedRevision": scope.focus_revision,
            "evidenceId": str(uuid.uuid4()),
            "observation": {"at": T0 + 1_500_000, "certainty": "uncertain",
                            "elapsedMs": 1_500_000, "reason": "disconnect"},
        })
        scope.refresh_from_db()
        from productivity.models import ActivityEvidence

        uncertain = str(ActivityEvidence.objects.get(session__scope=scope, kind="uncertain").pk)
        state = engine.apply({
            "type": "reconcile", "id": str(uuid.uuid4()), "contextId": "ctx-A",
            "at": T0 + 1_600_000, "expectedRevision": scope.focus_revision,
            "evidenceId": uncertain, "elapsedMs": 1_500_000,
            "parts": [{"kind": "focus", "elapsedMs": 1_500_000}],
        })
        scope.refresh_from_db()
        self.assertEqual(state["session"]["ending"]["outcome"], "completed")
        self.assertEqual(state["activity"]["confirmedActiveMs"], 1_500_000)
        self.assertIsNone(state["reservation"])
        from productivity.models import AuthorityChange, FocusReservation

        self.assertFalse(FocusReservation.objects.filter(scope=scope).exists())
        change = AuthorityChange.objects.get(session__scope=scope, type="reconcile")
        self.assertIsNone(change.resulting_control_version)


class ConcurrencyTests(TransactionTestCase):
    """Two racing starts: exactly one wins; the loser gets a typed error.

    TransactionTestCase because racer threads use their own connections and
    must see committed seed rows.
    """

    def setUp(self):
        self.scope = make_scope()
        self.task_id, self.item_id = seed(self.scope)

    def test_concurrent_start_single_winner(self):
        from django.db import connections
        from common.json import ApiError as E

        results = []
        import threading

        barrier = threading.Barrier(2)

        def racer(name):
            barrier.wait()
            try:
                FocusEngine(self.scope).apply(
                    start_command(self.task_id, self.item_id, revision=0, context=name)
                )
                results.append(("ok", name))
            except E as exc:
                results.append((exc.code, name))
            except Exception as exc:  # surface unexpected thread failures
                results.append((f"unexpected:{exc!r}", name))
            finally:
                connections.close_all()

        threads = [threading.Thread(target=racer, args=(f"ctx-{i}",)) for i in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        codes = sorted(code for code, _ in results)
        self.assertEqual(codes[0], "ok")
        self.assertIn(codes[1], ("stale_revision", "reservation_exists"))
        from productivity.models import FocusReservation

        self.assertEqual(FocusReservation.objects.filter(scope=self.scope).count(), 1)

"""Server-side focus authority engine (ADR-005, ADR-006, FR-FOCUS-001/002).

Connected Start, Pause, Resume, End, transfer/takeover and Reconcile require
server acceptance. This module applies one command per scope inside a
serialized transaction, mirroring the local pure engine's invariants:

- At most one running-or-paused reservation per scope.
- Control-changing commands reference `expectedRevision` (the accepted
  authority version); stale references are rejected, never silently applied.
- Only the accepted controller may pause/resume/end/record its reservation;
  transfer requires explicit confirmation and reassigns control.
- Historical evidence is append-only; only an open boundary closes, once.
- Reaching the configured active target auto-completes the session.
- Late evidence from a former controller is accepted as history through sync,
  even though its stale control mutations are rejected here.

The activity arithmetic mirrors activity-evidence.js so accepted server facts
equal the locally derived ones. `focus_revision` on the scope is the accepted
authority version; connected clients adopt it as expectedRevision.
"""

from django.db import transaction

from common.json import ApiError, instant_ms, parse_instant

from .models import (
    ActivityEvidence, ActualFocusSession, AuthorityChange, FocusReservation,
    OwnershipScope, PlannedFocusItem, ReconciliationDecision, Task,
)
from . import serialization

COMMAND_TYPES = ("start", "record", "pause", "resume", "end", "transfer", "reconcile")


def require_reference(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ApiError("validation", f"{name} is required.", 400)
    return value


def require_non_negative_int(value, name):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ApiError("validation", f"{name} must be a non-negative integer.", 400)
    return value


def get_session_activity(session, evidence_rows, decisions_by_evidence):
    """Mirror activity-evidence.js getSessionActivity for one session."""
    confirmed_active_ms = 0
    pause_ms = 0
    interruption_ms = 0
    episodes = set()
    completion_point = None
    for evidence in sorted(evidence_rows, key=lambda row: (row.start_at, str(row.pk))):
        if evidence.end_at is None:
            continue
        decision = decisions_by_evidence.get(evidence.pk)
        if evidence.kind == "pause":
            duration = decision.elapsed_ms if decision else evidence.elapsed_ms
            if duration is not None:
                pause_ms += duration
            continue
        if evidence.kind == "uncertain" and decision is None:
            continue
        parts = decision.parts if decision else [{"kind": "focus", "elapsedMs": evidence.elapsed_ms}]
        total_elapsed = decision.elapsed_ms if decision else evidence.elapsed_ms
        offset_ms = 0
        for part in parts:
            if part.get("kind") == "interruption":
                interruption_ms += part.get("elapsedMs", 0)
                if part.get("elapsedMs", 0) > 0:
                    episodes.add(part.get("episodeId"))
            else:
                credit = min(part.get("elapsedMs", 0), session.target_ms - confirmed_active_ms)
                confirmed_active_ms += credit
                if not completion_point and confirmed_active_ms == session.target_ms:
                    ending_offset = offset_ms + credit
                    exact_clock = (
                        evidence.elapsed_ms is not None and total_elapsed is not None
                        and (evidence.end_at - evidence.start_at).total_seconds() * 1000 == total_elapsed
                    )
                    completion_point = {
                        "evidenceId": str(evidence.pk),
                        "decisionId": str(decision.pk) if decision else None,
                        "offsetMs": ending_offset,
                        "observedAt": instant_ms(evidence.end_at),
                        "at": instant_ms(evidence.start_at) + ending_offset if exact_clock else None,
                    }
            offset_ms += part.get("elapsedMs", 0)
    return {
        "confirmedActiveMs": confirmed_active_ms,
        "remainingMs": session.target_ms - confirmed_active_ms,
        "pauseMs": pause_ms,
        "interruptionMs": interruption_ms,
        "interruptionCount": len(episodes),
        "completionPoint": completion_point,
    }


class FocusEngine:
    """Applies one authoritative focus command within a locked scope."""

    def __init__(self, scope):
        self.scope = scope

    @transaction.atomic
    def apply(self, command):
        scope = OwnershipScope.objects.select_for_update().get(pk=self.scope.pk)
        self.scope = scope
        if not isinstance(command, dict):
            raise ApiError("validation", "Focus command must be an object.", 400)
        ctype = command.get("type")
        if ctype not in COMMAND_TYPES:
            raise ApiError("validation", "Unknown focus command type.", 400)
        for field in ("id", "contextId"):
            require_reference(command.get(field), f"command {field}")
        at = parse_instant(command.get("at"), "at")
        expected = command.get("expectedRevision")
        if isinstance(expected, bool) or not isinstance(expected, int) or expected != scope.focus_revision:
            raise ApiError(
                "stale_revision",
                "Stale focus revision; refresh the accepted authority state.",
                409,
            )
        context_id = command["contextId"]
        reservation = FocusReservation.objects.select_for_update().filter(scope=scope).first()
        prior = reservation
        new_revision = scope.focus_revision + 1
        # Every accepted control change enters the pull change feed exactly
        # once and advances the accepted authority version.
        self._bump()
        self._commit_authority(new_revision)

        if ctype == "start":
            return self._start(command, at, context_id, prior, new_revision)
        if prior is None:
            raise ApiError("no_reservation", "No active reservation.", 409)
        if ctype != "transfer" and context_id != prior.controller_id:
            raise ApiError("stale_controller", "Stale or observing controller.", 409)
        if ctype == "reconcile":
            return self._reconcile(command, at, context_id, prior, new_revision)
        return self._control(ctype, command, at, context_id, prior, new_revision)

    # -- start ---------------------------------------------------------------
    def _start(self, command, at, context_id, prior, new_revision):
        if prior is not None:
            raise ApiError(
                "reservation_exists",
                "A running or paused session already owns the reservation.",
                409,
            )
        session_id = require_reference(command.get("sessionId"), "sessionId")
        if ActualFocusSession.objects.filter(pk=session_id).exists():
            raise ApiError("duplicate_session", "Session identity already used.", 409)
        task_id = require_reference(command.get("taskId"), "taskId")
        task = Task.objects.filter(pk=task_id, scope=self.scope).first()
        if task is None:
            raise ApiError("validation", "Choose a task within this scope.", 400)
        item_id = require_reference(command.get("plannedItemId"), "plannedItemId")
        item = PlannedFocusItem.objects.filter(pk=item_id, task=task, retired_at__isnull=True).first()
        if item is None:
            raise ApiError("validation", "Choose a current planned focus item explicitly.", 400)
        target_ms = item.active_minutes * 60000
        if target_ms <= 0:
            raise ApiError("validation", "Active focus target must be positive.", 400)
        timezone_name = require_reference(command.get("timezone"), "timezone")
        evidence_id = require_reference(command.get("evidenceId"), "evidenceId")
        snapshot = {
            "title": task.title,
            "classification": task.classification,
            "planDayId": task.plan_day.day_id,
            "timezone": timezone_name,
            "plannedStart": task.planned_start,
            "plannedItemId": str(item.pk),
            "activeMinutes": item.active_minutes,
        }
        if task.parent_task_id:
            snapshot["parentTaskId"] = str(task.parent_task_id)
        session = ActualFocusSession.objects.create(
            id=session_id, scope=self.scope, task=task, planned_item=item,
            plan_day=task.plan_day, snapshot=snapshot, target_ms=target_ms,
            actual_start=at, scope_revision=self.scope.revision,
        )
        self._set_reservation(session, "running", context_id, new_revision, evidence_id)
        self._open_evidence(evidence_id, session, "focus", at, context_id, new_revision)
        self._authority_change(command, session, at, context_id, new_revision,
                               prior_version=None, resulting=new_revision)
        return self._state(session, new_revision)

    # -- pause/resume/end/record/transfer --------------------------------------
    def _control(self, ctype, command, at, context_id, prior, new_revision):
        session = prior.session
        prior_version = prior.control_version
        if ctype == "pause" and prior.state != "running":
            raise ApiError("invalid_state", "Session is already paused.", 409)
        if ctype == "resume" and prior.state != "paused":
            raise ApiError("invalid_state", "Session is already running.", 409)
        if ctype == "transfer" and command.get("confirmed") is not True:
            raise ApiError("validation", "Control transfer needs explicit confirmation.", 400)
        observation = command.get("observation") or {}
        if observation and instant_ms(parse_instant(observation.get("at"), "observation at")) != instant_ms(at):
            raise ApiError("validation", "Observation must end at the command boundary.", 400)
        closed_evidence = self._close_open_evidence(session, observation, at,
                                                    force_uncertain=(ctype == "transfer"))
        activity = self._activity(session)
        if ctype == "end" or activity["remainingMs"] == 0:
            self._end_session(session, at, activity, closed_evidence)
            self._authority_change(command, session, at, context_id, new_revision,
                                   prior_version=prior_version, resulting=None)
            prior.delete()
        else:
            if ctype == "pause":
                state = "paused"
            elif ctype == "resume":
                state = "running"
            else:
                state = prior.state
            next_controller = context_id if ctype == "transfer" else prior.controller_id
            evidence_id = require_reference(command.get("evidenceId"), "evidenceId")
            prior.state = state
            prior.controller_id = next_controller
            prior.control_version = new_revision
            prior.evidence_id = evidence_id
            prior.save(update_fields=["state", "controller_id", "control_version",
                                      "evidence_id", "updated_at"])
            self._open_evidence(evidence_id, session, "focus" if state == "running" else "pause",
                                at, next_controller, new_revision)
            self._authority_change(command, session, at, context_id, new_revision,
                                   prior_version=prior_version, resulting=new_revision)
        return self._state(session, new_revision)

    # -- reconcile ---------------------------------------------------------------
    def _reconcile(self, command, at, context_id, prior, new_revision):
        evidence_id = require_reference(command.get("evidenceId"), "evidenceId")
        evidence = ActivityEvidence.objects.filter(pk=evidence_id, scope=self.scope).first()
        if evidence is None:
            raise ApiError("validation", "Unknown evidence.", 400)
        if prior is not None and prior.session_id == evidence.session_id and prior.controller_id != context_id:
            raise ApiError(
                "stale_controller",
                "Only the accepted controller may reconcile its reserved session.",
                409,
            )
        if evidence.end_at is None or not (
            evidence.kind == "uncertain"
            or (evidence.kind == "pause" and evidence.elapsed_ms is None)
        ):
            raise ApiError(
                "validation",
                "Only closed uncertainty or unknown pause duration can be reconciled.",
                400,
            )
        decision_id = require_reference(command.get("id"), "decision id")
        if ReconciliationDecision.objects.filter(evidence_id=evidence.pk).exists():
            raise ApiError(
                "duplicate_decision",
                "Evidence already reconciled; duplicate credit is rejected.",
                409,
            )
        elapsed_ms = require_non_negative_int(command.get("elapsedMs"), "elapsedMs")
        parts = command.get("parts")
        self._validate_reconciliation(evidence, elapsed_ms, parts)
        decision = ReconciliationDecision.objects.create(
            id=decision_id, scope=self.scope, evidence=evidence, decided_at=at,
            origin_context_id=context_id, control_version=new_revision,
            elapsed_ms=elapsed_ms, parts=parts, scope_revision=self.scope.revision,
        )
        session = evidence.session
        activity = self._activity(session)
        completed_now = False
        if session.ended_at is None and activity["remainingMs"] == 0:
            # Close the observed open boundary as uncertain; never lose the tail.
            self._close_open_evidence(
                session,
                {"certainty": "uncertain", "elapsedMs": None,
                 "reason": "completion-after-reconciliation"},
                at,
            )
            self._end_session(session, at, self._activity(session), None)
            if prior is not None and prior.session_id == session.id:
                prior.delete()
                completed_now = True
        self._authority_change(
            command, session, at, context_id, new_revision,
            prior_version=prior.control_version if prior is not None else None,
            resulting=None if completed_now else (
                prior.control_version if prior is not None and prior.session_id == session.id else None
            ),
        )
        return self._state(session, new_revision, decision=decision)

    # -- helpers -------------------------------------------------------------------
    def _validate_reconciliation(self, evidence, elapsed_ms, parts):
        if not isinstance(parts, list) or not parts:
            raise ApiError("validation", "Explicit interval parts are required.", 400)
        unknown_pause = evidence.kind == "pause" and evidence.elapsed_ms is None
        total = 0
        for part in parts:
            if not isinstance(part, dict) or part.get("kind") not in (
                ("pause",) if unknown_pause else ("focus", "interruption")
            ):
                raise ApiError(
                    "validation",
                    "Invalid reconciled classification; explicit pause is never focus.",
                    400,
                )
            part_ms = part.get("elapsedMs")
            if isinstance(part_ms, bool) or not isinstance(part_ms, int) or part_ms < 0:
                raise ApiError("validation", "Part elapsedMs must be a non-negative integer.", 400)
            if part.get("kind") == "interruption":
                require_reference(part.get("episodeId"), "interruption episodeId")
            total += part_ms
        if evidence.elapsed_ms is not None and evidence.elapsed_ms != elapsed_ms:
            raise ApiError("validation", "Reconciliation cannot replace reliable elapsed duration.", 400)
        if total != elapsed_ms:
            raise ApiError(
                "validation", "Ordered parts must account for the entire uncertain interval.", 400
            )

    def _close_open_evidence(self, session, observation, at, force_uncertain=False):
        evidence = ActivityEvidence.objects.filter(session=session, end_at__isnull=True).first()
        if evidence is None:
            return None
        certainty = observation.get("certainty", "confirmed")
        if certainty not in ("confirmed", "uncertain"):
            raise ApiError("validation", "Explicit continuity certainty is required.", 400)
        elapsed_ms = observation.get("elapsedMs")
        if elapsed_ms is not None:
            elapsed_ms = require_non_negative_int(elapsed_ms, "observation elapsedMs")
        evidence.end_at = at
        evidence.elapsed_ms = elapsed_ms
        evidence.continuity = certainty
        if evidence.kind == "focus" and (force_uncertain or certainty == "uncertain"):
            evidence.kind = "uncertain"
            evidence.reason = (
                "explicit-control-recovery" if force_uncertain
                else observation.get("reason", "uncertain")
            )
        evidence.save(update_fields=["end_at", "elapsed_ms", "continuity", "kind", "reason"])
        return evidence

    def _open_evidence(self, evidence_id, session, kind, at, context_id, version):
        if ActivityEvidence.objects.filter(pk=evidence_id).exists():
            raise ApiError("duplicate_evidence", "Evidence identity already used.", 409)
        return ActivityEvidence.objects.create(
            id=evidence_id, scope=self.scope, session=session, kind=kind,
            start_at=at, end_at=None, elapsed_ms=None, continuity=None,
            origin_context_id=context_id, control_version=version,
            scope_revision=self.scope.revision,
        )

    def _end_session(self, session, at, activity, closed_evidence):
        point = activity["completionPoint"]
        session.ended_at = at
        session.outcome = "completed" if point else "ended-early"
        session.ending_point = point or {
            "evidenceId": str(closed_evidence.pk) if closed_evidence else None,
            "decisionId": None,
            "observedAt": instant_ms(at),
            "at": instant_ms(at),
            "offsetMs": closed_evidence.elapsed_ms if closed_evidence else None,
        }
        session.record_revision += 1
        session.scope_revision = self.scope.revision
        session.save(update_fields=["ended_at", "outcome", "ending_point",
                                    "record_revision", "scope_revision", "updated_at"])

    def _set_reservation(self, session, state, controller_id, version, evidence_id):
        FocusReservation.objects.create(
            scope=self.scope, session=session, state=state,
            controller_id=controller_id, control_version=version, evidence_id=evidence_id,
        )

    def _authority_change(self, command, session, at, context_id, version,
                          prior_version, resulting):
        change_id = require_reference(command.get("id"), "command id")
        if AuthorityChange.objects.filter(pk=change_id).exists():
            raise ApiError("duplicate_authority_change", "Command identity already used.", 409)
        AuthorityChange.objects.create(
            id=change_id, scope=self.scope, session=session, type=command["type"],
            at=at, origin_context_id=context_id, version=version,
            prior_control_version=prior_version, resulting_control_version=resulting,
            scope_revision=self.scope.revision,
        )

    def _activity(self, session):
        rows = list(ActivityEvidence.objects.filter(session=session))
        decisions = {
            d.evidence_id: d
            for d in ReconciliationDecision.objects.filter(evidence__session=session)
        }
        return get_session_activity(session, rows, decisions)

    def _bump(self):
        self.scope.revision += 1
        self.scope.save(update_fields=["revision", "updated_at"])
        return self.scope.revision

    def _commit_authority(self, new_revision):
        self.scope.focus_revision = new_revision
        self.scope.save(update_fields=["focus_revision", "updated_at"])

    def _state(self, session, new_revision, decision=None):
        return {
            "revision": new_revision,
            "session": serialization.session_payload(session),
            "reservation": serialization.reservation_payload(self.scope),
            "activity": self._activity(session),
            **({"decision": serialization.decision_payload(decision)} if decision else {}),
        }

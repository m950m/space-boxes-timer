"""Serialize connected records to the local engine's logical record shapes.

Field names mirror v2/frontend local records (camelCase, epoch-ms instants) so
the sync client maps accepted server state directly onto local aggregates.
Payloads preserve provenance fields (originScopeKey) and per-record revisions
used for stale/conflict detection.
"""

from common.json import instant_ms

from .models import (
    ActivityEvidence, AuthorityChange, DomainConfiguration, ExposureRecord,
    PlannedBreak, PlannedFocusItem, ReconciliationDecision, RecordedBreak,
    ReportPreferences, Task, TaskResource,
)


def ms(dt):
    return None if dt is None else instant_ms(dt)


def plan_day_payload(plan_day):
    return {
        "id": plan_day.day_id,
        "timezone": plan_day.timezone_name,
        "revision": plan_day.scope_revision,
    }


def _minutes(value):
    """DecimalField values become plain JSON numbers (float(Decimal) is exact
    for the 4-decimal minute values this schema stores)."""
    return None if value is None else float(value)


def planned_break_payload(break_):
    return {
        "id": str(break_.pk),
        "breakMinutes": _minutes(break_.break_minutes),
        "afterFocusItemId": str(break_.after_focus_item_id) if break_.after_focus_item_id else None,
        "beforeFocusItemId": str(break_.before_focus_item_id) if break_.before_focus_item_id else None,
        "retired": break_.retired_at is not None,
    }


def focus_item_payload(item):
    return {
        "id": str(item.pk),
        "position": item.position,
        "activeMinutes": _minutes(item.active_minutes),
        "retired": item.retired_at is not None,
    }


def task_payload(task):
    # Plan order is semantic (breaks reference adjacent items), so the current
    # items are returned by stored position, not insertion identity.
    items = sorted(
        (focus_item_payload(i) for i in task.focus_items.all()),
        key=lambda item: (item["retired"], item["position"], item["id"]),
    )
    session_plan = [
        {"id": i["id"], "activeMinutes": i["activeMinutes"]}
        for i in items if not i["retired"]
    ]
    retired = [{"id": i["id"], "activeMinutes": i["activeMinutes"]} for i in items if i["retired"]]
    breaks = [planned_break_payload(b) for b in task.planned_breaks.all()]
    active_breaks = [
        {"id": b["id"], "breakMinutes": b["breakMinutes"],
         "afterFocusItemId": b["afterFocusItemId"], "beforeFocusItemId": b["beforeFocusItemId"]}
        for b in breaks if not b["retired"]
    ]
    retired_breaks = [
        {"id": b["id"], "breakMinutes": b["breakMinutes"],
         "afterFocusItemId": b["afterFocusItemId"], "beforeFocusItemId": b["beforeFocusItemId"]}
        for b in breaks if b["retired"]
    ]
    payload = {
        "id": str(task.pk),
        "planDayId": task.plan_day.day_id,
        "title": task.title,
        "plannedStart": task.planned_start,
        "classification": task.classification,
        "sessionPlan": session_plan,
        "recordRevision": task.record_revision,
        "revision": task.scope_revision,
        "originScopeKey": task.origin_scope_key,
    }
    if task.parent_task_id:
        payload["parentTaskId"] = str(task.parent_task_id)
    if task.note:
        payload["note"] = task.note
    resources = [
        {"url": r.url, **({"label": r.label} if r.label else {})}
        for r in task.resources.all()
    ]
    if resources:
        payload["resources"] = resources
    if active_breaks:
        payload["plannedBreaks"] = active_breaks
    if retired:
        payload["retiredFocusItems"] = retired
    if retired_breaks:
        payload["retiredPlannedBreaks"] = retired_breaks
    if task.completed_at:
        payload["completedAt"] = ms(task.completed_at)
    if task.cancelled_at:
        payload["cancelledAt"] = ms(task.cancelled_at)
    return payload


def evidence_payload(evidence):
    payload = {
        "id": str(evidence.pk),
        "sessionId": str(evidence.session_id),
        "kind": evidence.kind,
        "startAt": ms(evidence.start_at),
        "endAt": ms(evidence.end_at),
        "elapsedMs": evidence.elapsed_ms,
        "originContextId": evidence.origin_context_id,
        "controlVersion": evidence.control_version,
    }
    if evidence.continuity is not None:
        payload["continuity"] = evidence.continuity
    if evidence.reason:
        payload["reason"] = evidence.reason
    return payload


def decision_payload(decision):
    return {
        "id": str(decision.pk),
        "evidenceId": str(decision.evidence_id),
        "decidedAt": ms(decision.decided_at),
        "originContextId": decision.origin_context_id,
        "controlVersion": decision.control_version,
        "elapsedMs": decision.elapsed_ms,
        "parts": decision.parts,
    }


def authority_change_payload(change):
    return {
        "id": str(change.pk),
        "sessionId": str(change.session_id),
        "type": change.type,
        "at": ms(change.at),
        "originContextId": change.origin_context_id,
        "version": change.version,
        "priorControlVersion": change.prior_control_version,
        "resultingControlVersion": change.resulting_control_version,
    }


def session_payload(session):
    payload = {
        "id": str(session.pk),
        "taskId": str(session.task_id),
        "plannedItemId": str(session.planned_item_id),
        "startingSnapshot": session.snapshot,
        "targetMs": session.target_ms,
        "actualStart": ms(session.actual_start),
        "recordRevision": session.record_revision,
        "revision": session.scope_revision,
        "originScopeKey": session.origin_scope_key,
    }
    if session.ended_at is not None:
        payload["ending"] = {
            "recordedAt": ms(session.ended_at),
            "outcome": session.outcome,
            "point": session.ending_point,
        }
    return payload


def reservation_payload(scope):
    from .models import FocusReservation

    try:
        reservation = scope.reservation
    except FocusReservation.DoesNotExist:
        return None
    return {
        "sessionId": str(reservation.session_id),
        "state": reservation.state,
        "controllerId": reservation.controller_id,
        "controlVersion": reservation.control_version,
        "evidenceId": reservation.evidence_id or None,
    }


def break_payload(recorded_break):
    payload = {
        "id": str(recorded_break.pk),
        "taskId": str(recorded_break.task_id),
        "startAt": ms(recorded_break.start_at),
        "endAt": ms(recorded_break.end_at),
    }
    if recorded_break.planned_break_id:
        payload["plannedBreakId"] = str(recorded_break.planned_break_id)
    if recorded_break.preceding_session_id:
        payload["precedingSessionId"] = str(recorded_break.preceding_session_id)
    return payload


def exposure_payload(record):
    payload = {
        "id": str(record.pk),
        "domain": record.domain,
        "startAt": ms(record.start_at),
        "endAt": ms(record.end_at),
        "continuity": record.continuity,
        "originScopeKey": record.origin_scope_key,
    }
    if record.session_id:
        payload["sessionId"] = str(record.session_id)
    return payload


def config_payload(scope):
    from .models import DomainConfiguration

    config = getattr(scope, "domain_configuration", None)
    if config is None:
        return None
    return {
        "enabled": config.enabled,
        "domains": sorted(config.domains.values_list("domain", flat=True)),
        "noticeAcknowledgedAt": ms(config.notice_acknowledged_at),
    }


def prefs_payload(scope):
    from .models import ReportPreferences

    prefs = getattr(scope, "report_preferences", None)
    if prefs is None:
        return None
    return {"cadence": prefs.cadence, "channels": prefs.channels}

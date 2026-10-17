"""Connected synchronization service (ADR-005, data-model §5).

Push accepts batches of independent ops; each op is atomic and reports its
own result, so partial success stays visible instead of hidden:

- "accepted"   — applied; response carries the canonical record + revision.
- "duplicate"  — same record identity already accepted (retry idempotency).
- "conflict"   — stale plan edit; server record returned, nothing overwritten.
- "rejected"   — invalid input; reason reported honestly.

Identity is client-generated (UUIDs for records, day strings for Plan Days);
retries therefore never duplicate accepted history. Plan edits carry
baseRevision and are rejected as conflicts when stale — no silent
last-write-wins, for plans or for history. Sessions upload as history only:
connecting an active local session is refused client-side, and the server
accepts no open evidence through sync.

Scope revision counts every accepted mutating op and drives the pull change
feed; each written record stores the revision it changed at.
"""

from datetime import datetime, timezone as tz
from decimal import Decimal
import math

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.dateparse import parse_date

from common.json import ApiError, parse_instant

from . import serialization
from .models import (
    ActivityEvidence, ActualFocusSession, AuthorityChange, ConfiguredDomain,
    DomainConfiguration, ExposureRecord, FocusReservation, OwnershipScope,
    PlannedBreak, PlannedFocusItem, PlanDay, ReconciliationDecision,
    RecordedBreak, ReportPreferences, Task, TaskResource,
)

EVIDENCE_KINDS = ("focus", "pause", "uncertain")
AUTHORITY_TYPES = ("start", "record", "pause", "resume", "end", "transfer", "reconcile")
OUTCOMES = ("completed", "ended-early")


def bump(scope):
    scope.revision += 1
    scope.save(update_fields=["revision", "updated_at"])
    return scope.revision


def _require_ref(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ApiError("validation", f"{name} is required.", 400)
    return value


def _require_int(value, name, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ApiError("validation", f"{name} must be an integer >= {minimum}.", 400)
    return value


def _require_duration_minutes(value, name):
    """Planning durations follow the approved domain: any positive finite
    number of minutes (the planner's inputs use step="any")."""
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or value <= 0):
        raise ApiError("validation", f"{name} must be a positive finite number of minutes.", 400)
    return value


def _require_instant(value, name):
    return parse_instant(value, name)


def _require_date(value, name):
    if not isinstance(value, str) or parse_date(value) is None:
        raise ApiError("validation", f"{name} must be a YYYY-MM-DD calendar day.", 400)
    return value


class SyncService:
    def __init__(self, scope):
        self.scope = scope

    def pull(self, since):
        """Change feed: every record changed after `since`, plus authority state."""
        since = _require_int(since, "since")
        scope = self.scope
        return {
            "scopeRevision": scope.revision,
            "focusRevision": scope.focus_revision,
            "ownershipScopeId": str(scope.pk),
            "planDays": [
                serialization.plan_day_payload(d)
                for d in PlanDay.objects.filter(scope=scope, scope_revision__gt=since).order_by("day_id")
            ],
            "tasks": [
                serialization.task_payload(t)
                for t in Task.objects.filter(scope=scope, scope_revision__gt=since)
                .prefetch_related("focus_items", "planned_breaks", "resources").order_by("pk")
            ],
            "sessions": [
                serialization.session_payload(s)
                for s in ActualFocusSession.objects.filter(scope=scope, scope_revision__gt=since)
                .order_by("pk")
            ],
            "evidence": [
                serialization.evidence_payload(e)
                for e in ActivityEvidence.objects.filter(scope=scope, scope_revision__gt=since).order_by("start_at")
            ],
            "decisions": [
                serialization.decision_payload(d)
                for d in ReconciliationDecision.objects.filter(scope=scope, scope_revision__gt=since)
            ],
            "authorityChanges": [
                serialization.authority_change_payload(c)
                for c in AuthorityChange.objects.filter(scope=scope, scope_revision__gt=since)
            ],
            "breaks": [
                serialization.break_payload(b)
                for b in RecordedBreak.objects.filter(scope=scope, scope_revision__gt=since)
            ],
            "exposure": [
                serialization.exposure_payload(x)
                for x in ExposureRecord.objects.filter(scope=scope, scope_revision__gt=since)
            ],
            "config": scope.changed_payload(since, "domain_configuration", serialization.config_payload),
            "prefs": scope.changed_payload(since, "report_preferences", serialization.prefs_payload),
            "reservation": serialization.reservation_payload(scope),
        }

    def push(self, ops):
        results = []
        for index, op in enumerate(ops):
            try:
                if not isinstance(op, dict) or not isinstance(op.get("kind"), str):
                    raise ApiError("validation", "Each op needs a kind.", 400)
                handler = getattr(self, f"op_{op['kind'].replace('-', '_')}", None)
                if handler is None:
                    raise ApiError("validation", f"Unknown op kind {op['kind']!r}.", 400)
                with transaction.atomic():
                    record = handler(op.get("record") or {}, op)
                status, payload = record if isinstance(record, tuple) else ("accepted", record)
                results.append({"index": index, "status": status, **({"record": payload} if payload else {})})
            except ApiError as exc:
                results.append({"index": index, "status": "rejected", "code": exc.code, "message": exc.message})
            except ValidationError as exc:
                # A structurally invalid identity (e.g. a non-UUID record id)
                # rejects its own op with the field error; it must never fail
                # the whole batch with a server error.
                results.append({"index": index, "status": "rejected", "code": "validation",
                                "message": "; ".join(exc.messages)})
        self.scope.refresh_from_db()
        return {"results": results, "scopeRevision": self.scope.revision}

    # -- plan days ------------------------------------------------------------
    def op_plan_day(self, record, op):
        day_id = _require_ref(record.get("id"), "plan day id")
        timezone_name = _require_ref(record.get("timezone"), "timezone")
        day, created = PlanDay.objects.get_or_create(
            scope=self.scope, day_id=day_id,
            defaults={"timezone_name": timezone_name, "scope_revision": bump(self.scope)},
        )
        if created:
            return serialization.plan_day_payload(day)
        return ("duplicate", serialization.plan_day_payload(day))

    # -- tasks ------------------------------------------------------------------
    def op_task(self, record, op):
        task_id = _require_ref(record.get("id"), "task id")
        existing = Task.objects.filter(pk=task_id, scope=self.scope).first()
        base_revision = op.get("baseRevision", 0)
        _require_int(base_revision, "baseRevision")
        if existing is None:
            if base_revision not in (0, None):
                raise ApiError(
                    "conflict",
                    "This task was deleted or never existed remotely; refresh before retrying.",
                    409,
                )
            return self._create_task(task_id, record)
        if self._task_content_matches(existing, record):
            # The record already describes the stored content: an idempotent
            # retry or no-op, never a new revision and never a conflict.
            return ("duplicate", serialization.task_payload(existing))
        if base_revision != existing.record_revision:
            return ("conflict", serialization.task_payload(existing))
        return self._update_task(existing, record, base_revision)

    @staticmethod
    def _with_none(value):
        return None if value in (None, "") else value

    def _task_content_matches(self, task, record):
        """True when the record already describes the stored task content, so
        the push is an idempotent retry or a no-op rather than a new revision.

        Compares every applied planning field — not just the core columns — so
        an edit to resources, breaks, retirement or plan order can never be
        silently swallowed as a duplicate. Malformed input never matches; the
        regular validation and conflict paths report it.
        """
        current = serialization.task_payload(task)
        title = record.get("title")
        if (
            current["planDayId"] != record.get("planDayId")
            or current["title"] != (title.strip() if isinstance(title, str) else title)
            or current["plannedStart"] != record.get("plannedStart")
            or current["classification"] != record.get("classification")
            or self._with_none(current.get("note")) != self._with_none(record.get("note"))
            or self._with_none(current.get("parentTaskId")) != self._with_none(record.get("parentTaskId"))
            or current.get("completedAt") != record.get("completedAt")
            or current.get("cancelledAt") != record.get("cancelledAt")
        ):
            return False
        incoming_plan = self._plan_keys(record.get("sessionPlan"))
        server_plan = [
            (i["id"], None if i["activeMinutes"] is None
             else Decimal(str(i["activeMinutes"])).normalize())
            for i in current["sessionPlan"]
        ]
        if incoming_plan is None or server_plan != incoming_plan:
            return False
        incoming_retired = self._retired_keys(record.get("retiredFocusItems"))
        if incoming_retired is None or sorted(i["id"] for i in current.get("retiredFocusItems") or []) != incoming_retired:
            return False

        def break_key(row, retired):
            minutes = row.get("breakMinutes")
            return (
                row.get("id"),
                self._break_minutes_key(minutes),
                self._with_none(row.get("afterFocusItemId")),
                self._with_none(row.get("beforeFocusItemId")),
                retired,
            )

        server_breaks = {b["id"]: break_key(b, False) for b in current.get("plannedBreaks") or []}
        server_breaks.update({b["id"]: break_key(b, True) for b in current.get("retiredPlannedBreaks") or []})
        incoming_breaks = {}
        for retired, rows in ((False, record.get("plannedBreaks")), (True, record.get("retiredPlannedBreaks"))):
            for row in rows or []:
                if not isinstance(row, dict) or not row.get("id"):
                    return False
                incoming_breaks[row["id"]] = break_key(row, retired)
        if server_breaks != incoming_breaks:
            return False

        def resource_keys(rows):
            keyed = []
            for row in rows or []:
                if not isinstance(row, dict) or not isinstance(row.get("url"), str):
                    return None
                keyed.append((row["url"], self._with_none(row.get("label"))))
            return sorted(keyed)

        server_resources = resource_keys(current.get("resources"))
        incoming_resources = resource_keys(record.get("resources"))
        return server_resources is not None and server_resources == incoming_resources

    @staticmethod
    def _break_minutes_key(value):
        """Canonical comparison key for a break duration; invalid values never
        match stored content (they reach the explicit validation path)."""
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return None
        return Decimal(str(value)).normalize()
    @staticmethod
    def _plan_keys(rows):
        keyed = []
        for row in rows or []:
            if not isinstance(row, dict) or not row.get("id"):
                return None
            minutes = row.get("activeMinutes")
            keyed.append((row["id"],
                          None if isinstance(minutes, bool) or not isinstance(minutes, (int, float))
                          or not math.isfinite(minutes) else Decimal(str(minutes)).normalize()))
        return keyed

    @staticmethod
    def _retired_keys(rows):
        keyed = []
        for row in rows or []:
            if not isinstance(row, dict) or not row.get("id"):
                return None
            keyed.append(row["id"])
        return keyed

    def _resolve_plan_day(self, record):
        day_id = _require_ref(record.get("planDayId"), "planDayId")
        day = PlanDay.objects.filter(scope=self.scope, day_id=day_id).first()
        if day is None:
            raise ApiError(
                "unknown_plan_day",
                "Push the plan day before tasks that reference it.",
                400,
            )
        return day

    def _validate_task_record(self, record):
        title = record.get("title")
        if not isinstance(title, str) or not title.strip():
            raise ApiError("validation", "title must be a non-empty string.", 400)
        planned_start = record.get("plannedStart")
        if not isinstance(planned_start, str) or not planned_start.strip():
            raise ApiError("validation", "plannedStart is required.", 400)
        classification = record.get("classification")
        if classification not in ("primary", "extra"):
            raise ApiError("validation", "classification must be primary or extra.", 400)
        session_plan = record.get("sessionPlan")
        if not isinstance(session_plan, list) or not session_plan:
            raise ApiError("validation", "sessionPlan must contain planned focus items.", 400)
        seen = set()
        for item in session_plan:
            _require_ref(item.get("id") if isinstance(item, dict) else None, "planned item id")
            _require_duration_minutes(item.get("activeMinutes"), "activeMinutes")
            if item["id"] in seen:
                raise ApiError("validation", "Planned focus item identity must be unambiguous.", 400)
            seen.add(item["id"])
        retired = record.get("retiredFocusItems") or []
        for item in retired:
            _require_ref(item.get("id") if isinstance(item, dict) else None, "retired item id")
            if item["id"] in seen:
                raise ApiError("validation", "An item cannot be current and retired.", 400)
            seen.add(item["id"])
        breaks = record.get("plannedBreaks") or []
        positions = {item["id"]: index for index, item in enumerate(session_plan)}
        for planned_break in breaks:
            _require_ref(planned_break.get("id") if isinstance(planned_break, dict) else None, "planned break id")
            _require_ref(planned_break.get("afterFocusItemId"), "afterFocusItemId")
            _require_ref(planned_break.get("beforeFocusItemId"), "beforeFocusItemId")
            after = positions.get(planned_break["afterFocusItemId"])
            if after is None or positions.get(planned_break["beforeFocusItemId"]) != after + 1:
                raise ApiError(
                    "validation",
                    "Planned breaks must be placed between adjacent current focus items.",
                    400,
                )
        for planned_break in record.get("retiredPlannedBreaks") or []:
            _require_ref(planned_break.get("id") if isinstance(planned_break, dict) else None, "retired break id")
        resources = record.get("resources") or []
        for resource in resources:
            if not isinstance(resource, dict) or not isinstance(resource.get("url"), str) or not resource["url"].strip():
                raise ApiError("validation", "resource url must be a non-empty string.", 400)
        if record.get("completedAt") is not None:
            _require_instant(record["completedAt"], "completedAt")
        if record.get("cancelledAt") is not None:
            _require_instant(record["cancelledAt"], "cancelledAt")

    def _create_task(self, task_id, record):
        self._validate_task_record(record)
        day = self._resolve_plan_day(record)
        parent = self._resolve_parent(record.get("parentTaskId"))
        if Task.objects.filter(pk=task_id).exists():
            return ("duplicate", None)
        with transaction.atomic():
            task = Task.objects.create(
                id=task_id, scope=self.scope, plan_day=day, parent_task=parent,
                title=record["title"].strip(), planned_start=record["plannedStart"],
                classification=record["classification"],
                note=record.get("note") or "",
                completed_at=parse_instant(record["completedAt"], "completedAt") if record.get("completedAt") else None,
                cancelled_at=parse_instant(record["cancelledAt"], "cancelledAt") if record.get("cancelledAt") else None,
                origin_scope_key=record.get("originScopeKey") or "",
                record_revision=1,
                scope_revision=bump(self.scope),
            )
            self._apply_plan(task, record)
            self._enforce_primary_cap(task)
        return ("accepted", serialization.task_payload(Task.objects.get(pk=task.pk)))

    def _update_task(self, task, record, base_revision):
        self._validate_task_record(record)
        day = self._resolve_plan_day(record)
        parent = self._resolve_parent(record.get("parentTaskId"), exclude=task.pk)
        task.plan_day = day
        task.parent_task = parent
        task.title = record["title"].strip()
        task.planned_start = record["plannedStart"]
        task.classification = record["classification"]
        task.note = record.get("note") or ""
        task.completed_at = (
            parse_instant(record["completedAt"], "completedAt") if record.get("completedAt") else None
        )
        task.cancelled_at = (
            parse_instant(record["cancelledAt"], "cancelledAt") if record.get("cancelledAt") else None
        )
        task.record_revision = base_revision + 1
        task.scope_revision = bump(self.scope)
        task.save()
        self._apply_plan(task, record)
        self._enforce_primary_cap(task)
        return ("accepted", serialization.task_payload(Task.objects.get(pk=task.pk)))

    def _resolve_parent(self, parent_id, exclude=None):
        if parent_id in (None, ""):
            return None
        _require_ref(parent_id, "parentTaskId")
        parent = Task.objects.filter(pk=parent_id, scope=self.scope).exclude(pk=exclude).first()
        if parent is None:
            raise ApiError("validation", "parentTaskId must reference a task in this scope.", 400)
        # Walk to the root: no cycles, per the task aggregate rules. A cycle can
        # also close through the edited task itself when it is an ancestor of
        # its proposed parent.
        seen, cursor = {parent.pk}, parent
        while cursor.parent_task_id:
            if cursor.parent_task_id in seen or cursor.parent_task_id == exclude:
                raise ApiError("validation", "Task hierarchy cannot form cycles.", 400)
            seen.add(cursor.parent_task_id)
            cursor = Task.objects.get(pk=cursor.parent_task_id)
        return parent

    def _apply_plan(self, task, record):
        current = record.get("sessionPlan") or []
        retired = record.get("retiredFocusItems") or []
        now = datetime.now(tz.utc)
        # (task, position) is unique among active items, so in-place position
        # swaps would collide. Move every active row to a reserved offset
        # range first, then assign the final positions.
        for index, row in enumerate(task.focus_items.filter(retired_at__isnull=True)):
            if row.position < 1_000_000:
                row.position = 1_000_000 + index
                row.save(update_fields=["position"])
        for position, item in enumerate(current):
            PlannedFocusItem.objects.update_or_create(
                id=item["id"], task=task,
                defaults={"position": position, "active_minutes": item["activeMinutes"], "retired_at": None},
            )
        for item in retired:
            PlannedFocusItem.objects.update_or_create(
                id=item["id"], task=task,
                defaults={"active_minutes": item.get("activeMinutes", 0), "retired_at": now},
            )
        known_ids = {item["id"] for item in current} | {item["id"] for item in retired}
        # Items neither current nor retired are considered retired now.
        for stale in task.focus_items.exclude(id__in=known_ids):
            stale.retired_at = stale.retired_at or now
            stale.save(update_fields=["retired_at"])
        break_rows = {}
        for planned_break in (record.get("plannedBreaks") or []) + (record.get("retiredPlannedBreaks") or []):
            break_rows[planned_break["id"]] = planned_break
        known_breaks = set(break_rows)
        for planned_break in break_rows.values():
            retired_break = planned_break in (record.get("retiredPlannedBreaks") or [])
            after = PlannedFocusItem.objects.filter(pk=planned_break["afterFocusItemId"], task=task).first() if planned_break.get("afterFocusItemId") else None
            before = PlannedFocusItem.objects.filter(pk=planned_break["beforeFocusItemId"], task=task).first() if planned_break.get("beforeFocusItemId") else None
            if planned_break.get("afterFocusItemId") and after is None:
                raise ApiError("validation", "Planned break must reference plan items of its task.", 400)
            if planned_break.get("beforeFocusItemId") and before is None:
                raise ApiError("validation", "Planned break must reference plan items of its task.", 400)
            minutes = planned_break.get("breakMinutes")
            break_minutes = (
                minutes if not isinstance(minutes, bool) and isinstance(minutes, (int, float))
                and math.isfinite(minutes) and minutes >= 0 else None
            )
            PlannedBreak.objects.update_or_create(
                id=planned_break["id"], task=task,
                defaults={
                    "break_minutes": break_minutes,
                    "after_focus_item": after,
                    "before_focus_item": before,
                    "retired_at": now if retired_break else None,
                },
            )
        for stale in task.planned_breaks.exclude(id__in=known_breaks):
            stale.retired_at = stale.retired_at or now
            stale.save(update_fields=["retired_at"])
        # Resources are replaced wholesale on each accepted plan edit.
        task.resources.all().delete()
        for position, resource in enumerate(record.get("resources") or []):
            TaskResource.objects.create(
                id=None if resource.get("id") is None else resource["id"],
                task=task, url=resource["url"],
                label=resource.get("label") or "", position=position,
            )

    def _enforce_primary_cap(self, task):
        """Zero to three simultaneous Primary tasks per scope/Plan Day."""
        if task.classification != "primary" or task.cancelled_at is not None:
            return
        count = Task.objects.filter(
            scope=self.scope, plan_day=task.plan_day, classification="primary", cancelled_at__isnull=True
        ).count()
        if count > 3:
            raise ApiError(
                "primary_cap",
                "A Plan Day permits at most three Primary tasks per scope.",
                409,
            )

    # -- sessions (historical upload) ---------------------------------------------
    def op_session(self, record, op):
        session_id = _require_ref(record.get("id"), "session id")
        if ActualFocusSession.objects.filter(pk=session_id).exists():
            return ("duplicate", None)
        task = Task.objects.filter(pk=_require_ref(record.get("taskId"), "taskId"), scope=self.scope).first()
        if task is None:
            raise ApiError("validation", "Session task must exist in this scope.", 400)
        item = PlannedFocusItem.objects.filter(
            pk=_require_ref(record.get("plannedItemId"), "plannedItemId"), task=task
        ).first()
        if item is None:
            raise ApiError("validation", "Session planned item must belong to its task.", 400)
        snapshot = record.get("startingSnapshot")
        if not isinstance(snapshot, dict) or not snapshot.get("planDayId"):
            raise ApiError("validation", "startingSnapshot with planDayId is required.", 400)
        day = PlanDay.objects.filter(scope=self.scope, day_id=snapshot["planDayId"]).first()
        if day is None:
            raise ApiError(
                "unknown_plan_day",
                "Push the frozen starting plan day before sessions that attribute to it.",
                400,
            )
        target_ms = _require_int(record.get("targetMs"), "targetMs", minimum=1)
        actual_start = _require_instant(record.get("actualStart"), "actualStart")
        ending = record.get("ending")
        with transaction.atomic():
            session = ActualFocusSession.objects.create(
                id=session_id, scope=self.scope, task=task, planned_item=item,
                plan_day=day, snapshot=snapshot, target_ms=target_ms,
                actual_start=actual_start, origin_scope_key=record.get("originScopeKey") or "",
                scope_revision=bump(self.scope),
            )
            evidence_rows = {}
            for evidence in record.get("evidence") or []:
                row = self._import_evidence(session, evidence)
                evidence_rows[str(row.pk)] = row
            self._validate_session_timeline(session, actual_start, evidence_rows)
            for change in record.get("authorityChanges") or []:
                self._import_authority_change(session, change)
            for decision in record.get("reconciliations") or []:
                self._import_decision(session, decision, evidence_rows)
            self._validate_session_activity(session, evidence_rows, ending, record)
            if ending is not None:
                session.ended_at = _require_instant(ending.get("recordedAt"), "ending.recordedAt")
                if ending.get("outcome") not in OUTCOMES:
                    raise ApiError("validation", "ending.outcome must be completed or ended-early.", 400)
                session.outcome = ending["outcome"]
                session.ending_point = ending.get("point")
                session.record_revision = 1
                session.save(update_fields=["ended_at", "outcome", "ending_point", "record_revision"])
        return ("accepted", serialization.session_payload(
            ActualFocusSession.objects.get(pk=session.pk)
        ))

    def _import_evidence(self, session, evidence):
        if not isinstance(evidence, dict):
            raise ApiError("validation", "Evidence must be a record.", 400)
        evidence_id = _require_ref(evidence.get("id"), "evidence id")
        kind = evidence.get("kind")
        if kind not in EVIDENCE_KINDS:
            raise ApiError("validation", "Invalid evidence kind.", 400)
        start_at = _require_instant(evidence.get("startAt"), "evidence startAt")
        origin_context = _require_ref(evidence.get("originContextId"), "originContextId")
        control_version = _require_int(evidence.get("controlVersion"), "controlVersion", minimum=1)
        if evidence.get("endAt") is None:
            # Sync accepts history only; open evidence needs accepted control.
            raise ApiError(
                "validation",
                "Sync cannot accept open evidence; end the local session before connecting.",
                400,
            )
        end_at = _require_instant(evidence["endAt"], "evidence endAt")
        elapsed_ms = evidence.get("elapsedMs")
        continuity = evidence.get("continuity")
        if continuity not in ("confirmed", "uncertain"):
            raise ApiError("validation", "Invalid observed continuity.", 400)
        if elapsed_ms is not None:
            _require_int(elapsed_ms, "evidence elapsedMs")
        if kind == "focus" and (
            elapsed_ms is None or end_at < start_at or continuity != "confirmed"
        ):
            raise ApiError(
                "validation",
                "Confirmed focus requires reliable duration and ordered boundaries.",
                400,
            )
        if kind == "uncertain" and not (evidence.get("reason") or "").strip():
            raise ApiError("validation", "Uncertain evidence requires a reason.", 400)
        if ActivityEvidence.objects.filter(pk=evidence_id).exists():
            raise ApiError("duplicate_evidence", "Evidence identity already used.", 409)
        return ActivityEvidence.objects.create(
            id=evidence_id, scope=self.scope, session=session, kind=kind,
            start_at=start_at, end_at=end_at, elapsed_ms=elapsed_ms,
            continuity=continuity, reason=evidence.get("reason") or "",
            origin_context_id=origin_context, control_version=control_version,
            origin_scope_key=evidence.get("originScopeKey") or "",
            scope_revision=self.scope.revision,
        )

    def _validate_session_timeline(self, session, actual_start, evidence_rows):
        """One non-overlapping observed timeline per session (local invariant)."""
        ordered = sorted(evidence_rows.values(), key=lambda row: row.start_at)
        if not ordered or ordered[0].start_at != actual_start:
            raise ApiError("validation", "Missing starting evidence.", 400)
        for previous, current in zip(ordered, ordered[1:]):
            if previous.end_at is None or current.start_at != previous.end_at:
                raise ApiError(
                    "validation",
                    "Evidence boundaries must form one non-overlapping observed timeline.",
                    400,
                )

    def _import_authority_change(self, session, change):
        if not isinstance(change, dict):
            raise ApiError("validation", "Authority change must be a record.", 400)
        change_id = _require_ref(change.get("id"), "authority change id")
        if change.get("type") not in AUTHORITY_TYPES:
            raise ApiError("validation", "Invalid authority change type.", 400)
        if AuthorityChange.objects.filter(pk=change_id).exists():
            raise ApiError("duplicate_authority_change", "Command identity already used.", 409)
        AuthorityChange.objects.create(
            id=change_id, scope=self.scope, session=session, type=change["type"],
            at=_require_instant(change.get("at"), "authority change at"),
            origin_context_id=_require_ref(change.get("originContextId"), "originContextId"),
            version=_require_int(change.get("version"), "version", minimum=1),
            prior_control_version=change.get("priorControlVersion"),
            resulting_control_version=change.get("resultingControlVersion"),
            scope_revision=self.scope.revision,
        )

    def _import_decision(self, session, decision, evidence_rows):
        if not isinstance(decision, dict):
            raise ApiError("validation", "Decision must be a record.", 400)
        decision_id = _require_ref(decision.get("id"), "decision id")
        evidence = evidence_rows.get(_require_ref(decision.get("evidenceId"), "evidenceId"))
        if evidence is None:
            raise ApiError("validation", "Decision must reference evidence of its session.", 400)
        if ReconciliationDecision.objects.filter(pk=decision_id).exists() or hasattr(evidence, "decision"):
            raise ApiError(
                "duplicate_decision",
                "Evidence already reconciled; duplicate credit is rejected.",
                409,
            )
        elapsed_ms = _require_int(decision.get("elapsedMs"), "decision elapsedMs")
        parts = decision.get("parts")
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
            part_ms = _require_int(part.get("elapsedMs"), "part elapsedMs")
            if part.get("kind") == "interruption":
                _require_ref(part.get("episodeId"), "interruption episodeId")
            total += part_ms
        if evidence.elapsed_ms is not None and evidence.elapsed_ms != elapsed_ms:
            raise ApiError("validation", "Reconciliation cannot replace reliable elapsed duration.", 400)
        if total != elapsed_ms:
            raise ApiError("validation", "Ordered parts must account for the entire uncertain interval.", 400)
        ReconciliationDecision.objects.create(
            id=decision_id, scope=self.scope, evidence=evidence,
            decided_at=_require_instant(decision.get("decidedAt"), "decidedAt"),
            origin_context_id=_require_ref(decision.get("originContextId"), "originContextId"),
            control_version=_require_int(decision.get("controlVersion"), "controlVersion", minimum=1),
            elapsed_ms=elapsed_ms, parts=parts,
            scope_revision=self.scope.revision,
            origin_scope_key=decision.get("originScopeKey") or "",
        )

    def _validate_session_activity(self, session, evidence_rows, ending, record):
        """Outcome must match the accepted evidence; no duplicate credit."""
        from .focus import get_session_activity

        decisions = {
            d.evidence_id: d
            for d in ReconciliationDecision.objects.filter(evidence__session=session)
        }
        activity = get_session_activity(session, list(evidence_rows.values()), decisions)
        if ending is None:
            raise ApiError(
                "validation",
                "Sync accepts ended sessions only; the reservation stays server-controlled.",
                400,
            )
        if ending.get("outcome") == "completed" and activity["remainingMs"] != 0:
            raise ApiError("validation", "Recorded completion has insufficient confirmed focus.", 400)
        if ending.get("outcome") == "ended-early" and activity["remainingMs"] <= 0:
            raise ApiError("validation", "Ended-early session must retain unmet planned focus.", 400)

    # -- evidence closure (offline continuation of the accepted controller) --------
    def op_evidence_close(self, record, op):
        evidence_id = _require_ref(record.get("id"), "evidence id")
        evidence = ActivityEvidence.objects.filter(pk=evidence_id, scope=self.scope).first()
        if evidence is None:
            raise ApiError("validation", "Unknown evidence.", 400)
        if evidence.end_at is not None:
            return ("duplicate", serialization.evidence_payload(evidence))
        continuity = record.get("continuity")
        if continuity not in ("confirmed", "uncertain"):
            raise ApiError("validation", "Explicit continuity certainty is required.", 400)
        end_at = _require_instant(record.get("endAt"), "endAt")
        elapsed_ms = record.get("elapsedMs")
        if elapsed_ms is not None:
            _require_int(elapsed_ms, "elapsedMs")
        if evidence.kind == "focus" and (elapsed_ms is None or end_at < evidence.start_at):
            raise ApiError(
                "validation",
                "Confirmed focus requires reliable duration and ordered boundaries.",
                400,
            )
        evidence.end_at = end_at
        evidence.elapsed_ms = elapsed_ms
        evidence.continuity = continuity
        if evidence.kind == "focus" and continuity == "uncertain":
            evidence.kind = "uncertain"
            evidence.reason = record.get("reason") or "uncertain"
        evidence.scope_revision = bump(self.scope)
        evidence.save(update_fields=["end_at", "elapsed_ms", "continuity", "kind", "reason",
                                     "scope_revision"])
        self._maybe_auto_complete(evidence.session)
        return ("accepted", serialization.evidence_payload(
            ActivityEvidence.objects.get(pk=evidence.pk)
        ))

    def _maybe_auto_complete(self, session):
        if session.ended_at is not None or FocusReservation.objects.filter(session=session).exists():
            return
        from .focus import get_session_activity

        decisions = {
            d.evidence_id: d
            for d in ReconciliationDecision.objects.filter(evidence__session=session)
        }
        activity = get_session_activity(
            session, list(session.evidence.all()), decisions
        )
        if activity["remainingMs"] == 0 and activity["completionPoint"]:
            session.ended_at = session.evidence.latest("end_at").end_at
            session.outcome = "completed"
            session.ending_point = activity["completionPoint"]
            session.record_revision += 1
            session.scope_revision = bump(self.scope)
            session.save(update_fields=["ended_at", "outcome", "ending_point",
                                        "record_revision", "scope_revision"])

    # -- breaks, exposure, configuration, preferences ------------------------------
    def op_break(self, record, op):
        break_id = _require_ref(record.get("id"), "recorded break id")
        if RecordedBreak.objects.filter(pk=break_id).exists():
            return ("duplicate", None)
        task = Task.objects.filter(pk=_require_ref(record.get("taskId"), "taskId"), scope=self.scope).first()
        if task is None:
            raise ApiError("validation", "Recorded break task must exist in this scope.", 400)
        planned_break = None
        if record.get("plannedBreakId"):
            planned_break = PlannedBreak.objects.filter(
                pk=record["plannedBreakId"], task=task
            ).first()
            if planned_break is None:
                raise ApiError("validation", "Planned break must belong to the same task.", 400)
        preceding = None
        if record.get("precedingSessionId"):
            preceding = ActualFocusSession.objects.filter(
                pk=record["precedingSessionId"], scope=self.scope
            ).first()
            if preceding is None:
                raise ApiError("validation", "Preceding session must exist in this scope.", 400)
        row = RecordedBreak.objects.create(
            id=break_id, scope=self.scope, task=task, planned_break=planned_break,
            preceding_session=preceding,
            start_at=_require_instant(record.get("startAt"), "startAt"),
            end_at=_require_instant(record["endAt"], "endAt") if record.get("endAt") else None,
            origin_scope_key=record.get("originScopeKey") or "",
            scope_revision=bump(self.scope),
        )
        return serialization.break_payload(row)

    def op_exposure(self, record, op):
        exposure_id = _require_ref(record.get("id"), "exposure record id")
        if ExposureRecord.objects.filter(pk=exposure_id).exists():
            return ("duplicate", None)
        session_ref = None
        if record.get("sessionId"):
            session_ref = ActualFocusSession.objects.filter(
                pk=record["sessionId"], scope=self.scope
            ).first()
            if session_ref is None:
                raise ApiError("validation", "Related session must exist in this scope.", 400)
        continuity = record.get("continuity")
        if continuity not in ("confirmed", "uncertain"):
            raise ApiError("validation", "Exposure continuity is required.", 400)
        domain = _require_ref(record.get("domain"), "domain")
        row = ExposureRecord.objects.create(
            id=exposure_id, scope=self.scope, domain=domain,
            start_at=_require_instant(record.get("startAt"), "startAt"),
            end_at=_require_instant(record.get("endAt"), "endAt"),
            session=session_ref, continuity=continuity,
            origin_scope_key=record.get("originScopeKey") or "",
            scope_revision=bump(self.scope),
        )
        return serialization.exposure_payload(row)

    def op_config(self, record, op):
        enabled = record.get("enabled")
        if not isinstance(enabled, bool):
            raise ApiError("validation", "enabled must be a boolean.", 400)
        domains = record.get("domains")
        if not isinstance(domains, list) or not all(isinstance(d, str) and d.strip() for d in domains):
            raise ApiError("validation", "domains must be a list of non-empty strings.", 400)
        with transaction.atomic():
            config, _ = DomainConfiguration.objects.select_for_update().get_or_create(scope=self.scope)
            config.enabled = enabled
            if record.get("noticeAcknowledgedAt"):
                config.notice_acknowledged_at = _require_instant(record["noticeAcknowledgedAt"], "noticeAcknowledgedAt")
            config.scope_revision = bump(self.scope)
            config.save(update_fields=["enabled", "notice_acknowledged_at", "scope_revision", "updated_at"])
            config.domains.exclude(domain__in=domains).delete()
            for domain in domains:
                ConfiguredDomain.objects.get_or_create(configuration=config, domain=domain.strip())
        return serialization.config_payload(
            DomainConfiguration.objects.get(scope=self.scope)
        )

    def op_prefs(self, record, op):
        cadence = record.get("cadence")
        if cadence not in (None, "daily", "weekly", "monthly"):
            raise ApiError("validation", "cadence must be daily, weekly, monthly or null.", 400)
        channels = record.get("channels", [])
        if not isinstance(channels, list) or not all(c in ("email", "notifications") for c in channels):
            raise ApiError("validation", "channels must contain email and/or notifications.", 400)
        with transaction.atomic():
            prefs, _ = ReportPreferences.objects.select_for_update().get_or_create(scope=self.scope)
            prefs.cadence = cadence
            prefs.channels = channels
            prefs.scope_revision = bump(self.scope)
            prefs.save(update_fields=["cadence", "channels", "scope_revision", "updated_at"])
        return serialization.prefs_payload(
            ReportPreferences.objects.get(scope=self.scope)
        )

"""Connected productivity domain models.

Implements the approved v2 conceptual/logical data model
(_docs/data/v2-data-model.md, v2-erd.md) as PostgreSQL tables:

- One OwnershipScope per account (server-canonical connected authority).
- Client-generated stable record identity: every synced record's primary key
  is the client's UUID, making retries idempotent and duplicate-free.
- Per-record `record_revision` and per-scope `scope_revision` support stale
  detection: plan edits carry the base revision they were made against and are
  rejected as conflicts when stale (no silent last-write-wins).
- Historical evidence (sessions, evidence, authority changes, decisions,
  breaks) is append-only; only open evidence boundaries may close once.
- Focus reservation: at most one running-or-paused reservation per scope.

Schema representation choices left open by the model (UUID keys, timestamp
format, snapshot JSON shape) are made here and documented in v2/README.md.
"""

import uuid

from django.conf import settings
from django.db import models


class OwnershipScope(models.Model):
    """The connected authority boundary; exactly one per account.

    `revision` counts every accepted productivity mutation and drives pull
    change feeds. `focus_revision` is the accepted authority version that
    control-changing commands must reference (ADR-006).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ownership_scope"
    )
    revision = models.PositiveBigIntegerField(default=0)
    focus_revision = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"scope {self.pk} (account {self.account_id})"

    def changed_payload(self, since, relation, serializer):
        """Return the related singleton's payload only when changed after `since`."""
        try:
            obj = getattr(self, relation)
        except Exception:
            return None
        return serializer(obj) if obj.scope_revision > since else None


class PlanDay(models.Model):
    """Ownership-scoped local-calendar planning intent (date + timezone).

    `day_id` is the client's calendar-day string (e.g. "2026-10-14"); it is
    unique per scope, not globally, so the surrogate key stays server-owned.
    """

    id = models.BigAutoField(primary_key=True)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="plan_days")
    day_id = models.CharField(max_length=64)
    timezone_name = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    scope_revision = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["scope", "day_id"], name="plan_day_scope_day"),
        ]

    def __str__(self):
        return f"{self.day_id} ({self.timezone_name})"


class Task(models.Model):
    """Stable task identity; current mutable planning with history safety."""

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="tasks")
    plan_day = models.ForeignKey(PlanDay, on_delete=models.PROTECT, related_name="tasks")
    parent_task = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="subtasks"
    )
    title = models.CharField(max_length=500)
    planned_start = models.CharField(max_length=64)
    classification = models.CharField(max_length=8, choices=[("primary", "Primary"), ("extra", "Extra")])
    note = models.TextField(blank=True, default="")
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    record_revision = models.PositiveBigIntegerField(default=1)
    scope_revision = models.PositiveBigIntegerField(default=0)
    origin_scope_key = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(classification__in=["primary", "extra"]),
                name="task_classification_known",
            ),
        ]
        indexes = [
            models.Index(fields=["scope", "plan_day"]),
            models.Index(fields=["scope", "scope_revision"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.pk})"


class TaskResource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="resources")
    url = models.CharField(max_length=2048)
    label = models.CharField(max_length=500, blank=True, default="")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class PlannedFocusItem(models.Model):
    """Ordered, independently identified planned focus item (current plan)."""

    id = models.UUIDField(primary_key=True, editable=False)
    task = models.ForeignKey(Task, on_delete=models.PROTECT, related_name="focus_items")
    position = models.PositiveIntegerField()
    active_minutes = models.PositiveIntegerField()
    retired_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["task", "position"],
                condition=models.Q(retired_at__isnull=True),
                name="planned_focus_item_active_position",
            ),
        ]


class PlannedBreak(models.Model):
    """User-chosen rest between adjacent planned focus items."""

    id = models.UUIDField(primary_key=True, editable=False)
    task = models.ForeignKey(Task, on_delete=models.PROTECT, related_name="planned_breaks")
    break_minutes = models.PositiveIntegerField(null=True, blank=True)
    after_focus_item = models.ForeignKey(
        PlannedFocusItem, null=True, blank=True, on_delete=models.PROTECT,
        related_name="breaks_after",
    )
    before_focus_item = models.ForeignKey(
        PlannedFocusItem, null=True, blank=True, on_delete=models.PROTECT,
        related_name="breaks_before",
    )
    retired_at = models.DateTimeField(null=True, blank=True)


class ActualFocusSession(models.Model):
    """Actual focus session: frozen starting context, target and ending."""

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="sessions")
    task = models.ForeignKey(Task, on_delete=models.PROTECT, related_name="sessions")
    planned_item = models.ForeignKey(
        PlannedFocusItem, on_delete=models.PROTECT, related_name="sessions"
    )
    plan_day = models.ForeignKey(PlanDay, on_delete=models.PROTECT, related_name="sessions")
    snapshot = models.JSONField()
    target_ms = models.PositiveBigIntegerField()
    actual_start = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    outcome = models.CharField(
        max_length=12, null=True, blank=True,
        choices=[("completed", "Completed"), ("ended-early", "Ended early")],
    )
    ending_point = models.JSONField(null=True, blank=True)
    record_revision = models.PositiveBigIntegerField(default=1)
    scope_revision = models.PositiveBigIntegerField(default=0)
    origin_scope_key = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(ended_at__isnull=True, outcome__isnull=True, ending_point__isnull=True)
                    | models.Q(ended_at__isnull=False, outcome__isnull=False)
                ),
                name="session_ending_pairing",
            ),
            models.CheckConstraint(
                check=models.Q(outcome__in=["completed", "ended-early"]) | models.Q(outcome__isnull=True),
                name="session_outcome_known",
            ),
        ]
        indexes = [models.Index(fields=["scope", "scope_revision"])]

    def __str__(self):
        return f"session {self.pk} ({self.outcome or 'open'})"


class ActivityEvidence(models.Model):
    """Authoritative historical evidence timeline for a session.

    Kinds mirror the local engine: focus, pause, uncertain (interruptions are
    recorded through reconciliation decisions). Only the open boundary may be
    closed exactly once; rows are otherwise immutable.
    """

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="evidence")
    session = models.ForeignKey(
        ActualFocusSession, on_delete=models.PROTECT, related_name="evidence"
    )
    kind = models.CharField(
        max_length=12, choices=[("focus", "Focus"), ("pause", "Pause"), ("uncertain", "Uncertain")]
    )
    start_at = models.DateTimeField()
    end_at = models.DateTimeField(null=True, blank=True)
    elapsed_ms = models.BigIntegerField(null=True, blank=True)
    continuity = models.CharField(max_length=10, null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True, default="")
    origin_context_id = models.CharField(max_length=128)
    control_version = models.PositiveBigIntegerField()
    origin_scope_key = models.CharField(max_length=128, blank=True, default="")
    scope_revision = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(kind__in=["focus", "pause", "uncertain"]),
                name="evidence_kind_known",
            ),
            models.CheckConstraint(
                check=models.Q(continuity__in=["confirmed", "uncertain"]) | models.Q(continuity__isnull=True),
                name="evidence_continuity_known",
            ),
        ]
        indexes = [models.Index(fields=["session", "start_at"])]


class ReconciliationDecision(models.Model):
    """Effective counted facts for closed uncertainty or unknown pauses."""

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="decisions")
    evidence = models.OneToOneField(
        ActivityEvidence, on_delete=models.PROTECT, related_name="decision"
    )
    decided_at = models.DateTimeField()
    origin_context_id = models.CharField(max_length=128)
    control_version = models.PositiveBigIntegerField()
    elapsed_ms = models.BigIntegerField()
    parts = models.JSONField()
    scope_revision = models.PositiveBigIntegerField(default=0)
    origin_scope_key = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["scope", "scope_revision"])]


class AuthorityChange(models.Model):
    """Accepted Start/control-transition/lifecycle provenance (ADR-006)."""

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="authority_changes")
    session = models.ForeignKey(
        ActualFocusSession, on_delete=models.PROTECT, related_name="authority_changes"
    )
    type = models.CharField(
        max_length=16,
        choices=[("start", "Start"), ("record", "Record"), ("pause", "Pause"), ("resume", "Resume"),
                 ("end", "End"), ("transfer", "Transfer"), ("reconcile", "Reconcile"),
                 ("auto-complete", "Auto-complete")],
    )
    at = models.DateTimeField()
    origin_context_id = models.CharField(max_length=128)
    version = models.PositiveBigIntegerField()
    prior_control_version = models.PositiveBigIntegerField(null=True, blank=True)
    resulting_control_version = models.PositiveBigIntegerField(null=True, blank=True)
    scope_revision = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["session", "at"])]


class FocusReservation(models.Model):
    """The single authoritative running-or-paused control state per scope."""

    scope = models.OneToOneField(
        OwnershipScope, on_delete=models.CASCADE, primary_key=True, related_name="reservation"
    )
    session = models.ForeignKey(ActualFocusSession, on_delete=models.PROTECT, related_name="reservation")
    state = models.CharField(max_length=8, choices=[("running", "Running"), ("paused", "Paused")])
    controller_id = models.CharField(max_length=128)
    control_version = models.PositiveBigIntegerField()
    evidence_id = models.CharField(max_length=64, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(state__in=["running", "paused"]), name="reservation_state_known"
            ),
        ]

    def __str__(self):
        return f"reservation {self.session_id} ({self.state})"


class RecordedBreak(models.Model):
    """Actual deliberate rest; never focus, pause or interruption credit."""

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="recorded_breaks")
    task = models.ForeignKey(Task, on_delete=models.PROTECT, related_name="recorded_breaks")
    planned_break = models.ForeignKey(
        PlannedBreak, null=True, blank=True, on_delete=models.PROTECT, related_name="recorded_breaks"
    )
    preceding_session = models.ForeignKey(
        ActualFocusSession, null=True, blank=True, on_delete=models.PROTECT, related_name="followed_by_breaks"
    )
    start_at = models.DateTimeField()
    end_at = models.DateTimeField(null=True, blank=True)
    origin_scope_key = models.CharField(max_length=128, blank=True, default="")
    scope_revision = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["scope", "scope_revision"])]


class DomainConfiguration(models.Model):
    """Optional user-configured distracting domains and enablement context."""

    scope = models.OneToOneField(
        OwnershipScope, on_delete=models.CASCADE, primary_key=True, related_name="domain_configuration"
    )
    enabled = models.BooleanField(default=False)
    notice_acknowledged_at = models.DateTimeField(null=True, blank=True)
    scope_revision = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)


class ConfiguredDomain(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    configuration = models.ForeignKey(
        DomainConfiguration, on_delete=models.CASCADE, related_name="domains"
    )
    domain = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["configuration", "domain"], name="configured_domain_unique"),
        ]


class ExposureRecord(models.Model):
    """Minimum permitted exposure facts for configured domains (OD-014)."""

    id = models.UUIDField(primary_key=True, editable=False)
    scope = models.ForeignKey(OwnershipScope, on_delete=models.CASCADE, related_name="exposure_records")
    domain = models.CharField(max_length=255)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    session = models.ForeignKey(
        ActualFocusSession, null=True, blank=True, on_delete=models.PROTECT, related_name="exposure_records"
    )
    continuity = models.CharField(max_length=10, choices=[("confirmed", "Confirmed"), ("uncertain", "Uncertain")])
    origin_scope_key = models.CharField(max_length=128, blank=True, default="")
    scope_revision = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["scope", "scope_revision"])]


class ReportPreferences(models.Model):
    """Opt-in report delivery cadence/channel choices (FR-ANALYTICS-002)."""

    scope = models.OneToOneField(
        OwnershipScope, on_delete=models.CASCADE, primary_key=True, related_name="report_preferences"
    )
    cadence = models.CharField(
        max_length=10, null=True, blank=True,
        choices=[("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")],
    )
    channels = models.JSONField(default=list, blank=True)
    scope_revision = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(cadence__in=["daily", "weekly", "monthly"]) | models.Q(cadence__isnull=True),
                name="report_cadence_known",
            ),
        ]


class ReportDeliveryOccurrence(models.Model):
    """Durable delivery attempt/outcome record; no scheduler is implemented."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.ForeignKey(
        OwnershipScope, on_delete=models.CASCADE, related_name="report_deliveries"
    )
    period_kind = models.CharField(max_length=10, choices=[("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly"), ("annual", "Annual")])
    period_start = models.DateField()
    channel = models.CharField(max_length=20)
    preference_snapshot = models.JSONField()
    outcome = models.CharField(max_length=12, default="pending")
    detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

"""Account data lifecycle services: scope creation, export, deletion (OD-008,
OD-015, OD-016; FR-DATA-001). Export preserves plans, activity, uncertainty
and provenance in one machine-readable JSON document usable outside the
product. Deletion removes the canonical account data and the account itself;
no backup-retention or external-copy promise is invented (data-model §6).
"""

from django.utils import timezone

from .models import OwnershipScope


def create_scope_for_account(user):
    """Exactly one connected OwnershipScope per account (created at registration)."""
    return OwnershipScope.objects.get_or_create(account=user)[0]


def get_scope(request):
    return OwnershipScope.objects.filter(account=request.user).first()


def export_account_data(scope):
    from . import serialization
    from .models import (
        ActivityEvidence, ActualFocusSession, AuthorityChange, ExposureRecord,
        PlanDay, ReconciliationDecision, RecordedBreak, Task,
    )

    sessions = ActualFocusSession.objects.filter(scope=scope).order_by("actual_start")
    return {
        "exportedAt": serialization.instant_ms(timezone.now()),
        "format": "space-boxes-v2-export/1",
        "account": {"email": scope.account.email},
        "scope": {
            "id": str(scope.pk),
            "revision": scope.revision,
            "focusRevision": scope.focus_revision,
        },
        "planDays": [
            serialization.plan_day_payload(d) for d in PlanDay.objects.filter(scope=scope)
        ],
        "tasks": [
            serialization.task_payload(t)
            for t in Task.objects.filter(scope=scope).prefetch_related(
                "focus_items", "planned_breaks", "resources"
            )
        ],
        "sessions": [serialization.session_payload(s) for s in sessions],
        "evidence": [
            serialization.evidence_payload(e)
            for e in ActivityEvidence.objects.filter(scope=scope).order_by("start_at")
        ],
        "decisions": [
            serialization.decision_payload(d)
            for d in ReconciliationDecision.objects.filter(scope=scope)
        ],
        "authorityChanges": [
            serialization.authority_change_payload(c)
            for c in AuthorityChange.objects.filter(scope=scope).order_by("at")
        ],
        "breaks": [
            serialization.break_payload(b) for b in RecordedBreak.objects.filter(scope=scope)
        ],
        "exposure": [
            serialization.exposure_payload(x) for x in ExposureRecord.objects.filter(scope=scope)
        ],
        "config": serialization.config_payload(getattr(scope, "domain_configuration", None)),
        "prefs": serialization.prefs_payload(getattr(scope, "report_preferences", None)),
        "reservation": serialization.reservation_payload(scope),
    }


def delete_account(user):
    """Delete canonical productivity data and the account; revoke sessions.

    Returns the number of deleted scope rows for the confirmation response.
    Deletion runs in explicit dependency order because PROTECT edges inside
    the productivity graph must not block scope removal; every row belongs to
    the one scope being deleted.
    """
    from django.contrib.sessions.models import Session
    from .models import (
        ActivityEvidence, ActualFocusSession, AuthorityChange, DomainConfiguration,
        ExposureRecord, FocusReservation, PlannedBreak, PlannedFocusItem,
        PlanDay, ReconciliationDecision, RecordedBreak, ReportDeliveryOccurrence,
        ReportPreferences, Task, TaskResource,
    )  # noqa: F401 — PlannedBreak/PlannedFocusItem used via task__scope below

    for session in Session.objects.iterator():
        if session.get_decoded().get("_auth_user_id") == str(user.pk):
            session.delete()
    scope = OwnershipScope.objects.get(account=user)
    order = (
        ReconciliationDecision, ActivityEvidence, AuthorityChange,
        FocusReservation, ExposureRecord, RecordedBreak,
        ReportDeliveryOccurrence, ReportPreferences, DomainConfiguration,
        ActualFocusSession,
    )
    for model in order:
        model.objects.filter(scope=scope).delete()
    # Rows hanging off tasks (no direct scope column) go before their tasks,
    # and plan days go after them (Task.plan_day is PROTECTed).
    TaskResource.objects.filter(task__scope=scope).delete()
    PlannedBreak.objects.filter(task__scope=scope).delete()
    PlannedFocusItem.objects.filter(task__scope=scope).delete()
    Task.objects.filter(scope=scope).delete()
    PlanDay.objects.filter(scope=scope).delete()
    scope.delete()
    user.delete()
    return 1

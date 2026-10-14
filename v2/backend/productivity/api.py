"""Connected productivity API: sync push/pull, focus authority, data controls.

Every view requires an authenticated account and resolves records through the
account's OwnershipScope — account-scoped access is enforced server-side, not
in the frontend (FR-DATA-001, FR-ADMIN-001, AC-005/AC-006).
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from accounts.models import User  # noqa: F401  (AUTH_USER_MODEL resolution)
from common.json import ApiError, error_response, json_body

from .focus import FocusEngine
from .models import OwnershipScope
from .services import delete_account, export_account_data, get_scope
from .sync import SyncService


def _authenticated_scope(request):
    if not request.user.is_authenticated:
        raise ApiError("unauthenticated", "Sign in required.", 401)
    scope = get_scope(request)
    if scope is None:
        raise ApiError("unauthenticated", "No connected scope for this account.", 401)
    return scope


def _endpoint(view):
    def wrapped(request):
        try:
            return view(request)
        except ApiError as exc:
            return error_response(exc.code, exc.message, exc.status)
    return wrapped


@require_GET
@_endpoint
def sync_pull(request):
    scope = _authenticated_scope(request)
    try:
        since = int(request.GET.get("since", "0"))
    except ValueError:
        raise ApiError("validation", "since must be an integer.", 400)
    return JsonResponse(SyncService(scope).pull(since))


@require_POST
@_endpoint
def sync_push(request):
    scope = _authenticated_scope(request)
    body = json_body(request)
    ops = body.get("ops")
    if not isinstance(ops, list):
        raise ApiError("validation", "ops must be a list.", 400)
    return JsonResponse(SyncService(scope).push(ops))


@require_POST
@_endpoint
def focus_command(request):
    """Accepted Start/pause/resume/end/transfer/reconcile (ADR-006)."""
    scope = _authenticated_scope(request)
    command = json_body(request)
    state = FocusEngine(scope).apply(command)
    return JsonResponse(state)


@require_GET
@_endpoint
def focus_state(request):
    """Observer/mirror view of the accepted reservation (FR-FOCUS-002)."""
    scope = _authenticated_scope(request)
    from . import serialization

    reservation = serialization.reservation_payload(scope)
    session_payload = None
    if reservation:
        from .models import ActualFocusSession

        session = ActualFocusSession.objects.filter(pk=reservation["sessionId"]).first()
        if session:
            session_payload = serialization.session_payload(session)
    return JsonResponse({
        "focusRevision": scope.focus_revision,
        "reservation": reservation,
        "session": session_payload,
    })


@require_GET
@_endpoint
def account_export(request):
    """Machine-readable export of the account's productivity data (OD-016)."""
    scope = _authenticated_scope(request)
    from django.http import HttpResponse
    import json

    payload = export_account_data(scope)
    response = HttpResponse(
        json.dumps(payload, indent=2), content_type="application/json"
    )
    response["Content-Disposition"] = (
        f'attachment; filename="space-boxes-export-{timezone_date()}.json"'
    )
    return response


def timezone_date():
    from django.utils import timezone

    return timezone.localdate().isoformat()


@require_POST
@_endpoint
def account_delete(request):
    """Delete the account and its canonical productivity data (OD-016).

    Requires the current password (sensitive-action re-authentication,
    ADR-004). Local browser data is intentionally untouched: the local scope
    remains the user's until they clear it in the product.
    """
    scope = _authenticated_scope(request)
    body = json_body(request)
    password = body.get("password")
    if not isinstance(password, str) or not scope.account.check_password(password):
        raise ApiError("invalid_credentials", "Password confirmation failed.", 403)
    user = scope.account
    deleted = delete_account(user)
    return JsonResponse({"ok": True, "deletedScopeRows": deleted})

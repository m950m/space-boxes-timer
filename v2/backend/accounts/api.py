"""Connected account API: register, login, logout, sessions, recovery.

Security model (ADR-004): opaque server-side Django sessions identified by a
Secure/HttpOnly SameSite=Lax cookie; CSRF protection on every mutating
request; session-key rotation before authentication (session fixation);
generic credential/recovery errors. The productivity scope is created at
registration so every account has exactly one connected OwnershipScope.
"""

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
import logging
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from common.json import ApiError, error_response, json_body
from .models import EmailVerificationToken, RecoveryToken, User
from .recovery import send_recovery_email
from .verification import send_verification_email
from .throttling import allow, allowed_without_cost


logger = logging.getLogger(__name__)


def _error(code, message, status):
    return error_response(code, message, status)


def client_ip(request):
    return request.META.get("REMOTE_ADDR")


def account_payload(user):
    scope = getattr(user, "ownership_scope", None)
    return {"email": user.email, "scopeId": str(scope.pk) if scope else None}


def _session_for_user(user_pk):
    from django.contrib.sessions.models import Session

    for session in Session.objects.iterator():
        if session.get_decoded().get("_auth_user_id") == str(user_pk):
            yield session


@ensure_csrf_cookie
def csrf(request):
    """Issue/refresh the CSRF cookie for the SPA; token travels via header."""
    return JsonResponse({"csrfToken": get_token(request)})


@require_POST
def register(request):
    try:
        body = json_body(request)
    except ApiError as exc:
        return _error(exc.code, exc.message, exc.status)
    email, password = body.get("email"), body.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return _error("validation", "A valid email and password are required.", 400)
    try:
        email = User.objects.normalize_email(email).lower()
        from django.core.validators import validate_email

        validate_email(email)
    except Exception:
        return _error("validation", "A valid email is required.", 400)
    try:
        validate_password(password)
    except Exception as exc:
        return _error("validation", " ".join(exc.messages), 400)
    if not allow("register_ip", client_ip(request) or "unknown"):
        return _error("rate_limited", "Please try again later.", 429)
    response = {"ok": True, "verificationRequired": True,
                "message": "Check your email for a verification link if registration is eligible."}
    if User.objects.filter(email=email).exists():
        # Same success envelope; never reveal whether an account exists.
        return JsonResponse(response, status=202)
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                email=email, password=password, is_active=False
            )
            from productivity.services import create_scope_for_account
            create_scope_for_account(user)
            send_verification_email(user, request_ip=client_ip(request))
    except Exception:
        # SMTP/provider exception messages can contain bearer links or credentials.
        logger.error("Space Boxes registration could not be completed")
        return _error("registration_unavailable", "Registration is temporarily unavailable.", 503)
    return JsonResponse(response, status=202)


@require_POST
def verify_email(request):
    """Activate a registered account with a single-use emailed bearer token."""
    if not allow("verify_confirm", client_ip(request) or "unknown"):
        return _error("rate_limited", "Please try again later.", 429)
    try:
        secret = json_body(request).get("token")
    except ApiError as exc:
        return _error(exc.code, exc.message, exc.status)
    token = EmailVerificationToken.find_valid(secret)
    if token is None:
        return _error("invalid_token", "Verification link is invalid or expired.", 400)
    with transaction.atomic():
        # Serialize all verification/resend operations on the account first.
        # Locking two different tokens first can deadlock when both are redeemed.
        user = User.objects.select_for_update().get(pk=token.user_id)
        locked = EmailVerificationToken.objects.select_for_update().filter(
            pk=token.pk, used_at__isnull=True, expires_at__gt=timezone.now()
        ).first()
        if locked is None:
            return _error("invalid_token", "Verification link is invalid or expired.", 400)
        if user.email_verified_at is not None:
            return _error("invalid_token", "Verification link is invalid or expired.", 400)
        now = timezone.now()
        user.is_active = True
        user.email_verified_at = now
        user.save(update_fields=["is_active", "email_verified_at"])
        EmailVerificationToken.objects.filter(
            user=user, used_at__isnull=True
        ).update(used_at=now)
    return JsonResponse({"ok": True, "verified": True})


@require_POST
def resend_verification(request):
    """Generic rate-limited resend that does not enumerate email addresses."""
    try:
        email = json_body(request).get("email")
    except ApiError as exc:
        return _error(exc.code, exc.message, exc.status)
    if not isinstance(email, str):
        return _error("validation", "Email is required.", 400)
    email = email.strip().lower()
    response = {"ok": True, "message": "If eligible, verification instructions will be sent."}
    if not allow("verify_resend_ip", client_ip(request) or "unknown"):
        return JsonResponse(response, status=202)
    if not allow("verify_resend_email", email):
        return JsonResponse(response, status=202)
    user = User.objects.filter(email=email, is_active=False, email_verified_at__isnull=True).first()
    if user:
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=user.pk)
                if user.is_active or user.email_verified_at is not None:
                    return JsonResponse(response, status=202)
                EmailVerificationToken.objects.filter(
                    user=user, used_at__isnull=True
                ).update(used_at=timezone.now())
                send_verification_email(user, request_ip=client_ip(request))
        except Exception:
            # Respond generically; do not leak account existence via provider status.
            logger.error("Space Boxes verification resend failed")
    return JsonResponse(response, status=202)


@require_POST
def login_view(request):
    try:
        body = json_body(request)
    except ApiError as exc:
        return _error(exc.code, exc.message, exc.status)
    email, password = body.get("email"), body.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return _error("validation", "Email and password are required.", 400)
    generic = _error("invalid_credentials", "Invalid email or password.", 401)
    user = User.objects.filter(email=email.strip().lower()).first()
    if user is None:
        return generic
    # Failed-attempt throttle: budget is consumed only by failures.
    if not allowed_without_cost("login", str(user.pk), client_ip(request) or "unknown"):
        return generic
    if authenticate(request, username=user.email, password=password) is None:
        allow("login", str(user.pk), client_ip(request) or "unknown")
        return generic
    request.session.cycle_key()
    login(request, user)
    return JsonResponse({"account": account_payload(user)})


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_POST
def logout_all(request):
    """Revoke every authentication session of the current account."""
    if request.user.is_authenticated:
        for session in _session_for_user(request.user.pk):
            session.delete()
    return JsonResponse({"ok": True})


def me(request):
    if not request.user.is_authenticated:
        return _error("unauthenticated", "Sign in required.", 401)
    return JsonResponse({"account": account_payload(request.user)})


@require_POST
def recovery_request(request):
    """Always respond generically; issue a single-use token only for real,
    active accounts that still have rate budget (OD-011)."""
    try:
        body = json_body(request)
    except ApiError as exc:
        return _error(exc.code, exc.message, exc.status)
    email = body.get("email")
    if not isinstance(email, str):
        return _error("validation", "Email is required.", 400)
    email = email.strip().lower()
    ok_account = allow("recovery_request_account", email)
    ok_ip = allow("recovery_request_ip", client_ip(request) or "unknown")
    if ok_account and ok_ip:
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            secret = RecoveryToken.issue(user, request_ip=client_ip(request))
            send_recovery_email(user, secret)
    return JsonResponse({"ok": True, "message": "If the account exists, a recovery email was sent."})


@require_POST
def recovery_confirm(request):
    try:
        body = json_body(request)
    except ApiError as exc:
        return _error(exc.code, exc.message, exc.status)
    secret, password = body.get("token"), body.get("password")
    if not isinstance(secret, str) or not isinstance(password, str):
        return _error("validation", "Token and new password are required.", 400)
    if not allow("recovery_confirm", client_ip(request) or "unknown"):
        return _error("rate_limited", "Too many attempts; try again later.", 429)
    token = RecoveryToken.find_valid(secret)
    if token is None or not allow("recovery_confirm", str(token.user_id)):
        return _error("invalid_token", "This recovery code is invalid or expired.", 400)
    try:
        validate_password(password, user=token.user)
    except Exception as exc:
        return _error("validation", " ".join(exc.messages), 400)
    if not token.consume():
        return _error("invalid_token", "This recovery code is invalid or expired.", 400)
    user = token.user
    user.set_password(password)
    user.save(update_fields=["password"])
    # Revoke every existing authentication session after a credential change.
    for session in _session_for_user(user.pk):
        session.delete()
    return JsonResponse({"ok": True})

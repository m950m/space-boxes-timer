"""Fixed-window throttles for authentication and recovery (OD-11/ADR-004)."""

from datetime import timedelta

from django.utils import timezone

from .models import RateLimitBucket

RATE_LIMITS = {
    # key suffix -> (limit, window). Implementation defaults; the approved
    # policy requires only "temporary, single-use, rate-limited" recovery.
    "login": (10, timedelta(hours=1)),
    "recovery_request_account": (5, timedelta(hours=1)),
    "recovery_request_ip": (10, timedelta(hours=1)),
    "recovery_confirm": (10, timedelta(hours=1)),
}


def allow(kind, *parts):
    """Consume one unit from the named throttle; False when exhausted."""
    limit, window = RATE_LIMITS[kind]
    return RateLimitBucket.check_and_increment(f"{kind}:{':'.join(parts)}", limit, window)


def allowed_without_cost(kind, *parts):
    limit, window = RATE_LIMITS[kind]
    return RateLimitBucket.peek(f"{kind}:{':'.join(parts)}", limit, window)

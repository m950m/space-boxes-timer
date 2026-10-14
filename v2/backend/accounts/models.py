"""Connected account models: users, recovery tokens and rate-limit buckets.

Policy source: ADR-004, OD-008, OD-010, OD-011 and FR-AUTH-001. Exact
lifetimes/rate limits are implementation defaults (60-minute single-use
recovery tokens; per-account and per-IP request throttles) — the approved
policy is only "temporary, single-use, rate-limited".
"""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import validate_email
from django.db import models, transaction
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_staff=True and is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Email-identified account. Credential/recovery records live here, not in
    the productivity ERD (v2-data-model.md §2)."""

    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [models.Index(fields=["email"])]

    def __str__(self):
        return self.email


class RecoveryToken(models.Model):
    """Single-use verified-email recovery credential (OD-011)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recovery_tokens"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    request_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "created_at"])]

    TOKEN_MINUTES = 60

    @classmethod
    def issue(cls, user, request_ip=None):
        """Create a new token; returns the plaintext secret exactly once."""
        secret = secrets.token_urlsafe(32)
        cls.objects.create(
            user=user,
            token_hash=hashlib.sha256(secret.encode()).hexdigest(),
            expires_at=timezone.now() + timedelta(minutes=cls.TOKEN_MINUTES),
            request_ip=request_ip,
        )
        return secret

    @classmethod
    def find_valid(cls, secret):
        digest = hashlib.sha256(secret.encode()).hexdigest()
        return cls.objects.filter(
            token_hash=digest, used_at__isnull=True, expires_at__gt=timezone.now()
        ).first()

    def consume(self):
        with transaction.atomic():
            updated = type(self).objects.filter(
                pk=self.pk, used_at__isnull=True, expires_at__gt=timezone.now()
            ).update(used_at=timezone.now())
        return updated == 1


class RateLimitBucket(models.Model):
    """Fixed-window throttle counters for recovery, confirmation and login
    failures. Keys are caller-namespaced; see accounts.throttling."""

    key = models.CharField(max_length=255, primary_key=True)
    window_start = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)

    @classmethod
    def check_and_increment(cls, key, limit, window):
        """Increment the counter for `key`, returning whether `limit` allows it.

        Serialized per row so concurrent requests cannot exceed the window
        budget. Expired windows reset on the next call.
        """
        now = timezone.now()
        with transaction.atomic():
            bucket = cls.objects.select_for_update().filter(key=key).first()
            if bucket is None:
                cls.objects.create(key=key, window_start=now, count=1)
                return True
            if now - bucket.window_start >= window:
                bucket.window_start = now
                bucket.count = 1
                bucket.save(update_fields=["window_start", "count"])
                return True
            if bucket.count >= limit:
                return False
            bucket.count += 1
            bucket.save(update_fields=["count"])
            return True

    @classmethod
    def peek(cls, key, limit, window):
        """Return True when `key` still has budget without consuming any."""
        bucket = cls.objects.filter(key=key).first()
        if bucket is None or timezone.now() - bucket.window_start >= window:
            return True
        return bucket.count < limit


def validate_email_address(value):
    validate_email(value)
    return value.lower()

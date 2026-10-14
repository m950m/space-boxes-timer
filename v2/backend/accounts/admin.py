"""Narrow administration (FR-ADMIN-001, OD-010).

Administrators manage account status and necessary support actions only.
Productivity models (tasks, notes, sessions, evidence, exposure, reports) are
deliberately NOT registered: no default unrestricted access to task content,
private notes or productivity history. Passwords are never displayed or set
directly; a support password reset goes through the verified-email recovery
channel.
"""

from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import sensitive_post_parameters_m
from django.utils import timezone

from .models import RecoveryToken, User
from .recovery import send_recovery_email


class UserAdminForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ("email", "is_active", "is_staff")


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    """Account-status/support administration without content visibility."""

    form = UserAdminForm
    list_display = ("email", "is_active", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff")
    search_fields = ("email",)
    ordering = ("-date_joined",)
    readonly_fields = ("date_joined", "last_login")
    actions = ("deactivate_accounts", "activate_accounts", "email_recovery_link")
    fieldsets = (
        ("Account", {"fields": ("email", "is_active", "is_staff")}),
        ("Timestamps", {"fields": ("date_joined", "last_login")}),
    )

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # Only superusers may grant staff/administration status.
        if not request.user.is_superuser and "is_staff" in form.base_fields:
            form.base_fields["is_staff"].disabled = True
        return form

    @admin.action(description="Deactivate selected accounts")
    def deactivate_accounts(self, request, queryset):
        if not request.user.is_superuser:
            self.message_user(request, "Only superusers may change account status.", messages.ERROR)
            return
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} account(s) deactivated.")

    @admin.action(description="Activate selected accounts")
    def activate_accounts(self, request, queryset):
        if not request.user.is_superuser:
            self.message_user(request, "Only superusers may change account status.", messages.ERROR)
            return
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} account(s) activated.")

    @sensitive_post_parameters_m
    def email_recovery_link(self, request, queryset):
        """Send a recovery email instead of exposing or setting credentials."""
        sent = 0
        for user in queryset.filter(is_active=True):
            secret = RecoveryToken.issue(user, request_ip=None)
            send_recovery_email(user, secret, purpose="staff-support")
            sent += 1
        self.message_user(request, f"{sent} recovery email(s) sent through the verified channel.")

    email_recovery_link.short_description = "Email single-use recovery link"

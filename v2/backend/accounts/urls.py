"""Connected account API routes."""

from django.urls import path

from . import api

urlpatterns = [
    path("csrf", api.csrf),
    path("accounts/register", api.register),
    path("accounts/login", api.login_view),
    path("accounts/logout", api.logout_view),
    path("accounts/logout-all", api.logout_all),
    path("accounts/me", api.me),
    path("accounts/recovery/request", api.recovery_request),
    path("accounts/recovery/confirm", api.recovery_confirm),
]

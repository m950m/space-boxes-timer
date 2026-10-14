"""Connected productivity API routes."""

from django.urls import path

from . import api

urlpatterns = [
    path("sync/pull", api.sync_pull),
    path("sync/push", api.sync_push),
    path("focus/command", api.focus_command),
    path("focus/state", api.focus_state),
    path("account/export", api.account_export),
    path("account/delete", api.account_delete),
]

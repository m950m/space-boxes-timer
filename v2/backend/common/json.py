"""Shared JSON request/response conventions for connected API views.

One error shape everywhere: {"error": {"code", "message"}} with an HTTP
status. Instants cross the API as epoch-millisecond integers to mirror the
local engine's observed instants; datetimes serialize back the same way.
"""

import json

from django.http import JsonResponse


class ApiError(Exception):
    def __init__(self, code, message, status):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def error_response(code, message, status):
    return JsonResponse({"error": {"code": code, "message": message}}, status=status)


def json_body(request):
    """Parse the request body as a JSON object; raises ApiError otherwise."""
    if request.body in (b"", None):
        return {}
    try:
        value = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError("invalid_json", "The request body must be JSON.", 400)
    if not isinstance(value, dict):
        raise ApiError("invalid_json", "The request body must be a JSON object.", 400)
    return value


def parse_instant(value, field):
    """Epoch-ms integer to aware datetime, mirroring local observed instants."""
    from datetime import datetime, timezone as tz

    from django.utils.dateparse import parse_datetime

    if isinstance(value, str):
        parsed = parse_datetime(value)
        if parsed is None:
            raise ApiError("validation", f"{field} must be an epoch-ms integer or ISO datetime.", 400)
        if parsed.tzinfo is None:
            raise ApiError("validation", f"{field} must include a timezone.", 400)
        return parsed
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError("validation", f"{field} must be an epoch-ms integer or ISO datetime.", 400)
    if value != int(value) or int(value) < 0:
        raise ApiError("validation", f"{field} must be a non-negative epoch-ms integer.", 400)
    return datetime.fromtimestamp(int(value) / 1000, tz=tz.utc)


def instant_ms(value):
    """Aware datetime to epoch-ms integer."""
    from datetime import timezone as tz

    if value.tzinfo is None:
        value = value.replace(tzinfo=tz.utc)
    return int(value.timestamp() * 1000)

"""Rehearse actual containers with fresh disposable data; removes only its own stack."""
import argparse
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backend-tests", action="store_true", help="also run all config/accounts/productivity tests")
args = parser.parse_args()
spec = importlib.util.spec_from_file_location("prepare", Path(__file__).with_name("prepare-container-local.py"))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
private = Path(tempfile.mkdtemp(prefix="space-boxes-container-"))
env_file = prepare.prepare(private / "config")
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
with env_file.open("a") as stream:
    stream.write(f"SPACE_BOXES_HTTPS_PORT={port}\nSPACE_BOXES_IMAGE=space-boxes-v2:verify-{private.name}\n")
project = "spaceboxes-verify-" + secrets.token_hex(6)
compose = ["docker", "compose", "--env-file", str(env_file), "-p", project, "-f", "v2/compose.yaml"]
log = (private / "commands.log").open("w")
captures = []
print(f"Private evidence: {private}", flush=True)


def run(*command, ok=True):
    result = subprocess.run(compose + list(command), cwd=root, stdout=log, stderr=subprocess.STDOUT)
    if ok and result.returncode:
        raise RuntimeError(f"Container command failed: {command}; see private log")
    return result.returncode


try:
    run("config", "--quiet")
    run("build", "--pull")
    run("up", "-d", "--wait", "db")
    assert run("run", "--rm", "--no-deps", "app", ok=False) != 0, "Unmigrated startup must fail"
    print("PASS: hash-locked image build and unmigrated startup rejection", flush=True)
    run("run", "--rm", "app", "v2/.venv/bin/python", "v2/backend/manage.py", "migrate", "--no-input")
    run("run", "--rm", "app", "v2/.venv/bin/python", "v2/backend/manage.py", "makemigrations", "--check", "--dry-run")
    run("up", "-d", "--wait", "--wait-timeout", "90", "app")
    run("exec", "-T", "app", "v2/.venv/bin/pip", "check")
    print("PASS: fresh PostgreSQL migrations, no model drift, non-root Gunicorn/WhiteNoise startup and TLS/database readiness", flush=True)
    context = ssl.create_default_context(cafile=str(private / "config/app.crt"))
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(jar))
    base = f"https://localhost:{port}"
    token = None

    def request(path, payload=None, expected=200, *, method=None, csrf=True, valid=False, headers=None):
        method = method or ("POST" if payload is not None else "GET")
        request_headers = dict(headers or {})
        if payload is not None:
            request_headers.update({"Content-Type": "application/json", "Origin": base})
            if csrf and token:
                request_headers["X-CSRFToken"] = token
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(base + path, data=data, method=method, headers=request_headers)
        try:
            response = opener.open(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            status = response.code
            content_type = response.headers.get_content_type()
            assert status == expected, (path, status, expected)
            body = json.loads(raw) if content_type == "application/json" else raw.decode()
            if path.startswith("/api/v2/") and method in ("GET", "POST"):
                captures.append({"path": path.split("?")[0], "method": method,
                                 "status": status, "contentType": content_type, "body": body,
                                 "request": payload, "validRequest": valid})
            return body, response.headers

    body, headers = request("/")
    assert "Local planner" in body and headers["X-Frame-Options"] == "DENY"
    for asset in ("/js/app.js", "/css/planner.css", "/static/admin/css/base.css"):
        body, headers = request(asset)
        assert body and headers["X-Content-Type-Options"] == "nosniff"
    for path in ("/tests/", "/RELEASE.md", "/.env", "/backend/config/settings.py"):
        request(path, expected=404)
    request("/", expected=400, headers={"Host": "untrusted.invalid"})
    request("/api/v2/accounts/me", expected=401)
    token = request("/api/v2/csrf")[0]["csrfToken"]
    request("/api/v2/sync/push", {"ops": []}, expected=403, csrf=False)
    credentials = {"email": "container@example.invalid", "password": secrets.token_urlsafe(24)}
    request("/api/v2/accounts/register", credentials, expected=201, valid=True)
    token = request("/api/v2/csrf")[0]["csrfToken"]
    session = next(cookie for cookie in jar if cookie.name == "spaceboxes_session")
    assert session.secure and session.has_nonstandard_attr("HttpOnly") and session.get_nonstandard_attr("SameSite") == "Lax"
    day = {"kind": "plan_day", "record": {"id": "2026-10-17", "timezone": "UTC"}}
    task_id, item_id = str(uuid.uuid4()), str(uuid.uuid4())
    task = {"kind": "task", "record": {"id": task_id, "planDayId": "2026-10-17", "title": "Container smoke", "plannedStart": "09:00", "classification": "primary", "sessionPlan": [{"id": item_id, "activeMinutes": 25}]}}
    pushed = request("/api/v2/sync/push", {"ops": [day, task]}, valid=True)[0]
    assert [r["status"] for r in pushed["results"]] == ["accepted", "accepted"]
    mixed = request("/api/v2/sync/push", {"ops": [day, {"kind": "unknown"}]})[0]
    assert [r["status"] for r in mixed["results"]] == ["duplicate", "rejected"]
    request("/api/v2/sync/pull?since=-1", expected=400)
    request("/api/v2/sync/pull?since=0")
    command = {"type": "start", "id": str(uuid.uuid4()), "contextId": "container", "at": 1792198800000, "expectedRevision": 0, "sessionId": str(uuid.uuid4()), "taskId": task_id, "plannedItemId": item_id, "timezone": "UTC", "evidenceId": str(uuid.uuid4())}
    request("/api/v2/focus/command", command, valid=True)
    request("/api/v2/focus/command", command, expected=409)
    request("/api/v2/focus/state")
    request("/api/v2/account/export")
    print("PASS: HTTPS assets/private paths, host/session/CSRF enforcement, sync partial success, focus/stale revision and export", flush=True)
    run("restart", "app")
    run("up", "-d", "--wait", "--wait-timeout", "90", "app")
    run("exec", "-T", "app", "v2/.venv/bin/python", "v2/scripts/container-health.py")
    assert request("/api/v2/accounts/me")[0]["account"]["email"] == credentials["email"]
    assert request("/api/v2/sync/pull")[0]["tasks"][0]["id"] == task_id
    request("/api/v2/account/delete", {"password": "wrong"}, expected=403)
    request("/api/v2/account/delete", {"password": credentials["password"]}, valid=True)
    request("/api/v2/accounts/me", expected=401)
    request("/api/v2/accounts/logout", {})
    request("/api/v2/accounts/logout-all", {})
    request("/api/v2/accounts/login", credentials, expected=401, valid=True)
    request("/api/v2/accounts/recovery/request", {"email": "unknown@example.invalid"}, valid=True)
    request("/api/v2/accounts/recovery/confirm", {"token": "invalid", "password": "fresh-password-7391"}, expected=400, valid=True)
    request("/api/v2/sync/pull", expected=405, method="POST", payload={})
    # 405 has no content schema, so it is asserted above rather than captured.
    captures.pop()
    print("PASS: restart persistence, password-confirmed deletion/session revocation, anonymous logout and generic recovery", flush=True)
    if args.backend_tests:
        # Disposable DB only: the real application role remains NOCREATEDB.
        run("exec", "-T", "db", "psql", "-U", "postgres", "-d", "space_boxes_v2", "-c", "ALTER ROLE spaceboxes CREATEDB")
        try:
            run("exec", "-T", "-e", "DJANGO_DEBUG=1", "app", "v2/.venv/bin/python", "v2/backend/manage.py", "test", "config", "accounts", "productivity", "--noinput")
        finally:
            run("exec", "-T", "db", "psql", "-U", "postgres", "-d", "space_boxes_v2", "-c", "ALTER ROLE spaceboxes NOCREATEDB")
        print("PASS: full Django CI suites (config/accounts/productivity)", flush=True)
finally:
    run("logs", "--no-color", ok=False)
    run("down", "--volumes", "--remove-orphans")
    (private / "captures.json").write_text(json.dumps(captures, indent=2) + "\n")
    log.close()

"""Exercise the release launcher over real TLS against disposable PostgreSQL DBs.

Run with v2/.venv/bin/python. Requires openssl, PostgreSQL client tools and a
reachable PostgreSQL role with CREATEDB; uses SPACE_BOXES_DB_* connection vars.
No existing database is migrated, written or restored. Logs remain in /tmp.
"""

import argparse
import contextlib
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

import psycopg
from psycopg import sql


ROOT = Path(__file__).resolve().parents[2]
MANAGE = ROOT / "v2/backend/manage.py"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rollback-ref", required=True,
                        help="Compatible ancestor commit containing the release launcher")
    parser.add_argument("--pg-bin", type=Path,
                        help="Directory containing pg_dump/pg_restore matching the server major")
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 14):
        raise RuntimeError("Python 3.14 required")
    pg_tools = {tool: str(args.pg_bin / tool) if args.pg_bin else tool
                for tool in ("pg_dump", "pg_restore")}
    for tool in ("openssl", *pg_tools.values()):
        if not shutil.which(tool):
            raise RuntimeError(f"Required tool unavailable: {tool}")
    logs = Path(tempfile.mkdtemp(prefix="space-boxes-release-"))
    print(f"Logs: {logs}", flush=True)
    rollback_ref = subprocess.check_output(
        ["git", "rev-parse", "--verify", f"{args.rollback_ref}^{{commit}}"],
        cwd=ROOT, text=True,
    ).strip()
    subprocess.run(["git", "merge-base", "--is-ancestor", rollback_ref, "HEAD"],
                   cwd=ROOT, check=True)
    rollback_root = logs / "rollback"
    archive = logs / "rollback.tar"
    subprocess.run(["git", "archive", "--format=tar", "--output", str(archive),
                    rollback_ref, "v2"], cwd=ROOT, check=True)
    with tarfile.open(archive) as source:
        source.extractall(rollback_root, filter="data")
    if not (rollback_root / "v2/scripts/start-staging.sh").is_file():
        raise RuntimeError("Rollback revision must contain the release launcher")
    # This bounded rehearsal reuses the environment only for an unchanged runtime contract.
    for name in ("requirements.txt", "requirements-release.txt"):
        previous = rollback_root / "v2" / name
        if previous.exists() and previous.read_bytes() != (ROOT / "v2" / name).read_bytes():
            raise RuntimeError("Changed rollback dependencies require a separately prepared environment")
    (rollback_root / "v2/.venv").symlink_to(ROOT / "v2/.venv", target_is_directory=True)
    print(f"Rollback revision: {rollback_ref}", flush=True)
    db_name = "sb_release_" + secrets.token_hex(6)
    restore_name = db_name + "_restore"
    db = {
        "host": os.environ.get("SPACE_BOXES_DB_HOST", "127.0.0.1"),
        "port": os.environ.get("SPACE_BOXES_DB_PORT", "5434"),
        "user": os.environ.get("SPACE_BOXES_DB_USER", "spaceboxes"),
        "password": os.environ.get("SPACE_BOXES_DB_PASSWORD", ""),
        "sslmode": os.environ.get("SPACE_BOXES_DB_SSLMODE", "prefer"),
        "connect_timeout": 5,
    }
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("DJANGO_", "SPACE_BOXES_", "GUNICORN_"))}
    env.update({
        "DJANGO_DEBUG": "0", "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "DJANGO_ALLOWED_HOSTS": "127.0.0.1,localhost",
        "SPACE_BOXES_DB_NAME": db_name, "SPACE_BOXES_DB_HOST": db["host"],
        "SPACE_BOXES_DB_PORT": db["port"], "SPACE_BOXES_DB_USER": db["user"],
        "SPACE_BOXES_DB_PASSWORD": db["password"] or "isolated-local-test",
        "SPACE_BOXES_DB_SSLMODE": db["sslmode"],
        "SPACE_BOXES_EMAIL_HOST": "localhost",
        "SPACE_BOXES_FROM_EMAIL": "test@example.invalid",
        "SPACE_BOXES_WORKERS": "1",
    })
    process = None
    created = []
    with psycopg.connect(dbname="postgres", autocommit=True, **db) as admin:
        server_major = admin.info.server_version // 10000
        for tool in pg_tools.values():
            version = subprocess.check_output([tool, "--version"], text=True)
            match = re.search(r"\(PostgreSQL\) (\d+)", version)
            if not match or int(match[1]) != server_major:
                raise RuntimeError(f"{tool} must match PostgreSQL server major {server_major}")
        try:
            for name in (db_name, restore_name):
                admin.execute(sql.SQL("CREATE DATABASE {} ").format(sql.Identifier(name)))
                created.append(name)
            with (logs / "commands.log").open("w") as log:
                def run(args, **kwargs):
                    return subprocess.run(args, cwd=ROOT, env=env, check=True,
                                          stdout=log, stderr=subprocess.STDOUT, timeout=90, **kwargs)

                run([sys.executable, str(MANAGE), "migrate", "--no-input"])
                run([sys.executable, str(MANAGE), "migrate", "--check"])
                run([sys.executable, str(MANAGE), "makemigrations", "--check", "--dry-run"])
                print("PASS fresh-database migrations and model drift", flush=True)
                # Record a real account in the backup; no email is dispatched.
                with psycopg.connect(dbname=db_name, **db) as conn:
                    migration_count = conn.execute("SELECT count(*) FROM django_migrations").fetchone()[0]

                # An unmigrated DB must fail before the server can bind.
                bad_env = {**env, "SPACE_BOXES_DB_NAME": restore_name}
                result = subprocess.run(["sh", "v2/scripts/start-staging.sh"], cwd=ROOT,
                                        env=bad_env, stdout=log, stderr=subprocess.STDOUT, timeout=30)
                assert result.returncode != 0, "Unmigrated database unexpectedly started"
                print("PASS unmigrated database prevents startup", flush=True)

                cert, key = logs / "localhost.crt", logs / "localhost.key"
                run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                     "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
                     "-keyout", str(key), "-out", str(cert)])
                key.chmod(0o600)
                with socket.socket() as listener:
                    listener.bind(("127.0.0.1", 0))
                    port = listener.getsockname()[1]
                env.update({"SPACE_BOXES_BIND": f"127.0.0.1:{port}",
                            "SPACE_BOXES_TLS_CERT": str(cert), "SPACE_BOXES_TLS_KEY": str(key)})
                jar = http.cookiejar.CookieJar()
                opener = urllib.request.build_opener(
                    urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(cert))),
                    urllib.request.HTTPCookieProcessor(jar),
                )
                base = f"https://127.0.0.1:{port}"

                def request(path, data=None, headers=None):
                    req = urllib.request.Request(base + path, data=data, headers=headers or {})
                    try:
                        return opener.open(req, timeout=5)
                    except urllib.error.HTTPError as error:
                        return error

                def start_server(checkout, environment, log_path):
                    nonlocal process
                    with log_path.open("w") as server_log:
                        process = subprocess.Popen(["sh", "v2/scripts/start-staging.sh"],
                                                   cwd=checkout, env=environment,
                                                   stdout=server_log, stderr=subprocess.STDOUT)
                    deadline = time.monotonic() + 30
                    while True:
                        if process.poll() is not None:
                            raise RuntimeError(f"Staging startup exited; see {log_path}")
                        try:
                            with request("/") as response:
                                assert response.status == 200
                                assert b"Local planner" in response.read()
                                assert response.headers["Strict-Transport-Security"] == "max-age=3600"
                            break
                        except (OSError, urllib.error.URLError):
                            if time.monotonic() >= deadline:
                                raise RuntimeError("Staging readiness timeout")
                            time.sleep(.1)

                def stop_server():
                    nonlocal process
                    process.terminate()
                    process.wait(timeout=15)
                    process = None

                start_server(ROOT, env, logs / "server.log")
                try:
                    print("PASS real Gunicorn TLS startup, deploy checks and frontend", flush=True)
                    for path, mime in (("/js/app.js", "javascript"),
                                       ("/js/persistence/planning-store.js", "javascript"),
                                       ("/css/planner.css", "text/css"),
                                       ("/static/admin/css/base.css", "text/css")):
                        with request(path) as response:
                            assert response.status == 200, path
                            assert mime in response.headers["Content-Type"], path
                            assert response.read(), path
                            assert response.headers["X-Content-Type-Options"] == "nosniff"
                            assert "max-age=0" in response.headers["Cache-Control"]
                    for path in ("/tests/persistence.html", "/js/focus/IMPLEMENTATION.md", "/.env", "/unknown/"):
                        with request(path) as response:
                            assert response.status == 404, path
                            assert b"Using the URLconf" not in response.read()
                    print("PASS collected module/admin assets, cache policy and private-path exclusion", flush=True)
                    with request("/api/v2/csrf") as response:
                        csrf = json.load(response)["csrfToken"]
                        assert "Secure" in response.headers["Set-Cookie"]
                    with request("/api/v2/accounts/register", data=json.dumps({
                        "email": "release@example.invalid", "password": "Release-only-password-987!",
                    }).encode(), headers={"Content-Type": "application/json", "X-CSRFToken": csrf,
                                          "Origin": base}) as response:
                        assert response.status == 201, response.read()
                    cookie = next(cookie for cookie in jar if cookie.name == "spaceboxes_session")
                    assert cookie.secure and cookie.has_nonstandard_attr("HttpOnly")
                    with request("/api/v2/accounts/me") as response:
                        assert response.status == 200
                        assert b"release@example.invalid" in response.read()
                    with request("/api/v2/accounts/login", data=b"{}") as response:
                        assert response.status == 403
                    with request("/", headers={"Host": "evil.invalid"}) as response:
                        assert response.status == 400
                    print("PASS real account/session, Secure/HttpOnly cookie, CSRF and host enforcement", flush=True)
                finally:
                    stop_server()

                pg_env = {**env, "PGHOST": db["host"], "PGPORT": db["port"],
                          "PGUSER": db["user"], "PGPASSWORD": db["password"], "PGSSLMODE": db["sslmode"]}
                backup = logs / "database.dump"
                for args in ([pg_tools["pg_dump"], "--format=custom", "--no-owner", "--no-acl", "--file", str(backup), db_name],
                             [pg_tools["pg_restore"], "--exit-on-error", "--no-owner", "--no-acl", "--dbname", restore_name, str(backup)]):
                    subprocess.run(args, env=pg_env, check=True, stdout=log,
                                   stderr=subprocess.STDOUT, timeout=60)
                with psycopg.connect(dbname=restore_name, **db) as conn:
                    assert conn.execute("SELECT count(*) FROM django_migrations").fetchone()[0] == migration_count
                    assert conn.execute("SELECT count(*) FROM accounts_user WHERE email = 'release@example.invalid'").fetchone()[0] == 1
                print("PASS PostgreSQL dump/isolated restore preserves migrations and account", flush=True)
                # Roll back code and data together in isolation; retain the signed session.
                rollback_env = {**env, "SPACE_BOXES_DB_NAME": restore_name}
                start_server(rollback_root, rollback_env, logs / "rollback-server.log")
                try:
                    with request("/api/v2/accounts/me") as response:
                        assert response.status == 200
                        assert b"release@example.invalid" in response.read()
                    with request("/js/app.js") as response:
                        assert response.status == 200
                        assert response.read() == (rollback_root / "v2/frontend/js/app.js").read_bytes()
                finally:
                    stop_server()
                print("PASS previous code starts against isolated restore with session and assets intact", flush=True)
        finally:
            if process is not None:
                process.terminate()
                with contextlib.suppress(subprocess.TimeoutExpired):
                    process.wait(timeout=15)
                if process.poll() is None:
                    process.kill()
                    process.wait()
            for name in reversed(created):
                admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
    print("PASS staging verification; disposable databases removed", flush=True)


if __name__ == "__main__":
    main()

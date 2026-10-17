#!/usr/bin/env python3
"""Real local release gates. Creates its own loopback-only PostgreSQL cluster.

Never reads or connects to an existing database. External mail and public
staging are deliberately separate acceptance gates. Requires non-root user,
PostgreSQL binaries, v2/.venv dependencies, npm ci, and Playwright Chrome.
"""
import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "v2/backend/manage.py"
FRONTEND = ROOT / "v2/react-frontend"


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser-only", action="store_true")
    args = parser.parse_args()
    import django  # noqa: dependency preflight before any process/mutation
    import psycopg
    if os.geteuid() == 0:
        raise SystemExit("Run as an unprivileged user: PostgreSQL initdb refuses root.")
    pg_bin = Path(os.environ.get("SPACE_BOXES_QA_PG_BIN", "/usr/lib/postgresql/18/bin"))
    for binary in ("initdb", "pg_ctl"):
        if not (pg_bin / binary).is_file():
            raise SystemExit("Set SPACE_BOXES_QA_PG_BIN to installed PostgreSQL binaries.")
    if not shutil.which("npm") or not (FRONTEND / "node_modules/.bin/playwright").exists():
        raise SystemExit("Install Node >=22.12, then run npm ci in v2/react-frontend.")
    # Exclude any inherited application/DB credentials or libpq service config.
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("SPACE_BOXES_", "DJANGO_", "PG"))}
    with tempfile.TemporaryDirectory(prefix="space-boxes-local-qa-") as directory:
        temp = Path(directory)
        db_dir, mail_dir = temp / "postgres", temp / "mail"
        mail_dir.mkdir(mode=0o700)
        db_port, web_port = port(), port()
        env.update({"DJANGO_DEBUG": "1", "SPACE_BOXES_DB_HOST": "127.0.0.1",
                    "SPACE_BOXES_DB_PORT": str(db_port), "SPACE_BOXES_DB_NAME": "space_boxes_disposable_qa",
                    "SPACE_BOXES_DB_USER": os.environ.get("USER", ""), "SPACE_BOXES_DB_PASSWORD": "",
                    "SPACE_BOXES_DB_SSLMODE": "disable", "SPACE_BOXES_DEV_EMAIL_DIR": str(mail_dir),
                    "SPACE_BOXES_PUBLIC_WEB_URL": f"http://127.0.0.1:{web_port}",
                    "SPACE_BOXES_TEST_URL": f"http://127.0.0.1:{web_port}"})
        if os.environ.get("SPACE_BOXES_BROWSER"):
            env["SPACE_BOXES_BROWSER"] = os.environ["SPACE_BOXES_BROWSER"]
        elif shutil.which("google-chrome"):
            env["SPACE_BOXES_BROWSER"] = shutil.which("google-chrome")
        def run(*command, cwd=ROOT):
            subprocess.run(command, cwd=cwd, env=env, check=True)
        run(str(pg_bin / "initdb"), "-D", str(db_dir), "-A", "trust", "--encoding=UTF8", "--no-locale")
        run(str(pg_bin / "pg_ctl"), "-D", str(db_dir), "-l", str(temp / "postgres.log"),
            "-o", f"-h 127.0.0.1 -p {db_port} -k {temp}", "-w", "start")
        server = None
        try:
            run("npm", "run", "build", cwd=FRONTEND)
            with psycopg.connect(host="127.0.0.1", port=db_port, dbname="postgres", autocommit=True) as db:
                db.execute("CREATE DATABASE space_boxes_disposable_qa")
            if not args.browser_only:
                run(sys.executable, str(BACKEND), "test", "accounts", "config", "productivity", "--noinput")
                run(sys.executable, str(BACKEND), "makemigrations", "--check", "--dry-run")
            run(sys.executable, str(BACKEND), "migrate", "--noinput")
            with (temp / "django.log").open("w") as log:
                server = subprocess.Popen([sys.executable, str(BACKEND), "runserver", f"127.0.0.1:{web_port}", "--noreload"],
                                          cwd=ROOT, env=env, stdout=log, stderr=log)
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError("Local Django exited; no production service was accessed.")
                    try:
                        with urllib.request.urlopen(env["SPACE_BOXES_TEST_URL"], timeout=1) as response:
                            if response.status == 200: break
                    except OSError: time.sleep(.1)
                else: raise RuntimeError("Local Django failed readiness")
                run("npm", "run", "test:api", cwd=FRONTEND)
                run("npx", "playwright", "test", cwd=FRONTEND)
            print("PASS local PostgreSQL, migration, build, API transport, real browser and mocked failure gates.")
            print("NOT VERIFIED: isolated public staging, Supabase staging persistence, real inbox delivery.")
        finally:
            if server is not None:
                server.terminate()
                try: server.wait(timeout=10)
                except subprocess.TimeoutExpired: server.kill(); server.wait()
            run(str(pg_bin / "pg_ctl"), "-D", str(db_dir), "-m", "fast", "-w", "stop")


if __name__ == "__main__":
    main()

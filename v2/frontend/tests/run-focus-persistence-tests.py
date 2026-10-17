"""Real Chrome focus/restart tests plus existing persistence regressions.

Serves isolated on-disk test fixtures; all persistence assertions and scenarios run.
"""

import functools
import http.server
import json
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time

# Per-phase expected PASS counts: every phase must report exactly its count
# before the next browser launch, so an incomplete or stale phase cannot pass.
EXPECTED_CHECKS = {
    "persistence": {"suite": 20, "restart": 1},
    "focus-persistence": {"suite": 22, "restart-running": 2, "restart-paused": 3},
}


def wait_for_profile_release(profile, process, timeout=15):
    # Same failure mode as run-browser-tests.py: launching the next phase before
    # the previous browser has released its Singleton* locks can yield a fresh
    # empty IndexedDB. Only orders the phases; phase assertions decide pass/fail.
    locks = [pathlib.Path(profile, name) for name in
             ("SingletonLock", "SingletonSocket", "SingletonCookie")]
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None and not any(lock.exists() for lock in locks):
            return
        time.sleep(.05)
    print(f"NOTE profile locks still present after {timeout}s: "
          f"{[str(lock) for lock in locks if lock.exists()] or 'process alive'}", flush=True)


def discard_profile(profile, attempts=10):
    # Chrome may still hold profile files briefly after exit (observed as
    # "OSError: [Errno 39] Directory not empty" in Python's rmtree). Retry
    # briefly and report; never mask the already-posted test results.
    for _ in range(attempts):
        try:
            shutil.rmtree(profile)
            return
        except OSError:
            time.sleep(0.2)
    print(f"WARNING: {profile} could not be removed (Chrome profile teardown race); "
          "the test results above are unaffected.", flush=True)


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no tests executed.")
    root = pathlib.Path(__file__).resolve().parents[1]
    received = threading.Event()
    reports = []

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if self.path != "/results":
                self.send_error(404)
                return
            reports.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(200)
            self.end_headers()
            received.set()

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(Handler, directory=str(root))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        grand_total = 0
        for name, phases in (
            ("persistence", ("suite", "restart")),
            ("focus-persistence", ("suite", "restart-running", "restart-paused")),
        ):
            profile = tempfile.mkdtemp(prefix=f"v2-{name}-")
            try:
                suite_reports = []
                previous_process = None
                for phase in phases:
                    received.clear()
                    if previous_process is not None:
                        wait_for_profile_release(profile, previous_process)
                    with tempfile.TemporaryFile(mode="w+") as log:
                        process = subprocess.Popen([
                            browser, "--headless", "--disable-gpu", "--no-first-run", "--disable-popup-blocking",
                            "--no-default-browser-check", f"--user-data-dir={profile}",
                            f"http://127.0.0.1:{server.server_port}/tests/{name}.html?{phase}",
                        ], stdout=log, stderr=log)
                        try:
                            if not received.wait(50):
                                log.seek(0)
                                raise SystemExit(f"Browser timed out ({name}/{phase}):\n{log.read()[-4000:]}")
                        finally:
                            process.terminate()
                            try:
                                process.wait(timeout=5)
                            except subprocess.TimeoutExpired:
                                process.kill()
                                process.wait()
                    previous_process = process
                    report = reports[-1]
                    suite_reports.append(report)
                    for check in report["checks"]:
                        print(check, flush=True)
                    if report.get("error"):
                        raise SystemExit(f"{name}/{phase}: {report['error']}")
                    expected = EXPECTED_CHECKS[name][phase]
                    if len(report["checks"]) != expected:
                        raise SystemExit(f"{name}/{phase}: expected {expected} checks, received "
                                         f"{len(report['checks'])}; phase incomplete before the next browser launch.")
                grand_total += sum(len(report["checks"]) for report in suite_reports)
            finally:
                discard_profile(profile)
        print(f"PASS {grand_total} real-Chrome checks; "
              "planning persistence + focus, actual reload + process restarts")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

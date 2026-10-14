"""Run connected task-sync regressions (reload, retry, conflict) in real Chrome.

Uses Python stdlib, an ephemeral browser profile and a stubbed fetch boundary;
the connection, payload and persistence modules run unmodified with real
IndexedDB. No server or user data is touched.
"""

import functools
import http.server
import json
import pathlib
import shutil
import subprocess
import tempfile
import threading


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no tests executed.")
    received = threading.Event()
    reports = []
    root = pathlib.Path(__file__).resolve().parents[3]

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
        with tempfile.TemporaryDirectory(prefix="v2-connected-sync-",
                                         ignore_cleanup_errors=True) as profile:
            with tempfile.TemporaryFile(mode="w+") as log:
                command = [browser, "--headless", "--disable-gpu", "--no-first-run",
                           "--no-default-browser-check", f"--user-data-dir={profile}",
                           f"http://127.0.0.1:{server.server_port}/v2/frontend/tests/connected-sync.html"]
                process = subprocess.Popen(command, stdout=log, stderr=log)
                try:
                    if not received.wait(60):
                        log.seek(0)
                        raise SystemExit(f"Browser tests timed out:\n{log.read()[-4000:]}")
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            report = reports[-1]
            for check in report["checks"]:
                print(check)
            if report.get("error"):
                raise SystemExit(report["error"])
            count = sum(check.startswith("PASS ") for check in report["checks"])
            print(f"PASS {count} real-Chrome connected-sync checks; reload recovery, "
                  "edit upload, retry idempotency and conflict surfacing")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

"""Run Focus-owned domain tests and existing pure planning suites in real Chrome.

Uses Python stdlib and an ephemeral browser profile; no installs or user data.
This verifies pure rules and serialized aggregate replay, not IndexedDB or UI.
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
    root = pathlib.Path(__file__).resolve().parents[1]

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
        with tempfile.TemporaryDirectory(prefix="v2-focus-domain-") as profile:
            with tempfile.TemporaryFile(mode="w+") as log:
                command = [browser, "--headless", "--disable-gpu", "--no-first-run",
                           "--no-default-browser-check", f"--user-data-dir={profile}",
                           f"http://127.0.0.1:{server.server_port}/tests/focus-domain.html"]
                process = subprocess.Popen(command, stdout=log, stderr=log)
                try:
                    if not received.wait(45):
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
            print(f"PASS {count} real-Chrome domain checks; Focus, activity reports + six planning regression suites")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

"""Run native IndexedDB tests in installed Chrome, using only Python stdlib.

The ephemeral origin/profile owns all fixtures; no user's browser data is used.
The second browser process reuses the profile to verify disk persistence.
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
        raise SystemExit("Chrome/Chromium is required; no browser tests executed.")
    root = pathlib.Path(__file__).resolve().parents[1]
    reports = []
    received = threading.Event()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if self.path != "/results":
                self.send_error(404)
                return
            report = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            reports.append(report)
            self.send_response(200)
            self.end_headers()
            received.set()

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(Handler, directory=str(root))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="v2-idb-browser-") as profile:
            for phase in ("suite", "restart"):
                received.clear()
                with tempfile.TemporaryFile(mode="w+") as log:
                    command = [browser, "--headless", "--disable-gpu", "--no-first-run",
                               "--no-default-browser-check", f"--user-data-dir={profile}",
                               f"http://127.0.0.1:{server.server_port}/tests/persistence.html?{phase}"]
                    process = subprocess.Popen(command, stdout=log, stderr=log)
                    try:
                        if not received.wait(45):
                            log.seek(0)
                            raise SystemExit(f"Browser test timed out ({phase}):\n{log.read()[-4000:]}")
                    finally:
                        process.terminate()
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()
                report = reports[-1]
                for result in report["checks"]:
                    print(result)
                if report.get("error"):
                    raise SystemExit(report["error"])
            print(f"PASS {sum(len(r['checks']) for r in reports)} real-browser checks; suite + process restart")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

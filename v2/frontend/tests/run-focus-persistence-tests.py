"""Real Chrome focus/restart tests plus existing persistence regressions.

Shared fixtures stay untouched. Four version-bound fixture expressions are adapted
in memory for schema v2; all existing assertions and test scenarios run.
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
    root = pathlib.Path(__file__).resolve().parents[1]
    fixture = (root / "tests/persistence.test.js").read_text()
    adaptations = {
        'const db = await requestResult(indexedDB.open(DATABASE_NAME, 1));':
            'const db = await requestResult(indexedDB.open(DATABASE_NAME));',
        'const raw = await requestResult(indexedDB.open(DATABASE_NAME, 1));':
            'const raw = await requestResult(indexedDB.open(DATABASE_NAME));',
        'const upgrade = indexedDB.open(DATABASE_NAME, 2);':
            'const upgrade = indexedDB.open(DATABASE_NAME, 3);',
        'assert(newer.version === 2 &&': 'assert(newer.version === 3 &&',
    }
    for before, after in adaptations.items():
        if fixture.count(before) != 1:
            raise SystemExit(f"Fixture changed; review version adaptation: {before}")
        fixture = fixture.replace(before, after)
    received = threading.Event()
    reports = []

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path == "/tests/persistence.test.js":
                data = fixture.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                super().do_GET()

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
        for name, phases in (
            ("persistence", ("suite", "restart")),
            ("focus-persistence", ("suite", "restart-running", "restart-paused")),
        ):
            with tempfile.TemporaryDirectory(prefix=f"v2-{name}-") as profile:
                for phase in phases:
                    received.clear()
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
                    report = reports[-1]
                    for check in report["checks"]:
                        print(check, flush=True)
                    if report.get("error"):
                        raise SystemExit(report["error"])
        print(f"PASS {sum(len(report['checks']) for report in reports)} real-Chrome checks; "
              "planning persistence + focus, actual reload + process restarts")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

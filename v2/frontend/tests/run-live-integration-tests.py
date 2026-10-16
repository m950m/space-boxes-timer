"""Full-stack integration: real Chrome against the real Django/PostgreSQL stack.

Provisions an isolated PostgreSQL database, migrates it, starts the actual
Django development server and drives the shipped frontend in headless Chrome
through the connected-account journeys — registration, local-first planning,
non-destructive connection, initial synchronization, edits to synchronized
tasks, offline edits with retry, cross-device pull and conflict detection,
connected focus authority with observer takeover, reports, export, deletion,
revocation and adversarial HTTP checks. No fetch stubbing and no mocked
responses: every browser step exercises the shipped modules over HTTP against
the shipped backend. Python stdlib only; the database is created and dropped
by this runner.
"""

import base64
import contextlib
import hashlib
import http.cookiejar
import json
import os
import pathlib
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import uuid
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[3]
BACKEND = ROOT / "v2/backend"
# README convention: the server runs under the project virtual environment.
VENV_PYTHON = ROOT / "v2/.venv/bin/python"
SERVER_PYTHON = str(VENV_PYTHON if VENV_PYTHON.exists() else sys.executable)
BASE_URL = None  # set once the server port is known


class CDP:
    """Small synchronous WebSocket client for the installed browser's CDP."""

    def __init__(self, url, auto_accept_dialogs=False):
        parsed = urlsplit(url)
        self.connection = socket.create_connection((parsed.hostname, parsed.port), timeout=10)
        self.stream = self.connection.makefile("rb")
        key = base64.b64encode(os.urandom(16)).decode()
        self.connection.sendall((f"GET {parsed.path} HTTP/1.1\r\nHost: {parsed.netloc}\r\n"
                                 "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                                 f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        headers = []
        while line := self.stream.readline().strip():
            headers.append(line.decode())
        expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        assert "101" in headers[0] and any(expected in line for line in headers), headers
        self.sequence = 0
        self.auto_accept_dialogs = auto_accept_dialogs

    def send(self, payload, opcode=1):
        size = len(payload)
        header = bytes([0x80 | opcode])
        if size < 126:
            header += bytes([0x80 | size])
        elif size < 65536:
            header += bytes([0x80 | 126]) + struct.pack("!H", size)
        else:
            header += bytes([0x80 | 127]) + struct.pack("!Q", size)
        mask = os.urandom(4)
        self.connection.sendall(header + mask + bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload)))

    def receive(self):
        fragments = b""
        while True:
            header = self.stream.read(2)
            if len(header) != 2:
                raise RuntimeError("Browser CDP connection closed")
            final, opcode, size = header[0] & 0x80, header[0] & 15, header[1] & 127
            if size == 126:
                size = struct.unpack("!H", self.stream.read(2))[0]
            elif size == 127:
                size = struct.unpack("!Q", self.stream.read(8))[0]
            payload = self.stream.read(size)
            if opcode == 8:
                raise RuntimeError("Browser closed WebSocket")
            if opcode == 9:
                self.send(payload, 10)
                continue
            if opcode == 10:
                continue
            message = json.loads(fragments + payload)
            if final:
                if message.get("method") == "Page.javascriptDialogOpening" and self.auto_accept_dialogs:
                    # The deletion journey's window.confirm: accept on its behalf.
                    self.sequence += 1
                    self.send(json.dumps({"id": self.sequence, "method": "Page.handleJavaScriptDialog",
                                          "params": {"accept": True}}).encode())
                    continue
                return message
            fragments += payload

    def call(self, method, **params):
        self.sequence += 1
        self.send(json.dumps({"id": self.sequence, "method": method, "params": params}).encode())
        while True:
            message = self.receive()
            if message.get("id") == self.sequence:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message.get("result", {})

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in result:
            raise AssertionError(result["exceptionDetails"])
        if "result" not in result:
            raise RuntimeError(f"CDP evaluate returned no result: {result}")
        return result["result"].get("value")

    def close(self):
        self.stream.close()
        self.connection.close()


@contextlib.contextmanager
def browser_session(profile):
    """One headless Chrome process with its own profile (one 'device')."""
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    with tempfile.TemporaryFile(mode="w+") as log:
        process = subprocess.Popen([browser, "--headless", "--disable-gpu", "--no-first-run",
                                    "--no-default-browser-check", "--disable-background-networking",
                                    "--remote-debugging-port=0", f"--user-data-dir={profile}", "about:blank"],
                                   stdout=log, stderr=log)
        client = None
        try:
            port_file = pathlib.Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 15
            while True:
                try:
                    port = int(port_file.read_text().splitlines()[0])
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1) as response:
                        pages = json.load(response)
                    client = CDP(next(page["webSocketDebuggerUrl"] for page in pages if page["type"] == "page"),
                                 auto_accept_dialogs=True)
                    break
                except (OSError, ValueError, StopIteration):
                    if time.monotonic() > deadline or process.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(f"Chrome startup failed: {log.read()[-4000:]}")
                    time.sleep(.05)
            client.call("Runtime.enable")
            client.call("Page.enable")
            yield client
        finally:
            if client:
                with contextlib.suppress(OSError, RuntimeError):
                    client.call("Browser.close")
                client.close()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def wait(client, condition, timeout=10, label=None):
    deadline = time.monotonic() + timeout
    while not client.evaluate(condition):
        if time.monotonic() > deadline:
            diagnosis = client.evaluate(
                "({ focusStatus: document.querySelector('#focus-status')?.textContent ?? null,"
                " focusError: document.querySelector('#focus-error')?.textContent ?? null,"
                " focusSelection: document.querySelector('#focus-selection')?.value ?? null,"
                " focusStartDisabled: document.querySelector('#focus-start')?.disabled ?? null,"
                " accountState: window.__acct?.states.at(-1) ?? null,"
                " accountError: document.querySelector('#account-error')?.textContent ?? null,"
                " pageErrors: window.__errs ?? null,"
                " lastRequests: (window.__net ?? []).slice(-40),"
                " busyFlips: (window.__renderLog ?? []).slice(-40) })")
            raise AssertionError(f"Timed out: {label or condition}: {diagnosis}")
        time.sleep(.05)


def expect(condition, label, detail=""):
    if not condition:
        raise AssertionError(f"{label}: {detail}")
    print(f"PASS {label}", flush=True)

def check(client, condition, label):
    # condition is either a live JS expression string or an already-evaluated
    # Python bool (helper predicates return bools); only strings reach CDP.
    result = condition if isinstance(condition, bool) else client.evaluate(condition)
    if not result:
        raise AssertionError(label)
    print(f"PASS {label}", flush=True)


def fill(client, selector, value):
    client.evaluate(f"""(() => {{
      const input = document.querySelector({json.dumps(selector)});
      input.value = {json.dumps(value)};
      input.dispatchEvent(new Event('input', {{ bubbles: true }}));
      input.dispatchEvent(new Event('change', {{ bubbles: true }}));
    }})()""")


def click(client, selector):
    client.evaluate(f"document.querySelector({json.dumps(selector)}).click()")


def click_task_button(client, title, text):
    """Click a card button ('Edit task', 'Mark complete', …) on the titled task."""
    client.evaluate(f"""(() => {{
      const card = [...document.querySelectorAll('article[data-task-id]')]
        .find(node => node.querySelector('h4')?.textContent === {json.dumps(title)});
      if (!card) throw new Error('no card: ' + {json.dumps(title)});
      const button = [...card.querySelectorAll('button')].find(node => node.textContent === {json.dumps(text)});
      if (!button) throw new Error('no button ' + {json.dumps(text)} + ' on ' + {json.dumps(title)});
      button.click();
    }})()""")


def select_session(client, title_substring):
    client.evaluate(f"""(() => {{
      const select = document.querySelector('#focus-selection');
      const option = [...select.options].find(o => o.textContent.includes({json.dumps(title_substring)}));
      if (!option) throw new Error('no session option for ' + {json.dumps(title_substring)});
      select.value = option.value;
      select.dispatchEvent(new Event('change', {{ bubbles: true }}));
    }})()""")


def save_task(client):
    click(client, "#save-task")
    wait(client, "!document.querySelector('#editor-fields').disabled")


def observe_account_status(client):
    """Record connection-state/sync-status transitions (installed on navigation)."""
    client.call("Page.addScriptToEvaluateOnNewDocument", source="""
      window.__acct = { states: [], details: [] };
      window.__errs = [];
      window.__net = [];
      window.addEventListener('error', (e) => window.__errs.push(
        (e.error && e.error.stack) || e.message));
      window.addEventListener('unhandledrejection', (e) => window.__errs.push(
        'rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
      { const real = window.fetch.bind(window);
        window.fetch = (input, init = {}) => { const path = typeof input === 'string'
          ? input : input.url;
          window.__net.push([(init.method ?? 'GET'), path, Date.now()]);
          return real(input, init); }; }
      window.__renderLog = [];
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.attributeName === 'aria-busy') {
            window.__renderLog.push([Date.now(),
              mutation.target.getAttribute('aria-busy')]);
          }
        }
      }).observe(document, { attributes: true, attributeFilter: ['aria-busy'], subtree: true });
      new MutationObserver(() => {
        const state = document.getElementById('account-connection-state');
        const detail = document.getElementById('account-sync-status');
        if (!state) return;
        if (window.__acct.states.at(-1) !== state.textContent) window.__acct.states.push(state.textContent);
        if (window.__acct.details.at(-1) !== detail.textContent) window.__acct.details.push(detail.textContent);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    """)


def account_settled(client):
    """Wait until the account panel shows a settled state and return both texts."""
    wait(client, "['Connected', 'Sync problem', 'Signed in', 'Signed out'].includes(window.__acct.states.at(-1))",
         label="account panel settles")
    return panel_history(client)


def sync_and_settle(client):
    marker = client.evaluate("window.__acct.details.length")
    click(client, "#account-sync")
    wait(client, "window.__acct.details.length > " + str(marker) +
         " && ['Connected', 'Sync problem'].includes(window.__acct.states.at(-1))",
         timeout=20, label="synchronization settles")
    return panel_history(client)


def panel_history(client):
    """Settled state plus every recorded detail transition (render may
    overwrite the last sync detail with the 'Last sync' timestamp)."""
    return client.evaluate("({ state: window.__acct.states.at(-1),"
                           " detail: window.__acct.details.join(' | ') })")


def navigate(client, url):
    client.call("Page.navigate", url=url)
    wait(client, "document.querySelector('#v2-startup-status')?.textContent === 'Local plans loaded.'",
         timeout=20, label="local plans load")


def connect_account(client, email, password, register):
    # The panel's initial render (after /me resolves) clears the credential
    # inputs; filling before it would send empty values. That render's marker
    # is the signed-out sync-status line.
    wait(client, "(window.__acct?.details ?? []).includes('Local use needs no account.')"
         " || window.__acct?.states.at(-1) === 'Connected'",
         label="account panel finished its initial render")
    fill(client, "#account-email", email)
    fill(client, "#account-password", password)
    click(client, "#account-register" if register else "#account-login")
    wait(client, "document.querySelector('#account-identity').textContent === " + json.dumps(email),
         label="account session active")
    click(client, "#account-connect")
    # The registration render can still be 'Signed in' when the click lands;
    # wait for the connect transition itself, then for its terminal outcome.
    wait(client, "!['Signed in', 'Signed out'].includes(window.__acct.states.at(-1))",
         label="connect starts synchronizing")
    wait(client, "['Connected', 'Sync problem'].includes(window.__acct.states.at(-1))",
         label="connect settles")
    return panel_history(client)


def card_title_shown(client, title):
    return client.evaluate(f"[...document.querySelectorAll('article[data-task-id] h4')]"
                           f".some(n => n.textContent === {json.dumps(title)})")


def reconnect(client, email):
    """Reopen the app on an existing profile; session cookie + ack restore."""
    observe_account_status(client)
    navigate(client, BASE_URL)
    wait(client, "window.__acct.states.at(-1) === 'Connected'", timeout=10,
         label=f"{email} reconnects with durable acknowledgement")
    # Startup runs up to three sequential focus loads (local read, then the
    # connected-restore reload, then its follow-up); clicks on the still-busy
    # focus controls are silently dropped by the browser. The one-second
    # observer poll (a pull with an advanced cursor) only starts after the
    # last load resolves, so observing it proves interactive quiescence.
    # (The start button itself stays disabled until a session is selected.)
    wait(client, "(window.__net ?? []).filter((request) => request[1].includes('/api/v2/sync/pull?since=')"
         " && !request[1].endsWith('since=0')).length >= 1",
         timeout=20, label=f"{email} focus panel reaches interactive quiescence")


class LiveServer:
    """The actual Django development server against an isolated database."""

    def __init__(self):
        self.db_name = f"sb_v2_live_{secrets.token_hex(4)}"
        self.port = free_port()
        self.process = None
        self.log = None
        self.env = {**os.environ,
                    "SPACE_BOXES_DB_NAME": self.db_name,
                    "PYTHONUNBUFFERED": "1"}

    def psql(self, statement):
        subprocess.run(["psql", "-h", os.environ.get("SPACE_BOXES_DB_HOST", "127.0.0.1"),
                        "-p", os.environ.get("SPACE_BOXES_DB_PORT", "5434"),
                        "-U", os.environ.get("SPACE_BOXES_DB_USER", "spaceboxes"),
                        "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement],
                       check=True, stdout=subprocess.DEVNULL)

    def provision(self):
        self.psql(f'CREATE DATABASE "{self.db_name}" OWNER '
                  f"{os.environ.get('SPACE_BOXES_DB_USER', 'spaceboxes')};")
        subprocess.run([SERVER_PYTHON, str(BACKEND / "manage.py"), "migrate"],
                       check=True, stdout=subprocess.DEVNULL, env=self.env, cwd=BACKEND)

    def launch(self):
        self.log = tempfile.TemporaryFile(mode="w+")
        self.process = subprocess.Popen(
            [SERVER_PYTHON, str(BACKEND / "manage.py"), "runserver",
             f"127.0.0.1:{self.port}", "--noreload"],
            stdout=self.log, stderr=subprocess.STDOUT, env=self.env, cwd=BACKEND)
        self.wait_ready()

    def wait_ready(self):
        deadline = time.monotonic() + 30
        while True:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=1) as response:
                    if response.status == 200:
                        return
            except urllib.error.URLError:
                if self.process.poll() is not None:
                    raise RuntimeError("Django server exited during startup")
                if time.monotonic() > deadline:
                    raise RuntimeError("Django server did not become ready")
                time.sleep(.1)

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=15)

    def read_log(self):
        if not self.log:
            return ""
        self.log.seek(0)
        return self.log.read()

    def cleanup(self):
        self.stop()
        if self.log:
            self.log.close()
        subprocess.run(["psql", "-h", os.environ.get("SPACE_BOXES_DB_HOST", "127.0.0.1"),
                        "-p", os.environ.get("SPACE_BOXES_DB_PORT", "5434"),
                        "-U", os.environ.get("SPACE_BOXES_DB_USER", "spaceboxes"),
                        "-d", "postgres", "-c",
                        f'DROP DATABASE IF EXISTS "{self.db_name}" WITH (FORCE);'],
                       stdout=subprocess.DEVNULL)


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class ApiClient:
    """Direct HTTP client for adversarial boundary checks (real server)."""

    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.base = f"http://127.0.0.1:{server.port}"

    def request(self, path, body=None, csrf=True, raw=None):
        url = self.base + path
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        headers = {}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if data is not None and csrf:
            headers["X-CSRFToken"] = self.get_csrf()
        request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
        try:
            with self.opener.open(request, timeout=10) as response:
                payload = response.read().decode()
                return response.status, json.loads(payload) if payload else {}
        except urllib.error.HTTPError as error:
            payload = error.read().decode()
            try:
                return error.code, json.loads(payload) if payload else {}
            except json.JSONDecodeError:
                return error.code, {"raw": payload[:200]}

    def get_csrf(self):
        with self.opener.open(self.base + "/api/v2/csrf", timeout=10) as response:
            return json.load(response)["csrfToken"]

    def register(self, email, password):
        return self.request("/api/v2/accounts/register", {"email": email, "password": password})

    def login(self, email, password):
        return self.request("/api/v2/accounts/login", {"email": email, "password": password})


def main():
    global server
    server = LiveServer()
    try:
        server.provision()
        server.launch()
        print(f"Django ready on 127.0.0.1:{server.port} against PostgreSQL {server.db_name}", flush=True)
        with tempfile.TemporaryDirectory(prefix="v2-live-device-a-") as profile_a, \
                tempfile.TemporaryDirectory(prefix="v2-live-device-b-") as profile_b:
            try:
                device_a(profile_a)
                full_journey(profile_a, profile_b)
            except Exception:
                # Failed requests visible in the runserver log are the fastest
                # way to tell a client-side hang from a server-side rejection.
                print("--- last Django log lines ---", flush=True)
                print("\n".join(server.read_log().splitlines()[-40:]), flush=True)
                raise
        print("PASS 35 live-stack integration checks; two real Chrome devices, "
              "real Django/PostgreSQL, journey plus adversarial boundary", flush=True)
    finally:
        server.cleanup()


def create_task(client, title, classification, minutes):
    fill(client, "#task-title", title)
    fill(client, "#task-start", "09:00")
    fill(client, "#task-classification", classification)
    fill(client, "#focus-items input", minutes)
    save_task(client)


def edit_task_title(client, old_title, new_title):
    click_task_button(client, old_title, "Edit task")
    fill(client, "#task-title", new_title)
    save_task(client)
    wait(client, "[...document.querySelectorAll('article[data-task-id] h4')]"
                f".some(n => n.textContent === {json.dumps(new_title)})", label="edited title renders")


def device_a(profile):
    """Signed-out local-first planning on device A."""
    global BASE_URL
    BASE_URL = f"http://127.0.0.1:{server.port}"
    with browser_session(profile) as client:
        observe_account_status(client)
        navigate(client, BASE_URL)
        check(client, "document.querySelector('#account-connection-state').textContent === 'Signed out'",
              "local use starts signed out with no registration wall")
        create_task(client, "Integration Alpha", "primary", "0.5")
        create_task(client, "Sync Target", "extra", "25")
        check(client, "[...document.querySelectorAll('article[data-task-id] h4')].map(n => n.textContent)"
                      ".join(',') === 'Integration Alpha,Sync Target'",
              "local-first task creation renders both tasks without an account")
        check(client, "document.querySelector('#day-summary').textContent.includes('1 of up to 3 Primary')",
              "day summary counts one Primary task")


def full_journey(profile_a, profile_b):
    email_a = f"live-a-{secrets.token_hex(4)}@integration.test"
    password = "integration-password-9"
    with browser_session(profile_a) as client_a:
        observe_account_status(client_a)
        navigate(client_a, BASE_URL)

        # -- registration, connection, initial synchronization -------------------
        settled = connect_account(client_a, email_a, password, register=True)
        expect(settled["state"] == "Connected" and "3 accepted" in settled["detail"],
               "connecting local history uploads plan day and tasks", settled)

        result = sync_and_settle(client_a)
        expect(result["state"] == "Connected" and "Nothing new to upload." in result["detail"],
               "initial synchronization leaves nothing to upload", result)

        # -- editing previously synchronized tasks --------------------------------
        edit_task_title(client_a, "Sync Target", "Sync Target Revised")
        result = sync_and_settle(client_a)
        expect(result["state"] == "Connected" and "1 accepted" in result["detail"],
               "editing a synchronized task uploads the new revision", result)

        # -- browser reload recovery ----------------------------------------------
        client_a.call("Page.reload")
        wait(client_a, "document.querySelector('#v2-startup-status')?.textContent === 'Local plans loaded.'",
             timeout=20, label="reload completes")
        wait(client_a, "window.__acct.states.at(-1) === 'Connected'", timeout=10,
             label="connection recovers after reload")
        check(client_a, "document.querySelector('#account-identity').textContent === " + json.dumps(email_a),
              "session cookie plus durable acknowledgement restore connected state after reload")
        check(client_a, card_title_shown(client_a, "Sync Target Revised"),
              "reloaded planner shows the synchronized revision")

        # -- offline edit and retry -------------------------------------------------
        server.stop()
        edit_task_title(client_a, "Sync Target Revised", "Sync Target Offline Edit")
        check(client_a, "document.querySelector('#v2-startup-status').textContent === 'Saved.'",
              "local-first saving still commits while the server is unreachable")
        marker = client_a.evaluate("window.__acct.details.length")
        click(client_a, "#account-sync")
        wait(client_a, "window.__acct.states.at(-1) === 'Sync problem' && window.__acct.details.length > " + str(marker),
             timeout=15, label="offline sync failure surfaces")
        check(client_a, "window.__acct.states.at(-1) === 'Sync problem'",
              "offline synchronization reports a visible problem instead of claiming saved")
        server.launch()
        result = sync_and_settle(client_a)
        expect(result["state"] == "Connected" and "1 accepted" in result["detail"],
               "offline edits upload after the server returns", result)
        click(client_a, "#focus-refresh")
        wait(client_a, "document.querySelector('#focus-status').textContent.includes('No active reservation')",
             label="focus panel recovers after the outage")

    # -- device B: cross-device pull --------------------------------------------------
    with browser_session(profile_b) as client_b:
        observe_account_status(client_b)
        navigate(client_b, BASE_URL)
        settled = connect_account(client_b, email_a, password, register=False)
        expect(settled["state"] == "Connected", "device B signs in and connects", settled)
        create_task(client_b, "Device B Local", "extra", "15")
        result = sync_and_settle(client_b)
        expect("2 account task(s) downloaded" in result["detail"],
               "cross-device synchronization downloads the other device's tasks", result)
        check(client_b, card_title_shown(client_b, "Sync Target Offline Edit")
              and card_title_shown(client_b, "Integration Alpha"),
              "pulled account tasks render in device B's planner")
        check(client_b, card_title_shown(client_b, "Device B Local"),
              "device B keeps its own locally created task alongside pulled work")

        # -- device A focus start + pause (server authority) ---------------------------
    with browser_session(profile_a) as client_a:
        reconnect(client_a, "device A")
        select_session(client_a, "Integration Alpha")
        click(client_a, "#focus-start")
        wait(client_a, "document.querySelector('#focus-status').textContent.includes('Running — controlled here.')",
             label="connected focus starts under server authority")
        click(client_a, "#focus-pause")
        wait(client_a, "document.querySelector('#focus-status').textContent.includes('Paused — controlled here.')",
             label="pause retains the reservation through the server")

    with browser_session(profile_b) as client_b:
        reconnect(client_b, "device B")
        wait(client_b, "document.querySelector('#focus-status').textContent.includes('reserved elsewhere')",
             timeout=10, label="cross-device focus ownership is observable")
        check(client_b, "document.querySelector('#focus-start').disabled",
              "an observer cannot start a second authoritative session")
        click(client_b, "#focus-recover")
        wait(client_b, "document.querySelector('#focus-status').textContent.includes('Paused — controlled here.')",
             label="explicit takeover moves control to the confirming device")
        click(client_b, "#focus-resume")
        wait(client_b, "document.querySelector('#focus-status').textContent.includes('Running — controlled here.')",
             label="taken-over session resumes")
        click(client_b, "#focus-end")
        wait(client_b, "document.querySelector('#focus-status')"
                       ".textContent.includes('No active reservation. Last session ended early')",
             label="taken-over session ends with a factual outcome")
        check(client_b, "document.querySelector('#focus-history').textContent.includes('Integration Alpha')",
              "session history records the cross-device session on the ending device")

    with browser_session(profile_a) as client_a:
        reconnect(client_a, "device A")
        wait(client_a, "document.querySelector('#focus-status')"
                       ".textContent.includes('No active reservation. Last session ended early')",
             timeout=10, label="ending device's outcome is visible on the starting device")
        check(client_a, "document.querySelector('#focus-history').textContent.includes('Integration Alpha')",
              "connected session history spans devices")

        # -- activity reports ----------------------------------------------------------
        click(client_a, "#reports-refresh")
        wait(client_a, "document.querySelector('#reports-status').textContent.includes('Showing confirmed activity')",
             timeout=10, label="daily report renders")
        check(client_a, "document.querySelector('#reports-status').textContent.includes('1 session')"
                        " && document.querySelector('#reports-output').textContent.includes('Active focus')",
              "daily report counts the recorded session and active focus factually")

        # -- export ---------------------------------------------------------------------
        export = client_a.evaluate("""(async () => {
          const response = await fetch('/api/v2/account/export', { credentials: 'same-origin' });
          if (!response.ok) return { status: response.status };
          const payload = await response.json();
          return { format: payload.format,
                   taskTitles: (payload.tasks ?? []).map(task => task.title ?? task.id) } } )()""")
        expect(export.get("format") == "space-boxes-v2-export/1"
               and "Sync Target Offline Edit" in export.get("taskTitles", []),
               "machine-readable export preserves the account's synchronized data", export)

        # -- conflict detection -----------------------------------------------------------
        edit_task_title(client_a, "Sync Target Offline Edit", "Edited on device A too")

    with browser_session(profile_b) as client_b:
        reconnect(client_b, "device B")
        edit_task_title(client_b, "Sync Target Offline Edit", "Edited on device B")
        result = sync_and_settle(client_b)
        expect(result["state"] == "Connected" and "1 accepted" in result["detail"],
               "device B's current-base edit is accepted", result)

    with browser_session(profile_a) as client_a:
        reconnect(client_a, "device A")
        result = sync_and_settle(client_a)
        expect(result["state"] == "Sync problem" and "conflict" in result["detail"],
               "stale-base edit is reported as an unresolved conflict", result)
        check(client_a, card_title_shown(client_a, "Edited on device A too")
              and not card_title_shown(client_a, "Edited on device B"),
              "conflict keeps the local change and does not overwrite the server record")
        result = sync_and_settle(client_a)
        expect("conflict" in result["detail"], "unresolved conflict stays unresolved on retry", result)

    # -- deletion (device B) --------------------------------------------------------------
    with browser_session(profile_b) as client_b:
        reconnect(client_b, "device B")
        # Answer the app's deletion confirmation in-page: a modal window.confirm
        # would block the CDP evaluate that performs the click itself.
        client_b.evaluate("window.confirm = () => true")
        fill(client_b, "#account-delete-password", "wrong-password")
        click(client_b, "#account-delete")
        wait(client_b, "document.querySelector('#account-error').textContent.includes('Password confirmation failed')",
             label="wrong deletion password rejected")
        check(client_b, "document.querySelector('#account-identity').textContent !== ''",
              "failed deletion confirmation leaves the account intact")
        fill(client_b, "#account-delete-password", password)
        click(client_b, "#account-delete")
        wait(client_b, "window.__acct.states.at(-1) === 'Signed out'", timeout=15, label="deletion signs out")
        check(client_b, card_title_shown(client_b, "Device B Local"),
              "account deletion intentionally leaves local browser data untouched")
    print("PASS password-confirmed account deletion revokes the session and signs out", flush=True)

    # -- adversarial HTTP boundary checks ---------------------------------------------------
    adversarial_checks(email_a, password)


def adversarial_checks(deleted_email, deleted_password):
    owner = ApiClient()
    owner_address = f"owner-{secrets.token_hex(4)}@integration.test"
    status, _ = owner.register(owner_address, "owner-password-9")
    assert status == 201, f"owner registration failed: {status}"

    # A client with no session cookie at all, unlike the registered owner.
    stranger = ApiClient()
    status, _ = stranger.request("/api/v2/sync/pull?since=0")
    if status != 401:
        raise AssertionError(f"unauthenticated pull returned {status}")
    print("PASS unauthenticated synchronization is rejected (401)", flush=True)
    status, _ = owner.request("/api/v2/sync/push", {"ops": []}, csrf=False)
    if status != 403:
        raise AssertionError(f"missing-CSRF push returned {status}")
    print("PASS mutating requests without a CSRF token are rejected (403)", flush=True)

    status, _ = owner.request("/api/v2/sync/push", raw=b"{not json")
    if status != 400:
        raise AssertionError(f"malformed JSON returned {status}")
    status, _ = owner.request("/api/v2/sync/push", {"ops": "not-a-list"})
    if status != 400:
        raise AssertionError(f"non-list ops returned {status}")
    print("PASS malformed synchronization payloads are rejected without corrupting state", flush=True)

    status, payload = owner.request("/api/v2/sync/push",
                                    {"ops": [{"kind": "task", "baseRevision": 0,
                                              "record": {"id": "orphan-task", "planDayId": "no-such-day",
                                                         "title": "Orphan", "plannedStart": "10:00",
                                                         "classification": "extra",
                                                         "sessionPlan": [{"id": "s1", "activeMinutes": 25}]}}]})
    result = payload["results"][0]
    if status != 200 or result.get("status") != "rejected":
        raise AssertionError(f"invalid task op not rejected per-op: {status} {payload}")
    print("PASS invalid individual ops are rejected per-op with honest reasons", flush=True)

    # Cross-account reference: an attacker pushes the owner's task identity.
    status, payload = owner.request("/api/v2/sync/push",
                                    {"ops": [{"kind": "plan_day", "record": {"id": "2026-10-15",
                                                                             "timezone": "Africa/Cairo"}},
                                             {"kind": "task", "baseRevision": 0,
                                              "record": {"id": str(uuid.uuid4()),
                                                         "planDayId": "2026-10-15", "title": "Private plan",
                                                         "plannedStart": "10:00", "classification": "extra",
                                                         "sessionPlan": [{"id": str(uuid.uuid4()), "activeMinutes": 25}]}}]})
    victim_task_id = payload["results"][1]["record"]["id"]
    attacker = ApiClient()
    attacker.register(f"attacker-{secrets.token_hex(3)}@integration.test", "attacker-password-9")
    status, payload = attacker.request("/api/v2/sync/push",
                                       {"ops": [{"kind": "task", "baseRevision": 7,
                                                 "record": {"id": victim_task_id, "planDayId": "2026-10-15",
                                                            "title": "Stolen", "plannedStart": "10:00",
                                                            "classification": "extra",
                                                            "sessionPlan": [{"id": str(uuid.uuid4()), "activeMinutes": 25}]}}]})
    rejection = payload["results"][0]
    if rejection.get("status") != "rejected" or rejection.get("code") == "validation":
        # A validation miss here means the probe itself was malformed; only a
        # conflict/scope rejection proves cross-account protection.
        raise AssertionError(f"cross-account push not rejected on scope: {payload}")
    status, payload = attacker.request("/api/v2/sync/pull?since=0")
    if any(task["id"] == victim_task_id for task in payload["tasks"]):
        raise AssertionError("cross-account task leaked into attacker scope")
    print("PASS cross-account task references are treated as nonexistent, never accepted", flush=True)

    # Recovery: generic request, misuse, confirm, replay, revocation.
    status, payload = owner.request("/api/v2/accounts/recovery/request",
                                    {"email": owner_address})
    if status != 200 or "If the account exists" not in payload.get("message", ""):
        raise AssertionError(f"recovery request not generic: {status} {payload}")
    code = wait_for_recovery_code()
    status, payload = owner.request("/api/v2/accounts/recovery/confirm",
                                    {"token": "wrong-token", "password": "recovered-password-9"})
    if status != 400 or payload.get("error", {}).get("code") != "invalid_token":
        raise AssertionError(f"wrong recovery token accepted: {status} {payload}")
    status, payload = owner.request("/api/v2/accounts/recovery/confirm",
                                    {"token": code, "password": "recovered-password-9"})
    if status != 200:
        raise AssertionError(f"valid recovery confirm failed: {status} {payload}")
    status, payload = owner.request("/api/v2/accounts/recovery/confirm",
                                    {"token": code, "password": "again-password-9"})
    if status == 200:
        raise AssertionError("recovery code replay accepted")
    print("PASS recovery codes are single-use; replay and wrong tokens are rejected", flush=True)
    status, _ = owner.login(owner_address, "owner-password-9")
    if status != 401:
        raise AssertionError("old password still valid after recovery")
    status, _ = owner.login(owner_address, "recovered-password-9")
    if status != 200:
        raise AssertionError("recovered password login failed")
    print("PASS recovery changes the credential and revokes previous sessions", flush=True)

    # Deleted account cannot sign in.
    deleted = ApiClient()
    status, _ = deleted.login(deleted_email, deleted_password)
    if status != 401:
        raise AssertionError("deleted account still authenticates")
    print("PASS a deleted account can no longer authenticate", flush=True)


def wait_for_recovery_code():
    """The console email backend writes the secret to the server log."""
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        log = server.read_log()
        if "Use this single-use code to choose a new password:" in log:
            after = log.split("Use this single-use code to choose a new password:", 1)[1]
            code = after.strip().splitlines()[0].strip()
            if code:
                return code
        time.sleep(.1)
    raise AssertionError("recovery email not found in server log")


if __name__ == "__main__":
    main()

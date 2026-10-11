"""Exercise the planner in real Chrome through CDP using only Python stdlib.

All data lives in a disposable origin/profile, reused across browser restart.
The production form handles submissions; CDP sends real Tab/Enter/text input.
"""

import base64
import contextlib
import functools
import hashlib
import http.server
import json
import os
import pathlib
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from urllib.parse import urlsplit


class CDP:
    """Small synchronous WebSocket client for the installed browser's CDP."""

    def __init__(self, url):
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
        self.errors = []

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
            fragments += payload
            if final:
                return json.loads(fragments)

    def call(self, method, **params):
        self.sequence += 1
        self.send(json.dumps({"id": self.sequence, "method": method, "params": params}).encode())
        while True:
            message = self.receive()
            if message.get("method") == "Runtime.exceptionThrown":
                self.errors.append(message["params"])
            if message.get("id") == self.sequence:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message.get("result", {})

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in result:
            raise AssertionError(result["exceptionDetails"])
        return result["result"].get("value")

    def close(self):
        self.stream.close()
        self.connection.close()


@contextlib.contextmanager
def browser_session(browser, profile):
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
                    client = CDP(next(page["webSocketDebuggerUrl"] for page in pages if page["type"] == "page"))
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


def wait(client, condition):
    deadline = time.monotonic() + 10
    while not client.evaluate(condition):
        if time.monotonic() > deadline:
            raise AssertionError(f"Timed out: {condition}")
        time.sleep(.02)


def check(client, condition, label):
    if not client.evaluate(condition):
        details = client.evaluate("({ focus: document.activeElement?.id, durations: [...document.querySelectorAll('#focus-items input')].map(input => input.value), status: document.querySelector('#v2-startup-status')?.textContent, error: document.querySelector('#planner-error')?.textContent, totals: document.querySelector('#focus-totals')?.textContent })")
        raise AssertionError(f"{label}: {details}")
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


def key(client, name, code, modifiers=0):
    client.call("Input.dispatchKeyEvent", type="keyDown", key=name, code=name,
                windowsVirtualKeyCode=code, modifiers=modifiers,
                text="\r" if name == "Enter" else "")
    client.call("Input.dispatchKeyEvent", type="keyUp", key=name, code=name,
                windowsVirtualKeyCode=code, modifiers=modifiers)


def save(client, success=True):
    click(client, "#save-task")
    wait(client, "!document.querySelector('#editor-fields').disabled")
    state = "document.querySelector('#v2-startup-status').textContent"
    check(client, f"{state} === 'Saved.'" if success else f"{state}.startsWith('Error')",
          "committed save feedback" if success else "failed submission never claims saved")
    if success:
        check(client, "document.activeElement.id === 'task-title'",
              "successful save focuses the cleared editor")


def navigate(client, url):
    client.call("Page.navigate", url=url)
    wait(client, "!!document.querySelector('#editor-fields') && !document.querySelector('#editor-fields').disabled")


def stored(client):
    return client.evaluate("(async () => { const store = await (await import('/js/app.js')).planningStore; return await store.load(); })()")


def suite(client, url):
    # Observe user-visible transitions, including startup and transaction saving.
    client.call("Page.addScriptToEvaluateOnNewDocument", source="""
      window.seenStatuses = [];
      new MutationObserver(() => {
        const status = document.getElementById('v2-startup-status');
        if (status && window.seenStatuses.at(-1) !== status.textContent) window.seenStatuses.push(status.textContent);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    """)
    client.call("Emulation.setTimezoneOverride", timezoneId="Africa/Cairo")
    navigate(client, url)
    check(client, "document.querySelector('#task-day').value === new Date().toLocaleDateString('en-CA')",
          "initial Plan Day uses browser local calendar")
    click(client, "#save-task")
    check(client, "document.querySelector('#task-title').getAttribute('aria-invalid') === 'true' && document.activeElement.id === 'task-title'",
          "empty title explains error and focuses invalid field")
    # Real text input and Tab, rather than synthetic keyboard events.
    client.call("Input.insertText", text="Keyboard plan <b>literal</b>")
    key(client, "Tab", 9)
    check(client, "document.activeElement.id === 'task-day' && getComputedStyle(document.activeElement).outlineStyle !== 'none'",
          "Tab navigation and visible keyboard focus")
    fill(client, "#task-day", "")
    click(client, "#save-task")
    check(client, "document.activeElement.id === 'task-day' && document.querySelector('#planner-error').textContent.includes('Plan Day')", "Plan Day is explicitly required")
    fill(client, "#task-day", "2026-10-10")
    click(client, "#save-task")
    check(client, "document.activeElement.id === 'task-start' && document.querySelector('#planner-error').textContent.includes('start')",
          "planned start is explicitly required")
    fill(client, "#task-start", "09:00")
    click(client, "#save-task")
    check(client, "document.querySelector('#planner-error').textContent.includes('duration')", "blank focus duration rejected")
    fill(client, "#focus-items input", "25")
    client.evaluate("document.querySelector('#add-focus').focus()")
    check(client, "document.activeElement.id === 'add-focus'", "add session action accepts focus")
    key(client, "Enter", 13)
    check(client, "document.querySelectorAll('#focus-items input').length === 2", "Enter activates add session action")
    client.call("Input.insertText", text="40")
    check(client, "document.querySelector('#focus-totals').textContent.includes('2 sessions · 65')", "keyboard adds a session and derived totals update")
    fill(client, "#task-note", "Local note")
    client.evaluate("document.querySelector('#save-task').focus()")
    key(client, "Enter", 13)
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Saved.'")
    check(client, "document.querySelectorAll('#extra-tasks article').length === 1 && !document.querySelector('article h3 b')",
          "keyboard saves and title is displayed as safe text")
    check(client, "document.activeElement.id === 'task-title' && getComputedStyle(document.activeElement).outlineStyle !== 'none'",
          "keyboard save returns visible focus to the cleared editor")
    key(client, "Tab", 9)
    check(client, "document.activeElement.id === 'task-day'", "keyboard navigation continues after save")
    check(client, "seenStatuses.includes('Loading local plans…') && seenStatuses.includes('Saving…') && seenStatuses.includes('Saved.')",
          "Loading/Saving/Saved transitions reflect actual operations")
    original = stored(client)["tasks"][0]
    navigate(client, url)
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelector('article').textContent.includes('65 minutes')", "create persists through page reload")
    click(client, "article button")
    fill(client, "#task-title", "Edited plan")
    fill(client, "#task-start", "10:15")
    fill(client, "#task-classification", "primary")
    fill(client, "#focus-items input", "30")
    click(client, "#focus-items li:nth-child(2) [data-action=up]")
    save(client)
    navigate(client, url)
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelector('#primary-tasks article').textContent.includes('Edited plan') && document.querySelector('article').textContent.includes('40 → 30')",
          "edit, classification and ordered durations persist through reload")
    edited = stored(client)["tasks"][0]
    assert edited["id"] == original["id"]
    assert [item["id"] for item in edited["sessionPlan"]] == [item["id"] for item in reversed(original["sessionPlan"])]
    print("PASS task and reordered focus item identities retained", flush=True)
    # Fill the day with three Primary tasks plus one Extra.
    for title, classification in [("Second", "primary"), ("Third", "primary"), ("Fourth", "extra")]:
        fill(client, "#task-title", title)
        fill(client, "#task-day", "2026-10-10")
        fill(client, "#task-start", "11:00")
        fill(client, "#task-classification", classification)
        fill(client, "#focus-items input", "15")
        save(client)
    click(client, "#extra-tasks article button")
    fill(client, "#task-title", "Fourth unsaved")
    fill(client, "#task-classification", "primary")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('three Primary') && document.querySelectorAll('#primary-tasks article').length === 3 && document.querySelector('#extra-tasks h3').textContent === 'Fourth'",
          "fourth promotion rejected atomically, saved list unchanged")
    check(client, "document.querySelector('#task-title').value === 'Fourth unsaved'", "failed save retains editable draft")
    navigate(client, url)
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelectorAll('#primary-tasks article').length === 3 && document.querySelector('#extra-tasks h3').textContent === 'Fourth'",
          "rejected classification and metadata do not survive reload")
    click(client, "#extra-tasks article button")
    fill(client, "#task-title", "Quota unsaved")
    client.evaluate("window.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { throw new DOMException('Test quota exhausted', 'QuotaExceededError'); }")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('quota') && document.querySelector('#extra-tasks h3').textContent === 'Fourth'",
          "real IndexedDB write failure shown without optimistic display")
    client.evaluate("IDBObjectStore.prototype.put = window.originalPut")
    navigate(client, url)
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelector('#extra-tasks h3').textContent === 'Fourth'", "failed write leaves committed task intact after reload")
    click(client, "#extra-tasks article button")
    fill(client, "#task-title", "Quota recovered")
    save(client)
    # Remove only the second focus item from the first task; history stays recoverable.
    click(client, "#primary-tasks article button")
    click(client, "#focus-items li:nth-child(2) [data-action=remove]")
    save(client)
    retained = stored(client)["tasks"][0]
    assert retained["retiredFocusItems"][0]["id"] == original["sessionPlan"][0]["id"]
    print("PASS removed focus identity retained by domain retirement", flush=True)
    # Move to another day, then demote without changing identity.
    click(client, "#primary-tasks article button")
    fill(client, "#task-day", "2026-10-11")
    fill(client, "#task-classification", "extra")
    save(client)
    check(client, "document.querySelector('#view-day').value === '2026-10-11' && document.querySelector('#extra-tasks h3').textContent === 'Edited plan'",
          "explicit reschedule and demotion select destination day")
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelectorAll('article').length === 3", "day filtering separates plans")
    # Concurrent storage revision must not be overwritten by a stale editor.
    click(client, "#primary-tasks article button")
    client.evaluate("""(async () => {
      const { openPlanningStore } = await import('/js/persistence/planning-store.js');
      const other = await openPlanningStore();
      try {
        const current = await other.load();
        const task = current.tasks.find(task => task.title === 'Second');
        await other.commit(other.localScopeId, current.revision, [{ type: 'edit', taskId: task.id, changes: { title: 'Other tab' } }]);
      } finally { other.close(); }
    })()""")
    fill(client, "#task-title", "Stale unsaved")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('Stale')", "stale revision explains recovery without overwriting")
    click(client, "#reload-plans")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Local plans loaded.'")
    check(client, "document.querySelector('#primary-tasks h3').textContent === 'Other tab'", "explicit reload recovers committed plans")
    # Existing payloads must survive edits through the actual UI, not just adapter tests.
    client.evaluate("""(async () => {
      const store = await (await import('/js/app.js')).planningStore;
      const current = await store.load();
      await store.commit(store.localScopeId, current.revision, [{ type: 'create', task: {
        id: 'existing-history', ownershipScopeId: store.localScopeId, planDayId: '2026-10-12',
        title: 'Existing task', plannedStart: { time: '08:30', timezone: 'Africa/Cairo' }, classification: 'extra',
        sessionPlan: [{ id: 'old-a', activeMinutes: 25 }, { id: 'old-b', activeMinutes: 10 }],
        plannedBreaks: [{ id: 'old-break', afterFocusItemId: 'old-a', beforeFocusItemId: 'old-b', breakMinutes: 5 }],
        resources: [{ url: 'javascript:alert(1)', label: 'Stored text only' }],
        sessions: [{ id: 'session-a', plannedItemId: 'old-a', snapshot: { title: 'Historical title', activeMinutes: 25 } }],
        activity: [{ id: 'activity-a', sessionId: 'session-a', activeMinutes: 12 }], parentTaskId: null
      } }]);
    })()""")
    baseline = next(task for task in stored(client)["tasks"] if task["id"] == "existing-history")
    click(client, "#reload-plans")
    wait(client, "!document.querySelector('#editor-fields').disabled")
    fill(client, "#view-day", "2026-10-12")
    click(client, "#extra-tasks article button")
    fill(client, "#task-title", "Existing task edited")
    fill(client, "#focus-items input", "27.5")
    save(client)
    after = next(task for task in stored(client)["tasks"] if task["id"] == "existing-history")
    for field in ("id", "ownershipScopeId", "plannedStart", "plannedBreaks", "resources", "sessions", "activity", "parentTaskId"):
        assert after[field] == baseline[field], f"UI changed existing {field}"
    print("PASS UI edits retain existing history, resources, breaks and context", flush=True)
    check(client, "!document.querySelector('article a') && document.querySelector('article').textContent.includes('37.5 minutes')", "resource execution deferred and fractional durations retained")
    click(client, "#extra-tasks article button")
    click(client, "#focus-items li [data-action=remove]")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('adjacent')", "existing break adjacency restriction preserved")
    click(client, "#cancel-edit")
    check(client, "document.querySelector('#v2-startup-status').getAttribute('role') === 'status' && document.querySelector('#planner-error').getAttribute('role') === 'alert'",
          "screen-reader status and errors are exposed")
    client.call("Emulation.setDeviceMetricsOverride", width=375, height=812, deviceScaleFactor=1, mobile=True)
    check(client, "document.documentElement.scrollWidth <= innerWidth", "planner fits a narrow viewport")
    assert not client.errors, client.errors
    return stored(client)


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no planner tests executed.")
    root = pathlib.Path(__file__).resolve().parents[1]

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_port}/"
        with tempfile.TemporaryDirectory(prefix="v2-planner-browser-") as profile:
            with browser_session(browser, profile) as client:
                expected = suite(client, url)
            with browser_session(browser, profile) as client:
                navigate(client, url)
                assert stored(client) == expected, "Restart changed committed scope/tasks"
                fill(client, "#view-day", "2026-10-11")
                check(client, "document.querySelector('#extra-tasks h3').textContent === 'Edited plan'", "browser process restart retains committed planner")
                assert not client.errors, client.errors
        print("PASS planner end-to-end suite + browser restart", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

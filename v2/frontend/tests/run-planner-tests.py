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
import runpy
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


def select_option(client, selector, label):
    client.evaluate(f"""(() => {{
      const select = document.querySelector({json.dumps(selector)});
      const option = [...select.options].find(o => o.textContent === {json.dumps(label)});
      if (!option) throw new Error('missing option: ' + {json.dumps(label)});
      select.value = option.value;
      select.dispatchEvent(new Event('change', {{ bubbles: true }}));
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
    check(client, "document.querySelectorAll('#extra-tasks article').length === 1 && !document.querySelector('article h4 b')",
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
    check(client, "document.querySelector('#planner-error').textContent.includes('three Primary') && document.querySelectorAll('#primary-tasks article').length === 3 && document.querySelector('#extra-tasks h4').textContent === 'Fourth'",
          "fourth promotion rejected atomically, saved list unchanged")
    check(client, "document.querySelector('#task-title').value === 'Fourth unsaved'", "failed save retains editable draft")
    navigate(client, url)
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelectorAll('#primary-tasks article').length === 3 && document.querySelector('#extra-tasks h4').textContent === 'Fourth'",
          "rejected classification and metadata do not survive reload")
    click(client, "#extra-tasks article button")
    fill(client, "#task-title", "Quota unsaved")
    client.evaluate("window.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { throw new DOMException('Test quota exhausted', 'QuotaExceededError'); }")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('quota') && document.querySelector('#extra-tasks h4').textContent === 'Fourth'",
          "real IndexedDB write failure shown without optimistic display")
    client.evaluate("IDBObjectStore.prototype.put = window.originalPut")
    navigate(client, url)
    fill(client, "#view-day", "2026-10-10")
    check(client, "document.querySelector('#extra-tasks h4').textContent === 'Fourth'", "failed write leaves committed task intact after reload")
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
    check(client, "document.querySelector('#view-day').value === '2026-10-11' && document.querySelector('#extra-tasks h4').textContent === 'Edited plan'",
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
    check(client, "document.querySelector('#primary-tasks h4').textContent === 'Other tab'", "explicit reload recovers committed plans")
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
    # WS-B1: subtask parentage is organizational; splitting is additive.
    fill(client, "#view-day", "2026-10-20")
    fill(client, "#task-title", "Hierarchy parent")
    fill(client, "#task-day", "2026-10-20")
    fill(client, "#task-start", "09:00")
    fill(client, "#focus-items input", "25")
    save(client)
    fill(client, "#task-title", "Hierarchy child")
    fill(client, "#task-start", "10:00")
    fill(client, "#focus-items input", "25")
    check(client, "[...document.querySelector('#task-parent').options].some(o => o.textContent === 'Hierarchy parent — 2026-10-20')",
          "saved tasks are offered as parents")
    select_option(client, "#task-parent", "Hierarchy parent — 2026-10-20")
    save(client)
    check(client, "[...document.querySelectorAll('#extra-tasks article')].some(a => a.textContent.includes('Subtask of: Hierarchy parent'))",
          "child task displays its parent relationship")
    scope = stored(client)["tasks"]
    parent = next(task for task in scope if task["title"] == "Hierarchy parent")
    child = next(task for task in scope if task["title"] == "Hierarchy child")
    assert child["parentTaskId"] == parent["id"]
    print("PASS assigned parent persists on the child identity", flush=True)
    click(client, "#extra-tasks article button")
    check(client, "document.querySelector('#task-title').value === 'Hierarchy parent' && document.querySelector('#task-parent').value === '' && ![...document.querySelector('#task-parent').options].some(o => o.textContent === 'Hierarchy child — 2026-10-20')",
          "editing a task never offers itself or its descendant as a parent")
    click(client, "#extra-tasks article:nth-of-type(2) button")
    check(client, "document.querySelector('#task-title').value === 'Hierarchy child' && document.querySelector('#task-parent').value !== ''",
          "editing the child restores its saved parent selection")
    client.evaluate("(() => { const s = document.querySelector('#task-parent'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); })()")
    save(client)
    check(client, "![...document.querySelectorAll('#extra-tasks article')].some(a => a.textContent.includes('Subtask of:'))",
          "detaching removes the displayed parent relationship")
    child = next(task for task in stored(client)["tasks"] if task["title"] == "Hierarchy child")
    assert not child.get("parentTaskId")
    print("PASS detached child keeps its identity without a parent", flush=True)
    click(client, "#extra-tasks article button")
    check(client, "document.querySelector('#task-title').value === 'Hierarchy parent' && document.querySelector('#split-fields').disabled === false && document.querySelector('#split-day').value === '2026-10-20'",
          "editing enables split with the source Plan Day default")
    fill(client, "#split-title", "Split piece")
    fill(client, "#split-start", "13:00")
    fill(client, "#split-items input", "15")
    check(client, "document.querySelector('#split-totals').textContent.includes('1 sessions · 15')",
          "split totals derive from the new work plan")
    click(client, "#split-as-subtask")
    click(client, "#split-task")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Split work created. The edited task is unchanged.'")
    check(client, "document.querySelectorAll('#extra-tasks article').length === 3",
          "split work appears beside the unchanged source")
    check(client, "[...document.querySelectorAll('#extra-tasks article')].some(a => a.textContent.includes('Split piece') && a.textContent.includes('Subtask of: Hierarchy parent'))",
          "split work may start as a subtask of the source")
    scope = stored(client)["tasks"]
    piece = next(task for task in scope if task["title"] == "Split piece")
    parent_after = next(task for task in scope if task["title"] == "Hierarchy parent")
    assert piece["id"] != parent["id"] and piece["parentTaskId"] == parent["id"]
    assert [item["activeMinutes"] for item in piece["sessionPlan"]] == [15]
    assert parent_after == parent, "split changed the source task record"
    print("PASS split creates separately planned work without changing the source", flush=True)
    check(client, "document.activeElement.id === 'split-title'", "completed split returns focus to the split editor")
    click(client, "#split-task")
    check(client, "document.querySelector('#planner-error').textContent.includes('title') && document.activeElement.id === 'split-title' && document.querySelector('#split-title').getAttribute('aria-invalid') === 'true'",
          "empty split title is rejected, focused and flagged")
    # QA D2: clearing the editor also clears stale invalid flags on split fields.
    click(client, "#cancel-edit")
    check(client, "!document.querySelector('[aria-invalid]') && document.querySelector('#split-fields').disabled === true",
          "clearing the editor clears flagged split fields")
    click(client, "#extra-tasks article button")
    client.evaluate("document.querySelector('#split-as-subtask').focus()")
    key(client, "Tab", 9)
    check(client, "document.activeElement.id === 'split-task' && getComputedStyle(document.activeElement).outlineStyle !== 'none'",
          "split action is keyboard reachable with visible focus")
    fill(client, "#split-title", "Split elsewhere")
    fill(client, "#split-day", "2026-10-21")
    fill(client, "#split-start", "08:00")
    fill(client, "#split-items input", "30")
    click(client, "#split-task")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Split work created. The edited task is unchanged.'")
    check(client, "document.querySelector('#view-day').value === '2026-10-21' && document.querySelectorAll('#extra-tasks article').length === 1",
          "splitting to another day shows the new work there")
    check(client, "!document.querySelector('[aria-invalid]')",
          "successful correction clears stale invalid flags")
    navigate(client, url)
    fill(client, "#view-day", "2026-10-20")
    check(client, "document.querySelectorAll('#extra-tasks article').length === 3 && [...document.querySelectorAll('#extra-tasks article')].filter(a => a.textContent.includes('Subtask of: Hierarchy parent')).length === 1",
          "hierarchy edits and split work persist through reload")
    # WS-B2: planned breaks are planning data between adjacent sessions.
    fill(client, "#task-title", "Break day")
    fill(client, "#task-day", "2026-10-22")
    fill(client, "#task-start", "09:00")
    fill(client, "#focus-items input", "25")
    click(client, "#add-focus")
    fill(client, "#focus-items li:nth-child(2) input", "25")
    click(client, "#add-focus")
    fill(client, "#focus-items li:nth-child(3) input", "40")
    check(client, "document.querySelector('#add-break').disabled === false",
          "breaks can be planned once adjacent sessions exist")
    click(client, "#add-break")
    fill(client, "#break-list .break-row:nth-child(1) input", "5")
    click(client, "#add-break")
    fill(client, "#break-list .break-row:nth-child(2) input", "10")
    select_option(client, "#break-list .break-row:nth-child(2) select", "Between session 2 and 3")
    save(client)
    check(client, "document.querySelectorAll('#extra-tasks article').length === 1 && document.querySelector('article').textContent.includes('Planned breaks: 5 → 10 minutes')",
          "planned breaks display beside the task")
    break_task = next(task for task in stored(client)["tasks"] if task["title"] == "Break day")
    assert [b["breakMinutes"] for b in break_task["plannedBreaks"]] == [5, 10]
    assert break_task["plannedBreaks"][0]["beforeFocusItemId"] == break_task["sessionPlan"][1]["id"]
    assert break_task["plannedBreaks"][1]["afterFocusItemId"] == break_task["sessionPlan"][1]["id"]
    print("PASS planned breaks persist between adjacent session identities", flush=True)
    click(client, "article button")
    check(client, "document.querySelectorAll('#break-list .break-row').length === 2 && document.querySelector('#break-list .break-row:nth-child(1) input').value === '5'",
          "editing reloads planned breaks with durations and placements")
    fill(client, "#break-list .break-row:nth-child(1) input", "7")
    click(client, "#focus-items li:nth-child(2) [data-action=up]")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('adjacent') && document.querySelectorAll('#break-list .break-row').length === 2",
          "reordering that separates a break is rejected until placement is fixed")
    select_option(client, "#break-list .break-row:nth-child(1) select", "Between session 1 and 2")
    select_option(client, "#break-list .break-row:nth-child(2) select", "Between session 2 and 3")
    save(client)
    reordered = next(task for task in stored(client)["tasks"] if task["title"] == "Break day")
    assert [item["activeMinutes"] for item in reordered["sessionPlan"]] == [25, 25, 40]
    assert reordered["plannedBreaks"][0]["id"] == break_task["plannedBreaks"][0]["id"]
    assert reordered["plannedBreaks"][1]["id"] == break_task["plannedBreaks"][1]["id"]
    assert reordered["plannedBreaks"][0]["breakMinutes"] == 7
    assert reordered["plannedBreaks"][0]["afterFocusItemId"] == reordered["sessionPlan"][0]["id"]
    print("PASS break identity and placement edits survive reorder recovery", flush=True)
    click(client, "article button")
    click(client, "#break-list .break-row:nth-child(2) button")
    save(client)
    after_removal = next(task for task in stored(client)["tasks"] if task["title"] == "Break day")
    assert len(after_removal["plannedBreaks"]) == 1
    assert after_removal["retiredPlannedBreaks"][0]["id"] == break_task["plannedBreaks"][1]["id"]
    print("PASS removed break retires under its identity", flush=True)
    click(client, "article button")
    client.evaluate("document.querySelector('#add-break').focus()")
    key(client, "Enter", 13)
    check(client, "document.querySelectorAll('#break-list .break-row').length === 2 && document.activeElement.tagName === 'INPUT'",
          "keyboard adds a planned break row")
    click(client, "#cancel-edit")
    check(client, "document.querySelectorAll('#break-list .break-row').length === 0 && document.querySelector('#add-break').disabled === true",
          "cancel returns the editor to an empty unsaved task without breaks")
    # WS-B3: labeled web resources open safely; lifecycle decisions are explicit.
    fill(client, "#task-title", "Resource task")
    fill(client, "#task-day", "2026-10-23")
    fill(client, "#task-start", "09:00")
    fill(client, "#focus-items input", "25")
    click(client, "#add-resource")
    fill(client, "#resource-list .resource-row:nth-child(1) .resource-url", "https://example.com/reading")
    fill(client, "#resource-list .resource-row:nth-child(1) .resource-label", "Reading list")
    click(client, "#add-resource")
    fill(client, "#resource-list .resource-row:nth-child(2) .resource-url", "notes:some-thing")
    click(client, "#add-resource")
    fill(client, "#resource-list .resource-row:nth-child(3) .resource-url", "JAVASCRIPT:alert(2)")
    click(client, "#add-resource")
    fill(client, "#resource-list .resource-row:nth-child(4) .resource-url", "data:text/html,Managed text")
    check(client, "document.querySelector('#resource-list .resource-row:nth-child(1) label').textContent === 'Resource 1 URL (required)' && document.querySelector('#resource-list .resource-row:nth-child(2) label').textContent === 'Resource 2 URL (required)' && document.querySelectorAll('#resource-list .resource-row:nth-child(4) label')[1].textContent === 'Resource 4 label (optional)'",
          "resource rows carry indexed visible labels")
    check(client, "document.querySelector('#resource-list .resource-url').labels.length === 1 && getComputedStyle(document.querySelector('#resource-list .resource-url').labels[0]).display !== 'none' && document.querySelector('#resource-list .resource-label').labels.length === 1",
          "resource inputs are programmatically tied to visible labels")
    save(client)
    check(client, "document.querySelectorAll('article a').length === 1 && document.querySelector('article a')?.getAttribute('href') === 'https://example.com/reading' && document.querySelector('article a').textContent === 'Reading list' && document.querySelector('article a').rel.includes('noopener')",
          "labeled web resources render as safe direct-open links")
    check(client, "![...document.querySelectorAll('article a')].some(a => a.href.startsWith('javascript:') || a.href.startsWith('data:') || a.getAttribute('href').toLowerCase().startsWith('javascript:'))",
          "unsafe URL schemes never become anchors")
    check(client, "document.querySelector('article').textContent.includes('notes:some-thing') && document.querySelector('article').textContent.includes('JAVASCRIPT:alert(2)') && document.querySelector('article').textContent.includes('data:text/html,Managed text') && [...document.querySelectorAll('article .resource-links span')].length === 3",
          "non-web resource text stays visible and inert")
    click(client, "article button")
    click(client, "#add-resource")
    fill(client, "#resource-list .resource-row:nth-child(5) .resource-url", "   ")
    save(client, False)
    check(client, "document.querySelector('#planner-error').textContent.includes('web address')",
          "empty resource URL is rejected")
    click(client, "#resource-list .resource-row:nth-child(5) button")
    save(client)
    scope = stored(client)["tasks"]
    resource_task = next(task for task in scope if task["title"] == "Resource task")
    assert [r["url"] for r in resource_task["resources"]] == ["https://example.com/reading", "notes:some-thing", "JAVASCRIPT:alert(2)", "data:text/html,Managed text"]
    assert resource_task["resources"][0]["label"] == "Reading list"
    print("PASS resource rows round-trip through the editor", flush=True)
    client.evaluate("document.querySelector('article a').focus()")
    check(client, "document.activeElement.tagName === 'A' && getComputedStyle(document.activeElement).outlineStyle !== 'none'",
          "resource links are keyboard reachable with visible focus")
    click(client, "article button:nth-of-type(2)")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Task marked complete. Planning records are kept.'")
    check(client, "document.querySelector('article').textContent.includes('Marked complete') && document.querySelector('article button:nth-of-type(2)').disabled === true",
          "explicit completion shows state and disables its control")
    scope = stored(client)["tasks"]
    completed = next(task for task in scope if task["title"] == "Resource task")
    assert completed.get("completedAt")
    print("PASS explicit completion records a decision time", flush=True)
    # QA D1: current decisions are mutually exclusive; no decision is erased.
    check(client, "document.querySelector('article button:nth-of-type(3)').disabled === true && document.querySelector('article button:nth-of-type(3)').getAttribute('aria-label') === 'Cancel task unavailable: task was completed'",
          "completion disables cancellation with an explanatory label")
    client.evaluate("document.querySelector('article button:nth-of-type(3)').click()")
    check(client, "!document.querySelector('article').textContent.includes('Cancelled')",
          "a blocked cancellation records nothing")
    assert not (next(task for task in stored(client)["tasks"] if task["title"] == "Resource task")).get("cancelledAt")
    print("PASS mutual exclusion blocks a second current decision", flush=True)
    fill(client, "#task-title", "Cancelled first")
    fill(client, "#task-day", "2026-10-23")
    fill(client, "#task-start", "10:00")
    fill(client, "#focus-items input", "25")
    save(client)
    click(client, "#extra-tasks article:nth-of-type(2) button:nth-of-type(3)")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Task cancelled. Planning records are kept.'")
    check(client, "[...document.querySelectorAll('#extra-tasks article')][1].textContent.includes('Cancelled') && [...document.querySelectorAll('#extra-tasks article')][1].querySelector('button:nth-of-type(2)').disabled === true && [...document.querySelectorAll('#extra-tasks article')][1].querySelector('button:nth-of-type(2)').getAttribute('aria-label') === 'Mark complete unavailable: task was cancelled'",
          "explicit cancellation shows state and disables completion")
    cancelled = next(task for task in stored(client)["tasks"] if task["title"] == "Cancelled first")
    assert cancelled.get("cancelledAt") and not cancelled.get("completedAt")
    print("PASS cancellation excludes a later completion", flush=True)
    navigate(client, url)
    fill(client, "#view-day", "2026-10-23")
    check(client, "document.querySelector('article a')?.getAttribute('href') === 'https://example.com/reading' && document.querySelector('article').textContent.includes('Marked complete') && !document.querySelector('article').textContent.includes('Cancelled')",
          "completion persists; the blocked cancellation recorded nothing")
    # QA D1: persisted dual decisions (direct store writes) are surfaced, never masked.
    client.evaluate("""(async () => {
      const store = await (await import('/js/app.js')).planningStore;
      const current = await store.load();
      await store.commit(store.localScopeId, current.revision, [{ type: 'create', task: {
        id: 'both-decided', ownershipScopeId: store.localScopeId, planDayId: '2026-10-24',
        title: 'Both decided', plannedStart: { time: '08:00', timezone: 'Africa/Cairo' },
        classification: 'extra', sessionPlan: [{ id: 'both-a', activeMinutes: 25 }],
        completedAt: '2026-10-11T10:00:00.000Z' } }]);
      const again = await store.load();
      await store.commit(store.localScopeId, again.revision, [{ type: 'cancel', taskId: 'both-decided', decidedAt: '2026-10-11T11:00:00.000Z' }]);
    })()""")
    navigate(client, url)
    fill(client, "#view-day", "2026-10-24")
    check(client, "document.querySelector('article').textContent.includes('both completed and cancelled') && document.querySelector('article button:nth-of-type(2)').disabled === true && document.querySelector('article button:nth-of-type(3)').disabled === true && document.querySelector('article button:nth-of-type(2)').getAttribute('aria-label') === 'Task already marked complete'",
          "persisted dual decisions stay visible and accept no new decisions")
    both = next(task for task in stored(client)["tasks"] if task["id"] == "both-decided")
    assert both.get("completedAt") and both.get("cancelledAt")
    print("PASS persisted dual decision records stay visible, not masked", flush=True)
    # QA D4: the day summary counts actionable planned focus and documents its scope.
    fill(client, "#task-title", "Summary one")
    fill(client, "#task-day", "2026-10-25")
    fill(client, "#task-start", "09:00")
    fill(client, "#focus-items input", "25")
    save(client)
    fill(client, "#task-title", "Summary two")
    fill(client, "#task-start", "10:00")
    fill(client, "#focus-items input", "40")
    save(client)
    check(client, "document.querySelector('#day-summary').textContent.includes('65 minutes planned focus (completed included, cancelled excluded)')",
          "day summary totals all planned focus with its scope documented")
    click(client, "#extra-tasks article:nth-of-type(2) button:nth-of-type(3)")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Task cancelled. Planning records are kept.'")
    check(client, "document.querySelector('#day-summary').textContent.includes('25 minutes planned focus (completed included, cancelled excluded)')",
          "cancelled plans leave the actionable total")
    click(client, "#extra-tasks article:nth-of-type(1) button:nth-of-type(2)")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Task marked complete. Planning records are kept.'")
    check(client, "document.querySelector('#day-summary').textContent.includes('25 minutes planned focus (completed included, cancelled excluded)')",
          "completed plans remain in the documented total")
    # WS-B4: day summary, Primary distinction, keyboard flow, small screens.
    check(client, "!document.querySelector('article').classList.contains('primary-card')",
          "Extra tasks do not carry the Primary marker")
    fill(client, "#task-title", "Primary marker")
    fill(client, "#task-day", "2026-10-23")
    fill(client, "#task-start", "10:00")
    fill(client, "#task-classification", "primary")
    fill(client, "#focus-items input", "25")
    save(client)
    check(client, "document.querySelector('#primary-tasks article').classList.contains('primary-card') && document.querySelector('#day-summary').textContent.startsWith('1 of up to 3 Primary') && document.querySelector('#day-summary').textContent.includes('2 Extra')",
          "Primary tasks carry the marker and the day summary distinguishes both classifications")
    client.evaluate("document.querySelector('#add-resource').focus()")
    key(client, "Tab", 9)
    check(client, "document.activeElement.id === 'task-note'",
          "Tab order continues from resource rows to the note")
    client.evaluate("document.querySelector('#task-parent').focus()")
    key(client, "Tab", 9)
    check(client, "document.activeElement.id === 'save-task'",
          "parent choice precedes save in the Tab order")
    client.call("Emulation.setDeviceMetricsOverride", width=320, height=700, deviceScaleFactor=1, mobile=True)
    check(client, "document.documentElement.scrollWidth <= innerWidth", "planner fits a 320px viewport")
    client.call("Emulation.setDeviceMetricsOverride", width=375, height=812, deviceScaleFactor=1, mobile=True)
    check(client, "document.documentElement.scrollWidth <= innerWidth", "planner fits a narrow viewport")
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
        url = f"http://127.0.0.1:{server.server_port}/classic.html"
        with tempfile.TemporaryDirectory(prefix="v2-planner-browser-", ignore_cleanup_errors=True) as profile:
            with browser_session(browser, profile) as client:
                expected = suite(client, url)
            with browser_session(browser, profile) as client:
                navigate(client, url)
                check(client, "document.activeElement.id === 'task-title'", "initial load focuses the editor title")
                assert stored(client) == expected, "Restart changed committed scope/tasks"
                fill(client, "#view-day", "2026-10-11")
                check(client, "document.querySelector('#extra-tasks h4').textContent === 'Edited plan'", "browser process restart retains committed planner")
                assert not client.errors, client.errors
        print("PASS planner end-to-end suite + browser restart", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
    # Keep presentation acceptance inside the existing Planner UI CI entrypoint.
    runpy.run_path(str(pathlib.Path(__file__).with_name("run-visual-tests.py")), run_name="__main__")

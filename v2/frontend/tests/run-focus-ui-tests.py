"""Mounted Focus UI in real Chrome: native keyboard, IndexedDB, tabs and restarts.

Uses the existing Planner CDP helper unchanged and disposable origin/profile data.
"""

import functools
import http.server
import importlib.util
import json
import pathlib
import shutil
import tempfile
import threading
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("planner_cdp", ROOT / "tests/run-planner-tests.py")
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
wait, fill, click, key = helpers.wait, helpers.fill, helpers.click, helpers.key
checks = []


def check(client, condition, label):
    if not client.evaluate(f"(async () => Boolean(await ({condition})))()"):
        details = client.evaluate("({status: document.querySelector('#focus-status').textContent, error: document.querySelector('#focus-error').textContent, duration: document.querySelector('#focus-duration').textContent})")
        raise AssertionError(f"{label}: {details}")
    checks.append(label)
    print(f"PASS {label}", flush=True)


def navigate(client, url):
    client.call("Page.navigate", url=url)
    wait(client, "document.querySelector('#focus-status')?.textContent.includes('No active') || document.querySelector('#focus-status')?.textContent.includes('reserved elsewhere')")
    client.evaluate("import('/js/app.js').then(async m => window.store = await m.planningStore)")
    client.evaluate("import('/js/focus/activity-evidence.js').then(m => window.activity = m.getSessionActivity)")


def state(client):
    return client.evaluate("window.store.loadFocus().then(s => window.savedFocus = s)")


def activate(client, selector):
    client.evaluate(f"document.querySelector({json.dumps(selector)}).focus()")
    key(client, "Tab", 9, 8)
    key(client, "Tab", 9)
    check(client, f"document.activeElement === document.querySelector({json.dumps(selector)}) && document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle === 'solid'", f"keyboard focus visible: {selector}")
    key(client, "Enter", 13)
    wait(client, "document.querySelector('#focus-panel').getAttribute('aria-busy') === 'false'")


def select_session(client, index=1):
    client.evaluate(f"document.querySelector('#focus-selection').selectedIndex = {index}")
    client.evaluate("document.querySelector('#focus-selection').dispatchEvent(new Event('change'))")


def start(client, index=1):
    select_session(client, index)
    activate(client, "#focus-start")
    wait(client, "document.querySelector('#focus-status').textContent.includes('Running — controlled here')")


def reconcile(client, kind, seconds):
    form = "#focus-reconciliation form"
    fill(client, f"{form} input[id^=elapsed-]", str(seconds))
    fill(client, f"{form} select", kind)
    fill(client, f"{form} input[id^=seconds-]", str(seconds))
    activate(client, f"{form} button[type=submit]")
    check(client, "!document.querySelector('#focus-error').textContent", "reconciliation commits without false error")


def reconcile_quick(client, seconds):
    # Single-answer shortcut: interval duration, then one prefilled confirmed-work part.
    form = "#focus-reconciliation form"
    fill(client, f"{form} input[id^=elapsed-]", str(seconds))
    click(client, f"{form} .reconcile-quick button:first-child")
    check(client, f"document.querySelector('#focus-reconciliation select').value === 'focus' && document.querySelector('#focus-reconciliation input[id^=seconds-]').value === {json.dumps(str(seconds))}", "quick fill prefills a single confirmed-work part")
    activate(client, f"{form} button[type=submit]")
    check(client, "!document.querySelector('#focus-error').textContent", "quick reconciliation commits without false error")


def suite(client, url, profile):
    navigate(client, url)
    check(client, "document.querySelector('#focus-status').getAttribute('role') === 'status' && document.querySelector('#focus-error').getAttribute('role') === 'alert' && document.querySelector('label[for=focus-selection]')", "labeled selector, discernible status and alert")
    check(client, "document.querySelector('#focus-clock').getAttribute('role') === 'timer' && document.querySelector('#focus-clock').getAttribute('aria-live') === 'off'", "prominent clock is a silent live-region timer")
    check(client, "document.querySelector('#focus-clock-remaining').textContent === '--:--' && document.querySelector('#focus-clock').dataset.state === 'none'", "empty state shows a placeholder clock")
    client.evaluate("localStorage.setItem('space-boxes-timer:tasks', 'v1-ui-sentinel')")
    fill(client, "#task-title", "Focus <script> text")
    fill(client, "#task-start", "23:55")
    fill(client, "#focus-items input", "0.15")
    click(client, "#add-focus")
    fill(client, "#focus-items li:last-child input", "0.03")
    click(client, "#save-task")
    wait(client, "document.querySelector('#focus-selection').options.length === 3")
    state(client)
    check(client, "savedFocus.reservation === null && savedFocus.sessions.length === 0 && document.querySelector('#focus-start').disabled", "saving a plan never starts focus or selects a session")
    # Seed legacy historical/context fields directly in this disposable database;
    # ordinary planning edits correctly refuse to rewrite these fields.
    client.evaluate("""store.load().then(async p => {
      window.originalTask = {...p.tasks[0], planDay: {calendarDate:p.tasks[0].planDayId, timezone:'Pacific/Honolulu'}, note:'retained', history:[{sessionId:'external-history'}]};
      const db = await new Promise((resolve,reject) => { const r = indexedDB.open('space-boxes-v2'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { await new Promise((resolve,reject) => { const tx = db.transaction('tasks','readwrite'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.objectStore('tasks').put(originalTask); }); }
      finally { db.close(); }
    })""")
    click(client, "#reload-plans")
    wait(client, "!document.querySelector('#editor-fields').disabled")
    start(client)
    first = state(client)["reservation"]["sessionId"]
    wait(client, "store.loadFocus().then(s => activity(s, s.reservation.sessionId).confirmedActiveMs > 900)")
    state(client)
    check(client, "(() => { const a = activity(savedFocus, savedFocus.reservation.sessionId); const s = Math.round(a.confirmedActiveMs / 100) / 10; const expected = s < 60 ? (s === 1 ? '1 second' : s.toFixed(1) + ' seconds') : null; const text = document.querySelector('#focus-duration').textContent; return expected === null || text.includes('Confirmed focus: ' + expected); })() && document.querySelector('#focus-context').textContent.includes('Pacific/Honolulu') && savedFocus.sessions[0].plannedItemId === originalTask.sessionPlan[0].id", "display uses durable credit, original timezone and selected stable item")
    check(client, "document.activeElement.id === 'focus-heading' && document.querySelector('#focus-start').disabled", "accepted Start focuses status context and reserves selection")
    check(client, "(() => { const text = document.querySelector('#focus-clock-remaining').textContent; return document.querySelector('#focus-clock').dataset.state === 'running' && (/^\\d{2}:\\d{2}$/.test(text) || /^\\d+:\\d{2}:\\d{2}$/.test(text)); })()", "running session shows a prominent live MM:SS countdown")
    check(client, "(() => { const secs = (t) => t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0); const found = /focused ([\\d:]+) of ([\\d:]+) planned/.exec(document.querySelector('#focus-clock-caption').textContent); return found && document.querySelector('#focus-clock-caption').textContent.startsWith('Running') && secs(found[1]) + secs(document.querySelector('#focus-clock-remaining').textContent) === secs(found[2]); })()", "clock caption reconciles focused, remaining and planned values")
    first_remaining = client.evaluate("document.querySelector('#focus-clock-remaining').textContent")
    client.evaluate("new Promise(r => setTimeout(r, 1500))")
    check(client, f"(() => {{ const secs = (t) => t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0); return secs({json.dumps(first_remaining)}) > secs(document.querySelector('#focus-clock-remaining').textContent); }})()", "live countdown decreases while running")
    fill(client, "#task-title", "Unsaved Planner draft")
    client.evaluate("new Promise(r => setTimeout(r, 1100))")
    check(client, "document.querySelector('#v2-startup-status').textContent.startsWith('Unsaved changes') && document.querySelector('#task-title').value === 'Unsaved Planner draft'", "automatic Focus checkpoints preserve Planner draft and feedback")
    activate(client, "#focus-pause")
    paused = state(client)
    client.evaluate("new Promise(r => setTimeout(r, 1200))")
    state(client)
    check(client, f"activity(savedFocus, {json.dumps(first)}).confirmedActiveMs === activity({json.dumps(paused)}, {json.dumps(first)}).confirmedActiveMs && savedFocus.reservation.state === 'paused'", "explicit pause remains reserved and adds no focus")
    check(client, "(() => { const secs = (t) => t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0); const found = /focused ([\\d:]+) of ([\\d:]+) planned/.exec(document.querySelector('#focus-clock-caption').textContent); return document.querySelector('#focus-clock').dataset.state === 'paused' && found && secs(found[1]) === Math.round(activity(savedFocus, savedFocus.reservation.sessionId).confirmedActiveMs / 1000); })()", "paused clock shows confirmed focus without projecting")
    activate(client, "#focus-resume")
    check(client, "document.querySelector('#focus-status').textContent.includes('Running')", "Resume is explicit and authoritative")
    activate(client, "#focus-pause")
    activate(client, "#focus-end")
    state(client)
    check(client, "savedFocus.reservation === null && savedFocus.sessions[0].ending.outcome === 'ended-early' && document.querySelector('#focus-history').textContent.includes('ended-early')", "End from Pause preserves early outcome and history")
    check(client, "document.querySelector('#focus-status').textContent.includes('Last session ended early') && document.querySelector('#focus-status').textContent.includes('confirmed focus')", "explicit End outcome and confirmed duration are announced in live status")
    check(client, "document.querySelector('#focus-outcome').dataset.outcome === 'ended-early' && !document.querySelector('#focus-outcome').hidden && document.querySelector('#focus-outcome').textContent.includes('Ended early') && document.querySelector('#focus-clock').dataset.state === 'ended'", "ended-early outcome is shown prominently with the ended clock")
    check(client, "store.load().then(p => !p.tasks[0].completedAt && p.tasks[0].history[0].sessionId === 'external-history')", "Focus leaves task completion and preexisting history intact")
    start(client)
    client.call("Page.reload")
    wait(client, "document.querySelector('#focus-status')?.textContent.includes('reserved elsewhere')")
    client.evaluate("import('/js/app.js').then(async m => window.store = await m.planningStore)")
    client.evaluate("import('/js/focus/activity-evidence.js').then(m => window.activity = m.getSessionActivity)")
    state(client)
    check(client, "savedFocus.reservation.state === 'running' && !document.querySelector('#focus-recovery').hidden && document.querySelector('#focus-start').disabled && document.querySelector('#focus-pause').hidden", "reload retains Running reservation without acquiring control")
    check(client, "document.querySelector('#focus-clock').dataset.state === 'elsewhere' && document.querySelector('#focus-clock-caption').textContent.includes('another tab')", "observer tab does not project a foreign running reservation")
    activate(client, "#focus-recover")
    wait(client, "document.querySelector('#focus-reconciliation form') !== null")
    activate(client, "#focus-pause")
    state(client)
    check(client, "savedFocus.evidence.some(e => e.kind === 'uncertain' && e.elapsedMs === null) && document.querySelector('#focus-duration').textContent.includes('Unknown intervals: 1 focus')", "confirmed recovery retains unknown evidence without credit")
    fill(client, "#focus-reconciliation input[id^=elapsed-]", "2")
    fill(client, "#focus-reconciliation select", "focus")
    fill(client, "#focus-reconciliation input[id^=seconds-]", "1")
    activate(client, "#focus-reconciliation button[type=submit]")
    check(client, "document.querySelector('#focus-error').textContent.includes('entire uncertain interval') && document.querySelector('#focus-status').textContent.startsWith('Error')", "invalid partial accounting fails visibly without false success")
    state(client)
    check(client, "savedFocus.reconciliations.length === 0", "rejected reconciliation preserves original evidence")
    activate(client, "#focus-refresh")
    click(client, "#focus-reconciliation form > fieldset > button[type=button]")
    # Explicit ordered partial work: one second work, then one second interruption.
    fill(client, "#focus-reconciliation form div > div:last-child select", "interruption")
    fill(client, "#focus-reconciliation form div > div:last-child input[id^=seconds-]", "1")
    fill(client, "#focus-reconciliation form div > div:last-child input[id^=group-]", "owner-confirmed-gap")
    activate(client, "#focus-reconciliation button[type=submit]")
    state(client)
    check(client, "savedFocus.reconciliations[0].parts[0].kind === 'focus' && savedFocus.reconciliations[0].parts[1].kind === 'interruption' && savedFocus.evidence.some(e => e.kind === 'uncertain') && !document.querySelector('#focus-reconciliation form')", "partial-work UI preserves evidence and explicit ordered provenance")
    # Two real tabs observe a paused reservation and explicitly transfer its control.
    target = client.call("Target.createTarget", url=url)["targetId"]
    port = int((pathlib.Path(profile) / "DevToolsActivePort").read_text().splitlines()[0])
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list") as response:
        pages = json.load(response)
    peer = helpers.CDP(next(p["webSocketDebuggerUrl"] for p in pages if p["id"] == target))
    try:
        peer.call("Runtime.enable")
        peer.call("Page.enable")
        wait(peer, "document.querySelector('#focus-status')?.textContent.includes('reserved elsewhere')")
        check(peer, "document.querySelector('#focus-start').disabled && document.querySelector('#focus-resume').hidden", "second tab cannot Start or Resume a paused reservation")
        activate(peer, "#focus-recover")
        check(peer, "document.querySelector('#focus-status').textContent.includes('Paused — controlled here')", "confirmed tab transfer retains Paused state")
        activate(client, "#focus-resume")
        check(client, "document.querySelector('#focus-status').textContent.startsWith('Error') && document.querySelector('#focus-error').textContent.length > 0", "former tab controls are rejected visibly")
        activate(client, "#focus-refresh")
        check(client, "document.querySelector('#focus-resume').hidden && !document.querySelector('#focus-recovery').hidden", "refresh reflects new authoritative controller")
        reconcile(peer, "pause", 1)
        activate(peer, "#focus-end")
    finally:
        peer.close()
        client.call("Target.closeTarget", targetId=target)
    activate(client, "#focus-refresh")
    # An aborted native write must leave display/authority/history unchanged.
    select_session(client, 2)
    client.evaluate("window.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { const r = originalPut.apply(this,args); if(this.name === 'focus') r.onsuccess = () => this.transaction.abort(); return r; }")
    activate(client, "#focus-start")
    state(client)
    check(client, "savedFocus.reservation === null && document.querySelector('#focus-status').textContent.startsWith('Error') && document.querySelector('#focus-error').textContent.includes('not confirmed')", "native transaction abort never displays successful Start")
    client.evaluate("IDBObjectStore.prototype.put = originalPut")
    activate(client, "#focus-refresh")
    start(client, 2)
    wait(client, "document.querySelector('#focus-status').textContent.includes('No active')")
    state(client)
    check(client, "savedFocus.sessions.at(-1).ending.outcome === 'completed' && activity(savedFocus, savedFocus.sessions.at(-1).id).confirmedActiveMs === 1800", "duration target completes and caps persisted UI credit")
    check(client, "document.querySelector('#focus-status').textContent.includes('Last session completed its planned focus duration') && document.querySelector('#focus-status').textContent.includes('1.8 seconds')", "duration completion outcome and confirmed credit are announced in live status")
    check(client, "document.querySelector('#focus-outcome').dataset.outcome === 'completed' && document.querySelector('#focus-outcome').textContent.includes('Completed — planned focus reached') && document.querySelector('#focus-clock').dataset.state === 'ended'", "completed outcome is shown prominently with the ended clock")
    check(client, "store.load().then(p => !p.tasks[0].completedAt && savedFocus.reservation === null)", "session completion never completes task or starts next session")
    # Correct an ended outcome through the mounted history reconciliation form.
    # Introduce an actual callback stall, then End with uncertainty retained.
    start(client)
    client.evaluate("(() => { const end = performance.now() + 2700; while(performance.now() < end) {} })()")
    wait(client, "document.querySelector('#focus-reconciliation form') !== null")
    activate(client, "#focus-pause")
    activate(client, "#focus-end")
    state(client)
    check(client, "document.querySelector('#focus-reconciliation input[id^=elapsed-]').readOnly && savedFocus.evidence.some(e => e.kind === 'uncertain' && e.elapsedMs > 2500)", "callback stall exposes measured uncertainty after early End")
    client.evaluate("document.querySelector('#focus-reconciliation select').value = 'interruption'; document.querySelector('#focus-reconciliation select').dispatchEvent(new Event('change')); document.querySelector('#focus-reconciliation input[id^=seconds-]').value = document.querySelector('#focus-reconciliation input[id^=elapsed-]').value")
    activate(client, "#focus-reconciliation button[type=submit]")
    state(client)
    check(client, "savedFocus.reconciliations.at(-1).parts[0].kind === 'interruption' && savedFocus.sessions.at(-1).ending.outcome === 'ended-early'", "ended-session interruption reconciliation retains original outcome")
    start(client)
    activate(client, "#focus-pause")
    client.evaluate("store.loadFocus().then(s => localStorage.setItem('focus-ui-restart', JSON.stringify(s)))")
    client.call("Emulation.setDeviceMetricsOverride", width=320, height=720, deviceScaleFactor=1, mobile=False)
    check(client, "document.documentElement.scrollWidth <= 320", "Focus controls and history fit a 320px viewport")
    check(client, "[...document.querySelectorAll('#focus-panel input, #focus-panel select')].every(i => document.querySelector('label[for=\"'+i.id+'\"]')) && localStorage.getItem('space-boxes-timer:tasks') === 'v1-ui-sentinel'", "reconciliation inputs labeled and V1 data isolated")


def restart(client, url, paused):
    navigate(client, url)
    state(client)
    check(client, "JSON.stringify(savedFocus) === localStorage.getItem('focus-ui-restart')", f"browser restart preserves {'Paused' if paused else 'Running'} facts and identifiers")
    activate(client, "#focus-recover")
    state(client)
    check(client, f"savedFocus.reservation.state === {json.dumps('paused' if paused else 'running')} && document.querySelector('#focus-reconciliation form')", "restart recovery requires confirmation and preserves unknown interval")
    if paused:
        check(client, "[...document.querySelectorAll('#focus-reconciliation select option')].every(o => !['focus','interruption'].includes(o.value))", "unknown explicit pause can only reconcile as pause")
        reconcile(client, "pause", 1)
        activate(client, "#focus-resume")
        client.evaluate("store.loadFocus().then(s => localStorage.setItem('focus-ui-restart', JSON.stringify(s)))")
    else:
        activate(client, "#focus-pause")
        reconcile_quick(client, 20)
        state(client)
        check(client, "savedFocus.reconciliations.at(-1).parts.length === 1 && savedFocus.reconciliations.at(-1).parts[0].kind === 'focus' && savedFocus.reconciliations.at(-1).elapsedMs === 20000", "quick reconciliation records one explicit confirmed-work decision")
        check(client, "savedFocus.sessions.at(-1).ending.outcome === 'completed' && savedFocus.evidence.some(e => e.kind === 'pause' && e.elapsedMs === null) && document.querySelector('#focus-history').textContent.includes('Outcome: completed')", "confirmed continued work completes target while preserving unknown pause tail")
        reconcile(client, "pause", 0)
        state(client)
        check(client, "savedFocus.reservation === null && !document.querySelector('#focus-reconciliation form') && store.load().then(p => !p.tasks[0].completedAt)", "all obligations resolve explicitly without task completion or next Start")


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no UI checks executed.")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
    try:
        with tempfile.TemporaryDirectory(prefix="v2-focus-ui-", ignore_cleanup_errors=True) as profile:
            for phase in ("suite", "restart-paused", "restart-running"):
                with helpers.browser_session(browser, profile) as client:
                    if phase == "suite":
                        suite(client, url, profile)
                    else:
                        restart(client, url, phase == "restart-paused")
                    if client.errors:
                        raise AssertionError(client.errors)
        print(f"PASS {len(checks)} mounted Focus UI checks; real Chrome, tabs, reload and process restarts")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

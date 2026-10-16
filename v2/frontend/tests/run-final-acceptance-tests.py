"""Independent presentation acceptance; Python stdlib, installed Chrome/Firefox.

Use --axe-source for a locally supplied axe-core 4.10.3 bundle (never downloaded
by this runner). --artifacts records screenshots, audit results and zoom metrics.
All plans, fault injection and zoom preferences use disposable profiles/origins.
"""

import argparse
import base64
import contextlib
import functools
import hashlib
import http.server
import importlib.util
import json
import math
import pathlib
import shutil
import socket
import subprocess
import tempfile
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visual", ROOT / "tests/run-visual-tests.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
h = v.helpers
AXE_SHA256 = "880970c081707360e64f34cea25ff91892f5bc95675b0776925b9709dd8a68bb"


class Firefox(h.CDP):
    """Reuse the existing stdlib WebSocket transport for WebDriver BiDi."""

    def evaluate(self, expression):
        result = super().call("script.evaluate", target={"context": self.context},
                              expression=f"(async () => JSON.stringify(await ({expression})))()",
                              awaitPromise=True)
        if result["type"] != "success":
            raise AssertionError(result)
        value = result["result"].get("value")
        return json.loads(value) if value is not None else None

    def call(self, method, **params):
        if method == "Input.dispatchKeyEvent":
            value = {"Tab": "\ue004", "Enter": "\ue007"}[params["key"]]
            shift = params.get("modifiers", 0) & 8
            down = params["type"] == "keyDown"
            actions = ([{"type": "keyDown", "value": "\ue008"}] if shift and down else [])
            actions.append({"type": "keyDown" if down else "keyUp", "value": value})
            if shift and not down:
                actions.append({"type": "keyUp", "value": "\ue008"})
            return super().call("input.performActions", context=self.context,
                                actions=[{"type": "key", "id": "acceptance-keyboard", "actions": actions}])
        if method == "Page.navigate":
            return super().call("browsingContext.navigate", context=self.context, url=params["url"], wait="complete")
        if method == "Emulation.setDeviceMetricsOverride":
            return super().call("browsingContext.setViewport", context=self.context,
                                viewport={"width": params["width"], "height": params["height"]})
        if method == "Page.reload":
            return super().call("browsingContext.reload", context=self.context, wait="complete")
        return super().call(method, **params)


@contextlib.contextmanager
def firefox_session(browser, profile_parent, headed=False):
    with tempfile.TemporaryDirectory(prefix="v2-final-firefox-", dir=profile_parent) as profile, tempfile.TemporaryFile(mode="w+") as log:
        with socket.socket() as port_socket:
            port_socket.bind(("127.0.0.1", 0))
            port = port_socket.getsockname()[1]
        process = subprocess.Popen([browser, *([] if headed else ["--headless"]), "--no-remote", "--profile", profile,
                                    "--remote-debugging-port", str(port)], stdout=log, stderr=log)
        client = None
        session_created = False
        try:
            deadline = time.monotonic() + 20
            while client is None:
                try:
                    client = Firefox(f"ws://127.0.0.1:{port}/session")
                except OSError:
                    if time.monotonic() > deadline or process.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(f"Firefox startup failed: {log.read()[-3000:]}")
                    time.sleep(.05)
            session = client.call("session.new", capabilities={})
            session_created = True
            client.context = client.call("browsingContext.getTree")["contexts"][0]["context"]
            print(f"Browser: Firefox/{session['capabilities']['browserVersion']}", flush=True)
            yield client
        finally:
            if client:
                if session_created:
                    # Close through the owning BiDi connection before releasing it;
                    # Snap confinement may deny signals from the test process.
                    with contextlib.suppress(OSError, RuntimeError):
                        client.call("browser.close")
                client.close()
            process.wait(timeout=15)


def write_artifact(folder, name, value):
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{name}.json").write_text(json.dumps(value, indent=2) + "\n")


def review_image(client, folder, name, selector):
    if folder:
        client.evaluate(f"document.querySelector({json.dumps(selector)}).scrollIntoView()")
        client.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        if isinstance(client, Firefox):
            result = client.call("browsingContext.captureScreenshot", context=client.context, origin="viewport")
        else:
            result = client.call("Page.captureScreenshot", captureBeyondViewport=False)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{name}.png").write_bytes(base64.b64decode(result["data"]))


def audit(client, source, folder, name):
    if not source:
        print(f"SKIP axe audit {name}: --axe-source not supplied", flush=True)
        return
    if isinstance(client, Firefox):
        client.call("script.evaluate", target={"context": client.context}, expression=source, awaitPromise=True)
    else:
        client.evaluate(source)
    result = client.evaluate("""axe.run(document, {runOnly: {type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']}})
      .then(r => ({version: axe.version, violations: r.violations,
        incomplete: r.incomplete, passedRules: r.passes.length}))""")
    write_artifact(folder, name, result)
    if result["violations"]:
        raise AssertionError(f"axe {name}: {result['violations']}")
    print(f"PASS axe {name}: zero violations; {len(result['incomplete'])} rules require review", flush=True)


def select_first(client):
    value = client.evaluate("document.querySelector('#focus-selection').options[1].value")
    h.fill(client, "#focus-selection", value)


def activate(client, selector):
    if isinstance(client, Firefox):
        # The diagnostic uses forward/back traversal to avoid starting with
        # backwards traversal across the first-link boundary.
        client.evaluate(f"document.querySelector({json.dumps(selector)}).focus()")
        h.key(client, "Tab", 9)
        h.key(client, "Tab", 9, 8)
        v.check(client, f"document.activeElement.matches({json.dumps(selector)}) && document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle === 'solid'", f"Firefox visible keyboard focus: {selector}")
        h.key(client, "Enter", 13)
    else:
        v.activate(client, selector)
    h.wait(client, "document.querySelector('#focus-panel').getAttribute('aria-busy') === 'false' && !document.querySelector('#editor-fields').disabled && document.querySelector('#reports-output').getAttribute('aria-busy') !== 'true'")


def surface_suite(client, url, source, folder, engine):
    h.navigate(client, url)
    h.wait(client, "!!document.querySelector('#reports-output dl')")
    audit(client, source, folder, f"{engine}-initial")
    activate(client, ".skip-link")
    v.check(client, "document.activeElement.id === 'workspace'", f"{engine}: skip link focuses workspace")
    activate(client, "nav a[href='#plans-heading']")
    v.check(client, "document.activeElement.id === 'plans-heading'", f"{engine}: navigation focuses Planner context")
    activate(client, "#save-task")
    v.check(client, "document.activeElement.id === 'task-title' && document.activeElement.getAttribute('aria-invalid') === 'true' && !!document.querySelector('#planner-error').textContent", f"{engine}: invalid task focuses the named field and exposes an error")
    h.fill(client, "#task-title", "Independent acceptance — long_" + "title" * 20)
    h.fill(client, "#task-start", "09:00")
    h.fill(client, "#task-classification", "primary")
    h.fill(client, "#focus-items input", "25")
    activate(client, "#save-task")
    h.wait(client, "document.querySelector('#v2-startup-status').textContent === 'Saved.'")
    v.check(client, "document.activeElement.id === 'task-title'", f"{engine}: successful task save retains editor context")
    select_first(client)
    activate(client, "#focus-start")
    h.wait(client, "document.querySelector('#focus-clock').dataset.state === 'running'")
    v.check(client, "document.activeElement.id === 'focus-heading'", f"{engine}: explicit Start focuses Focus context")
    client.evaluate("""(() => {
      window.announcements = [];
      new MutationObserver(() => announcements.push(document.querySelector('#focus-status').textContent))
        .observe(document.querySelector('#focus-status'), {childList: true, subtree: true});
    })()""")
    client.evaluate("new Promise(resolve => setTimeout(resolve, 1200))")
    v.check(client, "announcements.length === 0 && document.querySelector('#focus-clock').getAttribute('aria-live') === 'off'", f"{engine}: running checkpoints do not repeat live status or announce timer ticks")
    audit(client, source, folder, f"{engine}-running")
    activate(client, "#focus-pause")
    h.wait(client, "document.querySelector('#focus-clock').dataset.state === 'paused'")
    v.check(client, "document.activeElement.id === 'focus-heading' && announcements.some(text => text.startsWith('Paused'))", f"{engine}: Pause changes live status and preserves keyboard context")
    audit(client, source, folder, f"{engine}-paused")
    client.call("Page.reload")
    h.wait(client, "document.querySelector('#focus-status').textContent.includes('reserved elsewhere')")
    v.check(client, "!document.querySelector('#focus-recovery').hidden && document.querySelector('#focus-start').disabled && document.querySelector('#focus-panel').getAttribute('aria-busy') === 'false'", f"{engine}: recovery is explicit and startup busy state settles")
    audit(client, source, folder, f"{engine}-recovery")
    client.call("Emulation.setDeviceMetricsOverride", width=320, height=900, deviceScaleFactor=1, mobile=False)
    review_image(client, folder, f"{engine}-recovery-320", "#focus-recovery")
    activate(client, "#focus-recover")
    h.wait(client, "!!document.querySelector('#focus-reconciliation form')")
    v.check(client, "document.activeElement.id === 'focus-heading' && document.querySelector('#focus-clock').dataset.state === 'paused'", f"{engine}: confirmed recovery preserves Paused state and focuses its context")
    audit(client, source, folder, f"{engine}-reconciliation")
    for width in [320, 375, 768, 1280]:
        client.call("Emulation.setDeviceMetricsOverride", width=width, height=900, deviceScaleFactor=1, mobile=False)
        v.check(client, "document.documentElement.scrollWidth <= innerWidth", f"{engine}: recovery/reconciliation reflows at {width}px")
    client.call("Emulation.setDeviceMetricsOverride", width=320, height=900, deviceScaleFactor=1, mobile=False)
    client.evaluate("document.documentElement.style.fontSize = '200%'")
    v.check(client, "document.documentElement.scrollWidth <= innerWidth", f"{engine}: recovery/reconciliation supports 200% text at 320px")
    review_image(client, folder, f"{engine}-reconciliation-text-200", "#focus-reconciliation")
    client.evaluate("document.documentElement.style.fontSize = ''")
    v.contrast(client)
    review_image(client, folder, f"{engine}-reconciliation-320", "#focus-reconciliation")
    form = "#focus-reconciliation form"
    h.fill(client, f"{form} input[id^=elapsed-]", "2")
    h.fill(client, f"{form} select", "pause")
    h.fill(client, f"{form} input[id^=seconds-]", "1")
    activate(client, f"{form} button[type=submit]")
    h.wait(client, "!!document.querySelector('#focus-error').textContent && document.querySelector('#focus-panel').getAttribute('aria-busy') === 'false'")
    v.check(client, "document.activeElement.matches('input[id^=seconds-]') && !document.querySelector('#focus-status').textContent.startsWith('Error') && !document.querySelector('#focus-resume').disabled", f"{engine}: invalid reconciliation focuses its field and leaves the controller usable")
    audit(client, source, folder, f"{engine}-reconciliation-error")
    h.fill(client, f"{form} input[id^=seconds-]", "2")
    activate(client, f"{form} button[type=submit]")
    h.wait(client, "!document.querySelector('#focus-reconciliation form')")
    v.check(client, "document.activeElement.id === 'focus-heading' && !document.querySelector('#focus-error').textContent", f"{engine}: accepted reconciliation removes the form without losing keyboard context")
    activate(client, "#focus-end")
    h.wait(client, "document.querySelector('#focus-clock').dataset.state === 'ended'")
    v.check(client, "document.activeElement.id === 'focus-heading' && document.querySelector('#focus-status').textContent.includes('ended early')", f"{engine}: End announces its outcome and retains context")
    activate(client, "#reports-refresh")
    h.wait(client, "document.querySelector('#reports-output').getAttribute('aria-busy') === 'false'")
    v.check(client, "document.activeElement.id === 'reports-refresh'", f"{engine}: Activity refresh retains its keyboard focus")
    audit(client, source, folder, f"{engine}-reports")
    review_image(client, folder, f"{engine}-reports-320", "#reports-heading")
    client.evaluate("""(async () => {
      const {mountReports} = await import('/js/reports/reports-view.js');
      window.acceptanceReports = mountReports({loadFocus: () => new Promise((resolve, reject) => {
        window.acceptanceResolve = resolve; window.acceptanceReject = reject;
      })});
      document.querySelector('#reports-refresh').focus();
      window.acceptancePending = acceptanceReports.refresh();
    })()""")
    h.wait(client, "document.querySelector('#reports-output').getAttribute('aria-busy') === 'true'")
    client.evaluate("document.querySelector('#task-title').focus()")
    client.evaluate("""(async () => {
      acceptanceResolve(await (await import('/js/app.js')).planningStore.then(s => s.loadFocus()));
      await acceptancePending;
    })()""")
    v.check(client, "document.activeElement.id === 'task-title'", f"{engine}: a pending report read does not steal focus after the user moves away")
    client.evaluate("""(async () => {
      document.querySelector('#reports-refresh').focus();
      window.acceptancePending = acceptanceReports.refresh();
      acceptanceReject(new Error('Acceptance report read failure'));
      await acceptancePending;
    })()""")
    v.check(client, "document.activeElement.id === 'reports-refresh' && !document.querySelector('#reports-output').children.length && document.querySelector('#reports-error').textContent.includes('retry')", f"{engine}: failed report read clears stale data, retains focus and explains retry")
    audit(client, source, folder, f"{engine}-reports-error")
    v.contrast(client)
    review_image(client, folder, f"{engine}-reports-error-320", "#reports-heading")


def firefox_smoke(client, url, source, folder):
    """Cross-engine audits only; this does not claim Firefox keyboard acceptance."""
    client.call("browsingContext.navigate", context=client.context, url=url, wait="complete")
    h.wait(client, "!!document.querySelector('#reports-output dl')")
    audit(client, source, folder, "firefox-initial")
    for width in [320, 375, 768, 1280]:
        client.call("Emulation.setDeviceMetricsOverride", width=width, height=900)
        v.check(client, "document.documentElement.scrollWidth <= innerWidth", f"Firefox: initial panels reflow at {width}px")
    client.call("Emulation.setDeviceMetricsOverride", width=320, height=900)
    client.evaluate("document.documentElement.style.fontSize = '200%'")
    v.check(client, "document.documentElement.scrollWidth <= innerWidth", "Firefox: initial panels support 200% text at 320px")
    review_image(client, folder, "firefox-text-200", "#editor-heading")
    client.evaluate("document.documentElement.style.fontSize = ''")
    v.contrast(client)
    review_image(client, folder, "firefox-planner-320", "#editor-heading")
    startup_failure(client, source, folder, "firefox")


def startup_failure(client, source, folder, engine):
    fault = "IDBFactory.prototype.open = function() { throw new DOMException('Acceptance storage denial', 'SecurityError'); };"
    if isinstance(client, Firefox):
        client.call("script.addPreloadScript", functionDeclaration=f"() => {{ {fault} }}")
    else:
        client.call("Page.addScriptToEvaluateOnNewDocument", source=fault)
    client.call("Page.reload")
    h.wait(client, "document.querySelector('#focus-error')?.textContent.includes('Acceptance storage denial')")
    review_image(client, folder, f"{engine}-startup-error", "#focus-heading")
    audit(client, source, folder, f"{engine}-startup-error")
    v.check(client, "document.querySelector('#reports-status').textContent.startsWith('Error') && document.querySelector('#reports-refresh').disabled && document.querySelector('#focus-clock').hidden && document.querySelector('#focus-panel').getAttribute('aria-busy') === 'false'", f"{engine}: unavailable storage leaves no misleading loading timer/report or enabled report action")
    v.check(client, "document.querySelector('#focus-error').textContent.includes('Reload this page') && document.querySelector('#reports-error').textContent.includes('Reload this page')", f"{engine}: startup failure exposes non-destructive retry instructions")


def zoom_suite(browser, url, source, folder):
    for factor in [1, 2, 4]:
        with tempfile.TemporaryDirectory(prefix="v2-final-zoom-") as profile:
            preferences = pathlib.Path(profile) / "Default/Preferences"
            preferences.parent.mkdir()
            # Chromium's default partition has key "x". This is browser layout
            # zoom, not CSS zoom, device emulation, or pinch/page-scale emulation.
            preferences.write_text(json.dumps({"partition": {"default_zoom_level": {"x": math.log(factor, 1.2)}}}))
            with h.browser_session(browser, profile) as client:
                window = client.call("Browser.getWindowForTarget")["windowId"]
                client.call("Browser.setWindowBounds", windowId=window, bounds={"width": 1280, "height": 900})
                h.navigate(client, url)
                h.wait(client, "!!document.querySelector('#reports-output dl')")
                metrics = client.evaluate("({outerWidth, innerWidth, dpr:devicePixelRatio, scale:visualViewport.scale, scrollWidth:document.documentElement.scrollWidth})")
                write_artifact(folder, f"chrome-zoom-{factor * 100}-metrics", metrics)
                if metrics["outerWidth"] != 1280 or abs(metrics["dpr"] - factor) > .01 or abs(metrics["innerWidth"] - 1280 / factor) > 1 or metrics["scale"] != 1:
                    raise AssertionError(f"Actual browser zoom not verified: {factor}, {metrics}")
                v.check(client, "document.documentElement.scrollWidth <= innerWidth", f"Chrome actual {factor * 100}% layout zoom reflows at a fixed 1280px window")
                h.fill(client, "#task-title", "Zoom acceptance " + "longtitle" * 30)
                h.fill(client, "#task-start", "09:00")
                h.fill(client, "#focus-items input", "25")
                h.click(client, "#save-task")
                h.wait(client, "document.querySelector('#v2-startup-status').textContent === 'Saved.'")
                select_first(client)
                activate(client, "#focus-start")
                h.wait(client, "document.querySelector('#focus-clock').dataset.state === 'running'")
                activate(client, "#focus-pause")
                v.check(client, "document.documentElement.scrollWidth <= innerWidth", f"Chrome {factor * 100}% zoom retains long task content and usable focus controls")
                audit(client, source, folder, f"chrome-zoom-{factor * 100}")
                for selector, name in [("#focus-heading", "focus"), ("#editor-heading", "planner"), ("#plans-heading", "plan"), ("#reports-heading", "reports")]:
                    review_image(client, folder, f"chrome-zoom-{factor * 100}-{name}", selector)
                if client.errors:
                    raise AssertionError(client.errors)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--axe-source", type=pathlib.Path)
    parser.add_argument("--artifacts", type=pathlib.Path)
    parser.add_argument("--browser", choices=["both", "chrome", "firefox"], default="both")
    parser.add_argument("--firefox-profile-parent", type=pathlib.Path,
                        help="Disposable profile parent accessible to Firefox; Snap needs ~/snap/firefox/common")
    parser.add_argument("--firefox-headed", action="store_true",
                        help="Use a real Firefox window for keyboard/focus acceptance (requires a display)")
    args = parser.parse_args()
    source = None
    if args.axe_source:
        bundle = args.axe_source.read_bytes()
        digest = hashlib.sha256(bundle).hexdigest()
        if digest != AXE_SHA256:
            raise SystemExit(f"Expected pinned axe-core 4.10.3 SHA256 {AXE_SHA256}, got {digest}")
        source = bundle.decode()
        print(f"axe-core 4.10.3 SHA256: {digest}", flush=True)
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if args.browser != "firefox" and not browser:
        raise SystemExit("Chrome/Chromium required; no final acceptance checks executed.")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
    try:
        if args.browser != "firefox":
            with tempfile.TemporaryDirectory(prefix="v2-final-chrome-") as profile:
                with h.browser_session(browser, profile) as client:
                    print(f"Browser: {client.call('Browser.getVersion')['product']}", flush=True)
                    surface_suite(client, url, source, args.artifacts, "chrome")
                    v.reports_race(client, "chrome")
                    startup_failure(client, source, args.artifacts, "chrome")
                    if client.errors:
                        raise AssertionError(client.errors)
            zoom_suite(browser, url, source, args.artifacts)
        firefox = shutil.which("firefox")
        if firefox and args.browser != "chrome":
            with firefox_session(firefox, args.firefox_profile_parent, args.firefox_headed) as client:
                if args.firefox_headed:
                    surface_suite(client, url, source, args.artifacts, "firefox")
                    v.reports_race(client, "firefox")
                else:
                    firefox_smoke(client, url, source, args.artifacts)
                if args.firefox_headed:
                    startup_failure(client, source, args.artifacts, "firefox")
        elif args.browser != "chrome":
            print("SKIP Firefox: browser not installed", flush=True)
        print(f"PASS {len(v.checks)} independent presentation checks; inspect axe incomplete results separately", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

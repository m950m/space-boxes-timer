"""Presentation acceptance in real Chrome; no dependencies beyond the existing CDP helper.

Disposable profile/origin, production forms, trusted keyboard input, accessibility tree,
computed contrast, small viewports, text enlargement, reduced motion and forced colors.
Optional --screenshots DIR writes review images outside the repository.
"""

import argparse
import base64
import functools
import http.server
import importlib.util
import json
import pathlib
import shutil
import tempfile
import threading

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("planner_cdp", ROOT / "tests/run-planner-tests.py")
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
wait, fill, click, key = helpers.wait, helpers.fill, helpers.click, helpers.key
checks = []


def check(client, expression, label):
    if not client.evaluate(expression):
        details = client.evaluate("({width: innerWidth, scrollWidth: document.documentElement.scrollWidth, focus: document.activeElement.id, errors: [...document.querySelectorAll('[role=alert]')].map(e => e.textContent)})")
        raise AssertionError(f"{label}: {details}")
    checks.append(label)
    print(f"PASS {label}", flush=True)


def activate(client, selector, press=True):
    client.evaluate(f"document.querySelector({json.dumps(selector)}).focus()")
    key(client, "Tab", 9, 8)
    key(client, "Tab", 9)
    check(client, f"document.activeElement.matches({json.dumps(selector)}) && document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle === 'solid'", f"visible keyboard focus: {selector}")
    if press:
        key(client, "Enter", 13)


def contrast(client):
    # Actual rendered text with solid backgrounds. Transparent ancestors are resolved;
    # inactive/hidden controls and the decorative progress track are excluded.
    failures = client.evaluate("""(() => {
      const rgb = color => color.match(/[\\d.]+/g).map(Number);
      const luminance = c => c.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
        .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const failures = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.getClientRects().length || el.closest(':disabled') || el.closest('[hidden]')) continue;
        if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) && !el.matches('input,select,textarea')) continue;
        const style = getComputedStyle(el);
        let parent = el, background;
        while (parent) {
          background = rgb(getComputedStyle(parent).backgroundColor);
          if (background[3] === undefined || background[3] === 1) break;
          parent = parent.parentElement;
        }
        if (!parent) background = [255, 255, 255];
        const size = parseFloat(style.fontSize);
        const required = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight) >= 700) ? 3 : 4.5;
        const actual = ratio(luminance(rgb(style.color)), luminance(background));
        if (actual < required) failures.push({element: el.id || el.tagName, text: el.textContent.slice(0, 45), actual, required});
      }
      return failures;
    })()""")
    if failures:
        raise AssertionError(f"computed text contrast: {failures}")
    checks.append("computed visible text contrast meets AA thresholds")
    print("PASS computed visible text contrast meets AA thresholds", flush=True)


def screenshot(client, folder, name):
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
        result = client.call("Page.captureScreenshot", captureBeyondViewport=True)
        (folder / f"{name}.png").write_bytes(base64.b64decode(result["data"]))


def suite(client, url, screenshots):
    helpers.navigate(client, url)
    wait(client, "!!document.querySelector('#reports-output dl') || !!document.querySelector('#reports-error').textContent || !!document.querySelector('#focus-error').textContent")
    check(client, "!!document.querySelector('#reports-output dl')", "initial report renders without startup error")
    activate(client, ".skip-link")
    check(client, "document.activeElement.id === 'workspace'", "skip link moves keyboard focus to main workspace")
    for href, heading in [("#plans-heading", "plans-heading"), ("#focus-heading", "focus-heading"), ("#reports-heading", "reports-heading")]:
        activate(client, f'nav a[href="{href}"]')
        check(client, f"document.activeElement.id === '{heading}'", f"native navigation focuses {heading}")
    check(client, "document.querySelector('#primary-artwork').hidden && document.querySelectorAll('#primary-artwork *').length === 0", "unapproved artwork remains isolated and absent")
    check(client, "document.querySelector('#reports-output').getAttribute('aria-busy') === 'false'", "report read exposes settled busy state")
    contrast(client)

    # Exercise all dense editors through the production form, including long unbroken text.
    long_title = "Research_" + "longtitle" * 45
    fill(client, "#task-title", long_title)
    fill(client, "#task-start", "09:00")
    fill(client, "#task-classification", "primary")
    fill(client, "#focus-items input", "25")
    click(client, "#add-focus")
    fill(client, "#focus-items li:last-child input", "40")
    click(client, "#add-break")
    fill(client, "#break-list input", "5")
    click(client, "#add-resource")
    fill(client, "#resource-list .resource-url", "https://example.com/" + "resource" * 60)
    fill(client, "#task-note", "Long note " * 120)
    activate(client, "#save-task")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Saved.'")
    check(client, "document.querySelector('#primary-tasks h4').textContent === " + json.dumps(long_title), "long Primary title persists as literal headed content")
    click(client, "#primary-tasks button")
    check(client, "document.activeElement.id === 'task-title'", "editing moves focus into the editor")
    client.evaluate("document.querySelector('#focus-selection').selectedIndex = 1; document.querySelector('#focus-selection').dispatchEvent(new Event('change'))")
    activate(client, "#focus-start")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'running'")
    wait(client, "document.querySelector('#focus-progress').value > 0")
    check(client, "document.querySelector('#focus-task-title').textContent === " + json.dumps(long_title), "active focus identifies the long task title")
    check(client, "document.querySelector('#focus-progress').max === 1500000 && document.querySelector('#focus-progress').getAttribute('aria-hidden') === 'true' && document.querySelector('#focus-clock').getAttribute('aria-live') === 'off'", "progress uses the clock target without repetitive announcements")
    check(client, "(() => { const s = getComputedStyle(document.querySelector('#focus-progress')); const c = s.backgroundColor.match(/\\d+/g).slice(0, 3).map(n => Number(n) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); const l = c.reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0); return 1.05 / (l + .05) >= 3 && s.borderTopColor === 'rgb(255, 255, 255)'; })()", "progress fill and boundary have discernible non-text contrast")
    contrast(client)
    activate(client, "#focus-pause")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'paused'")
    contrast(client)
    activate(client, "#focus-end")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'ended'")
    activate(client, "#reports-refresh")
    wait(client, "!!document.querySelector('#reports-output li')")
    check(client, "document.querySelector('#reports-output').textContent.includes('ended early') && !document.querySelector('#reports-output').textContent.includes('score')", "ended-early reports remain factual")
    contrast(client)

    # Browser AX tree checks names and roles, not a substitute for manual screen readers.
    client.call("Accessibility.enable")
    tree = client.call("Accessibility.getFullAXTree")["nodes"]
    names = {(n.get("role", {}).get("value"), n.get("name", {}).get("value")) for n in tree if not n.get("ignored")}
    for pair in [("navigation", "Workspace"), ("textbox", "Title (required)"), ("combobox", "Saved session for the shown Plan Day"), ("button", "Refresh activity")]:
        if pair not in names:
            raise AssertionError(f"AX role/name missing: {pair}")
    checks.append("browser accessibility tree exposes named essential controls")
    print("PASS browser accessibility tree exposes named essential controls", flush=True)

    # 320 corresponds to 1280 at 400% browser zoom; text-only zoom separately doubles rem.
    for width, height in [(320, 720), (375, 812), (768, 1024), (1280, 900)]:
        client.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=False)
        check(client, "document.documentElement.scrollWidth <= innerWidth", f"long editor, focus and reports reflow at {width}px")
        check(client, "[...document.querySelectorAll('button:not(:disabled), nav a, summary')].filter(e => e.getClientRects().length).every(e => e.getBoundingClientRect().height >= 44)", f"visible action targets at least 44px high at {width}px")
        screenshot(client, screenshots, f"workspace-{width}")
    client.call("Emulation.setDeviceMetricsOverride", width=320, height=720, deviceScaleFactor=1, mobile=False)
    client.evaluate("document.documentElement.style.fontSize = '200%'")
    check(client, "document.documentElement.scrollWidth <= innerWidth", "200% text enlargement reflows at 320px without horizontal scrolling")
    client.evaluate("document.documentElement.style.fontSize = ''")
    client.evaluate("""window.visualSpacing = document.createElement('style');
      visualSpacing.textContent = '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }';
      document.head.append(visualSpacing);""")
    check(client, "document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('button')].filter(e => e.getClientRects().length).every(e => e.scrollHeight <= e.clientHeight + 1)", "increased text spacing reflows without clipping action labels")
    client.evaluate("visualSpacing.remove()")
    client.call("Emulation.setEmulatedMedia", features=[{"name": "prefers-reduced-motion", "value": "reduce"}])
    check(client, "matchMedia('(prefers-reduced-motion: reduce)').matches && [...document.querySelectorAll('body *')].every(e => { const s = getComputedStyle(e); return s.animationName === 'none' && s.transitionDuration === '0s'; })", "reduced-motion mode retains static equivalent presentation")
    client.call("Emulation.setEmulatedMedia", features=[{"name": "forced-colors", "value": "active"}])
    activate(client, "#reports-refresh", press=False)
    check(client, "matchMedia('(forced-colors: active)').matches && getComputedStyle(document.activeElement).outlineStyle === 'solid'", "forced colors preserve visible keyboard focus")
    client.call("Emulation.setEmulatedMedia", features=[])

    # A separate mounted view with a failing read demonstrates stale totals are cleared.
    client.evaluate("""import('/js/reports/reports-view.js').then(async m => {
      window.visualReadFails = false;
      const store = await (await import('/js/app.js')).planningStore;
      window.visualReports = m.mountReports({loadFocus: () => window.visualReadFails ? Promise.reject(new Error('Read unavailable')) : store.loadFocus()});
      await visualReports.refresh();
    })""")
    check(client, "!!document.querySelector('#reports-output dl')", "successful read displays report before fault")
    client.evaluate("visualReadFails = true; visualReports.refresh()")
    check(client, "!document.querySelector('#reports-output').children.length && document.querySelector('#reports-error').textContent.includes('Refresh activity to retry') && document.querySelector('#reports-output').getAttribute('aria-busy') === 'false'", "failed report read clears stale totals and explains retry")
    contrast(client)
    client.evaluate("visualReadFails = false; visualReports.refresh()")
    check(client, "!!document.querySelector('#reports-output dl') && !document.querySelector('#reports-error').textContent", "retry restores factual report and clears error")

    # Extra and child work use the same explicit, clearly named focus surface.
    parent_title = "Research notes"
    click(client, "#cancel-edit")
    fill(client, "#task-title", parent_title)
    fill(client, "#task-start", "10:00")
    fill(client, "#focus-items input", "25")
    activate(client, "#save-task")
    wait(client, "document.querySelector('#v2-startup-status').textContent === 'Saved.'")
    parent_id = client.evaluate("[...document.querySelectorAll('#task-parent option')].find(o => o.textContent.startsWith('Research notes —')).value")
    for title, parent in [("Extra reading", ""), ("Outline the notes", parent_id)]:
        fill(client, "#task-title", title)
        fill(client, "#task-start", "11:00")
        fill(client, "#focus-items input", "25")
        fill(client, "#task-parent", parent)
        activate(client, "#save-task")
        wait(client, "document.querySelector('#v2-startup-status').textContent === 'Saved.'")
        client.evaluate(f"""(() => {{
          const select = document.querySelector('#focus-selection');
          select.value = [...select.options].find(o => o.textContent.startsWith({json.dumps(title + ' —')})).value;
          select.dispatchEvent(new Event('change'));
        }})()""")
        activate(client, "#focus-start")
        wait(client, "document.querySelector('#focus-clock').dataset.state === 'running'")
        check(client, "document.querySelector('#focus-task-title').textContent === " + json.dumps(title) + " && document.querySelector('#focus-status').textContent.includes('Running') && document.querySelectorAll('#primary-tasks article').length === 1 && document.querySelector('#primary-artwork').hidden", f"{title} has explicit active-focus text outside the Primary group")
        activate(client, "#focus-end")
        wait(client, "document.querySelector('#focus-clock').dataset.state === 'ended'")
    check(client, "[...document.querySelectorAll('#extra-tasks .subtask-of')].some(e => e.textContent === 'Subtask of: Research notes')", "child work keeps its visible parent context")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots", type=pathlib.Path)
    args = parser.parse_args()
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no visual checks executed.")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="v2-visual-") as profile:
            with helpers.browser_session(browser, profile) as client:
                print(f"Browser: {client.call('Browser.getVersion')['product']}", flush=True)
                suite(client, f"http://127.0.0.1:{server.server_port}/", args.screenshots)
                if client.errors:
                    raise AssertionError(client.errors)
        print(f"PASS {len(checks)} visual acceptance checks in real Chrome")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

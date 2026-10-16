"""Chrome-only functional checks for the integrated artwork state mapping.

Drives the production index.html, which self-registers the approved Artwork v1
registry (js/artwork/registry.js): the real planning forms, focus controller and
projections decide every artwork state — idle, planning 0-3, active Primary
focus bound to the active task's slot, pause, Extra/subtask badge (never a
fourth box), early end without completion, and completion only through the
explicit task decision.
"""

import functools
import http.server
import importlib.util
import json
import pathlib
import shutil
import tempfile
import threading

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visual", ROOT / "tests/run-visual-tests.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
h = v.helpers
fill, click, key, wait = h.fill, h.click, h.key, h.wait


def select_session_by_title(client, title):
    index = client.evaluate(
        "[...document.querySelector('#focus-selection').options].findIndex(o => o.textContent.startsWith("
        + json.dumps(title + " — session 1") + "))")
    if index < 1:
        raise AssertionError(f"no saved session option for {title!r}")
    client.evaluate(f"document.querySelector('#focus-selection').selectedIndex = {index}")
    client.evaluate("document.querySelector('#focus-selection').dispatchEvent(new Event('change'))")


def create_task(client, title, classification, minutes):
    fill(client, "#task-title", title)
    fill(client, "#task-start", "09:00")
    fill(client, "#focus-items input", minutes)
    fill(client, "#task-classification", classification)
    click(client, "#save-task")
    wait(client, "!document.querySelector('#editor-fields').disabled")


def primary_src(client):
    return client.evaluate("document.querySelector('#primary-artwork img')?.getAttribute('src')")


def assert_primary(client, filename, label):
    wait(client, "document.querySelector('#primary-artwork img')?.getAttribute('src')?.includes(" + json.dumps(filename) + ")")
    v.check(client, "document.querySelector('#primary-artwork img')?.getAttribute('src')?.includes(" + json.dumps(filename) + ")",
            label)


def suite(client, url):
    client.call("Page.navigate", url=url)
    wait(client, "!!document.querySelector('#editor-fields') && !document.querySelector('#editor-fields').disabled")
    client.evaluate("import('/js/app.js').then(async m => window.store = await m.planningStore)")
    v.check(client, "globalThis.SpaceBoxesArtwork?.registry === 'character-artwork/v1-approved'",
            "production page registers the approved Artwork v1 registry")

    v.check(client, """(() => { const e = document.getElementById('primary-artwork');
      return e.querySelector('img')?.getAttribute('src').includes('sb-head-idle.svg')
        && e.getAttribute('aria-hidden') === 'true' && e.hidden === false
        && getComputedStyle(e).pointerEvents === 'none'
        && e.querySelector('img').alt === ''; })()""",
            "empty day shows the idle composition, still decorative and non-interactive")
    v.check(client, "document.getElementById('extra-artwork').hidden && !document.getElementById('extra-artwork').childNodes.length",
            "no Extra badge without an active Extra session")

    create_task(client, "Primary one", "primary", "9")
    create_task(client, "Primary two", "primary", "0.15")
    create_task(client, "Inbox sweep", "extra", "9")
    assert_primary(client, "sb-head-planning-2.svg", "two Primary tasks show two numbered cubes with one free slot")

    # Extra/subtask focus: badge outside the boxes; Primary composition unchanged.
    select_session_by_title(client, "Inbox sweep")
    click(client, "#focus-start")
    wait(client, "document.querySelector('#focus-status').textContent.includes('Running — controlled here')")
    v.check(client, """document.querySelector('#extra-artwork img')?.getAttribute('src').includes('sb-extra-active.svg')
        && document.querySelector('#primary-artwork img')?.getAttribute('src').includes('sb-head-planning-2.svg')
        && document.querySelectorAll('.task-artwork img').length === 2
        && document.querySelectorAll('#primary-tasks article').length === 2""",
            "active Extra task shows the badge only — never a fourth Primary box")
    click(client, "#focus-pause")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'paused'")
    v.check(client, "document.querySelector('#extra-artwork img')?.getAttribute('src').includes('sb-extra-active.svg')",
            "paused Extra session keeps its badge while reserved")
    click(client, "#focus-resume")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'running'")
    click(client, "#focus-end")
    wait(client, "document.querySelector('#focus-outcome').dataset.outcome === 'ended-early'")
    v.check(client, """!document.querySelector('#extra-artwork').childNodes.length
        && document.querySelector('#extra-artwork').hidden
        && document.querySelector('#primary-artwork img')?.getAttribute('src').includes('sb-head-planning-2.svg')""",
            "ending early clears the badge and never implies completion")

    # Primary focus binds the released cube to the ACTIVE task's slot (task two).
    select_session_by_title(client, "Primary two")
    click(client, "#focus-start")
    wait(client, "document.querySelector('#focus-status').textContent.includes('Running — controlled here')")
    assert_primary(client, "sb-head-focus-2-of-2.svg", "running Primary focus releases that task's own cube (2 of 2)")
    click(client, "#focus-pause")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'paused'")
    assert_primary(client, "sb-head-pause-2.svg", "paused Primary focus tucks the planned work (resting, not ended)")
    click(client, "#focus-resume")
    wait(client, "document.querySelector('#focus-clock').dataset.state === 'running'")
    wait(client, "document.querySelector('#focus-outcome').dataset.outcome === 'completed'")
    assert_primary(client, "sb-head-planning-2.svg",
                   "a fully observed session still returns the day to planning — sessions never complete tasks")

    # Genuine completion is the explicit task decision, for every Primary task.
    click(client, "article[data-task-id] button[aria-label^='Mark complete: Primary one']")
    wait(client, "!document.querySelector('#editor-fields').disabled")
    assert_primary(client, "sb-head-planning-2.svg", "one completed Primary task keeps the planning composition")
    click(client, "article[data-task-id] button[aria-label^='Mark complete: Primary two']")
    wait(client, "!document.querySelector('#editor-fields').disabled")
    assert_primary(client, "sb-head-complete.svg", "all Primary tasks decided complete shows the completion reaction")

    # Keyboard traversal still reaches the planner controls with artwork mounted.
    reached = False
    for _ in range(60):
        if client.evaluate("document.activeElement.matches('button[aria-label^=\"Edit task:\"]')"):
            reached = True
            break
        key(client, "Tab", 9)
    v.check(client, json.dumps(reached), "tab traversal still reaches task controls with artwork mounted")

    # Day with no tasks returns to idle; artwork keeps text and controls independent.
    tomorrow = client.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()")
    fill(client, "#view-day", tomorrow)
    assert_primary(client, "sb-head-idle.svg", "a day without Primary tasks shows the idle composition")

    v.check(client, """['primary-artwork','extra-artwork'].every(id => {
      const e = document.getElementById(id);
      return e.getAttribute('aria-hidden') === 'true' && getComputedStyle(e).pointerEvents === 'none'
        && (!e.querySelector('img') || e.querySelector('img').alt === ''); })""",
            "mounted artwork stays out of the accessibility tree at all times")
    for feature, value in [("prefers-reduced-motion", "reduce"), ("forced-colors", "active")]:
        client.call("Emulation.setEmulatedMedia", features=[{"name": feature, "value": value}])
        v.check(client, """[...document.querySelectorAll('.task-artwork img')].every(e =>
          e.complete && getComputedStyle(e).animationName === 'none' && getComputedStyle(e).transitionDuration === '0s')""",
                feature + " keeps the integrated artwork static")
    client.call("Emulation.setEmulatedMedia", features=[])
    for width in [320, 375, 768, 1280]:
        client.call("Emulation.setDeviceMetricsOverride", width=width, height=900, deviceScaleFactor=1, mobile=False)
        client.evaluate("document.documentElement.style.fontSize = '200%'")
        v.check(client, "document.documentElement.scrollWidth <= innerWidth",
                f"no horizontal overflow with active artwork at {width}px / 200% text")
    client.call("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)
    client.evaluate("document.documentElement.style.fontSize = ''")

    if client.errors:
        raise AssertionError(client.errors)


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no artwork state checks executed")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="v2-artwork-state-") as profile:
            with h.browser_session(browser, profile) as client:
                print("Browser:", client.call("Browser.getVersion")["product"], flush=True)
                suite(client, f"http://127.0.0.1:{server.server_port}/index.html")
        print(f"PASS {len(v.checks)} integrated artwork state checks", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

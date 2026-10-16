"""Chrome-only acceptance checks for the owner-evaluation artwork preview.

Covers artwork-preview.html only: assets load, hosts stay decorative and
non-interactive, the state switcher is keyboard operable, layouts hold from
320px with enlarged text, and reduced-motion/forced-colors keep the static
presentation. The production application and its dormant hooks are covered
separately by run-artwork-integration-tests.py and are not modified here.
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


def suite(client, url):
    client.call("Page.navigate", url=url)
    h.wait(client, "document.querySelector('#sb-primary-artwork img')?.naturalWidth === 480")
    v.check(client, "[...document.images].every(i => i.complete && i.naturalWidth > 0)",
            "every preview asset loads (no missing artwork)")
    v.check(client, """['sb-primary-artwork','sb-extra-artwork'].every(id => {
        const e = document.getElementById(id);
        return e.getAttribute('aria-hidden') === 'true'
          && getComputedStyle(e).pointerEvents === 'none'
          && e.querySelector('img')?.alt === ''; })""",
            "both preview hosts stay decorative: aria-hidden, pointer-events none, empty alt")
    v.check(client, "!document.querySelector('#task-artwork-image').content.querySelector('img').hasAttribute('src')",
            "inert template still requests no asset before cloning")

    # Keyboard: trusted traversal into the radio group, then arrow-key state switch.
    for _ in range(12):
        if client.evaluate("document.activeElement.matches('input[name=sb-state][value=planning]')"):
            break
        h.key(client, "Tab", 9)
    else:
        raise AssertionError("Tab never reached the state radio group")
    v.check(client, """document.activeElement.matches('input[name=sb-state]') && document.activeElement.value === 'planning'
        && document.activeElement.matches(':focus-visible')
        && getComputedStyle(document.activeElement).outlineStyle === 'solid'""",
            "Tab reaches the state radio group on the checked radio with visible focus")
    h.key(client, "ArrowRight", 39)
    v.check(client, """document.activeElement.value === 'focus'
        && document.querySelector('#sb-primary-artwork img').src.includes('sb-head-focus.svg')
        && document.querySelector('#sb-state-caption').textContent.includes('Focus')""",
            "arrow key moves state to Focus and swaps the asset")
    h.key(client, "ArrowLeft", 37)
    v.check(client, "document.querySelector('#sb-primary-artwork img').src.includes('sb-head-planning-2.svg')",
            "arrow key returns to Planning with the two-task composition")

    # Planning count drives the composition; the host hides cleanly when told to.
    client.evaluate("(() => { const s = document.querySelector('#sb-count'); s.value = '0'; s.dispatchEvent(new Event('change')); })()")
    v.check(client, "document.querySelector('#sb-primary-artwork img').src.includes('sb-head-planning-0.svg')",
            "count select swaps to the zero-task composition")
    client.evaluate("(() => { const c = document.querySelector('#sb-show-artwork'); c.checked = false; c.dispatchEvent(new Event('change')); })()")
    v.check(client, "document.querySelector('#sb-primary-artwork').hidden && !document.querySelector('#sb-primary-artwork').childNodes.length",
            "unchecking show-artwork clears and hides the host")
    client.evaluate("(() => { const c = document.querySelector('#sb-show-artwork'); c.checked = true; c.dispatchEvent(new Event('change')); })()")
    v.check(client, "!document.querySelector('#sb-primary-artwork').hidden && document.querySelectorAll('#sb-primary-artwork img').length === 1",
            "re-checking show-artwork remounts exactly one image")

    # Responsive sizing with enlarged text at four widths.
    for width in [320, 375, 768, 1280]:
        client.call("Emulation.setDeviceMetricsOverride", width=width, height=900, deviceScaleFactor=1, mobile=False)
        for size in ["100%", "200%"]:
            client.evaluate("document.documentElement.style.fontSize = " + json.dumps(size))
            v.check(client, """(() => {
              if (document.documentElement.scrollWidth > innerWidth) return false;
              return [...document.querySelectorAll('.task-artwork img')].every(e => {
                const r = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect();
                return r.width > 0 && r.width <= p.width + 1
                  && Math.abs(r.width / r.height - e.naturalWidth / e.naturalHeight) < .01;
              }); })()""",
                    f"no horizontal overflow, hosts in flow at {width}px / {size} text")
    client.call("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)
    client.evaluate("document.documentElement.style.fontSize = ''")

    # Static presentation under reduced motion and forced colors.
    for feature, value in [("prefers-reduced-motion", "reduce"), ("forced-colors", "active")]:
        client.call("Emulation.setEmulatedMedia", features=[{"name": feature, "value": value}])
        v.check(client, """(() => {
          const still = [...document.querySelectorAll('.task-artwork img')].every(e =>
            e.complete && e.getBoundingClientRect().width > 0
            && getComputedStyle(e).animationName === 'none' && getComputedStyle(e).transitionDuration === '0s');
          return still && document.querySelector('#focus-task-title').getClientRects().length; })()""",
                feature + " keeps the static images and independent task text")
    client.call("Emulation.setEmulatedMedia", features=[])

    v.contrast(client)
    if client.errors:
        raise AssertionError(client.errors)


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no preview checks executed")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="v2-artwork-preview-") as profile:
            with h.browser_session(browser, profile) as client:
                print("Browser:", client.call("Browser.getVersion")["product"], flush=True)
                suite(client, f"http://127.0.0.1:{server.server_port}/artwork-preview.html")
        print(f"PASS {len(v.checks)} artwork preview checks", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

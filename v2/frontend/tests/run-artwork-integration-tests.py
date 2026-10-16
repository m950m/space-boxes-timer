"""Chrome-only acceptance checks for the approved Artwork v1 production hosts.

Artwork v1 (owner-approved 2026-10-17) is active through js/artwork/registry.js:
this suite verifies the activation itself — the approved idle composition mounts
on load, both hosts stay decorative and non-interactive, sizing holds from 320px
with enlarged text, reduced motion and forced colors keep the static artwork,
and the documented informative-alternative path still works. Real-state mapping
coverage lives in run-artwork-state-tests.py.
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


def traversal(client):
    client.evaluate("document.querySelector('.skip-link').focus()")
    order = []
    for _ in range(16):
        h.key(client, "Tab", 9)
        result = client.evaluate("""(() => { const e = document.activeElement;
          return {name: e.id || e.getAttribute('href') || e.outerHTML,
            visible: e.matches(':focus-visible') && getComputedStyle(e).outlineStyle === 'solid'}; })()""")
        if not result["visible"]:
            raise AssertionError(result)
        order.append(result["name"])
    for name in reversed(["#workspace", *order[:-1]]):
        h.key(client, "Tab", 9, 8)
        v.check(client, "(document.activeElement.id || document.activeElement.getAttribute('href') || document.activeElement.outerHTML) === "
                + json.dumps(name), "Shift+Tab returns to " + name)
    return order


def suite(client, url):
    ready = "!!document.querySelector('#editor-fields') && !document.querySelector('#editor-fields').disabled"
    client.call("Page.navigate", url=url)
    h.wait(client, ready)

    # Approved activation: the idle composition mounts through the production
    # registry while both hosts remain decorative.
    v.check(client, """(() => { const host = document.getElementById('primary-artwork');
      const image = host.querySelector('img');
      return host.hidden === false && host.getAttribute('aria-hidden') === 'true'
        && host.querySelectorAll('img').length === 1
        && image.src.includes('sb-head-idle.svg') && image.alt === ''
        && image.complete && image.naturalWidth === 480
        && getComputedStyle(host).pointerEvents === 'none'; })()""",
            "Artwork v1 idle composition is active, decorative and non-interactive")
    v.check(client, "document.querySelector('#primary-artwork').parentElement.id === 'task-list' && document.querySelector('#primary-artwork').nextElementSibling.nextElementSibling.id === 'primary-tasks' && document.querySelector('#extra-artwork').previousElementSibling.id === 'focus-task-title' && !!document.querySelector('#extra-artwork').closest('#focus-panel')",
            "Primary placement precedes its cards; Extra/subtask placement follows active task text")
    v.check(client, "!document.querySelector('#task-artwork-image').content.querySelector('img').hasAttribute('src')",
            "template stays inert; assets mount only through the documented clone recipe")
    v.check(client, "!document.querySelector('#extra-artwork').childNodes.length && document.querySelector('#extra-artwork').hidden",
            "Extra host stays empty without an active Extra/subtask session")

    order = traversal(client)
    if "task-title" not in order:
        raise AssertionError("Forward keyboard traversal did not reach task editing")
    print("PASS keyboard traversal reaches task editing with artwork active", flush=True)

    # Sizing of the approved assets at four widths and two text sizes. The
    # Extra badge is mounted through the same documented recipe production uses.
    client.evaluate("""(() => {
      const host = document.querySelector('#extra-artwork');
      const image = document.querySelector('#task-artwork-image').content.firstElementChild.cloneNode(true);
      image.src = 'assets/artwork/sb-extra-active.svg';
      image.width = 360; image.height = 236; image.alt = '';
      host.replaceChildren(image); host.hidden = false;
    })()""")
    h.wait(client, "document.querySelector('#extra-artwork img')?.naturalWidth === 360")
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
                    f"proportional approved artwork, controls in flow, no horizontal overflow at {width}px / {size} text")

    tree = client.call("Accessibility.getFullAXTree")["nodes"]
    if any(not n.get("ignored") and n.get("role", {}).get("value") == "image" for n in tree):
        raise AssertionError("Decorative approved artwork leaked into the accessibility tree")
    print("PASS decorative artwork adds no duplicate accessibility announcement", flush=True)

    # The documented informative-alternative path keeps working when an image
    # ever carries essential information: host unhidden, meaningful alt exposed.
    client.evaluate("""(() => {
      const host = document.querySelector('#primary-artwork');
      const image = document.querySelector('#task-artwork-image').content.firstElementChild.cloneNode(true);
      image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#182c3d"/></svg>');
      image.width = 1600; image.height = 900;
      image.alt = 'Test fixture: a solid rectangle.';
      host.replaceChildren(image); host.removeAttribute('aria-hidden');
    })()""")
    h.wait(client, "document.querySelector('#primary-artwork img').naturalWidth === 1600")
    tree = client.call("Accessibility.getFullAXTree")["nodes"]
    if not any(n.get("role", {}).get("value") == "image" and n.get("name", {}).get("value")
               == "Test fixture: a solid rectangle." for n in tree):
        raise AssertionError("Informative image alternative missing from accessibility tree")
    print("PASS informative SVG image exposes its meaningful alternative", flush=True)
    if traversal(client) != order:
        raise AssertionError("Artwork changed keyboard order")
    print("PASS mounted image leaves forward/reverse keyboard order unchanged", flush=True)

    # Fresh load: the approved production artwork under reduced motion and
    # forced colors, then computed text contrast for the whole page.
    client.call("Page.navigate", url=url)
    h.wait(client, ready)
    h.wait(client, "document.querySelector('#primary-artwork img')?.src.includes('sb-head-idle.svg')")
    for feature, value in [("prefers-reduced-motion", "reduce"), ("forced-colors", "active")]:
        client.call("Emulation.setEmulatedMedia", features=[{"name": feature, "value": value}])
        v.check(client, """(() => { const e = document.querySelector('#primary-artwork img'), s = getComputedStyle(e);
          return e.complete && e.getBoundingClientRect().width > 0 && s.animationName === 'none' && s.transitionDuration === '0s'
            && document.querySelector('#focus-task-title').getClientRects().length; })()""",
                feature + " retains the static approved artwork and independent task text")
    client.call("Emulation.setEmulatedMedia", features=[])
    v.contrast(client)
    if client.errors:
        raise AssertionError(client.errors)


def main():
    browser = shutil.which("google-chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Chrome/Chromium required; no integration checks executed")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="v2-artwork-") as profile:
            with h.browser_session(browser, profile) as client:
                print("Browser:", client.call("Browser.getVersion")["product"], flush=True)
                suite(client, f"http://127.0.0.1:{server.server_port}/")
        print(f"PASS {len(v.checks)} Artwork v1 activation checks and 3 accessibility/keyboard assertions", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

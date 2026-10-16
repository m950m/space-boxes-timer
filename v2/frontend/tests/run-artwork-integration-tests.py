"""Chrome-only tests for dormant artwork slots; geometry fixtures are not product art.

Uses the existing stdlib/CDP helpers and disposable browser storage. Never changes
the Firefox acceptance runner or supplies assets to the production application.
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
    client.call("Page.navigate", url=url)
    h.wait(client, "!document.querySelector('#editor-fields').disabled")
    v.check(client, "['primary-artwork','extra-artwork'].every(id => { const e = document.getElementById(id); return e.hidden && e.getAttribute('aria-hidden') === 'true' && !e.childNodes.length; })",
            "both artwork hosts remain empty, hidden and absent from accessibility")
    v.check(client, "document.querySelector('#primary-artwork').parentElement.id === 'task-list' && document.querySelector('#primary-artwork').nextElementSibling.nextElementSibling.id === 'primary-tasks' && document.querySelector('#extra-artwork').previousElementSibling.id === 'focus-task-title' && !!document.querySelector('#extra-artwork').closest('#focus-panel')",
            "Primary placement precedes its cards; Extra/subtask placement follows active task text")
    v.check(client, "!document.querySelector('#task-artwork-image').content.querySelector('img').hasAttribute('src') && !document.querySelectorAll('.task-artwork img').length",
            "inert template requests no unapproved asset")
    before = traversal(client)
    if "task-title" not in before:
        raise AssertionError("Forward keyboard traversal did not reach task editing")

    # Test sizing/semantics using a plain rectangle, never character/head artwork.
    client.evaluate("""(() => {
      const host = document.querySelector('#primary-artwork');
      const image = document.querySelector('#task-artwork-image').content.firstElementChild.cloneNode(true);
      image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#182c3d"/></svg>');
      image.width = 1600; image.height = 900;
      image.alt = 'Test fixture: a solid rectangle.';
      host.append(image); host.hidden = false; host.removeAttribute('aria-hidden');
    })()""")
    h.wait(client, "document.querySelector('#primary-artwork img').naturalWidth === 1600")
    tree = client.call("Accessibility.getFullAXTree")["nodes"]
    if not any(n.get("role", {}).get("value") == "image" and n.get("name", {}).get("value")
               == "Test fixture: a solid rectangle." for n in tree):
        raise AssertionError("Informative image alternative missing from accessibility tree")
    print("PASS informative SVG image exposes its meaningful alternative", flush=True)
    if traversal(client) != before:
        raise AssertionError("Artwork changed keyboard order")
    print("PASS mounted image leaves forward/reverse keyboard order unchanged", flush=True)

    for host_id in ["primary-artwork", "extra-artwork"]:
        client.evaluate("""(() => { const source = document.querySelector('.task-artwork img');
          const host = document.getElementById(""" + json.dumps(host_id) + """);
          host.append(source); host.hidden = false; host.setAttribute('aria-hidden', 'true');
          source.alt = ''; })()""")
        for width in [320, 375, 768, 1280]:
            client.call("Emulation.setDeviceMetricsOverride", width=width, height=900, deviceScaleFactor=1, mobile=False)
            for size in ["100%", "200%"]:
                client.evaluate("document.documentElement.style.fontSize = " + json.dumps(size))
                v.check(client, """(() => { const e = document.querySelector('.task-artwork img'), r = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect();
                  return r.width > 0 && r.width <= p.width + 1 && Math.abs(r.width / r.height - 16 / 9) < .01
                    && document.documentElement.scrollWidth <= innerWidth
                    && getComputedStyle(e.parentElement).pointerEvents === 'none'; })()""",
                        f"{host_id}: proportional image, controls in flow, no horizontal overflow at {width}px / {size} text")
    tree = client.call("Accessibility.getFullAXTree")["nodes"]
    if any(not n.get("ignored") and n.get("role", {}).get("value") == "image" for n in tree):
        raise AssertionError("Decorative image leaked into accessibility tree")
    print("PASS decorative image adds no duplicate accessibility announcement", flush=True)
    for feature, value in [("prefers-reduced-motion", "reduce"), ("forced-colors", "active")]:
        client.call("Emulation.setEmulatedMedia", features=[{"name": feature, "value": value}])
        v.check(client, """(() => { const e = document.querySelector('.task-artwork img'), s = getComputedStyle(e);
          return e.complete && e.getBoundingClientRect().width > 0 && s.animationName === 'none' && s.transitionDuration === '0s'
            && document.querySelector('#focus-task-title').getClientRects().length; })()""",
                feature + " retains the static image and independent task text")
    client.call("Emulation.setEmulatedMedia", features=[])
    client.evaluate("document.querySelectorAll('.task-artwork').forEach(e => { e.replaceChildren(); e.hidden = true; e.setAttribute('aria-hidden','true'); }); document.documentElement.style.fontSize = ''")
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
        print(f"PASS {len(v.checks)} artwork boundary checks and 3 accessibility/keyboard assertions", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Regression check: the desktop iframe must not steal focus from page controls.

Serves a stub workspace page (tutor textarea + same-origin desktop iframe) that
loads the *real* shipped scripts
(`dojo_theme/static/js/dojo/desktop-keyboard.js` and
`output/win2000/image/native-keyboard.js`) and drives them in Chromium over CDP.

Scenarios:
  focus-retained             clicking the tutor textarea keeps focus there
  typing-complete            typing into the tutor textarea delivers every character
  desktop-typing             clicking the desktop still forwards keys to the guest
  focus-retained-after-desktop  returning to the textarea keeps focus there
  no-console-errors          the parent workspace page raises no page errors

Chromium is launched directly (ChromeDriver cannot start Chromium in containers
where /dev/shm is not writable).
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import pathlib
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any

import requests
import websocket


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
PARENT_SCRIPT = REPO_DIR / "dojo_theme/static/js/dojo/desktop-keyboard.js"
GUEST_SCRIPT = REPO_DIR / "output/win2000/image/native-keyboard.js"

PARENT_PAGE = """<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>workspace</title></head>
<body>
  <div class="challenge-workspace">
    <iframe id="workspace-iframe" src="desktop.html" width="700" height="420"></iframe>
    <aside class="learning-tutor-panel">
      <textarea id="tutor" rows="4" placeholder="你下一步想理解或验证什么？"></textarea>
    </aside>
  </div>
  <script src="desktop-keyboard.js"></script>
</body>
</html>
"""

DESKTOP_PAGE = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>noVNC</title>
<style>
  #noVNC_keyboardinput { position: absolute; width: 1px; height: 1px; opacity: 0; left: -1000px; }
  #noVNC_screen { width: 640px; height: 400px; background: #123; }
</style>
</head>
<body>
  <div id="noVNC_container"><canvas id="noVNC_screen"></canvas></div>
  <textarea id="noVNC_keyboardinput" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
  <script>
    window.__aiseceduKeys = [];
    window.__aiseceduMessages = [];
    window.__aiseceduUI = {
      rfb: {
        addEventListener: function () {},
        sendKey: function (keysym, code, down) {
          if (down) window.__aiseceduKeys.push(String.fromCharCode(keysym));
        },
      },
    };
    window.addEventListener("message", function (event) {
      const data = event.data;
      if (data && data.channel === "aisecedu-desktop-key") window.__aiseceduMessages.push(data.kind);
      else if (data && data.type) window.__aiseceduMessages.push(data.type);
    });
  </script>
  <script src="native-keyboard.js"></script>
</body>
</html>
"""

KEY_CODES = {
    " ": ("Space", 32),
    "!": ("Digit1", 49),
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class WebServer:
    def __init__(self, root: pathlib.Path):
        handler = functools.partial(Handler, directory=str(root))
        self.httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
        self.httpd.daemon_threads = True
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.port = self.httpd.server_address[1]

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()


class DevTools:
    """Minimal Chrome DevTools Protocol client."""

    def __init__(self, browser: "Chromium"):
        self.browser = browser
        self.next_id = 0
        self.pending: dict[int, dict[str, Any]] = {}
        self.events: list[dict[str, Any]] = []
        self.contexts: dict[str, int] = {}
        self.lock = threading.Lock()
        self.connection = None
        self.reader = None
        self._connect()
        for method in ("Page.enable", "Runtime.enable", "Log.enable"):
            self.call(method)

    def _connect(self):
        self.connection = websocket.create_connection(
            self.browser.target_ws_url, timeout=30, suppress_origin=True
        )
        self.contexts.clear()
        self.reader = threading.Thread(target=self._read_loop, daemon=True)
        self.reader.start()

    def _ensure_connection(self):
        # Idle DevTools sockets are closed by some environments; reconnect transparently.
        if self.reader is not None and self.reader.is_alive():
            return
        try:
            if self.connection is not None:
                self.connection.close()
        except Exception:
            pass
        self._connect()
        for method in ("Page.enable", "Runtime.enable", "Log.enable"):
            self._call_once(method, None, 30)

    def _read_loop(self) -> None:
        while True:
            try:
                raw = self.connection.recv()
            except Exception:
                return
            if not raw:
                continue
            try:
                message = json.loads(raw)
            except (TypeError, ValueError):
                # CDP also emits non-JSON/binary frames; never let one kill the reader.
                continue
            try:
                with self.lock:
                    if "id" in message:
                        self.pending[message["id"]] = message
                    else:
                        if message.get("method") == "Runtime.executionContextCreated":
                            context = message["params"]["context"]
                            frame_id = (context.get("auxData") or {}).get("frameId")
                            if frame_id:
                                self.contexts[frame_id] = context["id"]
                        self.events.append(message)
            except Exception:
                # A malformed event must never take the whole session down.
                continue

    def call(self, method: str, params: dict[str, Any] | None = None, timeout: float = 30, retries: int = 1):
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                self._ensure_connection()
                return self._call_once(method, params, timeout)
            except TimeoutError as error:
                # A single slow round trip (busy renderer, large frame) must not fail the run.
                last_error = error
                time.sleep(0.5 * (attempt + 1))
        raise last_error if last_error else TimeoutError(f"CDP {method} timed out")

    def _call_once(self, method: str, params: dict[str, Any] | None, timeout: float):
        with self.lock:
            self.next_id += 1
            message_id = self.next_id
        self.connection.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self.lock:
                if message_id in self.pending:
                    message = self.pending.pop(message_id)
                    if "error" in message:
                        raise RuntimeError(f"CDP {method} failed: {message['error']}")
                    return message.get("result", {})
            time.sleep(0.01)
        raise TimeoutError(f"CDP {method} timed out")

    def evaluate(self, expression: str, context_id: int | None = None):
        params: dict[str, Any] = {"expression": expression, "returnByValue": True}
        if context_id is not None:
            params["contextId"] = context_id
        result = self.call("Runtime.evaluate", params)
        if result.get("exceptionDetails"):
            raise RuntimeError(f"evaluate failed: {result['exceptionDetails']}")
        return result.get("result", {}).get("value")

    def frame_id(self, url_fragment: str) -> str:
        tree = self.call("Page.getFrameTree")["frameTree"]
        stack = [tree]
        while stack:
            node = stack.pop()
            frame = node["frame"]
            if url_fragment in frame.get("url", ""):
                return frame["id"]
            stack.extend(node.get("childFrames", []))
        raise RuntimeError(f"frame containing {url_fragment!r} not found")

    def context_for_frame(self, frame_id: str) -> int:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            with self.lock:
                if frame_id in self.contexts:
                    return self.contexts[frame_id]
            time.sleep(0.05)
        raise RuntimeError("no execution context for frame")

    def in_frame(self, frame_id: str, expression: str):
        return self.evaluate(expression, self.context_for_frame(frame_id))

    def mouse_click(self, x: float, y: float) -> None:
        for event_type in ("mousePressed", "mouseReleased"):
            self.call(
                "Input.dispatchMouseEvent",
                {
                    "type": event_type,
                    "x": x,
                    "y": y,
                    "button": "left",
                    "buttons": 1 if event_type == "mousePressed" else 0,
                    "clickCount": 1,
                },
            )
            time.sleep(0.05)

    def click_selector(self, selector: str) -> None:
        center = self.evaluate(
            "(() => { const el = document.querySelector(%s);"
            "const r = el.getBoundingClientRect();"
            "return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()" % json.dumps(selector)
        )
        self.mouse_click(center["x"], center["y"])

    def click_iframe_center(self, selector: str) -> None:
        self.click_selector(selector)

    def type_text(self, text: str) -> None:
        for character in text:
            code, key_code = KEY_CODES.get(character, (f"Key{character.upper()}", ord(character.upper())))
            self.call(
                "Input.dispatchKeyEvent",
                {
                    "type": "keyDown",
                    "text": character,
                    "unmodifiedText": character,
                    "key": character,
                    "code": code,
                    "windowsVirtualKeyCode": key_code,
                    "nativeVirtualKeyCode": key_code,
                },
            )
            self.call(
                "Input.dispatchKeyEvent",
                {
                    "type": "keyUp",
                    "key": character,
                    "code": code,
                    "windowsVirtualKeyCode": key_code,
                    "nativeVirtualKeyCode": key_code,
                },
            )
            time.sleep(0.02)

    def page_errors(self) -> list[str]:
        errors = []
        with self.lock:
            events = list(self.events)
        for event in events:
            if event.get("method") == "Runtime.exceptionThrown":
                details = event["params"].get("exceptionDetails", {})
                text = details.get("exception", {}).get("description") or details.get("text", "")
                errors.append(str(text).splitlines()[0])
            elif event.get("method") == "Log.entryAdded":
                entry = event["params"].get("entry", {})
                if entry.get("level") == "error" and entry.get("source") == "javascript":
                    errors.append(str(entry.get("text", "")))
        return errors

    def close(self) -> None:
        try:
            if self.connection is not None:
                self.connection.close()
        except Exception:
            pass


class Chromium:
    def __init__(self, port: int):
        self.port = port
        self.profile = tempfile.mkdtemp(prefix="aisecedu-keyboard-profile-")
        self.binary = os.getenv("DOJO_BROWSER_BINARY") or shutil.which("chromium-browser") or shutil.which("chromium")
        if not self.binary:
            raise RuntimeError("chromium not found")
        self.process = subprocess.Popen(
            [
                self.binary,
                "--headless=new",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-proxy-server",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--window-size=1280,900",
                f"--remote-debugging-port={port}",
                f"--user-data-dir={self.profile}",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 30
        target = None
        while time.monotonic() < deadline:
            try:
                targets = requests.get(f"http://127.0.0.1:{port}/json/list", timeout=2).json()
                target = next(
                    (item for item in targets if item.get("type") == "page" and item.get("webSocketDebuggerUrl")),
                    None,
                )
                if target:
                    break
            except requests.RequestException:
                pass
            time.sleep(0.2)
        if not target:
            raise RuntimeError("Chromium DevTools endpoint did not become ready")
        self.target_ws_url = target["webSocketDebuggerUrl"]

    def close(self) -> None:
        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


LINUX_BRIDGE = REPO_DIR / "workspace/services/desktop/keyboard-capture.js"

LINUX_PARENT_PAGE = PARENT_PAGE.replace('src="desktop.html"', 'src="app/desktop.html"')

LINUX_DESKTOP_PAGE = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>noVNC</title>
<style>
  #noVNC_keyboardinput, #keyboardinput { position: absolute; width: 1px; height: 1px; opacity: 0; left: -1000px; }
  #noVNC_screen { width: 640px; height: 400px; background: #123; }
</style>
</head>
<body>
  <div id="noVNC_container"><canvas id="noVNC_screen"></canvas></div>
  <textarea id="noVNC_keyboardinput" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
  <script type="module" src="bridge.js"></script>
</body>
</html>
"""

LINUX_UI_STUB = """const rfb = {
  addEventListener: function () {},
  removeEventListener: function () {},
  sendKey: function (keysym, code, down) {
    if (down) (window.__aiseceduKeys = window.__aiseceduKeys || []).push(String.fromCharCode(keysym));
  },
  clipboardPasteFrom: function () {},
};
export default {rfb};
"""

LINUX_INPUT_UTIL_STUB = """export function getKeycode(event) { return event.code || event.key; }
export function getKeysym(event) {
  return event.key && event.key.length === 1 ? event.key.charCodeAt(0) : 0;
}
"""


def build_webroot(root: pathlib.Path) -> None:
    shutil.copy(PARENT_SCRIPT, root / "desktop-keyboard.js")
    shutil.copy(GUEST_SCRIPT, root / "native-keyboard.js")
    (root / "parent.html").write_text(PARENT_PAGE, encoding="utf-8")
    (root / "desktop.html").write_text(DESKTOP_PAGE, encoding="utf-8")

    linux = root / "linux"
    (linux / "app").mkdir(parents=True)
    (linux / "core/input").mkdir(parents=True)
    shutil.copy(PARENT_SCRIPT, linux / "desktop-keyboard.js")
    shutil.copy(LINUX_BRIDGE, linux / "app/bridge.js")
    (linux / "index.html").write_text(LINUX_PARENT_PAGE, encoding="utf-8")
    (linux / "app/desktop.html").write_text(LINUX_DESKTOP_PAGE, encoding="utf-8")
    (linux / "app/ui.js").write_text(LINUX_UI_STUB, encoding="utf-8")
    (linux / "core/input/util.js").write_text(LINUX_INPUT_UTIL_STUB, encoding="utf-8")


def wait_for_load(devtools: DevTools, timeout: float = 20) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if devtools.evaluate("document.readyState") == "complete":
            return
        time.sleep(0.1)
    raise TimeoutError("page did not finish loading")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug-port", type=int, default=9333)
    args = parser.parse_args()

    failures: list[str] = []

    def check(name: str, condition: bool, detail: str) -> None:
        print(f"{'PASS' if condition else 'FAIL'}  {name}: {detail}", flush=True)
        if not condition:
            failures.append(name)

    with tempfile.TemporaryDirectory(prefix="aisecedu-keyboard-webroot-") as webroot_name:
        webroot = pathlib.Path(webroot_name)
        build_webroot(webroot)
        with WebServer(webroot) as server:
            browser = Chromium(args.debug_port)
            devtools = DevTools(browser)
            try:
                devtools.call("Page.navigate", {"url": f"http://127.0.0.1:{server.port}/parent.html?service=desktop"})
                time.sleep(2.5)
                wait_for_load(devtools)

                desktop_frame = devtools.frame_id("desktop.html")

                devtools.click_selector("#tutor")
                time.sleep(1.5)
                focused = devtools.evaluate(
                    "(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : ''; })()"
                )
                check(
                    "focus-retained",
                    focused == "tutor",
                    f"after clicking the tutor textarea the focused element is {focused!r}",
                )

                devtools.type_text("hello")
                time.sleep(0.8)
                typed = devtools.evaluate("document.getElementById('tutor').value")
                forwarded = devtools.in_frame(desktop_frame, "(() => (window.__aiseceduKeys || []).join(''))()")
                check(
                    "typing-complete",
                    typed == "hello" and forwarded == "",
                    f"textarea holds {typed!r}, the guest received {forwarded!r}",
                )

                devtools.click_iframe_center("#workspace-iframe")
                time.sleep(0.8)
                devtools.type_text("abc")
                time.sleep(0.8)
                forwarded = devtools.in_frame(desktop_frame, "(() => (window.__aiseceduKeys || []).join(''))()")
                messages = devtools.in_frame(
                    desktop_frame, "(() => (window.__aiseceduMessages || []).join(','))()"
                )
                check(
                    "desktop-typing",
                    forwarded == "abc",
                    f"the guest received {forwarded!r} after clicking the desktop (messages: {messages!r})",
                )

                devtools.click_selector("#tutor")
                time.sleep(1.2)
                devtools.type_text("world")
                time.sleep(0.8)
                typed = devtools.evaluate("document.getElementById('tutor').value")
                forwarded = devtools.in_frame(desktop_frame, "(() => (window.__aiseceduKeys || []).join(''))()")
                check(
                    "focus-retained-after-desktop",
                    typed.endswith("world") and "world" not in forwarded,
                    f"textarea holds {typed!r}, the guest received {forwarded!r}",
                )

                errors = devtools.page_errors()
                check(
                    "no-console-errors",
                    not errors,
                    "no page errors" if not errors else f"page errors: {errors[:3]}",
                )

                devtools.call(
                    "Page.navigate",
                    {"url": f"http://127.0.0.1:{server.port}/linux/index.html?service=desktop"},
                )
                time.sleep(2.5)
                wait_for_load(devtools)

                devtools.click_selector("#tutor")
                time.sleep(1.5)
                focused = devtools.evaluate(
                    "(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : ''; })()"
                )
                check(
                    "linux-focus-retained",
                    focused == "tutor",
                    f"linux desktop: after clicking the tutor textarea the focused element is {focused!r}",
                )

                devtools.type_text("hello")
                time.sleep(0.8)
                typed = devtools.evaluate("document.getElementById('tutor').value")
                check(
                    "linux-typing-complete",
                    typed == "hello",
                    f"linux desktop: textarea holds {typed!r}",
                )

                devtools.click_iframe_center("#workspace-iframe")
                time.sleep(0.8)
                focused = devtools.evaluate(
                    "(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : ''; })()"
                )
                check(
                    "linux-desktop-claims-keyboard",
                    focused == "workspace-iframe",
                    f"linux desktop: after clicking the desktop the focused element is {focused!r}",
                )

                errors = devtools.page_errors()
                check(
                    "linux-no-console-errors",
                    not errors,
                    "no page errors" if not errors else f"page errors: {errors[:3]}",
                )
            finally:
                devtools.close()
                browser.close()

    if failures:
        print(f"\n{len(failures)} scenario(s) failed: {', '.join(failures)}", flush=True)
        return 1
    print("\nAll desktop keyboard focus scenarios passed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

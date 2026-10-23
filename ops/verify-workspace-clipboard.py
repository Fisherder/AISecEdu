#!/usr/bin/env python3
"""Real-browser verification of the workspace clipboard bridge (paste / copy / flag).

Requires a live deployment with a running Windows lab container. Drives the real
workspace page through CDP: paste (real Ctrl+V), copy (verified by pasting the
text back into the guest), and the flag produced by the genuine guest check
flow. Override with DOJO_CLIPBOARD_BASE / DOJO_CLIPBOARD_CONTAINER /
DOJO_CLIPBOARD_STATE.
"""

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import time

import requests

REPO = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("DOJO_CLIPBOARD_BASE", "http://10.92.35.7:8080")
CONTAINER = os.environ.get("DOJO_CLIPBOARD_CONTAINER", "user_7239")
STATE = json.loads(
    pathlib.Path(
        os.environ.get("DOJO_CLIPBOARD_STATE", "/tmp/tutor-timing-student.json")
    ).read_text()
)

spec = importlib.util.spec_from_file_location(
    "focus_harness", str(REPO / "ops/verify-desktop-keyboard-focus.py")
)
harness = importlib.util.module_from_spec(spec)
sys.modules["focus_harness"] = harness
spec.loader.exec_module(harness)

results = []


def check(name, condition, detail):
    results.append((name, condition))
    print(f"{'PASS' if condition else 'FAIL'}  {name}: {detail}", flush=True)


def clip(*args):
    result = subprocess.run(
        ["docker", "exec", "pwncollege-dojo", "docker", "exec", CONTAINER,
         "python3", "/usr/local/lib/windows-lab/clipboard.py", *args],
        capture_output=True, text=True, timeout=300,
    )
    lines = [line for line in (result.stdout or "").strip().splitlines() if line.strip()]
    try:
        return json.loads(lines[-1]) if lines else {}
    except ValueError:
        return {"raw": lines[-1] if lines else (result.stderr or "")[-200:]}


def set_guest_clipboard(text):
    pathlib.Path("/tmp/clip_in.txt").write_text(text, encoding="utf-8")
    subprocess.run(["docker", "cp", "/tmp/clip_in.txt", "pwncollege-dojo:/tmp/clip_in.txt"], check=True)
    subprocess.run(
        ["docker", "exec", "pwncollege-dojo", "docker", "cp", "/tmp/clip_in.txt", f"{CONTAINER}:/tmp/clip_in.txt"],
        check=True,
    )
    return clip("set", "--text-file", "/tmp/clip_in.txt")


def wait_for_guest_clipboard(expected, attempts=10, delay=6.0):
    state = {}
    for _ in range(attempts):
        state = clip("get")
        if state.get("available") and state.get("text") == expected:
            return state
        time.sleep(delay)
    return state


def real_ctrl_v(devtools):
    devtools.call("Input.dispatchKeyEvent", {
        "type": "keyDown", "modifiers": 2, "key": "v", "code": "KeyV",
        "windowsVirtualKeyCode": 86, "nativeVirtualKeyCode": 86, "commands": ["paste"]})
    devtools.call("Input.dispatchKeyEvent", {
        "type": "keyUp", "modifiers": 2, "key": "v", "code": "KeyV", "windowsVirtualKeyCode": 86})


session = requests.Session()
session.headers.update({"Authorization": "Bearer frontend-session", "Host": "10.92.35.7"})
session.post(
    f"{BASE}/pwncollege_api/v1/auth/login",
    json={"name": STATE["user"], "password": STATE["password"]},
    timeout=30,
).raise_for_status()

browser = harness.Chromium(9412)
devtools = harness.DevTools(browser)
try:
    devtools.call("Network.enable")
    for name, value in session.cookies.get_dict().items():
        devtools.call("Network.setCookie", {"name": name, "value": value, "domain": "10.92.35.7", "path": "/"})
    devtools.call("Page.navigate", {"url": f"{BASE}/workspace?service=desktop"})
    time.sleep(3)
    harness.wait_for_load(devtools)
    for _ in range(120):
        if devtools.evaluate(
            "(() => { const f = document.getElementById('workspace-iframe');"
            "return Boolean(f && f.dataset && f.dataset.aiseceduLoaded === '1'); })()"
        ):
            break
        time.sleep(1)

    def banner():
        return devtools.evaluate(
            '(() => { const b = document.querySelector(".workspace-notification-banner");'
            "return b ? b.innerText.trim() : ''; })()"
        )

    def visible(action):
        return devtools.evaluate(
            "(() => { const b = document.querySelector(\"[data-clipboard-action='%s']\");"
            "return Boolean(b) && !b.hidden; })()" % action
        )

    devtools.evaluate("""(() => {
      const button = document.createElement('button');
      button.id = 'seed-clipboard';
      button.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;padding:16px';
      button.textContent = 'seed';
      button.onclick = () => window.AISecEduClipboard.writeText('LOCAL-CLIP-777');
      document.body.appendChild(button);
      return true;
    })()""")
    devtools.click_selector("#seed-clipboard")
    time.sleep(1)

    set_guest_clipboard("PLACEHOLDER-BEFORE-PASTE")
    devtools.click_selector("[data-clipboard-action='paste']")
    time.sleep(1.5)
    dialog = devtools.evaluate(
        "(() => { const l = document.querySelector('.aisecedu-dialog-layer.is-visible');"
        "return l ? l.innerText.slice(0, 60) : ''; })()"
    )
    check("paste-dialog", "Ctrl+V" in dialog, repr(dialog)[:70])
    real_ctrl_v(devtools)
    time.sleep(5)
    state = wait_for_guest_clipboard("LOCAL-CLIP-777")
    check("paste-local-to-guest", state.get("text") == "LOCAL-CLIP-777",
          f"guest clipboard = {str(state.get('text'))[:50]!r}")
    check("paste-banner", "客户机剪贴板" in banner(), repr(banner())[:80])

    set_guest_clipboard("FROM-GUEST-42")
    devtools.click_selector("[data-clipboard-action='copy']")
    time.sleep(6)
    check("copy-banner", "已复制" in banner(), repr(banner())[:80])
    set_guest_clipboard("PLACEHOLDER-AFTER-COPY")
    devtools.click_selector("[data-clipboard-action='paste']")
    time.sleep(1.5)
    real_ctrl_v(devtools)
    time.sleep(5)
    state = wait_for_guest_clipboard("FROM-GUEST-42")
    check("copy-guest-to-local", state.get("text") == "FROM-GUEST-42",
          f"guest clipboard = {str(state.get('text'))[:50]!r}")

    solve = subprocess.run(["python3", "/tmp/solve_lab.py"], capture_output=True, text=True, timeout=600)
    flag = None
    for line in (solve.stdout or "").splitlines():
        if "lab-result.json" in line:
            try:
                flag = json.loads(line.split("lab-result.json:", 1)[1])["flag"]
            except (ValueError, KeyError, IndexError):
                flag = None
    print("guest check produced flag:", flag, flush=True)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline and not visible("flag"):
        time.sleep(3)
    check("flag-button-visible", visible("flag"), "flag button appeared")
    devtools.click_selector("[data-clipboard-action='flag']")
    time.sleep(4)
    check("flag-copy-banner", "已复制" in banner(), repr(banner())[:80])
    set_guest_clipboard("PLACEHOLDER-AFTER-FLAG")
    devtools.click_selector("[data-clipboard-action='paste']")
    time.sleep(1.5)
    real_ctrl_v(devtools)
    time.sleep(5)
    state = wait_for_guest_clipboard(flag) if flag else clip("get")
    check("flag-roundtrip", bool(flag) and state.get("text") == flag,
          f"state = {json.dumps(state, ensure_ascii=False)[:140]}")
    errors = devtools.page_errors()
    check("no-console-errors", not errors, str(errors[:2]))
finally:
    devtools.close()
    browser.close()

failed = [name for name, ok in results if not ok]
print(("\nfailed: " + ", ".join(failed)) if failed else "\nAll clipboard scenarios passed.")
sys.exit(1 if failed else 0)

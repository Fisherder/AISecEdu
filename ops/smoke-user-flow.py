#!/usr/bin/env python3
import base64
import json
import os
import pathlib
import re
import secrets
import shlex
import shutil
import subprocess
import tempfile
import time
import urllib.parse

import requests
import urllib3
import yaml


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent


def load_deployment_env():
    path = pathlib.Path(
        os.getenv("DOJO_DEPLOYMENT_ENV", REPO_DIR / "ops/deployment.env")
    )
    if not path.is_file():
        return
    for number, raw_line in enumerate(path.read_text().splitlines(), 1):
        line = raw_line.rstrip("\r")
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise ValueError(f"Invalid deployment environment line {number}: {line}")
        os.environ.setdefault(key, value)


load_deployment_env()

CONTAINER = os.getenv("DOJO_CONTAINER", "pwncollege-dojo")
LISTEN_ADDRESS = os.getenv("DOJO_LISTEN_ADDRESS", "127.0.0.1")
HTTPS_PORT = int(os.getenv("DOJO_HTTPS_PORT", "443"))
SSH_PORT = int(os.getenv("DOJO_SSH_PORT", "2223"))
DOJO_HOST = os.getenv("DOJO_HOST", "localhost.pwn.college")
BASE_URL = f"https://{LISTEN_ADDRESS}:{HTTPS_PORT}"
CREDENTIALS = pathlib.Path(
    os.getenv("DOJO_ADMIN_CREDENTIALS", REPO_DIR / "data/admin-password.txt")
)


def passed(message):
    print(f"PASS  {message}", flush=True)


def require(response, statuses=(200,)):
    if response.status_code not in statuses:
        raise AssertionError(
            f"{response.request.method} {response.request.path_url}: "
            f"expected {statuses}, received {response.status_code}"
        )
    return response


def new_session():
    session = requests.Session()
    session.verify = False
    session.trust_env = False
    session.headers["Host"] = DOJO_HOST
    return session


def authenticate(name, password, register=False):
    session = new_session()
    endpoint = "register" if register else "login"
    session.headers["Authorization"] = "Bearer frontend-session"
    payload = {
        "name": name,
        "password": password,
    }
    if register:
        payload["email"] = f"{name}@example.invalid"
        payload["commitment_accepted"] = True
    response = session.post(
        f"{BASE_URL}/pwncollege_api/v1/auth/{endpoint}",
        json=payload,
        allow_redirects=False,
        timeout=20,
    )
    require(response, (200,))
    return session


def credentials():
    values = {"username": "admin", "password": "admin"}
    if CREDENTIALS.exists():
        try:
            content = CREDENTIALS.read_text().strip()
        except PermissionError:
            content = outer("cat", "/data/admin-password.txt").stdout.strip()
        if "=" not in content:
            values["password"] = content
        else:
            for line in content.splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key] = value
    return values["username"], values["password"]


def outer(*args, check=True):
    return subprocess.run(
        ["docker", "exec", CONTAINER, *args],
        check=check,
        capture_output=True,
        text=True,
        timeout=60,
    )


def inner(*args, check=True):
    return outer("docker", *args, check=check)


def solution_counts():
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-F",
        ",",
        "-c",
        "select (select count(*) from solves), (select count(*) from submissions);",
    )
    return tuple(int(value) for value in result.stdout.strip().split(","))


def wait_for_workspace(container_name, present=True, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = inner("inspect", container_name, check=False)
        if (result.returncode == 0) == present:
            return
        time.sleep(2)
    state = "appear" if present else "stop"
    raise AssertionError(f"workspace {container_name} did not {state}")


def start_workspace(session, dojo):
    response = require(
        session.post(
            f"{BASE_URL}/pwncollege_api/v1/docker",
            json={"dojo": dojo, "module": "smoke", "challenge": "service"},
            timeout=120,
        )
    )
    if not response.json().get("success"):
        raise AssertionError(f"workspace start failed: {response.json().get('error')}")


def workspace_service_diagnostics(workspace, service):
    if service != "desktop":
        return
    result = inner(
        "exec",
        workspace,
        "sh",
        "-c",
        "ls -la /run/dojo/var/desktop-service 2>&1; "
        "for file in /run/dojo/var/desktop-service/*.log; do "
        'test -f "$file" || continue; printf \'\\n== %s ==\\n\' "$file"; '
        'tail -n 120 "$file"; done; '
        "printf '\\n== processes ==\\n'; ps -eo pid,ppid,vsz,rss,comm,args | grep -E 'Xvnc|novnc|websockify|xfce' || true; "
        "printf '\\n== memory ==\\n'; grep -E 'MemTotal|MemAvailable|CommitLimit|Committed_AS' /proc/meminfo; "
        "printf 'overcommit='; cat /proc/sys/vm/overcommit_memory; "
        "for pid in $(pgrep -f 'Xvnc|novnc|websockify'); do "
        "printf '\\n== status %s ==\\n' \"$pid\"; grep -E 'Name|Pid|Threads|VmPeak|VmSize|VmRSS|VmData|VmStk' /proc/$pid/status; done; "
        "printf '\\n== cgroup ==\\n'; for file in memory.current memory.max memory.events pids.current pids.max; do "
        "test -f /sys/fs/cgroup/$file || continue; printf '%s=' \"$file\"; cat /sys/fs/cgroup/$file; done; "
        "printf '\\n== limits ==\\n'; cat /proc/1/limits",
        check=False,
    )
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)
    fork_test = inner(
        "exec",
        "--user=1000",
        workspace,
        "/run/current-system/sw/bin/python3",
        "-c",
        "import os; pid=os.fork(); print(f'fork={pid}', flush=True); os._exit(0) if pid == 0 else os.waitpid(pid, 0)",
        check=False,
    )
    print(
        f"fork-test rc={fork_test.returncode} stdout={fork_test.stdout!r} stderr={fork_test.stderr!r}",
        flush=True,
    )
    multiprocessing_test = inner(
        "exec",
        "--user=1000",
        workspace,
        "/run/current-system/sw/bin/python3",
        "-c",
        "import multiprocessing; p=multiprocessing.Process(); p.start(); p.join(); print(f'multiprocessing={p.exitcode}')",
        check=False,
    )
    print(
        f"multiprocessing-test rc={multiprocessing_test.returncode} stdout={multiprocessing_test.stdout!r} stderr={multiprocessing_test.stderr!r}",
        flush=True,
    )


def signed_service(session, service, workspace):
    response = require(
        session.get(
            f"{BASE_URL}/pwncollege_api/v1/workspace",
            params={"service": service},
            timeout=60,
        )
    )
    payload = response.json()
    if not payload.get("success") or not payload.get("iframe_src"):
        workspace_service_diagnostics(workspace, service)
        raise AssertionError(f"{service} did not return a signed workspace URL")
    parsed = urllib.parse.urlsplit(payload["iframe_src"])
    if service == "code" and urllib.parse.parse_qs(parsed.query).get("folder") != [
        "/challenge"
    ]:
        raise AssertionError("Code service did not open the challenge directory")
    target = urllib.parse.urlunsplit(
        (
            "https",
            f"{LISTEN_ADDRESS}:{HTTPS_PORT}",
            parsed.path,
            parsed.query,
            "",
        )
    )
    for _ in range(20):
        response = requests.get(
            target,
            headers={"Host": parsed.hostname},
            verify=False,
            timeout=15,
            allow_redirects=False,
        )
        if response.status_code == 200:
            if service == "terminal" and "aisecedu-terminal-keyboard-guard" not in response.text:
                raise AssertionError("Terminal proxy did not serve the Escape-key guard")
            if service == "desktop" and "aisecedu-workspace-bridge.js" not in response.text:
                raise AssertionError("Desktop proxy did not serve the keyboard and clipboard bridge")
            return payload, response
        if response.status_code in (301, 302, 307, 308) and response.headers.get(
            "Location"
        ):
            redirected = urllib.parse.urlsplit(
                urllib.parse.urljoin(payload["iframe_src"], response.headers["Location"])
            )
            target = urllib.parse.urlunsplit(
                (
                    "https",
                    f"{LISTEN_ADDRESS}:{HTTPS_PORT}",
                    redirected.path,
                    redirected.query,
                    "",
                )
            )
            continue
        time.sleep(2)
    raise AssertionError(f"{service} proxy returned {response.status_code}")


def verify_ssh(private_key):
    command = [
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "ConnectTimeout=10",
        "-i",
        str(private_key),
        "-p",
        str(SSH_PORT),
        f"hacker@{LISTEN_ADDRESS}",
        "printf '%s:%s' \"$(id -un)\" \"$PWD\"",
    ]
    for _ in range(15):
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip() == "hacker:/challenge":
            return
        time.sleep(2)
    raise AssertionError("key-authenticated SSH command did not succeed")


def verify_browser_workspace(session, workspace):
    if os.getenv("DOJO_SKIP_BROWSER_SMOKE", "false").lower() == "true":
        return False
    browser_binary = os.getenv("DOJO_BROWSER_BINARY") or next(
        (
            path
            for path in (
                shutil.which("chromium"),
                shutil.which("chromium-browser"),
                shutil.which("google-chrome"),
            )
            if path
        ),
        None,
    )
    driver_binary = os.getenv("DOJO_CHROMEDRIVER_BINARY") or shutil.which(
        "chromedriver"
    )
    if not browser_binary or not driver_binary:
        return False

    from selenium.webdriver import Chrome, ChromeOptions
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait

    options = ChromeOptions()
    options.binary_location = browser_binary
    for argument in (
        "--headless=new",
        "--ignore-certificate-errors",
        "--no-proxy-server",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1600,1000",
    ):
        options.add_argument(argument)
    options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
    browser = Chrome(options=options, service=Service(driver_binary))
    origin = f"https://{DOJO_HOST}"
    if HTTPS_PORT != 443:
        origin += f":{HTTPS_PORT}"
    wait = WebDriverWait(browser, 45)

    try:
        browser.get(f"{origin}/")
        for cookie in session.cookies:
            browser.add_cookie(
                {
                    "name": cookie.name,
                    "value": cookie.value,
                    "path": cookie.path or "/",
                    "secure": True,
                }
            )
        browser.get(f"{origin}/workspace?service=terminal")
        wait.until(lambda driver: driver.find_elements(By.CSS_SELECTOR, ".workspace-shell"))

        tutor = browser.find_element(By.CSS_SELECTOR, "[data-learning-tutor]")
        if tutor.find_elements(By.CSS_SELECTOR, "[data-tutor-level]"):
            raise AssertionError("Tutor still exposes guidance levels")
        tutor.find_element(By.CSS_SELECTOR, ".learning-tutor-toggle").click()
        wait.until(lambda driver: "is-collapsed" not in tutor.get_attribute("class"))

        browser.execute_script(
            """
            window.__workspaceSmokeFetch = window.fetch.bind(window);
            window.fetch = function(input, init) {
                if (String(input).includes('/pwncollege_api/v1/workspace')) {
                    return new Promise(resolve => setTimeout(
                        () => resolve(window.__workspaceSmokeFetch(input, init)), 900
                    ));
                }
                return window.__workspaceSmokeFetch(input, init);
            };
            """
        )
        loading = browser.find_element(By.CSS_SELECTOR, "[data-workspace-loading]")
        iframe = browser.find_element(By.ID, "workspace-iframe")

        code = browser.find_element(
            By.CSS_SELECTOR,
            '.workspace-service[data-service="code: 8080"]',
        )
        code.click()
        wait.until(lambda driver: loading.is_displayed())
        if "Loading VS Code" not in loading.text:
            raise AssertionError("VS Code loading state was not visible")
        wait.until(lambda driver: "/8080/" in (iframe.get_attribute("src") or ""))
        code_url = iframe.get_attribute("src")
        if "folder=%2Fchallenge" not in code_url and "folder=/challenge" not in code_url:
            raise AssertionError("VS Code browser URL did not open /challenge")
        wait.until(lambda driver: not loading.is_displayed())
        browser.switch_to.frame(iframe)
        code_surface = WebDriverWait(browser, 60).until(
            lambda driver: (
                driver.find_elements(By.CSS_SELECTOR, ".monaco-workbench")
                or driver.find_elements(By.CSS_SELECTOR, "div.getting-started-step")
                or driver.find_elements(By.CSS_SELECTOR, "button.getting-started-step")
            )[-1]
        )
        trust_prompts = [
            element
            for element in browser.find_elements(By.CSS_SELECTOR, "[role='dialog'], .monaco-dialog-box")
            if element.is_displayed() and "trust the authors" in element.text.lower()
        ]
        if trust_prompts:
            raise AssertionError("VS Code displayed a workspace trust prompt for /challenge")
        code_surface.click()

        def open_code_terminal():
            browser.execute_script("if (document.activeElement) document.activeElement.blur();")
            ActionChains(browser).key_down(Keys.CONTROL).key_down(Keys.SHIFT).send_keys("`").key_up(Keys.SHIFT).key_up(Keys.CONTROL).perform()

        open_code_terminal()
        code_terminal = None
        for _ in range(5):
            try:
                code_terminal = WebDriverWait(browser, 12).until(
                    lambda driver: (driver.find_elements(By.CSS_SELECTOR, "textarea.xterm-helper-textarea") or [None])[-1]
                )
                break
            except TimeoutException:
                if not browser.execute_script(
                    "return document.activeElement !== null && document.activeElement.tagName === 'IFRAME';"
                ):
                    break
                open_code_terminal()
        if code_terminal is None:
            try:
                browser.execute_script(
                    "document.querySelector('.monaco-workbench').click(); if (document.activeElement) document.activeElement.blur();"
                )
                ActionChains(browser).key_down(Keys.CONTROL).key_down(Keys.SHIFT).send_keys("p").key_up(Keys.SHIFT).key_up(Keys.CONTROL).perform()
                command_input = WebDriverWait(browser, 15).until(
                    lambda driver: driver.find_element(By.CSS_SELECTOR, ".quick-input-box input")
                )
                command_input.send_keys("Terminal: Create New Terminal")
                time.sleep(1)
                command_input.send_keys(Keys.ENTER)
                code_terminal = WebDriverWait(browser, 45).until(
                    lambda driver: (driver.find_elements(By.CSS_SELECTOR, "textarea.xterm-helper-textarea") or [None])[-1]
                )
            except TimeoutException as error:
                browser.save_screenshot("/tmp/aisecedu-code-terminal-failure.png")
                active_html = browser.execute_script(
                    "return document.activeElement ? document.activeElement.outerHTML : '';"
                )
                menu_labels = [
                    element.text
                    for element in browser.find_elements(
                        By.CSS_SELECTOR,
                        ".menubar-menu-button, [role='menuitem'], .action-label",
                    )
                    if element.is_displayed() and element.text
                ]
                print(
                    f"VS Code diagnostics: title={browser.title!r} active={active_html[:500]!r} "
                    f"menus={menu_labels[:30]!r}",
                    flush=True,
                )
                raise AssertionError("VS Code integrated terminal did not open") from error
        browser.execute_script("arguments[0].focus();", code_terminal)
        code_terminal.send_keys("vim -Nu NONE -n /tmp/code-escape-check", Keys.ENTER)
        time.sleep(1.5)
        code_terminal.send_keys("iCODE_ESCAPE_OK", Keys.ESCAPE, ":wq", Keys.ENTER)
        for _ in range(20):
            code_escape = inner(
                "exec", "--user=1000", workspace, "sh", "-c",
                "cat /tmp/code-escape-check 2>/dev/null || true",
                check=False,
            ).stdout.strip()
            if code_escape == "CODE_ESCAPE_OK":
                break
            time.sleep(0.25)
        if code_escape != "CODE_ESCAPE_OK":
            raise AssertionError("Escape did not leave Vim insert mode in VS Code")
        browser.switch_to.default_content()

        desktop = browser.find_element(
            By.CSS_SELECTOR,
            '.workspace-service[data-service="desktop: 6080"]',
        )
        desktop.click()
        wait.until(lambda driver: loading.is_displayed())
        if "Loading Desktop" not in loading.text:
            raise AssertionError("Desktop loading state was not visible")
        wait.until(lambda driver: "/6080/" in (iframe.get_attribute("src") or ""))
        wait.until(lambda driver: not loading.is_displayed())
        browser.switch_to.frame(iframe)
        wait.until(
            lambda driver: driver.find_elements(
                By.CSS_SELECTOR,
                'script[src*="aisecedu-workspace-bridge.js"]',
            )
        )
        try:
            wait.until(
                lambda driver: driver.execute_script(
                    "return document.documentElement.dataset.aiseceduWorkspaceBridge;"
                )
                == "ready"
            )
        except TimeoutException as error:
            console = [entry["message"] for entry in browser.get_log("browser")]
            raise AssertionError(
                f"Remote desktop keyboard bridge did not initialize: {console[-10:]}"
            ) from error
        container = wait.until(
            lambda driver: driver.find_element(By.ID, "noVNC_container")
        )
        ActionChains(browser).move_to_element(container).click().perform()
        browser.execute_script("window.AISecEduWorkspaceBridge.focusRemoteKeyboard();")
        wait.until(
            lambda driver: driver.execute_script(
                "return document.activeElement && "
                "(document.activeElement.id === 'noVNC_keyboardinput' || "
                "document.activeElement.tagName === 'CANVAS');"
            )
        )
        remote_input = browser.find_element(By.ID, "noVNC_keyboardinput")
        inner(
            "exec", "--user=1000", workspace, "/run/current-system/sw/bin/bash", "-lc",
            "DISPLAY=:0 xfce4-terminal >/tmp/aisecedu-desktop-terminal.log 2>&1 &",
        )
        time.sleep(2)
        ActionChains(browser).move_to_element(container).click().perform()
        browser.execute_script(
            """
            window.AISecEduWorkspaceBridge.focusRemoteKeyboard();
            window.__aiseceduDesktopKeysStolen = [];
            window.addEventListener('keydown', function(event) {
                if (event.key === 'Escape' || event.key.toLowerCase() === 'f') {
                    window.__aiseceduDesktopKeysStolen.push(event.key);
                }
            }, true);
            """
        )
        remote_input.send_keys("vim -Nu NONE -n /tmp/desktop-escape-check", Keys.ENTER)
        time.sleep(1.5)
        remote_input.send_keys("iDESKTOP_ESCAPE_OK", Keys.ESCAPE, ":wq", Keys.ENTER)
        for _ in range(20):
            desktop_escape = inner(
                "exec", "--user=1000", workspace, "sh", "-c",
                "cat /tmp/desktop-escape-check 2>/dev/null || true",
                check=False,
            ).stdout.strip()
            if desktop_escape == "DESKTOP_ESCAPE_OK":
                break
            time.sleep(0.25)
        if desktop_escape != "DESKTOP_ESCAPE_OK":
            raise AssertionError("Escape did not leave Vim insert mode on the remote desktop")
        if browser.execute_script("return window.__aiseceduDesktopKeysStolen.length"):
            raise AssertionError("Remote desktop keys propagated to a browser-level shortcut handler")
        browser.switch_to.default_content()

        clipboard_in = "AISecEdu browser-to-desktop clipboard"
        if not browser.execute_script(
            "return sendDesktopClipboard($('.workspace-controls'), arguments[0]);",
            clipboard_in,
        ):
            raise AssertionError("Desktop clipboard bridge rejected local text")
        for _ in range(20):
            copied = inner(
                "exec", "--user=1000", workspace, "/run/current-system/sw/bin/bash", "-lc",
                "DISPLAY=:0 xclip -selection clipboard -o 2>/dev/null || true",
                check=False,
            ).stdout
            if copied == clipboard_in:
                break
            time.sleep(0.25)
        if copied != clipboard_in:
            raise AssertionError("Browser clipboard text did not reach the remote desktop")

        clipboard_out = "AISecEdu desktop-to-browser clipboard"
        inner(
            "exec", "--user=1000", workspace, "/run/current-system/sw/bin/bash", "-lc",
            f"printf %s {shlex.quote(clipboard_out)} | DISPLAY=:0 xclip -selection clipboard",
        )
        wait.until(
            lambda driver: driver.execute_script(
                "return document.getElementById('workspace-iframe').workspaceRemoteClipboard;"
            ) == clipboard_out
        )

        terminal = browser.find_element(
            By.CSS_SELECTOR,
            '.workspace-service[data-service="terminal: 7681"]',
        )
        terminal.click()
        wait.until(lambda driver: loading.is_displayed())
        wait.until(lambda driver: "/7681/" in (iframe.get_attribute("src") or ""))
        wait.until(lambda driver: not loading.is_displayed())
        browser.switch_to.frame(iframe)
        terminal_input = wait.until(
            lambda driver: driver.find_element(By.CSS_SELECTOR, ".xterm-helper-textarea")
        )
        if not browser.find_elements(By.ID, "aisecedu-terminal-keyboard-guard"):
            raise AssertionError("Terminal Escape-key guard was not injected")
        browser.execute_script(
            """
            window.__aiseceduEscapeStolen = false;
            window.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    window.__aiseceduEscapeStolen = true;
                    document.activeElement.blur();
                }
            }, true);
            """
        )
        terminal_input.send_keys("vim -Nu NONE -n /tmp/terminal-escape-check", Keys.ENTER)
        time.sleep(1.5)
        terminal_input.send_keys("iTERMINAL_ESCAPE_OK", Keys.ESCAPE, ":wq", Keys.ENTER)
        for _ in range(20):
            terminal_escape = inner(
                "exec", "--user=1000", workspace, "sh", "-c",
                "cat /tmp/terminal-escape-check 2>/dev/null || true",
                check=False,
            ).stdout.strip()
            if terminal_escape == "TERMINAL_ESCAPE_OK":
                break
            time.sleep(0.25)
        if terminal_escape != "TERMINAL_ESCAPE_OK":
            raise AssertionError("Escape did not leave Vim insert mode in Terminal")
        if browser.execute_script("return window.__aiseceduEscapeStolen"):
            raise AssertionError("Terminal Escape propagated to a browser-level handler")
        if browser.execute_script("return document.activeElement") != terminal_input:
            raise AssertionError("Terminal lost keyboard focus after Escape")
        browser.get_log("performance")
        terminal_input.send_keys("echo workspace-browser-ready", Keys.ENTER)

        terminal_frames = bytearray()

        def terminal_output(driver):
            for entry in driver.get_log("performance"):
                try:
                    message = json.loads(entry["message"])["message"]
                    if message["method"] != "Network.webSocketFrameReceived":
                        continue
                    response = message["params"]["response"]
                    payload = response.get("payloadData", "")
                    if response.get("opcode") == 2:
                        terminal_frames.extend(base64.b64decode(payload))
                    else:
                        terminal_frames.extend(payload.encode())
                except (KeyError, TypeError, ValueError):
                    continue
            return terminal_frames.decode(errors="replace")

        wait.until(lambda driver: "workspace-browser-ready" in terminal_output(driver))
        time.sleep(1)
        output = terminal_output(browser)
        if "dojo evidence" in output or re.search(
            r"\[\d+\]\s+\d+",
            output,
        ):
            raise AssertionError("Terminal displayed evidence recording job output")
    finally:
        browser.quit()
    return True


def cleanup_home(user_id, username):
    if not isinstance(user_id, int) or user_id < 1:
        raise ValueError("invalid smoke user id")
    if not re.fullmatch(r"deployment-smoke-[0-9a-f]{8}", username):
        raise ValueError("invalid smoke username")
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-c",
        f"select name from users where id={user_id};",
    )
    if result.stdout.strip() != username:
        raise RuntimeError("smoke user id no longer matches the generated account")
    inner("volume", "rm", str(user_id), check=False)
    script = r"""
case "$1" in
    ''|*[!0-9]*) exit 2 ;;
esac
root="/run/homefs/$1"
[ -e "$root" ] || exit 0
btrfs subvolume list -o "$root" | awk '{print $9}' | sort -r | while IFS= read -r subvolume; do
    btrfs subvolume delete "/run/homefs/$subvolume"
done
rm -rf "$root"
"""
    result = inner(
        "exec", "homefs", "sh", "-c", script, "cleanup-home", str(user_id), check=False
    )
    if result.returncode != 0:
        raise RuntimeError(f"home cleanup failed: {result.stderr.strip()}")


def cleanup_dojo_path(dojo_reference, expected_id):
    if not re.fullmatch(r"deployment-smoke-[0-9a-f]{8}", expected_id):
        raise ValueError("invalid smoke dojo id")
    match = re.fullmatch(r"deployment-smoke-[0-9a-f]{8}~([0-9a-f]{8})", dojo_reference)
    if not match or dojo_reference.rsplit("~", 1)[0] != expected_id:
        raise ValueError("invalid smoke dojo reference")
    outer("rm", "-rf", f"/data/dojos/{match.group(1)}")


def main():
    solution_counts_before = solution_counts()
    admin_name, admin_password = credentials()
    admin = authenticate(admin_name, admin_password)
    require(admin.get(f"{BASE_URL}/admin", timeout=20))
    passed("administrator login and admin page")

    suffix = secrets.token_hex(4)
    username = f"deployment-smoke-{suffix}"
    password = secrets.token_urlsafe(18)
    dojo_id = f"deployment-smoke-{suffix}"
    user = None
    user_id = None
    dojo = None
    public_key = None
    workspace = None

    try:
        user = authenticate(username, password, register=True)
        me = require(user.get(f"{BASE_URL}/api/v1/users/me", timeout=20)).json()
        user_id = me["data"]["id"]
        workspace = f"user_{user_id}"
        require(user.get(f"{BASE_URL}/settings", timeout=20))
        passed("user registration, login, and settings page")

        with tempfile.TemporaryDirectory() as temp_dir:
            private_key = pathlib.Path(temp_dir) / "id_ed25519"
            subprocess.run(
                ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(private_key)],
                check=True,
            )
            public_key = private_key.with_suffix(".pub").read_text().strip()
            response = require(
                user.post(
                    f"{BASE_URL}/pwncollege_api/v1/ssh_key",
                    json={"ssh_key": public_key},
                    timeout=20,
                )
            )
            if not response.json().get("success"):
                raise AssertionError("SSH key was not accepted")
            passed("SSH key registration")

            spec = {
                "id": dojo_id,
                "name": "Deployment Smoke Test",
                "type": "public",
                "image": "pwncollege-smoke:latest",
                "privileged": True,
                "interfaces": [
                    {"name": "SSH"},
                    {"name": "Terminal", "port": 7681},
                    {"name": "Code", "port": 8080},
                    {"name": "Desktop", "port": 6080},
                ],
                "modules": [
                    {
                        "id": "smoke",
                        "name": "Smoke",
                        "challenges": [{"id": "service", "name": "Service Startup"}],
                    }
                ],
                "files": [
                    {
                        "type": "text",
                        "path": "smoke/service/run",
                        "content": "#!/opt/pwn.college/bash\nprintf 'deployment smoke\\n'\n",
                    }
                ],
            }
            response = require(
                admin.post(
                    f"{BASE_URL}/pwncollege_api/v1/dojos/create",
                    json={"spec": yaml.safe_dump(spec, sort_keys=False)},
                    timeout=120,
                )
            )
            dojo = response.json()["dojo"]
            require(user.get(f"{BASE_URL}/dojo/{dojo}/join/", timeout=30))
            require(user.get(f"{BASE_URL}/dojo/{dojo}", timeout=30))
            passed("local smoke dojo creation, listing, and enrollment")

            start_workspace(user, dojo)
            wait_for_workspace(workspace)
            runtime = inner(
                "inspect", "-f", "{{.HostConfig.Runtime}}", workspace
            ).stdout.strip()
            if "kata" not in runtime:
                raise AssertionError(f"workspace runtime is {runtime}, not Kata")
            label = inner(
                "inspect",
                "-f",
                '{{index .Config.Labels "dojo.challenge_id"}}',
                workspace,
            ).stdout.strip()
            if label != "service":
                raise AssertionError(f"unexpected workspace challenge label: {label}")
            mount = inner(
                "exec", "--user=1000", workspace, "findmnt", "-n", "/home/hacker"
            ).stdout
            if "nosuid" not in mount:
                raise AssertionError("workspace home mount is not nosuid")
            passed("Kata workspace startup, labels, and nosuid home mount")

            cwd = inner(
                "exec", "--user=1000", workspace, "pwd"
            ).stdout.strip()
            if cwd != "/challenge":
                raise AssertionError(f"workspace started in {cwd}, not /challenge")
            tool_probe = inner(
                "exec",
                "--user=1000",
                workspace,
                "/run/dojo/bin/bash",
                "-lc",
                "set -e; for tool in gcc clang make nasm vim nvim gdb gef strace ltrace "
                "python3 pwn file strings objdump readelf burpsuite ghidra cutter nmap "
                "wireshark tshark tcpdump radare2 r2 tmux curl wget; "
                "do command -v \"$tool\"; done; "
                "command -v ida || command -v ida64 || command -v idat64",
            )
            if len(tool_probe.stdout.splitlines()) < 29:
                raise AssertionError("full workspace tool probe returned incomplete output")
            ida_icon = inner(
                "exec",
                "--user=1000",
                workspace,
                "/run/dojo/bin/bash",
                "-lc",
                "set -e; test -s /run/dojo/share/icons/hicolor/64x64/apps/ida-free.png; "
                "grep -qx 'Icon=ida-free' /run/dojo/share/applications/ida-free.desktop; "
                "file -L /run/dojo/share/icons/hicolor/64x64/apps/ida-free.png",
            ).stdout
            if "128 x 128" not in ida_icon:
                raise AssertionError("IDA desktop icon is not the expected high-visibility size")
            passed("clean /challenge start, full security toolchain, and clear IDA launcher")

            active = require(user.get(f"{BASE_URL}/active-module", timeout=20)).json()
            if active["c_current"]["challenge_reference_id"] != "service":
                raise AssertionError("active-module did not report the smoke workspace")
            passed("active workspace API")

            for service in ("terminal", "code", "desktop"):
                signed_service(user, service, workspace)
                passed(f"signed {service} service proxy")

            verify_ssh(private_key)
            passed("key-authenticated SSH routing, /challenge start, and command execution")

            if verify_browser_workspace(user, workspace):
                passed("browser loading, clean Code root, Vim Escape in all modes, Desktop clipboard, quiet Terminal, and unified Tutor")

            inner(
                "exec",
                "--user=1000",
                workspace,
                "touch",
                "/home/hacker/.deployment-smoke",
            )
            response = require(
                user.delete(f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60)
            )
            if not response.json().get("success"):
                raise AssertionError("workspace stop failed")
            wait_for_workspace(workspace, present=False)
            start_workspace(user, dojo)
            wait_for_workspace(workspace)
            inner(
                "exec",
                "--user=1000",
                workspace,
                "test",
                "-f",
                "/home/hacker/.deployment-smoke",
            )
            passed("workspace stop/start and home persistence")

        if solution_counts() != solution_counts_before:
            raise AssertionError("smoke test changed solve or submission counts")
        passed("no solves or submissions recorded")

        print("All non-solving user-flow checks passed", flush=True)
    finally:
        if user is not None:
            user.delete(f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60)
            if public_key:
                key_parts = public_key.split()
                user.delete(
                    f"{BASE_URL}/pwncollege_api/v1/ssh_key",
                    json={"ssh_key": " ".join(key_parts[:2])},
                    timeout=20,
                )
        if workspace:
            inner("rm", "-f", workspace, check=False)
        if dojo:
            response = admin.post(
                f"{BASE_URL}/dojo/{dojo}/delete/",
                json={"dojo": dojo},
                timeout=60,
            )
            require(response)
            if not response.json().get("success"):
                raise RuntimeError("smoke dojo deletion failed")
            cleanup_dojo_path(dojo, dojo_id)
        if user_id:
            cleanup_home(user_id, username)
        if user_id:
            response = require(
                admin.delete(f"{BASE_URL}/api/v1/users/{user_id}", json={}, timeout=30)
            )
            if not response.json().get("success"):
                raise RuntimeError("smoke user deletion failed")


if __name__ == "__main__":
    main()

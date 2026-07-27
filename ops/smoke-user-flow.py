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
WORKSPACE_HTTPS_PORT = int(os.getenv("WORKSPACE_HTTPS_PORT", "4443"))
SSH_PORT = int(os.getenv("DOJO_SSH_PORT", "2223"))
DOJO_HOST = os.getenv("DOJO_HOST", "localhost.pwn.college")
WORKSPACE_HOST = os.getenv("WORKSPACE_HOST", "workspace.localhost.pwn.college")
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
    if parsed.hostname != WORKSPACE_HOST or parsed.port != WORKSPACE_HTTPS_PORT:
        raise AssertionError(
            f"{service} returned unexpected Workspace endpoint: {parsed.netloc}"
        )
    if service == "code" and urllib.parse.parse_qs(parsed.query).get("folder") != [
        "/challenge"
    ]:
        raise AssertionError("Code service did not open the challenge directory")
    target = urllib.parse.urlunsplit(
        (
            "https",
            f"{LISTEN_ADDRESS}:{WORKSPACE_HTTPS_PORT}",
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
                    f"{LISTEN_ADDRESS}:{WORKSPACE_HTTPS_PORT}",
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


def verify_browser_workspace(session, workspace, dojo):
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

    try:
        from selenium.webdriver import Chrome, ChromeOptions
        from selenium.common.exceptions import TimeoutException
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys
        from selenium.webdriver.support.ui import WebDriverWait
    except ModuleNotFoundError:
        return False

    current_attempt_response = require(
        session.get(
            f"{BASE_URL}/pwncollege_api/v1/learning/attempts/current",
            timeout=20,
        )
    ).json()
    current_attempt = current_attempt_response.get("attempt") or {}
    attempt_id = current_attempt.get("id")
    challenge_database_id = current_attempt.get("challengeDatabaseId")
    if not attempt_id or not challenge_database_id:
        raise AssertionError("browser smoke could not resolve the active learning attempt")

    options = ChromeOptions()
    snap_binary = pathlib.Path(
        "/snap/chromium/current/usr/lib/chromium-browser/chrome"
    )
    options.binary_location = (
        str(snap_binary)
        if str(browser_binary).startswith("/snap/") and snap_binary.is_file()
        else browser_binary
    )
    browser_profile = None
    snap_common = pathlib.Path.home() / "snap/chromium/common"
    if str(browser_binary).startswith("/snap/") and snap_common.is_dir():
        browser_profile = tempfile.mkdtemp(
            prefix="aisecedu-browser-",
            dir=snap_common,
        )
        options.add_argument(f"--user-data-dir={browser_profile}")
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
    try:
        browser = Chrome(options=options, service=Service(driver_binary))
    except Exception:
        if browser_profile:
            shutil.rmtree(browser_profile, ignore_errors=True)
        raise
    origin = f"https://{DOJO_HOST}"
    if HTTPS_PORT != 443:
        origin += f":{HTTPS_PORT}"
    wait = WebDriverWait(browser, 45)

    try:
        for path, required, forbidden in (
            (
                "/login",
                ("登录", "用户名或电子邮箱", "密码", "忘记密码？"),
                ("Login", "User Name or Email", "Forgot your password?"),
            ),
            (
                "/register",
                ("注册", "创建账号", "用户名", "电子邮箱", "密码"),
                ("Register", "Your username on the site", "Never shown to the public"),
            ),
            (
                "/reset_password",
                ("重置密码", "电子邮箱", "当前平台未配置邮件发送。"),
                ("Reset Password", "This CTF is not configured to send email."),
            ),
        ):
            browser.get(f"{origin}{path}")
            page_text = wait.until(
                lambda driver: driver.find_element(By.TAG_NAME, "body").text
            )
            if any(text not in page_text for text in required) or any(
                text in page_text for text in forbidden
            ):
                raise AssertionError(f"authentication page is not fully localized: {path}")
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

        web_address = browser.execute_script(
            """
            const iframe = document.getElementById('workspace-iframe');
            updateWorkspaceWebAddress(
                iframe,
                'web: 8081',
                'https://workspace.example.invalid/w/0123456789ab/auth/signature/8081/index.html',
                'https://workspace.example.invalid/w/0123456789ab/8081/index.html',
            );
            const link = document.querySelector('[data-workspace-web-link]');
            const address = document.querySelector('[data-workspace-web-address]');
            const result = {
                hidden: address.hidden,
                text: link.textContent,
                label: address.querySelector('.workspace-web-address-label').textContent,
                href: link.href,
            };
            updateWorkspaceWebAddress(iframe, 'terminal: 7681', null);
            return result;
            """
        )
        if (
            web_address["hidden"]
            or web_address["text"] != "https://workspace.example.invalid/w/0123456789ab/8081/index.html"
            or web_address["label"] != "Web 服务 · 8081"
            or web_address["href"]
            != "https://workspace.example.invalid/w/0123456789ab/8081/index.html"
        ):
            raise AssertionError("Web service did not expose the complete short link")

        navigation = browser.find_element(By.CSS_SELECTOR, "[data-workspace-navigation]")
        navigation_toggle = navigation.find_element(
            By.CSS_SELECTOR, ".workspace-navigation-toggle"
        )
        if "is-collapsed" in navigation.get_attribute("class"):
            navigation_toggle.click()
            wait.until(
                lambda driver: "is-collapsed"
                not in navigation.get_attribute("class")
            )
        navigation_expanded_toggle = browser.execute_script(
            """
            const rect = document.querySelector('.workspace-navigation-toggle').getBoundingClientRect();
            return {left: rect.left, top: rect.top};
            """
        )
        navigation_toggle.click()
        wait.until(
            lambda driver: "is-collapsed" in navigation.get_attribute("class")
        )
        navigation_collapsed_toggle = browser.execute_script(
            """
            const rect = document.querySelector('.workspace-navigation-toggle').getBoundingClientRect();
            return {left: rect.left, top: rect.top};
            """
        )
        navigation_toggle.click()
        wait.until(
            lambda driver: "is-collapsed" not in navigation.get_attribute("class")
        )
        navigation_layout = browser.execute_script(
            """
            const panel = document.querySelector('[data-workspace-navigation]');
            const firstField = panel.querySelector('.workspace-navigation-field');
            const rail = panel.querySelector('.workspace-navigation-rail');
            const toggle = panel.querySelector('.workspace-navigation-toggle');
            const panelRect = panel.getBoundingClientRect();
            const fieldRect = firstField.getBoundingClientRect();
            return {
                fieldOffset: fieldRect.left - panelRect.left,
                railPosition: getComputedStyle(rail).position,
                icon: toggle.querySelector('i').className,
            };
            """
        )
        if (
            abs(
                navigation_expanded_toggle["left"]
                - navigation_collapsed_toggle["left"]
            )
            > 1
            or abs(
                navigation_expanded_toggle["top"]
                - navigation_collapsed_toggle["top"]
            )
            > 1
            or navigation_layout["fieldOffset"] > 16
            or navigation_layout["railPosition"] != "absolute"
            or "fa-chevron-left" not in navigation_layout["icon"]
        ):
            raise AssertionError(
                "Course navigation toggle or content shifts between states: "
                f"{navigation_expanded_toggle}, {navigation_collapsed_toggle}, "
                f"{navigation_layout}"
            )

        tutor = browser.find_element(By.CSS_SELECTOR, "[data-learning-tutor]")
        if tutor.find_elements(By.CSS_SELECTOR, "[data-tutor-level]"):
            raise AssertionError("Tutor still exposes guidance levels")
        tutor_toggle = tutor.find_element(By.CSS_SELECTOR, ".learning-tutor-toggle")
        tutor_collapsed_toggle = browser.execute_script(
            """
            const rect = document.querySelector('.learning-tutor-toggle').getBoundingClientRect();
            return {left: rect.left, top: rect.top};
            """
        )
        tutor_toggle.click()
        wait.until(lambda driver: "is-collapsed" not in tutor.get_attribute("class"))
        tutor_expanded_toggle = browser.execute_script(
            """
            const rect = document.querySelector('.learning-tutor-toggle').getBoundingClientRect();
            return {left: rect.left, top: rect.top};
            """
        )
        tutor_status = tutor.find_element(By.CSS_SELECTOR, "[data-tutor-status]")
        wait.until(
            lambda driver: tutor_status.is_displayed()
            and "Tutor 已就绪" in tutor_status.text
        )
        tutor_layout = browser.execute_script(
            """
            const panel = document.querySelector('[data-learning-tutor]');
            const content = panel.querySelector('.learning-tutor-content');
            const toggle = panel.querySelector('.learning-tutor-toggle');
            const panelRect = panel.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();
            return {
                contentOffset: contentRect.left - panelRect.left,
                togglePosition: getComputedStyle(toggle).position,
                oldNotices: panel.querySelectorAll('[data-tutor-notice], [data-tutor-context-badges]').length,
                headerLinks: panel.querySelectorAll('.learning-tutor-header a').length,
                analysisText: panel.querySelector('.learning-tutor-analysis-link').textContent.trim(),
            };
            """
        )
        if (
            abs(tutor_collapsed_toggle["left"] - tutor_expanded_toggle["left"]) > 1
            or abs(tutor_collapsed_toggle["top"] - tutor_expanded_toggle["top"]) > 1
            or tutor_layout["contentOffset"] > 24
            or tutor_layout["togglePosition"] != "absolute"
            or tutor_layout["oldNotices"]
            or tutor_layout["headerLinks"]
            or tutor_layout["analysisText"] != "查看学习分析"
        ):
            raise AssertionError(
                "Tutor toggle shifts or layout still wastes space: "
                f"{tutor_collapsed_toggle}, {tutor_expanded_toggle}, {tutor_layout}"
            )
        if browser.find_elements(By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible"):
            raise AssertionError("Tutor readiness status interrupted the learner with a dialog")

        banner_state = browser.execute_script(
            """
            const controls = document.querySelector('.workspace-controls');
            const target = controls.querySelector('#flag-input');
            animateBanner(
                {target},
                '非阻塞提示回归检查',
                'success',
                {label: '查看评分', href: '/learning/scores/latest/123'},
            );
            const banner = controls.querySelector('#workspace-notification-banner');
            const action = banner.querySelector('.workspace-banner-action');
            return {
                text: banner.textContent,
                animated: banner.classList.contains('animate-banner'),
                pointerEvents: getComputedStyle(banner).pointerEvents,
                actionText: action && action.textContent,
                actionHref: action && action.getAttribute('href'),
                actionPointerEvents: action && getComputedStyle(action).pointerEvents,
                dialogs: document.querySelectorAll('.aisecedu-dialog-layer.is-visible').length,
            };
            """
        )
        if (
            banner_state["text"] != "非阻塞提示回归检查查看评分"
            or not banner_state["animated"]
            or banner_state["pointerEvents"] != "none"
            or banner_state["actionText"] != "查看评分"
            or banner_state["actionHref"] != "/learning/scores/latest/123"
            or banner_state["actionPointerEvents"] != "auto"
            or banner_state["dialogs"]
        ):
            raise AssertionError("workspace messages did not use the original inline banner")

        flag_recovery = browser.execute_async_script(
            """
            const done = arguments[arguments.length - 1];
            const controls = document.querySelector('.workspace-controls');
            const input = controls.querySelector('#flag-input');
            const banner = controls.querySelector('#workspace-notification-banner');
            const original = CTFd.api.post_challenge_attempt;
            CTFd.api.post_challenge_attempt = () => Promise.reject(new Error('模拟网络失败'));
            input.value = 'pwn.college{smoke-ui-failure}';
            actionSubmitFlag({target: input});
            setTimeout(() => {
                const failed = {
                    disabled: input.disabled,
                    spinning: controls.querySelector('.input-icon').classList.contains('fa-spin'),
                    message: banner.textContent,
                };
                CTFd.api.post_challenge_attempt = () => Promise.resolve({
                    data: {status: 'incorrect', message: 'Flag 不正确。'},
                });
                input.value = 'pwn.college{smoke-ui-incorrect}';
                actionSubmitFlag({target: input});
                setTimeout(() => {
                    const incorrect = {
                        disabled: input.disabled,
                        spinning: controls.querySelector('.input-icon').classList.contains('fa-spin'),
                        message: banner.textContent,
                    };
                    CTFd.api.post_challenge_attempt = () => Promise.resolve({
                        data: {status: 'correct', message: '完成。'},
                    });
                    input.value = 'pwn.college{smoke-ui-correct}';
                    actionSubmitFlag({target: input});
                    setTimeout(() => {
                        const action = banner.querySelector('.workspace-banner-action');
                        const correct = {
                            disabled: input.disabled,
                            spinning: controls.querySelector('.input-icon').classList.contains('fa-spin'),
                            message: banner.textContent,
                            actionText: action && action.textContent,
                            actionHref: action && action.getAttribute('href'),
                            challengeId: controls.querySelector('#current-challenge-id').value,
                        };
                        CTFd.api.post_challenge_attempt = original;
                        done({failed, incorrect, correct});
                    }, 80);
                }, 80);
            }, 80);
            """
        )
        if (
            flag_recovery["failed"]["disabled"]
            or flag_recovery["failed"]["spinning"]
            or "模拟网络失败" not in flag_recovery["failed"]["message"]
            or flag_recovery["incorrect"]["disabled"]
            or flag_recovery["incorrect"]["spinning"]
            or flag_recovery["incorrect"]["message"] != "Flag 不正确。"
            or flag_recovery["correct"]["disabled"]
            or flag_recovery["correct"]["spinning"]
            or "查看评分" not in flag_recovery["correct"]["message"]
            or flag_recovery["correct"]["actionText"] != "查看评分"
            or flag_recovery["correct"]["actionHref"]
            != f"/learning/scores/latest/{flag_recovery['correct']['challengeId']}"
        ):
            raise AssertionError(f"Flag submission did not recover from all outcomes: {flag_recovery}")

        lifecycle_buttons = browser.execute_script(
            """
            const controls = document.querySelector('.workspace-controls');
            const challenge = controls.querySelector('#current-challenge-id');
            return {
                restart: controls.querySelector('#challenge-restart').textContent.trim(),
                stop: controls.querySelector('#challenge-stop').textContent.trim(),
                reset: controls.querySelector('#challenge-reset').textContent.trim(),
                dojo: challenge.dataset.dojoId,
                module: challenge.dataset.moduleId,
                challenge: challenge.dataset.challengeReferenceId,
            };
            """
        )
        if (
            lifecycle_buttons["restart"] != "重启"
            or lifecycle_buttons["stop"] != "停止"
            or lifecycle_buttons["reset"] != "重置"
            or not all(
                lifecycle_buttons[key]
                for key in ("dojo", "module", "challenge")
            )
        ):
            raise AssertionError(f"workspace lifecycle controls are ambiguous: {lifecycle_buttons}")

        browser.execute_script(
            """
            window.__workspaceLifecycleFetch = CTFd.fetch.bind(CTFd);
            CTFd.fetch = function(input, init) {
                if (String(input) === '/pwncollege_api/v1/docker' && init && init.method === 'DELETE') {
                    return Promise.resolve({status: 200, json: () => Promise.resolve({success: true})});
                }
                if (String(input) === '/pwncollege_api/v1/docker' && init && init.method === 'POST') {
                    return Promise.resolve({status: 200, json: () => Promise.resolve({success: true})});
                }
                return window.__workspaceLifecycleFetch(input, init);
            };
            document.querySelector('.workspace-controls #challenge-stop').click();
            """
        )
        lifecycle_dialog = wait.until(
            lambda driver: driver.find_element(
                By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible"
            )
        )
        if (
            "停止题目容器"
            not in lifecycle_dialog.find_element(
                By.CSS_SELECTOR, ".aisecedu-dialog-header"
            ).text
        ):
            raise AssertionError("workspace stop did not use the unified confirmation dialog")
        lifecycle_dialog.find_element(
            By.CSS_SELECTOR, "[data-dialog-action='confirm']"
        ).click()
        wait.until(
            lambda driver: not driver.find_elements(
                By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible"
            )
        )
        controls = browser.find_element(By.CSS_SELECTOR, ".workspace-controls")
        wait.until(
            lambda driver: controls.get_attribute("data-workspace-running") == "false"
            and controls.find_element(By.ID, "challenge-restart").is_enabled()
        )
        stopped_state = browser.execute_script(
            """
            const controls = document.querySelector('.workspace-controls');
            const loading = document.querySelector('[data-workspace-loading]');
            return {
                title: loading.querySelector('[data-workspace-loading-title]').textContent,
                stopDisabled: controls.querySelector('#challenge-stop').disabled,
                resetDisabled: controls.querySelector('#challenge-reset').disabled,
                restartDisabled: controls.querySelector('#challenge-restart').disabled,
            };
            """
        )
        if (
            stopped_state["title"] != "题目容器已停止"
            or not stopped_state["stopDisabled"]
            or not stopped_state["resetDisabled"]
            or stopped_state["restartDisabled"]
        ):
            raise AssertionError(f"stopped workspace state is inconsistent: {stopped_state}")
        controls.find_element(By.ID, "challenge-restart").click()
        restart_dialog = wait.until(
            lambda driver: next(
                (
                    layer
                    for layer in driver.find_elements(
                        By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible"
                    )
                    if layer.find_element(
                        By.CSS_SELECTOR, ".aisecedu-dialog-header"
                    ).get_attribute("textContent").strip()
                ),
                False,
            )
        )
        restart_title = restart_dialog.find_element(
            By.CSS_SELECTOR, ".aisecedu-dialog-header"
        ).get_attribute("textContent").strip()
        if (
            "重新启动题目容器"
            not in restart_title
        ):
            raise AssertionError(
                "workspace restart did not use the unified confirmation dialog: "
                f"{restart_title!r}"
            )
        restart_dialog.find_element(
            By.CSS_SELECTOR, "[data-dialog-action='confirm']"
        ).click()
        wait.until(
            lambda driver: controls.get_attribute("data-workspace-running") == "true"
            and controls.find_element(By.ID, "challenge-stop").is_enabled()
        )
        browser.execute_script(
            """
            CTFd.fetch = window.__workspaceLifecycleFetch;
            delete window.__workspaceLifecycleFetch;
            """
        )

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

        web = browser.find_element(
            By.CSS_SELECTOR,
            '.workspace-service[data-service="web: 8081"]',
        )
        web.click()
        wait.until(lambda driver: loading.is_displayed())
        wait.until(lambda driver: "/8081/" in (iframe.get_attribute("src") or ""))
        web_link = browser.find_element(By.CSS_SELECTOR, "[data-workspace-web-link]")
        web_address = browser.find_element(By.CSS_SELECTOR, "[data-workspace-web-address]")
        if (
            not web_address.is_displayed()
            or web_link.text != web_link.get_attribute("href")
            or not re.search(
                r"/w/[0-9a-f]{12}/8081/$",
                web_link.get_attribute("href"),
            )
            or "/auth/" in web_link.get_attribute("href")
            or "/workspace/" in web_link.get_attribute("href")
        ):
            raise AssertionError("Web service did not expose its editable short URL")
        wait.until(lambda driver: not loading.is_displayed())
        browser.switch_to.frame(iframe)
        wait.until(
            lambda driver: "AISecEdu web smoke"
            in driver.find_element(By.TAG_NAME, "body").text
        )
        browser.switch_to.default_content()

        original_window = browser.current_window_handle
        edited_web_url = f"{web_link.get_attribute('href')}index.html"
        browser.execute_script("window.open(arguments[0], '_blank')", edited_web_url)
        wait.until(lambda driver: len(driver.window_handles) == 2)
        browser.switch_to.window(
            next(handle for handle in browser.window_handles if handle != original_window)
        )
        wait.until(
            lambda driver: "AISecEdu web smoke"
            in driver.find_element(By.TAG_NAME, "body").text
        )
        if not browser.current_url.endswith("/8081/index.html"):
            raise AssertionError("editing the short Web URL path did not reach the selected resource")
        browser.close()
        browser.switch_to.window(original_window)

        code = browser.find_element(
            By.CSS_SELECTOR,
            '.workspace-service[data-service="code: 8080"]',
        )
        code.click()
        wait.until(lambda driver: loading.is_displayed())
        if "正在加载VS Code" not in loading.text:
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
        if "正在加载远程桌面" not in loading.text:
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
        clipboard_banner = wait.until(
            lambda driver: next(
                (
                    element
                    for element in driver.find_elements(
                        By.CSS_SELECTOR, "#workspace-notification-banner"
                    )
                    if element.is_displayed() and element.text.strip()
                ),
                False,
            )
        )
        if "剪贴板" not in clipboard_banner.text:
            raise AssertionError(
                "Desktop clipboard status banner did not contain readable text"
            )
        if browser.find_elements(By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible"):
            raise AssertionError("Desktop clipboard status interrupted the learner with a dialog")

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

        browser.switch_to.default_content()
        browser.set_window_size(760, 1000)
        browser.get(f"{origin}/guide")
        guide_root = wait.until(
            lambda driver: driver.find_element(By.ID, "learning-guide")
        )
        wait.until(
            lambda driver: guide_root.get_attribute("data-guide-ready") == "true"
        )
        guide_toggle = browser.find_element(By.ID, "guide-sidebar-toggle")
        wait.until(lambda driver: guide_toggle.is_displayed())
        guide_toggle.click()
        wait.until(
            lambda driver: "is-open"
            in driver.find_element(By.CSS_SELECTOR, ".guide-sidebar").get_attribute("class")
        )
        browser.find_element(By.ID, "guide-new").click()
        wait.until(lambda driver: "thread=" in driver.current_url)
        wait.until(
            lambda driver: driver.find_element(By.ID, "learning-guide").get_attribute("aria-busy")
            != "true"
        )
        if not browser.find_elements(By.CSS_SELECTOR, ".guide-thread-open"):
            raise AssertionError("Guide new-conversation button did not create a usable thread")
        if browser.find_element(By.CSS_SELECTOR, ".guide-header h1").text != "Guide":
            raise AssertionError("Guide still uses the redundant 学习 prefix")
        reference_toggle = browser.find_element(By.ID, "guide-reference-toggle")
        reference_toggle.click()
        reference_picker = wait.until(
            lambda driver: driver.find_element(By.ID, "guide-reference-picker")
        )
        wait.until(lambda driver: reference_picker.is_displayed())
        reference_option = wait.until(
            lambda driver: next(
                (
                    option
                    for option in driver.find_elements(
                        By.CSS_SELECTOR, "[data-reference-id]"
                    )
                    if "Service Startup" in option.text
                ),
                None,
            )
        )
        reference_option.click()
        wait.until(
            lambda driver: "Service Startup"
            in driver.find_element(
                By.ID, "guide-selected-references"
            ).text
        )
        guide_scope = browser.find_element(By.ID, "guide-profile-strip").text
        if (
            "本对话题目：Service Startup" not in guide_scope
            or "仅使用所选题目的证据" not in guide_scope
            or "回答范围：整体学习记录" in guide_scope
        ):
            raise AssertionError(
                f"Guide did not make the explicit reference scope authoritative: {guide_scope}"
            )
        guide_question = browser.find_element(By.ID, "guide-question")
        guide_question.send_keys("@")
        wait.until(lambda driver: reference_picker.is_displayed())
        if "@" in guide_question.get_attribute("value"):
            raise AssertionError("Guide @ reference trigger leaked into the question text")
        guide_layout = browser.execute_script(
            """
            const root = document.getElementById('learning-guide').getBoundingClientRect();
            const header = document.querySelector('.guide-header').getBoundingClientRect();
            const composer = document.querySelector('.guide-composer-wrap').getBoundingClientRect();
            const pageMain = document.querySelector('body > main');
            return {
                rootBottom: root.bottom,
                viewportBottom: window.innerHeight,
                headerHeight: header.height,
                composerGap: root.bottom - composer.bottom,
                pageMainMarginBottom: getComputedStyle(pageMain).marginBottom,
                bodyOverflow: getComputedStyle(document.body).overflow,
                footerCount: document.querySelectorAll('body > .footer').length,
            };
            """
        )
        if (
            abs(guide_layout["rootBottom"] - guide_layout["viewportBottom"]) > 2
            or guide_layout["headerHeight"] > 64
            or abs(guide_layout["composerGap"]) > 2
            or guide_layout["pageMainMarginBottom"] != "0px"
            or guide_layout["bodyOverflow"] != "hidden"
            or guide_layout["footerCount"]
        ):
            raise AssertionError(f"Guide does not use the viewport efficiently: {guide_layout}")
        browser.set_window_size(1600, 1000)

        inline_alert_state = browser.execute_script(
            """
            const alert = document.createElement('div');
            alert.id = 'inline-alert-regression';
            alert.className = 'alert alert-info';
            alert.setAttribute('role', 'alert');
            alert.textContent = '页面内提示回归检查';
            document.body.appendChild(alert);
            return {
                text: alert.textContent,
                visible: !alert.hidden && getComputedStyle(alert).display !== 'none',
                dialogs: document.querySelectorAll('.aisecedu-dialog-layer.is-visible').length,
            };
            """
        )
        if (
            inline_alert_state["text"] != "页面内提示回归检查"
            or not inline_alert_state["visible"]
            or inline_alert_state["dialogs"]
        ):
            raise AssertionError("inline alerts were promoted into a blocking dialog")

        theme_check = browser.execute_script(
            """
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
              <div id="learning-active-attempt"><div class="card">active</div></div>
              <div id="learning-skills-list"><div class="card">skills</div></div>
              <div id="studio-student-list"><div class="card">students</div></div>`;
            document.body.appendChild(wrapper);
            const cards = Array.from(wrapper.querySelectorAll('.card'));
            window.AISecEduUI.applyTheme('dark', false);
            const dark = cards.map(card => getComputedStyle(card).backgroundColor);
            document.querySelector('[data-theme-toggle]').click();
            const lightTheme = document.documentElement.dataset.aiseceduTheme;
            const light = cards.map(card => getComputedStyle(card).backgroundColor);
            document.querySelector('[data-theme-toggle]').click();
            wrapper.remove();
            return {dark, light, lightTheme, restored: document.documentElement.dataset.aiseceduTheme};
            """
        )
        if (
            theme_check["lightTheme"] != "light"
            or theme_check["restored"] != "dark"
            or any(value == "rgb(255, 255, 255)" for value in theme_check["dark"])
            or not all(value == "rgb(255, 255, 255)" for value in theme_check["light"])
        ):
            raise AssertionError(f"theme card colors are inconsistent: {theme_check}")

        browser.get(f"{origin}/{dojo}/smoke")
        challenge_button = wait.until(
            lambda driver: driver.find_element(
                By.CSS_SELECTOR, "[id^='challenges-header-button-']"
            )
        )
        if challenge_button.get_attribute("aria-expanded") != "true":
            challenge_button.click()
        challenge_body = wait.until(
            lambda driver: driver.find_element(
                By.CSS_SELECTOR, "[id^='challenges-body-'].show"
            )
        )
        inline_controls = wait.until(
            lambda driver: challenge_body.find_element(
                By.CSS_SELECTOR, ".challenge-workspace:not(.challenge-hidden) .workspace-controls"
            )
        )
        browser.execute_script(
            """
            window.__inlineStopFetch = CTFd.fetch.bind(CTFd);
            CTFd.fetch = function(input, init) {
                if (String(input) === '/pwncollege_api/v1/docker' && init && init.method === 'DELETE') {
                    return Promise.resolve({status: 200, json: () => Promise.resolve({success: true})});
                }
                return window.__inlineStopFetch(input, init);
            };
            arguments[0].querySelector('#challenge-stop').click();
            """,
            inline_controls,
        )
        inline_dialog = wait.until(
            lambda driver: driver.find_element(
                By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible"
            )
        )
        inline_dialog.find_element(
            By.CSS_SELECTOR, "[data-dialog-action='confirm']"
        ).click()
        wait.until(
            lambda driver: challenge_button.get_attribute("aria-expanded") == "false"
            and "show" not in challenge_body.get_attribute("class")
        )
        inline_state = browser.execute_script(
            """
            const item = document.querySelector("[id^='challenges-header-button-']").closest('.accordion-item');
            return {
                workspaceHidden: item.querySelector('.challenge-workspace').classList.contains('challenge-hidden'),
                startVisible: !item.querySelector('.challenge-init').classList.contains('challenge-hidden'),
                activeHeader: item.querySelector('.challenge-name').classList.contains('challenge-active'),
            };
            """
        )
        if (
            not inline_state["workspaceHidden"]
            or not inline_state["startVisible"]
            or inline_state["activeHeader"]
        ):
            raise AssertionError(
                f"stopped embedded workspace did not return to its collapsed start state: {inline_state}"
            )
        browser.execute_script(
            """
            CTFd.fetch = window.__inlineStopFetch;
            delete window.__inlineStopFetch;
            """
        )

        browser.get(
            f"{origin}/learning/scores/latest/{challenge_database_id}"
        )
        wait.until(
            lambda driver: "/learning/attempts/" in driver.current_url
            and driver.find_element(
                By.CSS_SELECTOR, ".learning-score-content"
            ).is_displayed()
        )
        if (
            browser.find_element(By.ID, "learning-score-title").text
            != current_attempt.get("challengeName")
            or not browser.find_elements(By.CSS_SELECTOR, ".learning-score-total-card")
            or browser.find_element(By.ID, "learning-score-challenge-link").get_attribute("href")
            != f"{origin}{current_attempt.get('challengeUrl')}"
        ):
            raise AssertionError("dedicated score page did not render the selected attempt")
    finally:
        browser.quit()
        if browser_profile:
            shutil.rmtree(browser_profile, ignore_errors=True)
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
                    {"name": "Web", "port": 8081},
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
                    },
                    {
                        "type": "text",
                        "path": "smoke/service/.init",
                        "content": "#!/bin/bash\npython3 -m http.server 8081 --directory /challenge >/tmp/aisecedu-web-smoke.log 2>&1 &\n",
                    },
                    {
                        "type": "text",
                        "path": "smoke/service/index.html",
                        "content": "<h1>AISecEdu web smoke</h1>\n",
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
                "set -e; test -s /run/dojo/share/icons/hicolor/scalable/apps/ida-free.svg; "
                "grep -q '^Icon=/nix/store/.*ida-free.svg$' /run/dojo/share/applications/ida-free.desktop; "
                "grep -q 'viewBox=\"0 0 128 128\"' /run/dojo/share/icons/hicolor/scalable/apps/ida-free.svg; "
                "test -s /run/dojo/share/icons/hicolor/scalable/apps/aisecedu-ida-free.svg; "
                "grep -q '^Icon=/run/dojo/share/icons/hicolor/scalable/apps/aisecedu-ida-free.svg$' /run/dojo/share/applications/aisecedu-ida-free.desktop; "
                "grep -q 'aisecedu-ida-free.desktop' /run/dojo/etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml; "
                "printf '128 x 128 high-contrast IDA SVG and stable XFCE launcher\\n'",
            ).stdout
            if "128 x 128" not in ida_icon:
                raise AssertionError("IDA desktop icon is not the expected high-visibility size")
            passed("clean /challenge start, full security toolchain, and clear IDA launcher")

            active = require(user.get(f"{BASE_URL}/active-module", timeout=20)).json()
            if active["c_current"]["challenge_reference_id"] != "service":
                raise AssertionError("active-module did not report the smoke workspace")
            passed("active workspace API")

            ambiguous_guide = require(
                user.post(
                    f"{BASE_URL}/pwncollege_api/v1/learning/guide",
                    json={
                        "question": "这道题考察什么知识点？",
                        "references": [],
                    },
                    timeout=30,
                )
            ).json()
            if (
                ambiguous_guide.get("provider") != "DETERMINISTIC"
                or "使用 @ 引用" not in (
                    (ambiguous_guide.get("message") or {}).get("content") or ""
                )
                or "Service Startup" in (
                    (ambiguous_guide.get("message") or {}).get("content") or ""
                )
            ):
                raise AssertionError(
                    "Guide guessed the active exercise for an ambiguous unreferenced question"
                )
            invalid_reference = user.post(
                f"{BASE_URL}/pwncollege_api/v1/learning/guide",
                json={
                    "threadId": (ambiguous_guide.get("thread") or {}).get("id"),
                    "question": "Do not silently select another exercise.",
                    "references": ["not/available/exercise"],
                },
                timeout=30,
            )
            if (
                invalid_reference.status_code != 400
                or "引用题目" not in (
                    invalid_reference.json().get("error") or ""
                )
            ):
                raise AssertionError(
                    "Guide did not reject an invalid explicit exercise reference"
                )
            passed("Guide refuses hidden task selection and invalid references")

            for service in ("terminal", "code", "desktop"):
                signed_service(user, service, workspace)
                passed(f"signed {service} service proxy")

            verify_ssh(private_key)
            passed("key-authenticated SSH routing, /challenge start, and command execution")

            if verify_browser_workspace(user, workspace, dojo):
                passed("browser loading, fixed sidebars, custom confirmations, editable short Web URL, score page, Guide references and full-height layout, embedded stop collapse, clean Code root, Desktop clipboard, quiet Terminal, and Tutor")

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

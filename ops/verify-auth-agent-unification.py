#!/usr/bin/env python3
"""Browser and API regression for auth onboarding and the shared agent shell."""

from __future__ import annotations

import argparse
import importlib.util
import os
import pathlib
import random
import re
import string
import subprocess
import sys
import time

import requests
import urllib3


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
UI_VERIFIER = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"


def load_chromedriver():
    spec = importlib.util.spec_from_file_location("teacher_agent_ui", UI_VERIFIER)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load ChromeDriver helper")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.ChromeDriver


def csrf_token(document: str) -> str:
    match = re.search(r"'csrfNonce': \"(\w+)\"", document)
    if not match:
        raise RuntimeError("authentication page did not expose a CSRF nonce")
    return match.group(1)


def api_session(base_url: str, payload: dict) -> tuple[requests.Session, dict]:
    session = requests.Session()
    session.verify = False
    page = session.get(f"{base_url}/register", timeout=20)
    page.raise_for_status()
    session.headers["CSRF-Token"] = csrf_token(page.text)
    response = session.post(
        f"{base_url}/pwncollege_api/v1/auth/register",
        json=payload,
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(f"registration failed ({response.status_code}): {response.text}")
    authenticated_page = session.get(f"{base_url}/", timeout=20)
    authenticated_page.raise_for_status()
    session.headers["CSRF-Token"] = csrf_token(authenticated_page.text)
    return session, response.json()["data"]


def admin_credentials() -> tuple[str, str]:
    username = os.getenv("DOJO_ADMIN_USERNAME", "admin")
    password = os.getenv("DOJO_ADMIN_PASSWORD", "")
    if password:
        return username, password
    path = REPO_DIR / "data" / "admin-password.txt"
    try:
        content = path.read_text(encoding="utf-8").strip()
    except PermissionError:
        container = os.getenv("DOJO_CONTAINER", "pwncollege-dojo")
        content = subprocess.run(
            ["docker", "exec", container, "cat", "/data/admin-password.txt"],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout.strip()
    if "=" not in content:
        return username, content
    values = {"username": username}
    for line in content.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip()] = value.strip()
    return values.get("username", username), values.get("password", "admin")


def login_session(base_url: str, username: str, password: str) -> requests.Session:
    session = requests.Session()
    session.verify = False
    page = session.get(f"{base_url}/login", timeout=20)
    page.raise_for_status()
    session.headers["CSRF-Token"] = csrf_token(page.text)
    response = session.post(
        f"{base_url}/pwncollege_api/v1/auth/login",
        json={"name": username, "password": password, "remember_me": False},
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(f"admin login failed ({response.status_code})")
    authenticated_page = session.get(f"{base_url}/", timeout=20)
    authenticated_page.raise_for_status()
    session.headers["CSRF-Token"] = csrf_token(authenticated_page.text)
    return session


def add_session_cookies(browser, session: requests.Session, origin: str) -> None:
    browser.navigate(origin + "/")
    for cookie in session.cookies:
        browser.add_cookie(cookie.name, cookie.value)


def severe_console(browser) -> list[str]:
    return [
        str(entry.get("message") or "")
        for entry in browser.browser_logs()
        if str(entry.get("level") or "").upper() == "SEVERE"
        and "favicon" not in str(entry.get("message") or "").lower()
        and not (
            "/events" in str(entry.get("message") or "")
            and "403" in str(entry.get("message") or "")
        )
    ]


def verify(args) -> None:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    base_url = args.base_url.rstrip("/")
    output = pathlib.Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)

    public = requests.Session()
    public.verify = False
    login = public.get(f"{base_url}/login", timeout=20)
    register = public.get(f"{base_url}/register", timeout=20)
    courses = public.get(f"{base_url}/pwncollege_api/v1/auth/courses", timeout=20)
    for response in (login, register, courses):
        response.raise_for_status()
    if 'data-auth-page="login"' not in login.text or 'data-auth-page="register"' not in register.text:
        raise RuntimeError("new authentication shell is not rendered")
    if 'name="role" value="student"' not in register.text or 'name="role" value="teacher"' not in register.text:
        raise RuntimeError("registration role onboarding is missing")
    if not courses.json().get("success"):
        raise RuntimeError("public registration course catalog failed")

    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=12))
    username = f"unified-{suffix}"
    student, registration = api_session(
        base_url,
        {
            "name": username,
            "email": f"{username}@example.com",
            "password": f"Secure-{suffix}-1!",
            "role": "student",
            "commitment_accepted": True,
        },
    )
    onboarding = registration.get("onboarding") or {}
    if onboarding.get("role") != "student" or onboarding.get("destination") != "/student":
        raise RuntimeError(f"student onboarding contract is invalid: {onboarding}")

    thread = student.post(
        f"{base_url}/pwncollege_api/v1/learning/guide/threads",
        json={},
        timeout=20,
    )
    thread.raise_for_status()
    thread_id = thread.json()["thread"]["id"]
    for action, body in (
        ("rename", {"action": "rename", "title": "统一智能体验收"}),
        ("pin", {"action": "pin"}),
    ):
        response = student.patch(
            f"{base_url}/pwncollege_api/v1/learning/guide/threads/{thread_id}",
            json=body,
            timeout=20,
        )
        if response.status_code != 200:
            raise RuntimeError(f"student thread {action} failed: {response.text}")

    ChromeDriver = load_chromedriver()
    browser = ChromeDriver(port=args.chromedriver_port)
    try:
        browser.navigate(f"{base_url}/login")
        browser.wait_for(
            "return Boolean(document.querySelector('.account-auth-shell[data-auth-page=\"login\"]') && document.querySelector('#account-login-form'));",
            timeout=30,
            label="new login shell",
        )
        browser.screenshot(output / "auth-login.png")

        browser.navigate(f"{base_url}/register")
        browser.wait_for(
            "return Boolean(document.querySelector('.account-auth-shell[data-auth-page=\"register\"]') && document.querySelector('#account-register-form'));",
            timeout=30,
            label="new registration shell",
        )
        role_state = browser.execute(
            "document.querySelector('input[name=\"role\"][value=\"teacher\"]').click();"
            "return {courseHidden: document.querySelector('#account-course-entry').hidden,"
            "checkbox: document.querySelector('#commitment-input').type,"
            "oldCommitment: document.body.innerText.includes('完全按照下方显示内容输入承诺')};"
        )
        if role_state != {"courseHidden": True, "checkbox": "checkbox", "oldCommitment": False}:
            raise RuntimeError(f"registration role interaction is invalid: {role_state}")
        browser.execute("document.querySelector('input[name=\"role\"][value=\"student\"]').click(); return true;")
        browser.screenshot(output / "auth-register.png")

        browser.request("DELETE", f"/session/{browser.session_id}/cookie")
        add_session_cookies(browser, student, base_url)
        browser.navigate(f"{base_url}/guide?thread={thread_id}")
        student_state = browser.wait_for(
            "var root=document.querySelector('#teacher-agent[data-role=\"student\"]');"
            "var title=document.querySelector('#teaching-thread-title');"
            "return root && root.dataset.agentReady === 'true' && title && title.textContent.trim() === '统一智能体验收' ? {"
            "shell: root.classList.contains('teaching-shell'),"
            "thread: title.textContent.trim(),"
            "drawer: Boolean(document.querySelector('#teaching-drawer')) ,"
            "refs: Boolean(document.querySelector('#student-reference-dialog')) ,"
            "legacy: Boolean(document.querySelector('.guide-shell'))} : null;",
            timeout=45,
            label="student shared agent workbench",
        )
        expected_student = {"shell": True, "thread": "统一智能体验收", "drawer": True, "refs": True, "legacy": False}
        if student_state != expected_student:
            raise RuntimeError(f"student Agent shell is invalid: {student_state}")
        browser.screenshot(output / "student-agent-unified.png")

        username_admin, password_admin = admin_credentials()
        admin = login_session(base_url, username_admin, password_admin)
        browser.request("DELETE", f"/session/{browser.session_id}/cookie")
        add_session_cookies(browser, admin, base_url)
        browser.navigate(f"{base_url}/teacher")
        teacher_state = browser.wait_for(
            "var root=document.querySelector('#teacher-agent[data-role=\"teacher\"]');"
            "return root ? {shell: root.classList.contains('teaching-shell'),"
            "threads: Boolean(document.querySelector('#teaching-thread-list')) ,"
            "drawer: Boolean(document.querySelector('#teaching-drawer'))} : null;",
            timeout=45,
            label="teacher shared agent workbench",
        )
        if teacher_state != {"shell": True, "threads": True, "drawer": True}:
            raise RuntimeError(f"teacher Agent shell is invalid: {teacher_state}")
        browser.screenshot(output / "teacher-agent-shared-shell.png")

        console = severe_console(browser)
        if console:
            raise RuntimeError("browser console errors: " + " | ".join(console[-6:]))
    finally:
        browser.close()
        student.delete(
            f"{base_url}/pwncollege_api/v1/learning/guide/threads/{thread_id}",
            json={},
            timeout=20,
        )

    print(
        "auth-agent-unification: PASS "
        f"login={output / 'auth-login.png'} "
        f"register={output / 'auth-register.png'} "
        f"student={output / 'student-agent-unified.png'} "
        f"teacher={output / 'teacher-agent-shared-shell.png'}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://192.168.3.111")
    parser.add_argument("--output-dir", default=str(REPO_DIR / "output" / "auth-agent-unification"))
    parser.add_argument("--chromedriver-port", type=int, default=9521)
    args = parser.parse_args()
    verify(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""System-wide UX evidence orchestrator.

This verifier intentionally distinguishes passing evidence from missing evidence.
It never treats an unavailable authenticated session, unresolved fixture or skipped
browser run as success.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import html.parser
import importlib.util
import json
import os
import pathlib
import re
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import requests


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "ops" / "fixtures" / "system-ux" / "routes.json"
DEFAULT_ACCEPTANCE = ROOT / "ops" / "fixtures" / "system-ux" / "acceptance.json"
DEFAULT_OUTPUT = ROOT / "output" / "system-ux" / "report.json"
FLOW_VERIFIER = ROOT / "ops" / "verify-teacher-agent-flow.py"
SYSTEM_UX_ASSIGNMENT_TITLE = "系统体验路由验收"
ACCEPTANCE_RE = re.compile(r"<tr><td>((?:PUB|AUTH|STU|TEA|ADM|SYS)-\d+)</td>")
PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z][a-zA-Z0-9_]*)\}")
WEBDRIVER_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"
AXE_SOURCE_CANDIDATES = (
    ROOT / "node_modules" / "axe-core" / "axe.min.js",
    ROOT / "services" / "agent-runtime" / "node_modules" / ".pnpm"
    / "axe-core@4.11.1" / "node_modules" / "axe-core" / "axe.min.js",
)


class ChromeDriver:
    """Small dependency-free WebDriver client for the system evidence run."""

    def __init__(self, timeout=30):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        self.origin = f"http://127.0.0.1:{port}"
        self.timeout = timeout
        self.profile = tempfile.TemporaryDirectory(prefix="aisecedu-system-ux-")
        self.process = subprocess.Popen(
            ["/usr/bin/chromedriver", f"--port={port}", "--allowed-ips="],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.session_id = None
        self.http = requests.Session()
        self.http.trust_env = False
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                if self.http.get(f"{self.origin}/status", timeout=1).ok:
                    break
            except requests.RequestException:
                time.sleep(0.2)
        else:
            self.close()
            raise RuntimeError("ChromeDriver 未能启动。")
        try:
            value = self.request("POST", "/session", {
                "capabilities": {"alwaysMatch": {
                    "browserName": "chrome",
                    "acceptInsecureCerts": True,
                    "goog:loggingPrefs": {"browser": "ALL"},
                    "goog:chromeOptions": {
                        "binary": "/usr/bin/chromium-browser",
                        "args": [
                            "--headless=new", "--no-sandbox",
                            "--disable-dev-shm-usage", "--disable-gpu",
                            "--ignore-certificate-errors", "--no-proxy-server",
                            f"--user-data-dir={self.profile.name}",
                            "--window-size=1440,1000",
                        ],
                    },
                }},
            })
            self.session_id = str(value.get("sessionId") or "")
            if not self.session_id:
                raise RuntimeError("ChromeDriver 没有返回会话。")
        except Exception:
            self.close()
            raise

    def request(self, method, path, body=None):
        response = self.http.request(
            method, f"{self.origin}{path}", json=body, timeout=self.timeout,
        )
        payload = response.json()
        value = payload.get("value")
        if response.status_code >= 400 or (
            isinstance(value, dict) and value.get("error")
        ):
            raise RuntimeError(f"WebDriver {method} {path} 失败：{value}")
        return value

    def navigate(self, url):
        self.request("POST", f"/session/{self.session_id}/url", {"url": url})

    def delete_all_cookies(self):
        self.request("DELETE", f"/session/{self.session_id}/cookie")

    def add_cookie(self, name, value):
        self.request("POST", f"/session/{self.session_id}/cookie", {
            "cookie": {"name": name, "value": value, "path": "/", "secure": True},
        })

    def set_window_size(self, width, height):
        self.request("POST", f"/session/{self.session_id}/window/rect", {
            "width": width, "height": height,
        })

    def execute(self, script):
        return self.request(
            "POST", f"/session/{self.session_id}/execute/sync",
            {"script": script, "args": []},
        )

    def execute_async(self, script):
        return self.request(
            "POST", f"/session/{self.session_id}/execute/async",
            {"script": script, "args": []},
        )

    def screenshot(self, path):
        encoded = self.request("GET", f"/session/{self.session_id}/screenshot")
        path.write_bytes(base64.b64decode(encoded))

    def browser_logs(self):
        value = self.request(
            "POST", f"/session/{self.session_id}/se/log", {"type": "browser"},
        )
        return value if isinstance(value, list) else []

    def close(self):
        if self.session_id:
            try:
                self.request("DELETE", f"/session/{self.session_id}")
            except Exception:
                pass
            self.session_id = None
        if getattr(self, "process", None) and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        if getattr(self, "profile", None):
            self.profile.cleanup()


class DocumentAudit(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.titles = 0
        self.h1 = 0
        self.mains = 0
        self.ids = []
        self.skip_links = 0
        self._in_title = False
        self.title_text = []
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "title":
            self.titles += 1
            self._in_title = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "main":
            self.mains += 1
        if values.get("id"):
            self.ids.append(values["id"])
        if tag == "a" and values.get("href") == "#main-content":
            self.skip_links += 1
        if tag == "a" and values.get("href"):
            self.hrefs.append(values["href"])

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title_text.append(data.strip())


def load_python_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载验收模块：{path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class SystemUXFixtures:
    """Create disposable role sessions and route objects for live evidence."""

    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.suffix = secrets.token_hex(5)
        self.teacher_name = f"system-ux-teacher-{self.suffix}"
        self.student_name = f"system-ux-student-{self.suffix}"
        self.teacher_password = secrets.token_urlsafe(24)
        self.student_password = secrets.token_urlsafe(24)
        self.flow = None
        self.admin = None
        self.teacher = None
        self.student = None
        self.assignment_id = None
        self.artifact_id = None
        self.fixture_env = {}
        self.cleanup_messages = []

    @staticmethod
    def _cookie_header(client):
        return "; ".join(
            f"{cookie.name}={cookie.value}" for cookie in client.cookies
        )

    def _api(self, client, method, path, *, body=None, statuses=(200,)):
        response = client.request(
            method,
            self.flow.api_url(path),
            json=body,
            allow_redirects=False,
            timeout=90,
        )
        return self.flow.unwrap(response, statuses)

    def _db_sql(self, sql):
        completed = subprocess.run(
            [
                "docker", "exec", "-i", self.flow.CONTAINER,
                "dojo", "db", "-qAt",
            ],
            input=sql,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                completed.stderr.strip() or "临时数据清理 SQL 失败。"
            )
        return completed.stdout.strip()

    def setup(self):
        self.flow = load_python_module(
            f"system_ux_flow_{self.suffix}", FLOW_VERIFIER
        )
        # Imported verifier defaults are deployment-oriented. Evidence must
        # always target the URL explicitly supplied to this command.
        self.flow.BASE_URL = self.base_url

        admin_name, admin_password = self.flow.admin_credentials()
        self.admin = self.flow.authenticate(admin_name, admin_password)
        self.flow.provision_teacher(self.teacher_name, self.teacher_password)
        self.teacher = self.flow.authenticate(
            self.teacher_name, self.teacher_password
        )
        self.student = self.flow.register(
            self.student_name, self.student_password
        )

        context = self._api(self.teacher, "GET", "teaching/context")
        courses = context.get("teacherDojos") or []
        course = next(
            (
                row for row in courses
                if str(row.get("referenceId") or "").startswith(
                    "manual-platform-check~"
                )
            ),
            next(iter(courses), None),
        )
        if not course:
            raise RuntimeError("临时教师没有可用于验收的课程。")
        course_reference = str(course.get("referenceId") or "").strip()
        if not course_reference:
            raise RuntimeError("验收课程缺少稳定 referenceId。")

        modules = course.get("modules") or []
        module = next(
            (row for row in modules if row.get("id") == "manual"),
            next(iter(modules), {}),
        )
        challenges = module.get("challenges") or []
        challenge = next(
            (row for row in challenges if row.get("id") == "terminal-handshake"),
            next(iter(challenges), {}),
        )
        module_id = str(module.get("id") or "manual")
        challenge_id = str(challenge.get("id") or "terminal-handshake")

        enrolled = self.student.post(
            self.flow.api_url(f"dojos/{course_reference}/enrollment"),
            json={},
            allow_redirects=False,
            timeout=60,
        )
        self.flow.require(enrolled, (200, 201))

        assignment = self._api(
            self.teacher,
            "POST",
            f"coursework/dojos/{course_reference}/assignments",
            body={
                # Run uniqueness belongs in the account, object IDs and private
                # fixture metadata.  Never leak an opaque trace suffix into the
                # learner-facing assignment title.
                "title": SYSTEM_UX_ASSIGNMENT_TITLE,
                "kind": "QUIZ",
                "moduleIndex": int(module.get("index") or 0),
                "description": "由系统级 UX 验收创建并在完成后自动清理。",
                "settings": {
                    "allowLate": False,
                    "allowResubmit": True,
                    "passPercent": 60,
                    "verificationFixture": {
                        "kind": "system-ux",
                        "runId": self.suffix,
                    },
                },
                "items": [
                    {
                        "type": "TRUE_FALSE",
                        "title": "最小权限",
                        "prompt": "业务账号应遵循最小权限原则。",
                        "points": 10,
                        "config": {
                            "correctAnswer": True,
                            "explanation": "只授予完成任务所需的权限。",
                        },
                    }
                ],
            },
            statuses=(201,),
        )["assignment"]
        self.assignment_id = str(assignment["id"])
        self._api(
            self.teacher,
            "POST",
            f"coursework/assignments/{self.assignment_id}/publish",
            body={},
        )

        teacher_me = self.flow.require(
            self.teacher.get(
                f"{self.base_url}/api/v1/users/me", timeout=30
            )
        ).json()["data"]
        self.artifact_id = f"artifact_{self.suffix}"
        revision_id = f"revision_{self.suffix}"
        artifact_content = {
            "title": "系统体验安全预览",
            "summary": "用于验证学生只能读取已发布且经过服务端脱敏的课程内容。",
            "learningObjectives": ["解释最小权限原则", "识别不必要的高权限"],
            "artifacts": [
                {
                    "id": "slide-1",
                    "type": "slide",
                    "title": "最小权限原则",
                    "content": {
                        "heading": "只授予完成任务所需的权限",
                        "body": "权限范围、持续时间与使用者都应可审计。",
                    },
                }
            ],
        }
        encoded_content = json.dumps(
            artifact_content, ensure_ascii=False, separators=(",", ":")
        )
        content_hash = hashlib.sha256(encoded_content.encode()).hexdigest()
        escaped_title = "系统体验安全预览"
        escaped_content = encoded_content.replace("'", "''")
        course_id = int(course["id"])
        module_index = int(module.get("index") or 0)
        teacher_id = int(teacher_me["id"])
        self._db_sql(
            "INSERT INTO teaching_artifacts "
            "(id, owner_id, dojo_id, module_index, sort_order, artifact_type, "
            "title, status, current_revision, created, updated, published) VALUES "
            f"('{self.artifact_id}', {teacher_id}, {course_id}, {module_index}, "
            f"2147483647, 'slide-deck', '{escaped_title}', 'PUBLISHED', 1, "
            "NOW(), NOW(), NOW());"
            "INSERT INTO teaching_artifact_revisions "
            "(id, artifact_id, revision, instruction, content, content_hash, "
            "source_refs, validation, created_by, created) VALUES "
            f"('{revision_id}', '{self.artifact_id}', 1, '系统 UX 验收夹具', "
            f"'{escaped_content}'::jsonb, '{content_hash}', '[]'::jsonb, "
            f"'{{\"status\":\"PASSED\"}}'::jsonb, {teacher_id}, NOW());"
        )

        overview = self._api(self.student, "GET", "learning/overview")
        published_artifacts = (
            (overview.get("workspace") or {}).get("publishedArtifacts") or []
        )
        artifact_id = ""
        if published_artifacts:
            first_artifact = published_artifacts[0]
            artifact_id = str(first_artifact.get("id") or "").strip()
            if not artifact_id:
                artifact_url = str(first_artifact.get("url") or "")
                artifact_id = artifact_url.rstrip("/").rsplit("/", 1)[-1]
        # The missing-resource ID remains explicit when the acceptance course
        # has no published material, so recovery behavior is still testable.
        artifact_id = artifact_id or self.artifact_id
        self.fixture_env = {
            "course": course_reference,
            "module": module_id,
            "challenge": challenge_id,
            "assignment": self.assignment_id,
            "artifact": artifact_id,
        }
        return {
            "student": {"cookie": self._cookie_header(self.student)},
            "teacher": {"cookie": self._cookie_header(self.teacher)},
            "admin": {"cookie": self._cookie_header(self.admin)},
        }, dict(self.fixture_env)

    def cleanup(self):
        if self.flow is None:
            return ["验收模块尚未加载，无可清理对象。"]
        if self.artifact_id:
            try:
                artifact = self.artifact_id.replace("'", "''")
                self._db_sql(
                    "DELETE FROM learning_audit_events "
                    "WHERE resource_type='teaching_artifact' "
                    f"AND resource_id='{artifact}';"
                    "DELETE FROM teaching_artifacts "
                    f"WHERE id='{artifact}';"
                )
                self.cleanup_messages.append("临时学生安全成果已移除")
            except Exception as error:
                self.cleanup_messages.append(
                    f"临时成果清理失败：{type(error).__name__}: {error}"
                )
        if self.assignment_id and self.teacher is not None:
            try:
                response = self.teacher.delete(
                    self.flow.api_url(
                        f"coursework/assignments/{self.assignment_id}"
                    ),
                    json={},
                    allow_redirects=False,
                    timeout=60,
                )
                if response.status_code == 409:
                    assignment = self.assignment_id.replace("'", "''")
                    self._db_sql(
                        "DELETE FROM learning_audit_events "
                        "WHERE resource_type='teaching_assignment' "
                        f"AND resource_id='{assignment}';"
                        "DELETE FROM teaching_assignments "
                        f"WHERE id='{assignment}';"
                    )
                else:
                    self.flow.require(response, (200, 404))
                self.cleanup_messages.append("临时作业已移除")
            except Exception as error:
                self.cleanup_messages.append(
                    f"临时作业清理失败：{type(error).__name__}: {error}"
                )

        if self.admin is None:
            return self.cleanup_messages
        for role, name in (
            ("教师", self.teacher_name),
            ("学生", self.student_name),
        ):
            try:
                response = self.flow.require(
                    self.admin.get(
                        f"{self.base_url}/api/v1/users",
                        params={"q": name, "field": "name"},
                        timeout=30,
                    )
                )
                for user in response.json().get("data") or []:
                    if user.get("name") != name:
                        continue
                    self.flow.require(
                        self.admin.delete(
                            f"{self.base_url}/api/v1/users/{user['id']}",
                            json={},
                            timeout=30,
                        ),
                        (200, 404),
                    )
                self.cleanup_messages.append(f"临时{role}账号已移除")
            except Exception as error:
                self.cleanup_messages.append(
                    f"临时{role}账号清理失败：{type(error).__name__}: {error}"
                )
        return self.cleanup_messages


def result(check_id, state, message, **details):
    return {"id": check_id, "state": state, "message": message, **details}


def load_manifest(path):
    with path.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    required = {"contractVersion", "viewports", "fixtures", "routes"}
    missing = required - set(manifest)
    if missing:
        raise ValueError(f"route manifest 缺少字段：{', '.join(sorted(missing))}")
    return manifest


def load_acceptance(path):
    with path.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    if set(manifest) != {"contractVersion", "items"}:
        raise ValueError("acceptance manifest 必须只包含 contractVersion/items。")
    if not isinstance(manifest["items"], dict):
        raise ValueError("acceptance manifest 的 items 必须是对象。")
    return manifest


def static_checks(manifest, acceptance):
    checks = []
    routes = manifest["routes"]
    route_ids = [row.get("id") for row in routes]
    duplicate_ids = sorted({item for item in route_ids if route_ids.count(item) > 1})
    checks.append(result(
        "SYS-00-MANIFEST-IDS",
        "failed" if duplicate_ids else "passed",
        f"发现重复 route ID：{duplicate_ids}" if duplicate_ids else f"{len(routes)} 个 route 定义 ID 唯一。",
    ))
    scenario_count = sum(len(row.get("viewports") or []) for row in routes)
    checks.append(result(
        "SYS-00-MANIFEST-SCENARIOS",
        "passed" if scenario_count >= 70 else "failed",
        f"route manifest 展开为 {scenario_count} 个角色/视口场景。",
        scenarioCount=scenario_count,
    ))
    modes = {row.get("mode") for row in routes}
    checks.append(result(
        "SYS-00-MANIFEST-MODES",
        "passed" if modes == {"public", "learning", "teaching", "admin"} else "failed",
        f"覆盖模式：{', '.join(sorted(modes))}",
    ))

    base = (ROOT / "dojo_theme" / "templates" / "base.html").read_text(encoding="utf-8")
    required_shell = {
        "skip link": 'class="product-skip-link" href="#main-content"',
        "main landmark": 'id="main-content"',
        "versioned title": "shell_metadata.title",
        "product bootstrap": "product_bootstrap",
    }
    shell_missing = [label for label, token in required_shell.items() if token not in base]
    checks.append(result(
        "SYS-02-SHELL-STATIC",
        "failed" if shell_missing else "passed",
        f"全局壳层缺少：{', '.join(shell_missing)}" if shell_missing else "全局壳层具备 skip link、main、页面标题与服务端 bootstrap。",
    ))

    component_paths = [
        "recovery-panel.js", "status-badge.js", "async-boundary.js",
        "dialog.js", "tabs.js", "combobox.js", "data-table.js",
        "task-list.js", "resource-card.js", "batch-progress.js",
        "workspace-state.js",
    ]
    missing_components = [
        name for name in component_paths
        if not (ROOT / "dojo_theme" / "static" / "js" / "dojo" / "components" / name).exists()
    ]
    checks.append(result(
        "SYS-04-COMPONENTS-STATIC",
        "failed" if missing_components else "passed",
        f"缺少共享组件：{', '.join(missing_components)}" if missing_components else "共享异步、恢复、状态、对话框、标签、组合框、数据表、任务、资源、批次与工作区组件均存在。",
    ))
    telemetry_path = ROOT / "dojo_theme" / "static" / "js" / "dojo" / "core" / "telemetry.js"
    telemetry_source = telemetry_path.read_text(encoding="utf-8") if telemetry_path.is_file() else ""
    telemetry_tokens = ("containsForbidden", "unknown_state", "state_contradiction", "/ui/telemetry")
    missing_telemetry = [token for token in telemetry_tokens if token not in telemetry_source]
    checks.append(result(
        "SYS-13-TELEMETRY-STATIC",
        "failed" if missing_telemetry else "passed",
        f"隐私遥测缺少：{', '.join(missing_telemetry)}" if missing_telemetry else "隐私白名单、未知状态、矛盾状态与服务端采集链路均存在。",
    ))

    request_client = (
        ROOT / "dojo_theme" / "static" / "js" / "dojo" / "core" / "request-client.js"
    ).read_text(encoding="utf-8")
    request_tokens = ("AbortController", "timeoutMs", "dedupeKey", "retry-after", "invalidateCache")
    missing_request_tokens = [token for token in request_tokens if token not in request_client]
    checks.append(result(
        "SYS-07-REQUEST-CLIENT-STATIC",
        "failed" if missing_request_tokens else "passed",
        f"统一请求层缺少：{', '.join(missing_request_tokens)}" if missing_request_tokens else "统一请求层具备取消、超时、去重、退避与写后缓存失效。",
    ))

    plugin_init = (ROOT / "dojo_plugin" / "__init__.py").read_text(encoding="utf-8")
    error_template = (ROOT / "dojo_theme" / "templates" / "error.html").read_text(encoding="utf-8")
    error_statuses = tuple(f"{status}:" for status in (400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503))
    error_ready = all(token in plugin_init for token in error_statuses) and all(
        token in error_template for token in ("data-request-id", "recovery_href", "error_description")
    )
    checks.append(result(
        "SYS-08-ERROR-MATRIX-STATIC",
        "passed" if error_ready else "failed",
        "常见客户端、冲突、限流与服务错误均使用产品化恢复页面。" if error_ready else "统一错误矩阵或恢复页面字段不完整。",
    ))

    component_sources = "\n".join(
        (ROOT / "dojo_theme" / "static" / "js" / "dojo" / "components" / name).read_text(encoding="utf-8")
        for name in ("dialog.js", "tabs.js", "combobox.js", "data-table.js")
    )
    keyboard_tokens = ("ArrowRight", "ArrowDown", "Escape", "aria-sort", "focus")
    keyboard_ready = all(token in component_sources for token in keyboard_tokens)
    checks.append(result(
        "SYS-09-KEYBOARD-STATIC",
        "passed" if keyboard_ready else "failed",
        "Dialog、Tabs、Combobox 与可排序表格均提供键盘契约。" if keyboard_ready else "共享复杂控件的键盘契约不完整。",
    ))

    css_source = "\n".join(
        path.read_text(encoding="utf-8", errors="replace")
        for path in (ROOT / "dojo_theme" / "static" / "css").glob("*.css")
        if not path.name.endswith(".min.css")
    )
    theme_tokens = ("prefers-reduced-motion", "forced-colors", ":focus-visible")
    missing_theme_tokens = [token for token in theme_tokens if token not in css_source]
    checks.append(result(
        "SYS-11-THEME-MOTION-STATIC",
        "failed" if missing_theme_tokens else "passed",
        f"主题与动效基线缺少：{', '.join(missing_theme_tokens)}" if missing_theme_tokens else "减少动画、强制色与可见焦点基线均存在。",
    ))

    removal_path = ROOT / "docs" / "system-ux-deprecation-removal.md"
    compatibility_ready = removal_path.is_file() and all(
        token in removal_path.read_text(encoding="utf-8")
        for token in ("/learning", "/sensai", "/forgot-password", "删除门禁")
    )
    checks.append(result(
        "SYS-14-COMPATIBILITY-STATIC",
        "passed" if compatibility_ready else "failed",
        "旧路由、canonical 替代、退出条件与删除门禁已有清单。" if compatibility_ready else "兼容路由删除清单不完整。",
    ))

    rollout_path = ROOT / "docs" / "system-ux-rollout-runbook.md"
    rollout_ready = rollout_path.is_file() and all(
        token in rollout_path.read_text(encoding="utf-8")
        for token in ("STUDENT_UX_V2_MODE=disabled", "回滚步骤", "业务指纹", "90 项 acceptance")
    )
    checks.append(result(
        "SYS-15-ROLLOUT-RUNBOOK",
        "passed" if rollout_ready else "failed",
        "灰度、停止条件、无损回滚、数据指纹与复验步骤均已定义。" if rollout_ready else "灰度与回滚 Runbook 不完整。",
    ))

    source = "\n".join(
        path.read_text(encoding="utf-8", errors="replace")
        for path in (ROOT / "dojo_theme" / "templates").rglob("*.html")
    )
    leaked_join_links = re.findall(r'href=["\'][^"\']*/join/[^"\'{%][^"\']*["\']', source)
    checks.append(result(
        "SYS-01-NO-SECRET-JOIN-LINKS",
        "failed" if leaked_join_links else "passed",
        "模板仍生成包含秘密的加入 URL。" if leaked_join_links else "模板未生成包含秘密的课程加入 URL。",
    ))

    admin_source = (ROOT / "dojo_plugin" / "pages" / "workspace.py").read_text(encoding="utf-8")
    checks.append(result(
        "ADM-04-ROUTE-STATIC",
        "passed" if '@workspace.route("/admin/desktops"' in admin_source else "failed",
        "运行环境治理路由已注册。" if '@workspace.route("/admin/desktops"' in admin_source else "运行环境治理菜单仍没有对应路由。",
    ))
    course_template = (ROOT / "dojo_theme" / "templates" / "admin_dojos.html").read_text(encoding="utf-8")
    nullable_safe = "dojo.hash[:8]" not in course_template and "last_commit_time" not in course_template
    checks.append(result(
        "ADM-03-NULLABLE-COURSE-STATIC",
        "passed" if nullable_safe else "failed",
        "课程治理不再对可空 Git 字段直接切片或求提交时间。" if nullable_safe else "课程治理仍直接访问可空 Git 字段。",
    ))

    plugin_source = (ROOT / "dojo_plugin" / "__init__.py").read_text(encoding="utf-8")
    api_source = (ROOT / "dojo_plugin" / "api" / "__init__.py").read_text(encoding="utf-8")
    gated = "enable_test_routes" in plugin_source and "enable_test_routes" in api_source
    checks.append(result(
        "SYS-16-TEST-ROUTE-GATE",
        "passed" if gated else "failed",
        "故障注入页面/API 已按测试环境显式开关。" if gated else "故障注入路由仍可能在生产注册。",
    ))

    plan = (ROOT / "docs" / "system-wide-ux-development-plan.html").read_text(encoding="utf-8")
    acceptance_ids = sorted(set(ACCEPTANCE_RE.findall(plan)))
    declared_ids = sorted(acceptance["items"])
    manifest_acceptance = {route_id for route_id in route_ids if route_id in acceptance_ids}
    malformed = sorted(
        item_id for item_id, item in acceptance["items"].items()
        if not isinstance(item, dict) or not item.get("assertion") or not item.get("evidence")
    )
    inventory_failures = []
    if acceptance["contractVersion"] != manifest["contractVersion"]:
        inventory_failures.append("contractVersion 不一致")
    if declared_ids != acceptance_ids:
        missing_ids = sorted(set(acceptance_ids) - set(declared_ids))
        extra_ids = sorted(set(declared_ids) - set(acceptance_ids))
        inventory_failures.append(f"缺少 {missing_ids}；多出 {extra_ids}")
    if malformed:
        inventory_failures.append(f"缺少断言或证据：{malformed}")
    checks.append(result(
        "SYS-00-ACCEPTANCE-INVENTORY",
        "failed" if inventory_failures else "passed",
        "；".join(inventory_failures) if inventory_failures else f"方案中的 {len(acceptance_ids)} 项均有独立断言和可执行证据，不存在未映射项。",
        acceptanceCount=len(acceptance_ids),
        declaredCount=len(declared_ids),
        routeMappedCount=len(manifest_acceptance),
        unmapped=[],
    ))
    return checks


def load_sessions(path):
    sessions = {"public": {}}
    if not path:
        return sessions
    payload = json.loads(path.read_text(encoding="utf-8"))
    for role, value in payload.items():
        if isinstance(value, str):
            sessions[role] = {"cookie": value}
        elif isinstance(value, dict):
            sessions[role] = value
    return sessions


def resolve_path(value, fixture_env):
    missing = []
    def replace(match):
        key = match.group(1)
        replacement = fixture_env.get(key)
        if not replacement:
            missing.append(key)
            return match.group(0)
        return urllib.parse.quote(str(replacement), safe="~")
    return PLACEHOLDER_RE.sub(replace, value), missing


def load_axe_source():
    for path in AXE_SOURCE_CANDIDATES:
        if path.is_file():
            return path.read_text(encoding="utf-8"), path
    return None, None


def wait_for_fixture_components(driver, timeout=8):
    return driver.execute_async(f"""
        const done = arguments[arguments.length - 1];
        const deadline = Date.now() + {max(1, int(timeout)) * 1000};
        const ready = () => {{
          const api = window.AISecEdu || {{}};
          return Boolean(
            api.tabs && api.combobox && api.dataTable && api.taskList
            && api.resourceCard && api.batchProgress && api.workspaceState
            && api.dialog && api.statusBadge && api.asyncBoundary && api.telemetry
          );
        }};
        (function poll() {{
          if (ready()) return done({{ready: true}});
          if (Date.now() >= deadline) return done({{
            ready: false,
            available: Object.keys(window.AISecEdu || {{}}).sort(),
          }});
          window.setTimeout(poll, 50);
        }})();
    """)


def component_fixture_audit(driver):
    return driver.execute("""
        const root = document.querySelector('[data-component-fixture]');
        if (!root) return {present: false, failures: ['验收夹具根节点不存在']};
        const failures = [];
        const check = (condition, message) => { if (!condition) failures.push(message); };

        const unknownBadge = root.querySelector('[data-status-known="false"]');
        check(Boolean(unknownBadge && unknownBadge.textContent.trim() === '状态需确认'), '未知状态没有安全回退显示');

        const table = root.querySelector('[data-data-table]');
        const firstCell = table && table.querySelector('tbody td');
        const sortButton = table && table.querySelector('[data-sort-key] button');
        check(Boolean(table && table.classList.contains('ae-data-table')), '数据表未增强');
        check(Boolean(firstCell && firstCell.dataset.label), '移动端数据表缺少列标签');
        if (sortButton) {
          sortButton.click();
          check(sortButton.closest('th').getAttribute('aria-sort') === 'ascending', '数据表排序状态未同步');
        } else {
          failures.push('数据表排序按钮不存在');
        }

        const taskSummary = root.querySelector('[data-task-list-summary]');
        check(Boolean(taskSummary && taskSummary.textContent.trim()), '任务列表没有可读汇总');
        check(root.querySelectorAll('[data-task-list] [role="listitem"]').length === 2, '任务列表语义不完整');

        const resource = root.querySelector('[data-resource-card]');
        check(Boolean(resource && resource.classList.contains('ae-resource-card')), '资源卡未增强');
        check(Boolean(resource && resource.getAttribute('aria-labelledby')), '资源卡缺少标题关联');
        check(root.querySelectorAll('[data-resource-card] .ae-status').length === 2, '资源卡状态没有统一映射');

        const batch = root.querySelector('[data-batch-progress]');
        check(batch && batch.dataset.batchValid === 'true', '批次计数被误判或未渲染');
        check(Boolean(batch && batch.querySelector('[role="progressbar"][aria-valuenow="3"]')), '批次进度语义不完整');

        const workspace = root.querySelector('[data-workspace-state]');
        check(workspace && workspace.dataset.workspaceValid === 'true', '工作区组合状态未正确拆分');
        check(Boolean(workspace && workspace.querySelector('[data-workspace-action]').textContent.trim()), '工作区缺少恢复动作');

        const firstTab = root.querySelector('#fixture-tab-a');
        const secondTab = root.querySelector('#fixture-tab-b');
        firstTab.focus();
        firstTab.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
        check(document.activeElement === secondTab && secondTab.getAttribute('aria-selected') === 'true', '标签页方向键导航失败');
        secondTab.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));

        const combo = root.querySelector('#fixture-combobox');
        combo.focus();
        combo.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
        check(combo.getAttribute('aria-expanded') === 'true' && Boolean(combo.getAttribute('aria-activedescendant')), '组合框方向键导航失败');
        combo.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        check(combo.getAttribute('aria-expanded') === 'false', '组合框 Escape 未关闭选项');

        const opener = root.querySelector('[data-dialog-open="fixture-dialog"]');
        const dialog = root.querySelector('#fixture-dialog');
        opener.focus();
        opener.click();
        check(dialog.hidden === false && dialog.getAttribute('aria-hidden') === 'false', '对话框未打开');
        check(Boolean(document.activeElement && document.activeElement.closest('#fixture-dialog')), '对话框未接管焦点');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        check(dialog.hidden === true && document.activeElement === opener, '对话框未通过 Escape 关闭并恢复焦点');

        const skip = document.querySelector('a[href="#main-content"]');
        skip && skip.focus();
        check(document.activeElement === skip, '跳过导航链接无法获得焦点');
        return {present: true, failures};
    """)


def axe_audit(driver, axe_source):
    driver.execute(axe_source + "\nreturn typeof axe !== 'undefined';")
    return driver.execute_async("""
        const done = arguments[arguments.length - 1];
        const scope = document.querySelector('[data-component-fixture]') || document;
        axe.run(scope, {
          runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']},
          resultTypes: ['violations'],
        }).then(result => done({
          violations: result.violations.map(item => ({
            id: item.id,
            impact: item.impact,
            help: item.help,
            nodes: item.nodes.slice(0, 4).map(node => node.target),
          })),
        })).catch(error => done({error: String(error)}));
    """)


def crawl_internal_links(base_url, hrefs, headers, timeout):
    origin = urllib.parse.urlsplit(base_url)
    candidates = []
    seen = set()
    skipped_external = 0
    for href in hrefs:
        raw = str(href or "").strip()
        if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urllib.parse.urljoin(base_url.rstrip("/") + "/", raw)
        parsed = urllib.parse.urlsplit(absolute)
        if (parsed.scheme, parsed.netloc) != (origin.scheme, origin.netloc):
            skipped_external += 1
            continue
        normalized = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))
        if normalized in seen or parsed.path == "/logout":
            continue
        seen.add(normalized)
        candidates.append(normalized)

    failures = []
    checked = []
    if len(candidates) > 240:
        failures.append(f"可见站内链接 {len(candidates)} 个，超过单页 240 个安全上限")
        candidates = candidates[:240]
    session = requests.Session()
    session.trust_env = False
    session.headers.update(headers)
    local_ca = ROOT / "data" / "local-tls" / "ca.crt"
    verify = str(local_ca) if local_ca.is_file() else False
    for candidate in candidates:
        current = candidate
        redirects = []
        response = None
        try:
            for _ in range(7):
                response = session.get(
                    current,
                    allow_redirects=False,
                    timeout=min(max(2, timeout), 12),
                    verify=verify,
                )
                if response.status_code not in {301, 302, 303, 307, 308}:
                    break
                location = response.headers.get("Location")
                if not location:
                    failures.append(f"{urllib.parse.urlsplit(current).path}: redirect 缺少 Location")
                    break
                next_url = urllib.parse.urljoin(current, location)
                next_parsed = urllib.parse.urlsplit(next_url)
                if (next_parsed.scheme, next_parsed.netloc) != (origin.scheme, origin.netloc):
                    break
                next_key = urllib.parse.urlunsplit((next_parsed.scheme, next_parsed.netloc, next_parsed.path, next_parsed.query, ""))
                if next_key in redirects:
                    failures.append(f"{urllib.parse.urlsplit(candidate).path}: redirect loop")
                    break
                redirects.append(next_key)
                current = next_key
            else:
                failures.append(f"{urllib.parse.urlsplit(candidate).path}: redirect 超过 6 跳")
        except requests.RequestException as error:
            failures.append(
                f"{urllib.parse.urlsplit(candidate).path}: {type(error).__name__}"
            )
            continue
        if response is None:
            continue
        status = response.status_code
        content_type = response.headers.get("Content-Type", "").lower()
        product_denial = status in {403, 410} and (
            "data-product-error" in response.text
            or "application/json" in content_type and '"success":false' in response.text.replace(" ", "").lower()
        )
        allowed = 200 <= status < 400 or product_denial
        path_only = urllib.parse.urlsplit(candidate).path
        checked.append({"path": path_only, "status": status, "redirects": len(redirects)})
        if not allowed:
            failures.append(f"{path_only}: HTTP {status}")
    return {
        "checked": len(checked),
        "externalSkipped": skipped_external,
        "failures": failures[:30],
        "sample": checked[:20],
    }


def request_route(base_url, route, sessions, fixture_env, timeout):
    path, missing = resolve_path(route["path"], fixture_env)
    if missing:
        return result(route["id"], "missing", f"缺少动态 fixture：{', '.join(sorted(set(missing)))}", path=path)
    session_name = route.get("session", "public")
    session = sessions.get(session_name)
    if session_name != "public" and not session:
        return result(route["id"], "missing", f"缺少 {session_name} 会话证据。", path=path)
    headers = {"Accept": "application/json,text/html;q=0.9", "User-Agent": "Xuanjia-System-UX-Verifier/1"}
    if session and session.get("cookie"):
        headers["Cookie"] = session["cookie"]
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    started = time.perf_counter()
    request = urllib.request.Request(url, headers=headers, method="GET")
    local_ca = ROOT / "data" / "local-tls" / "ca.crt"
    ssl_context = (
        ssl.create_default_context(cafile=str(local_ca))
        if local_ca.is_file()
        else ssl.create_default_context()
    )
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl_context),
    )
    try:
        response = opener.open(request, timeout=timeout)
        status = response.status
        body = response.read(2_000_000)
        content_type = response.headers.get("content-type", "")
        final_url = response.geturl()
    except urllib.error.HTTPError as error:
        status = error.code
        body = error.read(2_000_000)
        content_type = error.headers.get("content-type", "")
        final_url = error.geturl()
    except Exception as error:
        return result(route["id"], "failed", f"网络请求失败：{type(error).__name__}: {error}", path=path)
    duration_ms = round((time.perf_counter() - started) * 1000, 1)
    failures = []
    parser = None
    link_crawl = None
    if status not in route["expected"]:
        failures.append(f"HTTP {status} 不在预期 {route['expected']}")
    if "productionBoundary" in route.get("checks", []) and status != 404:
        failures.append(f"生产边界端点应返回 404，实际为 HTTP {status}")
    if "jsonEnvelope" in route.get("checks", []):
        if "application/json" not in content_type.lower():
            failures.append("响应不是 JSON")
        else:
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                failures.append("JSON 无法解析")
            else:
                if set(("success", "meta")) - set(payload):
                    failures.append("缺少 success/meta envelope")
                if payload.get("meta", {}).get("contractVersion") != "2026-08-28":
                    failures.append("contractVersion 不匹配")
    elif status == 200 and "text/html" in content_type.lower():
        parser = DocumentAudit()
        parser.feed(body.decode("utf-8", errors="replace"))
        if "metadata" in route.get("checks", []):
            if parser.titles != 1 or not any(parser.title_text):
                failures.append(f"title 数量/内容异常：{parser.titles}")
            if parser.h1 != 1:
                failures.append(f"H1 数量异常：{parser.h1}")
            if parser.mains != 1:
                failures.append(f"main 数量异常：{parser.mains}")
            duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
            if duplicates:
                failures.append(f"重复 DOM ID：{duplicates[:8]}")
            if parser.skip_links != 1 and route["mode"] != "admin":
                failures.append(f"skip link 数量异常：{parser.skip_links}")
        if "crawlLinks" in route.get("checks", []):
            link_crawl = crawl_internal_links(
                base_url,
                parser.hrefs,
                headers,
                timeout,
            )
            failures.extend(link_crawl["failures"])
    return result(
        route["id"],
        "failed" if failures else "passed",
        "；".join(failures) if failures else f"HTTP {status}，{duration_ms} ms。",
        path=path,
        status=status,
        durationMs=duration_ms,
        finalUrl=final_url,
        contentType=content_type,
        linkCrawl=link_crawl,
    )


def browser_evidence(base_url, routes, sessions, fixture_env, viewports, output_dir, timeout):
    results = []
    axe_source, axe_path = load_axe_source()
    axe_missing_reported = False
    try:
        driver = ChromeDriver(timeout=max(30, timeout))
    except Exception as error:
        return [result(
            "SYS-09-BROWSER", "missing",
            f"浏览器驱动不可用：{type(error).__name__}: {error}",
        )]
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        driver.navigate(base_url)
        for route in routes:
            if "jsonEnvelope" in route.get("checks", []):
                continue
            path, missing = resolve_path(route["path"], fixture_env)
            session_name = route.get("session", "public")
            session = sessions.get(session_name)
            if missing or (session_name != "public" and not session):
                continue
            driver.delete_all_cookies()
            for part in str((session or {}).get("cookie") or "").split(";"):
                name, separator, value = part.strip().partition("=")
                if separator and name:
                    driver.add_cookie(name, value)
            for viewport_name in route.get("viewports", []):
                viewport = viewports[viewport_name]
                driver.set_window_size(viewport["width"], viewport["height"])
                try:
                    driver.navigate(urllib.parse.urljoin(
                        base_url.rstrip("/") + "/", path.lstrip("/"),
                    ))
                except Exception as error:
                    results.append(result(
                        f"{route['id']}@{viewport_name}", "failed",
                        f"页面导航失败：{type(error).__name__}: {error}",
                    ))
                    continue
                filename = re.sub(r"[^A-Za-z0-9_.-]+", "-", f"{route['id']}-{session_name}-{viewport_name}") + ".png"
                driver.screenshot(output_dir / filename)
                fixture_scope = "components" in route.get("checks", [])
                target_min = 44 if "touchTargets" in route.get("checks", []) else 24
                audit_script = """
                    const root = document.documentElement;
                    const auditScope = __AUDIT_SCOPE__;
                    const visible = (node) => {
                      const style = getComputedStyle(node);
                      const rect = node.getBoundingClientRect();
                      return style.visibility !== 'hidden' && style.display !== 'none'
                        && rect.width > 0 && rect.height > 0;
                    };
                    const tinyTargets = [...auditScope.querySelectorAll('a,button,input,select,textarea,[role="button"]')]
                      .filter(visible)
                      .map((node) => {
                        const rect = node.getBoundingClientRect();
                        return {label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 50), width: rect.width, height: rect.height};
                      })
                      .filter((item) => item.width < __TARGET_MIN__ || item.height < __TARGET_MIN__)
                      .slice(0, 12);
                    return {
                      overflow: root.scrollWidth > root.clientWidth + 1,
                      title: document.title,
                      h1: document.querySelectorAll('h1').length,
                      main: document.querySelectorAll('main').length,
                      duplicateIds: [...new Set([...document.querySelectorAll('[id]')]
                        .map((node) => node.id)
                        .filter((id, index, all) => id && all.indexOf(id) !== index))].slice(0, 12),
                      tinyTargets,
                      readyState: document.readyState,
                      productMode: document.body.dataset.productMode || null,
                      activeNavigation: document.querySelectorAll('.product-navbar [aria-current="page"]').length,
                      privatePublicLinks: [...document.querySelectorAll('.product-navbar a[href]')]
                        .map(node => node.getAttribute('href') || '')
                        .filter(href => /^\/(student|guide|teacher|admin)(\/|\?|$)/.test(href)),
                      unauthorizedEventResources: performance.getEntriesByType('resource')
                        .map(entry => entry.name)
                        .filter(name => /\/(events|notifications\/stream)(\?|$)/.test(name)),
                      unlabeledControls: [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),select,textarea')]
                        .filter(visible)
                        .filter(node => {
                          const labels = node.labels ? [...node.labels] : [];
                          return !labels.length && !node.getAttribute('aria-label')
                            && !node.getAttribute('aria-labelledby') && !node.title;
                        })
                        .map(node => node.id || node.name || node.tagName).slice(0, 12),
                      errorRecovery: (() => {
                        const panel = document.querySelector('[data-product-error]');
                        const primary = panel && panel.querySelector('[data-error-recovery="primary"]');
                        return panel ? {
                          present: true,
                          requestId: panel.dataset.requestId,
                          label: primary && primary.textContent.trim(),
                          href: primary && primary.getAttribute('href'),
                        } : {present: false};
                      })(),
                    };
                """
                audit = driver.execute(
                    audit_script
                    .replace(
                        "__AUDIT_SCOPE__",
                        "document.querySelector('[data-component-fixture]') || document"
                        if fixture_scope else "document",
                    )
                    .replace("__TARGET_MIN__", str(target_min))
                )
                severe = [
                    entry for entry in driver.browser_logs()
                    if str(entry.get("level", "")).upper() == "SEVERE"
                    and "favicon" not in str(entry.get("message", "")).lower()
                ]
                expected_error_page = any(int(status) >= 400 for status in route.get("expected", []))
                if expected_error_page:
                    severe = [
                        entry for entry in severe
                        if not (
                            str(entry.get("source", "")).lower() == "network"
                            and path.split("?", 1)[0] in str(entry.get("message", ""))
                            and "failed to load resource" in str(entry.get("message", "")).lower()
                        )
                    ]
                failures = []
                if audit.get("overflow"):
                    failures.append("页面出现意外横向滚动")
                if not audit.get("title"):
                    failures.append("页面标题为空")
                if audit.get("h1") != 1:
                    failures.append(f"H1 数量为 {audit.get('h1')}")
                if audit.get("main") != 1:
                    failures.append(f"main 数量为 {audit.get('main')}")
                if audit.get("duplicateIds"):
                    failures.append(f"重复 DOM ID：{audit['duplicateIds']}")
                if "touchTargets" in route.get("checks", []) and audit.get("tinyTargets"):
                    failures.append(f"存在小于 {target_min}px 的可操作目标：{len(audit['tinyTargets'])} 个")
                if severe:
                    failures.append(f"浏览器严重错误：{len(severe)} 条")
                if "publicNavigation" in route.get("checks", []):
                    if audit.get("productMode") != "public":
                        failures.append("匿名页面没有使用 public 模式")
                    if audit.get("privatePublicLinks"):
                        failures.append("匿名导航暴露了私有模式入口")
                if "noUnauthorizedEvents" in route.get("checks", []) and audit.get("unauthorizedEventResources"):
                    failures.append("匿名页面建立了未授权事件连接")
                if "activeNavigation" in route.get("checks", []) and audit.get("activeNavigation") != 1:
                    failures.append(f"当前导航项数量为 {audit.get('activeNavigation')}")
                if "formLabels" in route.get("checks", []) and audit.get("unlabeledControls"):
                    failures.append(f"表单控件缺少名称：{audit['unlabeledControls']}")
                if "errorRecovery" in route.get("checks", []):
                    recovery = audit.get("errorRecovery") or {}
                    href = str(recovery.get("href") or "")
                    if not recovery.get("present") or not recovery.get("label"):
                        failures.append("错误页缺少可理解的恢复动作")
                    if not recovery.get("requestId") or recovery.get("requestId") in {"NONE", "LOCAL"}:
                        failures.append("错误页缺少有效 request ID")
                    if not href.startswith("/") or href.startswith("//"):
                        failures.append("错误页恢复动作不是安全站内路径")
                if "keyboard" in route.get("checks", []):
                    keyboard = driver.execute("""
                      const skip = document.querySelector('a[href="#main-content"]');
                      if (!skip) return {present: false, focusable: false};
                      skip.focus();
                      return {present: true, focusable: document.activeElement === skip};
                    """)
                    if not keyboard.get("present") or not keyboard.get("focusable"):
                        failures.append("skip link 无法通过键盘聚焦")

                component_audit = None
                if "components" in route.get("checks", []):
                    try:
                        component_ready = wait_for_fixture_components(driver)
                        if not component_ready.get("ready"):
                            failures.append(
                                "共享组件脚本未全部就绪："
                                + ", ".join(component_ready.get("available") or [])
                            )
                        else:
                            component_audit = component_fixture_audit(driver)
                            failures.extend(component_audit.get("failures") or [])
                    except Exception as error:
                        failures.append(f"共享组件交互验收失败：{type(error).__name__}: {error}")

                axe_result = None
                if "axe" in route.get("checks", []):
                    if not axe_source:
                        if not axe_missing_reported:
                            results.append(result(
                                "SYS-09-AXE-RUNTIME", "missing",
                                "axe-core 未安装，无法执行 WCAG 自动检查。",
                            ))
                            axe_missing_reported = True
                    else:
                        try:
                            axe_result = axe_audit(driver, axe_source)
                        except Exception as error:
                            failures.append(f"axe-core 执行失败：{type(error).__name__}: {error}")
                        else:
                            if axe_result.get("error"):
                                failures.append(f"axe-core 执行失败：{axe_result['error']}")
                            serious = [
                                item for item in axe_result.get("violations", [])
                                if item.get("impact") in {"serious", "critical"}
                            ]
                            if serious:
                                failures.append(
                                    "WCAG 严重/致命问题："
                                    + ", ".join(item["id"] for item in serious)
                                )
                results.append(result(
                    f"{route['id']}@{viewport_name}",
                    "failed" if failures else "passed",
                    "；".join(failures) if failures else "截图、结构与横向溢出检查通过。",
                    screenshot=str(output_dir / filename),
                    audit=audit,
                    componentAudit=component_audit,
                    axe=axe_result,
                    axeSource=str(axe_path) if axe_path else None,
                    severeConsole=severe[-8:],
                ))
    finally:
        driver.close()
    return results


def write_junit(path, checks):
    suite = ET.Element("testsuite", {
        "name": "玄甲 system UX",
        "tests": str(len(checks)),
        "failures": str(sum(item["state"] == "failed" for item in checks)),
        "skipped": str(sum(item["state"] == "missing" for item in checks)),
    })
    for item in checks:
        case = ET.SubElement(suite, "testcase", {"name": item["id"]})
        if item["state"] == "failed":
            ET.SubElement(case, "failure", {"message": item["message"]})
        elif item["state"] == "missing":
            ET.SubElement(case, "skipped", {"message": item["message"]})
    path.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(suite).write(path, encoding="utf-8", xml_declaration=True)


def suite_specs(level, output_dir):
    python = sys.executable
    specs = [
        {
            "id": "SYS-SUITE-PRODUCT-CONTRACTS",
            "level": "smoke",
            "requiresLive": False,
            "command": [python, "-m", "pytest", "-q", "test/test_product_contracts.py"],
        },
        {
            "id": "SYS-SUITE-DEPLOYED-CONTRACTS",
            "level": "smoke",
            "requiresLive": True,
            "command": [
                python, "-m", "pytest", "-q",
                # test_error_handler deliberately depends on test-only fault
                # injection endpoints. Production evidence asserts the inverse
                # contract in routes.json: those endpoints must return 404.
                "test/test_auth.py",
                "test/test_coursework.py", "test/test_learning_analytics.py",
                "test/test_student_experience.py",
            ],
        },
        {
            "id": "SYS-SUITE-PERFORMANCE",
            "level": "smoke",
            "requiresLive": True,
            "command": [
                python, "ops/verify-system-performance.py", "--samples", "5",
                "--output", str(output_dir / "performance.json"),
            ],
        },
        {
            "id": "SYS-SUITE-STUDENT-UX",
            "level": "full",
            "requiresLive": True,
            "command": [
                python, "ops/verify-student-ux.py", "--output-dir",
                str(output_dir / "student-ux"),
            ],
        },
        {
            "id": "SYS-SUITE-COURSE-CENTER",
            "level": "full",
            "requiresLive": True,
            "command": [
                python, "ops/verify-course-center-ui.py", "--output-dir",
                str(output_dir / "course-center"),
            ],
        },
        {
            "id": "SYS-SUITE-MANUAL-AUTHORING",
            "level": "full",
            "requiresLive": True,
            "command": [python, "ops/verify-teacher-manual-create-ui.py"],
        },
        {
            "id": "SYS-SUITE-TEACHER-AGENT-UI",
            "level": "full",
            "requiresLive": True,
            "command": [
                python, "ops/verify-teacher-agent-ui.py", "--screenshot",
                str(output_dir / "teacher-agent.png"), "--course-screenshot",
                str(output_dir / "course-center-teacher.png"),
                "--learner-screenshot", str(output_dir / "student-preview.png"),
                "--learning-analysis-screenshot",
                str(output_dir / "learning-analysis.png"),
            ],
        },
        {
            "id": "SYS-SUITE-NATURAL-LANGUAGE-LIFECYCLE",
            "level": "full",
            "requiresLive": True,
            "externalModel": True,
            "command": [
                python, "ops/verify-natural-language-teaching-lifecycle.py",
                "--output-root", str(output_dir / "natural-language"),
            ],
        },
        {
            "id": "SYS-SUITE-COMPLETE-LIFECYCLE",
            "level": "full",
            "requiresLive": True,
            "externalModel": True,
            "command": [python, "ops/verify-complete-teaching-learning-lifecycle.py"],
        },
    ]
    if level == "smoke":
        return [spec for spec in specs if spec["level"] == "smoke"]
    if level == "full":
        return specs
    return []


def suite_environment(base_url):
    environment = os.environ.copy()
    if not base_url:
        return environment
    parsed = urllib.parse.urlsplit(base_url)
    environment["DOJO_URL"] = base_url.rstrip("/")
    if parsed.hostname:
        environment["DOJO_LISTEN_ADDRESS"] = parsed.hostname
    if parsed.port:
        environment["DOJO_HTTPS_PORT"] = str(parsed.port)
    environment.setdefault("DOJO_CONTAINER", "pwncollege-dojo")
    local_ca = ROOT / "data" / "local-tls" / "ca.crt"
    if local_ca.is_file():
        environment.setdefault("REQUESTS_CA_BUNDLE", str(local_ca))
    return environment


def run_suites(level, base_url, output_dir, timeout, allow_external_model_suites=False):
    results = []
    output_dir.mkdir(parents=True, exist_ok=True)
    environment = suite_environment(base_url)
    for spec in suite_specs(level, output_dir):
        if spec.get("externalModel") and not allow_external_model_suites:
            results.append(result(
                spec["id"], "missing",
                "该套件会把隔离生成的合成测试内容发送给已配置的外部模型；"
                "仅在取得明确授权后使用 --allow-external-model-suites 运行。",
                command=spec["command"], externalModel=True,
            ))
            continue
        if spec["requiresLive"] and not base_url:
            results.append(result(
                spec["id"], "missing", "该套件需要 --base-url 实时站点。",
                command=spec["command"],
            ))
            continue
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                spec["command"], cwd=ROOT, env=environment,
                capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired as error:
            def decoded_output(value):
                if isinstance(value, bytes):
                    return value.decode("utf-8", errors="replace")
                return str(value or "")

            # ``TimeoutExpired`` may expose partial output as bytes even when
            # subprocess.run used text=True.  Always retain that evidence and
            # continue writing the structured report instead of masking the
            # original timeout with a secondary TypeError.
            log_text = decoded_output(error.stdout) + "\n" + decoded_output(error.stderr)
            state = "failed"
            message = f"套件超过 {timeout} 秒上限。"
            return_code = None
        except OSError as error:
            log_text = str(error)
            state = "missing"
            message = f"套件无法启动：{error}"
            return_code = None
        else:
            log_text = completed.stdout + "\n" + completed.stderr
            state = "passed" if completed.returncode == 0 else "failed"
            message = "套件通过。" if state == "passed" else f"套件退出码为 {completed.returncode}。"
            return_code = completed.returncode
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        log_path = output_dir / f"{spec['id'].lower()}.log"
        log_path.write_text(log_text, encoding="utf-8", errors="replace")
        results.append(result(
            spec["id"], state, message,
            durationMs=duration_ms, returnCode=return_code,
            command=spec["command"], log=str(log_path),
        ))
    return results


def aggregate_live_checks(checks, manifest, selected_routes, screenshots_requested):
    results = []
    by_id = {item["id"]: item for item in checks}
    selected_ids = {route["id"] for route in selected_routes}
    all_ids = {route["id"] for route in manifest["routes"]}
    full_route_run = selected_ids == all_ids

    crawl_routes = [
        route for route in manifest["routes"] if "crawlLinks" in route.get("checks", [])
    ]
    crawl_evidence = [by_id.get(route["id"]) for route in crawl_routes]
    if not full_route_run or not crawl_routes or any(item is None for item in crawl_evidence):
        results.append(result(
            "SYS-01-LIVE-LINK-CRAWL", "missing",
            "全站链接验收需要执行未筛选的实时 route manifest。",
        ))
    else:
        failures = [item for item in crawl_evidence if item["state"] != "passed"]
        checked = sum((item.get("linkCrawl") or {}).get("checked", 0) for item in crawl_evidence)
        results.append(result(
            "SYS-01-LIVE-LINK-CRAWL",
            "failed" if failures or checked == 0 else "passed",
            f"{len(crawl_routes)} 个模式入口共核验 {checked} 个可见站内链接。"
            if not failures and checked else "可见站内链接存在失败或未产生有效样本。",
            checkedLinks=checked,
            failedRoots=[item["id"] for item in failures],
        ))

    metadata_routes = [
        route for route in manifest["routes"]
        if "metadata" in route.get("checks", [])
    ]
    metadata_http = [by_id.get(route["id"]) for route in metadata_routes]
    metadata_browser_ids = [
        f"{route['id']}@{viewport}"
        for route in metadata_routes for viewport in route.get("viewports", [])
    ]
    metadata_browser = [by_id.get(check_id) for check_id in metadata_browser_ids]
    if not full_route_run or not screenshots_requested or any(item is None for item in metadata_http + metadata_browser):
        results.append(result(
            "SYS-02-LIVE-METADATA", "missing",
            "页面 metadata 验收需要完整路由与浏览器矩阵。",
        ))
    else:
        failures = [item for item in metadata_http + metadata_browser if item["state"] != "passed"]
        results.append(result(
            "SYS-02-LIVE-METADATA",
            "failed" if failures else "passed",
            f"{len(metadata_routes)} 个页面、{len(metadata_browser_ids)} 个浏览器场景的 title/H1/main/ID/skip link 均通过。"
            if not failures else f"metadata 失败场景：{', '.join(item['id'] for item in failures[:12])}",
        ))

    axe_routes = [route for route in manifest["routes"] if "axe" in route.get("checks", [])]
    axe_ids = [
        f"{route['id']}@{viewport}"
        for route in axe_routes for viewport in route.get("viewports", [])
    ]
    axe_checks = [by_id.get(check_id) for check_id in axe_ids]
    axe_modes = {route["mode"] for route in axe_routes}
    if not full_route_run or not screenshots_requested or any(item is None for item in axe_checks) or axe_modes != {"public", "learning", "teaching", "admin"}:
        results.append(result(
            "SYS-09-LIVE-ACCESSIBILITY", "missing",
            "axe 门禁需要公共、学习、教学和管理四模式的完整浏览器样本。",
            coveredModes=sorted(axe_modes),
        ))
    else:
        failures = [item for item in axe_checks if item["state"] != "passed" or item.get("axe") is None]
        results.append(result(
            "SYS-09-LIVE-ACCESSIBILITY",
            "failed" if failures else "passed",
            f"四模式 {len(axe_checks)} 个 axe 场景无 serious/critical。"
            if not failures else f"无障碍失败场景：{', '.join(item['id'] for item in failures[:12])}",
            coveredModes=sorted(axe_modes),
        ))

    browser_checks = [
        item for item in checks
        if "@" in item["id"] and item["id"].split("@", 1)[0] in all_ids
    ]
    covered_viewports = {
        item["id"].rsplit("@", 1)[1] for item in browser_checks
        if item["state"] == "passed"
    }
    viewport_failures = [item for item in browser_checks if item["state"] != "passed"]
    required_viewports = set(manifest["viewports"])
    if not full_route_run or not screenshots_requested:
        results.append(result(
            "SYS-10-LIVE-VIEWPORTS", "missing",
            "五档视口验收需要完整浏览器矩阵。",
        ))
    else:
        missing_viewports = sorted(required_viewports - covered_viewports)
        results.append(result(
            "SYS-10-LIVE-VIEWPORTS",
            "failed" if viewport_failures or missing_viewports else "passed",
            f"{len(browser_checks)} 个场景覆盖 360/390/768/1024/1440，均无意外溢出或结构失败。"
            if not viewport_failures and not missing_viewports
            else f"失败场景 {len(viewport_failures)}；缺少视口 {missing_viewports}。",
            coveredViewports=sorted(covered_viewports),
        ))
    return results


def evaluate_acceptance(acceptance, manifest, checks):
    by_id = {item["id"]: item for item in checks}
    routes = {route["id"]: route for route in manifest["routes"]}
    results = []
    for acceptance_id, specification in acceptance["items"].items():
        evidence_results = []
        for reference in specification["evidence"]:
            kind, separator, value = str(reference).partition(":")
            if not separator or kind not in {"route", "browser", "check"}:
                evidence_results.append({"reference": reference, "state": "failed", "message": "证据引用格式无效"})
                continue
            if kind in {"route", "check"}:
                item = by_id.get(value)
                evidence_results.append({
                    "reference": reference,
                    "state": item["state"] if item else "missing",
                    "message": item["message"] if item else "未执行",
                })
                continue
            route = routes.get(value)
            if route is None:
                evidence_results.append({"reference": reference, "state": "failed", "message": "route 不存在"})
                continue
            browser_ids = [f"{value}@{viewport}" for viewport in route.get("viewports", [])]
            browser_items = [by_id.get(check_id) for check_id in browser_ids]
            if not browser_ids or any(item is None for item in browser_items):
                state = "missing"
            elif any(item["state"] == "failed" for item in browser_items):
                state = "failed"
            elif any(item["state"] == "missing" for item in browser_items):
                state = "missing"
            else:
                state = "passed"
            evidence_results.append({
                "reference": reference,
                "state": state,
                "message": f"{len(browser_ids)} 个配置视口",
            })
        states = {item["state"] for item in evidence_results}
        state = "failed" if "failed" in states else "missing" if "missing" in states else "passed"
        blockers = [item["reference"] for item in evidence_results if item["state"] != "passed"]
        results.append(result(
            f"ACCEPTANCE::{acceptance_id}",
            state,
            specification["assertion"] if state == "passed" else f"未满足证据：{', '.join(blockers)}",
            acceptanceId=acceptance_id,
            assertion=specification["assertion"],
            evidence=evidence_results,
        ))
    return results


def main():
    parser = argparse.ArgumentParser(description="验证玄甲全系统 UX 开发方案的可执行证据。")
    parser.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--acceptance", type=pathlib.Path, default=DEFAULT_ACCEPTANCE)
    parser.add_argument("--base-url", default=os.getenv("DOJO_URL"))
    parser.add_argument("--sessions", type=pathlib.Path, help="角色会话 JSON；键为 student/teacher/admin，值含 cookie。")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--junit", type=pathlib.Path)
    parser.add_argument("--screenshots", type=pathlib.Path)
    parser.add_argument(
        "--route-id", action="append", dest="route_ids",
        help="仅执行指定 route ID 的实时与浏览器检查；可重复传入，静态清单仍完整校验。",
    )
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument(
        "--provision-fixtures", action="store_true",
        help="为实时验收创建可回收的学生/教师会话、课程上下文与作业数据。",
    )
    parser.add_argument(
        "--suite-level", choices=("none", "smoke", "full"), default="none",
        help="smoke 运行契约/性能回归；full 进一步运行学生、教师与完整生命周期套件。",
    )
    parser.add_argument(
        "--suite-timeout", type=int, default=14400,
        help="每个既有验收套件的最长运行秒数。",
    )
    parser.add_argument(
        "--allow-external-model-suites", action="store_true",
        help=(
            "明确允许完整验收把隔离生成的合成测试内容发送给已配置的外部模型。"
            "不启用时，其他 full 套件照常运行，两个真实模型生命周期套件记为缺失。"
        ),
    )
    parser.add_argument("--allow-missing", action="store_true", help="仅用于局部开发；缺失证据仍会写入报告。")
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    acceptance = load_acceptance(args.acceptance)
    checks = static_checks(manifest, acceptance)
    selected_routes = manifest["routes"]
    if args.route_ids:
        requested_route_ids = set(args.route_ids)
        selected_routes = [
            route for route in manifest["routes"]
            if route.get("id") in requested_route_ids
        ]
        unknown_route_ids = sorted(
            requested_route_ids - {route.get("id") for route in selected_routes}
        )
        if unknown_route_ids:
            checks.append(result(
                "SYS-00-ROUTE-SELECTION", "failed",
                f"未知 route ID：{', '.join(unknown_route_ids)}",
            ))
    sessions = load_sessions(args.sessions)
    fixture_env = {key: os.getenv(env_name) for key, env_name in manifest["fixtures"].items()}
    fixture_provider = None
    if args.provision_fixtures:
        if not args.base_url:
            checks.append(result(
                "SYS-FIXTURE-PROVISION", "missing",
                "--provision-fixtures 需要同时提供 --base-url。",
            ))
        else:
            fixture_provider = SystemUXFixtures(args.base_url)
            try:
                provisioned_sessions, provisioned_env = fixture_provider.setup()
            except Exception as error:
                checks.append(result(
                    "SYS-FIXTURE-PROVISION", "failed",
                    f"角色与动态数据创建失败：{type(error).__name__}: {error}",
                ))
            else:
                for role, value in provisioned_sessions.items():
                    sessions.setdefault(role, value)
                for key, value in provisioned_env.items():
                    if not fixture_env.get(key):
                        fixture_env[key] = value
                checks.append(result(
                    "SYS-FIXTURE-PROVISION", "passed",
                    "已创建隔离学生、普通教师、管理员会话及可发布作业；凭据未写入报告。",
                    fixtureKinds=sorted(provisioned_env),
                ))

    try:
        if args.base_url:
            checks.extend(
                request_route(args.base_url, route, sessions, fixture_env, args.timeout)
                for route in selected_routes
            )
            if args.screenshots:
                checks.extend(browser_evidence(
                    args.base_url,
                    selected_routes,
                    sessions,
                    fixture_env,
                    manifest["viewports"],
                    args.screenshots,
                    args.timeout,
                ))
        else:
            checks.append(result("SYS-LIVE-EVIDENCE", "missing", "未提供 --base-url，未执行实时路由和浏览器验收。"))

        if args.suite_level != "none":
            checks.extend(run_suites(
                args.suite_level, args.base_url,
                args.output.parent / "suite-evidence", args.suite_timeout,
                args.allow_external_model_suites,
            ))
        checks.extend(aggregate_live_checks(
            checks, manifest, selected_routes, bool(args.screenshots),
        ))
    finally:
        if fixture_provider is not None:
            messages = fixture_provider.cleanup()
            failed_cleanup = any("失败" in message for message in messages)
            checks.append(result(
                "SYS-FIXTURE-CLEANUP",
                "failed" if failed_cleanup else "passed",
                "；".join(messages) if messages else "无临时数据需要清理。",
            ))

    acceptance_checks = evaluate_acceptance(acceptance, manifest, checks)
    checks.extend(acceptance_checks)

    counts = {state: sum(item["state"] == state for item in checks) for state in ("passed", "failed", "missing")}
    acceptance_counts = {
        state: sum(item["state"] == state for item in acceptance_checks)
        for state in ("passed", "failed", "missing")
    }
    report = {
        "contractVersion": manifest["contractVersion"],
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "complete": counts["failed"] == 0 and counts["missing"] == 0 and acceptance_counts["passed"] == 90,
        "counts": counts,
        "acceptance": {"total": len(acceptance_checks), "counts": acceptance_counts},
        "checks": checks,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.junit:
        write_junit(args.junit, checks)
    print(json.dumps({"complete": report["complete"], "counts": counts, "output": str(args.output)}, ensure_ascii=False))
    if counts["failed"] or (counts["missing"] and not args.allow_missing):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

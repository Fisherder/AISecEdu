#!/usr/bin/env python3
"""Headless-browser smoke test for the global teaching Agent UI."""

from __future__ import annotations

import argparse
import base64
import html
import importlib.util
import json
import pathlib
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.parse
from typing import Any

import requests


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
VERIFIER_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
WEBDRIVER_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"


def load_verifier_module():
    spec = importlib.util.spec_from_file_location("teacher_agent_flow", VERIFIER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load teacher Agent verifier")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ChromeDriver:
    def __init__(self, port: int = 9515):
        self.origin = f"http://127.0.0.1:{port}"
        self.profile = tempfile.TemporaryDirectory(prefix="aisecedu-agent-ui-")
        self.process = subprocess.Popen(
            ["/usr/bin/chromedriver", f"--port={port}", "--allowed-ips="],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.session_id: str | None = None
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                if requests.get(f"{self.origin}/status", timeout=1).ok:
                    break
            except requests.RequestException:
                time.sleep(0.2)
        else:
            raise RuntimeError("ChromeDriver did not start")

        try:
            value = self.request(
                "POST",
                "/session",
                {
                    "capabilities": {
                        "alwaysMatch": {
                            "browserName": "chrome",
                            "acceptInsecureCerts": True,
                            "goog:loggingPrefs": {"browser": "ALL"},
                            "goog:chromeOptions": {
                                "binary": "/usr/bin/chromium-browser",
                                "args": [
                                    "--headless=new",
                                    "--no-sandbox",
                                    "--disable-dev-shm-usage",
                                    "--disable-gpu",
                                    "--ignore-certificate-errors",
                                    # The verifier targets the local deployment.  Do not
                                    # inherit a developer-machine HTTP(S) proxy, otherwise
                                    # Chromium can send the private deployment address to
                                    # that proxy while the API verifier succeeds by direct
                                    # connection.
                                    "--no-proxy-server",
                                    f"--user-data-dir={self.profile.name}",
                                    "--window-size=1440,1000",
                                ],
                            },
                        }
                    }
                },
            )
        except Exception:
            self.close()
            raise
        self.session_id = str(value.get("sessionId") or "")
        if not self.session_id:
            raise RuntimeError("ChromeDriver returned no browser session")

    def request(self, method: str, path: str, body: dict[str, Any] | None = None):
        response = requests.request(
            method,
            f"{self.origin}{path}",
            json=body,
            timeout=30,
        )
        payload = response.json()
        value = payload.get("value")
        if response.status_code >= 400 or (
            isinstance(value, dict) and value.get("error")
        ):
            raise RuntimeError(f"WebDriver {method} {path} failed: {value}")
        return value

    def navigate(self, url: str) -> None:
        assert self.session_id
        self.request("POST", f"/session/{self.session_id}/url", {"url": url})

    def add_cookie(self, name: str, value: str) -> None:
        assert self.session_id
        self.request(
            "POST",
            f"/session/{self.session_id}/cookie",
            {"cookie": {"name": name, "value": value, "path": "/", "secure": True}},
        )

    def set_window_size(self, width: int, height: int) -> None:
        assert self.session_id
        self.request(
            "POST",
            f"/session/{self.session_id}/window/rect",
            {"width": width, "height": height},
        )

    def send_file(self, selector: str, path: pathlib.Path) -> None:
        assert self.session_id
        value = self.request(
            "POST",
            f"/session/{self.session_id}/element",
            {"using": "css selector", "value": selector},
        )
        element_id = (
            value.get(WEBDRIVER_ELEMENT_KEY) if isinstance(value, dict) else None
        )
        if not element_id:
            raise RuntimeError(f"WebDriver could not find file input {selector}")
        absolute = str(path.resolve())
        self.request(
            "POST",
            f"/session/{self.session_id}/element/{element_id}/value",
            {"text": absolute, "value": [absolute]},
        )

    def screenshot(self, path: pathlib.Path) -> None:
        assert self.session_id
        encoded = self.request("GET", f"/session/{self.session_id}/screenshot")
        path.write_bytes(base64.b64decode(encoded))

    def execute(self, script: str):
        assert self.session_id
        return self.request(
            "POST",
            f"/session/{self.session_id}/execute/sync",
            {"script": script, "args": []},
        )

    def browser_logs(self) -> list[dict[str, Any]]:
        assert self.session_id
        value = self.request(
            "POST",
            f"/session/{self.session_id}/se/log",
            {"type": "browser"},
        )
        return value if isinstance(value, list) else []

    def wait_for(self, script: str, *, timeout: int = 60, label: str):
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            last = self.execute(script)
            if last:
                return last
            time.sleep(0.5)
        try:
            messages = [
                str(entry.get("message", ""))
                for entry in self.browser_logs()
                if str(entry.get("level", "")).upper() in {"SEVERE", "WARNING"}
            ]
        except Exception as error:
            messages = [f"unable to read browser console: {error}"]
        console = " | ".join(messages[-8:]) or "no warning/error console entries"
        raise RuntimeError(
            f"browser timeout waiting for {label}; last={last!r}; console={console}"
        )

    def close(self) -> None:
        if self.session_id:
            try:
                self.request("DELETE", f"/session/{self.session_id}")
            except Exception:
                pass
            self.session_id = None
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.profile.cleanup()


def build_large_course_pdf() -> bytes:
    """Build a valid, harmless PDF larger than Nginx's former 1 MiB limit."""

    padding = b"course material regression payload.\n" * 42000
    content = (
        b"BT /F1 18 Tf 72 760 Td (PDF course material upload) Tj "
        b"0 -30 Td /F1 12 Tf (Network security, least privilege, and practice.) Tj ET"
    )
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
        ),
        b"<< /Length "
        + str(len(content)).encode()
        + b" >>\nstream\n"
        + content
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(padding)).encode()
        + b" >>\nstream\n"
        + padding
        + b"endstream",
    ]
    document = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, body in enumerate(objects, 1):
        offsets.append(len(document))
        document.extend(f"{index} 0 obj\n".encode())
        document.extend(body)
        document.extend(b"\nendobj\n")
    xref = len(document)
    document.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    document.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode())
    document.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n".encode()
    )
    if len(document) <= 1024 * 1024:
        raise RuntimeError("PDF regression fixture must exceed 1 MiB")
    return bytes(document)


def prepare_imperative_suggestion_fixture(verifier, module) -> int:
    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("suggestion fixture requires an active Agent conversation")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    owner_id = int(context["user"]["id"])

    metadata = json.dumps(
        {
            "presentation": "answer",
            "suggestions": [
                "可继续生成配套的随堂检测题或实验操作单。",
                "我也可以把该 HTML 内容整理为 DOCX 教案版本。",
                "帮我完成这项后续操作：可继续生成课堂练习。",
                "后续内容还能更丰富。",
            ],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )

    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    sql = f"""
    WITH user_inserted AS (
      INSERT INTO teaching_agent_messages (thread_id, user_id, role, content, metadata, created)
      VALUES ({literal(verifier.thread_id)}, {owner_id}, 'user',
        '用户头像位置浏览器回归', '{{}}'::jsonb, NOW() - INTERVAL '1 second')
      RETURNING id
    ), inserted AS (
      INSERT INTO teaching_agent_messages (thread_id, user_id, role, content, metadata, created)
      SELECT {literal(verifier.thread_id)}, {owner_id}, 'assistant',
        '后续命令祈使句浏览器回归', {literal(metadata)}::jsonb, NOW()
      FROM user_inserted
      RETURNING id
    ), touched AS (
      UPDATE teaching_agent_threads SET updated = NOW()
      WHERE id = {literal(verifier.thread_id)}
      RETURNING id
    )
    SELECT inserted.id FROM inserted;
    """
    completed = subprocess.run(
        ["docker", "exec", "-i", module.CONTAINER, "dojo", "db", "-qAt"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "unable to create imperative suggestion browser fixture: "
            + completed.stderr.strip()
        )
    try:
        return int(completed.stdout.strip())
    except ValueError as error:
        raise RuntimeError(
            f"imperative suggestion fixture returned no message id: {completed.stdout!r}"
        ) from error


def prepare_approval_tray_fixture(
    verifier,
    module,
    *,
    fixture_id: str = "approval-tray-regression",
    fixture_name: str = "批准托盘回归章节",
) -> int:
    """Create one harmless R3 proposal for composer UI verification."""

    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("approval fixture requires an active Agent conversation")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    owner_id = int(context["user"]["id"])
    metadata = json.dumps(
        {
            "pending": False,
            "presentation": "answer",
            "toolProposals": [
                {
                    "tool": "module.create",
                    "arguments": {
                        "id": fixture_id,
                        "name": fixture_name,
                    },
                    "reason": "在当前课程中创建一个用于批准交互验收的章节。",
                    "requiresConfirmation": True,
                }
            ],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )

    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    sql = f"""
    WITH inserted AS (
      INSERT INTO teaching_agent_messages (thread_id, user_id, role, content, metadata, created)
      VALUES ({literal(verifier.thread_id)}, {owner_id}, 'assistant',
        '需要教师批准后才能执行课程变更。', {literal(metadata)}::jsonb, NOW())
      RETURNING id
    ), touched AS (
      UPDATE teaching_agent_threads SET updated = NOW()
      WHERE id = {literal(verifier.thread_id)}
      RETURNING id
    )
    SELECT inserted.id FROM inserted;
    """
    completed = subprocess.run(
        ["docker", "exec", "-i", module.CONTAINER, "dojo", "db", "-qAt"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "unable to create approval tray browser fixture: "
            + completed.stderr.strip()
        )
    try:
        return int(completed.stdout.strip())
    except ValueError as error:
        raise RuntimeError(
            f"approval tray fixture returned no message id: {completed.stdout!r}"
        ) from error


def prepare_retry_feedback_fixture(verifier, module) -> str:
    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("retry fixture requires an active Agent conversation")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    owner_id = int(context["user"]["id"])
    suffix = verifier.suffix
    job_id = f"job_retry_ui_{suffix}"

    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    metadata = json.dumps(
        {
            "pending": False,
            "presentation": "error",
            "jobId": job_id,
            "jobKind": "agent.chat",
            "jobStatus": "FAILED",
            "failed": True,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    state = json.dumps(
        {
            "status": "FAILED",
            "stage": "failed",
            "progress": 64,
            "kind": "agent.chat",
            "failureMessage": "生成结果未通过可用性检查。",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    sql = f"""
    WITH inserted_job AS (
      INSERT INTO teaching_jobs
        (id, owner_id, thread_id, kind, status, stage, progress, priority,
         idempotency_key, trace_id, payload, result, attempt_count, max_attempts,
         error, created, updated, completed)
      VALUES
        ({literal(job_id)}, {owner_id}, {literal(verifier.thread_id)}, 'agent.chat',
         'FAILED', 'failed', 64, 100, {literal("retry-ui-" + suffix)},
         {literal("retry-ui-" + suffix)}, '{{"prompt":"retry feedback"}}'::jsonb,
         '{{}}'::jsonb, 1, 1, 'validation failed', NOW(), NOW(), NOW())
      RETURNING id
    ), inserted_message AS (
      INSERT INTO teaching_agent_messages
        (thread_id, user_id, role, content, metadata, created)
      SELECT {literal(verifier.thread_id)}, {owner_id}, 'assistant',
        '这项任务未完成：生成结果未通过可用性检查。',
        {literal(metadata)}::jsonb, NOW()
      FROM inserted_job
      RETURNING id
    ), inserted_card AS (
      INSERT INTO conversation_cards
        (id, message_id, card_type, object_type, object_id, state, actions, created, updated)
      SELECT {literal("card_retry_ui_" + suffix)}, id, 'job', 'job',
        {literal(job_id)}, {literal(state)}::jsonb, '["open","retry"]'::jsonb,
        NOW(), NOW()
      FROM inserted_message
      RETURNING id
    ), touched AS (
      UPDATE teaching_agent_threads SET updated = NOW()
      WHERE id = {literal(verifier.thread_id)}
      RETURNING id
    )
    SELECT id FROM inserted_job;
    """
    completed = subprocess.run(
        ["docker", "exec", "-i", module.CONTAINER, "dojo", "db", "-qAt"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0 or completed.stdout.strip() != job_id:
        raise RuntimeError(
            "unable to create retry feedback fixture: "
            + (completed.stderr.strip() or repr(completed.stdout))
        )
    return job_id


def prepare_cancel_feedback_fixture(verifier, module) -> str:
    """Create a queued UI task without an outbox so cancellation is deterministic."""

    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("cancel fixture requires an active Agent conversation")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    owner_id = int(context["user"]["id"])
    suffix = verifier.suffix
    job_id = f"job_cancel_ui_{suffix}"

    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    metadata = json.dumps(
        {
            "pending": True,
            "presentation": "activity",
            "jobId": job_id,
            "jobKind": "agent.chat",
            "jobStatus": "QUEUED",
            "failed": False,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    state = json.dumps(
        {
            "status": "QUEUED",
            "stage": "queued",
            "progress": 0,
            "kind": "agent.chat",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    sql = f"""
    WITH inserted_job AS (
      INSERT INTO teaching_jobs
        (id, owner_id, thread_id, kind, status, stage, progress, priority,
         idempotency_key, trace_id, payload, result, attempt_count, max_attempts,
         created, updated)
      VALUES
        ({literal(job_id)}, {owner_id}, {literal(verifier.thread_id)}, 'agent.chat',
         'QUEUED', 'queued', 0, 100, {literal("cancel-ui-" + suffix)},
         {literal("cancel-ui-" + suffix)}, '{{"prompt":"cancel feedback"}}'::jsonb,
         '{{}}'::jsonb, 0, 1, NOW(), NOW())
      RETURNING id
    ), inserted_message AS (
      INSERT INTO teaching_agent_messages
        (thread_id, user_id, role, content, metadata, created)
      SELECT {literal(verifier.thread_id)}, {owner_id}, 'assistant',
        '正在处理取消状态浏览器回归。',
        {literal(metadata)}::jsonb, NOW()
      FROM inserted_job
      RETURNING id
    ), inserted_card AS (
      INSERT INTO conversation_cards
        (id, message_id, card_type, object_type, object_id, state, actions, created, updated)
      SELECT {literal("card_cancel_ui_" + suffix)}, id, 'job', 'job',
        {literal(job_id)}, {literal(state)}::jsonb, '["open","cancel"]'::jsonb,
        NOW(), NOW()
      FROM inserted_message
      RETURNING id
    ), touched AS (
      UPDATE teaching_agent_threads SET updated = NOW()
      WHERE id = {literal(verifier.thread_id)}
      RETURNING id
    )
    SELECT id FROM inserted_job;
    """
    completed = subprocess.run(
        ["docker", "exec", "-i", module.CONTAINER, "dojo", "db", "-qAt"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0 or completed.stdout.strip() != job_id:
        raise RuntimeError(
            "unable to create cancel feedback fixture: "
            + (completed.stderr.strip() or repr(completed.stdout))
        )
    return job_id


def prepare_legacy_retry_chain_fixture(verifier, module) -> tuple[str, str]:
    """Create the duplicate-message shape emitted by the former retry flow."""

    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("legacy retry fixture requires an active Agent conversation")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    owner_id = int(context["user"]["id"])
    course = next(
        (item for item in context.get("teacherDojos") or [] if item.get("modules")),
        None,
    )
    if course is None:
        raise RuntimeError("legacy retry fixture requires a course chapter")
    dojo_id = int(course["id"])
    module_index = int(course["modules"][0]["index"])
    suffix = verifier.suffix
    root_id = f"job_retry_root_{suffix}"
    duplicate_id = f"job_retry_clone_{suffix}"
    legacy_id = f"author_retry_{suffix}"
    title = f"旧版重试原位替换验收 {suffix}"

    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    root_payload = json.dumps(
        {"title": title, "legacyJobId": f"author_missing_{suffix}"},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    duplicate_payload = json.dumps(
        {
            "title": title,
            "legacyJobId": legacy_id,
            "manualRetry": True,
            "retryOfJobId": root_id,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    steps = json.dumps(
        [
            {
                "id": "analyze",
                "label": "解析题目目标",
                "status": "FAILED",
                "message": "旧重试记录",
            }
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )

    def metadata(job_id: str) -> str:
        return json.dumps(
            {
                "pending": False,
                "presentation": "error",
                "jobId": job_id,
                "jobKind": "learning.authoring",
                "jobStatus": "FAILED",
                "failed": True,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    def state(job_id: str) -> str:
        return json.dumps(
            {
                "status": "FAILED",
                "stage": "failed",
                "progress": 82,
                "kind": "learning.authoring",
                "title": title,
                "jobId": job_id,
                "failureMessage": "生成结果未通过可用性检查。",
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    sql = f"""
    INSERT INTO learning_authoring_jobs
      (id, dojo_id, module_index, author_id, kind, status, stage, progress,
       title, request, steps, error, created, updated, completed)
    VALUES
      ({literal(legacy_id)}, {dojo_id}, {module_index}, {owner_id}, 'CREATE',
       'FAILED', 'failed', 82, {literal(title)}, '{{}}'::jsonb,
       {literal(steps)}::jsonb, 'legacy retry fixture', NOW(), NOW(), NOW());

    INSERT INTO teaching_jobs
      (id, owner_id, dojo_id, module_index, thread_id, kind, status, stage,
       progress, priority, idempotency_key, trace_id, payload, result,
       attempt_count, max_attempts, error, created, updated, completed)
    VALUES
      ({literal(root_id)}, {owner_id}, {dojo_id}, {module_index},
       {literal(verifier.thread_id)}, 'learning.authoring', 'FAILED', 'failed',
       82, 100, {literal('retry-root-' + suffix)}, {literal('retry-root-' + suffix)},
       {literal(root_payload)}::jsonb, '{{}}'::jsonb, 1, 1,
       'validation failed', NOW() - INTERVAL '2 minutes',
       NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '2 minutes'),
      ({literal(duplicate_id)}, {owner_id}, {dojo_id}, {module_index},
       {literal(verifier.thread_id)}, 'learning.authoring', 'FAILED', 'failed',
       82, 100, {literal('retry-clone-' + suffix)}, {literal('retry-clone-' + suffix)},
       {literal(duplicate_payload)}::jsonb, '{{}}'::jsonb, 1, 1,
       'validation failed', NOW() - INTERVAL '1 minute',
       NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute');

    WITH root_message AS (
      INSERT INTO teaching_agent_messages
        (thread_id, user_id, role, content, metadata, created)
      VALUES
        ({literal(verifier.thread_id)}, {owner_id}, 'assistant',
         '旧版失败结果', {literal(metadata(root_id))}::jsonb,
         NOW() - INTERVAL '2 minutes')
      RETURNING id
    )
    INSERT INTO conversation_cards
      (id, message_id, card_type, object_type, object_id, state, actions,
       created, updated)
    SELECT {literal('card_retry_root_' + suffix)}, id, 'job', 'job',
      {literal(root_id)}, {literal(state(root_id))}::jsonb,
      '["open","retry"]'::jsonb, NOW() - INTERVAL '2 minutes',
      NOW() - INTERVAL '2 minutes'
    FROM root_message;

    WITH clone_message AS (
      INSERT INTO teaching_agent_messages
        (thread_id, user_id, role, content, metadata, created)
      VALUES
        ({literal(verifier.thread_id)}, {owner_id}, 'assistant',
         '已建立失败任务的人工重试。',
         {literal(metadata(duplicate_id))}::jsonb, NOW() - INTERVAL '1 minute')
      RETURNING id
    )
    INSERT INTO conversation_cards
      (id, message_id, card_type, object_type, object_id, state, actions,
       created, updated)
    SELECT {literal('card_retry_clone_' + suffix)}, id, 'job', 'job',
      {literal(duplicate_id)}, {literal(state(duplicate_id))}::jsonb,
      '["open","retry"]'::jsonb, NOW() - INTERVAL '1 minute',
      NOW() - INTERVAL '1 minute'
    FROM clone_message;

    UPDATE teaching_agent_threads SET updated = NOW()
    WHERE id = {literal(verifier.thread_id)};
    """
    completed = subprocess.run(
        ["docker", "exec", "-i", module.CONTAINER, "dojo", "db", "-qAt"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "unable to create legacy retry fixture: " + completed.stderr.strip()
        )
    return root_id, duplicate_id


def prepare_generation_option_fixture(verifier, module) -> int:
    """Create a deterministic long-option message without invoking a model."""

    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("generation-option fixture requires an Agent conversation")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    owner_id = int(context["user"]["id"])
    options = []
    rows = (
        (
            "概念递进",
            "从缓冲区布局进入控制流劫持原理，再用逐步检查帮助学生建立稳定的知识结构。",
            ["原理图与调用栈逐层对应", "每个阶段都有课堂理解检查"],
        ),
        (
            "案例驱动",
            "用一个经过授权的漏洞案例贯穿现象、定位、利用、修复与回归验证，强调证据链。",
            ["同一案例贯穿完整课堂", "攻击与防御证据可对照复盘"],
        ),
        (
            "任务挑战",
            "把课程组织成连续挑战，让学生通过预测、调试、构造输入和验证修复主动完成学习。",
            ["连续任务推动主动学习", "学生动作与完成标准清晰"],
        ),
    )
    for index, (title, description, highlights) in enumerate(rows, 1):
        prompt = (
            f"请按{title}方案生成一份可直接授课的缓冲区溢出安全课件。"
            "面向具备基础 C 语言知识的学生，完整覆盖学习目标、内存布局、栈帧、"
            "边界检查、授权环境中的漏洞复现、动态 Flag 获取、修复方案、回归验证、"
            "课堂提问、学生操作、教师提示和学习评价。每一页都必须有完整可见正文，"
            "不得只输出目录、占位符或空白页面；明确预计用时、输入输出、成功标准和"
            "安全边界，并保证内容在离线教学环境中可以执行。"
        )
        options.append(
            {
                "id": f"option-{index}",
                "title": title,
                "description": description,
                "highlights": highlights,
                "rewrittenPrompt": prompt,
            }
        )
    metadata = json.dumps(
        {
            "presentation": "answer",
            "pending": False,
            "toolProposals": [],
            "generationOptions": {
                "targetTool": "candidate.generate",
                "artifactType": "slide-deck",
                "reason": "浏览器候选方案回归",
                "baseArguments": {},
                "options": options,
            },
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )

    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    sql = f"""
    WITH inserted AS (
      INSERT INTO teaching_agent_messages (thread_id, user_id, role, content, metadata, created)
      VALUES ({literal(verifier.thread_id)}, {owner_id}, 'assistant',
        '我整理了三种不同的授课路径，请选择最符合本次课堂的一套。',
        {literal(metadata)}::jsonb, NOW() - INTERVAL '2 seconds')
      RETURNING id
    ), following_user AS (
      INSERT INTO teaching_agent_messages (thread_id, user_id, role, content, metadata, created)
      SELECT {literal(verifier.thread_id)}, {owner_id}, 'user',
        '候选方案之后的对话内容不能被遮挡。', '{{}}'::jsonb,
        NOW() - INTERVAL '1 second' FROM inserted
      RETURNING id
    ), following_assistant AS (
      INSERT INTO teaching_agent_messages (thread_id, user_id, role, content, metadata, created)
      SELECT {literal(verifier.thread_id)}, {owner_id}, 'assistant',
        '这是一条位于候选方案之后的可见消息。',
        '{{"presentation":"answer"}}'::jsonb, NOW() FROM following_user
      RETURNING id
    ), touched AS (
      UPDATE teaching_agent_threads SET updated = NOW()
      WHERE id = {literal(verifier.thread_id)}
      RETURNING id
    )
    SELECT inserted.id FROM inserted, following_assistant;
    """
    completed = subprocess.run(
        ["docker", "exec", "-i", module.CONTAINER, "dojo", "db", "-qAt"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "unable to create generation-option browser fixture: "
            + completed.stderr.strip()
        )
    try:
        return int(completed.stdout.strip())
    except ValueError as error:
        raise RuntimeError(
            f"generation-option fixture returned no message id: {completed.stdout!r}"
        ) from error


def verify_generation_option_picker(module, screenshot: pathlib.Path | None) -> None:
    """Verify one-plan-at-a-time rendering, switching and normal document flow."""

    verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
    driver = None
    try:
        verifier.setup()
        message_id = prepare_generation_option_fixture(verifier, module)
        driver = ChromeDriver()
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        layout = driver.wait_for(
            f"""
            const picker = document.querySelector(
              '[data-generation-option-picker-message="{message_id}"]'
            );
            if (!picker) return null;
            picker.scrollIntoView({{block: 'center'}});
            const message = picker.closest('.teaching-message');
            const messages = Array.from(document.querySelectorAll('.teaching-message'));
            const next = messages[messages.indexOf(message) + 1];
            const panels = Array.from(picker.querySelectorAll('[data-generation-option-panel]'));
            const visible = panels.filter(node => !node.hidden && getComputedStyle(node).display !== 'none');
            const rect = picker.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();
            const nextRect = next?.getBoundingClientRect();
            const list = picker.querySelector('.teaching-generation-option-list');
            return {{
              panels: panels.length,
              visiblePanels: visible.length,
              activeTitle: visible[0]?.querySelector('h4')?.textContent.trim() || '',
              detailOpen: Boolean(visible[0]?.querySelector('details')?.open),
              width: rect.width,
              height: rect.height,
              position: getComputedStyle(picker).position,
              listPosition: list ? getComputedStyle(list).position : '',
              horizontalOverflow: picker.scrollWidth - picker.clientWidth,
              overlapsNext: Boolean(messageRect && nextRect && messageRect.bottom > nextRect.top + 1),
              counter: picker.querySelector('[data-generation-option-counter]')?.textContent.trim() || '',
              animationName: visible[0] ? getComputedStyle(visible[0]).animationName : '',
            }};
            """,
            timeout=45,
            label="compact generation-option picker",
        )
        if (
            layout["panels"] != 3
            or layout["visiblePanels"] != 1
            or layout["activeTitle"] != "概念递进"
            or layout["detailOpen"]
            or float(layout["width"]) < 600
            or float(layout["height"]) > 470
            or layout["position"] == "absolute"
            or layout["listPosition"] == "absolute"
            or float(layout["horizontalOverflow"]) > 2
            or layout["overlapsNext"]
            or layout["counter"] != "1 / 3"
            or layout["animationName"] != "none"
        ):
            raise RuntimeError(f"generation-option picker layout is broken: {layout}")

        driver.execute(
            f"""
            document.querySelector(
              '[data-generation-option-picker-message="{message_id}"] '
              + '[data-generation-option-view-id="option-2"]'
            ).click();
            return true;
            """
        )
        switched = driver.wait_for(
            f"""
            const picker = document.querySelector(
              '[data-generation-option-picker-message="{message_id}"]'
            );
            const visible = Array.from(
              picker?.querySelectorAll('[data-generation-option-panel]') || []
            ).filter(node => !node.hidden && getComputedStyle(node).display !== 'none');
            if (visible.length !== 1) return null;
            const title = visible[0].querySelector('h4')?.textContent.trim();
            if (title !== '案例驱动') return null;
            return {{
              title,
              counter: picker.querySelector('[data-generation-option-counter]')?.textContent.trim(),
              selectedTabs: picker.querySelectorAll('[role="tab"][aria-selected="true"]').length,
              promptClosed: !visible[0].querySelector('details')?.open,
              button: visible[0].querySelector('.teaching-generation-option-select')?.textContent.trim(),
            }};
            """,
            timeout=10,
            label="generation-option tab switch",
        )
        if (
            switched["counter"] != "2 / 3"
            or switched["selectedTabs"] != 1
            or not switched["promptClosed"]
            or switched["button"] != "选择方案 2 并正式生成"
        ):
            raise RuntimeError(f"generation-option switch is incomplete: {switched}")
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(screenshot)
        driver.set_window_size(390, 844)
        driver.execute(
            f"""
            const picker = document.querySelector(
              '[data-generation-option-picker-message="{message_id}"]'
            );
            picker.querySelector('[data-generation-option-shift="1"]').click();
            picker.scrollIntoView({{block: 'center'}});
            return true;
            """
        )
        mobile = driver.wait_for(
            f"""
            const picker = document.querySelector(
              '[data-generation-option-picker-message="{message_id}"]'
            );
            if (!picker) return null;
            const rect = picker.getBoundingClientRect();
            const panels = Array.from(picker.querySelectorAll('[data-generation-option-panel]'));
            const visible = panels.filter(node => !node.hidden && getComputedStyle(node).display !== 'none');
            const button = visible[0]?.querySelector('.teaching-generation-option-select');
            const panelRect = visible[0]?.getBoundingClientRect();
            const buttonRect = button?.getBoundingClientRect();
            return {{
              title: visible[0]?.querySelector('h4')?.textContent.trim() || '',
              counter: picker.querySelector('[data-generation-option-counter]')?.textContent.trim() || '',
              left: rect.left,
              right: rect.right,
              viewport: window.innerWidth,
              overflow: picker.scrollWidth - picker.clientWidth,
              visiblePanels: visible.length,
              compactTabTitle: getComputedStyle(
                picker.querySelector('.teaching-generation-option-tab strong')
              ).display,
              fullWidthAction: Boolean(
                panelRect && buttonRect && Math.abs(panelRect.width - buttonRect.width) < 6
              ),
            }};
            """,
            timeout=10,
            label="mobile generation-option picker",
        )
        if (
            mobile["title"] != "任务挑战"
            or mobile["counter"] != "3 / 3"
            or mobile["visiblePanels"] != 1
            or float(mobile["left"]) < -1
            or float(mobile["right"]) > float(mobile["viewport"]) + 1
            or float(mobile["overflow"]) > 2
            or mobile["compactTabTitle"] != "none"
            or not mobile["fullWidthAction"]
        ):
            raise RuntimeError(f"mobile generation-option picker is broken: {mobile}")
        print(
            "PASS  candidate plans use a compact single-plan picker without overlap",
            flush=True,
        )
    finally:
        if driver:
            driver.close()
        verifier.cleanup()


def verify_teacher_message_layout(module) -> None:
    """Verify the compact header and teacher-side message alignment in-browser."""

    verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
    driver = None
    try:
        verifier.setup()
        prepare_imperative_suggestion_fixture(verifier, module)
        approval_message_id = prepare_approval_tray_fixture(verifier, module)
        retry_job_id = prepare_retry_feedback_fixture(verifier, module)
        cancel_job_id = prepare_cancel_feedback_fixture(verifier, module)
        driver = ChromeDriver()
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        result = driver.wait_for(
            """
            const message = document.querySelector('.teaching-message.is-user');
            const body = message?.querySelector('.teaching-message-body');
            const avatar = message?.querySelector('.teaching-message-avatar');
            const activeThread = document.querySelector('[data-thread-row].is-active');
            if (!message || !body || !avatar || !activeThread) return null;
            const messageRect = message.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();
            const avatarRect = avatar.getBoundingClientRect();
            return {
              headerMenu: Boolean(document.getElementById('teaching-current-thread-actions')),
              direction: getComputedStyle(message).flexDirection,
              messageRight: messageRect.right,
              bodyRight: bodyRect.right,
              avatarLeft: avatarRect.left,
              avatarRight: avatarRect.right,
            };
            """,
            timeout=45,
            label="teacher message alignment",
        )
        if (
            result["headerMenu"]
            or result["direction"] != "row"
            or float(result["avatarLeft"]) < float(result["bodyRight"]) - 1
            or abs(float(result["messageRight"]) - float(result["avatarRight"])) > 2
        ):
            raise RuntimeError(
                f"teacher header or message alignment regressed: {result}"
            )
        approval_layout = driver.wait_for(
            f"""
            const tray = document.getElementById('teaching-approval-tray');
            const prompt = tray?.querySelector('.teaching-approval-prompt');
            const composer = document.querySelector('.teaching-composer-row');
            const fixture = document.querySelector('[data-message-id="{approval_message_id}"]');
            if (!tray || tray.hidden || !prompt || !composer || !fixture) return null;
            const trayRect = tray.getBoundingClientRect();
            const composerRect = composer.getBoundingClientRect();
            return {{
              promptCount: document.querySelectorAll('.teaching-approval-prompt').length,
              title: prompt.querySelector('.teaching-approval-prompt-copy > strong')?.textContent.trim() || '',
              hasApprove: Boolean(prompt.querySelector('[data-approval-decision="APPROVED"]')),
              hasReject: Boolean(prompt.querySelector('[data-approval-decision="REJECTED"]')),
              trayBottom: trayRect.bottom,
              composerTop: composerRect.top,
              overflow: Math.max(0, trayRect.right - innerWidth, -trayRect.left),
              quickDisplay: getComputedStyle(document.querySelector('.teaching-quick-prompts')).display,
              inlineProposal: fixture.querySelectorAll('[data-agent-tool-message]').length,
              inlineApproval: document.querySelectorAll('[data-action-approve], [data-action-reject]').length,
              drawerApprovalHidden: document.getElementById('teaching-action-section').hidden,
            }};
            """,
            timeout=45,
            label="single composer approval tray",
        )
        if (
            int(approval_layout["promptCount"]) != 1
            or approval_layout["title"] != "创建章节"
            or not approval_layout["hasApprove"]
            or not approval_layout["hasReject"]
            or float(approval_layout["trayBottom"])
            > float(approval_layout["composerTop"]) + 2
            or float(approval_layout["overflow"]) > 1
            or approval_layout["quickDisplay"] != "none"
            or int(approval_layout["inlineProposal"]) != 0
            or int(approval_layout["inlineApproval"]) != 0
            or not approval_layout["drawerApprovalHidden"]
        ):
            raise RuntimeError(
                f"approval request is duplicated or misplaced: {approval_layout}"
            )
        driver.execute(
            "document.querySelector('#teaching-approval-tray "
            "[data-approval-decision=\"REJECTED\"]').click(); return true;"
        )
        driver.wait_for(
            """
            const tray = document.getElementById('teaching-approval-tray');
            return tray.hidden
              && !tray.querySelector('.teaching-approval-prompt')
              && !document.getElementById('teacher-agent').classList.contains('has-pending-approval');
            """,
            timeout=15,
            label="approval tray dismissal",
        )
        deadline = time.monotonic() + 20
        stored_decision = None
        while time.monotonic() < deadline:
            thread = verifier.api(
                verifier.teacher,
                "GET",
                f"teaching/threads/{verifier.thread_id}",
            )["thread"]
            source = next(
                (
                    item
                    for item in thread.get("messages", [])
                    if int(item["id"]) == approval_message_id
                ),
                None,
            )
            stored_decision = (
                ((source or {}).get("metadata") or {})
                .get("toolProposalDecisions", {})
                .get("0", {})
                .get("decision")
            )
            if stored_decision == "REJECTED":
                break
            time.sleep(0.2)
        if stored_decision != "REJECTED":
            raise RuntimeError("rejected approval was not persisted on its source message")
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        persisted_layout = driver.wait_for(
            f"""
            const fixture = document.querySelector('[data-message-id="{approval_message_id}"]');
            const tray = document.getElementById('teaching-approval-tray');
            if (!fixture || !tray) return null;
            return {{
              hidden: tray.hidden,
              prompts: tray.querySelectorAll('.teaching-approval-prompt').length,
              inlineProposal: fixture.querySelectorAll('[data-agent-tool-message]').length,
            }};
            """,
            timeout=45,
            label="persisted approval dismissal after reload",
        )
        if (
            not persisted_layout["hidden"]
            or int(persisted_layout["prompts"]) != 0
            or int(persisted_layout["inlineProposal"]) != 0
        ):
            raise RuntimeError(
                f"decided approval returned after reload: {persisted_layout}"
            )
        approved_message_id = prepare_approval_tray_fixture(
            verifier,
            module,
            fixture_id="approval-tray-approved",
            fixture_name="批准托盘批准路径章节",
        )
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        driver.wait_for(
            f"""
            const tray = document.getElementById('teaching-approval-tray');
            const fixture = document.querySelector('[data-message-id="{approved_message_id}"]');
            return !tray.hidden
              && Boolean(fixture)
              && Boolean(tray.querySelector('[data-approval-decision="APPROVED"]'));
            """,
            timeout=45,
            label="approval path composer tray",
        )
        driver.execute(
            "document.querySelector('#teaching-approval-tray "
            "[data-approval-decision=\"APPROVED\"]').click(); return true;"
        )
        driver.wait_for(
            """
            const tray = document.getElementById('teaching-approval-tray');
            return tray.hidden
              && !tray.querySelector('.teaching-approval-prompt')
              && !document.getElementById('teacher-agent').classList.contains('has-pending-approval');
            """,
            timeout=15,
            label="approved tray dismissal",
        )
        deadline = time.monotonic() + 20
        stored_decision = None
        while time.monotonic() < deadline:
            thread = verifier.api(
                verifier.teacher,
                "GET",
                f"teaching/threads/{verifier.thread_id}",
            )["thread"]
            source = next(
                (
                    item
                    for item in thread.get("messages", [])
                    if int(item["id"]) == approved_message_id
                ),
                None,
            )
            stored_decision = (
                ((source or {}).get("metadata") or {})
                .get("toolProposalDecisions", {})
                .get("0", {})
                .get("decision")
            )
            if stored_decision == "APPROVED":
                break
            time.sleep(0.2)
        if stored_decision != "APPROVED":
            raise RuntimeError("approved decision was not persisted on its source message")
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        approved_persisted_layout = driver.wait_for(
            f"""
            const fixture = document.querySelector('[data-message-id="{approved_message_id}"]');
            const tray = document.getElementById('teaching-approval-tray');
            if (!fixture || !tray) return null;
            return {{
              hidden: tray.hidden,
              prompts: tray.querySelectorAll('.teaching-approval-prompt').length,
            }};
            """,
            timeout=45,
            label="persisted approved dismissal after reload",
        )
        if (
            not approved_persisted_layout["hidden"]
            or int(approved_persisted_layout["prompts"]) != 0
        ):
            raise RuntimeError(
                "approved request returned after reload: "
                f"{approved_persisted_layout}"
            )
        print(
            "PASS  approval requests use one composer tray and disappear permanently after approval or rejection",
            flush=True,
        )
        collapsed_activity = driver.execute(
            """
            const fixture = document.createElement('article');
            fixture.id = 'activity-spinner-layout-fixture';
            fixture.className = 'teaching-message is-assistant is-activity';
            fixture.innerHTML = `
              <div class="teaching-message-avatar" aria-hidden="true">
                <i class="fas fa-circle-notch fa-spin"></i>
              </div>
              <div class="teaching-message-body">
                <button class="teaching-activity-line" type="button" aria-expanded="false">
                  <span class="teaching-activity-copy"><strong>执行可用性验证</strong><small>构建 CTF 实践题并执行独立验证</small></span>
                  <i class="fas fa-chevron-right teaching-activity-open"></i>
                </button>
                <div class="job-disclosure-details" hidden>
                  <ol class="job-step-list">
                    ${Array.from({length: 4}, (_, index) => `
                      <li class="${index < 2 ? 'is-complete' : index === 2 ? 'is-current' : 'is-pending'}">
                        <span class="job-step-icon"><i class="fas fa-circle"></i></span>
                        <span class="job-step-copy"><strong>步骤 ${index + 1}</strong><small>验证步骤详情</small></span>
                      </li>`).join('')}
                  </ol>
                </div>`;
            document.getElementById('teaching-messages').append(fixture);
            const avatar = fixture.querySelector('.teaching-message-avatar');
            const line = fixture.querySelector('.teaching-activity-line');
            const spinner = avatar.querySelector('.fa-spin');
            const animation = spinner.getAnimations()[0];
            return {
              avatarTop: avatar.getBoundingClientRect().top,
              lineTop: line.getBoundingClientRect().top,
              transform: getComputedStyle(spinner).transform,
              animationName: getComputedStyle(spinner).animationName,
              animationDuration: getComputedStyle(spinner).animationDuration,
              animationPlayState: animation?.playState || '',
            };
            """
        )
        time.sleep(0.18)
        expanded_activity = driver.execute(
            """
            const fixture = document.getElementById('activity-spinner-layout-fixture');
            const avatar = fixture.querySelector('.teaching-message-avatar');
            const line = fixture.querySelector('.teaching-activity-line');
            const spinner = avatar.querySelector('.fa-spin');
            const details = fixture.querySelector('.job-disclosure-details');
            fixture.classList.add('is-expanded');
            line.setAttribute('aria-expanded', 'true');
            details.hidden = false;
            return {
              avatarTop: avatar.getBoundingClientRect().top,
              lineTop: line.getBoundingClientRect().top,
              transform: getComputedStyle(spinner).transform,
              detailHeight: details.getBoundingClientRect().height,
            };
            """
        )
        driver.execute(
            "document.getElementById('activity-spinner-layout-fixture').remove(); return true;"
        )
        if (
            abs(
                float(collapsed_activity["avatarTop"])
                - float(collapsed_activity["lineTop"])
                - 7
            )
            > 1
            or abs(
                float(expanded_activity["avatarTop"])
                - float(expanded_activity["lineTop"])
                - 7
            )
            > 1
            or abs(
                float(collapsed_activity["avatarTop"])
                - float(expanded_activity["avatarTop"])
            )
            > 1
            or collapsed_activity["animationName"] != "teaching-activity-spin"
            or collapsed_activity["animationDuration"] != "0.8s"
            or collapsed_activity["animationPlayState"] != "running"
            or collapsed_activity["transform"] == expanded_activity["transform"]
            or float(expanded_activity["detailHeight"]) < 100
        ):
            raise RuntimeError(
                "activity spinner is not fixed beside the summary or actively rotating: "
                f"collapsed={collapsed_activity}, expanded={expanded_activity}"
            )
        driver.execute(
            "document.querySelector('[data-thread-row].is-active [data-thread-menu]').click(); return true;"
        )
        sidebar_menu = driver.wait_for(
            """
            const menu = document.getElementById('teaching-thread-action-menu');
            if (!menu || menu.hidden) return null;
            return {
              visibleActions: Array.from(menu.querySelectorAll('[data-thread-action]'))
                .filter(node => !node.hidden).map(node => node.dataset.threadAction),
            };
            """,
            timeout=10,
            label="conversation row action menu",
        )
        if sidebar_menu["visibleActions"] != [
            "rename",
            "pin",
            "archive",
            "delete",
        ]:
            raise RuntimeError(f"conversation row actions regressed: {sidebar_menu}")
        retry_job_id_js = json.dumps(retry_job_id)
        driver.execute(
            f"""
            const jobId = {retry_job_id_js};
            const api = window.DojoLearning;
            window.__retryOriginalJson = api.json;
            window.__retryProbe = null;
            api.json = function(method, path, body) {{
              if (method === 'POST' && path.includes(`/jobs/${{jobId}}/retry`)) {{
                window.__retryProbe = {{method, path, body}};
                return new Promise((resolve, reject) => {{
                  window.__retryReject = reject;
                }});
              }}
              return window.__retryOriginalJson.call(this, method, path, body);
            }};
            const button = document.querySelector(`[data-run-retry="${{jobId}}"]`);
            if (!button) return false;
            window.__retryMessageId = button.closest('[data-message-id]')?.dataset.messageId || '';
            button.click();
            return true;
            """
        )
        retry_feedback = driver.wait_for(
            f"""
            const jobId = {retry_job_id_js};
            const message = document.querySelector(
              `[data-message-id="${{window.__retryMessageId}}"]`
            );
            const taskRows = Array.from(
              document.querySelectorAll(`[data-task-job="${{jobId}}"]`)
            );
            const task = taskRows[0];
            const notice = document.getElementById('teaching-notice');
            const noticeReady = Boolean(
              notice && !notice.hidden
                && notice.textContent.includes('正在替换失败状态并重新执行')
            );
            if (!window.__retryProbe || !message || !task || !noticeReady) return null;
            return {{
              messageId: message.dataset.messageId,
              activity: message.classList.contains('is-activity'),
              spinner: Boolean(message.querySelector('.teaching-message-avatar .fa-spin')),
              retryButton: Boolean(message.querySelector(`[data-run-retry="${{jobId}}"]`)),
              failedCopy: message.textContent.includes('生成结果未通过可用性检查'),
              expanded: message.getAttribute('data-job-disclosure') === jobId
                && Boolean(message.querySelector('.job-disclosure-details:not([hidden])')),
              taskRows: taskRows.length,
              taskActive: task.classList.contains('is-queued'),
              taskProgress: task.querySelector('.teaching-task-progress')?.getAttribute('aria-valuenow'),
              taskRestarting: task.querySelector('.is-restarting')?.textContent.trim() || '',
              confirmation: Boolean(document.querySelector('.aisecedu-dialog-layer')),
              path: window.__retryProbe.path,
            }};
            """,
            timeout=10,
            label="immediate retry feedback",
        )
        if (
            not retry_feedback["messageId"]
            or not retry_feedback["activity"]
            or not retry_feedback["spinner"]
            or retry_feedback["retryButton"]
            or retry_feedback["failedCopy"]
            or not retry_feedback["expanded"]
            or retry_feedback["taskRows"] != 1
            or not retry_feedback["taskActive"]
            or retry_feedback["taskProgress"] != "0"
            or retry_feedback["taskRestarting"] != "重新开始"
            or retry_feedback["confirmation"]
            or not retry_feedback["path"].endswith(f"/{retry_job_id}/retry")
        ):
            raise RuntimeError(f"retry feedback is incomplete: {retry_feedback}")
        driver.execute(
            "window.__retryReject(new Error('browser retry feedback probe complete')); return true;"
        )
        driver.wait_for(
            f"""
            const button = document.querySelector('[data-run-retry="{retry_job_id}"]');
            const message = document.querySelector(
              `[data-message-id="${{window.__retryMessageId}}"]`
            );
            const taskRows = document.querySelectorAll('[data-task-job="{retry_job_id}"]');
            if (!button || button.disabled || button.textContent.trim() !== '重新运行'
                || !message?.classList.contains('is-error') || taskRows.length !== 1
                || !taskRows[0].classList.contains('is-failed')) return null;
            window.DojoLearning.json = window.__retryOriginalJson;
            return true;
            """,
            timeout=10,
            label="retry feedback cleanup",
        )
        cancel_job_id_js = json.dumps(cancel_job_id)
        driver.execute(
            f"""
            const jobId = {cancel_job_id_js};
            const message = document.querySelector(`[data-job-disclosure="${{jobId}}"]`);
            const toggle = message?.querySelector('[data-job-toggle]');
            if (!message?.classList.contains('is-activity') || !toggle) return false;
            toggle.click();
            document.getElementById('teaching-drawer-open').click();
            return true;
            """
        )
        active_management = driver.wait_for(
            f"""
            const button = document.querySelector(
              '[data-task-job="{cancel_job_id}"] [data-cancel-job="{cancel_job_id}"]'
            );
            if (!button) return null;
            const management = Boolean(
              button.closest('[data-task-job]')?.querySelector('.teaching-task-manage')
            );
            button.click();
            return {{management}};
            """,
            timeout=10,
            label="cancel task action",
        )
        if active_management["management"]:
            raise RuntimeError("an active task exposed destructive list management")
        canceled_feedback = driver.wait_for(
            f"""
            const message = document.querySelector(
              '[data-job-disclosure="{cancel_job_id}"]'
            );
            const task = document.querySelector('[data-task-job="{cancel_job_id}"]');
            if (!message?.classList.contains('is-canceled')
                || !task?.classList.contains('is-canceled')) return null;
            return {{
              canceledCopy: message.textContent.includes('任务已取消'),
              messageSpinner: Boolean(message.querySelector('.fa-spin')),
              expanded: Boolean(message.querySelector('.job-disclosure-details:not([hidden])')),
              taskCopy: task.textContent.includes('已取消'),
              taskSpinner: Boolean(task.querySelector('.fa-spin')),
              management: Boolean(task.querySelector('.teaching-task-manage')),
            }};
            """,
            timeout=10,
            label="terminal canceled task presentation",
        )
        if (
            not canceled_feedback["canceledCopy"]
            or canceled_feedback["messageSpinner"]
            or not canceled_feedback["expanded"]
            or not canceled_feedback["taskCopy"]
            or canceled_feedback["taskSpinner"]
            or not canceled_feedback["management"]
        ):
            raise RuntimeError(
                f"canceled task still looks active: {canceled_feedback}"
            )
        driver.execute(
            f"""
            const management = document.querySelector(
              '[data-task-job="{cancel_job_id}"] .teaching-task-manage'
            );
            management?.querySelector('summary')?.click();
            const button = management?.querySelector('[data-delete-task="{cancel_job_id}"]');
            if (!management?.open || !button) return false;
            button.click();
            return true;
            """
        )
        deletion_dialog = driver.wait_for(
            """
            const layer = document.querySelector('.aisecedu-dialog-layer');
            const confirm = layer?.querySelector('[data-dialog-action="confirm"]');
            if (!layer || !confirm) return null;
            return {
              title: layer.querySelector('#aisecedu-dialog-title')?.textContent.trim(),
              message: layer.querySelector('.aisecedu-dialog-message')?.textContent.trim(),
              confirm: confirm.textContent.trim(),
            };
            """,
            timeout=10,
            label="terminal task deletion confirmation",
        )
        if (
            deletion_dialog["title"] != "删除任务记录"
            or deletion_dialog["confirm"] != "从列表删除"
            or "对话内容和任务结果仍会保留" not in deletion_dialog["message"]
        ):
            raise RuntimeError(f"task deletion confirmation is unclear: {deletion_dialog}")
        driver.execute(
            "document.querySelector('[data-dialog-action=\"confirm\"]').click(); return true;"
        )
        driver.wait_for(
            f"""
            const task = document.querySelector('[data-task-job="{cancel_job_id}"]');
            const message = document.querySelector(
              '#teaching-messages [data-job-disclosure="{cancel_job_id}"]'
            );
            if (task || !message?.classList.contains('is-canceled')) return null;
            return true;
            """,
            timeout=10,
            label="terminal task removed while conversation remains",
        )
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        driver.wait_for(
            f"""
            const message = document.querySelector(
              '#teaching-messages [data-job-disclosure="{cancel_job_id}"]'
            );
            const task = document.querySelector('[data-task-job="{cancel_job_id}"]');
            if (!message?.classList.contains('is-canceled') || task) return null;
            return true;
            """,
            timeout=45,
            label="task deletion persists after reload",
        )
        print(
            "PASS  terminal tasks can be removed while their conversation results remain",
            flush=True,
        )
    finally:
        if driver is not None:
            driver.close()
        verifier.cleanup()


def verify_retry_in_place_persistence(module) -> None:
    """Verify the real retry API mutates one message and one task in place."""

    verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
    driver = None
    retry_job_id = None
    superseded_job_id = None
    try:
        verifier.setup()
        retry_job_id, superseded_job_id = prepare_legacy_retry_chain_fixture(
            verifier,
            module,
        )
        before = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        original = next(
            (
                message
                for message in before.get("messages") or []
                if (message.get("metadata") or {}).get("jobId") == retry_job_id
            ),
            None,
        )
        if original is None:
            raise RuntimeError("retry fixture message is missing before execution")

        retried = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/jobs/{retry_job_id}/retry",
            json_body={"idempotencyKey": f"retry-in-place-{verifier.suffix}"},
            statuses=(200, 202),
        )
        if (
            retried.get("replacedInPlace") is not True
            or retried.get("replacedJobId") != retry_job_id
            or (retried.get("job") or {}).get("id") != retry_job_id
        ):
            raise RuntimeError(f"retry API did not preserve task identity: {retried}")

        after = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        references = []
        for message in after.get("messages") or []:
            metadata = message.get("metadata") or {}
            cards = message.get("cards") or []
            if metadata.get("jobId") == retry_job_id or any(
                card.get("objectId") == retry_job_id for card in cards
            ):
                references.append(message)
        if len(references) != 1 or references[0].get("id") != original.get("id"):
            raise RuntimeError(
                "retry created a second conversation result instead of replacing the first: "
                f"before={original.get('id')}, after={[item.get('id') for item in references]}"
            )
        superseded_references = [
            message
            for message in after.get("messages") or []
            if (message.get("metadata") or {}).get("jobId") == superseded_job_id
            or any(
                card.get("objectId") == superseded_job_id
                for card in message.get("cards") or []
            )
        ]
        if superseded_references:
            raise RuntimeError(
                "legacy retry left duplicate conversation content visible: "
                f"{[item.get('id') for item in superseded_references]}"
            )
        audited = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/jobs/{superseded_job_id}",
        )["job"]
        if audited.get("id") != superseded_job_id:
            raise RuntimeError("superseded retry audit record was not retained")
        metadata = references[0].get("metadata") or {}
        cards = [
            card
            for card in references[0].get("cards") or []
            if card.get("objectId") == retry_job_id
        ]
        card_state = cards[0].get("state") or {} if len(cards) == 1 else {}
        card_status = str(card_state.get("status") or "").upper()
        card_progress = int(card_state.get("progress") or 0)
        if (
            metadata.get("presentation") != "activity"
            or metadata.get("pending") is not True
            or metadata.get("failed") is not False
            or len(cards) != 1
            or card_status not in {"QUEUED", "RUNNING"}
            or not 0 <= card_progress < 100
        ):
            raise RuntimeError(
                "persisted retry state did not replace the failed message: "
                f"metadata={metadata}, cards={cards}"
            )

        driver = ChromeDriver()
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        browser = driver.wait_for(
            f"""
            const message = document.querySelector('[data-message-id="{original['id']}"]');
            const taskRows = document.querySelectorAll('[data-task-job="{retry_job_id}"]');
            if (!message || taskRows.length !== 1) return null;
            return {{
              activity: message.classList.contains('is-activity'),
              failed: message.classList.contains('is-error'),
              jobId: message.getAttribute('data-job-disclosure'),
              taskActive: taskRows[0].classList.contains('is-queued')
                || taskRows[0].classList.contains('is-running'),
              taskFailed: taskRows[0].classList.contains('is-failed'),
              progress: taskRows[0].querySelector('.teaching-task-progress')
                ?.getAttribute('aria-valuenow'),
              supersededTaskRows: document.querySelectorAll(
                '[data-task-job="{superseded_job_id}"]',
              ).length,
            }};
            """,
            timeout=45,
            label="persisted in-place retry",
        )
        if (
            not browser["activity"]
            or browser["failed"]
            or browser["jobId"] != retry_job_id
            or not browser["taskActive"]
            or browser["taskFailed"]
            or not 0 <= int(browser["progress"] or 0) < 100
            or browser["supersededTaskRows"] != 0
        ):
            raise RuntimeError(
                "browser did not render the persisted retry in place: "
                f"{browser}"
            )
        print(
            "PASS  real retry API preserves one message, one task ID, and one task row",
            flush=True,
        )
    finally:
        if driver is not None:
            driver.close()
        if retry_job_id and verifier.teacher is not None:
            try:
                verifier.api(
                    verifier.teacher,
                    "DELETE",
                    f"teaching/jobs/{retry_job_id}",
                )
            except Exception:
                pass
        verifier.cleanup()


def verify_quick_scope_picker(
    module, screenshot_path: pathlib.Path | None = None
) -> None:
    """Verify quick actions support free, whole-course, and chapter scopes."""

    verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
    driver = None
    try:
        verifier.setup()
        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        course = next(
            (item for item in context.get("teacherDojos", []) if item.get("modules")),
            None,
        )
        if course is None:
            raise RuntimeError("quick-scope verification requires a course chapter")
        course_id = str(course["id"])
        course_name = str(course["name"])
        module_item = course["modules"][0]
        module_index = str(module_item["index"])
        module_name = str(module_item.get("name") or "未命名章节")
        course_id_js = json.dumps(course_id)
        module_index_js = json.dumps(module_index)

        driver = ChromeDriver()
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        driver.wait_for(
            """
            const button = document.querySelector('[data-quick-action="ctf"]');
            return document.readyState === 'complete' && button && !button.disabled
              && document.querySelector('[data-thread-row].is-active');
            """,
            timeout=45,
            label="quick action readiness",
        )
        original_user_messages = int(
            driver.execute(
                "return document.querySelectorAll('.teaching-message.is-user').length;"
            )
        )

        driver.execute(
            "document.querySelector('[data-quick-action=\"ctf\"]').click(); return true;"
        )
        free_scope = driver.wait_for(
            """
            const dialog = document.getElementById('teaching-quick-scope-dialog');
            if (!dialog.open) return null;
            const course = document.getElementById('teaching-quick-scope-course');
            const rect = dialog.getBoundingClientRect();
            return {
              title: document.getElementById('teaching-quick-scope-title').textContent.trim(),
              firstOption: course.options[0]?.textContent.trim(),
              courseNames: Array.from(course.options).map(node => node.textContent.trim()),
              modesHidden: document.getElementById('teaching-quick-scope-modes').hidden,
              inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
              hasDetail: Boolean(document.getElementById('teaching-quick-scope-detail')),
            };
            """,
            timeout=10,
            label="free quick-action scope",
        )
        if (
            free_scope["title"] != "生成 CTF 实践题"
            or free_scope["firstOption"] != "不限定课程（自由描述）"
            or course_name not in free_scope["courseNames"]
            or not free_scope["modesHidden"]
            or not free_scope["inViewport"]
            or not free_scope["hasDetail"]
        ):
            raise RuntimeError(f"free quick-action scope is incomplete: {free_scope}")
        generic_prompt = (
            "帮我生成一道采用 Flag 提交与校验的 CTF 实践题。补充要求：主题为栈溢出。"
        )
        driver.execute(
            """
            const detail = document.getElementById('teaching-quick-scope-detail');
            detail.value = '主题为栈溢出';
            detail.dispatchEvent(new Event('input', {bubbles: true}));
            document.getElementById('teaching-quick-scope-confirm').click();
            return true;
            """
        )
        driver.wait_for(
            f"""
            return !document.getElementById('teaching-quick-scope-dialog').open
              && document.getElementById('teaching-input').value === {json.dumps(generic_prompt, ensure_ascii=False)}
              && document.getElementById('teaching-dojo').value === ''
              && document.getElementById('teaching-module').value === '';
            """,
            timeout=30,
            label="unbound quick command",
        )

        driver.execute(
            "document.querySelector('[data-quick-action=\"slide-deck\"]').click(); return true;"
        )
        driver.wait_for(
            "return document.getElementById('teaching-quick-scope-dialog').open;",
            timeout=10,
            label="whole-course scope dialog",
        )
        driver.execute(
            f"""
            const course = document.getElementById('teaching-quick-scope-course');
            course.value = {course_id_js};
            course.dispatchEvent(new Event('change', {{bubbles: true}}));
            document.getElementById('teaching-quick-scope-detail').value = '覆盖全部章节并给出课程总览';
            document.getElementById('teaching-quick-scope-confirm').click();
            return true;
            """
        )
        whole_course_prompt = (
            f"帮我为整门课程“{course_name}”生成一份可直接授课的课件。"
            "补充要求：覆盖全部章节并给出课程总览。"
        )
        driver.wait_for(
            f"""
            return !document.getElementById('teaching-quick-scope-dialog').open
              && document.getElementById('teaching-input').value === {json.dumps(whole_course_prompt, ensure_ascii=False)}
              && document.getElementById('teaching-dojo').value === {course_id_js}
              && document.getElementById('teaching-module').value === ''
              && document.getElementById('teaching-artifact-type').value === 'slide-deck';
            """,
            timeout=30,
            label="whole-course quick command",
        )

        driver.execute(
            "document.querySelector('[data-quick-action=\"simulation\"]').click(); return true;"
        )
        driver.wait_for(
            "return document.getElementById('teaching-quick-scope-dialog').open;",
            timeout=10,
            label="chapter scope dialog",
        )
        chapter_options = driver.execute(
            f"""
            const mode = document.querySelector('[name="teaching-quick-scope-mode"][value="module"]');
            mode.click();
            const select = document.getElementById('teaching-quick-scope-module');
            select.value = {module_index_js};
            select.dispatchEvent(new Event('change', {{bubbles: true}}));
            document.getElementById('teaching-quick-scope-detail').value = '只使用该章节知识点';
            return {{
              moduleNames: Array.from(select.options).map(node => node.textContent.trim()),
              moduleVisible: !document.getElementById('teaching-quick-scope-module-row').hidden,
              moduleEnabled: !select.disabled,
            }};
            """
        )
        if (
            module_name not in chapter_options["moduleNames"]
            or not chapter_options["moduleVisible"]
            or not chapter_options["moduleEnabled"]
        ):
            raise RuntimeError(f"chapter scope is incomplete: {chapter_options}")
        if screenshot_path is not None:
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(screenshot_path)
            print(
                f"PASS  captured quick-action scope picker at {screenshot_path}",
                flush=True,
            )
        driver.set_window_size(390, 844)
        mobile_layout = driver.wait_for(
            """
            const dialog = document.getElementById('teaching-quick-scope-dialog');
            const choices = document.querySelector('.teaching-quick-scope-modes > div');
            const rect = dialog.getBoundingClientRect();
            if (!dialog.open || rect.width <= 0) return null;
            return {
              inViewport: rect.left >= -1 && rect.top >= -1
                && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
              columns: getComputedStyle(choices).gridTemplateColumns.trim().split(/\s+/).length,
            };
            """,
            timeout=10,
            label="mobile quick-action scope",
        )
        if not mobile_layout["inViewport"] or int(mobile_layout["columns"]) != 1:
            raise RuntimeError(
                f"quick-action scope is not mobile responsive: {mobile_layout}"
            )
        driver.set_window_size(1440, 1000)
        driver.execute(
            "document.getElementById('teaching-quick-scope-confirm').click(); return true;"
        )
        chapter_prompt = (
            f"帮我为课程“{course_name}”的章节“{module_name}”生成一个可操作的模拟实训演示。"
            "补充要求：只使用该章节知识点。"
        )
        driver.wait_for(
            f"""
            return !document.getElementById('teaching-quick-scope-dialog').open
              && document.getElementById('teaching-input').value === {json.dumps(chapter_prompt, ensure_ascii=False)}
              && document.getElementById('teaching-dojo').value === {course_id_js}
              && document.getElementById('teaching-module').value === {module_index_js}
              && document.getElementById('teaching-artifact-type').value === 'simulation';
            """,
            timeout=30,
            label="chapter quick command",
        )
        final_user_messages = int(
            driver.execute(
                "return document.querySelectorAll('.teaching-message.is-user').length;"
            )
        )
        if final_user_messages != original_user_messages:
            raise RuntimeError(
                "quick action sent a message instead of filling the composer"
            )
        persisted = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        if (
            str(persisted.get("dojoId")) != course_id
            or str(persisted.get("moduleIndex")) != module_index
        ):
            raise RuntimeError(
                f"quick-action scope did not persist exactly: {persisted}"
            )
        print(
            "PASS  quick actions support free, whole-course, and chapter commands without auto-send",
            flush=True,
        )
    finally:
        if driver is not None:
            driver.close()
        verifier.cleanup()


def verify_html_file_delivery(module) -> None:
    verifier = module.TeacherAgentVerifier(job_timeout=900, authoring_timeout=1200)
    storage_directory = None
    try:
        verifier.setup()
        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        owner_id = int(context["user"]["id"])
        submitted = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/threads/{verifier.thread_id}/messages",
            json_body={
                "content": (
                    "请生成一份真实可下载的 HTML 文件《SQL 注入防御微课教案》，适合 A4 "
                    "浏览器打印。正文完整包含教学目标、参数化查询原理、错误示例与修复示例、"
                    "课堂练习、检查标准和课后作业；不要返回空模板或只有标题的页面。"
                ),
                "client": "html-file-regression",
            },
            statuses=(202,),
        )
        job_id = submitted["job"]["id"]
        storage_directory = f"/data/agent-runtime/agent-files/{owner_id}/{job_id}"
        completed = verifier.wait_job(job_id)
        result = completed.get("result") or {}
        delivered = next(
            (
                item
                for item in result.get("files") or []
                if isinstance(item, dict) and item.get("format") == "html"
            ),
            None,
        )
        if delivered is None:
            raise RuntimeError(f"live Agent returned no HTML file: {completed}")
        response = verifier.teacher.get(
            f"{module.BASE_URL}{delivered['downloadUrl']}", timeout=120
        )
        module.require(response)
        content = response.content
        source = content.decode("utf-8")
        body = re.search(
            r"<body\b[^>]*>([\s\S]*?)</body\s*>", source, flags=re.IGNORECASE
        )
        visible_source = body.group(1) if body else ""
        visible_source = re.sub(
            r"<(script|style|template|noscript)\b[^>]*>[\s\S]*?</\1\s*>",
            " ",
            visible_source,
            flags=re.IGNORECASE,
        )
        visible = re.sub(
            r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", visible_source))
        ).strip()
        expected_terms = ("SQL", "参数化查询", "教学目标", "课堂练习", "课后作业")
        if (
            len(content) < 1_000
            or len(re.sub(r"\s+", "", visible)) < 300
            or any(term not in visible for term in expected_terms)
            or int(delivered.get("size") or 0) != len(content)
            or not response.headers.get("Content-Type", "").startswith("text/html")
        ):
            raise RuntimeError(
                "live HTML file is incomplete: "
                f"bytes={len(content)}, visible={len(visible)}, file={delivered}"
            )
        print(
            "PASS  live Agent persists and downloads a substantive printable HTML file "
            f"({len(content)} bytes, {len(visible)} visible characters)",
            flush=True,
        )
    finally:
        verifier.cleanup()
        if storage_directory:
            module.outer(
                "find",
                storage_directory,
                "-maxdepth",
                "1",
                "-type",
                "f",
                "-delete",
                check=False,
            )
            module.outer("rmdir", storage_directory, check=False)


def verify_large_pdf_upload(module) -> None:
    """Select and analyze a >1 MiB PDF through the real course-center UI."""

    verifier = module.TeacherAgentVerifier(job_timeout=900, authoring_timeout=1200)
    material_id = None
    driver = None
    # The installed Chromium is confined and cannot resolve WebDriver uploads
    # from the host's private /tmp namespace. A short-lived visible home
    # directory is accessible to both ChromeDriver and Chromium.
    fixture_dir = tempfile.TemporaryDirectory(
        prefix="aisecedu-pdf-upload-", dir=pathlib.Path.home()
    )
    try:
        verifier.setup()
        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        course = next(
            (item for item in context.get("teacherDojos", []) if item.get("modules")),
            None,
        )
        if course is None:
            raise RuntimeError("isolated PDF test teacher has no course module")
        module_item = course["modules"][0]
        verifier.api(
            verifier.teacher,
            "PATCH",
            f"teaching/threads/{verifier.thread_id}",
            json_body={"dojoId": course["id"], "moduleIndex": module_item["index"]},
        )
        pdf = build_large_course_pdf()
        filename = f"2《软件安全》_缓冲区溢出基础-{verifier.suffix}.pdf"
        pdf_path = pathlib.Path(fixture_dir.name) / filename
        pdf_path.write_bytes(pdf)

        driver = ChromeDriver()
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        course_reference = requests.utils.quote(str(course["referenceId"]), safe="")
        driver.navigate(
            f"{module.BASE_URL}/teacher/courses?dojo={course_reference}&tab=courseware"
        )
        driver.wait_for(
            """
            const input = document.getElementById('cs-courseware-upload');
            const loading = document.getElementById('cs-loading');
            return document.readyState === 'complete' && input && loading?.hidden;
            """,
            timeout=60,
            label="course material upload input",
        )
        driver.execute(
            """
            window.__aiseceduUploadProbe = [];
            const nativeFetch = window.fetch.bind(window);
            window.fetch = async function(input, init = {}) {
              const url = String(input instanceof Request ? input.url : input);
              const isMaterialUpload = url.includes('/pwncollege_api/v1/teaching/materials')
                && String(init.method || 'GET').toUpperCase() === 'POST';
              if (!isMaterialUpload) return nativeFetch(input, init);
              const headers = new Headers(init.headers || {});
              const request = {
                bodyIsFormData: init.body instanceof FormData,
                contentType: headers.get('Content-Type'),
                csrfFormToken: init.body instanceof FormData && Boolean(init.body.get('nonce')),
              };
              const response = await nativeFetch(input, init);
              const payload = await response.clone().json().catch(() => null);
              window.__aiseceduUploadProbe.push({request, status: response.status, payload});
              return response;
            };
            return true;
            """
        )
        driver.send_file("#cs-courseware-upload", pdf_path)
        upload = driver.wait_for(
            "return window.__aiseceduUploadProbe?.at(-1) || null;",
            timeout=180,
            label="browser PDF upload response",
        )
        request_probe = upload.get("request") or {}
        payload = upload.get("payload") or {}
        uploaded = payload.get("data") or {}
        if (
            int(upload.get("status") or 0) != 202
            or payload.get("success") is not True
            or request_probe.get("bodyIsFormData") is not True
            or request_probe.get("contentType") is not None
            or request_probe.get("csrfFormToken") is not True
        ):
            raise RuntimeError(
                f"browser did not send a valid multipart upload: {upload}"
            )
        material_id = uploaded.get("materialId")
        job_id = (uploaded.get("job") or {}).get("id")
        if not material_id or not job_id:
            raise RuntimeError(
                f"browser upload response is missing durable IDs: {uploaded}"
            )
        verifier.wait_job(job_id, expected_model="deepseek-v4-flash")
        material = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/materials/{material_id}",
        )["material"]
        analysis = material.get("analysis") or {}
        if material.get("status") != "READY" or int(material.get("size") or 0) != len(
            pdf
        ):
            raise RuntimeError(
                f"large PDF upload did not persist correctly: {material}"
            )
        sources = material.get("sources") or []
        summary = str(analysis.get("summary") or "").strip()
        if not sources or not summary:
            raise RuntimeError(
                "large PDF upload completed without course-content analysis: "
                f"sources={len(sources)}, "
                f"analysis={analysis}"
            )
        driver.wait_for(
            f"""
            const row = document.querySelector("[data-material-id='{material_id}']");
            return row && row.textContent.includes({filename!r}) ? row.textContent.trim() : null;
            """,
            timeout=60,
            label="uploaded PDF in course material list",
        )
        print(
            f"PASS  browser selects, uploads, lists, and analyzes {len(pdf)}-byte PDF",
            flush=True,
        )
    finally:
        if driver is not None:
            driver.close()
        if material_id and verifier.teacher is not None:
            try:
                verifier.api(
                    verifier.teacher,
                    "DELETE",
                    f"teaching/materials/{material_id}",
                )
            except Exception as error:
                print(f"WARN  PDF material cleanup failed: {error}", flush=True)
        fixture_dir.cleanup()


def verify_global_agent_conversation_upload(module) -> None:
    verifier = module.TeacherAgentVerifier(job_timeout=600, authoring_timeout=1200)
    driver = None
    fixture_dir = tempfile.TemporaryDirectory(
        prefix="aisecedu-agent-upload-", dir=pathlib.Path.home()
    )
    try:
        verifier.setup()
        created = verifier.execute_course_tool(
            {
                "tool": "course.create",
                "arguments": {
                    "name": verifier.course_name,
                    "slug": verifier.course_slug,
                    "access": "private",
                },
                "requiresConfirmation": True,
            }
        )
        verifier.course = created["result"]["course"]
        target_module_name = f"附件归档章节 {verifier.suffix}"
        created_module = verifier.execute_course_tool(
            {
                "tool": "module.create",
                "arguments": {
                    "id": f"attachment-{verifier.suffix}",
                    "name": target_module_name,
                    "description": "全局智能体附件归档端到端验收。",
                },
                "requiresConfirmation": True,
            }
        )
        verifier.module = created_module["result"]["module"]
        test_thread = verifier.api(
            verifier.teacher,
            "POST",
            "teaching/threads",
            json_body={"title": f"附件处理验收 {verifier.suffix}"},
            statuses=(201,),
        )["thread"]
        verifier.thread_id = test_thread["id"]

        filename = f"课程附件-{verifier.suffix}.txt"
        fixture_path = pathlib.Path(fixture_dir.name) / filename
        fixture_path.write_text(
            "全局智能体文件上传验收资料。\n"
            "内容主题：输入验证、最小权限、日志审计与安全复盘。\n"
            "该文件应由教师明确决定加入哪个课程章节，不能被自动归类为课件。\n",
            encoding="utf-8",
        )

        driver = ChromeDriver()
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={verifier.thread_id}"
        )
        driver.wait_for(
            f"""
            const active = document.querySelector('[data-thread-row].is-active');
            return document.readyState === 'complete'
              && active?.dataset.threadRow === {verifier.thread_id!r}
              && document.getElementById('teaching-thread-title')?.textContent.trim()
                === {test_thread['title']!r}
              && document.getElementById('teaching-upload')
              && !document.getElementById('teaching-input').disabled;
            """,
            timeout=60,
            label="unscoped global Agent upload conversation",
        )
        driver.send_file("#teaching-upload", fixture_path)
        upload_ui = driver.wait_for(
            f"""
            const users = Array.from(document.querySelectorAll('.teaching-message.is-user'));
            const answers = Array.from(document.querySelectorAll('.teaching-message.is-answer'));
            const user = users.at(-1);
            const answer = answers.at(-1);
            const suggestions = answer
              ? Array.from(answer.querySelectorAll('[data-agent-suggestion-message]'))
              : [];
            const attachment = user?.querySelector('.teaching-uploaded-attachments a');
            if (!user?.textContent.includes({filename!r})
                || !attachment
                || !answer?.textContent.includes('你希望我如何处理这份文件')
                || suggestions.length !== 4) return null;
            return {{
              attachmentName: attachment.querySelector('strong')?.textContent.trim() || '',
              attachmentHref: attachment.getAttribute('href') || '',
              suggestions: suggestions.map(node => node.textContent.trim()),
              generationOptions: document.querySelectorAll('[data-generation-options]').length,
              composerDisabled: document.getElementById('teaching-input').disabled,
            }};
            """,
            timeout=180,
            label="upload-only attachment question",
        )
        if (
            upload_ui["attachmentName"] != filename
            or not str(upload_ui["attachmentHref"]).startswith(
                "/pwncollege_api/v1/teaching/materials/"
            )
            or any(
                not str(suggestion).startswith("帮我")
                for suggestion in upload_ui["suggestions"]
            )
            or not any("添加到课程" in item for item in upload_ui["suggestions"])
            or not any("创建一份课件" in item for item in upload_ui["suggestions"])
            or not any("创建 CTF 实践题" in item for item in upload_ui["suggestions"])
            or not any("创建一个模拟演示" in item for item in upload_ui["suggestions"])
            or int(upload_ui["generationOptions"]) != 0
            or upload_ui["composerDisabled"]
        ):
            raise RuntimeError(
                f"upload-only conversation UI is incomplete: {upload_ui}"
            )

        thread_after_upload = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        attachments = (thread_after_upload.get("context") or {}).get(
            "pendingAttachments"
        ) or []
        upload_message = next(
            (
                item
                for item in thread_after_upload.get("messages") or []
                if (item.get("metadata") or {}).get("uploadOnly") is True
            ),
            None,
        )
        message_attachments = (upload_message or {}).get("metadata", {}).get(
            "attachments"
        ) or []
        message_attachment = next(
            (item for item in message_attachments if item.get("filename") == filename),
            None,
        )
        material_id = str((message_attachment or {}).get("id") or "")
        attachment = next(
            (item for item in attachments if str(item.get("id")) == material_id), None
        )
        if (
            message_attachment is None
            or material_id == ""
            or attachment is None
            or attachment.get("status") != "AWAITING_INTENT"
            or thread_after_upload.get("dojoId") is not None
            or len(thread_after_upload.get("messages") or []) != 2
        ):
            raise RuntimeError(
                "upload-only request was not retained as an unassigned attachment: "
                f"thread={thread_after_upload}"
            )

        analysis_job_id = str((attachment or {}).get("analysisJobId") or "")
        if not analysis_job_id:
            raise RuntimeError(
                f"upload-only attachment has no analysis job: {attachment}"
            )
        verifier.wait_job(analysis_job_id)
        analyzed_material = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/materials/{material_id}",
        )["material"]
        if (
            analyzed_material.get("status") != "READY"
            or not (analyzed_material.get("analysis") or {}).get("summary")
            or not analyzed_material.get("sources")
        ):
            raise RuntimeError(
                "conversation attachment analysis did not finish before intent routing: "
                f"material={analyzed_material}"
            )

        def send_generation_intent(
            command: str,
            *,
            label: str,
            target_tool: str,
            artifact_type: str,
        ) -> dict[str, Any]:
            thread_before_command = verifier.api(
                verifier.teacher,
                "GET",
                f"teaching/threads/{verifier.thread_id}",
            )["thread"]
            existing_message_ids = {
                str(item.get("id"))
                for item in thread_before_command.get("messages") or []
            }
            sent = driver.execute(
                f"""
                const input = document.getElementById('teaching-input');
                const send = document.getElementById('teaching-send');
                if (!input || input.disabled || !send) return false;
                input.value = {command!r};
                input.dispatchEvent(new Event('input', {{bubbles: true}}));
                if (send.disabled) return false;
                send.click();
                return true;
                """
            )
            if sent is not True:
                raise RuntimeError(f"browser could not send {label} intent")

            deadline = time.monotonic() + 60
            new_messages: list[dict[str, Any]] = []
            user_message = None
            job_message = None
            while time.monotonic() < deadline:
                current_thread = verifier.api(
                    verifier.teacher,
                    "GET",
                    f"teaching/threads/{verifier.thread_id}",
                )["thread"]
                new_messages = [
                    item
                    for item in current_thread.get("messages") or []
                    if str(item.get("id")) not in existing_message_ids
                ]
                failed_messages = [
                    item
                    for item in new_messages
                    if item.get("role") == "assistant"
                    and (
                        (item.get("metadata") or {}).get("failed") is True
                        or str(
                            (item.get("metadata") or {}).get("presentation") or ""
                        ).lower()
                        == "error"
                    )
                ]
                if failed_messages:
                    raise RuntimeError(
                        f"{label} intent failed: {failed_messages[-1]}"
                    )
                user_message = next(
                    (
                        item
                        for item in new_messages
                        if item.get("role") == "user"
                        and str(item.get("content") or "").strip() == command
                    ),
                    None,
                )
                job_message = next(
                    (
                        item
                        for item in new_messages
                        if item.get("role") == "assistant"
                        and (item.get("metadata") or {}).get("jobId")
                        and (item.get("metadata") or {}).get("jobKind")
                        == "agent.chat"
                    ),
                    None,
                )
                if user_message is not None and job_message is not None:
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(
                    f"browser did not persist a new {label} command and job: "
                    f"newMessages={new_messages}"
                )

            job_id = str((job_message.get("metadata") or {}).get("jobId") or "")
            job = verifier.wait_job(job_id)
            result = job.get("result") or {}
            deadline = time.monotonic() + verifier.job_timeout
            option_messages: list[dict[str, Any]] = []
            while time.monotonic() < deadline:
                current_thread = verifier.api(
                    verifier.teacher,
                    "GET",
                    f"teaching/threads/{verifier.thread_id}",
                )["thread"]
                new_messages = [
                    item
                    for item in current_thread.get("messages") or []
                    if str(item.get("id")) not in existing_message_ids
                ]
                failed_messages = [
                    item
                    for item in new_messages
                    if item.get("role") == "assistant"
                    and (
                        (item.get("metadata") or {}).get("failed") is True
                        or str(
                            (item.get("metadata") or {}).get("presentation") or ""
                        ).lower()
                        == "error"
                    )
                ]
                if failed_messages:
                    raise RuntimeError(
                        f"{label} intent failed after completion: {failed_messages[-1]}"
                    )
                option_messages = [
                    item
                    for item in new_messages
                    if item.get("role") == "assistant"
                    and (item.get("metadata") or {}).get("generationOptions")
                ]
                if option_messages:
                    break
                time.sleep(0.5)
            if len(option_messages) != 1:
                raise RuntimeError(
                    f"{label} intent did not produce one new option message: "
                    f"messages={new_messages}"
                )

            source_message = option_messages[0]
            source_job_id = str(
                (source_message.get("metadata") or {}).get("jobId") or ""
            )
            source_job = verifier.wait_job(source_job_id)
            source_result = source_job.get("result") or {}
            bundle = (source_message.get("metadata") or {}).get(
                "generationOptions"
            ) or {}
            options = bundle.get("options") or []
            bound_scope = bundle.get("boundScope") or {}
            bound_scope_present = any(
                bound_scope.get(key) is not None
                for key in ("dojoId", "moduleIndex")
            )
            bound_scope_mismatch = bound_scope_present and (
                str(bound_scope.get("dojoId")) != str(verifier.course["id"])
                or str(bound_scope.get("moduleIndex"))
                != str(verifier.module["index"])
            )
            source_material_ids = {
                str(item.get("id"))
                for item in bundle.get("sourceRefs") or []
                if isinstance(item, dict) and item.get("type") == "material"
            }
            formal_tools = {
                str(proposal.get("tool") or "")
                for message in new_messages
                for proposal in (
                    (message.get("metadata") or {}).get("toolProposals") or []
                )
                if isinstance(proposal, dict)
            }
            for job_result in (result, source_result):
                formal_tools.update(
                    str(proposal.get("tool") or "")
                    for proposal in job_result.get("toolProposals") or []
                    if isinstance(proposal, dict)
                )
            if (
                bundle.get("targetTool") != target_tool
                or bundle.get("artifactType") != artifact_type
                or len(options) != 3
                or material_id not in source_material_ids
                or bound_scope_mismatch
                or {"candidate.generate", "challenge.generate"}.intersection(
                    formal_tools
                )
            ):
                raise RuntimeError(
                    f"{label} intent crossed the generation boundary incorrectly: "
                    f"bundle={bundle}, formalTools={sorted(formal_tools)}"
                )

            message_id = str(source_message.get("id") or "")
            picker = driver.wait_for(
                f"""
                const node = document.querySelector(
                  '[data-generation-option-picker-message="{message_id}"]'
                );
                if (!node) return null;
                node.scrollIntoView({{block: 'center'}});
                const rect = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                const panels = Array.from(
                  node.querySelectorAll('[data-generation-option-panel]')
                );
                const visiblePanels = panels.filter(panel =>
                  !panel.hidden && getComputedStyle(panel).display !== 'none'
                );
                if (style.display === 'none' || style.visibility === 'hidden'
                    || rect.width <= 0 || rect.height <= 0) return null;
                return {{
                  panels: panels.length,
                  visiblePanels: visiblePanels.length,
                  tabs: node.querySelectorAll('[data-generation-option-view-id]').length,
                  selectors: node.querySelectorAll(
                    '.teaching-generation-option-select'
                  ).length,
                  counter: node.querySelector(
                    '[data-generation-option-counter]'
                  )?.textContent.trim() || '',
                }};
                """,
                timeout=60,
                label=f"visible {label} generation-option picker",
            )
            expected_counter = (
                f"{int((bundle.get('baseArguments') or {}).get('challengeCount') or 0)} 道题 · 1 / 3"
                if target_tool == "challenge.generate"
                and int((bundle.get("baseArguments") or {}).get("challengeCount") or 0) > 1
                else "1 / 3"
            )
            if (
                int(picker["panels"]) != 3
                or int(picker["visiblePanels"]) != 1
                or int(picker["tabs"]) != 3
                or int(picker["selectors"]) != 3
                or picker["counter"] != expected_counter
            ):
                raise RuntimeError(
                    f"{label} generation-option picker is incomplete: {picker}"
                )

            deadline = time.monotonic() + 60
            routed_thread = None
            while time.monotonic() < deadline:
                routed_thread = verifier.api(
                    verifier.teacher,
                    "GET",
                    f"teaching/threads/{verifier.thread_id}",
                )["thread"]
                if (
                    str(routed_thread.get("dojoId"))
                    == str(verifier.course["id"])
                    and str(routed_thread.get("moduleIndex"))
                    == str(verifier.module["index"])
                ):
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(
                    f"{label} intent did not bind the requested course chapter: "
                    f"thread={routed_thread}"
                )
            return bundle

        slide_command = (
            f"请基于刚上传的附件，为课程“{verifier.course_name}”的章节"
            f"“{target_module_name}”生成一份明确恰好 14 页的页面式课件；"
            "每一页都必须配有与该页内容同步、可直接讲授的教师讲稿。"
            "请先提供三套候选方案，在我选择前不要开始正式生成。"
        )
        slide_bundle = send_generation_intent(
            slide_command,
            label="14-page slide deck",
            target_tool="candidate.generate",
            artifact_type="slide-deck",
        )
        invalid_slide_prompts = []
        for option in slide_bundle.get("options") or []:
            prompt = re.sub(r"\s+", "", str(option.get("rewrittenPrompt") or ""))
            preserves_page_count = re.search(r"14(?:个)?页(?:面)?", prompt) is not None
            preserves_per_page_notes = "讲稿" in prompt and any(
                marker in prompt
                for marker in ("逐页", "每页", "每一页", "各页", "所有页面")
            )
            if not preserves_page_count or not preserves_per_page_notes:
                invalid_slide_prompts.append(option)
        if invalid_slide_prompts:
            raise RuntimeError(
                "not every slide-deck option preserved 14 pages and per-page notes: "
                f"options={invalid_slide_prompts}"
            )

        ctf_command = (
            f"请基于刚上传的附件，为课程“{verifier.course_name}”的章节"
            f"“{target_module_name}”一次生成 5 道彼此独立的动态 Flag CTF 实践题；"
            "每道题都要有独立隔离环境、解题路径和动态 Flag，不能合并成一道多问题目。"
            "请先提供三套整批候选方案，在我选择前不要开始正式生成。"
        )
        ctf_bundle = send_generation_intent(
            ctf_command,
            label="five independent dynamic-Flag CTFs",
            target_tool="challenge.generate",
            artifact_type="ctf-challenge",
        )
        if (
            int(
                (ctf_bundle.get("baseArguments") or {}).get("challengeCount") or 0
            )
            != 5
        ):
            raise RuntimeError(
                "five-CTF intent did not preserve challengeCount=5: "
                f"bundle={ctf_bundle}"
            )

        simulation_command = (
            f"请基于刚上传的附件，为课程“{verifier.course_name}”的章节"
            f"“{target_module_name}”生成一个平台原生模拟演示：学生必须能够实际操作、"
            "随时重置，并清晰看到每次操作引起的状态变化。"
            "请先提供三套候选方案，在我选择前不要开始正式生成。"
        )
        send_generation_intent(
            simulation_command,
            label="resettable stateful simulation",
            target_tool="candidate.generate",
            artifact_type="simulation",
        )

        suggestion_prefill = driver.execute(
            """
            const button = document.querySelector('[data-agent-suggestion-message]');
            button.click();
            return document.getElementById('teaching-input').value;
            """
        )
        if not str(suggestion_prefill).startswith("帮我把这份文件添加到课程"):
            raise RuntimeError(
                f"attachment suggestion is not a directly sendable command: {suggestion_prefill}"
            )

        command = (
            f"帮我把刚上传的文件添加到课程“{verifier.course_name}”的章节"
            f"“{target_module_name}”资料中。"
        )
        thread_before_placement = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        placement_existing_message_ids = [
            str(item.get("id"))
            for item in thread_before_placement.get("messages") or []
        ]
        driver.execute(
            f"""
            const input = document.getElementById('teaching-input');
            input.value = {command!r};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            document.getElementById('teaching-send').click();
            return true;
            """
        )
        result_ui = driver.wait_for(
            f"""
            const existing = new Set({json.dumps(placement_existing_message_ids)});
            const messages = Array.from(
              document.querySelectorAll('.teaching-message[data-message-id]')
            ).filter(node => !existing.has(String(node.dataset.messageId)));
            const result = messages.find(node =>
              node.textContent.includes('已将文件')
              && node.textContent.includes({verifier.course_name!r})
              && node.textContent.includes({target_module_name!r})
              && node.textContent.includes('资料中')
            );
            if (!result) return null;
            const failed = messages.some(node => node.classList.contains('is-error'));
            return {{
              text: result.textContent.trim(),
              hasCourseCard: Boolean(result.querySelector('a.course-operation-card')),
              failed,
              inputEnabled: !document.getElementById('teaching-input').disabled,
            }};
            """,
            timeout=600,
            label="natural-language attachment placement result",
        )
        if (
            result_ui["failed"]
            or not result_ui["hasCourseCard"]
            or not result_ui["inputEnabled"]
        ):
            raise RuntimeError(f"attachment placement UI is incomplete: {result_ui}")

        final_thread = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        final_attachment = next(
            (
                item
                for item in (final_thread.get("context") or {}).get(
                    "pendingAttachments", []
                )
                if str(item.get("id")) == material_id
            ),
            None,
        )
        final_dojo_id = final_thread.get("dojoId")
        final_module_index = final_thread.get("moduleIndex")
        if (
            final_attachment is None
            or final_attachment.get("status") != "PLACED"
            or final_dojo_id is None
            or int(final_dojo_id) != int(verifier.course["id"])
            or final_module_index is None
            or int(final_module_index)
            != int(verifier.module["index"])
        ):
            raise RuntimeError(
                "natural-language placement did not bind the attachment and thread: "
                f"attachment={final_attachment}, "
                f"threadScope=({final_thread.get('dojoId')}, "
                f"{final_thread.get('moduleIndex')})"
            )

        module_url = (
            f"{module.BASE_URL}/{verifier.course['referenceId']}/"
            f"{verifier.module['id']}#module-content"
        )
        driver.navigate(module_url)
        module_resource = driver.wait_for(
            f"""
            const rows = Array.from(document.querySelectorAll('#module-content .accordion-item'));
            const row = rows.find(node => node.textContent.includes({filename!r}));
            if (!row) return null;
            const link = Array.from(row.querySelectorAll('a')).find(node =>
              (node.getAttribute('href') || '').includes(
                '/pwncollege_api/v1/teaching/materials/{material_id}/download'
              )
            );
            return link ? {{name: row.textContent.trim(), href: link.getAttribute('href')}} : null;
            """,
            timeout=60,
            label="uploaded original file in named chapter resources",
        )
        if material_id not in str(module_resource["href"]):
            raise RuntimeError(
                f"chapter resource download does not point to the uploaded file: {module_resource}"
            )
        print(
            "PASS  global Agent asks how to use an upload, offers three grounded plans "
            "for slides, five CTFs, and a simulation, then places the original file "
            "in the named course chapter",
            flush=True,
        )
    finally:
        if driver is not None:
            driver.close()
        fixture_dir.cleanup()
        verifier.cleanup()


def prepare_management_fixture(verifier, module) -> None:
    """Create and exercise disposable teacher-owned management content."""

    if verifier.teacher is None or verifier.thread_id is None:
        raise RuntimeError("teacher management fixture cannot be created")
    created = verifier.execute_course_tool(
        {
            "tool": "course.create",
            "arguments": {
                "name": f"课程管理验收 {verifier.suffix}",
                "slug": verifier.course_slug,
                "access": "private",
            },
            "requiresConfirmation": True,
        }
    )
    verifier.course = created["result"]["course"]
    reference = verifier.course["referenceId"]
    renamed = verifier.api(
        verifier.teacher,
        "PATCH",
        f"teaching/courses/{reference}",
        json_body={"name": f"教师课程管理 {verifier.suffix}"},
    )["course"]
    verifier.course = {**verifier.course, **renamed}

    module_data = verifier.execute_course_tool(
        {
            "tool": "module.create",
            "arguments": {
                "id": "management-basics",
                "name": "内容管理基础",
                "description": "用于验证教师课程内容的常规管理能力。",
            },
            "requiresConfirmation": True,
        }
    )["result"]["module"]
    renamed_module = verifier.api(
        verifier.teacher,
        "PATCH",
        f"teaching/courses/{reference}/modules/{module_data['index']}",
        json_body={"name": "课件与实训管理"},
    )["module"]
    verifier.module = {**module_data, **renamed_module}

    removable_module = verifier.execute_course_tool(
        {
            "tool": "module.create",
            "arguments": {"id": "temporary-module", "name": "待删除章节"},
            "requiresConfirmation": True,
        }
    )["result"]["module"]
    removed_module = verifier.api(
        verifier.teacher,
        "DELETE",
        f"teaching/courses/{reference}/modules/{removable_module['index']}",
    )
    if not removed_module.get("deleted"):
        raise RuntimeError("managed module deletion did not report success")

    assignment_payload = {
        "title": "内容管理评测",
        "kind": "QUIZ",
        "moduleIndex": verifier.module["index"],
        "description": "用于验证教师端评测管理。",
        "items": [
            {
                "type": "SHORT_ANSWER",
                "title": "最小权限",
                "prompt": "说明最小权限原则，并给出一个课程实训中的应用示例。",
                "points": 10,
                "config": {"rubric": "概念准确并包含可执行示例。"},
            }
        ],
    }
    assignment = verifier.api(
        verifier.teacher,
        "POST",
        f"coursework/dojos/{reference}/assignments",
        json_body=assignment_payload,
        statuses=(201,),
    )["assignment"]
    assignment = verifier.api(
        verifier.teacher,
        "PATCH",
        f"coursework/assignments/{assignment['id']}",
        json_body={"title": "可编辑的内容管理评测"},
    )["assignment"]
    verifier.assignments.append(assignment)

    disposable_assignment = verifier.api(
        verifier.teacher,
        "POST",
        f"coursework/dojos/{reference}/assignments",
        json_body={**assignment_payload, "title": "待删除评测"},
        statuses=(201,),
    )["assignment"]
    verifier.api(
        verifier.teacher,
        "DELETE",
        f"coursework/assignments/{disposable_assignment['id']}",
    )

    upload = verifier.teacher.post(
        module.api_url("teaching/materials"),
        files={
            "file": (
                "management-guide.txt",
                "课件管理、CTF 实践题与模拟实训统一教学流程。".encode(),
                "text/plain",
            )
        },
        data={"dojoId": str(verifier.course["id"]), "threadId": verifier.thread_id},
        timeout=120,
    )
    uploaded = module.unwrap(upload, (202,))
    verifier.material_id = uploaded["materialId"]
    completed_job = verifier.wait_job(uploaded["job"]["id"])
    target = completed_job.get("resultTarget") or {}
    if (
        target.get("kind") != "link"
        or "tab=courseware" not in str(target.get("href") or "")
        or str(verifier.material_id) not in str(target.get("href") or "")
    ):
        raise RuntimeError(f"material result target is missing or incorrect: {target}")
    material = verifier.api(
        verifier.teacher,
        "PATCH",
        f"teaching/materials/{verifier.material_id}",
        json_body={"title": "可编辑的课程资料"},
    )["material"]
    if material.get("title") != "可编辑的课程资料":
        raise RuntimeError("material rename did not persist")

    secondary = verifier.execute_course_tool(
        {
            "tool": "course.create",
            "arguments": {
                "name": "待删除课程",
                "slug": f"{verifier.course_slug}-delete",
                "access": "private",
            },
            "requiresConfirmation": True,
        }
    )["result"]["course"]
    verifier.api(
        verifier.teacher,
        "PATCH",
        f"teaching/threads/{verifier.thread_id}",
        json_body={
            "dojoId": verifier.course["id"],
            "moduleIndex": verifier.module["index"],
        },
    )
    deleted = verifier.api(
        verifier.teacher,
        "DELETE",
        f"teaching/courses/{secondary['referenceId']}",
    )
    if not deleted.get("deleted"):
        raise RuntimeError("managed course deletion did not report success")
    verifier.ledger.pass_(
        "teacher course, module, material and assessment rename/delete APIs"
    )
    verifier.ledger.pass_("completed material task exposes its exact courseware result")


def cleanup_management_fixture(verifier) -> None:
    if verifier.teacher is None or verifier.course is None:
        return
    try:
        verifier.api(
            verifier.teacher,
            "DELETE",
            f"teaching/courses/{verifier.course['referenceId']}",
            timeout=360,
        )
        verifier.course = None
        verifier.ledger.pass_("disposable managed course removed through teacher API")
    except Exception as error:
        print(
            f"WARN  managed course cleanup will fall back to administrator cleanup: {error}",
            flush=True,
        )


def verify_ui(
    verifier,
    module,
    screenshot_path: pathlib.Path | None = None,
    course_screenshot_path: pathlib.Path | None = None,
    theme_screenshot_dir: pathlib.Path | None = None,
) -> None:
    if verifier.teacher is None:
        raise RuntimeError("teacher session is unavailable")
    suggestion_fixture_message_id = prepare_imperative_suggestion_fixture(
        verifier, module
    )
    driver = ChromeDriver()

    def click_required(selector: str, label: str, timeout: int = 15) -> None:
        selector_js = json.dumps(selector)
        driver.wait_for(
            f"const node=document.querySelector({selector_js});"
            "return Boolean(node && !node.disabled);",
            timeout=timeout,
            label=label,
        )
        clicked = driver.execute(
            f"const node=document.querySelector({selector_js});"
            "if(!node||node.disabled)return false;node.click();return true;"
        )
        if not clicked:
            raise RuntimeError(f"{label} disappeared before activation")

    try:
        driver.navigate(module.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(f"{module.BASE_URL}/teacher")
        dashboard = driver.wait_for(
            """
            const dashboard = document.getElementById('teaching-dashboard');
            const conversation = document.querySelector('.teaching-conversation');
            const sections = Array.from(document.querySelectorAll('.teaching-dashboard-grid > section'));
            const updated = document.getElementById('teaching-dashboard-updated')?.textContent.trim() || '';
            if (document.readyState !== 'complete' || !dashboard || dashboard.hidden || updated.includes('正在')) return null;
            return {
              title: document.title,
              headings: sections.map(node => node.querySelector('h2')?.textContent.trim()),
              dashboardHidden: dashboard.hidden,
              dashboardAriaHidden: dashboard.getAttribute('aria-hidden'),
              conversationInert: conversation?.inert,
              conversationAriaHidden: conversation?.getAttribute('aria-hidden'),
              sidebarInert: document.getElementById('teaching-sidebar')?.inert,
              activeThread: document.querySelector('[data-thread-row].is-active')?.dataset.threadRow || '',
              courseOptions: document.getElementById('teaching-dashboard-course')?.options.length || 0,
              moduleOptions: document.getElementById('teaching-dashboard-module')?.options.length || 0,
              navigation: Array.from(document.querySelectorAll('.product-primary-nav .nav-link span')).map(node => node.textContent.trim()),
              navigationHrefs: Array.from(document.querySelectorAll('.product-primary-nav .nav-link')).map(node => new URL(node.href).pathname + new URL(node.href).search),
              dashboardRequests: performance.getEntriesByType('resource').map(entry => new URL(entry.name, location.origin)).filter(url => url.pathname.endsWith('/teaching/dashboard')).length,
              bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
            """,
            timeout=45,
            label="teacher decision dashboard",
        )
        if (
            dashboard["title"] != "教师工作台 · 玄甲"
            or dashboard["headings"] != ["需要我处理", "AI 任务", "最近课程", "学情变化"]
            or dashboard["dashboardHidden"]
            or dashboard["dashboardAriaHidden"] != "false"
            or not dashboard["conversationInert"]
            or dashboard["conversationAriaHidden"] != "true"
            or not dashboard["sidebarInert"]
            or dashboard["activeThread"]
            or int(dashboard["courseOptions"]) < 2
            or int(dashboard["moduleOptions"]) < 1
            or dashboard["navigation"] != ["工作台", "课程中心", "AI 共创"]
            or dashboard["navigationHrefs"] != ["/teacher", "/teacher/courses", "/teacher?view=conversation"]
            or int(dashboard["dashboardRequests"]) < 1
            or float(dashboard["bodyOverflow"]) > 1
        ):
            raise RuntimeError(f"teacher dashboard does not use persistent cross-course facts: {dashboard}")
        if theme_screenshot_dir is not None:
            theme_screenshot_dir.mkdir(parents=True, exist_ok=True)
            driver.screenshot(theme_screenshot_dir / "teacher-dashboard-1440.png")
        for width, height in ((390, 844), (320, 568)):
            driver.set_window_size(width, height)
            mobile_dashboard = driver.wait_for(
                """
                const prompts = Array.from(document.querySelectorAll('[data-dashboard-prompt]'));
                const visible = prompts.filter(node => node.offsetParent !== null);
                const more = document.getElementById('teaching-dashboard-more-actions');
                if (!more || more.offsetParent === null) return null;
                return {
                  visible: visible.length,
                  moreText: more.textContent.trim(),
                  moreExpanded: more.getAttribute('aria-expanded'),
                  minimumHeight: Math.min(...visible.concat(more).map(node => node.getBoundingClientRect().height)),
                  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                };
                """,
                timeout=15,
                label=f"{width}px teacher dashboard actions",
            )
            if (
                int(mobile_dashboard["visible"]) != 2
                or mobile_dashboard["moreText"] != "更多"
                or mobile_dashboard["moreExpanded"] != "false"
                or float(mobile_dashboard["minimumHeight"]) < 44
                or float(mobile_dashboard["overflow"]) > 1
            ):
                raise RuntimeError(f"{width}px dashboard actions are clipped: {mobile_dashboard}")
            expanded_actions = driver.execute(
                """
                const more = document.getElementById('teaching-dashboard-more-actions');
                more.click();
                return {
                  visible: Array.from(document.querySelectorAll('[data-dashboard-prompt]')).filter(node => node.offsetParent !== null).length,
                  expanded: more.getAttribute('aria-expanded'),
                  text: more.textContent.trim(),
                  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                };
                """
            )
            if (
                int(expanded_actions["visible"]) != 4
                or expanded_actions["expanded"] != "true"
                or expanded_actions["text"] != "收起"
                or float(expanded_actions["overflow"]) > 1
            ):
                raise RuntimeError(f"{width}px dashboard More action is incomplete: {expanded_actions}")
            driver.execute("document.getElementById('teaching-dashboard-more-actions').click(); return true;")
            if theme_screenshot_dir is not None and width == 390:
                driver.screenshot(theme_screenshot_dir / "teacher-dashboard-390.png")
        print("PASS  direct /teacher opens the factual decision dashboard and mobile actions use two-plus-More", flush=True)

        driver.set_window_size(1440, 1000)
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={urllib.parse.quote(verifier.thread_id, safe='')}"
        )
        driver.wait_for(
            f"""
            const active = document.querySelector('[data-thread-row].is-active');
            const conversation = document.querySelector('.teaching-conversation');
            return document.readyState === 'complete'
              && active?.dataset.threadRow === {verifier.thread_id!r}
              && !conversation?.inert
              && conversation?.getAttribute('aria-hidden') === 'false';
            """,
            timeout=45,
            label="explicit Agent conversation",
        )

        layout = driver.execute(
            """
            const shell = document.getElementById('teacher-agent');
            const rect = shell.getBoundingClientRect();
            const animated = Array.from(document.querySelectorAll(
              '.teaching-agent-mark, .teaching-empty-mark, .teaching-message-avatar, .fa-spin'
            )).filter(node => {
              const style = getComputedStyle(node);
              return style.animationName !== 'none' && style.animationDuration !== '0s';
            }).length;
            return {
              viewport: window.innerHeight,
              shellTop: rect.top,
              shellBottom: rect.bottom,
              pageHeight: document.documentElement.scrollHeight,
              bodyOverflow: getComputedStyle(document.body).overflow,
              hiddenDojo: document.getElementById('teaching-dojo')
                ? getComputedStyle(document.getElementById('teaching-dojo')).display
                : 'absent',
              hiddenModule: document.getElementById('teaching-module')
                ? getComputedStyle(document.getElementById('teaching-module')).display
                : 'absent',
              sidebarWidth: document.getElementById('teaching-sidebar').getBoundingClientRect().width,
              searchDisplay: getComputedStyle(document.getElementById('teaching-thread-search')).display,
              threadListTag: document.getElementById('teaching-thread-list').tagName,
              animated,
              quickPrompts: Array.from(document.querySelectorAll('.teaching-quick-prompts button'))
                .map(node => node.textContent.trim()),
              quickPromptFont: parseFloat(getComputedStyle(document.querySelector('.teaching-quick-prompts button')).fontSize),
              composerFont: parseFloat(getComputedStyle(document.getElementById('teaching-input')).fontSize),
              threadTitleFont: parseFloat(getComputedStyle(document.querySelector('.teaching-thread-item-title strong')).fontSize),
              threadSummaryFont: parseFloat(getComputedStyle(document.querySelector('.teaching-thread-open small')).fontSize),
              headerSubtitlePresent: !!document.getElementById('teaching-thread-subtitle'),
              headerThreadActionsPresent: !!document.getElementById('teaching-current-thread-actions'),
              liveStatusPresent: !!document.getElementById('teaching-live-status'),
              transcriptModes: Array.from(document.querySelectorAll('button[data-transcript-mode]'))
                .map(node => ({label: node.textContent.trim(), active: node.getAttribute('aria-pressed')})),
              messageRole: document.getElementById('teaching-messages')?.getAttribute('role'),
              currentRunPresent: !!document.getElementById('teaching-current-run'),
              uploadLabel: document.querySelector('.teaching-upload-label')?.textContent.trim(),
              navigation: Array.from(document.querySelectorAll('.product-primary-nav .nav-link span'))
                .map(node => node.textContent.trim()),
              navigationHrefs: Array.from(document.querySelectorAll('.product-primary-nav .nav-link'))
                .map(node => new URL(node.href).pathname + new URL(node.href).search),
              leakedBackendTerms: ['OpenMAIC', 'Dojo', 'Studio'].filter(term =>
                document.body.innerText.includes(term)
              ),
              teachingRequests: performance.getEntriesByType('resource')
                .map(entry => new URL(entry.name, location.origin))
                .filter(url => url.pathname.startsWith('/pwncollege_api/v1/teaching/'))
                .map(url => url.pathname + url.search),
              domReadyMs: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
              userMessageAlignment: (() => {
                const message = document.querySelector('.teaching-message.is-user');
                const body = message?.querySelector('.teaching-message-body');
                const avatar = message?.querySelector('.teaching-message-avatar');
                if (!message || !body || !avatar) return null;
                const messageRect = message.getBoundingClientRect();
                const bodyRect = body.getBoundingClientRect();
                const avatarRect = avatar.getBoundingClientRect();
                return {
                  direction: getComputedStyle(message).flexDirection,
                  messageRight: messageRect.right,
                  bodyRight: bodyRect.right,
                  avatarLeft: avatarRect.left,
                  avatarRight: avatarRect.right,
                };
              })(),
            };
            """
        )
        if abs(float(layout["shellBottom"]) - float(layout["viewport"])) > 2:
            raise RuntimeError(
                f"global Agent shell leaves page-bottom whitespace: {layout}"
            )
        if int(layout["pageHeight"]) > int(layout["viewport"]) + 2:
            raise RuntimeError(
                f"global Agent page unexpectedly scrolls outside its shell: {layout}"
            )
        if layout["bodyOverflow"] != "hidden":
            raise RuntimeError(
                f"global Agent body overflow is not constrained: {layout}"
            )
        if layout["hiddenDojo"] not in {"none", "absent"} or layout[
            "hiddenModule"
        ] not in {"none", "absent"}:
            raise RuntimeError(
                "course or module selector is visible in the global Agent"
            )
        if layout["headerSubtitlePresent"]:
            raise RuntimeError(
                "global Agent restored the redundant conversation subtitle"
            )
        if layout["headerThreadActionsPresent"]:
            raise RuntimeError(
                "global Agent restored the redundant header conversation menu"
            )
        user_alignment = layout["userMessageAlignment"]
        if (
            not user_alignment
            or user_alignment["direction"] != "row"
            or float(user_alignment["avatarLeft"])
            < float(user_alignment["bodyRight"]) - 1
            or abs(
                float(user_alignment["messageRight"])
                - float(user_alignment["avatarRight"])
            )
            > 2
        ):
            raise RuntimeError(
                f"teacher avatar is not placed to the right of its message: {layout}"
            )
        if layout["transcriptModes"] or layout["liveStatusPresent"]:
            raise RuntimeError(
                f"global Agent restored redundant header controls: {layout}"
            )
        if layout["messageRole"] != "log" or layout["currentRunPresent"]:
            raise RuntimeError(
                f"global Agent live region or idle state is incorrect: {layout}"
            )
        if layout["uploadLabel"] != "上传文件":
            raise RuntimeError(
                f"global Agent still treats every attachment as courseware: {layout}"
            )
        if float(layout["sidebarWidth"]) < 260:
            raise RuntimeError(f"conversation sidebar is not usable: {layout}")
        if layout["searchDisplay"] == "none" or layout["threadListTag"] != "DIV":
            raise RuntimeError(f"conversation management UI is missing: {layout}")
        if int(layout["animated"]) != 0:
            raise RuntimeError("global Agent contains an animated decorative marker")
        if layout["quickPrompts"] != [
            "生成课件",
            "生成 CTF 实践题",
            "生成实训演示",
            "分析学情",
        ]:
            raise RuntimeError(
                f"unexpected global Agent quick actions: {layout['quickPrompts']}"
            )
        if layout["leakedBackendTerms"]:
            raise RuntimeError(
                f"global Agent exposes backend implementation terms: {layout['leakedBackendTerms']}"
            )
        forbidden_boot_requests = (
            "/pwncollege_api/v1/teaching/materials",
            "/pwncollege_api/v1/teaching/artifacts",
            "/pwncollege_api/v1/teaching/progress/",
            "/pwncollege_api/v1/teaching/sessions",
        )
        if any(
            request.startswith(forbidden_boot_requests)
            for request in layout["teachingRequests"]
        ) or any(
            request.startswith("/pwncollege_api/v1/teaching/actions")
            and not request.startswith(
                "/pwncollege_api/v1/teaching/actions?status=AWAITING_APPROVAL&dojoId="
            )
            for request in layout["teachingRequests"]
        ):
            raise RuntimeError(
                f"global Agent restored hidden boot requests: {layout['teachingRequests']}"
            )
        core_boot_requests = [
            request
            for request in layout["teachingRequests"]
            if "/teaching/jobs/" not in request
            and not request.startswith("/pwncollege_api/v1/teaching/dashboard")
        ]
        if len(core_boot_requests) > 4 or float(layout["domReadyMs"]) > 10000:
            raise RuntimeError(f"global Agent boot path regressed: {layout}")
        if layout["navigation"] != ["工作台", "课程中心", "AI 共创"]:
            raise RuntimeError(
                f"teacher navigation is not simplified: {layout['navigation']}"
            )
        if layout["navigationHrefs"] != ["/teacher", "/teacher/courses", "/teacher?view=conversation"]:
            raise RuntimeError(
                f"teacher course-center navigation does not start from the list: {layout}"
            )
        if float(layout["quickPromptFont"]) < 13 or float(layout["composerFont"]) < 16:
            raise RuntimeError(f"global Agent text remains too small: {layout}")
        if (
            float(layout["threadTitleFont"]) < 16
            or float(layout["threadSummaryFont"]) < 15
        ):
            raise RuntimeError(
                f"conversation navigation text remains too small: {layout}"
            )
        print(
            "PASS  browser layout is readable and exposes the workbench, course center, and AI co-creation",
            flush=True,
        )

        theme_controls = driver.execute(
            """
            return {
              toggles: document.querySelectorAll('[data-theme-toggle]').length,
              options: document.querySelectorAll('[data-theme-option]').length,
              visibleThemeText: Array.from(document.querySelectorAll('button, a')).some(node => node.offsetParent !== null && node.textContent.trim() === '主题'),
            };
            """
        )
        if theme_controls != {"toggles": 0, "options": 0, "visibleThemeText": False}:
            raise RuntimeError(f"removed theme selector returned to the teacher UI: {theme_controls}")
        print("PASS  the redundant theme selector is absent from the teacher UI", flush=True)

        original_thread_id = driver.execute(
            "return document.querySelector('[data-thread-row].is-active').dataset.threadRow;"
        )
        if original_thread_id != verifier.thread_id:
            raise RuntimeError(
                "imperative suggestion fixture conversation was not selected: "
                f"expected {verifier.thread_id}, received {original_thread_id}"
            )
        click_required(
            "#teaching-new-thread",
            "new conversation control after theme navigation",
        )
        ephemeral = driver.wait_for(
            """
            const active = document.querySelector('[data-thread-row].is-active');
            const input = document.getElementById('teaching-input');
            return !active && input && document.activeElement === input
              ? {
                  title: document.getElementById('teaching-thread-title')?.textContent.trim(),
                  empty: document.getElementById('teaching-messages')?.textContent.includes('直接说出你想完成的工作'),
                }
              : null;
            """,
            timeout=30,
            label="ephemeral new conversation",
        )
        if ephemeral["title"] != "新教学对话" or not ephemeral["empty"]:
            raise RuntimeError(f"new conversation is not an empty local draft: {ephemeral}")
        created_thread = verifier.api(
            verifier.teacher,
            "POST",
            "teaching/threads",
            json_body={"title": "浏览器会话管理待命"},
            statuses=(201,),
        )["thread"]
        created_thread_id = created_thread["id"]
        driver.navigate(
            f"{module.BASE_URL}/teacher?view=conversation&thread={urllib.parse.quote(created_thread_id, safe='')}"
        )
        driver.wait_for(
            f"""
            const active = document.querySelector('[data-thread-row].is-active');
            return active?.dataset.threadRow === {created_thread_id!r}
              && document.getElementById('teaching-thread-title')?.textContent === '浏览器会话管理待命';
            """,
            timeout=45,
            label="persisted conversation fixture",
        )
        managed_title = "浏览器会话管理验收"
        click_required(
            "[data-thread-row].is-active [data-thread-menu]",
            "new conversation menu",
        )
        driver.wait_for(
            "return !document.getElementById('teaching-thread-action-menu').hidden;",
            timeout=10,
            label="conversation action menu",
        )
        click_required(
            '[data-thread-action="rename"]',
            "rename action in the conversation menu",
        )
        driver.wait_for(
            "return !!document.querySelector('.aisecedu-dialog-input input');",
            timeout=10,
            label="rename dialog",
        )
        driver.execute(
            f"""
            const input = document.querySelector('.aisecedu-dialog-input input');
            if (!input) return false;
            input.value = {managed_title!r};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            return true;
            """
        )
        click_required('[data-dialog-action="confirm"]', "rename confirmation")
        driver.wait_for(
            f"return document.getElementById('teaching-thread-title').textContent === {managed_title!r};",
            timeout=30,
            label="renamed conversation",
        )

        driver.execute(
            f"""
            const input = document.getElementById('teaching-thread-search');
            input.value = {managed_title[3:8]!r};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            return true;
            """
        )
        driver.wait_for(
            f"""
            const rows = Array.from(document.querySelectorAll('[data-thread-row]'));
            return rows.length === 1 && rows[0].dataset.threadRow === {created_thread_id!r};
            """,
            timeout=30,
            label="conversation content search",
        )
        driver.execute(
            """
            const input = document.getElementById('teaching-thread-search');
            input.value = '';
            input.dispatchEvent(new Event('input', {bubbles: true}));
            return true;
            """
        )
        driver.wait_for(
            "return document.querySelectorAll('[data-thread-row]').length >= 2;",
            timeout=30,
            label="cleared conversation search",
        )

        click_required(
            "[data-thread-row].is-active [data-thread-menu]",
            "conversation menu before pin",
        )
        click_required('[data-thread-action="pin"]', "pin conversation action")
        driver.wait_for(
            f"""
            const first = document.querySelector('.teaching-thread-group');
            const row = document.querySelector("[data-thread-row='{created_thread_id}']");
            return first && first.querySelector('h2').textContent.trim() === '置顶'
              && row && !!row.querySelector('.fa-thumbtack');
            """,
            timeout=30,
            label="pinned conversation",
        )

        click_required(
            "[data-thread-row].is-active [data-thread-menu]",
            "conversation menu before archive",
        )
        click_required(
            '[data-thread-action="archive"]',
            "archive conversation action",
        )
        driver.wait_for(
            f"""
            const active = document.querySelector('[data-thread-row].is-active');
            return active && active.dataset.threadRow !== {created_thread_id!r};
            """,
            timeout=30,
            label="archived conversation leaves recent list",
        )
        driver.navigate(f"{module.BASE_URL}/settings#data/archives")
        driver.wait_for(
            f"""
            const panel = document.getElementById('settings-panel-archives');
            const row = document.querySelector('[data-archive-thread="{created_thread_id}"]');
            return document.readyState === 'complete' && panel && !panel.hidden && row;
            """,
            timeout=45,
            label="archived conversation in account settings",
        )
        click_required(
            f'[data-restore-thread="{created_thread_id}"]',
            "restore archived conversation in account settings",
        )
        driver.wait_for(
            f"""
            return !document.querySelector('[data-archive-thread="{created_thread_id}"]')
              && document.getElementById('settings-archive-status')?.textContent.includes('已恢复');
            """,
            timeout=30,
            label="restored conversation leaves archive settings",
        )

        driver.navigate(f"{module.BASE_URL}/teacher?view=conversation")
        driver.wait_for(
            f"""return Boolean(document.querySelector('[data-thread-open="{created_thread_id}"]'));""",
            timeout=45,
            label="restored conversation returns to AI co-creation",
        )
        click_required(
            f'[data-thread-open="{created_thread_id}"]',
            "open restored conversation",
        )
        driver.wait_for(
            f"""
            return document.getElementById('teaching-thread-title')?.textContent === {managed_title!r}
              && !document.getElementById('teaching-input')?.disabled;
            """,
            timeout=30,
            label="restored conversation is writable",
        )
        click_required(
            "[data-thread-row].is-active [data-thread-menu]",
            "restored conversation menu before rearchive",
        )
        click_required(
            '[data-thread-action="archive"]',
            "rearchive restored conversation",
        )
        driver.wait_for(
            f"""return !document.querySelector('[data-thread-row="{created_thread_id}"]');""",
            timeout=30,
            label="rearchived conversation leaves AI co-creation",
        )

        driver.navigate(f"{module.BASE_URL}/settings#data/archives")
        driver.wait_for(
            f"""return Boolean(document.querySelector('[data-archive-thread="{created_thread_id}"]'));""",
            timeout=45,
            label="rearchived conversation in account settings",
        )
        click_required(
            f'[data-delete-thread="{created_thread_id}"]',
            "permanently delete archived conversation",
        )
        driver.wait_for(
            "return Boolean(document.querySelector('[data-dialog-action=\"confirm\"]'));",
            timeout=10,
            label="archived conversation delete confirmation",
        )
        click_required(
            '[data-dialog-action="confirm"]',
            "confirm permanent archived conversation deletion",
        )
        driver.wait_for(
            f"""
            return !document.querySelector('[data-archive-thread="{created_thread_id}"]')
              && document.getElementById('settings-archive-status')?.textContent.includes('永久删除');
            """,
            timeout=30,
            label="archived conversation permanently deleted",
        )
        driver.navigate(f"{module.BASE_URL}/teacher?view=conversation")
        driver.wait_for(
            "return document.readyState === 'complete' && document.getElementById('teacher-agent')"
            " && document.querySelectorAll('#teaching-thread-list [data-thread-row]').length > 0;",
            timeout=45,
            label="AI co-creation after archive management",
        )
        print(
            "PASS  browser manages new, rename, search, pin, archive, restore, and delete",
            flush=True,
        )

        for viewport_width, viewport_height in ((390, 844), (320, 568)):
            driver.set_window_size(viewport_width, viewport_height)
            closed_sidebar = driver.wait_for(
                """
                const sidebar = document.getElementById('teaching-sidebar');
                const rect = sidebar.getBoundingClientRect();
                return rect.right <= 1 ? {
                  inert: sidebar.inert,
                  hidden: sidebar.getAttribute('aria-hidden'),
                  overflow: document.documentElement.scrollWidth - innerWidth,
                } : null;
                """,
                timeout=10,
                label=f"closed {viewport_width}px conversation drawer",
            )
            if (
                not closed_sidebar["inert"]
                or closed_sidebar["hidden"] != "true"
                or float(closed_sidebar["overflow"]) > 2
            ):
                raise RuntimeError(
                    f"closed mobile conversation drawer remains interactive: {closed_sidebar}"
                )
            driver.execute(
                """
                const trigger = document.getElementById('teaching-sidebar-toggle');
                trigger.focus();
                trigger.click();
                return true;
                """
            )
            mobile = driver.wait_for(
                """
                const node = document.getElementById('teaching-sidebar');
                const rect = node.getBoundingClientRect();
                const overlay = document.getElementById('teaching-sidebar-overlay');
                const active = document.activeElement;
                return rect.left >= -1 && !overlay.hidden && node.contains(active)
                  ? {
                      left: rect.left,
                      width: rect.width,
                      viewport: innerWidth,
                      inert: node.inert,
                      hidden: node.getAttribute('aria-hidden'),
                      focusInside: node.contains(active),
                      overflow: document.documentElement.scrollWidth - innerWidth,
                      smallestTarget: Math.min(...Array.from(node.querySelectorAll('button, a, input')).filter(item => item.offsetParent !== null).map(item => Math.min(item.getBoundingClientRect().width, item.getBoundingClientRect().height))),
                    } : null;
                """,
                timeout=10,
                label=f"open {viewport_width}px conversation drawer",
            )
            if (
                float(mobile["width"]) > float(mobile["viewport"])
                or float(mobile["width"]) < min(280, viewport_width)
                or mobile["inert"]
                or mobile["hidden"] != "false"
                or not mobile["focusInside"]
                or float(mobile["overflow"]) > 2
                or float(mobile["smallestTarget"]) < 40
            ):
                raise RuntimeError(
                    f"mobile conversation drawer has invalid interaction geometry: {mobile}"
                )
            driver.execute(
                "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); return true;"
            )
            restored_sidebar = driver.wait_for(
                """
                const sidebar = document.getElementById('teaching-sidebar');
                return sidebar.getBoundingClientRect().right <= 1
                  && document.activeElement?.id === 'teaching-sidebar-toggle'
                  ? {inert: sidebar.inert, hidden: sidebar.getAttribute('aria-hidden')} : null;
                """,
                timeout=10,
                label=f"restore focus after closing {viewport_width}px conversation drawer",
            )
            if not restored_sidebar["inert"] or restored_sidebar["hidden"] != "true":
                raise RuntimeError(
                    f"closed mobile conversation drawer was not isolated: {restored_sidebar}"
                )
        driver.set_window_size(1440, 1000)
        driver.wait_for(
            """
            const sidebar = document.getElementById('teaching-sidebar').getBoundingClientRect();
            return innerWidth >= 1000 && sidebar.left >= -1 && sidebar.width >= 260;
            """,
            timeout=10,
            label="restored desktop conversation layout",
        )
        print("PASS  browser conversation sidebar is usable on mobile", flush=True)
        prompt = "查看我可以管理的课程"
        response_baseline = driver.execute(
            """
            return {
              answers: document.querySelectorAll('.teaching-message.is-answer .teaching-answer-surface').length,
              terminals: document.querySelectorAll(
                '.teaching-message.is-answer .teaching-answer-surface, '
                + '.teaching-message.is-result .teaching-answer-surface, '
                + '.teaching-message.is-error .teaching-answer-surface, '
                + '.teaching-message.is-canceled .teaching-answer-surface'
              ).length,
              activities: document.querySelectorAll('.teaching-message.is-activity .teaching-activity-line').length,
              courseCards: document.querySelectorAll('a.course-operation-card').length,
            };
            """
        )
        if int(response_baseline["activities"]) != 0 or driver.execute(
            "return document.getElementById('teacher-agent').classList.contains('has-active-run');"
        ):
            raise RuntimeError(
                f"completed historical work is still presented as active: {response_baseline}"
            )
        driver.execute(
            f"""
            const input = document.getElementById('teaching-input');
            input.value = {prompt!r};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            document.getElementById('teaching-send').click();
            return true;
            """
        )
        processing_state = driver.wait_for(
            """
            const running = document.querySelector('.teaching-message.is-activity .teaching-activity-line');
            const completed = document.querySelectorAll(
              '.teaching-message.is-answer .teaching-answer-surface, '
              + '.teaching-message.is-result .teaching-answer-surface, '
              + '.teaching-message.is-error .teaching-answer-surface, '
              + '.teaching-message.is-canceled .teaching-answer-surface'
            ).length > ANSWER_BASELINE;
            if (!running && !completed) return null;
            return {
              observedRunning: Boolean(running),
              runStep: running?.querySelector('.teaching-activity-copy strong')?.textContent.trim() || '',
              runDetail: running?.querySelector('.teaching-activity-copy small')?.textContent.trim() || '',
              nestedCards: running?.querySelectorAll('section, details, .job-step-list').length || 0,
              disclosure: Boolean(running?.dataset.jobToggle),
              collapsed: running?.getAttribute('aria-expanded') === 'false',
              detailSteps: running?.closest('[data-job-disclosure]')?.querySelectorAll(
                '.job-disclosure-details .job-step-list > li'
              ).length || 0,
              detailHidden: running?.closest('[data-job-disclosure]')?.querySelector(
                '.job-disclosure-details'
              )?.hidden ?? false,
              syntheticBubble: Array.from(document.querySelectorAll('.teaching-message-copy')).some(node =>
                node.textContent.includes('正在理解完整要求') || node.textContent.includes('正在按你的要求制作')
              ),
              composerIsStop: document.getElementById('teaching-send').classList.contains('is-stop'),
              composerDisabled: document.getElementById('teaching-send').disabled,
            };
            """.replace("ANSWER_BASELINE", str(int(response_baseline["terminals"]))),
            timeout=30,
            label="separate Agent execution or outcome presentation",
        )
        if processing_state["syntheticBubble"]:
            raise RuntimeError(
                f"Agent process placeholder is still rendered as a reply: {processing_state}"
            )
        if processing_state["observedRunning"] and (
            not processing_state["runStep"]
            or int(processing_state["nestedCards"]) != 0
            or not processing_state["disclosure"]
            or not processing_state["collapsed"]
            or int(processing_state["detailSteps"]) < 4
            or not processing_state["detailHidden"]
            or not processing_state["composerIsStop"]
            or processing_state["composerDisabled"]
        ):
            raise RuntimeError(
                f"Agent live execution controls are incomplete: {processing_state}"
            )
        if processing_state["observedRunning"]:
            expanded_activity = driver.execute(
                """
                const button = document.querySelector('.teaching-message.is-activity .teaching-activity-line');
                if (!button) return null;
                const shell = button.closest('[data-job-disclosure]');
                button.click();
                const details = shell?.querySelector('.job-disclosure-details');
                return {
                  expanded: button.getAttribute('aria-expanded') === 'true',
                  visible: Boolean(details && !details.hidden),
                  steps: details?.querySelectorAll('.job-step-list > li').length || 0,
                  descriptions: details?.querySelectorAll('.job-step-copy small').length || 0,
                };
                """
            )
            if expanded_activity and (
                not expanded_activity["expanded"]
                or not expanded_activity["visible"]
                or int(expanded_activity["steps"]) < 4
                or int(expanded_activity["descriptions"]) < 4
            ):
                raise RuntimeError(
                    f"Agent live task did not expand detailed steps: {expanded_activity}"
                )
        outcome = driver.wait_for(
            f"""
            const finals = Array.from(document.querySelectorAll(
              '.teaching-message.is-answer .teaching-answer-surface, '
              + '.teaching-message.is-result .teaching-answer-surface, '
              + '.teaching-message.is-error .teaching-answer-surface, '
              + '.teaching-message.is-canceled .teaching-answer-surface'
            ));
            if (finals.length <= {int(response_baseline["terminals"])}) return null;
            const answer = finals.at(-1);
            const article = answer.closest('.teaching-message');
            const assistantMessages = Array.from(document.querySelectorAll('.teaching-message.is-assistant'));
            if (assistantMessages.at(-1) !== article) return null;
            if (document.querySelectorAll('.teaching-message.is-activity .teaching-activity-line').length > {int(response_baseline["activities"])}) return null;
            if (document.getElementById('teacher-agent').classList.contains('has-active-run')) return null;
            if (document.getElementById('teaching-input').disabled) return null;
            const cards = Array.from(document.querySelectorAll('a.course-operation-card'));
            const card = cards.slice({int(response_baseline["courseCards"])})
              .find(node => node.textContent.includes('可管理课程')) || null;
            return {{
              text: answer.querySelector('.teaching-answer-content')?.textContent.trim() || '',
              genericHeader: Boolean(answer.querySelector('.teaching-answer-header')),
              statusLine: answer.querySelector('.teaching-answer-status')?.textContent.trim() || '',
              presentation: article.classList.contains('is-answer') ? 'answer'
                : article.classList.contains('is-result') ? 'result'
                : article.classList.contains('is-error') ? 'error'
                : article.classList.contains('is-canceled') ? 'canceled' : 'unknown',
              hasExecution: Boolean(answer.querySelector('.teaching-execution-details')),
              answerFont: parseFloat(getComputedStyle(answer.querySelector('.teaching-answer-content')).fontSize),
              newCourseCard: Boolean(card),
              cardHref: card?.href || '',
              cardText: card?.textContent.trim() || '',
            }};
            """,
            timeout=720,
            label="fresh Agent answer",
        )
        time.sleep(2)
        settled = driver.wait_for(
            """
            const assistants = Array.from(document.querySelectorAll('.teaching-message.is-assistant'));
            return !assistants.at(-1)?.classList.contains('is-activity')
              && !document.getElementById('teacher-agent').classList.contains('has-active-run')
              && !document.getElementById('teaching-input').disabled;
            """,
            timeout=30,
            label="settled Agent answer",
        )
        if not settled:
            raise RuntimeError("Agent answer did not settle")
        if (
            "课程" not in outcome["text"]
            or outcome["presentation"] != "answer"
            or outcome["genericHeader"]
            or outcome["statusLine"]
            or outcome["hasExecution"]
            or float(outcome["answerFont"]) < 14
            or (
                outcome["newCourseCard"]
                and (
                    "/teacher/courses" not in outcome["cardHref"]
                    or "课程" not in outcome["cardText"]
                )
            )
        ):
            raise RuntimeError(
                f"fresh Agent answer is incomplete or conflates execution: {outcome}"
            )
        print(
            "PASS  one-sentence browser prompt produces a fresh final answer; "
            "tool output is separate when a read tool is used",
            flush=True,
        )

        task_experience = driver.wait_for(
            """
            const answers = Array.from(document.querySelectorAll('.teaching-message.is-answer .teaching-answer-surface'));
            const answer = answers.at(-1);
            if (!answer) return null;
            const text = answer.querySelector('.teaching-answer-content')?.textContent.trim() || '';
            const forbidden = ['trace', '路由', '模型', 'routing', 'generating',
              'persisting', 'candidate.generate', 'agent.chat', '%'];
            const duplicateMessages = Array.from(document.querySelectorAll('.teaching-message'))
              .filter(node => node.querySelector('.job-card') && node.querySelector(
                '.completed-result-card, .candidate-set-card, .artifact-card, .material-card'
              )).length;
            return {
              text,
              duplicateMessages,
              terminalJobCards: answer.querySelectorAll('.job-card').length,
              completedProgress: document.querySelectorAll('.job-card.is-succeeded .job-step-list').length,
              leakedInternals: forbidden.filter(value => text.includes(value)),
              summaryFont: parseFloat(getComputedStyle(answer.querySelector('.teaching-answer-content')).fontSize),
              answerCards: document.querySelectorAll('.teaching-answer-card').length,
              genericHeaders: document.querySelectorAll('.teaching-answer-header').length,
              executionDetails: answer.querySelectorAll('.teaching-execution-details').length,
              activeRuns: document.querySelectorAll('.teaching-message.is-activity .teaching-activity-line').length,
              processAsReply: Array.from(document.querySelectorAll('.teaching-message-copy')).filter(node =>
                node.textContent.includes('正在理解完整要求') || node.textContent.includes('正在按你的要求制作')
              ).length,
            };
            """,
            timeout=120,
            label="single completed Agent answer",
        )
        if (
            task_experience["duplicateMessages"] != 0
            or int(task_experience["terminalJobCards"]) != 0
            or task_experience["completedProgress"] != 0
            or task_experience["leakedInternals"]
            or float(task_experience["summaryFont"]) < 14
            or int(task_experience["answerCards"]) != 0
            or int(task_experience["genericHeaders"]) != 0
            or int(task_experience["executionDetails"]) != 0
            or int(task_experience["activeRuns"]) != 0
            or int(task_experience["processAsReply"]) != 0
        ):
            raise RuntimeError(
                f"final answer remains redundant or conflated with execution: {task_experience}"
            )

        follow_up_commands = driver.execute(
            """
            const buttons = Array.from(document.querySelectorAll(
              '[data-agent-suggestion-message="FIXTURE_MESSAGE_ID"]'
            ));
            if (!buttons.length) return {count: 0};
            const labels = buttons.map(node => node.textContent.trim());
            const section = buttons[0].closest('.teaching-next-actions');
            buttons[0].click();
            const input = document.getElementById('teaching-input');
            const result = {
              count: buttons.length,
              labels,
              title: section?.querySelector('header strong')?.textContent.trim() || '',
              hint: section?.querySelector('header small')?.textContent.trim() || '',
              input: input.value,
              sendDisabled: document.getElementById('teaching-send').disabled,
            };
            input.value = '';
            input.dispatchEvent(new Event('input', {bubbles: true}));
            return result;
            """.replace("FIXTURE_MESSAGE_ID", str(suggestion_fixture_message_id))
        )
        expected_follow_up_commands = [
            "帮我生成配套的随堂检测题或实验操作单。",
            "帮我把该 HTML 内容整理为 DOCX 教案版本。",
            "帮我生成课堂练习。",
        ]
        if (
            follow_up_commands["labels"] != expected_follow_up_commands
            or follow_up_commands["title"] != "后续命令"
            or follow_up_commands["hint"] != "点击后填入输入框，可编辑再发送"
            or follow_up_commands["input"] != expected_follow_up_commands[0]
            or follow_up_commands["sendDisabled"] is not False
        ):
            raise RuntimeError(
                f"follow-up suggestions are not sendable teacher commands: {follow_up_commands}"
            )
        print(
            "PASS  historical suggestions become exact imperative commands and enable Send",
            flush=True,
        )

        driver.execute(
            """
            const trigger = document.getElementById('teaching-drawer-open');
            trigger.focus();
            trigger.click();
            return true;
            """
        )
        task_drawer = driver.wait_for(
            """
            const drawer = document.getElementById('teaching-drawer');
            const list = document.getElementById('teaching-job-list');
            if (!drawer.classList.contains('is-open')) return null;
            const text = drawer.textContent;
            const forbidden = ['trace', '路由', '模型', 'routing', 'generating',
              'persisting', 'candidate.generate', 'agent.chat', '执行记录'];
            const rect = drawer.getBoundingClientRect();
            if (rect.left < -1 || rect.right > innerWidth + 1 || Math.abs(rect.right - innerWidth) > 1) return null;
            const actionSection = document.getElementById('teaching-action-section');
            const title = document.getElementById('teaching-drawer-title').textContent.trim();
            const subtitle = document.getElementById('teaching-drawer-subtitle').textContent.trim();
            const rows = Array.from(list.querySelectorAll('.teaching-task-item'));
            const completedRows = rows.filter(node => node.classList.contains('is-succeeded'));
            const progress = rows.map(node => node.querySelector('.teaching-task-progress'));
            return {
              tabs: drawer.querySelectorAll('[data-drawer-tab]').length,
              title,
              subtitle,
              groups: Array.from(list.querySelectorAll('[data-task-group]')).map(node => node.dataset.taskGroup),
              rows: rows.length,
              completedRows: completedRows.length,
              progressBars: progress.filter(Boolean).length,
              validProgress: progress.filter(node => node && node.getAttribute('role') === 'progressbar'
                && Number(node.getAttribute('aria-valuenow')) >= 0
                && Number(node.getAttribute('aria-valuenow')) <= 100).length,
              completedResultActions: completedRows.filter(node => Boolean(
                node.querySelector('.teaching-task-controls > .teaching-task-action')
              )).length,
              completedActionLabels: completedRows.map(node =>
                node.querySelector('.teaching-task-controls > .teaching-task-action')?.textContent.trim() || ''
              ),
              completedActionTargets: completedRows.map(node => {
                const action = node.querySelector('.teaching-task-controls > .teaching-task-action');
                if (!action) return '';
                return action.getAttribute('href')
                  || action.dataset.jobJump
                  || action.dataset.taskCandidate
                  || '';
              }),
              conversationJumpButtons: completedRows.filter(node => Boolean(node.querySelector('[data-job-jump]'))).length,
              disclosureButtons: rows.filter(node => Boolean(node.querySelector('[data-job-toggle]'))).length,
              stepLists: list.querySelectorAll('.job-disclosure-details .job-step-list').length,
              visibleStepLists: Array.from(list.querySelectorAll('.job-disclosure-details')).filter(node => !node.hidden).length,
              validDisclosureState: rows.filter(node => {
                const button = node.querySelector('[data-job-toggle]');
                const details = node.querySelector('.job-disclosure-details');
                const expanded = button?.getAttribute('aria-expanded') === 'true';
                return Boolean(button && details)
                  && expanded === !details.hidden
                  && expanded === node.classList.contains('is-expanded');
              }).length,
              legacyDetails: list.querySelectorAll('.job-detail-view, .job-detail-section, .teaching-event-list, .job-event-details').length,
              borderedRows: rows.filter(node => {
                const style = getComputedStyle(node);
                return parseFloat(style.borderLeftWidth) > 0 || parseFloat(style.borderRightWidth) > 0;
              }).length,
              leakedInternals: forbidden.filter(value => text.includes(value)),
              width: rect.width,
              left: rect.left,
              right: rect.right,
              viewport: innerWidth,
              titleFont: parseFloat(getComputedStyle(document.getElementById('teaching-drawer-title')).fontSize),
              actionBeforeList: actionSection.hidden
                || actionSection.getBoundingClientRect().top <= list.getBoundingClientRect().top,
              role: drawer.getAttribute('role'),
              ariaModal: drawer.getAttribute('aria-modal'),
              focusInside: drawer.contains(document.activeElement),
              conversationInert: document.querySelector('.teaching-conversation').inert,
              sidebarInert: document.getElementById('teaching-sidebar').inert,
              navigationInert: document.querySelector('.product-navbar')?.inert === true,
              filters: Array.from(drawer.querySelectorAll('.teaching-task-filters select')).map(select => ({
                id: select.id,
                values: Array.from(select.options).map(option => option.value),
              })),
            };
            """,
            timeout=20,
            label="compact task list drawer",
        )
        if (
            int(task_drawer["tabs"]) != 0
            or task_drawer["title"] != "任务中心"
            or "项进行中" not in task_drawer["subtitle"]
            or "项已完成" not in task_drawer["subtitle"]
            or int(task_drawer["rows"]) < 1
            or int(task_drawer["completedRows"]) < 1
            or int(task_drawer["progressBars"]) != int(task_drawer["rows"])
            or int(task_drawer["validProgress"]) != int(task_drawer["rows"])
            or int(task_drawer["completedResultActions"])
            != int(task_drawer["completedRows"])
            or not all(task_drawer["completedActionLabels"])
            or not all(task_drawer["completedActionTargets"])
            or int(task_drawer["conversationJumpButtons"]) < 1
            or "completed" not in task_drawer["groups"]
            or int(task_drawer["legacyDetails"]) != 0
            or int(task_drawer["disclosureButtons"]) != int(task_drawer["rows"])
            or int(task_drawer["stepLists"]) != int(task_drawer["rows"])
            or int(task_drawer["validDisclosureState"]) != int(task_drawer["rows"])
            or int(task_drawer["borderedRows"]) != 0
            or task_drawer["leakedInternals"]
            or float(task_drawer["width"]) > float(task_drawer["viewport"]) + 2
            or float(task_drawer["left"]) < -1
            or abs(float(task_drawer["right"]) - float(task_drawer["viewport"])) > 1
            or float(task_drawer["titleFont"]) < 20
            or not task_drawer["actionBeforeList"]
            or task_drawer["role"] != "dialog"
            or task_drawer["ariaModal"] != "true"
            or not task_drawer["focusInside"]
            or not task_drawer["conversationInert"]
            or not task_drawer["sidebarInert"]
            or not task_drawer["navigationInert"]
            or len(task_drawer["filters"]) != 3
            or task_drawer["filters"][2]["values"]
            != ["", "active", "attention", "completed"]
        ):
            raise RuntimeError(
                f"task drawer is not a compact, navigable task list: {task_drawer}"
            )
        driver.execute(
            "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); return true;"
        )
        drawer_closed = driver.wait_for(
            """
            const drawer = document.getElementById('teaching-drawer');
            const conversation = document.querySelector('.teaching-conversation');
            const sidebar = document.getElementById('teaching-sidebar');
            const navigation = document.querySelector('.product-navbar');
            return !drawer.classList.contains('is-open')
              && document.activeElement?.id === 'teaching-drawer-open'
              ? {
                  drawerInert: drawer.inert,
                  drawerHidden: drawer.getAttribute('aria-hidden'),
                  conversationInert: conversation.inert,
                  sidebarInert: sidebar.inert,
                  navigationInert: navigation?.inert === true,
                } : null;
            """,
            timeout=10,
            label="task drawer escape and focus restoration",
        )
        if (
            not drawer_closed["drawerInert"]
            or drawer_closed["drawerHidden"] != "true"
            or drawer_closed["conversationInert"]
            or drawer_closed["sidebarInert"]
            or drawer_closed["navigationInert"]
        ):
            raise RuntimeError(f"closed task drawer did not restore page isolation: {drawer_closed}")
        driver.execute(
            "document.getElementById('teaching-drawer-open').click(); return true;"
        )
        driver.wait_for(
            "return document.getElementById('teaching-drawer').classList.contains('is-open');",
            timeout=10,
            label="reopened task drawer",
        )
        expanded_task = driver.execute(
            """
            const rows = Array.from(document.querySelectorAll('#teaching-job-list .teaching-task-item'));
            const row = rows.find(node => node.querySelector('.job-disclosure-details')?.hidden) || rows[0];
            const button = row?.querySelector('[data-job-toggle]');
            if (!row || !button) return null;
            if (button.getAttribute('aria-expanded') !== 'true') button.click();
            const details = row.querySelector('.job-disclosure-details');
            return {
              expanded: button.getAttribute('aria-expanded') === 'true',
              selected: row.classList.contains('is-selected'),
              visible: Boolean(details && !details.hidden),
              steps: details?.querySelectorAll('.job-step-list > li').length || 0,
              descriptions: details?.querySelectorAll('.job-step-copy small').length || 0,
            };
            """
        )
        if not expanded_task or (
            not expanded_task["expanded"]
            or not expanded_task["selected"]
            or not expanded_task["visible"]
            or int(expanded_task["steps"]) < 4
            or int(expanded_task["descriptions"]) < 4
        ):
            raise RuntimeError(
                f"task drawer row did not expand detailed steps: {expanded_task}"
            )
        if screenshot_path is not None:
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(screenshot_path)
            print(f"PASS  captured compact task list at {screenshot_path}", flush=True)
        jump_job = driver.execute(
            """
            const button = document.querySelector('.teaching-task-item.is-succeeded [data-job-jump]');
            const jobId = button?.dataset.jobJump || '';
            button?.click();
            return jobId;
            """
        )
        jumped = driver.wait_for(
            """
            const drawer = document.getElementById('teaching-drawer');
            const target = document.querySelector('#teaching-messages [data-message-id].is-result-focused');
            if (!target || drawer.classList.contains('is-open') || !target.classList.contains('is-result-focused')) return null;
            const rect = target.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < innerHeight
              ? { messageId: target.dataset.messageId || '', visible: true }
              : null;
            """,
            timeout=10,
            label="completed task conversation jump",
        )
        if not jump_job or not jumped or not jumped["messageId"]:
            raise RuntimeError(
                f"completed task did not jump to its conversation result: {jump_job}, {jumped}"
            )
        print(
            "PASS  task drawer exposes exact result actions and conversation results remain navigable",
            flush=True,
        )

        driver.navigate(f"{module.BASE_URL}/teacher/courses")
        driver.wait_for(
            "return location.pathname === '/teacher/courses' && !!document.getElementById('teacher-course-center');",
            timeout=45,
            label="course-center navigation",
        )
        print(
            "PASS  teacher course center remains reachable after Agent completion",
            flush=True,
        )
        course_reference = verifier.course["referenceId"]
        course_list = driver.wait_for(
            f"""
            const list = document.getElementById('cs-course-list-view');
            const detail = document.getElementById('cs-course-detail-view');
            const card = document.querySelector(`[data-course-card={course_reference!r}]`);
            if (!list || list.hidden || !detail?.hidden || !card) return null;
            return {{
              heading: document.getElementById('cs-course-list-title')?.textContent.trim(),
              cards: document.querySelectorAll('[data-course-card]').length,
              managementActions: card.querySelectorAll('[data-manage-action]').length,
              titleFont: parseFloat(getComputedStyle(card.querySelector('.teacher-course-card-copy strong')).fontSize),
              copyFont: parseFloat(getComputedStyle(card.querySelector('.teacher-course-card-copy p')).fontSize),
              metaFont: parseFloat(getComputedStyle(card.querySelector('.teacher-course-card-copy small')).fontSize),
              statsFont: parseFloat(getComputedStyle(card.querySelector('.teacher-course-card-stats')).fontSize),
              overflow: document.documentElement.scrollWidth - innerWidth,
            }};
            """,
            timeout=45,
            label="teacher course list",
        )
        if (
            course_list["heading"] != "我的课程"
            or int(course_list["cards"]) < 1
            or int(course_list["managementActions"]) != 2
            or float(course_list["titleFont"]) < 18
            or float(course_list["copyFont"]) < 15
            or float(course_list["metaFont"]) < 15
            or float(course_list["statsFont"]) < 15
            or float(course_list["overflow"]) > 2
        ):
            raise RuntimeError(
                f"teacher course list is incomplete or unreadable: {course_list}"
            )
        if course_screenshot_path is not None:
            course_list_path = course_screenshot_path.with_name(
                f"{course_screenshot_path.stem}-list{course_screenshot_path.suffix}"
            )
            course_list_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(course_list_path)
            print(
                f"PASS  captured teacher course list at {course_list_path}", flush=True
            )

        driver.execute(
            f"document.querySelector(`[data-course-card={course_reference!r}] .teacher-course-more > summary`).click(); return true;"
        )
        course_menu = driver.wait_for(
            f"""
            const details = document.querySelector(`[data-course-card={course_reference!r}] .teacher-course-more`);
            const panel = document.querySelector('.aisecedu-floating-menu');
            if (!details?.open || !panel || panel.parentElement !== document.body) return null;
            const rect = panel.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            return {{
              position: getComputedStyle(panel).position,
              visibility: getComputedStyle(panel).visibility,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
              actions: panel.querySelectorAll('[data-manage-action]').length,
              expanded: details.querySelector('summary').getAttribute('aria-expanded'),
            }};
            """,
            timeout=10,
            label="viewport-safe course action menu",
        )
        if (
            course_menu["position"] != "fixed"
            or course_menu["visibility"] != "visible"
            or course_menu["expanded"] != "true"
            or int(course_menu["actions"]) != 2
            or float(course_menu["left"]) < 0
            or float(course_menu["top"]) < 0
            or float(course_menu["right"]) > float(course_menu["viewportWidth"]) + 1
            or float(course_menu["bottom"]) > float(course_menu["viewportHeight"]) + 1
        ):
            raise RuntimeError(
                f"course action menu is hidden or outside the viewport: {course_menu}"
            )
        driver.execute(
            "document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); return true;"
        )
        driver.wait_for(
            f"""
            const details = document.querySelector(`[data-course-card={course_reference!r}] .teacher-course-more`);
            return !details?.open
              && !document.querySelector('.aisecedu-floating-menu')
              && !!details.querySelector(':scope > div');
            """,
            timeout=10,
            label="course action menu outside-click close",
        )
        print(
            "PASS  three-dot menus remain visible inside the viewport and close on outside click",
            flush=True,
        )

        renamed_course = f"浏览器课程管理 {verifier.suffix}"
        driver.execute(
            f"document.querySelector(`[data-course-card={course_reference!r}] .teacher-course-more > summary`).click(); return true;"
        )
        driver.wait_for(
            "return !!document.querySelector('.aisecedu-floating-menu [data-manage-action=\"rename\"]');",
            timeout=10,
            label="course rename menu action",
        )
        driver.execute(
            "document.querySelector('.aisecedu-floating-menu [data-manage-action=\"rename\"]').click(); return true;"
        )
        driver.wait_for(
            "return !!document.querySelector('.aisecedu-dialog-input input');",
            timeout=10,
            label="course rename dialog",
        )
        driver.execute(
            f"""
            const input = document.querySelector('.aisecedu-dialog-input input');
            input.value = {renamed_course!r};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            document.querySelector('[data-dialog-action="confirm"]').click();
            return true;
            """
        )
        driver.wait_for(
            f"""
            const card = document.querySelector(`[data-course-card={course_reference!r}]`);
            return card?.querySelector('.teacher-course-card-copy strong')?.textContent === {renamed_course!r};
            """,
            timeout=30,
            label="course rename persisted in list",
        )
        verifier.course["name"] = renamed_course
        print(
            "PASS  course center starts with a readable list and supports direct course rename",
            flush=True,
        )

        driver.execute(
            f"document.querySelector(`[data-course-card={course_reference!r}] .teacher-course-card-main`).click(); return true;"
        )
        course_layout = driver.wait_for(
            """
            const loading = document.getElementById('cs-loading');
            const title = document.getElementById('cs-course-title');
            const readiness = document.querySelector('#cs-overview-readiness strong');
            if (!loading || !loading.hidden || !title || title.textContent.includes('载入')
              ) return null;
            const tabWidths = Array.from(document.querySelectorAll('[data-cs-tab]'))
              .map(node => node.getBoundingClientRect().width);
            const metricLabel = document.querySelector('.hub-metric small');
            const moduleMeta = document.querySelector('#cs-module-list small');
            const materialMeta = document.querySelector('#cs-material-list small');
            const code = document.getElementById('cs-course-code-trigger');
            const attention = document.querySelector('.hub-attention-surface');
            const readinessSurface = document.querySelector('.hub-readiness-surface');
            const progress = document.querySelector('.hub-overview-progress');
            const activity = document.getElementById('cs-recent-activity');
            const before = (left, right) => Boolean(
              left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING)
            );
            const primaryCounts = Array.from(document.querySelectorAll('[data-cs-panel]')).map(panel =>
              Array.from(panel.querySelectorAll('.hub-button.is-primary')).filter(node =>
                !node.closest('[hidden]') && node.getClientRects().length > 0
              ).length
            );
            return {
              tabs: Array.from(document.querySelectorAll('[data-cs-tab]'))
                .map(node => node.querySelector('span')?.textContent.trim() || ''),
              panels: document.querySelectorAll('[data-cs-panel]').length,
              selected: document.querySelector('[data-cs-tab][aria-selected="true"]')?.dataset.csTab,
              readinessSettled: Boolean(readiness && !readiness.textContent.includes('正在')),
              readinessText: readiness?.textContent.trim() || '',
              notice: document.getElementById('cs-notice')?.textContent.trim() || '',
              hasRequiredSurfaces: Boolean(metricLabel && moduleMeta && code
                && attention && readinessSurface && progress && activity),
              hasModuleMeta: Boolean(moduleMeta),
              hasMaterialMeta: Boolean(materialMeta),
              overflow: document.documentElement.scrollWidth - innerWidth,
              hasQuestionManagement: !!document.getElementById('cs-question-manage-toggle') &&
                !!document.getElementById('cs-question-management-bar'),
              hasNewQuestion: !!document.getElementById('cs-question-create'),
              hasDemoManagement: !!document.getElementById('cs-demo-manage-toggle') &&
                !!document.getElementById('cs-demo-management-bar'),
              codeBesideTitle: code.parentElement === title.parentElement,
              headerAiButton: !!document.querySelector('.course-hub-header a[href^="/teacher?"], .course-hub-header [data-open-agent]'),
              overviewOrder: before(attention, readinessSurface) && before(readinessSurface, progress)
                && before(progress, activity),
              leakedBackendTerms: ['OpenMAIC', 'Dojo', 'Studio'].filter(term =>
                document.body.innerText.includes(term)
              ),
              maxVisiblePrimaryActions: Math.max(0, ...primaryCounts),
              managementCollapsed: !document.querySelector('.hub-management')?.open,
              tabWidths,
              tabFont: parseFloat(getComputedStyle(document.querySelector('[data-cs-tab]')).fontSize),
              bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
              metricLabelFont: metricLabel ? parseFloat(getComputedStyle(metricLabel).fontSize) : 0,
              moduleMetaFont: moduleMeta ? parseFloat(getComputedStyle(moduleMeta).fontSize) : 0,
              materialMetaFont: materialMeta ? parseFloat(getComputedStyle(materialMeta).fontSize) : 0,
              courseManagement: document.querySelectorAll('.hub-management [data-manage-action]').length,
              moduleManagement: document.querySelectorAll('#cs-module-list [data-manage-action]').length,
              normalQuestionManagementRows: document.querySelectorAll('#cs-challenge-list .is-question-managed').length,
              normalDemoManagementRows: document.querySelectorAll('#cs-simulation-list .is-demo-managed').length,
              contentRequestsBeforeTab: performance.getEntriesByType('resource').filter(entry => {
                const url = new URL(entry.name, location.origin);
                return url.pathname.includes('/teaching/courses/') && url.pathname.endsWith('/content');
              }).length,
              redundantAssessmentUi: !!document.querySelector('[data-assignment-id], #cs-assignment-detail') ||
                document.body.innerText.includes('任务与知识测评'),
              hasLegacyTabs: ['课堂', '设置', '作业'].some(label =>
                Array.from(document.querySelectorAll('[data-cs-tab]')).some(node => node.textContent.trim() === label)
              ),
            };
            """,
            timeout=45,
            label="unified course hub",
        )
        expected_tabs = ["概览", "课件", "题目", "演示", "学情"]
        if course_layout["tabs"] != expected_tabs:
            raise RuntimeError(
                f"course hub information architecture regressed: {course_layout}"
            )
        tab_widths = [float(width) for width in course_layout["tabWidths"]]
        if (
            int(course_layout["panels"]) != 5
            or course_layout["selected"] != "overview"
            or not course_layout["readinessSettled"]
            or not course_layout["hasRequiredSurfaces"]
            or float(course_layout["overflow"]) > 2
            or not course_layout["hasQuestionManagement"]
            or not course_layout["hasNewQuestion"]
            or not course_layout["hasDemoManagement"]
            or not course_layout["codeBesideTitle"]
            or course_layout["headerAiButton"]
            or not course_layout["overviewOrder"]
            or int(course_layout["maxVisiblePrimaryActions"]) > 1
            or max(tab_widths, default=1) - min(tab_widths, default=0) > 4
            or not course_layout["managementCollapsed"]
            or float(course_layout["tabFont"]) < 15
            or float(course_layout["bodyFont"]) < 17
            or float(course_layout["metricLabelFont"]) < 14
            or float(course_layout["moduleMetaFont"]) < 15
            or int(course_layout["contentRequestsBeforeTab"]) != 0
            or int(course_layout["courseManagement"]) != 2
            or int(course_layout["moduleManagement"]) != 0
            or int(course_layout["normalQuestionManagementRows"]) != 0
            or int(course_layout["normalDemoManagementRows"]) != 0
            or course_layout["redundantAssessmentUi"]
            or course_layout["hasLegacyTabs"]
            or course_layout["leakedBackendTerms"]
        ):
            raise RuntimeError(
                f"course hub is incomplete or overflows: {course_layout}"
            )

        driver.execute(
            "document.querySelector('[data-cs-tab=\"courseware\"]').click(); return true;"
        )
        lazy_courseware = driver.wait_for(
            """
            const tab = document.querySelector('[data-cs-tab="courseware"]');
            const panel = document.querySelector('[data-cs-panel="courseware"]');
            const list = document.getElementById('cs-material-list');
            const meta = list?.querySelector('small');
            if (tab?.getAttribute('aria-selected') !== 'true' || !panel || panel.hidden
              || !list || list.getAttribute('aria-busy') === 'true' || !meta) return null;
            return {
              materialMetaFont: parseFloat(getComputedStyle(meta).fontSize),
              contentRequests: performance.getEntriesByType('resource').filter(entry => {
                const url = new URL(entry.name, location.origin);
                return url.pathname.includes('/teaching/courses/') && url.pathname.endsWith('/content');
              }).length,
            };
            """,
            timeout=30,
            label="lazy courseware collections",
        )
        if (
            float(lazy_courseware["materialMetaFont"]) < 15
            or int(lazy_courseware["contentRequests"]) < 2
        ):
            raise RuntimeError(
                f"courseware collections did not load on demand: {lazy_courseware}"
            )

        driver.execute(
            "document.querySelector('[data-cs-tab=\"questions\"]').click(); return true;"
        )
        driver.wait_for(
            """
            const tab = document.querySelector('[data-cs-tab="questions"]');
            const panel = document.querySelector('[data-cs-panel="questions"]');
            return tab?.getAttribute('aria-selected') === 'true' && panel && !panel.hidden;
            """,
            timeout=10,
            label="course hub question workspace",
        )
        driver.execute(
            "document.querySelector('[data-cs-tab=\"demos\"]').click(); return true;"
        )
        driver.wait_for(
            """
            const tab = document.querySelector('[data-cs-tab="demos"]');
            const panel = document.querySelector('[data-cs-panel="demos"]');
            const questionPanel = document.querySelector('[data-cs-panel="questions"]');
            return tab?.getAttribute('aria-selected') === 'true' && panel && !panel.hidden &&
              questionPanel?.hidden;
            """,
            timeout=10,
            label="course hub independent demo workspace",
        )
        print(
            "PASS  course content separates question management from demos without a redundant assessment workflow",
            flush=True,
        )

        driver.set_window_size(390, 844)
        mobile_course = driver.wait_for(
            """
            const overflow = document.documentElement.scrollWidth - innerWidth;
            const tabs = document.querySelector('.course-hub-tabs');
            return tabs ? {overflow, tabsWidth: tabs.getBoundingClientRect().width, viewport: innerWidth} : null;
            """,
            timeout=10,
            label="mobile course hub",
        )
        if (
            float(mobile_course["overflow"]) > 2
            or float(mobile_course["tabsWidth"]) > float(mobile_course["viewport"]) + 2
        ):
            raise RuntimeError(
                f"mobile course hub overflows the viewport: {mobile_course}"
            )
        driver.set_window_size(1920, 1080)
        driver.wait_for(
            "return innerWidth >= 1800 && document.documentElement.scrollWidth - innerWidth <= 2;",
            timeout=10,
            label="wide desktop course hub",
        )
        driver.execute(
            "document.querySelector('[data-cs-tab=\"overview\"]').click(); return true;"
        )
        driver.wait_for(
            "return document.querySelector('[data-cs-tab=\"overview\"]')?.getAttribute('aria-selected') === 'true';",
            timeout=10,
            label="restored course overview",
        )
        print("PASS  course hub remains viewport-safe on mobile", flush=True)
        if course_screenshot_path is not None:
            course_screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(course_screenshot_path)
            print(
                f"PASS  captured course hub screenshot at {course_screenshot_path}",
                flush=True,
            )
        if theme_screenshot_dir is not None:
            theme_screenshot_dir.mkdir(parents=True, exist_ok=True)
            for palette in ("academy", "forest", "sunrise", "midnight"):
                driver.execute(
                    f"window.AISecEduUI.applyPalette({palette!r}, false); return true;"
                )
                time.sleep(0.2)
                theme_path = theme_screenshot_dir / f"course-{palette}.png"
                driver.screenshot(theme_path)
            driver.execute(
                "window.AISecEduUI.applyPalette('academy', false); return true;"
            )
            print(
                f"PASS  captured internal course palettes without restoring a theme picker at {theme_screenshot_dir}",
                flush=True,
            )
    finally:
        driver.close()


def verify_learner_ui(
    verifier,
    module,
    overview_screenshot_path: pathlib.Path | None = None,
    analysis_screenshot_path: pathlib.Path | None = None,
) -> None:
    if verifier.student is None or verifier.teacher is None:
        raise RuntimeError("learner verification sessions are unavailable")
    context = verifier.api(verifier.teacher, "GET", "teaching/context")
    course = next(
        (
            item
            for item in context.get("teacherDojos", [])
            if str(item.get("referenceId") or "").startswith("manual-platform-check~")
        ),
        None,
    )
    if course is None:
        raise RuntimeError("manual learning fixture is unavailable")
    course_reference = course["referenceId"]
    legacy_join = verifier.student.get(
        f"{module.BASE_URL}/dojo/{course_reference}/join/",
        allow_redirects=False,
        timeout=30,
    )
    if legacy_join.status_code != 303:
        raise RuntimeError(
            f"legacy GET enrollment did not remain read-only: {legacy_join.status_code}"
        )
    join_code = verifier.api(
        verifier.teacher,
        "POST",
        f"teaching/courses/{course_reference}/join-code",
        json_body={"regenerate": False},
    )["code"]
    verifier.api(
        verifier.student,
        "POST",
        "dojos/enrollment/code",
        json_body={"course_code": join_code},
        statuses=(200, 201),
    )

    driver = ChromeDriver()
    try:
        driver.navigate(module.BASE_URL)
        for cookie in verifier.student.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(f"{module.BASE_URL}/student")
        overview = driver.wait_for(
            """
            const root = document.getElementById('learning-overview');
            const ready = document.getElementById('learning-ready');
            const loading = document.getElementById('learning-overview-loading');
            const courseCards = root?.querySelectorAll('.sl-course-card') || [];
            if (!root || root.getAttribute('aria-busy') !== 'false' || !loading?.hidden
              || !ready || ready.hidden || courseCards.length < 1) return null;
            return {
              heading: root.querySelector('.sl-today-heading h2')?.textContent.trim(),
              secondaryEntries: Array.from(root.querySelectorAll('.sl-secondary-links strong'))
                .map(node => node.textContent.trim()),
              bodyFont: parseFloat(getComputedStyle(root.querySelector('.sl-today-heading p')).fontSize),
              courseCards: courseCards.length,
              nextAction: Boolean(document.querySelector('#learning-next-action .sl-next-card')),
              taskSurfaces: document.querySelectorAll('.sl-today-grid > section').length,
              zeroMetricCopy: ['0 门课程', '0 项任务', '0% 掌握', '0 / 0'].filter(label =>
                root.innerText.includes(label)
              ),
              navigation: Array.from(document.querySelectorAll('.product-primary-nav .nav-link span'))
                .map(node => node.textContent.trim()),
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
            """,
            timeout=45,
            label="learner home",
        )
        if overview["heading"] != "今天先做这一件事":
            raise RuntimeError(
                f"learner home has an unexpected primary action: {overview}"
            )
        if "AI 学习助手" not in overview["secondaryEntries"]:
            raise RuntimeError(f"learner AI practice scope regressed: {overview}")
        if (
            int(overview["courseCards"]) < 1
            or float(overview["bodyFont"]) < 14
            or not overview["nextAction"]
            or int(overview["taskSurfaces"]) != 2
            or overview["zeroMetricCopy"]
        ):
            raise RuntimeError(
                f"learner home is still dense or hard to read: {overview}"
            )
        if overview["navigation"] != ["今天", "课程", "AI 学习"]:
            raise RuntimeError(f"learner navigation regressed: {overview}")
        if float(overview["overflow"]) > 2:
            raise RuntimeError(f"learner home overflows the viewport: {overview}")

        learner_theme_results = {}
        for palette in ("academy", "forest", "sunrise", "midnight"):
            driver.execute(
                f"window.AISecEduUI.applyPalette({palette!r}, false); return true;"
            )
            learner_theme_results[palette] = driver.wait_for(
                f"""
                if (document.documentElement.dataset.aiseceduPalette !== {palette!r}) return null;
                const styles = getComputedStyle(document.documentElement);
                const resolveColor = value => {{
                  const probe = document.createElement('span');
                  probe.style.color = value.trim();
                  document.body.appendChild(probe);
                  const resolved = getComputedStyle(probe).color;
                  probe.remove();
                  return resolved;
                }};
                const expectedBackground = resolveColor(styles.getPropertyValue('--theme-bg'));
                const expectedSurface = resolveColor(styles.getPropertyValue('--theme-surface'));
                const expectedPrimary = resolveColor(styles.getPropertyValue('--theme-primary'));
                const bodyBackground = getComputedStyle(document.body).backgroundColor;
                const surfaceBackground = getComputedStyle(document.querySelector('.cs-surface')).backgroundColor;
                const primaryBackground = getComputedStyle(document.querySelector('.cs-btn-primary')).backgroundColor;
                const courseCard = document.querySelector('.sl-course-card');
                const actionIcon = document.querySelector('.sl-next-icon');
                if (!courseCard || !actionIcon || bodyBackground !== expectedBackground ||
                    surfaceBackground !== expectedSurface || primaryBackground !== expectedPrimary) return null;
                return {{
                  bodyBackground,
                  surfaceBackground,
                  primaryBackground,
                  courseBackground: getComputedStyle(courseCard).backgroundColor,
                  actionIconBackground: getComputedStyle(actionIcon).backgroundColor,
                }};
                """,
                timeout=10,
                label=f"{palette} learner theme",
            )
        if (
            len({result["bodyBackground"] for result in learner_theme_results.values()})
            != 4
            or len(
                {
                    result["primaryBackground"]
                    for result in learner_theme_results.values()
                }
            )
            != 4
            or len(
                {
                    result["courseBackground"]
                    for result in learner_theme_results.values()
                }
            )
            != 4
            or len(
                {
                    result["actionIconBackground"]
                    for result in learner_theme_results.values()
                }
            )
            != 4
        ):
            raise RuntimeError(
                f"learner components do not follow course themes: {learner_theme_results}"
            )
        driver.execute("window.AISecEduUI.applyPalette('academy', false); return true;")
        print(
            "PASS  learner tasks, cards, and actions follow all four course themes",
            flush=True,
        )

        driver.execute(
            "document.getElementById('global-search-trigger').click(); return true;"
        )
        driver.wait_for(
            "return document.getElementById('searchModal').classList.contains('show');",
            timeout=10,
            label="global search modal",
        )
        driver.execute(
            """
            const input = document.getElementById('searchInput');
            input.value = '手动';
            input.dispatchEvent(new Event('input', {bubbles: true}));
            return true;
            """
        )
        search = driver.wait_for(
            """
            const rows = Array.from(document.querySelectorAll('.product-search-result'));
            return rows.length ? {count: rows.length, first: rows[0].textContent.trim()} : null;
            """,
            timeout=30,
            label="global course search results",
        )
        driver.execute(
            """
            document.getElementById('searchInput').dispatchEvent(
              new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true})
            );
            return true;
            """
        )
        driver.wait_for(
            """return !!document.querySelector('.product-search-result[aria-selected="true"]');""",
            timeout=10,
            label="keyboard-selected search result",
        )
        driver.execute(
            "document.getElementById('searchCloseBtn').click(); return true;"
        )
        driver.wait_for(
            """
            const modal = document.getElementById('searchModal');
            return !modal.classList.contains('show') && getComputedStyle(modal).display === 'none';
            """,
            timeout=10,
            label="closed global search modal",
        )
        if "手动" not in search["first"]:
            raise RuntimeError(
                f"global search returned an unrelated first result: {search}"
            )
        print(
            "PASS  global search returns grouped results with keyboard selection",
            flush=True,
        )

        if overview_screenshot_path is not None:
            overview_screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(overview_screenshot_path)
            print(
                f"PASS  captured learner home screenshot at {overview_screenshot_path}",
                flush=True,
            )
        print(
            "PASS  learner home focuses one next action and keeps AI support secondary",
            flush=True,
        )

        driver.navigate(f"{module.BASE_URL}/dojo/{course_reference}/learning")
        analysis = driver.wait_for(
            """
            const root = document.getElementById('learning-dashboard');
            const tabs = Array.from(document.querySelectorAll('#learning-dashboard-tabs a'));
            const recommendations = document.getElementById('learning-recommendations');
            const catalog = document.getElementById('learning-catalog-list');
            const empty = document.getElementById('learning-recommendations-empty');
            const notice = document.getElementById('learning-dashboard-notice');
            const progress = document.getElementById('learning-progress-value')?.textContent.trim();
            const loaded = (recommendations?.querySelectorAll(':scope > :not(.learning-analysis-loading)').length || 0) > 0
              || (empty && !empty.hidden)
              || (notice && !notice.hidden);
            if (!root || tabs.length !== 3 || !loaded) return null;
            return {
              heading: root.querySelector('h1')?.textContent.trim(),
              tabs: tabs.map(node => node.textContent.trim().replace(/\\s+/g, ' ')),
              summaryCards: root.querySelectorAll('.learning-summary-grid article').length,
              hasEvidence: document.body.textContent.includes('尝试与证据记录'),
              tabFont: parseFloat(getComputedStyle(tabs[0]).fontSize),
              progress,
              recommendations: recommendations?.querySelectorAll(':scope > :not(.learning-analysis-loading)').length || 0,
              catalogItems: catalog?.querySelectorAll(':scope > :not(.learning-analysis-loading)').length || 0,
              error: notice && !notice.hidden ? notice.textContent.trim() : '',
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
            """,
            timeout=45,
            label="learning analysis",
        )
        expected_tabs = ["下一步", "能力掌握", "学习记录"]
        if (
            analysis["tabs"] != expected_tabs
            or int(analysis["summaryCards"]) != 4
            or not analysis["hasEvidence"]
            or float(analysis["tabFont"]) < 14
            or analysis["progress"] == "0 / 0"
            or int(analysis["recommendations"]) < 1
            or int(analysis["catalogItems"]) < 1
            or analysis["error"]
            or float(analysis["overflow"]) > 2
        ):
            raise RuntimeError(
                f"learning analysis information architecture regressed: {analysis}"
            )

        driver.set_window_size(390, 844)
        mobile = driver.wait_for(
            """
            const tabs = document.getElementById('learning-dashboard-tabs');
            return tabs ? {
              overflow: document.documentElement.scrollWidth - innerWidth,
              tabsWidth: tabs.getBoundingClientRect().width,
              viewport: innerWidth,
            } : null;
            """,
            timeout=10,
            label="mobile learning analysis",
        )
        if (
            float(mobile["overflow"]) > 2
            or float(mobile["tabsWidth"]) > float(mobile["viewport"]) + 2
        ):
            raise RuntimeError(
                f"mobile learning analysis overflows the viewport: {mobile}"
            )
        driver.execute(
            "document.querySelector('.product-navbar-toggle').click(); return true;"
        )
        mobile_navigation = driver.wait_for(
            """
            const menu = document.getElementById('product-nav');
            const rect = menu?.getBoundingClientRect();
            return menu?.classList.contains('show') && rect
              ? {left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth}
              : null;
            """,
            timeout=10,
            label="mobile product navigation",
        )
        if (
            float(mobile_navigation["left"]) < -2
            or float(mobile_navigation["right"])
            > float(mobile_navigation["viewport"]) + 2
        ):
            raise RuntimeError(
                f"mobile product navigation is outside the viewport: {mobile_navigation}"
            )
        removed_theme_controls = driver.execute(
            """
            return {
              toggle: document.querySelectorAll('[data-theme-toggle]').length,
              menu: document.querySelectorAll('#product-theme-menu').length,
              options: document.querySelectorAll('[data-theme-option]').length,
            };
            """
        )
        if removed_theme_controls != {"toggle": 0, "menu": 0, "options": 0}:
            raise RuntimeError(
                f"removed theme controls returned on mobile: {removed_theme_controls}"
            )
        driver.execute(
            "document.querySelector('.product-navbar-toggle').click(); return true;"
        )
        driver.wait_for(
            "return !document.getElementById('product-nav').classList.contains('show');",
            timeout=10,
            label="closed mobile product navigation",
        )
        driver.set_window_size(1440, 1000)
        driver.wait_for(
            "return innerWidth >= 1000 && document.documentElement.scrollWidth - innerWidth <= 2;",
            timeout=10,
            label="restored desktop learning analysis",
        )
        if analysis_screenshot_path is not None:
            analysis_screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(analysis_screenshot_path)
            print(
                f"PASS  captured learning analysis screenshot at {analysis_screenshot_path}",
                flush=True,
            )
        print(
            "PASS  learning analysis and navigation remain viewport-safe with no theme picker on mobile",
            flush=True,
        )

        driver.navigate(f"{module.BASE_URL}/workspace?service=simulation")
        removed_simulation = driver.wait_for(
            """
            if (document.readyState !== 'complete') return null;
            return {
              workspace: document.querySelectorAll('[data-simulation-workspace]').length,
              panels: document.querySelectorAll('.simulation-control-panel').length,
              tabs: document.querySelectorAll('.simulation-view-tab').length,
              runtimeGlobal: typeof window.AISecEduSimulation !== 'undefined',
              runtimeScripts: Array.from(document.scripts).filter(node =>
                (node.src || '').includes('simulation-workspace')
              ).length,
            };
            """,
            timeout=30,
            label="removed simulation engine",
        )
        if removed_simulation != {
            "workspace": 0,
            "panels": 0,
            "tabs": 0,
            "runtimeGlobal": False,
            "runtimeScripts": 0,
        }:
            raise RuntimeError(
                f"removed simulation engine returned: {removed_simulation}"
            )
        print(
            "PASS  the redundant embedded simulation engine remains removed",
            flush=True,
        )
    finally:
        driver.close()


def verify_existing_artifact_theme(
    module,
    teacher=None,
    artifact=None,
    *,
    verify_publish: bool = False,
    verify_slide_layout: bool = False,
    screenshot_path: pathlib.Path | None = None,
) -> None:
    """Verify the reported mixed-theme artifact page with the retained manual account."""

    if teacher is None:
        account_path = REPO_DIR / "data" / "manual-test-account.txt"
        values: dict[str, str] = {}
        for raw_line in account_path.read_text().splitlines():
            key, separator, value = raw_line.partition("=")
            if separator:
                values[key.strip()] = value.strip()
        if not values.get("username") or not values.get("password"):
            raise RuntimeError("manual artifact owner credential is unavailable")
        teacher = module.authenticate(values["username"], values["password"])
    if artifact is None:
        response = teacher.get(module.api_url("teaching/artifacts"), timeout=30)
        artifacts = module.unwrap(response).get("artifacts") or []
        artifact = next(
            (
                item
                for item in artifacts
                if item.get("status") in {"READY", "READY_TO_PUBLISH"}
            ),
            None,
        )
    if not artifact:
        raise RuntimeError(
            "manual teacher has no ready artifact for theme verification"
        )

    driver = ChromeDriver()
    try:
        driver.navigate(module.BASE_URL)
        for cookie in teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(f"{module.BASE_URL}/teacher/artifacts/{artifact['id']}")
        driver.wait_for(
            "return document.readyState === 'complete' && !!document.getElementById('teaching-artifact');",
            timeout=45,
            label="artifact detail page",
        )
        initial = driver.wait_for(
            """
            const frame = document.getElementById('artifact-preview');
            if (!frame || frame.hidden || !frame.contentDocument ||
                frame.contentDocument.readyState !== 'complete') return null;
            const previewState = frame.contentDocument
              .querySelector('[data-aisecedu-preview-state]')?.dataset.aiseceduPreviewState;
            if (previewState !== 'ready') return null;
            const theme = document.documentElement.dataset.aiseceduTheme;
            const frameTheme = frame.contentWindow.localStorage.getItem('theme');
            const frameRoot = frame.contentDocument.documentElement;
            const frameDark = frameRoot.classList.contains('dark');
            if (frameTheme !== theme || frameDark !== (theme === 'dark')) return null;
            const shell = document.getElementById('teaching-artifact');
            const slidePreview = frame.contentDocument
              .querySelector('[data-aisecedu-slide-preview="fill"]');
            const slideElement = slidePreview?.querySelector('.slide-element');
            const slideBounds = slidePreview?.getBoundingClientRect();
            const renderedBounds = slideElement?.getBoundingClientRect();
            const textElement = slidePreview?.querySelector('.base-element-text .element-content');
            const elementLayer = slideElement?.parentElement;
            const slideFrame = elementLayer?.parentElement;
            const slideBackground = slideFrame?.firstElementChild;
            if (slidePreview && (!slideBounds || slideBounds.width <= 0 || slideBounds.height <= 0
                || !renderedBounds || renderedBounds.width <= 0 || renderedBounds.height <= 0)) {
              return null;
            }
            return {
              theme,
              frameTheme,
              frameDark,
              previewState,
              previewArtifactCount: frame.contentDocument.querySelectorAll('main iframe[title]').length,
              hasSlidePreview: Boolean(slidePreview),
              slideWidthRatio: slideBounds && renderedBounds
                ? renderedBounds.width / slideBounds.width
                : 0,
              slideHeightRatio: slideBounds && renderedBounds
                ? renderedBounds.height / slideBounds.height
                : 0,
              slideTextColor: textElement ? getComputedStyle(textElement).color : '',
              slideBackgroundColor: slideBackground
                ? getComputedStyle(slideBackground).backgroundColor
                : '',
              placeholderHidden: document.getElementById('artifact-preview-placeholder')?.hidden,
              redundantPreviewAction: Boolean(document.getElementById('artifact-open-preview')),
              redundantApprovalPanel: Boolean(document.getElementById('artifact-approval')),
              redundantApprovalControls: Boolean(
                document.getElementById('artifact-approve') ||
                document.getElementById('artifact-reject') ||
                document.getElementById('artifact-approval-comment')
              ),
              fixedNotice: Boolean(document.getElementById('artifact-notice')),
              publishLabel: document.getElementById('artifact-request-publish')?.textContent.trim(),
              meta: document.getElementById('artifact-meta')?.textContent.trim(),
              validation: document.getElementById('artifact-validation')?.textContent.trim(),
              leakedBackendTerms: ['OpenMAIC materialization job', 'Dojo', 'Studio'].filter(term =>
                document.body.innerText.includes(term)
              ),
              marginTop: getComputedStyle(shell).marginTop,
              shellColor: getComputedStyle(shell).color,
              shellBackground: getComputedStyle(shell).backgroundColor,
            };
            """,
            timeout=120,
            label="global-agent artifact preview",
        )
        if initial["frameTheme"] != initial["theme"]:
            raise RuntimeError(f"artifact preview theme is not synchronized: {initial}")
        if not initial["placeholderHidden"] or initial["redundantPreviewAction"]:
            raise RuntimeError(
                f"artifact detail does not open directly into one embedded preview: {initial}"
            )
        if (
            initial["redundantApprovalPanel"]
            or initial["redundantApprovalControls"]
            or initial["fixedNotice"]
        ):
            raise RuntimeError(
                f"artifact detail retains redundant publication UI: {initial}"
            )
        if initial["publishLabel"] not in {"发布", "已发布"}:
            raise RuntimeError(f"artifact publication label is not direct: {initial}")
        if initial["previewState"] != "ready":
            raise RuntimeError(
                f"artifact preview shell loaded without real content: {initial}"
            )
        if verify_slide_layout:
            if (
                not initial["hasSlidePreview"]
                or float(initial["slideWidthRatio"]) < 0.9
            ):
                raise RuntimeError(
                    f"slide preview does not fill the available stage: {initial}"
                )
            if (
                initial["slideTextColor"] != "rgb(248, 250, 252)"
                or initial["slideBackgroundColor"] != "rgb(7, 17, 31)"
            ):
                raise RuntimeError(
                    f"slide preview did not preserve authored colors: {initial}"
                )
        if any(label in str(initial["meta"] or "") for label in ("生成中", "处理中")):
            raise RuntimeError(
                f"ready artifact still reports generation in progress: {initial}"
            )
        if (
            "处理中" in str(initial["validation"] or "")
            or initial["leakedBackendTerms"]
        ):
            raise RuntimeError(
                f"artifact detail exposes an unfinished or backend-facing label: {initial}"
            )
        if initial["marginTop"] != "0px":
            raise RuntimeError(
                f"artifact detail retains a duplicate top offset: {initial}"
            )
        if screenshot_path is not None:
            driver.screenshot(screenshot_path)

        driver.execute(
            "window.AISecEduUI.notify('临时提示测试', 'success', {duration: 500}); return true;"
        )
        toast = driver.wait_for(
            """
            const item = document.querySelector('.aisecedu-toast');
            const stack = document.querySelector('.aisecedu-toast-stack');
            if (!item || !stack || !item.classList.contains('is-visible')) return null;
            return {
              text: item.textContent.trim(),
              stackPosition: getComputedStyle(stack).position,
              hasBlockingDialog: Boolean(document.querySelector('.aisecedu-dialog-layer')),
            };
            """,
            timeout=10,
            label="transient toast notification",
        )
        if (
            "临时提示测试" not in toast["text"]
            or toast["stackPosition"] != "fixed"
            or toast["hasBlockingDialog"]
        ):
            raise RuntimeError(f"notification is not a non-blocking popup: {toast}")
        driver.wait_for(
            "return document.querySelectorAll('.aisecedu-toast').length === 0;",
            timeout=10,
            label="toast automatic dismissal",
        )

        if verify_publish:
            clicked = driver.execute(
                """
                const button = document.getElementById('artifact-request-publish');
                if (!button || button.hidden || button.disabled || button.textContent.trim() !== '发布') {
                  return false;
                }
                button.click();
                return true;
                """
            )
            if not clicked:
                raise RuntimeError(
                    f"generated artifact has no usable publish button: {initial}"
                )
            published = driver.wait_for(
                """
                const button = document.getElementById('artifact-request-publish');
                const success = Array.from(document.querySelectorAll('.aisecedu-toast'))
                  .some(item => item.textContent.includes('发布成功'));
                if (!button || button.textContent.trim() !== '已发布' || !button.disabled || !success) {
                  return null;
                }
                return {
                  button: button.textContent.trim(),
                  meta: document.getElementById('artifact-meta')?.textContent.trim(),
                  hasBlockingDialog: Boolean(document.querySelector('.aisecedu-dialog-layer')),
                  hasApprovalPanel: Boolean(document.getElementById('artifact-approval')),
                };
                """,
                timeout=180,
                label="one-click artifact publication",
            )
            if (
                "已发布" not in str(published["meta"])
                or published["hasBlockingDialog"]
                or published["hasApprovalPanel"]
            ):
                raise RuntimeError(
                    f"one-click publication retained an extra confirmation: {published}"
                )

        driver.execute("window.AISecEduUI.toggleTheme(); return true;")
        changed = driver.wait_for(
            f"""
            const frame = document.getElementById('artifact-preview');
            if (!frame || frame.hidden || !frame.contentDocument ||
                frame.contentDocument.readyState !== 'complete') return null;
            if (frame.contentDocument.querySelector('[data-aisecedu-preview-state]')
                ?.dataset.aiseceduPreviewState !== 'ready') return null;
            const theme = document.documentElement.dataset.aiseceduTheme;
            const frameTheme = frame.contentWindow.localStorage.getItem('theme');
            const frameDark = frame.contentDocument.documentElement.classList.contains('dark');
            if (theme === {initial["theme"]!r} || frameTheme !== theme ||
                frameDark !== (theme === 'dark')) return null;
            const slidePreview = frame.contentDocument
              .querySelector('[data-aisecedu-slide-preview="fill"]');
            const slideElement = slidePreview?.querySelector('.slide-element');
            const slideBounds = slidePreview?.getBoundingClientRect();
            const renderedBounds = slideElement?.getBoundingClientRect();
            const textElement = slidePreview?.querySelector('.base-element-text .element-content');
            const elementLayer = slideElement?.parentElement;
            const slideFrame = elementLayer?.parentElement;
            const slideBackground = slideFrame?.firstElementChild;
            return {{
              theme,
              frameTheme,
              frameDark,
              hasSlidePreview: Boolean(slidePreview),
              slideWidthRatio: slideBounds && renderedBounds
                ? renderedBounds.width / slideBounds.width
                : 0,
              slideTextColor: textElement ? getComputedStyle(textElement).color : '',
              slideBackgroundColor: slideBackground
                ? getComputedStyle(slideBackground).backgroundColor
                : '',
            }};
            """,
            timeout=45,
            label="artifact preview theme synchronization",
        )
        if {initial["theme"], changed["theme"]} != {"dark", "light"}:
            raise RuntimeError(
                f"artifact page did not switch between dark and light themes: {initial}, {changed}"
            )
        if initial["frameDark"] == changed["frameDark"]:
            raise RuntimeError(
                f"global-agent preview did not apply the changed theme class: {initial}, {changed}"
            )
        if verify_slide_layout:
            if (
                not changed["hasSlidePreview"]
                or float(changed["slideWidthRatio"]) < 0.9
            ):
                raise RuntimeError(
                    f"slide preview shrank after the theme switch: {changed}"
                )
            if (
                changed["slideTextColor"] != initial["slideTextColor"]
                or changed["slideBackgroundColor"] != initial["slideBackgroundColor"]
            ):
                raise RuntimeError(
                    "application theme changed the authored slide palette: "
                    f"{initial}, {changed}"
                )
        if screenshot_path is not None:
            changed_screenshot = screenshot_path.with_name(
                f"{screenshot_path.stem}-{changed['theme']}{screenshot_path.suffix}"
            )
            driver.screenshot(changed_screenshot)
        bootstrap_errors = [
            str(entry.get("message", ""))
            for entry in driver.browser_logs()
            if "/agent-runtime/api/server-providers" in str(entry.get("message", ""))
            or "/agent-runtime/api/access-code/status" in str(entry.get("message", ""))
        ]
        if bootstrap_errors:
            raise RuntimeError(
                f"integrated preview still requests standalone bootstrap APIs: {bootstrap_errors}"
            )
        print(
            (
                "PASS  artifact preview, transient notices, and one-click publication"
                if verify_publish
                else "PASS  artifact detail, transient notices, and embedded preview themes"
            ),
            flush=True,
        )
    finally:
        driver.close()


def verify_student_portal_only(
    verifier,
    module,
    screenshot_path: pathlib.Path | None = None,
) -> None:
    if (
        verifier.student is None
        or verifier.seed_course_reference is None
    ):
        raise RuntimeError("student portal verification context is unavailable")
    legacy_join = verifier.student.get(
        f"{module.BASE_URL}/dojo/{verifier.seed_course_reference}/join/",
        allow_redirects=False,
        timeout=30,
    )
    if legacy_join.status_code != 303:
        raise RuntimeError(
            f"legacy GET enrollment did not remain read-only: {legacy_join.status_code}"
        )
    join_code = verifier.api(
        verifier.teacher,
        "POST",
        f"teaching/courses/{verifier.seed_course_reference}/join-code",
        json_body={"regenerate": False},
    )["code"]
    verifier.api(
        verifier.student,
        "POST",
        "dojos/enrollment/code",
        json_body={"course_code": join_code},
        statuses=(200, 201),
    )

    snapshot = verifier.top_level_api(
        verifier.student,
        "GET",
        "learning/overview",
    )
    policy = (snapshot.get("workspace") or {}).get("policy") or {}
    if (
        snapshot.get("summary", {}).get("enrolledCourses", 0) < 1
        or policy.get("role") != "student"
        or "read-other-students-data" not in (policy.get("denied") or [])
    ):
        raise RuntimeError(
            f"student portal account scope is incomplete: {snapshot}"
        )

    guide = verifier.top_level_api(
        verifier.student,
        "GET",
        "learning/guide",
    )
    guide_policy = (guide.get("workspace") or {}).get("policy") or {}
    if (
        len(guide.get("quickPrompts") or []) < 3
        or not isinstance(guide.get("referenceOptions"), list)
        or guide_policy.get("role") != "student"
    ):
        raise RuntimeError(f"student learning Agent context is incomplete: {guide}")
    created_thread = verifier.top_level_api(
        verifier.student,
        "POST",
        "learning/guide/threads",
        json_body={},
        statuses=(201,),
    ).get("thread") or {}
    created_thread_id = str(created_thread.get("id") or "")
    if not created_thread_id:
        raise RuntimeError("student learning Agent did not persist a new conversation")
    verifier.top_level_api(
        verifier.student,
        "DELETE",
        f"learning/guide/threads/{created_thread_id}",
    )

    driver = ChromeDriver()
    try:
        driver.navigate(module.BASE_URL)
        for cookie in verifier.student.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(f"{module.BASE_URL}/student")
        desktop = driver.wait_for(
            """
            const root = document.getElementById('learning-overview');
            const ready = document.getElementById('learning-ready');
            const next = document.querySelector('#learning-next-action .sl-next-card');
            if (!root || root.getAttribute('aria-busy') !== 'false' || !ready || ready.hidden
              || !next || !document.querySelector('.sl-course-card')) return null;
            return {
              heading: root.querySelector('.sl-today-heading h2')?.textContent.trim(),
              taskSurfaces: root.querySelectorAll('.sl-today-grid > section').length,
              agentHref: Array.from(root.querySelectorAll('.sl-secondary-links a')).find(node =>
                node.textContent.includes('AI 学习助手'))?.getAttribute('href'),
              navigation: Array.from(document.querySelectorAll('.product-primary-nav .nav-link span')).map(node => node.textContent.trim()),
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
            """,
            timeout=45,
            label="student portal desktop",
        )
        if (
            desktop["heading"] != "今天先做这一件事"
            or int(desktop["taskSurfaces"]) != 2
            or desktop["agentHref"] != "/guide"
            or desktop["navigation"] != ["今天", "课程", "AI 学习"]
            or float(desktop["overflow"]) > 2
        ):
            raise RuntimeError(f"student portal desktop regressed: {desktop}")

        palettes = {}
        for palette in ("academy", "forest", "sunrise", "midnight"):
            driver.execute(
                f"window.AISecEduUI.applyPalette({palette!r}, false); return true;"
            )
            palettes[palette] = driver.wait_for(
                f"""
                if (document.documentElement.dataset.aiseceduPalette !== {palette!r}) return null;
                const rootStyle = getComputedStyle(document.documentElement);
                const probe = document.createElement('span');
                probe.style.color = rootStyle.getPropertyValue('--theme-bg').trim();
                document.body.appendChild(probe);
                const expected = getComputedStyle(probe).color;
                probe.remove();
                const actual = getComputedStyle(document.body).backgroundColor;
                if (actual !== expected) return null;
                return {{background: actual, surface: getComputedStyle(document.querySelector('.cs-surface')).backgroundColor}};
                """,
                timeout=10,
                label=f"{palette} student portal palette",
            )
        if len({item["background"] for item in palettes.values()}) != 4:
            raise RuntimeError(f"student portal palettes are not distinct: {palettes}")

        driver.set_window_size(390, 844)
        mobile = driver.wait_for(
            """
            const root = document.getElementById('learning-overview');
            if (!root || innerWidth > 420) return null;
            const taskGrid = getComputedStyle(document.querySelector('.sl-today-grid')).gridTemplateColumns;
            const next = getComputedStyle(document.querySelector('.sl-next-card')).gridTemplateColumns;
            return {
              overflow: document.documentElement.scrollWidth - innerWidth,
              taskGrid,
              next,
            };
            """,
            timeout=10,
            label="student portal mobile",
        )
        if float(mobile["overflow"]) > 2 or " " in mobile["taskGrid"].strip():
            raise RuntimeError(f"student portal mobile regressed: {mobile}")

        driver.set_window_size(1440, 1000)
        driver.navigate(f"{module.BASE_URL}/guide")
        agent = driver.wait_for(
            """
            const root = document.getElementById('teacher-agent');
            const prompts = document.querySelectorAll('.teaching-quick-prompts [data-student-prompt]');
            const empty = document.querySelector('.student-agent-empty');
            if (!root || root.dataset.role !== 'student' || root.getAttribute('aria-busy') !== 'false'
              || prompts.length !== 4 || !empty?.textContent.trim()) return null;
            return {
              heading: document.querySelector('h1.sr-only')?.textContent.trim(),
              composer: document.getElementById('teaching-input')?.placeholder,
              personalWorkspaceHref: root.querySelector('.teaching-sidebar-nav a[href="/learning/extend"]')?.getAttribute('href'),
              promptLabels: Array.from(prompts).map(node => node.textContent.trim()),
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
            """,
            timeout=45,
            label="student learning Agent",
        )
        if (
            agent["heading"] != "AI 学习助手"
            or agent["personalWorkspaceHref"] != "/learning/extend"
            or "告诉智能体" not in str(agent["composer"])
            or len(agent["promptLabels"]) != 4
            or float(agent["overflow"]) > 2
        ):
            raise RuntimeError(f"student learning Agent regressed: {agent}")

        driver.navigate(f"{module.BASE_URL}/learning/extend")
        workspace = driver.wait_for(
            """
            const root = document.getElementById('self-learning-extend');
            const list = document.getElementById('self-learning-workspace-list');
            const empty = document.getElementById('self-learning-workspace-empty');
            if (!root || !list || !empty || (!list.children.length && empty.hidden)) return null;
            return {
              heading: root.querySelector('h1')?.textContent.trim(),
              search: document.getElementById('self-learning-search')?.placeholder,
              guideHref: root.querySelector('.sx-header-actions a')?.getAttribute('href'),
              count: document.getElementById('self-learning-count')?.textContent.trim(),
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
            """,
            timeout=45,
            label="student personal workspace",
        )
        if (
            workspace["heading"] != "我的创作"
            or workspace["guideHref"] != "/guide?intent=create"
            or "搜索" not in str(workspace["search"])
            or workspace["count"] == "正在加载"
            or float(workspace["overflow"]) > 2
        ):
            raise RuntimeError(f"student personal workspace regressed: {workspace}")

        driver.navigate(f"{module.BASE_URL}/student")
        driver.wait_for(
            "return !!document.querySelector('#learning-next-action .sl-next-card');",
            timeout=45,
            label="student portal after learning workspace navigation",
        )
        driver.execute("window.AISecEduUI.applyPalette('academy', false); return true;")
        if screenshot_path is not None:
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            driver.screenshot(screenshot_path)
        errors = [
            entry
            for entry in driver.browser_logs()
            if str(entry.get("level", "")).upper() == "SEVERE"
            and "favicon" not in str(entry.get("message", "")).lower()
            and "/events" not in str(entry.get("message", ""))
        ]
        if errors:
            raise RuntimeError(f"student portal browser errors: {errors[-5:]}")
        print(
            "PASS  student portal, persistent Agent threads, personal workspaces, learner scope, four themes, and responsive layout",
            flush=True,
        )
    finally:
        driver.close()


def verify_isolated_slide_preview_layout(
    module,
    screenshot_path: pathlib.Path | None = None,
) -> None:
    verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
    artifact_id = f"artifact_preview_{verifier.suffix}"
    revision_id = f"revision_preview_{verifier.suffix}"

    def sql_string(value: object) -> str:
        return "'" + str(value).replace("'", "''") + "'"

    def database(sql: str) -> None:
        module.outer(
            "docker",
            "exec",
            "db",
            "psql",
            "-U",
            "ctfd",
            "-d",
            "ctfd",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            sql,
        )

    try:
        verifier.setup()
        assert verifier.teacher is not None
        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        course = next(
            (item for item in context.get("teacherDojos", []) if item.get("modules")),
            None,
        )
        if course is None:
            raise RuntimeError("isolated teacher has no course for the slide fixture")
        module_item = course["modules"][0]
        now_ms = int(time.time() * 1000)
        lesson = {
            "id": artifact_id,
            "title": "深色主题课件预览回归",
            "description": "验证课件画布尺寸与主题隔离",
            "subjectProfile": "cybersecurity",
            "courseId": str(course["id"]),
            "artifacts": [
                {
                    "id": "preview-slide-1",
                    "type": "slide",
                    "title": "攻防双视角",
                    "outline": {
                        "id": "preview-outline-1",
                        "type": "slide",
                        "order": 1,
                        "title": "攻防双视角",
                        "description": "深色课件页面",
                        "keyPoints": ["攻击链", "防守观察点"],
                    },
                    "content": {
                        "background": {"type": "solid", "color": "#07111f"},
                        "elements": [
                            {
                                "id": "preview-title",
                                "type": "text",
                                "left": 72,
                                "top": 72,
                                "width": 856,
                                "height": 96,
                                "rotate": 0,
                                "content": (
                                    '<p style="font-size:48px;font-weight:700;'
                                    'line-height:1.15">逆向工程 CTF 实践</p>'
                                ),
                                "defaultColor": "#f8fafc",
                                "defaultFontName": "Microsoft YaHei",
                                "lineHeight": 1.15,
                            },
                            {
                                "id": "preview-subtitle",
                                "type": "text",
                                "left": 76,
                                "top": 205,
                                "width": 820,
                                "height": 72,
                                "rotate": 0,
                                "content": (
                                    '<p style="font-size:25px;line-height:1.4">'
                                    "从攻击路径到防守证据的完整课堂推演</p>"
                                ),
                                "defaultColor": "#7dd3fc",
                                "defaultFontName": "Microsoft YaHei",
                                "lineHeight": 1.4,
                            },
                        ],
                    },
                    "order": 1,
                    "createdAt": now_ms,
                }
            ],
            "createdAt": now_ms,
            "updatedAt": now_ms,
        }
        content = json.dumps(lesson, ensure_ascii=False, separators=(",", ":"))
        owner_id = int(context["user"]["id"])
        dojo_id = int(course["id"])
        module_index = int(module_item["index"])
        database(
            "INSERT INTO teaching_artifacts "
            "(id, owner_id, dojo_id, module_index, artifact_type, title, status, "
            "current_revision, created, updated) VALUES ("
            f"{sql_string(artifact_id)}, {owner_id}, {dojo_id}, {module_index}, "
            "'slide-deck', '深色主题课件预览回归', 'READY', 1, NOW(), NOW()); "
            "INSERT INTO teaching_artifact_revisions "
            "(id, artifact_id, revision, instruction, content, content_hash, "
            "source_refs, validation, created_by, created) VALUES ("
            f"{sql_string(revision_id)}, {sql_string(artifact_id)}, 1, "
            f"'课件预览回归夹具', {sql_string(content)}::jsonb, "
            f"{sql_string(secrets.token_hex(32))}, '[]'::jsonb, "
            f'\'{{"status":"PASS"}}\'::jsonb, {owner_id}, NOW());'
        )
        verify_existing_artifact_theme(
            module,
            teacher=verifier.teacher,
            artifact={
                "id": artifact_id,
                "title": lesson["title"],
                "status": "READY",
                "type": "slide-deck",
            },
            verify_slide_layout=True,
            screenshot_path=screenshot_path,
        )
    finally:
        try:
            database(
                "DELETE FROM teaching_artifact_revisions WHERE artifact_id = "
                f"{sql_string(artifact_id)}; "
                "DELETE FROM teaching_artifacts WHERE id = "
                f"{sql_string(artifact_id)};"
            )
        except Exception:
            pass
        verifier.cleanup()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-theme-only", action="store_true")
    parser.add_argument("--student-portal-only", action="store_true")
    parser.add_argument("--artifact-preview-layout-only", action="store_true")
    parser.add_argument("--artifact-preview-screenshot", type=pathlib.Path)
    parser.add_argument("--generated-artifact-theme", action="store_true")
    parser.add_argument("--pdf-upload-only", action="store_true")
    parser.add_argument("--conversation-upload-only", action="store_true")
    parser.add_argument("--html-file-only", action="store_true")
    parser.add_argument("--message-layout-only", action="store_true")
    parser.add_argument("--retry-in-place-only", action="store_true")
    parser.add_argument("--quick-scope-only", action="store_true")
    parser.add_argument("--generation-options-only", action="store_true")
    parser.add_argument("--quick-scope-screenshot", type=pathlib.Path)
    parser.add_argument("--generation-options-screenshot", type=pathlib.Path)
    parser.add_argument("--screenshot", type=pathlib.Path)
    parser.add_argument("--course-screenshot", type=pathlib.Path)
    parser.add_argument("--learner-screenshot", type=pathlib.Path)
    parser.add_argument("--learning-analysis-screenshot", type=pathlib.Path)
    parser.add_argument("--theme-screenshot-dir", type=pathlib.Path)
    args = parser.parse_args()
    module = load_verifier_module()
    if args.student_portal_only:
        verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
        result = 0
        try:
            verifier.setup()
            verify_student_portal_only(
                verifier,
                module,
                args.learner_screenshot,
            )
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            result = 1
        finally:
            verifier.cleanup()
        if verifier.ledger.failed:
            result = 1
        return result
    if args.artifact_preview_layout_only:
        try:
            verify_isolated_slide_preview_layout(
                module,
                args.artifact_preview_screenshot,
            )
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.pdf_upload_only:
        try:
            verify_large_pdf_upload(module)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.conversation_upload_only:
        try:
            verify_global_agent_conversation_upload(module)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.html_file_only:
        try:
            verify_html_file_delivery(module)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.message_layout_only:
        try:
            verify_teacher_message_layout(module)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.retry_in_place_only:
        try:
            verify_retry_in_place_persistence(module)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.quick_scope_only:
        try:
            verify_quick_scope_picker(module, args.quick_scope_screenshot)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.generation_options_only:
        try:
            verify_generation_option_picker(module, args.generation_options_screenshot)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1
    if args.artifact_theme_only:
        try:
            try:
                verify_existing_artifact_theme(module)
            except RuntimeError as error:
                if "no ready artifact" not in str(error):
                    raise
                print(
                    "INFO  manual theme artifact is absent; using an isolated slide fixture",
                    flush=True,
                )
                verify_isolated_slide_preview_layout(module)
            return 0
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            return 1

    if args.generated_artifact_theme:
        verifier = module.TeacherAgentVerifier(job_timeout=900, authoring_timeout=1200)
        result = 0
        try:
            verifier.setup()
            context = verifier.api(verifier.teacher, "GET", "teaching/context")
            course = next(
                (
                    item
                    for item in context.get("teacherDojos", [])
                    if item.get("modules")
                ),
                None,
            )
            if course is None:
                raise RuntimeError(
                    "isolated teacher has no course module for artifact generation"
                )
            module_item = course["modules"][0]
            verifier.api(
                verifier.teacher,
                "PATCH",
                f"teaching/threads/{verifier.thread_id}",
                json_body={
                    "dojoId": course["id"],
                    "moduleIndex": module_item["index"],
                },
            )
            verifier.send_generation(
                "生成一份简洁的网络安全课件，包含学习目标、核心概念图示和课堂小结",
                "slide-deck",
                "single",
                "deepseek-v4-flash",
                materialize=True,
                allow_materialize_model_change=True,
            )
            verify_existing_artifact_theme(
                module,
                teacher=verifier.teacher,
                artifact=verifier.artifacts[-1],
                verify_publish=True,
            )
        except Exception as error:
            print(f"FAIL  {error}", flush=True)
            result = 1
        finally:
            verifier.cleanup()
        if verifier.ledger.failed:
            result = 1
        return result

    verifier = module.TeacherAgentVerifier(job_timeout=180, authoring_timeout=600)
    result = 0
    try:
        verifier.setup()
        prepare_management_fixture(verifier, module)
        verify_ui(
            verifier,
            module,
            args.screenshot,
            args.course_screenshot,
            args.theme_screenshot_dir,
        )
        verify_learner_ui(
            verifier,
            module,
            args.learner_screenshot,
            args.learning_analysis_screenshot,
        )
        try:
            verify_existing_artifact_theme(module)
        except RuntimeError as error:
            if "no ready artifact" not in str(error):
                raise
            print(
                "SKIP  artifact theme fixture is absent; Agent UI checks are complete",
                flush=True,
            )
    except Exception as error:
        print(f"FAIL  {error}", flush=True)
        result = 1
    finally:
        cleanup_management_fixture(verifier)
        verifier.cleanup()
    if verifier.ledger.failed:
        result = 1
    return result


if __name__ == "__main__":
    raise SystemExit(main())

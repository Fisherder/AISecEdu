#!/usr/bin/env python3
"""Browser E2E for upload-only intent clarification and material placement.

The verifier intentionally keeps its uniquely named course and conversation so
the acceptance evidence remains visible in the teacher web UI.
"""

from __future__ import annotations

import argparse
import importlib.util
import pathlib
import secrets
import sys
import tempfile
import time


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
FLOW_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
UI_PATH = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument(
        "--screenshot-dir",
        type=pathlib.Path,
        default=REPO_DIR / "data" / "verification",
    )
    args = parser.parse_args()
    flow = load_module("teacher_upload_flow", FLOW_PATH)
    ui = load_module("teacher_upload_ui", UI_PATH)
    admin_name, admin_password = flow.admin_credentials()
    teacher = flow.authenticate(admin_name, admin_password)
    suffix = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)
    # Native dojo references are intentionally compact (maximum 32 chars).
    course_reference = f"attachment-e2e-{time.strftime('%H%M%S')}-{secrets.token_hex(2)}"
    course_name = f"附件上下文网页验收 {suffix}"
    module_id = "uploaded-materials"
    module_name = "上传资料验收"
    resource_name = f"智能体上传资料 {suffix}.txt"
    spec = (
        f"id: {course_reference}\n"
        f"name: {course_name}\n"
        "type: public\n"
        "modules:\n"
        f"  - id: {module_id}\n"
        f"    name: {module_name}\n"
        "    challenges: []\n"
    )
    created = flow.require(
        teacher.post(
            f"{flow.BASE_URL}/pwncollege_api/v1/dojos/create",
            json={"spec": spec},
            timeout=120,
        )
    ).json()
    course_reference = str(created.get("dojo") or course_reference)
    context = flow.unwrap(
        teacher.get(flow.api_url("teaching/context?view=teacher"), timeout=60)
    )
    course = next(
        item
        for item in context.get("teacherDojos", [])
        if item.get("referenceId") == course_reference
    )
    module = next(
        item for item in course.get("modules", []) if item.get("id") == module_id
    )
    thread_title = f"上传文件自然语言验收 {suffix}"
    thread = flow.unwrap(
        teacher.post(
            flow.api_url("teaching/threads"),
            json={"title": thread_title},
            timeout=30,
        ),
        (201,),
    )["thread"]
    thread_id = thread["id"]
    command = (
        f"帮我把这份文件添加到课程“{course_name}”的章节“{module_name}”资料中，"
        f"资料名称设为“{resource_name}”。"
    )
    args.screenshot_dir.mkdir(parents=True, exist_ok=True)
    conversation_shot = args.screenshot_dir / f"conversation-upload-{suffix}.png"
    course_shot = args.screenshot_dir / f"conversation-upload-course-{suffix}.png"

    with tempfile.TemporaryDirectory(
        prefix="aisecedu-conversation-upload-", dir=pathlib.Path.home()
    ) as temporary:
        material_path = pathlib.Path(temporary) / resource_name
        material_path.write_text(
            "缓冲区溢出课程补充资料\n"
            f"验收批次：{suffix}\n"
            "目标：理解栈帧、返回地址控制、动态 Flag 与常见防护机制。\n"
            "用途：作为指定课程章节的教师补充资料。\n",
            encoding="utf-8",
        )
        driver = ui.ChromeDriver(port=9600 + secrets.randbelow(300))
        try:
            driver.navigate(flow.BASE_URL)
            for cookie in teacher.cookies:
                driver.add_cookie(cookie.name, cookie.value)
            driver.navigate(f"{flow.BASE_URL}/teacher")
            driver.wait_for(
                "return document.getElementById('teaching-input') && "
                "document.getElementById('teaching-thread-title')?.textContent.includes("
                + repr(thread_title)
                + ");",
                timeout=60,
                label="new persistent upload conversation",
            )
            driver.execute(
                "const input=document.getElementById('teaching-upload');"
                "if(input) input.hidden=false; return Boolean(input);"
            )
            driver.send_file("#teaching-upload", material_path)
            driver.wait_for(
                "const text=document.getElementById('teaching-messages')?.innerText||'';"
                "return text.includes('你希望我如何处理这份文件') && "
                "text.includes('添加到某门课程') && text.includes('创建课件') && "
                "text.includes('CTF 实践题') && text.includes('模拟演示');",
                timeout=120,
                label="four-way upload intent clarification",
            )
            upload_state = flow.unwrap(
                teacher.get(
                    flow.api_url(f"teaching/threads/{thread_id}"), timeout=30
                )
            )["thread"]
            pending = upload_state.get("context", {}).get("pendingAttachments", [])
            if not pending or pending[-1].get("status") != "AWAITING_INTENT":
                raise RuntimeError(f"unexpected upload intent state: {pending}")
            material_id = str(pending[-1]["id"])
            driver.execute(
                "const input=document.getElementById('teaching-input');"
                f"input.value={command!r};"
                "input.dispatchEvent(new Event('input',{bubbles:true}));"
                "document.getElementById('teaching-send').click(); return true;"
            )

            deadline = time.monotonic() + max(120, args.timeout)
            last_status = None
            while time.monotonic() < deadline:
                current = flow.unwrap(
                    teacher.get(
                        flow.api_url(f"teaching/threads/{thread_id}"), timeout=30
                    )
                )["thread"]
                attachments = current.get("context", {}).get(
                    "pendingAttachments", []
                )
                attachment = next(
                    (
                        item
                        for item in attachments
                        if str(item.get("id")) == material_id
                    ),
                    None,
                )
                last_status = (attachment or {}).get("status")
                if last_status == "PLACED":
                    break
                failed_messages = [
                    item
                    for item in current.get("messages", [])
                    if item.get("role") == "assistant"
                    and (item.get("metadata") or {}).get("failed") is True
                ]
                if failed_messages:
                    raise RuntimeError(
                        "agent placement failed: " + failed_messages[-1].get("content", "")
                    )
                time.sleep(2)
            else:
                raise RuntimeError(
                    f"attachment was not placed before timeout; status={last_status}"
                )

            driver.navigate(f"{flow.BASE_URL}/teacher")
            driver.wait_for(
                "const text=document.getElementById('teaching-messages')?.innerText||'';"
                "const send=document.getElementById('teaching-send');"
                f"return text.includes({command!r}) && "
                "(text.includes('章节资料已添加') || text.includes('已添加到')) && "
                "!document.querySelector('.teaching-message.is-activity') && "
                "send?.title === '发送消息';",
                timeout=max(120, args.timeout),
                label="stable visible placement result in conversation",
            )
            driver.screenshot(conversation_shot)
            driver.navigate(
                f"{flow.BASE_URL}/{course_reference}/{module['id']}#module-content"
            )
            driver.wait_for(
                f"return document.body.innerText.includes({resource_name!r});",
                timeout=90,
                label="placed resource on course module page",
            )
            driver.screenshot(course_shot)
        finally:
            driver.close()

    print("PASS  upload-only browser interaction asked for all four intents")
    print("PASS  natural-language follow-up retained the real materialId")
    print("PASS  Agent placed the original downloadable file in the named module")
    print(f"COURSE {course_name} ({course_reference})")
    print(f"THREAD {thread_title} ({thread_id})")
    print(f"MATERIAL {material_id}")
    print(f"CONVERSATION_SCREENSHOT {conversation_shot}")
    print(f"COURSE_SCREENSHOT {course_shot}")
    print("INFO  Course and conversation were intentionally retained for web review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Verify real-file delivery and the three-option generation gate.

This focused production-safe verifier reuses the isolated accounts and cleanup
machinery from ``verify-teacher-agent-flow.py``.  It deliberately exercises a
real model turn so an empty HTML shell, a fake download, or premature formal
generation cannot pass on mocked responses alone.
"""

from __future__ import annotations

import html
import importlib.util
import json
import pathlib
import re
import sys
from typing import Any


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
FLOW_VERIFIER = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
UI_VERIFIER = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"


def _load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load verifier module {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_flow_verifier():
    return _load_module("teacher_agent_flow_for_output_contract", FLOW_VERIFIER)


def _visible_html_text(source: str) -> str:
    body = re.search(r"<body\b[^>]*>([\s\S]*?)</body\s*>", source, re.I)
    scope = body.group(1) if body else source
    scope = re.sub(r"<!--[\s\S]*?-->", " ", scope)
    scope = re.sub(
        r"<(script|style|template|noscript)\b[^>]*>[\s\S]*?</\1\s*>",
        " ",
        scope,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", scope))).strip()


def _require(condition: Any, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _verify_generation_options_ui(verifier, flow, options: list[dict[str, Any]]) -> None:
    ui = _load_module("teacher_agent_ui_for_output_contract", UI_VERIFIER)
    driver = ui.ChromeDriver()
    try:
        driver.navigate(flow.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(f"{flow.BASE_URL}/teacher")
        expected_titles = json.dumps(
            [item["title"] for item in options], ensure_ascii=False
        )
        rendered = driver.wait_for(
            f"""
            if (document.readyState !== 'complete') return null;
            const expected = {expected_titles};
            const sections = Array.from(document.querySelectorAll('.teaching-generation-options'));
            const section = sections.find(node => {{
              const titles = Array.from(node.querySelectorAll('h4')).map(item => item.textContent.trim());
              return titles.length === 3 && titles.every((value, index) => value === expected[index]);
            }});
            if (!section) return null;
            const rows = Array.from(section.querySelectorAll('.teaching-generation-option'));
            return {{
              heading: section.querySelector('h3')?.textContent.trim() || '',
              intro: section.querySelector('.teaching-generation-options-header p')
                ?.textContent.trim() || '',
              rows: rows.map(row => ({{
                title: row.querySelector('h4')?.textContent.trim() || '',
                description: row.querySelector('.teaching-generation-option-description')
                  ?.textContent.trim() || '',
                highlights: Array.from(row.querySelectorAll(
                  '.teaching-generation-option-highlights li'
                )).map(item => item.textContent.trim()),
                button: row.querySelector('.teaching-generation-option-select')
                  ?.textContent.trim() || '',
                disabled: Boolean(row.querySelector('.teaching-generation-option-select')?.disabled),
              }})),
              leakedToolNames: ['candidate.generate', 'challenge.generate'].filter(name =>
                section.textContent.includes(name)
              ),
              promptControl: Boolean(section.querySelector('.teaching-generation-option-prompt')),
              promptLabel: section.textContent.includes('查看完整生成提示词'),
            }};
            """,
            timeout=60,
            label="three detailed generation options",
        )
        _require(rendered["heading"] == "选择一套方案", "option UI has wrong heading")
        _require("选择前不会开始" in rendered["intro"], "option UI does not explain the gate")
        _require(len(rendered["rows"]) == 3, "option UI does not render exactly three rows")
        for index, row in enumerate(rendered["rows"]):
            expected = options[index]
            _require(row["title"] == expected["title"], "option title is altered or truncated")
            _require(
                row["description"] == expected["description"],
                "option description is altered or truncated",
            )
            _require(row["highlights"] == expected["highlights"], "option highlights are incomplete")
            _require(
                row["button"] == f"选择方案 {index + 1}",
                "option selection command is unclear",
            )
            _require(not row["disabled"], "unselected generation option is disabled")
        _require(not rendered["leakedToolNames"], "option UI exposes internal tool names")
        _require(not rendered["promptControl"], "teacher UI exposes rewritten prompt controls")
        _require(not rendered["promptLabel"], "teacher UI exposes rewritten prompt labels")
        verifier.ledger.pass_(
            "browser renders three decision-ready plans without exposing internal prompts"
        )
    finally:
        driver.close()


def main() -> int:
    flow = _load_flow_verifier()
    verifier = flow.TeacherAgentVerifier(job_timeout=600, authoring_timeout=2400)
    try:
        verifier.setup()
        _require(verifier.teacher is not None, "isolated teacher session was not created")
        _require(verifier.thread_id is not None, "isolated Agent thread was not created")

        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        seed_course = next(
            (
                item
                for item in context.get("teacherDojos") or []
                if item.get("referenceId") == verifier.seed_course_reference
            ),
            None,
        )
        _require(seed_course is not None, "isolated teacher has no selectable seed course")
        modules = seed_course.get("modules") or []
        bound_thread = verifier.api(
            verifier.teacher,
            "POST",
            "teaching/threads",
            json_body={
                "dojoId": seed_course.get("id"),
                "moduleIndex": modules[0].get("index") if modules else None,
                "title": f"文件与三方案验收 {verifier.suffix}",
            },
            statuses=(201,),
        )["thread"]
        verifier.thread_id = bound_thread["id"]

        file_job, _ = verifier.send_agent(
            "帮我生成一份可直接下载、适合浏览器打印为 PDF 的完整 HTML 教案文件。"
            "主题是软件安全中的缓冲区溢出基础；至少包含教学目标、先修知识、90 分钟教学流程、"
            "栈帧原理、隔离实验步骤、安全边界、课堂检查、作业与评价标准。正文必须完整可见，"
            "不能只有标题、目录、空白页面或占位符。"
        )
        file_result = file_job.get("result") or {}
        files = file_result.get("files") or []
        html_files = [item for item in files if item.get("format") == "html"]
        _require(len(html_files) == 1, "real model turn did not deliver exactly one HTML file")
        delivered = html_files[0]
        download_url = str(delivered.get("downloadUrl") or "")
        _require(download_url.startswith("/"), "HTML file has no trusted download URL")
        response = verifier.teacher.get(
            f"{flow.BASE_URL}{download_url}", timeout=60, allow_redirects=False
        )
        flow.require(response)
        source = response.content.decode("utf-8", errors="replace")
        visible = re.sub(r"\s+", "", _visible_html_text(source))
        _require(re.search(r"<!doctype\s+html", source, re.I), "download is not HTML")
        _require(re.search(r"<body\b", source, re.I), "download has no body")
        _require(re.search(r"</html\s*>", source, re.I), "download is incomplete")
        _require(len(visible) >= 200, "downloaded HTML has no substantive visible lesson body")
        _require(
            all(term in source for term in ("教学目标", "实验", "评价")),
            "downloaded HTML omitted required lesson sections",
        )
        _require(
            int(delivered.get("size") or 0) == len(response.content),
            "download size does not match stored metadata",
        )
        verifier.ledger.pass_("real model delivers a complete, visible, downloadable HTML lesson")

        generation_job, _ = verifier.send_agent(
            "生成一套可直接授课的 SQL 注入防御页面式课件，覆盖漏洞成因、参数化查询、"
            "错误示例、修复演示、课堂练习和学习检查。"
        )
        generation_result = generation_job.get("result") or {}
        bundle = generation_result.get("generationOptions") or {}
        options = bundle.get("options") or []
        _require(bundle.get("targetTool") == "candidate.generate", "wrong generation target")
        _require(bundle.get("artifactType") == "slide-deck", "wrong artifact type")
        _require(len(options) == 3, "generation turn did not return exactly three options")
        _require(
            len({str(item.get("rewrittenPrompt") or "").strip() for item in options}) == 3,
            "generation options do not have distinct rewritten prompts",
        )
        for option in options:
            _require(len(str(option.get("description") or "").strip()) >= 24, "option is terse")
            _require(len(option.get("highlights") or []) >= 2, "option lacks detailed highlights")
            _require(
                len(re.sub(r"\s+", "", str(option.get("rewrittenPrompt") or ""))) >= 80,
                "option does not contain a complete rewritten prompt",
            )
        formal_tools = {
            item.get("tool") for item in generation_result.get("toolProposals") or []
        }
        _require(
            not {"candidate.generate", "challenge.generate"}.intersection(formal_tools),
            "formal generation started before the teacher selected an option",
        )
        _verify_generation_options_ui(verifier, flow, options)

        thread = verifier.api(
            verifier.teacher, "GET", f"teaching/threads/{verifier.thread_id}"
        )["thread"]
        source_message = next(
            (
                item
                for item in reversed(thread.get("messages") or [])
                if (item.get("metadata") or {}).get("jobId") == generation_job.get("id")
            ),
            None,
        )
        _require(source_message is not None, "generation option message was not persisted")
        selected = verifier.api(
            verifier.teacher,
            "POST",
            (
                f"teaching/threads/{verifier.thread_id}/messages/{source_message['id']}/"
                "generation-options/option-2/select"
            ),
            json_body={},
        )
        proposal = selected.get("proposal") or {}
        arguments = proposal.get("arguments") or {}
        _require(proposal.get("tool") == "candidate.generate", "selection returned wrong tool")
        _require(
            arguments.get("prompt") == options[1].get("rewrittenPrompt"),
            "selection did not preserve the trusted rewritten prompt",
        )
        _require(arguments.get("candidateCount") == 1, "selection did not start one output")
        verifier.ledger.pass_(
            "real model returns three detailed plans and selection preserves the chosen prompt"
        )
    except Exception as error:
        verifier.ledger.fail(str(error))
    finally:
        verifier.cleanup()

    print(
        f"SUMMARY passed={len(verifier.ledger.passed)} failed={len(verifier.ledger.failed)}",
        flush=True,
    )
    for failure in verifier.ledger.failed:
        print(f"  - {failure}", flush=True)
    return 1 if verifier.ledger.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

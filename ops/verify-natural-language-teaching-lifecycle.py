#!/usr/bin/env python3
"""Repeatable, retained natural-language acceptance flow for the teaching Agent.

The run deliberately uses the same conversation and authenticated HTTP
surfaces as the browser.  It creates one private course and one Agent thread,
keeps both after success, and proves four real lifecycles:

* a 14-page slide deck followed by one revision containing at least 3 changes;
* one request that creates 5 independent native CTFs, followed by one batch
  revision containing at least 3 changes;
* an interactive training demonstration followed by one revision containing
  at least 3 changes;
* a source-grounded learning-progress analysis that is not misrouted into
  content generation.

The report and browser screenshots are written under ``data/`` (gitignored).
No provider credential or administrator password is printed or persisted.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import pathlib
import re
import secrets
import sys
import time
from typing import Any
from urllib.parse import urlencode


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
FLOW_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
UI_PATH = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"

EXPECTED_CTF_TOPICS = (
    "输入验证",
    "会话权限",
    "日志取证",
    "配置错误",
    "安全编码",
)
EXPECTED_CTF_DIFFICULTIES = (1, 1, 2, 2, 3)
CTF_TOPIC_ALIASES = {
    "输入验证": ("输入验证", "输入校验", "参数验证", "参数校验", "注入"),
    "会话权限": (
        "会话权限",
        "会话管理",
        "会话固定",
        "会话劫持",
        "会话令牌",
        "固定令牌",
        "授权令牌",
        "session-permission",
        "越权",
        "授权绕过",
    ),
    "日志取证": (
        "日志取证",
        "日志分析",
        "分析日志",
        "日志审计",
        "日志记录",
        "安全取证",
        "取证",
        "log-analysis",
        "forensics",
    ),
    "配置错误": ("配置错误", "错误配置", "配置缺陷", "配置泄露", "不安全配置"),
    "安全编码": (
        "安全编码",
        "安全代码",
        "代码审计",
        "代码修复",
        "源码审计",
        "不安全的编码",
        "命令注入",
        "参数化",
        "secure-coding",
        "security-coding",
        "代码缺陷",
        "不安全反序列化",
    ),
}


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def retained_thread_url(base_url: str, thread_id: str) -> str:
    return f"{base_url.rstrip('/')}/teacher?{urlencode({'thread': thread_id})}"


flow = load_module("natural_language_flow_base", FLOW_PATH)
ui = load_module("natural_language_ui_base", UI_PATH)


def deep_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def order_ctf_draft_pairs(
    draft_pairs: list[tuple[str, dict[str, Any]]],
) -> list[tuple[str, dict[str, Any]]]:
    indexed: dict[int, tuple[str, dict[str, Any]]] = {}
    for draft_id, draft in draft_pairs:
        constraints = draft.get("constraints") or {}
        try:
            batch_index = int(constraints.get("batchIndex") or 0)
        except (TypeError, ValueError) as exc:
            raise flow.VerificationError(
                f"draft {draft_id} has an invalid batch index"
            ) from exc
        if batch_index not in range(1, len(EXPECTED_CTF_TOPICS) + 1):
            raise flow.VerificationError(
                f"draft {draft_id} has out-of-range batch index {batch_index}"
            )
        if batch_index in indexed:
            raise flow.VerificationError(
                f"CTF batch contains duplicate item index {batch_index}"
            )
        indexed[batch_index] = (draft_id, draft)
    expected_indexes = set(range(1, len(EXPECTED_CTF_TOPICS) + 1))
    if set(indexed) != expected_indexes:
        raise flow.VerificationError(
            f"CTF batch indexes are incomplete: {sorted(indexed)}"
        )
    return [indexed[index] for index in sorted(indexed)]


class NaturalLanguageLifecycle(flow.TeacherAgentVerifier):
    def __init__(
        self,
        *,
        job_timeout: int,
        authoring_timeout: int,
        browser: bool,
        output_root: pathlib.Path | None = None,
        resume_report: pathlib.Path | None = None,
        replace_ctf_batch: bool = False,
        adopt_ctf_jobs: tuple[str, ...] = (),
        adopt_ctf_revision_jobs: tuple[str, ...] = (),
    ):
        super().__init__(
            job_timeout=job_timeout,
            authoring_timeout=authoring_timeout,
            keep_data=True,
        )
        timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
        self.run_id = f"natural-language-e2e-{timestamp}-{self.suffix}"
        self.course_name = f"自然语言教学全链路测试 {timestamp}"
        self.module_name = "Web 安全综合实践"
        self.thread_title = f"全链路测试 {timestamp}"
        self.student_name = f"nl-e2e-student-{self.suffix}"
        self.student_password = secrets.token_urlsafe(24)
        self.browser_enabled = browser
        self.replace_ctf_batch = replace_ctf_batch
        self.adopt_ctf_jobs = adopt_ctf_jobs
        self.adopt_ctf_revision_jobs = adopt_ctf_revision_jobs
        self.ctf_topic_evidence: list[dict[str, Any]] = []
        self.resume_report_path = resume_report.resolve() if resume_report else None
        if self.resume_report_path is not None:
            source = json.loads(self.resume_report_path.read_text(encoding="utf-8"))
            self.run_id = str(
                source.get("runId") or self.resume_report_path.parent.name
            )
            self.output_dir = self.resume_report_path.parent
            self.prompts = list(source.get("prompts") or [])
            self.draft_ids = [str(item) for item in source.get("draftIds") or []]
            self.course = source.get("course") or None
            self.module = source.get("module") or None
            self.thread_id = str(source.get("threadId") or "") or None
            self.course_name = str((self.course or {}).get("name") or self.course_name)
            self.module_name = str((self.module or {}).get("name") or self.module_name)
            self.thread_title = f"全链路测试 {self.run_id}"
            self.student_name = str(source.get("studentName") or "")
            if not self.student_name:
                prompt_text = "\n".join(
                    str(item.get("prompt") or "") for item in self.prompts
                )
                matched_student = re.search(r"账号[‘'“\"]([^’'”\"]+)", prompt_text)
                self.student_name = (
                    matched_student.group(1)
                    if matched_student
                    else f"nl-e2e-student-{self.suffix}"
                )
            self.report = source
            self.report.update(
                {
                    "status": "RUNNING",
                    "failure": None,
                    "resumedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                }
            )
            for item in source.get("checks") or []:
                check = str(item)
                if check not in self.ledger.passed:
                    self.ledger.passed.append(check)
            return
        evidence_root = (
            output_root.resolve()
            if output_root is not None
            else REPO_DIR / "data" / "natural-language-e2e"
        )
        self.output_dir = evidence_root / self.run_id
        self.output_dir.mkdir(parents=True, exist_ok=False)
        # The verifier is commonly launched inside the deployment container,
        # while a failed run is resumed from the host.  Make only this
        # gitignored evidence directory cross-context writable so the same
        # retained run can be continued instead of creating a replacement.
        os.chmod(self.output_dir, 0o777)
        self.prompts: list[dict[str, str]] = []
        self.draft_ids: list[str] = []
        self.report: dict[str, Any] = {
            "runId": self.run_id,
            "startedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "status": "RUNNING",
            "studentName": self.student_name,
            "prompts": self.prompts,
            "checks": self.ledger.passed,
        }

    def remember_prompt(self, phase: str, prompt: str) -> None:
        entry = {"phase": phase, "prompt": prompt}
        if entry not in self.prompts:
            self.prompts.append(entry)

    def has_check(self, text: str) -> bool:
        return any(text in item for item in self.ledger.passed)

    def send(self, phase: str, prompt: str):
        self.remember_prompt(phase, prompt)
        return self.send_agent(prompt)

    def expect(self, phase: str, prompt: str, tool: str):
        self.remember_prompt(phase, prompt)
        job, proposals = self.send_agent(prompt)
        proposal = self.generation_proposal(job, proposals, tool)
        if proposal is None:
            answer = str((job.get("result") or {}).get("answer") or "")[:800]
            raise flow.VerificationError(
                f"{phase} did not propose {tool}; "
                f"tools={[item.get('tool') for item in proposals]}; answer={answer!r}"
            )
        self.ledger.pass_(f"{phase}: 自然语言正确调用 {tool}")
        return proposal

    def setup_visible_run(self) -> None:
        health = flow.require(
            flow.new_session().get(
                f"{flow.BASE_URL}/agent-runtime/api/health",
                timeout=20,
            )
        ).json()
        if health.get("success") is not True:
            raise flow.VerificationError("global Agent runtime is unhealthy")
        admin_name, admin_password = flow.admin_credentials()
        self.teacher = flow.authenticate(admin_name, admin_password)
        self.student = flow.register(self.student_name, self.student_password)
        context = self.api(self.teacher, "GET", "teaching/context")
        if not context.get("user", {}).get("isTeacher"):
            raise flow.VerificationError(
                "administrator has no teacher Agent capability"
            )
        thread = self.api(
            self.teacher,
            "POST",
            "teaching/threads",
            json_body={"title": self.thread_title},
            statuses=(201,),
        )["thread"]
        self.thread_id = thread["id"]
        self.ledger.pass_("建立网页可见且默认保留的全局智能体会话")

        create_prompt = (
            f"创建一门名为“{self.course_name}”的私有课程，并同时创建一个名为"
            f"“{self.module_name}”的内容章节；完成后把当前对话切换到这个章节。"
        )
        create = self.expect("项目建立", create_prompt, "course.create")
        arguments = create.get("arguments") or {}
        if arguments.get("name") != self.course_name:
            raise flow.VerificationError(
                "course creation changed the requested visible name"
            )
        if arguments.get("initialModuleName") != self.module_name:
            raise flow.VerificationError(
                "course creation omitted the requested initial chapter"
            )
        created = self.execute_course_tool(
            create,
            expect_denied_without_confirmation=True,
        )
        self.course = created["result"]["course"]
        self.module = created["result"].get("module")
        if not self.module:
            raise flow.VerificationError(
                "natural-language course creation returned no chapter"
            )
        self.ledger.pass_("课程项目及章节已持久化，并会保留在课程中心")

        member_prompt = (
            f"把账号“{self.student_name}”以学生身份加入刚才创建的课程，"
            "不要改变其他成员。"
        )
        add_member = self.expect("测试学员加入", member_prompt, "course.member.add")
        added = self.execute_course_tool(
            add_member,
            expect_denied_without_confirmation=True,
        )
        member = added.get("result", {}).get("member") or {}
        if (
            member.get("username") != self.student_name
            or member.get("role") != "student"
        ):
            raise flow.VerificationError(
                "test student was not added to the retained course"
            )
        self.ledger.pass_("网页课程成员中存在用于学情边界验证的测试学生")

    def restore_visible_run(self) -> None:
        """Reconnect to retained web-visible resources after fixing a failed phase."""

        can_restore_ctf_batch = bool(self.adopt_ctf_jobs or self.replace_ctf_batch)
        if (
            not self.thread_id
            or not self.course
            or not self.module
            or (len(self.draft_ids) != 5 and not can_restore_ctf_batch)
        ):
            raise flow.VerificationError(
                "resume report is missing the retained thread, course, module, or five drafts"
            )
        health = flow.require(
            flow.new_session().get(
                f"{flow.BASE_URL}/agent-runtime/api/health",
                timeout=20,
            )
        ).json()
        if health.get("success") is not True:
            raise flow.VerificationError(
                "global Agent runtime is unhealthy during resume"
            )
        admin_name, admin_password = flow.admin_credentials()
        self.teacher = flow.authenticate(admin_name, admin_password)
        thread = self.api(
            self.teacher,
            "GET",
            f"teaching/threads/{self.thread_id}",
        )["thread"]
        if thread.get("id") != self.thread_id:
            raise flow.VerificationError("retained Agent thread is no longer visible")
        self.artifacts = []
        for artifact_id in self.report.get("artifactIds") or []:
            artifact = self.api(
                self.teacher,
                "GET",
                f"teaching/artifacts/{artifact_id}",
            )["artifact"]
            self.artifacts.append(artifact)
        if not self.artifacts:
            raise flow.VerificationError("retained slide artifact is no longer visible")
        if not self.has_check("修复后重新连接同一网页会话"):
            retained_resources = "同一网页会话、课程、章节与课件"
            if len(self.draft_ids) == 5:
                retained_resources += "及五道题草稿"
            self.ledger.pass_(f"修复后重新连接{retained_resources}")

    def generate_artifact(
        self, *, phase: str, prompt: str, artifact_type: str
    ) -> dict[str, Any]:
        self.remember_prompt(phase, prompt)
        self.send_generation(
            prompt,
            artifact_type,
            "single",
            None,
            materialize=True,
            allow_materialize_model_change=True,
        )
        artifact = self.artifacts[-1]
        if artifact.get("type") != artifact_type:
            raise flow.VerificationError(
                f"{phase} materialized {artifact.get('type')!r}, expected {artifact_type!r}"
            )
        return artifact

    def latest_course_artifact(self, artifact_type: str) -> dict[str, Any] | None:
        """Resolve the same most-recent artifact as a natural-language follow-up.

        A resumed run may have successfully materialized an artifact after its
        last report write. Re-generating the phase would create a duplicate,
        while blindly using the report entry can make "修改刚才生成的" target a
        newer object. Natural-language recency is based on when an artifact was
        created in the current conversation, not on later background updates,
        so recovery deliberately follows the same rule and continues in place.
        """

        dojo_id = int((self.course or {}).get("id") or 0)
        module_index = int((self.module or {}).get("index") or 0)
        if not dojo_id:
            return None
        rows = self.api(
            self.teacher,
            "GET",
            f"teaching/artifacts?dojoId={dojo_id}",
        ).get("artifacts") or []
        candidates = [
            item
            for item in rows
            if item.get("type") == artifact_type
            and int(item.get("moduleIndex") or 0) == module_index
            and item.get("status") not in {"FAILED", "ARCHIVED"}
        ]
        summary = max(
            candidates,
            key=lambda item: str(item.get("created") or ""),
            default=None,
        )
        if not summary:
            return None
        return self.api(
            self.teacher,
            "GET",
            f"teaching/artifacts/{summary['id']}",
        )["artifact"]

    def revise_artifact(
        self,
        *,
        phase: str,
        artifact: dict[str, Any],
        prompt: str,
        required_instruction_terms: tuple[str, ...],
    ) -> dict[str, Any]:
        old_revision = int(artifact.get("currentRevision") or 0)
        old_hash = str((artifact.get("revision") or {}).get("contentHash") or "")
        proposal = self.expect(phase, prompt, "artifact.revise")
        arguments = proposal.get("arguments") or {}
        if arguments.get("artifactId") != artifact.get("id"):
            # Natural-language recency follows the current conversation's
            # creation order, whereas the course artifact list is ordered by
            # the latest background update. Accept the Agent's grounded choice
            # only when it is another editable artifact in the exact same
            # course/module/type scope; never silently cross a scope boundary.
            resolved = self.api(
                self.teacher,
                "GET",
                f"teaching/artifacts/{arguments.get('artifactId')}",
            )["artifact"]
            if (
                resolved.get("type") != artifact.get("type")
                or int(resolved.get("dojoId") or 0)
                != int((self.course or {}).get("id") or 0)
                or int(resolved.get("moduleIndex") or 0)
                != int((self.module or {}).get("index") or 0)
                or not resolved.get("canEdit")
            ):
                raise flow.VerificationError(
                    f"{phase} resolved an artifact outside the expected editable scope"
                )
            artifact = resolved
            old_revision = int(artifact.get("currentRevision") or 0)
            old_hash = str(
                (artifact.get("revision") or {}).get("contentHash") or ""
            )
        if int(arguments.get("expectedRevision") or -1) != old_revision:
            raise flow.VerificationError(f"{phase} used a stale artifact revision")
        instruction = str(arguments.get("instruction") or "")
        missing = [
            term for term in required_instruction_terms if term not in instruction
        ]
        if missing:
            raise flow.VerificationError(
                f"{phase} lost explicit modification points: {missing}; instruction={instruction!r}"
            )
        started = self.api(
            self.teacher,
            "POST",
            f"teaching/artifacts/{artifact['id']}/revise",
            json_body={
                "instruction": instruction,
                "expectedRevision": old_revision,
            },
            statuses=(202,),
        )
        self.wait_job(started["job"]["id"])
        revised = self.api(
            self.teacher,
            "GET",
            f"teaching/artifacts/{artifact['id']}",
        )["artifact"]
        if int(revised.get("currentRevision") or 0) != old_revision + 1:
            raise flow.VerificationError(
                f"{phase} did not create exactly one new revision"
            )
        if str((revised.get("revision") or {}).get("contentHash") or "") == old_hash:
            raise flow.VerificationError(f"{phase} produced an unchanged revision")
        if any(
            term not in str((revised.get("revision") or {}).get("instruction") or "")
            for term in required_instruction_terms
        ):
            raise flow.VerificationError(
                f"{phase} did not persist all modification points"
            )
        self.ledger.pass_(f"{phase}: 不少于三点的修改已形成新版本并改变真实内容")
        return revised

    def slide_flow(self) -> None:
        slide_prompt = (
            f"为课程“{self.course_name}”的章节“{self.module_name}”生成一份恰好 14 页、"
            "可直接授课的 Web 安全纵深防御课件。必须覆盖威胁建模、输入验证、参数化查询、"
            "最小权限、日志检测和修复验证，包含案例、关系图、两次理解检查、迁移任务与教师讲稿；"
            "生成平台内可预览的页面式课件，不要改成普通下载文件。"
        )
        slide = self.generate_artifact(
            phase="课件生成",
            prompt=slide_prompt,
            artifact_type="slide-deck",
        )
        pages = (
            ((slide.get("revision") or {}).get("content") or {})
            .get("lesson", {})
            .get("artifacts", [])
        )
        if len(pages) != 14:
            raise flow.VerificationError(
                f"explicit 14-page deck produced {len(pages)} pages"
            )
        self.verify_slide_speaker_scripts(pages, label="课件初始版本")
        self.ledger.pass_("课件严格遵从教师指定的 14 页并可在网页预览")
        revise_prompt = (
            "修改刚才生成的 14 页课件，同时完成以下四点，并保持总页数为 14 页："
            "1. 加入 SQL 注入攻击链与防御链的同页对照；"
            "2. 加入参数化查询的可运行代码示例；"
            "3. 加入一张日志证据到处置动作的关系图；"
            "4. 在结尾加入三道带答案的形成性检查题。"
        )
        revised = self.revise_artifact(
            phase="课件后续修改",
            artifact=slide,
            prompt=revise_prompt,
            required_instruction_terms=(
                "攻击链",
                "参数化查询",
                "日志证据",
                "形成性检查",
            ),
        )
        revised_pages = (
            ((revised.get("revision") or {}).get("content") or {})
            .get("lesson", {})
            .get("artifacts", [])
        )
        if len(revised_pages) != 14:
            raise flow.VerificationError(
                "slide revision did not preserve the explicit 14-page limit"
            )
        self.verify_slide_speaker_scripts(revised_pages, label="课件修订版本")
        self.artifacts[-1] = revised

    def verify_slide_speaker_scripts(
        self, pages: list[dict[str, Any]], *, label: str
    ) -> None:
        missing = []
        for index, page in enumerate(pages, 1):
            content = page.get("content") or {}
            notes = str(content.get("speakerNotes") or content.get("remark") or "")
            if len(re.sub(r"\s+", "", notes)) < 60:
                missing.append(index)
        if missing:
            raise flow.VerificationError(
                f"{label} pages missing complete speaker scripts: {missing}"
            )
        self.ledger.pass_(f"{label}每一页均包含可直接讲授的同步讲稿")

    def active_batch_retry_for_authoring_job(
        self, current: dict[str, Any]
    ) -> dict[str, Any] | None:
        if not str(current.get("error") or "").startswith(
            "Transient authoring model failure:"
        ):
            return None
        batch_reference = current.get("batch") or {}
        batch_id = str(batch_reference.get("id") or "")
        item_index = int(batch_reference.get("index") or 0)
        if not batch_id or item_index <= 0:
            return None
        batch = self.api(
            self.teacher,
            "GET",
            f"teaching/generation-batches/{batch_id}",
        )["batch"]
        item = next(
            (
                candidate
                for candidate in batch.get("items") or []
                if int(candidate.get("itemIndex") or 0) == item_index
            ),
            None,
        )
        if item is None or str(item.get("authoringJobId") or "") != str(
            current.get("id") or ""
        ):
            return None
        if str(item.get("status") or "").lower() not in {
            "queued",
            "generating",
            "validating",
        }:
            return None
        return item

    def wait_authoring_batch(
        self, job_ids: list[str], *, label: str
    ) -> list[dict[str, Any]]:
        if not job_ids:
            raise flow.VerificationError(f"{label} started no authoring jobs")
        deadline = time.monotonic() + self.authoring_timeout
        last_states: dict[str, tuple[str, str, int]] = {}
        results: dict[str, dict[str, Any]] = {}
        observed_automatic_retries: set[str] = set()
        while time.monotonic() < deadline:
            terminal_failures: list[
                tuple[str, dict[str, Any], tuple[str, str, int]]
            ] = []
            for job_id in job_ids:
                if job_id in results:
                    continue
                current = self.top_level_api(
                    self.teacher,
                    "GET",
                    f"learning/authoring/jobs/{job_id}",
                )["job"]
                state = (
                    str(current.get("status") or ""),
                    str(current.get("stage") or ""),
                    int(current.get("progress") or 0),
                )
                if last_states.get(job_id) != state:
                    print(
                        f"PROGRESS {label} {job_id}: {state[0]} {state[1]} {state[2]}%",
                        flush=True,
                    )
                    last_states[job_id] = state
                if state[0] in flow.AUTHORING_TERMINAL_STATES:
                    if state[0] != "COMPLETED":
                        retry_item = self.active_batch_retry_for_authoring_job(current)
                        if retry_item is not None:
                            if job_id not in observed_automatic_retries:
                                print(
                                    f"RETRY {label} {job_id}: 原位自动重试，"
                                    f"task={retry_item.get('taskId')}",
                                    flush=True,
                                )
                                observed_automatic_retries.add(job_id)
                                self.ledger.pass_(
                                    "模型暂态失败保留同一批次、任务与草稿，并只将失败题目原位重新排队"
                                )
                            continue
                        terminal_failures.append((job_id, current, state))
                    else:
                        results[job_id] = current
            if terminal_failures:
                job_id, current, state = terminal_failures[0]
                raise flow.VerificationError(
                    f"{label} job {job_id} failed: {current.get('error') or state[1]}"
                )
            if len(results) == len(job_ids):
                return [results[job_id] for job_id in job_ids]
            time.sleep(2)
        raise flow.VerificationError(
            f"{label} did not finish within {self.authoring_timeout}s; states={last_states}"
        )

    def adopt_retained_ctf_jobs(self) -> None:
        if len(self.adopt_ctf_jobs) != 5 or len(set(self.adopt_ctf_jobs)) != 5:
            raise flow.VerificationError(
                "adopting a retained CTF batch requires exactly five independent job IDs"
            )
        jobs = self.wait_authoring_batch(
            list(self.adopt_ctf_jobs),
            label="五道题生成（断点接管）",
        )
        draft_ids = [str(job.get("draftId") or "") for job in jobs]
        if any(not draft_id for draft_id in draft_ids) or len(set(draft_ids)) != 5:
            raise flow.VerificationError(
                "the retained authoring jobs do not expose five independent drafts"
            )
        self.draft_ids = draft_ids
        self.report["adoptedCtfJobs"] = list(self.adopt_ctf_jobs)
        self.report["adoptedCtfBatchAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        self.ledger.pass_(
            "修复后接管同一会话中已生成的五道题草稿，未重复生成已完成内容"
        )

    def adopt_retained_ctf_revision_jobs(self) -> None:
        job_ids = self.adopt_ctf_revision_jobs
        if len(job_ids) != 5 or len(set(job_ids)) != 5:
            raise flow.VerificationError(
                "adopting a retained CTF revision batch requires exactly five independent job IDs"
            )
        jobs = [
            self.top_level_api(
                self.teacher,
                "GET",
                f"learning/authoring/jobs/{job_id}",
            )["job"]
            for job_id in job_ids
        ]
        if any(str(job.get("kind") or "") != "REVISE" for job in jobs):
            raise flow.VerificationError(
                "the retained CTF revision batch contains a non-revision job"
            )
        revision_draft_ids = [str(job.get("draftId") or "") for job in jobs]
        if (
            any(not draft_id for draft_id in revision_draft_ids)
            or len(set(revision_draft_ids)) != 5
            or set(revision_draft_ids) != set(self.draft_ids)
        ):
            raise flow.VerificationError(
                "the retained CTF revision jobs are not bound one-to-one to the five drafts"
            )
        self.wait_authoring_batch(list(job_ids), label="五道题后续修改（断点接管）")
        for draft_id in self.draft_ids:
            draft = self.top_level_api(
                self.teacher,
                "GET",
                f"learning/drafts/{draft_id}",
            )["draft"]
            if int(draft.get("revision") or 0) < 2:
                raise flow.VerificationError(
                    f"retained CTF revision did not advance draft {draft_id}"
                )
            if (draft.get("validation") or {}).get("status") != "PASS":
                raise flow.VerificationError(
                    f"retained revised draft {draft_id} did not pass validation"
                )
            teacher_messages = [
                str(item.get("content") or "")
                for item in draft.get("conversation") or []
                if item.get("role") == "teacher"
            ]
            latest_instruction = teacher_messages[-1] if teacher_messages else ""
            for term in ("三级提示", "动态 Flag", "环境重置", "防御修复"):
                if term not in latest_instruction:
                    raise flow.VerificationError(
                        f"retained CTF revision for {draft_id} lost modification point {term}"
                    )
        self.verify_ctf_drafts()
        self.report["adoptedCtfRevisionJobs"] = list(job_ids)
        self.report["adoptedCtfRevisionBatchAt"] = dt.datetime.now(
            dt.timezone.utc
        ).isoformat()
        self.ledger.pass_("教师指定的 5 个 CTF 主题已逐题绑定并落实到实际题目内容")
        self.ledger.pass_("同一条四点修改命令已作用于 5 道题并分别复验通过")

    def ctf_flow(self) -> None:
        prompt = (
            f"在课程“{self.course_name}”的章节“{self.module_name}”中，一次生成 5 道彼此独立的"
            " CTF 实践题。五道题分别围绕输入验证、会话权限、日志取证、配置错误和安全编码，"
            "难度为 2 道基础、2 道中等、1 道提高；每道题都必须有独立隔离环境、独立解题路径、"
            "分级提示和独立动态 Flag，学生只能通过提交 Flag 完成，不能提交 JSON 或文字结论。"
        )
        proposal = self.expect("五道题生成", prompt, "challenge.generate")
        arguments = proposal.get("arguments") or {}
        if int(arguments.get("challengeCount") or 0) != 5:
            raise flow.VerificationError(
                f"five-CTF request crossed the plan boundary as {arguments.get('challengeCount')!r}"
            )
        proposed_topics = (
            (arguments.get("constraints") or {}).get("batchTopics")
            if isinstance(arguments.get("constraints"), dict)
            else None
        )
        if proposed_topics != list(EXPECTED_CTF_TOPICS):
            raise flow.VerificationError(
                "five-CTF request lost its ordered topic allocation at the option boundary: "
                f"{proposed_topics!r}"
            )
        generated = self.execute_course_tool(proposal)
        generated_topics = generated.get("result", {}).get("batchTopics")
        if generated_topics != list(EXPECTED_CTF_TOPICS):
            raise flow.VerificationError(
                f"CTF queue did not bind the five requested topics: {generated_topics!r}"
            )
        authoring_jobs = generated.get("result", {}).get("authoringJobs") or []
        if len(authoring_jobs) != 5:
            raise flow.VerificationError(
                f"one natural-language request started {len(authoring_jobs)} CTF jobs, expected 5"
            )
        if len({item.get("id") for item in authoring_jobs}) != 5:
            raise flow.VerificationError("batch CTF generation reused an authoring job")
        completed = self.wait_authoring_batch(
            [str(item["id"]) for item in authoring_jobs],
            label="五道题生成",
        )
        self.draft_ids = [str(item.get("draftId") or "") for item in completed]
        if len(set(self.draft_ids)) != 5 or any(
            not draft_id for draft_id in self.draft_ids
        ):
            raise flow.VerificationError(
                "five authoring jobs did not produce five independent drafts"
            )
        before = self.verify_ctf_drafts()
        self.ledger.pass_(
            "一条自然语言命令生成 5 个独立、验证通过且未误转为仿真的 CTF 草稿"
        )
        self.ledger.pass_("教师指定的 5 个 CTF 主题已逐题绑定并落实到实际题目内容")
        self.revise_ctf_batch(before)

    def verify_ctf_drafts(self, *, require_validated: bool = True) -> dict[str, int]:
        if len(set(self.draft_ids)) != 5 or any(
            not draft_id for draft_id in self.draft_ids
        ):
            raise flow.VerificationError(
                "expected five independent retained CTF drafts"
            )
        before: dict[str, int] = {}
        topic_evidence = []
        draft_pairs = [
            (
                draft_id,
                self.top_level_api(
                    self.teacher,
                    "GET",
                    f"learning/drafts/{draft_id}",
                )["draft"],
            )
            for draft_id in self.draft_ids
        ]
        ordered_pairs = order_ctf_draft_pairs(draft_pairs)
        self.draft_ids = [draft_id for draft_id, _draft in ordered_pairs]
        for index, (draft_id, draft) in enumerate(ordered_pairs):
            if (
                require_validated
                and (draft.get("validation") or {}).get("status") != "PASS"
            ):
                raise flow.VerificationError(
                    f"draft {draft_id} did not pass validation"
                )
            spec = draft.get("spec") or {}
            if spec.get("exerciseMode") != "CONTAINER":
                raise flow.VerificationError(
                    f"ordinary isolated CTF {draft_id} was misrouted to "
                    f"{spec.get('exerciseMode')!r} instead of CONTAINER"
                )
            if spec.get("simulation") not in (None, {}):
                raise flow.VerificationError(
                    f"container CTF {draft_id} retained an unrelated simulation"
                )
            expected_topic = EXPECTED_CTF_TOPICS[index]
            expected_difficulty = EXPECTED_CTF_DIFFICULTIES[index]
            assigned_topic = str(
                (draft.get("constraints") or {}).get("batchTopic") or ""
            ).strip()
            if assigned_topic != expected_topic:
                raise flow.VerificationError(
                    f"draft {draft_id} item {index + 1} is bound to "
                    f"{assigned_topic!r}, expected {expected_topic!r}"
                )
            if int(spec.get("difficulty") or 0) != expected_difficulty:
                raise flow.VerificationError(
                    f"draft {draft_id} lost the teacher's difficulty allocation for "
                    f"{expected_topic!r}: expected {expected_difficulty}, "
                    f"received {spec.get('difficulty')!r}"
                )
            aliases = CTF_TOPIC_ALIASES[expected_topic]
            title = str(spec.get("name") or "").strip()
            body = deep_text(
                {
                    "description": spec.get("description"),
                    "objectives": spec.get("objectives"),
                    "tags": spec.get("tags"),
                    "implementation": spec.get("implementation"),
                    "oracleContract": spec.get("oracleContract"),
                }
            )
            title_matches = [alias for alias in aliases if alias in title]
            body_matches = [alias for alias in aliases if alias in body]
            if not title_matches or not body_matches:
                raise flow.VerificationError(
                    f"draft {draft_id} did not implement its assigned topic {expected_topic!r} "
                    f"in both title and substantive content; title={title!r}"
                )
            topic_evidence.append(
                {
                    "draftId": draft_id,
                    "assignedTopic": expected_topic,
                    "assignedDifficulty": expected_difficulty,
                    "title": title,
                    "titleMatches": title_matches,
                    "contentMatches": body_matches,
                }
            )
            before[draft_id] = int(draft.get("revision") or 0)
        self.ctf_topic_evidence = topic_evidence
        return before

    def revise_ctf_batch(self, before: dict[str, int]) -> None:
        revision_prompt = (
            "统一修改刚才一次生成的 5 道 CTF 实践题，并逐题完成以下四点："
            "1. 增加由弱到强的三级提示；"
            "2. 明确动态 Flag 的获取与平台提交成功条件；"
            "3. 增加环境重置方法和资源限制说明；"
            "4. 增加利用完成后的防御修复反思题。"
            "五道题都要保留独立环境和独立 Flag，并分别重新执行可用性验证。"
        )
        revise = self.expect("五道题后续修改", revision_prompt, "challenge.revise")
        revise_arguments = revise.get("arguments") or {}
        revised_ids = [str(item) for item in revise_arguments.get("draftIds") or []]
        if set(revised_ids) != set(self.draft_ids) or len(revised_ids) != 5:
            raise flow.VerificationError(
                f"batch revision resolved drafts {revised_ids}, expected {self.draft_ids}"
            )
        instruction = str(revise_arguments.get("instruction") or "")
        for term in ("三级提示", "动态 Flag", "环境重置", "防御修复"):
            if term not in instruction:
                raise flow.VerificationError(
                    f"batch revision lost modification point {term}"
                )
        revised = self.execute_course_tool(revise)
        revision_jobs = revised.get("result", {}).get("authoringJobs") or []
        if len(revision_jobs) != 5:
            raise flow.VerificationError(
                "batch CTF revision did not start five revision jobs"
            )
        self.wait_authoring_batch(
            [str(item["id"]) for item in revision_jobs],
            label="五道题后续修改",
        )
        for draft_id in self.draft_ids:
            draft = self.top_level_api(
                self.teacher,
                "GET",
                f"learning/drafts/{draft_id}",
            )["draft"]
            if int(draft.get("revision") or 0) != before[draft_id] + 1:
                raise flow.VerificationError(
                    f"draft {draft_id} did not advance one revision"
                )
            if (draft.get("validation") or {}).get("status") != "PASS":
                raise flow.VerificationError(
                    f"revised draft {draft_id} did not pass validation"
                )
            teacher_messages = [
                str(item.get("content") or "")
                for item in draft.get("conversation") or []
                if item.get("role") == "teacher"
            ]
            if not teacher_messages or instruction not in teacher_messages[-1]:
                raise flow.VerificationError(
                    f"draft {draft_id} lost the batch revision instruction"
                )
        self.verify_ctf_drafts()
        self.ledger.pass_("教师指定的 5 个 CTF 主题已逐题绑定并落实到实际题目内容")
        self.ledger.pass_("同一条四点修改命令已作用于 5 道题并分别复验通过")

    def verify_simulation_artifacts(
        self,
        artifacts: list[dict[str, Any]],
        *,
        label: str,
    ) -> list[dict[str, Any]]:
        if not artifacts or any(
            item.get("type") != "simulation"
            or not str((item.get("content") or {}).get("html") or "").strip()
            for item in artifacts
        ):
            raise flow.VerificationError(f"{label} is not executable")
        configs: list[dict[str, Any]] = []
        for index, item in enumerate(artifacts, 1):
            html = str((item.get("content") or {}).get("html") or "")
            required_runtime_markers = (
                'id="reset"',
                'id="controls"',
                'id="evidence"',
                'id="events"',
                'type="range"',
                'type="checkbox"',
                "function record(",
                "function reset(",
                "type:'aisecedu:simulation'",
                "SET_WIDGET_STATE",
            )
            missing = [
                marker for marker in required_runtime_markers if marker not in html
            ]
            if missing:
                raise flow.VerificationError(
                    f"{label} {index} is missing stateful runtime capabilities: {missing}"
                )
            config_match = re.search(
                r'<script type="application/json" id="widget-config">(.*?)</script>',
                html,
                flags=re.DOTALL,
            )
            if not config_match:
                raise flow.VerificationError(
                    f"{label} {index} has no inspectable state model"
                )
            config = json.loads(config_match.group(1))
            configs.append(config)
            scenes = config.get("scenes") or []
            scene_ids = [str(scene.get("id") or "") for scene in scenes]
            if not 5 <= len(scenes) <= 8 or len(set(scene_ids)) != len(scene_ids):
                raise flow.VerificationError(
                    f"{label} {index} must expose 5–8 independent, uniquely identified states"
                )
            controls = config.get("controls") or []
            control_types = {str(control.get("type") or "") for control in controls}
            if not 2 <= len(controls) <= 4 or not {"range", "toggle"}.issubset(
                control_types
            ):
                raise flow.VerificationError(
                    f"{label} {index} must expose numeric and Boolean controls"
                )
            channels = config.get("evidenceChannels") or []
            channel_ids = {str(channel.get("id") or "") for channel in channels}
            if not 3 <= len(channel_ids) <= 5:
                raise flow.VerificationError(
                    f"{label} {index} must expose 3–5 evidence channels"
                )
            if not str(config.get("comparisonSummary") or "").strip():
                raise flow.VerificationError(
                    f"{label} {index} has no comparison summary"
                )
            if not str(config.get("debrief") or "").strip():
                raise flow.VerificationError(f"{label} {index} has no debrief")
            if any(
                not str(scene.get("expectedObservation") or "").strip()
                or not str(scene.get("facilitatorCue") or "").strip()
                or not channel_ids.issubset(set((scene.get("evidence") or {}).keys()))
                for scene in scenes
            ):
                raise flow.VerificationError(
                    f"{label} {index} is missing observable evidence or facilitator cues"
                )
            known_ids = set(scene_ids)
            broken_targets = [
                str(choice.get("goto") or "")
                for scene in scenes
                for choice in scene.get("choices") or []
                if str(choice.get("goto") or "") not in known_ids
            ]
            if broken_targets:
                raise flow.VerificationError(
                    f"{label} {index} contains broken state transitions: {broken_targets}"
                )
        return configs

    def simulation_flow(self) -> None:
        if self.has_check("实训演示已生成含状态模型"):
            simulation = self.latest_course_artifact("simulation")
            if simulation is None:
                raise flow.VerificationError(
                    "retained simulation was recorded as generated but is no longer available"
                )
            self.artifacts = [
                artifact
                for artifact in self.artifacts
                if artifact.get("id") != simulation.get("id")
            ]
            self.artifacts.append(simulation)
            self.ledger.pass_("恢复后复用同一课程中的已有实训演示，未重复生成")
        else:
            prompt = (
                f"为课程“{self.course_name}”的章节“{self.module_name}”生成一个平台内可操作的"
                " SQL 注入攻防实训演示，不是答题。演示应允许教师改变攻击载荷和防御状态，"
                "实时展示请求、查询、日志与结果的变化，包含明确的演示步骤、成功条件、重置和复盘。"
            )
            simulation = self.generate_artifact(
                phase="实训演示生成",
                prompt=prompt,
                artifact_type="simulation",
            )
        artifacts = (
            ((simulation.get("revision") or {}).get("content") or {})
            .get("lesson", {})
            .get("artifacts", [])
        )
        self.verify_simulation_artifacts(artifacts, label="simulation")
        if not self.has_check("实训演示已生成含状态模型"):
            self.ledger.pass_(
                "实训演示已生成含状态模型、可观察反馈、运行记录、重置、教师引导与复盘的网页交互内容"
            )
        revise_prompt = (
            "修改刚才生成的实训演示，同时完成以下四点："
            "1. 增加攻击强度滑块；"
            "2. 增加参数化查询防御开关；"
            "3. 增加实时证据面板，同步显示请求、查询和日志；"
            "4. 增加一键重置和攻防对比总结。"
        )
        revised = self.revise_artifact(
            phase="实训演示后续修改",
            artifact=simulation,
            prompt=revise_prompt,
            required_instruction_terms=("攻击强度", "防御开关", "实时证据", "一键重置"),
        )
        revised_artifacts = (
            ((revised.get("revision") or {}).get("content") or {})
            .get("lesson", {})
            .get("artifacts", [])
        )
        revised_configs = self.verify_simulation_artifacts(
            revised_artifacts,
            label="revised simulation",
        )
        forbidden_public_copy = (
            "教师修改要求",
            "必须逐项落实",
            "当前模拟配置",
            "交付要求",
            '"scenario":',
        )
        leaked = [
            marker
            for marker in forbidden_public_copy
            if any(
                marker
                in str((item.get("content") or {}).get("html") or "")
                for item in revised_artifacts
            )
        ]
        if leaked:
            raise flow.VerificationError(
                f"revised simulation leaked planning metadata into visible copy: {leaked}"
            )
        revised_text = deep_text(revised_configs)
        for description, aliases in {
            "攻击强度滑杆": ("攻击强度", "载荷强度", "攻击载荷"),
            "参数化查询开关": ("参数化查询", "防御开关", "查询防护"),
            "请求证据": ("请求",),
            "查询证据": ("查询", "SQL"),
            "日志证据": ("日志",),
            "攻防对比总结": ("攻防", "对比", "防护前后"),
        }.items():
            if not any(alias in revised_text for alias in aliases):
                raise flow.VerificationError(
                    f"revised simulation did not implement {description}"
                )
        self.ledger.pass_("演示修订真实重建交互 HTML 并落实滑杆、开关、证据与对照")
        self.ledger.pass_("模拟演示可见文案不包含内部修订指令或嵌入配置")
        self.artifacts = [
            artifact
            for artifact in self.artifacts
            if artifact.get("id") != revised.get("id")
        ]
        self.artifacts.append(revised)

    def analytics_flow(self) -> None:
        prompt = (
            f"生成课程“{self.course_name}”当前的学情分析。只使用平台中真实可见的课程成员、"
            "任务和学习证据，至少给出样本范围、完成状态、主要风险、分层教学建议和下一步"
            "数据采集动作；如果测试学生还没有学习记录，要明确说明证据不足及不能下的结论。"
            "直接返回分析，不要把它归类为课件、题目或演示生成。"
        )
        job, proposals = self.send("学情分析", prompt)
        result = job.get("result") or {}
        if result.get("generationOptions"):
            raise flow.VerificationError(
                "learning analytics was misrouted into generation options"
            )
        forbidden = {
            "candidate.generate",
            "challenge.generate",
            "assignment.generate",
        }
        routed = [
            item.get("tool") for item in proposals if item.get("tool") in forbidden
        ]
        if routed:
            raise flow.VerificationError(
                f"learning analytics was misrouted into {routed}"
            )
        answer = str(result.get("answer") or "").strip()
        if len(answer) < 180:
            raise flow.VerificationError(
                f"learning analytics is too shallow: {answer!r}"
            )
        if self.student_name not in answer and not any(
            marker in answer
            for marker in ("1 名学生", "一名学生", "暂无学习记录", "证据不足")
        ):
            raise flow.VerificationError(
                "learning analytics omitted its real sample boundary"
            )
        if not any(marker in answer for marker in ("证据不足", "暂无", "不能", "尚未")):
            raise flow.VerificationError(
                "learning analytics invented conclusions from empty evidence"
            )
        self.report["learningAnalytics"] = answer
        self.ledger.pass_("学情分析基于真实课程事实并诚实说明空样本边界")

    def capture_retained_evidence(self) -> None:
        """Persist compact, non-secret evidence for every retained output."""

        assert self.teacher is not None
        artifact_evidence = []
        for artifact in self.artifacts:
            revision = artifact.get("revision") or {}
            lesson = (revision.get("content") or {}).get("lesson") or {}
            outputs = lesson.get("artifacts") or []
            artifact_evidence.append(
                {
                    "id": artifact.get("id"),
                    "type": artifact.get("type"),
                    "title": artifact.get("title"),
                    "revision": artifact.get("currentRevision"),
                    "outputCount": len(outputs),
                    "previewUrl": (
                        f"{flow.BASE_URL}/teacher/artifacts/{artifact.get('id')}"
                    ),
                }
            )
        draft_evidence = []
        for draft_id in self.draft_ids:
            draft = self.top_level_api(
                self.teacher,
                "GET",
                f"learning/drafts/{draft_id}",
            )["draft"]
            spec = draft.get("spec") or {}
            draft_evidence.append(
                {
                    "id": draft_id,
                    "title": spec.get("name") or str(draft.get("brief") or "")[:160],
                    "revision": draft.get("revision"),
                    "status": draft.get("status"),
                    "validation": (draft.get("validation") or {}).get("status"),
                    "exerciseMode": spec.get("exerciseMode"),
                }
            )
        self.report["artifactEvidence"] = artifact_evidence
        self.report["ctfEvidence"] = {
            "count": len(draft_evidence),
            "allValidated": all(
                item["validation"] == "PASS" for item in draft_evidence
            ),
            "drafts": draft_evidence,
            "topicCoverage": self.ctf_topic_evidence,
        }

    def verify_browser_visibility(self) -> None:
        if not self.browser_enabled:
            return
        assert self.teacher is not None and self.course is not None
        driver = ui.ChromeDriver(port=9527)
        try:
            driver.navigate(flow.BASE_URL)
            for cookie in self.teacher.cookies:
                driver.add_cookie(cookie.name, cookie.value)
            driver.navigate(retained_thread_url(flow.BASE_URL, self.thread_id))
            driver.wait_for(
                "return document.getElementById('teaching-thread-title')?.textContent?.includes('全链路测试') || false;",
                timeout=90,
                label="retained Agent thread",
            )
            driver.wait_for(
                "return document.body.innerText.includes('学情分析') || document.body.innerText.includes('证据不足');",
                timeout=90,
                label="learning analytics conversation result",
            )
            opened = driver.execute(
                "const button=document.getElementById('teaching-drawer-open');"
                "if(!button)return false;button.click();return true;"
            )
            if not opened:
                raise flow.VerificationError("task drawer button is missing")
            task_count = driver.wait_for(
                "const drawer=document.getElementById('teaching-drawer');"
                "if(!drawer||drawer.getAttribute('aria-hidden')==='true')return 0;"
                "return drawer.querySelectorAll('[data-task-job]').length;",
                timeout=60,
                label="retained task list",
            )
            if int(task_count) < 10:
                raise flow.VerificationError(
                    f"web task list contains only {task_count} entries; expected the retained lifecycle jobs"
                )
            progress_count = driver.execute(
                "return document.querySelectorAll('#teaching-drawer [role=progressbar]').length;"
            )
            if int(progress_count or 0) < int(task_count):
                raise flow.VerificationError("task list omitted compact progress bars")
            conversation_shot = self.output_dir / "conversation-and-tasks.png"
            driver.screenshot(conversation_shot)

            reference_id = str(self.course.get("referenceId") or "")
            driver.navigate(
                f"{flow.BASE_URL}/teacher/courses?dojo={reference_id}&tab=overview"
            )
            driver.wait_for(
                f"return document.body.innerText.includes({json.dumps(self.course_name)}) && "
                f"document.body.innerText.includes({json.dumps(self.module_name)});",
                timeout=90,
                label="retained course and chapter",
            )
            course_shot = self.output_dir / "course-project.png"
            driver.screenshot(course_shot)
            artifact_shots = []
            for artifact in self.artifacts:
                artifact_id = str(artifact.get("id") or "")
                artifact_type = str(artifact.get("type") or "artifact")
                driver.navigate(f"{flow.BASE_URL}/teacher/artifacts/{artifact_id}")
                driver.wait_for(
                    "const root=document.getElementById('teaching-artifact');"
                    f"if(root?.dataset.artifactId!=={json.dumps(artifact_id)})return false;"
                    "const frame=document.getElementById('artifact-preview');"
                    "return Boolean(frame && !frame.hidden && (frame.src || frame.srcdoc));",
                    timeout=90,
                    label=f"{artifact_type} preview",
                )
                if artifact_type == "slide-deck":
                    first_notes = driver.wait_for(
                        "const frame=document.getElementById('artifact-preview');"
                        "const doc=frame?.contentDocument;"
                        "const panel=doc?.querySelector('[data-aisecedu-speaker-notes=visible]');"
                        "const text=doc?.querySelector('[data-aisecedu-speaker-notes-text]')?.textContent?.trim()||'';"
                        "return panel && text.replace(/\\s+/g,'').length>=60 ? text : '';",
                        timeout=90,
                        label="visible first-page speaker script",
                    )
                    advanced = driver.execute(
                        "const frame=document.getElementById('artifact-preview');"
                        "const button=frame?.contentDocument?.querySelector('button[aria-label=\"下一个场景\"]');"
                        "if(!button||button.disabled)return false;button.click();return true;"
                    )
                    if not advanced:
                        raise flow.VerificationError(
                            "slide preview has no working next-page control for speaker-script sync"
                        )
                    second_notes = driver.wait_for(
                        "const frame=document.getElementById('artifact-preview');"
                        "const doc=frame?.contentDocument;"
                        "const panel=doc?.querySelector('[data-aisecedu-speaker-notes=visible]');"
                        "const text=doc?.querySelector('[data-aisecedu-speaker-notes-text]')?.textContent?.trim()||'';"
                        f"return panel?.getAttribute('aria-label')==='第 2 页讲稿' && text.replace(/\\s+/g,'').length>=60 && text!=={json.dumps(first_notes)} ? text : '';",
                        timeout=30,
                        label="second-page synchronized speaker script",
                    )
                    if second_notes == first_notes:
                        raise flow.VerificationError(
                            "slide preview did not update the speaker script after page navigation"
                        )
                    self.ledger.pass_(
                        "课件展示页默认显示逐页讲稿，并随上一页、下一页与场景导航同步切换"
                    )
                shot = self.output_dir / f"artifact-{artifact_type}.png"
                driver.screenshot(shot)
                artifact_shots.append(shot)
            browser_logs = driver.browser_logs()
            # Chromium probes the conventional root `/events` endpoint while
            # visiting CTFd pages.  The deployment intentionally rejects that
            # unauthenticated, non-product probe with 403; it is unrelated to
            # the authenticated teaching APIs and is already treated the same
            # way by the manual-course browser verifier.  Keep every other
            # SEVERE console entry fatal.
            ignored_event_probes = [
                entry
                for entry in browser_logs
                if str(entry.get("level") or "").upper() == "SEVERE"
                and re.search(
                    rf"{re.escape(flow.BASE_URL)}/events\b.*\b403\b",
                    str(entry.get("message") or ""),
                )
            ]
            ignored_event_probes.extend(
                entry
                for entry in browser_logs
                if str(entry.get("level") or "").upper() == "SEVERE"
                and "/events - Failed to load resource:"
                in str(entry.get("message") or "")
                and "status of 403" in str(entry.get("message") or "")
                and entry not in ignored_event_probes
            )
            severe = [
                entry
                for entry in browser_logs
                if str(entry.get("level") or "").upper() == "SEVERE"
                and entry not in ignored_event_probes
            ]
            if severe:
                raise flow.VerificationError(
                    f"browser emitted severe errors: {[item.get('message') for item in severe[-5:]]}"
                )
            if ignored_event_probes:
                self.report["ignoredBrowserProbes"] = [
                    str(item.get("message") or "") for item in ignored_event_probes
                ]
            self.report["screenshots"] = [
                str(conversation_shot),
                str(course_shot),
                *[str(path) for path in artifact_shots],
            ]
            self.ledger.pass_(
                "真实浏览器可见保留会话、任务进度、课程项目、章节、课件与实训演示"
            )
        finally:
            driver.close()

    def persist_report(self, *, error: Exception | None = None) -> None:
        self.ledger.passed[:] = list(dict.fromkeys(self.ledger.passed))
        artifact_ids = [
            str(item.get("id")) for item in self.artifacts if item.get("id")
        ]
        if not artifact_ids:
            artifact_ids = [
                str(item) for item in self.report.get("artifactIds") or [] if item
            ]
        self.report.update(
            {
                "status": "FAILED" if error else "PASSED",
                "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "course": self.course,
                "module": self.module,
                "studentName": self.student_name,
                "threadId": self.thread_id,
                "draftIds": self.draft_ids,
                "artifactIds": artifact_ids,
                "prompts": list(self.prompts),
                "checks": list(self.ledger.passed),
                "failure": str(error) if error else None,
                "web": {
                    "conversation": f"{flow.BASE_URL}/teacher",
                    "course": (
                        f"{flow.BASE_URL}/teacher/courses?dojo="
                        f"{(self.course or {}).get('referenceId', '')}&tab=overview"
                    ),
                    "artifacts": [
                        f"{flow.BASE_URL}/teacher/artifacts/{artifact_id}"
                        for artifact_id in artifact_ids
                    ],
                },
            }
        )
        json_path = self.output_dir / "report.json"
        json_path.write_text(
            json.dumps(self.report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.make_shared_writable(json_path)
        lines = [
            f"# {self.run_id}",
            "",
            f"- 状态：{self.report['status']}",
            f"- 课程：{self.course_name}",
            f"- 会话 ID：{self.thread_id}",
            f"- 对话：{self.report['web']['conversation']}",
            f"- 课程：{self.report['web']['course']}",
            "",
            "## 验收项",
            "",
            *[f"- {item}" for item in self.ledger.passed],
            "",
            "## 自然语言脚本",
            "",
            *[
                f"{index}. **{item['phase']}**：{item['prompt']}"
                for index, item in enumerate(self.prompts, 1)
            ],
        ]
        if error:
            lines.extend(["", "## 失败", "", str(error)])
        markdown_path = self.output_dir / "report.md"
        markdown_path.write_text(
            "\n".join(lines) + "\n",
            encoding="utf-8",
        )
        self.make_shared_writable(markdown_path)

    @staticmethod
    def make_shared_writable(path: pathlib.Path) -> None:
        """Keep evidence resumable across host/container users.

        A resumed process can legitimately write an existing world-writable
        report without owning it.  In that case chmod is forbidden even though
        the required access is already present, so only change the mode when
        the shared write bits are missing.
        """

        if path.stat().st_mode & 0o666 == 0o666:
            return
        try:
            os.chmod(path, 0o666)
        except PermissionError:
            if not os.access(path, os.W_OK):
                raise

    def run_visible_lifecycle(self) -> int:
        error: Exception | None = None
        try:
            if self.resume_report_path is not None:
                self.restore_visible_run()
                if self.adopt_ctf_revision_jobs:
                    if self.adopt_ctf_jobs:
                        self.adopt_retained_ctf_jobs()
                    self.adopt_retained_ctf_revision_jobs()
                elif self.adopt_ctf_jobs:
                    self.adopt_retained_ctf_jobs()
                    before = self.verify_ctf_drafts(require_validated=False)
                    self.revise_ctf_batch(before)
                elif self.replace_ctf_batch:
                    self.report["replacedCtfBatchAt"] = dt.datetime.now(
                        dt.timezone.utc
                    ).isoformat()
                    self.ctf_flow()
                elif not self.has_check("同一条四点修改命令已作用于 5 道题"):
                    self.revise_ctf_batch(self.verify_ctf_drafts())
                if not self.has_check(
                    "实训演示后续修改: 不少于三点"
                ) or not self.has_check("模拟演示可见文案不包含内部修订指令"):
                    self.simulation_flow()
                if not self.has_check("学情分析基于真实课程事实"):
                    self.analytics_flow()
            else:
                self.setup_visible_run()
                self.slide_flow()
                self.ctf_flow()
                self.simulation_flow()
                self.analytics_flow()
            self.capture_retained_evidence()
            self.verify_browser_visibility()
        except Exception as exc:  # retain evidence for diagnosis and iteration
            error = exc
            self.ledger.fail(str(exc))
        finally:
            self.persist_report(error=error)
        print(
            f"REPORT {self.output_dir / 'report.md'}\n"
            f"SUMMARY passed={len(self.ledger.passed)} failed={len(self.ledger.failed)}",
            flush=True,
        )
        return 1 if error else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-timeout", type=int, default=900)
    parser.add_argument("--authoring-timeout", type=int, default=7200)
    parser.add_argument("--skip-browser", action="store_true")
    parser.add_argument(
        "--output-root",
        type=pathlib.Path,
        help="write a fresh run under this directory instead of data/natural-language-e2e",
    )
    parser.add_argument(
        "--resume-report",
        type=pathlib.Path,
        help=(
            "continue the CTF-revision, simulation, analytics, and browser phases "
            "against a retained failed run"
        ),
    )
    parser.add_argument(
        "--adopt-ctf-job",
        action="append",
        default=[],
        metavar="JOB_ID",
        help=(
            "adopt exactly five retained CTF authoring jobs and continue with "
            "their natural-language batch revision; requires --resume-report"
        ),
    )
    parser.add_argument(
        "--adopt-ctf-revision-job",
        action="append",
        default=[],
        metavar="JOB_ID",
        help=(
            "adopt exactly five already-started CTF revision jobs without "
            "submitting the natural-language revision twice; requires --resume-report"
        ),
    )
    parser.add_argument(
        "--replace-ctf-batch",
        action="store_true",
        help=(
            "generate and revise a replacement five-CTF batch in the retained "
            "course/thread; requires --resume-report"
        ),
    )
    args = parser.parse_args()
    if args.replace_ctf_batch and args.resume_report is None:
        parser.error("--replace-ctf-batch requires --resume-report")
    if args.adopt_ctf_job and args.resume_report is None:
        parser.error("--adopt-ctf-job requires --resume-report")
    if args.adopt_ctf_job and len(args.adopt_ctf_job) != 5:
        parser.error("--adopt-ctf-job must be supplied exactly five times")
    if args.adopt_ctf_revision_job and args.resume_report is None:
        parser.error("--adopt-ctf-revision-job requires --resume-report")
    if args.adopt_ctf_revision_job and len(args.adopt_ctf_revision_job) != 5:
        parser.error("--adopt-ctf-revision-job must be supplied exactly five times")
    if (args.adopt_ctf_job or args.adopt_ctf_revision_job) and args.replace_ctf_batch:
        parser.error("retained job adoption and --replace-ctf-batch are mutually exclusive")
    verifier = NaturalLanguageLifecycle(
        job_timeout=max(120, args.job_timeout),
        authoring_timeout=max(900, args.authoring_timeout),
        browser=not args.skip_browser,
        output_root=args.output_root,
        resume_report=args.resume_report,
        replace_ctf_batch=args.replace_ctf_batch,
        adopt_ctf_jobs=tuple(args.adopt_ctf_job),
        adopt_ctf_revision_jobs=tuple(args.adopt_ctf_revision_job),
    )
    return verifier.run_visible_lifecycle()


if __name__ == "__main__":
    raise SystemExit(main())

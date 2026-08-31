#!/usr/bin/env python3
"""Run the complete 玄甲 teacher-to-student acceptance lifecycle.

This verifier deliberately exercises one disposable course through the same
authenticated HTTP routes that the product uses.  It extends the existing
teacher Agent verifier instead of mocking the model, queue, scoring service or
student data.  The result is a single, auditable chain:

* a teacher uploads source material and applies every analysed chapter;
* natural-language Agent requests create, revise and publish courseware,
  native practice, and an interactive demonstration;
* the enrolled student sees the new revisions, submits known answers, completes
  a deterministic simulation route, and receives automatic scoring;
* the student asks the Guide questions, creates a private self-study simulation
  with self-checks, and materializes it; and
* the teacher asks the Agent for a data-grounded analysis of the resulting
  learning evidence.

All generated names are isolated.  By default the base verifier removes its
course and accounts in ``finally``; ``--keep-data`` retains them for visual
inspection after a failed or exploratory run.  The script never logs flags,
answer keys, credentials, tickets, or model secrets.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import re
import sys
import uuid
from typing import Any
from urllib.parse import parse_qs, urlsplit


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


flow = load_module("complete_learning_flow_base", FLOW_PATH)
ui = load_module("complete_learning_ui_base", UI_PATH)


class CompleteTeachingLearningLifecycle(flow.TeacherAgentVerifier):
    """A real deployment verifier for the full teacher/student product loop."""

    def __init__(self, *args: Any, browser: bool = True, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self.browser_enabled = browser
        self.personal_simulation: dict[str, Any] | None = None
        self.personal_quiz: dict[str, Any] | None = None

    def _artifact(self, artifact_type: str) -> dict[str, Any]:
        assert self.teacher is not None
        matches = [
            item
            for item in self.artifacts
            if str(item.get("type") or "") == artifact_type
        ]
        if not matches:
            raise flow.VerificationError(
                f"the generation flow produced no {artifact_type} artifact"
            )
        return self.api(
            self.teacher,
            "GET",
            f"teaching/artifacts/{matches[-1]['id']}",
        )["artifact"]

    @staticmethod
    def _lesson_artifacts(artifact: dict[str, Any]) -> list[dict[str, Any]]:
        content = (artifact.get("revision") or {}).get("content") or {}
        lesson = content.get("lesson") if isinstance(content, dict) else None
        artifacts = lesson.get("artifacts") if isinstance(lesson, dict) else None
        return [item for item in artifacts or [] if isinstance(item, dict)]

    def _verify_intelligent_assignment_grading(self) -> None:
        """Require the known open answer to receive a real Agent score.

        The base acceptance flow correctly accepts the bounded server fallback
        for general resilience.  This end-to-end contract has a stricter user
        requirement: the deliberately correct open response must be evaluated
        by the configured intelligent grader, contribute a bounded score, and
        not silently pass through the fallback path.
        """

        submission = self.automatic_submission
        if not isinstance(submission, dict):
            raise flow.VerificationError(
                "automatic assignment grading did not retain a submission result"
            )
        intelligent_results = [
            item
            for item in submission.get("itemResults") or []
            if isinstance(item, dict)
            and str(item.get("source") or "").upper() in {"AI", "FALLBACK"}
        ]
        if not intelligent_results:
            raise flow.VerificationError(
                "automatic assignment grading produced no open-answer result"
            )
        if any(
            str(item.get("source") or "").upper() != "AI"
            for item in intelligent_results
        ):
            raise flow.VerificationError(
                "known correct open answer fell back instead of receiving intelligent grading"
            )
        try:
            objective_score = float(submission.get("objectiveScore") or 0)
            ai_score = float(submission.get("aiScore") or 0)
            total_score = float(submission.get("score") or 0)
            max_score = float(submission.get("maxScore") or 0)
        except (TypeError, ValueError) as error:
            raise flow.VerificationError(
                "intelligent assignment grading returned non-numeric score fields"
            ) from error
        if (
            ai_score <= 0
            or total_score <= objective_score
            or total_score > max_score
            or any(float(item.get("score") or 0) <= 0 for item in intelligent_results)
        ):
            raise flow.VerificationError(
                "intelligent grading did not award a bounded positive score for the known answer"
            )
        self.ledger.pass_("学生已知正确开放题由智能体评分，并将正向结果计入作业总分")

    def run_course_and_assignment_flow(self) -> None:
        super().run_course_and_assignment_flow()
        self._verify_intelligent_assignment_grading()

    def _verify_intelligent_simulation_assessment(
        self, reflected: dict[str, Any]
    ) -> dict[str, Any]:
        """Require the reflection assessment to be produced by the Agent grader.

        Completing the known simulation route earns deterministic objective
        credit.  The final reflection is deliberately substantive so that this
        acceptance flow can separately prove the intelligent process grader
        consumed the learner evidence and added a positive process score.
        """

        assessment = reflected.get("assessment") or {}
        criteria = assessment.get("criteria") or []
        criterion_ids = {
            str(item.get("id") or "")
            for item in criteria
            if isinstance(item, dict)
        }
        expected_criteria = {
            "objective-success",
            "baseline-recon",
            "hypothesis-validation",
            "evidence-and-remediation",
            "debugging-adaptation",
            "safety",
            "independence",
        }
        grader = (
            ((criteria[0].get("evidence") or {}).get("grader") or {})
            if criteria and isinstance(criteria[0], dict)
            else {}
        )
        try:
            total_score = float((reflected.get("attempt") or {}).get("totalScore") or 0)
        except (TypeError, ValueError) as error:
            raise flow.VerificationError(
                "simulation assessment returned a non-numeric total score"
            ) from error
        if (
            not assessment.get("id")
            or total_score <= 60
            or criterion_ids != expected_criteria
            or grader.get("provider") != "MODEL"
            or not str(grader.get("model") or "").strip()
        ):
            raise flow.VerificationError(
                "simulation reflection was not given a positive, model-backed evidence assessment"
            )
        return assessment

    @staticmethod
    def _verify_model_guide_reply(
        result: dict[str, Any], *, label: str
    ) -> dict[str, Any]:
        """Require a persisted Guide response to come from the configured model."""

        message = result.get("message") or {}
        metadata = message.get("metadata") or {}
        provider = str(result.get("provider") or "")
        model = str(result.get("model") or "").strip()
        if (
            provider != "MODEL"
            or not model
            or metadata.get("provider") != "MODEL"
            or str(metadata.get("model") or "").strip() != model
            or not str(metadata.get("contextDigest") or "").strip()
        ):
            raise flow.VerificationError(
                f"{label} did not persist a model-backed, evidence-scoped Guide reply"
            )
        return message

    @staticmethod
    def _verify_model_job_route(job: dict[str, Any], *, label: str) -> None:
        """Reject a natural-language Agent task without a successful model invocation."""

        route = job.get("modelRoute") or {}
        if (
            not str(route.get("actualModel") or "").strip()
            or route.get("invocationStatus") != "SUCCEEDED"
            or route.get("degraded")
        ):
            raise flow.VerificationError(
                f"{label} did not complete through a non-degraded model invocation"
            )

    @staticmethod
    def _validate_material_chapter_structure(
        chapters: list[dict[str, Any]], modules: list[dict[str, Any]]
    ) -> None:
        """Require a distinct, instructional material outline to become modules."""

        titles = [str(chapter.get("title") or "").strip() for chapter in chapters]
        normalized_titles = [re.sub(r"\s+", " ", title).casefold() for title in titles]
        has_objectives = [
            bool(chapter.get("objectives"))
            or bool(
                str(chapter.get("description") or chapter.get("summary") or "").strip()
            )
            for chapter in chapters
        ]
        module_names = {
            re.sub(r"\s+", " ", str(module.get("name") or "").strip()).casefold()
            for module in modules
            if str(module.get("name") or "").strip()
        }
        issues = []
        if len(chapters) < 3:
            issues.append(f"candidate_count={len(chapters)}")
        if any(len(title) < 2 for title in titles):
            issues.append("empty_or_short_title")
        if len(set(normalized_titles)) != len(normalized_titles):
            issues.append("duplicate_title")
        if not all(has_objectives):
            issues.append("missing_instructional_detail")
        missing_modules = [
            title for title in normalized_titles if title not in module_names
        ]
        if missing_modules:
            issues.append(f"unapplied_candidates={len(missing_modules)}")
        if issues:
            raise flow.VerificationError(
                "material chapters were not distinct instructional modules with durable titles: "
                + ", ".join(issues)
            )

    @staticmethod
    def _validate_personal_self_check_questions(
        pages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Require three renderable single-choice questions with local answer keys.

        The learner preview deliberately evaluates choice questions locally and
        exposes the generated explanation only after submission.  Do not accept
        a plain text list here: it would make the "self-check" requirement a
        non-interactive promise rather than an answerable activity.
        """

        questions = [
            question
            for page in pages
            if page.get("type") == "quiz"
            for question in ((page.get("content") or {}).get("questions") or [])
            if isinstance(question, dict)
        ]
        if not pages or any(page.get("type") != "quiz" for page in pages):
            raise flow.VerificationError(
                "student-generated personal quiz did not materialize as quiz pages"
            )
        if len(questions) < 3:
            raise flow.VerificationError(
                "student-generated personal quiz contains fewer than three self-check questions"
            )
        for question in questions[:3]:
            options = question.get("options")
            if not isinstance(options, list) or len(options) < 2:
                raise flow.VerificationError(
                    "student-generated personal quiz question has no selectable options"
                )
            option_forms = set()
            for option in options:
                if isinstance(option, dict):
                    option_forms.update(
                        str(option.get(key) or "").strip()
                        for key in ("value", "label", "text", "content")
                    )
                else:
                    option_forms.add(str(option).strip())
            option_forms.discard("")
            raw_answer = (
                question.get("answer")
                or question.get("correctAnswer")
                or question.get("correct_answer")
            )
            answers = (
                [str(item).strip() for item in raw_answer]
                if isinstance(raw_answer, list)
                else [str(raw_answer or "").strip()]
            )
            feedback = next(
                (
                    str(question.get(key) or "").strip()
                    for key in ("analysis", "feedback", "explanation", "comment")
                    if str(question.get(key) or "").strip()
                ),
                "",
            )
            if (
                str(question.get("type") or "single").lower() != "single"
                or not str(question.get("question") or "").strip()
                or not all(answers)
                or not all(answer in option_forms for answer in answers)
                or not feedback
            ):
                raise flow.VerificationError(
                    "student-generated personal quiz is missing answerable single-choice questions or immediate feedback"
                )
        return questions

    @staticmethod
    def _personal_self_check_choice_values(
        pages: list[dict[str, Any]],
    ) -> list[str]:
        """Resolve known safe choice values without exposing them in diagnostics."""

        values = []
        for (
            question
        ) in CompleteTeachingLearningLifecycle._validate_personal_self_check_questions(
            pages
        )[:3]:
            raw_answer = (
                question.get("answer")
                or question.get("correctAnswer")
                or question.get("correct_answer")
            )
            answer = (
                str(raw_answer[0]).strip()
                if isinstance(raw_answer, list) and raw_answer
                else str(raw_answer or "").strip()
            )
            selected = ""
            for index, option in enumerate(question.get("options") or []):
                if isinstance(option, dict):
                    value = str(option.get("value") or "").strip()
                    labels = {
                        value,
                        str(option.get("label") or "").strip(),
                        str(option.get("text") or "").strip(),
                        str(option.get("content") or "").strip(),
                    }
                else:
                    value = chr(ord("A") + index)
                    labels = {value, str(option).strip()}
                if answer in labels and value:
                    selected = value
                    break
            if not selected:
                raise flow.VerificationError(
                    "personal self-check answer could not be mapped to a selectable preview value"
                )
            values.append(selected)
        return values

    def _replace_artifact(self, artifact: dict[str, Any]) -> None:
        self.artifacts = [
            item for item in self.artifacts if item.get("id") != artifact.get("id")
        ]
        self.artifacts.append(artifact)

    def _refresh_course_context(self) -> None:
        """Replace stale course/module snapshots after Agent mutations."""

        assert self.teacher is not None and self.course is not None
        current_course_id = self.course.get("id")
        current_module_index = self.module.get("index") if self.module else None
        context = self.api(self.teacher, "GET", "teaching/context")
        course = next(
            (
                item
                for item in context.get("teacherDojos") or []
                if item.get("id") == current_course_id
            ),
            None,
        )
        if course is None:
            raise flow.VerificationError(
                "Agent-mutated course is missing from the refreshed teacher context"
            )
        self.course = course
        if current_module_index is not None:
            module = next(
                (
                    item
                    for item in course.get("modules") or []
                    if item.get("index") == current_module_index
                ),
                None,
            )
            if module is None:
                raise flow.VerificationError(
                    "Agent-mutated module is missing from the refreshed course context"
                )
            self.module = module

    @staticmethod
    def _lesson_page_text(page: dict[str, Any]) -> str:
        """Return visible-ish text without treating markup as a test oracle."""

        content = page.get("content") or {}
        fragments = [str(page.get("title") or "")]
        if isinstance(content, dict):
            fragments.extend(
                str(element.get("content") or "")
                for element in content.get("elements") or []
                if isinstance(element, dict)
            )
            for element in content.get("elements") or []:
                if isinstance(element, dict):
                    fragments.extend(
                        str(line.get("content") or "")
                        for line in element.get("lines") or []
                        if isinstance(line, dict)
                    )
            fragments.append(str(content.get("html") or ""))
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", " ".join(fragments))).strip()

    def verify_teacher_generation_volume_and_quality(self) -> None:
        """Require enough renderable, non-placeholder teaching assets."""

        slide_deck = self._artifact("slide-deck")
        slides = self._lesson_artifacts(slide_deck)
        titles = [str(page.get("title") or "").strip() for page in slides]
        layouts = {
            str((page.get("content") or {}).get("layout") or "").strip()
            for page in slides
            if isinstance(page.get("content"), dict)
        }
        speaker_notes = [
            page
            for page in slides
            if len(
                re.sub(
                    r"\s+",
                    "",
                    str((page.get("content") or {}).get("speakerNotes") or ""),
                )
            )
            >= 60
        ]
        substantive = [
            page
            for page in slides
            if len(((page.get("content") or {}).get("elements") or [])) >= 5
            and len(re.sub(r"\s+", "", self._lesson_page_text(page))) >= 55
        ]
        learner_checks = sum(
            str((page.get("content") or {}).get("layout") or "")
            in {"activity", "checkpoint"}
            for page in slides
        )
        if (
            len(slides) != 12
            or any(page.get("type") != "slide" for page in slides)
            or any(not title for title in titles)
            or len(set(titles)) != len(titles)
            or len(layouts - {""}) < 4
            or len(speaker_notes) != len(slides)
            or len(substantive) < 11
            or "case" not in layouts
            or "summary" not in layouts
            or learner_checks < 2
        ):
            raise flow.VerificationError(
                "generated courseware failed the 12-page, teachable, and formative-check quality contract"
            )

        scene = self._artifact("attack-defense-scene")
        scene_pages = self._lesson_artifacts(scene)
        scene_types = [str(page.get("type") or "") for page in scene_pages]
        scene_html = [
            str((page.get("content") or {}).get("html") or "").strip()
            for page in scene_pages
        ]
        if (
            len(scene_pages) < 2
            or scene_types[0] != "vulnerable-lab"
            or "simulation" not in scene_types[1:]
            or any(not value for value in scene_html)
        ):
            raise flow.VerificationError(
                "attack-defense demonstration did not contain an executable lab and follow-up simulation"
            )

        simulation = self._artifact("simulation")
        simulation_pages = self._lesson_artifacts(simulation)
        if (
            len(simulation_pages) < 2
            or any(page.get("type") != "simulation" for page in simulation_pages)
            or any(
                (page.get("content") or {}).get("widgetType") != "simulation"
                or not str((page.get("content") or {}).get("html") or "").strip()
                for page in simulation_pages
            )
        ):
            raise flow.VerificationError(
                "simulation demonstration did not contain enough executable feedback scenes"
            )
        self.ledger.pass_(
            "教师资料驱动生成 12 页可授课课件、双阶段攻防演示和双场景交互模拟"
        )

    def run_generation_flow(self) -> None:
        """Generate enough of each teacher-facing content type for a real lesson."""

        self.send_generation(
            "为当前章节正式生成一份恰好12页、可在平台内预览、编辑并发布到课堂的"
            "交互式SQL注入防御课件；不要生成下载文件。必须包含学习目标、完整授权案例、"
            "参数化查询前后对比、输入验证、日志证据、至少两次理解检查、一次迁移任务、"
            "结尾总结和每页不少于60字的教师讲稿。",
            "slide-deck",
            "single",
            None,
            materialize=True,
        )
        self.send_generation(
            "为当前章节正式生成一个可在平台内预览、编辑并发布到课堂、且仅在隔离环境运行的"
            "SQL注入攻防演示实验；不要生成下载文件。至少包含两个连续可操作阶段："
            "攻击线索/漏洞实验和防守修复/验证模拟；每个阶段都要有攻击者与防守者角色、"
            "拓扑、证据面板、重置方法和安全边界。",
            "attack-defense-scene",
            "single",
            "deepseek-v4-pro",
            materialize=True,
        )
        self.send_generation(
            "为当前章节正式生成一项可在平台内预览、编辑并发布到课堂的SQL注入检测模拟练习；"
            "不要生成下载文件。至少包含两个连续可操作场景、三个判断/处置决策、即时反馈、"
            "评分标准、复盘以及一键重置。",
            "simulation",
            "single",
            "deepseek-v4-pro",
            materialize=True,
        )
        self.verify_teacher_generation_volume_and_quality()

    def _publish_artifact(
        self,
        artifact: dict[str, Any],
        *,
        natural_request: str,
    ) -> dict[str, Any]:
        """Ask the Agent to publish, then use the normal explicit approval gate."""

        assert self.teacher is not None
        proposal = self.expect_tool(natural_request, "artifact.request_publish")
        proposed_id = str((proposal.get("arguments") or {}).get("artifactId") or "")
        if proposed_id and proposed_id != artifact["id"]:
            resolved = self.api(
                self.teacher,
                "GET",
                f"teaching/artifacts/{proposed_id}",
            )["artifact"]
            if (
                resolved.get("type") != artifact.get("type")
                or resolved.get("dojoId") != artifact.get("dojoId")
                or resolved.get("moduleIndex") != artifact.get("moduleIndex")
            ):
                raise flow.VerificationError(
                    "the Agent resolved publication outside the requested artifact scope"
                )
            artifact = resolved
        proposal["arguments"] = {
            "artifactId": artifact["id"],
            "expectedRevision": artifact["currentRevision"],
        }
        staged = self.api(
            self.teacher,
            "POST",
            f"teaching/artifacts/{artifact['id']}/request-publish",
            json_body={"expectedRevision": artifact["currentRevision"]},
            statuses=(202,),
        )["action"]
        if staged.get("status") != "AWAITING_APPROVAL":
            raise flow.VerificationError(
                "artifact publication bypassed the explicit approval gate"
            )
        self.approve_action(staged["id"])
        published = self.api(
            self.teacher,
            "GET",
            f"teaching/artifacts/{artifact['id']}",
        )["artifact"]
        if published.get("status") != "PUBLISHED":
            raise flow.VerificationError(
                "approved artifact publication did not become visible"
            )
        self._replace_artifact(published)
        return published

    def verify_teacher_creation_coverage(self) -> None:
        """Prove that material analysis produces a non-trivial course structure."""

        assert self.teacher is not None and self.course is not None
        if not self.material_id:
            raise flow.VerificationError(
                "material lifecycle did not retain a material id"
            )
        material = self.api(
            self.teacher,
            "GET",
            f"teaching/materials/{self.material_id}",
        )["material"]
        chapters = [
            chapter
            for chapter in (
                (material.get("analysis") or {}).get("chapterCandidates") or []
            )
            if isinstance(chapter, dict)
        ]
        context = self.api(self.teacher, "GET", "teaching/context")
        course = next(
            (
                item
                for item in context.get("teacherDojos") or []
                if item.get("id") == self.course.get("id")
            ),
            None,
        )
        if course is None:
            raise flow.VerificationError(
                "approved material chapters were not persisted in the current course"
            )
        self._validate_material_chapter_structure(
            chapters,
            [
                module
                for module in (course.get("modules") or [])
                if isinstance(module, dict)
            ],
        )
        self.ledger.pass_(
            "上传资料经完整分析后生成至少三个名称不同且具教学目标的持久课程章节"
        )

    def run_student_courseware_visibility_flow(self) -> None:
        """Check a student sees the final published slide revision immediately."""

        assert self.student is not None and self.course is not None
        slide = self._artifact("slide-deck")
        if slide.get("status") != "PUBLISHED":
            raise flow.VerificationError(
                "revised courseware was not published before student view"
            )
        visible = self.api(
            self.student,
            "GET",
            f"teaching/artifacts/{slide['id']}",
        )["artifact"]
        if (
            visible.get("status") != "PUBLISHED"
            or visible.get("canEdit")
            or visible.get("currentRevision") != slide.get("currentRevision")
            or not (visible.get("revision") or {}).get("content")
        ):
            raise flow.VerificationError(
                "student did not receive the exact current published courseware revision"
            )
        page = self.student.get(
            f"{flow.BASE_URL}/learning/artifacts/{slide['id']}", timeout=45
        )
        flow.require(page)
        if f'data-artifact-id="{slide["id"]}"' not in page.text:
            raise flow.VerificationError(
                "student courseware page did not bind the published artifact"
            )
        if 'data-viewer-role="student"' not in page.text:
            raise flow.VerificationError(
                "student courseware page did not render in learner preview mode"
            )
        self._assert_student_artifact_preview_launch(visible)
        course_page = self.student.get(
            f"{flow.BASE_URL}/dojo/{self.course['referenceId']}/learning", timeout=45
        )
        flow.require(course_page)
        if str(self.course.get("name") or "") not in course_page.text:
            raise flow.VerificationError(
                "student learning dashboard omitted the enrolled course"
            )
        self.ledger.pass_("学生端实时读取发布后的课件版本，并且没有获得教师编辑权限")

    def run_attack_defense_revision_and_visibility_flow(self) -> None:
        """Revise and publish the generated attack-defense demonstration too."""

        assert self.teacher is not None and self.student is not None
        scene = self._artifact("attack-defense-scene")
        inaccessible = self.student.get(
            flow.api_url(f"teaching/artifacts/{scene['id']}"), timeout=45
        )
        flow.require(inaccessible, (404,))
        old_revision = int(scene.get("currentRevision") or 0)
        old_hash = str((scene.get("revision") or {}).get("contentHash") or "")
        instruction = (
            "在两个阶段之间增加攻击证据到防守决策的交接面板，"
            "补充最小权限、参数化查询和日志复核的对照，并提供一键重置。"
        )
        resume_existing_revision = (
            scene.get("status") == "DRAFT"
            and str((scene.get("revision") or {}).get("instruction") or "")
            == instruction
        )
        if resume_existing_revision:
            old_revision -= 1
            old_hash = ""
            revised = scene
            self.ledger.pass_(
                "已恢复上次完成的攻防修订，未重复追加交接面板"
            )
        else:
            proposal = self.expect_tool(
                f"修改当前课程中的攻防演示《{scene['title']}》：{instruction}",
                "artifact.revise",
            )
            proposed_id = str(
                (proposal.get("arguments") or {}).get("artifactId") or ""
            )
            if proposed_id and proposed_id != scene["id"]:
                resolved = self.api(
                    self.teacher,
                    "GET",
                    f"teaching/artifacts/{proposed_id}",
                )["artifact"]
                if (
                    resolved.get("type") != "attack-defense-scene"
                    or resolved.get("dojoId") != scene.get("dojoId")
                    or resolved.get("moduleIndex") != scene.get("moduleIndex")
                ):
                    raise flow.VerificationError(
                        "natural-language attack-defense revision resolved an unrelated artifact"
                    )
                scene = resolved
                old_revision = int(scene.get("currentRevision") or 0)
                old_hash = str(
                    (scene.get("revision") or {}).get("contentHash") or ""
                )
            started = self.api(
                self.teacher,
                "POST",
                f"teaching/artifacts/{scene['id']}/revise",
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
                f"teaching/artifacts/{scene['id']}",
            )["artifact"]
        pages = self._lesson_artifacts(revised)
        executable_pages = [
            page
            for page in pages
            if page.get("type") in {"vulnerable-lab", "simulation"}
        ]
        supplemental_pages = [
            page
            for page in pages
            if page.get("type") not in {"vulnerable-lab", "simulation"}
        ]
        if (
            int(revised.get("currentRevision") or 0) != old_revision + 1
            or str((revised.get("revision") or {}).get("contentHash") or "") == old_hash
            or len(pages) < 2
            or pages[0].get("type") != "vulnerable-lab"
            or "simulation" not in [page.get("type") for page in pages[1:]]
            or not all(
                str((page.get("content") or {}).get("html") or "").strip()
                and "reset"
                in str((page.get("content") or {}).get("html") or "").lower()
                for page in executable_pages
            )
            or any(
                page.get("type") != "slide"
                or len((page.get("content") or {}).get("elements") or []) < 2
                or len(re.sub(r"\s+", "", self._lesson_page_text(page))) < 60
                for page in supplemental_pages
            )
        ):
            raise flow.VerificationError(
                "attack-defense revision did not preserve an executable two-stage demonstration"
            )
        published = self._publish_artifact(
            revised,
            natural_request=f"验证并发布刚才修改的攻防演示《{revised['title']}》。",
        )
        student_view = self.api(
            self.student,
            "GET",
            f"teaching/artifacts/{published['id']}",
        )["artifact"]
        if (
            student_view.get("status") != "PUBLISHED"
            or student_view.get("currentRevision") != published.get("currentRevision")
            or student_view.get("canEdit")
        ):
            raise flow.VerificationError(
                "student did not receive the revised published attack-defense demonstration"
            )
        self._assert_student_artifact_preview_launch(student_view)
        self.ledger.pass_(
            "教师自然语言修改并发布双阶段攻防演示后，学生立即看到同一安全交互版本"
        )

    def run_demonstration_revision_and_visibility_flow(self) -> None:
        """Revise a demo through natural language, publish it, and expose it to the student."""

        assert self.teacher is not None and self.student is not None
        simulation = self._artifact("simulation")
        inaccessible = self.student.get(
            flow.api_url(f"teaching/artifacts/{simulation['id']}"), timeout=45
        )
        flow.require(inaccessible, (404,))

        old_revision = int(simulation.get("currentRevision") or 0)
        old_hash = str((simulation.get("revision") or {}).get("contentHash") or "")
        instruction = (
            "增加攻击强度滑块、参数化查询防御开关、请求/查询/日志实时证据面板，"
            "并在末尾加入一键重置、攻防对照总结和三道自检问题。"
        )
        proposal = self.expect_tool(
            f"修改当前课程中的模拟实训演示《{simulation['title']}》：{instruction}",
            "artifact.revise",
        )
        proposed_id = str((proposal.get("arguments") or {}).get("artifactId") or "")
        if proposed_id and proposed_id != simulation["id"]:
            resolved = self.api(
                self.teacher,
                "GET",
                f"teaching/artifacts/{proposed_id}",
            )["artifact"]
            if (
                resolved.get("type") != "simulation"
                or resolved.get("dojoId") != simulation.get("dojoId")
                or resolved.get("moduleIndex") != simulation.get("moduleIndex")
            ):
                raise flow.VerificationError(
                    "natural-language demo revision resolved an unrelated artifact"
                )
            simulation = resolved
            old_revision = int(simulation.get("currentRevision") or 0)
            old_hash = str((simulation.get("revision") or {}).get("contentHash") or "")
        started = self.api(
            self.teacher,
            "POST",
            f"teaching/artifacts/{simulation['id']}/revise",
            json_body={"instruction": instruction, "expectedRevision": old_revision},
            statuses=(202,),
        )
        self.wait_job(started["job"]["id"])
        revised = self.api(
            self.teacher,
            "GET",
            f"teaching/artifacts/{simulation['id']}",
        )["artifact"]
        if (
            int(revised.get("currentRevision") or 0) != old_revision + 1
            or str((revised.get("revision") or {}).get("contentHash") or "") == old_hash
            or instruction
            not in str((revised.get("revision") or {}).get("instruction") or "")
        ):
            raise flow.VerificationError(
                "demo revision did not create a changed, auditable version"
            )
        rendered = self._lesson_artifacts(revised)
        simulation_html = [
            str((item.get("content") or {}).get("html") or "")
            for item in rendered
            if item.get("type") == "simulation"
        ]
        if not simulation_html or not all(value.strip() for value in simulation_html):
            raise flow.VerificationError(
                "revised demo has no executable student-facing simulation"
            )
        if not any(
            any(marker in value for marker in ("reset", "controls", "evidence"))
            for value in simulation_html
        ):
            raise flow.VerificationError(
                "revised demo lost its interactive control and evidence surface"
            )

        published = self._publish_artifact(
            revised,
            natural_request=f"验证并发布刚才修改的模拟实训演示《{revised['title']}》。",
        )
        student_view = self.api(
            self.student,
            "GET",
            f"teaching/artifacts/{published['id']}",
        )["artifact"]
        if (
            student_view.get("status") != "PUBLISHED"
            or student_view.get("currentRevision") != published.get("currentRevision")
            or student_view.get("canEdit")
        ):
            raise flow.VerificationError(
                "student did not see the just-published demonstration revision"
            )
        self._assert_student_artifact_preview_launch(student_view)
        self.ledger.pass_("教师自然语言修改并批准发布演示后，学生立即看到同一交互版本")

    def run_student_simulation_and_grading_flow(self) -> None:
        """Publish a known deterministic simulation route and score the student result."""

        assert self.teacher is not None and self.student is not None
        assert self.course is not None and self.module is not None
        # A retained acceptance course can contain a previously published
        # synthetic simulation from an interrupted retry.  Put a fresh,
        # teacher-visible title in the original request so the selected plan
        # itself remains unique.  The server intentionally ignores unsigned
        # client-side argument mutations after plan selection.
        requested_title = f"无线接入异常诊断 {uuid.uuid4().hex[:6]}"
        brief = (
            f"创建一题无线网络异常处置模拟题，题目名称必须严格使用《{requested_title}》。"
            "学生需要查看拓扑、扫描频谱、检查客户端、"
            "形成可证伪的同频干扰假设、调整信道并验证服务恢复；这是一道可完成和自动评分的"
            "情境题，不是普通展示课件。"
        )
        proposal = self.expect_tool(
            f"在当前章节生成一题可自动评分的无线网络异常模拟实训题：{brief}",
            "challenge.generate",
        )
        trusted_arguments = proposal.get("arguments") or {}
        trusted_constraints = trusted_arguments.get("constraints") or {}
        if (
            trusted_arguments.get("moduleIndex") != self.module["index"]
            or trusted_arguments.get("challengeCount") != 1
            or trusted_constraints.get("exerciseMode") != "SIMULATION"
            or trusted_constraints.get("title") != requested_title
        ):
            raise flow.VerificationError(
                "selected simulation plan did not preserve its trusted scope, mode and title"
            )
        generated = self.execute_course_tool(proposal)
        authoring = generated.get("result", {}).get("authoringJob") or {}
        if not authoring.get("id"):
            raise flow.VerificationError(
                "simulation exercise generation started no authoring job"
            )
        completed = self.wait_authoring_job(str(authoring["id"]))
        draft = self.top_level_api(
            self.teacher,
            "GET",
            f"learning/drafts/{completed['draftId']}",
        )["draft"]
        draft_spec = draft.get("spec") or {}
        challenge_id = str(draft_spec.get("id") or "").strip()
        if (
            (draft.get("validation") or {}).get("status") != "PASS"
            or draft_spec.get("exerciseMode") != "SIMULATION"
            or not isinstance(draft_spec.get("simulation"), dict)
            or draft_spec.get("name") != requested_title
            or not challenge_id
        ):
            raise flow.VerificationError(
                "generated simulation exercise did not preserve its title, mode and publish gate"
            )

        publish = self.expect_tool(
            (
                "发布本轮刚验证通过的无线网络异常模拟实训题，"
                f"草稿 ID 为 {draft['id']}；只发布这一份。"
            ),
            "challenge.publish",
        )
        publish["arguments"] = {"draftId": draft["id"]}
        published = self.execute_course_tool(
            publish, expect_denied_without_confirmation=True
        )["result"]
        challenge = published.get("challenge") or {}
        if challenge.get("id") != challenge_id:
            raise flow.VerificationError(
                "published simulation exercise did not preserve its validated logical id"
            )
        if challenge.get("exerciseMode") != "SIMULATION":
            raise flow.VerificationError(
                "published simulation exercise has the wrong runtime mode"
            )
        solution_run = published.get("solutionRun") or {}
        if solution_run.get("id"):
            self.wait_solution_run(
                str(challenge.get("moduleId") or self.module["id"]),
                challenge_id,
                str(solution_run["id"]),
            )

        started = self.student.post(
            f"{flow.BASE_URL}/pwncollege_api/v1/docker",
            json={
                "dojo": self.course["referenceId"],
                "module": challenge.get("moduleId") or self.module["id"],
                "challenge": challenge_id,
                "practice": False,
            },
            timeout=120,
        )
        flow.require(started)
        started_payload = started.json()
        if (
            not started_payload.get("success")
            or started_payload.get("exerciseMode") != "SIMULATION"
            or not started_payload.get("simulationRunId")
        ):
            raise flow.VerificationError(
                "student could not start the published simulation exercise"
            )
        run_id = str(started_payload["simulationRunId"])
        active = self.top_level_api(self.student, "GET", "learning/attempts/current")[
            "attempt"
        ]
        if (
            active.get("exerciseMode") != "SIMULATION"
            or active.get("simulationRunId") != run_id
        ):
            raise flow.VerificationError(
                "simulation start did not create the student attempt"
            )
        run = self.top_level_api(self.student, "GET", f"simulations/{run_id}")["run"]
        if run.get("turn") != 0 or run.get("status") != "ACTIVE":
            raise flow.VerificationError(
                "simulation did not start from its first deterministic state"
            )

        def act(
            action_id: str, parameters: dict[str, Any] | None = None
        ) -> dict[str, Any]:
            response = self.student.post(
                f"{flow.BASE_URL}/pwncollege_api/v1/simulations/{run_id}/actions",
                json={
                    "actionId": action_id,
                    "parameters": parameters or {},
                    "expectedTurn": run["turn"],
                },
                timeout=120,
            )
            flow.require(response)
            payload = response.json()
            if not payload.get("success") or not payload.get("accepted"):
                raise flow.VerificationError(
                    "known simulation answer route was not accepted by the deterministic engine"
                )
            run.update(payload["run"])
            return payload

        # These are the published WIRELESS preset's known correct decisions.
        # They intentionally exercise the learner UI/API without performing a
        # real attack or reading a private solution/flag.
        act("inspect-topology")
        act("scan-spectrum")
        act("inspect-client")
        act("form-hypothesis", {"cause": "co-channel-interference"})
        act("change-channel", {"channel": 11})
        completed_turn = act("verify-service")
        if not completed_turn.get("completed") or run.get("status") != "COMPLETED":
            raise flow.VerificationError(
                "known simulation answer route did not complete the exercise"
            )
        replay = self.top_level_api(
            self.student, "GET", f"simulations/{run_id}/replay"
        )["replay"]
        if not replay.get("valid") or replay.get("actionsReplayed") != 6:
            raise flow.VerificationError(
                "completed simulation evidence could not be replayed"
            )

        solved = self.top_level_api(
            self.student, "GET", f"learning/attempts/{active['id']}"
        )["attempt"]
        if solved.get("status") != "SOLVED" or solved.get("objectiveScore") != 60:
            raise flow.VerificationError(
                "simulation completion did not earn deterministic objective credit"
            )
        reflected = self.top_level_api(
            self.student,
            "POST",
            f"learning/attempts/{active['id']}",
            json_body={
                "reflection": (
                    "我先建立拓扑和频谱基线，再用客户端证据验证同频干扰假设；"
                    "调整信道后重新验证服务恢复，并保留整个操作序列用于复盘。"
                ),
                "submit": True,
            },
            timeout=360,
        )
        self._verify_intelligent_simulation_assessment(reflected)
        self.ledger.pass_(
            "学生用预先确定的模拟决策完成演示题，智能体依据重放证据给出正向 60/40 评分"
        )

    def _generate_personal_artifact(
        self,
        workspace_id: str,
        *,
        artifact_type: str,
        prompt: str,
        title: str,
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        """Generate, select, and materialize one student-owned study artifact."""

        assert (
            self.student is not None
            and self.course is not None
            and self.module is not None
        )
        generated = self.api(
            self.student,
            "POST",
            f"teaching/self-learning/workspaces/{workspace_id}/generate",
            json_body={
                "prompt": prompt,
                "artifactType": artifact_type,
                "candidateCount": 1,
            },
            statuses=(202,),
            timeout=360,
        )
        candidate_set_id = str((generated.get("candidateSet") or {}).get("id") or "")
        job_id = str((generated.get("job") or {}).get("id") or "")
        if not candidate_set_id or not job_id:
            raise flow.VerificationError(
                f"personal {artifact_type} generation did not create a durable candidate job"
            )
        self.wait_job(job_id, client=self.student)
        candidate_set = self.api(
            self.student,
            "GET",
            f"teaching/candidate-sets/{candidate_set_id}",
        )["candidateSet"]
        candidates = candidate_set.get("candidates") or []
        if (
            candidate_set.get("status") != "READY"
            or candidate_set.get("selfWorkspaceId") != workspace_id
            or candidate_set.get("kind") != artifact_type
            or len(candidates) != 1
            or not isinstance(candidates[0], dict)
        ):
            raise flow.VerificationError(
                f"personal {artifact_type} generation did not yield one private candidate"
            )
        candidate = candidates[0]
        plan = candidate.get("content") or {}
        if not {
            "type",
            "objectives",
            "outline",
            "activities",
            "assessment",
            "experience",
        }.issubset(plan):
            raise flow.VerificationError(
                f"personal {artifact_type} candidate omitted the required learning-plan sections"
            )
        selected = self.api(
            self.student,
            "POST",
            f"teaching/candidates/{candidate['id']}/select",
        )["candidateSet"]
        if selected.get("selectedCandidateId") != candidate["id"]:
            raise flow.VerificationError(
                f"student could not select the personal {artifact_type} candidate"
            )
        materialized = self.api(
            self.student,
            "POST",
            f"teaching/candidates/{candidate['id']}/materialize",
            json_body={"title": title},
            statuses=(202,),
            timeout=360,
        )
        materialization_job_id = str((materialized.get("job") or {}).get("id") or "")
        artifact_id = str((materialized.get("artifact") or {}).get("id") or "")
        if not materialization_job_id or not artifact_id:
            raise flow.VerificationError(
                f"personal {artifact_type} materialization did not return an artifact job"
            )
        self.wait_job(materialization_job_id, client=self.student)
        artifact = self.api(
            self.student,
            "GET",
            f"teaching/artifacts/{artifact_id}",
        )["artifact"]
        if (
            artifact.get("selfWorkspaceId") != workspace_id
            or artifact.get("type") != artifact_type
            or artifact.get("status") not in {"READY", "READY_TO_PUBLISH"}
            or not (artifact.get("revision") or {}).get("content")
        ):
            raise flow.VerificationError(
                f"personal {artifact_type} did not materialize as a usable private artifact"
            )
        return candidate_set, candidate, artifact

    def _assert_student_artifact_preview_launch(self, artifact: dict[str, Any]) -> None:
        """Ensure a private artifact can enter the same protected preview as the UI."""

        assert self.student is not None
        artifact_id = str(artifact.get("id") or "")
        if not artifact_id:
            raise flow.VerificationError(
                "personal artifact has no id for a student preview"
            )
        launch = self.api(
            self.student,
            "POST",
            "teaching/runtime/launch",
            json_body={
                "role": "student",
                "dojoId": artifact.get("dojoId"),
                "moduleIndex": artifact.get("moduleIndex"),
                "target": f"/prep/{artifact_id}",
            },
            statuses=(201,),
        )
        launch_url = str(launch.get("launchUrl") or "")
        parsed = urlsplit(launch_url)
        ticket = (parse_qs(parsed.query).get("ticket") or [""])[0]
        if (
            not parsed.scheme
            or not parsed.netloc
            or not parsed.path.rstrip("/").endswith("/api/integration/exchange")
            or not ticket
        ):
            raise flow.VerificationError(
                "student personal artifact preview did not receive a protected runtime launch URL"
            )

    def run_student_autonomous_learning_flow(self) -> None:
        """Exercise natural-language Guide, personal generation, and formative self-checks."""

        assert (
            self.student is not None
            and self.course is not None
            and self.module is not None
        )
        question = self.top_level_api(
            self.student,
            "POST",
            "learning/guide",
            json_body={
                "question": (
                    "我刚完成了无线异常处置。请结合我自己的课程和学习证据，"
                    "解释为什么要先建立基线，并给出下一次 30 分钟复习计划。"
                )
            },
            timeout=360,
        )
        guide_message = self._verify_model_guide_reply(
            question, label="student evidence-grounded Guide question"
        )
        reply = str(guide_message.get("content") or "")
        guide_thread = (question.get("thread") or {}).get("id")
        if len(reply) < 80 or not guide_thread:
            raise flow.VerificationError(
                "student Guide question did not create a substantive persisted reply"
            )
        if any(
            item.get("type") == "workspace"
            for item in question.get("agentActions") or []
        ):
            raise flow.VerificationError(
                "a read-only student question unexpectedly created a workspace"
            )

        created = self.top_level_api(
            self.student,
            "POST",
            "learning/guide",
            json_body={
                "threadId": guide_thread,
                "question": (
                    "请为我创建一个基于当前课程的个人无线攻防模拟学习工作区，"
                    "生成包含三道自检问题和即时反馈的练习演示。"
                ),
            },
            timeout=360,
        )
        self._verify_model_guide_reply(
            created, label="student personal-workspace Guide request"
        )
        workspace_action = next(
            (
                item
                for item in created.get("agentActions") or []
                if item.get("type") == "workspace"
                and isinstance(item.get("workspace"), dict)
            ),
            None,
        )
        if workspace_action is None:
            raise flow.VerificationError(
                "explicit student generation request did not create a personal workspace"
            )
        workspace = workspace_action["workspace"]
        workspace_id = str(workspace.get("id") or "")
        if (
            not workspace_id
            or workspace.get("dojoId") != self.course.get("id")
            or workspace.get("moduleIndex") != self.module.get("index")
        ):
            raise flow.VerificationError(
                "student Agent created a workspace outside the enrolled course scope"
            )

        generated = self.api(
            self.student,
            "POST",
            f"teaching/self-learning/workspaces/{workspace_id}/generate",
            json_body={
                "prompt": (
                    "生成一个个人无线攻防交互模拟：要求包含拓扑观察、频谱判断、"
                    "安全处置选择、三道自检问题和即时反馈；只用于我自己的练习。"
                ),
                "artifactType": "simulation",
                "candidateCount": 1,
            },
            statuses=(202,),
            timeout=360,
        )
        candidate_set_id = str((generated.get("candidateSet") or {}).get("id") or "")
        if not candidate_set_id or not (generated.get("job") or {}).get("id"):
            raise flow.VerificationError(
                "self-learning generation did not create a durable candidate job"
            )
        self.wait_job(str(generated["job"]["id"]), client=self.student)
        candidate_set = self.api(
            self.student,
            "GET",
            f"teaching/candidate-sets/{candidate_set_id}",
        )["candidateSet"]
        candidates = candidate_set.get("candidates") or []
        if (
            candidate_set.get("status") != "READY"
            or candidate_set.get("selfWorkspaceId") != workspace_id
            or candidate_set.get("kind") != "simulation"
            or len(candidates) != 1
        ):
            raise flow.VerificationError(
                "personal generation did not yield one private simulation candidate"
            )
        plan = candidates[0].get("content") or {}
        serialized_plan = json.dumps(plan, ensure_ascii=False)
        if (
            not {
                "type",
                "objectives",
                "outline",
                "activities",
                "assessment",
                "experience",
            }.issubset(plan)
            or not plan.get("experience")
            or not any(
                marker in serialized_plan for marker in ("自检", "检查", "练习", "反馈")
            )
        ):
            raise flow.VerificationError(
                "personal simulation omitted the requested formative self-check structure"
            )
        selected = self.api(
            self.student,
            "POST",
            f"teaching/candidates/{candidates[0]['id']}/select",
        )["candidateSet"]
        if selected.get("selectedCandidateId") != candidates[0]["id"]:
            raise flow.VerificationError(
                "student could not select the personal simulation candidate"
            )
        materialized = self.api(
            self.student,
            "POST",
            f"teaching/candidates/{candidates[0]['id']}/materialize",
            json_body={"title": "我的无线攻防自检演示"},
            statuses=(202,),
            timeout=360,
        )
        self.wait_job(str(materialized["job"]["id"]), client=self.student)
        personal = self.api(
            self.student,
            "GET",
            f"teaching/artifacts/{materialized['artifact']['id']}",
        )["artifact"]
        if (
            personal.get("selfWorkspaceId") != workspace_id
            or personal.get("type") != "simulation"
            or personal.get("status") not in {"READY", "READY_TO_PUBLISH"}
            or not (personal.get("revision") or {}).get("content")
        ):
            raise flow.VerificationError(
                "personal simulation did not materialize as a usable private artifact"
            )
        teacher_visibility = self.teacher.get(
            flow.api_url(f"teaching/artifacts/{personal['id']}"), timeout=45
        )
        flow.require(teacher_visibility, (404,))
        self._assert_student_artifact_preview_launch(personal)
        self.personal_simulation = personal

        _, quiz_candidate, personal_quiz = self._generate_personal_artifact(
            workspace_id,
            artifact_type="quiz",
            prompt=(
                "围绕刚才的无线异常处置生成三道个人自检单选题；每题必须为 single 类型、"
                "至少给出两个可选项、明确正确答案且答案必须与选项值匹配，并提供即时解释反馈"
                "和下一步练习建议，只用于我自己的练习。"
            ),
            title="我的无线异常处置自检题",
        )
        quiz_plan = quiz_candidate.get("content") or {}
        if not any(
            marker in json.dumps(quiz_plan, ensure_ascii=False)
            for marker in ("自检", "检查", "反馈", "练习")
        ):
            raise flow.VerificationError(
                "student-generated personal quiz omitted the requested self-check feedback plan"
            )
        quiz_pages = self._lesson_artifacts(personal_quiz)
        self._validate_personal_self_check_questions(quiz_pages)
        personal_quiz_page = self.student.get(
            f"{flow.BASE_URL}/learning/artifacts/{personal_quiz['id']}", timeout=45
        )
        flow.require(personal_quiz_page)
        if f'data-artifact-id="{personal_quiz["id"]}"' not in personal_quiz_page.text:
            raise flow.VerificationError(
                "student personal quiz page did not bind the generated self-check artifact"
            )
        if 'data-viewer-role="student"' not in personal_quiz_page.text:
            raise flow.VerificationError(
                "student personal quiz page did not render in the learner preview mode"
            )
        self._assert_student_artifact_preview_launch(personal_quiz)
        teacher_quiz_visibility = self.teacher.get(
            flow.api_url(f"teaching/artifacts/{personal_quiz['id']}"), timeout=45
        )
        flow.require(teacher_quiz_visibility, (404,))
        self.personal_quiz = personal_quiz
        self.ledger.pass_(
            "学生可自然语言提问并生成带自检反馈的个人演示和三道个人练习题；成果默认隔离于教师和其他学生"
        )

    def run_student_browser_preview_flow(self) -> None:
        """Use the real student browser path for courseware and personal self-checks."""

        if not self.browser_enabled:
            return
        assert self.student is not None and self.personal_quiz is not None
        slide = self._artifact("slide-deck")
        quiz_pages = self._lesson_artifacts(self.personal_quiz)
        answer_values = self._personal_self_check_choice_values(quiz_pages)
        if len(answer_values) != 3:
            raise flow.VerificationError(
                "personal self-check browser flow did not resolve three answer values"
            )

        driver = ui.ChromeDriver(port=9531)
        try:
            driver.navigate(flow.BASE_URL)
            for cookie in self.student.cookies:
                driver.add_cookie(cookie.name, cookie.value)

            slide_id = str(slide.get("id") or "")
            driver.navigate(f"{flow.BASE_URL}/learning/artifacts/{slide_id}")
            driver.wait_for(
                "const root=document.getElementById('teaching-artifact');"
                f"if(root?.dataset.artifactId!=={json.dumps(slide_id)}||root.dataset.viewerRole!=='student')return false;"
                "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                "return Boolean(doc?.querySelector('[data-aisecedu-preview-state=ready]')&&"
                "doc.querySelector('[data-aisecedu-slide-preview=fill]')&&"
                "doc.querySelector('[data-aisecedu-speaker-notes=visible]'));",
                timeout=90,
                label="student courseware preview",
            )
            advanced = driver.execute(
                "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                "const button=doc?.querySelector('button[aria-label=\"下一个场景\"]');"
                "if(!button||button.disabled)return false;button.click();return true;"
            )
            if not advanced:
                raise flow.VerificationError(
                    "student courseware preview has no working next-page control"
                )
            driver.wait_for(
                "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                "return Boolean(doc?.querySelector('[aria-label=\"第 2 页讲稿\"]'));",
                timeout=30,
                label="student courseware second page",
            )

            quiz_id = str(self.personal_quiz.get("id") or "")
            driver.navigate(f"{flow.BASE_URL}/learning/artifacts/{quiz_id}")
            driver.wait_for(
                "const root=document.getElementById('teaching-artifact');"
                f"if(root?.dataset.artifactId!=={json.dumps(quiz_id)}||root.dataset.viewerRole!=='student')return false;"
                "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                "const panel=doc?.querySelector('[data-aisecedu-quiz-self-check=ready]');"
                "return Boolean(panel&&doc.querySelectorAll('[role=radiogroup]').length===1&&"
                "doc.querySelectorAll('input[type=radio]').length>=2&&!doc.body.innerText.includes('参考答案：'));",
                timeout=90,
                label="student personal self-check preview",
            )
            for index, answer in enumerate(answer_values):
                submitted = driver.execute(
                    "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                    f"const answer={json.dumps(answer, ensure_ascii=False)};"
                    "const group=doc?.querySelector('[role=radiogroup]');"
                    "const input=[...(group?.querySelectorAll('input[type=radio]')||[])].find(item=>item.value===answer);"
                    "if(!input)return false;input.click();"
                    "const submit=[...doc.querySelectorAll('button')].find(item=>item.textContent?.includes('提交并查看反馈'));"
                    "if(!submit||submit.disabled)return false;submit.click();return true;"
                )
                if not submitted:
                    raise flow.VerificationError(
                        f"student could not answer and submit personal self-check page {index + 1}"
                    )
                driver.wait_for(
                    "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                    "const summary=doc?.querySelector('[data-aisecedu-self-check-summary]')?.textContent||'';"
                    "const feedback=doc?.querySelectorAll('[data-aisecedu-self-check-feedback=correct]').length||0;"
                    "return feedback===1&&summary.includes('1 / 1')&&doc?.body?.innerText.includes('即时反馈：');",
                    timeout=45,
                    label=f"student known-answer self-check feedback page {index + 1}",
                )
                if index < len(answer_values) - 1:
                    advanced = driver.execute(
                        "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                        "const button=doc?.querySelector('button[aria-label=\"下一个场景\"]');"
                        "if(!button||button.disabled)return false;button.click();return true;"
                    )
                    if not advanced:
                        raise flow.VerificationError(
                            f"student personal self-check page {index + 1} has no working next control"
                        )
                    driver.wait_for(
                        "const doc=document.getElementById('artifact-preview')?.contentDocument;"
                        f"const current=doc?.querySelector('button[aria-label^=\"打开场景 {index + 2}：\"]');"
                        "return Boolean(current?.getAttribute('aria-current')==='step'&&"
                        "doc.querySelector('[data-aisecedu-quiz-self-check=ready]')&&"
                        "!doc.querySelector('[data-aisecedu-self-check-summary]'));",
                        timeout=30,
                        label=f"student personal self-check page {index + 2}",
                    )
            self.ledger.pass_(
                "真实学生浏览器可翻页查看当前课件，并逐页完成三道独立个人自检、分别获得即时反馈"
            )
        finally:
            driver.close()

    def run_teacher_analytics_flow(self) -> None:
        """Have the teacher Agent analyse the actual assignment and simulation evidence."""

        assert self.teacher is not None and self.course is not None
        analytics = self.top_level_api(
            self.teacher,
            "GET",
            f"learning/dojos/{self.course['referenceId']}/analytics",
        )
        summary = analytics.get("summary") or {}
        student = next(
            (
                item
                for item in analytics.get("students") or []
                if item.get("name") == self.student_name
            ),
            None,
        )
        if (
            int(summary.get("participants") or 0) < 1
            or int(summary.get("attempts") or 0) < 1
            or float(summary.get("averageScore") or 0) <= 60
            or student is None
            or int(student.get("attempts") or 0) < 1
            or len(student.get("skills") or []) != 6
        ):
            raise flow.VerificationError(
                "teacher analytics endpoint omitted the real student's evidence"
            )

        def analyse(prompt: str) -> str:
            job, proposals = self.send_agent(prompt)
            self._verify_model_job_route(job, label="teacher learning analysis")
            if any(
                item.get("tool")
                in {"candidate.generate", "challenge.generate", "assignment.generate"}
                for item in proposals
            ):
                raise flow.VerificationError(
                    "learning-analysis request was incorrectly routed to content generation"
                )
            answer = str((job.get("result") or {}).get("answer") or "")
            progress_indexes = [
                index
                for index, item in enumerate(proposals)
                if item.get("tool") == "progress.read"
            ]
            if not answer.strip() and progress_indexes:
                self.execute_course_tool(proposals[progress_indexes[0]])
                continued, _ = self.continue_agent_after_tools(
                    job, [progress_indexes[0]]
                )
                self._verify_model_job_route(
                    continued, label="teacher learning-analysis continuation"
                )
                answer = str((continued.get("result") or {}).get("answer") or "")
            return answer

        overview_prompt = (
            f"请分析课程《{self.course['name']}》当前学情。只依据真实平台数据，"
            f"重点分析学生 {self.student_name} 的完成情况、客观得分、过程证据、六维能力、"
            "风险点以及下一步的分层教学建议；不要生成课件、题目或虚构任何学习记录。"
        )
        answer = analyse(overview_prompt)
        if (
            len(answer) < 120
            or self.student_name not in answer
            or not any(marker in answer for marker in ("完成", "得分", "证据", "能力"))
            or not any(marker in answer for marker in ("建议", "下一步", "分层"))
            or re.search(r"pwn\.college\\{", answer)
        ):
            raise flow.VerificationError(
                "teacher Agent analysis was not specific, evidence-grounded, or safely redacted"
            )

        intervention_prompt = (
            f"请只为学生 {self.student_name} 做一次个体学习诊断与干预建议。"
            "依据当前真实作业、模拟操作重放和六维能力证据，区分客观完成情况与过程表现，"
            "指出需要巩固的能力或风险，并给出下一次30分钟练习的具体顺序；"
            "不要生成新课件、题目或虚构数据。"
        )
        intervention = analyse(intervention_prompt)
        if (
            len(intervention) < 100
            or self.student_name not in intervention
            or not any(marker in intervention for marker in ("能力", "证据", "过程"))
            or not any(
                marker in intervention for marker in ("建议", "练习", "干预", "下一步")
            )
            or re.search(r"pwn\.college\\{", intervention)
        ):
            raise flow.VerificationError(
                "teacher Agent individual intervention analysis was not evidence-grounded or safely redacted"
            )
        self.ledger.pass_(
            "教师智能体基于同一学生的真实作业、模拟、评分和能力证据完成课程全景与个体干预两类学情分析"
        )

    def run(
        self,
        *,
        resume_suffix: str | None = None,
        only_simulation: bool = False,
    ) -> int:
        try:
            if resume_suffix:
                self.setup_resume(resume_suffix)
            else:
                self.setup()
            if only_simulation:
                if not resume_suffix:
                    raise flow.VerificationError(
                        "--only-simulation requires --resume with an isolated retained course"
                    )
                self.run_student_simulation_and_grading_flow()
            else:
                self.run_course_and_assignment_flow()
                self._refresh_course_context()
                self.run_material_flow()
                self._refresh_course_context()
                self.verify_teacher_creation_coverage()
                self.run_native_challenge_flow()
                self.run_generation_flow()
                self.run_artifact_and_classroom_flow()
                self.run_student_courseware_visibility_flow()
                self.run_attack_defense_revision_and_visibility_flow()
                self.run_demonstration_revision_and_visibility_flow()
                self.run_student_simulation_and_grading_flow()
                self.run_student_autonomous_learning_flow()
                self.run_student_browser_preview_flow()
                self.run_teacher_analytics_flow()
        except Exception as error:  # preserve the normal verifier's cleanup rules
            self.ledger.fail(str(error))
        finally:
            self.cleanup()
        print(
            f"SUMMARY passed={len(self.ledger.passed)} failed={len(self.ledger.failed)}",
            flush=True,
        )
        for failure in self.ledger.failed:
            print(f"  - {failure}", flush=True)
        return 1 if self.ledger.failed else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-timeout", type=int, default=1200)
    parser.add_argument("--authoring-timeout", type=int, default=10800)
    parser.add_argument("--keep-data", action="store_true")
    parser.add_argument("--skip-browser", action="store_true")
    parser.add_argument("--resume")
    parser.add_argument("--only-simulation", action="store_true")
    args = parser.parse_args()
    verifier = CompleteTeachingLearningLifecycle(
        job_timeout=max(120, args.job_timeout),
        authoring_timeout=max(900, args.authoring_timeout),
        keep_data=args.keep_data,
        browser=not args.skip_browser,
    )
    return verifier.run(
        resume_suffix=args.resume,
        only_simulation=args.only_simulation,
    )


if __name__ == "__main__":
    raise SystemExit(main())

"""Admission boundary for ordinary course projects on the development copy."""

import os
import re

from .teacher_documents import (
    requests_debate_candidates, requests_explicit_file_delivery, requests_lesson_plan_candidates,
)

from .upstream_turn import ordinary_teaching_course


PIN = "scopedOrdinaryProject"
COURSEWARE_REASON = "teacher_requested_native_courseware"
ROUTES = frozenset({
    "upstream-lesson-plan-candidate",
    "upstream-lesson-plan-materialize",
    "upstream-ordinary-debate-candidate",
    "ordinary-debate-harness",
    "upstream-ordinary-lesson-plan-revise",
})


class WorkerUnavailable(RuntimeError):
    """The current deployment has no consumer for this task."""


def require_consumer(job, teacher_pin):
    if not configured():
        return
    payload = job.payload or {}
    if valid(job) or (job.kind == "agent.chat" and payload.get(teacher_pin)):
        return
    raise WorkerUnavailable("开发站当前没有该操作的后台服务，任务未提交。")


def configured():
    return os.environ.get("AISECEDU_ORDINARY_PROJECTS") == "true"


def enabled(dojo_id):
    return configured() and ordinary_teaching_course(dojo_id)


def requested_kind(prompt):
    if not isinstance(prompt, str):
        return None
    prompt = prompt.strip()
    if requests_lesson_plan_candidates(prompt):
        return "lesson-plan"
    if requests_debate_candidates(prompt):
        return "debate"
    subject = creation_subject(prompt)
    if not subject:
        return None
    if re.search(r"课件|幻灯片|演示文稿|仿真|动态演示|交互演示|互动演示", subject):
        return "slide-deck"
    if requests_explicit_file_delivery(prompt):
        return None
    if re.search(r"(?:课堂辩论|辩论方案|的辩论|一场辩论)", subject):
        return "debate"
    if "教案" in subject:
        return "lesson-plan"
    return None


def creation_subject(prompt):
    command = re.match(
        r"^(?:请(?:你)?\s*)?(?:(?:能不能|可以|我想)\s*)?(?:(?:帮我|给我|为我)\s*)?"
        r"(?:生成|制作|写|设计|做|创建)\s*([^，。！？；：:!?;,\n]{0,80})",
        prompt.strip(),
    )
    return command[1] if command else ""


def unsupported_creation(prompt, artifact_type=None):
    if artifact_type not in (None, "", "auto"):
        return True
    return bool(re.search(r"作业|测验|题库|题组|流程探究|三维|3D|实验工作区", creation_subject(prompt), re.I)
                and not requests_explicit_file_delivery(prompt))


def classify(kind, payload):
    if payload.get("artifactType") == "slide-deck" and (
        (kind == "candidate.generate" and payload.get("generationReason") == COURSEWARE_REASON)
        or (kind == "artifact.materialize" and payload.get("ordinaryCourseware"))
    ):
        return "slide-deck"
    if kind == "candidate.generate" and payload.get("ordinaryCandidateModel"):
        if payload.get("artifactType") in {"lesson-plan", "debate"}:
            return payload["artifactType"]
    if kind == "artifact.materialize" and payload.get("artifactType") == "lesson-plan" and payload.get("ordinaryLessonPlan"):
        return "lesson-plan"
    if kind == "artifact.revise" and payload.get("artifactType") == "lesson-plan" and payload.get("ordinaryLessonPlanRevisionModel"):
        return "lesson-plan"
    if kind in {"artifact.materialize", "artifact.revise"} and payload.get("artifactType") == "debate" and payload.get("ordinaryDebate"):
        return "debate"
    return None


def admit(kind, payload, dojo_id):
    clean = {key: value for key, value in payload.items() if key != PIN}
    project = classify(kind, clean)
    if not (project and enabled(dojo_id)):
        return clean
    require_inputs(clean)
    return {**clean, PIN: project}


def require_inputs(payload):
    if payload.get("sourceRefs") or payload.get("workspaceId"):
        raise ValueError("联调课程项目只使用本轮填写的普通教学内容。请移除引用资料后重新生成。")


def valid(job):
    payload = job.payload or {}
    return (enabled(job.dojo_id) and (job.thread_id or job.kind == "artifact.revise") and not job.action_id
            and payload.get(PIN) is not None and payload[PIN] == classify(job.kind, payload))

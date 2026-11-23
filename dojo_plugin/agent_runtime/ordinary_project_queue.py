"""Admission boundary for ordinary course projects on the development copy."""

import os
import re

from .teacher_documents import (
    requests_debate_candidates, requests_explicit_file_delivery, requests_lesson_plan_candidates,
)

from .upstream_turn import ordinary_teaching_course


PIN = "scopedOrdinaryProject"
ACTION_PIN = "approvedOrdinaryAction"
SCOPED_ACTIONS = frozenset({"publish-teaching-artifact", "control-teaching-session"})
COURSEWARE_REASON = "teacher_requested_native_courseware"
ROUTES = frozenset({
    "upstream-lesson-plan-candidate",
    "upstream-lesson-plan-materialize",
    "upstream-ordinary-debate-candidate",
    "ordinary-debate-harness",
    "upstream-ordinary-lesson-plan-revise",
    "upstream-teacher-turn",
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
    if kind == "agent.command" and payload.get(ACTION_PIN) in SCOPED_ACTIONS:
        return "approved-action"
    if kind == "agent.chat" and payload.get("chatBackend") == "upstream" and payload.get("classroomPreparation"):
        return "classroom"
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
    project = classify(job.kind, payload)
    return (enabled(job.dojo_id) and (job.thread_id or job.kind == "artifact.revise")
            and bool(job.action_id) == (project == "approved-action")
            and project is not None and payload.get(PIN) == project)


def require_approved_action(action, prepared):
    """Limit the scoped consumer to publish and classroom control in the teaching course."""
    args = action.request_json or {}
    if enabled(args.get("dojoId")) and type(args.get("moduleIndex")) is int:
        if action.action_type == "publish-teaching-artifact":
            artifact = prepared["artifact"]
            if (artifact.module_index == args["moduleIndex"] and artifact.self_workspace_id is None
                    and artifact.artifact_type in {"lesson-plan", "debate", "slide-deck"}):
                return
        if action.action_type == "control-teaching-session":
            session = prepared["session"]
            if (session.module_index == args["moduleIndex"]
                    and isinstance((session.state or {}).get("artifactContentHash"), str)
                    and (session.state or {}).get("renderer") == "agent-runtime-stage"):
                return
    raise WorkerUnavailable("开发站仅支持联调课程的教案、课件、辩论发布和已准备课堂的控制操作。")

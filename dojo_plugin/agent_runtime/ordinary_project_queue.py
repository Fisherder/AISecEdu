"""Admission boundary for ordinary course projects on the development copy."""

import os
import re

from .teacher_documents import (
    requests_debate_candidates, requests_explicit_file_delivery, requests_lesson_plan_candidates,
)

from .upstream_turn import ordinary_teaching_course


PIN = "scopedOrdinaryProject"
ROUTES = frozenset({
    "upstream-lesson-plan-candidate",
    "upstream-lesson-plan-materialize",
    "upstream-ordinary-debate-candidate",
    "ordinary-debate-harness",
})


def configured():
    return os.environ.get("AISECEDU_ORDINARY_PROJECTS") == "true"


def enabled(dojo_id):
    return configured() and ordinary_teaching_course(dojo_id)


def requested_kind(prompt):
    if not isinstance(prompt, str):
        return None
    prompt = prompt.strip()
    if requests_explicit_file_delivery(prompt):
        return None
    if requests_lesson_plan_candidates(prompt):
        return "lesson-plan"
    if requests_debate_candidates(prompt):
        return "debate"
    command = re.match(r"^(?:请\s*)?(?:帮我\s*)?(?:生成|制作|写|设计|做)\s*([^，。！？；：:!?;\n]{0,80})", prompt)
    if not command:
        return None
    subject = command[1]
    if re.search(r"(?:课堂辩论|辩论方案|的辩论|一场辩论)", subject):
        return "debate"
    if "教案" in subject:
        return "lesson-plan"
    return None


def classify(kind, payload):
    if kind == "candidate.generate" and payload.get("ordinaryCandidateModel"):
        if payload.get("artifactType") in {"lesson-plan", "debate"}:
            return payload["artifactType"]
    if kind == "artifact.materialize":
        if payload.get("artifactType") == "lesson-plan" and payload.get("ordinaryLessonPlan"):
            return "lesson-plan"
        if payload.get("artifactType") == "debate" and payload.get("ordinaryDebate"):
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
    return (enabled(job.dojo_id) and job.thread_id and not job.action_id
            and payload.get(PIN) is not None and payload[PIN] == classify(job.kind, payload))

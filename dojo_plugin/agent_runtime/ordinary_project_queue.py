"""Admission boundary for ordinary course projects on the development copy."""

import os

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

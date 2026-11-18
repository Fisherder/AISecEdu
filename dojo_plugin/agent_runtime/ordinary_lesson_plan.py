"""Bind ordinary final lesson plans to the teacher's selected, stored proposal."""

import json
import re

from CTFd.models import Users
from sqlalchemy import or_

from .. import config
from ..models import (
    ModelInvocations,
    TeachingArtifactCandidates,
    TeachingArtifactRevisions,
    TeachingAgentThreads,
    TeachingArtifacts,
    TeachingCandidateSets,
    TeachingJobs,
)
from .artifacts import candidate_request_prompt, content_hash
from .materials import build_course_material_context, course_material_grounding_requested
from .scope import ScopeError, build_scope
from .upstream_turn import ordinary_teaching_course, upstream_enabled


BACKEND = "lesson-plan-materialize"
RECEIPT_MODE = "lesson-plan-harness"
GENERATION_REASON = "teacher_requested_ordinary_lesson_plan"
GENERATION_MODEL = "ordinaryCandidateModel"
GENERATION_RECEIPT_MODE = "ordinary-candidate-plan"
_GENERATION_PIN = "ordinaryCandidateAdmission"
_PIN = "ordinaryLessonPlan"
_RECREATE = "当前教案候选、版本或资料无法核验，请重新生成普通教学候选并选择后再试。"
_PLAN_FIELDS = {"type", "objectives", "outline", "activities", "assessment", "sourceGrounding", "experience"}


class OrdinaryLessonPlanError(ValueError):
    pass


def _require_scope(owner_id, dojo_id, module_index, thread_id):
    owner = Users.query.filter_by(id=owner_id).first()
    try:
        if owner is None or not ordinary_teaching_course(dojo_id):
            raise ScopeError("Invalid ordinary course scope")
        build_scope(owner, role="teacher", dojo_id=dojo_id, module_index=module_index)
        if thread_id and not TeachingAgentThreads.query.filter_by(
            id=thread_id, user_id=owner_id, dojo_id=dojo_id, module_index=module_index, status="ACTIVE",
        ).populate_existing().first():
            raise ScopeError("Ordinary teaching conversation has changed")
    except ScopeError as exc:
        raise OrdinaryLessonPlanError(_RECREATE) from exc


def _selection(payload, owner_id, dojo_id, module_index, thread_id, *, replay_job=None):
    _require_scope(owner_id, dojo_id, module_index, thread_id)
    scope = {"owner_id": owner_id, "dojo_id": dojo_id, "module_index": module_index, "self_workspace_id": None}
    artifact = TeachingArtifacts.query.filter_by(
        id=payload.get("artifactId"), artifact_type="lesson-plan", **scope,
    ).populate_existing().first()
    candidate_set = TeachingCandidateSets.query.filter_by(
        id=payload.get("candidateSetId"), thread_id=thread_id, kind="lesson-plan", **scope,
    ).populate_existing().first()
    if artifact is None or candidate_set is None or candidate_set.status != "MATERIALIZED":
        raise OrdinaryLessonPlanError(_RECREATE)
    candidate = TeachingArtifactCandidates.query.filter_by(
        id=candidate_set.selected_candidate_id, candidate_set_id=candidate_set.id,
        materialized_artifact_id=artifact.id,
    ).populate_existing().first()
    if candidate is None or candidate.id != artifact.candidate_id or candidate.status != "MATERIALIZED":
        raise OrdinaryLessonPlanError(_RECREATE)
    if type(payload.get("expectedRevision")) is not int or payload["expectedRevision"] != 1:
        raise OrdinaryLessonPlanError(_RECREATE)
    if artifact.current_revision != 1:
        resumed = replay_job and isinstance((replay_job.result or {}).get("_generationCheckpoint"), dict)
        if not resumed or artifact.current_revision != 2 or not TeachingArtifactRevisions.query.filter_by(
            artifact_id=artifact.id, revision=2, instruction=f"global agent materialization job {replay_job.id}",
        ).first():
            raise OrdinaryLessonPlanError(_RECREATE)
    revision = TeachingArtifactRevisions.query.filter_by(
        artifact_id=artifact.id, revision=1, created_by=owner_id,
    ).populate_existing().first()
    plan = candidate.content
    if (revision is None or not isinstance(plan, dict) or set(plan) != _PLAN_FIELDS
            or plan.get("type") != "lesson-plan" or plan.get("experience") != {"mode": "ordinary-teaching-plan"}
            or content_hash(plan) != revision.content_hash or revision.content != plan):
        raise OrdinaryLessonPlanError(_RECREATE)
    encoded = json.dumps(plan, ensure_ascii=False)
    if len(encoded) > 120_000 or not isinstance(plan["sourceGrounding"], list):
        raise OrdinaryLessonPlanError(_RECREATE)
    source_refs = candidate_set.source_refs
    if not isinstance(source_refs, list) or revision.source_refs != source_refs or any(
        not isinstance(ref, dict) or ref.get("type") != "material"
        or not isinstance(ref.get("id"), str) or not ref["id"]
        or not isinstance(ref.get("revisionId"), str) or not ref["revisionId"]
        or not re.fullmatch(r"[a-f0-9]{64}", str(ref.get("sha256") or ""))
        for ref in source_refs
    ):
        raise OrdinaryLessonPlanError(_RECREATE)
    if any(not isinstance(row, dict) or not isinstance(row.get("materialId"), str)
           for row in plan["sourceGrounding"]):
        raise OrdinaryLessonPlanError(_RECREATE)
    ids = {ref["id"] for ref in source_refs}
    citations = [row["materialId"] for row in plan["sourceGrounding"]]
    if len(ids) != len(source_refs) or len(ids) != len(citations) or ids != set(citations):
        raise OrdinaryLessonPlanError(_RECREATE)
    return artifact, candidate, candidate_set, revision


def _generation_receipt(candidate_set, generation_job_id=None, *, required=True):
    rows = ModelInvocations.query.join(TeachingJobs, TeachingJobs.id == ModelInvocations.job_id).filter(
        TeachingJobs.kind == "candidate.generate",
        TeachingJobs.owner_id == candidate_set.owner_id,
        TeachingJobs.dojo_id == candidate_set.dojo_id,
        TeachingJobs.module_index == candidate_set.module_index,
        TeachingJobs.thread_id == candidate_set.thread_id,
        TeachingJobs.payload["candidateSetId"].as_string() == candidate_set.id,
        ModelInvocations.owner_id == candidate_set.owner_id,
        ModelInvocations.status == "SUCCEEDED",
        ModelInvocations.provider == "deepseek",
        ModelInvocations.degraded.is_(False),
        ModelInvocations.parameters["executionMode"].as_string() == "ordinary-candidate-plan",
    )
    if generation_job_id:
        rows = rows.filter(TeachingJobs.id == generation_job_id)
    # The single-candidate worker queues its child while committing the generation.
    # Only that child records a parent currently finishing that exact set.
    state = TeachingJobs.status == "SUCCEEDED"
    if generation_job_id:
        state = or_(state, TeachingJobs.status == "RUNNING")
    receipt = rows.filter(state).order_by(ModelInvocations.created.desc()).first()
    if receipt is None or not receipt.actual_model:
        if required:
            raise OrdinaryLessonPlanError(_RECREATE)
        return None
    return receipt


def admit(payload, owner_id, dojo_id, module_index, thread_id):
    clean = {key: value for key, value in payload.items() if key != _PIN}
    if clean.get("artifactType") != "lesson-plan" or clean.get("workspaceId") or dojo_id is None:
        return clean
    if not ordinary_teaching_course(dojo_id):
        selected = _generation_set(clean, owner_id, dojo_id, module_index, thread_id)
        if selected is not None:
            candidate = TeachingArtifactCandidates.query.filter_by(
                id=selected.selected_candidate_id, candidate_set_id=selected.id,
                materialized_artifact_id=clean.get("artifactId"),
            ).populate_existing().first()
            marked = (selected.request_json or {}).get(_GENERATION_PIN)
            plan = candidate.content if candidate is not None else None
            previously_ordinary = (
                isinstance(plan, dict) and plan.get("experience") == {"mode": "ordinary-teaching-plan"}
                and _generation_receipt(selected, clean.get("parentGenerationJobId"), required=False) is not None
            )
            if marked or previously_ordinary:
                raise OrdinaryLessonPlanError("课程的普通教案生成授权已变化，请联系课程管理员后重新发起。")
        return clean
    artifact, candidate, candidate_set, revision = _selection(clean, owner_id, dojo_id, module_index, thread_id)
    receipt = _generation_receipt(candidate_set, clean.get("parentGenerationJobId"))
    if not upstream_enabled() or not config.HARNESS_DEEPSEEK_MODEL:
        raise OrdinaryLessonPlanError("普通教案服务暂未启用，请联系课程管理员后重新发起。")
    prompt = candidate_request_prompt(candidate_set)
    return {
        **clean,
        "allowDegraded": False,
        _PIN: {
            "candidateId": candidate.id,
            "candidateSetId": candidate_set.id,
            "artifactId": artifact.id,
            "revisionId": revision.id,
            "contentHash": revision.content_hash,
            "referenceHash": content_hash({"title": artifact.title, "prompt": prompt, "sources": revision.source_refs}),
            "generationJobId": receipt.job_id,
            "generationInvocationId": receipt.id,
            "model": config.HARNESS_DEEPSEEK_MODEL,
        },
    }


def pinned(payload):
    return _PIN in payload


def prepare(job, payload):
    pin = payload.get(_PIN)
    if (not isinstance(pin, dict) or not upstream_enabled() or not pin.get("model")
            or pin["model"] != config.HARNESS_DEEPSEEK_MODEL):
        raise OrdinaryLessonPlanError("普通教案服务或指定模型已变化，请重新发起生成。")
    artifact, candidate, candidate_set, revision = _selection(
        payload, job.owner_id, job.dojo_id, job.module_index, job.thread_id, replay_job=job,
    )
    receipt = _generation_receipt(candidate_set, pin.get("generationJobId"))
    prompt = candidate_request_prompt(candidate_set)
    if (candidate.id, candidate_set.id, artifact.id, revision.id, revision.content_hash,
            content_hash({"title": artifact.title, "prompt": prompt, "sources": revision.source_refs}), receipt.id) != (
            pin.get("candidateId"), pin.get("candidateSetId"), pin.get("artifactId"), pin.get("revisionId"),
            pin.get("contentHash"), pin.get("referenceHash"), pin.get("generationInvocationId"),
    ):
        raise OrdinaryLessonPlanError(_RECREATE)
    refs = revision.source_refs
    if not refs and course_material_grounding_requested(prompt):
        raise OrdinaryLessonPlanError(_RECREATE)
    context = build_course_material_context(
        owner_id=job.owner_id, dojo_id=job.dojo_id if refs else None,
        source_refs=refs, prompt=prompt, require_complete=bool(refs),
    )
    if (context["coverage"]["complete"] is not True
            or {ref["id"]: (ref.get("revisionId"), ref.get("sha256")) for ref in context["sourceRefs"]}
            != {ref["id"]: (ref["revisionId"], ref["sha256"]) for ref in refs}
            or any(not re.search(r"\.(?:txt|md|markdown|pdf|docx|pptx)$", item.get("filename") or "", re.I)
                   for item in context["sourceMaterials"])):
        raise OrdinaryLessonPlanError(_RECREATE)
    coverage = {
        "complete": True,
        "expectedMaterialCount": len(refs),
        "materialIds": [ref["id"] for ref in refs],
    }
    materials = []
    for source in context["sourceMaterials"]:
        summary = source["analysis"].get("summary")
        if not isinstance(summary, str) or not summary.strip() or len(summary) > 4000:
            raise OrdinaryLessonPlanError(_RECREATE)
        materials.append({
            "id": source["id"], "title": source["title"], "analysis": {"summary": summary},
            "coverage": {"complete": True},
        })
    return {
        _PIN: pin, "allowDegraded": False, "artifactId": artifact.id, "candidateSetId": candidate_set.id,
        "artifactType": "lesson-plan", "expectedRevision": 1, "title": artifact.title,
        "plan": revision.content, **({"requestPrompt": prompt} if prompt.strip() else {}),
        "materialContext": coverage, "materialDossier": {"coverage": coverage, "materials": materials},
    }


def wire_payload(payload):
    return {key: value for key, value in payload.items() if key not in {_PIN, "allowDegraded"}}


def pinned_model(payload):
    return (payload.get(_PIN) or {}).get("model")


def validate_receipt(route, response):
    meta = response.get("model") or {}
    if (meta.get("executionMode") != RECEIPT_MODE or meta.get("provider") != "deepseek"
            or meta.get("degraded") is True or meta.get("actualModel") != route.get("required_model")):
        raise OrdinaryLessonPlanError("普通教案未取得指定 Harness 模型的成功回执。")
    result = response["result"]
    content = result.get("content")
    validation = result.get("validation")
    if (not isinstance(content, dict) or content.get("schema") != "aisecedu.global-agent.artifact.v1"
            or content.get("artifactType") != "lesson-plan" or content.get("renderer") != "agent-runtime-stage"
            or not isinstance(content.get("plan"), dict) or not isinstance(content.get("lesson"), dict)
            or not isinstance(validation, dict) or validation.get("status") != "GENERATED"
            or validation.get("fallbackCount") != 0):
        raise OrdinaryLessonPlanError("普通教案没有返回可保存的课堂产物。")


def _generation_set(payload, owner_id, dojo_id, module_index, thread_id):
    return TeachingCandidateSets.query.filter_by(
        id=payload.get("candidateSetId"), owner_id=owner_id, dojo_id=dojo_id,
        module_index=module_index, thread_id=thread_id, self_workspace_id=None, kind="lesson-plan",
    ).populate_existing().first()


def explicit_generation(payload):
    return payload.get("generationReason") == GENERATION_REASON or GENERATION_MODEL in payload


def admit_generation(payload, owner_id, dojo_id, module_index, thread_id):
    if not explicit_generation(payload):
        return payload
    candidate_set = _generation_set(payload, owner_id, dojo_id, module_index, thread_id)
    model = payload.get(GENERATION_MODEL)
    if (not model or model != config.HARNESS_DEEPSEEK_MODEL or candidate_set is None
            or payload.get("generationReason") != GENERATION_REASON or payload.get("artifactType") != "lesson-plan"
            or payload.get("workspaceId") or not ordinary_teaching_course(dojo_id) or not upstream_enabled()):
        raise OrdinaryLessonPlanError("普通教案候选服务或指定模型已变化，请重新发起。")
    _require_scope(owner_id, dojo_id, module_index, thread_id)
    candidate_set.request_json = {**(candidate_set.request_json or {}), _GENERATION_PIN: model}
    return {**payload, "allowDegraded": False}


def generation_model(job, payload, authorized_scope):
    if job.kind != "candidate.generate":
        return None
    explicit = explicit_generation(payload)
    if not explicit and payload.get("artifactType") != "lesson-plan":
        return None
    # A saved set pin also fences retry if a payload control field disappears.
    candidate_set = _generation_set(payload, job.owner_id, job.dojo_id, job.module_index, job.thread_id)
    saved = (candidate_set.request_json or {}).get(_GENERATION_PIN) if candidate_set else None
    if saved is None and not explicit:
        return None
    model = payload.get(GENERATION_MODEL)
    if (not model or model != saved or model != config.HARNESS_DEEPSEEK_MODEL
            or payload.get("generationReason") != GENERATION_REASON or authorized_scope != "candidate-plan"
            or payload.get("artifactType") != "lesson-plan" or payload.get("workspaceId")):
        raise OrdinaryLessonPlanError("普通教案候选的课程权限或指定 Harness 模型已变化，请重新发起。")
    _require_scope(job.owner_id, job.dojo_id, job.module_index, job.thread_id)
    return model


def validate_generation_receipt(route, response):
    meta = response.get("model") or {}
    if (meta.get("executionMode") != GENERATION_RECEIPT_MODE or meta.get("provider") != "deepseek"
            or meta.get("degraded") is True or meta.get("actualModel") != route.get("required_model")):
        raise OrdinaryLessonPlanError("普通教案候选未取得指定 Harness 模型的成功回执。")

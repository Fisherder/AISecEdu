"""Bind ordinary debate planning to the teacher's stored candidate request."""

import re

from CTFd.models import Users

from .. import config
from ..models import TeachingAgentThreads, TeachingArtifactCandidates, TeachingCandidateSets
from .artifacts import content_hash
from .model_router import UPSTREAM_DEBATE_CANDIDATE_ROUTE, route_model
from .materials import (
    build_course_material_context, course_material_grounding_requested, singular_material_reference_requested,
)
from .ordinary_debate import _plan
from .scope import ScopeError, build_scope
from .ordinary_project_queue import enabled as scoped_project_enabled
from .upstream_turn import ordinary_teaching_course, upstream_enabled


REASON = "teacher_requested_ordinary_debate"
MODEL = "ordinaryCandidateModel"
SCOPE = "candidate-plan"
MODE = "ordinary-candidate-plan"
_PIN = "ordinaryDebateCandidateAdmission"
_CONFLICT = "普通辩论候选的课程权限、请求、资料或指定模型已变化，请重新发起。"
_IDENTITY = re.compile(r"[A-Za-z0-9_-]{1,128}")
_HASH = re.compile(r"[a-f0-9]{64}")
_DISALLOWED_TEXT = re.compile(
    r"[<>\x00-\x08\x0b\x0c\x0e-\x1f]|`|~{3,}|(?:https?|ftp|file|data|javascript):"
    r"|靶场|攻防演练|漏洞复现|漏洞利用|攻击步骤|可执行载荷|\b(?:ctf|exploit)\b",
    re.I,
)


def _require(condition):
    if not condition:
        raise ValueError(_CONFLICT)


def _identity(value):
    return isinstance(value, str) and _IDENTITY.fullmatch(value)


def _hash(value):
    return isinstance(value, str) and _HASH.fullmatch(value)


def _prose(value, limit):
    return isinstance(value, str) and 0 < len(value.strip().encode("utf-16-le")) // 2 <= limit and not _DISALLOWED_TEXT.search(value)


def explicit(payload):
    return payload.get("generationReason") == REASON or _PIN in payload or (
        MODEL in payload and payload.get("artifactType") == "debate"
    )


def _candidate_set(payload, scope, *, lock=False):
    query = TeachingCandidateSets.query.filter_by(id=payload.get("candidateSetId"), **scope)
    return (query.with_for_update() if lock else query).populate_existing().first()


def _refs(source_refs):
    _require(isinstance(source_refs, list) and len(source_refs) <= 80)
    refs = []
    ids = set()
    for source in source_refs:
        _require(isinstance(source, dict) and source.get("type") == "material"
                 and _identity(source.get("id")) and source["id"] not in ids
                 and _identity(source.get("revisionId")) and _hash(source.get("sha256")))
        refs.append({key: source[key] for key in ("type", "id", "revisionId", "sha256")})
        ids.add(source["id"])
    return refs


def _derived(request, candidate_set, scope, refs, *, lock=False):
    parent_id = request.get("parentSetId")
    selected = request.get("selectedCandidateHashes")
    if parent_id is None and selected is None:
        return None
    _require(_identity(parent_id) and parent_id != candidate_set.id
             and isinstance(selected, dict) and 1 <= len(selected) <= 4
             and all(_identity(key) and _hash(value) for key, value in selected.items()))
    parent = _candidate_set({"candidateSetId": parent_id}, scope, lock=lock)
    _require(parent is not None and parent.kind == "debate" and isinstance(parent.source_refs, list)
             and len(parent.source_refs) == len(refs))
    versions = {ref["id"]: ref for ref in refs}
    source_ids = set()
    for ref in parent.source_refs:
        _require(isinstance(ref, dict) and ref.get("type") == "material" and _identity(ref.get("id"))
                 and ref["id"] in versions and ref["id"] not in source_ids
                 and all(key not in ref or ref[key] == versions[ref["id"]][key] for key in ("revisionId", "sha256")))
        source_ids.add(ref["id"])
    for candidate_id, digest in selected.items():
        query = TeachingArtifactCandidates.query.filter_by(id=candidate_id, candidate_set_id=parent.id)
        row = (query.with_for_update() if lock else query).populate_existing().first()
        _require(row is not None and content_hash(row.content) == digest)
    return {"parentSetId": parent_id, "selectedCandidateHashes": selected}


def _check(payload, owner_id, dojo_id, module_index, thread_id, *, admitting=False, lock=False):
    scope = dict(owner_id=owner_id, dojo_id=dojo_id, module_index=module_index, thread_id=thread_id,
                 self_workspace_id=None)
    candidate_set = _candidate_set(payload, scope, lock=lock)
    request = (candidate_set.request_json or {}) if candidate_set is not None else {}
    _require(isinstance(request, dict))
    saved = request.get(_PIN)
    if not explicit(payload) and saved is None and request.get("generationReason") != REASON:
        return None
    model = payload.get(MODEL)
    _require(candidate_set is not None and candidate_set.kind == payload.get("artifactType") == "debate"
             and not payload.get("workspaceId") and thread_id and dojo_id is not None
             and payload.get("allowDegraded") is False
             and ordinary_teaching_course(dojo_id) and (upstream_enabled() or scoped_project_enabled(dojo_id))
             and isinstance(model, str) and model and model == config.HARNESS_DEEPSEEK_MODEL
             and payload.get("generationReason") == request.get("generationReason") == REASON)
    owner = Users.query.filter_by(id=owner_id).populate_existing().first()
    _require(owner is not None)
    try:
        build_scope(owner, role="teacher", dojo_id=dojo_id, module_index=module_index)
    except ScopeError as exc:
        raise ValueError(_CONFLICT) from exc
    _require(TeachingAgentThreads.query.filter_by(id=thread_id, user_id=owner_id, dojo_id=dojo_id,
                                                   module_index=module_index, status="ACTIVE")
             .populate_existing().first() is not None)
    count = payload.get("candidateCount")
    mode = payload.get("generationMode")
    prompt = payload.get("prompt")
    _require(type(count) is int and 1 <= count <= 4 and type(request.get("candidateCount")) is int
             and count == request["candidateCount"]
             and mode == request.get("generationMode") == ("single" if count == 1 else "multiple")
             and _prose(prompt, 16000) and prompt == request.get("prompt"))
    refs = _refs(candidate_set.source_refs)
    _require(_refs(payload.get("sourceRefs")) == refs
             and (refs or not (course_material_grounding_requested(prompt)
                               or singular_material_reference_requested(prompt))))
    provenance = _derived(request, candidate_set, scope, refs, lock=lock)
    pin = content_hash({
        "candidateSetId": candidate_set.id, "scope": scope, "model": model,
        "prompt": prompt, "count": count, "mode": mode, "refs": refs, "parent": provenance,
        "selection": request.get("generationSelection"),
    })
    if admitting and saved is None:
        _require(_PIN not in payload)
        candidate_set.request_json = {**request, _PIN: pin}
    else:
        _require(saved == pin == payload.get(_PIN))
    return pin, refs


def admit(payload, owner_id, dojo_id, module_index, thread_id):
    value = _check(payload, owner_id, dojo_id, module_index, thread_id, admitting=True, lock=explicit(payload))
    return {**payload, _PIN: value[0]} if value is not None else payload


def prepare(job, payload=None, *, lock=False):
    if job.kind != "candidate.generate":
        return None
    payload = dict(job.payload or {}) if payload is None else payload
    value = _check(payload, job.owner_id, job.dojo_id, job.module_index, job.thread_id, lock=lock)
    if value is None:
        return None
    pin, refs = value
    materials = []
    if refs:
        context = build_course_material_context(
            owner_id=job.owner_id, dojo_id=job.dojo_id, source_refs=refs,
            prompt=payload["prompt"], require_complete=True,
        )
        versions = {row["id"]: row for row in refs}
        _require(context["coverage"]["complete"] is True
                 and {row["id"]: row for row in _refs(context["sourceRefs"])} == versions)
        for row in context["sourceMaterials"]:
            summary = (row.get("analysis") or {}).get("summary")
            _require(row.get("id") in versions and _prose(summary, 4000) and _prose(row.get("title"), 160)
                     and re.search(r"\.(?:txt|md|markdown|pdf|docx|pptx)$", row.get("filename") or "", re.I))
            source = versions[row["id"]]
            materials.append({
                "id": row["id"], "revisionId": source["revisionId"], "sha256": source["sha256"],
                "title": row["title"], "analysis": {"summary": summary}, "coverage": {"complete": True},
            })
        _require(len(materials) == len(refs) and {row["id"] for row in materials} == set(versions))
    coverage = {"complete": True, "expectedMaterialCount": len(refs), "materialIds": [ref["id"] for ref in refs]}
    return {
        _PIN: pin, "allowDegraded": False,
        **{key: payload[key] for key in (
            "candidateSetId", "prompt", "artifactType", "candidateCount", "generationMode", "generationReason", MODEL,
        )},
        "sourceRefs": refs, "materialContext": coverage,
        "materialDossier": {"coverage": coverage, "materials": materials},
    }


def wire_payload(payload):
    return {key: value for key, value in payload.items() if key not in {_PIN, "allowDegraded"}}


def require_current(job, prepared, *, lock=False):
    _require(prepare(job, lock=lock) == prepared)


def validate_result(payload, result):
    _require(isinstance(result, dict) and isinstance(result.get("candidates"), list)
             and len(result["candidates"]) == payload["candidateCount"])
    aliases = {ref["id"]: ref["id"] for ref in payload["sourceRefs"]}
    for row in result["candidates"]:
        _require(isinstance(row, dict) and isinstance(row.get("content"), dict)
                 and row["content"].get("type") == "debate")
        _plan(row["content"], row.get("title"), aliases)


def validate_receipt(route, payload, response):
    model = response.get("model")
    _require(isinstance(model, dict))
    _require_model(route.get("required_model"), payload, model)
    validate_result(payload, response.get("result"))


def _require_model(required, payload, model):
    usage = model.get("usage")
    _require(isinstance(usage, dict))
    _require(model.get("executionMode") == MODE and model.get("provider") == "deepseek"
             and model.get("degraded") is False
             and model.get("actualModel") == required == payload[MODEL]
             and all(type(usage.get(key)) is int and usage[key] > 0
                     for key in ("inputTokens", "outputTokens", "totalTokens"))
             and usage["totalTokens"] == usage["inputTokens"] + usage["outputTokens"])


def require_invocation(job, payload, invocation):
    route = route_model(job.kind, prompt=payload["prompt"], payload=payload)
    _require(invocation is not None and invocation.job_id == job.id and invocation.owner_id == job.owner_id
             and invocation.route == UPSTREAM_DEBATE_CANDIDATE_ROUTE and invocation.request_hash == route["request_hash"]
             and invocation.status == "SUCCEEDED")
    _require_model(route["required_model"], payload, {
        "executionMode": (invocation.parameters or {}).get("executionMode"),
        "provider": invocation.provider, "actualModel": invocation.actual_model,
        "degraded": invocation.degraded, "usage": invocation.usage,
    })

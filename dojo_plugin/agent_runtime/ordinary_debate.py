"""Build teacher debate jobs from owned records and apply revisions to their frozen source."""

import copy
import datetime
import json
import re

from CTFd.models import Users

from .. import config
from ..models import (
    TeachingAgentThreads, TeachingArtifactCandidates, TeachingArtifactRevisions,
    TeachingArtifacts, TeachingCandidateSets,
)
from .artifacts import candidate_request_prompt, content_hash
from .materials import build_course_material_context, course_material_grounding_requested
from .scope import ScopeError, build_scope
from .ordinary_project_queue import enabled as scoped_project_enabled
from .upstream_turn import ordinary_teaching_course, upstream_enabled


SCOPE = "debate-authoring"
BACKEND = "ordinary-debate-harness-v1"
MODE = "ordinary-debate-harness"
_PIN = "ordinaryDebate"
_CONFLICT = "辩论活动的课程权限、来源或版本已变化，请重新打开活动后再试。"
_KINDS = {"artifact.materialize", "artifact.revise"}


class OrdinaryDebateError(ValueError):
    pass


def _require(condition):
    if not condition:
        raise OrdinaryDebateError(_CONFLICT)


def pinned(payload):
    return _PIN in payload


def _debate_item(content):
    lesson = content.get("lesson") if isinstance(content, dict) else None
    items = lesson.get("artifacts") if isinstance(lesson, dict) else None
    _require(isinstance(items, list))
    matches = [item for item in items if isinstance(item, dict) and isinstance(item.get("content"), dict)
               and "debate" in item["content"]]
    _require(len(matches) == 1)
    spec = matches[0]["content"]["debate"]
    _require(isinstance(spec, dict) and spec.get("schema") in {"debate-v1", "debate-v2"})
    return matches[0]


def _read(kind, payload, owner_id, dojo_id, module_index, thread_id, *, lock=False):
    _require(kind in _KINDS and ordinary_teaching_course(dojo_id) and (upstream_enabled() or scoped_project_enabled(dojo_id))
             and config.HARNESS_DEEPSEEK_MODEL and not payload.get("workspaceId"))
    owner = Users.query.filter_by(id=owner_id).populate_existing().first()
    _require(owner is not None)
    try:
        build_scope(owner, role="teacher", dojo_id=dojo_id, module_index=module_index)
    except ScopeError as exc:
        raise OrdinaryDebateError(_CONFLICT) from exc
    if thread_id is not None:
        _require(TeachingAgentThreads.query.filter_by(
            id=thread_id, user_id=owner_id, dojo_id=dojo_id, module_index=module_index, status="ACTIVE",
        ).populate_existing().first() is not None)
    scope = dict(owner_id=owner_id, dojo_id=dojo_id, module_index=module_index, self_workspace_id=None)
    query = TeachingArtifacts.query.filter_by(id=payload.get("artifactId"), artifact_type="debate", **scope)
    artifact = (query.with_for_update() if lock else query).populate_existing().first()
    expected = payload.get("expectedRevision")
    _require(type(expected) is int and expected > 0 and artifact is not None and artifact.current_revision == expected)
    revision = TeachingArtifactRevisions.query.filter_by(
        artifact_id=artifact.id, revision=expected, created_by=owner_id,
    ).populate_existing().first()
    _require(revision is not None and isinstance(revision.content, dict)
             and revision.content_hash == content_hash(revision.content))
    pin = {"model": config.HARNESS_DEEPSEEK_MODEL, "kind": kind, "revisionId": revision.id,
           "contentHash": revision.content_hash, "scope": [owner_id, dojo_id, module_index, thread_id]}
    source = {"artifactId": artifact.id, "expectedRevision": expected, "refs": revision.source_refs}
    selection = None
    if kind == "artifact.materialize":
        selection = TeachingCandidateSets.query.filter_by(
            id=payload.get("candidateSetId"), thread_id=thread_id, kind="debate", **scope,
        ).populate_existing().first()
        _require(expected == 1 and selection is not None and selection.status == "MATERIALIZED"
                 and selection.selected_candidate_id == artifact.candidate_id and artifact.candidate_id
                 and selection.source_refs == revision.source_refs)
        candidate = TeachingArtifactCandidates.query.filter_by(
            id=artifact.candidate_id, candidate_set_id=selection.id, materialized_artifact_id=artifact.id,
            status="MATERIALIZED",
        ).populate_existing().first()
        _require(candidate is not None and candidate.content == revision.content)
        source.update(candidate=candidate.id, selection=selection.id, title=artifact.title,
                      prompt=candidate_request_prompt(selection))
    else:
        _debate_item(revision.content)
        instruction = payload.get("instruction")
        _require(isinstance(instruction, str) and instruction.strip() and len(instruction) <= 16000)
        source["instruction"] = instruction
    pin["sourceHash"] = content_hash(source)
    return pin, artifact, revision, selection


def admit(kind, payload, owner_id, dojo_id, module_index, thread_id):
    clean = {key: value for key, value in payload.items() if key not in {_PIN, "debateAuthoringBackend"}}
    if (kind not in _KINDS or clean.get("artifactType") != "debate" or clean.get("workspaceId")
            or not ordinary_teaching_course(dojo_id)):
        return clean
    pin, _, _, _ = _read(kind, clean, owner_id, dojo_id, module_index, thread_id)
    return {**clean, _PIN: pin, "allowDegraded": False}


def _bound(job, payload, *, lock=False):
    pin, artifact, revision, selection = _read(
        job.kind, payload, job.owner_id, job.dojo_id, job.module_index, job.thread_id, lock=lock,
    )
    _require(pin == payload.get(_PIN) == (job.payload or {}).get(_PIN))
    return artifact, revision, selection


def _lines(values):
    _require(isinstance(values, list) and all(isinstance(v, str) and v.strip() for v in values))
    return values


def _plan(content, title, aliases):
    plan = {"type": "debate", "title": title}
    if isinstance(content.get("summary"), str) and content["summary"].strip():
        plan["summary"] = content["summary"]
    if "objectives" in content:
        plan["objectives"] = _lines(content["objectives"])
    for section, keys in (("outline", ("title", "description")), ("activities", ("title", "instruction"))):
        if section not in content:
            continue
        _require(isinstance(content[section], list))
        rows = []
        for raw in content[section]:
            _require(isinstance(raw, dict))
            row = {key: raw[key] for key in keys if isinstance(raw.get(key), str) and raw[key].strip()}
            _require("title" in row and (section != "activities" or "instruction" in row))
            if section == "outline" and "keyPoints" in raw:
                row["keyPoints"] = _lines(raw["keyPoints"])
            rows.append(row)
        plan[section] = rows
    if "assessment" in content:
        assessment = content["assessment"]
        _require(isinstance(assessment, dict))
        if "criteria" in assessment:
            plan["assessment"] = {"criteria": _lines(assessment["criteria"])}
    grounding = content.get("sourceGrounding", [])
    _require(isinstance(grounding, list))
    citations = []
    for row in grounding:
        _require(isinstance(row, dict) and isinstance(row.get("materialId"), str) and row["materialId"] in aliases)
        citations.append({"materialId": aliases[row["materialId"]], "uses": _lines(row.get("uses"))})
    _require(len(citations) == len(aliases) and {row["materialId"] for row in citations} == set(aliases.values()))
    if citations:
        plan["sourceGrounding"] = citations
    return plan


def _creation(artifact, revision, selection):
    prompt = candidate_request_prompt(selection)
    _require(prompt.strip())
    refs = revision.source_refs
    _require(isinstance(refs, list) and len(refs) <= 80)
    versions = {}
    for ref in refs:
        _require(isinstance(ref, dict) and ref.get("type") == "material" and isinstance(ref.get("id"), str)
                 and ref["id"] and ref["id"] not in versions and isinstance(ref.get("revisionId"), str)
                 and ref["revisionId"] and re.fullmatch(r"[a-f0-9]{64}", str(ref.get("sha256") or "")))
        versions[ref["id"]] = (ref["revisionId"], ref["sha256"])
    aliases = {key: f"material-{i}" for i, key in enumerate(versions, 1)}
    result = {"requestPrompt": prompt, "plan": _plan(revision.content, artifact.title, aliases)}
    if not refs:
        _require(not course_material_grounding_requested(prompt))
        return result
    context = build_course_material_context(owner_id=artifact.owner_id, dojo_id=artifact.dojo_id,
                                            source_refs=refs, prompt=prompt, require_complete=True)
    _require(context["coverage"]["complete"] is True and versions == {
        ref["id"]: (ref.get("revisionId"), ref.get("sha256")) for ref in context["sourceRefs"]
    })
    materials = []
    for row in context["sourceMaterials"]:
        summary = (row.get("analysis") or {}).get("summary")
        _require(row.get("id") in aliases and isinstance(summary, str) and 0 < len(summary.strip()) <= 4000
                 and re.search(r"\.(?:txt|md|markdown|pdf|docx|pptx)$", row.get("filename") or "", re.I))
        materials.append({"id": aliases[row["id"]], "title": row["title"], "analysis": {"summary": summary},
                          "coverage": {"complete": True}})
    _require(len(materials) == len(aliases) and {m["id"] for m in materials} == set(aliases.values()))
    coverage = {"complete": True, "expectedMaterialCount": len(refs), "materialIds": list(aliases.values())}
    return {**result, "materialContext": coverage, "materialDossier": {"coverage": coverage, "materials": materials}}


def prepare(job, payload):
    artifact, revision, selection = _bound(job, payload)
    if selection is not None:
        fields = _creation(artifact, revision, selection)
    else:
        content = revision.content
        spec = _debate_item(content)["content"]["debate"]
        history = content.get("debateRevisionHistory", [])
        _require(isinstance(history, list))
        paths = []
        for entry in history[-16:]:
            _require(isinstance(entry, dict) and isinstance(entry.get("changes"), list))
            changes = []
            for change in entry["changes"]:
                _require(isinstance(change, dict) and isinstance(change.get("path"), str))
                changes.append({"path": change["path"]})
            paths.append({"changes": changes})
        fields = {"instruction": payload["instruction"], "currentContent": {
            "lesson": {"artifacts": [{"content": {"debate": spec}}]}, "debateRevisionHistory": paths}}
    return {_PIN: payload[_PIN], "allowDegraded": False, "debateAuthoringBackend": BACKEND,
            "artifactType": "debate", "artifactId": artifact.id, "expectedRevision": revision.revision, **fields}


def wire_payload(payload):
    return {key: value for key, value in payload.items() if key not in {_PIN, "allowDegraded"}}


def validate_receipt(route, response):
    meta = response.get("model") or {}
    usage = meta.get("usage") or {}
    _require(meta.get("executionMode") == MODE and meta.get("provider") == "deepseek"
             and meta.get("actualModel") == route.get("required_model") and meta.get("degraded") is False
             and all(type(usage.get(k)) is int and usage[k] >= 0 for k in ("inputTokens", "outputTokens", "totalTokens"))
             and usage["inputTokens"] > 0 and usage["outputTokens"] > 0
             and usage["totalTokens"] == usage["inputTokens"] + usage["outputTokens"]
             and isinstance(response.get("result"), dict))


def content_for_save(job, result):
    artifact, revision, selection = _bound(job, job.payload, lock=True)
    if selection is not None:
        _creation(artifact, revision, selection)
        content = result.get("content")
        validation = result.get("validation") or {}
        _require(isinstance(content, dict) and content.get("schema") == "aisecedu.global-agent.artifact.v1"
                 and content.get("artifactType") == "debate" and content.get("renderer") == "agent-runtime-stage"
                 and validation.get("status") == "GENERATED" and validation.get("fallbackCount") == 0)
        _require(_debate_item(content)["content"]["debate"].get("schema") == "debate-v2")
        return {**content, "plan": revision.content}
    content = copy.deepcopy(revision.content)
    item = _debate_item(content)
    spec = result.get("spec")
    _require(set(result) == {"spec", "summary", "changes", "changedFields", "changedPaths"}
             and isinstance(spec, dict) and spec.get("schema") == "debate-v2"
             and all(isinstance(spec.get(k), str) for k in ("title", "scenario", "motion"))
             and isinstance(spec.get("objectives"), list) and isinstance(result["summary"], str)
             and all(isinstance(result[k], list) and result[k] for k in ("changes", "changedFields", "changedPaths")))
    now = datetime.datetime.now(datetime.timezone.utc)
    item["title"] = spec["title"]
    item["outline"] = {**(item.get("outline") or {}), "title": spec["title"],
                       "description": spec["scenario"], "keyPoints": spec["objectives"]}
    item["content"]["debate"] = spec
    content["lesson"].update(title=spec["title"], description=spec["motion"], updatedAt=int(now.timestamp() * 1000))
    instruction = job.payload["instruction"]
    content["debateRevisionHistory"] = [*content.get("debateRevisionHistory", []), {
        "instruction": instruction, "summary": result["summary"], "changes": result["changes"],
        "appliedAt": now.isoformat().replace("+00:00", "Z"),
    }][-64:]
    content["revisionMetadata"] = {"mode": "debate-patch-v2", "instruction": instruction,
                                   **{k: result[k] for k in ("summary", "changedFields", "changedPaths")}}
    return content


def require_invocation(job, invocation):
    _require(invocation is not None and invocation.job_id == job.id and invocation.owner_id == job.owner_id
             and invocation.route == MODE and invocation.provider == "deepseek" and not invocation.degraded
             and invocation.actual_model == job.payload[_PIN]["model"]
             and (invocation.parameters or {}).get("executionMode") == MODE)


def derived_prompt(instruction, candidates, refs):
    """Quote the selected classroom plans without copying internal candidate or material records."""
    aliases = {ref["id"]: f"material-{index}" for index, ref in enumerate(refs, 1)}
    selected = [_plan(row.content, row.title, aliases) for row in candidates]
    quoted = json.dumps(selected, ensure_ascii=False, separators=(",", ":"))
    prompt = f"教师的派生要求：{instruction}\n以下是所选辩论方案的教学内容，作为本次改写的参考：\n{quoted}"
    if len(prompt) > 16000:
        raise OrdinaryDebateError("所选方案和派生要求合计超过 16000 字符，请减少所选方案或缩短要求。")
    return prompt

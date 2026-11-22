"""Exercise ordinary debate admission and replay with persisted synthetic records."""

import ast
import copy
import datetime
import hashlib
import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, relationship, scoped_session, sessionmaker


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "dojo_plugin/agent_runtime"
API = ROOT / "dojo_plugin/api/v1/teaching.py"
Base = declarative_base()


class Users(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    type = Column(String)


class Dojos(Base):
    __tablename__ = "dojos"
    dojo_id = Column(Integer, primary_key=True)
    modules = relationship("DojoModules")


class DojoModules(Base):
    __tablename__ = "dojo_modules"
    dojo_id = Column(Integer, ForeignKey("dojos.dojo_id"), primary_key=True)
    module_index = Column(Integer, primary_key=True)


class DojoAdmins(Base):
    __tablename__ = "dojo_admins"
    dojo_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, primary_key=True)


class TeachingAgentThreads(Base):
    __tablename__ = "teaching_agent_threads"
    id = Column(String, primary_key=True)
    user_id = Column(Integer)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    status = Column(String)


class TeachingArtifacts(Base):
    __tablename__ = "teaching_artifacts"
    id = Column(String, primary_key=True)
    candidate_id = Column(String)
    owner_id = Column(Integer)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    self_workspace_id = Column(String)
    artifact_type = Column(String)
    status = Column(String)
    title = Column(String)
    current_revision = Column(Integer)


class TeachingArtifactRevisions(Base):
    __tablename__ = "teaching_artifact_revisions"
    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    artifact_id = Column(String)
    revision = Column(Integer)
    parent_revision = Column(Integer)
    created_by = Column(Integer)
    instruction = Column(String)
    content = Column(JSON)
    source_refs = Column(JSON)
    validation = Column(JSON)
    content_hash = Column(String)


class TeachingCandidateSets(Base):
    __tablename__ = "teaching_candidate_sets"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    thread_id = Column(String)
    self_workspace_id = Column(String)
    kind = Column(String)
    status = Column(String)
    selected_candidate_id = Column(String)
    source_refs = Column(JSON)
    request_json = Column(JSON)


class TeachingArtifactCandidates(Base):
    __tablename__ = "teaching_artifact_candidates"
    id = Column(String, primary_key=True)
    candidate_set_id = Column(String)
    materialized_artifact_id = Column(String)
    title = Column(String)
    status = Column(String)
    content = Column(JSON)
    candidate_set = relationship(
        "TeachingCandidateSets",
        primaryjoin="foreign(TeachingArtifactCandidates.candidate_set_id) == TeachingCandidateSets.id",
    )


class TeachingJobs(Base):
    __tablename__ = "teaching_jobs"
    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    owner_id = Column(Integer)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    thread_id = Column(String)
    kind = Column(String)
    status = Column(String)
    action_id = Column(Integer)
    stage = Column(String)
    progress = Column(Integer)
    priority = Column(Integer)
    trace_id = Column(String)
    max_attempts = Column(Integer)
    idempotency_key = Column(String, unique=True)
    payload = Column(JSON)
    result = Column(JSON)


class TeachingJobOutbox(Base):
    __tablename__ = "teaching_job_outbox"
    id = Column(Integer, primary_key=True)
    job_id = Column(String, ForeignKey("teaching_jobs.id"))
    payload = Column(JSON)


class ModelInvocations(Base):
    __tablename__ = "model_invocations"
    id = Column(Integer, primary_key=True)
    job_id = Column(String, ForeignKey("teaching_jobs.id"))
    owner_id = Column(Integer)
    artifact_revision_id = Column(String, ForeignKey("teaching_artifact_revisions.id"))
    route = Column(String)
    provider = Column(String)
    actual_model = Column(String)
    model_version = Column(String)
    parameters = Column(JSON)
    usage = Column(JSON)
    latency_ms = Column(Integer)
    request_hash = Column(String)
    response_hash = Column(String)
    status = Column(String)
    degraded = Column(Boolean)
    error = Column(String)
    created = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))


def load_source(name, namespace, names=None):
    path = API if name == "teaching_api" else RUNTIME / f"{name}.py"
    tree = ast.parse(path.read_text())
    nodes = [
        node for node in tree.body
        if (getattr(node, "name", None) in names if names is not None else
            not isinstance(node, ast.ImportFrom) or not (node.level or node.module.startswith("CTFd")))
    ]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)


def debate_content():
    return {"artifactType": "debate", "lesson": {"artifacts": [{
        "type": "debate",
        "content": {"debate": {
            "schema": "debate-v2", "title": "校园花园", "motion": "是否应扩大校园花园",
            "scenario": "学生会正在讨论明年的种植计划。", "studentRole": "学生代表",
            "positions": {"pro": "增加户外观察机会。", "con": "保留开放活动空间。"},
            "objectives": ["比较不同用途。"],
            "format": {"kind": "roundtable", "label": "圆桌", "description": "轮流提出证据。"},
            "rules": {"durationMinutes": 25, "maxExchanges": 8, "responseChars": 400, "style": "友好",
                      "allowFollowUps": True, "allowEarlyFinish": True, "coaching": "on-demand"},
            "roles": [{"id": "gardener", "name": "园艺社代表", "identity": "学生",
                       "side": "pro", "stance": "扩大花园", "voice": "具体",
                       "opening": "请先比较教学用途。"}],
            "rounds": [{"id": "opening", "title": "开场", "task": "说明自己的立场。",
                        "mode": "dialogue", "exchanges": 2, "speakers": ["gardener"], "prompts": []}],
            "evidence": [{"id": "survey", "title": "活动调查", "content": "班级讨论的模拟材料。",
                          "source": "课堂模拟", "kind": "hypothetical"}],
            "rubric": [{"id": "reasoning", "title": "论证", "description": "用证据支持结论。"}],
            "reflectionPrompts": ["哪条证据改变了你的立场？"],
        }, "workbench": "PRIVATE-WORKBENCH"},
    }]}, "workbench": {"teacherNotes": "PRIVATE-TEACHER-NOTES"}}


@pytest.fixture
def flow(monkeypatch):
    monkeypatch.setenv("DOJO_AI_ENABLED", "true")
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "19")
    monkeypatch.setenv("HARNESS_DEEPSEEK_MODEL", "fixture-model")
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = scoped_session(sessionmaker(bind=engine))
    monkeypatch.setattr(Base, "query", session.query_property(), raising=False)
    ns = {mapper.class_.__name__: mapper.class_ for mapper in Base.registry.mappers}
    ns.update(json=json, hashlib=hashlib, course_material_grounding_requested=lambda _: False, config=SimpleNamespace(HARNESS_DEEPSEEK_MODEL="fixture-model"),
              MAX_CANDIDATE_REQUEST_PROMPT_CHARS=16000, db=SimpleNamespace(session=session))
    load_source("scope", ns)
    load_source("upstream_turn", ns)
    load_source("artifacts", ns, {"candidate_request_prompt", "content_hash", "artifact_course_teacher"})
    load_source("ordinary_debate", ns)
    load_source("model_router", ns)

    user = Users(id=3, type="user")
    grant = DojoAdmins(dojo_id=19, user_id=3)
    thread = TeachingAgentThreads(id="thread", user_id=3, dojo_id=19, module_index=0, status="ACTIVE")
    artifact = TeachingArtifacts(id="artifact", owner_id=3, dojo_id=19, module_index=0,
                                 candidate_id="candidate", artifact_type="debate", status="READY",
                                 title="校园花园", current_revision=1)
    candidate_set = TeachingCandidateSets(
        id="set", owner_id=3, dojo_id=19, module_index=0, thread_id="thread", kind="debate",
        status="MATERIALIZED", selected_candidate_id="candidate", source_refs=[],
        request_json={"prompt": "设计校园活动辩论", "workbench": "PRIVATE-OPTION-METADATA"},
    )
    plan = {"title": "校园花园", "summary": "在校园花园的用途之间权衡", "outline": [],
            "workbench": "PRIVATE-CANDIDATE"}
    candidate = TeachingArtifactCandidates(
        id="candidate", candidate_set_id="set", materialized_artifact_id="artifact",
        title="校园花园", status="MATERIALIZED", content=plan,
    )
    revision = TeachingArtifactRevisions(
        id="initial", artifact_id="artifact", revision=1, created_by=3, content=plan,
        content_hash=ns["content_hash"](plan), validation={"status": "PENDING"}, source_refs=[],
    )
    session.add_all([user, grant, Dojos(dojo_id=19, modules=[DojoModules(module_index=0)]),
                     thread, artifact, candidate_set, candidate, revision])
    session.commit()

    def replace_revision(content):
        revision.content = content
        revision.content_hash = ns["content_hash"](content)
        revision.validation = {"status": "GENERATED"}
        session.commit()

    def admit(kind, payload, *, thread_id="thread"):
        return ns["admit"](kind, payload, 3, 19, 0, thread_id)

    def job(kind, payload, *, thread_id="thread"):
        row = TeachingJobs(id="job", owner_id=3, dojo_id=19, module_index=0, thread_id=thread_id,
                           kind=kind, status="FAILED", payload=payload, result={})
        session.add(row)
        session.commit()
        return row

    payload = {"artifactId": "artifact", "artifactType": "debate", "expectedRevision": 1,
               "candidateSetId": "set", "allowDegraded": True}
    try:
        yield SimpleNamespace(**ns, session=session, user=user, grant=grant, thread=thread,
                              artifact=artifact, candidate_set=candidate_set, candidate=candidate,
                              revision=revision, replace_revision=replace_revision,
                              admit_job=admit, new_job=job, payload=payload)
    finally:
        session.remove()
        engine.dispose()


def test_create_rebuilds_wire_payload_from_confirmed_saved_selection(flow):
    payload = {**flow.payload, "plan": {"title": "FORGED-PLAN"}, "requestPrompt": "FORGED-PROMPT",
               "ordinaryDebate": {"revisionId": "forged"}, "debateAuthoringBackend": "forged"}
    frozen = flow.admit_job("artifact.materialize", payload)
    assert flow.pinned(frozen)
    job = flow.new_job("artifact.materialize", frozen)
    prepared = flow.prepare(job, job.payload)
    route = flow.route_model(job.kind, payload=prepared, allow_degraded=True)
    assert route["required_model"] == route["actual_model"] == "fixture-model"
    assert route["allow_degraded"] is False
    ns = dict(vars(flow), ordinary_debate=flow)
    load_source("jobs", ns, {"_runtime_request_body"})
    body = ns["_runtime_request_body"](job, route, prepared)
    assert body["scope"] == {"ownerId": 3, "dojoId": 19, "moduleIndex": 0, "ordinaryTeaching": flow.SCOPE}
    wire = body["payload"]
    assert wire["debateAuthoringBackend"] == "ordinary-debate-harness-v1"
    assert "ordinaryDebate" not in wire
    assert "校园花园" in json.dumps(wire, ensure_ascii=False)
    assert "设计校园活动辩论" in json.dumps(wire, ensure_ascii=False)
    assert "FORGED-" not in json.dumps(wire)
    assert "PRIVATE-" not in json.dumps(wire)


def test_direct_revision_reads_one_spec_and_omits_entire_workbench(flow):
    flow.artifact.candidate_id = None
    saved = debate_content()
    flow.replace_revision(saved)
    payload = {**flow.payload, "instruction": "在开场增加证据交流。",
               "currentContent": {"teacherNotes": "FORGED-CURRENT-CONTENT"}}
    frozen = flow.admit_job("artifact.revise", payload, thread_id=None)
    job = flow.new_job("artifact.revise", frozen, thread_id=None)
    wire = flow.wire_payload(flow.prepare(job, job.payload))
    assert wire["debateAuthoringBackend"] == "ordinary-debate-harness-v1"
    encoded = json.dumps(wire, ensure_ascii=False)
    assert "是否应扩大校园花园" in encoded
    assert "在开场增加证据交流。" in encoded
    assert "ordinaryDebate" not in wire
    assert "PRIVATE-" not in encoded
    assert "FORGED-" not in encoded


@pytest.mark.parametrize("spec_count", [0, 2])
def test_revision_rejects_missing_or_ambiguous_saved_source(flow, spec_count):
    content = debate_content()
    content["lesson"]["artifacts"] *= spec_count
    flow.replace_revision(content)
    with pytest.raises(flow.OrdinaryDebateError):
        flow.admit_job("artifact.revise", {**flow.payload, "instruction": "改写开场。"})


@pytest.mark.parametrize("record, field, value", [
    ("artifact", "dojo_id", 20), ("artifact", "module_index", 1), ("artifact", "owner_id", 4),
    ("candidate_set", "selected_candidate_id", None), ("candidate_set", "dojo_id", 20),
    ("candidate_set", "module_index", 1), ("candidate_set", "owner_id", 4),
    ("candidate_set", "thread_id", "other-thread"), ("candidate_set", "status", "READY"),
    ("candidate", "materialized_artifact_id", "another-artifact"), ("candidate", "status", "READY"),
    ("revision", "revision", 3), ("revision", "source_refs", [{"id": "other-source"}]),
    ("thread", "status", "ARCHIVED"),
])
def test_create_rejects_unconfirmed_or_wrong_scope_records(flow, record, field, value):
    setattr(getattr(flow, record), field, value)
    flow.session.commit()
    with pytest.raises(flow.OrdinaryDebateError):
        flow.admit_job("artifact.materialize", flow.payload)


@pytest.mark.parametrize(("kind", "change"), [
    (kind, change)
    for kind in ("artifact.materialize", "artifact.revise")
    for change in ("course_opt_out", "teaching_grant", "artifact_transfer", "new_version", "source_replaced")
] + [("artifact.materialize", "candidate_changed")])
def test_pinned_replay_rechecks_current_scope_and_frozen_content(flow, monkeypatch, kind, change):
    payload = dict(flow.payload)
    if kind == "artifact.revise":
        flow.replace_revision(debate_content())
        payload["instruction"] = "改写开场。"
    frozen = flow.admit_job(kind, payload)
    job = flow.new_job(kind, frozen)
    if change == "course_opt_out":
        monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "20")
    elif change == "teaching_grant":
        flow.session.delete(flow.grant)
    elif change == "artifact_transfer":
        flow.artifact.owner_id = 4
    elif change == "new_version":
        flow.artifact.current_revision = 2
    elif change == "source_replaced":
        revised = copy.deepcopy(flow.revision.content)
        revised["altered"] = True
        flow.replace_revision(revised)
    else:
        flow.candidate.content = {**flow.candidate.content, "summary": "候选已改变"}
    flow.session.commit()
    with pytest.raises(flow.OrdinaryDebateError):
        flow.prepare(job, job.payload)


def test_owned_artifact_can_be_admitted_by_platform_admin_without_course_grant(flow):
    flow.user.type = "admin"
    flow.session.delete(flow.grant)
    flow.session.commit()
    assert flow.pinned(flow.admit_job("artifact.materialize", flow.payload))
    flow.artifact.owner_id = 4
    flow.session.commit()
    with pytest.raises(flow.OrdinaryDebateError):
        flow.admit_job("artifact.materialize", flow.payload)


def test_old_jobs_and_unlisted_jobs_have_no_ordinary_marker(flow, monkeypatch):
    legacy = flow.new_job("artifact.materialize", flow.payload)
    assert not flow.pinned(legacy.payload)
    legacy_wire = flow.wire_payload(legacy.payload)
    assert "debateAuthoringBackend" not in legacy_wire
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "20")
    clean = flow.admit_job("artifact.materialize", {**flow.payload, "ordinaryDebate": True,
                                                  "debateAuthoringBackend": "ordinary-debate-harness-v1"})
    assert not flow.pinned(clean)
    assert "debateAuthoringBackend" not in clean


def test_revision_api_surfaces_admission_rejection_without_creating_a_job(flow):
    errors = type("SlideFixtureError", (ValueError,), {})

    ns = dict(vars(flow))
    ns.update(
        ordinary_debate=flow, uuid=uuid, IntegrityError=IntegrityError, get_trace_id=lambda: "LOCAL",
        append_job_event=lambda *_: None, publish_pending_outbox=lambda **_: None,
        ordinary_slide_notes=SimpleNamespace(
            CONSENT="includeOriginalSlideNotes", OrdinarySlideNotesError=errors,
            admit=lambda _user, _artifact, payload: payload, pinned=lambda _: False,
        ),
        ordinary_slide_layout=SimpleNamespace(
            OrdinarySlideLayoutError=errors, admit=lambda _user, _artifact, payload: payload,
        ),
        _supplied_idempotency=lambda *args: ":".join(map(str, args)),
        _ok=lambda body, status: (body, status),
        _error=lambda exc, status=400, **kwargs: ({"error": str(exc), **kwargs}, status),
        artifact_view=lambda _: {"revision": {"content": flow.revision.content}},
        job_view=lambda job: {"id": job.id},
    )
    load_source("artifacts", ns, {"artifact_for_user", "artifact_revision_source_issue"})
    load_source("jobs", ns, {"enqueue_job"})
    load_source("teaching_api", ns, {"revise_teacher_artifact"})
    revise = ns["revise_teacher_artifact"]
    request = {"expectedRevision": 1, "instruction": "改写开场。"}

    error, status = revise(flow.user, flow.artifact.id, request, "before-generation")
    assert status == 409
    assert error["code"] == "ORDINARY_DEBATE_CONFLICT"
    assert TeachingJobs.query.count() == 0

    flow.replace_revision(debate_content())
    _, status = revise(flow.user, flow.artifact.id, request, "after-generation")
    assert status == 202
    stored = TeachingJobs.query.one()
    assert stored.thread_id is None
    assert flow.pinned(stored.payload)


def test_manual_retry_rejects_revoked_version_before_requeue(flow):
    admitted = flow.admit_job("artifact.materialize", flow.payload)
    job = flow.new_job("artifact.materialize", admitted)
    flow.artifact.current_revision = 2
    flow.session.commit()
    ns = dict(vars(flow), ordinary_debate=flow)
    load_source("jobs", ns, {"retry_job", "_retry_payload"})

    with pytest.raises(ValueError):
        ns["retry_job"](job, flow.user.id, "retry-key")
    assert job.status == "FAILED"
    assert job.payload == admitted
    assert TeachingJobOutbox.query.count() == 0


def test_revision_result_is_applied_to_frozen_content_and_saved_as_new_version(flow):
    saved = debate_content()
    saved["lesson"]["artifacts"].append({"type": "reading", "content": {"text": "课前阅读"}})
    flow.replace_revision(saved)
    request = {**flow.payload, "instruction": "改写辩题。"}
    admitted = flow.admit_job("artifact.revise", request)
    job = flow.new_job("artifact.revise", admitted)
    spec = copy.deepcopy(saved["lesson"]["artifacts"][0]["content"]["debate"])
    spec["motion"] = "是否应延长校园花园的开放时间"
    result = {
        "spec": spec, "summary": "调整辩题", "changedFields": ["motion"], "changedPaths": ["/motion"],
        "changes": [{"path": "/motion", "before": "是否应扩大校园花园", "after": spec["motion"]}],
    }
    meta = {"executionMode": flow.MODE, "provider": "deepseek", "actualModel": "fixture-model",
            "degraded": False, "usage": {"inputTokens": 7, "outputTokens": 3, "totalTokens": 10}}
    route = flow.route_model(job.kind, payload=job.payload)
    flow.validate_receipt(route, {"model": meta, "result": result})

    ns = dict(vars(flow), ordinary_debate=flow, ordinary_slide_layout=SimpleNamespace(pinned=lambda _: False))
    load_source("artifacts", ns, {"create_revision", "current_artifact_revision", "RevisionConflict"})
    load_source("jobs", ns, {"_persist_result", "_record_invocation"})
    with pytest.raises(flow.OrdinaryDebateError):
        ns["_persist_result"](job, result)
    flow.session.rollback()
    assert flow.artifact.current_revision == 1

    invocation = ns["_record_invocation"](job, route, meta, status="SUCCEEDED")
    persisted = ns["_persist_result"](job, result)
    flow.session.commit()
    revision = TeachingArtifactRevisions.query.filter_by(id=persisted["revisionId"]).one()
    assert invocation.artifact_revision_id == revision.id
    assert invocation.usage == meta["usage"]
    assert invocation.parameters == {"executionMode": flow.MODE}
    assert revision.validation["actualModel"] == meta["actualModel"]
    assert flow.artifact.current_revision == revision.revision == 2
    assert revision.content["lesson"]["artifacts"][0]["content"]["debate"] == spec
    assert revision.content["lesson"]["artifacts"][1] == saved["lesson"]["artifacts"][1]
    assert revision.content["workbench"] == saved["workbench"]
    assert revision.content["revisionMetadata"]["changedPaths"] == ["/motion"]
    assert flow.revision.content == saved


@pytest.mark.parametrize("change", [
    {"provider": "unverified"}, {"actualModel": "other-model"}, {"degraded": True},
    {"executionMode": "legacy"}, {"usage": {}},
    {"usage": {"inputTokens": 7, "outputTokens": 3, "totalTokens": 9}},
    {"usage": {"inputTokens": True, "outputTokens": 3, "totalTokens": 4}},
])
def test_receipt_rejects_unverified_model_and_inconsistent_usage(flow, change):
    meta = {"executionMode": flow.MODE, "provider": "deepseek", "actualModel": "fixture-model",
            "degraded": False, "usage": {"inputTokens": 7, "outputTokens": 3, "totalTokens": 10}}
    with pytest.raises(flow.OrdinaryDebateError):
        flow.validate_receipt({"required_model": "fixture-model"}, {"model": {**meta, **change}, "result": {}})


def test_creation_uses_only_summaries_of_exact_referenced_versions(flow, monkeypatch):
    ref = {"id": "private-material-id", "type": "material", "revisionId": "private-revision-id", "sha256": "a" * 64}
    plan = {**flow.candidate.content, "sourceGrounding": [{"materialId": ref["id"], "uses": ["比较场地用途。"]}]}
    flow.candidate.content = plan
    flow.revision.source_refs = flow.candidate_set.source_refs = [ref]
    flow.replace_revision(plan)
    returned_ref = dict(ref)

    def selected_context(**kwargs):
        assert kwargs["dojo_id"] == 19 and kwargs["owner_id"] == 3
        assert kwargs["source_refs"] == [ref] and kwargs["require_complete"] is True
        return {
            "coverage": {"complete": True}, "sourceRefs": [returned_ref],
            "sourceMaterials": [{"id": ref["id"], "title": "校园用地", "filename": "选读.pdf",
                                 "excerpts": ["PRIVATE-RAW"], "analysis": {"summary": "记录活动空间的使用情况。"}}],
        }

    monkeypatch.setitem(flow.prepare.__globals__, "build_course_material_context", selected_context)
    frozen = flow.admit_job("artifact.materialize", flow.payload)
    job = flow.new_job("artifact.materialize", frozen)
    wire = flow.wire_payload(flow.prepare(job, job.payload))
    assert wire["plan"]["sourceGrounding"][0]["materialId"] == "material-1"
    assert wire["materialDossier"]["materials"] == [
        {"id": "material-1", "title": "校园用地", "analysis": {"summary": "记录活动空间的使用情况。"},
         "coverage": {"complete": True}},
    ]
    encoded = json.dumps(wire)
    assert all(marker not in encoded for marker in ("private-material-id", "private-revision-id", "PRIVATE-RAW"))
    returned_ref["sha256"] = "b" * 64
    with pytest.raises(flow.OrdinaryDebateError):
        flow.prepare(job, job.payload)


@pytest.mark.parametrize("status", [404, 307, 308])
def test_older_or_redirecting_classroom_cannot_reroute_debate(flow, status):
    from time import monotonic
    from unittest.mock import Mock

    frozen = flow.admit_job("artifact.materialize", flow.payload)
    job = flow.new_job("artifact.materialize", frozen)
    prepared = flow.prepare(job, job.payload)
    route = flow.route_model(job.kind, payload=prepared)
    response = Mock(status_code=status)
    post = Mock(return_value=response)
    ns = dict(vars(flow), ordinary_debate=flow, time=SimpleNamespace(monotonic=monotonic),
              config=SimpleNamespace(AGENT_RUNTIME_INTERNAL_URL="http://classroom", AGENT_RUNTIME_SERVICE_SECRET="fixture"),
              requests=SimpleNamespace(post=post), AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS=(),
              _runtime_read_timeout=lambda *_: 30, RuntimeJobError=lambda _, **kw: RuntimeError(kw["code"]))
    load_source("jobs", ns, {"_runtime_request_body", "_invoke_agent_runtime"})
    with pytest.raises(RuntimeError, match="ORDINARY_DEBATE_ROUTE_UNAVAILABLE"):
        ns["_invoke_agent_runtime"](job, route, prepared)
    post.assert_called_once()
    assert post.call_args.args == ("http://classroom/api/integration/jobs/ordinary-debate",)
    assert post.call_args.kwargs["allow_redirects"] is False
    response.close.assert_called_once()

"""Test ordinary lesson-plan admission, routing and the durable revision path."""

import ast
import copy
import datetime
import hashlib
import json
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


RUNTIME = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime"


def source(name, ns, *, functions=None):
    path = RUNTIME / f"{name}.py"
    nodes = ast.parse(path.read_text()).body
    if functions:
        nodes = [node for node in nodes if getattr(node, "name", None) in functions]
    else:
        nodes = [node for node in nodes if not isinstance(node, (ast.Import, ast.ImportFrom))]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), ns)


def query(row):
    model = MagicMock()
    model.query.filter_by.return_value.populate_existing.return_value.first.return_value = row
    return model


@pytest.mark.parametrize(("kind", "payload"), [
    ("candidate.generate", {"ordinaryCandidateModel": "fixture-model"}),
    ("artifact.materialize", {"ordinaryLessonPlan": {"model": "fixture-model"}}),
])
def test_older_runtime_is_rejected_without_sending_to_legacy_route(flow, kind, payload):
    _, jobs, _, job, _ = flow
    job.kind, job.trace_id = kind, "synthetic"
    http = MagicMock()
    http.post.return_value.status_code = 404
    jobs.update(
        requests=http, time=time, AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS=(),
        config=SimpleNamespace(AGENT_RUNTIME_INTERNAL_URL="http://runtime.test", AGENT_RUNTIME_SERVICE_SECRET="fixture"),
        _runtime_request_body=lambda *args: {"kind": kind}, _runtime_read_timeout=lambda *args: 2,
    )
    source("reliability", jobs, functions={"RuntimeJobError"})
    source("jobs", jobs, functions={"_invoke_agent_runtime"})
    with pytest.raises(jobs["RuntimeJobError"]) as failure:
        jobs["_invoke_agent_runtime"](job, {}, payload)
    assert failure.value.category == "service"
    assert failure.value.code == "ORDINARY_LESSON_PLAN_ROUTE_UNAVAILABLE"
    assert http.post.call_count == 1
    assert http.post.call_args.args == ("http://runtime.test/api/integration/jobs/ordinary-lesson-plan",)
    http.post.return_value.close.assert_called_once()


@pytest.fixture
def flow():
    ns = {
        "json": json,
        "re": __import__("re"),
        "hashlib": hashlib,
        "config": SimpleNamespace(HARNESS_DEEPSEEK_MODEL="fixture-model"),
        "upstream_enabled": MagicMock(return_value=True),
        "ordinary_teaching_course": lambda course: course == 19,
        "course_material_grounding_requested": lambda _: False,
        "ScopeError": type("ScopeError", (ValueError,), {}),
        "build_scope": MagicMock(),
    }
    source("artifacts", ns, functions={"content_hash"})
    source("ordinary_lesson_plan", ns)
    source("model_router", ns)
    plan = {
        "type": "lesson-plan", "experience": {"mode": "ordinary-teaching-plan"},
        "objectives": ["观察叶片"], "outline": [{"title": "叶缘", "description": "对比叶缘", "keyPoints": ["看缺口"]}],
        "activities": [], "assessment": {"criteria": ["描述叶缘"]}, "sourceGrounding": [],
    }
    candidate = SimpleNamespace(id="candidate", status="MATERIALIZED", content=plan)
    selected = SimpleNamespace(
        id="set", status="MATERIALIZED", selected_candidate_id="candidate", source_refs=[], request_json={},
    )
    revision = SimpleNamespace(id="initial", content=copy.deepcopy(plan), content_hash=ns["content_hash"](plan), source_refs=[])
    artifact = SimpleNamespace(id="artifact", title="植物观察", artifact_type="lesson-plan", candidate_id="candidate", current_revision=1)
    receipt = SimpleNamespace(id="invocation", job_id="generation")
    state = SimpleNamespace(candidate=candidate, selected=selected, revision=revision, artifact=artifact, receipt=receipt)
    ns.update(
        Users=MagicMock(), TeachingArtifacts=query(artifact), TeachingCandidateSets=query(selected),
        TeachingArtifactCandidates=query(candidate), TeachingArtifactRevisions=query(revision),
        TeachingAgentThreads=query(SimpleNamespace(id="thread")),
        candidate_request_prompt=lambda _: "请为叶片观察制作一份普通教案。",
        _generation_receipt=MagicMock(return_value=receipt),
        build_course_material_context=MagicMock(return_value={
            "coverage": {"complete": True}, "sourceRefs": [], "sourceMaterials": [],
        }),
    )
    ns["Users"].query.filter_by.return_value.first.return_value = SimpleNamespace(id=3)
    facade = SimpleNamespace(**ns)
    jobs = {"ordinary_lesson_plan": facade}
    source("jobs", jobs, functions={"_runtime_request_body"})
    job = SimpleNamespace(id="child", kind="artifact.materialize", owner_id=3, dojo_id=19, module_index=0, thread_id="thread", result={})
    payload = {"artifactType": "lesson-plan", "artifactId": "artifact", "candidateSetId": "set",
               "expectedRevision": 1, "allowDegraded": True, "sourceRefs": ["untrusted"], "plan": {"untrusted": True}}
    return ns, jobs, state, job, payload


def test_owned_ordinary_child_reconstructs_only_approved_data_and_cannot_degrade(flow):
    ns, jobs, state, job, payload = flow
    frozen = ns["admit"](payload, 3, 19, 0, "thread")
    assert frozen["allowDegraded"] is False
    assert ns["_generation_receipt"].call_args.args == (state.selected, None)
    prepared = ns["prepare"](job, frozen)
    route = ns["route_model"](job.kind, payload=prepared, allow_degraded=True)
    assert route["required_model"] == route["actual_model"] == "fixture-model"
    assert route["allow_degraded"] is False
    body = jobs["_runtime_request_body"](job, route, prepared)
    assert body["scope"] == {"ownerId": 3, "dojoId": 19, "moduleIndex": 0, "ordinaryTeaching": "lesson-plan-materialize"}
    assert body["payload"]["plan"] == state.revision.content
    assert body["payload"]["materialDossier"] == {
        "coverage": {"complete": True, "expectedMaterialCount": 0, "materialIds": []}, "materials": [],
    }
    assert not {"ordinaryLessonPlan", "sourceRefs", "allowDegraded"} & set(body["payload"])
    ns["build_course_material_context"].assert_called_once_with(
        owner_id=3, dojo_id=None, source_refs=[], prompt="请为叶片观察制作一份普通教案。", require_complete=False,
    )


@pytest.mark.parametrize("changed", ["course", "revision", "model", "service", "generation", "references", "plan"])
def test_revocation_or_scope_model_source_drift_stops_pinned_materialization(flow, changed):
    ns, _, state, job, payload = flow
    frozen = ns["admit"](payload, 3, 19, 0, "thread")
    if changed == "course":
        ns["build_scope"].side_effect = ns["ScopeError"]()
    elif changed == "revision":
        state.artifact.current_revision = 2
    elif changed == "model":
        ns["config"].HARNESS_DEEPSEEK_MODEL = "different-model"
    elif changed == "service":
        ns["upstream_enabled"].return_value = False
    elif changed == "generation":
        state.receipt.id = "different-receipt"
    elif changed == "references":
        state.selected.source_refs = [{"id": "other-course"}]
    else:
        state.candidate.content["objectives"] = ["已被其他版本更改"]
    with pytest.raises(ns["OrdinaryLessonPlanError"]):
        ns["prepare"](job, frozen)


def test_new_ordinary_job_cannot_send_legacy_or_missing_provenance(flow):
    ns, _, state, _, payload = flow
    state.candidate.content["experience"] = {"mode": "legacy"}
    with pytest.raises(ns["OrdinaryLessonPlanError"], match="重新生成普通教学候选"):
        ns["admit"](payload, 3, 19, 0, "thread")
    assert ns["admit"](payload, 3, 20, 0, "thread") == payload


def test_material_source_stays_revision_bound_and_only_approved_summary_is_disclosed(flow):
    ns, _, state, job, payload = flow
    ref = {"type": "material", "id": "botany", "revisionId": "reading-1", "sha256": "a" * 64}
    state.selected.source_refs = state.revision.source_refs = [ref]
    state.candidate.content["sourceGrounding"] = [{"materialId": "botany", "uses": ["概念参考"]}]
    state.revision.content = copy.deepcopy(state.candidate.content)
    state.revision.content_hash = ns["content_hash"](state.revision.content)
    snapshot = {
        "coverage": {"complete": True},
        "sourceRefs": [ref],
        "sourceMaterials": [{
            "id": "botany", "filename": "botany.md", "title": "植物学", "analysis": {
                "summary": "公开的叶片基础知识", "privateNotes": "PRIVATE-NOTES",
            }, "excerpts": ["PRIVATE-PAGE"],
        }],
    }
    ns["build_course_material_context"].return_value = snapshot
    frozen = ns["admit"](payload, 3, 19, 0, "thread")
    prepared = ns["prepare"](job, frozen)
    assert prepared["materialContext"]["materialIds"] == ["botany"]
    assert prepared["materialDossier"]["materials"][0]["analysis"] == {"summary": "公开的叶片基础知识"}
    assert "PRIVATE" not in json.dumps(prepared)
    snapshot["sourceRefs"] = [{**ref, "revisionId": "reading-2"}]
    with pytest.raises(ns["OrdinaryLessonPlanError"]):
        ns["prepare"](job, frozen)


def test_generation_pin_enforces_model_and_missing_marker_cannot_route_to_legacy(flow):
    ns, _, _, job, payload = flow
    job.kind = "candidate.generate"
    marked = {**payload, "generationReason": ns["GENERATION_REASON"], "ordinaryCandidateModel": "fixture-model"}
    accepted = ns["admit_generation"](marked, 3, 19, 0, "thread")
    assert accepted["allowDegraded"] is False
    assert ns["generation_model"](job, accepted, "candidate-plan") == "fixture-model"
    route = ns["route_model"](job.kind, payload=accepted, allow_degraded=True)
    assert route["route"] == ns["UPSTREAM_LESSON_CANDIDATE_ROUTE"]
    assert route["actual_model"] == route["required_model"] == "fixture-model"
    assert route["allow_degraded"] is False
    for candidate in (payload, {**accepted, "ordinaryCandidateModel": "legacy-model"}):
        with pytest.raises(ns["OrdinaryLessonPlanError"]):
            ns["generation_model"](job, candidate, "candidate-plan")
    with pytest.raises(ns["OrdinaryLessonPlanError"]):
        ns["generation_model"](job, accepted, None)


def model_response():
    return {
        "model": {"executionMode": "lesson-plan-harness", "provider": "deepseek", "actualModel": "fixture-model",
                  "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}},
        "result": {
            "content": {"schema": "aisecedu.global-agent.artifact.v1", "artifactType": "lesson-plan",
                        "renderer": "agent-runtime-stage", "plan": {}, "lesson": {"artifacts": [{"type": "slide"}]}},
            "validation": {"status": "GENERATED", "fallbackCount": 0},
        },
    }


@pytest.mark.parametrize("extra", [
    {"executionMode": "legacy"}, {"actualModel": "legacy-model"}, {"degraded": True}, {"provider": "unexpected"},
])
def test_legacy_missing_or_degraded_model_receipt_cannot_be_persisted(flow, extra):
    ns, _, _, _, _ = flow
    response = model_response()
    route = {"required_model": "fixture-model"}
    ns["validate_receipt"](route, response)
    response["model"].update(extra)
    with pytest.raises(ns["OrdinaryLessonPlanError"]):
        ns["validate_receipt"](route, response)


def test_worker_persists_pinned_revision_and_invocation_atomically(flow):
    ns, jobs, state, job, payload = flow
    frozen = ns["admit"](payload, 3, 19, 0, "thread")
    job.payload = frozen
    state.selected.thread_id = "thread"
    response = model_response()
    ns["validate_receipt"]({"required_model": "fixture-model"}, response)

    def first(model, value):
        model.query.filter_by.return_value.first.return_value = value

    first(ns["TeachingArtifacts"], state.artifact)
    first(ns["TeachingArtifactRevisions"], None)
    first(ns["TeachingArtifactCandidates"], SimpleNamespace(id="candidate", candidate_set_id="set"))
    first(ns["TeachingCandidateSets"], state.selected)
    revision = SimpleNamespace(id="next", revision=2, source_refs=[])
    invocation = SimpleNamespace(route="upstream-lesson-plan-materialize", actual_model="fixture-model", degraded=False)
    db = MagicMock()
    created = MagicMock(return_value=revision)
    invocations = MagicMock()
    invocations.query.filter_by.return_value.order_by.return_value.first.return_value = invocation
    jobs.update({key: ns[key] for key in ("TeachingArtifacts", "TeachingArtifactCandidates", "TeachingArtifactRevisions",
                                         "TeachingCandidateSets", "Users")})
    jobs.update(db=db, create_revision=created, ModelInvocations=invocations, datetime=datetime,
                TeachingAgentMessages=MagicMock(), ConversationCards=MagicMock())
    source("jobs", jobs, functions={"_persist_result"})
    result = jobs["_persist_result"](job, response["result"])
    assert result == {"artifactId": "artifact", "revisionId": "next", "revision": 2}
    assert created.call_args.kwargs["commit"] is False
    assert created.call_args.kwargs["content"] == response["result"]["content"]
    assert state.artifact.status == "READY"
    assert invocation.artifact_revision_id == "next"
    assert revision.validation["actualModel"] == "fixture-model"
    db.session.commit.assert_called_once()


def test_pinned_candidate_passes_complete_empty_material_projection(flow):
    ns, jobs, _, job, payload = flow
    job.kind = "candidate.generate"
    job.payload = {"artifactType": "lesson-plan", "candidateSetId": payload["candidateSetId"],
                   "generationReason": ns["GENERATION_REASON"], "ordinaryCandidateModel": "fixture-model",
                   "prompt": "设计植物科学教案", "sourceRefs": []}
    jobs.update(
        _teacher_learning_request=lambda *_: None,
        _job_material_grounding_required=lambda *_: False,
        singular_material_reference_requested=lambda _: False,
        course_material_grounding_requested=lambda _: False,
        TeachingCandidateSets=ns["TeachingCandidateSets"],
        build_course_material_context=lambda **_: {
            "coverage": {"complete": True, "expectedMaterialCount": 0}, "sourceRefs": [], "sourceMaterials": [],
        },
    )
    source("jobs", jobs, functions={"_runtime_payload"})
    output = jobs["_runtime_payload"](job)
    assert output["materialContext"] == {"complete": True, "expectedMaterialCount": 0, "materialIds": []}
    assert output["materialDossier"] == {"coverage": output["materialContext"], "materials": []}
    assert job.payload["materialContext"] == output["materialContext"]


@pytest.mark.parametrize("saved_candidate_pin", [False, True])
def test_previously_ordinary_candidate_cannot_materialize_after_course_opt_out(flow, saved_candidate_pin):
    ns, _, state, _, payload = flow
    if saved_candidate_pin:
        state.selected.request_json[ns["_GENERATION_PIN"]] = "fixture-model"
        # Even a damaged ordinary candidate cannot bypass its set's admission.
        state.candidate.content = {}
    ns["ordinary_teaching_course"] = lambda _: False
    with pytest.raises(ns["OrdinaryLessonPlanError"], match="授权已变化"):
        ns["admit"](payload, 3, 19, 0, "thread")
    assert ns["admit"]({**payload, "workspaceId": "self"}, 3, 19, 0, "thread")["workspaceId"] == "self"

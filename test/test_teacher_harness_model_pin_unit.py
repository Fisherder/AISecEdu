"""Exercise the teacher worker's exact Harness model pin and invocation receipts."""

import ast
import uuid
import hashlib
import json
import time
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "dojo_plugin/agent_runtime"


def load_parts(path, namespace, function_names=None, assignment_names=()):
    nodes = []
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, ast.FunctionDef) and (function_names is None or node.name in function_names):
            nodes.append(node)
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id in assignment_names for target in node.targets
        ):
            nodes.append(node)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)
    return namespace


@pytest.fixture
def router():
    config = SimpleNamespace(
        HARNESS_DEEPSEEK_MODEL="deepseek-flash",
        DOJO_AI_AUTHORING_PLAN_MODEL="deepseek-v4.1-flash",
        DOJO_AI_COMPLEX_SCENE_MODEL="deepseek-v4.1-flash",
    )
    return load_parts(
        RUNTIME / "model_router.py",
        {"config": config, "hashlib": hashlib, "json": json, "re": re},
        assignment_names={
            "UPSTREAM_TEACHER_ROUTE", "UPSTREAM_LESSON_PLAN_ROUTE", "UPSTREAM_LESSON_CANDIDATE_ROUTE",
            "UPSTREAM_SLIDE_LAYOUT_ROUTE", "UPSTREAM_DECK_REVISION_ROUTE", "UPSTREAM_SLIDE_NOTES_ROUTE", "UPSTREAM_DEBATE_ROUTE",
            "UPSTREAM_DEBATE_CANDIDATE_ROUTE", "UPSTREAM_LESSON_PLAN_REVISION_ROUTE", "UPSTREAM_ORDINARY_TEACHING_ROUTE",
            "COMPLEX_KINDS", "COMPLEX_HINTS",
        },
    )


def test_compose_defaults_are_shared_by_ctfd_worker_and_harness(router):
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    deployment = compose["services"]
    env = compose["x-ctfd-env"]
    interpolation = "${HARNESS_DEEPSEEK_MODEL:-deepseek-flash}"
    assert "HARNESS_DEEPSEEK_API_KEY" not in env
    assert env["HARNESS_DEEPSEEK_MODEL"] == deployment["ctfd"]["environment"]["HARNESS_DEEPSEEK_MODEL"]
    assert env["HARNESS_DEEPSEEK_MODEL"] == deployment["agent-runtime"]["environment"]["HARNESS_DEEPSEEK_MODEL"]
    assert env["HARNESS_DEEPSEEK_MODEL"] == deployment["deepseek-harness"]["environment"]["DEEPSEEK_MODEL"] == interpolation
    workers = [
        service["environment"] for name, service in deployment.items()
        if name.startswith("teaching-") and "worker" in name
    ]
    assert workers and all(variables["HARNESS_DEEPSEEK_MODEL"] == interpolation for variables in workers)
    assert all("HARNESS_DEEPSEEK_API_KEY" not in variables for variables in workers)

    route = router["route_model"]("agent.chat", prompt="解释植物光合作用", payload={"chatBackend": "upstream"})
    assert route["required_model"] == route["actual_model"] == "deepseek-flash"
    assert route["allow_degraded"] is False
    assert router["validate_actual_model"](route, "deepseek-flash") == route


@pytest.mark.parametrize("caller_allows_degraded", [False, True])
def test_new_upstream_route_is_pinned_to_custom_model(router, caller_allows_degraded):
    router["config"].HARNESS_DEEPSEEK_MODEL = "synthetic-custom-flash"
    route = router["route_model"](
        "agent.chat", prompt="准备植物复习课",
        payload={"chatBackend": "upstream", "model": "browser-model"},
        allow_degraded=caller_allows_degraded,
    )
    assert route["route"] == router["UPSTREAM_TEACHER_ROUTE"]
    assert route["actual_model"] == route["required_model"] == "synthetic-custom-flash"
    assert route["allow_degraded"] is False
    validate = router["validate_actual_model"]
    assert validate(route, "synthetic-custom-flash") == route
    with pytest.raises(ValueError, match="configured Harness model"):
        validate(route, "different-model")


def test_legacy_route_and_existing_frozen_route_remain_exact(router):
    route_model = router["route_model"]
    legacy = route_model("agent.chat", prompt="润色普通教师备课说明", payload={})
    assert legacy["required_model"] == "deepseek-v4.1-flash"
    assert router["validate_actual_model"](legacy, "deepseek-v4.1-flash") == legacy
    historical = {"payload": {"chatBackend": "upstream", "prompt": "已有教师请求"}, "modelRoute": legacy}
    freeze = MagicMock()
    runtime = MagicMock()
    callbacks = load_parts(RUNTIME / "jobs.py", {
        "prepared_input": lambda _job: historical, "restore_input_cache": MagicMock(),
        "freeze_prepared": freeze, "_runtime_payload": runtime, "route_model": route_model,
    }, {"_prepare_model_request"})
    job = SimpleNamespace(kind="agent.chat", thread_id="ordinary-thread")
    assert callbacks["_prepare_model_request"](job) == (historical["payload"], legacy)
    freeze.assert_not_called()
    runtime.assert_not_called()


@pytest.mark.parametrize("reported_model, status", [
    ("deepseek-flash", "SUCCEEDED"),
    ("different-model", "FAILED"),
])
def test_worker_invocation_keeps_actual_usage_without_allowing_mismatch(router, reported_model, status):
    saved = []
    namespace = load_parts(RUNTIME / "jobs.py", {
        "validate_actual_model": router["validate_actual_model"], "PermanentJobError": ValueError,
        "ModelInvocations": SimpleNamespace,
        "db": SimpleNamespace(session=SimpleNamespace(add=saved.append)),
        "_safe_error": str,
    }, {"_record_invocation"})
    route = router["route_model"]("agent.chat", payload={"chatBackend": "upstream"})
    usage = {"prompt_tokens": 17, "completion_tokens": 11, "total_tokens": 28}
    receipt = {"actualModel": reported_model, "usage": usage}
    record = namespace["_record_invocation"]
    job = SimpleNamespace(owner_id=12, id="ordinary-turn")
    if status == "FAILED":
        with pytest.raises(ValueError) as mismatch:
            record(job, route, receipt, status="SUCCEEDED")
        assert not saved
        record(job, route, receipt, status="FAILED", error=mismatch.value)
    else:
        record(job, route, receipt, status="SUCCEEDED")
    assert len(saved) == 1
    assert (saved[0].actual_model, saved[0].provider, saved[0].usage, saved[0].status) == (
        reported_model, route["provider"], usage, status,
    )


def test_fresh_teacher_request_dispatches_official_only_and_records_measured_usage(router):
    sent = MagicMock(return_value={"model": "deepseek-flash", "text": "普通教学建议", "usage": {"prompt_tokens": 6}})
    records = []
    namespace = load_parts(RUNTIME / "jobs.py", {
        "route_model": router["route_model"],
        "validate_actual_model": router["validate_actual_model"], "PermanentJobError": ValueError,
        "ModelInvocations": SimpleNamespace,
        "db": SimpleNamespace(session=SimpleNamespace(add=records.append, commit=MagicMock())),
        "_safe_error": str, "_runtime_request_body": lambda *_: {"messages": [{"role": "user", "content": "{}"}]},
        "_runtime_json_bytes": lambda body: json.dumps(body).encode(), "_require_upstream_teacher_scope": MagicMock(),
        "_record_runtime_dispatch": MagicMock(), "requested_document_formats": lambda _payload: (),
        "upstream_enabled": lambda: True, "invoke_turn": sent,
        "_upstream_teacher_result": lambda _, text: {"answer": text},
        "json": json,
    }, {"_invoke_agent_runtime", "_record_invocation", "_prepare_model_request"})
    payload = {"chatBackend": "upstream", "prompt": "普通课堂准备建议"}
    job = SimpleNamespace(kind="agent.chat", thread_id="ordinary-thread", id="teacher-turn", owner_id=1)
    namespace.update(
        prepared_input=lambda _: None, _runtime_payload=lambda _: payload, assert_job_lease=lambda item: item,
        freeze_prepared=lambda _job, data, route: {"payload": data, "modelRoute": route},
    )
    prepared, route = namespace["_prepare_model_request"](job)
    reply = namespace["_invoke_agent_runtime"](job, route, prepared)
    invocation = namespace["_record_invocation"](job, route, reply["model"], status="SUCCEEDED")
    assert reply["result"] == {"answer": "普通教学建议"}
    assert "provider" not in reply["model"]
    assert (invocation.actual_model, invocation.provider, invocation.usage) == (
        "deepseek-flash", "deepseek", {"prompt_tokens": 6},
    )
    sent.assert_called_once()



class TestRuntimeError(ValueError):
    __test__ = False

    def __init__(self, message, **details):
        super().__init__(message)
        self.details = details


@pytest.fixture
def ordinary_jobs(router):
    router["config"].AGENT_RUNTIME_INTERNAL_URL = "http://classroom:3000/agent-runtime"
    router["config"].AGENT_RUNTIME_SERVICE_SECRET = "synthetic-test-secret"
    jobs = MagicMock()
    jobs.side_effect = lambda **values: SimpleNamespace(id="job", **values)
    jobs.query.filter_by.return_value.first.return_value = None
    revision = MagicMock()
    revision.query.filter_by.return_value.populate_existing.return_value.first.return_value = SimpleNamespace(sha256="source")
    return load_parts(RUNTIME / "jobs.py", {
        "TeachingJobs": jobs, "TeachingJobOutbox": SimpleNamespace, "TeachingMaterialRevisions": revision,
        "db": SimpleNamespace(session=MagicMock()), "append_job_event": MagicMock(),
        "get_trace_id": lambda: None, "uuid": uuid, "config": router["config"], "route_model": router["route_model"],
        "_ordinary_teaching_job_scope": MagicMock(), "upstream_enabled": MagicMock(return_value=True),
        "ordinary_debate_candidate": SimpleNamespace(explicit=lambda payload: payload.get("debate") is True,
                                                     admit=lambda payload, *_: payload),
        "ordinary_lesson_plan": SimpleNamespace(explicit_generation=lambda payload: payload.get("dedicated") is True,
                                                admit_generation=lambda payload, *_: payload, generation_model=MagicMock()),
        "_runtime_payload": lambda job: job.payload, "PermanentJobError": ValueError, "RuntimeJobError": TestRuntimeError,
        "_harness_courseware_authorized": lambda *_: False,
        "UPSTREAM_DEBATE_CANDIDATE_ROUTE": router["UPSTREAM_DEBATE_CANDIDATE_ROUTE"],
        "_runtime_read_timeout": lambda *_: 60, "AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS": (),
        "time": time, "requests": SimpleNamespace(post=MagicMock(), exceptions=SimpleNamespace(ConnectionError=ConnectionError)),
    }, {"enqueue_job", "_invoke_agent_runtime", "_admit_ordinary_teaching_job", "_require_ordinary_teaching_job",
        "_prepare_model_request", "_runtime_request_body", "_validate_ordinary_teaching_receipt"})


@pytest.mark.parametrize(("kind", "scope", "payload"), [
    ("candidate.generate", "candidate-plan", {"artifactType": "slide-deck"}),
    ("material.enrich", "material-summary", {"materialId": "material", "revisionId": "revision", "storageKey": "store"}),
])
def test_enqueue_and_retry_pin_ordinary_scope_and_authoritative_model(ordinary_jobs, kind, scope, payload):
    ordinary_jobs["_ordinary_teaching_job_scope"].return_value = scope
    call = ordinary_jobs["enqueue_job"]
    job, created = call(owner_id=1, dojo_id=2, kind=kind, idempotency_key="job",
                        payload={**payload, "ordinaryTeachingPin": {"model": "caller-model"}}, commit=False)
    assert created
    assert job.payload["ordinaryTeachingPin"]["scope"] == scope
    assert job.payload["ordinaryTeachingPin"]["model"] == "deepseek-flash"
    prepared, route = ordinary_jobs["_prepare_model_request"](job)
    assert route["route"] == "upstream-ordinary-teaching"
    assert route["required_model"] == route["actual_model"] == "deepseek-flash"
    assert route["allow_degraded"] is False
    body = ordinary_jobs["_runtime_request_body"](job, route, prepared)
    assert body["scope"]["ordinaryTeaching"] == scope
    assert body["scope"]["ordinaryTeachingPinned"] is True
    assert "ordinaryTeachingPin" not in body["payload"]
    meta = {"provider": "deepseek", "actualModel": "deepseek-flash", "modelVersion": "deepseek:deepseek-flash",
            "executionMode": f"ordinary-{scope}", "degraded": False,
            "usage": {"inputTokens": 2, "outputTokens": 3, "totalTokens": 5}}
    check = ordinary_jobs["_validate_ordinary_teaching_receipt"]
    check(job, prepared, route, {"model": meta})
    with pytest.raises(TestRuntimeError, match="有效用量"):
        check(job, prepared, route, {"model": {**meta, "usage": {}}})
    with pytest.raises(TestRuntimeError, match="指定 Harness 模型"):
        check(job, prepared, route, {"model": {**meta, "actualModel": "legacy-model"}})
    ordinary_jobs["upstream_enabled"].return_value = False
    with pytest.raises(TestRuntimeError, match="当前不可用"):
        ordinary_jobs["_prepare_model_request"](job)
    ordinary_jobs["upstream_enabled"].return_value = True
    ordinary_jobs["_ordinary_teaching_job_scope"].return_value = None
    with pytest.raises(ValueError, match="权限或资料版本已变化"):
        ordinary_jobs["_prepare_model_request"](job)


def test_ordinary_material_retry_rejects_a_changed_source_digest(ordinary_jobs):
    ordinary_jobs["_ordinary_teaching_job_scope"].return_value = "material-summary"
    job, _ = ordinary_jobs["enqueue_job"](
        owner_id=1, dojo_id=2, kind="material.enrich", idempotency_key="job", commit=False,
        payload={"materialId": "material", "revisionId": "revision", "storageKey": "store"},
    )
    query = ordinary_jobs["TeachingMaterialRevisions"].query
    query.filter_by.return_value.populate_existing.return_value.first.return_value.sha256 = "changed"
    with pytest.raises(ValueError, match="资料版本已变化"):
        ordinary_jobs["_prepare_model_request"](job)


@pytest.mark.parametrize("payload", [{"dedicated": True}, {"debate": True}])
def test_dedicated_candidate_admission_retains_priority(ordinary_jobs, payload):
    ordinary_jobs["_ordinary_teaching_job_scope"].return_value = "candidate-plan"
    job, _ = ordinary_jobs["enqueue_job"](
        owner_id=1, dojo_id=2, kind="candidate.generate", idempotency_key="job", commit=False, payload=payload,
    )
    assert "ordinaryTeachingPin" not in job.payload
    ordinary_jobs["_ordinary_teaching_job_scope"].assert_not_called()


def test_historical_candidate_still_uses_existing_route(ordinary_jobs):
    ordinary_jobs["_ordinary_teaching_job_scope"].return_value = "candidate-plan"
    payload = {"artifactType": "slide-deck"}
    job = SimpleNamespace(id="old", kind="candidate.generate", owner_id=1, dojo_id=2, module_index=0, payload=payload)
    prepared, route = ordinary_jobs["_prepare_model_request"](job)
    assert prepared == payload
    assert route["route"] == "teaching-default"
    assert "ordinaryTeachingPinned" not in ordinary_jobs["_runtime_request_body"](job, route, prepared)["scope"]



@pytest.mark.parametrize(("status", "content_type", "message"), [
    (200, "application/json; charset=utf-8", None),
    (200, "application/x-ndjson", "未返回 JSON"),
    (302, "text/html", "尚未提供普通教学接口"),
    (404, "application/json", "尚未提供普通教学接口"),
])
def test_ordinary_worker_sends_json_only_without_legacy_retry(ordinary_jobs, status, content_type, message):
    ordinary_jobs["_ordinary_teaching_job_scope"].return_value = "candidate-plan"
    job, _ = ordinary_jobs["enqueue_job"](
        owner_id=1, dojo_id=2, kind="candidate.generate", idempotency_key="job", commit=False,
        payload={"artifactType": "slide-deck", "prompt": "设计分数概念课"},
    )
    prepared, route = ordinary_jobs["_prepare_model_request"](job)
    response = MagicMock(status_code=status, headers={"Content-Type": content_type})
    response.json.return_value = {"success": True, "result": {"candidates": []}}
    post = ordinary_jobs["requests"].post
    post.return_value = response
    if message:
        with pytest.raises(TestRuntimeError, match=message):
            ordinary_jobs["_invoke_agent_runtime"](job, route, prepared)
    else:
        assert ordinary_jobs["_invoke_agent_runtime"](job, route, prepared) == response.json.return_value
    post.assert_called_once()
    assert post.call_args.args == ("http://classroom:3000/agent-runtime/api/integration/jobs/ordinary-teaching",)
    kwargs = post.call_args.kwargs
    assert kwargs["allow_redirects"] is False
    assert kwargs["headers"]["Accept"] == "application/json"
    assert kwargs["json"]["scope"]["ordinaryTeachingPinned"] is True
    assert "ordinaryTeachingPin" not in kwargs["json"]["payload"]
    response.close.assert_called_once()

"""Exercise the teacher worker's exact Harness model pin and invocation receipts."""

import ast
import hashlib
import json
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
            "UPSTREAM_DEBATE_CANDIDATE_ROUTE", "COMPLEX_KINDS", "COMPLEX_HINTS",
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

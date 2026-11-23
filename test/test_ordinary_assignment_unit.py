"""Offline contract for ordinary assignment drafting and review."""

import ast
import importlib.util
import json
import math
import sys
from copy import deepcopy
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest
import requests
from flask import Flask, request

from test_coursework_projection_unit import ROOT, load_functions


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, ROOT / "dojo_plugin" / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def generation(monkeypatch):
    client = load_module("ordinary_test_client", "agent_runtime/upstream_turn.py")
    standards = load_module("ordinary_test_standards", "authoring_standards/__init__.py")
    quality = load_module("ordinary_test_quality", "coursework_quality.py")
    answers = load_module("ordinary_test_answers", "coursework_answers.py")
    scope = type("ScopeError", (ValueError,), {})
    ns = {
        "math": math,
        "ScopeError": scope,
        "resolve_choice_answer": answers.resolve_choice_answer,
        "resolve_boolean_answer": answers.resolve_boolean_answer,
        "resolve_standards": standards.resolve,
        "standards_prompt": standards.prompt,
        "standards_provenance": standards.provenance,
        "review_generated_assignment": quality.review_generated_assignment,
        "DojoChallenges": Mock(),
        "DOJO_AI_AUTHORING_PLAN_MODEL": "old-configured-model",
        "model_json": Mock(),
        "_fallback_generated_items": Mock(side_effect=AssertionError("fallback is forbidden")),
        **{name: getattr(client, name) for name in (
            "invoke_turn", "ordinary_teaching_course", "request_body", "result_object", "upstream_enabled",
        )},
    }
    load_functions(ns, ROOT / "dojo_plugin/agent_runtime/scope.py", {"validate_module"})
    ordinary_path = ROOT / "dojo_plugin/coursework_ordinary.py"
    constants = [node for node in ast.parse(ordinary_path.read_text()).body if isinstance(node, ast.Assign)]
    load_functions(ns, ordinary_path, {
        "_nonempty_text", "normalize_ordinary_item", "ordinary_assignment_turn", "use_ordinary_assignment",
    }, constants)
    coursework_path = ROOT / "dojo_plugin/coursework.py"
    constants = [
        node for node in ast.parse(coursework_path.read_text()).body
        if isinstance(node, ast.Assign) and node.targets[0].id == "ASSIGNMENT_KINDS"
    ]
    load_functions(ns, coursework_path, {
        "_generated_item", "assignment_authoring_route", "generate_assignment_payload", "normalize_kind",
    }, constants)
    monkeypatch.setenv("DOJO_AI_ENABLED", "true")
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "-12053")
    monkeypatch.setenv("HARNESS_INTERNAL_URL", "http://synthetic-harness.invalid")
    monkeypatch.setenv("HARNESS_SERVICE_SECRET", "synthetic-test-secret")

    class Reply:
        status_code = 200

        def __init__(self, payload, model):
            self.payload = {"text": json.dumps(payload, ensure_ascii=False), "model": model}

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def json(self):
            return self.payload

    post = Mock()
    monkeypatch.setattr(client.requests.Session, "post", post)
    dojo = SimpleNamespace(
        dojo_id=-12053, id="synthetic-math", name="数学", modules=[SimpleNamespace(module_index=3)],
    )
    body = {"prompt": "出一道分母相同的分数加法单选题。", "questionCount": 1, "moduleIndex": 3}
    wrong = {
        "type": "MULTIPLE_CHOICE", "title": "同分母加法", "prompt": "1/5 + 2/5 等于多少？", "points": 10,
        "config": {"choices": ["2/5", "3/5", "3/10"], "correctAnswer": "3/10", "explanation": "分子和分母各自相加。"},
    }
    correct = deepcopy(wrong)
    correct["config"].update(correctAnswer="3/5", explanation="分母保持为 5，分子相加得到 3。")
    draft = {"title": "分数加法", "items": [wrong], "_agentMeta": {"model": "spoofed", "provider": "spoofed"}}
    review = {
        "issues": [{"index": 0, "message": "同分母相加保留原分母。"}],
        "replacements": [{"index": 0, "item": correct}],
    }
    return SimpleNamespace(
        ns=ns, generate=ns["generate_assignment_payload"], post=post, dojo=dojo, body=body,
        draft=draft, review=review, correct=correct, reply=Reply,
    )


@pytest.mark.parametrize("kind", ["HOMEWORK", "QUIZ"])
def test_math_draft_uses_text_turn_and_rechecks_correction(generation, kind):
    g = generation
    g.post.side_effect = [
        g.reply(g.draft, "draft-returned"),
        g.reply(g.review, "first-review-returned"),
        g.reply({"issues": [], "replacements": []}, "final-review-returned"),
    ]
    payload = g.generate({**g.body, "kind": kind}, g.dojo)

    assert payload["kind"] == kind
    assert payload["moduleIndex"] == 3
    assert payload["items"] == [g.correct]
    assert "实验" not in payload["instructions"]
    generation_meta = payload["settings"]["generation"]
    assert generation_meta["source"] == "official-dsh-text-turn"
    assert generation_meta["provider"] == "deepseek"
    assert generation_meta["model"] == "draft-returned"
    assert generation_meta["fallback"] is False
    assert generation_meta["qualityReview"] == {
        "status": "MODEL_REVIEWED", "rounds": 2, "correctedItemIndexes": [0],
        "model": "final-review-returned", "humanReviewed": False, "provider": "deepseek",
        "source": "official-dsh-text-turn", "roundModels": ["first-review-returned", "final-review-returned"],
    }
    calls = []
    for call in g.post.call_args_list:
        assert call.args == ("http://synthetic-harness.invalid/v1/turn",)
        assert call.kwargs["headers"]["Authorization"] == "Bearer synthetic-test-secret"
        assert call.kwargs["allow_redirects"] is False
        wire = json.loads(call.kwargs["data"])
        assert set(wire) == {"messages"}
        assert [message["role"] for message in wire["messages"]] == ["system", "user"]
        assert all(isinstance(message["content"], str) for message in wire["messages"])
        system, user = [message["content"] for message in wire["messages"]]
        assert "[type.quiz v1.0.0]" in system
        calls.append((system, json.loads(user)))
    assert calls[0][1]["prompt"] == g.body["prompt"]
    assert "独立的课程测验审校员" in calls[1][0]
    assert calls[1][1]["assignment"]["items"][0]["config"]["correctAnswer"] == "3/10"
    assert calls[2][1]["assignment"]["items"][0]["config"]["correctAnswer"] == "3/5"
    assert g.post.call_count == 3
    g.ns["model_json"].assert_not_called()
    g.ns["DojoChallenges"].query.filter.assert_not_called()


@pytest.mark.parametrize("bad_item", [True, False])
def test_failed_ordinary_turn_cannot_create_fallback_or_claim_review(generation, bad_item):
    g = generation
    if bad_item:
        g.draft["items"][0]["config"]["libraryPracticeDraftId"] = "not-a-text-question"
    g.post.side_effect = [g.reply(g.draft, "draft-returned"), requests.Timeout()]
    with pytest.raises(ValueError, match="有效文字题" if bad_item else "请求超时"):
        g.generate(g.body, g.dojo)
    assert g.post.call_count == (1 if bad_item else 2)
    g.ns["model_json"].assert_not_called()
    g.ns["_fallback_generated_items"].assert_not_called()


@pytest.mark.parametrize("case", ["module", "disabled"])
def test_ordinary_generation_checks_scope_and_availability_before_network(generation, monkeypatch, case):
    g = generation
    if case == "module":
        g.body["moduleIndex"] = 98
    else:
        monkeypatch.setenv("DOJO_AI_ENABLED", "false")

    with pytest.raises(ValueError, match="Module not found" if case == "module" else "当前未启用"):
        g.generate(g.body, g.dojo)
    g.post.assert_not_called()
    g.ns["model_json"].assert_not_called()


@pytest.mark.parametrize("case", ["other-course", "practice", "challenge-request"])
def test_nonordinary_requests_use_existing_generation_route(generation, case):
    g = generation
    if case == "other-course":
        g.dojo.dojo_id = 12054
    elif case == "practice":
        g.body["kind"] = "PRACTICE"
    else:
        g.body["challengeIds"] = [17]
        g.ns["DojoChallenges"].query.filter_by.return_value.first.return_value = None
    g.ns["DojoChallenges"].query.filter.return_value.order_by.return_value.all.return_value = []
    g.ns["model_json"].side_effect = [g.draft, {"issues": [], "replacements": []}]

    result = g.generate(g.body, g.dojo)

    assert "source" not in result["settings"]["generation"]
    assert g.ns["model_json"].call_count == 2
    g.post.assert_not_called()


def test_teacher_http_route_checks_course_before_model_and_keeps_failed_draft_unsaved(generation):
    g = generation
    api_path = ROOT / "dojo_plugin/api/v1/coursework.py"
    public_class = next(
        node for node in ast.parse(api_path.read_text()).body
        if isinstance(node, ast.ClassDef) and node.name == "CourseAssignmentGeneration"
    )
    post = next(node for node in public_class.body if isinstance(node, ast.FunctionDef) and node.name == "post")
    post.decorator_list = []
    scope_error = g.ns["ScopeError"]
    create = Mock()
    actor = SimpleNamespace(id=42)
    resolve_course = Mock(side_effect=scope_error("Dojo not found"))
    ns = {
        **g.ns, "request": request, "db": Mock(), "create_assignment": create, "dojo_for_user": resolve_course,
        "_user": lambda: actor, "assignment_view": lambda row, **kwargs: {"id": "fixture-draft"},
        "_error": lambda error, status, code: ({"error": str(error), "code": code}, status),
    }
    load_functions(ns, api_path, {"_body", "_ok"}, [post])
    app = Flask(__name__)
    app.add_url_rule("/dojos/<dojo_id>/assignments/generate",
                     view_func=lambda dojo_id: ns["post"](None, dojo_id), methods=["POST"])
    browser = app.test_client()
    url = "/dojos/synthetic-math/assignments/generate"

    response = browser.post(url, json=g.body)
    assert response.status_code == 404
    resolve_course.assert_called_once_with(actor, "synthetic-math", teacher=True)
    g.post.assert_not_called()
    create.assert_not_called()

    resolve_course.side_effect = None
    resolve_course.return_value = g.dojo
    g.post.side_effect = [g.reply(g.draft, "draft-returned"), requests.Timeout()]
    response = browser.post(url, json=g.body)
    assert response.status_code == 400
    assert "请求超时" in response.get_json()["error"]
    create.assert_not_called()
    ns["db"].session.commit.assert_not_called()

    resolve_course.side_effect = [g.dojo, scope_error("Dojo not found")]
    g.post.side_effect = [g.reply(g.draft, "draft-model"), g.reply({"issues": [], "replacements": []}, "review-model")]
    response = browser.post(url, json=g.body)
    assert response.status_code == 404
    assert resolve_course.call_args.args == (actor, g.dojo.dojo_id)
    create.assert_not_called()
    ns["db"].session.commit.assert_not_called()


@pytest.mark.parametrize("case", ["ordinary", "legacy", "old", "revoked", "module", "permission", "material"])
def test_durable_assignment_route_is_pinned_at_admission(generation, monkeypatch, case):
    g = generation
    actor = SimpleNamespace(id=42)
    action = SimpleNamespace(id=7, thread_id=12)
    thread = SimpleNamespace(status="ACTIVE", dojo_id=g.dojo.dojo_id, module_index=3)
    threads = Mock()
    threads.query.filter_by.return_value.first.return_value = thread
    resolve_dojo = Mock(return_value=g.dojo)
    db = Mock()
    stubs = {
        "CTFd.models": {"db": db},
        "ordinary_durable.coursework": {
            "assignment_authoring_route": g.ns["assignment_authoring_route"], "generate_assignment_payload": g.generate,
        },
        "ordinary_durable.coursework_ordinary": {
            key: g.ns[key] for key in ("ORDINARY_ASSIGNMENT_ROUTE", "LEGACY_ASSIGNMENT_ROUTE")
        },
        "ordinary_durable.models": {"TeachingAgentThreads": threads},
        "ordinary_durable.runtime.scope": {"dojo_for_user": resolve_dojo, "validate_module": g.ns["validate_module"]},
        "ordinary_durable.runtime.tool_registry": {"TOOL_HANDLERS": {"assignment.generate": None}},
    }
    for name, exports in stubs.items():
        module = ModuleType(name)
        vars(module).update(exports)
        monkeypatch.setitem(sys.modules, name, module)

    ns = {"__package__": "ordinary_durable.runtime", "_admit": lambda **kwargs: kwargs["operation"]}
    load_functions(ns, ROOT / "dojo_plugin/agent_runtime/commands.py", {"admit_teacher_tool"})
    load_functions(ns, ROOT / "dojo_plugin/agent_runtime/tool_executor.py", {"prepare_assignment"})
    operation = {
        "tool": "assignment.generate", "arguments": {**g.body, "moduleIndex": None},
        "scope": {"dojoId": g.dojo.dojo_id, "threadDojoId": g.dojo.dojo_id, "moduleIndex": 3},
    }
    if case == "legacy":
        monkeypatch.delenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS")
    if case == "material":
        operation["sourceRefs"] = [{"type": "material", "id": "synthetic-lesson"}]

    if case != "old":
        operation = ns["admit_teacher_tool"](action, actor, operation)
        expected_route = "legacy" if case in {"legacy", "material"} else "ordinary-dsh"
        assert operation["assignmentAuthoringRoute"] == expected_route
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "" if case == "revoked" else "-12053")
    if case == "module":
        g.dojo.modules = []
    if case == "permission":
        resolve_dojo.side_effect = g.ns["ScopeError"]("Dojo not found")
    g.post.side_effect = [g.reply(g.draft, "fixture"), g.reply({"issues": [], "replacements": []}, "fixture")]
    g.ns["model_json"].side_effect = [g.draft, {"issues": [], "replacements": []}]
    g.ns["DojoChallenges"].query.filter.return_value.order_by.return_value.all.return_value = []

    if case in {"revoked", "module", "permission"}:
        errors = {"revoked": "不符合普通作业生成条件", "module": "Module not found", "permission": "Dojo not found"}
        with pytest.raises(ValueError, match=errors[case]):
            ns["prepare_assignment"](operation, actor, 12)
        g.post.assert_not_called()
        g.ns["model_json"].assert_not_called()
    else:
        payload = ns["prepare_assignment"](operation, actor, 12)
        assert payload["moduleIndex"] == 3
        assert g.post.call_count == (2 if case == "ordinary" else 0)
        assert g.ns["model_json"].call_count == (0 if case == "ordinary" else 2)
    resolve_dojo.assert_called_once_with(actor, g.dojo.dojo_id, teacher=True)


def test_durable_retry_reuses_prepared_legacy_draft_without_outbound(generation, monkeypatch):
    g = generation
    action = SimpleNamespace(request_json={"legacyRequest": True})
    operation = {
        "kind": "teacher-tool", "tool": "assignment.generate", "request": action.request_json,
        "scope": {"dojoId": g.dojo.dojo_id, "threadDojoId": g.dojo.dojo_id, "moduleIndex": 3},
    }
    prepared = {"settings": {"generation": {"model": "old-authoring-model"}}, "items": [g.correct]}
    accepted = {"commandId": "command:7", "actionId": 7, "operation": operation}
    actor = SimpleNamespace(id=42, banned=False)
    thread = SimpleNamespace(id=12, status="ACTIVE", dojo_id=g.dojo.dojo_id, module_index=3)
    job = SimpleNamespace(id=15, owner_id=42, thread_id=12, status="RUNNING", canceled=None, payload={})
    prepare = Mock()
    apply = Mock(return_value=prepared)
    modules = {
        "ordinary_replay": {"__path__": []},
        "ordinary_replay.runtime": {"__path__": []},
        "ordinary_replay.runtime.jobs": {
            "JobCanceled": RuntimeError, "assert_job_lease": lambda job: job,
            "AUTHORING_LEASE_SECONDS": 3600, "_job_cancellation_requested": Mock(),
        },
        "ordinary_replay.runtime.approved_actions": {"apply_action": Mock(), "prepare_action": Mock()},
        "ordinary_replay.runtime.ordinary_project_queue": {"ACTION_PIN": "approvedOrdinaryAction"},
        "ordinary_replay.runtime.tool_executor": {"apply_teacher_tool": apply, "prepare_assignment": prepare},
        "ordinary_replay.runtime.scope": {"dojo_for_user": Mock(return_value=g.dojo)},
        "ordinary_replay.api.v1.teaching": {"_require_teacher": Mock()},
        "ordinary_replay.models": {"TeachingAgentThreads": Mock(), "Dojos": Mock()},
    }
    for name, exports in modules.items():
        module = ModuleType(name)
        vars(module).update(exports)
        monkeypatch.setitem(sys.modules, name, module)

    users, actions = Mock(), Mock()
    users.query.filter_by.return_value.populate_existing.return_value.first.return_value = actor
    actions.query.filter_by.return_value.with_for_update.return_value.populate_existing.return_value.first.return_value = action
    models = modules["ordinary_replay.models"]
    models["TeachingAgentThreads"].query.filter_by.return_value.with_for_update.return_value.populate_existing.return_value.first.return_value = thread
    models["Dojos"].query.filter_by.return_value.with_for_update.return_value.populate_existing.return_value.first.return_value = g.dojo
    ns = {
        "__package__": "ordinary_replay.runtime", "TERMINAL_STATES": {"SUCCEEDED", "FAILED", "CANCELED"},
        "accepted_command": Mock(return_value=accepted), "db": Mock(), "_append": Mock(),
        "Users": users, "TeachingAgentActions": actions,
        "reduce_command": Mock(return_value={"status": "QUEUED", "attempts": []}),
        "command_rows": Mock(return_value=[SimpleNamespace(event_type="command.prepared", payload={"prepared": prepared})]),
    }
    load_functions(ns, ROOT / "dojo_plugin/agent_runtime/commands.py", {"execute_command"})

    assert ns["execute_command"](job) is prepared
    apply.assert_called_once_with(job, operation, action, actor, thread, g.dojo, prepared=prepared)
    prepare.assert_not_called()
    g.post.assert_not_called()
    g.ns["model_json"].assert_not_called()

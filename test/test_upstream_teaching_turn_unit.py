import importlib.util
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest


RUNTIME = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime"


def load_file(name):
    spec = importlib.util.spec_from_file_location(name + "_fixture", RUNTIME / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


turn = load_file("upstream_turn")
model_context = load_file("teacher_model_context")
documents = load_file("teacher_documents")


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("HARNESS_INTERNAL_URL", "http://harness.test/")
    monkeypatch.setenv("HARNESS_SERVICE_SECRET", "synthetic-test-token")
    response = MagicMock()
    response.__enter__.return_value = response
    response.status_code = 200
    post = MagicMock(return_value=response)
    monkeypatch.setattr(turn.requests, "post", post)
    return post, response


def test_turn_sends_only_messages_and_returns_measured_usage(service):
    post, response = service
    response.json.return_value = {
        "text": "  教学答复  ",
        "model": "test-model",
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
    assert turn.invoke_turn(body, encoded=encoded) == {
        "text": "教学答复",
        "model": "test-model",
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }
    assert post.call_args.args == ("http://harness.test/v1/turn",)
    assert post.call_args.kwargs["data"] == encoded
    assert post.call_args.kwargs["allow_redirects"] is False
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer synthetic-test-token"


@pytest.mark.parametrize("status", [307, 401, 503])
def test_turn_rejects_http_failure_without_exposing_the_error_body(service, status):
    post, response = service
    response.status_code = status
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    with pytest.raises(turn.UpstreamTurnError, match=f"HTTP {status}"):
        turn.invoke_turn(body)
    response.json.assert_not_called()
    post.assert_called_once()


def test_turn_rejects_success_without_actual_model(service):
    _, response = service
    response.json.return_value = {"text": "教学答复"}
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    with pytest.raises(turn.UpstreamTurnError, match="未返回完整答复"):
        turn.invoke_turn(body)


@pytest.mark.parametrize(("setting", "configured", "expected"), [
    ("auto", "true", True),
    ("auto", "false", False),
    ("false", "true", False),
    ("true", "false", True),
])
def test_dedicated_configuration_controls_auto_mode(monkeypatch, setting, configured, expected):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("DOJO_AI_API_KEY", raising=False)
    monkeypatch.setenv("DOJO_AI_ENABLED", setting)
    monkeypatch.setenv("HARNESS_CONFIGURED", configured)
    assert turn.upstream_enabled() is expected


@pytest.mark.parametrize("backend", ["legacy", "upstream"])
@pytest.mark.parametrize("mode", ["ask", "plan", "execute"])
def test_teacher_request_omits_person_rows_from_both_model_backends(backend, mode):
    import ast
    from types import SimpleNamespace

    tree = ast.parse((RUNTIME / "jobs.py").read_text())
    functions = {"_runtime_request_body", "_harness_courseware_authorized"}
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in functions]
    namespace = {
        "request_body": turn.request_body,
        "requested_document_formats": documents.requested_document_formats,
        "DOCUMENT_INSTRUCTION": documents.DOCUMENT_INSTRUCTION,
        "scrub_payload": lambda value, **kwargs: value,
        "teacher_model_payload": model_context.teacher_model_payload,
        "teacher_platform_facts": model_context.teacher_platform_facts,
    }
    exec(compile(tree, "jobs.py", "exec"), namespace)
    opaque = "NEVER_SEND_PERSON_SENTINEL"
    person = {"name": opaque, "studentNumber": opaque, "userId": opaque, "averageAssessment": 88.6789}
    aggregate = {"studentCount": 34, "verifiedCompleteCount": 23}
    payload = {
        "chatBackend": backend,
        "executionMode": mode,
        "prompt": "继续准备关于科学读写的课程",
        "credentials": opaque,
        "scope": {"student": person},
        "context": {
            "thread": {"internalAudit": opaque},
            "platformFacts": {
                "scope": {"teacherId": opaque, "threadId": opaque, "moduleIndex": 0},
                "course": {"id": opaque, "referenceId": "course-ref", "name": "科学读写", "members": [person]},
                "availableCourses": [{"referenceId": "course-ref", "name": "科学读写", "modules": [{"index": 0, "name": "开篇"}]}],
                "verifiedProgress": {**aggregate, "students": [person]},
                "assignments": {"recent": [{"title": "小练习", "submissions": [person]}]},
                "pendingAttachments": [{"id": "material-ref", "filename": "讲义.txt", "uploadedBy": opaque}],
                "jobs": {"recent": [{"status": "READY", "error": opaque}]},
                "unknown": {"participants": [person]},
            },
            "agentLoop": {"trace": [{
                "tool": "course.update", "status": "verified",
                "observation": {"course": {"referenceId": "course-ref", "name": "科学读写", "members": [person]}},
            }]},
            "conversation": [{"role": "user", "content": "使用上节课的教学目标", "userId": opaque}],
        },
        "sourceMaterials": [{"id": "material-ref", "excerpts": [{"content": "选用讲义摘录", "authorId": opaque}]}],
    }
    job = SimpleNamespace(kind="agent.chat", id="job", owner_id=123, dojo_id=456, module_index=0)
    body = namespace["_runtime_request_body"](job, {"actual_model": "synthetic"}, payload)
    assert opaque not in json.dumps(body)
    assert "88.6789" not in json.dumps(body)
    if backend == "upstream":
        context = json.loads(body["messages"][-1]["content"])
        materials = context["sourceMaterials"]
    else:
        context = body["payload"]["context"]
        materials = body["payload"]["sourceMaterials"]
    facts = context["platformFacts"]
    assert facts["verifiedProgress"] == aggregate
    assert facts["scope"] == {"moduleIndex": 0}
    assert facts["availableCourses"][0]["referenceId"] == "course-ref"
    assert facts["pendingAttachments"][0]["id"] == "material-ref"
    assert facts["assignments"]["recent"] == [{"title": "小练习"}]
    assert context["conversation"] == [{"role": "user", "content": "使用上节课的教学目标"}]
    assert materials[0]["excerpts"][0]["content"] == "选用讲义摘录"

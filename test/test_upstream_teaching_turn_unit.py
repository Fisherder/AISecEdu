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
classroom = load_file("classroom_requests")


@pytest.mark.parametrize(("prompt", "expected"), [
    ("请生成普通教案候选：比较两片树叶的形状。", True),
    ("制作普通教案候选: 分组观察。\n请留出讨论时间。", True),
    ("请生成普通教案：比较两片树叶的形状。", False),
    ("请生成普通教案候选：", False),
    ("请生成普通教案候选：请交付 Word 文档。", False),
    ("如何生成普通教案候选：观察树叶？", False),
    ("不要生成普通教案候选：观察树叶。", False),
])
def test_teacher_explicitly_requests_comparable_lesson_plans(prompt, expected):
    assert documents.requests_lesson_plan_candidates(prompt) is expected


@pytest.mark.parametrize(("prompt", "name"), [
    ("请用已发布的课件《植物观察》准备课堂", "植物观察"),
    ("请准备一节课堂，使用《artifact_23》", "artifact_23"),
    ("准备课堂", ""),
    ("怎样用《植物观察》准备课堂？", None),
    ("不要用《植物观察》准备课堂", None),
    ("用《植物观察》准备课堂并开始上课", None),
    ("请总结植物观察", None),
])
def test_classroom_preparation_requires_the_teachers_own_request(monkeypatch, prompt, name):
    lookup = MagicMock(return_value={"artifactId": "local-id"})
    monkeypatch.setattr(classroom, "find_published_deck", lookup)
    payload = {"prompt": prompt, "chatBackend": "upstream", "classroomPreparation": {"artifactId": "stale"}}
    admitted = classroom.pin_classroom_request(payload, 8, -7, 0)
    if name:
        lookup.assert_called_once_with(name, 8, -7, 0)
        assert admitted["classroomPreparation"] == {"artifactId": "local-id"}
    else:
        lookup.assert_not_called()
        assert admitted.get("classroomPreparation") == ({} if name == "" else None)
    for extra in ({"executionMode": "ask"}, {"context": {"agentLoop": {"trace": [{"tool": "course.read"}]}}}):
        assert "classroomPreparation" not in classroom.pin_classroom_request({**payload, **extra}, 8, -7, 0)


def test_only_the_selected_public_metadata_reaches_the_model_and_the_proposal_is_canonical():
    pin = {"artifactId": "published-deck", "title": "植物观察", "expectedRevision": 3,
           "contentHash": "f" * 64, "teacherNotes": "PRIVATE-FIXTURE"}
    body = classroom.classroom_request_body(pin, turn.request_body)
    assert json.loads(body["messages"][1]["content"]) == {
        "publishedClassroomDeck": {"artifactId": "selected-deck"},
    }
    reply = {"tool": "classroom.prepare", "arguments": {
        "artifactId": "selected-deck", "title": "invented", "expectedRevision": 999, "contentHash": "wrong",
    }}
    result = classroom.classroom_proposal_result(pin, reply)
    assert result["toolProposals"][0]["arguments"] == {"artifactId": "published-deck"}
    assert "第 3 版" in result["answer"]
    for bad in (None, {"tool": "course.create", "arguments": {}},
                {"tool": "classroom.prepare", "arguments": {"artifactId": "other"}}):
        assert "toolProposals" not in classroom.classroom_proposal_result(pin, bad)
    assert "toolProposals" not in classroom.classroom_proposal_result({}, reply)


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


@pytest.mark.parametrize(("status", "category"), [
    (307, "permanent"), (400, "permanent"), (401, "permanent"), (403, "permanent"),
    (413, "permanent"), (422, "permanent"), (408, "service"), (429, "service"), (503, "service"),
])
def test_turn_rejects_http_failure_without_exposing_the_error_body(service, status, category):
    post, response = service
    response.status_code = status
    response.headers = {"Retry-After": "150"}
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    with pytest.raises(turn.UpstreamTurnError, match=f"HTTP {status}") as caught:
        turn.invoke_turn(body)
    assert caught.value.category == category
    assert caught.value.retry_after == ("150" if category == "service" else 0)
    response.json.assert_not_called()
    post.assert_called_once()


def test_worker_can_stop_unchanged_input_and_config_errors_without_a_model_call(service, monkeypatch):
    post, _ = service
    for credential, encoded in (("", b"{}"), ("synthetic-service", b"x" * (1024 * 1024 + 1))):
        monkeypatch.setenv("HARNESS_SERVICE_SECRET", credential)
        with pytest.raises(turn.UpstreamTurnError) as caught:
            turn.invoke_turn({}, encoded=encoded)
        assert caught.value.category == "permanent"
    post.assert_not_called()


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
    functions = {"_runtime_request_body", "_harness_courseware_authorized", "_ordinary_teaching_job_scope"}
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


@pytest.mark.parametrize(("expected", "included"), [(100, 100), (101, 100)])
def test_teacher_material_coverage_describes_the_scrubbed_model_input(expected, included):
    import ast
    import re
    from types import SimpleNamespace

    evidence = ast.parse((RUNTIME.parent / "learning" / "evidence.py").read_text())
    evidence_names = {"SENSITIVE_KEYS", "SENSITIVE_PATTERNS", "redact_text", "scrub_payload"}
    evidence.body = [
        node for node in evidence.body
        if getattr(node, "name", None) in evidence_names
        or (isinstance(node, ast.Assign) and node.targets[0].id in evidence_names)
    ]
    namespace = {
        "re": re,
        "request_body": turn.request_body,
        "teacher_model_payload": model_context.teacher_model_payload,
        "requested_document_formats": documents.requested_document_formats,
    }
    exec(compile(evidence, "evidence.py", "exec"), namespace)
    jobs = ast.parse((RUNTIME / "jobs.py").read_text())
    jobs.body = [node for node in jobs.body if getattr(node, "name", None) == "_runtime_request_body"]
    exec(compile(jobs, "jobs.py", "exec"), namespace)

    materials = [
        {"id": f"material-{i}", "title": f"普通课程资料 {i}", "analysis": {"summary": "观察植物生长。"}}
        for i in range(expected)
    ]
    source_refs = [{"type": "material", "id": material["id"]} for material in materials]
    coverage = {"expectedMaterialCount": expected, "includedMaterialCount": expected, "complete": True}
    payload = {
        "chatBackend": "upstream",
        "prompt": "概括课程资料",
        "sourceRefs": source_refs,
        "sourceMaterials": materials,
        "materialDossier": {"coverage": coverage, "materials": materials},
    }
    request = namespace["_runtime_request_body"](SimpleNamespace(kind="agent.chat"), {}, payload)
    context = json.loads(request["messages"][-1]["content"])
    expected_coverage = {
        "expectedMaterialCount": expected,
        "includedMaterialCount": included,
        "missingMaterialCount": expected - included,
        "complete": expected == included,
    }
    assert context["materialModelCoverage"] == expected_coverage
    assert context["materialDossier"]["coverage"].items() >= expected_coverage.items()
    material_ids = [material["id"] for material in materials[:included]]
    assert [row["id"] for row in context["materialDossier"]["materials"]] == material_ids
    assert [row["id"] for row in context["sourceMaterials"]] == material_ids
    assert [row["id"] for row in context["sourceRefs"]] == material_ids
    assert coverage["includedMaterialCount"] == expected and coverage["complete"] is True


def test_only_current_ordinary_course_session_can_send_a_new_teaching_image(monkeypatch):
    import ast
    from types import SimpleNamespace

    tree = ast.parse((RUNTIME.parent / "api/v1/teaching.py").read_text())
    resource = next(item for item in tree.body if isinstance(item, ast.ClassDef) and item.name == "AgentRuntimeIntrospect")
    method = next(item for item in resource.body if isinstance(item, ast.FunctionDef) and item.name == "post")
    method.decorator_list = []
    tree.body = [method]
    user = SimpleNamespace(id=11, name="Synthetic")
    scope = SimpleNamespace(user_id=11, role="student", dojo_id=3, workspace_id=None,
                            capabilities=("self-learning:chat",), as_dict=lambda: {})
    namespace = dict(
        require_service_auth=lambda: None, bearer_session_token=lambda: "synthetic scoped ticket",
        verify_session_token=lambda _: (user, scope, "session"), _ok=lambda body: body,
        _service_scoped_workspace=lambda *args: SimpleNamespace(quota={"modelTokens": 10}),
        _workspace_usage=lambda _: {"modelTokens": 10}, ordinary_teaching_image_allowed=turn.ordinary_teaching_image_allowed,
    )
    exec(compile(tree, "introspect.py", "exec"), namespace)
    def allowed():
        return namespace["post"](None)["ordinaryTeachingImageAllowed"]

    monkeypatch.setenv("DOJO_AI_ENABLED", "true")
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "3,-9")
    assert allowed()
    for course in (4, None, "3"):
        scope.dojo_id = course
        assert not allowed()
    scope.dojo_id = -9
    scope.user_id = 12
    assert not allowed()
    scope.user_id = 11
    scope.workspace_id = "limited"
    assert not allowed()
    scope.workspace_id = None
    scope.capabilities = ()
    assert not allowed()
    scope.role, scope.capabilities = "teacher", ("agent:chat",)
    assert allowed()
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "4,broken,-9")
    assert not allowed()
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "-9")
    monkeypatch.setenv("DOJO_AI_ENABLED", "false")
    assert not allowed()

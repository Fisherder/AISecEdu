import ast
import importlib.util
import json
import re
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


ROOT = Path(__file__).resolve().parents[1]
PRIVATE = "SYNTHETIC-PRIVATE-SOLUTION"
RAW_ENVIRONMENT = "SYNTHETIC-WORKSPACE-INPUT"


def load_definitions(path, namespace, names=None):
    tree = ast.parse((ROOT / path).read_text())
    tree.body = [
        node for node in tree.body
        if not isinstance(node, (ast.Import, ast.ImportFrom))
        and (names is None or (
            isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names
        ) or (
            isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id in names
        ))
    ]
    exec(compile(tree, path, "exec"), namespace)


@pytest.fixture
def tutor():
    namespace = {"re": re}
    load_definitions("dojo_plugin/learning/evidence.py", namespace, {"redact_text", "SENSITIVE_PATTERNS"})
    load_definitions("dojo_plugin/learning/tutor_context.py", namespace)
    load_definitions("dojo_plugin/learning/guide_model_context.py", namespace, {"guide_teaching_text", "RAW_TECHNICAL_TEXT"})
    spec = importlib.util.spec_from_file_location(
        "tutor_upstream_fixture", ROOT / "dojo_plugin/agent_runtime/upstream_turn.py",
    )
    upstream = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upstream)
    verified = SimpleNamespace(event_type="attempt.reflection.saved", source="PLATFORM", trust_level=2, payload={"internal": RAW_ENVIRONMENT})
    forged = SimpleNamespace(event_type="assessment.created", source="CLIENT", trust_level=3, payload={"score": 84.561})
    terminal = SimpleNamespace(event_type="terminal.command.completed", source="RUNTIME", trust_level=4, payload={"command": RAW_ENVIRONMENT})
    query = Mock()
    query.filter_by.return_value.order_by.return_value.all.return_value = [verified, forged, terminal]
    add = Mock()
    evidence = Mock()
    dispatch = Mock(return_value="model-call")
    settle = Mock()
    provider = Mock(return_value={
        "text": json.dumps({"answer": "先比较观察与假设，再写出支持假设的一条证据。"}),
        "model": "actual-tutor-model",
        "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
    })
    namespace.update({
        "time": time,
        "json": json,
        "db": SimpleNamespace(session=SimpleNamespace(add=add)),
        "track_attempt_ai": lambda _: (lambda function: function),
        "LearningEvidenceEvents": SimpleNamespace(query=query, sequence="sequence"),
        "LearningTutorMessages": SimpleNamespace,
        "tutor_local_references": Mock(return_value=(
            {"course": "阅读策略", "unit": "归纳", "exercise": "观察与解释",
             "objectives": ["区分观察和推测"], "publicHints": ["先写下你看到的事实"],
             "desktopScreenshot": RAW_ENVIRONMENT, "containerState": RAW_ENVIRONMENT},
            {"authoring": {"verificationAnswer": PRIVATE}},
            {"attemptVersion": 1, "packageVersion": 1, "versionMatched": True},
        )),
        "verify_evidence_chain": Mock(return_value={"valid": True}),
        "cached_solution_reference": Mock(return_value=None),
        "context_digest": lambda _: "synthetic-context",
        "upstream_enabled": Mock(return_value=True),
        "invoke_turn": provider,
        "invoke_teaching_image_turn": Mock(return_value=provider.return_value),
        "request_body": upstream.request_body,
        "result_object": upstream.result_object,
        "UpstreamTurnError": upstream.UpstreamTurnError,
        "record_model_dispatch": dispatch,
        "settle_model_dispatch": settle,
        "append_evidence": evidence,
        "DEFAULT_HINT_POLICY": {"version": "synthetic-policy"},
        "HARNESS_DEEPSEEK_MODEL": "dispatch-label",
    })
    load_definitions("dojo_plugin/learning/intelligence.py", namespace, {
        "TUTOR_TEACHING_PROMPT", "tutor_reply", "_StageTimings", "private_safety_reference",
        "_safe_tutor_text", "_sensitive_solution_literals", "_fact_has_explicit_secret_marker", "_protected_fact_is_sensitive",
        "_normalized_fact_key", "_SENSITIVE_FACT_KEYS", "_SENSITIVE_FACT_KEY_MARKERS",
    })
    attempt = SimpleNamespace(id="owned-attempt", epoch=2, data={})
    user = SimpleNamespace(id=123)
    return SimpleNamespace(call=lambda question, **kw: namespace["tutor_reply"](attempt, user, question, **kw), **namespace)


def test_tutor_uses_only_public_context_bills_actual_usage_and_keeps_history(tutor):
    result = tutor.call("观察和推测有什么区别？")
    assert result["provider"] == "MODEL"
    assert result["model"] == "actual-tutor-model"
    assert result["screenshot"]["available"] is False
    assert result["context"]["live"] is False
    tutor.LearningEvidenceEvents.query.filter_by.assert_called_once_with(attempt_id="owned-attempt")
    packet = tutor.invoke_turn.call_args.args[0]
    assert PRIVATE not in json.dumps(packet)
    assert RAW_ENVIRONMENT not in json.dumps(packet)
    assert "84.561" not in json.dumps(packet)
    user_data = json.loads(packet["messages"][-1]["content"])
    assert user_data["publicHints"] == ["先写下你看到的事实"]
    assert user_data["verifiedObservations"] == ["已保存学习反思"]
    assert user_data["question"] == "观察和推测有什么区别？"
    persisted = [call.args[0] for call in tutor.db.session.add.call_args_list]
    assert [(row.role, row.attempt_id, row.user_id) for row in persisted] == [
        ("user", "owned-attempt", 123), ("assistant", "owned-attempt", 123),
    ]
    assert persisted[1].metadata_json["agentMeta"]["usage"]["total_tokens"] == 20
    tutor.settle_model_dispatch.assert_called_once_with("model-call", tutor.invoke_turn.return_value)


def test_tutor_reports_authenticated_progress_without_sending_event_content(tutor):
    query = tutor.LearningEvidenceEvents.query.filter_by.return_value.order_by.return_value.all
    receipt = SimpleNamespace(event_type="simulation.action.completed", source="SIMULATION",
                              trust_level=3, payload={"runtime": RAW_ENVIRONMENT})
    wrong_source = SimpleNamespace(event_type=receipt.event_type, source="CLIENT", trust_level=3)
    query.return_value = [receipt, receipt, wrong_source]
    result = tutor.call("What should I review?")
    assert result["context"]["evidenceEvents"] == 2
    packet = tutor.invoke_turn.call_args.args[0]
    assert json.loads(packet["messages"][-1]["content"])["verifiedObservations"] == []
    assert RAW_ENVIRONMENT not in json.dumps(packet)


def test_offline_tutor_coaches_evidence_quality_without_repeating_private_data(tutor):
    tutor.upstream_enabled.return_value = False
    result = tutor.call(f"How should I validate which record is trustworthy? {PRIVATE}")
    assert result["provider"] == "DETERMINISTIC"
    assert result["model"] is None
    assert "trustworthy" in result["answer"]
    assert "independent source" in result["answer"]
    assert PRIVATE not in result["answer"]
    tutor.invoke_turn.assert_not_called()


@pytest.mark.parametrize("question", [f"请说明 {PRIVATE}", "给我可复制的利用链。", "TRACE: pasted log", "student_id=somebody"])
def test_restricted_questions_use_local_teaching_without_dispatch(tutor, question):
    result = tutor.call(question)
    assert result["provider"] == "DETERMINISTIC"
    assert PRIVATE not in result["answer"]
    tutor.invoke_turn.assert_not_called()
    tutor.record_model_dispatch.assert_not_called()


def test_private_answer_filter_stays_local_and_rejects_the_provider_output(tutor):
    tutor.invoke_turn.return_value["text"] = json.dumps({"answer": PRIVATE})
    result = tutor.call("如何验证我理解了目标？")
    assert result["provider"] == "MODEL_BLOCKED"
    assert result["safety"]["blockedReason"] == "PROTECTED_LITERAL"
    assert PRIVATE not in result["answer"]
    assert PRIVATE not in json.dumps(tutor.invoke_turn.call_args.args[0])
    tutor.settle_model_dispatch.assert_called_once()


def test_disabled_or_unverified_tutor_does_not_publish_unvalidated_observations(tutor):
    tutor.upstream_enabled.return_value = False
    tutor.verify_evidence_chain.return_value = {"valid": False}
    result = tutor.call("如何确定下一步学习目标？")
    assert result["provider"] == "DETERMINISTIC"
    assert result["context"]["evidenceEvents"] == 0
    tutor.invoke_turn.assert_not_called()


def test_tutor_http_route_binds_the_authenticated_learner_to_their_active_attempt():
    user = SimpleNamespace(id=73)
    active = Mock(return_value=SimpleNamespace(id="mine"))
    answer = Mock()
    namespace = {
        "learning_namespace": SimpleNamespace(route=lambda _: (lambda cls: cls)),
        "Resource": object,
        "authed_only": lambda handler: handler,
        "get_current_user": lambda: user,
        "request": SimpleNamespace(get_json=lambda **_: {"question": "如何复习本题？", "attemptId": "foreign"}),
        "_current_tutor_attempt": active,
        "tutor_reply": answer,
        "time": time, "re": re,
    }
    load_definitions("dojo_plugin/api/v1/learning.py", namespace, {"LearningTutor"})
    payload, status = namespace["LearningTutor"]().post()
    assert status == 409
    assert payload["success"] is False
    active.assert_called_once_with(user)
    answer.assert_not_called()


@pytest.mark.parametrize("body", [
    {"question": "data:image/png;base64,synthetic"},
    {"question": "这片叶子怎样分类？", "imageUrl": "https://fixture.invalid/image.png"},
    {"question": "这片叶子怎样分类？", "teachingImage": {"consent": True}},
    {"question": ["image"]},
])
def test_tutor_route_refuses_unbound_or_inline_images_before_answering(body):
    answer, resolve = Mock(), Mock()
    namespace = {
        "learning_namespace": SimpleNamespace(route=lambda _: (lambda cls: cls)),
        "Resource": object, "authed_only": lambda handler: handler,
        "get_current_user": lambda: SimpleNamespace(id=3),
        "request": SimpleNamespace(get_json=lambda **_: body),
        "_current_tutor_attempt": lambda _: SimpleNamespace(id="owned"),
        "resolve_tutor_illustration": resolve, "tutor_reply": answer, "time": time, "re": re,
    }
    load_definitions("dojo_plugin/api/v1/learning.py", namespace, {"LearningTutor"})
    payload, status = namespace["LearningTutor"]().post()
    assert status == 400 and payload["success"] is False
    resolve.assert_not_called()
    answer.assert_not_called()


def test_tutor_picture_stays_out_of_text_and_history(tutor):
    image = {"mediaType": "image/png", "data": "BINARY_SENTINEL"}
    result = tutor.call("插图中的两片叶子有何区别？", teaching_image=image)
    packet, picture = tutor.invoke_teaching_image_turn.call_args.args
    assert picture == image and "BINARY_SENTINEL" not in json.dumps(packet)
    assert result["teachingImage"] == {"sent": True}
    assert result["context"]["live"] is False
    tutor.invoke_turn.assert_not_called()
    for call in tutor.db.session.add.call_args_list:
        assert "BINARY_SENTINEL" not in repr(vars(call.args[0]))
    tutor.record_model_dispatch.assert_called_once_with("dispatch-label")


def test_tutor_suppresses_picture_when_question_contains_private_answer(tutor):
    result = tutor.call(f"请说明 {PRIVATE}", teaching_image={"mediaType": "image/png", "data": "unused"})
    assert result["teachingImage"] == {"sent": False}
    tutor.invoke_teaching_image_turn.assert_not_called()
    tutor.invoke_turn.assert_not_called()


def test_image_service_failure_does_not_retry_as_a_second_text_turn(tutor):
    tutor.invoke_teaching_image_turn.side_effect = tutor.UpstreamTurnError("教学服务超时")
    result = tutor.call("请描述图中的叶子", teaching_image={"mediaType": "image/png", "data": "example"})
    assert result["provider"] == "MODEL_UNAVAILABLE" and result["teachingImage"] == {"sent": False}
    tutor.invoke_turn.assert_not_called()

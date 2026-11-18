import ast
import datetime
import importlib.util
import json
import logging
import re
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


ROOT = Path(__file__).resolve().parents[1]
PRIVATE = "NEVER_SEND_PRIVATE_STUDENT_FACT"
REFERENCE = "science/intro/observation"


def load_definitions(path, namespace, names=None):
    tree = ast.parse((ROOT / path).read_text())
    tree.body = [
        node for node in tree.body
        if not isinstance(node, ast.ImportFrom)
        and (names is None
             or isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names
             or isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in names)
    ]
    exec(compile(tree, path, "exec"), namespace)


@pytest.fixture
def guide():
    namespace = {"re": re}
    load_definitions("dojo_plugin/learning/evidence.py", namespace, {"redact_text", "SENSITIVE_PATTERNS"})
    load_definitions("dojo_plugin/learning/tutor_context.py", namespace, {"RESTRICTED_TUTOR_REQUEST"})
    load_definitions("dojo_plugin/learning/guide_model_context.py", namespace)
    load_definitions("dojo_plugin/learning/guide_prompts.py", namespace)
    spec = importlib.util.spec_from_file_location(
        "guide_upstream_fixture", ROOT / "dojo_plugin/agent_runtime/upstream_turn.py",
    )
    upstream = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upstream)
    evidence = {"id": PRIVATE, "userId": PRIVATE, "score": 99.321, "commandOutput": PRIVATE}
    profile = {
        "learner": {"id": PRIVATE, "name": PRIVATE},
        "summary": {"completedExercises": 4, "studentId": PRIVATE},
        "courses": [{"name": "科学课程", "url": "/science", "id": PRIVATE}],
        "recentAttempts": [evidence],
        "recommendations": [evidence],
    }
    exercise = {
        "id": REFERENCE,
        "course": "科学课程",
        "unit": "入门",
        "exercise": "区分观察和推测",
        "completed": True,
        "objectives": ["区分观察和推测"],
        "attemptCount": 3,
        "verifiedEvidenceCount": 2,
        "attempts": [evidence],
        "interfaces": [evidence],
        "privateAnswer": PRIVATE,
        "url": "/science/intro/observation",
    }
    thread = SimpleNamespace(id="owned", context={}, title="对话", messages=[
        SimpleNamespace(role="assistant", content=PRIVATE, metadata_json={"references": [{"id": REFERENCE}]}),
        SimpleNamespace(role="user", content="怎样写观察笔记？", metadata_json={
            "modelContextVersion": namespace["CONTEXT_VERSION"],
            "references": [{"id": REFERENCE}],
            "learnerId": PRIVATE,
        }),
    ])
    provider = Mock(return_value={
        "text": json.dumps({
            "answer": "区分观察和推测：先记录看到的现象，再说明自己的解释。",
            "usedReferenceIds": [REFERENCE],
            "actions": [
                {"resourceId": "course-option-1", "label": "打开学习资料"},
                {"resourceId": PRIVATE, "url": "https://external.test"},
            ],
        }),
        "model": "mock", "usage": {"prompt_tokens": 8},
    })
    namespace.update({
        "datetime": datetime, "json": json, "re": re, "logging": logging,
        "logger": logging.getLogger("guide_fixture"),
        "requests": SimpleNamespace(RequestException=Exception),
        "db": SimpleNamespace(session=SimpleNamespace(add=Mock(), flush=Mock())),
        "LearningGuideMessages": lambda **fields: SimpleNamespace(
            id=1, created=datetime.datetime.now(datetime.timezone.utc), **fields,
        ),
        "guide_thread_view": lambda thread: {"id": thread.id, "referenceIds": thread.context.get("referencedExerciseIds", [])},
        "context_digest": lambda _: "synthetic-digest",
        "learning_profile_context": Mock(return_value=profile),
        "guide_reference_summaries": Mock(side_effect=lambda _, __, refs: [exercise] if refs == [REFERENCE] else []),
        "guide_reference_catalog": lambda _: [exercise],
        "active_attempt": Mock(return_value=SimpleNamespace(
            id=PRIVATE, dojo_challenge=SimpleNamespace(reference_id=REFERENCE), container=evidence,
        )),
        "usage_scope": lambda *_: nullcontext(),
        "upstream_enabled": Mock(return_value=True),
        "invoke_turn": provider,
        "request_body": upstream.request_body,
        "result_object": upstream.result_object,
        "UpstreamTurnError": upstream.UpstreamTurnError,
        "record_model_dispatch": Mock(return_value="usage-id"),
        "settle_model_dispatch": Mock(),
        "sanitize_tool_calls": lambda value: value or [],
        "student_resource_reference_for_url": Mock(return_value={"objectType": "exercise", "objectId": REFERENCE}),
        "DOJO_AI_GUIDE_MODEL": "dispatch-label",
    })
    load_definitions("dojo_plugin/learning/intelligence.py", namespace, {
        "GuideReferenceSelectionError", "guide_reply", "_guide_reference_ids", "_guide_message_reference_ids",
        "_guide_scoped_history", "_guide_scope_conflicts", "_guide_needs_reference", "_guide_fallback",
        "_safe_guide_text", "_guide_navigation_options", "_GUIDE_EXPLICIT_REFERENCE_PATTERN",
    })
    def call(question, references=None):
        return namespace["guide_reply"](
            SimpleNamespace(id=123, name=PRIVATE), question, thread, references,
            {"workspaces": [evidence], "memory": [evidence], "publishedArtifacts": [evidence]},
        )
    return SimpleNamespace(call=call, **namespace)


def test_actual_guide_turn_only_sends_selected_public_fields_and_safe_history(guide):
    result = guide.call("怎么区分观察和推测？", [REFERENCE])
    assert result["provider"] == "MODEL"
    assert result["contextCoverage"]["activeAttempt"] is True
    assert result["contextCoverage"]["environmentAvailable"] is False
    assert result["contextCoverage"]["referencedAttempts"] == 3
    assert result["contextCoverage"]["referencedEvidenceEvents"] == 2
    assert result["message"]["metadata"]["scopeValidation"]["status"] == "VALIDATED"
    body = guide.invoke_turn.call_args.args[0]
    serialized = json.dumps(body)
    assert PRIVATE not in serialized
    assert "99.321" not in serialized
    assert "verifiedEvidenceCount" not in serialized
    assert "studentWorkspace" not in serialized
    assert "activeStudyContext" not in serialized
    data = json.loads(body["messages"][-1]["content"])
    assert data["scope"]["referenceIds"] == [REFERENCE]
    assert data["referencedStudyContexts"] == [{
        "id": REFERENCE, "course": "科学课程", "unit": "入门", "exercise": "区分观察和推测",
        "completed": True, "objectives": ["区分观察和推测"], "attemptCount": 3,
    }]
    assert data["conversation"] == [{"role": "user", "content": "怎样写观察笔记？"}]
    assert data["navigationOptions"] == [{"id": "course-option-1", "title": "区分观察和推测"}]
    assert len(result["message"]["metadata"]["actions"]) == 1
    assert result["message"]["metadata"]["actions"][0]["url"] == "/science/intro/observation"
    guide.settle_model_dispatch.assert_called_once_with("usage-id", guide.invoke_turn.return_value)


def test_unselected_profile_turn_sends_only_own_aggregate_and_navigation_alias(guide):
    guide.invoke_turn.return_value["text"] = json.dumps({"answer": "先把当前知识点整理成一条可查证的总结。"})
    guide.call("给我一个普通复习建议", [])
    data = json.loads(guide.invoke_turn.call_args.args[0]["messages"][-1]["content"])
    assert PRIVATE not in json.dumps(data)
    assert data["learningProfile"] == {"completedExercises": 4}
    assert data["referencedStudyContexts"] == []
    assert data["conversation"] == []


def test_raw_experiment_input_is_kept_off_model_and_redirected_to_teacher(guide):
    result = guide.call("分析终端日志\nERROR: " + PRIVATE, [REFERENCE])
    assert result["provider"] == "DETERMINISTIC"
    assert "任课教师" in result["message"]["content"]
    guide.invoke_turn.assert_not_called()


def test_inaccessible_reference_is_rejected_before_model_dispatch(guide):
    with pytest.raises(guide.GuideReferenceSelectionError):
        guide.call("解释这道题的学习目标", ["no-access"])
    guide.invoke_turn.assert_not_called()


def test_disabled_guide_keeps_offline_feedback_without_provider_call(guide):
    guide.upstream_enabled.return_value = False
    result = guide.call("如何复习公开学习目标？", [REFERENCE])
    assert result["provider"] == "DETERMINISTIC"
    assert "已记录 3 次尝试" in result["message"]["content"]
    guide.invoke_turn.assert_not_called()
    guide.record_model_dispatch.assert_not_called()


def test_guide_inherits_saved_selection_and_explicit_empty_selection_clears_scope(guide):
    guide.upstream_enabled.return_value = False
    selected = guide.call("怎样复习？", [REFERENCE])
    assert selected["thread"]["referenceIds"] == [REFERENCE]
    inherited = guide.call("下一步？")
    assert inherited["message"]["metadata"]["scopeValidation"]["status"] == "DETERMINISTIC"
    assert inherited["contextCoverage"]["referencedAttempts"] == 3
    assert inherited["contextCoverage"]["referencedEvidenceEvents"] == 2
    cleared = guide.call("改成一般复习建议", [])
    assert cleared["thread"]["referenceIds"] == []
    assert cleared["contextCoverage"]["scopeMode"] == "PROFILE"
    assert cleared["contextCoverage"]["referencedAttempts"] == 0
    assert cleared["contextCoverage"]["referencedEvidenceEvents"] == 0
    assert cleared["message"]["metadata"]["scopeValidation"]["status"] == "NOT_APPLICABLE"
    guide.invoke_turn.assert_not_called()


def test_unbounded_reference_lookup_requires_current_visibility_and_counts_own_verified_receipts():
    user = SimpleNamespace(id=123, type="user")
    course_id = "science~00000001"
    reference = f"{course_id}/intro/observation"
    saved_reference = f"{course_id}/intro/review"
    module = SimpleNamespace(id="intro", name="入门", visible=Mock(return_value=True))
    course = SimpleNamespace(reference_id=course_id, name="科学", modules=[module])
    challenge = SimpleNamespace(id="observation", name="观察", reference_id=reference, dojo=course,
                                module=module, exercise_mode="CONTAINER", visible=Mock(return_value=True),
                                dojo_id=1, module_index=2, challenge_index=3, challenge_id=4)
    saved = SimpleNamespace(id="review", name="复习", reference_id=saved_reference, dojo=course,
                            module=module, exercise_mode="CONTAINER", visible=Mock(return_value=True))
    module.challenges = [challenge, saved]
    access_query = Mock()
    access_query.first.return_value = course
    own_attempts = Mock()
    own_attempts.count.return_value = 7
    own_attempts.order_by.return_value.limit.return_value.all.return_value = [
        SimpleNamespace(id="verified"), SimpleNamespace(id="broken"),
    ]
    evidence_query = Mock()
    evidence_query.filter_by.return_value.order_by.return_value.all.return_value = [
        SimpleNamespace(source="PLATFORM", trust_level=3, payload={"private": PRIVATE}),
        SimpleNamespace(source="CLIENT", trust_level=3, payload={"private": PRIVATE}),
    ]
    namespace = {
        "Dojos": SimpleNamespace(viewable=Mock(return_value=access_query)),
        "LearningAttempts": SimpleNamespace(query=SimpleNamespace(filter_by=Mock(return_value=own_attempts)),
                                            started=SimpleNamespace(desc=Mock())),
        "LearningEvidenceEvents": SimpleNamespace(query=evidence_query, sequence="sequence"),
        "LearningChallengeProfiles": SimpleNamespace(query=SimpleNamespace(get=Mock(return_value=None))),
        "verify_evidence_chain": Mock(side_effect=lambda attempt_id, **_: {"valid": attempt_id == "verified"}),
    }
    load_definitions("dojo_plugin/learning/context.py", namespace, {
        "guide_reference_catalog", "guide_reference_options", "_visible_guide_challenge",
        "_guide_reference_option", "_guide_evidence_count", "guide_reference_summaries",
    })
    profile = {"courses": [], "recentAttempts": [{
        "referenceId": reference, "courseId": course_id, "moduleId": "intro", "challengeId": "observation",
        "status": "ACTIVE", "reflection": PRIVATE,
    }]}
    options = namespace["guide_reference_options"]
    summaries = namespace["guide_reference_summaries"]
    items = options(user, profile, [saved_reference])
    assert [item["id"] for item in items] == [reference, saved_reference]
    assert items[0]["recentAttempts"] == 1
    summary = summaries(user, profile, [reference])[0]
    assert summary["attemptCount"] == 7
    assert summary["verifiedEvidenceCount"] == 1
    assert PRIVATE not in json.dumps([items, summary])
    namespace["LearningAttempts"].query.filter_by.assert_called_once_with(
        user_id=user.id, dojo_id=1, module_index=2, challenge_index=3,
    )
    namespace["Dojos"].viewable.assert_called_with(id=course_id, user=user)
    challenge.visible.return_value = False
    assert [item["id"] for item in options(user, profile, [saved_reference])] == [saved_reference]
    assert summaries(user, profile, [reference]) == []
    access_query.first.return_value = None
    assert options(user, profile, [saved_reference]) == []
    assert summaries(user, profile, [reference]) == []
    assert namespace["LearningAttempts"].query.filter_by.call_count == 1


def test_guide_blocks_model_answers_outside_the_selected_course_scope(guide):
    guide.invoke_turn.return_value["text"] = json.dumps({
        "answer": "这是另一个课程的结论。", "usedReferenceIds": ["other/course/exercise"],
    })
    result = guide.call("怎么区分观察和推测？", [REFERENCE])
    assert result["provider"] == "MODEL_SCOPE_BLOCKED"
    assert result["message"]["metadata"]["scopeValidation"]["status"] == "BLOCKED"
    assert result["contextCoverage"]["referencedEvidenceEvents"] == 2
    assert "另一个课程的结论" not in result["message"]["content"]

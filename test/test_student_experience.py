import importlib.util
import pathlib

import pytest


MODULE_PATH = pathlib.Path(__file__).parents[1] / "dojo_plugin" / "learning" / "student_experience.py"
SPEC = importlib.util.spec_from_file_location("student_experience_under_test", MODULE_PATH)
STUDENT_EXPERIENCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STUDENT_EXPERIENCE)


def test_student_experience_state_contracts_do_not_conflate_unknown_and_zero():
    assessment_state = STUDENT_EXPERIENCE.assessment_state
    evidence_state = STUDENT_EXPERIENCE.evidence_state
    mastery_state = STUDENT_EXPERIENCE.mastery_state
    progress_contract = STUDENT_EXPERIENCE.progress_contract

    assert mastery_state(None, evidence_count=0) == {
        "state": "UNKNOWN",
        "value": None,
        "label": "证据不足",
    }
    assert assessment_state(None, activity="SUBMITTED") == "PENDING"
    assert evidence_state(count=4, valid=True, complete=True) == "COMPLETE"
    assert progress_contract(0, 0)["percent"] is None
    assert progress_contract(0, 0)["state"] == "NOT_APPLICABLE"


def test_student_telemetry_accepts_only_the_six_privacy_safe_events():
    TELEMETRY_EVENTS = STUDENT_EXPERIENCE.TELEMETRY_EVENTS
    sanitize_telemetry = STUDENT_EXPERIENCE.sanitize_telemetry

    assert set(TELEMETRY_EVENTS) == {
        "student_next_action_viewed",
        "student_next_action_started",
        "learning_context_transition",
        "resource_action_resolved",
        "student_error_recovered",
        "lab_start_state_changed",
    }
    assert sanitize_telemetry(
        "student_next_action_started",
        {"type": "ASSIGNMENT", "latencyMs": 420, "sourcePage": "today"},
    ) == {
        "type": "ASSIGNMENT",
        "latencyMs": 420,
        "sourcePage": "today",
    }
    with pytest.raises(ValueError):
        sanitize_telemetry(
            "student_next_action_started",
            {"type": "LAB", "latencyMs": 1, "sourcePage": "today", "flag": "private"},
        )
    with pytest.raises(ValueError):
        sanitize_telemetry("unregistered_event", {})


def test_student_experience_rollout_is_deterministic_and_reversible(monkeypatch):
    student_ux_rollout = STUDENT_EXPERIENCE.student_ux_rollout

    monkeypatch.setenv("STUDENT_UX_V2_MODE", "disabled")
    assert student_ux_rollout(42)["variant"] == "legacy"
    monkeypatch.setenv("STUDENT_UX_V2_MODE", "cohort")
    monkeypatch.setenv("STUDENT_UX_V2_PERCENT", "37")
    first = student_ux_rollout(42)
    second = student_ux_rollout(42)
    assert first == second
    assert first["variant"] == ("v2" if first["cohortBucket"] < 37 else "legacy")
    assert first["rollback"] == "STUDENT_UX_V2_MODE=disabled"


def test_student_error_contract_rejects_external_recovery_urls():
    error_contract = STUDENT_EXPERIENCE.error_contract

    payload = error_contract(
        "ATTEMPT_NOT_VISIBLE",
        "无法查看这次学习记录。",
        label="查看我的最近尝试",
        href="https://example.invalid/private",
        request_id="req_safe",
    )
    assert payload["error"]["recovery"] == {
        "label": "查看我的最近尝试",
        "href": "/student",
    }
    assert payload["error"]["requestId"] == "req_safe"


def test_teacher_return_path_preserves_only_internal_teacher_context():
    safe_teacher_return_path = STUDENT_EXPERIENCE.safe_teacher_return_path

    assert safe_teacher_return_path(
        "/teacher?thread=thread-1&task=active"
    ) == "/teacher?thread=thread-1&task=active"
    assert safe_teacher_return_path(
        "/teacher/courses?dojo=course-1&tab=courseware"
    ) == "/teacher/courses?dojo=course-1&tab=courseware"
    for unsafe in (
        "/student",
        "/dojos",
        "//example.invalid/teacher",
        "https://example.invalid/teacher",
        "/teacherish",
    ):
        assert safe_teacher_return_path(unsafe, fallback="/teacher/courses") == "/teacher/courses"


def test_student_resource_states_keep_unknown_distinct_from_deleted():
    assert {
        "AVAILABLE",
        "MOVED",
        "ARCHIVED",
        "DELETED",
        "FORBIDDEN",
        "UNRESOLVED",
        "INVALID",
    }.issubset(STUDENT_EXPERIENCE.RESOURCE_STATES)


def test_guide_resource_cards_are_cached_retryable_and_status_specific():
    source = (
        pathlib.Path(__file__).parents[1]
        / "dojo_theme"
        / "static"
        / "js"
        / "dojo"
        / "learning-guide.js"
    ).read_text()

    assert "内容已不可用" not in source
    assert "内容已移除" in source
    assert "内容已归档" in source
    assert "当前无法访问" in source
    assert "暂时无法确认入口" in source
    assert "没有判定内容失效；点击可重新确认入口" in source
    assert "resourceCache: new Map()" in source
    assert "resourceInflight: new Map()" in source
    assert "item.description || item.why" in source


def test_acceptance_fixtures_keep_run_ids_out_of_student_facing_titles():
    root = pathlib.Path(__file__).parents[1]
    system_ux = (root / "ops" / "verify-system-ux.py").read_text()
    student_ux = (root / "ops" / "verify-student-ux.py").read_text()

    assert 'SYSTEM_UX_ASSIGNMENT_TITLE = "系统体验路由验收"' in system_ux
    assert 'f"系统体验路由验收 {self.suffix}"' not in system_ux
    assert '"verificationFixture"' in system_ux
    assert 'f"学生体验验收任务 {self.suffix}"' not in student_ux
    assert 'f"个人复习路径 {self.suffix}"' not in student_ux

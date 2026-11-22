"""Local Flask contract tests for coursework projection and grade overrides."""

import ast
import datetime
import math
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask, request

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime.datetime(2026, 1, 2)
PRIVATE = "仅供教师使用的分数核对语句"
FEEDBACK = "下次可补充一条观察依据。"


def load_functions(namespace, path, names, extra=()):
    source = ast.parse(path.read_text())
    nodes = [node for node in source.body if getattr(node, "name", None) in names]
    exec(compile(ast.Module(body=[*nodes, *extra], type_ignores=[]), str(path), "exec"), namespace)


@pytest.fixture
def classroom():
    student = SimpleNamespace(id=17, name="学生")
    teacher = SimpleNamespace(id=18, name="教师")
    item = SimpleNamespace(
        id="item", position=0, item_type="DEBATE", title="比较分数", prompt="哪种方法更清楚？",
        points=5, required=False, challenge_id=None, artifact_id=None,
        config={"referenceAnswer": PRIVATE, "rubric": PRIVATE, "placeholder": "请说明理由"},
    )
    assignment = SimpleNamespace(
        id="fractions", dojo_id=1, dojo=SimpleNamespace(reference_id="course", name="数学"),
        module_index=None, title="分数比较", description="课堂讨论", kind="QUIZ", status="PUBLISHED",
        instructions="写下你观察到的差异。", items=[item], available_from=None, due_at=None,
        published_at=NOW, closed_at=None, created=NOW, updated=NOW,
        settings={
            "answerPolicy": "NEVER", "allowResubmit": True,
            "generation": {"prompt": PRIVATE, "qualityReview": {"details": PRIVATE}},
            "publishedStandards": {"internal": PRIVATE}, "unknownField": PRIVATE,
        },
    )
    submission = SimpleNamespace(
        id="submission", student_id=student.id, student=student, status="GRADED",
        objective_score=0, ai_score=4, total_score=4, max_score=5, trust_score=0.8,
        feedback=PRIVATE, submitted_at=NOW, graded_at=NOW, started=NOW, updated=NOW,
        answers={"item": "我把两张纸分成了相同大小的几份。"},
        item_results=[{"itemId": "item", "score": 4, "maxScore": 5, "needsReview": True,
                       "source": "AI", "feedback": PRIVATE, "internal": PRIVATE}],
        grading={"agent": {"usage": {"extra": PRIVATE}}, "version": 1},
    )
    submissions = MagicMock()
    submissions.query.filter_by.return_value.first.return_value = submission
    submissions.query.filter_by.return_value.with_for_update.return_value.first.return_value = submission
    ns = {
        "TeachingAssignmentSubmissions": submissions,
        "utcnow": lambda: NOW, "db": MagicMock(), "DojoUsers": MagicMock(),
        "timestamp": lambda value: value.isoformat() if value else None,
        "activity_state": lambda *args, **kwargs: "COMPLETED",
        "assessment_state": lambda state, **kwargs: state,
        "math": math, "ScopeError": ValueError, "_challenge_link": lambda *args: None,
        "_user": lambda: student, "assignment_for_student": lambda *args, **kwargs: assignment,
        "LearningAuditEvents": SimpleNamespace, "request": request,
    }
    load_functions(ns, ROOT / "dojo_plugin" / "coursework.py", {
        "_bounded_text", "_item_view", "_submission_view", "assignment_view",
        "override_submission_grade", "generate_assignment_payload",
    })
    path = ROOT / "dojo_plugin" / "api" / "v1" / "coursework.py"
    work = next(node for node in ast.parse(path.read_text()).body if getattr(node, "name", None) == "AssignmentWork")
    get = next(node for node in work.body if getattr(node, "name", None) == "get")
    get.decorator_list = []
    load_functions(ns, path, {"_ok"}, [get])
    app = Flask(__name__)
    app.add_url_rule("/assignments/<assignment_id>/work", view_func=lambda assignment_id: ns["get"](None, assignment_id))

    def read_student():
        response = app.test_client().get("/assignments/fractions/work")
        assert response.status_code == 200
        return response.get_json()["data"]["assignment"]

    return SimpleNamespace(student_view=read_student, ns=ns, assignment=assignment, submission=submission, teacher=teacher)


@pytest.mark.parametrize("policy,due_at,visible", [
    ("NEVER", NOW - datetime.timedelta(days=1), False),
    ("AFTER_DUE", None, False),
    ("AFTER_DUE", NOW + datetime.timedelta(days=1), False),
    ("AFTER_DUE", NOW, True),
    ("AFTER_SUBMISSION", None, True),
    ("IMMEDIATE", None, True),
])
def test_student_result_endpoints_follow_answer_release(classroom, policy, due_at, visible):
    classroom.assignment.settings["answerPolicy"] = policy
    classroom.assignment.due_at = due_at
    view = classroom.student_view()
    submission = view["submission"]
    row = submission["itemResults"][0]
    item = view["items"][0]
    assert view["answerPolicy"]["answersVisible"] is visible
    assert row == item["result"]
    assert (submission["score"], row["score"], row["needsReview"]) == (4, 4, True)
    assert submission["answers"] == classroom.submission.answers
    assert view["settings"] == {"answerPolicy": policy, "allowResubmit": True}
    assert submission["grading"] == {}
    assert "internal" not in row
    assert row["feedback"] == submission["feedback"] == (PRIVATE if visible else "")
    assert ("referenceAnswer" in item["config"]) is visible
    if not visible:
        assert PRIVATE not in str(view)


def test_full_teacher_grading_is_preserved(classroom):
    classroom.ns["db"].session.query.return_value.filter_by.return_value.group_by.return_value.all.return_value = []
    classroom.ns["DojoUsers"].query.filter.return_value.count.return_value = 1
    teacher_view = classroom.ns["assignment_view"](classroom.assignment, teacher=True)
    assert teacher_view["settings"]["generation"]["prompt"] == PRIVATE
    actual = classroom.ns["_submission_view"](classroom.submission, include_answers=True, teacher=True)
    assert actual["feedback"] == PRIVATE
    assert actual["itemResults"][0]["internal"] == PRIVATE
    assert actual["grading"] == classroom.submission.grading


def test_only_explicit_teacher_feedback_can_bypass_delayed_feedback(classroom):
    classroom.submission.grading["teacherOverride"] = {"score": 4, "at": NOW.isoformat()}
    assert classroom.student_view()["submission"]["feedback"] == ""
    override = classroom.ns["override_submission_grade"]
    args = (classroom.assignment, classroom.submission.id, classroom.teacher)
    override(*args, 3)
    assert classroom.student_view()["submission"]["feedback"] == ""
    override(*args, 2, FEEDBACK)
    override(*args, 3)
    submission = classroom.student_view()["submission"]
    assert submission["score"] == 3
    assert submission["feedback"] == FEEDBACK
    assert submission["itemResults"][0]["feedback"] == ""
    override(*args, 3, "")
    override(*args, 4)
    assert classroom.student_view()["submission"]["feedback"] == ""


@pytest.mark.parametrize("grading", [None, [], {"teacherOverride": "legacy"}])
def test_legacy_override_without_feedback_provenance(classroom, grading):
    classroom.submission.grading = grading
    assert classroom.student_view()["submission"]["feedback"] == ""
    classroom.ns["override_submission_grade"](classroom.assignment, classroom.submission.id, classroom.teacher, 3)
    assert classroom.student_view()["submission"]["feedback"] == ""


@pytest.mark.parametrize("prompt,description,expected", [
    (PRIVATE, PRIVATE, ""),
    ("私" * 4000, "私" * 4000 + "后续未截断部分", ""),
    (PRIVATE, PRIVATE + "，这是教师后来编写的公开导语。", PRIVATE + "，这是教师后来编写的公开导语。"),
    (PRIVATE, "教师编辑的公开描述。", "教师编辑的公开描述。"),
], ids=["exact-copy", "truncated-prompt", "edited-description", "independent-description"])
def test_legacy_description_hides_only_identifiable_copies(classroom, prompt, description, expected):
    classroom.assignment.settings["generation"]["prompt"] = prompt
    classroom.assignment.description = description
    assert classroom.student_view()["description"] == expected


def test_new_generation_without_public_description_keeps_prompt_in_internal_metadata(classroom):
    ns = classroom.ns
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = []
    ns.update(
        normalize_kind=lambda kind: kind, DojoChallenges=SimpleNamespace(
            query=query, dojo_id=1, challenge_id=MagicMock(), module_index=0, challenge_index=0,
        ),
        resolve_standards=lambda **kwargs: {}, standards_prompt=lambda value: "",
        standards_provenance=lambda value: {}, DOJO_AI_AUTHORING_PLAN_MODEL="synthetic",
        model_json=lambda *args, **kwargs: {},
        _fallback_generated_items=lambda prompt, count: [{"title": "比较分数"}],
    )
    result = ns["generate_assignment_payload"](
        {"prompt": PRIVATE, "questionCount": 1}, SimpleNamespace(id="course", name="数学", dojo_id=1),
    )
    assert result["description"] == ""
    assert result["settings"]["generation"]["prompt"] == PRIVATE


@pytest.mark.parametrize("policy", ["NEVER", "AFTER_SUBMISSION", "IMMEDIATE"])
def test_resubmission_draft_keeps_own_answers_without_prior_grading_text(classroom, policy):
    classroom.assignment.settings["answerPolicy"] = policy
    classroom.ns["override_submission_grade"](
        classroom.assignment, classroom.submission.id, classroom.teacher, 3, FEEDBACK,
    )
    classroom.submission.status = "IN_PROGRESS"
    classroom.submission.answers = {"item": "我正在修改对分数的解释。"}
    view = classroom.student_view()
    assert view["submission"]["answers"] == classroom.submission.answers
    assert view["submission"]["feedback"] == ""
    assert view["submission"]["itemResults"][0]["feedback"] == ""
    assert "result" not in view["items"][0]

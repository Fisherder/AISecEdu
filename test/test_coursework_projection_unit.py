"""Local Flask contract tests for coursework projection and grade overrides."""

import ast
import datetime
import math
import uuid
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
        "math": math, "_challenge_link": lambda *args: None,
        "_user": lambda: student, "assignment_for_student": lambda *args, **kwargs: assignment,
        "LearningAuditEvents": SimpleNamespace, "request": request, "uuid": uuid,
        "safe_return_path": lambda href: href,
    }
    load_functions(ns, ROOT / "dojo_plugin" / "coursework.py", {
        "_bounded_text", "_item_view", "_submission_view", "assignment_view",
        "override_submission_grade", "generate_assignment_payload", "save_submission", "_normalize_answer",
        "_submission_status", "_generated_item",
    })
    load_functions(ns, ROOT / "dojo_plugin" / "learning" / "student_experience.py", {
        "activity_state", "assessment_state", "error_contract",
    })
    path = ROOT / "dojo_plugin" / "api" / "v1" / "coursework.py"
    classes = {node.name: node for node in ast.parse(path.read_text()).body if isinstance(node, ast.ClassDef)}
    work = classes["AssignmentWork"]
    get = next(node for node in work.body if getattr(node, "name", None) == "get")
    get.decorator_list = []
    detail = classes["AssignmentSubmissionDetail"]
    patch = next(node for node in detail.body if getattr(node, "name", None) == "patch")
    patch.decorator_list = []
    ns.update(
        ScopeError=type("ScopeError", (Exception,), {}),
        assignment_for_teacher=lambda *args, **kwargs: assignment,
        roster_submissions=lambda assignment: [],
    )
    load_functions(ns, path, {"_ok", "_body", "_error"}, [get, patch])
    app = Flask(__name__)
    app.add_url_rule("/assignments/<assignment_id>/work", view_func=lambda assignment_id: ns["get"](None, assignment_id))

    def read_student():
        response = app.test_client().get("/assignments/fractions/work")
        assert response.status_code == 200
        return response.get_json()["data"]["assignment"]

    def override_from_teacher(score, feedback):
        ns["_user"] = lambda: teacher
        try:
            return app.test_client().patch(
                "/assignments/fractions/submissions/submission", json={"score": score, "feedback": feedback},
            )
        finally:
            ns["_user"] = lambda: student

    app.add_url_rule(
        "/assignments/<assignment_id>/submissions/<submission_id>", endpoint="override", methods=["PATCH"],
        view_func=lambda assignment_id, submission_id: ns["patch"](None, assignment_id, submission_id),
    )
    ns["grade_submission"] = MagicMock()
    return SimpleNamespace(
        student_view=read_student, ns=ns, assignment=assignment, submission=submission, teacher=teacher,
        student=student, teacher_override=override_from_teacher,
    )


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
    groups = classroom.ns["db"].session.query.return_value.filter_by.return_value.group_by.return_value
    groups.all.return_value = [("GRADED", True, 1), ("GRADED", False, 1), ("IN_PROGRESS", False, 1)]
    classroom.ns["DojoUsers"].query.filter.return_value.count.return_value = 4
    teacher_view = classroom.ns["assignment_view"](classroom.assignment, teacher=True)
    assert teacher_view["settings"]["generation"]["prompt"] == PRIVATE
    assert teacher_view["submissionCounts"] == {"GRADED": 1, "IN_PROGRESS": 2, "TOTAL": 4, "NOT_STARTED": 1}
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
        normalize_kind=lambda kind: kind, assignment_authoring_route=lambda *args: "legacy",
        LEGACY_ASSIGNMENT_ROUTE="legacy", ORDINARY_ASSIGNMENT_ROUTE="ordinary-dsh",
        DojoChallenges=SimpleNamespace(
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
    classroom.ns["save_submission"](
        classroom.assignment, classroom.student, {"item": "我正在修改对分数的解释。"},
    )
    view = classroom.student_view()
    assert view["submission"]["answers"] == classroom.submission.answers
    assert view["submission"]["feedback"] == ""
    assert view["submission"]["itemResults"] == []
    assert view["submission"]["grading"] == {}
    assert view["submission"]["gradedAt"] is None
    assert view["submission"]["score"] is None
    assert "result" not in view["items"][0]
    assert classroom.teacher_override(2, FEEDBACK).status_code == 400


def test_teacher_cannot_grade_an_unsubmitted_draft(classroom):
    classroom.assignment.settings.update(answerPolicy="AFTER_SUBMISSION", allowResubmit=False)
    classroom.submission.status = "IN_PROGRESS"
    classroom.submission.submitted_at = None
    classroom.ns["save_submission"](classroom.assignment, classroom.student, {"item": "草稿"})
    before = vars(classroom.submission).copy()

    response = classroom.teacher_override(3, FEEDBACK)

    assert response.status_code == 400
    assert response.json["code"] == "INVALID_REQUEST"
    assert vars(classroom.submission) == before
    classroom.ns["db"].session.add.assert_not_called()
    classroom.ns["db"].session.commit.assert_not_called()
    classroom.ns["db"].session.rollback.assert_called_once()
    view = classroom.student_view()
    assert view["submission"]["status"] == "IN_PROGRESS"
    assert view["submission"]["score"] is None
    assert not view["answerPolicy"]["answersVisible"]


def test_legacy_grade_without_submission_does_not_block_first_submit(classroom):
    classroom.assignment.settings.update(answerPolicy="AFTER_SUBMISSION", allowResubmit=False)
    classroom.submission.submitted_at = None
    view = classroom.student_view()
    assert view["submission"]["status"] == "IN_PROGRESS"
    assert view["submission"]["score"] is None
    assert not view["answerPolicy"]["answersVisible"]
    assert classroom.teacher_override(2, FEEDBACK).status_code == 400

    classroom.ns["save_submission"](classroom.assignment, classroom.student, {"item": "正式交卷"}, submit=True)

    assert classroom.submission.submitted_at == NOW
    classroom.ns["grade_submission"].assert_called_once_with(classroom.submission)


def test_disabling_resubmission_blocks_existing_resubmission_draft(classroom):
    save = classroom.ns["save_submission"]
    save(classroom.assignment, classroom.student, {"item": "重交草稿"})
    classroom.assignment.settings["allowResubmit"] = False

    with pytest.raises(ValueError, match="不允许重新提交"):
        save(classroom.assignment, classroom.student, {"item": "试图交卷"}, submit=True)

    assert classroom.submission.status == "IN_PROGRESS"
    assert classroom.submission.answers == {"item": "重交草稿"}
    classroom.ns["grade_submission"].assert_not_called()


@pytest.mark.parametrize("save_first", [False, True], ids=["direct-submit", "save-then-submit"])
def test_first_submit_persists_identity_before_grading_and_audit(classroom, save_first):
    from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, create_engine
    from sqlalchemy.orm import Session, declarative_base, relationship

    base = declarative_base()

    class Assignment(base):
        __tablename__ = "assignments"
        id = Column(String, primary_key=True)

    class Submission(base):
        __tablename__ = "submissions"
        id = Column(String, primary_key=True, default=lambda: "generated-submission-id")
        assignment_id = Column(ForeignKey("assignments.id"), nullable=False)
        student_id = Column(Integer, nullable=False)
        status = Column(String, nullable=False)
        answers = Column(JSON, nullable=False)
        submitted_at = Column(DateTime)
        assignment = relationship(Assignment)

    class Audit(base):
        __tablename__ = "audit"
        id = Column(Integer, primary_key=True)
        actor_id = Column(Integer, nullable=False)
        action = Column(String, nullable=False)
        resource_type = Column(String, nullable=False)
        resource_id = Column(String, nullable=False)
        outcome = Column(String, nullable=False)
        details = Column(JSON, nullable=False)

    engine = create_engine("sqlite:///:memory:")
    base.metadata.create_all(engine)
    with Session(engine) as session:
        assignment = Assignment(id=classroom.assignment.id)
        for name in ("status", "available_from", "due_at", "settings", "items", "dojo_id"):
            setattr(assignment, name, getattr(classroom.assignment, name))
        assignment.settings["allowResubmit"] = False
        session.add(assignment)
        session.commit()

        def grade(submission):
            assert submission.assignment is assignment
            assert submission.id
            submission.status = "GRADED"

        Submission.query = session.query(Submission)
        classroom.ns.update(
            TeachingAssignmentSubmissions=Submission, db=SimpleNamespace(session=session),
            LearningAuditEvents=Audit, grade_submission=grade,
        )
        save = classroom.ns["save_submission"]
        answers = {"item": "正式交卷"}
        if save_first:
            draft = save(assignment, classroom.student, {"item": "先存草稿"})
            session.commit()
            assert draft.status == "IN_PROGRESS"
            assert draft.submitted_at is None
            assert session.query(Audit).count() == 0
        submitted = save(assignment, classroom.student, answers, submit=True)
        session.commit()

        assert submitted.status == "GRADED"
        assert submitted.submitted_at == NOW
        assert submitted.answers == answers
        assert session.query(Submission).one().id == submitted.id
        audit = session.query(Audit).one()
        assert (audit.action, audit.resource_id) == ("assignment.submit", submitted.id)
        with pytest.raises(ValueError, match="不允许重新提交"):
            save(assignment, classroom.student, answers, submit=True)
        assert session.query(Audit).count() == 1

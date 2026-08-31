from flask import request
from flask_restx import Namespace, Resource

from CTFd.models import db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ...coursework import (
    assignment_for_student,
    assignment_for_teacher,
    assignment_view,
    close_assignment,
    create_assignment,
    delete_assignment,
    generate_assignment_payload,
    override_submission_grade,
    publish_assignment,
    roster_submissions,
    save_submission,
    update_assignment,
)
from ...models import (
    DojoUsers,
    TeachingAssignmentSubmissions,
    TeachingAssignments,
)
from ...agent_runtime.scope import ScopeError, dojo_for_user
from ...learning.student_experience import error_contract, timestamp


coursework_namespace = Namespace(
    "coursework",
    description="玄甲 assignments, knowledge tests and smart grading",
)


def _body():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def _ok(data=None, status=200):
    return {"success": True, "data": data or {}}, status


def _error(error, status=400, code="INVALID_REQUEST"):
    recovery = {
        "NOT_FOUND": ("查看我的任务", "/student"),
        "REVISION_CONFLICT": ("重新载入最新草稿", request.path),
        "INVALID_REQUEST": ("返回修改", request.path),
    }.get(code, ("返回今天", "/student"))
    payload = error_contract(
        code,
        str(error),
        label=recovery[0],
        href=recovery[1],
        request_id=request.headers.get("X-Request-ID"),
    )
    payload["code"] = code
    payload["message"] = str(error)
    return payload, status


def _user():
    user = get_current_user()
    if user is None:
        raise ScopeError("Authentication required")
    return user


def _assignment_query_for_student(user):
    dojo_ids = [
        row.dojo_id
        for row in DojoUsers.query.filter_by(user_id=user.id).all()
    ]
    if getattr(user, "type", None) == "admin":
        return TeachingAssignments.query.filter(
            TeachingAssignments.status.in_(("PUBLISHED", "CLOSED"))
        )
    return TeachingAssignments.query.filter(
        TeachingAssignments.status.in_(("PUBLISHED", "CLOSED")),
        TeachingAssignments.dojo_id.in_(dojo_ids or [-1]),
    )


@coursework_namespace.errorhandler(ScopeError)
def _scope_error(error):
    return _error(error, 404, "NOT_FOUND")


@coursework_namespace.route("/mine")
class MyAssignments(Resource):
    @authed_only
    def get(self):
        user = _user()
        rows = _assignment_query_for_student(user).order_by(
            TeachingAssignments.due_at.asc().nullslast(),
            TeachingAssignments.created.desc(),
        ).limit(300).all()
        return _ok({"assignments": [assignment_view(row, user=user, include_items=False) for row in rows]})


@coursework_namespace.route("/dojos/<string:dojo_id>/assignments")
class CourseAssignments(Resource):
    @authed_only
    def get(self, dojo_id):
        user = _user()
        dojo = dojo_for_user(user, dojo_id, teacher=True)
        rows = TeachingAssignments.query.filter_by(dojo_id=dojo.dojo_id).order_by(
            TeachingAssignments.updated.desc()
        ).limit(300).all()
        return _ok({"assignments": [assignment_view(row, user=user, teacher=True) for row in rows]})

    @authed_only
    def post(self, dojo_id):
        user = _user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            assignment = create_assignment(user, dojo, _body())
            db.session.commit()
            return _ok({"assignment": assignment_view(assignment, user=user, teacher=True)}, 201)
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")


@coursework_namespace.route("/dojos/<string:dojo_id>/assignments/generate")
class CourseAssignmentGeneration(Resource):
    @authed_only
    def post(self, dojo_id):
        user = _user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            payload = generate_assignment_payload(_body(), dojo)
            assignment = create_assignment(user, dojo, payload)
            db.session.commit()
            return _ok({"assignment": assignment_view(assignment, user=user, teacher=True)}, 201)
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")


@coursework_namespace.route("/assignments/<string:assignment_id>")
class AssignmentDetail(Resource):
    @authed_only
    def get(self, assignment_id):
        user = _user()
        assignment = TeachingAssignments.query.filter_by(id=assignment_id).first()
        if assignment is None:
            return _error("Assignment not found", 404, "NOT_FOUND")
        teacher = False
        try:
            assignment = assignment_for_teacher(assignment_id, user)
            teacher = True
        except ScopeError:
            assignment = assignment_for_student(assignment_id, user)
        return _ok({"assignment": assignment_view(assignment, user=user, teacher=teacher)})

    @authed_only
    def patch(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_teacher(assignment_id, user, lock=True)
            body = _body()
            update_assignment(assignment, body, user)
            db.session.commit()
            return _ok({"assignment": assignment_view(assignment, user=user, teacher=True)})
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")

    @authed_only
    def delete(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_teacher(assignment_id, user, lock=True)
            delete_assignment(assignment, user)
            db.session.commit()
            return _ok({"deleted": assignment_id})
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 409, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")


@coursework_namespace.route("/assignments/<string:assignment_id>/publish")
class AssignmentPublish(Resource):
    @authed_only
    def post(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_teacher(assignment_id, user, lock=True)
            publish_assignment(assignment, user)
            db.session.commit()
            return _ok({"assignment": assignment_view(assignment, user=user, teacher=True)})
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")


@coursework_namespace.route("/assignments/<string:assignment_id>/close")
class AssignmentClose(Resource):
    @authed_only
    def post(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_teacher(assignment_id, user, lock=True)
            close_assignment(assignment, user)
            db.session.commit()
            return _ok({"assignment": assignment_view(assignment, user=user, teacher=True)})
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 409, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")


@coursework_namespace.route("/assignments/<string:assignment_id>/work")
class AssignmentWork(Resource):
    @authed_only
    def get(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_student(assignment_id, user)
            return _ok({"assignment": assignment_view(assignment, user=user)})
        except ScopeError as exc:
            return _error(exc, 404, "NOT_FOUND")

    @authed_only
    def post(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_student(assignment_id, user, lock=True)
            body = _body()
            action = str(body.get("action") or "save").lower()
            if action not in {"save", "submit"}:
                raise ValueError("action must be save or submit")
            existing = TeachingAssignmentSubmissions.query.filter_by(
                assignment_id=assignment.id,
                student_id=user.id,
            ).first()
            expected_provided = "expectedUpdated" in body
            expected_updated = str(body.get("expectedUpdated") or "").strip() or None
            current_updated = timestamp(existing.updated) if existing is not None else None
            if expected_provided and current_updated != expected_updated:
                db.session.rollback()
                return _error(
                    "另一窗口已经保存了更新版本。请重新载入后再继续，避免覆盖较新的答案。",
                    409,
                    "REVISION_CONFLICT",
                )
            submission = save_submission(
                assignment,
                user,
                body.get("answers") or {},
                submit=action == "submit",
            )
            db.session.commit()
            return _ok(
                {
                    "assignment": assignment_view(assignment, user=user),
                    "submissionId": submission.id,
                },
                201 if action == "submit" else 200,
            )
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")


@coursework_namespace.route("/assignments/<string:assignment_id>/submissions")
class AssignmentSubmissions(Resource):
    @authed_only
    def get(self, assignment_id):
        user = _user()
        try:
            assignment = assignment_for_teacher(assignment_id, user)
            return _ok(
                {
                    "assignment": assignment_view(assignment, user=user, teacher=True, include_items=False),
                    "students": roster_submissions(assignment),
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, "NOT_FOUND")


@coursework_namespace.route("/assignments/<string:assignment_id>/submissions/<string:submission_id>")
class AssignmentSubmissionDetail(Resource):
    @authed_only
    def patch(self, assignment_id, submission_id):
        user = _user()
        try:
            assignment = assignment_for_teacher(assignment_id, user, lock=True)
            body = _body()
            override_submission_grade(
                assignment,
                submission_id,
                user,
                body.get("score"),
                body.get("feedback") if "feedback" in body else None,
            )
            db.session.commit()
            return _ok({"students": roster_submissions(assignment)})
        except (ScopeError, ValueError, TypeError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400, "NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST")

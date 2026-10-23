from functools import wraps

from flask import request
from flask_restx import Namespace, Resource
from CTFd.models import db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ...agent_runtime.scope import ScopeError, build_scope, dojo_for_user
from ...construction_guards import frozen_course
from ...learning.inquiry import catalog, make_spec
from ...learning.inquiry_service import (
    InquiryConflict, apply_action, attempt_view, create_project, edit_project,
    project_view, publish_project, review_project, start_attempt, teacher_evidence,
)


inquiry_namespace = Namespace("inquiry", description="流程探究式学习与可信状态核验")


def endpoint(function):
    @wraps(function)
    @authed_only
    def wrapped(*args, **kwargs):
        try:
            result = function(*args, user=get_current_user(), **kwargs)
            if request.method != "GET":
                db.session.commit()
            return {"success": True, "data": result}, 200
        except (ScopeError, InquiryConflict, ValueError, TypeError) as exc:
            db.session.rollback()
            status = 404 if isinstance(exc, ScopeError) else 409 if isinstance(exc, InquiryConflict) else 400
            return {"success": False, "error": {"code": "NOT_FOUND" if status == 404 else "STATE_CONFLICT" if status == 409 else "INVALID_REQUEST", "message": str(exc)}}, status
    return wrapped


def body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict) or len(str(value)) > 20000:
        raise ValueError("请求需为有效且不超过 20 KB 的对象。")
    return value


@inquiry_namespace.route("/context")
class InquiryContext(Resource):
    @endpoint
    def get(self, *, user):
        build_scope(user, role="teacher")
        from .teaching import _teacher_dojos
        return {"pattern": catalog(), "example": make_spec({}), "courses": [{"id": course.dojo_id, "referenceId": course.reference_id,
                "name": course.name, "modules": [{"index": module.module_index, "name": module.name} for module in course.modules]}
                for course in _teacher_dojos(user) if not frozen_course(course.dojo_id)]}


@inquiry_namespace.route("/projects")
class InquiryProjects(Resource):
    @endpoint
    def post(self, *, user):
        values = body()
        course = dojo_for_user(user, values["courseId"], teacher=True) if values.get("courseId") is not None else None
        artifact = create_project(user, values.get("spec") or {}, dojo=course, module_index=values.get("moduleIndex"))
        return {"project": project_view(user, artifact.id), "href": "/teacher/artifacts/" + artifact.id}


@inquiry_namespace.route("/projects/<string:artifact_id>")
class InquiryProject(Resource):
    @endpoint
    def get(self, artifact_id, *, user):
        return {"project": project_view(user, artifact_id)}

    @endpoint
    def patch(self, artifact_id, *, user):
        edit_project(user, artifact_id, body())
        return {"project": project_view(user, artifact_id)}


@inquiry_namespace.route("/projects/<string:artifact_id>/review")
class InquiryReview(Resource):
    @endpoint
    def post(self, artifact_id, *, user):
        report = review_project(user, artifact_id, body().get("expectedRevision"))
        return {"report": report, "project": project_view(user, artifact_id)}


@inquiry_namespace.route("/projects/<string:artifact_id>/publish")
class InquiryPublish(Resource):
    @endpoint
    def post(self, artifact_id, *, user):
        release = publish_project(user, artifact_id, body())
        db.session.flush()
        return {"release": {"id": release.id, "revision": release.revision, "contentHash": release.content_hash},
                "project": project_view(user, artifact_id), "href": "/learning/inquiry/" + artifact_id}


@inquiry_namespace.route("/projects/<string:artifact_id>/session")
class InquirySession(Resource):
    @endpoint
    def post(self, artifact_id, *, user):
        attempt, row = start_attempt(user, artifact_id, attempt_id=body().get("attemptId"))
        return {"attempt": attempt_view(attempt), "spec": row.content}


@inquiry_namespace.route("/projects/<string:artifact_id>/actions")
class InquiryAction(Resource):
    @endpoint
    def post(self, artifact_id, *, user):
        return apply_action(user, artifact_id, body())


@inquiry_namespace.route("/projects/<string:artifact_id>/trace")
class InquiryTrace(Resource):
    @endpoint
    def get(self, artifact_id, *, user):
        from ...learning.inquiry_service import project_for_viewer, revision_for
        from ...models.inquiry import InquiryAttempts
        from ...learning.aes128 import encrypt_trace, decrypt
        artifact, teacher = project_for_viewer(user, artifact_id)
        attempt = InquiryAttempts.query.filter_by(id=request.args.get("attemptId"), user_id=user.id,
                                                  artifact_id=artifact_id, mode="PREVIEW" if teacher else "LEARN").first()
        if attempt is None:
            raise ScopeError("学习记录不存在。")
        row = revision_for(artifact, attempt.revision)
        if row.content_hash != attempt.content_hash:
            raise InquiryConflict("学习版本摘要不一致。")
        result = encrypt_trace(attempt.state["plaintext"], attempt.state["key"])
        return {"calculation": result, "decrypted": decrypt(result["ciphertext"], attempt.state["key"])}


@inquiry_namespace.route("/projects/<string:artifact_id>/evidence")
class InquiryEvidence(Resource):
    @endpoint
    def get(self, artifact_id, *, user):
        return {"learners": teacher_evidence(user, artifact_id)}

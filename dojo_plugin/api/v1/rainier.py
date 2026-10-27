import datetime
import json
import re

from flask import abort, request
from flask_restx import Namespace, Resource
from sqlalchemy.exc import IntegrityError
from CTFd.models import Configs, db
from CTFd.utils.decorators import admins_only, authed_only
from CTFd.utils.user import get_current_user

from ...models import DojoChallenges, LearningAssessments, LearningAttempts, LearningAuditEvents
from ...models.rainier import RainierSessions, RainierSubmissions
from ...rainier import (CONFIG_KEY, applications, preview_assessment, queue_assessment,
                        validate_application)
from ...rainier.contracts import ContractError


rainier_namespace = Namespace("rainier", description="润尼尔实验与人工智能数据回传")


def owned_assessment(identifier):
    assessment = db.session.get(LearningAssessments, identifier)
    attempt = db.session.get(LearningAttempts, assessment.attempt_id) if assessment else None
    if not attempt or attempt.user_id != get_current_user().id:
        abort(404)
    return assessment


def record_view(record):
    return {"id": record.id, "assessmentId": record.assessment_id, "jobId": record.job_id,
            "status": record.status, "responseCode": record.response_code,
            "payloadSha256": record.digest, "created": record.created.isoformat() + "Z",
            "sent": record.sent.isoformat() + "Z" if record.sent else None}


@rainier_namespace.route("/applications")
class Applications(Resource):
    @admins_only
    def get(self):
        return {"success": True, "applications": applications()}


@rainier_namespace.route("/applications/<string:app_id>")
class Application(Resource):
    @admins_only
    def put(self, app_id):
        try:
            if not re.fullmatch(r"[A-Za-z0-9-]{1,80}", app_id):
                raise ContractError("appId 格式错误")
            config = validate_application(request.get_json(silent=True))
            if not DojoChallenges.query.filter_by(dojo_id=config["dojoId"], challenge_id=config["challengeId"]).first():
                raise ContractError("课程与题目映射不存在")
            row = Configs.query.filter_by(key=CONFIG_KEY).with_for_update().first()
            if row is None:
                row = Configs(key=CONFIG_KEY, value="{}")
                db.session.add(row)
            values = json.loads(row.value)
            previous = values.get(app_id)
            if previous and (not config["enabled"] or any(previous.get(key) != config[key] for key in ("host", "dojoId", "challengeId"))):
                RainierSessions.query.filter_by(app_id=app_id, closed=False).update({"closed": True})
            values[app_id] = config
            row.value = json.dumps(values, ensure_ascii=False)
            db.session.add(LearningAuditEvents(actor_id=get_current_user().id,
                action="rainier.application.configure", resource_type="rainier_application",
                resource_id=app_id, outcome="ALLOW", details=config))
            db.session.commit()
            return {"success": True, "application": config}
        except (ContractError, IntegrityError) as error:
            db.session.rollback()
            return {"success": False, "error": str(error) if isinstance(error, ContractError) else "配置发生并发修改，请刷新重试"}, 400


@rainier_namespace.route("/assessments/<string:assessment_id>/preview")
class Preview(Resource):
    @authed_only
    def get(self, assessment_id):
        assessment = owned_assessment(assessment_id)
        try:
            _, payload = preview_assessment(assessment)
            return {"success": True, "payload": payload,
                    "warnings": [] if "ai_data" in payload else ["本次预约没有实际 AI 调用，省略 ai_data；不提交虚构的模型和场景"]}
        except ContractError as error:
            return {"success": False, "error": str(error)}, 409


@rainier_namespace.route("/assessments/<string:assessment_id>/submit")
class Submit(Resource):
    @authed_only
    def post(self, assessment_id):
        assessment = owned_assessment(assessment_id)
        try:
            record = queue_assessment(assessment)
            if record is None:
                raise ContractError("本次作答没有润尼尔预约")
            db.session.commit()
            from ...agent_runtime.jobs import publish_pending_outbox
            publish_pending_outbox(job_id=record.job_id)
            return {"success": True, "submission": record_view(record)}, 202
        except (ContractError, IntegrityError) as error:
            db.session.rollback()
            return {"success": False, "error": str(error) if isinstance(error, ContractError) else "同一评测已在提交，请刷新查询"}, 409


@rainier_namespace.route("/submissions")
class Submissions(Resource):
    @authed_only
    def get(self):
        rows = (RainierSubmissions.query.join(RainierSessions, RainierSubmissions.session_id == RainierSessions.id)
                .filter(RainierSessions.user_id == get_current_user().id)
                .order_by(RainierSubmissions.created.desc()).limit(100).all())
        return {"success": True, "submissions": [record_view(row) for row in rows]}


@rainier_namespace.route("/submissions/<string:submission_id>/reconcile")
class Reconcile(Resource):
    @admins_only
    def post(self, submission_id):
        record = RainierSubmissions.query.filter_by(id=submission_id).with_for_update().first_or_404()
        body = request.get_json(silent=True) or {}
        state, reason = body.get("remoteState"), body.get("reason")
        if (record.status not in {"UNCERTAIN", "SENDING", "REJECTED"} or state not in {"saved", "not-saved"}
                or not isinstance(reason, str) or not reason.strip()):
            return {"success": False, "error": "需填写已人工核对的远端状态及核对依据"}, 400
        from ...models import TeachingJobs
        previous = db.session.get(TeachingJobs, record.job_id)
        if previous and previous.status in {"RUNNING", "QUEUED", "CANCEL_REQUESTED"}:
            return {"success": False, "error": "原回传任务仍未结束，暂不可重试"}, 409
        if state == "saved":
            record.status, record.sent = "SENT", datetime.datetime.utcnow()
        else:
            from ...agent_runtime.jobs import enqueue_job
            job, _ = enqueue_job(owner_id=db.session.get(RainierSessions, record.session_id).user_id,
                kind="rainier.submit", idempotency_key=f"rainier-retry:{record.id}:{record.job_id}",
                payload={"rainierSubmissionId": record.id}, max_attempts=1, commit=False, publish=False)
            record.status, record.job_id = "QUEUED", job.id
        db.session.add(LearningAuditEvents(actor_id=get_current_user().id,
            action="rainier.submission.reconcile", resource_type="rainier_submission", resource_id=record.id,
            outcome="ALLOW", details={"remoteState": state, "reason": reason[:1200]}))
        db.session.commit()
        from ...agent_runtime.jobs import publish_pending_outbox
        publish_pending_outbox(job_id=record.job_id)
        return {"success": True, "submission": record_view(record)}

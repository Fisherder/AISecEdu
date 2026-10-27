import datetime
import functools
import hashlib
import json
import logging
import uuid
from contextlib import contextmanager
from contextvars import ContextVar

from flask import has_request_context, session

from CTFd.models import Configs, db

from ..models import LearningAssessments, LearningAttempts, LearningEvidenceEvents
from ..models.rainier import (RainierAICalls, RainierAttemptLinks, RainierIdentities,
                             RainierSessions, RainierSubmissions)
from .client import DeliveryUncertain, RainierClient
from .contracts import (ContractError, DEPLOYMENTS, MAX_INTEGER, origin,
                        payload_for_assessment, text, verified_user)


logger = logging.getLogger(__name__)
CONFIG_KEY = "rainier_applications_v1"
_usage = ContextVar("rainier_usage", default=None)


def applications():
    row = Configs.query.filter_by(key=CONFIG_KEY).first()
    return json.loads(row.value) if row and row.value else {}


def application_for(run, *, sending=False):
    app = applications().get(run.app_id)
    if not app or not app.get("enabled"):
        raise ContractError("润尼尔项目未启用")
    if (origin(app["host"]) != run.host or app["dojoId"] != run.dojo_id
            or app["challengeId"] != run.challenge_id):
        raise ContractError("项目映射已变化；旧预约不可转发到新项目")
    if sending and not app.get("sendEnabled"):
        raise ContractError("正式回传尚未启用，可先查看预览")
    return app


def validate_application(body):
    allowed = {"host", "dojoId", "challengeId", "enabled", "sendEnabled", "autoSubmit",
               "strictIlab", "expectedSeconds", "timezone", "reportKeys", "modelDeployment", "modelProvider"}
    if not isinstance(body, dict) or set(body) - allowed:
        raise ContractError("项目配置字段无效")
    result = {"host": origin(body.get("host", "https://api.vr-mooc.com")),
              "expectedSeconds": body.get("expectedSeconds", 180),
              "timezone": body.get("timezone", "Asia/Shanghai"),
              "reportKeys": body.get("reportKeys", {"summary": "text1", "score": "text2"}),
              "modelDeployment": body.get("modelDeployment", "公有云服务"),
              "modelProvider": body.get("modelProvider", "DeepSeek")}
    for key, default in (("enabled", False), ("sendEnabled", False), ("autoSubmit", False), ("strictIlab", True)):
        value = body.get(key, default)
        if type(value) is not bool:
            raise ContractError(f"{key} 必须是布尔值")
        result[key] = value
    for key in ("dojoId", "challengeId"):
        if type(body.get(key)) is not int:
            raise ContractError(f"{key} 必须使用实际数据库整数标识")
        result[key] = body[key]
    if type(result["expectedSeconds"]) is not int or not 1 <= result["expectedSeconds"] <= MAX_INTEGER:
        raise ContractError("expectedSeconds 必须是合理用时的正整数")
    if result["timezone"] != "Asia/Shanghai":
        raise ContractError("当前接口时间统一使用 Asia/Shanghai")
    keys = result["reportKeys"]
    if not isinstance(keys, dict) or set(keys) != {"summary", "score"}:
        raise ContractError("reportKeys 应配置互不重复的 summary、score 报告模板键")
    import re
    if any(not isinstance(value, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", value) for value in keys.values()):
        raise ContractError("报告模板键格式无效")
    if len(set(keys.values())) != 2:
        raise ContractError("报告模板键不能重复")
    if not isinstance(result["modelDeployment"], str) or result["modelDeployment"] not in DEPLOYMENTS:
        raise ContractError("模型部署方式无效")
    text(result["modelProvider"], "模型服务提供方", 160)
    return result


def create_session(user, launch, *, client_factory=RainierClient):
    app = applications()[launch["appId"]]
    from ..agent_runtime.scope import dojo_for_user
    from ..models import DojoChallenges
    dojo_for_user(user, app["dojoId"])
    challenge = DojoChallenges.query.filter_by(dojo_id=app["dojoId"], challenge_id=app["challengeId"]).first()
    if challenge is None or not challenge.visible():
        raise ContractError("实验题目不存在或当前不可见")
    client = client_factory(launch["host"])
    try:
        identity = verified_user(client.authenticate(launch["appId"], launch["sequenceCode"]), launch["expId"])
    finally:
        client.close()
    prior = RainierIdentities.query.filter_by(host=launch["host"], app_id=launch["appId"], external_code=identity["code"]).first()
    local = RainierIdentities.query.filter_by(host=launch["host"], app_id=launch["appId"], user_id=user.id).first()
    if (prior and prior.user_id != user.id) or (local and local.external_code != identity["code"]):
        raise ContractError("平台账号与当前玄甲账号的已有绑定不一致")
    run = RainierSessions.query.filter_by(host=launch["host"], app_id=launch["appId"], exp_id=launch["expId"]).first()
    if run:
        if run.user_id != user.id or run.external_code != identity["code"]:
            raise ContractError("此实验预约已绑定其他账号")
        application_for(run)
        if run.closed or run.expires <= datetime.datetime.utcnow():
            raise ContractError("此预约已结束或已过期，请从平台开始新的预约")
        return run, challenge
    if prior is None:
        db.session.add(RainierIdentities(host=launch["host"], app_id=launch["appId"],
                                        external_code=identity["code"], user_id=user.id))
    run = RainierSessions(user_id=user.id, host=launch["host"], app_id=launch["appId"],
                          exp_id=launch["expId"], external_code=identity["code"],
                          dojo_id=app["dojoId"], challenge_id=app["challengeId"],
                          expires=datetime.datetime.utcnow() + datetime.timedelta(hours=24))
    db.session.add(run)
    db.session.flush()
    return run, challenge


def bind_attempt(attempt):
    if not has_request_context() or not session.get("rainier_session_id"):
        return
    run = RainierSessions.query.filter_by(id=session["rainier_session_id"], user_id=attempt.user_id,
                                         dojo_id=attempt.dojo_id, challenge_id=attempt.challenge_id).first()
    if run is None or run.closed or run.expires <= datetime.datetime.utcnow() or attempt.started < run.created:
        return
    try:
        application_for(run)
    except ContractError:
        return
    db.session.add(RainierAttemptLinks(attempt_id=attempt.id, session_id=run.id))


@contextmanager
def usage_scope(attempt_id, scenario):
    link = RainierAttemptLinks.query.filter_by(attempt_id=attempt_id).first() if attempt_id else None
    context = None
    if link:
        run = db.session.get(RainierSessions, link.session_id)
        if run and not run.closed and run.expires > datetime.datetime.utcnow():
            try:
                app = application_for(run)
            except ContractError:
                app = None
            if app:
                context = {"session_id": run.id, "attempt_id": attempt_id, "scenario": scenario,
                           "deployment": app["modelDeployment"], "provider": app["modelProvider"]}
    token = _usage.set(context)
    try:
        yield
    finally:
        _usage.reset(token)


def track_attempt_ai(scenario):
    def decorate(function):
        @functools.wraps(function)
        def wrapped(attempt, *args, **kwargs):
            with usage_scope(attempt.id, scenario):
                return function(attempt, *args, **kwargs)
        return wrapped
    return decorate


def record_model_dispatch(model):
    context = _usage.get()
    if context is None:
        return None
    identifier = uuid.uuid4().hex
    values = {**context, "id": identifier, "model": str(model)[:160], "version": str(model)[:160],
              "status": "DISPATCHED", "created": datetime.datetime.utcnow()}
    with db.engine.begin() as connection:
        connection.execute(RainierAICalls.__table__.insert().values(**values))
    return identifier


def settle_model_dispatch(identifier, response=None):
    if identifier is None:
        return
    usage = response.get("usage") if isinstance(response, dict) else None
    values = {"status": "RECEIVED" if isinstance(response, dict) else "UNCONFIRMED"}
    if isinstance(usage, dict):
        for source, target in (("prompt_tokens", "input_tokens"), ("completion_tokens", "output_tokens")):
            count = usage.get(source)
            if type(count) is int and 0 <= count <= MAX_INTEGER:
                values[target] = count
    if isinstance(response, dict) and isinstance(response.get("model"), str) and response["model"].strip():
        values.update(model=response["model"][:160], version=response["model"][:160])
    with db.engine.begin() as connection:
        connection.execute(RainierAICalls.__table__.update().where(RainierAICalls.id == identifier).values(**values))


def preview_assessment(assessment):
    attempt = db.session.get(LearningAttempts, assessment.attempt_id)
    link = db.session.get(RainierAttemptLinks, assessment.attempt_id)
    if link is None:
        raise ContractError("本次作答不是从润尼尔预约启动，不能回传历史记录")
    run = db.session.get(RainierSessions, link.session_id)
    if run is None or run.user_id != attempt.user_id:
        raise ContractError("实验预约不属于本次作答用户")
    app = application_for(run)
    linked = RainierAttemptLinks.query.filter_by(session_id=run.id).all()
    attempt_ids = [row.attempt_id for row in linked]
    attempts = LearningAttempts.query.filter(LearningAttempts.id.in_(attempt_ids),
                                             LearningAttempts.user_id == run.user_id,
                                             LearningAttempts.dojo_id == run.dojo_id,
                                             LearningAttempts.challenge_id == run.challenge_id).all()
    if len(attempts) != len(attempt_ids):
        raise ContractError("预约关联作答身份不完整")
    from ..learning.evidence import verify_evidence_chain
    if any(not verify_evidence_chain(item.id)["valid"] for item in attempts):
        raise ContractError("证据链校验失败，不能回传")
    events = LearningEvidenceEvents.query.filter(LearningEvidenceEvents.attempt_id.in_(attempt_ids),
                                                  LearningEvidenceEvents.occurred <= assessment.created).order_by(LearningEvidenceEvents.occurred).all()
    calls = RainierAICalls.query.filter(RainierAICalls.session_id == run.id,
                                        RainierAICalls.attempt_id.in_(attempt_ids),
                                        RainierAICalls.created <= assessment.created).order_by(RainierAICalls.created).all()
    if any(row.status == "DISPATCHED" for row in calls):
        raise ContractError("尚有 AI 请求未取得终态，暂不能冻结统计")
    fields = ("model", "version", "provider", "deployment", "scenario", "input_tokens", "output_tokens")
    payload = payload_for_assessment(run.app_id, run.exp_id, attempt.dojo_challenge.name,
        min(item.started for item in attempts), assessment.created, assessment.total_score,
        [{"type": event.event_type, "sequence": event.sequence, "occurred": event.occurred} for event in events],
        [{field: getattr(row, field) for field in fields} for row in calls],
        expected_seconds=app["expectedSeconds"], strict=app["strictIlab"],
        timezone=app["timezone"], report_keys=app["reportKeys"])
    return run, payload


def queue_assessment(assessment, *, automatic=False):
    link = db.session.get(RainierAttemptLinks, assessment.attempt_id)
    if link is None:
        return None
    run = db.session.get(RainierSessions, link.session_id)
    app = application_for(run)
    if automatic and not (app["autoSubmit"] and app["sendEnabled"]):
        return None
    if run.closed or run.expires <= datetime.datetime.utcnow():
        raise ContractError("预约已结束或过期，不能新增提交")
    latest = (LearningAssessments.query.join(RainierAttemptLinks,
        LearningAssessments.attempt_id == RainierAttemptLinks.attempt_id)
        .filter(RainierAttemptLinks.session_id == run.id)
        .order_by(LearningAssessments.created.desc(), LearningAssessments.id.desc()).first())
    if latest is None or latest.id != assessment.id:
        raise ContractError("本次预约已有更新的正式评测，请提交最新评测")
    run, payload = preview_assessment(assessment)
    application_for(run, sending=True)
    existing = RainierSubmissions.query.filter_by(session_id=run.id, assessment_id=assessment.id).first()
    if existing:
        return existing
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    record = RainierSubmissions(session_id=run.id, assessment_id=assessment.id, payload=payload,
                                digest=hashlib.sha256(encoded.encode()).hexdigest())
    db.session.add(record)
    db.session.flush()
    from ..agent_runtime.jobs import enqueue_job
    job, _ = enqueue_job(owner_id=run.user_id, kind="rainier.submit",
        idempotency_key=f"rainier:{run.id}:{assessment.id}", payload={"rainierSubmissionId": record.id},
        dojo_id=run.dojo_id, commit=False, publish=False, max_attempts=1)
    record.job_id = job.id
    return record


def maybe_queue_assessment(assessment):
    try:
        queue_assessment(assessment, automatic=True)
    except ContractError:
        logger.info("Rainier automatic submission awaits valid source data or configuration")


def send_submission(job, *, client_factory=RainierClient):
    from ..agent_runtime.jobs import PermanentJobError
    record = RainierSubmissions.query.filter_by(id=(job.payload or {}).get("rainierSubmissionId")).first()
    if record is None:
        raise PermanentJobError("润尼尔回传记录不存在")
    run = RainierSessions.query.filter_by(id=record.session_id).with_for_update().one()
    if run.user_id != job.owner_id:
        raise PermanentJobError("润尼尔回传任务用户不匹配")
    db.session.refresh(record)
    if record.status == "SENT":
        return {"submissionId": record.id, "status": "SENT", "deduplicated": True}
    if record.status != "QUEUED":
        raise PermanentJobError("此前回传未获得确定结果，需核对远端后明确重试")
    if run.closed or run.expires <= datetime.datetime.utcnow():
        raise PermanentJobError("预约已结束或过期，请先核对平台预约")
    try:
        application_for(run, sending=True)
    except ContractError as error:
        raise PermanentJobError(str(error)) from None
    newer = RainierSubmissions.query.filter(RainierSubmissions.session_id == run.id,
        RainierSubmissions.created > record.created).first()
    if newer:
        record.status = "SUPERSEDED"
        return {"submissionId": record.id, "status": "SUPERSEDED"}
    latest = (LearningAssessments.query.join(RainierAttemptLinks,
        LearningAssessments.attempt_id == RainierAttemptLinks.attempt_id)
        .filter(RainierAttemptLinks.session_id == run.id)
        .order_by(LearningAssessments.created.desc(), LearningAssessments.id.desc()).first())
    if latest is None or latest.id != record.assessment_id:
        record.status = "SUPERSEDED"
        return {"submissionId": record.id, "status": "SUPERSEDED"}
    unresolved = RainierSubmissions.query.filter(RainierSubmissions.session_id == run.id,
        RainierSubmissions.id != record.id,
        RainierSubmissions.status.in_(["SENDING", "UNCERTAIN"])).first()
    if unresolved:
        raise PermanentJobError("同一预约有结果未确认的旧提交，请先人工核对远端记录")
    encoded = json.dumps(record.payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if hashlib.sha256(encoded.encode()).hexdigest() != record.digest:
        raise PermanentJobError("冻结的回传数据校验失败")
    record.status = "SENDING"
    db.session.commit()
    client = client_factory(run.host)
    try:
        body = client.upload(record.payload)
        code = str(body.get("code", ""))
        record.response_code = code[:16]
        record.status = "SENT" if code == "200" else "REJECTED"
        record.sent = datetime.datetime.utcnow() if code == "200" else None
    except DeliveryUncertain:
        record.status = "UNCERTAIN"
    finally:
        client.close()
    db.session.commit()
    if record.status != "SENT":
        raise PermanentJobError(f"润尼尔未确认保存：{record.status}，响应码 {record.response_code or '无'}；请核对回传记录")
    return {"submissionId": record.id, "status": "SENT", "responseCode": record.response_code}

import json
import secrets

import redis
from flask import (Blueprint, abort, current_app, make_response, redirect,
                   render_template, request, session)
from sqlalchemy.exc import IntegrityError
from CTFd.models import db
from CTFd.utils.decorators import ratelimit
from CTFd.utils.user import get_current_user

from ..rainier import applications, create_session, preview_assessment, queue_assessment
from ..models import LearningAssessments
from ..models.rainier import RainierAttemptLinks, RainierSessions, RainierSubmissions
from ..rainier.client import DeliveryUncertain
from ..rainier.contracts import ContractError, launch_parameters


rainier_pages = Blueprint("rainier", __name__)


def private_response(value):
    response = make_response(value)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@rainier_pages.route("/integrations/rainier/launch", methods=["GET", "POST"])
@ratelimit(method="POST", limit=10, interval=60)
def launch():
    cache = redis.from_url(current_app.config["REDIS_URL"])
    if request.method == "GET" and request.args:
        try:
            if any(len(request.args.getlist(key)) != 1 for key in request.args):
                raise ContractError("启动参数不能重复")
            launch_data = launch_parameters(request.args, applications())
        except ContractError as error:
            session["rainier_launch_error"] = str(error)
            session.pop("rainier_pending", None)
            return private_response(redirect("/integrations/rainier/launch", code=303))
        nonce = secrets.token_urlsafe(32)
        cache.setex(f"rainier:launch:{nonce}", 900, json.dumps(launch_data))
        session["rainier_pending"] = nonce
        return private_response(redirect("/integrations/rainier/launch", code=303))
    error = session.pop("rainier_launch_error", None)
    if error:
        return private_response((render_template("rainier_launch.html", error=error), 400))
    user = get_current_user()
    if not user:
        return private_response(redirect("/login?next=/integrations/rainier/launch"))
    nonce = session.get("rainier_pending")
    raw = cache.get(f"rainier:launch:{nonce}") if nonce else None
    if not raw:
        return private_response((render_template("rainier_launch.html", error="启动链接已过期，请从润尼尔平台重新进入。"), 400))
    if request.method == "GET":
        return private_response(render_template("rainier_launch.html", error=None, local_name=user.name))
    try:
        data = json.loads(raw)
        launch_data = launch_parameters({"token": f"{data['appId']}_{data['expId']}",
                                        "host": data["host"], "sequenceCode": data["sequenceCode"]}, applications())
        run, challenge = create_session(user, launch_data)
        db.session.commit()
        cache.delete(f"rainier:launch:{nonce}")
        session.pop("rainier_pending", None)
        session["rainier_session_id"] = run.id
        return private_response(redirect(f"/{challenge.dojo.reference_id}/{challenge.module.id}/{challenge.id}", code=303))
    except (ContractError, IntegrityError, DeliveryUncertain) as error:
        db.session.rollback()
        message = str(error) if not isinstance(error, IntegrityError) else "预约已绑定或发生并发操作，请重新进入。"
        return private_response((render_template("rainier_launch.html", error=message), 409))


@rainier_pages.route("/integrations/rainier/status", methods=["GET", "POST"])
def status():
    user = get_current_user()
    if not user:
        return private_response(redirect("/login?next=/integrations/rainier/status"))
    run = RainierSessions.query.filter_by(id=session.get("rainier_session_id"), user_id=user.id).first()
    if run is None:
        return private_response((render_template("rainier_status.html", error="当前账号没有已验证的实验预约。", run=None), 404))
    assessment = (LearningAssessments.query.join(RainierAttemptLinks,
        LearningAssessments.attempt_id == RainierAttemptLinks.attempt_id)
        .filter(RainierAttemptLinks.session_id == run.id)
        .order_by(LearningAssessments.created.desc(), LearningAssessments.id.desc()).first())
    error, preview = None, None
    record = None
    if assessment:
        try:
            _, preview = preview_assessment(assessment)
            record = RainierSubmissions.query.filter_by(session_id=run.id, assessment_id=assessment.id).first()
            if request.method == "POST":
                if request.form.get("assessmentId") != assessment.id:
                    raise ContractError("正式评测已变化，请刷新预览后再提交。")
                record = queue_assessment(assessment)
                db.session.commit()
                from ..agent_runtime.jobs import publish_pending_outbox
                publish_pending_outbox(job_id=record.job_id)
                return private_response(redirect("/integrations/rainier/status", code=303))
        except (ContractError, IntegrityError) as failure:
            db.session.rollback()
            error = str(failure) if isinstance(failure, ContractError) else "提交状态发生变化，请刷新查看。"
    else:
        error = "请先新启动本题、完成实验并保存正式评测，再回到此处提交。"
    return private_response(render_template("rainier_status.html", run=run, error=error,
        preview=preview, record=record, assessment=assessment,
        send_enabled=bool(applications().get(run.app_id, {}).get("sendEnabled"))))

import hmac
import os
import hashlib
import base64
import datetime
import re
import uuid

import docker.errors

from flask_restx import Namespace, Resource
from flask import abort, request
from CTFd.models import Users, db
from CTFd.utils.user import get_current_user, is_admin
from CTFd.utils.decorators import admins_only, authed_only

from ...models import LearningAttempts, LearningAuditEvents
from ...product.contracts import error_envelope, success_envelope
from ...utils import get_current_container, container_password, user_node
from ...utils.background_stats import publish_stat_event
from ...utils.request_logging import get_trace_id
from ...utils.workspace import start_on_demand_service, reset_home
from ...pages.workspace import forward_workspace, forward_port, forward_short_port
from ...config import WORKSPACE_SECRET, WORKSPACE_SESSION_SECONDS


workspace_namespace = Namespace(
    "workspace", description="Endpoint to manage workspace iframe urls"
)

_ADMIN_RUNTIME_IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


def _product_request_id():
    request_id = str(get_trace_id() or "").strip()
    return uuid.uuid4().hex if request_id in {"", "NONE", "LOCAL"} else request_id[:64]


def _runtime_audit(actor, target, *, outcome, request_id, idempotency_key, details=None):
    event = LearningAuditEvents(
        actor_id=actor.id,
        action="admin.runtime.stop",
        resource_type="workspace_runtime",
        resource_id=str(target.id),
        outcome=outcome,
        details={
            "requestId": request_id,
            "idempotencyKey": idempotency_key,
            "targetUserId": target.id,
            **(details or {}),
        },
    )
    db.session.add(event)
    return event


def _runtime_replay(actor_id, target_id, idempotency_key):
    # JSON implementations differ between the supported development and
    # production databases. Keep the SQL query indexed and bounded, then
    # compare the non-secret idempotency value in Python.
    events = (
        LearningAuditEvents.query.filter_by(
            actor_id=actor_id,
            action="admin.runtime.stop",
            resource_type="workspace_runtime",
            resource_id=str(target_id),
        )
        .order_by(LearningAuditEvents.created.desc())
        .limit(50)
        .all()
    )
    return next(
        (
            event
            for event in events
            if str((event.details or {}).get("idempotencyKey") or "")
            == idempotency_key
        ),
        None,
    )


def _workspace_expiration(container):
    raw = container.labels.get("dojo.expires_at")
    try:
        expires_at = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        created = (container.attrs or {}).get("Created")
        try:
            created_at = datetime.datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None, None
        expires_at = created_at + datetime.timedelta(seconds=WORKSPACE_SESSION_SECONDS)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
    now = datetime.datetime.now(datetime.timezone.utc)
    return expires_at.isoformat().replace("+00:00", "Z"), max(
        0, int((expires_at - now).total_seconds())
    )

@workspace_namespace.route("")
class view_desktop(Resource):
    @authed_only
    def get(self):
        user_id = request.args.get("user")
        password = request.args.get("password")
        service = request.args.get("service", None)
        port = request.args.get("port", None)

        if user_id and not password and not is_admin():
            abort(403)

        user = get_current_user() if not user_id else Users.query.filter_by(id=int(user_id)).first_or_404()
        container = get_current_container(user)
        if not container:
            return {"success": False, "active": False}
        expires_at, remaining_seconds = _workspace_expiration(container)

        # Get current challenge information from container labels
        challenge_info = None
        if container.labels.get("dojo.challenge_id"):
            challenge_info = {
                "dojo_id": container.labels.get("dojo.dojo_id"),
                "module_id": container.labels.get("dojo.module_id"),
                "challenge_id": container.labels.get("dojo.challenge_id")
            }


        elif not service or not port:
            return {"success": False, "active": True, "current_challenge": challenge_info}

        if not WORKSPACE_SECRET:
            abort(500)
            return

        container_id = container.id[:12]
        message = container_id

        node = user_node(user)
        if node is not None and node != 0:
            message = f"{container_id}:192.168.42.{node + 1}"

        digest = hmac.new(
            WORKSPACE_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()

        signature = base64.urlsafe_b64encode(digest).decode()

        iframe_src = None
        web_url = None
        if not service == "desktop":
            if user_id and not is_admin():
                abort(403)

        if service:
            if service == "desktop":
                interact_password = container_password(container, "desktop", "interact")
                view_password = container_password(container, "desktop", "view")

                if user_id and password:
                    if not hmac.compare_digest(password, interact_password) and not hmac.compare_digest(password, view_password):
                        abort(403)
                    password = password[:8]
                else:
                    password = interact_password[:8]

                view_only = user_id is not None
                service_param = "~".join(("desktop", str(user.id), container_password(container, "desktop")))

                vnc_params = {
                    "autoconnect": 1,
                    "reconnect": 1,
                    "reconnect_delay": 200,
                    "resize": "remote",
                    "path": forward_workspace(service=service_param, service_path="websockify", signature=signature, message=message, include_host=False),
                    "view_only": int(view_only),
                    "password": password,
                }
                iframe_src = forward_workspace(service=service_param, service_path="vnc.html", signature=signature, message=message, **vnc_params)

            elif service == "desktop-windows":
                service_param = "~".join(("desktop-windows", str(user.id), container_password(container, "desktop-windows")))
                vnc_params = {
                    "autoconnect": 1,
                    "reconnect": 1,
                    "reconnect_delay": 200,
                    "resize": "local",
                    "path": forward_workspace(service=service_param, service_path="websockify", signature=signature, message=message, include_host=False),
                    "password": "password",
                }
                iframe_src = forward_workspace(service=service_param, service_path="vnc.html", signature=signature, message=message, **vnc_params)
            elif service == "code":
                iframe_src = forward_workspace(
                    service=service,
                    service_path="",
                    signature=signature,
                    message=message,
                    folder="/challenge",
                )
            else:
                iframe_src = forward_workspace(service=service, service_path="", signature=signature, message=message)

            if start_on_demand_service(user, service) is False:
                return {"success": False, "active": True, "error": f"无法启动工作区服务：{service}"}
        elif port:
            iframe_src, web_url = forward_short_port(
                port=port,
                service_path="",
                user=user,
                signature=signature,
                message=message,
            )

        return {
            "success": True,
            "active": True,
            "iframe_src": iframe_src,
            "web_url": web_url,
            "service": service,
            "port": port,
            "setPort": os.getenv("DOJO_ENV") == "development",
            "current_challenge": challenge_info,
            "expires_at": expires_at,
            "remaining_seconds": remaining_seconds,
            "preserves_home_on_close": True,
        }


@workspace_namespace.route("/admin/runtimes/<int:user_id>/stop")
class AdminRuntimeStop(Resource):
    @admins_only
    def post(self, user_id):
        request_id = _product_request_id()
        actor = get_current_user()
        target = Users.query.get(user_id)
        if target is None:
            return error_envelope(
                "RUNTIME_OWNER_NOT_FOUND",
                "该运行环境所属账号已不存在，请刷新列表后重试。",
                request_id=request_id,
                status=404,
                recovery={"label": "刷新运行环境列表", "href": "/admin/desktops"},
            ), 404

        body = request.get_json(silent=True) or {}
        header_key = str(request.headers.get("Idempotency-Key") or "").strip()
        body_key = str(body.get("idempotencyKey") or "").strip()
        idempotency_key = header_key or body_key
        if header_key and body_key and header_key != body_key:
            return error_envelope(
                "IDEMPOTENCY_KEY_MISMATCH",
                "请求头与请求体中的幂等键不一致，请勿重复提交。",
                request_id=request_id,
                status=409,
            ), 409
        if not _ADMIN_RUNTIME_IDEMPOTENCY_RE.fullmatch(idempotency_key):
            return error_envelope(
                "IDEMPOTENCY_KEY_REQUIRED",
                "停止环境需要有效的幂等键，以便网络中断后安全重试。",
                request_id=request_id,
                status=422,
                field_errors=[{
                    "field": "idempotencyKey",
                    "message": "请提供 8 至 128 位字母、数字或 . _ : -。",
                }],
            ), 422

        replay = _runtime_replay(actor.id, target.id, idempotency_key)
        if replay is not None and replay.outcome in {"ALLOW", "NOOP"}:
            stored = dict((replay.details or {}).get("result") or {})
            stored.update({"replayed": True, "auditEventId": replay.id})
            return success_envelope(
                stored,
                request_id=request_id,
                meta={"idempotentReplay": True},
            )

        confirmation = str(body.get("confirmUser") or "").strip()
        if body.get("confirmed") is not True or confirmation != target.name:
            return error_envelope(
                "RUNTIME_STOP_CONFIRMATION_REQUIRED",
                "请输入完整账号名称并确认影响范围后再停止环境。",
                request_id=request_id,
                status=422,
                field_errors=[{
                    "field": "confirmUser",
                    "message": f"请输入“{target.name}”。",
                }],
                recovery={"label": "返回运行环境列表", "href": "/admin/desktops"},
            ), 422

        try:
            container = get_current_container(target)
        except docker.errors.DockerException:
            _runtime_audit(
                actor,
                target,
                outcome="FAIL",
                request_id=request_id,
                idempotency_key=idempotency_key,
                details={"reasonCode": "RUNTIME_NODE_UNAVAILABLE"},
            )
            db.session.commit()
            return error_envelope(
                "RUNTIME_NODE_UNAVAILABLE",
                "暂时无法连接运行节点，环境状态没有被改写。",
                request_id=request_id,
                status=503,
                retryable=True,
                recovery={"label": "使用同一请求安全重试", "href": "/admin/desktops"},
            ), 503

        if container is None:
            result_data = {
                "userId": target.id,
                "userName": target.name,
                "state": "stopped",
                "alreadyStopped": True,
                "message": "该运行环境此前已经停止，列表状态可以安全刷新。",
            }
            event = _runtime_audit(
                actor,
                target,
                outcome="NOOP",
                request_id=request_id,
                idempotency_key=idempotency_key,
                details={"reasonCode": "ALREADY_STOPPED", "result": result_data},
            )
            db.session.commit()
            result_data["auditEventId"] = event.id
            return success_envelope(result_data, request_id=request_id)

        labels = dict(container.labels or {})
        runtime_snapshot = {
            "courseId": str(labels.get("dojo.dojo_id") or "")[:128] or None,
            "moduleId": str(labels.get("dojo.module_id") or "")[:128] or None,
            "challengeId": str(labels.get("dojo.challenge_id") or "")[:128] or None,
            "containerId": str(container.id or "")[:12] or None,
        }
        try:
            # Reuse the same lifecycle cleanup as a learner-requested stop so
            # node placement and ephemeral volumes remain consistent.
            from .docker import remove_container

            remove_container(target)
            try:
                container.reload()
            except docker.errors.NotFound:
                pass
            else:
                raise RuntimeError("container-still-present")

            attempt_user_id = labels.get("dojo.as_user_id") or target.id
            try:
                attempt_user_id = int(attempt_user_id)
            except (TypeError, ValueError):
                attempt_user_id = target.id
            attempt = (
                LearningAttempts.query.filter_by(user_id=attempt_user_id)
                .filter(LearningAttempts.status.in_(["ACTIVE", "RUNNING", "PROVISIONING"]))
                .order_by(LearningAttempts.started.desc())
                .first()
            )
            if attempt is not None:
                attempt.status = "STOPPED"
                attempt.completed = datetime.datetime.utcnow()
            publish_stat_event("container_stats_update", {})
            result_data = {
                "userId": target.id,
                "userName": target.name,
                "state": "stopped",
                "alreadyStopped": False,
                "message": "运行环境已停止，学习记录与已保存文件保持不变。",
            }
            event = _runtime_audit(
                actor,
                target,
                outcome="ALLOW",
                request_id=request_id,
                idempotency_key=idempotency_key,
                details={"before": runtime_snapshot, "after": {"state": "stopped"}, "result": result_data},
            )
            db.session.commit()
            result_data["auditEventId"] = event.id
            return success_envelope(result_data, request_id=request_id)
        except Exception:
            db.session.rollback()
            _runtime_audit(
                actor,
                target,
                outcome="FAIL",
                request_id=request_id,
                idempotency_key=idempotency_key,
                details={"reasonCode": "RUNTIME_STOP_FAILED", "before": runtime_snapshot},
            )
            db.session.commit()
            return error_envelope(
                "RUNTIME_STOP_FAILED",
                "运行环境未能确认停止，请依据请求编号排查后使用同一请求重试。",
                request_id=request_id,
                status=503,
                retryable=True,
                recovery={"label": "刷新并重试", "href": "/admin/desktops"},
            ), 503


@workspace_namespace.route("/reset_home")
class ResetHome(Resource):
    @authed_only
    def post(self):
        user = get_current_user()

        if not get_current_container(user):
            return {"success": False, "error": "未找到正在运行的工作区。请先启动题目后重试。"}

        try:
            reset_home(user.id)
        except AssertionError as e:
            return {"success": False, "error": f"重置失败：{e}"}

        return {"success": True, "message": "Home 目录已成功重置。"}

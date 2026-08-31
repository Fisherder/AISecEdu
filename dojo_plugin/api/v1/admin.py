import re
import uuid

from flask import request
from flask_restx import Namespace, Resource

from CTFd.models import Users, db
from CTFd.utils.decorators import admins_only
from CTFd.utils.user import clear_user_session, get_current_user

from ...models import DojoAdmins, LearningAuditEvents
from ...product.contracts import error_envelope, success_envelope
from ...utils.request_logging import get_trace_id


admin_namespace = Namespace("admin", description="玄甲 platform governance")

_IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
_ROLE_TYPES = {"standard": "user", "platform_admin": "admin"}
_ROLE_LABELS = {"standard": "标准账号", "platform_admin": "平台管理员"}
_CAPABILITIES = {
    "standard": [],
    "platform_admin": [
        "platform:manage",
        "users:manage",
        "runtime:stop",
        "configuration:manage",
    ],
}


def _request_id():
    value = str(get_trace_id() or "").strip()
    return uuid.uuid4().hex if value in {"", "NONE", "LOCAL"} else value[:64]


def _role(user):
    return "platform_admin" if user.type == "admin" else "standard"


def _role_impact(target, target_role):
    before = _role(target)
    course_count = (
        db.session.query(db.func.count(db.distinct(DojoAdmins.dojo_id)))
        .filter(DojoAdmins.user_id == target.id)
        .scalar()
        or 0
    )
    before_capabilities = set(_CAPABILITIES[before])
    after_capabilities = set(_CAPABILITIES[target_role])
    return {
        "userId": target.id,
        "userName": target.name,
        "before": {
            "role": before,
            "label": _ROLE_LABELS[before],
            "capabilities": sorted(before_capabilities),
        },
        "after": {
            "role": target_role,
            "label": _ROLE_LABELS[target_role],
            "capabilities": sorted(after_capabilities),
        },
        "diff": {
            "granted": sorted(after_capabilities - before_capabilities),
            "revoked": sorted(before_capabilities - after_capabilities),
        },
        "impact": {
            "takesEffect": "immediately_on_next_request",
            "activeSessionsRechecked": True,
            "courseMembershipsChanged": False,
            "courseTeacherMembershipCount": int(course_count),
            "summary": (
                "将获得平台配置、用户、运行环境和审计治理权限；已有课程成员关系不变。"
                if target_role == "platform_admin"
                else "平台治理权限将在下一次请求立即撤销；已有课程教师或学习成员关系不变。"
            ),
        },
        "changed": before != target_role,
    }


def _recent_replay(actor_id, target_id, idempotency_key):
    events = (
        LearningAuditEvents.query.filter_by(
            actor_id=actor_id,
            action="admin.user.platform_role.change",
            resource_type="user",
            resource_id=str(target_id),
        )
        .order_by(LearningAuditEvents.created.desc())
        .limit(50)
        .all()
    )
    return next(
        (
            event for event in events
            if str((event.details or {}).get("idempotencyKey") or "")
            == idempotency_key
        ),
        None,
    )


@admin_namespace.route("/users/<int:user_id>/platform-role")
class AdminUserPlatformRole(Resource):
    @admins_only
    def get(self, user_id):
        request_id = _request_id()
        target = Users.query.get(user_id)
        if target is None:
            return error_envelope(
                "USER_NOT_FOUND",
                "该账号不存在，请刷新用户列表后重试。",
                request_id=request_id,
                status=404,
                recovery={"label": "返回用户列表", "href": "/admin/users"},
            ), 404
        target_role = str(request.args.get("targetRole") or "").strip().lower()
        if target_role not in _ROLE_TYPES:
            return error_envelope(
                "ROLE_INVALID",
                "请选择标准账号或平台管理员。",
                request_id=request_id,
                status=422,
                field_errors=[{"field": "targetRole", "message": "角色值无效。"}],
            ), 422
        return success_envelope(
            _role_impact(target, target_role), request_id=request_id
        )

    @admins_only
    def post(self, user_id):
        request_id = _request_id()
        actor = get_current_user()
        target = Users.query.get(user_id)
        if target is None:
            return error_envelope(
                "USER_NOT_FOUND",
                "该账号不存在，请刷新用户列表后重试。",
                request_id=request_id,
                status=404,
                recovery={"label": "返回用户列表", "href": "/admin/users"},
            ), 404
        if actor.id == target.id:
            return error_envelope(
                "SELF_ROLE_CHANGE_FORBIDDEN",
                "不能在当前会话中修改自己的平台权限，请由另一名管理员处理。",
                request_id=request_id,
                status=409,
                recovery={"label": "返回用户列表", "href": "/admin/users"},
            ), 409
        target_id = target.id

        body = request.get_json(silent=True) or {}
        target_role = str(body.get("targetRole") or "").strip().lower()
        if target_role not in _ROLE_TYPES:
            return error_envelope(
                "ROLE_INVALID",
                "请选择标准账号或平台管理员。",
                request_id=request_id,
                status=422,
                field_errors=[{"field": "targetRole", "message": "角色值无效。"}],
            ), 422

        header_key = str(request.headers.get("Idempotency-Key") or "").strip()
        body_key = str(body.get("idempotencyKey") or "").strip()
        idempotency_key = header_key or body_key
        if header_key and body_key and header_key != body_key:
            return error_envelope(
                "IDEMPOTENCY_KEY_MISMATCH",
                "请求头与请求体中的幂等键不一致。",
                request_id=request_id,
                status=409,
            ), 409
        if not _IDEMPOTENCY_RE.fullmatch(idempotency_key):
            return error_envelope(
                "IDEMPOTENCY_KEY_REQUIRED",
                "权限变更需要有效幂等键，以便网络中断后安全重试。",
                request_id=request_id,
                status=422,
                field_errors=[{
                    "field": "idempotencyKey",
                    "message": "请提供 8 至 128 位字母、数字或 . _ : -。",
                }],
            ), 422

        replay = _recent_replay(actor.id, target.id, idempotency_key)
        if replay is not None and replay.outcome in {"ALLOW", "NOOP"}:
            stored = dict((replay.details or {}).get("result") or {})
            stored.update({"replayed": True, "auditEventId": replay.id})
            return success_envelope(
                stored,
                request_id=request_id,
                meta={"idempotentReplay": True},
            )

        reason = str(body.get("reason") or "").strip()
        if body.get("confirmed") is not True or str(body.get("confirmUser") or "").strip() != target.name:
            return error_envelope(
                "ROLE_CHANGE_CONFIRMATION_REQUIRED",
                "请输入完整账号名称并确认权限影响。",
                request_id=request_id,
                status=422,
                field_errors=[{
                    "field": "confirmUser",
                    "message": f"请输入“{target.name}”。",
                }],
            ), 422
        if len(reason) < 8 or len(reason) > 240:
            return error_envelope(
                "ROLE_CHANGE_REASON_REQUIRED",
                "请填写 8 至 240 个字符的权限变更原因。",
                request_id=request_id,
                status=422,
                field_errors=[{
                    "field": "reason",
                    "message": "原因需为 8 至 240 个字符。",
                }],
            ), 422

        impact = _role_impact(target, target_role)
        target.type = _ROLE_TYPES[target_role]
        result = {
            **impact,
            "reason": reason,
            "effective": True,
            "replayed": False,
        }
        event = LearningAuditEvents(
            actor_id=actor.id,
            action="admin.user.platform_role.change",
            resource_type="user",
            resource_id=str(target.id),
            outcome="ALLOW" if impact["changed"] else "NOOP",
            details={
                "requestId": request_id,
                "idempotencyKey": idempotency_key,
                "reason": reason,
                "before": impact["before"],
                "after": impact["after"],
                "diff": impact["diff"],
                "impact": impact["impact"],
                "result": result,
            },
        )
        db.session.add(event)
        db.session.commit()
        # CTFd memoizes the authorization attributes for five minutes.  A
        # database-only mutation would therefore leave an already signed-in
        # account with stale admin authorization.  Invalidate that exact user
        # after the commit so promotion and revocation apply on the next
        # request without disturbing unrelated sessions.
        clear_user_session(user_id=target_id)
        result["auditEventId"] = event.id
        return success_envelope(result, request_id=request_id)

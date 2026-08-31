from flask_restx import Namespace, Resource
from flask import current_app, request, session
from itsdangerous.url_safe import URLSafeTimedSerializer
from sqlalchemy.exc import IntegrityError

from CTFd.cache import clear_challenges, clear_standings
from CTFd.models import Users, db
from CTFd.schemas.users import UserSchema
from CTFd.utils import email, get_config
from CTFd.utils.config import can_send_mail
from CTFd.utils.crypto import verify_password
from CTFd.utils.decorators import authed_only, ratelimit
from CTFd.utils.security.auth import update_user
from CTFd.utils.user import get_current_user
from ...config import DOJO_SSH_SERVICE_KEY
from ...models import DojoAdmins, UserAccountPreferences
from ...utils import get_current_container

user_namespace = Namespace("user", description="User management endpoints")
CLI_AUTH_PREFIX = "sk-workspace-local-"
SSH_AUTH_PREFIX = "sk-ssh-service-"
ACCOUNT_APPEARANCES = {"system", "light", "dark"}
ACCOUNT_PALETTES = {"academy", "forest", "sunrise", "midnight"}


def _settings_error(message, status=400, *, field=None, code="INVALID_SETTINGS"):
    payload = {"success": False, "errors": [str(message)], "errorCode": code}
    if field:
        payload["field"] = field
    return payload, status


def _course_teacher(user):
    return (
        user.type == "admin"
        or DojoAdmins.query.filter_by(user_id=user.id).first() is not None
    )


def _can_change_name(user):
    if user.type == "admin":
        return True
    if bool(get_config("prevent_name_change", default=False)):
        return False
    return bool(get_config("name_changes", default=True))


def _preferences_for(user, *, create=False):
    preferences = UserAccountPreferences.query.filter_by(user_id=user.id).first()
    if preferences is None and create:
        preferences = UserAccountPreferences(user_id=user.id)
        db.session.add(preferences)
    return preferences


def _settings_view(user):
    preferences = _preferences_for(user)
    local_password = bool(user.password) and not bool(user.oauth_id)
    course_teacher = _course_teacher(user)
    return {
        "profile": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "website": user.website or "",
            "affiliation": user.affiliation or "",
            "country": user.country or "",
            "hidden": bool(user.hidden),
            "verified": bool(user.verified),
            "role": (
                "admin"
                if user.type == "admin"
                else "teacher"
                if course_teacher
                else "student"
            ),
            "courseTeacher": course_teacher,
            "oauthManaged": bool(user.oauth_id),
        },
        "preferences": {
            "appearance": preferences.appearance if preferences else "system",
            "palette": preferences.palette if preferences else "academy",
            "reducedMotion": bool(preferences.reduced_motion) if preferences else False,
        },
        "capabilities": {
            "canChangeName": _can_change_name(user),
            "canChangeEmail": local_password,
            "canChangePassword": local_password,
            "requiresCurrentPasswordForEmail": local_password,
            "emailVerificationRequired": bool(get_config("verify_emails")),
            "archivedConversations": course_teacher,
        },
    }


def _json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


def _first_schema_error(errors):
    if isinstance(errors, dict):
        for field, messages in errors.items():
            if isinstance(messages, (list, tuple)) and messages:
                return str(messages[0]), str(field)
            if messages:
                return str(messages), str(field)
    if isinstance(errors, (list, tuple)) and errors:
        return str(errors[0]), None
    return "设置内容无效。", None


def authed_only_ssh(func):
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return func(*args, **kwargs)
        if not auth_header.startswith("Bearer "):
            return func(*args, **kwargs)
        token = auth_header[len("Bearer "):].strip()
        if not token.startswith(SSH_AUTH_PREFIX):
            return func(*args, **kwargs)
        token = token[len(SSH_AUTH_PREFIX):].strip()
        try:
            user_id, token_tag = URLSafeTimedSerializer(DOJO_SSH_SERVICE_KEY).loads(token, max_age=300)
            assert token_tag == "ssh-tui"
        except Exception:
            return {"success": False, "error": "SSH 服务令牌验证失败。"}, 401
        user = Users.query.filter_by(id=user_id).first()
        if not user:
            return {"success": False, "error": "未找到用户。"}, 404
        try:
            session.update({
                "id": user.id,
                "name": user.name,
                "type": user.type,
                "verified": user.verified,
            })
            return func(*args, **kwargs)
        finally:
            for k in ("id", "name", "type", "verified"):
                session.pop(k, None)
        return func(*args, **kwargs)

    return wrapper


def authed_only_cli(func):
    """Allows an endpoint to be used by the dojo cli application."""

    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return func(*args, **kwargs)
        if not auth_header.startswith("Bearer "):
            return func(*args, **kwargs)
        token = auth_header[len("Bearer "):].strip()
        if not token.startswith(CLI_AUTH_PREFIX):
            return func(*args, **kwargs)
        token = token[len(CLI_AUTH_PREFIX):].strip()
        try:
            user_id, challenge_id, token_tag = URLSafeTimedSerializer(
                current_app.config["SECRET_KEY"]
            ).loads(token, max_age=21600)
            assert token_tag == "cli-auth-token"
        except Exception:
            return {"success": False, "error": "工作区令牌验证失败。"}, 401
        user = Users.query.filter_by(id=user_id).one()
        container = get_current_container(user)
        if container is None:
            return {"success": False, "error": "当前没有运行中的题目工作区。"}, 403
        if container.labels["dojo.challenge_id"] != challenge_id:
            return {"success": False, "error": "该令牌无法验证当前运行中的题目工作区。"}, 403
        try:
            session.update({
                "id": user.id,
                "name": user.name,
                "type": user.type,
                "verified": user.verified,
            })
            return func(*args, **kwargs)
        finally:
            for key in ("id", "name", "type", "verified"):
                session.pop(key, None)

    return wrapper


@user_namespace.route("/me")
class CurrentUser(Resource):
    @authed_only_cli
    @authed_only
    def get(self):
        """Get current user information"""
        user = get_current_user()
        return {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "website": user.website,
            "affiliation": user.affiliation,
            "country": user.country,
            "bracket": user.bracket,
            "hidden": user.hidden,
            "banned": user.banned,
            "verified": user.verified,
            "admin": user.type == "admin",
            "course_teacher": user.type == "admin"
            or DojoAdmins.query.filter_by(user_id=user.id).first() is not None,
        }


@user_namespace.route("/settings")
class CurrentUserSettings(Resource):
    @authed_only
    def get(self):
        return {"success": True, "data": _settings_view(get_current_user())}

    @authed_only
    def patch(self):
        user = get_current_user()
        body = _json_body()
        if body is None:
            return _settings_error("请求内容必须是 JSON 对象。")

        unknown = set(body) - {"profile", "preferences", "currentPassword"}
        if unknown:
            return _settings_error(f"不支持的设置字段：{', '.join(sorted(unknown))}。")

        has_profile = "profile" in body
        has_preferences = "preferences" in body
        if not has_profile and not has_preferences:
            return _settings_error("没有需要保存的设置。")

        profile = body.get("profile") if has_profile else None
        preferences = body.get("preferences") if has_preferences else None
        if has_profile and not isinstance(profile, dict):
            return _settings_error("个人资料必须是对象。", field="profile")
        if has_preferences and not isinstance(preferences, dict):
            return _settings_error("偏好设置必须是对象。", field="preferences")

        allowed_profile = {
            "name",
            "email",
            "website",
            "affiliation",
            "country",
            "hidden",
        }
        allowed_preferences = {"appearance", "palette", "reducedMotion"}
        unknown_profile = set(profile or {}) - allowed_profile
        unknown_preferences = set(preferences or {}) - allowed_preferences
        if unknown_profile:
            return _settings_error(
                f"不支持的个人资料字段：{', '.join(sorted(unknown_profile))}。",
                field="profile",
            )
        if unknown_preferences:
            return _settings_error(
                f"不支持的偏好设置字段：{', '.join(sorted(unknown_preferences))}。",
                field="preferences",
            )

        preference_updates = {}
        if "appearance" in (preferences or {}):
            appearance = preferences["appearance"]
            if appearance not in ACCOUNT_APPEARANCES:
                return _settings_error(
                    "外观必须是 system、light 或 dark。",
                    field="preferences.appearance",
                )
            preference_updates["appearance"] = appearance
        if "palette" in (preferences or {}):
            palette = preferences["palette"]
            if palette not in ACCOUNT_PALETTES:
                return _settings_error("配色方案无效。", field="preferences.palette")
            preference_updates["palette"] = palette
        if "reducedMotion" in (preferences or {}):
            reduced_motion = preferences["reducedMotion"]
            if not isinstance(reduced_motion, bool):
                return _settings_error(
                    "减少动态效果必须是布尔值。",
                    field="preferences.reducedMotion",
                )
            preference_updates["reduced_motion"] = reduced_motion

        profile_data = {}
        hidden_update = None
        hidden_was_supplied = False
        for key, value in (profile or {}).items():
            if key == "hidden":
                if not isinstance(value, bool):
                    return _settings_error(
                        "个人资料可见性必须是布尔值。",
                        field="profile.hidden",
                    )
                hidden_update = value
                hidden_was_supplied = True
                continue
            if not isinstance(value, str):
                return _settings_error(f"{key} 必须是文本。", field=f"profile.{key}")
            normalized = value.strip()
            if key == "email":
                normalized = normalized.lower()
            elif key == "country":
                normalized = normalized.upper() or None
            profile_data[key] = normalized

        if "name" in profile_data and profile_data["name"] != user.name:
            if not _can_change_name(user):
                return _settings_error(
                    "当前平台不允许修改用户名。",
                    403,
                    field="profile.name",
                    code="NAME_CHANGE_DISABLED",
                )

        email_changed = "email" in profile_data and profile_data["email"] != user.email
        if email_changed:
            if not user.password or user.oauth_id:
                return _settings_error(
                    "该账号的电子邮箱由外部登录服务管理。",
                    409,
                    field="profile.email",
                    code="OAUTH_MANAGED_ACCOUNT",
                )
            current_password = body.get("currentPassword")
            if not isinstance(current_password, str) or not current_password:
                return _settings_error(
                    "修改电子邮箱前请输入当前密码。",
                    field="currentPassword",
                    code="CURRENT_PASSWORD_REQUIRED",
                )
            if not verify_password(current_password, user.password):
                return _settings_error(
                    "当前密码不正确。",
                    403,
                    field="currentPassword",
                    code="CURRENT_PASSWORD_INVALID",
                )
            profile_data["confirm"] = current_password

        try:
            if profile_data:
                schema = UserSchema(view="self", instance=user, partial=True)
                loaded = schema.load(profile_data)
                if loaded.errors:
                    message, field = _first_schema_error(loaded.errors)
                    db.session.rollback()
                    return _settings_error(message, field=field)

            if hidden_was_supplied:
                user.hidden = hidden_update

            if preference_updates:
                preference_row = _preferences_for(user, create=True)
                for key, value in preference_updates.items():
                    setattr(preference_row, key, value)

            db.session.commit()
            update_user(user)
            if profile:
                clear_standings()
                clear_challenges()
        except IntegrityError:
            db.session.rollback()
            return _settings_error(
                "用户名或电子邮箱已被使用。",
                409,
                code="ACCOUNT_CONFLICT",
            )

        if email_changed and get_config("verify_emails") and can_send_mail():
            try:
                email.verify_email_address(user.email)
            except Exception:
                current_app.logger.exception(
                    "Unable to send verification email for user %s", user.id
                )

        return {
            "success": True,
            "data": {
                **_settings_view(user),
                "message": "设置已保存。",
            },
        }


@user_namespace.route("/settings/password")
class CurrentUserPassword(Resource):
    @authed_only
    @ratelimit(method="POST", limit=5, interval=60)
    def post(self):
        user = get_current_user()
        body = _json_body()
        if body is None:
            return _settings_error("请求内容必须是 JSON 对象。")

        unknown = set(body) - {
            "currentPassword",
            "newPassword",
            "confirmPassword",
        }
        if unknown:
            return _settings_error(f"不支持的密码字段：{', '.join(sorted(unknown))}。")
        if not user.password or user.oauth_id:
            return _settings_error(
                "该账号的密码由外部登录服务管理。",
                409,
                code="OAUTH_MANAGED_ACCOUNT",
            )

        current_password = body.get("currentPassword")
        new_password = body.get("newPassword")
        confirmation = body.get("confirmPassword")
        if not all(
            isinstance(value, str)
            for value in (current_password, new_password, confirmation)
        ):
            return _settings_error("请完整填写当前密码和新密码。")
        if not verify_password(current_password, user.password):
            return _settings_error(
                "当前密码不正确。",
                403,
                field="currentPassword",
                code="CURRENT_PASSWORD_INVALID",
            )
        if new_password != confirmation:
            return _settings_error(
                "两次输入的新密码不一致。",
                field="confirmPassword",
                code="PASSWORD_MISMATCH",
            )
        if len(new_password) < 8:
            return _settings_error("新密码至少需要 8 个字符。", field="newPassword")
        if len(new_password) > 128:
            return _settings_error("新密码不能超过 128 个字符。", field="newPassword")
        if verify_password(new_password, user.password):
            return _settings_error("新密码不能与当前密码相同。", field="newPassword")

        user.password = new_password
        db.session.commit()
        update_user(user)

        if can_send_mail():
            try:
                email.password_change_alert(user.email)
            except Exception:
                current_app.logger.exception(
                    "Unable to send password change alert for user %s", user.id
                )

        return {
            "success": True,
            "data": {
                "message": "密码已更新，其他设备上的登录状态已失效。",
                "reauthRequired": False,
            },
        }

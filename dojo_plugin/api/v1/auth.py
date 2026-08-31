import base64
import secrets

from flask import request, session
from flask_restx import Namespace, Resource
from itsdangerous.exc import BadSignature, BadTimeSignature, SignatureExpired
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_

from CTFd.cache import clear_user_session
from CTFd.models import UserFieldEntries, UserFields, Users, db
from CTFd.utils import email, get_config, validators
from CTFd.utils.config import can_send_mail
from CTFd.utils.config.integrations import mlc
from CTFd.utils.config.visibility import registration_visible
from CTFd.utils.crypto import verify_password
from CTFd.utils.decorators import authed_only, ratelimit
from CTFd.utils.logging import log
from CTFd.utils.security.auth import login_user, logout_user
from CTFd.utils.security.signing import unserialize
from CTFd.utils.user import get_current_user
from CTFd.utils.validators import ValidationError

auth_namespace = Namespace("auth", description="认证接口")

REGISTRATION_COMMITMENT = (
    "我已阅读并同意遵守平台公约，不公开玄甲课程题目的解题过程或答案。"
)


def _course_by_reference(reference):
    from ...models import Dojos

    reference = str(reference or "").strip().strip("/")
    if not reference or len(reference) > 96:
        return None
    try:
        return Dojos.from_id(reference).first()
    except (TypeError, ValueError):
        return None


def _course_summary(course):
    return {
        "id": course.reference_id,
        "name": course.name or course.id,
        "description": str(course.description or "")[:360],
        "official": bool(course.official),
        "access": "public" if course.type == "public" else "invite",
    }


def _message(message):
    return {"success": True, "data": {"message": message}}


def _auth_user_data(user):
    from ...models import DojoAdmins

    return {
        "user_id": user.id,
        "username": user.name,
        "email": user.email,
        "type": user.type,
        "verified": user.verified,
        "team_id": user.team_id,
        "course_teacher": user.type == "admin"
        or DojoAdmins.query.filter_by(user_id=user.id).first() is not None,
    }


def _payload():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _text(payload, key):
    value = payload.get(key, "")
    return value.strip() if isinstance(value, str) else ""


def _legal_document(name):
    if name == "terms":
        return get_config("tos_url"), get_config("tos_text")
    if name == "privacy":
        return get_config("privacy_url"), get_config("privacy_text")
    return None, None


@auth_namespace.route("/config")
class AuthConfig(Resource):
    def get(self):
        """Return public authentication configuration for compatibility clients."""
        terms_url, terms_text = _legal_document("terms")
        privacy_url, privacy_text = _legal_document("privacy")
        return {
            "success": True,
            "data": {
                "registrationEnabled": bool(registration_visible()),
                "registrationCodeRequired": bool(get_config("registration_code")),
                "emailVerificationRequired": bool(
                    get_config("verify_emails") and can_send_mail()
                ),
                "mailEnabled": bool(can_send_mail()),
                "oauthEnabled": bool(mlc()),
                "commitment": {
                    "required": True,
                    "text": REGISTRATION_COMMITMENT,
                },
                "customFields": [
                    {
                        "id": field.id,
                        "name": field.name,
                        "description": field.description,
                        "type": field.field_type,
                        "required": bool(field.required),
                    }
                    for field in UserFields.query.order_by(UserFields.id).all()
                ],
                "legal": {
                    "terms": {
                        "enabled": bool(terms_url or terms_text),
                        "href": terms_url or "/terms",
                    },
                    "privacy": {
                        "enabled": bool(privacy_url or privacy_text),
                        "href": privacy_url or "/privacy",
                    },
                },
                "onboarding": {
                    "roles": ["student", "teacher"],
                    "studentDestination": "/student",
                    "teacherDestination": "/teacher/courses/new?onboarding=1",
                    "courseInvitationSupported": True,
                },
            },
        }


@auth_namespace.route("/courses")
class PublicRegistrationCourses(Resource):
    def get(self):
        """Return only courses that are intentionally public at registration."""
        from ...models import Dojos

        query = Dojos.query.filter(
            or_(Dojos.official.is_(True), Dojos.data["type"].astext == "public")
        )
        text_query = str(request.args.get("q") or "").strip()
        if text_query:
            escaped = text_query.replace("%", "\\%").replace("_", "\\_")
            query = query.filter(
                or_(
                    Dojos.name.ilike(f"%{escaped}%", escape="\\"),
                    Dojos.id.ilike(f"%{escaped}%", escape="\\"),
                )
            )
        courses = query.order_by(Dojos.official.desc(), Dojos.name).limit(80).all()
        return {
            "success": True,
            "data": {"courses": [_course_summary(course) for course in courses]},
        }


@auth_namespace.route("/legal/<string:document>")
class LegalDocument(Resource):
    def get(self, document):
        if document not in {"terms", "privacy"}:
            return {"success": False, "errors": ["未找到该文档。"]}, 404
        external_url, content = _legal_document(document)
        if not external_url and not content:
            return {"success": False, "errors": ["该文档尚未配置。"]}, 404
        return {
            "success": True,
            "data": {
                "document": document,
                "externalUrl": external_url,
                "content": content,
            },
        }


@auth_namespace.route("/register")
class Register(Resource):
    @auth_namespace.doc(
        description="Register a new user and set session",
        responses={
            200: ("Success", "SuccessResponse"),
            400: ("Validation error", "ErrorResponse"),
            403: ("Registration disabled", "ErrorResponse"),
        },
    )
    @ratelimit(method="POST", limit=10, interval=5)
    def post(self):
        if not registration_visible():
            return {
                "success": False,
                "errors": ["当前未开放注册。"],
            }, 403
        if get_current_user():
            return {"success": False, "errors": ["当前已登录。"]}, 409

        req = _payload()
        errors = []

        # Get registration data
        name = _text(req, "name")
        email_address = _text(req, "email").lower()
        password = _text(req, "password")
        website = _text(req, "website")
        affiliation = _text(req, "affiliation")
        country = _text(req, "country")
        onboarding_role = _text(req, "role").lower() or "student"
        course_reference = _text(req, "course_id")
        course_password = _text(req, "course_password")
        enrollment_course = None

        if onboarding_role not in {"student", "teacher"}:
            errors.append("请选择学生或教师身份。")
        if course_reference:
            if onboarding_role != "student":
                errors.append("教师起点不能同时加入学生课程。")
            else:
                enrollment_course = _course_by_reference(course_reference)
                if enrollment_course is None:
                    errors.append("未找到邀请中的课程，请检查课程标识。")
                elif enrollment_course.password and not secrets.compare_digest(
                    str(enrollment_course.password), course_password
                ):
                    errors.append("课程邀请码不正确。")

        if req.get("commitment_accepted") is not True:
            errors.append("请先同意平台公约。")

        # Check user limit
        num_users_limit = int(get_config("num_users", default=0))
        num_users = Users.query.filter_by(banned=False, hidden=False).count()
        if num_users_limit and num_users >= num_users_limit:
            return {
                "success": False,
                "errors": [f"平台用户数量已达到上限（{num_users_limit}）。"],
            }, 403

        # Validation
        if len(name) == 0:
            errors.append("请填写用户名。")
        if Users.query.filter_by(name=name).first():
            errors.append("该用户名已被使用。")
        if validators.validate_email(name):
            errors.append("用户名不能是电子邮箱地址。")

        if not validators.validate_email(email_address):
            errors.append("请输入有效的电子邮箱地址。")
        if Users.query.filter_by(email=email_address).first():
            errors.append("该电子邮箱已注册。")
        if not email.check_email_is_whitelisted(email_address):
            errors.append("该电子邮箱域名不在允许范围内。")

        if len(password) == 0:
            errors.append("请填写密码。")
        if len(password) > 128:
            errors.append("密码过长。")

        if website and not validators.validate_url(website):
            errors.append("个人网站必须是有效的 URL。")

        if country:
            try:
                validators.validate_country_code(country)
            except ValidationError:
                errors.append("国家或地区代码无效。")

        if affiliation and len(affiliation) > 128:
            errors.append("所属机构名称过长。")

        # Check registration code if required
        if get_config("registration_code"):
            registration_code = _text(req, "registration_code")
            if (
                registration_code.lower()
                != str(get_config("registration_code", "")).lower()
            ):
                errors.append("注册码无效。")

        # Process custom fields
        fields = {}
        for field in UserFields.query.all():
            field_value = req.get(
                f"fields[{field.id}]", False if field.field_type == "boolean" else ""
            )
            if field.field_type == "boolean":
                field_value = field_value is True or str(field_value).lower() in {
                    "1",
                    "true",
                    "on",
                    "yes",
                }
            else:
                field_value = str(field_value).strip()
            if field.required and (field_value is False or field_value == ""):
                errors.append(f"必须填写字段“{field.name}”。")
            fields[field.id] = field_value

        if errors:
            return {"success": False, "errors": errors}, 400

        # Create user
        user = Users(name=name, email=email_address, password=password)
        if website:
            user.website = website
        if affiliation:
            user.affiliation = affiliation
        if country:
            user.country = country

        verification_required = bool(get_config("verify_emails") and can_send_mail())
        user.verified = not verification_required

        try:
            from ...models import DojoMembers

            db.session.add(user)
            db.session.flush()
            for field_id, value in fields.items():
                db.session.add(
                    UserFieldEntries(field_id=field_id, value=value, user_id=user.id)
                )
            if enrollment_course is not None:
                db.session.add(DojoMembers(dojo=enrollment_course, user=user))
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return {
                "success": False,
                "errors": ["该用户名或电子邮箱已注册。"],
            }, 409

        session.regenerate()
        login_user(user)
        log(
            "registrations",
            "[{date}] {ip} - {name} registered with {email}",
            name=user.name,
            email=user.email,
        )

        if verification_required:
            email.verify_email_address(user.email)
        else:
            if can_send_mail():
                email.successful_registration_notification(user.email)

        destination = (
            "/teacher/courses/new?onboarding=1"
            if onboarding_role == "teacher"
            else f"/{enrollment_course.reference_id}"
            if enrollment_course is not None
            else "/student"
        )
        user_data = _auth_user_data(user)
        user_data["onboarding"] = {
            "role": onboarding_role,
            "destination": destination,
            "emailVerificationRequired": verification_required,
            "enrollment": (
                _course_summary(enrollment_course)
                if enrollment_course is not None
                else None
            ),
        }
        return {"success": True, "data": user_data}


@auth_namespace.route("/login")
class Login(Resource):
    @auth_namespace.doc(
        description="Login and set session",
        responses={
            200: ("Success", "SuccessResponse"),
            401: ("Invalid credentials", "ErrorResponse"),
        },
    )
    @ratelimit(method="POST", limit=10, interval=5)
    def post(self):
        req = _payload()
        name = _text(req, "name")
        password = _text(req, "password")

        # Check if email or username
        if validators.validate_email(name):
            user = Users.query.filter_by(email=name).first()
        else:
            user = Users.query.filter_by(name=name).first()

        if user:
            if user.password is None:
                return {
                    "success": False,
                    "errors": [
                        "该账号通过 OAuth 注册，请使用对应的 OAuth 方式登录。"
                    ],
                }, 401

            if verify_password(password, user.password):
                session.regenerate()
                login_user(user)
                session.permanent = req.get("remember_me") is True
                log("logins", "[{date}] {ip} - {name} logged in", name=user.name)

                return {
                    "success": True,
                    "data": _auth_user_data(user),
                }

        log("logins", "[{date}] {ip} - submitted invalid account information")
        return {"success": False, "errors": ["用户名或密码不正确。"]}, 401


@auth_namespace.route("/logout")
class Logout(Resource):
    @auth_namespace.doc(
        description="Logout and clear session",
        responses={
            200: ("Success", "SuccessResponse"),
        },
    )
    def post(self):
        logout_user()
        return {"success": True, "data": {"message": "已成功退出登录。"}}


@auth_namespace.route("/verify/<token>")
class VerifyEmail(Resource):
    @auth_namespace.doc(
        description="Verify email address with token",
        responses={
            200: ("Success", "SuccessResponse"),
            400: ("Invalid or expired token", "ErrorResponse"),
        },
    )
    def get(self, token):
        """Verify email with token"""
        try:
            user_email = unserialize(token, max_age=1800)
        except (BadTimeSignature, SignatureExpired):
            return {
                "success": False,
                "errors": ["验证链接已过期。"],
            }, 400
        except (BadSignature, TypeError, base64.binascii.Error):
            return {
                "success": False,
                "errors": ["验证令牌无效。"],
            }, 400

        user = Users.query.filter_by(email=user_email).first()
        if not user:
            return {"success": False, "errors": ["未找到用户。"]}, 404

        if user.verified:
            return {"success": True, "data": {"message": "电子邮箱已验证。"}}

        user.verified = True
        db.session.commit()
        clear_user_session(user_id=user.id)

        if can_send_mail():
            email.successful_registration_notification(user.email)

        return {"success": True, "data": {"message": "电子邮箱验证成功。"}}


@auth_namespace.route("/forgot-password")
class ForgotPassword(Resource):
    @auth_namespace.doc(
        description="Request password reset email",
        responses={
            200: ("Success", "SuccessResponse"),
        },
    )
    @ratelimit(method="POST", limit=10, interval=60)
    def post(self):
        """Request password reset"""
        if not can_send_mail():
            return {
                "success": False,
                "errors": ["平台尚未配置邮件功能。"],
            }, 400

        req = _payload()
        email_address = _text(req, "email").lower()

        user = Users.query.filter_by(email=email_address).first()
        if user and not user.oauth_id:
            email.forgot_password(email_address)

        # Always return success to avoid user enumeration
        return _message("若该账号存在，重置密码邮件已发送。")


@auth_namespace.route("/reset-password/<token>")
class ResetPassword(Resource):
    @auth_namespace.doc(
        description="Reset password with token",
        responses={
            200: ("Success", "SuccessResponse"),
            400: ("Invalid token or request", "ErrorResponse"),
        },
    )
    @ratelimit(method="POST", limit=10, interval=60)
    def post(self, token):
        """Reset password with token"""
        try:
            email_address = unserialize(token, max_age=1800)
        except (BadTimeSignature, SignatureExpired):
            return {"success": False, "errors": ["密码重置链接已过期。"]}, 400
        except (BadSignature, TypeError, base64.binascii.Error):
            return {"success": False, "errors": ["密码重置令牌无效。"]}, 400

        req = _payload()
        password = _text(req, "password")

        if len(password) == 0:
            return {"success": False, "errors": ["请填写密码。"]}, 400

        if len(password) > 128:
            return {"success": False, "errors": ["密码过长。"]}, 400

        user = Users.query.filter_by(email=email_address).first()
        if not user:
            return {"success": False, "errors": ["未找到用户。"]}, 404

        if user.oauth_id:
            return {
                "success": False,
                "errors": ["通过 OAuth 注册的账号无法在此重置密码。"],
            }, 400

        user.password = password
        db.session.commit()
        clear_user_session(user_id=user.id)
        log(
            "logins",
            "[{date}] {ip} - successful password reset for {name}",
            name=user.name,
        )

        if can_send_mail():
            email.password_change_alert(user.email)

        return _message("密码重置成功。")


@auth_namespace.route("/resend-verification")
class ResendVerification(Resource):
    @authed_only
    @ratelimit(method="POST", limit=5, interval=300)
    def post(self):
        user = get_current_user()
        if user.verified:
            return _message("电子邮箱已验证。")
        if not can_send_mail():
            return {
                "success": False,
                "errors": ["平台尚未配置邮件功能。"],
            }, 400
        email.verify_email_address(user.email)
        return _message(f"验证邮件已发送至 {user.email}。")

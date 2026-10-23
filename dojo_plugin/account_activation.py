import datetime

from flask import jsonify, redirect, request
from CTFd.models import db
from CTFd.utils.user import get_current_user

from .models.construction import ConstructionMembers


class AssignedAccountActivation(db.Model):
    __tablename__ = "assigned_account_activations"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    completed_at = db.Column(db.DateTime)


def activation_required(user):
    if user is None:
        return False
    record = AssignedAccountActivation.query.filter_by(user_id=user.id).first()
    if record is not None:
        return record.completed_at is None
    return ConstructionMembers.query.filter_by(user_id=user.id, active=True, activated=None).first() is not None


def require_password_change(user):
    record = AssignedAccountActivation.query.filter_by(user_id=user.id).first()
    if record is None:
        record = AssignedAccountActivation(user_id=user.id)
        db.session.add(record)
    record.completed_at = None
    ConstructionMembers.query.filter_by(user_id=user.id, active=True).update({"activated": None})


def complete_password_change(user):
    completed = datetime.datetime.utcnow()
    record = AssignedAccountActivation.query.filter_by(user_id=user.id).first()
    if record is None:
        record = AssignedAccountActivation(user_id=user.id)
        db.session.add(record)
    record.completed_at = completed
    ConstructionMembers.query.filter_by(user_id=user.id, active=True).update({"activated": completed})


def require_account_activation():
    path = request.path
    if request.method == "OPTIONS" or request.endpoint in {"views.themes", "views.themes_beta", "static"} or path.startswith(("/themes/", "/static/", "/assets/")) or path == "/favicon.ico":
        return None
    if path in {"/activate-account", "/login", "/logout", "/pwncollege_api/v1/auth/login", "/pwncollege_api/v1/auth/logout", "/pwncollege_api/v1/users/activation"}:
        return None
    user = get_current_user()
    if not activation_required(user):
        return None
    if path.startswith("/pwncollege_api/"):
        return jsonify({"success": False, "errorCode": "ACCOUNT_ACTIVATION_REQUIRED", "errors": ["请先修改初始密码以激活账号。"], "activationUrl": "/activate-account"}), 403
    target = path + ("?" + request.query_string.decode("utf-8", "replace") if request.query_string else "")
    from urllib.parse import urlencode
    return redirect("/activate-account?" + urlencode({"next": target}))

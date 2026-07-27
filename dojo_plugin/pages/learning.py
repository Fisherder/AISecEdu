from flask import Blueprint, abort, redirect, render_template, url_for

from CTFd.utils import get_config
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ..models import DojoChallenges, LearningAttempts
from ..utils.dojo import dojo_admins_only, dojo_route


learning = Blueprint("pwncollege_learning", __name__)


@learning.route("/learning")
@learning.route("/learning/")
@authed_only
def overview():
    return render_template("learning.html")


@learning.route("/dojo/<dojo>/learning")
@learning.route("/dojo/<dojo>/learning/")
@authed_only
@dojo_route
def dashboard(dojo):
    return render_template("learning_dashboard.html", dojo=dojo)


@learning.route("/learning/scores/latest/<int:challenge_id>")
@authed_only
def latest_score(challenge_id):
    attempts = LearningAttempts.query.filter_by(
        user_id=get_current_user().id,
        challenge_id=challenge_id,
    )
    attempt = (
        attempts.filter_by(status="SOLVED")
        .order_by(LearningAttempts.completed.desc())
        .first()
        or attempts.order_by(LearningAttempts.started.desc()).first_or_404()
    )
    return redirect(
        url_for("pwncollege_learning.score", attempt_id=attempt.id),
        code=302,
    )


@learning.route("/learning/attempts/<attempt_id>/score")
@authed_only
def score(attempt_id):
    attempt = LearningAttempts.query.get_or_404(attempt_id)
    challenge = DojoChallenges.query.filter_by(
        dojo_id=attempt.dojo_id,
        module_index=attempt.module_index,
        challenge_index=attempt.challenge_index,
    ).first_or_404()
    user = get_current_user()
    if attempt.user_id != user.id and not challenge.dojo.is_admin(user):
        abort(403)
    return render_template(
        "learning_score.html",
        attempt_id=attempt.id,
        challenge=challenge,
    )


@learning.route("/dojo/<dojo>/studio")
@learning.route("/dojo/<dojo>/studio/")
@authed_only
@dojo_route
@dojo_admins_only
def studio(dojo):
    return render_template("learning_studio.html", dojo=dojo)


@learning.route("/dojo/<dojo>/module/<module>")
@learning.route("/dojo/<dojo>/module/<module>/")
@dojo_route
def module_compatibility(dojo, module):
    return redirect(f"/{dojo.reference_id}/{module.id}", code=308)


@learning.route("/dojo/<dojo>/module/<module>/workspace", defaults={"selection": ""})
@learning.route("/dojo/<dojo>/module/<module>/workspace/", defaults={"selection": ""})
@learning.route("/dojo/<dojo>/module/<module>/workspace/<path:selection>")
@dojo_route
def workspace_compatibility(dojo, module, selection):
    parts = selection.strip("/").split("/") if selection else []
    if len(parts) >= 2 and parts[0] == "challenge":
        challenge = next(
            (item for item in module.challenges if item.id == parts[1]), None
        )
        if challenge is None:
            abort(404)
        return redirect(
            f"/{dojo.reference_id}/{module.id}/{challenge.id}", code=308
        )
    return redirect(f"/{dojo.reference_id}/{module.id}", code=308)


@learning.route("/community")
def community_compatibility():
    return redirect("/dojos#community-dojos", code=308)


@learning.route("/leaderboard")
def leaderboard_compatibility():
    return redirect("/dojos", code=308)


@learning.route("/forgot-password")
def forgot_password_compatibility():
    return redirect("/reset_password", code=308)


@learning.route("/reset-password/<token>")
def reset_password_compatibility(token):
    return redirect(f"/reset_password/{token}", code=308)


@learning.route("/verify-email", defaults={"token": None})
@learning.route("/verify-email/", defaults={"token": None})
@learning.route("/verify-email/<token>")
def verify_email_compatibility(token):
    return redirect(f"/confirm/{token}" if token else "/confirm", code=308)


@learning.route("/terms")
def terms():
    return _legal_document("terms", "Terms of Service")


@learning.route("/privacy")
def privacy():
    return _legal_document("privacy", "Privacy Policy")


def _legal_document(document, title):
    url_key = "tos_url" if document == "terms" else "privacy_url"
    text_key = "tos_text" if document == "terms" else "privacy_text"
    external_url = get_config(url_key)
    if external_url:
        return redirect(external_url)
    content = get_config(text_key)
    if not content:
        abort(404)
    return render_template("legal.html", title=title, content=content)

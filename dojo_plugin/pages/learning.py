from flask import Blueprint, abort, redirect, render_template

from CTFd.utils import get_config
from CTFd.utils.decorators import authed_only

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

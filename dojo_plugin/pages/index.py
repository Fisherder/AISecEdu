from flask import url_for, redirect
from CTFd.views import static_html
from CTFd.utils.user import get_current_user

from .dojos import listing
from ..models import DojoAdmins

def static_html_override(route):
    if route != "index":
        return static_html(route)
    user = get_current_user()
    if user and (
        getattr(user, "type", None) == "admin"
        or DojoAdmins.query.filter_by(user_id=user.id).first() is not None
    ):
        return redirect("/teacher", code=302)
    return listing("index.html")

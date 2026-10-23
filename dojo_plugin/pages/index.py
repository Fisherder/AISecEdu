from flask import url_for, redirect, request
from CTFd.views import static_html
from CTFd.utils.user import get_current_user

from .dojos import listing
from ..product.capabilities import preferred_product_mode, teacher_mode_available

def static_html_override(route):
    if route != "index":
        return static_html(route)
    user = get_current_user()
    if user and teacher_mode_available(user):
        if preferred_product_mode(user, request.cookies.get("aisecedu-mode")) == "learning":
            return redirect("/student", code=302)
        return redirect("/teacher", code=302)
    return listing("index.html")

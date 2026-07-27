from flask import Blueprint, redirect, render_template
from CTFd.utils.decorators import authed_only


sensai = Blueprint("pwncollege_sensai", __name__)


@sensai.route("/guide")
@sensai.route("/guide/")
@authed_only
def view_guide():
    return render_template("guide.html")


@sensai.route("/sensai", defaults={"path": ""})
@sensai.route("/sensai/", defaults={"path": ""})
@sensai.route("/sensai/<path:path>")
@authed_only
def view_sensai(path=""):
    return redirect("/guide", code=308)

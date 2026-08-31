from flask import Blueprint, make_response, redirect, render_template, request
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ..learning.student_experience import student_ux_rollout


sensai = Blueprint("pwncollege_sensai", __name__)


@sensai.route("/guide")
@sensai.route("/guide/")
@authed_only
def view_guide():
    # Students and teachers intentionally share the same agent workbench.
    # The role-specific JavaScript adapter keeps student tools inside the
    # learning policy boundary while the template and interaction model stay
    # identical across both products.
    return render_template("teacher_agent.html", agent_role="student")


@sensai.route("/sensai")
@sensai.route("/sensai/")
@sensai.route("/sensai/<path:path>")
@authed_only
def view_sensai(path=""):
    query = request.query_string.decode("utf-8", errors="ignore")
    return redirect(f"/guide{'?' + query if query else ''}", code=308)


@sensai.route("/student")
@sensai.route("/student/")
@authed_only
def view_student_agent():
    experience = student_ux_rollout(get_current_user().id)
    if experience["variant"] == "legacy":
        response = redirect("/dojos?tab=mine&experience=legacy", code=302)
    else:
        response = make_response(render_template("learning.html", experience=experience))
    response.headers["X-AISecEdu-Student-UX-Variant"] = experience["variant"]
    return response

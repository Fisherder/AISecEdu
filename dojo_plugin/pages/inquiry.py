from flask import abort, render_template, request
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ..agent_runtime.scope import ScopeError, build_scope
from ..learning.inquiry_service import project_for_viewer


def render_inquiry(artifact_id):
    try:
        project_for_viewer(get_current_user(), artifact_id)
    except ScopeError:
        abort(404)
    return render_template("inquiry_learning.html", inquiry_artifact_id=artifact_id,
                           inquiry_embedded=request.args.get("embed") == "1")


def register_routes(blueprint):
    @blueprint.route("/teacher/inquiry/new")
    @authed_only
    def inquiry_create():
        try:
            build_scope(get_current_user(), role="teacher")
        except ScopeError:
            abort(403)
        return render_template("inquiry_create.html")

    @blueprint.route("/learning/inquiry/<artifact_id>")
    @authed_only
    def inquiry_learning(artifact_id):
        return render_inquiry(artifact_id)

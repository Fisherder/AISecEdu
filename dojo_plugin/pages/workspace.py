import datetime
import hmac
import logging
import os

from flask import request, Blueprint, render_template, abort, redirect, url_for
from CTFd.models import Users
from CTFd.utils.user import get_current_user
from CTFd.utils.decorators import admins_only, authed_only
from urllib.parse import urlencode

from ..models import Dojos, DojoUsers, LearningAttempts
from ..learning.exercise_modes import exercise_mode
from ..learning.simulation import (
    SimulationError,
    challenge_scenario,
    current_simulation_run,
)
from ..utils import get_all_containers, get_current_container, container_password
from ..utils.dojo import get_current_dojo_challenge


workspace = Blueprint("pwncollege_workspace", __name__)
logger = logging.getLogger(__name__)
port_names = {
    "challenge": 80,
    "terminal": 7681,
    "code": 8080,
    "desktop": 6080,
    "desktop-windows": 6082,
}


def _runtime_expiration(container):
    raw = (container.labels or {}).get("dojo.expires_at")
    try:
        value = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None, False
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value, value <= datetime.datetime.now(datetime.timezone.utc)


@workspace.route("/admin/desktops", methods=["GET"])
@admins_only
def admin_desktops():
    query_text = str(request.args.get("q") or "").strip()[:120]
    status = str(request.args.get("status") or "all").strip().lower()
    if status not in {"all", "running", "expired"}:
        status = "all"
    try:
        page = max(1, int(request.args.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    page_size = 30
    degraded = False
    error_reference = None
    try:
        containers = get_all_containers()
    except Exception:
        logger.exception("Unable to load the administrator runtime inventory")
        containers = []
        degraded = True
        error_reference = request.headers.get("X-Request-ID")

    runtime_records = []
    user_ids = set()
    for container in containers:
        labels = container.labels or {}
        try:
            user_id = int(labels.get("dojo.user_id"))
        except (TypeError, ValueError):
            continue
        expires_at, expired = _runtime_expiration(container)
        runtime_status = "expired" if expired else "running"
        if status != "all" and runtime_status != status:
            continue
        runtime_records.append(
            {
                "userId": user_id,
                "status": runtime_status,
                "statusLabel": "已过期，等待回收" if expired else "运行中",
                "courseId": str(labels.get("dojo.dojo_id") or ""),
                "moduleId": str(labels.get("dojo.module_id") or ""),
                "challengeId": str(labels.get("dojo.challenge_id") or ""),
                "expiresAt": expires_at,
            }
        )
        user_ids.add(user_id)

    user_names = {
        user.id: user.name
        for user in Users.query.filter(Users.id.in_(user_ids)).all()
    } if user_ids else {}
    rows = []
    needle = query_text.casefold()
    for record in runtime_records:
        name = user_names.get(record["userId"], f"用户 {record['userId']}")
        searchable = " ".join(
            [name, record["courseId"], record["moduleId"], record["challengeId"]]
        ).casefold()
        if needle and needle not in searchable:
            continue
        rows.append(
            {
                **record,
                "userName": name,
                "desktopHref": f"/desktop/{record['userId']}",
            }
        )
    rows.sort(key=lambda item: (item["status"] != "expired", item["userName"].casefold()))
    total = len(rows)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)
    rows = rows[(page - 1) * page_size:page * page_size]

    def page_url(target):
        args = {"page": target}
        if query_text:
            args["q"] = query_text
        if status != "all":
            args["status"] = status
        return f"/admin/desktops?{urlencode(args)}"

    return render_template(
        "admin_desktops.html",
        runtime_rows=rows,
        runtime_catalog={
            "query": query_text,
            "status": status,
            "total": total,
            "page": page,
            "totalPages": total_pages,
            "previousUrl": page_url(page - 1) if page > 1 else None,
            "nextUrl": page_url(page + 1) if page < total_pages else None,
            "degraded": degraded,
            "requestId": error_reference,
        },
    )


@workspace.route("/admin/design-system", methods=["GET"])
@admins_only
def admin_design_system():
    return render_template("admin_design_system.html")


def _recent_workspace_sessions(user):
    dojo_ids = [
        row.dojo_id
        for row in DojoUsers.query.filter_by(user_id=user.id).all()
    ]
    if not dojo_ids:
        return []
    attempts = (
        LearningAttempts.query.filter(
            LearningAttempts.user_id == user.id,
            LearningAttempts.dojo_id.in_(dojo_ids),
        )
        .order_by(LearningAttempts.started.desc())
        .limit(20)
        .all()
    )
    result = []
    for attempt in attempts:
        challenge = attempt.dojo_challenge
        if challenge is None or not challenge.visible():
            continue
        status = {
            "ACTIVE": "可继续",
            "SOLVED": "已完成，可再次练习",
            "SUBMITTED": "已提交，可查看",
        }.get(attempt.status, "可再次练习")
        result.append(
            {
                "title": challenge.name,
                "context": f"{challenge.dojo.name} · {challenge.module.name}",
                "status": status,
                "href": (
                    f"/{challenge.dojo.reference_id}/"
                    f"{challenge.module.id}/{challenge.id}"
                ),
                "course_href": f"/dojo/{challenge.dojo.reference_id}/learning",
                "updated": attempt.completed or attempt.submitted or attempt.started,
            }
        )
        if len(result) == 3:
            break
    return result


@workspace.route("/workspace", methods=["GET"])
@authed_only
def view_workspace():
    current_challenge = get_current_dojo_challenge()
    if not current_challenge:
        user = get_current_user()
        recent_sessions = _recent_workspace_sessions(user)
        recent_course = recent_sessions[0] if recent_sessions else None
        return render_template(
            "workspace_empty.html",
            title="还没有启动实验",
            description="从今天的下一项学习或课程章节中选择一道实践题，启动后可在这里继续。",
            primary_href=recent_course["course_href"] if recent_course else "/student",
            primary_label="返回最近课程" if recent_course else "查看今天的学习",
            secondary_href="/dojos?tab=discover&type=CTF",
            secondary_label="浏览实践课程",
            recent_sessions=recent_sessions,
        )

    user = get_current_user()
    container = get_current_container(user)
    practice = (
        container.labels.get("dojo.mode") == "privileged"
        if container
        else False
    )
    current_exercise_mode = exercise_mode(current_challenge)
    simulation_run = current_simulation_run(user.id, current_challenge)
    simulation_completion_policy = None
    if current_exercise_mode in {"SIMULATION", "HYBRID"}:
        try:
            simulation_completion_policy = challenge_scenario(
                current_challenge,
                version=(simulation_run.scenario_version if simulation_run else None),
                digest=(simulation_run.scenario_digest if simulation_run else None),
            )["completionPolicy"]
        except SimulationError:
            simulation_completion_policy = "OBJECTIVES"

    return render_template(
        "workspace.html",
        dojo=current_challenge.dojo,
        module=current_challenge.module,
        user=user,
        practice=practice,
        challenge=current_challenge,
        exercise_mode=current_exercise_mode,
        simulation_run_id=simulation_run.id if simulation_run else None,
        simulation_completion_policy=simulation_completion_policy,
        current_dojo_challenge={
            "dojo_id": current_challenge.dojo.reference_id,
            "module_id": current_challenge.module.id,
            "challenge_id": current_challenge.id,
        },
        current_challenge_id=current_challenge.challenge_id,
        current_dojo_custom_js=current_challenge.dojo.custom_js,
    )

@workspace.route("/workspace/<int:port>", strict_slashes=False)
@authed_only
def view_workspace_port(port):
    return redirect(
        url_for("pwncollege_workspace.view_workspace", port=port),
        code=308,
    )

@workspace.route("/workspace/<string:service>", strict_slashes=False)
@authed_only
def view_workspace_service(service):
    return redirect(
        url_for("pwncollege_workspace.view_workspace", service=service),
        code=308,
    )

def forward_workspace(service, signature, message, service_path="", include_host=True, **kwargs):
    if service.count("~") == 0:
        service_name = service
        try:
            user = get_current_user()
            port = int(port_names.get(service_name, service_name))
        except ValueError:
            abort(404)

    elif service.count("~") == 1:
        service_name, user_id = service.split("~", 1)
        try:
            user = Users.query.filter_by(id=int(user_id)).first_or_404()
            port = int(port_names.get(service_name, service_name))
        except ValueError:
            abort(404)

        container = get_current_container(user)
        if not container:
            abort(404)
        dojo = Dojos.from_id(container.labels["dojo.dojo_id"]).first()
        if not dojo.is_admin():
            abort(403)

    elif service.count("~") == 2:
        service_name, user_id, access_code = service.split("~", 2)
        try:
            user = Users.query.filter_by(id=int(user_id)).first_or_404()
            port = int(port_names.get(service_name, service_name))
        except ValueError:
            abort(404)

        container = get_current_container(user)
        if not container:
            abort(404)
        correct_access_code = container_password(container, service_name)
        if not hmac.compare_digest(access_code, correct_access_code):
            abort(403)

    else:
        abort(404)

    return forward_port(
        port,
        signature,
        message,
        user,
        service_path=service_path,
        include_host=include_host,
        **(kwargs or {})
    )

def forward_port(port, signature, message, user, service_path="", include_host=True, **kwargs):
    current_user = get_current_user()
    if user != current_user:
        print(f"User {current_user.id} is accessing User {user.id}'s workspace (port {port})", flush=True)

    workspace_host = os.environ.get("WORKSPACE_HOST")
    workspace_https_port = int(os.environ.get("WORKSPACE_HTTPS_PORT", "443"))

    if not workspace_host:
        abort(500)
        return

    url = f"/workspace/{message}/{signature}/{port}/{service_path}"

    scheme = request.scheme if request else "http"

    if include_host:
        workspace_authority = workspace_host
        if workspace_https_port != 443:
            workspace_authority = f"{workspace_host}:{workspace_https_port}"
        url = f"{scheme}://{workspace_authority}{url}"

    params = dict(kwargs or {})

    if params:
        args = urlencode(params)
        url = f"{url}?{args}"

    return url


def forward_short_port(port, signature, message, user, service_path="", **kwargs):
    if ":" in message:
        fallback = forward_port(
            port,
            signature,
            message,
            user,
            service_path=service_path,
            **kwargs,
        )
        return fallback, fallback

    workspace_host = os.environ.get("WORKSPACE_HOST")
    workspace_https_port = int(os.environ.get("WORKSPACE_HTTPS_PORT", "443"))
    if not workspace_host:
        abort(500)

    authority = workspace_host
    if workspace_https_port != 443:
        authority = f"{workspace_host}:{workspace_https_port}"
    scheme = request.scheme if request else "http"
    path = str(service_path or "").lstrip("/")
    bootstrap = f"{scheme}://{authority}/w/{message}/auth/{signature}/{port}/{path}"
    public = f"{scheme}://{authority}/w/{message}/{port}/{path}"
    params = dict(kwargs or {})
    if params:
        args = urlencode(params)
        bootstrap = f"{bootstrap}?{args}"
        public = f"{public}?{args}"
    return bootstrap, public

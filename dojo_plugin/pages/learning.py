import datetime
import os
from urllib.parse import urlencode

from flask import Blueprint, Response, abort, make_response, redirect, render_template, request, url_for
from sqlalchemy import Float, case, cast, func

from CTFd.models import db
from CTFd.utils import get_config
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ..models import (
    DojoAdmins,
    DojoChallenges,
    DojoUsers,
    LearningAttempts,
    LearningAuditEvents,
    ModelInvocations,
    SelfLearningWorkspaces,
    TeachingAgentActions,
    TeachingArtifacts,
    TeachingCandidateSets,
    TeachingJobOutbox,
    TeachingJobs,
    TeachingMaterials,
    TeachingSessions,
)
from ..agent_runtime.artifacts import artifact_course_teacher, artifact_for_viewer
from ..agent_runtime.metrics import teaching_api_metric_rows
from ..agent_runtime.scope import ScopeError
from ..learning.student_experience import (
    TELEMETRY_EVENTS,
    safe_return_path,
    safe_teacher_return_path,
    student_ux_rollout,
)
from ..utils.dojo import dojo_admins_only, dojo_route


learning = Blueprint("pwncollege_learning", __name__)


def _metric_label(value):
    return (
        str(value or "unknown")
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\r", "\\r")
        .replace("\n", "\\n")
    )


@learning.route("/metrics/teaching")
def teaching_metrics():
    now = datetime.datetime.utcnow()
    lines = [
        "# HELP aisecedu_teaching_jobs Number of durable teaching jobs.",
        "# TYPE aisecedu_teaching_jobs gauge",
    ]
    telemetry_actions = [f"student.telemetry.{event}" for event in TELEMETRY_EVENTS]
    telemetry_counts = dict(
        db.session.query(LearningAuditEvents.action, func.count(LearningAuditEvents.id))
        .filter(LearningAuditEvents.action.in_(telemetry_actions))
        .group_by(LearningAuditEvents.action)
        .all()
    )
    lines.extend(
        [
            "# HELP aisecedu_student_experience_events_total Accepted privacy-safe student experience events.",
            "# TYPE aisecedu_student_experience_events_total counter",
        ]
    )
    for event in sorted(TELEMETRY_EVENTS):
        lines.append(
            'aisecedu_student_experience_events_total{event="%s"} %d'
            % (
                _metric_label(event),
                telemetry_counts.get(f"student.telemetry.{event}", 0),
            )
        )
    mode = str(os.getenv("STUDENT_UX_V2_MODE") or "enabled").strip().lower()
    try:
        rollout_percent = max(0, min(100, int(os.getenv("STUDENT_UX_V2_PERCENT") or "100")))
    except ValueError:
        rollout_percent = 100
    lines.extend(
        [
            "# HELP aisecedu_student_ux_v2_rollout_percent Configured student experience rollout percentage.",
            "# TYPE aisecedu_student_ux_v2_rollout_percent gauge",
            f"aisecedu_student_ux_v2_rollout_percent {rollout_percent}",
            "# HELP aisecedu_student_ux_v2_enabled Whether the student experience rollout is enabled.",
            "# TYPE aisecedu_student_ux_v2_enabled gauge",
            "aisecedu_student_ux_v2_enabled %d"
            % (0 if mode in {"disabled", "off", "legacy", "0", "false"} else 1),
        ]
    )
    api_metrics_up, api_rows = teaching_api_metric_rows()
    lines.extend(
        [
            "# HELP aisecedu_teaching_api_metrics_up Whether Redis-backed teaching API metrics are readable.",
            "# TYPE aisecedu_teaching_api_metrics_up gauge",
            f"aisecedu_teaching_api_metrics_up {1 if api_metrics_up else 0}",
            "# HELP aisecedu_teaching_api_requests_total Teaching API responses by route template and status.",
            "# TYPE aisecedu_teaching_api_requests_total counter",
            "# HELP aisecedu_teaching_api_request_duration_seconds Teaching API request duration summary.",
            "# TYPE aisecedu_teaching_api_request_duration_seconds summary",
        ]
    )
    for method, route, status, count, duration in api_rows:
        labels = 'method="%s",route="%s",status="%s"' % (
            _metric_label(method),
            _metric_label(route),
            _metric_label(status),
        )
        lines.append(f"aisecedu_teaching_api_requests_total{{{labels}}} {count}")
        lines.append(
            f"aisecedu_teaching_api_request_duration_seconds_count{{{labels}}} {count}"
        )
        lines.append(
            f"aisecedu_teaching_api_request_duration_seconds_sum{{{labels}}} {duration:.6f}"
        )
    for status, kind, stage, count in (
        db.session.query(
            TeachingJobs.status,
            TeachingJobs.kind,
            TeachingJobs.stage,
            func.count(TeachingJobs.id),
        )
        .group_by(TeachingJobs.status, TeachingJobs.kind, TeachingJobs.stage)
        .all()
    ):
        lines.append(
            'aisecedu_teaching_jobs{status="%s",kind="%s",stage="%s"} %d'
            % (
                _metric_label(status),
                _metric_label(kind),
                _metric_label(stage),
                count,
            )
        )
    oldest = (
        TeachingJobs.query.filter_by(status="QUEUED")
        .order_by(TeachingJobs.created)
        .first()
    )
    lines.extend(
        [
            "# HELP aisecedu_teaching_oldest_queued_seconds Age of the oldest queued job.",
            "# TYPE aisecedu_teaching_oldest_queued_seconds gauge",
            "aisecedu_teaching_oldest_queued_seconds %.3f"
            % (max(0.0, (now - oldest.created).total_seconds()) if oldest else 0.0),
        ]
    )
    completed_filter = (
        TeachingJobs.completed.isnot(None),
        TeachingJobs.status.in_(["SUCCEEDED", "FAILED", "CANCELED"]),
    )
    duration_expression = func.greatest(
        func.extract("epoch", TeachingJobs.completed - TeachingJobs.created),
        0,
    )
    lines.extend(
        [
            "# HELP aisecedu_teaching_job_duration_seconds Completed job duration summary.",
            "# TYPE aisecedu_teaching_job_duration_seconds summary",
        ]
    )
    for kind, status, count, total in (
        db.session.query(
            TeachingJobs.kind,
            TeachingJobs.status,
            func.count(TeachingJobs.id),
            func.coalesce(func.sum(duration_expression), 0),
        )
        .filter(*completed_filter)
        .group_by(TeachingJobs.kind, TeachingJobs.status)
        .all()
    ):
        labels = 'kind="%s",status="%s"' % (
            _metric_label(kind),
            _metric_label(status),
        )
        lines.append(
            f"aisecedu_teaching_job_duration_seconds_count{{{labels}}} {int(count)}"
        )
        lines.append(
            f"aisecedu_teaching_job_duration_seconds_sum{{{labels}}} {float(total):.3f}"
        )
    duration_count, duration_sum = db.session.query(
        func.count(TeachingJobs.id),
        func.coalesce(
            func.sum(
                func.greatest(
                    func.extract(
                        "epoch", TeachingJobs.completed - TeachingJobs.created
                    ),
                    0,
                )
            ),
            0,
        ),
    ).filter(*completed_filter).one()
    lines.extend(
        [
            "aisecedu_teaching_job_duration_seconds_count %d" % duration_count,
            "aisecedu_teaching_job_duration_seconds_sum %.3f" % float(duration_sum),
        ]
    )
    lines.extend(
        [
            "# HELP aisecedu_teaching_outbox_unpublished Jobs waiting for Redis publication.",
            "# TYPE aisecedu_teaching_outbox_unpublished gauge",
            "aisecedu_teaching_outbox_unpublished %d"
            % TeachingJobOutbox.query.filter(TeachingJobOutbox.published.is_(None)).count(),
            "# HELP aisecedu_teaching_sessions_live Live classroom sessions.",
            "# TYPE aisecedu_teaching_sessions_live gauge",
            "aisecedu_teaching_sessions_live %d"
            % TeachingSessions.query.filter_by(status="LIVE").count(),
        ]
    )
    lines.extend(
        [
            "# HELP aisecedu_model_invocations Recorded model invocations by route and outcome.",
            "# TYPE aisecedu_model_invocations gauge",
        ]
    )
    for status, provider, route, actual_model, degraded, count in (
        db.session.query(
            ModelInvocations.status,
            ModelInvocations.provider,
            ModelInvocations.route,
            ModelInvocations.actual_model,
            ModelInvocations.degraded,
            func.count(ModelInvocations.id),
        )
        .group_by(
            ModelInvocations.status,
            ModelInvocations.provider,
            ModelInvocations.route,
            ModelInvocations.actual_model,
            ModelInvocations.degraded,
        )
        .all()
    ):
        lines.append(
            'aisecedu_model_invocations{status="%s",provider="%s",route="%s",actual_model="%s",degraded="%s"} %d'
            % (
                _metric_label(status),
                _metric_label(provider),
                _metric_label(route),
                _metric_label(actual_model),
                "true" if degraded else "false",
                count,
            )
        )
    latency_rows = (
        db.session.query(
            ModelInvocations.route,
            ModelInvocations.provider,
            ModelInvocations.status,
            func.count(ModelInvocations.id),
            func.coalesce(func.sum(ModelInvocations.latency_ms), 0),
        )
        .filter(ModelInvocations.latency_ms.isnot(None))
        .group_by(
            ModelInvocations.route,
            ModelInvocations.provider,
            ModelInvocations.status,
        )
        .all()
    )
    lines.extend(
        [
            "# HELP aisecedu_model_invocation_latency_milliseconds Model invocation latency summary.",
            "# TYPE aisecedu_model_invocation_latency_milliseconds summary",
        ]
    )
    for route, provider, status, count, total in latency_rows:
        labels = 'route="%s",provider="%s",status="%s"' % (
            _metric_label(route),
            _metric_label(provider),
            _metric_label(status),
        )
        lines.append(
            f"aisecedu_model_invocation_latency_milliseconds_count{{{labels}}} {int(count)}"
        )
        lines.append(
            f"aisecedu_model_invocation_latency_milliseconds_sum{{{labels}}} {float(total):.3f}"
        )

    def json_number(key):
        value = ModelInvocations.usage[key]
        return case(
            (
                func.jsonb_typeof(value) == "number",
                cast(value.astext, Float),
            ),
            else_=None,
        )

    input_tokens = func.coalesce(
        json_number("inputTokens"),
        json_number("input_tokens"),
        json_number("prompt_tokens"),
        0.0,
    )
    output_tokens = func.coalesce(
        json_number("outputTokens"),
        json_number("output_tokens"),
        json_number("completion_tokens"),
        0.0,
    )
    total_tokens = func.coalesce(
        json_number("totalTokens"),
        json_number("total_tokens"),
        json_number("totalTokenCount"),
        input_tokens + output_tokens,
        0.0,
    )
    total_cost = func.coalesce(
        json_number("totalCost"),
        json_number("total_cost"),
        json_number("cost"),
        0.0,
    )
    usage_rows = (
        db.session.query(
            ModelInvocations.route,
            ModelInvocations.provider,
            func.coalesce(func.sum(total_tokens), 0),
            func.coalesce(func.sum(total_cost), 0),
        )
        .group_by(ModelInvocations.route, ModelInvocations.provider)
        .all()
    )
    lines.extend(
        [
            "# HELP aisecedu_model_tokens_recorded Recorded model tokens by logical route.",
            "# TYPE aisecedu_model_tokens_recorded gauge",
            "# HELP aisecedu_model_cost_recorded Recorded provider cost by logical route.",
            "# TYPE aisecedu_model_cost_recorded gauge",
        ]
    )
    for route, provider, tokens, cost in usage_rows:
        labels = 'route="%s",provider="%s"' % (
            _metric_label(route),
            _metric_label(provider),
        )
        lines.append(
            f"aisecedu_model_tokens_recorded{{{labels}}} {float(tokens):.3f}"
        )
        lines.append(f"aisecedu_model_cost_recorded{{{labels}}} {float(cost):.6f}")

    recent_since = now - datetime.timedelta(minutes=10)
    lines.extend(
        [
            "# HELP aisecedu_model_invocations_recent_10m Model invocations created in the last ten minutes.",
            "# TYPE aisecedu_model_invocations_recent_10m gauge",
        ]
    )
    for status, route, degraded, count in (
        db.session.query(
            ModelInvocations.status,
            ModelInvocations.route,
            ModelInvocations.degraded,
            func.count(ModelInvocations.id),
        )
        .filter(ModelInvocations.created >= recent_since)
        .group_by(
            ModelInvocations.status,
            ModelInvocations.route,
            ModelInvocations.degraded,
        )
        .all()
    ):
        lines.append(
            'aisecedu_model_invocations_recent_10m{status="%s",route="%s",degraded="%s"} %d'
            % (
                _metric_label(status),
                _metric_label(route),
                "true" if degraded else "false",
                count,
            )
        )
    lines.extend(
        [
            "# HELP aisecedu_teaching_job_failures_recent_10m Teaching jobs failed in the last ten minutes.",
            "# TYPE aisecedu_teaching_job_failures_recent_10m gauge",
        ]
    )
    for kind, count in (
        db.session.query(TeachingJobs.kind, func.count(TeachingJobs.id))
        .filter(
            TeachingJobs.status == "FAILED",
            TeachingJobs.completed >= recent_since,
        )
        .group_by(TeachingJobs.kind)
        .all()
    ):
        lines.append(
            'aisecedu_teaching_job_failures_recent_10m{kind="%s"} %d'
            % (_metric_label(kind), count)
        )
    lines.extend(
        [
            "# HELP aisecedu_teaching_artifacts Teaching artifacts by lifecycle status.",
            "# TYPE aisecedu_teaching_artifacts gauge",
        ]
    )
    for status, count in (
        db.session.query(TeachingArtifacts.status, func.count(TeachingArtifacts.id))
        .group_by(TeachingArtifacts.status)
        .all()
    ):
        lines.append(
            'aisecedu_teaching_artifacts{status="%s"} %d'
            % (_metric_label(status), count)
        )
    lifecycle_metrics = (
        (
            "aisecedu_teaching_materials",
            "Uploaded teaching materials by processing status.",
            TeachingMaterials,
        ),
        (
            "aisecedu_teaching_candidate_sets",
            "Candidate sets by lifecycle status.",
            TeachingCandidateSets,
        ),
        (
            "aisecedu_teaching_actions",
            "Agent actions by approval or execution status.",
            TeachingAgentActions,
        ),
        (
            "aisecedu_self_learning_workspaces",
            "Student self-learning workspaces by status.",
            SelfLearningWorkspaces,
        ),
        (
            "aisecedu_teaching_sessions",
            "Classroom sessions by lifecycle status.",
            TeachingSessions,
        ),
    )
    for metric, help_text, model in lifecycle_metrics:
        lines.extend([f"# HELP {metric} {help_text}", f"# TYPE {metric} gauge"])
        for status, count in (
            db.session.query(model.status, func.count(model.id))
            .group_by(model.status)
            .all()
        ):
            lines.append(
                f'{metric}{{status="{_metric_label(status)}"}} {int(count)}'
            )
    lines.extend(
        [
            "# HELP aisecedu_teaching_action_events Agent actions by type, risk, and status.",
            "# TYPE aisecedu_teaching_action_events gauge",
        ]
    )
    for action_type, risk_level, status, count in (
        db.session.query(
            TeachingAgentActions.action_type,
            TeachingAgentActions.risk_level,
            TeachingAgentActions.status,
            func.count(TeachingAgentActions.id),
        )
        .group_by(
            TeachingAgentActions.action_type,
            TeachingAgentActions.risk_level,
            TeachingAgentActions.status,
        )
        .all()
    ):
        lines.append(
            'aisecedu_teaching_action_events{type="%s",risk="%s",status="%s"} %d'
            % (
                _metric_label(action_type),
                _metric_label(risk_level),
                _metric_label(status),
                count,
            )
        )
    return Response("\n".join(lines) + "\n", mimetype="text/plain; version=0.0.4")


@learning.route("/learning")
@learning.route("/learning/")
@authed_only
def overview():
    experience = student_ux_rollout(get_current_user().id)
    if experience["variant"] == "legacy":
        response = redirect("/dojos?tab=mine&experience=legacy", code=302)
    else:
        response = make_response(render_template("learning.html", experience=experience))
    response.headers["X-AISecEdu-Student-UX-Variant"] = experience["variant"]
    return response


@learning.route("/teacher")
@learning.route("/teacher/")
@authed_only
def teacher_agent():
    user = get_current_user()
    if getattr(user, "type", None) != "admin" and not DojoAdmins.query.filter_by(
        user_id=user.id
    ).first():
        abort(403)
    return render_template("teacher_agent.html", agent_role="teacher")


@learning.route("/teacher/courses")
@learning.route("/teacher/courses/")
@authed_only
def teacher_courses():
    user = get_current_user()
    if getattr(user, "type", None) != "admin" and not DojoAdmins.query.filter_by(
        user_id=user.id
    ).first():
        abort(403)
    return render_template("teacher_courses.html")


@learning.route("/teacher/courses/new")
@authed_only
def teacher_course_create():
    # Course creation is the safe bootstrap that turns a regular account into
    # a course teacher: the managed-course API creates the course and its
    # DojoAdmins membership atomically. Existing course-management routes still
    # require an established teacher membership.
    return render_template(
        "teacher_manual_create.html",
        create_kind="course",
        dojo=None,
        selected_module_id=None,
    )


@learning.route("/teacher/courses/<dojo>/chapters/new")
@authed_only
@dojo_route
@dojo_admins_only
def teacher_chapter_create(dojo):
    return render_template(
        "teacher_manual_create.html",
        create_kind="chapter",
        dojo=dojo,
        selected_module_id=None,
    )


@learning.route("/teacher/courses/<dojo>/practices/new")
@authed_only
@dojo_route
@dojo_admins_only
def teacher_practice_create(dojo):
    requested_module = str(request.args.get("module") or "").strip()
    selected_module = next(
        (module for module in dojo.modules if module.id == requested_module),
        dojo.modules[0] if dojo.modules else None,
    )
    return render_template(
        "teacher_manual_create.html",
        create_kind="practice",
        dojo=dojo,
        selected_module_id=selected_module.id if selected_module else None,
    )


@learning.route("/teacher/artifacts/<artifact_id>")
@learning.route("/learning/artifacts/<artifact_id>")
@authed_only
def teaching_artifact(artifact_id):
    user = get_current_user()
    try:
        artifact = artifact_for_viewer(artifact_id, user)
    except ScopeError:
        abort(404)
    is_course_teacher = artifact_course_teacher(artifact, user)
    is_personal = bool(
        artifact.owner_id == user.id and artifact.self_workspace_id is not None
    )
    can_manage = bool(
        artifact.owner_id == user.id and is_course_teacher and not is_personal
    )
    teacher_context = bool(
        can_manage or (request.path.startswith("/teacher/") and is_course_teacher)
    )
    requested_return = request.args.get("returnTo") or request.args.get("return")
    if teacher_context:
        artifact_type = str(artifact.artifact_type or "").strip().lower()
        artifact_tab = (
            "demos"
            if artifact_type
            in {"simulation", "attack-defense-scene", "classroom-scenario"}
            else "questions"
            if artifact_type in {"question-set", "assessment", "challenge", "quiz"}
            else "courseware"
        )
        fallback = "/teacher/courses"
        if artifact.dojo is not None:
            fallback = "/teacher/courses?" + urlencode(
                {
                    "dojo": artifact.dojo.reference_id,
                    "tab": artifact_tab,
                    "selectedId": artifact.id,
                }
            )
        artifact_return_to = safe_teacher_return_path(
            requested_return,
            fallback=fallback,
        )
        if artifact_return_to.startswith("/teacher/artifacts/"):
            artifact_return_to = fallback
    else:
        artifact_return_to = safe_return_path(
            requested_return,
            fallback="/learning/extend" if is_personal else "/student",
        )
    return render_template(
        "teaching_artifact.html",
        artifact=artifact,
        artifact_viewer_role="teacher" if can_manage else "student",
        artifact_is_personal=is_personal,
        artifact_return_to=artifact_return_to,
        artifact_return_role=(
            "teacher"
            if teacher_context
            else "personal"
            if is_personal
            else "student"
        ),
    )


@learning.route("/learning/extend")
@learning.route("/learning/extend/")
@authed_only
def self_learning_extend():
    return render_template("self_learning_extend.html")


@learning.route("/learning/assignments/<assignment_id>")
@authed_only
def learning_assignment(assignment_id):
    return render_template(
        "learning_assignment.html",
        assignment_id=str(assignment_id),
    )


@learning.route("/learning/dashboard")
@learning.route("/learning/dashboard/")
@authed_only
def learning_dashboard_entry():
    """Open a real course dashboard instead of inventing cross-course scores."""
    membership = (
        DojoUsers.query.filter_by(user_id=get_current_user().id)
        .order_by(DojoUsers.dojo_id.asc())
        .first()
    )
    if membership is None or membership.dojo is None:
        return redirect("/student", code=302)
    return redirect(
        url_for(
            "pwncollege_learning.dashboard",
            dojo=membership.dojo.reference_id,
        ),
        code=302,
    )


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
        or attempts.order_by(LearningAttempts.started.desc()).first()
    )
    if attempt is None:
        return render_template(
            "error.html",
            error_status=404,
            error_code="ATTEMPT_NOT_FOUND",
            error_title="还没有这道题的学习记录",
            error_description="开始一次练习或提交后，这里会显示本次结果与可复核证据。",
            recovery_label="查看今天的学习",
            recovery_href="/student",
        ), 404
    return redirect(
        url_for("pwncollege_learning.score", attempt_id=attempt.id),
        code=302,
    )


@learning.route("/learning/attempts/<attempt_id>/score")
@authed_only
def score(attempt_id):
    attempt = LearningAttempts.query.filter_by(id=attempt_id).first()
    if attempt is None:
        return render_template(
            "error.html",
            error_status=404,
            error_code="ATTEMPT_NOT_VISIBLE",
            error_title="无法查看这次学习记录",
            error_description="记录可能已过期、被移除，或不属于当前账号。",
            recovery_label="查看我的最近尝试",
            recovery_href="/student",
        ), 404
    challenge = DojoChallenges.query.filter_by(
        dojo_id=attempt.dojo_id,
        module_index=attempt.module_index,
        challenge_index=attempt.challenge_index,
    ).first()
    if challenge is None:
        return render_template(
            "error.html",
            error_status=410,
            error_code="ATTEMPT_RESOURCE_GONE",
            error_title="这道题已下线",
            error_description="学习记录仍然保留，但关联题目已停止提供。",
            recovery_label="查看我的最近尝试",
            recovery_href="/student",
        ), 410
    user = get_current_user()
    if attempt.user_id != user.id and not challenge.dojo.is_admin(user):
        return render_template(
            "error.html",
            error_status=403,
            error_code="ATTEMPT_NOT_VISIBLE",
            error_title="无法查看这次学习记录",
            error_description="这次记录不属于当前账号。系统不会显示他人的作答或学习证据。",
            recovery_label="查看我的最近尝试",
            recovery_href=f"/dojo/{challenge.dojo.reference_id}/learning#attempts",
        ), 403
    return render_template(
        "learning_score.html",
        attempt_id=attempt.id,
        challenge=challenge,
    )


@learning.route("/teacher/courses/<dojo>/questions/")
@learning.route("/teacher/courses/<dojo>/questions")
@authed_only
@dojo_route
@dojo_admins_only
def studio(dojo):
    query = request.args.to_dict(flat=True)
    query["dojo"] = dojo.reference_id
    query["tab"] = "questions"
    if query.get("draft") and not query.get("selectedId"):
        query["selectedId"] = query.pop("draft")
    return redirect(f"/teacher/courses?{urlencode(query)}", code=308)


@learning.route("/dojo/<dojo>/studio")
@learning.route("/dojo/<dojo>/studio/")
@authed_only
@dojo_route
@dojo_admins_only
def studio_compatibility(dojo):
    query = request.args.to_dict(flat=True)
    query.pop("embedded", None)
    if query.pop("author", None) == "1" and "draft" not in query:
        query.setdefault("tab", "author")
    query.setdefault("tab", "questions")
    query["dojo"] = dojo.reference_id
    if query.get("draft") and not query.get("selectedId"):
        query["selectedId"] = query.pop("draft")
    return redirect(f"/teacher/courses?{urlencode(query)}", code=308)


@learning.route("/dojo/<dojo>/module/<module>")
@learning.route("/dojo/<dojo>/module/<module>/")
@dojo_route
def module_compatibility(dojo, module):
    query = request.query_string.decode("utf-8", errors="ignore")
    return redirect(
        f"/{dojo.reference_id}/{module.id}{'?' + query if query else ''}",
        code=308,
    )


@learning.route("/dojo/<dojo>/module/<module>/workspace", defaults={"selection": ""})
@learning.route("/dojo/<dojo>/module/<module>/workspace/", defaults={"selection": ""})
@learning.route("/dojo/<dojo>/module/<module>/workspace/<path:selection>")
@dojo_route
def workspace_compatibility(dojo, module, selection):
    parts = selection.strip("/").split("/") if selection else []
    if len(parts) >= 2 and parts[0] == "challenge":
        challenge = next(
            (
                item
                for item in module.challenges
                if item.id == parts[1] and item.supported()
            ),
            None,
        )
        if challenge is None:
            abort(404)
        target = f"/{dojo.reference_id}/{module.id}/{challenge.id}"
    else:
        target = f"/{dojo.reference_id}/{module.id}"
    query = request.query_string.decode("utf-8", errors="ignore")
    return redirect(f"{target}{'?' + query if query else ''}", code=308)


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
    return _legal_document("terms", "使用条款")


@learning.route("/privacy")
def privacy():
    return _legal_document("privacy", "隐私说明")


@learning.route("/about")
def about():
    return render_template("about.html")


def _legal_document(document, title):
    url_key = "tos_url" if document == "terms" else "privacy_url"
    text_key = "tos_text" if document == "terms" else "privacy_text"
    external_url = get_config(url_key)
    if external_url:
        return redirect(external_url)
    content = get_config(text_key)
    if not content:
        document_name = "使用条款" if document == "terms" else "隐私说明"
        content = (
            f"## {document_name}尚未发布\n\n"
            "平台管理员尚未配置正式文本。当前系统仅供受控的网络安全教学使用；"
            "在正式文本发布前，请不要在此提交与课程无关的个人敏感信息。\n\n"
            "如需了解账号、课程数据或使用边界，请联系课程教师或平台管理员。"
        )
    return render_template("legal.html", title=title, content=content)

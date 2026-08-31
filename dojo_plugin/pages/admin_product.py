"""Focused administrator pages that preserve CTFd operations without DOM debt."""

import datetime

from flask import render_template, request, url_for

from CTFd.models import Challenges, Configs, Flags, Solves, Submissions, Tracking, Users, db
from CTFd.utils import config as ctf_config
from CTFd.utils import get_app_config, get_config
from CTFd.utils.decorators import admins_only
from CTFd.utils.helpers.models import build_model_filters
from CTFd.utils.modes import get_model

from ..models import DojoAdmins, DojoModules, Dojos
from ..models.global_agent import TeachingJobOutbox, TeachingJobs


CONFIG_SECTIONS = (
    ("settings", "可见性与开放策略", "谁可以注册、查看课程和学习记录。"),
    ("accounts", "账号与注册", "注册字段、验证方式与账户规则。"),
    ("security", "安全", "会话、内容安全与访问保护。"),
    ("email", "邮件", "发信服务与通知身份。"),
    ("ctftime", "运行时间", "开放、结束与冻结时间。"),
    ("appearance", "站点信息", "名称、简介、徽标与公开页文案。"),
    ("theme", "界面主题", "主题包与主题级自定义。"),
    ("pages", "公开页面", "页头、页脚与自定义页面。"),
    ("fields", "自定义字段", "注册资料字段及数据类型。"),
    ("legal", "法律文本", "服务条款与隐私说明。"),
    ("backup", "备份与导入", "导出、备份和恢复平台数据。"),
    ("usermode", "参与模式", "个人或团队参与方式。"),
    ("mlc", "外部集成", "MajorLeagueCyber 等可选集成。"),
)
CONFIG_SECTION_IDS = {section[0] for section in CONFIG_SECTIONS}
ADMIN_COLLECTION_PAGE_SIZE = 25


def _stored_config_value(value):
    """Match CTFd's cached config coercion without one query per key."""

    if not value:
        return None
    if value.isdigit():
        return int(value)
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    return value


def _page_url(endpoint, pagination, **parameters):
    """Preserve active filters without leaking an invalid page value."""

    values = dict(request.args)
    values.pop("page", None)
    values.update(parameters)
    return {
        "previous": (
            url_for(endpoint, page=pagination.prev_num, **values)
            if pagination.has_prev
            else None
        ),
        "next": (
            url_for(endpoint, page=pagination.next_num, **values)
            if pagination.has_next
            else None
        ),
    }


@admins_only
def admin_overview():
    """Render a fast, education-oriented platform health summary.

    The upstream statistics page performs an update check, several broad
    aggregation queries and then boots a charting bundle.  This overview keeps
    the first response fully server-rendered and limits every fact to an
    indexed count or a small bounded result set.
    """

    as_of = datetime.datetime.utcnow()
    since = as_of - datetime.timedelta(hours=24)
    active_job_states = ("QUEUED", "RUNNING", "CANCEL_REQUESTED")

    learner_count = Users.query.filter(
        Users.type == "user",
        Users.hidden.is_(False),
        Users.banned.is_(False),
    ).count()
    active_learner_count = (
        db.session.query(db.func.count(db.distinct(Submissions.account_id)))
        .filter(Submissions.date >= since)
        .scalar()
        or 0
    )
    teacher_count = (
        db.session.query(db.func.count(db.distinct(DojoAdmins.user_id))).scalar()
        or 0
    )
    course_count = Dojos.query.count()
    courses_with_modules = (
        db.session.query(db.func.count(db.distinct(DojoModules.dojo_id))).scalar()
        or 0
    )
    course_issue_count = max(0, course_count - courses_with_modules)
    challenge_count = Challenges.query.count()
    submission_count = Submissions.query.filter(Submissions.date >= since).count()
    correct_submission_count = Submissions.query.filter(
        Submissions.date >= since,
        Submissions.type == "correct",
    ).count()
    correct_rate = (
        round(correct_submission_count * 100 / submission_count)
        if submission_count
        else None
    )

    active_job_count = TeachingJobs.query.filter(
        TeachingJobs.status.in_(active_job_states),
    ).count()
    failed_job_count = TeachingJobs.query.filter(
        TeachingJobs.status == "FAILED",
        TeachingJobs.updated >= since,
    ).count()
    oldest_active_created = (
        TeachingJobs.query.with_entities(db.func.min(TeachingJobs.created))
        .filter(TeachingJobs.status.in_(active_job_states))
        .scalar()
    )
    oldest_active_seconds = (
        max(0, int((as_of - oldest_active_created).total_seconds()))
        if oldest_active_created
        else 0
    )
    outbox_backlog = TeachingJobOutbox.query.filter(
        TeachingJobOutbox.published.is_(None),
    ).count()

    alerts = []
    if failed_job_count:
        alerts.append(
            {
                "severity": "P1",
                "title": f"过去 24 小时有 {failed_job_count} 个 AI 任务失败",
                "description": "失败不是完成状态；请检查运行环境与任务错误，再决定是否安全重试。",
                "href": "/admin/desktops",
                "action": "检查运行环境",
            }
        )
    if oldest_active_seconds >= 300:
        alerts.append(
            {
                "severity": "P1",
                "title": "任务队列存在等待超过 5 分钟的任务",
                "description": f"当前最久已等待 {oldest_active_seconds // 60} 分钟，可能存在 worker、模型或运行环境拥塞。",
                "href": "/admin/desktops",
                "action": "定位拥塞",
            }
        )
    if outbox_backlog:
        alerts.append(
            {
                "severity": "P1",
                "title": f"有 {outbox_backlog} 个任务事件尚未投递",
                "description": "数据库事实尚未同步到执行队列，继续积压会延迟教师看到任务进度。",
                "href": "/admin/desktops",
                "action": "检查任务队列",
            }
        )
    if course_issue_count:
        alerts.append(
            {
                "severity": "P2",
                "title": f"有 {course_issue_count} 门课程尚未建立章节",
                "description": "这些课程目前无法形成完整的课件、题目与学情闭环。",
                "href": "/admin/dojos",
                "action": "治理课程",
            }
        )

    return render_template(
        "admin_overview_product.html",
        as_of=as_of,
        window_label="过去 24 小时",
        health_state="attention" if alerts else "healthy",
        health_label="需要处理" if alerts else "运行正常",
        alerts=alerts,
        metrics={
            "learners": learner_count,
            "activeLearners": active_learner_count,
            "teachers": teacher_count,
            "courses": course_count,
            "courseIssues": course_issue_count,
            "challenges": challenge_count,
            "submissions": submission_count,
            "correctRate": correct_rate,
            "activeJobs": active_job_count,
            "failedJobs": failed_job_count,
            "oldestActiveSeconds": oldest_active_seconds,
            "outboxBacklog": outbox_backlog,
        },
    )


@admins_only
def admin_users():
    """Render the common user-governance path without the legacy admin SPA.

    The native detail and creation screens remain the authoritative mutation
    surfaces.  This bounded listing performs only indexed/filterable queries
    and two page-scoped aggregates, so 50+ users do not increase DOM or query
    work beyond the configured page size.
    """

    query_text = str(request.args.get("q") or "").strip()[:240]
    field = str(request.args.get("field") or "name").strip().lower()
    role = str(request.args.get("role") or "all").strip().lower()
    state = str(request.args.get("state") or "all").strip().lower()
    page = max(1, abs(request.args.get("page", 1, type=int)))
    allowed_fields = {"id", "name", "email", "affiliation", "ip"}
    if field not in allowed_fields:
        field = "name"
    if role not in {"all", "learner", "teacher", "admin"}:
        role = "all"
    if state not in {"all", "active", "banned", "hidden", "unverified"}:
        state = "all"

    query = Users.query
    if query_text:
        if field == "ip":
            query = query.join(Tracking, Users.id == Tracking.user_id).filter(
                Tracking.ip.ilike(f"%{query_text}%")
            ).distinct()
        elif field == "id" and query_text.isdigit():
            query = query.filter(Users.id == int(query_text))
        elif field != "id":
            query = query.filter(getattr(Users, field).ilike(f"%{query_text}%"))

    teacher_membership = db.session.query(DojoAdmins.user_id).filter(
        DojoAdmins.user_id == Users.id
    ).exists()
    if role == "admin":
        query = query.filter(Users.type == "admin")
    elif role == "teacher":
        query = query.filter(Users.type == "user", teacher_membership)
    elif role == "learner":
        query = query.filter(Users.type == "user", ~teacher_membership)

    if state == "active":
        query = query.filter(Users.hidden.is_(False), Users.banned.is_(False))
    elif state == "banned":
        query = query.filter(Users.banned.is_(True))
    elif state == "hidden":
        query = query.filter(Users.hidden.is_(True))
    elif state == "unverified":
        query = query.filter(Users.verified.is_(False))

    users = query.order_by(Users.id.asc()).paginate(
        page=page, per_page=ADMIN_COLLECTION_PAGE_SIZE, error_out=False
    )
    user_ids = [user.id for user in users.items]
    activity_by_user = {}
    course_count_by_user = {}
    if user_ids:
        activity_by_user = {
            user_id: {"submissions": int(count or 0), "last": last_at}
            for user_id, count, last_at in (
                db.session.query(
                    Submissions.user_id,
                    db.func.count(Submissions.id),
                    db.func.max(Submissions.date),
                )
                .filter(Submissions.user_id.in_(user_ids))
                .group_by(Submissions.user_id)
                .all()
            )
        }
        course_count_by_user = {
            user_id: int(count or 0)
            for user_id, count in (
                db.session.query(
                    DojoAdmins.user_id,
                    db.func.count(db.distinct(DojoAdmins.dojo_id)),
                )
                .filter(DojoAdmins.user_id.in_(user_ids))
                .group_by(DojoAdmins.user_id)
                .all()
            )
        }

    rows = []
    for user in users.items:
        course_count = course_count_by_user.get(user.id, 0)
        if user.type == "admin":
            role_id, role_label = "admin", "平台管理员"
        elif course_count:
            role_id, role_label = "teacher", "课程教师"
        else:
            role_id, role_label = "learner", "学习者"
        if user.banned:
            state_id, state_label = "banned", "已停用"
        elif user.hidden:
            state_id, state_label = "hidden", "已隐藏"
        elif not user.verified:
            state_id, state_label = "unverified", "待验证"
        else:
            state_id, state_label = "active", "正常"
        activity = activity_by_user.get(user.id, {})
        rows.append(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "affiliation": user.affiliation,
                "role": role_id,
                "roleLabel": role_label,
                "platformRole": (
                    "platform_admin" if user.type == "admin" else "standard"
                ),
                "standardRole": "teacher" if course_count else "learner",
                "standardRoleLabel": "课程教师" if course_count else "学习者",
                "state": state_id,
                "stateLabel": state_label,
                "courseCount": course_count,
                "submissionCount": int(activity.get("submissions") or 0),
                "lastActivityAt": activity.get("last"),
                "createdAt": user.created,
                "detailHref": url_for("admin.users_detail", user_id=user.id),
            }
        )

    return render_template(
        "admin_users_product.html",
        users=users,
        rows=rows,
        query_text=query_text,
        field=field,
        role=role,
        state=state,
        pagination=_page_url("admin.users_listing", users),
    )


@admins_only
def admin_challenges():
    """Render a page-bounded challenge catalogue with aggregate facts."""

    query_text = str(request.args.get("q") or "").strip()[:240]
    field = str(request.args.get("field") or "name").strip().lower()
    state = str(request.args.get("state") or "all").strip().lower()
    page = max(1, abs(request.args.get("page", 1, type=int)))
    allowed_fields = {"id", "name", "category", "type"}
    if field not in allowed_fields:
        field = "name"
    if state not in {"all", "visible", "hidden"}:
        state = "all"

    query = Challenges.query
    if query_text:
        if field == "id" and query_text.isdigit():
            query = query.filter(Challenges.id == int(query_text))
        elif field != "id":
            query = query.filter(
                getattr(Challenges, field).ilike(f"%{query_text}%")
            )
    if state != "all":
        query = query.filter(Challenges.state == state)

    challenges = query.order_by(Challenges.id.asc()).paginate(
        page=page, per_page=ADMIN_COLLECTION_PAGE_SIZE, error_out=False
    )
    challenge_ids = [challenge.id for challenge in challenges.items]
    solves_by_challenge = {}
    flags_by_challenge = {}
    if challenge_ids:
        solves_by_challenge = dict(
            db.session.query(Solves.challenge_id, db.func.count(Solves.id))
            .filter(Solves.challenge_id.in_(challenge_ids))
            .group_by(Solves.challenge_id)
            .all()
        )
        flags_by_challenge = dict(
            db.session.query(Flags.challenge_id, db.func.count(Flags.id))
            .filter(Flags.challenge_id.in_(challenge_ids))
            .group_by(Flags.challenge_id)
            .all()
        )

    rows = [
        {
            "id": challenge.id,
            "name": challenge.name,
            "category": challenge.category or "未分类",
            "type": challenge.type or "standard",
            "state": challenge.state or "unknown",
            "stateLabel": "可见" if challenge.state == "visible" else "已隐藏" if challenge.state == "hidden" else "状态未知",
            "value": challenge.value,
            "solveCount": int(solves_by_challenge.get(challenge.id, 0) or 0),
            "flagCount": int(flags_by_challenge.get(challenge.id, 0) or 0),
            "detailHref": url_for(
                "admin.challenges_detail", challenge_id=challenge.id
            ),
            "previewHref": url_for(
                "admin.challenges_preview", challenge_id=challenge.id
            ),
        }
        for challenge in challenges.items
    ]

    return render_template(
        "admin_challenges_product.html",
        challenges=challenges,
        rows=rows,
        query_text=query_text,
        field=field,
        state=state,
        pagination=_page_url("admin.challenges_listing", challenges),
    )


@admins_only
def admin_config():
    # This is a read route. Clearing the global config cache here made every
    # context processor and form field query the database again. Fetch the
    # stored rows once and apply the same scalar coercion as ``get_config``.
    configs = {row.key: _stored_config_value(row.value) for row in Configs.query.all()}
    themes = ctf_config.get_themes()
    try:
        themes.remove(configs.get("ctf_theme") or get_config("ctf_theme"))
    except ValueError:
        pass
    selected = str(request.args.get("section") or "settings").strip().lower()
    if selected not in CONFIG_SECTION_IDS:
        selected = "settings"
    return render_template(
        "admin_config_product.html",
        config_sections=CONFIG_SECTIONS,
        selected_section=selected,
        selected_template=f"admin/configs/{'time' if selected == 'ctftime' else selected}.html",
        themes=themes,
        errors=[],
        force_html_sanitization=get_app_config("HTML_SANITIZATION"),
        **configs,
    )


@admins_only
def admin_submissions(submission_type=None):
    filters_by = {"type": submission_type} if submission_type else {}
    query_text = str(request.args.get("q") or "").strip()[:240]
    field = str(request.args.get("field") or "").strip() or None
    page = max(1, abs(request.args.get("page", 1, type=int)))
    filters = build_model_filters(
        model=Submissions,
        query=query_text or None,
        field=field,
        extra_columns={
            "challenge_name": Challenges.name,
            "account_id": Submissions.account_id,
        },
    )
    account_model = get_model()
    submissions = (
        Submissions.query.filter_by(**filters_by)
        .filter(*filters)
        .join(Challenges)
        .join(account_model)
        .order_by(Submissions.date.desc())
        .paginate(page=page, per_page=ADMIN_COLLECTION_PAGE_SIZE, error_out=False)
    )
    args = dict(request.args)
    args.pop("page", None)
    endpoint_args = {
        "submission_type": submission_type,
        **args,
    }
    return render_template(
        "admin_submissions_product.html",
        submissions=submissions,
        submission_type=submission_type,
        query_text=query_text,
        field=field,
        prev_page=(
            url_for(
                "admin.submissions_listing",
                page=submissions.prev_num,
                **endpoint_args,
            )
            if submissions.has_prev
            else None
        ),
        next_page=(
            url_for(
                "admin.submissions_listing",
                page=submissions.next_num,
                **endpoint_args,
            )
            if submissions.has_next
            else None
        ),
    )

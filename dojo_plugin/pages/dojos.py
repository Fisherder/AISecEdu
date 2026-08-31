import collections
import math
from urllib.parse import urlencode

from flask import Blueprint, render_template, redirect, request, url_for
from CTFd.models import Users, db
from CTFd.utils.user import get_current_user
from CTFd.utils.decorators import authed_only, admins_only

from ..models import DojoChallenges, Dojos, DojoAdmins, DojoMembers, DojoUsers
from ..utils.dojo import generate_ssh_keypair
from ..utils.stats import get_container_stats


dojos = Blueprint("pwncollege_dojos", __name__)


@dojos.route("/dojos")
def listing(template="dojos.html"):
    categorized_dojos = {
        "welcome": [],
        "topic": [],
        "public": [],
        "course": [],
        "member": [],
        "admin": [],
        "next": [],
    }

    user = get_current_user()
    user_dojo_admins = []
    user_dojo_members = []
    dojo_solves = (
        Dojos.viewable(user=user)
        .options(db.undefer(Dojos.modules_count),
                 db.undefer(Dojos.challenges_count),
                 db.undefer(Dojos.required_challenges_count))
    )
    if user:
        solves_subquery = (
            DojoChallenges.solves(user=user, ignore_visibility=True, ignore_admins=False)
            .group_by(DojoChallenges.dojo_id)
            .with_entities(DojoChallenges.dojo_id, db.func.count().label("solve_count"))
            .subquery()
        )
        dojo_solves = (
            dojo_solves
            .outerjoin(solves_subquery, Dojos.dojo_id == solves_subquery.c.dojo_id)
            .add_columns(db.func.coalesce(solves_subquery.c.solve_count, 0).label("solve_count"))
        )
        user_dojo_admins = DojoAdmins.query.where(DojoAdmins.user_id == user.id).all()
        user_dojo_members = DojoMembers.query.where(DojoMembers.user_id == user.id).all()
    else:
        dojo_solves = dojo_solves.add_columns(0)

    for dojo, solves in dojo_solves:
        if not (dojo.type == "hidden" or (dojo.type == "example" and dojo.official)):
            categorized_dojos.setdefault(dojo.type, []).append((dojo, solves))
            categorized_dojos["member"].extend((dojo_member.dojo, 0) for dojo_member in user_dojo_members
                                               if dojo_member.dojo == dojo and dojo.type not in ["welcome", "topic", "public"])
        categorized_dojos["admin"].extend((dojo_admin.dojo, 0) for dojo_admin in user_dojo_admins if dojo_admin.dojo == dojo)

    curriculum = categorized_dojos["welcome"] + categorized_dojos["topic"]

    getting_started = next((
        (dojo, solves) for dojo, solves in categorized_dojos["welcome"]
        if dojo.reference_id == "welcome"
    ), None)

    if not user:
        categorized_dojos["next"] = [getting_started] if getting_started else []
    else:
        categorized_dojos["next"] = []

        for i, (dojo, solves) in enumerate(curriculum):
            if solves < dojo.required_challenges_count and (solves > 0 or i > 0 and curriculum[i - 1][1] > 0):
                categorized_dojos["next"].append((dojo, solves))

        if not categorized_dojos["next"]:
            if getting_started and getting_started[1] == 0:
                categorized_dojos["next"].append(getting_started)
            elif all(solves >= dojo.required_challenges_count for dojo, solves in curriculum):
                categorized_dojos["next"] = categorized_dojos["public"][:]

    dojo_container_counts = collections.Counter(stats["dojo"] for stats in get_container_stats())

    membership_ids = {
        row.dojo_id
        for row in DojoUsers.query.filter_by(user_id=user.id).all()
    } if user else set()
    all_rows = []
    seen = set()
    for group in categorized_dojos.values():
        for dojo, solves in group:
            if dojo.dojo_id in seen:
                continue
            seen.add(dojo.dojo_id)
            if not user or getattr(user, "type", None) != "admin":
                if dojo.type in {"hidden", "example"}:
                    continue
            data = dojo.data if isinstance(dojo.data, dict) else {}
            raw_duration = data.get("estimated_minutes") or data.get("duration_minutes")
            try:
                duration = max(0, int(raw_duration)) if raw_duration is not None else None
            except (TypeError, ValueError):
                duration = None
            content_type = str(data.get("learning_type") or data.get("content_type") or "").upper()
            if content_type not in {"THEORY", "CTF", "SIMULATION"}:
                content_type = "CTF" if dojo.challenges_count else "THEORY"
            difficulty = str(data.get("difficulty") or data.get("level") or "未标注")[:40]
            topic = str(data.get("topic") or data.get("category") or "网络安全")[:80]
            all_rows.append(
                {
                    "dojo": dojo,
                    "solves": int(solves or 0),
                    "joined": dojo.dojo_id in membership_ids,
                    "topic": topic,
                    "difficulty": difficulty,
                    "contentType": content_type,
                    "durationMinutes": duration,
                    "provider": "OFFICIAL" if dojo.official else "TEACHER",
                    "publisher": "玄甲官方" if dojo.official else "课程教师",
                }
            )
    tab = str(request.args.get("tab") or ("mine" if user else "discover")).lower()
    if tab not in {"mine", "discover"}:
        tab = "mine" if user else "discover"
    query = str(request.args.get("q") or "").strip()[:120]
    topic_filter = str(request.args.get("topic") or "").strip()[:80]
    difficulty_filter = str(request.args.get("difficulty") or "").strip()[:40]
    type_filter = str(request.args.get("type") or "").strip().upper()[:24]
    duration_filter = str(request.args.get("duration") or "").strip().lower()[:24]
    provider_filter = str(request.args.get("provider") or "").strip().upper()[:24]
    rows = [row for row in all_rows if row["joined"] == (tab == "mine")]
    if query:
        needle = query.casefold()
        rows = [
            row for row in rows
            if needle in str(row["dojo"].name or row["dojo"].id).casefold()
            or needle in str(row["dojo"].description or "").casefold()
            or needle in row["topic"].casefold()
        ]
    if topic_filter:
        rows = [row for row in rows if row["topic"] == topic_filter]
    if difficulty_filter:
        rows = [row for row in rows if row["difficulty"] == difficulty_filter]
    if type_filter:
        rows = [row for row in rows if row["contentType"] == type_filter]
    if provider_filter:
        rows = [row for row in rows if row["provider"] == provider_filter]
    if duration_filter:
        rows = [
            row for row in rows
            if row["durationMinutes"] is not None and (
                duration_filter == "short" and row["durationMinutes"] <= 120
                or duration_filter == "medium" and 120 < row["durationMinutes"] <= 600
                or duration_filter == "long" and row["durationMinutes"] > 600
            )
        ]
    rows.sort(key=lambda row: (not row["dojo"].official, str(row["dojo"].name or row["dojo"].id).casefold()))
    try:
        page = max(1, int(request.args.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    per_page = 24
    total_pages = max(1, math.ceil(len(rows) / per_page))
    page = min(page, total_pages)
    page_rows = rows[(page - 1) * per_page:page * per_page]
    base_args = {
        key: value
        for key, value in {
            "tab": tab,
            "q": query,
            "topic": topic_filter,
            "difficulty": difficulty_filter,
            "type": type_filter,
            "duration": duration_filter,
            "provider": provider_filter,
        }.items()
        if value
    }
    def page_url(target):
        return f"/dojos?{urlencode({**base_args, 'page': target})}"
    catalog = {
        "tab": tab,
        "query": query,
        "topic": topic_filter,
        "difficulty": difficulty_filter,
        "contentType": type_filter,
        "duration": duration_filter,
        "provider": provider_filter,
        "rows": page_rows,
        "total": len(rows),
        "page": page,
        "totalPages": total_pages,
        "previousUrl": page_url(page - 1) if page > 1 else None,
        "nextUrl": page_url(page + 1) if page < total_pages else None,
        "topics": sorted({row["topic"] for row in all_rows if not row["joined"]}),
        "difficulties": sorted({row["difficulty"] for row in all_rows if not row["joined"]}),
        "mineCount": sum(row["joined"] for row in all_rows),
        "discoverCount": sum(not row["joined"] for row in all_rows),
    }
    return render_template(
        template,
        user=user,
        categorized_dojos=categorized_dojos,
        dojo_container_counts=dojo_container_counts,
        catalog=catalog,
    )


@dojos.route("/dojos/create")
@authed_only
def dojo_create():
    public_key, private_key = generate_ssh_keypair()
    return render_template(
        "dojo_create.html",
        public_key=public_key,
        private_key=private_key,
        example_dojos=Dojos.viewable().where(Dojos.data["type"].astext == "example").all(),
    )




@dojos.route("/admin/dojos")
@admins_only
def view_all_dojos():
    query_text = str(request.args.get("q") or "").strip()[:120]
    source = str(request.args.get("source") or "all").strip().lower()
    if source not in {"all", "repository", "database"}:
        source = "all"
    try:
        page = max(1, int(request.args.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    page_size = 25

    query = Dojos.query
    if query_text:
        pattern = f"%{query_text}%"
        query = query.filter(
            db.or_(Dojos.name.ilike(pattern), Dojos.id.ilike(pattern))
        )
    if source == "repository":
        query = query.filter(Dojos.repository.isnot(None))
    elif source == "database":
        query = query.filter(Dojos.repository.is_(None))

    total = query.order_by(None).count()
    total_pages = max(1, math.ceil(total / page_size))
    page = min(page, total_pages)
    courses = (
        query.options(
            db.undefer(Dojos.modules_count),
            db.undefer(Dojos.challenges_count),
        )
        .order_by(*Dojos.ordering())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    course_ids = [course.dojo_id for course in courses]
    membership_counts = dict(
        db.session.query(DojoUsers.dojo_id, db.func.count(DojoUsers.user_id))
        .filter(DojoUsers.dojo_id.in_(course_ids))
        .group_by(DojoUsers.dojo_id)
        .all()
    ) if course_ids else {}
    teacher_rows = (
        db.session.query(DojoAdmins.dojo_id, Users.name)
        .join(Users, Users.id == DojoAdmins.user_id)
        .filter(DojoAdmins.dojo_id.in_(course_ids))
        .order_by(Users.name)
        .all()
    ) if course_ids else []
    teachers = collections.defaultdict(list)
    for course_id, name in teacher_rows:
        teachers[course_id].append(name)

    workflow_labels = {
        "draft": "草稿",
        "queued": "等待处理",
        "running": "处理中",
        "validating": "验证中",
        "needs_review": "待审核",
        "partial_success": "部分完成",
        "published": "已发布",
        "failed": "处理失败",
        "canceled": "已取消",
    }
    rows = []
    for course in courses:
        data = course.data if isinstance(course.data, dict) else {}
        raw_workflow = str(data.get("status") or "").strip().lower()
        archived = bool(data.get("archived"))
        workflow = "archived" if archived else raw_workflow
        if archived:
            workflow_label = "已归档"
        elif workflow in workflow_labels:
            workflow_label = workflow_labels[workflow]
        else:
            workflow_label = "状态待补充"
        repository_backed = bool(course.repository)
        issues = []
        if not course.name:
            issues.append("缺少课程名称")
        if not archived and not raw_workflow:
            issues.append("未标注发布状态")
        rows.append(
            {
                "id": course.reference_id,
                "name": course.name or course.id,
                "source": "repository" if repository_backed else "database",
                "sourceLabel": "Git 仓库" if repository_backed else "平台创建",
                "workflow": workflow or "unknown",
                "workflowLabel": workflow_label,
                "teacherNames": teachers[course.dojo_id],
                "studentCount": max(
                    0,
                    int(membership_counts.get(course.dojo_id, 0))
                    - len(teachers[course.dojo_id]),
                ),
                "moduleCount": int(course.modules_count or 0),
                "itemCount": int(course.challenges_count or 0),
                "issues": issues,
                "href": url_for("pwncollege_dojo.view_dojo", dojo=course.reference_id),
                "manageHref": url_for("pwncollege_dojo.view_dojo_admin", dojo=course.reference_id),
            }
        )

    base_args = {
        key: value
        for key, value in {"q": query_text, "source": source}.items()
        if value and value != "all"
    }

    def page_url(target):
        return f"/admin/dojos?{urlencode({**base_args, 'page': target})}"

    return render_template(
        "admin_dojos.html",
        course_rows=rows,
        catalog={
            "query": query_text,
            "source": source,
            "total": total,
            "page": page,
            "totalPages": total_pages,
            "previousUrl": page_url(page - 1) if page > 1 else None,
            "nextUrl": page_url(page + 1) if page < total_pages else None,
        },
    )


def dojos_override():
    return redirect(url_for("pwncollege_dojos.listing"), code=301)

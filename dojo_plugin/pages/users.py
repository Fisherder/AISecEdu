import datetime

from flask import Blueprint, render_template, abort, url_for
from CTFd.utils.user import get_current_user
from CTFd.utils.decorators import authed_only
from CTFd.models import Users, Solves

from ..models import Dojos, DojoChallenges, DojoUsers
from ..utils.scores import get_dojo_scores, get_module_scores
from ..utils.awards import get_belts, get_viewable_emojis


users = Blueprint("pwncollege_users", __name__)


def build_user_scores(user, dojos):
    user_id = user.id

    dojo_scores = {
        "user_ranks": {user_id: {}},
        "user_solves": {user_id: {}},
        "dojo_ranks": {},
    }
    module_scores = {
        "user_ranks": {user_id: {}},
        "user_solves": {user_id: {}},
        "module_ranks": {},
    }

    for dojo in dojos:
        dojo_id = dojo.id
        scores = get_dojo_scores(dojo.dojo_id)
        ranks = scores.get("ranks", [])
        solves = scores.get("solves", {})

        dojo_scores["dojo_ranks"][dojo_id] = ranks

        try:
            rank = ranks.index(user_id) + 1
            dojo_scores["user_ranks"][user_id][dojo_id] = rank
            user_solve_count = solves.get(str(user_id)) or solves.get(user_id) or 0
            dojo_scores["user_solves"][user_id][dojo_id] = user_solve_count
        except ValueError:
            pass

        module_scores["module_ranks"][dojo_id] = {}
        module_scores["user_ranks"][user_id][dojo_id] = {}
        module_scores["user_solves"][user_id][dojo_id] = {}

        for module in dojo.modules:
            module_index = module.module_index
            m_scores = get_module_scores(dojo.dojo_id, module_index)
            m_ranks = m_scores.get("ranks", [])
            m_solves = m_scores.get("solves", {})

            module_scores["module_ranks"][dojo_id][module_index] = m_ranks

            try:
                rank = m_ranks.index(user_id) + 1
                module_scores["user_ranks"][user_id][dojo_id][module_index] = rank
                user_solve_count = m_solves.get(str(user_id)) or m_solves.get(user_id) or 0
                module_scores["user_solves"][user_id][dojo_id][module_index] = user_solve_count
            except ValueError:
                pass

    return dojo_scores, module_scores


def _learning_streaks(solve_dates):
    active_dates = sorted({value.date() for value in solve_dates if value})
    if not active_dates:
        return 0, 0, 0

    best_streak = 1
    running_streak = 1
    previous = active_dates[0]
    for active_date in active_dates[1:]:
        if active_date == previous + datetime.timedelta(days=1):
            running_streak += 1
        else:
            running_streak = 1
        best_streak = max(best_streak, running_streak)
        previous = active_date

    today = datetime.datetime.utcnow().date()
    cursor = today if today in active_dates else today - datetime.timedelta(days=1)
    if cursor not in active_dates:
        current_streak = 0
    else:
        current_streak = 0
        active_date_set = set(active_dates)
        while cursor in active_date_set:
            current_streak += 1
            cursor -= datetime.timedelta(days=1)

    return len(active_dates), current_streak, best_streak


def _profile_date(value):
    if not value:
        return "暂无学习记录"
    now = datetime.datetime.utcnow()
    if value.year == now.year:
        return f"{value.month} 月 {value.day} 日"
    return f"{value.year} 年 {value.month} 月 {value.day} 日"


def _profile_dojo_ids(user):
    learning_memberships = {
        dojo_id
        for dojo_id, in (
            DojoUsers.query.filter(
                DojoUsers.user_id == user.id,
                DojoUsers.type.in_(("member", "student")),
            )
            .with_entities(DojoUsers.dojo_id)
            .all()
        )
    }
    solved_dojos = {
        dojo_id
        for dojo_id, in (
            DojoChallenges.query.join(
                Solves,
                Solves.challenge_id == DojoChallenges.challenge_id,
            )
            .filter(Solves.user_id == user.id)
            .with_entities(DojoChallenges.dojo_id)
            .distinct()
            .all()
        )
    }
    return learning_memberships | solved_dojos


def build_profile_overview(user, dojos, user_solves, dojo_scores, module_scores):
    memberships = {
        membership.dojo_id: membership.type
        for membership in DojoUsers.query.filter_by(user_id=user.id).all()
    }
    course_profiles = []
    recent_activity = []
    learning_focus = []

    for dojo in dojos:
        dojo_solve_map = user_solves.get(dojo.id, {})
        solved_ids = {
            challenge_id
            for module_solves in dojo_solve_map.values()
            for challenge_id in module_solves
        }
        score_solved = dojo_scores["user_solves"][user.id].get(dojo.id, 0)
        solved_count = max(len(solved_ids), score_solved)
        membership_type = memberships.get(dojo.dojo_id)
        if membership_type not in {"member", "student"} and solved_count == 0:
            continue

        supported_challenges = [
            challenge for challenge in dojo.challenges if challenge.supported()
        ]
        required_challenges = [
            challenge for challenge in supported_challenges if challenge.required
        ]
        required_solved = sum(
            1 for challenge in required_challenges if challenge.challenge_id in solved_ids
        )
        required_total = len(required_challenges)
        progress = round(required_solved * 100 / required_total) if required_total else 0
        course_activity = []
        module_profiles = []

        for module in dojo.modules:
            module_solve_map = dojo_solve_map.get(module.id, {})
            module_challenges = [
                challenge for challenge in module.challenges if challenge.supported()
            ]
            module_required = [
                challenge for challenge in module_challenges if challenge.required
            ]
            module_solved = sum(
                1
                for challenge in module_required
                if challenge.challenge_id in module_solve_map
            )
            module_total = len(module_required)
            module_progress = (
                round(module_solved * 100 / module_total) if module_total else 0
            )
            module_rank = (
                module_scores["user_ranks"][user.id]
                .get(dojo.id, {})
                .get(module.module_index)
            )
            module_max_rank = len(
                module_scores["module_ranks"]
                .get(dojo.id, {})
                .get(module.module_index, [])
            )
            module_url = url_for(
                "pwncollege_dojo.view_dojo_path",
                dojo=dojo.reference_id,
                path=module.id,
            )

            for challenge in module_challenges:
                solved_at = module_solve_map.get(challenge.challenge_id)
                if not solved_at:
                    continue
                record = {
                    "course": dojo.name or dojo.id,
                    "module": module.name or module.id,
                    "challenge": challenge.name or challenge.id,
                    "date": solved_at,
                    "date_label": _profile_date(solved_at),
                    "url": url_for(
                        "pwncollege_dojo.view_dojo_path",
                        dojo=dojo.reference_id,
                        path=module.id,
                        subpath=challenge.id,
                    ),
                }
                course_activity.append(record)
                recent_activity.append(record)

            module_profiles.append(
                {
                    "name": module.name or module.id,
                    "solved": module_solved,
                    "total": module_total,
                    "progress": module_progress,
                    "rank": module_rank,
                    "max_rank": module_max_rank,
                    "url": module_url,
                }
            )
            if module_solved:
                learning_focus.append(
                    {
                        "course": dojo.name or dojo.id,
                        "module": module.name or module.id,
                        "solved": module_solved,
                        "total": module_total,
                        "progress": module_progress,
                        "url": module_url,
                    }
                )

        course_activity.sort(key=lambda item: item["date"], reverse=True)
        next_module = next(
            (module for module in module_profiles if module["progress"] < 100),
            module_profiles[0] if module_profiles else None,
        )
        rank = dojo_scores["user_ranks"][user.id].get(dojo.id)
        max_rank = len(dojo_scores["dojo_ranks"].get(dojo.id, []))
        course_profiles.append(
            {
                "name": dojo.name or dojo.id,
                "description": dojo.description or "结构化网络安全实践课程",
                "url": url_for("pwncollege_dojo.listing", dojo=dojo.reference_id),
                "continue_url": next_module["url"] if next_module else url_for(
                    "pwncollege_dojo.listing", dojo=dojo.reference_id
                ),
                "module_count": len(module_profiles),
                "challenge_count": len(supported_challenges),
                "solved": required_solved,
                "total": required_total,
                "progress": progress,
                "rank": rank,
                "max_rank": max_rank,
                "completed": bool(required_total and required_solved >= required_total),
                "last_activity": course_activity[0]["date"] if course_activity else None,
                "last_activity_label": _profile_date(
                    course_activity[0]["date"] if course_activity else None
                ),
                "modules": module_profiles,
            }
        )

    course_profiles.sort(
        key=lambda item: (item["last_activity"] is not None, item["last_activity"]),
        reverse=True,
    )
    recent_activity.sort(key=lambda item: item["date"], reverse=True)
    learning_focus.sort(
        key=lambda item: (item["solved"], item["progress"]), reverse=True
    )

    one_year_ago = datetime.datetime.utcnow() - datetime.timedelta(days=365)
    solve_dates = [
        row.date
        for row in Solves.query.filter(
            Solves.user_id == user.id,
            Solves.date >= one_year_ago,
        )
        .with_entities(Solves.date)
        .all()
    ]
    active_days, current_streak, best_streak = _learning_streaks(solve_dates)
    required_solved = sum(course["solved"] for course in course_profiles)
    required_total = sum(course["total"] for course in course_profiles)
    completed_courses = sum(1 for course in course_profiles if course["completed"])
    is_teacher = user.type == "admin" or any(
        membership_type == "admin" for membership_type in memberships.values()
    )

    completion_items = [
        {"label": "用户名", "complete": bool(user.name)},
        {"label": "所属单位", "complete": bool(user.affiliation)},
        {"label": "国家或地区", "complete": bool(user.country)},
        {"label": "个人网站", "complete": bool(user.website)},
    ]
    profile_completion = round(
        sum(item["complete"] for item in completion_items)
        * 100
        / len(completion_items)
    )

    active_course = next(
        (course for course in course_profiles if not course["completed"]),
        course_profiles[0] if course_profiles else None,
    )
    return {
        "role": "教师" if is_teacher else "学习者",
        "role_description": (
            "课程建设者与网络安全实践教师"
            if is_teacher
            else "正在构建网络安全实践能力"
        ),
        "teaching_course_count": sum(
            1 for membership_type in memberships.values() if membership_type == "admin"
        ),
        "course_count": len(course_profiles),
        "completed_course_count": completed_courses,
        "solved_count": required_solved,
        "challenge_count": required_total,
        "completion_rate": (
            round(required_solved * 100 / required_total) if required_total else 0
        ),
        "active_days": active_days,
        "current_streak": current_streak,
        "best_streak": best_streak,
        "last_activity": _profile_date(max(solve_dates) if solve_dates else None),
        "profile_completion": profile_completion,
        "completion_items": completion_items,
        "active_course": active_course,
        "courses": course_profiles,
        "recent_activity": recent_activity[:6],
        "learning_focus": learning_focus[:4],
    }


def view_hacker(user, bypass_hidden=False):
    if user.hidden and not bypass_hidden:
        abort(404)

    profile_dojo_ids = _profile_dojo_ids(user)
    dojos = (
        Dojos.viewable(user=get_current_user())
        .filter(
            Dojos.dojo_id.in_(profile_dojo_ids),
            Dojos.data["type"].astext != "hidden",
            Dojos.data["type"].astext != "course",
        )
        .all()
        if profile_dojo_ids
        else []
    )
    user_solves = {}
    for dojo in dojos:
        dojo_id = dojo.id
        user_solves[dojo_id] = {}

        for module in dojo.modules:
            module_id = module.id
            solves = (
                module.solves(
                    user=user,
                    ignore_visibility=True,
                    ignore_admins=False,
                ).all()
                if user
                else []
            )

            if solves:
                user_solves[dojo_id][module_id] = {
                    solve.challenge_id: solve.date for solve in solves
                }

    dojo_scores, module_scores = build_user_scores(user, dojos)
    profile_overview = build_profile_overview(
        user,
        dojos,
        user_solves,
        dojo_scores,
        module_scores,
    )

    return render_template(
        "hacker.html",
        dojos=dojos, user=user,
        dojo_scores=dojo_scores, module_scores=module_scores,
        belts=get_belts(), badges=get_viewable_emojis(get_current_user()),
        user_solves=user_solves,
        profile_overview=profile_overview,
    )


@users.route("/hacker/<int:user_id>")
def view_other(user_id):
    user = Users.query.filter_by(id=user_id).first()
    if user is None or user.hidden:
        abort(404)
    return view_hacker(user)


@users.route("/hacker/<user_name>")
def view_other_name(user_name):
    user = Users.query.filter_by(name=user_name).first()
    if user is None or user.hidden:
        abort(404)
    return view_hacker(user)


@users.route("/hacker/")
@authed_only
def view_self():
    return view_hacker(get_current_user(), bypass_hidden=True)

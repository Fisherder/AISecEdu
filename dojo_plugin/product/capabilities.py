from urllib.parse import quote

from .contracts import success_envelope
from ..models import DojoAdmins, DojoUsers, UserAccountPreferences
from ..models.global_agent import TeachingAgentActions, TeachingJobs


MODE_DEFINITIONS = {
    "public": {
        "label": "公共",
        "homeHref": "/",
        "capabilities": ("course.discover", "course.preview"),
        "navigation": (
            ("首页", "/", "home"),
            ("课程", "/dojos?tab=discover", "book-open"),
            ("学习方式", "/#learning-method", "route"),
            ("关于", "/about", "info-circle"),
        ),
    },
    "learning": {
        "label": "学习",
        "homeHref": "/student",
        "capabilities": (
            "course.discover",
            "course.join",
            "learning.attempt",
            "learning.evidence.view",
            "learning.guide.use",
            "artifact.personal.create",
            "workspace.personal.use",
        ),
        "navigation": (
            ("今天", "/student", "calendar-day"),
            ("课程", "/dojos?tab=mine", "book-open"),
            ("AI 学习", "/guide", "comment-dots"),
        ),
    },
    "teaching": {
        "label": "教学",
        "homeHref": "/teacher",
        "capabilities": (
            "course.create",
            "course.manage",
            "course.content.manage",
            "course.student.preview",
            "teaching.batch.create",
            "teaching.batch.review",
            "teaching.analytics.view",
            "workspace.preview.use",
        ),
        "navigation": (
            ("工作台", "/teacher", "th-large"),
            ("课程中心", "/teacher/courses", "layer-group"),
            ("AI 共创", "/teacher?view=conversation", "magic"),
        ),
    },
    "admin": {
        "label": "平台管理",
        "homeHref": "/admin",
        "capabilities": (
            "platform.overview.view",
            "platform.user.manage",
            "platform.course.manage",
            "platform.runtime.manage",
            "platform.content.manage",
            "platform.settings.manage",
            "platform.audit.view",
        ),
        "navigation": (
            ("平台概览", "/admin", "tachometer-alt"),
            ("用户与权限", "/admin/users", "user-shield"),
            ("课程治理", "/admin/dojos", "layer-group"),
            ("运行环境", "/admin/desktops", "server"),
            ("内容与评测", "/admin/challenges", "tasks"),
            ("设置", "/admin/config", "cog"),
            ("审计", "/admin/submissions", "history"),
        ),
    },
}


def _mode_ids(user):
    if user is None:
        return ["public"]
    mode_ids = ["learning"]
    is_admin = getattr(user, "type", None) == "admin"
    is_teacher = is_admin or DojoAdmins.query.filter_by(user_id=user.id).first() is not None
    if is_teacher:
        mode_ids.append("teaching")
    if is_admin:
        mode_ids.append("admin")
    return mode_ids


def current_product_mode(path, user=None, requested_mode=None, allowed_mode_ids=None):
    allowed = set(allowed_mode_ids or _mode_ids(user))
    requested = str(requested_mode or "").strip().lower()
    if requested in allowed:
        return requested
    normalized_path = str(path or "/")
    if normalized_path.startswith("/admin") and "admin" in allowed:
        return "admin"
    if normalized_path.startswith("/teacher") and "teaching" in allowed:
        return "teaching"
    if user is not None:
        return "learning"
    return "public"


def available_modes(user, mode_ids=None):
    mode_ids = mode_ids or _mode_ids(user)
    return [
        {
            "id": mode_id,
            "label": MODE_DEFINITIONS[mode_id]["label"],
            "homeHref": MODE_DEFINITIONS[mode_id]["homeHref"],
        }
        for mode_id in mode_ids
    ]


def mode_capabilities(user, mode, mode_ids=None):
    if mode == "public":
        return list(MODE_DEFINITIONS[mode]["capabilities"])
    allowed = set(mode_ids or _mode_ids(user))
    return list(MODE_DEFINITIONS[mode]["capabilities"]) if mode in allowed else []


def mode_navigation(user, mode, mode_ids=None, path="/"):
    capabilities = set(mode_capabilities(user, mode, mode_ids))
    if not capabilities and mode != "public":
        return []
    full_path = str(path or "/")
    route_path = full_path.split("?", 1)[0]
    def match_score(href):
        target_path, separator, target_query = href.partition("?")
        if target_path == "/":
            return 1 if route_path == "/" else 0
        if route_path != target_path and not route_path.startswith(f"{target_path}/"):
            return 0
        if not separator:
            if target_path == "/teacher" and "view=conversation" in full_path:
                return 0
            return len(target_path) * 10
        return len(target_path) * 10 + 1 if target_query in full_path else 0

    navigation = MODE_DEFINITIONS[mode]["navigation"]
    scores = [match_score(href) for _, href, _ in navigation]
    best_score = max(scores, default=0)
    return [
        {
            "label": label,
            "href": href,
            "icon": icon,
            "current": best_score > 0 and score == best_score,
        }
        for (label, href, icon), score in zip(navigation, scores)
    ]


def _preferences(user):
    row = UserAccountPreferences.query.filter_by(user_id=user.id).first() if user else None
    return {
        "theme": getattr(row, "appearance", "system") if row else "system",
        "appearance": getattr(row, "appearance", "system") if row else "system",
        "palette": getattr(row, "palette", "academy") if row else "academy",
        "reducedMotion": bool(getattr(row, "reduced_motion", False)) if row else False,
        "locale": "zh-CN",
    }


def _running_summary(user, mode):
    if user is None:
        return {"jobs": 0, "tasksRequiringAction": 0, "runtime": "none"}
    jobs = TeachingJobs.query.filter(
        TeachingJobs.owner_id == user.id,
        TeachingJobs.status.in_(("QUEUED", "RUNNING", "RETRYING")),
    ).count()
    tasks = TeachingAgentActions.query.filter(
        TeachingAgentActions.actor_id == user.id,
        TeachingAgentActions.status.in_(("PLANNED", "PENDING", "WAITING_APPROVAL")),
    ).count()
    if mode != "teaching":
        tasks = 0
    return {"jobs": jobs, "tasksRequiringAction": tasks, "runtime": "none"}


def build_ui_bootstrap(
    user,
    path,
    requested_mode=None,
    request_id=None,
    *,
    include_scopes=True,
    include_running=True,
):
    mode_ids = _mode_ids(user)
    mode = current_product_mode(path, user, requested_mode, mode_ids)
    scope_ids = []
    if user is not None and include_scopes:
        scope_ids = [
            quote(row.dojo.reference_id, safe="")
            for row in DojoUsers.query.filter_by(user_id=user.id).all()
            if row.dojo is not None
        ]
    viewer = None
    if user is not None:
        viewer = {
            "id": f"user_{user.id}",
            "displayName": user.name,
            "role": "admin" if getattr(user, "type", None) == "admin" else "user",
        }
    data = {
        "viewer": viewer,
        "mode": mode,
        "availableModes": available_modes(user, mode_ids),
        "capabilities": mode_capabilities(user, mode, mode_ids),
        "scopes": {"courseIds": sorted(set(scope_ids))},
        "navigation": mode_navigation(user, mode, mode_ids, path),
        "running": _running_summary(user, mode) if include_running else None,
        "preferences": _preferences(user),
        "request": {"id": request_id},
    }
    return success_envelope(data, request_id=request_id)

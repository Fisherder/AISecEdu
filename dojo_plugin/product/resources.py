from urllib.parse import quote

from .contracts import ResourceSummary, normalize_state
from .errors import ProductError
from ..learning.exercise_modes import is_retired_exercise
from ..models import (
    DojoAdmins,
    DojoChallenges,
    DojoModules,
    DojoUsers,
    Dojos,
    TeachingArtifacts,
    TeachingAssignments,
)


def _is_admin(user):
    return user is not None and getattr(user, "type", None) == "admin"


def _course_access(dojo, user):
    if dojo is None:
        return False
    if dojo.official or (dojo.type == "public" and not dojo.password):
        return True
    if user is None:
        return False
    if _is_admin(user):
        return True
    return DojoUsers.query.filter_by(user_id=user.id, dojo_id=dojo.dojo_id).first() is not None


def _course_manage(dojo, user):
    if dojo is None or user is None:
        return False
    return _is_admin(user) or DojoAdmins.query.filter_by(
        user_id=user.id, dojo_id=dojo.dojo_id
    ).first() is not None


def _availability(dojo, user):
    if dojo is None:
        return {"state": "deleted", "reasonCode": "RESOURCE_NOT_FOUND", "replacement": None}
    if not _course_access(dojo, user):
        return {"state": "forbidden", "reasonCode": "COURSE_ACCESS_REQUIRED", "replacement": None}
    data = dojo.data if isinstance(dojo.data, dict) else {}
    if data.get("archived"):
        return {"state": "archived", "reasonCode": "COURSE_ARCHIVED", "replacement": None}
    return {"state": "available", "reasonCode": None, "replacement": None}


def _workflow(value, version=1):
    normalized = normalize_state("workflow", value or "published")
    return {"state": normalized["state"], "version": max(1, int(version or 1)), "known": normalized["known"]}


def _course_summary(dojo, user):
    availability = _availability(dojo, user)
    reference_id = dojo.reference_id if dojo is not None else "missing"
    href = f"/{quote(reference_id)}" if availability["state"] == "available" else None
    capabilities = ["view"] if href else []
    if dojo is not None and user is not None and availability["state"] == "available":
        capabilities.append("continue" if _course_access(dojo, user) else "join")
    if dojo is not None and _course_manage(dojo, user):
        capabilities.extend(("edit", "manage_content", "view_analytics"))
    data = dojo.data if dojo is not None and isinstance(dojo.data, dict) else {}
    return ResourceSummary(
        id=f"course_{reference_id}",
        type="course",
        title=(dojo.name or dojo.id) if dojo is not None else "课程不可用",
        context={},
        availability=availability,
        workflow=_workflow(data.get("status") if data else None),
        capabilities=tuple(capabilities),
        hrefs={"canonical": href, "primaryAction": href, "returnTo": "/dojos"},
        timestamps={"updatedAt": None, "publishedAt": None},
        metadata={"referenceId": reference_id},
    )


def _module_summary(module, user):
    dojo = module.dojo if module is not None else None
    availability = _availability(dojo, user)
    href = None
    if module is not None and availability["state"] == "available":
        href = f"/{quote(dojo.reference_id)}/{quote(module.id)}"
    return ResourceSummary(
        id=f"module_{dojo.reference_id if dojo else 'missing'}_{module.id if module else 'missing'}",
        type="module",
        title=(module.name or module.id) if module is not None else "章节不可用",
        context={"course": {"id": f"course_{dojo.reference_id}", "title": dojo.name or dojo.id}} if dojo else {},
        availability=availability,
        workflow=_workflow((module.data or {}).get("status") if module is not None and isinstance(module.data, dict) else None),
        capabilities=tuple(["view"] if href else []),
        hrefs={"canonical": href, "primaryAction": href, "returnTo": f"/{quote(dojo.reference_id)}" if dojo else "/dojos"},
        timestamps={"updatedAt": None, "publishedAt": None},
    )


def _challenge_summary(challenge, user):
    dojo = challenge.dojo if challenge is not None else None
    module = challenge.module if challenge is not None else None
    availability = _availability(dojo, user)
    reason = None
    if challenge is not None and is_retired_exercise(challenge):
        availability = {"state": "deleted", "reasonCode": "EXERCISE_MODE_RETIRED", "replacement": None}
        reason = "该旧版演示练习已停止提供，请从课程选择当前可用的实践题。"
    href = None
    if challenge is not None and module is not None and availability["state"] == "available":
        href = f"/{quote(dojo.reference_id)}/{quote(module.id)}/{quote(challenge.id)}"
    capabilities = ["view", "attempt", "ask_tutor"] if href else []
    if challenge is not None and _course_manage(dojo, user):
        capabilities.extend(("edit", "preview"))
    return ResourceSummary(
        id=f"challenge_{dojo.reference_id if dojo else 'missing'}_{module.id if module else 'missing'}_{challenge.id if challenge else 'missing'}",
        type="challenge",
        title=(challenge.name or challenge.id) if challenge is not None else "题目不可用",
        context={
            "course": {"id": f"course_{dojo.reference_id}", "title": dojo.name or dojo.id},
            "module": {"id": f"module_{module.id}", "title": module.name or module.id},
        } if dojo and module else {},
        availability=availability,
        workflow=_workflow((challenge.data or {}).get("status") if challenge is not None and isinstance(challenge.data, dict) else None),
        capabilities=tuple(capabilities),
        hrefs={"canonical": href, "primaryAction": href, "returnTo": f"/{quote(dojo.reference_id)}/{quote(module.id)}" if dojo and module else "/dojos"},
        timestamps={"updatedAt": None, "publishedAt": None},
        metadata={"exerciseMode": getattr(challenge, "exercise_mode", None), "unavailableMessage": reason},
    )


def _artifact_summary(artifact, user):
    if artifact is None:
        availability = {"state": "deleted", "reasonCode": "RESOURCE_NOT_FOUND", "replacement": None}
        return ResourceSummary(id="artifact_missing", type="artifact", title="成果不可用", availability=availability)
    manage = _course_manage(artifact.dojo, user) if artifact.dojo is not None else False
    own = user is not None and artifact.owner_id == user.id
    published = str(artifact.status or "").upper() == "PUBLISHED"
    allowed = own or manage or published
    availability = {
        "state": "available" if allowed else "forbidden",
        "reasonCode": None if allowed else "ARTIFACT_ACCESS_REQUIRED",
        "replacement": None,
    }
    href = f"/learning/artifacts/{quote(artifact.id)}" if allowed else None
    capabilities = ["view"] if allowed else []
    if own or manage:
        capabilities.extend(("edit", "request_review"))
    if manage:
        capabilities.extend(("validate", "publish"))
    return ResourceSummary(
        id=f"artifact_{artifact.id}",
        type="artifact",
        title=artifact.title or "未命名成果",
        context={"course": {"id": f"course_{artifact.dojo.reference_id}", "title": artifact.dojo.name or artifact.dojo.id}} if artifact.dojo else {},
        availability=availability,
        workflow=_workflow(artifact.status, getattr(artifact, "revision", 1)),
        capabilities=tuple(capabilities),
        hrefs={"canonical": href, "primaryAction": href, "returnTo": "/learning/extend" if own else "/teacher/courses"},
        timestamps={"updatedAt": getattr(artifact, "updated", None).isoformat() if getattr(artifact, "updated", None) else None, "publishedAt": None},
    )


def _assignment_summary(assignment, user):
    if assignment is None:
        availability = {"state": "deleted", "reasonCode": "RESOURCE_NOT_FOUND", "replacement": None}
        return ResourceSummary(id="assignment_missing", type="assignment", title="作业不可用", availability=availability)
    allowed = _course_access(assignment.dojo, user)
    availability = {
        "state": "available" if allowed else "forbidden",
        "reasonCode": None if allowed else "COURSE_ACCESS_REQUIRED",
        "replacement": None,
    }
    href = f"/learning/assignments/{quote(assignment.id)}" if allowed else None
    capabilities = ["view", "submit"] if href else []
    if _course_manage(assignment.dojo, user):
        capabilities.extend(("edit", "grade"))
    return ResourceSummary(
        id=f"assignment_{assignment.id}",
        type="assignment",
        title=assignment.title or "未命名作业",
        context={"course": {"id": f"course_{assignment.dojo.reference_id}", "title": assignment.dojo.name or assignment.dojo.id}},
        availability=availability,
        workflow=_workflow(assignment.status),
        capabilities=tuple(capabilities),
        hrefs={"canonical": href, "primaryAction": href, "returnTo": "/student"},
        timestamps={"updatedAt": getattr(assignment, "updated", None).isoformat() if getattr(assignment, "updated", None) else None, "publishedAt": None},
    )


def resolve_resource(resource_type, resource_id, user=None):
    kind = str(resource_type or "").strip().lower()
    reference = str(resource_id or "").strip()
    if not reference:
        raise ProductError("INVALID_RESOURCE_ID", "缺少资源标识。", status=422)
    if kind == "course":
        return _course_summary(Dojos.from_id(reference).first(), user)
    if kind == "module":
        course_id, separator, module_id = reference.partition(":")
        if not separator:
            raise ProductError("INVALID_RESOURCE_ID", "章节标识格式不正确。", status=422)
        dojo = Dojos.from_id(course_id).first()
        module = DojoModules.query.filter_by(dojo_id=dojo.dojo_id, id=module_id).first() if dojo else None
        return _module_summary(module, user)
    if kind in {"challenge", "simulation"}:
        course_id, separator, rest = reference.partition(":")
        module_id, separator_two, challenge_id = rest.partition(":")
        if not separator or not separator_two:
            raise ProductError("INVALID_RESOURCE_ID", "题目标识格式不正确。", status=422)
        dojo = Dojos.from_id(course_id).first()
        module = DojoModules.query.filter_by(dojo_id=dojo.dojo_id, id=module_id).first() if dojo else None
        challenge = DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id, module_index=module.module_index, id=challenge_id).first() if dojo and module else None
        return _challenge_summary(challenge, user)
    if kind == "artifact":
        return _artifact_summary(TeachingArtifacts.query.filter_by(id=reference).first(), user)
    if kind == "assignment":
        return _assignment_summary(TeachingAssignments.query.filter_by(id=reference).first(), user)
    raise ProductError("UNSUPPORTED_RESOURCE_TYPE", "当前资源类型暂不支持解析。", status=422)

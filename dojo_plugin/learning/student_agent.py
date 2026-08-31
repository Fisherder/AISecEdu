"""Student-facing global-agent context, memory and bounded tool execution.

The language model receives the learner's original message and may propose tools.  This
module is the deterministic boundary: it resolves only user-owned/course-visible data,
checks that mutating tools were explicitly requested, and returns UI actions instead of
letting model text mutate platform state directly.
"""

from __future__ import annotations

import datetime
import re
from urllib.parse import parse_qsl, quote, urlencode, urlsplit

from CTFd.models import db

from ..agent_runtime.artifacts import artifact_view
from ..agent_runtime.scope import ScopeError, build_scope, dojo_for_user
from ..models import (
    DojoChallenges,
    DojoUsers,
    Dojos,
    LearningAttempts,
    SelfLearningWorkspaces,
    StudentAgentMemories,
    TeachingAgentThreads,
    TeachingArtifacts,
    TeachingAssignments,
)


WORKSPACE_MODES = {
    "learning-path",
    "slides",
    "attack-defense-scene",
    "simulation",
    "quiz",
    "debate",
}
MUTATING_TOOLS = {"create_workspace", "remember", "forget"}
ALLOWED_TOOLS = MUTATING_TOOLS | {"open"}


def _timestamp(value):
    return value.isoformat() + "Z" if value else None


def memory_view(row):
    return {
        "id": row.id,
        "category": row.category,
        "content": row.content,
        "source": row.source,
        "status": row.status,
        "created": _timestamp(row.created),
        "updated": _timestamp(row.updated),
    }


def _course_ids_for_student(user):
    if getattr(user, "type", None) == "admin":
        return [row.dojo_id for row in Dojos.query.all()]
    return [
        row.dojo_id
        for row in DojoUsers.query.filter_by(user_id=user.id).all()
    ]


def _artifact_url(artifact):
    if artifact.published_challenge_id:
        challenge = DojoChallenges.query.filter_by(
            challenge_id=artifact.published_challenge_id,
            dojo_id=artifact.dojo_id,
        ).first()
        if challenge is not None:
            return (
                f"/{challenge.dojo.reference_id}/{quote(challenge.module.id)}/"
                f"{quote(challenge.id)}"
            )
    return f"/learning/artifacts/{quote(artifact.id)}"


def _workspace_view(row):
    state = row.state if isinstance(row.state, dict) else {}
    return {
        "id": row.id,
        "title": row.title,
        "goal": row.goal,
        "status": row.status,
        "dojoId": row.dojo_id,
        "moduleIndex": row.module_index,
        "threadId": row.thread_id,
        "mode": state.get("artifactType") or "learning-path",
        "attemptId": state.get("attemptId"),
        "submittedArtifactId": row.submitted_artifact_id,
        "url": f"/learning/extend?workspace={quote(row.id)}",
        "created": _timestamp(row.created),
        "updated": _timestamp(row.updated),
    }


def student_resource_url_key(value):
    raw = str(value or "").strip()
    if not raw.startswith("/") or raw.startswith("//") or "\\" in raw:
        return None
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc:
        return None
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if path != "/":
        path = path.rstrip("/")
    query = urlencode(sorted(parse_qsl(parsed.query, keep_blank_values=True)))
    return path + (f"?{query}" if query else "") + (
        f"#{parsed.fragment}" if parsed.fragment else ""
    )


def student_resource_catalog(snapshot, profile=None):
    snapshot = snapshot if isinstance(snapshot, dict) else {}
    profile = profile if isinstance(profile, dict) else {}
    result = []
    seen = set()

    def add(object_type, object_id, url, title=None, aliases=None):
        url_key = student_resource_url_key(url)
        object_id = str(object_id or "").strip()
        if not object_type or not object_id or not url_key:
            return
        key = (str(object_type), object_id, url_key)
        if key in seen:
            return
        seen.add(key)
        result.append(
            {
                "objectType": str(object_type),
                "objectId": object_id,
                "url": str(url),
                "urlKey": url_key,
                "title": str(title or "")[:240],
                "aliases": [
                    str(alias)
                    for alias in (aliases or [])
                    if str(alias or "").strip() and str(alias) != object_id
                ],
            }
        )

    for course in profile.get("courses") or []:
        if not isinstance(course, dict):
            continue
        course_id = str(course.get("id") or "")
        add("course", course_id, course.get("url"), course.get("name"))
        for module in course.get("modules") or []:
            if not isinstance(module, dict):
                continue
            module_id = str(module.get("id") or "")
            add(
                "module",
                f"{course_id}:{module_id}",
                f"/{quote(course_id, safe='')}/{quote(module_id, safe='')}",
                module.get("name"),
            )
            for exercise in module.get("exercises") or []:
                if not isinstance(exercise, dict):
                    continue
                challenge_id = str(exercise.get("id") or "")
                add(
                    "challenge",
                    f"{course_id}:{module_id}:{challenge_id}",
                    exercise.get("url"),
                    exercise.get("name"),
                    aliases=[f"{course_id}/{module_id}/{challenge_id}"],
                )

    collection_types = {
        "assignments": "assignment",
        "courseMaterials": "course_material",
        "publishedArtifacts": "artifact",
        "personalArtifacts": "artifact",
        "workspaces": "workspace",
    }
    for collection, object_type in collection_types.items():
        for item in snapshot.get(collection) or []:
            if isinstance(item, dict):
                add(
                    object_type,
                    item.get("id"),
                    item.get("url"),
                    item.get("title") or item.get("name"),
                )
    for course in snapshot.get("courses") or []:
        if not isinstance(course, dict):
            continue
        reference_id = course.get("referenceId") or course.get("id")
        add(
            "course",
            reference_id,
            course.get("url"),
            course.get("name"),
            aliases=[course.get("id")],
        )
    return result


def student_resource_reference_for_url(url, snapshot, profile=None):
    requested = student_resource_url_key(url)
    if not requested:
        return None
    item = next(
        (
            item
            for item in student_resource_catalog(snapshot, profile)
            if item["urlKey"] == requested
        ),
        None,
    )
    if item is None:
        return None
    return {
        "objectType": item["objectType"],
        "objectId": item["objectId"],
    }


def student_agent_snapshot(user):
    """Return bounded, student-visible context for both the model and the UI."""

    course_ids = _course_ids_for_student(user)
    memories = (
        StudentAgentMemories.query.filter_by(user_id=user.id, status="ACTIVE")
        .order_by(StudentAgentMemories.updated.desc())
        .limit(40)
        .all()
    )
    workspaces = (
        SelfLearningWorkspaces.query.filter(
            SelfLearningWorkspaces.student_id == user.id,
            SelfLearningWorkspaces.status != "ARCHIVED",
        )
        .order_by(SelfLearningWorkspaces.updated.desc())
        .limit(40)
        .all()
    )
    published_query = TeachingArtifacts.query.filter(
        TeachingArtifacts.status == "PUBLISHED",
        TeachingArtifacts.self_workspace_id.is_(None),
    )
    if getattr(user, "type", None) != "admin":
        published_query = published_query.filter(
            TeachingArtifacts.dojo_id.in_(course_ids or [-1])
        )
    published = published_query.order_by(TeachingArtifacts.updated.desc()).limit(80).all()
    personal = (
        TeachingArtifacts.query.filter(
            TeachingArtifacts.owner_id == user.id,
            TeachingArtifacts.status.notin_(("ARCHIVED", "DELETED")),
        )
        .order_by(TeachingArtifacts.updated.desc())
        .limit(60)
        .all()
    )
    assignments_query = TeachingAssignments.query.filter(
        TeachingAssignments.status.in_(("PUBLISHED", "CLOSED"))
    )
    if getattr(user, "type", None) != "admin":
        assignments_query = assignments_query.filter(
            TeachingAssignments.dojo_id.in_(course_ids or [-1])
        )
    assignments = assignments_query.order_by(
        TeachingAssignments.due_at.asc().nullslast(),
        TeachingAssignments.updated.desc(),
    ).limit(80).all()

    course_rows = (
        Dojos.query.filter(Dojos.dojo_id.in_(course_ids)).all()
        if course_ids
        else []
    )
    is_admin = getattr(user, "type", None) == "admin"
    courses = [
        {
            "id": dojo.dojo_id,
            "referenceId": dojo.reference_id,
            "name": dojo.name,
            "url": f"/dojo/{dojo.reference_id}/learning",
            "modules": [
                {
                    "index": module.module_index,
                    "id": module.id,
                    "name": module.name,
                }
                for module in dojo.modules
                if is_admin or module.visible()
            ],
        }
        for dojo in course_rows
    ]
    course_materials = []
    for dojo in course_rows:
        for module in dojo.modules:
            if not is_admin and not module.visible():
                continue
            for resource in module.resources:
                if not is_admin and not resource.visible:
                    continue
                course_materials.append(
                    {
                        "id": (
                            f"{dojo.reference_id}:{module.module_index}:"
                            f"{resource.resource_index}"
                        ),
                        "title": resource.name or "课程材料",
                        "type": resource.type or "resource",
                        "courseId": dojo.dojo_id,
                        "courseName": dojo.name,
                        "moduleIndex": module.module_index,
                        "moduleName": module.name,
                        "url": (
                            f"/{quote(dojo.reference_id)}/{quote(module.id)}"
                            f"#resource-{resource.resource_index}"
                        ),
                        "readOnly": True,
                    }
                )
    return {
        "memory": [memory_view(row) for row in memories],
        "workspaces": [_workspace_view(row) for row in workspaces],
        "courses": courses,
        "courseMaterials": course_materials[:120],
        "assignments": [
            {
                "id": row.id,
                "title": row.title,
                "kind": row.kind,
                "status": row.status,
                "dojoId": row.dojo_id,
                "dueAt": _timestamp(row.due_at),
                "url": f"/learning/assignments/{quote(row.id)}",
            }
            for row in assignments
        ],
        "publishedArtifacts": [
            {
                **artifact_view(row, include_content=False),
                "url": _artifact_url(row),
                "readOnly": True,
            }
            for row in published
        ],
        "personalArtifacts": [
            {
                **artifact_view(row, include_content=False),
                "url": f"/learning/artifacts/{quote(row.id)}",
                "readOnly": False,
            }
            for row in personal
        ],
        "policy": {
            "role": "student",
            "automatic": [
                "read-own-learning-records",
                "read-enrolled-course-content",
                "create-personal-workspace",
                "create-personal-draft",
                "update-explicit-memory",
            ],
            "approvalRequired": ["submit-personal-artifact-for-teacher-review"],
            "denied": [
                "publish-course-content",
                "read-other-students-data",
                "read-private-solutions",
                "manage-users-or-course-permissions",
            ],
        },
    }


def _explicit_creation_request(question):
    text = str(question or "").strip()
    if re.search(r"(?:不要|不需要|别|停止|取消).{0,8}(?:生成|创建|制作|构建)", text):
        return False
    action = r"(?:生成|创建|制作|设计|构建|整理成|做一份|make|create|generate|build)"
    direct = (
        rf"^(?:(?:请|请你|麻烦|现在|直接)\s*)?"
        rf"(?:(?:帮我|给我|为我|替我)\s*)?"
        rf"(?:为[^，。；;！？!?\n]{{0,30}})?{action}"
    )
    desire = rf"^(?:我想要|我要|我需要|我希望你|我希望智能体)\s*{action}"
    continuation = (
        rf"(?:并且?|然后|接着|同时|再|以及)\s*"
        rf"(?:(?:请|帮我|给我|为我)\s*)?{action}"
    )
    return bool(re.search(direct, text, re.IGNORECASE)) or bool(
        re.search(desire, text, re.IGNORECASE)
    ) or bool(re.search(continuation, text, re.IGNORECASE))


def _explicit_memory_request(question, *, forget=False):
    text = str(question or "").strip()
    if forget:
        action = r"(?:忘记|删除.{0,4}记忆|清除.{0,4}记忆|不要再记|forget)"
    else:
        action = r"(?:记住|记一下|remember)"
    direct = (
        rf"^(?:(?:请|请你|麻烦|现在)\s*)?"
        rf"(?:(?:帮我)\s*)?{action}"
    )
    continuation = rf"(?:并且?|然后|接着|同时|再|以及)\s*(?:请)?{action}"
    explicit_preference = (
        not forget
        and bool(re.match(r"^(?:以后请|我的偏好是|请以后)", text, re.IGNORECASE))
    )
    return bool(re.search(direct, text, re.IGNORECASE)) or bool(
        re.search(continuation, text, re.IGNORECASE)
    ) or explicit_preference


def fallback_tool_calls(question):
    """Conservative offline fallback used only when the model proposes no tool."""

    text = str(question or "").strip()
    if _explicit_memory_request(text, forget=True):
        return [{"tool": "forget", "arguments": {"query": text}}]
    if _explicit_memory_request(text):
        return [
            {
                "tool": "remember",
                "arguments": {"category": "preference", "content": text},
            }
        ]
    if not _explicit_creation_request(text):
        return []
    mode = None
    for pattern, candidate in (
        (r"(?:课件|幻灯片|PPT|slides?)", "slides"),
        (r"(?:攻防.{0,4}(?:演示|场景)|attack.?defen)", "attack-defense-scene"),
        (r"(?:模拟|情境|角色演练|simulation)", "simulation"),
        (r"(?:测验|测试|问答题|quiz)", "quiz"),
        (r"(?:辩论|debate)", "debate"),
        (r"(?:学习路线|学习计划|学习路径|roadmap)", "learning-path"),
    ):
        if re.search(pattern, text, re.IGNORECASE):
            mode = candidate
            break
    if not mode:
        return []
    return [{"tool": "create_workspace", "arguments": {"mode": mode, "goal": text}}]


def sanitize_tool_calls(value):
    result = []
    for raw in value if isinstance(value, list) else []:
        if not isinstance(raw, dict):
            continue
        tool = str(raw.get("tool") or raw.get("name") or "").strip()
        arguments = raw.get("arguments") if isinstance(raw.get("arguments"), dict) else {}
        if tool not in ALLOWED_TOOLS:
            continue
        result.append({"tool": tool, "arguments": arguments})
        if len(result) >= 3:
            break
    return result


def resolve_tool_calls(question, proposed):
    resolved = []
    for call in sanitize_tool_calls(proposed):
        if call["tool"] == "create_workspace" and not _explicit_creation_request(question):
            continue
        if call["tool"] == "remember" and not _explicit_memory_request(question):
            continue
        if call["tool"] == "forget" and not _explicit_memory_request(question, forget=True):
            continue
        resolved.append(call)
    for call in fallback_tool_calls(question):
        if any(item["tool"] == call["tool"] for item in resolved):
            continue
        resolved.append(call)
    return resolved[:3]


def _resolve_course(user, value):
    if value in (None, ""):
        return None
    return dojo_for_user(user, value, teacher=False)


def _requests_current_course_scope(question):
    return bool(
        re.search(
            r"(?:当前|本门|这门|刚才|最近).{0,8}(?:课程|章节|练习|题目|学习)",
            str(question or ""),
            re.IGNORECASE,
        )
    )


def _implicit_workspace_scope(user, question):
    """Resolve “当前课程” from durable learner state, never model guesswork."""

    if not _requests_current_course_scope(question):
        return None, None
    latest_attempt = (
        LearningAttempts.query.filter_by(user_id=user.id)
        .order_by(LearningAttempts.started.desc())
        .first()
    )
    if latest_attempt is not None:
        dojo = _resolve_course(user, latest_attempt.dojo_id)
        return dojo, latest_attempt.module_index

    course_ids = list(dict.fromkeys(_course_ids_for_student(user)))
    if len(course_ids) == 1:
        dojo = _resolve_course(user, course_ids[0])
        visible_modules = [module for module in dojo.modules if module.visible()]
        module_index = (
            visible_modules[0].module_index if len(visible_modules) == 1 else None
        )
        return dojo, module_index
    raise ScopeError("无法确定当前课程，请先进入课程或明确选择课程后再创建工作区")


def _create_workspace(user, thread, question, arguments):
    if not _explicit_creation_request(question):
        raise ScopeError("创建个人工作区需要学生在本轮消息中明确提出")
    mode = str(arguments.get("mode") or "learning-path").strip()
    if mode not in WORKSPACE_MODES:
        raise ValueError("不支持的自主学习内容类型")
    goal = str(arguments.get("goal") or question).strip()[:16000]
    dojo = _resolve_course(user, arguments.get("dojoId") or arguments.get("courseId"))
    module_index = arguments.get("moduleIndex")
    if dojo is None:
        implicit_dojo, implicit_module_index = _implicit_workspace_scope(user, question)
        dojo = implicit_dojo
        if module_index is None:
            module_index = implicit_module_index
    scope = build_scope(
        user,
        role="student",
        dojo_id=dojo.dojo_id if dojo else None,
        module_index=module_index,
    )
    agent_thread = TeachingAgentThreads(
        user_id=user.id,
        dojo_id=scope.dojo_id,
        module_index=scope.module_index,
        title=goal[:240],
        phase="SELF_LEARNING",
        context={
            "personal": True,
            "source": "student-global-agent",
            "guideThreadId": thread.id,
        },
    )
    db.session.add(agent_thread)
    db.session.flush()
    workspace = SelfLearningWorkspaces(
        student_id=user.id,
        dojo_id=scope.dojo_id,
        module_index=scope.module_index,
        thread_id=agent_thread.id,
        title=goal[:240],
        goal=goal,
        status="ACTIVE",
        quota={
            "candidateSets": 20,
            "artifacts": 30,
            "complexScenes": 3,
            "modelTokens": 500000,
            "storageBytes": 104857600,
            "labMinutes": 120,
        },
        state={
            "privacy": "PERSONAL_DRAFT",
            "artifactType": mode,
            "source": "student-global-agent",
            "guideThreadId": thread.id,
        },
    )
    db.session.add(workspace)
    db.session.flush()
    return {
        "type": "workspace",
        "id": workspace.id,
        "label": "进入个人工作区",
        "title": workspace.title,
        "description": "工作区已建立；个人草稿默认仅你可见。",
        "url": f"/learning/extend?workspace={quote(workspace.id)}",
        "resourceRef": {
            "objectType": "workspace",
            "objectId": str(workspace.id),
        },
        "workspace": _workspace_view(workspace),
    }


def _remember(user, thread, question, arguments):
    if not _explicit_memory_request(question):
        raise ScopeError("只有学生明确要求记住的内容才能写入长期记忆")
    content = str(arguments.get("content") or question).strip()[:2000]
    if not content:
        raise ValueError("记忆内容不能为空")
    category = str(arguments.get("category") or "preference").strip()[:48]
    existing = StudentAgentMemories.query.filter_by(
        user_id=user.id,
        status="ACTIVE",
        content=content,
    ).first()
    row = existing or StudentAgentMemories(
        user_id=user.id,
        category=category or "preference",
        content=content,
        source="USER_EXPLICIT",
        source_thread_id=thread.id,
        status="ACTIVE",
    )
    if existing is None:
        db.session.add(row)
    row.updated = datetime.datetime.utcnow()
    db.session.flush()
    return {
        "type": "memory",
        "id": row.id,
        "label": "已记住",
        "title": content,
        "description": "这条记忆会用于后续对话，你可以随时删除。",
        "memory": memory_view(row),
    }


def _forget(user, question, arguments):
    if not _explicit_memory_request(question, forget=True):
        raise ScopeError("删除长期记忆需要学生在本轮消息中明确提出")
    memory_id = str(arguments.get("memoryId") or "").strip()
    query = StudentAgentMemories.query.filter_by(user_id=user.id, status="ACTIVE")
    if memory_id:
        query = query.filter_by(id=memory_id)
    rows = query.all()
    search = str(arguments.get("query") or "").strip()
    if not memory_id and search and not re.search(r"(?:全部|所有|清空|all)", search, re.I):
        terms = [term for term in re.split(r"\s+|[,，。；;]", search) if len(term) >= 2]
        matching = [row for row in rows if any(term in row.content for term in terms)]
        if matching:
            rows = matching
    for row in rows:
        row.status = "FORGOTTEN"
        row.updated = datetime.datetime.utcnow()
    return {
        "type": "memory",
        "label": "已清除记忆",
        "title": f"已清除 {len(rows)} 条记忆",
        "description": "已停用的记忆不会再进入模型上下文。",
    }


def _open(snapshot, arguments):
    requested = str(arguments.get("url") or "").strip()
    collections = {
        "courses": "course",
        "assignments": "assignment",
        "courseMaterials": "course_material",
        "publishedArtifacts": "artifact",
        "personalArtifacts": "artifact",
        "workspaces": "workspace",
    }
    match = next(
        (
            (collections[collection], item)
            for collection in collections
            for item in snapshot.get(collection) or []
            if str(item.get("url") or "") == requested
        ),
        None,
    )
    if match is None:
        raise ScopeError("只能打开当前学生可见的课程、任务或产物")
    object_type, item = match
    return {
        "type": "link",
        "label": str(arguments.get("label") or "打开")[:80],
        "title": str(arguments.get("title") or "继续学习")[:240],
        "url": requested,
        "resourceRef": {
            "objectType": object_type,
            "objectId": str(item.get("id") or "")[:128],
        },
    }


def execute_student_tools(user, thread, question, tool_calls, snapshot):
    """Execute a maximum of three validated, student-scoped tool proposals."""

    actions = []
    errors = []
    for call in sanitize_tool_calls(tool_calls):
        try:
            if call["tool"] == "create_workspace":
                actions.append(_create_workspace(user, thread, question, call["arguments"]))
            elif call["tool"] == "remember":
                actions.append(_remember(user, thread, question, call["arguments"]))
            elif call["tool"] == "forget":
                actions.append(_forget(user, question, call["arguments"]))
            elif call["tool"] == "open":
                actions.append(_open(snapshot, call["arguments"]))
        except (ScopeError, ValueError) as exc:
            errors.append({"tool": call["tool"], "error": str(exc)[:500]})
    return actions, errors


def forget_memory(user, memory_id):
    row = StudentAgentMemories.query.filter_by(
        id=str(memory_id),
        user_id=user.id,
        status="ACTIVE",
    ).first()
    if row is None:
        raise ScopeError("Memory not found")
    row.status = "FORGOTTEN"
    row.updated = datetime.datetime.utcnow()
    return row

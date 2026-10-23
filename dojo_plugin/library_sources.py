import copy
import uuid

from sqlalchemy import or_
from CTFd.models import db

from .agent_runtime.artifacts import content_hash
from .agent_runtime.scope import ScopeError, dojo_for_user
from .material_library import CONTENT_TYPES, LibraryConflict, require_library_teacher
from .models import (
    DojoAdmins, DojoChallenges, Dojos, LearningDrafts, MaterialLibraryItems, TeachingArtifactRevisions,
    TeachingArtifacts, TeachingAssignmentItems, TeachingAssignments, TeachingJobs,
)


def _course_source(user, row):
    if row is None:
        raise ScopeError("来源不存在或无权访问。")
    dojo_for_user(user, row.dojo_id, teacher=True)
    return row


def _artifact_source(user, source_id):
    artifact = TeachingArtifacts.query.filter_by(id=source_id).with_for_update().first()
    if artifact is None or artifact.self_workspace_id is not None:
        raise ScopeError("来源不存在或无权访问。")
    if artifact.dojo_id is not None:
        _course_source(user, artifact)
    elif artifact.owner_id != user.id:
        raise ScopeError("来源不存在或无权访问。")
    if artifact.status not in {"DRAFT", "READY", "READY_TO_PUBLISH", "PUBLISHED", "COURSE_CANDIDATE"}:
        raise LibraryConflict("请等内容生成完成后再保存到素材库。")
    active = TeachingJobs.query.filter(
        TeachingJobs.owner_id == artifact.owner_id,
        TeachingJobs.kind.in_(("artifact.materialize", "artifact.revise")),
        TeachingJobs.status.in_(("QUEUED", "RUNNING", "CANCEL_REQUESTED")),
        or_(TeachingJobs.payload["artifactId"].as_string() == artifact.id,
            TeachingJobs.result["artifactId"].as_string() == artifact.id),
    ).first()
    if active:
        raise LibraryConflict("这项内容正在生成或调整，请完成后再保存。")
    revision = TeachingArtifactRevisions.query.filter_by(artifact_id=artifact.id, revision=artifact.current_revision).first()
    if revision is None or not isinstance(revision.content, dict) or not revision.content:
        raise ValueError("来源尚没有可保存的有效版本。")
    if artifact.artifact_type not in CONTENT_TYPES:
        raise ValueError("该内容类型尚无素材复用适配。")
    return {"type": artifact.artifact_type, "title": artifact.title,
            "payload": {"schema": "material-library/1", "kind": "artifact", "type": artifact.artifact_type,
                        "title": artifact.title, "content": copy.deepcopy(revision.content)},
            "provenance": {"kind": "artifact", "id": artifact.id, "revision": revision.revision,
                           "revisionId": revision.id, "contentHash": revision.content_hash}}


def assignment_snapshot(assignment, dependency_loader):
    if not assignment.items:
        raise ValueError("空测验或作业不能保存到素材库。")
    payload = {"schema": "material-library/1", "kind": "assignment", "title": assignment.title,
               "assignmentKind": assignment.kind, "description": assignment.description,
               "instructions": assignment.instructions, "settings": copy.deepcopy(assignment.settings or {}),
               "items": [], "dependencies": {}}
    for item in assignment.items:
        config = copy.deepcopy(item.config or {})
        entry = {"type": item.item_type, "title": item.title, "prompt": item.prompt,
                 "points": item.points, "required": item.required, "config": config}
        practice_kind = "challenge" if item.challenge_id is not None else "practice"
        practice_id = f"{assignment.dojo_id}:{item.challenge_id}" if item.challenge_id is not None else config.get("libraryPracticeDraftId")
        for field, kind, value in [("artifactRef", "artifact", item.artifact_id), ("practiceRef", practice_kind, practice_id)]:
            if value is not None:
                key = f"{kind}:{value}"
                if key not in payload["dependencies"]:
                    payload["dependencies"][key] = dependency_loader({"kind": kind, "id": str(value)})["payload"]
                entry[field] = key
        config.pop("libraryPracticeDraftId", None)
        config.pop("libraryArtifactDependency", None)
        payload["items"].append(entry)
    return payload


def practice_snapshot(draft, package_loader, *, native_loader=None):
    spec = copy.deepcopy(draft.spec or {})
    if not spec or not spec.get("name") or not spec.get("description"):
        raise ValueError("题目尚没有完整的说明和运行规格。")
    payload = {"schema": "material-library/1", "kind": "practice", "title": spec["name"],
               "level": draft.level, "brief": draft.brief, "spec": spec,
               "constraints": copy.deepcopy(draft.constraints or {})}
    if spec.get("sourceChallengeId"):
        payload["nativePackage"] = package_loader(spec["sourceChallengeId"])
    elif spec.get("libraryNativePackage"):
        if native_loader is None:
            raise ValueError("素材题包快照尚未读取，不能保存不完整的题目。")
        payload["nativePackage"] = native_loader(spec)
    spec.pop("libraryNativePackage", None)
    return payload


def _snapshot_source(user, source):
    require_library_teacher(user)
    kind, source_id = source["kind"], source["id"]
    if kind == "artifact":
        return _artifact_source(user, source_id)
    if kind == "assignment":
        assignment = _course_source(user, TeachingAssignments.query.filter_by(id=source_id).with_for_update().first())
        if assignment.status not in {"DRAFT", "PUBLISHED", "CLOSED"}:
            raise LibraryConflict("已归档的测验或作业不能保存。")
        return {"type": "quiz" if assignment.kind == "QUIZ" else "assignment", "title": assignment.title,
                "payload": assignment_snapshot(assignment, lambda ref: snapshot_source(user, ref)),
                "provenance": {"kind": kind, "id": source_id, "updated": assignment.updated.isoformat()}}
    if kind in {"practice", "challenge"}:
        from .library_packages import snapshot_cached_package, snapshot_challenge_package, snapshot_published_challenge
        if kind == "challenge":
            return snapshot_published_challenge(user, source_id)
        draft = _course_source(user, LearningDrafts.query.filter_by(id=source_id).with_for_update().first())
        if draft.status in {"DELETED", "ARCHIVED", "GENERATING", "VALIDATING", "PUBLISHING"}:
            raise LibraryConflict("请等待题目处理完成后再保存。")
        payload = practice_snapshot(draft, lambda challenge_id: snapshot_challenge_package(user, challenge_id), native_loader=snapshot_cached_package)
        return {"type": "practice", "title": payload["title"], "payload": payload,
                "provenance": {"kind": kind, "id": source_id, "revision": draft.revision}}
    raise ValueError("来源类型无效。")


def snapshot_source(user, source):
    from .library_assets import capture_asset_snapshot
    result = _snapshot_source(user, source)
    result["payload"] = capture_asset_snapshot(user, result["payload"])
    return result


def _course_href(dojo, tab, **values):
    from urllib.parse import urlencode
    return "/teacher/courses?" + urlencode({"dojo": dojo.reference_id, "tab": tab, **values})


def source_preview_href(user, item):
    from urllib.parse import quote, urlencode
    from .agent_runtime.artifacts import artifact_for_viewer
    from .coursework import assignment_for_teacher

    try:
        if item.source_kind == "artifact":
            artifact = artifact_for_viewer(item.source_id, user)
            return f"/teacher/artifacts/{quote(artifact.id, safe='')}?" + urlencode({"returnTo": "/teacher/library"})
        if item.source_kind == "assignment":
            assignment = assignment_for_teacher(item.source_id, user)
            return f"/teacher/assignments/{quote(assignment.id, safe='')}"
        if item.source_kind == "practice":
            draft = _course_source(user, LearningDrafts.query.filter_by(id=item.source_id).first())
            if draft.status in {"DELETED", "ARCHIVED"}:
                raise ScopeError("Source unavailable")
            return _course_href(draft.dojo, "questions", selectedId=draft.id, studentPreview="1")
        if item.source_kind == "challenge":
            try:
                identity = [int(part) for part in item.source_id.split(":")]
                if len(identity) not in {2, 3}:
                    raise ValueError("Invalid challenge identity")
            except (AttributeError, TypeError, ValueError):
                raise ScopeError("Source unavailable")
            dojo = dojo_for_user(user, identity[0], teacher=True)
            scope = {"dojo_id": dojo.dojo_id, "challenge_id": identity[-1]}
            if len(identity) == 3:
                scope["module_index"] = identity[1]
            matches = DojoChallenges.query.filter_by(**scope).all()
            if len(matches) != 1:
                raise ScopeError("Source unavailable")
            challenge = matches[0]
            return f"/{quote(dojo.reference_id, safe='')}/{quote(challenge.module.id, safe='')}/{quote(challenge.id, safe='')}"
    except ScopeError:
        raise ScopeError("原项目已不可用或你没有访问权限，请先将素材加入自己的课程后查看副本。")
    raise ValueError("素材来源类型无效。")


def instantiate_snapshot(user, dojo, module_index, payload, provenance):
    from .library_assets import bind_asset_copies
    require_library_teacher(user)
    dojo_for_user(user, dojo.dojo_id, teacher=True)
    if payload.get("schema") != "material-library/1":
        raise ValueError("不支持的素材快照版本。")
    title = provenance.get("title") or payload["title"]
    kind = payload["kind"]
    if kind == "artifact":
        artifact = TeachingArtifacts(owner_id=user.id, dojo_id=dojo.dojo_id, module_index=module_index,
                                     artifact_type=payload["type"], title=title[:240], status="DRAFT", current_revision=1)
        db.session.add(artifact)
        db.session.flush()
        payload = bind_asset_copies(user, dojo, kind, artifact.id, payload)
        content = copy.deepcopy(payload["content"])
        db.session.add(TeachingArtifactRevisions(
            artifact_id=artifact.id, revision=1, content=content, content_hash=content_hash(content),
            source_refs=[copy.deepcopy(provenance)], created_by=user.id,
            validation={"status": "PENDING", "reason": "素材副本须在目标课程检查后发布"},
            instruction="从素材库复制，可独立修改，不影响源素材。",
        ))
        return {"kind": kind, "id": artifact.id, "status": "DRAFT", "title": artifact.title,
                "href": f"/teacher/artifacts/{artifact.id}"}
    if kind == "practice":
        from .library_packages import bind_native_snapshot
        spec = copy.deepcopy(payload["spec"])
        spec["id"] = "lib-" + uuid.uuid4().hex[:20]
        spec["name"] = title[:128]
        if payload.get("nativePackage"):
            bind_native_snapshot(spec, payload["nativePackage"], provenance)
        for key in ("initialPreflightReview", "preflightReview", "authoringPipeline", "repairSummary", "rebuildSummary"):
            spec.pop(key, None)
        constraints = copy.deepcopy(payload.get("constraints") or {})
        constraints["librarySource"] = copy.deepcopy(provenance)
        draft = LearningDrafts(author_id=user.id, dojo_id=dojo.dojo_id, module_index=module_index,
                               status="DRAFT", level=payload.get("level") or "L3", brief=payload.get("brief") or spec["description"],
                               spec=spec, constraints=constraints, conversation=[], candidates=[], validation={}, revision=1)
        db.session.add(draft)
        db.session.flush()
        if payload.get("libraryAssetSnapshot"):
            hydrated = bind_asset_copies(user, dojo, kind, draft.id, {**payload, "spec": draft.spec})
            draft.spec = hydrated["spec"]
            draft.brief = hydrated.get("brief") or hydrated["spec"]["description"]
        return {"kind": kind, "id": draft.id, "status": "DRAFT", "title": title,
                "href": _course_href(dojo, "questions", selectedId=draft.id)}
    if kind == "assignment":
        dependencies = {}
        for key, data in (payload.get("dependencies") or {}).items():
            dependencies[key] = instantiate_snapshot(user, dojo, module_index, data, {**provenance, "title": data["title"]})
        assignment = TeachingAssignments(owner_id=user.id, dojo_id=dojo.dojo_id, module_index=module_index,
                                          title=title[:240], kind=payload["assignmentKind"], status="DRAFT",
                                          description=payload["description"], instructions=payload["instructions"],
                                          settings={**copy.deepcopy(payload.get("settings") or {}), "librarySource": copy.deepcopy(provenance)})
        db.session.add(assignment)
        db.session.flush()
        payload = bind_asset_copies(user, dojo, kind, assignment.id, payload)
        assignment.description = payload["description"]
        assignment.instructions = payload["instructions"]
        assignment.settings = {**copy.deepcopy(payload.get("settings") or {}), "librarySource": copy.deepcopy(provenance)}
        for position, data in enumerate(payload["items"]):
            config = copy.deepcopy(data["config"])
            artifact_id = None
            if data.get("artifactRef"):
                artifact_id = dependencies[data["artifactRef"]]["id"]
                config["libraryArtifactDependency"] = artifact_id
            if data.get("practiceRef"):
                config["libraryPracticeDraftId"] = dependencies[data["practiceRef"]]["id"]
            db.session.add(TeachingAssignmentItems(
                assignment_id=assignment.id, position=position, item_type=data["type"], title=data["title"],
                prompt=data["prompt"], points=data["points"], required=data["required"],
                artifact_id=artifact_id, challenge_id=None, config=config,
            ))
        return {"kind": kind, "id": assignment.id, "status": "DRAFT", "title": assignment.title,
                "href": f"/teacher/assignments/{assignment.id}", "dependencies": list(dependencies.values())}
    raise ValueError("素材内容类型无效。")


def frozen_course_ids():
    from .models.construction import ConstructionSpaces
    return db.session.query(ConstructionSpaces.course_id)


def exclude_frozen(column):
    return or_(column.is_(None), column.notin_(frozen_course_ids()))


def library_courses(user):
    require_library_teacher(user)
    query = Dojos.query.filter(exclude_frozen(Dojos.dojo_id))
    if getattr(user, "type", None) != "admin":
        query = query.filter(Dojos.dojo_id.in_(db.session.query(DojoAdmins.dojo_id).filter_by(user_id=user.id)))
    rows = query.order_by(Dojos.name, Dojos.dojo_id).all()
    return [{"id": row.dojo_id, "name": row.name or row.id, "referenceId": row.reference_id,
             "modules": [{"index": module.module_index, "name": module.name or module.id} for module in row.modules]}
            for row in rows if not (row.data or {}).get("archived")]


def list_sources(user, *, kind="artifact", course_id=None, search="", content_type="", source_id=None, offset=0, limit=24, for_submission=False):
    require_library_teacher(user)
    if kind not in {"artifact", "assignment", "practice", "challenge"}:
        raise ValueError("来源类型无效。")
    if not isinstance(search, str) or len(search) > 240 or offset < 0 or limit < 1:
        raise ValueError("来源筛选条件无效。")
    limit = min(limit, 100)
    courses = db.session.query(DojoAdmins.dojo_id).filter_by(user_id=user.id)
    model, title_column = {
        "artifact": (TeachingArtifacts, TeachingArtifacts.title),
        "assignment": (TeachingAssignments, TeachingAssignments.title),
        "practice": (LearningDrafts, LearningDrafts.spec["name"].as_string()),
        "challenge": (DojoChallenges, DojoChallenges.name),
    }[kind]
    query = model.query.filter(exclude_frozen(model.dojo_id))
    if for_submission:
        from .models.construction import ConstructionSpaces
        unavailable = db.session.query(ConstructionSpaces.course_id)
        archived = db.session.query(Dojos.dojo_id).filter(Dojos.data['archived'].as_boolean().is_(True))
        query = query.filter(or_(model.dojo_id.is_(None),
                                 ~model.dojo_id.in_(unavailable.union(archived))))
    if kind == "artifact":
        allowed = or_(TeachingArtifacts.owner_id == user.id, TeachingArtifacts.dojo_id.in_(courses))
        if getattr(user, "type", None) != "admin":
            query = query.filter(allowed)
        else:
            query = query.filter(or_(TeachingArtifacts.owner_id == user.id, TeachingArtifacts.dojo_id.isnot(None)))
        query = query.filter(TeachingArtifacts.self_workspace_id.is_(None),
                             TeachingArtifacts.status.in_(("DRAFT", "READY", "READY_TO_PUBLISH", "PUBLISHED", "COURSE_CANDIDATE")),
                             TeachingArtifacts.artifact_type.in_(tuple(CONTENT_TYPES)))
        if content_type:
            query = query.filter_by(artifact_type=content_type)
    else:
        if getattr(user, "type", None) != "admin":
            query = query.filter(model.dojo_id.in_(courses))
        if kind == "assignment":
            query = query.filter(TeachingAssignments.status.in_(("DRAFT", "PUBLISHED", "CLOSED")))
        elif kind == "practice":
            query = query.filter(LearningDrafts.status.notin_(("DELETED", "ARCHIVED", "GENERATING", "VALIDATING", "PUBLISHING")),
                                 LearningDrafts.published_challenge_id.is_(None))
    if source_id is not None:
        if not isinstance(source_id, str) or not source_id or len(source_id) > 128:
            raise ValueError("来源标识无效。")
        if kind == "challenge":
            identity = source_id.split(":")
            if len(identity) != 3 or not identity[0].lstrip("-").isdecimal() or not all(part.isdecimal() for part in identity[1:]):
                raise ValueError("已发布题目须指定课程、章节和题目标识。")
            query = query.filter_by(dojo_id=int(identity[0]), module_index=int(identity[1]), challenge_id=int(identity[2]))
        else:
            query = query.filter_by(id=source_id)
    if course_id is not None:
        course = dojo_for_user(user, course_id, teacher=True)
        query = query.filter(model.dojo_id == course.dojo_id)
    if search.strip():
        literal = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(title_column.ilike(f"%{literal}%", escape="\\"))
    total = query.count()
    order = [title_column, model.challenge_id, model.dojo_id] if kind == "challenge" else [title_column, model.id]
    rows = query.order_by(*order).offset(offset).limit(limit).all()
    items = []
    for row in rows:
        content_type = row.artifact_type if kind == "artifact" else "quiz" if kind == "assignment" and row.kind == "QUIZ" else "assignment" if kind == "assignment" else "practice"
        items.append({"id": f"{row.dojo_id}:{row.module_index}:{row.challenge_id}" if kind == "challenge" else str(row.id), "kind": kind,
                      "title": row.title if kind in {"artifact", "assignment"} else (row.spec or {}).get("name", "题目草稿") if kind == "practice" else row.name,
                      "type": content_type, "typeLabel": CONTENT_TYPES[content_type], "courseId": row.dojo_id})
    saved = MaterialLibraryItems.query.filter(MaterialLibraryItems.owner_id == user.id, MaterialLibraryItems.source_kind == kind,
                                              MaterialLibraryItems.source_id.in_([item["id"] for item in items])).all()
    by_source = {item.source_id: item for item in saved}
    for item in items:
        previous = by_source.get(item["id"])
        item["libraryItem"] = {"id": previous.id, "metadataVersion": previous.metadata_version, "version": previous.version} if previous else None
    return {"sources": items, "pagination": {"total": total, "offset": offset, "limit": limit, "hasNext": offset + len(rows) < total}}

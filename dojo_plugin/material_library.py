import copy
import datetime
import hashlib
import json
import re

from sqlalchemy import func, or_
from CTFd.models import Users, db

from .agent_runtime.scope import ScopeError, dojo_for_user, validate_module
from .construction_library import library_status, guard_library_write, guard_import
from .models import (
    DojoAdmins, LearningAuditEvents, MaterialCollections, MaterialCollectionItems,
    MaterialLibraryImports, MaterialLibraryItems, MaterialLibraryVersions,
)


CONTENT_TYPES = {
    "slide-deck": "课件", "quiz": "测验", "practice": "实践题目",
    "attack-defense-scene": "动画演示", "simulation": "交互仿真",
    "assignment": "作业", "debate": "AI 辩论", "roleplay": "角色互动",
    "question-set": "题集", "assessment": "综合测评", "knowledge-test": "知识测验",
    "classroom-scenario": "课堂情境", "learning-path": "学习路径",
    "challenge": "题目作品", "vulnerable-lab": "实验作品",
    "file-package": "文件成果", "learning-flow": "流程探究式学习",
    "interactive-lesson": "互动课件", "lesson-plan": "教学方案",
}
MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024


class LibraryConflict(ValueError):
    pass


def require_library_teacher(user):
    if user is None or not (
        getattr(user, "type", None) == "admin"
        or DojoAdmins.query.filter_by(user_id=user.id).first()
    ):
        raise ScopeError("当前账号没有教师素材库权限。")


def _text(value, limit, label, *, required=True):
    if not isinstance(value, str):
        raise ValueError(f"{label}格式无效。")
    value = value.strip()
    if (required and not value) or len(value) > limit:
        raise ValueError(f"{label}请填写{'1–' if required else '不超过 '}{limit} 个字符。")
    return value


def _integer(value, label, *, minimum=1):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f"{label}必须是大于等于 {minimum} 的整数。")
    return value


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _audit(user, action, item_id, details=None):
    db.session.add(LearningAuditEvents(
        actor_id=user.id, action=f"library.{action}", resource_type="material_library",
        resource_id=item_id, outcome="ALLOW", details=details or {},
    ))


def _serialize_user_writes(user):
    # One transaction owns an actor's idempotency key, including the first insert.
    db.session.query(Users.id).filter(Users.id == user.id).with_for_update(of=Users).one()


def create_collection(user, *, name, course_id=None):
    require_library_teacher(user)
    name = _text(name, 128, "课程分类名称")
    if course_id is not None:
        course_id = dojo_for_user(user, course_id, teacher=True).dojo_id
    _serialize_user_writes(user)
    existing = MaterialCollections.query.filter_by(owner_id=user.id, name=name).first()
    if existing:
        if existing.course_id != course_id:
            raise LibraryConflict("已经有同名分类，请选择已有分类或使用其他名称。")
        return existing
    collection = MaterialCollections(owner_id=user.id, name=name, course_id=course_id)
    db.session.add(collection)
    db.session.flush()
    _audit(user, "collection.create", collection.id, {"name": name})
    return collection


def _collection_ids(user, ids):
    if not isinstance(ids, list) or len(ids) > 20 or any(not isinstance(value, str) for value in ids):
        raise ValueError("请选择最多 20 个课程分类。")
    ids = list(dict.fromkeys(ids))
    found = MaterialCollections.query.filter(
        MaterialCollections.owner_id == user.id, MaterialCollections.id.in_(ids),
    ).all()
    if {row.id for row in found} != set(ids):
        raise ScopeError("课程分类不存在或不属于你。")
    return ids


def _set_collections(item, ids):
    MaterialCollectionItems.query.filter_by(item_id=item.id).delete(synchronize_session=False)
    db.session.add_all([MaterialCollectionItems(item_id=item.id, collection_id=value) for value in ids])


def _visible_query(user, *, scope="all", archived=False):
    require_library_teacher(user)
    if scope not in {"all", "mine", "shared"}:
        raise ValueError("请选择有效的素材范围。")
    query = MaterialLibraryItems.query
    if archived:
        return query.filter_by(owner_id=user.id, archived=True)
    query = query.filter_by(archived=False)
    if scope == "mine":
        return query.filter_by(owner_id=user.id)
    if scope == "shared":
        return query.filter_by(visibility="teachers")
    return query.filter(or_(MaterialLibraryItems.owner_id == user.id, MaterialLibraryItems.visibility == "teachers"))


def item_for_user(user, item_id, *, manage=False, lock=False):
    require_library_teacher(user)
    query = MaterialLibraryItems.query.filter_by(id=item_id)
    if manage:
        query = query.filter_by(owner_id=user.id)
    else:
        query = query.filter(or_(
            MaterialLibraryItems.owner_id == user.id,
            (MaterialLibraryItems.visibility == "teachers") & (MaterialLibraryItems.archived.is_(False)),
        ))
    if lock:
        query = query.with_for_update().populate_existing()
    item = query.first()
    if item is None:
        raise ScopeError("素材不存在或无权访问。")
    return item


def _item_views(rows, user):
    ids = [row.id for row in rows]
    links = db.session.query(MaterialCollectionItems.item_id, MaterialCollections.id, MaterialCollections.name).join(
        MaterialCollections, MaterialCollectionItems.collection_id == MaterialCollections.id,
    ).filter(MaterialCollectionItems.item_id.in_(ids)).order_by(MaterialCollections.name, MaterialCollections.id).all()
    groups = {}
    for item_id, group_id, name in links:
        groups.setdefault(item_id, []).append({"id": group_id, "name": name})
    return [{
        "id": row.id, "title": row.title, "description": row.description,
        "type": row.content_type, "typeLabel": CONTENT_TYPES[row.content_type],
        "visibility": row.visibility, "archived": row.archived,
        "version": row.version, "metadataVersion": row.metadata_version,
        "canManage": row.owner_id == user.id,
        "construction": library_status(row),
        "collections": groups.get(row.id, []),
        "created": row.created.isoformat() + "Z", "updated": row.updated.isoformat() + "Z",
    } for row in rows]


def list_items(user, *, search="", content_type="", collection_id="", scope="all", archived=False, offset=0, limit=24):
    query = _visible_query(user, scope=scope, archived=archived)
    offset = _integer(offset, "起始位置", minimum=0)
    limit = min(_integer(limit, "每页数量"), 100)
    search = _text(search, 240, "搜索词", required=False)
    if search:
        literal = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(or_(
            MaterialLibraryItems.title.ilike(f"%{literal}%", escape="\\"),
            MaterialLibraryItems.description.ilike(f"%{literal}%", escape="\\"),
        ))
    if collection_id:
        query = query.filter(MaterialLibraryItems.id.in_(
            db.session.query(MaterialCollectionItems.item_id).filter_by(collection_id=collection_id),
        ))
    counts = dict(query.with_entities(MaterialLibraryItems.content_type, func.count()).group_by(MaterialLibraryItems.content_type).all())
    if content_type:
        if content_type not in CONTENT_TYPES:
            raise ValueError("请选择有效的素材类型。")
        query = query.filter_by(content_type=content_type)
    total = query.count()
    rows = query.order_by(MaterialLibraryItems.updated.desc(), MaterialLibraryItems.id.desc()).offset(offset).limit(limit).all()
    return {"items": _item_views(rows, user), "typeCounts": counts, "pagination": {
        "offset": offset, "limit": limit, "total": total, "hasNext": offset + len(rows) < total,
    }}


def list_collections(user):
    visible = _visible_query(user).with_entities(MaterialLibraryItems.id).subquery()
    counts = db.session.query(MaterialCollectionItems.collection_id, func.count().label("n")).join(
        visible, visible.c.id == MaterialCollectionItems.item_id,
    ).group_by(MaterialCollectionItems.collection_id).subquery()
    rows = db.session.query(MaterialCollections, counts.c.n).outerjoin(
        counts, counts.c.collection_id == MaterialCollections.id,
    ).filter(or_(MaterialCollections.owner_id == user.id, counts.c.n > 0)).order_by(MaterialCollections.name, MaterialCollections.id).all()
    return [{"id": row.id, "name": row.name, "canManage": row.owner_id == user.id, "count": count or 0,
             "courseId": row.course_id if row.owner_id == user.id else None} for row, count in rows]


def _version_row(item, number=None):
    number = item.version if number is None else _integer(number, "素材版本")
    revision = MaterialLibraryVersions.query.filter_by(item_id=item.id, version=number).first()
    if revision is None:
        raise ScopeError("该素材版本不存在。")
    return revision


def item_detail(user, item_id, *, version=None):
    item = item_for_user(user, item_id)
    revision = _version_row(item, version)
    view = _item_views([item], user)[0]
    view["snapshot"] = {
        "version": revision.version, "payload": copy.deepcopy(revision.payload),
        "contentHash": revision.content_hash, "created": revision.created.isoformat() + "Z",
    }
    view["source"] = copy.deepcopy(revision.provenance) if item.owner_id == user.id else {"kind": item.source_kind}
    view["versions"] = [{"version": row.version, "created": row.created.isoformat() + "Z"} for row in MaterialLibraryVersions.query.filter_by(
        item_id=item.id,
    ).with_entities(MaterialLibraryVersions.version, MaterialLibraryVersions.created).order_by(MaterialLibraryVersions.version.desc()).all()]
    return view


def save_source(user, source, *, snapshotter, collection_ids=None, title=None, description="", visibility="private", expected_metadata_version=None):
    require_library_teacher(user)
    if not isinstance(source, dict) or source.get("kind") not in {"artifact", "assignment", "practice", "challenge"}:
        raise ValueError("请选择有效的已有内容。")
    source_id = _text(source.get("id"), 128, "来源标识")
    if visibility not in {"private", "teachers"}:
        raise ValueError("素材仅支持自己可见或教师共享。")
    guard_library_write(user, visibility)
    ids = _collection_ids(user, [] if collection_ids is None else collection_ids)
    if expected_metadata_version is not None:
        _integer(expected_metadata_version, "素材信息版本")
    description = _text(description, 2000, "素材说明", required=False)
    _serialize_user_writes(user)
    snapshot = snapshotter(user, {"kind": source["kind"], "id": source_id})
    if not isinstance(snapshot, dict) or snapshot.get("type") not in CONTENT_TYPES or not isinstance(snapshot.get("payload"), dict) or not snapshot["payload"]:
        raise ValueError("来源尚没有完整可保存的内容。")
    encoded = json.dumps(snapshot["payload"], ensure_ascii=False, allow_nan=False).encode()
    if len(encoded) > MAX_SNAPSHOT_BYTES:
        raise ValueError("素材超过单项 64 MB 限制，请拆分后保存。")
    title = _text(snapshot.get("title") if title is None else title, 240, "素材名称")
    item = MaterialLibraryItems.query.filter_by(owner_id=user.id, source_kind=source["kind"], source_id=source_id).with_for_update().first()
    digest = _hash(snapshot["payload"])
    if item:
        if expected_metadata_version != item.metadata_version:
            raise LibraryConflict("这项来源已在素材库中，请刷新并确认更新已有素材。")
        if item.content_type != snapshot["type"]:
            raise LibraryConflict("来源类型已经变化，请检查后重新选择来源。")
        current = _version_row(item)
        changed = current.content_hash != digest
        item.version += int(changed)
        item.metadata_version += 1
    else:
        if expected_metadata_version is not None:
            raise LibraryConflict("原素材已经不存在，请重新保存。")
        item = MaterialLibraryItems(owner_id=user.id, source_kind=source["kind"], source_id=source_id,
                                    content_type=snapshot["type"], title=title, version=1, metadata_version=1)
        db.session.add(item)
        db.session.flush()
        changed = True
    item.title, item.description, item.visibility, item.archived = title, description, visibility, False
    item.updated = datetime.datetime.utcnow()
    if changed:
        db.session.add(MaterialLibraryVersions(
            item_id=item.id, version=item.version, payload=copy.deepcopy(snapshot["payload"]),
            content_hash=digest, provenance=copy.deepcopy(snapshot.get("provenance") or {}), created_by=user.id,
        ))
    _set_collections(item, ids)
    _audit(user, "save", item.id, {"version": item.version, "visibility": visibility})
    db.session.flush()
    return _item_views([item], user)[0]


def update_item(user, item_id, body):
    if not isinstance(body, dict) or set(body) - {"expectedMetadataVersion", "title", "description", "visibility", "collectionIds", "archived"}:
        raise ValueError("素材修改字段无效。")
    item = item_for_user(user, item_id, manage=True, lock=True)
    if _integer(body.get("expectedMetadataVersion"), "素材信息版本") != item.metadata_version:
        raise LibraryConflict("素材信息已变化，请刷新后重试。")
    if "title" in body:
        item.title = _text(body["title"], 240, "素材名称")
    if "description" in body:
        item.description = _text(body["description"], 2000, "素材说明", required=False)
    if "visibility" in body:
        if body["visibility"] not in {"private", "teachers"}:
            raise ValueError("素材共享范围无效。")
        guard_library_write(user, body["visibility"])
        item.visibility = body["visibility"]
    if "archived" in body:
        if not isinstance(body["archived"], bool):
            raise ValueError("归档状态无效。")
        item.archived = body["archived"]
    if "collectionIds" in body:
        _set_collections(item, _collection_ids(user, body["collectionIds"]))
    item.metadata_version += 1
    item.updated = datetime.datetime.utcnow()
    _audit(user, "update", item.id, {"metadataVersion": item.metadata_version, "archived": item.archived, "visibility": item.visibility})
    db.session.flush()
    return _item_views([item], user)[0]


def import_items(user, body, *, instantiator):
    require_library_teacher(user)
    if not isinstance(body, dict):
        raise ValueError("选用请求格式无效。")
    key = _text(body.get("requestKey"), 128, "请求标识")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", key):
        raise ValueError("请求标识格式无效。")
    selections = body.get("items")
    if not isinstance(selections, list) or not 1 <= len(selections) <= 20:
        raise ValueError("每次请选择 1–20 项素材。")
    prepared = []
    seen = set()
    for selection in selections:
        if not isinstance(selection, dict):
            raise ValueError("素材选择格式无效。")
        item_id = _text(selection.get("id"), 48, "素材标识")
        version = _integer(selection.get("version"), "素材版本")
        if item_id in seen:
            raise ValueError("同一素材不能重复选择。")
        seen.add(item_id)
        prepared.append({"id": item_id, "version": version})
    dojo = dojo_for_user(user, body.get("courseId"), teacher=True)
    module_index = validate_module(dojo, _integer(body.get("moduleIndex"), "章节", minimum=0))
    if (dojo.data or {}).get("archived"):
        raise ValueError("归档课程不能加入素材。")
    request_hash = _hash({"items": prepared, "courseId": dojo.dojo_id, "moduleIndex": module_index})
    _serialize_user_writes(user)
    previous = MaterialLibraryImports.query.filter_by(owner_id=user.id, request_key=key).first()
    if previous:
        if previous.request_hash != request_hash:
            raise LibraryConflict("同一请求标识不能用于不同的选用内容。")
        return copy.deepcopy(previous.result)
    snapshots = []
    for selection in prepared:
        item = item_for_user(user, selection["id"], lock=True)
        if item.archived:
            raise LibraryConflict("所选素材已归档，请重新选择。")
        guard_import(item.id, selection["version"])
        revision = _version_row(item, selection["version"])
        if _hash(revision.payload) != revision.content_hash:
            raise LibraryConflict("素材快照校验未通过，暂不能选用。")
        snapshots.append((item, revision))
    results = []
    for item, revision in snapshots:
        provenance = {"type": "material-library", "id": item.id, "version": revision.version, "contentHash": revision.content_hash, "title": item.title}
        resource = instantiator(user, dojo, module_index, copy.deepcopy(revision.payload), provenance)
        results.append({"itemId": item.id, "version": revision.version, "resource": resource})
    result = {"imports": results, "courseId": dojo.dojo_id, "moduleIndex": module_index, "published": False}
    record = MaterialLibraryImports(owner_id=user.id, request_key=key, request_hash=request_hash,
                                    course_id=dojo.dojo_id, module_index=module_index, result=result)
    db.session.add(record)
    db.session.flush()
    _audit(user, "import", record.id, {"items": prepared, "courseId": dojo.dojo_id, "moduleIndex": module_index})
    return result

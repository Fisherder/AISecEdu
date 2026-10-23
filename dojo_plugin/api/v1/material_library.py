from functools import wraps
from urllib.parse import urlencode

from flask import request
from flask_restx import Namespace, Resource
from CTFd.models import db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ... import config
from ...agent_runtime.auth import mint_launch_ticket
from ...agent_runtime.scope import ScopeError, build_scope
from ...library_sources import instantiate_snapshot, library_courses, list_sources, snapshot_source, source_preview_href
from ...material_library import (
    CONTENT_TYPES, LibraryConflict, create_collection, import_items, item_detail,
    list_collections, list_items, require_library_teacher, save_source, update_item, item_for_user,
)


material_library_namespace = Namespace("material-library", description="版本化教学素材库与跨课程复用")


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError("请求内容必须为对象。")
    return body


def _query_integer(name, default=None):
    raw = request.args.get(name)
    if raw is None:
        return default
    digits = raw[1:] if raw.startswith("-") else raw
    if not digits or not digits.isascii() or not digits.isdecimal():
        raise ValueError(f"{name} 必须是整数。")
    return int(raw)


def library_endpoint(function):
    @wraps(function)
    @authed_only
    def decorated(*args, **kwargs):
        try:
            user = get_current_user()
            require_library_teacher(user)
            result = function(*args, user=user, **kwargs)
            if request.method != "GET":
                db.session.commit()
            return {"success": True, "data": result}, 200
        except (ScopeError, LibraryConflict, ValueError, TypeError) as exc:
            db.session.rollback()
            status = 404 if isinstance(exc, ScopeError) else 409 if isinstance(exc, LibraryConflict) else 400
            code = "NOT_FOUND" if status == 404 else "VERSION_CONFLICT" if status == 409 else "INVALID_REQUEST"
            return {"success": False, "error": {"code": code, "message": str(exc)}}, status
        except Exception:
            db.session.rollback()
            raise
    return decorated


@material_library_namespace.route("/context")
class LibraryContext(Resource):
    @library_endpoint
    def get(self, *, user):
        return {"courses": library_courses(user), "collections": list_collections(user), "types": CONTENT_TYPES}


@material_library_namespace.route("/collections")
class LibraryCollections(Resource):
    @library_endpoint
    def get(self, *, user):
        return {"collections": list_collections(user)}

    @library_endpoint
    def post(self, *, user):
        body = _body()
        item = create_collection(user, name=body.get("name"), course_id=body.get("courseId"))
        return {"collection": {"id": item.id, "name": item.name, "courseId": item.course_id, "canManage": True}}


@material_library_namespace.route("/sources")
class LibrarySources(Resource):
    @library_endpoint
    def get(self, *, user):
        return list_sources(user, kind=request.args.get("kind", "artifact"), course_id=_query_integer("courseId"),
                            search=request.args.get("q", ""), content_type=request.args.get("type", ""),
                            source_id=request.args.get("id"), offset=_query_integer("offset", 0), limit=_query_integer("limit", 24))


@material_library_namespace.route("/items")
class LibraryItems(Resource):
    @library_endpoint
    def get(self, *, user):
        return list_items(user, search=request.args.get("q", ""), content_type=request.args.get("type", ""),
                          collection_id=request.args.get("collectionId", ""), scope=request.args.get("scope", "all"),
                          archived=request.args.get("archived") == "true", offset=_query_integer("offset", 0),
                          limit=_query_integer("limit", 24))

    @library_endpoint
    def post(self, *, user):
        body = _body()
        return {"item": save_source(user, body.get("source"), snapshotter=snapshot_source,
                                     collection_ids=body.get("collectionIds"), title=body.get("title"),
                                     description=body.get("description", ""), visibility=body.get("visibility", "private"),
                                     expected_metadata_version=body.get("expectedMetadataVersion"))}


@material_library_namespace.route("/items/<string:item_id>")
class LibraryItem(Resource):
    @library_endpoint
    def get(self, item_id, *, user):
        detail = item_detail(user, item_id, version=_query_integer("version"))
        from ...library_assets import render_snapshot_assets
        detail["previewPayload"] = render_snapshot_assets(detail["snapshot"]["payload"], item_id, detail["snapshot"]["version"])
        return {"item": detail}

    @library_endpoint
    def patch(self, item_id, *, user):
        return {"item": update_item(user, item_id, _body())}


@material_library_namespace.route("/imports")
class LibraryImports(Resource):
    @library_endpoint
    def post(self, *, user):
        return import_items(user, _body(), instantiator=instantiate_snapshot)


@material_library_namespace.route("/items/<string:item_id>/preview")
class LibraryPreview(Resource):
    @library_endpoint
    def get(self, item_id, *, user):
        return {"href": source_preview_href(user, item_for_user(user, item_id))}

    @library_endpoint
    def post(self, item_id, *, user):
        detail = item_detail(user, item_id, version=_body().get("version"))
        if detail["snapshot"]["payload"].get("kind") != "artifact":
            raise ValueError("该素材使用题目与配置预览，不需要三维播放器。")
        target = "/internal/library-preview?" + urlencode({"id": item_id, "version": detail["snapshot"]["version"]})
        token, expires = mint_launch_ticket(user, build_scope(user, role="teacher"), target=target)
        return {"launchUrl": config.AGENT_RUNTIME_PUBLIC_ORIGIN + "/api/integration/exchange?" + urlencode({"ticket": token}),
                "expires": expires.isoformat() + "Z"}


@material_library_namespace.route("/items/<string:item_id>/assets/<int:version>/<string:token>")
class LibrarySnapshotAsset(Resource):
    @authed_only
    def get(self, item_id, version, token):
        from ...library_assets import asset_response, snapshot_asset
        try:
            detail = item_detail(get_current_user(), item_id, version=version)
            found = snapshot_asset(detail["snapshot"]["payload"], token)
            if not found:
                raise ScopeError("素材附件不存在或无权访问。")
            entry, data = found
            return asset_response(data, entry["filename"], entry["mimeType"], entry["disposition"])
        except (ScopeError, ValueError):
            return {"success": False, "error": {"code": "NOT_FOUND", "message": "素材附件不存在或无权访问。"}}, 404


@material_library_namespace.route("/assets/<string:asset_id>")
class LibraryCopiedAsset(Resource):
    @authed_only
    def get(self, asset_id):
        from ...library_assets import asset_copy_for_viewer, asset_response
        try:
            row = asset_copy_for_viewer(get_current_user(), asset_id)
            return asset_response(row.data, row.filename, row.mime_type, row.disposition)
        except (ScopeError, ValueError):
            return {"success": False, "error": {"code": "NOT_FOUND", "message": "素材附件不存在或无权访问。"}}, 404

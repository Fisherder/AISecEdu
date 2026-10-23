import base64
import copy
import hashlib
import io
import json
import os
import pathlib
import re
import stat
from urllib.parse import urlsplit

from flask import has_request_context, request, send_file
from CTFd.models import db

from . import config
from .agent_runtime.scope import ScopeError, dojo_for_user
from .models import MaterialAssetCopies


MAX_ASSET_BYTES = 20 * 1024 * 1024
MAX_TOTAL_ASSET_BYTES = 40 * 1024 * 1024
MAX_ASSETS = 100
ASSET_PREFIX = "/pwncollege_api/v1/material-library/assets/"
TOKEN_PREFIX = "library-asset://"
_URL = re.compile(r"(?:https?://[^\s<>\"'()\\/]+)?/pwncollege_api/v1/(?:teaching/materials/[\w-]+/(?:preview|download)|teaching/jobs/[\w-]+/files/[\w-]+|material-library/assets/libasset_[0-9a-f]{32})(?![\w/-])(?:\?[^\s<>\"'()\\#]*)?")
_TOKEN = re.compile(r"library-asset://([0-9a-f]{64})")
_INLINE = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml", "application/pdf", "text/plain"}


def _same_origin(url):
    parsed = urlsplit(url)
    if not parsed.netloc:
        return True
    origins = [config.AGENT_RUNTIME_PUBLIC_ORIGIN]
    if has_request_context():
        origins.append(request.host_url)
    return (parsed.scheme, parsed.netloc) in {(urlsplit(origin).scheme, urlsplit(origin).netloc) for origin in origins if origin}


def _read_verified(path, size, digest):
    path = pathlib.Path(path)
    if path.is_symlink() or not path.is_file() or not isinstance(size, int) or not 0 < size <= MAX_ASSET_BYTES:
        raise ValueError("素材附件不可读取或超过单文件 20 MB 限制。")
    with path.open("rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise ValueError("素材附件必须是普通文件。")
        data = stream.read(MAX_ASSET_BYTES + 1)
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("素材附件与保存记录不一致，请重新上传后再入库。")
    return data


def _load_source_asset(user, url):
    from .api.v1.teaching import _job_for_user, _material_for_viewer, _material_original_filename, _material_source_path
    from .agent_runtime.files import agent_file_path, public_agent_file

    if not _same_origin(url):
        return None
    path = urlsplit(url).path
    if path.startswith(ASSET_PREFIX):
        row = asset_copy_for_viewer(user, path.removeprefix(ASSET_PREFIX))
        return {"data": bytes(row.data), "filename": row.filename, "mimeType": row.mime_type, "disposition": row.disposition}
    parts = path.split("/")
    if parts[4] == "materials":
        row = _material_for_viewer(parts[5], user)
        data = _read_verified(_material_source_path(row), row.size, row.sha256)
        return {"data": data, "filename": _material_original_filename(row), "mimeType": row.mime_type,
                "disposition": "inline" if parts[6] == "preview" else "attachment"}
    job = _job_for_user(parts[5], user)
    entry = next((value for value in (job.result or {}).get("files", []) if isinstance(value, dict) and value.get("id") == parts[7]), None)
    metadata = public_agent_file(entry)
    if not metadata:
        raise ScopeError("素材引用的生成文件不存在或无权读取。")
    return {"data": _read_verified(agent_file_path(entry), metadata["size"], metadata["sha256"]),
            "filename": metadata["filename"], "mimeType": metadata["mimeType"], "disposition": "attachment"}


def _asset_entry(value):
    data = value["data"]
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_ASSET_BYTES:
        raise ValueError("素材附件不可为空，且单文件不得超过 20 MB。")
    filename = str(value["filename"])
    if not filename or len(filename) > 240 or any(ord(char) < 32 for char in filename) or "/" in filename or "\\" in filename:
        raise ValueError("素材附件名称无效。")
    mime = str(value["mimeType"]).split(";")[0].strip().lower()
    if not re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", mime) or len(mime) > 160:
        raise ValueError("素材附件类型无效。")
    disposition = "inline" if value.get("disposition") == "inline" and mime in _INLINE else "attachment"
    digest = hashlib.sha256(data).hexdigest()
    identity = json.dumps([digest, filename, mime, disposition], ensure_ascii=False, separators=(",", ":"))
    token = hashlib.sha256(identity.encode()).hexdigest()
    return {"token": token, "filename": filename, "mimeType": mime, "disposition": disposition,
            "sha256": digest, "size": len(data), "base64": base64.b64encode(data).decode("ascii")}


def decode_asset(entry):
    if not isinstance(entry, dict) or not isinstance(entry.get("base64"), str) or len(entry["base64"]) > (MAX_ASSET_BYTES + 2) // 3 * 4:
        raise ValueError("素材附件快照无效。")
    try:
        data = base64.b64decode(entry["base64"], validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError("素材附件编码无效。") from exc
    normalized = _asset_entry({**entry, "data": data})
    if normalized != entry:
        raise ValueError("素材附件哈希或元数据不一致。")
    return data


def capture_asset_snapshot(user, payload, *, loader=None):
    load = loader or _load_source_asset
    entries, seen = {}, {}
    total = 0

    def replace(match):
        nonlocal total
        url = match.group(0)
        if url not in seen:
            value = load(user, url)
            if value is None:
                seen[url] = url
                return url
            entry = _asset_entry(value)
            if entry["token"] not in entries:
                total += entry["size"]
                if total > MAX_TOTAL_ASSET_BYTES or len(entries) >= MAX_ASSETS:
                    raise ValueError("素材附件总计不得超过 40 MB 或 100 个文件。")
                entries[entry["token"]] = entry
            seen[url] = TOKEN_PREFIX + entry["token"]
        return seen[url]

    def walk(value):
        if isinstance(value, dict):
            return {key: walk(item) for key, item in value.items()}
        if isinstance(value, list):
            return [walk(item) for item in value]
        return _URL.sub(replace, value) if isinstance(value, str) else value

    result = {key: copy.deepcopy(item) if key in {"dependencies", "libraryAssetSnapshot"} else walk(item) for key, item in payload.items()}
    if entries:
        if result.get("libraryAssetSnapshot"):
            raise ValueError("请从课程中的副本保存附件，不能覆盖已有附件快照。")
        result["libraryAssetSnapshot"] = list(entries.values())
    return result


def rewrite_asset_tokens(payload, resolve):
    entries = payload.get("libraryAssetSnapshot", [])
    if not isinstance(entries, list) or len(entries) > MAX_ASSETS:
        raise ValueError("素材附件清单无效。")
    urls, total = {}, 0
    for entry in entries:
        data = decode_asset(entry)
        total += len(data)
        if total > MAX_TOTAL_ASSET_BYTES or entry["token"] in urls:
            raise ValueError("素材附件清单超限或重复。")
        urls[entry["token"]] = resolve(entry, data)

    def replace(match):
        if match.group(1) not in urls:
            raise ValueError("素材引用了未保存的附件，不能创建不完整副本。")
        return urls[match.group(1)]

    def walk(value):
        if isinstance(value, dict):
            return {key: walk(item) for key, item in value.items()}
        if isinstance(value, list):
            return [walk(item) for item in value]
        return _TOKEN.sub(replace, value) if isinstance(value, str) else value
    return {key: copy.deepcopy(item) if key == "dependencies" else walk(item) for key, item in payload.items() if key != "libraryAssetSnapshot"}


def bind_asset_copies(user, dojo, kind, resource_id, payload):
    def resolve(entry, data):
        row = MaterialAssetCopies(owner_id=user.id, course_id=dojo.dojo_id, resource_kind=kind, resource_id=resource_id,
                                  token=entry["token"], filename=entry["filename"], mime_type=entry["mimeType"],
                                  disposition=entry["disposition"], sha256=entry["sha256"], data=data)
        db.session.add(row)
        db.session.flush()
        return ASSET_PREFIX + row.id
    return rewrite_asset_tokens(payload, resolve)


def render_snapshot_assets(payload, item_id, version):
    def resolve(entry, data):
        return f"/pwncollege_api/v1/material-library/items/{item_id}/assets/{version}/{entry['token']}"
    result = rewrite_asset_tokens(payload, resolve)
    if isinstance(result.get("dependencies"), dict):
        result["dependencies"] = {key: render_snapshot_assets(value, item_id, version) for key, value in result["dependencies"].items()}
    return result


def snapshot_asset(payload, token):
    for entry in payload.get("libraryAssetSnapshot", []):
        if entry.get("token") == token:
            return entry, decode_asset(entry)
    for dependency in (payload.get("dependencies") or {}).values():
        found = snapshot_asset(dependency, token)
        if found:
            return found
    return None


def asset_copy_for_viewer(user, asset_id):
    from .agent_runtime.artifacts import artifact_course_teacher, artifact_for_viewer, current_artifact_revision, _student_safe_content
    from .coursework import assignment_for_teacher, assignment_for_student, assignment_view
    from .learning.authoring import _public_spec
    from .models import DojoChallenges, LearningDrafts

    row = MaterialAssetCopies.query.filter_by(id=asset_id).first()
    if row is None:
        raise ScopeError("素材附件不存在或无权访问。")
    if row.resource_kind == "artifact":
        artifact = artifact_for_viewer(row.resource_id, user)
        teacher = artifact.owner_id == user.id or artifact_course_teacher(artifact, user)
        revision = current_artifact_revision(artifact)
        public = _student_safe_content(revision.content) if revision else {}
    elif row.resource_kind == "assignment":
        try:
            assignment_for_teacher(row.resource_id, user)
            teacher, public = True, {}
        except ScopeError:
            assignment = assignment_for_student(row.resource_id, user)
            teacher, public = False, assignment_view(assignment, user=user, teacher=False)
    elif row.resource_kind == "practice":
        draft = LearningDrafts.query.filter_by(id=row.resource_id, dojo_id=row.course_id).first()
        if draft is None:
            raise ScopeError("素材附件不存在或无权访问。")
        try:
            dojo_for_user(user, draft.dojo_id, teacher=True)
            teacher, public = True, {}
        except ScopeError:
            dojo_for_user(user, draft.dojo_id, teacher=False)
            challenge = DojoChallenges.query.filter_by(dojo_id=draft.dojo_id, module_index=draft.module_index,
                                                       challenge_id=draft.published_challenge_id).first()
            if not challenge or not challenge.visible():
                raise ScopeError("素材附件不存在或无权访问。")
            teacher, public = False, _public_spec(draft.spec)
    else:
        raise ScopeError("素材附件不存在或无权访问。")
    if not teacher and ASSET_PREFIX + row.id not in json.dumps(public, ensure_ascii=False):
        raise ScopeError("该附件未包含在学生可见的内容中。")
    if hashlib.sha256(row.data).hexdigest() != row.sha256:
        raise ValueError("素材附件内容校验失败。")
    return row


def asset_response(data, filename, mime_type, disposition):
    response = send_file(io.BytesIO(data), mimetype=mime_type, download_name=filename,
                         as_attachment=disposition != "inline" or mime_type not in _INLINE, conditional=True, max_age=0)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'"
    return response

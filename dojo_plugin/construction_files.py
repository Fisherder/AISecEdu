import copy
import mimetypes
import pathlib
import re
import unicodedata

from .library_assets import MAX_ASSET_BYTES, MAX_TOTAL_ASSET_BYTES, TOKEN_PREFIX, _asset_entry


MAX_SUBMISSION_FILES = 10
FILE_CONTENT_TYPE = 'file-package'
FILE_SCHEMA = 'construction-files/1'
FILE_CHECKS = ['文件可打开且内容完整', '来源与任务目标对应', '答案与评分依据齐全', '环境与复现步骤完整']


def file_limits():
    return {'maxFiles': MAX_SUBMISSION_FILES, 'maxFileBytes': MAX_ASSET_BYTES,
            'maxTotalBytes': MAX_TOTAL_ASSET_BYTES}


def submission_filename(value):
    leaf = unicodedata.normalize('NFC', str(value or '')).replace('\\', '/').split('/')[-1]
    leaf = re.sub(r'[\x00-\x1f\x7f<>:"|?*]', '_', leaf).strip(' .')
    if not leaf or len(leaf) > 240:
        raise ValueError('文件名称须包含 1–240 个字符。')
    return leaf


def file_snapshot(task, uploads):
    if not uploads or len(uploads) > MAX_SUBMISSION_FILES:
        raise ValueError('请选择 1–10 个成果文件。')
    entries, files, total, names = [], [], 0, set()
    for upload in uploads:
        filename = submission_filename(upload.filename)
        if filename.casefold() in names:
            raise ValueError('同次提交不能包含重名文件，请先重命名。')
        names.add(filename.casefold())
        raw = upload.stream.read(MAX_ASSET_BYTES + 1)
        if not raw or len(raw) > MAX_ASSET_BYTES:
            raise ValueError('成果文件不能为空，且单文件不得超过 20 MB。')
        total += len(raw)
        if total > MAX_TOTAL_ASSET_BYTES:
            raise ValueError('本次成果文件合计不得超过 40 MB。')
        suffix = pathlib.Path(filename).suffix.lower()
        mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        inline = suffix == '.pdf' and raw.startswith(b'%PDF-')
        entry = _asset_entry({'data': raw, 'filename': filename, 'mimeType': mime,
                              'disposition': 'inline' if inline else 'attachment'})
        entries.append(entry)
        files.append({'filename': filename, 'size': entry['size'], 'sha256': entry['sha256'],
                      'mimeType': entry['mimeType'], 'href': TOKEN_PREFIX + entry['token'],
                      'canPreview': inline})
    source = {'kind': 'file', 'files': [{k: f[k] for k in ('filename', 'size', 'sha256')} for f in files]}
    return source, {'type': FILE_CONTENT_TYPE, 'title': task.title,
                    'payload': {'schema': 'material-library/1', 'kind': 'artifact', 'type': FILE_CONTENT_TYPE,
                                'title': task.title, 'content': {'schema': FILE_SCHEMA, 'title': task.title,
                                                               'instructorNotes': {'files': files}},
                                'libraryAssetSnapshot': entries},
                    'provenance': copy.deepcopy(source)}


def artifact_files(artifact, revision, user):
    content = revision.content if revision else {}
    if not isinstance(content, dict) or content.get('schema') != FILE_SCHEMA:
        return None
    from .library_assets import ASSET_PREFIX, asset_copy_for_viewer
    from .agent_runtime.scope import ScopeError
    from .agent_runtime.artifacts import artifact_course_teacher
    teacher = artifact.owner_id == user.id or artifact_course_teacher(artifact, user)
    if not teacher:
        return []
    notes = content.get('instructorNotes') or {}
    if not isinstance(notes, dict):
        raise ValueError('成果文件清单无效。')
    files = notes.get('files', [])
    if not isinstance(files, list) or len(files) > MAX_SUBMISSION_FILES:
        raise ValueError('成果文件清单无效。')
    result = []
    for entry in files:
        href = entry.get('href', '') if isinstance(entry, dict) else ''
        if not isinstance(href, str) or not href.startswith(ASSET_PREFIX):
            raise ScopeError('成果文件不存在或无权访问。')
        row = asset_copy_for_viewer(user, href[len(ASSET_PREFIX):])
        if row.resource_id != artifact.id or row.resource_kind != 'artifact' or row.sha256 != entry.get('sha256'):
            raise ScopeError('成果文件与提交版本不一致。')
        result.append({**entry, 'href': href})
    return result

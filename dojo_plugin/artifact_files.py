MAX_SUBMISSION_FILES = 10
FILE_SCHEMAS = {'artifact-files/1', 'construction-files/1'}


def artifact_files(artifact, revision, user):
    content = revision.content if revision else {}
    if not isinstance(content, dict) or content.get('schema') not in FILE_SCHEMAS:
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

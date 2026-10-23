import hashlib
from pathlib import Path
import re

ROOT = Path('/var/agent-runtime/reference-materials')


def source_materials(draft):
    rows = (draft.spec or {}).get('referenceMaterials') or []
    if not isinstance(rows, list):
        return []
    result = []
    for row in rows:
        if not isinstance(row, dict) or not re.fullmatch('[0-9a-f]{64}', str(row.get('sha256') or '')):
            continue
        if not isinstance(row.get('size'), int) or not 0 < row['size'] <= 32 * 1024 * 1024:
            continue
        result.append({'name': str(row.get('name') or '课程资料'), 'sha256': row['sha256'], 'size': row['size'], 'mimeType': str(row.get('mimeType') or 'application/octet-stream'), 'url': f'/pwncollege_api/v1/learning/drafts/{draft.id}/source-materials/{len(result)}'})
    return result


def source_material_path(draft, index):
    rows = source_materials(draft)
    if index < 0 or index >= len(rows):
        raise ValueError('原始资料不存在')
    row = rows[index]
    digest = row['sha256']
    if not re.fullmatch('[0-9a-f]{64}', digest):
        raise ValueError('资料摘要无效')
    parent = ROOT / str(draft.dojo_id)
    path = parent / digest
    if parent.is_symlink() or path.is_symlink() or not path.is_file():
        raise ValueError('原始资料尚未就绪')
    if path.stat().st_size != row['size'] or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('原始资料完整性检查未通过')
    return path, row

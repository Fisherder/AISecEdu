import pathlib
import re

import yaml
from CTFd.models import db

from ..models import TeachingAgentSkills


SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REFERENCE_NAME = re.compile(r"^references/[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
MAX_NAME = 64
MAX_DESCRIPTION = 1000
MAX_INSTRUCTIONS_BYTES = 96_000
MAX_REFERENCE_BYTES = 64_000
MAX_REFERENCES = 12

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BUILTIN_SKILL_ROOTS = (
    REPO_ROOT / "agent_skills",
    pathlib.Path("/opt/pwn.college/agent_skills"),
)


def _clean(value, limit):
    return re.sub(r"\s+\Z", "", str(value or "").strip())[:limit]


def _byte_length(value):
    return len(str(value or "").encode("utf-8"))


def normalize_name(name):
    value = _clean(name, MAX_NAME)
    if not SKILL_NAME.match(value):
        raise ValueError("技能名只能使用小写字母、数字和短横线，例如 lesson-recap")
    return value


def normalize_references(raw):
    if raw in (None, "", []):
        return []
    if not isinstance(raw, list):
        raise ValueError("references 必须是列表")
    result = []
    total = 0
    for item in raw[:MAX_REFERENCES]:
        if not isinstance(item, dict):
            raise ValueError("references 每一项必须是 {path, content}")
        path = _clean(item.get("path"), 200)
        if not REFERENCE_NAME.match(path):
            raise ValueError("参考文件路径必须形如 references/xxx.md")
        content = str(item.get("content") or "")
        total += _byte_length(content)
        if total > MAX_REFERENCE_BYTES:
            raise ValueError("参考文件总长度超过 64 KB")
        result.append({"path": path, "content": content})
    return result


def parse_skill_text(text):
    match = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$", str(text or ""))
    if not match:
        raise ValueError("技能正文需要以 YAML front matter（--- name/description ---）开头")
    metadata = yaml.safe_load(match.group(1))
    if not isinstance(metadata, dict):
        raise ValueError("技能元数据必须是 YAML 对象")
    _invocation_policy(metadata)
    name = normalize_name(metadata.get("name"))
    description = _clean(metadata.get("description"), MAX_DESCRIPTION)
    if not description:
        raise ValueError("技能需要 description")
    body = match.group(2).strip()
    if not body:
        raise ValueError("技能正文不能为空")
    if _byte_length(body) > MAX_INSTRUCTIONS_BYTES:
        raise ValueError("技能正文超过 96 KB")
    return name, description, body


def _invocation_policy(metadata):
    disabled_for_model = metadata.get("disable-model-invocation", False)
    enabled_for_user = metadata.get("user-invocable", True)
    if not isinstance(disabled_for_model, bool) or not isinstance(enabled_for_user, bool):
        raise ValueError("技能调用策略必须是 true 或 false")
    return not disabled_for_model, enabled_for_user


def skill_invocation_from_markdown(text):
    match = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n", str(text or ""))
    if not match:
        raise ValueError("技能正文需要 YAML front matter")
    metadata = yaml.safe_load(match.group(1))
    if not isinstance(metadata, dict):
        raise ValueError("技能元数据必须是 YAML 对象")
    return _invocation_policy(metadata)


def _bool_policy(value, field, default=True):
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ValueError(f"{field} 必须是 true 或 false")
    return value


def skill_view(skill, *, include_instructions=True):
    data = {
        "name": skill.name,
        "description": skill.description,
        "source": skill.source,
        "origin": skill.origin,
        "enabled": bool(skill.enabled),
        "modelInvocable": bool(skill.model_invocable),
        "userInvocable": bool(skill.user_invocable),
        "version": skill.version,
        "referenceCount": len(skill.references or []),
        "updated": skill.updated.isoformat() + "Z" if skill.updated else None,
    }
    if include_instructions:
        data["instructions"] = skill.instructions
        data["references"] = [
            {"path": item.get("path"), "bytes": _byte_length(item.get("content"))}
            for item in (skill.references or [])
        ]
    return data


def owned_skill(user, name):
    skill = TeachingAgentSkills.query.filter_by(
        user_id=user.id, name=_clean(name, MAX_NAME)
    ).first()
    if skill is None:
        raise LookupError("技能不存在")
    return skill


def list_skills(user, *, include_disabled=True):
    query = TeachingAgentSkills.query.filter_by(user_id=user.id)
    if not include_disabled:
        query = query.filter_by(enabled=True)
    return query.order_by(TeachingAgentSkills.name).all()


def skill_summaries(user):
    return [
        {
            "name": skill.name,
            "description": skill.description,
            "source": skill.source,
            "enabled": bool(skill.enabled),
            "modelInvocable": bool(skill.model_invocable),
            "userInvocable": bool(skill.user_invocable),
            "version": int(skill.version or 1),
            "referenceCount": len(skill.references or []),
            "scope": "account",
        }
        for skill in list_skills(user, include_disabled=False)
    ]


def create_skill(user, *, name, description, instructions, references=None, source="user", origin=None, model_invocable=True, user_invocable=True, commit=True):
    normalized = normalize_name(name)
    if TeachingAgentSkills.query.filter_by(user_id=user.id, name=normalized).first():
        raise ValueError("你已经有一个同名技能，请改名或使用 skill.update")
    body = str(instructions or "").strip()
    if not body:
        raise ValueError("技能正文不能为空")
    if _byte_length(body) > MAX_INSTRUCTIONS_BYTES:
        raise ValueError("技能正文超过 96 KB")
    skill = TeachingAgentSkills(
        user_id=user.id,
        name=normalized,
        description=_clean(description, MAX_DESCRIPTION) or normalized,
        instructions=body,
        references=normalize_references(references),
        source=source,
        origin=origin,
        enabled=True,
        model_invocable=_bool_policy(model_invocable, "modelInvocable"),
        user_invocable=_bool_policy(user_invocable, "userInvocable"),
    )
    db.session.add(skill)
    db.session.commit() if commit else db.session.flush()
    return skill


def update_skill(user, name, *, description=None, instructions=None, references=None, enabled=None, model_invocable=None, user_invocable=None, commit=True):
    skill = owned_skill(user, name)
    if description is not None:
        value = _clean(description, MAX_DESCRIPTION)
        if not value:
            raise ValueError("description 不能为空")
        skill.description = value
    if instructions is not None:
        body = str(instructions).strip()
        if not body:
            raise ValueError("技能正文不能为空")
        if _byte_length(body) > MAX_INSTRUCTIONS_BYTES:
            raise ValueError("技能正文超过 96 KB")
        skill.instructions = body
    if references is not None:
        skill.references = normalize_references(references)
    if enabled is not None:
        skill.enabled = _bool_policy(enabled, "enabled")
    if model_invocable is not None:
        skill.model_invocable = _bool_policy(model_invocable, "modelInvocable")
    if user_invocable is not None:
        skill.user_invocable = _bool_policy(user_invocable, "userInvocable")
    skill.version = int(skill.version or 1) + 1
    db.session.commit() if commit else db.session.flush()
    return skill


def delete_skill(user, name, *, commit=True):
    skill = owned_skill(user, name)
    db.session.delete(skill)
    db.session.commit() if commit else db.session.flush()
    return skill


def builtin_roots():
    seen = []
    for root in BUILTIN_SKILL_ROOTS:
        resolved = pathlib.Path(root)
        if resolved.is_dir() and resolved not in seen:
            seen.append(resolved)
    return seen


def builtin_catalog():
    catalog = {}
    for root in builtin_roots():
        for directory in sorted(root.iterdir()):
            if not directory.is_dir() or not SKILL_NAME.match(directory.name):
                continue
            if directory.name in catalog:
                continue
            skill_file = directory / "SKILL.md"
            if not skill_file.is_file():
                continue
            try:
                raw_skill = skill_file.read_text(encoding="utf-8")
                name, description, _ = parse_skill_text(raw_skill)
                model_invocable, user_invocable = skill_invocation_from_markdown(raw_skill)
            except (ValueError, OSError, yaml.YAMLError):
                continue
            if name != directory.name:
                continue
            catalog[name] = {
                "name": name,
                "description": description,
                "source": "builtin",
                "modelInvocable": model_invocable,
                "userInvocable": user_invocable,
                "references": sorted(
                    item.name
                    for item in (directory / "references").glob("*.md")
                ) if (directory / "references").is_dir() else [],
            }
    return [catalog[name] for name in sorted(catalog)]


def builtin_skill(name):
    for root in builtin_roots():
        directory = root / _clean(name, MAX_NAME)
        skill_file = directory / "SKILL.md"
        if not skill_file.is_file():
            continue
        raw_skill = skill_file.read_text(encoding="utf-8")
        _, description, body = parse_skill_text(raw_skill)
        model_invocable, user_invocable = skill_invocation_from_markdown(raw_skill)
        references = []
        total = 0
        reference_root = directory / "references"
        if reference_root.is_dir():
            for item in sorted(reference_root.glob("*.md"))[:MAX_REFERENCES]:
                content = item.read_text(encoding="utf-8")
                if total + _byte_length(content) > MAX_REFERENCE_BYTES:
                    break
                total += _byte_length(content)
                references.append({"path": f"references/{item.name}", "content": content})
        return directory.name, description, body, references, model_invocable, user_invocable
    raise LookupError("内置技能不存在")


def import_builtin(user, name, *, commit=True):
    builtin_name, description, body, references, model_invocable, user_invocable = builtin_skill(name)
    existing = TeachingAgentSkills.query.filter_by(user_id=user.id, name=builtin_name).first()
    if existing:
        existing.description = description
        existing.instructions = body
        existing.references = references
        existing.source = "builtin"
        existing.origin = builtin_name
        existing.enabled = True
        existing.model_invocable = model_invocable
        existing.user_invocable = user_invocable
        existing.version = int(existing.version or 1) + 1
        db.session.commit() if commit else db.session.flush()
        return existing
    return create_skill(
        user,
        name=builtin_name,
        description=description,
        instructions=body,
        references=references,
        source="builtin",
        origin=builtin_name,
        model_invocable=model_invocable,
        user_invocable=user_invocable,
        commit=commit,
    )


def resolve_for_runtime(owner_id):
    return [
        {
            "name": skill.name,
            "description": skill.description,
            "instructions": skill.instructions,
            "references": skill.references or [],
            "modelInvocable": bool(skill.model_invocable),
            "userInvocable": bool(skill.user_invocable),
        }
        for skill in TeachingAgentSkills.query.filter_by(
            user_id=int(owner_id), enabled=True
        )
        .order_by(TeachingAgentSkills.name)
        .all()
    ]


def runtime_skill_catalog(owner_id):
    rows = (
        db.session.query(
            TeachingAgentSkills.name,
            TeachingAgentSkills.description,
            TeachingAgentSkills.model_invocable,
            TeachingAgentSkills.user_invocable,
            TeachingAgentSkills.version,
        )
        .filter_by(user_id=int(owner_id), enabled=True)
        .order_by(TeachingAgentSkills.name)
        .limit(64)
        .all()
    )
    return [
        {
            "name": row.name,
            "description": row.description,
            "modelInvocable": bool(row.model_invocable),
            "userInvocable": bool(row.user_invocable),
            "version": int(row.version or 1),
        }
        for row in rows
    ]


def _runtime_owned_skill(owner_id, name, audience):
    if audience not in ("model", "user"):
        raise ValueError("无效的技能调用方")
    normalized = normalize_name(name)
    skill = TeachingAgentSkills.query.filter_by(
        user_id=int(owner_id), name=normalized, enabled=True
    ).first()
    if skill is None:
        raise LookupError("技能不存在或已停用")
    if not (skill.model_invocable if audience == "model" else skill.user_invocable):
        raise LookupError("技能不允许当前调用方式")
    return skill


def runtime_skill_body(owner_id, name, audience="model"):
    skill = _runtime_owned_skill(owner_id, name, audience)
    return {
        "name": skill.name,
        "description": skill.description,
        "instructions": skill.instructions,
        "references": [
            {"path": item["path"], "bytes": _byte_length(item.get("content"))}
            for item in (skill.references or [])
            if isinstance(item, dict) and REFERENCE_NAME.match(str(item.get("path") or ""))
        ],
        "modelInvocable": bool(skill.model_invocable),
        "userInvocable": bool(skill.user_invocable),
        "version": int(skill.version or 1),
    }


def runtime_skill_resource(owner_id, name, path, audience="model"):
    if not REFERENCE_NAME.match(str(path or "")):
        raise ValueError("无效的技能参考文件路径")
    skill = _runtime_owned_skill(owner_id, name, audience)
    for item in skill.references or []:
        if isinstance(item, dict) and item.get("path") == path:
            return {
                "name": skill.name,
                "path": path,
                "content": str(item.get("content") or ""),
                "modelInvocable": bool(skill.model_invocable),
                "userInvocable": bool(skill.user_invocable),
                "version": int(skill.version or 1),
            }
    raise LookupError("技能参考文件不存在")

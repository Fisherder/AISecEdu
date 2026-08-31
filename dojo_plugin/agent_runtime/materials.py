import json
import re

from sqlalchemy import or_

from ..models import (
    TeachingMaterialChunks,
    TeachingMaterialRevisions,
    TeachingMaterials,
)


MATERIAL_ANALYSIS_VERSION = "complete-map-reduce-v1"
LEGACY_COMPLETE_ANALYSIS_LIMIT = 140_000
DEFAULT_EXCERPT_BUDGET = 80_000


class MaterialContextError(ValueError):
    pass


def _search_terms(value):
    text = str(value or "").lower()
    terms = {
        item
        for item in re.findall(r"[a-z0-9_+#.-]{3,}|[\u4e00-\u9fff]{2,12}", text)
        if len(item) >= 2
    }
    for run in re.findall(r"[\u4e00-\u9fff]{4,24}", text):
        for width in (2, 3, 4):
            terms.update(run[index : index + width] for index in range(len(run) - width + 1))
    return sorted(terms, key=len, reverse=True)[:160]


def course_material_grounding_requested(value):
    """Return whether a prompt explicitly asks to use course materials.

    A course-scoped conversation still needs its course/module identity, but it
    must not silently attach every historical handout to every chat turn.  The
    latter both bloats model context and can make an unrelated source document
    override an explicit teacher request.  Explicit attachment references are
    handled separately by callers; this predicate covers natural-language
    requests for the whole course material set.
    """

    text = str(value or "").strip()
    if not text:
        return False
    return bool(
        re.search(
            r"(?:根据|基于|结合|引用|使用|依照|围绕).{0,18}"
            r"(?:课件|资料|讲义|附件|教材|文档|上传文件)",
            text,
        )
        or re.search(
            r"(?:课件|资料|讲义|附件|教材|文档|上传文件).{0,18}"
            r"(?:内容|知识|生成|出题|题目|设计)",
            text,
        )
        or re.search(
            r"\b(?:based on|using|from)\b.{0,36}"
            r"\b(?:slides?|materials?|handouts?|attachments?|documents?)\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def _latest_revisions(material_ids):
    revisions = (
        TeachingMaterialRevisions.query.filter(
            TeachingMaterialRevisions.material_id.in_(material_ids)
        )
        .order_by(
            TeachingMaterialRevisions.material_id,
            TeachingMaterialRevisions.revision.desc(),
        )
        .all()
        if material_ids
        else []
    )
    latest = {}
    by_id = {}
    for revision in revisions:
        latest.setdefault(revision.material_id, revision)
        by_id[revision.id] = revision
    return latest, by_id


def _requested_revision(ref, material, latest, by_id):
    revision_id = str(ref.get("revisionId") or "") if isinstance(ref, dict) else ""
    revision = by_id.get(revision_id) if revision_id else latest.get(material.id)
    if revision is None or revision.material_id != material.id:
        return None
    expected_sha = str(ref.get("sha256") or "") if isinstance(ref, dict) else ""
    if expected_sha and expected_sha != revision.sha256:
        return None
    return revision


def _analysis_complete(analysis, total_characters, chunk_count):
    if not isinstance(analysis, dict) or not analysis or chunk_count <= 0:
        return False
    coverage = analysis.get("coverage")
    if isinstance(coverage, dict):
        try:
            extracted = int(coverage.get("extractedCharacters") or 0)
            analyzed = int(coverage.get("analyzedCharacters") or 0)
        except (TypeError, ValueError):
            return False
        return bool(
            coverage.get("complete") is True
            and extracted > 0
            and analyzed >= extracted
            and analyzed >= total_characters
            and str(coverage.get("analysisVersion") or "")
            == MATERIAL_ANALYSIS_VERSION
        )
    return total_characters <= LEGACY_COMPLETE_ANALYSIS_LIMIT


def _excerpt_rows(chunks, terms, budget):
    if not chunks or budget <= 0:
        return []
    scored = []
    last_index = len(chunks) - 1
    for index, chunk in enumerate(chunks):
        lowered = str(chunk.content or "").lower()
        score = sum(3 if term in lowered else 0 for term in terms)
        if index == 0:
            score += 2
        if index == last_index:
            score += 1
        scored.append((score, index, chunk))
    ordered = sorted(scored, key=lambda item: (-item[0], item[1]))
    selected = []
    remaining = budget
    for _score, _index, chunk in ordered:
        if remaining <= 0:
            break
        content = str(chunk.content or "")
        limit = min(5_000, remaining)
        if limit < 300 and selected:
            break
        excerpt = content[:limit]
        if not excerpt:
            continue
        selected.append(
            {
                "ordinal": chunk.ordinal,
                "sourceLocator": chunk.source_locator or {},
                "content": excerpt,
            }
        )
        remaining -= len(excerpt)
        if len(selected) >= 8:
            break
    return sorted(selected, key=lambda item: item["ordinal"])


def _material_refs(materials, revisions):
    refs = []
    for material in materials:
        revision = revisions.get(material.id)
        if revision is None:
            refs.append({"type": "material", "id": material.id})
            continue
        refs.append(
            {
                "type": "material",
                "id": material.id,
                "revisionId": revision.id,
                "sha256": revision.sha256,
            }
        )
    return refs


def build_course_material_context(
    *,
    owner_id,
    dojo_id,
    prompt="",
    source_refs=None,
    require_complete=False,
    excerpt_budget=DEFAULT_EXCERPT_BUDGET,
):
    explicit = {
        str(ref.get("id")): ref
        for ref in (source_refs or [])
        if isinstance(ref, dict)
        and ref.get("type") == "material"
        and ref.get("id")
    }
    explicit_ids = set(explicit)
    if dojo_id is None and not explicit_ids:
        return {
            "sourceRefs": [],
            "sourceMaterials": [],
            "coverage": {
                "policy": "conversation-attachments-v1",
                "required": bool(require_complete),
                "expectedMaterialCount": 0,
                "includedMaterialCount": 0,
                "complete": True,
                "incomplete": [],
            },
        }

    material_query = TeachingMaterials.query.filter(
        TeachingMaterials.owner_id == owner_id,
        or_(
            TeachingMaterials.status != "ARCHIVED",
            TeachingMaterials.status.is_(None),
        ),
    )
    if explicit_ids:
        material_query = material_query.filter(
            TeachingMaterials.id.in_(explicit_ids),
            or_(
                TeachingMaterials.dojo_id == dojo_id,
                TeachingMaterials.dojo_id.is_(None),
            ),
        )
    else:
        material_query = material_query.filter(TeachingMaterials.dojo_id == dojo_id)
    materials = material_query.order_by(
        TeachingMaterials.created, TeachingMaterials.id
    ).all()
    material_ids = [material.id for material in materials]
    missing_material_ids = sorted(explicit_ids.difference(material_ids))
    latest, by_id = _latest_revisions(material_ids)
    revisions = {
        material.id: _requested_revision(
            explicit.get(material.id) or {}, material, latest, by_id
        )
        for material in materials
    }
    revision_ids = [revision.id for revision in revisions.values() if revision]
    chunks_by_revision = {revision_id: [] for revision_id in revision_ids}
    if revision_ids:
        chunks = (
            TeachingMaterialChunks.query.filter(
                TeachingMaterialChunks.revision_id.in_(revision_ids)
            )
            .order_by(
                TeachingMaterialChunks.revision_id,
                TeachingMaterialChunks.ordinal,
            )
            .all()
        )
        for chunk in chunks:
            chunks_by_revision.setdefault(chunk.revision_id, []).append(chunk)

    terms = _search_terms(prompt)
    per_material_budget = max(
        600,
        int(excerpt_budget / max(1, len(materials))),
    )
    source_materials = []
    incomplete = [
        {
            "id": material_id,
            "title": f"附件 {material_id}",
            "status": "UNAVAILABLE",
            "reason": "material-not-found-or-not-accessible",
        }
        for material_id in missing_material_ids
    ]
    for material in materials:
        revision = revisions.get(material.id)
        if revision is None:
            incomplete.append(
                {
                    "id": material.id,
                    "title": material.title,
                    "status": material.status,
                    "reason": "missing-revision",
                }
            )
            continue
        chunks = chunks_by_revision.get(revision.id) or []
        total_characters = sum(len(str(chunk.content or "")) for chunk in chunks)
        analysis = (revision.metadata_json or {}).get("analysis") or {}
        ready = (
            material.status == "READY"
            and revision.status == "READY"
            and _analysis_complete(analysis, total_characters, len(chunks))
        )
        if not ready:
            incomplete.append(
                {
                    "id": material.id,
                    "title": material.title,
                    "status": material.status,
                    "analysisStatus": revision.status,
                    "reason": (
                        "analysis-incomplete"
                        if revision.status == "READY"
                        else "analysis-not-ready"
                    ),
                }
            )
            continue
        source_materials.append(
            {
                "id": material.id,
                "title": material.title,
                "filename": material.filename,
                "revisionId": revision.id,
                "revision": revision.revision,
                "sha256": revision.sha256,
                "analysis": analysis,
                "coverage": {
                    "chunkCount": len(chunks),
                    "totalCharacters": total_characters,
                    "complete": True,
                },
                "excerpts": _excerpt_rows(chunks, terms, per_material_budget),
            }
        )

    expected_material_count = len(explicit_ids) if explicit_ids else len(materials)
    complete = (
        len(source_materials) == expected_material_count and not incomplete
    )
    coverage = {
        "policy": (
            "conversation-attachments-v1"
            if explicit_ids
            else "all-course-materials-v1"
        ),
        "required": bool(require_complete),
        "expectedMaterialCount": expected_material_count,
        "includedMaterialCount": len(source_materials),
        "complete": complete,
        "incomplete": incomplete,
        "materialIds": sorted(explicit_ids) if explicit_ids else material_ids,
        "revisionIds": [
            revisions[material.id].id
            for material in materials
            if revisions.get(material.id) is not None
        ],
    }
    if require_complete and not complete:
        labels = "、".join(
            str(item.get("title") or item.get("id")) for item in incomplete[:5]
        )
        suffix = "等" if len(incomplete) > 5 else ""
        raise MaterialContextError(
            "为避免脱离教师课程资料生成，本次任务已停止："
            f"课程中有 {len(incomplete)} 份资料尚未完成全文解析（{labels}{suffix}）。"
            "请等待资料分析完成；若资料分析已失败，请重新分析后再运行任务。"
        )
    return {
        "sourceRefs": _material_refs(materials, revisions),
        "sourceMaterials": source_materials,
        "coverage": coverage,
    }


def compact_material_grounding(context, max_characters=120_000):
    sources = context.get("sourceMaterials") or []
    materials = []
    for source in sources:
        materials.append(
            {
                "id": source.get("id"),
                "title": source.get("title"),
                "filename": source.get("filename"),
                "revisionId": source.get("revisionId"),
                "sha256": source.get("sha256"),
                "analysis": source.get("analysis") or {},
                "coverage": source.get("coverage") or {},
                "excerpts": [],
            }
        )
    dossier = {
        "coverage": context.get("coverage") or {},
        "materials": materials,
    }
    serialized = json.dumps(dossier, ensure_ascii=False, separators=(",", ":"))
    if len(serialized) > max_characters:
        raise MaterialContextError(
            "课程资料的完整分析档案超过生成上下文上限。为避免只读取部分资料，本次任务已停止；"
            "请归档无关资料或拆分课程后重试。"
        )
    remaining = max_characters - len(serialized)
    excerpt_lists = [source.get("excerpts") or [] for source in sources]
    for excerpt_index in range(max((len(items) for items in excerpt_lists), default=0)):
        for material_index, excerpts in enumerate(excerpt_lists):
            if excerpt_index >= len(excerpts):
                continue
            excerpt = excerpts[excerpt_index]
            candidate = [*materials[material_index]["excerpts"], excerpt]
            extra = len(
                json.dumps(candidate, ensure_ascii=False, separators=(",", ":"))
            ) - len(
                json.dumps(
                    materials[material_index]["excerpts"],
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            )
            if extra > remaining:
                continue
            materials[material_index]["excerpts"] = candidate
            remaining -= extra
    return dossier

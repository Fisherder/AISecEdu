import json
import re

from ..agent_runtime.scope import dojo_for_user
from ..models import TeachingArtifactRevisions, TeachingArtifacts


MAX_GROUNDING_CHARACTERS = 118_000
MAX_GROUNDING_SOURCES = 12


def _terms(value):
    text = str(value or "").lower()
    return {
        item
        for item in re.findall(r"[a-z0-9_+#.-]{3,}|[\u4e00-\u9fff]{2,8}", text)
        if len(item) >= 2
    }


def _score_source(source, terms, module_index):
    score = 0
    if module_index is not None and source.get("moduleIndex") == module_index:
        score += 100
    title = str(source.get("title") or "").lower()
    content = str(source.get("text") or "").lower()
    score += sum(12 for term in terms if term in title)
    score += sum(2 for term in terms if term in content)
    if source.get("kind") == "course-resource":
        score += 4
    if source.get("kind") == "published-artifact":
        score += 3
    return score


def _source_material(source):
    text = str(source.get("text") or "").strip()
    source_id = str(source["id"])
    locator = source.get("sourceLocator") or {}
    return {
        "id": source_id,
        "title": str(source.get("title") or "课程内容"),
        "filename": str(source.get("filename") or source.get("title") or source_id),
        "revisionId": str(source.get("revisionId") or source_id),
        "sha256": str(source.get("contentHash") or "course-visible"),
        "analysis": {
            "summary": str(source.get("summary") or source.get("title") or "课程内容"),
            "sourceType": str(source.get("kind") or "course-content"),
            "courseVisible": True,
            "moduleIndex": source.get("moduleIndex"),
        },
        "coverage": {
            "chunkCount": 1,
            "totalCharacters": len(text),
            "complete": True,
        },
        "excerpts": [
            {
                "ordinal": 0,
                "sourceLocator": locator,
                "content": text,
            }
        ],
    }


def build_student_course_grounding(user, dojo_id, module_index=None, prompt=""):
    if dojo_id is None:
        coverage = {
            "policy": "student-visible-course-content-v1",
            "required": False,
            "expectedMaterialCount": 0,
            "includedMaterialCount": 0,
            "complete": True,
            "incomplete": [],
            "materialIds": [],
            "revisionIds": [],
        }
        return {
            "sourceRefs": [],
            "sourceMaterials": [],
            "materialContext": coverage,
            "materialDossier": {"coverage": coverage, "materials": []},
            "courseContext": None,
        }

    dojo = dojo_for_user(user, dojo_id, teacher=False)
    is_admin = getattr(user, "type", None) == "admin"
    visible_modules = [
        module
        for module in dojo.modules
        if (module_index is None or module.module_index == int(module_index))
        and (is_admin or module.visible())
    ]
    sources = []
    catalog = []
    for module in visible_modules:
        module_description = str(module.description or "").strip()
        if module_description:
            sources.append(
                {
                    "id": f"module:{dojo.dojo_id}:{module.module_index}",
                    "kind": "course-module",
                    "title": module.name or module.id,
                    "summary": "课程章节说明",
                    "moduleIndex": module.module_index,
                    "text": module_description,
                    "sourceLocator": {
                        "course": dojo.reference_id,
                        "module": module.id,
                    },
                }
            )
        for resource in module.resources:
            if not is_admin and not resource.visible:
                continue
            content = str(getattr(resource, "content", None) or "").strip()
            catalog.append(
                {
                    "kind": "resource",
                    "title": resource.name or "课程材料",
                    "type": resource.type or "resource",
                    "moduleIndex": module.module_index,
                }
            )
            if not content:
                continue
            sources.append(
                {
                    "id": (
                        f"resource:{dojo.dojo_id}:{module.module_index}:"
                        f"{resource.resource_index}"
                    ),
                    "kind": "course-resource",
                    "title": resource.name or "课程材料",
                    "summary": f"学生可见的{resource.type or '课程'}材料",
                    "moduleIndex": module.module_index,
                    "text": content,
                    "sourceLocator": {
                        "course": dojo.reference_id,
                        "module": module.id,
                        "resourceIndex": resource.resource_index,
                    },
                }
            )
        for challenge in module.visible_challenges():
            description = str(challenge.description or "").strip()
            catalog.append(
                {
                    "kind": "challenge",
                    "title": challenge.name or challenge.id,
                    "type": challenge.exercise_mode,
                    "moduleIndex": module.module_index,
                }
            )
            if not description:
                continue
            sources.append(
                {
                    "id": (
                        f"challenge:{dojo.dojo_id}:{module.module_index}:"
                        f"{challenge.challenge_index}"
                    ),
                    "kind": "published-challenge",
                    "title": challenge.name or challenge.id,
                    "summary": "学生可见的实践题说明",
                    "moduleIndex": module.module_index,
                    "text": description,
                    "sourceLocator": {
                        "course": dojo.reference_id,
                        "module": module.id,
                        "challenge": challenge.id,
                    },
                }
            )

    artifact_query = TeachingArtifacts.query.filter_by(
        dojo_id=dojo.dojo_id,
        status="PUBLISHED",
        self_workspace_id=None,
    )
    if module_index is not None:
        artifact_query = artifact_query.filter_by(module_index=int(module_index))
    artifacts = artifact_query.order_by(TeachingArtifacts.updated.desc()).limit(40).all()
    artifact_ids = [artifact.id for artifact in artifacts]
    revisions = (
        TeachingArtifactRevisions.query.filter(
            TeachingArtifactRevisions.artifact_id.in_(artifact_ids)
        )
        .order_by(
            TeachingArtifactRevisions.artifact_id,
            TeachingArtifactRevisions.revision.desc(),
        )
        .all()
        if artifact_ids
        else []
    )
    revisions_by_artifact = {}
    for revision in revisions:
        revisions_by_artifact.setdefault(revision.artifact_id, revision)
    for artifact in artifacts:
        revision = revisions_by_artifact.get(artifact.id)
        catalog.append(
            {
                "kind": "artifact",
                "title": artifact.title,
                "type": artifact.artifact_type,
                "moduleIndex": artifact.module_index,
            }
        )
        if revision is None or not isinstance(revision.content, dict) or not revision.content:
            continue
        sources.append(
            {
                "id": f"artifact:{artifact.id}:r{revision.revision}",
                "kind": "published-artifact",
                "title": artifact.title,
                "summary": f"已发布的{artifact.artifact_type}课程产物",
                "moduleIndex": artifact.module_index,
                "revisionId": revision.id,
                "contentHash": revision.content_hash,
                "text": json.dumps(revision.content, ensure_ascii=False, separators=(",", ":")),
                "sourceLocator": {
                    "artifactId": artifact.id,
                    "revision": revision.revision,
                },
            }
        )

    search_terms = _terms(prompt)
    sources.sort(
        key=lambda source: (
            -_score_source(source, search_terms, module_index),
            str(source.get("title") or ""),
        )
    )
    selected = []
    used_characters = 0
    for source in sources:
        material = _source_material(source)
        serialized = json.dumps(material, ensure_ascii=False, separators=(",", ":"))
        if len(serialized) + used_characters > MAX_GROUNDING_CHARACTERS:
            continue
        selected.append(material)
        used_characters += len(serialized)
        if len(selected) >= MAX_GROUNDING_SOURCES:
            break

    material_ids = [material["id"] for material in selected]
    revision_ids = [material["revisionId"] for material in selected]
    coverage = {
        "policy": "student-visible-relevant-course-content-v1",
        "required": False,
        "expectedMaterialCount": len(selected),
        "includedMaterialCount": len(selected),
        "complete": True,
        "incomplete": [],
        "materialIds": material_ids,
        "revisionIds": revision_ids,
        "availableSourceCount": len(sources),
        "selectedSourceCount": len(selected),
    }
    source_refs = [
        {
            "type": "course-content",
            "id": material["id"],
            "revisionId": material["revisionId"],
            "sha256": material["sha256"],
        }
        for material in selected
    ]
    return {
        "sourceRefs": source_refs,
        "sourceMaterials": selected,
        "materialContext": coverage,
        "materialDossier": {"coverage": coverage, "materials": selected},
        "courseContext": {
            "id": dojo.dojo_id,
            "referenceId": dojo.reference_id,
            "name": dojo.name,
            "moduleIndex": int(module_index) if module_index is not None else None,
            "visibleModules": [
                {
                    "index": module.module_index,
                    "id": module.id,
                    "name": module.name,
                    "description": module.description,
                }
                for module in visible_modules
            ],
            "catalog": catalog[:160],
        },
    }

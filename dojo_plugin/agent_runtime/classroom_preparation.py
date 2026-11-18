"""Admission checks for converting published, static native teaching slides."""

import re

from sqlalchemy import String, and_, case, cast, exists, or_
from sqlalchemy.orm import aliased

from CTFd.models import Users

from ..models import DojoAdmins, DojoUsers, TeachingAgentActions, TeachingArtifacts, TeachingArtifactRevisions, TeachingSessions
from .upstream_turn import ordinary_teaching_course


_STATIC_VISUALS = {"chart", "image", "comparison"}
_STATIC_ELEMENTS = {"text", "shape", "line", "image", "chart"}
_CONTENT_FIELDS = {"elements", "background", "speakerNotes", "remark", "layout", "studio"}
_UNSAFE_MARKUP = re.compile(
    r"<\s*/?\s*(?:script|iframe|object|embed|svg|link|meta|video|audio|form|input|img|style)\b"
    r"|(?:\s|<)on[a-z]+\s*=|javascript\s*:|@import\b|url\s*\(",
    re.I,
)
_RASTER_IMAGE = re.compile(r"data:image/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+")


def ordinary_static_lesson(content):
    lesson = content.get("lesson", content) if isinstance(content, dict) else None
    slides = lesson.get("artifacts") if isinstance(lesson, dict) else None
    if not isinstance(slides, list) or not 1 <= len(slides) <= 120:
        return None
    title = lesson.get("title")
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 160 or "subjectProfile" in lesson:
        return None
    identifiers = set()
    for slide in slides:
        if not isinstance(slide, dict) or slide.get("type") != "slide":
            return None
        if any(key in slide for key in ("actions", "interactive", "multiAgent", "runtime", "script")):
            return None
        outline = slide.get("outline")
        if not isinstance(outline, dict) or outline.get("type") != "slide":
            return None
        entry = slide.get("content")
        if not isinstance(entry, dict) or not set(entry).issubset(_CONTENT_FIELDS):
            return None
        studio = entry.get("studio")
        page = studio.get("page") if isinstance(studio, dict) else None
        visual = page.get("visual") if isinstance(page, dict) else None
        page_id = page.get("id") if isinstance(page, dict) else None
        if (
            not isinstance(page_id, str) or not page_id or page_id in identifiers
            or page.get("schema") != "courseware-page-v2"
            or page.get("beats", []) != [] or page.get("check") is not None
            or not isinstance(page.get("layout"), dict)
            or not isinstance(visual, dict) or visual.get("kind") not in _STATIC_VISUALS
        ):
            return None
        identifiers.add(page_id)
        assets = studio.get("assets", [])
        if not isinstance(assets, list) or any(
            not isinstance(asset, dict) or not isinstance(asset.get("src"), str)
            or not _RASTER_IMAGE.fullmatch(asset["src"]) for asset in assets
        ):
            return None
        if visual["kind"] == "image":
            if len(assets) != 1 or assets[0].get("id") != visual.get("assetId"):
                return None
        elif assets:
            return None
        elements = entry.get("elements", [])
        if not isinstance(elements, list) or any(not _static_element(element) for element in elements):
            return None
    return lesson


def _static_element(element):
    if not isinstance(element, dict) or element.get("type") not in _STATIC_ELEMENTS:
        return False
    if any(key in element for key in ("link", "href", "actions", "script", "html")):
        return False
    if element["type"] == "image":
        return isinstance(element.get("src"), str) and bool(_RASTER_IMAGE.fullmatch(element["src"]))
    if element["type"] == "text":
        return isinstance(element.get("content"), str) and not _UNSAFE_MARKUP.search(element["content"])
    return True


def displayed_image_pages(classroom_id, scenes):
    """Small catalogue saved with the renderer receipt, excluding image data."""
    result = []
    prefix = classroom_id + "-"
    for scene in scenes:
        scene_id, title = scene.get("id"), scene.get("title")
        if not isinstance(scene_id, str) or not scene_id.startswith(prefix) or not isinstance(title, str):
            continue
        images = [element for element in scene["content"]["canvas"]["elements"]
                  if isinstance(element, dict) and element.get("type") == "image"]
        if len(images) == 1 and images[0].get("id") == "verified-image":
            result.append({"pageId": scene_id[len(prefix):], "label": title[:160]})
    return result


def published_classroom_deck(owner_id, dojo_id, module_index, artifact_id, *, lock=False):
    """Return the current stored revision for an ordinary classroom, or None."""
    if not ordinary_teaching_course(dojo_id) or not isinstance(artifact_id, str) or not artifact_id:
        return None
    query = TeachingArtifacts.query.filter_by(
        id=artifact_id, owner_id=owner_id, dojo_id=dojo_id, module_index=module_index,
        artifact_type="slide-deck", status="PUBLISHED", self_workspace_id=None,
    )
    if lock:
        query = query.with_for_update().populate_existing()
    artifact = query.first()
    if artifact is None:
        return None
    revisions = TeachingArtifactRevisions.query.filter_by(
        artifact_id=artifact.id, revision=artifact.current_revision,
    )
    if lock:
        revisions = revisions.with_for_update().populate_existing()
    revision = revisions.first()
    if revision is None or ordinary_static_lesson(revision.content) is None:
        return None
    return artifact, revision


def _json_matches_integer(value, expected):
    # JSON receipt fields are stored text via ->> in PostgreSQL. Comparing as
    # text avoids casting malformed historical receipt values to integers.
    return cast(value.as_string(), String) == cast(expected, String)


def published_ordinary_sessions(dojo_id, module_index, *, include_ready=False):
    """Prepared classes still tied to their published deck and saved rendering."""
    session, action = TeachingSessions, TeachingAgentActions
    artifact, revision = TeachingArtifacts, TeachingArtifactRevisions
    request = action.request_json
    teacher_membership = DojoAdmins.query.filter(
        DojoAdmins.user_id == session.owner_id, DojoAdmins.dojo_id == dojo_id,
    ).exists()
    other = aliased(action)
    ambiguous_receipt = exists().where(and_(
        other.id != action.id, other.target_id == session.id,
        other.action_type == "prepare-ordinary-classroom",
        other.target_type == "teaching_session", other.status == "COMPLETED",
    ))
    learner_visible = and_(
        session.started.isnot(None),
        or_(session.status == "LIVE", and_(session.status == "ENDED", session.ended.isnot(None))),
    )
    available = or_(session.status.in_(("READY", "PAUSED")), learner_visible) if include_ready else learner_visible
    module_pin = (
        request["moduleIndex"].as_string().is_(None)
        if module_index is None
        else _json_matches_integer(request["moduleIndex"], module_index)
    )
    return (
        session.query
        .join(action, and_(action.target_id == session.id, action.actor_id == session.owner_id,
                           action.thread_id == session.thread_id))
        .join(artifact, artifact.id == request["artifactId"].as_string())
        .join(revision, and_(revision.artifact_id == artifact.id, revision.revision == artifact.current_revision))
        .join(Users, Users.id == session.owner_id)
        .filter(
            session.dojo_id == dojo_id, session.module_index == module_index,
            available,
            action.action_type == "prepare-ordinary-classroom", action.status == "COMPLETED",
            action.target_type == "teaching_session", action.result["sessionId"].as_string() == session.id,
            action.result["artifactId"].as_string() == artifact.id,
            _json_matches_integer(action.result["artifactRevision"], revision.revision), ~ambiguous_receipt,
            or_(Users.type == "admin", teacher_membership),
            artifact.owner_id == session.owner_id, artifact.dojo_id == dojo_id,
            artifact.module_index == module_index, artifact.artifact_type == "slide-deck",
            artifact.status == "PUBLISHED", artifact.self_workspace_id.is_(None),
            _json_matches_integer(request["dojoId"], dojo_id), module_pin,
            _json_matches_integer(request["expectedRevision"], revision.revision),
            request["contentHash"].as_string() == revision.content_hash,
            # Classroom runtime edits replace state and clear these pins. Do
            # not offer these sessions in the catalogue after such an edit.
            session.state["renderer"].as_string() == "agent-runtime-stage",
            session.state["artifactId"].as_string() == artifact.id,
            _json_matches_integer(session.state["artifactRevision"], revision.revision),
            session.state["artifactContentHash"].as_string() == revision.content_hash,
        )
    )


def student_module_classrooms(user, module, *, classroom_id=None):
    if not user or not ordinary_teaching_course(module.dojo_id) or not module.visible():
        return []
    if DojoUsers.query.filter_by(dojo_id=module.dojo_id, user_id=user.id).first() is None:
        return []
    query = published_ordinary_sessions(module.dojo_id, module.module_index).with_entities(
        TeachingSessions.id, TeachingSessions.title, TeachingSessions.status,
    )
    if classroom_id is not None:
        query = query.filter(TeachingSessions.id == classroom_id)
    return query.order_by((TeachingSessions.status == "LIVE").desc(), TeachingSessions.started.desc(), TeachingSessions.id).all()


def teacher_classroom_summaries(owner_id, dojo_id, module_index, *, preferred_id=None):
    """Read a bounded course/module selector without loading stored stage or scenes."""
    session = TeachingSessions
    query = session.query.filter_by(owner_id=owner_id, dojo_id=dojo_id, module_index=module_index)
    if preferred_id:
        query = query.order_by(case((session.id == preferred_id, 0), else_=1))
    rows = query.with_entities(
        session.id, session.title, session.status, session.dojo_id, session.module_index,
        session.started, session.ended, session.created, session.updated,
    ).order_by(session.updated.desc(), session.id).limit(100).all()
    ordinary_ids = set()
    if rows and ordinary_teaching_course(dojo_id):
        ordinary_ids = {
            item.id for item in published_ordinary_sessions(dojo_id, module_index, include_ready=True)
            .with_entities(session.id).filter(session.owner_id == owner_id, session.id.in_([row.id for row in rows]))
            .all()
        }
    return rows, ordinary_ids

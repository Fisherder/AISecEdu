"""Admission checks for converting published, static native teaching slides."""

import re

from ..models import TeachingArtifacts, TeachingArtifactRevisions
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

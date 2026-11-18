"""Resolve only verified raster illustrations from published ordinary classrooms."""

import base64
import binascii
import re

from ..agent_runtime.artifacts import content_hash
from ..agent_runtime.classroom_preparation import ordinary_static_lesson, published_classroom_deck, published_ordinary_sessions
from ..agent_runtime.upstream_turn import ordinary_teaching_course, teaching_image_enabled
from .guide_model_context import guide_teaching_text
from ..models import (
    DojoChallenges,
    DojoUsers,
    LearningAttempts,
    TeachingAgentActions,
    TeachingArtifactRevisions,
    TeachingSessions,
)


_CLASSROOM = re.compile(r"session_[a-f0-9]{32}")
_PAGE = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{0,47}")
_IMAGE_URL = re.compile(r"data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})")
_MAX_RASTER = 2 * 1024 * 1024
_MAX_CATALOG = 12
_DENIED = "这张教学插图已不可用，请重新选择。"


def _eligible_scope(user, attempt):
    if not teaching_image_enabled() or user is None or attempt is None:
        return None
    current = LearningAttempts.query.filter_by(
        id=attempt.id, user_id=user.id, status="ACTIVE",
    ).populate_existing().first()
    if current is None or not ordinary_teaching_course(current.dojo_id):
        return None
    if DojoUsers.query.filter_by(dojo_id=current.dojo_id, user_id=user.id).first() is None:
        return None
    challenge = DojoChallenges.query.filter_by(
        dojo_id=current.dojo_id, module_index=current.module_index, challenge_index=current.challenge_index,
    ).populate_existing().first()
    if (
        challenge is None or challenge.challenge_id != current.challenge_id
        or not challenge.module.visible() or not challenge.visible()
    ):
        return None
    return current.dojo_id, current.module_index


def _illustrated_sessions(dojo_id, module_index):
    request = TeachingAgentActions.request_json
    return published_ordinary_sessions(dojo_id, module_index).filter(
        request["ordinaryScenesHash"].as_string().isnot(None),
        request["ordinaryImagePages"][0]["pageId"].as_string().isnot(None),
    )


def _image_pages(value):
    if not isinstance(value, list):
        return {}
    pages = {}
    for record in value[:120]:
        if not isinstance(record, dict):
            continue
        page_id, label = record.get("pageId"), record.get("label")
        if not isinstance(page_id, str) or not _PAGE.fullmatch(page_id) or not isinstance(label, str):
            continue
        label = " ".join(label.split())
        if re.search(r"[<>@]|(?:https?|data|file|javascript):|//|教师备注|私有答案|学生姓名", label, re.I):
            continue
        visible_label = guide_teaching_text(label, 80)
        if visible_label and "[REDACTED]" not in visible_label:
            pages[page_id] = visible_label
    return pages


def available_tutor_illustrations(user, attempt):
    """List images in classes currently viewable by this learner's course cohort.

    A live or ended class does not establish which pages this learner has seen.
    """
    scope = _eligible_scope(user, attempt)
    if scope is None:
        return []
    rows = (
        _illustrated_sessions(*scope)
        .with_entities(
            TeachingSessions.id, TeachingArtifactRevisions.revision,
            TeachingAgentActions.request_json["ordinaryImagePages"],
        )
        .order_by(TeachingSessions.updated.desc(), TeachingSessions.id.desc())
        .limit(_MAX_CATALOG)
        .all()
    )
    options = []
    for classroom_id, revision, candidates in rows:
        if not _CLASSROOM.fullmatch(classroom_id):
            continue
        options.extend(
            {"classroomId": classroom_id, "revision": revision, "pageId": page_id, "label": label}
            for page_id, label in _image_pages(candidates).items()
        )
    return options[:_MAX_CATALOG]


def _data_image(source):
    if not isinstance(source, str) or len(source) > (_MAX_RASTER + 2) // 3 * 4 + 32:
        return None
    match = _IMAGE_URL.fullmatch(source)
    if not match:
        return None
    media_type, encoded = match.groups()
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        return None
    if len(data) > _MAX_RASTER or base64.b64encode(data).decode("ascii") != encoded:
        return None
    matches_format = {
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
    }
    return {"mediaType": media_type, "data": encoded} if matches_format[media_type] else None


def _pinned_image(session, receipt, revision, page_id):
    state = session.state if isinstance(session.state, dict) else {}
    if (
        state.get("renderer") != "agent-runtime-stage" or state.get("artifactId") != receipt.get("artifactId")
        or state.get("artifactRevision") != revision.revision or state.get("artifactContentHash") != revision.content_hash
    ):
        return None
    scenes = state.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 120:
        return None
    if content_hash(scenes) != receipt.get("ordinaryScenesHash"):
        return None
    if content_hash(revision.content) != revision.content_hash:
        return None
    lesson = ordinary_static_lesson(revision.content)
    if lesson is None or len(scenes) != len(lesson["artifacts"]):
        return None
    matches = [
        artifact["content"]["studio"] for artifact in lesson["artifacts"]
        if artifact["content"]["studio"]["page"]["id"] == page_id
    ]
    if len(matches) != 1:
        return None
    studio = matches[0]
    visual = studio["page"]["visual"]
    assets = studio.get("assets") or []
    if visual["kind"] != "image" or len(assets) != 1 or assets[0].get("id") != visual.get("assetId"):
        return None

    scene_id = f"{session.id}-{page_id}"
    matched = [scene for scene in scenes if isinstance(scene, dict) and scene.get("id") == scene_id]
    if len(matched) != 1:
        return None
    scene = matched[0]
    content = scene.get("content")
    if (
        scene.get("type") != "slide" or scene.get("stageId") != session.id or scene.get("actions")
        or scene.get("multiAgent") or not isinstance(content, dict) or content.get("type") != "slide"
    ):
        return None
    canvas = content.get("canvas")
    elements = canvas.get("elements") if isinstance(canvas, dict) and canvas.get("id") == scene_id else None
    if not isinstance(elements, list):
        return None
    images = [item for item in elements if isinstance(item, dict) and item.get("type") == "image"]
    if len(images) != 1 or images[0].get("id") != "verified-image":
        return None
    image = images[0]
    if image.get("hidden") or image.get("opacity", 1) == 0 or any(
        type(image.get(key)) not in (int, float) or image[key] <= 0 for key in ("width", "height")
    ):
        return None
    # The signed scene binds the adapter's output. Its canonical format need not
    # match the source asset's media type.
    return _data_image(image.get("src"))


def resolve_tutor_illustration(user, attempt, selection):
    if not isinstance(selection, dict) or set(selection) != {"classroomId", "revision", "pageId", "consent"}:
        raise ValueError("请明确选择一张已发布的教学插图并确认本轮发送。")
    classroom_id, revision_number, page_id = selection["classroomId"], selection["revision"], selection["pageId"]
    if (
        selection["consent"] is not True or not isinstance(classroom_id, str) or not _CLASSROOM.fullmatch(classroom_id)
        or type(revision_number) is not int or revision_number < 1
        or not isinstance(page_id, str) or not _PAGE.fullmatch(page_id)
    ):
        raise ValueError("教学插图的选择或本轮确认无效。")
    scope = _eligible_scope(user, attempt)
    if scope is None:
        raise PermissionError(_DENIED)
    row = (
        _illustrated_sessions(*scope)
        .with_entities(TeachingSessions, TeachingAgentActions.request_json)
        .filter(TeachingSessions.id == classroom_id, TeachingArtifactRevisions.revision == revision_number)
        .populate_existing().first()
    )
    if row is None:
        raise PermissionError(_DENIED)
    session, receipt = row
    if page_id not in _image_pages(receipt.get("ordinaryImagePages")):
        raise PermissionError(_DENIED)
    deck = published_classroom_deck(session.owner_id, *scope, receipt["artifactId"])
    if deck is None or (deck[1].revision, deck[1].content_hash) != (revision_number, receipt.get("contentHash")):
        raise PermissionError(_DENIED)
    image = _pinned_image(session, receipt, deck[1], page_id)
    if image is None:
        raise PermissionError(_DENIED)
    return image

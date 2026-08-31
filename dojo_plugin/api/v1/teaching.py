import csv
import datetime
import hashlib
import io
import json
import logging
import mimetypes
import os
import pathlib
import re
import secrets
import shutil
import uuid
import zipfile
from urllib.parse import quote, urlencode

import requests
from flask import request, send_file
from flask_restx import Namespace, Resource
from sqlalchemy import case, func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import load_only, selectinload
from werkzeug.utils import secure_filename

from CTFd.cache import cache, clear_challenges, clear_standings
from CTFd.models import Challenges, Solves, Users, db
from CTFd.plugins import bypass_csrf_protection
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ... import config
from ...course_codes import (
    course_join_code,
    ensure_course_join_code,
    format_course_code,
)
from ...coursework import (
    assignment_view,
    close_assignment,
    create_assignment,
    delete_assignment,
    generate_assignment_payload,
    override_submission_grade,
    publish_assignment,
    roster_submissions,
    update_assignment,
)
from ...models import (
    ConversationCards,
    DojoAdmins,
    DojoChallenges,
    DojoMembers,
    DojoModules,
    DojoResources,
    DojoUsers,
    Dojos,
    LearningAssessments,
    LearningAuditEvents,
    LearningAuthoringJobs,
    LearningChallengeProfiles,
    LearningAttempts,
    LearningDrafts,
    LearningEvidenceEvents,
    LearningSkillStates,
    ModelInvocations,
    ObjectiveMappings,
    SelfLearningWorkspaces,
    TeachingAgentActions,
    TeachingAgentApprovals,
    TeachingAgentMessages,
    TeachingAgentThreads,
    TeachingAssignments,
    TeachingArtifactCandidates,
    TeachingArtifactRevisions,
    TeachingArtifacts,
    TeachingCandidateSets,
    TeachingGenerationBatchItems,
    TeachingGenerationBatches,
    TeachingJobs,
    TeachingMaterialChunks,
    TeachingMaterialRevisions,
    TeachingMaterials,
    TeachingSessionEvents,
    TeachingSessions,
)
from ...agent_runtime.artifacts import (
    RevisionConflict,
    add_card,
    artifact_capabilities,
    artifact_for_user,
    artifact_for_viewer,
    artifact_view,
    candidate_request_prompt,
    candidate_set_view,
    content_hash,
    create_candidate_set,
    create_revision,
    materialize_candidate,
    revision_view,
    select_candidate,
)
from ...agent_runtime.auth import (
    AgentRuntimeAuthError,
    bearer_session_token,
    exchange_launch_ticket,
    mint_launch_ticket,
    require_service_auth,
    verify_session_token,
)
from ...agent_runtime.files import agent_file_path, public_agent_file
from ...agent_runtime.jobs import (
    AGENT_TOOL_SCHEMAS,
    _job_failure_message,
    _sync_parent_generation_state,
    cancel_job,
    dismiss_job_from_task_list,
    enqueue_job,
    job_events_view,
    job_view,
    publish_pending_outbox,
    retry_job,
    validated_generation_options,
)
from ...agent_runtime.materials import (
    build_course_material_context,
    compact_material_grounding,
    course_material_grounding_requested,
)
from ...agent_runtime.scope import (
    ScopeError,
    assert_capability,
    build_scope,
    dojo_for_user,
    owner_or_teacher,
)
from ...learning.evidence import append_evidence, redact_text, scrub_payload
from ...learning.analytics import (
    build_course_learning_analytics,
    learning_intervention_snapshot,
)
from ...learning.exercise_modes import exercise_mode, is_supported_exercise
from ...learning.grounding import build_student_course_grounding
from ...utils.request_logging import get_trace_id


teaching_namespace = Namespace(
    "teaching",
    description="玄甲 global-agent teaching and self-learning services",
)
logger = logging.getLogger(__name__)

MAX_MESSAGE_CHARS = 16000
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_SESSION_EVENT_BYTES = 64 * 1024
MAX_LESSON_BYTES = 8 * 1024 * 1024
MAX_LESSON_ARTIFACTS = 200
MAX_AGENT_CONTEXT_BYTES = 64 * 1024
MAX_AGENT_LOOP_STEPS = 6
MAX_CLASSROOM_BYTES = 8 * 1024 * 1024
MAX_CLASSROOM_SCENES = 200
QUESTION_ARTIFACT_TYPES = {
    "assessment",
    "challenge",
    "knowledge-test",
    "question-set",
    "quiz",
}
COMPLEX_ARTIFACT_TYPES = {
    "attack-defense-scene",
    "debate",
    "roleplay",
    "simulation",
    "vulnerable-lab",
}
SELF_LEARNING_ARTIFACT_TYPES = {
    "learning-path",
    "slide-deck",
    "attack-defense-scene",
    "simulation",
    "quiz",
    "debate",
}
GENERATION_OPTION_ARTIFACT_TYPES = {
    "slide-deck",
    "attack-defense-scene",
    "simulation",
    "debate",
    "roleplay",
}
COURSE_DEMO_ARTIFACT_TYPES = {
    "attack-defense-scene",
    "classroom-scenario",
    "simulation",
}
CONTENT_STATE_ALIASES = {
    "PENDING": "draft",
    "PLANNED": "draft",
    "DRAFT": "draft",
    "BUILDING": "generating",
    "GENERATING": "generating",
    "QUEUED": "queued",
    "RUNNING": "generating",
    "VALIDATING": "validating",
    "VALIDATED": "needs_review",
    "READY": "needs_review",
    "NEEDS_REVIEW": "needs_review",
    "PUBLISHED": "published",
    "SUCCEEDED": "needs_review",
    "PARTIAL": "partial_success",
    "PARTIAL_SUCCESS": "partial_success",
    "FAILED": "failed",
    "VALIDATION_FAILED": "failed",
    "BLOCKED": "failed",
    "REJECTED": "failed",
    "CANCELED": "cancelled",
    "CANCELLED": "cancelled",
    "ARCHIVED": "archived",
    "DELETED": "deleted",
}
ATTENTION_CONTENT_STATES = frozenset(
    {"needs_review", "partial_success", "failed"}
)
ALLOWED_MIME_PREFIXES = (
    "application/pdf",
    "application/msword",
    "application/octet-stream",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-powerpoint",
    "text/",
    "image/",
)
ALLOWED_MATERIAL_SUFFIXES = {
    ".doc",
    ".docx",
    ".jpeg",
    ".jpg",
    ".md",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".txt",
    ".webp",
}
AGENT_RUNTIME_TARGETS = {
    "teacher": re.compile(
        r"^/(?:prep(?:/[A-Za-z0-9_-]+)?|classroom(?:/[A-Za-z0-9_-]+)?)?/?$"
    ),
    "student": re.compile(
        r"^/(?:security-learn|prep/[A-Za-z0-9_-]+|classroom/[A-Za-z0-9_-]+)?/?$"
    ),
}


class LessonPayloadTooLarge(ValueError):
    pass


class GenerationOptionConflict(ValueError):
    pass


class DemoOrderError(ValueError):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


class ArtifactBulkDeleteError(ValueError):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def _body():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def _ok(data=None, status=200):
    return {"success": True, "data": data or {}}, status


def _error(message, status=400, *, code="INVALID_REQUEST"):
    return {
        "success": False,
        "errorCode": code,
        "errors": [str(message)],
    }, status


@teaching_namespace.errorhandler(ScopeError)
def _handle_scope_error(error):
    return {
        "success": False,
        "errorCode": "FORBIDDEN",
        "errors": [str(error)],
    }, 403


def _timestamp(value):
    return value.isoformat() + "Z" if value else None


def _json_size(value):
    return len(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    )


def _thread_attachment_entries(thread):
    context = thread.context if isinstance(thread.context, dict) else {}
    raw_entries = context.get("pendingAttachments")
    if not isinstance(raw_entries, list):
        return []
    return [
        dict(item)
        for item in raw_entries[-20:]
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    ]


def _material_original_filename(material):
    metadata = material.metadata_json if isinstance(material.metadata_json, dict) else {}
    original = str(metadata.get("originalFilename") or "").strip()
    original = re.split(r"[/\\]", original)[-1]
    original = re.sub(r"[\x00-\x1f\x7f]", "", original).strip()[:240]
    return original or material.filename


def _lock_material_digest(owner_id, digest):
    if db.engine.dialect.name != "postgresql":
        return
    lock_key = int.from_bytes(
        hashlib.sha256(f"{owner_id}:{digest}".encode()).digest()[:8],
        "big",
        signed=True,
    )
    db.session.execute(
        text("SELECT pg_advisory_xact_lock(:lock_key)"),
        {"lock_key": lock_key},
    )


def _material_attachment_view(material, *, entry=None, revision=None, job=None):
    entry = entry if isinstance(entry, dict) else {}
    owner = getattr(material, "owner", None)
    return {
        "id": material.id,
        "dojoId": material.dojo_id,
        "title": material.title,
        "filename": _material_original_filename(material),
        "mimeType": material.mime_type,
        "size": material.size,
        "status": material.status,
        "analysisStatus": revision.status if revision is not None else None,
        "intentStatus": entry.get("status"),
        "analysisJobId": entry.get("analysisJobId") or (job.id if job else None),
        "placement": entry.get("placement"),
        "ownerName": str(getattr(owner, "name", None) or "课程教师"),
        "created": _timestamp(material.created),
        "updated": _timestamp(material.updated),
        "downloadUrl": (
            f"/pwncollege_api/v1/teaching/materials/{material.id}/download"
        ),
        "previewUrl": (
            f"/pwncollege_api/v1/teaching/materials/{material.id}/preview"
        ),
        "previewMode": _material_preview_mode(material),
    }


def _material_preview_mode(material):
    """Return the safe browser preview mode for an uploaded course material."""

    mime_type = str(material.mime_type or "").split(";", 1)[0].strip().lower()
    if not mime_type:
        mime_type = str(mimetypes.guess_type(_material_original_filename(material))[0] or "")
    if mime_type == "application/pdf":
        return "pdf"
    if mime_type in {
        "image/avif",
        "image/bmp",
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        return "image"
    if mime_type.startswith("audio/"):
        return "audio"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("text/") or mime_type in {
        "application/json",
        "application/xml",
        "application/yaml",
        "application/x-yaml",
    }:
        return "text"
    return "extracted"


def _artifact_list_views(artifacts, user=None):
    """Return useful list metadata without sending complete private revisions."""
    artifacts = list(artifacts or [])
    if not artifacts:
        return []
    artifact_ids = [item.id for item in artifacts]
    revisions = (
        TeachingArtifactRevisions.query.filter(
            TeachingArtifactRevisions.artifact_id.in_(artifact_ids)
        )
        .order_by(
            TeachingArtifactRevisions.artifact_id,
            TeachingArtifactRevisions.revision.desc(),
        )
        .all()
    )
    latest = {}
    for revision in revisions:
        latest.setdefault(revision.artifact_id, revision)
    owner_ids = {item.owner_id for item in artifacts if item.owner_id is not None}
    owner_names = (
        {
            row.id: str(row.name or "课程教师")
            for row in Users.query.filter(Users.id.in_(owner_ids)).all()
        }
        if owner_ids
        else {}
    )

    def first_text(value):
        if isinstance(value, list):
            for item in value:
                text_value = first_text(item)
                if text_value:
                    return text_value
            return ""
        if isinstance(value, dict):
            for key in ("title", "name", "goal", "objective", "description", "text"):
                text_value = str(value.get(key) or "").strip()
                if text_value:
                    return text_value
            return ""
        return str(value or "").strip()

    rows = []
    for artifact in artifacts:
        data = artifact_view(artifact, include_content=False)
        revision = latest.get(artifact.id)
        content = revision.content if revision and isinstance(revision.content, dict) else {}
        experience = (
            content.get("experience")
            if isinstance(content.get("experience"), dict)
            else {}
        )
        objectives = content.get("objectives") or content.get("learningObjectives") or []
        objective = first_text(objectives)
        if not objective:
            objective = first_text(content.get("summary") or content.get("description"))
        duration = (
            content.get("durationMinutes")
            or content.get("estimatedDurationMinutes")
            or experience.get("durationMinutes")
            or experience.get("estimatedDurationMinutes")
        )
        try:
            duration = max(1, min(1440, int(duration))) if duration is not None else None
        except (TypeError, ValueError):
            duration = None
        source_refs = list(revision.source_refs or []) if revision else []
        material_count = sum(
            1
            for source in source_refs
            if isinstance(source, dict) and source.get("type") == "material"
        )
        artifact_count = sum(
            1
            for source in source_refs
            if isinstance(source, dict) and source.get("type") == "artifact"
        )
        data.update(
            {
                "state": _content_state(
                    artifact.status,
                    revision.validation if revision else None,
                ),
                "objective": objective[:360],
                "durationMinutes": duration,
                "ownerName": owner_names.get(artifact.owner_id, "课程教师"),
                "canEdit": (
                    artifact.owner_id == user.id
                    and artifact.status not in {"ARCHIVED", "DELETED"}
                    if user is not None
                    else None
                ),
                "studentAvailable": artifact.status == "PUBLISHED",
                "sourceSummary": {
                    "count": len(source_refs),
                    "materialCount": material_count,
                    "artifactCount": artifact_count,
                    "label": (
                        f"来自 {material_count} 份课程资料"
                        if material_count
                        else "直接创建"
                    ),
                },
            }
        )
        rows.append(data)
    return rows


def _material_lineage_impact(material):
    artifacts = (
        TeachingArtifacts.query.filter_by(dojo_id=material.dojo_id)
        .filter(TeachingArtifacts.status != "ARCHIVED")
        .all()
        if material.dojo_id is not None
        else []
    )
    if not artifacts:
        return {"affectedCount": 0, "publishedCount": 0, "artifacts": []}
    by_id = {item.id: item for item in artifacts}
    revisions = TeachingArtifactRevisions.query.filter(
        TeachingArtifactRevisions.artifact_id.in_(by_id)
    ).all()
    affected_ids = set()
    for revision in revisions:
        for source in revision.source_refs or []:
            if not isinstance(source, dict):
                continue
            source_id = str(source.get("id") or source.get("materialId") or "")
            if source.get("type") == "material" and source_id == material.id:
                affected_ids.add(revision.artifact_id)
    affected = [by_id[item_id] for item_id in affected_ids if item_id in by_id]
    affected.sort(key=lambda item: item.updated or item.created, reverse=True)
    return {
        "affectedCount": len(affected),
        "publishedCount": sum(item.status == "PUBLISHED" for item in affected),
        "artifacts": [
            {
                "id": item.id,
                "title": item.title,
                "type": item.artifact_type,
                "status": item.status,
                "currentRevision": item.current_revision,
            }
            for item in affected[:20]
        ],
    }


def _material_jobs(owner_id, material_ids, *, active_only=False):
    material_ids = {str(item) for item in material_ids if str(item or "").strip()}
    if not material_ids:
        return {}
    query = TeachingJobs.query.filter_by(owner_id=owner_id, kind="material.analyze")
    if active_only:
        query = query.filter(
            TeachingJobs.status.in_(("QUEUED", "RUNNING", "CANCEL_REQUESTED"))
        )
    rows = query.order_by(TeachingJobs.created.desc()).limit(500).all()
    result = {}
    for row in rows:
        material_id = str((row.payload or {}).get("materialId") or "")
        if material_id in material_ids and material_id not in result:
            result[material_id] = row
    return result


def _thread_attachment_views(thread, user):
    entries = _thread_attachment_entries(thread)
    ids = [str(item["id"]) for item in entries]
    if not ids:
        return []
    materials = TeachingMaterials.query.filter(
        TeachingMaterials.id.in_(ids),
        TeachingMaterials.owner_id == user.id,
        TeachingMaterials.status != "ARCHIVED",
    ).all()
    by_id = {material.id: material for material in materials}
    revisions = (
        TeachingMaterialRevisions.query.filter(
            TeachingMaterialRevisions.material_id.in_(ids)
        )
        .order_by(
            TeachingMaterialRevisions.material_id,
            TeachingMaterialRevisions.revision.desc(),
        )
        .all()
    )
    latest = {}
    for revision in revisions:
        latest.setdefault(revision.material_id, revision)
    jobs = _material_jobs(user.id, ids)
    return [
        _material_attachment_view(
            by_id[str(entry["id"])],
            entry=entry,
            revision=latest.get(str(entry["id"])),
            job=jobs.get(str(entry["id"])),
        )
        for entry in entries
        if str(entry["id"]) in by_id
    ]


def _remember_thread_attachment(thread, material, job, *, status):
    entries = [
        item
        for item in _thread_attachment_entries(thread)
        if str(item.get("id")) != material.id
    ]
    entries.append(
        {
            "id": material.id,
            "status": status,
            "analysisJobId": job.id if job is not None else None,
            "uploadedAt": _timestamp(datetime.datetime.utcnow()),
        }
    )
    context = {**(thread.context or {}), "pendingAttachments": entries[-20:]}
    if _json_size(context) > MAX_AGENT_CONTEXT_BYTES:
        raise ValueError("Thread attachment context exceeds 64 KiB")
    thread.context = context


def _mark_thread_attachments_referenced(thread, material_ids, message_id):
    material_ids = {str(item) for item in material_ids}
    changed = False
    entries = []
    for raw in _thread_attachment_entries(thread):
        item = dict(raw)
        if str(item.get("id")) in material_ids and item.get("status") in {
            "AWAITING_INTENT",
            "ACTIVE",
            "REFERENCED",
        }:
            item["status"] = "ACTIVE"
            item["messageId"] = message_id
            item["referencedAt"] = _timestamp(datetime.datetime.utcnow())
            changed = True
        entries.append(item)
    if changed:
        thread.context = {**(thread.context or {}), "pendingAttachments": entries}


def _mark_thread_attachment_placed(thread, material_id, placement):
    entries = []
    for raw in _thread_attachment_entries(thread):
        item = dict(raw)
        if str(item.get("id")) == str(material_id):
            item["status"] = "PLACED"
            item["placement"] = placement
            item["resolvedAt"] = _timestamp(datetime.datetime.utcnow())
        entries.append(item)
    thread.context = {**(thread.context or {}), "pendingAttachments": entries}


def _mark_thread_attachments_consumed(thread, material_ids, *, operation, job_id=None):
    material_ids = {str(item) for item in material_ids if str(item or "").strip()}
    if not material_ids:
        return
    entries = []
    now = _timestamp(datetime.datetime.utcnow())
    for raw in _thread_attachment_entries(thread):
        item = dict(raw)
        if str(item.get("id")) in material_ids:
            item["status"] = "USED"
            item["operation"] = str(operation or "generation")[:80]
            item["resolvedAt"] = now
            if job_id:
                item["resultJobId"] = str(job_id)
        entries.append(item)
    thread.context = {**(thread.context or {}), "pendingAttachments": entries}


def _material_dependency_ids(owner_id, source_refs):
    material_ids = [
        str(item.get("id"))
        for item in (source_refs or [])
        if isinstance(item, dict)
        and item.get("type") == "material"
        and item.get("id")
    ]
    return [
        job.id
        for job in _material_jobs(owner_id, material_ids, active_only=True).values()
    ]


def _message_attachment_views(user, source_refs):
    material_ids = [
        str(item.get("id"))
        for item in (source_refs or [])
        if isinstance(item, dict)
        and item.get("type") == "material"
        and item.get("id")
    ]
    if not material_ids:
        return []
    materials = TeachingMaterials.query.filter(
        TeachingMaterials.id.in_(material_ids),
        TeachingMaterials.owner_id == user.id,
        TeachingMaterials.status != "ARCHIVED",
    ).all()
    by_id = {material.id: material for material in materials}
    return [
        _material_attachment_view(by_id[material_id])
        for material_id in material_ids
        if material_id in by_id
    ]


def _agent_request_context(body, user, thread):
    raw_constraints = body.get("constraints") or {}
    if not isinstance(raw_constraints, dict):
        raise ValueError("Constraints must be an object")
    constraints = scrub_payload(raw_constraints)

    raw_refs_value = body.get("sourceRefs") or []
    if not isinstance(raw_refs_value, list):
        raise ValueError("Source references must be an array")
    raw_refs = list(raw_refs_value)
    raw_refs.extend(
        {"type": "material", "id": entry["id"]}
        for entry in _thread_attachment_entries(thread)
        if entry.get("status") in {"AWAITING_INTENT", "ACTIVE", "REFERENCED"}
    )
    if len(raw_refs) > 100:
        raise ValueError("At most 100 source references are allowed")
    refs = []
    material_ids = []
    seen = set()
    for ref in raw_refs:
        if not isinstance(ref, dict) or ref.get("type") != "material":
            raise ValueError("Only material source references are supported")
        material_id = str(ref.get("id") or "")
        if not material_id or material_id in seen:
            continue
        seen.add(material_id)
        material_ids.append(material_id)
        refs.append({"type": "material", "id": material_id})
    if material_ids:
        owned = {
            row.id
            for row in TeachingMaterials.query.filter(
                TeachingMaterials.id.in_(material_ids),
                TeachingMaterials.owner_id == user.id,
                or_(
                    TeachingMaterials.dojo_id == thread.dojo_id,
                    TeachingMaterials.dojo_id.is_(None),
                ),
                TeachingMaterials.status != "ARCHIVED",
            ).all()
        }
        if owned != set(material_ids):
            raise ScopeError("Source material not found")
    if (
        _json_size({"constraints": constraints, "sourceRefs": refs})
        > MAX_AGENT_CONTEXT_BYTES
    ):
        raise ValueError("Agent context exceeds 64 KiB")
    return constraints, refs


def _current_user():
    user = get_current_user()
    if user is None:
        raise ScopeError("Authentication required")
    return user


def _teacher_dojos(user, *, eager=False, include_modules=False):
    query = Dojos.query
    if getattr(user, "type", None) != "admin":
        query = query.join(DojoAdmins).filter(DojoAdmins.user_id == user.id)
    if eager:
        # The teacher shell serializes course membership, modules and
        # challenges.  Loading those collections in three bounded queries
        # avoids a query per course/module on accounts with larger catalogs.
        query = query.options(
            selectinload(Dojos.users),
            selectinload(Dojos.modules).selectinload(DojoModules.challenges),
        )
    elif include_modules:
        query = query.options(selectinload(Dojos.modules))
    return query.order_by(Dojos.name, Dojos.dojo_id).all()


def _dojo_shell_view(dojo):
    return {
        "id": dojo.dojo_id,
        "referenceId": dojo.reference_id,
        "name": dojo.name,
        "access": "public" if dojo.type == "public" else "private",
        "modules": [
            {
                "index": module.module_index,
                "id": module.id,
                "name": module.name,
            }
            for module in dojo.modules
        ],
    }


def _require_teacher(user):
    if getattr(user, "type", None) == "admin":
        return
    if not DojoAdmins.query.filter_by(user_id=user.id).first():
        raise ScopeError("Teacher permission required")


def _artifact_student_safe_for_user(artifact, user):
    # A personal artifact is private to its owner, but the owner still needs the
    # complete authoring payload (workspace identity, lineage and revision
    # content) to open and continue working on it.  The student-safe projection
    # is for enrolled learners viewing somebody else's published course
    # artifact; applying it to the owner made a successfully materialized
    # personal artifact look incomplete to both the UI and lifecycle clients.
    if artifact.owner_id == user.id:
        return False
    if getattr(user, "type", None) == "admin":
        return False
    if artifact.dojo_id is not None and DojoAdmins.query.filter_by(
        dojo_id=artifact.dojo_id,
        user_id=user.id,
    ).first():
        return False
    return True


def _dojo_view(dojo, *, include_modules=True):
    student_count = sum(1 for membership in dojo.users if membership.type != "admin")
    challenge_count = sum(
        1
        for module in dojo.modules
        for challenge in module.challenges
        if is_supported_exercise(challenge)
    )
    result = {
        "id": dojo.dojo_id,
        "referenceId": dojo.reference_id,
        "name": dojo.name,
        "description": dojo.description,
        "access": "public" if dojo.type == "public" else "private",
        "official": bool(dojo.official),
        "repositoryBacked": bool(dojo.repository),
        "studentCount": student_count,
        "moduleCount": len(dojo.modules),
        "challengeCount": challenge_count,
    }
    result["modules"] = (
        [
            {
                "index": module.module_index,
                "id": module.id,
                "name": module.name,
                "description": module.description,
                "challenges": [
                    {
                        "id": challenge.id,
                        "challengeId": challenge.challenge_id,
                        "index": challenge.challenge_index,
                        "name": challenge.name or challenge.id,
                        "required": bool(challenge.required),
                        "exerciseMode": challenge.exercise_mode,
                        "url": f"/{dojo.reference_id}/{module.id}/{challenge.id}",
                    }
                    for challenge in module.challenges
                    if is_supported_exercise(challenge)
                ],
            }
            for module in dojo.modules
        ]
        if include_modules
        else []
    )
    return result


def _content_state(status, validation=None):
    normalized = str(status or "").strip().upper()
    validation_status = str(
        (validation or {}).get("status")
        if isinstance(validation, dict)
        else ""
    ).upper()
    if validation_status in {"BLOCK", "FAILED", "FAIL"}:
        return "failed"
    if normalized in CONTENT_STATE_ALIASES:
        return CONTENT_STATE_ALIASES[normalized]
    return "unknown"


def _content_count(items):
    states = [item["state"] for item in items]
    return {
        "total": len(items),
        "draft": sum(state not in {"published", "archived", "deleted"} for state in states),
        "published": sum(state == "published" for state in states),
        "needsAttention": sum(state in ATTENTION_CONTENT_STATES for state in states),
    }


def _course_question_list_views(dojo):
    modules = {module.module_index: module for module in dojo.modules}
    published = [
        challenge
        for challenge in DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id).all()
        if is_supported_exercise(challenge)
    ]
    drafts = (
        LearningDrafts.query.filter_by(dojo_id=dojo.dojo_id)
        .filter(~LearningDrafts.status.in_(("DELETED", "ARCHIVED")))
        .filter(LearningDrafts.published_challenge_id.is_(None))
        .all()
    )
    published_ids = [challenge.challenge_id for challenge in published]
    profiles = (
        {
            row.challenge_id: row
            for row in LearningChallengeProfiles.query.filter(
                LearningChallengeProfiles.challenge_id.in_(published_ids)
            ).all()
        }
        if published_ids
        else {}
    )
    owner_ids = {
        draft.author_id for draft in drafts if draft.author_id is not None
    } | {
        profile.author_id
        for profile in profiles.values()
        if profile.author_id is not None
    }
    owner_names = (
        {
            row.id: str(row.name or "课程教师")
            for row in Users.query.filter(Users.id.in_(owner_ids)).all()
        }
        if owner_ids
        else {}
    )
    rows = []
    for challenge in published:
        module = modules.get(challenge.module_index)
        profile = profiles.get(challenge.challenge_id)
        rows.append(
            {
                "id": f"challenge:{challenge.challenge_id}",
                "kind": "published",
                "challengeId": challenge.id,
                "challengeNumericId": challenge.challenge_id,
                "draftId": None,
                "title": challenge.name or challenge.id,
                "summary": str(challenge.description or "")[:1200],
                "moduleIndex": challenge.module_index,
                "moduleId": module.id if module else None,
                "moduleName": module.name if module else "未分配章节",
                "status": "PUBLISHED",
                "state": "published",
                "required": bool(challenge.required),
                "exerciseMode": str(challenge.exercise_mode or "CONTAINER").upper(),
                "revision": profile.version if profile is not None else 1,
                "validationStatus": str(
                    ((profile.validation or {}).get("status") if profile else None)
                    or "PUBLISHED"
                ).upper(),
                "needsAttention": False,
                "ownerName": owner_names.get(
                    profile.author_id if profile is not None else None,
                    "课程教师",
                ),
                "updated": _timestamp(profile.updated) if profile is not None else None,
                "href": (
                    f"/{dojo.reference_id}/{module.id}/{challenge.id}"
                    if module
                    else f"/{dojo.reference_id}"
                ),
            }
        )
    for draft in drafts:
        spec = draft.spec if isinstance(draft.spec, dict) else {}
        validation = draft.validation if isinstance(draft.validation, dict) else {}
        module = modules.get(draft.module_index)
        state = _content_state(draft.status, validation)
        rows.append(
            {
                "id": draft.id,
                "kind": "draft",
                "challengeId": None,
                "challengeNumericId": None,
                "draftId": draft.id,
                "title": str(spec.get("name") or draft.brief or "未命名题目草稿")[:240],
                "summary": str(spec.get("description") or draft.brief or "")[:1200],
                "moduleIndex": draft.module_index,
                "moduleId": module.id if module else None,
                "moduleName": module.name if module else "未分配章节",
                "status": draft.status,
                "state": state,
                "required": bool(spec.get("required", True)),
                "exerciseMode": str(
                    spec.get("exerciseMode") or spec.get("mode") or "CONTAINER"
                ).upper(),
                "revision": draft.revision,
                "validationStatus": str(validation.get("status") or "PENDING"),
                "needsAttention": state in ATTENTION_CONTENT_STATES,
                "ownerName": owner_names.get(draft.author_id, "课程教师"),
                "updated": _timestamp(draft.updated),
                "href": (
                    f"/teacher/courses?dojo={dojo.reference_id}"
                    f"&tab=questions&selectedId={draft.id}&view=library"
                ),
            }
        )
    return rows


def _course_content_snapshot(
    dojo,
    *,
    as_of=None,
    published_questions=None,
    drafts=None,
    artifacts=None,
    batches=None,
    batch_count=None,
):
    as_of = as_of or datetime.datetime.utcnow()
    if published_questions is None:
        published_questions = [
            challenge
            for challenge in DojoChallenges.query.filter_by(
                dojo_id=dojo.dojo_id
            ).all()
            if is_supported_exercise(challenge)
        ]
    if drafts is None:
        drafts = (
            LearningDrafts.query.filter_by(dojo_id=dojo.dojo_id)
            .filter(~LearningDrafts.status.in_(("DELETED", "ARCHIVED")))
            .order_by(LearningDrafts.updated.desc())
            .all()
        )
    unpublished_drafts = [draft for draft in drafts if draft.published_challenge_id is None]
    question_items = [
        {
            "objectType": "question",
            "objectId": f"challenge:{challenge.challenge_id}",
            "moduleIndex": challenge.module_index,
            "title": challenge.name or challenge.id,
            "state": "published",
            "updated": None,
            "nextAction": "open",
            "href": (
                f"/teacher/courses?dojo={dojo.reference_id}"
                f"&tab=questions&selectedId=challenge:{challenge.challenge_id}"
            ),
        }
        for challenge in published_questions
    ] + [
        {
            "objectType": "question",
            "objectId": draft.id,
            "moduleIndex": draft.module_index,
            "title": str((draft.spec or {}).get("name") or draft.brief or "题目草稿")[:240],
            "state": _content_state(draft.status, draft.validation),
            "updated": draft.updated,
            "nextAction": (
                "retry_validation"
                if _content_state(draft.status, draft.validation) == "failed"
                else "review"
            ),
            "href": (
                f"/teacher/courses?dojo={dojo.reference_id}"
                f"&tab=questions&selectedId={draft.id}"
            ),
        }
        for draft in unpublished_drafts
    ]

    if artifacts is None:
        artifacts = (
            TeachingArtifacts.query.filter_by(dojo_id=dojo.dojo_id)
            .filter(TeachingArtifacts.status != "ARCHIVED")
            .order_by(TeachingArtifacts.updated.desc())
            .all()
        )
    demo_items = []
    courseware_items = []
    for artifact in artifacts:
        if artifact.artifact_type in QUESTION_ARTIFACT_TYPES:
            continue
        item = {
            "objectType": (
                "demo"
                if artifact.artifact_type in COURSE_DEMO_ARTIFACT_TYPES
                else "courseware"
            ),
            "objectId": artifact.id,
            "moduleIndex": artifact.module_index,
            "title": artifact.title,
            "state": _content_state(artifact.status),
            "updated": artifact.updated,
            "nextAction": (
                "retry_generation"
                if _content_state(artifact.status) == "failed"
                else "review"
                if _content_state(artifact.status) == "needs_review"
                else "open"
            ),
            "href": f"/teacher/artifacts/{artifact.id}",
        }
        if artifact.artifact_type in COURSE_DEMO_ARTIFACT_TYPES:
            demo_items.append(item)
        else:
            courseware_items.append(item)

    if batches is None:
        batches = (
            TeachingGenerationBatches.query.filter_by(dojo_id=dojo.dojo_id)
            .order_by(TeachingGenerationBatches.updated.desc())
            .limit(100)
            .all()
        )
    if batch_count is None:
        batch_count = len(batches)
    batch_attention = [
        {
            "objectType": "generation_batch",
            "objectId": batch.id,
            "moduleIndex": batch.module_index,
            "title": str((batch.plan or {}).get("brief") or "批量生成题目")[:240],
            "state": str(batch.status or "").lower(),
            "updated": batch.updated,
            "nextAction": (
                "retry_failed"
                if batch.status in {"PARTIAL_SUCCESS", "FAILED"}
                else "review_results"
            ),
            "href": (
                f"/teacher/courses?dojo={dojo.reference_id}"
                "&tab=questions&view=library"
            ),
        }
        for batch in batches
        if batch.status in {"NEEDS_REVIEW", "PARTIAL_SUCCESS", "FAILED"}
    ]
    attention = [
        item
        for item in question_items + courseware_items + demo_items
        if item["state"] in ATTENTION_CONTENT_STATES
    ] + batch_attention
    attention.sort(
        key=lambda item: item.get("updated") or datetime.datetime.min,
        reverse=True,
    )

    recent_activity = [
        {
            **{key: value for key, value in item.items() if key != "updated"},
            "updated": _timestamp(item.get("updated")),
        }
        for item in sorted(
            [
                item
                for item in question_items + courseware_items + demo_items
                if item.get("updated") is not None
            ],
            key=lambda item: item["updated"],
            reverse=True,
        )[:12]
    ]
    counts = {
        "questions": _content_count(question_items),
        "courseware": _content_count(courseware_items),
        "demos": _content_count(demo_items),
    }
    count_totals = {
        key: sum(int(value.get(key) or 0) for value in counts.values())
        for key in ("total", "draft", "published", "needsAttention")
    }
    first_attention = attention[0] if attention else None
    if count_totals["total"] == 0:
        readiness = {
            "state": "empty",
            "title": "还没有可发布内容",
            "description": "先准备一份课件、一道题目或一个演示，再进入审阅与发布。",
            "nextAction": "create_content",
            "href": f"/teacher/courses?dojo={dojo.reference_id}&tab=courseware",
        }
    elif count_totals["needsAttention"]:
        readiness = {
            "state": "needs_attention",
            "title": f"{count_totals['needsAttention']} 项需要处理",
            "description": "先处理失败、部分成功或待审核内容，再安排发布。",
            "nextAction": (
                first_attention.get("nextAction") if first_attention else "review"
            ),
            "href": first_attention.get("href") if first_attention else None,
        }
    elif count_totals["draft"]:
        readiness = {
            "state": "review",
            "title": f"{count_totals['draft']} 项尚未发布",
            "description": "内容已保存为草稿，请逐项检查学生可见内容后发布。",
            "nextAction": "review_drafts",
            "href": f"/teacher/courses?dojo={dojo.reference_id}&tab=questions",
        }
    else:
        readiness = {
            "state": "ready",
            "title": f"{count_totals['published']} 项已对学生可见",
            "description": "当前没有待处理草稿或失败任务，可以继续关注学习证据。",
            "nextAction": "review_learning",
            "href": f"/teacher/courses?dojo={dojo.reference_id}&tab=students",
        }
    readiness["counts"] = count_totals
    evidence_count = sum(value["total"] for value in counts.values()) + int(batch_count)
    definitions = {
        "total": "已发布事实与尚未发布草稿的去重总数",
        "draft": "尚未发布且未归档的内容数",
        "published": "学生当前可见的有效内容数",
        "needsAttention": "等待审核、部分成功或失败且需要教师处理的内容数",
    }
    return {
        "counts": counts,
        "attention": [
            {
                **{key: value for key, value in item.items() if key != "updated"},
                "updated": _timestamp(item.get("updated")),
            }
            for item in attention[:50]
        ],
        "recentActivity": recent_activity,
        "publishReadiness": readiness,
        "evidence": {
            "asOf": _timestamp(as_of),
            "timeRange": "course_lifetime",
            "evidenceCount": evidence_count,
            "definitions": definitions,
        },
    }


def _dojo_summary_views(dojos):
    dojo_ids = [dojo.dojo_id for dojo in dojos]
    if not dojo_ids:
        return []
    student_counts = dict(
        db.session.query(DojoUsers.dojo_id, func.count(DojoUsers.user_id))
        .filter(DojoUsers.dojo_id.in_(dojo_ids), DojoUsers.type != "admin")
        .group_by(DojoUsers.dojo_id)
        .all()
    )
    module_counts = dict(
        db.session.query(DojoModules.dojo_id, func.count(DojoModules.module_index))
        .filter(DojoModules.dojo_id.in_(dojo_ids))
        .group_by(DojoModules.dojo_id)
        .all()
    )
    published_by_dojo = {dojo_id: [] for dojo_id in dojo_ids}
    challenge_rows = DojoChallenges.query.filter(
        DojoChallenges.dojo_id.in_(dojo_ids)
    ).options(
        load_only(
            DojoChallenges.dojo_id,
            DojoChallenges.module_index,
            DojoChallenges.challenge_index,
            DojoChallenges.challenge_id,
            DojoChallenges.id,
            DojoChallenges.name,
            DojoChallenges.data,
        )
    ).all()
    for challenge in challenge_rows:
        if is_supported_exercise(challenge):
            published_by_dojo[challenge.dojo_id].append(challenge)
    draft_by_dojo = {dojo_id: [] for dojo_id in dojo_ids}
    for draft in LearningDrafts.query.filter(
        LearningDrafts.dojo_id.in_(dojo_ids),
        ~LearningDrafts.status.in_(("DELETED", "ARCHIVED")),
    ).options(
        # The dashboard never renders the authoring conversation, candidate
        # payloads or source constraints. Those JSON documents can be much
        # larger than the summary itself, so skip them on every refresh.
        load_only(
            LearningDrafts.id,
            LearningDrafts.dojo_id,
            LearningDrafts.module_index,
            LearningDrafts.author_id,
            LearningDrafts.status,
            LearningDrafts.brief,
            LearningDrafts.spec,
            LearningDrafts.validation,
            LearningDrafts.revision,
            LearningDrafts.published_challenge_id,
            LearningDrafts.updated,
        )
    ).all():
        draft_by_dojo[draft.dojo_id].append(draft)
    artifact_by_dojo = {dojo_id: [] for dojo_id in dojo_ids}
    for artifact in TeachingArtifacts.query.filter(
        TeachingArtifacts.dojo_id.in_(dojo_ids),
        TeachingArtifacts.status != "ARCHIVED",
    ).options(
        load_only(
            TeachingArtifacts.id,
            TeachingArtifacts.dojo_id,
            TeachingArtifacts.module_index,
            TeachingArtifacts.artifact_type,
            TeachingArtifacts.title,
            TeachingArtifacts.status,
            TeachingArtifacts.updated,
        )
    ).all():
        artifact_by_dojo[artifact.dojo_id].append(artifact)
    batch_by_dojo = {dojo_id: [] for dojo_id in dojo_ids}
    for batch in TeachingGenerationBatches.query.filter(
        TeachingGenerationBatches.dojo_id.in_(dojo_ids),
        TeachingGenerationBatches.status.in_(
            ("NEEDS_REVIEW", "PARTIAL_SUCCESS", "FAILED")
        ),
    ).options(
        load_only(
            TeachingGenerationBatches.id,
            TeachingGenerationBatches.dojo_id,
            TeachingGenerationBatches.module_index,
            TeachingGenerationBatches.status,
            TeachingGenerationBatches.plan,
            TeachingGenerationBatches.updated,
        )
    ).all():
        batch_by_dojo[batch.dojo_id].append(batch)
    batch_counts = dict(
        db.session.query(
            TeachingGenerationBatches.dojo_id,
            func.count(TeachingGenerationBatches.id),
        )
        .filter(TeachingGenerationBatches.dojo_id.in_(dojo_ids))
        .group_by(TeachingGenerationBatches.dojo_id)
        .all()
    )
    as_of = datetime.datetime.utcnow()
    summaries = []
    for dojo in dojos:
        published_questions = published_by_dojo[dojo.dojo_id]
        content = _course_content_snapshot(
            dojo,
            as_of=as_of,
            published_questions=published_questions,
            drafts=draft_by_dojo[dojo.dojo_id],
            artifacts=artifact_by_dojo[dojo.dojo_id],
            batches=batch_by_dojo[dojo.dojo_id],
            batch_count=batch_counts.get(dojo.dojo_id, 0),
        )
        summaries.append(
            {
            "id": dojo.dojo_id,
            "referenceId": dojo.reference_id,
            "name": dojo.name,
            "description": dojo.description,
            "access": "public" if dojo.type == "public" else "private",
            "official": bool(dojo.official),
            "repositoryBacked": bool(dojo.repository),
            "studentCount": int(student_counts.get(dojo.dojo_id, 0)),
            "moduleCount": int(module_counts.get(dojo.dojo_id, 0)),
            "challengeCount": len(published_questions),
            "counts": content["counts"],
            "attention": content["attention"],
            "publishReadiness": content["publishReadiness"],
            "recentActivity": content["recentActivity"],
            "evidence": content["evidence"],
            "modules": [],
            }
        )
    return summaries


def _dojo_catalog_view(summary):
    activity = summary.get("recentActivity") or []
    latest = max(
        (str(item.get("updated") or "") for item in activity),
        default="",
    )
    return {
        "id": summary.get("id"),
        "referenceId": summary.get("referenceId"),
        "name": summary.get("name"),
        "description": str(summary.get("description") or "")[:320] or None,
        "access": summary.get("access"),
        "official": bool(summary.get("official")),
        "repositoryBacked": bool(summary.get("repositoryBacked")),
        "studentCount": int(summary.get("studentCount") or 0),
        "moduleCount": int(summary.get("moduleCount") or 0),
        "challengeCount": int(summary.get("challengeCount") or 0),
        "counts": summary.get("counts") or {},
        "lastActivityAt": latest or None,
    }


def _management_audit(user, action, resource_type, resource_id, details=None):
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            outcome="ALLOW",
            details=details or {},
        )
    )


def _active_resource_job(user, *, dojo_id=None, resource_key=None, resource_id=None):
    query = TeachingJobs.query.filter(
        TeachingJobs.owner_id == user.id,
        TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
    )
    if dojo_id is not None:
        query = query.filter(TeachingJobs.dojo_id == dojo_id)
    for job in query.order_by(TeachingJobs.created.desc()).limit(300).all():
        if resource_key is None or str(
            (job.payload or {}).get(resource_key) or ""
        ) == str(resource_id):
            return job
    return None


def _managed_module(dojo, module_index):
    try:
        module_index = int(module_index)
    except (TypeError, ValueError) as exc:
        raise ValueError("章节编号无效。") from exc
    module = DojoModules.query.filter_by(
        dojo_id=dojo.dojo_id,
        module_index=module_index,
    ).first()
    if module is None:
        raise ScopeError("未找到章节。")
    return module


def _thread_for_owner(thread_id, user):
    thread = TeachingAgentThreads.query.filter_by(
        id=thread_id,
        user_id=user.id,
    ).first()
    if thread is None:
        raise ScopeError("Thread not found")
    return thread


DEFAULT_THREAD_TITLES = {"新教学对话", "新对话", "全局教学智能体"}


def _thread_title_from_message(content):
    """Create a stable, readable sidebar title from the first user turn."""

    title = re.sub(r"\s+", " ", str(content or "")).strip().strip("。！？!?；;")
    if not title:
        return "新教学对话"
    return f"{title[:38]}…" if len(title) > 38 else title


def _thread_card_views(cards):
    job_card_ids = {
        str(card.object_id)
        for card in cards
        if card.card_type == "job" and card.object_id
    }
    legacy_action_ids = {
        str(card.object_id)
        for card in cards
        if card.card_type == "course_operation"
        and (card.state or {}).get("tool") == "challenge.generate"
        and card.object_id
    }
    filters = []
    if job_card_ids:
        filters.append(TeachingJobs.id.in_(job_card_ids))
    if legacy_action_ids:
        filters.append(TeachingJobs.action_id.in_(legacy_action_ids))
    jobs = (
        TeachingJobs.query.filter(
            TeachingJobs.kind == "learning.authoring",
            or_(*filters),
        )
        .order_by(TeachingJobs.created.desc())
        .all()
        if filters
        else []
    )
    jobs_by_id = {str(job.id): job for job in jobs}
    jobs_by_action = {}
    for job in jobs:
        if job.action_id:
            jobs_by_action.setdefault(str(job.action_id), job)

    legacy_ids = {
        str((job.payload or {}).get("legacyJobId"))
        for job in jobs
        if (job.payload or {}).get("legacyJobId")
    }
    legacy_titles = {
        str(row.id): row.title
        for row in (
            LearningAuthoringJobs.query.filter(
                LearningAuthoringJobs.id.in_(legacy_ids)
            ).all()
            if legacy_ids
            else []
        )
    }
    draft_ids = {
        str((job.result or {}).get("draftId"))
        for job in jobs
        if isinstance(job.result, dict) and (job.result or {}).get("draftId")
    }
    drafts_by_id = {
        str(row.id): row
        for row in (
            LearningDrafts.query.filter(LearningDrafts.id.in_(draft_ids)).all()
            if draft_ids
            else []
        )
    }

    views = []
    for card in cards:
        legacy_card = (
            card.card_type == "course_operation"
            and (card.state or {}).get("tool") == "challenge.generate"
        )
        job = (
            jobs_by_action.get(str(card.object_id))
            if legacy_card
            else jobs_by_id.get(str(card.object_id))
            if card.card_type == "job"
            else None
        )
        if job is None:
            views.append(
                {
                    "id": card.id,
                    "type": card.card_type,
                    "objectType": card.object_type,
                    "objectId": card.object_id,
                    "revisionId": card.revision_id,
                    "state": card.state,
                    "actions": card.actions,
                    "created": _timestamp(card.created),
                }
            )
            continue

        presented = job_view(job)
        legacy_id = str((job.payload or {}).get("legacyJobId") or "")
        result = dict(presented.get("result") or {})
        draft = drafts_by_id.get(str(result.get("draftId") or ""))
        if draft is not None:
            spec = draft.spec if isinstance(draft.spec, dict) else {}
            result["title"] = str(
                spec.get("name") or legacy_titles.get(legacy_id) or "CTF 实践题"
            )[:240]
            result["summary"] = str(
                spec.get("description")
                or draft.brief
                or "题目草稿已生成并通过可用性检查。"
            )[:500]
            presented = {**presented, "result": result}
        title = (
            result.get("title")
            or (job.payload or {}).get("title")
            or legacy_titles.get(legacy_id)
            or (card.state or {}).get("title")
            or "生成 CTF 实践题"
        )
        status = str(presented.get("status") or "").upper()
        actions = (
            ["open", "result"]
            if status == "SUCCEEDED"
            else ["open", "retry"]
            if status in {"FAILED", "CANCELED"}
            else ["open", "cancel"]
        )
        views.append(
            {
                "id": card.id,
                "type": "job",
                "objectType": "job",
                "objectId": job.id,
                "revisionId": card.revision_id,
                "state": {
                    **(card.state or {}),
                    **presented,
                    "title": title,
                    "artifactType": "question-set",
                },
                "actions": actions,
                "created": _timestamp(card.created),
            }
        )
    return views


def _thread_view(
    thread,
    *,
    include_messages=False,
    message_count=None,
    latest_message=None,
):
    result = {
        "id": thread.id,
        "title": thread.title,
        "status": thread.status,
        "pinned": bool(thread.pinned),
        "archivedAt": _timestamp(thread.archived_at),
        "phase": thread.phase,
        "dojoId": thread.dojo_id,
        "moduleIndex": thread.module_index,
        "context": thread.context,
        "created": _timestamp(thread.created),
        "updated": _timestamp(thread.updated),
    }
    if message_count is not None:
        result["messageCount"] = int(message_count)
    if latest_message is not None:
        result["latestMessage"] = re.sub(
            r"\s+", " ", str(latest_message or "")
        ).strip()[:120]
    if include_messages:
        messages = (
            TeachingAgentMessages.query.filter_by(thread_id=thread.id)
            .order_by(TeachingAgentMessages.id)
            .all()
        )
        message_ids = [message.id for message in messages]
        cards = (
            ConversationCards.query.filter(
                ConversationCards.message_id.in_(message_ids)
            )
            .order_by(ConversationCards.created)
            .all()
            if message_ids
            else []
        )
        by_message = {}
        for card, card_view in zip(cards, _thread_card_views(cards)):
            by_message.setdefault(card.message_id, []).append(card_view)
        result["messages"] = [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "metadata": message.metadata_json,
                "created": _timestamp(message.created),
                "cards": by_message.get(message.id, []),
            }
            for message in messages
        ]
    return result


def _thread_list_views(rows):
    """Add message counts and previews without issuing one query per thread."""

    if not rows:
        return []
    thread_ids = [row.id for row in rows]
    counts = dict(
        db.session.query(
            TeachingAgentMessages.thread_id,
            func.count(TeachingAgentMessages.id),
        )
        .filter(TeachingAgentMessages.thread_id.in_(thread_ids))
        .group_by(TeachingAgentMessages.thread_id)
        .all()
    )
    latest_ids = [
        message_id
        for _, message_id in (
            db.session.query(
                TeachingAgentMessages.thread_id,
                func.max(TeachingAgentMessages.id),
            )
            .filter(TeachingAgentMessages.thread_id.in_(thread_ids))
            .group_by(TeachingAgentMessages.thread_id)
            .all()
        )
        if message_id is not None
    ]
    latest = {
        message.thread_id: message.content
        for message in (
            TeachingAgentMessages.query.filter(
                TeachingAgentMessages.id.in_(latest_ids)
            ).all()
            if latest_ids
            else []
        )
    }
    return [
        _thread_view(
            row,
            message_count=counts.get(row.id, 0),
            latest_message=latest.get(row.id, ""),
        )
        for row in rows
    ]


def _candidate_set_for_user(candidate_set_id, user):
    item = TeachingCandidateSets.query.filter_by(
        id=candidate_set_id,
        owner_id=user.id,
    ).first()
    if item is None:
        raise ScopeError("Candidate set not found")
    return item


def _candidate_generation_job(candidate_set, user):
    if (
        str((candidate_set.request_json or {}).get("generationMode") or "").lower()
        != "single"
    ):
        return None
    recent = (
        TeachingJobs.query.filter_by(
            owner_id=user.id,
            kind=(
                "self.candidate.generate"
                if candidate_set.self_workspace_id
                else "candidate.generate"
            ),
        )
        .order_by(TeachingJobs.created.desc())
        .limit(50)
        .all()
    )
    return next(
        (
            row
            for row in recent
            if (row.payload or {}).get("candidateSetId") == candidate_set.id
            or (
                isinstance(row.result, dict)
                and row.result.get("candidateSetId") == candidate_set.id
            )
        ),
        None,
    )


def _job_for_user(job_id, user):
    job = TeachingJobs.query.filter_by(id=job_id, owner_id=user.id).first()
    if job is None:
        raise ScopeError("Job not found")
    return job


def _session_for_user(session_id, user, *, teacher=False, lock=False):
    query = TeachingSessions.query.filter_by(id=session_id)
    if lock:
        query = query.with_for_update()
    session = query.first()
    if session is None:
        raise ScopeError("Teaching session not found")
    if teacher:
        dojo_for_user(user, session.dojo_id, teacher=True)
    elif not owner_or_teacher(user, session.owner_id, session.dojo_id):
        membership = DojoUsers.query.filter_by(
            dojo_id=session.dojo_id,
            user_id=user.id,
        ).first()
        if membership is None or session.status not in {"LIVE", "ENDED"}:
            raise ScopeError("Teaching session not found")
    return session


def _workspace_for_student(workspace_id, user, *, lock=False):
    query = SelfLearningWorkspaces.query.filter_by(
        id=workspace_id,
        student_id=user.id,
    )
    if lock:
        query = query.with_for_update()
    workspace = query.first()
    if workspace is None:
        raise ScopeError("Self-learning workspace not found")
    return workspace


def _workspace_usage(workspace):
    candidate_sets = TeachingCandidateSets.query.filter_by(
        self_workspace_id=workspace.id
    ).all()
    artifacts = TeachingArtifacts.query.filter_by(self_workspace_id=workspace.id).all()
    artifact_ids = [item.id for item in artifacts]
    revisions = (
        TeachingArtifactRevisions.query.filter(
            TeachingArtifactRevisions.artifact_id.in_(artifact_ids)
        ).all()
        if artifact_ids
        else []
    )
    storage_bytes = sum(
        len(
            json.dumps(
                revision.content or {},
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        for revision in revisions
    )
    jobs = TeachingJobs.query.filter_by(owner_id=workspace.student_id).all()
    workspace_jobs = [
        job for job in jobs if (job.payload or {}).get("workspaceId") == workspace.id
    ]
    job_ids = [job.id for job in workspace_jobs]
    invocations = [
        invocation
        for invocation in ModelInvocations.query.filter_by(
            owner_id=workspace.student_id
        ).all()
        if invocation.job_id in job_ids
        or (invocation.parameters or {}).get("workspaceId") == workspace.id
    ]
    token_count = 0
    for invocation in invocations:
        usage = invocation.usage or {}
        total = next(
            (
                usage.get(key)
                for key in ("total_tokens", "totalTokens", "totalTokenCount")
                if isinstance(usage.get(key), (int, float))
            ),
            None,
        )
        if total is None:
            total = sum(
                float(value)
                for key, value in usage.items()
                if isinstance(value, (int, float))
                and ("input" in key.lower() or "output" in key.lower())
                and "token" in key.lower()
            )
        token_count += int(total or 0)
    complex_scenes = sum(
        1 for item in candidate_sets if item.kind in COMPLEX_ARTIFACT_TYPES
    )
    state = workspace.state or {}
    return {
        "candidateSets": len(candidate_sets),
        "artifacts": len(artifacts),
        "complexScenes": complex_scenes,
        "modelTokens": token_count,
        "storageBytes": storage_bytes,
        "labMinutes": int(state.get("labMinutes") or 0),
    }


def _workspace_view(workspace, *, include_usage=False):
    result = {
        "id": workspace.id,
        "title": workspace.title,
        "goal": workspace.goal,
        "status": workspace.status,
        "dojoId": workspace.dojo_id,
        "moduleIndex": workspace.module_index,
        "threadId": workspace.thread_id,
        "quota": workspace.quota,
        "state": workspace.state,
        "submittedArtifactId": workspace.submitted_artifact_id,
        "created": _timestamp(workspace.created),
        "updated": _timestamp(workspace.updated),
    }
    if include_usage:
        usage = _workspace_usage(workspace)
        result["usage"] = usage
        result["remaining"] = {
            key: max(0, int(limit) - int(usage.get(key, 0)))
            for key, limit in (workspace.quota or {}).items()
            if isinstance(limit, (int, float))
        }
    return result


def _workspace_activity_view(workspace):
    candidate_set = (
        TeachingCandidateSets.query.filter_by(
            owner_id=workspace.student_id,
            self_workspace_id=workspace.id,
        )
        .order_by(TeachingCandidateSets.updated.desc())
        .first()
    )
    artifact = (
        TeachingArtifacts.query.filter_by(
            owner_id=workspace.student_id,
            self_workspace_id=workspace.id,
        )
        .filter(TeachingArtifacts.status != "ARCHIVED")
        .order_by(TeachingArtifacts.updated.desc())
        .first()
    )
    jobs = [
        row
        for row in TeachingJobs.query.filter_by(owner_id=workspace.student_id)
        .order_by(TeachingJobs.updated.desc())
        .limit(200)
        .all()
        if (row.payload or {}).get("workspaceId") == workspace.id
    ]
    return {
        "latestCandidateSet": (
            candidate_set_view(candidate_set) if candidate_set is not None else None
        ),
        "latestArtifact": (
            artifact_view(artifact, include_content=False) if artifact is not None else None
        ),
        "latestJob": job_view(jobs[0]) if jobs else None,
        "latestJobEvents": job_events_view(jobs[0].id) if jobs else [],
        "recentJobs": [job_view(row) for row in jobs[:8]],
    }


def _student_generation_grounding(user, workspace, prompt):
    return build_student_course_grounding(
        user,
        workspace.dojo_id,
        module_index=workspace.module_index,
        prompt=prompt,
    )


def _student_generation_payload(grounding, payload):
    return {
        **payload,
        "sourceRefs": grounding["sourceRefs"],
        "sourceMaterials": grounding["sourceMaterials"],
        "materialContext": grounding["materialContext"],
        "materialDossier": grounding["materialDossier"],
        "courseContext": grounding["courseContext"],
    }


def _self_learning_artifact_type(value):
    artifact_type = str(value or "learning-path").strip().lower()
    if artifact_type == "slides":
        artifact_type = "slide-deck"
    if artifact_type not in SELF_LEARNING_ARTIFACT_TYPES:
        raise ValueError("Unsupported self-learning content type")
    return artifact_type


def _require_workspace_capacity(workspace, resource, amount=1):
    quota = int((workspace.quota or {}).get(resource, 0))
    if quota <= 0:
        return
    used = int(_workspace_usage(workspace).get(resource, 0))
    if used + amount > quota:
        raise OverflowError(f"Personal {resource} quota reached")


def _action_view(action):
    approval = TeachingAgentApprovals.query.filter_by(action_id=action.id).first()
    request_json = action.request_json or {}
    return {
        "id": action.id,
        "threadId": action.thread_id,
        "actorId": action.actor_id,
        "type": action.action_type,
        "riskLevel": action.risk_level,
        "targetType": action.target_type,
        "targetId": action.target_id,
        "status": action.status,
        "request": request_json,
        "sourceJobId": request_json.get("sourceJobId"),
        "title": request_json.get("title"),
        "result": action.result,
        "error": action.error,
        "created": _timestamp(action.created),
        "completed": _timestamp(action.completed),
        "approval": (
            {
                "decision": approval.decision,
                "approverId": approval.approver_id,
                "comment": approval.comment,
                "created": _timestamp(approval.created),
            }
            if approval
            else None
        ),
    }


def _generation_batch_for_user(batch_id, user):
    batch = TeachingGenerationBatches.query.filter_by(
        id=str(batch_id or ""),
        owner_id=user.id,
    ).first()
    if batch is None:
        raise ScopeError("Generation batch not found")
    dojo_for_user(user, batch.dojo_id, teacher=True)
    return batch


def _generation_batch_view(batch):
    counts = dict(batch.counts or {})
    requested_count = int(batch.requested_count or 0)
    created_count = int(counts.get("created") or 0)
    validated_count = int(counts.get("validated") or 0)
    failed_count = int(counts.get("failed") or 0)
    module = DojoModules.query.filter_by(
        dojo_id=batch.dojo_id,
        module_index=batch.module_index,
    ).first()
    items = []
    for item in batch.items:
        task = item.task
        presented = job_view(task) if task is not None else None
        spec = item.spec if isinstance(item.spec, dict) else {}
        draft_spec = (
            item.draft.spec
            if item.draft is not None and isinstance(item.draft.spec, dict)
            else {}
        )
        raw_skills = (
            draft_spec.get("objectives")
            or draft_spec.get("tags")
            or spec.get("skills")
            or []
        )
        skills = []
        for raw_skill in raw_skills if isinstance(raw_skills, list) else []:
            if isinstance(raw_skill, dict):
                skill = str(
                    raw_skill.get("label")
                    or raw_skill.get("name")
                    or raw_skill.get("title")
                    or ""
                ).strip()
            else:
                skill = str(raw_skill or "").strip()
            if skill and skill not in skills:
                skills.append(skill[:120])
            if len(skills) == 4:
                break
        item_status = str(item.status or "PLANNED").upper()
        raw_validation = item.validation or {}
        if isinstance(raw_validation, dict):
            validation_status = str(
                raw_validation.get("status")
                or raw_validation.get("validation")
                or ""
            ).upper()
        else:
            validation_status = str(raw_validation or "").upper()
        if not validation_status and isinstance((presented or {}).get("result"), dict):
            validation_status = str(
                (presented or {}).get("result", {}).get("validation") or ""
            ).upper()
        if not validation_status and item_status == "NEEDS_REVIEW":
            validation_status = "PASS"
        environment_status = (
            "READY"
            if item.draft_id and item_status == "NEEDS_REVIEW"
            else "FAILED"
            if item_status == "FAILED"
            else "BUILDING"
            if item_status in {"GENERATING", "VALIDATING"}
            else "PENDING"
        )
        items.append(
            {
                "id": item.id,
                "itemIndex": item.item_index,
                "title": str(spec.get("title") or f"独立 CTF 题目 {item.item_index}"),
                "difficulty": str(spec.get("difficulty") or "按要求递进"),
                "status": str(item.status or "PLANNED").lower(),
                "taskId": item.task_id,
                "authoringJobId": item.authoring_job_id,
                "draftId": item.draft_id,
                "environmentId": (
                    (presented or {}).get("result", {}).get("environmentId")
                    if isinstance((presented or {}).get("result"), dict)
                    else None
                ),
                "environmentStatus": environment_status,
                "validation": raw_validation,
                "validationStatus": validation_status or "PENDING",
                "skills": skills,
                "failure": item.error,
                "resultTarget": (presented or {}).get("resultTarget"),
                "retryable": str(item.status or "").upper()
                in {"FAILED", "CANCELED"},
                "created": _timestamp(item.created),
                "updated": _timestamp(item.updated),
            }
        )
    status = str(batch.status or "QUEUED").lower()
    next_action = (
        "retry_failed"
        if status in {"partial_success", "failed"} and failed_count
        else "review_results"
        if status == "needs_review"
        else "open_task"
        if status in {"queued", "generating", "validating"}
        else "view_history"
    )
    first_draft = next((item["draftId"] for item in items if item["draftId"]), None)
    review_url = (
        f"/teacher/courses?dojo={batch.dojo.reference_id}&tab=questions"
        f"&batchId={batch.id}"
        + (f"&selectedId={first_draft}" if first_draft else "")
        if batch.dojo is not None
        else None
    )
    started_at = batch.confirmed or batch.created
    ended_at = batch.completed or datetime.datetime.utcnow()
    return {
        "id": batch.id,
        "operation": batch.operation,
        "status": status,
        "course": {
            "id": batch.dojo.dojo_id,
            "referenceId": batch.dojo.reference_id,
            "name": batch.dojo.name,
        },
        "module": {
            "index": batch.module_index,
            "id": module.id if module else None,
            "name": module.name if module else "已删除章节",
        },
        "threadId": batch.thread_id,
        "actionId": batch.action_id,
        "requestedCount": requested_count,
        "createdCount": created_count,
        "validatedCount": validated_count,
        "failedCount": failed_count,
        "actualCount": created_count,
        "independence": batch.independence,
        "exerciseMode": batch.exercise_mode,
        "publishMode": batch.publish_mode,
        "difficultyStrategy": batch.difficulty_strategy or {},
        "goal": str((batch.plan or {}).get("brief") or "生成独立 CTF 实践题")[:280],
        "items": items,
        "nextAction": next_action,
        "reviewUrl": review_url,
        "elapsedSeconds": max(0, int((ended_at - started_at).total_seconds())),
        "created": _timestamp(batch.created),
        "confirmed": _timestamp(batch.confirmed),
        "updated": _timestamp(batch.updated),
        "completed": _timestamp(batch.completed),
    }


def _action_for_teacher(action, user):
    """Keep teacher-private actions isolated while allowing course reviews."""

    if action is None:
        raise ScopeError("Action not found")
    _require_teacher(user)
    request_json = action.request_json or {}
    dojo = dojo_for_user(user, request_json.get("dojoId"), teacher=True)
    if action.action_type != "review-self-artifact":
        if action.actor_id != user.id:
            raise ScopeError("Action not found")
        return action

    if action.actor_id == user.id:
        raise ScopeError("Action not found")
    workspace = SelfLearningWorkspaces.query.filter_by(
        id=action.target_id,
        dojo_id=dojo.dojo_id,
        student_id=action.actor_id,
    ).first()
    if action.target_type != "self_workspace" or workspace is None:
        raise ScopeError("Action not found")
    return action


def _thread_for_artifact_action(artifact, user):
    thread_id = None
    if artifact.candidate_id:
        candidate = TeachingArtifactCandidates.query.filter_by(
            id=artifact.candidate_id
        ).first()
        if candidate and candidate.candidate_set:
            thread_id = candidate.candidate_set.thread_id
    thread = (
        TeachingAgentThreads.query.filter_by(id=thread_id, user_id=user.id).first()
        if thread_id
        else None
    )
    if thread is None:
        thread = (
            TeachingAgentThreads.query.filter_by(
                user_id=user.id,
                dojo_id=artifact.dojo_id,
                module_index=artifact.module_index,
                status="ACTIVE",
            )
            .order_by(TeachingAgentThreads.updated.desc())
            .first()
        )
    if thread is None:
        thread = TeachingAgentThreads(
            user_id=user.id,
            dojo_id=artifact.dojo_id,
            module_index=artifact.module_index,
            title=f"发布：{artifact.title}"[:240],
            phase="POST_CLASS",
            context={"createdFor": "artifact-publish"},
        )
        db.session.add(thread)
        db.session.flush()
    return thread


def _thread_for_dojo_action(user, dojo_id, module_index=None, title="教学操作"):
    thread = (
        TeachingAgentThreads.query.filter_by(
            user_id=user.id,
            dojo_id=dojo_id,
            module_index=module_index,
            status="ACTIVE",
        )
        .order_by(TeachingAgentThreads.updated.desc())
        .first()
    )
    if thread is None:
        thread = TeachingAgentThreads(
            user_id=user.id,
            dojo_id=dojo_id,
            module_index=module_index,
            title=str(title)[:240],
            phase="COURSE_SETUP",
            context={"createdFor": "confirmed-teaching-action"},
        )
        db.session.add(thread)
        db.session.flush()
    return thread


def _module_slug(value, fallback):
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return (slug or fallback)[:32].rstrip("-")


def _automatic_course_slug(name):
    base = _module_slug(name, "course")[:23].rstrip("-") or "course"
    return f"{base}-{secrets.token_hex(4)}"


def _unique_idempotency(user_id, prefix):
    supplied = request.headers.get("Idempotency-Key", "").strip()
    if supplied:
        supplied = supplied[:96]
    else:
        supplied = uuid.uuid4().hex
    return f"{prefix}:{user_id}:{supplied}"


def _valid_material_signature(suffix, raw):
    if suffix == ".pdf":
        return raw.startswith(b"%PDF-")
    if suffix in {".docx", ".pptx"}:
        return raw.startswith(b"PK\x03\x04")
    if suffix in {".doc", ".ppt"}:
        return raw.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    if suffix == ".png":
        return raw.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix in {".jpg", ".jpeg"}:
        return raw.startswith(b"\xff\xd8\xff")
    if suffix == ".webp":
        return len(raw) >= 12 and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"
    if suffix in {".txt", ".md"}:
        return b"\x00" not in raw[:8192]
    return False


def _scan_material_security(suffix, raw):
    lowered = raw.lower()
    if suffix == ".pdf" and any(
        marker in lowered
        for marker in (b"/javascript", b"/launch", b"/embeddedfile", b"/openaction")
    ):
        raise ValueError("PDF active content is not allowed")
    if suffix in {".doc", ".ppt"} and any(
        marker in lowered
        for marker in (b"vba", b"autoopen", b"document_open", b"shell.application")
    ):
        raise ValueError("Legacy Office active content is not allowed")
    if suffix in {".docx", ".pptx"}:
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                entries = archive.infolist()
                if len(entries) > 10000:
                    raise ValueError("Office archive contains too many entries")
                expanded = sum(entry.file_size for entry in entries)
                if expanded > 250 * 1024 * 1024:
                    raise ValueError("Office archive expands beyond the safety limit")
                for entry in entries:
                    normalized = pathlib.PurePosixPath(entry.filename)
                    if normalized.is_absolute() or ".." in normalized.parts:
                        raise ValueError("Office archive contains an unsafe path")
                    name = entry.filename.lower()
                    if any(
                        marker in name
                        for marker in ("vbaproject.bin", "/embeddings/", "/activex/")
                    ):
                        raise ValueError(
                            "Office embedded active content is not allowed"
                        )
                    if entry.file_size <= 2 * 1024 * 1024 and name.endswith(
                        (".xml", ".rels")
                    ):
                        content = archive.read(entry).lower()
                        if b'targetmode="external"' in content:
                            raise ValueError(
                                "Office external relationships are not allowed"
                            )
        except zipfile.BadZipFile as exc:
            raise ValueError("Invalid Office document archive") from exc
    return {
        "scanner": "aisecedu-static-v1",
        "status": "PASS",
        "activeContent": False,
        "checkedBytes": len(raw),
    }


def _classroom_lesson(artifact):
    content = artifact_view(artifact)["revision"]["content"]
    lesson = (
        content.get("lesson") if isinstance(content.get("lesson"), dict) else content
    )
    if not isinstance(lesson, dict) or not isinstance(lesson.get("artifacts"), list):
        raise ValueError(
            "The selected content cannot be used for an interactive preview"
        )
    if not lesson["artifacts"]:
        raise ValueError("The selected artifact contains no classroom scenes")
    return lesson


def _render_classroom(artifact, classroom_id):
    response = requests.post(
        f"{config.AGENT_RUNTIME_INTERNAL_URL}/api/integration/classrooms/render",
        headers={
            "X-AISecEdu-Service-Token": config.AGENT_RUNTIME_SERVICE_SECRET,
            "X-Trace-ID": get_trace_id(),
            "Content-Type": "application/json",
        },
        json={"classroomId": classroom_id, "lesson": _classroom_lesson(artifact)},
        timeout=(5, 30),
    )
    if response.status_code in {400, 401, 403, 404, 409, 422}:
        raise ValueError(
            f"Interactive preview rendering failed (HTTP {response.status_code})"
        )
    response.raise_for_status()
    body = response.json()
    result = body.get("result") if body.get("success") else None
    if not isinstance(result, dict) or not isinstance(result.get("stage"), dict):
        raise ValueError("The preview service returned an invalid scene")
    if not isinstance(result.get("scenes"), list) or not result["scenes"]:
        raise ValueError("The preview service returned an empty scene")
    return result


def _status_counts(query, status_column, id_column):
    return {
        str(status or "UNKNOWN"): int(count)
        for status, count in query.with_entities(
            status_column,
            func.count(id_column),
        )
        .group_by(status_column)
        .all()
    }


def _attempt_is_completed(attempt):
    return attempt.status in {"SOLVED", "SUBMITTED"}


def _agent_progress_snapshot(dojo):
    challenges = DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id).all()
    challenge_ids = [row.challenge_id for row in challenges if row.challenge_id]
    required_ids = {
        row.challenge_id for row in challenges if row.challenge_id and row.required
    }
    students = {
        row.user_id: {
            "userId": row.user_id,
            "name": row.user.name if row.user else str(row.user_id),
            "solved": set(),
            "attempts": [],
            "scores": [],
            "evidence": {},
            "lastSolve": None,
        }
        for row in DojoUsers.query.filter(
            DojoUsers.dojo_id == dojo.dojo_id,
            DojoUsers.type != "admin",
        ).all()
    }

    def student_row(user_id):
        return students.setdefault(
            user_id,
            {
                "userId": user_id,
                "name": str(user_id),
                "solved": set(),
                "attempts": [],
                "scores": [],
                "evidence": {},
                "lastSolve": None,
            },
        )

    solve_rows = (
        db.session.query(Solves.user_id, Solves.challenge_id, func.max(Solves.date))
        .filter(Solves.challenge_id.in_(challenge_ids or [-1]))
        .group_by(Solves.user_id, Solves.challenge_id)
        .all()
    )
    for user_id, challenge_id, solved_at in solve_rows:
        row = student_row(user_id)
        row["solved"].add(challenge_id)
        if solved_at and (row["lastSolve"] is None or solved_at > row["lastSolve"]):
            row["lastSolve"] = solved_at

    attempts = LearningAttempts.query.filter_by(dojo_id=dojo.dojo_id).all()
    attempts_by_id = {}
    for attempt in attempts:
        attempts_by_id[attempt.id] = attempt
        student_row(attempt.user_id)["attempts"].append(attempt)
    if attempts_by_id:
        for assessment in LearningAssessments.query.filter(
            LearningAssessments.attempt_id.in_(list(attempts_by_id))
        ).all():
            attempt = attempts_by_id.get(assessment.attempt_id)
            if attempt:
                student_row(attempt.user_id)["scores"].append(
                    float(assessment.total_score)
                )
    evidence_rows = (
        db.session.query(
            LearningAttempts.user_id,
            LearningEvidenceEvents.event_type,
            func.count(LearningEvidenceEvents.id),
        )
        .join(
            LearningEvidenceEvents,
            LearningEvidenceEvents.attempt_id == LearningAttempts.id,
        )
        .filter(LearningAttempts.dojo_id == dojo.dojo_id)
        .group_by(LearningAttempts.user_id, LearningEvidenceEvents.event_type)
        .all()
    )
    for user_id, event_type, count in evidence_rows:
        student_row(user_id)["evidence"][event_type] = int(count)

    rows = []
    for row in students.values():
        solved = row.pop("solved")
        user_attempts = row.pop("attempts")
        scores = row.pop("scores")
        required_solved = len(solved & required_ids)
        rows.append(
            {
                **row,
                "solvedChallengeIds": sorted(solved),
                "requiredSolved": required_solved,
                "requiredTotal": len(required_ids),
                "verifiedCompletion": (
                    required_solved / len(required_ids) if required_ids else 0.0
                ),
                "attemptCount": len(user_attempts),
                "activeAttempts": sum(
                    1 for attempt in user_attempts if attempt.status == "ACTIVE"
                ),
                "completedAttempts": sum(
                    1 for attempt in user_attempts if _attempt_is_completed(attempt)
                ),
                "averageAssessment": sum(scores) / len(scores) if scores else None,
                "averageTrust": (
                    sum(float(attempt.trust_score) for attempt in user_attempts)
                    / len(user_attempts)
                    if user_attempts
                    else None
                ),
                "lastSolve": _timestamp(row["lastSolve"]),
            }
        )
    rows.sort(key=lambda item: (item["name"], item["userId"]))
    return {
        "challengeCount": len(challenge_ids),
        "requiredChallengeCount": len(required_ids),
        "studentCount": len(rows),
        "verifiedCompleteCount": sum(
            1 for row in rows if row["verifiedCompletion"] >= 1
        ),
        "students": rows[:500],
        "truncated": len(rows) > 500,
        "sourceOfTruth": [
            "Solves",
            "LearningAttempts",
            "LearningEvidenceEvents",
            "LearningAssessments",
        ],
        "completionPolicy": (
            "Only verified challenge solves satisfy required completion; "
            "content views and preview browsing are engagement signals only."
        ),
    }


def _bounded_agent_fact(value, *, depth=0, text_limit=1000, item_limit=24):
    if isinstance(value, str):
        return value[:text_limit]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if depth >= 4:
        return str(value)[:text_limit]
    if isinstance(value, list):
        return [
            _bounded_agent_fact(
                item,
                depth=depth + 1,
                text_limit=text_limit,
                item_limit=item_limit,
            )
            for item in value[:item_limit]
        ]
    if isinstance(value, dict):
        return {
            str(key)[:96]: _bounded_agent_fact(
                item,
                depth=depth + 1,
                text_limit=text_limit,
                item_limit=item_limit,
            )
            for key, item in list(value.items())[:item_limit]
        }
    return str(value)[:text_limit]


def _material_analysis_view(value, *, detailed=True):
    analysis = scrub_payload(value) if isinstance(value, dict) else {}
    functional_points = analysis.get("functionalPoints")
    if not isinstance(functional_points, list):
        functional_points = []
    knowledge_graph = analysis.get("knowledgeGraph")
    if not isinstance(knowledge_graph, dict):
        knowledge_graph = {}
    nodes = knowledge_graph.get("nodes")
    edges = knowledge_graph.get("edges")
    chapters = analysis.get("chapterCandidates")
    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []
    if not isinstance(chapters, list):
        chapters = []
    return {
        "summary": str(analysis.get("summary") or "")[:1200],
        "functionalPoints": [
            _bounded_agent_fact(item, text_limit=200, item_limit=4)
            for item in (functional_points[:10] if detailed else [])
        ],
        "knowledgeGraph": {
            "nodes": [
                _bounded_agent_fact(item, text_limit=160, item_limit=4)
                for item in (nodes[:12] if detailed else [])
            ],
            "edges": [
                _bounded_agent_fact(item, text_limit=160, item_limit=5)
                for item in (edges[:16] if detailed else [])
            ],
        },
        "chapterCandidates": [
            _bounded_agent_fact(item, text_limit=400, item_limit=8)
            for item in chapters[:12]
            if isinstance(item, dict)
        ],
    }


def _teacher_agent_context(user, thread):
    available_courses = _teacher_dojos(user)[:200]
    snapshot = {
        "generatedAt": _timestamp(datetime.datetime.utcnow()),
        "scope": {
            "teacherId": user.id,
            "threadId": thread.id,
            "dojoId": thread.dojo_id,
            "moduleIndex": thread.module_index,
            "phase": thread.phase,
        },
        "course": None,
        "availableCourses": [
            {
                "referenceId": dojo.reference_id,
                "name": dojo.name,
                "modules": [
                    {"index": module.module_index, "name": module.name}
                    for module in dojo.modules[:100]
                ],
            }
            for dojo in available_courses
        ],
        "materials": {"statusCounts": {}, "recent": []},
        "pendingAttachments": _thread_attachment_views(thread, user),
        "candidateSets": {"statusCounts": {}},
        "artifacts": {"statusCounts": {}, "recent": []},
        "assignments": {"statusCounts": {}, "recent": []},
        "nativeAuthoring": {"recentDrafts": [], "recentJobs": []},
        "jobs": {"statusCounts": {}, "recent": []},
        "classrooms": {"statusCounts": {}, "recent": []},
        "pendingApprovals": [],
        "verifiedProgress": None,
    }
    if thread.dojo_id is None:
        return snapshot

    dojo = dojo_for_user(user, thread.dojo_id, teacher=True)
    module = (
        DojoModules.query.filter_by(
            dojo_id=dojo.dojo_id,
            module_index=thread.module_index,
        ).first()
        if thread.module_index is not None
        else None
    )
    snapshot["course"] = {
        "id": dojo.dojo_id,
        "referenceId": dojo.reference_id,
        "name": dojo.name,
        "description": dojo.description,
        "access": "public" if dojo.type == "public" else "private",
        "official": bool(dojo.official),
        "repositoryBacked": bool(dojo.repository),
        "showScoreboard": bool(dojo.show_scoreboard),
        "moduleCount": DojoModules.query.filter_by(dojo_id=dojo.dojo_id).count(),
        "modules": [
            {
                "index": item.module_index,
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "showChallenges": bool(item.show_challenges),
                "showScoreboard": bool(item.show_scoreboard),
                "challenges": [
                    {
                        "id": challenge.id,
                        "name": challenge.name,
                        "required": bool(challenge.required),
                        "exerciseMode": challenge.exercise_mode,
                    }
                    for challenge in item.challenges[:100]
                    if is_supported_exercise(challenge)
                ],
            }
            for item in dojo.modules[:100]
        ],
        "members": [
            {
                "username": membership.user.name,
                "role": "teacher" if membership.type == "admin" else "student",
            }
            for membership in DojoUsers.query.filter_by(dojo_id=dojo.dojo_id)
            .order_by(DojoUsers.type, DojoUsers.user_id)
            .limit(500)
            .all()
            if membership.user is not None
        ],
        "selectedModule": (
            {
                "index": module.module_index,
                "id": module.id,
                "name": module.name,
                "description": module.description,
                "challenges": [
                    {
                        "id": challenge.id,
                        "challengeId": challenge.challenge_id,
                        "name": challenge.name or challenge.id,
                        "required": bool(challenge.required),
                        "exerciseMode": challenge.exercise_mode,
                    }
                    for challenge in module.challenges[:200]
                    if is_supported_exercise(challenge)
                ],
            }
            if module
            else None
        ),
    }

    material_query = TeachingMaterials.query.filter_by(
        owner_id=user.id,
        dojo_id=dojo.dojo_id,
    )
    recent_materials = (
        material_query.order_by(TeachingMaterials.updated.desc()).limit(10).all()
    )
    focused_material_ids = {row.id for row in recent_materials}
    recent_material_views = []
    for row in recent_materials:
        revision = (
            TeachingMaterialRevisions.query.filter_by(material_id=row.id)
            .order_by(TeachingMaterialRevisions.revision.desc())
            .first()
        )
        analysis = (
            (revision.metadata_json or {}).get("analysis")
            if revision is not None
            else None
        )
        detailed_analysis = row.id in focused_material_ids
        analysis_view = _material_analysis_view(
            analysis,
            detailed=detailed_analysis,
        )
        chapters = analysis_view.pop("chapterCandidates")
        recent_material_views.append(
            {
                "id": row.id,
                "title": row.title,
                "filename": row.filename,
                "status": row.status,
                "analysisStatus": revision.status if revision else None,
                "revision": revision.revision if revision else None,
                "analysis": analysis_view,
                "chapterCandidates": [
                    {
                        "index": index,
                        "title": str(chapter.get("title") or f"章节 {index + 1}")[:128],
                        "description": str(
                            chapter.get("description") or chapter.get("summary") or ""
                        )[:500],
                        "objectives": [
                            str(objective)[:220]
                            for objective in (
                                chapter.get("objectives")
                                if isinstance(chapter.get("objectives"), list)
                                else []
                            )[:4]
                        ],
                        **(
                            {}
                            if detailed_analysis
                            else {"description": "", "objectives": []}
                        ),
                    }
                    for index, chapter in enumerate(chapters[:50])
                    if isinstance(chapter, dict)
                ],
            }
        )
    snapshot["materials"] = {
        "statusCounts": _status_counts(
            material_query,
            TeachingMaterials.status,
            TeachingMaterials.id,
        ),
        "focusedIds": sorted(focused_material_ids),
        "recent": recent_material_views,
    }
    candidate_query = TeachingCandidateSets.query.filter_by(
        owner_id=user.id,
        dojo_id=dojo.dojo_id,
    )
    snapshot["candidateSets"] = {
        "statusCounts": _status_counts(
            candidate_query,
            TeachingCandidateSets.status,
            TeachingCandidateSets.id,
        )
    }
    artifact_query = TeachingArtifacts.query.filter_by(
        owner_id=user.id,
        dojo_id=dojo.dojo_id,
    )
    artifact_rows = (
        artifact_query.order_by(TeachingArtifacts.created.desc()).limit(50).all()
    )

    def artifact_thread_id(row):
        candidate = row.candidate
        candidate_set = candidate.candidate_set if candidate is not None else None
        return candidate_set.thread_id if candidate_set is not None else None

    current_conversation_artifacts = [
        row for row in artifact_rows if artifact_thread_id(row) == thread.id
    ]
    other_artifacts = [
        row for row in artifact_rows if artifact_thread_id(row) != thread.id
    ]

    def artifact_context_view(row):
        return {
            "id": row.id,
            "title": row.title,
            "type": row.artifact_type,
            "status": row.status,
            "revision": row.current_revision,
            "created": _timestamp(row.created),
            "updated": _timestamp(row.updated),
            "currentConversation": artifact_thread_id(row) == thread.id,
            "publishedChallengeId": row.published_challenge_id,
        }

    snapshot["artifacts"] = {
        "statusCounts": _status_counts(
            artifact_query,
            TeachingArtifacts.status,
            TeachingArtifacts.id,
        ),
        "currentConversation": [
            artifact_context_view(row) for row in current_conversation_artifacts[:10]
        ],
        "recent": [
            artifact_context_view(row)
            for row in (current_conversation_artifacts + other_artifacts)[:10]
        ],
    }
    assignment_query = TeachingAssignments.query.filter_by(dojo_id=dojo.dojo_id)
    recent_assignments = (
        assignment_query.order_by(TeachingAssignments.updated.desc()).limit(10).all()
    )
    snapshot["assignments"] = {
        "statusCounts": _status_counts(
            assignment_query,
            TeachingAssignments.status,
            TeachingAssignments.id,
        ),
        "recent": [
            {
                "id": assignment.id,
                "title": assignment.title,
                "kind": assignment.kind,
                "status": assignment.status,
                "moduleIndex": assignment.module_index,
                "itemCount": len(assignment.items),
                "submissions": [
                    {
                        "id": row["submission"]["id"],
                        "studentName": row["studentName"],
                        "status": row["submission"]["status"],
                        "score": row["submission"]["score"],
                        "maxScore": row["submission"]["maxScore"],
                    }
                    for row in roster_submissions(assignment)[:100]
                    if row.get("submission")
                ],
            }
            for assignment in recent_assignments
        ],
    }
    recent_drafts = (
        LearningDrafts.query.filter_by(
            author_id=user.id,
            dojo_id=dojo.dojo_id,
        )
        .filter(LearningDrafts.status != "DELETED")
        .order_by(LearningDrafts.updated.desc())
        .limit(10)
        .all()
    )
    recent_authoring_jobs = (
        LearningAuthoringJobs.query.filter_by(
            author_id=user.id,
            dojo_id=dojo.dojo_id,
        )
        .order_by(LearningAuthoringJobs.updated.desc())
        .limit(10)
        .all()
    )
    snapshot["nativeAuthoring"] = {
        "recentDrafts": [
            {
                "id": row.id,
                "title": str((row.spec or {}).get("name") or row.brief)[:240],
                "status": row.status,
                "moduleIndex": row.module_index,
                "validationStatus": (row.validation or {}).get("status"),
                "publishedChallengeId": row.published_challenge_id,
            }
            for row in recent_drafts
        ],
        "recentJobs": [
            {
                "id": row.id,
                "draftId": row.draft_id,
                "title": row.title,
                "kind": row.kind,
                "status": row.status,
                "stage": row.stage,
                "progress": row.progress,
            }
            for row in recent_authoring_jobs
        ],
    }
    job_query = TeachingJobs.query.filter_by(
        owner_id=user.id,
        dojo_id=dojo.dojo_id,
    )
    snapshot["jobs"] = {
        "statusCounts": _status_counts(
            job_query,
            TeachingJobs.status,
            TeachingJobs.id,
        ),
        "recent": [
            {
                "id": row.id,
                "kind": row.kind,
                "status": row.status,
                "stage": row.stage,
                "progress": row.progress,
                "error": row.error[:1000] if row.error else None,
            }
            for row in job_query.order_by(TeachingJobs.updated.desc()).limit(10).all()
        ],
    }
    classroom_query = TeachingSessions.query.filter_by(dojo_id=dojo.dojo_id)
    snapshot["classrooms"] = {
        "statusCounts": _status_counts(
            classroom_query,
            TeachingSessions.status,
            TeachingSessions.id,
        ),
        "recent": [
            {
                "id": row.id,
                "title": row.title,
                "status": row.status,
                "moduleIndex": row.module_index,
                "started": _timestamp(row.started),
                "ended": _timestamp(row.ended),
            }
            for row in classroom_query.order_by(TeachingSessions.updated.desc())
            .limit(10)
            .all()
        ],
    }
    pending = (
        TeachingAgentActions.query.filter_by(status="AWAITING_APPROVAL")
        .order_by(TeachingAgentActions.created.desc())
        .limit(500)
        .all()
    )
    snapshot["pendingApprovals"] = [
        {
            "id": row.id,
            "type": row.action_type,
            "riskLevel": row.risk_level,
            "targetType": row.target_type,
            "targetId": row.target_id,
            "title": (row.request_json or {}).get("title"),
            "sourceJobId": (row.request_json or {}).get("sourceJobId"),
        }
        for row in pending
        if (row.request_json or {}).get("dojoId") == dojo.dojo_id
    ][:50]
    snapshot["verifiedProgress"] = _agent_progress_snapshot(dojo)
    return snapshot


def _agent_tool_platform_observation(tool, facts):
    if not isinstance(facts, dict):
        return None
    if tool == "dojo.select":
        return {"scope": facts.get("scope"), "course": facts.get("course")}
    if tool == "progress.read":
        return facts.get("verifiedProgress")
    if tool.startswith("material."):
        return {
            "materials": facts.get("materials"),
            "jobs": facts.get("jobs"),
            "pendingApprovals": facts.get("pendingApprovals"),
        }
    if tool.startswith("candidate."):
        return {
            "candidateSets": facts.get("candidateSets"),
            "jobs": facts.get("jobs"),
        }
    if tool.startswith("artifact."):
        return {
            "artifacts": facts.get("artifacts"),
            "jobs": facts.get("jobs"),
            "pendingApprovals": facts.get("pendingApprovals"),
        }
    if tool.startswith("job."):
        return facts.get("jobs")
    if tool.startswith("approval."):
        return facts.get("pendingApprovals")
    if tool.startswith("classroom."):
        return {
            "classrooms": facts.get("classrooms"),
            "pendingApprovals": facts.get("pendingApprovals"),
        }
    return None


def _generation_batch_dashboard_view(batch, dojo, module):
    counts = dict(batch.counts or {})
    requested_count = int(batch.requested_count or 0)
    created_count = int(counts.get("created") or 0)
    validated_count = int(counts.get("validated") or 0)
    failed_count = int(counts.get("failed") or 0)
    status = str(batch.status or "QUEUED").lower()
    next_action = (
        "retry_failed"
        if status in {"partial_success", "failed"} and failed_count
        else "review_results"
        if status == "needs_review"
        else "open_task"
        if status in {"queued", "generating", "validating"}
        else "view_history"
    )
    started_at = batch.confirmed or batch.created
    ended_at = batch.completed or datetime.datetime.utcnow()
    return {
        "id": batch.id,
        "kind": "generation_batch",
        "status": status,
        "course": {
            "id": dojo.dojo_id,
            "referenceId": dojo.reference_id,
            "name": dojo.name,
        }
        if dojo is not None
        else None,
        "module": {
            "index": batch.module_index,
            "id": module.id if module is not None else None,
            "name": module.name if module is not None else None,
        },
        "requestedCount": requested_count,
        "createdCount": created_count,
        "validatedCount": validated_count,
        "failedCount": failed_count,
        "threadId": batch.thread_id,
        "nextAction": next_action,
        "reviewUrl": (
            f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&batchId={batch.id}"
            if dojo is not None
            else None
        ),
        "elapsedSeconds": max(0, int((ended_at - started_at).total_seconds())),
        "updated": _timestamp(batch.updated),
    }


def _generation_batch_task_view(batch, dojo, module):
    result = _generation_batch_dashboard_view(batch, dojo, module)
    review_url = result.get("reviewUrl")
    items = []
    for item in batch.items:
        spec = item.spec if isinstance(item.spec, dict) else {}
        item_review_url = review_url
        if item_review_url and item.draft_id:
            separator = "&" if "?" in item_review_url else "?"
            item_review_url = (
                f"{item_review_url}{separator}selectedId={quote(str(item.draft_id), safe='')}"
            )
        items.append(
            {
                "id": item.id,
                "itemIndex": item.item_index,
                "title": str(
                    spec.get("title") or f"独立 CTF 题目 {item.item_index}"
                )[:180],
                "difficulty": str(spec.get("difficulty") or "按要求递进")[:80],
                "status": str(item.status or "PLANNED").lower(),
                "failure": redact_text(item.error, limit=500)
                if item.error
                else None,
                "resultTarget": (
                    {"kind": "link", "href": item_review_url}
                    if item_review_url and item.draft_id
                    else None
                ),
            }
        )
    result.update(
        {
            "items": items,
            "created": _timestamp(batch.created),
            "completed": _timestamp(batch.completed),
        }
    )
    return result


def _job_collection_result(job):
    raw_result = job.result if isinstance(job.result, dict) else {}
    if "_generationCheckpoint" in raw_result:
        checkpoint = raw_result.get("_generationCheckpoint") or {}
        raw_result = {
            "checkpointStage": "generated",
            "requestHash": checkpoint.get("requestHash"),
        }
    result = {}
    for key in (
        "artifactId",
        "assignmentId",
        "candidateSetId",
        "challengeId",
        "draftId",
        "environmentId",
        "generationMode",
        "materialId",
        "materializationJobId",
    ):
        value = raw_result.get(key)
        if value not in (None, ""):
            result[key] = value
    for key, limit in (("title", 240), ("summary", 500)):
        value = str(raw_result.get(key) or "").strip()
        if value:
            result[key] = value[:limit]
    return result


def _job_collection_target(job, result, dojo, module, materialization_job):
    payload = job.payload if isinstance(job.payload, dict) else {}
    kind = str(job.kind or "")
    artifact_id = result.get("artifactId") or payload.get("artifactId")
    candidate_set_id = result.get("candidateSetId") or payload.get(
        "candidateSetId"
    )
    if kind in {"candidate.generate", "self.candidate.generate"}:
        if (
            artifact_id
            and materialization_job is not None
            and str(materialization_job.status or "").upper() == "SUCCEEDED"
        ):
            return {
                "kind": "link",
                "href": f"/teacher/artifacts/{quote(str(artifact_id), safe='')}",
            }
        if candidate_set_id:
            return {
                "kind": "candidate",
                "candidateSetId": str(candidate_set_id),
            }
    if artifact_id:
        return {
            "kind": "link",
            "href": f"/teacher/artifacts/{quote(str(artifact_id), safe='')}",
        }
    if dojo is None:
        return {"kind": "conversation"}
    query = {"dojo": dojo.reference_id}
    if kind == "learning.authoring":
        query["tab"] = "questions"
        draft_id = result.get("draftId") or payload.get("draftId")
        if draft_id:
            query["selectedId"] = str(draft_id)
    elif result.get("materialId") or payload.get("materialId"):
        query.update(
            {
                "tab": "courseware",
                "material": result.get("materialId") or payload.get("materialId"),
            }
        )
    elif result.get("assignmentId") or payload.get("assignmentId"):
        query.update(
            {
                "tab": "labs",
                "assignment": result.get("assignmentId")
                or payload.get("assignmentId"),
            }
        )
    elif result.get("challengeId") or payload.get("challengeId"):
        query.update(
            {
                "tab": "labs",
                "challenge": result.get("challengeId") or payload.get("challengeId"),
            }
        )
    elif kind == "agent.chat":
        return {"kind": "conversation"}
    else:
        query["tab"] = "labs" if kind.startswith("learning.") else "overview"
    if module is not None:
        query["module"] = module.id
    return {"kind": "link", "href": f"/teacher/courses?{urlencode(query)}"}


def _job_collection_view(job, dojo, module, materialization_job):
    result = _job_collection_result(job)
    payload = job.payload if isinstance(job.payload, dict) else {}
    display_job = materialization_job or job
    status = display_job.status
    stage = display_job.stage
    updated = display_job.updated
    completed = display_job.completed
    progress = int(job.progress or 0)
    if materialization_job is not None:
        progress = (
            100
            if str(status or "").upper() == "SUCCEEDED"
            else max(50, min(99, 50 + int(materialization_job.progress or 0) // 2))
        )
    if str(status or "").upper() in {"QUEUED", "RUNNING", "CANCEL_REQUESTED"}:
        progress = min(99, max(0, progress))
        if str(stage or "").lower() in {"complete", "completed"}:
            stage = "finalizing"
    title = str(
        result.get("title")
        or payload.get("title")
        or payload.get("brief")
        or payload.get("instruction")
        or ""
    ).strip()[:240]
    view = {
        "id": job.id,
        "kind": job.kind,
        "title": title or None,
        "artifactType": payload.get("artifactType"),
        "taskListHidden": bool(payload.get("taskListHidden")),
        "status": status,
        "stage": stage,
        "progress": progress,
        "traceId": job.trace_id,
        "dojoId": job.dojo_id,
        "moduleIndex": job.module_index,
        "threadId": job.thread_id,
        "attemptCount": job.attempt_count,
        "maxAttempts": job.max_attempts,
        "result": result,
        "error": _job_failure_message(display_job),
        "failureMessage": _job_failure_message(display_job),
        "created": _timestamp(job.created),
        "updated": _timestamp(updated),
        "completed": _timestamp(completed),
        "resultTarget": _job_collection_target(
            job,
            result,
            dojo,
            module,
            materialization_job,
        ),
        "course": (
            {
                "id": dojo.dojo_id,
                "referenceId": dojo.reference_id,
                "name": dojo.name,
            }
            if dojo is not None
            else None
        ),
    }
    if job.kind == "learning.authoring":
        try:
            batch_index = min(5, max(1, int(payload.get("batchIndex") or 1)))
        except (TypeError, ValueError):
            batch_index = 1
        try:
            batch_count = max(batch_index, int(payload.get("batchCount") or 1))
        except (TypeError, ValueError):
            batch_count = batch_index
        view["batch"] = {
            "id": str(payload.get("batchId") or "")[:128] or None,
            "index": batch_index,
            "count": min(5, batch_count),
            "topic": str(payload.get("batchTopic") or "")[:80] or None,
        }
    return view


def _dashboard_learning_change(dojo, *, refresh=False):
    key = f"teaching-dashboard-learning:v3:{dojo.dojo_id}"
    cached = None if refresh else cache.get(key)
    if isinstance(cached, dict):
        return None if cached.get("empty") else cached
    analytics = build_course_learning_analytics(dojo, summary_only=True)
    summary = analytics.get("summary") or {}
    evidence = analytics.get("dataQuality") or {}
    if not any(
        int(summary.get(field) or 0)
        for field in ("highRiskCount", "watchCount", "stalledCount")
    ):
        cache.set(key, {"empty": True}, timeout=45)
        return None
    result = {
        "course": {
            "id": dojo.dojo_id,
            "referenceId": dojo.reference_id,
            "name": dojo.name,
        },
        "highRiskCount": int(summary.get("highRiskCount") or 0),
        "watchCount": int(summary.get("watchCount") or 0),
        "stalledCount": int(summary.get("stalledCount") or 0),
        "unknownCount": int(summary.get("unknownCount") or 0),
        "evidenceCount": int(evidence.get("evidenceEventCount") or 0),
        "studentCount": int(summary.get("studentCount") or 0),
        "confidence": (
            "low"
            if float(summary.get("averageEvidenceConfidence") or 0) < 45
            else "medium"
            if float(summary.get("averageEvidenceConfidence") or 0) < 75
            else "high"
        ),
        "updatedAt": evidence.get("generatedAt"),
        "nextAction": "review_learning",
        "href": f"/teacher/courses?dojo={dojo.reference_id}&tab=students",
    }
    cache.set(key, result, timeout=45)
    return result


def _dashboard_learning_candidates(dojos, limit=8):
    dojo_by_id = {dojo.dojo_id: dojo for dojo in dojos}
    dojo_ids = list(dojo_by_id)
    if not dojo_ids:
        return [], 0
    facts = {
        dojo_id: {
            "attempts": 0,
            "activeAttempts": 0,
            "oldestActiveAt": None,
            "events": 0,
            "concernEvents": 0,
            "skillEvidence": 0,
            "lowSkills": 0,
            "solves": 0,
            "latestAt": None,
        }
        for dojo_id in dojo_ids
    }

    def update_latest(row, value):
        if value is not None and (
            row["latestAt"] is None or value > row["latestAt"]
        ):
            row["latestAt"] = value

    attempt_rows = (
        db.session.query(
            LearningAttempts.dojo_id,
            func.count(LearningAttempts.id),
            func.max(LearningAttempts.started),
            func.sum(
                case((LearningAttempts.status == "ACTIVE", 1), else_=0)
            ),
            func.min(
                case(
                    (LearningAttempts.status == "ACTIVE", LearningAttempts.started),
                    else_=None,
                )
            ),
        )
        .filter(LearningAttempts.dojo_id.in_(dojo_ids))
        .group_by(LearningAttempts.dojo_id)
        .all()
    )
    for dojo_id, count, latest_at, active_count, oldest_active_at in attempt_rows:
        row = facts[dojo_id]
        row["attempts"] = int(count or 0)
        row["activeAttempts"] = int(active_count or 0)
        row["oldestActiveAt"] = oldest_active_at
        update_latest(row, latest_at)

    concern_event_types = (
        "terminal.command.failed",
        "lab.reset.requested",
        "lab.interrupted",
        "simulation.interrupted",
    )
    evidence_rows = (
        db.session.query(
            LearningAttempts.dojo_id,
            func.count(LearningEvidenceEvents.id),
            func.max(LearningEvidenceEvents.occurred),
            func.sum(
                case(
                    (LearningEvidenceEvents.event_type.in_(concern_event_types), 1),
                    else_=0,
                )
            ),
        )
        .join(
            LearningEvidenceEvents,
            LearningEvidenceEvents.attempt_id == LearningAttempts.id,
        )
        .filter(LearningAttempts.dojo_id.in_(dojo_ids))
        .group_by(LearningAttempts.dojo_id)
        .all()
    )
    for dojo_id, count, latest_at, concern_count in evidence_rows:
        row = facts[dojo_id]
        row["events"] = int(count or 0)
        row["concernEvents"] = int(concern_count or 0)
        update_latest(row, latest_at)

    skill_rows = (
        db.session.query(
            LearningSkillStates.dojo_id,
            func.sum(LearningSkillStates.evidence_count),
            func.max(LearningSkillStates.updated),
            func.sum(
                case(
                    (
                        (LearningSkillStates.evidence_count > 0)
                        & (LearningSkillStates.mastery < 60),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .filter(LearningSkillStates.dojo_id.in_(dojo_ids))
        .group_by(LearningSkillStates.dojo_id)
        .all()
    )
    for dojo_id, evidence_count, latest_at, low_skill_count in skill_rows:
        row = facts[dojo_id]
        row["skillEvidence"] = int(evidence_count or 0)
        row["lowSkills"] = int(low_skill_count or 0)
        update_latest(row, latest_at)

    solve_rows = (
        db.session.query(
            DojoChallenges.dojo_id,
            func.count(func.distinct(Solves.id)),
            func.max(Solves.date),
        )
        .join(Solves, Solves.challenge_id == DojoChallenges.challenge_id)
        .filter(DojoChallenges.dojo_id.in_(dojo_ids))
        .group_by(DojoChallenges.dojo_id)
        .all()
    )
    for dojo_id, count, latest_at in solve_rows:
        row = facts[dojo_id]
        row["solves"] = int(count or 0)
        update_latest(row, latest_at)

    now = datetime.datetime.utcnow()
    stale_before = now - datetime.timedelta(days=7)
    candidates = []
    for dojo_id, row in facts.items():
        activity_count = (
            row["attempts"]
            + row["events"]
            + row["skillEvidence"]
            + row["solves"]
        )
        if activity_count <= 0:
            continue
        stale_active = (
            row["activeAttempts"]
            if row["oldestActiveAt"] is not None
            and row["oldestActiveAt"] <= stale_before
            else 0
        )
        concern_score = (
            row["lowSkills"] * 8
            + stale_active * 5
            + row["concernEvents"] * 2
        )
        candidates.append(
            (
                concern_score,
                row["lowSkills"],
                stale_active,
                row["latestAt"] or datetime.datetime.min,
                activity_count,
                dojo_by_id[dojo_id],
            )
        )
    candidates.sort(key=lambda item: item[:-1], reverse=True)
    return [item[-1] for item in candidates[:limit]], len(candidates)


def _dashboard_learning_changes(dojos, limit=8, *, refresh=False):
    candidates, candidate_count = _dashboard_learning_candidates(dojos, limit=limit)
    changes = []
    for dojo in candidates:
        try:
            change = _dashboard_learning_change(dojo, refresh=refresh)
        except Exception:
            logger.exception(
                "Unable to build dashboard learning change for dojo %s",
                dojo.dojo_id,
            )
            continue
        if change is not None:
            changes.append(change)
    changes.sort(
        key=lambda item: (
            int(item.get("highRiskCount") or 0),
            int(item.get("stalledCount") or 0),
            int(item.get("watchCount") or 0),
            int(item.get("evidenceCount") or 0),
            str(item.get("updatedAt") or ""),
        ),
        reverse=True,
    )
    return changes[:limit], {
        "totalCandidateCourses": candidate_count,
        "analyzedCourseCount": len(candidates),
        "resultCount": min(limit, len(changes)),
        "truncated": candidate_count > len(candidates),
        "limit": limit,
    }


@teaching_namespace.route("/dashboard")
class TeachingDashboard(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            view = str(request.args.get("view") or "full").strip().lower()
            as_of = datetime.datetime.utcnow()
            dojos = _teacher_dojos(user)
            dojo_ids = [dojo.dojo_id for dojo in dojos]
            dojo_by_id = {dojo.dojo_id: dojo for dojo in dojos}
            if view == "learning":
                refresh = str(request.args.get("refresh") or "").strip() == "1"
                learning_changes, scope = _dashboard_learning_changes(
                    dojos,
                    refresh=refresh,
                )
                return _ok(
                    {
                        "learningChanges": learning_changes,
                        "count": len(learning_changes),
                        "scope": scope,
                        "asOf": _timestamp(as_of),
                        "refreshAfterSeconds": 45,
                        "refreshed": refresh,
                    }
                )
            summaries = _dojo_summary_views(dojos)
            summary_by_id = {row["id"]: row for row in summaries}
            module_by_key = {
                (module.dojo_id, module.module_index): module
                for module in (
                    DojoModules.query.filter(DojoModules.dojo_id.in_(dojo_ids)).all()
                    if dojo_ids
                    else []
                )
            }

            batches = (
                TeachingGenerationBatches.query.filter(
                    TeachingGenerationBatches.owner_id == user.id,
                    TeachingGenerationBatches.dojo_id.in_(dojo_ids),
                )
                .options(
                    load_only(
                        TeachingGenerationBatches.id,
                        TeachingGenerationBatches.dojo_id,
                        TeachingGenerationBatches.module_index,
                        TeachingGenerationBatches.thread_id,
                        TeachingGenerationBatches.status,
                        TeachingGenerationBatches.requested_count,
                        TeachingGenerationBatches.counts,
                        TeachingGenerationBatches.created,
                        TeachingGenerationBatches.confirmed,
                        TeachingGenerationBatches.updated,
                        TeachingGenerationBatches.completed,
                    )
                )
                .order_by(TeachingGenerationBatches.updated.desc())
                .limit(200)
                .all()
                if dojo_ids
                else []
            )
            batch_views = [
                _generation_batch_dashboard_view(
                    batch,
                    dojo_by_id.get(batch.dojo_id),
                    module_by_key.get((batch.dojo_id, batch.module_index)),
                )
                for batch in batches
            ]
            batch_ids = [batch.id for batch in batches]
            batch_task_ids = {
                task_id
                for task_id, in (
                    db.session.query(TeachingGenerationBatchItems.task_id)
                    .filter(
                        TeachingGenerationBatchItems.batch_id.in_(batch_ids),
                        TeachingGenerationBatchItems.task_id.isnot(None),
                    )
                    .all()
                    if batch_ids
                    else []
                )
            }
            active_jobs = (
                TeachingJobs.query.filter(
                    TeachingJobs.owner_id == user.id,
                    TeachingJobs.dojo_id.in_(dojo_ids),
                    TeachingJobs.status.in_(("QUEUED", "RUNNING", "CANCEL_REQUESTED")),
                )
                .options(
                    # Active task cards use progress metadata, never the often
                    # large generated result or event history.
                    load_only(
                        TeachingJobs.id,
                        TeachingJobs.dojo_id,
                        TeachingJobs.module_index,
                        TeachingJobs.thread_id,
                        TeachingJobs.kind,
                        TeachingJobs.status,
                        TeachingJobs.stage,
                        TeachingJobs.progress,
                        TeachingJobs.payload,
                        TeachingJobs.created,
                        TeachingJobs.updated,
                    )
                )
                .order_by(TeachingJobs.updated.desc())
                .limit(200)
                .all()
                if dojo_ids
                else []
            )

            waiting_confirmations = []
            recent_messages = (
                TeachingAgentMessages.query.join(
                    TeachingAgentThreads,
                    TeachingAgentThreads.id == TeachingAgentMessages.thread_id,
                )
                .filter(
                    TeachingAgentThreads.user_id == user.id,
                    TeachingAgentThreads.status == "ACTIVE",
                    TeachingAgentMessages.role == "assistant",
                )
                .options(
                    # Plan confirmations only inspect metadata. Avoid loading
                    # assistant prose and the thread's full agent context.
                    load_only(
                        TeachingAgentMessages.id,
                        TeachingAgentMessages.thread_id,
                        TeachingAgentMessages.metadata_json,
                        TeachingAgentMessages.created,
                    ),
                    selectinload(TeachingAgentMessages.thread).load_only(
                        TeachingAgentThreads.id,
                        TeachingAgentThreads.dojo_id,
                        TeachingAgentThreads.module_index,
                    ),
                )
                .order_by(TeachingAgentMessages.created.desc())
                .limit(300)
                .all()
            )
            for message in recent_messages:
                selection = (message.metadata_json or {}).get("generationSelection")
                if not isinstance(selection, dict) or str(selection.get("status") or "").upper() != "SELECTED":
                    continue
                thread = message.thread
                dojo = dojo_by_id.get(thread.dojo_id)
                module = module_by_key.get((thread.dojo_id, thread.module_index))
                waiting_confirmations.append(
                    {
                        "id": f"confirmation:{message.id}",
                        "kind": "generation_confirmation",
                        "status": "waiting_confirmation",
                        "title": str(selection.get("title") or "确认生成计划")[:160],
                        "course": {
                            "id": dojo.dojo_id,
                            "referenceId": dojo.reference_id,
                            "name": dojo.name,
                        }
                        if dojo
                        else None,
                        "module": {
                            "index": module.module_index,
                            "id": module.id,
                            "name": module.name,
                        }
                        if module
                        else None,
                        "threadId": thread.id,
                        "sourceMessageId": message.id,
                        "nextAction": "confirm_plan",
                        "href": f"/teacher?thread={thread.id}&message={message.id}",
                        "updated": _timestamp(message.created),
                    }
                )

            attention = list(waiting_confirmations)
            for batch in batch_views:
                if batch["status"] in {"needs_review", "partial_success", "failed"}:
                    attention.append(
                        {
                            "id": batch["id"],
                            "kind": "generation_batch",
                            "status": batch["status"],
                            "title": f"{batch['requestedCount']} 道独立 CTF 题目",
                            "course": batch["course"],
                            "module": batch["module"],
                            "requestedCount": batch["requestedCount"],
                            "createdCount": batch["createdCount"],
                            "validatedCount": batch["validatedCount"],
                            "failedCount": batch["failedCount"],
                            "threadId": batch["threadId"],
                            "nextAction": batch["nextAction"],
                            "href": batch["reviewUrl"],
                            "updated": batch["updated"],
                        }
                    )
            existing_attention_ids = {str(item["id"]) for item in attention}
            for summary in summaries:
                for item in summary.get("attention", []):
                    if str(item.get("objectId")) in existing_attention_ids:
                        continue
                    attention.append(
                        {
                            "id": item.get("objectId"),
                            "kind": item.get("objectType"),
                            "status": item.get("state"),
                            "title": item.get("title"),
                            "course": {
                                "id": summary["id"],
                                "referenceId": summary["referenceId"],
                                "name": summary["name"],
                            },
                            "module": {"index": item.get("moduleIndex")},
                            "nextAction": item.get("nextAction"),
                            "href": (
                                f"/teacher/courses?dojo={summary['referenceId']}&tab=questions"
                                if item.get("objectType") in {"question", "generation_batch"}
                                else f"/teacher/artifacts/{item.get('objectId')}"
                            ),
                            "updated": item.get("updated"),
                        }
                    )

            active_tasks = [
                {
                    "id": batch["id"],
                    "kind": "generation_batch",
                    "status": batch["status"],
                    "title": f"生成 {batch['requestedCount']} 道独立 CTF 题目",
                    "course": batch["course"],
                    "module": batch["module"],
                    "requestedCount": batch["requestedCount"],
                    "createdCount": batch["createdCount"],
                    "validatedCount": batch["validatedCount"],
                    "failedCount": batch["failedCount"],
                    "elapsedSeconds": batch["elapsedSeconds"],
                    "nextAction": batch["nextAction"],
                    "href": batch["reviewUrl"],
                    "updated": batch["updated"],
                }
                for batch in batch_views
                if batch["status"] in {"queued", "generating", "validating"}
            ]
            for job in active_jobs:
                if job.id in batch_task_ids or job.kind == "agent.chat":
                    continue
                dojo = dojo_by_id.get(job.dojo_id)
                module = module_by_key.get((job.dojo_id, job.module_index))
                active_tasks.append(
                    {
                        "id": job.id,
                        "kind": "task",
                        "status": (
                            "validating"
                            if "valid" in str(job.stage or "").lower()
                            else "generating"
                            if job.status == "RUNNING"
                            else "queued"
                        ),
                        "title": str(
                            (job.payload or {}).get("title")
                            or (job.payload or {}).get("artifactType")
                            or "教学内容生成任务"
                        )[:160],
                        "course": {
                            "id": dojo.dojo_id,
                            "referenceId": dojo.reference_id,
                            "name": dojo.name,
                        }
                        if dojo
                        else None,
                        "module": {
                            "index": module.module_index,
                            "id": module.id,
                            "name": module.name,
                        }
                        if module
                        else None,
                        "requestedCount": 1,
                        "createdCount": 0,
                        "validatedCount": 0,
                        "failedCount": 0,
                        "elapsedSeconds": max(
                            0, int((as_of - job.created).total_seconds())
                        ),
                        "nextAction": "open_task",
                        "href": (
                            f"/teacher?thread={job.thread_id}&job={job.id}"
                            if job.thread_id
                            else None
                        ),
                        "updated": _timestamp(job.updated),
                    }
                )

            learning_changes = (
                [] if view == "core" else _dashboard_learning_changes(dojos)
            )
            attention.sort(key=lambda item: str(item.get("updated") or ""), reverse=True)
            active_tasks.sort(key=lambda item: str(item.get("updated") or ""), reverse=True)

            recent_course_times = {dojo_id: datetime.datetime.min for dojo_id in dojo_ids}
            for model in (
                TeachingGenerationBatches,
                TeachingJobs,
                TeachingArtifacts,
                TeachingMaterials,
                LearningDrafts,
            ):
                rows = (
                    db.session.query(model.dojo_id, func.max(model.updated))
                    .filter(model.dojo_id.in_(dojo_ids))
                    .group_by(model.dojo_id)
                    .all()
                    if dojo_ids
                    else []
                )
                for dojo_id, updated in rows:
                    if updated and updated > recent_course_times[dojo_id]:
                        recent_course_times[dojo_id] = updated
            recent_courses = []
            for dojo_id, updated in sorted(
                recent_course_times.items(),
                key=lambda row: row[1],
                reverse=True,
            ):
                summary = summary_by_id[dojo_id]
                attention_count = sum(
                    value["needsAttention"]
                    for value in summary.get("counts", {}).values()
                )
                recent_courses.append(
                    {
                        "id": summary["id"],
                        "referenceId": summary["referenceId"],
                        "name": summary["name"],
                        "studentCount": summary["studentCount"],
                        "moduleCount": summary["moduleCount"],
                        "challengeCount": summary["challengeCount"],
                        "counts": summary["counts"],
                        "attentionCount": attention_count,
                        "lastActivityAt": _timestamp(updated if updated != datetime.datetime.min else None),
                        "nextAction": "handle_attention" if attention_count else "continue_course",
                        "href": f"/teacher/courses?dojo={summary['referenceId']}",
                    }
                )
            return _ok(
                {
                    "user": {"id": user.id, "name": user.name},
                    "attention": attention[:12],
                    "activeTasks": active_tasks[:12],
                    "recentCourses": recent_courses[:12],
                    "learningChanges": learning_changes,
                    "components": {
                        "learningChanges": "deferred" if view == "core" else "ready"
                    },
                    "counts": {
                        "attention": len(attention),
                        "activeTasks": len(active_tasks),
                        "courses": len(recent_courses),
                        "learningChanges": len(learning_changes),
                    },
                    "scope": {"kind": "teacher", "userId": user.id},
                    "asOf": _timestamp(as_of),
                    "evidenceCount": sum(
                        int((summary.get("evidence") or {}).get("evidenceCount") or 0)
                        for summary in summaries
                    ),
                }
            )
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")


@teaching_namespace.route("/context")
class TeachingContext(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        view = str(request.args.get("view") or "full").strip().lower()
        teacher_only = view in {
            "teacher",
            "teacher-shell",
            "teacher-summary",
            "teacher-focus",
        }
        shell_only = view == "teacher-shell"
        summary_only = view == "teacher-summary"
        focus_only = view == "teacher-focus"
        teacher_dojos = _teacher_dojos(
            user,
            eager=not shell_only and not summary_only and not focus_only,
            include_modules=shell_only,
        )
        focused_dojo = None
        if focus_only:
            focus_value = str(request.args.get("dojo") or "").strip()
            focused_basic = next(
                (
                    dojo
                    for dojo in teacher_dojos
                    if focus_value in {str(dojo.dojo_id), str(dojo.reference_id)}
                ),
                None,
            )
            if focused_basic is not None:
                focused_dojo = (
                    Dojos.query.options(
                        selectinload(Dojos.users),
                        selectinload(Dojos.modules).selectinload(
                            DojoModules.challenges
                        ),
                    )
                    .filter_by(dojo_id=focused_basic.dojo_id)
                    .first()
                )
        student_dojos = (
            []
            if teacher_only
            else Dojos.query.join(DojoUsers)
            .options(
                selectinload(Dojos.users),
                selectinload(Dojos.modules).selectinload(DojoModules.challenges),
            )
            .filter(DojoUsers.user_id == user.id)
            .order_by(Dojos.name, Dojos.dojo_id)
            .all()
        )
        thread = (
            TeachingAgentThreads.query.filter_by(user_id=user.id, status="ACTIVE")
            .filter(TeachingAgentThreads.phase != "SELF_LEARNING")
            .order_by(TeachingAgentThreads.updated.desc())
            .first()
        )
        recent_attempts = (
            []
            if teacher_only
            else (
                LearningAttempts.query.filter_by(user_id=user.id)
                .order_by(LearningAttempts.started.desc())
                .limit(50)
                .all()
            )
        )
        student_dojo_ids = [dojo.dojo_id for dojo in student_dojos]
        live_sessions = (
            TeachingSessions.query.filter(
                TeachingSessions.dojo_id.in_(student_dojo_ids),
                TeachingSessions.status == "LIVE",
            )
            .order_by(TeachingSessions.started.desc(), TeachingSessions.updated.desc())
            .limit(50)
            .all()
            if student_dojo_ids
            else []
        )
        return _ok(
            {
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "isTeacher": bool(teacher_dojos),
                },
                "teacherDojos": (
                    [_dojo_shell_view(dojo) for dojo in teacher_dojos]
                    if shell_only
                    else [_dojo_view(focused_dojo)] if focus_only and focused_dojo
                    else [] if focus_only
                    else
                    _dojo_summary_views(teacher_dojos)
                    if summary_only
                    else [_dojo_view(dojo) for dojo in teacher_dojos]
                ),
                "studentDojos": [_dojo_view(dojo) for dojo in student_dojos],
                "activeThread": _thread_view(thread) if thread else None,
                "learningAttempts": [
                    {
                        "id": attempt.id,
                        "dojoId": attempt.dojo_id,
                        "moduleIndex": attempt.module_index,
                        "challengeId": attempt.challenge_id,
                        "challengeTitle": (
                            attempt.challenge.name
                            if attempt.challenge is not None
                            else str(attempt.challenge_id)
                        ),
                        "status": attempt.status,
                    }
                    for attempt in recent_attempts
                ],
                "liveSessions": [
                    {
                        "id": session.id,
                        "title": session.title,
                        "dojoId": session.dojo_id,
                        "moduleIndex": session.module_index,
                        "started": _timestamp(session.started),
                    }
                    for session in live_sessions
                ],
                "runtimeOrigin": config.AGENT_RUNTIME_PUBLIC_ORIGIN,
                "asOf": _timestamp(datetime.datetime.utcnow()),
            }
        )


@teaching_namespace.route("/courses")
class ManagedCourseCollection(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            page, page_size = _course_content_page_args()
            query = str(request.args.get("q") or "").strip().casefold()[:120]
            status = str(request.args.get("filter") or "all").strip().lower()
            sort = str(request.args.get("sort") or "recent").strip().lower()
            if status not in {"all", "recent", "attention", "drafts", "published"}:
                raise ValueError("课程状态筛选无效。")
            if sort not in {"recent", "attention", "name"}:
                raise ValueError("课程排序方式无效。")
            summaries = _dojo_summary_views(_teacher_dojos(user))
            items = [_dojo_catalog_view(summary) for summary in summaries]

            def aggregates(item):
                values = list((item.get("counts") or {}).values())
                return {
                    "attention": sum(int(value.get("needsAttention") or 0) for value in values),
                    "drafts": sum(int(value.get("draft") or 0) for value in values),
                    "published": sum(int(value.get("published") or 0) for value in values),
                }

            indexed = [(item, aggregates(item)) for item in items]
            counts = {
                "total": len(indexed),
                "recent": sum(bool(item.get("lastActivityAt")) for item, _ in indexed),
                "attention": sum(values["attention"] > 0 for _, values in indexed),
                "drafts": sum(values["drafts"] > 0 for _, values in indexed),
                "published": sum(values["published"] > 0 for _, values in indexed),
            }
            if query:
                indexed = [
                    (item, values)
                    for item, values in indexed
                    if query
                    in f"{item.get('name') or ''} {item.get('description') or ''}".casefold()
                ]
            if status == "recent":
                indexed = [(item, values) for item, values in indexed if item.get("lastActivityAt")]
            elif status in {"attention", "drafts", "published"}:
                indexed = [(item, values) for item, values in indexed if values[status] > 0]
            if sort == "name":
                indexed.sort(key=lambda row: str(row[0].get("name") or "").casefold())
            elif sort == "attention":
                indexed.sort(
                    key=lambda row: (
                        row[1]["attention"],
                        str(row[0].get("lastActivityAt") or ""),
                    ),
                    reverse=True,
                )
            else:
                indexed.sort(
                    key=lambda row: (
                        str(row[0].get("lastActivityAt") or ""),
                        row[1]["attention"],
                        str(row[0].get("name") or "").casefold(),
                    ),
                    reverse=True,
                )
            total = len(indexed)
            start = (page - 1) * page_size
            presented = [item for item, _ in indexed[start : start + page_size]]
            return _ok(
                {
                    "items": presented,
                    "pagination": _course_content_pagination(page, page_size, total),
                    "counts": counts,
                    "filters": {"q": query, "filter": status, "sort": sort},
                    "capabilities": {
                        "canCreate": True,
                        "canRename": True,
                        "canDelete": True,
                    },
                    "asOf": _timestamp(datetime.datetime.utcnow()),
                }
            )
        except ValueError as exc:
            return _error(exc, 400, code="INVALID_REQUEST")
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")

    @authed_only
    def post(self):
        user = _current_user()
        try:
            body = _body()
            name = str(body.get("name") or "").strip()
            description = str(body.get("description") or "").strip()
            requested_slug = str(body.get("slug") or "").strip().lower()
            access = str(body.get("access") or "private").strip().lower()
            if not 1 <= len(name) <= 128:
                raise ValueError("课程名称需包含 1–128 个字符。")
            if len(description) > 24000:
                raise ValueError("课程简介不能超过 24,000 个字符。")
            if requested_slug and not re.fullmatch(
                r"[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?",
                requested_slug,
            ):
                raise ValueError("课程标识需由 1–32 个小写字母、数字或连字符组成。")
            if access not in {"private", "public"}:
                raise ValueError("课程可见范围必须为私有或公开。")
            slug = requested_slug or _automatic_course_slug(name)
            dojo = Dojos(
                id=slug,
                name=name,
                description=description or None,
                type="public" if access == "public" else "course",
                private_key=secrets.token_hex(32),
            )
            ensure_course_join_code(dojo)
            dojo.admins = [DojoAdmins(user=user)]
            db.session.add(dojo)
            db.session.flush()

            initial_module = None
            initial_module_name = str(body.get("initialModuleName") or "").strip()
            if initial_module_name:
                requested_initial_module_id = (
                    str(body.get("initialModuleId") or "").strip().lower()
                )
                initial_description = str(
                    body.get("initialModuleDescription") or ""
                ).strip()
                if not 1 <= len(initial_module_name) <= 128:
                    raise ValueError("首章名称需包含 1–128 个字符。")
                if requested_initial_module_id and not re.fullmatch(
                    r"[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?",
                    requested_initial_module_id,
                ):
                    raise ValueError("首章标识需由 1–32 个小写字母、数字或连字符组成。")
                if len(initial_description) > 24000:
                    raise ValueError("首章简介不能超过 24,000 个字符。")
                initial_module_id = requested_initial_module_id or _module_slug(
                    initial_module_name,
                    "chapter-1",
                )
                initial_module = DojoModules(
                    dojo=dojo,
                    module_index=0,
                    id=initial_module_id,
                    name=initial_module_name,
                    description=initial_description or None,
                    show_scoreboard=True,
                    show_challenges=True,
                )
                db.session.add(initial_module)
                db.session.flush()

            _management_audit(
                user,
                "course.manage.create",
                "dojo",
                dojo.reference_id,
                {
                    "dojoId": dojo.dojo_id,
                    "access": access,
                    "initialModule": initial_module.id if initial_module else None,
                },
            )
            db.session.commit()
            clear_challenges()
            result = {"course": _dojo_view(dojo)}
            if initial_module is not None:
                result["module"] = {
                    "index": initial_module.module_index,
                    "id": initial_module.id,
                    "name": initial_module.name,
                    "description": initial_module.description,
                }
            return _ok(result, 201)
        except (ValueError, IntegrityError) as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")
        except Exception:
            db.session.rollback()
            logger.exception("Unable to create managed course")
            return _error(
                "创建课程失败，未保存任何内容。", 500, code="COURSE_CREATE_FAILED"
            )


def _course_content_page_args():
    try:
        page = max(1, int(request.args.get("page") or 1))
        page_size = min(100, max(1, int(request.args.get("pageSize") or 30)))
    except (TypeError, ValueError) as exc:
        raise ValueError("分页参数必须为正整数。") from exc
    return page, page_size


def _course_content_pagination(page, page_size, total):
    total_pages = max(1, (int(total) + page_size - 1) // page_size)
    return {
        "page": page,
        "pageSize": page_size,
        "total": int(total),
        "totalPages": total_pages,
        "hasPrevious": page > 1,
        "hasNext": page < total_pages,
    }


@teaching_namespace.route("/courses/<string:dojo_id>/content")
class ManagedCourseContentCollection(Resource):
    @authed_only
    def get(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            kind = str(request.args.get("kind") or "courseware").strip().lower()
            if kind not in {
                "materials",
                "courseware",
                "demos",
                "artifacts",
                "questions",
            }:
                raise ValueError("内容类型必须为资料、课件、题目或演示。")
            page, page_size = _course_content_page_args()
            search = str(request.args.get("q") or "").strip()[:240]
            status = str(request.args.get("status") or "").strip().upper()
            artifact_type = str(request.args.get("type") or "").strip().lower()
            source_filter = str(request.args.get("source") or "").strip().lower()
            if source_filter not in {"", "material", "artifact", "direct"}:
                raise ValueError("来源筛选参数无效。")
            sort = str(request.args.get("sort") or "updated_desc").strip().lower()
            module_index = request.args.get("moduleIndex")
            required_filter = str(request.args.get("required") or "").strip().lower()
            mode_filter = str(request.args.get("mode") or "").strip().upper()

            if kind == "questions":
                if required_filter not in {"", "required", "optional"}:
                    raise ValueError("题目要求筛选参数无效。")
                all_items = _course_question_list_views(dojo)
                counts = _content_count(all_items)
                normalized_search = search.casefold()
                normalized_status = status.lower()
                filtered_items = []
                for item in all_items:
                    if normalized_search and normalized_search not in " ".join(
                        (
                            str(item.get("title") or ""),
                            str(item.get("summary") or ""),
                            str(item.get("moduleName") or ""),
                        )
                    ).casefold():
                        continue
                    if normalized_status:
                        if normalized_status == "needs_attention":
                            if not item.get("needsAttention"):
                                continue
                        elif normalized_status == "unpublished":
                            if item.get("state") == "published":
                                continue
                        elif str(item.get("state") or "").lower() != normalized_status:
                            continue
                    if module_index == "unassigned":
                        if item.get("moduleIndex") is not None:
                            continue
                    elif module_index not in (None, ""):
                        try:
                            if int(item.get("moduleIndex")) != int(module_index):
                                continue
                        except (TypeError, ValueError) as exc:
                            raise ValueError("章节筛选参数无效。") from exc
                    if required_filter == "required" and not item.get("required"):
                        continue
                    if required_filter == "optional" and item.get("required"):
                        continue
                    if mode_filter and str(item.get("exerciseMode") or "").upper() != mode_filter:
                        continue
                    filtered_items.append(item)

                if sort == "title_asc":
                    filtered_items.sort(
                        key=lambda item: str(item.get("title") or "").casefold()
                    )
                elif sort == "updated_asc":
                    filtered_items.sort(key=lambda item: str(item.get("updated") or ""))
                elif sort == "course_order":
                    filtered_items.sort(
                        key=lambda item: (
                            item.get("moduleIndex") is None,
                            int(item.get("moduleIndex") or 0),
                            item.get("kind") != "published",
                            str(item.get("title") or "").casefold(),
                        )
                    )
                else:
                    filtered_items.sort(
                        key=lambda item: str(item.get("updated") or ""),
                        reverse=True,
                    )
                total = len(filtered_items)
                total_pages = max(1, (total + page_size - 1) // page_size)
                page = min(page, total_pages)
                items = filtered_items[(page - 1) * page_size : page * page_size]

            elif kind == "materials":
                query = TeachingMaterials.query.filter_by(dojo_id=dojo.dojo_id).filter(
                    TeachingMaterials.status != "ARCHIVED"
                )
                if search:
                    term = f"%{search}%"
                    query = query.filter(
                        or_(
                            TeachingMaterials.title.ilike(term),
                            TeachingMaterials.filename.ilike(term),
                        )
                    )
                if status:
                    query = query.filter(TeachingMaterials.status == status)
                if sort == "title_asc":
                    query = query.order_by(
                        func.lower(TeachingMaterials.title).asc(),
                        TeachingMaterials.updated.desc(),
                    )
                elif sort == "updated_asc":
                    query = query.order_by(TeachingMaterials.updated.asc())
                else:
                    query = query.order_by(TeachingMaterials.updated.desc())
                total = query.order_by(None).count()
                total_pages = max(1, (total + page_size - 1) // page_size)
                page = min(page, total_pages)
                rows = query.offset((page - 1) * page_size).limit(page_size).all()
                items = [_material_attachment_view(row) for row in rows]
            else:
                demo_types = {
                    "simulation",
                    "attack-defense-scene",
                    "classroom-scenario",
                }
                non_courseware_types = QUESTION_ARTIFACT_TYPES | demo_types | {
                    "debate",
                }
                query = TeachingArtifacts.query.filter_by(dojo_id=dojo.dojo_id).filter(
                    TeachingArtifacts.status != "ARCHIVED",
                    TeachingArtifacts.self_workspace_id.is_(None),
                )
                if kind == "demos":
                    query = query.filter(TeachingArtifacts.artifact_type.in_(demo_types))
                elif kind == "courseware":
                    query = query.filter(
                        TeachingArtifacts.artifact_type.notin_(non_courseware_types)
                    )
                if artifact_type:
                    query = query.filter(
                        TeachingArtifacts.artifact_type == artifact_type
                    )
                if search:
                    query = query.filter(TeachingArtifacts.title.ilike(f"%{search}%"))
                if status == "UNPUBLISHED":
                    query = query.filter(TeachingArtifacts.status != "PUBLISHED")
                elif status:
                    query = query.filter(TeachingArtifacts.status == status)
                if module_index == "unassigned":
                    query = query.filter(TeachingArtifacts.module_index.is_(None))
                elif module_index not in (None, ""):
                    try:
                        query = query.filter(
                            TeachingArtifacts.module_index == int(module_index)
                        )
                    except (TypeError, ValueError) as exc:
                        raise ValueError("章节筛选参数无效。") from exc
                if sort == "title_asc":
                    query = query.order_by(
                        func.lower(TeachingArtifacts.title).asc(),
                        TeachingArtifacts.updated.desc(),
                    )
                elif sort == "updated_asc":
                    query = query.order_by(TeachingArtifacts.updated.asc())
                elif sort == "course_order":
                    query = query.order_by(
                        TeachingArtifacts.module_index.is_(None),
                        TeachingArtifacts.module_index.asc(),
                        TeachingArtifacts.sort_order.asc(),
                        TeachingArtifacts.updated.desc(),
                    )
                else:
                    query = query.order_by(TeachingArtifacts.updated.desc())
                if source_filter:
                    filtered_views = []
                    for item in _artifact_list_views(query.all(), user=user):
                        source_summary = item.get("sourceSummary") or {}
                        if source_filter == "material" and source_summary.get("materialCount", 0):
                            filtered_views.append(item)
                        elif source_filter == "artifact" and source_summary.get("artifactCount", 0):
                            filtered_views.append(item)
                        elif source_filter == "direct" and source_summary.get("count", 0) == 0:
                            filtered_views.append(item)
                    total = len(filtered_views)
                    total_pages = max(1, (total + page_size - 1) // page_size)
                    page = min(page, total_pages)
                    items = filtered_views[(page - 1) * page_size : page * page_size]
                else:
                    total = query.order_by(None).count()
                    total_pages = max(1, (total + page_size - 1) // page_size)
                    page = min(page, total_pages)
                    rows = query.offset((page - 1) * page_size).limit(page_size).all()
                    items = _artifact_list_views(rows, user=user)

            as_of = datetime.datetime.utcnow()
            applied_filters = {
                "q": search,
                "status": status or None,
                "type": artifact_type or None,
                "source": source_filter or None,
                "moduleIndex": (
                    "unassigned"
                    if module_index == "unassigned"
                    else int(module_index)
                    if module_index not in (None, "")
                    else None
                ),
                "sort": sort,
                "required": required_filter or None,
                "mode": mode_filter or None,
            }
            return _ok(
                {
                    "kind": kind,
                    "courseContext": {
                        "id": dojo.dojo_id,
                        "referenceId": dojo.reference_id,
                        "name": dojo.name,
                        "role": "teacher",
                    },
                    "scope": {
                        "kind": f"course-content-{kind}",
                        "courseId": dojo.reference_id,
                        "filters": applied_filters,
                    },
                    "items": items,
                    "pagination": _course_content_pagination(page, page_size, total),
                    "counts": counts if kind == "questions" else None,
                    "filters": applied_filters,
                    "evidence": {
                        "asOf": _timestamp(as_of),
                        "evidenceCount": int(total),
                        "definition": "当前课程中符合服务端筛选条件且未归档的内容记录数。",
                    },
                    "asOf": _timestamp(as_of),
                }
            )
        except ValueError as exc:
            return _error(exc, 400, code="INVALID_REQUEST")
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/courses/<string:dojo_id>/workspace")
class ManagedCourseWorkspace(Resource):
    @authed_only
    def get(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            loaded_dojo = (
                Dojos.query.options(
                    selectinload(Dojos.users),
                    selectinload(Dojos.modules).selectinload(DojoModules.challenges),
                )
                .filter_by(dojo_id=dojo.dojo_id)
                .first()
            )
            as_of = datetime.datetime.utcnow()
            snapshot = _course_content_snapshot(loaded_dojo, as_of=as_of)
            demo_types = {
                "simulation",
                "attack-defense-scene",
                "classroom-scenario",
            }
            non_courseware_types = QUESTION_ARTIFACT_TYPES | demo_types | {"debate"}
            include_collections = (
                str(request.args.get("includeCollections") or "1") != "0"
            )
            materials = []
            courseware_artifacts = []
            demo_artifacts = []
            batches = []
            if include_collections:
                materials = (
                    TeachingMaterials.query.filter_by(dojo_id=dojo.dojo_id)
                    .filter(TeachingMaterials.status != "ARCHIVED")
                    .order_by(TeachingMaterials.updated.desc())
                    .limit(30)
                    .all()
                )
                courseware_artifacts = (
                    TeachingArtifacts.query.filter_by(dojo_id=dojo.dojo_id)
                    .filter(
                        TeachingArtifacts.status != "ARCHIVED",
                        TeachingArtifacts.self_workspace_id.is_(None),
                    )
                    .filter(
                        TeachingArtifacts.artifact_type.notin_(
                            non_courseware_types
                        )
                    )
                    .order_by(TeachingArtifacts.updated.desc())
                    .limit(30)
                    .all()
                )
                demo_artifacts = (
                    TeachingArtifacts.query.filter_by(dojo_id=dojo.dojo_id)
                    .filter(
                        TeachingArtifacts.status != "ARCHIVED",
                        TeachingArtifacts.self_workspace_id.is_(None),
                    )
                    .filter(TeachingArtifacts.artifact_type.in_(demo_types))
                    .order_by(TeachingArtifacts.updated.desc())
                    .limit(30)
                    .all()
                )
                batches = (
                    TeachingGenerationBatches.query.filter_by(
                        owner_id=user.id,
                        dojo_id=dojo.dojo_id,
                    )
                    .order_by(TeachingGenerationBatches.updated.desc())
                    .limit(100)
                    .all()
                )
            artifacts = courseware_artifacts + demo_artifacts
            course = _dojo_view(loaded_dojo)
            course["counts"] = snapshot["counts"]
            return _ok(
                {
                    "course": course,
                    "courseContext": {
                        "id": dojo.dojo_id,
                        "referenceId": dojo.reference_id,
                        "name": dojo.name,
                        "role": "teacher",
                    },
                    "scope": {
                        "kind": "course",
                        "courseId": dojo.reference_id,
                        "dojoId": dojo.dojo_id,
                    },
                    "modules": course["modules"],
                    "counts": snapshot["counts"],
                    "attention": snapshot["attention"],
                    "publishReadiness": snapshot["publishReadiness"],
                    "permissions": {
                        "canManage": True,
                        "canCreate": True,
                        "canPublish": True,
                        "canViewStudentData": True,
                    },
                    "recentActivity": snapshot["recentActivity"],
                    "materials": [
                        _material_attachment_view(material) for material in materials
                    ],
                    "artifacts": _artifact_list_views(artifacts, user=user),
                    "contentCollections": {
                        "endpoint": f"/pwncollege_api/v1/teaching/courses/{dojo.reference_id}/content",
                        "defaultPageSize": 30,
                        "serverPaginated": True,
                    },
                    "generationBatches": [
                        _generation_batch_view(batch) for batch in batches
                    ],
                    "learning": (
                        build_course_learning_analytics(loaded_dojo)
                        if str(request.args.get("includeLearning") or "0") == "1"
                        else None
                    ),
                    "evidence": snapshot["evidence"],
                    "asOf": _timestamp(as_of),
                    "statusDefinitions": {
                        "draft": "尚未发布",
                        "queued": "等待执行",
                        "generating": "正在生成",
                        "validating": "正在验证",
                        "needs_review": "等待审核",
                        "partial_success": "部分成功",
                        "published": "已发布",
                        "failed": "需要修复",
                        "cancelled": "已取消",
                        "unknown": "状态未知，需要复核",
                    },
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/courses/<string:dojo_id>/join-code")
class ManagedCourseJoinCode(Resource):
    @authed_only
    def post(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            regenerate = _body().get("regenerate") is True
            previous = course_join_code(dojo)
            code = ensure_course_join_code(dojo, regenerate=regenerate)
            changed = code != previous
            if changed:
                _management_audit(
                    user,
                    (
                        "course.join_code.rotate"
                        if previous
                        else "course.join_code.generate"
                    ),
                    "dojo",
                    dojo.reference_id,
                    {"dojoId": dojo.dojo_id},
                )
                db.session.commit()
            return _ok(
                {
                    "courseId": dojo.reference_id,
                    "courseName": dojo.name or dojo.id,
                    "code": format_course_code(code),
                    "regenerated": bool(regenerate and changed),
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except Exception:
            db.session.rollback()
            logger.exception("Unable to prepare course join code")
            return _error(
                "课程码暂时无法生成，请稍后重试。",
                500,
                code="COURSE_CODE_FAILED",
            )


@teaching_namespace.route("/courses/<string:dojo_id>")
class ManagedCourse(Resource):
    @authed_only
    def patch(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            body = _body()
            if "name" in body:
                name = str(body.get("name") or "").strip()
                if not 1 <= len(name) <= 128:
                    raise ValueError("课程名称需包含 1-128 个字符。")
                dojo.name = name
            if "description" in body:
                description = str(body.get("description") or "").strip()
                if len(description) > 24000:
                    raise ValueError("课程简介不能超过 24,000 个字符。")
                dojo.description = description or None
            if not any(key in body for key in ("name", "description")):
                raise ValueError("没有可更新的课程字段。")
            _management_audit(
                user,
                "course.manage.update",
                "dojo",
                dojo.reference_id,
                {
                    "dojoId": dojo.dojo_id,
                    "fields": sorted(set(body) & {"name", "description"}),
                },
            )
            db.session.commit()
            clear_challenges()
            return _ok({"course": _dojo_view(dojo)})
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (ValueError, IntegrityError) as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")

    @authed_only
    def delete(self, dojo_id):
        user = _current_user()
        cleanup_workspaces = []
        cleanup_storage_keys = set()
        cleanup_course_path = None
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            if TeachingSessions.query.filter_by(
                dojo_id=dojo.dojo_id, status="LIVE"
            ).first():
                raise ValueError("请先结束正在进行的课堂会话，再删除课程。")
            active_teaching_job = TeachingJobs.query.filter(
                TeachingJobs.dojo_id == dojo.dojo_id,
                TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
            ).first()
            active_authoring_job = LearningAuthoringJobs.query.filter(
                LearningAuthoringJobs.dojo_id == dojo.dojo_id,
                LearningAuthoringJobs.status.in_(["QUEUED", "RUNNING"]),
            ).first()
            if active_teaching_job is not None or active_authoring_job is not None:
                raise ValueError("课程仍有生成或验证任务，请等待任务结束后再删除。")

            material_ids = [
                row.id
                for row in TeachingMaterials.query.filter_by(dojo_id=dojo.dojo_id).all()
            ]
            cleanup_storage_keys.update(
                row.storage_key
                for row in TeachingMaterials.query.filter_by(dojo_id=dojo.dojo_id).all()
                if row.storage_key
            )
            if material_ids:
                cleanup_storage_keys.update(
                    row.storage_key
                    for row in TeachingMaterialRevisions.query.filter(
                        TeachingMaterialRevisions.material_id.in_(material_ids)
                    ).all()
                    if row.storage_key
                )
            try:
                from ...utils import get_all_containers

                cleanup_workspaces = list(get_all_containers(dojo))
            except Exception:
                logger.warning(
                    "Unable to enumerate course workspaces before deletion",
                    exc_info=True,
                )

            deleted_name = dojo.name or dojo.id
            deleted_reference = dojo.reference_id
            internal_id = dojo.dojo_id
            challenge_ids = [
                row.challenge_id
                for row in DojoChallenges.query.filter_by(dojo_id=internal_id).all()
                if row.challenge_id is not None
            ]
            cleanup_course_path = (
                pathlib.Path(config.DOJOS_DIR) / ".learning" / dojo.hex_dojo_id
            )
            _management_audit(
                user,
                "course.manage.delete",
                "dojo",
                deleted_reference,
                {"dojoId": internal_id, "name": deleted_name},
            )
            DojoUsers.query.filter_by(dojo_id=internal_id).delete(
                synchronize_session=False
            )
            Dojos.query.filter_by(dojo_id=internal_id).delete(synchronize_session=False)
            db.session.flush()
            if challenge_ids:
                referenced = {
                    challenge_id
                    for (challenge_id,) in db.session.query(DojoChallenges.challenge_id)
                    .filter(DojoChallenges.challenge_id.in_(challenge_ids))
                    .all()
                }
                orphan_ids = set(challenge_ids) - referenced
                if orphan_ids:
                    Challenges.query.filter(Challenges.id.in_(orphan_ids)).delete(
                        synchronize_session=False
                    )
            db.session.commit()

            storage_root = pathlib.Path(config.AGENT_RUNTIME_STORAGE_ROOT).resolve()
            for storage_key in cleanup_storage_keys:
                candidate = (storage_root / storage_key).resolve()
                if storage_root in candidate.parents:
                    try:
                        candidate.unlink(missing_ok=True)
                    except OSError:
                        logger.warning(
                            "Course deleted but a material file could not be removed",
                            exc_info=True,
                        )
            for workspace in cleanup_workspaces:
                try:
                    workspace.remove(force=True)
                except Exception:
                    logger.warning(
                        "Course deleted but a workspace could not be stopped",
                        exc_info=True,
                    )
            if cleanup_course_path is not None:
                shutil.rmtree(cleanup_course_path, ignore_errors=True)
            clear_challenges()
            clear_standings()
            return _ok(
                {
                    "deleted": True,
                    "course": {"referenceId": deleted_reference, "name": deleted_name},
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (ValueError, IntegrityError) as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")
        except Exception:
            db.session.rollback()
            logger.exception("Unable to delete managed course %s", dojo_id)
            return _error(
                "删除课程失败，课程数据未发生变化。", 500, code="COURSE_DELETE_FAILED"
            )


@teaching_namespace.route("/courses/<string:dojo_id>/modules/<int:module_index>")
class ManagedCourseModule(Resource):
    @authed_only
    def patch(self, dojo_id, module_index):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            module = _managed_module(dojo, module_index)
            body = _body()
            if "name" in body:
                name = str(body.get("name") or "").strip()
                if not 1 <= len(name) <= 128:
                    raise ValueError("章节名称需包含 1-128 个字符。")
                module.name = name
            if "description" in body:
                description = str(body.get("description") or "").strip()
                if len(description) > 24000:
                    raise ValueError("章节简介不能超过 24,000 个字符。")
                module.description = description or None
            if not any(key in body for key in ("name", "description")):
                raise ValueError("没有可更新的章节字段。")
            _management_audit(
                user,
                "module.manage.update",
                "dojo_module",
                f"{dojo.reference_id}/{module.id}",
                {"dojoId": dojo.dojo_id, "moduleIndex": module.module_index},
            )
            db.session.commit()
            clear_challenges()
            return _ok(
                {
                    "module": {
                        "index": module.module_index,
                        "id": module.id,
                        "name": module.name,
                        "description": module.description,
                    }
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (ValueError, IntegrityError) as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")

    @authed_only
    def delete(self, dojo_id, module_index):
        user = _current_user()
        cleanup_packages = []
        cleanup_workspaces = []
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            module = _managed_module(dojo, module_index)
            if (
                TeachingJobs.query.filter(
                    TeachingJobs.dojo_id == dojo.dojo_id,
                    TeachingJobs.module_index == module.module_index,
                    TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
                ).first()
                or LearningAuthoringJobs.query.filter(
                    LearningAuthoringJobs.dojo_id == dojo.dojo_id,
                    LearningAuthoringJobs.module_index == module.module_index,
                    LearningAuthoringJobs.status.in_(["QUEUED", "RUNNING"]),
                ).first()
            ):
                raise ValueError("该章节仍有生成或验证任务，请等待任务结束后再删除。")

            deleted_name = module.name or module.id
            deleted_count = len(module.challenges)
            affected_users = set()
            for challenge in list(module.challenges):
                module_id = module.id
                challenge_id = challenge.id
                from ...learning.authoring import delete_published_challenge

                deletion = delete_published_challenge(challenge, user)
                affected_users.update(deletion.pop("_affectedUserIds", []))
                package_root = deletion.pop("_packageRoot", None)
                if package_root:
                    cleanup_packages.append(package_root)
                cleanup_workspaces.append((dojo, module_id, challenge_id))
            if affected_users:
                from ...learning.assessment import rebuild_skill_states

                rebuild_skill_states(dojo.dojo_id, sorted(affected_users))
            _management_audit(
                user,
                "module.manage.delete",
                "dojo_module",
                f"{dojo.reference_id}/{module.id}",
                {
                    "dojoId": dojo.dojo_id,
                    "moduleIndex": module.module_index,
                    "name": deleted_name,
                    "challengeCount": deleted_count,
                },
            )
            db.session.delete(module)
            db.session.commit()

            from ...learning.authoring import remove_generated_package_assets
            from .learning import _stop_deleted_challenge_workspaces

            for package_root in cleanup_packages:
                try:
                    remove_generated_package_assets(package_root)
                except (OSError, ValueError):
                    logger.warning(
                        "Module deleted but generated assets could not be removed",
                        exc_info=True,
                    )
            for cleanup in cleanup_workspaces:
                try:
                    _stop_deleted_challenge_workspaces(*cleanup)
                except Exception:
                    logger.warning(
                        "Module deleted but a challenge workspace could not be stopped",
                        exc_info=True,
                    )
            clear_challenges()
            clear_standings()
            return _ok(
                {
                    "deleted": True,
                    "module": {"index": module_index, "name": deleted_name},
                    "deletedChallengeCount": deleted_count,
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (PermissionError, ValueError, IntegrityError) as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")
        except Exception:
            db.session.rollback()
            logger.exception(
                "Unable to delete managed module %s/%s", dojo_id, module_index
            )
            return _error(
                "删除章节失败，章节数据未发生变化。", 500, code="MODULE_DELETE_FAILED"
            )


@teaching_namespace.route("/threads")
class TeachingThreads(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        view = str(request.args.get("view") or "active").strip().lower()
        if view not in {"active", "archived", "all"}:
            return _error("Unknown conversation view")
        query = TeachingAgentThreads.query.filter_by(user_id=user.id).filter(
            TeachingAgentThreads.phase != "SELF_LEARNING"
        )
        if view == "active":
            query = query.filter(TeachingAgentThreads.status == "ACTIVE")
        elif view == "archived":
            query = query.filter(TeachingAgentThreads.status == "ARCHIVED")
        else:
            query = query.filter(
                TeachingAgentThreads.status.in_(("ACTIVE", "ARCHIVED"))
            )
        search = re.sub(r"\s+", " ", str(request.args.get("q") or "")).strip()[:120]
        if search:
            pattern = f"%{search}%"
            matching_message_threads = db.session.query(
                TeachingAgentMessages.thread_id
            ).filter(TeachingAgentMessages.content.ilike(pattern))
            query = query.filter(
                or_(
                    TeachingAgentThreads.title.ilike(pattern),
                    TeachingAgentThreads.id.in_(matching_message_threads),
                )
            )
        rows = (
            query.order_by(
                TeachingAgentThreads.pinned.desc(),
                TeachingAgentThreads.updated.desc(),
            )
            .limit(200)
            .all()
        )
        return _ok(
            {
                "threads": _thread_list_views(rows),
                "view": view,
                "query": search,
            }
        )

    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        body = _body()
        dojo_id = body.get("dojoId")
        module_index = body.get("moduleIndex")
        if dojo_id is not None:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            module_index = build_scope(
                user,
                role="teacher",
                dojo_id=dojo.dojo_id,
                module_index=module_index,
            ).module_index
            dojo_id = dojo.dojo_id
        thread = TeachingAgentThreads(
            user_id=user.id,
            dojo_id=dojo_id,
            module_index=module_index,
            title=str(body.get("title") or "新教学对话")[:240],
            phase=str(body.get("phase") or "COURSE_SETUP")[:32],
            context=body.get("context")
            if isinstance(body.get("context"), dict)
            else {},
        )
        db.session.add(thread)
        db.session.commit()
        return _ok({"thread": _thread_view(thread)}, 201)


@teaching_namespace.route("/threads/<string:thread_id>")
class TeachingThread(Resource):
    @authed_only
    def get(self, thread_id):
        try:
            thread = _thread_for_owner(thread_id, _current_user())
            return _ok({"thread": _thread_view(thread, include_messages=True)})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def patch(self, thread_id):
        user = _current_user()
        try:
            thread = _thread_for_owner(thread_id, user)
            body = _body()
            if "dojoId" in body or "moduleIndex" in body:
                scope = build_scope(
                    user,
                    role="teacher",
                    dojo_id=body.get("dojoId"),
                    module_index=body.get("moduleIndex"),
                )
                thread.dojo_id = scope.dojo_id
                thread.module_index = scope.module_index
            if isinstance(body.get("title"), str) and body["title"].strip():
                thread.title = body["title"].strip()[:240]
            if "pinned" in body:
                if not isinstance(body["pinned"], bool):
                    return _error("pinned must be a boolean")
                if body["pinned"] and thread.status == "ARCHIVED":
                    return _error("Restore a conversation before pinning it", 409)
                thread.pinned = body["pinned"]
            if "archived" in body:
                if not isinstance(body["archived"], bool):
                    return _error("archived must be a boolean")
                if body["archived"]:
                    thread.status = "ARCHIVED"
                    thread.archived_at = datetime.datetime.utcnow()
                    thread.pinned = False
                else:
                    thread.status = "ACTIVE"
                    thread.archived_at = None
            if isinstance(body.get("phase"), str):
                thread.phase = body["phase"].strip()[:32]
            if isinstance(body.get("context"), dict):
                merged_context = {
                    **(thread.context or {}),
                    **scrub_payload(body["context"]),
                }
                if _json_size(merged_context) > MAX_AGENT_CONTEXT_BYTES:
                    return _error("Thread context exceeds 64 KiB", 413)
                thread.context = merged_context
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok({"thread": _thread_view(thread)})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def delete(self, thread_id):
        user = _current_user()
        try:
            _require_teacher(user)
            thread = _thread_for_owner(thread_id, user)
            if _body().get("confirmed") is not True:
                return _error(
                    "Conversation deletion requires explicit confirmation",
                    409,
                    code="CONFIRMATION_REQUIRED",
                )
            active_jobs = TeachingJobs.query.filter(
                TeachingJobs.thread_id == thread.id,
                TeachingJobs.status.in_(("QUEUED", "RUNNING", "CANCEL_REQUESTED")),
            ).all()
            for job in active_jobs:
                cancel_job(job, user.id)
            thread = _thread_for_owner(thread_id, user)
            db.session.delete(thread)
            db.session.commit()
            return _ok(
                {
                    "deletedThreadId": thread_id,
                    "canceledJobCount": len(active_jobs),
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route(
    "/threads/<string:thread_id>/messages/<int:message_id>/tool-proposals/"
    "<int:proposal_index>/decision"
)
class TeachingToolProposalDecision(Resource):
    """Persist the teacher's decision for an Agent-proposed high-impact tool."""

    @authed_only
    def post(self, thread_id, message_id, proposal_index):
        user = _current_user()
        body = _body()
        decision = str(body.get("decision") or "").upper()
        if body.get("confirmed") is not True or decision not in {
            "APPROVED",
            "REJECTED",
        }:
            return _error(
                "Explicit confirmed approval or rejection is required",
                code="CONFIRMATION_REQUIRED",
            )
        try:
            _require_teacher(user)
            thread = _thread_for_owner(thread_id, user)
            if thread.status != "ACTIVE":
                return _error(
                    "请先恢复这个对话，再处理批准请求。",
                    409,
                    code="THREAD_ARCHIVED",
                )
            source_message = (
                TeachingAgentMessages.query.filter_by(
                    id=message_id,
                    thread_id=thread.id,
                    user_id=user.id,
                    role="assistant",
                )
                .with_for_update()
                .first()
            )
            if source_message is None:
                return _error("Approval request not found", 404, code="NOT_FOUND")

            metadata = dict(source_message.metadata_json or {})
            if metadata.get("pending") is not False:
                return _error(
                    "智能体尚未完成这项请求，请稍后再决定。",
                    409,
                    code="PROPOSAL_NOT_READY",
                )
            proposals = metadata.get("toolProposals")
            proposals = proposals if isinstance(proposals, list) else []
            if proposal_index < 0 or proposal_index >= len(proposals):
                return _error("Approval request not found", 404, code="NOT_FOUND")
            proposal = proposals[proposal_index]
            if not isinstance(proposal, dict) or proposal.get(
                "requiresConfirmation"
            ) is not True:
                return _error(
                    "This operation does not require teacher approval",
                    409,
                    code="APPROVAL_NOT_REQUIRED",
                )

            decisions = metadata.get("toolProposalDecisions")
            decisions = dict(decisions) if isinstance(decisions, dict) else {}
            decision_key = str(proposal_index)
            existing = decisions.get(decision_key)
            if isinstance(existing, dict):
                if str(existing.get("decision") or "").upper() == decision:
                    return _ok(
                        {
                            "thread": _thread_view(thread, include_messages=True),
                            "decision": existing,
                            "deduplicated": True,
                        }
                    )
                return _error(
                    "This approval request was already decided",
                    409,
                    code="PROPOSAL_ALREADY_DECIDED",
                )

            recorded = {
                "decision": decision,
                "decidedAt": _timestamp(datetime.datetime.utcnow()),
                "actorId": user.id,
            }
            decisions[decision_key] = recorded
            metadata["toolProposalDecisions"] = decisions
            source_message.metadata_json = metadata
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok(
                {
                    "thread": _thread_view(thread, include_messages=True),
                    "decision": recorded,
                    "deduplicated": False,
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")


def _generation_option_context(
    user,
    thread,
    source_message_id,
    option_id,
    *,
    require_selected=False,
):
    try:
        source_message_id = int(source_message_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("请选择当前对话中有效的生成方案。") from exc
    normalized_option_id = str(option_id or "").strip()
    source_message = TeachingAgentMessages.query.filter_by(
        id=source_message_id,
        thread_id=thread.id,
        user_id=user.id,
        role="assistant",
    ).first()
    if source_message is None:
        raise ValueError("没有找到这组生成方案，请刷新对话后重试。")
    metadata = source_message.metadata_json or {}
    if metadata.get("pending") is not False:
        raise ValueError("生成方案仍在准备中，请稍后再选择。")
    source_job = TeachingJobs.query.filter_by(
        id=str(metadata.get("jobId") or ""),
        owner_id=user.id,
        thread_id=thread.id,
        kind="agent.chat",
        status="SUCCEEDED",
    ).first()
    if source_job is None:
        raise ValueError("生成方案的来源任务尚未完成。")
    bundle = validated_generation_options(
        source_job,
        {"generationOptions": metadata.get("generationOptions")},
    )
    if bundle is None:
        raise ValueError("这组生成方案未通过完整性校验，请重新提出生成要求。")
    option = next(
        (item for item in bundle["options"] if item["id"] == normalized_option_id),
        None,
    )
    if option is None:
        raise ValueError("所选生成方案不存在。")

    selection = metadata.get("generationSelection")
    selection = selection if isinstance(selection, dict) else None
    if require_selected and (
        selection is None
        or str(selection.get("optionId") or "") != option["id"]
        or str(selection.get("status") or "").upper() not in {"SELECTED", "STARTED"}
    ):
        raise ValueError("请先在三套候选方案中选择一套，再开始正式生成。")
    return {
        "sourceMessage": source_message,
        "sourceJob": source_job,
        "bundle": bundle,
        "option": option,
        "selection": selection,
    }


def _generation_option_proposal(user, thread, context):
    bundle = context["bundle"]
    option = context["option"]
    target_tool = bundle["targetTool"]
    if thread.dojo_id is None:
        raise ValueError("正式生成前需要先在当前对话中选择目标课程。")

    if target_tool == "candidate.generate":
        arguments = {
            "prompt": option["rewrittenPrompt"],
            "artifactType": bundle["artifactType"],
            "candidateCount": 1,
            "sourceRefs": bundle["sourceRefs"],
        }
    else:
        dojo = dojo_for_user(user, thread.dojo_id, teacher=True)
        base_arguments = bundle.get("baseArguments") or {}
        module = _course_tool_module(
            dojo,
            base_arguments,
            fallback_index=thread.module_index,
        )
        arguments = {
            "brief": option["rewrittenPrompt"],
            "moduleIndex": module.module_index,
        }
        if base_arguments.get("challengeCount") is not None:
            arguments["challengeCount"] = base_arguments["challengeCount"]
        if base_arguments.get("difficulty"):
            arguments["difficulty"] = base_arguments["difficulty"]
        if isinstance(base_arguments.get("constraints"), dict):
            arguments["constraints"] = base_arguments["constraints"]

    risk = AGENT_TOOL_SCHEMAS.get(target_tool, ("R1", set()))[0]
    return {
        "tool": target_tool,
        "riskLevel": risk,
        "arguments": arguments,
        "reason": (f"教师已选择“{option['title']}”，按该方案的完整提示词正式生成。"),
        "requiresConfirmation": risk == "R3",
    }


def _confirmed_challenge_generation_plan(arguments, raw_plan):
    requested_count = int(arguments.get("challengeCount") or 1)
    constraints = dict(arguments.get("constraints") or {})
    existing_topics = constraints.get("batchTopics")
    fallback_topics = (
        [str(item or "").strip() for item in existing_topics]
        if isinstance(existing_topics, list)
        else []
    )
    supplied_plan = raw_plan is not None
    if raw_plan is None:
        items = [
            {
                "itemIndex": index,
                "title": (
                    fallback_topics[index - 1]
                    if len(fallback_topics) == requested_count
                    else f"独立 CTF 题目 {index}"
                ),
                "difficulty": str(arguments.get("difficulty") or "按要求递进")[:80],
            }
            for index in range(1, requested_count + 1)
        ]
    else:
        if not isinstance(raw_plan, dict):
            raise ValueError("生成确认计划必须是一个对象。")
        try:
            confirmed_count = int(raw_plan.get("requestedCount"))
        except (TypeError, ValueError) as exc:
            raise ValueError("生成确认计划缺少有效题目数量。") from exc
        if confirmed_count != requested_count:
            raise ValueError("确认计划中的题目数量与原始任务契约不一致。")
        raw_items = raw_plan.get("items")
        if not isinstance(raw_items, list) or len(raw_items) != requested_count:
            raise ValueError(f"确认计划必须包含恰好 {requested_count} 个独立题目规格。")
        items = []
        for index, raw_item in enumerate(raw_items, start=1):
            if not isinstance(raw_item, dict):
                raise ValueError("每个题目计划都必须包含标题和难度。")
            title = str(raw_item.get("title") or "").strip()
            if not 2 <= len(title) <= 80:
                raise ValueError("每个拟生成题目的标题需包含 2 到 80 个字符。")
            difficulty = str(raw_item.get("difficulty") or "按要求递进").strip()[:80]
            items.append(
                {
                    "itemIndex": index,
                    "title": title,
                    "difficulty": difficulty or "按要求递进",
                }
            )
    titles = [item["title"] for item in items]
    if len(set(titles)) != requested_count:
        raise ValueError("独立题目的拟定标题不能重复。")
    if supplied_plan:
        constraints["batchTopics"] = titles
        constraints["difficultyByItem"] = [item["difficulty"] for item in items]
    return (
        {**arguments, **({"constraints": constraints} if supplied_plan else {})},
        {
            "requestedCount": requested_count,
            "independence": "independent_challenges",
            "exerciseMode": "CTF",
            "publishMode": "draft",
            "items": items,
        },
    )


@teaching_namespace.route(
    "/threads/<string:thread_id>/messages/<int:message_id>/generation-options/"
    "<string:option_id>/select"
)
class TeachingGenerationOptionSelection(Resource):
    @authed_only
    def post(self, thread_id, message_id, option_id):
        user = _current_user()
        try:
            _require_teacher(user)
            thread = _thread_for_owner(thread_id, user)
            if thread.status != "ACTIVE":
                return _error(
                    "请先恢复这个对话，再选择生成方案。",
                    409,
                    code="THREAD_ARCHIVED",
                )
            context = _generation_option_context(
                user,
                thread,
                message_id,
                option_id,
            )
            source_message = context["sourceMessage"]
            option = context["option"]
            metadata = dict(source_message.metadata_json or {})
            existing = metadata.get("generationSelection")
            existing = existing if isinstance(existing, dict) else None
            if existing is not None:
                if str(existing.get("optionId") or "") != option["id"]:
                    raise GenerationOptionConflict(
                        "已经选择了另一套方案；如需更换，请重新提出生成要求。"
                    )
                proposal = _generation_option_proposal(user, thread, context)
                return _ok(
                    {
                        "thread": _thread_view(thread, include_messages=True),
                        "proposal": proposal,
                        "selection": existing,
                        "sourceJobId": context["sourceJob"].id,
                        "deduplicated": True,
                    }
                )

            proposal = _generation_option_proposal(user, thread, context)
            selection_message = TeachingAgentMessages(
                thread_id=thread.id,
                user_id=user.id,
                role="user",
                content=(
                    f"按“{option['title']}”正式生成：\n\n{option['rewrittenPrompt']}"
                )[:MAX_MESSAGE_CHARS],
                metadata_json={
                    "client": "generation-option-selection",
                    "sourceMessageId": source_message.id,
                    "optionId": option["id"],
                },
            )
            db.session.add(selection_message)
            db.session.flush()
            selection = {
                "optionId": option["id"],
                "title": option["title"],
                "targetTool": context["bundle"]["targetTool"],
                "status": "SELECTED",
                "selectionMessageId": selection_message.id,
                "selectedAt": _timestamp(datetime.datetime.utcnow()),
            }
            metadata["generationSelection"] = selection
            source_message.metadata_json = metadata
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok(
                {
                    "thread": _thread_view(thread, include_messages=True),
                    "proposal": proposal,
                    "selection": selection,
                    "sourceJobId": context["sourceJob"].id,
                    "deduplicated": False,
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except GenerationOptionConflict as exc:
            db.session.rollback()
            return _error(exc, 409, code="GENERATION_OPTION_ALREADY_SELECTED")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_GENERATION_OPTION")


def _agent_continuation_context(user, thread, body):
    try:
        source_message_id = int(body.get("sourceMessageId"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Agent continuation requires a source message") from exc
    source_message = TeachingAgentMessages.query.filter_by(
        id=source_message_id,
        thread_id=thread.id,
        user_id=user.id,
        role="assistant",
    ).first()
    if source_message is None:
        raise ValueError("Agent continuation source was not found")
    metadata = source_message.metadata_json or {}
    if metadata.get("pending") is not False:
        raise ValueError("Agent continuation source is not complete")
    source_job = TeachingJobs.query.filter_by(
        id=str(metadata.get("jobId") or ""),
        owner_id=user.id,
        thread_id=thread.id,
        kind="agent.chat",
        status="SUCCEEDED",
    ).first()
    if source_job is None:
        raise ValueError("Agent continuation source job is not complete")

    proposals = metadata.get("toolProposals")
    proposals = proposals if isinstance(proposals, list) else []
    raw_indexes = body.get("proposalIndexes")
    raw_indexes = raw_indexes if isinstance(raw_indexes, list) else []
    proposal_indexes = []
    for raw_index in raw_indexes[:8]:
        try:
            index = int(raw_index)
        except (TypeError, ValueError):
            continue
        if index < 0 or index >= len(proposals) or index in proposal_indexes:
            continue
        proposal_indexes.append(index)
    if not proposal_indexes:
        raise ValueError("Agent continuation requires completed tool observations")

    try:
        source_depth = int(metadata.get("agentLoopDepth") or 0)
    except (TypeError, ValueError):
        source_depth = 0
    if source_depth >= MAX_AGENT_LOOP_STEPS - 1:
        raise ValueError("Agent reached the maximum number of autonomous steps")

    existing_trace = metadata.get("agentLoopTrace")
    existing_trace = existing_trace if isinstance(existing_trace, list) else []
    trace = [
        scrub_payload(item) for item in existing_trace[-32:] if isinstance(item, dict)
    ]
    current_facts = None
    for index in proposal_indexes:
        proposal = proposals[index] if isinstance(proposals[index], dict) else {}
        tool = str(proposal.get("tool") or "")
        if not tool:
            continue
        observation = {
            "step": source_depth,
            "tool": tool[:80],
            "status": "context-refreshed",
            "reason": str(proposal.get("reason") or "")[:500],
        }
        if tool in COURSE_TOOL_NAMES:
            idempotency_prefix = (
                f"agent-tool:{user.id}:agent-proposal:{source_message.id}:{index}"
            )
            action = (
                TeachingAgentActions.query.filter(
                    TeachingAgentActions.thread_id == thread.id,
                    TeachingAgentActions.actor_id == user.id,
                    TeachingAgentActions.idempotency_key.like(f"{idempotency_prefix}%"),
                )
                .order_by(TeachingAgentActions.created.desc())
                .first()
            )
            if (
                action is None
                or (action.request_json or {}).get("tool") != tool
                or action.status
                not in {"APPROVED", "COMPLETED", "PENDING", "SUCCEEDED"}
            ):
                raise ValueError(
                    f"No verified execution result is available for {tool}"
                )
            observation.update(
                {
                    "status": "verified",
                    "actionId": action.id,
                    "actionStatus": action.status,
                    "observation": _bounded_agent_fact(
                        action.result or {},
                        text_limit=500,
                        item_limit=12,
                    ),
                }
            )
        else:
            if current_facts is None:
                current_facts = _teacher_agent_context(user, thread)
            platform_observation = _agent_tool_platform_observation(
                tool,
                current_facts,
            )
            if platform_observation is not None:
                risk = AGENT_TOOL_SCHEMAS.get(tool, ("R3", set()))[0]
                observation.update(
                    {
                        "status": ("verified" if risk == "R0" else "platform-observed"),
                        "observation": _bounded_agent_fact(
                            platform_observation,
                            text_limit=500,
                            item_limit=12,
                        ),
                    }
                )
        trace.append(observation)
    if not trace:
        raise ValueError("Agent continuation did not contain a valid tool observation")

    root_job_id = str(metadata.get("agentRootJobId") or source_job.id)
    root_job = TeachingJobs.query.filter_by(
        id=root_job_id,
        owner_id=user.id,
        thread_id=thread.id,
        kind="agent.chat",
    ).first()
    if root_job is None:
        root_job = source_job
        root_job_id = source_job.id
    root_payload = root_job.payload or {}
    prompt = str(root_payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Original teacher request is no longer available")
    return {
        "prompt": prompt,
        "constraints": scrub_payload(root_payload.get("constraints") or {}),
        "sourceRefs": scrub_payload(root_payload.get("sourceRefs") or []),
        "allowDegraded": bool(root_payload.get("allowDegraded")),
        "agentLoop": {
            "depth": source_depth + 1,
            "maxDepth": MAX_AGENT_LOOP_STEPS,
            "rootJobId": root_job_id,
            "sourceMessageId": source_message.id,
            "trace": trace[-40:],
        },
    }


@teaching_namespace.route("/threads/<string:thread_id>/messages")
class TeachingThreadMessages(Resource):
    @authed_only
    def post(self, thread_id):
        user = _current_user()
        try:
            _require_teacher(user)
            thread = _thread_for_owner(thread_id, user)
            if thread.status != "ACTIVE":
                return _error(
                    "Restore this conversation before sending another message",
                    409,
                    code="THREAD_ARCHIVED",
                )
            body = _body()
            requested_action = str(body.get("action") or "").strip().lower()
            continuation = body.get("agentContinuation") is True
            continuation_context = None
            selected_generation = None
            if continuation:
                if requested_action == "continue":
                    continuation_context = _agent_continuation_context(
                        user, thread, body
                    )
                    content = continuation_context["prompt"]
                elif requested_action == "generate":
                    raw_selection = body.get("generationSelection")
                    if isinstance(raw_selection, dict):
                        selected_generation = _generation_option_context(
                            user,
                            thread,
                            raw_selection.get("sourceMessageId"),
                            raw_selection.get("optionId"),
                            require_selected=True,
                        )
                        content = selected_generation["option"]["rewrittenPrompt"]
                    else:
                        content = str(body.get("content") or "").strip()
                else:
                    raise ValueError("Agent continuation must name an explicit action")
            else:
                content = str(body.get("content") or "").strip()
            if not content:
                return _error("Message content is required")
            if len(content) > MAX_MESSAGE_CHARS:
                return _error(f"Message exceeds {MAX_MESSAGE_CHARS} characters", 413)

            continuation_idempotency = None
            if continuation_context is not None:
                continuation_idempotency = _unique_idempotency(
                    user.id,
                    "agent-loop",
                )
                existing = TeachingJobs.query.filter_by(
                    idempotency_key=continuation_idempotency,
                    owner_id=user.id,
                    thread_id=thread.id,
                    kind="agent.chat",
                ).first()
                if existing is not None:
                    return _ok(
                        {
                            "thread": _thread_view(thread, include_messages=True),
                            "job": job_view(existing),
                            "candidateSetId": None,
                            "deduplicated": True,
                        },
                        202,
                    )

            if body.get("dojoId") is not None:
                scope = build_scope(
                    user,
                    role="teacher",
                    dojo_id=body.get("dojoId"),
                    module_index=body.get("moduleIndex"),
                )
                thread.dojo_id = scope.dojo_id
                thread.module_index = scope.module_index
            if thread.dojo_id is not None:
                build_scope(
                    user,
                    role="teacher",
                    dojo_id=thread.dojo_id,
                    module_index=thread.module_index,
                )

            user_message = None
            if not continuation:
                user_message = TeachingAgentMessages(
                    thread_id=thread.id,
                    user_id=user.id,
                    role="user",
                    content=content,
                    metadata_json={"client": body.get("client") or "teacher-global"},
                )
                db.session.add(user_message)
                db.session.flush()
                if thread.title in DEFAULT_THREAD_TITLES:
                    thread.title = _thread_title_from_message(content)

            recent_messages = (
                TeachingAgentMessages.query.filter_by(thread_id=thread.id)
                .order_by(TeachingAgentMessages.id.desc())
                .limit(30)
                .all()
            )
            conversation = []
            remaining_history = 48000
            for message in reversed(recent_messages):
                if remaining_history <= 0:
                    break
                text = str(message.content or "")[:remaining_history]
                conversation.append({"role": message.role, "content": text})
                remaining_history -= len(text)
            platform_context = _teacher_agent_context(user, thread)

            generate = continuation and requested_action == "generate"
            if generate and thread.dojo_id is None:
                raise ValueError(
                    "A model-selected generation tool needs a target course"
                )

            if continuation_context is not None:
                constraints = continuation_context["constraints"]
                source_refs = continuation_context["sourceRefs"]
                allow_degraded = continuation_context["allowDegraded"]
                agent_loop = continuation_context["agentLoop"]
            elif selected_generation is not None:
                source_payload = selected_generation["sourceJob"].payload or {}
                constraints = scrub_payload(source_payload.get("constraints") or {})
                source_refs = selected_generation["bundle"]["sourceRefs"]
                allow_degraded = bool(source_payload.get("allowDegraded"))
                agent_loop = {
                    "depth": 0,
                    "maxDepth": MAX_AGENT_LOOP_STEPS,
                    "trace": [],
                }
            else:
                constraints, source_refs = _agent_request_context(body, user, thread)
                allow_degraded = bool(body.get("allowDegraded"))
                agent_loop = {
                    "depth": 0,
                    "maxDepth": MAX_AGENT_LOOP_STEPS,
                    "trace": [],
                }
            if user_message is not None:
                attachments = _message_attachment_views(user, source_refs)
                if attachments:
                    user_message.metadata_json = {
                        **(user_message.metadata_json or {}),
                        "attachments": attachments,
                    }
                    _mark_thread_attachments_referenced(
                        thread,
                        [item["id"] for item in attachments],
                        user_message.id,
                    )
            dependency_ids = _material_dependency_ids(user.id, source_refs)
            candidate_set = None
            if generate:
                artifact_type = str(body.get("artifactType") or "").strip().lower()
                if selected_generation is not None:
                    artifact_type = selected_generation["bundle"]["artifactType"]
                if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", artifact_type):
                    raise ValueError(
                        "Model-planned generation requires a valid artifact type"
                    )
                if (
                    artifact_type in GENERATION_OPTION_ARTIFACT_TYPES
                    and selected_generation is None
                ):
                    raise ValueError(
                        "请先在智能体给出的三套候选方案中选择一套，再开始正式生成。"
                    )
                try:
                    count = (
                        1
                        if selected_generation is not None
                        else int(body.get("candidateCount") or 1)
                    )
                except (TypeError, ValueError) as exc:
                    raise ValueError("Candidate count must be an integer") from exc
                if count not in {1, 2, 3, 4}:
                    raise ValueError("Candidate count must be between 1 and 4")
                generation_mode = "multiple" if count > 1 else "single"
                generation_reason = (
                    "teacher_selected_prompt_option"
                    if selected_generation is not None
                    else "model_planned"
                )
                selection_provenance = (
                    {
                        "sourceMessageId": selected_generation["sourceMessage"].id,
                        "sourceJobId": selected_generation["sourceJob"].id,
                        "optionId": selected_generation["option"]["id"],
                        "optionTitle": selected_generation["option"]["title"],
                    }
                    if selected_generation is not None
                    else None
                )
                candidate_set = create_candidate_set(
                    owner_id=user.id,
                    dojo_id=thread.dojo_id,
                    module_index=thread.module_index,
                    thread_id=thread.id,
                    kind=artifact_type,
                    request_json={
                        "prompt": content,
                        "candidateCount": count,
                        "generationMode": generation_mode,
                        "generationReason": generation_reason,
                        "phase": thread.phase,
                        "constraints": constraints,
                        "generationSelection": selection_provenance,
                    },
                    source_refs=source_refs,
                )
                payload = {
                    "candidateSetId": candidate_set.id,
                    "prompt": content,
                    "artifactType": artifact_type,
                    "candidateCount": count,
                    "generationMode": generation_mode,
                    "generationReason": generation_reason,
                    "phase": thread.phase,
                    "constraints": constraints,
                    "sourceRefs": source_refs,
                    "conversation": conversation,
                    "courseContext": platform_context,
                    "allowDegraded": allow_degraded,
                    "generationSelection": selection_provenance,
                }
                if dependency_ids:
                    payload["dependsOnJobIds"] = dependency_ids
                job_kind = "candidate.generate"
                assistant_text = (
                    f"正在按你的要求准备 {count} 种实质不同的方案，完成后会在当前对话中给出可比较的结果。"
                    if generation_mode == "multiple"
                    else (
                        f"正在按已选择的“{selected_generation['option']['title']}”正式生成，"
                        "完成后会在当前对话中直接给出可预览、可继续修改的结果。"
                        if selected_generation is not None
                        else "正在按你的要求制作这项教学内容，完成后会在当前对话中直接给出可预览、可继续修改的结果。"
                    )
                )
            else:
                payload = {
                    "prompt": content,
                    "phase": thread.phase,
                    "constraints": constraints,
                    "sourceRefs": source_refs,
                    "context": {
                        "thread": scrub_payload(thread.context or {}),
                        "platformFacts": platform_context,
                        "conversation": conversation,
                        "agentLoop": agent_loop,
                    },
                    "allowDegraded": allow_degraded,
                }
                if dependency_ids:
                    payload["dependsOnJobIds"] = dependency_ids
                job_kind = "agent.chat"
                assistant_text = "正在理解完整要求、选择相关技能并规划下一步…"

            assistant = TeachingAgentMessages(
                thread_id=thread.id,
                user_id=user.id,
                role="assistant",
                content=assistant_text,
                metadata_json={
                    "pending": True,
                    "presentation": "activity",
                    "jobKind": job_kind,
                    "jobStatus": "QUEUED",
                    "agentLoopDepth": int(agent_loop.get("depth") or 0),
                    "agentLoopTrace": agent_loop.get("trace") or [],
                    "agentRootJobId": agent_loop.get("rootJobId"),
                },
            )
            db.session.add(assistant)
            db.session.flush()
            candidate_card = None
            if candidate_set:
                candidate_card = add_card(
                    assistant,
                    card_type="candidate_set",
                    object_type="candidate_set",
                    object_id=candidate_set.id,
                    state={
                        "status": "GENERATING",
                        "kind": artifact_type,
                        "candidateCount": count,
                        "generationMode": generation_mode,
                        "generationReason": generation_reason,
                    },
                    actions=["open", "regenerate", "cancel"],
                )
            db.session.commit()

            job, _ = enqueue_job(
                owner_id=user.id,
                kind=job_kind,
                idempotency_key=(
                    continuation_idempotency
                    or _unique_idempotency(user.id, "thread-message")
                ),
                payload=payload,
                dojo_id=thread.dojo_id,
                module_index=thread.module_index,
                thread_id=thread.id,
                priority=30 if generate else 80,
                publish=False,
            )
            if candidate_card is not None:
                candidate_card.state = {
                    **(candidate_card.state or {}),
                    "jobId": job.id,
                    "status": job.status,
                    "stage": job.stage,
                    "progress": job.progress,
                }
            elif job_kind != "agent.chat":
                add_card(
                    assistant,
                    card_type="job",
                    object_type="job",
                    object_id=job.id,
                    state={
                        "status": job.status,
                        "stage": job.stage,
                        "progress": job.progress,
                        "kind": job.kind,
                        "artifactType": payload.get("artifactType"),
                    },
                    actions=["cancel", "retry"],
                )
            assistant.metadata_json = {
                "pending": True,
                "presentation": "activity",
                "jobId": job.id,
                "jobKind": job.kind,
                "jobStatus": job.status,
                "generationSelection": (
                    selection_provenance if selected_generation is not None else None
                ),
                "agentLoopDepth": int(agent_loop.get("depth") or 0),
                "agentLoopTrace": agent_loop.get("trace") or [],
                "agentRootJobId": agent_loop.get("rootJobId") or job.id,
            }
            if selected_generation is not None:
                source_message = selected_generation["sourceMessage"]
                source_metadata = dict(source_message.metadata_json or {})
                source_selection = dict(
                    source_metadata.get("generationSelection") or {}
                )
                source_selection.update(
                    {
                        "status": "STARTED",
                        "formalJobId": job.id,
                        "candidateSetId": candidate_set.id,
                        "startedAt": _timestamp(datetime.datetime.utcnow()),
                    }
                )
                source_metadata["generationSelection"] = source_selection
                source_message.metadata_json = source_metadata
            if generate:
                _mark_thread_attachments_consumed(
                    thread,
                    [
                        ref.get("id")
                        for ref in source_refs
                        if isinstance(ref, dict) and ref.get("type") == "material"
                    ],
                    operation=f"generate:{artifact_type}",
                    job_id=job.id,
                )
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()
            publish_pending_outbox(job_id=job.id)
            return _ok(
                {
                    "thread": _thread_view(thread, include_messages=True),
                    "job": job_view(job),
                    "candidateSetId": candidate_set.id if candidate_set else None,
                },
                202,
            )
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(
                exc,
                404 if isinstance(exc, ScopeError) else 400,
                code="NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST",
            )


COURSE_TOOL_NAMES = {
    name
    for name in AGENT_TOOL_SCHEMAS
    if name.startswith(("course.", "module.", "challenge.", "assignment."))
} | {"material.add_to_module"}
COURSE_NAVIGATION_TOOLS = {
    "course.open",
    "course.studio",
    "course.settings",
    "module.open",
    "challenge.open",
}


def _course_tool_arguments(tool, raw_arguments):
    schema = AGENT_TOOL_SCHEMAS.get(tool)
    if tool not in COURSE_TOOL_NAMES or schema is None:
        raise ValueError("Unsupported course tool")
    risk, allowed_keys = schema
    raw_arguments = raw_arguments if isinstance(raw_arguments, dict) else {}
    arguments = {
        key: scrub_payload(raw_arguments[key], key)
        for key in allowed_keys
        if key in raw_arguments
    }
    if _json_size(arguments) > MAX_AGENT_CONTEXT_BYTES:
        raise ValueError("Course tool arguments exceed 64 KiB")
    return risk, arguments


def _practice_challenge_constraints(brief, raw_constraints):
    constraints = dict(raw_constraints) if isinstance(raw_constraints, dict) else {}
    requested_mode = str(
        constraints.get("exerciseMode")
        or constraints.pop("exercise_mode", None)
        or "CONTAINER"
    ).strip().upper()
    constraints["exerciseMode"] = (
        requested_mode
        if requested_mode in {"CONTAINER", "SIMULATION", "HYBRID"}
        else "CONTAINER"
    )
    if constraints["exerciseMode"] == "CONTAINER":
        constraints.pop("simulation", None)
    return constraints


def _challenge_material_grounding_requested(brief):
    """Return whether an unreferenced request explicitly means course files.

    Merely creating a question inside a course must not silently bind every
    historical file in that course.  Doing so can carry an unrelated handout
    into a new topic and make the build and review agents fight over two
    incompatible specifications.  Explicit message attachments are handled
    separately; this helper only recognizes an intentional all-course-files
    request.
    """

    return course_material_grounding_requested(brief)


def _challenge_batch_item_brief(brief, batch_id, index, count, topic=None):
    if count <= 1:
        return str(brief or "").strip()
    item_label = str(topic or f"批次独立题 {index}").strip()
    return (
        f"独立 CTF {index}/{count}：{item_label}\n\n"
        f"批次执行契约：这是批次 {batch_id} 中第 {index} 道、也是本次调用唯一需要"
        "构建的题目。必须产出一份独立草稿、一套独立隔离环境、一条独立解题路径"
        "和一个独立动态 Flag。原始要求中的总题量只描述整批数量，绝不能实现为本题"
        "内部的关卡数、小问数或共用最终 Flag。\n"
        + (
            f"本题唯一分配主题：{item_label}。题名、核心漏洞、入口、证据、解题动作和 "
            "Flag 获取路径都必须围绕这个主题，不得混入同批其他题的主题。\n"
            if topic
            else "本题必须与同批其他题在核心漏洞、入口、证据、解题动作和 Flag 获取路径上实质不同。\n"
        )
        + f"\n教师对整批题目的原始要求（仅作为共同约束）：\n{str(brief or '').strip()}"
    )


def _course_tool_module(
    dojo,
    arguments,
    *,
    required=True,
    fallback_index=None,
    lock=False,
):
    raw_index = arguments.get("moduleIndex")
    if raw_index is None:
        raw_index = fallback_index
    module = None
    if raw_index is not None:
        try:
            module_index = int(raw_index)
        except (TypeError, ValueError) as exc:
            raise ValueError("章节序号无效，请重新指定目标章节。") from exc
        query = DojoModules.query.filter_by(
            dojo_id=dojo.dojo_id,
            module_index=module_index,
        )
        if lock:
            query = query.with_for_update()
        module = query.first()
    if module is None and required:
        raise ValueError("没有找到指定章节，请确认课程中存在该章节。")
    return module


def _course_tool_assignment(dojo, arguments):
    assignment_id = str(arguments.get("assignmentId") or "").strip()
    if not assignment_id:
        raise ValueError("assignmentId is required")
    assignment = TeachingAssignments.query.filter_by(
        id=assignment_id,
        dojo_id=dojo.dojo_id,
    ).first()
    if assignment is None:
        raise ValueError("Target assignment was not found")
    return assignment


def _course_tool_members(dojo):
    rows = (
        DojoUsers.query.filter_by(dojo_id=dojo.dojo_id)
        .order_by(DojoUsers.type, DojoUsers.user_id)
        .limit(1000)
        .all()
    )
    return [
        {
            "username": row.user.name,
            "role": "teacher" if row.type == "admin" else "student",
        }
        for row in rows
        if row.user is not None
    ]


def _course_tool_snapshot(dojo, *, include_members=False):
    result = {
        "id": dojo.dojo_id,
        "referenceId": dojo.reference_id,
        "slug": dojo.id,
        "name": dojo.name or dojo.id or dojo.reference_id,
        "description": dojo.description,
        "access": "public" if dojo.type == "public" else "private",
        "official": bool(dojo.official),
        "repositoryBacked": bool(dojo.repository),
        "showScoreboard": bool(dojo.show_scoreboard),
        "url": f"/{dojo.reference_id}",
        "studioUrl": f"/teacher/courses?{urlencode({'dojo': dojo.reference_id, 'tab': 'questions'})}",
        "settingsUrl": f"/dojo/{dojo.reference_id}/admin/",
        "modules": [
            {
                "index": module.module_index,
                "id": module.id,
                "name": module.name or module.id,
                "description": module.description,
                "showChallenges": bool(module.show_challenges),
                "showScoreboard": bool(module.show_scoreboard),
                "url": f"/{dojo.reference_id}/{module.id}",
                "resources": [
                    {
                        "index": resource.resource_index,
                        "type": resource.type,
                        "name": resource.name,
                        "materialId": (resource.data or {}).get("materialId"),
                    }
                    for resource in module.resources[:200]
                ],
                "challenges": [
                    {
                        "id": challenge.id,
                        "name": challenge.name or challenge.id,
                        "required": bool(challenge.required),
                        "exerciseMode": challenge.exercise_mode,
                        "url": (f"/{dojo.reference_id}/{module.id}/{challenge.id}"),
                    }
                    for challenge in module.challenges[:200]
                    if is_supported_exercise(challenge)
                ],
            }
            for module in dojo.modules[:200]
        ],
    }
    if include_members:
        result["members"] = _course_tool_members(dojo)
    return result


def _course_tool_message(tool, result):
    course = result.get("course") or {}
    module = result.get("module") or {}
    challenge = result.get("challenge") or {}
    assignment = result.get("assignment") or {}
    material = result.get("material") or {}
    if tool == "course.list":
        courses = result.get("courses") or []
        names = "、".join(
            str(item.get("name") or item.get("slug") or "未命名课程")
            for item in courses[:8]
        )
        suffix = f"：{names}" if names else "。"
        return f"你当前可以管理 {len(courses)} 门课程{suffix}"
    if tool == "course.read":
        return (
            f"已读取课程“{course.get('name')}”："
            f"{len(course.get('modules') or [])} 个章节。"
        )
    if tool == "course.members":
        members = result.get("members") or []
        teachers = sum(1 for item in members if item.get("role") == "teacher")
        return f"课程当前有 {teachers} 名教师、{len(members) - teachers} 名学生。"
    if tool == "course.create":
        if module:
            return (
                f"已创建课程“{course.get('name')}”和内容章节“{module.get('name')}”，"
                "并将当前对话切换到该章节。"
            )
        return (
            f"已创建课程“{course.get('name')}”，并将当前对话切换到该课程。"
            "你可以继续让我创建章节、上传课件或生成题目。"
        )
    if tool == "course.update":
        return f"已更新课程“{course.get('name')}”的设置。"
    if tool == "course.sync":
        return f"已从课程仓库同步“{course.get('name')}”。"
    if tool == "course.promote":
        return f"已将“{course.get('name')}”设为推荐课程。"
    if tool == "course.delete":
        return f"已删除课程“{result.get('deletedCourseName')}”及其课程关联数据。"
    if tool == "course.member.add":
        member = result.get("member") or {}
        return f"已将 {member.get('username')} 加入课程，角色为 {member.get('role')}。"
    if tool == "course.member.remove":
        return f"已将 {result.get('removedUsername')} 从课程成员中移除。"
    if tool == "module.create":
        return f"已在课程中创建章节“{module.get('name')}”。"
    if tool == "module.update":
        return f"已更新章节“{module.get('name')}”。"
    if tool == "module.delete":
        return (
            f"已删除章节“{result.get('deletedModuleName')}”及其中 "
            f"{result.get('deletedChallengeCount', 0)} 道题目。"
        )
    if tool == "material.add_to_module":
        return (
            f"已将文件“{material.get('title') or material.get('filename')}”添加到"
            f"课程“{course.get('name')}”的章节“{module.get('name')}”资料中。"
        )
    if tool == "challenge.generate":
        count = max(1, min(5, int(result.get("challengeCount") or 1)))
        return (
            f"已在章节“{module.get('name')}”启动 {count} 道独立 CTF 实践题的生成任务。"
            "生成、构建和验证进度会显示在当前任务详情中。"
        )
    if tool == "challenge.revise":
        count = max(1, min(5, int(result.get("challengeCount") or 1)))
        return (
            f"已启动 {count} 道 CTF 实践题的统一修订。"
            "每道题都会独立重新构建并执行可用性验证。"
        )
    if tool == "challenge.publish":
        return (
            f"已发布 CTF 实践题“{challenge.get('name') or challenge.get('id')}”。"
            "题目现在可从课程题目列表打开，后台将继续执行独立解题验证。"
        )
    if tool == "challenge.delete":
        return (
            f"已永久删除题目“{challenge.get('name') or challenge.get('id')}”"
            "及其关联草稿。"
        )
    if tool == "assignment.list":
        rows = result.get("assignments") or []
        return f"当前课程共有 {len(rows)} 项作业或测验。"
    if tool == "assignment.read":
        return f"已读取“{assignment.get('title')}”的题目、发布和提交状态。"
    if tool == "assignment.submissions":
        rows = result.get("students") or []
        graded = sum(1 for row in rows if row.get("status") == "GRADED")
        return f"“{assignment.get('title')}”已有 {graded}/{len(rows)} 名学生完成批改。"
    if tool == "assignment.generate":
        count = int(result.get("questionCount") or 0)
        return (
            f"已生成包含 {count} 道独立题目的作业草稿“{assignment.get('title')}”，"
            "题量已核对，请预览后再发布给学生。"
        )
    if tool == "assignment.publish":
        return f"已发布“{assignment.get('title')}”，学生现在可以在任务中心作答。"
    if tool == "assignment.close":
        return (
            f"已关闭“{assignment.get('title')}”，学生仍可查看历史结果但不能继续提交。"
        )
    if tool == "assignment.update":
        return f"已更新作业“{assignment.get('title')}”的内容与发布设置。"
    if tool == "assignment.delete":
        return f"已删除作业“{result.get('deletedAssignmentTitle')}”。"
    if tool == "assignment.grade.override":
        return f"已由教师复核并更新“{assignment.get('title')}”的一份提交成绩。"
    return "操作成功。"


def _course_tool_destination_label(tool):
    if tool == "material.add_to_module":
        return "打开章节资料"
    if tool.startswith("assignment."):
        return "打开作业与批改"
    if tool in {"course.list", "course.delete"}:
        return "打开课程管理"
    if tool == "course.create":
        return "管理新课程"
    if tool in {"course.members", "course.member.add", "course.member.remove"}:
        return "管理课程成员"
    if tool.startswith("module.") or tool.startswith("challenge."):
        return "打开题目管理"
    if tool in {"course.read"}:
        return "打开课程总览"
    return "打开课程管理"


def _record_failed_course_tool(
    *, user, thread, tool, risk, arguments, idempotency_key, error
):
    if thread is None or not idempotency_key or tool not in COURSE_TOOL_NAMES:
        return
    try:
        action = TeachingAgentActions.query.filter_by(
            idempotency_key=idempotency_key,
            actor_id=user.id,
        ).first()
        if action is None:
            action = TeachingAgentActions(
                thread_id=thread.id,
                actor_id=user.id,
                action_type=f"agent-{tool}"[:80],
                risk_level=risk,
                target_type=(
                    "course"
                    if tool.startswith("course.")
                    else "module"
                    if tool.startswith("module.")
                    else "challenge"
                    if tool.startswith("challenge.")
                    else "material"
                    if tool.startswith("material.")
                    else "assignment"
                ),
                target_id=None,
                status="FAILED",
                idempotency_key=idempotency_key,
                request_json={
                    "dojoId": thread.dojo_id,
                    "tool": tool,
                    "arguments": arguments,
                },
                result={},
            )
            db.session.add(action)
        action.status = "FAILED"
        action.error = redact_text(error, limit=4000)
        action.completed = datetime.datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Unable to persist failed course tool audit")


@teaching_namespace.route("/agent-tools/execute")
class GlobalAgentToolExecution(Resource):
    @authed_only
    def post(self):
        user = _current_user()
        body = _body()
        tool = str(body.get("tool") or "")
        thread = None
        risk = "R0"
        arguments = {}
        idempotency_key = None
        selected_generation = None
        confirmed_generation_plan = None
        if tool in COURSE_NAVIGATION_TOOLS:
            return _error("Navigation tools must be opened from the conversation card")
        try:
            _require_teacher(user)
            thread = _thread_for_owner(str(body.get("threadId") or ""), user)
            raw_arguments = body.get("arguments")
            proposal_source_refs = []
            if tool == "challenge.generate":
                source_job_id = str(body.get("sourceJobId") or "").strip()
                if source_job_id:
                    source_job = TeachingJobs.query.filter_by(
                        id=source_job_id,
                        owner_id=user.id,
                        thread_id=thread.id,
                        kind="agent.chat",
                        status="SUCCEEDED",
                    ).first()
                    if source_job is None:
                        raise ValueError("出题请求的来源任务不存在或尚未完成。")
                    raw_source_refs = (source_job.payload or {}).get("sourceRefs")
                    if isinstance(raw_source_refs, list):
                        proposal_source_refs = scrub_payload(raw_source_refs)
                raw_selection = body.get("generationSelection")
                if not isinstance(raw_selection, dict):
                    raise ValueError(
                        "请先在智能体给出的三套 CTF 方案中选择一套，再开始正式生成。"
                    )
                if isinstance(raw_selection, dict):
                    selected_generation = _generation_option_context(
                        user,
                        thread,
                        raw_selection.get("sourceMessageId"),
                        raw_selection.get("optionId"),
                        require_selected=True,
                    )
                    trusted_proposal = _generation_option_proposal(
                        user,
                        thread,
                        selected_generation,
                    )
                    if trusted_proposal["tool"] != tool:
                        raise ValueError("所选方案不是 CTF 实践题生成方案。")
                    raw_arguments = trusted_proposal["arguments"]
                raw_arguments, confirmed_generation_plan = (
                    _confirmed_challenge_generation_plan(
                        raw_arguments,
                        body.get("generationPlan"),
                    )
                )
            risk, arguments = _course_tool_arguments(tool, raw_arguments)
            if risk == "R3" and body.get("confirmed") is not True:
                return _error(
                    "Explicit confirmation is required for this course change",
                    409,
                    code="CONFIRMATION_REQUIRED",
                )

            idempotency_key = _unique_idempotency(user.id, "agent-tool")
            existing = TeachingAgentActions.query.filter_by(
                idempotency_key=idempotency_key,
                actor_id=user.id,
            ).first()
            if existing is not None:
                if existing.status not in {
                    "APPROVED",
                    "COMPLETED",
                    "PENDING",
                    "SUCCEEDED",
                }:
                    return _error(
                        existing.error or "上一次操作未完成，请修正后重试。",
                        409,
                        code="PREVIOUS_ATTEMPT_FAILED",
                    )
                return _ok(
                    {
                        "action": _action_view(existing),
                        "result": existing.result or {},
                        "thread": _thread_view(thread, include_messages=True),
                        "deduplicated": True,
                        "message": _course_tool_message(
                            tool,
                            existing.result or {},
                        ),
                    },
                )

            dojo = None
            if tool not in {"course.list", "course.create"}:
                placement_reference = (
                    str(arguments.get("referenceId") or "").strip()
                    if tool == "material.add_to_module"
                    else ""
                )
                if placement_reference:
                    # File placement is intentionally atomic: an unscoped global
                    # conversation may name any course the teacher can manage, and
                    # this operation both places the original file and moves the
                    # conversation into that trusted course/module scope.
                    dojo = dojo_for_user(user, placement_reference, teacher=True)
                    arguments["referenceId"] = dojo.reference_id
                else:
                    if thread.dojo_id is None:
                        raise ValueError("Please select a target course first")
                    dojo = dojo_for_user(user, thread.dojo_id, teacher=True)

            action = TeachingAgentActions(
                thread_id=thread.id,
                actor_id=user.id,
                action_type=f"agent-{tool}"[:80],
                risk_level=risk,
                target_type=(
                    "course"
                    if tool.startswith("course.")
                    else "module"
                    if tool.startswith("module.")
                    else "challenge"
                    if tool.startswith("challenge.")
                    else "material"
                    if tool.startswith("material.")
                    else "assignment"
                ),
                target_id=(dojo.reference_id if dojo is not None else None),
                status="RUNNING",
                idempotency_key=idempotency_key,
                request_json={
                    "dojoId": dojo.dojo_id if dojo is not None else None,
                    "tool": tool,
                    "arguments": arguments,
                    **(
                        {"generationPlan": confirmed_generation_plan}
                        if confirmed_generation_plan is not None
                        else {}
                    ),
                },
                result={},
            )
            db.session.add(action)
            db.session.flush()

            cleanup_packages = []
            cleanup_workspaces = []
            cleanup_course_path = None
            published_challenge = None
            queued_job = None
            queued_jobs = []
            authoring_job = None
            authoring_jobs = []
            result = {}
            href = None
            card_title = "课程操作"

            if tool == "course.list":
                courses = [_course_tool_snapshot(item) for item in _teacher_dojos(user)]
                result = {"courses": courses}
                href = "/teacher/courses?tab=overview"
                card_title = "可管理课程"
            elif tool == "course.read":
                result = {"course": _course_tool_snapshot(dojo, include_members=True)}
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
                card_title = "课程详情"
            elif tool == "course.members":
                members = _course_tool_members(dojo)
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "members": members,
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
                card_title = "课程成员"
            elif tool == "material.add_to_module":
                source_material = _material_for_teacher(
                    str(arguments.get("materialId") or ""), user, lock=True
                )
                if source_material.dojo_id not in {None, dojo.dojo_id}:
                    raise ValueError("这份文件已归属于另一门课程，不能跨课程重复写入。")
                dojo = (
                    Dojos.query.filter_by(dojo_id=dojo.dojo_id)
                    .with_for_update()
                    .first()
                )
                if dojo is None:
                    raise ValueError("目标课程已不存在。")
                module = _course_tool_module(
                    dojo,
                    arguments,
                    fallback_index=thread.module_index,
                    lock=True,
                )
                material = source_material
                if source_material.dojo_id is None:
                    existing_material = TeachingMaterials.query.filter(
                        TeachingMaterials.owner_id == user.id,
                        TeachingMaterials.dojo_id == dojo.dojo_id,
                        TeachingMaterials.sha256 == source_material.sha256,
                        TeachingMaterials.id != source_material.id,
                        TeachingMaterials.status != "ARCHIVED",
                    ).first()
                    if existing_material is not None:
                        material = existing_material
                resource_name = str(
                    arguments.get("name")
                    or source_material.title
                    or source_material.filename
                ).strip()[:128]
                if not resource_name:
                    resource_name = "课程资料"
                resource = next(
                    (
                        item
                        for item in module.resources
                        if str((item.data or {}).get("materialId") or "")
                        == material.id
                    ),
                    None,
                )
                if resource is None:
                    maximum = (
                        db.session.query(func.max(DojoResources.resource_index))
                        .filter_by(
                            dojo_id=dojo.dojo_id,
                            module_index=module.module_index,
                        )
                        .scalar()
                    )
                    resource_index = (maximum + 1) if maximum is not None else 0
                    link_text = resource_name.replace("[", "（").replace("]", "）")
                    download_url = (
                        "/pwncollege_api/v1/teaching/materials/"
                        f"{material.id}/download"
                    )
                    resource = DojoResources(
                        dojo_id=dojo.dojo_id,
                        module_index=module.module_index,
                        resource_index=resource_index,
                        type="markdown",
                        name=resource_name,
                        data={
                            "content": (
                                f"[下载《{link_text}》]({download_url})\n\n"
                                f"文件类型：{material.mime_type} · "
                                f"大小：{material.size} 字节"
                            ),
                            "expandable": True,
                            "materialId": material.id,
                            "filename": _material_original_filename(material),
                            "mimeType": material.mime_type,
                            "size": material.size,
                        },
                    )
                    db.session.add(resource)
                    db.session.flush()
                else:
                    resource.name = resource_name
                if material.id == source_material.id:
                    material.dojo_id = dojo.dojo_id
                placement = {
                    "dojoId": dojo.dojo_id,
                    "courseReferenceId": dojo.reference_id,
                    "moduleIndex": module.module_index,
                    "moduleId": module.id,
                    "moduleName": module.name or module.id,
                    "resourceIndex": resource.resource_index,
                    "addedAt": _timestamp(datetime.datetime.utcnow()),
                }
                metadata = dict(material.metadata_json or {})
                placements = [
                    item
                    for item in (metadata.get("placements") or [])
                    if isinstance(item, dict)
                    and not (
                        item.get("dojoId") == dojo.dojo_id
                        and item.get("moduleIndex") == module.module_index
                    )
                ]
                placements.append(placement)
                metadata["placements"] = placements[-50:]
                material.metadata_json = metadata
                if material.id != source_material.id:
                    source_metadata = dict(source_material.metadata_json or {})
                    source_metadata["mergedIntoMaterialId"] = material.id
                    source_metadata["placements"] = [
                        *[
                            item
                            for item in (source_metadata.get("placements") or [])
                            if isinstance(item, dict)
                            and not (
                                item.get("dojoId") == dojo.dojo_id
                                and item.get("moduleIndex") == module.module_index
                            )
                        ],
                        placement,
                    ][-50:]
                    source_material.metadata_json = source_metadata
                else:
                    for analysis_job in _material_jobs(
                        user.id, [material.id], active_only=True
                    ).values():
                        analysis_job.dojo_id = dojo.dojo_id
                        analysis_job.module_index = module.module_index
                _mark_thread_attachment_placed(
                    thread, source_material.id, placement
                )
                thread.dojo_id = dojo.dojo_id
                thread.module_index = module.module_index
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "module": {
                        "index": module.module_index,
                        "id": module.id,
                        "name": module.name or module.id,
                        "url": f"/{dojo.reference_id}/{module.id}",
                    },
                    "material": _material_attachment_view(material),
                    "resource": {
                        "index": resource.resource_index,
                        "name": resource.name,
                        "url": f"/{dojo.reference_id}/{module.id}#module-content",
                    },
                }
                href = f"/{dojo.reference_id}/{module.id}#module-content"
                card_title = "章节资料已添加"
                action.target_id = material.id
            elif tool == "assignment.list":
                assignments = (
                    TeachingAssignments.query.filter_by(
                        dojo_id=dojo.dojo_id,
                    )
                    .order_by(TeachingAssignments.updated.desc())
                    .limit(300)
                    .all()
                )
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "assignments": [
                        assignment_view(
                            item, user=user, teacher=True, include_items=False
                        )
                        for item in assignments
                    ],
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions"
                card_title = "课程作业"
            elif tool in {"assignment.read", "assignment.submissions"}:
                assignment = _course_tool_assignment(dojo, arguments)
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "assignment": assignment_view(assignment, user=user, teacher=True),
                }
                if tool == "assignment.submissions":
                    result["students"] = roster_submissions(assignment)
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}"
                card_title = "作业详情" if tool == "assignment.read" else "提交与批改"
                action.target_id = assignment.id
            elif tool == "assignment.generate":
                generation_request = dict(arguments)
                if (
                    generation_request.get("moduleIndex") is None
                    and thread.module_index is not None
                ):
                    generation_request["moduleIndex"] = thread.module_index
                payload = generate_assignment_payload(generation_request, dojo)
                generation_meta = (
                    ((payload.get("settings") or {}).get("generation") or {})
                    if isinstance(payload.get("settings"), dict)
                    else {}
                )
                requested_question_count = int(
                    generation_meta.get("requestedQuestionCount") or 0
                )
                generated_question_count = sum(
                    1
                    for item in payload.get("items") or []
                    if isinstance(item, dict) and item.get("type") != "CHALLENGE"
                )
                if (
                    requested_question_count < 1
                    or generated_question_count != requested_question_count
                ):
                    raise RuntimeError(
                        "Assignment generation did not satisfy the requested question count"
                    )
                assignment = create_assignment(user, dojo, payload)
                db.session.flush()
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "assignment": assignment_view(assignment, user=user, teacher=True),
                    "requestedQuestionCount": requested_question_count,
                    "questionCount": generated_question_count,
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}"
                card_title = "作业草稿已生成"
                action.target_id = assignment.id
            elif tool == "assignment.update":
                assignment = _course_tool_assignment(dojo, arguments)
                update_assignment(
                    assignment,
                    {
                        key: value
                        for key, value in arguments.items()
                        if key != "assignmentId"
                    },
                    user,
                )
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "assignment": assignment_view(assignment, user=user, teacher=True),
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}"
                card_title = "作业已更新"
                action.target_id = assignment.id
            elif tool in {"assignment.publish", "assignment.close"}:
                assignment = _course_tool_assignment(dojo, arguments)
                if tool == "assignment.publish":
                    publish_assignment(assignment, user)
                    card_title = "作业已发布"
                else:
                    close_assignment(assignment, user)
                    card_title = "作业已关闭"
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "assignment": assignment_view(assignment, user=user, teacher=True),
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}"
                action.target_id = assignment.id
            elif tool == "assignment.delete":
                assignment = _course_tool_assignment(dojo, arguments)
                deleted_id = assignment.id
                deleted_title = assignment.title
                delete_assignment(assignment, user)
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "deletedAssignmentId": deleted_id,
                    "deletedAssignmentTitle": deleted_title,
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions"
                card_title = "作业已删除"
                action.target_id = deleted_id
            elif tool == "assignment.grade.override":
                assignment = _course_tool_assignment(dojo, arguments)
                submission = override_submission_grade(
                    assignment,
                    arguments.get("submissionId"),
                    user,
                    arguments.get("score"),
                    arguments.get("feedback") if "feedback" in arguments else None,
                )
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "assignment": assignment_view(assignment, user=user, teacher=True),
                    "submissionId": submission.id,
                    "students": roster_submissions(assignment),
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}"
                card_title = "成绩已复核"
                action.target_id = submission.id
            elif tool == "course.create":
                name = str(arguments.get("name") or "").strip()
                if not 1 <= len(name) <= 128:
                    raise ValueError("Course name must contain 1-128 characters")
                description = str(arguments.get("description") or "").strip()
                if len(description) > 24000:
                    raise ValueError("Course description exceeds 24,000 characters")
                slug = _module_slug(
                    arguments.get("slug") or name,
                    f"course-{secrets.token_hex(4)}",
                )
                if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?", slug):
                    raise ValueError(
                        "Course slug must use lowercase letters, digits, or hyphens"
                    )
                access = str(arguments.get("access") or "private").lower()
                if access not in {"private", "public"}:
                    raise ValueError("Course access must be private or public")
                dojo = Dojos(
                    id=slug,
                    name=name,
                    description=description or None,
                    type="public" if access == "public" else "course",
                    private_key=secrets.token_hex(32),
                )
                ensure_course_join_code(dojo)
                dojo.admins = [DojoAdmins(user=user)]
                db.session.add(dojo)
                db.session.flush()
                thread.dojo_id = dojo.dojo_id
                thread.module_index = None
                initial_module = None
                initial_module_name = str(
                    arguments.get("initialModuleName") or ""
                ).strip()
                if initial_module_name:
                    if len(initial_module_name) > 128:
                        raise ValueError("Initial module name exceeds 128 characters")
                    initial_module_id = _module_slug(
                        arguments.get("initialModuleId") or initial_module_name,
                        "course-content",
                    )
                    initial_module = DojoModules(
                        dojo=dojo,
                        module_index=0,
                        id=initial_module_id,
                        name=initial_module_name,
                        description="由全局教学智能体为本次内容生成自动建立。",
                        show_scoreboard=True,
                        show_challenges=True,
                    )
                    db.session.add(initial_module)
                    db.session.flush()
                    thread.module_index = initial_module.module_index
                action.target_id = dojo.reference_id
                action.request_json = {
                    **action.request_json,
                    "dojoId": dojo.dojo_id,
                }
                result = {"course": _course_tool_snapshot(dojo)}
                if initial_module is not None:
                    result["module"] = {
                        "index": initial_module.module_index,
                        "id": initial_module.id,
                        "name": initial_module.name,
                        "description": initial_module.description,
                        "url": f"/{dojo.reference_id}/{initial_module.id}",
                    }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
                card_title = "课程已创建"
            elif tool == "course.update":
                if "name" in arguments:
                    name = str(arguments.get("name") or "").strip()
                    if not 1 <= len(name) <= 128:
                        raise ValueError("Course name must contain 1-128 characters")
                    dojo.name = name
                if "description" in arguments:
                    description = str(arguments.get("description") or "").strip()
                    if len(description) > 24000:
                        raise ValueError("Course description exceeds 24,000 characters")
                    dojo.description = description or None
                if "access" in arguments:
                    access = str(arguments.get("access") or "").lower()
                    if access not in {"private", "public"}:
                        raise ValueError("Course access must be private or public")
                    dojo.type = "public" if access == "public" else "course"
                if "showScoreboard" in arguments:
                    dojo.show_scoreboard = bool(arguments["showScoreboard"])
                result = {"course": _course_tool_snapshot(dojo)}
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
                card_title = "课程已更新"
            elif tool == "course.sync":
                if not dojo.repository:
                    raise ValueError(
                        "This native course is not backed by a Git repository"
                    )
                from ...utils.dojo import dojo_update
                from ...utils.image_pulls import enqueue_dojo_image_pulls

                dojo_update(dojo)
                enqueue_dojo_image_pulls(dojo)
                result = {"course": _course_tool_snapshot(dojo)}
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
                card_title = "课程已同步"
            elif tool == "course.promote":
                if getattr(user, "type", None) != "admin":
                    raise ScopeError("Platform administrator permission required")
                conflict = Dojos.query.filter(
                    Dojos.id == dojo.id,
                    Dojos.official.is_(True),
                    Dojos.dojo_id != dojo.dojo_id,
                ).first()
                if conflict is not None:
                    raise ValueError(
                        "Another recommended course already uses this slug"
                    )
                dojo.official = True
                action.target_id = dojo.reference_id
                result = {"course": _course_tool_snapshot(dojo)}
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
                card_title = "推荐课程已更新"
            elif tool == "course.delete":
                if getattr(user, "type", None) != "admin":
                    raise ScopeError("Platform administrator permission required")
                if TeachingSessions.query.filter_by(
                    dojo_id=dojo.dojo_id,
                    status="LIVE",
                ).first():
                    raise ValueError(
                        "End the live classroom before deleting this course"
                    )
                active_teaching_job = TeachingJobs.query.filter(
                    TeachingJobs.dojo_id == dojo.dojo_id,
                    TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
                ).first()
                active_authoring_job = LearningAuthoringJobs.query.filter(
                    LearningAuthoringJobs.dojo_id == dojo.dojo_id,
                    LearningAuthoringJobs.status.in_(["QUEUED", "RUNNING"]),
                ).first()
                if active_teaching_job is not None or active_authoring_job is not None:
                    raise ValueError(
                        "Course has active generation or validation tasks; wait for them to finish before deletion"
                    )
                deleted_name = dojo.name
                deleted_reference = dojo.reference_id
                dojo_id = dojo.dojo_id
                challenge_ids = [
                    row.challenge_id
                    for row in DojoChallenges.query.filter_by(dojo_id=dojo_id).all()
                    if row.challenge_id is not None
                ]
                cleanup_course_path = (
                    pathlib.Path(config.DOJOS_DIR) / ".learning" / dojo.hex_dojo_id
                )
                try:
                    from ...utils import get_all_containers

                    cleanup_workspaces = list(get_all_containers(dojo))
                except Exception:
                    logger.warning(
                        "Unable to enumerate course workspaces before Agent deletion",
                        exc_info=True,
                    )
                thread.dojo_id = None
                thread.module_index = None
                DojoUsers.query.filter_by(dojo_id=dojo_id).delete(
                    synchronize_session=False
                )
                Dojos.query.filter_by(dojo_id=dojo_id).delete(synchronize_session=False)
                db.session.flush()
                if challenge_ids:
                    referenced = {
                        challenge_id
                        for (challenge_id,) in db.session.query(
                            DojoChallenges.challenge_id
                        )
                        .filter(DojoChallenges.challenge_id.in_(challenge_ids))
                        .all()
                    }
                    orphan_ids = set(challenge_ids) - referenced
                    if orphan_ids:
                        Challenges.query.filter(Challenges.id.in_(orphan_ids)).delete(
                            synchronize_session=False
                        )
                result = {
                    "deletedCourseName": deleted_name,
                    "deletedReferenceId": deleted_reference,
                }
                href = "/teacher/courses?tab=overview"
                card_title = "课程已删除"
            elif tool in {"course.member.add", "course.member.remove"}:
                username = str(arguments.get("username") or "").strip()
                target_user = Users.query.filter_by(name=username).first()
                if target_user is None:
                    raise ValueError("Target username was not found")
                membership = DojoUsers.query.filter_by(
                    dojo_id=dojo.dojo_id,
                    user_id=target_user.id,
                ).first()
                if tool == "course.member.add":
                    role = str(arguments.get("role") or "student").lower()
                    if role not in {"student", "teacher"}:
                        raise ValueError("Member role must be student or teacher")
                    target_type = "admin" if role == "teacher" else "member"
                    if membership is None:
                        membership = (
                            DojoAdmins(dojo=dojo, user=target_user)
                            if target_type == "admin"
                            else DojoMembers(dojo=dojo, user=target_user)
                        )
                        db.session.add(membership)
                    else:
                        membership.type = target_type
                    result = {
                        "course": _course_tool_snapshot(dojo),
                        "member": {"username": target_user.name, "role": role},
                    }
                    card_title = "课程成员已添加"
                else:
                    if membership is None:
                        raise ValueError("Target user is not a course member")
                    if target_user.id == user.id:
                        raise ValueError(
                            "You cannot remove yourself from the current course"
                        )
                    if (
                        membership.type == "admin"
                        and getattr(user, "type", None) != "admin"
                    ):
                        raise ScopeError(
                            "Only a platform administrator can remove another teacher"
                        )
                    db.session.delete(membership)
                    result = {
                        "course": _course_tool_snapshot(dojo),
                        "removedUsername": target_user.name,
                    }
                    card_title = "课程成员已移除"
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=overview"
            elif tool == "module.create":
                name = str(arguments.get("name") or "").strip()
                if not 1 <= len(name) <= 128:
                    raise ValueError("Module name must contain 1-128 characters")
                module_id = _module_slug(
                    arguments.get("id") or name,
                    f"module-{secrets.token_hex(3)}",
                )
                if DojoModules.query.filter_by(
                    dojo_id=dojo.dojo_id, id=module_id
                ).first():
                    raise ValueError("A module with this id already exists")
                description = str(arguments.get("description") or "").strip()
                if len(description) > 24000:
                    raise ValueError("Module description exceeds 24,000 characters")
                maximum = (
                    db.session.query(func.max(DojoModules.module_index))
                    .filter_by(dojo_id=dojo.dojo_id)
                    .scalar()
                )
                module = DojoModules(
                    dojo=dojo,
                    module_index=(maximum + 1) if maximum is not None else 0,
                    id=module_id,
                    name=name,
                    description=description or None,
                    show_scoreboard=True,
                    show_challenges=True,
                )
                db.session.add(module)
                db.session.flush()
                thread.module_index = module.module_index
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "module": next(
                        item
                        for item in _course_tool_snapshot(dojo)["modules"]
                        if item["index"] == module.module_index
                    ),
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}"
                card_title = "章节已创建"
                action.target_id = f"{dojo.reference_id}/{module.id}"
            elif tool == "module.update":
                module = _course_tool_module(dojo, arguments)
                if "name" in arguments:
                    name = str(arguments.get("name") or "").strip()
                    if not 1 <= len(name) <= 128:
                        raise ValueError("Module name must contain 1-128 characters")
                    module.name = name
                if "id" in arguments:
                    module_id = _module_slug(arguments.get("id"), "")
                    if not module_id:
                        raise ValueError("Module id is required")
                    conflict = DojoModules.query.filter(
                        DojoModules.dojo_id == dojo.dojo_id,
                        DojoModules.id == module_id,
                        DojoModules.module_index != module.module_index,
                    ).first()
                    if conflict is not None:
                        raise ValueError("A module with this id already exists")
                    module.id = module_id
                if "description" in arguments:
                    description = str(arguments.get("description") or "").strip()
                    if len(description) > 24000:
                        raise ValueError("Module description exceeds 24,000 characters")
                    module.description = description or None
                if "showChallenges" in arguments:
                    module.show_challenges = bool(arguments["showChallenges"])
                if "showScoreboard" in arguments:
                    module.show_scoreboard = bool(arguments["showScoreboard"])
                module_view = {
                    "index": module.module_index,
                    "id": module.id,
                    "name": module.name,
                    "description": module.description,
                    "url": f"/{dojo.reference_id}/{module.id}",
                }
                result = {"course": _course_tool_snapshot(dojo), "module": module_view}
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}"
                card_title = "章节已更新"
                action.target_id = f"{dojo.reference_id}/{module.id}"
            elif tool == "module.delete":
                module = _course_tool_module(dojo, arguments)
                deleted_name = module.name
                deleted_count = len(module.challenges)
                affected_users = set()
                for challenge in list(module.challenges):
                    module_id = module.id
                    challenge_id = challenge.id
                    from ...learning.authoring import delete_published_challenge

                    deletion = delete_published_challenge(challenge, user)
                    affected_users.update(deletion.pop("_affectedUserIds", []))
                    package_root = deletion.pop("_packageRoot", None)
                    if package_root:
                        cleanup_packages.append(package_root)
                    cleanup_workspaces.append((dojo, module_id, challenge_id))
                if affected_users:
                    from ...learning.assessment import rebuild_skill_states

                    rebuild_skill_states(dojo.dojo_id, sorted(affected_users))
                db.session.delete(module)
                if thread.module_index == module.module_index:
                    thread.module_index = None
                db.session.flush()
                db.session.expire(dojo, ["_modules"])
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "deletedModuleName": deleted_name,
                    "deletedChallengeCount": deleted_count,
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions"
                card_title = "章节已删除"
            elif tool == "challenge.generate":
                module = _course_tool_module(
                    dojo,
                    arguments,
                    fallback_index=thread.module_index,
                )
                brief = str(arguments.get("brief") or "").strip()
                if len(brief) < 12 or len(brief) > 24000:
                    raise ValueError("CTF 实践题要求需包含 12 到 24,000 个字符。")
                raw_challenge_count = arguments.get("challengeCount")
                if raw_challenge_count is None:
                    raw_challenge_count = 1
                try:
                    if isinstance(raw_challenge_count, bool):
                        raise ValueError
                    challenge_count = int(raw_challenge_count)
                    if (
                        isinstance(raw_challenge_count, float)
                        and not raw_challenge_count.is_integer()
                    ):
                        raise ValueError
                    if isinstance(
                        raw_challenge_count, str
                    ) and not raw_challenge_count.strip().isdigit():
                        raise ValueError
                except (TypeError, ValueError) as exc:
                    raise ValueError("一次生成的 CTF 数量必须是 1 到 5。") from exc
                if challenge_count < 1 or challenge_count > 5:
                    raise ValueError("一次生成的 CTF 数量必须是 1 到 5。")
                constraints = _practice_challenge_constraints(
                    brief,
                    arguments.get("constraints"),
                )
                raw_batch_topics = constraints.get("batchTopics")
                batch_topics = []
                if isinstance(raw_batch_topics, list):
                    batch_topics = [
                        str(item or "").strip()[:80] for item in raw_batch_topics
                    ]
                    if (
                        len(batch_topics) != challenge_count
                        or any(len(item) < 2 for item in batch_topics)
                        or len(set(batch_topics)) != challenge_count
                    ):
                        batch_topics = []
                if batch_topics:
                    constraints["batchTopics"] = batch_topics
                else:
                    constraints.pop("batchTopics", None)
                if arguments.get("difficulty") is not None:
                    constraints = {
                        **constraints,
                        "difficulty": str(arguments["difficulty"])[:80],
                    }
                explicit_source_refs = (
                    selected_generation["bundle"].get("sourceRefs") or []
                    if selected_generation is not None
                    else proposal_source_refs
                )
                # Keep ordinary conversation payloads lean, but once the
                # teacher confirms formal authoring, pin the complete current
                # course dossier.  This preserves revision/hash provenance
                # without re-attaching every handout to every chat turn.
                material_context = build_course_material_context(
                    owner_id=user.id,
                    dojo_id=dojo.dojo_id,
                    prompt=brief,
                    source_refs=explicit_source_refs,
                    require_complete=True,
                )
                constraints["sourceMaterialGrounding"] = compact_material_grounding(
                    material_context
                )
                from .learning import _authoring_job_view, _queue_authoring_job

                authoring_request = {
                    "brief": brief,
                    "constraints": scrub_payload(constraints),
                    "sourceRefs": material_context["sourceRefs"],
                    "source": "teacher-global-agent",
                }
                batch_id = f"practice_batch_{uuid.uuid4().hex}"
                confirmed_items = (
                    confirmed_generation_plan.get("items")
                    if isinstance(confirmed_generation_plan, dict)
                    else []
                )
                item_specs = [
                    {
                        "itemIndex": batch_index,
                        "title": (
                            str(confirmed_items[batch_index - 1].get("title") or "").strip()
                            if len(confirmed_items) == challenge_count
                            else batch_topics[batch_index - 1]
                            if len(batch_topics) == challenge_count
                            else f"独立 CTF 题目 {batch_index}"
                        ),
                        "difficulty": (
                            str(
                                confirmed_items[batch_index - 1].get("difficulty")
                                or arguments.get("difficulty")
                                or "按要求递进"
                            )[:80]
                            if len(confirmed_items) == challenge_count
                            else str(arguments.get("difficulty") or "按要求递进")[:80]
                        ),
                    }
                    for batch_index in range(1, challenge_count + 1)
                ]
                generation_batch = TeachingGenerationBatches(
                    id=batch_id,
                    owner_id=user.id,
                    dojo_id=dojo.dojo_id,
                    module_index=module.module_index,
                    thread_id=thread.id,
                    action_id=action.id,
                    operation="challenge.batch.generate",
                    status="QUEUED",
                    requested_count=challenge_count,
                    independence="independent_challenges",
                    exercise_mode="CTF",
                    publish_mode="draft",
                    difficulty_strategy={
                        "mode": str(arguments.get("difficulty") or "")[:80],
                        "perItem": [item["difficulty"] for item in item_specs],
                    },
                    plan={
                        "brief": brief,
                        "items": item_specs,
                        "sourceRefs": material_context["sourceRefs"],
                    },
                    counts={
                        "requested": challenge_count,
                        "created": 0,
                        "validated": 0,
                        "failed": 0,
                    },
                    idempotency_key=f"{action.id}:challenge-batch",
                    confirmed=datetime.datetime.utcnow(),
                )
                db.session.add(generation_batch)
                batch_items = []
                for item_spec in item_specs:
                    batch_item = TeachingGenerationBatchItems(
                        batch_id=batch_id,
                        item_index=item_spec["itemIndex"],
                        status="PLANNED",
                        spec=item_spec,
                    )
                    db.session.add(batch_item)
                    batch_items.append(batch_item)
                db.session.flush()
                base_title = next(
                    (line.strip() for line in brief.splitlines() if line.strip()),
                    "题目生成",
                )
                for batch_index in range(1, challenge_count + 1):
                    batch_constraints = dict(constraints)
                    item_spec = item_specs[batch_index - 1]
                    item_difficulty = str(item_spec.get("difficulty") or "").strip()
                    if item_difficulty:
                        batch_constraints["difficulty"] = item_difficulty
                    batch_topic = (
                        batch_topics[batch_index - 1] if batch_topics else None
                    )
                    batch_brief = _challenge_batch_item_brief(
                        brief,
                        batch_id,
                        batch_index,
                        challenge_count,
                        batch_topic,
                    )
                    if challenge_count > 1:
                        batch_constraints.update(
                            {
                                "batchId": batch_id,
                                "batchIndex": batch_index,
                                "batchCount": challenge_count,
                                "independentChallenge": True,
                                "batchContract": {
                                    "requestedCount": challenge_count,
                                    "itemIndex": batch_index,
                                    "oneDraftPerItem": True,
                                    "oneEnvironmentPerItem": True,
                                    "oneDynamicFlagPerItem": True,
                                },
                                **({"batchTopic": batch_topic} if batch_topic else {}),
                            }
                        )
                    current_request = {
                        **authoring_request,
                        "brief": batch_brief,
                        "constraints": scrub_payload(batch_constraints),
                        "batch": {
                            "id": batch_id,
                            "index": batch_index,
                            "count": challenge_count,
                            "sourceBrief": brief,
                        },
                    }
                    current_authoring_job, error = _queue_authoring_job(
                        dojo=dojo,
                        module=module,
                        author=user,
                        title=(
                            f"{batch_topic}（{batch_index}/{challenge_count}）"
                            if batch_topic
                            else f"CTF 实践题 {batch_index}/{challenge_count}"
                            if challenge_count > 1
                            else base_title
                        ),
                        request_json=current_request,
                        durable_payload={
                            "sourceRefs": material_context["sourceRefs"],
                            "materialContext": material_context["coverage"],
                            "batchId": batch_id,
                            "batchIndex": batch_index,
                            "batchCount": challenge_count,
                            **({"batchTopic": batch_topic} if batch_topic else {}),
                        },
                        action_id=action.id,
                        thread_id=thread.id,
                        publish=False,
                        commit=False,
                    )
                    if error:
                        raise RuntimeError(
                            "Unable to start every native challenge authoring job"
                        )
                    current_queued_job = TeachingJobs.query.filter_by(
                        idempotency_key=(
                            f"learning-authoring:{current_authoring_job.id}"
                        )
                    ).first()
                    if current_queued_job is None:
                        raise RuntimeError(
                            "Unable to locate a queued challenge authoring job"
                        )
                    batch_item = batch_items[batch_index - 1]
                    batch_item.status = "QUEUED"
                    batch_item.task_id = current_queued_job.id
                    batch_item.authoring_job_id = current_authoring_job.id
                    authoring_jobs.append(current_authoring_job)
                    queued_jobs.append(current_queued_job)
                if (
                    len(authoring_jobs) != challenge_count
                    or len(queued_jobs) != challenge_count
                    or len({item.id for item in queued_jobs}) != challenge_count
                ):
                    raise RuntimeError(
                        "CTF batch did not create one durable job per requested challenge"
                    )
                authoring_job = authoring_jobs[0]
                queued_job = queued_jobs[0]
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "module": {
                        "index": module.module_index,
                        "id": module.id,
                        "name": module.name,
                    },
                    "authoringJob": _authoring_job_view(authoring_job),
                    "job": job_view(queued_job),
                    "authoringJobs": [
                        _authoring_job_view(item) for item in authoring_jobs
                    ],
                    "jobs": [job_view(item) for item in queued_jobs],
                    "authoringJobIds": [item.id for item in authoring_jobs],
                    "formalJobIds": [item.id for item in queued_jobs],
                    "challengeCount": challenge_count,
                    "batchId": batch_id,
                    "batchTopics": batch_topics,
                    "generationBatch": {
                        "id": batch_id,
                        "status": "queued",
                        "requestedCount": challenge_count,
                        "createdCount": 0,
                        "validatedCount": 0,
                        "failedCount": 0,
                        "items": [
                            {
                                "itemIndex": item.item_index,
                                "taskId": item.task_id,
                                "authoringJobId": item.authoring_job_id,
                                "draftId": None,
                                "status": "queued",
                                "spec": item.spec,
                            }
                            for item in batch_items
                        ],
                    },
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}"
                card_title = (
                    f"{challenge_count} 道题目生成已启动"
                    if challenge_count > 1
                    else "题目生成已启动"
                )
                action.target_id = batch_id if challenge_count > 1 else str(authoring_job.id)
                _mark_thread_attachments_consumed(
                    thread,
                    [
                        ref.get("id")
                        for ref in material_context.get("sourceRefs", [])
                        if isinstance(ref, dict) and ref.get("type") == "material"
                    ],
                    operation="generate:ctf-challenge",
                    job_id=queued_job.id,
                )
            elif tool == "challenge.revise":
                from .learning import _authoring_job_view, _queue_authoring_job

                raw_draft_ids = arguments.get("draftIds")
                if not isinstance(raw_draft_ids, list):
                    raise ValueError("需要提供要修订的题目草稿列表。")
                draft_ids = []
                for raw_draft_id in raw_draft_ids:
                    draft_id = str(raw_draft_id or "").strip()
                    if draft_id and draft_id not in draft_ids:
                        draft_ids.append(draft_id)
                if not 1 <= len(draft_ids) <= 5:
                    raise ValueError("一次可以统一修订 1 到 5 道 CTF 实践题。")
                instruction = str(arguments.get("instruction") or "").strip()
                if not 3 <= len(instruction) <= 12000:
                    raise ValueError("修订要求需包含 3 到 12,000 个字符。")
                drafts_by_id = {
                    item.id: item
                    for item in LearningDrafts.query.filter(
                        LearningDrafts.id.in_(draft_ids),
                        LearningDrafts.dojo_id == dojo.dojo_id,
                        LearningDrafts.author_id == user.id,
                    ).all()
                }
                if set(drafts_by_id) != set(draft_ids):
                    raise ValueError("一个或多个目标题目草稿不存在或不属于当前课程。")
                drafts = [drafts_by_id[draft_id] for draft_id in draft_ids]
                active_draft_ids = {
                    row[0]
                    for row in db.session.query(LearningAuthoringJobs.draft_id)
                    .filter(
                        LearningAuthoringJobs.draft_id.in_(draft_ids),
                        LearningAuthoringJobs.status.in_(("QUEUED", "RUNNING")),
                    )
                    .all()
                }
                if active_draft_ids:
                    raise ValueError("一个或多个题目已有生成或修订任务正在进行。")
                batch_id = f"ctf_revision_{uuid.uuid4().hex}"
                for batch_index, draft in enumerate(drafts, start=1):
                    module = DojoModules.query.filter_by(
                        dojo_id=dojo.dojo_id,
                        module_index=draft.module_index,
                    ).first()
                    if module is None:
                        raise ValueError("题目草稿所属章节已不存在。")
                    draft.status = "BUILDING"
                    draft.validation = {}
                    current_authoring_job, error = _queue_authoring_job(
                        dojo=dojo,
                        module=module,
                        author=user,
                        title=(
                            "修订："
                            + str((draft.spec or {}).get("name") or draft.brief)[:220]
                        ),
                        kind="REVISE",
                        draft_id=draft.id,
                        request_json={"message": instruction},
                        durable_payload={
                            "draftId": draft.id,
                            "batchId": batch_id,
                            "batchIndex": batch_index,
                            "batchCount": len(drafts),
                        },
                        action_id=action.id,
                        thread_id=thread.id,
                        publish=False,
                        commit=False,
                    )
                    if error:
                        raise RuntimeError(
                            "Unable to start every native challenge revision job"
                        )
                    current_queued_job = TeachingJobs.query.filter_by(
                        idempotency_key=(
                            f"learning-authoring:{current_authoring_job.id}"
                        )
                    ).first()
                    if current_queued_job is None:
                        raise RuntimeError(
                            "Unable to locate a queued challenge revision job"
                        )
                    authoring_jobs.append(current_authoring_job)
                    queued_jobs.append(current_queued_job)
                authoring_job = authoring_jobs[0]
                queued_job = queued_jobs[0]
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "authoringJob": _authoring_job_view(authoring_job),
                    "job": job_view(queued_job),
                    "authoringJobs": [
                        _authoring_job_view(item) for item in authoring_jobs
                    ],
                    "jobs": [job_view(item) for item in queued_jobs],
                    "authoringJobIds": [item.id for item in authoring_jobs],
                    "formalJobIds": [item.id for item in queued_jobs],
                    "draftIds": draft_ids,
                    "challengeCount": len(drafts),
                    "batchId": batch_id,
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions"
                card_title = f"{len(drafts)} 道题目修订已启动"
                action.target_id = batch_id
            elif tool == "challenge.publish":
                draft = LearningDrafts.query.filter_by(
                    id=str(arguments.get("draftId") or ""),
                    dojo_id=dojo.dojo_id,
                    author_id=user.id,
                ).first()
                if draft is None:
                    raise ValueError("Target native challenge draft was not found")
                module = DojoModules.query.filter_by(
                    dojo_id=dojo.dojo_id,
                    module_index=draft.module_index,
                ).first()
                if module is None:
                    raise ValueError("Draft module no longer exists")
                from ...learning.authoring import publish_draft

                published_challenge = publish_draft(draft, user)
                db.session.flush()
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "module": {
                        "index": module.module_index,
                        "id": module.id,
                        "name": module.name,
                    },
                    "challenge": {
                        "id": published_challenge.id,
                        "name": published_challenge.name,
                        "referenceId": published_challenge.reference_id,
                        "moduleId": module.id,
                        "exerciseMode": published_challenge.exercise_mode,
                    },
                    "draftId": draft.id,
                }
                href = (
                    f"/teacher/courses?dojo={dojo.reference_id}"
                    f"&tab=questions&module={module.module_index}"
                )
                card_title = "CTF 实践题已发布"
                action.target_id = published_challenge.reference_id
            elif tool == "challenge.delete":
                module = _course_tool_module(dojo, arguments)
                challenge_id = str(arguments.get("challengeId") or "").strip()
                challenge = next(
                    (item for item in module.challenges if item.id == challenge_id),
                    None,
                )
                if challenge is None:
                    raise ValueError("Target challenge was not found")
                challenge_name = challenge.name
                from ...learning.assessment import rebuild_skill_states
                from ...learning.authoring import delete_published_challenge

                deletion = delete_published_challenge(challenge, user)
                rebuild_skill_states(
                    dojo.dojo_id,
                    deletion.pop("_affectedUserIds", []),
                )
                package_root = deletion.pop("_packageRoot", None)
                if package_root:
                    cleanup_packages.append(package_root)
                cleanup_workspaces.append((dojo, module.id, challenge_id))
                db.session.expire(module, ["_challenges"])
                result = {
                    "course": _course_tool_snapshot(dojo),
                    "module": {
                        "index": module.module_index,
                        "id": module.id,
                        "name": module.name,
                    },
                    "challenge": {"id": challenge_id, "name": challenge_name},
                    "deletion": deletion,
                }
                href = f"/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}"
                card_title = "题目已删除"
                action.target_id = f"{dojo.reference_id}/{module.id}/{challenge_id}"
            else:
                raise ValueError("Unsupported executable course tool")

            message_text = _course_tool_message(tool, result)
            assistant = TeachingAgentMessages(
                thread_id=thread.id,
                user_id=user.id,
                role="assistant",
                content=message_text,
                metadata_json={
                    "courseTool": tool,
                    "actionId": action.id,
                    "riskLevel": risk,
                    **(
                        {
                            "generationContract": {
                                "kind": "independent-ctf-batch",
                                "requestedCount": result.get("challengeCount"),
                                "createdJobCount": len(queued_jobs),
                                "batchId": result.get("batchId"),
                            }
                        }
                        if tool == "challenge.generate"
                        else {
                            "generationContract": {
                                "kind": "question-set",
                                "requestedCount": result.get(
                                    "requestedQuestionCount"
                                ),
                                "createdQuestionCount": result.get("questionCount"),
                            }
                        }
                        if tool == "assignment.generate"
                        else {}
                    ),
                },
            )
            db.session.add(assistant)
            db.session.flush()
            if queued_jobs:
                for current_queued_job, current_authoring_job in zip(
                    queued_jobs, authoring_jobs
                ):
                    add_card(
                        assistant,
                        card_type="job",
                        object_type="job",
                        object_id=current_queued_job.id,
                        state={
                            **job_view(current_queued_job),
                            "tool": tool,
                            "title": current_authoring_job.title,
                            "artifactType": "ctf-challenge",
                            "batchId": result.get("batchId"),
                            "batchCount": len(queued_jobs),
                            "batchIndex": (
                                current_queued_job.payload or {}
                            ).get("batchIndex"),
                            "batchTopic": (
                                current_queued_job.payload or {}
                            ).get("batchTopic"),
                        },
                        actions=["open", "cancel"],
                    )
            else:
                add_card(
                    assistant,
                    card_type="course_operation",
                    object_type=action.target_type,
                    object_id=action.id,
                    state={
                        "tool": tool,
                        "status": "COMPLETED",
                        "title": card_title,
                        "summary": message_text,
                        "href": href,
                        "destinationLabel": _course_tool_destination_label(tool),
                        "riskLevel": risk,
                    },
                    actions=["open"] if href else [],
                )
            if queued_jobs:
                action.status = "PENDING"
                action.completed = None
            elif risk == "R3":
                db.session.add(
                    TeachingAgentApprovals(
                        action_id=action.id,
                        approver_id=user.id,
                        decision="APPROVED",
                        comment="教师在全局智能体对话中明确确认",
                    )
                )
                action.status = "APPROVED"
            else:
                action.status = "COMPLETED"
            action.result = scrub_payload(result)
            action.error = None
            if not queued_jobs:
                action.completed = datetime.datetime.utcnow()
            if selected_generation is not None:
                source_message = selected_generation["sourceMessage"]
                source_metadata = dict(source_message.metadata_json or {})
                source_selection = dict(
                    source_metadata.get("generationSelection") or {}
                )
                source_selection.update(
                    {
                        "status": "STARTED",
                        "formalJobId": queued_job.id,
                        "authoringJobId": str(authoring_job.id),
                        "formalJobIds": [item.id for item in queued_jobs],
                        "authoringJobIds": [item.id for item in authoring_jobs],
                        "startedAt": _timestamp(datetime.datetime.utcnow()),
                    }
                )
                source_metadata["generationSelection"] = source_selection
                source_message.metadata_json = source_metadata
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()

            if queued_jobs:
                # The whole batch is now durable (domain state, action,
                # messages, cards, jobs and outbox rows).  Publish only after
                # that atomic commit so a worker can never observe a partial
                # five-challenge batch.
                from ...agent_runtime.jobs import publish_pending_outbox

                for current_queued_job in queued_jobs:
                    publish_pending_outbox(job_id=current_queued_job.id)

            if published_challenge is not None:
                try:
                    from ...learning.solution_agent import (
                        enqueue_solution_run,
                        solution_run_view,
                    )
                    from ...utils.image_pulls import publish_image_pull

                    if not (published_challenge.image or "").startswith(
                        (
                            "mac:",
                            "pwncollege-",
                            "pwncollege/",
                            "challenges.pwn.college/",
                        )
                    ):
                        publish_image_pull(
                            published_challenge.image,
                            dojo_reference_id=published_challenge.dojo.reference_id,
                        )
                    if exercise_mode(published_challenge) != "SIMULATION":
                        solution_run = enqueue_solution_run(published_challenge, user)
                        result["solutionRunId"] = solution_run.id
                        result["solutionRun"] = solution_run_view(solution_run)
                        action.result = scrub_payload(result)
                        db.session.commit()
                except Exception:
                    db.session.rollback()
                    logger.exception(
                        "Native challenge was published but post-publication validation could not be queued"
                    )

            if cleanup_packages or cleanup_workspaces or cleanup_course_path:
                from ...learning.authoring import remove_generated_package_assets

                for package_root in cleanup_packages:
                    try:
                        remove_generated_package_assets(package_root)
                    except (OSError, ValueError):
                        logger.warning(
                            "Course tool completed but generated assets were not removed",
                            exc_info=True,
                        )
                if cleanup_workspaces:
                    from .learning import _stop_deleted_challenge_workspaces

                    for cleanup in cleanup_workspaces:
                        if isinstance(cleanup, tuple):
                            _stop_deleted_challenge_workspaces(*cleanup)
                        else:
                            try:
                                cleanup.remove(force=True)
                            except Exception:
                                logger.warning(
                                    "Course tool completed but a workspace was not stopped",
                                    exc_info=True,
                                )
                if cleanup_course_path:
                    shutil.rmtree(cleanup_course_path, ignore_errors=True)
            clear_challenges()
            clear_standings()
            return _ok(
                {
                    "action": _action_view(action),
                    "result": result,
                    "thread": _thread_view(thread, include_messages=True),
                    "message": message_text,
                }
            )
        except (ScopeError, PermissionError) as exc:
            db.session.rollback()
            _record_failed_course_tool(
                user=user,
                thread=thread,
                tool=tool,
                risk=risk,
                arguments=arguments,
                idempotency_key=idempotency_key,
                error=exc,
            )
            return _error(exc, 403, code="FORBIDDEN")
        except (ValueError, IntegrityError) as exc:
            db.session.rollback()
            _record_failed_course_tool(
                user=user,
                thread=thread,
                tool=tool,
                risk=risk,
                arguments=arguments,
                idempotency_key=idempotency_key,
                error=exc,
            )
            return _error(exc, 409, code="INVALID_REQUEST")
        except Exception as exc:
            db.session.rollback()
            _record_failed_course_tool(
                user=user,
                thread=thread,
                tool=tool,
                risk=risk,
                arguments=arguments,
                idempotency_key=idempotency_key,
                error=exc,
            )
            logger.exception("Global Agent course tool failed: %s", tool)
            return _error(
                "Course operation failed without changing the requested course",
                500,
                code="COURSE_TOOL_FAILED",
            )


@teaching_namespace.route("/candidate-sets/<string:candidate_set_id>")
class CandidateSet(Resource):
    @authed_only
    def get(self, candidate_set_id):
        try:
            item = _candidate_set_for_user(candidate_set_id, _current_user())
            return _ok({"candidateSet": candidate_set_view(item, include_content=True)})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/candidate-sets/<string:candidate_set_id>/derive")
class CandidateSetDerive(Resource):
    @authed_only
    def post(self, candidate_set_id):
        user = _current_user()
        try:
            source = _candidate_set_for_user(candidate_set_id, user)
            body = _body()
            instruction = str(body.get("instruction") or "").strip()
            if not instruction:
                return _error("Natural-language instruction is required")
            candidate_ids = body.get("candidateIds") or []
            rows = TeachingArtifactCandidates.query.filter(
                TeachingArtifactCandidates.candidate_set_id == source.id,
                TeachingArtifactCandidates.id.in_(candidate_ids),
            ).all()
            if not rows:
                return _error("Select at least one source candidate")
            derived = create_candidate_set(
                owner_id=user.id,
                dojo_id=source.dojo_id,
                module_index=source.module_index,
                thread_id=source.thread_id,
                kind=source.kind,
                request_json={"instruction": instruction, "parentSetId": source.id},
                source_refs=[
                    {
                        "type": "candidate",
                        "id": row.id,
                        "contentHash": content_hash(row.content),
                    }
                    for row in rows
                ],
                self_workspace_id=source.self_workspace_id,
            )
            db.session.commit()
            job, _ = enqueue_job(
                owner_id=user.id,
                kind=(
                    "self.candidate.generate"
                    if source.self_workspace_id
                    else "candidate.generate"
                ),
                idempotency_key=_unique_idempotency(user.id, "candidate-derive"),
                payload={
                    "candidateSetId": derived.id,
                    "prompt": instruction,
                    "artifactType": source.kind,
                    "candidateCount": max(
                        2, min(4, int(body.get("candidateCount") or 3))
                    ),
                    "sourceCandidates": [
                        {"id": row.id, "title": row.title, "content": row.content}
                        for row in rows
                    ],
                    "allowDegraded": bool(body.get("allowDegraded")),
                },
                dojo_id=source.dojo_id,
                module_index=source.module_index,
                thread_id=source.thread_id,
            )
            return _ok(
                {"candidateSet": candidate_set_view(derived), "job": job_view(job)},
                202,
            )
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 403 if isinstance(exc, ScopeError) else 400)


@teaching_namespace.route("/candidates/<string:candidate_id>/select")
class CandidateSelect(Resource):
    @authed_only
    def post(self, candidate_id):
        try:
            candidate, candidate_set = select_candidate(candidate_id, _current_user())
            return _ok(
                {
                    "candidateId": candidate.id,
                    "candidateSet": candidate_set_view(candidate_set),
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/candidates/<string:candidate_id>/materialize")
class CandidateMaterialize(Resource):
    @authed_only
    def post(self, candidate_id):
        user = _current_user()
        body = _body()
        try:
            candidate = TeachingArtifactCandidates.query.filter_by(
                id=candidate_id
            ).first()
            if candidate is None:
                raise ScopeError("Candidate not found")
            candidate_set = _candidate_set_for_user(candidate.candidate_set_id, user)
            if candidate_set.self_workspace_id:
                workspace = _workspace_for_student(
                    candidate_set.self_workspace_id,
                    user,
                    lock=True,
                )
                _require_workspace_capacity(workspace, "artifacts")
                _require_workspace_capacity(workspace, "storageBytes")
            artifact, revision = materialize_candidate(
                candidate_id,
                user,
                title=body.get("title"),
            )
            parent_generation_job = _candidate_generation_job(candidate_set, user)
            job, created = enqueue_job(
                owner_id=user.id,
                kind="artifact.materialize",
                idempotency_key=f"candidate-materialize:{user.id}:{candidate.id}",
                payload={
                    "artifactId": artifact.id,
                    "candidateSetId": candidate_set.id,
                    "parentGenerationJobId": (
                        parent_generation_job.id if parent_generation_job else None
                    ),
                    "expectedRevision": revision.revision,
                    "artifactType": artifact.artifact_type,
                    "title": artifact.title,
                    "plan": revision.content,
                    "requestPrompt": candidate_request_prompt(candidate_set),
                    "sourceRefs": list(candidate_set.source_refs or []),
                    "allowDegraded": bool(body.get("allowDegraded")),
                },
                dojo_id=artifact.dojo_id,
                module_index=artifact.module_index,
                thread_id=(
                    candidate.candidate_set.thread_id
                    if candidate.candidate_set
                    else None
                ),
                priority=25,
            )
            if job.status in {"QUEUED", "RUNNING", "CANCEL_REQUESTED"}:
                artifact.status = "GENERATING"
            if parent_generation_job:
                parent_generation_job.result = {
                    **(
                        parent_generation_job.result
                        if isinstance(parent_generation_job.result, dict)
                        else {}
                    ),
                    "candidateSetId": candidate_set.id,
                    "generationMode": "single",
                    "artifactId": artifact.id,
                    "materializationJobId": job.id,
                }
                _sync_parent_generation_state(job)
            db.session.commit()
            return _ok(
                {
                    "artifact": artifact_view(artifact),
                    "revisionId": revision.id,
                    "job": job_view(job),
                    "created": created,
                },
                202,
            )
        except (ScopeError, OverflowError) as exc:
            return _error(
                exc,
                429 if isinstance(exc, OverflowError) else 404,
                code="QUOTA_EXCEEDED"
                if isinstance(exc, OverflowError)
                else "NOT_FOUND",
            )


@teaching_namespace.route("/artifacts")
class Artifacts(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        query = TeachingArtifacts.query.filter(
            TeachingArtifacts.owner_id == user.id,
            TeachingArtifacts.status != "ARCHIVED",
        )
        dojo_id = request.args.get("dojoId", type=int)
        if dojo_id is not None:
            dojo_for_user(user, dojo_id, teacher=True)
            query = query.filter(TeachingArtifacts.dojo_id == dojo_id)
        rows = query.order_by(TeachingArtifacts.updated.desc()).limit(200).all()
        return _ok(
            {"artifacts": [artifact_view(row, include_content=False) for row in rows]}
        )


@teaching_namespace.route("/artifacts/bulk-delete")
class ArtifactBulkDelete(Resource):
    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            try:
                dojo_id = int(body.get("dojoId"))
            except (TypeError, ValueError) as exc:
                raise ArtifactBulkDeleteError("课程标识无效，请刷新页面后重试。") from exc
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            requested_ids = body.get("artifactIds")
            if not isinstance(requested_ids, list) or not 1 <= len(requested_ids) <= 100:
                raise ArtifactBulkDeleteError("请选择 1 至 100 份未发布课件。")
            artifact_ids = []
            seen_ids = set()
            for value in requested_ids:
                artifact_id = str(value or "").strip()
                if not artifact_id or len(artifact_id) > 48:
                    raise ArtifactBulkDeleteError("课件标识无效，请刷新页面后重试。")
                if artifact_id not in seen_ids:
                    seen_ids.add(artifact_id)
                    artifact_ids.append(artifact_id)

            artifacts = (
                TeachingArtifacts.query.filter(
                    TeachingArtifacts.id.in_(artifact_ids),
                    TeachingArtifacts.owner_id == user.id,
                    TeachingArtifacts.dojo_id == dojo.dojo_id,
                    TeachingArtifacts.self_workspace_id.is_(None),
                    TeachingArtifacts.status != "ARCHIVED",
                )
                .with_for_update()
                .all()
            )
            if len(artifacts) != len(artifact_ids):
                raise ArtifactBulkDeleteError(
                    "课件列表已变化或包含不可管理的内容，请刷新后重新选择。",
                    409,
                )
            non_courseware_types = QUESTION_ARTIFACT_TYPES | COURSE_DEMO_ARTIFACT_TYPES | {
                "debate"
            }
            if any(row.artifact_type in non_courseware_types for row in artifacts):
                raise ArtifactBulkDeleteError("批量删除仅适用于课程课件与教案。", 409)
            if any(row.status == "PUBLISHED" for row in artifacts):
                raise ArtifactBulkDeleteError("已发布课件不能混入未发布课件批量删除。", 409)
            if any(row.published_challenge_id is not None for row in artifacts):
                raise ArtifactBulkDeleteError("选中的内容已发布为题目，请到题目管理中处理。", 409)

            active_artifact_ids = {
                str((job.payload or {}).get("artifactId") or "")
                for job in TeachingJobs.query.filter(
                    TeachingJobs.owner_id == user.id,
                    TeachingJobs.dojo_id == dojo.dojo_id,
                    TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
                )
                .order_by(TeachingJobs.created.desc())
                .limit(300)
                .all()
            }
            if any(
                row.status in {"GENERATING", "VALIDATING", "PUBLISHING"}
                or row.id in active_artifact_ids
                for row in artifacts
            ):
                raise ArtifactBulkDeleteError(
                    "有课件仍在生成或检查，请等待任务结束后再删除。",
                    409,
                )

            now = datetime.datetime.utcnow()
            for artifact in artifacts:
                artifact.status = "ARCHIVED"
                artifact.updated = now
            _management_audit(
                user,
                "artifact.manage.bulk_delete",
                "dojo",
                dojo.reference_id,
                {
                    "dojoId": dojo.dojo_id,
                    "deletedCount": len(artifacts),
                    "artifactIds": artifact_ids,
                },
            )
            db.session.commit()
            return _ok(
                {
                    "deletedCount": len(artifacts),
                    "artifactIds": artifact_ids,
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ArtifactBulkDeleteError as exc:
            db.session.rollback()
            return _error(exc, exc.status_code, code="INVALID_REQUEST")
        except (TypeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_REQUEST")
        except Exception:
            db.session.rollback()
            logger.exception("Failed to bulk delete courseware artifacts")
            return _error(
                "批量删除课件失败，列表未发生变化。",
                500,
                code="INTERNAL_ERROR",
            )


@teaching_namespace.route("/artifacts/order")
class ArtifactOrder(Resource):
    @authed_only
    def patch(self):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            dojo_id = int(body.get("dojoId"))
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            requested_modules = body.get("modules")
            if not isinstance(requested_modules, list):
                raise DemoOrderError("演示排序数据格式不正确。")

            module_indexes = {
                row.module_index
                for row in DojoModules.query.filter_by(dojo_id=dojo.dojo_id).all()
            }
            artifacts = (
                TeachingArtifacts.query.filter(
                    TeachingArtifacts.owner_id == user.id,
                    TeachingArtifacts.dojo_id == dojo.dojo_id,
                    TeachingArtifacts.artifact_type.in_(COURSE_DEMO_ARTIFACT_TYPES),
                    TeachingArtifacts.status != "ARCHIVED",
                )
                .with_for_update()
                .all()
            )
            artifact_by_id = {row.id: row for row in artifacts}
            seen_artifacts = set()
            seen_modules = set()
            requested_positions = []

            for requested_module in requested_modules:
                if not isinstance(requested_module, dict):
                    raise DemoOrderError("演示排序数据格式不正确。")
                raw_module_index = requested_module.get("moduleIndex")
                module_index = (
                    None
                    if raw_module_index is None or raw_module_index == ""
                    else int(raw_module_index)
                )
                if module_index is not None and module_index not in module_indexes:
                    raise DemoOrderError("目标章节不存在，请刷新页面后重试。", 409)
                module_key = "unassigned" if module_index is None else module_index
                if module_key in seen_modules:
                    raise DemoOrderError("同一章节不能重复出现在排序数据中。")
                seen_modules.add(module_key)
                items = requested_module.get("items")
                if not isinstance(items, list):
                    raise DemoOrderError("演示排序数据格式不正确。")
                for sort_order, item in enumerate(items):
                    artifact_id = str(
                        item.get("id") if isinstance(item, dict) else item or ""
                    )
                    if artifact_id not in artifact_by_id:
                        raise DemoOrderError("演示列表已变化，请刷新页面后重试。", 409)
                    if artifact_id in seen_artifacts:
                        raise DemoOrderError("同一个演示不能重复排序。")
                    seen_artifacts.add(artifact_id)
                    requested_positions.append(
                        {
                            "artifact": artifact_by_id[artifact_id],
                            "moduleIndex": module_index,
                            "sortOrder": sort_order,
                        }
                    )

            if seen_artifacts != set(artifact_by_id):
                raise DemoOrderError("演示列表已变化，请刷新页面后重试。", 409)
            active_artifact_ids = {
                str((job.payload or {}).get("artifactId") or "")
                for job in TeachingJobs.query.filter(
                    TeachingJobs.owner_id == user.id,
                    TeachingJobs.dojo_id == dojo.dojo_id,
                    TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
                )
                .order_by(TeachingJobs.created.desc())
                .limit(300)
                .all()
            }
            if any(
                row.status in {"GENERATING", "VALIDATING", "PUBLISHING"}
                or row.id in active_artifact_ids
                for row in artifacts
            ):
                raise DemoOrderError("有演示仍在生成或验证，请完成后再调整顺序。", 409)

            changed = []
            for position in requested_positions:
                artifact = position["artifact"]
                module_index = position["moduleIndex"]
                sort_order = position["sortOrder"]
                if (
                    artifact.module_index != module_index
                    or artifact.sort_order != sort_order
                ):
                    changed.append(artifact.id)
                artifact.module_index = module_index
                artifact.sort_order = sort_order

            _management_audit(
                user,
                "artifact.manage.reorder",
                "dojo",
                dojo.reference_id,
                {
                    "dojoId": dojo.dojo_id,
                    "changedCount": len(changed),
                    "artifactIds": changed[:200],
                },
            )
            db.session.commit()
            return _ok(
                {
                    "changedCount": len(changed),
                    "positions": [
                        {
                            "artifactId": position["artifact"].id,
                            "moduleIndex": position["moduleIndex"],
                            "sortOrder": position["sortOrder"],
                        }
                        for position in requested_positions
                    ],
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError) as exc:
            db.session.rollback()
            status_code = exc.status_code if isinstance(exc, DemoOrderError) else 400
            return _error(exc, status_code, code="INVALID_REQUEST")
        except Exception:
            db.session.rollback()
            logger.exception("Failed to reorder course demos")
            return _error(
                "保存演示顺序失败，现有章节和顺序未发生变化。",
                500,
                code="INTERNAL_ERROR",
            )


@teaching_namespace.route("/artifacts/<string:artifact_id>")
class Artifact(Resource):
    @authed_only
    def get(self, artifact_id):
        try:
            user = _current_user()
            artifact = artifact_for_viewer(artifact_id, user)
            student_safe = _artifact_student_safe_for_user(artifact, user)
            capabilities = artifact_capabilities(artifact, user)
            revisions = (
                TeachingArtifactRevisions.query.filter_by(artifact_id=artifact.id)
                .order_by(TeachingArtifactRevisions.revision.desc())
                .all()
            )
            data = artifact_view(artifact, student_safe=student_safe)
            data["capabilities"] = capabilities
            data["canEdit"] = capabilities["edit"]
            data["canRequestPublish"] = capabilities["publishToCourse"]
            course = (
                Dojos.query.filter_by(dojo_id=artifact.dojo_id).first()
                if artifact.dojo_id is not None
                else None
            )
            module = (
                DojoModules.query.filter_by(
                    dojo_id=artifact.dojo_id,
                    module_index=artifact.module_index,
                ).first()
                if artifact.dojo_id is not None and artifact.module_index is not None
                else None
            )
            data["courseContext"] = (
                {
                    "id": course.dojo_id,
                    "referenceId": course.reference_id,
                    "name": course.name or course.id,
                    "module": (
                        {
                            "index": module.module_index,
                            "id": module.id,
                            "name": module.name or module.id,
                        }
                        if module is not None
                        else None
                    ),
                }
                if course is not None
                else None
            )
            personal = artifact.self_workspace_id is not None
            data["visibility"] = {
                "state": (
                    "personal"
                    if personal
                    else "students"
                    if artifact.status == "PUBLISHED"
                    else "teacher_only"
                ),
                "label": (
                    "仅自己可见"
                    if personal
                    else "学生可见"
                    if artifact.status == "PUBLISHED"
                    else "仅教师可见"
                ),
                "publishedAt": _timestamp(artifact.published),
            }
            if not student_safe:
                active_jobs = (
                    TeachingJobs.query.filter(
                        TeachingJobs.owner_id == user.id,
                        TeachingJobs.kind.in_(["artifact.materialize", "artifact.revise"]),
                        TeachingJobs.status.in_(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]),
                    )
                    .order_by(TeachingJobs.created.desc())
                    .limit(50)
                    .all()
                )
                active_job = next(
                    (
                        row
                        for row in active_jobs
                        if (row.payload or {}).get("artifactId") == artifact.id
                    ),
                    None,
                )
                data["activeJob"] = job_view(active_job) if active_job else None
            current_revision = revisions[0] if revisions else None
            source_details = []
            generation_job = None
            if not student_safe and current_revision is not None:
                source_refs = [
                    item
                    for item in (current_revision.source_refs or [])
                    if isinstance(item, dict)
                ]
                material_ids = {
                    str(item.get("id") or "")
                    for item in source_refs
                    if item.get("type") == "material" and item.get("id")
                }
                material_by_id = {
                    row.id: row
                    for row in TeachingMaterials.query.filter(
                        TeachingMaterials.id.in_(material_ids),
                        TeachingMaterials.dojo_id == artifact.dojo_id,
                    ).all()
                } if material_ids else {}
                artifact_ids = {
                    str(item.get("id") or "")
                    for item in source_refs
                    if item.get("type") == "artifact" and item.get("id")
                }
                artifact_by_id = {
                    row.id: row
                    for row in TeachingArtifacts.query.filter(
                        TeachingArtifacts.id.in_(artifact_ids),
                        TeachingArtifacts.dojo_id == artifact.dojo_id,
                    ).all()
                } if artifact_ids else {}
                for source in source_refs:
                    source_id = str(source.get("id") or "")
                    if source.get("type") == "material":
                        row = material_by_id.get(source_id)
                        source_details.append(
                            {
                                "type": "material",
                                "id": source_id,
                                "title": row.title if row is not None else source.get("title"),
                                "filename": (
                                    _material_original_filename(row)
                                    if row is not None
                                    else source.get("filename")
                                ),
                                "status": row.status if row is not None else "UNAVAILABLE",
                                "href": (
                                    f"/teacher/courses?dojo={course.reference_id}&tab=courseware&material={source_id}"
                                    if course is not None and row is not None
                                    else None
                                ),
                            }
                        )
                    elif source.get("type") == "artifact":
                        row = artifact_by_id.get(source_id)
                        source_details.append(
                            {
                                "type": "artifact",
                                "id": source_id,
                                "title": row.title if row is not None else source.get("title"),
                                "status": row.status if row is not None else "UNAVAILABLE",
                                "href": (
                                    f"/teacher/artifacts/{source_id}"
                                    if row is not None
                                    else None
                                ),
                            }
                        )
                    else:
                        source_details.append(scrub_payload(source))

                recent_generation_jobs = (
                    TeachingJobs.query.filter_by(owner_id=artifact.owner_id)
                    .filter(
                        TeachingJobs.kind.in_(
                            ["artifact.materialize", "artifact.revise"]
                        )
                    )
                    .order_by(TeachingJobs.created.desc())
                    .limit(200)
                    .all()
                )
                source_job = next(
                    (
                        row
                        for row in recent_generation_jobs
                        if str((row.result or {}).get("artifactId") or "")
                        == artifact.id
                        or str((row.payload or {}).get("artifactId") or "")
                        == artifact.id
                    ),
                    None,
                )
                if source_job is not None:
                    generation_job = {
                        "id": source_job.id,
                        "status": source_job.status,
                        "stage": source_job.stage,
                        "threadId": source_job.thread_id,
                        "created": _timestamp(source_job.created),
                        "completed": _timestamp(source_job.completed),
                    }
            if student_safe:
                data["history"] = [
                    {
                        "revision": row.revision,
                        "author": "课程团队",
                        "created": _timestamp(row.created),
                    }
                    for row in revisions[:1]
                ]
            else:
                data["lineage"] = {
                    "sources": source_details,
                    "candidateId": artifact.candidate_id,
                    "generationJob": generation_job,
                    "currentRevisionId": (
                        current_revision.id if current_revision is not None else None
                    ),
                }
                data["history"] = [
                    {
                        "id": row.id,
                        "revision": row.revision,
                        "parentRevision": row.parent_revision,
                        "instruction": row.instruction,
                        "contentHash": row.content_hash,
                        "validation": row.validation,
                        "author": (
                            row.creator.name if row.creator is not None else "系统"
                        ),
                        "created": _timestamp(row.created),
                    }
                    for row in revisions
                ]
            return _ok({"artifact": data})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def patch(self, artifact_id):
        user = _current_user()
        try:
            artifact = artifact_for_user(artifact_id, user)
            capabilities = artifact_capabilities(artifact, user)
            if not capabilities["edit"]:
                raise ScopeError("Artifact not found")
            if artifact.self_workspace_id is None:
                _require_teacher(user)
                if artifact.dojo_id is None:
                    raise ScopeError("Artifact not found")
                dojo_for_user(user, artifact.dojo_id, teacher=True)
            title = str(_body().get("title") or "").strip()
            if not 1 <= len(title) <= 240:
                raise ValueError("内容名称需包含 1-240 个字符。")
            artifact.title = title
            artifact.updated = datetime.datetime.utcnow()
            _management_audit(
                user,
                "artifact.manage.rename",
                "teaching_artifact",
                artifact.id,
                {"dojoId": artifact.dojo_id, "type": artifact.artifact_type},
            )
            db.session.commit()
            return _ok({"artifact": artifact_view(artifact, include_content=False)})
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_REQUEST")

    @authed_only
    def delete(self, artifact_id):
        user = _current_user()
        try:
            artifact = artifact_for_user(artifact_id, user)
            capabilities = artifact_capabilities(artifact, user)
            if not capabilities["edit"]:
                raise ScopeError("Artifact not found")
            if artifact.self_workspace_id is None:
                _require_teacher(user)
                if artifact.dojo_id is None:
                    raise ScopeError("Artifact not found")
                dojo_for_user(user, artifact.dojo_id, teacher=True)
            if artifact.published_challenge_id is not None:
                raise ValueError("该内容已发布为 CTF 题目，请从实训题目列表删除。")
            if artifact.status in {
                "GENERATING",
                "VALIDATING",
                "PUBLISHING",
            } or _active_resource_job(
                user,
                resource_key="artifactId",
                resource_id=artifact.id,
            ):
                raise ValueError("内容仍在生成或验证，请等待任务结束后再删除。")
            artifact.status = "ARCHIVED"
            artifact.updated = datetime.datetime.utcnow()
            if artifact.self_workspace_id is not None and str(_body().get("scope") or "") == "workspace":
                TeachingArtifacts.query.filter_by(
                    owner_id=user.id,
                    self_workspace_id=artifact.self_workspace_id,
                ).update(
                    {"status": "ARCHIVED", "updated": datetime.datetime.utcnow()},
                    synchronize_session=False,
                )
                SelfLearningWorkspaces.query.filter_by(
                    id=artifact.self_workspace_id,
                    student_id=user.id,
                ).update(
                    {"status": "ARCHIVED", "updated": datetime.datetime.utcnow()},
                    synchronize_session=False,
                )
            _management_audit(
                user,
                "artifact.manage.delete",
                "teaching_artifact",
                artifact.id,
                {
                    "dojoId": artifact.dojo_id,
                    "type": artifact.artifact_type,
                    "title": artifact.title,
                },
            )
            db.session.commit()
            return _ok({"deleted": True, "artifactId": artifact.id})
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")


@teaching_namespace.route("/artifacts/<string:artifact_id>/request-review")
class ArtifactReviewRequest(Resource):
    @authed_only
    def post(self, artifact_id):
        user = _current_user()
        try:
            artifact = artifact_for_user(artifact_id, user)
            if not artifact_capabilities(artifact, user)["requestReview"]:
                raise ScopeError("Artifact not found")
            workspace = SelfLearningWorkspaces.query.filter_by(
                id=artifact.self_workspace_id,
                student_id=user.id,
            ).first()
            if workspace is None or workspace.dojo_id != artifact.dojo_id:
                raise ScopeError("Artifact not found")
            key = f"self-review:{workspace.id}:{artifact.id}:{artifact.current_revision}"
            action = TeachingAgentActions.query.filter_by(idempotency_key=key).first()
            if action is None:
                action = TeachingAgentActions(
                    thread_id=workspace.thread_id,
                    actor_id=user.id,
                    action_type="review-self-artifact",
                    risk_level="R3",
                    target_type="self_workspace",
                    target_id=workspace.id,
                    status="AWAITING_APPROVAL",
                    idempotency_key=key,
                    request_json={
                        "artifactId": artifact.id,
                        "dojoId": workspace.dojo_id,
                        "expectedRevision": artifact.current_revision,
                    },
                )
                db.session.add(action)
            artifact.status = "COURSE_CANDIDATE"
            workspace.submitted_artifact_id = artifact.id
            workspace.status = "SUBMITTED"
            workspace.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok(
                {
                    "artifact": artifact_view(artifact, include_content=False),
                    "workspace": _workspace_view(workspace),
                    "visibility": "已提交教师",
                },
                202,
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/artifacts/<string:artifact_id>/duplicate")
class ArtifactDuplicate(Resource):
    @authed_only
    def post(self, artifact_id):
        user = _current_user()
        try:
            _require_teacher(user)
            source = artifact_for_user(artifact_id, user)
            if source.dojo_id is None:
                raise ScopeError("Artifact not found")
            dojo_for_user(user, source.dojo_id, teacher=True)
            revision = (
                TeachingArtifactRevisions.query.filter_by(
                    artifact_id=source.id,
                    revision=source.current_revision,
                )
                .first()
            )
            if revision is None:
                raise ValueError("当前内容没有可复制的有效版本。")
            max_order = (
                db.session.query(func.max(TeachingArtifacts.sort_order))
                .filter_by(dojo_id=source.dojo_id, module_index=source.module_index)
                .scalar()
            )
            copied = TeachingArtifacts(
                owner_id=user.id,
                dojo_id=source.dojo_id,
                module_index=source.module_index,
                sort_order=(
                    int(max_order) + 1
                    if max_order is not None and int(max_order) < 2147483000
                    else 2147483647
                    if max_order is not None
                    else 0
                ),
                artifact_type=source.artifact_type,
                title=f"{source.title}（副本）"[:240],
                status="DRAFT",
                current_revision=1,
            )
            db.session.add(copied)
            db.session.flush()
            copied_revision = TeachingArtifactRevisions(
                artifact_id=copied.id,
                revision=1,
                parent_revision=None,
                instruction=f"复制自内容 {source.id} 的版本 {source.current_revision}",
                content=dict(revision.content or {}),
                storage_key=None,
                content_hash=content_hash(revision.content or {}),
                source_refs=[
                    *(revision.source_refs or []),
                    {
                        "type": "artifact",
                        "id": source.id,
                        "revisionId": revision.id,
                    },
                ],
                validation={"status": "PENDING", "reason": "复制后需要重新检查"},
                created_by=user.id,
            )
            db.session.add(copied_revision)
            _management_audit(
                user,
                "artifact.manage.duplicate",
                "teaching_artifact",
                copied.id,
                {
                    "dojoId": source.dojo_id,
                    "sourceArtifactId": source.id,
                    "sourceRevisionId": revision.id,
                },
            )
            db.session.commit()
            return _ok({"artifact": _artifact_list_views([copied], user=user)[0]}, 201)
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")


@teaching_namespace.route("/artifacts/<string:artifact_id>/student-preview")
class ArtifactStudentPreview(Resource):
    @authed_only
    def get(self, artifact_id):
        try:
            user = _current_user()
            _require_teacher(user)
            artifact = artifact_for_user(artifact_id, user)
            if artifact.dojo_id is None:
                raise ScopeError("Artifact not found")
            dojo_for_user(user, artifact.dojo_id, teacher=True)
            data = artifact_view(artifact, student_safe=True)
            data.update(
                {
                    "capabilities": {
                        "view": True,
                        "edit": False,
                        "requestReview": False,
                        "publishToCourse": False,
                    },
                    "canEdit": False,
                    "canRequestPublish": False,
                    "history": [
                        {
                            "revision": artifact.current_revision,
                            "author": "课程团队",
                            "created": _timestamp(artifact.updated),
                        }
                    ],
                }
            )
            return _ok({"artifact": data})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route(
    "/artifacts/<string:artifact_id>/revisions/<int:revision_number>"
)
class ArtifactRevisionDetail(Resource):
    @authed_only
    def get(self, artifact_id, revision_number):
        try:
            user = _current_user()
            artifact = artifact_for_viewer(artifact_id, user)
            revision = TeachingArtifactRevisions.query.filter_by(
                artifact_id=artifact.id,
                revision=revision_number,
            ).first()
            if revision is None:
                raise ScopeError("Artifact revision not found")
            return _ok(
                {
                    "revision": revision_view(
                        revision,
                        student_safe=_artifact_student_safe_for_user(artifact, user),
                    )
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/artifacts/<string:artifact_id>/restore")
class ArtifactRevisionRestore(Resource):
    @authed_only
    def post(self, artifact_id):
        user = _current_user()
        try:
            artifact = artifact_for_user(artifact_id, user)
            if artifact.owner_id != user.id:
                raise ScopeError("Only the artifact owner may restore a revision")
            body = _body()
            expected = int(body.get("expectedRevision") or 0)
            source_number = int(body.get("sourceRevision") or 0)
            if expected != artifact.current_revision:
                return _error(
                    f"Artifact is now at revision {artifact.current_revision}",
                    409,
                    code="REVISION_CONFLICT",
                )
            source = TeachingArtifactRevisions.query.filter_by(
                artifact_id=artifact.id,
                revision=source_number,
            ).first()
            if source is None:
                raise ScopeError("Artifact revision not found")
            revision = create_revision(
                artifact,
                user,
                expected_revision=expected,
                instruction=f"恢复 revision {source_number}",
                content=source.content,
            )
            revision.source_refs = list(source.source_refs or [])
            revision.validation = {
                "status": "PENDING",
                "restoredFromRevision": source_number,
            }
            db.session.commit()
            return _ok(
                {
                    "artifact": artifact_view(artifact),
                    "revision": revision_view(revision),
                }
            )
        except RevisionConflict as exc:
            db.session.rollback()
            return _error(exc, 409, code="REVISION_CONFLICT")
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 400)


@teaching_namespace.route("/artifacts/<string:artifact_id>/revise")
class ArtifactRevise(Resource):
    @authed_only
    def post(self, artifact_id):
        user = _current_user()
        try:
            artifact = artifact_for_user(artifact_id, user)
            if artifact.owner_id != user.id:
                raise ScopeError("Only the artifact owner may revise it")
            body = _body()
            instruction = str(body.get("instruction") or "").strip()
            if not instruction:
                return _error("Natural-language revision instruction is required")
            expected = int(body.get("expectedRevision") or artifact.current_revision)
            if expected != artifact.current_revision:
                return _error(
                    f"Artifact is now at revision {artifact.current_revision}",
                    409,
                    code="REVISION_CONFLICT",
                )
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="artifact.revise",
                idempotency_key=_unique_idempotency(user.id, "artifact-revise"),
                payload={
                    "artifactId": artifact.id,
                    "expectedRevision": expected,
                    "instruction": instruction,
                    "currentContent": artifact_view(artifact)["revision"]["content"],
                    "artifactType": artifact.artifact_type,
                    "allowDegraded": bool(body.get("allowDegraded")),
                },
                dojo_id=artifact.dojo_id,
                module_index=artifact.module_index,
            )
            return _ok({"job": job_view(job)}, 202)
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/artifacts/<string:artifact_id>/request-publish")
class ArtifactPublishRequest(Resource):
    """Validate an artifact and stage an explicit R3 publication approval."""

    @authed_only
    def post(self, artifact_id):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            artifact = artifact_for_user(artifact_id, user)
            if artifact.owner_id != user.id:
                raise ScopeError("Only the artifact owner may request publication")
            if artifact.dojo_id is None:
                return _error(
                    "该产物尚未关联课程。请在全局教学智能体中说明目标课程后再发布。",
                    409,
                    code="COURSE_BINDING_REQUIRED",
                )
            dojo = dojo_for_user(user, artifact.dojo_id, teacher=True)
            if artifact.module_index is None:
                modules = list(dojo.modules)
                if len(modules) == 1:
                    artifact.module_index = modules[0].module_index
                elif not modules:
                    # Publication is already an explicit teacher action.  A
                    # native course created from a one-sentence Agent request
                    # may not have had a chapter in older revisions, so repair
                    # that unambiguous case instead of surfacing an internal
                    # binding requirement at the end of the flow.
                    module = DojoModules(
                        dojo=dojo,
                        module_index=0,
                        id="ai-content",
                        name="AI 教学内容",
                        description="为教学产物发布自动建立的默认章节。",
                        show_scoreboard=True,
                        show_challenges=True,
                    )
                    db.session.add(module)
                    db.session.flush()
                    artifact.module_index = module.module_index
                else:
                    return _error(
                        "当前课程有多个章节，无法唯一确定发布位置。请在全局教学智能体中说明目标章节。",
                        409,
                        code="MODULE_BINDING_AMBIGUOUS",
                    )
            module = DojoModules.query.filter_by(
                dojo_id=dojo.dojo_id,
                module_index=artifact.module_index,
            ).first()
            if module is None:
                return _error(
                    "产物原先关联的章节已不存在，请在全局教学智能体中重新指定目标章节。",
                    409,
                    code="MODULE_BINDING_MISSING",
                )

            expected_revision = int(
                body.get("expectedRevision") or artifact.current_revision
            )
            if expected_revision != artifact.current_revision:
                return _error(
                    f"Artifact is now at revision {artifact.current_revision}",
                    409,
                    code="REVISION_CONFLICT",
                )
            existing = TeachingAgentActions.query.filter(
                TeachingAgentActions.target_type == "artifact",
                TeachingAgentActions.target_id == artifact.id,
                TeachingAgentActions.action_type.in_(
                    ["publish-question-artifact", "publish-teaching-artifact"]
                ),
                TeachingAgentActions.status.in_(["VALIDATING", "AWAITING_APPROVAL"]),
            ).first()
            if existing:
                return _ok({"action": _action_view(existing)}, 202)

            thread = _thread_for_artifact_action(artifact, user)
            source_job_id = str(body.get("sourceJobId") or "").strip() or None
            if (
                source_job_id
                and not TeachingJobs.query.filter_by(
                    id=source_job_id,
                    owner_id=user.id,
                    thread_id=thread.id,
                ).first()
            ):
                source_job_id = None
            question_artifact = (
                artifact.artifact_type.lower() in QUESTION_ARTIFACT_TYPES
            )
            action = TeachingAgentActions(
                thread_id=thread.id,
                actor_id=user.id,
                action_type=(
                    "publish-question-artifact"
                    if question_artifact
                    else "publish-teaching-artifact"
                ),
                risk_level="R3",
                target_type="artifact",
                target_id=artifact.id,
                status="VALIDATING" if question_artifact else "AWAITING_APPROVAL",
                idempotency_key=_unique_idempotency(user.id, "artifact-publish"),
                request_json={
                    "dojoId": artifact.dojo_id,
                    "moduleIndex": artifact.module_index,
                    "expectedRevision": expected_revision,
                    "artifactType": artifact.artifact_type,
                    "title": artifact.title,
                    "sourceJobId": source_job_id,
                },
                result={},
            )
            db.session.add(action)
            db.session.flush()

            revision = TeachingArtifactRevisions.query.filter_by(
                artifact_id=artifact.id,
                revision=artifact.current_revision,
            ).first()
            if revision is None:
                raise ValueError("Artifact revision no longer exists")

            if not question_artifact:
                artifact.status = "READY_TO_PUBLISH"
                revision.validation = {
                    "status": "PASS",
                    "mode": "teacher-content-review",
                    "note": "Non-executable teaching artifact; publication still requires explicit approval.",
                }
                db.session.commit()
                return _ok({"action": _action_view(action)}, 202)

            content_text = json.dumps(
                revision.content,
                ensure_ascii=False,
                sort_keys=True,
            )[:22000]
            content = revision.content if isinstance(revision.content, dict) else {}
            raw_objectives = (
                content.get("objectives") or content.get("learningObjectives") or []
            )
            constraints = {
                "title": artifact.title,
                "category": str(content.get("category") or "SECURITY")[:64],
                "difficulty": content.get("difficulty") or 2,
                "objectives": raw_objectives
                if isinstance(raw_objectives, list)
                else [],
                "required": bool(content.get("required", True)),
            }
            brief = (
                "请把以下 全局智能体教学产物转换为玄甲可运行、可判分、"
                "带私有解法且通过独立发布门的网络安全题目。保持原始教学目标，"
                "不要把仅浏览课件当作完成证据。\n\n"
                f"产物标题：{artifact.title}\n"
                f"产物类型：{artifact.artifact_type}\n"
                f"产物 revision：{artifact.current_revision}\n"
                f"结构化内容：{content_text}"
            )
            from .learning import _queue_authoring_job

            legacy_job, queue_error = _queue_authoring_job(
                dojo=dojo,
                module=module,
                author=user,
                title=f"验证并发布：{artifact.title}",
                request_json={"brief": brief[:24000], "constraints": constraints},
                durable_payload={
                    "artifactId": artifact.id,
                    "actionId": action.id,
                    "expectedRevision": expected_revision,
                },
                action_id=action.id,
            )
            action.result = {"legacyJobId": legacy_job.id}
            artifact.status = "VALIDATING"
            db.session.commit()
            if queue_error:
                action.status = "FAILED"
                action.error = redact_text(queue_error, limit=4000)
                action.completed = datetime.datetime.utcnow()
                artifact.status = "VALIDATION_FAILED"
                db.session.commit()
                return _error("Unable to queue native validation", 503)
            return _ok(
                {
                    "action": _action_view(action),
                    "authoringJobId": legacy_job.id,
                },
                202,
            )
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 403 if isinstance(exc, ScopeError) else 400)


@teaching_namespace.route("/jobs")
class TeachingJobCollection(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            view = str(request.args.get("view") or "active").strip().lower()
            if view not in {"active", "attention", "history", "all"}:
                raise ValueError("未知任务视图。")
            query = TeachingJobs.query.filter_by(owner_id=user.id)
            dojo_value = str(request.args.get("dojoId") or "").strip()
            dojo = None
            if dojo_value:
                dojo = dojo_for_user(user, dojo_value, teacher=True)
                query = query.filter_by(dojo_id=dojo.dojo_id)
            thread_id = str(request.args.get("threadId") or "").strip()
            if thread_id:
                _thread_for_owner(thread_id, user)
                query = query.filter_by(thread_id=thread_id)
            if view == "active":
                query = query.filter(
                    TeachingJobs.status.in_(("QUEUED", "RUNNING", "CANCEL_REQUESTED"))
                )
            elif view == "attention":
                query = query.filter(TeachingJobs.status.in_(("FAILED", "CANCELED")))
            elif view == "history":
                query = query.filter(
                    TeachingJobs.status.in_(("SUCCEEDED", "FAILED", "CANCELED"))
                )
            limit = request.args.get("limit", default=50, type=int) or 50
            limit = max(1, min(200, limit))
            offset = request.args.get("offset", default=0, type=int) or 0
            offset = max(0, min(10000, offset))
            page_rows = (
                query.order_by(TeachingJobs.updated.desc())
                .offset(offset)
                .limit(limit + 1)
                .all()
            )
            has_next = len(page_rows) > limit
            rows = page_rows[:limit]

            batch_query = TeachingGenerationBatches.query.filter_by(owner_id=user.id)
            if dojo is not None:
                batch_query = batch_query.filter_by(dojo_id=dojo.dojo_id)
            if thread_id:
                batch_query = batch_query.filter_by(thread_id=thread_id)
            batch_statuses = {
                "active": ("QUEUED", "GENERATING", "VALIDATING"),
                "attention": ("NEEDS_REVIEW", "PARTIAL_SUCCESS", "FAILED"),
                "history": ("NEEDS_REVIEW", "PARTIAL_SUCCESS", "FAILED", "CANCELED"),
            }
            if view in batch_statuses:
                batch_query = batch_query.filter(
                    TeachingGenerationBatches.status.in_(batch_statuses[view])
                )
            batches = (
                batch_query.options(
                    selectinload(TeachingGenerationBatches.items)
                )
                .order_by(TeachingGenerationBatches.updated.desc())
                .limit(200)
                .all()
            )
            child_ids = {
                item.task_id for batch in batches for item in batch.items if item.task_id
            }
            visible_jobs = [
                job
                for job in rows
                if job.id not in child_ids
                and not bool((job.payload or {}).get("taskListHidden"))
            ]
            course_ids = {
                row.dojo_id for row in visible_jobs if row.dojo_id is not None
            }
            course_ids.update(batch.dojo_id for batch in batches)
            course_rows = (
                Dojos.query.filter(Dojos.dojo_id.in_(course_ids)).all()
                if course_ids
                else []
            )
            courses_by_id = {row.dojo_id: row for row in course_rows}
            module_keys = {
                (row.dojo_id, row.module_index)
                for row in visible_jobs
                if row.dojo_id is not None and row.module_index is not None
            }
            module_keys.update(
                (batch.dojo_id, batch.module_index) for batch in batches
            )
            module_rows = (
                DojoModules.query.filter(
                    DojoModules.dojo_id.in_(course_ids),
                ).all()
                if module_keys
                else []
            )
            modules_by_key = {
                (row.dojo_id, row.module_index): row
                for row in module_rows
                if (row.dojo_id, row.module_index) in module_keys
            }
            materialization_ids = {
                str(value)
                for row in visible_jobs
                for value in (
                    (row.result or {}).get("materializationJobId")
                    if isinstance(row.result, dict)
                    else None,
                )
                if value
            }
            materialization_jobs = {
                row.id: row
                for row in (
                    TeachingJobs.query.filter(
                        TeachingJobs.owner_id == user.id,
                        TeachingJobs.id.in_(materialization_ids),
                    ).all()
                    if materialization_ids
                    else []
                )
            }
            job_views = [
                _job_collection_view(
                    row,
                    courses_by_id.get(row.dojo_id),
                    modules_by_key.get((row.dojo_id, row.module_index)),
                    materialization_jobs.get(
                        str((row.result or {}).get("materializationJobId"))
                    )
                    if isinstance(row.result, dict)
                    else None,
                )
                for row in visible_jobs
            ]
            batch_views = (
                [
                    _generation_batch_task_view(
                        batch,
                        courses_by_id.get(batch.dojo_id),
                        modules_by_key.get((batch.dojo_id, batch.module_index)),
                    )
                    for batch in batches
                ]
                if offset == 0
                else []
            )
            return _ok(
                {
                    "jobs": job_views,
                    "batches": batch_views,
                    "pagination": {
                        "offset": offset,
                        "limit": limit,
                        "returned": len(job_views),
                        "nextOffset": offset + limit if has_next else None,
                        "hasNext": has_next,
                    },
                    "scope": {
                        "kind": "teacher",
                        "dojoId": dojo.dojo_id if dojo is not None else None,
                        "threadId": thread_id or None,
                    },
                    "asOf": _timestamp(datetime.datetime.utcnow()),
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc, 400, code="INVALID_TASK_FILTER")


@teaching_namespace.route("/jobs/<string:job_id>")
class TeachingJob(Resource):
    @authed_only
    def get(self, job_id):
        try:
            job = _job_for_user(job_id, _current_user())
            return _ok({"job": job_view(job), "events": job_events_view(job.id)})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def delete(self, job_id):
        try:
            user = _current_user()
            job = _job_for_user(job_id, user)
            cancel_job(job, user.id)
            return _ok({"job": job_view(job)})
        except (ScopeError, PermissionError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/generation-batches")
class TeachingGenerationBatchCollection(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            query = TeachingGenerationBatches.query.filter_by(owner_id=user.id)
            requested_dojo = request.args.get("dojoId")
            if requested_dojo:
                dojo = dojo_for_user(user, requested_dojo, teacher=True)
                query = query.filter_by(dojo_id=dojo.dojo_id)
            requested_thread = str(request.args.get("threadId") or "").strip()
            if requested_thread:
                _thread_for_owner(requested_thread, user)
                query = query.filter_by(thread_id=requested_thread)
            requested_status = str(request.args.get("status") or "").strip().upper()
            if requested_status:
                query = query.filter_by(status=requested_status)
            limit = request.args.get("limit", default=50, type=int) or 50
            limit = max(1, min(100, limit))
            rows = query.order_by(TeachingGenerationBatches.updated.desc()).limit(limit).all()
            return _ok(
                {
                    "batches": [_generation_batch_view(row) for row in rows],
                    "scope": {
                        "kind": "teacher",
                        "dojoId": rows[0].dojo_id if requested_dojo and rows else None,
                    },
                    "asOf": _timestamp(datetime.datetime.utcnow()),
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/generation-batches/<string:batch_id>")
class TeachingGenerationBatchDetail(Resource):
    @authed_only
    def get(self, batch_id):
        user = _current_user()
        try:
            _require_teacher(user)
            return _ok({"batch": _generation_batch_view(_generation_batch_for_user(batch_id, user))})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def delete(self, batch_id):
        user = _current_user()
        try:
            _require_teacher(user)
            batch = _generation_batch_for_user(batch_id, user)
            canceled = []
            for item in batch.items:
                task = item.task
                if task is None or str(task.status or "").upper() not in {
                    "QUEUED",
                    "RUNNING",
                    "CANCEL_REQUESTED",
                }:
                    continue
                cancel_job(task, user.id)
                canceled.append(task.id)
            refreshed = _generation_batch_for_user(batch_id, user)
            if not canceled and refreshed.status not in {
                "QUEUED",
                "GENERATING",
                "VALIDATING",
            }:
                raise ValueError("当前批次已经结束，无法取消。")
            return _ok(
                {
                    "batch": _generation_batch_view(refreshed),
                    "canceledTaskIds": canceled,
                    "successfulItemsPreserved": sum(
                        str(item.status or "").upper() == "NEEDS_REVIEW"
                        for item in refreshed.items
                    ),
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc, 409, code="INVALID_BATCH_STATE")


@teaching_namespace.route(
    "/generation-batches/<string:batch_id>/retry-failed"
)
class TeachingGenerationBatchRetryFailed(Resource):
    @authed_only
    def post(self, batch_id):
        user = _current_user()
        try:
            _require_teacher(user)
            batch = _generation_batch_for_user(batch_id, user)
            token = str(_body().get("idempotencyKey") or "").strip()
            if not token or len(token) > 64:
                raise ValueError("重试需要有效的幂等键。")
            retry_items = []
            for item in batch.items:
                expected_token = f"{token}:{item.item_index}"
                already_requested = (
                    item.task is not None
                    and str(
                        ((item.task.payload or {}).get("manualRetryToken")) or ""
                    )
                    == expected_token
                )
                if (
                    str(item.status or "").upper() in {"FAILED", "CANCELED"}
                    or already_requested
                ):
                    retry_items.append(item)
            if not retry_items:
                raise ValueError("当前批次没有可重试的失败项。")
            retried = []
            for item in retry_items:
                if item.task is None:
                    raise ValueError(f"第 {item.item_index} 项的持久任务不存在。")
                task, created = retry_job(
                    item.task,
                    user.id,
                    f"{token}:{item.item_index}",
                )
                retried.append(
                    {
                        "itemIndex": item.item_index,
                        "taskId": task.id,
                        "requeued": created,
                    }
                )
            refreshed = _generation_batch_for_user(batch_id, user)
            return _ok(
                {
                    "batch": _generation_batch_view(refreshed),
                    "retried": retried,
                    "successfulItemsPreserved": sum(
                        str(item.status or "").upper() == "NEEDS_REVIEW"
                        for item in refreshed.items
                    ),
                },
                202,
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (PermissionError, ValueError) as exc:
            return _error(exc, 409, code="INVALID_BATCH_STATE")


@teaching_namespace.route(
    "/generation-batches/<string:batch_id>/items/<int:item_index>/retry"
)
class TeachingGenerationBatchItemRetry(Resource):
    @authed_only
    def post(self, batch_id, item_index):
        user = _current_user()
        try:
            _require_teacher(user)
            batch = _generation_batch_for_user(batch_id, user)
            token = str(_body().get("idempotencyKey") or "").strip()
            if not token or len(token) > 64:
                raise ValueError("重试需要有效的幂等键。")
            item = next(
                (row for row in batch.items if row.item_index == item_index),
                None,
            )
            if item is None:
                raise ScopeError("Generation batch item not found")
            already_requested = (
                item.task is not None
                and str(
                    ((item.task.payload or {}).get("manualRetryToken")) or ""
                )
                == token
            )
            if (
                str(item.status or "").upper() not in {"FAILED", "CANCELED"}
                and not already_requested
            ):
                raise ValueError("这道题当前不需要重试。")
            if item.task is None:
                raise ValueError("这道题的持久任务不存在。")
            task, created = retry_job(item.task, user.id, token)
            refreshed = _generation_batch_for_user(batch_id, user)
            return _ok(
                {
                    "batch": _generation_batch_view(refreshed),
                    "retried": {
                        "itemIndex": item_index,
                        "taskId": task.id,
                        "requeued": created,
                    },
                    "successfulItemsPreserved": sum(
                        str(row.status or "").upper() == "NEEDS_REVIEW"
                        for row in refreshed.items
                    ),
                },
                202,
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (PermissionError, ValueError) as exc:
            return _error(exc, 409, code="INVALID_BATCH_STATE")


@teaching_namespace.route("/jobs/<string:job_id>/task-list")
class TeachingJobTaskList(Resource):
    @authed_only
    def delete(self, job_id):
        try:
            user = _current_user()
            job = _job_for_user(job_id, user)
            dismissed = dismiss_job_from_task_list(job, user.id)
            return _ok({"job": job_view(dismissed), "removed": True})
        except (ScopeError, PermissionError) as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc, 409, code="INVALID_JOB_STATE")


@teaching_namespace.route("/jobs/<string:job_id>/files/<string:file_id>")
class TeachingJobFile(Resource):
    @authed_only
    def get(self, job_id, file_id):
        try:
            job = _job_for_user(job_id, _current_user())
            result = job.result if isinstance(job.result, dict) else {}
            files = result.get("files") if isinstance(result.get("files"), list) else []
            file_value = next(
                (
                    item
                    for item in files
                    if isinstance(item, dict) and str(item.get("id")) == file_id
                ),
                None,
            )
            if file_value is None:
                raise ScopeError("Generated file not found")
            public_file = public_agent_file(file_value)
            if public_file is None:
                raise ScopeError("Generated file not found")
            response = send_file(
                agent_file_path(file_value),
                mimetype=public_file["mimeType"],
                as_attachment=True,
                download_name=public_file["filename"],
                conditional=True,
                max_age=0,
            )
            response.headers["Cache-Control"] = "private, no-store"
            return response
        except (ScopeError, ValueError):
            return _error("Generated file not found", 404, code="NOT_FOUND")


@teaching_namespace.route("/jobs/<string:job_id>/retry")
class TeachingJobRetry(Resource):
    @authed_only
    def post(self, job_id):
        try:
            user = _current_user()
            job = _job_for_user(job_id, user)
            retried, created = retry_job(
                job,
                user.id,
                _body().get("idempotencyKey"),
            )
            return _ok(
                {
                    "job": job_view(retried),
                    "created": created,
                    "replacedInPlace": retried.id == job.id,
                    "replacedJobId": job.id,
                },
                202 if created else 200,
            )
        except (ScopeError, PermissionError) as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc, 409, code="INVALID_JOB_STATE")


@teaching_namespace.route("/actions")
class TeachingActions(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            allowed_dojo_ids = {dojo.dojo_id for dojo in _teacher_dojos(user)}
            requested_dojo = request.args.get("dojoId", type=int)
            if requested_dojo is not None:
                dojo_for_user(user, requested_dojo, teacher=True)
                allowed_dojo_ids &= {requested_dojo}
            status = str(request.args.get("status") or "").strip().upper()
            query = TeachingAgentActions.query
            if status:
                query = query.filter_by(status=status)
            target_id = str(request.args.get("targetId") or "").strip()
            if target_id:
                query = query.filter_by(target_id=target_id)
            rows = query.order_by(TeachingAgentActions.created.desc()).limit(500).all()
            rows = [
                row
                for row in rows
                if (row.request_json or {}).get("dojoId") in allowed_dojo_ids
                and (
                    (
                        row.action_type != "review-self-artifact"
                        and row.actor_id == user.id
                    )
                    or (
                        row.action_type == "review-self-artifact"
                        and row.actor_id != user.id
                    )
                )
            ][:200]
            return _ok({"actions": [_action_view(row) for row in rows]})
        except ScopeError as exc:
            return _error(exc, 403)


@teaching_namespace.route("/actions/<string:action_id>/decision")
class TeachingActionDecision(Resource):
    @authed_only
    def get(self, action_id):
        user = _current_user()
        try:
            _require_teacher(user)
            action = _action_for_teacher(
                TeachingAgentActions.query.filter_by(id=action_id).first(),
                user,
            )
            return _ok({"action": _action_view(action)})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def post(self, action_id):
        user = _current_user()
        published_challenge = None
        body = _body()
        decision = str(body.get("decision") or "").upper()
        if body.get("confirmed") is not True or decision not in {
            "APPROVED",
            "REJECTED",
        }:
            return _error("Explicit confirmed approval or rejection is required")
        try:
            action = (
                TeachingAgentActions.query.filter_by(id=action_id)
                .with_for_update()
                .first()
            )
            if action is None or action.status != "AWAITING_APPROVAL":
                return _error("Action not found", 404, code="NOT_FOUND")
            _action_for_teacher(action, user)
            dojo_id = (action.request_json or {}).get("dojoId")
            if TeachingAgentApprovals.query.filter_by(action_id=action.id).first():
                return _error("Action was already decided", 409, code="ALREADY_DECIDED")

            artifact = None
            if action.target_type == "artifact":
                artifact = TeachingArtifacts.query.filter_by(
                    id=action.target_id
                ).first()
                if (
                    artifact is None
                    or artifact.dojo_id != int(dojo_id)
                    or artifact.owner_id != action.actor_id
                ):
                    raise ScopeError("Artifact not found")
                expected = int(
                    (action.request_json or {}).get("expectedRevision")
                    or artifact.current_revision
                )
                if artifact.current_revision != expected:
                    return _error(
                        "Artifact changed after review was requested; request publication again",
                        409,
                        code="REVISION_CONFLICT",
                    )

            result = dict(action.result or {})
            if (
                decision == "APPROVED"
                and action.action_type == "publish-question-artifact"
            ):
                draft = LearningDrafts.query.filter_by(id=result.get("draftId")).first()
                if (
                    draft is None
                    or draft.author_id != action.actor_id
                    or draft.dojo_id != int(dojo_id)
                    or (draft.validation or {}).get("status") != "PASS"
                ):
                    return _error(
                        "The executable question has not passed the native publication gate",
                        409,
                        code="VALIDATION_REQUIRED",
                    )
                from ...learning.authoring import publish_draft

                challenge = publish_draft(draft, user)
                published_challenge = challenge
                artifact.published_challenge_id = challenge.challenge_id
                artifact.status = "PUBLISHED"
                artifact.published = datetime.datetime.utcnow()
                current_revision = TeachingArtifactRevisions.query.filter_by(
                    artifact_id=artifact.id,
                    revision=artifact.current_revision,
                ).first()
                if current_revision:
                    current_revision.validation = {
                        **(current_revision.validation or {}),
                        "status": "PASS",
                        "publishedChallengeId": challenge.challenge_id,
                    }

                ObjectiveMappings.query.filter_by(
                    dojo_id=artifact.dojo_id,
                    module_index=artifact.module_index,
                    target_type="challenge",
                    target_id=str(challenge.challenge_id),
                    active=True,
                ).update({"active": False}, synchronize_session=False)
                objectives = (draft.spec or {}).get("objectives") or []
                for index, objective in enumerate(objectives, 1):
                    if isinstance(objective, dict):
                        objective_name = str(
                            objective.get("name")
                            or objective.get("title")
                            or objective.get("objective")
                            or f"目标 {index}"
                        )[:240]
                        objective_id = str(objective.get("id") or f"objective-{index}")[
                            :128
                        ]
                        knowledge_point = objective.get("knowledgePointId")
                        weight = float(objective.get("weight") or 1.0)
                    else:
                        objective_name = str(objective)[:240]
                        objective_id = f"objective-{index}"
                        knowledge_point = None
                        weight = 1.0
                    db.session.add(
                        ObjectiveMappings(
                            dojo_id=artifact.dojo_id,
                            module_index=artifact.module_index,
                            objective_id=objective_id,
                            objective_name=objective_name,
                            knowledge_point_id=(
                                str(knowledge_point)[:128] if knowledge_point else None
                            ),
                            target_type="challenge",
                            target_id=str(challenge.challenge_id),
                            weight=weight,
                            rule={"completion": "verified-solve"},
                        )
                    )
                result.update(
                    {
                        "publishedChallengeId": challenge.challenge_id,
                        "challengeReferenceId": challenge.reference_id,
                    }
                )
            elif (
                decision == "APPROVED"
                and action.action_type == "publish-teaching-artifact"
            ):
                artifact.status = "PUBLISHED"
                artifact.published = datetime.datetime.utcnow()
                result["publishedArtifactId"] = artifact.id
            elif action.action_type == "apply-material-chapters":
                material = TeachingMaterials.query.filter_by(
                    id=action.target_id,
                    owner_id=action.actor_id,
                    dojo_id=int(dojo_id),
                ).first()
                if material is None:
                    raise ScopeError("Material not found")
                material_revision = TeachingMaterialRevisions.query.filter_by(
                    id=(action.request_json or {}).get("materialRevisionId"),
                    material_id=material.id,
                ).first()
                selected = (action.request_json or {}).get("chapters") or []
                if material_revision is None or content_hash(selected) != (
                    action.request_json or {}
                ).get("chaptersHash"):
                    return _error(
                        "Material analysis changed after review was requested",
                        409,
                        code="REVISION_CONFLICT",
                    )
                if decision == "APPROVED":
                    maximum_index = (
                        db.session.query(func.max(DojoModules.module_index))
                        .filter_by(dojo_id=int(dojo_id))
                        .scalar()
                    )
                    next_index = (
                        maximum_index if maximum_index is not None else -1
                    ) + 1
                    existing_ids = {
                        row.id
                        for row in DojoModules.query.filter_by(
                            dojo_id=int(dojo_id)
                        ).all()
                    }
                    applied = []
                    for offset, chapter in enumerate(selected):
                        if not isinstance(chapter, dict):
                            raise ValueError("Invalid chapter candidate")
                        module_index = next_index + offset
                        base_slug = _module_slug(
                            chapter.get("title"),
                            f"material-{material.id[-8:]}-{module_index}",
                        )
                        slug = base_slug
                        suffix = 2
                        while slug in existing_ids:
                            slug = f"{base_slug[:27]}-{suffix}"[:32]
                            suffix += 1
                        existing_ids.add(slug)
                        module = DojoModules(
                            dojo_id=int(dojo_id),
                            module_index=module_index,
                            id=slug,
                            name=str(chapter.get("title") or slug)[:128],
                            description=str(chapter.get("description") or "")[:8000],
                            data={
                                "importable": True,
                                "show_scoreboard": True,
                                "show_challenges": True,
                                "sourceMaterialId": material.id,
                                "sourceMaterialRevisionId": material_revision.id,
                                "sourceLocators": chapter.get("sourceLocators") or [],
                            },
                        )
                        db.session.add(module)
                        objectives = chapter.get("objectives") or []
                        for objective_index, raw_objective in enumerate(
                            objectives[:20], 1
                        ):
                            if isinstance(raw_objective, dict):
                                name = str(
                                    raw_objective.get("name")
                                    or raw_objective.get("title")
                                    or raw_objective.get("objective")
                                    or f"目标 {objective_index}"
                                )[:240]
                                objective_id = str(
                                    raw_objective.get("id")
                                    or f"material-{chapter.get('sourceIndex', offset)}-{objective_index}"
                                )[:128]
                                knowledge_point_id = raw_objective.get(
                                    "knowledgePointId"
                                )
                            else:
                                name = str(raw_objective)[:240]
                                objective_id = (
                                    f"material-{chapter.get('sourceIndex', offset)}-{objective_index}"
                                )[:128]
                                knowledge_point_id = None
                            db.session.add(
                                ObjectiveMappings(
                                    dojo_id=int(dojo_id),
                                    module_index=module_index,
                                    objective_id=objective_id,
                                    objective_name=name,
                                    knowledge_point_id=(
                                        str(knowledge_point_id)[:128]
                                        if knowledge_point_id
                                        else None
                                    ),
                                    target_type="module",
                                    target_id=slug,
                                    rule={
                                        "source": "material-analysis",
                                        "materialId": material.id,
                                        "materialRevisionId": material_revision.id,
                                    },
                                )
                            )
                        applied.append(
                            {
                                "moduleIndex": module_index,
                                "moduleId": slug,
                                "title": module.name,
                            }
                        )
                    result["modules"] = applied
            elif action.action_type == "control-teaching-session":
                session = (
                    TeachingSessions.query.filter_by(
                        id=action.target_id,
                        dojo_id=int(dojo_id),
                    )
                    .with_for_update()
                    .first()
                )
                if session is None:
                    raise ScopeError("Teaching session not found")
                expected_status = (action.request_json or {}).get("expectedStatus")
                command = (action.request_json or {}).get("command")
                if session.status != expected_status:
                    return _error(
                        "Classroom state changed after review was requested",
                        409,
                        code="STATE_CONFLICT",
                    )
                if decision == "APPROVED":
                    now = datetime.datetime.utcnow()
                    if command == "start" and session.status in {"READY", "PAUSED"}:
                        if not isinstance(
                            (session.state or {}).get("stage"), dict
                        ) or not ((session.state or {}).get("scenes") or []):
                            return _error(
                                "Classroom content is not ready",
                                409,
                                code="CLASSROOM_NOT_READY",
                            )
                        session.status = "LIVE"
                        session.started = session.started or now
                        event_type = "session.started"
                    elif command == "end" and session.status == "LIVE":
                        session.status = "ENDED"
                        session.ended = now
                        event_type = "session.ended"
                    else:
                        return _error(
                            "Invalid classroom transition", 409, code="STATE_CONFLICT"
                        )
                    sequence = (
                        db.session.query(func.max(TeachingSessionEvents.sequence))
                        .filter_by(session_id=session.id)
                        .scalar()
                        or 0
                    ) + 1
                    db.session.add(
                        TeachingSessionEvents(
                            session_id=session.id,
                            sequence=sequence,
                            actor_id=user.id,
                            event_type=event_type,
                            idempotency_key=f"approved-action:{action.id}",
                            payload={"command": command, "approvalActionId": action.id},
                        )
                    )
                    result["sessionStatus"] = session.status
            elif action.action_type == "review-self-artifact":
                workspace = SelfLearningWorkspaces.query.filter_by(
                    id=action.target_id,
                    dojo_id=int(dojo_id),
                    student_id=action.actor_id,
                ).first()
                if workspace is None:
                    raise ScopeError("Self-learning workspace not found")
                submitted = TeachingArtifacts.query.filter_by(
                    id=workspace.submitted_artifact_id,
                    self_workspace_id=workspace.id,
                    owner_id=workspace.student_id,
                    dojo_id=workspace.dojo_id,
                ).first()
                expected_revision = int(
                    (action.request_json or {}).get("expectedRevision") or 0
                )
                if (
                    submitted is None
                    or submitted.id != (action.request_json or {}).get("artifactId")
                    or submitted.current_revision != expected_revision
                ):
                    return _error(
                        "Submitted artifact changed after review was requested",
                        409,
                        code="REVISION_CONFLICT",
                    )
                workspace.status = (
                    "APPROVED" if decision == "APPROVED" else "CHANGES_REQUESTED"
                )
                submitted.status = (
                    "APPROVED_PERSONAL"
                    if decision == "APPROVED"
                    else "CHANGES_REQUESTED"
                )
                if decision == "APPROVED":
                    submitted_revision = TeachingArtifactRevisions.query.filter_by(
                        artifact_id=submitted.id,
                        revision=submitted.current_revision,
                    ).first()
                    if submitted_revision is None:
                        return _error("Submitted artifact revision not found", 409)
                    reviewed_artifact = TeachingArtifacts(
                        owner_id=user.id,
                        dojo_id=workspace.dojo_id,
                        module_index=workspace.module_index,
                        artifact_type=submitted.artifact_type,
                        title=f"学生提案：{submitted.title}"[:240],
                        status="DRAFT",
                        current_revision=1,
                    )
                    db.session.add(reviewed_artifact)
                    db.session.flush()
                    reviewed_revision = TeachingArtifactRevisions(
                        artifact_id=reviewed_artifact.id,
                        revision=1,
                        parent_revision=None,
                        instruction="教师审核学生自主学习成果后转为课程草稿",
                        content=submitted_revision.content,
                        content_hash=submitted_revision.content_hash,
                        source_refs=list(submitted_revision.source_refs or [])
                        + [
                            {
                                "type": "self-learning-submission",
                                "workspaceId": workspace.id,
                                "artifactId": submitted.id,
                                "revision": submitted.current_revision,
                                "studentId": workspace.student_id,
                            }
                        ],
                        validation={"status": "PENDING", "reviewActionId": action.id},
                        created_by=user.id,
                    )
                    db.session.add(reviewed_revision)
                    result["reviewedArtifactId"] = reviewed_artifact.id
                result["workspaceStatus"] = workspace.status
            elif decision == "REJECTED" and artifact is not None:
                artifact.status = "DRAFT"

            approval = TeachingAgentApprovals(
                action_id=action.id,
                approver_id=user.id,
                decision=decision,
                comment=str(body.get("comment") or "")[:8000],
            )
            db.session.add(approval)
            action.status = decision
            action.result = result
            action.error = None
            action.completed = datetime.datetime.utcnow()
            db.session.commit()
            if published_challenge is not None:
                from ...learning.solution_agent import enqueue_solution_run
                from ...utils.image_pulls import publish_image_pull

                if not (published_challenge.image or "").startswith(
                    (
                        "mac:",
                        "pwncollege-",
                        "pwncollege/",
                        "challenges.pwn.college/",
                    )
                ):
                    publish_image_pull(
                        published_challenge.image,
                        dojo_reference_id=published_challenge.dojo.reference_id,
                    )
                if exercise_mode(published_challenge) != "SIMULATION":
                    solution_run = enqueue_solution_run(
                        published_challenge,
                        user,
                    )
                    action = TeachingAgentActions.query.filter_by(id=action.id).first()
                    action.result = {
                        **(action.result or {}),
                        "solutionRunId": solution_run.id,
                    }
                    db.session.commit()
            return _ok({"action": _action_view(action)})
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(
                exc,
                404 if isinstance(exc, ScopeError) else 409,
                code="NOT_FOUND" if isinstance(exc, ScopeError) else "INVALID_REQUEST",
            )


def _record_conversation_upload(thread, user, material, job, *, ask_intent):
    _remember_thread_attachment(
        thread,
        material,
        job,
        status="AWAITING_INTENT" if ask_intent else "ACTIVE",
    )
    if ask_intent:
        attachment = _material_attachment_view(material, job=job)
        db.session.add(
            TeachingAgentMessages(
                thread_id=thread.id,
                user_id=user.id,
                role="user",
                content=f"上传文件《{material.title}》",
                metadata_json={
                    "client": "teacher-global-upload",
                    "attachments": [attachment],
                    "uploadOnly": True,
                },
            )
        )
        db.session.add(
            TeachingAgentMessages(
                thread_id=thread.id,
                user_id=user.id,
                role="assistant",
                content=(
                    f"已收到《{material.title}》。你希望我如何处理这份文件？"
                    "可以把它添加到某门课程的某个章节资料中，也可以根据它创建课件、"
                    "CTF 实践题或模拟演示。请直接告诉我选择，以及目标课程和章节"
                    "（如适用）。"
                ),
                metadata_json={
                    "pending": False,
                    "presentation": "answer",
                    "attachmentRequest": {
                        "materialId": material.id,
                        "status": "AWAITING_INTENT",
                    },
                    "suggestions": [
                        "帮我把这份文件添加到课程“课程名称”的章节“章节名称”资料中。",
                        "帮我根据这份文件为课程“课程名称”的章节“章节名称”创建一份课件。",
                        "帮我根据这份文件为课程“课程名称”的章节“章节名称”创建 CTF 实践题。",
                        "帮我根据这份文件为课程“课程名称”的章节“章节名称”创建一个模拟演示。",
                    ],
                },
            )
        )
        if thread.title in DEFAULT_THREAD_TITLES:
            thread.title = f"处理《{material.title}》"[:240]
    thread.updated = datetime.datetime.utcnow()
    db.session.commit()


@teaching_namespace.route("/materials")
class Materials(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        query = TeachingMaterials.query.filter(
            TeachingMaterials.owner_id == user.id,
            TeachingMaterials.status != "ARCHIVED",
        )
        dojo_id = request.args.get("dojoId", type=int)
        if dojo_id is not None:
            dojo_for_user(user, dojo_id, teacher=True)
            query = query.filter_by(dojo_id=dojo_id)
        rows = query.order_by(TeachingMaterials.updated.desc()).limit(200).all()
        material_ids = [row.id for row in rows]
        latest_revisions = {}
        if material_ids:
            revisions = (
                TeachingMaterialRevisions.query.filter(
                    TeachingMaterialRevisions.material_id.in_(material_ids)
                )
                .order_by(
                    TeachingMaterialRevisions.material_id,
                    TeachingMaterialRevisions.revision.desc(),
                )
                .all()
            )
            for revision in revisions:
                latest_revisions.setdefault(revision.material_id, revision)
        return _ok(
            {
                "materials": [
                    {
                        "id": row.id,
                        "dojoId": row.dojo_id,
                        "title": row.title,
                        "filename": _material_original_filename(row),
                        "mimeType": row.mime_type,
                        "size": row.size,
                        "sha256": row.sha256,
                        "status": row.status,
                        "metadata": row.metadata_json,
                        "analysis": (
                            (latest_revisions[row.id].metadata_json or {}).get(
                                "analysis"
                            )
                            if row.id in latest_revisions
                            else None
                        ),
                        "created": _timestamp(row.created),
                    }
                    for row in rows
                ]
            }
        )

    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
            upload = request.files.get("file")
            raw_dojo_id = str(request.form.get("dojoId") or "").strip()
            thread_id = str(request.form.get("threadId") or "").strip() or None
            conversation_upload = str(
                request.form.get("conversationUpload") or ""
            ).lower() in {"1", "true", "yes"}
            ask_intent = conversation_upload and (
                str(request.form.get("askIntent") or "").strip().lower()
                not in {"0", "false", "no"}
            )
            if upload is None or not upload.filename:
                return _error("请选择要上传的课程资料。")
            thread = _thread_for_owner(thread_id, user) if thread_id else None
            if conversation_upload and thread is None:
                raise ValueError("Global-agent uploads require an active conversation")
            dojo = (
                dojo_for_user(user, raw_dojo_id, teacher=True)
                if raw_dojo_id
                else None
            )
            if not conversation_upload and dojo is None:
                raise ValueError("课程中心上传必须指定目标课程。")
            if thread and dojo and thread.dojo_id not in {None, dojo.dojo_id}:
                raise ScopeError("Thread and material course scopes differ")
            if thread and dojo and thread.dojo_id is None:
                thread.dojo_id = dojo.dojo_id
            raw = upload.stream.read(MAX_UPLOAD_BYTES + 1)
            if len(raw) > MAX_UPLOAD_BYTES:
                return _error("文件超过 50 MB，请压缩或拆分后再上传。", 413)
            suffix = pathlib.Path(upload.filename).suffix.lower()
            if suffix not in ALLOWED_MATERIAL_SUFFIXES:
                return _error("不支持这种文件格式。", 415)
            if not raw or not _valid_material_signature(suffix, raw):
                return _error("文件内容与扩展名不一致，请检查文件后重试。", 415)
            security_scan = _scan_material_security(suffix, raw)
            mime_type = (
                mimetypes.guess_type(upload.filename)[0]
                or upload.mimetype
                or "application/octet-stream"
            )
            if not any(
                mime_type.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES
            ):
                return _error("不支持这种课程资料类型。", 415)
            digest = hashlib.sha256(raw).hexdigest()
            _lock_material_digest(user.id, digest)
            existing = TeachingMaterials.query.filter(
                TeachingMaterials.owner_id == user.id,
                TeachingMaterials.dojo_id
                == (dojo.dojo_id if dojo is not None else None),
                TeachingMaterials.sha256 == digest,
            ).first()
            if existing:
                restored = existing.status == "ARCHIVED"
                revision = (
                    TeachingMaterialRevisions.query.filter_by(
                        material_id=existing.id
                    )
                    .order_by(TeachingMaterialRevisions.revision.desc())
                    .first()
                )
                if restored:
                    existing.status = (
                        "READY" if revision and revision.status == "READY" else "UPLOADED"
                    )
                    existing.title = str(request.form.get("title") or upload.filename)[
                        :240
                    ]
                job = _material_jobs(user.id, [existing.id]).get(existing.id)
                if job is not None and job.status in {"FAILED", "CANCELED"}:
                    job, _ = retry_job(
                        job,
                        user.id,
                        f"upload-{uuid.uuid4().hex}",
                    )
                elif job is None and revision is not None and revision.status != "READY":
                    revision.status = "PENDING"
                    existing.status = "UPLOADED"
                    job, _ = enqueue_job(
                        owner_id=user.id,
                        kind="material.analyze",
                        idempotency_key=(
                            f"material-analyze:{user.id}:{existing.id}:"
                            f"{revision.id}:{uuid.uuid4().hex}"
                        ),
                        payload={
                            "materialId": existing.id,
                            "revisionId": revision.id,
                            "filename": existing.filename,
                            "mimeType": existing.mime_type,
                            "size": existing.size,
                            "storageKey": existing.storage_key,
                        },
                        dojo_id=existing.dojo_id,
                        module_index=(
                            thread.module_index
                            if thread is not None and existing.dojo_id is not None
                            else None
                        ),
                        thread_id=thread.id if thread else None,
                        priority=20,
                    )
                if conversation_upload:
                    _record_conversation_upload(
                        thread,
                        user,
                        existing,
                        job,
                        ask_intent=ask_intent,
                    )
                else:
                    db.session.commit()
                return _ok(
                    {
                        "materialId": existing.id,
                        "deduplicated": True,
                        "restored": restored,
                        "job": job_view(job) if job is not None else None,
                        "thread": (
                            _thread_view(thread, include_messages=True)
                            if conversation_upload
                            else None
                        ),
                        "questionAsked": bool(ask_intent),
                    }
                )

            filename = secure_filename(upload.filename) or "material.bin"
            storage_root = pathlib.Path(config.AGENT_RUNTIME_STORAGE_ROOT)
            storage_user_dir = storage_root / str(user.id)
            scope_key = str(dojo.dojo_id) if dojo is not None else "unassigned"
            storage_dir = storage_user_dir / scope_key
            storage_root.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(storage_root, 0o700)
            storage_user_dir.mkdir(mode=0o700, exist_ok=True)
            os.chmod(storage_user_dir, 0o700)
            storage_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(storage_dir, 0o700)
            storage_key = f"{user.id}/{scope_key}/{secrets.token_hex(16)}-{filename}"
            destination = pathlib.Path(config.AGENT_RUNTIME_STORAGE_ROOT) / storage_key
            temporary = destination.with_suffix(destination.suffix + ".upload")
            with temporary.open("xb") as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary, 0o600)
            temporary.replace(destination)

            material = TeachingMaterials(
                owner_id=user.id,
                dojo_id=dojo.dojo_id if dojo is not None else None,
                title=str(request.form.get("title") or upload.filename)[:240],
                filename=filename,
                mime_type=mime_type,
                size=len(raw),
                sha256=digest,
                storage_key=storage_key,
                status="UPLOADED",
                metadata_json={
                    "originalFilename": upload.filename,
                    "securityScan": security_scan,
                    "placements": [],
                },
            )
            db.session.add(material)
            db.session.flush()
            revision = TeachingMaterialRevisions(
                material_id=material.id,
                revision=1,
                storage_key=storage_key,
                sha256=digest,
                status="PENDING",
                metadata_json={},
            )
            db.session.add(revision)
            db.session.commit()
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="material.analyze",
                idempotency_key=(
                    f"material-analyze:{user.id}:{material.id}:{revision.id}"
                ),
                payload={
                    "materialId": material.id,
                    "revisionId": revision.id,
                    "filename": filename,
                    "mimeType": mime_type,
                    "size": len(raw),
                    "storageKey": storage_key,
                },
                dojo_id=dojo.dojo_id if dojo is not None else None,
                module_index=(
                    thread.module_index
                    if thread is not None and dojo is not None
                    else None
                ),
                thread_id=thread.id if thread else None,
                priority=20,
            )
            if conversation_upload:
                _record_conversation_upload(
                    thread,
                    user,
                    material,
                    job,
                    ask_intent=ask_intent,
                )
            return _ok(
                {
                    "materialId": material.id,
                    "job": job_view(job),
                    "thread": (
                        _thread_view(thread, include_messages=True)
                        if conversation_upload
                        else None
                    ),
                    "questionAsked": bool(ask_intent),
                },
                202,
            )
        except (ScopeError, OSError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 403 if isinstance(exc, ScopeError) else 400)


def _material_for_teacher(material_id, user, *, lock=False):
    query = TeachingMaterials.query.filter_by(id=material_id)
    if lock:
        query = query.with_for_update()
    material = query.first()
    if material is None:
        raise ScopeError("Material not found")
    if material.owner_id != user.id:
        raise ScopeError("Material not found")
    if material.dojo_id is not None:
        dojo_for_user(user, material.dojo_id, teacher=True)
    return material


def _material_source_path(material):
    root = pathlib.Path(config.AGENT_RUNTIME_STORAGE_ROOT).resolve()
    source = (root / material.storage_key).resolve()
    if root not in source.parents or not source.is_file():
        raise ValueError("Material source file is unavailable")
    return source


def _material_for_viewer(material_id, user):
    material = TeachingMaterials.query.filter_by(id=material_id).first()
    if material is None or material.status == "ARCHIVED":
        raise ScopeError("Material not found")
    if material.owner_id == user.id:
        return material
    if material.dojo_id is None:
        raise ScopeError("Material not found")
    course_admin = getattr(user, "type", None) == "admin" or bool(
        DojoAdmins.query.filter_by(
            dojo_id=material.dojo_id,
            user_id=user.id,
        ).first()
    )
    dojo_for_user(user, material.dojo_id, teacher=course_admin)
    resources = DojoResources.query.filter_by(dojo_id=material.dojo_id).all()
    matching_resources = [
        resource
        for resource in resources
        if str((resource.data or {}).get("materialId") or "") == material.id
    ]
    if not matching_resources:
        raise ScopeError("Material not found")
    if not course_admin and not any(
        bool(resource.visible)
        and resource.module is not None
        and resource.module.visible()
        for resource in matching_resources
    ):
        raise ScopeError("Material not found")
    return material


@teaching_namespace.route("/materials/<string:material_id>/download")
class MaterialDownload(Resource):
    @authed_only
    def get(self, material_id):
        try:
            material = _material_for_viewer(material_id, _current_user())
            response = send_file(
                _material_source_path(material),
                mimetype=material.mime_type,
                as_attachment=True,
                download_name=_material_original_filename(material),
                conditional=True,
                max_age=0,
            )
            response.headers["Cache-Control"] = "private, no-store"
            return response
        except (ScopeError, ValueError):
            return _error("Material not found", 404, code="NOT_FOUND")


@teaching_namespace.route("/materials/<string:material_id>/preview")
class MaterialPreview(Resource):
    @authed_only
    def get(self, material_id):
        try:
            material = _material_for_viewer(material_id, _current_user())
            preview_mode = _material_preview_mode(material)
            if preview_mode == "extracted":
                return _error(
                    "该格式使用已提取内容预览。",
                    415,
                    code="PREVIEW_UNSUPPORTED",
                )
            response = send_file(
                _material_source_path(material),
                mimetype=(
                    "text/plain"
                    if preview_mode == "text"
                    else material.mime_type
                ),
                as_attachment=False,
                download_name=_material_original_filename(material),
                conditional=True,
                max_age=0,
            )
            response.headers["Cache-Control"] = "private, no-store"
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
            return response
        except (ScopeError, ValueError):
            return _error("Material not found", 404, code="NOT_FOUND")


@teaching_namespace.route("/materials/<string:material_id>")
class MaterialDetail(Resource):
    @authed_only
    def get(self, material_id):
        user = _current_user()
        try:
            _require_teacher(user)
            material = _material_for_teacher(material_id, user)
            revision = (
                TeachingMaterialRevisions.query.filter_by(material_id=material.id)
                .order_by(TeachingMaterialRevisions.revision.desc())
                .first()
            )
            chunks = (
                TeachingMaterialChunks.query.filter_by(revision_id=revision.id)
                .order_by(TeachingMaterialChunks.ordinal)
                .limit(500)
                .all()
                if revision
                else []
            )
            return _ok(
                {
                    "material": {
                        "id": material.id,
                        "dojoId": material.dojo_id,
                        "title": material.title,
                        "filename": _material_original_filename(material),
                        "mimeType": material.mime_type,
                        "size": material.size,
                        "sha256": material.sha256,
                        "status": material.status,
                        "downloadUrl": (
                            f"/pwncollege_api/v1/teaching/materials/{material.id}/download"
                        ),
                        "previewUrl": (
                            f"/pwncollege_api/v1/teaching/materials/{material.id}/preview"
                        ),
                        "previewMode": _material_preview_mode(material),
                        "metadata": material.metadata_json,
                        "analysis": (
                            (revision.metadata_json or {}).get("analysis") or {}
                            if revision
                            else {}
                        ),
                        "created": _timestamp(material.created),
                        "updated": _timestamp(material.updated),
                        "revision": (
                            {
                                "id": revision.id,
                                "revision": revision.revision,
                                "status": revision.status,
                                "sha256": revision.sha256,
                                "analysis": (revision.metadata_json or {}).get(
                                    "analysis"
                                )
                                or {},
                                "created": _timestamp(revision.created),
                            }
                            if revision
                            else None
                        ),
                        "sources": [
                            {
                                "ordinal": chunk.ordinal,
                                "type": chunk.source_type,
                                "locator": chunk.source_locator,
                                "excerpt": chunk.content[:800],
                                "metadata": chunk.metadata_json,
                            }
                            for chunk in chunks
                        ],
                        "impact": _material_lineage_impact(material),
                    }
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def patch(self, material_id):
        user = _current_user()
        try:
            _require_teacher(user)
            material = _material_for_teacher(material_id, user, lock=True)
            title = str(_body().get("title") or "").strip()
            if not 1 <= len(title) <= 240:
                raise ValueError("课件名称需包含 1-240 个字符。")
            material.title = title
            _management_audit(
                user,
                "material.manage.rename",
                "teaching_material",
                material.id,
                {"dojoId": material.dojo_id, "filename": material.filename},
            )
            db.session.commit()
            return _ok(
                {
                    "material": {
                        "id": material.id,
                        "title": material.title,
                        "filename": _material_original_filename(material),
                        "status": material.status,
                    }
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_REQUEST")

    @authed_only
    def delete(self, material_id):
        user = _current_user()
        try:
            _require_teacher(user)
            material = _material_for_teacher(material_id, user, lock=True)
            if _active_resource_job(
                user,
                resource_key="materialId",
                resource_id=material.id,
            ):
                raise ValueError("课件仍在分析，请等待任务结束后再删除。")
            impact = _material_lineage_impact(material)
            material.status = "ARCHIVED"
            _management_audit(
                user,
                "material.manage.delete",
                "teaching_material",
                material.id,
                {
                    "dojoId": material.dojo_id,
                    "title": material.title,
                    "filename": material.filename,
                },
            )
            db.session.commit()
            return _ok(
                {
                    "deleted": False,
                    "archived": True,
                    "materialId": material.id,
                    "impact": impact,
                    "message": (
                        "资料已归档；已发布内容和历史版本仍保留来源记录。"
                        if impact["publishedCount"]
                        else "资料已从当前资料库归档，关联内容的来源记录仍保留。"
                    ),
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 409, code="INVALID_REQUEST")


@teaching_namespace.route("/materials/<string:material_id>/analyze")
class MaterialAnalysis(Resource):
    """Create a durable new analysis revision for an existing material."""

    @authed_only
    def post(self, material_id):
        user = _current_user()
        try:
            _require_teacher(user)
            material = _material_for_teacher(material_id, user, lock=True)
            body = _body()
            thread_id = str(body.get("threadId") or "").strip() or None
            thread = _thread_for_owner(thread_id, user) if thread_id else None
            if thread and thread.dojo_id not in {None, material.dojo_id}:
                raise ScopeError("Thread and material course scopes differ")

            latest = (
                TeachingMaterialRevisions.query.filter_by(material_id=material.id)
                .order_by(TeachingMaterialRevisions.revision.desc())
                .first()
            )
            if latest is not None and latest.status == "PENDING":
                active_jobs = (
                    TeachingJobs.query.filter(
                        TeachingJobs.owner_id == user.id,
                        TeachingJobs.kind == "material.analyze",
                        TeachingJobs.status.in_(
                            ["QUEUED", "RUNNING", "CANCEL_REQUESTED"]
                        ),
                    )
                    .order_by(TeachingJobs.created.desc())
                    .limit(100)
                    .all()
                )
                active = next(
                    (
                        job
                        for job in active_jobs
                        if (job.payload or {}).get("revisionId") == latest.id
                        and (job.payload or {}).get("materialId") == material.id
                    ),
                    None,
                )
                if active is not None:
                    db.session.rollback()
                    return _ok(
                        {
                            "materialId": material.id,
                            "job": job_view(active),
                            "deduplicated": True,
                        },
                        202,
                    )

            source = _material_source_path(material)
            with source.open("rb") as handle:
                if os.fstat(handle.fileno()).st_size != material.size:
                    db.session.rollback()
                    return _error(
                        "Material source size no longer matches the uploaded revision",
                        409,
                        code="MATERIAL_INTEGRITY_ERROR",
                    )
                digest = hashlib.file_digest(handle, "sha256").hexdigest()
            if digest != material.sha256:
                db.session.rollback()
                return _error(
                    "Material source hash no longer matches the uploaded revision",
                    409,
                    code="MATERIAL_INTEGRITY_ERROR",
                )

            revision_number = (latest.revision if latest is not None else 0) + 1
            revision = TeachingMaterialRevisions(
                material_id=material.id,
                revision=revision_number,
                storage_key=material.storage_key,
                sha256=material.sha256,
                status="PENDING",
                metadata_json={
                    "reprocessed": True,
                    "reason": str(body.get("reason") or "")[:2000],
                    "parentRevisionId": latest.id if latest is not None else None,
                },
            )
            material.status = "UPLOADED"
            db.session.add(revision)
            db.session.flush()
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="material.analyze",
                idempotency_key=f"material-analyze:{user.id}:{material.id}:{revision.id}",
                payload={
                    "materialId": material.id,
                    "revisionId": revision.id,
                    "filename": material.filename,
                    "mimeType": material.mime_type,
                    "size": material.size,
                    "storageKey": material.storage_key,
                },
                dojo_id=material.dojo_id,
                module_index=thread.module_index if thread else None,
                thread_id=thread.id if thread else None,
                priority=20,
            )
            return _ok(
                {
                    "materialId": material.id,
                    "materialRevisionId": revision.id,
                    "revision": revision.revision,
                    "job": job_view(job),
                },
                202,
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (OSError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 409, code="MATERIAL_UNAVAILABLE")


def _material_chapter_title_key(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _validate_material_chapter_candidate(candidate, *, seen_titles):
    """Return a durable chapter payload or reject an unusable analysis row."""

    title = str(candidate.get("title") or "").strip()
    title_key = _material_chapter_title_key(title)
    compact_title = re.sub(r"\s+", "", title)
    if len(compact_title) < 2 or len(title) > 128:
        raise ValueError("Chapter title must contain 2-128 meaningful characters")
    if re.fullmatch(
        r"(?:第?\d+(?:章|节|部分)?|(?:章节|章|节|部分)\s*\d+|(?:chapter|section)\s*\d+)",
        title,
        flags=re.IGNORECASE,
    ):
        raise ValueError("Chapter title must describe a topic, not only an ordinal")
    if title_key in seen_titles:
        raise ValueError("Selected material chapter titles must be distinct")

    description = str(
        candidate.get("description") or candidate.get("summary") or ""
    ).strip()
    objectives = candidate.get("objectives") or []
    has_objective = isinstance(objectives, list) and any(
        len(re.sub(r"\s+", "", str(objective or ""))) >= 4 for objective in objectives
    )
    if not has_objective and len(re.sub(r"\s+", "", description)) < 12:
        raise ValueError(
            "Each material chapter needs a learning objective or teaching description"
        )
    seen_titles.add(title_key)
    return {
        "title": title,
        "description": description[:8000],
        "objectives": list(objectives)[:20] if isinstance(objectives, list) else [],
        "sourceLocators": list(candidate.get("sourceLocators") or [])[:100],
    }


@teaching_namespace.route("/materials/<string:material_id>/apply-chapters")
class MaterialChapterApplication(Resource):
    @authed_only
    def post(self, material_id):
        user = _current_user()
        try:
            _require_teacher(user)
            material = _material_for_teacher(material_id, user)
            revision = (
                TeachingMaterialRevisions.query.filter_by(material_id=material.id)
                .order_by(TeachingMaterialRevisions.revision.desc())
                .first()
            )
            analysis = (
                (revision.metadata_json or {}).get("analysis") if revision else None
            )
            candidates = (analysis or {}).get("chapterCandidates")
            if (
                revision is None
                or revision.status != "READY"
                or not isinstance(candidates, list)
            ):
                return _error(
                    "Material analysis is not ready", 409, code="ANALYSIS_REQUIRED"
                )
            indexes = _body().get("chapterIndexes")
            if not isinstance(indexes, list) or not indexes:
                return _error("Select at least one chapter candidate")
            selected = []
            seen_indexes = set()
            seen_titles = set()
            for raw_index in indexes[:50]:
                index = int(raw_index)
                if (
                    index < 0
                    or index >= len(candidates)
                    or not isinstance(candidates[index], dict)
                ):
                    raise ValueError("Invalid chapter candidate selection")
                if index in seen_indexes:
                    raise ValueError("Each material chapter can only be selected once")
                seen_indexes.add(index)
                candidate = candidates[index]
                selected.append(
                    {
                        "sourceIndex": index,
                        **_validate_material_chapter_candidate(
                            candidate,
                            seen_titles=seen_titles,
                        ),
                    }
                )
            digest = content_hash(selected)
            # TeachingAgentActions.idempotency_key is limited to 128 bytes.
            # Material and revision IDs are already long, so hash the scoped
            # identity rather than concatenating all three values verbatim.
            identity = f"{material.id}:{revision.id}:{digest}".encode("utf-8")
            key = f"material-chapters:{hashlib.sha256(identity).hexdigest()}"
            action = TeachingAgentActions.query.filter_by(idempotency_key=key).first()
            if action is None:
                thread = _thread_for_dojo_action(
                    user,
                    material.dojo_id,
                    title=f"章节确认：{material.title}",
                )
                action = TeachingAgentActions(
                    thread_id=thread.id,
                    actor_id=user.id,
                    action_type="apply-material-chapters",
                    risk_level="R3",
                    target_type="material",
                    target_id=material.id,
                    status="AWAITING_APPROVAL",
                    idempotency_key=key,
                    request_json={
                        "dojoId": material.dojo_id,
                        "materialRevisionId": revision.id,
                        "chaptersHash": digest,
                        "chapters": selected,
                    },
                    result={},
                )
                db.session.add(action)
                db.session.commit()
            return _ok({"action": _action_view(action)}, 202)
        except (ScopeError, ValueError, TypeError) as exc:
            db.session.rollback()
            return _error(exc, 403 if isinstance(exc, ScopeError) else 400)


@teaching_namespace.route("/sessions")
class TeachingSessionCollection(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            rows = (
                TeachingSessions.query.filter_by(owner_id=user.id)
                .order_by(TeachingSessions.updated.desc())
                .limit(100)
                .all()
            )
            return _ok(
                {
                    "sessions": [
                        {
                            "id": row.id,
                            "title": row.title,
                            "status": row.status,
                            "dojoId": row.dojo_id,
                            "moduleIndex": row.module_index,
                            "state": row.state,
                            "started": _timestamp(row.started),
                            "ended": _timestamp(row.ended),
                            "created": _timestamp(row.created),
                            "updated": _timestamp(row.updated),
                        }
                        for row in rows
                    ]
                }
            )
        except ScopeError as exc:
            return _error(exc, 403)

    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            scope = build_scope(
                user,
                role="teacher",
                dojo_id=body.get("dojoId"),
                module_index=body.get("moduleIndex"),
            )
            thread_id = str(body.get("threadId") or "").strip() or None
            thread = _thread_for_owner(thread_id, user) if thread_id else None
            if thread and (
                thread.dojo_id != scope.dojo_id
                or thread.module_index != scope.module_index
            ):
                raise ScopeError("Thread and classroom scopes differ")
            artifact = None
            if body.get("artifactId"):
                artifact = artifact_for_user(str(body["artifactId"]), user)
                if (
                    artifact.dojo_id != scope.dojo_id
                    or artifact.module_index != scope.module_index
                ):
                    raise ScopeError("Classroom artifact scope mismatch")
                _classroom_lesson(artifact)
            else:
                query = TeachingArtifacts.query.filter_by(
                    owner_id=user.id,
                    dojo_id=scope.dojo_id,
                    module_index=scope.module_index,
                ).filter(TeachingArtifacts.status != "ARCHIVED")
                for candidate in query.order_by(TeachingArtifacts.updated.desc()).limit(
                    50
                ):
                    try:
                        _classroom_lesson(candidate)
                        artifact = candidate
                        break
                    except ValueError:
                        continue
            if artifact is None:
                return _error(
                    "Generate usable course content or an interactive scene before starting class",
                    409,
                    code="CLASSROOM_ARTIFACT_REQUIRED",
                )
            session = TeachingSessions(
                owner_id=user.id,
                dojo_id=scope.dojo_id,
                module_index=scope.module_index,
                thread_id=thread.id if thread else None,
                title=str(body.get("title") or "课堂会话")[:240],
                status="READY",
                state={},
            )
            db.session.add(session)
            db.session.flush()
            rendered = _render_classroom(artifact, session.id)
            session.state = {
                **rendered,
                "artifactId": artifact.id,
                "artifactRevision": artifact.current_revision,
                "createdAt": _timestamp(datetime.datetime.utcnow()),
                "renderer": "agent-runtime-stage",
            }
            db.session.commit()
            return _ok(
                {
                    "sessionId": session.id,
                    "artifactId": artifact.id,
                    "artifactRevision": artifact.current_revision,
                },
                201,
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 409, code="CLASSROOM_RENDER_FAILED")
        except requests.RequestException as exc:
            db.session.rollback()
            return _error(exc, 502, code="AGENT_RUNTIME_UNAVAILABLE")


@teaching_namespace.route("/sessions/<string:session_id>")
class TeachingSessionDetail(Resource):
    @authed_only
    def get(self, session_id):
        user = _current_user()
        try:
            session = _session_for_user(session_id, user)
            event_query = TeachingSessionEvents.query.filter_by(session_id=session.id)
            if not owner_or_teacher(user, session.owner_id, session.dojo_id):
                event_query = event_query.filter(
                    or_(
                        TeachingSessionEvents.actor_id == user.id,
                        TeachingSessionEvents.event_type.in_(
                            {
                                "session.started",
                                "session.ended",
                                "artifact.opened",
                                "activity.started",
                                "activity.stopped",
                            }
                        ),
                    )
                )
            events = event_query.order_by(TeachingSessionEvents.sequence).all()
            return _ok(
                {
                    "session": {
                        "id": session.id,
                        "title": session.title,
                        "status": session.status,
                        "dojoId": session.dojo_id,
                        "moduleIndex": session.module_index,
                        "state": session.state,
                        "started": _timestamp(session.started),
                        "ended": _timestamp(session.ended),
                        "created": _timestamp(session.created),
                        "updated": _timestamp(session.updated),
                        "events": [
                            {
                                "id": event.id,
                                "sequence": event.sequence,
                                "type": event.event_type,
                                "actorId": event.actor_id,
                                "payload": event.payload,
                                "created": _timestamp(event.created),
                            }
                            for event in events
                        ],
                    }
                }
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/sessions/<string:session_id>/control")
class TeachingSessionControl(Resource):
    @authed_only
    def post(self, session_id):
        user = _current_user()
        try:
            session = _session_for_user(session_id, user, teacher=True)
            command = str(_body().get("command") or "").strip().lower()
            if command not in {"start", "end"}:
                return _error("Command must be start or end")
            if command == "start" and session.status not in {"READY", "PAUSED"}:
                return _error("Only a ready classroom can be started", 409)
            if command == "start" and (
                not isinstance((session.state or {}).get("stage"), dict)
                or not ((session.state or {}).get("scenes") or [])
            ):
                return _error(
                    "Classroom content is not ready", 409, code="CLASSROOM_NOT_READY"
                )
            if command == "end" and session.status != "LIVE":
                return _error("Only a live classroom can be ended", 409)
            key = (
                f"session-control:{session.id}:{command}:{session.updated.isoformat()}"
            )
            action = TeachingAgentActions.query.filter_by(idempotency_key=key).first()
            if action is None:
                thread = _thread_for_dojo_action(
                    user,
                    session.dojo_id,
                    session.module_index,
                    title=f"课堂控制：{session.title}",
                )
                action = TeachingAgentActions(
                    thread_id=thread.id,
                    actor_id=user.id,
                    action_type="control-teaching-session",
                    risk_level="R3",
                    target_type="teaching_session",
                    target_id=session.id,
                    status="AWAITING_APPROVAL",
                    idempotency_key=key,
                    request_json={
                        "dojoId": session.dojo_id,
                        "moduleIndex": session.module_index,
                        "command": command,
                        "expectedStatus": session.status,
                    },
                    result={},
                )
                db.session.add(action)
                db.session.commit()
            return _ok({"action": _action_view(action)}, 202)
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/sessions/<string:session_id>/events")
class TeachingSessionEventCollection(Resource):
    @authed_only
    def post(self, session_id):
        user = _current_user()
        try:
            session = _session_for_user(session_id, user, lock=True)
            body = _body()
            event_type = str(body.get("type") or "").strip()[:64]
            client_key = str(body.get("idempotencyKey") or "").strip()[:128]
            if not event_type or not client_key:
                return _error("Event type and idempotencyKey are required")
            key = (
                f"actor:{user.id}:"
                f"{hashlib.sha256(client_key.encode('utf-8')).hexdigest()}"
            )
            if event_type in {"session.started", "session.ended"}:
                return _error(
                    "Starting or ending a classroom requires an explicit R3 approval",
                    409,
                    code="APPROVAL_REQUIRED",
                )
            teacher = owner_or_teacher(user, session.owner_id, session.dojo_id)
            allowed = (
                {
                    "artifact.opened",
                    "activity.started",
                    "activity.stopped",
                    "whiteboard.snapshot",
                    "teacher.note",
                }
                if teacher
                else {
                    "student.joined",
                    "student.left",
                    "student.response",
                    "checkpoint.completed",
                    "activity.completed",
                }
            )
            if event_type not in allowed:
                return _error("Unsupported classroom event", 403, code="FORBIDDEN")
            payload = scrub_payload(
                body.get("payload") if isinstance(body.get("payload"), dict) else {}
            )
            payload_size = len(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            )
            if payload_size > MAX_SESSION_EVENT_BYTES:
                return _error("Classroom event payload exceeds 64 KiB", 413)
            existing = (
                TeachingSessionEvents.query.filter_by(
                    session_id=session.id,
                    actor_id=user.id,
                )
                .filter(TeachingSessionEvents.idempotency_key.in_([key, client_key]))
                .first()
            )
            if existing:
                return _ok({"eventId": existing.id, "sequence": existing.sequence})
            sequence = (
                db.session.query(TeachingSessionEvents.sequence)
                .filter_by(session_id=session.id)
                .order_by(TeachingSessionEvents.sequence.desc())
                .limit(1)
                .scalar()
                or 0
            ) + 1
            event = TeachingSessionEvents(
                session_id=session.id,
                sequence=sequence,
                actor_id=user.id,
                event_type=event_type,
                idempotency_key=key,
                payload=payload,
            )
            db.session.add(event)
            db.session.commit()
            return _ok({"eventId": event.id, "sequence": sequence}, 201)
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


def _learning_analytics_filters(dojo):
    filters = {
        "challengeId": str(request.args.get("challengeId") or "").strip() or None,
        "timeRange": str(request.args.get("timeRange") or "12w").strip().lower(),
    }
    try:
        if request.args.get("studentId") not in (None, ""):
            filters["studentId"] = int(request.args["studentId"])
        if request.args.get("moduleIndex") not in (None, ""):
            filters["moduleIndex"] = int(request.args["moduleIndex"])
    except (TypeError, ValueError) as exc:
        raise ValueError("学生和章节筛选值必须是整数") from exc
    if filters["timeRange"] not in {"7d", "30d", "90d", "12w", "lifetime"}:
        raise ValueError("时间范围必须是 7d、30d、90d、12w 或 lifetime")
    if filters.get("studentId") is not None:
        membership = DojoUsers.query.filter(
            DojoUsers.dojo_id == dojo.dojo_id,
            DojoUsers.user_id == filters["studentId"],
            DojoUsers.type != "admin",
        ).first()
        if membership is None:
            raise ScopeError("所选学生不在当前课程中")
    if filters.get("moduleIndex") is not None:
        module = DojoModules.query.filter_by(
            dojo_id=dojo.dojo_id,
            module_index=filters["moduleIndex"],
        ).first()
        if module is None:
            raise ScopeError("所选章节不在当前课程中")
    if filters["challengeId"]:
        challenge_query = DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id)
        try:
            challenge_numeric_id = int(filters["challengeId"])
        except (TypeError, ValueError):
            challenge_numeric_id = None
        if challenge_numeric_id is not None:
            challenge_query = challenge_query.filter(
                or_(
                    DojoChallenges.challenge_id == challenge_numeric_id,
                    DojoChallenges.id == filters["challengeId"],
                )
            )
        else:
            challenge_query = challenge_query.filter(
                DojoChallenges.id == filters["challengeId"]
            )
        if challenge_query.first() is None:
            raise ScopeError("所选题目不在当前课程中")
    return filters


@teaching_namespace.route("/progress/<string:dojo_id>")
class TeachingProgress(Resource):
    @authed_only
    def get(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            filters = _learning_analytics_filters(dojo)
            return _ok(build_course_learning_analytics(dojo, filters=filters))
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc)


def _learning_export_cell(value):
    text_value = "" if value is None else str(value)
    return f"'{text_value}" if text_value.startswith(("=", "+", "-", "@")) else text_value


@teaching_namespace.route("/progress/<string:dojo_id>/export")
class TeachingProgressExport(Resource):
    @authed_only
    def get(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            filters = _learning_analytics_filters(dojo)
            analytics = build_course_learning_analytics(dojo, filters=filters)
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc)
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        scope_filters = (analytics.get("scope") or {}).get("filters") or {}
        writer.writerow(["玄甲学情分析导出"])
        writer.writerow(["课程", _learning_export_cell(dojo.name or dojo.id)])
        writer.writerow(["统计时间", analytics.get("asOf") or ""])
        writer.writerow(["定义版本", analytics.get("definitionVersion") or ""])
        writer.writerow(["学生筛选", scope_filters.get("studentId") or "全部学生"])
        writer.writerow(
            [
                "章节筛选",
                scope_filters.get("moduleIndex")
                if scope_filters.get("moduleIndex") is not None
                else "全部章节",
            ]
        )
        writer.writerow(["题目筛选", scope_filters.get("challengeId") or "全部题目"])
        writer.writerow(["时间范围", scope_filters.get("timeRange") or "12w"])
        writer.writerow([])
        writer.writerow(
            [
                "学生ID",
                "学生",
                "关注状态",
                "风险分",
                "真实完成率",
                "已完成必修题",
                "必修题总数",
                "能力掌握度",
                "能力置信度",
                "过程评分",
                "证据充分度",
                "证据条数",
                "最后活动",
            ]
        )
        for student in analytics.get("students") or []:
            writer.writerow(
                [
                    student.get("userId"),
                    _learning_export_cell(student.get("name")),
                    student.get("riskLevel"),
                    student.get("riskScore"),
                    student.get("verifiedCompletion"),
                    student.get("requiredSolved"),
                    student.get("requiredTotal"),
                    student.get("masteryScore"),
                    student.get("masteryConfidence"),
                    student.get("averageProcessScore"),
                    student.get("evidenceConfidence"),
                    student.get("evidenceCount"),
                    student.get("lastActivity"),
                ]
            )
        response = send_file(
            io.BytesIO(output.getvalue().encode("utf-8-sig")),
            mimetype="text/csv; charset=utf-8",
            as_attachment=True,
            download_name=(
                f"learning-{secure_filename(dojo.reference_id)}-"
                f"{datetime.date.today().isoformat()}.csv"
            ),
            max_age=0,
        )
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Analytics-Scope"] = json.dumps(
            scope_filters,
            ensure_ascii=True,
            separators=(",", ":"),
        )
        response.headers["X-Analytics-As-Of"] = analytics.get("asOf") or ""
        return response


def _intervention_student(dojo, student_id):
    membership = DojoUsers.query.filter(
        DojoUsers.dojo_id == dojo.dojo_id,
        DojoUsers.user_id == student_id,
        DojoUsers.type != "admin",
    ).first()
    if membership is None:
        raise ScopeError("学生不在当前课程中")
    analytics = build_course_learning_analytics(dojo)
    student = next(
        (
            item
            for item in analytics.get("students", [])
            if int(item.get("userId")) == student_id
        ),
        None,
    )
    if student is None:
        raise ScopeError("未找到学生学情")
    return student


@teaching_namespace.route("/progress/<string:dojo_id>/interventions")
class TeachingProgressInterventions(Resource):
    @authed_only
    def post(self, dojo_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            body = _body()
            student_id = int(body.get("studentId"))
            plan = str(body.get("plan") or "").strip()
            title = str(body.get("title") or "学习干预").strip()
            kind = str(body.get("kind") or "TEACHER_PLAN").strip().upper()
            follow_up_days = int(body.get("followUpDays") or 7)
            if not plan:
                return _error("请填写具体干预计划")
            if len(plan) > 4000:
                return _error("干预计划不能超过 4000 个字符")
            if not title or len(title) > 160:
                return _error("干预标题需为 1 至 160 个字符")
            if len(kind) > 48:
                return _error("干预类型不能超过 48 个字符")
            if follow_up_days < 1 or follow_up_days > 60:
                return _error("复查周期需为 1 至 60 天")
            student = _intervention_student(dojo, student_id)
            started_at = datetime.datetime.utcnow()
            follow_up_at = started_at + datetime.timedelta(days=follow_up_days)
            baseline = learning_intervention_snapshot(student)
            baseline["capturedAt"] = _timestamp(started_at)
            intervention_id = f"{dojo.dojo_id}:{uuid.uuid4().hex}"
            event = LearningAuditEvents(
                actor_id=user.id,
                action="teacher.intervention.started",
                resource_type="learning_intervention",
                resource_id=intervention_id,
                outcome="OPEN",
                details={
                    "dojoId": dojo.dojo_id,
                    "studentId": student_id,
                    "title": title,
                    "kind": kind,
                    "plan": plan,
                    "followUpAt": _timestamp(follow_up_at),
                    "baseline": baseline,
                },
            )
            db.session.add(event)
            db.session.commit()
            return _ok(
                {
                    "interventionId": intervention_id,
                    "eventId": event.id,
                    "status": "tracking",
                    "startedAt": _timestamp(event.created),
                    "followUpAt": _timestamp(follow_up_at),
                },
                201,
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError):
            return _error("学生或复查周期格式不正确")


@teaching_namespace.route(
    "/progress/<string:dojo_id>/interventions/<string:intervention_id>/review"
)
class TeachingProgressInterventionReview(Resource):
    @authed_only
    def post(self, dojo_id, intervention_id):
        user = _current_user()
        try:
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            started = LearningAuditEvents.query.filter_by(
                action="teacher.intervention.started",
                resource_type="learning_intervention",
                resource_id=intervention_id,
            ).first()
            details = (
                started.details
                if started is not None and isinstance(started.details, dict)
                else {}
            )
            if (
                started is None
                or not intervention_id.startswith(f"{dojo.dojo_id}:")
                or str(details.get("dojoId")) != str(dojo.dojo_id)
            ):
                raise ScopeError("未找到干预记录")
            student_id = int(details.get("studentId"))
            body = _body()
            teacher_outcome = str(
                body.get("teacherOutcome") or "UNCERTAIN"
            ).strip().upper()
            if teacher_outcome not in {
                "IMPROVED",
                "UNCHANGED",
                "DECLINED",
                "UNCERTAIN",
            }:
                return _error("复查判断不受支持")
            note = str(body.get("note") or "").strip()
            if len(note) > 2000:
                return _error("复查说明不能超过 2000 个字符")
            student = _intervention_student(dojo, student_id)
            reviewed_at = datetime.datetime.utcnow()
            current = learning_intervention_snapshot(student)
            current["capturedAt"] = _timestamp(reviewed_at)
            review = LearningAuditEvents(
                actor_id=user.id,
                action="teacher.intervention.reviewed",
                resource_type="learning_intervention",
                resource_id=intervention_id,
                outcome="REVIEWED",
                details={
                    "dojoId": dojo.dojo_id,
                    "studentId": student_id,
                    "teacherOutcome": teacher_outcome,
                    "note": note,
                    "current": current,
                },
            )
            db.session.add(review)
            db.session.commit()
            return _ok(
                {
                    "interventionId": intervention_id,
                    "eventId": review.id,
                    "status": "reviewed",
                    "reviewedAt": _timestamp(review.created),
                },
                201,
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError):
            return _error("干预记录格式不正确")


@teaching_namespace.route("/self-learning/workspaces")
class SelfLearningWorkspaceCollection(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        rows = (
            SelfLearningWorkspaces.query.filter(
                SelfLearningWorkspaces.student_id == user.id,
                SelfLearningWorkspaces.status != "ARCHIVED",
            )
            .order_by(SelfLearningWorkspaces.updated.desc())
            .limit(100)
            .all()
        )
        artifacts = (
            TeachingArtifacts.query.filter(
                TeachingArtifacts.owner_id == user.id,
                TeachingArtifacts.self_workspace_id.in_([row.id for row in rows] or [""]),
                TeachingArtifacts.status != "ARCHIVED",
            )
            .order_by(TeachingArtifacts.updated.desc())
            .all()
        )
        by_workspace = {}
        for artifact in artifacts:
            by_workspace.setdefault(artifact.self_workspace_id, []).append(artifact)
        workspaces = []
        for row in rows:
            versions = by_workspace.get(row.id) or []
            latest = versions[0] if versions else None
            view = _workspace_view(row)
            view.update(
                {
                    "artifact": (
                        {
                            **artifact_view(latest, include_content=False),
                            "url": f"/learning/artifacts/{quote(latest.id)}?returnTo=/learning/extend",
                            "capabilities": artifact_capabilities(latest, user),
                        }
                        if latest
                        else None
                    ),
                    "versionCount": sum(
                        max(1, int(artifact.current_revision or 1))
                        for artifact in versions
                    ),
                    "visibility": (
                        "已提交教师"
                        if row.status == "SUBMITTED"
                        else "仅自己可见"
                    ),
                }
            )
            workspaces.append(view)
        return _ok({"workspaces": workspaces})

    @authed_only
    def post(self):
        user = _current_user()
        body = _body()
        goal = str(body.get("goal") or "").strip()
        if not goal:
            return _error("Learning goal is required")
        try:
            mode = str(body.get("mode") or "learning-path").strip()
            if mode not in {
                "learning-path",
                "slides",
                "attack-defense-scene",
                "simulation",
                "quiz",
                "debate",
            }:
                raise ValueError("Unsupported self-learning mode")
            attempt = None
            if body.get("attemptId"):
                attempt = LearningAttempts.query.filter_by(
                    id=str(body.get("attemptId")),
                    user_id=user.id,
                ).first()
                if attempt is None:
                    raise ScopeError("Learning attempt not found")
            dojo_id = body.get("dojoId")
            module_index = body.get("moduleIndex")
            if attempt is not None:
                if dojo_id is not None and int(dojo_id) != attempt.dojo_id:
                    raise ScopeError("Learning attempt course mismatch")
                if (
                    module_index is not None
                    and int(module_index) != attempt.module_index
                ):
                    raise ScopeError("Learning attempt module mismatch")
                dojo_id = attempt.dojo_id
                module_index = attempt.module_index
            scope = build_scope(
                user,
                role="student",
                dojo_id=dojo_id,
                module_index=module_index,
            )
            thread = TeachingAgentThreads(
                user_id=user.id,
                dojo_id=scope.dojo_id,
                module_index=scope.module_index,
                title=str(body.get("title") or goal)[:240],
                phase="SELF_LEARNING",
                context={"personal": True},
            )
            db.session.add(thread)
            db.session.flush()
            workspace = SelfLearningWorkspaces(
                student_id=user.id,
                dojo_id=scope.dojo_id,
                module_index=scope.module_index,
                thread_id=thread.id,
                title=str(body.get("title") or goal)[:240],
                goal=goal[:16000],
                status="ACTIVE",
                quota={
                    "candidateSets": 20,
                    "artifacts": 30,
                    "complexScenes": 3,
                    "modelTokens": 500000,
                    "storageBytes": 104857600,
                    "labMinutes": 120,
                },
                state={
                    "privacy": "PERSONAL_DRAFT",
                    "artifactType": mode,
                    "attemptId": attempt.id if attempt else None,
                    "challengeId": attempt.challenge_id if attempt else None,
                },
            )
            db.session.add(workspace)
            db.session.commit()
            return _ok(
                {"workspace": _workspace_view(workspace, include_usage=True)}, 201
            )
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc, 403 if isinstance(exc, ScopeError) else 400)


@teaching_namespace.route("/self-learning/workspaces/<string:workspace_id>/generate")
class SelfLearningGenerate(Resource):
    @authed_only
    def post(self, workspace_id):
        user = _current_user()
        try:
            workspace = _workspace_for_student(workspace_id, user, lock=True)
            body = _body()
            prompt = str(body.get("prompt") or workspace.goal).strip()
            if not prompt or len(prompt) > MAX_MESSAGE_CHARS:
                return _error(
                    "A learning prompt of at most 16000 characters is required"
                )
            artifact_type = _self_learning_artifact_type(
                body.get("artifactType")
                or (workspace.state or {}).get("artifactType")
            )
            _require_workspace_capacity(workspace, "candidateSets")
            _require_workspace_capacity(workspace, "modelTokens")
            if artifact_type in COMPLEX_ARTIFACT_TYPES:
                _require_workspace_capacity(workspace, "complexScenes")
            try:
                count = int(body.get("candidateCount") or 1)
            except (TypeError, ValueError) as exc:
                raise ValueError("Candidate count must be an integer") from exc
            if count not in {1, 2, 3, 4}:
                raise ValueError("Candidate count must be between 1 and 4")
            candidate_mode = "multiple" if count > 1 else "single"
            generation_reason = "explicit_self_learning_request"
            grounding = _student_generation_grounding(user, workspace, prompt)
            candidate_set = create_candidate_set(
                owner_id=user.id,
                dojo_id=workspace.dojo_id,
                module_index=workspace.module_index,
                thread_id=workspace.thread_id,
                kind=artifact_type,
                request_json={
                    "prompt": prompt,
                    "candidateCount": count,
                    "candidateMode": candidate_mode,
                    "generationReason": generation_reason,
                    "personal": True,
                },
                source_refs=grounding["sourceRefs"],
                self_workspace_id=workspace.id,
            )
            db.session.commit()
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="self.candidate.generate",
                idempotency_key=_unique_idempotency(user.id, "self-generate"),
                payload=_student_generation_payload(
                    grounding,
                    {
                        "candidateSetId": candidate_set.id,
                        "workspaceId": workspace.id,
                        "prompt": prompt,
                        "artifactType": artifact_type,
                        "candidateCount": count,
                        "candidateMode": candidate_mode,
                        "generationReason": generation_reason,
                        "personal": True,
                        "allowDegraded": bool(body.get("allowDegraded")),
                    },
                ),
                dojo_id=workspace.dojo_id,
                module_index=workspace.module_index,
                thread_id=workspace.thread_id,
                priority=120,
            )
            return _ok(
                {
                    "candidateSet": candidate_set_view(candidate_set),
                    "job": job_view(job),
                },
                202,
            )
        except (ScopeError, ValueError, OverflowError) as exc:
            db.session.rollback()
            return _error(
                exc,
                429
                if isinstance(exc, OverflowError)
                else 404
                if isinstance(exc, ScopeError)
                else 400,
                code="QUOTA_EXCEEDED"
                if isinstance(exc, OverflowError)
                else "INVALID_REQUEST",
            )


@teaching_namespace.route("/self-learning/workspaces/<string:workspace_id>/submit")
class SelfLearningSubmit(Resource):
    @authed_only
    def post(self, workspace_id):
        user = _current_user()
        try:
            workspace = _workspace_for_student(workspace_id, user, lock=True)
            artifact = artifact_for_user(str(_body().get("artifactId") or ""), user)
            if artifact.self_workspace_id != workspace.id:
                raise ScopeError("Artifact does not belong to this workspace")
            if workspace.dojo_id is None:
                return _error("A course-bound personal artifact is required", 409)
            key = (
                f"self-review:{workspace.id}:{artifact.id}:{artifact.current_revision}"
            )
            action = TeachingAgentActions.query.filter_by(idempotency_key=key).first()
            if action is None:
                action = TeachingAgentActions(
                    thread_id=workspace.thread_id,
                    actor_id=user.id,
                    action_type="review-self-artifact",
                    risk_level="R3",
                    target_type="self_workspace",
                    target_id=workspace.id,
                    status="AWAITING_APPROVAL",
                    idempotency_key=key,
                    request_json={
                        "artifactId": artifact.id,
                        "dojoId": workspace.dojo_id,
                        "expectedRevision": artifact.current_revision,
                    },
                )
                db.session.add(action)
            artifact.status = "COURSE_CANDIDATE"
            workspace.submitted_artifact_id = artifact.id
            workspace.status = "SUBMITTED"
            workspace.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok(
                {
                    "workspace": _workspace_view(workspace),
                    "artifact": artifact_view(artifact),
                    "action": _action_view(action),
                },
                202,
            )
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/runtime/launch")
class AgentRuntimeLaunch(Resource):
    @authed_only
    def post(self):
        user = _current_user()
        body = _body()
        role = str(body.get("role") or "student").lower()
        target = str(
            body.get("target") or ("/prep" if role == "teacher" else "/security-learn")
        )
        dojo_id = body.get("dojoId")
        module_index = body.get("moduleIndex")
        workspace_id = body.get("workspaceId")
        try:
            if role not in AGENT_RUNTIME_TARGETS or not AGENT_RUNTIME_TARGETS[
                role
            ].fullmatch(target):
                return _error("Unsupported preview target", 400, code="INVALID_TARGET")
            if role == "teacher":
                _require_teacher(user)
                if body.get("dojoId") is None:
                    return _error(
                        "Teacher preview sessions must be bound to a course",
                        400,
                        code="COURSE_SCOPE_REQUIRED",
                    )
            elif target.rstrip("/") == "/security-learn" and not body.get(
                "workspaceId"
            ):
                return _error(
                    "Student self-learning sessions require a personal workspace",
                    400,
                    code="WORKSPACE_SCOPE_REQUIRED",
                )
            elif role == "student" and target.startswith("/prep/"):
                artifact_id = target.rstrip("/").rsplit("/", 1)[-1]
                artifact = artifact_for_viewer(artifact_id, user)
                if artifact.owner_id != user.id and artifact.status != "PUBLISHED":
                    raise ScopeError("Artifact not found")
                dojo_id = artifact.dojo_id
                module_index = artifact.module_index
                workspace_id = artifact.self_workspace_id
            scope = build_scope(
                user,
                role=role,
                dojo_id=dojo_id,
                module_index=module_index,
                workspace_id=workspace_id,
            )
            token, expires = mint_launch_ticket(user, scope, target=target)
            query = urlencode({"ticket": token})
            return _ok(
                {
                    "launchUrl": f"{config.AGENT_RUNTIME_PUBLIC_ORIGIN}/api/integration/exchange?{query}",
                    "expires": _timestamp(expires),
                },
                201,
            )
        except (ScopeError, AgentRuntimeAuthError) as exc:
            return _error(exc, 403)


@teaching_namespace.route("/runtime/exchange")
class AgentRuntimeExchange(Resource):
    @bypass_csrf_protection
    def post(self):
        try:
            require_service_auth()
            token = str(_body().get("ticket") or "")
            user, scope, session_token, target = exchange_launch_ticket(token)
            return _ok(
                {
                    "sessionToken": session_token,
                    "expiresIn": config.AGENT_RUNTIME_SESSION_TTL_SECONDS,
                    "target": target,
                    "user": {"id": user.id, "name": user.name},
                    "scope": scope.as_dict(),
                }
            )
        except AgentRuntimeAuthError as exc:
            db.session.rollback()
            return _error(exc, 401, code="INVALID_TICKET")


@teaching_namespace.route("/runtime/introspect")
class AgentRuntimeIntrospect(Resource):
    @bypass_csrf_protection
    def post(self):
        try:
            require_service_auth()
            user, scope, session_id = verify_session_token(bearer_session_token())
            model_quota = {"limited": False, "available": True}
            if scope.role == "student" and scope.workspace_id:
                workspace = _service_scoped_workspace(user, scope)
                usage = _workspace_usage(workspace)
                limit = int((workspace.quota or {}).get("modelTokens", 0))
                used = int(usage.get("modelTokens", 0))
                model_quota = {
                    "limited": limit > 0,
                    "limit": limit,
                    "used": used,
                    "remaining": max(0, limit - used) if limit > 0 else None,
                    "available": limit <= 0 or used < limit,
                }
            return _ok(
                {
                    "active": True,
                    "sessionId": session_id,
                    "user": {"id": user.id, "name": user.name},
                    "scope": scope.as_dict(),
                    "modelQuota": model_quota,
                }
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            db.session.rollback()
            return _error(exc, 401, code="INVALID_SESSION")


@teaching_namespace.route("/runtime/usage")
class AgentRuntimeUsage(Resource):
    @bypass_csrf_protection
    def post(self):
        try:
            require_service_auth()
            user, scope, session_id = verify_session_token(bearer_session_token())
            assert_capability(
                scope,
                "agent:chat" if scope.role == "teacher" else "self-learning:chat",
            )
            body = _body()
            external_id = str(body.get("id") or "").strip()[:128]
            source = str(body.get("source") or "global-agent-runtime")[:80]
            provider = str(body.get("providerId") or "unknown")[:80]
            model = str(body.get("modelId") or "unknown")[:160]
            if not external_id:
                return _error("Usage id is required")
            raw_usage = (
                body.get("usage") if isinstance(body.get("usage"), dict) else body
            )
            usage = {
                key: max(0, int(raw_usage.get(key) or 0))
                for key in (
                    "inputTokens",
                    "outputTokens",
                    "cacheReadTokens",
                    "cacheCreationTokens",
                    "reasoningTokens",
                )
            }
            tokens = usage["inputTokens"] + usage["outputTokens"]
            request_hash = hashlib.sha256(
                f"{session_id}:{external_id}".encode("utf-8")
            ).hexdigest()
            if db.engine.dialect.name == "postgresql":
                db.session.execute(
                    text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                    {"key": (f"global-agent-usage:{request_hash}:{source[:80]}")},
                )
            existing = ModelInvocations.query.filter_by(
                request_hash=request_hash,
                route=f"global-agent-runtime:{source}"[:128],
            ).first()
            if existing:
                return _ok({"accepted": True, "deduplicated": True})
            workspace = None
            quota_exceeded = False
            if scope.role == "student":
                workspace = _service_scoped_workspace(user, scope, lock=True)
                limit = int((workspace.quota or {}).get("modelTokens", 0))
                if tokens and limit > 0:
                    used = int(_workspace_usage(workspace).get("modelTokens", 0))
                    quota_exceeded = used + tokens > limit
            invocation = ModelInvocations(
                owner_id=user.id,
                route=f"global-agent-runtime:{source}"[:128],
                provider=provider,
                actual_model=model,
                model_version=str(body.get("modelString") or model)[:80],
                parameters={
                    "source": source,
                    "role": scope.role,
                    "workspaceId": workspace.id if workspace else None,
                    "sessionId": session_id,
                    "kind": str(body.get("kind") or "llm")[:32],
                    "quotaExceeded": quota_exceeded,
                },
                usage=usage,
                request_hash=request_hash,
                status="SUCCEEDED",
                degraded=False,
            )
            db.session.add(invocation)
            db.session.commit()
            if quota_exceeded:
                return _error(
                    "Personal model token quota reached",
                    429,
                    code="QUOTA_EXCEEDED",
                )
            return _ok({"accepted": True, "invocationId": invocation.id}, 201)
        except (AgentRuntimeAuthError, ScopeError, OverflowError, ValueError) as exc:
            db.session.rollback()
            return _error(
                exc,
                429
                if isinstance(exc, OverflowError)
                else 401
                if isinstance(exc, AgentRuntimeAuthError)
                else 404
                if isinstance(exc, ScopeError)
                else 400,
                code=(
                    "QUOTA_EXCEEDED"
                    if isinstance(exc, OverflowError)
                    else "INVALID_SESSION"
                    if isinstance(exc, AgentRuntimeAuthError)
                    else "NOT_FOUND"
                    if isinstance(exc, ScopeError)
                    else "INVALID_REQUEST"
                ),
            )


@teaching_namespace.route("/runtime/jobs/<string:job_id>/material")
class AgentRuntimeJobMaterial(Resource):
    @bypass_csrf_protection
    def get(self, job_id):
        try:
            require_service_auth()
            job = TeachingJobs.query.filter_by(
                id=job_id, kind="material.analyze"
            ).first()
            if job is None or job.status not in {"RUNNING", "QUEUED"}:
                raise ScopeError("Material job not found")
            material = TeachingMaterials.query.filter_by(
                id=job.payload.get("materialId"),
                owner_id=job.owner_id,
            ).first()
            if material is None or material.storage_key != job.payload.get(
                "storageKey"
            ):
                raise ScopeError("Material job not found")
            try:
                source = _material_source_path(material)
            except ValueError as exc:
                raise ScopeError("Material file not found") from exc
            return send_file(
                source,
                mimetype=material.mime_type,
                as_attachment=True,
                download_name=material.filename,
                conditional=False,
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


def _service_session(capability):
    require_service_auth()
    user, scope, session_id = verify_session_token(bearer_session_token())
    assert_capability(scope, capability)
    return user, scope, session_id


def _service_lesson_session():
    require_service_auth()
    user, scope, session_id = verify_session_token(bearer_session_token())
    assert_capability(
        scope,
        "artifact:write" if scope.role == "teacher" else "artifact:personal",
    )
    return user, scope, session_id


def _lesson_payload_size(lesson):
    if not isinstance(lesson, dict):
        raise ValueError("Lesson must be an object")
    artifacts = lesson.get("artifacts")
    if not isinstance(artifacts, list):
        raise ValueError("Lesson artifacts must be an array")
    if len(artifacts) > MAX_LESSON_ARTIFACTS:
        raise LessonPayloadTooLarge("Lesson contains more than 200 artifacts")
    size = len(
        json.dumps(
            lesson,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    )
    if size > MAX_LESSON_BYTES:
        raise LessonPayloadTooLarge("Lesson payload exceeds 8 MiB")
    return size


def _lesson_artifact(
    artifact_id,
    user,
    scope,
    *,
    allow_submitted_review=False,
    allow_published_view=False,
):
    may_view = (
        allow_submitted_review and scope.role == "teacher"
    ) or (
        allow_published_view and scope.role == "student" and not scope.workspace_id
    )
    artifact = (
        artifact_for_viewer(artifact_id, user)
        if may_view
        else artifact_for_user(artifact_id, user)
    )
    if scope.workspace_id and artifact.self_workspace_id != scope.workspace_id:
        raise ScopeError("Lesson not found")
    if scope.dojo_id is not None and artifact.dojo_id != scope.dojo_id:
        raise ScopeError("Lesson not found")
    return artifact


def _lesson_summary(artifact, *, student_safe=False):
    content = (
        artifact_view(artifact, student_safe=student_safe).get("revision") or {}
    ).get("content", {})
    lesson = (
        content.get("lesson") if isinstance(content.get("lesson"), dict) else content
    )
    return {
        "id": artifact.id,
        "title": artifact.title,
        "artifactCount": len(lesson.get("artifacts", [])),
        "updatedAt": int(artifact.updated.timestamp() * 1000),
    }


def _lesson_payload(artifact, *, student_safe=False):
    content = artifact_view(artifact, student_safe=student_safe)["revision"][
        "content"
    ]
    lesson = (
        content.get("lesson") if isinstance(content.get("lesson"), dict) else content
    )
    return {
        **lesson,
        "id": artifact.id,
        "__aiseceduRevision": artifact.current_revision,
    }


@teaching_namespace.route("/runtime/lessons")
class AgentRuntimeLessons(Resource):
    @bypass_csrf_protection
    def get(self):
        try:
            user, scope, _ = _service_lesson_session()
            student_safe = scope.role == "student" and not scope.workspace_id
            if scope.role == "student" and not scope.workspace_id:
                query = TeachingArtifacts.query.filter_by(
                    dojo_id=scope.dojo_id,
                    status="PUBLISHED",
                    self_workspace_id=None,
                )
            else:
                query = TeachingArtifacts.query.filter_by(owner_id=user.id)
            if scope.workspace_id:
                query = query.filter_by(self_workspace_id=scope.workspace_id)
            elif scope.dojo_id is not None:
                query = query.filter_by(dojo_id=scope.dojo_id)
            rows = (
                query.filter(TeachingArtifacts.status != "ARCHIVED")
                .order_by(TeachingArtifacts.updated.desc())
                .all()
            )
            rows = [
                row
                for row in rows
                if isinstance(
                    _lesson_payload(row, student_safe=student_safe).get("artifacts"),
                    list,
                )
            ]
            return _ok(
                {
                    "lessons": [
                        _lesson_summary(row, student_safe=student_safe)
                        for row in rows
                    ]
                }
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 401)

    @bypass_csrf_protection
    def post(self):
        try:
            user, scope, _ = _service_lesson_session()
            body = _body()
            lesson = (
                body.get("lesson") if isinstance(body.get("lesson"), dict) else body
            )
            lesson_size = _lesson_payload_size(lesson)
            title = str(lesson.get("title") or "").strip()
            if not title:
                return _error("Lesson title is required")
            if scope.role == "student":
                workspace = _service_scoped_workspace(user, scope, lock=True)
                _require_workspace_capacity(workspace, "artifacts")
                _require_workspace_capacity(workspace, "storageBytes", lesson_size)
            now_ms = int(datetime.datetime.utcnow().timestamp() * 1000)
            artifact = TeachingArtifacts(
                owner_id=user.id,
                dojo_id=scope.dojo_id,
                module_index=scope.module_index,
                self_workspace_id=scope.workspace_id,
                artifact_type="interactive-lesson",
                title=title[:240],
                status="PERSONAL_DRAFT" if scope.role == "student" else "DRAFT",
                current_revision=1,
            )
            db.session.add(artifact)
            db.session.flush()
            normalized = {
                **lesson,
                "id": artifact.id,
                "createdAt": int(lesson.get("createdAt") or now_ms),
                "updatedAt": now_ms,
                "__aiseceduRevision": 1,
            }
            revision = TeachingArtifactRevisions(
                artifact_id=artifact.id,
                revision=1,
                content=normalized,
                content_hash=content_hash(normalized),
                source_refs=[],
                validation={"status": "PENDING"},
                created_by=user.id,
                instruction="创建课件",
            )
            db.session.add(revision)
            db.session.commit()
            return _ok({"id": artifact.id, "lesson": normalized}, 201)
        except (
            AgentRuntimeAuthError,
            ScopeError,
            ValueError,
            OverflowError,
            LessonPayloadTooLarge,
        ) as exc:
            db.session.rollback()
            return _error(
                exc,
                413
                if isinstance(exc, LessonPayloadTooLarge)
                else 429
                if isinstance(exc, OverflowError)
                else 401
                if isinstance(exc, (AgentRuntimeAuthError, ScopeError))
                else 400,
                code=(
                    "PAYLOAD_TOO_LARGE"
                    if isinstance(exc, LessonPayloadTooLarge)
                    else "QUOTA_EXCEEDED"
                    if isinstance(exc, OverflowError)
                    else "INVALID_REQUEST"
                ),
            )


@teaching_namespace.route("/runtime/lessons/<string:artifact_id>")
class AgentRuntimeLesson(Resource):
    @bypass_csrf_protection
    def get(self, artifact_id):
        try:
            user, scope, _ = _service_lesson_session()
            artifact = _lesson_artifact(
                artifact_id,
                user,
                scope,
                allow_submitted_review=True,
                allow_published_view=True,
            )
            lesson = _lesson_payload(
                artifact,
                student_safe=scope.role == "student" and not scope.workspace_id,
            )
            if not isinstance(lesson.get("artifacts"), list):
                return _error(
                    "Lesson is still being materialized", 409, code="NOT_READY"
                )
            return _ok({"lesson": lesson})
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @bypass_csrf_protection
    def put(self, artifact_id):
        try:
            body = _body()
            user, scope, _ = _service_lesson_session()
            artifact = _lesson_artifact(artifact_id, user, scope)
            lesson = (
                body.get("lesson") if isinstance(body.get("lesson"), dict) else body
            )
            lesson_size = _lesson_payload_size(lesson)
            if scope.role == "student":
                workspace = _service_scoped_workspace(user, scope, lock=True)
                _require_workspace_capacity(workspace, "storageBytes", lesson_size)
            expected = int(
                lesson.get("__aiseceduRevision") or body.get("expectedRevision") or 0
            )
            if expected != artifact.current_revision:
                return _error(
                    f"Lesson is now at revision {artifact.current_revision}",
                    409,
                    code="REVISION_CONFLICT",
                )
            normalized_lesson = {
                **lesson,
                "id": artifact.id,
                "updatedAt": int(datetime.datetime.utcnow().timestamp() * 1000),
                "__aiseceduRevision": expected + 1,
            }
            current_content = artifact_view(artifact)["revision"]["content"]
            if isinstance(current_content.get("lesson"), dict):
                stored_lesson = dict(normalized_lesson)
                stored_lesson.pop("__aiseceduRevision", None)
                normalized = {**current_content, "lesson": stored_lesson}
            else:
                normalized = normalized_lesson
            revision = create_revision(
                artifact,
                user,
                expected_revision=expected,
                instruction=str(body.get("instruction") or "编辑教学内容")[:16000],
                content=normalized,
            )
            artifact.title = str(normalized_lesson.get("title") or artifact.title)[:240]
            db.session.commit()
            return _ok({"lesson": normalized_lesson, "revisionId": revision.id})
        except RevisionConflict as exc:
            db.session.rollback()
            return _error(exc, 409, code="REVISION_CONFLICT")
        except (
            AgentRuntimeAuthError,
            ScopeError,
            ValueError,
            OverflowError,
            LessonPayloadTooLarge,
        ) as exc:
            db.session.rollback()
            return _error(
                exc,
                413
                if isinstance(exc, LessonPayloadTooLarge)
                else 429
                if isinstance(exc, OverflowError)
                else 404
                if isinstance(exc, (AgentRuntimeAuthError, ScopeError))
                else 400,
                code=(
                    "PAYLOAD_TOO_LARGE"
                    if isinstance(exc, LessonPayloadTooLarge)
                    else "QUOTA_EXCEEDED"
                    if isinstance(exc, OverflowError)
                    else "NOT_FOUND"
                ),
            )

    @bypass_csrf_protection
    def delete(self, artifact_id):
        try:
            user, scope, _ = _service_lesson_session()
            artifact = _lesson_artifact(artifact_id, user, scope)
            if artifact.status in {"PUBLISHED", "VALIDATING"}:
                return _error("Published or validating lessons cannot be deleted", 409)
            artifact.status = "ARCHIVED"
            artifact.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok({"deleted": True})
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/runtime/events")
class AgentRuntimeEvents(Resource):
    @bypass_csrf_protection
    def post(self):
        try:
            user, scope, session_id = _service_session("evidence:append")
            body = _body()
            workspace = _workspace_for_student(scope.workspace_id, user, lock=True)
            event_id = str(body.get("id") or uuid.uuid4().hex)[:128]
            event_type = str(body.get("type") or "interaction")[:80]
            event = {
                "id": event_id,
                "type": event_type,
                "occurred": body.get("occurred")
                or _timestamp(datetime.datetime.utcnow()),
                "payload": scrub_payload(
                    body.get("payload") if isinstance(body.get("payload"), dict) else {}
                ),
                "sessionId": session_id,
            }
            if (
                len(
                    json.dumps(
                        event["payload"],
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    ).encode("utf-8")
                )
                > MAX_SESSION_EVENT_BYTES
            ):
                return _error("Evidence payload exceeds 64 KiB", 413)
            state = dict(workspace.state or {})
            events = list(state.get("evidence") or [])
            if any(item.get("id") == event["id"] for item in events):
                return _ok({"accepted": True, "deduplicated": True})
            events.append(event)
            state["evidence"] = events[-1000:]
            attempt_id = state.get("attemptId")
            if attempt_id:
                attempt = LearningAttempts.query.filter_by(
                    id=attempt_id,
                    user_id=user.id,
                ).first()
                if (
                    attempt is not None
                    and (
                        workspace.dojo_id is None
                        or attempt.dojo_id == workspace.dojo_id
                    )
                    and (
                        workspace.module_index is None
                        or attempt.module_index == workspace.module_index
                    )
                ):
                    append_evidence(
                        attempt,
                        f"agent_runtime.{event_type}"[:80],
                        {
                            **event["payload"],
                            "eventId": event_id,
                            "workspaceId": workspace.id,
                            "clientOccurred": event["occurred"],
                            "engagementOnly": True,
                        },
                        source="GLOBAL_AGENT",
                        trust_level=1,
                    )
            workspace.state = state
            workspace.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok({"accepted": True}, 201)
        except (AgentRuntimeAuthError, ScopeError) as exc:
            db.session.rollback()
            return _error(exc, 401)


@teaching_namespace.route("/runtime/classrooms/<string:classroom_id>")
class AgentRuntimeClassroom(Resource):
    """Production classroom storage owned by 玄甲, not container files."""

    @bypass_csrf_protection
    def get(self, classroom_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,48}", classroom_id):
            return _error("Invalid classroom id")
        try:
            user, scope, _ = _service_session("session:view")
            if classroom_id.startswith("study_"):
                if scope.role != "student" or not scope.workspace_id:
                    raise ScopeError("Classroom not found")
                artifact = _lesson_artifact(classroom_id[6:], user, scope)
                if artifact.self_workspace_id != scope.workspace_id:
                    raise ScopeError("Classroom not found")
                rendered = _render_classroom(artifact, classroom_id)
                return _ok(
                    {
                        "classroom": {
                            "id": classroom_id,
                            **rendered,
                            "artifactId": artifact.id,
                            "artifactRevision": artifact.current_revision,
                            "personalStudy": True,
                        }
                    }
                )
            session = TeachingSessions.query.filter_by(id=classroom_id).first()
            if session is None:
                raise ScopeError("Classroom not found")
            if scope.role == "teacher":
                if not owner_or_teacher(user, session.owner_id, session.dojo_id):
                    raise ScopeError("Classroom not found")
            else:
                enrolled = DojoUsers.query.filter_by(
                    dojo_id=session.dojo_id,
                    user_id=user.id,
                ).first()
                if enrolled is None or session.status not in {"LIVE", "ENDED"}:
                    raise ScopeError("Classroom not found")
            if scope.dojo_id is not None and session.dojo_id != scope.dojo_id:
                raise ScopeError("Classroom not found")
            if (
                scope.module_index is not None
                and session.module_index != scope.module_index
            ):
                raise ScopeError("Classroom not found")
            return _ok(
                {
                    "classroom": {
                        "id": session.id,
                        **(session.state or {}),
                    }
                }
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (ValueError, requests.RequestException) as exc:
            return _error(exc, 502, code="AGENT_RUNTIME_UNAVAILABLE")

    @bypass_csrf_protection
    def put(self, classroom_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,48}", classroom_id):
            return _error("Invalid classroom id")
        try:
            user, scope, _ = _service_session("session:control")
            if scope.role != "teacher" or scope.dojo_id is None:
                raise ScopeError("A course-bound teacher session is required")
            body = _body()
            stage = body.get("stage")
            scenes = body.get("scenes")
            if not isinstance(stage, dict) or not isinstance(scenes, list):
                return _error("Stage and scenes are required")
            if len(scenes) > MAX_CLASSROOM_SCENES:
                return _error("Classroom contains more than 200 scenes", 413)
            if _json_size({"stage": stage, "scenes": scenes}) > MAX_CLASSROOM_BYTES:
                return _error("Classroom payload exceeds 8 MiB", 413)
            session = TeachingSessions.query.filter_by(id=classroom_id).first()
            if session is not None and session.owner_id != user.id:
                raise ScopeError("Classroom not found")
            if session is None:
                session = TeachingSessions(
                    id=classroom_id,
                    owner_id=user.id,
                    dojo_id=scope.dojo_id,
                    module_index=scope.module_index,
                    title=str(stage.get("name") or "互动课堂")[:240],
                    status="READY",
                    state={},
                )
                db.session.add(session)
            elif session.dojo_id != scope.dojo_id or (
                scope.module_index is not None
                and session.module_index != scope.module_index
            ):
                raise ScopeError("Classroom not found")
            created_at = (
                body.get("createdAt")
                or (session.state or {}).get("createdAt")
                or _timestamp(datetime.datetime.utcnow())
            )
            session.title = str(stage.get("name") or session.title)[:240]
            session.state = {
                "stage": stage,
                "scenes": scenes,
                "createdAt": created_at,
                "renderer": "agent-runtime-stage",
            }
            session.updated = datetime.datetime.utcnow()
            db.session.commit()
            return _ok(
                {
                    "classroom": {
                        "id": session.id,
                        **session.state,
                    }
                }
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")


def _service_scoped_workspace(user, scope, *, lock=False):
    if scope.role != "student" or not scope.workspace_id:
        raise ScopeError("A student self-learning scope is required")
    query = SelfLearningWorkspaces.query.filter_by(
        id=scope.workspace_id,
        student_id=user.id,
    )
    if lock:
        query = query.with_for_update()
    workspace = query.first()
    if workspace is None:
        raise ScopeError("Self-learning workspace not found")
    return workspace


def _service_scoped_candidate_set(candidate_set_id, user, scope):
    item = TeachingCandidateSets.query.filter_by(
        id=candidate_set_id,
        owner_id=user.id,
    ).first()
    if item is None:
        raise ScopeError("Candidate set not found")
    if scope.workspace_id and item.self_workspace_id != scope.workspace_id:
        raise ScopeError("Candidate set not found")
    if scope.dojo_id is not None and item.dojo_id != scope.dojo_id:
        raise ScopeError("Candidate set not found")
    return item


@teaching_namespace.route("/runtime/client/self-workspace")
class AgentRuntimeClientSelfWorkspace(Resource):
    @bypass_csrf_protection
    def get(self):
        try:
            user, scope, _ = _service_session("self-learning:write")
            workspace = _service_scoped_workspace(user, scope)
            return _ok(
                {
                    "workspace": _workspace_view(workspace, include_usage=True),
                    "activity": _workspace_activity_view(workspace),
                }
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 401, code="INVALID_SESSION")


@teaching_namespace.route("/runtime/client/self-workspace/generate")
class AgentRuntimeClientSelfGenerate(Resource):
    @bypass_csrf_protection
    def post(self):
        try:
            user, scope, _ = _service_session("self-learning:write")
            workspace = _service_scoped_workspace(user, scope, lock=True)
            body = _body()
            prompt = str(body.get("prompt") or workspace.goal).strip()
            if not prompt or len(prompt) > MAX_MESSAGE_CHARS:
                return _error(
                    "A learning prompt of at most 16000 characters is required"
                )
            artifact_type = _self_learning_artifact_type(
                body.get("artifactType")
                or (workspace.state or {}).get("artifactType")
            )
            _require_workspace_capacity(workspace, "candidateSets")
            _require_workspace_capacity(workspace, "modelTokens")
            if artifact_type in COMPLEX_ARTIFACT_TYPES:
                _require_workspace_capacity(workspace, "complexScenes")
            try:
                count = int(body.get("candidateCount") or 1)
            except (TypeError, ValueError) as exc:
                raise ValueError("Candidate count must be an integer") from exc
            if count not in {1, 2, 3, 4}:
                raise ValueError("Candidate count must be between 1 and 4")
            candidate_mode = "multiple" if count > 1 else "single"
            generation_reason = "explicit_self_learning_request"
            grounding = _student_generation_grounding(user, workspace, prompt)
            candidate_set = create_candidate_set(
                owner_id=user.id,
                dojo_id=workspace.dojo_id,
                module_index=workspace.module_index,
                thread_id=workspace.thread_id,
                kind=artifact_type,
                request_json={
                    "prompt": prompt,
                    "candidateCount": count,
                    "candidateMode": candidate_mode,
                    "generationReason": generation_reason,
                    "personal": True,
                },
                source_refs=grounding["sourceRefs"],
                self_workspace_id=workspace.id,
            )
            db.session.commit()
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="self.candidate.generate",
                idempotency_key=_unique_idempotency(
                    user.id, "global-agent-self-generate"
                ),
                payload=_student_generation_payload(
                    grounding,
                    {
                        "candidateSetId": candidate_set.id,
                        "workspaceId": workspace.id,
                        "prompt": prompt,
                        "artifactType": artifact_type,
                        "candidateCount": count,
                        "candidateMode": candidate_mode,
                        "generationReason": generation_reason,
                        "personal": True,
                        "securitySpecialization": True,
                        "allowDegraded": bool(body.get("allowDegraded")),
                    },
                ),
                dojo_id=workspace.dojo_id,
                module_index=workspace.module_index,
                thread_id=workspace.thread_id,
                priority=120,
            )
            return _ok(
                {
                    "candidateSet": candidate_set_view(candidate_set),
                    "job": job_view(job),
                },
                202,
            )
        except (AgentRuntimeAuthError, ScopeError, ValueError, OverflowError) as exc:
            db.session.rollback()
            return _error(
                exc,
                429
                if isinstance(exc, OverflowError)
                else 401
                if isinstance(exc, AgentRuntimeAuthError)
                else 400,
                code="QUOTA_EXCEEDED"
                if isinstance(exc, OverflowError)
                else "INVALID_REQUEST",
            )


@teaching_namespace.route("/runtime/client/jobs/<string:job_id>")
class AgentRuntimeClientJob(Resource):
    @bypass_csrf_protection
    def get(self, job_id):
        try:
            user, scope, _ = _service_session("self-learning:write")
            job = TeachingJobs.query.filter_by(id=job_id, owner_id=user.id).first()
            if job is None:
                raise ScopeError("Job not found")
            if scope.workspace_id and (job.payload or {}).get("workspaceId") not in {
                scope.workspace_id,
            }:
                raise ScopeError("Job not found")
            return _ok({"job": job_view(job), "events": job_events_view(job.id)})
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @bypass_csrf_protection
    def delete(self, job_id):
        try:
            user, scope, _ = _service_session("self-learning:write")
            job = TeachingJobs.query.filter_by(id=job_id, owner_id=user.id).first()
            if job is None:
                raise ScopeError("Job not found")
            if (
                scope.workspace_id
                and (job.payload or {}).get("workspaceId") != scope.workspace_id
            ):
                raise ScopeError("Job not found")
            cancel_job(job, user.id)
            return _ok({"job": job_view(job)})
        except (AgentRuntimeAuthError, ScopeError, PermissionError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route("/runtime/client/candidate-sets/<string:candidate_set_id>")
class AgentRuntimeClientCandidateSet(Resource):
    @bypass_csrf_protection
    def get(self, candidate_set_id):
        try:
            user, scope, _ = _service_session("self-learning:write")
            item = _service_scoped_candidate_set(candidate_set_id, user, scope)
            return _ok({"candidateSet": candidate_set_view(item, include_content=True)})
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route(
    "/runtime/client/candidate-sets/<string:candidate_set_id>/derive"
)
class AgentRuntimeClientCandidateDerive(Resource):
    @bypass_csrf_protection
    def post(self, candidate_set_id):
        try:
            user, scope, _ = _service_session("self-learning:write")
            workspace = _service_scoped_workspace(user, scope, lock=True)
            source = _service_scoped_candidate_set(candidate_set_id, user, scope)
            body = _body()
            instruction = str(body.get("instruction") or "").strip()
            if not instruction or len(instruction) > MAX_MESSAGE_CHARS:
                return _error(
                    "A derivation instruction of at most 16000 characters is required"
                )
            candidate_ids = list(body.get("candidateIds") or [])[:4]
            rows = TeachingArtifactCandidates.query.filter(
                TeachingArtifactCandidates.candidate_set_id == source.id,
                TeachingArtifactCandidates.id.in_(candidate_ids),
            ).all()
            if not rows:
                return _error("Select at least one source candidate")
            _require_workspace_capacity(workspace, "candidateSets")
            _require_workspace_capacity(workspace, "modelTokens")
            artifact_type = _self_learning_artifact_type(source.kind)
            if artifact_type in COMPLEX_ARTIFACT_TYPES:
                _require_workspace_capacity(workspace, "complexScenes")
            count = max(2, min(4, int(body.get("candidateCount") or 3)))
            grounding = _student_generation_grounding(user, workspace, instruction)
            candidate_refs = [
                {
                    "type": "candidate",
                    "id": row.id,
                    "contentHash": content_hash(row.content),
                }
                for row in rows
            ]
            derived = create_candidate_set(
                owner_id=user.id,
                dojo_id=workspace.dojo_id,
                module_index=workspace.module_index,
                thread_id=workspace.thread_id,
                kind=artifact_type,
                request_json={
                    "instruction": instruction,
                    "parentSetId": source.id,
                    "personal": True,
                },
                source_refs=[*candidate_refs, *grounding["sourceRefs"]],
                self_workspace_id=workspace.id,
            )
            db.session.commit()
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="self.candidate.generate",
                idempotency_key=_unique_idempotency(
                    user.id, "global-agent-self-derive"
                ),
                payload=_student_generation_payload(
                    grounding,
                    {
                        "candidateSetId": derived.id,
                        "workspaceId": workspace.id,
                        "prompt": instruction,
                        "artifactType": artifact_type,
                        "candidateCount": count,
                        "sourceCandidates": [
                            {"id": row.id, "title": row.title, "content": row.content}
                            for row in rows
                        ],
                        "sourceRefs": [*candidate_refs, *grounding["sourceRefs"]],
                        "personal": True,
                        "allowDegraded": bool(body.get("allowDegraded")),
                    },
                ),
                dojo_id=workspace.dojo_id,
                module_index=workspace.module_index,
                thread_id=workspace.thread_id,
                priority=120,
            )
            return _ok(
                {"candidateSet": candidate_set_view(derived), "job": job_view(job)}, 202
            )
        except (AgentRuntimeAuthError, ScopeError, ValueError, OverflowError) as exc:
            db.session.rollback()
            return _error(
                exc,
                429
                if isinstance(exc, OverflowError)
                else 404
                if isinstance(exc, ScopeError)
                else 400,
                code="QUOTA_EXCEEDED"
                if isinstance(exc, OverflowError)
                else "INVALID_REQUEST",
            )


@teaching_namespace.route("/runtime/client/candidates/<string:candidate_id>/select")
class AgentRuntimeClientCandidateSelect(Resource):
    @bypass_csrf_protection
    def post(self, candidate_id):
        try:
            user, scope, _ = _service_session("self-learning:write")
            candidate = TeachingArtifactCandidates.query.filter_by(
                id=candidate_id
            ).first()
            if candidate is None:
                raise ScopeError("Candidate not found")
            candidate_set = _service_scoped_candidate_set(
                candidate.candidate_set_id,
                user,
                scope,
            )
            selected, candidate_set = select_candidate(candidate.id, user)
            return _ok(
                {
                    "candidateId": selected.id,
                    "candidateSet": candidate_set_view(candidate_set),
                }
            )
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


@teaching_namespace.route(
    "/runtime/client/candidates/<string:candidate_id>/materialize"
)
class AgentRuntimeClientCandidateMaterialize(Resource):
    @bypass_csrf_protection
    def post(self, candidate_id):
        try:
            user, scope, _ = _service_session("artifact:personal")
            candidate = TeachingArtifactCandidates.query.filter_by(
                id=candidate_id
            ).first()
            if candidate is None:
                raise ScopeError("Candidate not found")
            _service_scoped_candidate_set(candidate.candidate_set_id, user, scope)
            workspace = _service_scoped_workspace(user, scope, lock=True)
            _require_workspace_capacity(workspace, "artifacts")
            _require_workspace_capacity(workspace, "storageBytes")
            artifact, revision = materialize_candidate(
                candidate.id,
                user,
                title=_body().get("title"),
            )
            job, created = enqueue_job(
                owner_id=user.id,
                kind="artifact.materialize",
                idempotency_key=f"self-candidate-materialize:{user.id}:{candidate.id}",
                payload={
                    "artifactId": artifact.id,
                    "workspaceId": scope.workspace_id,
                    "expectedRevision": revision.revision,
                    "artifactType": artifact.artifact_type,
                    "title": artifact.title,
                    "plan": revision.content,
                    "requestPrompt": candidate_request_prompt(candidate_set),
                    "allowDegraded": bool(_body().get("allowDegraded")),
                },
                dojo_id=artifact.dojo_id,
                module_index=artifact.module_index,
                thread_id=candidate.candidate_set.thread_id,
                priority=110,
            )
            artifact.status = "GENERATING"
            db.session.commit()
            return _ok(
                {
                    "artifact": artifact_view(artifact),
                    "job": job_view(job),
                    "created": created,
                },
                202,
            )
        except (AgentRuntimeAuthError, ScopeError, OverflowError) as exc:
            db.session.rollback()
            return _error(
                exc,
                429 if isinstance(exc, OverflowError) else 404,
                code="QUOTA_EXCEEDED"
                if isinstance(exc, OverflowError)
                else "NOT_FOUND",
            )


@teaching_namespace.route("/runtime/client/artifacts/<string:artifact_id>")
class AgentRuntimeClientArtifact(Resource):
    @bypass_csrf_protection
    def get(self, artifact_id):
        try:
            user, scope, _ = _service_session("artifact:personal")
            artifact = TeachingArtifacts.query.filter_by(
                id=artifact_id,
                owner_id=user.id,
                self_workspace_id=scope.workspace_id,
            ).first()
            if artifact is None:
                raise ScopeError("Artifact not found")
            return _ok({"artifact": artifact_view(artifact)})
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @bypass_csrf_protection
    def post(self, artifact_id):
        try:
            user, scope, _ = _service_session("artifact:personal")
            workspace = _service_scoped_workspace(user, scope, lock=True)
            artifact = TeachingArtifacts.query.filter_by(
                id=artifact_id,
                owner_id=user.id,
                self_workspace_id=workspace.id,
            ).first()
            if artifact is None:
                raise ScopeError("Artifact not found")
            body = _body()
            instruction = str(body.get("instruction") or "").strip()
            if not instruction or len(instruction) > MAX_MESSAGE_CHARS:
                return _error(
                    "A revision instruction of at most 16000 characters is required"
                )
            expected = int(body.get("expectedRevision") or artifact.current_revision)
            if expected != artifact.current_revision:
                return _error(
                    f"Artifact is now at revision {artifact.current_revision}",
                    409,
                    code="REVISION_CONFLICT",
                )
            _require_workspace_capacity(workspace, "modelTokens")
            _require_workspace_capacity(workspace, "storageBytes")
            job, _ = enqueue_job(
                owner_id=user.id,
                kind="artifact.revise",
                idempotency_key=_unique_idempotency(
                    user.id, "global-agent-self-revise"
                ),
                payload={
                    "artifactId": artifact.id,
                    "workspaceId": workspace.id,
                    "expectedRevision": expected,
                    "instruction": instruction,
                    "currentContent": artifact_view(artifact)["revision"]["content"],
                    "artifactType": artifact.artifact_type,
                    "allowDegraded": bool(body.get("allowDegraded")),
                },
                dojo_id=artifact.dojo_id,
                module_index=artifact.module_index,
                thread_id=workspace.thread_id,
                priority=115,
            )
            return _ok({"job": job_view(job)}, 202)
        except (AgentRuntimeAuthError, ScopeError, OverflowError, ValueError) as exc:
            db.session.rollback()
            return _error(
                exc,
                429
                if isinstance(exc, OverflowError)
                else 404
                if isinstance(exc, ScopeError)
                else 400,
                code="QUOTA_EXCEEDED"
                if isinstance(exc, OverflowError)
                else "INVALID_REQUEST",
            )


@teaching_namespace.route("/runtime/client/self-workspace/submit")
class AgentRuntimeClientSelfSubmit(Resource):
    @bypass_csrf_protection
    def post(self):
        try:
            user, scope, _ = _service_session("artifact:personal")
            workspace = _service_scoped_workspace(user, scope, lock=True)
            artifact = TeachingArtifacts.query.filter_by(
                id=_body().get("artifactId"),
                owner_id=user.id,
                self_workspace_id=workspace.id,
            ).first()
            if artifact is None or workspace.dojo_id is None:
                raise ScopeError("A course-bound personal artifact is required")
            key = (
                f"self-review:{workspace.id}:{artifact.id}:{artifact.current_revision}"
            )
            action = TeachingAgentActions.query.filter_by(idempotency_key=key).first()
            if action is None:
                action = TeachingAgentActions(
                    thread_id=workspace.thread_id,
                    actor_id=user.id,
                    action_type="review-self-artifact",
                    risk_level="R3",
                    target_type="self_workspace",
                    target_id=workspace.id,
                    status="AWAITING_APPROVAL",
                    idempotency_key=key,
                    request_json={
                        "artifactId": artifact.id,
                        "dojoId": workspace.dojo_id,
                        "expectedRevision": artifact.current_revision,
                    },
                )
                db.session.add(action)
            workspace.submitted_artifact_id = artifact.id
            workspace.status = "SUBMITTED"
            artifact.status = "COURSE_CANDIDATE"
            db.session.commit()
            return _ok({"actionId": action.id, "status": action.status}, 202)
        except (AgentRuntimeAuthError, ScopeError) as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")

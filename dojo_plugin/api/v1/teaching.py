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
import time
import unicodedata
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
from CTFd.utils import get_config
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ... import config
from ...runtime_profiles import RUNTIME_PROFILES
from ...learning.legacy_runtime import catalog_icon, is_runtime_reference, runtime_reference_matches, runtime_url
from ...agent_runtime.conversation import (
    HARNESS_VERSION, ConversationConflict, prepare_turn_submission,
    submission_fingerprint, pending_turns, unreferenced_attachment_refs,
)
from ...agent_runtime.session_events import (
    project_session_events, replay_session_messages, session_history_origin,
    session_history_replayable,
)
from ...agent_runtime.approval_journal import (
    ApprovalJournalError, action_request, decide as decide_approval,
    message_approval_metadata, proposal_operation, proposal_request,
    record_execution, recorded_decision, request_reference, require_approved,
)
from ...agent_runtime.commands import action_execution, admit_action, admit_teacher_tool
from ...agent_runtime.approved_actions import ApprovedActionError, apply_action, prepare_action
from ...coursework_observation import assignment_agent_observation
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
    TeachingAgentEventOutbox,
    TeachingAgentMessages,
    TeachingAgentSessionEvents,
    TeachingAgentThreads,
    TeachingAssignments,
    TeachingArtifactCandidates,
    TeachingArtifactRevisions,
    TeachingArtifacts,
    TeachingCandidateSets,
    TeachingGenerationBatchItems,
    TeachingGenerationBatches,
    TeachingJobEvents,
    TeachingJobs,
    TeachingMaterialChunks,
    TeachingMaterialRevisions,
    TeachingMaterials,
    TeachingSessionEvents,
    TeachingSessions,
)
from ...agent_runtime.artifacts import (
    PERSONAL_REVIEWABLE_ARTIFACT_STATUSES,
    RevisionConflict,
    add_card,
    artifact_capabilities,
    artifact_for_user,
    artifact_for_viewer,
    artifact_revision_source_issue,
    artifact_view,
    candidate_request_prompt,
    candidate_set_view,
    content_hash,
    create_candidate_set,
    create_revision,
    current_artifact_revision,
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
from ...agent_runtime.skills import (
    builtin_catalog,
    create_skill,
    delete_skill,
    import_builtin,
    list_skills,
    owned_skill,
    parse_skill_text,
    skill_invocation_from_markdown,
    skill_summaries,
    skill_view,
    update_skill,
)
from ...agent_runtime.local_extract import locally_extractable
from ...agent_runtime.generation_refinement import (
    generation_refinement_prompt,
    generation_refinement_request,
)
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
    singular_material_reference_requested,
)
from ...agent_runtime.model_journal import ModelJournalError, record_model_event
from ...agent_runtime.project_collection import project_collection_view
from ...agent_runtime.reliability import public_recovery
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
    "learning-flow",
    "debate",
    "attack-defense-scene",
    "classroom-scenario",
    "simulation",
}
COURSEWARE_EXCLUDED_ARTIFACT_TYPES = (
    QUESTION_ARTIFACT_TYPES | COURSE_DEMO_ARTIFACT_TYPES | {"debate"}
)
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
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "text/",
    "image/",
)
ALLOWED_MATERIAL_SUFFIXES = {
    ".doc",
    ".docx",
    ".gif",
    ".bmp",
    ".jpeg",
    ".jpg",
    ".md",
    ".markdown",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".txt",
    ".webp",
    ".xls",
    ".xlsx",
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


def _lock_agent_tool_request(idempotency_key):
    """Serialize one tool key before checking or causing any side effects."""
    if db.engine.dialect.name != "postgresql":
        return True
    lock_key = int.from_bytes(
        hashlib.sha256(f"agent-tool:{idempotency_key}".encode()).digest()[:8],
        "big",
        signed=True,
    )
    return bool(db.session.execute(
        text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
        {"lock_key": lock_key},
    ).scalar())


def _agent_tool_request_fingerprint(thread_id, tool, arguments, generation_plan, body):
    raw_selection = body.get("generationSelection")
    selection = (
        {
            "sourceMessageId": str(raw_selection.get("sourceMessageId") or ""),
            "optionId": str(raw_selection.get("optionId") or ""),
        }
        if isinstance(raw_selection, dict)
        else None
    )
    request_identity = {
        "threadId": thread_id,
        "tool": tool,
        "arguments": arguments,
        "generationPlan": generation_plan,
        "generationSelection": selection,
        "sourceJobId": str(body.get("sourceJobId") or "").strip(),
    }
    return hashlib.sha256(
        json.dumps(
            request_identity,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def _same_agent_tool_request(action, thread_id, tool, arguments, generation_plan, fingerprint):
    if action.thread_id != thread_id:
        return False
    stored = action.request_json or {}
    if stored.get("requestFingerprint"):
        return stored["requestFingerprint"] == fingerprint
    # Historical actions predate the fingerprint. Match their recorded inputs;
    # an ambiguous replay must not execute or return an unrelated old result.
    return (
        stored.get("tool") == tool
        and stored.get("arguments") == arguments
        and stored.get("generationPlan") == generation_plan
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
    raw_refs.extend(unreferenced_attachment_refs(_thread_attachment_entries(thread)))
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
    if not material_ids and singular_material_reference_requested(body.get("content")):
        raise ValueError("请先在“引用资料”中选择所说的那份文件，或在本次消息重新上传。")
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
    hidden_ids = set(str(get_config(f"course_catalog_hidden_user_{user.id}", "") or "").split(","))
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
    return [
        dojo for dojo in query.order_by(Dojos.name, Dojos.dojo_id).all()
        if str(dojo.dojo_id) not in hidden_ids
    ]


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
        if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
                        "icon": catalog_icon(challenge),
                        "url": f"/{dojo.reference_id}/{module.id}/{challenge.id}",
                    }
                    for challenge in module.challenges
                    if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
    if validation_status in {"BLOCK", "BLOCKED", "FAILED", "FAIL"}:
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


def _question_course_order(item):
    position = item.get("sortOrder")
    return (
        item.get("moduleIndex") is None,
        int(item.get("moduleIndex") or 0),
        position is None,
        int(position or 0),
        str(item.get("created") or ""),
        str(item.get("id") or ""),
    )


def _course_question_list_views(dojo):
    modules = {module.module_index: module for module in dojo.modules}
    challenges = DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id).all()
    challenge_index = {(row.module_index, row.id): row for row in challenges}
    published = [
        challenge
        for challenge in challenges
        if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
                "sortOrder": challenge.challenge_index,
                "moduleId": module.id if module else None,
                "moduleName": module.name if module else "未分配章节",
                "status": "PUBLISHED",
                "state": "published",
                "required": bool(challenge.required),
                "exerciseMode": str(challenge.exercise_mode or "CONTAINER").upper(),
                "icon": catalog_icon(challenge),
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
    represented_runtime_ids = set(published_ids)
    for draft in drafts:
        spec = draft.spec if isinstance(draft.spec, dict) else {}
        runtime = challenge_index.get((draft.module_index, str(spec.get("id") or "")))
        runtime = runtime if runtime and runtime_reference_matches(draft, runtime) else None
        if runtime and runtime.challenge_id in represented_runtime_ids:
            continue
        if runtime:
            represented_runtime_ids.add(runtime.challenge_id)
        validation = draft.validation if isinstance(draft.validation, dict) else {}
        module = modules.get(draft.module_index)
        state = "draft" if runtime else _content_state(draft.status, validation)
        rows.append(
            {
                "id": draft.id,
                "kind": "draft",
                "challengeId": runtime.id if runtime else None,
                "challengeNumericId": runtime.challenge_id if runtime else None,
                "draftId": draft.id,
                "title": str(runtime.name if runtime else spec.get("name") or draft.brief or "未命名题目草稿")[:240],
                "summary": str(runtime.description if runtime else spec.get("description") or draft.brief or "")[:1200],
                "moduleIndex": draft.module_index,
                "sortOrder": runtime.challenge_index if runtime else None,
                "moduleId": module.id if module else None,
                "moduleName": module.name if module else "未分配章节",
                "status": "DRAFT" if runtime else draft.status,
                "state": state,
                "required": bool(runtime.required) if runtime else bool(spec.get("required", True)),
                "exerciseMode": str(
                    runtime.exercise_mode if runtime else spec.get("exerciseMode") or spec.get("mode") or "CONTAINER"
                ).upper(),
                "icon": catalog_icon(runtime) if runtime else "fa-file-alt",
                "runtimeManaged": bool(runtime),
                "revision": draft.revision,
                "validationStatus": "NOT_APPLICABLE" if runtime else str(validation.get("status") or "PENDING"),
                "needsAttention": state in ATTENTION_CONTENT_STATES,
                "ownerName": owner_names.get(draft.author_id, "课程教师"),
                "updated": _timestamp(draft.updated),
                "created": _timestamp(draft.created),
                "href": runtime_url(runtime) if runtime else (
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
            if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
    if any(is_runtime_reference(draft) for draft in unpublished_drafts):
        question_items = [
            {
                "objectType": "question",
                "objectId": item["id"],
                "moduleIndex": item["moduleIndex"],
                "title": item["title"],
                "state": item["state"],
                "updated": datetime.datetime.fromisoformat(item["updated"].removesuffix("Z")) if item["updated"] else None,
                "nextAction": "retry_validation" if item["needsAttention"] else "open",
                "href": item["href"],
            }
            for item in _course_question_list_views(dojo)
        ]

    if artifacts is None:
        artifacts = (
            TeachingArtifacts.query.filter_by(dojo_id=dojo.dojo_id)
            .filter(
                TeachingArtifacts.status != "ARCHIVED",
                # Personal self-learning artifacts have a separate review and
                # visibility lifecycle.  They must not inflate the normal
                # courseware counts shown by a teacher course workspace.
                TeachingArtifacts.self_workspace_id.is_(None),
            )
            .order_by(TeachingArtifacts.updated.desc())
            .all()
        )
    demo_items = []
    courseware_items = []
    for artifact in artifacts:
        if (
            artifact.artifact_type in QUESTION_ARTIFACT_TYPES
        ):
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
        if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT":
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
        TeachingArtifacts.self_workspace_id.is_(None),
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
    message_rows=None,
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
        result["historySource"] = (
            "session-events" if message_rows is not None else "legacy-messages"
        )
        result["lastEventSequence"] = (
            db.session.query(func.max(TeachingAgentSessionEvents.sequence))
            .filter_by(thread_id=thread.id)
            .scalar() or 0
        )
        result["pendingTurns"] = pending_turns(db.session, thread)
        jobs = TeachingJobs.query.filter_by(owner_id=thread.user_id, thread_id=thread.id, kind="agent.chat").order_by(TeachingJobs.created.desc()).limit(100).all()
        result["harnessJobs"] = [job_view(job) for job in jobs if (job.payload or {}).get("harnessVersion") and not (job.payload or {}).get("harnessInternal")]
        messages = message_rows if message_rows is not None else (
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
        approval_metadata = message_approval_metadata(thread.id, messages)
        result["messages"] = [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "metadata": approval_metadata[message.id],
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


class SelfLearningReviewStateConflict(ValueError):
    """A personal artifact cannot be submitted again in its current review state."""


def _workspace_visibility_label(workspace):
    return {
        "SUBMITTED": "已提交教师",
        "APPROVED": "审核已通过",
        "CHANGES_REQUESTED": "需修改后再提交",
    }.get(str(workspace.status or "").upper(), "仅自己可见")


def _personal_artifact_visibility_label(artifact):
    return {
        "COURSE_CANDIDATE": "已提交教师审阅",
        "APPROVED_PERSONAL": "审核已通过（仍为个人成果）",
        "CHANGES_REQUESTED": "需修改后再提交",
    }.get(str(artifact.status or "").upper(), "仅自己可见")


def _queue_personal_artifact_review(workspace, artifact, *, actor_id):
    """Create one review action per artifact revision without rewinding decisions."""

    if (
        artifact.owner_id != actor_id
        or artifact.self_workspace_id != workspace.id
        or artifact.dojo_id != workspace.dojo_id
        or workspace.dojo_id is None
    ):
        raise ScopeError("A course-bound personal artifact is required")

    key = f"self-review:{workspace.id}:{artifact.id}:{artifact.current_revision}"
    action = TeachingAgentActions.query.filter_by(idempotency_key=key).first()
    if action is not None:
        if action.status == "AWAITING_APPROVAL":
            return action
        raise SelfLearningReviewStateConflict(
            "该成果的当前版本已完成审核；请先生成新版本，再重新提交。"
        )

    if (
        str(artifact.status or "").upper()
        not in PERSONAL_REVIEWABLE_ARTIFACT_STATUSES
    ):
        raise SelfLearningReviewStateConflict(
            "该成果当前不能提交教师审核；请先生成新版本后再试。"
        )

    action = TeachingAgentActions(
        thread_id=workspace.thread_id,
        actor_id=actor_id,
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
    return action


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
    decision_event = recorded_decision(action.thread_id, f'action:{action.id}')
    execution = action_execution(action)
    execution_status = ({'SUCCEEDED': 'APPROVED', 'FAILED': 'EXECUTION_FAILED',
                         'CANCELED': 'EXECUTION_CANCELED'}.get(execution['status'], 'EXECUTING')
                        if execution else None)
    request_json = action.request_json or {}
    result = execution['result'] if execution and execution['status'] == 'SUCCEEDED' else action.result
    if execution and execution.get('kind') == 'teacher-tool' and execution['status'] == 'SUCCEEDED':
        receipt = execution['result'] or {}
        result = receipt.get('result') or {}
        execution_status = receipt.get('actionStatus') or 'COMPLETED'
        child_ids = receipt.get('childJobIds') or []
        if child_ids:
            children = TeachingJobs.query.filter(TeachingJobs.id.in_(child_ids), TeachingJobs.owner_id == action.actor_id).all()
            states = [child.status for child in children]
            execution_status = ('PENDING' if any(state in {'QUEUED', 'RUNNING', 'CANCEL_REQUESTED'} for state in states)
                                else 'SUCCEEDED' if len(states) == len(child_ids) and all(state == 'SUCCEEDED' for state in states)
                                else 'FAILED')
    return {
        "id": action.id,
        "threadId": action.thread_id,
        "actorId": action.actor_id,
        "type": action.action_type,
        "riskLevel": action.risk_level,
        "targetType": action.target_type,
        "targetId": action.target_id,
        "status": execution_status or (decision_event['decision'] if decision_event else action.status),
        "request": request_json,
        "sourceJobId": request_json.get("sourceJobId"),
        "title": request_json.get("title"),
        "result": result,
        "error": execution['error'] if execution else action.error,
        "execution": execution,
        "created": _timestamp(action.created),
        "completed": _timestamp(action.completed),
        "approval": (
            {
                "decision": decision_event['decision'],
                "approverId": decision_event['actorId'],
                "comment": decision_event['comment'],
                "created": decision_event['decidedAt'],
                "requestId": decision_event['requestId'],
                "requestSha256": decision_event['requestSha256'],
            }
            if decision_event else
            {
                "decision": approval.decision,
                "approverId": approval.approver_id,
                "comment": approval.comment,
                "created": _timestamp(approval.created),
            }
            if approval
            else None
        ),
        "approvalRequest": request_reference(action_request(action)),
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
    return _supplied_idempotency(user_id, prefix, request.headers.get("Idempotency-Key"))


def _supplied_idempotency(user_id, prefix, supplied=None):
    supplied = str(supplied or "").strip()
    if supplied:
        supplied = supplied[:96]
    else:
        supplied = uuid.uuid4().hex
    return f"{prefix}:{user_id}:{supplied}"


def _safe_material_filename(value):
    leaf = unicodedata.normalize("NFC", str(value or "")).replace("\\", "/").split("/")[-1]
    leaf = re.sub(r'[\x00-\x1f\x7f<>:"|?*]', "_", leaf).strip(" .")
    suffix = pathlib.Path(leaf).suffix.lower()
    stem = leaf[: -len(suffix)] if suffix else leaf
    return f"{stem[:180].strip(' .') or 'material'}{suffix}"


def _valid_material_signature(suffix, raw):
    if suffix == ".pdf":
        return raw.startswith(b"%PDF-")
    if suffix in {".docx", ".pptx", ".xlsx"}:
        return raw.startswith(b"PK\x03\x04")
    if suffix in {".doc", ".ppt", ".xls"}:
        return raw.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    if suffix == ".png":
        return raw.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix in {".jpg", ".jpeg"}:
        return raw.startswith(b"\xff\xd8\xff")
    if suffix == ".webp":
        return len(raw) >= 12 and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"
    if suffix == ".gif":
        return raw.startswith((b"GIF87a", b"GIF89a"))
    if suffix == ".bmp":
        return raw.startswith(b"BM")
    if suffix in {".txt", ".md", ".markdown"}:
        return b"\x00" not in raw[:8192]
    return False


def _scan_material_security(suffix, raw):
    lowered = raw.lower()
    if suffix == ".pdf" and any(
        marker in lowered
        for marker in (b"/javascript", b"/launch", b"/embeddedfile", b"/openaction")
    ):
        raise ValueError("PDF active content is not allowed")
    if suffix in {".doc", ".ppt", ".xls"} and any(
        marker in lowered
        for marker in (b"vba", b"autoopen", b"document_open", b"shell.application")
    ):
        raise ValueError("Legacy Office active content is not allowed")
    if suffix in {".docx", ".pptx", ".xlsx"}:
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
                        raise ValueError("Office 文件包含不安全的内部路径；请另存为新文件或导出 PDF 后重试。")
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


from ...authoring_standards import planner_context as authoring_standards_context


from ...learning.inquiry import catalog as inquiry_pattern_catalog
from ...learning.inquiry_service import selected_pattern_context as inquiry_selected_context

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
        "runtimeEnvironments": [profile.public_context for profile in RUNTIME_PROFILES.values()],
        "nativeAuthoring": {"recentDrafts": [], "recentJobs": []},
        "authoringStandards": authoring_standards_context(thread.dojo_id),
        "learningPatterns": [inquiry_pattern_catalog()],
        "selectedLearningPattern": inquiry_selected_context(thread.dojo_id, (thread.context or {}).get("learningPattern")),
        "jobs": {"statusCounts": {}, "recent": []},
        "classrooms": {"statusCounts": {}, "recent": []},
        "pendingApprovals": [],
        "verifiedProgress": None,
    }
    if thread.dojo_id is None:
        projects = TeachingArtifacts.query.filter_by(
            owner_id=user.id, dojo_id=None, self_workspace_id=None,
        ).filter(TeachingArtifacts.status != "ARCHIVED").order_by(
            TeachingArtifacts.updated.desc()
        ).limit(20).all()
        snapshot["artifacts"]["recent"] = [
            artifact_view(row, include_content=False) for row in projects
        ]
        snapshot["generationCollection"] = "projects"
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
                    if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
                    if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
                "runtimeEnvironment": (row.spec or {}).get("runtimeEnvironment", "linux"),
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
    execution_payload = display_job.payload if isinstance(display_job.payload, dict) else {}
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
        "executionId": display_job.trace_id,
        "executionStarted": execution_payload.get("manualRetryStartedAt") or _timestamp(job.created),
        "dojoId": job.dojo_id,
        "moduleIndex": job.module_index,
        "threadId": job.thread_id,
        "attemptCount": display_job.attempt_count,
        "maxAttempts": display_job.max_attempts,
        "recovery": public_recovery(display_job),
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
    if payload.get("harnessVersion") and not payload.get("harnessInternal"):
        view.update(job_view(job))
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
                from ...agent_runtime.tool_plan import message_metadata
                selection = message_metadata(message).get("generationSelection")
                if not isinstance(selection, dict) or str(selection.get("status") or "").upper() != "SELECTED" or selection.get('commandJobId'):
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
                    "isTeacher": getattr(user, "type", None) == "admin" or bool(teacher_dojos),
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
            sort = str(request.args.get("sort") or (
                "course_order" if kind == "questions" else "updated_desc"
            )).strip().lower()
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
                    filtered_items.sort(key=_question_course_order)
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
                demo_types = COURSE_DEMO_ARTIFACT_TYPES
                non_courseware_types = COURSEWARE_EXCLUDED_ARTIFACT_TYPES
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
            demo_types = COURSE_DEMO_ARTIFACT_TYPES
            non_courseware_types = COURSEWARE_EXCLUDED_ARTIFACT_TYPES
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


@teaching_namespace.route("/skills")
class TeachingSkills(Resource):
    @authed_only
    def get(self):
        try:
            user = _current_user()
            _require_teacher(user)
            response = requests.get(
                f"{config.AGENT_RUNTIME_INTERNAL_URL}/api/integration/skills",
                params={"ownerId": user.id},
                headers={"X-AISecEdu-Service-Token": config.AGENT_RUNTIME_SERVICE_SECRET},
                timeout=(3, 8),
            )
            response.raise_for_status()
            payload = response.json()
            if not payload.get("success") or not isinstance(payload.get("data"), dict):
                raise ValueError("技能目录暂时不可用。")
            return _ok(payload["data"])
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Unable to read agent skill catalog: %s", exc)
            return _error("技能目录暂时不可用，请稍后重试。", 503, code="SKILL_CATALOG_UNAVAILABLE")


@teaching_namespace.route("/agent-skills/resolve")
class TeachingAgentSkillsResolve(Resource):
    def get(self):
        from ...agent_runtime.auth import AgentRuntimeAuthError, require_service_auth
        from ...agent_runtime.skills import (
            resolve_for_runtime,
            runtime_skill_body,
            runtime_skill_catalog,
            runtime_skill_resource,
        )

        try:
            require_service_auth()
        except AgentRuntimeAuthError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        owner = str(request.args.get("ownerId") or "").strip()
        if not owner.isdigit():
            return _error("ownerId is required", 400)
        owner_id = int(owner)
        view = str(request.args.get("view") or "legacy").strip()
        if view == "legacy":
            return _ok({"ownerId": owner_id, "skills": resolve_for_runtime(owner_id)})
        if view == "catalog":
            return _ok({"ownerId": owner_id, "skills": runtime_skill_catalog(owner_id)})
        try:
            name = str(request.args.get("name") or "").strip()
            audience = str(request.args.get("audience") or "model").strip()
            if view == "body":
                return _ok({"ownerId": owner_id, "skill": runtime_skill_body(owner_id, name, audience)})
            if view == "resource":
                path = str(request.args.get("path") or "").strip()
                return _ok({"ownerId": owner_id, "resource": runtime_skill_resource(owner_id, name, path, audience)})
        except LookupError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc, 400, code="INVALID_REQUEST")
        return _error("unknown skill view", 400, code="INVALID_REQUEST")


@teaching_namespace.route("/agent-skills")
class TeachingAgentSkillsIndex(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            return _ok({
                "skills": [skill_view(item, include_instructions=False) for item in list_skills(user)],
                "builtinCatalog": builtin_catalog(),
                "limits": {
                    "maxInstructionsBytes": 96_000,
                    "maxReferenceBytes": 64_000,
                    "maxReferences": 12,
                },
            })
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")

    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            markdown = str(body.get("skillMarkdown") or "").strip()
            if markdown:
                name, description, instructions = parse_skill_text(markdown)
                model_invocable, user_invocable = skill_invocation_from_markdown(markdown)
            else:
                name = body.get("name")
                description = body.get("description")
                instructions = body.get("instructions")
                model_invocable = body.get("modelInvocable", True)
                user_invocable = body.get("userInvocable", True)
            skill = create_skill(
                user,
                name=name,
                description=description,
                instructions=instructions,
                references=body.get("references"),
                model_invocable=model_invocable,
                user_invocable=user_invocable,
            )
            return _ok({"skill": skill_view(skill)}, 201)
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        except (ValueError, LookupError) as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_REQUEST")


@teaching_namespace.route("/agent-skills/catalog")
class TeachingAgentSkillsCatalog(Resource):
    @authed_only
    def get(self):
        user = _current_user()
        try:
            _require_teacher(user)
            installed = {item.name for item in list_skills(user)}
            return _ok({
                "catalog": [
                    {**item, "installed": item["name"] in installed}
                    for item in builtin_catalog()
                ]
            })
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")


@teaching_namespace.route("/agent-skills/import")
class TeachingAgentSkillsImport(Resource):
    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
            skill = import_builtin(user, _body().get("name"))
            return _ok({"skill": skill_view(skill, include_instructions=False)}, 201)
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        except LookupError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc, 400, code="INVALID_REQUEST")


@teaching_namespace.route("/agent-skills/<string:name>")
class TeachingAgentSkillsItem(Resource):
    @authed_only
    def get(self, name):
        user = _current_user()
        try:
            _require_teacher(user)
            return _ok({"skill": skill_view(owned_skill(user, name))})
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        except LookupError as exc:
            return _error(exc, 404, code="NOT_FOUND")

    @authed_only
    def patch(self, name):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            markdown = str(body.get("skillMarkdown") or "").strip()
            if markdown:
                parsed_name, description, instructions = parse_skill_text(markdown)
                if parsed_name != name:
                    raise ValueError("技能正文中的 name 必须与当前技能一致")
                model_invocable, user_invocable = skill_invocation_from_markdown(markdown)
                skill = update_skill(
                    user,
                    name,
                    description=description,
                    instructions=instructions,
                    model_invocable=model_invocable,
                    user_invocable=user_invocable,
                )
            else:
                skill = update_skill(
                    user,
                    name,
                    description=body.get("description"),
                    instructions=body.get("instructions"),
                    references=body.get("references"),
                    enabled=body.get("enabled"),
                    model_invocable=body.get("modelInvocable"),
                    user_invocable=body.get("userInvocable"),
                )
            return _ok({"skill": skill_view(skill, include_instructions=False)})
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        except LookupError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_REQUEST")

    @authed_only
    def delete(self, name):
        user = _current_user()
        try:
            _require_teacher(user)
            skill = delete_skill(user, name)
            return _ok({"deleted": skill.name})
        except ScopeError as exc:
            return _error(exc, 403, code="FORBIDDEN")
        except LookupError as exc:
            return _error(exc, 404, code="NOT_FOUND")


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


@teaching_namespace.route("/threads/<string:thread_id>/fork")
class TeachingThreadFork(Resource):
    @authed_only
    def post(self, thread_id):
        from ...agent_runtime.branch import branch_message_snapshot, completed_branch_boundary
        import hashlib

        user = _current_user()
        try:
            _require_teacher(user)
            source = _thread_for_owner(thread_id, user)
            source = TeachingAgentThreads.query.filter_by(id=source.id, user_id=user.id).with_for_update().one()
            body = _body()
            requested = body.get("sourceMessageId")
            if requested is not None and (type(requested) is not int or requested < 1):
                raise ConversationConflict("请选择一条已完成的回复作为分支起点。")
            key = _supplied_idempotency(user.id, "thread-fork", request.headers.get("Idempotency-Key"))
            fork_id = "thread_fork_" + hashlib.sha256(f"{user.id}:{source.id}:{key}".encode()).hexdigest()[:32]
            existing = TeachingAgentThreads.query.filter_by(id=fork_id, user_id=user.id).first()
            if existing is not None:
                if (existing.context or {}).get("branch", {}).get("requestedMessageId") != requested:
                    raise ConversationConflict("同一分支请求的起点不同，请刷新后重试。")
                db.session.commit()
                return _ok({"thread": _thread_view(existing, include_messages=True), "deduplicated": True}, 201)
            messages = TeachingAgentMessages.query.filter_by(thread_id=source.id, user_id=user.id).order_by(TeachingAgentMessages.id).all()
            boundary = completed_branch_boundary(messages, requested)
            if boundary is None:
                raise ConversationConflict("当前没有可以继续的已完成回复，请等待本轮完成。")
            fork = TeachingAgentThreads(id=fork_id, user_id=user.id, dojo_id=source.dojo_id,
                module_index=source.module_index, phase=source.phase, title=(str(body.get("title") or f"{source.title} · 分支"))[:240],
                context={**(source.context or {}), "branch": {"sourceThreadId": source.id, "sourceMessageId": boundary, "requestedMessageId": requested}})
            db.session.add(fork)
            db.session.flush()
            for message in messages:
                if message.id <= boundary and (message.metadata_json or {}).get("pending") is not True:
                    db.session.add(TeachingAgentMessages(thread_id=fork.id, user_id=user.id, **branch_message_snapshot(message)))
            db.session.commit()
            return _ok({"thread": _thread_view(fork, include_messages=True), "deduplicated": False}, 201)
        except (ScopeError, ConversationConflict) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 409, code="NOT_FOUND" if isinstance(exc, ScopeError) else "BRANCH_CONFLICT")


@teaching_namespace.route("/threads/<string:thread_id>")
class TeachingThread(Resource):
    @authed_only
    def get(self, thread_id):
        try:
            thread = _thread_for_owner(thread_id, _current_user())
            if session_history_replayable(thread.id):
                messages = replay_session_messages(thread.id)
                db.session.commit()
                return _ok({"thread": _thread_view(
                    thread, include_messages=True, message_rows=messages,
                )})
            return _ok({"thread": _thread_view(thread, include_messages=True)})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except Exception:
            db.session.rollback()
            logger.exception("Unable to replay teaching conversation history")
            return _error("会话历史暂时不可用，请稍后重试。", 503, code="EVENT_STREAM_UNAVAILABLE")

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


def _public_session_event_payload(event_type, payload):
    hidden = set()
    if event_type in {'model.input', 'model.prepared'}:
        hidden = {'payload', 'modelRoute'}
    elif event_type in {
        'projection.checkpoint', 'runtime.dispatched', 'runtime.settled',
        'model.requested', 'model.step', 'model.settled', 'model.failed', 'model.cancelled',
        'tool.call', 'tool.result',
        'provider.request', 'provider.response', 'provider.chunk', 'provider.finished',
    }:
        hidden = {'messages', 'body', 'response', 'detail'}
    return scrub_payload({key: value for key, value in (payload or {}).items() if key not in hidden})


@teaching_namespace.route("/threads/<string:thread_id>/events")
class TeachingThreadEvents(Resource):
    @authed_only
    def get(self, thread_id):
        user = _current_user()
        try:
            _require_teacher(user)
            thread = _thread_for_owner(thread_id, user)
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        try:
            cursor = int(request.args.get("after", "0"))
            limit = int(request.args.get("limit", "100"))
            wait_ms = int(request.args.get("waitMs", "0"))
        except (TypeError, ValueError):
            return _error("事件游标或页数不正确。", 400, code="INVALID_CURSOR")
        if cursor < 0 or limit < 1 or limit > 200 or wait_ms < 0 or wait_ms > 15000:
            return _error("事件游标或页数超出范围。", 400, code="INVALID_CURSOR")
        try:
            owned_thread_id = thread.id
            owner_id = user.id
            deadline = time.monotonic() + wait_ms / 1000
            while True:
                # Long polling must not retain a PostgreSQL transaction or a
                # thread row lock while waiting for another writer to commit.
                if not TeachingAgentThreads.query.filter_by(
                    id=owned_thread_id, user_id=owner_id,
                ).first():
                    db.session.rollback()
                    return _error("Conversation not found", 404, code="NOT_FOUND")
                projection = project_session_events(owned_thread_id, limit=500)
                if projection is None:
                    db.session.rollback()
                    return _error("Conversation not found", 404, code="NOT_FOUND")
                db.session.commit()
                last_sequence = projection["lastSequence"]
                if cursor > last_sequence:
                    db.session.rollback()
                    return _error("事件游标已超过当前会话。", 400, code="INVALID_CURSOR")
                rows = (
                    TeachingAgentSessionEvents.query.filter_by(thread_id=owned_thread_id)
                    .filter(TeachingAgentSessionEvents.sequence > cursor)
                    .order_by(TeachingAgentSessionEvents.sequence)
                    .limit(limit + 1)
                    .all()
                )
                visible = rows[:limit]
                pending_outbox = (
                    db.session.query(TeachingAgentEventOutbox.id)
                    .filter_by(thread_id=owned_thread_id, projected_sequence=None)
                    .first() is not None
                )
                if visible or pending_outbox or wait_ms == 0 or time.monotonic() >= deadline:
                    history_origin = session_history_origin(owned_thread_id)
                    result = _ok({
                        "threadId": owned_thread_id,
                        "eventVersion": 1,
                        "completeHistory": history_origin == 'captured',
                        "historyOrigin": history_origin,
                        "events": [
                            {
                                "sequence": row.sequence,
                                "type": row.event_type,
                                "payload": _public_session_event_payload(row.event_type, row.payload),
                                "created": _timestamp(row.created),
                            }
                            for row in visible
                        ],
                        "nextCursor": visible[-1].sequence if visible else cursor,
                        "lastSequence": max(last_sequence, visible[-1].sequence if visible else 0),
                        "hasMore": len(rows) > limit or pending_outbox,
                    })
                    db.session.rollback()
                    return result
                db.session.rollback()
                time.sleep(min(0.75, max(0, deadline - time.monotonic())))
        except Exception:
            db.session.rollback()
            logger.exception("Unable to project teaching conversation events")
            return _error("会话事件暂时不可用，请稍后重试。", 503, code="EVENT_STREAM_UNAVAILABLE")


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
            thread = TeachingAgentThreads.query.filter_by(
                id=thread_id, user_id=user.id,
            ).with_for_update().populate_existing().first()
            if thread is None:
                raise ScopeError("Conversation not found")
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
                .populate_existing()
                .first()
            )
            if source_message is None:
                return _error("Approval request not found", 404, code="NOT_FOUND")

            from ...agent_runtime.tool_plan import message_metadata
            metadata = message_metadata(source_message)
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
            envelope = proposal_request(thread.id, source_message.id, proposal_index, proposal)
            existing = recorded_decision(thread.id, envelope['id']) or decisions.get(decision_key)
            if isinstance(existing, dict):
                if str(existing.get("decision") or "").upper() != decision:
                    raise ApprovalJournalError("这项请求已有决定。", "ALREADY_DECIDED")
                if existing.get('version') != 1:
                    return _ok({"thread": _thread_view(thread, include_messages=True),
                                "decision": existing, "deduplicated": True, "legacy": True})
            recorded, duplicate = decide_approval(
                envelope, body.get('approvalRequest'), decision, user.id,
            )
            decisions[decision_key] = recorded
            metadata["toolProposalDecisions"] = decisions
            source_message.metadata_json = metadata
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()
            publish_pending_outbox()
            return _ok(
                {
                    "thread": _thread_view(thread, include_messages=True),
                    "decision": recorded,
                    "deduplicated": duplicate,
                }
            )
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except ApprovalJournalError as exc:
            return _error(exc, exc.status, code=exc.code)
        finally:
            db.session.rollback()


def _serialize_teacher_agent_history(messages, bundles, current_message_id=None, limit=48000):
    conversation = []
    sources = []
    option_sources = {}
    for bundle in bundles:
        for option in bundle["options"]:
            selection = bundle.get("selection") or {}
            source = {
                "ref": f'option:{bundle["sourceMessageId"]}:{option["id"]}',
                "kind": "generation-option",
                "authorship": "model",
                "sourceMessageId": bundle["sourceMessageId"],
                "sourceJobId": bundle["sourceJobId"],
                "optionId": option["id"],
                "title": option["title"],
                "content": option["rewrittenPrompt"],
                "originalRequest": bundle["originalRequest"],
                "selected": selection.get("optionId") == option["id"],
                "intentDecision": bundle.get("intentDecision"),
                "selectionMessageId": selection.get("selectionMessageId")
                if selection.get("optionId") == option["id"] else None,
            }
            option_sources[(str(bundle["sourceMessageId"]), option["id"])] = source
            sources.append(source)
    remaining = limit
    for message in sorted(messages, key=lambda item: item["id"], reverse=True):
        if message["id"] == current_message_id:
            continue
        metadata = message.get("metadata") or {}
        role = message["role"]
        origin = "teacher-authored" if role == "user" else "model-authored"
        text = str(message.get("content") or "")
        source_ref = f'message:{message["id"]}'
        selection_event = role == "user" and metadata.get("client") == "generation-option-selection"
        if selection_event:
            source = option_sources.get((str(metadata.get("sourceMessageId")), str(metadata.get("optionId"))))
            verified = source is not None and source["selectionMessageId"] == message["id"]
            role = "assistant"
            origin = "model-draft-selection" if verified else "unverified-selection-event"
            source_ref = source["ref"] if verified else None
            text = "教师当时选择了模型方案；方案正文不是教师原创要求。" if verified else "旧方案选择的来源无法验证，不能作为新需求。"
        if len(text) > remaining:
            continue
        remaining -= len(text)
        conversation.append({
            "id": message["id"], "role": role, "origin": origin,
            "sourceRef": source_ref, "content": text,
            **({"selectionEvent": {"authorship": "teacher", "sourceRef": source_ref}}
               if origin == "model-draft-selection" else {}),
        })
        if not selection_event:
            sources.append({
                "ref": source_ref,
                "kind": "teacher-message" if role == "user" else "assistant-message",
                "authorship": "teacher" if role == "user" else "model",
                "messageId": message["id"],
                "content": text,
                **({"intentDecision": metadata["intentDecision"]}
                   if role == "assistant" and isinstance(metadata.get("intentDecision"), dict) else {}),
            })
    conversation.reverse()
    return {
        "conversation": conversation,
        "requestProvenance": {
            "version": "teacher-request-v1",
            "currentMessageId": current_message_id,
            "sources": sources,
        },
    }


def _teacher_agent_history_context(user, thread, recent_messages, current_message_id=None):
    from ...agent_runtime.tool_plan import message_metadata
    messages = [{
        "id": message.id, "role": message.role, "content": message.content,
        "metadata": message_metadata(message, thread_id=thread.id),
    } for message in recent_messages]
    bundles = []
    for message in messages:
        metadata = message["metadata"]
        options = metadata.get("generationOptions")
        if message["role"] != "assistant" or not isinstance(options, dict):
            continue
        options = options.get("options")
        if not isinstance(options, list) or not options or not isinstance(options[0], dict):
            continue
        try:
            verified = _generation_option_context(user, thread, message["id"], options[0].get("id"))
        except ValueError:
            continue
        bundles.append({
            "sourceMessageId": message["id"],
            "sourceJobId": verified["sourceJob"].id,
            "originalRequest": str(verified['sourcePayload'].get("prompt") or ""),
            "options": verified["bundle"]["options"],
            "selection": verified["selection"],
            "intentDecision": metadata.get("intentDecision"),
        })
    from ...agent_runtime.workbench import attach_generated_file_sources
    return attach_generated_file_sources(
        _serialize_teacher_agent_history(messages, bundles, current_message_id),
        messages, user.id, thread.id,
    )


def _generation_option_context(
    user,
    thread,
    source_message_id,
    option_id,
    *,
    require_selected=False,
    require_current=False,
    lock=False,
):
    from ...agent_runtime.tool_plan import freeze_plan, message_metadata, source_plan
    try:
        source_message_id = int(source_message_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("请选择当前对话中有效的生成方案。") from exc
    normalized_option_id = str(option_id or "").strip()
    source_query = TeachingAgentMessages.query.filter_by(
        id=source_message_id,
        thread_id=thread.id,
        user_id=user.id,
        role="assistant",
    )
    if lock:
        TeachingAgentThreads.query.filter_by(id=thread.id, user_id=user.id).with_for_update().populate_existing().one()
        source_query = source_query.populate_existing().with_for_update()
    source_message = source_query.first()
    if source_message is None:
        raise ValueError("没有找到这组生成方案，请刷新对话后重试。")
    plan = source_plan(source_message)
    metadata = message_metadata(source_message, plan)
    if require_current and metadata.get("generationRefinement"):
        raise GenerationOptionConflict("这一轮方案已提交修改，请等待并选择后续的新方案。")
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
    bundle = metadata.get('generationOptions') if plan else validated_generation_options(
        source_job, {"generationOptions": metadata.get("generationOptions")},
    )
    if bundle is None:
        raise ValueError("这组生成方案未通过完整性校验，请重新提出生成要求。")
    if lock and plan is None:
        plan = freeze_plan(source_message, source_job=source_job, generation_options=bundle)
        metadata = message_metadata(source_message, plan)
    scope = metadata.get('generationScope')
    if require_current and scope and (scope['dojoId'] != thread.dojo_id or scope['moduleIndex'] != thread.module_index):
        raise GenerationOptionConflict('这组方案的目标课程或章节已变化，请回到原范围或重新提出要求。')
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
        'metadata': metadata,
        'plan': plan,
        'sourcePayload': metadata.get('generationRequest') or source_job.payload or {},
    }


def _generation_option_proposal(user, thread, context):
    bundle = context["bundle"]
    option = context["option"]
    target_tool = bundle["targetTool"]
    if thread.dojo_id is None and target_tool != "candidate.generate":
        raise ValueError("实践题需要目标课程；课件与演示可保存到生成项目合集。")

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


def select_teacher_generation(user, thread_id, message_id, option_id):
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
            require_current=True,
            lock=True,
        )
        source_message = context["sourceMessage"]
        option = context["option"]
        metadata = dict(context['metadata'])
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
        from ...agent_runtime.generation_events import record_generation
        record_generation(context, 'selected', selection)
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

@teaching_namespace.route(
    "/threads/<string:thread_id>/messages/<int:message_id>/generation-options/"
    "<string:option_id>/select"
)
class TeachingGenerationOptionSelection(Resource):
    @authed_only
    def post(self, thread_id, message_id, option_id):
        return select_teacher_generation(_current_user(), thread_id, message_id, option_id)


def start_teacher_generation(user, thread_id, arguments, request_key):
    message_id = arguments.get("sourceMessageId")
    option_id = arguments.get("optionId")
    response = select_teacher_generation(user, thread_id, message_id, option_id)
    value, status = response if isinstance(response, tuple) else (response, 200)
    if status >= 400 or not value.get("success"):
        return response
    data = value["data"]
    proposal = data["proposal"]
    selection = {"sourceMessageId": message_id, "optionId": option_id}
    if proposal["tool"] == "candidate.generate":
        args = proposal["arguments"]
        return submit_teacher_message(user, thread_id, {
            "agentContinuation": True, "action": "generate", "content": args["prompt"],
            "artifactType": args["artifactType"], "candidateMode": "single",
            "candidateCount": args.get("candidateCount") or 1,
            "sourceRefs": args.get("sourceRefs") or [], "generationSelection": selection,
        }, request_key)
    return execute_teacher_tool(user, {
        "threadId": thread_id, "tool": proposal["tool"], "arguments": proposal["arguments"],
        "sourceJobId": data["sourceJobId"], "generationSelection": selection,
    }, request_key)


@teaching_namespace.route(
    "/threads/<string:thread_id>/messages/<int:message_id>/generation-options/refine"
)
class TeachingGenerationOptionsRefinement(Resource):
    @authed_only
    def post(self, thread_id, message_id):
        user = _current_user()
        try:
            _require_teacher(user)
            thread = _thread_for_owner(thread_id, user)
            if thread.status != "ACTIVE":
                return _error("请先恢复这个对话，再修改方案。", 409, code="THREAD_ARCHIVED")
            body = _body()
            context = _generation_option_context(user, thread, message_id, "option-1", lock=True)
            source = context["sourceMessage"]
            metadata = dict(context['metadata'])
            request_key = _unique_idempotency(user.id, "generation-refinement")
            existing = TeachingJobs.query.filter_by(idempotency_key=request_key, owner_id=user.id).first()
            if existing is not None:
                recorded = metadata.get('generationRefinement') or {}
                saved = recorded.get('request') or (existing.payload or {}).get("generationRefinement") or {}
                if (existing.kind != "agent.chat" or existing.thread_id != thread.id
                        or (recorded.get('jobId') and recorded['jobId'] != existing.id)
                        or saved.get("sourceMessageId") != source.id
                        or str(body.get("content") or "").replace("\x00", "").strip() != saved.get("feedback", [None])[-1]):
                    raise GenerationOptionConflict("同一发送请求的来源或修改内容不一致，请刷新后重试。")
                return _ok({"thread": _thread_view(thread, include_messages=True),
                            "job": job_view(existing), "deduplicated": True}, 202)
            previous = metadata.get("generationRefinement") or {}
            if previous:
                raise GenerationOptionConflict("这一轮已提交修改，请使用后续的新方案；失败任务可以重试。")
            if context["selection"]:
                raise GenerationOptionConflict("这一轮已经选定，请在生成结果上继续修改，或新建对话。")
            source_payload = context['sourcePayload']
            refinement = generation_refinement_request(source_payload, source.id, context["bundle"], body.get("content"))
            constraints, incoming_refs = _agent_request_context(body, user, thread)
            constraints = {**scrub_payload(source_payload.get("constraints") or {}), **constraints}
            source_refs = list(context["bundle"]["sourceRefs"])
            for ref in incoming_refs:
                if ref not in source_refs:
                    source_refs.append(ref)
            user_message = TeachingAgentMessages(
                thread_id=thread.id, user_id=user.id, role="user",
                content=refinement["feedback"][-1],
                metadata_json={"client": "generation-options-refinement", "sourceMessageId": source.id,
                               "generationRound": refinement["round"]},
            )
            db.session.add(user_message)
            db.session.flush()
            attachments = _message_attachment_views(user, source_refs)
            if attachments:
                user_message.metadata_json = {**user_message.metadata_json, "attachments": attachments}
                _mark_thread_attachments_referenced(thread, [item["id"] for item in attachments], user_message.id)
            payload = {
                "prompt": generation_refinement_prompt(refinement),
                "phase": thread.phase, "constraints": constraints, "sourceRefs": source_refs,
                "allowDegraded": False, "generationRefinement": refinement,
                "context": {
                    "thread": scrub_payload(thread.context or {}),
                    "platformFacts": _teacher_agent_context(user, thread),
                    "conversation": [],
                    "requestProvenance": {"version": "teacher-request-v1", "currentMessageId": user_message.id, "sources": []},
                    "agentLoop": {"depth": 0, "maxDepth": MAX_AGENT_LOOP_STEPS, "trace": []},
                },
            }
            dependencies = _material_dependency_ids(user.id, source_refs)
            if dependencies:
                payload["dependsOnJobIds"] = dependencies
            job, _ = enqueue_job(owner_id=user.id, kind="agent.chat", idempotency_key=request_key,
                                 payload=payload, dojo_id=thread.dojo_id, module_index=thread.module_index,
                                 thread_id=thread.id, priority=80, publish=False, commit=False)
            assistant = TeachingAgentMessages(
                thread_id=thread.id, user_id=user.id, role="assistant",
                content=f"正在结合原始要求和 {len(refinement['feedback'])} 次修改，准备第 {refinement['round']} 轮的三个新方案；不会开始正式生成…",
                metadata_json={"pending": True, "presentation": "activity", "jobId": job.id,
                               "jobKind": job.kind, "jobStatus": job.status, "agentRootJobId": job.id,
                               "generationRound": refinement["round"], "refinementSourceMessageId": source.id},
            )
            db.session.add(assistant)
            metadata["generationRefinement"] = {"status": "SUPERSEDED", "jobId": job.id,
                                                "feedbackMessageId": user_message.id, "nextRound": refinement["round"],
                                                'request': refinement, 'requestKey': request_key}
            from ...agent_runtime.generation_events import record_generation
            record_generation(context, 'refined', metadata['generationRefinement'])
            source.metadata_json = metadata
            thread.updated = datetime.datetime.utcnow()
            db.session.commit()
            publish_pending_outbox(job_id=job.id)
            return _ok({"thread": _thread_view(thread, include_messages=True), "job": job_view(job),
                        "deduplicated": False}, 202)
        except IntegrityError:
            db.session.rollback()
            return _error("并发提交已被拦截，请刷新对话查看任务，避免重复发送。", 409, code="GENERATION_OPTION_CONFLICT")
        except (ScopeError, ValueError) as exc:
            db.session.rollback()
            conflict = isinstance(exc, GenerationOptionConflict)
            return _error(exc, 404 if isinstance(exc, ScopeError) else 409 if conflict else 400,
                          code="NOT_FOUND" if isinstance(exc, ScopeError) else "GENERATION_OPTION_CONFLICT" if conflict else "INVALID_REQUEST")


def _agent_continuation_context(user, thread, body):
    from ...agent_runtime.tool_plan import message_metadata, source_plan, progress
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
    plan = source_plan(source_message)
    metadata = message_metadata(source_message, plan)
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
    from ...agent_runtime.workbench import require_execution_mode
    from ...agent_runtime.model_inputs import request_payload
    require_execution_mode(source_job.result or metadata)

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
        recorded = (metadata.get('toolExecutionResults') or {}).get(str(index)) or {}
        if plan and not recorded:
            phase = progress(plan) or {}
            first_unobserved = next((i for i in range(len(proposals)) if not (
                metadata.get('toolExecutionResults') or {}
            ).get(str(i))), None)
            if phase.get('state') != 'awaiting-action' or index != first_unobserved:
                raise ValueError(f'No completed tool observation is available for {tool}')
        if plan and recorded:
            if recorded.get('status') not in {'SUCCEEDED', 'REJECTED'}:
                raise ValueError(f'No completed tool observation is available for {tool}')
            observation['status'] = 'rejected' if recorded['status'] == 'REJECTED' else 'verified'
            observation['observation'] = _bounded_agent_fact(
                recorded.get('observations') or recorded.get('receipt') or recorded,
                text_limit=500, item_limit=12,
            )
        elif tool in COURSE_TOOL_NAMES:
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
                    "observation": assignment_agent_observation(action.result or {})
                    if tool in {"assignment.read", "assignment.generate", "assignment.update"}
                    else _bounded_agent_fact(
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
        "requestProvenance": (root_payload.get("context") or {}).get("requestProvenance"),
        "questionReply": (root_payload.get("context") or {}).get("questionReply"),
        "intentDecision": (source_job.result or {}).get("intentDecision"),
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
        return submit_teacher_message(_current_user(), thread_id, _body(), request.headers.get("Idempotency-Key"))


def submit_teacher_message(user, thread_id, body, request_key=None):
    try:
        from ...agent_runtime.workbench import execution_mode, require_execution_mode
        mode = execution_mode(body)
        _require_teacher(user)
        thread = _thread_for_owner(thread_id, user)
        thread = TeachingAgentThreads.query.filter_by(id=thread.id, user_id=user.id).with_for_update().populate_existing().one()
        if thread.status != "ACTIVE":
            return _error(
                "Restore this conversation before sending another message",
                409,
                code="THREAD_ARCHIVED",
            )
        requested_action = str(body.get("action") or "").strip().lower()
        continuation = body.get("agentContinuation") is True
        if continuation and mode in {"ask", "plan"}:
            require_execution_mode(body)
        submission_key = _supplied_idempotency(user.id, "thread-message", request_key)
        wait_for_job_ids = []
        if not continuation:
            existing, wait_for_job_ids = prepare_turn_submission(db.session, thread, body, submission_key)
            if existing is not None:
                response = _ok({"thread": _thread_view(thread, include_messages=True),
                                "job": job_view(existing), "candidateSetId": None,
                                "deduplicated": True}, 202)
                db.session.commit()
                return response
        continuation_context = None
        question_source = None
        question_context = None
        if body.get("questionReply") is not None:
            from ...agent_runtime.conversation import validated_question_answers, question_reply_context
            reply = body["questionReply"]
            if not isinstance(reply, dict) or continuation:
                raise ConversationConflict("问题回答格式不正确。")
            try:
                source_id = int(reply.get("sourceMessageId"))
            except (ValueError, TypeError) as exc:
                raise ConversationConflict("问题编号不正确，请刷新对话后再回答。") from exc
            question_source = TeachingAgentMessages.query.filter_by(
                id=source_id, thread_id=thread.id, user_id=user.id, role="assistant",
            ).first()
            if question_source is None or (question_source.metadata_json or {}).get("questionReplyJobId"):
                raise ConversationConflict("这组问题已回答或不属于当前对话。")
            question_meta = question_source.metadata_json or {}
            source_job = TeachingJobs.query.filter_by(id=str(question_meta.get("jobId") or ""), owner_id=user.id,
                                                      thread_id=thread.id, kind="agent.chat", status="SUCCEEDED").first()
            if source_job is None or question_meta.get("pending") is not False:
                raise ConversationConflict("问题尚未准备完成，请稍后再试。")
            answers = validated_question_answers(question_meta.get("questions"), reply)
            question_context = question_reply_context(source_job.payload or {}, question_meta["questions"], answers, source_job.result)
            mode = "auto" if question_meta.get("intentDecision") else execution_mode(source_job.payload or {})
        selected_generation = None
        if continuation:
            if requested_action == "continue":
                continuation_context = _agent_continuation_context(
                    user, thread, body
                )
                content = continuation_context["prompt"]
                question_context = continuation_context.get("questionReply")
            elif requested_action == "generate":
                raw_selection = body.get("generationSelection")
                if isinstance(raw_selection, dict):
                    selected_generation = _generation_option_context(
                        user,
                        thread,
                        raw_selection.get("sourceMessageId"),
                        raw_selection.get("optionId"),
                        require_selected=True,
                        require_current=True,
                        lock=True,
                    )
                    prior = selected_generation["selection"] or {}
                    if prior.get("status") == "STARTED":
                        existing = TeachingJobs.query.filter_by(
                            id=prior.get("formalJobId"), owner_id=user.id,
                            thread_id=thread.id, kind="candidate.generate",
                        ).first()
                        if existing is None:
                            raise GenerationOptionConflict("已选方案的生成任务不存在，请联系管理员。")
                        return _ok({"thread": _thread_view(thread, include_messages=True),
                                    "job": job_view(existing), "candidateSetId": prior.get("candidateSetId"),
                                    "deduplicated": True}, 202)
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

        plan_context = None
        if body.get("planSourceMessageId") is not None:
            if continuation or mode not in {"auto", "execute"}:
                raise ConversationConflict("请通过自然语言明确希望继续制作哪份计划。")
            try:
                plan_message_id = int(body["planSourceMessageId"])
            except (ValueError, TypeError) as exc:
                raise ConversationConflict("计划编号不正确。") from exc
            plan_source = TeachingAgentMessages.query.filter_by(
                id=plan_message_id, thread_id=thread.id,
                user_id=user.id, role="assistant",
            ).first()
            plan_meta = (plan_source.metadata_json or {}) if plan_source else {}
            plan_job = TeachingJobs.query.filter_by(
                id=plan_meta.get("jobId"), owner_id=user.id, thread_id=thread.id,
                kind="agent.chat", status="SUCCEEDED",
            ).first() if plan_source else None
            if plan_job is None or plan_meta.get("executionMode") != "plan" or plan_meta.get("pending") is not False or plan_meta.get("questions"):
                raise ConversationConflict("这份计划尚未完成或不属于当前会话。")
            plan_context = {"messageId": plan_source.id, "answer": plan_source.content,
                            "plan": plan_meta.get("plan") or []}

        continuation_idempotency = None
        if continuation_context is not None:
            continuation_idempotency = _supplied_idempotency(user.id, "agent-loop", request_key)
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

        if session_history_replayable(thread.id):
            # New conversations derive the model-visible history from the
            # same durable message events used to reconstruct the page.
            recent_messages = replay_session_messages(thread.id)[-30:]
        else:
            recent_messages = (
                TeachingAgentMessages.query.filter_by(thread_id=thread.id)
                .order_by(TeachingAgentMessages.id.desc())
                .limit(30)
                .all()
            )
        history_context = _teacher_agent_history_context(
            user, thread, recent_messages,
            user_message.id if user_message is not None else None,
        )
        conversation = history_context["conversation"]
        if continuation_context and isinstance(continuation_context.get("requestProvenance"), dict):
            history_context["requestProvenance"] = continuation_context["requestProvenance"]
        if "learningPattern" in body:
            pattern_id = body["learningPattern"]
            if pattern_id not in ("", "process-inquiry"):
                raise ValueError("请选择有效的学习模式。")
            thread.context = {**(thread.context or {}), "learningPattern": inquiry_pattern_catalog() if pattern_id else None}
        platform_context = _teacher_agent_context(user, thread)

        generate = continuation and requested_action == "generate"
        if continuation_context is not None:
            constraints = continuation_context["constraints"]
            source_refs = continuation_context["sourceRefs"]
            allow_degraded = continuation_context["allowDegraded"]
            agent_loop = continuation_context["agentLoop"]
        elif selected_generation is not None:
            source_payload = selected_generation['sourcePayload']
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
            if question_context:
                user_message.metadata_json = {**(user_message.metadata_json or {}), "questionReply": question_context}
            attachments = _message_attachment_views(user, source_refs)
            if attachments:
                known_ids = {str(item["id"]) for item in _thread_attachment_entries(thread)}
                new_ids = [str(item["id"]) for item in attachments if str(item["id"]) not in known_ids]
                if new_ids:
                    new_materials = {
                        row.id: row for row in TeachingMaterials.query.filter(
                            TeachingMaterials.id.in_(new_ids),
                            TeachingMaterials.owner_id == user.id,
                        ).all()
                    }
                    analysis_jobs = _material_jobs(user.id, new_ids)
                    for material_id in new_ids:
                        material = new_materials.get(material_id)
                        if material is not None:
                            _remember_thread_attachment(
                                thread, material, analysis_jobs.get(material_id), status="ACTIVE",
                            )
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
                "executionMode": mode,
                "phase": thread.phase,
                "constraints": constraints,
                "sourceRefs": source_refs,
                "context": {
                    "thread": scrub_payload(thread.context or {}),
                    "platformFacts": platform_context,
                    "conversation": conversation,
                    "requestProvenance": history_context["requestProvenance"],
                    "agentLoop": agent_loop,
                    "questionReply": question_context,
                    "approvedPlan": plan_context,
                    "priorIntentDecision": continuation_context.get("intentDecision") if continuation_context else None,
                },
                "allowDegraded": allow_degraded,
            }
            if dependency_ids:
                payload["dependsOnJobIds"] = dependency_ids
            job_kind = "agent.chat"
            if question_context:
                from ...agent_runtime.conversation import question_reply_prompt
                # Persist the complete teacher brief too, so later selection,
                # refinement and materialization keep the same original intent.
                payload["prompt"] = question_reply_prompt(question_context)
            assistant_text = "正在理解完整要求、选择相关技能并规划下一步…"

        if job_kind == "agent.chat":
            payload["harnessVersion"] = HARNESS_VERSION
            if not continuation:
                payload["submissionFingerprint"] = submission_fingerprint(body)
                payload["userMessageId"] = user_message.id
            if wait_for_job_ids:
                payload["waitForJobIds"] = wait_for_job_ids
                payload["inputDelivery"] = body.get("delivery") or "after-current"
                payload["inputRevision"] = 0
                if body.get("delivery") == "next-step":
                    target = TeachingJobs.query.filter_by(id=body.get("expectedJobId"), owner_id=user.id, thread_id=thread.id).first()
                    if target is None:
                        raise ConversationConflict("运行中的任务已变化，请查看最新状态后再补充。")
                    payload["steeringRootJobId"] = str((target.payload or {}).get("harnessRootJobId") or target.id)
                    assistant_text = "已收到补充，将在当前操作结束后的下一个执行边界处理；你可以编辑或撤回。"
                else:
                    assistant_text = "已排队，前面的任务处理完后会继续；你可以编辑或撤回这条要求。"

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
                "executionMode": mode,
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
        db.session.flush()

        job, _ = enqueue_job(
            owner_id=user.id,
            kind=job_kind,
            idempotency_key=(
                continuation_idempotency
                or submission_key
            ),
            payload=payload,
            dojo_id=thread.dojo_id,
            module_index=thread.module_index,
            thread_id=thread.id,
            priority=30 if generate else 80,
            publish=False,
            commit=False,
        )
        if job_kind == "agent.chat":
            root_id = str(agent_loop.get("rootJobId") or job.id)
            job.payload = {**(job.payload or {}), "harnessRootJobId": root_id,
                           "harnessInternal": root_id != job.id, "taskListHidden": root_id != job.id}
            if payload.get("inputDelivery") == "next-step":
                queued = TeachingJobs.query.filter_by(owner_id=user.id, thread_id=thread.id, kind="agent.chat", status="QUEUED").all()
                for row in queued:
                    from ...agent_runtime.model_inputs import request_payload, revise_pending_input
                    row_payload = request_payload(row)
                    if row.id != job.id and row_payload.get("waitForJobIds") and not row_payload.get("harnessInternal") and row_payload.get("inputDelivery") != "next-step":
                        revise_pending_input(row, {**row_payload, "waitForJobIds": list(dict.fromkeys([*row_payload["waitForJobIds"], job.id]))}, reason="steering-order")
        if question_source is not None:
            question_source.metadata_json = {**(question_source.metadata_json or {}), "questionReplyJobId": job.id,
                                            "questionAnswers": question_context["answers"]}
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
            source_metadata = dict(selected_generation['metadata'])
            source_selection = dict(
                selected_generation['selection'] or {}
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
            from ...agent_runtime.generation_events import record_generation
            record_generation(selected_generation, 'started', source_selection)
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
    except ConversationConflict as exc:
        db.session.rollback()
        return _error(exc, 409, code="TURN_CONFLICT")
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
    from ...runtime_profiles import authoring_runtime_constraints

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
    return authoring_runtime_constraints(brief, constraints)


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
                    if is_supported_exercise(challenge) and (challenge.data or {}).get("publication_state") != "DRAFT"
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
    skill = result.get("skill") or {}
    if tool == "skill.list":
        return f"你的账号有 {len(result.get('skills') or [])} 项已启用技能。"
    if tool == "skill.read":
        return f"已读取技能“{skill.get('name')}”。"
    if tool == "skill.create":
        return f"已创建技能“{skill.get('name')}”，下次对话即可使用。"
    if tool == "skill.update":
        return f"已更新技能“{skill.get('name')}”。"
    if tool == "skill.toggle":
        return f"技能“{skill.get('name')}”已{'启用' if skill.get('enabled') else '停用'}。"
    if tool == "skill.import":
        return f"已将内置技能“{skill.get('name')}”加入你的账号。"
    if tool == "skill.delete":
        return f"已删除技能“{result.get('deleted')}”。"
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
    if tool == "module.inquiry":
        return f"已创建流程探究式学习草稿“{(result.get('artifact') or {}).get('title')}”。请预览并审核后发布。"
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
    if tool == "module.inquiry":
        return "预览学习项目"
    if tool.startswith("skill."):
        return "返回 AI 共创"
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
        return execute_teacher_tool(_current_user(), _body(), request.headers.get("Idempotency-Key"))


SKILL_TOOL_NAMES = {
    "skill.list",
    "skill.read",
    "skill.create",
    "skill.update",
    "skill.toggle",
    "skill.import",
    "skill.delete",
}


def _skill_tool_argument_schema(tool, raw_arguments):
    schema = AGENT_TOOL_SCHEMAS.get(tool)
    if tool not in SKILL_TOOL_NAMES or schema is None:
        raise ValueError("Unsupported skill tool")
    risk, allowed_keys = schema
    raw_arguments = raw_arguments if isinstance(raw_arguments, dict) else {}
    arguments = {
        key: scrub_payload(raw_arguments[key], key)
        for key in allowed_keys
        if key in raw_arguments
    }
    if _json_size(arguments) > MAX_AGENT_CONTEXT_BYTES:
        raise ValueError("Skill tool arguments exceed 64 KiB")
    if tool != "skill.list":
        arguments = _skill_tool_arguments(arguments, require_name=True)
    return risk, arguments


def _skill_tool_arguments(arguments, *, require_name=False):
    arguments = arguments if isinstance(arguments, dict) else {}
    payload = {}
    markdown = str(arguments.get("skillMarkdown") or "").strip()
    if markdown:
        name, description, instructions = parse_skill_text(markdown)
        model_invocable, user_invocable = skill_invocation_from_markdown(markdown)
        payload.update({
            "name": name,
            "description": description,
            "instructions": instructions,
            "model_invocable": model_invocable,
            "user_invocable": user_invocable,
        })
    if arguments.get("name"):
        payload["name"] = arguments.get("name")
    for key in ("description", "instructions", "references", "enabled"):
        if arguments.get(key) is not None:
            payload[key] = arguments.get(key)
    for public_key, internal_key in (
        ("modelInvocable", "model_invocable"),
        ("userInvocable", "user_invocable"),
    ):
        if internal_key in arguments:
            payload[internal_key] = arguments[internal_key]
        if public_key in arguments:
            payload[internal_key] = arguments[public_key]
    if require_name and not payload.get("name"):
        raise ValueError("技能需要 name（或完整 SKILL.md 正文）")
    return payload


def teacher_tool_receipt(action, thread, *, deduplicated=False, accepted=False):
    view = _action_view(action)
    execution = view.get('execution') or {}
    data = {'action': view, 'result': view.get('result') or {},
            'thread': _thread_view(thread, include_messages=True), 'deduplicated': deduplicated}
    if execution.get('jobId'):
        job = TeachingJobs.query.filter_by(id=execution['jobId'], owner_id=action.actor_id).first()
        if job:
            data['job'] = job_view(job)
    receipt = execution.get('result') or {}
    data['message'] = receipt.get('message') or ('操作已提交，正在后台执行。' if view['status'] == 'EXECUTING'
                                               else _course_tool_message((action.request_json or {}).get('tool'), data['result']))
    return _ok(data, 202 if accepted or view['status'] == 'EXECUTING' else 200)


@teaching_namespace.route('/agent-tools/actions/<string:action_id>')
class TeacherToolCommand(Resource):
    @authed_only
    def get(self, action_id):
        user = _current_user()
        try:
            _require_teacher(user)
            action = TeachingAgentActions.query.filter_by(id=action_id, actor_id=user.id).first()
            if action is None or not (action.request_json or {}).get('tool'):
                raise ScopeError('Operation not found')
            thread = _thread_for_owner(action.thread_id, user)
            return teacher_tool_receipt(action, thread)
        except ScopeError as exc:
            return _error(exc, 404, code='NOT_FOUND')


def execute_teacher_tool(user, body, request_key=None):
    tool = str(body.get("tool") or "")
    thread = None
    risk = "R0"
    arguments = {}
    idempotency_key = None
    selected_generation = None
    confirmed_generation_plan = None
    approval_reference = None
    if tool in COURSE_NAVIGATION_TOOLS:
        return _error("Navigation tools must be opened from the conversation card")
    try:
        _require_teacher(user)
        thread = _thread_for_owner(str(body.get("threadId") or ""), user)
        raw_arguments = body.get("arguments")
        proposal_source_refs = []
        if tool == "module.inquiry" and body.get("sourceJobId"):
            source_job = TeachingJobs.query.filter_by(id=str(body["sourceJobId"]), owner_id=user.id, thread_id=thread.id, kind="agent.chat", status="SUCCEEDED").first()
            if source_job is None:
                raise ScopeError("创作来源任务不存在或尚未完成。")
            proposal_source_refs = (source_job.payload or {}).get("sourceRefs") or []
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
                    require_current=True,
                    lock=True,
                )
                trusted_proposal = _generation_option_proposal(
                    user,
                    thread,
                    selected_generation,
                )
                if trusted_proposal["tool"] != tool:
                    raise ValueError("所选方案不是 CTF 实践题生成方案。")
                raw_arguments = trusted_proposal["arguments"]
                proposal_source_refs = selected_generation['bundle']['sourceRefs']
            raw_arguments, confirmed_generation_plan = (
                _confirmed_challenge_generation_plan(
                    raw_arguments,
                    body.get("generationPlan"),
                )
            )
        if tool in SKILL_TOOL_NAMES:
            risk, arguments = _skill_tool_argument_schema(tool, raw_arguments)
        else:
            risk, arguments = _course_tool_arguments(tool, raw_arguments)
        if risk == "R3" and body.get("confirmed") is not True:
            return _error(
                "Explicit confirmation is required for this course change",
                409,
                code="CONFIRMATION_REQUIRED",
            )

        idempotency_key = _supplied_idempotency(user.id, "agent-tool", request_key)
        request_fingerprint = _agent_tool_request_fingerprint(
            thread.id, tool, arguments, confirmed_generation_plan, body,
        )
        if selected_generation and (selected_generation['selection'] or {}).get('commandActionId'):
            original = TeachingAgentActions.query.filter_by(id=selected_generation['selection']['commandActionId'], actor_id=user.id, thread_id=thread.id).first()
            if original is None or (original.request_json or {}).get('requestFingerprint') != request_fingerprint:
                raise GenerationOptionConflict('这个方案已经接收另一份生成计划，请查看原任务或重新提出要求。')
            response = teacher_tool_receipt(original, thread, deduplicated=True)
            db.session.rollback()
            return response
        if not _lock_agent_tool_request(idempotency_key):
            db.session.rollback()
            return _error(
                "同一操作仍在执行，请稍后用原编号重试。",
                409,
                code="OPERATION_IN_PROGRESS",
            )
        existing = TeachingAgentActions.query.filter_by(
            idempotency_key=idempotency_key,
            actor_id=user.id,
        ).first()
        if existing is not None:
            if not _same_agent_tool_request(
                existing, thread.id, tool, arguments,
                confirmed_generation_plan, request_fingerprint,
            ):
                db.session.rollback()
                return _error(
                    "这条操作编号已用于不同的请求，请使用新的编号重试。",
                    409,
                    code="IDEMPOTENCY_CONFLICT",
                )
            if action_execution(existing):
                response = teacher_tool_receipt(existing, thread, deduplicated=True)
                db.session.rollback()
                return response
            if existing.status not in {
                "APPROVED",
                "COMPLETED",
                "PENDING",
                "SUCCEEDED",
            }:
                db.session.rollback()
                return _error(
                    existing.error or "上一次操作未完成，请修正后重试。",
                    409,
                    code="PREVIOUS_ATTEMPT_FAILED",
                )
            response = _ok(
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
            db.session.rollback()
            return response

        operation = proposal_operation(request_key)
        if operation is not None:
            thread = TeachingAgentThreads.query.filter_by(
                id=thread.id, user_id=user.id,
            ).with_for_update().populate_existing().one()
            if thread.status != 'ACTIVE':
                raise ApprovalJournalError('请先恢复这个对话。', 'THREAD_ARCHIVED')
            message_id, proposal_index = operation
            source = TeachingAgentMessages.query.filter_by(
                id=message_id, thread_id=thread.id, user_id=user.id, role='assistant',
            ).with_for_update().populate_existing().first()
            from ...agent_runtime.tool_plan import message_metadata
            metadata = message_metadata(source) if source else {}
            raw_proposals = metadata.get('toolProposals')
            proposals = raw_proposals if isinstance(raw_proposals, list) else []
            if metadata.get('pending') is not False or proposal_index >= len(proposals):
                raise ApprovalJournalError('操作提议不存在或尚未完成。', 'PROPOSAL_NOT_READY')
            proposal = proposals[proposal_index]
            if not isinstance(proposal, dict) or proposal.get('tool') != tool:
                raise ApprovalJournalError('执行操作与提议不一致。', 'APPROVAL_REQUEST_CHANGED')
            normalize = _skill_tool_argument_schema if tool in SKILL_TOOL_NAMES else _course_tool_arguments
            _, proposed_arguments = normalize(tool, proposal.get('arguments'))
            if proposed_arguments != arguments:
                raise ApprovalJournalError('执行参数与批准请求不一致。', 'APPROVAL_REQUEST_CHANGED')
            if proposal.get('requiresConfirmation') is True:
                approval_reference = require_approved(
                    proposal_request(thread.id, message_id, proposal_index, proposal),
                    body.get('approvalRequest'),
                )

        dojo = None
        if tool not in {"course.list", "course.create", "module.inquiry"} | SKILL_TOOL_NAMES:
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

        if tool == "module.inquiry" and thread.dojo_id is not None:
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
                else "skill"
                if tool.startswith("skill.")
                else "assignment"
            ),
            target_id=(dojo.reference_id if dojo is not None else None),
            status="RUNNING",
            idempotency_key=idempotency_key,
            request_json={
                "dojoId": dojo.dojo_id if dojo is not None else None,
                "tool": tool,
                "arguments": arguments,
                "requestFingerprint": request_fingerprint,
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
        job = admit_teacher_tool(action, user, {
            'kind': 'teacher-tool', 'tool': tool, 'arguments': arguments, 'risk': risk,
            'request': action.request_json, 'approvalRequest': approval_reference,
            'scope': {'dojoId': dojo.dojo_id if dojo else None,
                      'threadDojoId': thread.dojo_id, 'moduleIndex': thread.module_index},
            'sourceRefs': proposal_source_refs,
            'generationPlan': confirmed_generation_plan,
            'generationSelection': ({'sourceMessageId': selected_generation['sourceMessage'].id,
                                     'optionId': body['generationSelection']['optionId']}
                                    if selected_generation else None),
        })
        if selected_generation:
            from ...agent_runtime.generation_events import record_generation
            admitted = {**selected_generation['selection'], 'commandActionId': action.id, 'commandJobId': job.id}
            record_generation(selected_generation, 'admitted', admitted)
        action.status = 'EXECUTING'
        db.session.commit()
        try:
            publish_pending_outbox(job_id=job.id)
        except Exception:
            logger.exception('Durable tool delivery will be retried from its saved outbox')
        return teacher_tool_receipt(action, thread, deduplicated=False, accepted=True)
    except ApprovalJournalError as exc:
        db.session.rollback()
        return _error(exc, exc.status, code=exc.code)
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
        if request.args.get("scope") == "projects":
            _require_teacher(user)
            try:
                return _ok(project_collection_view(
                    query, user.id,
                    search=request.args.get("q", ""),
                    artifact_type=request.args.get("type", ""),
                    generation_status=request.args.get("status", ""),
                    limit=request.args.get("limit", default=200, type=int),
                    offset=request.args.get("offset", default=0, type=int),
                ))
            except ValueError as exc:
                return _error(exc, 400, code="INVALID_FILTER")
        rows = query.order_by(TeachingArtifacts.updated.desc()).limit(200).all()
        return _ok(
            {"artifacts": [artifact_view(row, include_content=False) for row in rows]}
        )


@teaching_namespace.route("/artifacts/<string:artifact_id>/course")
class ArtifactCourseBinding(Resource):
    @authed_only
    def post(self, artifact_id):
        user = _current_user()
        try:
            _require_teacher(user)
            artifact = artifact_for_user(artifact_id, user)
            body = _body()
            if artifact.self_workspace_id is not None or artifact.dojo_id is not None:
                raise ValueError("只有生成项目合集中的独立作品可以关联课程。")
            if artifact.status in {"ARCHIVED", "DELETED", "GENERATING", "PUBLISHED"}:
                raise ValueError("请等待作品生成完成后再关联课程。")
            if body.get("expectedRevision") != artifact.current_revision:
                return _error("版本已经变化，请刷新后重试。", 409, code="REVISION_CONFLICT")
            dojo = dojo_for_user(user, body.get("dojoId"), teacher=True)
            module_index = body.get("moduleIndex")
            module = next((item for item in dojo.modules if item.module_index == module_index), None)
            if module is None:
                raise ValueError("请选择该课程中真实存在的章节。")
            artifact.dojo_id = dojo.dojo_id
            artifact.module_index = module.module_index
            artifact.updated = datetime.datetime.utcnow()
            _management_audit(user, "artifact.bind_course", "teaching_artifact", artifact.id,
                              {"dojoId": dojo.dojo_id, "moduleIndex": module.module_index})
            db.session.commit()
            return _ok({"artifact": artifact_view(artifact, include_content=False)})
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (ValueError, TypeError) as exc:
            db.session.rollback()
            return _error(exc, 400, code="INVALID_REQUEST")


@teaching_namespace.route("/artifacts/bulk-delete")
class ArtifactBulkDelete(Resource):
    @authed_only
    def post(self):
        user = _current_user()
        try:
            _require_teacher(user)
            body = _body()
            project_scope = body.get("scope") == "projects"
            dojo = None
            if body.get("scope") not in (None, "projects"):
                raise ArtifactBulkDeleteError("管理范围无效。")
            if not project_scope:
                try:
                    dojo_id = int(body.get("dojoId"))
                except (TypeError, ValueError) as exc:
                    raise ArtifactBulkDeleteError("课程标识无效，请刷新页面后重试。") from exc
                dojo = dojo_for_user(user, dojo_id, teacher=True)
            requested_ids = body.get("artifactIds")
            if not isinstance(requested_ids, list) or not 1 <= len(requested_ids) <= 100:
                raise ArtifactBulkDeleteError("请选择 1 至 100 项未发布内容。")
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
                    TeachingArtifacts.dojo_id.is_(None) if project_scope else TeachingArtifacts.dojo_id == dojo.dojo_id,
                    TeachingArtifacts.self_workspace_id.is_(None),
                    TeachingArtifacts.status.notin_(("ARCHIVED", "DELETED")),
                )
                .order_by(TeachingArtifacts.id)
                .with_for_update()
                .all()
            )
            if len(artifacts) != len(artifact_ids):
                raise ArtifactBulkDeleteError(
                    "列表已变化或包含不可管理的内容，请刷新后重新选择。",
                    409,
                )
            non_courseware_types = COURSEWARE_EXCLUDED_ARTIFACT_TYPES
            if not project_scope and any(row.artifact_type in non_courseware_types for row in artifacts):
                raise ArtifactBulkDeleteError("批量删除仅适用于课程课件与教案。", 409)
            if any(row.status == "PUBLISHED" for row in artifacts):
                raise ArtifactBulkDeleteError("已发布内容不能混入未发布内容批量删除。", 409)
            if any(row.published_challenge_id is not None for row in artifacts):
                raise ArtifactBulkDeleteError("选中的内容已发布为题目，请到题目管理中处理。", 409)

            active_artifact_ids = {
                str(reference)
                for references in TeachingJobs.query.filter(
                    TeachingJobs.owner_id == user.id,
                    TeachingJobs.status.in_(_ARTIFACT_ACTIVE_JOB_STATUSES),
                    or_(
                        TeachingJobs.payload["artifactId"].as_string().in_(artifact_ids),
                        TeachingJobs.result["artifactId"].as_string().in_(artifact_ids),
                    ),
                )
                .with_entities(TeachingJobs.payload["artifactId"].as_string(), TeachingJobs.result["artifactId"].as_string())
                .all()
                for reference in references if reference
            }
            if any(
                row.status in {"GENERATING", "VALIDATING", "PUBLISHING"}
                or row.id in active_artifact_ids
                for row in artifacts
            ):
                raise ArtifactBulkDeleteError(
                    "有内容仍在生成或检查，请等待任务结束后再删除；本次未删除任何内容。",
                    409,
                )

            now = datetime.datetime.utcnow()
            for artifact in artifacts:
                artifact.status = "ARCHIVED"
                artifact.updated = now
            _management_audit(
                user,
                "artifact.manage.bulk_delete",
                "project_collection" if project_scope else "dojo",
                str(user.id) if project_scope else dojo.reference_id,
                {
                    "dojoId": None if project_scope else dojo.dojo_id,
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
                "批量删除失败，列表未发生变化。",
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


_ARTIFACT_ACTIVE_JOB_STATUSES = ("QUEUED", "RUNNING", "CANCEL_REQUESTED")


def _artifact_job_query(artifact_id, owner_id):
    return TeachingJobs.query.filter(
        TeachingJobs.owner_id == owner_id,
        TeachingJobs.kind.in_(["artifact.materialize", "artifact.revise"]),
        or_(
            TeachingJobs.payload["artifactId"].astext == artifact_id,
            TeachingJobs.result["artifactId"].astext == artifact_id,
        ),
    )


def _job_activity_sources(job, view):
    event_job = job
    event_jobs = [job]
    if (job.payload or {}).get("harnessVersion"):
        seen = {job.id}
        for _ in range(20):
            next_id = (event_job.payload or {}).get("harnessNextJobId")
            if not next_id or next_id in seen:
                break
            next_job = TeachingJobs.query.filter_by(
                id=next_id, owner_id=job.owner_id, thread_id=job.thread_id,
            ).first()
            if next_job is None:
                break
            seen.add(next_id)
            event_jobs.append(next_job)
            event_job = next_job
    child_id = (view.get("result") or {}).get("materializationJobId")
    if child_id and job.kind in ("candidate.generate", "self.candidate.generate"):
        child = TeachingJobs.query.filter_by(
            id=child_id, owner_id=job.owner_id, kind="artifact.materialize"
        ).first()
        if child is not None:
            event_jobs = [child]
    if job.thread_id and (job.payload or {}).get("harnessVersion"):
        known_ids = {source.id for source in event_jobs}
        children = TeachingJobs.query.filter(
            TeachingJobs.owner_id == job.owner_id,
            TeachingJobs.thread_id == job.thread_id,
            TeachingJobs.payload["harnessRootJobId"].astext == job.id,
        ).order_by(TeachingJobs.created, TeachingJobs.id).all()
        event_jobs.extend(child for child in children if child.id not in known_ids)
    return event_jobs


def _job_activity_view(job, *, after_sequence=None, event_stream_id=None):
    view = job_view(job)
    event_job = job
    event_jobs = [job]
    if (job.payload or {}).get("harnessVersion"):
        seen = {job.id}
        for _ in range(20):
            next_id = (event_job.payload or {}).get("harnessNextJobId")
            if not next_id or next_id in seen:
                break
            next_job = TeachingJobs.query.filter_by(
                id=next_id, owner_id=job.owner_id, thread_id=job.thread_id,
            ).first()
            if next_job is None:
                break
            seen.add(next_id)
            event_jobs.append(next_job)
            event_job = next_job
    child_id = (view.get("result") or {}).get("materializationJobId")
    if child_id and job.kind in ("candidate.generate", "self.candidate.generate"):
        child = TeachingJobs.query.filter_by(
            id=child_id, owner_id=job.owner_id, kind="artifact.materialize"
        ).first()
        if child is not None:
            event_jobs = [child]
    messages = {
        "任务已持久化，等待执行": "已加入队列，等待开始",
        "Worker 已获取任务租约": "已分配执行资源，准备开始",
        "保存候选与 revision": "正在保存生成结果和新版本",
    }
    stream_id = hashlib.sha256("|".join(source.id for source in event_jobs).encode()).hexdigest()[:24]
    sequence_counts = [
        db.session.query(func.max(TeachingJobEvents.sequence))
        .filter(TeachingJobEvents.job_id == source.id)
        .scalar() or 0
        for source in event_jobs
    ]
    last_sequence = sum(sequence_counts)
    reset = (
        after_sequence is None
        or event_stream_id != stream_id
        or after_sequence > last_sequence
    )
    cursor = 0 if reset else after_sequence
    events = []
    offset = 0
    for source, count in zip(event_jobs, sequence_counts):
        if offset + count <= cursor:
            offset += count
            continue
        for event in job_events_view(source.id, after_sequence=max(0, cursor - offset)):
            events.append({
                **event,
                "id": f"{source.id}:{event['sequence']}",
                "sourceJobId": source.id,
                "sourceSequence": event["sequence"],
                "sequence": offset + event["sequence"],
                "message": messages.get(event["message"], event["message"]),
            })
        offset += count
    return {
        "job": view,
        "events": events,
        "eventStreamId": stream_id,
        "lastSequence": last_sequence,
        "reset": reset,
    }


def _artifact_progress_view(artifact, user):
    job = _artifact_job_query(artifact.id, user.id).order_by(
        case((TeachingJobs.status.in_(_ARTIFACT_ACTIVE_JOB_STATUSES), 0), else_=1),
        TeachingJobs.updated.desc(),
        TeachingJobs.created.desc(),
        TeachingJobs.id.desc(),
    ).first()
    if job is not None and (job.payload or {}).get("taskListHidden"):
        parent_id = (job.payload or {}).get("parentGenerationJobId")
        parent = TeachingJobs.query.filter_by(id=parent_id, owner_id=user.id).first() if parent_id else None
        if parent is not None and parent.kind in ("candidate.generate", "self.candidate.generate"):
            result = job_view(parent).get("result") or {}
            if result.get("materializationJobId") == job.id and result.get("artifactId") == artifact.id:
                job = parent
    activity = _job_activity_view(job) if job is not None else {"job": None, "events": []}
    return {
        "artifactId": artifact.id,
        "artifactStatus": artifact.status,
        "currentRevision": artifact.current_revision,
        "job": {**activity["job"], "events": activity["events"]} if activity["job"] else None,
    }


@teaching_namespace.route("/artifacts/<string:artifact_id>/progress")
class ArtifactProgress(Resource):
    @authed_only
    def get(self, artifact_id):
        try:
            user = _current_user()
            artifact = artifact_for_viewer(artifact_id, user)
            if _artifact_student_safe_for_user(artifact, user):
                raise ScopeError("Artifact not found")
            return _ok(_artifact_progress_view(artifact, user))
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")


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
                    _personal_artifact_visibility_label(artifact)
                    if personal
                    else "学生可见"
                    if artifact.status == "PUBLISHED"
                    else "仅教师可见"
                ),
                "publishedAt": _timestamp(artifact.published),
            }
            if not student_safe:
                progress = _artifact_progress_view(artifact, user)
                data["progressJob"] = progress["job"]
                data["activeJob"] = (
                    progress["job"] if progress["job"]
                    and progress["job"]["status"] in _ARTIFACT_ACTIVE_JOB_STATUSES else None
                )
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

                source_job = _artifact_job_query(artifact.id, artifact.owner_id).order_by(
                    TeachingJobs.created.desc(), TeachingJobs.id.desc()
                ).first()
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
                if artifact.dojo_id is not None:
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
                if artifact.dojo_id is not None:
                    dojo_for_user(user, artifact.dojo_id, teacher=True)
            if artifact.published_challenge_id is not None:
                raise ValueError("该内容已发布为 CTF 题目，请从实训题目列表删除。")
            if artifact.status in {
                "GENERATING",
                "VALIDATING",
                "PUBLISHING",
            } or TeachingJobs.query.filter(
                TeachingJobs.owner_id == user.id,
                TeachingJobs.status.in_(_ARTIFACT_ACTIVE_JOB_STATUSES),
                or_(
                    TeachingJobs.payload["artifactId"].as_string() == artifact.id,
                    TeachingJobs.result["artifactId"].as_string() == artifact.id,
                ),
            ).with_entities(TeachingJobs.id).first():
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
            workspace = SelfLearningWorkspaces.query.filter_by(
                id=artifact.self_workspace_id,
                student_id=user.id,
            ).first()
            if workspace is None:
                raise ScopeError("Artifact not found")
            _queue_personal_artifact_review(workspace, artifact, actor_id=user.id)
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
        except SelfLearningReviewStateConflict as exc:
            db.session.rollback()
            return _error(exc, 409, code="REVIEW_STATE_CONFLICT")


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
                if artifact.owner_id != user.id or artifact.self_workspace_id is not None:
                    raise ScopeError("Artifact not found")
            else:
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
        return revise_teacher_artifact(_current_user(), artifact_id, _body(), request.headers.get("Idempotency-Key"))


def revise_teacher_artifact(user, artifact_id, body, request_key=None):
    try:
        artifact = artifact_for_user(artifact_id, user)
        if artifact.owner_id != user.id:
            raise ScopeError("Only the artifact owner may revise it")
        operation_key = _supplied_idempotency(user.id, "artifact-revise", request_key)
        existing = TeachingJobs.query.filter_by(owner_id=user.id, idempotency_key=operation_key).first()
        if existing is not None:
            if (existing.payload or {}).get("artifactId") != artifact.id or (existing.payload or {}).get("instruction") != str(body.get("instruction") or "").strip():
                return _error("这次操作的编号已用于不同的修改要求。", 409, code="REVISION_CONFLICT")
            return _ok({"job": job_view(existing), "deduplicated": True}, 202)
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
        current_content = (artifact_view(artifact).get("revision") or {}).get("content")
        source_issue = artifact_revision_source_issue(artifact.artifact_type, current_content)
        if source_issue:
            return _error(source_issue, 409, code="REVISION_SOURCE_NOT_READY")
        job, _ = enqueue_job(
            owner_id=user.id,
            kind="artifact.revise",
            idempotency_key=operation_key,
            payload={
                "artifactId": artifact.id,
                "expectedRevision": expected,
                "instruction": instruction,
                "currentContent": current_content,
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
            artifact = TeachingArtifacts.query.filter_by(id=artifact.id).with_for_update().populate_existing().one()
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
                TeachingAgentActions.status.in_(["VALIDATING", "AWAITING_APPROVAL", "EXECUTING", "APPROVED"]),
                TeachingAgentActions.request_json["expectedRevision"].astext == str(expected_revision),
            ).first()
            if existing:
                view = _action_view(existing)
                return _ok({"action": view}, 200 if view['status'] == 'APPROVED' else 202)
            if artifact.status == 'PUBLISHED':
                return _error('这个项目版本已经发布。', 409, code='ALREADY_PUBLISHED')

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
            query = query.filter(func.coalesce(TeachingJobs.payload["harnessInternal"].astext, "false") != "true")
            query = query.filter(TeachingJobs.kind.notin_(("material.analyze", "material.enrich")))
            effective_status = func.coalesce(TeachingJobs.payload["harnessStatus"].astext, TeachingJobs.status)
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
                    effective_status.in_(("QUEUED", "RUNNING", "CANCEL_REQUESTED"))
                )
            elif view == "attention":
                query = query.filter(effective_status.in_(("FAILED", "CANCELED")))
            elif view == "history":
                query = query.filter(
                    effective_status.in_(("SUCCEEDED", "FAILED", "CANCELED"))
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
            raw_sequence = request.args.get("afterSequence")
            after_sequence = None
            if raw_sequence is not None:
                if not raw_sequence.isdigit() or len(raw_sequence) > 12:
                    return _error("invalid event cursor", 400, code="INVALID_CURSOR")
                after_sequence = int(raw_sequence)
            return _ok(_job_activity_view(
                job,
                after_sequence=after_sequence,
                event_stream_id=str(request.args.get("eventStreamId") or ""),
            ))
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


@teaching_namespace.route("/jobs/<string:job_id>/input")
class TeachingPendingInput(Resource):
    @authed_only
    def patch(self, job_id):
        from ...agent_runtime.conversation import validated_pending_input
        from ...agent_runtime.jobs import append_job_event
        from ...agent_runtime.model_inputs import ModelInputError, request_payload, revise_pending_input

        user = _current_user()
        try:
            _require_teacher(user)
            owned = _job_for_user(job_id, user)
            thread = TeachingAgentThreads.query.filter_by(id=owned.thread_id, user_id=user.id).with_for_update().one_or_none()
            if thread is None or thread.status != "ACTIVE":
                raise ScopeError("对话不可用。")
            job = TeachingJobs.query.filter_by(id=job_id, owner_id=user.id, thread_id=thread.id).with_for_update().populate_existing().one()
            if job.kind != "agent.chat":
                raise ConversationConflict("此任务不是排队输入，不能编辑。")
            body = _body()
            payload = request_payload(job)
            content, revision = validated_pending_input(payload, job.status, body.get("content"), body.get("revision"), MAX_MESSAGE_CHARS)
            message = TeachingAgentMessages.query.filter_by(id=payload.get("userMessageId"), user_id=user.id, thread_id=thread.id, role="user").first()
            if message is None:
                raise ConversationConflict("原始输入已不存在，未修改任务。")
            message.content = content
            revise_pending_input(job, {**payload, "prompt": content, "inputRevision": revision}, reason="teacher-edit")
            job.updated = thread.updated = datetime.datetime.utcnow()
            append_job_event(job, "input-updated", job.status, "排队中的要求已修改", details={"revision": revision})
            db.session.commit()
            return _ok({"job": job_view(job), "thread": _thread_view(thread, include_messages=True)})
        except (ScopeError, ConversationConflict, ModelInputError) as exc:
            db.session.rollback()
            return _error(exc, 404 if isinstance(exc, ScopeError) else 409, code="NOT_FOUND" if isinstance(exc, ScopeError) else "INPUT_CONFLICT")


@teaching_namespace.route("/jobs/<string:job_id>/events")
class TeachingJobActivity(Resource):
    @authed_only
    def get(self, job_id):
        from ...agent_runtime.activity import activity_event_page, InvalidActivityCursor

        try:
            job = _job_for_user(job_id, _current_user())
            view = job_view(job)
            sources = _job_activity_sources(job, view)
            page = activity_event_page(
                job.id, [source.id for source in sources],
                lambda source_id, after, limit: job_events_view(
                    source_id, after_sequence=after, limit=limit),
                cursor=request.args.get("cursor"),
                page_size=request.args.get("limit", default=128, type=int) or 128,
            )
            return _ok({**page, "job": view})
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except InvalidActivityCursor as exc:
            return _error(exc, 400, code="INVALID_ACTIVITY_CURSOR")


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
        body = _body()
        decision = str(body.get('decision') or '').upper()
        if body.get('confirmed') is not True or decision not in {'APPROVED', 'REJECTED'}:
            return _error('Explicit confirmed approval or rejection is required')
        try:
            action = TeachingAgentActions.query.filter_by(id=action_id).with_for_update().populate_existing().first()
            _action_for_teacher(action, user)
            envelope = action_request(action)
            prior = recorded_decision(action.thread_id, envelope['id'])
            legacy = TeachingAgentApprovals.query.filter_by(action_id=action.id).first()
            if prior is not None:
                decide_approval(envelope, body.get('approvalRequest'), decision, user.id)
                view = _action_view(action)
                return _ok({'action': view, 'deduplicated': True},
                           202 if view['status'] == 'EXECUTING' else 200)
            if legacy is not None:
                if legacy.decision != decision:
                    raise ApprovalJournalError('这项请求已有决定。', 'ALREADY_DECIDED')
                return _ok({'action': _action_view(action), 'deduplicated': True, 'legacy': True})
            if action.status != 'AWAITING_APPROVAL':
                return _error('操作尚未就绪或已经取消。', 409, code='ACTION_NOT_READY')
            prepare_action(action, user, decision)
            decide_approval(envelope, body.get('approvalRequest'), decision, user.id, body.get('comment'))
            db.session.add(TeachingAgentApprovals(
                action_id=action.id, approver_id=user.id, decision=decision,
                comment=str(body.get('comment') or '')[:8000],
            ))
            if decision == 'REJECTED':
                action.result, _ = apply_action(action, user, decision)
                action.status = 'REJECTED'
                action.error = None
                action.completed = datetime.datetime.utcnow()
                db.session.commit()
                return _ok({'action': _action_view(action), 'deduplicated': False})
            command = admit_action(action, user)
            command_id = command.id
            action.status = 'EXECUTING'
            action.error = None
            action.completed = None
            db.session.commit()
            publish_pending_outbox(job_id=command_id)
            return _ok({'action': _action_view(action), 'deduplicated': False}, 202)
        except (ApprovalJournalError, ApprovedActionError) as exc:
            return _error(exc, exc.status, code=exc.code)
        except (ScopeError, ValueError) as exc:
            return _error(exc, 404 if isinstance(exc, ScopeError) else 409,
                          code='NOT_FOUND' if isinstance(exc, ScopeError) else 'INVALID_REQUEST')
        finally:
            db.session.rollback()


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
            stage_only = conversation_upload and str(
                request.form.get("stageOnly") or ""
            ).lower() in {"1", "true", "yes"}
            ask_intent = conversation_upload and (
                str(request.form.get("askIntent") or "").strip().lower()
                not in {"0", "false", "no"}
            )
            if upload is None or not upload.filename:
                return _error("请选择要上传的课程资料。")
            thread = _thread_for_owner(thread_id, user) if thread_id else None
            if conversation_upload and thread is None:
                thread = TeachingAgentThreads(
                    user_id=user.id,
                    title="新教学对话",
                    phase="COURSE_SETUP",
                    context={},
                )
                db.session.add(thread)
                db.session.flush()
            if thread is not None and thread.status != "ACTIVE":
                return _error("请先恢复这个对话，再上传文件。", 409, code="THREAD_ARCHIVED")
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
                            "mimeType": "text/plain" if locally_extractable(existing.filename) else existing.mime_type,
                            "sourceMimeType": existing.mime_type,
                            "localExtraction": locally_extractable(existing.filename),
                            "size": existing.size,
                            "storageKey": existing.storage_key,
                        },
                        dojo_id=existing.dojo_id,
                        module_index=(
                            thread.module_index
                            if thread is not None and existing.dojo_id is not None
                            else None
                        ),
                        thread_id=thread.id if thread and not stage_only else None,
                        priority=20,
                    )
                if conversation_upload and not stage_only:
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
                        "questionAsked": bool(ask_intent and not stage_only),
                    }
                )

            filename = _safe_material_filename(upload.filename)
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
                    "mimeType": "text/plain" if locally_extractable(filename) else mime_type,
                    "sourceMimeType": mime_type,
                    "localExtraction": locally_extractable(filename),
                    "size": len(raw),
                    "storageKey": storage_key,
                },
                dojo_id=dojo.dojo_id if dojo is not None else None,
                module_index=(
                    thread.module_index
                    if thread is not None and dojo is not None
                    else None
                ),
                thread_id=thread.id if thread and not stage_only else None,
                priority=20,
            )
            if conversation_upload and not stage_only:
                _record_conversation_upload(
                    thread,
                    user,
                    material,
                    job,
                    ask_intent=ask_intent,
                )
            else:
                db.session.commit()
            return _ok(
                {
                    "materialId": material.id,
                    "job": job_view(job),
                    "thread": (
                        _thread_view(thread, include_messages=True)
                        if conversation_upload
                        else None
                    ),
                    "questionAsked": bool(ask_intent and not stage_only),
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
        return analyze_teacher_material(_current_user(), material_id, _body(), request.headers.get("Idempotency-Key"))


def analyze_teacher_material(user, material_id, body, request_key=None):
    try:
        _require_teacher(user)
        material = _material_for_teacher(material_id, user, lock=True)
        thread_id = str(body.get("threadId") or "").strip() or None
        thread = _thread_for_owner(thread_id, user) if thread_id else None
        if thread and thread.dojo_id not in {None, material.dojo_id}:
            raise ScopeError("Thread and material course scopes differ")
        operation_key = _supplied_idempotency(user.id, "material-analyze", request_key) if request_key else None
        if operation_key:
            existing = TeachingJobs.query.filter_by(owner_id=user.id, idempotency_key=operation_key).first()
            if existing is not None:
                if (existing.payload or {}).get("materialId") != material.id:
                    return _error("这次操作的编号已用于另一份材料。", 409)
                return _ok({"materialId": material.id, "job": job_view(existing), "deduplicated": True}, 202)

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
            idempotency_key=operation_key or f"material-analyze:{user.id}:{material.id}:{revision.id}",
            payload={
                "materialId": material.id,
                "revisionId": revision.id,
                "filename": material.filename,
                "mimeType": "text/plain" if locally_extractable(material.filename) else material.mime_type,
                "sourceMimeType": material.mime_type,
                "localExtraction": locally_extractable(material.filename),
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
        body = _body()
        try:
            _require_teacher(user)
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


@teaching_namespace.route("/insights/<string:dojo_id>")
class TeachingInsights(Resource):
    @authed_only
    def get(self, dojo_id):
        from ...learning.insights import course_insights
        try:
            dojo = dojo_for_user(_current_user(), dojo_id, teacher=True)
            return {"success": True, "data": course_insights(dojo, request.args)}, 200, {"Cache-Control": "private, no-store"}
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc)


@teaching_namespace.route("/insights/<string:dojo_id>/evidence/<int:student_id>")
class TeachingInsightsEvidence(Resource):
    @authed_only
    def get(self, dojo_id, student_id):
        from ...learning.insights import student_task_evidence
        try:
            dojo = dojo_for_user(_current_user(), dojo_id, teacher=True)
            result = student_task_evidence(dojo, student_id, str(request.args.get("taskKey") or ""), before=request.args.get("before"), limit=request.args.get("limit", 30))
            return {"success": True, "data": result}, 200, {"Cache-Control": "private, no-store"}
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError) as exc:
            return _error(exc)


@teaching_namespace.route("/insights/<string:dojo_id>/checks/<int:student_id>/<int:receipt_id>")
class TeachingInsightsCodingChecks(Resource):
    @authed_only
    def get(self, dojo_id, student_id, receipt_id):
        from ...learning.insights import coding_check_page
        try:
            dojo = dojo_for_user(_current_user(), dojo_id, teacher=True)
            result = coding_check_page(dojo, student_id, str(request.args.get("taskKey") or ""), receipt_id, offset=request.args.get("offset", 0), result_filter=request.args.get("filter", "failed"))
            return {"success": True, "data": result}, 200, {"Cache-Control": "private, no-store"}
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError) as exc:
            return _error(exc)


@teaching_namespace.route("/insights/<string:dojo_id>/followups")
class TeachingInsightsFollowups(Resource):
    @authed_only
    def post(self, dojo_id):
        from ...learning.insights import create_followup
        try:
            user = _current_user()
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            return _ok(create_followup(dojo, user, _body()), 201)
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc)


@teaching_namespace.route("/insights/<string:dojo_id>/followups/<string:identity>/review")
class TeachingInsightsFollowupReview(Resource):
    @authed_only
    def post(self, dojo_id, identity):
        from ...learning.insights import review_followup
        try:
            user = _current_user()
            dojo = dojo_for_user(user, dojo_id, teacher=True)
            return _ok(review_followup(dojo, user, identity, _body()))
        except ScopeError as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except (TypeError, ValueError) as exc:
            db.session.rollback()
            return _error(exc)


@teaching_namespace.route("/insights/<string:dojo_id>/export")
class TeachingInsightsExport(Resource):
    @authed_only
    def get(self, dojo_id):
        from ...learning.insights import course_insights
        try:
            dojo = dojo_for_user(_current_user(), dojo_id, teacher=True)
            report = course_insights(dojo, request.args)
        except ScopeError as exc:
            return _error(exc, 404, code="NOT_FOUND")
        except ValueError as exc:
            return _error(exc)
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["玄甲学情", _learning_export_cell(dojo.name), report["asOf"]])
        writer.writerow(["活动范围", report["scope"]["label"], "累计完成截至快照时间，不受活动时间筛选影响"])
        writer.writerow(["学生ID", "学生", "学习状态", "累计完成必修", "必修总数", "期间活动记录", "最近学习记录"] + [_learning_export_cell(t["name"]) for t in report["tasks"]])
        for student in report["students"]:
            cells = {c["taskKey"]: c for c in student["cells"]}
            writer.writerow([student["userId"], _learning_export_cell(student["name"]), student["statusLabel"], student["completed"], student["required"], student["periodRecords"], student["lastActivity"] or "暂无记录"] + [cells.get(t["key"], {}).get("statusLabel", "尚未开始") for t in report["tasks"]])
        response = send_file(io.BytesIO(output.getvalue().encode("utf-8-sig")), mimetype="text/csv; charset=utf-8", as_attachment=True, download_name=f"learning-insights-{secure_filename(dojo.reference_id)}.csv", max_age=0)
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Analytics-As-Of"] = report["asOf"]
        return response


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
                        _workspace_visibility_label(row)
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
            action = _queue_personal_artifact_review(
                workspace, artifact, actor_id=user.id
            )
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
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except SelfLearningReviewStateConflict as exc:
            db.session.rollback()
            return _error(exc, 409, code="REVIEW_STATE_CONFLICT")


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
                if dojo_id is None:
                    if not target.startswith("/prep/"):
                        return _error("请选择生成项目合集中的作品进行预览。", 400, code="PROJECT_REQUIRED")
                    artifact = artifact_for_user(target.rstrip("/").rsplit("/", 1)[-1], user)
                    if artifact.owner_id != user.id or artifact.dojo_id is not None or artifact.self_workspace_id is not None:
                        raise ScopeError("Artifact not found")
                    module_index = None
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


@teaching_namespace.route("/runtime/jobs/<string:job_id>/model-events")
class AgentRuntimeModelEvents(Resource):
    @bypass_csrf_protection
    def post(self, job_id):
        try:
            require_service_auth()
            return _ok(record_model_event(job_id, _body()), 201)
        except AgentRuntimeAuthError:
            db.session.rollback()
            return _error("Model job not found", 404, code="NOT_FOUND")
        except ModelJournalError as exc:
            db.session.rollback()
            return _error(exc, exc.status, code="MODEL_EVENT_REJECTED")


@teaching_namespace.route("/runtime/jobs/<string:job_id>/material")
class AgentRuntimeJobMaterial(Resource):
    @bypass_csrf_protection
    def get(self, job_id):
        try:
            require_service_auth()
            job = TeachingJobs.query.filter_by(
                id=job_id
            ).filter(TeachingJobs.kind.in_(("material.analyze", "material.enrich"))).first()
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
            if job.kind == "material.enrich":
                revision = TeachingMaterialRevisions.query.filter_by(
                    id=job.payload.get("revisionId"), material_id=material.id,
                    status="READY",
                ).first()
                if revision is None:
                    return _error("资料原文索引尚未就绪", 409, code="MATERIAL_INDEX_NOT_READY")
                rows = (
                    db.session.query(TeachingMaterialChunks.content)
                    .filter_by(revision_id=revision.id)
                    .order_by(TeachingMaterialChunks.ordinal)
                    .all()
                )
                indexed_text = "".join(content for (content,) in rows)
                coverage = ((revision.metadata_json or {}).get("analysis") or {}).get("coverage") or {}
                extracted_chars = coverage.get("extractedCharacters")
                if (
                    not indexed_text.strip()
                    or (isinstance(extracted_chars, int) and extracted_chars != len(indexed_text))
                ):
                    return _error("资料原文索引不完整", 409, code="MATERIAL_INDEX_INCOMPLETE")
                return send_file(
                    io.BytesIO(indexed_text.encode("utf-8")),
                    mimetype="text/plain; charset=utf-8",
                    as_attachment=True,
                    download_name=material.filename + ".txt",
                    conditional=False,
                )
            if job.payload.get("localExtraction"):
                return _error(
                    "资料原文仅由后台索引 Worker 处理。",
                    409,
                    code="MATERIAL_INDEX_WORKER_REQUIRED",
                )
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
    if scope.role == "teacher" and scope.dojo_id is None and (
        artifact.owner_id != user.id or artifact.dojo_id is not None or artifact.self_workspace_id is not None
    ):
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
            elif scope.role == "teacher":
                query = query.filter_by(dojo_id=None, self_workspace_id=None)
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


@teaching_namespace.route("/runtime/lessons/<string:artifact_id>/studio")
class AgentRuntimeCoursewareStudio(Resource):
    @bypass_csrf_protection
    def get(self, artifact_id):
        try:
            user, scope, _ = _service_lesson_session()
            if scope.role != "teacher":
                raise ScopeError("Courseware studio not found")
            artifact = _lesson_artifact(artifact_id, user, scope)
            if artifact.owner_id != user.id or artifact.status == "ARCHIVED":
                raise ScopeError("Courseware studio not found")
            if request.args.get("authorize") == "1":
                return _ok({"ownerId": user.id, "status": artifact.status})
            lesson = _lesson_payload(artifact)
            requested = request.args.get("revision", type=int)
            if requested is not None:
                revision = TeachingArtifactRevisions.query.filter_by(
                    artifact_id=artifact.id, revision=requested,
                ).first()
                if revision is None:
                    raise ScopeError("Revision not found")
                content = revision.content
                prior = content.get("lesson") if isinstance(content.get("lesson"), dict) else content
                lesson = {**prior, "id": artifact.id, "__aiseceduRevision": requested}
            rows = TeachingArtifactRevisions.query.filter_by(
                artifact_id=artifact.id,
            ).order_by(TeachingArtifactRevisions.revision.desc()).limit(100).all()
            current = current_artifact_revision(artifact)
            return _ok({
                "lesson": lesson,
                "ownerId": user.id,
                "status": artifact.status,
                "canPublish": artifact.dojo_id is not None and artifact.self_workspace_id is None,
                "sourceRefs": current.source_refs if current else [],
                "revisions": [{"revision": row.revision, "instruction": row.instruction,
                               "created": row.created.isoformat() + "Z"} for row in rows],
            })
        except (AgentRuntimeAuthError, ScopeError) as exc:
            return _error(exc, 404, code="NOT_FOUND")


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
            action = _queue_personal_artifact_review(
                workspace, artifact, actor_id=user.id
            )
            db.session.commit()
            return _ok({"actionId": action.id, "status": action.status}, 202)
        except (AgentRuntimeAuthError, ScopeError) as exc:
            db.session.rollback()
            return _error(exc, 404, code="NOT_FOUND")
        except SelfLearningReviewStateConflict as exc:
            db.session.rollback()
            return _error(exc, 409, code="REVIEW_STATE_CONFLICT")


@teaching_namespace.route("/authoring-standards")
class AuthoringStandards(Resource):
    @authed_only
    def get(self):
        from ...authoring_standards import resolve, provenance, StandardsError
        try:
            user = get_current_user()
            _require_teacher(user)
            reference = request.args.get("dojo")
            dojo = dojo_for_user(user, reference, teacher=True) if reference else None
            bundle = resolve(course_id=dojo.dojo_id if dojo else None, question_type=request.args.get("type", "general"), assignment_id=request.args.get("assignment"))
            return _ok({"standards": bundle, "provenance": provenance(bundle)})
        except ScopeError as error:
            return _error(str(error), 403)
        except (StandardsError, ValueError) as error:
            return _error(str(error), 400)

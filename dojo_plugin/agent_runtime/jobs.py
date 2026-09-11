import datetime
import json
import logging
import os
import re
import socket
import threading
import time
import uuid
from urllib.parse import quote, urlencode

import redis
import requests
from flask import current_app
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from CTFd.models import Users, db

from .. import config
from ..models import (
    ConversationCards,
    DojoAdmins,
    DojoModules,
    Dojos,
    LearningAuthoringJobs,
    LearningDrafts,
    LearningSolutionRuns,
    ModelInvocations,
    TeachingAgentActions,
    TeachingAgentMessages,
    TeachingAgentThreads,
    TeachingAssignments,
    TeachingArtifactCandidates,
    TeachingArtifactRevisions,
    TeachingArtifacts,
    TeachingCandidateSets,
    TeachingGenerationBatchItems,
    TeachingGenerationBatches,
    TeachingJobEvents,
    TeachingJobOutbox,
    TeachingJobs,
    TeachingMaterialChunks,
    TeachingMaterialRevisions,
    TeachingMaterials,
    TeachingSessions,
)
from ..learning.evidence import redact_text, scrub_payload
from ..utils.request_logging import (
    clear_background_trace_context,
    get_trace_id,
    set_background_trace_context,
)
from .artifacts import (
    candidate_request_prompt,
    content_hash,
    create_revision,
    materialize_candidate,
    replace_generated_candidates,
)
from .files import persist_agent_deliverables, public_agent_file
from .model_router import route_model, validate_actual_model
from .materials import (
    MATERIAL_ANALYSIS_VERSION,
    build_course_material_context,
    compact_material_grounding,
    course_material_grounding_requested,
)


logger = logging.getLogger(__name__)
# Keep latency-sensitive classroom work separate from native authoring.  A
# single native challenge can spend several minutes building, repairing and
# independently reviewing its package; putting it in the same Redis stream as
# material analysis made an unrelated teacher wait behind that work.
#
# ``STREAM`` intentionally retains the historical name so existing generic
# consumers and already-published messages remain compatible.  Dedicated
# native work is published to ``AUTHORING_STREAM`` and consumed by its own
# worker pool.
STREAM = "teaching:jobs"
AUTHORING_STREAM = "teaching:authoring"
GROUP = "teaching-workers"
AUTHORING_JOB_KINDS = frozenset({"learning.authoring", "learning.solution"})
LEASE_SECONDS = max(300, int(os.getenv("TEACHING_JOB_LEASE_SECONDS") or "900"))
AUTHORING_LEASE_SECONDS = max(
    LEASE_SECONDS,
    int(os.getenv("TEACHING_AUTHORING_LEASE_SECONDS") or "3600"),
)
WORKER_LIVENESS_KEY_PREFIX = "teaching:workers:alive:"
WORKER_LIVENESS_INTERVAL_SECONDS = max(
    5,
    int(os.getenv("TEACHING_WORKER_LIVENESS_INTERVAL_SECONDS") or "15"),
)
WORKER_LIVENESS_TTL_SECONDS = max(
    60,
    WORKER_LIVENESS_INTERVAL_SECONDS * 3,
    int(os.getenv("TEACHING_WORKER_LIVENESS_TTL_SECONDS") or "90"),
)
# A compose replacement briefly removes the local Agent Runtime before its new
# container starts listening.  Retrying a refused TCP connection here is safe:
# no HTTP request reached the runtime, so it cannot duplicate a generation.
# Keep this bounded and local to one leased job rather than immediately
# republishing the job until its durable attempt budget is exhausted.
AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS = (1, 2, 4, 8)
AGENT_RUNTIME_RETRYABLE_STATUS_CODES = frozenset({502, 503, 504})


def _stream_for_job_kind(kind):
    """Return the queue that can make progress without starving other work."""

    return AUTHORING_STREAM if str(kind or "") in AUTHORING_JOB_KINDS else STREAM


def _stream_for_job(job):
    return _stream_for_job_kind(getattr(job, "kind", None))
AGENT_TOOL_SCHEMAS = {
    "dojo.select": ("R0", {"referenceId", "moduleIndex"}),
    "course.list": ("R0", set()),
    "course.read": ("R0", set()),
    "course.open": ("R0", set()),
    "course.studio": ("R0", set()),
    "course.settings": ("R0", set()),
    "course.members": ("R0", set()),
    "course.create": (
        "R3",
        {
            "name",
            "slug",
            "description",
            "access",
            "initialModuleName",
            "initialModuleId",
        },
    ),
    "course.update": (
        "R3",
        {"name", "description", "access", "showScoreboard"},
    ),
    "course.sync": ("R3", set()),
    "course.promote": ("R3", set()),
    "course.delete": ("R3", set()),
    "course.member.add": ("R3", {"username", "role"}),
    "course.member.remove": ("R3", {"username"}),
    "module.open": ("R0", {"moduleIndex"}),
    "module.create": ("R3", {"id", "name", "description"}),
    "module.update": (
        "R3",
        {
            "moduleIndex",
            "id",
            "name",
            "description",
            "showChallenges",
            "showScoreboard",
        },
    ),
    "module.delete": ("R3", {"moduleIndex"}),
    "challenge.open": ("R0", {"moduleIndex", "challengeId"}),
    "challenge.generate": (
        "R1",
        {
            "moduleIndex",
            "brief",
            "challengeCount",
            "difficulty",
            "constraints",
        },
    ),
    "challenge.revise": ("R1", {"draftIds", "instruction"}),
    "challenge.publish": ("R3", {"draftId"}),
    "challenge.delete": (
        "R3",
        {"moduleIndex", "challengeId"},
    ),
    "assignment.list": ("R0", set()),
    "assignment.read": ("R0", {"assignmentId"}),
    "assignment.submissions": ("R0", {"assignmentId"}),
    "assignment.generate": (
        "R1",
        {
            "prompt",
            "title",
            "kind",
            "moduleIndex",
            "questionCount",
            "difficulty",
            "availableFrom",
            "dueAt",
            "challengeIds",
            "allowLate",
            "allowResubmit",
            "passPercent",
        },
    ),
    "assignment.update": (
        "R3",
        {
            "assignmentId",
            "title",
            "kind",
            "description",
            "instructions",
            "moduleIndex",
            "availableFrom",
            "dueAt",
            "settings",
        },
    ),
    "assignment.publish": ("R3", {"assignmentId"}),
    "assignment.close": ("R3", {"assignmentId"}),
    "assignment.delete": ("R3", {"assignmentId"}),
    "assignment.grade.override": (
        "R3",
        {"assignmentId", "submissionId", "score", "feedback"},
    ),
    "progress.read": ("R0", set()),
    "material.list": ("R0", set()),
    "material.analyze": ("R1", {"materialId"}),
    "material.add_to_module": (
        "R2",
        {"materialId", "referenceId", "moduleIndex", "name"},
    ),
    "material.apply_chapters": ("R3", {"materialId", "chapterIndexes"}),
    "candidate.generate": (
        "R1",
        {"prompt", "artifactType", "candidateCount", "sourceRefs"},
    ),
    "candidate.compare": ("R0", {"candidateSetId"}),
    "artifact.list": ("R0", set()),
    "artifact.open": ("R0", {"artifactId"}),
    "artifact.revise": (
        "R2",
        {"artifactId", "expectedRevision", "instruction"},
    ),
    "artifact.validate": ("R2", {"artifactId", "expectedRevision"}),
    "artifact.request_publish": ("R3", {"artifactId", "expectedRevision"}),
    "job.list": ("R0", set()),
    "job.retry": ("R1", {"jobId", "idempotencyKey"}),
    "approval.list": ("R0", set()),
    "approval.approve": ("R3", {"actionId"}),
    "approval.reject": ("R3", {"actionId"}),
    "classroom.list": ("R0", set()),
    "classroom.prepare": ("R1", {"artifactId", "title"}),
    "classroom.request_start": ("R3", {"sessionId"}),
    "classroom.request_end": ("R3", {"sessionId"}),
}


class JobCanceled(RuntimeError):
    pass


class PermanentJobError(RuntimeError):
    pass


class RetryableJobError(RuntimeError):
    """A bounded transient failure that should return to the durable queue."""

    pass


def _native_authoring_retryable_error(legacy):
    """Read the durable retry marker emitted by the native authoring runner.

    The compatibility runner commits the legacy row in its own application
    context before returning control to the durable worker.  Therefore the
    worker cannot rely on the in-memory exception alone; it must inspect the
    persisted row after the runner has finished.  The prefix is intentionally
    owned by ``_run_authoring_job`` and the step detail provides a second,
    structured signal for older rows that already contain the marker.
    """

    if legacy is None:
        return None
    error = str(getattr(legacy, "error", "") or "").strip()
    if error.startswith("Transient authoring model failure:"):
        return error[:4000]
    for step in getattr(legacy, "steps", None) or []:
        if not isinstance(step, dict):
            continue
        if str(step.get("status") or "").upper() not in {"FAILED", "RUNNING"}:
            continue
        details = step.get("details")
        if not isinstance(details, dict) or not details.get("retryable"):
            continue
        return error[:4000] or "Transient authoring model failure"
    return None


def _native_solution_retryable_error(run):
    """Read the retry marker written by the isolated solution verifier."""

    if run is None:
        return None
    verification = getattr(run, "verification", None)
    error = str(getattr(run, "error", "") or "").strip()
    if isinstance(verification, dict) and verification.get("retryable"):
        return error[:4000] or "Transient solution model failure"
    if error.startswith("Transient solution model failure:"):
        return error[:4000]
    return None


def _safe_error(value, limit=8000):
    result = redact_text(value, limit=limit)
    for secret in (
        config.AGENT_RUNTIME_SERVICE_SECRET,
        config.AGENT_RUNTIME_TICKET_SECRET,
        config.DOJO_AI_API_KEY,
    ):
        if secret and len(secret) >= 8:
            result = result.replace(secret, "[REDACTED_SECRET]")
    return result[:limit]


def _agent_answer(result):
    answer = str(result.get("answer") or "").strip()
    return answer or ("我没有得到可核验的结果，因此不能声称任务已经完成。请稍后重试。")


def _job_failure_message(job):
    if str(job.status or "").upper() != "FAILED":
        return None
    error = str(job.error or "").lower()
    if any(token in error for token in ("timeout", "timed out", "lease expired")):
        reason = "处理超时，系统没有产生可用结果。"
    elif any(
        token in error for token in ("permission", "forbidden", "scope", "not found")
    ):
        reason = "目标不存在或当前账号没有操作权限。"
    elif any(token in error for token in ("validation", "invalid", "校验", "验证")):
        reason = "生成结果未通过可用性检查，因此没有保存为已完成。"
    elif any(token in error for token in ("model", "service", "http", "connection")):
        reason = "生成服务暂时不可用，系统没有产生可用结果。"
    else:
        reason = "处理过程中发生错误，系统没有产生可用结果。"
    return f"这项任务未完成：{reason}可以重新运行；若仍失败，请联系管理员。"


def _validated_tool_proposals(job, result):
    proposals = result.get("toolProposals")
    if not isinstance(proposals, list):
        return []
    validated = []
    for proposal in proposals[:8]:
        if not isinstance(proposal, dict):
            continue
        tool = str(proposal.get("tool") or "")
        schema = AGENT_TOOL_SCHEMAS.get(tool)
        if schema is None:
            continue
        risk, allowed_keys = schema
        raw_arguments = proposal.get("arguments")
        if not isinstance(raw_arguments, dict):
            raw_arguments = {}
        arguments = {
            key: scrub_payload(raw_arguments[key], key)
            for key in allowed_keys
            if key in raw_arguments
        }
        target_dojo = None
        if tool == "dojo.select":
            owner = Users.query.filter_by(id=job.owner_id).first()
            target_reference = str(arguments.get("referenceId") or "").strip()
            target_dojo = (
                Dojos.from_id(target_reference).first() if target_reference else None
            )
            allowed = bool(
                owner
                and target_dojo
                and (
                    getattr(owner, "type", None) == "admin"
                    or DojoAdmins.query.filter_by(
                        dojo_id=target_dojo.dojo_id,
                        user_id=owner.id,
                    ).first()
                    is not None
                )
            )
            if not allowed:
                continue
            if arguments.get("moduleIndex") is not None:
                try:
                    module_index = int(arguments["moduleIndex"])
                except (TypeError, ValueError):
                    continue
                if not DojoModules.query.filter_by(
                    dojo_id=target_dojo.dojo_id,
                    module_index=module_index,
                ).first():
                    continue
                arguments["moduleIndex"] = module_index
            arguments["referenceId"] = target_dojo.reference_id
        elif tool == "material.add_to_module":
            owner = Users.query.filter_by(id=job.owner_id).first()
            reference_id = str(arguments.get("referenceId") or "").strip()
            if reference_id:
                target_dojo = Dojos.from_id(reference_id).first()
                allowed = bool(
                    owner
                    and target_dojo
                    and (
                        getattr(owner, "type", None) == "admin"
                        or DojoAdmins.query.filter_by(
                            dojo_id=target_dojo.dojo_id,
                            user_id=owner.id,
                        ).first()
                        is not None
                    )
                )
                if not allowed:
                    continue
            elif job.dojo_id is not None:
                target_dojo = Dojos.query.filter_by(dojo_id=job.dojo_id).first()
            if target_dojo is None:
                # Unscoped placement proposals must name their exact target course;
                # otherwise the UI would submit an operation that cannot succeed.
                continue
            try:
                module_index = int(arguments.get("moduleIndex"))
            except (TypeError, ValueError):
                continue
            if not DojoModules.query.filter_by(
                dojo_id=target_dojo.dojo_id,
                module_index=module_index,
            ).first():
                continue
            arguments["referenceId"] = target_dojo.reference_id
            arguments["moduleIndex"] = module_index
        artifact_id = arguments.get("artifactId")
        if (
            artifact_id
            and not TeachingArtifacts.query.filter_by(
                id=str(artifact_id),
                owner_id=job.owner_id,
                dojo_id=job.dojo_id,
            ).first()
        ):
            continue
        candidate_set_id = arguments.get("candidateSetId")
        if (
            candidate_set_id
            and not TeachingCandidateSets.query.filter_by(
                id=str(candidate_set_id),
                owner_id=job.owner_id,
                dojo_id=job.dojo_id,
            ).first()
        ):
            continue
        material_id = arguments.get("materialId")
        if material_id:
            material = TeachingMaterials.query.filter_by(
                id=str(material_id),
                owner_id=job.owner_id,
            ).first()
            if (
                material is None
                or material.status == "ARCHIVED"
                or material.dojo_id
                not in {
                    None,
                    target_dojo.dojo_id
                    if tool == "material.add_to_module" and target_dojo is not None
                    else job.dojo_id,
                }
            ):
                continue
        draft_id = arguments.get("draftId")
        if (
            draft_id
            and not LearningDrafts.query.filter_by(
                id=str(draft_id),
                author_id=job.owner_id,
                dojo_id=job.dojo_id,
            ).first()
        ):
            continue
        target_job_id = arguments.get("jobId")
        if (
            target_job_id
            and not TeachingJobs.query.filter_by(
                id=str(target_job_id),
                owner_id=job.owner_id,
                dojo_id=job.dojo_id,
            ).first()
        ):
            continue
        session_id = arguments.get("sessionId")
        if (
            session_id
            and not TeachingSessions.query.filter_by(
                id=str(session_id),
                dojo_id=job.dojo_id,
            ).first()
        ):
            continue
        assignment_id = arguments.get("assignmentId")
        if (
            assignment_id
            and not TeachingAssignments.query.filter_by(
                id=str(assignment_id),
                dojo_id=job.dojo_id,
            ).first()
        ):
            continue
        action_id = arguments.get("actionId")
        if action_id:
            target_action = TeachingAgentActions.query.filter_by(
                id=str(action_id),
                status="AWAITING_APPROVAL",
            ).first()
            if (
                target_action is None
                or (target_action.request_json or {}).get("dojoId") != job.dojo_id
                or (
                    target_action.actor_id != job.owner_id
                    and target_action.action_type != "review-self-artifact"
                )
            ):
                continue
            arguments["actionId"] = target_action.id
        validated.append(
            {
                "tool": tool,
                "riskLevel": risk,
                "arguments": arguments,
                "reason": str(proposal.get("reason") or "")[:1000],
                "boundScope": {
                    "dojoId": (
                        target_dojo.dojo_id
                        if tool in {"dojo.select", "material.add_to_module"}
                        and target_dojo is not None
                        else job.dojo_id
                    ),
                    "moduleIndex": (
                        arguments.get("moduleIndex")
                        if tool == "material.add_to_module"
                        else job.module_index
                    ),
                },
                "requiresConfirmation": risk == "R3",
            }
        )
    return validated


GENERATION_OPTION_TOOLS = {"candidate.generate", "challenge.generate"}
GENERATION_OPTION_ARTIFACT_TYPES = {
    "slide-deck",
    "attack-defense-scene",
    "simulation",
    "debate",
    "roleplay",
    "ctf-challenge",
}


def _validated_generation_scope(job, source, artifact_type):
    if job.dojo_id is not None:
        return {
            "dojoId": job.dojo_id,
            "moduleIndex": job.module_index,
        }

    raw_scope = source.get("boundScope")
    if not isinstance(raw_scope, dict):
        return None
    reference_id = str(raw_scope.get("referenceId") or "").strip()
    if not reference_id:
        return None
    owner = Users.query.filter_by(id=job.owner_id).first()
    dojo = Dojos.from_id(reference_id).first()
    if not (
        owner
        and dojo
        and (
            getattr(owner, "type", None) == "admin"
            or DojoAdmins.query.filter_by(
                dojo_id=dojo.dojo_id,
                user_id=owner.id,
            ).first()
            is not None
        )
    ):
        return None

    raw_module_index = raw_scope.get("moduleIndex")
    module_index = None
    if raw_module_index is not None:
        try:
            module_index = int(raw_module_index)
        except (TypeError, ValueError):
            return None
        if not DojoModules.query.filter_by(
            dojo_id=dojo.dojo_id,
            module_index=module_index,
        ).first():
            return None
    if artifact_type == "ctf-challenge" and module_index is None:
        return None
    return {
        "dojoId": dojo.dojo_id,
        "referenceId": dojo.reference_id,
        "moduleIndex": module_index,
    }


def validated_generation_options(job, result):
    """Validate the pre-generation choice bundle at the CTFd trust boundary."""

    source = result.get("generationOptions")
    if not isinstance(source, dict):
        return None
    target_tool = str(source.get("targetTool") or "").strip()
    artifact_type = str(source.get("artifactType") or "").strip().lower()
    if (
        target_tool not in GENERATION_OPTION_TOOLS
        or artifact_type not in GENERATION_OPTION_ARTIFACT_TYPES
        or (target_tool == "challenge.generate" and artifact_type != "ctf-challenge")
        or (target_tool == "candidate.generate" and artifact_type == "ctf-challenge")
    ):
        return None
    bound_scope = _validated_generation_scope(job, source, artifact_type)
    if bound_scope is None:
        return None
    raw_options = source.get("options")
    if not isinstance(raw_options, list) or len(raw_options) != 3:
        return None
    options = []
    fingerprints = set()
    for index, raw in enumerate(raw_options):
        if not isinstance(raw, dict):
            return None
        title = re.sub(r"\s+", " ", str(raw.get("title") or "")).strip()[:120]
        description = re.sub(r"\s+", " ", str(raw.get("description") or "")).strip()[
            :2000
        ]
        rewritten_prompt = (
            str(raw.get("rewrittenPrompt") or "").replace("\x00", "").strip()[:14000]
        )
        highlights = raw.get("highlights")
        highlights = (
            [
                re.sub(r"\s+", " ", str(item)).strip()[:300]
                for item in highlights[:6]
                if isinstance(item, str) and str(item).strip()
            ]
            if isinstance(highlights, list)
            else []
        )
        fingerprint = re.sub(r"\s+", " ", rewritten_prompt).strip().lower()
        if (
            len(title) < 2
            or len(re.sub(r"\s+", "", description)) < 24
            or len(re.sub(r"\s+", "", rewritten_prompt)) < 80
            or len(highlights) < 2
            or fingerprint in fingerprints
        ):
            return None
        fingerprints.add(fingerprint)
        options.append(
            {
                "id": f"option-{index + 1}",
                "title": title,
                "description": description,
                "highlights": highlights,
                "rewrittenPrompt": rewritten_prompt,
            }
        )

    raw_arguments = source.get("baseArguments")
    raw_arguments = raw_arguments if isinstance(raw_arguments, dict) else {}
    base_arguments = {}
    if target_tool == "challenge.generate":
        try:
            module_index = int(raw_arguments.get("moduleIndex"))
        except (TypeError, ValueError):
            module_index = None
        if module_index is not None and module_index >= 0:
            base_arguments["moduleIndex"] = module_index
        try:
            challenge_count = int(raw_arguments.get("challengeCount"))
        except (TypeError, ValueError):
            challenge_count = None
        if challenge_count is not None:
            base_arguments["challengeCount"] = max(1, min(5, challenge_count))
        difficulty = re.sub(
            r"\s+", " ", str(raw_arguments.get("difficulty") or "")
        ).strip()[:80]
        if difficulty:
            base_arguments["difficulty"] = difficulty
        constraints = raw_arguments.get("constraints")
        if isinstance(constraints, dict):
            cleaned_constraints = scrub_payload(constraints)
            if len(json.dumps(cleaned_constraints, ensure_ascii=False)) <= 16000:
                base_arguments["constraints"] = cleaned_constraints

    source_refs = []
    for ref in (job.payload or {}).get("sourceRefs") or []:
        if not isinstance(ref, dict) or ref.get("type") != "material":
            continue
        material_id = str(ref.get("id") or "")
        if material_id:
            pinned_ref = {"type": "material", "id": material_id}
            revision_id = str(ref.get("revisionId") or "")
            sha256 = str(ref.get("sha256") or "")
            if revision_id:
                pinned_ref["revisionId"] = revision_id
            if sha256:
                pinned_ref["sha256"] = sha256
            source_refs.append(pinned_ref)

    return {
        "targetTool": target_tool,
        "artifactType": artifact_type,
        "reason": re.sub(r"\s+", " ", str(source.get("reason") or "")).strip()[:1000],
        "baseArguments": base_arguments,
        "options": options,
        "sourceJobId": job.id,
        "sourceRefs": source_refs[:100],
        "boundScope": bound_scope,
    }


def _redis():
    return redis.from_url(
        current_app.config.get("REDIS_URL", "redis://cache:6379"),
        decode_responses=True,
    )


def _worker_liveness_key(worker_id):
    return f"{WORKER_LIVENESS_KEY_PREFIX}{quote(str(worker_id), safe='')}"


def _new_worker_id():
    """Return a process-lifetime worker identity that survives PID reuse safely."""

    return f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:16]}"


def _mark_worker_alive(client, worker_id):
    try:
        client.set(
            _worker_liveness_key(worker_id),
            "1",
            ex=WORKER_LIVENESS_TTL_SECONDS,
        )
        return True
    except (AttributeError, OSError, redis.RedisError):
        logger.warning("Could not refresh teaching worker liveness", exc_info=True)
        return False


def _clear_worker_liveness(client, worker_id):
    try:
        client.delete(_worker_liveness_key(worker_id))
    except (AttributeError, OSError, redis.RedisError):
        logger.debug("Could not clear teaching worker liveness", exc_info=True)


def _worker_liveness_state(client, worker_id):
    """Return whether a worker is alive, or None when Redis is unavailable."""

    if client is None or not worker_id:
        return None
    try:
        return bool(client.exists(_worker_liveness_key(worker_id)))
    except (AttributeError, OSError, redis.RedisError):
        logger.warning("Could not read teaching worker liveness", exc_info=True)
        return None


def _job_heartbeat_is_stale(job, *, now):
    heartbeat_at = getattr(job, "heartbeat", None)
    if heartbeat_at is None:
        return False
    stale_after = now - datetime.timedelta(seconds=WORKER_LIVENESS_TTL_SECONDS)
    return heartbeat_at < stale_after


def _running_job_recovery_reason(job, *, now, owner_alive):
    """Decide whether a RUNNING job can be safely recovered by another worker."""

    if owner_alive is True:
        # The owner may be inside a bounded long-running model or native
        # authoring call.  A second worker must not run the same idempotent
        # operation concurrently merely because its durable lease is old.
        return None
    lease_expires = getattr(job, "lease_expires", None)
    if lease_expires is not None and lease_expires < now:
        # Redis may be unavailable, or this job may predate worker liveness
        # heartbeats. Preserve the durable lease expiry recovery path.
        return "lease-expired"
    if owner_alive is False and _job_heartbeat_is_stale(job, now=now):
        return "worker-offline"
    return None


def _start_worker_liveness_heartbeat(client, worker_id):
    stop_event = threading.Event()

    def refresh():
        while not stop_event.wait(WORKER_LIVENESS_INTERVAL_SECONDS):
            _mark_worker_alive(client, worker_id)

    _mark_worker_alive(client, worker_id)
    thread = threading.Thread(
        target=refresh,
        name="teaching-worker-liveness",
        daemon=True,
    )
    thread.start()
    return stop_event, thread


def _next_sequence(job_id):
    return (
        db.session.query(func.max(TeachingJobEvents.sequence))
        .filter(TeachingJobEvents.job_id == job_id)
        .scalar()
        or 0
    ) + 1


def append_job_event(job, stage, status, message, details=None):
    db.session.query(TeachingJobs).filter_by(id=job.id).with_for_update().one()
    event = TeachingJobEvents(
        job_id=job.id,
        sequence=_next_sequence(job.id),
        stage=stage,
        status=status,
        message=str(message)[:8000],
        details=details or {},
    )
    db.session.add(event)
    return event


def _should_append_native_progress_event(latest, stage, status, message):
    return bool(
        latest is None
        or latest.stage != stage
        or latest.status != status
        or latest.message != message
    )


def _course_result_href(job, tab, **extra):
    dojo = Dojos.query.filter_by(dojo_id=job.dojo_id).first() if job.dojo_id else None
    query = {"tab": tab}
    if dojo is not None:
        query["dojo"] = dojo.reference_id
    if job.module_index is not None:
        query["module"] = job.module_index
    query.update(
        {key: value for key, value in extra.items() if value not in (None, "")}
    )
    return f"/teacher/courses?{urlencode(query)}"


def _native_authoring_draft_id(job, result=None):
    payload = job.payload if isinstance(job.payload, dict) else {}
    result = result if isinstance(result, dict) else {}
    draft_id = result.get("draftId") or payload.get("draftId")
    if draft_id:
        return str(draft_id)
    legacy_job_id = result.get("legacyJobId") or payload.get("legacyJobId")
    if not legacy_job_id:
        return None
    legacy_job = LearningAuthoringJobs.query.filter_by(id=legacy_job_id).first()
    return str(legacy_job.draft_id) if legacy_job and legacy_job.draft_id else None


def _job_result_target(job, result=None):
    """Return the single teacher-facing destination for a completed job.

    The worker result remains an auditable machine payload.  This small view
    model deliberately exposes only the destination the teacher needs next.
    """

    payload = job.payload if isinstance(job.payload, dict) else {}
    result = result if isinstance(result, dict) else {}
    kind = str(job.kind or "")

    artifact_id = result.get("artifactId") or payload.get("artifactId")
    materialization_job_id = result.get("materializationJobId")
    if (
        kind in {"candidate.generate", "self.candidate.generate"}
        and artifact_id
        and materialization_job_id
    ):
        return {
            "kind": "link",
            "href": f"/teacher/artifacts/{quote(str(artifact_id), safe='')}",
        }

    candidate_set_id = result.get("candidateSetId") or payload.get("candidateSetId")
    if kind in {"candidate.generate", "self.candidate.generate"} and candidate_set_id:
        return {"kind": "candidate", "candidateSetId": str(candidate_set_id)}

    material_id = result.get("materialId") or payload.get("materialId")
    if kind == "material.analyze" and material_id:
        return {
            "kind": "link",
            "href": _course_result_href(job, "courseware", material=str(material_id)),
        }

    if artifact_id:
        return {
            "kind": "link",
            "href": f"/teacher/artifacts/{quote(str(artifact_id), safe='')}",
        }

    assignment_id = result.get("assignmentId") or payload.get("assignmentId")
    if assignment_id:
        return {
            "kind": "link",
            "href": _course_result_href(job, "labs", assignment=str(assignment_id)),
        }

    challenge_id = result.get("challengeId") or payload.get("challengeId")
    if challenge_id:
        return {
            "kind": "link",
            "href": _course_result_href(job, "labs", challenge=str(challenge_id)),
        }

    if kind == "learning.authoring":
        draft_id = _native_authoring_draft_id(job, result)
        dojo = Dojos.query.filter_by(dojo_id=job.dojo_id).first()
        module = (
            DojoModules.query.filter_by(
                dojo_id=job.dojo_id,
                module_index=job.module_index,
            ).first()
            if job.dojo_id is not None and job.module_index is not None
            else None
        )
        if dojo is not None:
            query = {"dojo": dojo.reference_id, "tab": "questions"}
            if module is not None:
                query["module"] = module.id
            if draft_id:
                query["selectedId"] = str(draft_id)
            else:
                query["tab"] = "jobs"
            return {
                "kind": "link",
                "href": f"/teacher/courses?{urlencode(query)}",
            }
        return {"kind": "link", "href": _course_result_href(job, "labs")}
    if kind == "agent.chat":
        return {"kind": "conversation"}
    if job.dojo_id:
        tab = "labs" if kind.startswith("learning.") else "overview"
        return {"kind": "link", "href": _course_result_href(job, tab)}
    return {"kind": "conversation"}


def _single_candidate_materialization(job, raw_result):
    if job.kind not in {"candidate.generate", "self.candidate.generate"}:
        return None, None
    raw_result = raw_result if isinstance(raw_result, dict) else {}
    candidate_set_id = raw_result.get("candidateSetId") or (job.payload or {}).get(
        "candidateSetId"
    )
    if not candidate_set_id:
        return None, None
    candidate_set = TeachingCandidateSets.query.filter_by(
        id=str(candidate_set_id),
        owner_id=job.owner_id,
    ).first()
    if candidate_set is None:
        return None, None
    generation_mode = str(
        raw_result.get("generationMode")
        or (candidate_set.request_json or {}).get("generationMode")
        or (job.payload or {}).get("generationMode")
        or ""
    ).lower()
    if generation_mode != "single":
        return None, None

    artifact_id = raw_result.get("artifactId")
    if not artifact_id:
        candidate = (
            TeachingArtifactCandidates.query.filter_by(
                candidate_set_id=candidate_set.id,
            )
            .filter(TeachingArtifactCandidates.materialized_artifact_id.isnot(None))
            .order_by(TeachingArtifactCandidates.ordinal)
            .first()
        )
        artifact_id = candidate.materialized_artifact_id if candidate else None
    if not artifact_id:
        return None, None

    child_id = raw_result.get("materializationJobId")
    child = None
    if child_id:
        child = TeachingJobs.query.filter_by(
            id=str(child_id),
            owner_id=job.owner_id,
            kind="artifact.materialize",
        ).first()
    if child is None:
        recent = (
            TeachingJobs.query.filter_by(
                owner_id=job.owner_id,
                kind="artifact.materialize",
            )
            .order_by(TeachingJobs.created.desc())
            .limit(50)
            .all()
        )
        child = next(
            (
                row
                for row in recent
                if (row.payload or {}).get("artifactId") == artifact_id
            ),
            None,
        )
    return str(artifact_id), child


def job_view(job, *, include_payload=False):
    raw_result = job.result
    if isinstance(raw_result, dict) and "_generationCheckpoint" in raw_result:
        checkpoint = raw_result.get("_generationCheckpoint") or {}
        raw_result = {
            "checkpointStage": "generated",
            "requestHash": checkpoint.get("requestHash"),
        }
    raw_result = raw_result if isinstance(raw_result, dict) else {}
    artifact_id, materialization_job = _single_candidate_materialization(
        job, raw_result
    )
    if artifact_id and materialization_job:
        raw_result = {
            **raw_result,
            "artifactId": artifact_id,
            "materializationJobId": materialization_job.id,
        }
    public_result = raw_result
    if isinstance(raw_result.get("files"), list):
        public_result = {
            **raw_result,
            "files": [
                public
                for item in raw_result["files"]
                if (public := public_agent_file(item)) is not None
            ],
        }

    status = job.status
    stage = job.stage
    progress = job.progress
    updated = job.updated
    completed = job.completed
    failure_message = _job_failure_message(job)
    if materialization_job:
        status = materialization_job.status
        stage = materialization_job.stage
        updated = materialization_job.updated
        completed = materialization_job.completed
        failure_message = _job_failure_message(materialization_job)
        if status == "SUCCEEDED":
            progress = 100
        else:
            progress = max(
                50,
                min(99, 50 + int(materialization_job.progress or 0) // 2),
            )

    # ``status`` is the durable source of truth for terminality.  A nested
    # native runner can report its final stage before the outer job has
    # persisted the result payload, card destination and assistant message.
    # Never expose that short (or, after an interrupted finalization, long)
    # window as a completed task with no result to open.
    normalized_status = str(status or "QUEUED").upper()
    if normalized_status in {"QUEUED", "RUNNING", "CANCEL_REQUESTED"}:
        progress = min(99, max(0, int(progress or 0)))
        if str(stage or "").lower() in {"complete", "completed"}:
            stage = "finalizing"

    payload = job.payload if isinstance(job.payload, dict) else {}
    display_title = str(
        raw_result.get("title")
        or payload.get("title")
        or payload.get("brief")
        or payload.get("instruction")
        or ""
    ).strip()[:240]
    result = {
        "id": job.id,
        "kind": job.kind,
        "title": display_title or None,
        "artifactType": (job.payload or {}).get("artifactType"),
        "taskListHidden": bool((job.payload or {}).get("taskListHidden")),
        "status": status,
        "stage": stage,
        "progress": progress,
        "traceId": job.trace_id,
        "dojoId": job.dojo_id,
        "moduleIndex": job.module_index,
        "threadId": job.thread_id,
        "attemptCount": job.attempt_count,
        "maxAttempts": job.max_attempts,
        "result": public_result,
        "error": failure_message,
        "failureMessage": failure_message,
        "created": job.created.isoformat() + "Z",
        "updated": updated.isoformat() + "Z",
        "completed": completed.isoformat() + "Z" if completed else None,
        "resultTarget": _job_result_target(job, raw_result),
    }
    if job.kind in {"learning.authoring", "learning.solution"}:
        result["modelRoute"] = {
            "route": "aisecedu-native-validation",
            "requiredModel": None,
            "actualModel": None,
            "degraded": False,
        }
        if job.kind == "learning.authoring":
            payload = job.payload if isinstance(job.payload, dict) else {}
            try:
                batch_index = min(5, max(1, int(payload.get("batchIndex") or 1)))
            except (TypeError, ValueError):
                batch_index = 1
            try:
                batch_count = max(batch_index, int(payload.get("batchCount") or 1))
            except (TypeError, ValueError):
                batch_count = batch_index
            result["batch"] = {
                "id": str(payload.get("batchId") or "")[:128] or None,
                "index": batch_index,
                "count": min(5, batch_count),
                "topic": str(payload.get("batchTopic") or "")[:80] or None,
            }
    else:
        predicted = route_model(
            job.kind,
            prompt=str(
                (job.payload or {}).get("prompt")
                or (job.payload or {}).get("instruction")
                or ""
            ),
            payload=job.payload or {},
            allow_degraded=bool((job.payload or {}).get("allowDegraded")),
        )
        invocation = (
            ModelInvocations.query.filter_by(job_id=job.id)
            .order_by(ModelInvocations.created.desc())
            .first()
        )
        result["modelRoute"] = {
            "route": predicted["route"],
            "requiredModel": predicted["required_model"],
            "actualModel": (
                invocation.actual_model if invocation else predicted["actual_model"]
            ),
            "provider": invocation.provider if invocation else predicted["provider"],
            "degraded": bool(invocation.degraded if invocation else False),
            "invocationStatus": invocation.status if invocation else None,
        }
    if include_payload:
        result["payload"] = job.payload
    return result


def _sync_candidate_generation_card(job, presented=None):
    if job.kind not in {"candidate.generate", "self.candidate.generate"}:
        return
    candidate_set_id = (job.payload or {}).get("candidateSetId")
    if not candidate_set_id:
        return
    raw_result = job.result if isinstance(job.result, dict) else {}
    presented = presented or {
        "status": job.status,
        "stage": job.stage,
        "progress": job.progress,
        "result": raw_result,
        "resultTarget": _job_result_target(job, raw_result),
        "failureMessage": _job_failure_message(job),
    }
    terminal = str(presented.get("status") or "").upper()
    card_status = (
        "READY"
        if terminal == "SUCCEEDED"
        else "FAILED"
        if terminal == "FAILED"
        else "CANCELED"
        if terminal == "CANCELED"
        else "GENERATING"
    )
    result = (
        presented.get("result") if isinstance(presented.get("result"), dict) else {}
    )
    synced_message_ids = set()
    for card in ConversationCards.query.filter_by(
        object_type="candidate_set",
        object_id=str(candidate_set_id),
    ).all():
        card.state = {
            **(card.state or {}),
            "status": card_status,
            "jobId": job.id,
            "stage": presented.get("stage"),
            "progress": presented.get("progress"),
            "artifactId": result.get("artifactId")
            or (card.state or {}).get("artifactId"),
            "resultTarget": presented.get("resultTarget"),
            "failureMessage": presented.get("failureMessage"),
        }
        if terminal in {"FAILED", "CANCELED"}:
            card.actions = ["open", "retry"]
        elif terminal == "SUCCEEDED":
            card.actions = ["open"]
        elif terminal != "SUCCEEDED":
            card.actions = ["open", "cancel"]
        message = card.message
        if message is None or message.id in synced_message_ids:
            continue
        synced_message_ids.add(message.id)
        pending = terminal not in {"SUCCEEDED", "FAILED", "CANCELED"}
        presentation = (
            "result"
            if terminal == "SUCCEEDED"
            else "error"
            if terminal == "FAILED"
            else "canceled"
            if terminal == "CANCELED"
            else "activity"
        )
        message.metadata_json = {
            **(message.metadata_json or {}),
            "pending": pending,
            "presentation": presentation,
            "jobId": job.id,
            "jobKind": job.kind,
            "jobStatus": terminal,
            "failed": terminal == "FAILED",
        }
        if terminal == "SUCCEEDED":
            message.content = "生成结果已准备好。"
        elif terminal == "FAILED":
            message.content = presented.get("failureMessage") or (
                "这项任务未完成，系统没有产生可用结果。"
            )
        elif terminal == "CANCELED":
            message.content = "任务已取消。"


def _sync_parent_generation_state(materialization_job):
    parent_id = (materialization_job.payload or {}).get("parentGenerationJobId")
    if not parent_id:
        return
    parent = TeachingJobs.query.filter_by(
        id=str(parent_id),
        owner_id=materialization_job.owner_id,
        kind="candidate.generate",
    ).first()
    if parent is None:
        return
    artifact_id = (materialization_job.payload or {}).get("artifactId")
    candidate_set_id = (materialization_job.payload or {}).get("candidateSetId") or (
        parent.payload or {}
    ).get("candidateSetId")
    parent_result = parent.result if isinstance(parent.result, dict) else {}
    if "_generationCheckpoint" not in parent_result:
        parent.result = {
            **parent_result,
            "candidateSetId": candidate_set_id,
            "generationMode": "single",
            "artifactId": artifact_id,
            "materializationJobId": materialization_job.id,
        }

    presented = job_view(parent)
    terminal = str(presented["status"] or "").upper()
    for card in ConversationCards.query.filter_by(
        object_type="job",
        object_id=parent.id,
    ).all():
        card.state = {
            **(card.state or {}),
            "status": presented["status"],
            "stage": presented["stage"],
            "progress": presented["progress"],
            "resultTarget": presented["resultTarget"],
            "error": presented["failureMessage"],
            "failureMessage": presented["failureMessage"],
        }
        card.actions = (
            ["open", "result"]
            if terminal == "SUCCEEDED"
            else ["open", "retry"]
            if terminal in {"FAILED", "CANCELED"}
            else ["open"]
        )

    if candidate_set_id:
        _sync_candidate_generation_card(parent, presented)
        for card in ConversationCards.query.filter_by(
            object_type="candidate_set",
            object_id=str(candidate_set_id),
        ).all():
            card.state = {
                **(card.state or {}),
                "artifactId": artifact_id,
                "materializationJobId": materialization_job.id,
            }
            if terminal == "SUCCEEDED":
                card.actions = ["open"]

    if terminal in {"FAILED", "CANCELED"} and artifact_id:
        artifact = TeachingArtifacts.query.filter_by(
            id=str(artifact_id),
            owner_id=materialization_job.owner_id,
        ).first()
        if artifact is not None and artifact.status == "GENERATING":
            artifact.status = "FAILED" if terminal == "FAILED" else "CANCELED"

    if parent.action_id:
        action = TeachingAgentActions.query.filter_by(id=parent.action_id).first()
        if action:
            if terminal == "SUCCEEDED":
                action.status = "SUCCEEDED"
                action.completed = materialization_job.completed
                action.error = None
            elif terminal in {"FAILED", "CANCELED"}:
                action.status = "FAILED"
                action.completed = materialization_job.completed
                action.error = presented["failureMessage"]
            else:
                action.status = "PENDING"
                action.completed = None
            action.result = {
                **(action.result or {}),
                "artifactId": artifact_id,
                "materializationJobId": materialization_job.id,
            }


def job_events_view(job_id):
    hidden_detail_keys = {
        "error",
        "exception",
        "stack",
        "traceback",
        "model",
        "actualmodel",
        "provider",
        "route",
        "requestid",
        "requesthash",
        "traceid",
    }

    def public_details(value):
        if isinstance(value, dict):
            return {
                key: public_details(item)
                for key, item in value.items()
                if str(key).replace("_", "").lower() not in hidden_detail_keys
            }
        if isinstance(value, list):
            return [public_details(item) for item in value]
        if isinstance(value, str):
            return redact_text(value, limit=1000)
        return value

    def public_message(event):
        if str(event.status or "").upper() == "FAILED":
            return "这一步未完成，系统没有产生可用结果。"
        message = str(event.message or "")
        message = re.sub(
            r"调用\s*OpenMAIC(?:（[^）]*）)?",
            "正在生成教学内容",
            message,
            flags=re.IGNORECASE,
        )
        return (
            message.replace("玄甲原生题目", "CTF 实践题")
            .replace("OpenMAIC", "生成服务")
            .replace("模型", "智能体")
            .replace("Dojo", "课程")
            .replace("Studio", "内容管理")
        )

    return [
        {
            "sequence": event.sequence,
            "stage": event.stage,
            "status": event.status,
            "message": public_message(event),
            "details": public_details(event.details or {}),
            "created": event.created.isoformat() + "Z",
        }
        for event in TeachingJobEvents.query.filter_by(job_id=job_id)
        .order_by(TeachingJobEvents.sequence)
        .all()
    ]


def enqueue_job(
    *,
    owner_id,
    kind,
    idempotency_key,
    payload,
    dojo_id=None,
    module_index=None,
    thread_id=None,
    action_id=None,
    priority=100,
    trace_id=None,
    max_attempts=3,
    publish=True,
    commit=True,
):
    existing = TeachingJobs.query.filter_by(idempotency_key=idempotency_key).first()
    if existing:
        if existing.owner_id != owner_id:
            raise PermissionError("Idempotency key belongs to another user")
        return existing, False

    inherited_trace_id = get_trace_id()
    if inherited_trace_id in {None, "", "NONE", "LOCAL"}:
        inherited_trace_id = None
    trace_id = trace_id or inherited_trace_id or uuid.uuid4().hex
    job = TeachingJobs(
        owner_id=owner_id,
        dojo_id=dojo_id,
        module_index=module_index,
        thread_id=thread_id,
        action_id=action_id,
        kind=kind,
        status="QUEUED",
        stage="queued",
        progress=0,
        priority=priority,
        idempotency_key=idempotency_key,
        trace_id=trace_id,
        payload=payload,
        max_attempts=max_attempts,
    )
    db.session.add(job)
    db.session.flush()
    append_job_event(job, "queued", "QUEUED", "任务已持久化，等待执行")
    db.session.add(
        TeachingJobOutbox(
            job_id=job.id,
            payload={"job_id": job.id, "trace_id": trace_id},
        )
    )
    if not commit:
        # Batch callers keep the durable job, its outbox row, the surrounding
        # domain mutation and the conversation card in one transaction.  The
        # caller publishes the outbox only after that transaction commits.
        db.session.flush()
        return job, True
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = TeachingJobs.query.filter_by(idempotency_key=idempotency_key).first()
        if existing is None:
            raise
        if existing.owner_id != owner_id:
            raise PermissionError("Idempotency key belongs to another user")
        return existing, False
    if publish:
        publish_pending_outbox(job_id=job.id)
    return job, True


def publish_pending_outbox(*, job_id=None, limit=100):
    query = TeachingJobOutbox.query.filter(TeachingJobOutbox.published.is_(None))
    if job_id:
        query = query.filter_by(job_id=job_id)
    rows = query.order_by(TeachingJobOutbox.id).limit(limit).all()
    published = 0
    for row in rows:
        job = TeachingJobs.query.filter_by(id=row.job_id).first()
        if job is None or job.status != "QUEUED":
            row.published = datetime.datetime.utcnow()
            row.last_error = None
            db.session.commit()
            continue
        dependency_ids = [
            str(item)
            for item in ((job.payload or {}).get("dependsOnJobIds") or [])
            if str(item or "").strip() and str(item) != job.id
        ][:100]
        if dependency_ids:
            dependencies = TeachingJobs.query.filter(
                TeachingJobs.id.in_(dependency_ids),
                TeachingJobs.owner_id == job.owner_id,
            ).all()
            by_id = {dependency.id: dependency for dependency in dependencies}
            failed = [
                dependency_id
                for dependency_id in dependency_ids
                if dependency_id not in by_id
                or str(by_id[dependency_id].status or "").upper()
                in {"FAILED", "CANCELED"}
            ]
            if failed:
                now = datetime.datetime.utcnow()
                job.status = "FAILED"
                job.stage = "failed"
                job.progress = 0
                job.error = (
                    "Source attachment analysis did not complete; the request was not "
                    "executed. Reanalyze the attachment and retry."
                )
                job.completed = now
                job.updated = now
                row.published = now
                row.last_error = job.error
                _persist_agent_failure_message(job)
                append_job_event(
                    job,
                    "dependency-failed",
                    "FAILED",
                    "附件解析未完成，后续任务未执行",
                    {"dependencyJobIds": failed},
                )
                db.session.commit()
                continue
            if any(
                str(by_id[dependency_id].status or "").upper() != "SUCCEEDED"
                for dependency_id in dependency_ids
            ):
                continue
        try:
            _redis().xadd(
                _stream_for_job(job),
                {"data": json.dumps(row.payload)},
                maxlen=100000,
            )
            row.published = datetime.datetime.utcnow()
            row.publish_attempts += 1
            row.last_error = None
            db.session.commit()
            published += 1
        except redis.RedisError as exc:
            db.session.rollback()
            current = TeachingJobOutbox.query.filter_by(id=row.id).first()
            if current:
                current.publish_attempts += 1
                current.last_error = _safe_error(exc, limit=4000)
                db.session.commit()
            logger.warning(
                "Unable to publish teaching job %s", row.job_id, exc_info=True
            )
    return published


def _set_material_job_state(job, status):
    """Keep the latest material revision aligned with its terminal/retry job."""

    if job.kind != "material.analyze":
        return
    payload = job.payload or {}
    material = TeachingMaterials.query.filter_by(
        id=payload.get("materialId"),
        owner_id=job.owner_id,
    ).first()
    if material is None:
        return
    revision = TeachingMaterialRevisions.query.filter_by(
        id=payload.get("revisionId"),
        material_id=material.id,
    ).first()
    if revision is None:
        return
    revision.status = status
    latest_id = (
        db.session.query(TeachingMaterialRevisions.id)
        .filter_by(material_id=material.id)
        .order_by(TeachingMaterialRevisions.revision.desc())
        .limit(1)
        .scalar()
    )
    if latest_id == revision.id:
        material.status = "UPLOADED" if status == "PENDING" else status


def _cancel_native_authoring_compatibility_job(job):
    """Close the legacy progress record when its durable job is canceled."""

    if job.kind != "learning.authoring":
        return
    legacy_job_id = (job.payload or {}).get("legacyJobId")
    if not legacy_job_id:
        return
    legacy = LearningAuthoringJobs.query.filter_by(id=legacy_job_id).first()
    if legacy is None or legacy.status in {"COMPLETED", "CANCELED"}:
        return
    steps = [dict(item) for item in (legacy.steps or [])]
    canceled_step = None
    for step in steps:
        if step.get("id") == legacy.stage or step.get("status") == "RUNNING":
            canceled_step = step
            break
    if canceled_step is None:
        canceled_step = next(
            (step for step in steps if step.get("status") == "PENDING"),
            None,
        )
    if canceled_step is not None:
        canceled_step["status"] = "CANCELED"
        canceled_step["message"] = "任务已取消。"
        canceled_step["updated"] = datetime.datetime.utcnow().isoformat() + "Z"
    legacy.steps = steps
    legacy.status = "CANCELED"
    legacy.stage = "canceled"
    legacy.error = None
    legacy.completed = datetime.datetime.utcnow()
    if legacy.draft_id:
        draft = LearningDrafts.query.filter_by(id=legacy.draft_id).first()
        if draft and draft.status == "BUILDING":
            draft.status = "DRAFT"


def _reset_native_authoring_compatibility_job(legacy):
    if legacy is None or legacy.status not in {"FAILED", "RUNNING"}:
        return False
    steps = [dict(item) for item in (legacy.steps or [])]
    for step in steps:
        if step.get("status") in {"RUNNING", "FAILED"}:
            step["status"] = "PENDING"
            step["message"] = "等待自动重试。"
    legacy.steps = steps
    if legacy.draft_id and legacy.kind == "CREATE":
        legacy.kind = "VALIDATE"
    legacy.status = "QUEUED"
    legacy.stage = "queued"
    legacy.progress = 0
    legacy.error = None
    legacy.completed = None
    return True


def _reset_native_solution_compatibility_run(run):
    """Re-arm a failed/leased solution run for the next durable attempt."""

    if run is None or run.status not in {"FAILED", "RUNNING"}:
        return False
    run.status = "QUEUED"
    run.phase = "queued"
    run.progress = 0
    run.error = None
    run.completed = None
    verification = dict(run.verification or {})
    verification.pop("retryable", None)
    run.verification = verification
    return True


def cancel_job(job, user_id):
    job = TeachingJobs.query.filter_by(id=job.id).with_for_update().first()
    if job is None or job.owner_id != user_id:
        raise PermissionError("Job not found")
    if job.status in {"SUCCEEDED", "FAILED", "CANCELED"}:
        _, materialization_job = _single_candidate_materialization(
            job,
            job.result,
        )
        if materialization_job and materialization_job.status in {
            "QUEUED",
            "RUNNING",
            "CANCEL_REQUESTED",
        }:
            cancel_job(materialization_job, user_id)
        return job
    now = datetime.datetime.utcnow()
    job.status = "CANCELED" if job.status == "QUEUED" else "CANCEL_REQUESTED"
    job.canceled = now
    job.updated = now
    append_job_event(job, job.stage, job.status, "用户已请求取消任务")
    if job.status == "CANCELED":
        _set_material_job_state(job, "CANCELED")
        _cancel_native_authoring_compatibility_job(job)
    for card in ConversationCards.query.filter_by(
        object_type="job", object_id=job.id
    ).all():
        card.state = {
            **(card.state or {}),
            "status": job.status,
            "stage": job.stage,
            "progress": job.progress,
        }
        card.actions = ["open", "retry"] if job.status == "CANCELED" else ["open"]
    _sync_candidate_generation_card(job)
    _sync_parent_generation_state(job)
    _sync_agent_message_status(job)
    db.session.commit()
    return job


def dismiss_job_from_task_list(job, user_id):
    """Hide a terminal task from the drawer without deleting its conversation."""

    job = TeachingJobs.query.filter_by(id=job.id).with_for_update().first()
    if job is None or job.owner_id != user_id:
        raise PermissionError("Job not found")
    _, materialization_job = _single_candidate_materialization(job, job.result)
    effective_status = str(
        (materialization_job and materialization_job.status) or job.status or ""
    ).upper()
    if effective_status not in {"SUCCEEDED", "FAILED", "CANCELED"}:
        raise ValueError("只有已完成、失败或已取消的任务才能从列表删除")
    job.payload = {
        **(job.payload or {}),
        "taskListHidden": True,
    }
    job.updated = datetime.datetime.utcnow()
    cards = {
        card.id: card
        for card in ConversationCards.query.filter_by(
            object_type="job",
            object_id=job.id,
        ).all()
    }
    message = _agent_message_for_job(job)
    if message is not None:
        message.metadata_json = {
            **(message.metadata_json or {}),
            "taskListHidden": True,
        }
        for card in ConversationCards.query.filter_by(message_id=message.id).all():
            card_state = card.state or {}
            if str(card.object_id) == str(job.id) or str(
                card_state.get("jobId") or ""
            ) == str(job.id):
                cards[card.id] = card
    for card in cards.values():
        card.state = {
            **(card.state or {}),
            "taskListHidden": True,
        }
    db.session.commit()
    return job


def _legacy_authoring_retry_source(job, user_id):
    """Find the live native record left by the former clone-on-retry flow."""

    payload = job.payload or {}
    descriptor = str(payload.get("title") or payload.get("prompt") or "").strip()
    if not descriptor:
        return None, None, []
    query = TeachingJobs.query.filter_by(owner_id=user_id, kind=job.kind)
    if job.action_id:
        query = query.filter_by(action_id=job.action_id)
    elif job.thread_id:
        query = query.filter_by(thread_id=job.thread_id)
    else:
        return None, None, []
    discriminators = (
        "batchId",
        "batchIndex",
        "artifactId",
        "candidateSetId",
        "challengeId",
        "materialId",
    )
    matches = []
    for candidate in query.order_by(TeachingJobs.created.desc()).limit(100).all():
        candidate_payload = candidate.payload or {}
        candidate_descriptor = str(
            candidate_payload.get("title") or candidate_payload.get("prompt") or ""
        ).strip()
        if candidate_descriptor != descriptor:
            continue
        if any(
            str(candidate_payload.get(key) or "") != str(payload.get(key) or "")
            for key in discriminators
        ):
            continue
        matches.append(candidate)
    for candidate in matches:
        legacy_id = (candidate.payload or {}).get("legacyJobId")
        if not legacy_id:
            continue
        source = LearningAuthoringJobs.query.filter_by(
            id=legacy_id,
            author_id=user_id,
        ).first()
        if source is not None:
            return candidate, source, matches
    return None, None, matches


def _replace_legacy_retry_surfaces(job, superseded_job_ids):
    """Keep old jobs for audit while removing their duplicate conversation UI."""

    ids = {str(item) for item in superseded_job_ids if str(item) != str(job.id)}
    if not ids:
        return
    cards = ConversationCards.query.filter(
        ConversationCards.object_type == "job",
        ConversationCards.object_id.in_(ids),
    ).all()
    message_ids = {card.message_id for card in cards}
    for card in cards:
        db.session.delete(card)
    for superseded in TeachingJobs.query.filter(TeachingJobs.id.in_(ids)).all():
        superseded.payload = {
            **(superseded.payload or {}),
            "supersededByJobId": job.id,
        }
    db.session.flush()
    if not message_ids:
        return
    messages = TeachingAgentMessages.query.filter(
        TeachingAgentMessages.id.in_(message_ids),
        TeachingAgentMessages.role == "assistant",
    ).all()
    for message in messages:
        if ConversationCards.query.filter_by(message_id=message.id).count() == 0:
            db.session.delete(message)


def retry_job(job, user_id, idempotency_token):
    job = TeachingJobs.query.filter_by(id=job.id).with_for_update().first()
    if job is None or job.owner_id != user_id:
        raise PermissionError("Job not found")
    token = str(idempotency_token or "").strip()
    if not token or len(token) > 80:
        raise ValueError("A retry idempotency key is required")
    if str((job.payload or {}).get("manualRetryToken") or "") == token:
        return job, False
    if job.status == "SUCCEEDED":
        _, materialization_job = _single_candidate_materialization(
            job,
            job.result,
        )
        if materialization_job and materialization_job.status in {
            "FAILED",
            "CANCELED",
        }:
            retried, created = retry_job(
                materialization_job,
                user_id,
                idempotency_token,
            )
            _sync_parent_generation_state(retried)
            db.session.commit()
            return job, created
    if job.status not in {"FAILED", "CANCELED"}:
        raise ValueError("Only failed or canceled jobs can be retried")
    payload = _retry_payload(job, user_id)
    superseded_job_ids = payload.pop("_supersededRetryJobIds", [])
    payload.pop("taskListHidden", None)
    _replace_legacy_retry_surfaces(job, superseded_job_ids)
    payload["manualRetryToken"] = token
    payload["manualRetryAttempt"] = max(
        1,
        int((job.payload or {}).get("manualRetryAttempt") or 0) + 1,
    )
    now = datetime.datetime.utcnow()
    job.payload = payload
    job.result = {}
    job.status = "QUEUED"
    job.stage = "queued"
    job.progress = 0
    job.trace_id = uuid.uuid4().hex
    job.lease_owner = None
    job.lease_expires = None
    job.heartbeat = None
    job.attempt_count = 0
    job.error = None
    job.updated = now
    job.completed = None
    job.canceled = None
    TeachingJobEvents.query.filter_by(job_id=job.id).delete(
        synchronize_session=False
    )
    ModelInvocations.query.filter_by(job_id=job.id).delete(
        synchronize_session=False
    )
    db.session.flush()
    append_job_event(job, "queued", "QUEUED", "任务已按失败反馈重新排队")
    outbox = TeachingJobOutbox.query.filter_by(job_id=job.id).first()
    if outbox is None:
        outbox = TeachingJobOutbox(job_id=job.id)
        db.session.add(outbox)
    outbox.payload = {"job_id": job.id, "trace_id": job.trace_id}
    outbox.published = None
    outbox.publish_attempts = 0
    outbox.last_error = None
    if job.action_id:
        action = TeachingAgentActions.query.filter_by(id=job.action_id).first()
        if action:
            action.status = "PENDING"
            action.error = None
            action.completed = None
            prior_result = {
                key: value
                for key, value in (action.result or {}).items()
                if key
                not in {
                    "error",
                    "failure",
                    "failedJobId",
                    "retryOfJobId",
                    "retryOfLegacyJobId",
                    "retryOfSolutionRunId",
                }
            }
            action.result = {
                **prior_result,
                "retryJobId": job.id,
                **(
                    {"legacyJobId": payload["legacyJobId"]}
                    if payload.get("legacyJobId")
                    else {}
                ),
                **(
                    {"solutionRunId": payload["solutionRunId"]}
                    if payload.get("solutionRunId")
                    else {}
                ),
            }
    _set_material_job_state(job, "PENDING")
    if job.kind == "artifact.materialize":
        artifact = TeachingArtifacts.query.filter_by(
            id=(job.payload or {}).get("artifactId"),
            owner_id=user_id,
        ).first()
        if artifact:
            artifact.status = "GENERATING"
    elif job.kind == "learning.authoring":
        artifact = TeachingArtifacts.query.filter_by(
            id=payload.get("artifactId"),
            owner_id=user_id,
        ).first()
        if artifact:
            artifact.status = "VALIDATING"
    for card in ConversationCards.query.filter_by(
        object_type="job", object_id=job.id
    ).all():
        card.state = {
            key: value
            for key, value in (card.state or {}).items()
            if key
            not in {
                "error",
                "failureMessage",
                "result",
                "resultTarget",
                "taskListHidden",
            }
        }
        card.state.update(
            {
                "status": "QUEUED",
                "stage": "queued",
                "progress": 0,
                "kind": job.kind,
                "artifactType": payload.get("artifactType"),
            }
        )
        card.actions = ["open", "cancel"]
    message = _agent_message_for_job(job)
    if message is not None:
        message.content = "正在根据上一轮失败反馈重新执行…"
        message.metadata_json = {
            **(message.metadata_json or {}),
            "pending": True,
            "presentation": "activity",
            "jobId": job.id,
            "jobKind": job.kind,
            "jobStatus": "QUEUED",
            "failed": False,
            "taskListHidden": False,
            "manualRetryAttempt": payload["manualRetryAttempt"],
        }
    if job.kind in {"candidate.generate", "self.candidate.generate"}:
        candidate_set = TeachingCandidateSets.query.filter_by(
            id=payload.get("candidateSetId"),
            owner_id=user_id,
        ).first()
        if candidate_set:
            candidate_set.status = "GENERATING"
        _sync_candidate_generation_card(job)
    _sync_parent_generation_state(job)
    _sync_native_authoring_batch_action(job)
    db.session.commit()
    publish_pending_outbox(job_id=job.id)
    return job, True


def _retry_payload(job, user_id):
    payload = {**(job.payload or {}), "manualRetry": True}
    for key in (
        "retryOfJobId",
        "retryOfLegacyJobId",
        "retryOfSolutionRunId",
    ):
        payload.pop(key, None)
    if job.kind == "learning.authoring":
        source = LearningAuthoringJobs.query.filter_by(
            id=payload.get("legacyJobId"),
            author_id=user_id,
        ).first()
        if source is None:
            fallback_job, source, lineage = _legacy_authoring_retry_source(
                job,
                user_id,
            )
            if source is None or fallback_job is None:
                raise ValueError("The authoring run required for retry no longer exists")
            payload = {
                **(fallback_job.payload or {}),
                "manualRetry": True,
                "manualRetryRootJobId": job.id,
                "_supersededRetryJobIds": [
                    item.id for item in lineage if item.id != job.id
                ],
            }
            for key in (
                "retryOfJobId",
                "retryOfLegacyJobId",
                "retryOfSolutionRunId",
            ):
                payload.pop(key, None)
        steps = []
        for item in source.steps or []:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            steps.append(
                {
                    "id": str(item["id"]),
                    "label": str(item.get("label") or item["id"]),
                    "status": "PENDING",
                    "message": "",
                }
            )
        retry_kind = source.kind
        if source.draft_id and retry_kind == "CREATE":
            retry_kind = "VALIDATE"
        cloned = LearningAuthoringJobs(
            dojo_id=source.dojo_id,
            module_index=source.module_index,
            author_id=source.author_id,
            draft_id=(
                source.draft_id
                if retry_kind in {"REVISE", "VALIDATE"}
                else None
            ),
            kind=retry_kind,
            title=source.title,
            request_json=dict(source.request_json or {}),
            steps=steps,
        )
        db.session.add(cloned)
        db.session.flush()
        payload["legacyJobId"] = cloned.id
        db.session.delete(source)
    elif job.kind == "learning.solution":
        source = LearningSolutionRuns.query.filter_by(
            id=payload.get("solutionRunId")
        ).first()
        if source is None:
            raise ValueError("The solution run required for retry no longer exists")
        verification = dict(source.verification or {})
        verification["flagVerified"] = False
        verification["flagRedacted"] = True
        cloned = LearningSolutionRuns(
            dojo_id=source.dojo_id,
            module_index=source.module_index,
            challenge_index=source.challenge_index,
            challenge_id=source.challenge_id,
            requested_by=user_id,
            package_version=source.package_version,
            model=source.model,
            steps=[],
            solution={},
            verification=verification,
        )
        db.session.add(cloned)
        db.session.flush()
        payload["solutionRunId"] = cloned.id
        db.session.delete(source)
    return payload


def _acquire_job(job_id, worker_id):
    now = datetime.datetime.utcnow()
    job = TeachingJobs.query.filter_by(id=job_id).with_for_update().first()
    if job is None or job.status in {"SUCCEEDED", "FAILED", "CANCELED"}:
        db.session.rollback()
        return None
    if job.status == "CANCEL_REQUESTED":
        job.status = "CANCELED"
        job.completed = now
        _set_material_job_state(job, "CANCELED")
        _cancel_native_authoring_compatibility_job(job)
        append_job_event(job, job.stage, "CANCELED", "任务在执行前已取消")
        for card in ConversationCards.query.filter_by(
            object_type="job", object_id=job.id
        ).all():
            card.state = {
                **(card.state or {}),
                "status": "CANCELED",
                "stage": "canceled",
                "progress": job.progress,
            }
            card.actions = ["open", "retry"]
        _sync_candidate_generation_card(job)
        _sync_agent_message_status(job)
        db.session.commit()
        return None
    if job.status == "RUNNING" and job.lease_expires and job.lease_expires > now:
        db.session.rollback()
        return None
    job.status = "RUNNING"
    job.stage = "routing"
    job.progress = max(job.progress, 5)
    job.lease_owner = worker_id
    job.lease_expires = now + datetime.timedelta(seconds=LEASE_SECONDS)
    job.heartbeat = now
    job.attempt_count += 1
    job.error = None
    append_job_event(job, "routing", "RUNNING", "Worker 已获取任务租约")
    _sync_candidate_generation_card(job)
    db.session.commit()
    return job


def heartbeat(job, *, stage, progress, message):
    refreshed = TeachingJobs.query.filter_by(id=job.id).with_for_update().first()
    if refreshed.status == "CANCEL_REQUESTED":
        raise JobCanceled("Task cancellation requested")
    now = datetime.datetime.utcnow()
    refreshed.stage = stage
    refreshed.progress = progress
    refreshed.heartbeat = now
    refreshed.lease_expires = now + datetime.timedelta(seconds=LEASE_SECONDS)
    refreshed.updated = now
    append_job_event(refreshed, stage, "RUNNING", message)
    _sync_candidate_generation_card(refreshed)
    db.session.commit()
    return refreshed


MATERIAL_GROUNDED_ARTIFACT_TYPES = {
    "attack-defense-scene",
    "simulation",
    "slide-deck",
}


def _job_material_grounding_required(job, payload):
    if job.kind not in {
        "candidate.generate",
        "self.candidate.generate",
        "artifact.materialize",
    }:
        return False
    return (
        str(payload.get("artifactType") or "").strip().lower()
        in MATERIAL_GROUNDED_ARTIFACT_TYPES
    )


def _student_material_snapshot(payload):
    context = payload.get("materialContext")
    materials = payload.get("sourceMaterials")
    refs = payload.get("sourceRefs")
    dossier = payload.get("materialDossier")
    if not all(
        (
            isinstance(context, dict),
            isinstance(materials, list),
            isinstance(refs, list),
            isinstance(dossier, dict),
            isinstance(dossier.get("materials"), list),
        )
    ):
        return None
    if context.get("policy") not in {
        "student-visible-course-content-v1",
        "student-visible-relevant-course-content-v1",
    }:
        return None
    if context.get("complete") is not True or context.get("incomplete") not in (
        None,
        (),
        [],
    ):
        return None
    try:
        expected = int(context.get("expectedMaterialCount"))
        included = int(context.get("includedMaterialCount"))
    except (TypeError, ValueError):
        return None
    if expected != len(materials) or included != len(materials):
        return None
    if dossier.get("coverage") != context or dossier.get("materials") != materials:
        return None

    material_ids = []
    revision_ids = []
    ref_by_id = {}
    for ref in refs:
        if not isinstance(ref, dict) or ref.get("type") != "course-content":
            continue
        ref_id = str(ref.get("id") or "")
        if not ref_id or ref_id in ref_by_id:
            return None
        ref_by_id[ref_id] = ref
    for material in materials:
        if not isinstance(material, dict):
            return None
        material_id = str(material.get("id") or "")
        revision_id = str(material.get("revisionId") or "")
        sha256 = str(material.get("sha256") or "")
        coverage = material.get("coverage")
        analysis = material.get("analysis")
        excerpts = material.get("excerpts")
        if (
            not material_id
            or not revision_id
            or not sha256
            or material_id in material_ids
            or not isinstance(coverage, dict)
            or coverage.get("complete") is not True
            or not isinstance(analysis, dict)
            or analysis.get("courseVisible") is not True
            or not isinstance(excerpts, list)
            or not excerpts
            or any(
                not isinstance(excerpt, dict)
                or not str(excerpt.get("content") or "").strip()
                for excerpt in excerpts
            )
        ):
            return None
        ref = ref_by_id.get(material_id)
        if (
            ref is None
            or str(ref.get("revisionId") or "") != revision_id
            or str(ref.get("sha256") or "") != sha256
        ):
            return None
        material_ids.append(material_id)
        revision_ids.append(revision_id)
    if list(context.get("materialIds") or []) != material_ids:
        return None
    if list(context.get("revisionIds") or []) != revision_ids:
        return None
    if set(ref_by_id) != set(material_ids):
        return None
    return {
        "sourceRefs": refs,
        "sourceMaterials": materials,
        "coverage": context,
        "dossier": dossier,
    }


def _runtime_payload(job):
    payload = dict(job.payload or {})
    if job.kind not in {
        "agent.chat",
        "candidate.generate",
        "self.candidate.generate",
        "artifact.materialize",
    }:
        return payload
    student_snapshot = (
        _student_material_snapshot(payload)
        if job.kind == "self.candidate.generate"
        else None
    )
    required = _job_material_grounding_required(job, payload)
    prompt = str(payload.get("prompt") or payload.get("instruction") or "")
    source_refs = payload.get("sourceRefs") or []
    include_course_materials = (
        job.kind != "agent.chat"
        or bool(source_refs)
        or course_material_grounding_requested(prompt)
    )
    material_context = student_snapshot or build_course_material_context(
        owner_id=job.owner_id,
        dojo_id=job.dojo_id if include_course_materials else None,
        prompt=prompt,
        source_refs=source_refs,
        require_complete=required,
    )
    payload["sourceRefs"] = material_context["sourceRefs"]
    payload["sourceMaterials"] = material_context["sourceMaterials"]
    payload["materialContext"] = material_context["coverage"]
    if student_snapshot is not None:
        payload["materialDossier"] = student_snapshot["dossier"]
    elif material_context["sourceMaterials"]:
        payload["materialDossier"] = compact_material_grounding(material_context)
    else:
        payload.pop("materialDossier", None)
    persisted_payload = (
        payload
        if student_snapshot is not None
        else {
            **(job.payload or {}),
            "sourceRefs": material_context["sourceRefs"],
            "materialContext": material_context["coverage"],
        }
    )
    if persisted_payload != (job.payload or {}):
        job.payload = persisted_payload
    if job.kind in {"candidate.generate", "self.candidate.generate"}:
        candidate_set_id = payload.get("candidateSetId")
        candidate_set = TeachingCandidateSets.query.filter_by(
            id=candidate_set_id,
            owner_id=job.owner_id,
        ).first()
        if candidate_set is not None and student_snapshot is None:
            candidate_set.source_refs = material_context["sourceRefs"]
    return payload


def _agent_runtime_startup_connection_error(exc):
    """Return whether a local runtime did not accept the request at all."""

    if not isinstance(exc, requests.exceptions.ConnectionError):
        return False
    message = str(exc).lower()
    return (
        "connection refused" in message
        or "failed to establish a new connection" in message
    )


def _invoke_agent_runtime(job, route, payload=None):
    payload = dict(payload or job.payload or {})

    url = f"{config.AGENT_RUNTIME_INTERNAL_URL}/api/integration/jobs/execute"
    request_kwargs = {
        "headers": {
            "X-AISecEdu-Service-Token": config.AGENT_RUNTIME_SERVICE_SECRET,
            "X-Trace-ID": job.trace_id or "",
            "Content-Type": "application/json",
        },
        "json": {
            "jobId": job.id,
            "kind": job.kind,
            "scope": {
                "ownerId": job.owner_id,
                "dojoId": job.dojo_id,
                "moduleIndex": job.module_index,
            },
            "payload": payload,
            "modelRoute": route,
        },
        "timeout": (10, max(60, int(config.DOJO_AI_TIMEOUT_SECONDS) * 4)),
    }
    retry_delays = AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS
    for attempt in range(len(retry_delays) + 1):
        try:
            response = requests.post(url, **request_kwargs)
        except requests.exceptions.ConnectionError as exc:
            if (
                not _agent_runtime_startup_connection_error(exc)
                or attempt >= len(retry_delays)
            ):
                raise
            retry_delay = retry_delays[attempt]
            logger.warning(
                "Agent runtime is temporarily unavailable for teaching job %s; "
                "retrying connection in %ss (%s/%s)",
                job.id,
                retry_delay,
                attempt + 1,
                len(retry_delays),
            )
            time.sleep(retry_delay)
            continue
        if (
            response.status_code in AGENT_RUNTIME_RETRYABLE_STATUS_CODES
            and attempt < len(retry_delays)
        ):
            retry_delay = retry_delays[attempt]
            logger.warning(
                "Agent runtime returned HTTP %s for teaching job %s; "
                "retrying in %ss (%s/%s)",
                response.status_code,
                job.id,
                retry_delay,
                attempt + 1,
                len(retry_delays),
            )
            time.sleep(retry_delay)
            continue
        break
    if response.status_code in {400, 401, 403, 404, 409, 422}:
        raise PermanentJobError(
            f"Global agent runtime rejected job (HTTP {response.status_code})"
        )
    response.raise_for_status()
    body = response.json()
    if not body.get("success") or not isinstance(body.get("result"), dict):
        raise RuntimeError(
            "Global agent runtime returned an invalid integration result"
        )
    return body


def _record_invocation(job, route, model_meta, *, status, error=None):
    actual = str(model_meta.get("actualModel") or model_meta.get("actual_model") or "")
    provider = str(model_meta.get("provider") or route["provider"])
    execution_mode = str(model_meta.get("executionMode") or "")
    validated_route = route
    if status == "SUCCEEDED":
        if not actual:
            raise PermanentJobError(
                "Global agent runtime did not report the actual model"
            )
        validated_route = validate_actual_model(route, actual)
    parameters = dict(model_meta.get("parameters") or {})
    if execution_mode:
        parameters["executionMode"] = execution_mode
    invocation = ModelInvocations(
        owner_id=job.owner_id,
        job_id=job.id,
        route=route["route"],
        provider=provider,
        actual_model=actual or route["actual_model"],
        model_version=model_meta.get("modelVersion"),
        parameters=parameters,
        usage=model_meta.get("usage") or {},
        latency_ms=model_meta.get("latencyMs"),
        request_hash=route["request_hash"],
        response_hash=model_meta.get("responseHash"),
        status=status,
        degraded=bool(model_meta.get("degraded") or validated_route.get("degraded")),
        error=_safe_error(error) if error else None,
    )
    db.session.add(invocation)
    return invocation


def _agent_message_for_job(job):
    if not job.thread_id:
        return None
    candidates = (
        TeachingAgentMessages.query.filter_by(
            thread_id=job.thread_id,
            role="assistant",
        )
        .order_by(TeachingAgentMessages.id.desc())
        .limit(20)
        .all()
    )
    return next(
        (row for row in candidates if (row.metadata_json or {}).get("jobId") == job.id),
        None,
    )


def _sync_agent_message_status(job):
    message = _agent_message_for_job(job)
    if message is None:
        return
    status = str(job.status or "QUEUED").upper()
    terminal = status in {"SUCCEEDED", "FAILED", "CANCELED"}
    presentation = (
        "answer"
        if status == "SUCCEEDED"
        else "error"
        if status == "FAILED"
        else "canceled"
        if status == "CANCELED"
        else "activity"
    )
    message.metadata_json = {
        **(message.metadata_json or {}),
        "pending": not terminal,
        "presentation": presentation,
        "jobId": job.id,
        "jobKind": job.kind,
        "jobStatus": status,
        "failed": status == "FAILED",
    }
    if status == "CANCELED":
        message.content = "任务已取消。"
    elif status == "SUCCEEDED" and job.kind == "learning.authoring":
        message.content = "CTF 实践题已通过完整验证并准备好。"
    elif status == "SUCCEEDED" and job.kind == "learning.solution":
        message.content = "独立解题验证已通过。"


def _bind_generation_scope(job, generation_options):
    if not generation_options or job.dojo_id is not None:
        return bool(generation_options)
    bound_scope = generation_options.get("boundScope") or {}
    target_dojo_id = bound_scope.get("dojoId")
    target_module_index = bound_scope.get("moduleIndex")
    if target_dojo_id is None or not job.thread_id:
        return False
    thread = (
        TeachingAgentThreads.query.filter_by(
            id=job.thread_id,
            user_id=job.owner_id,
        )
        .with_for_update()
        .first()
    )
    if thread is None:
        return False
    if thread.dojo_id is not None and (
        thread.dojo_id != target_dojo_id
        or thread.module_index != target_module_index
    ):
        return False
    thread.dojo_id = target_dojo_id
    thread.module_index = target_module_index
    thread.updated = datetime.datetime.utcnow()
    job.dojo_id = target_dojo_id
    job.module_index = target_module_index
    return True


def _persist_result(job, result):
    if job.kind == "agent.chat":
        context = (job.payload or {}).get("context")
        context = context if isinstance(context, dict) else {}
        agent_loop = context.get("agentLoop")
        agent_loop = agent_loop if isinstance(agent_loop, dict) else {}
        raw_generation_options = isinstance(result.get("generationOptions"), dict)
        generation_options = validated_generation_options(job, result)
        if generation_options and not _bind_generation_scope(job, generation_options):
            generation_options = None
        tool_proposals = _validated_tool_proposals(job, result)
        if generation_options:
            tool_proposals = [
                proposal
                for proposal in tool_proposals
                if proposal.get("tool") not in GENERATION_OPTION_TOOLS
            ]
        stored_files = persist_agent_deliverables(job, result.get("deliverables"))
        public_files = [
            public
            for item in stored_files
            if (public := public_agent_file(item)) is not None
        ]
        answer = _agent_answer(result)[:32000]
        if raw_generation_options and generation_options is None and job.dojo_id is None:
            answer = (
                "我还不能安全地开始生成，因为目标课程或章节没有通过权限与存在性校验。"
                "请用自然语言明确目标课程和章节；如果面向整门课程，请直接说明“整个课程”。"
                "当前附件会继续保留在这次对话中。"
            )
        message = None
        if job.thread_id:
            message = _agent_message_for_job(job)
            if message is None:
                message = TeachingAgentMessages(
                    thread_id=job.thread_id,
                    user_id=job.owner_id,
                    role="assistant",
                    content=answer,
                    metadata_json={},
                )
                db.session.add(message)
                db.session.flush()
            message.content = answer
            message.metadata_json = {
                "pending": False,
                "presentation": "answer",
                "jobId": job.id,
                "jobKind": job.kind,
                "jobStatus": "SUCCEEDED",
                "suggestions": result.get("suggestions") or [],
                "selectedSkills": result.get("selectedSkills") or [],
                "plan": result.get("plan") or [],
                "files": public_files,
                "requiresAction": bool(
                    result.get("requiresAction") or tool_proposals or generation_options
                ),
                "toolProposals": tool_proposals,
                "generationOptions": generation_options,
                "agentLoopDepth": int(agent_loop.get("depth") or 0),
                "agentLoopTrace": agent_loop.get("trace") or [],
                "agentRootJobId": str(agent_loop.get("rootJobId") or job.id),
            }
        for card in ConversationCards.query.filter_by(
            object_type="job", object_id=job.id
        ).all():
            db.session.delete(card)
        return {
            "answer": answer,
            "suggestions": result.get("suggestions") or [],
            "requiresAction": bool(
                result.get("requiresAction") or tool_proposals or generation_options
            ),
            "toolProposals": tool_proposals,
            "generationOptions": generation_options,
            "selectedSkills": result.get("selectedSkills") or [],
            "plan": result.get("plan") or [],
            "files": stored_files,
            "agentLoop": agent_loop,
        }

    if job.kind in {"candidate.generate", "self.candidate.generate"}:
        candidate_set = TeachingCandidateSets.query.filter_by(
            id=job.payload.get("candidateSetId"),
            owner_id=job.owner_id,
        ).first()
        if candidate_set is None:
            raise PermanentJobError("Candidate set no longer exists")
        rows = replace_generated_candidates(candidate_set, result.get("candidates"))
        generation_report = result.get("generationReport")
        if isinstance(generation_report, dict):
            candidate_set.request_json = {
                **(candidate_set.request_json or {}),
                "generationReport": scrub_payload(generation_report),
            }
        invocation = (
            ModelInvocations.query.filter_by(job_id=job.id, status="SUCCEEDED")
            .order_by(ModelInvocations.created.desc())
            .first()
        )
        cards = ConversationCards.query.filter_by(
            object_type="candidate_set", object_id=candidate_set.id
        ).all()
        generation_mode = str(
            (candidate_set.request_json or {}).get("generationMode")
            or ("single" if len(rows) == 1 else "multiple")
        )
        for card in cards:
            card.card_type = "candidate_set"
            card.state = {
                "status": "READY",
                "kind": candidate_set.kind,
                "candidateCount": len(rows),
                "generationMode": generation_mode,
                "generationReason": (candidate_set.request_json or {}).get(
                    "generationReason"
                ),
                "jobId": job.id,
                "sourceCoverage": len(candidate_set.source_refs or []),
                "qualityCheck": "DISTINCT_CANDIDATES_PASS",
                "modelRoute": invocation.route if invocation else None,
                "actualModel": invocation.actual_model if invocation else None,
                "degraded": bool(invocation.degraded) if invocation else False,
                "generationReport": scrub_payload(generation_report)
                if isinstance(generation_report, dict)
                else None,
                "updated": datetime.datetime.utcnow().isoformat() + "Z",
            }
            card.actions = ["compare", "select", "regenerate"]
        materialized_result = {}
        if (
            generation_mode == "single"
            and len(rows) == 1
            and candidate_set.self_workspace_id is None
        ):
            user = Users.query.filter_by(id=job.owner_id).first()
            if user is None:
                raise PermanentJobError("Artifact owner no longer exists")
            artifact, revision = materialize_candidate(rows[0].id, user)
            materialization_job, _ = enqueue_job(
                owner_id=job.owner_id,
                kind="artifact.materialize",
                idempotency_key=(f"candidate-materialize:{job.owner_id}:{rows[0].id}"),
                payload={
                    "artifactId": artifact.id,
                    "candidateSetId": candidate_set.id,
                    "parentGenerationJobId": job.id,
                    "expectedRevision": revision.revision,
                    "artifactType": artifact.artifact_type,
                    "title": artifact.title,
                    "plan": revision.content,
                    "requestPrompt": candidate_request_prompt(candidate_set),
                    "sourceRefs": list(candidate_set.source_refs or []),
                    "allowDegraded": bool((job.payload or {}).get("allowDegraded")),
                },
                dojo_id=artifact.dojo_id,
                module_index=artifact.module_index,
                thread_id=candidate_set.thread_id,
                priority=25,
            )
            artifact = TeachingArtifacts.query.filter_by(id=artifact.id).first()
            if materialization_job.status in {
                "QUEUED",
                "RUNNING",
                "CANCEL_REQUESTED",
            }:
                artifact.status = "GENERATING"
            for card in cards:
                card.state = {
                    **(card.state or {}),
                    "status": "GENERATING",
                    "artifactId": artifact.id,
                    "materializationJobId": materialization_job.id,
                }
                card.actions = ["open"]
            materialized_result = {
                "artifactId": artifact.id,
                "materializationJobId": materialization_job.id,
            }
            db.session.commit()
        if job.action_id:
            action = TeachingAgentActions.query.filter_by(id=job.action_id).first()
            if action:
                action.result = {
                    "jobId": job.id,
                    "candidateSetId": candidate_set.id,
                    **materialized_result,
                }
                if materialized_result:
                    action.status = "PENDING"
                    action.completed = None
                else:
                    action.status = "SUCCEEDED"
                    action.completed = datetime.datetime.utcnow()
        return {
            "candidateSetId": candidate_set.id,
            "candidateCount": len(result["candidates"]),
            "generationMode": generation_mode,
            **(
                {"generationReport": scrub_payload(generation_report)}
                if isinstance(generation_report, dict)
                else {}
            ),
            **materialized_result,
        }

    if job.kind == "artifact.revise":
        artifact = TeachingArtifacts.query.filter_by(
            id=job.payload.get("artifactId"),
            owner_id=job.owner_id,
        ).first()
        user = Users.query.filter_by(id=job.owner_id).first()
        if artifact is None or user is None:
            raise PermanentJobError("Artifact or owner no longer exists")
        expected_revision = int(job.payload.get("expectedRevision"))
        revision_content = result.get("content")
        revision = TeachingArtifactRevisions.query.filter_by(
            artifact_id=artifact.id,
            parent_revision=expected_revision,
            content_hash=content_hash(revision_content),
            created_by=user.id,
        ).first()
        if revision is None:
            revision = create_revision(
                artifact,
                user,
                expected_revision=expected_revision,
                instruction=str(job.payload.get("instruction") or ""),
                content=revision_content,
            )
        invocation = (
            ModelInvocations.query.filter_by(job_id=job.id, status="SUCCEEDED")
            .order_by(ModelInvocations.created.desc())
            .first()
        )
        if invocation:
            invocation.artifact_revision_id = revision.id
            revision.validation = {
                "status": "GENERATED",
                "modelRoute": invocation.route,
                "actualModel": invocation.actual_model,
                "degraded": invocation.degraded,
            }
        return {
            "artifactId": artifact.id,
            "revisionId": revision.id,
            "revision": revision.revision,
        }

    if job.kind == "artifact.materialize":
        artifact = TeachingArtifacts.query.filter_by(
            id=job.payload.get("artifactId"),
            owner_id=job.owner_id,
        ).first()
        user = Users.query.filter_by(id=job.owner_id).first()
        if artifact is None or user is None:
            raise PermanentJobError("Artifact or owner no longer exists")
        instruction = f"global agent materialization job {job.id}"
        existing = TeachingArtifactRevisions.query.filter_by(
            artifact_id=artifact.id,
            instruction=instruction,
        ).first()
        if existing:
            return {
                "artifactId": artifact.id,
                "revisionId": existing.id,
                "revision": existing.revision,
            }
        revision = create_revision(
            artifact,
            user,
            expected_revision=int(job.payload.get("expectedRevision")),
            instruction=instruction,
            content=result.get("content"),
        )
        artifact = TeachingArtifacts.query.filter_by(id=artifact.id).first()
        artifact.status = "READY"
        invocation = (
            ModelInvocations.query.filter_by(job_id=job.id, status="SUCCEEDED")
            .order_by(ModelInvocations.created.desc())
            .first()
        )
        if invocation:
            invocation.artifact_revision_id = revision.id
        revision.validation = {
            **(result.get("validation") or {"status": "GENERATED"}),
            **(
                {
                    "modelRoute": invocation.route,
                    "actualModel": invocation.actual_model,
                    "degraded": invocation.degraded,
                }
                if invocation
                else {}
            ),
        }
        candidate = TeachingArtifactCandidates.query.filter_by(
            id=artifact.candidate_id
        ).first()
        candidate_set = (
            TeachingCandidateSets.query.filter_by(id=candidate.candidate_set_id).first()
            if candidate
            else None
        )
        if candidate_set and candidate_set.thread_id:
            message = TeachingAgentMessages(
                thread_id=candidate_set.thread_id,
                user_id=job.owner_id,
                role="assistant",
                content=f"“{artifact.title}”已生成完成。可以打开详情预览、继续用自然语言修改，或提交发布。",
                metadata_json={"jobId": job.id, "artifactId": artifact.id},
            )
            db.session.add(message)
            db.session.flush()
            db.session.add(
                ConversationCards(
                    message_id=message.id,
                    card_type="artifact",
                    object_type="artifact",
                    object_id=artifact.id,
                    revision_id=revision.id,
                    state={
                        "status": "READY",
                        "artifactType": artifact.artifact_type,
                        "revision": revision.revision,
                        "sourceCoverage": len(revision.source_refs or []),
                        "qualityCheck": (revision.validation or {}).get("status"),
                        "modelRoute": invocation.route if invocation else None,
                        "actualModel": invocation.actual_model if invocation else None,
                        "degraded": bool(invocation.degraded) if invocation else False,
                        "updated": datetime.datetime.utcnow().isoformat() + "Z",
                    },
                    actions=["open", "revise", "validate", "request-publish"],
                )
            )
        db.session.commit()
        return {
            "artifactId": artifact.id,
            "revisionId": revision.id,
            "revision": revision.revision,
        }

    if job.kind == "material.analyze":
        material = TeachingMaterials.query.filter_by(
            id=job.payload.get("materialId"), owner_id=job.owner_id
        ).first()
        revision = TeachingMaterialRevisions.query.filter_by(
            id=job.payload.get("revisionId"),
            material_id=material.id if material else None,
        ).first()
        if not material or not revision:
            raise PermanentJobError("Material revision no longer exists")
        chunks = result.get("chunks") or []
        analysis = result.get("analysis") or {}
        coverage = analysis.get("coverage") if isinstance(analysis, dict) else None
        total_characters = (
            sum(len(str(chunk.get("content") or "")) for chunk in chunks)
            if isinstance(chunks, list)
            else 0
        )
        if (
            not isinstance(chunks, list)
            or not chunks
            or not isinstance(coverage, dict)
            or coverage.get("complete") is not True
            or coverage.get("analysisVersion") != MATERIAL_ANALYSIS_VERSION
            or int(coverage.get("analyzedCharacters") or 0) < total_characters
            or int(coverage.get("extractedCharacters") or 0) > int(
                coverage.get("analyzedCharacters") or 0
            )
        ):
            raise PermanentJobError(
                "Global agent runtime returned an incomplete material analysis"
            )
        TeachingMaterialChunks.query.filter_by(revision_id=revision.id).delete()
        for ordinal, chunk in enumerate(chunks):
            db.session.add(
                TeachingMaterialChunks(
                    revision_id=revision.id,
                    ordinal=ordinal,
                    source_type=str(chunk.get("sourceType") or "document")[:32],
                    source_locator=chunk.get("sourceLocator") or {},
                    content=str(chunk.get("content") or ""),
                    metadata_json=chunk.get("metadata") or {},
                )
            )
        revision.status = "READY"
        revision.metadata_json = {
            **(revision.metadata_json or {}),
            "analysis": analysis,
        }
        latest_revision_id = (
            db.session.query(TeachingMaterialRevisions.id)
            .filter_by(material_id=material.id)
            .order_by(TeachingMaterialRevisions.revision.desc())
            .limit(1)
            .scalar()
        )
        if latest_revision_id == revision.id:
            material.status = "READY"
        if job.thread_id:
            message = TeachingAgentMessages(
                thread_id=job.thread_id,
                user_id=job.owner_id,
                role="assistant",
                content=(
                    f"“{material.title}”分析完成：已提取功能点、知识图谱和章节候选。"
                    "后续候选生成可直接引用这份材料。"
                ),
                metadata_json={
                    "jobId": job.id,
                    "jobKind": job.kind,
                    "jobStatus": "SUCCEEDED",
                    "pending": False,
                    "presentation": "answer",
                    "materialId": material.id,
                },
            )
            db.session.add(message)
            db.session.flush()
            db.session.add(
                ConversationCards(
                    message_id=message.id,
                    card_type="material",
                    object_type="material",
                    object_id=material.id,
                    revision_id=revision.id,
                    state={
                        "status": "READY",
                        "dojoId": material.dojo_id,
                        "chapterCount": len(
                            (
                                (result.get("analysis") or {}).get("chapterCandidates")
                                or []
                            )
                        ),
                    },
                    actions=["inspect", "apply-chapters", "generate"],
                )
            )
        return {
            "materialId": material.id,
            "revisionId": revision.id,
            "chunkCount": len(chunks),
            "analysis": result.get("analysis") or {},
        }

    # Session/scenario pre-generation results are durable in the job until an
    # explicit teacher action materializes or publishes them.
    return result


def _persist_agent_failure_message(job):
    """Replace a pending Agent placeholder with an honest terminal outcome."""

    if not job.thread_id:
        return
    message = _agent_message_for_job(job)
    if message is None:
        return
    message.content = _job_failure_message(job) or (
        "这项任务未完成，系统没有产生可用结果。"
    )
    message.metadata_json = {
        **(message.metadata_json or {}),
        "pending": False,
        "presentation": "error",
        "jobKind": job.kind,
        "jobStatus": "FAILED",
        "failed": True,
        "requiresAction": False,
        "toolProposals": [],
    }


def _execute_local_job(job):
    """Execute native 玄甲 work through the same recoverable queue.

    The compatibility authoring record remains the detailed source of stage
    progress while ``TeachingJobs`` supplies durable dispatch, ownership,
    retry/cancellation and a unified operations view.
    """
    if job.kind == "learning.solution":
        run_id = job.payload.get("solutionRunId")
        attempt_count = int(job.attempt_count or 0)
        max_attempts = max(1, int(job.max_attempts or 1))
        if not run_id:
            raise PermanentJobError("Missing solution validation run id")
        from ..learning.solution_agent import _run_solution_agent
        from ..models import LearningSolutionRuns

        run = LearningSolutionRuns.query.filter_by(id=run_id).first()
        if run is None:
            raise PermanentJobError("Solution validation run no longer exists")
        if attempt_count > 1 and _reset_native_solution_compatibility_run(run):
            db.session.commit()
        _run_solution_agent(current_app._get_current_object(), run_id)
        run = LearningSolutionRuns.query.filter_by(id=run_id).first()
        if run is None:
            raise PermanentJobError("Solution validation run no longer exists")
        if run.status != "VERIFIED":
            retryable_error = _native_solution_retryable_error(run)
            if retryable_error and attempt_count < max_attempts:
                _reset_native_solution_compatibility_run(run)
                db.session.commit()
                raise RetryableJobError(retryable_error)
            failure = run.error or "Native solution validation failed"
            if retryable_error:
                failure = (
                    f"{retryable_error} 自动重试次数已用尽，"
                    "请检查模型服务后手动重试。"
                )
            raise PermanentJobError(failure)
        return {
            "solutionRunId": run.id,
            "status": run.status,
            "challengeId": run.challenge_id,
        }

    if job.kind != "learning.authoring":
        raise PermanentJobError(f"Unsupported local job kind: {job.kind}")

    # The compatibility authoring runner commits/rolls back its own session
    # several times. Snapshot all durable job fields before calling it so a
    # failed legacy run cannot leave this outer worker holding a detached ORM
    # instance and obscure the original error.
    job_payload = dict(job.payload or {})
    outer_job_id = job.id
    job_owner_id = job.owner_id
    job_action_id = job.action_id
    legacy_job_id = job_payload.get("legacyJobId")
    if not legacy_job_id:
        raise PermanentJobError("Missing legacy authoring job id")

    # Import lazily to avoid a module cycle while Flask registers namespaces.
    from ..api.v1.learning import AuthoringJobCanceled, _run_authoring_job
    from ..models import LearningAuthoringJobs

    def renew_outer_lease(**progress):
        outer = TeachingJobs.query.filter_by(id=outer_job_id).first()
        if not _native_outer_job_is_active(outer):
            if outer is None:
                raise AuthoringJobCanceled("Task was removed during native authoring")
            raise AuthoringJobCanceled("Task cancellation requested")
        now = datetime.datetime.utcnow()
        legacy_progress = max(0, min(100, int(progress.get("progress") or 0)))
        outer.progress = max(
            int(outer.progress or 0),
            min(84, 20 + legacy_progress * 64 // 100),
        )
        outer.stage = f"native-{str(progress.get('stage') or 'authoring')[:57]}"
        native_status = str(progress.get("status") or "RUNNING")[:24].upper()
        native_message = str(
            progress.get("message")
            or progress.get("label")
            or progress.get("stage")
            or "题目生成阶段已更新"
        )[:8000]
        outer.updated = now
        outer.heartbeat = now
        # A native authoring stage can contain several bounded Pro repair and
        # re-review calls before the compatibility runner emits its next
        # progress event.  Give this specific nested job a longer lease so a
        # second worker cannot reclaim it while the first one is still inside
        # that bounded stage.
        outer.lease_expires = now + datetime.timedelta(seconds=AUTHORING_LEASE_SECONDS)
        latest_event = (
            TeachingJobEvents.query.filter_by(job_id=outer.id)
            .order_by(TeachingJobEvents.sequence.desc())
            .first()
        )
        if _should_append_native_progress_event(
            latest_event,
            outer.stage,
            native_status,
            native_message,
        ):
            details = (
                dict(progress.get("details"))
                if isinstance(progress.get("details"), dict)
                else {}
            )
            append_job_event(
                outer,
                outer.stage,
                native_status,
                native_message,
                {
                    **details,
                    "label": str(progress.get("label") or "")[:240],
                    "progress": int(outer.progress or 0),
                    "nativeProgress": legacy_progress,
                    "nativeStage": str(progress.get("stage") or "authoring")[:80],
                },
            )
        db.session.commit()

    legacy = LearningAuthoringJobs.query.filter_by(id=legacy_job_id).first()
    if legacy is None:
        raise PermanentJobError("Authoring job no longer exists")
    if legacy.status == "CANCELED":
        raise JobCanceled("Native authoring task was canceled")
    if job.attempt_count > 1 and _reset_native_authoring_compatibility_job(legacy):
        db.session.commit()

    try:
        _run_authoring_job(
            current_app._get_current_object(),
            legacy_job_id,
            progress_observer=renew_outer_lease,
        )
    except AuthoringJobCanceled as exc:
        raise JobCanceled(str(exc)) from exc
    legacy = LearningAuthoringJobs.query.filter_by(id=legacy_job_id).first()
    if legacy is None:
        raise PermanentJobError("Authoring job no longer exists")
    if legacy.status == "CANCELED":
        raise JobCanceled("Native authoring task was canceled")
    if legacy.status != "COMPLETED":
        retryable_error = _native_authoring_retryable_error(legacy)
        max_attempts = max(1, int(job.max_attempts or 1))
        if retryable_error and job.attempt_count < max_attempts:
            # Keep the artifact/action in their in-flight state.  The outer
            # worker will persist QUEUED and re-publish this same idempotent
            # job; marking either object failed here would make a transient
            # model outage look terminal to the teacher.
            _reset_native_authoring_compatibility_job(legacy)
            db.session.commit()
            raise RetryableJobError(retryable_error)

        failure = legacy.error or "Native authoring validation failed"
        if retryable_error:
            failure = (
                f"{retryable_error} 自动重试次数已用尽，"
                "请检查模型服务后手动重试。"
            )
        artifact_id = job_payload.get("artifactId")
        action_id = job_payload.get("actionId") or job_action_id
        if artifact_id:
            artifact = TeachingArtifacts.query.filter_by(
                id=artifact_id,
                owner_id=job_owner_id,
            ).first()
            if artifact:
                artifact.status = "VALIDATION_FAILED"
        if action_id:
            action = TeachingAgentActions.query.filter_by(id=action_id).first()
            if action:
                action.status = "FAILED"
                action.error = _safe_error(failure)
                action.completed = datetime.datetime.utcnow()
        db.session.commit()
        raise PermanentJobError(failure)
    if not legacy.draft_id:
        raise PermanentJobError(
            "题目验证流程已结束，但草稿结果没有成功保存；任务不会被标记为完成。"
        )

    artifact_id = job_payload.get("artifactId")
    action_id = job_payload.get("actionId") or job_action_id
    draft = LearningDrafts.query.filter_by(id=legacy.draft_id).first()
    draft_spec = draft.spec if draft and isinstance(draft.spec, dict) else {}
    draft_title = str(
        draft_spec.get("name")
        or job_payload.get("title")
        or legacy.title
        or "CTF 实践题"
    )[:240]
    draft_summary = str(
        draft_spec.get("description")
        or (draft.brief if draft else "")
        or "题目草稿已生成并通过可用性检查。"
    )[:500]
    if artifact_id:
        artifact = TeachingArtifacts.query.filter_by(
            id=artifact_id,
            owner_id=job_owner_id,
        ).first()
        if artifact:
            revision = TeachingArtifactRevisions.query.filter_by(
                artifact_id=artifact.id,
                revision=artifact.current_revision,
            ).first()
            validation = {
                "status": "PASS",
                "nativeDraftId": legacy.draft_id,
                "legacyJobId": legacy.id,
                "validatedAt": datetime.datetime.utcnow().isoformat() + "Z",
            }
            if revision:
                revision.validation = validation
            artifact.status = "READY_TO_PUBLISH"
        if action_id:
            action = TeachingAgentActions.query.filter_by(id=action_id).first()
            if action:
                action.status = "AWAITING_APPROVAL"
                action.result = {
                    **(action.result or {}),
                    "draftId": legacy.draft_id,
                    "legacyJobId": legacy.id,
                    "validation": "PASS",
                }
    elif action_id:
        action = TeachingAgentActions.query.filter_by(id=action_id).first()
        if action:
            action.status = "SUCCEEDED"
            action.result = {
                **(action.result or {}),
                "draftId": legacy.draft_id,
                "legacyJobId": legacy.id,
                "validation": "PASS",
                "title": draft_title,
            }
            action.error = None
            action.completed = datetime.datetime.utcnow()
    return {
        "legacyJobId": legacy.id,
        "draftId": legacy.draft_id,
        "status": legacy.status,
        "title": draft_title,
        "summary": draft_summary,
        "validation": "PASS",
    }


def _native_authoring_batch_outcome(statuses):
    normalized = [str(status or "").upper() for status in statuses]
    terminal = {"SUCCEEDED", "FAILED", "CANCELED"}
    if not normalized or not all(status in terminal for status in normalized):
        return "PENDING", "RUNNING"
    succeeded = sum(status == "SUCCEEDED" for status in normalized)
    failed = sum(status == "FAILED" for status in normalized)
    canceled = sum(status == "CANCELED" for status in normalized)
    if succeeded:
        return "SUCCEEDED", "PARTIAL" if failed or canceled else "SUCCEEDED"
    return "FAILED", "FAILED"


def _sync_native_authoring_batch_action(job):
    """Aggregate a multi-CTF action without letting the last child win.

    Every native authoring job remains independently retryable and visible.
    The shared action becomes terminal only after every child is terminal, so
    a late success cannot hide a failed sibling (or vice versa).
    """

    if job.kind != "learning.authoring" or not job.action_id:
        return
    action = TeachingAgentActions.query.filter_by(id=job.action_id).first()
    if action is None:
        return
    action_result = dict(action.result or {})
    raw_ids = action_result.get("formalJobIds")
    if not isinstance(raw_ids, list) or len(raw_ids) <= 1:
        return
    job_ids = [str(item) for item in raw_ids if str(item or "").strip()]
    rows = TeachingJobs.query.filter(TeachingJobs.id.in_(job_ids)).all()
    rows_by_id = {row.id: row for row in rows}
    if len(rows_by_id) != len(job_ids):
        action.status = "PENDING"
        action.completed = None
        return
    terminal = {"SUCCEEDED", "FAILED", "CANCELED"}
    statuses = [str(rows_by_id[job_id].status or "").upper() for job_id in job_ids]
    action_status, batch_status = _native_authoring_batch_outcome(statuses)
    outcomes = []
    for job_id in job_ids:
        child = rows_by_id[job_id]
        child_result = child.result if isinstance(child.result, dict) else {}
        child_payload = child.payload if isinstance(child.payload, dict) else {}
        legacy_job_id = child_result.get("legacyJobId") or child_payload.get(
            "legacyJobId"
        )
        draft_id = _native_authoring_draft_id(child, child_result)
        result_target = _job_result_target(
            child,
            {**child_result, "draftId": draft_id},
        )
        outcomes.append(
            {
                "jobId": child.id,
                "status": child.status,
                "draftId": draft_id,
                "title": (
                    child_result.get("title")
                    or child_payload.get("title")
                    or child_payload.get("batchTopic")
                    or "题目草稿"
                ),
                "batchId": child_payload.get("batchId"),
                "batchIndex": child_payload.get("batchIndex"),
                "batchCount": child_payload.get("batchCount"),
                "batchTopic": child_payload.get("batchTopic"),
                "manageUrl": (
                    result_target.get("href")
                    if result_target.get("kind") == "link"
                    else None
                ),
                "legacyJobId": legacy_job_id,
                "validation": child_result.get("validation"),
                "error": _job_failure_message(child),
            }
        )
    batch = TeachingGenerationBatches.query.filter_by(action_id=action.id).first()
    if batch is None:
        batch_id = str((job.payload or {}).get("batchId") or "").strip()
        if batch_id:
            batch = TeachingGenerationBatches.query.filter_by(
                id=batch_id,
                owner_id=job.owner_id,
            ).first()
    batch_items = {item.task_id: item for item in (batch.items if batch else [])}
    now = datetime.datetime.utcnow()
    for outcome in outcomes:
        batch_item = batch_items.get(outcome["jobId"])
        if batch_item is None:
            continue
        child = rows_by_id[outcome["jobId"]]
        child_status = str(child.status or "QUEUED").upper()
        child_stage = str(child.stage or "queued").lower()
        if child_status == "SUCCEEDED":
            item_status = "NEEDS_REVIEW"
        elif child_status == "FAILED":
            item_status = "FAILED"
        elif child_status == "CANCELED":
            item_status = "CANCELED"
        elif "valid" in child_stage or "review" in child_stage or "build" in child_stage:
            item_status = "VALIDATING"
        elif child_status == "RUNNING":
            item_status = "GENERATING"
        else:
            item_status = "QUEUED"
        batch_item.status = item_status
        batch_item.draft_id = outcome.get("draftId") or batch_item.draft_id
        batch_item.validation = scrub_payload(outcome.get("validation") or {})
        batch_item.error = outcome.get("error")
        batch_item.updated = now
        batch_item.completed = child.completed if child_status in terminal else None

    created_count = sum(bool(row.get("draftId")) for row in outcomes)
    validated_count = sum(
        row["status"] == "SUCCEEDED" and bool(row.get("draftId"))
        for row in outcomes
    )
    failed_count = sum(row["status"] in {"FAILED", "CANCELED"} for row in outcomes)
    if batch is not None:
        batch.counts = {
            "requested": batch.requested_count,
            "created": created_count,
            "validated": validated_count,
            "failed": failed_count,
        }
        if all(status in terminal for status in statuses):
            if validated_count == batch.requested_count:
                batch.status = "NEEDS_REVIEW"
            elif created_count or validated_count:
                batch.status = "PARTIAL_SUCCESS"
            elif all(status == "CANCELED" for status in statuses):
                batch.status = "CANCELED"
                batch.canceled = now
            else:
                batch.status = "FAILED"
            batch.completed = max(
                (
                    rows_by_id[job_id].completed
                    for job_id in job_ids
                    if rows_by_id[job_id].completed
                ),
                default=now,
            )
        elif any(status == "RUNNING" for status in statuses):
            batch.status = (
                "VALIDATING"
                if any(
                    "valid" in str(rows_by_id[job_id].stage or "").lower()
                    or "build" in str(rows_by_id[job_id].stage or "").lower()
                    for job_id in job_ids
                )
                else "GENERATING"
            )
            batch.completed = None
        else:
            batch.status = "QUEUED"
            batch.completed = None
        batch.updated = now
    action.result = {
        **action_result,
        "batchResults": outcomes,
        "draftIds": [
            row["draftId"] for row in outcomes if row.get("draftId")
        ],
        "completedCount": sum(status in terminal for status in statuses),
        "requestedCount": len(job_ids),
        "createdCount": created_count,
        "validatedCount": validated_count,
        "succeededCount": sum(status == "SUCCEEDED" for status in statuses),
        "failedCount": failed_count,
        "canceledCount": sum(status == "CANCELED" for status in statuses),
        "batchStatus": batch_status,
        "taskStatus": (
            str(batch.status or "").lower()
            if batch is not None
            else "partial_success"
            if batch_status == "PARTIAL"
            else "needs_review"
            if batch_status == "SUCCEEDED"
            else "failed"
            if batch_status == "FAILED"
            else "generating"
        ),
    }
    if action_status == "PENDING":
        action.status = "PENDING"
        action.error = None
        action.completed = None
        return
    failed = [row for row in outcomes if row["status"] in {"FAILED", "CANCELED"}]
    action.status = action_status
    if action_status == "FAILED":
        action.status = "FAILED"
        action.error = f"批次中有 {len(failed)} 项未完成构建或可用性验证。"
    else:
        action.error = None
    action.completed = max(
        (rows_by_id[job_id].completed for job_id in job_ids if rows_by_id[job_id].completed),
        default=datetime.datetime.utcnow(),
    )


def _job_cancellation_requested(job):
    return bool(
        job is not None
        and (
            str(job.status or "").upper() in {"CANCEL_REQUESTED", "CANCELED"}
            or job.canceled is not None
        )
    )


def _native_outer_job_is_active(job):
    """Whether a native runner still has a durable outer task to serve.

    Native authoring can spend several minutes in a bounded model/validation
    phase. During that time a course or its disposable owner may be deleted.
    Continuing to generate for a now-cascaded outer task would hold the sole
    authoring consumer and starve later valid jobs. The progress callback is
    the safe checkpoint where the runner can observe that condition.
    """

    return bool(
        job is not None
        and str(getattr(job, "status", "") or "").upper() == "RUNNING"
        and getattr(job, "canceled", None) is None
    )


def _finalize_canceled_job(job, message):
    now = datetime.datetime.utcnow()
    job.status = "CANCELED"
    job.stage = "canceled"
    job.completed = now
    job.updated = now
    job.error = None
    job.lease_owner = None
    job.lease_expires = None
    _set_material_job_state(job, "CANCELED")
    _cancel_native_authoring_compatibility_job(job)
    append_job_event(job, "canceled", "CANCELED", message)
    for card in ConversationCards.query.filter_by(
        object_type="job", object_id=job.id
    ).all():
        card.state = {
            **(card.state or {}),
            "status": "CANCELED",
            "stage": "canceled",
            "progress": job.progress,
            "error": None,
            "failureMessage": None,
        }
        card.actions = ["open", "retry"]
    _sync_candidate_generation_card(job)
    _sync_parent_generation_state(job)
    _sync_agent_message_status(job)
    _sync_native_authoring_batch_action(job)


def process_job(job_id, *, worker_id=None):
    worker_id = worker_id or _new_worker_id()
    job = _acquire_job(job_id, worker_id)
    if job is None:
        return False
    route = None
    try:
        if job.kind in {"learning.authoring", "learning.solution"}:
            job = heartbeat(
                job,
                stage="native-authoring",
                progress=20,
                message=(
                    "构建 CTF 实践题并执行独立验证"
                    if job.kind == "learning.authoring"
                    else "执行玄甲隔离环境解题验证"
                ),
            )
            compact_result = _execute_local_job(job)
        else:
            runtime_payload = _runtime_payload(job)
            route = route_model(
                job.kind,
                prompt=str(
                    runtime_payload.get("prompt")
                    or runtime_payload.get("instruction")
                    or ""
                ),
                payload=runtime_payload,
                allow_degraded=bool(runtime_payload.get("allowDegraded")),
            )
            checkpoint = (
                (job.result or {}).get("_generationCheckpoint")
                if isinstance(job.result, dict)
                else None
            )
            if (
                isinstance(checkpoint, dict)
                and checkpoint.get("requestHash") == route["request_hash"]
                and isinstance(checkpoint.get("result"), dict)
                and isinstance(checkpoint.get("model"), dict)
            ):
                response = {
                    "result": checkpoint["result"],
                    "model": checkpoint["model"],
                }
                job = heartbeat(
                    job,
                    stage="persisting",
                    progress=70,
                    message="恢复已完成的模型生成检查点",
                )
            else:
                job = heartbeat(
                    job,
                    stage="planning" if job.kind == "agent.chat" else "generating",
                    progress=20,
                    message=(
                        "模型正在理解原始指令并从技能目录选择所需能力"
                        if job.kind == "agent.chat"
                        else "正在生成教学内容"
                    ),
                )
                started = time.monotonic()
                response = _invoke_agent_runtime(job, route, runtime_payload)
                model_meta = response.get("model") or {}
                model_meta.setdefault(
                    "latencyMs", int((time.monotonic() - started) * 1000)
                )
                _record_invocation(job, route, model_meta, status="SUCCEEDED")
                checkpoint_job = (
                    TeachingJobs.query.filter_by(id=job.id).with_for_update().first()
                )
                checkpoint_job.result = {
                    "_generationCheckpoint": {
                        "requestHash": route["request_hash"],
                        "result": response["result"],
                        "model": model_meta,
                    }
                }
                db.session.commit()

            job = heartbeat(
                job,
                stage="delivering" if job.kind == "agent.chat" else "persisting",
                progress=85,
                message=(
                    "正在核验回答、执行文件渲染并持久化可下载结果"
                    if job.kind == "agent.chat"
                    else "保存候选与 revision"
                ),
            )
            compact_result = _persist_result(job, response["result"])
        job = TeachingJobs.query.filter_by(id=job_id).first()
        if job.status == "CANCEL_REQUESTED":
            raise JobCanceled("Task canceled before persistence completion")
        now = datetime.datetime.utcnow()
        job.result = compact_result
        job.status = "SUCCEEDED"
        job.stage = "complete"
        job.progress = 100
        job.completed = now
        job.updated = now
        job.lease_owner = None
        job.lease_expires = None
        presented = job_view(job)
        for card in ConversationCards.query.filter_by(
            object_type="job", object_id=job.id
        ).all():
            card.state = {
                **(card.state or {}),
                "status": presented["status"],
                "stage": presented["stage"],
                "progress": presented["progress"],
                "result": presented["result"],
                "resultTarget": presented["resultTarget"],
                "title": (
                    (presented["result"] or {}).get("title")
                    or (card.state or {}).get("title")
                ),
                "failureMessage": presented["failureMessage"],
            }
            card.actions = (
                ["open", "result"] if presented["status"] == "SUCCEEDED" else ["open"]
            )
        _sync_candidate_generation_card(job, presented)
        _sync_parent_generation_state(job)
        _sync_agent_message_status(job)
        _sync_native_authoring_batch_action(job)
        append_job_event(job, "complete", "SUCCEEDED", "任务完成", compact_result)
        db.session.commit()
        publish_pending_outbox()
        return True
    except JobCanceled as exc:
        db.session.rollback()
        job = TeachingJobs.query.filter_by(id=job_id).first()
        if job is None:
            return True
        _finalize_canceled_job(job, _safe_error(exc))
        db.session.commit()
        publish_pending_outbox()
        return True
    except Exception as exc:
        db.session.rollback()
        job = TeachingJobs.query.filter_by(id=job_id).first()
        if job is None:
            logger.info(
                "Teaching job %s was removed while executing; no terminal state remains to update",
                job_id,
            )
            return True
        if _job_cancellation_requested(job):
            _finalize_canceled_job(job, "任务已取消；忽略取消期间产生的执行异常")
            db.session.commit()
            publish_pending_outbox()
            return True
        permanent = isinstance(exc, (PermanentJobError, ValueError))
        retry = (
            not permanent and job.attempt_count < job.max_attempts and not job.canceled
        )
        job.error = _safe_error(exc, limit=16000)
        job.lease_owner = None
        job.lease_expires = None
        job.updated = datetime.datetime.utcnow()
        if retry:
            job.status = "QUEUED"
            job.stage = "retrying"
            append_job_event(
                job,
                "retrying",
                "QUEUED",
                "执行失败，等待幂等重试",
                {
                    "error": job.error,
                    "retryable": isinstance(exc, RetryableJobError),
                },
            )
            outbox = TeachingJobOutbox.query.filter_by(job_id=job.id).first()
            if outbox:
                outbox.published = None
                outbox.last_error = job.error
            for card in ConversationCards.query.filter_by(
                object_type="job", object_id=job.id
            ).all():
                card.state = {
                    **(card.state or {}),
                    "status": "QUEUED",
                    "stage": "retrying",
                    "progress": job.progress,
                    "error": None,
                    "failureMessage": None,
                }
                card.actions = ["open", "cancel"]
        else:
            job.status = "FAILED"
            job.stage = "failed"
            job.completed = datetime.datetime.utcnow()
            _set_material_job_state(job, "FAILED")
            _persist_agent_failure_message(job)
            append_job_event(job, "failed", "FAILED", "任务失败", {"error": job.error})
            candidate_set_id = job.payload.get("candidateSetId")
            if candidate_set_id:
                candidate_set = TeachingCandidateSets.query.filter_by(
                    id=candidate_set_id, owner_id=job.owner_id
                ).first()
                if candidate_set:
                    candidate_set.status = "FAILED"
            for card in ConversationCards.query.filter_by(
                object_type="job", object_id=job.id
            ).all():
                card.state = {
                    **(card.state or {}),
                    "status": "FAILED",
                    "stage": "failed",
                    "progress": job.progress,
                    "error": _job_failure_message(job),
                    "failureMessage": _job_failure_message(job),
                }
                card.actions = ["open", "retry"]
        _sync_candidate_generation_card(job)
        _sync_parent_generation_state(job)
        _sync_agent_message_status(job)
        _sync_native_authoring_batch_action(job)
        if route is not None:
            try:
                _record_invocation(job, route, {}, status="FAILED", error=exc)
            except Exception:
                logger.debug("Could not record failed model invocation", exc_info=True)
        db.session.commit()
        if retry:
            publish_pending_outbox(job_id=job.id)
        else:
            publish_pending_outbox()
        logger.exception("Teaching job %s failed", job_id)
        return True


def recover_expired_jobs(client=None):
    now = datetime.datetime.utcnow()
    stale_after = now - datetime.timedelta(seconds=WORKER_LIVENESS_TTL_SECONDS)
    query = TeachingJobs.query.filter(
        TeachingJobs.status == "RUNNING",
        TeachingJobs.lease_expires.isnot(None),
    )
    if client is None:
        query = query.filter(TeachingJobs.lease_expires < now)
    else:
        # A stopped worker can leave a long native-authoring lease behind.
        # Check only expired leases and jobs whose durable heartbeat is old;
        # fresh jobs are owned by a worker that has not had time to announce
        # its liveness yet.
        query = query.filter(
            (TeachingJobs.lease_expires < now)
            | (TeachingJobs.heartbeat.isnot(None) & (TeachingJobs.heartbeat < stale_after))
        )
    jobs = query.with_for_update(skip_locked=True).all()
    recovered = []
    for job in jobs:
        recovery_reason = _running_job_recovery_reason(
            job,
            now=now,
            owner_alive=_worker_liveness_state(client, job.lease_owner),
        )
        if recovery_reason is None:
            continue
        recovery_message = (
            "执行该任务的 Worker 已失活，任务已恢复"
            if recovery_reason == "worker-offline"
            else "租约过期，任务已恢复"
        )
        if job.attempt_count >= job.max_attempts:
            job.status = "FAILED"
            job.stage = "failed"
            job.error = (
                "Worker stopped before completing the task and the automatic retry "
                "limit was reached"
                if recovery_reason == "worker-offline"
                else "Worker lease expired and the automatic retry limit was reached"
            )
            job.completed = now
            job.updated = now
            job.lease_owner = None
            job.lease_expires = None
            _set_material_job_state(job, "FAILED")
            _persist_agent_failure_message(job)
            append_job_event(
                job,
                "failed",
                "FAILED",
                (
                    "执行该任务的 Worker 已失活，自动恢复次数已耗尽"
                    if recovery_reason == "worker-offline"
                    else "Worker 租约反复过期，自动恢复次数已耗尽"
                ),
                {
                    "attemptCount": job.attempt_count,
                    "maxAttempts": job.max_attempts,
                    "recoveryReason": recovery_reason,
                },
            )
            candidate_set_id = (job.payload or {}).get("candidateSetId")
            if candidate_set_id:
                candidate_set = TeachingCandidateSets.query.filter_by(
                    id=candidate_set_id,
                    owner_id=job.owner_id,
                ).first()
                if candidate_set:
                    candidate_set.status = "FAILED"
            if job.action_id:
                action = TeachingAgentActions.query.filter_by(
                    id=job.action_id,
                    actor_id=job.owner_id,
                ).first()
                if action:
                    action.status = "FAILED"
                    action.error = job.error
                    action.completed = now
            for card in ConversationCards.query.filter_by(
                object_type="job",
                object_id=job.id,
            ).all():
                card.state = {
                    **(card.state or {}),
                    "status": "FAILED",
                    "stage": "failed",
                    "progress": job.progress,
                    "error": _job_failure_message(job),
                    "failureMessage": _job_failure_message(job),
                }
                card.actions = ["open", "retry"]
            _sync_candidate_generation_card(job)
            _sync_parent_generation_state(job)
            continue
        job.status = "QUEUED"
        job.stage = "recovering"
        job.lease_owner = None
        job.lease_expires = None
        job.updated = now
        append_job_event(
            job,
            "recovering",
            "QUEUED",
            recovery_message,
            {"recoveryReason": recovery_reason},
        )
        outbox = TeachingJobOutbox.query.filter_by(job_id=job.id).first()
        if outbox:
            outbox.published = None
        _sync_candidate_generation_card(job)
        _sync_parent_generation_state(job)
        recovered.append(job)
    db.session.commit()
    if recovered:
        publish_pending_outbox()
    return len(recovered)


def recover_unleased_queued_jobs():
    """Republish jobs that may have been read from Redis before lease acquisition."""
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=2)
    rows = (
        TeachingJobs.query.join(
            TeachingJobOutbox, TeachingJobOutbox.job_id == TeachingJobs.id
        )
        .filter(
            TeachingJobs.status == "QUEUED",
            TeachingJobs.updated < cutoff,
            TeachingJobOutbox.published.isnot(None),
        )
        .limit(100)
        .with_for_update(skip_locked=True)
        .all()
    )
    for job in rows:
        outbox = TeachingJobOutbox.query.filter_by(job_id=job.id).first()
        outbox.published = None
        append_job_event(job, "recovering", "QUEUED", "队列消息超时，重新投递")
        job.updated = datetime.datetime.utcnow()
    db.session.commit()
    if rows:
        publish_pending_outbox()
    return len(rows)


def ensure_group(client, stream=STREAM):
    try:
        client.xgroup_create(stream, GROUP, id="0", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def _reroute_queued_job_message(client, source_stream, payload):
    """Move legacy heavy messages onto the dedicated authoring stream.

    Jobs published before the stream split remain in ``teaching:jobs``.  A
    general worker can safely move only *queued* messages: running jobs retain
    their existing lease and are merely acknowledged by a competing consumer.
    ``XADD`` happens before the old message is acknowledged, so an interruption
    can at worst create a harmless duplicate that ``_acquire_job`` rejects.
    """

    job_id = str((payload or {}).get("job_id") or "").strip()
    if not job_id:
        return False
    job = TeachingJobs.query.filter_by(id=job_id).first()
    if (
        job is None
        or str(job.status or "").upper() != "QUEUED"
        or source_stream == _stream_for_job(job)
    ):
        return False
    client.xadd(
        _stream_for_job(job),
        {"data": json.dumps(payload)},
        maxlen=100000,
    )
    logger.info(
        "Rerouted queued teaching job %s kind=%s from %s to %s",
        job.id,
        job.kind,
        source_stream,
        _stream_for_job(job),
    )
    return True


def _consume_stream_message(client, stream, message_id, values, worker_id):
    """Execute one stream entry or hand an old heavy entry to its own pool."""

    payload = json.loads(values["data"])
    set_background_trace_context(payload.get("trace_id"))
    try:
        rerouted = _reroute_queued_job_message(client, stream, payload)
        if not rerouted:
            process_job(payload["job_id"], worker_id=worker_id)
        client.xack(stream, GROUP, message_id)
        client.xdel(stream, message_id)
    finally:
        clear_background_trace_context()


def consume_jobs(*, stream=STREAM, stop_requested=lambda: False, block_ms=5000):
    client = _redis()
    ensure_group(client, stream)
    worker_id = _new_worker_id()
    liveness_stop, liveness_thread = _start_worker_liveness_heartbeat(
        client,
        worker_id,
    )
    last_sweep = 0.0
    try:
        while not stop_requested():
            now = time.monotonic()
            if now - last_sweep >= 30:
                recover_expired_jobs(client=client)
                recover_unleased_queued_jobs()
                publish_pending_outbox()
                last_sweep = now
            try:
                claimed = client.xautoclaim(
                    stream,
                    GROUP,
                    worker_id,
                    min_idle_time=60000,
                    start_id="0-0",
                    count=5,
                )
                claimed_entries = claimed[1] if len(claimed) > 1 else []
            except (redis.ResponseError, AttributeError):
                claimed_entries = []
            for message_id, values in claimed_entries:
                try:
                    _consume_stream_message(client, stream, message_id, values, worker_id)
                except Exception:
                    logger.exception(
                        "Unable to reclaim teaching job message %s", message_id
                    )
                finally:
                    clear_background_trace_context()
            messages = client.xreadgroup(
                GROUP,
                worker_id,
                {stream: ">"},
                count=5,
                block=block_ms,
            )
            for _, entries in messages:
                for message_id, values in entries:
                    try:
                        _consume_stream_message(client, stream, message_id, values, worker_id)
                    except Exception:
                        logger.exception(
                            "Unable to consume teaching job message %s", message_id
                        )
                    finally:
                        clear_background_trace_context()
    finally:
        liveness_stop.set()
        liveness_thread.join(timeout=1)
        _clear_worker_liveness(client, worker_id)

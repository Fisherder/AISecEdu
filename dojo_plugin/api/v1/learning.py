import copy
import datetime
import logging
import re
import uuid
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit

from flask import abort, current_app, request
from flask_restx import Namespace, Resource
from sqlalchemy import func
from sqlalchemy.orm import selectinload

from CTFd.cache import clear_challenges, clear_standings
from CTFd.models import Solves, Submissions, Users, db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ...agent_runtime.scope import ScopeError

from ...learning.assessment import (
    assess_attempt,
    assessment_view,
    build_recommendations,
    rebuild_skill_states,
    skill_states,
)
from ...learning.authoring import (
    DraftPublishBusy,
    autonomously_validate_draft,
    catalog_item_view,
    create_draft,
    create_manual_draft,
    delete_draft,
    delete_published_challenge,
    draft_student_preview_view,
    draft_view,
    publish_draft,
    remove_generated_package_assets,
    revise_draft,
)
from ...learning.evidence import (
    ALLOWED_WORKSPACE_EVENTS,
    active_attempt,
    append_evidence,
    event_view,
    save_reflection,
    verify_evidence_chain,
)
from ...learning.exercise_modes import (
    exercise_mode,
    is_retired_exercise,
    is_supported_exercise,
)
from ...learning.context import guide_reference_catalog, learning_profile_context
from ...learning.standards import ABILITY_LABELS
from ...learning.student_experience import (
    activity_state,
    assessment_state,
    evidence_state,
    error_contract,
    mastery_state,
    progress_contract,
    sanitize_telemetry,
    student_ux_rollout,
)
from ...learning.intelligence import (
    GuideReferenceSelectionError,
    guide_reply,
    guide_thread_view,
    new_guide_thread,
    tutor_reply,
)
from ...learning.student_agent import (
    execute_student_tools,
    forget_memory,
    memory_view,
    resolve_tool_calls,
    student_agent_snapshot,
    student_resource_url_key,
)
from ...learning.solution_agent import (
    enqueue_solution_run,
    latest_solution_run,
    solution_run_view,
)
from ...models import (
    DojoAdmins,
    DojoChallengeVisibilities,
    DojoChallenges,
    DojoModules,
    DojoUsers,
    Dojos,
    LearningAppeals,
    LearningAssessments,
    LearningAttempts,
    LearningAuthoringJobs,
    LearningAuditEvents,
    LearningChallengeProfiles,
    LearningDrafts,
    LearningEvidenceEvents,
    LearningGuideThreads,
    LearningGuideMessages,
    LearningRecommendations,
    LearningSimulationRuns,
    LearningSkillStates,
    LearningSolutionRuns,
    LearningTutorMessages,
    SelfLearningWorkspaces,
    TeachingArtifacts,
    TeachingAssignments,
    TeachingAssignmentSubmissions,
)
from ...coursework import assignment_view
from ...utils import get_all_containers
from ...utils.dojo import dojo_admins_only, dojo_route, get_current_dojo_challenge
from ...utils.image_pulls import publish_image_pull
from .user import authed_only_cli


learning_namespace = Namespace("learning", description="玄甲 course learning services")
UNIT_ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")
logger = logging.getLogger(__name__)
AUTHORING_JOB_STEPS = (
    ("catalog", "检索可复用题目"),
    ("strategy", "Agent 自动选择出题策略"),
    ("plan", "Flash 生成教学方案"),
    ("build", "Pro 构建题目与私有解法"),
    ("review", "Pro 独立红队审查"),
    ("preflight-repair", "预审修复与独立复验"),
    ("draft", "建立可验证草稿"),
    ("validate-1", "第 1 轮独立验证"),
    ("ready", "保存已通过草稿"),
)


class AuthoringJobCanceled(Exception):
    """Stop a native authoring pipeline at its next durable checkpoint."""


class CatalogOrderError(ValueError):
    """Reject an unsafe or stale course-question ordering request."""

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def _generated_unit_id(dojo, name):
    existing_ids = {str(module.id) for module in dojo.modules}
    base = re.sub(r"[^a-z0-9]+", "-", str(name or "").lower()).strip("-")
    base = base[:32].rstrip("-") or f"chapter-{len(existing_ids) + 1}"
    candidate = base
    suffix = 2
    while candidate in existing_ids:
        marker = f"-{suffix}"
        candidate = f"{base[:32 - len(marker)].rstrip('-')}{marker}"
        suffix += 1
    return candidate


def _dojo_challenge_for_attempt(attempt):
    challenge = DojoChallenges.query.filter_by(
        dojo_id=attempt.dojo_id,
        module_index=attempt.module_index,
        challenge_index=attempt.challenge_index,
    ).first()
    return challenge if challenge and is_supported_exercise(challenge) else None


def _can_access_attempt(attempt, user):
    challenge = _dojo_challenge_for_attempt(attempt)
    return challenge is not None and (attempt.user_id == user.id or challenge.dojo.is_admin(user))


def _course_challenge(dojo, module_id, challenge_id):
    return next(
        (
            challenge
            for module in dojo.modules
            if module.id == module_id
            for challenge in module.challenges
            if challenge.id == challenge_id and is_supported_exercise(challenge)
        ),
        None,
    )


def _stop_deleted_challenge_workspaces(dojo, module_id, challenge_id):
    stopped = 0
    try:
        containers = get_all_containers(dojo)
    except Exception:
        logger.warning(
            "Unable to enumerate workspaces while deleting %s/%s/%s",
            dojo.reference_id,
            module_id,
            challenge_id,
            exc_info=True,
        )
        return stopped
    for container in containers:
        labels = container.labels or {}
        if (
            labels.get("dojo.module_id") != module_id
            or labels.get("dojo.challenge_id") != challenge_id
        ):
            continue
        try:
            container.remove(force=True)
            stopped += 1
        except Exception:
            logger.warning(
                "Unable to stop workspace %s for deleted challenge",
                getattr(container, "id", "unknown"),
                exc_info=True,
            )
    return stopped


def _catalog_order_plan(modules, challenges, body):
    """Validate a complete visible-question layout and assign safe DB positions.

    The browser sends the current composite location of every supported question.
    Those locations, rather than the shared CTF challenge id, distinguish the same
    imported challenge when it appears in more than one chapter.
    """

    if not isinstance(body, dict) or not isinstance(body.get("modules"), list):
        raise CatalogOrderError("题目顺序数据格式不正确。")
    requested_modules = body["modules"]
    if len(requested_modules) > 200:
        raise CatalogOrderError("一次最多管理 200 个章节。")

    module_by_id = {str(module.id): module for module in modules}
    module_by_index = {int(module.module_index): module for module in modules}
    layout_by_id = {}
    for requested in requested_modules:
        if not isinstance(requested, dict):
            raise CatalogOrderError("章节顺序数据格式不正确。")
        module_id = str(requested.get("moduleId") or "").strip()
        items = requested.get("items")
        if module_id not in module_by_id or module_id in layout_by_id:
            raise CatalogOrderError("章节列表已变化，请刷新页面后再试。", 409)
        if not isinstance(items, list):
            raise CatalogOrderError("章节中的题目顺序数据格式不正确。")
        layout_by_id[module_id] = items

    if set(layout_by_id) != set(module_by_id):
        raise CatalogOrderError("章节列表已变化，请刷新页面后再试。", 409)

    supported = {
        (int(challenge.module_index), int(challenge.challenge_index)): challenge
        for challenge in challenges
        if is_supported_exercise(challenge)
    }
    if len(supported) > 1000:
        raise CatalogOrderError("一次最多管理 1,000 道题目。")

    requested_keys = []
    requested_by_module = {}
    for module_id, items in layout_by_id.items():
        keys = []
        for item in items:
            if not isinstance(item, dict):
                raise CatalogOrderError("题目顺序数据格式不正确。")
            try:
                key = (int(item["moduleIndex"]), int(item["challengeIndex"]))
            except (KeyError, TypeError, ValueError):
                raise CatalogOrderError("题目位置数据格式不正确。") from None
            keys.append(key)
            requested_keys.append(key)
        requested_by_module[module_id] = keys

    if len(requested_keys) != len(set(requested_keys)):
        raise CatalogOrderError("同一道题目不能重复出现。")
    if set(requested_keys) != set(supported):
        raise CatalogOrderError("题目列表已变化，请刷新页面后再试。", 409)

    unsupported_by_module = {
        int(module.module_index): [
            challenge
            for challenge in challenges
            if int(challenge.module_index) == int(module.module_index)
            and not is_supported_exercise(challenge)
        ]
        for module in modules
    }
    positions = []
    for module_id, source_keys in requested_by_module.items():
        target_module = module_by_id[module_id]
        target_index = int(target_module.module_index)
        reserved_indices = {
            int(challenge.challenge_index)
            for challenge in unsupported_by_module[target_index]
        }
        used_slugs = {
            str(challenge.id) for challenge in unsupported_by_module[target_index]
        }
        next_index = 0
        for source_key in source_keys:
            challenge = supported[source_key]
            slug = str(challenge.id)
            if slug in used_slugs:
                raise CatalogOrderError(
                    f"章节“{target_module.name or target_module.id}”中已有同标识题目“{slug}”，无法移动。",
                    409,
                )
            used_slugs.add(slug)
            while next_index in reserved_indices:
                next_index += 1
            positions.append(
                {
                    "challenge": challenge,
                    "source": source_key,
                    "sourceModule": module_by_index[source_key[0]],
                    "targetModule": target_module,
                    "target": (target_index, next_index),
                }
            )
            next_index += 1

    return {
        "positions": positions,
        "changed": [item for item in positions if item["source"] != item["target"]],
    }


def _catalog_order_busy_reason(dojo, plan):
    for item in plan["changed"]:
        challenge = item["challenge"]
        active_solution = LearningSolutionRuns.query.filter(
            LearningSolutionRuns.dojo_id == dojo.dojo_id,
            LearningSolutionRuns.module_index == item["source"][0],
            LearningSolutionRuns.challenge_index == item["source"][1],
            LearningSolutionRuns.status.in_(("QUEUED", "RUNNING")),
        ).first()
        if active_solution:
            return f"题目“{challenge.name or challenge.id}”正在生成解题验证，暂不能调整顺序。"

    cross_module = [
        item
        for item in plan["changed"]
        if item["source"][0] != item["target"][0]
    ]
    if not cross_module:
        return None

    for item in cross_module:
        challenge = item["challenge"]
        draft_ids = [
            row.id
            for row in LearningDrafts.query.filter_by(
                dojo_id=dojo.dojo_id,
                module_index=item["source"][0],
                published_challenge_id=challenge.challenge_id,
            ).all()
        ]
        if draft_ids and LearningAuthoringJobs.query.filter(
            LearningAuthoringJobs.draft_id.in_(draft_ids),
            LearningAuthoringJobs.status.in_(("QUEUED", "RUNNING")),
        ).first():
            return f"题目“{challenge.name or challenge.id}”正在生成或修订，暂不能移动章节。"

    try:
        containers = get_all_containers(dojo)
    except Exception:
        logger.warning(
            "Unable to inspect active workspaces before reordering %s",
            dojo.reference_id,
            exc_info=True,
        )
        containers = []
    moving_references = {
        (str(item["sourceModule"].id), str(item["challenge"].id)):
        item["challenge"].name or item["challenge"].id
        for item in cross_module
    }
    for container in containers:
        labels = container.labels or {}
        name = moving_references.get(
            (labels.get("dojo.module_id"), labels.get("dojo.challenge_id"))
        )
        if name:
            return f"题目“{name}”仍有学员工作区在运行，停止作答后才能移动章节。"
    return None


def _relocate_catalog_child(table, dojo_id, source, target):
    db.session.execute(
        table.update()
        .where(table.c.dojo_id == dojo_id)
        .where(table.c.module_index == source[0])
        .where(table.c.challenge_index == source[1])
        .values(module_index=target[0], challenge_index=target[1])
    )


def _apply_catalog_order(dojo, plan):
    """Move changed composite-PK rows without relying on schema migrations.

    Learning attempts and visibility windows reference the three-part catalog key.
    A transaction-local module gives every child a valid parent throughout the
    move, so the operation remains atomic even with immediate foreign keys.
    """

    changed = plan["changed"]
    if not changed:
        return

    module_indices = [int(module.module_index) for module in dojo.modules]
    temp_module_index = max(module_indices or [-1]) + 1
    temp_module_id = f"order-{uuid.uuid4().hex[:12]}"
    module_table = DojoModules.__table__
    challenge_table = DojoChallenges.__table__
    db.session.execute(
        module_table.insert().values(
            dojo_id=dojo.dojo_id,
            module_index=temp_module_index,
            id=temp_module_id,
            name="题目排序临时章节",
            description=None,
            data={},
        )
    )

    records = []
    for ordinal, item in enumerate(changed):
        challenge = item["challenge"]
        data = copy.deepcopy(challenge.data or {})
        if (
            item["source"][0] != item["target"][0]
            and not data.get("path_override")
        ):
            data["path_override"] = str(challenge.path)
        record = {
            "dojo_id": dojo.dojo_id,
            "module_index": item["target"][0],
            "challenge_index": item["target"][1],
            "challenge_id": challenge.challenge_id,
            "id": challenge.id,
            "name": challenge.name,
            "description": challenge.description,
            "required": bool(challenge.required),
            "data": data,
        }
        temp_key = (temp_module_index, ordinal)
        records.append((item, record, temp_key))
        db.session.execute(
            challenge_table.insert().values(
                **{
                    **record,
                    "module_index": temp_key[0],
                    "challenge_index": temp_key[1],
                    "id": f"tmp-{ordinal}-{uuid.uuid4().hex[:8]}",
                }
            )
        )

    for item, _record, temp_key in records:
        _relocate_catalog_child(
            DojoChallengeVisibilities.__table__,
            dojo.dojo_id,
            item["source"],
            temp_key,
        )
        _relocate_catalog_child(
            LearningAttempts.__table__,
            dojo.dojo_id,
            item["source"],
            temp_key,
        )
        for table in (LearningSolutionRuns.__table__, LearningSimulationRuns.__table__):
            db.session.execute(
                table.update()
                .where(table.c.dojo_id == dojo.dojo_id)
                .where(table.c.module_index == item["source"][0])
                .where(table.c.challenge_index == item["source"][1])
                .where(table.c.challenge_id == item["challenge"].challenge_id)
                .values(
                    module_index=temp_key[0],
                    challenge_index=temp_key[1],
                )
            )

        if item["source"][0] != item["target"][0]:
            drafts = LearningDrafts.query.filter_by(
                dojo_id=dojo.dojo_id,
                module_index=item["source"][0],
                published_challenge_id=item["challenge"].challenge_id,
            ).all()
            draft_ids = [draft.id for draft in drafts]
            if draft_ids:
                db.session.execute(
                    LearningDrafts.__table__.update()
                    .where(LearningDrafts.__table__.c.id.in_(draft_ids))
                    .values(module_index=item["target"][0])
                )
                db.session.execute(
                    LearningAuthoringJobs.__table__.update()
                    .where(LearningAuthoringJobs.__table__.c.draft_id.in_(draft_ids))
                    .values(module_index=item["target"][0])
                )
            db.session.execute(
                TeachingArtifacts.__table__.update()
                .where(TeachingArtifacts.__table__.c.dojo_id == dojo.dojo_id)
                .where(TeachingArtifacts.__table__.c.module_index == item["source"][0])
                .where(
                    TeachingArtifacts.__table__.c.published_challenge_id
                    == item["challenge"].challenge_id
                )
                .values(module_index=item["target"][0])
            )

    for item, _record, _temp_key in records:
        db.session.execute(
            challenge_table.delete()
            .where(challenge_table.c.dojo_id == dojo.dojo_id)
            .where(challenge_table.c.module_index == item["source"][0])
            .where(challenge_table.c.challenge_index == item["source"][1])
        )
    db.session.execute(challenge_table.insert(), [record for _item, record, _temp in records])

    for item, _record, temp_key in records:
        _relocate_catalog_child(
            DojoChallengeVisibilities.__table__,
            dojo.dojo_id,
            temp_key,
            item["target"],
        )
        _relocate_catalog_child(
            LearningAttempts.__table__,
            dojo.dojo_id,
            temp_key,
            item["target"],
        )
        for table in (LearningSolutionRuns.__table__, LearningSimulationRuns.__table__):
            db.session.execute(
                table.update()
                .where(table.c.dojo_id == dojo.dojo_id)
                .where(table.c.module_index == temp_key[0])
                .where(table.c.challenge_index == temp_key[1])
                .where(table.c.challenge_id == item["challenge"].challenge_id)
                .values(
                    module_index=item["target"][0],
                    challenge_index=item["target"][1],
                )
            )
        db.session.execute(
            challenge_table.delete()
            .where(challenge_table.c.dojo_id == dojo.dojo_id)
            .where(challenge_table.c.module_index == temp_key[0])
            .where(challenge_table.c.challenge_index == temp_key[1])
        )
    db.session.execute(
        module_table.delete()
        .where(module_table.c.dojo_id == dojo.dojo_id)
        .where(module_table.c.module_index == temp_module_index)
    )


def _attempt_or_404(attempt_id):
    attempt = LearningAttempts.query.get_or_404(attempt_id)
    if not _can_access_attempt(attempt, get_current_user()):
        abort(403)
    return attempt


def _draft_or_404(draft_id):
    draft = LearningDrafts.query.get_or_404(draft_id)
    if draft.status == "DELETED" or is_retired_exercise(
        (draft.spec or {}).get("exerciseMode")
    ):
        abort(404)
    if not draft.dojo.is_admin(get_current_user()):
        abort(403)
    return draft


def _authoring_job_or_404(job_id):
    job = LearningAuthoringJobs.query.get_or_404(job_id)
    if not job.dojo.is_admin(get_current_user()):
        abort(403)
    if not _supported_authoring_job(job):
        abort(404)
    return job


def _supported_authoring_job(job):
    if job.draft is not None:
        return is_supported_exercise((job.draft.spec or {}).get("exerciseMode"))
    request_json = job.request_json if isinstance(job.request_json, dict) else {}
    constraints = request_json.get("constraints")
    constraints = constraints if isinstance(constraints, dict) else {}
    return is_supported_exercise(
        constraints.get("exerciseMode") or constraints.get("exercise_mode")
    )


def _container_authoring_constraints(value):
    constraints = dict(value) if isinstance(value, dict) else {}
    constraints["exerciseMode"] = "CONTAINER"
    constraints.pop("exercise_mode", None)
    constraints.pop("simulation", None)
    return constraints


def _authoring_batch_view(request_json):
    request_json = request_json if isinstance(request_json, dict) else {}
    constraints = request_json.get("constraints")
    if not isinstance(constraints, dict):
        constraints = {}
    raw_batch = request_json.get("batch")
    if not isinstance(raw_batch, dict):
        raw_batch = {}
    batch_id = str(raw_batch.get("id") or constraints.get("batchId") or "").strip()
    try:
        batch_index = int(raw_batch.get("index") or constraints.get("batchIndex") or 1)
    except (TypeError, ValueError):
        batch_index = 1
    try:
        batch_count = int(raw_batch.get("count") or constraints.get("batchCount") or 1)
    except (TypeError, ValueError):
        batch_count = 1
    batch_index = max(1, min(5, batch_index))
    batch_count = max(batch_index, min(5, max(1, batch_count)))
    batch_topic = str(constraints.get("batchTopic") or "").strip()
    if not batch_id:
        return None
    return {
        "id": batch_id,
        "index": batch_index,
        "count": batch_count,
        "topic": batch_topic or None,
    }


def _authoring_job_view(job):
    module = DojoModules.query.filter_by(
        dojo_id=job.dojo_id,
        module_index=job.module_index,
    ).first()
    return {
        "id": job.id,
        "dojoId": job.dojo.reference_id,
        "moduleId": module.id if module else None,
        "authorId": job.author_id,
        "draftId": job.draft_id,
        "kind": job.kind,
        "status": job.status,
        "stage": job.stage,
        "progress": max(0, min(100, int(job.progress or 0))),
        "title": job.title,
        "steps": job.steps or [],
        "error": job.error,
        "created": job.created.isoformat() + "Z",
        "updated": job.updated.isoformat() + "Z",
        "completed": job.completed.isoformat() + "Z" if job.completed else None,
        "batch": _authoring_batch_view(job.request_json),
    }


def _authoring_retryable_model_error(report, spec):
    """Return the first model fallback error that can benefit from a job retry."""

    errors = []

    def collect(value):
        if isinstance(value, dict):
            provider = str(value.get("provider") or "").upper()
            error = str(value.get("error") or "").strip()
            if provider == "MODEL_FALLBACK" and error and error not in errors:
                errors.append(error)
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(report)
    if isinstance(spec, dict):
        collect(spec.get("authoringPipeline") or {})
    if not errors:
        return None
    return "；".join(errors)[:2000]


def _update_authoring_job(
    job_id,
    *,
    stage,
    status,
    message,
    progress,
    label=None,
    details=None,
):
    job = LearningAuthoringJobs.query.get(job_id)
    if not job or job.status in {"COMPLETED", "FAILED", "CANCELED"}:
        return
    steps = [dict(item) for item in (job.steps or [])]
    target = None
    for step in steps:
        if step.get("id") != stage:
            continue
        target = step
        break
    if target is None:
        target = {
            "id": str(stage)[:80],
            "label": str(label or stage)[:240],
            "status": "PENDING",
            "message": "",
        }
        ready_index = next(
            (
                index
                for index, step in enumerate(steps)
                if step.get("id") == "ready"
            ),
            len(steps),
        )
        steps.insert(ready_index, target)
    if label:
        target["label"] = str(label)[:240]
    target["status"] = status
    target["message"] = str(message or "")[:1000]
    target["details"] = details if isinstance(details, dict) else {}
    target["updated"] = datetime.datetime.utcnow().isoformat() + "Z"
    job.status = "RUNNING"
    job.stage = stage
    job.progress = max(job.progress or 0, max(0, min(100, int(progress))))
    job.steps = steps
    db.session.commit()


def _run_authoring_job(app, job_id, progress_observer=None):
    with app.app_context():
        try:
            job = LearningAuthoringJobs.query.get(job_id)
            if not job or job.status != "QUEUED":
                return
            job.status = "RUNNING"
            job.stage = "catalog"
            job.progress = 1
            db.session.commit()

            dojo = job.dojo
            module = DojoModules.query.filter_by(
                dojo_id=job.dojo_id,
                module_index=job.module_index,
            ).one()
            author = Users.query.get(job.author_id)
            payload = dict(job.request_json or {})

            def progress_callback(**progress):
                _update_authoring_job(job_id, **progress)
                if progress_observer is not None:
                    try:
                        progress_observer(**progress)
                    except AuthoringJobCanceled:
                        raise
                    except Exception:
                        db.session.rollback()
                        logger.warning(
                            "Unable to report native authoring progress to durable worker",
                            exc_info=True,
                        )

            if job.kind in {"REVISE", "VALIDATE"}:
                draft = LearningDrafts.query.get(job.draft_id)
                if not draft:
                    raise ValueError("要处理的草稿不存在。")
                if job.kind == "REVISE":
                    revise_draft(
                        draft,
                        str(payload.get("message") or ""),
                        progress_callback=progress_callback,
                    )
            else:
                draft = create_draft(
                    dojo,
                    module,
                    author,
                    str(payload.get("brief") or ""),
                    level=payload.get("level"),
                    constraints=payload.get("constraints"),
                    progress_callback=progress_callback,
                )
            job = LearningAuthoringJobs.query.get(job_id)
            job.draft_id = draft.id
            db.session.commit()
            report = autonomously_validate_draft(
                draft,
                progress_callback=progress_callback,
            )
            blocked = int((report.get("summary") or {}).get("blocked") or 0)
            if report.get("status") != "PASS":
                retryable_model_error = _authoring_retryable_model_error(
                    report,
                    draft.spec,
                )
                if retryable_model_error:
                    _update_authoring_job(
                        job_id,
                        stage="ready",
                        status="RUNNING",
                        message=(
                            "模型服务在构建或复验期间暂时不可用，"
                            "持久任务队列将保留草稿并自动重试。"
                        ),
                        progress=98,
                        details={
                            "blocked": blocked,
                            "retryable": True,
                        },
                    )
                    raise RuntimeError(
                        "Transient authoring model failure: "
                        f"{retryable_model_error}"
                    )
                _update_authoring_job(
                    job_id,
                    stage="ready",
                    status="FAILED",
                    message=(
                        "自主验证已达到安全轮次上限，"
                        f"仍有 {blocked} 项发布门阻断。"
                    ),
                    progress=99,
                    details={
                        "blocked": blocked,
                        "rounds": len(
                            (report.get("autonomousLoop") or {}).get(
                                "rounds"
                            )
                            or []
                        ),
                    },
                )
                job = LearningAuthoringJobs.query.get(job_id)
                job.status = "FAILED"
                job.stage = "ready"
                job.progress = 99
                job.error = (
                    "Agent 已自主执行验证、修改和复验，但在安全轮次上限内"
                    f"仍有 {blocked} 项阻断。草稿和完整轮次记录已保留。"
                )
                job.completed = datetime.datetime.utcnow()
                db.session.commit()
                return
            _update_authoring_job(
                job_id,
                stage="ready",
                status="COMPLETED",
                message=(
                    "全部模型复核和确定性发布门已通过，草稿可由教师审阅并发布。"
                ),
                progress=100,
                details={
                    "rounds": len(
                        (report.get("autonomousLoop") or {}).get("rounds")
                        or []
                    ),
                    "warnings": int(
                        (report.get("summary") or {}).get("warnings") or 0
                    ),
                },
            )
            job = LearningAuthoringJobs.query.get(job_id)
            job.status = "COMPLETED"
            job.stage = "complete"
            job.progress = 100
            job.completed = datetime.datetime.utcnow()
            job.error = None
            db.session.commit()
        except Exception as exception:
            canceled = isinstance(exception, AuthoringJobCanceled)
            if canceled:
                logger.info("Background authoring job %s was canceled", job_id)
            else:
                logger.exception("Background authoring job %s failed", job_id)
            db.session.rollback()
            job = LearningAuthoringJobs.query.get(job_id)
            if job:
                steps = [dict(item) for item in (job.steps or [])]
                for step in steps:
                    if step.get("id") == job.stage or step.get("status") == "RUNNING":
                        step["status"] = "CANCELED" if canceled else "FAILED"
                        step["message"] = (
                            "任务已取消。"
                            if canceled
                            else "该阶段执行失败，已保留此前的完整进度。"
                        )
                        break
                job.steps = steps
                job.status = "CANCELED" if canceled else "FAILED"
                job.stage = "canceled" if canceled else job.stage
                job.error = None if canceled else str(exception)[:4000]
                job.completed = datetime.datetime.utcnow()
                if job.draft_id:
                    draft = LearningDrafts.query.get(job.draft_id)
                    if draft and draft.status == "BUILDING":
                        draft.status = "DRAFT"
                db.session.commit()
            if canceled:
                raise
            raise
        finally:
            db.session.remove()


def _queue_authoring_job(
    *,
    dojo,
    module,
    author,
    title,
    request_json,
    kind="CREATE",
    draft_id=None,
    durable_payload=None,
    action_id=None,
    thread_id=None,
    publish=True,
    commit=True,
):
    steps = [
        {
            "id": step_id,
            "label": label,
            "status": "PENDING",
            "message": "",
        }
        for step_id, label in AUTHORING_JOB_STEPS
    ]
    job = LearningAuthoringJobs(
        dojo_id=dojo.dojo_id,
        module_index=module.module_index,
        author_id=author.id,
        draft_id=draft_id,
        kind=kind,
        title=str(title or "题目生成")[:240],
        request_json=request_json,
        steps=steps,
    )
    db.session.add(job)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    try:
        # Keep the established authoring API and progress record, but execute
        # the expensive create/revise/validate pipeline in the durable
        # PostgreSQL + Redis Streams worker.  A web-process executor loses work
        # on reload and cannot be recovered after a crash.
        from ...agent_runtime.jobs import enqueue_job

        enqueue_job(
            owner_id=author.id,
            dojo_id=dojo.dojo_id,
            module_index=module.module_index,
            kind="learning.authoring",
            idempotency_key=f"learning-authoring:{job.id}",
            payload={
                **(durable_payload or {}),
                "legacyJobId": job.id,
                "title": job.title,
            },
            thread_id=thread_id,
            action_id=action_id,
            priority=15,
            max_attempts=2,
            publish=publish,
            commit=commit,
        )
    except Exception as exception:
        if commit:
            job.status = "FAILED"
            job.error = str(exception)[:4000]
            job.completed = datetime.datetime.utcnow()
            db.session.commit()
        return job, exception
    return job, None


def _attempt_view(attempt, *, include_evidence=False):
    challenge = _dojo_challenge_for_attempt(attempt)
    runtime = ((attempt.data or {}).get("runtime") or {})
    latest = (
        LearningAssessments.query.filter_by(attempt_id=attempt.id)
        .order_by(LearningAssessments.revision.desc())
        .first()
    )
    event_count = LearningEvidenceEvents.query.filter_by(attempt_id=attempt.id).count()
    chain = verify_evidence_chain(attempt.id) if include_evidence else None
    normalized_activity = activity_state(attempt.status)
    normalized_assessment = assessment_state(
        assessment_view(latest) if latest else None,
        activity=normalized_activity,
    )
    result = {
        "id": attempt.id,
        "userId": attempt.user_id,
        "dojoId": challenge.dojo.reference_id,
        "dojoName": challenge.dojo.name,
        "moduleId": challenge.module.id,
        "moduleName": challenge.module.name,
        "challengeId": challenge.id,
        "challengeDatabaseId": challenge.challenge_id,
        "challengeName": challenge.name,
        "exerciseMode": challenge.exercise_mode,
        "challengeUrl": (
            f"/{challenge.dojo.reference_id}/{challenge.module.id}/{challenge.id}"
        ),
        "courseLearningUrl": f"/dojo/{challenge.dojo.reference_id}/learning",
        "scoreUrl": f"/learning/attempts/{attempt.id}/score",
        "challengeVersion": runtime.get("challengeVersion", 1),
        "simulationRunId": runtime.get("simulationRunId"),
        "epoch": attempt.epoch,
        "mode": attempt.mode,
        "status": attempt.status,
        "activityState": normalized_activity,
        "assessmentState": normalized_assessment,
        "evidenceState": evidence_state(
            count=event_count,
            valid=chain.get("valid") if chain else None,
            complete=normalized_activity == "COMPLETED" and bool(latest),
        ),
        "evidenceCount": event_count,
        "reflection": attempt.reflection,
        "objectiveScore": attempt.objective_score,
        "processScore": attempt.process_score,
        "totalScore": attempt.total_score,
        "trustScore": attempt.trust_score,
        "started": attempt.started.isoformat() + "Z",
        "submitted": attempt.submitted.isoformat() + "Z" if attempt.submitted else None,
        "completed": attempt.completed.isoformat() + "Z" if attempt.completed else None,
        "assessment": assessment_view(latest) if latest else None,
    }
    if include_evidence:
        events = (
            LearningEvidenceEvents.query.filter_by(attempt_id=attempt.id)
            .order_by(LearningEvidenceEvents.sequence)
            .all()
        )
        result["evidence"] = [event_view(event) for event in events]
        result["evidenceChain"] = chain
        result["tutorMessages"] = [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "metadata": message.metadata_json,
                "created": message.created.isoformat() + "Z",
            }
            for message in LearningTutorMessages.query.filter_by(attempt_id=attempt.id)
            .order_by(LearningTutorMessages.id)
            .all()
        ]
    return result


def _course_progress(dojo, user, solved_challenge_ids=None):
    is_teacher = dojo.is_admin(user)
    required = [
        challenge
        for module in dojo.modules
        if is_teacher or module.visible()
        for challenge in (module.challenges if is_teacher else module.visible_challenges())
        if challenge.required and is_supported_exercise(challenge)
    ]
    solved = solved_challenge_ids
    if solved is None:
        solved = {
            solve.challenge_id
            for solve in dojo.solves(
                user=user, ignore_visibility=True, ignore_admins=False
            ).all()
        }
    completed = sum(1 for challenge in required if challenge.challenge_id in solved)
    return progress_contract(completed, len(required))


def _course_view(
    dojo,
    user,
    membership,
    solved_challenge_ids,
    submission_count,
    *,
    include_modules=True,
    compact=False,
):
    is_teacher = user.type == "admin" or bool(
        membership and membership.type == "admin"
    )
    if compact:
        module_count = 0
        published_count = 0
        solved_count = 0
        required_count = 0
        required_completed = 0
        next_required = None
        next_available = None
        for module in dojo.modules:
            if not is_teacher and not module.visible():
                continue
            module_count += 1
            challenges = [
                challenge
                for challenge in (
                    module.challenges if is_teacher else module.visible_challenges()
                )
                if is_supported_exercise(challenge)
            ]
            for position, challenge in enumerate(challenges):
                completed = challenge.challenge_id in solved_challenge_ids
                published_count += 1
                solved_count += int(completed)
                if challenge.required:
                    required_count += 1
                    required_completed += int(completed)
                if completed:
                    continue
                previous_completed = (
                    position > 0
                    and challenges[position - 1].challenge_id
                    in solved_challenge_ids
                )
                item = {
                    "id": challenge.id,
                    "name": challenge.name,
                    "required": challenge.required,
                    "completed": False,
                    "locked": bool(
                        challenge.progression_locked
                        and position > 0
                        and not is_teacher
                        and not previous_completed
                    ),
                    "allowPrivileged": challenge.allow_privileged,
                    "exerciseMode": challenge.exercise_mode,
                    "workspaceUrl": (
                        f"/{dojo.reference_id}/{module.id}/{challenge.id}"
                    ),
                }
                if next_available is None:
                    next_available = item
                if challenge.required and next_required is None:
                    next_required = item
        enrolled = membership is not None or user.type == "admin"
        return {
            "id": dojo.reference_id,
            "name": dojo.name,
            "description": dojo.description,
            "role": "teacher" if is_teacher else "student",
            "enrolled": enrolled,
            "membershipStatus": "ENROLLED" if enrolled else "AVAILABLE",
            "moduleCount": module_count,
            "publishedItemCount": published_count,
            "progress": progress_contract(required_completed, required_count),
            "submissionCount": submission_count,
            "solveCount": solved_count,
            "nextItem": next_required or next_available,
            "modules": [],
            "courseUrl": f"/{dojo.reference_id}",
            "learningUrl": f"/dojo/{dojo.reference_id}/learning",
            "studioUrl": (
                f"/teacher/courses?{urlencode({'dojo': dojo.reference_id, 'tab': 'questions'})}"
                if is_teacher
                else None
            ),
        }
    modules = []
    all_items = []
    module_count = 0
    for module in dojo.modules:
        if not is_teacher and not module.visible():
            continue
        module_count += 1
        challenges = [
            challenge
            for challenge in (
                module.challenges if is_teacher else module.visible_challenges()
            )
            if is_supported_exercise(challenge)
        ]
        published_items = []
        for position, challenge in enumerate(challenges):
            completed = challenge.challenge_id in solved_challenge_ids
            previous_completed = (
                position > 0
                and challenges[position - 1].challenge_id in solved_challenge_ids
            )
            published_items.append({
                "id": challenge.id,
                "name": challenge.name,
                "required": challenge.required,
                "completed": completed,
                "locked": bool(
                    challenge.progression_locked
                    and position > 0
                    and not is_teacher
                    and not completed
                    and not previous_completed
                ),
                "allowPrivileged": challenge.allow_privileged,
                "exerciseMode": challenge.exercise_mode,
                "workspaceUrl": (
                    f"/{dojo.reference_id}/{module.id}/{challenge.id}"
                ),
            })
        all_items.extend(published_items)
        required_items = [item for item in published_items if item["required"]]
        completed = sum(item["completed"] for item in required_items)
        if include_modules:
            modules.append({
                "id": module.id,
                "name": module.name,
                "description": module.description,
                "publishedItems": published_items,
                "progress": progress_contract(completed, len(required_items)),
            })

    next_item = next(
        (
            item
            for item in all_items
            if item["required"] and not item["completed"]
        ),
        None,
    ) or next((item for item in all_items if not item["completed"]), None)
    enrolled = membership is not None or user.type == "admin"
    return {
        "id": dojo.reference_id,
        "name": dojo.name,
        "description": dojo.description,
        "role": "teacher" if is_teacher else "student",
        "enrolled": enrolled,
        "membershipStatus": "ENROLLED" if enrolled else "AVAILABLE",
        "moduleCount": module_count,
        "publishedItemCount": len(all_items),
        "progress": progress_contract(
            sum(item["completed"] for item in all_items if item["required"]),
            sum(1 for item in all_items if item["required"]),
        ),
        "submissionCount": submission_count,
        "solveCount": sum(item["completed"] for item in all_items),
        "nextItem": next_item,
        "modules": modules,
        "courseUrl": f"/{dojo.reference_id}",
        "learningUrl": f"/dojo/{dojo.reference_id}/learning",
        "studioUrl": (
            f"/teacher/courses?{urlencode({'dojo': dojo.reference_id, 'tab': 'questions'})}"
            if is_teacher
            else None
        ),
    }


def _student_assignments(user, dojo_ids, *, limit=100):
    rows = (
        TeachingAssignments.query.filter(
            TeachingAssignments.status.in_(("PUBLISHED", "CLOSED")),
            TeachingAssignments.dojo_id.in_(dojo_ids or [-1]),
        )
        .order_by(
            TeachingAssignments.due_at.asc().nullslast(),
            TeachingAssignments.created.desc(),
        )
        .limit(limit)
        .all()
    )
    return [assignment_view(row, user=user, include_items=False) for row in rows]


def _learning_profile_summary(user, dojos):
    dojo_ids = [dojo.dojo_id for dojo in dojos]
    dojo_by_id = {dojo.dojo_id: dojo for dojo in dojos}
    skill_rows = (
        LearningSkillStates.query.filter(
            LearningSkillStates.user_id == user.id,
            LearningSkillStates.dojo_id.in_(dojo_ids or [-1]),
        )
        .order_by(LearningSkillStates.updated.desc())
        .limit(80)
        .all()
    )
    skills = [
        {
            "courseId": dojo_by_id[row.dojo_id].reference_id,
            "course": dojo_by_id[row.dojo_id].name,
            "dimension": row.dimension,
            "label": ABILITY_LABELS.get(row.dimension, row.dimension),
            "mastery": round(row.mastery, 1),
            "confidence": row.confidence,
            "evidenceCount": row.evidence_count,
        }
        for row in skill_rows
        if row.dojo_id in dojo_by_id
    ]
    recommendation_rows = (
        LearningRecommendations.query.filter(
            LearningRecommendations.user_id == user.id,
            LearningRecommendations.status == "ACTIVE",
            LearningRecommendations.dojo_id.in_(dojo_ids or [-1]),
        )
        .order_by(LearningRecommendations.created.desc(), LearningRecommendations.rank)
        .limit(6)
        .all()
    )
    challenge_ids = {row.challenge_id for row in recommendation_rows}
    positions = (
        DojoChallenges.query.filter(
            DojoChallenges.dojo_id.in_(dojo_ids or [-1]),
            DojoChallenges.challenge_id.in_(challenge_ids or [-1]),
            DojoChallenges.supported(),
        ).all()
    )
    position_by_key = {}
    for position in positions:
        position_by_key.setdefault((position.dojo_id, position.challenge_id), position)
    recommendations = []
    for row in recommendation_rows:
        dojo = dojo_by_id.get(row.dojo_id)
        position = position_by_key.get((row.dojo_id, row.challenge_id))
        if dojo is None or position is None:
            continue
        recommendations.append(
            {
                "courseId": dojo.reference_id,
                "course": dojo.name,
                "exercise": position.name,
                "rank": row.rank,
                "reason": row.reason,
                "url": f"/{dojo.reference_id}/{position.module.id}/{position.id}",
            }
        )
    return {
        "summary": {
            "averageMastery": (
                round(sum(item["mastery"] for item in skills) / len(skills), 1)
                if skills
                else None
            ),
            "evidencedSkills": sum(item["evidenceCount"] > 0 for item in skills),
        },
        "skills": skills,
        "recommendations": recommendations,
        "recentAttempts": [],
    }


def _student_next_action(*, active, assignments, courses, recommendations):
    now = datetime.datetime.utcnow()
    if active:
        return {
            "type": "CONTINUE_ATTEMPT",
            "label": "继续实验",
            "title": active["challengeName"],
            "reason": "你有一项尚未结束的实验，运行状态和学习证据已经保留。",
            "reasonCode": "ACTIVE_LAB_SAVED",
            "estimatedMinutes": 20,
            "saved": True,
            "savedState": "环境与学习步骤已保留",
            "dueAt": None,
            "href": active["challengeUrl"],
            "state": active["activityState"],
            "context": {
                "courseId": active["dojoId"],
                "courseName": active["dojoName"],
                "moduleId": active["moduleId"],
                "moduleName": active["moduleName"],
                "challengeId": active["challengeId"],
            },
        }
    pending = [
        item
        for item in assignments
        if item.get("status") == "PUBLISHED"
        and not (
            item.get("submission")
            and item["submission"].get("status") == "GRADED"
        )
    ]
    if pending:
        item = pending[0]
        submission = item.get("submission") or {}
        due = item.get("dueAt")
        minutes = 15
        if due:
            try:
                deadline = datetime.datetime.fromisoformat(due.replace("Z", "+00:00"))
                if deadline.tzinfo:
                    deadline = deadline.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                remaining_hours = max(0, int((deadline - now).total_seconds() // 3600))
                minutes = 10 if remaining_hours < 24 else 20
            except ValueError:
                pass
        return {
            "type": "ASSIGNMENT",
            "label": "继续作业" if submission else "开始作业",
            "title": item.get("title") or "课程作业",
            "reason": "这项教师任务最接近截止时间，应优先完成。",
            "reasonCode": "NEAREST_ASSIGNMENT_DUE",
            "estimatedMinutes": minutes,
            "saved": bool(submission),
            "savedState": "作答草稿已保存" if submission else "尚未开始作答",
            "dueAt": due,
            "href": f"/learning/assignments/{item['id']}",
            "state": activity_state(submission.get("status")),
            "context": {
                "courseId": item.get("dojoReferenceId"),
                "courseName": item.get("courseName"),
                "assignmentId": item.get("id"),
                "dueAt": due,
            },
        }
    if recommendations:
        item = recommendations[0]
        return {
            "type": "PRACTICE",
            "label": "开始巩固",
            "title": item.get("exercise") or "能力巩固练习",
            "reason": item.get("reason") or "已有学习证据表明这项练习适合作为下一步。",
            "reasonCode": "EVIDENCE_BASED_RECOMMENDATION",
            "estimatedMinutes": 15,
            "saved": False,
            "savedState": "尚未开始",
            "dueAt": None,
            "href": item.get("url") or "/guide",
            "state": "NOT_STARTED",
            "context": {
                "courseId": item.get("courseId"),
                "courseName": item.get("course"),
            },
        }
    course = next((item for item in courses if item.get("nextItem")), None)
    if course:
        item = course["nextItem"]
        return {
            "type": "COURSE_ITEM",
            "label": "继续课程",
            "title": item.get("name") or "下一项课程内容",
            "reason": "这是课程路径中下一项尚未完成的必修内容。",
            "reasonCode": "COURSE_SEQUENCE_NEXT",
            "estimatedMinutes": 20,
            "saved": False,
            "savedState": "尚未开始",
            "dueAt": None,
            "href": item.get("workspaceUrl") or course["learningUrl"],
            "state": "NOT_STARTED",
            "context": {
                "courseId": course["id"],
                "courseName": course["name"],
                "challengeId": item.get("id"),
            },
        }
    if courses:
        course = courses[0]
        return {
            "type": "COURSE_REVIEW",
            "label": "查看学习进展",
            "title": course["name"],
            "reason": "当前课程没有待完成的必修实验，可以复盘证据或选择选修内容。",
            "reasonCode": "COURSE_REQUIRED_ITEMS_COMPLETE",
            "estimatedMinutes": 5,
            "saved": True,
            "savedState": "课程必修内容已完成",
            "dueAt": None,
            "href": course["learningUrl"],
            "state": "COMPLETED",
            "context": {"courseId": course["id"], "courseName": course["name"]},
        }
    return {
        "type": "JOIN_COURSE",
        "label": "加入第一门课程",
        "title": "使用课程码进入教师的课程",
        "reason": "加入课程后，这里会根据截止时间、进度和已保存状态给出唯一下一步。",
        "reasonCode": "NO_ENROLLMENT",
        "estimatedMinutes": 1,
        "saved": False,
        "savedState": "加入后自动建立学习路径",
        "dueAt": None,
        "href": "/student#join-course",
        "state": "NOT_STARTED",
        "context": {},
    }


@learning_namespace.route("/overview")
class LearningOverview(Resource):
    @authed_only
    def get(self):
        user = get_current_user()
        from ...models import Dojos

        view_mode = str(request.args.get("view") or "full").lower()
        if view_mode not in {"full", "home", "today", "navigation"}:
            view_mode = "full"
        compact = view_mode != "full"
        membership_rows = DojoUsers.query.filter_by(user_id=user.id).all()
        membership_by_dojo = {row.dojo_id: row for row in membership_rows}
        viewable = Dojos.viewable(user=user).options(
            selectinload(Dojos.modules).selectinload(DojoModules.challenges)
        )
        if compact and membership_by_dojo:
            dojos = viewable.filter(
                Dojos.dojo_id.in_(list(membership_by_dojo))
            ).all()
        elif compact and getattr(user, "type", None) != "admin":
            dojos = []
        elif compact:
            dojos = viewable.limit(30).all()
        else:
            dojos = viewable.all()
        dojo_ids = [dojo.dojo_id for dojo in dojos]
        memberships = {
            dojo_id: membership_by_dojo[dojo_id]
            for dojo_id in dojo_ids
            if dojo_id in membership_by_dojo
        }
        solved_by_dojo = {dojo_id: set() for dojo_id in dojo_ids}
        for dojo_id, challenge_id in (
            db.session.query(DojoChallenges.dojo_id, Solves.challenge_id)
            .join(Solves, Solves.challenge_id == DojoChallenges.challenge_id)
            .filter(
                Solves.user_id == user.id,
                Solves.type == Solves.__mapper__.polymorphic_identity,
                DojoChallenges.dojo_id.in_(dojo_ids),
            )
            .all()
        ):
            solved_by_dojo[dojo_id].add(challenge_id)
        submissions_by_dojo = dict(
            db.session.query(DojoChallenges.dojo_id, func.count(Submissions.id))
            .join(
                Submissions,
                Submissions.challenge_id == DojoChallenges.challenge_id,
            )
            .filter(
                Submissions.user_id == user.id,
                DojoChallenges.dojo_id.in_(dojo_ids),
            )
            .group_by(DojoChallenges.dojo_id)
            .all()
        )
        courses = [
            _course_view(
                dojo,
                user,
                memberships.get(dojo.dojo_id),
                solved_by_dojo[dojo.dojo_id],
                submissions_by_dojo.get(dojo.dojo_id, 0),
                include_modules=view_mode not in {"home", "today"},
                compact=view_mode == "home",
            )
            for dojo in dojos
        ]
        enrolled_courses = [course for course in courses if course["enrolled"]]
        available_courses = [course for course in courses if not course["enrolled"]]
        presented_enrolled_courses = (
            enrolled_courses[:12] if view_mode == "home" else enrolled_courses
        )
        if view_mode == "navigation":
            return {
                "success": True,
                "state": "READY" if enrolled_courses else "EMPTY",
                "membershipStatus": "ENROLLED" if enrolled_courses else "NOT_ENROLLED",
                "courses": enrolled_courses,
            }
        component_status = {
            "courses": "READY",
            "assignments": "READY",
            "profile": "READY",
            "workspace": "READY",
        }
        try:
            assignments = _student_assignments(
                user,
                list(memberships),
                limit=30 if view_mode in {"home", "today"} else 100,
            )
        except Exception:
            logger.exception("Unable to load student assignments")
            assignments = []
            component_status["assignments"] = "DEGRADED"
        raw_active = active_attempt(user.id)
        active = None
        stale_context = None
        if raw_active is not None:
            challenge = raw_active.dojo_challenge
            if (
                raw_active.dojo_id in memberships
                and challenge is not None
                and challenge.visible()
            ):
                active = raw_active
            else:
                stale_context = {
                    "state": "STALE",
                    "message": "上一次实验所属课程已不可用，已停止把它作为今天的下一步。",
                    "recovery": {
                        "label": "清除旧记录并重新计算",
                        "method": "DELETE",
                        "href": "/learning/attempts/current",
                    },
                }
        active_view = _attempt_view(active) if active else None
        try:
            profile = (
                _learning_profile_summary(user, dojos)
                if view_mode in {"home", "today"}
                else learning_profile_context(user)
            )
        except Exception:
            logger.exception("Unable to load student learning profile")
            profile = {"summary": {}, "skills": [], "recommendations": [], "recentAttempts": []}
            component_status["profile"] = "DEGRADED"
        skills = profile.get("skills") or []
        normalized_skills = [
            {
                **item,
                "masteryState": mastery_state(
                    item.get("mastery"),
                    evidence_count=item.get("evidenceCount"),
                ),
            }
            for item in skills
        ]
        try:
            workspace = (
                {
                    "count": SelfLearningWorkspaces.query.filter(
                        SelfLearningWorkspaces.student_id == user.id,
                        SelfLearningWorkspaces.status != "ARCHIVED",
                    ).count()
                }
                if view_mode in {"home", "today"}
                else student_agent_snapshot(user)
            )
        except Exception:
            logger.exception("Unable to load student agent snapshot")
            workspace = {
                "memory": [],
                "workspaces": [],
                "courses": [],
                "courseMaterials": [],
                "assignments": [],
                "publishedArtifacts": [],
                "personalArtifacts": [],
                "policy": {"role": "student"},
            }
            component_status["workspace"] = "DEGRADED"
        recommendations = (profile.get("recommendations") or [])[:6]
        next_action = _student_next_action(
            active=active_view,
            assignments=assignments,
            courses=enrolled_courses,
            recommendations=recommendations,
        )
        degraded = any(value == "DEGRADED" for value in component_status.values())
        state = (
            "DEGRADED"
            if degraded
            else "ONBOARDING"
            if not enrolled_courses
            else "EMPTY"
            if not any(course["publishedItemCount"] for course in enrolled_courses)
            and not assignments
            else "READY"
        )
        evidence_values = [
            item["masteryState"]
            for item in normalized_skills
            if item["masteryState"]["state"] != "UNKNOWN"
        ]
        return {
            "success": True,
            "state": state,
            "experience": student_ux_rollout(user.id),
            "components": component_status,
            "membershipStatus": "ENROLLED" if enrolled_courses else "NOT_ENROLLED",
            "nextAction": next_action,
            "currentItem": active_view or next_action.get("context"),
            "courses": [] if view_mode == "home" else courses,
            "enrolledCourses": presented_enrolled_courses,
            "availableCourses": [] if view_mode == "home" else available_courses,
            "summary": {
                "enrolledCourses": len(enrolled_courses),
                "availableCourses": len(available_courses),
                "modules": sum(course["moduleCount"] for course in enrolled_courses),
                "publishedItems": sum(
                    course["publishedItemCount"] for course in enrolled_courses
                ),
                "completedItems": sum(
                    course["solveCount"] for course in enrolled_courses
                ),
                "submissions": sum(
                    course["submissionCount"] for course in enrolled_courses
                ),
            },
            "activeAttempt": active_view,
            "staleContext": stale_context,
            "assignments": assignments,
            "masterySummary": {
                "state": "AVAILABLE" if evidence_values else "UNKNOWN",
                "label": "已有可核验学习证据" if evidence_values else "完成一次实训后形成能力判断",
                "evidencedSkills": len(evidence_values),
                "totalSkills": len(normalized_skills),
            },
            "profile": {
                "summary": profile.get("summary") or {},
                "weakestSkills": sorted(
                    normalized_skills,
                    key=lambda item: (
                        item["masteryState"]["value"] is None,
                        item["masteryState"]["value"] or 0,
                        -item.get("evidenceCount", 0),
                    ),
                )[:5],
                "strongestSkills": sorted(
                    normalized_skills,
                    key=lambda item: (
                        item["masteryState"]["value"] is None,
                        -(item["masteryState"]["value"] or 0),
                        -item.get("evidenceCount", 0),
                    ),
                )[:3],
                "recommendations": recommendations,
                "recentAttempts": (profile.get("recentAttempts") or [])[:8],
            },
            "workspace": workspace,
        }


@learning_namespace.route("/telemetry")
class LearningExperienceTelemetry(Resource):
    @authed_only
    def post(self):
        user = get_current_user()
        body = request.get_json(silent=True) or {}
        try:
            properties = sanitize_telemetry(body.get("event"), body.get("properties"))
        except ValueError as exc:
            return error_contract(
                "INVALID_TELEMETRY",
                exc,
                label="返回今天",
                href="/student",
                request_id=request.headers.get("X-Request-ID"),
            ), 400
        db.session.add(
            LearningAuditEvents(
                actor_id=user.id,
                action=f"student.telemetry.{body['event']}",
                resource_type="student_experience",
                resource_id=str(user.id),
                outcome="ALLOW",
                details=properties,
            )
        )
        db.session.commit()
        return {"success": True, "data": {"accepted": True}}, 202


def _student_course_access(dojo, user):
    if dojo is None or user is None:
        return False
    if getattr(user, "type", None) == "admin":
        return True
    if dojo.official or (dojo.type == "public" and dojo.password is None):
        return True
    return DojoUsers.query.filter_by(
        dojo_id=dojo.dojo_id,
        user_id=user.id,
    ).first() is not None


def _student_course_manage(dojo, user):
    if dojo is None or user is None:
        return False
    if getattr(user, "type", None) == "admin":
        return True
    return DojoAdmins.query.filter_by(
        dojo_id=dojo.dojo_id,
        user_id=user.id,
    ).first() is not None


def _resource_reference_parts(value, expected):
    value = str(value or "").strip().strip("/")
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != expected:
        parts = value.split("/")
    if len(parts) != expected or not all(parts):
        return None
    return parts


def _student_historical_resource(user, object_type, object_id):
    """Resolve old agent cards without relying on bounded snapshot lists.

    Guide messages are durable, while the model snapshot is intentionally bounded.
    A valid older item must therefore be checked against its authoritative table and
    current visibility rules before it is described as missing.
    """

    kind = str(object_type or "").strip().lower()
    reference = str(object_id or "").strip()
    result = {
        "status": "UNRESOLVED",
        "href": None,
        "reasonCode": "REFERENCE_NOT_RESOLVED",
        "title": None,
    }

    def course_from_reference(value):
        if re.fullmatch(r"-?\d+", str(value or "")):
            return Dojos.query.filter_by(dojo_id=int(value)).first()
        try:
            return Dojos.from_id(value).first()
        except (TypeError, ValueError):
            return None

    if kind == "course":
        dojo = course_from_reference(reference)
        if dojo is None:
            return {**result, "status": "DELETED", "reasonCode": "COURSE_NOT_FOUND"}
        if not _student_course_access(dojo, user):
            return {**result, "status": "FORBIDDEN", "reasonCode": "COURSE_ACCESS_REQUIRED"}
        if isinstance(dojo.data, dict) and dojo.data.get("archived"):
            return {**result, "status": "ARCHIVED", "reasonCode": "COURSE_ARCHIVED", "title": dojo.name}
        return {
            **result,
            "status": "AVAILABLE",
            "href": f"/{quote(dojo.reference_id, safe='~')}",
            "reasonCode": None,
            "title": dojo.name,
        }

    if kind in {"module", "challenge", "simulation", "course_material"}:
        expected = 2 if kind == "module" else 3
        parts = _resource_reference_parts(reference, expected)
        if parts is None:
            return {**result, "status": "INVALID", "reasonCode": "INVALID_RESOURCE_ID"}
        dojo = course_from_reference(parts[0])
        if dojo is None:
            return {**result, "status": "DELETED", "reasonCode": "COURSE_NOT_FOUND"}
        if not _student_course_access(dojo, user):
            return {**result, "status": "FORBIDDEN", "reasonCode": "COURSE_ACCESS_REQUIRED"}
        if isinstance(dojo.data, dict) and dojo.data.get("archived"):
            return {**result, "status": "ARCHIVED", "reasonCode": "COURSE_ARCHIVED", "title": dojo.name}

        module = None
        if kind == "course_material":
            try:
                module_index = int(parts[1])
                resource_index = int(parts[2])
            except (TypeError, ValueError):
                return {**result, "status": "INVALID", "reasonCode": "INVALID_RESOURCE_ID"}
            module = next(
                (item for item in dojo.modules if item.module_index == module_index),
                None,
            )
        else:
            module = next((item for item in dojo.modules if item.id == parts[1]), None)
        if module is None:
            return {**result, "status": "DELETED", "reasonCode": "MODULE_NOT_FOUND"}
        can_manage_course = _student_course_manage(dojo, user)
        if not can_manage_course and not module.visible():
            return {**result, "status": "FORBIDDEN", "reasonCode": "MODULE_NOT_AVAILABLE", "title": module.name}

        module_href = (
            f"/{quote(dojo.reference_id, safe='~')}/{quote(module.id, safe='')}"
        )
        if kind == "module":
            return {
                **result,
                "status": "AVAILABLE",
                "href": module_href,
                "reasonCode": None,
                "title": module.name,
            }
        if kind == "course_material":
            resource = next(
                (
                    item
                    for item in module.resources
                    if item.resource_index == resource_index
                ),
                None,
            )
            if resource is None:
                return {**result, "status": "DELETED", "reasonCode": "MATERIAL_NOT_FOUND"}
            if not can_manage_course and not resource.visible:
                return {**result, "status": "FORBIDDEN", "reasonCode": "MATERIAL_NOT_AVAILABLE", "title": resource.name}
            return {
                **result,
                "status": "AVAILABLE",
                "href": f"{module_href}#resource-{resource.resource_index}",
                "reasonCode": None,
                "title": resource.name,
            }

        challenge = next(
            (item for item in module.challenges if item.id == parts[2]),
            None,
        )
        if challenge is None or not is_supported_exercise(challenge):
            return {**result, "status": "DELETED", "reasonCode": "CHALLENGE_NOT_FOUND"}
        if not can_manage_course and not challenge.visible():
            return {**result, "status": "FORBIDDEN", "reasonCode": "CHALLENGE_NOT_AVAILABLE", "title": challenge.name}
        return {
            **result,
            "status": "AVAILABLE",
            "href": f"{module_href}/{quote(challenge.id, safe='')}",
            "reasonCode": None,
            "title": challenge.name,
        }

    if kind == "artifact":
        artifact = TeachingArtifacts.query.filter_by(id=reference).first()
        if artifact is None:
            return {**result, "status": "DELETED", "reasonCode": "ARTIFACT_NOT_FOUND"}
        status = str(artifact.status or "").upper()
        if status == "DELETED":
            return {**result, "status": "DELETED", "reasonCode": "ARTIFACT_DELETED", "title": artifact.title}
        if status == "ARCHIVED":
            state = "ARCHIVED" if artifact.owner_id == user.id else "FORBIDDEN"
            reason = "ARTIFACT_ARCHIVED" if state == "ARCHIVED" else "ARTIFACT_ACCESS_REQUIRED"
            return {**result, "status": state, "reasonCode": reason, "title": artifact.title}
        permitted = artifact.owner_id == user.id
        if not permitted and status == "PUBLISHED" and artifact.dojo is not None:
            permitted = _student_course_access(artifact.dojo, user)
        if not permitted:
            return {**result, "status": "FORBIDDEN", "reasonCode": "ARTIFACT_ACCESS_REQUIRED", "title": artifact.title}
        return {
            **result,
            "status": "AVAILABLE",
            "href": f"/learning/artifacts/{quote(artifact.id, safe='')}",
            "reasonCode": None,
            "title": artifact.title,
        }

    if kind == "assignment":
        assignment = TeachingAssignments.query.filter_by(id=reference).first()
        if assignment is None:
            return {**result, "status": "DELETED", "reasonCode": "ASSIGNMENT_NOT_FOUND"}
        permitted = (
            str(assignment.status or "").upper() in {"PUBLISHED", "CLOSED"}
            and _student_course_access(assignment.dojo, user)
        )
        if not permitted:
            return {**result, "status": "FORBIDDEN", "reasonCode": "ASSIGNMENT_NOT_AVAILABLE", "title": assignment.title}
        return {
            **result,
            "status": "AVAILABLE",
            "href": f"/learning/assignments/{quote(assignment.id, safe='')}",
            "reasonCode": None,
            "title": assignment.title,
        }

    if kind == "workspace":
        workspace = SelfLearningWorkspaces.query.filter_by(id=reference).first()
        if workspace is None:
            return {**result, "status": "DELETED", "reasonCode": "WORKSPACE_NOT_FOUND"}
        if workspace.student_id != user.id:
            return {**result, "status": "FORBIDDEN", "reasonCode": "WORKSPACE_ACCESS_REQUIRED", "title": workspace.title}
        if str(workspace.status or "").upper() == "ARCHIVED":
            return {**result, "status": "ARCHIVED", "reasonCode": "WORKSPACE_ARCHIVED", "title": workspace.title}
        return {
            **result,
            "status": "AVAILABLE",
            "href": f"/learning/extend?workspace={quote(workspace.id, safe='')}",
            "reasonCode": None,
            "title": workspace.title,
        }

    if kind in {"", "resource", "link"}:
        return result
    return {**result, "status": "INVALID", "reasonCode": "UNSUPPORTED_RESOURCE_TYPE"}


def _legacy_resource_reference_from_url(value):
    """Recover a structured reference from URLs written by older guide replies."""

    normalized = student_resource_url_key(value)
    if not normalized:
        return None
    parsed = urlsplit(normalized)
    segments = [unquote(item) for item in parsed.path.split("/") if item]
    if len(segments) == 3 and segments[:2] == ["learning", "artifacts"]:
        return "artifact", segments[2]
    if len(segments) == 3 and segments[:2] == ["learning", "assignments"]:
        return "assignment", segments[2]
    if segments == ["learning", "extend"]:
        workspace_id = (parse_qs(parsed.query).get("workspace") or [""])[0]
        return ("workspace", workspace_id) if workspace_id else None
    if len(segments) == 3 and segments[0] == "dojo" and segments[2] == "learning":
        return "course", segments[1]
    reserved = {
        "admin",
        "api",
        "dojos",
        "guide",
        "hacker",
        "learning",
        "pwncollege_api",
        "settings",
        "student",
        "teacher",
        "workspace",
    }
    if len(segments) == 3 and segments[0] not in reserved:
        return "challenge", ":".join(segments)
    if len(segments) == 2 and segments[0] not in reserved:
        return "module", ":".join(segments)
    if len(segments) == 1 and segments[0] not in reserved:
        return "course", segments[0]
    return None


def _student_resource_recovery(object_type, status):
    kind = str(object_type or "").lower()
    if kind in {"workspace", "artifact"}:
        return {"label": "查看我的学习内容", "href": "/learning/extend"}
    if kind == "assignment":
        return {"label": "查看今日任务", "href": "/student"}
    if kind in {"course", "module", "challenge", "simulation", "course_material"}:
        return {"label": "查看我的课程", "href": "/dojos?tab=mine"}
    label = "返回学习首页" if status in {"INVALID", "UNRESOLVED"} else "查看我的课程"
    return {"label": label, "href": "/student" if label == "返回学习首页" else "/dojos?tab=mine"}


@learning_namespace.route("/resources/resolve")
class LearningResourceResolver(Resource):
    @authed_only
    def post(self):
        user = get_current_user()
        body = request.get_json(silent=True) or {}
        resources = body.get("resources")
        if not isinstance(resources, list) or not resources or len(resources) > 50:
            return error_contract(
                "INVALID_RESOURCE_REFS",
                "请选择 1 至 50 项学习内容后重试。",
                request_id=request.headers.get("X-Request-ID"),
            ), 400
        resolved = []
        for index, source in enumerate(resources):
            source = source if isinstance(source, dict) else {}
            object_type = str(source.get("objectType") or "").strip().lower()[:48]
            object_id = str(source.get("objectId") or "").strip()[:128]
            cached_url = str(source.get("url") or "").strip()[:1000]
            cached_url_key = student_resource_url_key(cached_url)
            inferred = False
            if object_type in {"", "resource", "link"} and not object_id:
                legacy_reference = _legacy_resource_reference_from_url(cached_url)
                if legacy_reference is not None:
                    object_type, object_id = legacy_reference
                    inferred = True
            historical = _student_historical_resource(
                user,
                object_type,
                object_id,
            )
            status = historical["status"]
            href = historical["href"]
            reason_code = historical["reasonCode"]
            title = historical.get("title")
            if inferred and status == "DELETED":
                # A route-shaped old URL is not proof that an object was deleted.
                status = "UNRESOLVED"
                reason_code = "REFERENCE_NOT_RESOLVED"
            if status == "AVAILABLE" and cached_url_key:
                target_key = student_resource_url_key(href)
                if target_key and target_key != cached_url_key:
                    status = "MOVED"
                    reason_code = "RESOURCE_MOVED"
            recovery = _student_resource_recovery(object_type, status)
            resolved.append(
                {
                    "key": str(source.get("key") or index)[:128],
                    "objectType": object_type or "link",
                    "objectId": object_id,
                    "status": status,
                    "href": href if status in {"AVAILABLE", "MOVED"} else None,
                    "title": title,
                    "reasonCode": reason_code,
                    "recovery": recovery,
                }
            )
        return {"success": True, "data": {"resources": resolved}}


@learning_namespace.route("/dojos/<dojo>/dashboard")
class LearningDashboard(Resource):
    @authed_only
    @dojo_route
    def get(self, dojo):
        user = get_current_user()
        recommendations = build_recommendations(user, dojo, persist=True)
        attempts = (
            LearningAttempts.query.filter_by(user_id=user.id, dojo_id=dojo.dojo_id)
            .order_by(LearningAttempts.started.desc())
            .limit(20)
            .all()
        )
        attempts = [
            attempt
            for attempt in attempts
            if _dojo_challenge_for_attempt(attempt) is not None
        ]
        db.session.commit()
        return {
            "success": True,
            "dojo": {
                "id": dojo.reference_id,
                "name": dojo.name,
                "description": dojo.description,
            },
            "role": "teacher" if dojo.is_admin(user) else "student",
            "progress": _course_progress(dojo, user),
            "skills": skill_states(user.id, dojo.dojo_id),
            "recommendations": recommendations,
            "attempts": [_attempt_view(attempt) for attempt in attempts],
            "standards": {
                "assessment": "客观结果与过程表现分别计分",
                "evidence": "过程记录可复核",
                "tutor": "提示优先，不直接泄露答案",
            },
        }


@learning_namespace.route("/dojos/<dojo>/catalog")
class LearningCatalog(Resource):
    @authed_only
    @dojo_route
    def get(self, dojo):
        include_private = dojo.is_admin(get_current_user())
        items = []
        for challenge in dojo.challenges:
            if not is_supported_exercise(challenge):
                continue
            if not include_private and not challenge.visible():
                continue
            item = catalog_item_view(challenge, include_private=include_private)
            if include_private:
                run = latest_solution_run(challenge)
                item["solutionRun"] = (
                    solution_run_view(run, include_trace=True) if run else None
                )
            items.append(item)
        return {
            "success": True,
            "items": items,
        }


@learning_namespace.route("/dojos/<dojo>/catalog/order")
class LearningCatalogOrder(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def patch(self, dojo):
        actor = get_current_user()
        body = request.get_json(silent=True)
        try:
            modules = (
                DojoModules.query.filter_by(dojo_id=dojo.dojo_id)
                .order_by(DojoModules.module_index)
                .with_for_update()
                .all()
            )
            challenges = (
                DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id)
                .order_by(
                    DojoChallenges.module_index,
                    DojoChallenges.challenge_index,
                )
                .with_for_update()
                .all()
            )
            plan = _catalog_order_plan(modules, challenges, body)
            busy_reason = _catalog_order_busy_reason(dojo, plan)
            if busy_reason:
                raise CatalogOrderError(busy_reason, 409)

            response_positions = [
                {
                    "source": {
                        "moduleIndex": item["source"][0],
                        "challengeIndex": item["source"][1],
                    },
                    "target": {
                        "moduleId": item["targetModule"].id,
                        "moduleIndex": item["target"][0],
                        "challengeIndex": item["target"][1],
                    },
                }
                for item in plan["positions"]
            ]
            _apply_catalog_order(dojo, plan)
            db.session.add(
                LearningAuditEvents(
                    actor_id=actor.id,
                    action="challenge.manage.reorder",
                    resource_type="dojo",
                    resource_id=dojo.reference_id,
                    outcome="ALLOW",
                    details={
                        "dojoId": dojo.dojo_id,
                        "changedCount": len(plan["changed"]),
                        "positions": response_positions[:200],
                    },
                )
            )
            db.session.commit()
        except CatalogOrderError as error:
            db.session.rollback()
            return {"success": False, "error": str(error)}, error.status_code
        except Exception:
            db.session.rollback()
            logger.exception(
                "Failed to reorder course questions for %s",
                dojo.reference_id,
            )
            return {
                "success": False,
                "error": "保存题目顺序失败，现有章节和题目顺序未发生变化。",
            }, 500

        clear_challenges()
        return {
            "success": True,
            "data": {
                "changedCount": len(plan["changed"]),
                "positions": response_positions,
            },
        }


@learning_namespace.route(
    "/dojos/<dojo>/catalog/<module_id>/<challenge_id>"
)
class LearningCatalogItem(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def patch(self, dojo, module_id, challenge_id):
        challenge = _course_challenge(dojo, module_id, challenge_id)
        if not challenge:
            return {"success": False, "error": "未找到要编辑的题目。"}, 404
        body = request.get_json(silent=True)
        body = body if isinstance(body, dict) else {}
        name = str(body.get("name") or "").strip()
        if not 1 <= len(name) <= 128:
            return {
                "success": False,
                "error": "题目名称需包含 1-128 个字符。",
            }, 400
        description = challenge.description
        if "description" in body:
            description = str(body.get("description") or "").strip() or None
            if description and len(description) > 24000:
                return {
                    "success": False,
                    "error": "题目简介不能超过 24,000 个字符。",
                }, 400
        challenge.name = name
        challenge.description = description
        db.session.add(
            LearningAuditEvents(
                actor_id=get_current_user().id,
                action="challenge.manage.update",
                resource_type="dojo_challenge",
                resource_id=f"{dojo.reference_id}/{module_id}/{challenge_id}",
                outcome="ALLOW",
                details={
                    "dojoId": dojo.dojo_id,
                    "moduleIndex": challenge.module_index,
                    "challengeId": challenge.id,
                },
            )
        )
        db.session.commit()
        clear_challenges()
        return {
            "success": True,
            "data": {
                "challenge": {
                    "id": challenge.id,
                    "name": challenge.name,
                    "description": challenge.description,
                    "moduleId": module_id,
                }
            },
        }

    @authed_only
    @dojo_route
    @dojo_admins_only
    def delete(self, dojo, module_id, challenge_id):
        challenge = _course_challenge(dojo, module_id, challenge_id)
        if not challenge:
            return {"success": False, "error": "未找到要删除的题目。"}, 404
        actor = get_current_user()
        try:
            result = delete_published_challenge(challenge, actor)
            rebuild_skill_states(
                dojo.dojo_id,
                result.pop("_affectedUserIds", []),
            )
            package_root = result.pop("_packageRoot", None)
            db.session.commit()
        except PermissionError as error:
            db.session.rollback()
            return {"success": False, "error": str(error)}, 403
        except ValueError as error:
            db.session.rollback()
            return {"success": False, "error": str(error)}, 409
        except Exception:
            db.session.rollback()
            logger.exception(
                "Failed to delete course challenge %s/%s/%s",
                dojo.reference_id,
                module_id,
                challenge_id,
            )
            return {
                "success": False,
                "error": "删除题目失败，现有题目和学习记录未发生变化。",
            }, 500

        assets_removed = False
        try:
            assets_removed = remove_generated_package_assets(package_root)
        except (OSError, ValueError):
            logger.warning(
                "Challenge deleted but generated assets could not be removed: %s",
                package_root,
                exc_info=True,
            )
        stopped_workspaces = _stop_deleted_challenge_workspaces(
            dojo,
            module_id,
            challenge_id,
        )
        clear_challenges()
        clear_standings()
        return {
            "success": True,
            "message": (
                f"题目“{result['challengeId']}”及关联草稿已永久删除。"
                if result.get("draftsDeleted")
                else f"题目“{result['challengeId']}”已永久删除。"
            ),
            "deleted": {
                **result,
                "assetsRemoved": assets_removed,
                "workspacesStopped": stopped_workspaces,
            },
        }


@learning_namespace.route(
    "/dojos/<dojo>/solutions/<module_id>/<challenge_id>"
)
class LearningVerifiedSolution(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo, module_id, challenge_id):
        challenge = _course_challenge(dojo, module_id, challenge_id)
        if not challenge:
            return {"success": False, "error": "未找到题目。"}, 404
        run = latest_solution_run(challenge)
        return {
            "success": True,
            "solutionRun": solution_run_view(run) if run else None,
        }

    @authed_only
    @dojo_route
    @dojo_admins_only
    def post(self, dojo, module_id, challenge_id):
        challenge = _course_challenge(dojo, module_id, challenge_id)
        if not challenge:
            return {"success": False, "error": "未找到题目。"}, 404
        data = request.get_json(silent=True) or {}
        run = enqueue_solution_run(
            challenge,
            get_current_user(),
            app=current_app._get_current_object(),
            force=bool(data.get("force")),
        )
        return {
            "success": True,
            "solutionRun": solution_run_view(run),
        }, 202


@learning_namespace.route("/dojos/<dojo>/units")
class LearningUnits(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def post(self, dojo):
        data = request.get_json(silent=True) or {}
        requested_unit_id = str(data.get("id") or "").strip().lower()
        name = str(data.get("name") or "").strip()
        description = str(data.get("description") or "").strip()

        if not 1 <= len(name) <= 128:
            return {
                "success": False,
                "error": "单元名称必须包含 1–128 个字符。",
            }, 400
        if requested_unit_id and not UNIT_ID_PATTERN.fullmatch(requested_unit_id):
            return {
                "success": False,
                "error": "单元 ID 必须由 1–32 个小写字母、数字或连字符组成。",
            }, 400
        if len(description) > 24000:
            return {
                "success": False,
                "error": "单元简介不能超过 24,000 个字符。",
            }, 400
        unit_id = requested_unit_id or _generated_unit_id(dojo, name)
        if DojoModules.query.filter_by(dojo_id=dojo.dojo_id, id=unit_id).first():
            return {
                "success": False,
                "error": "课程中已存在使用该 ID 的单元。",
            }, 409

        last_index = (
            db.session.query(func.max(DojoModules.module_index))
            .filter(DojoModules.dojo_id == dojo.dojo_id)
            .scalar()
        )
        unit = DojoModules(
            dojo=dojo,
            module_index=(last_index + 1) if last_index is not None else 0,
            id=unit_id,
            name=name,
            description=description or None,
            show_scoreboard=True,
            show_challenges=True,
        )
        db.session.add(unit)
        db.session.commit()
        return {
            "success": True,
            "unit": {
                "id": unit.id,
                "name": unit.name,
                "description": unit.description,
                "url": f"/{dojo.reference_id}/{unit.id}",
            },
        }, 201


@learning_namespace.route("/dojos/<dojo>/manual-drafts")
class LearningManualDrafts(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def post(self, dojo):
        data = request.get_json(silent=True) or {}
        module_id = str(data.get("moduleId") or "").strip()
        module = next((item for item in dojo.modules if item.id == module_id), None)
        if module is None:
            return {"success": False, "error": "请选择有效的目标章节。"}, 400
        try:
            draft = create_manual_draft(
                dojo,
                module,
                get_current_user(),
                data,
            )
            db.session.commit()
        except ValueError as error:
            db.session.rollback()
            return {"success": False, "error": str(error)}, 400
        if data.get("runValidation") is False:
            return {
                "success": True,
                "draft": draft_view(draft),
                "job": None,
            }, 201
        job, error = _queue_authoring_job(
            dojo=dojo,
            module=module,
            author=get_current_user(),
            title=f"检查：{(draft.spec or {}).get('name') or draft.brief}",
            kind="VALIDATE",
            draft_id=draft.id,
            request_json={},
        )
        if error:
            return {
                "success": False,
                "error": "题目草稿已保存，但安全检查暂时无法启动。",
                "draft": draft_view(draft),
                "job": _authoring_job_view(job),
            }, 503
        return {
            "success": True,
            "draft": draft_view(draft),
            "job": _authoring_job_view(job),
        }, 202


@learning_namespace.route("/dojos/<dojo>/authoring")
class LearningAuthoring(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo):
        drafts = [
            draft
            for draft in (
            LearningDrafts.query.filter_by(dojo_id=dojo.dojo_id)
            .filter(LearningDrafts.status != "DELETED")
            .order_by(LearningDrafts.updated.desc())
            .limit(300)
            .all()
            )
            if is_supported_exercise((draft.spec or {}).get("exerciseMode"))
        ][:100]
        return {"success": True, "drafts": [draft_view(draft) for draft in drafts]}

    @authed_only
    @dojo_route
    @dojo_admins_only
    def post(self, dojo):
        data = request.get_json(silent=True) or {}
        brief = str(data.get("brief") or "").strip()
        module_id = str(data.get("moduleId") or "")
        if len(brief) < 12:
            return {"success": False, "error": "题目需求至少需要 12 个字符"}, 400
        module = next((item for item in dojo.modules if item.id == module_id), None)
        if not module:
            return {"success": False, "error": "目标模块不存在"}, 404
        constraints = _container_authoring_constraints(data.get("constraints"))
        title = next((line.strip() for line in brief.splitlines() if line.strip()), brief)
        job, error = _queue_authoring_job(
            dojo=dojo,
            module=module,
            author=get_current_user(),
            title=title,
            request_json={
                "brief": brief[:24000],
                "constraints": constraints,
            },
        )
        if error:
            return {
                "success": False,
                "error": "无法启动出题后台任务。",
                "job": _authoring_job_view(job),
            }, 503
        return {
            "success": True,
            "job": _authoring_job_view(job),
        }, 202


@learning_namespace.route("/dojos/<dojo>/authoring/jobs")
class LearningAuthoringJobCollection(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo):
        jobs = (
            LearningAuthoringJobs.query.filter_by(dojo_id=dojo.dojo_id)
            .order_by(LearningAuthoringJobs.created.desc())
            .limit(300)
            .all()
        )
        return {
            "success": True,
            "jobs": [
                _authoring_job_view(job)
                for job in jobs
                if _supported_authoring_job(job)
            ][:100],
        }

    @authed_only
    @dojo_route
    @dojo_admins_only
    def post(self, dojo):
        data = request.get_json(silent=True) or {}
        brief = str(data.get("brief") or "").strip()
        module_id = str(data.get("moduleId") or "")
        if len(brief) < 12:
            return {"success": False, "error": "题目需求至少需要 12 个字符"}, 400
        module = next((item for item in dojo.modules if item.id == module_id), None)
        if not module:
            return {"success": False, "error": "目标模块不存在"}, 404
        constraints = _container_authoring_constraints(data.get("constraints"))
        title = next((line.strip() for line in brief.splitlines() if line.strip()), brief)
        job, error = _queue_authoring_job(
            dojo=dojo,
            module=module,
            author=get_current_user(),
            title=title,
            request_json={
                "brief": brief[:24000],
                "constraints": constraints,
            },
        )
        if error:
            return {
                "success": False,
                "error": "无法启动出题后台任务。",
                "job": _authoring_job_view(job),
            }, 503
        return {
            "success": True,
            "job": _authoring_job_view(job),
        }, 202


@learning_namespace.route("/authoring/jobs/<job_id>")
class LearningAuthoringJobDetail(Resource):
    @authed_only
    def get(self, job_id):
        return {
            "success": True,
            "job": _authoring_job_view(_authoring_job_or_404(job_id)),
        }

    @authed_only
    def delete(self, job_id):
        job = _authoring_job_or_404(job_id)
        if job.status not in {"COMPLETED", "FAILED", "CANCELED"}:
            return {
                "success": False,
                "error": "生成任务仍在运行，请等待任务结束后再删除。",
            }, 409
        actor = get_current_user()
        deleted_draft = None
        try:
            if job.draft_id:
                draft = LearningDrafts.query.get(job.draft_id)
                if draft is not None:
                    deleted_draft = delete_draft(draft, actor)
            db.session.add(
                LearningAuditEvents(
                    actor_id=actor.id,
                    action="authoring.job.delete",
                    resource_type="learning_authoring_job",
                    resource_id=job.id,
                    outcome="ALLOW",
                    details={
                        "dojoId": job.dojo.reference_id,
                        "status": job.status,
                        "draftId": (
                            deleted_draft.get("draftId")
                            if deleted_draft
                            else None
                        ),
                    },
                )
            )
            db.session.delete(job)
            db.session.commit()
        except (PermissionError, ValueError) as error:
            db.session.rollback()
            return {
                "success": False,
                "error": str(error),
            }, 403 if isinstance(error, PermissionError) else 409
        return {
            "success": True,
            "deleted": {
                "jobId": job_id,
                "draft": deleted_draft,
            },
            "message": (
                "生成失败的题目已删除。"
                if deleted_draft
                else "失败任务记录已删除。"
            ),
        }


@learning_namespace.route("/drafts/<draft_id>/authoring/jobs")
class LearningDraftRevisionJob(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        active_job = LearningAuthoringJobs.query.filter(
            LearningAuthoringJobs.draft_id == draft.id,
            LearningAuthoringJobs.status.in_(("QUEUED", "RUNNING")),
        ).first()
        if active_job:
            return {
                "success": False,
                "error": "该草稿已有自主修订任务正在进行。",
                "job": _authoring_job_view(active_job),
            }, 409
        data = request.get_json(silent=True) or {}
        message = str(data.get("message") or "").strip()
        if not message:
            return {"success": False, "error": "修订要求不能为空。"}, 400
        prior_status = draft.status
        prior_validation = draft.validation
        draft.status = "BUILDING"
        draft.validation = {}
        db.session.commit()
        module = DojoModules.query.filter_by(
            dojo_id=draft.dojo_id,
            module_index=draft.module_index,
        ).one()
        job, error = _queue_authoring_job(
            dojo=draft.dojo,
            module=module,
            author=get_current_user(),
            title=f"修订：{(draft.spec or {}).get('name') or draft.brief}",
            kind="REVISE",
            draft_id=draft.id,
            request_json={"message": message[:12000]},
        )
        if error:
            draft.status = prior_status
            draft.validation = prior_validation
            db.session.commit()
            return {
                "success": False,
                "error": "无法启动自主修订任务。",
                "job": _authoring_job_view(job),
            }, 503
        return {"success": True, "job": _authoring_job_view(job)}, 202


@learning_namespace.route("/dojos/<dojo>/imports")
class LearningPackageImport(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def post(self, dojo):
        data = request.get_json(silent=True) or {}
        package = data.get("package")
        module_id = str(data.get("moduleId") or "")
        module = next((item for item in dojo.modules if item.id == module_id), None)
        if not module or not isinstance(package, dict):
            return {"success": False, "error": "需要有效的 moduleId 和 package 对象"}, 400
        metadata = package.get("metadata") if isinstance(package.get("metadata"), dict) else {}
        spec = package.get("spec") if isinstance(package.get("spec"), dict) else package
        runtime = spec.get("runtime") if isinstance(spec.get("runtime"), dict) else {}
        constraints = {
            "id": metadata.get("slug") or metadata.get("name") or spec.get("id"),
            "title": metadata.get("title") or spec.get("title") or spec.get("name"),
            "description": spec.get("description") or package.get("description"),
            "category": spec.get("category"),
            "difficulty": spec.get("difficulty"),
            "objectives": spec.get("objectives") or spec.get("learningObjectives"),
            "tags": metadata.get("tags") or spec.get("tags"),
            "image": runtime.get("image") or spec.get("image"),
            "interfaces": runtime.get("interfaces") or spec.get("interfaces"),
            "exerciseMode": (
                spec.get("exerciseMode")
                or runtime.get("mode")
            ),
            "simulation": spec.get("simulation"),
            "starterFiles": spec.get("starterFiles") or [],
            "verificationAnswer": spec.get("verificationAnswer"),
            "externalPackage": {
                "apiVersion": package.get("apiVersion"),
                "kind": package.get("kind"),
            },
        }
        requested_mode = str(constraints.get("exerciseMode") or "CONTAINER").upper()
        if not is_supported_exercise(requested_mode):
            return {
                "success": False,
                "error": "题目包的 exerciseMode 无效。",
                "code": "INVALID_EXERCISE_MODE",
            }, 400
        brief = str(
            data.get("brief")
            or constraints["description"]
            or constraints["title"]
            or "Imported security challenge package"
        )
        normalized_constraints = {
            key: value for key, value in constraints.items() if value is not None
        }
        job, error = _queue_authoring_job(
            dojo=dojo,
            module=module,
            author=get_current_user(),
            title=str(normalized_constraints.get("title") or "导入题目包")[:240],
            request_json={
                "brief": brief[:24000],
                "constraints": normalized_constraints,
                "level": "L3",
            },
        )
        if error:
            return {
                "success": False,
                "error": "无法启动题目包导入任务。",
                "job": _authoring_job_view(job),
            }, 503
        return {"success": True, "job": _authoring_job_view(job)}, 202


@learning_namespace.route("/drafts/<draft_id>")
class LearningDraftDetail(Resource):
    @authed_only
    def get(self, draft_id):
        return {"success": True, "draft": draft_view(_draft_or_404(draft_id))}

    @authed_only
    def patch(self, draft_id):
        draft = _draft_or_404(draft_id)
        if draft.published_challenge_id is not None or draft.status == "PUBLISHED":
            return {
                "success": False,
                "error": "已发布题目请在课程题目管理中修改名称。",
            }, 409
        active_job = LearningAuthoringJobs.query.filter(
            LearningAuthoringJobs.draft_id == draft.id,
            LearningAuthoringJobs.status.in_(("QUEUED", "RUNNING")),
        ).first()
        if active_job:
            return {
                "success": False,
                "error": "该草稿仍在生成或检查，完成后才能修改或移动。",
            }, 409
        body = request.get_json(silent=True)
        body = body if isinstance(body, dict) else {}
        has_name = "name" in body
        has_module = "moduleIndex" in body
        if not has_name and not has_module:
            return {"success": False, "error": "没有可保存的题目变更。"}, 400
        name = str(body.get("name") or "").strip()
        if has_name:
            if not 1 <= len(name) <= 128:
                return {"success": False, "error": "题目名称需包含 1-128 个字符。"}, 400
            spec = copy.deepcopy(draft.spec or {})
            spec["name"] = name
            draft.spec = spec
        previous_module_index = draft.module_index
        if has_module:
            try:
                module_index = int(body.get("moduleIndex"))
            except (TypeError, ValueError):
                return {"success": False, "error": "目标章节无效。"}, 400
            module = DojoModules.query.filter_by(
                dojo_id=draft.dojo_id,
                module_index=module_index,
            ).first()
            if module is None:
                return {"success": False, "error": "目标章节不存在，请刷新页面后重试。"}, 404
            draft.module_index = module_index
        draft.updated = datetime.datetime.utcnow()
        db.session.add(
            LearningAuditEvents(
                actor_id=get_current_user().id,
                action="authoring.draft.update",
                resource_type="learning_draft",
                resource_id=draft.id,
                outcome="ALLOW",
                details={
                    "dojoId": draft.dojo_id,
                    "moduleIndex": draft.module_index,
                    "previousModuleIndex": previous_module_index,
                    "revision": draft.revision,
                    "changedFields": [
                        key
                        for key, changed in (("name", has_name), ("moduleIndex", has_module))
                        if changed
                    ],
                },
            )
        )
        db.session.commit()
        return {
            "success": True,
            "data": {"draft": draft_view(draft, include_private=False)},
        }

    @authed_only
    def delete(self, draft_id):
        draft = _draft_or_404(draft_id)
        try:
            deleted = delete_draft(draft, get_current_user())
            db.session.commit()
        except (PermissionError, ValueError) as error:
            db.session.rollback()
            return {
                "success": False,
                "error": str(error),
            }, 403 if isinstance(error, PermissionError) else 409
        return {
            "success": True,
            "deleted": deleted,
            "message": "未发布题目已删除。",
        }

    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        active_job = LearningAuthoringJobs.query.filter(
            LearningAuthoringJobs.draft_id == draft.id,
            LearningAuthoringJobs.status.in_(("QUEUED", "RUNNING")),
        ).first()
        if active_job:
            return {
                "success": False,
                "error": "该草稿已有自主任务正在进行。",
                "job": _authoring_job_view(active_job),
            }, 409
        data = request.get_json(silent=True) or {}
        message = str(data.get("message") or "").strip()
        if not message:
            return {"success": False, "error": "教师消息不能为空"}, 400
        prior_status = draft.status
        prior_validation = draft.validation
        draft.status = "BUILDING"
        draft.validation = {}
        db.session.commit()
        module = DojoModules.query.filter_by(
            dojo_id=draft.dojo_id,
            module_index=draft.module_index,
        ).one()
        job, error = _queue_authoring_job(
            dojo=draft.dojo,
            module=module,
            author=get_current_user(),
            title=f"修订：{(draft.spec or {}).get('name') or draft.brief}",
            kind="REVISE",
            draft_id=draft.id,
            request_json={"message": message[:12000]},
        )
        if error:
            draft.status = prior_status
            draft.validation = prior_validation
            db.session.commit()
            return {
                "success": False,
                "error": "无法启动自主修订任务。",
                "job": _authoring_job_view(job),
            }, 503
        return {"success": True, "job": _authoring_job_view(job)}, 202


@learning_namespace.route("/drafts/<draft_id>/student-preview")
class LearningDraftStudentPreview(Resource):
    @authed_only
    def get(self, draft_id):
        return {
            "success": True,
            "data": {
                "preview": draft_student_preview_view(_draft_or_404(draft_id)),
            },
        }


@learning_namespace.route("/drafts/<draft_id>/validate")
class LearningDraftValidation(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        if draft.status == "PUBLISHED":
            return {"success": False, "error": "已发布草稿无需重复验证。"}, 409
        active_job = LearningAuthoringJobs.query.filter(
            LearningAuthoringJobs.draft_id == draft.id,
            LearningAuthoringJobs.status.in_(("QUEUED", "RUNNING")),
        ).first()
        if active_job:
            return {
                "success": False,
                "error": "该草稿已有自主任务正在进行。",
                "job": _authoring_job_view(active_job),
            }, 409
        module = DojoModules.query.filter_by(
            dojo_id=draft.dojo_id,
            module_index=draft.module_index,
        ).one()
        job, error = _queue_authoring_job(
            dojo=draft.dojo,
            module=module,
            author=get_current_user(),
            title=f"复验：{(draft.spec or {}).get('name') or draft.brief}",
            kind="VALIDATE",
            draft_id=draft.id,
            request_json={},
        )
        if error:
            return {
                "success": False,
                "error": "无法启动自主复验任务。",
                "job": _authoring_job_view(job),
            }, 503
        return {"success": True, "job": _authoring_job_view(job)}, 202


@learning_namespace.route("/drafts/<draft_id>/publish")
class LearningDraftPublish(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        actor = get_current_user()
        try:
            challenge = publish_draft(draft, actor)
            db.session.commit()
        except DraftPublishBusy as error:
            db.session.rollback()
            return {
                "success": False,
                "error": str(error),
                "code": "PUBLISH_IN_PROGRESS",
                "retryAfterMs": 1200,
            }, 409
        except ValueError as error:
            db.session.rollback()
            return {"success": False, "error": str(error), "validation": draft.validation}, 400
        if not (challenge.image or "").startswith(
                (
                    "mac:",
                    "pwncollege-",
                    "pwncollege/",
                    "challenges.pwn.college/",
                )
            ):
            publish_image_pull(challenge.image, dojo_reference_id=challenge.dojo.reference_id)
        solution_run = (
            enqueue_solution_run(
                challenge,
                actor,
                app=current_app._get_current_object(),
            )
            if exercise_mode(challenge) != "SIMULATION"
            else None
        )
        return {
            "success": True,
            "challenge": catalog_item_view(challenge, include_private=True),
            "solutionRun": solution_run_view(solution_run) if solution_run else None,
            "workspaceUrl": (
                f"/{challenge.dojo.reference_id}/{challenge.module.id}/{challenge.id}"
            ),
        }


@learning_namespace.route("/attempts/current")
class CurrentLearningAttempt(Resource):
    @authed_only
    def get(self):
        user = get_current_user()
        challenge = get_current_dojo_challenge(user)
        attempt = active_attempt(user.id, challenge) if challenge else active_attempt(user.id)
        return {
            "success": True,
            "active": bool(attempt),
            "attempt": _attempt_view(attempt, include_evidence=True) if attempt else None,
        }

    @authed_only
    def delete(self):
        user = get_current_user()
        attempt = active_attempt(user.id)
        if attempt is None:
            return {"success": True, "data": {"cleared": False, "href": "/student"}}
        append_evidence(
            attempt,
            "lab.interrupted",
            {"reason": "student-cleared-stale-context"},
            trust_level=3,
        )
        attempt.status = "INTERRUPTED"
        attempt.completed = datetime.datetime.utcnow()
        db.session.commit()
        return {"success": True, "data": {"cleared": True, "href": "/student"}}


@learning_namespace.route("/attempts/<attempt_id>")
class LearningAttemptDetail(Resource):
    @authed_only
    def get(self, attempt_id):
        return {"success": True, "attempt": _attempt_view(_attempt_or_404(attempt_id), include_evidence=True)}

    @authed_only
    def post(self, attempt_id):
        attempt = _attempt_or_404(attempt_id)
        if attempt.user_id != get_current_user().id:
            abort(403)
        data = request.get_json(silent=True) or {}
        reflection = str(data.get("reflection") or "").strip()
        if reflection:
            save_reflection(attempt, reflection)
        if data.get("submit"):
            append_evidence(
                attempt,
                "attempt.submitted",
                {"reflectionCharacters": len(attempt.reflection or "")},
                trust_level=3,
            )
            attempt.submitted = datetime.datetime.utcnow()
            assessment = assess_attempt(attempt)
        else:
            assessment = None
        db.session.commit()
        return {
            "success": True,
            "attempt": _attempt_view(attempt, include_evidence=True),
            "assessment": assessment_view(assessment) if assessment else None,
        }


@learning_namespace.route("/attempts/<attempt_id>/assess")
class LearningAttemptAssessment(Resource):
    @authed_only
    def post(self, attempt_id):
        attempt = _attempt_or_404(attempt_id)
        if attempt.user_id != get_current_user().id and not _dojo_challenge_for_attempt(attempt).dojo.is_admin():
            abort(403)
        assessment = assess_attempt(
            attempt,
            reviewer_id=(get_current_user().id if attempt.user_id != get_current_user().id else None),
            source=("TEACHER_REVIEW" if attempt.user_id != get_current_user().id else "DETERMINISTIC"),
        )
        db.session.commit()
        return {"success": True, "assessment": assessment_view(assessment)}


@learning_namespace.route("/tutor")
class LearningTutor(Resource):
    @authed_only
    def post(self):
        user = get_current_user()
        data = request.get_json(silent=True) or {}
        question = str(data.get("question") or "").strip()
        challenge = get_current_dojo_challenge(user)
        attempt = active_attempt(user.id, challenge) if challenge else None
        if not attempt:
            return {"success": False, "error": "当前没有活动题目会话"}, 409
        if not question:
            return {"success": False, "error": "问题不能为空"}, 400
        profile = LearningChallengeProfiles.query.get(attempt.challenge_id)
        reply = tutor_reply(attempt, user, question, profile)
        db.session.commit()
        return {"success": True, "reply": reply}


def _guide_thread_or_404(thread_id, user):
    thread = LearningGuideThreads.query.get_or_404(thread_id)
    if thread.user_id != user.id:
        abort(403)
    return thread


@learning_namespace.route("/guide")
class LearningGuide(Resource):
    @authed_only
    def get(self):
        user = get_current_user()
        view = str(request.args.get("view") or "active").strip().lower()
        if view not in {"active", "archived", "all"}:
            return {"success": False, "error": "对话视图无效"}, 400
        query = LearningGuideThreads.query.filter_by(user_id=user.id)
        if view == "active":
            query = query.filter_by(status="ACTIVE")
        elif view == "archived":
            query = query.filter_by(status="ARCHIVED")
        rows = (
            query
            .order_by(LearningGuideThreads.updated.desc())
            .limit(120)
            .all()
        )
        text_query = str(request.args.get("q") or "").strip().casefold()
        if text_query:
            rows = [
                thread
                for thread in rows
                if text_query in str(thread.title or "").casefold()
                or any(
                    text_query in str(message.content or "").casefold()
                    for message in thread.messages[-12:]
                )
            ]
        threads = sorted(
            rows,
            key=lambda thread: (
                not bool((thread.context or {}).get("pinned")),
                -(thread.updated.timestamp() if thread.updated else 0),
            ),
        )[:60]
        requested = str(request.args.get("threadId") or "").strip()
        selected = _guide_thread_or_404(requested, user) if requested else None
        if selected is None and threads:
            selected = threads[0]
        profile = learning_profile_context(user)
        guide_skills = [
            {
                **item,
                "masteryState": mastery_state(
                    item.get("mastery"),
                    evidence_count=item.get("evidenceCount"),
                ),
            }
            for item in profile.get("skills") or []
        ]
        active = next(
            (
                attempt
                for attempt in profile.get("recentAttempts") or []
                if attempt.get("status") == "ACTIVE"
            ),
            None,
        )
        quick_prompts = [
            "根据我最近的学习情况，帮我安排下一次 45 分钟练习。",
            "我目前最薄弱的能力是什么？应该怎样补强？",
            "总结我最近几次练习的进步和重复出现的问题。",
        ]
        if active:
            quick_prompts.insert(
                0,
                f"我正在做“{active.get('exercise')}”，帮我梳理当前思路，但不要直接给答案。",
            )
        return {
            "success": True,
            "threads": [guide_thread_view(thread) for thread in threads],
            "thread": (
                guide_thread_view(selected, include_messages=True)
                if selected
                else None
            ),
            "profile": {
                "summary": profile.get("summary") or {},
                "activeAttempt": active,
                "weakestSkills": sorted(
                    guide_skills,
                    key=lambda item: (
                        item["masteryState"]["value"] is None,
                        item["masteryState"]["value"] or 0,
                    ),
                )[:3],
                "recommendations": (profile.get("recommendations") or [])[:4],
            },
            "referenceOptions": guide_reference_catalog(profile),
            "quickPrompts": quick_prompts,
            "workspace": student_agent_snapshot(user),
        }

    @authed_only
    def post(self):
        user = get_current_user()
        data = request.get_json(silent=True) or {}
        question = str(data.get("question") or "").strip()
        if not question:
            return {"success": False, "error": "问题不能为空"}, 400
        thread_id = str(data.get("threadId") or "").strip()
        thread = _guide_thread_or_404(thread_id, user) if thread_id else None
        if thread is not None and thread.status == "ARCHIVED":
            return {
                "success": False,
                "error": "该对话已归档，请恢复后再发送消息。",
            }, 409
        try:
            snapshot = student_agent_snapshot(user)
            result = guide_reply(
                user,
                question,
                thread,
                references=(
                    data.get("references")
                    if "references" in data
                    else None
                ),
                agent_context=snapshot,
            )
            tool_calls = resolve_tool_calls(question, result.get("toolCalls"))
            resolved_thread = LearningGuideThreads.query.filter_by(
                id=result["thread"]["id"],
                user_id=user.id,
            ).first()
            agent_actions, tool_errors = execute_student_tools(
                user,
                resolved_thread,
                question,
                tool_calls,
                snapshot,
            )
            assistant = LearningGuideMessages.query.filter_by(
                id=result["message"]["id"],
                thread_id=resolved_thread.id,
                user_id=user.id,
                role="assistant",
            ).first()
            if assistant is not None:
                assistant.metadata_json = {
                    **(assistant.metadata_json or {}),
                    "agentActions": agent_actions,
                    "toolErrors": tool_errors,
                }
                result["message"]["metadata"] = assistant.metadata_json
            resolved_thread.context = {
                **(resolved_thread.context or {}),
                "lastAgentActions": [
                    {key: action.get(key) for key in ("type", "id", "title", "url")}
                    for action in agent_actions
                ],
            }
            result["agentActions"] = agent_actions
            result["toolErrors"] = tool_errors
            result["workspace"] = student_agent_snapshot(user)
        except GuideReferenceSelectionError as exception:
            return {"success": False, "error": str(exception)}, 400
        except (ScopeError, ValueError) as exception:
            db.session.rollback()
            return {"success": False, "error": str(exception)}, 400
        db.session.commit()
        return {"success": True, **result}


@learning_namespace.route("/guide/threads")
class LearningGuideThreadCollection(Resource):
    @authed_only
    def post(self):
        thread = new_guide_thread(get_current_user())
        db.session.commit()
        return {
            "success": True,
            "thread": guide_thread_view(thread, include_messages=True),
        }, 201


@learning_namespace.route("/guide/threads/<thread_id>")
class LearningGuideThreadDetail(Resource):
    @authed_only
    def patch(self, thread_id):
        thread = _guide_thread_or_404(thread_id, get_current_user())
        data = request.get_json(silent=True) or {}
        action = str(data.get("action") or "").strip().lower()
        if action == "rename":
            title = str(data.get("title") or "").strip()
            if not title:
                return {"success": False, "error": "对话名称不能为空"}, 400
            thread.title = title[:160]
        elif action in {"pin", "unpin"}:
            thread.context = {
                **(thread.context or {}),
                "pinned": action == "pin",
            }
        elif action == "archive":
            thread.status = "ARCHIVED"
            thread.context = {**(thread.context or {}), "pinned": False}
        elif action == "restore":
            thread.status = "ACTIVE"
        else:
            return {"success": False, "error": "不支持的对话操作"}, 400
        db.session.commit()
        return {
            "success": True,
            "thread": guide_thread_view(thread, include_messages=True),
        }

    @authed_only
    def delete(self, thread_id):
        thread = _guide_thread_or_404(thread_id, get_current_user())
        db.session.delete(thread)
        db.session.commit()
        return {"success": True}


@learning_namespace.route("/guide/memory/<memory_id>")
class LearningGuideMemoryDetail(Resource):
    @authed_only
    def delete(self, memory_id):
        user = get_current_user()
        try:
            row = forget_memory(user, memory_id)
            db.session.commit()
            return {"success": True, "memory": memory_view(row)}
        except ScopeError as exception:
            db.session.rollback()
            return {"success": False, "error": str(exception)}, 404


@learning_namespace.route("/evidence")
class LearningEvidenceIngest(Resource):
    @authed_only_cli
    @authed_only
    def post(self):
        user = get_current_user()
        challenge = get_current_dojo_challenge(user)
        attempt = active_attempt(user.id, challenge) if challenge else None
        if not attempt:
            return {"success": False, "error": "当前 workspace 没有活动 attempt"}, 409
        data = request.get_json(silent=True) or {}
        event_type = str(data.get("type") or "")
        if event_type not in ALLOWED_WORKSPACE_EVENTS:
            return {"success": False, "error": "不允许的 workspace 证据类型"}, 400
        event = append_evidence(
            attempt,
            event_type,
            data.get("payload") if isinstance(data.get("payload"), dict) else {},
            source="WORKSPACE",
            trust_level=2,
        )
        db.session.commit()
        return {"success": True, "event": event_view(event)}


@learning_namespace.route("/assessments/<assessment_id>/appeals")
class LearningAssessmentAppeal(Resource):
    @authed_only
    def post(self, assessment_id):
        assessment = LearningAssessments.query.get_or_404(assessment_id)
        attempt = _attempt_or_404(assessment.attempt_id)
        user = get_current_user()
        if attempt.user_id != user.id:
            abort(403)
        reason = str((request.get_json(silent=True) or {}).get("reason") or "").strip()
        if len(reason) < 10:
            return {"success": False, "error": "申诉理由至少需要 10 个字符"}, 400
        appeal = LearningAppeals(assessment_id=assessment.id, user_id=user.id, reason=reason[:12000])
        db.session.add(appeal)
        db.session.commit()
        return {"success": True, "appeal": _appeal_view(appeal)}, 201


def _appeal_view(appeal):
    return {
        "id": appeal.id,
        "assessmentId": appeal.assessment_id,
        "attemptId": appeal.assessment.attempt_id,
        "userId": appeal.user_id,
        "username": appeal.user.name,
        "reason": appeal.reason,
        "status": appeal.status,
        "resolution": appeal.resolution,
        "reviewerId": appeal.reviewer_id,
        "created": appeal.created.isoformat() + "Z",
        "resolved": appeal.resolved.isoformat() + "Z" if appeal.resolved else None,
    }


@learning_namespace.route("/dojos/<dojo>/appeals")
class LearningDojoAppeals(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo):
        appeals = (
            LearningAppeals.query.join(LearningAssessments)
            .join(LearningAttempts)
            .filter(LearningAttempts.dojo_id == dojo.dojo_id)
            .order_by(LearningAppeals.created.desc())
            .all()
        )
        return {"success": True, "appeals": [_appeal_view(appeal) for appeal in appeals]}


@learning_namespace.route("/appeals/<appeal_id>")
class LearningAppealDetail(Resource):
    @authed_only
    def patch(self, appeal_id):
        appeal = LearningAppeals.query.get_or_404(appeal_id)
        attempt = appeal.assessment.attempt
        challenge = _dojo_challenge_for_attempt(attempt)
        if not challenge.dojo.is_admin(get_current_user()):
            abort(403)
        data = request.get_json(silent=True) or {}
        status = str(data.get("status") or "RESOLVED").upper()
        if status not in {"RESOLVED", "REJECTED"}:
            return {"success": False, "error": "状态必须是 RESOLVED 或 REJECTED"}, 400
        appeal.status = status
        appeal.resolution = str(data.get("resolution") or "")[:12000]
        appeal.reviewer_id = get_current_user().id
        appeal.resolved = datetime.datetime.utcnow()
        if status == "RESOLVED" and data.get("reassess", True):
            assessment = assess_attempt(attempt, reviewer_id=get_current_user().id, source="APPEAL_REVIEW")
            if appeal.resolution:
                assessment.feedback = appeal.resolution
        db.session.add(
            LearningAuditEvents(
                actor_id=get_current_user().id,
                action="appeal.resolve",
                resource_type="learning_appeal",
                resource_id=appeal.id,
                outcome="ALLOW",
                details={"status": status},
            )
        )
        db.session.commit()
        return {"success": True, "appeal": _appeal_view(appeal)}


@learning_namespace.route("/dojos/<dojo>/analytics")
class LearningAnalytics(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo):
        attempts = [
            attempt
            for attempt in LearningAttempts.query.filter_by(dojo_id=dojo.dojo_id).all()
            if _dojo_challenge_for_attempt(attempt) is not None
        ]
        participant_ids = sorted({attempt.user_id for attempt in attempts})
        attempt_ids = {attempt.id for attempt in attempts}
        users = {user.id: user for user in Users.query.filter(Users.id.in_(participant_ids)).all()} if participant_ids else {}
        latest_by_attempt = {}
        if attempt_ids:
            for assessment in (
                LearningAssessments.query.filter(
                    LearningAssessments.attempt_id.in_(attempt_ids)
                ).order_by(
                    LearningAssessments.attempt_id,
                    LearningAssessments.revision.desc(),
                )
            ):
                latest_by_attempt.setdefault(assessment.attempt_id, assessment)
        scores = [assessment.total_score for assessment in latest_by_attempt.values()]
        open_appeals = (
            LearningAppeals.query.join(LearningAssessments)
            .filter(
                LearningAssessments.attempt_id.in_(attempt_ids),
                LearningAppeals.status == "OPEN",
            )
            .count()
            if attempt_ids
            else 0
        )
        return {
            "success": True,
            "summary": {
                "participants": len(participant_ids),
                "attempts": len(attempts),
                "activeAttempts": sum(1 for attempt in attempts if attempt.status == "ACTIVE"),
                "averageScore": round(sum(scores) / len(scores), 1) if scores else 0,
                "openAppeals": open_appeals,
                "drafts": sum(
                    1
                    for draft in LearningDrafts.query.filter_by(
                        dojo_id=dojo.dojo_id
                    ).filter(LearningDrafts.status != "DELETED")
                    if is_supported_exercise(
                        (draft.spec or {}).get("exerciseMode")
                    )
                ),
            },
            "students": [
                {
                    "id": user_id,
                    "name": users[user_id].name if user_id in users else str(user_id),
                    "attempts": sum(1 for attempt in attempts if attempt.user_id == user_id),
                    "progress": _course_progress(dojo, users[user_id]) if user_id in users else None,
                    "skills": skill_states(user_id, dojo.dojo_id),
                }
                for user_id in participant_ids
            ],
            "recentAttempts": [
                _attempt_view(attempt)
                for attempt in sorted(attempts, key=lambda item: item.started, reverse=True)[:30]
            ],
        }

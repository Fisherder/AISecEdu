import datetime
import logging
import re
from concurrent.futures import ThreadPoolExecutor

from flask import abort, current_app, request
from flask_restx import Namespace, Resource
from sqlalchemy import func

from CTFd.models import Solves, Submissions, Users, db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ...learning.assessment import (
    assess_attempt,
    assessment_view,
    build_recommendations,
    skill_states,
)
from ...learning.authoring import (
    autonomously_validate_draft,
    catalog_item_view,
    create_draft,
    draft_view,
    publish_draft,
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
from ...learning.context import guide_reference_catalog, learning_profile_context
from ...learning.intelligence import (
    GuideReferenceSelectionError,
    guide_reply,
    guide_thread_view,
    new_guide_thread,
    tutor_reply,
)
from ...learning.solution_agent import (
    enqueue_solution_run,
    latest_solution_run,
    solution_run_view,
)
from ...models import (
    DojoChallenges,
    DojoModules,
    DojoUsers,
    LearningAppeals,
    LearningAssessments,
    LearningAttempts,
    LearningAuthoringJobs,
    LearningAuditEvents,
    LearningChallengeProfiles,
    LearningDrafts,
    LearningEvidenceEvents,
    LearningGuideThreads,
    LearningSimulationRuns,
    LearningTutorMessages,
)
from ...utils import is_challenge_locked
from ...utils.dojo import dojo_admins_only, dojo_route, get_current_dojo_challenge
from ...utils.image_pulls import publish_image_pull
from .user import authed_only_cli


learning_namespace = Namespace("learning", description="AISecEdu course learning services")
UNIT_ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")
logger = logging.getLogger(__name__)
_authoring_executor = ThreadPoolExecutor(
    max_workers=2,
    thread_name_prefix="aisecedu-authoring",
)
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


def _dojo_challenge_for_attempt(attempt):
    return DojoChallenges.query.filter_by(
        dojo_id=attempt.dojo_id,
        module_index=attempt.module_index,
        challenge_index=attempt.challenge_index,
    ).first()


def _can_access_attempt(attempt, user):
    challenge = _dojo_challenge_for_attempt(attempt)
    return challenge is not None and (attempt.user_id == user.id or challenge.dojo.is_admin(user))


def _attempt_or_404(attempt_id):
    attempt = LearningAttempts.query.get_or_404(attempt_id)
    if not _can_access_attempt(attempt, get_current_user()):
        abort(403)
    return attempt


def _draft_or_404(draft_id):
    draft = LearningDrafts.query.get_or_404(draft_id)
    if not draft.dojo.is_admin(get_current_user()):
        abort(403)
    return draft


def _authoring_job_or_404(job_id):
    job = LearningAuthoringJobs.query.get_or_404(job_id)
    if not job.dojo.is_admin(get_current_user()):
        abort(403)
    return job


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
    }


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
    if not job or job.status in {"COMPLETED", "FAILED"}:
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


def _run_authoring_job(app, job_id):
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

            if job.kind == "REVISE":
                draft = LearningDrafts.query.get(job.draft_id)
                if not draft:
                    raise ValueError("要修订的草稿不存在。")
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
            logger.exception("Background authoring job %s failed", job_id)
            db.session.rollback()
            job = LearningAuthoringJobs.query.get(job_id)
            if job:
                steps = [dict(item) for item in (job.steps or [])]
                for step in steps:
                    if step.get("id") == job.stage:
                        step["status"] = "FAILED"
                        step["message"] = "该阶段执行失败，已保留此前的完整进度。"
                        break
                job.steps = steps
                job.status = "FAILED"
                job.error = str(exception)[:4000]
                job.completed = datetime.datetime.utcnow()
                if job.draft_id:
                    draft = LearningDrafts.query.get(job.draft_id)
                    if draft and draft.status == "BUILDING":
                        draft.status = "DRAFT"
                db.session.commit()
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
    db.session.commit()
    app = current_app._get_current_object()
    try:
        _authoring_executor.submit(_run_authoring_job, app, job.id)
    except Exception as exception:
        job.status = "FAILED"
        job.error = str(exception)[:4000]
        job.completed = datetime.datetime.utcnow()
        db.session.commit()
        return job, exception
    return job, None


def _attempt_view(attempt, *, include_evidence=False):
    challenge = _dojo_challenge_for_attempt(attempt)
    simulation_run = LearningSimulationRuns.query.filter_by(
        attempt_id=attempt.id
    ).first()
    latest = (
        LearningAssessments.query.filter_by(attempt_id=attempt.id)
        .order_by(LearningAssessments.revision.desc())
        .first()
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
        "simulationRunId": simulation_run.id if simulation_run else None,
        "challengeUrl": (
            f"/{challenge.dojo.reference_id}/{challenge.module.id}/{challenge.id}"
        ),
        "courseLearningUrl": f"/dojo/{challenge.dojo.reference_id}/learning",
        "scoreUrl": f"/learning/attempts/{attempt.id}/score",
        "challengeVersion": ((attempt.data or {}).get("runtime") or {}).get(
            "challengeVersion", 1
        ),
        "epoch": attempt.epoch,
        "mode": attempt.mode,
        "status": attempt.status,
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
        result["evidenceChain"] = verify_evidence_chain(attempt.id)
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
        if challenge.required
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
    return {
        "completed": completed,
        "total": len(required),
        "percent": round(completed / len(required) * 100, 1) if required else 0,
    }


def _course_view(dojo, user, membership, solved_challenge_ids, submission_count):
    is_teacher = user.type == "admin" or bool(
        membership and membership.type == "admin"
    )
    modules = []
    all_items = []
    for module in dojo.modules:
        if not is_teacher and not module.visible():
            continue
        challenges = module.challenges if is_teacher else module.visible_challenges()
        published_items = [
            {
                "id": challenge.id,
                "name": challenge.name,
                "required": challenge.required,
                "completed": challenge.challenge_id in solved_challenge_ids,
                "locked": is_challenge_locked(challenge, user),
                "allowPrivileged": challenge.allow_privileged,
                "exerciseMode": challenge.exercise_mode,
                "workspaceUrl": (
                    f"/{dojo.reference_id}/{module.id}/{challenge.id}"
                ),
            }
            for challenge in challenges
        ]
        all_items.extend(published_items)
        required_items = [item for item in published_items if item["required"]]
        completed = sum(item["completed"] for item in required_items)
        modules.append(
            {
                "id": module.id,
                "name": module.name,
                "description": module.description,
                "publishedItems": published_items,
                "progress": {
                    "completed": completed,
                    "total": len(required_items),
                    "percent": (
                        round(completed / len(required_items) * 100, 1)
                        if required_items
                        else 0
                    ),
                },
            }
        )

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
        "moduleCount": len(modules),
        "publishedItemCount": len(all_items),
        "progress": _course_progress(dojo, user, solved_challenge_ids),
        "submissionCount": submission_count,
        "solveCount": sum(item["completed"] for item in all_items),
        "nextItem": next_item,
        "modules": modules,
        "courseUrl": f"/{dojo.reference_id}",
        "learningUrl": f"/dojo/{dojo.reference_id}/learning",
        "studioUrl": f"/dojo/{dojo.reference_id}/studio" if is_teacher else None,
    }


@learning_namespace.route("/overview")
class LearningOverview(Resource):
    @authed_only
    def get(self):
        user = get_current_user()
        from ...models import Dojos

        dojos = Dojos.viewable(user=user).all()
        dojo_ids = [dojo.dojo_id for dojo in dojos]
        memberships = {
            membership.dojo_id: membership
            for membership in DojoUsers.query.filter(
                DojoUsers.user_id == user.id,
                DojoUsers.dojo_id.in_(dojo_ids),
            ).all()
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
            )
            for dojo in dojos
        ]
        enrolled_courses = [course for course in courses if course["enrolled"]]
        available_courses = [course for course in courses if not course["enrolled"]]
        active = active_attempt(user.id)
        return {
            "success": True,
            "courses": courses,
            "enrolledCourses": enrolled_courses,
            "availableCourses": available_courses,
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
            "activeAttempt": _attempt_view(active) if active else None,
        }


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
                "assessment": "60/40",
                "evidence": "hash-chain/S1-S4",
                "tutor": "Socratic hints / anti-leak",
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


@learning_namespace.route(
    "/dojos/<dojo>/solutions/<module_id>/<challenge_id>"
)
class LearningVerifiedSolution(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo, module_id, challenge_id):
        challenge = next(
            (
                item
                for module in dojo.modules
                if module.id == module_id
                for item in module.challenges
                if item.id == challenge_id
            ),
            None,
        )
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
        challenge = next(
            (
                item
                for module in dojo.modules
                if module.id == module_id
                for item in module.challenges
                if item.id == challenge_id
            ),
            None,
        )
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
        unit_id = str(data.get("id") or "").strip().lower()
        name = str(data.get("name") or "").strip()
        description = str(data.get("description") or "").strip()

        if not UNIT_ID_PATTERN.fullmatch(unit_id):
            return {
                "success": False,
                "error": "单元 ID 必须由 1–32 个小写字母、数字或连字符组成。",
            }, 400
        if not 1 <= len(name) <= 128:
            return {
                "success": False,
                "error": "单元名称必须包含 1–128 个字符。",
            }, 400
        if len(description) > 24000:
            return {
                "success": False,
                "error": "单元简介不能超过 24,000 个字符。",
            }, 400
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


@learning_namespace.route("/dojos/<dojo>/authoring")
class LearningAuthoring(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo):
        drafts = (
            LearningDrafts.query.filter_by(dojo_id=dojo.dojo_id)
            .order_by(LearningDrafts.updated.desc())
            .limit(100)
            .all()
        )
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
        draft = create_draft(
            dojo,
            module,
            get_current_user(),
            brief,
            constraints=data.get("constraints"),
        )
        validation = autonomously_validate_draft(draft)
        db.session.commit()
        return {
            "success": validation["status"] == "PASS",
            "draft": draft_view(draft),
            "validation": validation,
        }, 201


@learning_namespace.route("/dojos/<dojo>/authoring/jobs")
class LearningAuthoringJobCollection(Resource):
    @authed_only
    @dojo_route
    @dojo_admins_only
    def get(self, dojo):
        jobs = (
            LearningAuthoringJobs.query.filter_by(dojo_id=dojo.dojo_id)
            .order_by(LearningAuthoringJobs.created.desc())
            .limit(100)
            .all()
        )
        return {
            "success": True,
            "jobs": [_authoring_job_view(job) for job in jobs],
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
        constraints = data.get("constraints")
        if not isinstance(constraints, dict):
            constraints = {}
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


@learning_namespace.route("/drafts/<draft_id>/authoring/jobs")
class LearningDraftRevisionJob(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        if draft.status == "PUBLISHED":
            return {"success": False, "error": "已发布草稿不能继续修订。"}, 409
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
        brief = str(
            data.get("brief")
            or constraints["description"]
            or constraints["title"]
            or "Imported security challenge package"
        )
        draft = create_draft(
            dojo,
            module,
            get_current_user(),
            brief,
            level="L3",
            constraints={key: value for key, value in constraints.items() if value is not None},
        )
        report = autonomously_validate_draft(draft)
        db.session.commit()
        return {"success": True, "draft": draft_view(draft), "validation": report}, 201


@learning_namespace.route("/drafts/<draft_id>")
class LearningDraftDetail(Resource):
    @authed_only
    def get(self, draft_id):
        return {"success": True, "draft": draft_view(_draft_or_404(draft_id))}

    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        data = request.get_json(silent=True) or {}
        message = str(data.get("message") or "").strip()
        if not message:
            return {"success": False, "error": "教师消息不能为空"}, 400
        revise_draft(draft, message)
        validation = autonomously_validate_draft(draft)
        db.session.commit()
        return {
            "success": validation["status"] == "PASS",
            "draft": draft_view(draft),
            "validation": validation,
        }


@learning_namespace.route("/drafts/<draft_id>/validate")
class LearningDraftValidation(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        report = autonomously_validate_draft(draft)
        db.session.commit()
        return {"success": report["status"] == "PASS", "validation": report}


@learning_namespace.route("/drafts/<draft_id>/publish")
class LearningDraftPublish(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        actor = get_current_user()
        try:
            challenge = publish_draft(draft, actor)
            db.session.commit()
        except ValueError as error:
            db.session.rollback()
            return {"success": False, "error": str(error), "validation": draft.validation}, 400
        if (
            challenge.exercise_mode != "SIMULATION"
            and not challenge.image.startswith(
                (
                    "mac:",
                    "pwncollege-",
                    "pwncollege/",
                    "challenges.pwn.college/",
                )
            )
        ):
            publish_image_pull(challenge.image, dojo_reference_id=challenge.dojo.reference_id)
        solution_run = enqueue_solution_run(
            challenge,
            actor,
            app=current_app._get_current_object(),
        )
        return {
            "success": True,
            "challenge": catalog_item_view(challenge, include_private=True),
            "solutionRun": solution_run_view(solution_run),
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
        threads = (
            LearningGuideThreads.query.filter_by(user_id=user.id, status="ACTIVE")
            .order_by(LearningGuideThreads.updated.desc())
            .limit(60)
            .all()
        )
        requested = str(request.args.get("threadId") or "").strip()
        selected = (
            _guide_thread_or_404(requested, user)
            if requested
            else threads[0]
            if threads
            else None
        )
        profile = learning_profile_context(user)
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
                    profile.get("skills") or [],
                    key=lambda item: item.get("mastery", 0),
                )[:3],
                "recommendations": (profile.get("recommendations") or [])[:4],
            },
            "referenceOptions": guide_reference_catalog(profile),
            "quickPrompts": quick_prompts,
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
        try:
            result = guide_reply(
                user,
                question,
                thread,
                references=(
                    data.get("references")
                    if "references" in data
                    else None
                ),
            )
        except GuideReferenceSelectionError as exception:
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
    def delete(self, thread_id):
        thread = _guide_thread_or_404(thread_id, get_current_user())
        db.session.delete(thread)
        db.session.commit()
        return {"success": True}


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
        attempts = LearningAttempts.query.filter_by(dojo_id=dojo.dojo_id).all()
        participant_ids = sorted({attempt.user_id for attempt in attempts})
        users = {user.id: user for user in Users.query.filter(Users.id.in_(participant_ids)).all()} if participant_ids else {}
        latest_by_attempt = {}
        for assessment in (
            LearningAssessments.query.join(LearningAttempts)
            .filter(LearningAttempts.dojo_id == dojo.dojo_id)
            .order_by(LearningAssessments.attempt_id, LearningAssessments.revision.desc())
        ):
            latest_by_attempt.setdefault(assessment.attempt_id, assessment)
        scores = [assessment.total_score for assessment in latest_by_attempt.values()]
        open_appeals = (
            LearningAppeals.query.join(LearningAssessments)
            .join(LearningAttempts)
            .filter(LearningAttempts.dojo_id == dojo.dojo_id, LearningAppeals.status == "OPEN")
            .count()
        )
        return {
            "success": True,
            "summary": {
                "participants": len(participant_ids),
                "attempts": len(attempts),
                "activeAttempts": sum(1 for attempt in attempts if attempt.status == "ACTIVE"),
                "averageScore": round(sum(scores) / len(scores), 1) if scores else 0,
                "openAppeals": open_appeals,
                "drafts": LearningDrafts.query.filter_by(dojo_id=dojo.dojo_id).count(),
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

import datetime
import re

from flask import abort, request
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
    catalog_item_view,
    create_draft,
    draft_view,
    publish_draft,
    revise_draft,
    validate_draft,
)
from ...learning.evidence import (
    ALLOWED_WORKSPACE_EVENTS,
    active_attempt,
    append_evidence,
    event_view,
    save_reflection,
    verify_evidence_chain,
)
from ...learning.intelligence import tutor_reply
from ...models import (
    DojoChallenges,
    DojoModules,
    DojoUsers,
    LearningAppeals,
    LearningAssessments,
    LearningAttempts,
    LearningAuditEvents,
    LearningChallengeProfiles,
    LearningDrafts,
    LearningEvidenceEvents,
    LearningTutorMessages,
)
from ...utils import is_challenge_locked
from ...utils.dojo import dojo_admins_only, dojo_route, get_current_dojo_challenge
from ...utils.image_pulls import publish_image_pull
from .user import authed_only_cli


learning_namespace = Namespace("learning", description="AISecEdu course learning services")
UNIT_ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")


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


def _attempt_view(attempt, *, include_evidence=False):
    challenge = _dojo_challenge_for_attempt(attempt)
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
        "challengeName": challenge.name,
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
        return {
            "success": True,
            "items": [
                catalog_item_view(challenge, include_private=include_private)
                for challenge in dojo.challenges
                if include_private or challenge.visible()
            ],
        }


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
                "error": "Unit ID must be 1–32 lowercase letters, numbers, or hyphens.",
            }, 400
        if not 1 <= len(name) <= 128:
            return {
                "success": False,
                "error": "Unit name must contain 1–128 characters.",
            }, 400
        if len(description) > 24000:
            return {
                "success": False,
                "error": "Unit description must not exceed 24,000 characters.",
            }, 400
        if DojoModules.query.filter_by(dojo_id=dojo.dojo_id, id=unit_id).first():
            return {
                "success": False,
                "error": "A unit with this ID already exists in the course.",
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
            level=data.get("level", "L2"),
            constraints=data.get("constraints"),
        )
        db.session.commit()
        return {"success": True, "draft": draft_view(draft)}, 201


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
        report = validate_draft(draft)
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
        db.session.commit()
        return {"success": True, "draft": draft_view(draft)}


@learning_namespace.route("/drafts/<draft_id>/validate")
class LearningDraftValidation(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        report = validate_draft(draft)
        db.session.commit()
        return {"success": report["status"] == "PASS", "validation": report}


@learning_namespace.route("/drafts/<draft_id>/publish")
class LearningDraftPublish(Resource):
    @authed_only
    def post(self, draft_id):
        draft = _draft_or_404(draft_id)
        try:
            challenge = publish_draft(draft, get_current_user())
            db.session.commit()
        except ValueError as error:
            db.session.rollback()
            return {"success": False, "error": str(error), "validation": draft.validation}, 400
        if not challenge.image.startswith(("mac:", "pwncollege-", "pwncollege/", "challenges.pwn.college/")):
            publish_image_pull(challenge.image, dojo_reference_id=challenge.dojo.reference_id)
        return {
            "success": True,
            "challenge": catalog_item_view(challenge, include_private=True),
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
            return {"success": False, "error": "当前没有活动靶场 attempt"}, 409
        if not question:
            return {"success": False, "error": "问题不能为空"}, 400
        profile = LearningChallengeProfiles.query.get(attempt.challenge_id)
        reply = tutor_reply(attempt, user, question, profile)
        db.session.commit()
        return {"success": True, "reply": reply}


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

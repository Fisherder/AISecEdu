import datetime
import math
import re

from CTFd.models import Solves, db

from .config import DOJO_AI_AUTHORING_PLAN_MODEL, DOJO_AI_GRADER_MODEL
from .learning.intelligence import model_json
from .learning.grading import build_open_grade_questions, map_open_grade_rows
from .models import (
    DojoAdmins,
    DojoChallenges,
    DojoUsers,
    LearningAuditEvents,
    TeachingAssignmentItems,
    TeachingAssignments,
    TeachingAssignmentSubmissions,
)
from .agent_runtime.scope import ScopeError, dojo_for_user, validate_module
from .learning.student_experience import activity_state, assessment_state


ASSIGNMENT_KINDS = {"HOMEWORK", "QUIZ", "PRACTICE", "LAB", "DEBATE"}
ASSIGNMENT_STATUSES = {"DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"}
ITEM_TYPES = {
    "CHALLENGE",
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "SHORT_ANSWER",
    "DEBATE",
    "ARTIFACT",
}


def utcnow():
    return datetime.datetime.utcnow()


def parse_datetime(value, *, field="date"):
    if value in {None, ""}:
        return None
    if isinstance(value, datetime.datetime):
        parsed = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.datetime.fromisoformat(text)
        except ValueError as exc:
            raise ValueError(f"{field} must be an ISO-8601 date") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return parsed


def timestamp(value):
    return value.isoformat() + "Z" if value else None


def is_teacher(user, dojo_id):
    return bool(
        user
        and (
            getattr(user, "type", None) == "admin"
            or DojoAdmins.query.filter_by(dojo_id=dojo_id, user_id=user.id).first()
            is not None
        )
    )


def student_dojo(user, dojo_id):
    dojo = dojo_for_user(user, dojo_id, teacher=False)
    if getattr(user, "type", None) == "admin":
        return dojo
    membership = DojoUsers.query.filter_by(dojo_id=dojo.dojo_id, user_id=user.id).first()
    if membership is None:
        raise ScopeError("Course assignment not found")
    return dojo


def assignment_for_teacher(assignment_id, user, *, lock=False):
    query = TeachingAssignments.query.filter_by(id=str(assignment_id))
    if lock:
        query = query.with_for_update()
    assignment = query.first()
    if assignment is None:
        raise ScopeError("Assignment not found")
    dojo_for_user(user, assignment.dojo_id, teacher=True)
    return assignment


def assignment_for_student(assignment_id, user, *, lock=False):
    query = TeachingAssignments.query.filter(
        TeachingAssignments.id == str(assignment_id),
        TeachingAssignments.status.in_(["PUBLISHED", "CLOSED"]),
    )
    if lock:
        query = query.with_for_update()
    assignment = query.first()
    if assignment is None:
        raise ScopeError("Assignment not found")
    student_dojo(user, assignment.dojo_id)
    return assignment


def normalize_kind(value):
    result = str(value or "HOMEWORK").strip().upper().replace("-", "_")
    if result not in ASSIGNMENT_KINDS:
        raise ValueError("Unsupported assignment kind")
    return result


def normalize_item_type(value):
    result = str(value or "SHORT_ANSWER").strip().upper().replace("-", "_")
    if result not in ITEM_TYPES:
        raise ValueError("Unsupported assignment item type")
    return result


def _bounded_text(value, limit, field):
    result = str(value or "").strip()
    if len(result) > limit:
        raise ValueError(f"{field} exceeds {limit} characters")
    return result


def _challenge_link(assignment, item):
    if not item.challenge_id:
        return None
    row = DojoChallenges.query.filter_by(
        dojo_id=assignment.dojo_id,
        challenge_id=item.challenge_id,
    ).first()
    if row is None:
        return None
    return {
        "id": row.challenge_id,
        "name": row.name or row.id,
        "moduleIndex": row.module_index,
        "challengeIndex": row.challenge_index,
        "url": f"/{assignment.dojo.reference_id}/{row.module.id}/{row.id}",
    }


def _item_view(
    assignment,
    item,
    *,
    teacher=False,
    result=None,
    expose_answer=False,
):
    config = dict(item.config or {})
    public_config = {
        key: config[key]
        for key in ("choices", "allowMultiple", "placeholder", "minLength", "maxLength")
        if key in config
    }
    if teacher or expose_answer:
        public_config.update(
            {
                key: config[key]
                for key in ("referenceAnswer", "correctAnswer", "keywords", "rubric", "explanation")
                if key in config
            }
        )
    view = {
        "id": item.id,
        "position": item.position,
        "type": item.item_type,
        "title": item.title,
        "prompt": item.prompt,
        "points": float(item.points),
        "required": bool(item.required),
        "challenge": _challenge_link(assignment, item),
        "artifactId": item.artifact_id,
        "config": public_config,
    }
    if result is not None:
        view["result"] = result
    return view


def _submission_view(submission, *, include_answers=False):
    if submission is None:
        return None
    normalized_activity = activity_state(submission.status)
    normalized_assessment = assessment_state(
        "READY" if submission.status == "GRADED" else None,
        activity=normalized_activity,
    )
    score_ready = normalized_assessment == "READY"
    result = {
        "id": submission.id,
        "studentId": submission.student_id,
        "studentName": submission.student.name if submission.student else str(submission.student_id),
        "status": submission.status,
        "activityState": normalized_activity,
        "assessmentState": normalized_assessment,
        "objectiveScore": float(submission.objective_score),
        "aiScore": float(submission.ai_score),
        "score": float(submission.total_score) if score_ready else None,
        "maxScore": float(submission.max_score),
        "percent": (
            round(100 * submission.total_score / submission.max_score, 1)
            if score_ready and submission.max_score
            else None
        ),
        "trustScore": float(submission.trust_score),
        "feedback": submission.feedback,
        "submittedAt": timestamp(submission.submitted_at),
        "gradedAt": timestamp(submission.graded_at),
        "started": timestamp(submission.started),
        "updated": timestamp(submission.updated),
    }
    if include_answers:
        result["answers"] = submission.answers or {}
        result["itemResults"] = submission.item_results or []
        result["grading"] = submission.grading or {}
    return result


def assignment_view(assignment, *, user=None, teacher=False, include_items=True):
    now = utcnow()
    submission = None
    if user is not None and not teacher:
        submission = TeachingAssignmentSubmissions.query.filter_by(
            assignment_id=assignment.id,
            student_id=user.id,
        ).first()
    counts = {}
    if teacher:
        rows = (
            db.session.query(
                TeachingAssignmentSubmissions.status,
                db.func.count(TeachingAssignmentSubmissions.id),
            )
            .filter_by(assignment_id=assignment.id)
            .group_by(TeachingAssignmentSubmissions.status)
            .all()
        )
        counts = {status: int(count) for status, count in rows}
        roster = DojoUsers.query.filter(
            DojoUsers.dojo_id == assignment.dojo_id,
            DojoUsers.type != "admin",
        ).count()
        started = sum(counts.values())
        counts["TOTAL"] = roster
        counts["NOT_STARTED"] = max(0, roster - started)
    result_by_item = {
        str(row.get("itemId")): row
        for row in (submission.item_results if submission else [])
        if isinstance(row, dict) and row.get("itemId")
    }
    settings = assignment.settings or {}
    answer_policy = str(settings.get("answerPolicy") or "AFTER_SUBMISSION").upper()
    if answer_policy not in {"NEVER", "AFTER_SUBMISSION", "AFTER_DUE", "IMMEDIATE"}:
        answer_policy = "AFTER_SUBMISSION"
    expose_answer = bool(
        teacher
        or answer_policy == "IMMEDIATE"
        or answer_policy == "AFTER_SUBMISSION"
        and submission is not None
        and submission.status in {"SUBMITTED", "GRADED"}
        or answer_policy == "AFTER_DUE"
        and assignment.due_at is not None
        and assignment.due_at <= now
    )
    submission_view = _submission_view(submission, include_answers=True)
    view = {
        "id": assignment.id,
        "dojoId": assignment.dojo_id,
        "dojoReferenceId": assignment.dojo.reference_id,
        "courseName": assignment.dojo.name or assignment.dojo.id,
        "moduleIndex": assignment.module_index,
        "title": assignment.title,
        "kind": assignment.kind,
        "status": assignment.status,
        "description": assignment.description,
        "instructions": assignment.instructions,
        "settings": settings,
        "answerPolicy": {
            "mode": answer_policy,
            "answersVisible": expose_answer,
            "label": {
                "NEVER": "不公布参考答案",
                "AFTER_SUBMISSION": "提交后公布参考答案",
                "AFTER_DUE": "截止后公布参考答案",
                "IMMEDIATE": "作答后立即反馈",
            }[answer_policy],
        },
        "availableFrom": timestamp(assignment.available_from),
        "dueAt": timestamp(assignment.due_at),
        "publishedAt": timestamp(assignment.published_at),
        "closedAt": timestamp(assignment.closed_at),
        "created": timestamp(assignment.created),
        "updated": timestamp(assignment.updated),
        "maxScore": round(sum(float(item.points) for item in assignment.items), 2),
        "itemCount": len(assignment.items),
        "isAvailable": assignment.available_from is None or assignment.available_from <= now,
        "isOverdue": bool(assignment.due_at and assignment.due_at < now),
        "activityState": activity_state(
            submission.status if submission else None,
            completed=bool(submission and submission.status == "GRADED"),
        ),
        "assessmentState": (
            submission_view.get("assessmentState")
            if submission_view
            else "NOT_APPLICABLE"
        ),
        "submission": submission_view,
        "submissionCounts": counts if teacher else None,
    }
    if include_items:
        view["items"] = [
            _item_view(
                assignment,
                item,
                teacher=teacher,
                result=result_by_item.get(item.id) if submission and submission.status == "GRADED" else None,
                expose_answer=expose_answer,
            )
            for item in assignment.items
        ]
    return view


def validate_item(assignment, raw, position):
    if not isinstance(raw, dict):
        raise ValueError("Assignment items must be objects")
    item_type = normalize_item_type(raw.get("type") or raw.get("itemType"))
    challenge_id = raw.get("challengeId")
    if challenge_id not in {None, ""}:
        try:
            challenge_id = int(challenge_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("challengeId must be an integer") from exc
        if not DojoChallenges.query.filter_by(
            dojo_id=assignment.dojo_id,
            challenge_id=challenge_id,
        ).first():
            raise ValueError("Challenge does not belong to the assignment course")
    elif item_type == "CHALLENGE":
        raise ValueError("Challenge items require challengeId")
    points = float(raw.get("points") or 10)
    if not math.isfinite(points) or points <= 0 or points > 1000:
        raise ValueError("points must be between 0 and 1000")
    config = dict(raw.get("config")) if isinstance(raw.get("config"), dict) else {}
    choices = config.get("choices")
    if item_type == "MULTIPLE_CHOICE":
        if not isinstance(choices, list) or not 2 <= len(choices) <= 12:
            raise ValueError("Multiple choice items require 2 to 12 choices")
        config["choices"] = [_bounded_text(choice, 1000, "choice") for choice in choices]
        if config.get("correctAnswer") in {None, ""}:
            raise ValueError("Multiple choice items require a correctAnswer")
    if item_type == "TRUE_FALSE" and config.get("correctAnswer") is None:
        raise ValueError("True/false items require a correctAnswer")
    return TeachingAssignmentItems(
        assignment_id=assignment.id,
        position=position,
        item_type=item_type,
        title=_bounded_text(raw.get("title") or f"题目 {position + 1}", 240, "item title"),
        prompt=_bounded_text(raw.get("prompt"), 16000, "item prompt"),
        points=points,
        required=bool(raw.get("required", True)),
        challenge_id=challenge_id,
        artifact_id=str(raw.get("artifactId"))[:48] if raw.get("artifactId") else None,
        config=config,
    )


def replace_items(assignment, raw_items):
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("At least one assignment item is required")
    if len(raw_items) > 100:
        raise ValueError("An assignment may contain at most 100 items")
    new_items = [validate_item(assignment, raw, position) for position, raw in enumerate(raw_items)]
    assignment.items[:] = []
    db.session.flush()
    assignment.items.extend(new_items)


def create_assignment(user, dojo, body):
    module_index = validate_module(dojo, body.get("moduleIndex"))
    assignment = TeachingAssignments(
        dojo_id=dojo.dojo_id,
        module_index=module_index,
        owner_id=user.id,
        title=_bounded_text(body.get("title") or "未命名作业", 240, "title"),
        kind=normalize_kind(body.get("kind")),
        description=_bounded_text(body.get("description"), 16000, "description"),
        instructions=_bounded_text(body.get("instructions"), 16000, "instructions"),
        settings=body.get("settings") if isinstance(body.get("settings"), dict) else {},
        available_from=parse_datetime(body.get("availableFrom"), field="availableFrom"),
        due_at=parse_datetime(body.get("dueAt"), field="dueAt"),
    )
    if assignment.available_from and assignment.due_at and assignment.available_from >= assignment.due_at:
        raise ValueError("dueAt must be later than availableFrom")
    db.session.add(assignment)
    db.session.flush()
    replace_items(assignment, body.get("items") or [])
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action="assignment.create",
            resource_type="teaching_assignment",
            resource_id=assignment.id,
            outcome="ALLOW",
            details={"dojoId": dojo.dojo_id, "kind": assignment.kind, "itemCount": len(assignment.items)},
        )
    )
    return assignment


def _keyword_seed(prompt):
    words = re.findall(r"[A-Za-z][A-Za-z0-9_.+-]{2,}|[\u4e00-\u9fff]{2,8}", prompt or "")
    ignored = {"请生成", "面向学生", "知识测试", "课程内容", "相关内容", "作业题目"}
    result = []
    for word in words:
        normalized = word.casefold()
        if normalized in ignored or normalized in result:
            continue
        result.append(normalized)
    return result[:8]


def _fallback_generated_items(prompt, count):
    keywords = _keyword_seed(prompt)
    focus = "、".join(keywords[:3]) or "本章节核心概念"
    templates = [
        {
            "type": "SHORT_ANSWER",
            "title": "概念与机制",
            "prompt": f"请解释 {focus} 的核心机制，并说明它在网络安全场景中的影响。",
            "points": 20,
            "config": {
                "keywords": keywords,
                "rubric": "机制准确、影响清楚、至少给出一个安全场景。",
                "placeholder": "用自己的语言说明原理与影响…",
            },
        },
        {
            "type": "SHORT_ANSWER",
            "title": "检测思路",
            "prompt": f"针对 {focus}，设计一个最小、可复核的检测步骤，并说明预期证据。",
            "points": 20,
            "config": {
                "keywords": [*keywords, "证据", "验证"],
                "rubric": "步骤可执行、证据可观察、结论可复核。",
            },
        },
        {
            "type": "SHORT_ANSWER",
            "title": "防御与权衡",
            "prompt": f"为 {focus} 提出防御方案，并分析至少一项实施成本或副作用。",
            "points": 20,
            "config": {
                "keywords": [*keywords, "防御", "成本"],
                "rubric": "措施有效、边界明确、包含工程权衡。",
            },
        },
    ]
    return [
        {
            **templates[index % len(templates)],
            "title": f"{index + 1}. {templates[index % len(templates)]['title']}",
        }
        for index in range(count)
    ]


def _generated_item(raw, position):
    """Normalize untrusted model output into the strict coursework schema."""

    if not isinstance(raw, dict):
        return None
    raw_type = str(raw.get("type") or "SHORT_ANSWER").strip().upper().replace("-", "_")
    item_type = raw_type if raw_type in {"MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "DEBATE"} else "SHORT_ANSWER"
    title = str(raw.get("title") or f"题目 {position + 1}").strip()[:240]
    prompt = str(raw.get("prompt") or raw.get("question") or "").strip()[:16000]
    if not prompt:
        return None
    try:
        points = float(raw.get("points") or 20)
    except (TypeError, ValueError):
        points = 20.0
    points = max(1.0, min(1000.0, points if math.isfinite(points) else 20.0))
    config = dict(raw.get("config")) if isinstance(raw.get("config"), dict) else {}
    for key in ("referenceAnswer", "rubric", "explanation", "placeholder"):
        if key in raw and key not in config:
            config[key] = raw[key]
    if "keywords" in raw and "keywords" not in config:
        config["keywords"] = raw["keywords"]
    if item_type == "MULTIPLE_CHOICE":
        choices = config.get("choices") or raw.get("choices")
        choices = [str(choice).strip()[:1000] for choice in choices] if isinstance(choices, list) else []
        choices = [choice for choice in choices if choice][:12]
        if len(choices) < 2:
            item_type = "SHORT_ANSWER"
            config.pop("choices", None)
            config.pop("correctAnswer", None)
        else:
            config["choices"] = choices
            answer = config.get("correctAnswer", raw.get("correctAnswer"))
            if isinstance(answer, int) and 0 <= answer < len(choices):
                answer = choices[answer]
            if answer not in choices:
                answer = choices[0]
            config["correctAnswer"] = answer
    if item_type == "TRUE_FALSE":
        answer = config.get("correctAnswer", raw.get("correctAnswer"))
        if isinstance(answer, str):
            answer = answer.strip().casefold() in {"true", "1", "yes", "是", "正确", "对"}
        config["correctAnswer"] = bool(answer)
    if item_type in {"SHORT_ANSWER", "DEBATE"}:
        keywords = config.get("keywords")
        if not isinstance(keywords, list):
            keywords = []
        config["keywords"] = [str(value).strip()[:240] for value in keywords if str(value).strip()][:30]
        if not config.get("rubric"):
            config["rubric"] = "概念准确、论证清楚，并能结合网络安全场景给出可复核依据。"
    return {
        "type": item_type,
        "title": title or f"题目 {position + 1}",
        "prompt": prompt,
        "points": points,
        "config": config,
    }


def generate_assignment_payload(body, dojo):
    """Generate one publishable assignment draft, with deterministic fallback."""

    prompt = str(body.get("prompt") or body.get("description") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    raw_question_count = (
        5 if body.get("questionCount") is None else body.get("questionCount")
    )
    try:
        if isinstance(raw_question_count, bool):
            raise ValueError
        count = int(raw_question_count)
        if isinstance(raw_question_count, float) and not raw_question_count.is_integer():
            raise ValueError
        if isinstance(raw_question_count, str) and not raw_question_count.strip().isdigit():
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValueError("questionCount must be an integer from 1 to 20") from exc
    if count < 1 or count > 20:
        raise ValueError("questionCount must be an integer from 1 to 20")
    try:
        pass_percent = int(body.get("passPercent") or 60)
    except (TypeError, ValueError):
        pass_percent = 60
    kind = normalize_kind(body.get("kind") or "QUIZ")
    challenge_ids = []
    raw_challenge_ids = body.get("challengeIds") or []
    if not isinstance(raw_challenge_ids, list):
        raise ValueError("challengeIds must be an array")
    for value in raw_challenge_ids:
        try:
            challenge_id = int(value)
        except (TypeError, ValueError):
            continue
        if DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id, challenge_id=challenge_id).first():
            challenge_ids.append(challenge_id)
    generated = None
    try:
        generated = model_json(
            "你是网络安全课程作业设计专家。根据课程上下文生成可直接发布的结构化作业。"
            "返回 JSON：{title,description,instructions,items:[{type,title,prompt,points,config}]}。"
            "items 的长度必须与输入 questionCount 完全相等；每个数组元素是一道独立题，"
            "不得把多道题合并为一道含多个小问的综合题。"
            "type 只能是 MULTIPLE_CHOICE、TRUE_FALSE、SHORT_ANSWER 或 DEBATE；"
            "选择题 config 必须有 choices、correctAnswer、explanation；判断题必须有 correctAnswer、explanation；"
            "简答和辩论必须有 referenceAnswer、keywords、rubric。不要输出 Markdown。",
            {
                "course": dojo.name or dojo.id,
                "moduleIndex": body.get("moduleIndex"),
                "kind": kind,
                "difficulty": body.get("difficulty") or "INTERMEDIATE",
                "questionCount": count,
                "prompt": prompt[:12000],
            },
            model=DOJO_AI_AUTHORING_PLAN_MODEL,
            thinking=False,
            temperature=0.25,
            max_tokens=7000,
            attempts=2,
        )
    except Exception:
        generated = None
    raw_items = generated.get("items") if isinstance(generated, dict) else None
    normalized = [
        item
        for index, raw in enumerate(raw_items[:count] if isinstance(raw_items, list) else [])
        if (item := _generated_item(raw, index)) is not None
    ]
    model_generated_count = len(normalized)
    if len(normalized) < count:
        fallbacks = _fallback_generated_items(prompt, count)
        normalized.extend(fallbacks[len(normalized):count])
    if len(normalized) != count:
        raise RuntimeError(
            f"Assignment generation produced {len(normalized)} of {count} requested questions"
        )
    challenges = (
        DojoChallenges.query.filter(
            DojoChallenges.dojo_id == dojo.dojo_id,
            DojoChallenges.challenge_id.in_(challenge_ids or [-1]),
        )
        .order_by(DojoChallenges.module_index, DojoChallenges.challenge_index)
        .all()
    )
    items = [
        {
            "type": "CHALLENGE",
            "title": row.name or row.id,
            "prompt": "完成对应的玄甲隔离实验，并通过真实判题。",
            "challengeId": row.challenge_id,
            "points": 30,
            "config": {},
        }
        for row in challenges
    ]
    items.extend(normalized[:count])
    meta = generated.get("_agentMeta") if isinstance(generated, dict) else None
    generated_title = str((generated or {}).get("title") or "").strip()
    return {
        "title": (generated_title or str(body.get("title") or "").strip() or f"{dojo.name or dojo.id} · 智能作业")[:240],
        "kind": kind,
        "moduleIndex": body.get("moduleIndex"),
        "description": str((generated or {}).get("description") or prompt)[:16000],
        "instructions": str(
            (generated or {}).get("instructions")
            or "按顺序完成题目；实验题以真实 Dojo 判题为准，主观题由受限评分标准智能批改。"
        )[:16000],
        "availableFrom": body.get("availableFrom"),
        "dueAt": body.get("dueAt"),
        "settings": {
            "allowLate": bool(body.get("allowLate", True)),
            "allowResubmit": bool(body.get("allowResubmit", True)),
            "passPercent": max(0, min(100, pass_percent)),
            "generation": {
                "prompt": prompt[:4000],
                "model": (meta or {}).get("model"),
                "provider": (meta or {}).get("provider"),
                "fallback": meta is None,
                "requestedQuestionCount": count,
                "generatedQuestionCount": len(normalized),
                "modelGeneratedQuestionCount": model_generated_count,
            },
        },
        "items": items,
    }


def publish_assignment(assignment, user):
    if not assignment.items:
        raise ValueError("Cannot publish an empty assignment")
    assignment.status = "PUBLISHED"
    assignment.published_at = assignment.published_at or utcnow()
    assignment.closed_at = None
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action="assignment.publish",
            resource_type="teaching_assignment",
            resource_id=assignment.id,
            outcome="ALLOW",
            details={"dojoId": assignment.dojo_id},
        )
    )


def close_assignment(assignment, user):
    if assignment.status != "PUBLISHED":
        raise ValueError("Only a published assignment can be closed")
    assignment.status = "CLOSED"
    assignment.closed_at = utcnow()
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action="assignment.close",
            resource_type="teaching_assignment",
            resource_id=assignment.id,
            outcome="ALLOW",
            details={"dojoId": assignment.dojo_id},
        )
    )


def delete_assignment(assignment, user):
    if assignment.status != "DRAFT" or TeachingAssignmentSubmissions.query.filter_by(
        assignment_id=assignment.id
    ).count():
        raise ValueError("Only an unused draft assignment can be deleted")
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action="assignment.delete",
            resource_type="teaching_assignment",
            resource_id=assignment.id,
            outcome="ALLOW",
            details={"dojoId": assignment.dojo_id, "title": assignment.title},
        )
    )
    db.session.delete(assignment)


def update_assignment(assignment, body, user):
    if "title" in body:
        title = str(body.get("title") or "").strip()
        if not title or len(title) > 240:
            raise ValueError("title is required and must be at most 240 characters")
        assignment.title = title
    if "kind" in body:
        assignment.kind = normalize_kind(body.get("kind"))
    for field in ("description", "instructions"):
        if field in body:
            value = str(body.get(field) or "")
            if len(value) > 16000:
                raise ValueError(f"{field} exceeds 16000 characters")
            setattr(assignment, field, value)
    if "moduleIndex" in body:
        assignment.module_index = validate_module(assignment.dojo, body.get("moduleIndex"))
    if "availableFrom" in body:
        assignment.available_from = parse_datetime(body.get("availableFrom"), field="availableFrom")
    if "dueAt" in body:
        assignment.due_at = parse_datetime(body.get("dueAt"), field="dueAt")
    if assignment.available_from and assignment.due_at and assignment.available_from >= assignment.due_at:
        raise ValueError("dueAt must be later than availableFrom")
    if "settings" in body:
        if not isinstance(body.get("settings"), dict):
            raise ValueError("settings must be an object")
        assignment.settings = {**(assignment.settings or {}), **body["settings"]}
    if "items" in body:
        if TeachingAssignmentSubmissions.query.filter_by(assignment_id=assignment.id).count():
            raise ValueError("Items cannot be replaced after students have started the assignment")
        replace_items(assignment, body.get("items"))
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action="assignment.update",
            resource_type="teaching_assignment",
            resource_id=assignment.id,
            outcome="ALLOW",
            details={"fields": sorted(body.keys())},
        )
    )
    return assignment


def _normalize_answer(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return sorted(str(item).strip().casefold() for item in value)
    return str(value or "").strip().casefold()


def _fallback_open_grade(item, answer):
    config = item.config or {}
    reference = str(config.get("referenceAnswer") or "")
    keywords = [str(value).strip().casefold() for value in (config.get("keywords") or []) if str(value).strip()]
    answer_text = str(answer or "").strip()
    answer_lower = answer_text.casefold()
    if not answer_text:
        return 0.0, "未作答。", True
    if keywords:
        matched = sum(1 for keyword in keywords if keyword in answer_lower)
        ratio = matched / len(keywords)
        score = float(item.points) * (0.35 + 0.65 * ratio)
        return min(float(item.points), score), f"已覆盖 {matched}/{len(keywords)} 个关键评分点。", True
    if reference:
        reference_tokens = set(re.findall(r"[\w\u4e00-\u9fff]+", reference.casefold()))
        answer_tokens = set(re.findall(r"[\w\u4e00-\u9fff]+", answer_lower))
        overlap = len(reference_tokens & answer_tokens) / max(1, len(reference_tokens))
        score = float(item.points) * min(1.0, 0.25 + overlap)
        return score, "已按参考要点覆盖度完成初步评分。", True
    completeness = min(0.8, len(answer_text) / 240)
    return float(item.points) * completeness, "缺少明确评分要点，当前为完整度初评，建议教师复核。", True


def _ai_open_grades(items, answers):
    if not items:
        return {}, None
    payload = {
        "questions": build_open_grade_questions(items, answers)
    }
    try:
        result = model_json(
            "你是网络安全课程智能批改器。只能依据题面、参考答案和评分标准评分；不得补造学生行为。"
            "返回 JSON：{grades:[{itemIndex,itemId,score,feedback,confidence}]}。"
            "必须为每道题返回恰好一行，保持输入顺序，并原样复制 itemIndex 与 itemId。"
            "score 必须在 0 到该题 points 之间，"
            "feedback 用中文指出已做到的部分和下一步改进。",
            payload,
            model=DOJO_AI_GRADER_MODEL,
            thinking=True,
            reasoning_effort="medium",
            max_tokens=5000,
            attempts=2,
            response_validator=lambda value: isinstance(value.get("grades"), list)
            and len(value["grades"]) == len(items),
        )
    except Exception:
        result = None
    rows = result.get("grades") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        return {}, None
    by_id = map_open_grade_rows(rows, items)
    return by_id, result.get("_agentMeta") if isinstance(result, dict) else None


def grade_submission(submission, *, grader_id=None):
    assignment = submission.assignment
    answers = submission.answers or {}
    open_items = [item for item in assignment.items if item.item_type in {"SHORT_ANSWER", "DEBATE"}]
    ai_grades, agent_meta = _ai_open_grades(open_items, answers)
    challenge_ids = [item.challenge_id for item in assignment.items if item.challenge_id]
    solved_ids = {
        row.challenge_id
        for row in Solves.query.filter(
            Solves.user_id == submission.student_id,
            Solves.challenge_id.in_(challenge_ids or [-1]),
        ).all()
    }
    item_results = []
    objective_score = 0.0
    ai_score = 0.0
    confidence_values = []
    for item in assignment.items:
        answer = answers.get(item.id)
        score = 0.0
        feedback = ""
        source = "DETERMINISTIC"
        needs_review = False
        if item.item_type == "CHALLENGE":
            solved = item.challenge_id in solved_ids
            score = float(item.points) if solved else 0.0
            feedback = "已通过真实 Dojo 判题。" if solved else "尚未通过对应 Dojo 题目。"
        elif item.item_type in {"MULTIPLE_CHOICE", "TRUE_FALSE"}:
            correct = (item.config or {}).get("correctAnswer")
            is_correct = _normalize_answer(answer) == _normalize_answer(correct)
            score = float(item.points) if is_correct else 0.0
            feedback = (item.config or {}).get("explanation") or ("回答正确。" if is_correct else "回答不正确，请复习相关知识点。")
        elif item.item_type in {"SHORT_ANSWER", "DEBATE"}:
            source = "AI"
            ai_grade = ai_grades.get(item.id)
            if ai_grade:
                score = ai_grade["score"]
                feedback = ai_grade["feedback"]
                confidence_values.append(ai_grade["confidence"])
            else:
                score, feedback, needs_review = _fallback_open_grade(item, answer)
                source = "FALLBACK"
                confidence_values.append(0.45)
        elif item.item_type == "ARTIFACT":
            present = bool(answer)
            score = float(item.points) if present else 0.0
            feedback = "已提交产物引用，等待教师复核。" if present else "尚未提交产物。"
            source = "PRESENCE"
            needs_review = present
        score = round(max(0.0, min(float(item.points), float(score))), 2)
        if source == "DETERMINISTIC":
            objective_score += score
        else:
            ai_score += score
        item_results.append(
            {
                "itemId": item.id,
                "score": score,
                "maxScore": float(item.points),
                "feedback": str(feedback)[:4000],
                "source": source,
                "needsReview": needs_review,
            }
        )
    submission.objective_score = round(objective_score, 2)
    submission.ai_score = round(ai_score, 2)
    submission.total_score = round(objective_score + ai_score, 2)
    submission.max_score = round(sum(float(item.points) for item in assignment.items), 2)
    submission.trust_score = round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else 1.0
    submission.item_results = item_results
    submission.feedback = "；".join(
        row["feedback"] for row in item_results if row.get("feedback")
    )[:16000]
    submission.grading = {
        "version": 1,
        "agent": agent_meta or {},
        "sourceOfTruth": ["Solves", "server-side answer keys", "bounded AI rubric"],
    }
    submission.status = "GRADED"
    submission.grader_id = grader_id
    submission.graded_at = utcnow()
    return submission


def save_submission(assignment, user, answers, *, submit=False):
    if not isinstance(answers, dict):
        raise ValueError("作答内容格式不正确，请刷新页面后重试。")
    now = utcnow()
    if assignment.status != "PUBLISHED":
        raise ValueError("这项任务已经关闭，当前答案仍保留在本机。")
    if assignment.available_from and assignment.available_from > now:
        raise ValueError("这项任务尚未开放，请在开放时间后再试。")
    settings = assignment.settings or {}
    if assignment.due_at and assignment.due_at < now and not settings.get("allowLate", True):
        raise ValueError("这项任务已经截止，教师未开放迟交。")
    submission = TeachingAssignmentSubmissions.query.filter_by(
        assignment_id=assignment.id,
        student_id=user.id,
    ).with_for_update().first()
    if submission is None:
        submission = TeachingAssignmentSubmissions(
            assignment_id=assignment.id,
            student_id=user.id,
            status="IN_PROGRESS",
        )
        db.session.add(submission)
    elif submission.status == "GRADED" and not settings.get("allowResubmit", True):
        raise ValueError("这项任务不允许重新提交。")
    items_by_id = {item.id: item for item in assignment.items}
    normalized_answers = {}
    for key, value in answers.items():
        item_id = str(key)
        if item_id not in items_by_id:
            continue
        if isinstance(value, str):
            if len(value) > 16000:
                raise ValueError("单题答案不能超过 16,000 个字符。")
            normalized_answers[item_id] = value
        elif isinstance(value, bool) or value is None:
            normalized_answers[item_id] = value
        elif isinstance(value, list):
            if len(value) > 50 or any(not isinstance(entry, (str, bool, int, float)) for entry in value):
                raise ValueError("多选答案格式不正确，请重新选择。")
            normalized_answers[item_id] = [str(entry)[:1000] for entry in value]
        elif isinstance(value, (int, float)) and math.isfinite(float(value)):
            normalized_answers[item_id] = value
        else:
            raise ValueError("答案格式暂不支持，请修改后重试。")
    if submit:
        missing = []
        for item in assignment.items:
            if not item.required or item.item_type == "CHALLENGE":
                continue
            value = normalized_answers.get(item.id)
            empty = (
                value is None
                or value == []
                or (isinstance(value, str) and not value.strip())
            )
            if empty:
                missing.append(item.position + 1)
        if missing:
            joined = "、".join(str(value) for value in missing[:12])
            raise ValueError(f"请先完成必答题：第 {joined} 题。")
    submission.answers = normalized_answers
    submission.status = "SUBMITTED" if submit else "IN_PROGRESS"
    if submit:
        submission.submitted_at = now
        grade_submission(submission)
        db.session.add(
            LearningAuditEvents(
                actor_id=user.id,
                action="assignment.submit",
                resource_type="teaching_assignment_submission",
                resource_id=submission.id,
                outcome="ALLOW",
                details={"assignmentId": assignment.id, "dojoId": assignment.dojo_id},
            )
        )
    return submission


def override_submission_grade(assignment, submission_id, user, score, feedback=None):
    submission = TeachingAssignmentSubmissions.query.filter_by(
        id=str(submission_id),
        assignment_id=assignment.id,
    ).with_for_update().first()
    if submission is None:
        raise ScopeError("Submission not found")
    try:
        numeric_score = float(score)
    except (TypeError, ValueError) as exc:
        raise ValueError("score must be a number") from exc
    maximum = float(submission.max_score or sum(float(item.points) for item in assignment.items))
    if not math.isfinite(numeric_score) or numeric_score < 0 or numeric_score > maximum:
        raise ValueError("score must be between 0 and maxScore")
    submission.max_score = maximum
    submission.total_score = round(numeric_score, 2)
    if feedback is not None:
        submission.feedback = _bounded_text(feedback, 16000, "feedback")
    submission.status = "GRADED"
    submission.grader_id = user.id
    submission.graded_at = utcnow()
    submission.grading = {
        **(submission.grading or {}),
        "teacherOverride": {
            "graderId": user.id,
            "score": submission.total_score,
            "at": timestamp(submission.graded_at),
        },
    }
    db.session.add(
        LearningAuditEvents(
            actor_id=user.id,
            action="assignment.grade.override",
            resource_type="teaching_assignment_submission",
            resource_id=submission.id,
            outcome="ALLOW",
            details={"assignmentId": assignment.id, "score": submission.total_score},
        )
    )
    return submission


def roster_submissions(assignment):
    submissions = {
        row.student_id: row
        for row in TeachingAssignmentSubmissions.query.filter_by(assignment_id=assignment.id).all()
    }
    members = DojoUsers.query.filter(
        DojoUsers.dojo_id == assignment.dojo_id,
        DojoUsers.type != "admin",
    ).order_by(DojoUsers.user_id).all()
    return [
        {
            "studentId": member.user_id,
            "studentName": member.user.name if member.user else str(member.user_id),
            "status": submissions[member.user_id].status if member.user_id in submissions else "NOT_STARTED",
            "submission": _submission_view(submissions.get(member.user_id), include_answers=True),
        }
        for member in members
    ]

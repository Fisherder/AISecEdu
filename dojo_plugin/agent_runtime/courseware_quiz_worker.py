"""Scoped worker delegation for ordinary-course courseware quiz generation."""

import secrets
import time

from CTFd.models import Users, db

from ..courseware_quiz import CoursewareQuizError
from ..models import Dojos, TeachingJobs
from . import ordinary_project_queue
from .scope import ScopeError, dojo_for_user

_REQUEST_FIELDS = (
    "prompt",
    "description",
    "title",
    "kind",
    "questionCount",
    "passPercent",
    "moduleIndex",
    "difficulty",
    "availableFrom",
    "dueAt",
    "allowLate",
    "allowResubmit",
    "sourceRefs",
    "questionTypes",
    "challengeIds",
)


def run_scoped_courseware_quiz(body, dojo, user, *, timeout_seconds=105.0, poll_interval=0.5):
    """Delegate courseware quiz generation from web workers without DSH credentials."""
    from .jobs import enqueue_job

    request_body = {key: body[key] for key in _REQUEST_FIELDS if key in body}
    raw_module = request_body.get("moduleIndex")
    job, _ = enqueue_job(
        owner_id=user.id,
        kind="courseware.quiz.generate",
        idempotency_key=f"courseware-quiz:{user.id}:{dojo.dojo_id}:{secrets.token_hex(12)}",
        payload={"coursewareQuizRequest": request_body, "taskListHidden": True},
        dojo_id=dojo.dojo_id,
        module_index=raw_module if type(raw_module) is int else None,
        priority=15,
        max_attempts=1,
        publish=False,
        commit=True,
    )
    deadline = time.monotonic() + float(timeout_seconds)
    current = None
    while time.monotonic() < deadline:
        db.session.rollback()
        current = TeachingJobs.query.filter_by(id=job.id, owner_id=user.id).first()
        if current is not None and current.status in {"SUCCEEDED", "FAILED", "CANCELED"}:
            break
        time.sleep(float(poll_interval))
    else:
        db.session.rollback()
        current = TeachingJobs.query.filter_by(id=job.id, owner_id=user.id).first()

    if current is None or current.status != "SUCCEEDED":
        raise CoursewareQuizError(
            "MODEL_UNAVAILABLE",
            "课件测验生成服务暂时不可用或超时，请稍后重试。",
        )
    result = current.result or {}
    if "coursewareError" in result:
        err = result["coursewareError"] or {}
        raise CoursewareQuizError(
            err.get("code") or "MODEL_UNAVAILABLE",
            err.get("message") or "课件测验生成失败。",
            report=err.get("report") or {},
        )
    if "scopeError" in result:
        raise ScopeError(result["scopeError"])
    if "valueError" in result:
        raise ValueError(result["valueError"])
    if isinstance(result.get("payload"), dict):
        return result["payload"]
    raise CoursewareQuizError("MODEL_UNAVAILABLE", "课件测验生成服务未返回有效结果。")


def execute_scoped_courseware_quiz(job):
    """Execute one delegated courseware quiz generation job inside teacher-chat."""
    from ..coursework import generate_assignment_payload

    if not ordinary_project_queue.enabled(job.dojo_id):
        return {"scopeError": "Courseware generation is not available for this course"}
    owner = Users.query.filter_by(id=job.owner_id, banned=False).first()
    dojo = Dojos.query.filter_by(dojo_id=job.dojo_id).first()
    if owner is None or dojo is None:
        return {"scopeError": "Courseware generation is not available for this course"}
    req = (job.payload or {}).get("coursewareQuizRequest")
    if not isinstance(req, dict):
        return {"valueError": "Invalid courseware quiz request"}
    try:
        dojo_for_user(owner, dojo.dojo_id, teacher=True)
        generated = generate_assignment_payload(req, dojo, user=owner)
        return {"payload": generated}
    except CoursewareQuizError as exc:
        report = {
            key: exc.report[key]
            for key in ("requestedCount", "acceptedCount", "rounds")
            if key in (exc.report or {})
        }
        return {
            "coursewareError": {
                "code": exc.code,
                "message": str(exc),
                "report": report,
            }
        }
    except ScopeError as exc:
        return {"scopeError": str(exc)}
    except ValueError as exc:
        return {"valueError": str(exc)}

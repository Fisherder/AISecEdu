import datetime
import hashlib
import os
import re
import uuid
from urllib.parse import urlsplit


ACTIVITY_STATES = frozenset(
    {"NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "COMPLETED"}
)
MASTERY_STATES = frozenset(
    {"UNKNOWN", "EMERGING", "DEVELOPING", "PROFICIENT", "MASTERED"}
)
ASSESSMENT_STATES = frozenset(
    {"NOT_APPLICABLE", "PENDING", "READY", "FAILED"}
)
EVIDENCE_STATES = frozenset({"NONE", "PARTIAL", "COMPLETE", "INVALID"})
RESOURCE_STATES = frozenset(
    {
        "AVAILABLE",
        "MOVED",
        "ARCHIVED",
        "DELETED",
        "FORBIDDEN",
        "UNRESOLVED",
        "INVALID",
    }
)
TELEMETRY_EVENTS = {
    "student_next_action_viewed": {"type", "reasonCode", "courseId", "state"},
    "student_next_action_started": {"type", "latencyMs", "sourcePage"},
    "learning_context_transition": {"fromType", "toType", "preserved"},
    "resource_action_resolved": {"objectType", "status", "recoveryUsed"},
    "student_error_recovered": {"errorCode", "recoveryType", "requestId"},
    "lab_start_state_changed": {"stage", "durationMs", "result"},
}
_FORBIDDEN_TELEMETRY_KEYS = frozenset(
    {
        "answer",
        "command",
        "content",
        "flag",
        "prompt",
        "query",
        "secret",
        "title",
    }
)
_SAFE_PATH = re.compile(r"^/[A-Za-z0-9_./~%:+?=&-]*$")


def timestamp(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def student_ux_rollout(user_id):
    mode = str(os.getenv("STUDENT_UX_V2_MODE") or "enabled").strip().lower()
    try:
        percent = max(
            0,
            min(100, int(os.getenv("STUDENT_UX_V2_PERCENT") or "100")),
        )
    except ValueError:
        percent = 100
    bucket = int(
        hashlib.sha256(f"student-ux-v2:{user_id}".encode()).hexdigest()[:8], 16
    ) % 100
    enabled = mode not in {"disabled", "off", "legacy", "0", "false"}
    if mode in {"cohort", "gradual"}:
        enabled = bucket < percent
    return {
        "flag": "student_logged_in_ux_v2",
        "variant": "v2" if enabled else "legacy",
        "cohortBucket": bucket,
        "rolloutPercent": percent,
        "rollback": "STUDENT_UX_V2_MODE=disabled",
    }


def activity_state(value, *, completed=False, submitted=False):
    if completed or str(value or "").upper() in {
        "COMPLETED",
        "GRADED",
        "SOLVED",
        "SUCCEEDED",
    }:
        return "COMPLETED"
    if submitted or str(value or "").upper() in {"SUBMITTED", "PENDING_REVIEW"}:
        return "SUBMITTED"
    if str(value or "").upper() in {
        "ACTIVE",
        "IN_PROGRESS",
        "RUNNING",
        "STARTED",
    }:
        return "IN_PROGRESS"
    return "NOT_STARTED"


def assessment_state(assessment, *, activity=None):
    if not assessment:
        return "PENDING" if activity == "SUBMITTED" else "NOT_APPLICABLE"
    status = str(
        assessment.get("status") if isinstance(assessment, dict) else assessment
    ).upper()
    if status in {"FAILED", "ERROR", "INVALID"}:
        return "FAILED"
    if status in {"READY", "GRADED", "COMPLETED", "FINAL", "PASSED"}:
        return "READY"
    return "PENDING"


def evidence_state(*, count=0, valid=None, complete=False):
    try:
        count = max(0, int(count or 0))
    except (TypeError, ValueError):
        count = 0
    if valid is False:
        return "INVALID"
    if count == 0:
        return "NONE"
    return "COMPLETE" if complete else "PARTIAL"


def mastery_state(value=None, *, evidence_count=0):
    try:
        evidence_count = max(0, int(evidence_count or 0))
    except (TypeError, ValueError):
        evidence_count = 0
    if evidence_count == 0 or value is None:
        return {"state": "UNKNOWN", "value": None, "label": "证据不足"}
    try:
        score = max(0.0, min(100.0, float(value)))
    except (TypeError, ValueError):
        return {"state": "UNKNOWN", "value": None, "label": "证据不足"}
    if score < 40:
        state, label = "EMERGING", "正在形成"
    elif score < 65:
        state, label = "DEVELOPING", "持续发展"
    elif score < 85:
        state, label = "PROFICIENT", "已经熟练"
    else:
        state, label = "MASTERED", "稳定掌握"
    return {"state": state, "value": round(score, 1), "label": label}


def progress_contract(completed, total, *, basis="required_runnable_items"):
    completed = max(0, int(completed or 0))
    total = max(0, int(total or 0))
    if total == 0:
        return {
            "completed": completed,
            "total": 0,
            "percent": None,
            "basis": basis,
            "state": "NOT_APPLICABLE",
            "label": "本章节以阅读学习为主",
        }
    percent = round(min(completed, total) / total * 100, 1)
    return {
        "completed": min(completed, total),
        "total": total,
        "percent": percent,
        "basis": basis,
        "state": "COMPLETED" if completed >= total else "IN_PROGRESS",
        "label": f"已完成 {min(completed, total)} / {total} 项必修内容",
    }


def safe_return_path(value, fallback="/student"):
    candidate = str(value or "").strip()
    if not candidate or not _SAFE_PATH.fullmatch(candidate):
        return fallback
    parsed = urlsplit(candidate)
    if parsed.scheme or parsed.netloc or candidate.startswith("//"):
        return fallback
    allowed = (
        "/student",
        "/learning",
        "/guide",
        "/dojos",
        "/dojo/",
        "/workspace",
    )
    return candidate if candidate.startswith(allowed) else fallback


def safe_teacher_return_path(value, fallback="/teacher"):
    candidate = str(value or "").strip()
    if not candidate or not _SAFE_PATH.fullmatch(candidate):
        return fallback
    parsed = urlsplit(candidate)
    if parsed.scheme or parsed.netloc or candidate.startswith("//"):
        return fallback
    if parsed.path == "/teacher" or parsed.path.startswith("/teacher/"):
        return candidate
    return fallback


def error_contract(code, message, *, label="返回今天", href="/student", request_id=None):
    return {
        "success": False,
        "error": {
            "code": str(code or "UNKNOWN_ERROR")[:80],
            "message": str(message or "当前操作暂时无法完成。")[:1000],
            "recovery": {
                "label": str(label or "返回今天")[:80],
                "href": safe_return_path(href),
            },
            "requestId": str(request_id or uuid.uuid4().hex),
        },
    }


def sanitize_telemetry(event, properties):
    allowed = TELEMETRY_EVENTS.get(str(event or ""))
    if allowed is None:
        raise ValueError("不支持的学习体验事件。")
    source = properties if isinstance(properties, dict) else {}
    lowered = {str(key).casefold() for key in source}
    if lowered & _FORBIDDEN_TELEMETRY_KEYS:
        raise ValueError("学习体验事件包含不允许采集的内容。")
    result = {}
    for key in allowed:
        if key not in source:
            continue
        value = source[key]
        if isinstance(value, bool):
            result[key] = value
        elif isinstance(value, (int, float)):
            result[key] = max(-1_000_000_000, min(1_000_000_000, value))
        elif value is not None:
            result[key] = str(value)[:120]
    return result

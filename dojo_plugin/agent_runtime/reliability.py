"""Durable retry policy; delays never occupy a worker or alter generation input."""

import datetime
import hashlib


RECOVERY_WINDOW_SECONDS = 6 * 60 * 60
SERVICE_RECOVERY_LIMIT = 12
CONTENT_REPAIR_LIMIT = 6


class RuntimeJobError(RuntimeError):
    def __init__(self, message, *, category="internal", code="EXECUTION_FAILED", retry_after=0):
        super().__init__(message)
        self.category = category
        self.code = code
        try:
            self.retry_after = min(1800, max(0, int(retry_after)))
        except (ValueError, TypeError, OverflowError):
            self.retry_after = 0


def recovery_state(job):
    result = getattr(job, "result", None)
    result = result if isinstance(result, dict) else {}
    state = result.get("_executionRecovery")
    return dict(state) if isinstance(state, dict) else {}


def _date(value):
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def recovery_due(job, now):
    due = _date(recovery_state(job).get("nextAttemptAt"))
    return due is None or due <= now


def recovery_decision(job, category, *, now, retry_after=0):
    state = recovery_state(job)
    first = _date(state.get("startedAt")) or now
    count_name = {"service": "serviceRetries", "quality": "repairRetries"}.get(category, "otherRetries")
    count = max(0, int(state.get(count_name) or 0)) + 1
    base_attempts = max(1, int(state.get("baseMaxAttempts") or job.max_attempts or 3))
    limit = {"service": SERVICE_RECOVERY_LIMIT, "quality": CONTENT_REPAIR_LIMIT}.get(category, base_attempts)
    retry = category != "permanent" and count < limit and (now - first).total_seconds() < RECOVERY_WINDOW_SECONDS
    # Per-job jitter spreads a recovered provider's backlog without a retry storm.
    jitter = int(hashlib.sha256(f"{job.id}:{count}:{category}".encode()).hexdigest()[:4], 16) % 16
    delay = max(retry_after, min(600, 30 * 2 ** min(count - 1, 5)) + jitter) if category == "service" else 15 + jitter
    next_at = now + datetime.timedelta(seconds=delay)
    retry = retry and next_at < first + datetime.timedelta(seconds=RECOVERY_WINDOW_SECONDS)
    state.update({
        "version": "generation-reliability-v1", "category": category,
        "baseMaxAttempts": base_attempts, "startedAt": first.isoformat() + "Z",
        count_name: count, "nextAttemptAt": next_at.isoformat() + "Z" if retry else None,
        "automaticRecovery": bool(retry),
    })
    return bool(retry), state


def public_recovery(job):
    state = recovery_state(job)
    return {key: state[key] for key in ("category", "serviceRetries", "repairRetries", "nextAttemptAt", "automaticRecovery") if key in state}

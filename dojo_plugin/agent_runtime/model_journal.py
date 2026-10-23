"""Persist one inner-runtime model attempt before its result is processed.

The service callback is authenticated at the API boundary. A job attempt and
call ID are scoped to the active leased worker attempt; an old runtime cannot
write into a later retry's history.
"""

import hashlib
import json

from CTFd.models import db

from ..models import TeachingAgentEventOutbox, TeachingJobs
from .provider_journal import (
    PROVIDER_EVENT_TYPES, canceled_provider_details, require_finished_provider_calls,
    validate_provider_chain, validate_provider_event,
)


EVENT_TYPES = {
    "model.requested", "model.step", "model.settled", "model.failed",
    "tool.call", "tool.result",
}
EVENT_TYPES.update(PROVIDER_EVENT_TYPES)
MAX_DETAIL_BYTES = 8 * 1024 * 1024
MODEL_TERMINAL_TYPES = frozenset({"model.settled", "model.failed", "model.cancelled"})


class ModelJournalError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def record_model_event(job_id, body):
    """Commit an idempotent event for the current active ``agent.chat`` job."""

    event_type = body.get("type")
    attempt_count = body.get("attemptCount")
    call_id = body.get("callId")
    detail = body.get("detail")
    if (
        event_type not in EVENT_TYPES
        or type(attempt_count) is not int or attempt_count < 1
        or not isinstance(call_id, str) or len(call_id) > 128
        or not call_id.startswith(f"{job_id}:{attempt_count}:")
        or not isinstance(detail, dict)
    ):
        raise ModelJournalError("Invalid model event")
    is_tool_event = event_type.startswith("tool.")
    is_step_event = event_type == "model.step"
    is_provider_event = event_type in PROVIDER_EVENT_TYPES
    if is_provider_event:
        transport_id = validate_provider_event(job_id, attempt_count, call_id, event_type, detail)
    elif is_tool_event:
        parent_call_id = detail.get("parentCallId")
        suffix = call_id.partition(":tool:")[2]
        if (
            not isinstance(parent_call_id, str)
            or not parent_call_id.startswith(f"{job_id}:{attempt_count}:")
            or not parent_call_id.rsplit(":", 1)[-1].isdigit()
            or not call_id.startswith(f"{parent_call_id}:tool:")
            or len(suffix) != 32 or any(char not in "0123456789abcdef" for char in suffix)
            or not isinstance(detail.get("toolCallId"), str)
            or not isinstance(detail.get("toolName"), str)
            or detail["toolName"] not in {"skill", "skill_resource"}
            or (event_type == "tool.call" and not isinstance(detail.get("input"), dict))
            or (event_type == "tool.result" and detail.get("status") not in {"succeeded", "failed"})
        ):
            raise ModelJournalError("Invalid tool event")
    elif is_step_event:
        parent_call_id = detail.get("parentCallId")
        step_suffix = call_id.partition(":step:")[2]
        if (
            not isinstance(parent_call_id, str)
            or not parent_call_id.startswith(f"{job_id}:{attempt_count}:")
            or not parent_call_id.rsplit(":", 1)[-1].isdigit()
            or not call_id.startswith(f"{parent_call_id}:step:")
            or not step_suffix.isdigit() or int(step_suffix) < 1 or int(step_suffix) > 100
            or type(detail.get("stepNumber")) is not int
            or detail["stepNumber"] != int(step_suffix) - 1
        ):
            raise ModelJournalError("Invalid model step event")
    elif not call_id.rsplit(":", 1)[-1].isdigit():
        raise ModelJournalError("Invalid model event")
    encoded = json.dumps(
        detail, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")
    if len(encoded) > MAX_DETAIL_BYTES:
        raise ModelJournalError("Model event exceeds the durable event limit", 413)
    digest = hashlib.sha256(encoded).hexdigest()

    job = TeachingJobs.query.filter_by(id=job_id, kind="agent.chat").with_for_update().populate_existing().first()
    if (
        job is None or not job.thread_id or job.attempt_count != attempt_count
        or job.status not in {"RUNNING", "CANCEL_REQUESTED", "CANCELED"}
        or (job.status == "RUNNING" and not job.lease_owner)
    ):
        raise ModelJournalError("Active model job attempt not found", 404)
    if job.status != "RUNNING":
        allowed = {"model.failed", "tool.result", "provider.response", "provider.chunk", "provider.finished"} if job.status == "CANCEL_REQUESTED" else {"model.failed", "provider.finished"}
        if event_type not in allowed:
            raise ModelJournalError("Canceled model job cannot start or settle work", 409)
        if event_type == "provider.finished":
            if job.status == "CANCELED":
                sealed = TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id, event_type=event_type).filter(
                    TeachingAgentEventOutbox.payload["callId"].astext == call_id,
                ).first()
                if sealed is not None and sealed.payload.get("detail", {}).get("status") == "cancelled":
                    db.session.commit()
                    return {"accepted": True, "ignored": True, "terminalType": "provider.finished"}
                raise ModelJournalError("Canceled provider transport is sealed", 409)
            if detail["status"] == "completed":
                raise ModelJournalError("Stopped provider transport cannot complete", 409)
        if event_type == "model.failed":
            cancelled = (
                TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id, event_type="model.cancelled")
                .filter(TeachingAgentEventOutbox.payload["callId"].astext == call_id)
                .first()
            )
            if cancelled is not None:
                db.session.commit()
                return {"accepted": True, "ignored": True, "terminalType": "model.cancelled"}

    existing = (
        TeachingAgentEventOutbox.query.filter_by(
            thread_id=job.thread_id, event_type=event_type,
        )
        .filter(TeachingAgentEventOutbox.payload["callId"].astext == call_id)
        .first()
    )
    if existing is not None:
        if (existing.payload or {}).get("detailSha256") != digest:
            raise ModelJournalError("Model event key was reused with different content", 409)
        db.session.commit()
        return {"accepted": True, "duplicate": True}

    # A result cannot claim to exist without the matching request. Tool calls
    # also require their parent model attempt, so the event chain is complete.
    if is_provider_event:
        validate_provider_chain(job, call_id, event_type, detail, transport_id)
    elif is_tool_event or is_step_event:
        requested = (
            TeachingAgentEventOutbox.query.filter_by(
                thread_id=job.thread_id, event_type="model.requested",
            )
            .filter(TeachingAgentEventOutbox.payload["callId"].astext == parent_call_id)
            .first()
        )
        if requested is None:
            raise ModelJournalError("Parent model request event is missing", 409)
        if is_step_event:
            if (requested.payload or {}).get("detail", {}).get("stepJournalVersion") != 1:
                raise ModelJournalError("Parent model request has no step journal", 409)
            terminal = (
                TeachingAgentEventOutbox.query.filter(
                    TeachingAgentEventOutbox.thread_id == job.thread_id,
                    TeachingAgentEventOutbox.event_type.in_(MODEL_TERMINAL_TYPES),
                )
                .filter(TeachingAgentEventOutbox.payload["callId"].astext == parent_call_id)
                .first()
            )
            if terminal is not None:
                raise ModelJournalError("Parent model call already finished", 409)
            if detail["stepNumber"] > 0:
                previous = (
                    TeachingAgentEventOutbox.query.filter_by(
                        thread_id=job.thread_id, event_type="model.step",
                    )
                    .filter(TeachingAgentEventOutbox.payload["callId"].astext ==
                            f"{parent_call_id}:step:{detail['stepNumber']}")
                    .first()
                )
                if previous is None:
                    raise ModelJournalError("Prior model step event is missing", 409)
        elif event_type == "tool.result":
            called = (
                TeachingAgentEventOutbox.query.filter_by(
                    thread_id=job.thread_id, event_type="tool.call",
                )
                .filter(TeachingAgentEventOutbox.payload["callId"].astext == call_id)
                .first()
            )
            if called is None or (called.payload or {}).get("detail", {}).get("parentCallId") != parent_call_id:
                raise ModelJournalError("Tool call event is missing", 409)
        else:
            terminal = (
                TeachingAgentEventOutbox.query.filter(
                    TeachingAgentEventOutbox.thread_id == job.thread_id,
                    TeachingAgentEventOutbox.event_type.in_(MODEL_TERMINAL_TYPES),
                )
                .filter(TeachingAgentEventOutbox.payload["callId"].astext == parent_call_id)
                .first()
            )
            if terminal is not None:
                raise ModelJournalError("Parent model call already finished", 409)
    elif event_type != "model.requested":
        requested = (
            TeachingAgentEventOutbox.query.filter_by(
                thread_id=job.thread_id, event_type="model.requested",
            )
            .filter(TeachingAgentEventOutbox.payload["callId"].astext == call_id)
            .first()
        )
        if requested is None:
            raise ModelJournalError("Model request event is missing", 409)
        conflict = (
            TeachingAgentEventOutbox.query.filter(
                TeachingAgentEventOutbox.thread_id == job.thread_id,
                TeachingAgentEventOutbox.event_type.in_(MODEL_TERMINAL_TYPES - {event_type}),
            )
            .filter(TeachingAgentEventOutbox.payload["callId"].astext == call_id)
            .first()
        )
        if conflict is not None:
            raise ModelJournalError("Model call already has a different outcome", 409)
        if event_type == "model.settled":
            if (requested.payload or {}).get("detail", {}).get("transportJournalVersion") == 1:
                require_finished_provider_calls(job, call_id)
            if (requested.payload or {}).get("detail", {}).get("stepJournalVersion") == 1:
                steps_count = detail.get("stepsCount")
                if type(steps_count) is not int or steps_count < 1 or steps_count > 100:
                    raise ModelJournalError("Model step count is invalid", 409)
                step_rows = (
                    TeachingAgentEventOutbox.query.filter_by(
                        thread_id=job.thread_id, event_type="model.step",
                    )
                    .filter(TeachingAgentEventOutbox.payload["detail"]["parentCallId"].astext == call_id)
                    .all()
                )
                observed_steps = {row.payload["detail"]["stepNumber"] for row in step_rows}
                if observed_steps != set(range(steps_count)) or len(step_rows) != steps_count:
                    raise ModelJournalError("Model step journal is incomplete", 409)
            called_rows = (
                TeachingAgentEventOutbox.query.filter_by(
                    thread_id=job.thread_id, event_type="tool.call",
                )
                .filter(TeachingAgentEventOutbox.payload["detail"]["parentCallId"].astext == call_id)
                .all()
            )
            for called in called_rows:
                result = (
                    TeachingAgentEventOutbox.query.filter_by(
                        thread_id=job.thread_id, event_type="tool.result",
                    )
                    .filter(TeachingAgentEventOutbox.payload["callId"].astext == called.payload["callId"])
                    .first()
                )
                if result is None:
                    raise ModelJournalError("Tool result event is missing", 409)

    db.session.add(TeachingAgentEventOutbox(
        thread_id=job.thread_id,
        event_type=event_type,
        payload={
            "schemaVersion": 1,
            "jobId": job.id,
            "attemptCount": attempt_count,
            "callId": call_id,
            "detailSha256": digest,
            "detail": detail,
        },
    ))
    db.session.commit()
    return {"accepted": True, "duplicate": False}


def close_canceled_model_calls(job):
    if job.kind != "agent.chat" or not job.thread_id or job.status != "CANCELED":
        return {"models": 0, "tools": 0}
    for call_id, detail in canceled_provider_details(job):
        encoded = json.dumps(detail, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        db.session.add(TeachingAgentEventOutbox(
            thread_id=job.thread_id, event_type="provider.finished",
            payload={
                "schemaVersion": 1, "jobId": job.id, "attemptCount": job.attempt_count, "callId": call_id,
                "detailSha256": hashlib.sha256(encoded).hexdigest(), "detail": detail,
            },
        ))
    rows = (
        TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id)
        .filter(
            TeachingAgentEventOutbox.payload["jobId"].astext == job.id,
            TeachingAgentEventOutbox.payload["attemptCount"].astext == str(job.attempt_count),
            TeachingAgentEventOutbox.event_type.in_(MODEL_TERMINAL_TYPES | {"model.requested", "tool.call", "tool.result"}),
        )
        .all()
    )
    finished_models = {row.payload["callId"] for row in rows if row.event_type in MODEL_TERMINAL_TYPES}
    finished_tools = {row.payload["callId"] for row in rows if row.event_type == "tool.result"}
    counts = {"models": 0, "tools": 0}
    for row in sorted(rows, key=lambda item: item.event_type != "tool.call"):
        if row.event_type == "tool.call" and row.payload["callId"] not in finished_tools:
            original = row.payload.get("detail") or {}
            detail = {key: original[key] for key in ("parentCallId", "toolCallId", "toolName")}
            detail.update(status="cancelled", terminationSource="job-cancellation")
            event_type = "tool.result"
            counts["tools"] += 1
        elif row.event_type == "model.requested" and row.payload["callId"] not in finished_models:
            detail = {"terminationSource": "job-cancellation", "reason": "job-cancelled"}
            event_type = "model.cancelled"
            counts["models"] += 1
        else:
            continue
        encoded = json.dumps(detail, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        db.session.add(TeachingAgentEventOutbox(
            thread_id=job.thread_id,
            event_type=event_type,
            payload={
                "schemaVersion": 1,
                "jobId": job.id,
                "attemptCount": job.attempt_count,
                "callId": row.payload["callId"],
                "detailSha256": hashlib.sha256(encoded).hexdigest(),
                "detail": detail,
            },
        ))
    db.session.flush()
    return counts

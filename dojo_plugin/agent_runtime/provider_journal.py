import base64
import hashlib
import re
from urllib.parse import parse_qs, urlsplit

from ..models import TeachingAgentEventOutbox


PROVIDER_EVENT_TYPES = frozenset({"provider.request", "provider.response", "provider.chunk", "provider.finished"})
SAFE_HEADERS = frozenset({
    "accept", "content-type", "content-length", "content-encoding", "anthropic-version",
    "anthropic-beta", "api-version", "x-request-id", "request-id", "openai-processing-ms", "retry-after",
})


def _error(message, status=409):
    from .model_journal import ModelJournalError
    raise ModelJournalError(message, status)


def _integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def _headers(value):
    return isinstance(value, dict) and all(
        key in SAFE_HEADERS and isinstance(item, str) and len(item) <= 2000 for key, item in value.items()
    )


def decode_provider_bytes(detail, maximum):
    encoded = detail.get("bodyBase64")
    if not isinstance(encoded, str) or len(encoded) > ((maximum + 2) // 3) * 4:
        _error("Invalid provider byte encoding", 400)
    try:
        data = base64.b64decode(encoded, validate=True)
    except ValueError:
        _error("Invalid provider byte encoding", 400)
    if (
        not _integer(detail.get("byteLength"), 0, maximum) or len(data) != detail["byteLength"]
        or base64.b64encode(data).decode() != encoded
        or hashlib.sha256(data).hexdigest() != detail.get("bodySha256")
    ):
        _error("Provider byte digest or length does not match", 400)
    return data


def validate_provider_event(job_id, attempt, call_id, event_type, detail):
    parent = detail.get("parentCallId")
    number = detail.get("transportNumber")
    if (
        not isinstance(parent, str) or not re.fullmatch(re.escape(f"{job_id}:{attempt}:") + r"[1-9][0-9]*", parent)
        or not _integer(number, 1, 100)
    ):
        _error("Invalid provider transport identity", 400)
    transport_id = f"{parent}:http:{number}"
    expected = f"{transport_id}:chunk:{detail.get('chunkNumber')}" if event_type == "provider.chunk" else transport_id
    if call_id != expected:
        _error("Invalid provider event identity", 400)
    if event_type == "provider.request":
        url = detail.get("url")
        try:
            parts = urlsplit(url) if isinstance(url, str) else None
            safe_query = parts is not None and all(
                key in {"alt", "api-version"} or values == ["[redacted]"]
                for key, values in parse_qs(parts.query, keep_blank_values=True).items()
            )
        except ValueError:
            parts, safe_query = None, False
        if (
            parts is None or parts.scheme not in {"http", "https"} or not parts.hostname
            or parts.username or parts.password or parts.fragment or not safe_query
            or not _headers(detail.get("headers")) or detail.get("bodyEncoding") != "base64"
            or detail.get("method") != "POST"
            or any(not isinstance(detail.get(key), str) or not detail[key] or len(detail[key]) > 256
                   for key in ("providerId", "providerType", "modelId"))
        ):
            _error("Invalid provider request envelope", 400)
        decode_provider_bytes(detail, 4 * 1024 * 1024)
    elif event_type == "provider.response":
        if (
            not _integer(detail.get("status"), 100, 599) or not _headers(detail.get("headers"))
            or detail.get("bodyEncoding") != "base64" or detail.get("bodySemantics") != "fetch-decoded-body"
        ):
            _error("Invalid provider response envelope", 400)
    elif event_type == "provider.chunk":
        if not _integer(detail.get("chunkNumber"), 1, 4096) or not _integer(detail.get("offset"), 0, 32 * 1024 * 1024):
            _error("Invalid provider chunk position", 400)
        if not decode_provider_bytes(detail, 64 * 1024):
            _error("Empty provider chunk", 400)
    elif (
        detail.get("status") not in {"completed", "failed", "cancelled"}
        or not _integer(detail.get("chunksCount"), 0, 4096)
        or not _integer(detail.get("byteLength"), 0, 32 * 1024 * 1024)
        or not isinstance(detail.get("bodySha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", detail["bodySha256"])
    ):
        _error("Invalid provider transport outcome", 400)
    return transport_id


def _event(thread_id, kind, call_id):
    return TeachingAgentEventOutbox.query.filter_by(thread_id=thread_id, event_type=kind).filter(
        TeachingAgentEventOutbox.payload["callId"].astext == call_id,
    ).first()


def provider_prefix(thread_id, transport_id):
    rows = TeachingAgentEventOutbox.query.filter_by(thread_id=thread_id, event_type="provider.chunk").filter(
        TeachingAgentEventOutbox.payload["callId"].astext.startswith(transport_id + ":chunk:"),
    ).all()
    ordered = sorted(rows, key=lambda row: row.payload["detail"]["chunkNumber"])
    digest = hashlib.sha256()
    byte_length = 0
    for index, row in enumerate(ordered, 1):
        detail = row.payload["detail"]
        if detail["chunkNumber"] != index or detail["offset"] != byte_length:
            _error("Provider chunk journal is incomplete")
        data = decode_provider_bytes(detail, 64 * 1024)
        digest.update(data)
        byte_length += len(data)
    return {"chunksCount": len(rows), "byteLength": byte_length, "bodySha256": digest.hexdigest()}


def validate_provider_chain(job, call_id, event_type, detail, transport_id):
    from .model_journal import MODEL_TERMINAL_TYPES
    parent = detail["parentCallId"]
    requested = _event(job.thread_id, "model.requested", parent)
    if requested is None or requested.payload.get("detail", {}).get("transportJournalVersion") != 1:
        _error("Parent model request has no provider transport journal")
    if TeachingAgentEventOutbox.query.filter(
        TeachingAgentEventOutbox.thread_id == job.thread_id,
        TeachingAgentEventOutbox.event_type.in_(MODEL_TERMINAL_TYPES),
        TeachingAgentEventOutbox.payload["callId"].astext == parent,
    ).first():
        _error("Parent model call already finished")
    if event_type == "provider.request":
        if detail["transportNumber"] > 1 and not _event(job.thread_id, "provider.request", f"{parent}:http:{detail['transportNumber'] - 1}"):
            _error("Prior provider request event is missing")
        return
    if not _event(job.thread_id, "provider.request", transport_id):
        _error("Provider request event is missing")
    if _event(job.thread_id, "provider.finished", transport_id):
        _error("Provider transport already finished")
    response = _event(job.thread_id, "provider.response", transport_id)
    if event_type == "provider.chunk":
        if response is None:
            _error("Provider response event is missing")
        previous = _event(job.thread_id, "provider.chunk", f"{transport_id}:chunk:{detail['chunkNumber'] - 1}") if detail["chunkNumber"] > 1 else None
        expected_offset = previous.payload["detail"]["offset"] + previous.payload["detail"]["byteLength"] if previous else 0
        if (detail["chunkNumber"] > 1 and previous is None) or detail["offset"] != expected_offset or detail["offset"] + detail["byteLength"] > 32 * 1024 * 1024:
            _error("Provider chunk is not contiguous")
    elif event_type == "provider.finished":
        if detail["status"] == "completed" and response is None:
            _error("Complete provider transport has no response")
        prefix = provider_prefix(job.thread_id, transport_id)
        if any(detail[key] != value for key, value in prefix.items()):
            _error("Provider outcome does not match the recorded bytes")


def require_finished_provider_calls(job, parent):
    requests = TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id, event_type="provider.request").filter(
        TeachingAgentEventOutbox.payload["detail"]["parentCallId"].astext == parent,
    ).all()
    if not requests or any(not _event(job.thread_id, "provider.finished", row.payload["callId"]) for row in requests):
        _error("Provider transport journal is incomplete")
    last = max(requests, key=lambda row: row.payload["detail"]["transportNumber"])
    ending = _event(job.thread_id, "provider.finished", last.payload["callId"])
    response = _event(job.thread_id, "provider.response", last.payload["callId"])
    if ending.payload["detail"]["status"] != "completed" or response is None or not 200 <= response.payload["detail"]["status"] < 300:
        _error("Final provider transport did not complete successfully")


def canceled_provider_details(job):
    requests = TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id, event_type="provider.request").filter(
        TeachingAgentEventOutbox.payload["jobId"].astext == job.id,
        TeachingAgentEventOutbox.payload["attemptCount"].astext == str(job.attempt_count),
    ).all()
    for row in requests:
        transport_id = row.payload["callId"]
        if not _event(job.thread_id, "provider.finished", transport_id):
            original = row.payload["detail"]
            yield transport_id, {
                "parentCallId": original["parentCallId"], "transportNumber": original["transportNumber"],
                "status": "cancelled", "terminationSource": "job-cancellation", "providerOutcomeKnown": False,
                **provider_prefix(job.thread_id, transport_id),
            }

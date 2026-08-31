import datetime
from dataclasses import asdict, dataclass, field


CONTRACT_VERSION = "2026-08-28"

PRODUCT_CONTRACT_SCHEMAS = {
    "successEnvelope": {
        "type": "object",
        "required": ["success", "data", "meta"],
        "properties": {
            "success": {"const": True},
            "data": {},
            "meta": {"$ref": "#/$defs/meta"},
        },
        "additionalProperties": False,
    },
    "errorEnvelope": {
        "type": "object",
        "required": ["success", "error", "meta"],
        "properties": {
            "success": {"const": False},
            "error": {
                "type": "object",
                "required": ["code", "message", "fieldErrors", "retryable", "recovery", "status"],
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                    "fieldErrors": {"type": "array"},
                    "retryable": {"type": "boolean"},
                    "recovery": {"type": ["object", "null"]},
                    "status": {"type": "integer", "minimum": 400, "maximum": 599},
                },
            },
            "meta": {"$ref": "#/$defs/meta"},
        },
        "additionalProperties": False,
    },
    "resourceSummary": {
        "type": "object",
        "required": [
            "id", "type", "title", "context", "availability", "workflow",
            "capabilities", "hrefs", "timestamps", "evidence", "metadata",
        ],
        "properties": {
            "id": {"type": "string", "minLength": 1},
            "type": {"type": "string", "minLength": 1},
            "title": {"type": "string", "minLength": 1},
            "context": {"type": "object"},
            "availability": {"$ref": "#/$defs/availability"},
            "workflow": {"$ref": "#/$defs/workflow"},
            "capabilities": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
            "hrefs": {"type": "object"},
            "timestamps": {"type": "object"},
            "evidence": {"type": "object"},
            "metadata": {"type": "object"},
        },
        "additionalProperties": False,
    },
    "$defs": {
        "meta": {
            "type": "object",
            "required": ["requestId", "contractVersion", "serverTime"],
            "properties": {
                "requestId": {"type": ["string", "null"]},
                "contractVersion": {"const": CONTRACT_VERSION},
                "serverTime": {"type": "string"},
            },
        },
        "availability": {
            "type": "object",
            "required": ["state", "reasonCode", "replacement"],
            "properties": {
                "state": {
                    "enum": ["archived", "available", "deleted", "forbidden", "moved"]
                },
                "reasonCode": {"type": ["string", "null"]},
                "replacement": {"type": ["object", "null"]},
            },
        },
        "workflow": {
            "type": "object",
            "required": ["state", "version"],
            "properties": {
                "state": {"enum": ["draft", "queued", "running", "validating", "needs_review", "partial_success", "published", "failed", "canceled"]},
                "version": {"type": "integer", "minimum": 1},
            },
        },
    },
}

STATE_DOMAINS = {
    "view": frozenset(
        {
            "initial",
            "loading",
            "ready",
            "empty",
            "degraded",
            "error",
            "stale",
            "forbidden",
        }
    ),
    "availability": frozenset(
        {"available", "moved", "archived", "deleted", "forbidden"}
    ),
    "workflow": frozenset(
        {
            "draft",
            "queued",
            "running",
            "validating",
            "needs_review",
            "partial_success",
            "published",
            "failed",
            "canceled",
        }
    ),
    "activity": frozenset(
        {"not_started", "in_progress", "submitted", "completed"}
    ),
    "mastery": frozenset(
        {"unknown", "emerging", "developing", "proficient", "mastered"}
    ),
    "assessment": frozenset(
        {"not_applicable", "pending", "ready", "failed"}
    ),
    "evidence": frozenset({"none", "partial", "complete", "invalid"}),
    "runtime": frozenset(
        {
            "none",
            "provisioning",
            "running",
            "stopping",
            "stopped",
            "expired",
            "failed",
        }
    ),
}

SAFE_FALLBACKS = {
    "view": "error",
    "availability": "forbidden",
    "workflow": "needs_review",
    "activity": "not_started",
    "mastery": "unknown",
    "assessment": "failed",
    "evidence": "invalid",
    "runtime": "failed",
}

STATE_ALIASES = {
    "pending_review": "needs_review",
    "review": "needs_review",
    "partial": "partial_success",
    "complete": "completed",
    "succeeded": "completed",
    "success": "ready",
    "active": "in_progress",
    "starting": "provisioning",
    "started": "running",
    "terminated": "stopped",
    "gone": "deleted",
}


def utc_timestamp(value=None):
    source = value or datetime.datetime.now(datetime.timezone.utc)
    if source.tzinfo is None:
        source = source.replace(tzinfo=datetime.timezone.utc)
    return source.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_state(domain, value):
    domain_key = str(domain or "").strip().lower()
    if domain_key not in STATE_DOMAINS:
        raise ValueError(f"Unknown state domain: {domain_key}")
    raw = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    candidate = STATE_ALIASES.get(raw, raw)
    if candidate in STATE_DOMAINS[domain_key]:
        return {"state": candidate, "known": True}
    return {
        "state": SAFE_FALLBACKS[domain_key],
        "known": False,
        "rawState": raw[:80] or None,
    }


def success_envelope(data, *, request_id=None, meta=None):
    metadata = {
        "requestId": request_id,
        "contractVersion": CONTRACT_VERSION,
        "serverTime": utc_timestamp(),
    }
    metadata.update(meta or {})
    return {"success": True, "data": data, "meta": metadata}


def error_envelope(
    code,
    message,
    *,
    request_id=None,
    status=500,
    field_errors=None,
    retryable=False,
    recovery=None,
    meta=None,
):
    metadata = {
        "requestId": request_id,
        "contractVersion": CONTRACT_VERSION,
        "serverTime": utc_timestamp(),
    }
    metadata.update(meta or {})
    return {
        "success": False,
        "error": {
            "code": str(code or "UNKNOWN_ERROR")[:80],
            "message": str(message or "当前操作暂时无法完成。")[:1000],
            "fieldErrors": list(field_errors or []),
            "retryable": bool(retryable),
            "recovery": recovery,
            "status": int(status),
        },
        "meta": metadata,
    }


def page_info(*, page=1, page_size=24, total=0, cursor=None, next_cursor=None):
    page = max(1, int(page or 1))
    page_size = max(1, min(100, int(page_size or 24)))
    total = max(0, int(total or 0))
    return {
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": max(1, (total + page_size - 1) // page_size),
        "cursor": cursor,
        "nextCursor": next_cursor,
    }


@dataclass(frozen=True)
class ResourceSummary:
    id: str
    type: str
    title: str
    context: dict = field(default_factory=dict)
    availability: dict = field(
        default_factory=lambda: {"state": "available", "reasonCode": None, "replacement": None}
    )
    workflow: dict = field(default_factory=lambda: {"state": "published", "version": 1})
    capabilities: tuple = field(default_factory=tuple)
    hrefs: dict = field(default_factory=dict)
    timestamps: dict = field(default_factory=dict)
    evidence: dict = field(
        default_factory=lambda: {"coverage": None, "quality": "unknown"}
    )
    metadata: dict = field(default_factory=dict)

    def as_dict(self):
        value = asdict(self)
        value["capabilities"] = list(self.capabilities)
        return value

import hashlib


FORBIDDEN_FIELDS = frozenset(
    {
        "answer",
        "password",
        "token",
        "flag",
        "submission",
        "submissionbody",
        "chat",
        "chattext",
        "prompt",
        "fullprompt",
        "studenttext",
        "ip",
    }
)

EVENT_FIELDS = frozenset(
    {
        "name",
        "eventVersion",
        "journeyId",
        "mode",
        "surface",
        "resource",
        "action",
        "fromState",
        "toState",
        "result",
        "reasonCode",
        "durationMs",
        "requestId",
        "client",
    }
)

CLIENT_FIELDS = frozenset(
    {"viewportClass", "offline", "connectionType", "reducedMotion"}
)

PRODUCT_EVENT_NAMES = frozenset(
    {
        "resource_action_completed",
        "unknown_state",
        "recovery_selected",
        "view_state_changed",
        "state_contradiction",
        "request_failed",
        "route_redirected",
        "performance_vital",
    }
)


def _normalized_key(value):
    return str(value).replace("_", "").replace("-", "").casefold()


def _all_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield _normalized_key(key)
            yield from _all_keys(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _all_keys(child)


def opaque_scope_id(value, salt="aisecedu-product-telemetry"):
    return hashlib.sha256(f"{salt}:{value}".encode()).hexdigest()[:20]


def sanitize_event(payload):
    source = payload if isinstance(payload, dict) else {}
    lower_keys = set(_all_keys(source))
    if lower_keys & FORBIDDEN_FIELDS:
        raise ValueError("事件包含不允许采集的内容。")
    result = {key: source[key] for key in EVENT_FIELDS if key in source}
    name = str(result.get("name") or "").strip().lower()
    if name not in PRODUCT_EVENT_NAMES:
        raise ValueError("事件名称不在隐私白名单中。")
    result["name"] = name
    result["eventVersion"] = max(1, min(10, int(result.get("eventVersion") or 1)))
    resource = result.get("resource")
    if isinstance(resource, dict):
        resource_id = resource.get("id")
        id_hash = resource.get("idHash")
        result["resource"] = {
            "type": str(resource.get("type") or "resource")[:48],
            "idHash": (
                opaque_scope_id(resource_id)
                if resource_id is not None
                else str(id_hash or "")[:64] or None
            ),
        }
    elif "resource" in result:
        result.pop("resource")
    client = result.get("client")
    if isinstance(client, dict):
        result["client"] = {
            key: client[key]
            for key in CLIENT_FIELDS
            if key in client
        }
        for key in ("offline", "reducedMotion"):
            if key in result["client"]:
                result["client"][key] = bool(result["client"][key])
        for key in ("viewportClass", "connectionType"):
            if key in result["client"]:
                result["client"][key] = str(result["client"][key])[:32]
    elif "client" in result:
        result.pop("client")
    for key in ("journeyId", "mode", "surface", "action", "fromState", "toState", "result", "reasonCode", "requestId"):
        if key in result and result[key] is not None:
            result[key] = str(result[key])[:160]
    if "durationMs" in result:
        result["durationMs"] = max(0, min(86_400_000, int(result["durationMs"] or 0)))
    return result

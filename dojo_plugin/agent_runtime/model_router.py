import hashlib
import json
import re

from .. import config


COMPLEX_KINDS = {
    "attack-defense-scene",
    "classroom-scenario",
    "cyber-range",
    "debate",
    "roleplay",
    "simulation",
    "topology",
    "vulnerable-lab",
}

COMPLEX_HINTS = re.compile(
    r"攻防|靶场|复杂场景|多智能体|辩论|角色扮演|拓扑|联动|处置推演|"
    r"attack.?defen[cs]e|cyber.?range|multi.?agent|role.?play|topology",
    re.IGNORECASE,
)


def is_complex_scene(kind, prompt="", payload=None):
    kind = str(kind or "").strip().lower()
    if kind == "agent.chat":
        return True
    payload = payload if isinstance(payload, dict) else {}
    artifact_kind = str(
        payload.get("artifactType")
        or payload.get("artifactKind")
        or payload.get("kind")
        or ""
    ).strip().lower()
    if (
        kind in COMPLEX_KINDS
        or kind.startswith("complex-")
        or artifact_kind in COMPLEX_KINDS
        or artifact_kind.startswith("complex-")
    ):
        return True
    # Revisions preserve the durable artifact type.  Their payload contains the
    # whole existing render tree, which can legitimately include many steps,
    # scenes, and historical "attack-defense" labels even for a normal slide
    # deck.  Do not let that inherited content upgrade a lightweight deck edit
    # to the complex model; truly complex revision types have already returned
    # above from their trusted artifact type.
    if kind == "artifact.revise" and artifact_kind:
        return False
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    # Only the current request may semantically promote a job to the complex
    # model.  The payload also contains trusted course context and conversation
    # history; scanning all of it made an unrelated course/module name such as
    # ``Web攻防基础`` route a simple slide deck through deepseek-v4-pro.
    semantic_payload = {
        key: payload.get(key)
        for key in (
            "artifactType",
            "artifactKind",
            "kind",
            "prompt",
            "instruction",
            "brief",
            "scenarioType",
            "taskType",
        )
        if payload.get(key) is not None
    }
    semantic_serialized = json.dumps(
        semantic_payload,
        ensure_ascii=False,
        sort_keys=True,
    )
    if COMPLEX_HINTS.search(f"{prompt}\n{semantic_serialized}"):
        return True
    if len(prompt) + len(serialized) >= 120_000:
        return True

    source_materials = payload.get("sourceMaterials")
    if (
        isinstance(source_materials, list)
        and len(source_materials) >= 2
        and len(serialized) >= 32_000
    ):
        return True

    def largest_named_list(value, names, depth=0):
        if depth >= 6:
            return 0
        if isinstance(value, dict):
            size = max(
                (
                    len(item)
                    for key, item in value.items()
                    if str(key).lower() in names and isinstance(item, list)
                ),
                default=0,
            )
            return max(
                size,
                max(
                    (largest_named_list(item, names, depth + 1) for item in value.values()),
                    default=0,
                ),
            )
        if isinstance(value, list):
            return max(
                (largest_named_list(item, names, depth + 1) for item in value[:200]),
                default=0,
            )
        return 0

    if largest_named_list(payload, {"agents", "roles"}) >= 3:
        return True
    if largest_named_list(payload, {"nodes", "scenes", "stages", "steps"}) >= 6:
        return True
    if largest_named_list(payload, {"rounds", "turns"}) >= 3:
        return True
    try:
        failure_count = int(
            payload.get("validationFailures") or payload.get("repairAttempts") or 0
        )
    except (TypeError, ValueError):
        failure_count = 0
    if failure_count >= 2:
        return True
    return bool(payload.get("crossArtifactConsistency") or payload.get("scenarioBundle"))


def route_model(kind, *, prompt="", payload=None, allow_degraded=False):
    complex_scene = is_complex_scene(kind, prompt=prompt, payload=payload)
    actual_model = (
        config.DOJO_AI_COMPLEX_SCENE_MODEL
        if complex_scene
        else config.DOJO_AI_AUTHORING_PLAN_MODEL
    )
    return {
        "route": "deepseek-v4-pro" if complex_scene else "teaching-default",
        "provider": "deepseek",
        "actual_model": actual_model,
        "required_model": (
            config.DOJO_AI_COMPLEX_SCENE_MODEL if complex_scene else None
        ),
        "allow_degraded": bool(allow_degraded),
        "degraded": False,
        "request_hash": hashlib.sha256(
            json.dumps(
                {"kind": kind, "prompt": prompt, "payload": payload or {}},
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest(),
    }


def validate_actual_model(route, actual_model):
    required = route.get("required_model")
    if required and actual_model != required:
        if not route.get("allow_degraded"):
            raise ValueError(
                f"Complex scene requires {required}; silent fallback to {actual_model} is forbidden"
            )
        route = {**route, "degraded": True}
    return route

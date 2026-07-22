import datetime
import hashlib
import json
import re

from sqlalchemy import func

from CTFd.models import db

from ..models import LearningAttempts, LearningChallengeProfiles, LearningEvidenceEvents


SENSITIVE_KEYS = (
    "authorization",
    "cookie",
    "credential",
    "flag",
    "password",
    "provided",
    "secret",
    "token",
)

SENSITIVE_PATTERNS = (
    (re.compile(r"pwn\.college\{[^}\r\n]+\}", re.IGNORECASE), "[REDACTED_FLAG]"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE), "Bearer [REDACTED]"),
    (
        re.compile(
            r"(?i)\b(password|passwd|token|secret|api[_-]?key|authorization)\s*=\s*([^\s;&|]+)"
        ),
        r"\1=[REDACTED]",
    ),
    (
        re.compile(r"(?i)(--(?:password|token|secret|api-key)\s+)([^\s;&|]+)"),
        r"\1[REDACTED]",
    ),
)

ALLOWED_WORKSPACE_EVENTS = {
    "terminal.command.completed",
    "terminal.command.failed",
    "workspace.file.saved",
    "runtime.state.snapshot",
    "milestone.observed",
    "policy.egress.denied",
}


def utcnow():
    return datetime.datetime.utcnow()


def redact_text(value):
    result = str(value)
    for pattern, replacement in SENSITIVE_PATTERNS:
        result = pattern.sub(replacement, result)
    return result[:8000]


def scrub_payload(value, key=None):
    if key and any(part in key.lower() for part in SENSITIVE_KEYS):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {
            str(item_key)[:128]: scrub_payload(item_value, str(item_key))
            for item_key, item_value in list(value.items())[:100]
        }
    if isinstance(value, list):
        return [scrub_payload(item) for item in value[:100]]
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, (bool, int, float)) or value is None:
        return value
    return redact_text(value)


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def append_evidence(
    attempt,
    event_type,
    payload=None,
    *,
    source="PLATFORM",
    trust_level=3,
    occurred=None,
):
    payload = scrub_payload(payload or {})
    occurred = occurred or utcnow()
    db.session.query(LearningAttempts).filter_by(id=attempt.id).with_for_update().one()
    last = (
        LearningEvidenceEvents.query.filter_by(attempt_id=attempt.id)
        .order_by(LearningEvidenceEvents.sequence.desc())
        .with_for_update()
        .first()
    )
    sequence = (last.sequence + 1) if last else 1
    previous_hash = last.event_hash if last else "0" * 64
    material = canonical_json(
        {
            "attemptId": attempt.id,
            "sequence": sequence,
            "eventType": event_type,
            "source": source,
            "trustLevel": int(max(1, min(4, trust_level))),
            "payload": payload,
            "occurred": occurred.isoformat(timespec="microseconds"),
            "previousHash": previous_hash,
        }
    )
    event_hash = hashlib.sha256(material.encode()).hexdigest()
    event = LearningEvidenceEvents(
        attempt_id=attempt.id,
        sequence=sequence,
        event_type=event_type[:80],
        source=source[:32],
        trust_level=max(1, min(4, int(trust_level))),
        payload=payload,
        previous_hash=previous_hash,
        event_hash=event_hash,
        occurred=occurred,
    )
    db.session.add(event)
    return event


def verify_evidence_chain(attempt_id):
    events = (
        LearningEvidenceEvents.query.filter_by(attempt_id=attempt_id)
        .order_by(LearningEvidenceEvents.sequence)
        .all()
    )
    previous_hash = "0" * 64
    for expected_sequence, event in enumerate(events, 1):
        material = canonical_json(
            {
                "attemptId": event.attempt_id,
                "sequence": event.sequence,
                "eventType": event.event_type,
                "source": event.source,
                "trustLevel": event.trust_level,
                "payload": event.payload,
                "occurred": event.occurred.isoformat(timespec="microseconds"),
                "previousHash": event.previous_hash,
            }
        )
        calculated = hashlib.sha256(material.encode()).hexdigest()
        if (
            event.sequence != expected_sequence
            or event.previous_hash != previous_hash
            or event.event_hash != calculated
        ):
            return {
                "valid": False,
                "events": len(events),
                "failedSequence": event.sequence,
                "head": previous_hash,
            }
        previous_hash = event.event_hash
    return {
        "valid": True,
        "events": len(events),
        "failedSequence": None,
        "head": previous_hash,
    }


def active_attempt(user_id, dojo_challenge=None):
    query = LearningAttempts.query.filter_by(user_id=user_id, status="ACTIVE")
    if dojo_challenge is not None:
        query = query.filter_by(
            dojo_id=dojo_challenge.dojo_id,
            module_index=dojo_challenge.module_index,
            challenge_index=dojo_challenge.challenge_index,
        )
    return query.order_by(LearningAttempts.started.desc()).first()


def start_attempt(user, dojo_challenge, mode, runtime=None):
    now = utcnow()
    for previous in LearningAttempts.query.filter_by(user_id=user.id, status="ACTIVE").all():
        previous.status = "INTERRUPTED"
        previous.completed = now
        append_evidence(
            previous,
            "lab.interrupted",
            {"reason": "workspace-replaced"},
            trust_level=3,
        )
    epoch = (
        db.session.query(func.max(LearningAttempts.epoch))
        .filter_by(
            user_id=user.id,
            dojo_id=dojo_challenge.dojo_id,
            challenge_id=dojo_challenge.challenge_id,
        )
        .scalar()
        or 0
    ) + 1
    runtime = dict(runtime or {})
    profile = LearningChallengeProfiles.query.get(dojo_challenge.challenge_id)
    runtime["challengeVersion"] = profile.version if profile else 1
    attempt = LearningAttempts(
        user_id=user.id,
        dojo_id=dojo_challenge.dojo_id,
        module_index=dojo_challenge.module_index,
        challenge_index=dojo_challenge.challenge_index,
        challenge_id=dojo_challenge.challenge_id,
        epoch=epoch,
        mode=mode,
        data={"runtime": scrub_payload(runtime)},
    )
    db.session.add(attempt)
    db.session.flush()
    append_evidence(
        attempt,
        "lab.started",
        {
            "epoch": epoch,
            "mode": mode,
            "dojo": dojo_challenge.dojo.reference_id,
            "module": dojo_challenge.module.id,
            "challenge": dojo_challenge.id,
            "runtime": runtime,
        },
        trust_level=3,
    )
    append_evidence(
        attempt,
        "runtime.state.snapshot",
        {"state": "READY", "epoch": epoch},
        source="RUNTIME",
        trust_level=3,
    )
    return attempt


def record_flag_check(user, dojo_challenge, accepted):
    attempt = active_attempt(user.id, dojo_challenge)
    if not attempt:
        attempt = start_attempt(user, dojo_challenge, "ASSESSMENT", {"recovered": True})
    append_evidence(
        attempt,
        "flag.compared",
        {"accepted": bool(accepted)},
        source="ORACLE",
        trust_level=4,
    )
    if accepted:
        append_evidence(
            attempt,
            "oracle.observed",
            {"objective": "challenge-solved", "satisfied": True},
            source="ORACLE",
            trust_level=4,
        )
        attempt.status = "SOLVED"
        attempt.submitted = attempt.submitted or utcnow()
        attempt.completed = utcnow()
    return attempt


def save_reflection(attempt, reflection):
    attempt.reflection = redact_text(reflection)[:12000]
    append_evidence(
        attempt,
        "attempt.reflection.saved",
        {"characters": len(attempt.reflection)},
        trust_level=2,
    )
    return attempt


def event_view(event):
    return {
        "id": event.id,
        "sequence": event.sequence,
        "type": event.event_type,
        "source": event.source,
        "trustLevel": event.trust_level,
        "payload": event.payload,
        "previousHash": event.previous_hash,
        "hash": event.event_hash,
        "occurred": event.occurred.isoformat() + "Z",
    }

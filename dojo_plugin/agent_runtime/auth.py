import datetime
import base64
import hashlib
import hmac
import json
import secrets
import time

from flask import request
from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer

from CTFd.models import db

from .. import config
from ..models import AgentRuntimeLaunchTickets
from .scope import AccessScope, ScopeError, user_for_scope


LAUNCH_SALT = "aisecedu-global-agent-launch-v2"
SESSION_SALT = "aisecedu-global-agent-session-v2"
SERVICE_HEADER = "X-AISecEdu-Service-Token"


class AgentRuntimeAuthError(ValueError):
    pass


def _normalize_secret(value, name):
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if not value or len(value) < 24:
        raise AgentRuntimeAuthError(f"{name} is not configured securely")
    return value


def _service_secret():
    return _normalize_secret(
        config.AGENT_RUNTIME_SERVICE_SECRET,
        "Global agent runtime service secret",
    )


def _ticket_secret():
    return _normalize_secret(
        config.AGENT_RUNTIME_TICKET_SECRET,
        "Global agent runtime ticket secret",
    )


def _serializer(salt):
    return URLSafeTimedSerializer(_ticket_secret(), salt=salt)


def _hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _b64url_encode(value):
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64url_decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _mint_session_token(payload):
    encoded = _b64url_encode(
        json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signature = hmac.new(
        _ticket_secret().encode("utf-8"),
        f"{SESSION_SALT}.{encoded}".encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded}.{signature}"


def require_service_auth():
    supplied = request.headers.get(SERVICE_HEADER, "")
    try:
        expected = _service_secret()
    except AgentRuntimeAuthError:
        raise
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise AgentRuntimeAuthError("Invalid global agent runtime service credentials")


def mint_launch_ticket(user, scope: AccessScope, *, target="/"):
    if not target.startswith("/") or target.startswith("//"):
        raise AgentRuntimeAuthError("Invalid global agent runtime target")
    now = datetime.datetime.utcnow()
    nonce = secrets.token_urlsafe(24)
    ticket = AgentRuntimeLaunchTickets(
        user_id=user.id,
        audience="global-agent-runtime",
        scope={**scope.as_dict(), "target": target},
        nonce_hash=_hash(nonce),
        token_hash="pending-" + secrets.token_hex(24),
        expires=now
        + datetime.timedelta(seconds=config.AGENT_RUNTIME_LAUNCH_TTL_SECONDS),
    )
    db.session.add(ticket)
    db.session.flush()
    token = _serializer(LAUNCH_SALT).dumps(
        {
            "version": 1,
            "ticket_id": ticket.id,
            "audience": ticket.audience,
            "nonce": nonce,
        }
    )
    ticket.token_hash = _hash(token)
    db.session.commit()
    return token, ticket.expires


def exchange_launch_ticket(token, *, audience="global-agent-runtime"):
    try:
        payload = _serializer(LAUNCH_SALT).loads(
            token,
            max_age=config.AGENT_RUNTIME_LAUNCH_TTL_SECONDS,
        )
    except SignatureExpired as exc:
        raise AgentRuntimeAuthError("Global agent runtime launch ticket expired") from exc
    except BadData as exc:
        raise AgentRuntimeAuthError("Invalid global agent runtime launch ticket") from exc

    if payload.get("version") != 1 or payload.get("audience") != audience:
        raise AgentRuntimeAuthError("Global agent runtime ticket audience mismatch")

    now = datetime.datetime.utcnow()
    ticket = (
        AgentRuntimeLaunchTickets.query.filter_by(id=payload.get("ticket_id"))
        .with_for_update()
        .first()
    )
    if (
        ticket is None
        or ticket.audience != audience
        or ticket.used is not None
        or ticket.revoked is not None
        or ticket.expires <= now
        or not hmac.compare_digest(ticket.token_hash, _hash(token))
        or not hmac.compare_digest(ticket.nonce_hash, _hash(payload.get("nonce", "")))
    ):
        db.session.rollback()
        raise AgentRuntimeAuthError(
            "Global agent runtime launch ticket is invalid or already used"
        )

    try:
        user, scope = user_for_scope(ticket.scope)
    except ScopeError as exc:
        db.session.rollback()
        raise AgentRuntimeAuthError(str(exc)) from exc

    ticket.used = now
    session_payload = {
        "version": 1,
        "audience": audience,
        "session_id": secrets.token_hex(16),
        "scope": scope.as_dict(),
        "iat": int(time.time()),
        "exp": int(time.time()) + config.AGENT_RUNTIME_SESSION_TTL_SECONDS,
    }
    session_token = _mint_session_token(session_payload)
    db.session.commit()
    return user, scope, session_token, ticket.scope.get("target", "/")


def verify_session_token(token, *, audience="global-agent-runtime"):
    try:
        encoded, supplied = token.split(".", 1)
        expected = hmac.new(
            _ticket_secret().encode("utf-8"),
            f"{SESSION_SALT}.{encoded}".encode("ascii"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(supplied, expected):
            raise AgentRuntimeAuthError("Invalid global agent runtime session")
        payload = json.loads(
            _b64url_decode(encoded).decode("utf-8")
        )
    except AgentRuntimeAuthError:
        raise
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AgentRuntimeAuthError("Invalid global agent runtime session") from exc
    if payload.get("version") != 1 or payload.get("audience") != audience:
        raise AgentRuntimeAuthError("Global agent runtime session audience mismatch")
    if int(payload.get("exp") or 0) <= int(time.time()):
        raise AgentRuntimeAuthError("Global agent runtime session expired")
    try:
        user, scope = user_for_scope(payload.get("scope") or {})
    except ScopeError as exc:
        raise AgentRuntimeAuthError(str(exc)) from exc
    return user, scope, payload.get("session_id")


def bearer_session_token():
    value = request.headers.get("Authorization", "")
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AgentRuntimeAuthError("Global agent runtime session token required")
    return token

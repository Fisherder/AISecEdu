import json
import logging
import os
import re
import threading
import time
from urllib.parse import urlsplit, urlunsplit

from flask import request, g, has_request_context
from CTFd.utils.user import get_current_user

_trace_id_storage = threading.local()
logger = logging.getLogger(__name__)

_SENSITIVE_PATTERNS = (
    # Access loggers pass the request target as an unlabelled formatting
    # argument. Preserve the path for routing diagnostics, but never retain
    # query values because they can contain launch tickets or prompts.
    (
        re.compile(r"((?:https?://|/)[^\s?#\"']*)\?[^\s#\"']+"),
        r"\1?[REDACTED_QUERY]",
    ),
    (re.compile(r"pwn\.college\{[^}\r\n]+\}", re.IGNORECASE), "[REDACTED_FLAG]"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE), "Bearer [REDACTED]"),
    (
        re.compile(
            r"(?i)(\b(?:password|passwd|token|secret|api[_-]?key|authorization)\b\s*[:=]\s*)"
            r"(\"[^\"]*\"|'[^']*'|[^\s,;&|]+)"
        ),
        r"\1[REDACTED]",
    ),
    (
        re.compile(
            r"(?i)([\"'](?:password|passwd|token|secret|api[_-]?key|authorization)[\"']\s*:\s*)"
            r"(\"[^\"]*\"|'[^']*'|[^,}\s]+)"
        ),
        r"\1\"[REDACTED]\"",
    ),
    (re.compile(r"(?i)(\bcookie\s*[:=]\s*)[^\r\n]+"), r"\1[REDACTED]"),
    (
        re.compile(r"(?i)([a-z][a-z0-9+.-]*://[^:/\s@]+:)[^@\s/]+(@)"),
        r"\1[REDACTED]\2",
    ),
)


def _known_secret_values():
    values = []
    for key, value in os.environ.items():
        normalized = key.upper()
        if not any(
            marker in normalized
            for marker in ("PASSWORD", "PASSWD", "SECRET", "TOKEN", "API_KEY", "DB_PASS")
        ):
            continue
        if value and len(value) >= 8:
            values.append(value)
    return tuple(sorted(set(values), key=len, reverse=True))


_KNOWN_SECRET_VALUES = _known_secret_values()
_PRIVATE_LOG_FIELD = re.compile(
    r"^(?:authorization|cookie|set-cookie|api[_-]?key|token|secret|password|"
    r"credential|database(?:_url)?|prompt|messages?|body|raw(?:text|body|content)|"
    r"content|document|material|lesson|file(?:data|content)|excerpts?)$",
    re.IGNORECASE,
)


def redact_log_text(value, limit=8000):
    """Return a bounded log-safe string without request or credential material."""
    result = str(value)
    for secret in _KNOWN_SECRET_VALUES:
        result = result.replace(secret, "[REDACTED_SECRET]")
    for pattern, replacement in _SENSITIVE_PATTERNS:
        result = pattern.sub(replacement, result)
    return result[:limit]


def _safe_log_value(value, *, key=None, depth=0, seen=None):
    if key is not None and _PRIVATE_LOG_FIELD.fullmatch(str(key)):
        return "[REDACTED]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, (str, bytes)):
        return redact_log_text(value)
    if depth >= 6:
        return "[TRUNCATED]"
    seen = seen or set()
    identity = id(value)
    if identity in seen:
        return "[CIRCULAR]"
    seen.add(identity)
    if isinstance(value, dict):
        return {
            str(item_key)[:128]: _safe_log_value(
                item_value,
                key=item_key,
                depth=depth + 1,
                seen=seen,
            )
            for item_key, item_value in list(value.items())[:100]
        }
    if isinstance(value, tuple):
        return tuple(
            _safe_log_value(item, depth=depth + 1, seen=seen)
            for item in value[:100]
        )
    if isinstance(value, (list, set, frozenset)):
        return [
            _safe_log_value(item, depth=depth + 1, seen=seen)
            for item in list(value)[:100]
        ]
    return redact_log_text(value)


def _field_names(value):
    if not value:
        return None
    return json.dumps(sorted(str(key)[:128] for key in value.keys())[:100])


def _json_shape(value):
    if isinstance(value, dict):
        return json.dumps({"type": "object", "fields": sorted(map(str, value.keys()))[:100]})
    if isinstance(value, list):
        return json.dumps({"type": "array", "length": len(value)})
    if value is None:
        return None
    return json.dumps({"type": type(value).__name__})


def _safe_referrer(value):
    if not value:
        return None
    try:
        parts = urlsplit(value)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))[:2048]
    except (TypeError, ValueError):
        return "[INVALID_REFERRER]"

def log_exception(error, event_type="exception"):
    event = event_type
    error_type = type(error).__name__
    error_message = redact_log_text(error, limit=2000)
    method = request.method
    endpoint = request.path
    base_url = request.base_url
    ip_address = request.remote_addr
    user_agent = request.user_agent.string if request.user_agent else None
    referrer = _safe_referrer(request.referrer)
    query_params = _field_names(request.args)
    form_data = _field_names(request.form)
    json_data = _json_shape(request.get_json(silent=True))
    content_type = request.content_type
    content_length = request.content_length

    prefix = event_type.upper()

    logger.error(
        f"{prefix} {event=} {error_type=} {error_message=} "
        f"{method=} {endpoint=} {base_url=} {ip_address=} {user_agent=} {referrer=} "
        f"{query_params=} {form_data=} {json_data=} {content_type=} {content_length=}",
        exc_info=True
    )

def get_tracked_attr(attr, default="NONE"):
    try:
        if has_request_context():
            return getattr(g, attr)
    except (RuntimeError, AttributeError):
        pass

    try:
        return getattr(_trace_id_storage, attr)
    except AttributeError:
        pass

    return default


def get_trace_id():
    return get_tracked_attr("trace_id", default="NONE")


def set_background_trace_context(trace_id, user_id=None):
    _trace_id_storage.trace_id = str(trace_id or "NONE")[:64]
    _trace_id_storage.user_id = user_id
    _trace_id_storage.start_time = time.time()


def clear_background_trace_context():
    for attribute in ("trace_id", "user_id", "remote_addr", "start_time"):
        if hasattr(_trace_id_storage, attribute):
            delattr(_trace_id_storage, attribute)

def get_user_id():
    try:
        user = get_current_user()
        return user.id if user else None
    except RuntimeError:
        return getattr(_trace_id_storage, "user_id", None)

def get_ip_address():
    try:
        return request.remote_addr
    except RuntimeError:
        return getattr(_trace_id_storage, "remote_addr", None)

class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.msg = _safe_log_value(record.msg)
        if isinstance(record.args, dict):
            record.args = {
                key: _safe_log_value(value, key=key)
                for key, value in record.args.items()
            }
        elif isinstance(record.args, tuple):
            record.args = _safe_log_value(record.args)
        if record.exc_info:
            traceback_text = logging.Formatter().formatException(record.exc_info)
            record.exc_text = redact_log_text(traceback_text)
            record.exc_info = None
        record.trace_id = get_trace_id()
        record.user_id = get_user_id()
        record.remote_addr = get_ip_address()
        record.reltime = "%.2f" % (time.time() - get_tracked_attr("start_time", time.time()))
        record.name = record.name.replace("CTFd.plugins.dojo_plugin", "dojo_plugin")
        return True


def setup_uncaught_error_logging(app):
    @app.errorhandler(Exception)
    def handle_page_exception(error):
        if hasattr(error, 'code') and error.code == 404:
            raise

        log_exception(error, event_type="page_exception")
        raise

def setup_trace_id_tracking(app):
    def before_request_handler():
        # not all requests are via nginx (health checks, direct access)
        trace_id = (
            request.headers.get('PWN-Trace-ID')
            or request.headers.get('X-Trace-ID')
            or "LOCAL"
        )[:64]
        user = get_current_user()
        start_time = time.time()

        # save stuff to request object because it might have a tighter lifespan?
        try:
            if has_request_context():
                g.trace_id = trace_id
                g.start_time = start_time
        except RuntimeError:
            pass

        # werkzeug's logger doesn't have access to the flask requests or g objects
        _trace_id_storage.trace_id = trace_id
        _trace_id_storage.user_id = user.id if user else None
        _trace_id_storage.remote_addr = request.remote_addr
        _trace_id_storage.start_time = start_time

    def teardown_request_handler(exception=None):
        try:
            if has_request_context() and hasattr(g, 'trace_id'):
                delattr(g, 'trace_id')
        except RuntimeError:
            pass
        # Don't clear thread-local storage - let it persist for werkzeug logging
        # It will be overwritten on the next request anyway

    app.before_request(before_request_handler)
    app.teardown_request(teardown_request_handler)


def log_generator_output(prefix, generator, start_time=None, last_time=None):
    start_time = start_time or time.time()
    last_msg = last_time or time.time()
    for message in generator:
        since_start = time.time() - start_time
        since_last_msg = time.time() - last_msg
        size = len(message) if hasattr(message, "__len__") else None
        logger.info(
            "generator output: %s since_start=%.1f since_last_msg=%.1f chunk_bytes=%s",
            redact_log_text(prefix, limit=256),
            since_start,
            since_last_msg,
            size,
        )
        yield message
        last_msg = time.time()


def setup_logging(app):
    # Create a single shared filter instance
    trace_id_filter = RequestIdFilter()

    # Create a custom handler that includes trace_id
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('time="%(asctime)s" trace_id=%(trace_id)s request_reltime=%(reltime)s remote_ip=%(remote_addr)s user_id=%(user_id)s logger=%(name)s %(levelname)s %(message)s'))
    handler.addFilter(trace_id_filter)

    # Remove existing handlers and add our custom one
    root_logger = logging.getLogger()
    root_logger.handlers = []
    root_logger.addHandler(handler)

    # Also configure Flask's app logger
    app.logger.handlers = []
    app.logger.addHandler(handler)

    # Hook CTFd's logger specifically
    ctfd_logger = logging.getLogger('CTFd')
    ctfd_logger.handlers = []
    ctfd_logger.addHandler(handler)
    ctfd_logger = logging.getLogger('submissions')
    ctfd_logger.handlers = []
    ctfd_logger.addHandler(handler)
    ctfd_logger = logging.getLogger('registrations')
    ctfd_logger.handlers = []
    ctfd_logger.addHandler(handler)
    ctfd_logger = logging.getLogger('logins')
    ctfd_logger.handlers = []
    ctfd_logger.addHandler(handler)

    # inherit stuff from root
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.handlers = []

    gunicorn_error_logger = logging.getLogger('gunicorn.error')
    gunicorn_error_logger.handlers = []
    gunicorn_error_logger.propagate = True

    gunicorn_access_logger = logging.getLogger('gunicorn.access')
    gunicorn_access_logger.handlers = []
    gunicorn_access_logger.propagate = True

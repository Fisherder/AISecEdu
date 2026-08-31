import logging
import time

import redis
from flask import current_app, g, request


logger = logging.getLogger(__name__)
_redis_client = None
_last_warning = 0.0
_COUNT_KEY = "aisecedu:metrics:teaching-api:count"
_DURATION_KEY = "aisecedu:metrics:teaching-api:duration-seconds"


def _client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            current_app.config.get("REDIS_URL", "redis://cache:6379"),
            decode_responses=True,
            socket_connect_timeout=0.1,
            socket_timeout=0.1,
        )
    return _redis_client


def _field(method, route, status):
    return "|".join(
        (
            str(method or "UNKNOWN")[:12],
            str(route or "unmatched")[:240],
            str(int(status or 0)),
        )
    )


def record_teaching_api_response(response):
    global _last_warning
    if not request.path.startswith("/pwncollege_api/v1/teaching"):
        return
    route = request.url_rule.rule if request.url_rule is not None else "unmatched"
    started = getattr(g, "start_time", None)
    duration = max(0.0, time.time() - started) if started else 0.0
    field = _field(request.method, route, response.status_code)
    try:
        pipeline = _client().pipeline(transaction=False)
        pipeline.hincrby(_COUNT_KEY, field, 1)
        pipeline.hincrbyfloat(_DURATION_KEY, field, duration)
        pipeline.execute()
    except redis.RedisError as exc:
        now = time.monotonic()
        if now - _last_warning >= 60:
            logger.warning(
                "Teaching API metric aggregation unavailable: %s",
                type(exc).__name__,
            )
            _last_warning = now


def teaching_api_metric_rows():
    try:
        pipeline = _client().pipeline(transaction=False)
        pipeline.hgetall(_COUNT_KEY)
        pipeline.hgetall(_DURATION_KEY)
        counts, durations = pipeline.execute()
    except redis.RedisError:
        return False, []
    rows = []
    for field, count in counts.items():
        parts = field.split("|", 2)
        if len(parts) != 3:
            continue
        method, route, status = parts
        try:
            rows.append(
                (
                    method,
                    route,
                    status,
                    max(0, int(count)),
                    max(0.0, float(durations.get(field, 0.0))),
                )
            )
        except (TypeError, ValueError):
            continue
    return True, rows

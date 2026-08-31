import time
import logging
import os
import threading
import traceback
from pathlib import Path
from flask import g, has_request_context, request
from sqlalchemy import event, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.engine import Engine
from CTFd.utils.user import get_current_user
from CTFd.models import db

logger = logging.getLogger("dojo.query_timer")

thread_local = threading.local()

SLOW_QUERY_THRESHOLD = 0.5
DOJO_PLUGIN_PATH = Path(__file__).parent.parent.resolve()


@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    if not hasattr(thread_local, "query_start_times"):
        thread_local.query_start_times = []
    thread_local.query_start_times.append(time.perf_counter())
    if has_request_context():
        thread_local.request_query_count = (
            getattr(thread_local, "request_query_count", 0) + 1
        )


@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    if not hasattr(thread_local, "query_start_times") or not thread_local.query_start_times:
        return

    start_time = thread_local.query_start_times.pop()
    query_time = time.perf_counter() - start_time
    if has_request_context():
        thread_local.request_query_seconds = (
            getattr(thread_local, "request_query_seconds", 0.0) + query_time
        )

    if query_time < SLOW_QUERY_THRESHOLD:
        return

    stack = traceback.extract_stack()
    dojo_frames = []

    for frame in stack:
        frame_path = Path(frame.filename).resolve()
        try:
            if frame_path.is_relative_to(DOJO_PLUGIN_PATH) and "query_timer" not in frame.filename:
                relative_path = frame_path.relative_to(DOJO_PLUGIN_PATH.parent)
                dojo_frames.append(f"{relative_path}:{frame.lineno}:{frame.name}")
        except (ValueError, OSError):
            pass

    traceback_str = " ".join(reversed(dojo_frames)) if dojo_frames else "no_dojo_frames"

    try:
        user = get_current_user()
    except RuntimeError: # if not in an app context
        user = None

    logger.warning(
        f"Slow query: {query_time=:.3f}s user={user} {traceback_str=}"
    )

def query_timeout(stmt, ms, default):
    db.session.execute(text(f"SET LOCAL statement_timeout = {ms}"))
    try:
        return stmt()
    except DBAPIError as e:
        if getattr(getattr(e, "orig", None), "pgcode", None) == "57014": #ugly postgres hack for timeouts
            db.session.rollback()
            return default
        else:
            raise
    finally:
        db.session.execute(text("SET LOCAL statement_timeout = 0"))

def init_query_timer(app=None):
    if app is None:
        return

    try:
        slow_request_threshold_ms = max(
            100.0,
            float(os.getenv("AISECEDU_SLOW_REQUEST_THRESHOLD_MS") or "750"),
        )
    except ValueError:
        slow_request_threshold_ms = 750.0
    try:
        query_count_threshold = max(
            10,
            int(os.getenv("AISECEDU_QUERY_COUNT_THRESHOLD") or "80"),
        )
    except ValueError:
        query_count_threshold = 80

    def before_request_handler():
        thread_local.request_query_count = 0
        thread_local.request_query_seconds = 0.0
        g.aisecedu_request_started = time.perf_counter()

    def after_request_handler(response):
        started = getattr(g, "aisecedu_request_started", None)
        duration_ms = (
            max(0.0, (time.perf_counter() - started) * 1000.0)
            if started is not None
            else 0.0
        )
        query_count = max(0, int(getattr(thread_local, "request_query_count", 0)))
        query_ms = max(
            0.0,
            float(getattr(thread_local, "request_query_seconds", 0.0)) * 1000.0,
        )
        response.headers["Server-Timing"] = (
            f'app;dur={duration_ms:.1f}, db;dur={query_ms:.1f};desc="{query_count} queries"'
        )
        if duration_ms >= slow_request_threshold_ms or query_count >= query_count_threshold:
            logger.warning(
                "Slow request: method=%s path=%s status=%s duration_ms=%.1f db_ms=%.1f queries=%d",
                request.method,
                request.path,
                response.status_code,
                duration_ms,
                query_ms,
                query_count,
            )
        return response

    app.before_request(before_request_handler)
    app.after_request(after_request_handler)

"""Gunicorn hooks used by the production CTFd service.

Gunicorn's gevent worker can only multiplex database waits when psycopg2 uses
gevent-aware polling.  Without this callback, one greenlet waiting for a
PgBouncer connection blocks the worker OS thread.  Other greenlets in that
worker can then neither finish their requests nor return their transactions,
which turns a small connection-pool queue into a process-wide deadlock.

This is the small polling adapter provided by ``psycogreen`` inlined here so
the deployment does not need to mutate the upstream CTFd Python image at
runtime.
"""

from __future__ import annotations

import os


def gevent_wait_callback(connection, timeout=None):
    """Yield to gevent while psycopg2 waits for socket readiness."""

    from gevent.socket import wait_read, wait_write
    from psycopg2 import OperationalError, extensions

    while True:
        state = connection.poll()
        if state == extensions.POLL_OK:
            return
        if state == extensions.POLL_READ:
            wait_read(connection.fileno(), timeout=timeout)
            continue
        if state == extensions.POLL_WRITE:
            wait_write(connection.fileno(), timeout=timeout)
            continue
        raise OperationalError(f"Unexpected psycopg2 poll state: {state!r}")


def post_worker_init(worker):
    """Install cooperative PostgreSQL I/O after the gevent worker is ready."""

    enabled = os.environ.get("CTFD_GEVENT_PSYCOPG", "true").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        worker.log.warning("cooperative psycopg2 polling is disabled")
        return

    from psycopg2 import extensions

    extensions.set_wait_callback(gevent_wait_callback)
    worker.log.info("enabled cooperative psycopg2 polling for gevent")

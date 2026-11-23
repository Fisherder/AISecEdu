"""Consumer for the opt-in text-only teacher chat lane."""

import logging
import signal
from threading import Event

from CTFd.models import db

from ..agent_runtime.teacher_dsh_chat import enabled, run_ready_jobs

logger = logging.getLogger(__name__)


def main(app):
    if not enabled():
        raise RuntimeError("The dedicated DSH teacher-chat lane is disabled.")
    logging.basicConfig(level=logging.INFO)
    stopped = Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    logger.info("Started the text-only DSH teacher-chat consumer.")
    while not stopped.is_set():
        with app.app_context():
            try:
                run_ready_jobs()
            except Exception:
                db.session.rollback()
                logger.exception("Could not check the DSH teacher-chat lane")
        stopped.wait(1)

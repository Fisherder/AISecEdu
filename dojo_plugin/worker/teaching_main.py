import logging
import os
import signal

from ..agent_runtime.jobs import AUTHORING_STREAM, STREAM, consume_jobs


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
shutdown_requested = False
worker_stream = os.getenv("TEACHING_WORKER_STREAM") or STREAM
if worker_stream not in {STREAM, AUTHORING_STREAM}:
    raise RuntimeError("TEACHING_WORKER_STREAM must be a supported teaching stream")


def _shutdown(signum, _frame):
    global shutdown_requested
    logger.info("Received signal %s; teaching worker will stop after the current job", signum)
    shutdown_requested = True


signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT, _shutdown)

logger.info("Starting durable 玄甲 global-agent worker stream=%s", worker_stream)
consume_jobs(stream=worker_stream, stop_requested=lambda: shutdown_requested)
logger.info("Teaching worker stopped")

import hashlib
import logging
import os
import time
import uuid
from contextlib import contextmanager

import docker
import redis
import requests
from CTFd.models import Users

from . import user_docker_client
from .background_stats import get_redis_client
from .request_logging import log_generator_output

logger = logging.getLogger(__name__)

on_demand_services = {"terminal", "code", "desktop"}
service_start_limits = {
    # code-server is considerably heavier than Terminal or Desktop startup.
    # An unbounded 300-learner burst drove host load above 690 and prevented
    # most instances from becoming ready. 128 cold starts still saturated the
    # host and timed out. 64 Code starts fill the 64-core target without
    # crossing that knee. Desktop is lighter, but 96 simultaneous starts still
    # produced a load-average spike above 500 once 300 Code instances were
    # resident, so both expensive services use the measured safe batch size.
    "code": max(1, int(os.getenv("DOJO_CODE_START_CONCURRENCY", "64"))),
    "desktop": max(1, int(os.getenv("DOJO_DESKTOP_START_CONCURRENCY", "64"))),
}
service_start_timeouts = {
    # dojo-service double-forks the actual service. The outer timeout must stay
    # alive until readiness; releasing a lease after 30 seconds leaves the
    # expensive child running and silently defeats admission control.
    "code": max(30, int(os.getenv("DOJO_CODE_START_TIMEOUT_SECONDS", "240"))),
    "desktop": max(30, int(os.getenv("DOJO_DESKTOP_START_TIMEOUT_SECONDS", "120"))),
    "terminal": max(10, int(os.getenv("DOJO_TERMINAL_START_TIMEOUT_SECONDS", "30"))),
}
service_start_wait_seconds = max(1, int(os.getenv("DOJO_SERVICE_START_WAIT_SECONDS", "600")))
service_start_lease_seconds = max(
    max(service_start_timeouts.values()) + 30,
    int(os.getenv("DOJO_SERVICE_START_LEASE_SECONDS", "300")),
)
workspace_start_limit = max(1, int(os.getenv("DOJO_WORKSPACE_START_CONCURRENCY", "16")))
workspace_start_wait_seconds = max(60, int(os.getenv("DOJO_WORKSPACE_START_WAIT_SECONDS", "900")))
workspace_start_lease_seconds = max(
    workspace_start_wait_seconds + 60,
    int(os.getenv("DOJO_WORKSPACE_START_LEASE_SECONDS", "960")),
)

_ACQUIRE_SERVICE_SLOT = """
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[2]) then
    redis.call('ZADD', KEYS[1], tonumber(ARGV[3]), ARGV[4])
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
    return 1
end
return 0
"""


@contextmanager
def service_start_slot(service_name):
    """Bound expensive service cold starts across every Gunicorn worker.

    A sorted-set lease recovers automatically if a worker dies while holding a
    slot. Redis failures deliberately fail open so an observability dependency
    cannot make an individual learner's workspace unusable.
    """
    limit = service_start_limits.get(service_name)
    if not limit:
        yield
        return

    client = get_redis_client()
    key = f"workspace:service-start:{service_name}:leases"
    token = uuid.uuid4().hex
    deadline = time.monotonic() + service_start_wait_seconds
    acquired = False
    try:
        while time.monotonic() < deadline:
            now = time.time()
            acquired = bool(
                client.eval(
                    _ACQUIRE_SERVICE_SLOT,
                    1,
                    key,
                    now,
                    limit,
                    now + service_start_lease_seconds,
                    token,
                    service_start_lease_seconds,
                )
            )
            if acquired:
                break
            time.sleep(0.1)
    except redis.RedisError:
        logger.exception("service start limiter unavailable; proceeding without a slot")
        yield
        return

    if not acquired:
        raise TimeoutError(f"timed out waiting for {service_name} start capacity")

    try:
        yield
    finally:
        try:
            client.zrem(key, token)
        except redis.RedisError:
            logger.exception("failed to release service start slot")


@contextmanager
def workspace_start_slot():
    """Bound full workspace cold starts across every Gunicorn worker.

    Creating a workspace simultaneously exercises Docker, HomeFS, Nix
    initialization, and challenge injection. Admission control keeps a burst
    from timing out otherwise healthy starts. Redis failures deliberately fail
    open so an observability dependency cannot make a learner unusable.
    """
    client = get_redis_client()
    key = "workspace:container-start:leases"
    token = uuid.uuid4().hex
    deadline = time.monotonic() + workspace_start_wait_seconds
    acquired = False
    try:
        while time.monotonic() < deadline:
            now = time.time()
            acquired = bool(
                client.eval(
                    _ACQUIRE_SERVICE_SLOT,
                    1,
                    key,
                    now,
                    workspace_start_limit,
                    now + workspace_start_lease_seconds,
                    token,
                    workspace_start_lease_seconds,
                )
            )
            if acquired:
                break
            time.sleep(0.1)
    except redis.RedisError:
        logger.exception("workspace start limiter unavailable; proceeding without a slot")
        yield
        return

    if not acquired:
        raise TimeoutError("timed out waiting for workspace start capacity")

    try:
        yield
    finally:
        try:
            client.zrem(key, token)
        except redis.RedisError:
            logger.exception("failed to release workspace start slot")


def _command_audit_fields(cmd):
    """Identify a command without persisting its arguments or embedded secrets."""
    if isinstance(cmd, (list, tuple)):
        command_name = str(cmd[0]) if cmd else "empty"
        material = "\0".join(map(str, cmd))
    else:
        material = str(cmd)
        command_name = material.strip().split(maxsplit=1)[0] if material.strip() else "empty"
    return command_name[:80], hashlib.sha256(material.encode()).hexdigest()[:16]


def start_on_demand_service(user, service_name):
    if service_name not in on_demand_services:
        return None
    timeout = service_start_timeouts[service_name]
    try:
        with service_start_slot(service_name):
            exec_run(
                f"/run/current-system/sw/bin/timeout -k 10 {timeout} /run/current-system/sw/bin/dojo-{service_name}",
                workspace_user="hacker",
                user_id=user.id,
                assert_success=True,
                log=True,
            )
    except (docker.errors.NotFound, AssertionError, requests.HTTPError, TimeoutError) as exception:
        logger.warning(f"start_on_demand_service failure: {service_name=} {exception=}")
        return False
    return True


def exec_run(cmd, *, shell=False, assert_success=True, workspace_user="root", user_id=None, container=None, log=False, **kwargs):
    # TODO: Cleanup this interface
    if workspace_user == "root":
        workspace_user = "0"
    if workspace_user == "hacker":
        workspace_user = "1000"

    if shell:
        cmd = f"""/bin/sh -c \"
        {cmd}
        \""""

    if not container:
        docker_client = user_docker_client(Users.query.get(user_id))
        container = docker_client.containers.get(f"user_{user_id}")

    start_time = time.time()
    command_name, command_hash = _command_audit_fields(cmd)
    if log:
        exec_id = docker_client.api.exec_create(container.id, cmd, privileged=False, user=workspace_user)["Id"]
        out_stream = docker_client.api.exec_start(exec_id, stream=True, demux=False)
        output = b"".join(
            log_generator_output(
                f"exec_run command={command_name} hash={command_hash}",
                out_stream,
                start_time=start_time,
            )
        )
        exit_code = docker_client.api.exec_inspect(exec_id)['ExitCode']
    else:
        exit_code, output = container.exec_run(cmd, user=workspace_user, **kwargs)

    logger.info(
        "exec_run finished command=%s command_hash=%s workspace_user=%s "
        "elapsed=%.1fs exit_code=%s output_bytes=%s",
        command_name,
        command_hash,
        workspace_user,
        time.time() - start_time,
        exit_code,
        len(output) if output is not None else None,
    )

    if assert_success:
        assert exit_code in (0, None), output
    return exit_code, output

def reset_home(user_id, *, backup=True):
    if backup:
        exec_run("/bin/tar cvzf /tmp/home-backup.tar.gz /home/hacker", user_id=user_id, shell=True, workspace_user="hacker")
    exec_run("find /home/hacker -mindepth 1 -delete", user_id=user_id, shell=True, workspace_user="root")
    exec_run("chown hacker:hacker /home/hacker", user_id=user_id, shell=True, workspace_user="root")
    if backup:
        exec_run("cp /tmp/home-backup.tar.gz /home/hacker/", user_id=user_id, shell=True, workspace_user="hacker")

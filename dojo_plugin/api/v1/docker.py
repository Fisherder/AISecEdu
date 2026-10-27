import datetime
import hashlib
import pathlib
import os
import logging
import time
import re

import docker
import docker.errors
import docker.types
import redis
from .user import authed_only_cli, authed_only_ssh, CLI_AUTH_PREFIX
from flask import abort, request, current_app
from itsdangerous.url_safe import URLSafeTimedSerializer
from flask_restx import Namespace, Resource
from CTFd.cache import cache
from CTFd.models import Users, db
from CTFd.utils.user import get_current_user, is_admin
from CTFd.utils.decorators import authed_only
from CTFd.exceptions import UserNotFoundException, UserTokenExpiredException

from ...config import (
    HOST_DATA_PATH,
    INTERNET_FOR_ALL,
    SECCOMP,
    USER_FIREWALL_ALLOWED,
    WORKSPACE_SESSION_SECONDS,
)
from ...models import DojoModules, DojoChallenges
from ...utils import (
    container_name,
    lookup_workspace_token,
    resolved_tar,
    serialize_user_flag,
    user_docker_client,
    user_node,
    user_ipv4,
    get_current_container,
    is_challenge_locked,
)
from ...utils.dojo import dojo_accessible, get_current_dojo_challenge
from ...utils.workspace import exec_run, workspace_start_slot
from ...runtime_profiles import runtime_profile, container_runtime_profile, profile_for_runtime_label
from ...question_reset import selected_volume, switch_volume, windows_volume, coding_reset
from ...utils.feed import publish_container_start
from ...utils.background_stats import publish_stat_event
from ...utils.request_logging import get_trace_id, log_generator_output
from ...learning.evidence import active_attempt, append_evidence, start_attempt
from ...learning.simulation import (
    active_simulation_run,
    challenge_exercise_mode,
    current_simulation_run,
    interrupt_simulation_runs,
    start_simulation_run,
    stop_simulation_run,
)

logger = logging.getLogger(__name__)

DOCKER_LOCK_SECONDS = max(60, int(os.getenv("DOJO_DOCKER_LOCK_SECONDS", "1200")))

docker_namespace = Namespace(
    "docker", description="Endpoint to manage docker containers"
)

HOST_HOMES = pathlib.Path(HOST_DATA_PATH) / "workspace" / "homes"
HOST_HOMES_MOUNTS = HOST_HOMES / "mounts"
HOST_HOMES_OVERLAYS = HOST_HOMES / "overlays"


class WindowsShutdownPending(RuntimeError):
    pass


def flush_guest_disk_before_stop(container):
    if (container.labels or {}).get('dojo.runtime_environment') != 'windows2000':
        return
    stopped = False
    try:
        from ...agent_runtime.guest_input import flush_guest_disk, shutdown_guest

        if flush_guest_disk(container):
            logger.info("Flushed guest disk cache before stopping the container")
        if shutdown_guest(container):
            logger.info("Windows guest shut down before stopping the container")
            stopped = True
    except Exception as error:
        logger.warning("Windows guest stop deferred: %s", type(error).__name__)
    if not stopped:
        raise WindowsShutdownPending('Windows 尚未完成正常关机，当前环境和文件已保留，请稍后重试。')


def remove_container(user):
    # Just in case our container is still running on the other docker container, let's make sure we try to kill both
    known_image_name = cache.get(f"user_{user.id}-running-image")
    images = [None, known_image_name]
    for image_name in images:
        docker_client = user_docker_client(user, image_name)
        try:
            container = docker_client.containers.get(container_name(user))
            flush_guest_disk_before_stop(container)
            try:
                container.stop(timeout=25)
            except (docker.errors.NotFound, docker.errors.APIError):
                pass
            container.remove(force=True)
            container.wait(condition="removed")
        except (docker.errors.NotFound, docker.errors.APIError):
            pass
        for volume in [f"{user.id}", f"{user.id}-overlay"]:
            try:
                docker_client.volumes.get(volume).remove()
            except (docker.errors.NotFound, docker.errors.APIError):
                pass


def optional_container(user):
    try:
        return get_current_container(user)
    except docker.errors.DockerException:
        logger.warning(
            "Docker is unavailable while resolving an optional container"
        )
        return None


def get_available_devices(docker_client):
    key = f"devices-{docker_client.api.base_url}"
    if (cached := cache.get(key)) is not None:
        return cached
    find_command = ["/bin/find", "/dev", "-type", "c"]
    # When using certain logging drivers (like Splunk), docker.containers.run() returns None
    # Use detach=True and logs() to capture output instead
    container = docker_client.containers.run("busybox:uclibc", find_command, privileged=True, detach=True)
    container.wait()
    output = container.logs()
    container.remove()
    devices = output.decode().splitlines() if output else []
    timeout = int(datetime.timedelta(days=1).total_seconds())
    cache.set(key, devices, timeout=timeout)
    return devices

LAB_STATE_DIR = "/var/lib/windows-lab"


def lab_state_volume(owner_id, namespace=None):
    suffix = ""
    if namespace:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", str(namespace)):
            raise ValueError("Invalid lab state namespace")
        suffix = f"-{namespace}"
    return f"dojo-lab-state-{int(owner_id)}{suffix}"


def image_lab_state_namespace(image_labels, challenge_id):
    namespace = image_labels.get("org.aisecedu.lab-state-namespace")
    return f"{namespace or 'question'}-{int(challenge_id)}"


def remove_lab_state_volume(docker_client, owner_id, namespace=None):
    volume = lab_state_volume(owner_id, namespace)
    try:
        docker_client.volumes.get(volume).remove(force=True)
        logger.info("Removed persistent lab state volume %s", volume)
    except docker.errors.NotFound:
        return
    except docker.errors.DockerException as error:
        logger.warning("Could not remove lab state volume %s: %s", volume, error)


def start_container(docker_client, user, as_user, user_mounts, dojo_challenge, practice):
    resolved_dojo_challenge = dojo_challenge.resolve()

    start_time = time.time()
    hostname = "~".join(
        (["practice"] if practice else [])
        + [
            dojo_challenge.module.id,
            re.sub(
                r"[\s.-]+",
                "-",
                re.sub(r"[^a-z0-9\s.-]", "", dojo_challenge.name.lower()),
            ),
        ]
    )[:64]

    auth_token = URLSafeTimedSerializer(current_app.config["SECRET_KEY"]).dumps(
        [user.id, dojo_challenge.id, "cli-auth-token"]
    )
    auth_token = f"{CLI_AUTH_PREFIX}{auth_token}"

    challenge_bin_path = "/run/challenge/bin"
    dojo_bin_path = "/run/dojo/bin"
    try:
        image = docker_client.images.get(resolved_dojo_challenge.image)
    except docker.errors.ImageNotFound:
        raise RuntimeError(
            f"运行环境镜像未安装：{resolved_dojo_challenge.image}；"
            f"请先在本节点导入该客户机系统镜像。"
        )
    profile = runtime_profile(resolved_dojo_challenge.runtime_environment)
    image_labels = image.attrs["Config"].get("Labels") or {}
    if not (resolved_dojo_challenge.data or {}).get("runtime_environment"):
        profile = profile_for_runtime_label(image_labels.get("org.aisecedu.runtime")) or profile
    image_env = image.attrs["Config"].get("Env") or []
    image_path = next((env_var[len("PATH="):].split(":") for env_var in image_env if env_var.startswith("PATH=")), [])
    env_path = ":".join([challenge_bin_path, dojo_bin_path, *image_path])

    mounts = [
        docker.types.Mount(
            "/nix",
            f"{HOST_DATA_PATH}/workspace/nix",
            "bind",
            read_only=True,
        ),
        docker.types.Mount(
            "/run/dojo/sys",
            "/run/dojo/dojofs",
            "bind",
            read_only=True,
            propagation="slave",
        ),
        *user_mounts,
    ]
    runtime_label = image_labels.get("org.aisecedu.runtime") or ""
    if profile.id.startswith("windows") or runtime_label.startswith("windows"):
        mounts.append(
            docker.types.Mount(
                LAB_STATE_DIR,
                selected_volume(as_user.id, dojo_challenge, lab_state_volume(as_user.id, image_lab_state_namespace(image_labels, dojo_challenge.challenge_id))),
                "volume",
            )
        )

    allowed_devices = ["/dev/kvm", "/dev/net/tun"]
    available_devices = set(get_available_devices(docker_client))
    devices = [f"{device}:{device}:rwm" for device in allowed_devices if device in available_devices]

    capabilities = ["SYS_PTRACE"]
    if resolved_dojo_challenge.privileged:
        capabilities.append("SYS_ADMIN")
        if "workspace_net_admin" in resolved_dojo_challenge.dojo.permissions:
            capabilities.append("NET_ADMIN")

    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=WORKSPACE_SESSION_SECONDS
    )
    container_create_attributes = dict(
        image=resolved_dojo_challenge.image,
        entrypoint=[
            "/nix/var/nix/profiles/dojo-workspace/bin/dojo-init",
            f"{dojo_bin_path}/sleep",
            f"{WORKSPACE_SESSION_SECONDS}s",
        ],
        name=container_name(user),
        hostname=hostname,
        user="0",
        working_dir="/challenge",
        environment={
            "HOME": "/home/hacker",
            "PATH": env_path,
            "SHELL": f"{dojo_bin_path}/bash",
            "DOJO_CHALLENGE_DIR": "/challenge",
            "DOJO_RUNTIME_ENVIRONMENT": profile.id,
            "DOJO_AUTH_TOKEN": auth_token,
        },
        labels={
            "dojo.runtime_environment": profile.id,
            "dojo.runtime.bootstrap": image_labels.get("org.aisecedu.runtime.bootstrap", ""),
            "dojo.dojo_id": dojo_challenge.dojo.reference_id,
            "dojo.module_id": dojo_challenge.module.id,
            "dojo.challenge_id": dojo_challenge.id,
            "dojo.challenge_description": dojo_challenge.description,
            "dojo.user_id": str(user.id),
            "dojo.as_user_id": str(as_user.id),
            "dojo.auth_token": auth_token,
            "dojo.mode": "privileged" if practice else "standard",
            "dojo.expires_at": expires_at.isoformat().replace("+00:00", "Z"),
        },
        mounts=mounts,
        devices=devices,
        network=None,
        extra_hosts={
            hostname: "127.0.0.1",
            "vm": "127.0.0.1",
            f"vm_{hostname}"[:64]: "127.0.0.1",
            "challenge.localhost": "127.0.0.1",
            "hacker.localhost": "127.0.0.1",
            "dojo-user": user_ipv4(user),
            "pwn.college": "192.168.42.1",
            **USER_FIREWALL_ALLOWED,
        },
        init=True,
        detach=True,
        stdin_open=True,
        auto_remove=True,
        cpu_period=100000,
        cpu_quota=400000,
        pids_limit=1024,
        mem_limit=profile.memory,
        runtime="io.containerd.run.kata.v2" if resolved_dojo_challenge.privileged else "runc",
        cap_add=capabilities,
        security_opt=[f"seccomp={SECCOMP}"],
        sysctls={"net.ipv4.ip_unprivileged_port_start": 1024},
    )

    container = docker_client.containers.create(**container_create_attributes)

    workspace_net = docker_client.networks.get("workspace_net")
    workspace_net.connect(
        container, ipv4_address=user_ipv4(user), aliases=[container_name(user)]
    )

    default_network = docker_client.networks.get("bridge")
    internet_access = INTERNET_FOR_ALL or any(
        award.name == "INTERNET" for award in user.awards
    )
    if not internet_access:
        default_network.disconnect(container)

    container.start()
    logger.info(f"container started after {time.time()-start_time:.1f} seconds")
    for message in log_generator_output(
        "workspace initialization ", container.logs(stream=True, follow=True), start_time=start_time
    ):
        if b"DOJO_INIT_INITIALIZED" in message or message == b"Initialized.\n":
            logger.info(f"workspace initialized after {time.time()-start_time:.1f} seconds")
            break
    else:
        raise RuntimeError(f"Workspace failed to initialize after {time.time()-start_time:.1f} seconds.")

    cache.set(f"user_{user.id}-running-image", resolved_dojo_challenge.image, timeout=0)
    return container


def insert_challenge(container, as_user, dojo_challenge):
    def is_option_path(path):
        path = pathlib.Path(*path.parts[: len(dojo_challenge.path.parts) + 1])
        return path.name.startswith("_") and path.is_dir()

    exec_run("/run/dojo/bin/mkdir -p /challenge", container=container)

    root_dir = dojo_challenge.path.parent.parent
    challenge_tar = resolved_tar(
        dojo_challenge.path,
        root_dir=root_dir,
        filter=lambda path: not is_option_path(path),
    )
    container.put_archive("/challenge", challenge_tar)

    option_paths = sorted(
        path for path in dojo_challenge.path.iterdir() if is_option_path(path)
    )
    if option_paths:
        secret = current_app.config["SECRET_KEY"]
        option_hash = hashlib.sha256(
            f"{secret}_{as_user.id}_{dojo_challenge.challenge_id}".encode()
        ).digest()
        option = option_paths[
            int.from_bytes(option_hash[:8], "little") % len(option_paths)
        ]
        container.put_archive("/challenge", resolved_tar(option, root_dir=root_dir))

    exec_run(
        r"/run/dojo/bin/find /challenge/ -mindepth 1 -exec /run/dojo/bin/chown root:root {} \;", container=container
    )
    exec_run(r"/run/dojo/bin/find /challenge/ -mindepth 1 -exec /run/dojo/bin/chmod 4755 {} \;", container=container)


def insert_flag(container, flag):
    flag = f"pwn.college{{{flag}}}"
    if "localhost" in container.client.api.base_url:
        socket = container.attach_socket(params=dict(stdin=1, stream=1))
        socket._sock.sendall(flag.encode() + b"\n")
        socket.close()
    else:
        ws = container.attach_socket(params=dict(stdin=1, stream=1), ws=True)
        ws.send_text(f"{flag}\n")
        ws.close()


def start_challenge(user, dojo_challenge, practice, *, as_user=None):
    docker_client = user_docker_client(user, image_name=dojo_challenge.image)
    node_id = user_node(user)
    if node_id is None:
        node_id = -1
    logger.info(
        f"starting challenge dojo={dojo_challenge.dojo.reference_id} "
        f"module={dojo_challenge.module.id} challenge={dojo_challenge.id} "
        f"{practice=} {as_user=} node_id={node_id + 1}"
    )
    previous = optional_container(user)
    old_volume = windows_volume(previous) if previous is not None else None
    same_question = previous is not None and previous.labels.get('dojo.dojo_id') == dojo_challenge.dojo.reference_id and previous.labels.get('dojo.challenge_id') == dojo_challenge.id
    remove_container(user)
    labels = docker_client.images.get(dojo_challenge.resolve().image).attrs['Config'].get('Labels') or {}
    if same_question and old_volume:
        owner = as_user or user
        fallback = lab_state_volume(owner.id, image_lab_state_namespace(labels, dojo_challenge.challenge_id))
        destination = selected_volume(owner.id, dojo_challenge, fallback)
        try:
            docker_client.volumes.get(destination)
        except docker.errors.NotFound:
            if old_volume != destination and destination == fallback:
                docker_client.volumes.create(destination)
                docker_client.containers.run('busybox:uclibc', ['sh','-c','cp -a /source/. /destination/'], remove=True, volumes={old_volume:{'bind':'/source','mode':'ro'},destination:{'bind':'/destination','mode':'rw'}})

    user_mounts = []
    if as_user is None:
        user_mounts.append(
            docker.types.Mount(
                "/home/hacker",
                str(user.id),
                "volume",
                no_copy=True,
                driver_config=docker.types.DriverConfig("homefs", options=dict(trace_id=get_trace_id())),
            )
        )
    else:
        user_mounts.extend([
            docker.types.Mount(
                "/home/hacker",
                f"{user.id}-overlay",
                "volume",
                no_copy=True,
                driver_config=docker.types.DriverConfig("homefs", options=dict(overlay=str(as_user.id), trace_id=get_trace_id())),
            ),
            docker.types.Mount(
                "/home/me",
                str(user.id),
                "volume",
                no_copy=True,
                driver_config=docker.types.DriverConfig("homefs", options=dict(trace_id=get_trace_id())),
            ),
        ])

    as_user = as_user or user

    start_time = time.time()
    container = start_container(
        docker_client=docker_client,
        user=user,
        as_user=as_user,
        user_mounts=user_mounts,
        dojo_challenge=dojo_challenge,
        practice=practice,
    )

    if dojo_challenge.path.exists() and not dojo_challenge.resolve().image.startswith("challenges.pwn.college/"):
        insert_challenge(container, as_user, dojo_challenge)

    if practice:
        flag = "practice"
    elif as_user != user:
        flag = "support_flag"
    else:
        flag = serialize_user_flag(as_user.id, dojo_challenge.challenge_id)
    insert_flag(container, flag)

    for message in log_generator_output(
        "workspace readying ", container.logs(stream=True, follow=True), start_time=start_time
    ):
        if b"DOJO_INIT_READY" in message or message == b"Ready.\n":
            logger.info(f"workspace ready after {time.time()-start_time:.1f} seconds")
            break
        if b"DOJO_INIT_FAILED:" in message:
            cause = message.split(b"DOJO_INIT_FAILED:")[1].split(b"\n")[0]
            raise RuntimeError(f"DOJO_INIT_FAILED: {cause}")
    else:
        raise RuntimeError("Workspace failed to become ready.")
    profile = container_runtime_profile(container)
    if profile.initializer and container.labels.get("dojo.runtime.bootstrap") == profile.initializer:
        exec_run([profile.initializer], container=container)
    return container


def preserved_state():
    try:
        container = optional_container(get_current_user())
    except Exception:
        container = None
    if container is None:
        return {"kind": "none", "message": "重新启动后会从初始状态开始。"}
    try:
        profile = container_runtime_profile(container)
    except Exception:
        profile = None
    if profile is not None and getattr(profile, "family", "") == "windows":
        return {
            "kind": "guest-disk",
            "message": "虚拟机磁盘状态已保留：客户机里改过的文件、装过的东西都在，重新启动后可直接接着做。",
        }
    return {"kind": "home", "message": "/home/hacker 文件已保留。"}


def start_challenge_session(user, dojo_challenge, practice, *, as_user=None, reset=False):
    is_preview = (dojo_challenge.data or {}).get("publication_state") == "DRAFT"
    if reset:
        raise ValueError('请通过按题目重置接口恢复当前题目，不支持清空机器磁盘。')
    max_attempts = 3
    for attempt_number in range(1, max_attempts + 1):
        try:
            logger.info(
                f"Starting challenge for user {user.id} "
                f"(attempt {attempt_number}/{max_attempts})..."
            )
            with workspace_start_slot():
                container = start_challenge(
                    user,
                    dojo_challenge,
                    practice,
                    as_user=as_user,
                )
            actual_user = as_user or user
            node_id = user_node(actual_user)
            learning_attempt = start_attempt(
                actual_user,
                dojo_challenge,
                "PRACTICE" if practice or is_preview else "ASSESSMENT",
                {
                    "containerId": container.id[:12],
                    "image": dojo_challenge.image,
                    "nodeId": node_id + 1 if node_id is not None else 0,
                    "interfaces": dojo_challenge.interfaces,
                    "exerciseMode": challenge_exercise_mode(dojo_challenge),
                    "draftPreview": is_preview,
                },
            )
            db.session.commit()

            dojo = dojo_challenge.dojo
            if dojo.official or dojo.data.get("type") == "public":
                challenge_data = {
                    "challenge_id": dojo_challenge.challenge_id,
                    "challenge_name": dojo_challenge.name,
                    "module_id": dojo_challenge.module.id if dojo_challenge.module else None,
                    "module_name": dojo_challenge.module.name if dojo_challenge.module else None,
                    "dojo_id": dojo.reference_id,
                    "dojo_name": dojo.name,
                }
                mode = "practice" if practice or is_preview else "assessment"
                publish_container_start(actual_user, mode, challenge_data)

            publish_stat_event("container_stats_update", {})
            return container, learning_attempt
        except Exception as error:
            logger.warning(
                f"Attempt {attempt_number} failed for user {user.id} with error: {error}"
            )
            if attempt_number < max_attempts:
                logger.info(
                    f"Retrying... ({attempt_number}/{max_attempts})"
                )
                time.sleep(2)

    raise RuntimeError(
        f"Docker failed for {user.id} after {max_attempts} attempts."
    )

def docker_locked(func):
    def wrapper(*args, **kwargs):
        user = get_current_user()
        redis_client = redis.from_url(current_app.config["REDIS_URL"])
        try:
            with redis_client.lock(f"user.{user.id}.docker.lock",
                                   blocking_timeout=0,
                                   timeout=DOCKER_LOCK_SECONDS,
                                   raise_on_release_error=False):
                return func(*args, **kwargs)
        except redis.exceptions.LockError:
            return {"success": False, "error": "题目正在启动或排队中，请稍后重试。"}
    return wrapper




@docker_namespace.route("/next")
class NextChallenge(Resource):
    @authed_only
    def get(self):
        dojo_challenge = get_current_dojo_challenge()
        if not dojo_challenge:
            return {"success": False, "error": "当前没有活动题目。"}

        # Get all challenges in the current module
        module_challenges = DojoChallenges.query.filter_by(
            dojo_id=dojo_challenge.dojo_id,
            module_index=dojo_challenge.module_index
        ).order_by(DojoChallenges.challenge_index).all()
        # Find the current challenge index
        current_idx = next((i for i, c in enumerate(module_challenges) if c.challenge_index == dojo_challenge.challenge_index), None)

        if current_idx is None:
            return {"success": False, "error": "当前题目不在此单元中。"}

        # Check if there's a next challenge in the current module
        if current_idx + 1 < len(module_challenges):
            next_challenge = module_challenges[current_idx + 1]
            return {
                "success": True,
                "dojo": dojo_challenge.dojo.reference_id,
                "module": next_challenge.module.id,
                "challenge": next_challenge.id,
                "challenge_index": next_challenge.challenge_index
            }

        # Check if there's a next module
        next_module = DojoModules.query.filter_by(
            dojo_id=dojo_challenge.dojo_id,
            module_index=dojo_challenge.module_index + 1
        ).first()

        if next_module:
            # Get the first challenge of the next module
            first_challenge = DojoChallenges.query.filter_by(
                dojo_id=dojo_challenge.dojo_id,
                module_index=next_module.module_index
            ).order_by(DojoChallenges.challenge_index).first()

            if first_challenge:
                return {
                    "success": True,
                    "dojo": dojo_challenge.dojo.reference_id,
                    "module": first_challenge.module.id,
                    "challenge": first_challenge.id,
                    "challenge_index": first_challenge.challenge_index,
                    "new_module": True
                }

        # No next challenge available
        return {"success": False, "error": "没有可启动的下一道题目。"}


@docker_namespace.route("")
class RunDocker(Resource):
    @authed_only_ssh
    @authed_only_cli
    @authed_only
    @docker_locked
    def post(self):
        data = request.get_json()
        dojo_id = data.get("dojo")
        module_id = data.get("module")
        challenge_id = data.get("challenge")
        practice = data.get("practice")

        user = get_current_user()
        as_user = None

        # https://github.com/CTFd/CTFd/blob/3.6.0/CTFd/utils/initialization/__init__.py#L286-L296
        workspace_token = request.headers.get("X-Workspace-Token")
        if workspace_token:
            try:
                token_user = lookup_workspace_token(workspace_token)
            except UserNotFoundException:
                abort(401, description="Invalid workspace token")
            except UserTokenExpiredException:
                abort(401, description="This workspace token has expired")
            except Exception:
                logger.exception(f"error resolving workspace token for {user.id}:")
                abort(401, description="Internal error while resolving workspace token")
            else:
                as_user = token_user

        dojo = dojo_accessible(dojo_id)
        if not dojo:
            return {"success": False, "error": "课程不存在或无权访问。"}

        dojo_challenge = (
            DojoChallenges.query.filter_by(id=challenge_id)
            .join(DojoModules.query.filter_by(dojo=dojo, id=module_id).subquery())
            .first()
        )
        if not dojo_challenge:
            return {"success": False, "error": "题目不存在或无权访问。"}

        if not dojo_challenge.visible() and not dojo.is_admin():
            return {"success": False, "error": "题目不存在或无权访问。"}

        if practice and not dojo_challenge.allow_privileged:
            return {
                "success": False,
                "error": "此题目不支持练习模式。",
            }

        if is_challenge_locked(dojo_challenge, user):
            return {
                "success": False,
                "error": "此题目尚未解锁。"
            }

        if dojo.is_admin(user) and "as_user" in data:
            try:
                as_user_id = int(data["as_user"])
            except ValueError:
                return {"success": False, "error": f"无效的用户 ID（{data['as_user']}）。"}
            if is_admin():
                as_user = Users.query.get(as_user_id)
            else:
                student = next((student for student in dojo.students if student.user_id == as_user_id), None)
                if student is None:
                    return {"success": False, "error": f"该用户不是此课程的学生（{as_user_id}）。"}
                if not student.official:
                    return {"success": False, "error": f"该用户不是此课程的正式学生（{as_user_id}）。"}
                as_user = student.user

        try:
            exercise_mode = challenge_exercise_mode(dojo_challenge)
            actual_user = as_user or user
            if exercise_mode == "SIMULATION":
                remove_container(user)
                attempt = start_attempt(
                    actual_user,
                    dojo_challenge,
                    "PRACTICE" if practice else "ASSESSMENT",
                    {
                        "exerciseMode": exercise_mode,
                        "interfaces": [{"name": "Simulation"}],
                    },
                )
                simulation_run = start_simulation_run(user, dojo_challenge, attempt)
                db.session.commit()
            else:
                if exercise_mode == "CONTAINER":
                    interrupt_simulation_runs(user.id, reason="container-started")
                _, attempt = start_challenge_session(
                    user,
                    dojo_challenge,
                    practice,
                    as_user=as_user,
                )
                simulation_run = (
                    start_simulation_run(user, dojo_challenge, attempt)
                    if exercise_mode == "HYBRID"
                    else None
                )
                db.session.commit()
        except RuntimeError as error:
            logger.error(str(error))
            return {"success": False, "error": str(error) or "工作区容器启动失败。"}
        except Exception:
            db.session.rollback()
            logger.exception(
                "Failed to start exercise mode for challenge %s",
                dojo_challenge.reference_id,
            )
            return {"success": False, "error": "题目运行环境启动失败。"}

        return {
            "success": True,
            "exerciseMode": exercise_mode,
            "simulationRunId": simulation_run.id if simulation_run else None,
            "statePreserved": preserved_state(),
        }

    @authed_only_cli
    @authed_only
    def get(self):
        dojo_challenge = get_current_dojo_challenge()
        if not dojo_challenge:
            return {"success": False, "error": "当前没有活动题目。"}

        user = get_current_user()
        container = optional_container(user)
        simulation_run = current_simulation_run(user.id, dojo_challenge)
        if not container and not simulation_run:
            return {"success": False, "error": "未找到活动题目运行环境。"}

        practice = (
            container.labels.get("dojo.mode") == "privileged"
            if container
            else False
        )
        return {
            "success": True,
            "dojo": dojo_challenge.dojo.reference_id,
            "module": dojo_challenge.module.id,
            "challenge": dojo_challenge.id,
            "practice" : practice,
            "exerciseMode": challenge_exercise_mode(dojo_challenge),
            "simulationRunId": simulation_run.id if simulation_run else None,
        }

    @authed_only
    @docker_locked
    def delete(self):
        user = get_current_user()
        container = optional_container(user)
        simulation_run = active_simulation_run(user.id)

        if not container and not simulation_run:
            return {
                "success": True,
                "alreadyStopped": True,
                "message": "当前没有运行中的题目环境。",
                "statePreserved": {"kind": "none", "message": "启动后会从初始状态开始。"},
            }

        try:
            attempt = active_attempt(user.id)
            state = preserved_state() if container else {"kind": "none", "message": "启动后会从初始状态开始。"}
            if container:
                remove_container(user)
                publish_stat_event("container_stats_update", {})
            if simulation_run:
                stop_simulation_run(simulation_run)
            elif attempt:
                append_evidence(
                    attempt,
                    "lab.stopped",
                    {"reason": "user-requested"},
                    source="RUNTIME",
                    trust_level=3,
                )
                attempt.status = "STOPPED"
                attempt.completed = datetime.datetime.utcnow()
            db.session.commit()
            return {
                "success": True,
                "message": (
                    "题目情境运行已停止。"
                    if simulation_run and not container
                    else "题目运行环境已停止。"
                ),
                "statePreserved": state,
            }
        except WindowsShutdownPending as error:
            db.session.rollback()
            return {"success": False, "error": str(error), "shutdownPending": True, "statePreserved": preserved_state()}, 409
        except Exception as e:
            logger.error(f"Failed to terminate container for user {user.id}: {e}")
            db.session.rollback()
            return {"success": False, "error": "停止题目运行环境失败。"}


@docker_namespace.route('/reset')
class ResetDocker(Resource):
    @authed_only
    def get(self):
        user=get_current_user();container=optional_container(user);challenge=get_current_dojo_challenge(user)
        if not challenge:return {'success':False,'error':'请先启动要重置的题目。'},409
        simulation=current_simulation_run(user.id,challenge);mode=challenge_exercise_mode(challenge)
        if not container and not simulation:return {'success':False,'error':'未找到当前题目的运行环境。'},409
        coding=(challenge.data or {}).get('coding_workspace')
        preview=coding_reset(container) if coding and container else {}
        scope='question-code' if coding else 'question-state' if mode=='SIMULATION' else 'question-runtime'
        return {'success':True,'challengeId':challenge.challenge_id,'dojoId':challenge.dojo.reference_id,'name':challenge.name,'scope':scope,'containerId':container.id if container else None,'files':preview.get('files',[]),'preservesHome':True,'preservesGrades':True}

    @authed_only
    @docker_locked
    def post(self):
        data=request.get_json(silent=True) or {};user=get_current_user();container=optional_container(user);challenge=get_current_dojo_challenge(user)
        if not challenge or data.get('challengeId')!=challenge.challenge_id or data.get('dojoId')!=challenge.dojo.reference_id:
            return {'success':False,'error':'当前题目已变化，请重新查看重置范围。'},409
        simulation=current_simulation_run(user.id,challenge);mode=challenge_exercise_mode(challenge)
        if not container and not simulation:return {'success':False,'error':'未找到当前题目运行环境。'},409
        if data.get('containerId') != (container.id if container else None):return {'success':False,'error':'环境已变化，请重新查看重置范围。'},409
        practice=container.labels.get('dojo.mode')=='privileged' if container else False
        owner_id=int(container.labels.get('dojo.as_user_id',user.id)) if container else user.id
        owner=Users.query.get(owner_id);as_user=owner if owner_id!=user.id else None
        coding=(challenge.data or {}).get('coding_workspace');restore_id=data.get('restoreId');volume_event=None
        scope='question-code' if coding else 'question-state' if mode=='SIMULATION' else 'question-runtime'
        if data.get('scope')!=scope:return {'success':False,'error':'重置范围已变化，请重新确认。'},409
        try:
            backup_id=None;restarted=False
            if coding:
                result=coding_reset(container,True,restore_id)
                backup_id=result.get('backup',{}).get('id')
            elif mode=='SIMULATION':
                if restore_id:return {'success':False,'error':'情境题保留历史证据，但不支持把历史作答恢复为新作答。'},400
                if simulation:stop_simulation_run(simulation,reason='question-reset')
                attempt=start_attempt(owner,challenge,'PRACTICE' if practice else 'ASSESSMENT',{'exerciseMode':mode,'reset':True})
                replacement=start_simulation_run(user,challenge,attempt);db.session.commit()
                restarted=True
            else:
                previous=windows_volume(container)
                if previous:
                    volume_event=switch_volume(owner_id,challenge,previous,restore_id);backup_id=str(volume_event.id)
                elif restore_id:return {'success':False,'error':'本题没有可恢复的客户机磁盘。'},400
                _,attempt=start_challenge_session(user,challenge,practice,as_user=as_user)
                restarted=True
                if mode=='HYBRID':start_simulation_run(user,challenge,attempt)
            current_attempt=active_attempt(owner_id,challenge)
            if current_attempt:append_evidence(current_attempt,'lab.reset.completed',{'scope':scope,'homeErased':False,'backupId':backup_id,'restoredFrom':restore_id},source='PLATFORM',trust_level=3)
            db.session.commit()
            return {'success':True,'message':'已恢复本题的起始状态，其他题目文件和历史成绩保留。' if not restore_id else '已恢复本题上一次保存的状态。','exerciseMode':mode,'runtimeRestarted':restarted,'backupId':backup_id,'scope':scope}
        except Exception:
            db.session.rollback()
            if volume_event is not None:
                existing=db.session.get(type(volume_event),volume_event.id)
                if existing:existing.outcome='ERROR';db.session.commit()
            logger.exception('Question reset failed for user %s',user.id)
            return {'success':False,'error':'本题重置未完成，原有个人文件和客户机恢复点保留。'},409

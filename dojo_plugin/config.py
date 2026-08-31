import warnings
import logging
import ast
import os
import pathlib
import json
import socket

from sqlalchemy.exc import IntegrityError
from CTFd.models import db, Admins, Pages
from CTFd.utils import config, set_config

logger = logging.getLogger(__name__)

DOJOS_DIR = pathlib.Path("/var/dojos")

FEED_EVENT_TTL = int(os.environ.get("FEED_EVENT_TTL", "86400"))
FEED_MAX_EVENTS = int(os.environ.get("FEED_MAX_EVENTS", "1000"))
FEED_BATCH_SIZE = int(os.environ.get("FEED_BATCH_SIZE", "50"))

WORKSPACE_NODES = {
    int(node_id): node_key
    for node_id, node_key in
    json.load(pathlib.Path("/var/workspace_nodes.json").open()).items()
}

def create_seccomp():
    seccomp = json.load(pathlib.Path("/etc/docker/seccomp.json").open())

    READ_IMPLIES_EXEC = 0x0400000
    ADDR_NO_RANDOMIZE = 0x0040000

    existing_personality_values = []
    for syscalls in seccomp["syscalls"]:
        if "personality" not in syscalls["names"]:
            continue
        if syscalls["action"] != "SCMP_ACT_ALLOW":
            continue
        assert len(syscalls["args"]) == 1
        arg = syscalls["args"][0]
        assert list(arg.keys()) == ["index", "value", "op"]
        assert arg["index"] == 0, arg
        assert arg["op"] == "SCMP_CMP_EQ"
        existing_personality_values.append(arg["value"])

    new_personality_values = []
    for new_flag in [READ_IMPLIES_EXEC, ADDR_NO_RANDOMIZE]:
        for value in [0, *existing_personality_values]:
            new_value = value | new_flag
            if new_value not in existing_personality_values:
                new_personality_values.append(new_value)
                existing_personality_values.append(new_value)

    for new_value in new_personality_values:
        seccomp["syscalls"].append({
            "names": ["personality"],
            "action": "SCMP_ACT_ALLOW",
            "args": [
                {
                    "index": 0,
                    "value": new_value,
                    "op": "SCMP_CMP_EQ",
                },
            ],
        })

    return json.dumps(seccomp)
SECCOMP = create_seccomp()

def first_ipv4_address(hostname):
    try:
        return sorted(set(info[4][0] for info in socket.getaddrinfo(hostname, None, family=socket.AF_INET)))[0]
    except Exception as e:
        warnings.warn(f"Could not resolve IPv4 address for {hostname}: {e}")
        return None

USER_FIREWALL_ALLOWED = {
    host: first_ipv4_address(host) or "0.0.0.0"
    for host in pathlib.Path("/var/user_firewall.allowed").read_text().split()
}

DOJO_HOST = os.getenv("DOJO_HOST")
DOJO_IP_MODE = (os.getenv("DOJO_IP_MODE") or "false").strip().lower() in {
    "1",
    "true",
    "yes",
}
WORKSPACE_SECRET = os.environ.get("WORKSPACE_SECRET")
WORKSPACE_SESSION_SECONDS = max(
    900,
    min(86400, int(os.environ.get("WORKSPACE_SESSION_SECONDS") or "21600")),
)
DOJO_SSH_SERVICE_KEY = os.environ.get("DOJO_SSH_SERVICE_KEY")
HOST_DATA_PATH = os.getenv("HOST_DATA_PATH")
MAIL_SERVER = os.getenv("MAIL_SERVER")
MAIL_PORT = os.getenv("MAIL_PORT")
MAIL_USERNAME = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
MAIL_ADDRESS = os.getenv("MAIL_ADDRESS")
CORS_ORIGINS = os.getenv("CORS_ORIGINS")
DOCKER_USERNAME = os.getenv("DOCKER_USERNAME")
DOCKER_TOKEN = os.getenv("DOCKER_TOKEN")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID")
INTERNET_FOR_ALL = bool(ast.literal_eval(os.getenv("INTERNET_FOR_ALL") or "False"))
MAC_HOSTNAME = os.getenv("MAC_HOSTNAME")
MAC_USERNAME = os.getenv("MAC_USERNAME")
DOJO_AI_API_KEY = os.getenv("DEEPSEEK_API_KEY") or os.getenv("DOJO_AI_API_KEY")
_dojo_ai_enabled = (os.getenv("DOJO_AI_ENABLED") or "auto").strip().lower()
DOJO_AI_ENABLED = (
    bool(DOJO_AI_API_KEY)
    if _dojo_ai_enabled == "auto"
    else _dojo_ai_enabled in {"1", "true", "yes"}
)
DOJO_AI_BASE_URL = (
    os.getenv("DOJO_AI_BASE_URL") or "https://api.deepseek.com"
).rstrip("/")
DOJO_AI_TUTOR_MODEL = os.getenv("DOJO_AI_TUTOR_MODEL") or "deepseek-v4-flash"
DOJO_AI_GUIDE_MODEL = os.getenv("DOJO_AI_GUIDE_MODEL") or "deepseek-v4-flash"
DOJO_AI_GRADER_MODEL = os.getenv("DOJO_AI_GRADER_MODEL") or "deepseek-v4-pro"
DOJO_AI_SOLUTION_MODEL = os.getenv("DOJO_AI_SOLUTION_MODEL") or "deepseek-v4-pro"
DOJO_AI_AUTHORING_PLAN_MODEL = (
    os.getenv("DOJO_AI_AUTHORING_PLAN_MODEL") or "deepseek-v4-flash"
)
DOJO_AI_AUTHORING_BUILD_MODEL = (
    os.getenv("DOJO_AI_AUTHORING_BUILD_MODEL") or "deepseek-v4-pro"
)
DOJO_AI_AUTHORING_VALIDATE_MODEL = (
    os.getenv("DOJO_AI_AUTHORING_VALIDATE_MODEL") or "deepseek-v4-pro"
)
DOJO_AI_COMPLEX_SCENE_MODEL = (
    os.getenv("DOJO_AI_COMPLEX_SCENE_MODEL") or "deepseek-v4-pro"
)
DOJO_AI_TIMEOUT_SECONDS = float(os.getenv("DOJO_AI_TIMEOUT_SECONDS") or "120")
DOJO_AI_TOTAL_TIMEOUT_SECONDS = max(
    DOJO_AI_TIMEOUT_SECONDS,
    min(600.0, float(os.getenv("DOJO_AI_TOTAL_TIMEOUT_SECONDS") or "600")),
)
DOJO_AI_MAX_CONTEXT_CHARS = max(
    32000, int(os.getenv("DOJO_AI_MAX_CONTEXT_CHARS") or "180000")
)
DOJO_AI_MAX_FILE_CHARS = max(
    4000, int(os.getenv("DOJO_AI_MAX_FILE_CHARS") or "32000")
)
AGENT_RUNTIME_INTERNAL_URL = (
    os.getenv("GLOBAL_AGENT_RUNTIME_INTERNAL_URL")
    or os.getenv("OPENMAIC_INTERNAL_URL")
    or "http://agent-runtime:3000/agent-runtime"
).rstrip("/")
AGENT_RUNTIME_PUBLIC_ORIGIN = (
    os.getenv("GLOBAL_AGENT_RUNTIME_PUBLIC_ORIGIN")
    or os.getenv("OPENMAIC_PUBLIC_ORIGIN")
    or f"https://{DOJO_HOST}/agent-runtime"
).rstrip("/")
AGENT_RUNTIME_TICKET_SECRET = (
    os.getenv("GLOBAL_AGENT_RUNTIME_TICKET_SECRET")
    or os.getenv("OPENMAIC_TICKET_SECRET")
    or ""
)
AGENT_RUNTIME_SERVICE_SECRET = (
    os.getenv("GLOBAL_AGENT_RUNTIME_SERVICE_SECRET")
    or os.getenv("OPENMAIC_SERVICE_SECRET")
    or ""
)
AGENT_RUNTIME_LAUNCH_TTL_SECONDS = max(
    30,
    min(
        300,
        int(
            os.getenv("GLOBAL_AGENT_RUNTIME_LAUNCH_TTL_SECONDS")
            or os.getenv("OPENMAIC_LAUNCH_TTL_SECONDS")
            or "90"
        ),
    ),
)
AGENT_RUNTIME_SESSION_TTL_SECONDS = max(
    300,
    min(
        86400,
        int(
            os.getenv("GLOBAL_AGENT_RUNTIME_SESSION_TTL_SECONDS")
            or os.getenv("OPENMAIC_SESSION_TTL_SECONDS")
            or "28800"
        ),
    ),
)
AGENT_RUNTIME_STORAGE_ROOT = pathlib.Path(
    os.getenv("GLOBAL_AGENT_RUNTIME_STORAGE_ROOT")
    or os.getenv("OPENMAIC_STORAGE_ROOT")
    or "/var/agent-runtime"
)

missing_errors = [
    "DOJO_HOST",
    "HOST_DATA_PATH",
    "AGENT_RUNTIME_TICKET_SECRET",
    "AGENT_RUNTIME_SERVICE_SECRET",
]
for config_option in missing_errors:
    config_value = globals()[config_option]
    if not config_value:
        raise RuntimeError(f"Configuration Error: {config_option} must be set in the environment")

platform_secret = os.getenv("SECRET_KEY") or ""
if AGENT_RUNTIME_TICKET_SECRET == AGENT_RUNTIME_SERVICE_SECRET:
    raise RuntimeError(
        "Configuration Error: global agent runtime ticket and service secrets must be distinct"
    )
if platform_secret and platform_secret in {
    AGENT_RUNTIME_TICKET_SECRET,
    AGENT_RUNTIME_SERVICE_SECRET,
}:
    raise RuntimeError(
        "Configuration Error: global agent runtime secrets must be distinct from SECRET_KEY"
    )

def bootstrap():
    set_config("ctf_name", "玄甲")
    set_config(
        "ctf_description",
        "Hands-on cybersecurity courses, guided practice, and isolated workspaces.",
    )
    set_config("user_mode", "users")

    set_config("challenge_visibility", "public")
    set_config("registration_visibility", "public")
    set_config("score_visibility", "public")
    set_config("account_visibility", "public")

    set_config("ctf_theme", "dojo_theme")

    set_config("mail_server", MAIL_SERVER)
    set_config("mail_port", MAIL_PORT)
    set_config("mail_username", MAIL_USERNAME)
    set_config("mail_password", MAIL_PASSWORD)
    set_config("mailfrom_addr", MAIL_ADDRESS)
    set_config("mail_useauth", bool(MAIL_USERNAME))
    set_config("mail_tls", MAIL_PORT == "465" or MAIL_PORT == "587")

    if not config.is_setup():
        admin = Admins(
            name="admin",
            email="admin@example.com",
            password="admin",
            type="admin",
            hidden=True,
        )
        try:
            db.session.add(admin)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()

        page = Pages(title=None, route="index", content="", draft=False)
        try:
            db.session.add(page)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()

        set_config("setup", True)

    db.session.commit()

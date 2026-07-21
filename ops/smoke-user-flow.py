#!/usr/bin/env python3
import os
import pathlib
import re
import secrets
import subprocess
import tempfile
import time
import urllib.parse

import requests
import urllib3
import yaml


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent


def load_deployment_env():
    path = pathlib.Path(
        os.getenv("DOJO_DEPLOYMENT_ENV", REPO_DIR / "ops/deployment.env")
    )
    if not path.is_file():
        return
    for number, raw_line in enumerate(path.read_text().splitlines(), 1):
        line = raw_line.rstrip("\r")
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise ValueError(f"Invalid deployment environment line {number}: {line}")
        os.environ.setdefault(key, value)


load_deployment_env()

CONTAINER = os.getenv("DOJO_CONTAINER", "pwncollege-dojo")
LISTEN_ADDRESS = os.getenv("DOJO_LISTEN_ADDRESS", "127.0.0.1")
HTTPS_PORT = int(os.getenv("DOJO_HTTPS_PORT", "443"))
SSH_PORT = int(os.getenv("DOJO_SSH_PORT", "2223"))
DOJO_HOST = os.getenv("DOJO_HOST", "localhost.pwn.college")
BASE_URL = f"https://{LISTEN_ADDRESS}:{HTTPS_PORT}"
CREDENTIALS = pathlib.Path(
    os.getenv("DOJO_ADMIN_CREDENTIALS", REPO_DIR / "data/admin-password.txt")
)


def passed(message):
    print(f"PASS  {message}", flush=True)


def require(response, statuses=(200,)):
    if response.status_code not in statuses:
        raise AssertionError(
            f"{response.request.method} {response.request.path_url}: "
            f"expected {statuses}, received {response.status_code}"
        )
    return response


def new_session():
    session = requests.Session()
    session.verify = False
    session.trust_env = False
    session.headers["Host"] = DOJO_HOST
    return session


def csrf_nonce(text):
    match = re.search(r"'csrfNonce': \"(\w+)\"", text)
    if not match:
        raise AssertionError("CSRF nonce was not present in the page")
    return match.group(1)


def authenticate(name, password, register=False):
    session = new_session()
    endpoint = "register" if register else "login"
    page = require(session.get(f"{BASE_URL}/{endpoint}", timeout=20))
    payload = {
        "name": name,
        "password": password,
        "nonce": csrf_nonce(page.text),
    }
    if register:
        payload["email"] = f"{name}@example.invalid"
    response = session.post(
        f"{BASE_URL}/{endpoint}", data=payload, allow_redirects=False, timeout=20
    )
    require(response, (302,))
    home = require(session.get(f"{BASE_URL}/", timeout=20))
    session.headers["CSRF-Token"] = csrf_nonce(home.text)
    return session


def credentials():
    values = {"username": "admin", "password": "admin"}
    if CREDENTIALS.exists():
        try:
            content = CREDENTIALS.read_text().strip()
        except PermissionError:
            content = outer("cat", "/data/admin-password.txt").stdout.strip()
        if "=" not in content:
            values["password"] = content
        else:
            for line in content.splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key] = value
    return values["username"], values["password"]


def outer(*args, check=True):
    return subprocess.run(
        ["docker", "exec", CONTAINER, *args],
        check=check,
        capture_output=True,
        text=True,
        timeout=60,
    )


def inner(*args, check=True):
    return outer("docker", *args, check=check)


def solution_counts():
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-F",
        ",",
        "-c",
        "select (select count(*) from solves), (select count(*) from submissions);",
    )
    return tuple(int(value) for value in result.stdout.strip().split(","))


def wait_for_workspace(container_name, present=True, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = inner("inspect", container_name, check=False)
        if (result.returncode == 0) == present:
            return
        time.sleep(2)
    state = "appear" if present else "stop"
    raise AssertionError(f"workspace {container_name} did not {state}")


def start_workspace(session, dojo):
    response = require(
        session.post(
            f"{BASE_URL}/pwncollege_api/v1/docker",
            json={"dojo": dojo, "module": "smoke", "challenge": "service"},
            timeout=120,
        )
    )
    if not response.json().get("success"):
        raise AssertionError(f"workspace start failed: {response.json().get('error')}")


def workspace_service_diagnostics(workspace, service):
    if service != "desktop":
        return
    result = inner(
        "exec",
        workspace,
        "sh",
        "-c",
        "ls -la /run/dojo/var/desktop-service 2>&1; "
        "for file in /run/dojo/var/desktop-service/*.log; do "
        'test -f "$file" || continue; printf \'\\n== %s ==\\n\' "$file"; '
        'tail -n 120 "$file"; done; '
        "printf '\\n== processes ==\\n'; ps -eo pid,ppid,vsz,rss,comm,args | grep -E 'Xvnc|novnc|websockify|xfce' || true; "
        "printf '\\n== memory ==\\n'; grep -E 'MemTotal|MemAvailable|CommitLimit|Committed_AS' /proc/meminfo; "
        "printf 'overcommit='; cat /proc/sys/vm/overcommit_memory; "
        "for pid in $(pgrep -f 'Xvnc|novnc|websockify'); do "
        "printf '\\n== status %s ==\\n' \"$pid\"; grep -E 'Name|Pid|Threads|VmPeak|VmSize|VmRSS|VmData|VmStk' /proc/$pid/status; done; "
        "printf '\\n== cgroup ==\\n'; for file in memory.current memory.max memory.events pids.current pids.max; do "
        "test -f /sys/fs/cgroup/$file || continue; printf '%s=' \"$file\"; cat /sys/fs/cgroup/$file; done; "
        "printf '\\n== limits ==\\n'; cat /proc/1/limits",
        check=False,
    )
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)
    fork_test = inner(
        "exec",
        "--user=1000",
        workspace,
        "/run/current-system/sw/bin/python3",
        "-c",
        "import os; pid=os.fork(); print(f'fork={pid}', flush=True); os._exit(0) if pid == 0 else os.waitpid(pid, 0)",
        check=False,
    )
    print(
        f"fork-test rc={fork_test.returncode} stdout={fork_test.stdout!r} stderr={fork_test.stderr!r}",
        flush=True,
    )
    multiprocessing_test = inner(
        "exec",
        "--user=1000",
        workspace,
        "/run/current-system/sw/bin/python3",
        "-c",
        "import multiprocessing; p=multiprocessing.Process(); p.start(); p.join(); print(f'multiprocessing={p.exitcode}')",
        check=False,
    )
    print(
        f"multiprocessing-test rc={multiprocessing_test.returncode} stdout={multiprocessing_test.stdout!r} stderr={multiprocessing_test.stderr!r}",
        flush=True,
    )


def signed_service(session, service, workspace):
    response = require(
        session.get(
            f"{BASE_URL}/pwncollege_api/v1/workspace",
            params={"service": service},
            timeout=60,
        )
    )
    payload = response.json()
    if not payload.get("success") or not payload.get("iframe_src"):
        workspace_service_diagnostics(workspace, service)
        raise AssertionError(f"{service} did not return a signed workspace URL")
    parsed = urllib.parse.urlsplit(payload["iframe_src"])
    target = urllib.parse.urlunsplit(
        (
            "https",
            f"{LISTEN_ADDRESS}:{HTTPS_PORT}",
            parsed.path,
            parsed.query,
            "",
        )
    )
    for _ in range(20):
        response = requests.get(
            target,
            headers={"Host": parsed.hostname},
            verify=False,
            timeout=15,
            allow_redirects=False,
        )
        if response.status_code in (200, 301, 302, 307, 308):
            return
        time.sleep(2)
    raise AssertionError(f"{service} proxy returned {response.status_code}")


def verify_ssh(private_key):
    command = [
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "ConnectTimeout=10",
        "-i",
        str(private_key),
        "-p",
        str(SSH_PORT),
        f"hacker@{LISTEN_ADDRESS}",
        "id -un",
    ]
    for _ in range(15):
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip() == "hacker":
            return
        time.sleep(2)
    raise AssertionError("key-authenticated SSH command did not succeed")


def cleanup_home(user_id, username):
    if not isinstance(user_id, int) or user_id < 1:
        raise ValueError("invalid smoke user id")
    if not re.fullmatch(r"deployment-smoke-[0-9a-f]{8}", username):
        raise ValueError("invalid smoke username")
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-c",
        f"select name from users where id={user_id};",
    )
    if result.stdout.strip() != username:
        raise RuntimeError("smoke user id no longer matches the generated account")
    inner("volume", "rm", str(user_id), check=False)
    script = r"""
case "$1" in
    ''|*[!0-9]*) exit 2 ;;
esac
root="/run/homefs/$1"
[ -e "$root" ] || exit 0
btrfs subvolume list -o "$root" | awk '{print $9}' | sort -r | while IFS= read -r subvolume; do
    btrfs subvolume delete "/run/homefs/$subvolume"
done
rm -rf "$root"
"""
    result = inner(
        "exec", "homefs", "sh", "-c", script, "cleanup-home", str(user_id), check=False
    )
    if result.returncode != 0:
        raise RuntimeError(f"home cleanup failed: {result.stderr.strip()}")


def cleanup_dojo_path(dojo_reference, expected_id):
    if not re.fullmatch(r"deployment-smoke-[0-9a-f]{8}", expected_id):
        raise ValueError("invalid smoke dojo id")
    match = re.fullmatch(r"deployment-smoke-[0-9a-f]{8}~([0-9a-f]{8})", dojo_reference)
    if not match or dojo_reference.rsplit("~", 1)[0] != expected_id:
        raise ValueError("invalid smoke dojo reference")
    outer("rm", "-rf", f"/data/dojos/{match.group(1)}")


def main():
    solution_counts_before = solution_counts()
    admin_name, admin_password = credentials()
    admin = authenticate(admin_name, admin_password)
    require(admin.get(f"{BASE_URL}/admin", timeout=20))
    passed("administrator login and admin page")

    suffix = secrets.token_hex(4)
    username = f"deployment-smoke-{suffix}"
    password = secrets.token_urlsafe(18)
    dojo_id = f"deployment-smoke-{suffix}"
    user = None
    user_id = None
    dojo = None
    public_key = None
    workspace = None

    try:
        user = authenticate(username, password, register=True)
        me = require(user.get(f"{BASE_URL}/api/v1/users/me", timeout=20)).json()
        user_id = me["data"]["id"]
        workspace = f"user_{user_id}"
        require(user.get(f"{BASE_URL}/settings", timeout=20))
        passed("user registration, login, and settings page")

        with tempfile.TemporaryDirectory() as temp_dir:
            private_key = pathlib.Path(temp_dir) / "id_ed25519"
            subprocess.run(
                ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(private_key)],
                check=True,
            )
            public_key = private_key.with_suffix(".pub").read_text().strip()
            response = require(
                user.post(
                    f"{BASE_URL}/pwncollege_api/v1/ssh_key",
                    json={"ssh_key": public_key},
                    timeout=20,
                )
            )
            if not response.json().get("success"):
                raise AssertionError("SSH key was not accepted")
            passed("SSH key registration")

            spec = {
                "id": dojo_id,
                "name": "Deployment Smoke Test",
                "type": "public",
                "image": "pwncollege-smoke:latest",
                "privileged": True,
                "interfaces": [
                    {"name": "SSH"},
                    {"name": "Terminal", "port": 7681},
                    {"name": "Code", "port": 8080},
                    {"name": "Desktop", "port": 6080},
                ],
                "modules": [
                    {
                        "id": "smoke",
                        "name": "Smoke",
                        "challenges": [{"id": "service", "name": "Service Startup"}],
                    }
                ],
                "files": [
                    {
                        "type": "text",
                        "path": "smoke/service/run",
                        "content": "#!/opt/pwn.college/bash\nprintf 'deployment smoke\\n'\n",
                    }
                ],
            }
            response = require(
                admin.post(
                    f"{BASE_URL}/pwncollege_api/v1/dojos/create",
                    json={"spec": yaml.safe_dump(spec, sort_keys=False)},
                    timeout=120,
                )
            )
            dojo = response.json()["dojo"]
            require(user.get(f"{BASE_URL}/dojo/{dojo}/join/", timeout=30))
            require(user.get(f"{BASE_URL}/{dojo}/", timeout=30))
            passed("local smoke dojo creation, listing, and enrollment")

            start_workspace(user, dojo)
            wait_for_workspace(workspace)
            runtime = inner(
                "inspect", "-f", "{{.HostConfig.Runtime}}", workspace
            ).stdout.strip()
            if "kata" not in runtime:
                raise AssertionError(f"workspace runtime is {runtime}, not Kata")
            label = inner(
                "inspect",
                "-f",
                '{{index .Config.Labels "dojo.challenge_id"}}',
                workspace,
            ).stdout.strip()
            if label != "service":
                raise AssertionError(f"unexpected workspace challenge label: {label}")
            mount = inner(
                "exec", "--user=1000", workspace, "findmnt", "-n", "/home/hacker"
            ).stdout
            if "nosuid" not in mount:
                raise AssertionError("workspace home mount is not nosuid")
            passed("Kata workspace startup, labels, and nosuid home mount")

            active = require(user.get(f"{BASE_URL}/active-module", timeout=20)).json()
            if active["c_current"]["challenge_reference_id"] != "service":
                raise AssertionError("active-module did not report the smoke workspace")
            passed("active workspace API")

            for service in ("terminal", "code", "desktop"):
                signed_service(user, service, workspace)
                passed(f"signed {service} service proxy")

            verify_ssh(private_key)
            passed("key-authenticated SSH routing and command execution")

            inner(
                "exec",
                "--user=1000",
                workspace,
                "touch",
                "/home/hacker/.deployment-smoke",
            )
            response = require(
                user.delete(f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60)
            )
            if not response.json().get("success"):
                raise AssertionError("workspace stop failed")
            wait_for_workspace(workspace, present=False)
            start_workspace(user, dojo)
            wait_for_workspace(workspace)
            inner(
                "exec",
                "--user=1000",
                workspace,
                "test",
                "-f",
                "/home/hacker/.deployment-smoke",
            )
            passed("workspace stop/start and home persistence")

        if solution_counts() != solution_counts_before:
            raise AssertionError("smoke test changed solve or submission counts")
        passed("no solves or submissions recorded")

        print("All non-solving user-flow checks passed", flush=True)
    finally:
        if user is not None:
            user.delete(f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60)
            if public_key:
                key_parts = public_key.split()
                user.delete(
                    f"{BASE_URL}/pwncollege_api/v1/ssh_key",
                    json={"ssh_key": " ".join(key_parts[:2])},
                    timeout=20,
                )
        if workspace:
            inner("rm", "-f", workspace, check=False)
        if dojo:
            response = admin.post(
                f"{BASE_URL}/dojo/{dojo}/delete/",
                json={"dojo": dojo},
                timeout=60,
            )
            require(response)
            if not response.json().get("success"):
                raise RuntimeError("smoke dojo deletion failed")
            cleanup_dojo_path(dojo, dojo_id)
        if user_id:
            cleanup_home(user_id, username)
        if user_id:
            response = require(
                admin.delete(f"{BASE_URL}/api/v1/users/{user_id}", json={}, timeout=30)
            )
            if not response.json().get("success"):
                raise RuntimeError("smoke user deletion failed")


if __name__ == "__main__":
    main()

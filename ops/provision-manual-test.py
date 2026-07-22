#!/usr/bin/env python3
import argparse
import os
import pathlib
import re
import secrets
import subprocess
import tempfile
import time

import requests
import urllib3


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
SPEC_PATH = REPO_DIR / "local-dojos/manual-platform-check.yml"
CREDENTIALS_PATH = REPO_DIR / "data/manual-test-account.txt"
ADMIN_CREDENTIALS_PATH = REPO_DIR / "data/admin-password.txt"
USERNAME = os.getenv("DOJO_MANUAL_USERNAME", "manualtester")


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
DOJO_HOST = os.getenv("DOJO_HOST", "localhost.pwn.college")
BASE_URL = f"https://{LISTEN_ADDRESS}:{HTTPS_PORT}"


def require(response, statuses=(200,)):
    if response.status_code not in statuses:
        raise RuntimeError(
            f"{response.request.method} {response.request.path_url}: "
            f"expected {statuses}, received {response.status_code}: {response.text[:500]}"
        )
    return response


def session():
    result = requests.Session()
    result.verify = False
    result.trust_env = False
    result.headers["Host"] = DOJO_HOST
    return result


def authenticate(name, password, register=False):
    client = session()
    endpoint = "register" if register else "login"
    client.headers["Authorization"] = "Bearer frontend-session"
    payload = {
        "name": name,
        "password": password,
    }
    if register:
        payload["email"] = f"{name}@example.invalid"
        payload["commitment_accepted"] = True
    require(
        client.post(
            f"{BASE_URL}/pwncollege_api/v1/auth/{endpoint}",
            json=payload,
            allow_redirects=False,
            timeout=20,
        ),
        (200,),
    )
    return client


def parse_credentials(path):
    if not path.exists():
        return {}
    try:
        content = path.read_text()
    except PermissionError:
        content = subprocess.run(
            ["docker", "exec", CONTAINER, "cat", f"/data/{path.name}"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    values = {}
    for line in content.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key] = value
    return values


def write_credentials(values):
    CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=CREDENTIALS_PATH.parent, prefix=".manual-test-account."
    )
    temporary_path = pathlib.Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            for key in ("username", "password", "user_id", "dojo", "url"):
                if key in values:
                    stream.write(f"{key}={values[key]}\n")
        os.replace(temporary_path, CREDENTIALS_PATH)
    finally:
        temporary_path.unlink(missing_ok=True)


def admin_credentials():
    values = parse_credentials(ADMIN_CREDENTIALS_PATH)
    if not values:
        try:
            password = ADMIN_CREDENTIALS_PATH.read_text().strip()
        except PermissionError:
            password = subprocess.run(
                ["docker", "exec", CONTAINER, "cat", "/data/admin-password.txt"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        return "admin", password
    return values.get("username", "admin"), values["password"]


def existing_dojo_reference():
    query = (
        "SELECT id || '~' || lpad(to_hex(dojo_id), 8, '0') "
        "FROM dojos WHERE id = 'manual-platform-check' LIMIT 1;"
    )
    result = subprocess.run(
        [
            "docker",
            "exec",
            CONTAINER,
            "docker",
            "exec",
            "db",
            "psql",
            "-U",
            "ctfd",
            "-d",
            "ctfd",
            "-qAt",
            "-c",
            query,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() or None


def inner(*args, check=True):
    return subprocess.run(
        ["docker", "exec", CONTAINER, "docker", *args],
        check=check,
        capture_output=True,
        text=True,
    )


def wait_for_workspace(workspace, present=True, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = inner("inspect", workspace, check=False)
        if (result.returncode == 0) == present:
            return
        time.sleep(1)
    raise RuntimeError(f"workspace {workspace} presence did not become {present}")


def solution_counts():
    query = "SELECT (SELECT count(*) FROM solves), (SELECT count(*) FROM submissions);"
    result = subprocess.run(
        [
            "docker",
            "exec",
            CONTAINER,
            "docker",
            "exec",
            "db",
            "psql",
            "-U",
            "ctfd",
            "-d",
            "ctfd",
            "-qAt",
            "-c",
            query,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return tuple(int(value) for value in result.stdout.strip().split("|"))


def stop_workspace(client, workspace):
    client.delete(f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60)
    wait_for_workspace(workspace, present=False)


def verify_challenge_startup(client, dojo, user_id):
    workspace = f"user_{user_id}"
    checks = {
        "terminal-handshake": [
            "/challenge/motd.txt",
            "/challenge/check",
            "/challenge/.init",
            "/challenge/check-server.py",
        ],
        "log-search": [
            "/challenge/records.log",
            "/challenge/check",
            "/challenge/.init",
            "/challenge/check-server.py",
        ],
        "persistent-home": [
            "/challenge/check",
            "/challenge/.init",
            "/challenge/check-server.py",
        ],
        "web-service": ["/challenge/.init", "/challenge/server.py"],
    }
    counts_before = solution_counts()
    inner("rm", "-f", workspace, check=False)

    try:
        for challenge, paths in checks.items():
            response = require(
                client.post(
                    f"{BASE_URL}/pwncollege_api/v1/docker",
                    json={
                        "dojo": dojo,
                        "module": "manual",
                        "challenge": challenge,
                        "practice": False,
                    },
                    timeout=90,
                )
            )
            if not response.json().get("success"):
                raise RuntimeError(f"failed to start {challenge}: {response.json()}")
            wait_for_workspace(workspace)

            runtime = inner(
                "inspect", "-f", "{{.HostConfig.Runtime}}", workspace
            ).stdout.strip()
            if "kata" not in runtime:
                raise RuntimeError(f"{challenge} used unexpected runtime: {runtime}")
            label = inner(
                "inspect",
                "-f",
                '{{index .Config.Labels "dojo.challenge_id"}}',
                workspace,
            ).stdout.strip()
            if label != challenge:
                raise RuntimeError(f"{challenge} has unexpected label: {label}")
            for path in paths:
                inner("exec", "--user=1000", workspace, "test", "-e", path)

            if challenge != "web-service":
                negative_check = inner(
                    "exec",
                    "--user=1000",
                    workspace,
                    "/challenge/check",
                    "__startup_probe_invalid__",
                    check=False,
                )
                if negative_check.returncode != 1:
                    raise RuntimeError(
                        f"{challenge} checker did not reject the startup probe"
                    )
                if "pwn.college{" in negative_check.stdout + negative_check.stderr:
                    raise RuntimeError(
                        f"{challenge} checker exposed a flag to the startup probe"
                    )
            else:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    result = inner(
                        "exec",
                        "--user=1000",
                        workspace,
                        "python3",
                        "-c",
                        "import socket; socket.create_connection(('127.0.0.1', 80), 2).close()",
                        check=False,
                    )
                    if result.returncode == 0:
                        break
                    time.sleep(1)
                else:
                    raise RuntimeError("web-service did not listen on port 80")

                workspace_url = require(
                    client.get(
                        f"{BASE_URL}/pwncollege_api/v1/workspace",
                        params={"port": 80},
                        timeout=20,
                    )
                ).json()["iframe_src"]
                proxy_client = requests.Session()
                proxy_client.verify = False
                proxy_client.trust_env = False
                with proxy_client.get(
                    workspace_url, stream=True, timeout=20
                ) as proxy_response:
                    require(proxy_response)

            print(f"PASS startup only (no flag read): {challenge}")
            stop_workspace(client, workspace)
    finally:
        inner("rm", "-f", workspace, check=False)

    if solution_counts() != counts_before:
        raise RuntimeError("startup verification changed solve or submission counts")
    print("PASS startup verification left solves and submissions unchanged")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--verify-startup",
        action="store_true",
        help="start and stop each challenge without reading or submitting a flag",
    )
    parser.add_argument(
        "--replace-dojo",
        action="store_true",
        help="delete and recreate the managed dojo (this removes its existing progress)",
    )
    args = parser.parse_args()

    stored = parse_credentials(CREDENTIALS_PATH)
    password = stored.get("password") or secrets.token_urlsafe(18)

    admin_name, admin_password = admin_credentials()
    admin = authenticate(admin_name, admin_password)
    require(admin.get(f"{BASE_URL}/admin", timeout=20))

    try:
        user = authenticate(USERNAME, password)
    except RuntimeError:
        if stored:
            raise
        user = authenticate(USERNAME, password, register=True)

    me = require(user.get(f"{BASE_URL}/api/v1/users/me", timeout=20)).json()
    user_id = me["data"]["id"]
    values = {"username": USERNAME, "password": password, "user_id": user_id}
    write_credentials(values)

    dojo = stored.get("dojo") or existing_dojo_reference()
    if dojo:
        response = user.get(f"{BASE_URL}/{dojo}/", timeout=30)
        if response.status_code != 200:
            dojo = None

    if dojo and args.replace_dojo:
        response = require(
            admin.post(f"{BASE_URL}/dojo/{dojo}/delete/", json={}, timeout=60)
        )
        if not response.json().get("success"):
            raise RuntimeError(f"failed to replace dojo: {response.json()}")
        dojo = None

    if not dojo:
        response = require(
            admin.post(
                f"{BASE_URL}/pwncollege_api/v1/dojos/create",
                json={"spec": SPEC_PATH.read_text()},
                timeout=120,
            )
        )
        dojo = response.json()["dojo"]

    require(user.get(f"{BASE_URL}/dojo/{dojo}/join/", timeout=30))
    dojo_page = require(user.get(f"{BASE_URL}/{dojo}/manual/", timeout=30))
    for expected in ("终端握手", "日志检索", "Home 持久化与权限", "浏览器 Web 服务"):
        if expected not in dojo_page.text:
            raise RuntimeError(f"dojo page does not contain challenge: {expected}")

    values.update({"dojo": dojo, "url": f"https://{DOJO_HOST}/{dojo}/"})
    write_credentials(values)

    print(f"Provisioned user: {USERNAME}")
    print(f"Provisioned dojo: {dojo}")
    print(f"Manual URL: https://{DOJO_HOST}/{dojo}/")
    print(f"Credentials: {CREDENTIALS_PATH}")
    if args.verify_startup:
        verify_challenge_startup(user, dojo, user_id)


if __name__ == "__main__":
    main()

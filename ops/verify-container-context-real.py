#!/usr/bin/env python3
"""Verify the trusted live-container context against a real workspace."""

import importlib.util
import json
import pathlib
import secrets

import yaml


SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
FLOW_PATH = SCRIPT_DIR / "verify-learning-flow.py"
MODULE_SPEC = importlib.util.spec_from_file_location(
    "aisecedu_verify_learning_flow",
    FLOW_PATH,
)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError("unable to load learning-flow verification helpers")
flow = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(flow)


def main():
    initial_counts = flow.solution_counts()
    admin_name, admin_password = flow.credentials()
    admin = flow.authenticate(admin_name, admin_password)
    suffix = secrets.token_hex(4)
    username = f"learning-e2e-{suffix}"
    password = secrets.token_urlsafe(18)
    dojo_id = f"learning-e2e-{suffix}"
    learner = None
    user_id = None
    workspace = None
    dojo = None
    database_id = None
    challenge_ids = []
    try:
        learner = flow.authenticate(username, password, register=True)
        user_id = flow.require(
            learner.get(f"{flow.BASE_URL}/api/v1/users/me", timeout=20)
        ).json()["data"]["id"]
        workspace = f"user_{user_id}"
        spec = {
            "id": dojo_id,
            "name": "玄甲 Live Context Verification",
            "type": "public",
            "modules": [
                {
                    "id": "lab",
                    "name": "Live Context Unit",
                    "challenges": [
                        {
                            "id": "baseline",
                            "name": "Mounted Native Entrypoint",
                            "description": "Inspect and run /challenge/run.",
                        }
                    ],
                }
            ],
            "files": [
                {
                    "type": "text",
                    "path": "lab/baseline/run",
                    "content": "#!/opt/pwn.college/bash\nprintf ready\\n\n",
                }
            ],
        }
        dojo = flow.require(
            admin.post(
                f"{flow.BASE_URL}/pwncollege_api/v1/dojos/create",
                json={"spec": yaml.safe_dump(spec, sort_keys=False)},
                timeout=120,
            )
        ).json()["dojo"]
        database_id = flow.dojo_database_id(dojo_id)
        challenge_ids = flow.dojo_challenge_ids(database_id)
        flow.require(
            learner.get(f"{flow.BASE_URL}/dojo/{dojo}/join/", timeout=30)
        )
        started = flow.require(
            learner.post(
                f"{flow.BASE_URL}/pwncollege_api/v1/docker",
                json={
                    "dojo": dojo,
                    "module": "lab",
                    "challenge": "baseline",
                },
                timeout=180,
            )
        ).json()
        if not started.get("success"):
            raise AssertionError("temporary live-context workspace failed to start")
        flow.wait_for_workspace(workspace)

        code = (
            "import json; "
            "from CTFd import create_app; "
            "app=create_app(); app.app_context().push(); "
            "from CTFd.models import Users; "
            "from CTFd.plugins.dojo_plugin.utils.dojo import "
            "get_current_dojo_challenge; "
            "from CTFd.plugins.dojo_plugin.learning.context import "
            "container_snapshot; "
            f"user=Users.query.get({user_id}); "
            "challenge=get_current_dojo_challenge(user); "
            "snapshot=container_snapshot(user, challenge); "
            "files=((snapshot.get('files') or {}).get('files') or []); "
            "print('SCAN_JSON='+json.dumps({"
            "'available':snapshot.get('available'),"
            "'matchesAttempt':snapshot.get('matchesAttempt'),"
            "'inventoryAvailable':(snapshot.get('files') or {}).get('available'),"
            "'files':[{'path':item.get('path'),'kind':item.get('kind'),"
            "'hasContent':item.get('content') is not None} for item in files]"
            "},sort_keys=True))"
        )
        output = flow.inner(
            "exec",
            "ctfd",
            "python",
            "-c",
            code,
        ).stdout
        marker = next(
            (
                line.removeprefix("SCAN_JSON=")
                for line in output.splitlines()
                if line.startswith("SCAN_JSON=")
            ),
            None,
        )
        if marker is None:
            raise AssertionError("live-context scanner emitted no result")
        snapshot = json.loads(marker)
        run_file = next(
            (
                item
                for item in snapshot.get("files") or []
                if item.get("path") == "run"
            ),
            None,
        )
        if (
            snapshot.get("available") is not True
            or snapshot.get("matchesAttempt") is not True
            or snapshot.get("inventoryAvailable") is not True
            or not run_file
            or run_file.get("kind") != "text"
            or run_file.get("hasContent") is not True
        ):
            raise AssertionError(
                "real live-container context mismatch: "
                + json.dumps(snapshot, sort_keys=True)
            )
        flow.passed(
            "real workspace mounted entrypoint is present in trusted live context"
        )
    finally:
        if learner is not None:
            learner.delete(
                f"{flow.BASE_URL}/pwncollege_api/v1/docker",
                json={},
                timeout=120,
            )
        if workspace:
            flow.inner("rm", "-f", workspace, check=False)
        if dojo:
            flow.require(
                admin.post(
                    f"{flow.BASE_URL}/dojo/{dojo}/delete/",
                    json={"dojo": dojo},
                    timeout=180,
                )
            )
        if database_id is not None:
            flow.outer("rm", "-rf", f"/data/dojos/{database_id & 0xFFFFFFFF:08x}")
        for challenge_id in challenge_ids:
            if flow.learning_challenge_rows(challenge_id) != (0, 0):
                raise RuntimeError("live-context challenge survived cleanup")
        if user_id:
            flow.cleanup_home(user_id, username)
            flow.require(
                admin.delete(
                    f"{flow.BASE_URL}/api/v1/users/{user_id}",
                    json={},
                    timeout=30,
                )
            )
    if flow.solution_counts() != initial_counts:
        raise AssertionError("live-context verifier changed solve/submission counts")
    flow.passed("temporary live-context course, workspace, Home, and user cleaned")


if __name__ == "__main__":
    main()

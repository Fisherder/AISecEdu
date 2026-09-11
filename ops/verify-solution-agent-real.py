#!/usr/bin/env python3
"""Exercise the teacher solution Agent against an isolated real challenge."""

import importlib.util
import json
import pathlib
import re
import secrets
import time

import yaml


SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
FLOW_PATH = SCRIPT_DIR / "verify-learning-flow.py"
MODULE_SPEC = importlib.util.spec_from_file_location(
    "aisecedu_verify_learning_flow", FLOW_PATH
)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError("unable to load learning-flow verification helpers")
flow = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(flow)

POLL_TIMEOUT_SECONDS = 1200


def _solution_diagnostics(run):
    return {
        "status": run.get("status"),
        "phase": run.get("phase"),
        "progress": run.get("progress"),
        "model": run.get("model"),
        "traceSteps": len(run.get("steps") or []),
        "teacherSteps": len((run.get("solution") or {}).get("steps") or []),
    }


def _wait_for_solution(admin, dojo, challenge_id):
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    latest = None
    while time.monotonic() < deadline:
        response = flow.require(
            admin.get(
                f"{flow.API}/dojos/{dojo}/solutions/lab/{challenge_id}",
                timeout=30,
            )
        ).json()
        latest = response.get("solutionRun")
        if latest and latest.get("status") in {"VERIFIED", "FAILED"}:
            return latest
        time.sleep(3)
    raise AssertionError(
        "teacher solution Agent timed out: "
        + json.dumps(_solution_diagnostics(latest or {}), ensure_ascii=False)
    )


def _assert_verified(run):
    if run.get("status") != "VERIFIED":
        raise AssertionError(
            "teacher solution Agent did not verify the real challenge: "
            + json.dumps(_solution_diagnostics(run), ensure_ascii=False)
        )
    verification = run.get("verification") or {}
    solution = run.get("solution") or {}
    trace = run.get("steps") or []
    teacher_steps = solution.get("steps") or []
    required_verification = {
        "flagVerified": True,
        "accountBound": True,
        "challengeBound": True,
        "flagRedacted": True,
        "teacherStepsTraceBound": True,
        "modelTraceMappingAccepted": True,
    }
    if any(verification.get(key) is not value for key, value in required_verification.items()):
        raise AssertionError(
            "teacher solution verification contract is incomplete: "
            + json.dumps(_solution_diagnostics(run), ensure_ascii=False)
        )
    if (
        run.get("model") != "deepseek-v4-flash"
        or solution.get("model") != "deepseek-v4-flash"
        or solution.get("provider") != "MODEL_EXECUTED"
    ):
        raise AssertionError("teacher solution did not use the configured DeepSeek V4 Flash route")
    if not trace or not teacher_steps:
        raise AssertionError("teacher solution omitted its real execution trace or teacher steps")
    if not any(step.get("flagObserved") for step in trace):
        raise AssertionError("teacher solution trace did not contain a platform-verified flag observation")
    if not any(
        (step.get("agentMeta") or {}).get("provider") == "DEEPSEEK"
        for step in trace
        if step.get("kind") == "ACTION"
    ):
        raise AssertionError("no real DeepSeek action is recorded in the solution trace")
    if (solution.get("agentMeta") or {}).get("provider") != "DEEPSEEK":
        raise AssertionError("no real DeepSeek teacher-summary call is recorded")
    trace_turns = [int(step.get("turn") or 0) for step in trace if step.get("policy") == "ALLOWED"]
    mapped_turns = [
        int(turn)
        for step in teacher_steps
        for turn in (step.get("traceTurns") or [])
    ]
    if mapped_turns != trace_turns:
        raise AssertionError("teacher steps are not an ordered one-to-one mapping of the real trace")
    if not any("VERIFIED_FLAG_CAPTURED" in str(step.get("expectedEvidence") or "") for step in teacher_steps):
        raise AssertionError("teacher steps do not explicitly show the redacted verified-flag evidence")
    if re.search(r"pwn\.college\{[^}\r\n]+\}", json.dumps(run, ensure_ascii=False)):
        raise AssertionError("teacher solution response exposed a dynamic flag")


def main():
    admin_name, admin_password = flow.credentials()
    admin = flow.authenticate(admin_name, admin_password)
    flow.require(admin.get(f"{flow.BASE_URL}/admin", timeout=20))

    suffix = secrets.token_hex(4)
    dojo_id = f"learning-e2e-{suffix}"
    challenge_id = f"solution-{suffix}"
    dojo = None
    database_id = None
    challenge_rows = []
    try:
        spec = {
            "id": dojo_id,
            "name": "玄甲教师解题 Agent 真实验证",
            "type": "public",
            "modules": [
                {
                    "id": "lab",
                    "name": "动态 Flag 验证单元",
                    "challenges": [
                        {
                            "id": challenge_id,
                            "name": "读取公开握手信息",
                            "description": (
                                "以普通学习者身份读取 /challenge/handoff.txt 中 handoff= 后的"
                                "文本，将它作为唯一参数传给 /challenge/check。校验成功后，"
                                "题目会输出动态 Flag。"
                            ),
                        }
                    ],
                }
            ],
            "files": [
                {
                    "type": "text",
                    "path": f"lab/{challenge_id}/handoff.txt",
                    "content": "玄甲 solution-agent verification\nhandoff=normal-learner-path\n",
                },
                {
                    "type": "text",
                    "path": f"lab/{challenge_id}/check",
                    "content": """#!/usr/local/bin/python3
import socket
import sys

client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    client.connect("/run/solution-agent-check.sock")
    client.sendall(" ".join(sys.argv[1:]).encode())
    client.shutdown(socket.SHUT_WR)
    response = b\"\"
    while block := client.recv(4096):
        response += block
finally:
    client.close()

success = response[:1] == b"\\0"
print(response[1:].decode(), end="", file=sys.stdout if success else sys.stderr)
raise SystemExit(0 if success else 1)
""",
                },
                {
                    "type": "text",
                    "path": f"lab/{challenge_id}/.init",
                    "content": """#!/bin/bash
set -euo pipefail
python3 /challenge/check-server.py >/tmp/solution-agent-check.log 2>&1 &
for _ in {1..100}; do
  [[ -S /run/solution-agent-check.sock ]] && exit 0
  sleep 0.05
done
echo \"solution-agent checker did not start\" >&2
exit 1
""",
                },
                {
                    "type": "text",
                    "path": f"lab/{challenge_id}/check-server.py",
                    "content": """#!/usr/local/bin/python3
import os
import socket

path = \"/run/solution-agent-check.sock\"
try:
    os.unlink(path)
except FileNotFoundError:
    pass

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(path)
os.chmod(path, 0o666)
server.listen()
while True:
    connection, _ = server.accept()
    with connection:
        request = b\"\"
        while block := connection.recv(4096):
            request += block
        if request.decode().strip() == \"normal-learner-path\":
            response = b\"\\0\" + open(\"/flag\", \"rb\").read().strip() + b\"\\n\"
        else:
            response = b\"\\1Read handoff.txt and submit its handoff value.\\n\"
        connection.sendall(response)
""",
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
        challenge_rows = flow.dojo_challenge_ids(database_id)
        queued = flow.require(
            admin.post(
                f"{flow.API}/dojos/{dojo}/solutions/lab/{challenge_id}",
                json={"force": True},
                timeout=30,
            ),
            (202,),
        ).json()["solutionRun"]
        if queued.get("model") != "deepseek-v4-flash":
            raise AssertionError("teacher solution queue selected an unexpected model")
        run = _wait_for_solution(admin, dojo, challenge_id)
        _assert_verified(run)
        flow.passed(
            "DeepSeek V4 Flash solved a real isolated learner workspace and produced trace-bound, redacted teacher steps"
        )
    finally:
        if dojo:
            response = admin.post(
                f"{flow.BASE_URL}/dojo/{dojo}/delete/",
                json={"dojo": dojo},
                timeout=180,
            )
            flow.require(response)
        if database_id is not None:
            dojo_hex = f"{database_id & 0xFFFFFFFF:08x}"
            flow.outer("rm", "-rf", f"/data/dojos/{dojo_hex}")
        for challenge_id_value in challenge_rows:
            if flow.learning_challenge_rows(challenge_id_value) != (0, 0):
                raise RuntimeError("temporary solution-agent challenge survived cleanup")
        if database_id is not None:
            rows = flow.outer(
                "dojo",
                "db",
                "-qAt",
                "-c",
                f"select count(*) from learning_solution_runs where dojo_id={database_id};",
            ).stdout.strip()
            if rows != "0":
                raise RuntimeError("temporary solution-agent run survived cleanup")
    flow.passed("temporary teacher-solution course, source files, challenge, and run cleaned")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import os
import pathlib
import re
import secrets
import subprocess
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
DOJO_HOST = os.getenv("DOJO_HOST", "localhost.pwn.college")
BASE_URL = f"https://{LISTEN_ADDRESS}:{HTTPS_PORT}"
API = f"{BASE_URL}/pwncollege_api/v1/learning"
ADMIN_CREDENTIALS = pathlib.Path(
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


def client_session():
    client = requests.Session()
    client.verify = False
    client.trust_env = False
    client.headers["Host"] = DOJO_HOST
    return client


def authenticate(name, password, register=False):
    client = client_session()
    endpoint = "register" if register else "login"
    client.headers["Authorization"] = "Bearer frontend-session"
    payload = {"name": name, "password": password}
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


def outer(*args, check=True):
    return subprocess.run(
        ["docker", "exec", CONTAINER, *args],
        check=check,
        capture_output=True,
        text=True,
        timeout=120,
    )


def inner(*args, check=True):
    return outer("docker", *args, check=check)


def credentials():
    try:
        content = ADMIN_CREDENTIALS.read_text().strip()
    except (FileNotFoundError, PermissionError):
        content = outer("cat", "/data/admin-password.txt").stdout.strip()
    values = {"username": "admin"}
    if "=" not in content:
        values["password"] = content
    else:
        for line in content.splitlines():
            key, separator, value = line.partition("=")
            if separator:
                values[key] = value
    return values.get("username", "admin"), values["password"]


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


def dojo_database_id(dojo_id):
    if not re.fullmatch(r"learning-e2e-[0-9a-f]{8}", dojo_id):
        raise ValueError("invalid learning verifier dojo id")
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-c",
        f"select dojo_id from dojos where id='{dojo_id}';",
    )
    value = result.stdout.strip()
    return int(value) if value else None


def learning_challenge_rows(challenge_id):
    if not isinstance(challenge_id, int) or challenge_id < 1:
        raise ValueError("invalid learning challenge id")
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-F",
        ",",
        "-c",
        f"select (select count(*) from challenges where id={challenge_id}), "
        f"(select count(*) from learning_challenge_profiles where challenge_id={challenge_id});",
    )
    return tuple(int(value) for value in result.stdout.strip().split(","))


def dojo_challenge_ids(dojo_id):
    if not isinstance(dojo_id, int):
        raise ValueError("invalid dojo database id")
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-c",
        f"select challenge_id from dojo_challenges where dojo_id={dojo_id} order by challenge_id;",
    )
    return [int(value) for value in result.stdout.splitlines() if value]


def cleanup_audit_resources(resource_ids):
    values = sorted({value for value in resource_ids if value})
    if not values:
        return
    if any(not re.fullmatch(r"[A-Za-z0-9_./~-]+", value) for value in values):
        raise ValueError("invalid audit resource id")
    quoted = ",".join(f"'{value}'" for value in values)
    outer(
        "dojo",
        "db",
        "-qAt",
        "-c",
        f"delete from learning_audit_events where resource_id in ({quoted});",
    )


def wait_for_workspace(workspace, present=True, timeout=120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = inner("inspect", workspace, check=False)
        if (result.returncode == 0) == present:
            return
        time.sleep(1)
    state = "appear" if present else "stop"
    raise AssertionError(f"workspace {workspace} did not {state}")


def cleanup_home(user_id, username):
    if not isinstance(user_id, int) or user_id < 1:
        raise ValueError("invalid learning verifier user id")
    if not re.fullmatch(r"learning-e2e-[0-9a-f]{8}", username):
        raise ValueError("invalid learning verifier username")
    result = outer(
        "dojo",
        "db",
        "-qAt",
        "-c",
        f"select name from users where id={user_id};",
    )
    if result.stdout.strip() != username:
        raise RuntimeError("learning verifier user id no longer matches")
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
        "exec",
        "homefs",
        "sh",
        "-c",
        script,
        "cleanup-home",
        str(user_id),
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("learning verifier home cleanup failed")


def main():
    initial_counts = solution_counts()
    admin_name, admin_password = credentials()
    admin = authenticate(admin_name, admin_password)
    require(admin.get(f"{BASE_URL}/admin", timeout=20))
    passed("single CTFd administrator identity")

    suffix = secrets.token_hex(4)
    username = f"learning-e2e-{suffix}"
    dojo_id = f"learning-e2e-{suffix}"
    challenge_id = f"evidence-{suffix}"
    password = secrets.token_urlsafe(18)
    verification_answer = secrets.token_hex(8)
    learner = None
    user_id = None
    dojo = None
    database_id = None
    native_challenge_ids = []
    workspace = None
    draft_id = None
    published_challenge_id = None
    published_resource_id = None
    appeal_id = None
    additional_draft_ids = []
    additional_challenge_ids = []
    additional_resource_ids = []

    try:
        learner = authenticate(username, password, register=True)
        me = require(learner.get(f"{BASE_URL}/api/v1/users/me", timeout=20)).json()
        user_id = me["data"]["id"]
        workspace = f"user_{user_id}"

        spec = {
            "id": dojo_id,
            "name": "AISecEdu Learning Verification",
            "type": "public",
            "modules": [
                {
                    "id": "lab",
                    "name": "Evidence Lab",
                    "challenges": [
                        {"id": "baseline", "name": "Baseline"},
                    ],
                }
            ],
            "files": [
                {
                    "type": "text",
                    "path": "lab/baseline/run",
                    "content": "#!/opt/pwn.college/bash\nprintf 'baseline ready\\n'\n",
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
        database_id = dojo_database_id(dojo_id)
        native_challenge_ids = dojo_challenge_ids(database_id)
        joined = require(learner.get(f"{BASE_URL}/dojo/{dojo}/join/", timeout=30))
        if urllib.parse.urlparse(joined.url).path.rstrip("/") != f"/{dojo}":
            raise AssertionError("dojo enrollment returned a legacy learner page")

        overview = require(learner.get(f"{API}/overview", timeout=30)).json()
        course = next(item for item in overview["courses"] if item["id"] == dojo)
        if course["role"] != "student" or course["studioUrl"] is not None:
            raise AssertionError("student learning overview exposed an invalid role")
        passed("single sign-on learning overview and role boundary")

        unit_id = f"teacher-unit-{suffix}"
        require(
            learner.post(
                f"{API}/dojos/{dojo}/units",
                json={"id": unit_id, "name": "Unauthorized Unit"},
                timeout=20,
            ),
            (403,),
        )
        require(
            admin.post(
                f"{API}/dojos/{dojo}/units",
                json={"id": "Invalid Unit", "name": "Invalid Unit"},
                timeout=20,
            ),
            (400,),
        )
        created_unit = require(
            admin.post(
                f"{API}/dojos/{dojo}/units",
                json={
                    "id": unit_id,
                    "name": "Teacher-Created Unit",
                    "description": "A unit created through the AISecEdu course interface.",
                },
                timeout=30,
            ),
            (201,),
        ).json()["unit"]
        if created_unit["url"] != f"/{dojo}/{unit_id}":
            raise AssertionError("created unit did not return its canonical course URL")
        course_page = require(admin.get(f"{BASE_URL}/{dojo}", timeout=30)).text
        unit_page = require(
            admin.get(f"{BASE_URL}/{dojo}/{unit_id}", timeout=30)
        ).text
        if "Teacher-Created Unit" not in course_page or "Add Unit" not in course_page:
            raise AssertionError("teacher course page did not render unit creation controls")
        if "Add an Exercise" not in unit_page:
            raise AssertionError("teacher unit page did not render exercise creation controls")
        passed("teacher-only course unit creation and exercise authoring entry point")

        brief = (
            "Create a beginner incident-verification lab in which the learner establishes a baseline, "
            "inspects ordered runtime evidence, validates one hypothesis, and explains remediation."
        )
        created = require(
            admin.post(
                f"{API}/dojos/{dojo}/authoring",
                json={
                    "brief": brief,
                    "moduleId": "lab",
                    "level": "L3",
                    "constraints": {
                        "id": challenge_id,
                        "title": "Trusted Evidence Verification",
                        "category": "FORENSICS",
                        "difficulty": 2,
                        "verificationAnswer": verification_answer,
                    },
                },
                timeout=60,
            ),
            (201,),
        ).json()
        draft = created["draft"]
        draft_id = draft["id"]
        if (
            draft["spec"]["mode"] != "GENERATE_CUSTOM"
            or draft["spec"]["sourceChallengeId"] is not None
        ):
            raise AssertionError(
                "L3 authoring did not produce a custom native challenge"
            )
        validation = require(
            admin.post(f"{API}/drafts/{draft['id']}/validate", json={}, timeout=30)
        ).json()["validation"]
        if validation["status"] != "PASS" or validation["summary"]["blocked"]:
            raise AssertionError("challenge package did not pass the publish gate")
        published = require(
            admin.post(f"{API}/drafts/{draft['id']}/publish", json={}, timeout=60)
        ).json()["challenge"]
        published_challenge_id = published["challengeId"]
        published_resource_id = f"{published['dojoId']}/lab/{challenge_id}"
        if (
            published["id"] != challenge_id
            or published["package"]["mode"] != "GENERATE_CUSTOM"
        ):
            raise AssertionError(
                "published challenge did not use the native course runtime contract"
            )
        revised = require(
            admin.post(
                f"{API}/drafts/{draft['id']}",
                json={
                    "message": "Keep the stable identity and publish a second immutable runtime version."
                },
                timeout=30,
            )
        ).json()["draft"]
        if revised["status"] != "DRAFT" or revised["revision"] != 2:
            raise AssertionError("published draft did not enter a new revision")
        require(admin.post(f"{API}/drafts/{draft['id']}/validate", json={}, timeout=30))
        republished = require(
            admin.post(f"{API}/drafts/{draft['id']}/publish", json={}, timeout=60)
        ).json()["challenge"]
        history = republished["package"].get("history") or []
        if (
            republished["challengeId"] != published_challenge_id
            or republished["version"] != 2
            or [item["version"] for item in history] != [1]
        ):
            raise AssertionError("stable challenge version history is inconsistent")
        for level, expected_mode in (("L1", "USE_EXISTING"), ("L2", "ADAPT_EXISTING")):
            level_challenge_id = f"{level.lower()}-{suffix}"
            level_draft = require(
                admin.post(
                    f"{API}/dojos/{dojo}/authoring",
                    json={
                        "brief": (
                            "Reuse the existing evidence lab runtime while preserving a clear baseline, "
                            "hypothesis, validation, and remediation learning workflow."
                        ),
                        "moduleId": "lab",
                        "level": level,
                        "constraints": {
                            "id": level_challenge_id,
                            "title": f"{level} Existing Runtime Snapshot",
                            "category": "FORENSICS",
                        },
                    },
                    timeout=60,
                ),
                (201,),
            ).json()["draft"]
            additional_draft_ids.append(level_draft["id"])
            if (
                level_draft["spec"]["mode"] != expected_mode
                or level_draft["spec"]["sourceChallengeId"] is None
            ):
                raise AssertionError(
                    f"{level} authoring did not select an existing runtime"
                )
            require(
                admin.post(
                    f"{API}/drafts/{level_draft['id']}/validate", json={}, timeout=30
                )
            )
            level_published = require(
                admin.post(
                    f"{API}/drafts/{level_draft['id']}/publish", json={}, timeout=60
                )
            ).json()["challenge"]
            if (
                level_published["package"]["mode"] != expected_mode
                or not level_published["package"]["sourceSnapshot"]
                or level_published["challengeId"]
                == level_draft["spec"]["sourceChallengeId"]
            ):
                raise AssertionError(
                    f"{level} publication did not create an independent snapshot"
                )
            additional_challenge_ids.append(level_published["challengeId"])
            additional_resource_ids.append(
                f"{level_published['dojoId']}/lab/{level_challenge_id}"
            )
        passed(
            "L1 reuse, L2 adaptation, L3 generation, validation gates, immutable versioning, and native publication"
        )

        started = require(
            learner.post(
                f"{BASE_URL}/pwncollege_api/v1/docker",
                json={"dojo": dojo, "module": "lab", "challenge": challenge_id},
                timeout=120,
            )
        ).json()
        if not started.get("success"):
            raise AssertionError("generated challenge workspace failed to start")
        wait_for_workspace(workspace)
        label = inner(
            "inspect",
            "-f",
            '{{index .Config.Labels "dojo.challenge_id"}}',
            workspace,
        ).stdout.strip()
        if label != challenge_id:
            raise AssertionError("workspace did not run the generated challenge")
        current = require(learner.get(f"{API}/attempts/current", timeout=20)).json()[
            "attempt"
        ]
        if (
            not current["evidenceChain"]["valid"]
            or current["epoch"] != 1
            or current["challengeVersion"] != 2
        ):
            raise AssertionError("attempt epoch or initial evidence chain is invalid")
        original_container_id = inner(
            "inspect",
            "-f",
            "{{.Id}}",
            workspace,
        ).stdout.strip()
        inner(
            "exec",
            workspace,
            "sh",
            "-c",
            "touch /home/hacker/complete-reset-home /tmp/complete-reset-container",
        )
        reset = require(
            learner.post(
                f"{BASE_URL}/pwncollege_api/v1/docker/reset",
                json={},
                timeout=180,
            )
        ).json()
        if not reset.get("success"):
            raise AssertionError("complete challenge reset failed")
        replacement_container_id = inner(
            "inspect",
            "-f",
            "{{.Id}}",
            workspace,
        ).stdout.strip()
        inner(
            "exec",
            workspace,
            "sh",
            "-c",
            "test ! -e /home/hacker/complete-reset-home && test ! -e /tmp/complete-reset-container",
        )
        current = require(learner.get(f"{API}/attempts/current", timeout=20)).json()[
            "attempt"
        ]
        if (
            original_container_id == replacement_container_id
            or current["epoch"] != 2
            or not current["evidenceChain"]["valid"]
        ):
            raise AssertionError("complete reset did not replace the runtime and learning epoch")
        passed("complete container and home reset with a fresh learning epoch")
        inner(
            "exec",
            "--user=1000",
            workspace,
            "/run/dojo/bin/dojo",
            "evidence",
            "--exit-code",
            "0",
            "--command",
            "printf workspace-profile-verification",
        )
        profile = inner(
            "exec",
            "--user=1000",
            workspace,
            "grep",
            "-F",
            "__dojo_record_command",
            "/etc/profile.d/99-dojo-workspace.sh",
        )
        current = require(learner.get(f"{API}/attempts/current", timeout=20)).json()[
            "attempt"
        ]
        if not any(
            event["source"] == "WORKSPACE"
            and event["type"] == "terminal.command.completed"
            and event["payload"].get("command")
            == "printf workspace-profile-verification"
            for event in current["evidence"]
        ):
            raise AssertionError(
                "deployed workspace CLI did not ingest command evidence"
            )
        if "__dojo_record_command" not in profile.stdout:
            raise AssertionError(
                "deployed Bash profile does not contain automatic evidence capture"
            )
        passed(
            "same AISecEdu workspace, attempt epoch, Nix CLI, and automatic command capture profile"
        )

        command = "printf pwn.college{private}; scanner --token hidden-token"
        captured = require(
            learner.post(
                f"{API}/evidence",
                json={
                    "type": "terminal.command.completed",
                    "payload": {"command": command, "exitCode": 0},
                },
                timeout=20,
            )
        ).json()["event"]["payload"]["command"]
        if "private" in captured or "hidden-token" in captured:
            raise AssertionError("workspace evidence retained a sensitive value")
        for event_type, payload in (
            (
                "terminal.command.failed",
                {"command": "test -f /challenge/missing", "exitCode": 1},
            ),
            (
                "terminal.command.completed",
                {"command": "sed -n 1,4p /challenge/evidence.log", "exitCode": 0},
            ),
            (
                "terminal.command.completed",
                {"command": "/challenge/check candidate", "exitCode": 1},
            ),
            ("milestone.observed", {"name": "confirmed-record-located"}),
        ):
            require(
                learner.post(
                    f"{API}/evidence",
                    json={"type": event_type, "payload": payload},
                    timeout=20,
                )
            )
        denied = learner.post(
            f"{API}/evidence",
            json={"type": "untrusted.event", "payload": {}},
            timeout=20,
        )
        require(denied, (400,))
        passed("allowlisted, redacted, hash-chained workspace evidence")

        tutor = require(
            learner.post(
                f"{API}/tutor",
                json={
                    "question": "How should I decide which state record is trustworthy?",
                },
                timeout=45,
            )
        ).json()["reply"]
        if (
            tutor.get("mode") != "SOCRATIC_HINTS"
            or "guidanceLevel" in tutor
            or verification_answer in tutor["answer"]
            or (
                tutor.get("provider") == "DETERMINISTIC"
                and "trustworthy" not in tutor["answer"]
            )
        ):
            raise AssertionError("Tutor violated its unified hint or disclosure boundary")
        passed("current-epoch Tutor with unified Socratic anti-leak policy")

        checked = inner(
            "exec",
            "--user=1000",
            workspace,
            "/challenge/check",
            verification_answer,
            check=False,
        )
        if checked.returncode != 0:
            diagnostics = inner(
                "exec",
                workspace,
                "sh",
                "-c",
                "set +e; ls -l /challenge/check /challenge/check-server.py /challenge/.init "
                "/run/dojo-learning-check.sock /usr/local/bin/python3 /usr/bin/python3; "
                "printf 'init-log\\n'; tail -n 40 /tmp/dojo-learning-check.log; "
                "printf 'processes\\n'; ps -ef | grep '[c]heck-server'",
                check=False,
            )
            raise AssertionError(
                "native challenge oracle failed to execute\n"
                + checked.stderr[-1000:]
                + diagnostics.stdout[-3000:]
                + diagnostics.stderr[-1000:]
            )
        flag = checked.stdout.strip()
        if not re.fullmatch(r"pwn\.college\{[^}]+\}", flag):
            raise AssertionError(
                "native challenge oracle did not return a dynamic flag"
            )
        solved = require(
            learner.post(
                f"{BASE_URL}/pwncollege_api/v1/dojos/{dojo}/lab/{challenge_id}/solve",
                json={"submission": flag},
                timeout=30,
            )
        ).json()
        if not solved.get("success"):
            raise AssertionError("dynamic flag submission failed")

        reflection = (
            "I established a clean runtime baseline, compared each ordered evidence record, and rejected "
            "the starting and degraded states. I validated the confirmed record against the native oracle. "
            "The root cause was trusting labels without corroboration; remediation is to require signed, "
            "ordered evidence and verify the current epoch before taking action."
        )
        submission = require(
            learner.post(
                f"{API}/attempts/{current['id']}",
                json={"reflection": reflection, "submit": True},
                timeout=30,
            )
        ).json()
        attempt = submission["attempt"]
        assessment = submission["assessment"]
        if attempt["objectiveScore"] != 60 or not 60 < attempt["totalScore"] <= 100:
            raise AssertionError("60/40 assessment score is outside its contract")
        if not attempt["evidenceChain"]["valid"] or len(assessment["abilities"]) != 6:
            raise AssertionError("assessment evidence or ability projection is invalid")
        passed("dynamic flag, 60/40 assessment, replay timeline, and six abilities")

        appeal = require(
            learner.post(
                f"{API}/assessments/{assessment['id']}/appeals",
                json={
                    "reason": "Please replay the trusted evidence and review the process score."
                },
                timeout=20,
            ),
            (201,),
        ).json()["appeal"]
        appeal_id = appeal["id"]
        resolved = require(
            admin.patch(
                f"{API}/appeals/{appeal['id']}",
                json={
                    "status": "RESOLVED",
                    "resolution": "The evidence chain is valid; the deterministic rubric was replayed.",
                    "reassess": True,
                },
                timeout=30,
            )
        ).json()["appeal"]
        analytics = require(
            admin.get(f"{API}/dojos/{dojo}/analytics", timeout=30)
        ).json()
        if resolved["status"] != "RESOLVED" or analytics["summary"]["attempts"] != 2:
            raise AssertionError("appeal review or teacher analytics is inconsistent")
        student = next(item for item in analytics["students"] if item["id"] == user_id)
        if any(skill["evidenceCount"] != 1 for skill in student["skills"]):
            raise AssertionError(
                "assessment revisions inflated the six-ability evidence count"
            )
        passed("grade appeal, deterministic revision, and teacher analytics")
    finally:
        if learner is not None:
            learner.delete(f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60)
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
                raise RuntimeError("learning verifier dojo deletion failed")
        if database_id is not None:
            dojo_hex = f"{database_id & 0xFFFFFFFF:08x}"
            outer("rm", "-rf", f"/data/dojos/{dojo_hex}")
            remaining = outer(
                "test", "-e", f"/data/dojos/.learning/{dojo_hex}", check=False
            )
            if remaining.returncode == 0:
                raise RuntimeError("generated learning package survived dojo deletion")
        for learning_challenge_id in [
            *native_challenge_ids,
            published_challenge_id,
            *additional_challenge_ids,
        ]:
            if learning_challenge_id is not None and learning_challenge_rows(
                learning_challenge_id
            ) != (0, 0):
                raise RuntimeError(
                    "generated challenge identity or learning profile survived dojo deletion"
                )
        if user_id:
            cleanup_home(user_id, username)
            response = require(
                admin.delete(f"{BASE_URL}/api/v1/users/{user_id}", json={}, timeout=30)
            )
            if not response.json().get("success"):
                raise RuntimeError("learning verifier user deletion failed")
        cleanup_audit_resources(
            (
                draft_id,
                published_resource_id,
                appeal_id,
                *additional_draft_ids,
                *additional_resource_ids,
            )
        )

    if solution_counts() != initial_counts:
        raise AssertionError(
            "learning verifier cleanup changed solve or submission counts"
        )
    passed(
        "temporary course, package, user, home, workspace, solve, and submission cleanup"
    )
    print("All AISecEdu learning-flow checks passed", flush=True)


if __name__ == "__main__":
    main()

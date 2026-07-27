#!/usr/bin/env python3
import os
import pathlib
import json
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


def validation_diagnostics(validation):
    """Return useful validation metadata without printing private solution data."""

    review = validation.get("agentReview") or {}
    return {
        "status": validation.get("status"),
        "summary": validation.get("summary"),
        "model": review.get("model"),
        "provider": review.get("provider"),
        "verdict": review.get("verdict"),
        "blockingChecks": [
            {
                "id": check.get("id"),
                "stage": check.get("stage"),
                "status": check.get("status"),
            }
            for check in validation.get("checks") or []
            if check.get("status") == "BLOCK"
        ][:12],
        "openFindings": [
            {
                "id": finding.get("id"),
                "stage": finding.get("stage"),
                "severity": finding.get("severity"),
                "status": finding.get("status"),
            }
            for finding in review.get("findings") or []
            if finding.get("status", "OPEN") == "OPEN"
        ][:12],
    }


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


def satisfying_report(contract):
    if (
        not isinstance(contract, dict)
        or contract.get("type") != "REPORT_JSON_V1"
        or contract.get("submissionPath") != "/home/hacker/solution.json"
    ):
        raise AssertionError("published challenge has no fixed report Oracle")
    fields = {
        str(field)
        for field in [
            *(contract.get("requiredFields") or []),
            *[
                assertion.get("field")
                for assertion in contract.get("assertions") or []
                if isinstance(assertion, dict)
            ],
        ]
        if field
    }
    prefixes = {
        ".".join(parts[:index])
        for field in fields
        for parts in [field.split(".")]
        for index in range(1, len(parts))
    }
    document = {}

    def assign(field, value, *, preserve=False):
        parts = field.split(".")
        current = document
        for part in parts[:-1]:
            existing = current.setdefault(part, {})
            if not isinstance(existing, dict):
                raise AssertionError(
                    f"Oracle contract contains incompatible field paths: {field}"
                )
            current = existing
        leaf = parts[-1]
        if preserve and leaf in current:
            return
        if isinstance(current.get(leaf), dict) and not isinstance(value, dict):
            raise AssertionError(
                f"Oracle contract asserts a scalar parent with child fields: {field}"
            )
        current[leaf] = value

    for field in sorted(fields, key=lambda item: (item.count("."), item)):
        assign(field, {} if field in prefixes else "observed", preserve=True)
    for assertion in contract.get("assertions") or []:
        field = assertion["field"]
        operator = assertion["operator"]
        expected = assertion.get("value")
        if operator == "exists":
            continue
        if operator == "equals":
            actual = expected
        elif operator == "not_equals":
            actual = (
                "__aisecedu_alternative__"
                if expected != "__aisecedu_alternative__"
                else "__aisecedu_other__"
            )
        elif operator == "contains":
            actual = f"observed:{expected}"
        elif operator == "one_of":
            choices = expected if isinstance(expected, list) else []
            if not choices:
                raise AssertionError("Oracle one_of assertion has no choices")
            actual = choices[0]
        else:
            raise AssertionError(f"unsupported Oracle operator: {operator}")
        assign(field, actual)
    return document


def satisfy_live_report_values(document, contract, runtime_contract, workspace):
    services = {
        service["name"]: service
        for service in (runtime_contract or {}).get("services") or []
        if isinstance(service, dict) and service.get("name")
    }
    probe_script = (
        "import hashlib,http.client,json,sys;"
        "binding=json.loads(sys.argv[1]);"
        "port=int(sys.argv[2]);"
        "connection=http.client.HTTPConnection('127.0.0.1',port,timeout=3);"
        "connection.request('GET',binding['path'],headers=binding.get('headers') or {});"
        "response=connection.getresponse();"
        "status=response.status;"
        "body=response.read(65537);"
        "connection.close();"
        "capture=binding['capture'];"
        "value=status if capture=='status' else "
        "hashlib.sha256(body).hexdigest() if capture=='body_sha256' else "
        "json.loads(body.decode('utf-8'));"
        "selector=binding.get('selector','').split('.');"
        "\nif capture=='json_field':\n"
        "    for part in selector: value=value[part]\n"
        "print(json.dumps(value,ensure_ascii=False))"
    )

    def assign(field, value):
        current = document
        parts = field.split(".")
        for part in parts[:-1]:
            current = current.setdefault(part, {})
        current[parts[-1]] = value

    for binding in contract.get("liveBindings") or []:
        service = services.get(binding["service"])
        if not service or not service.get("port"):
            raise AssertionError(
                f"live binding references an unavailable service: {binding['field']}"
            )
        observed = inner(
            "exec",
            "--user=1000",
            workspace,
            "/usr/local/bin/python3",
            "-c",
            probe_script,
            json.dumps(binding, ensure_ascii=False, sort_keys=True),
            str(service["port"]),
        )
        assign(binding["field"], json.loads(observed.stdout))
    return document


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


def verify_flag_latency():
    initial_counts = solution_counts()
    admin_name, admin_password = credentials()
    admin = authenticate(admin_name, admin_password)
    require(admin.get(f"{BASE_URL}/admin", timeout=20))

    suffix = secrets.token_hex(4)
    username = f"learning-e2e-{suffix}"
    dojo_id = f"learning-e2e-{suffix}"
    password = secrets.token_urlsafe(18)
    learner = None
    user_id = None
    dojo = None
    database_id = None
    challenge_ids = []
    workspace = None

    try:
        learner = authenticate(username, password, register=True)
        me = require(learner.get(f"{BASE_URL}/api/v1/users/me", timeout=20)).json()
        user_id = me["data"]["id"]
        workspace = f"user_{user_id}"

        spec = {
            "id": dojo_id,
            "name": "AISecEdu Flag Latency Verification",
            "type": "public",
            "modules": [
                {
                    "id": "lab",
                    "name": "Flag Lab",
                    "challenges": [{"id": "flag", "name": "Flag"}],
                }
            ],
            "files": [
                {
                    "type": "text",
                    "path": "lab/flag/run",
                    "content": "#!/opt/pwn.college/bash\nprintf 'ready\\n'\n",
                }
            ],
        }
        created = require(
            admin.post(
                f"{BASE_URL}/pwncollege_api/v1/dojos/create",
                json={"spec": yaml.safe_dump(spec, sort_keys=False)},
                timeout=120,
            )
        ).json()
        dojo = created["dojo"]
        database_id = dojo_database_id(dojo_id)
        challenge_ids = dojo_challenge_ids(database_id)
        if len(challenge_ids) != 1:
            raise AssertionError("Flag latency fixture did not create one challenge")
        outer(
            "dojo",
            "db",
            "-qAt",
            "-c",
            f"update challenges set type='dojo' where id={challenge_ids[0]};",
        )

        require(learner.get(f"{BASE_URL}/dojo/{dojo}/join/", timeout=30))
        started = require(
            learner.post(
                f"{BASE_URL}/pwncollege_api/v1/docker",
                json={"dojo": dojo, "module": "lab", "challenge": "flag"},
                timeout=120,
            )
        ).json()
        if not started.get("success"):
            raise AssertionError("Flag latency workspace failed to start")
        wait_for_workspace(workspace)
        current = require(
            learner.get(f"{API}/attempts/current", timeout=20)
        ).json()["attempt"]
        challenge_type = outer(
            "dojo",
            "db",
            "-qAt",
            "-c",
            f"select type from challenges where id={challenge_ids[0]};",
        ).stdout.strip()
        flag = inner("exec", workspace, "cat", "/flag").stdout.strip()
        if not re.fullmatch(r"pwn\.college\{[^}]+\}", flag):
            raise AssertionError("Flag latency fixture did not expose a dynamic Flag")

        started_at = time.monotonic()
        response = require(
            learner.post(
                f"{BASE_URL}/api/v1/challenges/attempt",
                json={"challenge_id": challenge_ids[0], "submission": flag},
                timeout=30,
            )
        ).json()
        elapsed = time.monotonic() - started_at
        if (
            not response.get("success")
            or (response.get("data") or {}).get("status") != "correct"
        ):
            raise AssertionError("CTFd Flag attempt was not accepted")

        attempt = require(
            learner.get(f"{API}/attempts/{current['id']}", timeout=20)
        ).json()["attempt"]
        assessment = attempt.get("assessment") or {}
        grader = (
            (((assessment.get("criteria") or [{}])[0].get("evidence") or {}).get("grader"))
            or {}
        )
        if challenge_type != "dojo" or elapsed >= 15:
            raise AssertionError(
                "CTFd Flag attempt did not return promptly through the dojo handler "
                f"({elapsed:.2f}s; challenge_type={challenge_type!r})"
            )
        if (
            not assessment
            or attempt.get("objectiveScore") != 60
            or assessment.get("revision") != 1
            or assessment.get("source") != "DETERMINISTIC"
            or grader.get("provider") != "DETERMINISTIC"
        ):
            raise AssertionError("CTFd Flag attempt returned an invalid learning baseline")
        passed(
            f"CTFd Flag attempt returned through the deployed API in {elapsed:.2f}s"
        )
    finally:
        if learner is not None:
            learner.delete(
                f"{BASE_URL}/pwncollege_api/v1/docker", json={}, timeout=60
            )
        if workspace:
            inner("rm", "-f", workspace, check=False)
        if dojo:
            response = admin.post(
                f"{BASE_URL}/dojo/{dojo}/delete/",
                json={"dojo": dojo},
                timeout=180,
            )
            require(response)
            if not response.json().get("success"):
                raise RuntimeError("Flag latency verifier dojo deletion failed")
        if database_id is not None:
            dojo_hex = f"{database_id & 0xFFFFFFFF:08x}"
            outer("rm", "-rf", f"/data/dojos/{dojo_hex}")
        for challenge_id in challenge_ids:
            if learning_challenge_rows(challenge_id) != (0, 0):
                raise RuntimeError(
                    "Flag latency challenge identity survived dojo deletion"
                )
        if user_id:
            cleanup_home(user_id, username)
            response = require(
                admin.delete(
                    f"{BASE_URL}/api/v1/users/{user_id}", json={}, timeout=30
                )
            )
            if not response.json().get("success"):
                raise RuntimeError("Flag latency verifier user deletion failed")

    if solution_counts() != initial_counts:
        raise AssertionError(
            "Flag latency verifier cleanup changed solve or submission counts"
        )
    passed("Flag latency fixture, user, workspace, solve, and submission cleanup")


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
        if "Teacher-Created Unit" not in course_page or "添加单元" not in course_page:
            raise AssertionError("teacher course page did not render unit creation controls")
        if "添加题目" not in unit_page:
            raise AssertionError("teacher unit page did not render exercise creation controls")
        studio_page = require(
            admin.get(f"{BASE_URL}/dojo/{dojo}/studio", timeout=30)
        ).text
        if (
            "Flash 会把教学意图转为方案" not in studio_page
            or "独立的 Pro 红队 Agent" not in studio_page
        ):
            raise AssertionError(
                "teacher studio did not explain the configured DeepSeek agent pipeline"
            )
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
                timeout=3600,
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
        pipeline = draft["spec"].get("authoringPipeline") or {}
        if (
            (pipeline.get("plan") or {}).get("model") != "deepseek-v4-flash"
            or (pipeline.get("build") or {}).get("model") != "deepseek-v4-pro"
            or (pipeline.get("review") or {}).get("model")
            != "deepseek-v4-pro"
            or (pipeline.get("postReview") or {}).get("model")
            != "deepseek-v4-pro"
            or (pipeline.get("validate") or {}).get("model")
            != "deepseek-v4-pro"
        ):
            raise AssertionError("authoring draft used the wrong DeepSeek model route")
        preflight = draft["spec"].get("preflightReview") or {}
        if preflight.get("verdict") != "PASS" or any(
            finding.get("status", "OPEN") == "OPEN"
            and finding.get("severity") in {"MEDIUM", "HIGH", "CRITICAL"}
            for finding in preflight.get("findings") or []
        ):
            raise AssertionError("authoring red-team repair gate left an open finding")
        validation = require(
            admin.post(
                f"{API}/drafts/{draft['id']}/validate",
                json={},
                timeout=3600,
            )
        ).json()["validation"]
        if (
            validation["status"] != "PASS"
            or validation["summary"]["blocked"]
            or (validation.get("agentReview") or {}).get("model")
            != "deepseek-v4-pro"
        ):
            raise AssertionError(
                "challenge package did not pass the publish gate: "
                + json.dumps(
                    validation_diagnostics(validation),
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
        published = require(
            admin.post(f"{API}/drafts/{draft['id']}/publish", json={}, timeout=180)
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
                timeout=3600,
            )
        ).json()["draft"]
        if revised["status"] != "DRAFT" or revised["revision"] != 2:
            raise AssertionError("published draft did not enter a new revision")
        revision_validation = require(
            admin.post(
                f"{API}/drafts/{draft['id']}/validate",
                json={},
                timeout=3600,
            )
        ).json()["validation"]
        if (
            revision_validation["status"] != "PASS"
            or revision_validation["summary"]["blocked"]
            or (revision_validation.get("agentReview") or {}).get("model")
            != "deepseek-v4-pro"
        ):
            raise AssertionError(
                "revised challenge package did not pass validation: "
                + json.dumps(
                    validation_diagnostics(revision_validation),
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
        republished = require(
            admin.post(f"{API}/drafts/{draft['id']}/publish", json={}, timeout=180)
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
                    timeout=3600,
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
            level_validation = require(
                admin.post(
                    f"{API}/drafts/{level_draft['id']}/validate",
                    json={},
                    timeout=3600,
                )
            ).json()["validation"]
            if (
                level_validation["status"] != "PASS"
                or level_validation["summary"]["blocked"]
                or (level_validation.get("agentReview") or {}).get("model")
                != "deepseek-v4-pro"
            ):
                raise AssertionError(
                    f"{level} package did not pass validation: "
                    + json.dumps(
                        validation_diagnostics(level_validation),
                        ensure_ascii=False,
                        sort_keys=True,
                    )
                )
            level_published = require(
                admin.post(
                    f"{API}/drafts/{level_draft['id']}/publish",
                    json={},
                    timeout=180,
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
                timeout=180,
            )
        ).json()["reply"]
        tutor_checks = {
            "mode": tutor.get("mode") == "SOCRATIC_HINTS",
            "unifiedMode": "guidanceLevel" not in tutor,
            "protectedAnswerHidden": verification_answer
            not in tutor.get("answer", ""),
            "provider": tutor.get("provider") == "MODEL",
            "model": tutor.get("model") == "deepseek-v4-flash",
            "substantive": len(tutor.get("answer") or "") >= 100,
            "liveContext": bool((tutor.get("context") or {}).get("live")),
            "referenceFiles": (tutor.get("context") or {}).get(
                "referenceFiles", 0
            )
            >= 1,
            "liveFiles": (tutor.get("context") or {}).get("liveFiles", 0)
            >= 1,
        }
        if not all(tutor_checks.values()):
            diagnostics = {
                "checks": tutor_checks,
                "mode": tutor.get("mode"),
                "hasGuidanceLevel": "guidanceLevel" in tutor,
                "provider": tutor.get("provider"),
                "model": tutor.get("model"),
                "answerCharacters": len(tutor.get("answer") or ""),
                "context": tutor.get("context"),
                "safety": tutor.get("safety"),
            }
            raise AssertionError(
                "Tutor violated its unified hint or disclosure boundary: "
                + json.dumps(diagnostics, sort_keys=True)
            )
        passed(
            "Flash Tutor with private reference, live container, trajectory, and unified anti-leak hints"
        )

        guide_page = require(learner.get(f"{BASE_URL}/guide", timeout=30)).text
        if 'id="learning-guide"' not in guide_page or "新建对话" not in guide_page:
            raise AssertionError("native ChatGPT-style Guide page did not render")
        guide = require(
            learner.post(
                f"{API}/guide",
                json={
                    "question": (
                        "结合我正在进行的课程、刚才的失败检查和当前能力记录，"
                        "给我一个接下来 30 分钟的个性化学习计划。"
                    )
                },
                timeout=180,
            )
        ).json()
        guide_message = guide["message"]
        if (
            guide.get("provider") != "MODEL"
            or guide.get("model") != "deepseek-v4-flash"
            or len(guide_message["content"]) < 100
            or verification_answer in guide_message["content"]
            or (guide.get("profileSummary") or {}).get("attempts", 0) < 1
            or (guide.get("profileSummary") or {}).get("enrolledCourses", 0) < 1
        ):
            raise AssertionError(
                "Guide did not use the learner's concrete history through Flash"
            )
        passed("ChatGPT-style Flash Guide with concrete learner-history grounding")

        contract = (republished["package"] or {}).get("oracleContract") or {}
        report = satisfying_report(contract)
        report = satisfy_live_report_values(
            report,
            contract,
            (republished["package"] or {}).get("runtimeContract") or {},
            workspace,
        )
        inner(
            "exec",
            "--user=1000",
            workspace,
            "/usr/local/bin/python3",
            "-c",
            (
                "import pathlib,sys;"
                "pathlib.Path('/home/hacker/solution.json').write_text("
                "sys.argv[1],encoding='utf-8')"
            ),
            json.dumps(report, ensure_ascii=False, sort_keys=True),
        )
        leaked_checker = inner(
            "exec",
            "--user=1000",
            workspace,
            "sh",
            "-c",
            "test -r /challenge/check-server.py",
            check=False,
        )
        if leaked_checker.returncode == 0:
            raise AssertionError("learner can read the private Oracle contract")
        checker_mode = inner(
            "exec",
            workspace,
            "stat",
            "-c",
            "%a",
            "/challenge/check-server.py",
        ).stdout.strip()
        if checker_mode != "700":
            raise AssertionError("private Oracle checker mode is not 0700")
        process_record_mode = inner(
            "exec",
            workspace,
            "stat",
            "-c",
            "%a",
            "/run/dojo-learning-service-pids.json",
        ).stdout.strip()
        if process_record_mode != "600":
            raise AssertionError("runtime service process record mode is not 0600")
        legacy_argument = inner(
            "exec",
            "--user=1000",
            workspace,
            "/challenge/check",
            verification_answer,
            check=False,
        )
        if legacy_argument.returncode == 0:
            raise AssertionError("report Oracle accepted a legacy answer argument")
        checked = inner(
            "exec",
            "--user=1000",
            workspace,
            "/challenge/check",
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
        flag_submit_started = time.monotonic()
        solved = require(
            learner.post(
                f"{BASE_URL}/pwncollege_api/v1/dojos/{dojo}/lab/{challenge_id}/solve",
                json={"submission": flag},
                timeout=30,
            )
        ).json()
        flag_submit_seconds = time.monotonic() - flag_submit_started
        if not solved.get("success"):
            raise AssertionError("dynamic flag submission failed")
        solved_attempt = require(
            learner.get(f"{API}/attempts/{current['id']}", timeout=20)
        ).json()["attempt"]
        baseline_assessment = solved_attempt.get("assessment") or {}
        baseline_grader = (
            (((baseline_assessment.get("criteria") or [{}])[0].get("evidence") or {}).get("grader"))
            or {}
        )
        if (
            flag_submit_seconds >= 15
            or solved_attempt["objectiveScore"] != 60
            or baseline_assessment.get("revision") != 1
            or baseline_assessment.get("source") != "DETERMINISTIC"
            or baseline_grader.get("provider") != "DETERMINISTIC"
        ):
            raise AssertionError(
                "Flag submission did not return a fast deterministic baseline "
                f"({flag_submit_seconds:.2f}s)"
            )
        passed(
            "dynamic Flag returned a deterministic baseline in "
            f"{flag_submit_seconds:.2f}s"
        )

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
                timeout=180,
            )
        ).json()
        attempt = submission["attempt"]
        assessment = submission["assessment"]
        if attempt["objectiveScore"] != 60 or not 60 < attempt["totalScore"] <= 100:
            raise AssertionError("60/40 assessment score is outside its contract")
        if not attempt["evidenceChain"]["valid"] or len(assessment["abilities"]) != 6:
            raise AssertionError("assessment evidence or ability projection is invalid")
        grader = (
            ((assessment["criteria"] or [{}])[0].get("evidence") or {}).get(
                "grader"
            )
            or {}
        )
        if (
            grader.get("provider") != "MODEL"
            or grader.get("model") != "deepseek-v4-pro"
            or not grader.get("liveContext")
            or not grader.get("solutionProvider")
            or len(assessment.get("feedback") or "") < 100
        ):
            raise AssertionError(
                "Pro Grader did not use the live container and private solution"
            )
        passed(
            "private report Oracle, dynamic flag, Pro 60/40 assessment, replay timeline, and six abilities"
        )

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
                timeout=180,
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
                timeout=180,
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
    if os.getenv("DOJO_VERIFY_FLAG_ONLY") == "1":
        verify_flag_latency()
    else:
        main()

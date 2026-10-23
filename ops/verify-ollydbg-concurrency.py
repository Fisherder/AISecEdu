#!/usr/bin/env python3
"""Verify concurrent Windows OllyDbg course workspaces at learner scale.

The verifier uses one authenticated session per learner, starts the real
`ollydbg-auth` Windows guest, waits for the platform readiness contract, applies
a known-valid set of binary modifications inside the guest, runs the course
checker, submits the resulting dynamic flag through the normal challenge API and
confirms the recorded completion.  It is not a request-rate micro benchmark.

Residency is gated client-side because the platform bounds workspace *cold
starts* only: `DOJO_WORKSPACE_START_CONCURRENCY` releases its lease as soon as a
container has been created, so a large burst would otherwise accumulate every
Windows guest until host memory is exhausted.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import dataclasses
import datetime as dt
import json
import math
import os
import pathlib
import re
import secrets
import statistics
import subprocess
import threading
import time
import urllib.parse
from collections import defaultdict
from typing import Any, Iterable

import requests
import urllib3


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = os.getenv("DOJO_URL", "http://10.92.35.7:8080").rstrip("/")
DEFAULT_DOJO_HOST = os.getenv("DOJO_HOST", "10.92.35.7")
DEFAULT_CONTAINER = os.getenv("DOJO_CONTAINER", "pwncollege-dojo")
DEFAULT_COURSE = os.getenv("OLLYDBG_COURSE", "ollydbg-practice~003a97d0")
DEFAULT_MODULE = os.getenv("OLLYDBG_MODULE", "reverse-debugging")
DEFAULT_CHALLENGE = os.getenv("OLLYDBG_CHALLENGE", "ollydbg-auth")
DEFAULT_CTF_CHALLENGE = 1459
DEFAULT_SOLVE_SCRIPT = os.getenv("OLLYDBG_SOLVE_SCRIPT", str(ROOT / "output" / "ollydbg-solve.ps1"))
DEFAULT_PATCH_FIXTURE = os.getenv("OLLYDBG_PATCH_FIXTURE", str(ROOT / "output" / "ollydbg-patches.json"))
DEFAULT_ORIGINALS = os.getenv("OLLYDBG_ORIGINALS", str(ROOT / "data" / "windows-lab" / "build" / "originals"))
AGENT_CLIENT_SOURCE = str(ROOT / "output" / "win2000" / "w2k-agent-client.py")
AGENT_WORKDIR = "/tmp/ollydbg-agent"
AGENT_SCRIPT = "C:\\Lab\\.patch.vbs"

QMP_HELPER = r'''
import json, socket, sys, time

QMP = "/var/lib/windows-lab/qmp.sock"


class Qmp:
    def __init__(self):
        s = socket.socket(socket.AF_UNIX)
        s.settimeout(90)
        s.connect(QMP)
        self.f = s.makefile("rwb")
        self.f.readline()
        self.cmd("qmp_capabilities")

    def cmd(self, ex, args=None):
        request = {"execute": ex}
        if args:
            request["arguments"] = args
        self.f.write(json.dumps(request).encode() + b"\n")
        self.f.flush()
        while True:
            line = self.f.readline()
            if not line:
                raise RuntimeError("qmp closed")
            response = json.loads(line)
            if "error" in response:
                raise RuntimeError(response["error"])
            if "return" in response:
                return response["return"]

    def event(self, qcode, down):
        self.cmd("input-send-event", {"events": [
            {"type": "key", "data": {"down": down, "key": {"type": "qcode", "data": qcode}}}]})


SHIFTED = {"+": "equal", "_": "minus", ":": "semicolon", "~": "grave_accent",
           "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7",
           "*": "8", "(": "9", ")": "0", "?": "slash", "<": "comma", ">": "dot",
           "|": "backslash", '"': "apostrophe", "{": "bracket_left", "}": "bracket_right"}
PLAIN = {"-": "minus", "=": "equal", "/": "slash", ".": "dot", ",": "comma",
         ";": "semicolon", "'": "apostrophe", "[": "bracket_left", "]": "bracket_right",
         "\\": "backslash", "`": "grave_accent", " ": "spc"}


def qcode_for(character):
    if character.islower() or character.isdigit():
        return character, False
    if character.isupper():
        return character.lower(), True
    if character in SHIFTED:
        return SHIFTED[character], True
    if character in PLAIN:
        return PLAIN[character], False
    raise RuntimeError("unmapped character %r" % character)


def type_text(q, text, delay):
    for character in text:
        qcode, shift = qcode_for(character)
        if shift:
            q.event("shift", True)
        q.event(qcode, True)
        q.event(qcode, False)
        if shift:
            q.event("shift", False)
        time.sleep(delay)


def press(q, combo):
    for qcode in combo:
        q.event(qcode, True)
    for qcode in reversed(combo):
        q.event(qcode, False)


def main():
    delay = float(sys.argv[1])
    q = Qmp()
    press(q, ["meta_l", "r"])
    time.sleep(2.5)
    type_text(q, "cmd", delay)
    press(q, ["ret"])
    time.sleep(5.0)
    type_text(q, "powershell -NoProfile -EncodedCommand " + sys.argv[2], delay)
    time.sleep(0.4)
    press(q, ["ret"])


main()
'''
QMP_HELPER_B64 = base64.b64encode(QMP_HELPER.encode()).decode()
QMP_HELPER_PATH = "/tmp/ollydbg-qmp.py"
RESULT_PATH = "/usr/share/novnc/lab-result.json"


@dataclasses.dataclass
class Learner:
    index: int
    name: str
    password: str
    session: requests.Session
    user_id: int | None = None
    started: bool = False
    stopped: bool = False


@dataclasses.dataclass
class Observation:
    stage: str
    operation: str
    learner: str
    ok: bool
    latency_ms: float
    error: str | None = None
    metadata: dict[str, Any] = dataclasses.field(default_factory=dict)


class Recorder:
    def __init__(self) -> None:
        self._rows: list[Observation] = []
        self._lock = threading.Lock()

    def add(self, row: Observation) -> Observation:
        with self._lock:
            self._rows.append(row)
        return row

    @property
    def rows(self) -> list[Observation]:
        with self._lock:
            return list(self._rows)


def percentile(values: Iterable[float], percent: int) -> float | None:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return None
    index = max(0, min(len(ordered) - 1, math.ceil(percent / 100 * len(ordered)) - 1))
    return ordered[index]


def compact_error(value: Any, limit: int = 300) -> str:
    return re.sub(r"\s+", " ", str(value or "unknown error")).strip()[:limit]


def safe_json(response: requests.Response | None) -> dict[str, Any]:
    if response is None:
        return {}
    try:
        payload = response.json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


def summarize(rows: Iterable[Observation]) -> dict[str, Any]:
    groups: dict[tuple[str, str], list[Observation]] = defaultdict(list)
    for row in rows:
        groups[(row.stage, row.operation)].append(row)
    rendered: dict[str, Any] = {}
    for (stage, operation), items in sorted(groups.items()):
        latencies = [item.latency_ms for item in items]
        successes = [item for item in items if item.ok]
        rendered[f"{stage}:{operation}"] = {
            "stage": stage,
            "operation": operation,
            "total": len(items),
            "success": len(successes),
            "successRate": round(len(successes) / len(items), 4),
            "p50Ms": round(percentile(latencies, 50) or 0, 1),
            "p95Ms": round(percentile(latencies, 95) or 0, 1),
            "maxMs": round(max(latencies), 1),
            "errors": sorted({item.error for item in items if not item.ok and item.error})[:6],
        }
    return rendered


def request_session(host: str) -> requests.Session:
    session = requests.Session()
    session.verify = False
    session.trust_env = False
    session.headers.update({
        "Host": host,
        "User-Agent": "Xuanjia-ollydbg-concurrency-verifier/1.0",
        "Authorization": "Bearer frontend-session",
    })
    adapter = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=4, max_retries=0)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


class Verifier:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.base_url = args.base_url.rstrip("/")
        self.container = args.container
        self.dojo_host = args.dojo_host
        self.course = args.course
        self.module = args.module
        self.challenge = args.challenge
        self.ctf_challenge = args.ctf_challenge
        self.run_id = args.run_id or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        if not re.fullmatch(r"[0-9A-Za-z-]{6,32}", self.run_id):
            raise ValueError("run id must contain 6-32 letters, digits or dashes")
        self.password = secrets.token_urlsafe(24)
        self.recorder = Recorder()
        self.learners: list[Learner] = []
        self.admin: requests.Session | None = None
        self.monitor_samples: list[dict[str, Any]] = []
        self.monitor_stop = threading.Event()
        self.monitor_thread: threading.Thread | None = None
        self.residency = threading.BoundedSemaphore(max(1, args.max_resident))
        self.resident_now = 0
        self.peak_resident = 0
        self.residency_lock = threading.Lock()
        self.cleanup_errors: list[str] = []
        self.started_at = time.time()
        self.baseline: dict[str, Any] = {}
        self.memory_alarm = threading.Event()
        self.solve_mode = args.solve_mode
        self.solve_payload = ""
        if not args.skip_solve and args.solve_mode != "agent":
            script_path = pathlib.Path(args.solve_script)
            if not script_path.is_file():
                raise SystemExit(
                    f"guest modification fixture not found: {script_path}\n"
                    "Provide the operator-owned solve script, or run with --skip-solve."
                )
            self.solve_payload = base64.b64encode(
                script_path.read_text(encoding="utf-8").encode("utf-16-le")
            ).decode()

    # -- infrastructure helpers -------------------------------------------------

    def outer(self, *args: str, timeout: int = 180, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["docker", "exec", self.container, *args],
            check=check, capture_output=True, text=True, timeout=timeout,
        )

    def inner(self, *args: str, timeout: int = 180, check: bool = True) -> subprocess.CompletedProcess[str]:
        return self.outer("docker", *args, timeout=timeout, check=check)

    def container_path(self, path: Any) -> str:
        text = str(path)
        root = str(ROOT)
        if text == root:
            return self.args.container_root
        if text.startswith(root + os.sep):
            return self.args.container_root + text[len(root):]
        return text

    def sql(self, statement: str, *, timeout: int = 120) -> str:
        return self.outer("dojo", "db", "-t", "-A", "-c", statement, timeout=timeout).stdout.strip()

    def credentials(self) -> tuple[str, str]:
        path = pathlib.Path(os.getenv("DOJO_ADMIN_CREDENTIALS", ROOT / "data/admin-password.txt"))
        try:
            content = path.read_text().strip()
        except (FileNotFoundError, PermissionError):
            content = self.outer("cat", "/data/admin-password.txt").stdout.strip()
        values = {"username": "admin", "password": "admin"}
        if "=" not in content:
            values["password"] = content
        else:
            for line in content.splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key] = value
        return values.get("username", "admin"), values["password"]

    def authenticate(self, name: str, password: str, *, register: bool = False) -> requests.Session:
        session = request_session(self.dojo_host)
        endpoint = "register" if register else "login"
        payload: dict[str, Any] = {"name": name, "password": password}
        if register:
            payload.update({"email": f"{name}@example.invalid", "commitment_accepted": True})
        deadline = time.monotonic() + 120
        response: requests.Response | None = None
        while time.monotonic() < deadline:
            response = session.post(
                f"{self.base_url}/pwncollege_api/v1/auth/{endpoint}",
                json=payload, timeout=30, allow_redirects=False,
            )
            if response.status_code == 200:
                return session
            if response.status_code not in {429, 502, 503, 504}:
                break
            time.sleep(0.5)
        status = response.status_code if response is not None else "no response"
        body = compact_error(response.text if response is not None else "")
        raise RuntimeError(f"{endpoint} {name} failed: {status} {body}")

    # -- preflight --------------------------------------------------------------

    def preflight(self) -> None:
        if not self.course or "~" not in self.course:
            raise ValueError("a non-official course reference such as name~hexid is required")
        dojo_row = [field.strip() for field in self.sql(
            f"select dojo_id, name from dojos where id = '{self.course.split('~', 1)[0]}' "
            f"and dojo_id = {int(self.course.split('~', 1)[1], 16)};"
        ).split("|")]
        if not dojo_row or not dojo_row[0]:
            raise RuntimeError(f"course {self.course} not found")
        self.dojo_id = int(dojo_row[0])
        self.dojo_name = dojo_row[1] if len(dojo_row) > 1 else self.course
        challenge = self.sql(
            f"select dc.challenge_id, dc.data->>'image', dc.data->>'runtime_environment' "
            f"from dojo_challenges dc "
            f"join dojo_modules dm on dm.dojo_id = dc.dojo_id and dm.module_index = dc.module_index "
            f"where dc.dojo_id = {self.dojo_id} and dm.id = '{self.module}' and dc.id = '{self.challenge}';"
        )
        if not challenge:
            raise RuntimeError(f"challenge {self.module}/{self.challenge} not found in {self.course}")
        fields = [field.strip() for field in challenge.split("|")]
        challenge_id, image = fields[0], fields[1]
        self.runtime_environment = fields[2] if len(fields) > 2 else "linux"
        if self.solve_mode == "auto":
            self.solve_mode = "agent" if self.runtime_environment == "windows2000" else "qmp"
        self.ctf_challenge = int(challenge_id)
        self.image = image
        self.inner("image", "inspect", image, timeout=60)
        self.outer("test", "-r", "/dev/kvm")
        response = requests.get(f"{self.base_url}/healthcheck", timeout=30, verify=False)
        if response.status_code != 200:
            raise RuntimeError(f"platform healthcheck returned {response.status_code}")
        self.baseline = self.collect_sample()
        print(
            f"PREFLIGHT course={self.dojo_name} dojo_id={self.dojo_id} image={image} "
            f"challenge_id={self.ctf_challenge} memAvailableGiB={self.baseline.get('memAvailableGiB')} "
            f"maxResident={self.args.max_resident}",
            flush=True,
        )

    # -- provisioning -----------------------------------------------------------

    def provision_one(self, index: int) -> Learner:
        name = f"ollydbg-{self.run_id}-{index:03d}"
        session = self.authenticate(name, self.password, register=True)
        payload = safe_json(session.get(f"{self.base_url}/api/v1/users/me", timeout=30))
        user_id = (payload.get("data") or {}).get("id")
        if not isinstance(user_id, int):
            raise RuntimeError(f"cannot resolve user id for {name}")
        return Learner(index=index, name=name, password=self.password, session=session, user_id=user_id)

    def provision_learners(self) -> None:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(16, self.args.students)) as pool:
            futures = [pool.submit(self.provision_one, index) for index in range(1, self.args.students + 1)]
            for position, future in enumerate(concurrent.futures.as_completed(futures), 1):
                self.learners.append(future.result())
                if position % 10 == 0 or position == self.args.students:
                    print(f"PROVISION {position}/{self.args.students}", flush=True)
        self.learners.sort(key=lambda learner: learner.index)
        self.enroll_learners()

    def enroll_learners(self) -> None:
        identifiers = [learner.user_id for learner in self.learners if learner.user_id]
        if any(not isinstance(value, int) or value <= 0 for value in identifiers):
            raise ValueError("unsafe learner identifier")
        values = ", ".join(f"({self.dojo_id}, {value}, 'member')" for value in identifiers)
        self.sql(
            "insert into dojo_users (dojo_id, user_id, type) values "
            + values
            + " on conflict (dojo_id, user_id) do nothing;"
        )
        enrolled = self.sql(
            f"select count(*) from dojo_users where dojo_id = {self.dojo_id} "
            f"and user_id in ({', '.join(str(value) for value in identifiers)});"
        )
        print(f"ENROLL enrolled={enrolled}/{len(identifiers)}", flush=True)

    # -- per-learner workflow ---------------------------------------------------

    def start_workspace(self, learner: Learner) -> bool:
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = learner.session.post(
                f"{self.base_url}/pwncollege_api/v1/docker",
                json={"dojo": self.course, "module": self.module, "challenge": self.challenge},
                timeout=self.args.workspace_timeout,
            )
            payload = safe_json(response)
            ok = response.status_code == 200 and payload.get("success") is True
            error = None if ok else compact_error(payload.get("error") or response.text)
        except Exception as error_value:  # noqa: BLE001 - load reports retain failures
            ok, error = False, compact_error(error_value)
        learner.started = ok
        self.recorder.add(Observation("workspace", "start", learner.name, ok,
                                      (time.perf_counter() - started) * 1000, error))
        return ok

    def wait_ready(self, learner: Learner) -> bool:
        started = time.perf_counter()
        deadline = time.monotonic() + self.args.ready_timeout
        last_error = "not attempted"
        while time.monotonic() < deadline:
            try:
                result = self.inner(
                    "exec", "-u", "1000", f"user_{learner.user_id}",
                    "/usr/local/bin/environment-check", timeout=60, check=False,
                )
                if result.returncode == 0:
                    self.recorder.add(Observation("workspace", "ready", learner.name, True,
                                                  (time.perf_counter() - started) * 1000))
                    return True
                last_error = compact_error(result.stdout or result.stderr)
            except subprocess.TimeoutExpired:
                last_error = "environment-check timed out"
            except subprocess.CalledProcessError as error:
                last_error = compact_error(error.stderr)
            time.sleep(self.args.ready_poll)
        self.recorder.add(Observation("workspace", "ready", learner.name, False,
                                      (time.perf_counter() - started) * 1000, last_error))
        return False

    def install_helper(self, learner: Learner) -> None:
        script = f"printf %s {QMP_HELPER_B64} | base64 -d > {QMP_HELPER_PATH}"
        self.inner("exec", f"user_{learner.user_id}", "sh", "-c", script, timeout=60)

    def guest_solve(self, learner: Learner) -> str | None:
        if self.solve_mode == "agent":
            return self.guest_solve_agent(learner)
        return self.guest_solve_qmp(learner)

    def agent_plan(self) -> dict[str, Any]:
        spec = json.loads(pathlib.Path(self.args.patch_fixture).read_text(encoding="utf-8"))
        originals = pathlib.Path(self.args.originals_dir)
        staged = pathlib.Path(self.args.staging)
        staged.mkdir(parents=True, exist_ok=True)
        files = []
        for item in spec["files"]:
            data = bytearray((originals / item["source"]).read_bytes())
            for offset, value in item["patches"]:
                data[int(offset)] = int(value)
            target = staged / pathlib.Path(item["guest"].replace("\\", "/")).name
            target.write_bytes(bytes(data))
            files.append({"guest": item["guest"], "source": target.name})
        plan = {"files": files, "chunk": self.args.agent_chunk}
        (staged / "files.json").write_text(json.dumps(plan), encoding="utf-8")
        return plan

    def guest_solve_agent(self, learner: Learner) -> str | None:
        started = time.perf_counter()
        container = f"user_{learner.user_id}"
        last_error = "flag was not produced"
        self.agent_plan()
        client = pathlib.Path(self.args.staging) / "client.py"
        client.write_text(pathlib.Path(AGENT_CLIENT_SOURCE).read_text(encoding="utf-8"), encoding="utf-8")
        try:
            self.inner("exec", container, "mkdir", "-p", AGENT_WORKDIR, timeout=60)
            self.inner("cp", self.container_path(self.args.staging) + "/.", f"{container}:{AGENT_WORKDIR}", timeout=180)
        except subprocess.SubprocessError as error:
            self.recorder.add(Observation("challenge", "solve", learner.name, False,
                                          (time.perf_counter() - started) * 1000, compact_error(error)))
            return None
        try:
            self.inner("exec", container, "python3", f"{AGENT_WORKDIR}/client.py",
                       f"{AGENT_WORKDIR}/files.json", timeout=self.args.solve_timeout)
        except subprocess.SubprocessError as error:
            last_error = compact_error(error)
        deadline = time.monotonic() + self.args.flag_timeout
        while time.monotonic() < deadline:
            result = self.inner("exec", container, "cat", RESULT_PATH, timeout=30, check=False)
            if result.returncode == 0 and result.stdout.strip():
                try:
                    flag = str(json.loads(result.stdout).get("flag") or "").strip()
                except ValueError:
                    flag = ""
                if flag:
                    self.recorder.add(Observation("challenge", "solve", learner.name, True,
                                                  (time.perf_counter() - started) * 1000,
                                                  metadata={"mode": "agent"}))
                    return flag
            time.sleep(5)
        self.recorder.add(Observation("challenge", "solve", learner.name, False,
                                      (time.perf_counter() - started) * 1000, last_error))
        return None

    def guest_solve_qmp(self, learner: Learner) -> str | None:
        started = time.perf_counter()
        container = f"user_{learner.user_id}"
        last_error = "flag was not produced"
        for attempt in range(1, self.args.solve_attempts + 1):
            self.inner("exec", container, "rm", "-f", RESULT_PATH, timeout=30, check=False)
            try:
                self.inner("exec", container, "python3", QMP_HELPER_PATH,
                           str(self.args.keystroke_delay), self.solve_payload,
                           timeout=self.args.solve_timeout)
            except subprocess.SubprocessError as error:
                last_error = compact_error(error)
                continue
            deadline = time.monotonic() + self.args.flag_timeout
            while time.monotonic() < deadline:
                result = self.inner("exec", container, "cat", RESULT_PATH, timeout=30, check=False)
                if result.returncode == 0 and result.stdout.strip():
                    try:
                        flag = str(json.loads(result.stdout).get("flag") or "").strip()
                    except ValueError:
                        flag = ""
                    if flag:
                        self.recorder.add(Observation("challenge", "solve", learner.name, True,
                                                      (time.perf_counter() - started) * 1000,
                                                      metadata={"attempt": attempt}))
                        return flag
                time.sleep(5)
            last_error = f"no flag after attempt {attempt}"
        self.recorder.add(Observation("challenge", "solve", learner.name, False,
                                      (time.perf_counter() - started) * 1000, last_error))
        return None

    def submit_flag(self, learner: Learner, flag: str) -> bool:
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = learner.session.post(
                f"{self.base_url}/api/v1/challenges/attempt",
                json={"challenge_id": self.ctf_challenge, "submission": flag},
                timeout=60,
            )
            payload = safe_json(response)
            status = str(((payload.get("data") or {}).get("status")) or "")
            ok = response.status_code == 200 and status in {"correct", "already_solved"}
            error = None if ok else compact_error(response.text)
        except Exception as error_value:  # noqa: BLE001
            ok, error = False, compact_error(error_value)
        self.recorder.add(Observation("challenge", "submit", learner.name, ok,
                                      (time.perf_counter() - started) * 1000, error))
        return ok

    def verify_completion(self) -> None:
        expected = [learner for learner in self.learners if learner.user_id]
        if not expected:
            return
        identifiers = ", ".join(str(learner.user_id) for learner in expected)
        counted = self.sql(
            f"select count(*) from submissions where challenge_id = {self.ctf_challenge} "
            f"and type = 'correct' and user_id in ({identifiers});"
        )
        self.completion_count = int(counted or 0)

    def stop_workspace(self, learner: Learner) -> None:
        if learner.stopped:
            return
        learner.stopped = True
        try:
            learner.session.delete(f"{self.base_url}/pwncollege_api/v1/docker", json={}, timeout=180)
        except requests.RequestException as error:
            self.cleanup_errors.append(f"stop {learner.name}: {compact_error(error)}")
        finally:
            if learner.user_id:
                self.inner("rm", "-f", f"user_{learner.user_id}", timeout=120, check=False)

    def learner_flow(self, learner: Learner, barrier: threading.Barrier) -> None:
        barrier.wait()
        self.residency.acquire()
        with self.residency_lock:
            self.resident_now += 1
            self.peak_resident = max(self.peak_resident, self.resident_now)
        try:
            if self.args.verbose:
                print(f"STAGE {learner.index} admitted", flush=True)
            if self.memory_alarm.is_set():
                self.recorder.add(Observation("workspace", "start", learner.name, False, 0.0,
                                              "host memory floor reached; start withheld"))
                return
            if not self.start_workspace(learner):
                return
            if self.args.verbose:
                print(f"STAGE {learner.index} started user_{learner.user_id}", flush=True)
            if not self.wait_ready(learner):
                return
            if self.args.verbose:
                print(f"STAGE {learner.index} ready", flush=True)
            if self.args.hold_seconds:
                time.sleep(self.args.hold_seconds)
            if self.args.skip_solve:
                self.recorder.add(Observation("challenge", "solve", learner.name, True, 0.0,
                                              metadata={"skipped": True}))
                return
            self.install_helper(learner)
            flag = self.guest_solve(learner)
            if flag is None:
                return
            self.submit_flag(learner, flag)
        finally:
            if not self.args.keep_workspaces:
                self.stop_workspace(learner)
            with self.residency_lock:
                self.resident_now -= 1
            self.residency.release()

    def run(self) -> None:
        barrier = threading.Barrier(len(self.learners))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(self.learners)) as pool:
            futures = [pool.submit(self.learner_flow, learner, barrier) for learner in self.learners]
            for position, future in enumerate(concurrent.futures.as_completed(futures), 1):
                try:
                    future.result()
                except Exception as error:  # noqa: BLE001
                    self.cleanup_errors.append(f"learner flow: {compact_error(error)}")
                if position % 10 == 0 or position == len(self.learners):
                    print(f"LEARNER {position}/{len(self.learners)}", flush=True)
        self.verify_completion()

    # -- monitoring -------------------------------------------------------------

    def collect_sample(self) -> dict[str, Any]:
        sample: dict[str, Any] = {"timestamp": time.time(), "loadAverage": list(os.getloadavg())}
        try:
            meminfo = pathlib.Path("/proc/meminfo").read_text()
            values = {key: int(value) for key, value in
                      re.findall(r"^(MemTotal|MemAvailable|MemFree|SwapFree):\s+(\d+)", meminfo, re.M)}
            sample["memTotalGiB"] = round(values.get("MemTotal", 0) / 1048576, 2)
            sample["memAvailableGiB"] = round(values.get("MemAvailable", 0) / 1048576, 2)
        except OSError as error:
            sample["memoryError"] = compact_error(error)
        try:
            arc = pathlib.Path("/proc/spl/kstat/zfs/arcstats").read_text()
            size = re.search(r"^size\s+\d+\s+(\d+)", arc, re.M)
            sample["arcGiB"] = round(int(size.group(1)) / 1073741824, 2) if size else None
        except OSError:
            sample["arcGiB"] = None
        try:
            output = self.outer(
                "sh", "-c",
                "ps -eo rss,comm | awk '/qemu-system/ {sum+=$1; n+=1} "
                "END {printf \"%d %d\", n+0, sum+0}'",
                timeout=60, check=False,
            ).stdout.split()
            sample["guestCount"] = int(output[0]) if output else 0
            sample["guestRssGiB"] = round(int(output[1]) / 1048576, 2) if len(output) > 1 else 0.0
        except Exception as error:  # noqa: BLE001
            sample["guestError"] = compact_error(error)
        try:
            names = self.inner("ps", "--filter", "name=user_", "--format", "{{.Names}}",
                               timeout=60, check=False).stdout.splitlines()
            sample["workspaceCount"] = len([name for name in names if name.startswith("user_")])
        except Exception as error:  # noqa: BLE001
            sample["workspaceError"] = compact_error(error)
        return sample

    def monitor(self) -> None:
        while not self.monitor_stop.is_set():
            try:
                sample = self.collect_sample()
                self.monitor_samples.append(sample)
                if self.args.verbose:
                    print(
                        f"SAMPLE guests={sample.get('guestCount')} "
                        f"guestRssGiB={sample.get('guestRssGiB')} "
                        f"memAvailableGiB={sample.get('memAvailableGiB')} "
                        f"arcGiB={sample.get('arcGiB')} load={max(sample.get('loadAverage', [0]))}",
                        flush=True,
                    )
                available = sample.get("memAvailableGiB")
                if (available is not None and available < self.args.memory_floor_gib
                        and not self.memory_alarm.is_set()):
                    self.memory_alarm.set()
                    self.cleanup_errors.append(
                        f"host memory floor {self.args.memory_floor_gib}GiB reached at "
                        f"{available}GiB; resident workspaces were stopped")
                    threading.Thread(target=self.emergency_stop, daemon=True).start()
            except Exception as error:  # noqa: BLE001
                self.monitor_samples.append({"timestamp": time.time(), "error": compact_error(error)})
            self.monitor_stop.wait(self.args.monitor_interval)

    def emergency_stop(self) -> None:
        active = [learner for learner in self.learners if learner.started and not learner.stopped]
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(48, max(1, len(active)))) as pool:
            list(pool.map(self.stop_workspace, active))

    def start_monitor(self) -> None:
        self.monitor_thread = threading.Thread(target=self.monitor, name="load-monitor", daemon=True)
        self.monitor_thread.start()

    def stop_monitor(self) -> None:
        self.monitor_stop.set()
        if self.monitor_thread:
            self.monitor_thread.join(timeout=60)
        self.monitor_samples.append(self.collect_sample())

    # -- cleanup ----------------------------------------------------------------

    def cleanup_homes(self) -> None:
        identifiers = [str(learner.user_id) for learner in self.learners if learner.user_id]
        if not identifiers:
            return
        if any(not re.fullmatch(r"[1-9][0-9]*", value) for value in identifiers):
            raise ValueError("unsafe generated home id")
        script = r"""
for user_id do
    case "$user_id" in ''|*[!0-9]*) exit 2 ;; esac
    root="/run/homefs/$user_id"
    [ -e "$root" ] || continue
    btrfs subvolume list -o "$root" | awk '{print $9}' | sort -r | while IFS= read -r subvolume; do
        btrfs subvolume delete "/run/homefs/$subvolume"
    done
    rm -rf "$root"
done
"""
        result = self.inner("exec", "homefs", "sh", "-c", script, "cleanup-homes", *identifiers,
                            timeout=max(180, len(identifiers) * 2), check=False)
        if result.returncode != 0:
            self.cleanup_errors.append(f"home cleanup: {compact_error(result.stderr)}")

    def cleanup(self) -> None:
        if not self.args.keep_data:
            for learner in self.learners:
                if learner.user_id:
                    self.inner("volume", "rm", str(learner.user_id), timeout=60, check=False)
            if self.learners:
                self.cleanup_homes()
            if self.admin is not None:
                for learner in self.learners:
                    if not learner.user_id:
                        continue
                    try:
                        response = self.admin.delete(
                            f"{self.base_url}/api/v1/users/{learner.user_id}", json={}, timeout=60,
                        )
                        if response.status_code != 200:
                            self.cleanup_errors.append(
                                f"user {learner.user_id}: HTTP {response.status_code}")
                    except requests.RequestException as error:
                        self.cleanup_errors.append(f"user {learner.user_id}: {compact_error(error)}")
        for learner in self.learners:
            learner.session.close()
        if self.admin is not None:
            self.admin.close()

    # -- reporting --------------------------------------------------------------

    def assess(self, summaries: dict[str, Any]) -> list[dict[str, Any]]:
        requirements = {
            "workspace:start": {"minimumRate": self.args.minimum_rate, "maximumP95Ms": 120000},
            "workspace:ready": {"minimumRate": self.args.minimum_rate, "maximumP95Ms": 900000},
            "challenge:solve": {"minimumRate": self.args.minimum_rate, "maximumP95Ms": 900000},
            "challenge:submit": {"minimumRate": self.args.minimum_rate, "maximumP95Ms": 120000},
        }
        failures: list[dict[str, Any]] = []
        for key, result in summaries.items():
            requirement = requirements.get(key)
            if not requirement:
                continue
            reasons = []
            if result["successRate"] < requirement["minimumRate"]:
                reasons.append(
                    f"successRate={result['successRate']} below {requirement['minimumRate']}")
            if result["p95Ms"] > requirement["maximumP95Ms"]:
                reasons.append(f"p95Ms={result['p95Ms']} above {requirement['maximumP95Ms']}")
            if reasons:
                failures.append({"operation": key, "reasons": reasons, "errors": result["errors"]})
        expected = len([learner for learner in self.learners if learner.user_id])
        if not self.args.skip_solve and getattr(self, "completion_count", 0) < expected:
            failures.append({
                "operation": "completion:recorded",
                "reasons": [f"recorded={getattr(self, 'completion_count', 0)} below expected={expected}"],
                "errors": [],
            })
        return failures

    def report(self) -> dict[str, Any]:
        summaries = summarize(self.recorder.rows)
        failures = self.assess(summaries)
        samples = self.monitor_samples
        memories = [sample.get("memAvailableGiB") for sample in samples if sample.get("memAvailableGiB") is not None]
        guest_counts = [sample.get("guestCount") for sample in samples if sample.get("guestCount") is not None]
        guest_rss = [sample.get("guestRssGiB") for sample in samples if sample.get("guestRssGiB") is not None]
        loads = [max(sample.get("loadAverage", [0])) for sample in samples]
        return {
            "passed": not failures,
            "runId": self.run_id,
            "course": self.course,
            "challenge": {"module": self.module, "id": self.challenge, "ctfChallengeId": self.ctf_challenge},
            "students": self.args.students,
            "maxResident": self.args.max_resident,
            "peakGuestCount": max(guest_counts) if guest_counts else 0,
            "peakGuestRssGiB": round(max(guest_rss), 2) if guest_rss else 0.0,
            "minimumMemAvailableGiB": round(min(memories), 2) if memories else None,
            "maximumLoadAverage": round(max(loads), 2) if loads else None,
            "baseline": self.baseline,
            "durationSeconds": round(time.time() - self.started_at, 1),
            "completionRecorded": getattr(self, "completion_count", 0),
            "summaries": summaries,
            "failures": failures,
            "cleanupErrors": self.cleanup_errors,
            "samples": samples[:: max(1, len(samples) // 240)],
        }

    def write_report(self, report: dict[str, Any]) -> pathlib.Path:
        output = pathlib.Path(self.args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        return output

    def run_all(self) -> tuple[dict[str, Any], pathlib.Path]:
        self.preflight()
        self.start_monitor()
        try:
            self.admin = self.authenticate(*self.credentials())
            self.provision_learners()
            self.run()
        finally:
            if not self.args.keep_workspaces and self.learners:
                with concurrent.futures.ThreadPoolExecutor(max_workers=min(48, len(self.learners))) as pool:
                    list(pool.map(self.stop_workspace, self.learners))
            self.cleanup()
            self.stop_monitor()
        report = self.report()
        path = self.write_report(report)
        return report, path


def bounded_count(parser: argparse.ArgumentParser, name: str, value: int, maximum: int) -> None:
    if value < 1 or value > maximum:
        parser.error(f"{name} must be between 1 and {maximum}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--dojo-host", default=DEFAULT_DOJO_HOST)
    parser.add_argument("--container", default=DEFAULT_CONTAINER)
    parser.add_argument("--course", default=DEFAULT_COURSE)
    parser.add_argument("--module", default=DEFAULT_MODULE)
    parser.add_argument("--challenge", default=DEFAULT_CHALLENGE)
    parser.add_argument("--ctf-challenge", type=int, default=DEFAULT_CTF_CHALLENGE)
    parser.add_argument("--students", type=int, default=70)
    parser.add_argument("--max-resident", type=int, default=12)
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--output", default=str(ROOT / "output" / "ollydbg-concurrency.json"))
    parser.add_argument("--workspace-timeout", type=int, default=900)
    parser.add_argument("--ready-timeout", type=int, default=900)
    parser.add_argument("--ready-poll", type=float, default=10.0)
    parser.add_argument("--solve-timeout", type=int, default=420)
    parser.add_argument("--flag-timeout", type=int, default=180)
    parser.add_argument("--solve-attempts", type=int, default=2)
    parser.add_argument("--keystroke-delay", type=float, default=0.012)
    parser.add_argument("--monitor-interval", type=float, default=10.0)
    parser.add_argument("--memory-floor-gib", type=float, default=8.0)
    parser.add_argument("--minimum-rate", type=float, default=1.0)
    parser.add_argument("--keep-data", action="store_true")
    parser.add_argument("--keep-workspaces", action="store_true")
    parser.add_argument("--skip-solve", action="store_true")
    parser.add_argument("--solve-mode", choices=("auto", "qmp", "agent"), default="auto")
    parser.add_argument("--patch-fixture", default=DEFAULT_PATCH_FIXTURE)
    parser.add_argument("--originals-dir", default=DEFAULT_ORIGINALS)
    parser.add_argument("--staging", default=str(ROOT / "output" / "ollydbg-staging"))
    parser.add_argument("--container-root", default="/opt/pwn.college")
    parser.add_argument("--agent-chunk", type=int, default=256)
    parser.add_argument("--solve-script", default=DEFAULT_SOLVE_SCRIPT)
    parser.add_argument("--hold-seconds", type=int, default=0)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    bounded_count(parser, "students", args.students, 400)
    bounded_count(parser, "max-resident", args.max_resident, 400)
    if args.max_resident > args.students:
        args.max_resident = args.students
    return args


def main() -> None:
    args = parse_args()
    verifier = Verifier(args)
    try:
        report, path = verifier.run_all()
    except KeyboardInterrupt:
        verifier.cleanup()
        raise
    print(f"REPORT {path}", flush=True)
    print(json.dumps({key: report[key] for key in (
        "passed", "students", "maxResident", "peakGuestCount", "peakGuestRssGiB",
        "minimumMemAvailableGiB", "maximumLoadAverage", "completionRecorded",
        "durationSeconds", "failures", "cleanupErrors")}, ensure_ascii=False, indent=2), flush=True)
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

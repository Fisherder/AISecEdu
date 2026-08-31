#!/usr/bin/env python3
"""Run reproducible, identity-aware 玄甲 high-concurrency verification.

The verifier deliberately uses one authenticated session per learner.  It is
not a request-rate micro benchmark: it exercises the same course, workspace,
Code, Desktop and Guide contracts that the student UI uses, records latency
distributions and cleans up every generated resource.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import json
import math
import os
import pathlib
import re
import secrets
import ssl
import statistics
import subprocess
import threading
import time
import urllib.parse
from collections import Counter, defaultdict
from typing import Any, Callable, Iterable

import requests
import urllib3
import websocket
import yaml


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = os.getenv("DOJO_URL", "https://192.168.3.111").rstrip("/")
DEFAULT_DOJO_HOST = os.getenv("DOJO_HOST", "192.168.3.111")
DEFAULT_WORKSPACE_HOST = os.getenv("WORKSPACE_HOST", "workspace.localhost.pwn.college")
DEFAULT_WORKSPACE_PORT = int(os.getenv("WORKSPACE_HTTPS_PORT", "4443"))
DEFAULT_CONTAINER = os.getenv("DOJO_CONTAINER", "pwncollege-dojo")


def load_deployment_env() -> None:
    path = pathlib.Path(os.getenv("DOJO_DEPLOYMENT_ENV", ROOT / "ops/deployment.env"))
    if not path.is_file():
        return
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.rstrip("\r")
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise ValueError(f"Invalid deployment environment line {number}: {line}")
        os.environ.setdefault(key, value)


load_deployment_env()


@dataclasses.dataclass
class Learner:
    index: int
    name: str
    password: str
    session: requests.Session
    user_id: int | None = None
    thread_id: str | None = None


@dataclasses.dataclass
class Observation:
    stage: str
    operation: str
    learner: str
    ok: bool
    latency_ms: float
    status: int | None = None
    size: int = 0
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
    text = re.sub(r"\s+", " ", str(value or "unknown error")).strip()
    return text[:limit]


def summarize(rows: Iterable[Observation]) -> dict[str, Any]:
    groups: dict[tuple[str, str], list[Observation]] = defaultdict(list)
    for row in rows:
        groups[(row.stage, row.operation)].append(row)
    rendered: dict[str, Any] = {}
    for (stage, operation), items in sorted(groups.items()):
        key = f"{stage}:{operation}"
        successes = [item for item in items if item.ok]
        latencies = [item.latency_ms for item in items]
        rendered[key] = {
            "stage": stage,
            "operation": operation,
            "requests": len(items),
            "successes": len(successes),
            "failures": len(items) - len(successes),
            "successRate": round(len(successes) / len(items), 4) if items else 0,
            "p50Ms": round(statistics.median(latencies), 1) if latencies else None,
            "p95Ms": round(percentile(latencies, 95), 1) if latencies else None,
            "p99Ms": round(percentile(latencies, 99), 1) if latencies else None,
            "maxMs": round(max(latencies), 1) if latencies else None,
            "statuses": dict(sorted(Counter(str(item.status) for item in items).items())),
            "errors": dict(
                Counter(item.error for item in items if item.error).most_common(12)
            ),
            "bytes": sum(item.size for item in items),
        }
    return rendered


def safe_json(response: requests.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


def request_session(host: str) -> requests.Session:
    session = requests.Session()
    session.verify = False
    session.trust_env = False
    session.headers.update(
        {
            "Host": host,
            "User-Agent": "Xuanjia-high-concurrency-verifier/1.0",
            "Authorization": "Bearer frontend-session",
        }
    )
    adapter = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=4, max_retries=0)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


class Verifier:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.base_url = args.base_url.rstrip("/")
        self.parsed_base = urllib.parse.urlsplit(self.base_url)
        self.container = args.container
        self.dojo_host = args.dojo_host
        self.workspace_host = args.workspace_host
        self.workspace_port = args.workspace_port
        self.run_id = args.run_id or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        self.fixture_id = f"load-e2e-{self.run_id}"
        if not re.fullmatch(r"load-e2e-[0-9A-Za-z-]{8,32}", self.fixture_id):
            raise ValueError("run id must contain 8-32 letters, digits or dashes")
        self.password = secrets.token_urlsafe(24)
        self.recorder = Recorder()
        self.learners: list[Learner] = []
        self.dojo_reference: str | None = None
        self.admin: requests.Session | None = None
        self.monitor_samples: list[dict[str, Any]] = []
        self.monitor_stop = threading.Event()
        self.monitor_thread: threading.Thread | None = None
        self.started_at = time.time()
        self.cleanup_errors: list[str] = []
        self.workspace_count_after_start = 0

    def outer(self, *args: str, timeout: int = 180, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["docker", "exec", self.container, *args],
            check=check,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    def inner(self, *args: str, timeout: int = 180, check: bool = True) -> subprocess.CompletedProcess[str]:
        return self.outer("docker", *args, timeout=timeout, check=check)

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
            payload.update(
                {
                    "email": f"{name}@example.invalid",
                    "commitment_accepted": True,
                }
            )
        deadline = time.monotonic() + 120
        response: requests.Response | None = None
        while time.monotonic() < deadline:
            response = session.post(
                f"{self.base_url}/pwncollege_api/v1/auth/{endpoint}",
                json=payload,
                timeout=30,
                allow_redirects=False,
            )
            if response.status_code == 200:
                return session
            if response.status_code not in {429, 502, 503, 504}:
                break
            time.sleep(0.5)
        status = response.status_code if response is not None else "no response"
        body = compact_error(response.text if response is not None else "")
        raise RuntimeError(f"{endpoint} {name} failed: {status} {body}")

    def create_fixture(self) -> None:
        admin_name, admin_password = self.credentials()
        self.admin = self.authenticate(admin_name, admin_password)
        spec = {
            "id": self.fixture_id,
            "name": f"High concurrency verification {self.run_id}",
            "description": "Synthetic course used only for concurrent student verification.",
            "type": "public",
            "image": "pwncollege-smoke:latest",
            "privileged": True,
            "interfaces": [
                {"name": "Terminal", "port": 7681},
                {"name": "Code", "port": 8080},
                {"name": "Desktop", "port": 6080},
            ],
            "modules": [
                {
                    "id": f"module-{module_index}",
                    "name": f"Concurrent module {module_index}",
                    "challenges": [
                        {
                            "id": f"challenge-{module_index}-{challenge_index}",
                            "name": f"Concurrent challenge {module_index}.{challenge_index}",
                        }
                        for challenge_index in range(1, 3)
                    ],
                }
                for module_index in range(1, 4)
            ],
            "files": [
                {
                    "type": "text",
                    "path": f"module-{module_index}/challenge-{module_index}-{challenge_index}/run",
                    "content": "#!/opt/pwn.college/bash\nprintf 'high concurrency fixture\\n'\n",
                }
                for module_index in range(1, 4)
                for challenge_index in range(1, 3)
            ],
        }
        response = self.admin.post(
            f"{self.base_url}/pwncollege_api/v1/dojos/create",
            json={"spec": yaml.safe_dump(spec, sort_keys=False)},
            timeout=180,
        )
        payload = safe_json(response)
        if response.status_code != 200 or not payload.get("dojo"):
            raise RuntimeError(f"fixture creation failed: {response.status_code} {compact_error(response.text)}")
        self.dojo_reference = str(payload["dojo"])

    def provision_one(self, index: int) -> Learner:
        name = f"{self.fixture_id}-student-{index:04d}"
        session = self.authenticate(name, self.password, register=True)
        response = session.get(f"{self.base_url}/api/v1/users/me", timeout=30)
        payload = safe_json(response)
        user_id = ((payload.get("data") or {}).get("id"))
        if response.status_code != 200 or not isinstance(user_id, int):
            raise RuntimeError(f"cannot resolve user id for {name}")
        learner = Learner(index=index, name=name, password=self.password, session=session, user_id=user_id)
        joined = session.get(
            f"{self.base_url}/dojo/{self.dojo_reference}/join/",
            timeout=60,
            allow_redirects=True,
        )
        if joined.status_code != 200:
            raise RuntimeError(f"course join failed for {name}: {joined.status_code}")
        return learner

    def provision_learners(self) -> None:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, self.args.students)) as pool:
            futures = [pool.submit(self.provision_one, index) for index in range(1, self.args.students + 1)]
            for position, future in enumerate(concurrent.futures.as_completed(futures), 1):
                self.learners.append(future.result())
                if position % 25 == 0 or position == self.args.students:
                    print(f"PROVISION {position}/{self.args.students}", flush=True)
        self.learners.sort(key=lambda learner: learner.index)

    def observe_request(
        self,
        learner: Learner,
        stage: str,
        operation: str,
        method: str,
        path: str,
        *,
        expected: tuple[int, ...] = (200,),
        timeout: float = 60,
        **kwargs: Any,
    ) -> requests.Response | None:
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = learner.session.request(
                method,
                f"{self.base_url}{path}",
                timeout=timeout,
                **kwargs,
            )
            ok = response.status_code in expected
            error = None if ok else compact_error(response.text)
        except Exception as error_value:  # noqa: BLE001 - load reports must retain failures
            ok = False
            error = compact_error(error_value)
        latency = (time.perf_counter() - started) * 1000
        self.recorder.add(
            Observation(
                stage=stage,
                operation=operation,
                learner=learner.name,
                ok=ok,
                latency_ms=latency,
                status=response.status_code if response is not None else None,
                size=len(response.content) if response is not None else 0,
                error=error,
            )
        )
        return response

    def content_paths(self) -> list[tuple[str, str]]:
        if self.dojo_reference is None:
            raise RuntimeError("fixture not created")
        paths = [
            ("student-home", "/student"),
            ("course-list", "/dojos?tab=mine"),
            ("course-detail", f"/{self.dojo_reference}"),
            ("course-learning", f"/dojo/{self.dojo_reference}/learning"),
            ("guide-page", "/guide"),
            ("learning-dashboard", "/learning/dashboard"),
            ("learning-extend", "/learning/extend"),
            ("profile", "/hacker/"),
            ("settings", "/settings"),
            ("workspace-page", "/workspace"),
            ("ui-bootstrap", "/pwncollege_api/v1/ui/bootstrap?mode=learning&path=/student"),
            ("learning-overview", "/pwncollege_api/v1/learning/overview?view=home"),
            ("guide-context", "/pwncollege_api/v1/learning/guide"),
            ("workspace-state", "/pwncollege_api/v1/workspace"),
        ]
        paths.extend(
            (
                f"challenge-{module_index}-{challenge_index}",
                f"/{self.dojo_reference}/module-{module_index}/challenge-{module_index}-{challenge_index}",
            )
            for module_index in range(1, 4)
            for challenge_index in range(1, 3)
        )
        return paths

    def run_content_for(self, learner: Learner, barrier: threading.Barrier) -> None:
        barrier.wait()
        for operation, path in self.content_paths():
            self.observe_request(learner, "content", operation, "GET", path, timeout=90)
        created = self.observe_request(
            learner,
            "functions",
            "guide-thread-create",
            "POST",
            "/pwncollege_api/v1/learning/guide/threads",
            json={},
            expected=(201,),
            timeout=60,
        )
        payload = safe_json(created) if created is not None else {}
        learner.thread_id = str(((payload.get("thread") or {}).get("id")) or "") or None
        if not learner.thread_id:
            return
        thread_path = f"/pwncollege_api/v1/learning/guide/threads/{learner.thread_id}"
        for operation, action, extra in (
            ("guide-thread-rename", "rename", {"title": "并发验证会话"}),
            ("guide-thread-pin", "pin", {}),
            ("guide-thread-unpin", "unpin", {}),
            ("guide-thread-archive", "archive", {}),
            ("guide-thread-restore", "restore", {}),
        ):
            self.observe_request(
                learner,
                "functions",
                operation,
                "PATCH",
                thread_path,
                json={"action": action, **extra},
                timeout=60,
            )

    def run_content(self) -> None:
        barrier = threading.Barrier(len(self.learners))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(self.learners)) as pool:
            futures = [pool.submit(self.run_content_for, learner, barrier) for learner in self.learners]
            for future in concurrent.futures.as_completed(futures):
                future.result()

    def start_workspace_for(self, learner: Learner, barrier: threading.Barrier) -> None:
        barrier.wait()
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = learner.session.post(
                f"{self.base_url}/pwncollege_api/v1/docker",
                json={
                    "dojo": self.dojo_reference,
                    "module": "module-1",
                    "challenge": "challenge-1-1",
                },
                timeout=self.args.workspace_timeout,
            )
            payload = safe_json(response)
            ok = response.status_code == 200 and payload.get("success") is True
            error = None if ok else compact_error(payload.get("error") or response.text)
        except Exception as error_value:  # noqa: BLE001
            ok = False
            error = compact_error(error_value)
        self.recorder.add(
            Observation(
                stage="workspace",
                operation="start",
                learner=learner.name,
                ok=ok,
                latency_ms=(time.perf_counter() - started) * 1000,
                status=response.status_code if response is not None else None,
                size=len(response.content) if response is not None else 0,
                error=error,
            )
        )

    def run_workspace_start(self, learners: list[Learner]) -> None:
        barrier = threading.Barrier(len(learners))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(learners)) as pool:
            futures = [pool.submit(self.start_workspace_for, learner, barrier) for learner in learners]
            for future in concurrent.futures.as_completed(futures):
                future.result()
        expected_names = {f"user_{learner.user_id}" for learner in learners if learner.user_id}
        running_names = set(
            self.inner(
                "ps",
                "--filter",
                "name=user_",
                "--format",
                "{{.Names}}",
                timeout=60,
                check=False,
            ).stdout.splitlines()
        )
        self.workspace_count_after_start = len(expected_names & running_names)

    def workspace_target(self, value: str) -> tuple[str, dict[str, str]]:
        parsed = urllib.parse.urlsplit(value)
        if parsed.hostname != self.workspace_host:
            raise RuntimeError(f"unexpected workspace host {parsed.hostname!r}")
        port = self.workspace_port
        netloc = f"{self.parsed_base.hostname}:{port}"
        url = urllib.parse.urlunsplit(("https", netloc, parsed.path, parsed.query, ""))
        return url, {"Host": self.workspace_host}

    def service_for(self, learner: Learner, service: str) -> tuple[dict[str, Any], requests.Response]:
        deadline = time.monotonic() + self.args.service_timeout
        last_error = "service did not become ready"
        while time.monotonic() < deadline:
            remaining = max(1, deadline - time.monotonic())
            response = learner.session.get(
                f"{self.base_url}/pwncollege_api/v1/workspace",
                params={"service": service},
                timeout=(10, min(remaining, 300)),
            )
            payload = safe_json(response)
            if response.status_code != 200:
                last_error = f"workspace API {response.status_code}"
                time.sleep(1)
                continue
            if not payload.get("success") or not payload.get("iframe_src"):
                last_error = compact_error(payload.get("error") or "no signed service URL")
                time.sleep(1)
                continue
            target, headers = self.workspace_target(str(payload["iframe_src"]))
            direct = requests.Session()
            direct.verify = False
            direct.trust_env = False
            try:
                page = direct.get(
                    target,
                    headers=headers,
                    timeout=60,
                    allow_redirects=True,
                )
            finally:
                direct.close()
            if page.status_code == 200 and page.content:
                return payload, page
            last_error = f"service page {page.status_code}"
            time.sleep(1)
        raise TimeoutError(last_error)

    def verify_service_for(self, learner: Learner, service: str, barrier: threading.Barrier) -> None:
        barrier.wait()
        started = time.perf_counter()
        payload: dict[str, Any] | None = None
        page: requests.Response | None = None
        try:
            payload, page = self.service_for(learner, service)
            if service == "code":
                text = page.text.lower()
                ok = any(marker in text for marker in ("workbench", "code-server", "vscode"))
                if not ok:
                    raise RuntimeError("VS Code workbench markers missing")
            else:
                if "aisecedu-workspace-bridge.js" not in page.text:
                    raise RuntimeError("Desktop keyboard/clipboard bridge missing")
            error = None
            ok = True
        except Exception as error_value:  # noqa: BLE001
            ok = False
            error = compact_error(error_value)
        self.recorder.add(
            Observation(
                stage="workspace",
                operation=f"{service}-ready",
                learner=learner.name,
                ok=ok,
                latency_ms=(time.perf_counter() - started) * 1000,
                status=page.status_code if page is not None else None,
                size=len(page.content) if page is not None else 0,
                error=error,
                metadata={"iframe": bool(payload and payload.get("iframe_src"))},
            )
        )

    def run_service_readiness(self, learners: list[Learner], service: str) -> None:
        barrier = threading.Barrier(len(learners))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(learners)) as pool:
            futures = [pool.submit(self.verify_service_for, learner, service, barrier) for learner in learners]
            for future in concurrent.futures.as_completed(futures):
                future.result()

    def desktop_socket_for(self, learner: Learner, barrier: threading.Barrier) -> None:
        barrier.wait()
        started = time.perf_counter()
        sock: websocket.WebSocket | None = None
        try:
            payload, _ = self.service_for(learner, "desktop")
            parsed = urllib.parse.urlsplit(str(payload["iframe_src"]))
            desktop_path = (urllib.parse.parse_qs(parsed.query).get("path") or [None])[0]
            if not desktop_path:
                raise RuntimeError("Desktop WebSocket path missing")
            target = urllib.parse.urljoin(
                f"wss://{self.parsed_base.hostname}:{self.workspace_port}",
                desktop_path,
            )
            sock = websocket.create_connection(
                target,
                timeout=30,
                origin=f"https://{self.workspace_host}",
                host=self.workspace_host,
                subprotocols=["binary"],
                sslopt={"cert_reqs": ssl.CERT_NONE, "check_hostname": False},
            )
            greeting = sock.recv()
            if isinstance(greeting, str):
                greeting = greeting.encode()
            if not bytes(greeting or b"").startswith(b"RFB "):
                raise RuntimeError(f"unexpected RFB greeting {bytes(greeting or b'')[:32]!r}")
            ready_latency = (time.perf_counter() - started) * 1000
            self.recorder.add(
                Observation(
                    stage="workspace",
                    operation="desktop-websocket",
                    learner=learner.name,
                    ok=True,
                    latency_ms=ready_latency,
                    status=101,
                    metadata={"greeting": bytes(greeting).decode(errors="replace").strip()},
                )
            )
            time.sleep(self.args.socket_hold_seconds)
        except Exception as error_value:  # noqa: BLE001
            self.recorder.add(
                Observation(
                    stage="workspace",
                    operation="desktop-websocket",
                    learner=learner.name,
                    ok=False,
                    latency_ms=(time.perf_counter() - started) * 1000,
                    error=compact_error(error_value),
                )
            )
        finally:
            if sock is not None:
                sock.close()

    def run_desktop_sockets(self, learners: list[Learner]) -> None:
        barrier = threading.Barrier(len(learners))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(learners)) as pool:
            futures = [pool.submit(self.desktop_socket_for, learner, barrier) for learner in learners]
            for future in concurrent.futures.as_completed(futures):
                future.result()

    def agent_for(self, learner: Learner, barrier: threading.Barrier) -> None:
        barrier.wait()
        question = "请根据我的课程状态给出一条不超过20字的下一步学习建议，不要调用外部工具。"
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = learner.session.post(
                f"{self.base_url}/pwncollege_api/v1/learning/guide",
                json={"question": question, "threadId": learner.thread_id},
                timeout=self.args.agent_timeout,
            )
            payload = safe_json(response)
            message = payload.get("message") or {}
            content = str(message.get("content") or "").strip()
            metadata = message.get("metadata") or {}
            provider = str(metadata.get("provider") or payload.get("provider") or "")
            ok = (
                response.status_code == 200
                and payload.get("success") is True
                and bool(content)
                and provider.startswith("MODEL")
            )
            error = None if ok else compact_error(payload.get("error") or response.text)
            extra = {"provider": provider or None, "characters": len(content)}
        except Exception as error_value:  # noqa: BLE001
            ok = False
            error = compact_error(error_value)
            extra = {}
        self.recorder.add(
            Observation(
                stage="agent",
                operation="guide-generate",
                learner=learner.name,
                ok=ok,
                latency_ms=(time.perf_counter() - started) * 1000,
                status=response.status_code if response is not None else None,
                size=len(response.content) if response is not None else 0,
                error=error,
                metadata=extra,
            )
        )

    def run_agents(self, learners: list[Learner]) -> None:
        barrier = threading.Barrier(len(learners))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(learners)) as pool:
            futures = [pool.submit(self.agent_for, learner, barrier) for learner in learners]
            for future in concurrent.futures.as_completed(futures):
                future.result()

    def collect_monitor_sample(self) -> dict[str, Any]:
        sample: dict[str, Any] = {
            "timestamp": time.time(),
            "loadAverage": list(os.getloadavg()),
        }
        try:
            meminfo = pathlib.Path("/proc/meminfo").read_text()
            values = {
                key: int(value)
                for key, value in re.findall(r"^(MemAvailable|MemTotal|SwapFree|SwapTotal):\s+(\d+)", meminfo, re.M)
            }
            sample["hostMemory"] = values
        except OSError as error:
            sample["hostMemoryError"] = compact_error(error)
        try:
            shared_memory = self.outer(
                "df",
                "-Pk",
                "/dev/shm",
                timeout=30,
                check=False,
            )
            lines = [line for line in shared_memory.stdout.splitlines() if line.strip()]
            if shared_memory.returncode != 0 or len(lines) < 2:
                raise RuntimeError(shared_memory.stderr.strip() or "df returned no data")
            fields = lines[-1].split()
            if len(fields) < 6:
                raise RuntimeError(f"unexpected df output: {lines[-1]}")
            sample["outerSharedMemory"] = {
                "totalKiB": int(fields[-5]),
                "usedKiB": int(fields[-4]),
                "availableKiB": int(fields[-3]),
                "usedPercent": int(fields[-2].rstrip("%")),
            }
        except Exception as error:  # noqa: BLE001
            sample["outerSharedMemoryError"] = compact_error(error)
        try:
            output = self.inner(
                "stats",
                "--no-stream",
                "--format",
                "{{json .}}",
                "ctfd",
                "nginx",
                "db",
                "pgbouncer",
                "cache",
                "agent-runtime",
                timeout=30,
                check=False,
            ).stdout
            sample["services"] = [json.loads(line) for line in output.splitlines() if line.strip()]
            workspaces = self.inner(
                "ps",
                "--filter",
                "name=user_",
                "--format",
                "{{.Names}}",
                timeout=30,
                check=False,
            ).stdout.splitlines()
            sample["workspaceCount"] = len([name for name in workspaces if name.startswith("user_")])
        except Exception as error:  # noqa: BLE001
            sample["dockerError"] = compact_error(error)
        return sample

    def monitor(self) -> None:
        while not self.monitor_stop.is_set():
            try:
                self.monitor_samples.append(self.collect_monitor_sample())
            except Exception as error:  # noqa: BLE001
                self.monitor_samples.append({"timestamp": time.time(), "error": compact_error(error)})
            self.monitor_stop.wait(self.args.monitor_interval)

    def start_monitor(self) -> None:
        self.monitor_thread = threading.Thread(target=self.monitor, name="load-monitor", daemon=True)
        self.monitor_thread.start()

    def stop_monitor(self) -> None:
        self.monitor_stop.set()
        if self.monitor_thread:
            self.monitor_thread.join(timeout=30)
        self.monitor_samples.append(self.collect_monitor_sample())

    def stop_workspace_for(self, learner: Learner) -> None:
        try:
            learner.session.delete(
                f"{self.base_url}/pwncollege_api/v1/docker",
                json={},
                timeout=180,
            )
        except requests.RequestException as error:
            self.cleanup_errors.append(f"workspace {learner.name}: {compact_error(error)}")

    def cleanup_homes(self, learners: list[Learner]) -> None:
        ids = [str(learner.user_id) for learner in learners if learner.user_id]
        if not ids:
            return
        if any(not re.fullmatch(r"[1-9][0-9]*", value) for value in ids):
            raise ValueError("unsafe generated home id")
        for value in ids:
            self.inner("volume", "rm", value, timeout=30, check=False)
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
        result = self.inner(
            "exec",
            "homefs",
            "sh",
            "-c",
            script,
            "cleanup-homes",
            *ids,
            timeout=max(180, len(ids) * 2),
            check=False,
        )
        if result.returncode != 0:
            self.cleanup_errors.append(f"home cleanup: {compact_error(result.stderr)}")

    def cleanup(self) -> None:
        if self.learners:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(48, len(self.learners))) as pool:
                list(pool.map(self.stop_workspace_for, self.learners))
            for learner in self.learners:
                if learner.user_id:
                    self.inner("rm", "-f", f"user_{learner.user_id}", timeout=60, check=False)
            self.cleanup_homes(self.learners)
        if self.admin is not None:
            for learner in self.learners:
                if not learner.user_id:
                    continue
                try:
                    response = self.admin.delete(
                        f"{self.base_url}/api/v1/users/{learner.user_id}",
                        json={},
                        timeout=60,
                    )
                    if response.status_code != 200 or not safe_json(response).get("success"):
                        self.cleanup_errors.append(f"user {learner.user_id}: HTTP {response.status_code}")
                except requests.RequestException as error:
                    self.cleanup_errors.append(f"user {learner.user_id}: {compact_error(error)}")
        if self.admin is not None and self.dojo_reference:
            try:
                response = self.admin.post(
                    f"{self.base_url}/dojo/{self.dojo_reference}/delete/",
                    json={"dojo": self.dojo_reference},
                    timeout=120,
                )
                if response.status_code != 200 or not safe_json(response).get("success"):
                    self.cleanup_errors.append(f"course delete: HTTP {response.status_code}")
                match = re.fullmatch(r"load-e2e-[0-9A-Za-z-]{8,32}~([0-9a-f]{8})", self.dojo_reference)
                if not match:
                    self.cleanup_errors.append("course path cleanup skipped: unsafe reference")
                else:
                    self.outer("rm", "-rf", f"/data/dojos/{match.group(1)}", timeout=60, check=False)
            except requests.RequestException as error:
                self.cleanup_errors.append(f"course delete: {compact_error(error)}")
        for learner in self.learners:
            learner.session.close()
        if self.admin is not None:
            self.admin.close()

    def assess(self, summaries: dict[str, Any]) -> list[dict[str, Any]]:
        requirements = {
            "content": {"minimumRate": 0.99, "maximumP95Ms": 5000},
            "functions": {"minimumRate": 0.99, "maximumP95Ms": 5000},
            "workspace:start": {"minimumRate": 0.99, "maximumP95Ms": 300000},
            "workspace:code-ready": {"minimumRate": 0.99, "maximumP95Ms": 300000},
            "workspace:desktop-ready": {"minimumRate": 0.99, "maximumP95Ms": 240000},
            "workspace:desktop-websocket": {"minimumRate": 0.99, "maximumP95Ms": 120000},
            "agent:guide-generate": {"minimumRate": 0.95, "maximumP95Ms": 600000},
        }
        failures: list[dict[str, Any]] = []
        for key, result in summaries.items():
            scope = result["stage"] if result["stage"] in {"content", "functions"} else key
            requirement = requirements.get(scope)
            if not requirement:
                continue
            reasons = []
            if result["successRate"] < requirement["minimumRate"]:
                reasons.append(
                    f"successRate={result['successRate']} below {requirement['minimumRate']}"
                )
            if (result["p95Ms"] or 0) > requirement["maximumP95Ms"]:
                reasons.append(f"p95Ms={result['p95Ms']} above {requirement['maximumP95Ms']}")
            if reasons:
                failures.append({"operation": key, "reasons": reasons})
        if self.workspace_count_after_start < self.args.workspace_students:
            failures.append(
                {
                    "operation": "workspace:capacity",
                    "reasons": [
                        f"running={self.workspace_count_after_start} below requested={self.args.workspace_students}"
                    ],
                }
            )
        return failures

    def report(self) -> dict[str, Any]:
        rows = self.recorder.rows
        summaries = summarize(rows)
        failures = self.assess(summaries)
        provider_counts = Counter(
            str(row.metadata.get("provider") or "unknown")
            for row in rows
            if row.stage == "agent" and row.ok
        )
        maximum_workspaces = max(
            (int(sample.get("workspaceCount") or 0) for sample in self.monitor_samples),
            default=0,
        )
        return {
            "schemaVersion": 1,
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "runId": self.run_id,
            "baseUrl": self.base_url,
            "configuration": {
                "students": self.args.students,
                "workspaceStudents": self.args.workspace_students,
                "agentStudents": self.args.agent_students,
                "socketHoldSeconds": self.args.socket_hold_seconds,
                "cleanup": not self.args.keep_fixtures,
            },
            "fixture": {
                "course": self.dojo_reference,
                "learnerCount": len(self.learners),
            },
            "summary": summaries,
            "agentProviders": dict(provider_counts),
            "observability": {
                "samples": self.monitor_samples,
                "maximumWorkspaceCount": maximum_workspaces,
                "workspaceCountAfterStart": self.workspace_count_after_start,
            },
            "failures": failures,
            "cleanupErrors": self.cleanup_errors,
            "passed": not failures and not self.cleanup_errors,
            "durationSeconds": round(time.time() - self.started_at, 1),
        }

    def write_report(self, report: dict[str, Any]) -> pathlib.Path:
        output = self.args.output
        if output is None:
            output = ROOT / "output" / f"high-concurrency-{self.run_id}.json"
        elif not output.is_absolute():
            output = ROOT / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        return output

    def run(self) -> tuple[dict[str, Any], pathlib.Path]:
        self.start_monitor()
        report: dict[str, Any] | None = None
        try:
            print("STAGE fixture", flush=True)
            self.create_fixture()
            print("STAGE provision", flush=True)
            self.provision_learners()
            print("STAGE content", flush=True)
            self.run_content()
            workspace_learners = self.learners[: self.args.workspace_students]
            print(f"STAGE workspace-start learners={len(workspace_learners)}", flush=True)
            self.run_workspace_start(workspace_learners)
            print("STAGE code-ready", flush=True)
            self.run_service_readiness(workspace_learners, "code")
            print("STAGE desktop-ready", flush=True)
            self.run_service_readiness(workspace_learners, "desktop")
            print("STAGE desktop-websocket", flush=True)
            self.run_desktop_sockets(workspace_learners)
            agent_learners = self.learners[: self.args.agent_students]
            print(f"STAGE agent learners={len(agent_learners)}", flush=True)
            self.run_agents(agent_learners)
        finally:
            self.stop_monitor()
            if not self.args.keep_fixtures:
                print("STAGE cleanup", flush=True)
                self.cleanup()
            report = self.report()
            output = self.write_report(report)
            print(json.dumps({"passed": report["passed"], "output": str(output)}, ensure_ascii=False), flush=True)
        return report, output


def bounded_count(parser: argparse.ArgumentParser, name: str, value: int, maximum: int) -> None:
    if value < 1 or value > maximum:
        parser.error(f"{name} must be between 1 and {maximum}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--dojo-host", default=os.getenv("DOJO_HOST", DEFAULT_DOJO_HOST))
    parser.add_argument("--workspace-host", default=os.getenv("WORKSPACE_HOST", DEFAULT_WORKSPACE_HOST))
    parser.add_argument("--workspace-port", type=int, default=int(os.getenv("WORKSPACE_HTTPS_PORT", DEFAULT_WORKSPACE_PORT)))
    parser.add_argument("--container", default=DEFAULT_CONTAINER)
    parser.add_argument("--students", type=int, default=300)
    parser.add_argument("--workspace-students", type=int, default=300)
    parser.add_argument("--agent-students", type=int, default=100)
    parser.add_argument("--workspace-timeout", type=float, default=900)
    parser.add_argument("--service-timeout", type=float, default=900)
    parser.add_argument("--agent-timeout", type=float, default=900)
    parser.add_argument("--socket-hold-seconds", type=float, default=15)
    parser.add_argument("--monitor-interval", type=float, default=5)
    parser.add_argument("--run-id")
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--keep-fixtures", action="store_true")
    args = parser.parse_args()
    bounded_count(parser, "students", args.students, 500)
    bounded_count(parser, "workspace-students", args.workspace_students, args.students)
    bounded_count(parser, "agent-students", args.agent_students, args.students)
    if args.monitor_interval < 1:
        parser.error("monitor interval must be at least 1 second")
    return args


def main() -> None:
    args = parse_args()
    verifier = Verifier(args)
    report, _ = verifier.run()
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()

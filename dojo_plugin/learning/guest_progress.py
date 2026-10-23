import datetime
import json
import time

import docker

from .evidence import append_evidence


STATE_PATH = "/var/lib/windows-lab/guest-progress.json"
SYNC_INTERVAL_SECONDS = 15
STALE_SECONDS = 300

WORK_COPY_LABELS = (
    ("demoPatched", "demo.exe"),
    ("method1Patched", "method1.exe"),
    ("method2Patched", "method2.exe"),
)

PENDING_LABELS = {
    "demoPatched": "demo.exe 还没改动",
    "method1Patched": "method1.exe 还没改动",
    "method2Patched": "method2.exe 还没改动",
    "flagFilePresent": "客户机内检查还没写出 flag",
}


def read_guest_progress(container):
    if container is None:
        return None
    try:
        exit_code, output = container.exec_run(
            ["/bin/sh", "-c", f"cat {STATE_PATH} 2>/dev/null || true"],
            user="0",
            demux=False,
        )
    except (docker.errors.DockerException, AttributeError, OSError):
        return None
    if exit_code != 0:
        return None
    text = (output or b"").decode("utf-8", errors="replace").strip()
    if not text:
        return None
    try:
        snapshot = json.loads(text)
    except ValueError:
        return None
    return snapshot if isinstance(snapshot, dict) else None


def _snapshot_age(snapshot):
    stamp = str((snapshot or {}).get("updatedAt") or "")
    try:
        parsed = datetime.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=datetime.timezone.utc
        )
    except ValueError:
        return None
    now = datetime.datetime.now(datetime.timezone.utc)
    return (now - parsed).total_seconds()


def guest_progress_view(snapshot):
    if not isinstance(snapshot, dict) or not snapshot:
        return None
    age = _snapshot_age(snapshot)
    work_copies = snapshot.get("workCopies") or {}
    pending = [
        PENDING_LABELS[key]
        for key, _ in WORK_COPY_LABELS
        if not work_copies.get(key)
    ]
    if not snapshot.get("flagFilePresent"):
        pending.append(PENDING_LABELS["flagFilePresent"])
    return {
        "available": bool(snapshot.get("ready")) and (age is None or age <= STALE_SECONDS),
        "ready": bool(snapshot.get("ready")),
        "os": snapshot.get("os"),
        "updatedAt": snapshot.get("updatedAt"),
        "ageSeconds": None if age is None else round(age, 1),
        "summary": snapshot.get("summary"),
        "workCopies": {
            "demoPatched": bool(work_copies.get("demoPatched")),
            "method1Patched": bool(work_copies.get("method1Patched")),
            "method2Patched": bool(work_copies.get("method2Patched")),
        },
        "flagFilePresent": bool(snapshot.get("flagFilePresent")),
        "studentHasStarted": bool(snapshot.get("studentHasStarted")),
        "modifiedFiles": list(snapshot.get("observations") or []),
        "pendingSteps": pending,
        "probeMask": snapshot.get("probeMask"),
        "error": snapshot.get("error"),
    }


def _append_transitions(attempt, previous, snapshot):
    before = (previous or {}).get("workCopies") or {}
    after = snapshot.get("workCopies") or {}
    for key, label in WORK_COPY_LABELS:
        if after.get(key) and not before.get(key):
            append_evidence(
                attempt,
                "workspace.file.saved",
                {
                    "file": label,
                    "change": "modified-inside-guest",
                    "probeMask": snapshot.get("probeMask"),
                },
                source="WORKSPACE",
                trust_level=3,
            )
    if snapshot.get("flagFilePresent") and not (previous or {}).get("flagFilePresent"):
        append_evidence(
            attempt,
            "milestone.observed",
            {"objective": "guest-checker-produced-flag", "satisfied": True},
            source="WORKSPACE",
            trust_level=4,
        )
    if not previous and after:
        append_evidence(
            attempt,
            "runtime.state.snapshot",
            {
                "runtime": "remote-guest",
                "ready": bool(snapshot.get("ready")),
                "os": snapshot.get("os"),
            },
            source="WORKSPACE",
            trust_level=3,
        )


def sync_guest_progress(attempt, container, *, force=False):
    if attempt is None or container is None:
        return guest_progress_view((getattr(attempt, "data", None) or {}).get("guestProgress"))
    data = dict(attempt.data or {})
    cached = data.get("guestProgress") or {}
    now = time.time()
    if not force:
        last = data.get("guestProgressSyncedAt")
        if last and now - float(last) < SYNC_INTERVAL_SECONDS:
            return guest_progress_view(cached)
    snapshot = read_guest_progress(container)
    data["guestProgressSyncedAt"] = now
    if snapshot is None:
        if data != (attempt.data or {}):
            attempt.data = data
        return guest_progress_view(cached)
    try:
        _append_transitions(attempt, cached, snapshot)
    except Exception:
        pass
    data["guestProgress"] = snapshot
    attempt.data = data
    return guest_progress_view(snapshot)


def cached_guest_progress(attempt):
    if attempt is None:
        return None
    return guest_progress_view((getattr(attempt, "data", None) or {}).get("guestProgress"))

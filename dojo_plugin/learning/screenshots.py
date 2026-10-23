import base64
import datetime
import io
import json
import os
import pathlib
import struct
import tarfile
import time

import docker

from ..runtime_profiles import container_runtime_profile


SCREENSHOT_DIR = pathlib.Path(
    os.getenv("DOJO_TUTOR_SCREENSHOT_DIR") or "/data/tutor-screenshots"
)
CAPTURE_SCRIPT = "/usr/local/lib/windows-lab/screenshot.py"
CONTAINER_PATH = "/tmp/aisecedu-tutor-screenshot.png"
CAPTURE_TIMEOUT_SECONDS = 20.0
MAX_BYTES = 8 * 1024 * 1024
RETENTION_PER_ATTEMPT = 12


def _runtime_profile(container):
    try:
        return container_runtime_profile(container)
    except (docker.errors.DockerException, AttributeError, OSError, KeyError):
        return None


def _capture_supported(container):
    profile = _runtime_profile(container)
    if profile is None or not getattr(profile, "is_windows", False):
        return False
    try:
        exit_code, output = container.exec_run(
            ["/bin/sh", "-c", f"test -f {CAPTURE_SCRIPT} && test -S /var/lib/windows-lab/qmp.sock"],
            user="0",
            demux=False,
        )
    except (docker.errors.DockerException, AttributeError, OSError):
        return False
    return exit_code == 0


def _read_png(container, path):
    try:
        stream, _stat = container.get_archive(path)
    except (docker.errors.DockerException, AttributeError, OSError):
        return None
    payload = io.BytesIO()
    for chunk in stream:
        payload.write(chunk)
        if payload.tell() > MAX_BYTES:
            return None
    payload.seek(0)
    try:
        with tarfile.open(fileobj=payload) as archive:
            member = next(
                (item for item in archive.getmembers() if item.isfile()), None
            )
            if member is None:
                return None
            handle = archive.extractfile(member)
            return handle.read() if handle else None
    except (tarfile.TarError, OSError):
        return None


def _png_dimensions(payload):
    if len(payload) < 24 or payload[:8] != b"\x89PNG\r\n\x1a\n":
        return (None, None)
    width, height = struct.unpack(">II", payload[16:24])
    return (width, height)


def _prune(directory):
    try:
        shots = sorted(directory.glob("*.png"))
    except OSError:
        return
    for stale in shots[:-RETENTION_PER_ATTEMPT]:
        try:
            stale.unlink()
        except OSError:
            pass


def _store(attempt, payload):
    directory = SCREENSHOT_DIR / str(attempt.id)
    try:
        directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        target = directory / f"{stamp}.png"
        target.write_bytes(payload)
        _prune(directory)
        return target
    except OSError:
        return None


def capture_workspace_screenshot(attempt, container, *, timeout=CAPTURE_TIMEOUT_SECONDS):
    """Grab the learner's current remote-desktop framebuffer for tutor context."""
    started = time.monotonic()

    def result(available, reason, **extra):
        view = {
            "available": available,
            "reason": reason,
            "capturedAt": datetime.datetime.now(datetime.timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "elapsedMs": round((time.monotonic() - started) * 1000, 1),
        }
        view.update(extra)
        return view

    if attempt is None or container is None:
        return result(False, "NO_CONTAINER")
    if not _capture_supported(container):
        return result(False, "RUNTIME_UNSUPPORTED")
    try:
        exit_code, output = container.exec_run(
            [
                "python3",
                CAPTURE_SCRIPT,
                "--output",
                CONTAINER_PATH,
                "--timeout",
                str(max(1.0, float(timeout))),
            ],
            user="0",
            demux=False,
        )
    except (docker.errors.DockerException, AttributeError, OSError) as error:
        return result(False, "CAPTURE_FAILED", detail=str(error)[:200])
    if exit_code != 0:
        detail = (output or b"").decode("utf-8", errors="replace").strip()[:200]
        return result(False, "CAPTURE_FAILED", detail=detail)
    metadata = {}
    text = (output or b"").decode("utf-8", errors="replace").strip().splitlines()
    if text:
        try:
            metadata = json.loads(text[-1])
        except ValueError:
            metadata = {}
    payload = _read_png(container, CONTAINER_PATH)
    if not payload:
        return result(False, "CAPTURE_EMPTY")
    width, height = _png_dimensions(payload)
    stored = _store(attempt, payload)
    return result(
        True,
        "OK",
        path=str(stored) if stored else None,
        bytes=len(payload),
        width=metadata.get("width") or width,
        height=metadata.get("height") or height,
        dataUrl="data:image/png;base64," + base64.b64encode(payload).decode("ascii"),
    )

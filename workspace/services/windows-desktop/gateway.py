import base64
import hashlib
import json
import os
import pathlib
import socket
import socketserver
import struct
import threading
import time
import uuid


STATE = pathlib.Path("/var/lib/windows-lab")
SOCKET = "/run/windows-runtime.sock"
SERIAL_LOCK = threading.Lock()
READY = threading.Event()
STATUS = {"ok": False, "message": "Windows is starting"}
SERVICES = {}
INTEGRITY = {}
BOOT_TIMEOUT = max(60, min(1800, int(os.environ.get("DOJO_WINDOWS_BOOT_TIMEOUT_SECONDS", "240"))))
ROOT = pathlib.Path(__file__).resolve().parent


def rpc(request):
    request = {**request, "id": uuid.uuid4().hex}
    with SERIAL_LOCK, socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(120 if request.get("operation") == "start-services" else 30)
        connection.connect(str(STATE / "agent.sock"))
        connection.sendall(json.dumps(request).encode() + b"\n")
        with connection.makefile("rb") as stream:
            while True:
                line = stream.readline(500001)
                if not line or len(line) > 500000:
                    raise RuntimeError("Invalid Windows agent response")
                response = json.loads(line)
                if response.get("id") == request["id"]:
                    if not response.get("ok"):
                        raise RuntimeError(response.get("error") or "Windows runtime operation failed")
                    return response


def transfer_file(relative, content):
    expected = hashlib.sha256(content).hexdigest()
    for offset in range(0, max(1, len(content)), 1024):
        response = rpc({"operation": "file", "path": relative, "chunk": True, "offset": offset, "content": base64.b64encode(content[offset:offset + 1024]).decode()})
    if response.get("sha256") != expected:
        raise RuntimeError("Windows course file transfer verification failed")
    return expected


def install_native_checker():
    relative = "_aisecedu_check_" + uuid.uuid4().hex + ".exe"
    transfer_file(relative, (ROOT / "guest-check.exe").read_bytes())
    wrapper = base64.b64encode((ROOT / "guest-check.cmd").read_bytes()).decode()
    command = (
        "$ErrorActionPreference = 'Stop'; "
        f"$source = 'C:\\Course\\{relative}'; "
        "$target = 'C:\\ProgramData\\AISecEdu\\check-native.exe'; "
        "Move-Item -LiteralPath $source -Destination $target -Force; "
        "Remove-Item 'C:\\Course\\check.cmd' -Force -ErrorAction SilentlyContinue; "
        f"[IO.File]::WriteAllBytes('C:\\Course\\check.cmd', [Convert]::FromBase64String('{wrapper}')); "
        "Write-Output 'Native course checker ready'"
    )
    job = rpc({"operation": "exec", "command": command})["job"]
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        result = rpc({"operation": "job", "job": job})
        if result.get("done"):
            if result.get("exitCode") != 0:
                raise RuntimeError("Native course checker installation failed: " + str(result.get("stderr") or "")[-2000:])
            return
        time.sleep(0.5)
    raise RuntimeError("Native course checker installation timed out")


def bootstrap():
    try:
        deadline = time.monotonic() + BOOT_TIMEOUT
        while True:
            try:
                info = rpc({"operation": "hello"})
                break
            except (OSError, ValueError, RuntimeError):
                if time.monotonic() >= deadline:
                    raise RuntimeError("Windows course agent did not become ready")
                time.sleep(2)
        manifest_path = pathlib.Path("/challenge/runtime-public.json")
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"files": [], "services": []}
        files = manifest.get("files") or []
        if len(files) > 100:
            raise RuntimeError("Course package exceeds the file count limit")
        for item in files:
            relative = str(item["path"])
            content = str(item.get("content") or "").encode("utf-8-sig" if relative.lower().endswith(".ps1") else "utf-8")
            INTEGRITY[relative] = transfer_file(relative, content)
        requested_services = manifest.get("services") or []
        response = rpc({"operation": "start-services", "services": requested_services})
        records = response.get("services") or {}
        for service in requested_services:
            record = records.get(service["name"])
            if not isinstance(record, dict) or not isinstance(record.get("pid"), int):
                raise RuntimeError("Windows did not return the service process identity")
            SERVICES[service["name"]] = {**service, **record}
        install_native_checker()
        STATUS.update(ok=True, message="Windows course files and services are ready", guest=info, fileCount=len(files), nativeChecker=True)
        (STATE / "ready.json").write_text(json.dumps(STATUS))
    except Exception as exc:
        STATUS.update(ok=False, message=str(exc))
        (STATE / "failed.json").write_text(json.dumps(STATUS))
    finally:
        READY.set()


def request_operation(request, uid):
    operation = request.get("operation")
    if uid not in {0, 1000}:
        raise ValueError("This runtime belongs to the course learner")
    if operation not in {"ready", "exec"} and uid != 0:
        raise ValueError("This operation belongs to the platform validator")
    if not READY.wait(BOOT_TIMEOUT + 120):
        raise RuntimeError("Windows is still starting")
    if operation == "ready":
        return STATUS
    if not STATUS["ok"]:
        raise RuntimeError(STATUS["message"])
    if operation == "exec":
        command = request.get("command")
        if not isinstance(command, str) or not 1 <= len(command) <= 16000:
            raise ValueError("A Windows command of up to 16000 characters is required")
        job = rpc({"operation": "exec", "command": command})["job"]
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            result = rpc({"operation": "job", "job": job})
            if result.get("done"):
                return result
            time.sleep(0.5)
        raise RuntimeError("Windows command timed out")
    if operation == "http":
        service = SERVICES.get(request.get("service"))
        binding = request.get("binding")
        if not service or not service.get("port") or not isinstance(binding, dict):
            raise ValueError("Unknown Windows service")
        path = str(binding.get("path") or "")
        if not path.startswith("/") or path.startswith("//") or len(path) > 512 or any(ord(c) <= 32 for c in path):
            raise ValueError("Invalid local service path")
        return rpc({
            "operation": "http", "service": service["name"],
            "pid": service["pid"], "startTime": service["startTime"],
            "port": service["port"], "binding": binding, "integrity": INTEGRITY,
        })
    raise ValueError("Unknown Windows runtime operation")


def check(arguments):
    if not isinstance(arguments, list) or len(arguments) > 16 or any(not isinstance(arg, str) or len(arg) > 1024 or "\0" in arg for arg in arguments):
        raise ValueError("Invalid check arguments")
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(30)
        connection.connect("/run/dojo-learning-check.sock")
        connection.sendall("\0".join(arguments).encode())
        connection.shutdown(socket.SHUT_WR)
        data = b""
        while len(data) <= 65536:
            block = connection.recv(4096)
            if not block:
                break
            data += block
    result = {"ok": data[:1] == b"\0", "message": data[1:].decode("utf-8")}
    if result["ok"]:
        target = pathlib.Path("/usr/share/novnc/lab-result.json")
        target.write_text(json.dumps({"flag": result["message"].strip()}))
        target.chmod(0o644)
    return result


def guest_checker():
    while True:
        try:
            with socket.socket(socket.AF_UNIX) as connection:
                connection.connect(str(STATE / "check.sock"))
                with connection.makefile("rwb") as stream:
                    while True:
                        line = stream.readline(20001)
                        if not line or len(line) > 20000:
                            break
                        try:
                            request = json.loads(line)
                            if request.get("operation") != "check":
                                raise ValueError("Unknown course check operation")
                            result = check(request.get("arguments") or [])
                        except Exception as exc:
                            result = {"ok": False, "message": str(exc)}
                        stream.write(json.dumps(result).encode() + b"\n")
                        stream.flush()
        except (OSError, ValueError):
            time.sleep(2)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(10)
        try:
            credentials = self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
            _, uid, _ = struct.unpack("3i", credentials)
            line = self.rfile.readline(20001)
            if len(line) > 20000:
                raise ValueError("Request exceeds limit")
            result = request_operation(json.loads(line), uid)
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
        self.wfile.write(json.dumps(result).encode() + b"\n")


class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True


if __name__ == "__main__":
    pathlib.Path(SOCKET).unlink(missing_ok=True)
    with Server(SOCKET, Handler) as server:
        os.chmod(SOCKET, 0o666)
        threading.Thread(target=bootstrap, daemon=True).start()
        threading.Thread(target=guest_checker, daemon=True).start()
        server.serve_forever()

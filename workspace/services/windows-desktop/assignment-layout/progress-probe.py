#!/usr/bin/python3
import argparse
import datetime
import json
import pathlib
import socket
import time

GUEST_PROBE_PATH = "C:\\Lab\\Environment\\progress-probe.py"
GUEST_PYTHON = "C:\\Python27\\python.exe"
GUEST_PROBE_SOURCE = """import sys
LAB = "C:/Lab/"
def differs(first, second):
    try:
        left = open(LAB + first, "rb").read()
        right = open(LAB + second, "rb").read()
    except IOError:
        return 0
    return 0 if left == right else 1
mask = 0
if differs("demo.exe", "demo-original.exe"):
    mask += 1
if differs("method1.exe", "crackme-original.exe"):
    mask += 2
if differs("method2.exe", "crackme-original.exe"):
    mask += 4
try:
    open(LAB + "flag.txt", "rb").close()
    mask += 8
except IOError:
    pass
sys.exit(mask)
"""

BITS = (
    ("demoPatched", 1, "demo.exe 已改动"),
    ("method1Patched", 2, "method1.exe 已改动"),
    ("method2Patched", 4, "method2.exe 已改动"),
    ("flagFilePresent", 8, "客户机内检查已经写出 flag"),
)


class Agent:
    def __init__(self, path):
        self.path = path
        self.channel = None

    def connect(self, deadline):
        while time.monotonic() < deadline:
            try:
                channel = socket.socket(socket.AF_UNIX)
                channel.settimeout(30)
                channel.connect(self.path)
                self.channel = channel
                return True
            except OSError:
                time.sleep(2)
        return False

    def _reply(self, timeout=20):
        self.channel.settimeout(timeout)
        stream = self.channel.makefile("rb")
        line = stream.readline(65536)
        if not line:
            raise TimeoutError("agent closed the channel")
        text = line.decode("utf-8", "replace").strip()
        if not text.startswith("OK "):
            raise ValueError(text[:200] or "empty reply")
        return json.loads(text[3:])

    def _resync(self):
        try:
            self.channel.sendall(b"\n\n\n\n")
        except OSError:
            return
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            try:
                self._reply(0.4)
            except Exception:
                return

    def request(self, payload, timeout=30, attempts=4):
        last = None
        for _ in range(attempts):
            try:
                self.channel.sendall(payload.encode() + b"\n")
                return self._reply(timeout)
            except Exception as error:
                last = error
                self._resync()
                time.sleep(0.3)
        raise RuntimeError(str(last))

    def write(self, path, content, chunk=256):
        encoded = path.encode("utf-8").hex()
        data = content.encode("utf-8")
        for offset in range(0, len(data), chunk):
            block = data[offset:offset + chunk]
            self.request(f"WRITE {encoded} {offset} {block.hex()}")
            time.sleep(0.002)

    def run(self, command, timeout=120):
        return self.request(f"RUN {command.encode('utf-8').hex()}", timeout=timeout)

    def close(self):
        channel = self.channel
        if channel is None:
            return
        # Drain before closing: a client that leaves replies queued can wedge
        # QEMU's single-client serial chardev and make the agent unreachable.
        try:
            self._resync()
            channel.settimeout(0.3)
            while True:
                try:
                    if not channel.recv(4096):
                        break
                except OSError:
                    break
            try:
                channel.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        finally:
            try:
                channel.close()
            except OSError:
                pass
            self.channel = None


def write_status(state, payload):
    payload = dict(payload)
    payload["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    target = state / "guest-progress.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.chmod(0o644)
    temporary.replace(target)


def probe_once(agent, state):
    ready = agent.request("READY", timeout=60)
    mask = None
    for _ in range(3):
        result = agent.run(f"{GUEST_PYTHON} {GUEST_PROBE_PATH}", timeout=180)
        code = int(result.get("exitCode") or 0)
        if 0 <= code <= 15:
            mask = code
            break
        time.sleep(1)
    if mask is None:
        write_status(state, {
            "ready": bool(ready.get("ready")),
            "os": ready.get("os"),
            "error": "probe-command-failed",
        })
        return
    changes = {name: bool(mask & bit) for name, bit, _ in BITS}
    payload = {
        "ready": bool(ready.get("ready")),
        "os": ready.get("os"),
        "ollydbgPresent": bool(ready.get("ollydbg")),
        "labFilesPresent": bool(ready.get("labFiles")),
        "labWritable": bool(ready.get("labWritable")),
        "probeMask": mask,
        "workCopies": changes,
        "observations": [note for name, bit, note in BITS if mask & bit],
        "notYetDone": {name: not value for name, value in changes.items()},
        "studentHasStarted": bool(mask & 0b111),
        "summary": (
            "规定的核验副本仍与原始文件相同；这不表示学生没有修改其他另存文件。请核对题目目录 check.cmd 显示的实际输入路径。"
            if not mask & 0b111
            else "客户机里已经改动的文件：" + "、".join(note for name, bit, note in BITS if mask & bit)
        ),
    }
    write_status(state, payload)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=pathlib.Path, default=pathlib.Path("/var/lib/windows-lab"))
    parser.add_argument("--socket", type=pathlib.Path, default=None)
    parser.add_argument("--interval", type=float, default=20.0)
    parser.add_argument("--initial-delay", type=float, default=40.0)
    arguments = parser.parse_args()
    state = arguments.state
    agent_path = arguments.socket or (state / "environment.sock")
    time.sleep(arguments.initial_delay)
    while True:
        # QEMU's serial chardev serves a single client, so each cycle opens and closes its own
        # connection; the readiness verifier uses the same socket at container start.
        agent = Agent(str(agent_path))
        try:
            if not agent.connect(time.monotonic() + 60):
                write_status(state, {"ready": False, "error": "agent-socket-unavailable"})
            else:
                agent._resync()
                agent.request("PING", timeout=30)
                agent.write(GUEST_PROBE_PATH, GUEST_PROBE_SOURCE)
                probe_once(agent, state)
        except Exception as error:
            write_status(state, {"ready": False, "error": str(error)[:200]})
        finally:
            agent.close()
        time.sleep(arguments.interval)


if __name__ == "__main__":
    main()

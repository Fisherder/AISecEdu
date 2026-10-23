#!/usr/bin/python3
"""Exchange clipboard text between the container and the Windows guest.

QEMU's VNC server has no guest clipboard agent, so neither noVNC's paste nor
its copy path reaches Windows 2000. This helper uses two channels that do work:

* host -> guest: the guest agent writes a text file and runs a tiny Python
  script that puts it on the Windows clipboard;
* guest -> host: a tiny Python script stores the Windows clipboard on a raw
  disk shared with the container (``clipboard.img``), which the container reads
  directly.

Both scripts are pushed through the existing agent, so no guest image change is
required.
"""

import argparse
import hashlib
import fcntl
import contextlib
import json
import pathlib
import socket
import struct
import sys
import time

STATE = pathlib.Path("/var/lib/windows-lab")
SOCKET = STATE / "environment.sock"
DISK = STATE / "clipboard.img"
GUEST_PYTHON = "C:\\Python27\\python.exe"
GUEST_DIR = "C:\\Lab\\Environment"

MAGIC = b"AISECLIP"
HEADER = struct.Struct("<8sII16s")  # magic, length, sequence, md5
PAYLOAD_OFFSET = 4096
MAX_TEXT = 65536

GUEST_SET = r'''
import ctypes, sys
raw = open(r"C:\Lab\Environment\clipboard-in.txt", "rb").read()
try:
    text = raw.decode("utf-8")
except UnicodeDecodeError:
    text = raw.decode("mbcs", "replace")
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
if not user32.OpenClipboard(0):
    sys.exit(2)
try:
    user32.EmptyClipboard()
    buffer = ctypes.create_unicode_buffer(text)
    handle = kernel32.GlobalAlloc(0x0042, ctypes.sizeof(buffer))
    if not handle:
        sys.exit(3)
    pointer = kernel32.GlobalLock(handle)
    if not pointer:
        sys.exit(4)
    ctypes.memmove(pointer, buffer, ctypes.sizeof(buffer))
    kernel32.GlobalUnlock(handle)
    if not user32.SetClipboardData(13, handle):
        sys.exit(5)
finally:
    user32.CloseClipboard()
sys.exit(0)
'''

GUEST_GET = r'''
import ctypes, hashlib, struct, sys, time
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
opened = False
for _ in range(20):
    if user32.OpenClipboard(0):
        opened = True
        break
    time.sleep(0.2)
if not opened:
    sys.exit(2)
text = ""
try:
    if user32.IsClipboardFormatAvailable(13):
        handle = user32.GetClipboardData(13)
        pointer = kernel32.GlobalLock(handle) if handle else 0
        if pointer:
            text = ctypes.wstring_at(pointer)
            kernel32.GlobalUnlock(handle)
    elif user32.IsClipboardFormatAvailable(1):
        handle = user32.GetClipboardData(1)
        pointer = kernel32.GlobalLock(handle) if handle else 0
        if pointer:
            text = ctypes.string_at(pointer).decode("mbcs", "replace")
            kernel32.GlobalUnlock(handle)
finally:
    user32.CloseClipboard()
payload = text.encode("utf-8")
if len(payload) > 65536:
    sys.exit(8)
header = struct.pack("<8sII16s", b"AISECLIP", len(payload), int(time.time()) & 0xFFFFFFFF,
                     hashlib.md5(payload).digest())
block = header + b"\0" * (4096 - len(header)) + payload
block += b"\0" * ((-len(block)) % 512)
try:
    disk = open(r"\\.\PhysicalDrive1", "r+b", 0)
except Exception:
    sys.exit(6)
try:
    disk.seek(0)
    disk.write(block)
    disk.flush()
except Exception:
    sys.exit(7)
finally:
    try:
        disk.close()
    except Exception:
        pass
sys.exit(0)
'''


class Agent:
    def __init__(self, path=SOCKET):
        self.path = path
        self.channel = None

    def connect(self, deadline=60.0):
        end = time.monotonic() + deadline
        while time.monotonic() < end:
            try:
                channel = socket.socket(socket.AF_UNIX)
                channel.settimeout(60)
                channel.connect(str(self.path))
                self.channel = channel
                return True
            except OSError:
                time.sleep(1)
        return False

    def _reply(self, timeout=60):
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
        end = time.monotonic() + 2
        while time.monotonic() < end:
            try:
                self._reply(0.4)
            except Exception:
                return

    def request(self, payload, timeout=60, attempts=5):
        last = None
        for _ in range(attempts):
            try:
                self.channel.sendall(payload.encode() + b"\n")
                return self._reply(timeout)
            except Exception as error:  # noqa: BLE001
                last = error
                self._resync()
                time.sleep(0.3)
        raise RuntimeError(str(last))

    def write(self, path, content, chunk=256):
        data = content if isinstance(content, bytes) else content.encode("utf-8")
        encoded = path.encode("utf-8").hex()
        for offset in range(0, len(data), chunk):
            self.request(f"WRITE {encoded} {offset} {data[offset:offset + chunk].hex()}")
            time.sleep(0.002)

    def run(self, command, timeout=180):
        return self.request(f"RUN {command.encode('utf-8').hex()}", timeout=timeout)


def guest_path(name):
    return GUEST_DIR + "\\" + name


def agent_session(deadline=45.0, ping_timeout=30, attempts=5):
    agent = Agent()
    if not agent.connect(deadline):
        raise RuntimeError("guest agent is unavailable")
    agent._resync()
    agent.request("PING", timeout=ping_timeout, attempts=attempts)
    return agent


def close_agent(agent):
    """Drain then close.

    QEMU's serial chardev serves one client, and a client that vanishes with
    replies still queued can leave the guest agent blocked writing to a
    full/closed channel - after which no client can reach the guest at all.
    Reading until the line goes quiet keeps the channel reusable.
    """
    channel = agent.channel
    if channel is None:
        return
    try:
        agent._resync()
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
        agent.channel = None


def read_disk():
    try:
        raw = DISK.read_bytes()
    except OSError:
        return None
    if len(raw) < HEADER.size:
        return None
    magic, length, _sequence, digest = HEADER.unpack(raw[: HEADER.size])
    if magic != MAGIC or length > MAX_TEXT:
        return None
    payload = raw[PAYLOAD_OFFSET : PAYLOAD_OFFSET + length]
    if len(payload) != length or hashlib.md5(payload).digest() != digest:
        return None
    try:
        return payload.decode("utf-8")
    except UnicodeDecodeError:
        return None


def write_disk(text):
    payload = text.encode("utf-8")
    if len(payload) > MAX_TEXT:
        return False
    header = HEADER.pack(MAGIC, len(payload), int(time.time()) & 0xFFFFFFFF, hashlib.md5(payload).digest())
    try:
        with DISK.open("r+b") as handle:
            handle.seek(0)
            block = header + b"\0" * (PAYLOAD_OFFSET - len(header)) + payload
            block += b"\0" * ((-len(block)) % 512)
            handle.write(block)
            handle.flush()
    except OSError:
        return False
    return True


def get_clipboard(timeout=10.0):
    agent = agent_session(timeout, ping_timeout=3, attempts=2)
    try:
        agent.write(guest_path("clipboard-get.py"), GUEST_GET, chunk=512)
        result = agent.run(f"{GUEST_PYTHON} {guest_path('clipboard-get.py')}", timeout=15)
    finally:
        close_agent(agent)
    code = int(result.get("exitCode") or 0)
    if code != 0:
        return {"available": False, "reason": f"guest-exit-{code}"}
    text = read_disk()
    if text is None:
        return {"available": False, "reason": "shared-disk-unavailable"}
    return {"available": True, "text": text}


def set_clipboard(text, timeout=10.0):
    if not isinstance(text,str) or "\x00" in text or len(text.encode("utf-8")) > MAX_TEXT:
        raise ValueError("Clipboard text is invalid or exceeds 64 KiB")
    agent = agent_session(timeout, ping_timeout=3, attempts=2)
    try:
        agent.write(guest_path("clipboard-set.py"), GUEST_SET, chunk=512)
        agent.write(guest_path("clipboard-in.txt"), text, chunk=512)
        result = agent.run(f"{GUEST_PYTHON} {guest_path('clipboard-set.py')}", timeout=15)
    finally:
        close_agent(agent)
    code = int(result.get("exitCode") or 0)
    write_disk(text)
    return {"ok": code == 0, "exitCode": code}


@contextlib.contextmanager
def transfer_lock():
    handle=(STATE/'clipboard-transfer.lock').open('a')
    until=time.monotonic()+8
    while True:
        try:
            fcntl.flock(handle,fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= until:
                handle.close()
                raise RuntimeError('Clipboard is busy; retry shortly')
            time.sleep(0.05)
    try:
        yield
    finally:
        fcntl.flock(handle,fcntl.LOCK_UN)
        handle.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("get", "set", "disk-read", "disk-write", "probe"))
    parser.add_argument("--text-file", type=pathlib.Path)
    arguments = parser.parse_args()
    try:
        if arguments.action == "get":
            with transfer_lock():
                result = get_clipboard()
        elif arguments.action == "set":
            text = arguments.text_file.read_text(encoding="utf-8") if arguments.text_file else ""
            with transfer_lock():
                result = set_clipboard(text)
        elif arguments.action == "disk-read":
            text = read_disk()
            result = {"available": text is not None, "text": text}
        elif arguments.action == "disk-write":
            text = arguments.text_file.read_text(encoding="utf-8") if arguments.text_file else ""
            result = {"ok": write_disk(text)}
        else:
            agent = agent_session()
            result = agent.request("PING", timeout=30)
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"available": False, "reason": str(error)[:200]}))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

import base64
import json

import docker


GUEST_TYPING_SCRIPT = r'''import ctypes
import sys
import time

user32 = ctypes.windll.user32
SHIFT = 0x10
payload = sys.argv[1].decode("hex")
for character in payload:
    scan = user32.VkKeyScanA(ord(character))
    if scan == -1:
        continue
    virtual_key = scan & 0xFF
    needs_shift = bool(scan >> 8 & 0x01)
    if needs_shift:
        user32.keybd_event(SHIFT, 0, 0, 0)
    user32.keybd_event(virtual_key, 0, 0, 0)
    user32.keybd_event(virtual_key, 0, 2, 0)
    if needs_shift:
        user32.keybd_event(SHIFT, 0, 2, 0)
    time.sleep(0.02)
'''

GUEST_SCRIPT_PATH = "C:\\Lab\\Environment\\type-text.py"
GUEST_PYTHON = "C:\\Python27\\python.exe"
AGENT_SOCKET = "/var/lib/windows-lab/environment.sock"
MAX_TEXT_LENGTH = 2000

CLIENT_SOURCE = r'''
import base64
import json
import socket
import sys
import time

AGENT_SOCKET = %(socket)r
SCRIPT_PATH = %(script_path)r
PYTHON = %(python)r


def connect(deadline):
    while time.monotonic() < deadline:
        try:
            channel = socket.socket(socket.AF_UNIX)
            channel.settimeout(30)
            channel.connect(AGENT_SOCKET)
            return channel
        except OSError:
            time.sleep(0.5)
    return None


def read_reply(channel, timeout=30):
    channel.settimeout(timeout)
    stream = channel.makefile("rb")
    line = stream.readline(65536)
    if not line:
        raise TimeoutError("agent closed")
    text = line.decode("utf-8", "replace").strip()
    if not text.startswith("OK "):
        raise ValueError(text[:200] or "empty")
    return json.loads(text[3:])


def resync(channel):
    try:
        channel.sendall(b"\n\n\n\n")
    except OSError:
        return
    deadline = time.monotonic() + 1.5
    while time.monotonic() < deadline:
        try:
            read_reply(channel, 0.3)
        except Exception:
            return


def request(channel, payload, timeout=30, attempts=4):
    last = None
    for _ in range(attempts):
        try:
            channel.sendall(payload.encode() + b"\n")
            return read_reply(channel, timeout)
        except Exception as error:
            last = error
            resync(channel)
            time.sleep(0.3)
    raise RuntimeError(str(last))


def write_script(channel, source):
    data = source.encode("utf-8")
    encoded = SCRIPT_PATH.encode("utf-8").hex()
    for offset in range(0, len(data), 256):
        block = data[offset:offset + 256]
        request(channel, "WRITE %%s %%d %%s" %% (encoded, offset, block.hex()))
        time.sleep(0.002)


def main():
    global SCRIPT_PATH
    payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
    SCRIPT_PATH = payload.get("scriptPath") or SCRIPT_PATH
    script = base64.b64decode(payload.get("script") or "").decode("utf-8")
    text = payload.get("text") or ""
    channel = connect(time.monotonic() + 30)
    if channel is None:
        print(json.dumps({"ok": False, "error": "guest agent unavailable"}))
        return
    try:
        resync(channel)
        request(channel, "PING")
        write_script(channel, script)
        command = "%%s %%s %%s" %% (PYTHON, SCRIPT_PATH, text.encode("utf-8").hex())
        result = request(channel, "RUN " + command.encode("utf-8").hex(), timeout=90)
        print(json.dumps({"ok": True, "exitCode": result.get("exitCode")}))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)[:200]}))
    finally:
        resync(channel)
        try:
            channel.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        channel.close()


main()
''' % {"socket": AGENT_SOCKET, "script_path": GUEST_SCRIPT_PATH, "python": GUEST_PYTHON}


GUEST_FLUSH_SCRIPT = r'''import ctypes
import sys
import _winreg

kernel32 = ctypes.windll.kernel32
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
OPEN_EXISTING = 3
INVALID_HANDLE_VALUE = -1

_winreg.FlushKey(_winreg.HKEY_CURRENT_USER)
_winreg.FlushKey(_winreg.HKEY_LOCAL_MACHINE)
for volume in (u"\\\\.\\C:",):
    handle = kernel32.CreateFileW(volume, GENERIC_READ | GENERIC_WRITE, 3, None, OPEN_EXISTING, 0, None)
    if handle in (INVALID_HANDLE_VALUE, 0):
        sys.exit(1)
    flushed = kernel32.FlushFileBuffers(handle)
    kernel32.CloseHandle(handle)
    if not flushed:
        sys.exit(2)
sys.exit(0)
'''


GUEST_SHUTDOWN_COMMAND = ["/usr/bin/timeout", "45", "python3", "-c", r'''
import pathlib,sys
sys.path.insert(0, '/usr/local/lib/windows-lab')
import start

def running_guest():
    for process in pathlib.Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            args = (process / 'cmdline').read_bytes().split(b'\0')
        except OSError:
            continue
        if args and pathlib.PurePosixPath(args[0].decode('utf-8', 'replace')).name.startswith('qemu-system-') and any(b'/var/lib/windows-lab/student.qcow2' in arg for arg in args[1:]):
            return True
    return False

if not running_guest():
    sys.exit(0)
try:
    start.qmp('query-status')
except Exception:
    sys.exit(75)
start.shutdown_guest()
if not running_guest():
    sys.exit(0)
try:
    state = start.qmp('query-status')
except Exception:
    sys.exit(0 if not running_guest() else 75)
sys.exit(0 if state.get('status') == 'shutdown' else 75)
''']


def shutdown_guest(container):
    labels = container.labels or {}
    if labels.get('dojo.runtime_environment') != 'windows2000':
        return False
    try:
        exit_code, _ = container.exec_run(GUEST_SHUTDOWN_COMMAND, user='0', demux=False)
    except (docker.errors.DockerException, AttributeError, OSError):
        return False
    return exit_code == 0


def flush_guest_disk(container):
    if not guest_agent_available(container):
        return False
    payload = base64.b64encode(
        json.dumps(
            {
                "script": base64.b64encode(GUEST_FLUSH_SCRIPT.encode("utf-8")).decode("ascii"),
                "text": "",
                "scriptPath": "C:\\Lab\\Environment\\flush-disk.py",
            },
            ensure_ascii=False,
        ).encode("utf-8")
    ).decode("ascii")
    try:
        exit_code, output = container.exec_run(
            ["python3", "-c", CLIENT_SOURCE, payload], user="0", demux=False
        )
    except (docker.errors.DockerException, AttributeError, OSError):
        return False
    raw = (output or b"").decode("utf-8", errors="replace").strip().splitlines()
    for line in reversed(raw):
        try:
            result = json.loads(line)
        except ValueError:
            continue
        return bool(result.get("ok")) and result.get("exitCode") == 0
    return False


def guest_agent_available(container):
    try:
        exit_code, _ = container.exec_run(
            ["/bin/sh", "-c", f"test -S {AGENT_SOCKET}"], user="0", demux=False
        )
    except (docker.errors.DockerException, AttributeError, OSError):
        return False
    return exit_code == 0


def type_text_in_guest(container, text):
    value = str(text or "")
    if not value:
        raise ValueError("请输入要发送的文本")
    if len(value) > MAX_TEXT_LENGTH:
        raise ValueError(f"一次最多发送 {MAX_TEXT_LENGTH} 个字符")
    if not guest_agent_available(container):
        raise ValueError("当前实验环境不支持文本直发（仅原生 Windows 客户机可用）")
    payload = base64.b64encode(
        json.dumps(
            {
                "script": base64.b64encode(GUEST_TYPING_SCRIPT.encode("utf-8")).decode("ascii"),
                "text": value,
            },
            ensure_ascii=False,
        ).encode("utf-8")
    ).decode("ascii")
    try:
        exit_code, output = container.exec_run(
            ["python3", "-c", CLIENT_SOURCE, payload], user="0", demux=False
        )
    except (docker.errors.DockerException, AttributeError, OSError) as error:
        raise ValueError(f"无法连接实验环境：{str(error)[:120]}")
    raw = (output or b"").decode("utf-8", errors="replace").strip().splitlines()
    result = {}
    for line in reversed(raw):
        try:
            result = json.loads(line)
            break
        except ValueError:
            continue
    if exit_code != 0 or not result.get("ok"):
        raise ValueError(result.get("error") or "文本发送失败")
    return result

import io
import hashlib
from pathlib import Path
import json
import re
import tarfile
import uuid

import docker


AGENT_SOCKET = "/var/lib/windows-lab/environment.sock"
CLIPBOARD_HELPER = "/usr/local/lib/windows-lab/clipboard.py"
MANAGED_HELPER = "/usr/local/lib/windows-lab/clipboard-console.py"
HELPER_SOURCE = Path(__file__).with_name("assets") / "windows2000-clipboard.py"
RESULT_JSON = "/usr/share/novnc/lab-result.json"
MAX_TEXT_BYTES = 65536
LINUX_XCLIP = "/run/dojo/bin/xclip"


def _exec(container, command, user="0"):
    try:
        exit_code, output = container.exec_run(command, user=user, demux=False)
    except (docker.errors.DockerException, AttributeError, OSError) as error:
        raise ValueError(f"无法连接实验环境：{str(error)[:120]}")
    return exit_code, (output or b"").decode("utf-8", errors="replace")


def _payload(output):
    for line in reversed(output.strip().splitlines()):
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    return {}


def guest_clipboard_available(container):
    exit_code, _ = _exec(
        container, ["/bin/sh", "-c", f"test -f {CLIPBOARD_HELPER} && test -S {AGENT_SOCKET}"]
    )
    return exit_code == 0


def clipboard_capabilities(container):
    if guest_clipboard_available(container):
        return {"available": True, "backend": "windows-agent", "maxBytes": MAX_TEXT_BYTES}
    code, _ = _exec(container, ["/bin/sh", "-c", f"test -x {LINUX_XCLIP} && test -S /tmp/.X11-unix/X0"])
    return {"available": code == 0, "backend": "x11" if code == 0 else None, "maxBytes": MAX_TEXT_BYTES}


def clipboard_keymap(container, backend):
    keys = {"copyChord": "copy", "pasteChord": "paste"}
    if backend != "x11":
        return keys
    command = ["/usr/bin/env", "DISPLAY=:0", "/run/dojo/bin/xprop"]
    code, output = _exec(container, command + ["-root", "_NET_ACTIVE_WINDOW"], user="1000")
    window = re.search(r"\b0x[0-9a-fA-F]+\b", output)
    if code != 0 or not window:
        return keys
    code, output = _exec(container, command + ["-id", window.group(), "WM_CLASS"], user="1000")
    if code == 0 and any(name in output.lower() for name in ("terminal", "xterm", "konsole", "kitty", "alacritty")):
        return {"copyChord": "copy-terminal", "pasteChord": "paste-terminal"}
    return keys


def validate_text(text):
    if not isinstance(text, str):
        raise ValueError("剪贴板只接受文本")
    if "\x00" in text:
        raise ValueError("文本含有不能放入剪贴板的空字符")
    try:
        payload = text.encode("utf-8")
    except UnicodeError as error:
        raise ValueError("文本包含无法编码的字符") from error
    if len(payload) > MAX_TEXT_BYTES:
        raise ValueError("文本超过 64 KB，请分段粘贴或通过文件管理传输")
    return payload


def _text_file(container, payload):
    name = "aisecedu-clipboard-" + uuid.uuid4().hex + ".txt"
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as bundle:
        info = tarfile.TarInfo(name)
        info.size, info.mode, info.uid, info.gid = len(payload), 0o600, 1000, 1000
        bundle.addfile(info, io.BytesIO(payload))
    try:
        if not container.put_archive("/tmp", archive.getvalue()):
            raise ValueError("无法准备剪贴板文本")
    except docker.errors.DockerException as error:
        raise ValueError("无法连接实验环境") from error
    return "/tmp/" + name


def _ensure_helper(container):
    data = HELPER_SOURCE.read_bytes()
    expected = hashlib.sha256(data).hexdigest()
    code, current = _exec(container,["sha256sum",MANAGED_HELPER])
    if code == 0 and current.split() and current.split()[0] == expected:
        return
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive,mode="w") as bundle:
        info = tarfile.TarInfo("clipboard-console.py")
        info.size,info.mode,info.uid,info.gid = len(data),0o644,0,0
        bundle.addfile(info,io.BytesIO(data))
    if not container.put_archive("/usr/local/lib/windows-lab",archive.getvalue()):
        raise ValueError("无法准备剪贴板连接，请稍后重试")


def read_guest_clipboard(container):
    capabilities = clipboard_capabilities(container)
    if not capabilities["available"]:
        return {"available": False, "reason": "RUNTIME_UNSUPPORTED"}
    if capabilities["backend"] == "x11":
        code, text = _exec(container, ["/usr/bin/timeout", "5", "/usr/bin/env", "DISPLAY=:0", LINUX_XCLIP, "-selection", "clipboard", "-out"], user="1000")
        if code != 0:
            return {"available": False, "reason": "CLIPBOARD_EMPTY_OR_BUSY", "backend": "x11"}
        validate_text(text)
        return {"available": True, "text": text, "backend": "x11"}
    _ensure_helper(container)
    exit_code, output = _exec(container, ["python3", MANAGED_HELPER, "get"])
    result = _payload(output)
    if exit_code != 0 or not result.get("available"):
        return {"available": False, "reason": result.get("reason") or "CLIPBOARD_UNAVAILABLE"}
    text = str(result.get("text") or "").replace("\r\n", "\n")
    validate_text(text)
    return {"available": True, "text": text, "backend": "windows-agent"}


def write_guest_clipboard(container, text):
    payload = validate_text(text)
    capabilities = clipboard_capabilities(container)
    if not capabilities["available"]:
        raise ValueError("当前实验环境不支持剪贴板直通")
    if capabilities["backend"] == "windows-agent":
        payload = validate_text(text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n"))
    path = _text_file(container, payload)
    try:
        if capabilities["backend"] == "x11":
            code, _ = _exec(container, ["/usr/bin/timeout", "5", "/usr/bin/env", "DISPLAY=:0", LINUX_XCLIP, "-selection", "clipboard", "-in", path], user="1000")
            if code != 0:
                raise ValueError("远程桌面剪贴板暂忙，请重试")
            return {"ok": True, "exitCode": 0, "backend": "x11", "bytes": len(payload), **clipboard_keymap(container,"x11")}
        _ensure_helper(container)
        exit_code, output = _exec(container, ["python3", MANAGED_HELPER, "set", "--text-file", path])
    finally:
        try:
            _exec(container, ["/bin/rm", "-f", path])
        except ValueError:
            pass
    result = _payload(output)
    if exit_code != 0 or not result.get("ok"):
        raise ValueError(result.get("reason") or "写入客户机剪贴板失败")
    return {**result, "backend": "windows-agent", "bytes": len(payload), "pasteChord": "paste", "copyChord": "copy"}


def verified_flag(container):
    exit_code, output = _exec(
        container, ["/bin/sh", "-c", f"cat {RESULT_JSON} 2>/dev/null || true"]
    )
    if exit_code != 0 or not output.strip():
        return None
    try:
        payload = json.loads(output.strip())
    except ValueError:
        return None
    flag = str((payload or {}).get("flag") or "").strip()
    return flag or None

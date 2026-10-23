import datetime
import re
import time

import docker

from .evidence import append_evidence, redact_text


SYNC_INTERVAL_SECONDS = 15
FILE_WINDOW_MINUTES = 90
MAX_FILES = 60
MAX_COMMANDS = 60
MAX_EVIDENCE_PER_SYNC = 5

IGNORED_FILE_PATTERNS = (
    re.compile(r"^/home/hacker/\.(cache|npm|local/share|vscode-server|config/Code|bash_history|zsh_history)"),
    re.compile(r"^/home/hacker/\.[a-z0-9_-]*cache"),
    re.compile(r"/node_modules/"),
    re.compile(r"^/home/hacker/\.vscode/extensions/"),
    re.compile(r"^/tmp/"),
    re.compile(r"^/run/"),
)

TOOL_PATTERNS = (
    ("editors", re.compile(r"\b(vim|nvim|vi|nano|emacs|code-server|code|gedit|notepad|ollydbg|ida|ghidra)\b", re.I)),
    ("debuggers", re.compile(r"\b(gdb|gdbserver|radare2|r2|pwndbg|strace|ltrace|ollydbg|x64dbg|windbg)\b", re.I)),
    ("languages", re.compile(r"\b(python3?|node|ruby|perl|go|java|gcc|g\+\+|clang|make|cmake|cargo|rustc|cl)\b", re.I)),
    ("exploit-tools", re.compile(r"\b(pwntools|checksec|ropper|ROPgadget|objdump|readelf|nm|foremost|binwalk|nc|ncat|socat|nmap|curl|wget)\b", re.I)),
    ("servers", re.compile(r"\b(sshd|code-server|ttyd|websockify|qemu-system|jupyter|nginx|socat)\b", re.I)),
)


def _exec(container, command, *, user="0", limit=40000):
    try:
        exit_code, output = container.exec_run(
            ["/bin/sh", "-c", command], user=user, demux=False
        )
    except (docker.errors.DockerException, AttributeError, OSError):
        return None
    if exit_code is None:
        return None
    return (output or b"").decode("utf-8", errors="replace")[:limit]


def _ignored(path):
    return any(pattern.search(path) for pattern in IGNORED_FILE_PATTERNS)


SAMPLE_COMMAND = """
set +e
echo '===PROCESSES'
ps -eo pid,user,etimes,args 2>/dev/null | tail -n +2 | head -n 60
if [ -z "$(ps -eo pid 2>/dev/null | tail -n +2)" ]; then
  for entry in /proc/[0-9]*; do
    pid=${entry#/proc/}
    command=$(tr '\\0' ' ' < "$entry/cmdline" 2>/dev/null)
    [ -n "$command" ] || continue
    owner=$(stat -c %U "$entry" 2>/dev/null)
    echo "$pid ${owner:-unknown} 0 $command"
  done | head -n 60
fi
echo '===PORTS'
(ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null) | tail -n +2 | head -n 20
if ! command -v ss >/dev/null 2>&1 && ! command -v netstat >/dev/null 2>&1; then
  awk 'NR > 1 && $4 == "0A" {print "listen " $2}' /proc/net/tcp /proc/net/tcp6 2>/dev/null | head -n 20
fi
echo '===SESSIONS'
who 2>/dev/null | head -n 20
ls -1 /run/dojo/var/ssh 2>/dev/null | head -n 10
echo '===FILES'
find /challenge /home/hacker -xdev -type f -mmin -__FILE_WINDOW__ -printf '%T@ %s %p\\n' 2>/dev/null | sort -rn | head -n __MAX_FILES__
echo '===GIT'
git -C /challenge status --short --untracked-files=all 2>/dev/null | head -n 40
echo '===HISTORY'
for f in /home/hacker/.bash_history /home/hacker/.zsh_history; do
  if [ -f "$f" ]; then
    echo "COUNT $f $(wc -l < "$f" 2>/dev/null)"
    tail -n __MAX_COMMANDS__ "$f" 2>/dev/null | sed 's/^/LINE /'
  fi
done
echo '===END'
"""
SAMPLE_COMMAND = (
    SAMPLE_COMMAND.replace("__FILE_WINDOW__", str(FILE_WINDOW_MINUTES))
    .replace("__MAX_FILES__", str(MAX_FILES))
    .replace("__MAX_COMMANDS__", str(MAX_COMMANDS))
)


def _sections(output):
    sections = {}
    current = None
    for line in output.splitlines():
        if line.startswith("===") and line.strip().strip("=").isupper():
            current = line.strip().strip("=")
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(line)
    return sections


def _parse_processes(lines):
    processes = []
    for line in lines:
        parts = line.strip().split(None, 3)
        if len(parts) < 4:
            continue
        pid, user_name, elapsed, command = parts
        if not pid.isdigit():
            continue
        processes.append(
            {
                "pid": int(pid),
                "user": user_name,
                "elapsedSeconds": int(elapsed) if elapsed.isdigit() else None,
                "command": command.strip()[:400],
            }
        )
    return processes


def _parse_files(lines):
    files = []
    for line in lines:
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        stamp, size, path = parts
        try:
            modified = float(stamp)
        except ValueError:
            continue
        if _ignored(path):
            continue
        files.append(
            {
                "path": path,
                "size": int(size) if size.isdigit() else None,
                "modified": modified,
            }
        )
    return files


def _parse_history(lines):
    counts = {}
    recent = []
    for line in lines:
        if line.startswith("COUNT "):
            parts = line.split(None, 2)
            if len(parts) == 3 and parts[2].isdigit():
                counts[parts[1]] = int(parts[2])
        elif line.startswith("LINE "):
            recent.append(redact_text(line[5:].strip())[:400])
    return {"counts": counts, "recent": recent}


def _running_tools(processes, sessions):
    tools = {}
    haystack = " ".join(
        [item["command"] for item in processes] + list(sessions)
    )
    for label, pattern in TOOL_PATTERNS:
        found = sorted({match.group(0).lower() for match in pattern.finditer(haystack)})
        if found:
            tools[label] = found[:8]
    return tools


def sample_container(container):
    output = _exec(container, SAMPLE_COMMAND)
    if output is None:
        return None
    sections = _sections(output)
    processes = _parse_processes(sections.get("PROCESSES", []))
    ports = [line.strip()[:200] for line in sections.get("PORTS", []) if line.strip()]
    sessions = [line.strip()[:200] for line in sections.get("SESSIONS", []) if line.strip()]
    files = _parse_files(sections.get("FILES", []))
    git_lines = [line.strip()[:200] for line in sections.get("GIT", []) if line.strip()]
    history = _parse_history(sections.get("HISTORY", []))
    return {
        "sampledAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "processes": processes,
        "ports": ports,
        "sessions": sessions,
        "files": files,
        "gitChanges": git_lines,
        "history": history,
        "tools": _running_tools(processes, sessions),
    }


def _file_key(item):
    return item.get("path")


def _new_files(previous, current):
    previous_by_path = {_file_key(item): item for item in (previous or {}).get("files", [])}
    fresh = []
    for item in current.get("files", []):
        before = previous_by_path.get(_file_key(item))
        if before is None or before.get("modified") != item.get("modified"):
            fresh.append(item)
    return fresh


def _new_commands(previous, current):
    baseline = bool((previous or {}).get("sampledAt"))
    before = ((previous or {}).get("history") or {})
    after = current.get("history") or {}
    recent = after.get("recent", [])
    fresh = []
    for path, count in (after.get("counts") or {}).items():
        previous_count = (before.get("counts") or {}).get(path)
        if previous_count is None:
            if baseline:
                fresh.extend(recent[-count:] if count else [])
            continue
        delta = count - previous_count
        if delta <= 0:
            continue
        fresh.extend(recent[-delta:])
    return fresh[-MAX_EVIDENCE_PER_SYNC:]


def sync_container_progress(attempt, container, *, force=False):
    if attempt is None or container is None:
        return None
    data = dict(attempt.data or {})
    cached = data.get("containerProgress") or {}
    now = time.time()
    if not force:
        last = data.get("containerProgressSyncedAt")
        if last and now - float(last) < SYNC_INTERVAL_SECONDS:
            return container_progress_view(cached)
    snapshot = sample_container(container)
    data["containerProgressSyncedAt"] = now
    if snapshot is None:
        if data != (attempt.data or {}):
            attempt.data = data
        return container_progress_view(cached)
    if not cached:
        try:
            append_evidence(
                attempt,
                "runtime.state.snapshot",
                {
                    "runtime": "workspace-container",
                    "sessions": snapshot.get("sessions", [])[:4],
                    "listeningPorts": len(snapshot.get("ports", [])),
                },
                source="WORKSPACE",
                trust_level=3,
            )
        except Exception:
            pass
    for item in _new_files(cached, snapshot)[:MAX_EVIDENCE_PER_SYNC]:
        try:
            append_evidence(
                attempt,
                "workspace.file.saved",
                {"file": item.get("path"), "size": item.get("size")},
                source="WORKSPACE",
                trust_level=3,
            )
        except Exception:
            break
    for command in _new_commands(cached, snapshot):
        try:
            append_evidence(
                attempt,
                "terminal.command.completed",
                {"command": command, "observedBy": "container-sample"},
                source="WORKSPACE",
                trust_level=3,
            )
        except Exception:
            break
    data["containerProgress"] = snapshot
    attempt.data = data
    return container_progress_view(snapshot)


def container_progress_view(snapshot):
    if not isinstance(snapshot, dict) or not snapshot:
        return None
    files = snapshot.get("files") or []
    commands = ((snapshot.get("history") or {}).get("recent")) or []
    tools = snapshot.get("tools") or {}
    running = sorted({name for names in tools.values() for name in names})
    pieces = []
    if files:
        pieces.append("最近改动了 %d 个文件（%s）" % (
            len(files),
            "、".join(item.get("path", "") for item in files[:3]),
        ))
    if commands:
        pieces.append("观察到 %d 条新命令（最新：%s）" % (len(commands), commands[-1][:80]))
    if running:
        pieces.append("相关进程：" + "、".join(running[:6]))
    ports = snapshot.get("ports") or []
    if ports:
        pieces.append("监听端口 %d 个" % len(ports))
    return {
        "available": True,
        "scope": "container",
        "sampledAt": snapshot.get("sampledAt"),
        "summary": "；".join(pieces) or "容器内暂时没有观测到新的文件或命令活动",
        "filesChanged": len(files),
        "recentFiles": [
            {"path": item.get("path"), "size": item.get("size")} for item in files[:10]
        ],
        "commandsObserved": len(commands),
        "recentCommands": commands[-5:],
        "runningTools": running,
        "listeningPorts": len(ports),
        "sessions": (snapshot.get("sessions") or [])[:5],
        "gitChanges": (snapshot.get("gitChanges") or [])[:10],
    }


def cached_container_progress(attempt):
    if attempt is None:
        return None
    return container_progress_view((getattr(attempt, "data", None) or {}).get("containerProgress"))


def sync_live_progress(attempt, container, *, force=False):
    from .guest_progress import sync_guest_progress

    return {
        "container": sync_container_progress(attempt, container, force=force),
        "guest": sync_guest_progress(attempt, container, force=force),
    }


def cached_live_progress(attempt):
    from .guest_progress import cached_guest_progress

    container_view = cached_container_progress(attempt)
    guest_view = cached_guest_progress(attempt)
    if container_view is None and guest_view is None:
        return None
    return {"container": container_view, "guest": guest_view}


def live_progress_summary(progress):
    if not isinstance(progress, dict):
        return None
    pieces = []
    guest = progress.get("guest") or {}
    container = progress.get("container") or {}
    if container.get("summary"):
        pieces.append(container["summary"])
    if guest.get("summary"):
        pieces.append("客户机：" + guest["summary"])
    if not pieces:
        return None
    return "；".join(pieces)

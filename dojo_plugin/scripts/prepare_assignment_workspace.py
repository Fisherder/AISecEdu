import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time


def validate_config(value):
    if not isinstance(value, dict):
        raise ValueError("编码工程配置必须是对象")
    result = {key: value.get(key) for key in ("course", "assignment", "title", "source", "legacy_directory")}
    for key in ("course", "assignment"):
        if not isinstance(result[key], str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", result[key]):
            raise ValueError("课程和作业目录名称无效")
    if not re.fullmatch(r"(?:hw|lab)[0-9]{2,3}-[a-z0-9][a-z0-9-]*", result["assignment"]):
        raise ValueError("作业目录应使用 hw01-主题 格式")
    for key in ("source", "legacy_directory"):
        if result[key] is not None and (not isinstance(result[key], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", result[key])):
            raise ValueError("源码或旧目录名称无效")
    if not result["source"] or not isinstance(result["title"], str) or not 1 <= len(result["title"]) <= 120:
        raise ValueError("缺少源码文件或作业标题")
    return result


def plain_directory(path):
    if path.is_symlink():
        raise ValueError("工程路径包含意外的符号链接，请先检查目录")
    path.mkdir(exist_ok=True)
    if not path.is_dir():
        raise ValueError("工程路径不是目录")


def atomic_write(path, data):
    if path.is_symlink():
        raise ValueError("工程配置不能是符号链接")
    descriptor, temporary = tempfile.mkstemp(prefix=".layout-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def save_managed(path, content, backup):
    if path.is_symlink():
        raise ValueError("工程配置不能是符号链接")
    encoded = content.encode()
    previous = path.read_bytes() if path.exists() else None
    if previous == encoded:
        return
    if previous is not None:
        plain_directory(backup)
        saved = backup / (path.name + "." + hashlib.sha256(previous).hexdigest()[:16])
        if not saved.exists():
            atomic_write(saved, previous)
    atomic_write(path, encoded)


def prepare(config, home=Path("/home/hacker"), starter=Path("/challenge/starter")):
    config = validate_config(config)
    home = Path(home)
    for parent in (home / "courses", home / "courses" / config["course"]):
        plain_directory(parent)
    root = home / "courses" / config["course"] / config["assignment"]
    legacy = home / config["legacy_directory"] if config["legacy_directory"] else None
    lock_path = home / ".assignment-layout.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        migrated = False
        if root.is_symlink():
            raise ValueError("目标工程目录不能是符号链接")
        if legacy and legacy.is_symlink():
            if legacy.resolve() != root.resolve():
                raise ValueError("旧工程链接指向其他位置，未更改任何代码")
        elif legacy and legacy.exists():
            if root.exists():
                raise ValueError("新旧目录都已有内容，请先核对；系统不会覆盖学生代码")
            if not legacy.is_dir():
                raise ValueError("旧工程路径不是目录")
            legacy.rename(root)
            migrated = True
        plain_directory(root)
        if legacy and not legacy.exists() and not legacy.is_symlink():
            legacy.symlink_to(root, target_is_directory=True)
        if not (root / config["source"]).exists():
            for source in starter.rglob("*"):
                if source.is_symlink():
                    continue
                destination = root / source.relative_to(starter)
                if source.is_dir():
                    plain_directory(destination)
                elif not destination.exists() and not destination.is_symlink():
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with destination.open("xb") as output:
                        output.write(source.read_bytes())
        source = root / config["source"]
        if source.is_symlink() or not source.is_file():
            raise ValueError("未找到本次作业的源码文件，请检查起始工程")
        backup = home / ".local" / "share" / "aisecedu" / "assignment-configs" / config["course"] / config["assignment"]
        backup.mkdir(parents=True, exist_ok=True)
        editor = root / ".vscode"
        plain_directory(editor)
        legacy_text = str(legacy) if legacy else None
        for name in ("settings.json", "tasks.json", "launch.json"):
            path = editor / name
            if path.is_symlink():
                raise ValueError("编辑器配置不能是符号链接")
            if not path.is_file():
                continue
            try:
                value = json.loads(path.read_text())
            except (ValueError, UnicodeError):
                continue
            text = json.dumps(value, ensure_ascii=False, indent=2)
            if legacy_text:
                text = text.replace(legacy_text, "${workspaceFolder}")
            save_managed(path, text + "\n", backup)
        workspace = root / (config["assignment"] + ".code-workspace")
        document = {
            "folders": [{"name": config["title"], "path": "."}],
            "settings": {
                "terminal.integrated.cwd": "${workspaceFolder}",
                "window.title": config["title"] + " — ${activeEditorShort}",
                "files.exclude": {"**/.assignment-layout-backup": True, "**/*.code-workspace": True},
            },
        }
        policy = starter / '.vscode/settings.json'
        if policy.is_file() and not policy.is_symlink():
            configured = json.loads(policy.read_text())
            for key, value in configured.items():
                if key.startswith(('git.', 'github.', 'markdown-preview-enhanced.', 'python.', 'clangd.')):
                    document['settings'][key] = value
            document['settings']['files.exclude'].update(configured.get('files.exclude', {}))
        save_managed(workspace, json.dumps(document, ensure_ascii=False, indent=2) + "\n", backup)
        readme = root / "README.md"
        if readme.is_file() and not readme.is_symlink() and legacy_text:
            previous = readme.read_text()
            updated = previous.replace(legacy_text, str(root)).replace("安全编码.code-workspace", workspace.name)
            if updated != previous:
                save_managed(readme, updated, backup)
        return {"folder": str(root), "workspace": str(workspace), "source": str(source), "title": config["title"], "migrated": migrated}


if __name__ == "__main__":
    try:
        deadline = time.monotonic() + 15
        while not Path("/run/dojo/var/ready").is_file():
            if time.monotonic() >= deadline:
                raise ValueError("实验环境仍在初始化，请稍后重新打开 VSCode")
            time.sleep(0.1)
        print(json.dumps(prepare(json.loads(sys.argv[1])), ensure_ascii=False))
    except (OSError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)

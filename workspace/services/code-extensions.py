import argparse
import fcntl
import json
import os
import re
import shutil
from pathlib import Path


def read_json(path, fallback):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return fallback


def extension_id(directory):
    package = read_json(directory / "package.json", {})
    if package.get("publisher") and package.get("name"):
        return f"{package['publisher']}.{package['name']}".lower()


def managed_extension(directory, source):
    if directory.is_symlink():
        return os.readlink(directory) == source
    try:
        return (directory / ".aisecedu-source").read_text() == source
    except OSError:
        return False


def materialize_extension(source, destination):
    temporary = destination.with_name(destination.name + ".installing")
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir()
    for parent, directories, files in os.walk(source, followlinks=True):
        target = temporary / Path(parent).relative_to(source)
        target.mkdir(parents=True, exist_ok=True)
        for name in files:
            original = Path(parent) / name
            if original.suffix in {".js", ".cjs", ".mjs", ".json"}:
                shutil.copyfile(original, target / name)
            else:
                (target / name).symlink_to(original)
    (temporary / ".aisecedu-source").write_text(str(source))
    temporary.replace(destination)


def sync_extension_index(destination, managed_names, installed):
    index = destination / "extensions.json"
    existing = read_json(index, [])
    replaced = managed_names | set(installed)
    entries = [entry for entry in existing if entry.get("relativeLocation") not in replaced]
    for name in installed:
        directory = destination / name
        package = read_json(directory / "package.json", {})
        metadata = package.get("__metadata", {})
        identity = {"id": extension_id(directory)}
        if metadata.get("id"):
            identity["uuid"] = metadata["id"]
        entries.append({
            "identifier": identity,
            "version": package["version"],
            "relativeLocation": name,
            "location": {"$mid": 1, "fsPath": str(directory), "path": str(directory), "scheme": "file"},
            "metadata": metadata,
        })
    if entries != existing:
        temporary = index.with_suffix(".tmp")
        temporary.write_text(json.dumps(entries, indent=2) + "\n")
        temporary.replace(index)


def sync_extensions(destination, sources):
    destination.mkdir(parents=True, exist_ok=True)
    registry = destination / ".aisecedu-preinstalled.json"
    managed = read_json(registry, {})
    managed_names = {
        name for name, target in managed.items()
        if managed_extension(destination / name, target)
    }
    custom_ids = {
        identity
        for directory in destination.iterdir()
        if directory.name not in managed_names and (identity := extension_id(directory))
    }
    selected = {}
    for source in sources:
        if not source.is_dir():
            continue
        for directory in sorted(source.iterdir()):
            identity = extension_id(directory)
            if identity and identity not in custom_ids:
                selected[identity] = directory.resolve()
    installed = {}
    for identity, source in selected.items():
        package = read_json(source / "package.json", {})
        name = f"{identity}-{package['version']}-aisecedu"
        target = destination / name
        if name in managed_names and target.is_symlink():
            target.unlink()
        elif name in managed_names and not managed_extension(target, str(source)):
            shutil.rmtree(target)
        if not target.exists() and not target.is_symlink():
            materialize_extension(source, target)
        if managed_extension(target, str(source)):
            installed[name] = str(source)
    for name in managed_names - installed.keys():
        target = destination / name
        if target.is_symlink():
            target.unlink()
        else:
            shutil.rmtree(target)
    temporary = registry.with_suffix(".tmp")
    temporary.write_text(json.dumps(installed, indent=2) + "\n")
    temporary.replace(registry)
    sync_extension_index(destination, managed_names, installed)


def prepare_user_data(destination, legacy, defaults):
    if not destination.exists():
        if legacy.is_dir():
            shutil.copytree(legacy, destination, symlinks=True)
        else:
            destination.mkdir(parents=True)
    user = destination / "User"
    user.mkdir(parents=True, exist_ok=True)
    settings = user / "settings.json"
    sync_settings(settings, defaults)
    machine = destination / "Machine"
    machine.mkdir(parents=True, exist_ok=True)
    remote_settings = machine / "settings.json"
    if not remote_settings.exists():
        shutil.copyfile(settings, remote_settings)
    else:
        sync_settings(remote_settings, defaults)


def sync_settings(settings, defaults):
    if not settings.exists():
        shutil.copyfile(defaults, settings)
        return
    text = settings.read_text()
    without_comments = re.sub(
        r'"(?:\\.|[^"\\])*"|/\*.*?\*/|//[^\n]*',
        lambda match: " " * len(match[0]) if match[0].startswith("/") else match[0],
        text,
        flags=re.DOTALL,
    )
    normalized = re.sub(
        r'"(?:\\.|[^"\\])*"|,\s*([}\]])',
        lambda match: match[0] if match[0].startswith('"') else match[1],
        without_comments,
    )
    try:
        current = json.loads(normalized)
    except ValueError:
        return
    if not isinstance(current, dict):
        return
    missing = {key: value for key, value in read_json(defaults, {}).items() if key not in current}
    if missing:
        opening = without_comments.index("{") + 1
        addition = json.dumps(missing, indent=2, ensure_ascii=False)[1:-1].strip()
        separator = "," if current else ""
        settings.write_text(text[:opening] + "\n  " + addition + separator + text[opening:])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-root", type=Path, required=True)
    parser.add_argument("--defaults", type=Path, required=True)
    parser.add_argument("--legacy", type=Path, required=True)
    parser.add_argument("sources", type=Path, nargs="+")
    args = parser.parse_args()
    args.state_root.mkdir(parents=True, exist_ok=True)
    with (args.state_root / ".setup.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        prepare_user_data(args.state_root / "user-data", args.legacy, args.defaults)
        sync_extensions(args.state_root / "extensions", args.sources)


if __name__ == "__main__":
    main()

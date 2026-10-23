import base64
import copy
import hashlib
import hmac
import json
import os
import pathlib
import re
import shutil
import tempfile
from types import SimpleNamespace

from flask import current_app

from .agent_runtime.scope import ScopeError, dojo_for_user
from .config import AGENT_RUNTIME_SERVICE_SECRET, DOJOS_DIR
from .models import DojoChallenges, LearningChallengeProfiles
from .learning.standards import DEFAULT_HINT_POLICY, DEFAULT_RUBRIC


MAX_PACKAGE_FILES = 1000
MAX_PACKAGE_BYTES = 40 * 1024 * 1024


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _relative(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError("题包文件路径无效。")
    path = pathlib.PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in value.split("/")):
        raise ValueError("题包文件必须使用包内相对路径。")
    return path


def snapshot_package(root, metadata):
    root = pathlib.Path(root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("题目文件目录不存在。")
    files, total = [], 0
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(root):
            raise ValueError("题包包含指向包外的链接，需先补齐包内依赖。")
        if path.is_dir():
            if path.is_symlink():
                raise ValueError("题包包含目录链接，需先展开为独立目录。")
            continue
        if not path.is_file():
            raise ValueError("题包包含不能复用的特殊文件。")
        _relative(relative)
        total += path.stat().st_size
        if total > MAX_PACKAGE_BYTES or len(files) >= MAX_PACKAGE_FILES:
            raise ValueError("题包超过 40 MB 或 1000 个文件，需先整理依赖。")
        data = path.read_bytes()
        files.append({"path": relative, "mode": path.stat().st_mode & 0o7777,
                      "data": base64.b64encode(data).decode(), "sha256": hashlib.sha256(data).hexdigest()})
    if not files:
        raise ValueError("空题包不能保存为可运行素材。")
    body = {"schema": "material-package/1", "metadata": copy.deepcopy(metadata), "files": files}
    return {**body, "sha256": _digest(body)}


def _validated_files(package):
    if not isinstance(package, dict) or package.get("schema") != "material-package/1":
        raise ValueError("题包快照格式无效。")
    body = {key: value for key, value in package.items() if key != "sha256"}
    if _digest(body) != package.get("sha256"):
        raise ValueError("题包快照校验失败。")
    files = package.get("files")
    if not isinstance(files, list) or not 1 <= len(files) <= MAX_PACKAGE_FILES:
        raise ValueError("题包文件数量无效。")
    result, seen, total = [], set(), 0
    for entry in files:
        path = _relative(entry.get("path"))
        if str(path) in seen or type(entry.get("mode")) is not int or not 0 <= entry["mode"] <= 0o7777:
            raise ValueError("题包存在重复文件或无效权限。")
        seen.add(str(path))
        try:
            data = base64.b64decode(entry["data"], validate=True)
        except (ValueError, KeyError, TypeError) as exc:
            raise ValueError("题包文件编码无效。") from exc
        total += len(data)
        if total > MAX_PACKAGE_BYTES or hashlib.sha256(data).hexdigest() != entry.get("sha256"):
            raise ValueError("题包大小或文件校验失败。")
        result.append((path, data, entry["mode"]))
    return result


def _cache_root():
    return pathlib.Path(DOJOS_DIR) / ".material-library-packages"


def materialize_package(package):
    files = _validated_files(package)
    root = _cache_root()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = root / package["sha256"]
    if target.exists():
        _verify_cache(target, package["sha256"])
        return target / "files"
    temporary = pathlib.Path(tempfile.mkdtemp(prefix="staging-", dir=root))
    try:
        for relative, data, mode in files:
            path = temporary / "files" / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            path.chmod(mode)
        (temporary / "manifest.json").write_text(json.dumps(package, ensure_ascii=False), encoding="utf-8")
        (temporary / "manifest.json").chmod(0o600)
        try:
            os.rename(temporary, target)
        except OSError:
            if not target.exists():
                raise
            _verify_cache(target, package["sha256"])
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return target / "files"


def _verify_cache(target, digest):
    manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("sha256") != digest:
        raise ValueError("素材题包缓存校验失败。")
    files = _validated_files(manifest)
    root = (target / "files").resolve(strict=True)
    for relative, data, mode in files:
        path = root / relative
        if path.is_symlink() or not path.resolve(strict=True).is_relative_to(root) or path.read_bytes() != data or path.stat().st_mode & 0o7777 != mode:
            raise ValueError("素材题包文件已变化，请恢复原版本后再发布。")
    actual = {path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()}
    if actual != {str(path) for path, _, _ in files}:
        raise ValueError("素材题包出现未登记文件。")
    return manifest


def _signature(digest, version=2):
    if version == 1:
        key = current_app.config["SECRET_KEY"]
        key = key.encode() if isinstance(key, str) else key
        return hmac.new(key, ("material-library-native/1:" + digest).encode(), hashlib.sha256).hexdigest()
    if version != 2 or not AGENT_RUNTIME_SERVICE_SECRET:
        raise ValueError("素材库题包签名配置无效。")
    key = AGENT_RUNTIME_SERVICE_SECRET.encode()
    key = hmac.new(key, b"aisecedu-material-library/native-key/v2", hashlib.sha256).digest()
    return hmac.new(key, ("material-library-native/2:" + digest).encode(), hashlib.sha256).hexdigest()


def bind_native_snapshot(spec, package, provenance):
    materialize_package(package)
    digest = package["sha256"]
    spec["libraryNativePackage"] = {"sha256": digest, "signature": _signature(digest), "signatureVersion": 2}
    spec["sourceChallengeId"] = None
    spec["sourceReferenceId"] = "library-package:" + digest
    spec["mode"] = "USE_EXISTING"
    spec.pop("manualAuthoring", None)


def resolve_native_snapshot(spec):
    pointer = spec.get("libraryNativePackage")
    if not isinstance(pointer, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(pointer.get("sha256") or "")):
        raise ValueError("素材题包引用无效。")
    digest = pointer["sha256"]
    version = pointer.get("signatureVersion", 1)
    if type(version) is not int or version not in {1, 2}:
        raise ValueError("素材题包签名版本无效。")
    if not hmac.compare_digest(str(pointer.get("signature") or ""), _signature(digest, version)):
        raise ValueError("素材题包引用未获平台确认。")
    target = _cache_root() / digest
    package = _verify_cache(target, digest)
    metadata = package["metadata"]
    return SimpleNamespace(
        challenge_id=None, id="library-" + digest[:20], reference_id="library-package:" + digest,
        name=metadata["name"], description=metadata["description"], path=target / "files", importable=True,
        image=metadata["image"], runtime_environment=metadata["runtimeEnvironment"],
        privileged=metadata["privileged"], allow_privileged=metadata["allowPrivileged"],
        interfaces=copy.deepcopy(metadata["interfaces"]), exercise_mode=metadata["exerciseMode"],
    )


def snapshot_cached_package(spec):
    source = resolve_native_snapshot(spec)
    return copy.deepcopy(_verify_cache(source.path.parent, spec["libraryNativePackage"]["sha256"]))


def _challenge(user, challenge_id):
    identity = str(challenge_id).split(":")
    try:
        challenge_id = int(identity[-1])
        scope = {"dojo_id": int(identity[0]), "module_index": int(identity[1])} if len(identity) == 3 else {"dojo_id": int(identity[0])} if len(identity) == 2 else {}
        if len(identity) not in {1, 2, 3}:
            raise ValueError("invalid identity")
    except (TypeError, ValueError) as exc:
        raise ScopeError("题目不存在或无权访问。") from exc
    matches = DojoChallenges.query.filter_by(challenge_id=challenge_id, **scope).all()
    for challenge in matches:
        try:
            dojo_for_user(user, challenge.dojo_id, teacher=True)
        except ScopeError:
            continue
        if not challenge.importable:
            raise ValueError("原题设置为不可复用。")
        return challenge
    raise ScopeError("题目不存在或无权访问。")


def snapshot_challenge_package(user, challenge_id):
    challenge = _challenge(user, challenge_id)
    metadata = {"name": challenge.name, "description": challenge.description,
                "image": challenge.image, "runtimeEnvironment": challenge.runtime_environment,
                "privileged": bool(challenge.privileged), "allowPrivileged": bool(challenge.allow_privileged),
                "interfaces": copy.deepcopy(challenge.interfaces), "exerciseMode": challenge.exercise_mode}
    return snapshot_package(challenge.path, metadata)


def snapshot_published_challenge(user, challenge_id):
    challenge = _challenge(user, challenge_id)
    profile = LearningChallengeProfiles.query.get(challenge.challenge_id)
    spec = {"id": challenge.id, "name": challenge.name, "description": challenge.description,
            "category": profile.category if profile else "GENERAL", "difficulty": profile.difficulty if profile else 2,
            "objectives": copy.deepcopy(profile.objectives) if profile else ["完成题目要求并说明方法"],
            "tags": copy.deepcopy(profile.tags) if profile else [],
            "rubric": copy.deepcopy(profile.rubric if profile and profile.rubric else DEFAULT_RUBRIC),
            "hintPolicy": copy.deepcopy(profile.hint_policy if profile and profile.hint_policy else DEFAULT_HINT_POLICY),
            "image": challenge.image, "runtimeEnvironment": challenge.runtime_environment,
            "exerciseMode": challenge.exercise_mode, "simulation": copy.deepcopy(challenge.simulation),
            "interfaces": copy.deepcopy(challenge.interfaces), "mode": "USE_EXISTING", "starterFiles": [],
            "privileged": bool(challenge.privileged), "allowPrivileged": bool(challenge.allow_privileged)}
    for key in ("authoringPlan", "privateSolution", "implementation", "oracleContract", "runtimeContract"):
        spec[key] = copy.deepcopy((profile.package or {}).get(key) or {}) if profile else {}
    payload = {"schema": "material-library/1", "kind": "practice", "title": challenge.name,
               "level": "L1", "brief": challenge.description, "spec": spec,
               "constraints": {"required": bool(challenge.required), "runtimeEnvironment": challenge.runtime_environment},
               "nativePackage": snapshot_challenge_package(user, f"{challenge.dojo_id}:{challenge.module_index}:{challenge.challenge_id}")}
    return {"type": "practice", "title": challenge.name, "payload": payload,
            "provenance": {"kind": "challenge", "id": str(challenge.challenge_id), "version": profile.version if profile else 1}}

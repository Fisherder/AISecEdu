import copy
import datetime
import hashlib
import json
import os
import pathlib
import re
import shutil

from CTFd.models import Challenges, Flags, db

from ..config import DOJOS_DIR
from ..models import (
    DojoChallenges,
    LearningAuditEvents,
    LearningChallengeProfiles,
    LearningDrafts,
)
from .intelligence import model_json
from .standards import DEFAULT_HINT_POLICY, DEFAULT_RUBRIC


ID_PATTERN = re.compile(r"^[a-z0-9-]{1,32}$")
IMAGE_PATTERN = re.compile(r"^[^\s]{1,256}$")
SAFE_FILE_PATTERN = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-/]{0,180}$")


def _tokens(value):
    return set(re.findall(r"[a-z0-9_\-]+|[\u4e00-\u9fff]{1,4}", (value or "").lower()))


def _slug(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    if not slug:
        slug = "ai-lab-" + hashlib.sha256((value or "lab").encode()).hexdigest()[:8]
    return slug[:32].rstrip("-")


def _infer_category(brief):
    lowered = brief.lower()
    categories = {
        "WEB": ("web", "http", "sql", "xss", "csrf", "浏览器", "网站", "注入"),
        "PWN": ("pwn", "binary", "overflow", "heap", "栈", "堆", "溢出"),
        "REV": ("reverse", "reversing", "反编译", "逆向", "汇编"),
        "CRYPTO": ("crypto", "cipher", "rsa", "aes", "密码", "加密"),
        "FORENSICS": ("forensic", "pcap", "memory", "日志", "取证", "流量"),
    }
    scores = {
        category: sum(1 for keyword in keywords if keyword in lowered)
        for category, keywords in categories.items()
    }
    category, score = max(scores.items(), key=lambda item: item[1])
    return category if score else "GENERAL"


def _infer_difficulty(brief, constraints):
    explicit = constraints.get("difficulty")
    if explicit is not None:
        try:
            return max(1, min(5, int(explicit)))
        except (TypeError, ValueError):
            pass
    lowered = brief.lower()
    if any(word in lowered for word in ("advanced", "expert", "高阶", "困难")):
        return 4
    if any(word in lowered for word in ("beginner", "intro", "入门", "基础")):
        return 1
    return 2


def _profile_for(challenge):
    return LearningChallengeProfiles.query.get(challenge.challenge_id)


def search_candidates(brief, category, *, target_dojo=None, limit=10):
    query_tokens = _tokens(brief)
    canonical = {}
    challenges = DojoChallenges.query.order_by(
        DojoChallenges.dojo_id,
        DojoChallenges.module_index,
        DojoChallenges.challenge_index,
    ).all()
    profiles = {
        profile.challenge_id: profile
        for profile in LearningChallengeProfiles.query.all()
    }
    for challenge in challenges:
        if challenge.challenge_id in canonical:
            continue
        if not challenge.importable:
            continue
        if not challenge.dojo.is_public_or_official and challenge.dojo != target_dojo:
            continue
        profile = profiles.get(challenge.challenge_id)
        document = " ".join(
            [
                challenge.name or "",
                challenge.description or "",
                " ".join((profile.objectives if profile else []) or []),
                " ".join((profile.tags if profile else []) or []),
            ]
        )
        document_tokens = _tokens(document)
        overlap = len(query_tokens & document_tokens)
        profile_category = profile.category if profile else _infer_category(document)
        category_bonus = 3 if profile_category == category else 0
        score = overlap * 2 + category_bonus
        canonical[challenge.challenge_id] = {
            "challengeId": challenge.challenge_id,
            "referenceId": challenge.reference_id,
            "name": challenge.name,
            "description": (challenge.description or "")[:500],
            "category": profile_category,
            "difficulty": profile.difficulty if profile else min(5, challenge.challenge_index + 1),
            "objectives": (profile.objectives if profile else []) or [],
            "tags": (profile.tags if profile else []) or [],
            "image": challenge.image,
            "score": score,
        }
    result = sorted(
        canonical.values(),
        key=lambda item: (-item["score"], item["difficulty"], item["referenceId"]),
    )
    return result[:limit]


def _base_spec(brief, constraints, level, candidates):
    category = str(constraints.get("category") or _infer_category(brief)).upper()
    difficulty = _infer_difficulty(brief, constraints)
    title = str(constraints.get("title") or brief.splitlines()[0] or "AI Security Lab")[:128]
    challenge_id = _slug(str(constraints.get("id") or title))
    selected = candidates[0] if candidates else None
    if level == "L1" and selected:
        mode = "USE_EXISTING"
    elif level == "L2" and selected:
        mode = "ADAPT_EXISTING"
    else:
        mode = "GENERATE_CUSTOM"
    description = str(constraints.get("description") or brief).strip()
    if mode == "GENERATE_CUSTOM" and "evidence.log" not in description:
        description += (
            "\n\n启动靶场后检查 `/challenge/evidence.log`，定位 `status=confirmed` 的记录，"
            "将其中的 `verification` 值作为唯一参数传给 `/challenge/check`。"
        )
    objectives = constraints.get("objectives")
    if not isinstance(objectives, list) or not objectives:
        objectives = [
            "建立可复现的环境基线",
            "提出并验证安全假设",
            "保存证据并解释结论",
        ]
    tags = constraints.get("tags")
    if not isinstance(tags, list):
        tags = []
    answer = str(
        constraints.get("verificationAnswer")
        or hashlib.sha256(f"{brief}:{challenge_id}".encode()).hexdigest()[:12]
    )[:128]
    return {
        "id": challenge_id,
        "name": title,
        "description": description[:24000],
        "mode": mode,
        "sourceChallengeId": selected["challengeId"] if selected and mode != "GENERATE_CUSTOM" else None,
        "sourceReferenceId": selected["referenceId"] if selected and mode != "GENERATE_CUSTOM" else None,
        "image": str(constraints.get("image") or (selected or {}).get("image") or "pwncollege/challenge-legacy:latest"),
        "category": category,
        "difficulty": difficulty,
        "objectives": [str(item)[:300] for item in objectives[:12]],
        "tags": list(dict.fromkeys([category.lower(), *[str(item)[:64] for item in tags[:20]]])),
        "privileged": bool(constraints.get("privileged", False)),
        "allowPrivileged": bool(constraints.get("allowPrivileged", True)),
        "interfaces": constraints.get("interfaces")
        or [
            {"name": "Terminal", "port": 7681},
            {"name": "Code", "port": 8080},
            {"name": "Desktop", "port": 6080},
            {"name": "SSH"},
        ],
        "rubric": copy.deepcopy(DEFAULT_RUBRIC),
        "hintPolicy": copy.deepcopy(DEFAULT_HINT_POLICY),
        "starterFiles": constraints.get("starterFiles") or [],
        "verificationAnswer": answer,
    }


def _model_refine(brief, constraints, level, candidates, fallback):
    public_constraint_keys = {
        "allowPrivileged",
        "category",
        "description",
        "difficulty",
        "id",
        "image",
        "interfaces",
        "objectives",
        "privileged",
        "tags",
        "title",
    }
    generated = model_json(
        (
            "你是 DOJO 原生网络安全题目设计 Agent。不能调用工具，只输出 JSON。"
            "保留动态 flag 和 Oracle 边界，不生成真实凭据。"
            "返回 id、name、description、category、difficulty、objectives、tags、image、"
            "privileged、allowPrivileged、interfaces、starterFiles。id 必须是小写字母数字连字符。"
        ),
        {
            "brief": brief,
            "constraints": {
                key: value
                for key, value in constraints.items()
                if key in public_constraint_keys
            },
            "level": level,
            "candidateSummaries": candidates[:5],
            "fallback": {key: value for key, value in fallback.items() if key != "verificationAnswer"},
        },
    )
    if not generated:
        return fallback, "DETERMINISTIC"
    allowed = {
        "id",
        "name",
        "description",
        "category",
        "difficulty",
        "objectives",
        "tags",
        "image",
        "privileged",
        "allowPrivileged",
        "interfaces",
        "starterFiles",
    }
    refined = {**fallback, **{key: generated[key] for key in allowed if key in generated}}
    refined["id"] = _slug(str(refined.get("id") or fallback["id"]))
    refined["name"] = str(refined.get("name") or fallback["name"])[:128]
    refined["description"] = str(refined.get("description") or fallback["description"])[:24000]
    refined["category"] = str(refined.get("category") or fallback["category"]).upper()[:64]
    refined["difficulty"] = max(1, min(5, int(refined.get("difficulty") or fallback["difficulty"])))
    return refined, "MODEL"


def _audit(actor_id, action, resource_type, resource_id, outcome, details=None):
    db.session.add(
        LearningAuditEvents(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            outcome=outcome,
            details=details or {},
        )
    )


def create_draft(dojo, module, author, brief, *, level="L2", constraints=None):
    constraints = constraints if isinstance(constraints, dict) else {}
    level = str(level or "L2").upper()
    if level not in {"L1", "L2", "L3"}:
        level = "L2"
    category = str(constraints.get("category") or _infer_category(brief)).upper()
    candidates = search_candidates(brief, category, target_dojo=dojo)
    fallback = _base_spec(brief, constraints, level, candidates)
    provider = "DETERMINISTIC"
    try:
        spec, provider = _model_refine(brief, constraints, level, candidates, fallback)
    except Exception:
        spec = fallback
        provider = "MODEL_FALLBACK"
    spec["authoringProvider"] = provider
    draft = LearningDrafts(
        dojo_id=dojo.dojo_id,
        module_index=module.module_index,
        author_id=author.id,
        level=level,
        brief=brief[:24000],
        constraints=constraints,
        conversation=[{"role": "teacher", "content": brief[:12000]}],
        spec=spec,
        candidates=candidates,
    )
    db.session.add(draft)
    db.session.flush()
    _audit(
        author.id,
        "authoring.create",
        "learning_draft",
        draft.id,
        "ALLOW",
        {"level": level, "provider": provider, "candidateCount": len(candidates)},
    )
    return draft


def revise_draft(draft, teacher_message):
    conversation = list(draft.conversation or [])
    conversation.append({"role": "teacher", "content": str(teacher_message)[:12000]})
    constraints = dict(draft.constraints or {})
    constraints["latestTeacherMessage"] = str(teacher_message)[:12000]
    fallback = {**draft.spec}
    brief = "\n".join(item["content"] for item in conversation if item.get("role") == "teacher")
    try:
        spec, provider = _model_refine(brief, constraints, draft.level, draft.candidates or [], fallback)
    except Exception:
        spec, provider = fallback, "MODEL_FALLBACK"
    spec["authoringProvider"] = provider
    conversation.append({"role": "assistant", "content": f"题目草稿已更新（{provider}）。"})
    draft.conversation = conversation
    draft.constraints = constraints
    draft.spec = spec
    draft.revision += 1
    draft.status = "DRAFT"
    draft.validation = {}
    return draft


def _starter_files(spec):
    files = spec.get("starterFiles") or []
    return files if isinstance(files, list) else []


def _valid_interfaces(interfaces):
    if not isinstance(interfaces, list) or not 1 <= len(interfaces) <= 16:
        return False
    for interface in interfaces:
        if not isinstance(interface, dict):
            return False
        name = interface.get("name")
        if not isinstance(name, str) or not 1 <= len(name) <= 64:
            return False
        port = interface.get("port")
        if port is not None and (
            not isinstance(port, int)
            or isinstance(port, bool)
            or not 1 <= port <= 65535
        ):
            return False
    return True


def validate_draft(draft):
    spec = copy.deepcopy(draft.spec or {})
    spec["hintPolicy"] = copy.deepcopy(DEFAULT_HINT_POLICY)
    draft.spec = spec
    checks = []

    def check(identifier, stage, passed, message, *, warning=False):
        checks.append(
            {
                "id": identifier,
                "stage": stage,
                "status": "PASS" if passed else "WARN" if warning else "BLOCK",
                "message": message,
            }
        )

    check("schema-id", "SCHEMA", bool(ID_PATTERN.fullmatch(str(spec.get("id") or ""))), "题目标识符合 DOJO 规范")
    check("schema-name", "SCHEMA", 0 < len(str(spec.get("name") or "")) <= 128, "题目名称长度有效")
    check("content-description", "CONTENT", len(str(spec.get("description") or "").strip()) >= 40, "题面包含足够的目标与环境说明")
    check("runtime-image", "RUNTIME", bool(IMAGE_PATTERN.fullmatch(str(spec.get("image") or ""))), "运行镜像引用有效")
    check("difficulty", "CONTENT", spec.get("difficulty") in {1, 2, 3, 4, 5}, "难度位于 1 至 5")
    objectives = spec.get("objectives")
    check(
        "objectives",
        "CONTENT",
        isinstance(objectives, list)
        and 1 <= len(objectives) <= 12
        and all(isinstance(item, str) and 1 <= len(item) <= 300 for item in objectives),
        "需要 1 至 12 个有效学习目标",
    )
    tags = spec.get("tags")
    check(
        "tags",
        "CONTENT",
        isinstance(tags, list)
        and len(tags) <= 20
        and all(isinstance(item, str) and 1 <= len(item) <= 64 for item in tags),
        "标签类型、数量与长度有效",
    )
    check(
        "runtime-interfaces",
        "RUNTIME",
        _valid_interfaces(spec.get("interfaces")),
        "Workspace 接口名称和端口有效",
    )
    rubric = spec.get("rubric") or {}
    criteria = rubric.get("criteria") if isinstance(rubric, dict) else None
    rubric_total = sum(float(item.get("maxScore", 0)) for item in criteria or [] if isinstance(item, dict))
    check("rubric-60-40", "ASSESSMENT", rubric_total == 100 and rubric.get("objectiveWeight") == 60 and rubric.get("processWeight") == 40, "评分标准保持可信 Oracle 60 分与过程证据 40 分")
    hint_policy = spec.get("hintPolicy") or {}
    check("tutor-policy", "TUTOR", hint_policy.get("mode") == "SOCRATIC_HINTS" and bool(hint_policy.get("forbiddenDisclosures")), "Tutor 具备统一提示问答和禁泄露策略")
    module = draft.dojo.modules[draft.module_index]
    duplicate = any(
        challenge.id == spec.get("id")
        and challenge.challenge_id != draft.published_challenge_id
        for challenge in module.challenges
    )
    check("unique-id", "PUBLISH", not duplicate, "目标模块内题目标识唯一")
    if draft.published_challenge_id:
        published = next(
            (
                challenge
                for challenge in module.challenges
                if challenge.challenge_id == draft.published_challenge_id
            ),
            None,
        )
        check(
            "stable-published-id",
            "PUBLISH",
            published is not None and published.id == spec.get("id"),
            "已发布题目的稳定标识不可变",
        )
    source_id = spec.get("sourceChallengeId")
    if source_id:
        source = DojoChallenges.query.filter_by(challenge_id=source_id).first()
        check(
            "source-available",
            "SUPPLY_CHAIN",
            source is not None and source.importable and source.path.is_dir(),
            "复用题目仍可读取并导入",
        )
    else:
        check("custom-scaffold", "BUILD", True, "自定义题目将生成可运行的动态 flag 检查脚手架")
    starter_files = _starter_files(spec)
    check(
        "starter-file-budget",
        "SUPPLY_CHAIN",
        len(starter_files) <= 100
        and sum(len(str(item.get("content") or "")) for item in starter_files if isinstance(item, dict))
        <= 1_000_000,
        "起始文件不超过 100 个且总内容不超过 1 MB",
    )
    for index, item in enumerate(starter_files):
        valid = (
            isinstance(item, dict)
            and bool(SAFE_FILE_PATTERN.fullmatch(str(item.get("path") or "")))
            and ".." not in pathlib.PurePosixPath(str(item.get("path") or "")).parts
            and str(item.get("path")) not in {".init", "check", "check-server.py"}
            and len(str(item.get("content") or "")) <= 100000
        )
        check(f"starter-file-{index + 1}", "SUPPLY_CHAIN", valid, "起始文件路径与大小安全")
    check(
        "mutable-image-tag",
        "SUPPLY_CHAIN",
        ":latest" not in str(spec.get("image") or ""),
        "建议使用不可变镜像标签或摘要",
        warning=True,
    )
    check(
        "privileged-runtime",
        "SECURITY",
        not bool(spec.get("privileged")),
        "特权模式需要教师明确复核",
        warning=True,
    )
    public_package = {key: value for key, value in spec.items() if key != "verificationAnswer"}
    digest = "sha256:" + hashlib.sha256(
        json.dumps(public_package, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    blocked = sum(1 for item in checks if item["status"] == "BLOCK")
    warnings = sum(1 for item in checks if item["status"] == "WARN")
    report = {
        "schemaVersion": "dojo-learning-validation/1.0",
        "status": "BLOCK" if blocked else "PASS",
        "summary": {"passed": len(checks) - blocked - warnings, "warnings": warnings, "blocked": blocked},
        "packageDigest": digest,
        "checks": checks,
        "validatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    }
    draft.validation = report
    draft.status = "VALIDATED" if not blocked else "DRAFT"
    _audit(
        draft.author_id,
        "authoring.validate",
        "learning_draft",
        draft.id,
        "ALLOW" if not blocked else "DENY",
        report["summary"],
    )
    return report


def _generated_package_path(draft, challenge_id, version):
    return (
        DOJOS_DIR
        / ".learning"
        / draft.dojo.hex_dojo_id
        / str(draft.module_index)
        / str(challenge_id)
        / f"v{version}"
    )


def _prepare_package_path(draft, challenge_id, version):
    package_path = _generated_package_path(draft, challenge_id, version)
    shutil.rmtree(package_path, ignore_errors=True)
    package_path.mkdir(parents=True, exist_ok=False)
    return package_path


def _write_custom_package(draft, challenge_id, version):
    spec = draft.spec
    package_path = _prepare_package_path(draft, challenge_id, version)
    answer = str(spec["verificationAnswer"])
    expected_hash = hashlib.sha256(answer.encode()).hexdigest()
    (package_path / "DESCRIPTION.md").write_text(str(spec["description"]), encoding="utf-8")
    (package_path / "evidence.log").write_text(
        "\n".join(
            [
                "component=workspace status=starting verification=discarded",
                "component=target status=degraded verification=retry",
                f"component=learning-oracle status=confirmed verification={answer}",
                "component=telemetry status=ready verification=not-applicable",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    check_client = """#!/usr/local/bin/python3
import socket
import sys

client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
client.connect("/run/dojo-learning-check.sock")
client.sendall("\\0".join(sys.argv[1:]).encode())
client.shutdown(socket.SHUT_WR)
response = b""
while block := client.recv(4096):
    response += block
success = response[:1] == b"\\0"
print(response[1:].decode(), end="", file=sys.stdout if success else sys.stderr)
raise SystemExit(0 if success else 1)
"""
    check_server = f"""#!/usr/local/bin/python3
import hashlib
import os
import socket

path = "/run/dojo-learning-check.sock"
try:
    os.unlink(path)
except FileNotFoundError:
    pass
server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(path)
os.chmod(path, 0o666)
server.listen()
while True:
    connection, _ = server.accept()
    with connection:
        request = b""
        while block := connection.recv(4096):
            request += block
        arguments = request.decode().split("\\0") if request else []
        valid = len(arguments) == 1 and hashlib.sha256(arguments[0].encode()).hexdigest() == "{expected_hash}"
        if valid:
            message = open("/flag").read().strip() + "\\n"
            status = b"\\0"
        else:
            message = "验证值不正确，请重新检查证据。\\n"
            status = b"\\1"
        connection.sendall(status + message.encode())
"""
    init_script = """#!/bin/bash
set -euo pipefail
python3 /challenge/check-server.py >/tmp/dojo-learning-check.log 2>&1 &
for _ in {1..100}; do
    [[ -S /run/dojo-learning-check.sock ]] && exit 0
    sleep 0.05
done
exit 1
"""
    files = {
        "check": check_client,
        "check-server.py": check_server,
        ".init": init_script,
    }
    for item in _starter_files(spec):
        files[str(item["path"])] = str(item.get("content") or "")
    for relative, content in files.items():
        target = package_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    for relative in ("check", "check-server.py", ".init"):
        os.chmod(package_path / relative, 0o755)
    return package_path


def _snapshot_source_package(draft, challenge_id, version, source):
    package_path = _prepare_package_path(draft, challenge_id, version)
    shutil.copytree(source.path, package_path, dirs_exist_ok=True)
    return package_path


def publish_draft(draft, actor):
    draft = (
        db.session.query(LearningDrafts)
        .filter_by(id=draft.id)
        .with_for_update()
        .populate_existing()
        .one()
    )
    if draft.status == "PUBLISHED":
        return DojoChallenges.query.filter_by(
            dojo_id=draft.dojo_id,
            challenge_id=draft.published_challenge_id,
        ).first()
    report = validate_draft(draft)
    if report["status"] != "PASS":
        raise ValueError("草稿尚未通过发布门禁")
    spec = draft.spec
    module = draft.dojo.modules[draft.module_index]
    source = None
    if spec.get("sourceChallengeId"):
        source = DojoChallenges.query.filter_by(challenge_id=spec["sourceChallengeId"]).first()
    dojo_challenge = None
    if draft.published_challenge_id:
        dojo_challenge = DojoChallenges.query.filter_by(
            dojo_id=draft.dojo_id,
            module_index=draft.module_index,
            challenge_id=draft.published_challenge_id,
        ).first()
        if not dojo_challenge:
            raise ValueError("已发布题目的稳定身份不存在")
        challenge_model = dojo_challenge.challenge
    else:
        challenge_model = Challenges(
            type="dojo",
            category=draft.dojo.hex_dojo_id,
            name=f"{module.id}:{spec['id']}",
            flags=[Flags(type="dojo")],
        )
        db.session.add(challenge_model)
        db.session.flush()
    profile = LearningChallengeProfiles.query.get(challenge_model.id)
    version = (profile.version or 0) + 1 if profile and profile.published else 1
    if source:
        package_path = _snapshot_source_package(
            draft,
            challenge_model.id,
            version,
            source,
        )
        image = source.image
        privileged = source.privileged
        allow_privileged = source.allow_privileged
        interfaces = source.interfaces
    else:
        package_path = _write_custom_package(draft, challenge_model.id, version)
        image = spec["image"]
        privileged = bool(spec.get("privileged"))
        allow_privileged = bool(spec.get("allowPrivileged", True))
        interfaces = spec.get("interfaces")
    if dojo_challenge is None:
        challenge_index = max([item.challenge_index for item in module.challenges] or [-1]) + 1
        dojo_challenge = DojoChallenges(
            dojo_id=draft.dojo_id,
            module_index=draft.module_index,
            challenge_index=challenge_index,
            challenge=challenge_model,
            id=spec["id"],
            name=spec["name"],
            description=spec["description"],
            required=bool(draft.constraints.get("required", True)),
            image=image,
            privileged=privileged,
            allow_privileged=allow_privileged,
            interfaces=interfaces,
            path_override=str(package_path),
            importable=True,
        )
        db.session.add(dojo_challenge)
    else:
        dojo_challenge.name = spec["name"]
        dojo_challenge.description = spec["description"]
        dojo_challenge.required = bool(draft.constraints.get("required", True))
        dojo_challenge.data = {
            **(dojo_challenge.data or {}),
            "image": image,
            "privileged": privileged,
            "allow_privileged": allow_privileged,
            "interfaces": interfaces,
            "path_override": str(package_path),
            "importable": True,
        }
    challenge_model.name = f"{module.id}:{spec['id']}"
    challenge_model.category = draft.dojo.hex_dojo_id
    db.session.flush()
    if not profile:
        profile = LearningChallengeProfiles(challenge_id=challenge_model.id)
        db.session.add(profile)
    previous_package = profile.package or {}
    history = list(previous_package.get("history") or [])
    if profile.published:
        history.append(
            {
                "version": profile.version,
                "packageDigest": profile.package_digest,
                "mode": previous_package.get("mode"),
                "publishedAt": profile.published.isoformat() + "Z",
            }
        )
    profile.author_id = actor.id
    profile.status = "PUBLISHED"
    profile.version = version
    profile.category = spec["category"]
    profile.difficulty = spec["difficulty"]
    profile.objectives = spec["objectives"]
    profile.tags = spec["tags"]
    profile.rubric = spec["rubric"]
    profile.hint_policy = spec["hintPolicy"]
    profile.package = {
        "schemaVersion": "dojo-learning-package/1.1",
        "version": version,
        "mode": spec["mode"],
        "sourceReferenceId": spec.get("sourceReferenceId"),
        "sourceSnapshot": bool(source),
        "image": image,
        "interfaces": interfaces,
        "generatedFiles": sorted(
            [str(path.relative_to(package_path)) for path in package_path.rglob("*") if path.is_file()]
        )[:1000],
        "history": history,
    }
    profile.validation = draft.validation
    profile.package_digest = draft.validation["packageDigest"]
    profile.published = datetime.datetime.utcnow()
    draft.status = "PUBLISHED"
    draft.published_challenge_id = challenge_model.id
    _audit(
        actor.id,
        "authoring.publish",
        "dojo_challenge",
        dojo_challenge.reference_id,
        "ALLOW",
        {
            "draftId": draft.id,
            "packageDigest": profile.package_digest,
            "mode": spec["mode"],
            "version": version,
        },
    )
    return dojo_challenge


def draft_view(draft, include_private=True):
    spec = dict(draft.spec or {})
    if not include_private:
        spec.pop("verificationAnswer", None)
    module = draft.dojo.modules[draft.module_index]
    return {
        "id": draft.id,
        "dojoId": draft.dojo.reference_id,
        "moduleId": module.id,
        "authorId": draft.author_id,
        "status": draft.status,
        "level": draft.level,
        "brief": draft.brief,
        "constraints": draft.constraints,
        "conversation": draft.conversation,
        "spec": spec,
        "candidates": draft.candidates,
        "validation": draft.validation,
        "revision": draft.revision,
        "publishedChallengeId": draft.published_challenge_id,
        "created": draft.created.isoformat() + "Z",
        "updated": draft.updated.isoformat() + "Z",
    }


def catalog_item_view(dojo_challenge, include_private=False):
    profile = _profile_for(dojo_challenge)
    result = {
        "challengeId": dojo_challenge.challenge_id,
        "id": dojo_challenge.id,
        "name": dojo_challenge.name,
        "description": dojo_challenge.description,
        "dojoId": dojo_challenge.dojo.reference_id,
        "moduleId": dojo_challenge.module.id,
        "required": dojo_challenge.required,
        "image": dojo_challenge.image,
        "category": profile.category if profile else _infer_category(dojo_challenge.description or ""),
        "difficulty": profile.difficulty if profile else min(5, dojo_challenge.challenge_index + 1),
        "objectives": profile.objectives if profile else [],
        "tags": profile.tags if profile else [],
        "rubric": profile.rubric if profile else DEFAULT_RUBRIC,
        "hintPolicy": copy.deepcopy(DEFAULT_HINT_POLICY),
        "packageDigest": profile.package_digest if profile else None,
        "validation": profile.validation if profile else None,
        "version": profile.version if profile else 1,
    }
    if include_private:
        result["package"] = profile.package if profile else {}
    return result

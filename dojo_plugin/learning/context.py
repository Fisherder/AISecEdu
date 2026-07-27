import datetime
import hashlib
import io
import json
import pathlib
import tarfile

import docker
from CTFd.models import Solves, Submissions, db
from sqlalchemy import func

from ..config import (
    DOJO_AI_MAX_CONTEXT_CHARS,
    DOJO_AI_MAX_FILE_CHARS,
    DOJOS_DIR,
)
from ..models import (
    DojoChallenges,
    DojoUsers,
    Dojos,
    LearningAssessments,
    LearningAttempts,
    LearningChallengeProfiles,
    LearningDrafts,
    LearningEvidenceEvents,
    LearningRecommendations,
    LearningSkillStates,
    LearningTutorMessages,
)
from ..utils import get_current_container
from .evidence import SENSITIVE_PATTERNS, scrub_payload, verify_evidence_chain
from .standards import ABILITY_LABELS, DEFAULT_HINT_POLICY, DEFAULT_RUBRIC


TEXT_SUFFIXES = {
    ".asm",
    ".bash",
    ".c",
    ".cc",
    ".conf",
    ".cpp",
    ".css",
    ".csv",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".ini",
    ".java",
    ".js",
    ".json",
    ".log",
    ".md",
    ".nix",
    ".php",
    ".pl",
    ".properties",
    ".py",
    ".rb",
    ".rs",
    ".sh",
    ".sql",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
TEXT_NAMES = {
    ".init",
    "Dockerfile",
    "Makefile",
    "README",
    "check",
    "description",
}
MAX_FILE_ENTRIES = 500
MAX_CONTENT_FILES = 160


def _utc(value):
    return value.isoformat() + "Z" if value else None


def _redact_text(value):
    result = str(value)
    for pattern, replacement in SENSITIVE_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def _looks_text(path, content):
    if b"\0" in content[:4096]:
        return False
    suffix = pathlib.PurePosixPath(path).suffix.lower()
    name = pathlib.PurePosixPath(path).name
    if suffix in TEXT_SUFFIXES or name in TEXT_NAMES:
        return True
    try:
        content[:8192].decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def _file_view(relative, content, *, size=None, modified=None):
    size = len(content) if size is None else int(size)
    result = {
        "path": str(relative),
        "size": size,
        "sha256": hashlib.sha256(content).hexdigest(),
    }
    if modified is not None:
        result["modified"] = modified
    if _looks_text(relative, content):
        text = _redact_text(content.decode("utf-8", errors="replace"))
        result["content"] = text[:DOJO_AI_MAX_FILE_CHARS]
        result["contentTruncated"] = len(text) > DOJO_AI_MAX_FILE_CHARS
        result["kind"] = "text"
    else:
        result["kind"] = "binary"
        result["content"] = None
    return result


def scan_reference_tree(root, *, content_budget=None):
    content_budget = content_budget or DOJO_AI_MAX_CONTEXT_CHARS // 3
    result = {
        "available": False,
        "root": "/challenge",
        "files": [],
        "omittedFiles": 0,
        "contentBudget": content_budget,
    }
    if root is None:
        return result
    root = pathlib.Path(root)
    result["available"] = root.is_dir()
    if not root.is_dir():
        return result

    used = 0
    content_files = 0
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        if len(result["files"]) >= MAX_FILE_ENTRIES:
            result["omittedFiles"] += 1
            continue
        try:
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                result["files"].append(
                    {"path": relative, "kind": "symlink", "target": str(path.readlink())}
                )
                continue
            if not path.is_file():
                continue
            stat = path.stat()
            metadata = {
                "path": relative,
                "size": stat.st_size,
                "modified": datetime.datetime.utcfromtimestamp(stat.st_mtime).isoformat()
                + "Z",
            }
            if (
                stat.st_size <= DOJO_AI_MAX_FILE_CHARS
                and content_files < MAX_CONTENT_FILES
                and used + stat.st_size <= content_budget
            ):
                content = path.read_bytes()
                view = _file_view(
                    relative,
                    content,
                    size=stat.st_size,
                    modified=metadata["modified"],
                )
                result["files"].append(view)
                used += len(view.get("content") or "")
                content_files += 1
            else:
                metadata.update({"kind": "unread", "content": None})
                result["files"].append(metadata)
        except (OSError, ValueError):
            result["files"].append(
                {"path": str(path), "kind": "unreadable", "content": None}
            )
    result["includedContentChars"] = used
    return result


def _container_exec(container, command, *, user="0", limit=24000):
    try:
        exit_code, output = container.exec_run(
            ["/bin/sh", "-c", command],
            user=user,
            demux=False,
        )
        return {
            "exitCode": exit_code,
            "output": _redact_text(
                (output or b"").decode("utf-8", errors="replace")
            )[:limit],
        }
    except (docker.errors.DockerException, AttributeError, OSError) as exception:
        return {"exitCode": None, "output": "", "error": str(exception)[:300]}


def _container_file(container, absolute_path):
    try:
        stream, _ = container.get_archive(absolute_path)
        archive = b"".join(stream)
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:*") as handle:
            member = next(
                (item for item in handle.getmembers() if item.isfile()),
                None,
            )
            if member:
                extracted = handle.extractfile(member)
                if extracted:
                    return extracted.read()
    except (
        docker.errors.DockerException,
        OSError,
        tarfile.TarError,
    ):
        pass

    # Kata/FUSE challenge files can be visible to exec but unavailable through
    # Docker's archive endpoint. Resolve the path inside /challenge, reject
    # escapes, and read a bounded amount without interpolating the path into
    # shell source.
    try:
        exit_code, output = container.exec_run(
            [
                "/bin/sh",
                "-c",
                (
                    "readlink_bin=/run/dojo/bin/readlink; "
                    '[ -x "$readlink_bin" ] || readlink_bin=/usr/bin/readlink; '
                    "head_bin=/run/dojo/bin/head; "
                    '[ -x "$head_bin" ] || head_bin=/usr/bin/head; '
                    'resolved="$("$readlink_bin" -f -- "$1")" || exit 2; '
                    'case "$resolved" in /challenge/*) ;; *) exit 3 ;; esac; '
                    '[ -f "$resolved" ] || exit 4; '
                    '"$head_bin" -c "$2" -- "$resolved"'
                ),
                "read-challenge-file",
                absolute_path,
                str(DOJO_AI_MAX_FILE_CHARS),
            ],
            user="0",
            demux=False,
        )
    except (docker.errors.DockerException, AttributeError, OSError):
        return None
    if exit_code != 0:
        return None
    return bytes(output or b"")[:DOJO_AI_MAX_FILE_CHARS]


def scan_container_tree(container, *, content_budget=None):
    content_budget = content_budget or DOJO_AI_MAX_CONTEXT_CHARS // 3
    inventory = _container_exec(
        container,
        (
            "find_bin=/run/dojo/bin/find; "
            '[ -x "$find_bin" ] || find_bin=/usr/bin/find; '
            "head_bin=/run/dojo/bin/head; "
            '[ -x "$head_bin" ] || head_bin=/usr/bin/head; '
            '"$find_bin" /challenge -maxdepth 16 '
            "\\( -fstype proc -o -fstype sysfs -o -fstype devtmpfs "
            "-o -fstype devpts -o -fstype cgroup -o -fstype cgroup2 \\) "
            "-prune -o -type f -printf '%s\\t%T@\\t%p\\0' "
            '2>/dev/null | "$head_bin" -z -n 500'
        ),
        limit=2_000_000,
    )
    symlink_inventory = _container_exec(
        container,
        (
            "find_bin=/run/dojo/bin/find; "
            '[ -x "$find_bin" ] || find_bin=/usr/bin/find; '
            "head_bin=/run/dojo/bin/head; "
            '[ -x "$head_bin" ] || head_bin=/usr/bin/head; '
            '"$find_bin" /challenge -maxdepth 16 '
            "\\( -fstype proc -o -fstype sysfs -o -fstype devtmpfs "
            "-o -fstype devpts -o -fstype cgroup -o -fstype cgroup2 \\) "
            "-prune -o -type l -printf '%T@\\t%p\\t%l\\0' "
            '2>/dev/null | "$head_bin" -z -n 500'
        ),
        limit=500_000,
    )
    result = {
        "available": inventory.get("exitCode") == 0,
        "root": "/challenge",
        "files": [],
        "omittedFiles": 0,
        "contentBudget": content_budget,
    }
    if inventory.get("exitCode") != 0:
        result["error"] = inventory.get("error") or inventory.get("output")
        return result

    raw = inventory.get("output", "").encode("utf-8", errors="replace")
    records = raw.split(b"\0")
    used = 0
    content_files = 0
    for raw_record in records:
        if not raw_record:
            continue
        try:
            size_text, modified_text, path_bytes = raw_record.split(b"\t", 2)
            absolute = path_bytes.decode("utf-8", errors="replace")
            if not absolute.startswith("/challenge/"):
                continue
            relative = absolute.removeprefix("/challenge/")
            size = int(size_text)
            modified = datetime.datetime.utcfromtimestamp(
                float(modified_text)
            ).isoformat() + "Z"
        except (TypeError, ValueError):
            continue
        if len(result["files"]) >= MAX_FILE_ENTRIES:
            result["omittedFiles"] += 1
            continue
        metadata = {
            "path": relative,
            "size": size,
            "modified": modified,
            "kind": "unread",
            "content": None,
        }
        if (
            size <= DOJO_AI_MAX_FILE_CHARS
            and content_files < MAX_CONTENT_FILES
            and used + size <= content_budget
        ):
            try:
                content = _container_file(container, absolute)
                if content is not None:
                    metadata = _file_view(
                        relative, content, size=size, modified=modified
                    )
                    used += len(metadata.get("content") or "")
                    content_files += 1
            except (
                docker.errors.DockerException,
                AttributeError,
                OSError,
                tarfile.TarError,
            ):
                metadata["kind"] = "unreadable"
        result["files"].append(metadata)
    if symlink_inventory.get("exitCode") == 0:
        symlink_records = symlink_inventory.get("output", "").encode(
            "utf-8", errors="replace"
        ).split(b"\0")
        for raw_record in symlink_records:
            if not raw_record:
                continue
            try:
                modified_text, path_bytes, target_bytes = raw_record.split(
                    b"\t", 2
                )
                absolute = path_bytes.decode("utf-8", errors="replace")
                if absolute == "/challenge":
                    relative = "."
                elif absolute.startswith("/challenge/"):
                    relative = absolute.removeprefix("/challenge/")
                else:
                    continue
                modified = datetime.datetime.utcfromtimestamp(
                    float(modified_text)
                ).isoformat() + "Z"
                target = target_bytes.decode("utf-8", errors="replace")[:1000]
            except (TypeError, ValueError):
                continue
            if len(result["files"]) >= MAX_FILE_ENTRIES:
                result["omittedFiles"] += 1
                continue
            result["files"].append(
                {
                    "path": relative,
                    "modified": modified,
                    "kind": "symlink",
                    "target": target,
                    "content": None,
                }
            )
    result["includedContentChars"] = used
    return result


def _parse_environment(values):
    environment = {}
    for item in values or []:
        key, separator, value = str(item).partition("=")
        environment[key] = value if separator else None
    return scrub_payload(environment)


def container_snapshot(user, expected_challenge=None):
    try:
        container = get_current_container(user)
    except (docker.errors.DockerException, AttributeError) as exception:
        return {"available": False, "reason": "docker-error", "error": str(exception)[:300]}
    if not container:
        return {"available": False, "reason": "no-running-container"}
    try:
        container.reload()
    except (docker.errors.DockerException, AttributeError):
        pass
    attrs = getattr(container, "attrs", {}) or {}
    config = attrs.get("Config") or {}
    state = attrs.get("State") or {}
    labels = config.get("Labels") or getattr(container, "labels", {}) or {}
    actual_reference = "/".join(
        str(labels.get(key) or "")
        for key in ("dojo.dojo_id", "dojo.module_id", "dojo.challenge_id")
    )
    expected_reference = (
        expected_challenge.reference_id if expected_challenge is not None else None
    )
    matches = not expected_reference or actual_reference == expected_reference
    result = {
        "available": True,
        "matchesAttempt": matches,
        "referenceId": actual_reference,
        "container": {
            "id": str(getattr(container, "id", ""))[:12],
            "image": config.get("Image"),
            "workingDirectory": config.get("WorkingDir"),
            "status": state.get("Status"),
            "startedAt": state.get("StartedAt"),
            "environment": _parse_environment(config.get("Env")),
            "labels": scrub_payload(labels),
            "networks": scrub_payload(
                ((attrs.get("NetworkSettings") or {}).get("Networks") or {})
            ),
        },
        "identity": _container_exec(
            container, "printf 'pwd='; pwd; id; uname -a", user="1000"
        ),
        "processes": _container_exec(
            container,
            "ps -eo pid,ppid,user,stat,etime,args --sort=pid 2>/dev/null || true",
        ),
        "ports": _container_exec(
            container,
            "ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || true",
        ),
        "resources": _container_exec(
            container,
            "df -h /challenge /home/hacker 2>/dev/null; ulimit -a 2>/dev/null || true",
            user="1000",
        ),
        "workspaceChanges": _container_exec(
            container,
            "git -C /challenge status --short --untracked-files=all 2>/dev/null || true",
            user="1000",
        ),
    }
    result["files"] = (
        scan_container_tree(container) if matches else {"available": False, "files": []}
    )
    return result


def _dojo_challenge(attempt):
    return DojoChallenges.query.filter_by(
        dojo_id=attempt.dojo_id,
        module_index=attempt.module_index,
        challenge_index=attempt.challenge_index,
    ).first()


def _published_package_for_attempt(profile, attempt):
    current = dict((profile.package or {}) if profile else {})
    if profile and current.get("version") is None:
        current["version"] = profile.version
    requested_version = ((attempt.data or {}).get("runtime") or {}).get(
        "challengeVersion"
    )
    try:
        requested_version = int(requested_version)
    except (TypeError, ValueError):
        requested_version = None
    if profile is None and requested_version == 1:
        current["version"] = 1
    candidates = [current, *reversed(current.get("history") or [])]
    selected = current
    selected_is_current = True
    if requested_version is not None:
        for index, candidate in enumerate(candidates):
            if not isinstance(candidate, dict):
                continue
            try:
                candidate_version = int(candidate.get("version"))
            except (TypeError, ValueError):
                continue
            if candidate_version == requested_version:
                selected = dict(candidate)
                selected["version"] = candidate_version
                selected_is_current = index == 0
                break
    selected["attemptVersion"] = requested_version
    selected["currentVersion"] = (
        profile.version if profile is not None else 1
    )
    selected["isCurrent"] = selected_is_current
    selected["versionMatched"] = bool(
        requested_version is None
        or selected.get("version") == requested_version
    )
    return selected


def _reference_root_for_attempt(challenge, package):
    requested_version = package.get("attemptVersion")
    candidates = []
    if package.get("versionMatched") and package.get("packagePath"):
        candidates.append(pathlib.Path(str(package["packagePath"])))
    if requested_version is not None:
        candidates.append(
            pathlib.Path(DOJOS_DIR)
            / ".learning"
            / challenge.dojo.hex_dojo_id
            / str(challenge.module_index)
            / str(challenge.challenge_id)
            / f"v{requested_version}"
        )
    allowed_root = pathlib.Path(DOJOS_DIR).resolve()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            if resolved.is_relative_to(allowed_root) and resolved.is_dir():
                return resolved, True
        except (OSError, RuntimeError, ValueError):
            continue
    if package.get("versionMatched") and package.get("isCurrent"):
        return challenge.path, pathlib.Path(challenge.path).is_dir()
    return None, False


def _private_authoring(challenge, profile, package):
    draft = (
        LearningDrafts.query.filter_by(
            dojo_id=challenge.dojo_id,
            published_challenge_id=challenge.challenge_id,
        )
        .order_by(LearningDrafts.updated.desc())
        .first()
    )
    spec = (draft.spec or {}) if draft else {}
    selected_is_current = bool(
        profile
        and package.get("versionMatched")
        and package.get("version") == profile.version
    )
    return {
        "verificationAnswer": (
            spec.get("verificationAnswer") if selected_is_current else None
        ),
        "authoringPlan": package.get("authoringPlan") or {},
        "implementation": package.get("implementation") or {},
        "privateSolution": package.get("privateSolution") or {},
        "oracleContract": package.get("oracleContract") or {},
        "runtimeContract": package.get("runtimeContract") or {},
        "validation": (draft.validation or {}) if draft and selected_is_current else {},
        "version": package.get("version"),
        "versionMatched": package.get("versionMatched"),
    }


def _event_view(event):
    return {
        "sequence": event.sequence,
        "type": event.event_type,
        "source": event.source,
        "trustLevel": event.trust_level,
        "payload": event.payload,
        "occurred": _utc(event.occurred),
    }


def attempt_agent_context(
    attempt,
    *,
    include_private=True,
    include_container=True,
):
    challenge = _dojo_challenge(attempt)
    if challenge is None:
        return {
            "attempt": {"id": attempt.id, "status": attempt.status},
            "error": "challenge-not-found",
        }
    profile = LearningChallengeProfiles.query.get(attempt.challenge_id)
    published_package = _published_package_for_attempt(profile, attempt)
    reference_root, reference_version_matched = (
        _reference_root_for_attempt(challenge, published_package)
    )
    if not reference_version_matched:
        published_package["versionMatched"] = False
    events = (
        LearningEvidenceEvents.query.filter_by(attempt_id=attempt.id)
        .order_by(LearningEvidenceEvents.sequence)
        .all()
    )
    tutor_messages = (
        LearningTutorMessages.query.filter_by(attempt_id=attempt.id)
        .order_by(LearningTutorMessages.id)
        .all()
    )
    result = {
        "attempt": {
            "id": attempt.id,
            "epoch": attempt.epoch,
            "mode": attempt.mode,
            "status": attempt.status,
            "started": _utc(attempt.started),
            "submitted": _utc(attempt.submitted),
            "completed": _utc(attempt.completed),
            "reflection": attempt.reflection or "",
            "scores": {
                "objective": attempt.objective_score,
                "process": attempt.process_score,
                "total": attempt.total_score,
            },
            "runtime": (attempt.data or {}).get("runtime") or {},
        },
        "challenge": {
            "referenceId": challenge.reference_id,
            "course": {
                "id": challenge.dojo.reference_id,
                "name": challenge.dojo.name,
                "description": challenge.dojo.description,
            },
            "unit": {
                "id": challenge.module.id,
                "name": challenge.module.name,
                "description": challenge.module.description,
            },
            "exercise": {
                "id": challenge.id,
                "name": challenge.name,
                "description": challenge.description,
                "image": challenge.image,
                "interfaces": challenge.interfaces,
                "required": challenge.required,
                "category": profile.category if profile else "GENERAL",
                "difficulty": profile.difficulty if profile else None,
                "objectives": profile.objectives if profile else [],
                "tags": profile.tags if profile else [],
                "rubric": profile.rubric if profile else DEFAULT_RUBRIC,
                "hintPolicy": profile.hint_policy if profile else DEFAULT_HINT_POLICY,
                "version": profile.version if profile else 1,
            },
        },
        "referenceFiles": {
            **scan_reference_tree(reference_root),
            "attemptVersion": published_package.get("attemptVersion"),
            "packageVersion": published_package.get("version"),
            "versionMatched": published_package.get("versionMatched"),
        },
        "studentTrajectory": {
            "evidenceChain": verify_evidence_chain(attempt.id),
            "events": [_event_view(event) for event in events[-120:]],
            "tutorHistory": [
                {
                    "role": message.role,
                    "content": message.content,
                    "metadata": message.metadata_json,
                    "created": _utc(message.created),
                }
                for message in tutor_messages[-30:]
            ],
        },
    }
    if include_private:
        result["privateReference"] = {
            "profilePackage": published_package,
            "profileValidation": (profile.validation or {}) if profile else {},
            "authoring": _private_authoring(
                challenge, profile, published_package
            ),
            "cachedSolution": ((attempt.data or {}).get("agentContext") or {}).get(
                "solutionReference"
            ),
        }
    if include_container:
        result["liveContainer"] = container_snapshot(attempt.user, challenge)
    return result


def learning_profile_context(user):
    dojos = Dojos.viewable(user=user).all()
    dojo_ids = [dojo.dojo_id for dojo in dojos]
    memberships = {
        membership.dojo_id: membership
        for membership in (
            DojoUsers.query.filter(
                DojoUsers.user_id == user.id,
                DojoUsers.dojo_id.in_(dojo_ids),
            ).all()
            if dojo_ids
            else []
        )
    }
    solved_ids = {
        row.challenge_id
        for row in Solves.query.filter_by(user_id=user.id).all()
    }
    submission_counts = dict(
        (
            db.session.query(DojoChallenges.dojo_id, func.count(Submissions.id))
            .join(
                Submissions,
                Submissions.challenge_id == DojoChallenges.challenge_id,
            )
            .filter(
                Submissions.user_id == user.id,
                DojoChallenges.dojo_id.in_(dojo_ids),
            )
            .group_by(DojoChallenges.dojo_id)
            .all()
        )
        if dojo_ids
        else []
    )
    courses = []
    for dojo in dojos[:30]:
        membership = memberships.get(dojo.dojo_id)
        enrolled = membership is not None or getattr(user, "type", "") == "admin"
        modules = []
        for module in dojo.modules:
            if not dojo.is_admin(user) and not module.visible():
                continue
            challenges = (
                module.challenges if dojo.is_admin(user) else module.visible_challenges()
            )
            items = [
                {
                    "id": challenge.id,
                    "name": challenge.name,
                    "required": challenge.required,
                    "completed": challenge.challenge_id in solved_ids,
                    "url": f"/{dojo.reference_id}/{module.id}/{challenge.id}",
                }
                for challenge in challenges
            ]
            modules.append(
                {
                    "id": module.id,
                    "name": module.name,
                    "description": module.description,
                    "completed": sum(item["completed"] for item in items if item["required"]),
                    "total": sum(1 for item in items if item["required"]),
                    "exercises": items,
                }
            )
        courses.append(
            {
                "id": dojo.reference_id,
                "name": dojo.name,
                "description": dojo.description,
                "enrolled": enrolled,
                "role": "teacher" if dojo.is_admin(user) else "student",
                "submissions": submission_counts.get(dojo.dojo_id, 0),
                "completed": sum(module["completed"] for module in modules),
                "total": sum(module["total"] for module in modules),
                "modules": modules,
                "url": f"/{dojo.reference_id}",
            }
        )

    attempts = (
        LearningAttempts.query.filter_by(user_id=user.id)
        .order_by(LearningAttempts.started.desc())
        .limit(30)
        .all()
    )
    attempt_ids = [attempt.id for attempt in attempts]
    latest_assessments = {}
    if attempt_ids:
        for assessment in (
            LearningAssessments.query.filter(
                LearningAssessments.attempt_id.in_(attempt_ids)
            )
            .order_by(
                LearningAssessments.attempt_id,
                LearningAssessments.revision.desc(),
            )
            .all()
        ):
            latest_assessments.setdefault(assessment.attempt_id, assessment)
    challenge_map = {
        (item.dojo_id, item.module_index, item.challenge_index): item
        for item in DojoChallenges.query.filter(
            DojoChallenges.dojo_id.in_(
                list({attempt.dojo_id for attempt in attempts})
            )
        ).all()
    } if attempts else {}
    attempt_views = []
    for attempt in attempts:
        challenge = challenge_map.get(
            (attempt.dojo_id, attempt.module_index, attempt.challenge_index)
        )
        assessment = latest_assessments.get(attempt.id)
        attempt_views.append(
            {
                "id": attempt.id,
                "course": challenge.dojo.name if challenge else None,
                "unit": challenge.module.name if challenge else None,
                "exercise": challenge.name if challenge else None,
                "referenceId": challenge.reference_id if challenge else None,
                "epoch": attempt.epoch,
                "mode": attempt.mode,
                "status": attempt.status,
                "started": _utc(attempt.started),
                "reflection": attempt.reflection or "",
                "assessment": (
                    {
                        "objectiveScore": assessment.objective_score,
                        "processScore": assessment.process_score,
                        "totalScore": assessment.total_score,
                        "feedback": assessment.feedback,
                        "source": assessment.source,
                    }
                    if assessment
                    else None
                ),
            }
        )
    skills = [
        {
            "courseId": state.dojo.reference_id,
            "course": state.dojo.name,
            "dimension": state.dimension,
            "label": ABILITY_LABELS.get(state.dimension, state.dimension),
            "mastery": round(state.mastery, 1),
            "confidence": state.confidence,
            "evidenceCount": state.evidence_count,
        }
        for state in LearningSkillStates.query.filter_by(user_id=user.id)
        .order_by(LearningSkillStates.updated.desc())
        .all()
    ]
    recommendations = [
        {
            "courseId": recommendation.dojo.reference_id,
            "course": recommendation.dojo.name,
            "exercise": recommendation.challenge.name,
            "rank": recommendation.rank,
            "reason": recommendation.reason,
            "url": next(
                (
                    f"/{challenge.dojo.reference_id}/{challenge.module.id}/{challenge.id}"
                    for challenge in recommendation.dojo.challenges
                    if challenge.challenge_id == recommendation.challenge_id
                ),
                f"/{recommendation.dojo.reference_id}",
            ),
        }
        for recommendation in LearningRecommendations.query.filter_by(
            user_id=user.id, status="ACTIVE"
        )
        .order_by(LearningRecommendations.created.desc(), LearningRecommendations.rank)
        .limit(20)
        .all()
    ]
    active = next((attempt for attempt in attempts if attempt.status == "ACTIVE"), None)
    return {
        "learner": {"id": user.id, "name": user.name},
        "summary": {
            "enrolledCourses": sum(course["enrolled"] for course in courses),
            "completedExercises": len(solved_ids),
            "attempts": len(attempts),
            "averageMastery": (
                round(sum(skill["mastery"] for skill in skills) / len(skills), 1)
                if skills
                else 0
            ),
        },
        "courses": courses,
        "skills": skills,
        "recentAttempts": attempt_views,
        "recommendations": recommendations,
        "activeAttemptId": active.id if active else None,
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    }


def guide_reference_catalog(profile):
    recent_attempts = {}
    for attempt in profile.get("recentAttempts") or []:
        reference_id = str(attempt.get("referenceId") or "")
        if not reference_id:
            continue
        summary = recent_attempts.setdefault(
            reference_id,
            {"count": 0, "latestStatus": attempt.get("status")},
        )
        summary["count"] += 1

    result = []
    for course in profile.get("courses") or []:
        for module in course.get("modules") or []:
            for exercise in module.get("exercises") or []:
                reference_id = "/".join(
                    (
                        str(course.get("id") or ""),
                        str(module.get("id") or ""),
                        str(exercise.get("id") or ""),
                    )
                )
                recent = recent_attempts.get(reference_id) or {}
                result.append(
                    {
                        "id": reference_id,
                        "courseId": course.get("id"),
                        "moduleId": module.get("id"),
                        "challengeId": exercise.get("id"),
                        "course": course.get("name") or course.get("id"),
                        "unit": module.get("name") or module.get("id"),
                        "exercise": exercise.get("name") or exercise.get("id"),
                        "completed": bool(exercise.get("completed")),
                        "recentAttempts": recent.get("count", 0),
                        "latestStatus": recent.get("latestStatus"),
                        "url": exercise.get("url"),
                    }
                )
    return result


def guide_reference_context(user, profile, references, *, max_references=6):
    catalog = guide_reference_catalog(profile)
    allowed = {item["id"]: item for item in catalog}
    selected = []
    seen = set()
    for value in references if isinstance(references, list) else []:
        reference_id = str(
            value.get("id") if isinstance(value, dict) else value
        ).strip()
        if reference_id in allowed and reference_id not in seen:
            selected.append(dict(allowed[reference_id]))
            seen.add(reference_id)
        if len(selected) >= max_references:
            break
    if not selected:
        return []

    challenge_by_reference = {}
    attempt_groups = {}
    total_attempts = {}
    all_attempts = []
    for item in selected:
        challenge = DojoChallenges.from_id(
            item["courseId"],
            item["moduleId"],
            item["challengeId"],
        ).first()
        if challenge is None:
            continue
        challenge_by_reference[item["id"]] = challenge
        query = LearningAttempts.query.filter_by(
            user_id=user.id,
            dojo_id=challenge.dojo_id,
            module_index=challenge.module_index,
            challenge_index=challenge.challenge_index,
        )
        total_attempts[item["id"]] = query.count()
        attempts = query.order_by(LearningAttempts.started.desc()).limit(4).all()
        attempt_groups[item["id"]] = attempts
        all_attempts.extend(attempts)

    attempt_ids = [attempt.id for attempt in all_attempts]
    assessments = {}
    evidence_counts = {}
    recent_events = {}
    tutor_history = {}
    if attempt_ids:
        for assessment in (
            LearningAssessments.query.filter(
                LearningAssessments.attempt_id.in_(attempt_ids)
            )
            .order_by(
                LearningAssessments.attempt_id,
                LearningAssessments.revision.desc(),
            )
            .all()
        ):
            assessments.setdefault(assessment.attempt_id, assessment)

        for attempt_id, event_type, count in (
            db.session.query(
                LearningEvidenceEvents.attempt_id,
                LearningEvidenceEvents.event_type,
                func.count(LearningEvidenceEvents.id),
            )
            .filter(LearningEvidenceEvents.attempt_id.in_(attempt_ids))
            .group_by(
                LearningEvidenceEvents.attempt_id,
                LearningEvidenceEvents.event_type,
            )
            .all()
        ):
            evidence_counts.setdefault(attempt_id, {})[event_type] = count

        ranked_events = (
            db.session.query(
                LearningEvidenceEvents.attempt_id.label("attempt_id"),
                LearningEvidenceEvents.sequence.label("sequence"),
                LearningEvidenceEvents.event_type.label("event_type"),
                LearningEvidenceEvents.source.label("source"),
                LearningEvidenceEvents.trust_level.label("trust_level"),
                LearningEvidenceEvents.payload.label("payload"),
                LearningEvidenceEvents.occurred.label("occurred"),
                func.row_number()
                .over(
                    partition_by=LearningEvidenceEvents.attempt_id,
                    order_by=LearningEvidenceEvents.sequence.desc(),
                )
                .label("position"),
            )
            .filter(LearningEvidenceEvents.attempt_id.in_(attempt_ids))
            .subquery()
        )
        for row in (
            db.session.query(
                ranked_events.c.attempt_id,
                ranked_events.c.sequence,
                ranked_events.c.event_type,
                ranked_events.c.source,
                ranked_events.c.trust_level,
                ranked_events.c.payload,
                ranked_events.c.occurred,
            )
            .filter(ranked_events.c.position <= 12)
            .order_by(ranked_events.c.attempt_id, ranked_events.c.sequence)
            .all()
        ):
            recent_events.setdefault(row.attempt_id, []).append(
                {
                    "sequence": row.sequence,
                    "type": row.event_type,
                    "source": row.source,
                    "trustLevel": row.trust_level,
                    "payload": scrub_payload(row.payload or {}),
                    "occurred": _utc(row.occurred),
                }
            )

        ranked_messages = (
            db.session.query(
                LearningTutorMessages.attempt_id.label("attempt_id"),
                LearningTutorMessages.id.label("id"),
                LearningTutorMessages.role.label("role"),
                LearningTutorMessages.content.label("content"),
                LearningTutorMessages.created.label("created"),
                func.row_number()
                .over(
                    partition_by=LearningTutorMessages.attempt_id,
                    order_by=LearningTutorMessages.id.desc(),
                )
                .label("position"),
            )
            .filter(LearningTutorMessages.attempt_id.in_(attempt_ids))
            .subquery()
        )
        for row in (
            db.session.query(
                ranked_messages.c.attempt_id,
                ranked_messages.c.id,
                ranked_messages.c.role,
                ranked_messages.c.content,
                ranked_messages.c.created,
            )
            .filter(ranked_messages.c.position <= 6)
            .order_by(ranked_messages.c.attempt_id, ranked_messages.c.id)
            .all()
        ):
            tutor_history.setdefault(row.attempt_id, []).append(
                {
                    "role": row.role,
                    "content": _redact_text(row.content or "")[:1800],
                    "created": _utc(row.created),
                }
            )

    result = []
    for item in selected:
        challenge = challenge_by_reference.get(item["id"])
        if challenge is None:
            continue
        challenge_profile = LearningChallengeProfiles.query.get(challenge.challenge_id)
        attempts = []
        for attempt in attempt_groups.get(item["id"], []):
            assessment = assessments.get(attempt.id)
            attempts.append(
                {
                    "id": attempt.id,
                    "epoch": attempt.epoch,
                    "mode": attempt.mode,
                    "status": attempt.status,
                    "started": _utc(attempt.started),
                    "submitted": _utc(attempt.submitted),
                    "completed": _utc(attempt.completed),
                    "reflection": _redact_text(attempt.reflection or "")[:1800],
                    "scores": {
                        "objective": attempt.objective_score,
                        "process": attempt.process_score,
                        "total": attempt.total_score,
                    },
                    "assessment": (
                        {
                            "objectiveScore": assessment.objective_score,
                            "processScore": assessment.process_score,
                            "totalScore": assessment.total_score,
                            "feedback": _redact_text(assessment.feedback)[:2400],
                            "abilities": assessment.abilities,
                            "source": assessment.source,
                        }
                        if assessment
                        else None
                    ),
                    "evidenceCounts": evidence_counts.get(attempt.id, {}),
                    "recentEvents": recent_events.get(attempt.id, []),
                    "tutorHistory": tutor_history.get(attempt.id, []),
                }
            )
        result.append(
            {
                **item,
                "category": (
                    challenge_profile.category if challenge_profile else "GENERAL"
                ),
                "difficulty": (
                    challenge_profile.difficulty if challenge_profile else None
                ),
                "description": _redact_text(challenge.description or "")[:5000],
                "objectives": (
                    challenge_profile.objectives if challenge_profile else []
                ),
                "tags": challenge_profile.tags if challenge_profile else [],
                "interfaces": [
                    {
                        key: interface.get(key)
                        for key in ("name", "port")
                        if interface.get(key) is not None
                    }
                    for interface in (challenge.interfaces or [])[:12]
                    if isinstance(interface, dict)
                ],
                "attemptCount": total_attempts.get(item["id"], 0),
                "attempts": attempts,
            }
        )
    return result


def context_digest(value):
    material = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(material.encode()).hexdigest()

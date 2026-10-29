import copy


def is_runtime_reference(draft):
    spec = draft.spec if isinstance(draft.spec, dict) else {}
    course = spec.get("course")
    return bool(
        isinstance(course, dict)
        and course.get("dojoId")
        and course.get("module")
        and isinstance(spec.get("id"), str)
        and spec.get("id")
        and spec.get("challengeId") == spec.get("id")
        and isinstance(spec.get("previewUrl"), str)
        and spec.get("previewUrl")
        and not spec.get("preparedRuntime")
        and not spec.get("starterFiles")
        and not spec.get("privateSolution")
        and not spec.get("libraryNativePackage")
    )


def runtime_reference_matches(draft, challenge):
    if not is_runtime_reference(draft):
        return False
    spec = draft.spec
    course = spec["course"]
    reference = challenge.dojo.reference_id
    module_id = challenge.module.id
    return bool(
        draft.dojo_id == challenge.dojo_id
        and draft.module_index == challenge.module_index
        and course.get("dojoId") == reference
        and course.get("module") == module_id
        and spec.get("id") == challenge.id
        and spec.get("previewUrl") == f"/dojo/{reference}/{module_id}/{challenge.id}"
        and challenge.runtime_environment == "windows2000"
    )


def linked_runtime_challenge(draft):
    if not is_runtime_reference(draft):
        return None
    from ..models import DojoChallenges

    challenge = DojoChallenges.query.filter_by(
        dojo_id=draft.dojo_id,
        module_index=draft.module_index,
        id=draft.spec["id"],
    ).first()
    return challenge if challenge and runtime_reference_matches(draft, challenge) else None


def runtime_spec(draft, challenge):
    spec = copy.deepcopy(draft.spec or {})
    spec.update(
        name=challenge.name,
        description=challenge.description,
        required=bool(challenge.required),
        exerciseMode=challenge.exercise_mode,
        runtimeEnvironment=challenge.runtime_environment,
        image=challenge.image,
        interfaces=copy.deepcopy(challenge.interfaces),
        allowPrivileged=bool(challenge.allow_privileged),
        workspaceLayout=copy.deepcopy(challenge.workspace_layout),
    )
    return spec


def runtime_url(challenge):
    return f"/{challenge.dojo.reference_id}/{challenge.module.id}/{challenge.id}"


def catalog_icon(challenge):
    return (
        "fa-flask"
        if challenge.dojo_id == 3839952 and challenge.module.id == "reverse-debugging"
        else "fa-flag"
    )


def reject_runtime_authoring(draft):
    challenge = linked_runtime_challenge(draft)
    if challenge:
        raise ValueError(
            "这条记录关联现有 Windows 实验，请从课程实验入口操作，"
            "使用原有 check.cmd 检查结果；不能按 Linux 新题重新生成或发布。"
        )

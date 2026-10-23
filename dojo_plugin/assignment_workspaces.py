import json
from pathlib import Path

from .models import DojoChallenges, DojoModules, Dojos
from .scripts.prepare_assignment_workspace import validate_config


def coding_workspace_options(container, fallback="/challenge"):
    labels = container.labels or {}
    dojo = Dojos.from_id(labels.get("dojo.dojo_id")).first()
    if dojo is None:
        return {"folder": fallback}
    module = DojoModules.query.filter_by(dojo_id=dojo.dojo_id, id=labels.get("dojo.module_id")).first()
    if module is None:
        return {"folder": fallback}
    challenge = DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id, module_index=module.module_index, id=labels.get("dojo.challenge_id")).first()
    config = (challenge.data or {}).get("coding_workspace") if challenge else None
    if not config:
        return {"folder": fallback}
    config = validate_config(config)
    script = (Path(__file__).parent / "scripts" / "prepare_assignment_workspace.py").read_text()
    result = container.exec_run([
        "/usr/bin/timeout", "20", "/usr/local/bin/python3", "-I", "-c", script,
        json.dumps(config, ensure_ascii=False),
    ], user="1000")
    try:
        prepared = json.loads(result.output)
    except (ValueError, UnicodeError):
        raise ValueError("本次作业工程尚未准备好，请稍后重新打开 VSCode") from None
    if result.exit_code:
        raise ValueError(prepared.get("error") or "本次作业工程准备失败")
    manifest_script = (Path(__file__).parent / "scripts" / "assignment_runtime_manifest.py").read_text()
    updated = container.exec_run([
        "/usr/bin/timeout", "10", "/usr/local/bin/python3", "-I", "-c", manifest_script,
        json.dumps(config, ensure_ascii=False),
    ], user="0")
    if updated.exit_code:
        raise ValueError("工程已保留，环境模板需要同步；请重新打开 VSCode 或联系教师")
    return {"workspace": prepared["workspace"]}

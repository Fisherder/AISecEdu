import ast
import hashlib
import re
import types
from pathlib import Path
from unittest.mock import Mock

import pytest


MODULE = Path(__file__).resolve().parents[1] / "dojo_plugin/learning/student_agent.py"
FUNCTIONS = {
    "_explicit_creation_request",
    "personal_study_package_requested",
    "_plain_study_text",
    "_study_values",
    "_plain_study_package",
    "create_personal_study_package",
}


class ScopeError(ValueError):
    pass


def fixture():
    parsed = ast.parse(MODULE.read_text())
    selected = [
        node for node in parsed.body
        if (isinstance(node, ast.FunctionDef) and node.name in FUNCTIONS)
        or (isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "_STUDY_PACKAGE_SYSTEM"
                    for target in node.targets))
    ]
    namespace = {
        "re": re, "hashlib": hashlib, "ScopeError": ScopeError,
        "UpstreamTurnError": ValueError, "guide_teaching_text": lambda value, limit: value[:limit],
        "upstream_enabled": Mock(return_value=True),
        "invoke_turn": Mock(return_value={
            "text": "synthetic fixture", "model": "actual-model",
            "usage": {"prompt_tokens": 11, "completion_tokens": 6, "total_tokens": 17},
        }),
        "request_body": Mock(),
        "result_object": Mock(return_value={
            "status": "ready", "title": "盆栽观察", "summary": "学会观察",
            "objectives": ["比较变化"],
            "sections": [{"title": "观察", "explanation": "固定时间记录。", "points": ["记录日期", "对比叶片"]}],
            "concepts": [{
                "question": "如何比较变化？", "options": ["定期观察", "改变目标", "不用记录"],
                "correctIndex": 0, "explanation": "固定时间便于比较。",
            }],
        }),
        "_create_workspace": Mock(return_value={"id": "workspace"}),
        "SelfLearningWorkspaces": types.SimpleNamespace(query=Mock()),
        "create_candidate_set": Mock(return_value=types.SimpleNamespace(id="candidate-set")),
        "replace_generated_candidates": Mock(return_value=[types.SimpleNamespace(id="selected")]),
        "materialize_candidate": Mock(return_value=(types.SimpleNamespace(id="artifact-1", title="盆栽观察"), None)),
        "db": types.SimpleNamespace(session=Mock()),
        "ModelInvocations": Mock(),
        "quote": str,
    }
    namespace["SelfLearningWorkspaces"].query.filter_by.return_value.one.return_value = (
        types.SimpleNamespace(id="workspace", dojo_id=9, module_index=2, thread_id="teaching-thread")
    )
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(MODULE), "exec"), namespace)
    return namespace


def test_personal_study_package_materializes_only_for_the_current_learner():
    ns = fixture()
    learner = types.SimpleNamespace(id=17)
    thread = types.SimpleNamespace(id="own-thread", user_id=17)
    prompt = "请生成一个关于盆栽观察的个人学习包。"
    action = ns["create_personal_study_package"](learner, thread, prompt)

    assert action["url"] == "/learning/artifacts/artifact-1?returnTo=/learning/extend"
    assert action["resourceRef"] == {"objectType": "artifact", "objectId": "artifact-1"}
    scoped = ns["create_candidate_set"].call_args.kwargs
    assert (scoped["owner_id"], scoped["dojo_id"], scoped["module_index"]) == (17, 9, 2)
    assert scoped["self_workspace_id"] == "workspace" and scoped["source_refs"] == []
    assert ns["request_body"].call_args.args[1] == {"request": prompt}
    stored = ns["replace_generated_candidates"].call_args.args[1][0]["content"]
    assert stored["type"] == "learning-path"
    assert stored["outline"][1]["title"] == "概念自检 1"
    assert stored["assessment"]["criteria"] == ["自检 1：A。固定时间便于比较。"]
    assert ns["ModelInvocations"].call_args.kwargs["actual_model"] == "actual-model"
    assert ns["ModelInvocations"].call_args.kwargs["usage"]["totalTokens"] == 17
    ns["materialize_candidate"].assert_called_once_with("selected", learner, commit=False)


def test_personal_study_package_rejects_foreign_thread_implicit_or_executable_requests():
    ns = fixture()
    learner = types.SimpleNamespace(id=17)
    foreign = types.SimpleNamespace(id="foreign", user_id=28)
    own = types.SimpleNamespace(id="own", user_id=17)
    create = ns["create_personal_study_package"]
    with pytest.raises(ScopeError):
        create(learner, foreign, "请生成一个学习包。")
    with pytest.raises(ScopeError):
        create(learner, own, "什么是学习包？")
    with pytest.raises(ValueError, match="文字自检"):
        create(learner, own, "请生成学习包和攻击复现步骤。")
    ns["invoke_turn"].assert_not_called()
    ns["_create_workspace"].assert_not_called()


def test_personal_study_package_rejects_executable_fields_before_materialization():
    ns = fixture()
    output = ns["result_object"].return_value
    output["sections"][0]["html"] = "<script>fixture</script>"
    with pytest.raises(ValueError, match="讲解小节"):
        ns["create_personal_study_package"](
            types.SimpleNamespace(id=17), types.SimpleNamespace(id="own", user_id=17),
            "生成一个学习包。",
        )
    ns["create_candidate_set"].assert_not_called()
    ns["materialize_candidate"].assert_not_called()

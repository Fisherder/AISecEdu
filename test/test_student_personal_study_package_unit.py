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


@pytest.mark.parametrize("prompt", [
    "请给我解释如何生成学习包。",
    "How do I generate a learning package?",
    "不需要生成学习包。请解释归纳。",
    "别给我生成学习包。",
    "请不要替我自动生成学习包，只解释术语。",
    "请解释为什么要生成学习包。",
    "老师昨天说会生成学习包。",
    "请生成一个学习包。后来我改主意了，不要替我自动生成学习包。",
    "生成学习包有什么用？",
    "Why should I create a study package?",
    "My teacher said they would create a study package.",
    "I don't want to generate a learning package. Just explain induction.",
    "No need to generate a study package.",
    "请生成一份复习计划。不要学习包。",
    "请生成学习包。不要给我学习包。",
    "生成学习包了吗？",
    "请问生成学习包了吗？",
    "你能帮我生成学习包了吗？",
    "我想知道可以生成学习包吗？",
    "请生成学习包。后来我不想要学习包。",
    "请参考“个人学习包”的定义，说明它有什么用。",

    "生成学习包已完成。",
    "请生成学习包之前先讲讲概念。",
    "请生成学习包。请取消刚才的请求。",
    "请生成自学包。不要学习包。",
    "请生成自学包。不要“学习包”。",
    "请制作学习讲义。不要学习讲义。",
    "请制作学习讲义。不要学习包和学习讲义。",
    "“请生成学习包”是课堂记录。",
    "请解释之前保存的学习包。",
    "继续。",

])
def test_denied_package_requests_do_not_create_a_workspace_or_call_the_model(prompt):
    ns = fixture()
    assert not ns["personal_study_package_requested"](prompt)
    with pytest.raises(ScopeError):
        ns["create_personal_study_package"](
            types.SimpleNamespace(id=17), types.SimpleNamespace(id="own", user_id=17), prompt,
        )
    ns["_create_workspace"].assert_not_called()
    ns["invoke_turn"].assert_not_called()


@pytest.mark.parametrize("prompt", [
    "帮我生成一份关于怎样用证据支持结论的个人学习包。",
    "帮我生成一个 30 分钟、可直接进入学习的个人学习包，并结合我的薄弱点安排内容。",
    "请制作一个关于同时观察两种植物的学习包。",
    "请根据上节课内容帮我创建一份学习包。",
    "请自动生成一个概率论学习包。",
    "请设计概率论的学习包。",
    "Can you create a study package for me?",
    "我要一份概率论学习包。",
    "Help me create a study package.",
    "别忘了根据上节课内容帮我生成学习包。",
    "请解释盆栽观察。再生成一份学习包。",
    "不需要生成幻灯片。请生成一个学习包。",
    "请生成一个学习包。别生成幻灯片。",
    "请生成一个学习包。不要概念自检。",
    "请制作一份关于盆栽观察的学习讲义。",
    "Don't make a slide deck. Please generate a learning package.",
    "Create a 30-minute, beginner-friendly learning package.",
    "不要生成学习包。改主意了，请生成一个学习包。",
    "请根据上节课内容生成一份学习包。",
    "请根据之前的课堂笔记生成学习包。",
    "请根据上节课的学习包资料生成学习讲义。",
    "请解释学习包。再生成一份学习讲义。",
    "请不要忘了生成一份学习包。",
    "请生成一个“学习包”。",
    "我要学习包。",
    "我需要学习包。",
    "可以帮我生成学习包吗？",
    "请问可以帮我生成学习包吗？",
    "帮我生成“个人学习包”。",
    'Please create a "personal study pack".',

    "请生成学习讲义。不要概念自检。",
    "请参考“不要生成学习包”这段课堂资料生成概念自检。",
    "Please create a study package from my notes.",

])
def test_explicit_package_requests_keep_other_clauses_separate(prompt):
    ns = fixture()
    assert ns["personal_study_package_requested"](prompt)
    ns["create_personal_study_package"](
        types.SimpleNamespace(id=17), types.SimpleNamespace(id="own", user_id=17), prompt,
    )
    ns["_create_workspace"].assert_called_once()
    assert ns["_create_workspace"].call_args.kwargs == {"personal_study_package": True}
    ns["invoke_turn"].assert_called_once()

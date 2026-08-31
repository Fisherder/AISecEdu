import json
import pathlib
import secrets
import time
from types import SimpleNamespace

import pytest

try:
    from selenium.webdriver.support.ui import WebDriverWait
except ModuleNotFoundError:
    WebDriverWait = None

from utils import DOJO_URL, db_sql, get_user_id, solve_challenge, start_challenge, workspace_run


API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/learning"
COURSES_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/dojos"
TEACHING_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/teaching"


def test_catalog_order_plan_reorders_and_moves_questions_between_chapters():
    from CTFd.plugins.dojo_plugin.api.v1.learning import _catalog_order_plan

    modules = [
        SimpleNamespace(id="chapter-a", module_index=0, name="章节 A"),
        SimpleNamespace(id="chapter-b", module_index=1, name="章节 B"),
    ]
    challenges = [
        SimpleNamespace(module_index=0, challenge_index=0, id="a-1", exercise_mode="CONTAINER"),
        SimpleNamespace(module_index=0, challenge_index=1, id="a-2", exercise_mode="CONTAINER"),
        SimpleNamespace(module_index=1, challenge_index=0, id="retired", exercise_mode="SIMULATION"),
        SimpleNamespace(module_index=1, challenge_index=1, id="b-1", exercise_mode="CONTAINER"),
    ]
    plan = _catalog_order_plan(
        modules,
        challenges,
        {
            "modules": [
                {
                    "moduleId": "chapter-a",
                    "items": [{"moduleIndex": 1, "challengeIndex": 1}],
                },
                {
                    "moduleId": "chapter-b",
                    "items": [
                        {"moduleIndex": 1, "challengeIndex": 0},
                        {"moduleIndex": 0, "challengeIndex": 1},
                        {"moduleIndex": 0, "challengeIndex": 0},
                    ],
                },
            ]
        },
    )

    assert [item["source"] for item in plan["positions"]] == [
        (1, 1),
        (1, 0),
        (0, 1),
        (0, 0),
    ]
    assert [item["target"] for item in plan["positions"]] == [
        (0, 0),
        (1, 0),
        (1, 1),
        (1, 2),
    ]
    assert len(plan["changed"]) == 3


@pytest.mark.parametrize(
    ("exercise_mode", "expected"),
    [
        ("CONTAINER", True),
        ("SIMULATION", True),
        ("HYBRID", True),
        ("RETIRED", False),
    ],
)
def test_course_scoped_runtime_modes_are_supported(exercise_mode, expected):
    from CTFd.plugins.dojo_plugin.models import DojoChallenges

    challenge = DojoChallenges(
        dojo_id=1,
        module_index=0,
        challenge_index=0,
        id="runtime-mode",
        exercise_mode=exercise_mode,
    )

    assert challenge.supported() is expected


def test_catalog_order_plan_rejects_a_stale_question_list():
    from CTFd.plugins.dojo_plugin.api.v1.learning import (
        CatalogOrderError,
        _catalog_order_plan,
    )

    modules = [SimpleNamespace(id="chapter-a", module_index=0, name="章节 A")]
    challenges = [
        SimpleNamespace(module_index=0, challenge_index=0, id="a-1", exercise_mode="CONTAINER")
    ]
    with pytest.raises(CatalogOrderError) as error:
        _catalog_order_plan(
            modules,
            challenges,
            {"modules": [{"moduleId": "chapter-a", "items": []}]},
        )

    assert error.value.status_code == 409
    assert "刷新页面" in str(error.value)


def test_evidence_scrubber_preserves_boolean_contracts_without_exposing_secrets():
    from CTFd.plugins.dojo_plugin.learning.evidence import scrub_payload

    assert scrub_payload(
        {
            "oneDynamicFlagPerItem": True,
            "flag": "pwn.college{private-value}",
        }
    ) == {
        "oneDynamicFlagPerItem": True,
        "flag": "[REDACTED]",
    }


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("请分析为什么系统会生成课件，而不是回答问题。", []),
        ("帮我分析已有课件的结构和不足。", []),
        ("请解释‘创建工作区’这个功能的权限边界。", []),
        ("请为软件安全课程生成一份课件。", ["create_workspace"]),
        ("请先分析资料，然后生成一份模拟演示。", ["create_workspace"]),
        ("请帮我记住我偏好先看原理再做实验。", ["remember"]),
        ("请忘记我偏好先看原理再做实验。", ["forget"]),
    ],
)
def test_student_agent_only_executes_explicit_imperative_tools(question, expected):
    from CTFd.plugins.dojo_plugin.learning.student_agent import resolve_tool_calls

    proposed = [
        {"tool": "create_workspace", "arguments": {"mode": "slides"}},
        {"tool": "remember", "arguments": {"content": question}},
        {"tool": "forget", "arguments": {"query": question}},
    ]
    resolved = resolve_tool_calls(question, proposed)
    assert [item["tool"] for item in resolved] == expected


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("请为我创建一个基于当前课程的个人模拟学习工作区。", True),
        ("把刚才的练习整理成三道自检题。", True),
        ("请创建一个通用的密码学学习计划。", False),
    ],
)
def test_student_agent_detects_current_course_scope_request(question, expected):
    from CTFd.plugins.dojo_plugin.learning.student_agent import (
        _requests_current_course_scope,
    )

    assert _requests_current_course_scope(question) is expected


def test_catalog_search_text_accepts_structured_objectives_and_tags():
    from CTFd.plugins.dojo_plugin.learning.authoring import _catalog_search_text

    text = _catalog_search_text(
        [
            "plain-tag",
            {
                "id": "objective-1",
                "title": "参数化查询",
                "description": "阻断 SQL 注入",
            },
        ]
    )
    assert "plain-tag" in text
    assert "objective-1" in text
    assert "参数化查询" in text
    assert "阻断 SQL 注入" in text


def test_source_native_spec_inherits_immutable_runtime_permissions(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    source = SimpleNamespace(
        description="原生源题",
        image="example/source:1",
        privileged=True,
        allow_privileged=False,
    )

    class SourceQuery:
        def filter_by(self, **_values):
            return self

        def first(self):
            return source

    monkeypatch.setattr(
        authoring,
        "DojoChallenges",
        SimpleNamespace(query=SourceQuery()),
    )
    spec = authoring._base_spec(
        "把现有 SQL 注入题改编为参数化查询实验",
        {"difficulty": 3},
        "L2",
        [
            {
                "challengeId": 281,
                "referenceId": "course/module/sql-injection",
                "name": "SQL 注入",
                "description": "原生源题",
                "image": "example/source:1",
                "exerciseMode": "CONTAINER",
            }
        ],
    )
    assert spec["privileged"] is True
    assert spec["allowPrivileged"] is False


@pytest.mark.parametrize("brief", [None, "", [], {}, 42])
def test_base_spec_accepts_empty_and_non_string_briefs(brief):
    from CTFd.plugins.dojo_plugin.learning import authoring

    spec = authoring._base_spec(brief, {}, "L3", [])

    assert spec["name"]
    assert spec["description"]
    assert spec["mode"] == "GENERATE_CUSTOM"


def test_artifact_response_contract_rejects_placeholders_before_repair():
    from CTFd.plugins.dojo_plugin.learning import authoring

    assert not authoring._artifact_bundle_response_complete(
        {
            "starterFiles": [],
            "oracleContract": {},
            "runtimeContract": {"services": []},
            "privateSolution": {},
        }
    )

    complete = {
        "artifacts": {
            "starterFiles": [{"path": "server.py", "content": "print(1)"}],
            "oracleContract": {
                "requiredFields": ["state"],
                "assertions": [
                    {"field": "state", "operator": "equals", "value": "ready"}
                ],
                "liveBindings": [
                    {
                        "field": "state",
                        "service": "app",
                        "method": "GET",
                        "path": "/status",
                        "capture": "json_field",
                        "selector": "state",
                    }
                ],
                "integrityFiles": ["server.py"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "app",
                        "interpreter": "python3",
                        "entrypoint": "server.py",
                        "port": 8080,
                    }
                ]
            },
            "privateSolution": {
                "overview": "完成真实服务操作",
                "steps": [{"goal": "改变状态", "action": "请求服务"}],
                "successIndicators": ["state=ready"],
            },
        }
    }
    assert authoring._artifact_bundle_response_complete(complete)
    assert authoring._contract_bundle_response_complete(complete)

    extracted = authoring._extract_artifact_bundle(
        {
            "starterFiles": [],
            "artifacts": complete["artifacts"],
        }
    )
    assert extracted["starterFiles"][0]["path"] == "server.py"


def test_blocked_authoring_report_exposes_model_fallback_for_durable_retry():
    from CTFd.plugins.dojo_plugin.api.v1.learning import (
        _authoring_retryable_model_error,
    )

    assert _authoring_retryable_model_error(
        {
            "status": "BLOCK",
            "agentReview": {
                "provider": "MODEL_FALLBACK",
                "error": "500 Server Error",
            },
        },
        {},
    ) == "500 Server Error"
    assert _authoring_retryable_model_error(
        {"status": "BLOCK", "checks": [{"id": "runtime", "status": "BLOCK"}]},
        {"authoringPipeline": {"validate": {"provider": "MODEL"}}},
    ) is None


def test_all_question_authoring_requests_use_the_container_mode():
    from CTFd.plugins.dojo_plugin.learning import authoring

    brief = (
        "生成 5 道彼此独立的 CTF，每道使用独立容器和动态 Flag。"
        "题目只能使用授权演练或教学模拟环境，不得指向公网真实系统。"
    )
    assert authoring._infer_exercise_mode(brief, {}) == "CONTAINER"
    assert authoring._infer_exercise_mode("创建一个无线安全仿真实训", {}) == "CONTAINER"


def test_final_validation_does_not_reconsume_stale_review_metadata(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    captured = {}

    def fake_model_json(_system_prompt, payload, **_kwargs):
        captured.update(payload)
        return {"verdict": "PASS", "summary": "current package passed", "findings": []}

    monkeypatch.setattr(authoring, "model_json", fake_model_json)
    draft = SimpleNamespace(
        brief="生成一道真实可运行的栈溢出 CTF",
        constraints={},
        level="L3",
        candidates=[],
    )
    authoring._model_validate(
        draft,
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "preflightReview": {
                "verdict": "BLOCK",
                "findings": [{"id": "unresolved-open-gates"}],
            },
            "repairSummary": "old findings remain",
        },
    )

    assert "preflightReview" not in captured["privateBuild"]
    assert "repairSummary" not in captured["privateBuild"]


def test_review_merge_discards_derivative_gate_but_keeps_real_semantic_finding():
    from CTFd.plugins.dojo_plugin.learning import authoring

    generated = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "unresolved-open-gates",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "AI_REVIEW",
                "message": "旧 finding 仍未关闭",
            },
            {
                "id": "oracle-objective-disconnected",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "ORACLECONTRACT",
                "message": "Flag Gate 与真实利用没有因果关系",
            },
        ],
    }
    merged, _deterministic = authoring._merge_deterministic_review(
        generated,
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "starterFiles": [],
            "oracleContract": {},
            "runtimeContract": {},
        },
    )
    ids = {item["id"] for item in merged["findings"]}

    assert "unresolved-open-gates" not in ids
    assert "oracle-objective-disconnected" in ids


def test_review_merge_keeps_deterministic_namespace_platform_owned():
    from CTFd.plugins.dojo_plugin.learning import authoring

    stale = {
        "id": "det-pwn-real-binary",
        "status": "OPEN",
        "severity": "CRITICAL",
        "stage": "STARTERFILES",
        "message": "旧轮次把日志取证题误判为 PWN。",
    }
    prior = {"verdict": "BLOCK", "findings": [stale]}
    merged, deterministic = authoring._merge_deterministic_review(
        {"verdict": "BLOCK", "findings": [stale]},
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "category": "FORENSICS",
            "name": "日志取证",
            "description": "分析访问日志并还原攻击路径。",
            "implementation": {},
            "starterFiles": [],
            "oracleContract": {},
            "runtimeContract": {},
            "privateSolution": {},
        },
        prior_review=prior,
        constraints={"batchCount": 5, "batchIndex": 3, "batchTopic": "日志取证"},
    )

    assert not any(item["id"] == "det-pwn-real-binary" for item in deterministic)
    stale_result = next(
        item for item in merged["findings"] if item["id"] == "det-pwn-real-binary"
    )
    assert stale_result["status"] == "RESOLVED"


def test_batch_topic_keeps_model_category_aligned_with_teacher_intent():
    from CTFd.plugins.dojo_plugin.learning import authoring

    constrained = authoring._enforce_explicit_public_constraints(
        {"name": "日志取证", "category": "PWN"},
        {"name": "日志取证", "category": "FORENSICS"},
        {"batchTopic": "日志取证"},
    )

    assert constrained["category"] == "FORENSICS"


def test_platform_image_name_does_not_turn_forensics_into_pwn():
    from CTFd.plugins.dojo_plugin.learning import authoring

    spec = {
        "name": "日志取证",
        "category": "FORENSICS",
        "description": "分析访问日志并还原攻击路径。",
        "authoringPlan": {
            "implementationSteps": [
                "基于 pwncollege/challenge-legacy 构建隔离练习环境。"
            ]
        },
    }

    assert not authoring._requests_native_pwn_mechanic(spec)


def test_validation_refresh_resolves_obsolete_deterministic_preflight():
    from CTFd.plugins.dojo_plugin.learning import authoring

    spec = {
        "mode": "GENERATE_CUSTOM",
        "exerciseMode": "CONTAINER",
        "name": "日志取证",
        "category": "FORENSICS",
        "description": "分析访问日志并还原攻击路径。",
        "authoringPlan": {
            "implementationSteps": [
                "基于 pwncollege/challenge-legacy 构建隔离练习环境。"
            ]
        },
        "implementation": {},
        "starterFiles": [],
        "oracleContract": {},
        "runtimeContract": {},
        "privateSolution": {},
        "preflightReview": {
            "verdict": "BLOCK",
            "summary": "旧轮次误判",
            "findings": [
                {
                    "id": "det-pwn-real-binary",
                    "status": "OPEN",
                    "severity": "CRITICAL",
                    "stage": "STARTERFILES",
                    "message": "旧轮次把日志取证题误判为 PWN。",
                }
            ],
        },
    }

    assert authoring._refresh_deterministic_preflight_review(
        spec,
        {"batchCount": 5, "batchIndex": 3, "batchTopic": "日志取证"},
    )
    finding = next(
        item
        for item in spec["preflightReview"]["findings"]
        if item["id"] == "det-pwn-real-binary"
    )
    assert finding["status"] == "RESOLVED"


def test_batch_topic_difficulty_follows_confirmed_natural_language_allocation():
    from CTFd.plugins.dojo_plugin.learning import authoring

    brief = (
        "难度分配为：输入验证题为基础，会话权限题为基础，"
        "配置错误题为中等，日志取证题为中等，安全编码题为提高。"
    )
    topics = ["输入验证", "会话权限", "日志取证", "配置错误", "安全编码"]

    assert [
        authoring._infer_difficulty(
            brief,
            {"batchIndex": index, "batchTopic": topic},
        )
        for index, topic in enumerate(topics, 1)
    ] == [1, 1, 2, 2, 3]
    assert authoring._infer_difficulty(
        brief,
        {
            "batchIndex": 4,
            "batchTopic": "配置错误",
            "difficultyByItem": ["基础", "基础", "中等", "中等", "提高"],
        },
    ) == 2


def test_review_normalization_does_not_restore_derivative_prior_findings():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_validation_review,
        _review_requires_repair,
    )

    prior_review = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "unresolved-open-gates",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "AI_REVIEW",
                "message": "旧 finding 仍未关闭",
            }
        ],
    }
    normalized = _normalize_validation_review(
        {"verdict": "PASS", "summary": "current package passed", "findings": []},
        prior_review=prior_review,
    )

    assert normalized["verdict"] == "PASS"
    assert normalized["findings"] == []
    assert not _review_requires_repair(prior_review)


def test_review_normalization_matches_prior_ids_after_slug_normalization():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_validation_review,
    )

    normalized = _normalize_validation_review(
        {
            "verdict": "PASS",
            "summary": "fixed",
            "findings": [
                {
                    "id": "oracle_objective_disconnected",
                    "status": "RESOLVED",
                    "severity": "HIGH",
                    "stage": "ORACLECONTRACT",
                    "message": "目标与 Flag Gate 已形成因果闭环",
                }
            ],
        },
        prior_review={
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "oracle_objective_disconnected",
                    "status": "OPEN",
                    "severity": "HIGH",
                    "stage": "ORACLECONTRACT",
                    "message": "目标与 Flag Gate 脱节",
                }
            ],
        },
    )

    assert normalized["verdict"] == "PASS"
    assert normalized["findings"][0]["id"] == "oracle-objective-disconnected"
    assert normalized["findings"][0]["status"] == "RESOLVED"


def test_public_spec_excludes_internal_authoring_and_repair_metadata():
    from CTFd.plugins.dojo_plugin.learning.authoring import _public_spec

    public = _public_spec(
        {
            "id": "safe-lab",
            "name": "Safe lab",
            "repairSummary": "private repair details",
            "rebuildSummary": "private rebuild details",
            "initialPreflightReview": {"verdict": "BLOCK"},
            "publicSanitization": {"redactions": 2},
            "authoringPipeline": {"private": True},
        }
    )
    assert public == {"id": "safe-lab", "name": "Safe lab"}


def test_source_reference_review_finding_cannot_block_native_adaptation():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _merge_deterministic_review,
    )

    prior = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "source-reference",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "PUBLICSPEC.SOURCEREFERENCE",
                "message": "sourceReferenceId 与适配后的公开标题不同",
                "recommendation": "修改 sourceReferenceId",
            }
        ],
    }
    merged, _deterministic = _merge_deterministic_review(
        prior,
        {
            "mode": "ADAPT_EXISTING",
            "exerciseMode": "CONTAINER",
            "sourceChallengeId": 281,
            "sourceReferenceId": "course/module/sql-injection",
            "name": "参数化查询实验",
            "description": "在保留原生运行包的前提下改编教学目标。",
            "oracleContract": {},
            "runtimeContract": {},
        },
        prior_review=prior,
    )
    finding = next(
        item for item in merged["findings"] if item["id"] == "source-reference"
    )
    assert finding["status"] == "RESOLVED"


def test_flag_gate_filters_unused_answer_and_misplaced_integrity_findings():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _merge_deterministic_review,
    )

    findings = [
        {
            "id": "verification-answer-mismatch",
            "status": "OPEN",
            "severity": "MEDIUM",
            "stage": "PRIVATEBUILD",
            "message": "Static verificationAnswer mismatches the dynamic service value",
            "recommendation": "Remove verificationAnswer",
        },
        {
            "id": "runtime-integrityfiles-missing",
            "status": "OPEN",
            "severity": "HIGH",
            "stage": "RUNTIMECONTRACT",
            "message": "runtimeContract has no integrityFiles",
            "recommendation": "Add integrityFiles to runtimeContract",
        },
    ]
    prior = {"verdict": "BLOCK", "findings": findings}
    merged, _deterministic = _merge_deterministic_review(
        prior,
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "starterFiles": [
                {"path": "app.py", "content": "print('ready')"},
                {"path": "README.md", "content": "Run the exercise."},
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["observed"],
                "assertions": [
                    {
                        "field": "observed",
                        "operator": "equals",
                        "value": "expected-response-hash",
                    }
                ],
                "liveBindings": [
                    {
                        "field": "observed",
                        "service": "app",
                        "method": "GET",
                        "path": "/status",
                        "headers": {},
                        "capture": "body_sha256",
                    }
                ],
                "integrityFiles": ["app.py", "README.md"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "app",
                        "interpreter": "python3",
                        "entrypoint": "app.py",
                        "arguments": [],
                        "port": 8000,
                    }
                ]
            },
            "privateSolution": {
                "overview": "Observe the service.",
                "steps": [{"goal": "Observe", "action": "GET /status"}],
                "successIndicators": ["The observed hash matches."],
            },
            "verificationAnswer": "unused-static-value",
            "authoringPipeline": {"build": {"provider": "MODEL"}},
        },
        prior_review=prior,
    )

    by_id = {item["id"]: item for item in merged["findings"]}
    assert by_id["verification-answer-mismatch"]["status"] == "RESOLVED"
    assert by_id["runtime-integrityfiles-missing"]["status"] == "RESOLVED"


def test_explicit_adaptation_falls_back_when_catalog_candidate_is_not_relevant():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _select_authoring_strategy,
    )

    candidates = [
        {
            "challengeId": 281,
            "referenceId": "legacy/browser-service",
            "name": "浏览器 Web 服务",
            "description": "访问状态接口并读取动态凭证。",
            "exerciseMode": "CONTAINER",
            "score": 5,
            "difficulty": 2,
        }
    ]
    level, _ordered, decision = _select_authoring_strategy(
        "改编现有题，生成一道 SQL 注入与参数化查询修复 CTF 实践题",
        {},
        candidates,
    )

    assert level == "L3"
    assert decision["mode"] == "GENERATE_CUSTOM"
    assert decision["selectedChallengeId"] is None
    assert "没有达到主题相关性门槛" in decision["reason"]


def test_batch_topic_rejects_high_score_but_semantically_unrelated_native_source():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _select_authoring_strategy,
    )

    candidates = [
        {
            "challengeId": 281,
            "referenceId": "legacy/browser-connectivity",
            "name": "浏览器连通性验证",
            "description": "访问固定 token 的验证端点并确认服务在线。",
            "exerciseMode": "CONTAINER",
            "score": 99,
            "difficulty": 2,
        }
    ]
    level, _ordered, decision = _select_authoring_strategy(
        "改编现有题，生成一道会话权限 CTF 实践题",
        {"batchTopic": "会话权限"},
        candidates,
    )

    assert level == "L3"
    assert decision["mode"] == "GENERATE_CUSTOM"
    assert decision["selectedChallengeId"] is None
    assert "不能支撑本题唯一分配主题" in decision["reason"]


def test_batch_topic_allows_a_semantically_matching_native_source():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _select_authoring_strategy,
    )

    candidates = [
        {
            "challengeId": 282,
            "referenceId": "web/session-authorization",
            "name": "会话固定与越权访问",
            "description": "分析 session cookie 并修复授权检查。",
            "exerciseMode": "CONTAINER",
            "score": 99,
            "difficulty": 2,
        }
    ]
    level, ordered, decision = _select_authoring_strategy(
        "改编现有题，生成一道会话权限 CTF 实践题",
        {"batchTopic": "会话权限"},
        candidates,
    )

    assert level == "L2"
    assert ordered[0]["challengeId"] == 282
    assert decision["selectedChallengeId"] == "282"


def test_strategy_rejects_native_source_with_invalid_python_launcher(
    monkeypatch, tmp_path
):
    from CTFd.plugins.dojo_plugin.learning import authoring

    (tmp_path / ".init").write_text(
        "#!/bin/bash\npython3 /challenge/server.py\n",
        encoding="utf-8",
    )
    (tmp_path / "server.py").write_text(
        'print("unterminated)\n',
        encoding="utf-8",
    )
    source = SimpleNamespace(importable=True, path=tmp_path)

    class SourceQuery:
        def filter_by(self, **_values):
            return self

        def first(self):
            return source

    monkeypatch.setattr(
        authoring,
        "DojoChallenges",
        SimpleNamespace(query=SourceQuery()),
    )
    level, _ordered, decision = authoring._select_authoring_strategy(
        "改编现有题，生成一道会话权限 CTF 实践题",
        {"batchTopic": "会话权限"},
        [
            {
                "challengeId": 282,
                "referenceId": "web/session-authorization",
                "name": "会话固定与越权访问",
                "description": "分析 session cookie 并修复授权检查。",
                "exerciseMode": "CONTAINER",
                "origin": "PLATFORM_CATALOG",
                "score": 99,
            }
        ],
    )

    assert level == "L3"
    assert decision["selectedChallengeId"] is None
    assert "原生启动入口未通过静态可运行性检查" in decision["reason"]
    assert "server.py" in decision["reason"]


def test_strategy_allows_native_source_with_valid_python_launcher(monkeypatch, tmp_path):
    from CTFd.plugins.dojo_plugin.learning import authoring

    (tmp_path / ".init").write_text(
        "#!/bin/bash\npython3 /challenge/server.py\n",
        encoding="utf-8",
    )
    (tmp_path / "server.py").write_text(
        'print("ready")\n',
        encoding="utf-8",
    )
    source = SimpleNamespace(importable=True, path=tmp_path)

    class SourceQuery:
        def filter_by(self, **_values):
            return self

        def first(self):
            return source

    monkeypatch.setattr(
        authoring,
        "DojoChallenges",
        SimpleNamespace(query=SourceQuery()),
    )
    level, ordered, decision = authoring._select_authoring_strategy(
        "改编现有题，生成一道会话权限 CTF 实践题",
        {"batchTopic": "会话权限"},
        [
            {
                "challengeId": 282,
                "referenceId": "web/session-authorization",
                "name": "会话固定与越权访问",
                "description": "分析 session cookie 并修复授权检查。",
                "exerciseMode": "CONTAINER",
                "origin": "PLATFORM_CATALOG",
                "score": 99,
            }
        ],
    )

    assert level == "L2"
    assert ordered[0]["challengeId"] == 282
    assert decision["selectedChallengeId"] == "282"


def test_authoring_repair_cycle_limit_includes_fallback_closure_paths(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    review = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "bounded-repair",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "RUNTIME",
            }
        ],
    }
    calls = {"repair": 0, "review": 0}

    def repair(*_args, **_kwargs):
        calls["repair"] += 1
        return (
            {
                "mode": "GENERATE_CUSTOM",
                "exerciseMode": "CONTAINER",
                "starterFiles": [],
            },
            {"provider": "MODEL", "mode": "EXACT_PATCH"},
        )

    def re_review(*_args, **_kwargs):
        calls["review"] += 1
        return review, {"provider": "MODEL"}

    monkeypatch.setattr(authoring, "_model_repair", repair)
    monkeypatch.setattr(authoring, "_model_preflight_review", re_review)
    monkeypatch.setattr(authoring, "_needs_artifact_closure_repair", lambda *_: False)
    monkeypatch.setattr(authoring, "_needs_contract_closure_repair", lambda *_: False)
    _spec, _review, stage, _post_review = authoring._repair_until_clear(
        "生成一道有界修正的 CTF 实践题",
        {},
        "L3",
        [],
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "starterFiles": [],
        },
        review,
        max_cycles=1,
    )

    assert len(stage["cycles"]) == 1
    assert calls == {"repair": 1, "review": 1}
    assert 5 <= authoring.AUTONOMOUS_VALIDATION_MAX_ROUNDS <= 8


def test_semantic_objective_mismatch_routes_directly_to_coherence_rebuild(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    review = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "misleading-pwn-objective-and-sim",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "IMPLEMENTATION",
                "message": "题面要求栈溢出，实际却是布尔模拟。",
            }
        ],
    }
    rebuilt = {
        "mode": "GENERATE_CUSTOM",
        "exerciseMode": "CONTAINER",
        "starterFiles": [{"path": "challenge.c", "content": "int main(void){}"}],
    }
    calls = []

    def coherence(*_args, **_kwargs):
        calls.append("coherence")
        return rebuilt, {"provider": "MODEL", "mode": "COHERENCE_REBUILD"}

    def unexpected(*_args, **_kwargs):
        raise AssertionError("semantic mismatch must not use a local patch first")

    monkeypatch.setattr(authoring, "_model_coherence_rebuild", coherence)
    monkeypatch.setattr(authoring, "_model_artifact_closure_repair", unexpected)
    monkeypatch.setattr(authoring, "_model_contract_closure_repair", unexpected)
    monkeypatch.setattr(authoring, "_model_repair", unexpected)
    monkeypatch.setattr(
        authoring,
        "_model_preflight_review",
        lambda *_args, **_kwargs: (
            {"verdict": "PASS", "findings": []},
            {
                "provider": "MODEL",
                "model": authoring.DOJO_AI_AUTHORING_VALIDATE_MODEL,
            },
        ),
    )

    _spec, _review, stage, _post_review = authoring._repair_until_clear(
        "生成一道真实栈溢出 CTF",
        {},
        "L3",
        [],
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "starterFiles": [{"path": "server.py", "content": "STATE=False"}],
        },
        review,
        max_cycles=3,
    )

    assert calls == ["coherence"]
    assert [cycle["mode"] for cycle in stage["cycles"]] == ["COHERENCE_REBUILD"]


def test_coherence_rebuild_requires_real_native_mechanic_for_pwn(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    captured = {}

    def fake_model_json(system_prompt, _payload, **_kwargs):
        captured["prompt"] = system_prompt
        return None

    monkeypatch.setattr(authoring, "model_json", fake_model_json)
    built = {
        "mode": "GENERATE_CUSTOM",
        "exerciseMode": "CONTAINER",
        "starterFiles": [{"path": "server.py", "content": "STATE = False"}],
    }
    rebuilt, stage = authoring._model_coherence_rebuild(
        "生成真实栈溢出 CTF",
        {},
        "L3",
        [],
        built,
        {
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "misleading-pwn-objective-and-sim",
                    "status": "OPEN",
                    "severity": "CRITICAL",
                }
            ],
        },
    )

    assert rebuilt is built
    assert stage["provider"] == "DETERMINISTIC"
    assert "真实的本地原生漏洞源码" in captured["prompt"]
    assert "布尔开关" in captured["prompt"]


def test_only_a_fresh_model_pass_can_be_reused_as_authoring_attestation():
    from CTFd.plugins.dojo_plugin.learning import authoring

    passing_review = {
        "verdict": "PASS",
        "findings": [
            {
                "id": "fixed-runtime",
                "status": "RESOLVED",
                "severity": "HIGH",
                "stage": "RUNTIME",
            }
        ],
    }
    model_stage = {
        "provider": "MODEL",
        "model": authoring.DOJO_AI_AUTHORING_VALIDATE_MODEL,
    }

    assert authoring._review_can_attest(passing_review, model_stage)
    assert not authoring._review_can_attest(
        {
            "verdict": "PASS",
            "findings": [
                {
                    "id": "still-open",
                    "status": "OPEN",
                    "severity": "MEDIUM",
                    "stage": "ORACLE",
                }
            ],
        },
        model_stage,
    )
    assert not authoring._review_can_attest(
        passing_review,
        {**model_stage, "provider": "MODEL_FALLBACK"},
    )


def test_clean_preflight_review_primes_final_deterministic_attestation():
    from CTFd.plugins.dojo_plugin.learning import authoring

    brief = "创建一题无线网络异常处置模拟题"
    constraints = {
        "id": "wireless-attestation",
        "title": "无线接入异常诊断",
        "exerciseMode": "SIMULATION",
        "simulation": {"preset": "WIRELESS"},
    }
    spec = authoring._base_spec(brief, constraints, "L3", [])
    spec["preflightReview"] = {
        "verdict": "PASS",
        "summary": "独立审查通过",
        "findings": [],
    }
    spec["authoringPipeline"] = {
        "review": {
            "provider": "MODEL",
            "model": authoring.DOJO_AI_AUTHORING_VALIDATE_MODEL,
        },
        "postReview": {
            "provider": "SKIPPED",
            "model": authoring.DOJO_AI_AUTHORING_VALIDATE_MODEL,
        },
    }
    draft = SimpleNamespace(
        brief=brief,
        constraints=constraints,
        spec=spec,
        validation={},
    )

    assert authoring._prime_clean_preflight_attestation(draft) is True
    assert draft.validation["status"] == "PASS"
    assert draft.validation["agentReview"]["provider"] == "MODEL"
    assert draft.validation["packageDigest"] == authoring._package_digest(draft.spec)


def test_publish_gate_reuses_current_pass_without_calling_model(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    brief = "创建一个用于快速发布回归测试的容器安全题"
    constraints = {
        "id": "fast-publish-regression",
        "title": "快速发布回归测试",
        "exerciseMode": "CONTAINER",
        "difficulty": 2,
    }
    spec = authoring._base_spec(brief, constraints, "L3", [])
    spec = authoring._synchronize_requested_metadata(spec, brief, constraints)
    spec["privateSolution"] = {
        "overview": "按结构化场景的确定性路径完成目标。",
        "steps": [{"goal": "完成目标", "action": "执行允许的场景动作"}],
        "successIndicators": ["所有必需目标均已完成"],
    }
    draft = SimpleNamespace(
        id="draft-fast-publish",
        brief=brief,
        constraints=constraints,
        level="L3",
        candidates=[],
        spec=spec,
        status="VALIDATED",
        validation={},
        published_challenge_id=None,
        module_index=0,
        dojo=SimpleNamespace(modules=[SimpleNamespace(challenges=[])]),
        author_id=1,
    )
    draft.validation = {
        "status": "PASS",
        "packageDigest": authoring._package_digest(spec),
        "checks": [],
        "agentReview": {
            "provider": "MODEL_FALLBACK",
            "model": authoring.DOJO_AI_AUTHORING_VALIDATE_MODEL,
            "verdict": "FALLBACK",
            "findings": [],
        },
        "validatedAt": "2026-08-27T00:00:00Z",
    }

    def unexpected_model_call(*_args, **_kwargs):
        raise AssertionError("publishing must never wait for a model review")

    monkeypatch.setattr(authoring, "_model_validate", unexpected_model_call)
    monkeypatch.setattr(authoring, "_audit", lambda *_args, **_kwargs: None)

    assert authoring._publish_validation_is_current(draft)
    report = authoring.validate_draft(
        draft,
        allow_agent_repair=False,
        reuse_attested_review=True,
        reuse_current_pass=True,
    )

    assert report["status"] == "PASS"
    assert report["agentReview"]["provider"] == "DETERMINISTIC"
    assert report["agentReview"]["reused"] is True
    assert report["agentReview"]["reusedProvider"] == "MODEL_FALLBACK"


def test_publish_gate_rejects_stale_or_blocked_validation():
    from CTFd.plugins.dojo_plugin.learning import authoring

    spec = {"id": "publish-gate", "name": "Publish gate"}
    draft = SimpleNamespace(
        status="VALIDATED",
        spec=spec,
        validation={
            "status": "PASS",
            "packageDigest": authoring._package_digest(spec),
            "checks": [],
            "agentReview": {"verdict": "FALLBACK", "findings": []},
        },
    )
    assert authoring._publish_validation_is_current(draft)

    draft.validation["checks"] = [{"status": "BLOCK"}]
    assert not authoring._publish_validation_is_current(draft)
    draft.validation["checks"] = []
    draft.spec = {**spec, "name": "Changed after validation"}
    assert not authoring._publish_validation_is_current(draft)


def test_validation_repair_review_does_not_turn_summary_gate_into_finding():
    from CTFd.plugins.dojo_plugin.learning import authoring

    report = {
        "agentReview": {
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "runtime-mismatch",
                    "status": "OPEN",
                    "severity": "HIGH",
                    "stage": "RUNTIME",
                    "message": "入口与运行合约不一致",
                    "recommendation": "对齐真实入口",
                }
            ],
        },
        "checks": [
            {
                "id": "authoring-preflight",
                "status": "BLOCK",
                "stage": "AI_REVIEW",
                "message": "仍有 1 个开放的中高风险红队 finding",
            },
            {
                "id": "agent-runtime-mismatch-1",
                "status": "BLOCK",
                "stage": "RUNTIME",
                "message": "入口与运行合约不一致",
            },
        ],
    }

    repair_review = authoring._validation_repair_review(report)
    assert [item["id"] for item in repair_review["findings"]] == ["runtime-mismatch"]


def test_teacher_strategy_progress_hides_internal_levels_and_modes():
    from CTFd.plugins.dojo_plugin.learning import authoring

    message, details = authoring._teacher_strategy_progress(
        "L3",
        {
            "level": "L3",
            "mode": "GENERATE_CUSTOM",
            "candidateCount": 10,
            "reason": "L3 / GENERATE_CUSTOM 最符合要求",
            "model": "internal-model",
        },
    )

    assert "L3" not in message
    assert "GENERATE_CUSTOM" not in message
    assert details == {
        "approach": "新建题目",
        "candidateCount": 10,
        "externalEvidenceCount": 0,
        "reason": "新建题目 / 新建题目 最符合要求",
    }
    assert "level" not in details
    assert "model" not in details


def test_contract_repair_routing_ignores_derivative_preflight_gate():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _needs_contract_closure_repair,
    )

    review = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "det-oracle-live-evidence",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "ORACLECONTRACT",
                "message": "自定义 Web 服务题缺少平台实时服务取证",
            },
            {
                "id": "gate-authoring-preflight",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "AI_REVIEW",
                "message": "仍有开放的中高风险红队 finding",
            },
            {
                "id": "gate-oracle-live-evidence",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "ORACLE",
                "message": "自定义 Web 服务题缺少平台实时服务取证",
            },
            {
                "id": "preflight-still-blocked",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "AI_REVIEW",
                "message": "预审仍为 BLOCK，repairSummary 与实际字段不符",
            },
        ],
    }

    assert _needs_contract_closure_repair(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "starterFiles": [{"path": "app.py", "content": "pass"}],
        },
        review,
    )


def test_fresh_independent_pass_supersedes_only_stale_preflight_wrapper():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _refresh_stale_preflight_from_fresh_review,
    )

    spec = {
        "preflightReview": {
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "old-oracle",
                    "status": "OPEN",
                    "severity": "CRITICAL",
                }
            ],
        }
    }
    checks = [
        {
            "id": "authoring-preflight",
            "stage": "AI_REVIEW",
            "status": "BLOCK",
            "message": "旧预审仍阻断",
        },
        {
            "id": "oracle-live-evidence",
            "stage": "ORACLE",
            "status": "PASS",
            "message": "动态取证有效",
        },
    ]
    fresh = {
        "verdict": "PASS",
        "summary": "当前题包独立复核通过",
        "findings": [
            {
                "id": "minor-style",
                "status": "OPEN",
                "severity": "LOW",
            }
        ],
    }

    assert _refresh_stale_preflight_from_fresh_review(spec, checks, fresh)
    assert checks[0]["status"] == "PASS"
    assert checks[1]["status"] == "PASS"
    assert spec["preflightReview"] == fresh


def test_model_request_deadline_is_total_wall_clock_time():
    import requests

    from CTFd.plugins.dojo_plugin.learning import intelligence

    started = time.monotonic()
    with pytest.raises(requests.Timeout):
        with intelligence._model_request_deadline(0.02):
            time.sleep(0.2)
    assert time.monotonic() - started < 0.15


def test_model_request_deadline_nests_inside_longer_host_deadline():
    import requests

    from CTFd.plugins.dojo_plugin.learning import intelligence

    started = time.monotonic()
    with pytest.raises(requests.Timeout):
        with intelligence._model_request_deadline(0.2):
            with intelligence._model_request_deadline(0.02):
                time.sleep(0.2)
    assert time.monotonic() - started < 0.15


def test_model_json_total_deadline_includes_retries(monkeypatch):
    import requests

    from CTFd.plugins.dojo_plugin.learning import intelligence

    calls = []

    def slow_failure(*_args, **_kwargs):
        calls.append(time.monotonic())
        time.sleep(0.04)
        raise requests.ConnectionError("temporary upstream failure")

    monkeypatch.setattr(intelligence, "DOJO_AI_ENABLED", True)
    monkeypatch.setattr(intelligence, "DOJO_AI_API_KEY", "test-key")
    monkeypatch.setattr(intelligence, "DOJO_AI_TOTAL_TIMEOUT_SECONDS", 0.06)
    monkeypatch.setattr(intelligence.requests, "post", slow_failure)

    started = time.monotonic()
    with pytest.raises(requests.RequestException):
        intelligence.model_json(
            "system",
            {"task": "bounded retry"},
            model="test-model",
            attempts=3,
        )
    assert time.monotonic() - started < 0.15
    assert 1 <= len(calls) <= 2


def test_oracle_live_binding_accepts_bounded_json_array_selector():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_oracle_contract,
    )

    contract = _normalize_oracle_contract(
        {
            "type": "FLAG_GATE_V1",
            "requiredFields": ["injected_secret", "fixed_query"],
            "assertions": [
                {
                    "field": "fixed_query",
                    "operator": "equals",
                    "value": "SELECT value WHERE id = ?",
                }
            ],
            "liveBindings": [
                {
                    "field": "injected_secret",
                    "service": "app",
                    "method": "GET",
                    "path": "/user?username=%27%20UNION%20SELECT%20NULL%2CNULL%2Cvalue%20FROM%20secret_data--%20",
                    "headers": {},
                    "capture": "json_field",
                    "selector": "$[0].password_hash",
                }
            ],
            "integrityFiles": ["app.py"],
        }
    )

    assert contract["liveBindings"][0]["selector"] == "$[0].password_hash"
    assert contract["type"] == "FLAG_GATE_V1"
    assert "submissionPath" not in contract


def test_oracle_live_binding_normalizes_common_json_path_key():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_oracle_contract,
    )

    contract = _normalize_oracle_contract(
        {
            "type": "FLAG_GATE_V1",
            "requiredFields": ["injected_secret", "fixed_query"],
            "assertions": [
                {
                    "field": "fixed_query",
                    "operator": "equals",
                    "value": "SELECT value WHERE id = ?",
                }
            ],
            "liveBindings": [
                {
                    "field": "injected_secret",
                    "service": "app",
                    "method": "GET",
                    "path": "/user?username=probe",
                    "headers": {},
                    "capture": "json_field",
                    "jsonPath": "$[0].password_hash",
                }
            ],
            "integrityFiles": ["app.py"],
        }
    )

    assert contract["liveBindings"] == [
        {
            "field": "injected_secret",
            "service": "app",
            "method": "GET",
            "path": "/user?username=probe",
            "headers": {},
            "capture": "json_field",
            "selector": "$[0].password_hash",
        }
    ]


def test_legacy_report_contract_migrates_to_private_flag_gate():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_oracle_contract,
    )

    contract = _normalize_oracle_contract(
        {
            "type": "REPORT_JSON_V1",
            "submissionPath": "/home/hacker/solution.json",
            "requiredFields": ["pwned"],
            "assertions": [{"field": "pwned", "operator": "equals", "value": True}],
            "liveBindings": [
                {
                    "field": "pwned",
                    "service": "target",
                    "method": "GET",
                    "path": "/state",
                    "headers": {},
                    "capture": "json_field",
                    "selector": "pwned",
                }
            ],
        }
    )

    assert contract["type"] == "FLAG_GATE_V1"
    assert contract["schemaVersion"] == "dojo-learning-flag-gate/1.0"
    assert "submissionPath" not in contract
    assert "maxBytes" not in contract


def test_legacy_report_package_cannot_be_reused_as_a_native_source():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _profile_uses_legacy_report_protocol,
    )

    assert _profile_uses_legacy_report_protocol(
        SimpleNamespace(package={"runtimePolicy": "GENERATED_REPORT_JSON_V1"})
    )
    assert _profile_uses_legacy_report_protocol(
        SimpleNamespace(package={"oracleContract": {"type": "REPORT_JSON_V1"}})
    )
    assert not _profile_uses_legacy_report_protocol(
        SimpleNamespace(package={"runtimePolicy": "GENERATED_FLAG_GATE_V1"})
    )


def test_profile_lookup_skips_transient_source_without_challenge_id(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    class UnexpectedQuery:
        def get(self, _challenge_id):
            raise AssertionError("transient source must not query a persisted profile")

    monkeypatch.setattr(
        authoring.LearningChallengeProfiles,
        "query",
        UnexpectedQuery(),
    )

    assert authoring._profile_for(SimpleNamespace()) is None


def test_flag_gate_instructions_only_ask_learner_to_get_flag():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _append_oracle_instructions,
    )

    description = _append_oracle_instructions(
        (
            "利用栈溢出改变服务状态，并验证控制流已被劫持。\n\n"
            "提交要求：完成题目目标后，平台将自动检测到完成状态并签发本次环境的"
            "动态 Flag，请将该 Flag 提交到平台，仅接受 Flag 提交。\n\n"
            "完成实验后，请将观察与结论写入 `/home/hacker/solution.json`，"
            "并运行 `/challenge/check` 验证。"
        ),
        {
            "type": "FLAG_GATE_V1",
            "requiredFields": ["pwned"],
            "assertions": [{"field": "pwned", "operator": "equals", "value": True}],
            "liveBindings": [],
        },
    )

    assert "/challenge/check" in description
    assert "动态 Flag" in description
    assert "solution.json" not in description
    assert "JSON" not in description
    assert "自动检测到完成状态" not in description
    assert "仅接受 Flag 提交" not in description

    repeated = _append_oracle_instructions(description, {})
    assert repeated.count("### 提交与验证") == 1
    assert repeated.count("动态 Flag") == 1


def test_generated_flag_gate_rejects_student_report_fields():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _deterministic_preflight_findings,
    )

    findings = _deterministic_preflight_findings(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "category": "PWN",
            "implementation": {"summary": "stack overflow service"},
            "starterFiles": [{"path": "server.py", "content": "print('ready')"}],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["pwned"],
                "assertions": [{"field": "pwned", "operator": "equals", "value": True}],
                "liveBindings": [],
                "integrityFiles": ["server.py"],
            },
            "runtimeContract": {"services": []},
            "privateSolution": {
                "overview": "Trigger the overflow.",
                "steps": [{"goal": "pwn", "action": "send payload"}],
                "successIndicators": ["pwned state is true"],
            },
        }
    )

    assert any(finding["id"] == "det-flag-gate-live-state" for finding in findings)


def test_batch_contract_rejects_one_challenge_that_repeats_the_whole_batch_count():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _deterministic_preflight_findings,
        _model_constraints,
    )

    constraints = {
        "batchCount": 5,
        "batchIndex": 1,
        "batchTopic": "输入验证",
        "batchContract": {"oneDraftPerItem": True},
        "independentChallenge": True,
    }
    visible_constraints = _model_constraints(constraints)
    assert visible_constraints == constraints

    findings = _deterministic_preflight_findings(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "name": "输入验证五关任务线",
            "description": "学生依次完成五个任务，最后使用同一个动态 Flag 通过判题。",
            "category": "WEB",
            "implementation": {},
            "starterFiles": [],
            "oracleContract": {},
            "runtimeContract": {},
            "privateSolution": {},
        },
        constraints,
    )

    assert any(
        finding["id"] == "det-batch-collapsed-into-one" for finding in findings
    )


def test_generated_flag_gate_requires_a_concrete_success_value():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _deterministic_preflight_findings,
    )

    findings = _deterministic_preflight_findings(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "category": "PWN",
            "implementation": {"summary": "stack overflow service"},
            "starterFiles": [{"path": "server.py", "content": "PORT = 8128\n"}],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["pwned"],
                "assertions": [{"field": "pwned", "operator": "exists"}],
                "liveBindings": [
                    {
                        "field": "pwned",
                        "service": "target",
                        "method": "GET",
                        "path": "/state",
                        "headers": {},
                        "capture": "json_field",
                        "selector": "pwned",
                    }
                ],
                "integrityFiles": ["server.py"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "target",
                        "interpreter": "python3",
                        "entrypoint": "server.py",
                        "arguments": [],
                        "port": 8128,
                    }
                ]
            },
            "privateSolution": {
                "overview": "Trigger the overflow.",
                "steps": [{"goal": "pwn", "action": "send payload"}],
                "successIndicators": ["pwned state is true"],
            },
        }
    )

    assert any(finding["id"] == "det-oracle-outcome" for finding in findings)


def test_generated_runtime_rejects_private_flag_reads_and_starter_file_mutation():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_runtime_contract,
        _runtime_contract_diagnostics,
    )

    spec = {
        "mode": "GENERATE_CUSTOM",
        "starterFiles": [
            {
                "path": "server.py",
                "content": (
                    "import http.server\n"
                    'FLAG_FILE = "/flag.txt"\n'
                    'NOTES_FILE = "notes.txt"\n'
                    'with open(NOTES_FILE, "w", encoding="utf-8") as handle:\n'
                    '    handle.write("ready")\n'
                    "class Handler(http.server.BaseHTTPRequestHandler):\n"
                    "    pass\n"
                    'http.server.ThreadingHTTPServer(("0.0.0.0", 8128), Handler).serve_forever()\n'
                ),
            },
            {"path": "notes.txt", "content": "initial\n"},
        ],
        "runtimeContract": {
            "services": [
                {
                    "name": "challenge",
                    "interpreter": "python3",
                    "entrypoint": "server.py",
                    "arguments": [],
                    "port": 8128,
                }
            ]
        },
    }

    diagnostics = _runtime_contract_diagnostics(
        spec, _normalize_runtime_contract(spec["runtimeContract"])
    )

    assert any("平台私有 Flag 路径" in item for item in diagnostics)
    assert any("starter file：notes.txt" in item for item in diagnostics)


def test_generated_runtime_accepts_in_memory_state_without_private_flag_access():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _normalize_runtime_contract,
        _runtime_contract_diagnostics,
    )

    spec = {
        "mode": "GENERATE_CUSTOM",
        "starterFiles": [
            {
                "path": "server.py",
                "content": (
                    "import http.server\n"
                    "# The service never reads /flag.txt; the platform checker owns it.\n"
                    'STATE = {"solved": False}\n'
                    "class Handler(http.server.BaseHTTPRequestHandler):\n"
                    "    pass\n"
                    'http.server.ThreadingHTTPServer(("0.0.0.0", 8128), Handler).serve_forever()\n'
                ),
            }
        ],
        "runtimeContract": {
            "services": [
                {
                    "name": "challenge",
                    "interpreter": "python3",
                    "entrypoint": "server.py",
                    "arguments": [],
                    "port": 8128,
                }
            ]
        },
    }

    diagnostics = _runtime_contract_diagnostics(
        spec, _normalize_runtime_contract(spec["runtimeContract"])
    )

    assert not any("平台私有 Flag 路径" in item for item in diagnostics)
    assert not any("受完整性保护的 starter file" in item for item in diagnostics)


def test_generated_challenge_rejects_public_private_flag_path_contract():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _deterministic_preflight_findings,
    )

    findings = _deterministic_preflight_findings(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "category": "WEB",
            "description": (
                "利用命令注入读取服务器上的敏感文件 /flag.txt，并提交读取到的动态 Flag。"
                "重置后 /flag.txt 会更换。"
            ),
            "objectives": ["利用漏洞读取 /flag.txt"],
            "implementation": {"summary": "observable injection service"},
            "starterFiles": [
                {
                    "path": "app.py",
                    "content": (
                        'STATE = {"injection_succeeded": False}\n'
                        "import http.server\n"
                        "class Handler(http.server.BaseHTTPRequestHandler):\n"
                        "    pass\n"
                        'http.server.ThreadingHTTPServer(("0.0.0.0", 8128), Handler).serve_forever()\n'
                    ),
                }
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["injection_succeeded"],
                "assertions": [
                    {
                        "field": "injection_succeeded",
                        "operator": "equals",
                        "value": True,
                    }
                ],
                "liveBindings": [
                    {
                        "field": "injection_succeeded",
                        "service": "challenge",
                        "method": "GET",
                        "path": "/status",
                        "capture": "json_field",
                        "selector": "injection_succeeded",
                    }
                ],
                "integrityFiles": ["app.py"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "challenge",
                        "interpreter": "python3",
                        "entrypoint": "app.py",
                        "arguments": [],
                        "port": 8128,
                    }
                ]
            },
            "privateSolution": {
                "overview": "Trigger the observable state transition.",
                "steps": [{"goal": "solve", "action": "send injection"}],
                "successIndicators": ["injection_succeeded is true"],
            },
        }
    )

    assert any(
        finding["id"] == "det-public-private-flag-path" for finding in findings
    )


def test_generated_challenge_allows_platform_flag_gate_and_negative_path_note():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _public_private_flag_path_claims,
    )

    claims = _public_private_flag_path_claims(
        {
            "description": (
                "题目服务不得读取 /flag.txt。通过真实操作触发完成状态后，"
                "运行 `/challenge/check` 获取本次会话的动态 Flag。"
            ),
            "objectives": ["触发 injection_succeeded=true"],
        }
    )

    assert claims == []


def test_generated_challenge_blocks_answer_constants_and_starter_flag_protocol():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _deterministic_preflight_findings,
    )

    findings = _deterministic_preflight_findings(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "HYBRID",
            "implementation": {"summary": "Caesar analysis service"},
            "starterFiles": [
                {
                    "path": "server.py",
                    "content": (
                        "CORRECT_SHIFT = 5\n"
                        "def result():\n"
                        '    return {"solved": True, "flag": "never"}\n'
                    ),
                }
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["solved"],
                "assertions": [
                    {"field": "solved", "operator": "equals", "value": True}
                ],
                "liveBindings": [
                    {
                        "field": "solved",
                        "service": "challenge",
                        "method": "GET",
                        "path": "/api/state",
                        "capture": "json_field",
                        "selector": "solved",
                    }
                ],
                "integrityFiles": ["server.py"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "challenge",
                        "interpreter": "python3",
                        "entrypoint": "server.py",
                        "arguments": [],
                        "port": 8128,
                    }
                ]
            },
            "privateSolution": {
                "overview": "Solve the service.",
                "steps": [{"goal": "solve", "action": "submit shift"}],
                "successIndicators": ["solved is true"],
            },
        }
    )

    finding_ids = {finding["id"] for finding in findings}
    assert "det-starter-answer-disclosure" in finding_ids
    assert "det-starter-flag-protocol" in finding_ids


def test_generated_challenge_blocks_runtime_minted_second_flag():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _student_file_protocol_findings,
    )

    findings = _student_file_protocol_findings(
        {
            "starterFiles": [
                {
                    "path": "app.py",
                    "content": (
                        'FLAG = "flag{" + uuid.uuid4().hex + "}"\n'
                        'content = f\'FLAG = "{FLAG}"\\n\'\n'
                        "self.wfile.write(content.encode())\n"
                        'STATE = {"flag_captured": False}\n'
                    ),
                }
            ]
        }
    )

    assert {finding["id"] for finding in findings} == {
        "det-starter-flag-protocol"
    }


def test_generated_challenge_blocks_static_get_route_that_directly_flips_gate():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _student_file_protocol_findings,
    )

    findings = _student_file_protocol_findings(
        {
            "starterFiles": [
                {
                    "path": "app.py",
                    "content": (
                        "TRIGGERED = False\n"
                        "class Handler:\n"
                        "    def do_GET(self):\n"
                        "        global TRIGGERED\n"
                        "        if self.path == '/app.py.bak':\n"
                        "            try:\n"
                        "                body = open('app.py.bak').read()\n"
                        "                TRIGGERED = True\n"
                        "            except FileNotFoundError:\n"
                        "                pass\n"
                    ),
                }
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["triggered"],
                "assertions": [
                    {"field": "triggered", "operator": "equals", "value": True}
                ],
                "liveBindings": [
                    {
                        "field": "triggered",
                        "service": "challenge",
                        "method": "GET",
                        "path": "/status",
                        "capture": "json_field",
                        "selector": "triggered",
                    }
                ],
                "integrityFiles": ["app.py"],
            },
        }
    )

    assert {finding["id"] for finding in findings} == {
        "det-static-route-completion"
    }


def test_generated_challenge_allows_static_route_with_second_dynamic_action():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _student_file_protocol_findings,
    )

    findings = _student_file_protocol_findings(
        {
            "starterFiles": [
                {
                    "path": "app.py",
                    "content": (
                        "import secrets\n"
                        "SESSION_NONCE = secrets.token_urlsafe(18)\n"
                        "TRIGGERED = False\n"
                        "class Handler:\n"
                        "    def do_GET(self):\n"
                        "        global TRIGGERED\n"
                        "        if self.path == '/submit':\n"
                        "            supplied = self.headers.get('X-Nonce')\n"
                        "            if supplied == SESSION_NONCE:\n"
                        "                TRIGGERED = True\n"
                    ),
                }
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["triggered"],
                "assertions": [
                    {"field": "triggered", "operator": "equals", "value": True}
                ],
                "liveBindings": [
                    {
                        "field": "triggered",
                        "service": "challenge",
                        "method": "GET",
                        "path": "/status",
                        "capture": "json_field",
                        "selector": "triggered",
                    }
                ],
                "integrityFiles": ["app.py"],
            },
        }
    )

    assert not any(
        finding["id"] == "det-static-route-completion" for finding in findings
    )


@pytest.mark.parametrize(
    "finding_id",
    [
        "det-starter-answer-disclosure",
        "det-starter-flag-protocol",
        "det-static-route-completion",
        "det-public-private-flag-path",
    ],
)
def test_student_file_protocol_failures_require_full_artifact_closure(finding_id):
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _needs_artifact_closure_repair,
    )

    assert _needs_artifact_closure_repair(
        {"mode": "GENERATE_CUSTOM"},
        {
            "findings": [
                {
                    "id": finding_id,
                    "status": "OPEN",
                    "severity": "CRITICAL",
                }
            ]
        },
    )


@pytest.mark.parametrize(
    ("finding_id", "message"),
    [
        (
            "new-pubspec-answer-leak",
            "题面与提示直接给出完整路径，学生无需枚举或分析即可照做，答案完全泄露。",
        ),
        (
            "new-starter-source-leak",
            "starter source 中的 base64 可解码为决定性路径，触发条件完全暴露。",
        ),
    ],
)
def test_answer_or_source_leak_requires_full_artifact_closure(finding_id, message):
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _needs_artifact_closure_repair,
    )

    assert _needs_artifact_closure_repair(
        {"mode": "GENERATE_CUSTOM"},
        {
            "findings": [
                {
                    "id": finding_id,
                    "status": "OPEN",
                    "severity": "CRITICAL",
                    "stage": "PUBLICSPEC",
                    "message": message,
                }
            ]
        },
    )


@pytest.mark.parametrize(
    "description",
    [
        "访问备份文件，从 /app.py.bak 中提取动态 Flag 并提交。",
        "题目服务会在响应中返回 Flag，读取后完成挑战。",
        "Download the backup file and extract the flag from it.",
        "The service response contains the session flag.",
    ],
)
def test_nonplatform_public_flag_delivery_requires_full_exact_patch(description):
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _needs_artifact_closure_repair,
        _needs_contract_closure_repair,
        _public_uses_nonplatform_flag_delivery,
    )

    spec = {
        "mode": "GENERATE_CUSTOM",
        "description": description,
        "objectives": ["通过真实行为完成题目"],
    }
    review = {
        "findings": [
            {
                "id": "det-starter-flag-protocol",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "STARTERFILES",
            }
        ]
    }

    assert _public_uses_nonplatform_flag_delivery(spec)
    assert not _needs_artifact_closure_repair(spec, review)
    assert not _needs_contract_closure_repair(spec, review)


def test_platform_check_public_flag_delivery_keeps_artifact_closure():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _needs_artifact_closure_repair,
        _public_uses_nonplatform_flag_delivery,
    )

    spec = {
        "mode": "GENERATE_CUSTOM",
        "description": (
            "利用备份文件泄露触发完成状态，然后运行 /challenge/check "
            "获取本次会话的动态 Flag。"
        ),
    }
    review = {
        "findings": [
            {
                "id": "det-starter-flag-protocol",
                "status": "OPEN",
                "severity": "CRITICAL",
            }
        ]
    }

    assert not _public_uses_nonplatform_flag_delivery(spec)
    assert _needs_artifact_closure_repair(spec, review)


def test_platform_injected_challenge_check_is_not_reported_as_missing():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _merge_deterministic_review,
    )

    merged, _deterministic = _merge_deterministic_review(
        {
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "model-check-missing",
                    "status": "OPEN",
                    "severity": "CRITICAL",
                    "message": "/challenge/check 未在实现中，无法返回 Flag",
                    "recommendation": "在 server.py 中实现该路径",
                },
                {
                    "id": "model-check-not-public",
                    "status": "OPEN",
                    "severity": "HIGH",
                    "message": "/challenge/check 不会对学生公开，学生无法取得 Flag",
                    "recommendation": "把检查器源码加入 starterFiles",
                },
                {
                    "id": "model-check-should-not-run",
                    "status": "OPEN",
                    "severity": "HIGH",
                    "message": (
                        "学生无需且不应运行 /challenge/check，平台会自动校验并发放 Flag"
                    ),
                    "recommendation": "从公开题面移除该命令",
                },
            ],
        },
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "HYBRID",
            "implementation": {"summary": "observable service"},
            "starterFiles": [
                {"path": "server.py", "content": 'STATE = {"solved": False}\n'}
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["solved"],
                "assertions": [
                    {"field": "solved", "operator": "equals", "value": True}
                ],
                "liveBindings": [
                    {
                        "field": "solved",
                        "service": "challenge",
                        "method": "GET",
                        "path": "/api/state",
                        "capture": "json_field",
                        "selector": "solved",
                    }
                ],
                "integrityFiles": ["server.py"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "challenge",
                        "interpreter": "python3",
                        "entrypoint": "server.py",
                        "arguments": [],
                        "port": 8128,
                    }
                ]
            },
            "privateSolution": {
                "overview": "Complete the observable state transition.",
                "steps": [{"goal": "solve", "action": "submit a candidate"}],
                "successIndicators": ["solved is true"],
            },
        },
    )

    assert not any(
        finding.get("id")
        in {
            "model-check-missing",
            "model-check-not-public",
            "model-check-should-not-run",
        }
        for finding in merged["findings"]
    )


def test_real_flag_gate_solve_path_mismatch_is_not_filtered_as_injection_noise():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _merge_deterministic_review,
    )

    merged, _deterministic = _merge_deterministic_review(
        {
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "model-solve-path-mismatch",
                    "status": "OPEN",
                    "severity": "CRITICAL",
                    "message": (
                        "公开解题路径要求提取 code 并运行 /challenge/check <code>，"
                        "但客观完成条件只读取初始状态；学生无需提取或提交 code 即可直接通过。"
                    ),
                    "recommendation": "让真实解题动作先改变服务状态。",
                }
            ],
        },
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "implementation": {"summary": "observable service"},
            "starterFiles": [
                {"path": "server.py", "content": 'STATE = {"solved": False}\n'}
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["solved"],
                "assertions": [
                    {"field": "solved", "operator": "equals", "value": True}
                ],
                "liveBindings": [
                    {
                        "field": "solved",
                        "service": "challenge",
                        "method": "GET",
                        "path": "/api/state",
                        "capture": "json_field",
                        "selector": "solved",
                    }
                ],
                "integrityFiles": ["server.py"],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "challenge",
                        "interpreter": "python3",
                        "entrypoint": "server.py",
                        "arguments": [],
                        "port": 8128,
                    }
                ]
            },
            "privateSolution": {
                "overview": "Complete the observable state transition.",
                "steps": [{"goal": "solve", "action": "/challenge/check <code>"}],
                "successIndicators": ["solved is true"],
            },
        },
    )

    assert any(
        finding.get("id") == "model-solve-path-mismatch"
        for finding in merged["findings"]
    )
    assert any(
        finding.get("id") == "det-generated-check-argument"
        for finding in merged["findings"]
    )


def test_generated_check_argument_is_repaired_to_live_state_then_no_arg_flag_gate():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _model_artifact_closure_repair,
    )

    spec = {
        "mode": "GENERATE_CUSTOM",
        "exerciseMode": "CONTAINER",
        "description": (
            "从 records.log 提取动态 code。完成分析后，运行 "
            "`/challenge/check <code>` 提交凭证并取得 Flag。"
        ),
        "oracleContract": {
            "type": "FLAG_GATE_V1",
            "requiredFields": ["analysis_complete"],
            "assertions": [
                {
                    "field": "analysis_complete",
                    "operator": "equals",
                    "value": True,
                }
            ],
            "liveBindings": [
                {
                    "field": "analysis_complete",
                    "service": "log_status",
                    "method": "GET",
                    "path": "/status",
                    "capture": "json_field",
                    "selector": "analysis_complete",
                }
            ],
        },
        "privateSolution": {
            "steps": [
                {
                    "goal": "提交提取结果",
                    "action": (
                        '运行 curl "http://localhost:8000/verify?code=<提取到的code>"'
                    ),
                    "expectedEvidence": (
                        "返回 analysis_complete=true，表示状态更新成功。"
                    ),
                },
                {
                    "goal": "取 Flag",
                    "action": "/challenge/check <code>",
                    "expectedEvidence": "返回动态 Flag。",
                },
            ],
            "successIndicators": ["/challenge/check <code> 返回 Flag"],
        },
    }
    repaired, stage = _model_artifact_closure_repair(
        "日志取证题",
        {},
        "L2",
        [],
        spec,
        {
            "verdict": "BLOCK",
            "findings": [
                {
                    "id": "det-generated-check-argument",
                    "status": "OPEN",
                    "severity": "CRITICAL",
                }
            ],
        },
    )

    public_text = repaired["description"]
    private_text = json.dumps(repaired["privateSolution"], ensure_ascii=False)
    assert "verify?code=<提取到的code>" in public_text
    assert "提交凭证并取得 Flag" not in public_text
    assert "/challenge/check <code>" not in public_text
    assert "/challenge/check <code>" not in private_text
    assert "无参数" not in public_text or "/challenge/check`" in public_text
    assert "完成题目目标后运行 `/challenge/check`" in public_text
    assert stage["provider"] == "DETERMINISTIC"
    assert stage["mode"] == "CHECK_CONTRACT_NORMALIZATION"
    assert stage["publicStateActionRecovered"] is True


def test_generated_runtime_service_is_probed_instead_of_restarted():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _private_solution_runtime_diagnostics,
        _synchronize_generated_metadata,
    )

    spec = _synchronize_generated_metadata(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "description": "访问该路径获得动态 Flag。",
            "objectives": ["访问目标路径以获取动态 Flag"],
            "starterFiles": [
                {
                    "path": "server.py",
                    "content": (
                        "from http.server import HTTPServer, "
                        "BaseHTTPRequestHandler\n"
                        "HTTPServer(('127.0.0.1', 8128), "
                        "BaseHTTPRequestHandler).serve_forever()\n"
                    ),
                }
            ],
            "oracleContract": {
                "type": "FLAG_GATE_V1",
                "requiredFields": ["ready"],
                "assertions": [{"field": "ready", "operator": "equals", "value": True}],
                "liveBindings": [
                    {
                        "field": "ready",
                        "service": "web",
                        "method": "GET",
                        "path": "/status",
                        "capture": "json_field",
                        "selector": "ready",
                    }
                ],
            },
            "runtimeContract": {
                "services": [
                    {
                        "name": "web",
                        "interpreter": "python3",
                        "entrypoint": "server.py",
                        "arguments": [],
                        "port": 8128,
                    }
                ]
            },
            "privateSolution": {
                "overview": (
                    "复用题目环境；不要运行 /challenge/check <code>，"
                    "应先触发实时完成状态。"
                ),
                "steps": [
                    {
                        "goal": "检查环境",
                        "action": ("禁止执行 `python3 server.py`；随后访问服务。"),
                        "expectedEvidence": "服务返回 ready=true。",
                    },
                    {
                        "goal": "完成目标",
                        "action": "执行 curl http://127.0.0.1:8128/solve",
                        "expectedEvidence": "返回 solved=true。",
                    },
                ],
                "successIndicators": ["状态变为 solved=true"],
                "commonFailureModes": [],
                "protectedFacts": {},
            },
        }
    )

    normalized_runtime = spec["runtimeContract"]
    assert not _private_solution_runtime_diagnostics(spec, normalized_runtime)
    first_step = spec["privateSolution"]["steps"][0]
    assert "python3 server.py" not in first_step["action"]
    assert "curl -sS --max-time 2 http://127.0.0.1:8128/status" in first_step["action"]
    assert "触发题目完成状态" in spec["description"]
    assert "触发题目完成状态" in spec["objectives"][0]
    assert "完成题目目标后运行 `/challenge/check`" in spec["description"]
    assert "/challenge/check <code>" not in json.dumps(
        spec["privateSolution"], ensure_ascii=False
    )
    assert "不要运行 /challenge/check" not in spec["privateSolution"]["overview"]
    assert (
        "无需向 `/challenge/check` 传入答案参数" in spec["privateSolution"]["overview"]
    )


def test_explicit_difficulty_survives_model_repairs():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _synchronize_requested_metadata,
    )

    synchronized = _synchronize_requested_metadata(
        {
            "mode": "GENERATE_CUSTOM",
            "difficulty": 1,
            "description": "完成目标后取得动态 Flag。",
        },
        "生成一道中等难度的输入验证 CTF 实践题",
        {"difficulty": 2},
    )

    assert synchronized["difficulty"] == 2


def test_explicit_teacher_metadata_survives_model_repairs():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _synchronize_requested_metadata,
    )

    synchronized = _synchronize_requested_metadata(
        {
            "id": "model-renamed-task",
            "name": "模型改写的名称",
            "description": "模型改写的说明",
            "category": "MODEL",
            "difficulty": 5,
            "exerciseMode": "CONTAINER",
            "objectives": ["模型改写的目标"],
            "tags": ["model"],
            "mode": "GENERATE_CUSTOM",
            "simulation": {"preset": "WIRELESS"},
        },
        "创建一题无线网络异常处置模拟题",
        {
            "id": "wireless-sim-stable",
            "title": "无线接入异常诊断",
            "description": "教师明确要求保留的题目说明，用于验证请求元数据不会被模型修复回合覆盖。",
            "category": "GENERAL",
            "difficulty": 2,
            "exerciseMode": "SIMULATION",
            "objectives": ["建立无线基线", "调整信道并复测"],
            "tags": ["无线", "诊断", "无线"],
            "simulation": {"preset": "WIRELESS"},
        },
    )

    assert synchronized["id"] == "wireless-sim-stable"
    assert synchronized["name"] == "无线接入异常诊断"
    assert synchronized["description"].startswith("教师明确要求保留")
    assert synchronized["category"] == "GENERAL"
    assert synchronized["difficulty"] == 2
    assert synchronized["exerciseMode"] == "SIMULATION"
    assert synchronized["objectives"] == ["建立无线基线", "调整信道并复测"]
    assert synchronized["tags"] == ["无线", "诊断"]
    assert synchronized["simulation"]["sourcePreset"] == "WIRELESS"
    assert synchronized["privateSolution"]["steps"]
    assert synchronized["privateSolution"]["successIndicators"]
    assert synchronized["privateSolution"]["protectedFacts"]["scenarioDigest"]


@pytest.mark.parametrize(
    ("batch_index", "batch_topic", "expected"),
    [
        (1, "输入验证", 1),
        (2, "会话权限", 2),
        (3, "日志取证", 2),
        (4, "配置错误", 1),
        (5, "安全编码", 3),
    ],
)
def test_named_batch_difficulty_allocation_survives_model_repairs(
    batch_index, batch_topic, expected
):
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _synchronize_requested_metadata,
    )

    brief = (
        "一次生成 5 道题，难度分配为 2 道基础、2 道中等、1 道提高；"
        "基础题为输入验证和配置错误，中等题为会话权限和日志取证，"
        f"提高题为安全编码。\n这是批次中的独立题，本题唯一分配主题为“{batch_topic}”。"
    )
    synchronized = _synchronize_requested_metadata(
        {"mode": "GENERATE_CUSTOM", "difficulty": 1},
        brief,
        {
            "difficulty": "2道基础、2道中等、1道提高",
            "batchIndex": batch_index,
            "batchTopic": batch_topic,
        },
    )

    assert synchronized["difficulty"] == expected


def test_ordered_batch_difficulty_distribution_is_used_without_named_topics():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _synchronize_requested_metadata,
    )

    synchronized = _synchronize_requested_metadata(
        {"mode": "GENERATE_CUSTOM", "difficulty": 1},
        "一次生成五道独立 CTF。",
        {
            "difficulty": "2道基础、2道中等、1道提高",
            "batchIndex": 5,
        },
    )

    assert synchronized["difficulty"] == 3


def test_authoring_job_batch_view_exposes_each_question_position():
    from CTFd.plugins.dojo_plugin.api.v1.learning import _authoring_batch_view

    assert _authoring_batch_view(
        {
            "constraints": {
                "batchId": "studio_batch_123",
                "batchIndex": 2,
                "batchCount": 5,
                "batchTopic": "会话权限",
            }
        }
    ) == {
        "id": "studio_batch_123",
        "index": 2,
        "count": 5,
        "topic": "会话权限",
    }
    assert _authoring_batch_view(
        {
            "batch": {"id": "agent_batch_456", "index": "3", "count": "4"},
            "constraints": {"batchIndex": 1, "batchTopic": "日志取证"},
        }
    ) == {
        "id": "agent_batch_456",
        "index": 3,
        "count": 4,
        "topic": "日志取证",
    }
    assert _authoring_batch_view({"constraints": {}}) is None


def test_platform_started_runtime_instructions_are_synchronized():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _synchronize_platform_started_runtime_instructions,
    )

    spec = {
        "description": "先运行 `simulator.py`，再提交候选密钥。",
        "objectives": [
            "在隔离沙箱中启动古典密码加解密模拟器并确认环境可用",
            "观察解密过程",
        ],
        "privateSolution": {
            "steps": [
                {
                    "goal": "准备服务",
                    "action": "python3 simulator.py",
                    "expectedEvidence": "端口可访问",
                }
            ]
        },
    }
    _synchronize_platform_started_runtime_instructions(
        spec,
        [
            {
                "name": "cipher-simulator",
                "entrypoint": "simulator.py",
                "port": 5000,
            }
        ],
    )

    public_text = "\n".join([spec["description"], *spec["objectives"]])
    assert "运行 `simulator.py`" not in public_text
    assert "启动古典密码加解密模拟器" not in public_text
    assert "平台已启动" in public_text
    assert spec["privateSolution"]["steps"][0]["action"] == (
        "确认平台已启动的题目服务可访问"
    )


def test_explicit_simulation_constraints_are_emitted_in_new_specs():
    from CTFd.plugins.dojo_plugin.learning import authoring

    spec = authoring._base_spec(
        "创建一个无线安全仿真实训",
        {
            "exerciseMode": "SIMULATION",
            "simulation": {"preset": "WIRELESS"},
        },
        "L3",
        [],
    )

    assert spec["exerciseMode"] == "SIMULATION"
    assert isinstance(spec["simulation"], dict)
    assert spec["interfaces"] == [{"name": "Simulation"}]


def test_wireless_scenario_requires_client_evidence_before_diagnosis():
    from CTFd.plugins.dojo_plugin.learning.simulation import (
        default_wireless_scenario,
        verify_scenario_reachability,
    )

    scenario = default_wireless_scenario()
    result = verify_scenario_reachability(scenario)
    path = [step["actionId"] for step in result["path"]]
    actions = {item["id"]: item for item in scenario["actions"]}

    assert result["reachable"] is True
    assert result["shortestTurns"] == 6
    assert "inspect-client" in path
    assert path.index("inspect-client") < path.index("form-hypothesis")
    assert scenario["initialState"]["public"]["spectrum"]["channels"] == []
    assert any(
        effect.get("path") == "/public/spectrum/channels"
        and len(effect.get("value") or []) == 3
        for effect in actions["scan-spectrum"]["effects"]
    )
    assert actions["inspect-client"]["maxUses"] == 1


def test_custom_challenge_public_description_redacts_complete_sql_payload():
    from CTFd.plugins.dojo_plugin.learning.authoring import (
        _synchronize_generated_metadata,
    )

    spec = _synchronize_generated_metadata(
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "description": (
                "尝试使用 ' OR '1'='1 观察未参数化查询，再说明单引号为何会影响 SQL。"
            ),
            "starterFiles": [],
            "oracleContract": {},
            "runtimeContract": {},
        }
    )
    assert "' OR '1'='1" not in spec["description"]
    assert "单引号为何会影响 SQL" in spec["description"]
    assert spec["publicSanitization"]["sqlPayloadRedactions"] == 1


def wait_for_authoring(session, response, timeout=180):
    """Wait for the durable authoring worker and return its private draft."""

    assert response.status_code == 202, response.text
    job = response.json()["job"]
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        polled = session.get(f"{API}/authoring/jobs/{job['id']}")
        assert polled.status_code == 200, polled.text
        job = polled.json()["job"]
        if job["status"] == "FAILED":
            pytest.fail(job.get("error") or "authoring job failed")
        if job["status"] == "COMPLETED":
            assert job["draftId"]
            draft_response = session.get(f"{API}/drafts/{job['draftId']}")
            assert draft_response.status_code == 200, draft_response.text
            return draft_response.json()["draft"], job
        time.sleep(0.5)
    pytest.fail(f"authoring job {job['id']} did not complete within {timeout}s")


def test_learning_overview_and_teacher_permissions(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    overview = random_user_session.get(f"{API}/overview")
    assert overview.status_code == 200
    overview_data = overview.json()
    course = next(
        item for item in overview_data["courses"] if item["id"] == simple_award_dojo
    )
    assert course["role"] == "student"
    assert not course["enrolled"]
    assert course["studioUrl"] is None
    assert course["moduleCount"] == 1
    assert course["publishedItemCount"] == 2
    assert course["submissionCount"] == 0
    assert course["solveCount"] == 0
    assert course["modules"][0]["id"] == "hello"
    assert len(course["modules"][0]["publishedItems"]) == 2
    assert course in overview_data["availableCourses"]

    course_list = random_user_session.get(COURSES_API)
    assert course_list.status_code == 200
    course_summary = next(
        item for item in course_list.json()["dojos"] if item["id"] == simple_award_dojo
    )
    assert course_summary["moduleCount"] == 1
    assert course_summary["publishedItemCount"] == 2
    assert course_summary["requiredItemCount"] == 2

    enrollment = random_user_session.post(
        f"{COURSES_API}/{simple_award_dojo}/enrollment", json={}
    )
    assert enrollment.status_code == 201
    assert enrollment.json()["enrollment"] == {
        "courseId": simple_award_dojo,
        "role": "member",
    }
    repeated_enrollment = random_user_session.post(
        f"{COURSES_API}/{simple_award_dojo}/enrollment", json={}
    )
    assert repeated_enrollment.status_code == 200

    enrolled_overview = random_user_session.get(f"{API}/overview").json()
    enrolled_course = next(
        item
        for item in enrolled_overview["enrolledCourses"]
        if item["id"] == simple_award_dojo
    )
    assert enrolled_course["enrolled"]
    assert enrolled_overview["summary"]["enrolledCourses"] >= 1
    assert enrolled_overview["summary"]["modules"] >= 1
    assert enrolled_overview["summary"]["publishedItems"] >= 2

    today_overview = random_user_session.get(f"{API}/overview?view=today")
    assert today_overview.status_code == 200, today_overview.text
    today_course = next(
        item
        for item in today_overview.json()["enrolledCourses"]
        if item["id"] == simple_award_dojo
    )
    assert today_course["modules"] == []
    assert today_course["publishedItemCount"] == 2
    assert today_course["nextItem"]["id"] == "apple"
    assert set(today_overview.json()["workspace"]) == {"count"}

    navigation = random_user_session.get(f"{API}/overview?view=navigation")
    assert navigation.status_code == 200, navigation.text
    navigation_course = next(
        item for item in navigation.json()["courses"] if item["id"] == simple_award_dojo
    )
    assert navigation_course["modules"][0]["id"] == "hello"
    assert len(navigation_course["modules"][0]["publishedItems"]) == 2

    dashboard = random_user_session.get(f"{API}/dojos/{simple_award_dojo}/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["standards"] == {
        "assessment": "客观结果与过程表现分别计分",
        "evidence": "过程记录可复核",
        "tutor": "提示优先，不直接泄露答案",
    }
    assert len(dashboard.json()["skills"]) == 6

    denied = random_user_session.post(
        f"{API}/dojos/{simple_award_dojo}/authoring",
        json={
            "brief": "Create a security exercise that only teachers may publish.",
            "moduleId": "hello",
        },
    )
    assert denied.status_code == 403

    teacher_overview = admin_session.get(f"{API}/overview")
    teacher_course = next(
        item
        for item in teacher_overview.json()["courses"]
        if item["id"] == simple_award_dojo
    )
    assert teacher_course["role"] == "teacher"
    assert teacher_course["studioUrl"] == (
        f"/teacher/courses?dojo={simple_award_dojo}&tab=questions"
    )


def test_student_resource_resolver_keeps_valid_historic_challenge_links(
    random_user_session,
    simple_award_dojo,
):
    enrollment = random_user_session.post(
        f"{COURSES_API}/{simple_award_dojo}/enrollment",
        json={},
    )
    assert enrollment.status_code in {200, 201}, enrollment.text
    target = f"/{simple_award_dojo}/hello/apple"

    response = random_user_session.post(
        f"{API}/resources/resolve",
        json={
            "resources": [
                {
                    "key": "legacy-url",
                    "objectType": "link",
                    "objectId": "",
                    "url": target,
                },
                {
                    "key": "structured-ref",
                    "objectType": "challenge",
                    "objectId": f"{simple_award_dojo}:hello:apple",
                    "url": target,
                },
                {
                    "key": "unknown-old-link",
                    "objectType": "link",
                    "objectId": "",
                    "url": "/obsolete-learning-entry",
                },
            ]
        },
    )

    assert response.status_code == 200, response.text
    resolved = {
        item["key"]: item
        for item in response.json()["data"]["resources"]
    }
    for key in ("legacy-url", "structured-ref"):
        assert resolved[key]["status"] == "AVAILABLE"
        assert resolved[key]["objectType"] == "challenge"
        assert resolved[key]["href"] == target
    assert resolved["unknown-old-link"]["status"] == "UNRESOLVED"
    assert resolved["unknown-old-link"]["reasonCode"] == "REFERENCE_NOT_RESOLVED"


def test_student_snapshot_excludes_future_course_modules(
    random_user_session,
    visibility_test_dojo,
):
    enrolled = random_user_session.get(
        f"{DOJO_URL.rstrip('/')}/dojo/{visibility_test_dojo}/join/"
    )
    assert enrolled.status_code == 200, enrolled.text
    overview = random_user_session.get(f"{API}/overview")
    assert overview.status_code == 200, overview.text
    course = next(
        item
        for item in overview.json()["workspace"]["courses"]
        if item["referenceId"] == visibility_test_dojo
    )
    assert [module["id"] for module in course["modules"]] == ["module2"]


def test_membership_is_authoritative_for_stale_active_attempt(
    random_user,
    simple_award_dojo,
):
    user_name, student_session = random_user
    enrollment = student_session.post(
        f"{COURSES_API}/{simple_award_dojo}/enrollment",
        json={},
    )
    assert enrollment.status_code in {200, 201}, enrollment.text
    start_challenge(
        simple_award_dojo,
        "hello",
        "apple",
        session=student_session,
    )
    user_id = get_user_id(user_name)
    dojo_name, dojo_suffix = simple_award_dojo.split("~", 1)
    db_sql(
        "DELETE FROM dojo_users "
        f"WHERE user_id = {user_id} AND dojo_id = "
        f"(SELECT dojo_id FROM dojos WHERE id = '{dojo_name}' "
        f"AND right(to_hex(dojo_id), 8) = '{dojo_suffix}');"
    )
    overview = student_session.get(f"{API}/overview")
    assert overview.status_code == 200, overview.text
    payload = overview.json()
    assert payload["activeAttempt"] is None
    assert payload["staleContext"]["state"] == "STALE"
    assert payload["nextAction"]["type"] != "CONTINUE_ATTEMPT"
    cleared = student_session.delete(f"{API}/attempts/current", json={})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["data"]["cleared"] is True
    assert student_session.get(f"{API}/attempts/current").json()["active"] is False
    student_session.delete(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/docker",
        json={},
    )


def test_legacy_sensai_redirect_preserves_query_without_a_slash_trap(
    admin_session,
    simple_award_dojo,
):
    response = admin_session.get(
        f"{DOJO_URL.rstrip('/')}/sensai",
        params={"course": simple_award_dojo, "intent": "review"},
        allow_redirects=False,
    )
    assert response.status_code == 308
    assert response.headers["Location"].startswith("/guide?")
    assert f"course={simple_award_dojo}" in response.headers["Location"]
    assert "intent=review" in response.headers["Location"]


def test_student_experience_telemetry_accepts_safe_metrics_and_rejects_content(
    random_user_session,
):
    accepted = random_user_session.post(
        f"{API}/telemetry",
        json={
            "event": "student_next_action_started",
            "properties": {
                "type": "PRACTICE",
                "latencyMs": 480,
                "sourcePage": "today",
            },
        },
    )
    assert accepted.status_code == 202
    assert accepted.json()["data"]["accepted"] is True

    rejected = random_user_session.post(
        f"{API}/telemetry",
        json={
            "event": "student_next_action_started",
            "properties": {"type": "PRACTICE", "content": "private answer"},
        },
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "INVALID_TELEMETRY"


def test_question_management_deep_link_uses_the_course_shell(
    admin_session,
    simple_award_dojo,
):
    page = admin_session.get(
        f"{DOJO_URL.rstrip('/')}/teacher/courses/{simple_award_dojo}/questions",
        params={"tab": "author"},
        allow_redirects=False,
    )
    assert page.status_code == 308
    assert page.headers["Location"].startswith("/teacher/courses?")
    assert f"dojo={simple_award_dojo}" in page.headers["Location"]
    assert "tab=questions" in page.headers["Location"]

    course_center = admin_session.get(
        f"{DOJO_URL.rstrip('/')}/teacher/courses",
        params={"dojo": simple_award_dojo, "tab": "questions"},
    )
    assert course_center.status_code == 200
    assert 'data-cs-panel="questions"' in course_center.text
    assert 'id="cs-question-manage-toggle"' in course_center.text
    assert course_center.text.count('data-cs-tab="questions"') == 1
    assert "learning-studio-embedded" not in course_center.text
    assert "质量与学情" not in course_center.text
    root = pathlib.Path(__file__).resolve().parents[1]
    course_script = (
        root / "dojo_theme/static/js/dojo/teacher-courses.js"
    ).read_text()
    assert "`/teacher/courses?dojo=${reference}&tab=questions`" in course_script
    assert 'labs: "questions"' in course_script
    assert 'classroom: "demos"' in course_script

    legacy = admin_session.get(
        f"{DOJO_URL.rstrip('/')}/dojo/{simple_award_dojo}/studio",
        params={"embedded": "1", "author": "1", "module": "hello"},
        allow_redirects=False,
    )
    assert legacy.status_code == 308
    assert legacy.headers["Location"].startswith("/teacher/courses?")
    assert f"dojo={simple_award_dojo}" in legacy.headers["Location"]
    assert "embedded=" not in legacy.headers["Location"]
    assert "tab=author" in legacy.headers["Location"]


def test_teacher_course_center_separates_questions_and_demos():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    navigation_sources = [
        root / "dojo_theme/templates/module.html",
        root / "dojo_theme/static/js/dojo/teacher-manual-create.js",
        root / "dojo_theme/static/js/dojo/teaching-agent.js",
        root / "dojo_plugin/api/v1/teaching.py",
    ]

    assert template.count('data-cs-tab="questions"') == 1
    assert template.count('data-cs-tab="demos"') == 1
    assert template.count('data-cs-panel="questions"') == 1
    assert template.count('data-cs-panel="demos"') == 1
    assert 'data-cs-panel="labs"' not in template
    assert 'data-cs-tab-target="questions"' in template
    assert 'data-cs-tab-target="demos"' in template
    assert 'labs: "questions"' in script
    assert 'classroom: "demos"' in script
    assert '"questions", "demos"' in script
    assert 'data-create-kind="demo"' in template
    assert 'id: "simulation"' in script
    assert 'id: "attack-defense"' in script
    assert 'new Set(["simulation", "attack-defense-scene", "classroom-scenario"])' in script
    assert all("tab=labs" not in path.read_text() for path in navigation_sources)
    assert all("tab=questions" in path.read_text() for path in navigation_sources)


def test_teacher_course_detail_header_uses_a_dedicated_course_switch_action():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()

    assert 'id="cs-switch-course"' in template
    assert 'id="cs-switch-course" class="hub-button is-secondary" href="/teacher/courses"' in template
    assert "切换课程" in template
    assert ">课程工作空间</span>" not in template
    assert 'id="cs-course-meta"' not in template
    assert 'id="cs-course-select"' not in template
    assert 'course: document.getElementById("cs-course-select")' not in script
    assert "elements.course.value" not in script
    assert "elements.course.addEventListener" not in script
    assert ".hub-course-picker" not in stylesheet


def test_page_heavy_dependencies_and_hidden_course_tabs_load_on_demand():
    root = pathlib.Path(__file__).resolve().parents[1]
    base = (root / "dojo_theme/templates/base.html").read_text()
    course_script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    load_course = course_script.split("async function loadCourse(", 1)[1].split(
        "function openAgent", 1
    )[0]

    assert '<script defer src="https://cdn.jsdelivr.net/npm/katex' not in base
    assert '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex' not in base
    assert "var hasMath = body.dataset.renderMath === 'true';" in base
    assert "document.createTreeWalker(body, NodeFilter.SHOW_TEXT)" in base
    assert "parent.closest('script,noscript,style,textarea,pre,code')" in base
    assert 'if (state.workspace) void ensureTabData(name);' in course_script
    assert "async function ensureTabData(name)" in course_script
    assert "await ensureTabData(tab)" in load_course
    assert 'loadCourseContent("materials")' not in load_course
    assert 'loadCourseContent("courseware")' not in load_course
    assert 'loadCourseContent("demos")' not in load_course
    assert "loadQuestionContent()" not in load_course


def test_course_code_join_flow_is_exposed_to_teachers_and_students():
    root = pathlib.Path(__file__).resolve().parents[1]
    teacher_template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    teacher_script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    teacher_style = (root / "dojo_theme/static/css/course-hub.css").read_text()
    student_template = (root / "dojo_theme/templates/learning.html").read_text()
    student_script = (root / "dojo_theme/static/js/dojo/learning-overview.js").read_text()
    course_api = (root / "dojo_plugin/api/v1/dojos.py").read_text()
    teaching_api = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    assert 'id="cs-open-agent"' not in teacher_template
    assert 'id="cs-course-code-trigger"' in teacher_template
    assert 'aria-controls="cs-course-code-dialog"' in teacher_template
    assert 'id="cs-course-code-dialog"' in teacher_template
    assert 'role="dialog" aria-modal="true"' in teacher_template
    assert 'class="hub-surface hub-course-code"' not in teacher_template
    assert 'id="cs-course-code"' in teacher_template
    assert 'id="cs-copy-course-code"' in teacher_template
    assert 'id="cs-regenerate-course-code"' in teacher_template
    assert "/join-code" in teacher_script
    assert "function openCourseCodeDialog" in teacher_script
    assert "function closeCourseCodeDialog" in teacher_script
    assert "handleCourseCodeDialogKeydown" in teacher_script
    assert "课程码已复制" in teacher_script
    assert ".hub-course-code-trigger" in teacher_style
    assert ".hub-course-code-dialog-body code" in teacher_style
    assert teacher_template.count("aisecedu-course-hub-v35") == 1
    assert 'id="learning-join-course-code"' in student_template
    assert '"/dojos/enrollment/code"' in student_script
    assert '"success"' in student_script
    assert '@dojos_namespace.route("/enrollment/code")' in course_api
    assert '@teaching_namespace.route("/courses/<string:dojo_id>/join-code")' in teaching_api


def test_teacher_course_collection_cards_use_compact_metrics():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()

    assert 'aisecedu-course-hub-v33' in template
    assert '<dl class="teacher-course-card-stats" aria-label="课程概况">' in script
    assert "<dt>章节</dt>" in script
    assert "<dt>题目发布</dt>" in script
    assert "<dt>学生</dt>" in script
    assert 'teacher-course-card-stats"><span>' not in script
    assert ".teacher-course-card-stats > div" in stylesheet
    assert "grid-template-columns: repeat(3, minmax(0, 1fr));" in stylesheet
    assert ".teacher-course-card-stats dd span" in stylesheet


def test_teacher_course_questions_use_an_explicit_drag_management_mode():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()

    assert 'id="cs-question-manage-toggle"' in template
    assert 'id="cs-question-management-bar"' in template
    assert "拖拽排序、跨章节移动、重命名或删除题目" in template
    assert "questionManagement: false" in script
    assert 'draggable="true"' in script
    assert "cs-question-drag-handle" in script
    assert 'managementButtons("challenge"' in script
    assert 'id="cs-question-batch-revise"' in template
    assert 'id="cs-question-batch-publish"' in template
    assert 'data-question-draft-select=' in script
    assert 'data-question-draft-id=' in script
    assert "persistQuestionDraftModule" in script
    assert "async function runQuestionBatchAction" in script
    assert "分别创建独立修订任务" in script
    assert "for (let index = 0; index < drafts.length; index += 1)" in script
    assert 'data-workspace-chapter="questions"' in script
    assert '"questionOpen"' in script
    assert "initializeQuestionChapters" in script
    assert "if (state.questionManagement)" in script
    assert "/catalog/order" in script
    assert ".cs-challenge-dropzone.is-drag-over" in stylesheet
    assert ".cs-question-manage-toggle.is-active" in stylesheet
    assert ".cs-question-batch-select input:checked + span" in stylesheet


def test_teacher_courseware_supports_explicit_single_and_atomic_batch_deletion():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    assert 'id="cs-courseware-manage-toggle"' in template
    assert 'id="cs-courseware-management-bar"' in template
    assert 'id="cs-courseware-batch-delete"' in template
    assert '<option value="UNPUBLISHED">未发布</option>' in template
    assert "coursewareManagement: false" in script
    assert "selectedCoursewareIds: new Set()" in script
    assert "function coursewareCanDelete" in script
    assert "async function runCoursewareBatchAction" in script
    assert 'data-courseware-select=' in script
    assert 'data-manage-kind="artifact"' in script
    assert '"/teaching/artifacts/bulk-delete"' in script
    assert 'managementMenu("artifact"' not in script
    assert ".cs-artifact-list-row.is-courseware-managed" in stylesheet
    assert ".cs-courseware-row-actions" in stylesheet
    assert '@teaching_namespace.route("/artifacts/bulk-delete")' in teaching
    assert "class ArtifactBulkDelete(Resource):" in teaching
    assert '"artifact.manage.bulk_delete"' in teaching


def test_teacher_question_drafts_have_a_student_safe_preview_contract():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()
    learning_api = (root / "dojo_plugin/api/v1/learning.py").read_text()
    authoring = (root / "dojo_plugin/learning/authoring.py").read_text()

    assert 'data-question-action="preview"' in script
    assert "function renderQuestionStudentPreview" in script
    assert "/student-preview`" in script
    assert "学生视角预览" in script
    assert ".cs-question-student-preview" in stylesheet
    assert 'id="cs-question-detail-drawer"' in template
    assert '@learning_namespace.route("/drafts/<draft_id>/student-preview")' in learning_api
    assert "draft_student_preview_view" in learning_api
    assert "def draft_student_preview_view(draft):" in authoring
    for private_key in (
        "verificationAnswer",
        "privateSolution",
        "oracleContract",
        "runtimeContract",
        "implementation",
        "conversation",
        "validation",
    ):
        function_body = authoring.split("def draft_student_preview_view(draft):", 1)[1].split("def catalog_item_view", 1)[0]
        assert private_key not in function_body


def test_teacher_question_draft_student_preview_never_exposes_private_fields(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    secret_answer = f"private-{secrets.token_hex(12)}"
    created = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/manual-drafts",
        json={
            "moduleId": "hello",
            "id": f"preview-{secrets.token_hex(4)}",
            "title": "学生安全预览题",
            "description": (
                "分析隔离环境中的输入验证问题，定位缺陷触发条件，"
                "记录完整且可核验的解决过程，并说明验证结果与安全影响。"
            ),
            "category": "WEB",
            "difficulty": 3,
            "objectives": ["识别输入验证缺陷", "形成可复现证据"],
            "expectedAnswer": secret_answer,
            "runtimeMode": "terminal",
            "runValidation": False,
        },
    )
    assert created.status_code == 201, created.text
    draft = created.json()["draft"]
    endpoint = f"{API}/drafts/{draft['id']}/student-preview"

    denied = random_user_session.get(endpoint)
    assert denied.status_code == 403

    response = admin_session.get(endpoint)
    assert response.status_code == 200, response.text
    preview = response.json()["data"]["preview"]
    assert preview["studentSafe"] is True
    assert preview["question"]["name"] == "学生安全预览题"
    assert preview["question"]["objectives"] == [
        "识别输入验证缺陷",
        "形成可复现证据",
    ]
    serialized = json.dumps(preview, ensure_ascii=False)
    assert secret_answer not in serialized
    exposed_keys = set()

    def collect_keys(value):
        if isinstance(value, dict):
            exposed_keys.update(value)
            for child in value.values():
                collect_keys(child)
        elif isinstance(value, list):
            for child in value:
                collect_keys(child)

    collect_keys(preview)
    for private_key in (
        "verificationAnswer",
        "privateSolution",
        "oracleContract",
        "runtimeContract",
        "implementation",
        "conversation",
        "validation",
    ):
        assert private_key not in exposed_keys

    deleted = admin_session.delete(f"{API}/drafts/{draft['id']}", json={})
    assert deleted.status_code == 200


def test_teacher_course_mobile_filters_use_focus_safe_bottom_drawers():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()

    assert template.count("data-filter-trigger=") == 4
    assert template.count("data-filter-drawer=") == 4
    assert 'id="cs-filter-backdrop"' in template
    assert template.count("data-filter-reset=") == 4
    assert "function openFilterDrawer" in script
    assert "function closeFilterDrawer" in script
    assert "handleFilterDrawerKeydown" in script
    assert 'drawer.setAttribute("aria-modal", "true")' in script
    assert "setCourseWorkspaceInert(true, [drawer, elements.filterBackdrop])" in script
    assert 'document.body.classList.add("is-filter-drawer-open")' in script
    assert ".hub-library-toolbar[data-filter-drawer].is-mobile-open" in stylesheet
    assert "max-height: min(82dvh, 720px)" in stylesheet
    assert "body.is-filter-drawer-open" in stylesheet


def test_teacher_course_demos_match_the_question_management_layout():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    stylesheet = (root / "dojo_theme/static/css/course-hub.css").read_text()
    model = (root / "dojo_plugin/models/global_agent.py").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    assert 'id="cs-demo-manage-toggle"' in template
    assert 'id="cs-demo-management-bar"' in template
    assert "拖拽排序、跨章节移动、重命名或删除演示" in template
    assert "最近演示会话" not in template
    assert "demoManagement: false" in script
    assert "cs-demo-drag-handle" in script
    assert 'state.demoManagement ? managementButtons("demo"' in script
    assert 'data-workspace-chapter="demos"' in script
    assert '"demoOpen"' in script
    assert "initializeDemoChapters" in script
    assert '"/teaching/artifacts/order"' in script
    assert ".is-demo-order-saving" in stylesheet
    assert '"sort_order"' in model
    assert 'class ArtifactOrder(Resource):' in teaching
    assert '"artifact.manage.reorder"' in teaching


def test_scored_scenario_runner_is_exposed_only_inside_question_workspace():
    root = pathlib.Path(__file__).resolve().parents[1]
    api_registration = (root / "dojo_plugin/api/__init__.py").read_text()
    workspace_page = (root / "dojo_plugin/pages/workspace.py").read_text()
    workspace_template = (root / "dojo_theme/templates/workspace.html").read_text()
    actionbar = (root / "dojo_theme/static/js/dojo/actionbar.js").read_text()

    assert "simulation_namespace" in api_registration
    assert 'requested_service.lower() == "simulation"' not in workspace_page
    assert "题目级模拟演示引擎已下线" not in workspace_page
    assert "simulation_workspace" in workspace_template
    assert "dojo/simulation.js" in workspace_template
    assert "simulation.css" in workspace_template
    assert "AISecEduSimulation" not in actionbar
    assert (root / "dojo_plugin/api/v1/simulation.py").exists()
    assert (
        root / "dojo_theme/templates/components/simulation_workspace.html"
    ).exists()
    assert (root / "dojo_theme/static/js/dojo/simulation.js").exists()
    assert (root / "dojo_theme/static/css/simulation.css").exists()
    assert not (root / "dojo_theme/templates/learning_studio.html").exists()
    assert not (root / "dojo_theme/static/js/dojo/learning-studio.js").exists()


def test_legacy_learning_studio_is_migrated_to_the_course_shell():
    root = pathlib.Path(__file__).resolve().parents[1]
    routes = (root / "dojo_plugin/pages/learning.py").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    base_template = (root / "dojo_theme/templates/base.html").read_text()
    custom_css = (root / "dojo_theme/static/css/custom.css").read_text()
    solution_agent = (root / "dojo_plugin/learning/solution_agent.py").read_text()

    assert not (root / "dojo_theme/static/js/dojo/learning-studio.js").exists()
    assert not (root / "dojo_theme/templates/learning_studio.html").exists()
    assert '@learning.route("/dojo/<dojo>/studio")' in routes
    assert 'query["tab"] = "questions"' in routes
    assert 'query["selectedId"] = query.pop("draft")' in routes
    assert "code=308" in routes
    assert template.count('role="tab"') == 5
    assert 'data-cs-panel="questions"' in template
    assert 'data-cs-panel="students"' in template
    assert "质量与学情" not in template
    assert "function renderChallenges()" in script
    assert "function renderQuestionDraftDetail" in script
    assert "function openQuestionDrawer" in script
    assert "function setQuestionManagement" in script
    assert "async function runQuestionDrawerAction" in script
    assert "当前只管理这一道题" not in script
    assert "修订、验证、发布和删除都不会覆盖同批次" not in script
    assert "页面状态已自动刷新" not in script
    assert "题目已删除（可重新发布）" not in script
    assert "已发布草稿会保留" not in script
    assert "aisecedu-toast-v2" in base_template
    assert "--semantic-success: var(--theme-success, #198754)" in custom_css
    assert ".aisecedu-toast.is-success" in custom_css
    assert "border-left-color: var(--semantic-success)" in custom_css
    assert "rationale 和 expectedEvidence 必须使用简体中文" in solution_agent
    assert "_localized_trace_rationale(step)" in solution_agent
    assert "Establish the same identity" not in solution_agent

    authoring = (root / "dojo_plugin/learning/authoring.py").read_text()
    learning_api = (root / "dojo_plugin/api/v1/learning.py").read_text()
    assert ".with_for_update(nowait=True)" in authoring
    assert "reuse_current_pass=True" in authoring
    assert '"code": "PUBLISH_IN_PROGRESS"' in learning_api


def test_teacher_can_delete_one_unpublished_draft(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    draft_id = f"delete-draft-{secrets.token_hex(4)}"
    created = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/manual-drafts",
        json={
            "moduleId": "hello",
            "id": draft_id,
            "title": "待删除的独立草稿",
            "description": (
                "阅读隔离环境中的示例程序，定位输入校验缺陷，记录完整分析过程，"
                "最后提交唯一确定性答案以完成这道独立练习题。"
            ),
            "category": "PWN",
            "difficulty": 2,
            "objectives": ["定位输入校验缺陷"],
            "expectedAnswer": f"answer-{secrets.token_hex(4)}",
            "runtimeMode": "terminal",
            "runValidation": False,
        },
    )
    assert created.status_code == 201, created.text
    draft = created.json()["draft"]
    endpoint = f"{API}/drafts/{draft['id']}"

    denied = random_user_session.delete(endpoint, json={})
    assert denied.status_code == 403
    assert admin_session.get(endpoint).status_code == 200

    deleted = admin_session.delete(endpoint, json={})
    assert deleted.status_code == 200, deleted.text
    payload = deleted.json()
    assert payload["success"]
    assert payload["deleted"]["draftId"] == draft["id"]
    assert payload["deleted"]["status"] == "DRAFT"
    assert admin_session.get(endpoint).status_code == 404
    remaining = admin_session.get(
        f"{API}/dojos/{simple_award_dojo}/authoring"
    ).json()["drafts"]
    assert draft["id"] not in {item["id"] for item in remaining}


def test_teacher_can_move_one_unpublished_draft_between_course_units(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    unit_id = f"draft-target-{secrets.token_hex(3)}"
    created_unit = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/units",
        json={"id": unit_id, "name": "草稿目标章节"},
    )
    assert created_unit.status_code == 201, created_unit.text
    draft_id = f"move-draft-{secrets.token_hex(4)}"
    created = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/manual-drafts",
        json={
            "moduleId": "hello",
            "id": draft_id,
            "title": "待移动草稿",
            "description": (
                "定位隔离环境中的输入校验缺陷，分析触发条件与安全影响，"
                "保留完整可复现的分析证据，并提交唯一确定性答案。"
            ),
            "category": "PWN",
            "difficulty": 2,
            "objectives": ["定位输入校验缺陷"],
            "expectedAnswer": f"answer-{secrets.token_hex(4)}",
            "runtimeMode": "terminal",
            "runValidation": False,
        },
    )
    assert created.status_code == 201, created.text
    endpoint = f"{API}/drafts/{created.json()['draft']['id']}"

    denied = random_user_session.patch(endpoint, json={"moduleIndex": 1})
    assert denied.status_code == 403
    moved = admin_session.patch(endpoint, json={"moduleIndex": 1})
    assert moved.status_code == 200, moved.text
    assert moved.json()["data"]["draft"]["moduleId"] == unit_id
    persisted = admin_session.get(endpoint)
    assert persisted.status_code == 200
    assert persisted.json()["draft"]["moduleId"] == unit_id


def test_delete_draft_rejects_published_or_active_work(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    class JobQuery:
        def __init__(self, jobs):
            self.jobs = jobs

        def filter_by(self, **_values):
            return self

        def all(self):
            return self.jobs

    dojo = SimpleNamespace(reference_id="course-one", is_admin=lambda _actor: True)
    actor = SimpleNamespace(id=7)
    published = SimpleNamespace(
        id="draft-published",
        dojo=dojo,
        status="PUBLISHED",
        published_challenge_id=42,
    )
    with pytest.raises(ValueError, match="已经发布"):
        authoring.delete_draft(published, actor)

    active = SimpleNamespace(status="RUNNING", draft_id="draft-active")
    monkeypatch.setattr(
        authoring,
        "LearningAuthoringJobs",
        SimpleNamespace(query=JobQuery([active])),
    )
    building = SimpleNamespace(
        id="draft-active",
        dojo=dojo,
        dojo_id=1,
        module_index=0,
        status="BUILDING",
        published_challenge_id=None,
        constraints={},
    )
    with pytest.raises(ValueError, match="仍在生成或修订"):
        authoring.delete_draft(building, actor)


def test_deleting_published_question_permanently_deletes_linked_draft(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    class Query:
        def __init__(self, rows):
            self.rows = rows

        def filter_by(self, **values):
            return Query(
                [
                    row
                    for row in self.rows
                    if all(getattr(row, key, None) == value for key, value in values.items())
                ]
            )

        def all(self):
            return list(self.rows)

    draft = SimpleNamespace(
        id="draft-delete-with-question",
        dojo_id=7,
        published_challenge_id=42,
    )
    completed_job = SimpleNamespace(
        draft_id=draft.id,
        status="COMPLETED",
    )
    deleted = []
    monkeypatch.setattr(
        authoring,
        "LearningDrafts",
        SimpleNamespace(query=Query([draft])),
    )
    monkeypatch.setattr(
        authoring,
        "LearningAuthoringJobs",
        SimpleNamespace(query=Query([completed_job])),
    )
    monkeypatch.setattr(
        authoring,
        "db",
        SimpleNamespace(session=SimpleNamespace(delete=deleted.append)),
    )

    result = authoring._delete_linked_published_drafts(7, 42)

    assert result == {"draftsDeleted": 1, "authoringJobsDetached": 1}
    assert deleted == [draft]
    assert completed_job.draft_id is None


def test_deleting_published_question_rejects_active_linked_draft_job(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    class Query:
        def __init__(self, rows):
            self.rows = rows

        def filter_by(self, **values):
            return Query(
                [
                    row
                    for row in self.rows
                    if all(getattr(row, key, None) == value for key, value in values.items())
                ]
            )

        def all(self):
            return list(self.rows)

    draft = SimpleNamespace(id="draft-active-delete", dojo_id=7, published_challenge_id=42)
    active_job = SimpleNamespace(draft_id=draft.id, status="RUNNING")
    monkeypatch.setattr(
        authoring,
        "LearningDrafts",
        SimpleNamespace(query=Query([draft])),
    )
    monkeypatch.setattr(
        authoring,
        "LearningAuthoringJobs",
        SimpleNamespace(query=Query([active_job])),
    )

    with pytest.raises(ValueError, match="仍在生成或修订"):
        authoring._delete_linked_published_drafts(7, 42)


def test_teacher_can_add_course_unit(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    unit_id = f"teacher-unit-{secrets.token_hex(3)}"
    endpoint = f"{API}/dojos/{simple_award_dojo}/units"

    denied = random_user_session.post(
        endpoint,
        json={"id": unit_id, "name": "Unauthorized Unit"},
    )
    assert denied.status_code == 403

    invalid = admin_session.post(
        endpoint,
        json={"id": "Invalid Unit ID", "name": "Invalid Unit"},
    )
    assert invalid.status_code == 400

    created = admin_session.post(
        endpoint,
        json={
            "id": unit_id,
            "name": "Teacher Created Unit",
            "description": "A unit created from the course page teacher control.",
        },
    )
    assert created.status_code == 201
    assert created.json()["unit"] == {
        "id": unit_id,
        "name": "Teacher Created Unit",
        "description": "A unit created from the course page teacher control.",
        "url": f"/{simple_award_dojo}/{unit_id}",
    }

    duplicate = admin_session.post(
        endpoint,
        json={"id": unit_id, "name": "Duplicate Unit"},
    )
    assert duplicate.status_code == 409

    overview = admin_session.get(f"{API}/overview").json()
    course = next(
        item for item in overview["courses"] if item["id"] == simple_award_dojo
    )
    unit = next(item for item in course["modules"] if item["id"] == unit_id)
    assert unit["name"] == "Teacher Created Unit"
    assert unit["publishedItems"] == []

    page = admin_session.get(f"{DOJO_URL.rstrip('/')}/{simple_award_dojo}/{unit_id}")
    assert page.status_code == 200
    assert "Teacher Created Unit" in page.text
    assert "添加题目" in page.text


def test_simulation_challenge_uses_unified_attempt_solve_tutor_and_replay(
    admin_session,
    random_user,
    simple_award_dojo,
):
    user_name, user_session = random_user
    challenge_id = f"wireless-sim-{secrets.token_hex(4)}"
    created = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/authoring",
        json={
            "brief": (
                "Create a wireless incident-response simulation. Learners must inspect "
                "the topology and spectrum, form a falsifiable interference hypothesis, "
                "apply the safest channel change, and verify service recovery."
            ),
            "moduleId": "hello",
            "constraints": {
                "id": challenge_id,
                "title": "Wireless Incident Simulation",
                "description": (
                    "Investigate a degraded enterprise wireless client by correlating "
                    "topology, spectrum, service metrics, and a deterministic event trail."
                ),
                "category": "GENERAL",
                "difficulty": 3,
                "exerciseMode": "SIMULATION",
                "objectives": [
                    "建立无线拓扑与频谱基线",
                    "形成可证伪的干扰假设",
                    "实施最小变更并复测业务",
                ],
                "simulation": {
                    "preset": "WIRELESS",
                    "title": "Wireless Incident Simulation",
                },
            },
        },
    )
    draft, _ = wait_for_authoring(admin_session, created)
    assert draft["validation"]["status"] == "PASS"
    assert draft["spec"]["exerciseMode"] == "SIMULATION"
    assert draft["spec"]["interfaces"] == [{"name": "Simulation"}]
    assert draft["spec"]["starterFiles"] == []
    assert draft["spec"]["oracleContract"] == {}
    assert draft["spec"]["runtimeContract"] == {}
    assert draft["spec"]["verificationAnswer"] is None

    published = admin_session.post(
        f"{API}/drafts/{draft['id']}/publish",
        json={},
    )
    assert published.status_code == 200
    challenge = published.json()["challenge"]
    assert challenge["exerciseMode"] == "SIMULATION"
    assert challenge["package"]["exerciseMode"] == "SIMULATION"
    assert challenge["package"]["simulation"]["sourcePreset"] == "WIRELESS"

    started = user_session.post(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/docker",
        json={
            "dojo": simple_award_dojo,
            "module": "hello",
            "challenge": challenge_id,
            "practice": False,
        },
    )
    assert started.status_code == 200
    assert started.json()["success"]
    assert started.json()["exerciseMode"] == "SIMULATION"
    run_id = started.json()["simulationRunId"]
    assert run_id

    current_attempt = user_session.get(f"{API}/attempts/current").json()["attempt"]
    assert current_attempt["exerciseMode"] == "SIMULATION"
    assert current_attempt["simulationRunId"] == run_id
    assert current_attempt["status"] == "ACTIVE"

    current_run = user_session.get(f"{SIMULATION_API}/{run_id}")
    assert current_run.status_code == 200
    run = current_run.json()["run"]
    assert run["exerciseMode"] == "SIMULATION"
    assert run["turn"] == 0
    assert run["status"] == "ACTIVE"
    assert run["integrity"]["eventChain"]["valid"]
    assert "privateState" not in json.dumps(run, sort_keys=True)
    assert "rootCause" not in json.dumps(run, sort_keys=True)

    def act(action_id, parameters=None):
        response = user_session.post(
            f"{SIMULATION_API}/{run_id}/actions",
            json={
                "actionId": action_id,
                "parameters": parameters or {},
                "expectedTurn": run["turn"],
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["success"]
        assert response.json()["accepted"]
        run.update(response.json()["run"])
        return response

    act("inspect-topology")
    stale = user_session.post(
        f"{SIMULATION_API}/{run_id}/actions",
        json={
            "actionId": "scan-spectrum",
            "parameters": {},
            "expectedTurn": 0,
        },
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "STALE_TURN"

    act("scan-spectrum")
    tutor = user_session.post(
        f"{API}/tutor",
        json={
            "question": (
                "Which observation should I correlate next before choosing a remediation?"
            )
        },
    )
    assert tutor.status_code == 200
    assert tutor.json()["reply"]["context"]["live"]
    assert tutor.json()["reply"]["context"]["environmentType"] == "SIMULATION"
    assert tutor.json()["reply"]["context"]["simulationRunId"] == run_id

    act("inspect-client")
    act("form-hypothesis", {"cause": "co-channel-interference"})
    act("change-channel", {"channel": 11})
    completed = act("verify-service")
    assert completed.json()["completed"]
    assert run["status"] == "COMPLETED"
    assert run["objectiveSummary"]["requiredComplete"]
    assert run["integrity"]["eventChain"]["valid"]

    replay = user_session.get(f"{SIMULATION_API}/{run_id}/replay")
    assert replay.status_code == 200
    assert replay.json()["replay"]["valid"]
    assert replay.json()["replay"]["actionsReplayed"] == 6
    assert replay.json()["replay"]["finalTurn"] == 6
    assert replay.json()["replay"]["snapshots"] == 7

    solved_attempt = user_session.get(f"{API}/attempts/{current_attempt['id']}").json()[
        "attempt"
    ]
    assert solved_attempt["status"] == "SOLVED"
    assert solved_attempt["objectiveScore"] == 60
    assert solved_attempt["assessment"]["objectiveScore"] == 60
    assert solved_attempt["evidenceChain"]["valid"]
    evidence_types = [event["type"] for event in solved_attempt["evidence"]]
    assert evidence_types.count("simulation.action.completed") == 6
    assert "simulation.objective.evaluated" in evidence_types
    assert "flag.correct" not in evidence_types

    progress_response = admin_session.get(
        f"{TEACHING_API}/progress/{simple_award_dojo}"
    )
    assert progress_response.status_code == 200, progress_response.text
    progress = progress_response.json()["data"]
    student = next(item for item in progress["students"] if item["name"] == user_name)
    assert student["attemptCount"] == 1
    assert student["activeAttempts"] == 0
    assert student["completedAttempts"] == 1
    assert student["averageAssessment"] >= 60


@pytest.mark.skip(reason="题目级模拟演示引擎已下线")
def test_multi_domain_simulation_presets_complete_and_replay(
    random_user_session,
    simulation_domains_dojo,
):
    cases = [
        {
            "challenge": "mobile-permission",
            "domain": "MOBILE_SECURITY",
            "cause": "overprivileged-app",
            "wrongCause": "os-update",
            "remediation": "revoke-and-quarantine",
            "wrongRemediation": "factory-reset",
            "probes": [
                (
                    "capture-background-traffic",
                    {
                        "capturePoint": "work-profile-vpn",
                        "window": "15m",
                    },
                ),
                ("compare-mdm-baseline", {}),
                ("inspect-permissions", {}),
            ],
            "expectedTurn": 9,
        },
        {
            "challenge": "side-channel-leakage",
            "domain": "SIDE_CHANNEL",
            "cause": "first-order-power-leakage",
            "remediation": "masking-and-jitter",
            "failedProbe": (
                "capture-aligned-traces",
                {"samples": 200, "trigger": "free-run"},
            ),
            "probes": [
                ("calibrate-probe", {}),
                (
                    "capture-aligned-traces",
                    {"samples": 2000, "trigger": "rising-edge"},
                ),
                ("run-leakage-model", {"model": "hamming-weight-sbox"}),
            ],
            "expectedTurn": 7,
        },
        {
            "challenge": "ics-plc-write",
            "domain": "INDUSTRIAL_CONTROL",
            "cause": "unauthorized-plc-write",
            "remediation": "isolate-and-restore",
            "probes": [
                (
                    "compare-plc-digest",
                    {
                        "baseline": "signed-release",
                        "acquisition": "online-read-only",
                    },
                ),
                ("map-network-zones", {}),
                ("correlate-process-history", {}),
            ],
            "expectedTurn": 6,
        },
        {
            "challenge": "gnss-spoofing",
            "domain": "GNSS_SECURITY",
            "cause": "coordinated-spoofing",
            "remediation": "multi-sensor-integrity",
            "probes": [
                (
                    "compare-inertial-track",
                    {
                        "reference": "independent-pps",
                        "sources": "ins-and-odometer",
                    },
                ),
                ("inspect-clock-bias", {}),
                ("inspect-rf-power", {}),
            ],
            "expectedTurn": 6,
        },
    ]
    catalog = random_user_session.get(f"{API}/dojos/{simulation_domains_dojo}/catalog")
    assert catalog.status_code == 200
    assert {item["id"] for item in catalog.json()["items"]} == {
        case["challenge"] for case in cases
    }
    assert {item["exerciseMode"] for item in catalog.json()["items"]} == {"SIMULATION"}

    for case in cases:
        started = random_user_session.post(
            f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/docker",
            json={
                "dojo": simulation_domains_dojo,
                "module": "scenarios",
                "challenge": case["challenge"],
                "practice": False,
            },
        )
        assert started.status_code == 200, started.text
        assert started.json()["success"]
        run_id = started.json()["simulationRunId"]
        run_response = random_user_session.get(f"{SIMULATION_API}/{run_id}")
        assert run_response.status_code == 200
        run = run_response.json()["run"]
        assert run["scenario"]["domain"] == case["domain"]
        assert run["scenario"]["version"] == 2
        assert run["scenario"]["brief"]["mission"]
        assert len(run["publicState"]["zones"]) >= 3
        assert len(run["publicState"]["entities"]) >= 7
        assert len(run["publicState"]["relations"]) >= 7
        assert run["publicState"]["investigation"]["evidenceCount"] == 0
        assert run["publicState"]["investigation"]["phase"] == "探索与取证"
        assert len(run["publicState"]["evidence"]) == 1
        assert {view["type"] for view in run["scenario"]["views"]} == {
            "topology",
            "table",
            "metrics",
            "timeline",
        }
        serialized = json.dumps(run, ensure_ascii=False, sort_keys=True)
        assert "privateState" not in serialized
        assert "rootCause" not in serialized
        assert "recommendedRemediation" not in serialized
        probe_actions = [
            action for action in run["actions"] if action["group"] == "取证实验"
        ]
        assert len(probe_actions) >= 4
        assert sum(action["available"] for action in probe_actions) >= 3
        assert all(action["tool"] for action in probe_actions)
        assert all(action["expectedResult"] for action in probe_actions)
        assert all(action["turnCost"] == 1 for action in probe_actions)
        assert any(len(action["parameters"]) >= 2 for action in probe_actions)
        hypothesis_action = next(
            action for action in run["actions"] if action["id"] == "form-hypothesis"
        )
        assert {parameter["id"] for parameter in hypothesis_action["parameters"]} == {
            "cause",
            "rationale",
        }
        assert (
            next(
                parameter
                for parameter in hypothesis_action["parameters"]
                if parameter["id"] == "rationale"
            )["type"]
            == "text"
        )
        verification_action = next(
            action for action in run["actions"] if action["id"] == "verify-recovery"
        )
        assert [parameter["id"] for parameter in verification_action["parameters"]] == [
            "scope"
        ]

        def act(action_id, parameters=None):
            response = random_user_session.post(
                f"{SIMULATION_API}/{run_id}/actions",
                json={
                    "actionId": action_id,
                    "parameters": parameters or {},
                    "expectedTurn": run["turn"],
                },
            )
            assert response.status_code == 200, response.text
            assert response.json()["success"]
            assert response.json()["accepted"]
            run.update(response.json()["run"])
            return response

        if case.get("failedProbe"):
            failed_probe, failed_parameters = case["failedProbe"]
            failed = act(failed_probe, failed_parameters)
            assert failed.json()["observation"]["level"] == "warning"
            assert run["publicState"]["investigation"]["evidenceCount"] == 0

        for index, (probe, parameters) in enumerate(case["probes"]):
            act(probe, parameters)
            if case["challenge"] == "mobile-permission" and index == 1:
                wrong = act(
                    "form-hypothesis",
                    {
                        "cause": case["wrongCause"],
                        "rationale": "当前先用控制组和出口流量检验该解释是否能同时成立。",
                    },
                )
                assert wrong.json()["observation"]["level"] == "warning"
                assert (
                    run["publicState"]["investigation"]["hypothesisStatus"]
                    == "conflicted"
                )
                provisional = act(
                    "form-hypothesis",
                    {
                        "cause": case["cause"],
                        "rationale": "权限调用和控制组差异支持应用异常，但还需要关键流量或行为证据。",
                    },
                )
                assert provisional.json()["observation"]["level"] == "warning"
                assert (
                    run["publicState"]["investigation"]["hypothesisStatus"]
                    == "provisional"
                )
                assert not run["objectiveSummary"]["requiredComplete"]

        assert run["publicState"]["investigation"]["evidenceCount"] == 3
        diagnosis = act(
            "form-hypothesis",
            {
                "cause": case["cause"],
                "rationale": "三项独立证据覆盖现象、行为和控制组，并削弱了至少一个竞争性解释。",
            },
        )
        assert diagnosis.json()["observation"]["level"] == "success"
        assert run["publicState"]["investigation"]["hypothesisStatus"] == "supported"
        if case.get("wrongRemediation"):
            wrong = act(
                "apply-remediation",
                {
                    "strategy": case["wrongRemediation"],
                    "safetyPlan": "先保留证据并观察关键业务；若影响扩大则立即回退。",
                },
            )
            assert wrong.json()["observation"]["level"] == "warning"
            assert run["publicState"]["metrics"]["operationalImpact"] == 78
            assert (
                run["publicState"]["investigation"]["containmentStatus"]
                == "ineffective"
            )
        act(
            "apply-remediation",
            {
                "strategy": case["remediation"],
                "safetyPlan": "保留原始证据与独立保护层；关键业务异常或风险上升时回退。",
            },
        )
        assert run["publicState"]["metrics"]["serviceStatus"] == "recovering"
        completed = act(
            "verify-recovery",
            {"scope": "independent-threat-and-service"},
        )
        assert completed.json()["completed"]
        assert run["status"] == "COMPLETED"
        assert run["objectiveSummary"]["requiredComplete"]
        assert run["publicState"]["metrics"]["risk"] == 5
        assert run["publicState"]["metrics"]["serviceStatus"] == "healthy"
        assert run["publicState"]["metrics"]["evidenceConfidence"] == 100
        assert run["publicState"]["metrics"]["verified"] is True
        assert run["publicState"]["investigation"]["phase"] == "完成"
        assert len(run["publicState"]["evidence"]) == 5
        replay = random_user_session.get(f"{SIMULATION_API}/{run_id}/replay")
        assert replay.status_code == 200
        assert replay.json()["replay"]["valid"]
        assert replay.json()["replay"]["finalTurn"] == case["expectedTurn"]


@pytest.mark.skip(reason="题目级模拟演示引擎已下线")
def test_simulation_workspace_is_bounded_and_control_panel_scrolls(
    random_user_session,
    random_user_browser,
    simulation_domains_dojo,
):
    started = random_user_session.post(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/docker",
        json={
            "dojo": simulation_domains_dojo,
            "module": "scenarios",
            "challenge": "mobile-permission",
            "practice": False,
        },
    )
    assert started.status_code == 200
    assert started.json()["success"]

    random_user_browser.set_window_size(1200, 700)
    random_user_browser.get(f"{DOJO_URL.rstrip('/')}/workspace?service=simulation")
    WebDriverWait(random_user_browser, 10).until(
        lambda browser: browser.execute_script(
            """
            const root = document.querySelector('[data-simulation-workspace]');
            return Boolean(root && !root.hidden && root.querySelector('.simulation-topology'));
            """
        )
    )
    layout = random_user_browser.execute_script(
        """
        const controls = document.querySelector('.workspace-controls');
        const surface = document.querySelector('.challenge-workspace-surface');
        const panel = document.querySelector('.simulation-control-panel');
        const viewportHeight = document.documentElement.clientHeight;
        return {
            documentBounded:
                document.documentElement.scrollHeight <= viewportHeight + 1,
            controlsVisible: controls.getBoundingClientRect().bottom <= viewportHeight + 1,
            surfaceMeetsControls:
                Math.abs(
                    surface.getBoundingClientRect().bottom
                    - controls.getBoundingClientRect().top
                ) <= 1,
            panelScrollable:
                panel.scrollHeight > panel.clientHeight
                && getComputedStyle(panel).overflowY === 'auto',
            briefOpen:
                document.querySelector('.simulation-brief').open,
            phase:
                document.querySelector('[data-simulation-phase]').textContent.trim(),
            currentTaskVisible:
                Boolean(document.querySelector('[data-simulation-current-task]').textContent.trim()),
            zoneCount:
                document.querySelectorAll('.simulation-topology-zone').length,
            nodeCount:
                document.querySelectorAll('.simulation-topology-node').length,
            edgeCount:
                document.querySelectorAll('.simulation-topology-line').length,
            nodeDetailsVisible:
                Boolean(document.querySelector('.simulation-topology-details strong')),
            actionMetadataCount:
                document.querySelectorAll('.simulation-action-meta').length,
        };
        """
    )
    assert layout == {
        "documentBounded": True,
        "controlsVisible": True,
        "surfaceMeetsControls": True,
        "panelScrollable": True,
        "briefOpen": True,
        "phase": "探索与取证",
        "currentTaskVisible": True,
        "zoneCount": 3,
        "nodeCount": 8,
        "edgeCount": 8,
        "nodeDetailsVisible": True,
        "actionMetadataCount": 7,
    }
    assert random_user_browser.execute_script(
        """
        const panel = document.querySelector('.simulation-control-panel');
        panel.scrollTop = 120;
        return panel.scrollTop > 0;
        """
    )


@pytest.mark.skip(reason="题目级模拟演示引擎已下线")
def test_teacher_can_delete_own_course_challenge_and_related_runs(
    admin_session,
    guest_dojo_admin,
    random_user_session,
    simulation_domains_dojo,
):
    _, teacher_session = guest_dojo_admin
    enrolled = teacher_session.post(
        f"{COURSES_API}/{simulation_domains_dojo}/enrollment",
        json={},
    )
    assert enrolled.status_code in {200, 201}
    teacher_id = teacher_session.get(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/users/me"
    ).json()["id"]
    promoted = admin_session.post(
        f"{COURSES_API}/{simulation_domains_dojo}/admins/promote",
        json={"user_id": teacher_id},
    )
    assert promoted.status_code == 200

    challenge_id = "mobile-permission"
    endpoint = f"{API}/dojos/{simulation_domains_dojo}/catalog/scenarios/{challenge_id}"
    started = random_user_session.post(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/docker",
        json={
            "dojo": simulation_domains_dojo,
            "module": "scenarios",
            "challenge": challenge_id,
            "practice": False,
        },
    )
    assert started.status_code == 200
    run_id = started.json()["simulationRunId"]
    first_action = random_user_session.post(
        f"{SIMULATION_API}/{run_id}/actions",
        json={
            "actionId": "capture-background-traffic",
            "parameters": {
                "capturePoint": "work-profile-vpn",
                "window": "15m",
            },
            "expectedTurn": 0,
        },
    )
    assert first_action.status_code == 200

    denied = random_user_session.delete(endpoint, json={})
    assert denied.status_code == 403
    still_present = random_user_session.get(
        f"{API}/dojos/{simulation_domains_dojo}/catalog"
    ).json()["items"]
    assert challenge_id in {item["id"] for item in still_present}

    deleted = teacher_session.delete(endpoint, json={})
    assert deleted.status_code == 200, deleted.text
    payload = deleted.json()
    assert payload["success"]
    assert payload["deleted"]["challengeId"] == challenge_id
    assert payload["deleted"]["attemptsDeleted"] == 1
    assert payload["deleted"]["draftsDeleted"] == 0
    assert payload["deleted"]["globalChallengeDeleted"]

    remaining = teacher_session.get(
        f"{API}/dojos/{simulation_domains_dojo}/catalog"
    ).json()["items"]
    assert challenge_id not in {item["id"] for item in remaining}
    assert len(remaining) == 3
    assert random_user_session.get(f"{SIMULATION_API}/{run_id}").status_code == 404
    assert teacher_session.delete(endpoint, json={}).status_code == 404

    next_started = random_user_session.post(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/docker",
        json={
            "dojo": simulation_domains_dojo,
            "module": "scenarios",
            "challenge": "side-channel-leakage",
            "practice": False,
        },
    )
    assert next_started.status_code == 200
    assert next_started.json()["success"]
    assert next_started.json()["simulationRunId"]


def test_native_authoring_workspace_evidence_assessment_and_appeal(
    admin_session,
    random_user,
    simple_award_dojo,
):
    user_name, user_session = random_user
    challenge_id = f"evidence-{secrets.token_hex(4)}"
    verification_answer = secrets.token_hex(8)
    brief = (
        "Create a self-contained incident verification exercise for a beginner. "
        "The learner must inspect runtime evidence, validate one hypothesis, and explain remediation."
    )
    created = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/authoring",
        json={
            "brief": brief,
            "moduleId": "hello",
            "level": "L3",
            "constraints": {
                "id": challenge_id,
                "title": "Evidence Chain Verification",
                "category": "FORENSICS",
                "difficulty": 2,
                "verificationAnswer": verification_answer,
            },
        },
    )
    draft, _ = wait_for_authoring(admin_session, created)
    assert draft["spec"]["mode"] == "GENERATE_CUSTOM"
    assert draft["spec"]["sourceChallengeId"] is None
    assert draft["spec"]["verificationAnswer"] is None
    assert draft["spec"]["oracleContract"]["type"] == "FLAG_GATE_V1"
    assert "solution.json" not in draft["spec"]["description"]
    assert "动态 Flag" in draft["spec"]["description"]
    assert draft["spec"]["authoringPipeline"]["plan"]["model"] == "deepseek-v4-flash"
    assert draft["spec"]["authoringPipeline"]["build"]["model"] == "deepseek-v4-pro"
    assert draft["spec"]["authoringPipeline"]["review"]["model"] == "deepseek-v4-pro"
    assert (
        draft["spec"]["authoringPipeline"]["postReview"]["model"] == "deepseek-v4-pro"
    )
    assert draft["spec"]["authoringPipeline"]["validate"]["model"] == "deepseek-v4-pro"

    validated_response = admin_session.post(
        f"{API}/drafts/{draft['id']}/validate", json={}
    )
    validated, _ = wait_for_authoring(admin_session, validated_response)
    assert validated["validation"]["summary"]["blocked"] == 0
    assert validated["validation"]["agentReview"]["model"] == "deepseek-v4-pro"

    published = admin_session.post(f"{API}/drafts/{draft['id']}/publish", json={})
    assert published.status_code == 200
    assert published.json()["success"]
    challenge = published.json()["challenge"]
    assert challenge["id"] == challenge_id
    assert challenge["package"]["mode"] == "GENERATE_CUSTOM"

    revised_response = admin_session.post(
        f"{API}/drafts/{draft['id']}",
        json={
            "message": "Keep the stable identity and publish an immutable second version."
        },
    )
    revised, _ = wait_for_authoring(admin_session, revised_response)
    assert revised["revision"] == 2
    revalidated_response = admin_session.post(
        f"{API}/drafts/{draft['id']}/validate", json={}
    )
    revalidated, _ = wait_for_authoring(admin_session, revalidated_response)
    assert revalidated["validation"]["status"] == "PASS"
    republished = admin_session.post(f"{API}/drafts/{draft['id']}/publish", json={})
    assert republished.status_code == 200
    assert republished.json()["challenge"]["challengeId"] == challenge["challengeId"]
    assert republished.json()["challenge"]["version"] == 2
    assert [
        item["version"]
        for item in republished.json()["challenge"]["package"]["history"]
    ] == [1]

    start_challenge(simple_award_dojo, "hello", challenge_id, session=user_session)
    current = user_session.get(f"{API}/attempts/current").json()["attempt"]
    assert current["status"] == "ACTIVE"
    assert current["challengeVersion"] == 2
    assert current["evidenceChain"]["valid"]
    assert [event["type"] for event in current["evidence"][:2]] == [
        "lab.started",
        "runtime.state.snapshot",
    ]

    command = "printf pwn.college{private-value}; tool --token very-secret-token"
    evidence = user_session.post(
        f"{API}/evidence",
        json={
            "type": "terminal.command.completed",
            "payload": {"command": command, "exitCode": 0},
        },
    )
    assert evidence.status_code == 200
    scrubbed = evidence.json()["event"]["payload"]["command"]
    assert "private-value" not in scrubbed
    assert "very-secret-token" not in scrubbed
    assert "[REDACTED_FLAG]" in scrubbed

    user_session.post(
        f"{API}/evidence",
        json={
            "type": "terminal.command.failed",
            "payload": {"command": "test -f /challenge/missing", "exitCode": 1},
        },
    )
    user_session.post(
        f"{API}/evidence",
        json={
            "type": "terminal.command.completed",
            "payload": {
                "command": "sed -n 1,4p /challenge/evidence.log",
                "exitCode": 0,
            },
        },
    )
    user_session.post(
        f"{API}/evidence",
        json={
            "type": "milestone.observed",
            "payload": {"name": "confirmed-record-located"},
        },
    )
    rejected = user_session.post(
        f"{API}/evidence",
        json={"type": "arbitrary.event", "payload": {}},
    )
    assert rejected.status_code == 400

    tutor = user_session.post(
        f"{API}/tutor",
        json={"question": "How should I validate which record is trustworthy?"},
    )
    assert tutor.status_code == 200
    assert tutor.json()["reply"]["mode"] == "SOCRATIC_HINTS"
    assert "guidanceLevel" not in tutor.json()["reply"]
    assert verification_answer not in tutor.json()["reply"]["answer"]
    if tutor.json()["reply"]["provider"] == "DETERMINISTIC":
        assert "trustworthy" in tutor.json()["reply"]["answer"]
        assert tutor.json()["reply"]["model"] is None
    else:
        assert tutor.json()["reply"]["model"] == "deepseek-v4-flash"

    reference_id = f"{simple_award_dojo}/hello/{challenge_id}"
    guide_boot = user_session.get(f"{API}/guide")
    assert guide_boot.status_code == 200
    reference_option = next(
        item
        for item in guide_boot.json()["referenceOptions"]
        if item["id"] == reference_id
    )
    assert reference_option["exercise"] == "Evidence Chain Verification"
    assert reference_option["recentAttempts"] >= 1

    guide = user_session.post(
        f"{API}/guide",
        json={
            "question": "Use the referenced exercise history to plan the next 30 minutes.",
            "references": [reference_id],
        },
    )
    assert guide.status_code == 200
    assert guide.json()["profileSummary"]["attempts"] >= 1
    assert guide.json()["contextCoverage"]["referencedExercises"] == 1
    assert guide.json()["contextCoverage"]["referencedAttempts"] >= 1
    assert guide.json()["contextCoverage"]["referencedEvidenceEvents"] >= 1
    assert guide.json()["contextCoverage"]["scopeMode"] == "REFERENCED"
    assert guide.json()["message"]["metadata"]["references"][0]["id"] == reference_id
    assert guide.json()["message"]["metadata"]["scope"]["referenceIds"] == [
        reference_id
    ]
    assert guide.json()["message"]["metadata"]["scopeValidation"]["status"] in {
        "VALIDATED",
        "BLOCKED",
        "DETERMINISTIC",
    }
    if guide.json()["provider"] != "DETERMINISTIC":
        assert guide.json()["model"] == "deepseek-v4-flash"
    guide_thread_id = guide.json()["thread"]["id"]
    guide_reload = user_session.get(
        f"{API}/guide",
        params={"threadId": guide_thread_id},
    )
    assert guide_reload.status_code == 200
    assert guide_reload.json()["thread"]["referenceIds"] == [reference_id]
    resolved_actions = user_session.post(
        f"{API}/resources/resolve",
        json={
            "resources": [
                {
                    "key": "legacy-url",
                    "objectType": "link",
                    "objectId": "",
                    "url": f"/{reference_id}",
                },
                {
                    "key": "structured-ref",
                    "objectType": "challenge",
                    "objectId": reference_id,
                    "url": f"/{reference_id}",
                },
                {
                    "key": "unknown-old-link",
                    "objectType": "link",
                    "objectId": "",
                    "url": "/obsolete-learning-entry",
                },
            ]
        },
    )
    assert resolved_actions.status_code == 200
    resolved_by_key = {
        item["key"]: item
        for item in resolved_actions.json()["data"]["resources"]
    }
    for key in ("legacy-url", "structured-ref"):
        assert resolved_by_key[key]["status"] == "AVAILABLE"
        assert resolved_by_key[key]["objectType"] == "challenge"
        assert resolved_by_key[key]["href"] == f"/{reference_id}"
    assert resolved_by_key["unknown-old-link"]["status"] == "UNRESOLVED"
    assert resolved_by_key["unknown-old-link"]["status"] != "DELETED"
    rejected_reference = user_session.post(
        f"{API}/guide",
        json={
            "threadId": guide_thread_id,
            "question": "This must not silently fall back to another exercise.",
            "references": ["not/available/exercise"],
        },
    )
    assert rejected_reference.status_code == 400
    assert "引用题目" in rejected_reference.json()["error"]

    renamed = user_session.patch(
        f"{API}/guide/threads/{guide_thread_id}",
        json={"action": "rename", "title": "证据链复盘"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["thread"]["title"] == "证据链复盘"
    pinned = user_session.patch(
        f"{API}/guide/threads/{guide_thread_id}",
        json={"action": "pin"},
    )
    assert pinned.status_code == 200
    assert pinned.json()["thread"]["pinned"] is True
    archived = user_session.patch(
        f"{API}/guide/threads/{guide_thread_id}",
        json={"action": "archive"},
    )
    assert archived.status_code == 200
    assert archived.json()["thread"]["status"] == "ARCHIVED"
    archived_list = user_session.get(f"{API}/guide", params={"view": "archived"})
    assert guide_thread_id in {item["id"] for item in archived_list.json()["threads"]}
    archived_send = user_session.post(
        f"{API}/guide",
        json={"threadId": guide_thread_id, "question": "不应写入归档对话"},
    )
    assert archived_send.status_code == 409
    restored = user_session.patch(
        f"{API}/guide/threads/{guide_thread_id}",
        json={"action": "restore"},
    )
    assert restored.status_code == 200
    assert restored.json()["thread"]["status"] == "ACTIVE"

    oracle = republished.json()["challenge"]["package"]["oracleContract"]
    assert oracle["type"] == "FLAG_GATE_V1"
    assert "submissionPath" not in oracle
    workspace_run("rm -f /home/hacker/solution.json", user=user_name)
    unreadable = workspace_run(
        "test ! -r /challenge/check-server.py",
        user=user_name,
    )
    assert unreadable.returncode == 0
    argument_check = workspace_run(
        f"/challenge/check {verification_answer}",
        user=user_name,
        check=False,
    )
    assert argument_check.returncode != 0
    flag = workspace_run("/challenge/check", user=user_name).stdout.strip()
    assert flag.startswith("pwn.college{")
    solve_challenge(
        simple_award_dojo,
        "hello",
        challenge_id,
        session=user_session,
        flag=flag,
    )
    solved_attempt = user_session.get(f"{API}/attempts/{current['id']}").json()[
        "attempt"
    ]
    baseline_assessment = solved_attempt["assessment"]
    assert solved_attempt["scoreUrl"] == f"/learning/attempts/{current['id']}/score"
    score_page = user_session.get(f"{DOJO_URL.rstrip('/')}{solved_attempt['scoreUrl']}")
    assert score_page.status_code == 200
    assert current["id"] in score_page.text
    latest_score = user_session.get(
        f"{DOJO_URL.rstrip('/')}/learning/scores/latest/{challenge['challengeId']}",
        allow_redirects=False,
    )
    assert latest_score.status_code == 302
    assert latest_score.headers["Location"].endswith(solved_attempt["scoreUrl"])
    assert solved_attempt["objectiveScore"] == 60
    assert baseline_assessment["revision"] == 1
    assert baseline_assessment["source"] == "DETERMINISTIC"
    assert (
        baseline_assessment["criteria"][0]["evidence"]["grader"]["provider"]
        == "DETERMINISTIC"
    )

    reflection = (
        "I established a clean runtime baseline, inspected each evidence record, and rejected the "
        "starting and degraded states. I then tested the confirmed verification value against the "
        "challenge oracle. The root cause was trusting state labels without corroboration; remediation "
        "is to require signed, ordered evidence and re-check the current epoch before acting."
    )
    submitted = user_session.post(
        f"{API}/attempts/{current['id']}",
        json={"reflection": reflection, "submit": True},
    )
    assert submitted.status_code == 200
    attempt = submitted.json()["attempt"]
    assert attempt["status"] == "SOLVED"
    assert attempt["objectiveScore"] == 60
    assert 60 < attempt["totalScore"] <= 100
    assert attempt["evidenceChain"]["valid"]
    assert submitted.json()["assessment"]["revision"] >= 2
    assert len(submitted.json()["assessment"]["abilities"]) == 6
    grader = submitted.json()["assessment"]["criteria"][0]["evidence"]["grader"]
    if grader["provider"] == "MODEL":
        assert grader["model"] == "deepseek-v4-pro"
        assert grader["liveContext"]
        assert grader["solutionProvider"]

    assessment_id = submitted.json()["assessment"]["id"]
    appealed = user_session.post(
        f"{API}/assessments/{assessment_id}/appeals",
        json={
            "reason": "Please review whether the ordered evidence and remediation justify full process credit."
        },
    )
    assert appealed.status_code == 201
    appeal_id = appealed.json()["appeal"]["id"]

    appeals = admin_session.get(f"{API}/dojos/{simple_award_dojo}/appeals")
    assert any(item["id"] == appeal_id for item in appeals.json()["appeals"])
    resolved = admin_session.patch(
        f"{API}/appeals/{appeal_id}",
        json={
            "status": "RESOLVED",
            "resolution": "The evidence chain is valid; the deterministic rubric was replayed.",
            "reassess": True,
        },
    )
    assert resolved.status_code == 200
    assert resolved.json()["appeal"]["status"] == "RESOLVED"

    analytics = admin_session.get(f"{API}/dojos/{simple_award_dojo}/analytics")
    assert analytics.status_code == 200
    assert analytics.json()["summary"]["attempts"] >= 1
    student = next(
        student
        for student in analytics.json()["students"]
        if student["name"] == user_name
    )
    assert all(skill["evidenceCount"] == 1 for skill in student["skills"])

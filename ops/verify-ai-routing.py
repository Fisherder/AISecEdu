#!/usr/bin/env python3
"""Offline contract checks for DeepSeek model routing and secret boundaries."""

import copy
import datetime
import json
import pathlib
import subprocess
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

class FakeResponse:
    def __init__(self, content):
        self.content = content
        self.status_code = 200
        self.headers = {}

    def raise_for_status(self):
        return None

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(self.content, ensure_ascii=False)
                    }
                }
            ]
        }


def verify_http_contract(intelligence):
    requests = []

    def fake_post(url, **kwargs):
        requests.append((url, kwargs))
        return FakeResponse({"ok": True})

    with (
        patch.object(intelligence, "DOJO_AI_ENABLED", True),
        patch.object(intelligence, "DOJO_AI_API_KEY", "test-only-key"),
        patch.object(intelligence, "DOJO_AI_BASE_URL", "https://api.deepseek.com"),
        patch.object(intelligence.requests, "post", side_effect=fake_post),
    ):
        result = intelligence.model_json(
            "Return JSON.",
            {"input": "safe"},
            model="deepseek-v4-pro",
            thinking=True,
            reasoning_effort="max",
            max_tokens=2048,
        )
    assert result["ok"] is True
    assert result["_agentMeta"]["model"] == "deepseek-v4-pro"
    assert len(requests) == 1
    url, request = requests[0]
    body = request["json"]
    assert url == "https://api.deepseek.com/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer test-only-key"
    assert body["model"] == "deepseek-v4-pro"
    assert body["thinking"] == {"type": "enabled"}
    assert body["reasoning_effort"] == "max"
    assert body["response_format"] == {"type": "json_object"}
    assert body["stream"] is False
    assert "temperature" not in body


def verify_tutor_routing(intelligence):
    calls = []

    def fake_model(system_prompt, user_payload, **kwargs):
        calls.append((system_prompt, user_payload, kwargs))
        return {
            "answer": "先明确一个可证伪假设，再做最小范围观察。",
            "nextCheck": "比较预期现象与实际输出。",
            "confidence": 0.8,
        }

    event = SimpleNamespace(
        event_type="terminal.command.completed",
        payload={"command": "file sample"},
        trust_level=2,
    )
    attempt = SimpleNamespace(
        id="attempt_test",
        epoch=1,
        mode="ASSESSMENT",
        status="ACTIVE",
        evidence_timeline=[event],
        dojo_challenge=SimpleNamespace(
            name="Safe exercise",
            description="Inspect the supplied artifact and explain the evidence.",
        ),
    )
    user = SimpleNamespace(id=1)
    fake_db = SimpleNamespace(session=SimpleNamespace(add=lambda value: None))
    agent_context = {
        "attempt": {"id": attempt.id, "epoch": attempt.epoch},
        "challenge": {
            "name": "Safe exercise",
            "description": attempt.dojo_challenge.description,
        },
        "referenceFiles": {
            "attemptVersion": 1,
            "packageVersion": 1,
            "versionMatched": True,
            "files": [
                {
                    "path": "README.txt",
                    "content": "Inspect the supplied artifact.",
                }
            ]
        },
        "liveContainer": {
            "available": True,
            "files": {
                "available": True,
                "files": [
                    {"path": "/challenge/README.txt", "content": "artifact"}
                ],
            },
        },
        "studentTrajectory": {
            "events": [
                {
                    "type": event.event_type,
                    "payload": event.payload,
                    "trustLevel": event.trust_level,
                }
            ]
        },
        "privateReference": {
            "authoring": {"verificationAnswer": "dynamic-secret-9876"},
            "profilePackage": {
                "oracleContract": {
                    "assertions": [
                        {
                            "field": "state",
                            "operator": "equals",
                            "value": "observable-state-2468",
                        }
                    ]
                }
            },
        },
    }
    solution_reference = {
        "provider": "CACHED",
        "overview": "Compare the supplied evidence with the stated hypothesis.",
        "steps": [
            {
                "goal": "Establish a baseline",
                "action": "Inspect the artifact metadata.",
                "expectedEvidence": "A reproducible file-type observation.",
            }
        ],
        "protectedFacts": {},
    }
    with (
        patch.object(intelligence, "model_json", side_effect=fake_model),
        patch.object(
            intelligence,
            "attempt_agent_context",
            return_value=copy.deepcopy(agent_context),
        ),
        patch.object(
            intelligence,
            "ensure_solution_reference",
            return_value=solution_reference,
        ),
        patch.object(intelligence, "append_evidence", lambda *args, **kwargs: None),
        patch.object(intelligence, "db", fake_db),
    ):
        reply = intelligence.tutor_reply(attempt, user, "下一步应该检查什么？")
    assert len(calls) == 1
    assert calls[0][2]["model"] == "deepseek-v4-flash"
    assert calls[0][2]["thinking"] is False
    assert reply["provider"] == "MODEL"
    assert reply["model"] == "deepseek-v4-flash"
    assert reply["context"]["versionMatched"] is True
    safety_reference = intelligence.private_safety_reference(
        agent_context, solution_reference
    )
    assert "dynamic-secret-9876" in intelligence._sensitive_solution_literals(
        safety_reference
    )
    assert "observable-state-2468" in intelligence._sensitive_solution_literals(
        safety_reference
    )
    generic_context = {
        "privateReference": {
            "authoring": {
                "verificationAnswer": "verification-secret-1357",
                "oracleContract": {
                    "assertions": [
                        {
                            "field": "owner",
                            "operator": "equals",
                            "value": "hacker",
                        },
                        {
                            "field": "state",
                            "operator": "equals",
                            "value": "trusted",
                        },
                        {
                            "field": "cwd",
                            "operator": "equals",
                            "value": "/challenge",
                        },
                    ]
                },
            }
        }
    }
    generic_reference = intelligence.private_safety_reference(
        generic_context,
        {"protectedFacts": {}},
    )
    generic_literals = intelligence._sensitive_solution_literals(
        generic_reference
    )
    assert "verification-secret-1357" in generic_literals
    assert "hacker" not in generic_literals
    assert "trusted" not in generic_literals
    assert "/challenge" not in generic_literals
    safe_observation, blocked, reason = intelligence._safe_tutor_text(
        (
            "你已经观察到 /challenge 中的进程由 hacker 运行；下一步请自行核对"
            "哪条可信记录支持 trusted 状态。"
        ),
        "fallback",
        generic_reference,
    )
    assert safe_observation != "fallback"
    assert blocked is False and reason is None
    blocked_answer, blocked, reason = intelligence._safe_tutor_text(
        "验证答案是 verification-secret-1357",
        "fallback",
        generic_reference,
    )
    assert blocked_answer == "fallback"
    assert blocked is True and reason == "PROTECTED_LITERAL"
    source_reference = {
        "protectedFacts": {
            "entrypoint": "/challenge/run",
            "runtimeUser": "hacker",
            "tool": "gcc",
            "sourceBehavior": "platform native checker",
            "secretToken": "source-secret-12345",
        }
    }
    source_literals = intelligence._sensitive_solution_literals(source_reference)
    assert "/challenge/run" not in source_literals
    assert "hacker" not in source_literals
    assert "gcc" not in source_literals
    assert "platform native checker" not in source_literals
    assert "source-secret-12345" in source_literals
    source_hint, blocked, reason = intelligence._safe_tutor_text(
        "先运行 /challenge/run，观察平台原生检查器返回的状态，再解释该证据。",
        "fallback",
        source_reference,
    )
    assert source_hint != "fallback"
    assert blocked is False and reason is None
    sanitized = intelligence._sanitize_generated_protected_facts(
        source_reference["protectedFacts"]
    )
    assert sanitized == {"secretToken": "source-secret-12345"}


def verify_guide_routing(intelligence):
    calls = []
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    terminal_reference = "course/platform/terminal-handshake"
    web_reference = "course/platform/browser-web"

    def previous_message(role, content, references):
        return SimpleNamespace(
            id=len(references),
            role=role,
            content=content,
            metadata_json={
                "references": [{"id": reference} for reference in references]
            },
            created=now,
        )

    thread = SimpleNamespace(
        id="guide_thread",
        title="New conversation",
        status="ACTIVE",
        created=now,
        updated=now,
        context={},
        messages=[
            previous_message(
                "user",
                "这道题是为了考察学生的什么知识点？",
                [terminal_reference],
            ),
            previous_message(
                "assistant",
                "这道题（浏览器 Web 服务）需要继续检查 HTTP 响应。",
                [terminal_reference],
            ),
        ],
    )
    profile = {
        "learner": {"id": 7, "name": "learner"},
        "summary": {
            "enrolledCourses": 1,
            "completedExercises": 2,
            "attempts": 2,
            "averageMastery": 61,
        },
        "courses": [
            {
                "id": "course",
                "name": "Manual Platform Check",
                "description": 'Untrusted text mentions "/malicious".',
                "enrolled": True,
                "role": "student",
                "completed": 2,
                "total": 8,
                "url": "/course",
                "modules": [
                    {
                        "id": "platform",
                        "name": "Platform",
                        "description": "Manual platform validation.",
                        "completed": 1,
                        "total": 2,
                        "exercises": [
                            {
                                "id": "terminal-handshake",
                                "name": "终端握手",
                                "required": True,
                                "completed": True,
                                "url": "/course/platform/terminal-handshake",
                            },
                            {
                                "id": "browser-web",
                                "name": "浏览器 Web 服务",
                                "required": True,
                                "completed": False,
                                "url": "/course/platform/browser-web",
                            },
                        ],
                    }
                ],
            }
        ],
        "skills": [
            {
                "courseId": "course",
                "dimension": "technical_reasoning",
                "label": "Technical reasoning",
                "mastery": 48,
            }
        ],
        "recentAttempts": [
            {
                "id": "web_attempt",
                "course": "Manual Platform Check",
                "unit": "Platform",
                "exercise": "浏览器 Web 服务",
                "referenceId": web_reference,
                "status": "ACTIVE",
                "reflection": "",
            },
            {
                "id": "terminal_attempt",
                "course": "Manual Platform Check",
                "unit": "Platform",
                "exercise": "终端握手",
                "referenceId": terminal_reference,
                "status": "SOLVED",
                "reflection": "先验证终端输入输出，再提交检查结果。",
            }
        ],
        "recommendations": [],
        "activeAttemptId": "web_attempt",
        "generatedAt": now.isoformat() + "Z",
    }

    class FakeGuideMessage:
        counter = 0

        def __init__(self, **kwargs):
            FakeGuideMessage.counter += 1
            self.id = f"message_{FakeGuideMessage.counter}"
            self.created = now
            for key, value in kwargs.items():
                setattr(self, key, value)

    def fake_model(system_prompt, user_payload, **kwargs):
        calls.append((system_prompt, user_payload, kwargs))
        return {
            "answer": (
                "你引用的是“终端握手”。这道题考察终端输入输出、进程交互与"
                "可验证的握手流程；现有记录表明你已完成一次练习，可以先复盘"
                "输入、预期响应和检查结果三者是否形成完整证据链。"
            ),
            "title": "终端握手知识点",
            "focus": "终端交互与证据验证",
            "actions": [
                {
                    "label": "返回终端握手",
                    "why": "复盘这道被引用题目的证据。",
                    "url": "/course/platform/terminal-handshake",
                },
                {
                    "label": "Untrusted description link",
                    "why": "This must not become an action.",
                    "url": "/malicious",
                },
            ],
            "followUp": "你最不确定的是输入格式、响应判断还是检查结果？",
            "confidence": 0.9,
            "usedReferenceIds": [terminal_reference],
        }

    fake_db = SimpleNamespace(
        session=SimpleNamespace(add=lambda value: None, flush=lambda: None)
    )
    active_context = {
        "attempt": {
            "id": "web_attempt",
            "status": "ACTIVE",
            "mode": "GUIDED",
        },
        "challenge": {
            "course": {"id": "course", "name": "Manual Platform Check"},
            "unit": {"id": "platform", "name": "Platform"},
            "exercise": {
                "id": "browser-web",
                "name": "浏览器 Web 服务",
                "description": "Inspect the already-running local service.",
                "category": "WEB",
                "difficulty": 2,
                "objectives": ["Compare request identities."],
                "interfaces": [{"name": "Terminal"}],
            },
        },
        "referenceFiles": {"files": [{"path": "server.py"}]},
        "studentTrajectory": {
            "events": [
                {
                    "sequence": 1,
                    "type": "terminal.command.completed",
                    "source": "terminal",
                    "payload": {"command": "ss -lnt"},
                }
            ]
        },
        "liveContainer": {
            "available": True,
            "matchesAttempt": True,
            "container": {
                "status": "running",
                "workingDirectory": "/challenge",
            },
            "identity": {"output": "pwd=/challenge"},
            "processes": {"output": "python3 /challenge/server.py"},
            "ports": {"output": "LISTEN 127.0.0.1:8123"},
            "workspaceChanges": {"output": ""},
            "files": {"files": [{"path": "server.py", "size": 100}]},
        },
    }
    referenced_contexts = [
        {
            "id": terminal_reference,
            "course": "Manual Platform Check",
            "unit": "Platform",
            "exercise": "终端握手",
            "completed": True,
            "attemptCount": 1,
            "url": "/course/platform/terminal-handshake",
            "category": "GENERAL",
            "difficulty": 2,
            "objectives": ["验证终端输入输出与检查流程。"],
            "attempts": [
                {
                    "id": "terminal_attempt",
                    "status": "SOLVED",
                    "scores": {"total": 69},
                    "reflection": "先验证终端输入输出，再提交检查结果。",
                    "assessment": {
                        "feedback": "需要更清楚地记录预期响应和实际响应。"
                    },
                    "evidenceCounts": {"terminal.command.completed": 3},
                    "recentEvents": [
                        {
                            "sequence": 3,
                            "type": "terminal.command.completed",
                            "payload": {"command": "/challenge/check"},
                        }
                    ],
                    "tutorHistory": [],
                }
            ],
        }
    ]
    with (
        patch.object(intelligence, "model_json", side_effect=fake_model),
        patch.object(
            intelligence, "learning_profile_context", return_value=profile
        ),
        patch.object(
            intelligence, "new_guide_thread", return_value=thread
        ),
        patch.object(
            intelligence,
            "active_attempt",
            return_value=SimpleNamespace(
                id="web_attempt",
                dojo_challenge=SimpleNamespace(reference_id=web_reference),
            ),
        ),
        patch.object(
            intelligence,
            "attempt_agent_context",
            side_effect=AssertionError(
                "unrelated active Web context must not be loaded"
            ),
        ),
        patch.object(
            intelligence,
            "guide_reference_context",
            return_value=referenced_contexts,
        ),
        patch.object(
            intelligence, "LearningGuideMessages", FakeGuideMessage
        ),
        patch.object(intelligence, "db", fake_db),
    ):
        reply = intelligence.guide_reply(
            SimpleNamespace(id=7, name="learner"),
            "这道题是为了考察学生的什么知识点？",
            thread,
            references=[terminal_reference],
        )
    assert len(calls) == 1
    assert calls[0][2]["model"] == "deepseek-v4-flash"
    assert calls[0][2]["thinking"] is False
    assert calls[0][1]["scope"] == {
        "mode": "REFERENCED",
        "referenceIds": [terminal_reference],
        "activeReferenceMatched": False,
    }
    assert calls[0][1]["activeStudyContext"] == {}
    assert calls[0][1]["conversation"] == [
        {
            "role": "user",
            "content": "这道题是为了考察学生的什么知识点？",
        }
    ]
    assert calls[0][1]["learningProfile"]["recentAttempts"][0][
        "exercise"
    ] == "终端握手"
    assert len(calls[0][1]["learningProfile"]["recentAttempts"]) == 1
    assert calls[0][1]["learningProfile"]["courses"][0]["modules"][0][
        "exercises"
    ][0]["name"] == "终端握手"
    assert calls[0][1]["learningProfile"]["skills"][0]["mastery"] == 48
    assert calls[0][1]["referencedStudyContexts"][0]["attempts"][0][
        "assessment"
    ]["feedback"] == "需要更清楚地记录预期响应和实际响应。"
    assert "浏览器 Web 服务" not in json.dumps(
        calls[0][1],
        ensure_ascii=False,
    )
    assert reply["provider"] == "MODEL"
    assert reply["model"] == "deepseek-v4-flash"
    assert reply["profileSummary"]["attempts"] == 2
    assert reply["contextCoverage"]["scopeMode"] == "REFERENCED"
    assert reply["contextCoverage"]["activeAttempt"] is False
    assert reply["contextCoverage"]["referencedExercises"] == 1
    assert reply["contextCoverage"]["referencedAttempts"] == 1
    assert reply["message"]["metadata"]["references"][0]["id"] == terminal_reference
    assert reply["message"]["metadata"]["scopeValidation"]["status"] == "VALIDATED"
    assert (
        reply["message"]["metadata"]["actions"][0]["url"]
        == "/course/platform/terminal-handshake"
    )
    assert reply["message"]["metadata"]["actions"][1]["url"] is None
    assert thread.context["referencedExerciseIds"] == [terminal_reference]

    bad_thread = SimpleNamespace(
        id="bad_guide_thread",
        title="New conversation",
        status="ACTIVE",
        created=now,
        updated=now,
        context={},
        messages=[],
    )

    def drifting_model(system_prompt, user_payload, **kwargs):
        return {
            "answer": (
                "这道题（浏览器 Web 服务）主要考察 HTTP 接口和 JSON 响应解析。"
            ),
            "title": "错误题目",
            "focus": "HTTP",
            "actions": [],
            "followUp": "",
            "confidence": 0.9,
            "usedReferenceIds": [terminal_reference],
        }

    with (
        patch.object(intelligence, "model_json", side_effect=drifting_model),
        patch.object(
            intelligence, "learning_profile_context", return_value=profile
        ),
        patch.object(
            intelligence,
            "active_attempt",
            return_value=SimpleNamespace(
                id="web_attempt",
                dojo_challenge=SimpleNamespace(reference_id=web_reference),
            ),
        ),
        patch.object(
            intelligence,
            "attempt_agent_context",
            side_effect=AssertionError(
                "unrelated active Web context must not be loaded"
            ),
        ),
        patch.object(
            intelligence,
            "guide_reference_context",
            return_value=referenced_contexts,
        ),
        patch.object(
            intelligence, "LearningGuideMessages", FakeGuideMessage
        ),
        patch.object(intelligence, "db", fake_db),
    ):
        guarded = intelligence.guide_reply(
            SimpleNamespace(id=7, name="learner"),
            "这道题考察什么？",
            bad_thread,
            references=[terminal_reference],
        )
    assert guarded["provider"] == "MODEL_SCOPE_BLOCKED"
    assert "终端握手" in guarded["message"]["content"]
    assert "浏览器 Web 服务" not in guarded["message"]["content"]
    assert (
        guarded["message"]["metadata"]["scopeValidation"]["status"]
        == "BLOCKED"
    )

    unscoped_thread = SimpleNamespace(
        id="unscoped_guide_thread",
        title="New conversation",
        status="ACTIVE",
        created=now,
        updated=now,
        context={},
        messages=[],
    )
    with (
        patch.object(
            intelligence,
            "model_json",
            side_effect=AssertionError(
                "an ambiguous unreferenced question must not guess a task"
            ),
        ),
        patch.object(
            intelligence, "learning_profile_context", return_value=profile
        ),
        patch.object(
            intelligence,
            "active_attempt",
            return_value=SimpleNamespace(
                id="web_attempt",
                dojo_challenge=SimpleNamespace(reference_id=web_reference),
            ),
        ),
        patch.object(
            intelligence,
            "guide_reference_context",
            return_value=[],
        ),
        patch.object(
            intelligence, "LearningGuideMessages", FakeGuideMessage
        ),
        patch.object(intelligence, "db", fake_db),
    ):
        unscoped = intelligence.guide_reply(
            SimpleNamespace(id=7, name="learner"),
            "这道题考察什么知识点？",
            unscoped_thread,
            references=[],
        )
    assert unscoped["provider"] == "DETERMINISTIC"
    assert "使用 @ 引用" in unscoped["message"]["content"]
    assert "浏览器 Web 服务" not in unscoped["message"]["content"]
    assert unscoped["contextCoverage"]["scopeMode"] == "PROFILE"


def verify_grader_routing(assessment):
    calls = []
    events = [
        SimpleNamespace(
            sequence=1,
            event_type="terminal.command.completed",
        ),
        SimpleNamespace(
            sequence=2,
            event_type="terminal.command.failed",
        ),
    ]
    attempt = SimpleNamespace(
        id="attempt",
        reflection="A concrete baseline and hypothesis were compared.",
        submitted=datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
    )
    context = {
        "challenge": {"exercise": {"name": "Ownership Boundary"}},
        "referenceFiles": {
            "attemptVersion": 1,
            "packageVersion": 1,
            "versionMatched": True,
            "files": [{"path": "app.py", "content": "safe"}],
        },
        "liveContainer": {
            "available": True,
            "files": {"files": [{"path": "app.py", "content": "changed"}]},
        },
        "studentTrajectory": {"events": [{"sequence": 1}, {"sequence": 2}]},
        "privateReference": {
            "authoring": {"verificationAnswer": "private-proof-7419"},
            "profilePackage": {
                "oracleContract": {
                    "assertions": [
                        {
                            "field": "proof",
                            "operator": "equals",
                            "value": "oracle-proof-8531",
                        }
                    ]
                }
            },
        },
    }
    solution = {
        "provider": "AUTHORING",
        "steps": [{"goal": "Compare ownership behavior."}],
        "protectedFacts": {},
    }

    def fake_model(system_prompt, user_payload, **kwargs):
        calls.append((system_prompt, user_payload, kwargs))
        return {
            "criteria": [
                {
                    "id": "baseline-recon",
                    "score": 6,
                    "evidenceSequences": [1],
                    "containerEvidence": [
                        "private-proof-7419",
                        "oracle-proof-8531",
                    ],
                    "rationale": "Use oracle-proof-8531 as the final proof.",
                    "confidence": 0.8,
                }
            ],
            "abilities": {},
            "feedback": "The baseline is concrete; next explain the failed comparison.",
            "overallConfidence": 0.8,
        }

    fallback = assessment._process_criteria(attempt, events, True)
    with (
        patch.object(assessment, "model_json", side_effect=fake_model),
        patch.object(
            assessment,
            "attempt_agent_context",
            return_value=copy.deepcopy(context),
        ),
        patch.object(
            assessment, "ensure_solution_reference", return_value=solution
        ),
    ):
        result = assessment._model_process_assessment(
            attempt, events, {"valid": True}, True, fallback
        )
    assert len(calls) == 1
    assert calls[0][2]["model"] == "deepseek-v4-pro"
    assert calls[0][2]["thinking"] is True
    assert calls[0][2]["reasoning_effort"] == "max"
    assert calls[0][1]["context"]["privateReference"][
        "solutionReference"
    ]["provider"] == "AUTHORING"
    assert result["liveContext"] is True
    assert result["solutionProvider"] == "AUTHORING"
    assert result["contextVersion"]["matched"] is True
    criterion = result["criteria"][0]
    assert criterion["evidence"]["containerEvidence"] == []
    assert "private-proof-7419" not in criterion["evidence"]["rationale"]
    assert "oracle-proof-8531" not in criterion["evidence"]["rationale"]


def verify_authoring_routing(authoring):
    calls = []

    def fake_model(system_prompt, user_payload, **kwargs):
        calls.append((system_prompt, user_payload, kwargs))
        if kwargs["model"] == "deepseek-v4-flash":
            return {
                "spec": {
                    "name": "Planned Evidence Lab",
                    "description": "Build a baseline, inspect evidence, and validate one hypothesis.",
                },
                "plan": {
                    "teachingGoal": "Evidence-based reasoning",
                    "implementationSteps": ["Prepare a safe artifact"],
                    "validationStrategy": ["Check runtime and disclosure boundaries"],
                },
            }
        if "Pro 规格构建 Agent" in system_prompt:
            return {
                "spec": {
                    "name": "Built Evidence Lab",
                },
                "implementation": {
                    "summary": "A minimal evidence-analysis exercise",
                    "artifacts": ["README.txt: supplied evidence"],
                    "runtimeAssumptions": ["No external network"],
                    "selfChecks": ["README is present"],
                },
            }
        if "Pro 产物构建 Agent" in system_prompt:
            return {
                "starterFiles": [
                    {
                        "path": "README.txt",
                        "content": "Inspect the evidence before acting.",
                    }
                ],
                "oracleContract": {
                    "type": "REPORT_JSON_V1",
                    "requiredFields": ["evidence"],
                    "assertions": [
                        {
                            "field": "evidence",
                            "operator": "contains",
                            "value": "observed",
                        }
                    ],
                },
                "runtimeContract": {"services": []},
                "privateSolution": {
                    "overview": "Inspect the supplied evidence.",
                    "steps": [
                        {
                            "goal": "Establish a baseline",
                            "action": "Read README.txt.",
                            "expectedEvidence": "The supplied observation is visible.",
                            "files": ["README.txt"],
                        }
                    ],
                    "successIndicators": ["The report contains observed evidence."],
                    "commonFailureModes": [],
                    "protectedFacts": {},
                },
            }
        return {
            "verdict": "PASS",
            "summary": "The public package is internally consistent.",
            "findings": [],
        }

    fallback = authoring._base_spec(
        "Create an evidence analysis exercise with a reproducible completion check.",
        {"id": "evidence-lab", "title": "Evidence Lab"},
        "L3",
        [],
    )
    secret = fallback["verificationAnswer"]
    with patch.object(authoring, "model_json", side_effect=fake_model):
        planned, plan_stage = authoring._model_plan(
            "Create an evidence analysis exercise with a reproducible completion check.",
            {},
            "L3",
            [],
            fallback,
        )
        built, build_stage = authoring._model_build(
            "Create an evidence analysis exercise with a reproducible completion check.",
            {},
            "L3",
            [],
            planned,
        )
        draft = SimpleNamespace(
            level="L3",
            brief="Create an evidence analysis exercise with a reproducible completion check.",
            constraints={},
            candidates=[],
        )
        review, validate_stage = authoring._model_validate(draft, built)

    assert plan_stage == {
        "provider": "MODEL",
        "model": "deepseek-v4-flash",
    }
    assert build_stage["provider"] == "MODEL"
    assert build_stage["model"] == "deepseek-v4-pro"
    assert set(build_stage["stages"]) == {"specification", "artifacts"}
    assert validate_stage == {
        "provider": "MODEL",
        "model": "deepseek-v4-pro",
    }
    assert review["verdict"] == "PASS"
    assert built["verificationAnswer"] == secret
    assert built["starterFiles"][0]["path"] == "README.txt"
    assert [call[2]["model"] for call in calls] == [
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "deepseek-v4-pro",
        "deepseek-v4-pro",
    ]
    assert calls[0][2]["thinking"] is False
    assert calls[1][2]["thinking"] is True
    assert calls[2][2]["thinking"] is True
    assert calls[3][2]["thinking"] is True
    assert calls[1][2]["reasoning_effort"] == "high"
    assert calls[2][2]["reasoning_effort"] == "high"
    assert calls[3][2]["reasoning_effort"] == "max"
    for _, payload, _ in calls[:3]:
        assert "verificationAnswer" not in json.dumps(
            payload, ensure_ascii=False
        )
        assert secret not in json.dumps(payload, ensure_ascii=False)
    # The independent private validator may see the dynamic Oracle value, but
    # it is never part of public generation payloads or generated artifacts.
    assert calls[3][1]["privateBuild"]["verificationAnswer"] == secret


def verify_source_native_authoring(authoring):
    assert not authoring._invents_source_report_protocol(
        (
            "Submit the dynamic flag through the native form. "
            "This source task does not use solution.json."
        )
    )
    assert not authoring._invents_source_report_protocol(
        "Preserve the native checker without inventing a solution.json report."
    )
    assert authoring._invents_source_report_protocol(
        "You must write the answer to /home/hacker/solution.json."
    )
    candidate = {
        "challengeId": 424242,
        "referenceId": "source-course/source-unit/source-task",
        "name": "Native source task",
        "description": (
            "Inspect the supplied source package and use its original "
            "completion mechanism."
        ),
        "category": "FORENSICS",
        "difficulty": 2,
        "objectives": ["Inspect source evidence."],
        "tags": ["forensics"],
        "image": "example/source-runtime:v1",
        "score": 10,
    }
    spec = authoring._base_spec(
        (
            "Adapt the teaching presentation while preserving the selected "
            "challenge runtime and checker."
        ),
        {
            "id": "source-native-adaptation",
            "title": "Source-native adaptation",
            "category": "FORENSICS",
        },
        "L2",
        [candidate],
    )
    assert spec["mode"] == "ADAPT_EXISTING"
    assert spec["sourceChallengeId"] == candidate["challengeId"]
    assert spec["verificationAnswer"] is None
    assert spec["starterFiles"] == []
    assert spec["oracleContract"] == {}
    assert spec["runtimeContract"] == {}

    calls = []
    source_context = {
        "available": True,
        "referenceId": candidate["referenceId"],
        "description": candidate["description"],
        "referenceFiles": {
            "available": True,
            "files": [
                {
                    "path": ".init",
                    "kind": "text",
                    "content": "#!/bin/sh\nexec /challenge/native-checker\n",
                }
            ],
        },
    }

    def fake_build(system_prompt, user_payload, **kwargs):
        calls.append((system_prompt, user_payload, kwargs))
        return {
            "spec": {
                "name": "Source-native Pro adaptation",
                "description": (
                    "Inspect the supplied source package and use its original "
                    "completion mechanism. Explain the evidence you observed."
                ),
            },
            "implementation": {
                "summary": "Preserve and snapshot the selected source runtime.",
                "artifacts": ["native source package"],
                "runtimeAssumptions": ["The source .init remains authoritative."],
                "selfChecks": ["Confirm the source package is importable."],
            },
        }

    with (
        patch.object(authoring, "model_json", side_effect=fake_build),
        patch.object(
            authoring,
            "_source_runtime_context",
            return_value=copy.deepcopy(source_context),
        ),
    ):
        built, build_stage = authoring._model_build(
            "Adapt the teaching presentation without changing completion.",
            {},
            "L2",
            [candidate],
            spec,
        )
    assert len(calls) == 1
    assert calls[0][2]["model"] == "deepseek-v4-pro"
    assert calls[0][1]["sourceRuntime"]["available"] is True
    assert build_stage["provider"] == "MODEL"
    assert set(build_stage["stages"]) == {
        "specification",
        "sourceSnapshot",
    }
    assert build_stage["stages"]["sourceSnapshot"]["provider"] == "PLATFORM"
    assert built["starterFiles"] == []
    assert built["privateSolution"] == {}
    assert built["oracleContract"] == {}
    assert built["runtimeContract"] == {}
    assert built["verificationAnswer"] is None
    assert not any(
        finding["id"]
        in {
            "det-oracle-contract",
            "det-runtime-contract",
            "det-private-solution",
        }
        for finding in authoring._deterministic_preflight_findings(built)
    )

    review_calls = []

    def fake_review(system_prompt, user_payload, **kwargs):
        review_calls.append((system_prompt, user_payload, kwargs))
        return {
            "verdict": "PASS",
            "summary": "The source-native metadata preserves the original runtime.",
            "findings": [],
        }

    with (
        patch.object(authoring, "model_json", side_effect=fake_review),
        patch.object(
            authoring,
            "_source_runtime_context",
            return_value=copy.deepcopy(source_context),
        ),
    ):
        review, review_stage = authoring._model_preflight_review(
            "Adapt the teaching presentation without changing completion.",
            {},
            "L2",
            [candidate],
            built,
        )
        draft_for_model = SimpleNamespace(
            level="L2",
            brief="Adapt the teaching presentation without changing completion.",
            constraints={},
            candidates=[candidate],
        )
        final_review, final_stage = authoring._model_validate(
            draft_for_model, built
        )
    assert review["verdict"] == "PASS"
    assert final_review["verdict"] == "PASS"
    assert review_stage["model"] == "deepseek-v4-pro"
    assert final_stage["model"] == "deepseek-v4-pro"
    assert len(review_calls) == 2
    assert all(call[1]["sourceNativeSnapshot"] for call in review_calls)
    assert all(
        call[1]["platformOwnedScaffold"]["mode"]
        == "PRESERVE_SOURCE_NATIVE"
        for call in review_calls
    )
    assert all(call[2]["model"] == "deepseek-v4-pro" for call in review_calls)
    with (
        patch.object(
            authoring,
            "model_json",
            return_value={
                "verdict": "BLOCK",
                "summary": "The fixed rubric lacks a report Oracle.",
                "findings": [
                    {
                        "id": "rubric-report-oracle",
                        "status": "OPEN",
                        "severity": "MEDIUM",
                        "stage": "METADATA.SPEC.RUBRIC",
                        "message": (
                            "The objective 60 points have no REPORT_JSON oracle."
                        ),
                        "recommendation": "Add a report Oracle.",
                    }
                ],
            },
        ),
        patch.object(
            authoring,
            "_source_runtime_context",
            return_value=copy.deepcopy(source_context),
        ),
    ):
        rubric_review, _ = authoring._model_validate(
            draft_for_model, built
        )
    assert rubric_review["verdict"] == "PASS"
    assert rubric_review["findings"] == []

    invented_protocol = copy.deepcopy(built)
    invented_protocol["description"] += (
        " You must write the answer to /home/hacker/solution.json."
    )
    assert any(
        finding["id"] == "det-source-native-protocol"
        and finding["severity"] == "HIGH"
        for finding in authoring._deterministic_preflight_findings(
            invented_protocol
        )
    )

    built["preflightReview"] = {
        "verdict": "PASS",
        "summary": "Source-native metadata is consistent.",
        "findings": [],
    }
    stage = {
        "provider": "MODEL",
        "model": "deepseek-v4-pro",
    }
    with tempfile.TemporaryDirectory() as directory:
        fake_source = SimpleNamespace(
            importable=True,
            path=pathlib.Path(directory),
        )

        class FakeQuery:
            def filter_by(self, **kwargs):
                return self

            def first(self):
                return fake_source

        fake_challenges = SimpleNamespace(query=FakeQuery())
        draft = SimpleNamespace(
            spec=copy.deepcopy(built),
            dojo=SimpleNamespace(
                modules=[SimpleNamespace(challenges=[])]
            ),
            module_index=0,
            published_challenge_id=None,
            validation={},
            level="L2",
            brief="Adapt the teaching presentation without changing completion.",
            constraints={},
            candidates=[candidate],
            author_id=1,
            id=1001,
            status="DRAFT",
        )
        with (
            patch.object(authoring, "DojoChallenges", fake_challenges),
            patch.object(authoring, "_audit", lambda *args, **kwargs: None),
            patch.object(
                authoring,
                "_model_validate",
                return_value=(
                    {
                        "verdict": "PASS",
                        "summary": "Source-native package is publishable.",
                        "findings": [],
                    },
                    stage,
                ),
            ),
        ):
            report = authoring.validate_draft(
                draft, allow_agent_repair=False
            )
    assert report["status"] == "PASS"
    assert not any(
        check["status"] == "BLOCK" for check in report["checks"]
    )


def verify_model_validation_gate(authoring):
    def draft_with(spec):
        return SimpleNamespace(
            spec=copy.deepcopy(spec),
            dojo=SimpleNamespace(
                modules=[SimpleNamespace(challenges=[])]
            ),
            module_index=0,
            published_challenge_id=None,
            candidates=[],
            constraints={},
            level="L3",
            brief="Create a safe, self-contained evidence exercise.",
            author_id=1,
            id="draft_test",
            status="DRAFT",
            validation={},
        )

    spec = authoring._base_spec(
        "Create a safe, self-contained evidence exercise with clear objectives.",
        {
            "id": "validation-gate",
            "title": "Validation Gate",
            "image": "pwncollege/challenge-legacy:stable",
        },
        "L3",
        [],
    )
    spec["authoringPipeline"] = {}
    spec["oracleContract"] = authoring._normalize_oracle_contract(
        {
            "type": "REPORT_JSON_V1",
            "requiredFields": ["evidence"],
            "assertions": [
                {
                    "field": "evidence",
                    "operator": "equals",
                    "value": "verified",
                }
            ],
        }
    )
    low_review = {
        "verdict": "PASS",
        "summary": "A minor documentation issue should be reviewed.",
        "findings": [
            {
                "id": "minor-doc",
                "status": "OPEN",
                "severity": "LOW",
                "stage": "CONTENT",
                "message": "Clarify one optional note.",
                "recommendation": "Add one sentence.",
            }
        ],
    }
    high_review = {
        "verdict": "BLOCK",
        "summary": "A secret disclosure risk blocks publication.",
        "findings": [
            {
                "id": "secret-risk",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "SECURITY",
                "message": "The package may disclose a protected value.",
                "recommendation": "Remove the disclosure.",
            }
        ],
    }
    stage = {"provider": "MODEL", "model": "deepseek-v4-pro"}
    with patch.object(authoring, "_audit", lambda *args, **kwargs: None):
        low_draft = draft_with(spec)
        with patch.object(
            authoring, "_model_validate", return_value=(low_review, stage)
        ):
            low_report = authoring.validate_draft(low_draft)
        high_draft = draft_with(spec)
        with patch.object(
            authoring, "_model_validate", return_value=(high_review, stage)
        ):
            high_report = authoring.validate_draft(
                high_draft, allow_agent_repair=False
            )
    assert low_report["status"] == "PASS"
    assert any(
        check["id"].startswith("agent-minor-doc")
        and check["status"] == "WARN"
        for check in low_report["checks"]
    )
    assert high_report["status"] == "BLOCK"
    assert any(
        check["id"].startswith("agent-secret-risk")
        and check["status"] == "BLOCK"
        for check in high_report["checks"]
    )

    resolved_high_review = copy.deepcopy(high_review)
    resolved_high_review["verdict"] = "PASS"
    resolved_high_review["findings"][0]["status"] = "RESOLVED"
    healed_spec = copy.deepcopy(spec)
    healed_spec["preflightReview"] = resolved_high_review
    with (
        patch.object(authoring, "_audit", lambda *args, **kwargs: None),
        patch.object(
            authoring,
            "_model_validate",
            side_effect=[(high_review, stage), (low_review, stage)],
        ) as validate_model,
        patch.object(
            authoring,
            "_repair_until_clear",
            return_value=(
                healed_spec,
                resolved_high_review,
                {
                    "provider": "MODEL",
                    "model": "deepseek-v4-pro",
                    "cycles": [{"cycle": 1, "mode": "EXACT_PATCH"}],
                    "resolved": True,
                },
                stage,
            ),
        ) as final_repair,
    ):
        healed_report = authoring.validate_draft(draft_with(spec))
    assert healed_report["status"] == "PASS"
    assert validate_model.call_count == 1
    final_repair.assert_called_once()
    assert (
        healed_report["agentReview"]["verdict"] == "PASS"
        and healed_report["agentReview"]["provider"] == "MODEL_ATTESTED"
        and healed_report["summary"]["blocked"] == 0
    )

    attested_draft = draft_with(spec)
    with (
        patch.object(authoring, "_audit", lambda *args, **kwargs: None),
        patch.object(
            authoring, "_model_validate", return_value=(low_review, stage)
        ) as initial_validation,
    ):
        initial_report = authoring.validate_draft(attested_draft)
    assert initial_report["status"] == "PASS"
    assert initial_validation.call_count == 1
    with (
        patch.object(authoring, "_audit", lambda *args, **kwargs: None),
        patch.object(authoring, "_model_validate") as duplicate_validation,
    ):
        attested_report = authoring.validate_draft(
            attested_draft,
            allow_agent_repair=False,
            reuse_attested_review=True,
        )
    duplicate_validation.assert_not_called()
    assert (
        attested_report["status"] == "PASS"
        and attested_report["agentReview"]["provider"]
        == "MODEL_ATTESTED"
        and attested_report["agentReview"]["model"]
        == "deepseek-v4-pro"
    )
    attested_draft.spec["description"] += " This package changed."
    with (
        patch.object(authoring, "_audit", lambda *args, **kwargs: None),
        patch.object(
            authoring, "_model_validate", return_value=(low_review, stage)
        ) as changed_validation,
    ):
        changed_report = authoring.validate_draft(
            attested_draft,
            allow_agent_repair=False,
            reuse_attested_review=True,
        )
    assert changed_report["status"] == "PASS"
    changed_validation.assert_called_once()

    weak_outcome_spec = copy.deepcopy(spec)
    weak_outcome_spec["authoringPlan"] = {
        "teachingGoal": "Verify a concrete observed outcome."
    }
    weak_outcome_spec["starterFiles"] = [
        {
            "path": "README.txt",
            "content": "Record the concrete observed outcome.\n",
        }
    ]
    weak_outcome_spec["privateSolution"] = {
        "overview": "Observe and record the supplied outcome.",
        "steps": [{"goal": "Record the observed outcome."}],
        "successIndicators": ["The concrete status is recorded."],
    }
    weak_outcome_spec["oracleContract"] = (
        authoring._normalize_oracle_contract(
            {
                "type": "REPORT_JSON_V1",
                "requiredFields": ["status"],
                "assertions": [
                    {"field": "status", "operator": "exists"}
                ],
            }
        )
    )
    with patch.object(authoring, "_audit", lambda *args, **kwargs: None):
        weak_outcome_draft = draft_with(weak_outcome_spec)
        with patch.object(
            authoring, "_model_validate", return_value=(low_review, stage)
        ):
            weak_outcome_report = authoring.validate_draft(
                weak_outcome_draft
            )
    assert weak_outcome_report["status"] == "BLOCK"
    assert any(
        check["id"] == "oracle-outcome-assertions"
        and check["status"] == "BLOCK"
        for check in weak_outcome_report["checks"]
    )


def verify_review_state_protocol(authoring):
    prior = {
        "verdict": "BLOCK",
        "summary": "A runtime dependency is missing.",
        "findings": [
            {
                "id": "runtime-dependency",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "RUNTIME",
                "message": "The declared service cannot start.",
                "recommendation": "Supply the dependency.",
            }
        ],
    }
    contradictory = authoring._normalize_validation_review(
        {
            "verdict": "PASS",
            "findings": [
                {
                    "id": "runtime-dependency",
                    "status": "OPEN",
                    "severity": "HIGH",
                }
            ],
        }
    )
    assert contradictory["verdict"] == "BLOCK"

    omitted = authoring._normalize_validation_review(
        {"verdict": "PASS", "findings": []},
        prior_review=prior,
    )
    assert omitted["verdict"] == "BLOCK"
    assert omitted["findings"][0]["status"] == "OPEN"

    resolved = authoring._normalize_validation_review(
        {
            "verdict": "PASS",
            "findings": [
                {
                    "id": "runtime-dependency",
                    "status": "RESOLVED",
                    "severity": "HIGH",
                    "stage": "RUNTIME",
                    "message": "The dependency is now present.",
                }
            ],
        },
        prior_review=prior,
    )
    assert resolved["verdict"] == "PASS"
    assert resolved["findings"][0]["status"] == "RESOLVED"


def verify_runtime_contract_gate(authoring):
    assert (
        authoring._canonical_package_path("/challenge/server.py")
        == "server.py"
    )
    assert authoring._canonical_package_path("/tmp/server.py") is None
    assert authoring._canonical_package_path("../server.py") is None
    spec = authoring._base_spec(
        "Create a self-contained local HTTP observation exercise.",
        {"id": "runtime-contract-gate", "category": "WEB"},
        "L3",
        [],
    )
    spec["starterFiles"] = [
        {
            "path": "server.py",
            "content": (
                "from http.server import HTTPServer, BaseHTTPRequestHandler\n"
                "HTTPServer(('127.0.0.1', 8123), BaseHTTPRequestHandler).serve_forever()\n"
            ),
        }
    ]
    spec["runtimeContract"] = {
        "services": [
            {
                "name": "web",
                "interpreter": "python3",
                "entrypoint": "server.py",
                "arguments": [],
                "port": 8123,
            }
        ]
    }
    normalized = authoring._normalize_runtime_contract(
        spec["runtimeContract"]
    )
    assert not authoring._runtime_contract_diagnostics(spec, normalized)
    assert normalized["services"][0]["workingDirectory"] == "/challenge"

    spec["starterFiles"][0]["content"] = (
        "import os\n"
        "from http.server import HTTPServer, BaseHTTPRequestHandler\n"
        "SECRET = os.getenv('EXERCISE_SECRET')\n"
        "HTTPServer(('127.0.0.1', 8123), BaseHTTPRequestHandler).serve_forever()\n"
    )
    diagnostics = authoring._runtime_contract_diagnostics(spec, normalized)
    assert any("环境变量" in message for message in diagnostics)

    spec["starterFiles"][0]["content"] = (
        "import http.server\n"
        "http.server.HTTPSever(('127.0.0.1', 8123), "
        "http.server.BaseHTTPRequestHandler).serve_forever()\n"
    )
    diagnostics = authoring._runtime_contract_diagnostics(spec, normalized)
    assert any("HTTPSever" in message for message in diagnostics)

    absolute_runtime = copy.deepcopy(spec["runtimeContract"])
    absolute_runtime["services"][0]["entrypoint"] = "/challenge/server.py"
    assert authoring._normalize_runtime_contract(absolute_runtime)[
        "services"
    ][0]["entrypoint"] == "server.py"
    files, applied, rejected = authoring._apply_model_file_edits(
        [],
        [
            {
                "operation": "add-file",
                "path": "/challenge/generated.py",
                "content": "print('ready')\n",
            }
        ],
    )
    assert files == [{"path": "generated.py", "content": "print('ready')\n"}]
    assert applied and not rejected

    spec["starterFiles"][0]["content"] = (
        "from flask import Flask\napp = Flask(__name__)\napp.run(port=8123)\n"
    )
    diagnostics = authoring._runtime_contract_diagnostics(spec, normalized)
    assert any("flask" in message for message in diagnostics)

    spec["runtimeContract"]["services"][0]["port"] = 80
    normalized = authoring._normalize_runtime_contract(
        spec["runtimeContract"]
    )
    diagnostics = authoring._runtime_contract_diagnostics(spec, normalized)
    assert any("端口" in message for message in diagnostics)


def verify_public_secret_gate(authoring):
    spec = authoring._base_spec(
        "Create a safe evidence exercise.",
        {"id": "public-secret-gate", "category": "FORENSICS"},
        "L3",
        [],
    )
    spec["authoringPlan"] = {"teachingGoal": "Inspect evidence safely."}
    spec["starterFiles"] = [
        {
            "path": "README.txt",
            "content": f"debug={spec['verificationAnswer']}\n",
        }
    ]
    findings = authoring._deterministic_preflight_findings(spec)
    assert any(
        finding["id"] == "det-public-secret"
        and finding["severity"] == "CRITICAL"
        for finding in findings
    )
    spec["starterFiles"][0]["content"] = "Inspect the supplied evidence.\n"
    assert not authoring._public_protected_disclosures(spec)


def verify_attempt_version_pin(context):
    profile = SimpleNamespace(
        version=2,
        package={
            "version": 2,
            "packagePath": "/var/dojos/.learning/example/v2",
            "privateSolution": {"overview": "version two"},
            "history": [
                {
                    "version": 1,
                    "packagePath": "/var/dojos/.learning/example/v1",
                    "privateSolution": {"overview": "version one"},
                    "oracleContract": {"type": "REPORT_JSON_V1"},
                    "runtimeContract": {"services": []},
                }
            ],
        },
    )
    old_attempt = SimpleNamespace(
        data={"runtime": {"challengeVersion": 1}}
    )
    selected = context._published_package_for_attempt(
        profile, old_attempt
    )
    assert selected["version"] == 1
    assert selected["versionMatched"] is True
    assert selected["isCurrent"] is False
    assert selected["privateSolution"]["overview"] == "version one"

    missing_attempt = SimpleNamespace(
        data={"runtime": {"challengeVersion": 99}}
    )
    missing = context._published_package_for_attempt(
        profile, missing_attempt
    )
    assert missing["version"] == 2
    assert missing["versionMatched"] is False
    assert missing["isCurrent"] is True

    legacy_profile = SimpleNamespace(version=1, package={})
    legacy_attempt = SimpleNamespace(
        data={"runtime": {"challengeVersion": 1}}
    )
    legacy = context._published_package_for_attempt(
        legacy_profile, legacy_attempt
    )
    assert legacy["version"] == 1
    assert legacy["versionMatched"] is True
    assert legacy["isCurrent"] is True

    unprofiled = context._published_package_for_attempt(
        None, legacy_attempt
    )
    assert unprofiled["version"] == 1
    assert unprofiled["versionMatched"] is True
    assert unprofiled["isCurrent"] is True


def verify_container_symlink_inventory(context):
    def fake_exec(_container, command, **_kwargs):
        if "-type f" in command:
            return {"exitCode": 0, "output": ""}
        if "-type l" in command:
            return {
                "exitCode": 0,
                "output": "1784800000.0\t/challenge/run\t/run/dojo/bin/run\0",
            }
        raise AssertionError(f"unexpected command: {command}")

    with patch.object(context, "_container_exec", side_effect=fake_exec):
        snapshot = context.scan_container_tree(SimpleNamespace())
    assert snapshot["available"] is True
    assert snapshot["includedContentChars"] == 0
    assert snapshot["files"] == [
        {
            "path": "run",
            "modified": "2026-07-23T09:46:40Z",
            "kind": "symlink",
            "target": "/run/dojo/bin/run",
            "content": None,
        }
    ]

    calls = []

    class MountedFileContainer:
        @staticmethod
        def get_archive(_path):
            raise OSError("archive endpoint cannot read mounted file")

        @staticmethod
        def exec_run(command, **kwargs):
            calls.append((command, kwargs))
            return 0, b"mounted-content"

    content = context._container_file(
        MountedFileContainer(),
        "/challenge/mounted/run",
    )
    assert content == b"mounted-content"
    command, kwargs = calls[0]
    assert command[4] == "/challenge/mounted/run"
    assert "/challenge/mounted/run" not in command[2]
    assert kwargs == {"user": "0", "demux": False}


def verify_deterministic_preflight_repair_signal(authoring):
    spec = authoring._base_spec(
        "Create a self-contained local Web authorization exercise.",
        {"id": "preflight-runtime-signal", "category": "WEB"},
        "L3",
        [],
    )
    spec["starterFiles"] = [
        {
            "path": "server.py",
            "content": (
                "from http.server import HTTPServer, BaseHTTPRequestHandler\n"
                "HTTPServer(('127.0.0.1', 8123), BaseHTTPRequestHandler).serve_forever()\n"
            ),
        }
    ]
    spec["privateSolution"] = {
        "overview": "Compare two local requests.",
        "steps": [{"goal": "Establish a baseline"}],
        "successIndicators": ["The report records the observed result."],
    }
    model_pass = {
        "verdict": "PASS",
        "summary": "No model findings.",
        "findings": [],
    }
    with patch.object(authoring, "model_json", return_value=model_pass):
        blocked, _ = authoring._model_preflight_review(
            spec["description"], {}, "L3", [], spec
        )
    assert blocked["verdict"] == "BLOCK"
    assert any(
        finding["id"] == "det-web-runtime"
        and finding["status"] == "OPEN"
        for finding in blocked["findings"]
    )

    spec["runtimeContract"] = {
        "services": [
            {
                "name": "web",
                "interpreter": "python3",
                "entrypoint": "server.py",
                "arguments": [],
                "port": 8123,
            }
        ]
    }
    with patch.object(authoring, "model_json", return_value=model_pass):
        repaired, _ = authoring._model_preflight_review(
            spec["description"],
            {},
            "L3",
            [],
            spec,
            prior_review=blocked,
        )
    assert repaired["verdict"] == "PASS"
    assert any(
        finding["id"] == "det-web-runtime"
        and finding["status"] == "RESOLVED"
        for finding in repaired["findings"]
    )


def verify_structural_closure_agent(authoring):
    brief = "Create a self-contained local Web authorization exercise."
    spec = authoring._base_spec(
        brief,
        {"id": "structural-closure-agent", "category": "WEB"},
        "L3",
        [],
    )
    spec["authoringPlan"] = {
        "teachingGoal": "Compare an authorized and unauthorized request."
    }
    calls = []

    def fake_model(system_prompt, user_payload, **kwargs):
        calls.append((system_prompt, user_payload, kwargs))
        if "最小闭环恢复 Agent" in system_prompt:
            return {
                "artifacts": {
                    "files": [
                        {
                            "path": "/challenge/server.py",
                            "content": (
                                "from http.server import BaseHTTPRequestHandler, HTTPServer\n"
                                "class Handler(BaseHTTPRequestHandler):\n"
                                "    def do_GET(self):\n"
                                "        self.send_response(200)\n"
                                "        self.end_headers()\n"
                                "        self.wfile.write(b'profile=alice')\n"
                                "HTTPServer(('127.0.0.1', 8124), Handler).serve_forever()\n"
                            ),
                        }
                    ],
                    "oracleContract": {
                        "type": "REPORT_JSON_V1",
                        "requiredFields": ["result", "conclusion"],
                        "assertions": [
                            {
                                "field": "result",
                                "operator": "equals",
                                "value": "cross-profile-exposed",
                            },
                            {"field": "conclusion", "operator": "exists"},
                        ],
                        "liveBindings": [
                            {
                                "field": "live.body_sha256",
                                "service": "web",
                                "method": "GET",
                                "path": "/",
                                "headers": {},
                                "capture": "body_sha256",
                            }
                        ],
                        "integrityFiles": ["server.py"],
                    },
                    "runtimeContract": {
                        "services": [
                            {
                                "name": "web",
                                "interpreter": "python3",
                                "entrypoint": "/challenge/server.py",
                                "arguments": [],
                                "port": 8124,
                            }
                        ]
                    },
                    "privateSolution": {
                        "overview": "Compare the two local request identities.",
                        "steps": [
                            {
                                "goal": "Establish the authorized baseline.",
                                "action": "Record the own-profile response.",
                                "expectedEvidence": "The baseline identifies alice.",
                                "files": ["server.py"],
                            }
                        ],
                        "successIndicators": [
                            "The report distinguishes the authorization boundary."
                        ],
                        "commonFailureModes": [],
                        "protectedFacts": {},
                    },
                    "repairSummary": "Restored the runnable Web closure.",
                }
            }
        return {
            "verdict": "PASS",
            "summary": "The artifact closure is internally consistent.",
            "findings": [],
        }

    with patch.object(authoring, "model_json", side_effect=fake_model):
        initial_review, _ = authoring._model_preflight_review(
            brief, {}, "L3", [], spec
        )
        repaired, final_review, stage, _ = authoring._repair_until_clear(
            brief, {}, "L3", [], spec, initial_review
        )
    assert initial_review["verdict"] == "BLOCK"
    assert final_review["verdict"] == "PASS"
    assert stage["resolved"] is True
    assert stage["cycles"][0]["mode"] == "ARTIFACT_CLOSURE"
    assert repaired["starterFiles"][0]["path"] == "server.py"
    assert repaired["runtimeContract"]["services"][0]["entrypoint"] == "server.py"
    assert not authoring._runtime_contract_diagnostics(
        repaired,
        authoring._normalize_runtime_contract(
            repaired["runtimeContract"]
        ),
    )
    closure_call = next(
        call for call in calls if "最小闭环恢复 Agent" in call[0]
    )
    assert closure_call[2]["model"] == "deepseek-v4-pro"
    assert closure_call[2]["thinking"] is True
    assert spec["verificationAnswer"] not in json.dumps(
        closure_call[1], ensure_ascii=False
    )


def verify_contract_closure_agent(authoring):
    brief = "Create a local Web exercise with an observable authorization result."
    spec = authoring._base_spec(
        brief,
        {"id": "contract-closure-agent", "category": "WEB"},
        "L3",
        [],
    )
    spec["authoringPlan"] = {"teachingGoal": "Verify an authorization result."}
    spec["starterFiles"] = [
        {
            "path": "server.py",
            "content": (
                "from http.server import BaseHTTPRequestHandler, HTTPServer\n"
                "HTTPServer(('127.0.0.1', 8125), BaseHTTPRequestHandler).serve_forever()\n"
            ),
        }
    ]
    spec["runtimeContract"] = authoring._normalize_runtime_contract(
        {
            "services": [
                {
                    "name": "web",
                    "interpreter": "python3",
                    "entrypoint": "server.py",
                    "arguments": [],
                    "port": 8125,
                }
            ]
        }
    )
    spec["oracleContract"] = authoring._normalize_oracle_contract(
        {
            "type": "REPORT_JSON_V1",
            "requiredFields": ["cross_response.status"],
            "assertions": [
                {
                    "field": "cross_response.status",
                    "operator": "exists",
                }
            ],
        }
    )
    spec["privateSolution"] = {
        "overview": "Compare the response.",
        "steps": [{"goal": "Record the cross-profile response."}],
        "successIndicators": ["The response status is recorded."],
    }
    findings = authoring._deterministic_preflight_findings(spec)
    assert any(
        finding["id"] == "det-oracle-outcome"
        and finding["status"] == "OPEN"
        for finding in findings
    )

    def fake_model(system_prompt, user_payload, **kwargs):
        if "验证闭环修复 Agent" in system_prompt:
            return {
                "oracleContract": {
                    "type": "REPORT_JSON_V1",
                    "requiredFields": ["cross_response.status"],
                    "assertions": [
                        {
                            "field": "cross_response.status",
                            "operator": "equals",
                            "value": 200,
                        }
                    ],
                    "liveBindings": [
                        {
                            "field": "cross_response.status",
                            "service": "web",
                            "method": "GET",
                            "path": "/",
                            "headers": {},
                            "capture": "status",
                        },
                        {
                            "field": "cross_response.body_sha256",
                            "service": "web",
                            "method": "GET",
                            "path": "/",
                            "headers": {},
                            "capture": "body_sha256",
                        }
                    ],
                    "integrityFiles": ["server.py"],
                },
                "runtimeContract": spec["runtimeContract"],
                "privateSolution": {
                    "overview": "Request and record the cross-profile response.",
                    "steps": [
                        {
                            "goal": "Observe the authorization result.",
                            "action": "Send the local request and record its status.",
                            "expectedEvidence": "The response status is 200.",
                            "files": ["server.py"],
                        }
                    ],
                    "successIndicators": ["The report records status 200."],
                    "commonFailureModes": [],
                    "protectedFacts": {},
                },
                "repairSummary": "Bound the decisive outcome to an observed value.",
            }
        return {
            "verdict": "PASS",
            "summary": "The contracts are coherent.",
            "findings": [],
        }

    with patch.object(authoring, "model_json", side_effect=fake_model):
        initial_review, _ = authoring._model_preflight_review(
            brief, {}, "L3", [], spec
        )
        assert authoring._needs_contract_closure_repair(
            spec, initial_review
        )
        repaired, final_review, repair_stage, _ = (
            authoring._repair_until_clear(
                brief, {}, "L3", [], spec, initial_review
            )
        )
    assert initial_review["verdict"] == "BLOCK"
    assert repair_stage["cycles"][0]["mode"] == "CONTRACT_CLOSURE"
    assert final_review["verdict"] == "PASS"
    assert repaired["starterFiles"] == spec["starterFiles"]
    assert repaired["oracleContract"]["assertions"][0]["operator"] == "equals"

    working_directory_finding = {
        "verdict": "BLOCK",
        "summary": "The working directory is not explicit.",
        "findings": [
            {
                "id": "model-working-directory",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "RUNTIME",
                "message": "runtimeContract is missing workingDirectory.",
                "recommendation": "Set workingDirectory.",
            }
        ],
    }
    with patch.object(
        authoring, "model_json", return_value=working_directory_finding
    ):
        platform_review, _ = authoring._model_preflight_review(
            brief, {}, "L3", [], repaired
        )
    assert platform_review["verdict"] == "PASS"

    self_contradictory_finding = {
        "verdict": "BLOCK",
        "summary": "A replacement is allegedly required.",
        "findings": [
            {
                "id": "model-identical-replacement",
                "status": "OPEN",
                "severity": "CRITICAL",
                "stage": "RUNTIME",
                "message": "'HTTPServer' 应为 'HTTPServer'。",
                "recommendation": "Replace it.",
            }
        ],
    }
    with patch.object(
        authoring,
        "model_json",
        return_value=self_contradictory_finding,
    ):
        contradiction_review, _ = authoring._model_preflight_review(
            brief, {}, "L3", [], repaired
        )
    assert contradiction_review["verdict"] == "PASS", contradiction_review
    assert not contradiction_review["findings"]

    unsupported_environment_finding = {
        "verdict": "BLOCK",
        "summary": "The runtime contract allegedly needs environment data.",
        "findings": [
            {
                "id": "model-runtime-environment",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "RUNTIME",
                "message": (
                    "runtimeContract must declare the exercise environment variables."
                ),
                "recommendation": "Add an environment field.",
            }
        ],
    }
    with patch.object(
        authoring,
        "model_json",
        return_value=unsupported_environment_finding,
    ):
        environment_review, _ = authoring._model_preflight_review(
            brief, {}, "L3", [], repaired
        )
    assert environment_review["verdict"] == "PASS", environment_review
    assert not environment_review["findings"]


def verify_no_key_fallback_remains_usable(authoring):
    brief = "Create a beginner evidence-verification exercise."
    fallback = authoring._base_spec(
        brief,
        {
            "id": "deterministic-fallback",
            "category": "FORENSICS",
            "image": "pwncollege/challenge-legacy:stable",
        },
        "L3",
        [],
    )
    with patch.object(authoring, "model_json", return_value=None):
        planned, _ = authoring._model_plan(
            brief, {}, "L3", [], fallback
        )
        built, _ = authoring._model_build(
            brief, {}, "L3", [], planned
        )
        review, _ = authoring._model_preflight_review(
            brief, {}, "L3", [], built
        )
        _, final_review, repair, _ = authoring._repair_until_clear(
            brief, {}, "L3", [], built, review
        )
    assert final_review["verdict"] == "PASS"
    assert repair["cycles"] == []


def verify_live_oracle_and_metadata_gate(authoring):
    spec = authoring._base_spec(
        "Create a local Web authorization observation exercise.",
        {"id": "live-oracle-gate", "category": "WEB"},
        "L3",
        [],
    )
    spec["authoringPlan"] = {"teachingGoal": "Observe a cross-user response."}
    spec["implementation"] = {
        "summary": "stale",
        "artifacts": ["/home/hacker/users/alice.json"],
        "runtimeAssumptions": ["stale disk design"],
        "selfChecks": [],
    }
    spec["starterFiles"] = [
        {
            "path": "server.py",
            "content": (
                "from http.server import BaseHTTPRequestHandler, HTTPServer\n"
                "class Handler(BaseHTTPRequestHandler):\n"
                "    def do_GET(self):\n"
                "        self.send_response(200)\n"
                "        self.end_headers()\n"
                "        self.wfile.write(b'profile=alice')\n"
                "HTTPServer(('127.0.0.1', 8126), Handler).serve_forever()\n"
            ),
        }
    ]
    spec["runtimeContract"] = {
        "services": [
            {
                "name": "web",
                "interpreter": "python3",
                "entrypoint": "server.py",
                "arguments": [],
                "port": 8126,
            }
        ]
    }
    spec["oracleContract"] = {
        "type": "REPORT_JSON_V1",
        "requiredFields": ["cross.status"],
        "assertions": [
            {"field": "cross.status", "operator": "equals", "value": 200}
        ],
    }
    weak_findings = authoring._deterministic_preflight_findings(spec)
    assert any(
        finding["id"] == "det-oracle-live-evidence"
        and finding["status"] == "OPEN"
        for finding in weak_findings
    )

    spec["oracleContract"] = {
        **spec["oracleContract"],
        "liveBindings": [
            {
                "field": "cross.status",
                "service": "web",
                "method": "GET",
                "path": "/profile?user=alice",
                "headers": {"X-User": "alice"},
                "capture": "status",
            },
            {
                "field": "cross.body_sha256",
                "service": "web",
                "method": "GET",
                "path": "/profile?user=bob",
                "headers": {"X-User": "alice"},
                "capture": "body_sha256",
            },
        ],
        "integrityFiles": ["server.py"],
    }
    spec = authoring._synchronize_generated_metadata(spec)
    strong_findings = authoring._deterministic_preflight_findings(spec)
    assert not any(
        finding["id"] == "det-oracle-live-evidence"
        for finding in strong_findings
    )
    assert spec["oracleContract"]["integrityFiles"] == ["server.py"]
    implementation_text = json.dumps(
        spec["implementation"], ensure_ascii=False
    )
    assert "server.py" in implementation_text
    assert "/home/hacker/users/alice.json" not in implementation_text
    spec["privateSolution"] = {
        "overview": "Inspect the local authorization boundary.",
        "steps": [
            {
                "goal": "Start the service again.",
                "action": "Run `python3 /challenge/server.py`.",
                "expectedEvidence": "The service listens.",
                "files": ["server.py"],
            }
        ],
        "successIndicators": ["The response is observed."],
        "commonFailureModes": [],
        "protectedFacts": {},
    }
    manual_start_findings = authoring._deterministic_preflight_findings(spec)
    assert any(
        finding["id"] == "det-private-solution-runtime"
        and finding["status"] == "OPEN"
        for finding in manual_start_findings
    )
    spec["privateSolution"]["steps"][0]["goal"] = "Confirm the existing service."
    spec["privateSolution"]["steps"][0]["action"] = (
        "Inspect the declared port, then query the existing service."
    )
    assert not authoring._private_solution_runtime_diagnostics(
        spec, spec["runtimeContract"]
    )

    original_dojos_dir = authoring.DOJOS_DIR
    try:
        with tempfile.TemporaryDirectory(
            prefix="aisecedu-live-oracle-"
        ) as temporary_directory:
            authoring.DOJOS_DIR = pathlib.Path(temporary_directory)
            package = authoring._write_custom_package(
                SimpleNamespace(
                    spec=spec,
                    dojo=SimpleNamespace(hex_dojo_id="liveoracle"),
                    module_index=0,
                ),
                12345,
                1,
            )
            subprocess.run(
                [
                    "python3",
                    "-m",
                    "py_compile",
                    str(package / "check-server.py"),
                    str(package / "runtime-launcher.py"),
                ],
                check=True,
            )
            checker_source = (package / "check-server.py").read_text()
            launcher_source = (package / "runtime-launcher.py").read_text()
            init_source = (package / ".init").read_text()
            assert (package / "check-server.py").stat().st_mode & 0o777 == 0o700
            assert "original_service_running" in checker_source
            assert "validate_integrity" in checker_source
            assert "dojo-learning-service-pids.json" in launcher_source
            assert "dict(os.environ)" not in launcher_source
            ownership_guard = (
                "chown root:root /challenge/check-server.py "
                "/challenge/runtime-launcher.py"
            )
            assert ownership_guard in init_source
            assert init_source.index(ownership_guard) < init_source.index(
                "python3 /challenge/check-server.py"
            )
            assert (
                "chmod 0700 /challenge/check-server.py "
                "/challenge/runtime-launcher.py"
            ) in init_source
    finally:
        authoring.DOJOS_DIR = original_dojos_dir

    rejected = authoring._normalize_oracle_contract(
        {
            "type": "REPORT_JSON_V1",
            "requiredFields": ["cross.body_sha256"],
            "assertions": [
                {
                    "field": "cross.body_sha256",
                    "operator": "exists",
                }
            ],
            "liveBindings": [
                {
                    "field": "cross.body_sha256",
                    "service": "web",
                    "method": "GET",
                    "path": "/",
                    "headers": {"Authorization": "Bearer forbidden"},
                    "capture": "body_sha256",
                }
            ],
        }
    )
    assert rejected["liveBindings"] == []


def verify_solution_agent_contract(solution_agent):
    from CTFd.plugins.dojo_plugin.utils import serialize_user_flag

    assert solution_agent.DOJO_AI_SOLUTION_MODEL == "deepseek-v4-pro"
    forbidden = [
        "cat /flag",
        "cat$IFS/flag",
        "cat ../flag",
        "python3 -c \"print(open(chr(47) + 'flag').read())\"",
        "find / -name flag",
        "python3 /challenge/check-server.py",
        "cat /proc/self/environ",
        "sudo id",
        "docker inspect user_1",
        "nsenter -t 1 -m sh",
        "printenv",
    ]
    for command in forbidden:
        assert solution_agent._command_policy_violation(command)
    for command in [
        "file ./target",
        "strings ./target | head",
        "curl -s http://127.0.0.1:8080/",
        "gcc -O0 -g exploit.c -o exploit",
    ]:
        assert solution_agent._command_policy_violation(command) is None

    calls = []

    class LearnerContainer:
        def exec_run(self, argv, **kwargs):
            calls.append((argv, kwargs))
            return SimpleNamespace(exit_code=0, output=b"learner-visible output")

    exit_code, output = solution_agent._execute_as_learner(
        LearnerContainer(),
        "pwd",
    )
    assert exit_code == 0
    assert output == "learner-visible output"
    argv, kwargs = calls[0]
    assert argv[-2:] == ["-lc", "pwd"]
    assert kwargs["user"] == "1000"
    assert kwargs["workdir"] == "/challenge"
    assert kwargs["environment"]["HOME"] == "/home/hacker"

    valid = f"pwn.college{{{serialize_user_flag(431, 872)}}}"
    assert solution_agent._verified_flag(valid, 431, 872)
    assert not solution_agent._verified_flag(valid, 432, 872)
    assert not solution_agent._verified_flag(valid, 431, 873)
    assert solution_agent._redact_flags(valid) == "[VERIFIED_FLAG_CAPTURED]"

    trace = [
        {
            "turn": 0,
            "policy": "ALLOWED",
            "command": "file ./target",
            "output": "ELF executable",
            "rationale": "Inspect the learner-visible binary.",
        },
        {
            "turn": 1,
            "policy": "ALLOWED",
            "command": "./target --solve",
            "output": valid,
            "rationale": "Use the verified exploit path.",
            "flagObserved": True,
        },
    ]
    canonical, mapped = solution_agent._canonical_trace_solution(
        [
            {"goal": "Inspect the binary", "traceTurns": [0]},
            {"goal": "Run the verified path", "traceTurns": [1]},
        ],
        trace,
    )
    assert mapped
    assert [step["action"] for step in canonical] == [
        "file ./target",
        "./target --solve",
    ]
    assert "VERIFIED_FLAG_CAPTURED" in canonical[-1]["expectedEvidence"]
    fallback, mapped = solution_agent._canonical_trace_solution(
        [{"goal": "Invented shortcut", "traceTurns": [1]}], trace
    )
    assert not mapped
    assert [step["action"] for step in fallback] == [
        "file ./target",
        "./target --solve",
    ]


def verify_autonomous_authoring_orchestration(authoring):
    candidates = [
        {
            "challengeId": "candidate-one",
            "referenceId": "dojo/module/candidate-one",
            "name": "Candidate One",
            "score": 9,
        },
        {
            "challengeId": "candidate-two",
            "referenceId": "dojo/module/candidate-two",
            "name": "Candidate Two",
            "score": 8,
        },
    ]
    with patch.object(
        authoring,
        "model_json",
        return_value={
            "strategy": "L1",
            "selectedChallengeId": "candidate-two",
            "reason": "The requested objective already matches this challenge.",
        },
    ):
        level, ordered, decision = authoring._select_authoring_strategy(
            "Create a challenge that matches the catalog objective.",
            {},
            candidates,
        )
    assert level == "L1"
    assert decision["provider"] == "MODEL"
    assert decision["selectedChallengeId"] == "candidate-two"
    assert ordered[0]["challengeId"] == "candidate-two"

    with patch.object(authoring, "model_json") as strategy_model:
        level, _, decision = authoring._select_authoring_strategy(
            "请明确使用 L3，从零创建一道自包含题目。",
            {},
            candidates,
        )
    strategy_model.assert_not_called()
    assert level == "L3"
    assert decision["provider"] == "TEACHER_DIRECTIVE"
    assert decision["selectedChallengeId"] is None

    spec = authoring._base_spec(
        "Create a self-contained evidence exercise.",
        {"id": "autonomous-loop", "title": "Autonomous Loop"},
        "L3",
        [],
    )
    blocked_report = {
        "status": "BLOCK",
        "summary": {"passed": 8, "warnings": 0, "blocked": 1},
        "packageDigest": authoring._package_digest(spec),
        "checks": [
            {
                "id": "runtime-contract",
                "stage": "RUNTIME",
                "status": "BLOCK",
                "message": "The runtime entrypoint is missing.",
            }
        ],
        "agentReview": {
            "provider": "MODEL",
            "model": "deepseek-v4-pro",
            "verdict": "PASS",
            "summary": "The deterministic runtime gate still blocks.",
            "findings": [],
        },
    }
    repaired_spec = copy.deepcopy(spec)
    repaired_spec["description"] += " The repaired runtime is now self-contained."
    passed_report = {
        "status": "PASS",
        "summary": {"passed": 9, "warnings": 0, "blocked": 0},
        "packageDigest": authoring._package_digest(repaired_spec),
        "checks": [],
        "agentReview": {
            "provider": "MODEL",
            "model": "deepseek-v4-pro",
            "verdict": "PASS",
            "summary": "The repaired package passes.",
            "findings": [],
        },
    }
    repair_stage = {
        "provider": "MODEL",
        "model": "deepseek-v4-pro",
        "resolved": True,
        "cycles": [
            {
                "cycle": 1,
                "mode": "EXACT_PATCH",
                "inputVerdict": "BLOCK",
                "outputVerdict": "PASS",
                "inputFindings": [
                    {"id": "gate-runtime-contract", "status": "OPEN"}
                ],
                "outputFindings": [
                    {"id": "gate-runtime-contract", "status": "RESOLVED"}
                ],
            }
        ],
    }
    draft = SimpleNamespace(
        id="draft-autonomous-loop",
        author_id=1,
        brief="Create a self-contained evidence exercise.",
        constraints={},
        level="L3",
        candidates=[],
        spec=copy.deepcopy(spec),
        validation={},
        status="DRAFT",
    )
    progress = []
    with (
        patch.object(
            authoring,
            "validate_draft",
            side_effect=[blocked_report, passed_report],
        ) as validate,
        patch.object(
            authoring,
            "_repair_until_clear",
            return_value=(
                repaired_spec,
                {
                    "verdict": "PASS",
                    "summary": "The runtime repair is verified.",
                    "findings": [],
                },
                repair_stage,
                {"provider": "MODEL", "model": "deepseek-v4-pro"},
            ),
        ) as repair,
        patch.object(authoring, "_audit", lambda *args, **kwargs: None),
    ):
        report = authoring.autonomously_validate_draft(
            draft,
            progress_callback=lambda **item: progress.append(item),
            max_rounds=3,
        )
    assert report["status"] == "PASS"
    assert report["autonomousLoop"]["completedRounds"] == 2
    assert validate.call_count == 2
    repair.assert_called_once()
    assert draft.status == "VALIDATED"
    assert any(item["stage"] == "validation-repair-1" for item in progress)
    assert any(item["stage"] == "validate-2" for item in progress)


def main():
    from CTFd import create_app

    app = create_app()
    app_context = app.app_context()
    app_context.push()
    from CTFd.plugins.dojo_plugin.learning import (
        assessment,
        authoring,
        context as agent_context,
        intelligence,
        solution_agent,
    )

    assert intelligence.DOJO_AI_TUTOR_MODEL == "deepseek-v4-flash"
    assert authoring.DOJO_AI_AUTHORING_PLAN_MODEL == "deepseek-v4-flash"
    assert authoring.DOJO_AI_AUTHORING_BUILD_MODEL == "deepseek-v4-pro"
    assert authoring.DOJO_AI_AUTHORING_VALIDATE_MODEL == "deepseek-v4-pro"
    try:
        verify_http_contract(intelligence)
        verify_tutor_routing(intelligence)
        verify_guide_routing(intelligence)
        verify_grader_routing(assessment)
        verify_authoring_routing(authoring)
        verify_source_native_authoring(authoring)
        verify_model_validation_gate(authoring)
        verify_review_state_protocol(authoring)
        verify_runtime_contract_gate(authoring)
        verify_public_secret_gate(authoring)
        verify_attempt_version_pin(agent_context)
        verify_container_symlink_inventory(agent_context)
        verify_deterministic_preflight_repair_signal(authoring)
        verify_structural_closure_agent(authoring)
        verify_contract_closure_agent(authoring)
        verify_live_oracle_and_metadata_gate(authoring)
        verify_no_key_fallback_remains_usable(authoring)
        verify_autonomous_authoring_orchestration(authoring)
        verify_solution_agent_contract(solution_agent)
        print("PASS  DeepSeek Guide, Tutor, Grader, and authoring routes are correct")
        print("PASS  model payloads exclude the dynamic verification secret")
        print("PASS  source-backed authoring preserves native runtime and checker semantics")
        print("PASS  model validation warnings and blockers affect the publication gate")
        print("PASS  review OPEN/RESOLVED state cannot produce a contradictory PASS")
        print("PASS  invalid dependencies, environment inputs, and ports fail the runtime gate")
        print("PASS  public artifacts cannot disclose dynamic or protected facts")
        print("PASS  Tutor and Grader context stays pinned to the attempt package version")
        print("PASS  live challenge symlinks are inventoried without following them")
        print("PASS  deterministic runtime failures drive and close preflight repairs")
        print("PASS  structural build failures trigger the bounded Pro closure agent")
        print("PASS  decisive Oracle outcomes trigger the Pro contract closure agent")
        print("PASS  Web Oracle evidence is bound to live original-service responses")
        print("PASS  implementation metadata is synchronized to current artifacts")
        print("PASS  final publication gate rejects weak decisive Oracle outcomes")
        print("PASS  publish reuses only a digest-bound Pro validation attestation")
        print("PASS  self-contradictory model findings cannot override deterministic gates")
        print("PASS  no-key deterministic fallback remains publishable")
        print("PASS  strategy selection and validate-repair-revalidate orchestration are autonomous")
        print("PASS  verified-solution Agent enforces learner identity, command policy, and account-bound flag verification")
    finally:
        app_context.pop()


if __name__ == "__main__":
    main()

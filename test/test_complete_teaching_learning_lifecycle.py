"""Offline contract tests for the full teacher-to-student acceptance verifier.

These tests intentionally do not contact CTFd, Docker, or a model provider.
They protect the verifier's own high-value assertions and request choreography;
the companion ``ops/verify-complete-teaching-learning-lifecycle.py`` performs
the real deployment exercise.
"""

from __future__ import annotations

import importlib.util
import pathlib
import subprocess
import sys
import unittest
from typing import Any
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops" / "verify-complete-teaching-learning-lifecycle.py"


def load_verifier_module():
    spec = importlib.util.spec_from_file_location(
        "test_complete_teaching_learning_lifecycle_script", SCRIPT
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


verifier_module = load_verifier_module()
Lifecycle = verifier_module.CompleteTeachingLearningLifecycle
VerificationError = verifier_module.flow.VerificationError


def slide_page(index: int, layout: str) -> dict[str, Any]:
    return {
        "type": "slide",
        "title": f"第 {index + 1} 页",
        "content": {
            "layout": layout,
            "speakerNotes": "教师讲稿" * 24,
            "elements": [
                {"content": f"可讲授内容 {index} " + "证据链与安全边界。" * 12}
                for _ in range(5)
            ],
        },
    }


def quality_artifacts() -> dict[str, dict[str, Any]]:
    layouts = [
        "cover",
        "checkpoint",
        "concept",
        "comparison",
        "process",
        "case",
        "activity",
        "timeline",
        "code",
        "concept",
        "checkpoint",
        "summary",
    ]
    return {
        "slide-deck": {
            "revision": {
                "content": {
                    "lesson": {
                        "artifacts": [
                            slide_page(index, layout)
                            for index, layout in enumerate(layouts)
                        ]
                    }
                }
            }
        },
        "attack-defense-scene": {
            "revision": {
                "content": {
                    "lesson": {
                        "artifacts": [
                            {
                                "type": "vulnerable-lab",
                                "content": {"html": "<main>lab</main>"},
                            },
                            {
                                "type": "simulation",
                                "content": {"html": "<main>simulation</main>"},
                            },
                        ]
                    }
                }
            }
        },
        "simulation": {
            "revision": {
                "content": {
                    "lesson": {
                        "artifacts": [
                            {
                                "type": "simulation",
                                "content": {
                                    "html": "<main>first scene</main>",
                                    "widgetType": "simulation",
                                },
                            },
                            {
                                "type": "simulation",
                                "content": {
                                    "html": "<main>second scene</main>",
                                    "widgetType": "simulation",
                                },
                            },
                        ]
                    }
                }
            }
        },
    }


def personal_self_check_pages() -> list[dict[str, Any]]:
    return [
        {
            "type": "quiz",
            "content": {
                "questions": [
                    {
                        "type": "single",
                        "question": "应先做什么？",
                        "options": [
                            {"value": "A", "label": "直接改信道"},
                            {"value": "B", "label": "建立基线"},
                        ],
                        "answer": ["B"],
                        "analysis": "先建立可比较的拓扑和频谱基线。",
                    },
                    {
                        "type": "single",
                        "question": "应如何验证假设？",
                        "options": [
                            {"value": "A", "label": "检查客户端证据"},
                            {"value": "B", "label": "忽略日志"},
                        ],
                        "answer": ["A"],
                        "feedback": "把客户端与频谱证据关联起来。",
                    },
                    {
                        "type": "single",
                        "question": "调整后下一步是什么？",
                        "options": [
                            {"value": "A", "label": "复测服务"},
                            {"value": "B", "label": "停止记录"},
                        ],
                        "correctAnswer": "A",
                        "explanation": "用复测确认服务恢复，而不是只根据猜测结论。",
                    },
                ]
            },
        }
    ]


class QualityLifecycle(Lifecycle):
    def __init__(self, artifacts: dict[str, dict[str, Any]]):
        super().__init__()
        self._artifacts_by_type = artifacts

    def _artifact(self, artifact_type: str) -> dict[str, Any]:
        return self._artifacts_by_type[artifact_type]


class FakePersonalLifecycle(Lifecycle):
    def __init__(self):
        super().__init__()
        self.teacher = object()  # type: ignore[assignment]
        self.student = object()  # type: ignore[assignment]
        self.course = {"id": 17, "referenceId": "course~test"}
        self.module = {"index": 3, "id": "module"}
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.waited: list[str] = []
        self.launch_url = (
            "https://dojo.example/agent-runtime/api/integration/exchange"
            "?ticket=opaque-test-ticket"
        )
        self.candidate = {
            "id": "candidate-1",
            "content": {
                "type": "quiz",
                "objectives": ["检查理解"],
                "outline": [{"title": "自检"}],
                "activities": ["回答问题"],
                "assessment": {"kind": "formative"},
                "experience": {"slides": [{"title": "自检"}]},
            },
        }

    def wait_job(self, job_id: str, **_: Any) -> dict[str, Any]:
        self.waited.append(job_id)
        return {"id": job_id, "status": "SUCCEEDED"}

    def api(
        self,
        _client: object,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        **_: Any,
    ) -> dict[str, Any]:
        self.calls.append((method, path, json_body))
        if method == "POST" and path.endswith("/generate"):
            return {"candidateSet": {"id": "set-1"}, "job": {"id": "generate-job"}}
        if method == "GET" and path == "teaching/candidate-sets/set-1":
            return {
                "candidateSet": {
                    "status": "READY",
                    "selfWorkspaceId": "workspace-1",
                    "kind": "quiz",
                    "candidates": [self.candidate],
                }
            }
        if method == "POST" and path == "teaching/candidates/candidate-1/select":
            return {"candidateSet": {"selectedCandidateId": "candidate-1"}}
        if method == "POST" and path == "teaching/candidates/candidate-1/materialize":
            return {"artifact": {"id": "artifact-1"}, "job": {"id": "materialize-job"}}
        if method == "GET" and path == "teaching/artifacts/artifact-1":
            return {
                "artifact": {
                    "id": "artifact-1",
                    "selfWorkspaceId": "workspace-1",
                    "type": "quiz",
                    "status": "READY",
                    "revision": {"content": {"lesson": {"artifacts": []}}},
                }
            }
        if method == "POST" and path == "teaching/runtime/launch":
            return {"launchUrl": self.launch_url}
        raise AssertionError(f"unexpected verifier request: {method} {path}")


class FakeAnalyticsLifecycle(Lifecycle):
    def __init__(self):
        super().__init__()
        self.teacher = object()  # type: ignore[assignment]
        self.course = {"referenceId": "course~test", "name": "验收课程"}
        self.student_name = "验收学生"
        self.prompts: list[str] = []

    def top_level_api(self, *_: Any, **__: Any) -> dict[str, Any]:
        return {
            "summary": {"participants": 1, "attempts": 2, "averageScore": 84},
            "students": [
                {
                    "name": self.student_name,
                    "attempts": 2,
                    "skills": [{"id": f"skill-{index}"} for index in range(6)],
                }
            ],
        }

    def send_agent(self, prompt: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        self.prompts.append(prompt)
        if len(self.prompts) == 1:
            answer = (
                "验收学生已完成当前作业与模拟。客观得分和过程证据表明其在建立基线、"
                "验证假设与服务复测方面表现稳定；六维能力中仍需注意日志关联的风险点。"
                "建议按能力分层安排下一步练习，并先复盘本次证据链，再完成一次参数化查询检查；"
                "教师可在下一次课堂中先展示同频干扰判断的证据，再安排学生独立写下验证理由，"
                "以便确认学习迁移而不是只记住操作顺序。"
            )
        else:
            answer = (
                "验收学生的个体诊断显示：客观完成情况已经达到要求，过程证据也保留了完整操作链。"
                "能力维度中需要继续巩固日志关联与风险识别。建议下一步按30分钟顺序进行基线复盘、"
                "证据比对和一次针对性练习，以便把干预结果再次记录到学习证据中；完成后再让学生"
                "解释为何不能跳过服务复测，从而将反馈转化为可观察的能力提升。"
            )
        return {
            "result": {"answer": answer},
            "modelRoute": {
                "actualModel": "analysis-model",
                "invocationStatus": "SUCCEEDED",
                "degraded": False,
            },
        }, []


class LifecycleVerifierContractTests(unittest.TestCase):
    def test_generation_quality_accepts_full_multi_asset_package(self):
        verifier = QualityLifecycle(quality_artifacts())

        verifier.verify_teacher_generation_volume_and_quality()

        self.assertIn(
            "教师资料驱动生成 12 页可授课课件、双阶段攻防演示和双场景交互模拟",
            verifier.ledger.passed,
        )

    def test_generation_quality_rejects_sparse_or_duplicate_courseware(self):
        artifacts = quality_artifacts()
        pages = artifacts["slide-deck"]["revision"]["content"]["lesson"]["artifacts"]
        pages[1]["title"] = pages[0]["title"]
        verifier = QualityLifecycle(artifacts)

        with self.assertRaises(VerificationError):
            verifier.verify_teacher_generation_volume_and_quality()

    def test_refresh_course_context_replaces_stale_agent_snapshot(self):
        class RefreshLifecycle(Lifecycle):
            def api(self, *_: Any, **__: Any) -> dict[str, Any]:
                return {
                    "teacherDojos": [
                        {
                            "id": 9,
                            "name": "智能体验收课程",
                            "referenceId": "fresh~course",
                            "modules": [{"index": 4, "id": "fresh-module"}],
                        }
                    ]
                }

        verifier = RefreshLifecycle()
        verifier.teacher = object()  # type: ignore[assignment]
        verifier.course = {"id": 9, "name": "旧名称"}
        verifier.module = {"index": 4, "id": "old-module"}

        verifier._refresh_course_context()

        self.assertEqual(verifier.course["name"], "智能体验收课程")
        self.assertEqual(verifier.module["id"], "fresh-module")

    def test_material_chapters_require_distinct_instructional_modules(self):
        chapters = [
            {
                "title": title,
                "objectives": [f"掌握{title}"],
                "description": f"{title} 的教学说明",
            }
            for title in ("输入边界", "参数化查询", "日志复核")
        ]
        modules = [{"name": title} for title in ("输入边界", "参数化查询", "日志复核")]

        Lifecycle._validate_material_chapter_structure(chapters, modules)

        modules[-1]["name"] = "参数化查询"
        with self.assertRaises(VerificationError):
            Lifecycle._validate_material_chapter_structure(chapters, modules)

    def test_personal_artifact_flow_uses_private_generation_select_and_materialize_routes(
        self,
    ):
        verifier = FakePersonalLifecycle()

        candidate_set, candidate, artifact = verifier._generate_personal_artifact(
            "workspace-1",
            artifact_type="quiz",
            prompt="生成三道自检题和即时反馈",
            title="个人自检",
        )

        self.assertEqual(candidate_set["kind"], "quiz")
        self.assertEqual(candidate["id"], "candidate-1")
        self.assertEqual(artifact["id"], "artifact-1")
        self.assertEqual(verifier.waited, ["generate-job", "materialize-job"])
        self.assertEqual(
            [path for _, path, _ in verifier.calls],
            [
                "teaching/self-learning/workspaces/workspace-1/generate",
                "teaching/candidate-sets/set-1",
                "teaching/candidates/candidate-1/select",
                "teaching/candidates/candidate-1/materialize",
                "teaching/artifacts/artifact-1",
            ],
        )

    def test_student_personal_artifact_preview_uses_protected_runtime_launch(self):
        verifier = FakePersonalLifecycle()

        verifier._assert_student_artifact_preview_launch(
            {"id": "artifact-1", "dojoId": 17, "moduleIndex": 3}
        )

        self.assertEqual(
            verifier.calls,
            [
                (
                    "POST",
                    "teaching/runtime/launch",
                    {
                        "role": "student",
                        "dojoId": 17,
                        "moduleIndex": 3,
                        "target": "/prep/artifact-1",
                    },
                )
            ],
        )

    def test_student_personal_artifact_preview_rejects_unprotected_launch_url(self):
        verifier = FakePersonalLifecycle()
        verifier.launch_url = (
            "https://dojo.example/agent-runtime/api/integration/exchange"
        )

        with self.assertRaises(VerificationError):
            verifier._assert_student_artifact_preview_launch(
                {"id": "artifact-1", "dojoId": 17, "moduleIndex": 3}
            )

    def test_personal_self_check_requires_selectable_answers_and_feedback(self):
        questions = Lifecycle._validate_personal_self_check_questions(
            personal_self_check_pages()
        )

        self.assertEqual(len(questions), 3)
        self.assertEqual(
            Lifecycle._personal_self_check_choice_values(personal_self_check_pages()),
            ["B", "A", "A"],
        )

    def test_personal_self_check_rejects_a_noninteractive_question_list(self):
        pages = personal_self_check_pages()
        pages[0]["content"]["questions"][1].pop("options")

        with self.assertRaises(VerificationError):
            Lifecycle._validate_personal_self_check_questions(pages)

    def test_known_open_answer_requires_real_intelligent_grading(self):
        verifier = Lifecycle()
        verifier.automatic_submission = {
            "objectiveScore": 40,
            "aiScore": 20,
            "score": 60,
            "maxScore": 60,
            "itemResults": [
                {"itemId": "objective", "source": "DETERMINISTIC", "score": 40},
                {"itemId": "open", "source": "AI", "score": 20},
            ],
        }

        verifier._verify_intelligent_assignment_grading()

        self.assertIn(
            "学生已知正确开放题由智能体评分，并将正向结果计入作业总分",
            verifier.ledger.passed,
        )
        verifier.automatic_submission["itemResults"][1]["source"] = "FALLBACK"
        with self.assertRaises(VerificationError):
            verifier._verify_intelligent_assignment_grading()

    def test_known_simulation_reflection_requires_model_process_grading(self):
        verifier = Lifecycle()
        criterion_ids = [
            "objective-success",
            "baseline-recon",
            "hypothesis-validation",
            "evidence-and-remediation",
            "debugging-adaptation",
            "safety",
            "independence",
        ]
        reflected = {
            "attempt": {"totalScore": 84},
            "assessment": {
                "id": "assessment-1",
                "criteria": [
                    {
                        "id": criterion_id,
                        "evidence": {
                            "grader": {"provider": "MODEL", "model": "grader-model"}
                        }
                    }
                    for criterion_id in criterion_ids
                ],
            },
        }

        self.assertEqual(
            verifier._verify_intelligent_simulation_assessment(reflected)["id"],
            "assessment-1",
        )
        reflected["assessment"]["criteria"][0]["evidence"]["grader"]["provider"] = (
            "DETERMINISTIC"
        )
        with self.assertRaises(VerificationError):
            verifier._verify_intelligent_simulation_assessment(reflected)

    def test_student_guide_reply_requires_persisted_model_provenance(self):
        result = {
            "provider": "MODEL",
            "model": "guide-model",
            "message": {
                "content": "基于当前学习证据的具体建议。",
                "metadata": {
                    "provider": "MODEL",
                    "model": "guide-model",
                    "contextDigest": "evidence-digest",
                },
            },
        }

        self.assertEqual(
            Lifecycle._verify_model_guide_reply(result, label="student guide")[
                "content"
            ],
            "基于当前学习证据的具体建议。",
        )
        result["provider"] = "DETERMINISTIC"
        with self.assertRaises(VerificationError):
            Lifecycle._verify_model_guide_reply(result, label="student guide")

    def test_teacher_analysis_requires_a_successful_model_job_route(self):
        job = {
            "modelRoute": {
                "actualModel": "analysis-model",
                "invocationStatus": "SUCCEEDED",
                "degraded": False,
            }
        }

        Lifecycle._verify_model_job_route(job, label="teacher analysis")

        job["modelRoute"]["degraded"] = True
        with self.assertRaises(VerificationError):
            Lifecycle._verify_model_job_route(job, label="teacher analysis")

    def test_student_browser_preview_flow_checks_real_ui_contract_scripts(self):
        class FakeDriver:
            instance: "FakeDriver | None" = None

            def __init__(self, port: int):
                self.port = port
                self.navigated: list[str] = []
                self.cookies: list[tuple[str, str]] = []
                self.waits: list[tuple[str, str]] = []
                self.executed: list[str] = []
                self.closed = False
                FakeDriver.instance = self

            def navigate(self, url: str) -> None:
                self.navigated.append(url)

            def add_cookie(self, name: str, value: str) -> None:
                self.cookies.append((name, value))

            def wait_for(self, script: str, *, label: str, **_: Any) -> bool:
                self.waits.append((script, label))
                return True

            def execute(self, script: str) -> bool:
                self.executed.append(script)
                return True

            def close(self) -> None:
                self.closed = True

        verifier = Lifecycle(browser=True)
        verifier.student = type(
            "StudentSession",
            (),
            {"cookies": [type("Cookie", (), {"name": "session", "value": "opaque"})()]},
        )()  # type: ignore[assignment]
        verifier.personal_quiz = {
            "id": "personal-quiz",
            "revision": {
                "content": {"lesson": {"artifacts": personal_self_check_pages()}}
            },
        }
        verifier._artifact = lambda _artifact_type: {"id": "slide-deck"}  # type: ignore[method-assign]

        with mock.patch.object(verifier_module.ui, "ChromeDriver", FakeDriver):
            verifier.run_student_browser_preview_flow()

        driver = FakeDriver.instance
        assert driver is not None
        self.assertEqual(driver.port, 9531)
        self.assertEqual(driver.cookies, [("session", "opaque")])
        self.assertEqual(
            driver.navigated,
            [
                verifier_module.flow.BASE_URL,
                f"{verifier_module.flow.BASE_URL}/learning/artifacts/slide-deck",
                f"{verifier_module.flow.BASE_URL}/learning/artifacts/personal-quiz",
            ],
        )
        self.assertEqual(
            [label for _, label in driver.waits],
            [
                "student courseware preview",
                "student courseware second page",
                "student personal self-check preview",
                "student known-answer self-check feedback page 1",
                "student personal self-check page 2",
                "student known-answer self-check feedback page 2",
                "student personal self-check page 3",
                "student known-answer self-check feedback page 3",
            ],
        )
        self.assertTrue(driver.closed)
        self.assertIn(
            "真实学生浏览器可翻页查看当前课件，并逐页完成三道独立个人自检、分别获得即时反馈",
            verifier.ledger.passed,
        )

        for script in [*driver.executed, *(script for script, _ in driver.waits)]:
            parsed = subprocess.run(
                ["node", "-e", "new Function(process.argv[1]);", script],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(parsed.returncode, 0, parsed.stderr)

    def test_teacher_analytics_requests_overview_and_individual_intervention(self):
        verifier = FakeAnalyticsLifecycle()

        verifier.run_teacher_analytics_flow()

        self.assertEqual(len(verifier.prompts), 2)
        self.assertIn("当前学情", verifier.prompts[0])
        self.assertIn("个体学习诊断", verifier.prompts[1])
        self.assertIn(
            "教师智能体基于同一学生的真实作业、模拟、评分和能力证据完成课程全景与个体干预两类学情分析",
            verifier.ledger.passed,
        )

    def test_run_orders_every_teacher_and_student_acceptance_phase(self):
        class OrderedLifecycle(Lifecycle):
            def __init__(self):
                super().__init__()
                self.phases: list[str] = []

            def cleanup(self) -> None:
                self.phases.append("cleanup")

        phase_methods = [
            "setup",
            "run_course_and_assignment_flow",
            "_refresh_course_context",
            "run_material_flow",
            "verify_teacher_creation_coverage",
            "run_native_challenge_flow",
            "run_generation_flow",
            "run_artifact_and_classroom_flow",
            "run_student_courseware_visibility_flow",
            "run_attack_defense_revision_and_visibility_flow",
            "run_demonstration_revision_and_visibility_flow",
            "run_student_simulation_and_grading_flow",
            "run_student_autonomous_learning_flow",
            "run_student_browser_preview_flow",
            "run_teacher_analytics_flow",
        ]
        for name in phase_methods:
            setattr(
                OrderedLifecycle,
                name,
                lambda self, phase=name: self.phases.append(phase),
            )
        verifier = OrderedLifecycle()

        status = verifier.run()

        self.assertEqual(status, 0)
        self.assertEqual(
            verifier.phases,
            [
                "setup",
                "run_course_and_assignment_flow",
                "_refresh_course_context",
                "run_material_flow",
                "_refresh_course_context",
                "verify_teacher_creation_coverage",
                "run_native_challenge_flow",
                "run_generation_flow",
                "run_artifact_and_classroom_flow",
                "run_student_courseware_visibility_flow",
                "run_attack_defense_revision_and_visibility_flow",
                "run_demonstration_revision_and_visibility_flow",
                "run_student_simulation_and_grading_flow",
                "run_student_autonomous_learning_flow",
                "run_student_browser_preview_flow",
                "run_teacher_analytics_flow",
                "cleanup",
            ],
        )


if __name__ == "__main__":
    unittest.main()

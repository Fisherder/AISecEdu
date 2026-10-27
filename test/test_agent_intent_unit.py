import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location("agent_workbench", Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/workbench.py")
workbench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workbench)


def result(intent, state="confirmed"):
    mode = {"answer": "ask", "plan": "plan", "create": "execute", "revise": "execute"}[intent]
    questions = [{"id": "audience", "text": "学生学过 C 吗？", "choices": ["学过", "没有"]}] if state == "awaiting-input" else []
    return {"answer": "结果", "executionMode": mode,
            "intentDecision": {"version": "teacher-intent-v1", "intent": intent, "executionMode": mode,
                               "clarification": {"state": state, "questions": questions}},
            "questions": questions, "toolProposals": [{"tool": "candidate.generate"}],
            "generationOptions": {"options": [1, 2, 3]}, "deliverables": [{"format": "docx"}]}


class AutomaticIntentTests(unittest.TestCase):
    def test_requests_default_to_automatic_semantic_dispatch(self):
        self.assertEqual(workbench.execution_mode({}), "auto")

    def test_unresolved_intent_cannot_execute(self):
        with self.assertRaises(ValueError):
            workbench.project_mode_result({}, {"toolProposals": [{"tool": "candidate.generate"}]})

    def test_questions_suspend_all_dependent_actions(self):
        projected = workbench.project_mode_result({}, result("create", "awaiting-input"))
        self.assertEqual(projected["toolProposals"], [])
        self.assertEqual(projected["deliverables"], [])
        self.assertIsNone(projected["generationOptions"])
        self.assertEqual(projected["interaction"]["state"], "awaiting-input")
        with self.assertRaises(ValueError):
            workbench.require_execution_mode(projected)

    def test_answer_and_planning_remain_read_only_after_model_resolution(self):
        for intent in ("answer", "plan"):
            projected = workbench.project_mode_result({}, result(intent))
            self.assertEqual(projected["toolProposals"], [])
            self.assertEqual(projected["deliverables"], [])
            with self.assertRaises(ValueError):
                workbench.require_execution_mode(projected)

    def test_confirmed_creation_can_continue_without_a_manual_mode(self):
        projected = workbench.project_mode_result({}, result("create"))
        workbench.require_execution_mode(projected)
        self.assertEqual(projected["toolProposals"][0]["tool"], "candidate.generate")

    def test_mismatched_mode_is_not_permission(self):
        unsafe = result("answer")
        unsafe["executionMode"] = "execute"
        with self.assertRaises(ValueError):
            workbench.project_mode_result({}, unsafe)

    def test_creation_cannot_skip_requirement_confirmation(self):
        with self.assertRaises(ValueError):
            workbench.project_mode_result({}, result("create", "not-required"))

    def test_natural_selection_must_reference_the_confirmed_server_option(self):
        decision = result("create")["intentDecision"]
        decision["sourceRefs"] = ["option:15:option-2"]
        self.assertTrue(workbench.generation_selection_authorized(decision, {"sourceMessageId": 15, "optionId": "option-2"}))
        self.assertFalse(workbench.generation_selection_authorized(decision, {"sourceMessageId": 16, "optionId": "option-2"}))
        decision["clarification"]["state"] = "awaiting-input"
        self.assertFalse(workbench.generation_selection_authorized(decision, {"sourceMessageId": 15, "optionId": "option-2"}))


if __name__ == "__main__":
    unittest.main()

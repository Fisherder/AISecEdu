import ast
import datetime
import importlib
import json
import re
import sys
from copy import copy
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock

import pytest


PLUGIN = Path(__file__).resolve().parents[1] / "dojo_plugin"
ENDPOINT = "https://grading.school.invalid"
TOKEN = "synthetic-grading-secret"


@pytest.fixture
def scoring(monkeypatch):
    for namespace, path in {
        "scoring_fixture": PLUGIN,
        "scoring_fixture.learning": PLUGIN / "learning",
        "scoring_fixture.agent_runtime": PLUGIN / "agent_runtime",
    }.items():
        package = ModuleType(namespace)
        package.__path__ = [str(path)]
        monkeypatch.setitem(sys.modules, namespace, package)

    monkeypatch.setenv("DOJO_AI_ENABLED", "auto")
    monkeypatch.setenv("HARNESS_INTERNAL_URL", "http://shared-harness.invalid:3081")
    monkeypatch.setenv("HARNESS_SERVICE_SECRET", "synthetic-shared-secret")
    monkeypatch.setenv("DOJO_AI_BASE_URL", "https://shared-provider.invalid")
    monkeypatch.setenv("DOJO_AI_API_KEY", "synthetic-shared-provider-key")

    turn = importlib.import_module("scoring_fixture.agent_runtime.upstream_turn")
    grading = importlib.import_module("scoring_fixture.learning.grading")
    private = importlib.import_module("scoring_fixture.learning.private_grading")

    solves = MagicMock()
    solves.query.filter.return_value.all.return_value = []
    entry = {
        "utcnow": datetime.datetime.now, "re": re, "Solves": solves,
        "DOJO_ORDINARY_GRADING_MODE": "private-harness",
        "DOJO_ORDINARY_GRADING_COURSE_IDS": "",
        "selected_private_grading_assignment": private.selected_private_grading_assignment,
        "DOJO_ORDINARY_GRADING_HARNESS_URL": ENDPOINT,
        "DOJO_ORDINARY_GRADING_HARNESS_TOKEN": TOKEN,
        "ordinary_grading_connection": turn.ordinary_grading_connection,
        "grade_with_private_harness": private.grade_with_private_harness,
        "build_open_grade_questions": MagicMock(),
        "map_open_grade_rows": grading.map_open_grade_rows,
        "DOJO_AI_GRADER_MODEL": "synthetic-legacy-grader",
        "model_json": MagicMock(),
    }
    file = PLUGIN / "coursework.py"
    names = {"grade_submission", "_ai_open_grades", "_normalize_answer", "_fallback_open_grade"}
    tree = ast.parse(file.read_text())
    tree.body = [node for node in tree.body if getattr(node, "name", None) in names]
    exec(compile(tree, str(file), "exec"), entry)
    try:
        yield entry, turn, private
    finally:
        for name in (turn.__name__, grading.__name__, private.__name__, "scoring_fixture.coursework_ordinary"):
            sys.modules.pop(name, None)


def submission_fixture():
    item = SimpleNamespace(
        id="synthetic-persisted-item-id", title="植物观察", prompt="叶片是什么形状？",
        points=10, item_type="SHORT_ANSWER", challenge_id=None, artifact_id=None,
        config={"keywords": ["椭圆", "叶尖"], "referenceAnswer": "椭圆，有叶尖。",
                "rubric": "依据形状和叶尖评分。", "staffNote": "fixture staff-only metadata"},
    )
    return SimpleNamespace(
        student_id=7531,
        assignment=SimpleNamespace(id="synthetic-assignment-id", dojo_id=-25, kind="HOMEWORK", items=[item], settings={}),
        answers={item.id: "椭圆形。"},
    )


@pytest.mark.parametrize("mode", ["local", "unrecognized", " "])
def test_local_route_skips_model_and_payload_construction(scoring, monkeypatch, mode):
    entry, turn, private = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = mode
    body = MagicMock()
    question_builder = MagicMock()
    monkeypatch.setattr(turn, "request_body", body)
    monkeypatch.setattr(private, "build_open_grade_questions", question_builder)

    submission = entry["grade_submission"](submission_fixture())
    assert submission.total_score == 6.75
    assert submission.item_results[0]["source"] == "FALLBACK"
    assert submission.item_results[0]["needsReview"] is True
    for operation in (entry["model_json"], entry["build_open_grade_questions"], question_builder, body):
        operation.assert_not_called()


@pytest.mark.parametrize(("url", "token"), [
    ("", TOKEN),
    (ENDPOINT, ""),
    (ENDPOINT, "bad token"),
    ("http://grading.school.invalid", TOKEN),
    ("https://deepseek-harness.", TOKEN),
    ("https://SHARED-HARNESS.INVALID.:8443", TOKEN),
    ("https://shared-provider.invalid", TOKEN),
    ("https://api.deepseek.com", TOKEN),
    ("https://someone@grading.school.invalid", TOKEN),
    (ENDPOINT + "/extra", TOKEN),
    (ENDPOINT + "/?secret=1", TOKEN),
    (ENDPOINT + "/#", TOKEN),
    (ENDPOINT, "synthetic-shared-secret"),
    (ENDPOINT, "synthetic-shared-provider-key"),
])
def test_misconfigured_private_route_never_dispatches(scoring, monkeypatch, url, token):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_HARNESS_URL"] = url
    entry["DOJO_ORDINARY_GRADING_HARNESS_TOKEN"] = token
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)

    submission = entry["grade_submission"](submission_fixture())
    assert submission.item_results[0]["needsReview"] is True
    entry["model_json"].assert_not_called()
    session.assert_not_called()


def test_explicit_model_disable_prevents_private_dispatch(scoring, monkeypatch):
    entry, turn, _ = scoring
    monkeypatch.setenv("DOJO_AI_ENABLED", "false")
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)

    submission = entry["grade_submission"](submission_fixture())
    assert submission.item_results[0]["needsReview"] is True
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("model_output", [
    "not JSON",
    '{"grades":[]}',
    '{"grades":[{"itemId":"synthetic-persisted-item-id","score":8}]}',
    '{"grades":[{"itemIndex":2,"score":8}]}',
])
def test_invalid_private_grades_go_to_local_review(scoring, monkeypatch, model_output):
    entry, _, private = scoring
    monkeypatch.setattr(private, "invoke_ordinary_grading_turn", MagicMock(
        return_value={"text": model_output, "model": "fixture", "usage": {}},
    ))
    submission = entry["grade_submission"](submission_fixture())
    assert submission.item_results[0]["source"] == "FALLBACK"
    assert submission.item_results[0]["needsReview"] is True
    assert submission.grading["agent"] == {}
    entry["model_json"].assert_not_called()


@pytest.mark.parametrize("extra_rows", [
    [],
    [{"itemIndex": 1, "score": 2}, {"itemIndex": 1, "score": 9}],
    [{"itemIndex": 1, "score": 9}, {"itemIndex": 1, "score": 2}],
    [{"itemIndex": 1, "score": None}, {"itemIndex": 1, "score": 9}],
])
def test_private_grading_preserves_independently_matched_questions(scoring, monkeypatch, extra_rows):
    entry, _, private = scoring
    submission = submission_fixture()
    first = submission.assignment.items[0]
    second = copy(first)
    second.id = "second-synthetic-item"
    submission.assignment.items.append(second)
    submission.answers[second.id] = "椭圆形。"
    rows = [{"itemIndex": 2, "score": 4}, *extra_rows]
    service = MagicMock(return_value={"text": json.dumps({"grades": rows}),
                                      "model": "fixture", "usage": {"total_tokens": 8}})
    monkeypatch.setattr(private, "invoke_ordinary_grading_turn", service)
    entry["grade_submission"](submission)
    assert [(row["score"], row["source"], row["needsReview"]) for row in submission.item_results] == [
        (6.75, "FALLBACK", True), (4, "AI", False),
    ]
    assert submission.grading["agent"]["usage"] == {"total_tokens": 8}
    service.assert_called_once()
    entry["model_json"].assert_not_called()


@pytest.mark.parametrize("status", [200, 307, 503])
def test_private_transport_scopes_credentials_and_payload(scoring, monkeypatch, status):
    entry, turn, _ = scoring
    session = MagicMock()
    session.__enter__.return_value = session
    response = session.post.return_value.__enter__.return_value
    response.status_code = status
    response.headers = {"Location": "https://redirect.invalid/v1/turn"}
    response.json.return_value = {
        "model": "school-fixture-model",
        "text": json.dumps({"grades": [{
            "itemIndex": 1, "itemId": "model-supplied-untrusted-id", "score": 8,
            "feedback": "形状正确。", "confidence": 1,
        }]}),
        "usage": {"total_tokens": 55},
    }
    monkeypatch.setattr(turn.requests, "Session", lambda: session)
    shared_post = MagicMock()
    monkeypatch.setattr(turn.requests, "post", shared_post)

    submission = entry["grade_submission"](submission_fixture())
    assert session.trust_env is False
    session.post.assert_called_once()
    assert session.post.call_args.args == (ENDPOINT + "/v1/turn",)
    request = session.post.call_args.kwargs
    assert request["allow_redirects"] is False
    assert request["headers"]["Authorization"] == "Bearer " + TOKEN
    body = json.loads(request["data"])
    assert set(body) == {"messages"}
    context = json.loads(body["messages"][1]["content"])
    assert context == {"questions": [{
        "itemIndex": 1, "question": "叶片是什么形状？", "answer": "椭圆形。",
        "points": 10.0, "keywords": ["椭圆", "叶尖"], "referenceAnswer": "椭圆，有叶尖。",
        "rubric": "依据形状和叶尖评分。",
    }]}
    assert "itemId" not in body["messages"][0]["content"]
    entry["model_json"].assert_not_called()
    shared_post.assert_not_called()

    row = submission.item_results[0]
    assert row["itemId"] == "synthetic-persisted-item-id"
    if status == 200:
        assert (row["score"], row["source"], row["needsReview"]) == (8, "AI", False)
        assert submission.grading["agent"] == {
            "provider": "PRIVATE_HARNESS", "model": "school-fixture-model", "usage": {"total_tokens": 55},
        }
    else:
        assert (row["score"], row["source"], row["needsReview"]) == (6.75, "FALLBACK", True)
        assert submission.grading["agent"] == {}


@pytest.mark.parametrize("course_ids", ["", " ", "-25,", "-25, bad", "-25, 2147483648", "-2147483649,-25", "1,2"])
def test_selected_mode_rejects_entire_invalid_list_or_other_course(scoring, monkeypatch, course_ids):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = course_ids
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)

    submission = entry["grade_submission"](submission_fixture())

    assert submission.item_results[0]["source"] == "FALLBACK"
    assert submission.item_results[0]["needsReview"]
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("linked", [
    {"item_type": "CHALLENGE"},
    {"challenge_id": 8},
    {"item_type": "ARTIFACT"},
    {"artifact_id": "fixture-artifact"},
    {"config": {"libraryPracticeDraftId": "fixture-draft"}},
    {"config": {"libraryArtifactDependency": "fixture-dependency"}},
])
def test_selected_mode_checks_every_saved_item_not_just_graded_items(scoring, monkeypatch, linked):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = "-25"
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)
    submission = submission_fixture()
    attached = copy(submission.assignment.items[0])
    attached.id = "unanswered-linked-item"
    vars(attached).update(linked)
    submission.assignment.items.append(attached)

    entry["grade_submission"](submission)

    assert submission.item_results[0]["source"] == "FALLBACK"
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("kind", ["PRACTICE", "LAB", "DEBATE"])
def test_selected_mode_does_not_route_special_assignment_kinds(scoring, monkeypatch, kind):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = "-25"
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)
    submission = submission_fixture()
    submission.assignment.kind = kind

    entry["grade_submission"](submission)

    assert submission.item_results[0]["source"] == "FALLBACK"
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("settings", [
    {"librarySource": {"kind": "assignment", "id": "fixture-library-source"}},
    {"sourceRefs": [{"type": "material", "id": "fixture-material"}]},
    {"generation": {"source": "fixture-specialized-generator"}},
    {"generation": {"model": "fixture-legacy-generator"}},
    {"generation": {"source": "official-dsh-text-turn"}},
    {"generation": {}},
    {"generation": []},
    {"generation": ""},
    {"generation": None},
    [],
    "",
    None,
])
def test_selected_mode_rejects_saved_nonordinary_sources(scoring, monkeypatch, settings):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = "-25"
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)
    submission = submission_fixture()
    submission.assignment.settings = settings

    entry["grade_submission"](submission)

    assert (submission.item_results[0]["source"], submission.item_results[0]["needsReview"]) == ("FALLBACK", True)
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("config", [[], "", "invalid config", None])
def test_selected_mode_locally_grades_invalid_item_config(scoring, monkeypatch, config):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = "-25"
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)
    submission = submission_fixture()
    submission.assignment.items[0].config = config

    entry["grade_submission"](submission)

    assert (submission.item_results[0]["source"], submission.item_results[0]["needsReview"]) == ("FALLBACK", True)
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("config", [
    {"referenceAnswer": {"private": "synthetic nested metadata"}},
    {"rubric": ["private metadata"]},
    {"keywords": {"private": "synthetic nested metadata"}},
    {"keywords": [{"private": "synthetic nested metadata"}]},
    {"keywords": ["x" * 241]},
    {"keywords": ["x"] * 31},
])
def test_selected_mode_does_not_disclose_malformed_rubric_fields(scoring, monkeypatch, config):
    entry, turn, _ = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = "-25"
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)
    submission = submission_fixture()
    submission.assignment.items[0].config.update(config)

    entry["grade_submission"](submission)

    assert (submission.item_results[0]["source"], submission.item_results[0]["needsReview"]) == ("FALLBACK", True)
    entry["model_json"].assert_not_called()
    session.assert_not_called()


def test_generated_assignment_proof_is_bound_to_saved_assignment(scoring, monkeypatch):
    entry, turn, private = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = "-25"
    session = MagicMock()
    monkeypatch.setattr(turn.requests, "Session", session)
    monkeypatch.setattr(private, "current_app", SimpleNamespace(secret_key="synthetic-platform-secret"))
    submission = submission_fixture()
    assignment = submission.assignment
    assignment.settings = {
        "generation": {"source": "official-dsh-text-turn"},
        private.ORDINARY_GRADING_PROOF: private.ordinary_assignment_grading_proof(assignment),
    }
    assignment.id = "different-saved-assignment-id"

    entry["grade_submission"](submission)

    assert (submission.item_results[0]["source"], submission.item_results[0]["needsReview"]) == ("FALLBACK", True)
    entry["model_json"].assert_not_called()
    session.assert_not_called()


@pytest.mark.parametrize("kind", ["HOMEWORK", "QUIZ"])
@pytest.mark.parametrize("source", [None, "official-dsh-text-turn"])
def test_selected_mode_uses_private_transport_for_admitted_course(scoring, monkeypatch, kind, source):
    entry, _, private = scoring
    entry["DOJO_ORDINARY_GRADING_MODE"] = "private-harness-selected"
    entry["DOJO_ORDINARY_GRADING_COURSE_IDS"] = " -2147483648, -25, 2147483647 "
    submission = submission_fixture()
    submission.assignment.kind = kind
    if source:
        monkeypatch.setattr(private, "current_app", SimpleNamespace(secret_key="synthetic-platform-secret"))
        submission.assignment.settings = {
            "generation": {"source": source},
            private.ORDINARY_GRADING_PROOF: private.ordinary_assignment_grading_proof(submission.assignment),
        }
    service = MagicMock(return_value={
        "text": '{"grades":[{"itemIndex":1,"score":8}]}', "model": "fixture", "usage": {"total_tokens": 8},
    })
    monkeypatch.setattr(private, "invoke_ordinary_grading_turn", service)

    entry["grade_submission"](submission)

    assert submission.item_results[0]["source"] == "AI"
    assert submission.total_score == 8
    assert submission.grading["agent"]["usage"] == {"total_tokens": 8}
    assert service.call_args.args[0].startswith("你是普通课程的作业批改教师。")
    assert service.call_args.kwargs == {"connection": (ENDPOINT, TOKEN)}
    entry["model_json"].assert_not_called()

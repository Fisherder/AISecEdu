import importlib.util
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest


MODULE = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/upstream_turn.py"
SPEC = importlib.util.spec_from_file_location("upstream_turn_fixture", MODULE)
turn = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(turn)


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("HARNESS_INTERNAL_URL", "http://harness.test/")
    monkeypatch.setenv("HARNESS_SERVICE_SECRET", "synthetic-test-token")
    response = MagicMock()
    response.__enter__.return_value = response
    response.status_code = 200
    post = MagicMock(return_value=response)
    monkeypatch.setattr(turn.requests, "post", post)
    return post, response


def test_turn_sends_only_messages_and_returns_measured_usage(service):
    post, response = service
    response.json.return_value = {
        "text": "  教学答复  ",
        "model": "test-model",
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
    assert turn.invoke_turn(body, encoded=encoded) == {
        "text": "教学答复",
        "model": "test-model",
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }
    assert post.call_args.args == ("http://harness.test/v1/turn",)
    assert post.call_args.kwargs["data"] == encoded
    assert post.call_args.kwargs["allow_redirects"] is False
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer synthetic-test-token"


@pytest.mark.parametrize("status", [307, 401, 503])
def test_turn_rejects_http_failure_without_exposing_the_error_body(service, status):
    post, response = service
    response.status_code = status
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    with pytest.raises(turn.UpstreamTurnError, match=f"HTTP {status}"):
        turn.invoke_turn(body)
    response.json.assert_not_called()
    post.assert_called_once()


def test_turn_rejects_success_without_actual_model(service):
    _, response = service
    response.json.return_value = {"text": "教学答复"}
    body = turn.request_body("教学顾问", {"request": "解释学习目标"})
    with pytest.raises(turn.UpstreamTurnError, match="未返回完整答复"):
        turn.invoke_turn(body)

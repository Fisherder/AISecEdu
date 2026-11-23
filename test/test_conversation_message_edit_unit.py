import ast
import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest


def message_fold():
    path = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/session_events.py"
    function = next(node for node in ast.parse(path.read_text()).body
                    if getattr(node, "name", None) == "fold_session_message_events")
    scope = {"datetime": datetime, "SimpleNamespace": SimpleNamespace}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(path), "exec"), scope)
    return scope["fold_session_message_events"]


def message(number, body):
    return SimpleNamespace(event_type="message.created", payload={
        "messageId": number, "role": "user", "content": body, "created": "2026-11-23T11:00:00Z",
    })


def test_event_replay_keeps_prefix_and_replaces_discarded_turns():
    before = [message(1, "保留"), message(5, "原要求"), message(6, "旧追问")]
    rewind = SimpleNamespace(event_type="conversation.rewound", payload={"fromMessageId": 5})
    after = message_fold()([*before, rewind, message(12, "编辑后的要求")])
    assert [(row.id, row.content) for row in after] == [(1, "保留"), (12, "编辑后的要求")]


def test_event_replay_does_not_accept_an_invalid_rewind_boundary():
    rewind = SimpleNamespace(event_type="conversation.rewound", payload={"fromMessageId": True})
    with pytest.raises(ValueError, match="Invalid conversation rewind"):
        message_fold()([message(1, "已有会话"), rewind])

"""Exercise the frozen teacher request and its ordinary chat worker dispatch."""

import ast
import hashlib
import json
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from test_ordinary_lesson_plan_unit import source
from test_upstream_teaching_turn_unit import turn


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def flow():
    ns = {"re": re, "hashlib": hashlib, "json": json}
    for name in ("evidence", "tutor_context", "guide_model_context"):
        path = ROOT / "dojo_plugin/learning" / f"{name}.py"
        nodes = [node for node in ast.parse(path.read_text()).body if not isinstance(node, (ast.Import, ast.ImportFrom))]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), ns)
    source("materials", ns, functions={"MaterialContextError"})
    source("teacher_documents", ns)
    source("classroom_requests", ns)
    refs = [
        {"type": "material", "id": "private-ref-1", "revisionId": "r1", "sha256": "1" * 64},
        {"type": "material", "id": "private-ref-2", "revisionId": "r2", "sha256": "2" * 64},
    ]
    state = SimpleNamespace(
        course=19, owner=7, allow=True, refs=refs,
        excerpts=["温水蒸发快，记录碟中水量。", "冷水蒸发慢，联系 sample@example.test。"],
    )

    def build_context(*, owner_id, dojo_id, source_refs, require_complete, excerpt_budget):
        assert require_complete and excerpt_budget == 4000
        assert source_refs == [{"type": "material", "id": ref["id"]} for ref in refs]
        if not state.allow or (owner_id, dojo_id) != (state.owner, state.course):
            raise ns["MaterialContextError"]("material unavailable")
        return {
            "sourceRefs": [dict(ref) for ref in state.refs],
            "sourceMaterials": [
                {**ref, "title": "internal-title", "analysis": {"staff": "internal-only"}, "excerpts": [{"content": excerpt}]}
                for ref, excerpt in zip(state.refs, state.excerpts)
            ],
        }

    ns.update(
        config=SimpleNamespace(HARNESS_DEEPSEEK_MODEL="test-model"),
        build_course_material_context=build_context,
        ordinary_teaching_course=lambda id: id == 19,
        upstream_enabled=lambda: True,
    )
    source("ordinary_material_turn", ns)
    question = "比较两份讲义中的蒸发现象。"
    pin = ns["admit"](7, 19, refs, question)
    payload = {
        "chatBackend": "upstream", "executionMode": "ask", "prompt": question,
        "sourceRefs": pin["refs"], "ordinaryMaterialQuestion": pin,
        "context": {"platformFacts": {"staff": "private-user"}, "conversation": ["history-private"]},
    }
    job = SimpleNamespace(kind="agent.chat", owner_id=7, dojo_id=19, payload=payload)
    usage = {"prompt_tokens": 15, "completion_tokens": 8, "total_tokens": 23}
    jobs = {
        "ordinary_material_turn": SimpleNamespace(**ns), "hashlib": hashlib, "json": json,
        "_require_upstream_teacher_scope": MagicMock(), "_record_runtime_dispatch": MagicMock(),
        "PermanentJobError": type("PermanentJobError", (ValueError,), {}),
        "UpstreamTurnError": turn.UpstreamTurnError, "redact_text": ns["redact_text"],
        "invoke_teaching_material_turn": MagicMock(return_value={
            "text": "可比较两组相同时间内的剩余水量。", "model": "test-model", "usage": usage, "materialReads": [2, 1],
        }),
        "invoke_turn": MagicMock(return_value={"text": '{"answer":"旧任务问答"}', "model": "test-model", "usage": {}}),
        "_require_teacher_document_sources": MagicMock(),
        "requested_document_formats": lambda _: (),
        "upstream_enabled": lambda: True, "result_object": turn.result_object,
        "_runtime_request_body": lambda *_: turn.request_body("old", {}),
    }
    source("reliability", jobs, functions={"RuntimeJobError"})
    source("jobs", jobs, functions={
        "_invoke_agent_runtime", "_invoke_ordinary_material_question", "_require_ordinary_material_question",
        "_upstream_teacher_result", "_runtime_json_bytes",
    })
    return ns, jobs, state, job, {"required_model": "test-model"}, usage


def test_pinned_teacher_turn_dispatches_only_the_current_question_and_anonymous_excerpts(flow):
    ns, jobs, state, job, route, usage = flow
    outcome = jobs["_invoke_agent_runtime"](job, route, job.payload)
    assert outcome == {
        "success": True,
        "result": {"answer": "可比较两组相同时间内的剩余水量。", "executionMode": "ask", "materialReads": [2, 1]},
        "model": {"actualModel": "test-model", "usage": usage},
    }
    call = jobs["invoke_teaching_material_turn"].call_args
    assert call.args == ({
        "messages": [{"role": "user", "content": job.payload["prompt"]}],
        "materials": [{"text": state.excerpts[0]}, {"text": "冷水蒸发慢，联系 [隐去联系或身份信息]。"}],
    },)
    assert json.loads(call.kwargs["encoded"]) == call.args[0]
    descriptor_call = jobs["_record_runtime_dispatch"].call_args
    assert descriptor_call.args[1] == ns["dispatch_descriptor"](job.payload)
    assert descriptor_call.kwargs["wire_digest"] == hashlib.sha256(call.kwargs["encoded"]).hexdigest()
    for fragment in ("温水蒸发快", "internal-title", "internal-only", "private-ref-1", "private-user", "history-private"):
        assert fragment not in json.dumps(job.payload["ordinaryMaterialQuestion"], ensure_ascii=False) or fragment == "private-ref-1"
        assert fragment not in json.dumps(descriptor_call.args[1], ensure_ascii=False)
    jobs["invoke_turn"].assert_not_called()


@pytest.mark.parametrize("change", ["course", "teacher", "archived", "new-revision", "changed-excerpt", "operation", "invalid-pin"])
def test_revoked_or_edited_turn_never_dispatches_or_falls_back(flow, change):
    _, jobs, state, job, route, _ = flow
    if change == "course":
        state.course = 20
    elif change == "teacher":
        jobs["_require_upstream_teacher_scope"].side_effect = jobs["PermanentJobError"]("教师权限被撤销")
    elif change == "archived":
        state.allow = False
    elif change == "new-revision":
        state.refs[0]["revisionId"] = "r3"
    elif change == "changed-excerpt":
        state.excerpts[0] = "变更后未确认的摘录。"
    elif change == "operation":
        job.payload["prompt"] = "调用终端。"
    else:
        job.payload["ordinaryMaterialQuestion"] = {}
    with pytest.raises(jobs["PermanentJobError"]):
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    jobs["_record_runtime_dispatch"].assert_not_called()
    jobs["invoke_teaching_material_turn"].assert_not_called()
    jobs["invoke_turn"].assert_not_called()


@pytest.mark.parametrize("text", [
    "私有答案：不应发送", "学号：123456",
    "password: not-a-real-password", "请执行命令。", "请分析终端日志。", "搭建靶场", "<script>sample</script>",
])
def test_private_or_execution_text_cannot_be_admitted_from_a_question_or_material(flow, text):
    ns, _, state, _, _, _ = flow
    with pytest.raises(ValueError):
        ns["admit"](7, 19, state.refs, text)
    state.excerpts[0] = text
    with pytest.raises(ValueError):
        ns["admit"](7, 19, state.refs, "比较两份资料。")


def test_historical_teacher_ask_preserves_its_original_backend(flow):
    _, jobs, _, job, route, _ = flow
    job.payload.pop("ordinaryMaterialQuestion")
    result = jobs["_invoke_agent_runtime"](job, route, job.payload)
    assert result["result"]["answer"] == "旧任务问答"
    jobs["invoke_turn"].assert_called_once()
    jobs["invoke_teaching_material_turn"].assert_not_called()


def test_failed_material_call_preserves_measured_usage_without_a_reply(flow):
    _, jobs, _, job, route, usage = flow
    jobs["invoke_teaching_material_turn"].side_effect = turn.UpstreamTurnError(
        "材料服务未完成", model="test-model", usage=usage,
    )
    with pytest.raises(jobs["RuntimeJobError"]) as failure:
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    assert failure.value.model_meta == {"actualModel": "test-model", "usage": usage}
    jobs["invoke_turn"].assert_not_called()


def test_material_resolver_checks_real_course_ownership_and_latest_revision(flow):
    from sqlalchemy import Column, Integer, JSON, String, create_engine, or_
    from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker

    namespace, jobs, _, job, route, _ = flow
    base = declarative_base()

    class Material(base):
        __tablename__ = "materials"
        id = Column(String, primary_key=True)
        dojo_id = Column(Integer)
        owner_id = Column(Integer)
        created = Column(Integer, default=1)
        status = Column(String, default="READY")
        title = Column(String, default="内部资料")
        filename = Column(String, default="history.txt")

    class Revision(base):
        __tablename__ = "revisions"
        id = Column(String, primary_key=True)
        revision = Column(Integer)
        sha256 = Column(String)
        material_id = Column(String)
        status = Column(String, default="READY")
        metadata_json = Column(JSON, default=lambda: {"analysis": {"summary": "蒸发观察"}})

    class Chunk(base):
        __tablename__ = "chunks"
        id = Column(Integer, primary_key=True)
        revision_id = Column(String)
        ordinal = Column(Integer, default=1)
        content = Column(String, default="蒸发速度可以通过剩余水量比较。")
        source_locator = Column(JSON)

    engine = create_engine("sqlite://")
    base.metadata.create_all(engine)
    session = scoped_session(sessionmaker(bind=engine))
    base.query = session.query_property()
    namespace.update(
        or_=or_, TeachingMaterials=Material, TeachingMaterialRevisions=Revision,
        TeachingMaterialChunks=Chunk,
    )
    source("materials", namespace)
    local = Material(id="current", dojo_id=19, owner_id=7)
    session.add_all([
        local, Material(id="other-course", dojo_id=20, owner_id=7),
        Material(id="other-owner", dojo_id=19, owner_id=8),
        Revision(id="current-v1", material_id="current", revision=1, sha256="a" * 64),
        Chunk(revision_id="current-v1"),
    ])
    session.commit()
    q = job.payload["prompt"]
    for rejected in ("other-course", "other-owner"):
        with pytest.raises(namespace["MaterialContextError"]):
            namespace["admit"](7, 19, [{"type": "material", "id": rejected}], q)

    pin = namespace["admit"](7, 19, [{"type": "material", "id": "current"}], q)
    job.payload.update(ordinaryMaterialQuestion=pin, sourceRefs=pin["refs"])
    jobs["invoke_teaching_material_turn"].return_value["materialReads"] = [1]
    assert jobs["_invoke_agent_runtime"](job, route, job.payload)["success"] is True
    jobs["invoke_teaching_material_turn"].reset_mock()

    # The old revision remains accessible in storage, but a newer current revision invalidates the pin.
    session.add_all([
        Revision(id="current-v2", material_id="current", revision=2, sha256="b" * 64),
        Chunk(revision_id="current-v2"),
    ])
    session.commit()
    with pytest.raises(jobs["PermanentJobError"], match="版本"):
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    jobs["invoke_teaching_material_turn"].assert_not_called()
    session.remove()
    engine.dispose()


@pytest.mark.parametrize("edits", [
    {"executionMode": "auto"}, {"materialQuestion": 1}, {"sourceRefs": []},
    {"learningPattern": "process-inquiry"}, {"agentContinuation": True},
    {"action": "generate"}, {"generationSelection": {"optionId": "x"}},
    {"questionReply": {}}, {"planSourceMessageId": 2}, {"candidateMode": "single"},
    {"content": "请结合材料生成一份 DOCX 教案。"}, {"content": "请用《植物观察》准备课堂。"},
])
def test_explicit_material_request_cannot_fall_back_to_another_mode(flow, edits):
    namespace, _, _, _, _, _ = flow
    body = {
        "materialQuestion": True, "executionMode": "ask", "content": "说明蒸发现象。",
        "sourceRefs": [{"type": "material", "id": "local"}], **edits,
    }
    with pytest.raises(ValueError, match="普通资料问答"):
        namespace["requested"](body)


def test_material_marker_changes_idempotency_but_old_clients_remain_unmarked(flow):
    namespace, _, _, _, _, _ = flow
    source("conversation", namespace, functions={"submission_fingerprint"})
    unmarked = {
        "executionMode": "ask", "content": "说明蒸发现象。",
        "sourceRefs": [{"type": "material", "id": "local"}],
    }
    explicit = {**unmarked, "materialQuestion": True}
    assert namespace["requested"](unmarked) is False
    assert namespace["requested"](explicit) is True
    fingerprint = namespace["submission_fingerprint"]
    assert fingerprint(unmarked) != fingerprint(explicit)


def test_unsafe_model_answer_is_never_saved_but_measured_usage_is_preserved(flow):
    _, jobs, _, job, route, usage = flow
    jobs["invoke_teaching_material_turn"].return_value = {
        "text": "私有答案：不应保存。", "model": "test-model", "usage": usage, "materialReads": [1],
    }
    with pytest.raises(jobs["PermanentJobError"], match="答复未通过") as failure:
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    assert failure.value.model_meta == {"actualModel": "test-model", "usage": usage}
    jobs["invoke_turn"].assert_not_called()


def test_teacher_submission_rejects_unavailable_course_and_enqueues_minimal_input(flow, monkeypatch):
    import datetime
    import sys

    namespace, _, state, _, _, _ = flow
    pkg = "readonly_fixture"
    worker_mode = {}
    source("workbench", worker_mode)
    monkeypatch.setitem(sys.modules, pkg + ".agent_runtime.workbench", SimpleNamespace(**worker_mode))
    thread = SimpleNamespace(id="thread", status="ACTIVE", dojo_id=18, module_index=0, title="科学观察")
    scope_error = type("ScopeError", (ValueError,), {})
    db = MagicMock()
    threads = MagicMock()
    threads.query.filter_by.return_value.with_for_update.return_value.populate_existing.return_value.one.return_value = thread
    enqueue = MagicMock(side_effect=lambda **kw: (SimpleNamespace(id="job", status="QUEUED", kind=kw["kind"], payload=kw["payload"]), True))
    route = {
        "__package__": pkg + ".api.v1", "db": db, "datetime": datetime,
        "ordinary_material_turn": SimpleNamespace(**namespace),
        "_require_teacher": MagicMock(), "_thread_for_owner": lambda *_: thread,
        "TeachingAgentThreads": threads, "ScopeError": scope_error,
        "ConversationConflict": type("ConversationConflict", (ValueError,), {}),
        "build_scope": lambda _user, **scope: SimpleNamespace(**scope),
        "_error": lambda error, status, **_: (str(error), status),
        "_ok": lambda result, status: (result, status),
        "_thread_view": lambda *_args, **_kwargs: {}, "job_view": lambda job: job.payload,
        "_supplied_idempotency": lambda *_: "request",
        "prepare_turn_submission": MagicMock(return_value=(None, [])),
        "TeachingAgentMessages": lambda **kw: SimpleNamespace(id=1, **kw),
        "DEFAULT_THREAD_TITLES": (), "MAX_MESSAGE_CHARS": 48_000, "MAX_AGENT_LOOP_STEPS": 8,
        "HARNESS_VERSION": 1, "submission_fingerprint": lambda _: "fingerprint",
        "_agent_request_context": MagicMock(return_value=({}, [{"type": "material", "id": ref["id"]} for ref in state.refs])),
        "_message_attachment_views": lambda *_: [], "_material_dependency_ids": lambda *_: [],
        "session_history_replayable": MagicMock(side_effect=AssertionError("Must not read the history")),
        "_teacher_agent_context": MagicMock(side_effect=AssertionError("Must not collect platform facts")),
        "enqueue_job": enqueue, "publish_pending_outbox": MagicMock(),
    }
    path = ROOT / "dojo_plugin/api/v1/teaching.py"
    submit = next(node for node in ast.parse(path.read_text()).body if getattr(node, "name", "") == "submit_teacher_message")
    exec(compile(ast.Module(body=[submit], type_ignores=[]), str(path), "exec"), route)
    body = {
        "content": "比较两份资料。", "materialQuestion": True, "executionMode": "ask",
        "sourceRefs": [{"type": "material", "id": ref["id"]} for ref in state.refs],
    }
    user = SimpleNamespace(id=7)
    reason, status = route["submit_teacher_message"](user, thread.id, body)
    assert status == 400 and "未开通" in reason
    db.session.rollback.assert_called_once()
    enqueue.assert_not_called()
    db.session.add.assert_not_called()

    thread.dojo_id = 19
    state.allow = False
    _, status = route["submit_teacher_message"](user, thread.id, body)
    assert status == 400
    assert db.session.rollback.call_count == 2
    enqueue.assert_not_called()
    db.session.commit.assert_not_called()

    state.allow = True
    result, status = route["submit_teacher_message"](user, thread.id, body)
    assert status == 202 and "ordinaryMaterialQuestion" in result["job"]
    args = enqueue.call_args.kwargs
    assert args["kind"] == "agent.chat" and args["commit"] is False
    assert set(args["payload"]) == {
        "prompt", "executionMode", "chatBackend", "sourceRefs", "ordinaryMaterialQuestion",
        "allowDegraded", "harnessVersion", "submissionFingerprint", "userMessageId",
    }
    assert route["_agent_request_context"].call_args.kwargs == {"include_thread_attachments": False}
    db.session.commit.assert_called_once()


def test_teacher_message_and_job_keep_only_ordered_tool_read_indices(flow, monkeypatch):
    import sys

    _, jobs, _, job, route, _ = flow
    pkg = "readonly_fixture"
    mode = {}
    source("workbench", mode)
    monkeypatch.setitem(sys.modules, pkg + ".agent_runtime.workbench", SimpleNamespace(**mode))
    message = SimpleNamespace(content="", metadata_json={})
    job.thread_id, job.id = "thread", "job"
    cards = MagicMock()
    cards.query.filter_by.return_value.all.return_value = []
    jobs.update(
        __package__=pkg + ".agent_runtime", restore_input_cache=MagicMock(),
        validated_generation_options=lambda *_: None, _validated_tool_proposals=lambda *_: [],
        persist_agent_deliverables=lambda *_: [], _agent_message_for_job=lambda *_: message,
        _agent_answer=lambda value: value["answer"], valid_material_reads=turn.valid_material_reads,
        ConversationCards=cards,
    )
    source("jobs", jobs, functions={"_persist_result"})
    result = jobs["_invoke_agent_runtime"](job, route, job.payload)["result"]
    stored = jobs["_persist_result"](job, result)
    assert stored["materialReads"] == message.metadata_json["materialReads"] == [2, 1]
    assert "materialModelCoverage" not in stored and "materialModelCoverage" not in message.metadata_json
    assert "materials" not in stored and "materials" not in message.metadata_json
    with pytest.raises(jobs["PermanentJobError"], match="读取记录"):
        jobs["_persist_result"](job, {**result, "materialReads": [2, 3]})

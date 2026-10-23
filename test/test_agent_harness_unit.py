import ast
import datetime
import hashlib
import json
import re
from pathlib import Path
from types import SimpleNamespace, ModuleType
import sys

import pytest
from test_generation_reliability_unit import reliability
from sqlalchemy import Column, Integer, String, JSON, DateTime, create_engine, text as sql_text
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session

ROOT = Path(__file__).resolve().parents[1]
Base = declarative_base()


class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    thread_id = Column(String)
    idempotency_key = Column(String, unique=True)
    kind = Column(String, default="agent.chat")
    status = Column(String, default="QUEUED")
    stage = Column(String, default="queued")
    progress = Column(Integer, default=0)
    payload = Column(JSON, default=dict)
    result = Column(JSON, default=dict)
    created = Column(DateTime, default=datetime.datetime.now)
    updated = Column(DateTime, default=datetime.datetime.now)
    canceled = Column(DateTime)
    lease_owner = Column(String)
    lease_expires = Column(DateTime)
    heartbeat = Column(DateTime)
    error = Column(String)
    trace_id = Column(String)
    attempt_count = Column(Integer, default=0)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    thread_id = Column(String)
    role = Column(String, default="assistant")
    metadata_json = Column(JSON, default=dict)


class Thread(Base):
    __tablename__ = "threads"
    id = Column(String, primary_key=True)
    user_id = Column(Integer)
    status = Column(String, default="ACTIVE")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)


class Outbox(Base):
    __tablename__ = "outboxes"
    id = Column(Integer, primary_key=True)
    job_id = Column(String)
    payload = Column(JSON, default=dict)
    published = Column(DateTime)
    publish_attempts = Column(Integer, default=0)
    last_error = Column(String)


def load(path, namespace):
    tree = ast.parse((ROOT / path).read_text())
    tree.body = [node for node in tree.body if not isinstance(node, ast.ImportFrom) or node.level == 0]
    exec(compile(tree, str(ROOT / path), "exec"), namespace)
    return SimpleNamespace(**namespace)


@pytest.fixture
def setup():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = scoped_session(sessionmaker(bind=engine))
    for table in [Job, Thread, Message, User, Outbox]:
        table.query = session.query_property()
    thread = Thread(id="thread", user_id=7)
    session.add_all([thread, User(id=7)])
    session.commit()
    module = load("dojo_plugin/agent_runtime/conversation.py", {"TeachingJobs": Job})
    yield session, thread, module
    session.remove()
    engine.dispose()


def add_job(session, id, **values):
    job = Job(id=id, owner_id=7, thread_id="thread", **values)
    session.add(job)
    session.commit()
    return job


def cancellation_function(session):
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "cancel_job")
    namespace = {
        "TeachingJobs": Job,
        "db": SimpleNamespace(session=session),
        "datetime": datetime,
        "_single_candidate_materialization": lambda job, result: (None, None),
        "_finalize_canceled_job": lambda job, message: setattr(job, "status", "CANCELED"),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "jobs.py", "exec"), namespace)
    return namespace["cancel_job"]


def test_cancel_reloads_terminal_state_before_mutation(setup):
    session = setup[0]
    job = add_job(session, "race", status="RUNNING")
    assert job.status == "RUNNING"
    with session.get_bind().begin() as connection:
        connection.execute(sql_text("UPDATE jobs SET status='CANCELED' WHERE id='race'"))
    result = cancellation_function(session)(job, 7)
    assert result.status == "CANCELED"
    assert session.get(Job, "race").status == "CANCELED"


def test_cancel_finalizes_orphaned_request_without_lease(setup):
    session = setup[0]
    job = add_job(session, "orphan", status="CANCEL_REQUESTED")
    result = cancellation_function(session)(job, 7)
    assert result.status == "CANCELED"
    assert session.get(Job, "orphan").status == "CANCELED"


def test_retry_reloads_terminal_state_before_rearming(setup):
    session = setup[0]
    job = add_job(session, "retry-race", status="FAILED")
    assert job.status == "FAILED"
    with session.get_bind().begin() as connection:
        connection.execute(sql_text("UPDATE jobs SET status='SUCCEEDED' WHERE id='retry-race'"))
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "retry_job")
    namespace = {
        "TeachingJobs": Job,
        "_single_candidate_materialization": lambda job, result: (None, None),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "jobs.py", "exec"), namespace)
    with pytest.raises(ValueError, match="Only failed or canceled"):
        namespace["retry_job"](job, 7, "new-attempt")
    assert session.get(Job, "retry-race").status == "SUCCEEDED"


def test_worker_claim_reloads_canceled_state_before_execution(setup):
    session = setup[0]
    job = add_job(session, "claim-race", status="RUNNING")
    assert job.status == "RUNNING"
    with session.get_bind().begin() as connection:
        connection.execute(sql_text("UPDATE jobs SET status='CANCELED' WHERE id='claim-race'"))
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "_acquire_job")
    namespace = {
        "datetime": datetime,
        "TeachingJobs": Job,
        "db": SimpleNamespace(session=session),
        "_job_cancellation_requested": lambda job: False,
        "recovery_due": lambda job, now: True,
        "turn_wait_state": lambda session, job: "ready",
        "_runtime_job_lease_seconds": lambda job: 60,
        "append_job_event": lambda *args: None,
        "_sync_candidate_generation_card": lambda job: None,
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "jobs.py", "exec"), namespace)
    assert namespace["_acquire_job"]("claim-race", "worker") is None
    assert session.get(Job, "claim-race").status == "CANCELED"


def test_submission_empty_and_exact_replay(setup):
    session, thread, c = setup
    body = {"content": "生成DNA演示"}
    assert c.prepare_turn_submission(session, thread, body, "key") == (None, [])
    job = add_job(session, "a", idempotency_key="key", payload={"submissionFingerprint": c.submission_fingerprint(body)})
    assert c.prepare_turn_submission(session, thread, body, "key") == (job, [])
    with pytest.raises(c.ConversationConflict):
        c.prepare_turn_submission(session, thread, {"content": "different"}, "key")


def test_active_turn_queues_even_if_browser_did_not_see_current_job(setup):
    session, thread, c = setup
    add_job(session, "a", status="RUNNING")
    assert c.prepare_turn_submission(session, thread, {"content": "more"}, "key")[1] == ["a"]
    body = {"content": "more", "delivery": "after-current", "expectedJobId": "wrong"}
    assert c.prepare_turn_submission(session, thread, body, "key")[1] == ["a"]
    with pytest.raises(c.ConversationConflict):
        c.prepare_turn_submission(session, thread, {**body, "questionReply": {"answers": {"q": "yes"}}}, "key")
    body["expectedJobId"] = "a"
    assert c.prepare_turn_submission(session, thread, body, "key")[1] == ["a"]


def test_queued_turn_follows_current_foreground_job_after_snapshot_changes(setup):
    session, thread, c = setup
    add_job(session, "new-root", status="RUNNING")
    body = {"content": "下一步做练习", "delivery": "after-current", "expectedJobId": "finished-root"}
    assert c.prepare_turn_submission(session, thread, body, "new-turn") == (None, ["new-root"])


@pytest.mark.parametrize("kind", ["material.analyze", "material.enrich"])
def test_background_material_work_never_blocks_or_reorders_chat(setup, kind):
    session, thread, c = setup
    add_job(session, "background", kind=kind, status="RUNNING")
    # The browser may still hold the ID of an old foreground task. A material
    # worker must not make that unrelated composer state stale or queue the turn.
    body = {"content": "继续设计练习", "delivery": "after-current", "expectedJobId": "old-task"}
    assert c.prepare_turn_submission(session, thread, body, "new-turn") == (None, [])


def test_only_fresh_thread_upload_is_carried_into_first_request(setup):
    c = setup[2]
    entries = [
        {"id": "first", "status": "AWAITING_INTENT"},
        {"id": "staged", "status": "ACTIVE"},
        {"id": "old", "status": "ACTIVE", "messageId": 41},
        {"id": "legacy", "status": "REFERENCED", "messageId": 12},
        {"id": "placed", "status": "PLACED"},
    ]
    assert c.unreferenced_attachment_refs(entries) == [
        {"type": "material", "id": "first"},
        {"type": "material", "id": "staged"},
    ]


def test_selected_material_requires_complete_grounding_even_for_chat_and_quiz():
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "_job_material_grounding_required")
    namespace = {
        "course_material_grounding_requested": lambda prompt: "根据课程资料" in str(prompt),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "jobs.py", "exec"), namespace)
    required = namespace["_job_material_grounding_required"]
    selected = {"sourceRefs": [{"type": "material", "id": "source"}]}
    assert required(SimpleNamespace(kind="agent.chat"), selected)
    assert required(SimpleNamespace(kind="candidate.generate"), {**selected, "artifactType": "quiz"})
    assert required(SimpleNamespace(kind="agent.chat"), {"prompt": "根据课程资料设计练习"})
    assert not required(SimpleNamespace(kind="agent.chat"), {"prompt": "讲讲今天的教学安排"})
    assert not required(SimpleNamespace(kind="candidate.generate"), {"artifactType": "slide-deck", "prompt": "生成一张概率图"})
    assert not required(SimpleNamespace(kind="candidate.generate"), {"sourceRefs": [{"type": "candidate", "id": "prior"}]})


def test_worker_index_rechecks_owned_revision_before_reading_source():
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "_index_material_on_worker")
    material = SimpleNamespace(id="material", owner_id=7, status="UPLOADED",
                               storage_key="7/source.pptx", sha256="sha",
                               filename="lesson.pptx", size=100)
    revision = SimpleNamespace(id="revision", material_id="material",
                               storage_key="7/source.pptx", sha256="sha")

    class Query:
        def __init__(self, value):
            self.value = value

        def filter_by(self, **conditions):
            if any(getattr(self.value, key, None) != value for key, value in conditions.items()):
                return Query(None)
            return self

        def first(self):
            return self.value

    calls = []
    namespace = {
        "TeachingMaterials": SimpleNamespace(query=Query(material)),
        "TeachingMaterialRevisions": SimpleNamespace(query=Query(revision)),
        "PermanentJobError": ValueError,
        "locally_extractable": lambda filename: filename.endswith(".pptx"),
        "config": SimpleNamespace(AGENT_RUNTIME_STORAGE_ROOT="/private/materials"),
        "index_verified_local_source": lambda **kwargs: calls.append(kwargs) or {"ok": True},
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "jobs.py", "exec"), namespace)
    payload = {"materialId": "material", "revisionId": "revision",
               "storageKey": "7/source.pptx", "mimeType": "text/plain"}
    assert namespace["_index_material_on_worker"](SimpleNamespace(owner_id=7), payload) == {"ok": True}
    assert calls[0]["sha256"] == "sha"
    revision.sha256 = "different"
    with pytest.raises(ValueError, match="no longer matches"):
        namespace["_index_material_on_worker"](SimpleNamespace(owner_id=7), payload)
    assert len(calls) == 1


def test_candidate_lineage_is_preserved_without_implicit_course_files():
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                 and node.name in {"_job_material_grounding_required", "_runtime_payload"}]
    candidate_set = SimpleNamespace(source_refs=[])
    calls = []

    def build_context(**kwargs):
        calls.append(kwargs)
        return {"sourceRefs": kwargs["source_refs"], "sourceMaterials": [],
                "coverage": {"complete": True, "expectedMaterialCount": len(kwargs["source_refs"])}}

    namespace = {
        "course_material_grounding_requested": lambda prompt: "根据课程资料" in str(prompt),
        "singular_material_reference_requested": lambda prompt: "这份课件" in str(prompt),
        "PermanentJobError": ValueError,
        "build_course_material_context": build_context,
        "_teacher_learning_request": lambda job, payload: None,
        "_student_material_snapshot": lambda payload: None,
        "TeachingCandidateSets": SimpleNamespace(query=SimpleNamespace(
            filter_by=lambda **kwargs: SimpleNamespace(first=lambda: candidate_set))),
        "compact_material_grounding": lambda context: context,
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), "jobs.py", "exec"), namespace)
    job = SimpleNamespace(kind="candidate.generate", id="job", owner_id=7, dojo_id=11,
                          payload={"candidateSetId": "set", "artifactType": "slide-deck",
                                   "prompt": "继续修改上一版", "sourceRefs": [{"type": "candidate", "id": "prior"}]})
    prepared = namespace["_runtime_payload"](job)
    assert calls[0]["dojo_id"] is None
    assert calls[0]["source_refs"] == []
    assert calls[0]["require_complete"] is False
    assert prepared["sourceRefs"] == [{"type": "candidate", "id": "prior"}]
    assert candidate_set.source_refs == prepared["sourceRefs"]


@pytest.mark.parametrize("prompt,expected", [
    ("根据这份课件生成一题", True),
    ("请参考刚才上传的讲义", True),
    ("总结上传的 PDF", True),
    ("结合课程全部资料设计作业", False),
    ("介绍课件上传的步骤", False),
])
def test_singular_material_reference_detection(prompt, expected):
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/materials.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "singular_material_reference_requested")
    namespace = {"re": re}
    exec(compile(ast.Module(body=[function], type_ignores=[]), "materials.py", "exec"), namespace)
    assert namespace["singular_material_reference_requested"](prompt) is expected


def test_single_file_reference_without_selection_is_rejected_before_job_creation():
    tree = ast.parse((ROOT / "dojo_plugin/api/v1/teaching.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == "_agent_request_context")
    namespace = {
        "scrub_payload": lambda value: value,
        "unreferenced_attachment_refs": lambda value: [],
        "_thread_attachment_entries": lambda thread: [],
        "singular_material_reference_requested": lambda prompt: "这份课件" in str(prompt),
        "_json_size": lambda value: len(json.dumps(value)),
        "MAX_AGENT_CONTEXT_BYTES": 65536,
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "teaching.py", "exec"), namespace)
    context = namespace["_agent_request_context"]
    with pytest.raises(ValueError, match="引用资料"):
        context({"content": "根据这份课件出题"}, None, SimpleNamespace())
    assert context({"content": "讲解课程规划"}, None, SimpleNamespace()) == ({}, [])


@pytest.mark.parametrize("status", ["FAILED", "CANCELED", "SUCCEEDED"])
def test_terminal_predecessor_never_discards_next_request(setup, status):
    session, thread, c = setup
    add_job(session, "a", status=status)
    queued = add_job(session, "b", payload={"waitForJobIds": ["a"]})
    assert c.turn_wait_state(session, queued) == "ready"


def test_queue_waits_for_late_descendant_and_accepts_root_identity(setup):
    session, thread, c = setup
    add_job(session, "root", status="SUCCEEDED")
    queued = add_job(session, "next", payload={"waitForJobIds": ["root"]})
    child = add_job(session, "driver", kind="agent.advance", payload={"harnessRootJobId": "root", "harnessInternal": True})
    assert c.turn_wait_state(session, queued) == "waiting"
    assert c.prepare_turn_submission(session, thread, {"delivery": "after-current", "expectedJobId": "root"}, "key")[0] is None
    child.status = "FAILED"
    session.commit()
    assert c.turn_wait_state(session, queued) == "ready"


def test_queue_capacity_and_withdrawal(setup):
    session, thread, c = setup
    add_job(session, "root", status="RUNNING")
    for i in range(8):
        add_job(session, f"q{i}", payload={"waitForJobIds": ["root"], "prompt": f"request {i}"})
    assert len(c.pending_turns(session, thread)) == 8
    with pytest.raises(c.ConversationConflict):
        c.prepare_turn_submission(session, thread, {"delivery": "after-current"}, "key")
    Job.query.filter_by(id="q0").first().status = "CANCELED"
    session.commit()
    assert len(c.pending_turns(session, thread)) == 7
    c.prepare_turn_submission(session, thread, {"delivery": "after-current"}, "key")


def test_cross_owner_and_other_thread_not_waited_on(setup):
    session, thread, c = setup
    other = add_job(session, "other", status="RUNNING")
    other.owner_id = 99
    session.commit()
    job = add_job(session, "q", payload={"waitForJobIds": ["other"]})
    assert c.turn_wait_state(session, job) == "ready"


def test_chain_bounded_and_owner_checked(setup):
    session, thread, c = setup
    root = add_job(session, "root", payload={"harnessNextJobId": "child"})
    child = add_job(session, "child", payload={"harnessNextJobId": "root"})
    assert c.execution_chain(session, root) == child
    child.owner_id = 99
    session.commit()
    assert c.execution_chain(session, root) == root


@pytest.mark.parametrize("answers", [{}, {"a": ""}, {"a": 1}, {"a": "x" * 2001}, {"b": "hi"}, {"a": "yes", "b": "yes"}])
def test_questions_reject_incomplete_and_unknown_answers(setup, answers):
    c = setup[2]
    with pytest.raises(c.ConversationConflict):
        c.validated_question_answers([{"id": "a"}], {"answers": answers})


def test_questions_allow_free_text_not_only_options(setup):
    c = setup[2]
    assert c.validated_question_answers([{"id": "a", "choices": ["short", "long"]}], {"answers": {"a": "  自定义要求  "}}) == {"a": "自定义要求"}


def test_question_replies_keep_initial_request_across_clarification_rounds(setup):
    c = setup[2]
    first = c.question_reply_context({"prompt": "做一段DNA演示"}, [{"id": "level", "text": "面向谁？"}], {"level": "高中生"})
    second = c.question_reply_context({"prompt": "高中生", "context": {"questionReply": first}}, [{"id": "time", "text": "多长？"}], {"time": "一分钟"})
    assert second == {"originalRequest": "做一段DNA演示", "answers": [{"question": "面向谁？", "answer": "高中生"}, {"question": "多长？", "answer": "一分钟"}]}
    assert c.question_reply_prompt(second) == "做一段DNA演示\n\n教师补充信息：\n\n面向谁？：高中生\n\n多长？：一分钟"
    with pytest.raises(c.ConversationConflict):
        c.question_reply_prompt({"originalRequest": "长" * 48000, "answers": second["answers"]})


def test_outbox_scans_past_blocked_page_without_starving_ready_tools(setup):
    session, thread, c = setup
    add_job(session, "running", status="RUNNING")
    for index in range(105):
        session.add(Job(id=f"waiting-{index}", owner_id=7, thread_id=thread.id, payload={"waitForJobIds": ["running"]}))
        session.add(Outbox(id=index + 1, job_id=f"waiting-{index}", payload={"job_id": f"waiting-{index}"}))
    session.add_all([Job(id="ready-tool", owner_id=7, thread_id=thread.id), Outbox(id=106, job_id="ready-tool", payload={"job_id": "ready-tool"})])
    session.commit()
    published = []
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {"_pending_outbox_rows", "publish_pending_outbox"}]
    namespace = {"TeachingJobOutbox": Outbox, "TeachingJobs": Job, "datetime": datetime, "json": json,
                 "db": SimpleNamespace(session=session), "turn_wait_state": c.turn_wait_state,
                 "_redis": lambda: SimpleNamespace(xadd=lambda stream, body, **kw: published.append(json.loads(body["data"])["job_id"])),
                 "_stream_for_job": lambda _: "test", "recovery_due": reliability.recovery_due}
    exec(compile(ast.Module(body=selected, type_ignores=[]), "jobs.py", "exec"), namespace)
    assert namespace["publish_pending_outbox"](limit=1) == 1
    assert published == ["ready-tool"]
    assert session.query(Outbox).filter(Outbox.published.is_(None)).count() == 105


def attempt_functions(session, **extra):
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    names = {"JobCanceled", "JobLeaseLost", "_owned_job_attempt", "assert_job_lease", "process_job"}
    selected = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names]
    namespace = {"TeachingJobs": Job, "db": SimpleNamespace(session=session),
                 "logger": SimpleNamespace(info=lambda *_: None), "TurnDeferred": type("TurnDeferred", (RuntimeError,), {}), **extra}
    exec(compile(ast.Module(body=selected, type_ignores=[]), "jobs.py", "exec"), namespace)
    return namespace


@pytest.mark.parametrize("replacement", [
    {"lease_owner": "worker-new"}, {"trace_id": "retry-new"}, {"attempt_count": 2},
    {"status": "QUEUED", "lease_owner": None}, {"status": "SUCCEEDED", "lease_owner": None},
])
def test_old_worker_identity_cannot_refresh_or_own_a_new_attempt(setup, replacement):
    session = setup[0]
    stale = add_job(session, "fenced", status="RUNNING", lease_owner="worker-old", trace_id="trace-old", attempt_count=1)
    identity = (stale.lease_owner, stale.trace_id, stale.attempt_count)
    stale._execution_identity = identity
    namespace = attempt_functions(session)
    assert namespace["assert_job_lease"](stale) is stale
    # A second session owns the authoritative replacement while the first
    # still holds the old ORM object; populate_existing must defeat that cache.
    with sessionmaker(bind=session.get_bind())() as other:
        other.query(Job).filter_by(id=stale.id).update(replacement)
        other.commit()
    with pytest.raises(namespace["JobLeaseLost"]):
        namespace["assert_job_lease"](stale)
    session.rollback()
    assert namespace["_owned_job_attempt"](stale.id, identity, required=False) is None
    assert all(getattr(stale, key) == value for key, value in replacement.items())


@pytest.mark.parametrize("outcome", ["success", "error", "canceled", "deferred"])
def test_superseded_driver_cannot_complete_fail_cancel_or_requeue_current_attempt(setup, outcome):
    session = setup[0]
    job = add_job(session, "fenced-driver", kind="agent.advance", status="RUNNING", lease_owner="worker-old", trace_id="trace-old", attempt_count=1)
    namespace = attempt_functions(session, _acquire_job=lambda *_: job)
    def superseded(_):
        with sessionmaker(bind=session.get_bind())() as other:
            other.query(Job).filter_by(id=job.id).update({"lease_owner": "worker-new", "trace_id": "trace-new", "attempt_count": 2})
            other.commit()
        if outcome == "error":
            raise ValueError("stale error")
        if outcome == "canceled":
            raise namespace["JobCanceled"]("stale cancel")
        if outcome == "deferred":
            raise namespace["TurnDeferred"]()
        return {"state": "complete"}
    namespace["advance_turn"] = superseded
    assert namespace["process_job"](job.id, worker_id="worker-old") is True
    session.refresh(job)
    assert (job.status, job.lease_owner, job.trace_id, job.attempt_count) == ("RUNNING", "worker-new", "trace-new", 2)


def test_policy_never_auto_approves_or_auto_selects():
    h = load("dojo_plugin/agent_runtime/harness.py", {"__name__": "harness_test"})
    schemas = {"course.delete": ("R3", {}), "candidate.generate": ("R1", {}), "course.read": ("R0", {}), "artifact.revise": ("R2", {}), "unknown.r0": ("R0", {})}
    for tool in ["course.delete", "candidate.generate", "missing", "unknown.r0"]:
        assert h.execution_policy(tool, schemas, {"course.delete", "course.read"}, set()) == "user"
    for tool in ["course.read", "artifact.revise"]:
        assert h.execution_policy(tool, schemas, {"course.read"}, set()) == "server"


@pytest.mark.parametrize("outcome", ["SUCCEEDED", "FAILED", "CANCELED"])
@pytest.mark.parametrize("child_count", [1, 2])
def test_driver_durable_replay_tool_completion_and_continuation(setup, monkeypatch, outcome, child_count):
    session, thread, c = setup
    package = "harness_fixture"
    for name in [package, package + ".agent_runtime", package + ".api", package + ".api.v1", "CTFd"]:
        module = ModuleType(name); module.__path__ = []
        monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.setitem(sys.modules, "CTFd.models", SimpleNamespace(Users=User, db=SimpleNamespace(session=session)))
    monkeypatch.setitem(sys.modules, package + ".models", SimpleNamespace(TeachingJobs=Job, TeachingAgentMessages=Message, TeachingAgentThreads=Thread))
    source = Message(id=1, user_id=7, thread_id=thread.id, metadata_json={"jobId": "root", "toolProposals": [{"tool": "artifact.revise", "arguments": {"artifactId": "artifact", "instruction": "更清楚"}}]})
    session.add(source)
    add_job(session, "root", status="SUCCEEDED")
    driver = add_job(session, "driver", kind="agent.advance", payload={"sourceMessageId": 1, "harnessRootJobId": "root", "harnessInternal": True})
    calls, continues = [], []
    def revise(owner, artifact, args, key):
        calls.append(key)
        job = Job.query.filter_by(id="child").first() or add_job(session, "child", kind="artifact.revise")
        children = [job]
        if child_count == 2:
            children.append(Job.query.filter_by(id="child2").first() or add_job(session, "child2", kind="artifact.revise"))
        return {"success": True, "data": {"job": {"id": job.id}, "jobs": [{"id": child.id} for child in children]}}, 202
    def continue_message(owner, thread_id, body, key):
        continues.append((body, key))
        return {"success": True, "data": {"job": {"id": "followup"}}}, 202
    api = SimpleNamespace(_require_teacher=lambda user: None, COURSE_TOOL_NAMES=set(), COURSE_NAVIGATION_TOOLS=set(),
                          MAX_AGENT_LOOP_STEPS=6, revise_teacher_artifact=revise, submit_teacher_message=continue_message)
    monkeypatch.setitem(sys.modules, package + ".api.v1.teaching", api)
    jobs = SimpleNamespace(AGENT_TOOL_SCHEMAS={"artifact.revise": ("R2", {})}, heartbeat=lambda job, **kw: job, assert_job_lease=lambda job: job,
                           _job_failure_message=lambda job: "工具未完成")
    monkeypatch.setitem(sys.modules, package + ".agent_runtime.jobs", jobs)
    h = load("dojo_plugin/agent_runtime/harness.py", {"__name__": package + ".agent_runtime.harness", "__package__": package + ".agent_runtime"})
    with pytest.raises(h.TurnDeferred):
        h.advance_turn(driver)
    assert calls == ["agent-proposal:1:0"] and not continues
    assert source.metadata_json["toolExecutionResults"]["0"]["jobId"] == "child"
    with pytest.raises(h.TurnDeferred):
        h.advance_turn(driver)
    assert len(calls) == 1 and not continues
    child = Job.query.filter_by(id="child").first()
    child.status = outcome; session.commit()
    if child_count == 2:
        with pytest.raises(h.TurnDeferred):
            h.advance_turn(driver)
        assert not continues
        Job.query.filter_by(id="child2").first().status = "SUCCEEDED"
        session.commit()
    if outcome != "SUCCEEDED":
        with pytest.raises(ValueError, match="工具未完成"):
            h.advance_turn(driver)
        assert not continues and len(calls) == 1
        assert source.metadata_json["harnessExecution"]["state"] == "failed"
        return
    h.advance_turn(driver)
    assert len(calls) == 1 and len(continues) == 1
    assert continues[0][0]["sourceMessageId"] == 1
    assert source.metadata_json["toolExecutionResults"]["0"]["status"] == "SUCCEEDED"
    assert driver.payload["harnessNextJobId"] == "followup"


def test_multi_job_result_ids_are_deduplicated():
    h = load("dojo_plugin/agent_runtime/harness.py", {"__name__": "harness_test"})
    assert h.tool_job_ids({"result": {"job": {"id": "a"}, "jobs": [{"id": "a"}, {"id": "b"}]}}) == ["a", "b"]

import ast
import datetime
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from types import SimpleNamespace, ModuleType
import sys

import pytest
from sqlalchemy import Column, Integer, String, JSON, DateTime, create_engine, text as sql_text
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from sqlalchemy.dialects.postgresql import JSONB

ROOT = Path(__file__).resolve().parents[1]
reliability_spec = importlib.util.spec_from_file_location('agent_harness_reliability', ROOT / 'dojo_plugin/agent_runtime/reliability.py')
reliability = importlib.util.module_from_spec(reliability_spec)
reliability_spec.loader.exec_module(reliability)
Base = declarative_base()


class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    thread_id = Column(String)
    idempotency_key = Column(String, unique=True)
    kind = Column(String, default="agent.chat")
    dojo_id = Column(Integer)
    module_index = Column(Integer)
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


class Event(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True)
    thread_id = Column(String)
    event_type = Column(String)
    payload = Column(JSONB().with_variant(JSON, 'sqlite'))


def load(path, namespace):
    tree = ast.parse((ROOT / path).read_text())
    tree.body = [node for node in tree.body if not isinstance(node, ast.ImportFrom) or node.level == 0]
    exec(compile(tree, str(ROOT / path), "exec"), namespace)
    return SimpleNamespace(**namespace)


@pytest.fixture
def setup(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = scoped_session(sessionmaker(bind=engine))
    for table in [Job, Thread, Message, User, Outbox, Event]:
        table.query = session.query_property()
    thread = Thread(id="thread", user_id=7)
    session.add_all([thread, User(id=7)])
    session.commit()
    package = 'harness_fixture'
    for name, path in [(package, ROOT / 'dojo_plugin'),
                       (package + '.agent_runtime', ROOT / 'dojo_plugin/agent_runtime'),
                       (package + '.api', None), (package + '.api.v1', None), ('CTFd', None)]:
        module = ModuleType(name)
        module.__path__ = [str(path)] if path else []
        monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.setitem(sys.modules, 'CTFd.models', SimpleNamespace(Users=User, db=SimpleNamespace(session=session)))
    monkeypatch.setitem(sys.modules, package + '.models', SimpleNamespace(
        TeachingJobs=Job, TeachingAgentMessages=Message, TeachingAgentThreads=Thread,
        TeachingAgentEventOutbox=Event, TeachingAgentActions=SimpleNamespace(),
    ))
    module = importlib.import_module(package + '.agent_runtime.conversation')
    yield session, thread, module
    session.remove()
    engine.dispose()
    for name in list(sys.modules):
        if name.startswith(package + '.') and name not in {package + '.agent_runtime', package + '.api', package + '.api.v1', package + '.models'}:
            sys.modules.pop(name, None)


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
        "TeachingAgentThreads": Thread,
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
    assert second == {"originalRequest": "做一段DNA演示", "round": 2, "intentDecision": None,
                      "answers": [{"question": "面向谁？", "answer": "高中生"}, {"question": "多长？", "answer": "一分钟"}]}
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
                 "request_payload": importlib.import_module('harness_fixture.agent_runtime.model_inputs').request_payload,
                 "db": SimpleNamespace(session=session), "turn_wait_state": c.turn_wait_state,
                 "_redis": lambda: SimpleNamespace(xadd=lambda stream, body, **kw: published.append(json.loads(body["data"])["job_id"])),
                 "_stream_for_job": lambda _: "test", "recovery_due": reliability.recovery_due}
    exec(compile(ast.Module(body=selected, type_ignores=[]), "jobs.py", "exec"), namespace)
    assert namespace["publish_pending_outbox"](limit=1) == 1
    assert published == ["ready-tool"]
    assert session.query(Outbox).filter(Outbox.published.is_(None)).count() == 105


def attempt_functions(session, **extra):
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    names = {"JobCanceled", "JobLeaseLost", "_owned_job_attempt", "assert_job_lease", "_job_cancellation_requested", "process_job"}
    selected = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names]
    namespace = {"TeachingJobs": Job, "db": SimpleNamespace(session=session),
                 "COMMAND_JOB_KINDS": importlib.import_module('harness_fixture.agent_runtime.commands').COMMAND_JOB_KINDS,
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
    source = Message(id=1, user_id=7, thread_id=thread.id, metadata_json={"jobId": "root", "executionMode": "execute",
                     "intentDecision": {"version": "teacher-intent-v1", "intent": "revise", "executionMode": "execute", "clarification": {"state": "confirmed"}},
                     "toolProposals": [{"tool": "artifact.revise", "arguments": {"artifactId": "artifact", "instruction": "更清楚"}}]})
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
    api = SimpleNamespace(_require_teacher=lambda user: None, COURSE_TOOL_NAMES=set(), SKILL_TOOL_NAMES=set(), COURSE_NAVIGATION_TOOLS=set(),
                          MAX_AGENT_LOOP_STEPS=6, revise_teacher_artifact=revise, submit_teacher_message=continue_message)
    monkeypatch.setitem(sys.modules, package + ".api.v1.teaching", api)
    jobs = SimpleNamespace(AGENT_TOOL_SCHEMAS={"artifact.revise": ("R2", {})}, heartbeat=lambda job, **kw: job, assert_job_lease=lambda job: job,
                           _record_agent_run_progress=lambda *args: None,
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
    child.status = outcome
    session.add(Event(thread_id=thread.id, event_type='job.event', payload={'jobId': child.id, 'status': outcome, 'details': {}}))
    session.commit()
    if child_count == 2:
        with pytest.raises(h.TurnDeferred):
            h.advance_turn(driver)
        assert not continues
        Job.query.filter_by(id="child2").first().status = "SUCCEEDED"
        session.add(Event(thread_id=thread.id, event_type='job.event', payload={'jobId': 'child2', 'status': 'SUCCEEDED', 'details': {}}))
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


def test_upstream_teacher_turn_only_enqueues_approved_teaching_operations():
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    functions = {"_upstream_teacher_result", "_validated_tool_proposals"}
    constants = {"AGENT_TOOL_SCHEMAS", "UPSTREAM_APPROVED_TEACHING_TOOLS"}
    tree.body = [
        node for node in tree.body
        if (isinstance(node, ast.FunctionDef) and node.name in functions)
        or (isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id in constants)
    ]
    namespace = {
        "result_object": json.loads,
        "redact_text": lambda value, limit: value[:limit],
        "scrub_payload": lambda value, key: value,
        "requested_document_formats": load("dojo_plugin/agent_runtime/teacher_documents.py", {}).requested_document_formats,
    }
    exec(compile(tree, "jobs.py", "exec"), namespace)
    project = namespace["_upstream_teacher_result"]
    validate = namespace["_validated_tool_proposals"]
    job = SimpleNamespace(payload={"chatBackend": "upstream"}, dojo_id=None, module_index=None)
    proposal = {"tool": "course.create", "arguments": {"name": "课程示例", "unexpected": True}}
    text = json.dumps({"answer": "课程创建草案", "proposal": proposal})
    result = project({}, text)
    assert result["executionMode"] == "execute"
    assert result["intentDecision"]["intent"] == "operate"
    validated, = validate(job, result)
    assert validated["requiresConfirmation"] is True
    assert validated["arguments"] == {"name": "课程示例"}
    assert validate(job, {"toolProposals": [{"tool": "challenge.generate", "arguments": {}}]}) == []
    assert "toolProposals" not in project({"executionMode": "ask"}, text)
    assert "toolProposals" not in project({"context": {"agentLoop": {"trace": [{"status": "verified"}]}}}, text)


def test_provider_audit_records_only_fingerprints_and_compatible_legacy_retries(setup):
    session, thread, _ = setup
    journal = importlib.import_module("harness_fixture.agent_runtime.model_journal")
    job = add_job(session, "audit", status="RUNNING")
    job.attempt_count, job.lease_owner = 1, "worker"
    session.commit()

    parent = "audit:1:1"
    transport = f"{parent}:http:1"
    common = {"parentCallId": parent, "transportNumber": 1, "journalVersion": 2}
    request = {"auditVersion": 2, "stepJournalVersion": 1, "transportJournalVersion": 2, "source": "synthetic"}

    def record(kind, call_id, detail):
        return journal.record_model_event(job.id, {"type": kind, "callId": call_id, "attemptCount": 1, "detail": detail})

    assert record("model.requested", parent, request)["accepted"]
    with pytest.raises(journal.ModelJournalError, match="metadata-only"):
        record("model.requested", "audit:1:3", {"transportJournalVersion": 1, "prompt": "synthetic legacy prompt"})
    request_bytes = b"synthetic student input"
    response_bytes = b"synthetic provider response"
    request_detail = {
        **common, "providerId": "test", "providerType": "openai", "modelId": "test",
        "url": "https://provider.example/chat", "method": "POST", "headers": {},
        "byteLength": len(request_bytes), "bodySha256": hashlib.sha256(request_bytes).hexdigest(),
    }
    with pytest.raises(journal.ModelJournalError, match="Unexpected provider journal metadata field"):
        record("provider.request", transport, {**request_detail, "bodyBase64": "c3ludGhldGlj"})
    assert record("provider.request", transport, request_detail)["accepted"]
    assert record("provider.request", transport, request_detail)["duplicate"]
    response_detail = {**common, "status": 200, "headers": {}, "bodySemantics": "fetch-decoded-body"}
    assert record("provider.response", transport, response_detail)["accepted"]
    digest = hashlib.sha256(response_bytes).hexdigest()
    chunk = {**common, "chunkNumber": 1, "offset": 0, "byteLength": len(response_bytes), "prefixSha256": digest}
    with pytest.raises(journal.ModelJournalError, match="Unexpected provider journal metadata field"):
        record("provider.chunk", f"{transport}:chunk:1", {**chunk, "body": "synthetic raw response"})
    assert record("provider.chunk", f"{transport}:chunk:1", chunk)["accepted"]
    done = {**common, "status": "completed", "chunksCount": 1, "byteLength": len(response_bytes), "bodySha256": digest}
    with pytest.raises(journal.ModelJournalError, match="does not match"):
        record("provider.finished", transport, {**done, "bodySha256": "0" * 64})
    assert record("provider.finished", transport, done)["accepted"]
    step = {"parentCallId": parent, "stepNumber": 0, "usage": {"totalTokens": 9}}
    with pytest.raises(journal.ModelJournalError, match="Invalid model audit usage metadata"):
        record("model.step", f"{parent}:step:1", {**step, "usage": {"raw": {"text": "synthetic raw"}}})
    assert record("model.step", f"{parent}:step:1", step)["accepted"]
    assert record("model.settled", parent, {"stepsCount": 1, "totalUsage": {"totalTokens": 9}})["accepted"]

    legacy_parent = "audit:1:2"
    legacy_transport = f"{legacy_parent}:http:1"
    legacy = {"transportJournalVersion": 1, "prompt": "synthetic historic input"}
    canonical = json.dumps(legacy, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    session.add(Event(thread_id=thread.id, event_type="model.requested", payload={
        "callId": legacy_parent, "detail": legacy, "detailSha256": hashlib.sha256(canonical).hexdigest(),
    }))
    session.commit()
    assert record("model.requested", legacy_parent, legacy)["duplicate"]
    legacy_common = {"parentCallId": legacy_parent, "transportNumber": 1}
    legacy_request = {**request_detail, **legacy_common, "bodyEncoding": "base64", "bodyBase64": "eA==",
                      "byteLength": 1, "bodySha256": hashlib.sha256(b"x").hexdigest()}
    legacy_request.pop("journalVersion")
    assert record("provider.request", legacy_transport, legacy_request)["accepted"]
    assert record("provider.response", legacy_transport, {
        **legacy_common, "status": 200, "headers": {}, "bodySemantics": "fetch-decoded-body", "bodyEncoding": "base64",
    })["accepted"]
    legacy_chunk = {**legacy_common, "chunkNumber": 1, "offset": 0, "byteLength": 1,
                    "bodyBase64": "eQ==", "bodySha256": hashlib.sha256(b"y").hexdigest()}
    assert record("provider.chunk", f"{legacy_transport}:chunk:1", legacy_chunk)["accepted"]
    assert record("provider.finished", legacy_transport, {
        **legacy_common, "status": "completed", "chunksCount": 1, "byteLength": 1, "bodySha256": legacy_chunk["bodySha256"],
    })["accepted"]
    assert record("model.settled", legacy_parent, {"text": "synthetic historic result"})["accepted"]


def test_canceling_provider_audit_uses_the_last_committed_response_fingerprint(setup):
    session, thread, _ = setup
    journal = importlib.import_module("harness_fixture.agent_runtime.model_journal")
    job = add_job(session, "cancel-audit", status="CANCELED", attempt_count=1)
    parent = f"{job.id}:1:1"
    transport = f"{parent}:http:1"
    common = {"parentCallId": parent, "transportNumber": 1, "journalVersion": 2}
    body = b"private synthetic stream"
    fingerprint = hashlib.sha256(body).hexdigest()
    samples = [
        ("model.requested", parent, {"auditVersion": 2, "transportJournalVersion": 2}),
        ("provider.request", transport, common),
        ("provider.chunk", f"{transport}:chunk:1",
         {**common, "chunkNumber": 1, "offset": 0, "byteLength": len(body), "prefixSha256": fingerprint}),
    ]
    for kind, call_id, detail in samples:
        session.add(Event(thread_id=thread.id, event_type=kind, payload={
            "jobId": job.id, "attemptCount": "1", "callId": call_id, "detail": detail,
        }))
    session.commit()
    assert journal.close_canceled_model_calls(job) == {"models": 1, "tools": 0}
    result = Event.query.filter_by(thread_id=thread.id, event_type="provider.finished").one().payload["detail"]
    assert result == {
        **common, "status": "cancelled", "terminationSource": "job-cancellation", "providerOutcomeKnown": False,
        "chunksCount": 1, "byteLength": len(body), "bodySha256": fingerprint,
    }


def test_harness_courseware_requires_an_owned_nonpersonal_teacher_course_artifact():
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                 and node.name == "_harness_courseware_authorized"]

    def table(**row):
        def filter_by(**criteria):
            return SimpleNamespace(first=lambda: SimpleNamespace(**row) if all(
                row.get(key) == value for key, value in criteria.items()
            ) else None)
        return SimpleNamespace(query=SimpleNamespace(filter_by=filter_by))

    namespace = {
        "TeachingArtifacts": table(id="artifact", owner_id=7, dojo_id=2, artifact_type="slide-deck",
                                   self_workspace_id=None),
        "Users": table(id=7, type="user"),
        "DojoAdmins": table(dojo_id=2, user_id=7),
        "upstream_enabled": lambda: True,
    }
    exec(compile(tree, "jobs.py", "exec"), namespace)
    eligible = namespace["_harness_courseware_authorized"]
    job = {"kind": "artifact.materialize", "dojo_id": 2, "owner_id": 7}
    payload = {"artifactId": "artifact", "artifactType": "slide-deck"}
    assert eligible(SimpleNamespace(**job), payload)
    for changes in ({"owner_id": 9}, {"dojo_id": 4}, {"dojo_id": None}, {"kind": "self.candidate.generate"}):
        assert not eligible(SimpleNamespace(**{**job, **changes}), payload)
    assert not eligible(SimpleNamespace(**job), {**payload, "workspaceId": "student-workspace"})
    assert not eligible(SimpleNamespace(**job), {**payload, "artifactType": "simulation"})
    namespace["DojoAdmins"] = table(dojo_id=2, user_id=9)
    assert not eligible(SimpleNamespace(**job), payload)


@pytest.mark.parametrize("prompt, mode, expected", [
    ("请帮我写一份关于蒸发的Word教案", "auto", ("docx",)),
    ("制作蒸发教案，给我DOCX和Markdown文件", "execute", ("docx", "md")),
    ("帮我写一份古诗教学教案", "auto", ("docx",)),
    ("请制作教案，不要 DOCX，只要 Markdown", "auto", ("md",)),
    ("不要生成 docx、只要 Markdown", "auto", ("md",)),
    ("请制作教案，不用导出为 .docx，只要 Markdown", "execute", ("md",)),
    ("请制作教案，不必输出 Markdown，只要 Word", "auto", ("docx",)),
    ("请制作教案，不要只生成 DOCX，也生成 Markdown", "auto", ("docx", "md")),
    ("如何制作一份 Word 教案？", "auto", ()),
    ("请制作 Markdown 教案", "ask", ()),
    ("请制作 Markdown 教案", "plan", ()),
    ("不要制作教案，请解释评估方法", "auto", ()),
    ("请把教学文档输出为 HTML", "auto", ()),
    ("不要帮我生成一份教案", "auto", ()),
    ("无需帮我写 一篇 教学讲义，只解释怎么写", "execute", ()),
    ("不要帮我生成 docx", "execute", ()),
    ("请给我一份教案，不要帮我导出为 .docx，只要 Markdown", "auto", ("md",)),
    ("请把这份教案导出为 PDF", "auto", ()),
    ("帮我写一份 PDF 教案", "execute", ()),
    ("请导出这份教案为 PDF", "auto", ()),
    ("请写一份教案，PDF 格式", "auto", ()),
    ("请导出这份教案为 PDF，也给我 Markdown", "execute", ("md",)),
    ("请根据我提供的 PDF 资料写一份教案", "auto", ("docx",)),
    ("请写一份教案，不用导出为 PDF", "auto", ("docx",)),
    ("请生成 HTML 教案", "auto", ()),
    ("给我一份 PPT 教案", "execute", ()),
    ("请写一份 ODT 教案", "auto", ()),
    ("请生成“HTML”教案", "auto", ()),
    ("请生成 `ODT` 教案", "auto", ()),
    ("请写一份教案，PPTX 格式", "auto", ()),
    ("Please generate an ODT lesson plan", "auto", ()),
    ("我不想做教案，只给我一些建议", "auto", ()),
    ("别生成 docx", "auto", ()),
    ("请勿生成 docx", "execute", ()),
    ("Do not generate a docx.", "execute", ()),
    ("Don't create a DOCX, but provide a Markdown handout", "auto", ("md",)),
    ("我不想只生成 Word 教案，还要 Markdown 文件", "auto", ("docx", "md")),
    ("参考《请勿生成 DOCX》这份资料，帮我写一份教案", "auto", ("docx",)),
    ("阅读「生成 HTML 教案」这句示例，然后提供授课建议", "auto", ()),
    ("请根据这份 HTML 格式资料写一份教案", "auto", ("docx",)),
    ("请根据名为“Markdown”的资料生成教案", "auto", ("docx",)),
    ("请给我《植物观察教案》", "auto", ("docx",)),
    ("请把《植物观察教案》改写得更清楚", "auto", ("docx",)),
    ("制作教案，给我“DOCX”和“Markdown”文件", "auto", ("docx", "md")),
    ("请告诉我如何写一份教案", "auto", ()),
    ("我想知道怎样制作教案", "execute", ()),
    ("Can you tell me how to write a lesson plan?", "auto", ()),
    ("请告诉我如何写教案，提供编写教案的建议", "auto", ()),
    ("请告诉我如何写 Markdown 教案，再帮我生成 DOCX 教案", "auto", ("docx",)),
    ("请告诉我如何写一份教案，再给我一份可下载的文件", "auto", ("docx",)),
    ("Can you tell me how to write a lesson plan? Then give me a downloadable file.", "auto", ("docx",)),
    ("Can you tell me how to write a lesson plan, and then generate a Markdown handout?", "auto", ("md",)),
    ("不要生成任何一份教学文档", "auto", ()),
    ("不要生成任何一份 docx 教案", "auto", ()),
    ("请勿生成任何可下载的讲义", "execute", ()),
    ("别生成任何一份可下载的 DOCX 教案，只要 Markdown", "auto", ("md",)),
    ("参考资料“不要生成任何一份教学文档”，帮我写一份特别教案", "auto", ("docx",)),
    ("参考《请告诉我如何写教案》，帮我写一份特别教案", "auto", ("docx",)),
    ("帮我写一份特别教案", "auto", ("docx",)),
])
def test_teacher_document_requires_an_explicit_supported_request(prompt, mode, expected):
    documents = load("dojo_plugin/agent_runtime/teacher_documents.py", {})
    assert documents.requested_document_formats({"prompt": prompt, "executionMode": mode}) == expected


def test_upstream_teacher_documents_reach_the_real_private_download_handler(setup, monkeypatch, tmp_path):
    import io
    import zipfile

    from flask import Flask, request, send_file
    from werkzeug.http import parse_options_header

    session, thread, _ = setup
    thread.dojo_id, thread.module_index = 2, 0
    package = "harness_fixture"
    docs = importlib.import_module(package + ".agent_runtime.teacher_documents")
    files = importlib.import_module(package + ".agent_runtime.files")
    upstream = importlib.import_module(package + ".agent_runtime.upstream_turn")
    monkeypatch.setattr(files, "_storage_root", lambda: tmp_path)

    class ScopeError(ValueError):
        pass

    class PermanentJobError(RuntimeError):
        pass

    def require_teacher(owner):
        if owner.id != 7:
            raise ScopeError("Teacher permission required")

    permitted_courses = {2}

    def build_scope(owner, *, role, dojo_id, module_index):
        assert role == "teacher"
        if owner.id != 7 or dojo_id not in permitted_courses:
            raise ScopeError("Course not found")

    monkeypatch.setitem(sys.modules, package + ".api.v1.teaching", SimpleNamespace(
        _require_teacher=require_teacher, _teacher_dojos=lambda _owner: [SimpleNamespace(reference_id="science")],
    ))
    monkeypatch.setitem(sys.modules, package + ".agent_runtime.scope", SimpleNamespace(build_scope=build_scope))

    approved_source = {"id": "handout", "type": "material", "revisionId": "r1", "sha256": "1" * 64}
    payload = {
        "chatBackend": "upstream", "executionMode": "auto",
        "prompt": "基于已授权讲义制作蒸发教案，交付DOCX和Markdown文件",
        "context": {"platformFacts": {"scope": {"dojoId": 2, "moduleIndex": 0}, "availableCourses": [{"referenceId": "science"}]}},
        "sourceRefs": [approved_source],
        "sourceMaterials": [dict(approved_source, title="蒸发讲义", excerpts=["记录水量与实际观察"])],
        "materialContext": {"complete": True, "expectedMaterialCount": 1},
    }
    payload["materialDossier"] = {
        "coverage": payload["materialContext"],
        "materials": payload["sourceMaterials"],
    }
    job = add_job(session, "document-job", kind="agent.chat", dojo_id=2, module_index=0, payload=payload)
    existing_message = Message(id=8, thread_id=thread.id, user_id=7, role="assistant", metadata_json={})
    session.add(existing_message)
    session.commit()
    allowed_ids = {"handout"}

    class MaterialContextError(ValueError):
        pass

    def material_context(*, owner_id, dojo_id, source_refs, require_complete):
        assert (owner_id, dojo_id, require_complete) == (7, 2, True)
        if any(ref["id"] not in allowed_ids for ref in source_refs):
            raise MaterialContextError("unavailable synthetic material")
        return {"sourceRefs": [approved_source]}

    wire_requests = []
    document_title = "蒸发／冷水/温水\\比较\u202e Pokémon"
    download_stem = "蒸发-冷水-温水-比较 Pokémon"

    def invoke_turn(body, *, encoded):
        assert json.loads(encoded) == body
        wire_requests.append(body)
        context = json.loads(body["messages"][1]["content"])
        assert context["requestedDocumentFormats"] == ["docx", "md"]
        assert context["sourceRefs"] == [approved_source]
        assert "普通教学文档" in body["messages"][0]["content"]
        return {
            "model": "synthetic-harness",
            "usage": {"prompt_tokens": 7, "completion_tokens": 11},
            "text": json.dumps({
                "answer": "模型声称的链接不作为交付地址 https://example.invalid/file",
                "document": {"title": document_title, "sections": [{
                    "heading": "观察目标",
                    "paragraphs": ["记录同样大小的碟子中温水与冷水的变化。", "HTML 字符示例 <b>是文本</b>。"],
                }]},
                "proposal": {"tool": "course.create", "arguments": {"name": "不会自动执行"}},
            }, ensure_ascii=False),
        }

    wanted = {"_runtime_request_body", "_runtime_json_bytes", "_upstream_teacher_result", "_invoke_agent_runtime",
              "_require_upstream_teacher_scope", "_require_teacher_document_sources", "_persist_result", "_agent_answer"}
    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in wanted]
    facts = importlib.import_module(package + ".agent_runtime.teacher_model_context")
    job_namespace = {
        "__name__": package + ".agent_runtime.test_document_job",
        "__package__": package + ".agent_runtime",
        "json": json, "request_body": upstream.request_body, "result_object": upstream.result_object,
        "teacher_model_payload": facts.teacher_model_payload, "scrub_payload": lambda value, **_: value,
        "redact_text": lambda value, limit: value[:limit], "requested_document_formats": docs.requested_document_formats,
        "document_deliverables": docs.document_deliverables, "DOCUMENT_INSTRUCTION": docs.DOCUMENT_INSTRUCTION,
        "upstream_enabled": lambda: True, "invoke_turn": invoke_turn, "UpstreamTurnError": upstream.UpstreamTurnError,
        "RuntimeJobError": reliability.RuntimeJobError, "PermanentJobError": PermanentJobError,
        "MaterialContextError": MaterialContextError, "Users": User, "TeachingAgentThreads": Thread,
        "build_course_material_context": material_context, "_record_runtime_dispatch": lambda *args: None,
        "restore_input_cache": lambda *args, **kwargs: None, "prepared_input": lambda _job: {"payload": payload},
        "validated_generation_options": lambda *args: None, "_validated_tool_proposals": lambda *args: [],
        "persist_agent_deliverables": files.persist_agent_deliverables, "public_agent_file": files.public_agent_file,
        "_agent_message_for_job": lambda _job: existing_message,
        "ConversationCards": SimpleNamespace(query=SimpleNamespace(filter_by=lambda **_: SimpleNamespace(all=lambda: []))),
    }
    exec(compile(tree, "jobs.py", "exec"), job_namespace)

    reply = "请补充这份教案适合的年级。"
    clarification = json.dumps({"answer": reply, "document": None}, ensure_ascii=False)
    teacher_result = job_namespace["_upstream_teacher_result"]
    with pytest.raises(reliability.RuntimeJobError, match="未返回文档结构") as error:
        teacher_result({**payload, "executionMode": "execute"}, clarification)
    assert error.value.category == "quality"
    for mode in ("auto", "ask"):
        clarification_result = teacher_result({**payload, "executionMode": mode}, clarification)
        assert clarification_result["answer"] == reply
        assert "deliverables" not in clarification_result
    assert teacher_result({**payload, "executionMode": "auto"}, clarification)["executionMode"] == "ask"

    result = job_namespace["_invoke_agent_runtime"](job, {}, payload)
    assert result["model"]["usage"]["completion_tokens"] == 11
    assert "toolProposals" not in result["result"]
    stored = job_namespace["_persist_result"](job, result["result"])
    assert stored["requiresAction"] is False
    assert [file["format"] for file in stored["files"]] == ["docx", "md"]
    assert stored["answer"] == "教学文档草稿已生成，可通过下方链接下载。"
    assert stored["materialModelCoverage"] == json.loads(wire_requests[0]["messages"][-1]["content"])["materialModelCoverage"]
    assert existing_message.metadata_json["materialModelCoverage"] == stored["materialModelCoverage"]
    assert job_namespace["_persist_result"](job, result["result"])["files"] == stored["files"]
    job.result = stored
    session.commit()
    public_files = existing_message.metadata_json["files"]
    assert all("storageKey" not in file for file in public_files)

    tree = ast.parse((ROOT / "dojo_plugin/api/v1/teaching.py").read_text())
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_job_for_user"
                 or isinstance(node, ast.ClassDef) and node.name == "TeachingJobFile"]
    endpoint = tree.body[-1]
    endpoint.decorator_list = []
    endpoint.body[0].decorator_list = []
    route_namespace = {
        "Resource": object, "TeachingJobs": Job, "ScopeError": ScopeError,
        "_current_user": lambda: SimpleNamespace(id=int(request.headers["Fixture-User"])),
        "public_agent_file": files.public_agent_file, "agent_file_path": files.agent_file_path,
        "send_file": send_file, "_error": lambda _message, status, **_: ("missing", status),
    }
    exec(compile(tree, "teaching.py", "exec"), route_namespace)
    app = Flask(__name__)
    app.add_url_rule("/pwncollege_api/v1/teaching/jobs/<job_id>/files/<file_id>",
                     view_func=route_namespace["TeachingJobFile"]().get)
    browser = app.test_client()
    for public in public_files:
        owner_download = browser.get(public["downloadUrl"], headers={"Fixture-User": "7"})
        assert owner_download.status_code == 200
        assert owner_download.headers["Cache-Control"] == "private, no-store"
        disposition, params = parse_options_header(owner_download.headers["Content-Disposition"])
        assert disposition == "attachment"
        assert params["filename"] == public["filename"] == f"{download_stem}.{public['format']}"
        assert public["title"] == document_title
        assert browser.get(public["downloadUrl"], headers={"Fixture-User": "8"}).status_code == 404
        if public["format"] == "docx":
            with zipfile.ZipFile(io.BytesIO(owner_download.data)) as archive:
                docx_text = archive.read("word/document.xml").decode()
                assert "观察目标" in docx_text
                assert document_title in docx_text
                assert not any("vba" in name.lower() for name in archive.namelist())
        else:
            assert "## 观察目标" in owner_download.text
            assert document_title.replace("\\", "\\\\") in owner_download.text
            assert "&lt;b&gt;是文本&lt;/b&gt;" in owner_download.text

    allowed_ids.clear()
    with pytest.raises(PermanentJobError, match="引用资料权限或版本"):
        job_namespace["_invoke_agent_runtime"](job, {}, payload)
    with pytest.raises(PermanentJobError, match="引用资料权限或版本"):
        job_namespace["_persist_result"](job, result["result"])
    permitted_courses.clear()
    with pytest.raises(ScopeError, match="Course not found"):
        job_namespace["_invoke_agent_runtime"](job, {}, payload)
    assert len(wire_requests) == 1
    with pytest.raises(ValueError, match="普通教学文本"):
        docs.document_deliverables(
            {"title": "文档", "sections": [{"heading": "示例", "paragraphs": ["<script>placeholder</script>"]}]},
            ("md",),
        )


def test_ordinary_teaching_jobs_require_configured_course_and_owned_typed_targets(monkeypatch):
    turn = load("dojo_plugin/agent_runtime/upstream_turn.py", {})

    tree = ast.parse((ROOT / "dojo_plugin/agent_runtime/jobs.py").read_text())
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                 and node.name == "_ordinary_teaching_job_scope"]

    def table(**row):
        def filter_by(**criteria):
            return SimpleNamespace(first=lambda: SimpleNamespace(**row) if all(
                row.get(key) == value for key, value in criteria.items()
            ) else None)
        return SimpleNamespace(query=SimpleNamespace(filter_by=filter_by))

    namespace = {
        "ordinary_teaching_course": turn.ordinary_teaching_course, "re": re, "upstream_enabled": lambda: True,
        "Users": table(id=7, type="user"), "DojoAdmins": table(dojo_id=2, user_id=7),
        "TeachingCandidateSets": table(id="candidate", owner_id=7, dojo_id=2, kind="lesson-plan",
                                       self_workspace_id=None),
        "TeachingArtifacts": table(id="slide", owner_id=7, dojo_id=2, artifact_type="slide-deck",
                                    self_workspace_id=None),
        "TeachingMaterials": table(id="material", owner_id=7, dojo_id=2, filename="handout.txt", status="READY"),
        "TeachingMaterialRevisions": table(id="revision", material_id="material", storage_key="stored",
                                            status="READY", sha256="a" * 64),
    }
    exec(compile(tree, "jobs.py", "exec"), namespace)
    scope = namespace["_ordinary_teaching_job_scope"]
    candidate = {"artifactType": "lesson-plan", "candidateSetId": "candidate"}
    material = {"materialId": "material", "revisionId": "revision", "storageKey": "stored"}
    slide = {"artifactType": "slide-deck", "artifactId": "slide", "instruction": "只润色第1页措辞：表述更清楚"}
    create = SimpleNamespace(kind="candidate.generate", owner_id=7, dojo_id=2)
    enrich = SimpleNamespace(kind="material.enrich", owner_id=7, dojo_id=2)
    revise = SimpleNamespace(kind="artifact.revise", owner_id=7, dojo_id=2)
    monkeypatch.delenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", raising=False)
    assert scope(create, candidate) is None
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "2, -5")
    # Dojos use signed 32-bit identifiers. The sign is part of the course identity.
    assert turn.ordinary_teaching_course(-5) and not turn.ordinary_teaching_course(5)
    assert scope(create, candidate) == "candidate-plan"
    assert scope(enrich, material) == "material-summary"
    assert scope(revise, slide) == "slide-wording"
    assert scope(create, {**candidate, "workspaceId": "personal"}) is None
    assert scope(create, {**candidate, "artifactType": "simulation"}) is None
    assert scope(enrich, {**material, "storageKey": "other-version"}) is None
    assert scope(revise, {**slide, "instruction": "修改所有页面布局"}) is None
    namespace["DojoAdmins"] = table(dojo_id=3, user_id=7)
    assert scope(create, candidate) is None

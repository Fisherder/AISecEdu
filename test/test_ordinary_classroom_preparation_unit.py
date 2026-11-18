"""Exercise the Flask handler and its persistence against synthetic ordinary slides."""

import ast
import copy
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock

import pytest
import requests
from flask import Flask, request
from sqlalchemy import create_engine, Column, Integer, String, JSON, DateTime
from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "dojo_plugin/api/v1/teaching.py"
RUNTIME = ROOT / "dojo_plugin/agent_runtime"
PATH = "/threads/thread-1/messages/9/tool-proposals/0/prepare-classroom"
Base = declarative_base()


class Thread(Base):
    __tablename__ = "thread"
    id = Column(String, primary_key=True)
    user_id = Column(Integer)
    status = Column(String)
    dojo_id = Column(Integer)
    module_index = Column(Integer)


class Job(Base):
    __tablename__ = "job"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    thread_id = Column(String)
    kind = Column(String)
    status = Column(String)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    payload = Column(JSON)


class Message(Base):
    __tablename__ = "message"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    thread_id = Column(String)
    role = Column(String)
    metadata_json = Column(JSON)


class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True)


class Artifact(Base):
    __tablename__ = "artifact"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    artifact_type = Column(String)
    status = Column(String)
    self_workspace_id = Column(String)
    current_revision = Column(Integer)
    title = Column(String)


class Revision(Base):
    __tablename__ = "revision"
    id = Column(String, primary_key=True)
    artifact_id = Column(String)
    revision = Column(Integer)
    content = Column(JSON)
    content_hash = Column(String)


class Session(Base):
    __tablename__ = "classroom_session"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    thread_id = Column(String)
    title = Column(String)
    status = Column(String)
    state = Column(JSON)


class Action(Base):
    __tablename__ = "action"
    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer)
    thread_id = Column(String)
    action_type = Column(String)
    risk_level = Column(String)
    target_type = Column(String)
    target_id = Column(String)
    status = Column(String)
    idempotency_key = Column(String, unique=True)
    request_json = Column(JSON)
    result = Column(JSON)
    completed = Column(DateTime)


class ScopeError(ValueError):
    pass


def _source(path, names, namespace, *, all_functions=False):
    selected = []
    for node in ast.parse(path.read_text()).body:
        if getattr(node, "name", None) in names or (
            all_functions and isinstance(node, ast.FunctionDef)
        ) or (all_functions and isinstance(node, ast.Assign)):
            if isinstance(node, ast.ClassDef):
                node.decorator_list = []
                for child in node.body:
                    if isinstance(child, ast.FunctionDef):
                        child.decorator_list = []
            selected.append(node)
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), "exec"), namespace)


def _fixture_content():
    return {"lesson": {"title": "植物生长", "artifacts": [{
        "type": "slide",
        "outline": {"type": "slide", "title": "观察叶片"},
        "content": {"studio": {
            "page": {"id": "leaves", "schema": "courseware-page-v2", "layout": {},
                     "visual": {"kind": "comparison"}, "beats": []},
            "assets": [],
        }},
    }]}}


@pytest.fixture
def prepared(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = scoped_session(sessionmaker(bind=engine))
    for model in (Thread, Job, Message, User, Artifact, Revision, Session, Action):
        monkeypatch.setattr(model, "query", db.query_property(), raising=False)
    actor = User(id=1)
    submission = SimpleNamespace(actor_id=1, permitted=True, course_enabled=True, decision="APPROVED")
    content = _fixture_content()
    hashing = {"hashlib": hashlib, "json": json}
    _source(RUNTIME / "artifacts.py", {"content_hash"}, hashing)
    digest = hashing["content_hash"](content)
    proposal = {
        "tool": "classroom.prepare", "requiresConfirmation": True,
        "arguments": {"artifactId": "published", "title": "植物课堂", "expectedRevision": 3, "contentHash": digest},
        "boundScope": {"dojoId": -21, "moduleIndex": 0},
    }
    db.add_all([
        actor, User(id=2),
        Thread(id="thread-1", user_id=1, status="ACTIVE", dojo_id=-21, module_index=0),
        Job(id="job-9", owner_id=1, thread_id="thread-1", status="SUCCEEDED", kind="agent.chat",
            dojo_id=-21, module_index=0, payload={"chatBackend": "upstream"}),
        Message(id=9, thread_id="thread-1", user_id=1, role="assistant",
                metadata_json={"jobId": "job-9", "pending": False, "toolProposals": [proposal]}),
        Artifact(id="published", owner_id=1, dojo_id=-21, module_index=0, status="PUBLISHED",
                 artifact_type="slide-deck", current_revision=3, title="植物生长"),
        Revision(id="revision-3", artifact_id="published", revision=3, content=content, content_hash=digest),
    ])
    db.commit()

    def require_teacher(_):
        if not submission.permitted:
            raise ScopeError("Teacher permission revoked")

    def scope(_, role, dojo_id, module_index):
        assert role == "teacher"
        require_teacher(None)
        return SimpleNamespace(dojo_id=dojo_id, module_index=module_index)

    def render(url, **kwargs):
        assert url == "http://synthetic-render.invalid/api/integration/classrooms/render"
        outgoing = kwargs["json"]
        classroom_id = outgoing["classroomId"]
        assert outgoing == {"classroomId": classroom_id, "mode": "ordinary-static", "lesson": content["lesson"]}
        assert kwargs["headers"]["X-AISecEdu-Service-Token"] == "fixture-key"
        assert kwargs["allow_redirects"] is False
        assert db.query(Session).count() == 0
        response = MagicMock(status_code=200)
        response.json.return_value = {"success": True, "result": {
            "stage": {"id": classroom_id, "name": "植物课堂"},
            "scenes": [{"id": "scene1", "stageId": classroom_id, "type": "slide",
                        "content": {"type": "slide", "canvas": {"elements": [{"type": "text"}]}}}],
        }}
        return response

    renderer = MagicMock(side_effect=render)
    namespace = dict(
        __name__="dojo_plugin.api.v1.teaching", __package__="dojo_plugin.api.v1",
        re=re, json=json, hashlib=hashlib, datetime=datetime, content_hash=hashing["content_hash"], requests=SimpleNamespace(
            post=renderer, RequestException=requests.RequestException,
        ),
        ScopeError=ScopeError, Resource=object, request=request,
        db=SimpleNamespace(session=db), TeachingAgentThreads=Thread, TeachingJobs=Job,
        TeachingAgentMessages=Message, TeachingArtifacts=Artifact, TeachingArtifactRevisions=Revision,
        Users=User, TeachingSessions=Session, TeachingAgentActions=Action,
        ordinary_teaching_course=lambda course_id: submission.course_enabled and course_id == -21,
        _current_user=lambda: db.get(User, submission.actor_id),
        _require_teacher=require_teacher, build_scope=scope, _body=lambda: request.get_json(),
        record_execution=MagicMock(), teaching_id=lambda prefix: prefix + "_synthetic",
        get_trace_id=lambda: "synthetic", _timestamp=lambda value: value.isoformat(),
        config=SimpleNamespace(AGENT_RUNTIME_INTERNAL_URL="http://synthetic-render.invalid/",
                               AGENT_RUNTIME_SERVICE_SECRET="fixture-key"),
    )
    _source(RUNTIME / "classroom_preparation.py", set(), namespace, all_functions=True)
    _source(RUNTIME / "approval_journal.py", {
        "ApprovalJournalError", "proposal_request", "request_reference", "_check_reference", "require_approved",
    }, namespace)
    namespace["recorded_decision"] = lambda *_: ({"decision": submission.decision,
        "requestSha256": approval["sha256"]} if submission.decision else None)
    approval = namespace["request_reference"](namespace["proposal_request"]("thread-1", 9, 0, proposal))
    _source(API, {"_ok", "_error", "_supplied_idempotency", "_render_ordinary_classroom",
                  "_ordinary_classroom_scope", "TeachingToolPrepareClassroom", "_classroom_preparation_key",
                  "_project_classroom_preparation_receipts"}, namespace)
    metadata = ModuleType("dojo_plugin.agent_runtime.tool_plan")
    metadata.message_metadata = lambda item: item.metadata_json
    monkeypatch.setitem(sys.modules, metadata.__name__, metadata)
    for name, members in {
        "dojo_plugin.models": {"TeachingArtifacts": Artifact},
        "dojo_plugin.agent_runtime.classroom_preparation": {"published_classroom_deck": namespace["published_classroom_deck"]},
        "dojo_plugin.agent_runtime.upstream_turn": {"ordinary_teaching_course": namespace["ordinary_teaching_course"]},
    }.items():
        module = ModuleType(name)
        vars(module).update(members)
        monkeypatch.setitem(sys.modules, name, module)
    lookup = {"__name__": "dojo_plugin.agent_runtime.classroom_requests", "__package__": "dojo_plugin.agent_runtime"}
    _source(RUNTIME / "classroom_requests.py", {"find_published_deck", "current_classroom_pin"}, lookup)

    app = Flask(__name__)
    handler = namespace["TeachingToolPrepareClassroom"].post
    # Match the route from the production decorator and invoke its actual method body.
    declaration = next(node for node in ast.parse(API.read_text()).body
                       if isinstance(node, ast.ClassDef) and node.name == "TeachingToolPrepareClassroom")
    app.add_url_rule(ast.literal_eval(declaration.decorator_list[0].args[0]), view_func=lambda **args: handler(None, **args), methods=["POST"])
    yield SimpleNamespace(db=db, submission=submission, renderer=renderer, client=app.test_client(),
                          approval=approval, content=content, helper=namespace["published_classroom_deck"], render=render,
                          execution_receipt=namespace["record_execution"],
                          project_receipts=namespace["_project_classroom_preparation_receipts"],
                          find_deck=lookup["find_published_deck"], current_pin=lookup["current_classroom_pin"])
    db.remove()
    engine.dispose()


def test_approved_snapshot_creates_one_ready_teaching_session(prepared):
    request_body = {"approvalRequest": prepared.approval}
    response = prepared.client.post(PATH, json=request_body)
    assert response.status_code == 201
    assert response.json["data"] == {"sessionId": "session_synthetic", "artifactId": "published",
                                     "artifactRevision": 3, "deduplicated": False}
    row = prepared.db.query(Session).one()
    assert (row.status, row.title, row.dojo_id, row.module_index) == ("READY", "植物课堂", -21, 0)
    assert row.state["scenes"][0]["id"] == "scene1"
    assert row.state["artifactContentHash"] == prepared.db.query(Revision).one().content_hash
    action = prepared.db.query(Action).one()
    assert action.result["sessionId"] == row.id
    assert action.request_json["approvalRequest"] == prepared.approval
    scene_bytes = json.dumps(row.state["scenes"], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    assert action.request_json["ordinaryScenesHash"] == hashlib.sha256(scene_bytes).hexdigest()
    assert action.request_json["ordinaryImagePages"] == []
    prepared.execution_receipt.assert_called_once_with(action, "committed", prepared.approval)
    response = prepared.client.post(PATH, json=request_body)
    assert response.status_code == 200 and response.json["data"]["deduplicated"]
    prepared.renderer.assert_called_once()

    message = prepared.db.query(Message).one()
    viewed = {message.id: {**message.metadata_json, "toolProposalApprovalRequests": {"0": prepared.approval}}}
    thread = prepared.db.query(Thread).one()
    prepared.project_receipts(thread, viewed)
    assert viewed[message.id]["toolExecutionResults"]["0"] == {
        "tool": "classroom.prepare", "status": "SUCCEEDED", "sessionId": row.id,
        "artifactId": "published", "artifactRevision": 3,
    }
    assert "toolExecutionResults" not in message.metadata_json
    mismatched = {message.id: {**message.metadata_json, "toolProposalApprovalRequests": {
        "0": {**prepared.approval, "sha256": "different"},
    }}}
    prepared.project_receipts(thread, mismatched)
    assert "toolExecutionResults" not in mismatched[message.id]


@pytest.mark.parametrize(("case", "expected", "code"), [
    ("extra-operation", 400, "INVALID_REQUEST"),
    ("array-body", 400, "INVALID_REQUEST"),
    ("other-user", 404, "NOT_FOUND"),
    ("not-opted-in", 404, "NOT_FOUND"),
    ("stale-artifact", 409, "CLASSROOM_REVISION_CONFLICT"),
    ("content-changed", 409, "CLASSROOM_REVISION_CONFLICT"),
    ("scope-mismatch", 409, "CLASSROOM_SCOPE_CONFLICT"),
    ("approval-missing", 409, "APPROVAL_REQUIRED"),
    ("rejected", 409, "APPROVAL_REJECTED"),
    ("wrong-receipt", 409, "APPROVAL_REQUEST_CHANGED"),
    ("malformed-render", 502, "CLASSROOM_RENDER_FAILED"),
    ("revoked-during-render", 404, "NOT_FOUND"),
])
def test_denials_preserve_empty_database(prepared, case, expected, code):
    body = {"approvalRequest": prepared.approval}
    if case == "extra-operation":
        body.update(artifactId="untrusted", title="untrusted")
    elif case == "array-body":
        body = [body]
    elif case == "other-user":
        prepared.submission.actor_id = 2
    elif case == "not-opted-in":
        prepared.submission.course_enabled = False
    elif case == "stale-artifact":
        prepared.db.query(Artifact).one().current_revision = 4
    elif case == "content-changed":
        revision = prepared.db.query(Revision).one()
        revision.content = copy.deepcopy(revision.content)
        revision.content["lesson"]["title"] = "内容已变化"
    elif case == "scope-mismatch":
        prepared.db.query(Thread).one().module_index = 1
    elif case == "approval-missing":
        prepared.submission.decision = None
    elif case == "rejected":
        prepared.submission.decision = "REJECTED"
    elif case == "wrong-receipt":
        body = {"approvalRequest": {**prepared.approval, "sha256": "wrong"}}
    elif case == "malformed-render":
        prepared.renderer.side_effect = None
        prepared.renderer.return_value = MagicMock(status_code=200)
        prepared.renderer.return_value.json.return_value = {"success": True, "result": {"scenes": []}}
    else:
        def revoke(*args, **kwargs):
            response = prepared.render(*args, **kwargs)
            prepared.submission.permitted = False
            return response
        prepared.renderer.side_effect = revoke
    prepared.db.commit()
    response = prepared.client.post(PATH, json=body)
    assert (response.status_code, response.json["errorCode"]) == (expected, code)
    assert prepared.db.query(Session).count() == prepared.db.query(Action).count() == 0
    if case not in {"malformed-render", "revoked-during-render"}:
        prepared.renderer.assert_not_called()


@pytest.mark.parametrize("disallowed", ["draft", "personal", "other-owner", "other-chapter", "interactive", "check", "active-canvas"])
def test_published_deck_admission(prepared, disallowed):
    assert prepared.helper(1, -21, 0, "published")
    artifact = prepared.db.query(Artifact).one()
    revision = prepared.db.query(Revision).one()
    content = copy.deepcopy(revision.content)
    slide = content["lesson"]["artifacts"][0]
    page = slide["content"]["studio"]["page"]
    if disallowed == "draft":
        artifact.status = "DRAFT"
    elif disallowed == "personal":
        artifact.self_workspace_id = "personal"
    elif disallowed == "other-owner":
        artifact.owner_id = 2
    elif disallowed == "other-chapter":
        artifact.module_index = 1
    elif disallowed == "interactive":
        slide["type"] = "interactive"
    elif disallowed == "check":
        page["check"] = {"privateAnswer": "fixture"}
    else:
        slide["content"]["elements"] = [{"type": "video"}]
    revision.content = content
    prepared.db.commit()
    assert prepared.helper(1, -21, 0, "published") is None


def test_find_published_deck_requires_unique_title_in_the_actual_course_module(prepared):
    original = prepared.find_deck("植物生长", 1, -21, 0)
    assert original["artifactId"] == "published"
    assert prepared.find_deck("植物生长", 2, -21, 0) is None
    assert prepared.find_deck("植物生长", 1, -21, 1) is None
    prepared.db.add_all([
        Artifact(id="other-module", owner_id=1, dojo_id=-21, module_index=1, status="PUBLISHED",
                 artifact_type="slide-deck", current_revision=3, title="植物生长"),
        Artifact(id="other-owner", owner_id=2, dojo_id=-21, module_index=0, status="PUBLISHED",
                 artifact_type="slide-deck", current_revision=3, title="植物生长"),
    ])
    prepared.db.commit()
    assert prepared.find_deck("植物生长", 1, -21, 0) == original
    prepared.db.add(Artifact(id="duplicate", owner_id=1, dojo_id=-21, module_index=0, status="PUBLISHED",
                            artifact_type="slide-deck", current_revision=3, title="植物生长"))
    prepared.db.commit()
    assert prepared.find_deck("植物生长", 1, -21, 0) is None
    assert prepared.find_deck("published", 1, -21, 0) == original
    prepared.db.query(Artifact).filter_by(id="duplicate").one().title = "published"
    prepared.db.commit()
    assert prepared.find_deck("published", 1, -21, 0) == original


def test_native_lesson_from_an_older_unwrapped_revision_is_recognized(prepared):
    revision = prepared.db.query(Revision).one()
    revision.content = revision.content["lesson"]
    prepared.db.commit()
    assert prepared.helper(1, -21, 0, "published")[1].id == revision.id


def test_worker_validates_the_accepted_deck_before_journaling_the_approval(prepared):
    job = prepared.db.query(Job).one()
    pin = prepared.find_deck("published", 1, -21, 0)
    job.payload = {**job.payload, "classroomPreparation": pin}
    names = {"_validated_tool_proposals", "_upstream_teacher_result",
             "AGENT_TOOL_SCHEMAS", "UPSTREAM_APPROVED_TEACHING_TOOLS"}
    namespace = dict(current_classroom_pin=prepared.current_pin, request_payload=lambda job: job.payload,
                     scrub_payload=lambda value, key: value, result_object=json.loads)
    _source(RUNTIME / "classroom_requests.py", {"classroom_proposal_result"}, namespace)
    tree = ast.parse((RUNTIME / "jobs.py").read_text())
    tree.body = [node for node in tree.body if getattr(node, "name", None) in names or
                 (isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) in names)]
    exec(compile(tree, "jobs.py", "exec"), namespace)
    model = {"tool": "classroom.prepare", "arguments": {"artifactId": "selected-deck",
             "title": "unexpected title", "expectedRevision": 400, "contentHash": "wrong"}}
    result = namespace["_upstream_teacher_result"](job.payload, json.dumps({"proposal": model}))
    proposal, = namespace["_validated_tool_proposals"](job, result)
    assert proposal["arguments"] == pin
    assert proposal["requiresConfirmation"] is True
    assert proposal["boundScope"] == {"dojoId": -21, "moduleIndex": 0}
    prepared.db.query(Artifact).one().status = "DRAFT"
    prepared.db.commit()
    assert namespace["_validated_tool_proposals"](job, result) == []


@pytest.mark.parametrize("changed", ["owner", "course", "module", "version", "hash"])
def test_current_classroom_pin_rechecks_original_owner_scope_and_recorded_revision(prepared, changed):
    pin = prepared.find_deck("published", 1, -21, 0)
    job = prepared.db.query(Job).one()
    payload = {"classroomPreparation": pin}
    assert prepared.current_pin(job, payload) == pin
    artifact = prepared.db.query(Artifact).one()
    if changed == "owner":
        artifact.owner_id = 2
    elif changed == "course":
        artifact.dojo_id = -22
    elif changed == "module":
        artifact.module_index = 1
    elif changed == "version":
        artifact.current_revision = 4
    else:
        prepared.db.query(Revision).one().content_hash = "0" * 64
    prepared.db.commit()
    assert prepared.current_pin(job, payload) is None

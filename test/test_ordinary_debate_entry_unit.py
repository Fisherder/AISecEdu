"""Exercise ordinary debate entry points with frozen synthetic teacher records."""

import datetime
import json
import sys
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import JSON, Column, Integer, String

from test_ordinary_debate_unit import Base, DojoAdmins, DojoModules, Dojos, flow, load_source


class TeachingMaterials(Base):
    __tablename__ = "entry_materials"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer)
    dojo_id = Column(Integer)
    status = Column(String)


class TeachingMaterialRevisions(Base):
    __tablename__ = "entry_material_revisions"
    id = Column(String, primary_key=True)
    material_id = Column(String)
    revision = Column(Integer)
    sha256 = Column(String)


class TeachingAgentMessages(Base):
    __tablename__ = "entry_messages"
    id = Column(Integer, primary_key=True)
    thread_id = Column(String)
    user_id = Column(Integer)
    role = Column(String)
    content = Column(String)
    metadata_json = Column(JSON)


REQUEST = "请生成三套普通课堂辩论候选方案：是否应延长图书馆开放时间？"
REASON = "teacher_requested_ordinary_debate"
OLD = {"type": "material", "id": "private-handout", "revisionId": "revision-old", "sha256": "a" * 64}
LATEST = {**OLD, "revisionId": "revision-new", "sha256": "b" * 64}
SECOND = {"type": "material", "id": "private-survey", "revisionId": "revision-survey", "sha256": "c" * 64}


@pytest.fixture
def entry(flow, monkeypatch):
    load_source("materials", vars(flow))
    load_source("teacher_documents", vars(flow))
    mode = {}
    load_source("workbench", mode)
    package = "debate_entry_fixture"
    monkeypatch.setitem(sys.modules, package + ".agent_runtime.workbench", SimpleNamespace(**mode))
    monkeypatch.setitem(sys.modules, package + ".agent_runtime", SimpleNamespace(teacher_dsh_chat=SimpleNamespace(admit=lambda *_: None)))
    record_generation = MagicMock()
    monkeypatch.setitem(sys.modules, package + ".agent_runtime.generation_events",
                        SimpleNamespace(record_generation=record_generation))
    flow.session.add_all([
        Dojos(dojo_id=20, modules=[DojoModules(module_index=0)]),
        DojoAdmins(dojo_id=20, user_id=flow.user.id),
        TeachingMaterials(id=LATEST["id"], owner_id=flow.user.id, dojo_id=19, status="READY"),
        TeachingMaterials(id=SECOND["id"], owner_id=flow.user.id, dojo_id=19, status="INDEXING"),
        TeachingMaterials(id="historical-material", owner_id=flow.user.id, dojo_id=19, status="READY"),
        TeachingMaterials(id="other-course", owner_id=flow.user.id, dojo_id=20, status="READY"),
        TeachingMaterials(id="other-owner", owner_id=81, dojo_id=19, status="READY"),
        *[TeachingMaterialRevisions(id=ref["revisionId"], material_id=ref["id"], revision=index,
                                   sha256=ref["sha256"]) for index, ref in enumerate((OLD, LATEST, SECOND), 1)],
    ])
    flow.session.commit()

    def create_set(**values):
        row = flow.TeachingCandidateSets(id=uuid.uuid4().hex, status="GENERATING", **values)
        flow.session.add(row)
        flow.session.flush()
        return row

    def enqueue(*, commit=True, publish=True, priority=None, **values):
        assert commit is publish
        row = flow.TeachingJobs(status="QUEUED", stage="QUEUED", progress=0, priority=priority, **values)
        flow.session.add(row)
        flow.session.flush()
        if commit:
            flow.session.commit()
        return row, True

    def source_set_for_user(set_id, user):
        return flow.TeachingCandidateSets.query.filter_by(id=set_id, owner_id=user.id).one()

    def thread_for_owner(thread_id, user):
        thread = flow.TeachingAgentThreads.query.filter_by(id=thread_id, user_id=user.id).one()
        thread.title, thread.phase, thread.context = "校园讨论", "design", {"staff": "PRIVATE-THREAD"}
        return thread

    def selected_option(*_args, **_kwargs):
        return {
            "bundle": {"artifactType": "debate", "sourceRefs": [OLD]},
            "option": {"id": "option-1", "title": "开放时间", "rewrittenPrompt": "围绕图书馆的开放时间设计课堂讨论。"},
            "selection": {"status": "SELECTED"}, "metadata": {},
            "sourcePayload": {"constraints": {"extra": "PRIVATE-OPTION"}, "allowDegraded": True},
            "sourceMessage": SimpleNamespace(id=10), "sourceJob": SimpleNamespace(id="option-job"),
        }

    request = SimpleNamespace(headers={"Idempotency-Key": "derive-http"}, body={})
    route = dict(vars(flow), ordinary_project_queue=SimpleNamespace(configured=lambda: False))
    route.update(
        __package__=package + ".api.v1",
        Resource=object, request=request, _body=lambda: request.body, _current_user=lambda: flow.user,
        teaching_namespace=SimpleNamespace(route=lambda _: lambda resource: resource),
        authed_only=lambda handler: handler,
        datetime=datetime, uuid=uuid, MAX_MESSAGE_CHARS=16_000, MAX_AGENT_CONTEXT_BYTES=65_536,
        MAX_AGENT_LOOP_STEPS=8, DEFAULT_THREAD_TITLES=(), HARNESS_VERSION=1,
        ORDINARY_DEBATE_REASON=REASON, ORDINARY_PLAN_REASON="teacher_requested_ordinary_lesson_plan",
        GENERATION_OPTION_ARTIFACT_TYPES={"debate", "lesson-plan"},
        ordinary_material_turn=SimpleNamespace(requested=lambda _: False),
        debate_derived_prompt=flow.derived_prompt,
        _require_teacher=MagicMock(), _thread_for_owner=thread_for_owner,
        _error=lambda error, status=400, **extra: ({"error": str(error), **extra}, status),
        _ok=lambda result, status: (result, status),
        _thread_view=lambda *_args, **_kwargs: {},
        job_view=lambda job: {"id": job.id, "kind": job.kind, "payload": job.payload},
        candidate_set_view=lambda candidate_set: {"id": candidate_set.id},
        prepare_turn_submission=lambda *_: (None, []),
        submission_fingerprint=lambda _: "teacher-submission",
        scrub_payload=lambda payload: payload,
        _json_size=lambda payload: len(json.dumps(payload).encode()),
        _message_attachment_views=lambda *_: [],
        _thread_attachment_entries=lambda _: [{"id": "historical-material"}],
        unreferenced_attachment_refs=lambda refs: [{**ref, "type": "material"} for ref in refs],
        _mark_thread_attachments_consumed=MagicMock(),
        _material_dependency_ids=lambda _owner, refs: ["review-material"] if SECOND in refs else [],
        session_history_replayable=MagicMock(return_value=True), replay_session_messages=lambda _: [],
        _teacher_agent_history_context=lambda *_: {"conversation": ["PRIVATE-HISTORY"], "requestProvenance": {}},
        _teacher_agent_context=MagicMock(return_value={"staff": "PRIVATE-PLATFORM"}),
        _timestamp=lambda _: "2026-11-23T00:00:00Z",
        _generation_option_context=MagicMock(side_effect=selected_option),
        add_card=lambda _message, **values: SimpleNamespace(**values),
        create_candidate_set=create_set, enqueue_job=MagicMock(side_effect=enqueue),
        publish_pending_outbox=MagicMock(),
        _lock_agent_tool_request=MagicMock(return_value=True),
        _candidate_set_for_user=source_set_for_user,
        ConversationConflict=type("ConversationConflict", (ValueError,), {}),
    )
    load_source("teaching_api", route, {
        "submit_teacher_message", "_derive_ordinary_debate", "_agent_request_context", "_supplied_idempotency",
        "CandidateSetDerive", "_unique_idempotency",
    })
    return SimpleNamespace(**route, record_generation=record_generation)


def test_direct_teacher_request_uses_three_proposals_and_only_selected_current_materials(entry):
    attachments = [{"type": "material", "id": ref["id"], "preview": "PRIVATE-PREVIEW"} for ref in (SECOND, LATEST)]
    result, status = entry.submit_teacher_message(entry.user, entry.thread.id, {
        "content": REQUEST, "executionMode": "auto", "sourceRefs": attachments,
        "candidateCount": 1, "artifactType": "slide-deck", "allowDegraded": True,
        "constraints": {"arbitrary": "PRIVATE-CONSTRAINT"},
    })
    assert status == 202, result
    job = result["job"]
    assert job["kind"] == "candidate.generate"
    assert job["payload"]["artifactType"] == "debate"
    assert job["payload"]["candidateCount"] == 3
    assert job["payload"]["generationMode"] == "multiple"
    assert job["payload"]["generationReason"] == REASON
    assert job["payload"]["ordinaryCandidateModel"] == "fixture-model"
    assert job["payload"]["allowDegraded"] is False
    assert job["payload"]["sourceRefs"] == [SECOND, LATEST]
    assert job["payload"]["dependsOnJobIds"] == ["review-material"]
    assert "PRIVATE-" not in json.dumps(job["payload"])
    saved = entry.TeachingCandidateSets.query.filter_by(id=result["candidateSetId"]).one()
    assert saved.kind == "debate" and saved.source_refs == [SECOND, LATEST]
    entry.session_history_replayable.assert_not_called()
    entry._teacher_agent_context.assert_not_called()


@pytest.mark.parametrize(("body", "expected_status"), [
    ({"dojoId": 20, "moduleIndex": 0}, 400),
    ({"sourceRefs": [{"type": "material", "id": "other-course"}]}, 404),
    ({"sourceRefs": [{"type": "material", "id": "other-owner"}]}, 404),
    ({"sourceRefs": [{**LATEST, "sha256": "d" * 64}]}, 400),
    ({"content": "请生成课堂辩论方案：结合教材组织课堂。"}, 400),
])
def test_rejected_direct_request_leaves_no_new_messages_or_jobs(entry, body, expected_status):
    result, status = entry.submit_teacher_message(entry.user, entry.thread.id, {"content": REQUEST, **body})
    assert status == expected_status, result
    entry.enqueue_job.assert_not_called()
    entry.publish_pending_outbox.assert_not_called()
    assert TeachingAgentMessages.query.count() == 0
    assert entry.TeachingJobs.query.count() == 0
    assert entry.TeachingCandidateSets.query.count() == 1


@pytest.mark.parametrize(("message", "mode"), [
    ("怎样设计一场课堂辩论？", "auto"),
    ("不需要生成课堂辩论方案：有哪些常用环节？", "auto"),
    (REQUEST, "ask"),
])
def test_ordinary_questions_and_ask_mode_stay_on_existing_chat_path(entry, message, mode):
    result, status = entry.submit_teacher_message(entry.user, entry.thread.id, {
        "content": message, "executionMode": mode, "sourceRefs": [{"type": "material", "id": LATEST["id"]}],
    })
    assert status == 202, result
    job = result["job"]
    assert job["kind"] == "agent.chat"
    assert result["candidateSetId"] is None
    assert job["payload"]["executionMode"] == mode
    assert job["payload"]["context"]["conversation"] == ["PRIVATE-HISTORY"]
    assert job["payload"]["sourceRefs"] == [
        {"type": "material", "id": LATEST["id"]},
        {"type": "material", "id": "historical-material"},
    ]
    assert "ordinaryCandidateModel" not in job["payload"]
    assert entry.TeachingCandidateSets.query.count() == 1


def selected_request(**changes):
    return {"agentContinuation": True, "action": "generate", "executionMode": "execute",
            "content": "BROWSER-OVERRIDE", "sourceRefs": [{"type": "material", "id": SECOND["id"]}],
            "generationSelection": {"sourceMessageId": 10, "optionId": "option-1"}, **changes}


def test_saved_option_generates_one_proposal_with_its_original_material_revision(entry):
    result, status = entry.submit_teacher_message(entry.user, entry.thread.id, selected_request())
    assert status == 202, result
    job = result["job"]
    assert job["kind"] == "candidate.generate"
    assert job["payload"]["candidateCount"] == 1
    assert job["payload"]["generationMode"] == "single"
    assert job["payload"]["generationReason"] == REASON
    assert job["payload"]["sourceRefs"] == [OLD]
    assert "图书馆的开放时间" in job["payload"]["prompt"]
    assert "BROWSER-OVERRIDE" not in json.dumps(job["payload"])
    assert "PRIVATE-OPTION" not in json.dumps(job["payload"])
    entry.record_generation.assert_called_once()


def test_saved_option_cannot_be_moved_even_to_another_authorized_course(entry):
    result, status = entry.submit_teacher_message(entry.user, entry.thread.id, selected_request(dojoId=20, moduleIndex=0))
    assert status == 409 and result["code"] == "TURN_CONFLICT"
    entry.enqueue_job.assert_not_called()
    entry.record_generation.assert_not_called()
    assert entry.thread.dojo_id == 19


def test_unmarked_selected_option_outside_ordinary_course_keeps_previous_route(entry):
    entry.thread.dojo_id = 20
    entry.session.commit()
    selection = entry._generation_option_context.side_effect
    entry._generation_option_context.side_effect = lambda *args, **kwargs: {
        **selection(*args, **kwargs), "bundle": {"artifactType": "debate", "sourceRefs": []},
    }
    result, status = entry.submit_teacher_message(entry.user, entry.thread.id, selected_request())
    assert status == 202, result
    payload = result["job"]["payload"]
    assert payload["candidateCount"] == 1
    assert payload["generationReason"] == "teacher_selected_prompt_option"
    assert "ordinaryCandidateModel" not in payload
    assert payload["conversation"] == ["PRIVATE-HISTORY"]


@pytest.mark.parametrize("count", [2, 4])
def test_derive_projects_saved_plans_and_deduplicates_the_same_request_key(entry, count):
    entry.candidate_set.source_refs = [SECOND, OLD]
    entry.candidate.content = {
        "type": "debate", "objectives": ["比较不同需求"],
        "outline": [{"title": "比较证据", "description": "比较各方证据。", "internal": "PRIVATE-OUTLINE"}],
        "sourceGrounding": [
            {"materialId": OLD["id"], "uses": ["比较开放时间"], "internal": "PRIVATE-LOCATOR"},
            {"materialId": SECOND["id"], "uses": ["了解使用需求"]},
        ],
        "workbench": "PRIVATE-CONTENT",
    }
    entry.session.commit()
    args = (entry.user, entry.candidate_set, [entry.candidate.id], [entry.candidate], "增加一轮证据比较。", count, "same-key")
    result, status = entry._derive_ordinary_debate(*args)
    assert status == 202, result
    payload = result["job"]["payload"]
    assert payload["candidateCount"] == count
    assert payload["generationMode"] == "multiple"
    assert payload["generationReason"] == REASON
    assert payload["sourceRefs"] == [SECOND, OLD]
    assert "比较不同需求" in payload["prompt"]
    assert "增加一轮证据比较。" in payload["prompt"]
    plans = json.loads(payload["prompt"].splitlines()[-1])
    assert plans[0]["sourceGrounding"] == [
        {"materialId": "material-2", "uses": ["比较开放时间"]},
        {"materialId": "material-1", "uses": ["了解使用需求"]},
    ]
    assert "PRIVATE-" not in payload["prompt"]
    assert all(ref["id"] not in payload["prompt"] for ref in payload["sourceRefs"])
    replay, status = entry._derive_ordinary_debate(*args)
    assert status == 202 and replay == {**result, "deduplicated": True}
    conflict, status = entry._derive_ordinary_debate(*args[:-3], "更换辩题。", *args[-2:])
    assert status == 409 and conflict["code"] == "DERIVATION_CONFLICT"
    entry.enqueue_job.assert_called_once()
    entry.publish_pending_outbox.assert_called_once()
    assert entry.TeachingJobs.query.count() == 1
    assert entry.TeachingCandidateSets.query.count() == 2


def test_derive_rejects_unavailable_parent_course_source_and_parent_candidate(entry):
    args = (entry.user, entry.candidate_set, [entry.candidate.id], [entry.candidate], "比较证据。", 2, "key")
    entry.candidate_set.source_refs = [{"type": "material", "id": "other-course"}]
    with pytest.raises(entry.MaterialContextError, match="当前教师和课程"):
        entry._derive_ordinary_debate(*args)
    with pytest.raises(ValueError, match="当前方案集"):
        entry._derive_ordinary_debate(*args[:2], ["candidate-from-other-set"], *args[3:])
    entry.candidate_set.dojo_id = 20
    with pytest.raises(ValueError, match="本课程"):
        entry._derive_ordinary_debate(*args)
    entry.enqueue_job.assert_not_called()
    entry.publish_pending_outbox.assert_not_called()


def test_derive_endpoint_keeps_unmarked_nonordinary_jobs_on_the_previous_route(entry):
    entry.candidate_set.dojo_id = 20
    entry.session.commit()
    entry.request.body = {"candidateIds": [entry.candidate.id], "instruction": "调整讨论阶段。"}
    endpoint = entry.CandidateSetDerive()
    result, status = endpoint.post(entry.candidate_set.id)
    assert status == 202, result
    payload = result["job"]["payload"]
    assert payload["candidateCount"] == 3
    assert payload["sourceCandidates"] == [
        {"id": entry.candidate.id, "title": entry.candidate.title, "content": entry.candidate.content},
    ]
    assert "ordinaryCandidateModel" not in payload
    entry._lock_agent_tool_request.assert_not_called()


def test_derive_endpoint_does_not_fall_back_after_ordinary_course_opt_out(entry):
    entry.candidate_set.dojo_id = 20
    entry.candidate_set.request_json = {"generationReason": REASON}
    entry.session.commit()
    entry.request.body = {"candidateIds": [entry.candidate.id], "instruction": "调整讨论阶段。"}
    response, status = entry.CandidateSetDerive().post(entry.candidate_set.id)
    assert status == 400 and "普通辩论生成服务不可用" in response["error"]
    entry.enqueue_job.assert_not_called()


@pytest.mark.parametrize(("prompt", "kind"), [
    ("帮我设计一场适合初中生的课堂辩论，主题是延长图书馆开放时间", "debate"),
    ("帮我写一份适合小学四年级的教案，主题是观察叶片", "lesson-plan"),
    ("请生成普通教案候选：设计一堂有小组活动的数学课", "lesson-plan"),
    ("做个动态仿真，主题是植物吸收水分", "slide-deck"),
    ("请制作可以分步演示的交互课件：光合作用", "slide-deck"),
    ("请生成一份 Word 教案，主题是认识分数", None),
    ("怎样设计一份有互动的教案？", None),
    ("请帮我评估这份教案。", None),
])
def test_scoped_project_prompt_recognizes_creation_in_ordinary_language(prompt, kind):
    craft = {}
    load_source("teacher_documents", craft)
    load_source("ordinary_project_queue", craft)
    assert craft["requested_kind"](prompt) == kind

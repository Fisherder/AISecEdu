"""Exercise the teacher entry, official model client, and locked notes-only write."""

import ast
import copy
import json
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from test_ordinary_lesson_plan_unit import query, source
from test_ordinary_slide_layout_unit import slide


ROOT = Path(__file__).resolve().parents[1]
REWRITE = "请重写第2页的讲者备注：用生活化的例子讲解"
POLISH = "请缩短第2页的讲稿"
NOTES = "先请学生观察手中的叶片，说出他们看到的具体形状。接着比较几片叶子，说明相同的颜色不一定对应相同形状。请学生指出哪一条观察最能支持他们的判断，并用一句话向同伴说明理由。最后回到观察表，核对每组记录是否清楚。"


@pytest.fixture
def flow():
    import hashlib
    import math

    model = "fixture-model"
    ns = {"re": re, "math": math, "json": json, "hashlib": hashlib}
    for name in ("evidence", "tutor_context", "guide_model_context"):
        path = ROOT / "dojo_plugin/learning" / f"{name}.py"
        nodes = [node for node in ast.parse(path.read_text()).body if not isinstance(node, (ast.Import, ast.ImportFrom))]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), ns)
    source("teacher_documents", ns)
    source("ordinary_material_turn", ns)
    source("upstream_turn", ns, functions={"UpstreamTurnError", "request_body", "result_object"})
    source("classroom_preparation", ns)
    source("ordinary_slide_layout", ns)
    source("artifacts", ns, functions={"content_hash"})
    source("model_router", ns)
    ns.update(
        config=SimpleNamespace(HARNESS_DEEPSEEK_MODEL=model),
        ordinary_teaching_course=lambda dojo_id: dojo_id == 19,
        upstream_enabled=MagicMock(return_value=True),
        ScopeError=type("ScopeError", (ValueError,), {}),
        build_scope=MagicMock(),
    )

    # Stored order differs from displayed order.
    target, other = slide("target"), slide("other")
    target["order"], other["order"] = 2, 1
    for row, prefix in ((target, "观察叶片形状"), (other, "UNSELECTED-LEARNER-TEXT")):
        native = row["content"]
        page = native["studio"]["page"]
        page.update(title=prefix, takeaway="依据观察记录比较形状", supporting=["记录边缘差异"])
        page["speakerNotes"] = "NEVER-SEND-EXISTING-PRIVATE-NOTES"
        native["speakerNotes"] = "NEVER-SEND-LEGACY-NOTES"
        native["remark"] = "NEVER-SEND-REMARK"
        page["evidence"] = [{"sourceId": "PRIVATE-MATERIAL", "claim": "PRIVATE-EXCERPT"}]
    content = {"lesson": {"title": "不要附带课件标题", "artifacts": [target, other]}, "metadata": {"private": True}}
    artifact = SimpleNamespace(
        id="deck", owner_id=7, dojo_id=19, module_index=0, status="PUBLISHED",
        artifact_type="slide-deck", current_revision=3, self_workspace_id=None,
    )
    revision = SimpleNamespace(id="revision-3", revision=3, content=content, content_hash=ns["content_hash"](content))
    user = SimpleNamespace(id=7)
    artifacts = query(artifact)
    revisions = query(revision)
    for model_query, obj in ((artifacts, artifact), (revisions, revision)):
        filter_query = model_query.query.filter_by.return_value
        filter_query.first.return_value = obj
        filter_query.with_for_update.return_value.populate_existing.return_value.first.return_value = obj

    # The real published lookup filters on the database publication status/scope.
    missing = MagicMock()
    missing.first.return_value = None
    missing.with_for_update.return_value.populate_existing.return_value.first.return_value = None
    artifacts.query.filter_by.side_effect = lambda **kw: (
        missing if any(getattr(artifact, key) != value for key, value in kw.items())
        else artifacts.query.filter_by.return_value
    )
    ns.update(TeachingArtifacts=artifacts, TeachingArtifactRevisions=revisions, Users=query(user))
    ns["Users"].query.filter_by.return_value.first.return_value = user
    source("ordinary_slide_notes", ns)
    notes = SimpleNamespace(**ns)
    payload = {
        "artifactId": artifact.id, "expectedRevision": 3, "instruction": REWRITE,
        "currentContent": content, "artifactType": artifact.artifact_type, "allowDegraded": True,
    }
    job = SimpleNamespace(kind="artifact.revise", id="fixture-job", owner_id=7, dojo_id=19, module_index=0, payload=payload)
    invocation = SimpleNamespace(route=ns["UPSTREAM_SLIDE_NOTES_ROUTE"], actual_model=model, degraded=False)
    invocations = MagicMock()
    invocations.query.filter_by.return_value.order_by.return_value.first.return_value = invocation
    invocations.created.desc.return_value = "newest"
    jobs = {
        "ordinary_slide_notes": notes, "ordinary_slide_layout": SimpleNamespace(pinned=lambda _: False),
        "json": json, "TeachingArtifacts": artifacts, "Users": ns["Users"],
        "ModelInvocations": invocations, "UPSTREAM_SLIDE_NOTES_ROUTE": ns["UPSTREAM_SLIDE_NOTES_ROUTE"],
        "PermanentJobError": type("PermanentJobError", (ValueError,), {}),
        "UpstreamTurnError": ns["UpstreamTurnError"],
        "invoke_turn": MagicMock(return_value={"model": model, "usage": {
            "prompt_tokens": 17, "completion_tokens": 11, "total_tokens": 28,
        }, "text": json.dumps({"speakerNotes": NOTES}, ensure_ascii=False)}),
        "_runtime_request_body": MagicMock(side_effect=AssertionError("Legacy should not receive this pinned job")),
        "create_revision": MagicMock(return_value=SimpleNamespace(id="revision-4", revision=4)),
    }
    source("reliability", jobs, functions={"RuntimeJobError"})
    source("jobs", jobs, functions={"_runtime_json_bytes", "_invoke_agent_runtime", "_invoke_ordinary_slide_notes", "_persist_result", "_runtime_payload"})
    return ns, notes, jobs, artifact, revision, user, job


@pytest.mark.parametrize("consent", [False, True])
def test_teacher_api_dispatches_and_persists_only_the_requested_notes(flow, consent):
    ns, notes, jobs, artifact, revision, user, job = flow
    original_notes = NOTES + "还可以请每组针对一片不同的叶子补充完整记录，再交换观察表核对。"
    if consent:
        revision.content["lesson"]["artifacts"][0]["content"]["studio"]["page"]["speakerNotes"] = original_notes
        revision.content_hash = ns["content_hash"](revision.content)
    enqueue = MagicMock(return_value=(job, True))
    teaching_jobs = MagicMock()
    teaching_jobs.query.filter_by.return_value.first.return_value = None
    api = {
        "ordinary_slide_notes": notes,
        "ordinary_slide_layout": SimpleNamespace(admit=MagicMock(), OrdinarySlideLayoutError=ValueError),
        "artifact_for_user": lambda *_: artifact, "_supplied_idempotency": lambda *_: "request",
        "artifact_view": lambda _: {"revision": {"content": revision.content}},
        "artifact_revision_source_issue": lambda *_: None,
        "TeachingJobs": teaching_jobs, "enqueue_job": enqueue,
        "_ok": lambda result, status: (result, status), "job_view": lambda _: {"id": job.id},
        "_error": lambda _error, status, **_: ({}, status),
    }
    path = ROOT / "dojo_plugin/api/v1/teaching.py"
    revise = next(node for node in ast.parse(path.read_text()).body if getattr(node, "name", "") == "revise_teacher_artifact")
    exec(compile(ast.Module(body=[revise], type_ignores=[]), str(path), "exec"), api)
    body = {"instruction": POLISH if consent else REWRITE, "expectedRevision": 3}
    if consent:
        body.update(useOriginalSpeakerNotes=True, originalSpeakerNotes="CLIENT-FORGED-NOTES")
    assert api["revise_teacher_artifact"](user, artifact.id, body)[1] == 202
    job.payload = enqueue.call_args.kwargs["payload"]
    assert "currentContent" not in job.payload and "originalSpeakerNotes" not in job.payload
    assert job.payload[notes.PIN]["pageId"] == "target"
    api["ordinary_slide_layout"].admit.assert_not_called()
    teaching_jobs.query.filter_by.return_value.first.return_value = job
    changed_consent = {**body, "useOriginalSpeakerNotes": not consent}
    assert api["revise_teacher_artifact"](user, artifact.id, changed_consent)[1] == 409
    enqueue.assert_called_once()
    jobs["accepted_input"] = lambda _: None
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"]("artifact.revise", payload=prepared, allow_degraded=True)
    assert route["route"] == ns["UPSTREAM_SLIDE_NOTES_ROUTE"] and not route["allow_degraded"]
    result = jobs["_invoke_agent_runtime"](job, route, prepared)
    body = jobs["invoke_turn"].call_args.args[0]
    assert json.loads(body["messages"][1]["content"]) == {
        "instruction": "" if consent else "用生活化的例子讲解",
        "visibleSlide": {"title": "观察叶片形状", "takeaway": "依据观察记录比较形状", "supporting": ["记录边缘差异"]},
        **({"originalSpeakerNotes": original_notes} if consent else {}),
    }
    assert result["model"]["usage"]["total_tokens"] == 28
    assert result["result"] == {"speakerNotes": NOTES}
    original = copy.deepcopy(revision.content)
    assert jobs["_persist_result"](job, result["result"])["revision"] == 4
    kw = jobs["create_revision"].call_args.kwargs
    assert kw["commit"] is False and kw["expected_revision"] == 3
    expected = copy.deepcopy(original)
    native = expected["lesson"]["artifacts"][0]["content"]
    native["speakerNotes"] = native["remark"] = native["studio"]["page"]["speakerNotes"] = NOTES
    assert kw["content"] == expected
    assert revision.content == original
    assert jobs["ModelInvocations"].query.filter_by.return_value.order_by.return_value.first.return_value.artifact_revision_id == "revision-4"


@pytest.mark.parametrize("instruction", [
    "请缩短第2页的讲稿",
    "请润色第2页的讲稿",
    "请简化第2页的讲稿",
    "请重写第2页的讲稿，保持已写内容的顺序",
    "请重写第2页讲稿：沿用原稿中的例子",
    "请重写第2页的讲稿：附可执行脚本",
])
def test_requires_one_explicit_rewrite_from_visible_text(flow, instruction):
    _, notes, jobs, artifact, _, user, job = flow
    with pytest.raises(notes.OrdinarySlideNotesError):
        notes.admit(user, artifact, {**job.payload, "instruction": instruction})
    jobs["invoke_turn"].assert_not_called()


@pytest.mark.parametrize("changed", ["model-disabled", "teacher-revoked", "unpublished", "stale-content", "old-instruction"])
def test_pinned_job_never_dispatches_after_model_scope_or_source_changes(flow, changed):
    ns, notes, jobs, artifact, revision, user, job = flow
    job.payload = notes.admit(user, artifact, job.payload)
    route = ns["route_model"]("artifact.revise", payload=job.payload)
    if changed == "model-disabled":
        ns["upstream_enabled"].return_value = False
    elif changed == "teacher-revoked":
        ns["build_scope"].side_effect = ns["ScopeError"]("denied")
    elif changed == "unpublished":
        artifact.status = "DRAFT"
    elif changed == "stale-content":
        revision.content["metadata"]["changed"] = True
    else:
        job.payload["instruction"] = "请重写第1页讲稿"
    with pytest.raises(notes.OrdinarySlideNotesError):
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    jobs["invoke_turn"].assert_not_called()
    jobs["_runtime_request_body"].assert_not_called()


def test_rechecks_publication_under_the_revision_lock_after_model_success(flow):
    ns, notes, jobs, artifact, _, user, job = flow
    job.payload = notes.admit(user, artifact, job.payload)
    route = ns["route_model"]("artifact.revise", payload=job.payload)
    result = jobs["_invoke_agent_runtime"](job, route, job.payload)
    artifact.status = "DRAFT"
    with pytest.raises(notes.OrdinarySlideNotesError):
        jobs["_persist_result"](job, result["result"])
    jobs["create_revision"].assert_not_called()


def test_rejects_non_notes_model_output_without_losing_measured_usage(flow):
    ns, notes, jobs, artifact, _, user, job = flow
    job.payload = notes.admit(user, artifact, job.payload)
    route = ns["route_model"]("artifact.revise", payload=job.payload)
    jobs["invoke_turn"].return_value["text"] = json.dumps({"speakerNotes": NOTES, "pageId": "other"})
    with pytest.raises(jobs["RuntimeJobError"]) as error:
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    assert error.value.model_meta["usage"]["total_tokens"] == 28
    jobs["create_revision"].assert_not_called()


def test_existing_harness_transport_posts_only_selected_visible_fields(flow, monkeypatch):
    from test_upstream_teaching_turn_unit import turn

    ns, notes, jobs, artifact, _, user, job = flow
    prompt = "请将第2页的演讲备注改为初学者能听懂的讲解"
    job.payload = notes.admit(user, artifact, {**job.payload, "instruction": prompt})
    route = ns["route_model"]("artifact.revise", payload=job.payload)
    client_response = MagicMock()
    client_response.__enter__.return_value = client_response
    client_response.status_code = 200
    client_response.json.return_value = jobs["invoke_turn"].return_value
    post = MagicMock(return_value=client_response)
    monkeypatch.setattr(turn.requests, "post", post)
    monkeypatch.setenv("HARNESS_INTERNAL_URL", "http://harness.invalid")
    monkeypatch.setenv("HARNESS_SERVICE_SECRET", "fixture-only")
    jobs["invoke_turn"] = turn.invoke_turn
    result = jobs["_invoke_agent_runtime"](job, route, job.payload)
    assert result["result"] == {"speakerNotes": NOTES}
    assert post.call_args.args == ("http://harness.invalid/v1/turn",)
    assert post.call_args.kwargs["allow_redirects"] is False
    packet = json.loads(post.call_args.kwargs["data"])
    assert json.loads(packet["messages"][1]["content"])["instruction"] == "初学者能听懂的讲解"
    assert all(value not in str(packet) for value in ("NEVER-SEND", "UNSELECTED", "PRIVATE-EXCERPT"))


def test_a_layout_request_that_preserves_existing_notes_stays_on_its_original_path(flow):
    _, notes, _, artifact, _, user, job = flow
    original = {**job.payload, "instruction": "请修改第2页配色，不要修改原讲稿。"}
    assert notes.admit(user, artifact, original) is original


@pytest.mark.parametrize("instruction", [
    "请重写第1、2页的讲者备注",
    "请重写整套课件的讲稿",
    "请重写第2页的讲稿：同时修改第3页标题",
    "修改第2页的标题和版式，保留讲稿",
])
def test_multi_page_and_other_edits_keep_original_workflow(flow, instruction):
    _, notes, _, artifact, _, user, job = flow
    original = {**job.payload, "instruction": instruction}
    assert notes.admit(user, artifact, original) is original
    with pytest.raises(notes.OrdinarySlideNotesError):
        notes.admit(user, artifact, {**original, notes.CONSENT: True})


def test_draft_rewrite_stays_legacy_and_cannot_send_original_with_consent(flow):
    _, notes, jobs, artifact, _, user, job = flow
    artifact.status = "DRAFT"
    assert notes.admit(user, artifact, job.payload) is job.payload
    with pytest.raises(notes.OrdinarySlideNotesError, match="发布状态"):
        notes.admit(user, artifact, {**job.payload, notes.CONSENT: True})
    jobs["invoke_turn"].assert_not_called()


def test_unchecked_preserve_title_clause_keeps_public_rewrite(flow):
    _, notes, _, artifact, _, user, job = flow
    request = {**job.payload, "instruction": "请重写第2页的讲稿：不要修改第3页标题"}
    assert notes.pinned(notes.admit(user, artifact, request))


@pytest.mark.parametrize("private_notes", [
    "使用例子区分观察和推测。学生姓名：样例",
    "课堂观察记录。sample@example.test",
    "调用终端检查脚本。",
])
def test_authorized_but_private_or_executable_notes_are_rejected(flow, private_notes):
    ns, notes, jobs, artifact, revision, user, job = flow
    revision.content["lesson"]["artifacts"][0]["content"]["studio"]["page"]["speakerNotes"] = private_notes
    revision.content_hash = ns["content_hash"](revision.content)
    with pytest.raises(notes.OrdinarySlideNotesError, match="勿附私人资料"):
        notes.admit(user, artifact, {**job.payload, "instruction": "请润色第2页讲稿", notes.CONSENT: True})
    jobs["invoke_turn"].assert_not_called()


def test_shortening_checks_output_and_persisted_checkpoint_against_pinned_original(flow):
    ns, notes, jobs, artifact, revision, user, job = flow
    page = revision.content["lesson"]["artifacts"][0]["content"]["studio"]["page"]
    page["speakerNotes"] = NOTES
    revision.content_hash = ns["content_hash"](revision.content)
    job.payload = notes.admit(user, artifact, {**job.payload, "instruction": POLISH, notes.CONSENT: True})
    route = ns["route_model"](job.kind, payload=job.payload)
    with pytest.raises(jobs["RuntimeJobError"]):
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    with pytest.raises(notes.OrdinarySlideNotesError, match="未缩短"):
        jobs["_persist_result"](job, {"speakerNotes": NOTES})
    jobs["create_revision"].assert_not_called()


def test_mismatched_consent_cannot_read_the_original_after_admission(flow):
    ns, notes, jobs, artifact, _, user, job = flow
    job.payload = notes.admit(user, artifact, job.payload)
    job.payload[notes.CONSENT] = True
    route = ns["route_model"](job.kind, payload=job.payload)
    with pytest.raises(notes.OrdinarySlideNotesError):
        jobs["_invoke_agent_runtime"](job, route, job.payload)
    jobs["invoke_turn"].assert_not_called()


def test_original_falls_back_to_legacy_speaker_notes_only_when_canonical_is_empty(flow):
    ns, notes, jobs, artifact, revision, user, job = flow
    native = revision.content["lesson"]["artifacts"][0]["content"]
    native["studio"]["page"]["speakerNotes"] = ""
    native["speakerNotes"] = NOTES + "请使用统一的观察记录表。"
    revision.content_hash = ns["content_hash"](revision.content)
    job.payload = notes.admit(user, artifact, {**job.payload, "instruction": POLISH, notes.CONSENT: True})
    route = ns["route_model"](job.kind, payload=job.payload)
    jobs["_invoke_agent_runtime"](job, route, job.payload)
    prompt_body = json.loads(jobs["invoke_turn"].call_args.args[0]["messages"][1]["content"])
    assert prompt_body["originalSpeakerNotes"] == native["speakerNotes"]
    assert native["remark"] not in str(prompt_body)

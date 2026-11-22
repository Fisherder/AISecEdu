import ast
import copy
import hashlib
import html
import json
import re
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


RUNTIME = Path(__file__).resolve().parents[1] / "dojo_plugin" / "agent_runtime"
MODEL = "ordinaryLessonPlanRevisionModel"
ROUTE = "upstream-ordinary-lesson-plan-revise"


def load(name, namespace, functions=None):
    path = RUNTIME / f"{name}.py"
    nodes = ast.parse(path.read_text()).body
    nodes = [
        node for node in nodes
        if (getattr(node, "name", None) in functions if functions else not isinstance(node, (ast.Import, ast.ImportFrom)))
    ]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)


@pytest.fixture
def setup():
    config = SimpleNamespace(HARNESS_DEEPSEEK_MODEL="approved-model", DOJO_AI_AUTHORING_PLAN_MODEL="legacy")
    ns = {"config": config, "hashlib": hashlib, "json": json, "re": re}
    load("model_router", ns)
    permissions = MagicMock()
    enabled = MagicMock(return_value=True)
    receipts = MagicMock()
    receipts.query.filter_by.return_value.filter.return_value.first.return_value = object()
    ns.update(
        copy=copy, html=html, _require_scope=permissions, upstream_enabled=enabled,
        ModelInvocations=receipts,
        split_source_selection=lambda text: (text, "selected-source" in text),
        content_hash=lambda data: hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
    )
    load("ordinary_lesson_plan_revision", ns)
    slides = []
    for index, title in enumerate(("观察完整叶片", "记录叶脉")):
        identity = f"lesson-plan-{index + 1}"
        explanation = f"{title}的课堂讲解"
        takeaways = [f"{title}的要点"]
        slides.append({
            "id": identity, "type": "slide", "title": title, "order": index,
            "outline": {"title": title, "description": explanation, "keyPoints": takeaways},
            "content": {"elements": [{"id": identity + "-text", "type": "text", "left": 64,
                                      "content": ns["_section_markup"](title, explanation, takeaways)}]},
        })
    content = {
        "schema": "aisecedu.global-agent.artifact.v1", "artifactType": "lesson-plan", "renderer": "agent-runtime-stage",
        "plan": {"experience": {"mode": "ordinary-teaching-plan"}, "sourceGrounding": ["fixture-private-citation"]},
        "lesson": {"title": "植物观察", "artifacts": slides}, "metadata": {"history": "fixture-private-history"},
    }
    revision = SimpleNamespace(id="r2", content=content, content_hash=ns["content_hash"](content), validation={})
    artifact = SimpleNamespace(id="artifact-1", artifact_type="lesson-plan", self_workspace_id=None,
                               dojo_id=19, module_index=0, owner_id=7, current_revision=2)
    job = SimpleNamespace(id="job-1", kind="artifact.revise", owner_id=7, dojo_id=19, module_index=0, thread_id=None)
    ns["_source"] = MagicMock(return_value=revision)
    ns["TeachingArtifacts"] = MagicMock()
    query = ns["TeachingArtifacts"].query.filter_by.return_value
    query.populate_existing.return_value.first.return_value = artifact
    query.with_for_update.return_value.populate_existing.return_value.first.return_value = artifact
    job.payload = {"artifactType": "lesson-plan", "artifactId": artifact.id, "expectedRevision": 2,
                   "instruction": "请缩短第2节的讲解，用生活化的例子。", "currentContent": content}
    return SimpleNamespace(**ns, permissions=permissions, enabled=enabled, revision=revision, artifact=artifact, job=job)


def test_selected_section_exposes_only_visible_text_and_preserves_other_content(setup):
    job = setup.job
    job.payload = setup.admit(setup.artifact, job.payload)
    projected = setup.prepare(job, job.payload)
    wire = setup.wire_payload(projected)
    assert set(wire) == {"artifactType", "artifactId", "expectedRevision", "instruction", MODEL, "sections"}
    assert wire["sections"] == [{
        "index": 1, "title": "记录叶脉", "explanation": "记录叶脉的课堂讲解", "takeaways": ["记录叶脉的要点"],
    }]
    assert "fixture-private" not in json.dumps(wire)
    assert "观察完整叶片" not in json.dumps(wire, ensure_ascii=False)
    route = setup.route_model(job.kind, payload=projected, allow_degraded=True)
    assert route["route"] == ROUTE and route["required_model"] == "approved-model"
    assert route["allow_degraded"] is False
    before = setup.revision.content
    changed = setup.content_for_save(job, {"patches": [{"index": 1, "explanation": "像地图中的道路 & 小路。"}]})
    assert changed["plan"] == before["plan"] and changed["metadata"] == before["metadata"]
    assert changed["lesson"]["artifacts"][0] == before["lesson"]["artifacts"][0]
    row = changed["lesson"]["artifacts"][1]
    assert row["outline"]["keyPoints"] == before["lesson"]["artifacts"][1]["outline"]["keyPoints"]
    assert "&amp;" in row["content"]["elements"][0]["content"]
    setup.TeachingArtifacts.query.filter_by.return_value.with_for_update.assert_called_once()


@pytest.mark.parametrize("instruction", ["请缩短第二节的讲解。", "请缩短第２小节的讲解。"])
def test_spoken_section_number_keeps_other_sections_local(setup, instruction):
    job = setup.job
    job.payload["instruction"] = instruction
    job.payload = setup.admit(setup.artifact, job.payload)
    assert [row["index"] for row in setup.prepare(job, job.payload)["sections"]] == [1]


def test_whole_plan_and_repeated_edits_follow_same_scoped_route(setup):
    job = setup.job
    job.payload["instruction"] = "精简各节学习要点"
    job.payload = setup.admit(setup.artifact, job.payload)
    assert [row["index"] for row in setup.prepare(job, job.payload)["sections"]] == [0, 1]
    changed = setup.content_for_save(job, {"patches": [
        {"index": 0, "takeaways": ["观察边缘"]},
        {"index": 1, "explanation": "将叶片对光，观察叶脉。"},
    ]})
    setup.artifact.current_revision = 3
    setup.revision.content = changed
    setup.revision.content_hash = setup.content_hash(changed)
    job.payload = setup.admit(setup.artifact, {**job.payload, "expectedRevision": 3})
    assert setup.prepare(job, job.payload)["sections"][0]["takeaways"] == ["观察边缘"]


@pytest.mark.parametrize("changed", ["model", "disabled", "permissions", "version", "hash", "receipt"])
def test_changed_scope_or_provenance_cannot_run_or_save(setup, changed):
    job = setup.job
    job.payload = setup.admit(setup.artifact, job.payload)
    if changed == "model":
        setup.config.HARNESS_DEEPSEEK_MODEL = "other-model"
    elif changed == "disabled":
        setup.enabled.return_value = False
    elif changed == "permissions":
        setup.permissions.side_effect = setup.OrdinaryLessonPlanRevisionError("revoked")
    elif changed == "version":
        setup.artifact.current_revision += 1
    elif changed == "hash":
        setup.revision.content["metadata"] = {}
    else:
        setup.ModelInvocations.query.filter_by.return_value.filter.return_value.first.return_value = None
    with pytest.raises(setup.OrdinaryLessonPlanRevisionError):
        setup.prepare(job, job.payload)
    with pytest.raises(setup.OrdinaryLessonPlanRevisionError):
        setup.content_for_save(job, {"patches": [{"index": 1, "explanation": "新的讲解"}]})


@pytest.mark.parametrize("instruction", ["删除第2节", "删除第二小节", "调整第二节的结构", "精简第一、二节", "请更改标题", "润色第3节", "精简第1、2节", "精简第2节 selected-source"])
def test_unsupported_requests_do_not_use_unpinned_legacy_path(setup, instruction):
    with pytest.raises(setup.OrdinaryLessonPlanRevisionError):
        setup.admit(setup.artifact, {**setup.job.payload, "instruction": instruction})


@pytest.mark.parametrize("patches", [
    [{"index": 0, "explanation": "未选小节"}],
    [{"index": 1, "explanation": "变更"}, {"index": 1, "explanation": "重复"}],
    [{"index": 1, "title": "新标题"}],
    [{"index": 1, "explanation": "<b>HTML</b>"}],
    [{"index": 1, "explanation": "记录叶脉的课堂讲解"}],
])
def test_untrusted_patch_fails_before_persistence(setup, patches):
    job = setup.job
    job.payload = setup.admit(setup.artifact, job.payload)
    with pytest.raises(setup.OrdinaryLessonPlanRevisionError):
        setup.content_for_save(job, {"patches": patches})


def test_dedicated_http_does_not_use_old_route_on_redirect(setup):
    job = setup.job
    job.trace_id = "test"
    http = MagicMock()
    http.post.return_value.status_code = 302
    ns = {
        "requests": http, "time": time, "AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS": (),
        "config": SimpleNamespace(AGENT_RUNTIME_INTERNAL_URL="http://runtime.test", AGENT_RUNTIME_SERVICE_SECRET="fixture"),
        "ordinary_slide_layout": SimpleNamespace(pinned=lambda payload: False),
        "UPSTREAM_DEBATE_CANDIDATE_ROUTE": "upstream-ordinary-debate-candidate",
        "_runtime_request_body": lambda *args: {"kind": job.kind}, "_runtime_read_timeout": lambda *args: 2,
    }
    load("reliability", ns, {"RuntimeJobError"})
    load("jobs", ns, {"_invoke_agent_runtime"})
    with pytest.raises(ns["RuntimeJobError"]) as failure:
        ns["_invoke_agent_runtime"](job, {}, {MODEL: "approved-model"})
    assert failure.value.code == "ORDINARY_LESSON_PLAN_REVISION_ROUTE_UNAVAILABLE"
    assert http.post.call_args.args == ("http://runtime.test/api/integration/jobs/ordinary-lesson-plan-revise",)
    assert http.post.call_args.kwargs["allow_redirects"] is False


def test_receipt_requires_exact_pinned_engine_and_measured_usage(setup):
    route = {"required_model": "approved-model"}
    meta = {
        "executionMode": "ordinary-lesson-plan-revise", "provider": "deepseek",
        "actualModel": "approved-model", "degraded": False,
        "usage": {"inputTokens": 12, "outputTokens": 8, "totalTokens": 20},
    }
    setup.validate_receipt(route, {"model": meta})
    for override in (
        {"actualModel": "changed"}, {"degraded": True}, {"provider": "legacy"},
        {"executionMode": "legacy"}, {"usage": {"inputTokens": 12, "outputTokens": 8, "totalTokens": 21}},
    ):
        with pytest.raises(setup.OrdinaryLessonPlanRevisionError):
            setup.validate_receipt(route, {"model": {**meta, **override}})


def test_legacy_plan_and_previously_admitted_request_keep_legacy_dispatch(setup):
    setup.ModelInvocations.query.filter_by.return_value.filter.return_value.first.return_value = None
    job = setup.job
    assert setup.admit(setup.artifact, job.payload) is job.payload
    assert setup.route_model(job.kind, payload=job.payload)["route"] == "teaching-default"


def test_known_ordinary_plan_with_missing_initial_receipt_fails_closed(setup):
    setup.revision.validation = {"modelRoute": "upstream-lesson-plan-materialize"}
    setup.ModelInvocations.query.filter_by.return_value.filter.return_value.first.return_value = None
    with pytest.raises(setup.OrdinaryLessonPlanRevisionError):
        setup.admit(setup.artifact, setup.job.payload)

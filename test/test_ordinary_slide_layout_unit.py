"""Exercise the ordinary layout entry, runtime binding, and revision write."""

import copy
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from test_ordinary_lesson_plan_unit import query, source


def slide(page):
    return {
        "type": "slide", "outline": {"type": "slide", "title": f"叶片 {page}"},
        "content": {
            "elements": [{"type": "text", "content": "<p>叶缘观察</p>"}],
            "speakerNotes": "老师私有备注",
            "studio": {
                "page": {"schema": "courseware-page-v2", "id": page, "visual": {"kind": "chart"},
                         "layout": {"title": {"left": 50}}},
                "assets": [],
            },
        },
    }


REVISE = "请调整第1、2页的版式：把标题移到右上方"
SOURCE_SELECTION = "\n\n仅修改当前版本 V2 中所选范围（源码第 14–25 行），保留其余内容与交互：\nPRIVATE-RANGE"


@pytest.fixture
def case():
    import hashlib
    import math
    import re
    import time

    ns = {
        "config": SimpleNamespace(HARNESS_DEEPSEEK_MODEL="pinned-fixture", AGENT_RUNTIME_INTERNAL_URL="http://runtime.test",
                                  AGENT_RUNTIME_SERVICE_SECRET="fixture-only"),
        "re": re, "json": json, "hashlib": hashlib, "time": time, "math": math,
        "ordinary_teaching_course": lambda dojo_id: dojo_id == 5,
        "upstream_enabled": MagicMock(return_value=True),
        "ScopeError": type("ScopeError", (ValueError,), {}),
        "build_scope": MagicMock(),
    }
    source("upstream_turn", ns, functions={"ordinary_slide_wording_request"})
    source("artifacts", ns, functions={"content_hash"})
    source("classroom_preparation", ns)
    source("ordinary_slide_layout", ns)
    source("model_router", ns)
    content = {"schema": "fixture", "lesson": {"title": "叶片", "artifacts": [slide(p) for p in ("one", "two", "three")]}}
    revision = SimpleNamespace(id="revision-2", revision=2, content=content, content_hash=ns["content_hash"](content))
    artifact = SimpleNamespace(id="art", artifact_type="slide-deck", owner_id=3, dojo_id=5, module_index=0,
                               self_workspace_id=None, current_revision=2, status="READY")
    user = SimpleNamespace(id=3)
    payload = {"artifactType": "slide-deck", "artifactId": "art", "expectedRevision": 2, "currentContent": {"wrong": True},
               "instruction": REVISE, "allowDegraded": True}
    ns.update(TeachingArtifacts=query(artifact), Users=query(user), current_artifact_revision=lambda _: revision)
    facade = SimpleNamespace(**ns)
    jobs = {"ordinary_slide_layout": facade}
    source("jobs", jobs, functions={"_runtime_payload", "_runtime_request_body", "_invoke_agent_runtime", "_persist_result"})
    job = SimpleNamespace(id="job", kind="artifact.revise", owner_id=3, dojo_id=5, module_index=0, thread_id=None,
                          trace_id="fixture-trace", result={}, payload=payload)
    return ns, jobs, job, user, artifact, revision


@pytest.mark.parametrize(("instruction", "target"), [
    (REVISE, [1, 2]),
    ("请仅调整第1页和第2页排版：把标题移到右上方", [1, 2]),
    ("统一整套课件的布局：把标题移到右上方", "all"),
    ("请调整所有页面的版式：把标题移到右上方", "all"),
])
def test_explicit_page_or_whole_deck_instruction(case, instruction, target):
    ns, _, _, _, _, _ = case
    assert ns["layout_request"](instruction) == ("把标题移到右上方", target)
    assert ns["layout_request"]("改写介绍并保留原有布局。") is None


def test_actual_worker_projects_trusted_saved_content_and_exact_scope(case):
    ns, jobs, job, user, artifact, revision = case
    job.payload = ns["admit"](user, artifact, job.payload)
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared, allow_degraded=True)
    assert route["required_model"] == route["actual_model"] == "pinned-fixture"
    assert route["allow_degraded"] is False
    body = jobs["_runtime_request_body"](job, route, prepared)
    assert body["scope"] == {"ownerId": 3, "dojoId": 5, "moduleIndex": 0, "ordinaryTeaching": "slide-layout"}
    assert body["payload"] == {
        "revisionBackend": "ordinary-slide-layout", "artifactType": "slide-deck", "artifactId": "art",
        "expectedRevision": 2, "instruction": "把标题移到右上方", "pageSelection": [1, 2],
        "currentContent": revision.content,
    }


@pytest.mark.parametrize("instruction", [REVISE, "请只润色第1页的文字：改成简明的教学语句"])
def test_workbench_source_selection_is_rejected_at_admission_and_worker(case, instruction):
    ns, jobs, job, user, artifact, _ = case
    job.payload = {**job.payload, "instruction": instruction + SOURCE_SELECTION}
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="取消源码选区"):
        ns["admit"](user, artifact, job.payload)
    jobs["ordinary_teaching_course"] = ns["ordinary_teaching_course"]
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="取消源码选区"):
        jobs["_runtime_payload"](job)


@pytest.mark.parametrize("changed", ["model", "service", "version", "wrong-candidate", "scope", "content", "instruction"])
def test_worker_refuses_after_admission_drift(case, changed):
    ns, jobs, job, user, artifact, revision = case
    job.payload = ns["admit"](user, artifact, job.payload)
    if changed == "model":
        ns["config"].HARNESS_DEEPSEEK_MODEL = "different"
    elif changed == "service":
        ns["upstream_enabled"].return_value = False
    elif changed == "version":
        artifact.current_revision = 3
    elif changed == "wrong-candidate":
        revision.id = "wrong-revision"
    elif changed == "scope":
        ns["build_scope"].side_effect = ns["ScopeError"]()
    elif changed == "content":
        revision.content["lesson"]["title"] = "突然变更"
    else:
        job.payload["instruction"] = REVISE.replace("右上", "左上")
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="版本或课程权限"):
        jobs["_runtime_payload"](job)


@pytest.mark.parametrize("instruction", [
    "请调整第1、1页版式：移动标题", "请调整第1、9页版式：移动标题",
    "请调整第1页版式：移动标题\n以及左对齐",
])
def test_bad_page_targets_or_multiline_instruction_are_not_legacy_fallback(case, instruction):
    ns, _, job, user, artifact, _ = case
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        ns["admit"](user, artifact, {**job.payload, "instruction": instruction})


@pytest.mark.parametrize("status", [404, 307, 308])
def test_missing_or_redirecting_runtime_never_calls_generic_executor(case, status):
    ns, jobs, job, user, artifact, _ = case
    job.payload = ns["admit"](user, artifact, job.payload)
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    response = MagicMock(status_code=status)
    post = MagicMock(return_value=response)
    jobs.update(config=ns["config"], AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS=(), time=ns["time"],
                requests=SimpleNamespace(post=post), _runtime_read_timeout=lambda *_: 30,
                RuntimeJobError=lambda message, **kwargs: ValueError(message))
    with pytest.raises(ValueError, match="普通课件版式接口"):
        jobs["_invoke_agent_runtime"](job, route, prepared)
    post.assert_called_once()
    assert post.call_args.args == ("http://runtime.test/api/integration/jobs/ordinary-slide-layout",)
    assert post.call_args.kwargs["allow_redirects"] is False
    response.close.assert_called_once()


def reply(content, changed=0):
    output = copy.deepcopy(content)
    output["lesson"]["artifacts"][changed]["content"]["studio"]["page"]["layout"]["title"]["left"] = 550
    ids = ["one", "two"]
    output["revisionMetadata"] = {
        "mode": "ordinary-slide-layout", "pageIds": ids, "changedPageIds": [["one", "two", "three"][changed]],
        "renderEvidence": [
            {"pageId": page, "mode": "headless-chromium-dom-and-pixels", "sourceSha256": "a" * 64,
             "frames": [{"step": -1, "screenshotSha256": "b" * 64}], "inspectedAt": "now"} for page in ids
        ],
    }
    return {
        "result": {"content": output},
        "model": {"actualModel": "pinned-fixture", "executionMode": "ordinary-slide-layout", "provider": "deepseek",
                  "degraded": False},
    }


@pytest.mark.parametrize("change", ["legacy", "outside", "notes", "evidence"])
def test_receipt_denies_unpinned_model_changed_unselected_page_or_bad_render_proof(case, change):
    ns, jobs, job, user, artifact, revision = case
    job.payload = ns["admit"](user, artifact, job.payload)
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    ns["validate_receipt"](route, prepared, reply(revision.content))
    invalid = reply(revision.content, changed=2 if change == "outside" else 0)
    if change == "legacy":
        invalid["model"]["actualModel"] = "legacy"
    elif change == "notes":
        invalid["result"]["content"]["lesson"]["artifacts"][0]["content"]["speakerNotes"] = "改写了备注"
    elif change == "evidence":
        invalid["result"]["content"]["revisionMetadata"]["renderEvidence"].pop()
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        ns["validate_receipt"](route, prepared, invalid)


def test_persist_revision_and_model_link_in_outer_job_transaction(case):
    ns, jobs, job, user, artifact, revision = case
    job.payload = ns["admit"](user, artifact, job.payload)
    ns["Users"].query.filter_by.return_value.first.return_value = user
    artifact_query = ns["TeachingArtifacts"].query.filter_by.return_value
    artifact_query.first.return_value = artifact
    artifact_query.with_for_update.return_value.populate_existing.return_value.first.return_value = artifact
    invocation = SimpleNamespace(route=ns["UPSTREAM_SLIDE_LAYOUT_ROUTE"], actual_model="pinned-fixture", degraded=False)
    invocations = MagicMock()
    invocations.query.filter_by.return_value.order_by.return_value.first.return_value = invocation
    create_revision = MagicMock(return_value=SimpleNamespace(id="revision-3", revision=3))
    jobs.update(Users=ns["Users"], TeachingArtifacts=ns["TeachingArtifacts"], ModelInvocations=invocations,
                create_revision=create_revision, content_hash=ns["content_hash"],
                UPSTREAM_SLIDE_LAYOUT_ROUTE=ns["UPSTREAM_SLIDE_LAYOUT_ROUTE"])
    result = jobs["_persist_result"](job, reply(revision.content)["result"])
    assert result == {"artifactId": "art", "revisionId": "revision-3", "revision": 3}
    artifact_query.with_for_update.assert_called_once()
    assert create_revision.call_args.kwargs["commit"] is False
    assert create_revision.call_args.kwargs["expected_revision"] == 2
    assert invocation.artifact_revision_id == "revision-3"


def test_layout_free_historical_slide_allows_only_canonical_migration(case):
    ns, jobs, job, user, artifact, revision = case
    page = revision.content["lesson"]["artifacts"][0]["content"]["studio"]["page"]
    old_layout = page.pop("layout")
    revision.content_hash = ns["content_hash"](revision.content)
    assert ns["ordinary_static_lesson"](revision.content) is None
    job.payload = ns["admit"](user, artifact, job.payload)
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    before = copy.deepcopy(revision.content)
    before["lesson"]["artifacts"][0]["content"]["studio"]["page"]["layout"] = old_layout
    revised = reply(before)
    output = revised["result"]["content"]["lesson"]["artifacts"][0]["content"]["studio"]["page"]
    output["legacyCompositionTypography"] = True
    ns["validate_receipt"](route, prepared, revised)
    output["legacyCompositionTypography"] = "invented"
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        ns["validate_receipt"](route, prepared, revised)
    page["layout"] = None
    revision.content_hash = ns["content_hash"](revision.content)
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="普通原生静态课件"):
        ns["admit"](user, artifact, job.payload)


def test_display_order_uses_zero_and_stable_ties_without_reordering_storage(case):
    ns, jobs, job, user, artifact, revision = case
    stored = revision.content["lesson"]["artifacts"]
    stored[0]["order"], stored[1]["order"], stored[2]["order"] = 9, 0, 0
    revision.content_hash = ns["content_hash"](revision.content)
    job.payload = ns["admit"](user, artifact, job.payload)
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    response = reply(revision.content, changed=2)
    metadata = response["result"]["content"]["revisionMetadata"]
    metadata["pageIds"] = ["two", "three"]
    for evidence, target in zip(metadata["renderEvidence"], metadata["pageIds"]):
        evidence["pageId"] = target
    ns["validate_receipt"](route, prepared, response)
    response["result"]["content"]["lesson"]["artifacts"].reverse()
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="标识或顺序"):
        ns["validate_receipt"](route, prepared, response)


def test_layout_source_selection_cannot_leak_to_unconfigured_legacy_route(case):
    ns, jobs, job, user, artifact, _ = case
    artifact.dojo_id = job.dojo_id = 42
    job.payload = {**job.payload, "instruction": REVISE + SOURCE_SELECTION}
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="取消源码选区"):
        ns["admit"](user, artifact, job.payload)
    jobs["ordinary_teaching_course"] = ns["ordinary_teaching_course"]
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="取消源码选区"):
        jobs["_runtime_payload"](job)


def test_revision_conflict_uses_lock_refreshed_artifact_before_creating_row(case):
    ns, _, _, user, loaded, _ = case
    refreshed = copy.copy(loaded)
    refreshed.current_revision = 3
    query_chain = ns["TeachingArtifacts"].query.filter_by.return_value.with_for_update.return_value
    query_chain.populate_existing.return_value.first.return_value = refreshed
    ns["RevisionConflict"] = type("RevisionConflict", (ValueError,), {})
    ns["db"] = MagicMock()
    source("artifacts", ns, functions={"create_revision"})
    with pytest.raises(ns["RevisionConflict"], match="changed from revision 2 to 3"):
        ns["create_revision"](loaded, user, expected_revision=2, instruction=REVISE, content={}, commit=False)
    query_chain.populate_existing.assert_called_once()
    ns["db"].session.add.assert_not_called()

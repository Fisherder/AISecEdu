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


def test_teacher_whole_deck_request_dispatches_pinned_saved_revision(case):
    ns, jobs, job, user, artifact, revision = case
    notes_namespace = dict(ns)
    source("ordinary_slide_notes", notes_namespace)
    instruction = "请把这份植物生长课件扩成 8 页"
    enqueue = MagicMock(return_value=(job, True))
    api = {
        "ordinary_slide_notes": SimpleNamespace(**notes_namespace),
        "artifact_for_user": lambda *_: artifact,
        "_supplied_idempotency": lambda *_: "revise-once",
        "TeachingJobs": SimpleNamespace(query=MagicMock()),
        "artifact_view": lambda _: {"revision": {"content": revision.content}},
        "artifact_revision_source_issue": lambda *_: None,
        "ordinary_slide_layout": jobs["ordinary_slide_layout"],
        "enqueue_job": enqueue, "job_view": lambda queued: {"id": queued.id},
        "_ok": lambda body, status: (body, status),
        "ScopeError": ns["ScopeError"],
    }
    api["TeachingJobs"].query.filter_by.return_value.first.return_value = None
    path = __import__("pathlib").Path(__file__).resolve().parents[1] / "dojo_plugin/api/v1/teaching.py"
    ast = __import__("ast")
    function = next(node for node in ast.parse(path.read_text()).body
                    if isinstance(node, ast.FunctionDef) and node.name == "revise_teacher_artifact")
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(path), "exec"), api)
    assert api["revise_teacher_artifact"](user, artifact.id, {"instruction": instruction, "expectedRevision": 2})[1] == 202
    job.payload = enqueue.call_args.kwargs["payload"]
    job.payload["currentContent"] = {"not": "trusted"}
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared, allow_degraded=True)
    request = jobs["_runtime_request_body"](job, route, prepared)
    assert request["scope"]["ordinaryTeaching"] == "deck-revision"
    assert request["payload"]["currentContent"] == revision.content
    assert request["payload"]["instruction"] == instruction
    assert ns["DECK_PIN"] not in request["payload"]
    assert route["required_model"] == "pinned-fixture"
    assert route["allow_degraded"] is False

    response = MagicMock(status_code=404)
    post = MagicMock(return_value=response)
    jobs.update(config=ns["config"], AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS=(), time=ns["time"],
                requests=SimpleNamespace(post=post), _runtime_read_timeout=lambda *_: 30,
                RuntimeJobError=lambda message, **kwargs: ValueError(message))
    with pytest.raises(ValueError, match="整套修订接口"):
        jobs["_invoke_agent_runtime"](job, route, prepared)
    post.assert_called_once()
    assert post.call_args.args == ("http://runtime.test/api/integration/jobs/ordinary-deck-revision",)
    assert post.call_args.kwargs["allow_redirects"] is False
    assert artifact.current_revision == 2


def test_whole_deck_rechecks_teacher_revision_before_persistence(case):
    ns, jobs, job, user, artifact, revision = case
    job.payload = ns["admit"](user, artifact, {
        **job.payload, "currentContent": revision.content, "instruction": "请统一整套课件的措辞",
    })
    artifact_query = ns["TeachingArtifacts"].query.filter_by.return_value
    artifact_query.first.return_value = artifact
    artifact_query.with_for_update.return_value.populate_existing.return_value.first.return_value = artifact
    ns["Users"].query.filter_by.return_value.first.return_value = user
    create_revision = MagicMock()
    jobs.update(TeachingArtifacts=ns["TeachingArtifacts"], Users=ns["Users"], create_revision=create_revision)
    original = copy.deepcopy(revision.content)
    ns["build_scope"].side_effect = ns["ScopeError"]("permission revoked")
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        jobs["_persist_result"](job, {"content": {"attempt": "should not persist"}})
    ns["build_scope"].side_effect = None
    artifact.current_revision = 3
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        jobs["_persist_result"](job, {"content": {"attempt": "stale"}})
    create_revision.assert_not_called()
    assert revision.content == original


def test_whole_deck_receipt_requires_official_usage_rendering_and_scope(case):
    ns, jobs, job, user, artifact, revision = case
    job.payload = ns["admit"](user, artifact, {
        **job.payload, "currentContent": revision.content, "instruction": "请统一整套课件的措辞",
    })
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    content = copy.deepcopy(revision.content)
    content["lesson"]["artifacts"][0]["outline"]["title"] = "比较叶片"
    content["revisionMetadata"] = {
        "mode": "ordinary-deck-revision", "recomposed": False, "pageIds": ["one"],
        "renderEvidence": [{
            "pageId": "one", "mode": "headless-chromium-dom-and-pixels", "sourceSha256": "a" * 64,
            "frames": [{"step": -1, "screenshotSha256": "b" * 64}], "inspectedAt": "now",
        }],
    }
    response = {
        "result": {"content": content},
        "model": {"provider": "deepseek", "actualModel": "pinned-fixture", "executionMode": "ordinary-deck-revision",
                  "degraded": False, "usage": {"inputTokens": 5, "outputTokens": 3, "totalTokens": 8}},
    }
    ns["validate_receipt"](route, prepared, response)
    for mutation in ("model", "render", "scope"):
        invalid = copy.deepcopy(response)
        if mutation == "model":
            invalid["model"]["actualModel"] = "legacy"
        elif mutation == "render":
            invalid["result"]["content"]["revisionMetadata"]["renderEvidence"] = []
        else:
            invalid["result"]["content"]["lesson"]["artifacts"][1]["outline"]["title"] = "未经修改授权"
        with pytest.raises(ns["OrdinarySlideLayoutError"]):
            ns["validate_receipt"](route, prepared, invalid)


@pytest.mark.parametrize("instruction", [
    "把整套课件改成暖色主题",
    "请统一整套课件的配色，然后润色所有标题",
    "请把整套课件的主题改成暖色",
    "Switch the deck to a warm color theme and refine the wording",
    "重新组织课件结构",
])
def test_style_and_other_generic_edits_keep_the_existing_native_dispatch(case, instruction):
    ns, _, job, user, artifact, revision = case
    payload = {**job.payload, "currentContent": revision.content, "instruction": instruction}
    assert ns["admit"](user, artifact, payload) is payload
    assert not ns["pinned"](payload)


def test_text_revision_can_ask_to_preserve_the_existing_style(case):
    ns, _, job, user, artifact, revision = case
    payload = {**job.payload, "currentContent": revision.content,
               "instruction": "保留现有配色和布局，让整套课件的措辞更清楚"}
    admitted = ns["admit"](user, artifact, payload)
    assert ns["deck_pinned"](admitted)


PALETTE_REQUEST = "请将整个课件换成蓝绿色主题"
ORIGINAL_PALETTE = {
    "background": "#FAFAFA", "foreground": "#171717", "muted": "#444444",
    "accent": "#215738", "secondary": "#826242", "surface": "#EEEEEE",
}
NEW_PALETTE = {
    "background": "#EEF6FA", "foreground": "#122233", "muted": "#334455",
    "accent": "#136052", "secondary": "#4C2357", "surface": "#D7E5E4",
}


def palette_source(case):
    ns, _, _, _, _, revision = case
    content = revision.content
    content["coursewareDesign"] = {
        "theme": {"name": "design", **ORIGINAL_PALETTE}, "private": "preserve actual metadata",
    }
    for i, slide in enumerate(content["lesson"]["artifacts"], 1):
        slide["order"] = 4 - i
        native = slide["content"]
        native["studio"]["theme"] = {"name": f"page {i}", **ORIGINAL_PALETTE}
        native["background"] = {"type": "solid", "color": ORIGINAL_PALETTE["background"]}
        native["elements"] = [
            {"type": "text", "id": "page-title", "left": 36,
             "defaultColor": ORIGINAL_PALETTE["foreground"],
             "content": '<p style="font-size:20px;color:#171717;line-height:1.2">叶片观察 #171717</p>'},
            {"type": "chart", "id": "evidence-chart", "left": 220, "data": {"series": [[1, 2]]},
             "themeColors": [ORIGINAL_PALETTE[role] for role in ("accent", "secondary", "muted")],
             "textColor": ORIGINAL_PALETTE["foreground"], "lineColor": ORIGINAL_PALETTE["surface"]},
        ]
    revision.content_hash = ns["content_hash"](content)
    return content


def palette_response(source, selection="all"):
    output = copy.deepcopy(source)
    displayed = ["three", "two", "one"]
    ids = displayed if selection == "all" else [displayed[page - 1] for page in selection]
    if selection == "all":
        output["coursewareDesign"]["theme"].update(NEW_PALETTE)
    for page in output["lesson"]["artifacts"]:
        native = page["content"]
        if native["studio"]["page"]["id"] not in ids:
            continue
        native["studio"]["theme"].update(NEW_PALETTE)
        native["background"]["color"] = NEW_PALETTE["background"]
        text, chart = native["elements"]
        text["defaultColor"] = NEW_PALETTE["foreground"]
        text["content"] = text["content"].replace("color:#171717;", "color:#122233;")
        chart["themeColors"] = [NEW_PALETTE[role] for role in ("accent", "secondary", "muted")]
        chart["textColor"] = NEW_PALETTE["foreground"]
        chart["lineColor"] = NEW_PALETTE["surface"]
    output["lesson"]["updatedAt"] = 1
    output["revisionMetadata"] = {
        "mode": "ordinary-deck-revision", "operation": "palette", "recomposed": False, "pageIds": ids,
        "renderEvidence": [
            {"pageId": page, "mode": "headless-chromium-dom-and-pixels", "sourceSha256": "a" * 64,
             "frames": [{"step": -1, "screenshotSha256": "b" * 64}], "inspectedAt": "now"} for page in ids
        ],
    }
    return {
        "result": {"content": output},
        "model": {"actualModel": "pinned-fixture", "executionMode": "ordinary-deck-revision", "provider": "deepseek",
                  "degraded": False, "usage": {"inputTokens": 5, "outputTokens": 3, "totalTokens": 8}},
    }


def test_palette_is_pinned_to_current_teacher_revision_and_resources(case):
    ns, jobs, job, user, artifact, revision = case
    source = palette_source(case)
    job.payload = ns["admit"](user, artifact, {
        **job.payload, "currentContent": source, "instruction": PALETTE_REQUEST, "deckOperation": "untrusted",
    })
    assert job.payload[ns["DECK_PIN"]]["operation"] == "palette"
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared, allow_degraded=True)
    request = jobs["_runtime_request_body"](job, route, prepared)
    assert request["scope"]["ordinaryTeaching"] == "deck-revision"
    assert request["payload"]["deckOperation"] == "palette"
    assert request["payload"]["currentContent"] == source
    assert ns["DECK_PIN"] not in request["payload"]
    assert route["required_model"] == "pinned-fixture" and not route["allow_degraded"]
    ns["validate_receipt"](route, prepared, palette_response(source))

    revision.content_hash = "0" * 64
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        jobs["_runtime_payload"](job)


@pytest.mark.parametrize("instruction", [
    "不要将整个课件换成蓝绿色主题",
    "请将整个课件换成蓝绿色主题，然后润色所有标题",
    "请增补两页并把整套课件改为暖色",
    "请把第1至2页的主题换成暖色",
    "请把整套课件做成海报式风格",
])
def test_palette_does_not_admit_negated_mixed_scoped_or_unknown_style(case, instruction):
    ns, _, job, user, artifact, _ = case
    source = palette_source(case)
    payload = {**job.payload, "currentContent": source, "instruction": instruction}
    admitted = ns["admit"](user, artifact, payload)
    assert (admitted.get(ns["DECK_PIN"]) or {}).get("operation") is None


def test_palette_with_unverifiable_native_background_is_not_admitted(case):
    ns, _, job, user, artifact, revision = case
    source = palette_source(case)
    source["lesson"]["artifacts"][0]["content"]["background"]["color"] = "#FFEEDD"
    revision.content_hash = ns["content_hash"](source)
    payload = {**job.payload, "currentContent": source, "instruction": PALETTE_REQUEST}
    assert ns["admit"](user, artifact, payload) is payload


@pytest.mark.parametrize("mutation", [
    "operation", "render_order", "geometry", "notes", "text", "layout", "series", "design",
    "unapproved_color", "outside_palette", "metadata", "drop_native_layer", "recompose", "boolean_chart_data",
])
def test_palette_receipt_rejects_tampering(case, mutation):
    ns, jobs, job, user, artifact, _ = case
    source = palette_source(case)
    job.payload = ns["admit"](user, artifact, {**job.payload, "currentContent": source, "instruction": PALETTE_REQUEST})
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    response = palette_response(source)
    output = response["result"]["content"]
    metadata = output["revisionMetadata"]
    native = output["lesson"]["artifacts"][0]["content"]
    page = native["studio"]["page"]
    if mutation == "operation":
        metadata["operation"] = "text"
    elif mutation == "render_order":
        metadata["renderEvidence"].reverse()
    elif mutation == "geometry":
        native["elements"][0]["left"] += 1
    elif mutation == "notes":
        native["speakerNotes"] = "改写了私有备注"
    elif mutation == "text":
        native["elements"][0]["content"] = native["elements"][0]["content"].replace("叶片", "树根")
    elif mutation == "layout":
        page["layout"]["title"]["left"] += 1
    elif mutation == "series":
        native["elements"][1]["data"]["series"] = [[2, 3]]
    elif mutation == "boolean_chart_data":
        native["elements"][1]["data"]["series"] = [[True, 2]]
    elif mutation == "design":
        output["coursewareDesign"]["private"] = "removed"
    elif mutation == "unapproved_color":
        native["studio"]["theme"]["foreground"] = "#FF0000"
    elif mutation == "outside_palette":
        native["elements"][0]["defaultColor"] = "#FF0000"
    elif mutation == "metadata":
        metadata["approved"] = True
    elif mutation == "drop_native_layer":
        del native["elements"]
    else:
        metadata["recomposed"] = True
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        ns["validate_receipt"](route, prepared, response)


@pytest.mark.parametrize(("instruction", "selection", "selected_ids"), [
    ("请将第2页换成蓝绿色主题", [2], ["two"]),
    ("请将第3、1页换成蓝绿色主题", [1, 3], ["three", "one"]),
    ("请把第2页的主题换成暖色", [2], ["two"]),
    ("请将第3、1、2页换成蓝绿色主题", [1, 2, 3], ["three", "two", "one"]),
])
def test_page_palette_pins_original_display_order_and_preserves_deck_theme(case, instruction, selection, selected_ids):
    ns, jobs, job, user, artifact, revision = case
    source = palette_source(case)
    job.payload = ns["admit"](user, artifact, {
        **job.payload, "currentContent": source, "instruction": instruction, "pageSelection": [99],
    })
    pin = job.payload[ns["DECK_PIN"]]
    assert pin["operation"] == "palette"
    assert pin["pageSelection"] == selection
    assert pin["revisionId"] == revision.id and pin["revisionSha256"] == revision.content_hash
    assert pin["instructionSha256"] == ns["content_hash"](instruction)
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared, allow_degraded=True)
    request = jobs["_runtime_request_body"](job, route, prepared)
    assert request["scope"]["ordinaryTeaching"] == "deck-revision"
    assert request["payload"]["deckOperation"] == "palette"
    assert request["payload"]["pageSelection"] == selection
    assert ns["DECK_PIN"] not in request["payload"]
    assert route["required_model"] == "pinned-fixture" and route["allow_degraded"] is False
    response = palette_response(source, selection)
    metadata = response["result"]["content"]["revisionMetadata"]
    assert metadata["pageIds"] == selected_ids
    ns["validate_receipt"](route, prepared, response)
    assert response["result"]["content"]["coursewareDesign"] == source["coursewareDesign"]

    # Losing the scope cannot turn a pinned page operation into a whole-deck revision.
    del pin["pageSelection"]
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        jobs["_runtime_payload"](job)


@pytest.mark.parametrize("instruction", [
    "请将第0页换成蓝绿色主题",
    "请将第1、1页换成蓝绿色主题",
    "请将第4页换成蓝绿色主题",
    "请将第121页换成蓝绿色主题",
])
def test_page_palette_rejects_invalid_or_out_of_range_display_pages(case, instruction):
    ns, _, job, user, artifact, _ = case
    source = palette_source(case)
    with pytest.raises(ns["OrdinarySlideLayoutError"], match="页码"):
        ns["admit"](user, artifact, {**job.payload, "currentContent": source, "instruction": instruction})


@pytest.mark.parametrize("mutation", ["design", "unselected", "page_ids", "evidence", "wire_selection", "model", "source"])
def test_page_palette_receipt_rejects_selection_escape(case, mutation):
    ns, jobs, job, user, artifact, _ = case
    source = palette_source(case)
    selection = [1, 3]
    job.payload = ns["admit"](user, artifact, {
        **job.payload, "currentContent": source, "instruction": "请将第3、1页换成蓝绿色主题",
    })
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    response = palette_response(source, selection)
    output = response["result"]["content"]
    metadata = output["revisionMetadata"]
    if mutation == "design":
        output["coursewareDesign"]["theme"].update(NEW_PALETTE)
    elif mutation == "unselected":
        output["lesson"]["artifacts"][1]["content"]["studio"]["theme"].update(NEW_PALETTE)
    elif mutation == "page_ids":
        metadata["pageIds"].reverse()
    elif mutation == "evidence":
        metadata["renderEvidence"][0]["pageId"] = "two"
    elif mutation == "wire_selection":
        prepared["pageSelection"] = [1, 2]
    elif mutation == "model":
        route["required_model"] = response["model"]["actualModel"] = "different-model"
    else:
        prepared["currentContent"] = {**source, "unexpected": True}
    with pytest.raises(ns["OrdinarySlideLayoutError"]):
        ns["validate_receipt"](route, prepared, response)


def test_whole_palette_historical_pin_generates_no_page_selection(case):
    ns, jobs, job, user, artifact, _ = case
    source = palette_source(case)
    job.payload = ns["admit"](user, artifact, {**job.payload, "currentContent": source, "instruction": PALETTE_REQUEST})
    assert "pageSelection" not in job.payload[ns["DECK_PIN"]]
    prepared = jobs["_runtime_payload"](job)
    assert "pageSelection" not in prepared
    route = ns["route_model"](job.kind, payload=prepared)
    ns["validate_receipt"](route, prepared, palette_response(source))



def test_page_palette_rechecks_display_order_after_receipt_before_saving(case):
    ns, jobs, job, user, artifact, revision = case
    source = palette_source(case)
    job.payload = ns["admit"](user, artifact, {
        **job.payload, "currentContent": source, "instruction": "请将第3、1页换成蓝绿色主题",
    })
    prepared = jobs["_runtime_payload"](job)
    route = ns["route_model"](job.kind, payload=prepared)
    response = palette_response(source, [1, 3])
    ns["validate_receipt"](route, prepared, response)

    artifact_query = ns["TeachingArtifacts"].query.filter_by.return_value
    artifact_query.first.return_value = artifact
    artifact_query.with_for_update.return_value.populate_existing.return_value.first.return_value = artifact
    ns["Users"].query.filter_by.return_value.first.return_value = user
    create_revision = MagicMock()
    jobs.update(TeachingArtifacts=ns["TeachingArtifacts"], Users=ns["Users"], create_revision=create_revision)
    revision.content = copy.deepcopy(source)
    revision.content["lesson"]["artifacts"][1]["order"] = 0
    revision.content_hash = ns["content_hash"](revision.content)

    with pytest.raises(ns["OrdinarySlideLayoutError"], match="课件版本"):
        jobs["_persist_result"](job, response["result"])
    artifact_query.with_for_update.assert_called_once()
    create_revision.assert_not_called()

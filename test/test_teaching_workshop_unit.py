import ast
import hashlib
import json
import os
from pathlib import Path
import re
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock
import sys

import pytest

from test_ordinary_debate_unit import load_source


def workshop_browser_check(monkeypatch, evidence_change=None, issues=None):
    from requests import RequestException

    class RuntimeJobError(RuntimeError):
        def __init__(self, message, *, category):
            super().__init__(message)
            self.category = category

    jobs = ModuleType("_workshop_fixture.jobs")
    jobs.RuntimeJobError = RuntimeJobError
    jobs.PermanentJobError = ValueError
    monkeypatch.setitem(sys.modules, jobs.__name__, jobs)
    monkeypatch.setenv("AISECEDU_TEACHING_WORKSHOP_INSPECTOR_URL", "http://private-inspector")
    client = MagicMock()

    def inspect(_url, *, data, **_kwargs):
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {
            "issues": [] if issues is None else issues,
            "evidence": {"sourceSha256": hashlib.sha256(data).hexdigest(),
                         "frames": [{"step": -1, "screenshotSha256": "a" * 64}],
                         **(evidence_change or {})},
        })

    client.__enter__.return_value.post.side_effect = inspect
    source = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/teaching_workshop.py"
    function = next(node for node in ast.parse(source.read_text()).body
                    if getattr(node, "name", None) == "_verify_slide_render")
    namespace = {"__package__": "_workshop_fixture", "os": os, "json": json, "hashlib": hashlib,
                 "re": re, "config": SimpleNamespace(AGENT_RUNTIME_SERVICE_SECRET="fixture"),
                 "requests": SimpleNamespace(Session=lambda: client, RequestException=RequestException)}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), namespace)
    return namespace["_verify_slide_render"], RuntimeJobError


SLIDE = {"id": "page-1", "order": 0, "content": {"studio": {"page": {"title": "水循环", "beats": []}}}}


def test_workshop_keeps_receipt_for_a_rendered_page(monkeypatch):
    verify, _ = workshop_browser_check(monkeypatch)
    evidence = verify(SLIDE)
    assert evidence["page"] == "page-1"
    assert evidence["frames"] == [{"step": -1, "screenshotSha256": "a" * 64}]


@pytest.mark.parametrize("broken_evidence", [{"sourceSha256": "a" * 64}, {"frames": []}])
def test_workshop_rejects_mismatched_render_receipts(monkeypatch, broken_evidence):
    verify, failure = workshop_browser_check(monkeypatch, evidence_change=broken_evidence)
    with pytest.raises(failure, match="逐帧校验回执"):
        verify(SLIDE)


def test_workshop_rejects_page_when_browser_finds_clipped_text(monkeypatch):
    verify, _ = workshop_browser_check(monkeypatch, issues=["Title lies outside the canvas"])
    with pytest.raises(ValueError, match="第 1 页排版未通过"):
        verify(SLIDE)


def test_teacher_can_choose_visual_types_and_revise_the_preference():
    source = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/teaching_workshop.py"
    nodes = [node for node in ast.parse(source.read_text()).body
             if getattr(node, "name", None) == "_requested_visuals"
             or (isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) == "_VISUAL_WORDS")]
    ns = {"re": re}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), ns)
    assert ns["_requested_visuals"](["四页课件，放流程关系图、示意数据图表。"]) == ["chart", "diagram"]
    assert ns["_requested_visuals"](["用对比表和折线图。", "不要图表，改用结构图。"]) == ["comparison", "diagram"]


def test_workshop_resumes_a_cinematic_job_without_deck_only_fields():
    source = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/teaching_workshop.py"
    ast_nodes = ast.parse(source.read_text()).body
    reference = {"kind": "cinematic", "profile": "gate-valve", "phase": "intake"}
    # Stop after the model receives the validated durable input.
    class ModelReached(Exception):
        pass

    def turn(_root, _secret, _model, payload):
        assert payload == reference
        raise ModelReached

    fixture = ModuleType("_cinematic_fixture.jobs")
    fixture.PermanentJobError = ValueError
    fixture.RuntimeJobError = RuntimeError
    fixture.heartbeat = lambda job, **_: job
    with pytest.MonkeyPatch.context() as patch:
        patch.setitem(sys.modules, fixture.__name__, fixture)
        ns = {"__package__": "_cinematic_fixture", "PIN": "workshop", "intake": lambda *_: dict(reference),
              "_turn": turn, "teacher_dsh_chat": SimpleNamespace(_connection=lambda: ("root", "secret", "model"))}
        invoke = next(node for node in ast_nodes if getattr(node, "name", None) == "invoke")
        exec(compile(ast.Module(body=[invoke], type_ignores=[]), str(source), "exec"), ns)
        with pytest.raises(ModelReached):
            ns["invoke"](SimpleNamespace(result={}), {"prompt": "制作闸阀三维演示", "workshop": reference})

@pytest.mark.parametrize(("brief", "kind", "profile"), [
    ("生成一个三维方针", "cinematic", "primitives"),
    ("请做一个 3D 插针", "cinematic", "primitives"),
    ("请制作三维长方体", "cinematic", "primitives"),
    ("请制作三维闸阀", "cinematic", "gate-valve"),
    ("请制作五页课件，包含三维立方体", "deck", None),
    ("做个动态仿真，主题是植物吸收水分", "simulation", None),
])
def test_bare_three_dimensional_subject_uses_the_native_scene_workshop(brief, kind, profile):
    namespace = {}
    load_source("ordinary_project_queue", namespace)
    namespace["ordinary_courseware"] = SimpleNamespace(
        brief=lambda prompt: ("demo" if "仿真" in prompt else "slides", prompt),
    )
    load_source("teaching_workshop", namespace)
    result = namespace["intake"](brief)
    assert (result["kind"], result.get("profile")) == (kind, profile)
    with pytest.raises(ValueError, match="普通科学或工程模型"):
        namespace["intake"]("请设计三维立方体武器")

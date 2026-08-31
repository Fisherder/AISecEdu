import importlib.util
import pathlib
import re

import pytest


ROOT = pathlib.Path(__file__).parents[1]


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = load_module("aisecedu_product_contracts", "dojo_plugin/product/contracts.py")
TELEMETRY = load_module("aisecedu_product_telemetry", "dojo_plugin/product/telemetry.py")


def test_state_domains_match_the_system_contract_and_unknown_never_becomes_success():
    assert CONTRACTS.STATE_DOMAINS["view"] == {
        "initial", "loading", "ready", "empty", "degraded", "error", "stale", "forbidden",
    }
    assert CONTRACTS.STATE_DOMAINS["runtime"] == {
        "none", "provisioning", "running", "stopping", "stopped", "expired", "failed",
    }
    assert CONTRACTS.normalize_state("workflow", "unexpected-provider-state") == {
        "state": "needs_review",
        "known": False,
        "rawState": "unexpected_provider_state",
    }
    assert CONTRACTS.normalize_state("view", "unexpected-provider-state")["state"] == "error"
    with pytest.raises(ValueError):
        CONTRACTS.normalize_state("made_up_domain", "ready")


def test_success_and_error_envelopes_are_versioned_and_recovery_ready():
    success = CONTRACTS.success_envelope({"items": []}, request_id="req_test")
    assert set(success) == {"success", "data", "meta"}
    assert success["success"] is True
    assert success["meta"]["requestId"] == "req_test"
    assert success["meta"]["contractVersion"] == "2026-08-28"

    error = CONTRACTS.error_envelope(
        "RESOURCE_MOVED",
        "这项内容已经移动。",
        request_id="req_test",
        status=410,
        recovery={"label": "打开新位置", "href": "/student"},
    )
    assert set(error) == {"success", "error", "meta"}
    assert error["success"] is False
    assert error["error"]["status"] == 410
    assert error["error"]["recovery"]["href"] == "/student"


def test_resource_summary_and_published_schema_have_the_same_required_shape():
    summary = CONTRACTS.ResourceSummary(
        id="challenge_opaque",
        type="challenge",
        title="SQL 登录绕过",
        capabilities=("view", "attempt"),
    ).as_dict()
    schema = CONTRACTS.PRODUCT_CONTRACT_SCHEMAS["resourceSummary"]
    assert set(schema["required"]) == set(summary)
    assert summary["capabilities"] == ["view", "attempt"]
    assert CONTRACTS.PRODUCT_CONTRACT_SCHEMAS["$defs"]["meta"]["properties"]["contractVersion"] == {
        "const": CONTRACTS.CONTRACT_VERSION,
    }


def test_privacy_event_allowlist_rejects_sensitive_fields_at_any_depth():
    safe = TELEMETRY.sanitize_event(
        {
            "name": "resource_action_completed",
            "eventVersion": 1,
            "journeyId": "ephemeral",
            "resource": {"type": "challenge", "id": "internal-42", "extra": "discard"},
            "client": {
                "viewportClass": "mobile",
                "offline": False,
                "userAgent": "discard",
            },
        }
    )
    assert safe["resource"] == {
        "type": "challenge",
        "idHash": TELEMETRY.opaque_scope_id("internal-42"),
    }
    assert safe["client"] == {"viewportClass": "mobile", "offline": False}

    for payload in (
        {"client": {"token": "secret"}},
        {"resource": {"metadata": {"flag": "secret"}}},
        {"items": [{"student_text": "private"}]},
        {"prompt": "private"},
    ):
        with pytest.raises(ValueError):
            TELEMETRY.sanitize_event(payload)
    with pytest.raises(ValueError):
        TELEMETRY.sanitize_event({"name": "arbitrary_event", "surface": "course"})


def test_shared_frontend_components_cover_every_canonical_view_state():
    source = (ROOT / "dojo_theme/static/js/dojo/components/async-boundary.js").read_text()
    for state in CONTRACTS.STATE_DOMAINS["view"]:
        assert f'"{state}"' in source
    base = (ROOT / "dojo_theme/templates/base.html").read_text()
    for component in ("recovery-panel.js", "status-badge.js", "async-boundary.js"):
        assert component in base


def test_course_materials_offer_live_preview_and_original_download():
    source = (ROOT / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    template = (ROOT / "dojo_theme/templates/teacher_courses.html").read_text()
    backend = (ROOT / "dojo_plugin/api/v1/teaching.py").read_text()

    assert 'data-material-preview="${escape(item.id)}"' in source
    assert 'class="cs-material-download"' in source
    assert 'id="cs-material-preview-dialog"' in template
    assert 'id="cs-material-preview-download"' in template
    assert '@teaching_namespace.route("/materials/<string:material_id>/preview")' in backend
    assert 'as_attachment=False' in backend
    assert '"previewMode": _material_preview_mode(material)' in backend


def test_ellipsis_menus_float_above_clipping_and_close_consistently():
    source = (ROOT / "dojo_theme/static/js/dojo/ui.js").read_text()
    styles = (ROOT / "dojo_theme/static/css/product-shell.css").read_text()
    minified_styles = (ROOT / "dojo_theme/static/css/product-shell.min.css").read_text()
    base = (ROOT / "dojo_theme/templates/base.html").read_text()

    assert "document.body.appendChild(parts.panel)" in source
    assert 'panel.style.setProperty("left",' in source
    assert 'panel.style.setProperty("top",' in source
    assert 'panel.style.setProperty("right", "auto", "important")' in source
    assert 'panel.style.setProperty("bottom", "auto", "important")' in source
    assert 'document.addEventListener("pointerdown"' in source
    assert 'event.key !== "Escape"' in source
    assert 'window.addEventListener("scroll"' in source
    assert "new MutationObserver" in source
    assert ".aisecedu-floating-menu" in styles
    assert "inset: auto !important" not in styles
    assert "aisecedu-product-shell-v9-floating-menu" in base
    assert "aisecedu-product-shell-source-v6-floating-menu" in minified_styles
    assert "aisecedu-ui-v7-floating-menu" in base


def test_xuanjia_is_the_only_user_facing_product_name():
    legacy_brand = re.compile(
        r"(?<![.\w-])AISecEdu(?=$|[\s·，,。:：'\"<])"
        r"|(?<![\w])AISECEDU(?=$|[\s·，,。:：'\"<])"
    )
    surface_roots = (
        ROOT / "dojo_theme/templates",
        ROOT / "dojo_theme/static/js",
        ROOT / "dojo_theme/static/img",
        ROOT / "dojo_plugin/agent_runtime",
        ROOT / "dojo_plugin/api",
        ROOT / "dojo_plugin/learning",
        ROOT / "dojo_plugin/product",
        ROOT / "services/agent-runtime/app",
        ROOT / "services/agent-runtime/components",
        ROOT / "services/agent-runtime/lib",
        ROOT / "workspace/services/desktop/share/backgrounds",
        ROOT / "grafana",
    )
    text_suffixes = {
        ".css", ".html", ".js", ".json", ".md", ".py",
        ".svg", ".ts", ".tsx", ".yaml", ".yml",
    }
    offenders = []
    for surface_root in surface_roots:
        if not surface_root.exists():
            continue
        for path in surface_root.rglob("*"):
            if not path.is_file() or path.suffix not in text_suffixes:
                continue
            lines = path.read_text(encoding="utf-8").splitlines()
            for line_number, line in enumerate(lines, 1):
                if legacy_brand.search(line):
                    offenders.append(f"{path.relative_to(ROOT)}:{line_number}")

    assert not offenders, "旧产品名称仍出现在用户可见内容中：" + ", ".join(offenders)
    navbar = (ROOT / "dojo_theme/templates/components/navbar.html").read_text(
        encoding="utf-8"
    )
    config = (ROOT / "dojo_plugin/config.py").read_text(encoding="utf-8")
    assert '<strong>玄甲</strong>' in navbar
    assert 'set_config("ctf_name", "玄甲")' in config

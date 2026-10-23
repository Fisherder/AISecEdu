"""A failed old-PPT conversion must not become a misleading READY index."""

import importlib.util
import hashlib
import io
from pathlib import Path
import zipfile

import pytest


SOURCE = Path(__file__).resolve().parents[1] / "dojo_plugin/agent_runtime/local_extract.py"


@pytest.fixture
def extractor():
    spec = importlib.util.spec_from_file_location("local_extract_for_test", SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_ppt_conversion_failure_cannot_fall_back_to_template_text(extractor, monkeypatch):
    monkeypatch.setattr(
        extractor, "_legacy_presentation_text",
        lambda _raw: (_ for _ in ()).throw(ValueError("conversion failed")),
    )
    monkeypatch.setattr(
        extractor, "_legacy_office_text",
        lambda *_args: (_ for _ in ()).throw(AssertionError("catppt must not run")),
    )

    with pytest.raises(ValueError, match="conversion failed"):
        extractor.extract_local_text("lesson.ppt", b"legacy-ppt-bytes")


def test_image_only_pptx_uses_page_rendering_instead_of_page_markers(extractor, monkeypatch):
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("ppt/slides/slide1.xml", "<slide/>")
        archive.writestr("ppt/slides/slide2.xml", "<slide/>")
    seen = []

    def rendered(raw, suffix=".ppt"):
        seen.append((raw, suffix))
        return "第 1 页\n从图片识别的完整教学内容"

    monkeypatch.setattr(extractor, "_legacy_presentation_text", rendered)
    assert extractor.extract_local_text("lesson.pptx", archive_bytes.getvalue()).endswith("完整教学内容")
    assert seen == [(archive_bytes.getvalue(), ".pptx")]


def test_text_pptx_does_not_rerender(extractor, monkeypatch):
    archive_bytes = io.BytesIO()
    paragraph = '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>概率论中随机变量及其分布的教学正文，包含定义、性质和完整应用例题。</a:t></a:p>'
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("ppt/slides/slide1.xml", f"<slide>{paragraph * 3}</slide>")
    monkeypatch.setattr(
        extractor, "_legacy_presentation_text",
        lambda *_args: (_ for _ in ()).throw(AssertionError("render not needed")),
    )
    assert "随机变量" in extractor.extract_local_text("lesson.pptx", archive_bytes.getvalue())


def test_worker_index_verifies_file_and_covers_every_character(extractor, monkeypatch, tmp_path):
    source = tmp_path / "owner" / "source.pptx"
    source.parent.mkdir()
    source.write_bytes(b"trusted source bytes")
    monkeypatch.setattr(extractor, "extract_local_text", lambda _name, _raw: "课程正文" * 2_001)

    response = extractor.index_verified_local_source(
        root=tmp_path,
        storage_key="owner/source.pptx",
        filename="lesson.pptx",
        mime_type="text/plain",
        size=source.stat().st_size,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    )
    chunks = response["result"]["chunks"]
    coverage = response["result"]["analysis"]["coverage"]
    assert len(chunks) > 1
    assert "".join(chunk["content"] for chunk in chunks) == "课程正文" * 2_001
    assert coverage["indexedCharacters"] == coverage["extractedCharacters"] == 8_004
    assert response["model"]["executionMode"] == "source-index-worker"


def test_worker_index_rejects_substituted_or_external_source(extractor, monkeypatch, tmp_path):
    source = tmp_path / "source.pptx"
    source.write_bytes(b"substituted")
    monkeypatch.setattr(
        extractor, "extract_local_text",
        lambda *_args: (_ for _ in ()).throw(AssertionError("unverified bytes must not parse")),
    )
    with pytest.raises(ValueError, match="校验失败"):
        extractor.index_verified_local_source(
            root=tmp_path, storage_key="source.pptx", filename="lesson.pptx",
            mime_type="text/plain", size=source.stat().st_size,
            sha256=hashlib.sha256(b"original").hexdigest(),
        )
    with pytest.raises(ValueError, match="原件不可用"):
        extractor.index_verified_local_source(
            root=tmp_path / "private", storage_key="../source.pptx", filename="lesson.pptx",
            mime_type="text/plain", size=source.stat().st_size,
            sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        )

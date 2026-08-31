import hashlib
import importlib.util
import json
from pathlib import Path
import types
import zipfile

import pytest


_FILES_PATH = (
    Path(__file__).resolve().parents[1] / "dojo_plugin" / "agent_runtime" / "files.py"
)
_FILES_SPEC = importlib.util.spec_from_file_location(
    "aisecedu_agent_files", _FILES_PATH
)
assert _FILES_SPEC and _FILES_SPEC.loader
files = importlib.util.module_from_spec(_FILES_SPEC)
_FILES_SPEC.loader.exec_module(files)


def sample_document():
    return {
        "title": "缓冲区溢出基础教案",
        "subtitle": "软件安全 · 90 分钟",
        "sections": [
            {
                "heading": "教学目标",
                "level": 2,
                "paragraphs": ["理解栈帧、局部缓冲区与返回地址的关系。"],
                "bullets": ["定位不安全输入", "完成隔离环境验证"],
                "tables": [
                    {
                        "headers": ["环节", "时间"],
                        "rows": [["概念讲解", "20 分钟"], ["CTF 实践", "45 分钟"]],
                    }
                ],
            }
        ],
    }


def test_agent_docx_is_real_persisted_downloadable_file(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "_storage_root", lambda: tmp_path.resolve())
    job = types.SimpleNamespace(id="job-1", owner_id=42)
    stored = files.persist_agent_deliverables(
        job,
        [
            {
                "filename": "缓冲区溢出基础教案.docx",
                "format": "docx",
                "title": "缓冲区溢出基础教案",
                "document": sample_document(),
            }
        ],
    )

    assert len(stored) == 1
    public = files.public_agent_file(stored[0])
    assert public["downloadUrl"].endswith(f"/files/{stored[0]['id']}")
    assert "storageKey" not in public
    path = files.agent_file_path(stored[0])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == stored[0]["sha256"]
    with zipfile.ZipFile(path) as archive:
        assert "word/document.xml" in archive.namelist()
        document_xml = archive.read("word/document.xml").decode("utf-8")
        assert "缓冲区溢出基础教案" in document_xml
        assert "教学目标" in document_xml


@pytest.mark.parametrize("file_format", ["md", "txt", "json", "csv", "html", "ipynb"])
def test_agent_file_formats_render(file_format):
    deliverable = {
        "filename": f"教学文件.{file_format}",
        "format": file_format,
        "document": sample_document(),
    }
    if file_format == "csv":
        deliverable["data"] = [{"知识点": "栈帧", "状态": "已覆盖"}]
    if file_format == "json":
        deliverable["data"] = {"result": "ok"}
    rendered = files.render_deliverable(deliverable)
    assert rendered["content"]
    assert rendered["filename"].endswith(f".{file_format}")
    if file_format in {"json", "ipynb"}:
        json.loads(rendered["content"].decode("utf-8"))


def test_html_markdown_fence_is_removed_and_fragment_is_wrapped():
    fenced = files.render_deliverable(
        {
            "filename": "完整教案.html",
            "format": "html",
            "content": """```html
<!doctype html><html><body><h1>缓冲区溢出基础</h1><p>理解栈帧、边界检查和返回地址覆盖之间的关系。</p></body></html>
```""",
        }
    )["content"].decode("utf-8")
    assert fenced.lower().startswith("<!doctype html>")
    assert "```" not in fenced
    assert "理解栈帧" in fenced

    fragment = files.render_deliverable(
        {
            "filename": "片段教案.html",
            "format": "html",
            "title": "缓冲区溢出教案",
            "content": (
                "<main><h1>教学目标</h1><p>通过调试实验观察邻接变量被覆盖的过程，"
                "并解释边界检查缺失造成的安全后果。</p></main>"
            ),
        }
    )["content"].decode("utf-8")
    assert fragment.lower().startswith("<!doctype html>")
    assert "<body><main>" in fragment
    assert "邻接变量" in fragment


@pytest.mark.parametrize(
    "deliverable",
    [
        {"filename": "空教案.html", "format": "html", "document": {}},
        {
            "filename": "空壳.html",
            "format": "html",
            "content": (
                "<!doctype html><html><head><style>body{font-size:16px}</style></head>"
                "<body></body></html>"
            ),
        },
        {
            "filename": "标题占位.html",
            "format": "html",
            "content": "<!doctype html><html><body><h1>教案</h1></body></html>",
        },
    ],
)
def test_empty_or_placeholder_html_is_rejected(deliverable):
    with pytest.raises(ValueError, match="substantive visible body"):
        files.render_deliverable(deliverable)


def test_agent_file_semantics_are_rechecked_on_download(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "_storage_root", lambda: tmp_path.resolve())
    content = (
        b"<!doctype html><html><head><title>empty</title></head><body></body></html>"
    )
    digest = hashlib.sha256(content).hexdigest()
    storage_key = "7/job-empty/file_empty.html"
    path = tmp_path / storage_key
    path.parent.mkdir(parents=True)
    path.write_bytes(content)
    value = {
        "id": "file_" + "a" * 32,
        "jobId": "job-empty",
        "filename": "empty.html",
        "title": "empty",
        "format": "html",
        "mimeType": "text/html; charset=utf-8",
        "size": len(content),
        "sha256": digest,
        "storageKey": storage_key,
    }
    with pytest.raises(ValueError, match="substantive visible body"):
        files.agent_file_path(value)


def test_multi_file_persistence_is_atomic_when_one_deliverable_is_empty(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(files, "_storage_root", lambda: tmp_path.resolve())
    job = types.SimpleNamespace(id="job-atomic", owner_id=7)
    with pytest.raises(ValueError, match="substantive visible body"):
        files.persist_agent_deliverables(
            job,
            [
                {
                    "filename": "valid.md",
                    "format": "md",
                    "content": "# 完整结果\n\n这里是可以直接使用的教学内容。",
                },
                {"filename": "empty.html", "format": "html", "document": {}},
            ],
        )
    assert list(tmp_path.rglob("*")) == []


def test_generated_file_integrity_is_checked(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "_storage_root", lambda: tmp_path.resolve())
    job = types.SimpleNamespace(id="job-2", owner_id=7)
    stored = files.persist_agent_deliverables(
        job,
        [{"filename": "result.md", "format": "md", "content": "# result"}],
    )[0]
    path = files.agent_file_path(stored)
    path.write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="metadata"):
        files.agent_file_path(stored)

"""Read-only previews of files already delivered to a conversation."""

from contextlib import contextmanager
import csv
import fcntl
import io
import itertools
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

from flask import Response

_MAX_PAGES = 80
_MAX_PDF_BYTES = 24 * 1024 * 1024
_MAX_TEXT = 256_000
_MAX_ROWS = 120
_MAX_COLUMNS = 32
_MAX_CELL = 1000
_HTML_POLICY = ("sandbox; default-src 'none'; style-src 'unsafe-inline'; "
                "img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")


class PreviewUnavailable(Exception):
    pass


class PreviewTooLarge(PreviewUnavailable):
    pass


def _run(arguments, timeout):
    try:
        return subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              check=True, timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        raise PreviewUnavailable("暂时无法渲染这份文件。你仍可下载原文件。") from None


@contextmanager
def _conversion_lock(path):
    with path.open("a+b") as handle:
        deadline = time.monotonic() + 5
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise PreviewUnavailable("同一份文件正在排版，请稍后重试。") from None
                time.sleep(0.15)
        yield


def _office_pdf(source, digest):
    cached = source.with_name(f".{source.stem}-{digest[:16]}.preview-v1.pdf")
    if cached.is_file():
        return cached
    with _conversion_lock(cached.with_suffix(".lock")):
        if cached.is_file():
            return cached
        with tempfile.TemporaryDirectory(prefix=".preview-", dir=source.parent) as temporary:
            root = Path(temporary)
            _run(["soffice", "-env:UserInstallation=" + (root / "office-profile").as_uri(),
                  "--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", str(root), str(source)], 22)
            output = root / (source.stem + ".pdf")
            if not output.is_file() or not output.stat().st_size:
                raise PreviewUnavailable("Word 文件排版失败。你仍可下载原文件。")
            if output.stat().st_size > _MAX_PDF_BYTES:
                raise PreviewTooLarge("Word 预览过大，请下载原文件查看。")
            _page_metadata(output)
            output.chmod(0o600)
            output.replace(cached)
    return cached


def _page_metadata(pdf):
    info = _run(["pdfinfo", str(pdf)], 4).decode("utf-8", "replace")
    count = re.search(r"^Pages:\s*(\d+)\s*$", info, re.M)
    size = re.search(r"^Page size:\s*([0-9.]+)\s+x\s+([0-9.]+)\s+pts", info, re.M)
    if not count or not size:
        raise PreviewUnavailable("无法读取文档页码。你仍可下载原文件。")
    total = int(count[1])
    width, height = float(size[1]), float(size[2])
    if not 1 <= total <= _MAX_PAGES or not 36 <= width <= 2880 or not 36 <= height <= 2880:
        raise PreviewTooLarge("文档页数或页面尺寸超出在线预览范围，请下载原文件。")
    return {"kind": "pages", "pages": total, "width": width, "height": height}


def preview_manifest(source, public_file):
    file_format = public_file["format"]
    if file_format == "docx":
        return _page_metadata(_office_pdf(source, public_file["sha256"]))
    if file_format == "html":
        return {"kind": "html"}
    if file_format == "csv":
        try:
            rows = list(itertools.islice(csv.reader(io.StringIO(source.read_text(encoding="utf-8-sig"))), _MAX_ROWS + 1))
        except (csv.Error, UnicodeError):
            raise PreviewUnavailable("表格无法读取。你仍可下载原文件。") from None
        truncated = len(rows) > _MAX_ROWS or any(
            len(row) > _MAX_COLUMNS or any(len(cell) > _MAX_CELL for cell in row) for row in rows
        )
        return {"kind": "table", "truncated": truncated,
                "rows": [[cell[:_MAX_CELL] for cell in row[:_MAX_COLUMNS]] for row in rows[:_MAX_ROWS]]}
    with source.open("r", encoding="utf-8-sig", errors="replace") as handle:
        text = handle.read(_MAX_TEXT + 1)
    if file_format == "ipynb" and len(text) <= _MAX_TEXT:
        try:
            cells = json.loads(text).get("cells", [])
            if not isinstance(cells, list):
                raise ValueError("Invalid notebook cells")
            return {"kind": "notebook", "truncated": len(cells) > 60, "cells": [
                {"kind": cell.get("cell_type"), "source": "".join(cell.get("source") or "")}
                for cell in cells[:60] if isinstance(cell, dict)
            ]}
        except (AttributeError, ValueError, TypeError):
            pass
    return {"kind": "markdown" if file_format == "md" else "text",
            "text": text[:_MAX_TEXT], "truncated": len(text) > _MAX_TEXT}


def preview_page(source, public_file, page):
    if public_file["format"] != "docx" or not re.fullmatch(r"[1-9][0-9]?", page) or int(page) > _MAX_PAGES:
        raise ValueError("Preview page not found")
    pdf = _office_pdf(source, public_file["sha256"])
    if int(page) > _page_metadata(pdf)["pages"]:
        raise ValueError("Preview page not found")
    image = _run(["pdftoppm", "-jpeg", "-scale-to", "1920", "-f", page, "-l", page,
                  "-singlefile", str(pdf)], 10)
    if not image.startswith(b"\xff\xd8"):
        raise PreviewUnavailable("此页无法渲染，请重试。")
    return Response(image, mimetype="image/jpeg")


def preview_html(source, public_file):
    if public_file["format"] != "html":
        raise ValueError("HTML preview not found")
    response = Response(source.read_bytes(), content_type="text/html; charset=utf-8")
    response.headers["Content-Security-Policy"] = _HTML_POLICY
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

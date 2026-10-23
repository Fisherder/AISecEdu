"""Bounded, local text extraction for uploaded teaching material."""

import hashlib
import io
import json
import os
import pathlib
import pwd
import re
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile


LOCAL_SUFFIXES = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MAX_TEXT_CHARS = 950_000
MAX_XML_BYTES = 16 * 1024 * 1024
MAX_IMAGE_OCR_BYTES = 30 * 1024 * 1024
MAX_SOURCE_BYTES = 50 * 1024 * 1024
MAX_PRESENTATION_PAGES = 250
MAX_PRESENTATION_OCR_PAGES = 100
PRESENTATION_OCR_BUDGET_SECONDS = 240
MAX_PDF_PAGES = 250
MAX_PDF_OCR_PAGES = 100
PDF_OCR_BUDGET_SECONDS = 240


def _visible_characters(value):
    return len(re.sub(r"\s+", "", str(value or "")))


def locally_extractable(filename):
    return pathlib.Path(filename).suffix.lower() in LOCAL_SUFFIXES


def _run(command, raw=None, *, timeout=45):
    try:
        result = subprocess.run(
            command, input=raw, capture_output=True, timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError("本地资料解析服务暂不可用，请稍后重新分析。") from exc
    if result.returncode:
        raise ValueError(
            "资料内容无法提取；请确认文件未损坏，或导出为 PDF 后重试。"
        )
    return result.stdout.decode("utf-8", errors="replace")


def _xml(archive, name):
    entry = archive.getinfo(name)
    if entry.file_size > MAX_XML_BYTES:
        raise ValueError("Office 文档中的单个文本部分过大，请拆分后重试。")
    return ET.fromstring(archive.read(name))


def _word_text(archive):
    names = sorted(
        name for name in archive.namelist()
        if name == "word/document.xml" or re.fullmatch(
            r"word/(?:header|footer|footnotes|endnotes)\d*\.xml", name
        )
    )
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    lines = []
    for name in names:
        root = _xml(archive, name)
        for paragraph in root.iter(namespace + "p"):
            line = "".join(
                element.text or "" if element.tag == namespace + "t"
                else "\t" if element.tag == namespace + "tab" else ""
                for element in paragraph.iter()
            ).strip()
            if line:
                lines.append(line)
    return "\n".join(lines)


def _presentation_text(archive):
    slide_names = [name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)]
    slide_names.sort(key=lambda name: int(re.search(r"slide(\d+)", name).group(1)))
    if not slide_names or len(slide_names) > MAX_PRESENTATION_PAGES:
        raise ValueError("课件页数超出后台解析范围，请拆分后重试。")
    namespace = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    pages = []
    for number, name in enumerate(slide_names, 1):
        root = _xml(archive, name)
        lines = []
        for paragraph in root.iter(namespace + "p"):
            text = "".join(part.text or "" for part in paragraph.iter(namespace + "t")).strip()
            if text:
                lines.append(text)
        notes_name = f"ppt/notesSlides/notesSlide{number}.xml"
        if notes_name in archive.namelist():
            notes = _xml(archive, notes_name)
            note_text = "\n".join(
                "".join(part.text or "" for part in paragraph.iter(namespace + "t")).strip()
                for paragraph in notes.iter(namespace + "p")
            ).strip()
            if note_text:
                lines.append("讲稿：" + note_text)
        pages.append(f"第 {number} 页\n" + "\n".join(lines))
    return "\n\n".join(pages)


def _spreadsheet_text(archive):
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        for item in _xml(archive, "xl/sharedStrings.xml").iter(namespace + "si"):
            shared.append("".join(part.text or "" for part in item.iter(namespace + "t")))
    sheets = [name for name in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)]
    sheets.sort(key=lambda name: int(re.search(r"sheet(\d+)", name).group(1)))
    lines = []
    for number, name in enumerate(sheets, 1):
        lines.append(f"工作表 {number}")
        root = _xml(archive, name)
        for row in root.iter(namespace + "row"):
            cells = []
            for cell in row.iter(namespace + "c"):
                value = cell.find(namespace + "v")
                inline = cell.find(namespace + "is")
                formula = cell.find(namespace + "f")
                text = value.text if value is not None else ""
                if cell.attrib.get("t") == "s" and text:
                    try:
                        text = shared[int(text)]
                    except (IndexError, ValueError):
                        text = ""
                elif inline is not None:
                    text = "".join(part.text or "" for part in inline.iter(namespace + "t"))
                if formula is not None and formula.text:
                    text = f"{text or ''} (公式：{formula.text})"
                if text:
                    cells.append(f"{cell.attrib.get('r', '')}: {text}")
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _ocr(raw, prefix=None, *, timeout=75):
    if len(raw) > MAX_IMAGE_OCR_BYTES:
        raise ValueError("图片超过本地 OCR 限制，请压缩后重试。")
    return _run((prefix or []) + ["tesseract", "stdin", "stdout", "-l", "chi_sim+eng", "--psm", "3"], raw, timeout=timeout)


def _pdf_text(raw):
    with tempfile.TemporaryDirectory(prefix="aisecedu-pdf-ocr-") as directory:
        source = pathlib.Path(directory) / "source.pdf"
        source.write_bytes(raw)
        info = _run(["pdfinfo", str(source)], timeout=20)
        match = re.search(r"^Pages:\s*(\d+)\s*$", info, re.MULTILINE)
        if not match:
            raise ValueError("PDF 页数无法确认，请重新导出文件后重试。")
        page_count = int(match.group(1))
        if not 1 <= page_count <= MAX_PDF_PAGES:
            raise ValueError("PDF 页数超出后台解析范围，请拆分后重试。")
        pages = _run(["pdftotext", "-layout", str(source), "-"], timeout=60).split("\f")
        if len(pages) == page_count + 1 and not pages[-1].strip():
            pages.pop()
        if len(pages) != page_count:
            raise ValueError("PDF 页数与提取结果不一致，请重新导出文件后重试。")
        image_rows = _run(["pdfimages", "-list", str(source)], timeout=30).splitlines()
        image_pages = {
            int(parts[0])
            for line in image_rows
            if (parts := line.split()) and parts[0].isdigit()
        }
        extracted_chars = sum(_visible_characters(page) for page in pages)
        needs_full_ocr = extracted_chars < max(80, page_count * 6)
        deadline = time.monotonic() + PDF_OCR_BUDGET_SECONDS
        ocr_count = 0
        indexed = []
        for number, page in enumerate(pages, 1):
            content = page.strip()
            if _visible_characters(content) < 24 and (needs_full_ocr or number in image_pages):
                ocr_count += 1
                if ocr_count > MAX_PDF_OCR_PAGES:
                    raise ValueError("扫描版 PDF 页数过多，请拆分文件后重试。")
                remaining = deadline - time.monotonic()
                if remaining <= 1:
                    raise ValueError("扫描版 PDF 后台识别超时，请拆分文件后重试。")
                image = pathlib.Path(directory) / "ocr-page"
                _run(
                    ["pdftoppm", "-f", str(number), "-l", str(number),
                     "-singlefile", "-r", "150", "-png", str(source), str(image)],
                    timeout=min(60, remaining),
                )
                image_path = image.with_suffix(".png")
                if not image_path.is_file():
                    raise ValueError("PDF 页面无法渲染，原文索引未完成。")
                remaining = deadline - time.monotonic()
                if remaining <= 1:
                    raise ValueError("扫描版 PDF 后台识别超时，请拆分文件后重试。")
                recognized = _ocr(image_path.read_bytes(), timeout=min(45, remaining)).strip()
                image_path.unlink()
                if _visible_characters(recognized) > _visible_characters(content):
                    content = recognized
            indexed.append(f"第 {number} 页\n{content}")
        if sum(_visible_characters(page.split("\n", 1)[-1]) for page in indexed) < max(12, min(80, page_count * 2)):
            raise ValueError("PDF 未提取到足够正文，请提供清晰扫描件或可选中文字的版本。")
        return "\n\n".join(indexed)


def _legacy_office_text(raw, suffix):
    command = {".doc": "catdoc", ".xls": "xls2csv"}[suffix]
    with tempfile.TemporaryDirectory(prefix="aisecedu-legacy-office-") as directory:
        source = pathlib.Path(directory) / ("source" + suffix)
        source.write_bytes(raw)
        return _run([command, "-d", "utf-8", str(source)], timeout=45)


def _legacy_presentation_text(raw, suffix=".ppt"):
    with tempfile.TemporaryDirectory(prefix="aisecedu-ppt-") as directory:
        root = pathlib.Path(directory)
        source = root / ("source" + suffix)
        source.write_bytes(raw)
        prefix = []
        if os.geteuid() == 0:
            account = pwd.getpwnam("ctfd")
            os.chown(root, account.pw_uid, account.pw_gid)
            os.chown(source, account.pw_uid, account.pw_gid)
            prefix = [
                "env", f"HOME={root}", f"XDG_CACHE_HOME={root / 'cache'}",
                "setpriv", f"--reuid={account.pw_uid}", f"--regid={account.pw_gid}",
                "--clear-groups", "--no-new-privs",
            ]
        _run(
            prefix + [
                "soffice",
                "-env:UserInstallation=" + (root / "profile").as_uri(),
                "--headless", "--convert-to", "pdf", "--outdir", str(root), str(source),
            ],
            timeout=180,
        )
        pdf = root / "source.pdf"
        if not pdf.is_file() or not pdf.stat().st_size:
            raise ValueError("课件无法转换为可读取的页面，请另存为 PDF 后重试。")
        info = _run(prefix + ["pdfinfo", str(pdf)], timeout=20)
        match = re.search(r"^Pages:\s*(\d+)\s*$", info, re.MULTILINE)
        if not match:
            raise ValueError("课件页数无法确认，请重新导出文件后重试。")
        page_count = int(match.group(1))
        if not 1 <= page_count <= MAX_PRESENTATION_PAGES:
            raise ValueError("课件页数超出后台解析范围，请拆分后重试。")
        pages = _run(prefix + ["pdftotext", "-layout", str(pdf), "-"], timeout=90).split("\f")
        if len(pages) == page_count + 1 and not pages[-1].strip():
            pages.pop()
        if len(pages) != page_count:
            raise ValueError("课件页数与提取结果不一致，请重新导出文件后重试。")
        indexed = []
        deadline = time.monotonic() + PRESENTATION_OCR_BUDGET_SECONDS
        ocr_count = 0
        for number, page in enumerate(pages, 1):
            content = page.strip()
            if _visible_characters(content) < 16:
                ocr_count += 1
                if ocr_count > MAX_PRESENTATION_OCR_PAGES:
                    raise ValueError("图片型课件页数过多，请拆分文件后重试。")
                remaining = deadline - time.monotonic()
                if remaining <= 1:
                    raise ValueError("图片型课件后台识别超时，请拆分文件后重试。")
                image = root / "ocr-page"
                _run(
                    prefix + [
                        "pdftoppm", "-f", str(number), "-l", str(number),
                        "-singlefile", "-r", "130", "-png", str(pdf), str(image),
                    ],
                    timeout=min(60, remaining),
                )
                image_path = image.with_suffix(".png")
                if image_path.is_file():
                    remaining = deadline - time.monotonic()
                    if remaining <= 1:
                        raise ValueError("图片型课件后台识别超时，请拆分文件后重试。")
                    recognized = _ocr(
                        image_path.read_bytes(), prefix=prefix,
                        timeout=min(45, remaining),
                    ).strip()
                    image_path.unlink()
                    if _visible_characters(recognized) > _visible_characters(content):
                        content = recognized
            indexed.append(f"第 {number} 页\n{content}")
        if sum(_visible_characters(page.split("\n", 1)[-1]) for page in indexed) < max(80, len(pages) * 6):
            raise ValueError("课件已转换，但未提取到足够的教学正文；请提供带文字的 PPTX 或 PDF。")
        return "\n\n".join(indexed)


def extract_local_text(filename, raw):
    suffix = pathlib.Path(filename).suffix.lower()
    if suffix not in LOCAL_SUFFIXES:
        raise ValueError("该资料类型不支持本地文本提取。")
    if suffix in IMAGE_SUFFIXES:
        text = _ocr(raw)
    elif suffix == ".pdf":
        text = _pdf_text(raw)
    elif suffix == ".ppt":
        text = _legacy_presentation_text(raw)
    elif suffix in {".doc", ".xls"}:
        text = _legacy_office_text(raw, suffix)
    else:
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if suffix == ".docx":
                    text = _word_text(archive)
                elif suffix == ".pptx":
                    text = _presentation_text(archive)
                else:
                    text = _spreadsheet_text(archive)
        except (zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
            raise ValueError("Office 文档内容无法读取，请确认文件未损坏。") from exc
        if suffix == ".pptx":
            page_count = len(re.findall(r"(?m)^第 \d+ 页$", text))
            body = re.sub(r"(?m)^第 \d+ 页$", "", text)
            if _visible_characters(body) < max(80, page_count * 6):
                text = _legacy_presentation_text(raw, ".pptx")
    text = text.replace("\x00", "").strip()
    if not text:
        raise ValueError("资料已保存，但未找到可识别的文字。请提供带文字的版本，或在消息中补充图片内容。")
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError("资料文字超过 95 万字，请拆分文件后重新分析。")
    return text


def index_verified_local_source(*, root, storage_key, filename, mime_type, size, sha256):
    """Read and index one immutable source on the dedicated material worker.

    The caller must check job ownership and revision identity in the database.
    This boundary rechecks the bytes, so a substituted or truncated source can
    never become a READY revision merely because its job was already queued.
    """

    storage_root = pathlib.Path(root).resolve()
    source = (storage_root / str(storage_key)).resolve()
    if storage_root not in source.parents or not source.is_file():
        raise ValueError("资料原件不可用，请重新上传。")
    expected_size = int(size)
    if not 0 < expected_size <= MAX_SOURCE_BYTES:
        raise ValueError("资料大小超出后台解析范围。")
    with source.open("rb") as handle:
        raw = handle.read(MAX_SOURCE_BYTES + 1)
    if len(raw) != expected_size or hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError("资料原件校验失败，请重新上传。")
    started = time.monotonic()
    text = extract_local_text(filename, raw)
    chunks = [
        {
            "sourceType": "document",
            "sourceLocator": {"filename": filename, "offset": offset, "ordinal": ordinal},
            "content": text[offset:offset + 6_000],
            "metadata": {"mimeType": mime_type},
        }
        for ordinal, offset in enumerate(range(0, len(text), 6_000))
    ]
    result = {
        "analysis": {
            "summary": "文件正文已建立索引，可以按原文引用；结构摘要在后台整理。",
            "functionalPoints": [],
            "chapterCandidates": [],
            "coverage": {
                "analysisVersion": "source-index-v1",
                "complete": True,
                "extractedCharacters": len(text),
                "indexedCharacters": len(text),
                "chunkCount": len(chunks),
            },
        },
        "chunks": chunks,
    }
    return {
        "result": result,
        "model": {
            "provider": "local",
            "actualModel": "document-extractor-v1",
            "modelVersion": "source-index-v1",
            "usage": {},
            "latencyMs": int((time.monotonic() - started) * 1_000),
            "responseHash": hashlib.sha256(
                json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest(),
            "executionMode": "source-index-worker",
        },
    }

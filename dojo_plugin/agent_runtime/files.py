import csv
import datetime
import hashlib
import html
import io
import json
import os
import pathlib
import re
import uuid
import zipfile
from xml.sax.saxutils import escape


SUPPORTED_FORMATS = {"docx", "md", "txt", "json", "csv", "html", "ipynb"}
MIME_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "md": "text/markdown; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
    "json": "application/json; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "ipynb": "application/x-ipynb+json; charset=utf-8",
}
MAX_FILE_BYTES = 4 * 1024 * 1024
MIN_HTML_BODY_CHARS = 24


def _text(value, limit=200000):
    return str(value or "").replace("\x00", "")[:limit]


def _clean_filename(value, file_format):
    filename = pathlib.PurePath(_text(value, 240)).name
    filename = re.sub(r"[\\/:*?\"<>|\x00-\x1f\x7f]+", "-", filename)
    filename = re.sub(r"\s+", " ", filename).strip(" .-")[:220]
    if not filename:
        filename = f"教学文件.{file_format}"
    if pathlib.PurePath(filename).suffix.lower() != f".{file_format}":
        filename = f"{filename}.{file_format}"
    return filename[:240]


def _document(value):
    return value if isinstance(value, dict) else {}


def _sections(document):
    rows = document.get("sections")
    return (
        [row for row in rows[:80] if isinstance(row, dict)]
        if isinstance(rows, list)
        else []
    )


def _html_page(body, title):
    page_title = html.escape(_text(title, 500).strip() or "教学文件")
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{page_title}</title><style>@page{{size:A4;margin:14mm}}"
        "body{max-width:920px;margin:48px auto;padding:0 24px;"
        'font:16px/1.75 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#172033}'
        "h1,h2,h3{line-height:1.3;break-after:avoid}.subtitle{color:#657089}"
        "p,li{orphans:3;widows:3}pre,table{break-inside:avoid}"
        "table{border-collapse:collapse;width:100%;margin:18px 0}"
        "th,td{border:1px solid #ccd5e3;padding:8px 10px;text-align:left}"
        "</style></head><body>" + body + "</body></html>"
    )


def _normalize_html_content(value, title):
    source = _text(value, MAX_FILE_BYTES).strip()
    fenced = re.search(r"```(?:html)?\s*([\s\S]*?)```", source, flags=re.IGNORECASE)
    if fenced:
        source = fenced.group(1).strip()
    complete = re.search(
        r"(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*?</html\s*>",
        source,
        flags=re.IGNORECASE,
    )
    if complete:
        return complete.group(0).strip()
    body = re.search(r"<body\b[^>]*>([\s\S]*?)</body\s*>", source, flags=re.IGNORECASE)
    if body:
        source = body.group(1).strip()
    if not source:
        return ""
    if not re.search(r"<[a-z][^>]*>", source, flags=re.IGNORECASE):
        paragraphs = [
            item.strip() for item in re.split(r"\n\s*\n", source) if item.strip()
        ]
        source = "".join(
            f"<p>{html.escape(item).replace(chr(10), '<br>')}</p>"
            for item in paragraphs
        )
    return _html_page(source, title)


def _html_visible_text(value):
    source = _text(value, MAX_FILE_BYTES)
    body = re.search(r"<body\b[^>]*>([\s\S]*?)</body\s*>", source, flags=re.IGNORECASE)
    scope = body.group(1) if body else source
    scope = re.sub(r"<!--[\s\S]*?-->", " ", scope)
    scope = re.sub(
        r"<(script|style|template|noscript)\b[^>]*>[\s\S]*?</\1\s*>",
        " ",
        scope,
        flags=re.IGNORECASE,
    )
    scope = re.sub(r"<[^>]+>", " ", scope)
    return re.sub(r"\s+", " ", html.unescape(scope)).strip()


def _validate_rendered_deliverable(file_format, rendered):
    if not rendered or len(rendered) > MAX_FILE_BYTES:
        raise ValueError("Rendered deliverable is empty or exceeds 4 MiB")
    if file_format == "html":
        source = rendered.decode("utf-8", errors="replace")
        if not (
            re.search(r"<html\b", source, flags=re.IGNORECASE)
            and re.search(r"<body\b", source, flags=re.IGNORECASE)
            and re.search(r"</body\s*>", source, flags=re.IGNORECASE)
            and re.search(r"</html\s*>", source, flags=re.IGNORECASE)
        ):
            raise ValueError("The HTML deliverable is not a complete document")
        visible = re.sub(r"\s+", "", _html_visible_text(source))
        if len(visible) < MIN_HTML_BODY_CHARS:
            raise ValueError(
                "The HTML deliverable contains no substantive visible body"
            )


def document_to_markdown(value):
    document = _document(value)
    lines = []
    title = _text(document.get("title"), 500).strip()
    subtitle = _text(document.get("subtitle"), 1000).strip()
    if title:
        lines.extend([f"# {title}", ""])
    if subtitle:
        lines.extend([subtitle, ""])
    for section in _sections(document):
        heading = _text(section.get("heading"), 500).strip()
        level = max(2, min(6, int(section.get("level") or 2)))
        if heading:
            lines.extend([f"{'#' * level} {heading}", ""])
        paragraphs = section.get("paragraphs")
        if isinstance(paragraphs, list):
            for paragraph in paragraphs[:100]:
                value_text = _text(paragraph).strip()
                if value_text:
                    lines.extend([value_text, ""])
        bullets = section.get("bullets")
        if isinstance(bullets, list):
            for bullet in bullets[:100]:
                value_text = _text(bullet).strip()
                if value_text:
                    lines.append(f"- {value_text}")
            if bullets:
                lines.append("")
        tables = section.get("tables")
        if isinstance(tables, list):
            for table in tables[:20]:
                if not isinstance(table, dict):
                    continue
                headers = (
                    table.get("headers")
                    if isinstance(table.get("headers"), list)
                    else []
                )
                rows = table.get("rows") if isinstance(table.get("rows"), list) else []
                if not headers:
                    continue
                safe_headers = [
                    _text(item, 1000).replace("|", "\\|") for item in headers[:20]
                ]
                lines.append("| " + " | ".join(safe_headers) + " |")
                lines.append("| " + " | ".join("---" for _ in safe_headers) + " |")
                for row in rows[:100]:
                    if not isinstance(row, list):
                        continue
                    cells = [
                        _text(item, 2000).replace("|", "\\|")
                        for item in row[: len(safe_headers)]
                    ]
                    cells.extend([""] * (len(safe_headers) - len(cells)))
                    lines.append("| " + " | ".join(cells) + " |")
                lines.append("")
    return "\n".join(lines).strip() + "\n"


def document_to_text(value):
    markdown = document_to_markdown(value)
    text = re.sub(r"^#{1,6}\s+", "", markdown, flags=re.MULTILINE)
    text = re.sub(r"^-\s+", "• ", text, flags=re.MULTILINE)
    return text


def document_to_html(value):
    document = _document(value)
    body = []
    title = _text(document.get("title"), 500).strip()
    subtitle = _text(document.get("subtitle"), 1000).strip()
    if title:
        body.append(f"<h1>{html.escape(title)}</h1>")
    if subtitle:
        body.append(f'<p class="subtitle">{html.escape(subtitle)}</p>')
    for section in _sections(document):
        heading = _text(section.get("heading"), 500).strip()
        level = max(2, min(6, int(section.get("level") or 2)))
        if heading:
            body.append(f"<h{level}>{html.escape(heading)}</h{level}>")
        paragraphs = section.get("paragraphs")
        if isinstance(paragraphs, list):
            body.extend(
                f"<p>{html.escape(_text(paragraph))}</p>"
                for paragraph in paragraphs[:100]
                if _text(paragraph).strip()
            )
        bullets = section.get("bullets")
        if isinstance(bullets, list) and bullets:
            body.append("<ul>")
            body.extend(
                f"<li>{html.escape(_text(bullet))}</li>"
                for bullet in bullets[:100]
                if _text(bullet).strip()
            )
            body.append("</ul>")
        tables = section.get("tables")
        if isinstance(tables, list):
            for table in tables[:20]:
                if not isinstance(table, dict):
                    continue
                headers = (
                    table.get("headers")
                    if isinstance(table.get("headers"), list)
                    else []
                )
                rows = table.get("rows") if isinstance(table.get("rows"), list) else []
                if not headers:
                    continue
                body.append("<table><thead><tr>")
                body.extend(
                    f"<th>{html.escape(_text(item))}</th>" for item in headers[:20]
                )
                body.append("</tr></thead><tbody>")
                for row in rows[:100]:
                    if isinstance(row, list):
                        body.append("<tr>")
                        body.extend(
                            f"<td>{html.escape(_text(item))}</td>" for item in row[:20]
                        )
                        body.append("</tr>")
                body.append("</tbody></table>")
    return _html_page("".join(body), title)


def _xml_text(value):
    return escape(_text(value), {'"': "&quot;"})


def _docx_run(value, *, bold=False, size=None):
    properties = []
    if bold:
        properties.append("<w:b/>")
    if size:
        properties.append(f'<w:sz w:val="{int(size)}"/><w:szCs w:val="{int(size)}"/>')
    prop_xml = f"<w:rPr>{''.join(properties)}</w:rPr>" if properties else ""
    return f'<w:r>{prop_xml}<w:t xml:space="preserve">{_xml_text(value)}</w:t></w:r>'


def _docx_paragraph(value="", *, style=None, bold=False, size=None):
    paragraph_properties = (
        f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    )
    return f"<w:p>{paragraph_properties}{_docx_run(value, bold=bold, size=size)}</w:p>"


def _docx_cell(value, *, bold=False):
    return (
        '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'
        + _docx_paragraph(value, bold=bold)
        + "</w:tc>"
    )


def _docx_table(headers, rows):
    columns = min(20, len(headers))
    if not columns:
        return ""
    grid = "".join('<w:gridCol w:w="2400"/>' for _ in range(columns))
    row_xml = [
        "<w:tr>"
        + "".join(_docx_cell(item, bold=True) for item in headers[:columns])
        + "</w:tr>"
    ]
    for row in rows[:100]:
        if not isinstance(row, list):
            continue
        cells = list(row[:columns]) + [""] * max(0, columns - len(row))
        row_xml.append(
            "<w:tr>" + "".join(_docx_cell(item) for item in cells) + "</w:tr>"
        )
    return (
        '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C3D4"/>'
        '<w:left w:val="single" w:sz="4" w:color="B7C3D4"/><w:bottom w:val="single" w:sz="4" w:color="B7C3D4"/>'
        '<w:right w:val="single" w:sz="4" w:color="B7C3D4"/><w:insideH w:val="single" w:sz="4" w:color="D7DEE8"/>'
        '<w:insideV w:val="single" w:sz="4" w:color="D7DEE8"/></w:tblBorders></w:tblPr>'
        f"<w:tblGrid>{grid}</w:tblGrid>{''.join(row_xml)}</w:tbl>"
    )


def _docx_body(deliverable):
    document = _document(deliverable.get("document"))
    nodes = []
    if document:
        title = _text(document.get("title") or deliverable.get("title"), 500).strip()
        subtitle = _text(document.get("subtitle"), 1000).strip()
        if title:
            nodes.append(_docx_paragraph(title, style="Title"))
        if subtitle:
            nodes.append(_docx_paragraph(subtitle, style="Subtitle"))
        for section in _sections(document):
            heading = _text(section.get("heading"), 500).strip()
            level = max(1, min(3, int(section.get("level") or 2)))
            if heading:
                nodes.append(_docx_paragraph(heading, style=f"Heading{level}"))
            paragraphs = section.get("paragraphs")
            if isinstance(paragraphs, list):
                nodes.extend(
                    _docx_paragraph(_text(paragraph))
                    for paragraph in paragraphs[:100]
                    if _text(paragraph).strip()
                )
            bullets = section.get("bullets")
            if isinstance(bullets, list):
                nodes.extend(
                    _docx_paragraph(f"• {_text(bullet)}")
                    for bullet in bullets[:100]
                    if _text(bullet).strip()
                )
            tables = section.get("tables")
            if isinstance(tables, list):
                for table in tables[:20]:
                    if not isinstance(table, dict):
                        continue
                    headers = (
                        table.get("headers")
                        if isinstance(table.get("headers"), list)
                        else []
                    )
                    rows = (
                        table.get("rows") if isinstance(table.get("rows"), list) else []
                    )
                    table_xml = _docx_table(headers, rows)
                    if table_xml:
                        nodes.append(table_xml)
    else:
        content = _text(deliverable.get("content"))
        for line in content.splitlines():
            heading = re.match(r"^(#{1,6})\s+(.*)$", line)
            bullet = re.match(r"^\s*[-*+]\s+(.*)$", line)
            numbered = re.match(r"^\s*\d+[.)]\s+(.*)$", line)
            if heading:
                nodes.append(
                    _docx_paragraph(
                        heading.group(2),
                        style=f"Heading{min(3, len(heading.group(1)))}",
                    )
                )
            elif bullet or numbered:
                nodes.append(_docx_paragraph(f"• {(bullet or numbered).group(1)}"))
            else:
                nodes.append(_docx_paragraph(line))
    if not nodes:
        raise ValueError("The DOCX deliverable contains no document content")
    return "".join(nodes)


def render_docx(deliverable):
    body = _docx_body(deliverable)
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'
    )
    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="596579"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/></w:rPr></w:style>
</w:styles>"""
    timestamp = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{_xml_text(deliverable.get("title") or deliverable.get("filename"))}</dc:title><dc:creator>玄甲</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified></cp:coreProperties>"""
    entries = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>""",
        "word/document.xml": document_xml,
        "word/styles.xml": styles_xml,
        "word/_rels/document.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>""",
        "docProps/core.xml": core_xml,
        "docProps/app.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>玄甲</Application></Properties>""",
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in entries.items():
            archive.writestr(name, value.encode("utf-8"))
    return output.getvalue()


def _render_csv(deliverable):
    content = deliverable.get("content")
    if isinstance(content, str) and content.strip():
        return content.encode("utf-8-sig")
    data = deliverable.get("data")
    rows = data if isinstance(data, list) else []
    output = io.StringIO(newline="")
    if rows and all(isinstance(row, dict) for row in rows):
        headers = []
        for row in rows:
            for key in row:
                if key not in headers:
                    headers.append(key)
        writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    elif rows:
        writer = csv.writer(output)
        writer.writerows(row if isinstance(row, list) else [row] for row in rows)
    else:
        raise ValueError("The CSV deliverable contains no rows")
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def _render_notebook(deliverable):
    data = deliverable.get("data")
    if not isinstance(data, dict):
        content = _text(deliverable.get("content")).strip()
        if not content and _document(deliverable.get("document")):
            content = document_to_markdown(deliverable.get("document")).strip()
        if not content:
            raise ValueError("The notebook deliverable contains no cells")
        data = {
            "cells": [
                {
                    "cell_type": "markdown",
                    "metadata": {},
                    "source": [line + "\n" for line in content.splitlines()],
                }
            ],
            "metadata": {},
            "nbformat": 4,
            "nbformat_minor": 5,
        }
    if not isinstance(data.get("cells"), list):
        raise ValueError("The notebook deliverable has an invalid cells field")
    data = {
        **data,
        "nbformat": 4,
        "nbformat_minor": int(data.get("nbformat_minor") or 5),
    }
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def render_deliverable(deliverable):
    if not isinstance(deliverable, dict):
        raise ValueError("Deliverable must be an object")
    file_format = _text(deliverable.get("format"), 16).strip().lower()
    if file_format not in SUPPORTED_FORMATS:
        raise ValueError("Unsupported deliverable format")
    filename = _clean_filename(deliverable.get("filename"), file_format)
    document = _document(deliverable.get("document"))
    content = deliverable.get("content")
    data = deliverable.get("data")
    if file_format == "docx":
        rendered = render_docx(deliverable)
    elif file_format == "md":
        rendered = (
            _text(content)
            if isinstance(content, str)
            else document_to_markdown(document)
        ).encode("utf-8")
    elif file_format == "txt":
        rendered = (
            _text(content) if isinstance(content, str) else document_to_text(document)
        ).encode("utf-8")
    elif file_format == "html":
        html_source = (
            _normalize_html_content(content, deliverable.get("title") or filename)
            if isinstance(content, str) and content.strip()
            else document_to_html(document)
        )
        rendered = html_source.encode("utf-8")
    elif file_format == "json":
        value = data if data is not None else document if document else content
        if value in (None, "", [], {}):
            raise ValueError("The JSON deliverable contains no data")
        rendered = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode(
            "utf-8"
        )
    elif file_format == "csv":
        rendered = _render_csv(deliverable)
    else:
        rendered = _render_notebook(deliverable)
    _validate_rendered_deliverable(file_format, rendered)
    return {
        "filename": filename,
        "format": file_format,
        "mime_type": MIME_TYPES[file_format],
        "content": rendered,
        "title": _text(deliverable.get("title") or filename, 240).strip() or filename,
    }


def _storage_root():
    from .. import config

    return (config.AGENT_RUNTIME_STORAGE_ROOT / "agent-files").resolve()


def _storage_path(storage_key):
    key = pathlib.PurePosixPath(str(storage_key or ""))
    if key.is_absolute() or not key.parts or ".." in key.parts:
        raise ValueError("Invalid generated-file storage key")
    root = _storage_root()
    path = (root / pathlib.Path(*key.parts)).resolve()
    if path == root or root not in path.parents:
        raise ValueError("Generated-file path escapes its storage root")
    return path


def _public_download_url(job_id, file_id):
    return f"/pwncollege_api/v1/teaching/jobs/{job_id}/files/{file_id}"


def persist_agent_deliverables(job, deliverables):
    if not isinstance(deliverables, list):
        return []
    rendered_deliverables = [render_deliverable(item) for item in deliverables[:4]]
    stored = []
    for ordinal, rendered in enumerate(rendered_deliverables):
        digest = hashlib.sha256(rendered["content"]).hexdigest()
        stable_id = uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"aisecedu:{job.id}:{ordinal}:{rendered['filename']}:{digest}",
        ).hex
        file_id = f"file_{stable_id}"
        storage_key = "/".join(
            (
                str(job.owner_id),
                str(job.id),
                f"{file_id}.{rendered['format']}",
            )
        )
        path = _storage_path(storage_key)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
        try:
            with temporary.open("xb") as handle:
                handle.write(rendered["content"])
                handle.flush()
                os.fsync(handle.fileno())
            temporary.chmod(0o600)
            os.replace(temporary, path)
        finally:
            if temporary.exists():
                temporary.unlink()
        stored.append(
            {
                "id": file_id,
                "jobId": str(job.id),
                "filename": rendered["filename"],
                "title": rendered["title"],
                "format": rendered["format"],
                "mimeType": rendered["mime_type"],
                "size": len(rendered["content"]),
                "sha256": digest,
                "storageKey": storage_key,
            }
        )
    return stored


def public_agent_file(value):
    if not isinstance(value, dict):
        return None
    file_id = str(value.get("id") or "")
    job_id = str(value.get("jobId") or "")
    filename = str(value.get("filename") or "")
    file_format = str(value.get("format") or "").lower()
    digest = str(value.get("sha256") or "")
    if (
        not re.fullmatch(r"file_[0-9a-f]{32}", file_id)
        or not job_id
        or not filename
        or len(filename) > 240
        or pathlib.PurePath(filename).name != filename
        or file_format not in SUPPORTED_FORMATS
        or not re.fullmatch(r"[0-9a-f]{64}", digest)
    ):
        return None
    try:
        size = int(value.get("size") or 0)
    except (TypeError, ValueError):
        return None
    if size <= 0 or size > MAX_FILE_BYTES:
        return None
    return {
        "id": file_id,
        "jobId": job_id,
        "filename": filename,
        "title": str(value.get("title") or filename)[:240],
        "format": file_format,
        "mimeType": MIME_TYPES[file_format],
        "size": size,
        "sha256": digest,
        "downloadUrl": _public_download_url(job_id, file_id),
    }


def agent_file_path(value):
    public = public_agent_file(value)
    if public is None:
        raise ValueError("Invalid generated-file metadata")
    path = _storage_path(value.get("storageKey"))
    if not path.is_file() or path.is_symlink():
        raise ValueError("Generated file is unavailable")
    if path.stat().st_size != public["size"]:
        raise ValueError("Generated file size does not match its metadata")
    content = path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if digest != public["sha256"]:
        raise ValueError("Generated file digest does not match its metadata")
    _validate_rendered_deliverable(public["format"], content)
    return path

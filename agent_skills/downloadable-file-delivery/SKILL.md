---
name: downloadable-file-delivery
description: Package an analysis, lesson plan, report, dataset, notebook, or other requested result as a real downloadable file with an accurate filename, MIME type, and usable structured content.
---

# Downloadable file delivery

Use this skill whenever the teacher explicitly asks to “给我一个文件”, “导出”, “下载”, “Word”, “DOCX”, “Markdown”, “JSON”, “CSV”, “HTML”, “Notebook”, or an equivalent file outcome.

## Rules

1. A chat answer, preview card, internal artifact, or promise to generate later does not satisfy a file request.
2. Return a structured file deliverable in the same successful response. Choose the requested format and a descriptive filename. If no format is stated, infer the conventional editable format from the object: DOCX for a lesson plan or report, Markdown for plain documentation, CSV for tabular data, and IPYNB for a notebook.
3. Put complete reusable content in the file and a short summary in chat.
4. Never claim the file exists unless the platform has persisted it and supplied a download URL.
5. If the exact format cannot be produced, say so and offer an actually supported alternative rather than silently changing formats.
6. For HTML, return one complete self-contained document in `content`, beginning with `<!doctype html>` and containing substantive visible content inside `body`. Never return an empty `document`, an empty shell, a Markdown code fence, or CSS/JavaScript without the requested visible content.
7. Before declaring success, verify that every deliverable contains the requested body content—not merely a filename, title, MIME type, or page chrome.

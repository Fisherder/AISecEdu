---
name: lesson-plan-file
description: Create a complete, teacher-ready lesson plan as a real downloadable file, especially DOCX, Markdown, HTML, JSON, or plain text, using course materials and the teacher's requested teaching context.
---

# Lesson plan file

Use this skill when the teacher explicitly asks for a lesson plan, teaching design, instructor guide, or a lesson-plan file.

## Required outcome

Return a downloadable file, not only a chat summary or an internal content card. Honor the requested format; use DOCX when the teacher asks for a Word document or says only “教案文件” without specifying a format.

## Recommended structure

- Title and course context
- Learner profile and prerequisites
- Learning objectives written as observable outcomes
- Key points and difficult points
- Resources and environment preparation
- Timed teaching sequence with teacher actions and learner activities
- Demonstration or lab procedure and safety boundaries
- Formative checks and final assessment
- Differentiation, common misconceptions, and remediation
- Homework or extension activities
- Evidence or source notes when material was supplied

Adapt the structure to the teacher's actual request. Do not invent facts that should come from an uploaded source. Put concise conclusions in chat and the full reusable content in the file deliverable.

When HTML is requested, put the complete printable lesson plan in a self-contained `<!doctype html>` document. The `body` must include the actual lesson-plan sections and visible teaching content; an empty `document`, title-only page, layout shell, or Markdown-fenced HTML is not a valid deliverable.

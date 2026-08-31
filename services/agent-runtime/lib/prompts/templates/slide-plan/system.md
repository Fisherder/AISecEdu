# Teaching Slide Planner

Plan one complete teaching slide as compact JSON. The renderer will turn your plan into a polished page, so choose the structure and words deliberately. Do not output positioned elements, HTML, Markdown, or an explanation.

{{#if subjectProfile}}{{snippet:security-pedagogy}}{{/if}}

Slide brief:

- Title: {{title}}
- Key points: {{keyPoints}}
- Teaching purpose and design context: {{description}}

Write in the requested teaching language ({{languageDirective}}). Preserve accurate subject terminology and the supplied facts. Make the page concrete enough to teach without adding generic filler.

Choose exactly one `layout`:

- `cover`: opening hook, relevance, and deck promise.
- `concept`: one mental model with 2–4 concrete supporting points.
- `comparison`: two clearly named sides with meaningful differences.
- `process`: 3–4 causal or procedural steps.
- `timeline`: 3–4 events, evidence points, or state changes.
- `case`: scenario, evidence, decision, and implication.
- `code`: a short code/configuration walkthrough plus verification question.
- `activity`: learner task, evidence, and completion standard.
- `checkpoint`: retrieval or application question without exposing the answer on the slide.
- `summary`: 3 durable takeaways and one transfer question.

Use the layout hint in the design context when present. Keep visible text concise: title at most 24 Chinese characters, subtitle at most 52, 2–5 bullets at most 38 each, and no paragraph-shaped bullet. Use `leftItems`/`rightItems` for comparison, `steps` for process or timeline, and `code` for code pages. Include a useful `question` on case, activity, checkpoint, and summary pages.

Write `speakerNotes` for this page as a 120–320 Chinese-character script that can be spoken directly. Include a bridge or opening cue, the explanation or evidence deliberately kept off the slide, one likely misconception or emphasis, the expected learner response or observable evidence when a question is present, and a transition to the next page. Every page, including cover and summary, requires a useful script. Notes must add value instead of repeating visible bullets.

Output only this JSON object. Keep optional fields as null or empty arrays when they do not fit the chosen layout.

{
"layout": "cover | concept | comparison | process | timeline | case | code | activity | checkpoint | summary",
"eyebrow": "short section label",
"title": "clear page title",
"subtitle": "one-line setup or null",
"bullets": ["concrete point", "concrete point"],
"leftTitle": "comparison side or null",
"leftItems": ["item"],
"rightTitle": "comparison side or null",
"rightItems": ["item"],
"steps": [{"title": "step label", "detail": "observable action or change"}],
"callout": "single emphasis or completion standard",
"question": "direct learner question or null",
"code": {"language": "text", "filename": "example.txt", "lines": ["line 1", "line 2"]},
"takeaway": "one durable conclusion",
"speakerNotes": "teacher-only spoken script with bridge, explanation, misconception repair, expected response, and transition"
}

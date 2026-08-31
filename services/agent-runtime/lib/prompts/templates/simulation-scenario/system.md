# Simulation Scenario Planner

You design a **guided, observable interactive simulation** as structured JSON. The learner changes state through decisions and sees consequences; this is not a slide deck and not a multiple-choice quiz. Describe content and visuals as DATA only (do not write HTML, JavaScript, or CSS). A deterministic player owns navigation, reset, history, accessibility, and host synchronization.

{{#if subjectProfile}}{{snippet:security-pedagogy}}{{/if}}

Scenario to design:

- Concept: {{conceptName}}
- Overview: {{description}}

Design 5–8 scenes that form a coherent scenario: establish a role and goal, expose an initial state, let the learner take at least one consequential action, reveal observable effects, and end with evidence-based debriefing. Include at least one meaningful branch whose alternatives change the state, evidence, or interpretation—not merely the wording of feedback.

The simulation must also behave like an instrumented lab rather than a page sequence:

- Define 2–4 concept-specific `controls`. Include at least one numeric `range` and one Boolean `toggle`; changing either must alter evidence shown to the learner.
- Define 3–5 named `evidenceChannels` appropriate to the concept (for example request, query, application log, response, or system state).
- Every scene supplies a value for every evidence channel. Evidence strings may interpolate control values with `{{controlId}}`.
- Add a `comparisonSummary` that explicitly contrasts at least two control/state combinations and explains the causal difference.

Integrity rules:

- Every `id` is unique and stable (`s1`, `observe`, `contain`, etc.).
- `startScene` and every `choices[].goto` must reference an existing scene.
- A scene without choices proceeds linearly to the next array item; the last scene is terminal.
- The experience must always be resettable to `startScene` without hidden state.
- Reset must restore the initial scene, all control defaults, and an empty event history.
- Use authorized, isolated, non-destructive examples. Never target real public systems or real credentials.

Each scene:

- `id`: short stable ASCII id.
- `title`: concise scene title (≤ 20 Chinese characters).
- `stateLabel`: what state the simulation is currently in (≤ 16 Chinese characters), such as “等待分析” or “已隔离”.
- `narrative`: 1–3 sentences explaining the situation and the learner’s immediate goal (teaching language: {{languageDirective}}).
- `expectedObservation`: the concrete signal, output, visual change, or evidence the learner should notice.
- `facilitatorCue`: one concise teacher prompt that elicits a prediction, justification, or comparison. It is collapsed by default in the player.
- `evidence`: an object keyed by every `evidenceChannels[].id`. Values describe observable, concept-specific evidence and may use `{{controlId}}` placeholders.
- `visual`: ONE of these kinds, as DATA the renderer draws:
  - `{ kind: "cells", caption?, rows: [ { label, cells: ["0","+","1",...] } ] }` — labeled rows of cells. Use symbols such as `+`, `×`, `0`, `1`, `✓`, `✗`.
  - `{ kind: "bars", caption?, items: [ { label, value: 0..1, color? } ] }` — horizontal labeled rates or probabilities.
  - `{ kind: "flow", caption?, steps: ["...", "..."] }` — an ordered causal or procedural chain.
  - `{ kind: "icons", caption?, items: [ { icon, label, tone? } ] }` — an emoji grid; `tone` is `ok|warn|bad|info`.
  - `{ kind: "metric", caption?, value: "string", unit?, tone? }` — one highlighted measurement.
- `choices`: array of `{ label, goto, effect }`. `effect` states the resulting state change and appears in the event log. Omit or empty for linear progression.
- `insight`: one short takeaway that explains why the observation matters.

Top-level fields:

- `controls`: 2–4 controls. A range is `{id,label,type:"range",min,max,step,default,effect}`. A toggle is `{id,label,type:"toggle",default,onLabel,offLabel,effect}`.
- `evidenceChannels`: 3–5 `{id,label}` entries whose stable ASCII IDs are reused by every scene.
- `comparisonSummary`: a concise evidence-based before/after or vulnerable/protected comparison, shown at the terminal state.
- `debrief`: shown at the terminal state. It must connect the learner’s decisions and observed evidence back to the concept, name one misconception, and suggest one transfer question.

Output ONLY this JSON, no markdown:
{
"type": "simulation-scenario",
"title": "string",
"description": "string",
"startScene": "s1",
"controls": [
  {"id":"inputStrength","label":"输入强度","type":"range","min":1,"max":5,"step":1,"default":3,"effect":"输入强度变化"},
  {"id":"defenseEnabled","label":"启用防护","type":"toggle","default":false,"onLabel":"已启用","offLabel":"未启用","effect":"防护状态变化"}
],
"evidenceChannels": [{"id":"request","label":"请求"},{"id":"system","label":"系统状态"},{"id":"result","label":"结果"}],
"comparisonSummary": "string with {{inputStrength}} or {{defenseEnabled}} when useful",
"debrief": "string",
"scenes": [
{
"id": "s1",
"title": "string",
"stateLabel": "string",
"narrative": "string",
"expectedObservation": "string",
"facilitatorCue": "string",
"evidence": {"request":"string with {{inputStrength}}","system":"string with {{defenseEnabled}}","result":"string"},
"visual": { "kind": "cells", "rows": [{ "label": "比特", "cells": ["0","1","1","0","1"] }] },
"choices": [{ "label": "string", "goto": "s2", "effect": "string" }],
"insight": "string"
}
]
}

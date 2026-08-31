# 玄甲 agent skills

This directory is the runtime skill library for the teacher agent. Each skill follows the Agent Skills `SKILL.md` convention: the model sees only names and descriptions while planning, then receives the full instructions for the skills it selects.

Project-authored skills are licensed with the surrounding 玄甲 project. Vendored skills retain their own `LICENSE.txt` files and provenance.

Project-authored production workflows:

- `teaching-slide-deck` — story-first slide planning, meaningful visual variation, three-pass quality review, and synchronized speaker scripts for every page.
- `ctf-flag-challenge` — category-aware, isolated CTF construction with dynamic flags, private reference solves, negative tests, reset tests, and batch diversity.
- `cyber-lab-simulation` — explicit state-machine simulations with numeric and Boolean controls, synchronized evidence channels, meaningful branches, event history, deterministic reset, facilitator cues, and causal debriefing.

These workflows were re-audited and strengthened on 2026-08-25 after reviewing established public implementations and specifications from OpenAI Plugins, Anthropic Skills, CTFd, picoCTF, pwn.college, MITRE Caldera, XState/Stately, Storybook, and Playwright. 玄甲 adapts the reusable design and validation principles in its own project-authored instructions and runtime; source-specific or proprietary skill files are not copied or redistributed. Research links and scope are recorded in `provenance.json`.

The global-agent planner may choose any useful supporting skills, but a semantic formal-generation target automatically activates its production skill: `slide-deck` activates `teaching-slide-deck`, native CTF activates `ctf-flag-challenge`, and simulation or attack-defense scenes activate `cyber-lab-simulation`. This is based on the model's structured understanding of the task, not keyword routing, and prevents a valid generation plan from accidentally losing its quality workflow.

Installed upstream skills:

- `pdf` — OpenAI `openai/skills`, Apache-2.0
- `jupyter-notebook` — OpenAI `openai/skills`, Apache-2.0
- `playwright` — OpenAI `openai/skills`, Apache-2.0
- `security-best-practices` — OpenAI `openai/skills`, Apache-2.0
- `security-threat-model` — OpenAI `openai/skills`, Apache-2.0
- `backwards-design-unit-planner` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0
- `competency-unpacker` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0
- `criterion-referenced-rubric-generator` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0
- `assessment-validity-checker` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0
- `retrieval-practice-generator` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0
- `feedback-quality-analyser` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0
- `udl-lesson-auditor` — Gareth Manning `education-agent-skills`, CC BY-SA 4.0

OpenAI files are pinned to `49f948faa9258a0c61caceaf225e179651397431`.
Education Agent Skills files are pinned to
`4be2795b574e91bdcbb6bda01ab235a05cfadbcc`. Exact source paths, licenses,
and audit metadata are recorded in `provenance.json` and
`THIRD_PARTY_NOTICES.md`.

Selection was re-audited on 2026-08-22 against the public GitHub repositories.
The OpenAI catalog showed about 25.1k stars and 1.7k forks; it now points new
installations to OpenAI's Plugins repository, so 玄甲 keeps only the five
already-audited, commit-pinned Apache-2.0 skills. The education library showed
over 550 stars, about 100 forks, 165 evidence-grounded skills, explicit Codex
support, typed orchestration metadata, and CC BY-SA 4.0 licensing. 玄甲
installs a focused teaching subset rather than all 165 descriptions, which
keeps model discovery useful while still covering planning, assessment,
feedback, retrieval practice, accessibility, security, browser work and files.

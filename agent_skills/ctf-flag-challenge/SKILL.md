---
name: ctf-flag-challenge
description: Design, generate, review, or repair authentic isolated cybersecurity CTF challenges with dynamic flags, private reference solves, category-aware construction, and strong intended and unintended-path validation.
---

# Flag-based CTF challenge

Use this skill for native CTF practice questions and challenge environments. Preserve the teacher's requested category, learning objective, difficulty, number of independent challenges, source material, and final learner experience.

## Completion contract

Every learner-facing CTF task ends by obtaining a flag from the isolated environment and submitting it through the platform. Do not require conclusions, booleans, reports, or `solution.json` as the completion criterion. Internal checkers may inspect runtime state, but learner completion remains a flag submission.

## Production workflow

1. Define the exact competency, prerequisites, threat model, authorized boundary, difficulty budget, and observable proof of completion.
2. Select a category-appropriate mechanic and write the intended solve path before building the environment.
3. Build an isolated, resettable, resource-bounded environment. Prefer platform-supplied per-instance flags and instance-specific entropy. Learner-readable source must never contain a literal route whose single request directly flips the Flag Gate; discovery/extraction tasks require at least one instance-specific observation followed by a separate input-dependent action.
4. Separate the learner package from the private reference solve, flag gate, hidden tests, and protected evidence.
5. Run the reference solve from a clean instance and prove that it reaches the same live state checked by the flag gate.
6. Test obvious bypasses, leaked answers, stale state, race conditions, unintended shortcuts, path traversal, excessive privilege, network dependencies, and reset reproducibility.
7. Repair every blocking finding and rerun the complete validation chain before marking the challenge usable.

Use `references/challenge-production-workflow.md` for construction and validation, and `references/category-patterns.md` for category-specific patterns.

## Batch generation

When the teacher requests multiple challenges, create that many independent challenges rather than one challenge with subquestions. Make the batch pedagogically diverse: vary the decisive skill, evidence source, solve mechanic, and difficulty driver while keeping a coherent progression. Each challenge needs its own environment, flag gate, reference solve, hints, reset behavior, tests, and publishable draft.

## Design requirements

- The challenge statement names the goal, starting point, available interface, safety boundary, and what the learner submits without revealing the solution.
- Hints form a gradient from conceptual direction to targeted evidence, never the flag or final exploit string.
- Difficulty comes from the intended reasoning and tool workflow, not brittle guessing, hidden dependencies, or arbitrary obscurity.
- The platform checker binds to live, specific evidence and a concrete expected value; a field that merely exists or can be self-asserted is not proof.
- Generated services and learner shells share one nonprivileged identity: services never read the platform-private flag, and intended solves never mutate integrity-protected starter files. Keep mutable challenge state in memory or `/tmp`.
- Learner-facing copy must describe the real live-state objective. Never tell learners to read, reset, or submit `/flag`, `/flag.txt`, or `/challenge/flag`; after reaching the observable goal they run `/challenge/check` without an answer argument to obtain the per-session dynamic flag.
- For binary exploitation, web, crypto, forensics, reversing, defense, or mixed tasks, preserve the authentic category workflow while keeping the dynamic-flag contract consistent.

Reject any design that can pass by fabricating a report, reading a bundled flag, reusing another instance's flag, or skipping the intended security objective.

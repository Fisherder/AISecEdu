---
name: cyber-lab-simulation
description: Design and validate rich instructor-led demonstrations and learner-driven cyber simulations with explicit state machines, observable events, meaningful choices, reliable reset, responsive UI, and structured debrief.
---

# Cyber lab simulation

Use this skill for simulations, training demonstrations, interactive labs, and attack-defense scenarios. Do not substitute a generic quiz or CTF challenge unless the teacher asks for one.

## Production workflow

1. Define the learning objective, audience, instructor or learner role, topology, assets, authorized scope, initial state, and end conditions.
2. Model the experience as an explicit state machine. Every action has a precondition, state transition, observable consequence, and feedback message.
3. Separate semantic planning from runtime materialization. Let the model design the learning path, domain terms, states, and evidence once; compile the approved plan through a deterministic player instead of asking the model to rewrite a full HTML application for every phase. Repair safe structural defects, and fall back to a complete plan-grounded state machine when an optional formatting response is unusable.
4. Design an overview-first interface with 2–4 concept-specific controls, a main visualization, 3–5 synchronized evidence channels, live state, compact event history, and details on demand. Include at least one numeric control and one true/false control; show meaningful change instead of an arbitrary percentage.
5. Add presets or scenarios that demonstrate distinct behaviors, not cosmetic variations. A branch may atomically set declared controls before entering the next state; applying a preset resets state before it runs.
6. Provide start, pause where relevant, deterministic reset, keyboard and touch operation, responsive layout, and reduced-motion-safe feedback.
7. Add facilitator cues, expected observations, branch explanations, checkpoints, and a debrief that connects evidence to the learning objective.
8. Validate initial state, every main branch, success and failure paths, reset idempotence, narrow viewports, keyboard use, repeated execution, and a bounded materialization time that does not depend on one model call per scene.

Use the detailed interaction and test contract in `references/simulation-production-workflow.md`.

## Demonstration versus simulation

For an instructor-led demonstration, optimize for a reliable sequence with clear narration cues, reveal controls, expected observations, and a safe fallback path. For a learner-driven simulation, preserve agency: choices must affect state, consequences must be visible, and recovery must be possible. In both modes, keep offensive behavior inside isolated authorized targets.

## Quality gate

- The experience has a real model or scenario, not a quiz presented as animation.
- At least one visible object, relationship, metric, or topology changes after an action.
- Numeric and Boolean controls change concept-specific evidence immediately; the terminal state includes a causal before/after comparison.
- Current state and the reason for a transition are understandable from the interface.
- Reset returns every mutable value, timer, event, selection, and message to the initial state and works repeatedly.
- Success and failure are distinguishable, accessible, and connected to the teaching objective.
- The interface works without overlap at common desktop and mobile sizes and has usable focus order and touch targets.
- The event history and debrief let the teacher explain what happened and why.

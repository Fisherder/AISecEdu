---
name: cyber-lab-simulation
description: Design and validate rich instructor-led demonstrations and learner-driven cyber simulations with explicit state machines, observable events, meaningful choices, reliable reset, responsive UI, and structured debrief.
---

# Cyber lab simulation

Use this skill for simulations, training demonstrations, interactive labs, and attack-defense scenarios. Do not substitute a generic quiz or CTF challenge unless the teacher asks for one.

## Production workflow

1. Define the learning objective, audience, instructor or learner role, relevant entities, initial state, and end conditions. Topology and system-security controls are relevant only when the actual subject requires them; do not add them to an arithmetic or byte-copy experiment.
2. Model the experience as an explicit state machine. Every action has a precondition, state transition, observable consequence, and feedback message.
3. Separate semantic planning from runtime materialization. Compile one shared state model through the supported deterministic player instead of generating unrelated HTML templates for each phase. Validate the contract, actually execute multiple input cases, and repair with concrete errors. If the approved requirements cannot be implemented, fail explicitly; never silently drop requirements or replace the process with a generic state machine.
4. Design an overview-first interface using only controls that teach the requested concept. There is no mandatory control count, numeric-plus-Boolean combination, evidence-channel count or stage count. One string input can be sufficient. Every control must affect real state and observable evidence; the platform's declared rendering capabilities take precedence over layout examples in this skill.
5. Use contrasting inputs to demonstrate distinct behaviors. In process-v1 each preset belongs to one input, changing any experiment input resets the entire scene, and reset restores all defaults. Do not promise atomic multi-input presets, independently resettable sub-experiments, dynamic region colors or unsupported widgets. Three proposed plans differ in teaching sequence and observation tasks, not in invented extra features.
6. Provide start, pause where relevant, deterministic reset, keyboard and touch operation, responsive layout, and reduced-motion-safe feedback.
7. Use student-facing observations, causal explanations and concise evidence questions. process-v1 checks current visible evidence, clearing answers when the experiment state changes; do not promise answer-gated stages or prediction grading across steps. A teacher may invite an oral prediction without claiming an unsupported grading mechanism.
8. Validate initial state, every main branch, success and failure paths, reset idempotence, narrow viewports, keyboard use, repeated execution, and a bounded materialization time that does not depend on one model call per scene.

Use the detailed interaction and test contract in `references/simulation-production-workflow.md`.

## Demonstration versus simulation

For an instructor-led demonstration, optimize for a reliable sequence with clear narration cues, reveal controls, expected observations, and a safe fallback path. For a learner-driven simulation, preserve agency: choices must affect state, consequences must be visible, and recovery must be possible. In both modes, keep offensive behavior inside isolated authorized targets.

## Quality gate

- The experience has a real model or scenario, not a quiz presented as animation.
- At least one visible object, relationship, metric, or topology changes after an action.
- Requested inputs and actions change concept-specific evidence. Two different inputs produce correctly calculated outcomes; no fixed ending, arbitrary percentage or text-only claim can substitute for computation.
- Current state and the reason for a transition are understandable from the interface.
- Reset returns every mutable value, timer, event, selection, and message to the initial state and works repeatedly.
- Success and failure are distinguishable, accessible, and connected to the teaching objective.
- The interface works without overlap at common desktop and mobile sizes and has usable focus order and touch targets.
- The event history and debrief let the teacher explain what happened and why.

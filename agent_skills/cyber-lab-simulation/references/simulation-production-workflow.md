# Simulation production workflow

## State contract

Define `initialState`, allowed actions, transition rules, derived metrics, observable events, success and failure conditions, and `reset()`. Use stable action and element identifiers. Treat rendering as a projection of state: retrying the same action or restoring a saved snapshot must not corrupt the model.

Use a two-stage contract: the model produces the semantic state model and independently checkable examples, then a deterministic compiler validates IDs, expression types, array bounds, controls and observable evidence before rendering the player. Actually run different inputs and assert the resulting states. Do not drop broken targets or fabricate evidence. Return concrete failures for bounded repair; if still invalid, preserve the previous artifact rather than substitute a generic experience. Do not make one open-ended HTML-generation call per phase or impose an arbitrary stage count.

For each action record: actor, precondition, state before, action, state after, visible evidence, feedback, and teaching meaning. Use monotonically increasing event sequence numbers when events can arrive asynchronously.

## Experience design

Show the requested process first, then its necessary inputs and evidence. Do not require a numeric input, Boolean switch, topology, log, history table or risk meter when the learning objective does not need it. For process-v1 the supported views are computed values/text, arrays with fixed regions and an active cell, code text, and labeled bars. These are not arbitrary tables, dynamic visibility controls or plotting axes. Presets set one input only. Every input change starts a fresh experiment, preserving the chosen input values; reset instead restores all input defaults. Do not promise independent sub-experiment resets or multi-input presets. Use the built-in step, continuous execution, pause, undo and reset instead of redefining player actions as domain transitions.

Plan only within these actual capabilities. Three schemes can contrast guided observation, counterexample comparison and independent investigation using the same necessary inputs and actions. They must not add unsupported mechanics merely to look different. Current-evidence questions are checked immediately and cleared after state changes; prediction followed by automatic grading and answer-gated unlocks are not supported. Keep student prose about visible phenomena and causal relationships, not modeling instructions.

Instructor-led demonstrations add narration cues, reveal/highlight controls, expected observations, and a recovery path. Learner simulations add meaningful branches, consequences, checkpoints, and feedback without revealing the answer prematurely.

## Browser validation

Test with role or stable test-id selectors rather than brittle positions. Verify:

- initial values and visible model;
- main action produces an obvious visible change;
- each requested input changes the correct state and evidence without reloading;
- contrasting inputs produce independently computed results and explanations;
- every required branch and terminal condition;
- pause/resume if present;
- reset after each terminal state and reset repeated twice;
- keyboard focus and activation;
- 320, 375, 414, 768, and desktop widths without overlap;
- reduced-motion mode and readable contrast;
- postMessage actions are safe, idempotent, and reflected in state;
- screenshots or structured diagnostics are captured on failure.
- materialization completes within the product timeout without one model request per phase; retry replaces the failed task in place.

Do not call a simulation complete until these tests pass after the final repair.

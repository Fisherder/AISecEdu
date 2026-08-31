# Simulation production workflow

## State contract

Define `initialState`, allowed actions, transition rules, derived metrics, observable events, success and failure conditions, and `reset()`. Use stable action and element identifiers. Treat rendering as a projection of state: retrying the same action or restoring a saved snapshot must not corrupt the model.

Use a two-stage contract: the model produces the semantic plan once, then a deterministic compiler normalizes IDs, drops broken targets, constrains control values, fills missing evidence, and renders the player. Do not make one open-ended HTML-generation call per scene after the plan is already approved. The compiler must always be able to produce a complete 5–8 state experience from the approved plan, even when an optional structured response is malformed.

For each action record: actor, precondition, state before, action, state after, visible evidence, feedback, and teaching meaning. Use monotonically increasing event sequence numbers when events can arrive asynchronously.

## Experience design

Show the main system or scenario first, then controls and detail. Define two to four concept-specific controls, including a bounded numeric input and a Boolean state switch. Define three to five named evidence channels such as request, transformed input, system log, topology, metric, or output; render them beside the scenario and update them synchronously after every control or state transition. Include a live status summary and a compact event history. Learner choices should change topology, metrics, evidence, risk, or outcome. Encode branch-side control changes as a validated map of declared control IDs to bounded numeric or Boolean values, and apply that map atomically before rendering the destination state. Presets represent distinct teaching cases and always initialize a fresh state. Provide undo only when it is pedagogically valid; always provide reset.

Instructor-led demonstrations add narration cues, reveal/highlight controls, expected observations, and a recovery path. Learner simulations add meaningful branches, consequences, checkpoints, and feedback without revealing the answer prematurely.

## Browser validation

Test with role or stable test-id selectors rather than brittle positions. Verify:

- initial values and visible model;
- main action produces an obvious visible change;
- numeric and Boolean controls change the correct evidence channels without reloading;
- terminal comparison explains the causal difference between two selected configurations;
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

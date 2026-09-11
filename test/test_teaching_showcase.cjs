const assert = require("node:assert/strict");
const { test } = require("node:test");
const model = require("../dojo_theme/static/js/dojo/teaching-showcase-model.js");

for (const scenario of Object.keys(model.scenarios)) {
  test(`${scenario}: normal, hidden deviation, independent verification and recovery`, () => {
    let state = model.initial(scenario);
    assert.equal(model.evidence(state).actual, 50);
    for (let i = 0; i < 3; i++) state = model.reduce(state, { type: "step" });
    const hidden = model.evidence(state);
    assert.equal(hidden.actual, 80);
    assert.equal(hidden.reported, 50);
    assert.equal(hidden.mismatch, 30);
    state = model.reduce(state, { type: "intensity", value: 45 });
    assert.equal(model.evidence(state).mismatch, 45);
    state = model.reduce(state, { type: "verify", value: true });
    assert.equal(model.evidence(state).actual, 50);
    assert.equal(model.evidence(state).blocked, true);
    state = model.reduce(state, { type: "verify", value: false });
    state = model.reduce(state, { type: "step" });
    assert.equal(model.evidence(state).actual, model.evidence(state).reported);
    assert.equal(model.evidence(state).actual, 95);
    state = model.reduce(state, { type: "step" });
    assert.equal(model.evidence(state).actual, 50);
    assert.equal(state.playing, false);
    assert.equal(state.events.length, 8);
    assert.deepEqual(model.reduce(state, { type: "reset" }), model.initial(scenario));
    assert.deepEqual(model.reduce(model.reduce(state, { type: "reset" }), { type: "reset" }), model.initial(scenario));
  });
}
test("pause, repeated playback and bounded state never drift", () => {
  let state = model.reduce(model.initial(), { type: "play" });
  for (let i = 0; i < 30; i++) state = model.reduce(state, { type: "step" });
  assert.equal(state.phase, 5);
  assert.equal(state.playing, false);
  state = model.reduce(state, { type: "play" });
  assert.equal(state.phase, 0);
  state = model.reduce(state, { type: "pause" });
  assert.equal(state.playing, false);
  state = model.reduce(state, { type: "intensity", value: 10000 });
  assert.equal(state.intensity, 50);
  state = model.reduce(state, { type: "seek", value: -100 });
  assert.equal(state.phase, 0);
  assert.deepEqual(model.reduce(state, { type: "scenario", value: "vehicle" }), model.initial("vehicle"));
});
test("debate decisions remain local and reset clears every participant action", () => {
  let state = model.reduce(model.initial(), { type: "mode", value: "debate" });
  for (let i = 0; i < 5; i++) state = model.reduce(state, { type: "round" });
  assert.equal(state.round, 2);
  state = model.reduce(state, { type: "vote", value: "contain" });
  assert.equal(state.vote, "contain");
  assert.equal(model.reduce(state, { type: "mode", value: "unknown" }), state);
  assert.deepEqual(model.reduce(state, { type: "reset" }), model.initial());
});

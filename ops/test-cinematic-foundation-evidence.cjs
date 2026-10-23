const test = require('node:test');
const assert = require('node:assert/strict');
const { auditFoundations } = require('./cinematic-foundation-evidence.cjs');

function fixture() {
  const common = { role: 'support', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 1 };
  return { nodes: [
    { ...common, id: 'base', kind: 'box', position: [0,-3.2,0], params: { width: 12, height: 0.4, depth: 12 } },
    { ...common, id: 'pipe', kind: 'model', model: 'pipe-assembly', params: { layout: 'straight' } },
  ], tracks: [] };
}

function addMeasuredRisers(scene) {
  const evidence = auditFoundations(scene);
  for (const [index, foot] of evidence.feet.entries()) {
    const height = foot.bounds.min[1] - evidence.baseTop;
    scene.nodes.push({ id: 'riser-' + index, kind: 'box', role: 'support', position: [(foot.bounds.min[0] + foot.bounds.max[0])/2, evidence.baseTop + height/2, (foot.bounds.min[2] + foot.bounds.max[2])/2], rotation: [0,0,0], scale: [1,1,1], opacity: 1, params: { width: foot.bounds.max[0]-foot.bounds.min[0]+0.05, height, depth: foot.bounds.max[2]-foot.bounds.min[2]+0.05 } });
  }
}

test('detects real pipe feet that float despite an existing common base', () => {
  const result = auditFoundations(fixture());
  assert.equal(result.passed, false); assert.equal(result.feet.length, 2);
  assert.ok(result.feet.every(foot => foot.directBaseGap > 1 && foot.supportPath === null));
});
test('requires continuous supporting boxes from each actual foot down to the common base', () => {
  const scene = fixture(); addMeasuredRisers(scene);
  assert.equal(auditFoundations(scene).passed, true);
  scene.nodes.at(-1).position[1] += 0.02;
  assert.equal(auditFoundations(scene).passed, false);
});
test('narrow decorative or hidden boxes do not prove support', () => {
  for (const mutate of [node => node.params.width /= 2, node => node.role = 'decoration', node => node.opacity = 0]) {
    const scene = fixture(); addMeasuredRisers(scene); mutate(scene.nodes.at(-1));
    assert.equal(auditFoundations(scene).passed, false);
  }
});
test('checks parent transforms and sampled visibility, without mutating the scene', () => {
  const scene = fixture();
  scene.nodes.push({ id:'parent', kind:'group', position:[1,0,2], rotation:[0,0.4,0], scale:[1.2,1,0.8], params:{}, opacity:1 });
  scene.nodes[1].parent = 'parent'; addMeasuredRisers(scene);
  const before = structuredClone(scene);
  assert.equal(auditFoundations(scene).passed, true);
  assert.deepEqual(scene, before);
  scene.tracks.push({ target:scene.nodes.at(-1).id, property:'opacity', easing:'linear', keyframes:[{at:0,value:0},{at:58,value:0},{at:60,value:1}] });
  assert.equal(auditFoundations(scene, 0).passed, false);
  assert.equal(auditFoundations(scene, 66).passed, true);
});
test('detects one real valve mounting plate and preserves it through explosion', () => {
  const scene = fixture(); scene.nodes[1].model='valve'; scene.nodes[1].params={actuator:'electric'};
  addMeasuredRisers(scene);
  scene.tracks.push({target:'pipe',property:'explode',easing:'linear',keyframes:[{at:0,value:0},{at:44,value:1},{at:56,value:0}]});
  for(const time of [0,44,56]) { const result=auditFoundations(scene,time); assert.equal(result.feet.length,1); assert.equal(result.passed,true); }
});

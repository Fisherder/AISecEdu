const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtime = vm.createContext({ console: { warn() {}, error() {} } });
const engine = path.resolve(__dirname, '../services/agent-runtime');
vm.runInContext(fs.readFileSync(path.join(engine, 'public/vendor/three-r150.min.js'), 'utf8'), runtime, { timeout: 5000 });
vm.runInContext(fs.readFileSync(path.join(engine, 'lib/cinematic/models.js'), 'utf8'), runtime, { timeout: 5000 });
const T = runtime.THREE;
const epsilon = 0.002;

function valueAt(scene, node, property, time) {
  const track = scene.tracks.find(item => item.target === node.id && item.property === property);
  if (!track) return node[property] ?? (property === 'explode' ? 0 : property === 'opacity' ? 1 : undefined);
  const keys = track.keyframes;
  if (time <= keys[0].at) return keys[0].value;
  for (let i = 1; i < keys.length; i++) if (time < keys[i].at) {
    let fraction = (time - keys[i - 1].at) / (keys[i].at - keys[i - 1].at);
    if (track.easing === 'smooth') fraction *= fraction * (3 - 2 * fraction);
    const a = keys[i - 1].value, b = keys[i].value;
    return Array.isArray(a) ? a.map((v, axis) => v + (b[axis] - v) * fraction) : a + (b - a) * fraction;
  }
  return keys.at(-1).value;
}

function boxData(bounds) { return { min: bounds.min.toArray(), max: bounds.max.toArray() }; }
function covers(a, b) { return [0, 2].every(axis => a.min[axis] <= b.min[axis] + epsilon && a.max[axis] >= b.max[axis] - epsilon); }
function axisAligned(object) { return [1, 2, 4, 6, 8, 9].every(index => Math.abs(object.matrixWorld.elements[index]) < 1e-8); }

function auditFoundations(scene, time = 0) {
  assert.ok(scene.nodes.length <= 256 && scene.tracks.length <= 1024);
  const nodes = new Map(scene.nodes.map(node => [node.id, node])), objects = new Map(), opacities = new Map(), visiting = new Set();
  assert.equal(nodes.size, scene.nodes.length);
  const root = new T.Group();
  function create(id) {
    if (objects.has(id)) return objects.get(id);
    assert.ok(!visiting.has(id), 'Cyclic scene parent'); visiting.add(id);
    const node = nodes.get(id); assert.ok(node, 'Missing scene parent');
    const parent = node.parent ? create(node.parent) : root;
    const object = node.kind === 'model' ? runtime.CinematicModels.create(T, { model: node.model, params: node.params, metadataOnly: true }) : node.kind === 'box' ? new T.Mesh(new T.BoxGeometry(node.params.width, node.params.height, node.params.depth), new T.MeshBasicMaterial()) : new T.Group();
    if (node.kind === 'model') object.userData.update(time, valueAt(scene, node, 'explode', time));
    object.position.fromArray(valueAt(scene, node, 'position', time));
    object.rotation.fromArray(valueAt(scene, node, 'rotation', time));
    object.scale.fromArray(valueAt(scene, node, 'scale', time));
    parent.add(object); objects.set(id, object);
    opacities.set(id, valueAt(scene, node, 'opacity', time) * (node.parent ? opacities.get(node.parent) : 1));
    visiting.delete(id); return object;
  }
  try {
    for (const node of scene.nodes) create(node.id);
    root.updateMatrixWorld(true);
    const base = nodes.get('base'); assert.equal(base?.kind, 'box'); assert.ok(axisAligned(objects.get('base')));
    const baseBounds = boxData(new T.Box3().setFromObject(objects.get('base')));
    const supports = scene.nodes.filter(node => node.kind === 'box' && node.role !== 'logic' && node.role !== 'decoration' && opacities.get(node.id) > 0.25 && axisAligned(objects.get(node.id)))
      .map(node => ({ id: node.id, bounds: boxData(new T.Box3().setFromObject(objects.get(node.id))) }));
    function supportPath(foot, seen = new Set()) {
      for (const support of supports) {
        if (seen.has(support.id) || !covers(support.bounds, foot) || Math.abs(support.bounds.max[1] - foot.min[1]) > epsilon) continue;
        if (support.id === 'base') return ['base'];
        const rest = supportPath(support.bounds, new Set([...seen, support.id]));
        if (rest) return [support.id, ...rest];
      }
      return null;
    }
    const feet = [];
    for (const node of scene.nodes.filter(node => ['valve', 'pipe-assembly'].includes(node.model) && opacities.get(node.id) > 0.25)) {
      const object = objects.get(node.id), full = new T.Box3().setFromObject(object), parts = [];
      object.traverse(part => {
        if (!part.isMesh) return;
        const bounds = new T.Box3().setFromObject(part);
        if (node.model === 'pipe-assembly' ? part.name === 'support-base' : Math.abs(bounds.min.y - full.min.y) < 1e-5 && bounds.max.y - bounds.min.y < 0.2 * (full.max.y - full.min.y)) parts.push({ name: part.name || 'mount-base', bounds: boxData(bounds) });
      });
      assert.equal(parts.length, node.model === 'valve' ? 1 : 2, 'Unexpected asset foot structure: ' + node.id);
      parts.forEach((part, index) => feet.push({ node: node.id, part: part.name, index, bounds: part.bounds, directBaseGap: part.bounds.min[1] - baseBounds.max[1], supportPath: supportPath(part.bounds) }));
    }
    return { time, method: 'real-mesh-foot-AABB-to-axis-aligned-box-support-chain', tolerance: epsilon, baseTop: baseBounds.max[1], passed: feet.length > 0 && feet.every(foot => foot.supportPath), feet, limitations: ['Conservative footprint coverage, not triangle contact or structural/physics simulation', 'Does not classify arbitrary geometry as a support', 'Not a browser screenshot or visual acceptance'] };
  } finally {
    for (const [id, object] of objects) {
      if (nodes.get(id).kind === 'model') object.userData.dispose();
      else if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); }
    }
  }
}

module.exports = { auditFoundations, valueAt };
if (require.main === module) {
  assert.equal(process.argv.length, 3);
  const artifact = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const scene = artifact.revision.content.lesson.artifacts[0].content.cinematicScene;
  console.log(JSON.stringify({ artifactId: artifact.id, revision: artifact.currentRevision, samples: [0, 56, 66].map(time => auditFoundations(scene, time)) }, null, 2));
}

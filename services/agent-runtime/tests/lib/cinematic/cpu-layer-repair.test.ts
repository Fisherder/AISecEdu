import { describe, expect, it } from 'vitest';
import { applyCinematicPatches, sanitizeCinematicGeometryPatches } from '../../../lib/server/cinematic-generation';
import { parseCinematicScene } from '../../../lib/cinematic/schema';
import cpuRepair from './fixtures/cpu-layer-repair.json';

describe('processor layer repair', () => {
  it('retains source mappings but rejects a crude replacement for the detailed asset', () => {
    const scene = parseCinematicScene(cpuRepair.scene);
    const repaired = sanitizeCinematicGeometryPatches(scene, cpuRepair.repair);
    const objects = repaired.patches.find(item => item.path === '/coverage/objects')?.value;
    const interactions = repaired.patches.find(item => item.path === '/coverage/interactions')?.value;
    if (!Array.isArray(objects) || !objects.every(item => 'name' in item && 'nodes' in item)) {
      throw new Error('Expected an object coverage patch');
    }
    if (!Array.isArray(interactions) || !interactions.every(item => 'description' in item)) {
      throw new Error('Expected an interaction coverage patch');
    }
    expect(objects.map(item => item.name)).toEqual(scene.coverage?.objects.map(item => item.name));
    expect(objects.find(item => item.name === '陶瓷封装')?.nodes).toEqual(['ceramic_package']);
    expect(interactions.map(item => item.description))
      .toEqual(scene.coverage?.interactions.map(item => item.description));
    expect(() => applyCinematicPatches(scene, repaired)).toThrow('model-count-minimum');
  });

  it('rejects a whole-list patch that reorders locked source requirements', () => {
    const scene = parseCinematicScene(cpuRepair.scene);
    const reordered = structuredClone(cpuRepair.repair);
    const patch = reordered.patches.find(item => item.path === '/coverage/objects')!;
    if (!Array.isArray(patch.value)) throw Error('fixture requires object coverage');
    [patch.value[0], patch.value[1]] = [patch.value[1], patch.value[0]];
    expect(() => sanitizeCinematicGeometryPatches(scene, reordered)).toThrow('保留原始要求及顺序');
  });
});

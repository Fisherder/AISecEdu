import { describe, expect, it } from 'vitest';
import { applyCinematicPatches, sanitizeCinematicGeometryPatches } from '../../../lib/server/cinematic-generation';
import { parseCinematicScene } from '../../../lib/cinematic/schema';
import cpuRepair from './fixtures/cpu-layer-repair.json';

describe('processor layer repair', () => {
  it('retains source mappings but rejects a crude replacement for the detailed asset', () => {
    const scene = parseCinematicScene(cpuRepair.scene);
    const repaired = sanitizeCinematicGeometryPatches(scene, cpuRepair.repair);
    const objectPatch = repaired.patches.find(item => item.path === '/coverage/objects')!;
    const interactionPatch = repaired.patches.find(item => item.path === '/coverage/interactions')!;
    expect(objectPatch.value?.map(item => item.name)).toEqual(scene.coverage?.objects.map(item => item.name));
    expect(objectPatch.value?.find(item => item.name === '陶瓷封装')?.nodes).toEqual(['ceramic_package']);
    expect(interactionPatch.value?.map(item => item.description))
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

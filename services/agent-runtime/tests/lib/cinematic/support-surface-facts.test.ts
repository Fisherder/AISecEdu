import { describe, expect, it } from 'vitest';
import { assetCatalog } from '../../../lib/cinematic/asset-catalog';
import { geometryContext, CINEMATIC_SCENE_PROMPT } from '../../../lib/server/cinematic-generation';
import { worldNodes, corners, enclosing, transformPoint } from '../../../lib/cinematic/assembly';
import { sceneFixture } from '../../fixtures/cinematic';

describe('measured support surface facts in the real generation context', () => {
  it('reports one normalized valve mounting plate and two pipe feet with their actual bounds', () => {
    const valve = assetCatalog('valve', { actuator: 'electric' });
    expect(valve.supportSurfaces).toHaveLength(1);
    const plate = valve.supportSurfaces[0];
    expect(plate.id).toBe('mount-base');
    expect(plate.bounds.min[1]).toBeCloseTo(valve.floor, 6);
    expect(plate.bounds.max[0] - plate.bounds.min[0]).not.toBeCloseTo(1.96, 3);
    expect(plate).toMatchObject({ coordinateSpace: 'normalized-root', state: 'initial-assembled', dynamic: false });
    for (const layout of ['straight', 'elbow', 'u']) {
      const catalog = assetCatalog('pipe-assembly', { layout });
      expect(catalog.supportSurfaces.map(surface => surface.id)).toEqual(['support-base-1', 'support-base-2']);
      for (const surface of catalog.supportSurfaces) expect(surface.bounds.min[1]).toBeCloseTo(catalog.floor, 6);
    }
    expect(assetCatalog('planet').supportSurfaces).toEqual([]);
  });

  it('distinguishes local normalized dimensions from each instance world transform', () => {
    const scene = sceneFixture();
    scene.nodes[0].model = 'valve'; scene.nodes[0].params = { actuator: 'electric' };
    scene.nodes[0].position = [3, -1, 2]; scene.nodes[0].scale = [1.3, 0.8, 1.1];
    scene.nodes.push({ ...scene.nodes[2], id: 'parent', kind: 'group', position: [1, 2, 3], rotation: [0, 0.4, 0], scale: [2, 1, 0.5] });
    scene.nodes[0].parent = 'parent';
    const before = structuredClone(scene), facts = geometryContext(scene).find(item => item.kind === 'valve')!;
    const instance = facts.instances!.find(item => item.id === scene.nodes[0].id)!;
    const matrix = worldNodes(scene).get(scene.nodes[0].id)!.matrix;
    expect(instance.coordinateSpace).toBe('world-at-time-zero');
    expect(instance.supportSurfaces[0].bounds).toEqual(enclosing(corners(facts.supportSurfaces[0].bounds).map(point => transformPoint(matrix, point))));
    expect(instance.supportSurfaces[0].bounds).not.toEqual(facts.supportSurfaces[0].bounds);
    expect(scene).toEqual(before);
  });

  it('supplies support facts before a new scene exists and detaches cached values', () => {
    const first = geometryContext(undefined, ['valve'])[0];
    expect(first.instances).toBeUndefined();
    expect(first.supportSurfaces).toHaveLength(1);
    first.supportSurfaces[0].bounds.min[0] = -999;
    expect(geometryContext(undefined, ['valve'])[0].supportSurfaces[0].bounds.min[0]).not.toBe(-999);
    expect(CINEMATIC_SCENE_PROMPT).toContain('绝不是建模函数中的原始尺寸');
    expect(CINEMATIC_SCENE_PROMPT).toContain('以法兰端口对齐证明底脚着地');
  });
});

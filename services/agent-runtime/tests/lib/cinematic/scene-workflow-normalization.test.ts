import { describe, expect, it } from 'vitest';
import { assetDefinition } from '@/lib/cinematic/asset-definitions';
import { normalizeCinematicStructureAssetRoles } from '@/lib/cinematic/scene-workflow';
import type { CinematicScene } from '@/lib/cinematic/schema';
import { sceneFixture } from '../../fixtures/cinematic';

type Assembly = NonNullable<CinematicScene['assembly']>;

describe('staged cinematic structure normalization', () => {
  it('maps descriptive asset roles to the selected model catalog without mutating the draft', () => {
    const draft = sceneFixture();
    const housing = draft.nodes[0];
    const panel = draft.nodes[1];
    housing.model = 'centrifuge-housing';
    housing.assetRole = '剖切外壳与承载结构';
    panel.model = 'industrial-controller';
    panel.assetRole = '界面读数和操作按钮';

    const normalized = normalizeCinematicStructureAssetRoles(draft);
    expect(normalized.nodes.find(node => node.id === housing.id)?.assetRole)
      .toBe(assetDefinition('centrifuge-housing').roles[0]);
    expect(normalized.nodes.find(node => node.id === panel.id)?.assetRole)
      .toBe(assetDefinition('industrial-controller').roles[0]);
    expect(housing.assetRole).toBe('剖切外壳与承载结构');
    expect(panel.assetRole).toBe('界面读数和操作按钮');
  });

  it('drops impossible primitive rotor port placements and leaves other assembly relations intact', () => {
    const assembly: Assembly = {
      version: 'assembly-v1',
      placements: [
        { mode: 'port', node: 'base', reference: 'hero', port: 'rotor-center', referencePort: 'rotor-center', gap: 0, offset: [0, 0, 0] },
        { mode: 'floor', node: 'hero', y: 0 },
      ],
    };
    const draft = { ...sceneFixture(), assembly };
    draft.nodes[0].model = 'centrifuge-housing';
    draft.nodes[2].kind = 'cylinder';
    draft.nodes[2].parent = 'hero';

    const normalized = normalizeCinematicStructureAssetRoles(draft);
    expect(normalized.assembly.placements).toEqual([{ mode: 'floor', node: 'hero', y: 0 }]);
    expect(draft.assembly.placements).toHaveLength(2);
  });

  it('uses descendant bounds for physical groups and rejects empty bounds or group ports', () => {
    const assembly: Assembly = {
      version: 'assembly-v1',
      placements: [
        { mode: 'relative', node: 'hero', reference: 'housing-group', side: 'right', gap: 1, offset: [0, 0, 0] },
        { mode: 'relative', node: 'housing-group', reference: 'bank', side: 'left', gap: 1, offset: [0, 0, 0] },
        { mode: 'relative', node: 'hero', reference: 'empty-group', side: 'right', gap: 1, offset: [0, 0, 0] },
        { mode: 'relative', node: 'empty-group', reference: 'bank', side: 'left', gap: 1, offset: [0, 0, 0] },
        { mode: 'port', node: 'hero', reference: 'housing-group', port: 'center', referencePort: 'center', gap: 0, offset: [0, 0, 0] },
        { mode: 'port', node: 'housing-group', reference: 'hero', port: 'center', referencePort: 'center', gap: 0, offset: [0, 0, 0] },
        { mode: 'floor', node: 'bank', y: 0 },
      ],
    };
    const draft = { ...sceneFixture(), assembly };
    const base = draft.nodes[2];
    draft.nodes.push(
      { ...base, id: 'housing-group', kind: 'group', params: {} },
      { ...base, id: 'empty-group', kind: 'group', params: {} },
    );
    base.parent = 'housing-group';
    const before = structuredClone(draft.assembly);

    const normalized = normalizeCinematicStructureAssetRoles(draft);
    expect(normalized.assembly.placements).toEqual([
      before.placements[0], before.placements[1], before.placements[6],
    ]);
    expect(draft.assembly).toEqual(before);
  });
});

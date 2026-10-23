import { parseCinematicScene } from '../../lib/cinematic/schema';
import { sceneFixture, directorFixture } from './cinematic';

export const assemblySceneFixture = () =>
  parseCinematicScene({
    ...sceneFixture(),
    nodes: [
      {
        id: 'hero',
        kind: 'model',
        model: 'processor',
        role: 'primary',
        represents: '处理器结构',
        assetRole: 'processor-package',
      },
      {
        id: 'base',
        kind: 'model',
        model: 'circuit-board',
        role: 'support',
        represents: '承载电路板',
        assetRole: 'hardware-support',
      },
      {
        id: 'logic',
        kind: 'model',
        model: 'logic-stack',
        role: 'logic',
        represents: '逻辑层级',
        assetRole: 'logical-layered-storage',
      },
    ],
    assembly: {
      version: 'assembly-v1',
      placements: [
        { mode: 'floor', node: 'base', y: -2.1 },
        { mode: 'relative', node: 'hero', reference: 'base', side: 'above', gap: 0.2 },
        { mode: 'relative', node: 'logic', reference: 'base', side: 'right', gap: 2 },
      ],
    },
    tracks: ['hero', 'logic'].map((target) => ({
      target,
      property: 'explode',
      keyframes: [
        { at: 0, value: 0 },
        { at: 60, value: 1 },
      ],
    })),
    shots: sceneFixture().shots.map((shot) => ({
      ...shot,
      frame: { nodes: ['hero', 'logic'], padding: 1.2 },
    })),
    chapters: sceneFixture().chapters.map((chapter) => ({ ...chapter, focus: ['hero', 'logic'] })),
    coverage: {
      objects: [
        { name: '处理器结构', nodes: ['hero'] },
        { name: '承载电路板', nodes: ['base'] },
        { name: '逻辑层级', nodes: ['logic'] },
      ],
      interactions: [
        { description: '逐步拆开观察内部', chapter: 1, targets: ['hero'], properties: ['explode'] },
      ],
    },
  });

export const assemblyDirectorFixture = {
  ...directorFixture,
  subjects: [
    {
      name: '处理器结构',
      model: 'processor',
      assetRole: 'processor-package',
      role: 'primary',
      assemblyIntent: '置于电路板上方留出拆解空间',
    },
    {
      name: '承载电路板',
      model: 'circuit-board',
      assetRole: 'hardware-support',
      role: 'support',
      assemblyIntent: '承载处理器结构作为整体硬件背景',
    },
    {
      name: '逻辑层级',
      model: 'logic-stack',
      assetRole: 'logical-layered-storage',
      role: 'logic',
      assemblyIntent: '在实体侧边独立展示逻辑分层关系',
    },
  ],
};

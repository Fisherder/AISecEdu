import { describe, expect, it } from 'vitest';
import { checkCinematicQuality } from '@/lib/cinematic/quality';
import {
  compose,
  transformPoint,
  worldBounds,
  worldNodes,
  type Vector3,
} from '@/lib/cinematic/assembly';
import { parseCinematicScene, type CinematicScene } from '@/lib/cinematic/schema';
import { sceneFixture } from '../../fixtures/cinematic';

const description = '标记沿路径进入指定区域';
const samples = [0, 3.75, 7.5, 11.25, 15, 30, 60];
const fixture = (delta: Vector3) =>
  parseCinematicScene({
    ...sceneFixture(),
    nodes: [
      {
        id: 'marker',
        kind: 'box',
        role: 'logic',
        represents: '过程标记',
        params: { width: 0.4, height: 0.4, depth: 0.4 },
      },
      { id: 'context', kind: 'box', role: 'support', represents: '参照区域', position: [5, 0, 0] },
      {
        id: 'model',
        kind: 'model',
        model: 'processor',
        role: 'primary',
        represents: '实体参照',
        position: [0, -4, 0],
      },
    ],
    tracks: [
      {
        target: 'marker',
        property: 'position',
        easing: 'linear',
        keyframes: [
          { at: 0, value: [0, 0, 0] },
          { at: 15, value: delta },
          { at: 60, value: delta },
        ],
      },
    ],
    chapters: [0, 15, 30, 45].map((at) => ({
      at,
      title: '过程观察',
      caption: '对照标记和参照区域的空间对应关系',
      kind: 'inspection',
      focus: ['marker'],
    })),
    shots: sceneFixture().shots.map((shot) => ({
      ...shot,
      frame: { nodes: ['marker', 'context', 'model'], padding: 1.2 },
    })),
    coverage: {
      objects: [],
      interactions: [{ description, chapter: 0, targets: ['marker'], properties: ['position'] }],
    },
  });
const check = (scene: CinematicScene) =>
  checkCinematicQuality(scene, {
    requireComposition: false,
    interactionRequirements: [{ description, kind: 'transport' }],
  });
const parented = (
  delta: Vector3,
  parentScale: Vector3,
  rotation: Vector3 = [0, 0, 0],
  compensate = true,
) => {
  const scene = fixture(delta);
  scene.nodes.push({
    ...scene.nodes[0],
    id: 'parent',
    kind: 'group',
    params: {},
    scale: parentScale,
    rotation,
  });
  scene.nodes[0].parent = 'parent';
  if (compensate) scene.nodes[0].scale = parentScale.map((s) => 1 / s) as Vector3;
  return parseCinematicScene(scene);
};
const flattened = (scene: CinematicScene) => {
  const flat = structuredClone(scene),
    parent = scene.nodes.find((node) => node.id === 'parent')!;
  const matrix = compose(parent.position, parent.rotation, parent.scale);
  flat.nodes = flat.nodes.filter((node) => node.id !== 'parent');
  const marker = flat.nodes[0];
  delete marker.parent;
  marker.position = transformPoint(matrix, marker.position);
  marker.rotation = [...parent.rotation];
  marker.scale = marker.scale.map((s, axis) => s * parent.scale[axis]) as Vector3;
  flat.tracks[0].keyframes = flat.tracks[0].keyframes.map((key) => ({
    ...key,
    value: transformPoint(matrix, key.value as Vector3),
  }));
  return parseCinematicScene(flat);
};
const expectSameWorld = (a: CinematicScene, b: CinematicScene) => {
  for (const at of samples) {
    const first = worldNodes(a, at).get('marker')!,
      second = worldNodes(b, at).get('marker')!;
    first.matrix.forEach((value, i) =>
      expect(Math.abs(value - second.matrix[i])).toBeLessThan(1e-12),
    );
    for (const side of ['min', 'max'] as const)
      worldBounds(first)[side].forEach((value, i) =>
        expect(Math.abs(value - worldBounds(second)[side][i])).toBeLessThan(1e-12),
      );
  }
};
const diagnostic = (scene: CinematicScene) => {
  const report = check(scene);
  expect(report.interactionEvidence[0].status).toBe('FAIL');
  return report.interactionEvidence[0].diagnostics!.mappings[0].tracks[0];
};

describe('world-coordinate invariant position evidence', () => {
  it.each([
    { delta: [0.1, 0, 0], scale: [10, 10, 10], status: 'PASS' },
    { delta: [1, 0, 0], scale: [0.1, 0.1, 0.1], status: 'FAIL' },
    { delta: [0.0001, 0, 0], scale: [10, 10, 10], status: 'FAIL' },
  ])(
    'judges equal world matrices equally for parent $scale and local delta $delta',
    ({ delta, scale, status }) => {
      const nested = parented(delta as Vector3, scale as Vector3),
        flat = flattened(nested);
      expectSameWorld(nested, flat);
      const original = structuredClone(nested),
        a = check(nested),
        b = check(flat);
      expect(a.status).toBe(status);
      expect(b.status).toBe(status);
      expect(a.interactionEvidence[0].status).toBe(status);
      expect(b.interactionEvidence[0].status).toBe(status);
      expect(a.chapters.map((chapter) => chapter.visibleChanges)).toEqual(
        b.chapters.map((chapter) => chapter.visibleChanges),
      );
      expect(nested).toEqual(original);
      if (status === 'FAIL') {
        const evidence = diagnostic(nested);
        expect(evidence.coordinateSpace).toBe('world');
        expect(evidence.visibleMagnitude).toBeCloseTo(Math.abs(delta[0] * scale[0]), 12);
        expect(evidence.visibleThreshold).toBe(0.12);
      }
    },
  );

  it.each([
    { delta: [0.08, 0.1, 0.2], compensate: true, status: 'PASS' },
    { delta: [0.002, 0.001, 0.001], compensate: true, status: 'FAIL' },
    { delta: [0.01, 0, 0], compensate: false, status: 'FAIL' },
    { delta: [0.03, 0, 0], compensate: false, status: 'PASS' },
  ])(
    'handles rotated nonuniform parents: $delta, compensated=$compensate',
    ({ delta, compensate, status }) => {
      const nested = parented(delta as Vector3, [10, 2, 0.5], [0.2, -0.4, 0.6], compensate),
        flat = flattened(nested);
      expectSameWorld(nested, flat);
      expect(check(nested).interactionEvidence[0].status).toBe(status);
      expect(check(flat).interactionEvidence[0].status).toBe(status);
      if (status === 'FAIL') {
        expect(diagnostic(nested).visibleMagnitude).toBeCloseTo(
          diagnostic(flat).visibleMagnitude,
          12,
        );
        expect(diagnostic(nested).visibleThreshold).toBeCloseTo(
          diagnostic(flat).visibleThreshold,
          12,
        );
      }
    },
  );

  it('keeps the 4% world-bounds threshold rather than only the absolute minimum', () => {
    const scene = parented([0.013, 0, 0], [10, 2, 0.5], [0, 0, 0], false);
    const evidence = diagnostic(scene),
      bounds = worldBounds(worldNodes(scene).get('marker')!);
    expect(evidence.visibleMagnitude).toBeCloseTo(0.13, 12);
    expect(evidence.threshold).toBeCloseTo(
      Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])) * 0.04,
      12,
    );
    expect(evidence.threshold).toBeGreaterThan(0.16);
    scene.tracks[0].keyframes[1].value = [0.02, 0, 0];
    scene.tracks[0].keyframes[2].value = [0.02, 0, 0];
    expect(check(scene).interactionEvidence[0].status).toBe('PASS');
  });

  it('uses the actual scaled size when local geometry dimensions change', () => {
    const small = fixture([0.13, 0, 0]),
      large = structuredClone(small);
    large.nodes[0].params = { width: 4, height: 4, depth: 4 };
    large.nodes[0].scale = [0.1, 0.1, 0.1];
    for (const scene of [small, large])
      expect(check(scene).interactionEvidence[0].status).toBe('PASS');
  });

  it('composes nested rotated nonuniform scales instead of using a single parent scalar', () => {
    const scene = parented([0.01, 0.01, 0], [2, 0.5, 3], [0.3, 0.2, -0.4], false);
    const parent = scene.nodes.find((node) => node.id === 'parent')!;
    scene.nodes.push({ ...parent, id: 'outer', scale: [3, 2, 0.5], rotation: [-0.2, 0.4, 0.1] });
    parent.parent = 'outer';
    const evidence = diagnostic(scene),
      a = worldNodes(scene, 0).get('marker')!,
      b = worldNodes(scene, 15).get('marker')!;
    const pa = transformPoint(a.matrix, [0, 0, 0]),
      pb = transformPoint(b.matrix, [0, 0, 0]);
    expect(evidence.worldMagnitude).toBeCloseTo(
      Math.hypot(...pa.map((value, i) => value - pb[i])),
      12,
    );
    expect(evidence.magnitude).toBeCloseTo(evidence.worldMagnitude!, 12);
    expect(evidence.visibleChangeAccepted).toBe(false);
    expect(evidence.threshold).toBeGreaterThanOrEqual(0.12);
  });

  it('measures group movement against its rendered descendants rather than an empty group bound', () => {
    const scene = parented([0.1, 0, 0], [1, 1, 1]);
    scene.nodes[0].params = { width: 10, height: 1, depth: 1 };
    scene.tracks[0] = {
      target: 'parent',
      property: 'position',
      easing: 'linear',
      keyframes: [
        { at: 0, value: [0, 0, 0] },
        { at: 15, value: [0.13, 0, 0] },
      ],
    };
    const evidence = diagnostic(scene);
    expect(evidence.threshold).toBeCloseTo(Math.hypot(10, 1, 1) * 0.04, 12);
    expect(evidence.visibleChangeAccepted).toBe(false);
    scene.tracks[0].keyframes[1].value = [0.6, 0, 0];
    expect(check(scene).interactionEvidence[0].status).toBe('PASS');
  });

  it('rejects locally moving tracks whose world displacement is cancelled by a parent', () => {
    const scene = parented([0.1, 0, 0], [10, 10, 10]);
    scene.tracks.push({
      target: 'parent',
      property: 'position',
      easing: 'linear',
      keyframes: [
        { at: 0, value: [0, 0, 0] },
        { at: 15, value: [-1, 0, 0] },
      ],
    });
    const report = check(scene),
      marker = report.chapters[0].visibleChanges;
    expect(marker).not.toContain('marker:position');
    expect(marker).not.toContain('parent:position');
    expect(report.interactionEvidence[0].status).toBe('FAIL');
    expect(worldNodes(scene, 0).get('marker')!.matrix).toEqual(
      worldNodes(scene, 15).get('marker')!.matrix,
    );
  });

  it.each([0, 0.00001])(
    'does not relabel inherited rotation as position transport for a local delta of %s',
    (delta) => {
      const scene = parented([1 + delta, 0, 0], [1, 1, 1]);
      scene.tracks[0].keyframes[0].value = [1, 0, 0];
      scene.tracks.push({
        target: 'parent',
        property: 'rotation',
        easing: 'linear',
        keyframes: [
          { at: 0, value: [0, 0, 0] },
          { at: 15, value: [0, 0, Math.PI / 2] },
        ],
      });
      const evidence = diagnostic(scene);
      expect(evidence.worldMagnitude).toBeGreaterThan(1);
      expect(evidence.magnitude).toBeCloseTo(delta, 12);
      expect(evidence.visibleChangeAccepted).toBe(false);
    },
  );

  it('keeps world-scale correction subject to the existing hidden-target rejection', () => {
    const scene = parented([0.1, 0, 0], [10, 10, 10]);
    scene.nodes.find((node) => node.id === 'parent')!.opacity = 0;
    const evidence = diagnostic(scene);
    expect(evidence.magnitude).toBeCloseTo(1, 12);
    expect(evidence.visibleSampleCount).toBe(0);
    expect(evidence.reasons).toContain('hidden-at-all-samples');
  });
});

describe('specific unchanged composition assembly policy', () => {
  const composition = (teachingCount: number, modelCount: number, relationCount: number) => {
    const scene = fixture([1, 0, 0]);
    const marker = scene.nodes[0];
    scene.nodes = Array.from({ length: teachingCount }, (_, index) => ({
      ...marker,
      id: index === 0 ? 'marker' : 'part-' + index,
      kind: index < modelCount ? ('model' as const) : ('box' as const),
      model: index < modelCount ? ('processor' as const) : undefined,
      params: {},
      position: [index * 6, 0, 0] as Vector3,
    }));
    scene.nodes.push({ ...marker, id: 'root', kind: 'group', params: {} });
    scene.nodes.slice(0, relationCount).forEach((node) => {
      node.parent = 'root';
    });
    scene.shots.forEach((shot) => {
      shot.frame = { nodes: ['marker'], padding: 1.2 };
    });
    const report = checkCinematicQuality(scene);
    return { report, issue: report.issues.find((issue) => issue.code === 'composition-assembly') };
  };
  it.each([
    { teaching: 5, models: 1, relations: 1, missing: ['关系不足'], satisfied: '实体数量已达标' },
    { teaching: 4, models: 2, relations: 2, missing: ['实体不足'], satisfied: '关系数量已达标' },
    { teaching: 4, models: 2, relations: 1, missing: ['关系不足', '实体不足'], satisfied: '' },
  ])(
    'reports exact counts and only the unsatisfied requirements: $teaching/$models/$relations',
    ({ teaching, models, relations, missing, satisfied }) => {
      const { report, issue } = composition(teaching, models, relations);
      expect(issue?.severity).toBe('error');
      expect(report.metrics).toMatchObject({
        teachingNodes: teaching,
        detailedModels: models,
        relations,
      });
      expect(issue!.message).toContain(
        `teachingNodes=${teaching}, detailedModels=${models}, relations=${relations}`,
      );
      for (const label of ['关系不足', '实体不足'])
        expect(issue!.message.includes(label)).toBe(missing.includes(label));
      if (satisfied) expect(issue!.suggestion).toContain(satisfied);
      expect(issue!.message.length + issue!.suggestion.length).toBeLessThan(600);
    },
  );
  it.each([
    [5, 1, 2],
    [3, 3, 2],
    [4, 3, 2],
  ])('keeps the original alternative thresholds %i/%i/%i', (teaching, models, relations) => {
    expect(composition(teaching, models, relations).issue).toBeUndefined();
  });
});

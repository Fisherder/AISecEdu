import { describe, expect, it } from 'vitest';
import {
  cinematicSchema,
  cinematicSchemaIssueReasons,
  parseCinematicScene,
  type CinematicScene,
  type CinematicSchemaIssueReason,
} from '@/lib/cinematic/schema';
import { CINEMATIC_DIRECTOR_PROMPT } from '@/lib/server/cinematic-generation';
import { sceneFixture } from '../../fixtures/cinematic';

const fixture = () =>
  parseCinematicScene({
    ...sceneFixture(),
    assembly: {
      version: 'assembly-v1',
      placements: [
        { mode: 'relative', node: 'hero', reference: 'base', side: 'above' },
        { mode: 'relative', node: 'bank', reference: 'base', side: 'right' },
      ],
    },
    coverage: {
      objects: [{ name: '教学主体', nodes: ['hero', 'bank'] }],
      interactions: [
        { description: '观察内部结构', chapter: 1, targets: ['hero'], properties: ['explode'] },
      ],
    },
    connections: [{ id: 'link', from: 'hero', to: 'bank' }],
    shots: sceneFixture().shots.map((shot) => ({
      ...shot,
      frame: { nodes: ['hero', 'bank'], padding: 1.2 },
    })),
  });

type FailureCase = {
  name: string;
  reason: CinematicSchemaIssueReason;
  path: (string | number)[];
  mutate: (scene: CinematicScene) => void;
};
const cases: FailureCase[] = [
  {
    name: 'surface text on unsupported model',
    reason: 'node-surface-text-invalid',
    path: ['nodes', 0, 'surfaceText'],
    mutate: (s) => {
      s.nodes[0].surfaceText = { lines: ['静态文字'], color: '#ffffff' };
    },
  },
  {
    name: 'duplicate node id',
    reason: 'node-id-duplicate',
    path: ['nodes', 3, 'id'],
    mutate: (s) => {
      s.nodes.push(structuredClone(s.nodes[0]));
    },
  },
  {
    name: 'missing coverage object node',
    reason: 'coverage-object-node-missing',
    path: ['coverage', 'objects', 0, 'nodes', 1],
    mutate: (s) => {
      s.coverage!.objects[0].nodes[1] = 'missing';
    },
  },
  {
    name: 'missing interaction chapter',
    reason: 'coverage-interaction-reference-invalid',
    path: ['coverage', 'interactions', 0, 'chapter'],
    mutate: (s) => {
      s.coverage!.interactions[0].chapter = 9;
    },
  },
  {
    name: 'missing interaction target',
    reason: 'coverage-interaction-reference-invalid',
    path: ['coverage', 'interactions', 0, 'targets', 1],
    mutate: (s) => {
      s.coverage!.interactions[0].targets.push('missing');
    },
  },
  {
    name: 'missing interaction connection',
    reason: 'coverage-interaction-connection-missing',
    path: ['coverage', 'interactions', 0, 'connections', 1],
    mutate: (s) => {
      s.coverage!.interactions[0].connections = ['link', 'missing'];
    },
  },
  {
    name: 'mixed controls and model properties',
    reason: 'coverage-controls-invalid',
    path: ['coverage', 'interactions', 0, 'properties'],
    mutate: (s) => {
      Object.assign(s.coverage!.interactions[0], {
        properties: ['controls', 'position'],
        controls: ['play'],
      });
    },
  },
  {
    name: 'controls mapping without controls',
    reason: 'coverage-controls-invalid',
    path: ['coverage', 'interactions', 0, 'controls'],
    mutate: (s) => {
      s.coverage!.interactions[0].properties = ['controls'];
    },
  },
  {
    name: 'duplicate player controls',
    reason: 'coverage-controls-invalid',
    path: ['coverage', 'interactions', 0, 'controls', 1],
    mutate: (s) => {
      Object.assign(s.coverage!.interactions[0], {
        properties: ['controls'],
        controls: ['play', 'play'],
      });
    },
  },
  {
    name: 'controls on a model action',
    reason: 'coverage-controls-unexpected',
    path: ['coverage', 'interactions', 0, 'controls'],
    mutate: (s) => {
      s.coverage!.interactions[0].controls = ['play'];
    },
  },
  {
    name: 'missing assembly node',
    reason: 'assembly-node-missing',
    path: ['assembly', 'placements', 1, 'node'],
    mutate: (s) => {
      s.assembly!.placements[1].node = 'missing';
    },
  },
  {
    name: 'duplicate assembly placement',
    reason: 'assembly-node-duplicate',
    path: ['assembly', 'placements', 1, 'node'],
    mutate: (s) => {
      s.assembly!.placements[1].node = 'hero';
    },
  },
  {
    name: 'missing assembly reference',
    reason: 'assembly-reference-invalid',
    path: ['assembly', 'placements', 0, 'reference'],
    mutate: (s) => {
      Object.assign(s.assembly!.placements[0], { reference: 'missing' });
    },
  },
  {
    name: 'self assembly reference',
    reason: 'assembly-reference-invalid',
    path: ['assembly', 'placements', 0, 'reference'],
    mutate: (s) => {
      Object.assign(s.assembly!.placements[0], { reference: 'hero' });
    },
  },
  {
    name: 'model kind without model',
    reason: 'node-model-missing',
    path: ['nodes', 0, 'model'],
    mutate: (s) => {
      delete s.nodes[0].model;
    },
  },
  {
    name: 'unsupported asset role',
    reason: 'node-asset-role-invalid',
    path: ['nodes', 0, 'assetRole'],
    mutate: (s) => {
      s.nodes[0].assetRole = 'not-a-role';
    },
  },
  {
    name: 'missing parent',
    reason: 'node-parent-missing',
    path: ['nodes', 0, 'parent'],
    mutate: (s) => {
      s.nodes[0].parent = 'missing';
    },
  },
  {
    name: 'self parent cycle',
    reason: 'node-parent-cycle',
    path: ['nodes', 0, 'parent'],
    mutate: (s) => {
      s.nodes[0].parent = 'hero';
    },
  },
  {
    name: 'indirect parent cycle',
    reason: 'node-parent-cycle',
    path: ['nodes', 0, 'parent'],
    mutate: (s) => {
      s.nodes[0].parent = 'bank';
      s.nodes[1].parent = 'hero';
    },
  },
  {
    name: 'zero node scale axis',
    reason: 'node-scale-invalid',
    path: ['nodes', 0, 'scale', 1],
    mutate: (s) => {
      s.nodes[0].scale[1] = 0;
    },
  },
  {
    name: 'oversized node scale axis',
    reason: 'node-scale-invalid',
    path: ['nodes', 0, 'scale', 2],
    mutate: (s) => {
      s.nodes[0].scale[2] = 26;
    },
  },
  {
    name: 'tube without path',
    reason: 'tube-points-missing',
    path: ['nodes', 2, 'points'],
    mutate: (s) => {
      s.nodes[2].kind = 'tube';
    },
  },
  {
    name: 'tube with only one point',
    reason: 'tube-points-missing',
    path: ['nodes', 2, 'points'],
    mutate: (s) => {
      s.nodes[2].kind = 'tube';
      s.nodes[2].points = [[0, 0, 0]];
    },
  },
  {
    name: 'duplicate connection id',
    reason: 'connection-id-duplicate',
    path: ['connections', 1, 'id'],
    mutate: (s) => {
      s.connections.push(structuredClone(s.connections[0]));
    },
  },
  {
    name: 'missing connection source',
    reason: 'connection-endpoint-invalid',
    path: ['connections', 0, 'from'],
    mutate: (s) => {
      s.connections[0].from = 'missing';
    },
  },
  {
    name: 'missing connection destination',
    reason: 'connection-endpoint-invalid',
    path: ['connections', 0, 'to'],
    mutate: (s) => {
      s.connections[0].to = 'missing';
    },
  },
  {
    name: 'self connection',
    reason: 'connection-endpoint-invalid',
    path: ['connections', 0, 'to'],
    mutate: (s) => {
      s.connections[0].to = 'hero';
    },
  },
  {
    name: 'duplicate target property track',
    reason: 'track-property-duplicate',
    path: ['tracks', 2, 'property'],
    mutate: (s) => {
      s.tracks.push(structuredClone(s.tracks[0]));
    },
  },
  {
    name: 'missing track target',
    reason: 'track-target-missing',
    path: ['tracks', 0, 'target'],
    mutate: (s) => {
      s.tracks[0].target = 'missing';
    },
  },
  {
    name: 'explode on primitive',
    reason: 'track-explode-target-invalid',
    path: ['tracks', 0, 'property'],
    mutate: (s) => {
      s.tracks[0].target = 'base';
    },
  },
  {
    name: 'emissive on points',
    reason: 'track-emissive-target-invalid',
    path: ['tracks', 0, 'property'],
    mutate: (s) => {
      s.nodes[2].kind = 'points';
      s.tracks[0].target = 'base';
      s.tracks[0].property = 'emissive';
    },
  },
  {
    name: 'scalar used for vector keyframe',
    reason: 'track-value-dimension',
    path: ['tracks', 1, 'keyframes', 1, 'value'],
    mutate: (s) => {
      s.tracks[1].keyframes[1].value = 1;
    },
  },
  {
    name: 'vector used for scalar keyframe',
    reason: 'track-value-dimension',
    path: ['tracks', 0, 'keyframes', 1, 'value'],
    mutate: (s) => {
      s.tracks[0].keyframes[1].value = [1, 1, 1];
    },
  },
  {
    name: 'keyframe exceeds duration',
    reason: 'track-time-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'at'],
    mutate: (s) => {
      s.tracks[0].keyframes[1].at = 61;
    },
  },
  {
    name: 'keyframe repeats time',
    reason: 'track-time-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'at'],
    mutate: (s) => {
      s.tracks[0].keyframes[1].at = 0;
    },
  },
  {
    name: 'keyframe time goes backwards',
    reason: 'track-time-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'at'],
    mutate: (s) => {
      s.tracks[0].keyframes[0].at = 10;
      s.tracks[0].keyframes[1].at = 5;
    },
  },
  {
    name: 'zero scale track axis',
    reason: 'track-scale-invalid',
    path: ['tracks', 1, 'keyframes', 1, 'value', 2],
    mutate: (s) => {
      s.tracks[1].property = 'scale';
      s.tracks[1].keyframes = [
        { at: 0, value: [1, 1, 1] },
        { at: 60, value: [1, 1, 0] },
      ];
    },
  },
  {
    name: 'scale track exceeds limit',
    reason: 'track-scale-invalid',
    path: ['tracks', 1, 'keyframes', 1, 'value', 1],
    mutate: (s) => {
      s.tracks[1].property = 'scale';
      s.tracks[1].keyframes = [
        { at: 0, value: [1, 1, 1] },
        { at: 60, value: [1, 26, 1] },
      ];
    },
  },
  {
    name: 'opacity track below zero',
    reason: 'track-unit-value-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'value'],
    mutate: (s) => {
      s.tracks[0].property = 'opacity';
      s.tracks[0].keyframes[1].value = -0.1;
    },
  },
  {
    name: 'explode track above one',
    reason: 'track-unit-value-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'value'],
    mutate: (s) => {
      s.tracks[0].keyframes[1].value = 1.1;
    },
  },
  {
    name: 'emissive below zero',
    reason: 'track-emissive-value-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'value'],
    mutate: (s) => {
      s.tracks[0].property = 'emissive';
      s.tracks[0].keyframes[1].value = -0.1;
    },
  },
  {
    name: 'emissive above four',
    reason: 'track-emissive-value-invalid',
    path: ['tracks', 0, 'keyframes', 1, 'value'],
    mutate: (s) => {
      s.tracks[0].property = 'emissive';
      s.tracks[0].keyframes[1].value = 4.1;
    },
  },
  {
    name: 'shots not starting at zero',
    reason: 'timeline-start-invalid',
    path: ['shots', 0, 'at'],
    mutate: (s) => {
      s.shots[0].at = 1;
    },
  },
  {
    name: 'chapters not starting at zero',
    reason: 'timeline-start-invalid',
    path: ['chapters', 0, 'at'],
    mutate: (s) => {
      s.chapters[0].at = 1;
    },
  },
  {
    name: 'shots beyond duration',
    reason: 'timeline-time-invalid',
    path: ['shots', 3, 'at'],
    mutate: (s) => {
      s.shots[3].at = 61;
    },
  },
  {
    name: 'shots repeated time',
    reason: 'timeline-time-invalid',
    path: ['shots', 1, 'at'],
    mutate: (s) => {
      s.shots[1].at = 0;
    },
  },
  {
    name: 'chapters beyond duration',
    reason: 'timeline-time-invalid',
    path: ['chapters', 3, 'at'],
    mutate: (s) => {
      s.chapters[3].at = 61;
    },
  },
  {
    name: 'chapters decreasing time',
    reason: 'timeline-time-invalid',
    path: ['chapters', 2, 'at'],
    mutate: (s) => {
      s.chapters[2].at = 15;
    },
  },
  {
    name: 'missing focus node',
    reason: 'chapter-focus-missing',
    path: ['chapters', 1, 'focus', 1],
    mutate: (s) => {
      s.chapters[1].focus.push('missing');
    },
  },
  {
    name: 'duplicate frame subject',
    reason: 'frame-node-duplicate',
    path: ['shots', 1, 'frame', 'nodes', 2],
    mutate: (s) => {
      s.shots[1].frame!.nodes.push('hero');
    },
  },
  {
    name: 'missing frame subject',
    reason: 'frame-node-invalid',
    path: ['shots', 1, 'frame', 'nodes', 1],
    mutate: (s) => {
      s.shots[1].frame!.nodes[1] = 'missing';
    },
  },
  ...(['group', 'plane', 'points'] as const).map(
    (kind): FailureCase => ({
      name: `invalid ${kind} frame subject`,
      reason: 'frame-node-invalid',
      path: ['shots', 1, 'frame', 'nodes', 1],
      mutate: (s) => {
        s.nodes[2].kind = kind;
        s.shots[1].frame!.nodes[1] = 'base';
      },
    }),
  ),
  {
    name: 'decorative frame subject',
    reason: 'frame-node-invalid',
    path: ['shots', 1, 'frame', 'nodes', 1],
    mutate: (s) => {
      s.nodes[2].role = 'decoration';
      s.shots[1].frame!.nodes[1] = 'base';
    },
  },
  {
    name: 'no detailed models',
    reason: 'model-count-minimum',
    path: ['nodes'],
    mutate: (s) => {
      for (const node of s.nodes) {
        node.kind = 'box';
        delete node.model;
      }
    },
  },
  {
    name: 'too many detailed models',
    reason: 'model-count-maximum',
    path: ['nodes'],
    mutate: (s) => {
      for (let i = 0; i < 11; i++) s.nodes.push({ ...s.nodes[0], id: `extra-${i}` });
    },
  },
  {
    name: 'too few distinct cameras',
    reason: 'camera-position-diversity',
    path: ['shots'],
    mutate: (s) => {
      for (const shot of s.shots) shot.position = [12, 8, 16];
    },
  },
  {
    name: 'camera below minimum distance',
    reason: 'camera-distance-minimum',
    path: ['shots', 1, 'position'],
    mutate: (s) => {
      s.shots[1].position = [0, 0, 1];
    },
  },
  {
    name: 'camera transition crosses target',
    reason: 'camera-transition-distance-minimum',
    path: ['shots', 1, 'position'],
    mutate: (s) => {
      s.shots[0].position = [10, 0, 0];
      s.shots[1].position = [-10, 0, 0];
    },
  },
  {
    name: 'no changing tracks or transport',
    reason: 'scene-motion-missing',
    path: ['tracks'],
    mutate: (s) => {
      s.tracks = [];
      s.connections = [];
    },
  },
];

function issuesFor(scene: CinematicScene) {
  const before = structuredClone(scene);
  const result = cinematicSchema.safeParse(scene);
  expect(result.success).toBe(false);
  expect(scene).toEqual(before);
  if (result.success) throw Error('Expected a rejected fixture');
  return result.error.issues;
}

describe('precise structural locations for every cinematic superRefine rule', () => {
  it.each(cases)('$name', ({ mutate, reason, path }) => {
    const scene = fixture();
    mutate(scene);
    const issues = issuesFor(scene);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        path,
        params: expect.objectContaining({ reason }),
      }),
    );
    for (const issue of issues) {
      if (issue.code !== 'custom') continue;
      expect(cinematicSchemaIssueReasons).toContain(issue.params?.reason);
      expect(issue.path.length).toBeGreaterThan(0);
      for (const part of issue.path) {
        expect(['string', 'number']).toContain(typeof part);
        if (typeof part === 'number') expect(Number.isSafeInteger(part) && part >= 0).toBe(true);
      }
    }
  });

  it('covers every exported controlled reason and keeps the list unique', () => {
    const covered = new Set([...cases.map((item) => item.reason), 'node-params-invalid']);
    expect([...covered].sort()).toEqual([...cinematicSchemaIssueReasons].sort());
    expect(new Set(cinematicSchemaIssueReasons).size).toBe(cinematicSchemaIssueReasons.length);
    expect(cinematicSchemaIssueReasons.every((reason) => /^[a-z][a-z-]+$/.test(reason))).toBe(true);
  });

  it('leaves valid and legacy SceneIR unchanged', () => {
    for (const scene of [fixture(), sceneFixture()]) {
      const before = structuredClone(scene);
      expect(parseCinematicScene(scene)).toEqual(before);
      expect(scene).toEqual(before);
    }
  });

  it.each(['shots', 'chapters'] as const)(
    'rejects empty %s through Zod, not a root TypeError',
    (field) => {
      const scene = fixture();
      scene[field] = [];
      expect(issuesFor(scene)).toContainEqual(
        expect.objectContaining({ code: 'too_small', path: [field] }),
      );
    },
  );

  it('preserves the distinction between visible references and private source text', () => {
    const scene = fixture();
    const privateText = '私密课程要求不能写入结构日志';
    const privateId = 'private-missing-identity';
    scene.coverage!.objects[0].name = privateText;
    scene.coverage!.objects[0].nodes = [privateId];
    scene.coverage!.interactions[0].description = privateText;
    scene.coverage!.interactions[0].targets = [privateId];
    scene.nodes[2].params = { [privateId]: 1 };
    const projection = issuesFor(scene)
      .filter((issue) => issue.code === 'custom')
      .map((issue) => ({
        code: issue.code,
        path: issue.path,
        params: issue.params,
      }));
    expect(projection.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(projection)).not.toContain(privateText);
    expect(JSON.stringify(projection)).not.toContain(privateId);
  });

  it('states the existing artDirection limit without relaxing it', () => {
    expect(CINEMATIC_DIRECTOR_PROMPT).toContain('artDirection为12-800字符，不能超过800字符');
  });
});

describe('parameter failures retain nested code, safe path and numeric limits', () => {
  it.each([
    {
      name: 'primitive type',
      node: 2,
      params: { width: 'wide' },
      field: 'width',
      code: 'invalid_type',
    },
    {
      name: 'primitive minimum',
      node: 2,
      params: { height: 0 },
      field: 'height',
      code: 'too_small',
      minimum: 0,
    },
    {
      name: 'primitive maximum',
      node: 2,
      params: { depth: 51 },
      field: 'depth',
      code: 'too_big',
      maximum: 50,
    },
    {
      name: 'asset minimum',
      node: 0,
      params: { detail: 0 },
      field: 'detail',
      code: 'too_small',
      minimum: 1,
    },
    {
      name: 'asset maximum',
      node: 0,
      params: { detail: 4 },
      field: 'detail',
      code: 'too_big',
      maximum: 3,
    },
    {
      name: 'asset integer',
      node: 0,
      params: { detail: 1.5 },
      field: 'detail',
      code: 'invalid_type',
    },
    { name: 'asset boolean', node: 0, params: { lid: 'true' }, field: 'lid', code: 'invalid_type' },
  ])('$name', ({ name: _name, node, params, field, code, ...limits }) => {
    const scene = fixture();
    Object.assign(scene.nodes[node].params, params);
    expect(issuesFor(scene)).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        path: ['nodes', node, 'params', field],
        params: { reason: 'node-params-invalid', parameterCode: code, ...limits },
      }),
    );
  });

  it('identifies a rejected asset enum without copying its value into diagnostic fields', () => {
    const scene = fixture();
    scene.nodes[0].model = 'valve';
    scene.nodes[0].params = { actuator: 'private-unsupported-state' };
    expect(issuesFor(scene)).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        path: ['nodes', 0, 'params', 'actuator'],
        params: { reason: 'node-params-invalid', parameterCode: 'invalid_value' },
      }),
    );
  });

  it('identifies unknown parameter keys at the params container without exposing the key', () => {
    const scene = fixture();
    scene.nodes[0].params = { 'private-unknown-field': 1 };
    expect(issuesFor(scene)).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        path: ['nodes', 0, 'params'],
        params: { reason: 'node-params-invalid', parameterCode: 'unrecognized_keys' },
      }),
    );
  });

  it('emits each nested parameter failure rather than compressing them to one root issue', () => {
    const scene = fixture();
    scene.nodes[2].params = { width: 'wide', height: 0, depth: 51 };
    const issues = issuesFor(scene).filter(
      (issue) => issue.code === 'custom' && issue.params?.reason === 'node-params-invalid',
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      ['nodes', 2, 'params', 'width'],
      ['nodes', 2, 'params', 'height'],
      ['nodes', 2, 'params', 'depth'],
    ]);
    expect(issues).toHaveLength(3);
  });
});

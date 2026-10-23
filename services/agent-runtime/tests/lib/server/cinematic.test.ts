import { describe, it, expect, vi } from 'vitest';
import { parseCinematicScene, extractCinematicScene } from '@/lib/cinematic/schema';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import {
  applyCinematicPatches,
  generateCinematicExplainer,
  preservePlayerControlEvidencePatches,
} from '@/lib/server/cinematic-generation';
import { sceneFixture, directorFixture } from '../../fixtures/cinematic';
import { assemblySceneFixture } from '../../fixtures/cinematic-assembly';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';

describe('cinematic scene contract', () => {
  it('keeps semantic repair patches from rewriting frozen player-control evidence', () => {
    const scene=sceneFixture();
    scene.coverage={objects:[],interactions:[
      {description:'单步',chapter:0,targets:['hero'],properties:['controls'],controls:['step']},
      {description:'拆开',chapter:1,targets:['hero'],properties:['explode']},
    ]};
    const patches=preservePlayerControlEvidencePatches(scene,[{description:'单步',kind:'player-control',controls:['step']}],[
      {op:'replace',path:'/coverage/interactions/0/properties',value:['rotation']},
      {op:'replace',path:'/coverage/interactions/1/chapter',value:2},
    ]);
    expect(patches).toEqual([{op:'replace',path:'/coverage/interactions/1/chapter',value:2}]);
  });
  it('roundtrips compiled content, including reordered script attributes', () => {
    const scene = sceneFixture(),
      html = compileCinematicScene(scene);
    expect(extractCinematicScene(html)).toEqual(scene);
    expect(
      extractCinematicScene(
        html.replace(
          'type="application/json" id="cinematic-scene"',
          "id='cinematic-scene' type='application/json'",
        ),
      ),
    ).toEqual(scene);
    expect(html).toContain('data-cinematic="v1"');
    expect(html).toContain('结构拆解');
  });
  it('rejects missing targets, hierarchy cycles, wrong dimensions and empty motion', () => {
    const invalid = sceneFixture();
    invalid.nodes[0].parent = 'hero';
    expect(() => parseCinematicScene(invalid)).toThrow('循环');
    const missing = sceneFixture();
    missing.tracks[0].target = 'missing';
    expect(() => parseCinematicScene(missing)).toThrow('不存在');
    const scale = sceneFixture();
    scale.tracks[1].property = 'scale';
    scale.tracks[1].keyframes[1].value = [0, 1, 1];
    expect(() => parseCinematicScene(scale)).toThrow('缩放');
    const still = sceneFixture();
    still.tracks[0].keyframes[1].value = 0;
    expect(() => parseCinematicScene(still)).toThrow('真实状态变化');
    const close = sceneFixture();
    close.shots[0].position = [0, 0, 1];
    expect(() => parseCinematicScene(close)).toThrow('至少3单位');
  });
  it('applies a targeted camera revision without modifying unrelated content', () => {
    const scene = sceneFixture(),
      next = applyCinematicPatches(scene, {
        patches: [{ op: 'replace', path: '/shots/1/position', value: [9, 6, 12] }],
      });
    expect(next.shots[1].position).toEqual([9, 6, 12]);
    expect(next.nodes).toEqual(scene.nodes);
    expect(scene.shots[1].position).toEqual([8, 5, 10]);
    expect(() =>
      applyCinematicPatches(scene, {
        patches: [{ op: 'replace', path: '/title', value: scene.title }],
      }),
    ).toThrow('没有实际变化');
    expect(() =>
      applyCinematicPatches(scene, {
        patches: [{ op: 'add', path: '/theme/__proto__/polluted', value: 1 }],
      }),
    ).toThrow('不允许');
    expect(() =>
      applyCinematicPatches(scene, {
        patches: [{ op: 'replace', path: '/nodes/99/color', value: '#000000' }],
      }),
    ).toThrow('不存在');
  });
  it.each(['hero', '@hero'])(
    'resolves stable node selector %s, including nested numeric indices',
    (selector) => {
      const scene = sceneFixture();
      const next = applyCinematicPatches(scene, {
        patches: [
          { op: 'replace', path: `/nodes/${selector}/position`, value: [2, 1, 0] },
          { op: 'replace', path: `/nodes/${selector}/position/1`, value: 3 },
          { op: 'add', path: `/nodes/${selector}/params/lid`, value: true },
        ],
      });
      expect(next.nodes[0]).toMatchObject({
        id: 'hero',
        position: [2, 3, 0],
        params: { lid: true },
      });
      expect(next.nodes.slice(1)).toEqual(scene.nodes.slice(1));
      expect(next.tracks).toEqual(scene.tracks);
      expect(scene.nodes[0].position).toEqual([0, 0, 0]);
    },
  );
  it('resolves remaining node IDs against the current array after an earlier removal', () => {
    const scene = sceneFixture();
    scene.nodes.unshift({ ...scene.nodes[2], id: 'decoration' });
    const original = structuredClone(scene);
    const next = applyCinematicPatches(scene, {
      patches: [
        { op: 'remove', path: '/nodes/@decoration' },
        { op: 'add', path: '/nodes/hero/label', value: '主芯片' },
        { op: 'replace', path: '/nodes/@bank/color', value: '#abcdef' },
        { op: 'replace', path: '/nodes/2/position/1', value: -3 },
      ],
    });
    expect(next.nodes.map((node) => node.id)).toEqual(['hero', 'bank', 'base']);
    expect(next.nodes[0].label).toBe('主芯片');
    expect(next.nodes[1].color).toBe('#abcdef');
    expect(next.nodes[2].position[1]).toBe(-3);
    expect(scene).toEqual(original);
  });
  it('supports plain and @ connection IDs after removal, and keeps numeric paths compatible', () => {
    const scene = parseCinematicScene({
      ...sceneFixture(),
      connections: ['discard-link', 'fetch-link', 'return-link'].map((id) => ({
        id,
        from: 'hero',
        to: 'bank',
      })),
    });
    const next = applyCinematicPatches(scene, {
      patches: [
        { op: 'remove', path: '/connections/discard-link' },
        { op: 'replace', path: '/connections/@fetch-link/color', value: '#abcdef' },
        { op: 'replace', path: '/connections/return-link/particles', value: 0 },
        { op: 'add', path: '/connections/0/label', value: '取指示意' },
        { op: 'remove', path: '/connections/@return-link' },
      ],
    });
    expect(next.connections).toHaveLength(1);
    expect(next.connections[0]).toMatchObject({
      id: 'fetch-link',
      color: '#abcdef',
      label: '取指示意',
    });
    expect(scene.connections).toHaveLength(3);
  });
  it('appends new nodes and connections with /- and resolves their IDs in subsequent patches', () => {
    const scene = sceneFixture();
    const next = applyCinematicPatches(scene, {
      patches: [
        {
          op: 'add',
          path: '/nodes/-',
          value: { ...scene.nodes[0], id: 'planet-main', model: 'planet' },
        },
        { op: 'replace', path: '/nodes/@planet-main/position', value: [8, 1, 2] },
        {
          op: 'add',
          path: '/connections/-',
          value: { id: 'orbit-link', from: 'hero', to: 'planet-main', particles: 12 },
        },
        { op: 'replace', path: '/connections/orbit-link/particles', value: 0 },
      ],
    });
    expect(next.nodes.at(-1)).toMatchObject({
      id: 'planet-main',
      model: 'planet',
      position: [8, 1, 2],
    });
    expect(next.connections[0]).toMatchObject({ id: 'orbit-link', particles: 0 });
  });
  it('appends and targets learner controls by stable ID', () => {
    const scene = sceneFixture();
    const next = applyCinematicPatches(scene, {
      patches: [
        {
          op: 'add',
          path: '/learnerControls/-',
          value: { id: 'emergency-stop', type: 'button', label: '紧急停机', action: 'seek', at: 40 },
        },
        { op: 'replace', path: '/learnerControls/@emergency-stop/at', value: 45 },
      ],
    });
    expect(next.learnerControls).toEqual([
      { id: 'emergency-stop', type: 'button', label: '紧急停机', action: 'seek', at: 45 },
    ]);
    expect(scene.learnerControls).toEqual([]);
  });
  it.each(['/nodes/hero', '/nodes/@hero', '/nodes/0', '/connections/fetch-link', '/connections/0'])(
    'requires /- when adding a complete node or connection at %s',
    (path) => {
      const scene = parseCinematicScene({
        ...sceneFixture(),
        connections: [{ id: 'fetch-link', from: 'hero', to: 'bank' }],
      });
      expect(() =>
        applyCinematicPatches(scene, { patches: [{ op: 'add', path, value: {} }] }),
      ).toThrow('必须使用');
    },
  );
  it('reports the ordinal, full path and missing ID to the caller without mutating the original', () => {
    const scene = sceneFixture();
    const original = structuredClone(scene);
    expect(() =>
      applyCinematicPatches(scene, {
        patches: [
          { op: 'replace', path: '/title', value: '合法修改' },
          { op: 'replace', path: '/nodes/@missing-planet/position', value: [1, 2, 3] },
        ],
      }),
    ).toThrow(
      '补丁 #2 path="/nodes/@missing-planet/position" segment="@missing-planet": 补丁路径不存在：nodes 中未找到 ID "missing-planet"',
    );
    expect(scene).toEqual(original);
  });
  it.each([
    ['nodes/hero/position', 'nodes/hero/position', '必须以 / 开头'],
    ['/unknown/value', 'unknown', '未知根字段'],
    ['/nodes/hero/params/orbit/radius', 'orbit', '父路径不存在'],
    ['/nodes/hero/missing', 'missing', '路径不存在'],
    ['/title/missing', 'missing', '路径不存在'],
    ['/nodes/@absent/position', '@absent', '未找到 ID'],
    ['/connections/absent/color', 'absent', '未找到 ID'],
    ['/nodes/', '', 'ID 为空'],
    ['/nodes/@/position', '@', 'ID 为空'],
    ['/nodes/99/position', '99', '不存在'],
    ['/nodes/hero/position/01', '01', '数组索引无效'],
    ['/shots/01/position', '01', '数组索引无效'],
    ['/shots/9007199254740993', '9007199254740993', '数组索引无效'],
    ['/shots/@hero/position', '@hero', '数组索引无效'],
    ['/tracks/hero/keyframes', 'hero', '数组索引无效'],
    ['/chapters/hero/caption', 'hero', '数组索引无效'],
    ['/nodes/-/position', '-', '数组索引无效'],
    ['/shots/-', '-', '数组索引无效'],
    ['/nodes/hero~2/position', 'hero~2', '转义无效'],
  ])('adds actionable context for invalid path %s', (path, segment, reason) => {
    const run = () =>
      applyCinematicPatches(sceneFixture(), { patches: [{ op: 'replace', path, value: 1 }] });
    expect(run).toThrow(`补丁 #1 path=${JSON.stringify(path)} segment=${JSON.stringify(segment)}`);
    expect(run).toThrow(reason);
  });
  it.each(['nodes', 'connections'] as const)(
    'rejects ambiguous IDs in %s rather than choosing the first match',
    (collection) => {
      const scene = parseCinematicScene({
        ...sceneFixture(),
        connections: [{ id: 'fetch-link', from: 'hero', to: 'bank' }],
      });
      if (collection === 'nodes') scene.nodes.push(structuredClone(scene.nodes[0]));
      else scene.connections.push(structuredClone(scene.connections[0]));
      const id = collection === 'nodes' ? 'hero' : 'fetch-link';
      const path = `/${collection}/@${id}/color`;
      expect(() =>
        applyCinematicPatches(scene, { patches: [{ op: 'replace', path, value: '#abcdef' }] }),
      ).toThrow(`补丁 #1 path="${path}" segment="@${id}": 补丁 ID 有歧义`);
    },
  );
  it('reports a removed ID as missing rather than retargeting the next array item', () => {
    const scene = sceneFixture();
    scene.nodes.push({ ...scene.nodes[2], id: 'decoration' });
    expect(() =>
      applyCinematicPatches(scene, {
        patches: [
          { op: 'remove', path: '/nodes/decoration' },
          { op: 'replace', path: '/nodes/decoration/color', value: '#abcdef' },
        ],
      }),
    ).toThrow('补丁 #2 path="/nodes/decoration/color" segment="decoration": 补丁路径不存在');
  });
  it.each([
    '/theme/__proto__/cinematicPatchPolluted',
    '/nodes/@hero/__proto__/cinematicPatchPolluted',
    '/nodes/hero/params/constructor/prototype/cinematicPatchPolluted',
    '/nodes/@__proto__/position',
    '/nodes/@constructor/position',
    '/connections/@prototype/color',
    '/nodes/0/params/prototype/cinematicPatchPolluted',
  ])('rejects prototype-dangerous path %s without pollution', (path) => {
    expect(() =>
      applyCinematicPatches(sceneFixture(), { patches: [{ op: 'add', path, value: true }] }),
    ).toThrow('不允许的场景补丁路径：原型危险段');
    expect(Object.hasOwn(Object.prototype, 'cinematicPatchPolluted')).toBe(false);
    expect(Object.hasOwn(Array.prototype, 'cinematicPatchPolluted')).toBe(false);
  });
  it('passes detailed path failures into the model retry and requests stable-ID revisions', async () => {
    const scene = sceneFixture();
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(directorFixture))
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [{ op: 'replace', path: '/nodes/@missing/position', value: [2, 1, 0] }],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [{ op: 'replace', path: '/nodes/@hero/position', value: [2, 1, 0] }],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const result = await generateCinematicExplainer(
      { type: 'visualization3d', title: '模型' },
      0,
      ai,
      { html: compileCinematicScene(scene), instruction: '移动主芯片' },
    );
    expect(ai).toHaveBeenCalledTimes(4);
    expect(ai.mock.calls[0][0]).toContain('memory-bank DIMM内存模组');
    expect(ai.mock.calls[0][0]).not.toContain('memory-bank存储格阵');
    expect(ai.mock.calls[1][0]).toContain('/nodes/@planet-main/position');
    expect(ai.mock.calls[1][0]).toContain('避免前一次删除导致数字索引漂移');
    expect(JSON.parse(ai.mock.calls[2][1]).correction).toContain(
      '补丁 #1 path="/nodes/@missing/position" segment="@missing"',
    );
    expect(result.content).toMatchObject({
      cinematicScene: {
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'hero', position: [2, 1, 0] }),
        ]),
      },
    });
  });
  it('rejects unrenderable parameters, ineffective explode tracks and camera transitions through the target', () => {
    const params = sceneFixture();
    params.nodes[2].params = { width: 'wide' };
    expect(() => parseCinematicScene(params)).toThrow('参数无效');
    const ineffective = sceneFixture();
    ineffective.tracks[0].target = 'base';
    expect(() => parseCinematicScene(ineffective)).toThrow('拆解轨道只能');
    const crossing = sceneFixture();
    crossing.shots[0].position = [0, 0, 6];
    crossing.shots[1].position = [0, 0, -6];
    expect(() => parseCinematicScene(crossing)).toThrow('过渡穿过目标');
    expect(() =>
      applyCinematicPatches(sceneFixture(), {
        patches: [
          {
            op: 'replace',
            path: '/shots/01',
            value: { ...sceneFixture().shots[1], position: [9, 6, 12] },
          },
        ],
      }),
    ).toThrow('数组索引');
    expect(() =>
      applyCinematicPatches(sceneFixture(), { patches: [{ op: 'replace', path: '/title' }] }),
    ).toThrow('缺少 value');
  });
  it('uses director and scene passes, never treats structural validation as visual approval', async () => {
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(directorFixture))
      .mockResolvedValueOnce(JSON.stringify(assemblySceneFixture()));
    ai.mockResolvedValue(JSON.stringify({ issues: [], patches: [] }));
    const result = await generateCinematicExplainer(
      { type: 'visualization3d', title: '模型' },
      0,
      ai,
    );
    expect(ai).toHaveBeenCalledTimes(3);
    expect(result.content).toMatchObject({
      renderingMode: 'cinematic-v1',
      cinematicValidation: { visualReview: 'REQUIRED', status: 'STRUCTURE_VALIDATED' },
    });
  });
  it('revises scene data rather than regenerating a whole HTML document', async () => {
    const original = sceneFixture();
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(directorFixture))
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [{ op: 'replace', path: '/shots/1/position', value: [9, 6, 12] }],
        }),
      );
    ai.mockResolvedValue(JSON.stringify({ issues: [], patches: [] }));
    const result = await generateCinematicExplainer(
      { type: 'visualization3d', title: '模型' },
      0,
      ai,
      { html: compileCinematicScene(original), instruction: '拉远第二镜头' },
    );
    expect(result.content).toMatchObject({
      cinematicScene: {
        nodes: original.nodes,
        shots: expect.arrayContaining([expect.objectContaining({ at: 20, position: [9, 6, 12] })]),
      },
    });
    expect(ai.mock.calls[1][0]).toContain('patches');
  });
  it('escapes authored text instead of interpreting markup', () => {
    const scene = sceneFixture();
    scene.subtitle = '<img src=x onerror=alert(1)>';
    expect(compileCinematicScene(scene)).not.toContain('<img src=x');
  });
  it('grounds narration against the scene without rewriting geometry', async () => {
    const scene = resolveCinematicAssembly(assemblySceneFixture()).scene;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(directorFixture))
      .mockResolvedValueOnce(JSON.stringify(scene))
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: ['粒子未实现实际数值'],
          patches: [
            {
              op: 'replace',
              path: '/chapters/0/caption',
              value: '用预设位置变化观察模型层次，不代表实际数值计算。',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const result = await generateCinematicExplainer(
      { type: 'visualization3d', title: '模型' },
      0,
      ai,
    );
    expect(result.content).toMatchObject({
      cinematicScene: {
        nodes: scene.nodes,
        chapters: expect.arrayContaining([
          expect.objectContaining({ caption: '用预设位置变化观察模型层次，不代表实际数值计算。' }),
        ]),
      },
      cinematicDirection: { groundingReview: { patchCount: 1 } },
    });
  });
  it('includes real iframe styles in the compiled HTML', () => {
    expect(compileCinematicScene(sceneFixture())).toContain('#cinema{display:flex');
  });
  it('normalizes only unambiguous nested transform/path fields and supports initial invisibility', () => {
    const value = sceneFixture();
    value.nodes[2] = {
      ...value.nodes[2],
      kind: 'tube',
      params: {
        points: [
          [0, 0, 0],
          [1, 1, 1],
        ],
        radius: 0.02,
      },
      opacity: 0,
    } as unknown as (typeof value.nodes)[number];
    const parsed = parseCinematicScene(value);
    expect(parsed.nodes[2].points).toEqual([
      [0, 0, 0],
      [1, 1, 1],
    ]);
    expect(parsed.nodes[2].params).toEqual({ radius: 0.02 });
    expect(parsed.nodes[2].opacity).toBe(0);
  });
});

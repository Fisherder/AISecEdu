import { describe, expect, it, vi } from 'vitest';
import { animatedPlanInput, generateAnimatedExplainer } from '@/lib/server/animated-explainer';
import { generateCinematicExplainer } from '@/lib/server/cinematic-generation';
import {
  parseVisualGenerationIntent,
  resolveVisualGenerationIntent,
} from '@/lib/cinematic/capabilities';
import { assemblyDirectorFixture, assemblySceneFixture } from '../../fixtures/cinematic-assembly';

// This exercises the typed scene pipeline; learner copy has a separate suite.
vi.mock('@/lib/server/cinematic-learner-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/cinematic-learner-copy')>()),
  authorCinematicLearnerCopy: async (scene: ReturnType<typeof assemblySceneFixture>) => ({scene}),
}));

const controlsDescription =
  '点击播放/暂停跟随导演镜头连续推进，使用单步逐段前进，使用时间轴回拖对照前后状态';
const intent = () =>
  parseVisualGenerationIntent({
    mode: 'cinematic-v1',
    reason: '用实体组合观察内部结构与逻辑分层',
    objects: ['处理器结构', '承载电路板', '逻辑层级'],
    interactions: ['逐步拆开观察内部', controlsDescription],
    interactionRequirements: [
      { description: '逐步拆开观察内部', kind: 'structural-change' },
      {
        description: controlsDescription,
        kind: 'player-control',
        controls: ['play', 'pause', 'step', 'seek'],
      },
    ],
    visualPriorities: ['保留真实承载关系与逻辑层分区'],
  });

describe('explicit animated input contract across the real cinematic pipeline', () => {
  it('carries typed requirements through adapter, director, schema repair, geometric repair and review', async () => {
    const visualIntent = intent();
    const request =
      '展示处理器结构、承载电路板和逻辑层级，逐步拆开观察内部。' + controlsDescription;
    const input = animatedPlanInput({ title: '精细结构演示', visualIntent }, request);
    expect(input.description).toMatch(/^在同一个连续画布/);
    expect(input.originalRequest).toBe(request);
    expect(input.visualIntent).toEqual(visualIntent);
    const scene = assemblySceneFixture();
    scene.coverage!.interactions.push({
      description: controlsDescription,
      chapter: 0,
      targets: ['hero'],
      properties: ['controls'],
      controls: ['play', 'pause', 'step', 'seek'],
    });
    scene.tracks.push({ ...scene.tracks[0], target: 'base' });
    scene.nodes[0].roughness = 0;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(scene))
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [{ op: 'replace', path: '/nodes/@hero/roughness', value: 0.3 }],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ patches: [{ op: 'remove', path: '/tracks/2' }] }))
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const artifact = await generateAnimatedExplainer(input, 0, ai);
    expect(ai).toHaveBeenCalledTimes(5);
    for (const [index, call] of ai.mock.calls.entries()) {
      const context = JSON.parse(call[1]);
      expect(context.request.originalRequest).toBe(request);
      expect(context.request.visualIntent).toEqual(visualIntent);
      if (context.frozenRequirements)
        expect(context.frozenRequirements.interactionRequirements).toEqual(
          visualIntent.interactionRequirements,
        );
      if (index < 2) {
        expect(call[0]).toContain('player-control');
        expect(call[0]).toContain('supportsExplode');
      }
    }
    expect(JSON.parse(ai.mock.calls[2][1]).schemaErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'nodes.0.roughness' })]),
    );
    expect(artifact.content).toMatchObject({
      cinematicValidation: {
        geometricQuality: {
          status: 'PASS',
          interactionEvidence: expect.arrayContaining([
            expect.objectContaining({
              description: controlsDescription,
              kind: 'player-control',
              status: 'PASS',
              controls: ['play', 'pause', 'step', 'seek'],
            }),
          ]),
        },
      },
    });
  });

  it('keeps contracts after the old 50000-character truncation point and fails explicitly above the complete-input limit', () => {
    const visualIntent = intent();
    const input = animatedPlanInput({ notes: '资料'.repeat(26000), visualIntent }, '完整原始请求');
    expect(input.description!.length).toBeGreaterThan(50000);
    expect(input.description).toContain(controlsDescription);
    expect(input.visualIntent).toEqual(visualIntent);
    expect(() =>
      animatedPlanInput({ notes: 'x'.repeat(200000), visualIntent }, '不允许删减'),
    ).toThrow('未截断');
  });

  it('rejects a broken explicit contract before any model call, instead of falling back to description', async () => {
    const ai = vi.fn();
    const visualIntent = { ...intent(), interactionRequirements: [] };
    await expect(
      generateCinematicExplainer(
        {
          type: 'simulation',
          title: '要求完整',
          visualIntent,
          description: JSON.stringify({ visualIntent: intent() }),
        },
        0,
        ai,
      ),
    ).rejects.toThrow('Every interactions item');
    expect(ai).not.toHaveBeenCalled();
    expect(() => animatedPlanInput({ visualIntent }, '原始要求')).toThrow(
      'Every interactions item',
    );
  });

  it.each([
    { description: '操作', kind: 'player-control', controls: ['explode'] },
    { description: '操作', kind: 'player-control', controls: [] },
    { description: '操作', kind: 'player-control', controls: ['play', 'play'] },
    { description: '操作', kind: 'state-change', controls: ['play'] },
  ])('never repairs or downgrades an invalid player contract: %j', (requirement) => {
    expect(() =>
      parseVisualGenerationIntent({
        ...intent(),
        interactions: ['操作'],
        interactionRequirements: [requirement],
      }),
    ).toThrow();
  });

  it('keeps playback controls and the teaching motion as distinct evidence in intent resolution', async () => {
    const ai = vi.fn().mockResolvedValue(JSON.stringify(intent()));
    const resolved = await resolveVisualGenerationIntent('暂停并拆开观察内部，再回拖', {}, ai);
    expect(resolved.interactionRequirements.map((item) => item.kind)).toEqual([
      'structural-change',
      'player-control',
    ]);
    expect(ai.mock.calls[0][0]).toContain('复合要求按含义拆成');
    expect(ai.mock.calls[0][0]).toContain('不需要几何轨道');
  });
});

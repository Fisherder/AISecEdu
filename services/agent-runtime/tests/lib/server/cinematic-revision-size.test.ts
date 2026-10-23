import { describe, expect, it, vi } from 'vitest';
import type { GeneratedInteractiveContent } from '@/lib/types/generation';
import { generateAnimatedExplainer } from '@/lib/server/animated-explainer';
import {
  CINEMATIC_DIRECTOR_PROMPT,
  CINEMATIC_GROUNDING_PROMPT,
  CINEMATIC_SCENE_PROMPT,
  generateCinematicExplainer,
} from '@/lib/server/cinematic-generation';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { extractCinematicScene, parseCinematicScene } from '@/lib/cinematic/schema';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { checkCinematicQuality } from '@/lib/cinematic/quality';
import { buildCompleteScene } from '@/lib/generation/scene-builder';
import { createSceneWithActions } from '@/lib/generation/scene-generator';
import { assemblyDirectorFixture, assemblySceneFixture } from '../../fixtures/cinematic-assembly';

// These tests isolate scene revision and request sizing. Student copy is
// independently covered by its own contract tests and live acceptance.
vi.mock('@/lib/server/cinematic-learner-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/cinematic-learner-copy')>()),
  authorCinematicLearnerCopy: async (scene: ReturnType<typeof assemblySceneFixture>) => ({scene}),
}));

const input = {
  type: 'simulation' as const,
  title: '结构观察',
  description: '保留全部实体，只修正指定阶段解释',
};
const correction = '在该章说明当时的展开动作，其他结构与动作保持不变';
const caption = '观察处理器和逻辑层沿既有方向展开，当前时间对应这一阶段的真实位置';

function revisionAi() {
  return vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
    .mockResolvedValueOnce(
      JSON.stringify({ patches: [{ op: 'replace', path: '/chapters/1/caption', value: caption }] }),
    )
    .mockResolvedValue(JSON.stringify({ issues: [], patches: [] }));
}

describe('complete structured cinematic revisions', () => {
  it.each([generateAnimatedExplainer, generateCinematicExplainer])(
    'revises a compiled scene in an oversized HTML shell without sending runtime code',
    async (generate) => {
      const scene = resolveCinematicAssembly(assemblySceneFixture()).scene;
      const html = compileCinematicScene(scene).replace(
        '</body>',
        '<style>.runtime-shell{--sentinel:"' +
          'x'.repeat(80_000) +
          '"}</style><script>window.runtimeShellSentinel=true;</script></body>',
      );
      expect(html.length).toBeGreaterThan(180_000);
      expect(JSON.stringify(scene).length).toBeLessThan(180_000);
      const before = structuredClone(scene),
        previous = { html, instruction: correction };
      const ai = revisionAi();
      const result = await generate(input, 1, ai, previous);
      expect(result.content).not.toHaveProperty('cinematicIntent');
      expect(ai).toHaveBeenCalledTimes(3);
      const request = JSON.parse(ai.mock.calls[0][1]).request;
      expect(request.previous).toEqual({ scene: before, instruction: correction });
      for (const call of ai.mock.calls) {
        expect(call[1]).not.toContain('runtimeShellSentinel');
        expect(call[1]).not.toContain('<!doctype html>');
      }
      const revised = extractCinematicScene((result.content as { html: string }).html)!;
      expect(revised.chapters[1].caption).toBe(caption);
      expect(revised.nodes).toEqual(before.nodes);
      expect(revised.tracks).toEqual(before.tracks);
      expect(revised.shots).toEqual(before.shots);
      expect(revised.assembly).toEqual(before.assembly);
      expect(scene).toEqual(before);
      expect(previous.html).toBe(html);
    },
  );

  it.each([generateAnimatedExplainer, generateCinematicExplainer])(
    'rejects oversized legacy HTML before any model call and preserves the original',
    async (generate) => {
      const ai = vi.fn(),
        previous = { html: 'x'.repeat(180_001), instruction: correction };
      await expect(generate(input, 1, ai, previous)).rejects.toThrow(
        '现有演示超过完整修订长度限制',
      );
      expect(ai).not.toHaveBeenCalled();
      expect(previous.html).toHaveLength(180_001);
    },
  );

  it('rejects corrupted marked cinematic content before any model call even when the shell is long', async () => {
    const ai = vi.fn();
    const html =
      '<main data-cinematic="v1"><script id="cinematic-scene" type="application/json">{broken}</script>' +
      'x'.repeat(200_000);
    await expect(
      generateAnimatedExplainer(input, 1, ai, { html, instruction: correction }),
    ).rejects.toThrow('现有三维场景协议损坏');
    expect(ai).not.toHaveBeenCalled();
  });

  it('counts the full revision instruction along with the structured scene and rejects rather than truncating it', async () => {
    const ai = vi.fn(),
      instruction = '必须保留尾部要求'.repeat(24_000);
    const html = compileCinematicScene(assemblySceneFixture());
    await expect(generateAnimatedExplainer(input, 1, ai, { html, instruction })).rejects.toThrow(
      '现有三维场景与修订要求超过完整修订长度限制',
    );
    expect(ai).not.toHaveBeenCalled();
  });

  it('rejects a valid but oversized structured scene before synthesis', async () => {
    const base = assemblySceneFixture();
    const nodes = Array.from({ length: 90 }, (_, index) => ({
      id: 'marker-' + index,
      kind: 'box',
      position: [index, 0, 0],
    }));
    const tracks = nodes.map((node) => ({
      target: node.id,
      property: 'position',
      keyframes: Array.from({ length: 24 }, (_, index) => ({
        at: index * 2.5,
        value: [index + 0.123456789012345, index + 0.234567890123456, index + 0.345678901234567],
      })),
    }));
    const scene = parseCinematicScene({
      ...base,
      nodes: [...base.nodes, ...nodes],
      tracks: [...base.tracks, ...tracks],
    });
    expect(JSON.stringify(scene).length).toBeGreaterThan(180_000);
    const ai = vi.fn();
    await expect(
      generateAnimatedExplainer(input, 1, ai, {
        html: compileCinematicScene(scene),
        instruction: correction,
      }),
    ).rejects.toThrow('现有三维场景与修订要求超过完整修订长度限制');
    expect(ai).not.toHaveBeenCalled();
  });

  it.each([CINEMATIC_DIRECTOR_PROMPT, CINEMATIC_SCENE_PROMPT, CINEMATIC_GROUNDING_PROMPT])(
    'states the real static-label and time-driven chapter capabilities throughout generation and review',
    (prompt) => {
      expect(prompt).toContain('node.label/detail是静态文字');
      expect(prompt).toContain('必须用各自chapters的title/caption');
      expect(prompt).toContain('暂停、单步、seek、reset都使用同一映射');
    },
  );

  it('persists the original typed contract for subsequent revisions without sharing mutable input', async () => {
    const visualIntent = {
      mode: 'cinematic-v1' as const,
      reason: '保留原始三维装配及可见拆解要求',
      objects: ['处理器结构', '承载电路板', '逻辑层级'],
      interactions: ['逐步拆开观察内部'],
      visualPriorities: ['保留完整装配关系'],
      interactionRequirements: [
        { description: '逐步拆开观察内部', kind: 'structural-change' as const },
      ],
    };
    const before = structuredClone(visualIntent);
    const result = await generateAnimatedExplainer({ ...input, visualIntent }, 1, revisionAi(), {
      html: compileCinematicScene(assemblySceneFixture()),
      instruction: correction,
    });
    const content = result.content as GeneratedInteractiveContent;
    expect(content.cinematicIntent).toEqual(before);
    const built = buildCompleteScene(result.outline, content, [], 'stage-frozen-contract');
    expect(built?.content).toMatchObject({ cinematicIntent: before });
    const create = vi.fn().mockReturnValue({ success: true, data: 'scene-frozen-contract' });
    const api = { scene: { create } } as unknown as Parameters<typeof createSceneWithActions>[3];
    expect(createSceneWithActions(result.outline, content, [], api)).toBe('scene-frozen-contract');
    expect(create.mock.calls[0][0].content).toMatchObject({ cinematicIntent: before });
    content.cinematicIntent!.objects[0] = 'changed output only';
    expect(visualIntent).toEqual(before);
  });

  it('keeps a real player control valid when revising instead of treating it as an unmapped animation track', async () => {
    const original = assemblySceneFixture();
    const scene = parseCinematicScene({
      ...original,
      coverage: {
        ...original.coverage,
        interactions: [
          ...original.coverage!.interactions,
          {
            description: '播放与暂停演示',
            chapter: 0,
            targets: ['hero'],
            properties: ['controls'],
            controls: ['play', 'pause'],
          },
        ],
      },
    });
    const visualIntent = {
      mode: 'cinematic-v1' as const,
      reason: '保留真实拆解动作和播放器控件的不同语义',
      objects: ['处理器结构', '承载电路板', '逻辑层级'],
      interactions: ['逐步拆开观察内部', '播放与暂停演示'],
      visualPriorities: [],
      interactionRequirements: [
        { description: '逐步拆开观察内部', kind: 'structural-change' as const },
        {
          description: '播放与暂停演示',
          kind: 'player-control' as const,
          controls: ['play' as const, 'pause' as const],
        },
      ],
    };
    const legacy = checkCinematicQuality(resolveCinematicAssembly(scene).scene);
    expect(legacy.issues.some((issue) => issue.code === 'request-interaction-empty')).toBe(true);
    const ai = revisionAi();
    const result = await generateAnimatedExplainer({ ...input, visualIntent }, 1, ai, {
      html: compileCinematicScene(scene),
      instruction: correction,
    });
    expect(ai).toHaveBeenCalledTimes(3);
    const content = result.content as GeneratedInteractiveContent;
    expect(content.cinematicIntent).toEqual(visualIntent);
    expect(content.cinematicScene!.coverage!.interactions.at(-1)).toMatchObject({
      properties: ['controls'],
      controls: ['play', 'pause'],
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  parseVisualGenerationIntent,
  resolveVisualGenerationIntent,
  validateVisualInteractionRequirements,
  visualIntentSchema,
} from '@/lib/cinematic/capabilities';
import {
  VisualIntentContractError,
  VisualIntentResolutionError,
} from '@/lib/cinematic/intent-diagnostics';
import { cinematicPlayerControlNames } from '@/lib/cinematic/player-controls';
import { CINEMATIC_MAX_INTERACTIONS } from '@/lib/cinematic/limits';
import { cinematicSchema } from '@/lib/cinematic/schema';
import { animatedPlanInput } from '@/lib/server/animated-explainer';

const teachingKinds = ['view', 'structural-change', 'state-change', 'transport'] as const;

function intentWith(requirements: Array<Record<string, unknown>>) {
  return {
    mode: 'cinematic-v1',
    reason: '完整保留空间结构观察及教学动作',
    objects: ['主体', '支持部件', '逻辑结构'],
    interactions: requirements.map((requirement) => requirement.description),
    interactionRequirements: requirements,
    visualPriorities: ['主体层次与连接清晰'],
  };
}

function tenRequirementFixture() {
  return intentWith([
    { description: '从另一侧观察主体', kind: 'view', controls: [] },
    { description: '分离主体与支持部件', kind: 'structural-change', controls: [] },
    { description: '显示逻辑状态变化', kind: 'state-change', controls: [] },
    { description: '沿连接传递信号', kind: 'transport', controls: [] },
    { description: '开始播放', kind: 'player-control', controls: ['play'] },
    { description: '暂停播放', kind: 'player-control', controls: ['pause'] },
    { description: '单步前进', kind: 'player-control', controls: ['step'] },
    { description: '回拖时间轴', kind: 'player-control', controls: ['seek'] },
    { description: '调整画质', kind: 'player-control', controls: ['quality'] },
    { description: '放大连接细节', kind: 'view', controls: [] },
  ]);
}

function interactionCountFixture(count: number) {
  const requirements = tenRequirementFixture().interactionRequirements;
  return intentWith(
    Array.from({ length: count }, (_, index) => ({
      ...requirements[index % requirements.length],
      description: `交互${index + 1}：${requirements[index % requirements.length].description}`,
    })),
  );
}

describe('visual intent controls normalization without semantic weakening', () => {
  it('drops an inapplicable malformed 2D format from cinematic intent', () => {
    const input = {...intentWith([{description: '观察空间结构', kind: 'view'}]), twoDimensionalFormat: '3d'};
    const parsed = parseVisualGenerationIntent(input);
    expect(parsed).not.toHaveProperty('twoDimensionalFormat');
    expect(input.twoDimensionalFormat).toBe('3d');
  });

  it('drops malformed duplicate presentation metadata without weakening interaction requirements', () => {
    const parsed=parseVisualGenerationIntent({
      ...intentWith([{description:'来源机壳或转子同步真实变化',kind:'structural-change'}]),
      presentationRequirements:[
        '来源机壳或转子同步真实变化',
        {description:'设置专门破坏近景'},
        {description:'在章节说明中解释破坏证据',surface:'chapter-copy'},
      ],
    });
    expect(parsed.presentationRequirements).toEqual([
      {description:'在章节说明中解释破坏证据',surface:'chapter-copy'},
    ]);
    expect(parsed.interactionRequirements).toEqual([
      {description:'来源机壳或转子同步真实变化',kind:'structural-change'},
    ]);
  });

  it.each(teachingKinds)(
    'normalizes only empty %s controls to omission without mutation',
    (kind) => {
      const requirement = Object.freeze({ description: '原始教学要求', kind, controls: [] });
      const input = intentWith([requirement]);
      const parsed = parseVisualGenerationIntent(input);
      expect(parsed).toStrictEqual(
        parseVisualGenerationIntent(intentWith([{ description: requirement.description, kind }])),
      );
      expect(parsed.interactionRequirements[0]).not.toHaveProperty('controls');
      expect(input.interactionRequirements[0]).toBe(requirement);
      expect(requirement.controls).toEqual([]);
      expect(parsed.interactionRequirements[0].kind).toBe(kind);
      expect(parsed.interactions).toEqual(['原始教学要求']);
    },
  );

  it('classifies starting a physical pipe injection as transport evidence', () => {
    const input = {
      ...intentWith([{description: '向管路注入物料', kind: 'state-change'}]),
      reason: '通过离心机管路观察物料流动',
      objects: ['离心机', '注入管路与喷嘴'],
      visualPriorities: ['物料流向清晰'],
    };
    const parsed = parseVisualGenerationIntent(input);
    expect(parsed.interactionRequirements).toEqual([{description: '向管路注入物料', kind: 'transport'}]);
    expect(input.interactionRequirements).toEqual([{description: '向管路注入物料', kind: 'state-change'}]);
  });

  it('keeps bare injection as a state change in a cyber-physical centrifuge lesson', () => {
    const parsed=parseVisualGenerationIntent({
      ...intentWith([{description:'开始注入',kind:'transport'}]),
      reason:'ICS/SCADA安全演示中向离心机控制器注入恶意指令',
      objects:['离心机','控制器'],
    });
    expect(parsed.interactionRequirements).toEqual([{description:'开始注入',kind:'state-change'}]);
  });

  it('recognizes an HMI centrifuge lesson as cyber-physical context for bare injection', () => {
    const parsed=parseVisualGenerationIntent({
      ...intentWith([{description:'开始注入',kind:'transport'}]),
      reason:'三维离心机演示中比较显示值与物理真实值',
      objects:['剖面离心机','HMI显示面板','物理转速指针'],
    });
    expect(parsed.interactionRequirements).toEqual([{description:'开始注入',kind:'state-change'}]);
  });

  it('keeps a logical injection state change when there is no physical flow context', () => {
    const parsed = parseVisualGenerationIntent({
      ...intentWith([{description: '开始注入测试载荷', kind: 'state-change'}]),
      reason: '观察输入状态和应用响应',
      objects: ['请求载荷', '应用状态'],
    });
    expect(parsed.interactionRequirements[0].kind).toBe('state-change');
  });

  it('accepts the reported ten-to-ten empty-controls shape in one mocked classification', async () => {
    const input = tenRequirementFixture();
    const ai = vi.fn().mockResolvedValue(JSON.stringify(input));
    const parsed = await resolveVisualGenerationIntent('保留全部教学要求与播放操作', {}, ai);
    expect(ai).toHaveBeenCalledTimes(1);
    expect(parsed.interactions).toEqual(input.interactions);
    expect(parsed.objects).toEqual(input.objects);
    expect(parsed.interactionRequirements).toHaveLength(10);
    expect(parsed.interactionRequirements.map((requirement) => requirement.kind)).toEqual(
      input.interactionRequirements.map((requirement) => requirement.kind),
    );
    for (const index of [0, 1, 2, 3, 9])
      expect(parsed.interactionRequirements[index]).not.toHaveProperty('controls');
    for (const index of [4, 5, 6, 7, 8])
      expect(parsed.interactionRequirements[index]).toEqual(input.interactionRequirements[index]);
    expect(parsed).not.toHaveProperty('jsonParsing');
  });

  it.each(teachingKinds)(
    'still rejects nonempty %s controls with the existing contract code',
    (kind) => {
      expect(() =>
        parseVisualGenerationIntent(
          intentWith([{ description: '教学过程不能冒充播放器', kind, controls: ['play'] }]),
        ),
      ).toThrow(
        expect.objectContaining({
          name: 'VisualIntentContractError',
          code: 'CONTROLS_ON_TEACHING_REQUIREMENT',
        }),
      );
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', []],
    ['duplicate', ['play', 'play']],
    ['unknown', ['explode']],
    ['invalid casing', ['PLAY']],
    ['null', null],
    ['string', 'pause'],
  ])('rejects %s player controls without relabeling or filling them', (_label, controls) => {
    expect(() =>
      parseVisualGenerationIntent(
        intentWith([{ description: '播放器操作', kind: 'player-control', controls }]),
      ),
    ).toThrow();
  });

  it('preserves every declared legal player control without deduplicating or dropping it', () => {
    const controls = [...cinematicPlayerControlNames];
    const parsed = parseVisualGenerationIntent(
      intentWith([{ description: '使用完整内置播放器控件', kind: 'player-control', controls }]),
    );
    expect(parsed.interactionRequirements[0].controls).toEqual(controls);
  });

  it.each([null, '[]', {}, ['explode'], [undefined]])(
    'does not normalize malformed teaching controls %j',
    (controls) => {
      expect(() =>
        parseVisualGenerationIntent(
          intentWith([{ description: '保持教学状态', kind: 'state-change', controls }]),
        ),
      ).toThrow();
    },
  );

  it('does not normalize an unknown teaching kind into a supported kind', () => {
    expect(() =>
      parseVisualGenerationIntent(
        intentWith([{ description: '自定义动作', kind: 'custom-action', controls: [] }]),
      ),
    ).toThrow();
  });

  it('uses the same normalization in the legacy schema pick/unwrap path', () => {
    const input = tenRequirementFixture();
    const legacy = visualIntentSchema
      .pick({ objects: true, interactions: true, visualPriorities: true })
      .extend({
        interactionRequirements: visualIntentSchema.shape.interactionRequirements
          .unwrap()
          .optional(),
      })
      .parse(input);
    expect(legacy.interactionRequirements).toEqual(
      parseVisualGenerationIntent(input).interactionRequirements,
    );
    expect(() =>
      validateVisualInteractionRequirements({
        ...legacy,
        interactionRequirements: legacy.interactionRequirements!,
      }),
    ).not.toThrow();
  });

  it('also normalizes empty controls in explicit interactive-2d contracts without changing format', () => {
    const parsed = parseVisualGenerationIntent({
      ...intentWith([{ description: '点击步骤查看说明', kind: 'view', controls: [] }]),
      mode: 'interactive-2d',
      twoDimensionalFormat: 'diagram',
    });
    expect(parsed.mode).toBe('interactive-2d');
    expect(parsed.twoDimensionalFormat).toBe('diagram');
    expect(parsed.interactionRequirements).toEqual([
      { description: '点击步骤查看说明', kind: 'view' },
    ]);
  });

  it('still rejects nine interactions versus fifteen requirements on both bounded attempts', async () => {
    const input = intentWith(
      Array.from({ length: 15 }, (_, index) => ({
        description: `原始观察要求${index + 1}`,
        kind: 'view',
        controls: [],
      })),
    );
    input.interactions = input.interactions.slice(0, 9);
    const request = '不得遗漏任一要求';
    const plan = { originalRequest: request, title: '完整需求' };
    const ai = vi.fn().mockResolvedValue(JSON.stringify(input));
    const outcome = resolveVisualGenerationIntent(request, plan, ai);
    await expect(outcome).rejects.toBeInstanceOf(VisualIntentResolutionError);
    await expect(outcome).rejects.toMatchObject({
      diagnostics: {
        version: 'visual-intent-diagnostics-v1',
        attempts: [
          { attempt: 1, phase: 'contract', code: 'INTERACTION_MAPPING_MISMATCH' },
          { attempt: 2, phase: 'contract', code: 'INTERACTION_MAPPING_MISMATCH' },
        ],
      },
    });
    expect(ai).toHaveBeenCalledTimes(2);
    expect(input.interactions).toHaveLength(9);
    expect(input.interactionRequirements).toHaveLength(15);
    for (const call of ai.mock.calls) expect(JSON.parse(call[1])).toMatchObject({ request, plan });
    const correction = JSON.parse(ai.mock.calls[1][1]).correction;
    expect(correction).toContain('同步更新两数组');
    expect(correction).toContain('不能删掉未匹配要求');
  });

  it.each([
    { interactions: ['观察A', '观察A'], descriptions: ['观察A', '观察B'] },
    { interactions: ['观察A', '观察B'], descriptions: ['观察A', '观察A'] },
    { interactions: ['观察A', '观察B'], descriptions: ['观察A', '观察B '] },
  ])('rejects a duplicate or inexact mapping even after normalization: %j', (mapping) => {
    const input = intentWith(
      mapping.descriptions.map((description) => ({ description, kind: 'view', controls: [] })),
    );
    input.interactions = mapping.interactions;
    expect(() => parseVisualGenerationIntent(input)).toThrow(
      expect.objectContaining({ code: 'INTERACTION_MAPPING_MISMATCH' }),
    );
  });

  it('gives concrete controls correction while preserving the typed teaching requirements', async () => {
    const valid = tenRequirementFixture();
    const invalid = structuredClone(valid);
    invalid.interactionRequirements[4].controls = [];
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(invalid))
      .mockResolvedValueOnce(JSON.stringify(valid));
    const result = await resolveVisualGenerationIntent('观察、拆开并播放连续教学过程', {}, ai);
    expect(ai).toHaveBeenCalledTimes(2);
    expect(result).toEqual(parseVisualGenerationIntent(valid));
    const correction = JSON.parse(ai.mock.calls[1][1]).correction;
    expect(correction).toContain('interactionRequirements.4.controls');
    expect(correction).toContain('非player-control省略controls');
    expect(correction).toContain('player-control必须填写教师实际要求的非空、去重合法控件');
    expect(correction).toContain('不得携带非空controls或为迁就控件改动教学kind');
  });

  it('supplies schema-valid examples for all five kinds and explicit matching size limits', async () => {
    const ai = vi.fn().mockResolvedValue(JSON.stringify(tenRequirementFixture()));
    await resolveVisualGenerationIntent('按当前教师语义判定', {}, ai);
    const system = ai.mock.calls[0][0] as string;
    const exampleText = system.split('不得继承示例中的对象或操作）：')[1].split('\n')[0];
    const example = parseVisualGenerationIntent(JSON.parse(exampleText));
    expect(example.interactionRequirements.map((requirement) => requirement.kind)).toEqual([
      ...teachingKinds,
      'player-control',
    ]);
    expect(system).toContain('reason为4–600字符');
    expect(system).toContain('objects最多20项');
    expect(system).toContain(`各最多${CINEMATIC_MAX_INTERACTIONS}项且必须完整一一对应`);
    expect(system).not.toContain('最多16项');
    expect(system).toContain('visualPriorities最多12项');
    expect(system).toContain('description均为1–180字符');
    expect(system).toContain(`controls为1–${cinematicPlayerControlNames.length}个不重复`);
    expect(system).toContain('不得截断数组、遗漏实体/操作或合并不同证据种类');
    expect(system).toContain('分类来自完整语义，不按单词匹配');
    expect(system).not.toContain('仅player-control时填写真实控件枚举');
    expect(system).not.toContain('"kind":"view|');
  });

  it.each([
    { reason: '字'.repeat(601) },
    { objects: Array.from({ length: 21 }, (_, index) => `实体${index}`) },
    { objects: ['字'.repeat(181)] },
    { visualPriorities: Array.from({ length: 13 }, (_, index) => `细节${index}`) },
  ])('keeps the existing field limits strict: %j', (override) => {
    expect(() =>
      parseVisualGenerationIntent({ ...tenRequirementFixture(), ...override }),
    ).toThrow();
  });

  it.each([17, 18, 19, 20, 21, 22, 23, 24])(
    'preserves all %i mixed-kind requirements in one mocked classification and the animated adapter',
    async (count) => {
      const input = interactionCountFixture(count);
      const before = structuredClone(input);
      const ai = vi.fn().mockResolvedValue(JSON.stringify(input));
      const request = '完整保留每条观察、教学动作及播放器需求';
      const parsed = await resolveVisualGenerationIntent(request, {}, ai);
      expect(ai).toHaveBeenCalledTimes(1);
      expect(parsed.interactions).toEqual(input.interactions);
      expect(parsed.interactionRequirements).toEqual(
        input.interactionRequirements.map(({ controls, ...requirement }) =>
          requirement.kind === 'player-control' ? { ...requirement, controls } : requirement,
        ),
      );
      expect(parsed.interactionRequirements).toHaveLength(count);
      expect(input).toEqual(before);
      const adapted = animatedPlanInput({ title: '全部要求', visualIntent: parsed }, request);
      expect(adapted.originalRequest).toBe(request);
      expect(adapted.visualIntent).toEqual(parsed);
    },
  );

  it('rejects twenty-five complete requirements with both exact capacity paths and no truncation', async () => {
    const input = interactionCountFixture(25);
    const before = structuredClone(input);
    const ai = vi.fn().mockResolvedValue(JSON.stringify(input));
    const outcome = resolveVisualGenerationIntent('不得遗漏第25项要求', {}, ai);
    await expect(outcome).rejects.toMatchObject({
      diagnostics: {
        version: 'visual-intent-diagnostics-v1',
        attempts: [1, 2].map((attempt) => ({
          attempt,
          phase: 'schema',
          code: 'SCHEMA_INVALID',
          issueCount: 2,
          issues: [
            { path: 'interactions', code: 'too_big', maximum: 24 },
            { path: 'interactionRequirements', code: 'too_big', maximum: 24 },
          ],
        })),
      },
    });
    expect(ai).toHaveBeenCalledTimes(2);
    expect(input).toEqual(before);
    expect(input.interactionRequirements).toHaveLength(25);
  });

  it('matches the existing SceneIR coverage interaction capacity without changing its schema', () => {
    expect(CINEMATIC_MAX_INTERACTIONS).toBe(24);
    const coverageSchema = cinematicSchema.shape.coverage.unwrap().shape.interactions;
    const coverage = Array.from({ length: 24 }, (_, index) => ({
      description: `观察要求${index}`,
      chapter: 0,
      targets: ['hero'],
      properties: ['explore'],
    }));
    expect(coverageSchema.parse(coverage)).toHaveLength(CINEMATIC_MAX_INTERACTIONS);
    expect(
      coverageSchema.safeParse([...coverage, { ...coverage[0], description: '第25项' }]).success,
    ).toBe(false);
  });

  it('retains the twenty-object boundary independently of the expanded interaction capacity', () => {
    const input = {
      ...interactionCountFixture(24),
      objects: Array.from({ length: 20 }, (_, index) => `实体${index}`),
    };
    expect(parseVisualGenerationIntent(input).objects).toEqual(input.objects);
    expect(() =>
      parseVisualGenerationIntent({ ...input, objects: [...input.objects, '第21个'] }),
    ).toThrow();
  });

  it.each([
    { kind: 'unknown-kind' },
    { kind: 'player-control', controls: [] },
    { kind: 'player-control', controls: ['play', 'play'] },
    { kind: 'player-control', controls: ['explode'] },
    { kind: 'state-change', controls: ['pause'] },
    { description: '未对应的要求' },
  ])('still validates the last requirement beyond the old limit: %j', (override) => {
    const input = interactionCountFixture(24);
    Object.assign(input.interactionRequirements[23], override);
    expect(() => parseVisualGenerationIntent(input)).toThrow();
    expect(input.interactionRequirements).toHaveLength(24);
  });

  it('continues rejecting nonempty teaching controls through the standalone validator', () => {
    expect(() =>
      validateVisualInteractionRequirements({
        interactions: ['改变教学状态'],
        interactionRequirements: [
          { description: '改变教学状态', kind: 'state-change', controls: ['pause'] },
        ],
      }),
    ).toThrow(VisualIntentContractError);
  });
});

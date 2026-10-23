import { describe, expect, it } from 'vitest';
import {
  parseVisualGenerationIntent,
  type VisualGenerationIntent,
} from '@/lib/cinematic/capabilities';
import { cinematicPlayerControlNames } from '@/lib/cinematic/player-controls';
import {
  CinematicRevisionContractError,
  resolveCinematicRevisionIntent,
} from '@/lib/server/cinematic-revision-contract';

function fixture(): VisualGenerationIntent {
  const kinds = ['view', 'structural-change', 'state-change', 'transport'] as const;
  const interactionRequirements: VisualGenerationIntent['interactionRequirements'] = Array.from(
    { length: 22 },
    (_, index) => ({
      description: `原始交互 ${index + 1}：保持完整教学动作。`,
      kind: kinds[index % kinds.length],
    }),
  );
  interactionRequirements.push({
    description: '原始交互 23：使用完整内置播放器操作。',
    kind: 'player-control',
    controls: [...cinematicPlayerControlNames],
  });
  return {
    mode: 'cinematic-v1',
    reason: '从原始教学对象和真实操作恢复完整三维合同',
    objects: ['主要教学对象', '支撑部件', '逻辑状态'],
    interactions: interactionRequirements.map((item) => item.description),
    interactionRequirements,
    visualPriorities: ['保持主体和支撑层次', '能够辨别教学状态变化'],
  };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function expectCode(run: () => unknown, code: CinematicRevisionContractError['code']) {
  expect(run).toThrow(expect.objectContaining({ name: 'CinematicRevisionContractError', code }));
}

describe('per-artifact frozen cinematic revision contracts', () => {
  it('restores all 23 typed interactions including state changes and every player control', () => {
    const intent = fixture();
    const result = resolveCinematicRevisionIntent({ cinematicIntent: intent }, null, 1)!;
    expect(result).toStrictEqual(intent);
    expect(result.mode).toBe('cinematic-v1');
    expect(result.interactions).toHaveLength(23);
    expect(
      result.interactionRequirements.filter((item) => item.kind === 'state-change'),
    ).toHaveLength(5);
    expect(result.interactionRequirements[22]).toEqual({
      description: intent.interactions[22],
      kind: 'player-control',
      controls: [...cinematicPlayerControlNames],
    });
    expect(result.reason).toBe(intent.reason);
    expect(result.visualPriorities).toEqual(intent.visualPriorities);
  });

  it('uses the persisted plan only for a single artifact missing per-artifact metadata', () => {
    const intent = fixture();
    expect(resolveCinematicRevisionIntent(null, { visualIntent: intent }, 1)).toStrictEqual(intent);
    expect(
      resolveCinematicRevisionIntent(
        { renderingMode: 'cinematic-v1' },
        { visualIntent: intent },
        1,
      ),
    ).toStrictEqual(intent);
  });

  it.each([2, 3, 80])(
    'does not impose a shared plan on a per-artifact contract across %i artifacts',
    (count) => {
      const intent = fixture();
      const shared = fixture();
      shared.objects.push('其他作品的对象');
      shared.interactionRequirements[2].kind = 'transport';
      expect(
        resolveCinematicRevisionIntent(
          { cinematicIntent: intent },
          { visualIntent: shared },
          count,
        ),
      ).toStrictEqual(intent);
    },
  );

  it('does not validate unrelated shared plan metadata when each artifact owns its contract', () => {
    const intent = fixture();
    expect(
      resolveCinematicRevisionIntent({ cinematicIntent: intent }, { visualIntent: null }, 2),
    ).toStrictEqual(intent);
  });

  it('never mutates either deeply frozen source and returns independent nested values', () => {
    const artifactContent = freezeDeep({ cinematicIntent: fixture() });
    const plan = freezeDeep({ visualIntent: fixture() });
    const before = structuredClone({ artifactContent, plan });
    const result = resolveCinematicRevisionIntent(artifactContent, plan, 1)!;
    result.objects.push('仅修改返回值');
    result.interactions.pop();
    result.interactionRequirements[22].controls!.pop();
    result.visualPriorities.reverse();
    expect({ artifactContent, plan }).toEqual(before);
  });

  it('preserves explicit empty valid contracts instead of treating them as absent metadata', () => {
    const intent = {
      ...fixture(),
      objects: [],
      interactions: [],
      interactionRequirements: [],
      visualPriorities: [],
    };
    expect(resolveCinematicRevisionIntent({ cinematicIntent: intent }, null, 1)).toStrictEqual(
      intent,
    );
  });
});

describe('single-artifact source agreement without merging or weakening', () => {
  it('accepts equal normalized contracts despite object-key order and noncontract audit differences', () => {
    const artifact = {
      ...fixture(),
      jsonParsing: { repairs: ['noncontract audit'], source: 'artifact' },
    };
    const plan = Object.fromEntries(Object.entries(fixture()).reverse());
    expect(
      resolveCinematicRevisionIntent({ cinematicIntent: artifact }, { visualIntent: plan }, 1),
    ).toStrictEqual(parseVisualGenerationIntent(artifact));
  });

  it('delegates non-player empty-control normalization to the existing strict parser', () => {
    const artifact = fixture();
    artifact.interactionRequirements[2].controls = [];
    const before = structuredClone(artifact);
    const result = resolveCinematicRevisionIntent(
      { cinematicIntent: artifact },
      { visualIntent: fixture() },
      1,
    )!;
    expect(result.interactionRequirements[2]).toEqual({
      description: artifact.interactions[2],
      kind: 'state-change',
    });
    expect(artifact).toEqual(before);
  });

  it.each([
    {
      name: 'objects',
      change: (intent: VisualGenerationIntent) => {
        intent.objects.pop();
      },
    },
    {
      name: 'interaction omitted in both lists',
      change: (intent: VisualGenerationIntent) => {
        intent.interactions.pop();
        intent.interactionRequirements.pop();
      },
    },
    {
      name: 'state-change relabeled to view',
      change: (intent: VisualGenerationIntent) => {
        intent.interactionRequirements[2].kind = 'view';
      },
    },
    {
      name: 'player control omitted',
      change: (intent: VisualGenerationIntent) => {
        intent.interactionRequirements[22].controls!.pop();
      },
    },
    {
      name: 'player control renamed to teaching action',
      change: (intent: VisualGenerationIntent) => {
        intent.interactionRequirements[22] = {
          description: intent.interactions[22],
          kind: 'state-change',
        };
      },
    },
    {
      name: 'reason',
      change: (intent: VisualGenerationIntent) => {
        intent.reason = '另一来源表达了不同的需求理解';
      },
    },
    {
      name: 'visual priorities',
      change: (intent: VisualGenerationIntent) => {
        intent.visualPriorities.pop();
      },
    },
    {
      name: 'object order',
      change: (intent: VisualGenerationIntent) => {
        intent.objects.reverse();
      },
    },
  ])('rejects a conflict in $name rather than silently preferring one source', ({ change }) => {
    const artifact = fixture();
    const plan = fixture();
    change(plan);
    const before = structuredClone({ artifact, plan });
    expectCode(
      () =>
        resolveCinematicRevisionIntent({ cinematicIntent: artifact }, { visualIntent: plan }, 1),
      'CONFLICTING_INTENTS',
    );
    expect({ artifact, plan }).toEqual(before);
  });
});

describe('corrupt or ambiguous typed metadata cannot become legacy-untyped', () => {
  it.each([2, 3, 80])(
    'rejects shared-plan attribution without per-artifact metadata for %i artifacts',
    (count) => {
      expectCode(
        () => resolveCinematicRevisionIntent({}, { visualIntent: fixture() }, count),
        'AMBIGUOUS_PLAN_INTENT',
      );
    },
  );

  it.each([null, undefined, {}, [], 'not-json'])(
    'rejects explicitly present malformed per-artifact metadata %j even with a valid plan',
    (value) => {
      expectCode(
        () =>
          resolveCinematicRevisionIntent(
            { cinematicIntent: value },
            { visualIntent: fixture() },
            1,
          ),
        'INCOMPLETE_INTENT',
      );
    },
  );

  it.each(['objects', 'interactions', 'interactionRequirements', 'visualPriorities'])(
    'rejects a missing persisted %s array before schema defaults can erase the contract',
    (field) => {
      const intent: Record<string, unknown> = { ...fixture() };
      delete intent[field];
      expectCode(
        () => resolveCinematicRevisionIntent({ cinematicIntent: intent }, null, 1),
        'INCOMPLETE_INTENT',
      );
      expectCode(
        () => resolveCinematicRevisionIntent(null, { visualIntent: intent }, 1),
        'INCOMPLETE_INTENT',
      );
    },
  );

  it.each([
    {
      name: 'missing mode',
      change: (intent: Record<string, unknown>) => {
        delete intent.mode;
      },
    },
    {
      name: 'missing reason',
      change: (intent: Record<string, unknown>) => {
        delete intent.reason;
      },
    },
    {
      name: 'partial typed mapping',
      change: (intent: Record<string, unknown>) => {
        (intent.interactionRequirements as unknown[]).pop();
      },
    },
    {
      name: 'unknown evidence kind',
      change: (intent: Record<string, unknown>) => {
        (intent.interactionRequirements as Array<Record<string, unknown>>)[2].kind =
          'legacy-untyped';
      },
    },
    {
      name: 'empty player controls',
      change: (intent: Record<string, unknown>) => {
        (intent.interactionRequirements as Array<Record<string, unknown>>)[22].controls = [];
      },
    },
    {
      name: 'duplicate player controls',
      change: (intent: Record<string, unknown>) => {
        (intent.interactionRequirements as Array<Record<string, unknown>>)[22].controls = [
          'play',
          'play',
        ];
      },
    },
    {
      name: 'unknown player control',
      change: (intent: Record<string, unknown>) => {
        (intent.interactionRequirements as Array<Record<string, unknown>>)[22].controls = [
          'explode',
        ];
      },
    },
    {
      name: 'nonempty controls on state-change',
      change: (intent: Record<string, unknown>) => {
        (intent.interactionRequirements as Array<Record<string, unknown>>)[2].controls = ['play'];
      },
    },
    {
      name: 'duplicate descriptions',
      change: (intent: Record<string, unknown>) => {
        (intent.interactions as string[])[1] = (intent.interactions as string[])[0];
      },
    },
  ])('rejects $name without falling back to a valid second source', ({ change }) => {
    const invalid: Record<string, unknown> = { ...fixture() };
    change(invalid);
    expectCode(
      () =>
        resolveCinematicRevisionIntent(
          { cinematicIntent: invalid },
          { visualIntent: fixture() },
          1,
        ),
      'INVALID_INTENT',
    );
    expectCode(
      () =>
        resolveCinematicRevisionIntent(
          { cinematicIntent: fixture() },
          { visualIntent: invalid },
          1,
        ),
      'INVALID_INTENT',
    );
  });

  it.each(['diagram', 'simulation'])(
    'rejects valid but two-dimensional %s metadata',
    (twoDimensionalFormat) => {
      const intent = { ...fixture(), mode: 'interactive-2d', twoDimensionalFormat };
      expectCode(
        () => resolveCinematicRevisionIntent({ cinematicIntent: intent }, null, 1),
        'NON_CINEMATIC_INTENT',
      );
      expectCode(
        () => resolveCinematicRevisionIntent(null, { visualIntent: intent }, 1),
        'NON_CINEMATIC_INTENT',
      );
    },
  );

  it('reports corruption without copying teacher content into the exception', () => {
    const intent = fixture();
    const privateText = 'PRIVATE_TEACHER_REQUEST';
    intent.interactionRequirements[2] = {
      description: privateText,
      kind: 'state-change',
      controls: ['play'],
    };
    let failure: unknown;
    try {
      resolveCinematicRevisionIntent({ cinematicIntent: intent }, null, 1);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CinematicRevisionContractError);
    expect((failure as CinematicRevisionContractError).source).toBe('artifact.cinematicIntent');
    expect(String(failure)).not.toContain(privateText);
    expect(JSON.stringify(failure)).not.toContain(privateText);
  });
});

describe('legacy metadata absence and artifact count boundaries', () => {
  it.each([1, 2, 80])(
    'keeps genuinely absent metadata legacy-compatible for %i artifacts',
    (count) => {
      expect(resolveCinematicRevisionIntent(null, null, count)).toBeUndefined();
      expect(resolveCinematicRevisionIntent({}, {}, count)).toBeUndefined();
    },
  );

  it('does not infer kinds from SceneIR coverage, outline or a new director', () => {
    const content = {
      cinematicScene: {
        coverage: { interactions: [{ properties: ['controls'], controls: ['play'] }] },
      },
    };
    const plan = { director: { visualIntent: fixture() }, outline: { visualIntent: fixture() } };
    expect(resolveCinematicRevisionIntent(content, plan, 1)).toBeUndefined();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid artifactCount %j',
    (count) => {
      expectCode(
        () => resolveCinematicRevisionIntent(null, { visualIntent: fixture() }, count),
        'INVALID_ARTIFACT_COUNT',
      );
    },
  );
});

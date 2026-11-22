import { afterEach, expect, it, vi } from 'vitest';
import type { OrdinaryTeachingModel } from '@/lib/server/agent-harness/ordinary-teaching';
import { runPinnedTeachingGeneration } from '@/lib/server/agent-harness/ordinary-teaching-generation';

vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn() }));
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-Test-Service',
  aiseceduInternalOrigin: () => 'http://local-fixture.invalid',
  serviceTokenForInternalCall: () => 'fixture-token',
}));

afterEach(() => vi.unstubAllGlobals());

const blueprint = {
  blueprint: {
    title: '植物观察',
    summary: '观察两株幼苗',
    strategy: '比较记录',
    variant: '表格',
    outline: [{ title: '观察记录', purpose: '测量和比较' }],
    objectives: ['比较植物生长'],
    assessment: ['说明观察依据'],
    safety: [],
  },
};
const lesson = {
  candidate: {
    title: '幼苗生长记录',
    summary: '从观察记录推导增量',
    strategy: '表格对比',
    differences: ['比较增量'],
    recommendation: '用于科学课堂',
    content: {
      type: 'lesson-plan',
      objectives: ['比较植物生长'],
      outline: [
        { title: '观察记录', description: '测量和比较两株幼苗的变化', keyPoints: ['记录高度'] },
      ],
      activities: [],
      assessment: { criteria: ['能说明观察依据'] },
      sourceGrounding: [{ materialId: 'material-1', uses: ['用幼苗记录比较增量'] }],
    },
  },
};
const real = {
  id: 'private-db-identifier',
  revisionId: 'private-revision',
  sha256: 'f'.repeat(64),
};
const locator = { filename: '/private/path/observations.pdf', offset: 25 };
const coverage = { complete: true, expectedMaterialCount: 1, materialIds: [real.id] };
const source = {
  ...real,
  filename: locator.filename,
  title: 'private-filename',
  coverage: { complete: true },
  analysis: { summary: '两株幼苗在观察期间都增加了两厘米' },
  excerpts: [{ content: '课上观察幼苗叶片', sourceLocator: locator }],
};
const candidatePayload = {
  prompt: '给四年级设计植物观察教案',
  count: 1,
  artifactType: 'lesson-plan',
  sourceRefs: [{ ...real, type: 'material' }],
  materialContext: coverage,
  sourceMaterials: [source],
  materialDossier: { coverage, materials: [source] },
  courseContext: { roster: 'private-course-metadata' },
  sourceCandidates: [
    {
      id: 'private-candidate-identity',
      title: '经选定的旧方案',
      content: { outline: lesson.candidate.content.outline, authorNote: 'private-author-note' },
    },
  ],
};

function modelWith(respond: (content: string) => unknown) {
  const turn = vi.fn<OrdinaryTeachingModel['turn']>(async (messages) => ({
    text: JSON.stringify(respond(messages[1].content)),
    model: 'fixture-model',
    usage: { prompt_tokens: 5, completion_tokens: 2 },
  }));
  const model: OrdinaryTeachingModel = {
    turn,
    modelId: 'fixture-model',
    signal: new AbortController().signal,
  };
  return { model, turn };
}

it('projects selected teaching material and derivations, retries without private IDs, and restores real citations', async () => {
  let attempts = 0;
  const { model, turn } = modelWith((content) => {
    const packet = JSON.parse(content);
    if (!packet.blueprint) return blueprint;
    return attempts++
      ? lesson
      : {
          candidate: {
            ...lesson.candidate,
            content: {
              ...lesson.candidate.content,
              sourceGrounding: [{ materialId: real.id, uses: ['错误引用'] }],
            },
          },
        };
  });
  const result = await runPinnedTeachingGeneration(
    'job',
    'candidate-plan',
    candidatePayload,
    model,
    'trace',
  );
  expect(result.result.candidates).toMatchObject([
    {
      content: {
        sourceGrounding: [
          {
            materialId: real.id,
            uses: ['用幼苗记录比较增量'],
            sourceLocators: [locator],
          },
        ],
      },
    },
  ]);
  expect(result.usage).toEqual({ inputTokens: 15, outputTokens: 6, totalTokens: 21 });
  expect(turn).toHaveBeenCalledTimes(3);
  for (const [messages] of turn.mock.calls) {
    const output = JSON.stringify(messages);
    expect(output).not.toMatch(/private-|\/private\/path|f{64}/);
    expect(output).toContain('material-1');
    expect(output).toContain('经选定的旧方案');
    expect(output).toContain('课上观察幼苗叶片');
  }
});

it('rejects oversized candidate teaching data and stale material revisions before any call', async () => {
  const { model, turn } = modelWith(() => blueprint);
  await expect(
    runPinnedTeachingGeneration(
      'job',
      'candidate-plan',
      {
        ...candidatePayload,
        prompt: '叶'.repeat(50_000),
      },
      model,
      'trace',
    ),
  ).rejects.toMatchObject({ code: 'TEACHING_INPUT_TOO_LARGE' });
  await expect(
    runPinnedTeachingGeneration(
      'job',
      'candidate-plan',
      {
        ...candidatePayload,
        sourceRefs: [{ ...real, type: 'material', revisionId: 'stale' }],
      },
      model,
      'trace',
    ),
  ).rejects.toMatchObject({ code: 'TEACHING_INPUT_INVALID' });
  expect(turn).not.toHaveBeenCalled();
});

it('honors a short exact slide count and rejects an incomplete slide expansion', async () => {
  const pages = [
    {
      layout: 'cover',
      title: '幼苗观察',
      description: '提出可观察的高度变化问题',
      keyPoints: ['观察高度'],
    },
    {
      layout: 'summary',
      title: '观察结论',
      description: '用表格记录总结增量变化',
      keyPoints: ['对照多次观测', '说明增量'],
    },
  ].map((page) => ({
    ...page,
    visualBrief: '用两列表格呈现观察记录',
    speakerNotes: '让两组同学先独立记录幼苗的高度，再把结果写入同一张表格统一比较。'.repeat(3),
  }));
  let expansions = 0;
  const { model } = modelWith((content) => {
    if (!JSON.parse(content).blueprint) return blueprint;
    return {
      candidate: {
        ...lesson.candidate,
        content: {
          ...lesson.candidate.content,
          type: 'slide-deck',
          outline: expansions++ ? pages : pages.slice(0, 1),
          sourceGrounding: [],
        },
      },
    };
  });
  const result = await runPinnedTeachingGeneration(
    'job',
    'candidate-plan',
    {
      artifactType: 'slide-deck',
      prompt: '制作 2 页植物观察课件',
    },
    model,
    'trace',
  );
  expect(result.result.candidates).toMatchObject([
    {
      content: {
        outline: pages,
        pageCountPolicy: { min: 2, max: 2, preferred: 2, explicit: true },
      },
    },
  ]);
  expect(expansions).toBe(2);
});

it('maps and reduces the full indexed Unicode text and repairs the chapter outline', async () => {
  const material = '叶片生长🌱'.repeat(5200) + '观察全文末尾';
  const length = [...material].length;
  const fetch = vi.fn(async () => new Response(material));
  vi.stubGlobal('fetch', fetch);
  const chapter = (title: string, start: number) => ({
    title,
    description: '通过比较观察记录归纳叶片生长特点。',
    objectives: ['比较观察记录'],
    sourceLocators: [{ start, end: start + 3 }],
  });
  const { model, turn } = modelWith((content) => {
    const packet = JSON.parse(content);
    expect(packet.material).toBe('material-1');
    expect(content).not.toContain('/private/path');
    if (packet.outlineIssue)
      return {
        analysis: {
          chapterCandidates: [
            chapter('生长条件', 0),
            chapter('比较测量', 12_000),
            chapter('汇报记录', 24_000),
          ],
        },
      };
    const start = packet.start ?? 0;
    return {
      analysis: {
        summary: packet.content?.endsWith('观察全文末尾') ? '全文末尾的记录' : '观察资料',
        functionalPoints: [],
        chapterCandidates: [chapter('单一课程主题', start)],
      },
    };
  });
  const result = await runPinnedTeachingGeneration(
    'job',
    'material-summary',
    {
      filename: locator.filename,
      mimeType: 'application/pdf',
    },
    model,
    'trace',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(turn).toHaveBeenCalledTimes(4);
  expect(result.result.analysis).toMatchObject({
    coverage: {
      complete: true,
      extractedCharacters: length,
      analyzedCharacters: length,
      segmentCount: 2,
    },
    sectionSummaries: [
      { start: 0, end: 24_000 },
      { start: 24_000, end: length, summary: '全文末尾的记录' },
    ],
    chapterCandidates: [{ title: '生长条件' }, { title: '比较测量' }, { title: '汇报记录' }],
  });
  const chunks = result.result.chunks as { content: string }[];
  expect(chunks.map((item) => item.content).join('')).toBe(material);
  expect(chunks[0]).toMatchObject({
    sourceLocator: { filename: locator.filename },
    metadata: { mimeType: 'application/pdf' },
  });
});

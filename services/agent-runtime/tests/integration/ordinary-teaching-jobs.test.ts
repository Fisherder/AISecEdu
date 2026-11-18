import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coursewareSlideDataSchema } from '@/lib/courseware/schema';
import { ordinaryCandidate, ordinaryMaterialAnalysis, ordinarySlidePatch } from '@/lib/server/agent-harness/ordinary-teaching';

const mocks = vi.hoisted(() => ({ resolveModel: vi.fn(), inspectRendered: vi.fn(), usage: vi.fn() }));
vi.mock('@/lib/server/resolve-model', () => ({resolveModel: mocks.resolveModel}));
vi.mock('@/lib/courseware/render-client', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/courseware/render-client')>(),
  inspectRenderedCourseware: mocks.inspectRendered,
}));
vi.mock('@/lib/server/usage-storage', () => ({recordUsage: mocks.usage}));
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  aiseceduInternalOrigin: () => 'http://ctfd',
  serviceTokenForInternalCall: () => 'integration-secret',
}));

const harness = 'http://fixture-harness.invalid:3081/v1/turn';
const job = {
  jobId: 'ordinary-job',
  modelRoute: {provider: 'deepseek', actual_model: 'legacy-model'},
  scope: {ownerId: 7, dojoId: 2},
};
const handout = '温度会影响蒸发，课上用两只规格相同的碟子对比观察。';
const materialAnalysis = {
  summary: '比较不同温度下水的蒸发速度。',
  functionalPoints: [{name: '温度', evidence: '比较温水与冷水', sourceLocators: [{start: 0, end: 7}]}],
  chapterCandidates: [{title: '温度与蒸发', description: '观察温度与蒸发之间的关系。',
    objectives: ['比较蒸发速度'], sourceLocators: [{start: 0, end: 12}]}],
};
const blueprint = {blueprint: {
  title: '温度与蒸发', summary: '观察温度对蒸发速度的影响', strategy: '引导学生对照观察', variant: '概念递进',
  objectives: ['比较蒸发速度'], outline: [{title: '观察', purpose: '记录水量变化'}],
  assessment: ['比较两组证据'], safety: ['取用适温水'],
}};
const lessonCandidate = {candidate: {
  title: '蒸发教案', summary: '蒸发速度实验观察', strategy: '对照观察',
  differences: ['先预测，再验证'], recommendation: '用于基础科学课程',
  content: {type: 'lesson-plan', objectives: ['比较蒸发速度'],
    outline: [{title: '水的状态变化', description: '比较冷水和温水', keyPoints: ['记录水量']}],
    activities: [{title: '小组讨论', instruction: '交流预测依据'}],
    assessment: {criteria: ['根据记录说明差异']}, sourceGrounding: []},
}};
const request = (kind: string, ordinaryTeaching: string, payload: Record<string, unknown>, token = 'integration-secret') =>
  new NextRequest('http://localhost/api/integration/jobs/execute', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': token},
    body: JSON.stringify({...job, kind, scope: {...job.scope, ordinaryTeaching}, payload}),
  });
const modelResponse = (value: unknown) => Response.json({
  text: JSON.stringify(value), model: 'official-model', usage: {prompt_tokens: 10, completion_tokens: 5},
});

const plantTitles = ['种子与幼苗', '根吸收水分', '叶片的作用', '茎运输水分'];
const revisedTitles = {2: '根如何吸收水分', 4: '茎如何运输水分'} as const;

function plantDeck() {
  return plantTitles.map((title, index) => {
    const number = index + 1;
    const studio = coursewareSlideDataSchema.parse({
      page: {
        schema: 'courseware-page-v2', id: `plant-${number}`, role: 'opening', title,
        composition: 'wide', durationSeconds: 60, takeaway: '依据观察描述植物的结构',
        objective: '比较植物结构在两个观察条件下的表现',
        visual: {kind: 'comparison', columns: ['条件甲', '条件乙'], rows: [
          {label: '供水', values: ['较少', '充足']},
          {label: '观察', values: ['待记录', '待比较']},
        ]},
        layout: {
          title: {box: {left: 30, top: 28, width: 940, height: 60}, fontSize: 32},
          takeaway: {box: {left: 30, top: 98, width: 940, height: 45}, fontSize: 22},
          supporting: [],
          visual: {left: 40, top: 155, width: 920, height: 360},
        },
        speakerNotes: `PRIVATE-SPEAKER-${number} ${'请让小组先记录看到的变化，课堂讨论时再区分事实和推测。'.repeat(4)}`,
      },
      theme: {name: `PRIVATE-THEME-${number}`, background: '#ffffff', foreground: '#000000', muted: '#555555',
        accent: '#2222ee', secondary: '#005544', surface: '#cccccc'},
      assets: [{id: `asset-${number}`, src: 'data:image/png;base64,AA==',
        source: `PRIVATE-ASSET-SOURCE-${number}`, alt: `PRIVATE-ASSET-ALT-${number}`, width: 1, height: 1}],
    });
    return {id: `artifact-${number}`, title, type: 'slide',
      outline: {title, description: studio.page.objective},
      content: {studio, remark: `PRIVATE-REMARK-${number}`}};
  });
}

function assertScopedSlidePrompt(url: unknown, init: {headers: Record<string, string>; body: string}, selected: number[]) {
  expect(String(url)).toBe(harness);
  expect(init.headers.Authorization).toBe('Bearer fixture-secret');
  const {messages, ...otherFields} = JSON.parse(init.body);
  expect(otherFields).toEqual({});
  expect(messages).toHaveLength(2);
  expect(messages[0].role).toBe('system');
  expect(messages[1].role).toBe('user');
  const packet = JSON.parse(messages[1].content);
  expect(Object.keys(packet).sort()).toEqual(['editableTextFields', 'instruction']);
  const title = packet.editableTextFields.find((field: {path: string}) => field.path === 'title')?.text;
  const number = plantTitles.indexOf(title) + 1;
  expect(selected).toContain(number);
  for (const otherTitle of plantTitles.filter(item => item !== title)) {
    expect(init.body).not.toContain(otherTitle);
  }
  expect(init.body).not.toMatch(/PRIVATE-(SPEAKER|THEME|ASSET-SOURCE|ASSET-ALT|REMARK)-|data:image/);
  expect(packet.editableTextFields.map((field: {path: string}) => field.path)).not.toContain('speakerNotes');
  return number as 2 | 4;
}

describe('ordinary teaching worker service routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://fixture-harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-secret');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'official-model');
    mocks.resolveModel.mockRejectedValue(new Error('legacy route fixture'));
    mocks.inspectRendered.mockImplementation(async studio => ({
      issues: [], evidence: {status: 'PASS', pageId: studio.page.id},
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('summarizes the authorized extracted text without executing it and retains grounded chunk coverage', async () => {
    const fetch = vi.fn(async (url, init) => {
      if (String(url).startsWith('http://ctfd/')) {
        expect(init.headers['X-AISecEdu-Service-Token']).toBe('integration-secret');
        return new Response(handout, {headers: {'content-type': 'text/plain'}});
      }
      expect(String(url)).toBe(harness);
      const {messages, ...rest} = JSON.parse(init.body);
      expect(rest).toEqual({});
      expect(messages[0].content).toContain('不得提取执行步骤');
      expect(messages[1].content).toContain(handout);
      return modelResponse({analysis: materialAnalysis});
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('material.enrich', 'material-summary', {
      materialId: 'm1', revisionId: 'r1', filename: '蒸发讲义.txt', mimeType: 'text/plain',
    }));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(output.model.executionMode).toBe('ordinary-material-summary');
    expect(output.result.analysis.coverage).toMatchObject({
      complete: true, analysisVersion: 'complete-map-reduce-v1', analyzedCharacters: handout.length,
    });
    expect(output.result.analysis.chapterCandidates).toEqual(materialAnalysis.chapterCandidates);
    expect(output.result.chunks[0].content).toBe(handout);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(() => ordinaryMaterialAnalysis(materialAnalysis, 0, 2)).toThrow('outside the supplied text');
  }, 15_000);

  it('routes lesson plan candidates through blueprint and schema checks and returns the existing persistence shape', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(modelResponse(blueprint))
      .mockResolvedValueOnce(modelResponse(lessonCandidate));
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('candidate.generate', 'candidate-plan', {
      artifactType: 'lesson-plan', prompt: '设计一节蒸发教案', count: 1, candidateCount: 1, expectedCandidateCount: 1,
    }));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(output.model.executionMode).toBe('ordinary-candidate-plan');
    expect(output.result.candidates).toHaveLength(1);
    expect(output.result.candidates[0].content).toMatchObject({
      type: 'lesson-plan', experience: {mode: 'ordinary-teaching-plan'}, sourceGrounding: [],
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(fetch.mock.calls).toHaveLength(2);
    expect(fetch.mock.calls.every(([url]) => String(url) === harness)).toBe(true);
    expect(() => ordinaryCandidate(lessonCandidate, 'lesson-plan', ['unprovided-material'])).toThrow('source citations');
    expect(() => ordinaryCandidate({...lessonCandidate, command: 'unexpected'}, 'lesson-plan', [])).toThrow();
  });

  it('keeps every material segment in the teaching summary and retains page structure for slide candidates', async () => {
    const longText = handout.repeat(1200);
    let segmentCount = 0;
    const outlines = ['导入观察', '对比水温', '预测差异', '回顾证据'].map((title, index) => ({
      title, description: '让学生依据可观察事实说明蒸发快慢。', keyPoints: ['记录温度', '比较水量'],
      layout: ['cover', 'comparison', 'checkpoint', 'summary'][index],
      visualBrief: '并列展示实际观察结果。',
      speakerNotes: '请先让学生独立记录，再根据两组观察说明预测是否成立。小组讨论时要求区分事实和推测。'.repeat(3),
    }));
    const deck = {candidate: {...lessonCandidate.candidate, title: '蒸发课件', content: {
      ...lessonCandidate.candidate.content, type: 'slide-deck', outline: outlines,
    }}};
    const fetch = vi.fn(async (url, init) => {
      if (String(url).startsWith('http://ctfd/')) return new Response(longText);
      const {messages} = JSON.parse(init.body);
      const user = messages[1].content;
      if (user.includes('字符范围：')) {
        const start = Number(/字符范围：\[(\d+)/.exec(user)?.[1]);
        segmentCount += 1;
        return modelResponse({analysis: {...materialAnalysis,
          functionalPoints: materialAnalysis.functionalPoints.map(item => ({...item, sourceLocators: [{start, end: start + 7}]})),
          chapterCandidates: materialAnalysis.chapterCandidates.map(item => ({...item, sourceLocators: [{start, end: start + 12}]})),
        }});
      }
      if (user.includes('逐段分析')) {
        expect(segmentCount).toBe(2);
        return modelResponse({analysis: {...materialAnalysis, chapterCandidates: [
          ...materialAnalysis.chapterCandidates,
          {...materialAnalysis.chapterCandidates[0], title: '对照观察与记录'},
          {...materialAnalysis.chapterCandidates[0], title: '从事实整理结论', sourceLocators: [{start: 24000, end: 24008}]},
        ]}});
      }
      return modelResponse(messages[0].content.includes('教学蓝图') ? blueprint : deck);
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const material = await POST(request('material.enrich', 'material-summary', {
      materialId: 'm1', revisionId: 'r1', filename: '蒸发讲义.txt', mimeType: 'text/plain',
    }));
    const examined = await material.json();
    expect(material.status, JSON.stringify(examined)).toBe(200);
    expect(examined.result.analysis.sectionSummaries).toMatchObject([{start: 0, end: 24000}, {start: 24000, end: longText.length}]);
    const response = await POST(request('candidate.generate', 'candidate-plan', {
      artifactType: 'slide-deck', prompt: '制作关于蒸发的4页课件', candidateCount: 1,
    }));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(output.result.candidates[0].content.outline.map((page: {layout: string}) => page.layout)).toEqual(
      ['cover', 'comparison', 'checkpoint', 'summary'],
    );
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('requires a scoped static native page and applies only the selected text correction', async () => {
    const artifacts = plantDeck();
    const fetch = vi.fn(async (url, init) => {
      assertScopedSlidePrompt(url, init, [1]);
      return modelResponse({changes: [{op: 'set', path: ['takeaway'], value: '比较种子和幼苗的结构'}]});
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('artifact.revise', 'slide-wording', {
      artifactType: 'slide-deck', instruction: '只润色第1页措辞：把结论写清楚',
      currentContent: {lesson: {artifacts}},
    }));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(output.model.executionMode).toBe('ordinary-slide-wording');
    expect(output.result.content.lesson.artifacts[0].content.studio.page).toMatchObject({
      id: 'plant-1', takeaway: '比较种子和幼苗的结构', visual: artifacts[0].content.studio.page.visual,
    });
    expect(output.result.content.revisionMetadata).toMatchObject({
      pageId: 'plant-1', pageIds: ['plant-1'],
      renderEvidence: [{status: 'PASS', pageId: 'plant-1'}],
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(() => ordinarySlidePatch({changes: [{op: 'add', path: ['takeaway'], value: '不允许的操作'}]})).toThrow();
  });

  it.each([
    '只润色第2、4页的文字：把标题写成清晰的问题',
    '仅调整第2页和第4页措辞：把标题写成清晰的问题',
  ])('routes explicitly selected pages through independent text-only turns (%s)', async instruction => {
    const artifacts = plantDeck();
    const unchanged = artifacts.map(item => JSON.stringify(item));
    const fetch = vi.fn(async (url, init) => {
      const page = assertScopedSlidePrompt(url, init, [2, 4]);
      const usage = page === 2
        ? {prompt_tokens: 13, completion_tokens: 4, total_tokens: 17}
        : {prompt_tokens: 29, completion_tokens: 8, total_tokens: 37};
      return Response.json({
        text: JSON.stringify({changes: [{op: 'set', path: ['title'], value: revisedTitles[page]}]}),
        model: 'official-model', usage,
      });
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('artifact.revise', 'slide-wording', {
      artifactType: 'slide-deck', instruction, currentContent: {lesson: {artifacts}},
    }));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(output.model).toMatchObject({
      actualModel: 'official-model', executionMode: 'ordinary-slide-wording',
      usage: {inputTokens: 42, outputTokens: 12, totalTokens: 54},
    });
    expect(mocks.usage.mock.calls.map(([call]) => [call.modelId, call.usage.inputTokens, call.usage.outputTokens]))
      .toEqual([['official-model', 13, 4], ['official-model', 29, 8]]);
    const next = output.result.content.lesson.artifacts;
    expect(next.map((item: {title: string}) => item.title)).toEqual([
      plantTitles[0], revisedTitles[2], plantTitles[2], revisedTitles[4],
    ]);
    expect(JSON.stringify(next[0])).toBe(unchanged[0]);
    expect(JSON.stringify(next[2])).toBe(unchanged[2]);
    expect(next[1].content.studio).toEqual({...artifacts[1].content.studio,
      page: {...artifacts[1].content.studio.page, title: revisedTitles[2]}});
    expect(next[3].content.studio).toEqual({...artifacts[3].content.studio,
      page: {...artifacts[3].content.studio.page, title: revisedTitles[4]}});
    expect(output.result.content.revisionMetadata).toMatchObject({
      mode: 'ordinary-slide-wording', pageIds: ['plant-2', 'plant-4'],
      renderEvidence: [{status: 'PASS', pageId: 'plant-2'}, {status: 'PASS', pageId: 'plant-4'}],
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'out-of-scope-patch'])(
    'returns no partial result or legacy turn when a later selected page fails (%s)', async failure => {
      const artifacts = plantDeck();
      const pagesSeen: number[] = [];
      const fetch = vi.fn(async (url, init) => {
        const page = assertScopedSlidePrompt(url, init, [2, 4]);
        pagesSeen.push(page);
        if (page === 4 && failure === 'unavailable') return new Response(null, {status: 503});
        return modelResponse({changes: [{
          op: 'set', path: [page === 4 ? 'speakerNotes' : 'title'], value: revisedTitles[page],
        }]});
      });
      vi.stubGlobal('fetch', fetch);
      const {POST} = await import('@/app/api/integration/jobs/execute/route');
      const response = await POST(request('artifact.revise', 'slide-wording', {
        artifactType: 'slide-deck', instruction: '只润色第2、4页的文字：让标题更明确',
        currentContent: {lesson: {artifacts}},
      }));
      const output = await response.json();
      expect(response.status, JSON.stringify(output)).toBe(failure === 'unavailable' ? 503 : 422);
      expect(pagesSeen[0]).toBe(2);
      expect(pagesSeen).toContain(4);
      expect(output.success).toBe(false);
      expect(output).not.toHaveProperty('result');
      expect(JSON.stringify(output)).not.toContain(revisedTitles[2]);
      expect(mocks.resolveModel).not.toHaveBeenCalled();
    },
  );

  it.each([
    '调整所有页面布局',
    '只润色第2、2页的文字：使标题更清楚',
    '只润色第2、5页的文字：使标题更清楚',
  ])('rejects an invalid wording selection without calling a provider (%s)', async instruction => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('artifact.revise', 'slide-wording', {
      artifactType: 'slide-deck', instruction, currentContent: {lesson: {artifacts: plantDeck()}},
    }));
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it.each([
    ['candidate.generate', 'candidate-plan', {artifactType: 'simulation'}],
    ['self.candidate.generate', 'candidate-plan', {artifactType: 'lesson-plan'}],
    ['material.enrich', '', {materialId: 'm1', revisionId: 'r1'}],
  ])('keeps unsupported %s outside the ordinary service', async (kind, scope, payload) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    await POST(request(kind, scope, payload));
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).toHaveBeenCalledOnce();
  });
});

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coursewareDesignSchema, coursewarePageSchema, coursewareSlideDataSchema } from '@/lib/courseware/schema';
import { compileCoursewareSlide } from '@/lib/courseware/compiler';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  call: vi.fn(), resolveModel: vi.fn(), generate: vi.fn(), review: vi.fn(),
  openCheckpoint: vi.fn(), recordUsage: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.call }));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/courseware/generation', () => ({ generateModernCourseware: mocks.generate }));
vi.mock('@/lib/courseware/content-review', () => ({ reviewAndRepairCourseware: mocks.review }));
vi.mock('@/lib/courseware/checkpoints', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/courseware/checkpoints')>();
  return {openCoursewareCheckpoint: (...args: Parameters<typeof actual.openCoursewareCheckpoint>) => {
    mocks.openCheckpoint(...args);
    return actual.openCoursewareCheckpoint(...args);
  }};
});
vi.mock('@/lib/courseware/quality', () => ({ summarizeCoursewareArtifacts: () => ({}) }));
vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: mocks.recordUsage }));
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  aiseceduInternalOrigin: () => 'http://ctfd',
  serviceTokenForInternalCall: () => 'integration-secret',
}));

const harnessEndpoint = 'http://fixture-harness.invalid:3081/v1/turn';
const job = {
  jobId: 'courseware-1',
  kind: 'artifact.materialize',
  scope: { ownerId: 1, dojoId: 2, moduleIndex: 0, teacherCourseware: true },
  modelRoute: { provider: 'deepseek', actual_model: 'standalone-model' },
  payload: {
    artifactId: 'artifact-1', artifactType: 'slide-deck', coursewareEngine: 'native-v2',
    requestPrompt: '制作一页关于蒸发的课堂课件', plan: {title: '蒸发', summary: '观察水的状态变化'},
  },
};

function request(body: Record<string, unknown>, secret = 'integration-secret', endpoint = 'execute') {
  return new NextRequest(`http://localhost/api/integration/jobs/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': secret },
    body: JSON.stringify(body),
  });
}

describe('teacher native courseware Harness job', () => {
  let checkpointDirectory: string | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://fixture-harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-secret');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'official-model');
    vi.stubEnv('COURSEWARE_GENERATOR', '');
    mocks.resolveModel.mockRejectedValue(new Error('legacy model fixture'));
  });
  afterEach(async () => {
    if (checkpointDirectory) await rm(checkpointDirectory, {recursive: true, force: true});
    checkpointDirectory = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the official text turn and preserves deployment artifacts and checkpoint identity on retry', async () => {
    checkpointDirectory = await mkdtemp(join(tmpdir(), 'formal-courseware-'));
    vi.stubEnv('COURSEWARE_CHECKPOINT_DIR', checkpointDirectory);
    const page = coursewarePageSchema.parse({
      schema: 'courseware-page-v2', id: 'page-1', title: '蒸发', objective: '观察液态水变成水蒸气',
      composition: 'split', role: 'opening', takeaway: '温度会影响蒸发快慢', durationSeconds: 60,
      visual: {kind: 'comparison', columns: ['冷水', '温水'], rows: [
        {label: '温度', values: ['较低', '较高']}, {label: '蒸发', values: ['较慢', '较快']},
      ]},
      speakerNotes: '用等量的水和同样大小的碟子对比蒸发。先让学生解释自己预测的依据，再观察温度不同但容器和气流相同的两组现象。'.repeat(2),
    });
    const artifacts = [{ content: { studio: { page } } }];
    const design = coursewareDesignSchema.parse({
      schema: 'courseware-design-v2', title: '蒸发课', audience: '初中学生',
      promise: '观察水的状态变化', objectives: [page.objective],
      theme: {name: '课堂', background: '#ffffff', foreground: '#000000', muted: '#555555',
        accent: '#2222ee', secondary: '#005544', surface: '#cccccc'},
      pages: [{id: page.id, title: page.title, role: page.role, composition: page.composition,
        visualKind: page.visual.kind, objectiveIndexes: [0], durationSeconds: 60,
        visualReason: '把两组温度与蒸发速度并列对照', teachingAction: '请每组先写出预测再记录观察事实'}],
    });
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(harnessEndpoint);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fixture-secret');
      const {messages, ...rest} = JSON.parse(init.body);
      expect(rest).toEqual({});
      expect(messages).toEqual([
        {role: 'system', content: expect.stringContaining('只生成普通课堂课件')},
        {role: 'user', content: '课堂页面文本'},
      ]);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({text: JSON.stringify(page), model: 'official-model', usage: {
        prompt_tokens: 11, completion_tokens: 7, total_tokens: 18,
      }});
    });
    vi.stubGlobal('fetch', fetch);
    const preservedPage = {value: page, attempts: 1, evidence: {frames: [{}]}};
    mocks.generate.mockImplementation(async input => {
      if (!input.checkpoint.pages[page.id]) {
        expect(JSON.parse(await input.aiCall('验证页面 JSON', '课堂页面文本'))).toEqual(page);
        await input.checkpoint.saveDesign(design);
        await input.checkpoint.savePage(preservedPage);
      }
      expect(input.checkpoint.design).toEqual(design);
      expect(input.checkpoint.pages[page.id]).toEqual(preservedPage);
      return { design, artifacts, quality: {renderEvidence: [{}]} };
    });
    mocks.review.mockImplementation(async input => {
      expect(input.checkpoint.pages[page.id]).toEqual(preservedPage);
      return { design: input.design, artifacts: input.artifacts, review: {status: 'passed'}, finalRenderEvidence: {} };
    });

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const initial = await POST(request(job));
    const initialBody = await initial.json();
    expect(initial.status, JSON.stringify(initialBody)).toBe(200);
    expect(initialBody.model).toMatchObject({actualModel: 'official-model', executionMode: 'courseware-harness',
      usage: {inputTokens: 11, outputTokens: 7, totalTokens: 18}});
    expect(initialBody.result.content.lesson.artifacts).toEqual(artifacts);
    expect(initialBody.result.validation.quality.contentReview).toEqual({status: 'passed'});
    const retry = await POST(request(job));
    expect(retry.status).toBe(200);
    expect((await retry.json()).result.content.lesson.artifacts).toEqual(artifacts);
    expect(mocks.openCheckpoint.mock.calls[0][0]).toEqual(mocks.openCheckpoint.mock.calls[1][0]);
    expect(mocks.openCheckpoint.mock.calls[0][0]).toMatchObject({artifactId: 'artifact-1', model: 'deepseek:official-model'});
    expect(await readdir(checkpointDirectory)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  }, 15_000);

  it('recomposes a saved five-page ordinary teaching deck into eight static pages using Harness', async () => {
    const theme = {name: '课堂', background: '#ffffff', foreground: '#000000', muted: '#555555',
      accent: '#2222ee', secondary: '#005544', surface: '#cccccc'};
    const makeSlide = (number: number) => {
      const title = `观察植物第 ${number} 页`;
      const studio = coursewareSlideDataSchema.parse({theme, assets: [], page: {
        schema: 'courseware-page-v2', id: `page-${number}`, title, role: 'opening', composition: 'wide',
        durationSeconds: 60, takeaway: '依据观察比较条件', objective: '了解光照对植物的影响',
        layout: {
          title: {box: {left: 30, top: 28, width: 940, height: 60}, fontSize: 32},
          takeaway: {box: {left: 30, top: 98, width: 940, height: 45}, fontSize: 22},
          supporting: [], visual: {left: 40, top: 155, width: 920, height: 360},
        },
        visual: {kind: 'comparison', columns: ['明处', '暗处'], rows: [
          {label: '环境', values: ['阳光充足', '光照较少']}, {label: '生长', values: ['待观察', '待记录']},
        ]}, speakerNotes: 'PRIVATE TEACHER NOTES '.repeat(5),
      }});
      return {id: `slide-${number}`, title, order: number, type: 'slide',
        outline: {title, type: 'slide'}, content: {...compileCoursewareSlide(studio), studio}};
    };
    const source = Array.from({length: 5}, (_, index) => makeSlide(index + 1));
    const revised = Array.from({length: 8}, (_, index) => makeSlide(index + 1));
    const design = {title: '植物生长', promise: '比较不同条件下的植物生长',
      pages: revised.map(slide => ({id: slide.content.studio.page.id}))};
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(harnessEndpoint);
      expect(init.body).not.toMatch(/PRIVATE|data:image/);
      expect(Object.keys(JSON.parse(init.body))).toEqual(['messages']);
      return Response.json({text: '{}', model: 'official-model',
        usage: {prompt_tokens: 8, completion_tokens: 2}});
    });
    vi.stubGlobal('fetch', fetch);
    mocks.generate.mockImplementation(async input => {
      expect(input).toMatchObject({staticTeaching: true, pageRequirement: {min: 8, max: 8}});
      expect(input.resolveImage).toBeUndefined();
      expect(input.plan.priorTeachingPages).toHaveLength(5);
      await input.aiCall('生成普通课堂结构', JSON.stringify(input.plan));
      return {design, artifacts: revised, quality: {renderEvidence: revised.map(slide => ({pageId: slide.content.studio.page.id}))}};
    });
    mocks.review.mockImplementation(async input => {
      await input.aiCall('复核普通课堂课件', '复核光照观察');
      return {design, artifacts: revised, review: {status: 'passed'}, finalRenderEvidence: {}};
    });
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(request({...job, kind: 'artifact.revise',
      scope: {ownerId: 1, dojoId: 2, ordinaryTeaching: 'deck-revision'},
      modelRoute: {provider: 'deepseek', actual_model: 'official-model', required_model: 'official-model', allow_degraded: false},
      payload: {artifactId: 'artifact-1', artifactType: 'slide-deck', revisionBackend: 'ordinary-deck-revision',
        expectedRevision: 4, instruction: '请把这份植物生长课件扩成 8 页',
        currentContent: {lesson: {id: 'lesson-1', title: '植物生长', artifacts: source}}},
    }, undefined, 'ordinary-deck-revision'));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(output.result.content.lesson).toMatchObject({id: 'lesson-1'});
    expect(output.result.content.lesson.artifacts).toHaveLength(8);
    expect(output.result.content.revisionMetadata).toMatchObject({mode: 'ordinary-deck-revision', recomposed: true});
    expect(output.model).toMatchObject({actualModel: 'official-model', usage: {totalTokens: 20}});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it.each([
    ['personal workspace', {payload: {...job.payload, workspaceId: 'student'}}],
    ['unattested course', {scope: {...job.scope, teacherCourseware: false}}],
    ['student candidate', {kind: 'self.candidate.generate'}],
    ['other artifact type', {payload: {...job.payload, artifactType: 'simulation'}}],
    ['required model differs', {modelRoute: {...job.modelRoute, required_model: 'required-model'}}],
  ])('does not send %s to the official courseware turn', async (_label, fields) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    await POST(request({...job, ...fields}));
    expect(mocks.resolveModel).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});

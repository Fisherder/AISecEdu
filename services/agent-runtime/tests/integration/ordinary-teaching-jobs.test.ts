import { createHash } from 'node:crypto';
import { ordinaryDeckPageRequirement } from '@/lib/server/agent-harness/ordinary-deck-revision';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postLessonPlan } from '@/app/api/integration/jobs/ordinary-lesson-plan/route';
import { coursewareSlideDataSchema } from '@/lib/courseware/schema';
import { compileCoursewareSlide } from '@/lib/courseware/compiler';
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
const request = (kind: string, ordinaryTeaching: string, payload: Record<string, unknown>, token = 'integration-secret', model = job.modelRoute.actual_model, requiredModel?: string, endpoint = 'execute') => {
  const lessonPin = endpoint === 'ordinary-lesson-plan' ? {
    route: kind === 'candidate.generate' ? 'upstream-lesson-plan-candidate' : 'upstream-lesson-plan-materialize',
    allow_degraded: false,
  } : {};
  const layoutPin = ordinaryTeaching === 'slide-layout' ? {
    route: 'upstream-ordinary-slide-layout', allow_degraded: false,
    degraded: false, request_hash: 'a'.repeat(64),
  } : {};
  const scope = ordinaryTeaching === 'slide-layout' ? {...job.scope, dojoId: -2, moduleIndex: 0} : job.scope;
  return new NextRequest(`http://localhost/api/integration/jobs/${endpoint}`, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': token},
    body: JSON.stringify({...job, kind, modelRoute: {...job.modelRoute, actual_model: model, required_model: requiredModel, ...lessonPin, ...layoutPin},
      scope: {...scope, ordinaryTeaching}, payload}),
  });
};
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

it('centers static slide headers vertically without shifting the comparison body', () => {
  const [{content: {studio}}] = plantDeck();
  const {elements} = compileCoursewareSlide(studio);
  const find = (id: string) => elements.find(element => element.id === id);
  expect(find('page-title')).toMatchObject({...studio.page.layout!.title.box, vAlign: 'middle'});
  expect(find('column-0')).toMatchObject({type: 'text', vAlign: 'middle'});
  expect(find('column-1')).toMatchObject({type: 'text', vAlign: 'middle'});
  expect(find('page-promise')).not.toHaveProperty('vAlign');
  expect(find('criterion-0')).not.toHaveProperty('vAlign');
  expect(find('comparison-0-0')).not.toHaveProperty('vAlign');
});

describe('ordinary teaching worker service routes', () => {
  let layoutCheckpointDirectory: string;
  beforeEach(async () => {
    vi.resetAllMocks();
    layoutCheckpointDirectory = await mkdtemp(join(tmpdir(), 'ordinary-layout-checkpoint-'));
    vi.stubEnv('COURSEWARE_CHECKPOINT_DIR', layoutCheckpointDirectory);
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://fixture-harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-secret');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'official-model');
    mocks.resolveModel.mockRejectedValue(new Error('legacy route fixture'));
    mocks.inspectRendered.mockImplementation(async studio => ({
      issues: [], evidence: {
        status: 'PASS', pageId: studio.page.id, mode: 'headless-chromium-dom-and-pixels',
        sourceSha256: createHash('sha256').update(JSON.stringify(studio)).digest('hex'),
        inspectedAt: '2026-01-01T00:00:00Z',
        frames: [{step: -1, screenshotSha256: 'b'.repeat(64)}],
      },
    }));
  });
  afterEach(async () => {
    await rm(layoutCheckpointDirectory, {recursive: true, force: true});
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const planOutput = {sections: [{title: '水的状态变化', explanation: '根据观察记录比较两组水量的变化。',
    takeaways: ['比较条件与证据', '保持其他条件一致']}]};
  const materializeRequest = (overrides: Record<string, unknown> = {}, model = 'official-model', token = 'integration-secret', requiredModel: string | null = model) => {
    const coverage = {complete: true, expectedMaterialCount: 1, materialIds: ['material-one']};
    return request('artifact.materialize', 'lesson-plan-materialize', {
      artifactType: 'lesson-plan', artifactId: 'lesson-one', candidateSetId: 'candidate-set-one', expectedRevision: 2,
      title: '温度与蒸发', requestPrompt: '复用所选大纲的对照观察',
      plan: {
        ...lessonCandidate.candidate.content, experience: {mode: 'ordinary-teaching-plan'},
        outline: [{...lessonCandidate.candidate.content.outline[0], speakerNotes: 'PRIVATE speaker notes'}],
        sourceGrounding: [{materialId: 'material-one', uses: ['观察水量变化']}],
        privateSolution: 'PRIVATE answer',
      },
      materialContext: coverage,
      materialDossier: {coverage, materials: [{id: 'material-one', title: '课堂观察记录',
        analysis: {summary: '两组水量的变化可用于课堂比较。', private: 'PRIVATE analysis'},
        coverage: {complete: true}, excerpts: ['PRIVATE excerpt'], filename: 'PRIVATE filename'}]},
      ...overrides,
    }, token, model, requiredModel ?? undefined, 'ordinary-lesson-plan');
  };

  it('materializes the approved lesson plan as native slides with actual usage and safe source summaries', async () => {
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(harness);
      const {messages, ...rest} = JSON.parse(init.body);
      expect(rest).toEqual({});
      expect(messages.map((message: {role: string}) => message.role)).toEqual(['system', 'user']);
      expect(init.body).not.toContain('PRIVATE');
      expect(JSON.parse(messages[1].content)).toMatchObject({
        title: '温度与蒸发',
        requestPrompt: '复用所选大纲的对照观察',
        sources: [{materialId: 'material-one', title: '课堂观察记录', summary: '两组水量的变化可用于课堂比较。'}],
      });
      return modelResponse(planOutput);
    });
    vi.stubGlobal('fetch', fetch);
    const response = await postLessonPlan(materializeRequest());
    expect(response.status).toBe(200);
    const completed = await response.json();
    expect(completed).toMatchObject({
      success: true,
      result: {
        content: {
          schema: 'aisecedu.global-agent.artifact.v1', artifactType: 'lesson-plan', renderer: 'agent-runtime-stage',
          lesson: {id: 'lesson-one', title: '温度与蒸发', artifacts: [{type: 'slide', title: '水的状态变化',
            content: {elements: [{type: 'text'}]}}]},
        },
        validation: {status: 'GENERATED', artifactCount: 1, fallbackCount: 0,
          materialGrounding: {complete: true, materialIds: ['material-one']}},
      },
      model: {provider: 'deepseek', actualModel: 'official-model', executionMode: 'lesson-plan-harness',
        usage: {inputTokens: 10, outputTokens: 5, totalTokens: 15}},
    });
    expect(JSON.stringify(completed)).not.toContain('PRIVATE');
    expect(completed.result.content.lesson).not.toHaveProperty('subjectProfile');
    expect(completed.model.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.usage).toHaveBeenCalledOnce();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects unauthorized, cross-scope, and unpinned lesson plans without reaching a model', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await postLessonPlan(materializeRequest({}, 'official-model', 'wrong-secret'))).status).toBe(401);
    for (const payload of [{expectedRevision: 0}, {workspaceId: 'lab'}, {artifactType: 'slide-deck'}, {plan: {}},
      {materialContext: {complete: true, expectedMaterialCount: 1, materialIds: ['other-course']}}, {requestPrompt: '请复现漏洞利用'}]) {
      expect((await postLessonPlan(materializeRequest(payload))).status).toBe(422);
    }
    expect((await postLessonPlan(materializeRequest({}, 'old-model'))).status).toBe(503);
    expect((await postLessonPlan(materializeRequest({}, 'official-model', 'integration-secret', null))).status).toBe(503);
    expect((await postLessonPlan(materializeRequest({}, 'official-model', 'integration-secret', 'old-model'))).status).toBe(503);
    vi.stubEnv('DOJO_AI_ENABLED', 'false');
    expect((await postLessonPlan(materializeRequest())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('withholds invalid content and rejects model responses with no measured usage', async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(async () => modelResponse({sections: [{...planOutput.sections[0], title: '更换大纲'}]}))
      .mockImplementationOnce(async () => modelResponse({sections: [{...planOutput.sections[0], explanation: '<script>'}]}))
      .mockImplementationOnce(async () => Response.json({model: 'official-model', text: JSON.stringify(planOutput)}));
    vi.stubGlobal('fetch', fetch);
    for (const status of [422, 422, 503]) {
      const response = await postLessonPlan(materializeRequest());
      expect(response.status).toBe(status);
      expect(await response.json()).not.toHaveProperty('result');
    }
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  const candidateRequest = (payload: Record<string, unknown> = {}) =>
    request('candidate.generate', 'candidate-plan', {
      artifactType: 'lesson-plan', candidateSetId: 'candidate-one', generationReason: 'teacher_requested_ordinary_lesson_plan',
      ordinaryCandidateModel: 'official-model', prompt: '设计一节蒸发教案', candidateCount: 1,
      materialContext: {complete: true, expectedMaterialCount: 0},
      ...payload,
    }, 'integration-secret', 'official-model', 'official-model', 'ordinary-lesson-plan');

  it('sends only the teacher request, validated blueprint, and selected summaries on every pinned candidate turn', async () => {
    const coverage = {complete: true, expectedMaterialCount: 1, materialIds: ['material-one'], notes: 'PRIVATE COVERAGE'};
    const material = {id: 'material-one', revisionId: 'revision-one', sha256: 'a'.repeat(64),
      title: '课堂观察记录', coverage: {complete: true}, filename: 'PRIVATE FILENAME',
      analysis: {summary: '两组水量的变化可用于课堂比较。', functionalPoints: ['PRIVATE POINT']},
      excerpts: [{content: 'PRIVATE RAW EXCERPT', locator: {text: 'PRIVATE LOCATOR'}}]};
    const sourceRef = {type: 'material', id: material.id, revisionId: material.revisionId, sha256: material.sha256,
      ownerName: 'PRIVATE OWNER', uri: 'PRIVATE URI'};
    const sourcedCandidate = {candidate: {...lessonCandidate.candidate,
      content: {...lessonCandidate.candidate.content, sourceGrounding: [{materialId: material.id, uses: ['比较水量变化']}]}}};
    const injectedBlueprint = {blueprint: {...blueprint.blueprint, history: 'PRIVATE BLUEPRINT HISTORY'}};
    const injectedCandidate = {candidate: {...sourcedCandidate.candidate, tool: 'PRIVATE MODEL TOOL'}};
    const fetch = vi.fn(async (_url: unknown, _init: {body: string}): Promise<Response> => new Response(null, {status: 500}))
      .mockResolvedValueOnce(modelResponse(injectedBlueprint))
      .mockResolvedValueOnce(modelResponse(blueprint))
      .mockResolvedValueOnce(modelResponse(injectedCandidate))
      .mockResolvedValueOnce(modelResponse(sourcedCandidate));
    vi.stubGlobal('fetch', fetch);
    const payload = {
      materialContext: coverage, materialDossier: {coverage, materials: [material], private: 'PRIVATE DOSSIER'},
      sourceRefs: [sourceRef, {type: 'other', value: 'PRIVATE OTHER REF'}],
      sourceMaterials: [{id: 'unapproved-material', summary: 'PRIVATE UNSCOPED SOURCE'}],
      courseContext: {value: 'PRIVATE COURSE'}, constraints: ['PRIVATE CONSTRAINTS'], personal: {name: 'PRIVATE USER'},
      sourceCandidates: ['PRIVATE PREVIOUS CANDIDATE'], context: {history: ['PRIVATE HISTORY']},
      tools: ['PRIVATE TOOL'],
    };
    const response = await postLessonPlan(candidateRequest(payload));
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.model).toMatchObject({actualModel: 'official-model', usage: {inputTokens: 40, outputTokens: 20, totalTokens: 60}});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [index, [url, init]] of fetch.mock.calls.entries()) {
      expect(String(url)).toBe(harness);
      expect(init.body).not.toMatch(/PRIVATE|unapproved-material|revision-one|aaaaaaaaaaaaaaaa/);
      const packet = JSON.parse(init.body);
      expect(Object.keys(packet)).toEqual(['messages']);
      expect(packet.messages.map((message: {role: string}) => message.role)).toEqual(['system', 'user']);
      const user = JSON.parse(packet.messages[1].content);
      expect(user).toEqual({
        request: '设计一节蒸发教案',
        sources: [{materialId: material.id, title: material.title, summary: material.analysis.summary}],
        ...(index >= 2 ? {ordinal: 1, blueprint: {
          title: blueprint.blueprint.title, summary: blueprint.blueprint.summary,
          strategy: blueprint.blueprint.strategy, variant: blueprint.blueprint.variant,
          objectives: blueprint.blueprint.objectives, outline: blueprint.blueprint.outline, assessment: blueprint.blueprint.assessment,
        }} : {}),
      });
    }
    expect((await postLessonPlan(candidateRequest({...payload, sourceRefs: []}))).status).toBe(422);
    expect((await postLessonPlan(candidateRequest({...payload, sourceRefs: [{...sourceRef, revisionId: 'other-revision'}]}))).status).toBe(422);
    expect((await postLessonPlan(candidateRequest({...payload, materialDossier: {coverage, materials: [
      material, {...material, id: 'unapproved-material'},
    ]}}))).status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('supports a pinned candidate without materials and rejects missing, zero or mismatched model receipts', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(modelResponse(blueprint))
      .mockResolvedValueOnce(modelResponse(lessonCandidate))
      .mockResolvedValueOnce(Response.json({text: JSON.stringify(blueprint), model: 'official-model'}))
      .mockResolvedValueOnce(Response.json({text: JSON.stringify(blueprint), model: 'official-model',
        usage: {prompt_tokens: 0, completion_tokens: 0}}))
      .mockResolvedValueOnce(modelResponse(blueprint))
      .mockResolvedValueOnce(Response.json({text: JSON.stringify(lessonCandidate), model: 'wrong-model',
        usage: {prompt_tokens: 10, completion_tokens: 5}}))
      .mockResolvedValueOnce(Response.json({text: JSON.stringify(blueprint),
        usage: {prompt_tokens: 10, completion_tokens: 5}}));
    vi.stubGlobal('fetch', fetch);
    expect((await postLessonPlan(candidateRequest())).status).toBe(200);
    for (let index = 0; index < 4; index++) {
      const response = await postLessonPlan(candidateRequest());
      expect(response.status).toBe(503);
      expect(await response.json()).not.toHaveProperty('result');
    }
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects an overlong teacher request before calling the pinned model', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await postLessonPlan(candidateRequest({prompt: '教'.repeat(4001)}));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({errorCode: 'ORDINARY_LESSON_PLAN_REQUEST_TOO_LONG', error: expect.stringContaining('4000')});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('withholds candidates whose outline and text exceed the materialization schema', async () => {
    const tooManySections = {candidate: {...lessonCandidate.candidate, content: {...lessonCandidate.candidate.content,
      outline: Array.from({length: 31}, (_, index) => ({...lessonCandidate.candidate.content.outline[0], title: `小节 ${index + 1}`}))}}};
    const oversizedObjective = {candidate: {...lessonCandidate.candidate, content: {...lessonCandidate.candidate.content,
      objectives: ['水'.repeat(301)]}}};
    const fetch = vi.fn()
      .mockResolvedValueOnce(modelResponse(blueprint))
      .mockResolvedValueOnce(modelResponse(tooManySections))
      .mockResolvedValueOnce(modelResponse(oversizedObjective));
    vi.stubGlobal('fetch', fetch);
    const response = await postLessonPlan(candidateRequest());
    expect(response.ok).toBe(false);
    expect(await response.json()).not.toHaveProperty('result');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('keeps the dedicated worker URL private and rejects every unpinned or mismatched job before dispatch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {integratedSessionApiAllowed} = await import('@/middleware');
    const base = await candidateRequest().json();
    const url = 'http://localhost/api/integration/jobs/ordinary-lesson-plan';
    const candidatePin = {generationReason: base.payload.generationReason, ordinaryCandidateModel: 'official-model'};
    const internal = (body: unknown, authenticated = true, endpoint = url) => new NextRequest(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json', accept: 'application/x-ndjson',
        ...(authenticated ? {'X-AISecEdu-Service-Token': 'integration-secret'} : {})},
      body: JSON.stringify(body),
    });
    expect(integratedSessionApiAllowed(new URL(url).pathname, 'POST')).toBe(false);
    expect((await postLessonPlan(internal(base, false))).status).toBe(401);
    expect((await postLessonPlan(internal(null))).status).toBe(400);
    const mismatches = [
      {...base, kind: 'material.analyze'},
      {...base, kind: 'artifact.materialize'},
      {...base, scope: {...base.scope, ordinaryTeaching: 'lesson-plan-materialize'}},
      {...base, scope: {...base.scope, ordinaryTeaching: undefined}},
      {...base, scope: undefined, payload: {artifactType: 'lesson-plan'}},
      {...base, payload: {artifactType: 'lesson-plan'}},
      {...base, payload: {artifactType: 'lesson-plan', generationReason: candidatePin.generationReason}},
      {...base, payload: {artifactType: 'lesson-plan', ordinaryCandidateModel: 'official-model'}},
      {...base, payload: {...base.payload, artifactType: 'slide-deck'}},
      {...base, kind: 'artifact.materialize', scope: {...base.scope, ordinaryTeaching: 'lesson-plan-materialize'},
        payload: {...base.payload, ...candidatePin}},
    ];
    for (const malformed of mismatches) {
      const response = await postLessonPlan(internal(malformed));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({errorCode: 'INVALID_ORDINARY_LESSON_PLAN_JOB'});
    }
    const prefixed = await postLessonPlan(internal(mismatches[0], true, 'http://localhost/agent-runtime' + new URL(url).pathname));
    expect(prefixed.status).toBe(422);
    expect(await prefixed.json()).toMatchObject({errorCode: 'INVALID_ORDINARY_LESSON_PLAN_JOB'});
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('keeps pinned candidates and materialization off the generic executor', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    for (const dedicatedRequest of [candidateRequest(), materializeRequest()]) {
      const job = await dedicatedRequest.json();
      const execute = (body: unknown) => POST(new NextRequest(
        'http://localhost/api/integration/jobs/execute', {
          method: 'POST', headers: dedicatedRequest.headers, body: JSON.stringify(body),
        },
      ));
      const response = await execute(job);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({errorCode: 'INVALID_ORDINARY_LESSON_PLAN_JOB'});
      const routeOnly = await execute({...job, payload: {}, scope: {}});
      expect(routeOnly.status).toBe(422);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects a cross-route or degraded pin on the dedicated lesson plan endpoint', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const candidate = candidateRequest();
    const base = await candidate.json();
    for (const modelRoute of [
      {...base.modelRoute, route: 'upstream-lesson-plan-materialize'},
      {...base.modelRoute, allow_degraded: true},
    ]) {
      const response = await postLessonPlan(new NextRequest(candidate.url, {
        method: 'POST', headers: candidate.headers, body: JSON.stringify({...base, modelRoute}),
      }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({errorCode: 'ORDINARY_LESSON_PLAN_CANDIDATE_UNAVAILABLE'});
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  function mathLayoutDeck(legacyFirst = false) {
    return plantDeck().slice(0, 3).map((fixture, index) => {
      const title = ['分数比较', '等分练习', '数学复习'][index];
      const studio = coursewareSlideDataSchema.parse({
        ...fixture.content.studio,
        page: {
          ...fixture.content.studio.page,
          title,
          objective: '识别分母相同的分数',
          takeaway: '分母相同，分子大的分数更大',
          layout: index === 0 && legacyFirst ? undefined : {
            title: {box: {left: 32, top: 26, width: 600, height: 64}, fontSize: 34},
            takeaway: {box: {left: 32, top: 98, width: 750, height: 44}, fontSize: 22},
            supporting: [],
            visual: {left: 40, top: 160, width: 920, height: 355},
          },
          visual: {kind: 'comparison', columns: ['三分之一', '三分之二'],
            rows: [{label: '分母', values: ['3', '3']}, {label: '分子', values: ['1', '2']}]},
        },
      });
      const rendered = compileCoursewareSlide(studio);
      return {...fixture, title, content: {...fixture.content, ...rendered,
        studio: {...studio, privateMarker: 'PRIVATE STUDIO', page: {...studio.page, privateMarker: 'PRIVATE PAGE'}},
      }};
    });
  }

  const layoutJob = (artifacts: ReturnType<typeof mathLayoutDeck>, pageSelection: number[] | 'all',
    instruction = '将标题放到右上角', endpoint = 'ordinary-slide-layout', token = 'integration-secret') =>
    request('artifact.revise', 'slide-layout', {
      artifactType: 'slide-deck', revisionBackend: 'ordinary-slide-layout', artifactId: 'math-deck', expectedRevision: 4,
      pageSelection, instruction, currentContent: {lesson: {title: '分数课', artifacts}},
    }, token, 'official-model', 'official-model', endpoint);

  function deckRevisionRequest(artifacts: unknown[], instruction: string,
    endpoint = 'ordinary-deck-revision', deckOperation?: string, extraContent?: Record<string, unknown>,
    pageSelection?: unknown) {
    return new NextRequest(`http://localhost/api/integration/jobs/${endpoint}`, {
      method: 'POST',
      headers: {'X-AISecEdu-Service-Token': 'integration-secret', 'Content-Type': 'application/json'},
      body: JSON.stringify({...job, kind: 'artifact.revise',
        scope: {...job.scope, dojoId: -2, moduleIndex: null, ordinaryTeaching: 'deck-revision'},
        modelRoute: {route: 'upstream-ordinary-deck-revision', provider: 'deepseek',
          actual_model: 'official-model', required_model: 'official-model', allow_degraded: false,
          degraded: false, request_hash: 'a'.repeat(64)},
        payload: {artifactType: 'slide-deck', revisionBackend: 'ordinary-deck-revision', artifactId: 'math-deck',
          instruction, expectedRevision: 4, deckOperation, pageSelection, currentContent: {...extraContent, lesson: {id: 'lesson-a', title: '分数课', artifacts}},
          sourceSnippet: 'PRIVATE SOURCE SELECTION'},
      }),
    });
  }

  const paletteInstruction = '请将整个课件换成蓝绿色主题';
  const palette = {
    background: '#102531', foreground: '#f0fff9', muted: '#b6d9ca',
    accent: '#51ebc3', secondary: '#85aaff', surface: '#255248',
  };

  function paletteDeck(themeByStorageIndex: Record<number, Partial<typeof palette>> = {}) {
    const deck = mathLayoutDeck();
    return deck.map((fixture, index) => {
      const {content} = fixture;
      const {studio} = content;
      const visual = index === 1 ? {
        kind: 'chart', chartType: 'bar', basis: '教学示例中的份数', unit: '份', illustrative: true,
        labels: ['第一组', '第二组'], series: [{name: '合计', values: [3, 6]}],
      } : index === 2 ? {
        kind: 'image', assetId: 'asset-3', alt: '分数组件教学配图观察', caption: '观察图片',
        annotations: [{label: '标注', x: 0.3, y: 0.4}],
      } : studio.page.visual;
      const source = coursewareSlideDataSchema.parse({
        ...studio, assets: index === 2 ? studio.assets : [], page: {...studio.page, visual},
        theme: {...studio.theme, ...themeByStorageIndex[index]},
      });
      const canvas = index === 0 ? coursewareSlideDataSchema.parse({...source, page: {
        ...source.page, layout: {...source.page.layout!,
          title: {...source.page.layout!.title, box: {...source.page.layout!.title.box, left: 60}},
        },
      }}) : source;
      const compiled = compileCoursewareSlide(canvas);
      return {...fixture, order: index === 0 ? 3 : index, content: {
        remark: content.remark, elements: compiled.elements, background: compiled.background,
        studio: {...source, privateMarker: 'PRIVATE STUDIO', page: {...source.page, privateMarker: 'PRIVATE PAGE'}},
      }};
    });
  }

  it('uses one color-only Harness turn and recolors a comparison, chart and image without changing saved content', async () => {
    const deck = paletteDeck();
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(harness);
      expect(init.body).not.toMatch(/PRIVATE|data:image|份数|分数课|plant-|3,6/);
      const {messages, ...rest} = JSON.parse(init.body);
      expect(rest).toEqual({});
      expect(messages.map(({role}: {role: string}) => role)).toEqual(['system', 'user']);
      const {name: _name, ...existingColors} = deck[0].content.studio.theme;
      expect(JSON.parse(messages[1].content)).toEqual({
        instruction: paletteInstruction, currentPalettes: [existingColors],
      });
      return modelResponse({palette});
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const coursewareDesign = {theme: deck[0].content.studio.theme, title: '分数课', pages: []};
    const response = await POST(deckRevisionRequest(deck, paletteInstruction, undefined, 'palette', {coursewareDesign}));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(output.model).toMatchObject({executionMode: 'ordinary-deck-revision', usage: {totalTokens: 15}});
    expect(output.result.content.coursewareDesign).toEqual({
      ...coursewareDesign, theme: {...coursewareDesign.theme, ...palette},
    });
    const artifacts: typeof deck = output.result.content.lesson.artifacts;
    const receipts: {
      renderEvidence: Array<{sourceSha256: string; frames: Array<{step: number}>}>;
    } = output.result.content.revisionMetadata;
    expect(artifacts.map(({id}) => id)).toEqual(deck.map(({id}) => id));
    expect(receipts).toMatchObject({
      mode: 'ordinary-deck-revision', operation: 'palette', recomposed: false,
      pageIds: ['plant-2', 'plant-3', 'plant-1'],
      renderEvidence: [{pageId: 'plant-2'}, {pageId: 'plant-3'}, {pageId: 'plant-1'}],
    });
    expect(mocks.inspectRendered).toHaveBeenCalledTimes(3);
    for (const [index, receipt] of receipts.renderEvidence.entries()) {
      const inspected = mocks.inspectRendered.mock.calls[index][0];
      expect(receipt.sourceSha256).toBe(createHash('sha256').update(JSON.stringify(inspected)).digest('hex'));
      expect(receipt.frames.map(({step}) => step)).toEqual([-1]);
    }
    for (const [index, artifact] of artifacts.entries()) {
      const old = deck[index].content;
      expect(artifact.content.studio).toEqual({...old.studio, theme: {...old.studio.theme, ...palette}});
      expect(artifact.content.remark).toEqual(old.remark);
      expect(artifact.content.background).toEqual({...old.background, color: palette.background});
    }
    const element = (index: number, id: string) => artifacts[index].content.elements.find(item => item.id === id);
    const oldTitle = deck[0].content.elements.find(item => item.id === 'page-title');
    expect(element(0, 'page-title')).toEqual({
      ...oldTitle, defaultColor: palette.foreground,
      content: oldTitle?.type === 'text' ? oldTitle.content.replace('#000000', palette.foreground) : undefined,
    });
    expect(element(0, 'table-header-rule')).toMatchObject({color: palette.accent});
    expect(element(1, 'evidence-chart')).toEqual({
      ...deck[1].content.elements.find(item => item.id === 'evidence-chart'),
      themeColors: [palette.accent, palette.secondary, palette.muted],
      textColor: palette.foreground, lineColor: palette.surface,
    });
    expect(element(2, 'verified-image')).toEqual(deck[2].content.elements.find(item => item.id === 'verified-image'));
    expect(element(2, 'image-label-backdrop-0')).toMatchObject({fill: palette.surface});
  });

  it('recolors only selected displayed pages and checks each with matching browser evidence', async () => {
    const deck = paletteDeck({2: {background: '#f4fff0'}});
    const instruction = '请将第3、1页换成蓝绿色主题';
    const coursewareDesign = {theme: deck[2].content.studio.theme, title: '分数课', pages: []};
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(harness);
      expect(init.body).not.toMatch(/PRIVATE|data:image|份数|分数课|plant-|3,6/);
      const {messages, ...rest} = JSON.parse(init.body);
      expect(rest).toEqual({});
      const {name: _name, ...selectedColors} = deck[1].content.studio.theme;
      expect(JSON.parse(messages[1].content)).toEqual({
        instruction,
        currentPalettes: [selectedColors],
      });
      return modelResponse({palette});
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(
      deck, instruction, undefined, 'palette', {coursewareDesign}, [3, 1],
    ));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    const {content} = output.result;
    const artifacts: typeof deck = content.lesson.artifacts;
    expect(content.coursewareDesign).toEqual(coursewareDesign);
    expect(artifacts.map(({id}) => id)).toEqual(deck.map(({id}) => id));
    expect(artifacts[2]).toEqual(deck[2]);
    for (const index of [0, 1]) {
      expect(artifacts[index].content.studio).toEqual({
        ...deck[index].content.studio, theme: {...deck[index].content.studio.theme, ...palette},
      });
    }
    expect(artifacts[0].content.elements.find(({id}) => id === 'page-title')).toMatchObject({
      left: 60, defaultColor: palette.foreground,
    });
    const evidence = mocks.inspectRendered.mock.calls.map(([studio]) => ({
      pageId: studio.page.id,
      sourceSha256: createHash('sha256').update(JSON.stringify(studio)).digest('hex'),
      frames: [{step: -1, screenshotSha256: 'b'.repeat(64)}],
    }));
    expect(mocks.inspectRendered).toHaveBeenCalledTimes(2);
    expect(evidence.map(({pageId}) => pageId)).toEqual(['plant-2', 'plant-1']);
    expect(content.revisionMetadata).toMatchObject({
      operation: 'palette', recomposed: false, pageIds: ['plant-2', 'plant-1'],
      renderEvidence: evidence,
    });
  });

  it('keeps the global theme even when a scoped palette explicitly lists every page', async () => {
    const deck = paletteDeck();
    const coursewareDesign = {theme: deck[0].content.studio.theme, pages: []};
    const fetch = vi.fn(async () => modelResponse({palette}));
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(
      deck, '请将第1、2、3页换成蓝绿色主题', undefined, 'palette', {coursewareDesign}, [1, 2, 3],
    ));
    expect(response.status).toBe(200);
    const {result} = await response.json();
    expect(result.content.coursewareDesign).toEqual(coursewareDesign);
    expect(result.content.revisionMetadata.pageIds).toEqual(['plant-2', 'plant-3', 'plant-1']);
    expect(mocks.inspectRendered).toHaveBeenCalledTimes(3);
  });

  it.each(
    [null, [], 'all', [0], [1, 1], [1.5], ['2'], [4]].map((pageSelection) => ({pageSelection})),
  )(
    'rejects invalid displayed page selection $pageSelection before any provider call',
    async ({pageSelection}) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
      const response = await POST(deckRevisionRequest(
        paletteDeck(), '请将第2页换成蓝绿色主题', undefined, 'palette', undefined, pageSelection,
      ));
      expect(response.status).toBe(422);
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.inspectRendered).not.toHaveBeenCalled();
    },
  );

  it('rejects a page selection on the same route without a pinned palette operation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(
      paletteDeck(), '请把整套课件的文字改得更清楚', undefined, undefined, undefined, [1],
    ));
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['extra response field', {palette, pageIds: ['plant-1']}],
    ['incomplete palette', {palette: {accent: palette.accent}}],
    ['low contrast', {palette: {...palette, foreground: palette.background}}],
  ])('rejects %s before browser inspection', async (_label, responseBody) => {
    const fetch = vi.fn(async () => modelResponse(responseBody));
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(paletteDeck(), paletteInstruction, undefined, 'palette'));
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty('result');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.inspectRendered).not.toHaveBeenCalled();
  });

  it('rejects a custom saved canvas before calling the model', async () => {
    const deck = paletteDeck();
    const title = deck[0].content.elements.find(({id}) => id === 'page-title');
    if (title?.type !== 'text') throw new Error('Missing fixture title');
    title.defaultColor = '#9b2c56';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(deck, paletteInstruction, undefined, 'palette'));
    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.inspectRendered).not.toHaveBeenCalled();
  });

  it('requires a matching browser receipt for every recolored page', async () => {
    mocks.inspectRendered.mockResolvedValueOnce({
      issues: [], evidence: {
        mode: 'headless-chromium-dom-and-pixels', sourceSha256: 'a'.repeat(64), inspectedAt: '2026-01-01',
        frames: [{step: -1, screenshotSha256: 'b'.repeat(64)}],
      },
    });
    const fetch = vi.fn(async () => modelResponse({palette}));
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(paletteDeck(), paletteInstruction, undefined, 'palette'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('result');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('revises selected text through the official Harness while keeping unchanged pages and source bytes private', async () => {
    const deck = mathLayoutDeck();
    mocks.inspectRendered.mockResolvedValueOnce({issues: [], evidence: {
      mode: 'headless-chromium-dom-and-pixels', sourceSha256: 'a'.repeat(64),
      inspectedAt: '2026-01-01T00:00:00Z', frames: [{step: -1, screenshotSha256: 'b'.repeat(64)}],
    }});
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(harness);
      expect(init.body).not.toMatch(/PRIVATE|data:image/);
      const {messages, ...rest} = JSON.parse(init.body);
      expect(rest).toEqual({});
      const packet = JSON.parse(messages[1].content);
      return modelResponse(packet.pages ? {pageIds: ['plant-2']} :
        {changes: [{op: 'set', path: ['title'], value: '如何平均分'}]});
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(deck, '请把整套课件的文字改得更清楚'));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    expect(output.result.content.lesson.artifacts[0]).toEqual(deck[0]);
    expect(output.result.content.lesson.artifacts[1]).toMatchObject({title: '如何平均分',
      content: {studio: {page: {visual: deck[1].content.studio.page.visual, speakerNotes: deck[1].content.studio.page.speakerNotes}}}});
    expect(output.result.content.lesson.artifacts[2]).toEqual(deck[2]);
    expect(output.result.content.revisionMetadata).toMatchObject({mode: 'ordinary-deck-revision', recomposed: false,
      renderEvidence: [{pageId: 'plant-2'}]});
    expect(output.model).toMatchObject({actualModel: 'official-model', usage: {totalTokens: 30}});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it.each([
    '问一下，扩成8页可以吗？',
    '不要把课件扩成8页',
    '把课件改成3页',
  ])('keeps the source without calling the model when no revision is needed for %s', async instruction => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const response = await POST(deckRevisionRequest(mathLayoutDeck(), instruction));
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty('result');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects the generic endpoint, a source selection, and a wrong Harness model without a draft', async () => {
    const deck = mathLayoutDeck();
    const snapshot = JSON.stringify(deck);
    const fetch = vi.fn(async () => Response.json({text: '{"pageIds":["plant-2"]}', model: 'wrong-model',
      usage: {prompt_tokens: 1, completion_tokens: 1}}));
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const {POST: execute} = await import('@/app/api/integration/jobs/execute/route');
    expect((await execute(deckRevisionRequest(deck, '清楚解释分数', 'execute'))).status).toBe(422);
    expect((await POST(deckRevisionRequest(deck, '改写措辞\n仅修改当前版本 V4 中所选范围（源码第 2 行）：\nPRIVATE'))).status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
    const response = await POST(deckRevisionRequest(deck, '请把整套课件的文字改得更清楚'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('result');
    expect(JSON.stringify(deck)).toBe(snapshot);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects missing or degraded model pins for both static workers without a Harness call', async () => {
    const deck = mathLayoutDeck();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST: layout} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    const {POST: revise} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    for (const [handler, valid, errorCode] of [
      [layout, layoutJob(deck, [1]), 'ORDINARY_SLIDE_LAYOUT_UNAVAILABLE'],
      [revise, deckRevisionRequest(deck, paletteInstruction, undefined, 'palette'), 'ORDINARY_DECK_UNAVAILABLE'],
    ] as const) {
      const body = await valid.json();
      for (const modelPin of [
        {route: undefined}, {route: 'teaching-default'}, {allow_degraded: undefined},
        {allow_degraded: true}, {required_model: null}, {actual_model: 'legacy-model'},
      ]) {
        const response = await handler(new NextRequest(valid.url, {method: 'POST', headers: valid.headers,
          body: JSON.stringify({...body, modelRoute: {...body.modelRoute, ...modelPin}})}));
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({success: false, errorCode, failureCategory: 'service'});
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('blocks partial static revision pins at generic ingress and rejects cross-route worker dispatch', async () => {
    const deck = mathLayoutDeck();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST: execute} = await import('@/app/api/integration/jobs/execute/route');
    const {POST: layout} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    const {POST: revise} = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
    const layoutRequest = layoutJob(deck, [1]);
    const deckRequest = deckRevisionRequest(deck, '请把整套课件的文字改得更清楚');
    expect((await layout(deckRequest)).status).toBe(422);
    expect((await revise(layoutRequest)).status).toBe(422);
    for (const [route, pin] of [
      ['upstream-ordinary-slide-layout', 'ordinarySlideLayout'],
      ['upstream-ordinary-deck-revision', 'ordinaryDeckRevision'],
    ]) {
      for (const partial of [
        {modelRoute: {...job.modelRoute, route}, payload: {artifactType: 'slide-deck'}},
        {modelRoute: job.modelRoute, payload: {artifactType: 'slide-deck', [pin]: null}},
      ]) {
        const request = new NextRequest('http://localhost/api/integration/jobs/execute', {
          method: 'POST', headers: layoutRequest.headers, body: JSON.stringify({...job, kind: 'artifact.revise', ...partial}),
        });
        expect((await execute(request)).status).toBe(422);
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  function layoutTurn(change: (layout: any, packet: any) => void) {
    return vi.fn(async (url, init) => {
      expect(String(url)).toBe(harness);
      expect(init.body).not.toMatch(/PRIVATE|分数|分母|数学|data:image/);
      const body = JSON.parse(init.body);
      expect(Object.keys(body)).toEqual(['messages']);
      expect(body.messages.map((item: {role: string}) => item.role)).toEqual(['system', 'user']);
      const packet = JSON.parse(body.messages[1].content);
      expect(Object.keys(packet).sort()).toEqual(['instruction', 'layout', 'lockedRegions', 'pageCount', 'pageNumber', 'role', 'visualKind']);
      change(packet.layout, packet);
      return modelResponse({layout: packet.layout});
    });
  }

  it('revises multiple math pages atomically and keeps manually positioned canvas geometry and unselected pages', async () => {
    const deck = mathLayoutDeck();
    const pinned = deck[0].content.elements.find(item => item.id === 'page-promise')!;
    pinned.left += 25;
    const fetch = layoutTurn((layout, packet) => {
      expect(packet.lockedRegions).toEqual(packet.pageNumber === 1 ? ['takeaway'] : []);
      layout.title.box = {left: 596, top: 24, width: 364, height: 64};
      layout.title.align = 'right';
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    const response = await POST(layoutJob(deck, [3, 1]));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    const content = output.result.content;
    expect(content.lesson.artifacts[1]).toEqual(deck[1]);
    const revised = content.lesson.artifacts[0];
    expect(revised.title).toBe(deck[0].title);
    expect(revised.content.studio.page).toMatchObject({title: deck[0].title, privateMarker: 'PRIVATE PAGE',
      visual: deck[0].content.studio.page.visual, speakerNotes: deck[0].content.studio.page.speakerNotes});
    expect(revised.content.elements.find((item: {id: string}) => item.id === 'page-promise')).toEqual(pinned);
    expect(revised.content.elements.find((item: {id: string}) => item.id === 'page-title')).toMatchObject({left: 596, top: 24});
    expect(content.revisionMetadata).toMatchObject({mode: 'ordinary-slide-layout', pageIds: ['plant-1', 'plant-3'],
      changedPageIds: ['plant-1', 'plant-3'], renderEvidence: [{pageId: 'plant-1'}, {pageId: 'plant-3'}]});
    expect(output.model).toMatchObject({executionMode: 'ordinary-slide-layout', actualModel: 'official-model',
      usage: {inputTokens: 20, outputTokens: 10, totalTokens: 30}});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.inspectRendered).toHaveBeenCalledTimes(2);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('revises the entire static deck including a legacy page with exact compiler geometry and original typography', async () => {
    const deck = mathLayoutDeck(true);
    expect(deck[0].content.studio.page.layout).toBeUndefined();
    const fetch = layoutTurn((layout) => {
      layout.title.box = {left: 594, top: 24, width: 365, height: 64};
      layout.title.align = 'right';
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    const response = await POST(layoutJob(deck, 'all'));
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    const revised = result.result.content.lesson.artifacts[0];
    expect(revised.content.studio.page.legacyCompositionTypography).toBe(true);
    expect(revised.content.elements.filter((item: {id: string}) => item.id !== 'page-title'))
      .toEqual(deck[0].content.elements.filter(item => item.id !== 'page-title'));
    expect(result.result.content.revisionMetadata.pageIds).toEqual(['plant-1', 'plant-2', 'plant-3']);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects raw selection text, off-route dispatch, and saved canvas conflicts without a model call', async () => {
    const deck = mathLayoutDeck();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    expect((await POST(layoutJob(deck, [1], '右上对齐', 'ordinary-slide-layout', 'wrong-secret'))).status).toBe(401);
    const {POST: execute} = await import('@/app/api/integration/jobs/execute/route');
    expect((await execute(layoutJob(deck, [1], '右上对齐', 'execute'))).status).toBe(422);
    for (const bad of ['右上对齐\n\n仅修改当前版本 V4 中所选范围（源码第 1 行），保留其余内容与交互：\nPRIVATE RAW',
      '右上对齐\n', '右上对齐，修改源码第 1 行']) {
      expect((await POST(layoutJob(deck, [1], bad))).status).toBe(422);
    }
    const title = deck[0].content.elements.find(item => item.id === 'page-title');
    if (title?.type !== 'text') throw new Error('Fixture title missing');
    title.rotate = 12;
    expect((await POST(layoutJob(deck, [1]))).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('withholds layout results for no-op, invalid geometry, and missing browser acceptance', async () => {
    const deck = mathLayoutDeck();
    const {POST} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    vi.stubGlobal('fetch', layoutTurn(() => {}));
    let response = await POST(layoutJob(deck, [1]));
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty('result');
    vi.stubGlobal('fetch', layoutTurn(layout => {layout.title.box.left = -2;}));
    response = await POST(layoutJob(deck, [1], '将标题移到左上角'));
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty('result');
    mocks.inspectRendered.mockRejectedValueOnce(new Error('browser unavailable'));
    vi.stubGlobal('fetch', layoutTurn(layout => {layout.title.align = 'right';}));
    response = await POST(layoutJob(deck, [1], '标题右对齐'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('result');
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('resumes the same ordered deck after browser outage without redelivering model proposals or verified pages', async () => {
    const [first, second, third] = mathLayoutDeck();
    const stored = [{...third, order: 5}, {...first, order: 0}, {...second, order: 5}];
    const fetch = layoutTurn(layout => {layout.title.align = 'right';});
    vi.stubGlobal('fetch', fetch);
    const inspect = mocks.inspectRendered.getMockImplementation()!;
    let fail = true;
    mocks.inspectRendered.mockImplementation(async (...args) => {
      if (fail && args[0].page.id === 'plant-3') throw new Error('synthetic temporary inspector outage');
      return inspect(...args);
    });
    const {POST} = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
    const failed = await POST(layoutJob(stored, [2, 3]));
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty('result');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.inspectRendered).toHaveBeenCalledTimes(2);
    fail = false;
    const retried = await POST(layoutJob(stored, [2, 3]));
    const result = await retried.json();
    expect(retried.status, JSON.stringify(result)).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.inspectRendered).toHaveBeenCalledTimes(3);
    expect(mocks.inspectRendered.mock.calls.at(-1)?.[0].page.id).toBe('plant-3');
    expect(result.model.usage).toEqual({inputTokens: 20, outputTokens: 10, totalTokens: 30});
    expect(result.result.content.revisionMetadata).toMatchObject({pageIds: ['plant-3', 'plant-2'],
      changedPageIds: ['plant-3', 'plant-2'], renderEvidence: [{pageId: 'plant-3'}, {pageId: 'plant-2'}]});
    expect(result.result.content.lesson.artifacts.map((artifact: {id: string}) => artifact.id))
      .toEqual(stored.map(artifact => artifact.id));
    expect(result.result.content.lesson.artifacts[1]).toEqual(stored[1]);
  });

  it('uses editor display numbering for wording with tied and reordered artifacts', async () => {
    const [first, second, third, fourth] = plantDeck();
    const stored = [{...fourth, order: 2}, {...first, order: 0}, {...third, order: 8}, {...second, order: 2}];
    const fetch = vi.fn(async (url, init) => {
      const page = assertScopedSlidePrompt(url, init, [4]);
      return modelResponse({changes: [{op: 'set', path: ['title'], value: revisedTitles[page]}]});
    });
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('artifact.revise', 'slide-wording', {artifactType: 'slide-deck',
      instruction: '只润色第2页的文字：把标题写成清晰的问题', currentContent: {lesson: {artifacts: stored}}}));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.result.content.revisionMetadata.pageIds).toEqual(['plant-4']);
    expect(result.result.content.lesson.artifacts[0].title).toBe(revisedTitles[4]);
    expect(result.result.content.lesson.artifacts.slice(1)).toEqual(stored.slice(1));
    expect(fetch).toHaveBeenCalledOnce();
  });

  const admittedTeacherJob = (
    kind: 'candidate.generate' | 'material.enrich',
    overrides: {scope?: Record<string, unknown>; route?: Record<string, unknown>; payload?: Record<string, unknown>} = {},
  ) => {
    const candidate = kind === 'candidate.generate';
    return new NextRequest('http://localhost/api/integration/jobs/ordinary-teaching', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': 'integration-secret'},
      body: JSON.stringify({...job, kind,
        scope: {...job.scope, ordinaryTeaching: candidate ? 'candidate-plan' : 'material-summary',
          ordinaryTeachingPinned: true, ...overrides.scope},
        modelRoute: {route: 'upstream-ordinary-teaching', provider: 'deepseek', actual_model: 'official-model',
          required_model: 'official-model', allow_degraded: false, ...overrides.route},
        payload: {...(candidate ? {artifactType: 'lesson-plan', candidateSetId: 'synthetic-set', prompt: '比较两组水量', candidateCount: 1}
          : {materialId: 'm1', revisionId: 'r1', filename: '蒸发讲义.txt', mimeType: 'text/plain'}), ...overrides.payload},
      }),
    });
  };

  it('keeps newly admitted materials and candidates on their pinned engine when the connection is unavailable', async () => {
    const {POST} = await import('@/app/api/integration/jobs/ordinary-teaching/route');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('DOJO_AI_ENABLED', 'false');
    for (const kind of ['candidate.generate', 'material.enrich'] as const) {
      const response = await POST(admittedTeacherJob(kind));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({success: false, errorCode: 'ORDINARY_TEACHING_HARNESS_UNAVAILABLE'});
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('requires matching route, scope and model on both sides of the ordinary teaching pin', async () => {
    const {POST} = await import('@/app/api/integration/jobs/ordinary-teaching/route');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const overrides of [{scope: {ordinaryTeachingPinned: false}}, {scope: {ordinaryTeaching: 'slide-wording'}},
      {route: {route: 'teaching-default'}}, {payload: {workspaceId: 'personal'}}, {scope: {ownerId: null}},
      {payload: {ordinaryTeachingPin: {scope: 'candidate-plan', model: 'other'}}}]) {
      expect((await POST(admittedTeacherJob('candidate.generate', overrides))).status).toBe(422);
    }
    for (const route of [{provider: 'other'}, {required_model: 'other'}, {actual_model: 'other'}, {allow_degraded: true}]) {
      expect((await POST(admittedTeacherJob('material.enrich', {route}))).status).toBe(503);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('returns the admitted model and measured receipts for ordinary candidates and rejects a partial receipt', async () => {
    const {POST} = await import('@/app/api/integration/jobs/ordinary-teaching/route');
    const fetch = vi.fn().mockResolvedValueOnce(modelResponse(blueprint)).mockResolvedValueOnce(modelResponse(lessonCandidate));
    vi.stubGlobal('fetch', fetch);
    const response = await POST(admittedTeacherJob('candidate.generate'));
    expect(response.status).toBe(200);
    expect((await response.json()).model).toMatchObject({modelVersion: 'deepseek:official-model', degraded: false,
      executionMode: 'ordinary-candidate-plan', usage: {inputTokens: 20, outputTokens: 10, totalTokens: 30}});
    fetch.mockReset();
    fetch.mockResolvedValueOnce(Response.json({text: JSON.stringify(blueprint), model: 'official-model', usage: {prompt_tokens: 10}}));
    const missing = await POST(admittedTeacherJob('candidate.generate'));
    expect(missing.status).toBe(503);
    expect((await missing.json()).errorCode).toBe('ORDINARY_TEACHING_HARNESS_UNAVAILABLE');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects marked jobs submitted to the historical generic route', async () => {
    const request = admittedTeacherJob('material.enrich');
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(new NextRequest('http://localhost/api/integration/jobs/execute', {
      method: 'POST', headers: request.headers, body: await request.text(),
    }));
    expect(response.status).toBe(422);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('summarizes the authorized extracted text without executing it and retains grounded chunk coverage', async () => {
    const analysis = { ...materialAnalysis, summary: '比较 1 < 3 > 2 中的三个数。' };
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
      return modelResponse({analysis});
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
    expect(output.result.analysis.summary).toBe(analysis.summary);
    expect(output.result.chunks[0].content).toBe(handout);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(() => ordinaryMaterialAnalysis(materialAnalysis, 0, 2)).toThrow('outside the supplied text');
    expect(() => ordinaryMaterialAnalysis({ ...analysis, summary: '<strong>课堂记录</strong>' }, 0, handout.length)).toThrow();
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

  it('inspects and preserves identifiable manual positions on a historical compiled canvas', async () => {
    const artifacts = plantDeck();
    const selected = artifacts[1];
    const baseline = compileCoursewareSlide(selected.content.studio);
    Object.assign(selected.content.studio, {authorNotes: 'STUDIO-PRIVATE-EXTENSION'});
    Object.assign(selected.content.studio.page, {authorNotes: 'PAGE-PRIVATE-EXTENSION'});
    Object.assign(selected.content.studio.assets[0], {attributionNotes: 'ASSET-PRIVATE-EXTENSION'});
    Object.assign(selected.content, {
      background: baseline.background,
      elements: baseline.elements.map(element => {
        if (element.type !== 'text') return element;
        const legacy = {...element};
        delete legacy.vAlign;
        if (legacy.id === 'page-title') legacy.left -= 4;
        return legacy;
      }),
    });
    const fetch = vi.fn(async () =>
      modelResponse({changes: [{op: 'set', path: ['title'], value: revisedTitles[2]}]}));
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('artifact.revise', 'slide-wording', {
      artifactType: 'slide-deck', instruction: '仅润色第2页措辞：把标题写成清晰的问题',
      currentContent: {lesson: {artifacts}},
    }));
    const output = await response.json();
    expect(response.status, JSON.stringify(output)).toBe(200);
    const revised = output.result.content.lesson.artifacts[1];
    expect(revised.content.studio.page.layout.title.box.left).toBe(26);
    expect(revised.content.elements.find((element: {id: string}) => element.id === 'page-title'))
      .toMatchObject({left: 26, vAlign: 'middle'});
    expect(mocks.inspectRendered).toHaveBeenCalledWith(expect.objectContaining({page: expect.objectContaining({
      layout: revised.content.studio.page.layout,
      title: revisedTitles[2],
    })}));
    expect(revised.content.studio.authorNotes).toBe('STUDIO-PRIVATE-EXTENSION');
    expect(revised.content.studio.page.authorNotes).toBe('PAGE-PRIVATE-EXTENSION');
    expect(revised.content.studio.assets[0].attributionNotes).toBe('ASSET-PRIVATE-EXTENSION');
    expect(JSON.stringify(fetch.mock.calls)).not.toContain('PRIVATE-EXTENSION');
    expect(revised.content.remark).toBe(selected.content.remark);
  });

  it.each(['manual text', 'custom element'])('retains the original revision when the canvas has %s', async edit => {
    const artifacts = plantDeck();
    const selected = artifacts[3];
    const baseline = compileCoursewareSlide(selected.content.studio);
    const elements = edit === 'manual text'
      ? baseline.elements.map(element => element.type === 'text' && element.id === 'page-title'
        ? {...element, content: '<p>教师原生画布文字</p>'} : element)
      : [...baseline.elements, {...baseline.elements[0], id: 'teacher-extra'}];
    Object.assign(selected.content, {elements, background: baseline.background});
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {POST} = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request('artifact.revise', 'slide-wording', {
      artifactType: 'slide-deck', instruction: '仅润色第2、4页措辞：把标题写得更明确',
      currentContent: {lesson: {artifacts}},
    }));
    const output = await response.json();
    expect(response.status).toBe(409);
    expect(output).toMatchObject({success: false, errorCode: 'SLIDE_WORDING_CANVAS_CONFLICT', failureCategory: 'permanent'});
    expect(output).not.toHaveProperty('result');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.inspectRendered).not.toHaveBeenCalled();
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

describe('ordinary deck revisions require an affirmative whole-deck count', () => {
  it.each([
    '不要扩展到6页，只把标题改短',
    '不要改成6页，只调整文字',
    '只润色前2到4页的文字',
    '把标题改成“8页练习”',
    '请把标题改成8页练习',
    '问一下，扩成8页可以吗？',
    '请在说明中引用“把课件扩成8页”',
    '解释为什么把课件扩成8页',
    '把第2页的示例改成 8 页练习提纲',
  ])('keeps the existing deck size for %s', instruction => {
    expect(ordinaryDeckPageRequirement(instruction)).toBeUndefined();
  });

  it.each([
    ['请把这份植物生长课件从5页扩成8页', 8],
    ['请压缩成四页', 4],
    ['把课件扩成8页，不要改成6页', 8],
    ['总页数为6页', 6],
  ])('uses an explicit total in %s', (instruction, expected) => {
    expect(ordinaryDeckPageRequirement(instruction)).toMatchObject({min: expected, max: expected});
  });
});

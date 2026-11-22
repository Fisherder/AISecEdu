import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {POST} from '@/app/api/integration/jobs/ordinary-debate/route';
import { POST as postMixedJob } from '@/app/api/integration/jobs/execute/route';
import { ordinaryLessonCandidateInput } from '@/lib/server/agent-harness/ordinary-lesson-plan';
import {POST as postCandidate} from '@/app/api/integration/jobs/ordinary-debate-candidate/route';
import {generationFingerprint} from '@/lib/generation/durable-stage';

const mocks = vi.hoisted(() => ({resolveModel: vi.fn(), usage: vi.fn()}));
vi.mock('@/lib/server/resolve-model', () => ({resolveModel: mocks.resolveModel}));
vi.mock('@/lib/server/usage-storage', () => ({recordUsage: mocks.usage}));
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  aiseceduInternalOrigin: () => 'http://ctfd',
  serviceTokenForInternalCall: () => 'integration-secret',
}));

const debate = {
  schema: 'debate-v1', title: '午后借阅时间', motion: '图书馆应否延长开放时间',
  scenario: '学生会正在商议如何分配志愿者服务时段。', studentRole: '学生会代表',
  positions: {pro: '延长借阅时间让更多学生能够使用图书馆。', con: '保持开放时间可以降低志愿者负担。'},
  objectives: ['比较不同方案的影响', '根据需求解释判断'],
  rounds: [
    {id: 'opening', title: '陈述观点', task: '说明选择及依据。'},
    {id: 'evidence', title: '审视记录', task: '分析来访记录。'},
    {id: 'closing', title: '权衡方案', task: '提出可调整的计划。'},
  ],
  evidence: [
    {id: 'visit', title: '来访记录', content: '多数访问集中在放学时段。', source: '教学假设', kind: 'hypothetical'},
    {id: 'staff', title: '排班记录', content: '只有两名志愿者能晚留。', source: '教学假设', kind: 'hypothetical'},
  ],
  rubric: [
    {id: 'reason', title: '论证', description: '理由与提议相关。'},
    {id: 'support', title: '证据', description: '能够从记录中支持观点。'},
    {id: 'tradeoff', title: '权衡', description: '解释代价及可调整条件。'},
  ],
  reflectionPrompts: ['什么证据改变了你的选择？', '怎样分配有限的志愿者时间？'],
};
const designJob = {
  jobId: 'ordinary-debate-fixture', kind: 'artifact.materialize',
  scope: {ownerId: 7, dojoId: -2, moduleIndex: null, ordinaryTeaching: 'debate-authoring'},
  modelRoute: {route: 'ordinary-debate-harness', provider: 'deepseek', actual_model: 'official', required_model: 'official', allow_degraded: false},
  payload: {debateAuthoringBackend: 'ordinary-debate-harness-v1', artifactType: 'debate', artifactId: 'debate-id',
    expectedRevision: 1, requestPrompt: '设计一次课堂辩论，讨论图书馆开放时间。',
    plan: {title: '开放时间方案', type: 'debate', objectives: ['分析图书馆开放时间'], privateField: 'private-plan'},
    materialContext: {expectedMaterialCount: 1, complete: true, materialIds: ['material-1']},
    materialDossier: {coverage: {complete: true}, materials: [{id: 'material-1', title: '借阅简介',
      coverage: {complete: true}, analysis: {summary: '记下来访时间并统计借阅人数。'}, excerpts: ['private-excerpt']}]},
  },
};

function request(job: unknown, token = 'integration-secret', endpoint = 'ordinary-debate') {
  return new NextRequest(`http://localhost/api/integration/jobs/${endpoint}`, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': token}, body: JSON.stringify(job),
  });
}
function receipt(value: unknown, model = 'official', usage: unknown = {prompt_tokens: 23, completion_tokens: 17}) {
  return Response.json({text: JSON.stringify(value), model, usage});
}

const candidateCoverage = {complete: true, expectedMaterialCount: 1, materialIds: ['source-private-id']};
const candidateSource = {type: 'material', id: 'source-private-id', revisionId: 'revision-private-id', sha256: 'a'.repeat(64)};
const candidateJob = {
  ...designJob, kind: 'candidate.generate',
  scope: {...designJob.scope, ordinaryTeaching: 'candidate-plan'},
  modelRoute: {...designJob.modelRoute, route: 'upstream-ordinary-debate-candidate'},
  payload: {artifactType: 'debate', candidateSetId: 'candidate-private-id', candidateCount: 1, generationMode: 'single',
    generationReason: 'teacher_requested_ordinary_debate', ordinaryCandidateModel: 'official', prompt: designJob.payload.requestPrompt,
    materialContext: candidateCoverage, sourceRefs: [candidateSource], materialDossier: {
      coverage: candidateCoverage, materials: [{...candidateSource, title: '来访记录',
        analysis: {summary: '放学后学生更常来借书。'}, coverage: {complete: true}, excerpts: ['private-excerpt']}],
    }, conversation: ['private-history']},
};
const candidateBlueprint = {blueprint: {title: '图书馆开放时间', summary: '权衡开放时间与用人安排。',
  strategy: '从来访时间审视需求', variant: '证据比较', objectives: ['依据记录比较方案'],
  outline: [{title: '解释记录', purpose: '根据记录陈述需求。'}], assessment: ['引用记录'], safety: []}};
function candidateProposal(index: number) {
  const focus = ['来访需求', '用人安排', '开放时间', '学生反馈'][index - 1];
  return {candidate: {title: `讨论${focus}`, summary: `比较${focus}的不同意见。`, strategy: `以${focus}为比较重点`,
    differences: [`从${focus}切入`], recommendation: '适合小组讨论。', content: {type: 'debate',
      objectives: [`说明${focus}对各方的影响。`],
      outline: [{title: '提出观点', description: '用来访记录支持观点。', keyPoints: ['说明证据与观点的关系']}],
      activities: [{title: '质询', instruction: '选一个对方理由提出问题。'}], assessment: {criteria: ['解释证据']},
      sourceGrounding: [{materialId: 'material-1', uses: ['用统计记录对比来访时间']}],
    }}};
}
const requestCandidate = (job: unknown, token?: string, endpoint = 'ordinary-debate-candidate') =>
  request(job, token, endpoint);

describe('ordinary integrated debate authoring', () => {
  let checkpoint: string;
  const harness = vi.fn();
  beforeEach(async () => {
    checkpoint = await mkdtemp(join(tmpdir(), 'ordinary-debate-job-'));
    vi.stubEnv('DEBATE_CHECKPOINT_DIR', checkpoint);
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://synthetic-debate.invalid');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-harness-secret');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'official');
    vi.stubGlobal('fetch', harness);
    vi.clearAllMocks();
  });
  afterEach(async () => {
    harness.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(checkpoint, {recursive: true, force: true});
  });

  it.each([1, 2, 4])('generates exactly %i ordinary debate proposals from a bounded brief', async count => {
    const prompt = '请比较图书馆的开放时间。'.repeat(400);
    harness.mockImplementation(async (url, options) => {
      expect(String(url)).toBe('http://synthetic-debate.invalid/v1/turn');
      const {messages, ...extra} = JSON.parse(options.body);
      expect(extra).toEqual({});
      expect(messages.map((message: {role: string}) => message.role)).toEqual(['system', 'user']);
      expect(messages[0].content).toContain('只提供普通教学目标');
      expect(options.body).not.toMatch(/private-id|private-excerpt|private-history/);
      const context = JSON.parse(messages[1].content);
      expect(context).toMatchObject({request: prompt, sources: [
        {materialId: 'material-1', title: '来访记录', summary: '放学后学生更常来借书。'},
      ]});
      return receipt(context.ordinal ? candidateProposal(context.ordinal) : candidateBlueprint);
    });
    const payload = {...candidateJob.payload, prompt, candidateCount: count, generationMode: count === 1 ? 'single' : 'multiple'};
    const response = await postCandidate(requestCandidate({...candidateJob, payload}));
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.model).toMatchObject({provider: 'deepseek', actualModel: 'official', degraded: false,
      executionMode: 'ordinary-candidate-plan', usage: {inputTokens: 46 * count, outputTokens: 34 * count, totalTokens: 80 * count}});
    expect(body.result.candidates).toHaveLength(count);
    for (const {content} of body.result.candidates) {
      expect(content).toMatchObject({type: 'debate', experience: {mode: 'ordinary-teaching-plan'},
        sourceGrounding: [{materialId: candidateSource.id, uses: ['用统计记录对比来访时间']}]});
      expect(content).not.toHaveProperty('debate');
    }
    expect(harness).toHaveBeenCalledTimes(2 * count);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('requires the private debate proposal endpoint, teacher scope, complete material revisions and exclusive model pin', async () => {
    expect((await postCandidate(requestCandidate(candidateJob, 'bad-token'))).status).toBe(401);
    expect((await postMixedJob(requestCandidate(candidateJob, undefined, 'execute'))).status).toBe(422);
    for (const payload of [
      {...candidateJob.payload, artifactType: 'lesson-plan'}, {...candidateJob.payload, generationMode: 'multiple'},
      {...candidateJob.payload, candidateCount: '1'}, {...candidateJob.payload, generationReason: undefined},
      {...candidateJob.payload, ordinaryLessonPlanRevisionModel: 'official'},
      {...candidateJob.payload, sourceRefs: [{...candidateSource, revisionId: 'other-revision'}]},
      {...candidateJob.payload, prompt: '图'.repeat(16_001)}, {...candidateJob.payload, workspaceId: 'self'},
    ]) {
      expect((await postCandidate(requestCandidate({...candidateJob, payload}))).status).toBe(422);
    }
    for (const modelRoute of [
      undefined, {...candidateJob.modelRoute, route: 'execute'}, {...candidateJob.modelRoute, provider: 'other'},
      {...candidateJob.modelRoute, allow_degraded: true}, {...candidateJob.modelRoute, allow_degraded: undefined},
      {...candidateJob.modelRoute, actual_model: 'different'}, {...candidateJob.modelRoute, required_model: 'different'},
    ]) {
      expect((await postCandidate(requestCandidate({...candidateJob, modelRoute}))).status).toBe(503);
    }
    expect((await postCandidate(requestCandidate({...candidateJob, payload: {...candidateJob.payload, ordinaryCandidateModel: undefined}}))).status).toBe(503);
    expect(harness).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it.each([
    ['different', {prompt_tokens: 23, completion_tokens: 17}],
    ['official', {prompt_tokens: 23, completion_tokens: 0}],
    ['official', {prompt_tokens: 23}],
  ])('withholds proposals after a mismatched or unmeasured turn', async (model, usage) => {
    harness.mockResolvedValueOnce(receipt(candidateBlueprint, model, usage));
    const response = await postCandidate(requestCandidate(candidateJob));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('result');
    expect(harness).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects generated proposals that include executable instructions or change the cited sources', async () => {
    const {candidate} = candidateProposal(1);
    const outsideScope = {...candidate, content: {...candidate.content,
      sourceGrounding: [{materialId: 'unapproved-source', uses: ['引用来访次数']}]},
    };
    const unsafe = {...candidate, content: {...candidate.content,
      activities: [{title: '评论', instruction: '<script>sample</script>'}]},
    };
    harness.mockResolvedValueOnce(receipt(candidateBlueprint)).mockResolvedValueOnce(receipt({candidate: outsideScope}))
      .mockResolvedValueOnce(receipt({candidate: unsafe}));
    const response = await postCandidate(requestCandidate(candidateJob));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({errorCode: 'INVALID_ORDINARY_DEBATE_CANDIDATE_RESPONSE'});
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('serializes identical candidate requests and replays the exact result after reloading the route', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    harness.mockImplementationOnce(async () => {
      await gate;
      return receipt(candidateBlueprint);
    }).mockResolvedValueOnce(receipt(candidateProposal(1)));
    const first = postCandidate(requestCandidate(candidateJob));
    await vi.waitFor(() => expect(harness).toHaveBeenCalledTimes(1));
    const second = postCandidate(requestCandidate(candidateJob));
    release();
    const replies = await Promise.all([first, second]);
    expect(replies.map(response => response.status)).toEqual([200, 200]);
    const [generated, concurrent] = await Promise.all(replies.map(response => response.json()));
    expect(concurrent.result).toEqual(generated.result);
    expect(concurrent.model.usage).toEqual(generated.model.usage);
    expect(concurrent.model.responseHash).toBe(generated.model.responseHash);
    expect(harness).toHaveBeenCalledTimes(2);
    expect(mocks.usage).toHaveBeenCalledTimes(2);
    expect(await readdir(checkpoint)).toHaveLength(1);

    vi.resetModules();
    const {POST: restarted} = await import('@/app/api/integration/jobs/ordinary-debate-candidate/route');
    harness.mockRejectedValue(new Error('Harness is offline'));
    const response = await restarted(requestCandidate(candidateJob));
    expect(response.status).toBe(200);
    const replay = await response.json();
    expect(replay.result).toEqual(generated.result);
    expect(replay.model.usage).toEqual(generated.model.usage);
    expect(replay.model.responseHash).toBe(generated.model.responseHash);
    expect(harness).toHaveBeenCalledTimes(2);
    expect(mocks.usage).toHaveBeenCalledTimes(2);
  });

  it('separates completions by job, teacher scope, candidate set, exact brief, and material revision', async () => {
    const newVersion = {...candidateSource, revisionId: 'new-revision', sha256: 'b'.repeat(64)};
    const dossier = candidateJob.payload.materialDossier;
    const variants = [
      candidateJob,
      {...candidateJob, jobId: 'different-job'},
      {...candidateJob, scope: {...candidateJob.scope, ownerId: 12}},
      {...candidateJob, scope: {...candidateJob.scope, dojoId: 41}},
      {...candidateJob, scope: {...candidateJob.scope, moduleIndex: 2}},
      {...candidateJob, payload: {...candidateJob.payload, candidateSetId: 'different-set'}},
      {...candidateJob, payload: {...candidateJob.payload, prompt: '比较周末图书馆的开放时间'}},
      {...candidateJob, payload: {...candidateJob.payload, sourceRefs: [newVersion], materialDossier: {
        ...dossier, materials: [{...dossier.materials[0], ...newVersion}],
      }}},
      {...candidateJob, payload: {...candidateJob.payload, materialDossier: {
        ...dossier, materials: [{...dossier.materials[0], analysis: {summary: '学生周末早上来借书。'}}],
      }}},
    ];
    harness.mockImplementation(async (_url, {body}) => {
      const context = JSON.parse(JSON.parse(body).messages[1].content);
      return receipt(context.ordinal ? candidateProposal(context.ordinal) : candidateBlueprint);
    });
    for (const variant of variants) expect((await postCandidate(requestCandidate(variant))).status).toBe(200);
    expect(await readdir(checkpoint)).toHaveLength(variants.length);
    expect(harness).toHaveBeenCalledTimes(2 * variants.length);
    expect((await postCandidate(requestCandidate(candidateJob))).status).toBe(200);
    expect(harness).toHaveBeenCalledTimes(2 * variants.length);
  });

  it.each(['invalid-json', 'usage', 'content', 'result-digest'])('fails closed for a malformed %s checkpoint', async change => {
    harness.mockResolvedValueOnce(receipt(candidateBlueprint)).mockResolvedValueOnce(receipt(candidateProposal(1)));
    expect((await postCandidate(requestCandidate(candidateJob))).status).toBe(200);
    const [file] = await readdir(checkpoint);
    const path = join(checkpoint, file);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    const entry = saved.stages['workflow-debate-candidate-response'];
    if (change === 'usage') {
      entry.completion.usage.totalTokens += 1;
      entry.digest = generationFingerprint(entry.completion);
    } else if (change === 'content') {
      entry.completion.result.candidates[0].content.sourceGrounding[0].materialId = 'unselected-source';
      entry.digest = generationFingerprint(entry.completion);
    } else if (change === 'result-digest') {
      entry.completion.usage.totalTokens += 100;
      entry.completion.usage.outputTokens += 100;
    }
    await writeFile(path, change === 'invalid-json' ? '{' : JSON.stringify(saved));
    const replay = await postCandidate(requestCandidate(candidateJob));
    expect(replay.status).toBe(503);
    expect(await replay.json()).toMatchObject({errorCode: 'ORDINARY_DEBATE_CANDIDATE_UNAVAILABLE'});
    expect(harness).toHaveBeenCalledTimes(2);
    expect(mocks.usage).toHaveBeenCalledTimes(2);
  });

  it('generates ordinary text with measured usage and replays the validated checkpoint', async () => {
    harness.mockImplementationOnce(async (url, options) => {
      expect(String(url)).toBe('http://synthetic-debate.invalid/v1/turn');
      const {messages, ...extra} = JSON.parse(options.body);
      expect(extra).toEqual({});
      expect(messages.map((message: {role: string}) => message.role)).toEqual(['system', 'user']);
      expect(messages[0].content).toContain('只提供普通教学目标');
      expect(messages[1].content).not.toMatch(/private-plan|private-excerpt/);
      expect(messages[1].content).toContain('记下来访时间并统计借阅人数');
      return receipt(debate);
    });
    const response = await POST(request(designJob));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.content.lesson.artifacts[0].content.debate.schema).toBe('debate-v2');
    expect(body.model).toMatchObject({actualModel: 'official', executionMode: 'ordinary-debate-harness',
      usage: {inputTokens: 23, outputTokens: 17, totalTokens: 40}});
    const replay = await POST(request(designJob));
    expect(replay.status).toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.model.usage).toEqual(body.model.usage);
    expect(replayBody.model.responseHash).toEqual(body.model.responseHash);
    expect(replayBody.result).toEqual(body.result);
    expect(harness).toHaveBeenCalledTimes(1);
    expect(mocks.usage).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('revises v1 content into a verified v2 patch and keeps only historical paths in the prompt', async () => {
    const patch = {summary: '将首轮任务聚焦来访需求。', operations: [
      {op: 'set', path: '/rounds/@opening/task', value: '解释不同同学的来访需求。'},
    ]};
    const payload = {debateAuthoringBackend: designJob.payload.debateAuthoringBackend,
      artifactType: 'debate', artifactId: 'debate-id', expectedRevision: 2,
      instruction: '只修改第一轮的任务：解释不同同学的来访需求。',
      currentContent: {lesson: {artifacts: [{content: {debate}}]}, debateRevisionHistory: [
        {instruction: 'private-history', changes: [{path: '/title', before: 'private-old-title'}]},
      ]},
    };
    harness.mockImplementationOnce(async (_url, options) => {
      const {messages} = JSON.parse(options.body);
      const context = JSON.parse(messages[1].content);
      expect(context.revisionHistory).toEqual([{changes: [{path: '/title'}]}]);
      return receipt(patch);
    });
    const job = {...designJob, kind: 'artifact.revise', payload};
    const response = await POST(request(job));
    expect(response.status).toBe(200);
    const {result} = await response.json();
    expect(result).toMatchObject({spec: {schema: 'debate-v2', motion: debate.motion},
      summary: patch.summary, changedFields: ['rounds'], changedPaths: ['/rounds/@opening/task']});
    expect(result.spec.rounds[0].task).toBe('解释不同同学的来访需求。');
    expect(result).not.toHaveProperty('content');
    expect((await POST(request(job))).status).toBe(200);
    expect(harness).toHaveBeenCalledTimes(1);
  });

  it('checks service authentication, both persisted markers, scope, version and model before dispatch', async () => {
    const {debateAuthoringBackend: _backend, ...unpinnedPayload} = designJob.payload;
    const {ordinaryTeaching: _scope, ...unscoped} = designJob.scope;
    expect((await POST(request(designJob, 'bad-token'))).status).toBe(401);
    for (const job of [
      {...designJob, payload: unpinnedPayload}, {...designJob, scope: unscoped},
      {...designJob, payload: {...designJob.payload, workspaceId: 'self'}},
      {...designJob, payload: {...designJob.payload, expectedRevision: 0}},
      {...designJob, payload: {...designJob.payload, generationReason: 'teacher_requested_ordinary_debate'}},
      {...designJob, payload: {...designJob.payload, ordinaryLessonPlanRevisionModel: 'official'}},
      {...designJob, payload: {...designJob.payload, materialContext: {...designJob.payload.materialContext, complete: false}}},
    ]) {
      expect(await (await POST(request(job))).json()).toMatchObject({errorCode: 'INVALID_ORDINARY_DEBATE_JOB'});
    }
    const unpinned = {...designJob, modelRoute: {...designJob.modelRoute, required_model: 'different'}};
    expect((await POST(request(unpinned))).status).toBe(503);
    const degraded = {...designJob, modelRoute: {...designJob.modelRoute, allow_degraded: true}};
    expect((await POST(request(degraded))).status).toBe(503);
    expect(harness).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('keeps unmarked jobs on the existing model route', async () => {
    const {debateAuthoringBackend: _backend, ...payload} = designJob.payload;
    const {ordinaryTeaching: _scope, ...scope} = designJob.scope;
    mocks.resolveModel.mockRejectedValueOnce(new Error('legacy model fixture'));
    expect((await POST(request({...designJob, payload, scope}))).status).toBe(422);
    expect((await postMixedJob(request(designJob, 'integration-secret', 'execute'))).status).toBe(422);
    await postMixedJob(request({...designJob, payload, scope, modelRoute: {...designJob.modelRoute, route: 'teaching-default'}}, 'integration-secret', 'execute'));
    expect(mocks.resolveModel).toHaveBeenCalledWith({modelString: 'deepseek:official'});
    expect(harness).not.toHaveBeenCalled();
  });

  it('rejects an unmeasured or mismatched receipt and rejects non-prose generated content', async () => {
    harness.mockResolvedValueOnce(receipt(debate, 'different'));
    expect((await POST(request(designJob))).status).toBe(503);
    harness.mockResolvedValueOnce(receipt(debate, 'official', null));
    expect((await POST(request(designJob))).status).toBe(503);
    harness.mockImplementation(async () => receipt({...debate, scenario: '<script>bad</script>'}));
    const response = await POST(request(designJob));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({errorCode: 'ORDINARY_DEBATE_REJECTED'});
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });
});

it('assigns debate citations in the teacher-selected order even when the dossier is sorted differently', () => {
  const refs = ['second', 'first'].map(id => ({type: 'material', id, revisionId: id + '-rev', sha256: 'a'.repeat(64)}));
  const coverage = {complete: true, expectedMaterialCount: 2, materialIds: ['second', 'first']};
  const materials = [...refs].reverse().map(ref => ({...ref, title: '校园观察',
    analysis: {summary: '记录活动室每日使用情况。'}, coverage: {complete: true}}));
  const packet = {prompt: '比较两份记录。', sourceRefs: refs, materialContext: coverage,
    materialDossier: {coverage, materials}};
  expect(ordinaryLessonCandidateInput(packet, 'debate').sources.map(row => row.materialId)).toEqual(['second', 'first']);
  expect(() => ordinaryLessonCandidateInput({...packet, sourceRefs: [...refs, {type: 'candidate'}]}, 'debate')).toThrow();
});

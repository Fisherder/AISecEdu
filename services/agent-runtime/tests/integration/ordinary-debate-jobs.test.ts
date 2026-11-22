import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {POST} from '@/app/api/integration/jobs/ordinary-debate/route';

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
    expect((await POST(request(designJob, 'integration-secret', 'execute'))).status).toBe(422);
    await POST(request({...designJob, payload, scope}, 'integration-secret', 'execute'));
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

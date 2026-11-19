import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DebateSpec } from '@/lib/debate/schema';
import { POST as respondToDebate } from '@/app/api/integration/debate/respond/route';

const spec: DebateSpec = {
  schema: 'debate-v1',
  title: '校园AI工具听证会',
  motion: '是否允许学生使用AI完成课后作业？',
  scenario: '学校正在修订学习工具规则，需要兼顾学习过程、可及性与独立思考。',
  studentRole: '学生代表',
  positions: {
    pro: '允许使用，但要披露使用过程并解释自己的推理。',
    con: '应限制用于作业答案，优先保护独立练习。',
  },
  objectives: ['区分辅助学习与代替思考', '根据证据提出有条件结论'],
  rounds: [
    { id: 'opening', title: '立论', task: '明确主张并说明依据' },
    { id: 'rebuttal', title: '反驳', task: '回应对方最强的反例' },
    { id: 'conclusion', title: '总结', task: '说明结论与适用边界' },
  ],
  evidence: [
    {
      id: 'e1',
      title: '学习日志案例',
      content: '假设学生能够提交工具使用过程与自己的修订。',
      source: '教学假设，非真实统计',
      kind: 'hypothetical',
    },
    {
      id: 'e2',
      title: '独立解释案例',
      content: '假设部分学生能交作业但不能解释解题依据。',
      source: '教学假设，非真实统计',
      kind: 'hypothetical',
    },
  ],
  rubric: [
    { id: 'knowledge', title: '概念理解', description: '准确区分辅助与代写' },
    { id: 'evidence', title: '证据推理', description: '说明证据与结论的关系' },
    { id: 'response', title: '回应与边界', description: '回应反例并指出条件' },
  ],
  reflectionPrompts: ['什么证据改变了你的判断？', '哪些问题还需要查证？'],
};
const reply = {
  acknowledgement: '你提出有条件开放的主张。',
  argument: '过程披露是否能确保独立理解？',
  question: '如何核验学生自己的推理？',
  evidenceIds: ['e2'],
  coaching: { quote: '应当允许', feedback: '补充一项可核验条件。' },
};
const message = '我认为应当允许使用AI，但必须提交自己的解释。';

describe('authenticated debate API through Harness', () => {
  it('checks scope, validates model output, and preserves the durable turn on retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'debate-harness-test-'));
    const token = 'fixture-service-token-at-least-24';
    vi.stubEnv('DEBATE_CHECKPOINT_DIR', directory);
    vi.stubEnv('AISECEDU_SERVICE_SECRET', token);
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'harness-token');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'fixture-model');
    const fetchTurn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        text: JSON.stringify(reply),
        model: 'fixture-model',
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      }),
    );
    vi.stubGlobal('fetch', fetchTurn);
    const makeRequest = (value: string) =>
      new NextRequest('http://localhost/api/integration/debate/respond', {
        method: 'POST',
        headers: { 'X-AISecEdu-Service-Token': value },
        body: JSON.stringify({
          input: { spec, side: 'pro', turns: [], action: 'turn', message },
          requestIdentity: 'fixture-attempt:turn-1',
          model: 'ignored-model',
        }),
      });
    try {
      expect((await respondToDebate(makeRequest('wrong'))).status).toBe(401);
      expect(fetchTurn).not.toHaveBeenCalled();
      const first = await respondToDebate(makeRequest(token));
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({
        success: true,
        result: reply,
        model: 'deepseek:fixture-model',
        usage: { inputTokens: 20, outputTokens: 8 },
      });
      const retry = await respondToDebate(makeRequest(token));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ result: reply, model: 'deepseek:fixture-model' });
      expect(fetchTurn).toHaveBeenCalledTimes(1);
      const [url, request] = fetchTurn.mock.calls[0];
      expect(String(url)).toBe('http://harness.invalid:3081/v1/turn');
      expect(request?.headers).toMatchObject({ Authorization: 'Bearer harness-token' });
      expect(request?.body).not.toContain('ignored-model');
      expect(request?.body).toContain(message);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/pbl/chat/route';

const { runTurn, createHarnessTurn, recordHarnessUsage } = vi.hoisted(() => ({
  runTurn: vi.fn(),
  createHarnessTurn: vi.fn(),
  recordHarnessUsage: vi.fn(),
}));

vi.mock('@/lib/server/agent-harness/classroom-turn', () => ({
  createHarnessTurn,
  recordHarnessUsage,
}));

function request(agentType: 'question' | 'judge' = 'question', signal?: AbortSignal) {
  return new NextRequest('http://runtime.test/api/pbl/chat', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      message: '怎样澄清项目目标？',
      agent: { name: '课堂助教', system_prompt: '鼓励学生比较替代方案。' },
      currentIssue: {
        title: '课程调查',
        description: '整理问卷',
        generated_questions: '说明调研目的',
      },
      recentMessages: [{ agent_name: '学生', message: '先确定受众' }],
      userRole: '设计员',
      agentType,
    }),
  });
}

describe('PBL ordinary questioning', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createHarnessTurn.mockReturnValue(runTurn);
  });

  it('keeps the reply and usage contracts and passes lesson data as user context', async () => {
    runTurn.mockResolvedValue({
      text: '先将目标写成一个可以验收的问题。',
      model: 'measured-model',
      usage: { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      message: '先将目标写成一个可以验收的问题。',
      agentName: '课堂助教',
    });
    const [messages, signal] = runTurn.mock.calls[0];
    expect(messages.map(({ role }: { role: string }) => role)).toEqual(['system', 'user']);
    expect(messages[0].content).not.toContain('鼓励学生比较替代方案');
    expect(JSON.parse(messages[1].content)).toMatchObject({
      message: '怎样澄清项目目标？',
      persona: '鼓励学生比较替代方案。',
      issue: expect.stringContaining('课程调查'),
      recentConversation: expect.stringContaining('先确定受众'),
      studentRole: '设计员',
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(recordHarnessUsage).toHaveBeenCalledOnce();
    expect(recordHarnessUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'measured-model',
        usage: { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 },
      }),
      'pbl-chat',
    );
  });

  it('fails without a configured harness and does not bill or switch to old models', async () => {
    createHarnessTurn.mockReturnValue(undefined);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(recordHarnessUsage).not.toHaveBeenCalled();
  });

  it('uses the original judge response envelope and records upstream usage', async () => {
    const text = JSON.stringify({ feedback: '评分反馈', verdict: 'NEEDS_REVISION' });
    runTurn.mockResolvedValue({ text, model: 'judge-model', usage: { total_tokens: 10 } });
    const response = await POST(request('judge'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      message: text,
      agentName: '课堂助教',
    });
    const [messages] = runTurn.mock.calls[0];
    expect(messages[0].content).toContain('COMPLETE or NEEDS_REVISION');
    expect(JSON.parse(messages[1].content).issue).toContain('Questions to Evaluate Against');
    expect(recordHarnessUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'judge-model' }),
      'pbl-chat',
    );
  });

  it('returns an empty cancellation response if the request aborts during the turn', async () => {
    const controller = new AbortController();
    runTurn.mockImplementation((_messages, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      controller.abort();
    }));
    const response = await POST(request('question', controller.signal));
    expect(response.status).toBe(499);
    expect(await response.text()).toBe('');
    expect(recordHarnessUsage).not.toHaveBeenCalled();
  });

  it('skips an already cancelled request before dispatch', async () => {
    const controller = new AbortController();
    controller.abort('synthetic cancellation detail');
    const response = await POST(request('judge', controller.signal));
    expect(response.status).toBe(499);
    expect(await response.text()).toBe('');
    expect(createHarnessTurn).not.toHaveBeenCalled();
  });

  it('records an already received measurement even if the client cancels the reply', async () => {
    const controller = new AbortController();
    const receipt = { text: '合成课堂回复', model: 'measured', usage: { total_tokens: 26 } };
    runTurn.mockImplementation(() => {
      controller.abort();
      return receipt;
    });
    const response = await POST(request('question', controller.signal));
    expect(response.status).toBe(499);
    expect(await response.text()).toBe('');
    expect(recordHarnessUsage).toHaveBeenCalledExactlyOnceWith(receipt, 'pbl-chat');
  });

  it('observes provider failures through only a fixed route message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runTurn.mockRejectedValue(new Error('fixture-only provider detail'));
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('fixture-only');
      expect(log).toHaveBeenCalledOnce();
      const logged = String(log.mock.calls[0][0]);
      expect(logged).toContain('PBL chat turn failed');
      expect(logged).not.toMatch(/fixture-only|怎样澄清项目目标|课堂助教/);
    } finally {
      log.mockRestore();
    }
  });

  it('preserves the existing judge error status without falling back to another model', async () => {
    runTurn.mockRejectedValue(new Error('provider-private detail'));
    const response = await POST(request('judge'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false, errorCode: 'INTERNAL_ERROR', error: '教学判评服务暂时不可用。',
    });
    expect(recordHarnessUsage).not.toHaveBeenCalled();
  });
});

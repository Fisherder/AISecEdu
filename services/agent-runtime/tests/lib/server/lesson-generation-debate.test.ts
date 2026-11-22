import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { DebateV2Spec } from '@/lib/debate/schema';
import { buildDebateArtifactHtml, generateSingleArtifact } from '@/lib/server/lesson-generation';

const request = {
  type: 'debate',
  title: '学校图书馆应延长午间开放时间吗？',
  description: '比较阅读需求、值班安排和不同班级的午休时间。',
  keyPoints: ['阅读需求', '值班安排', '开放时间'],
} as const;

const debate: DebateV2Spec = {
  schema: 'debate-v2',
  title: '午间图书馆开放时间听证会',
  motion: request.title,
  scenario: '图书馆每天午间开放二十分钟。学生会可提出限期试行方案，馆员需说明值班限制。',
  studentRole: '学生会代表',
  positions: {
    pro: '延长开放时间，让较晚用完午餐的同学也有时间借书。',
    con: '先调整开放时段，避免增加馆员值班时长。',
  },
  objectives: ['比较延长时段与调整时段的影响'],
  format: { kind: 'hearing', label: '课堂听证会', description: '听取馆员意见后提出方案。' },
  rules: {
    durationMinutes: 15, maxExchanges: 4, responseChars: 160,
    style: '基于条件讨论，允许让步。', allowFollowUps: true, allowEarlyFinish: true,
    coaching: 'on-demand',
  },
  roles: [{
    id: 'librarian', name: '馆员代表', identity: '负责午间排班的馆员', side: 'con',
    stance: '可以调整时段，前提是兼顾较早结束午餐的班级。',
    voice: '用排班表和实际借阅需求解释限制。',
    opening: '我们可以先比较两个开放时段覆盖的班级，再讨论是否延长值班。',
  }],
  rounds: [{
    id: 'schedule', title: '比较开放时段', task: '提出两个可行时段并说明取舍。',
    mode: 'inquiry', exchanges: 2, speakers: ['librarian'],
    prompts: ['还需要哪类信息才能判断？'],
  }],
  evidence: [{
    id: 'sample-schedule', title: '午餐时段示例', kind: 'hypothetical',
    content: '假设甲班和乙班结束午餐的时间相差十分钟。', source: '课堂假设，非真实统计',
  }],
  rubric: [{ id: 'tradeoffs', title: '说明权衡', description: '能解释两个时段对不同班级的影响。' }],
  reflectionPrompts: ['哪项新信息可能改变你的建议？'],
};

describe('debate lesson artifact', () => {
  it('builds a self-contained offline briefing directly from the teacher input', () => {
    const input = { ...request, keyPoints: [...request.keyPoints] };
    const html = buildDebateArtifactHtml(input);

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('多角色教学辩论');
    expect(html).toContain(`<h1>${request.title}</h1>`);
    expect(html).toContain(`<p class="lead">${request.description}</p>`);
    for (const point of request.keyPoints) expect(html).toContain(`<li>${point}</li>`);
    expect(html).not.toMatch(/<script\b|\b(?:href|src)\s*=|@import\b|url\s*\(/i);
  });

  it('calls the design model once and builds the interactive artifact from its v2 spec', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lesson-debate-test-'));
    vi.stubEnv('DEBATE_CHECKPOINT_DIR', directory);
    const aiCall = vi.fn<AICallFn>().mockResolvedValue(JSON.stringify(debate));
    const input = { ...request, keyPoints: [...request.keyPoints] };
    const languageDirective = '使用中文教学。';
    try {
      const artifact = await generateSingleArtifact(
        input, 3, aiCall, { languageDirective, useWorkflow: true },
      );

      expect(aiCall).toHaveBeenCalledTimes(1);
      const [system, prompt] = aiCall.mock.calls[0];
      expect(system).toContain('"schema":"debate-v2"');
      expect(JSON.parse(prompt)).toEqual({ request: input, languageDirective });
      expect(artifact).toMatchObject({
        type: 'debate',
        title: debate.title,
        order: 3,
        outline: {
          type: 'interactive',
          widgetType: 'simulation',
          title: debate.title,
          description: debate.scenario,
          keyPoints: debate.objectives,
        },
        content: { html: '', widgetType: 'simulation', debate },
      });
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('escapes teacher-authored strings in the iframe document', () => {
    const html = buildDebateArtifactHtml({
      type: 'debate',
      title: '图书馆 <午间开放>',
      description: '<示例> 讨论两种开放方案。',
      keyPoints: ['阅读 & 值班'],
    });

    expect(html).not.toContain('<午间开放>');
    expect(html).not.toContain('<示例>');
    expect(html).toContain('图书馆 &lt;午间开放&gt;');
    expect(html).toContain('&lt;示例&gt; 讨论两种开放方案。');
    expect(html).toContain('<li>阅读 &amp; 值班</li>');
  });
});

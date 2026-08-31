import { describe, expect, it } from 'vitest';
import { createFallbackTeachingPlan, normalizeTeachingPlan } from '@/lib/security/teaching-plan';

describe('teaching package planner', () => {
  it('normalizes model output and drops unsupported artifact types', () => {
    const plan = normalizeTeachingPlan(
      {
        title: 'SQL 注入教学包',
        summary: '从原理到修复',
        audience: '大二学生',
        learningObjectives: ['识别注入点'],
        decisionSummary: '先建模，再实验，最后评价',
        safetyNotes: ['仅限隔离环境'],
        items: [
          {
            type: 'diagram',
            title: '请求到数据库的攻击链',
            purpose: '看清数据流',
            reason: '涉及多个信任边界',
            keyPoints: ['输入', '拼接', '执行'],
            estimatedMinutes: 12,
            quality: 'fast',
          },
          { type: 'podcast', title: '不受支持的类型' },
        ],
      },
      { topic: 'SQL 注入' },
    );

    expect(plan?.source).toBe('ai');
    expect(plan?.items).toHaveLength(1);
    expect(plan?.items[0]).toMatchObject({
      type: 'diagram',
      title: '请求到数据库的攻击链',
      estimatedMinutes: 12,
      quality: 'fast',
    });
    expect(plan?.totalMinutes).toBe(12);
  });

  it('selects an explanation, attack-flow diagram, sandbox lab and assessment for SQL injection', () => {
    const plan = createFallbackTeachingPlan({
      topic: 'SQL 注入攻击面与纵深防御',
      description: '面向大二学生，要理解参数化查询并完成检测和修复。',
    });
    const types = plan.items.map((item) => item.type);

    expect(types).toEqual(['slide', 'diagram', 'code', 'vulnerable-lab', 'quiz']);
    expect(plan.safetyNotes.join('')).toContain('授权');
    expect(plan.source).toBe('fallback');
  });

  it('adds debate when the requirement contains a genuine legal or ethical trade-off', () => {
    const plan = createFallbackTeachingPlan({
      topic: '漏洞披露中的公共利益与企业责任',
      description: '比较法律合规、用户安全与研究者责任之间的权衡。',
    });

    expect(plan.items.map((item) => item.type)).toContain('debate');
  });

  it('honors an explicit request for only one debate activity', () => {
    const plan = createFallbackTeachingPlan({
      topic: 'AI 代码审计的责任边界',
      description: '只要一场辩论，不要课件、习题和实验。',
    });

    expect(plan.items.map((item) => item.type)).toEqual(['debate']);
  });

  it('honors explicit exclusions in a mixed requirement', () => {
    const plan = createFallbackTeachingPlan({
      topic: 'XSS 原理与防御',
      description: '需要流程图和课堂测验，不要实验。',
    });

    expect(plan.items.map((item) => item.type)).not.toContain('vulnerable-lab');
    expect(plan.items.map((item) => item.type)).toContain('diagram');
    expect(plan.items.map((item) => item.type)).toContain('quiz');
  });
});

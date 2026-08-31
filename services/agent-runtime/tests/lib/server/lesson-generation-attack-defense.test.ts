import { describe, expect, it } from 'vitest';
import {
  buildAttackDefenseArtifactHtml,
  generateSingleArtifact,
} from '@/lib/server/lesson-generation';

describe('attack-defense lesson artifact', () => {
  it('compiles a safe interactive preview without a second model call', async () => {
    let called = false;
    const artifact = await generateSingleArtifact(
      {
        type: 'vulnerable-lab',
        title: 'SQL 注入攻防闭环',
        description: '观察、检测、修复并回归验证。',
        keyPoints: ['攻击现象', '日志取证', '参数化查询'],
      },
      1,
      async () => {
        called = true;
        throw new Error('deterministic materialization must not call the model');
      },
      { subjectProfile: true, deterministicLab: true },
    );

    expect(called).toBe(false);
    expect(artifact?.type).toBe('vulnerable-lab');
    expect(artifact?.content).toMatchObject({ widgetType: 'code' });
    const html = (artifact?.content as { html: string }).html;
    expect(html).toContain('授权隔离模拟');
    expect(html).toContain('运行隔离攻击模拟');
    expect(html).toContain('执行回归验证');
    expect(artifact?.solvability?.passed).toBe(true);
  });

  it('compiles follow-up attack-defense simulations without model-authored HTML', async () => {
    let called = false;
    const artifact = await generateSingleArtifact(
      {
        type: 'simulation',
        title: '防守者检测与回归验证',
        description: '关联日志、应用参数化查询并验证修复。',
        keyPoints: ['日志证据', '防守修复', '回归验证'],
      },
      2,
      async () => {
        called = true;
        throw new Error('deterministic attack-defense simulation must not call the model');
      },
      { subjectProfile: true, deterministicLab: true },
    );

    expect(called).toBe(false);
    expect(artifact?.type).toBe('simulation');
    expect(artifact?.content).toMatchObject({ widgetType: 'simulation' });
    const html = (artifact?.content as { html: string }).html;
    expect(html).toContain('防守者检测与回归验证');
    expect(html).toContain('参数化查询');
    expect(html).toContain('授权隔离模拟');
  });

  it('escapes candidate-authored strings in the iframe document', () => {
    const html = buildAttackDefenseArtifactHtml({
      type: 'vulnerable-lab',
      title: '<img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script>',
      keyPoints: ['<svg onload=alert(1)>'],
    });

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;img');
  });
});

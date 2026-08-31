import { describe, expect, it } from 'vitest';
import { buildDebateArtifactHtml, generateSingleArtifact } from '@/lib/server/lesson-generation';

describe('debate lesson artifact', () => {
  it('creates a self-contained preview without invoking a content model', async () => {
    let called = false;
    const artifact = await generateSingleArtifact(
      {
        type: 'debate',
        title: '漏洞披露应该优先公开吗？',
        description: '比较公共利益和协调披露。',
        keyPoints: ['披露时机', '受影响用户', '企业修复窗口'],
      },
      1,
      async () => {
        called = true;
        throw new Error('debate should not call the content model');
      },
      { subjectProfile: true, useWorkflow: true },
    );

    expect(called).toBe(false);
    expect(artifact?.type).toBe('debate');
    expect(artifact?.content).toMatchObject({ widgetType: 'simulation' });
    expect((artifact?.content as { html: string }).html).toContain('多角色教学辩论');
  });

  it('escapes teacher-authored strings in the iframe document', () => {
    const html = buildDebateArtifactHtml({
      type: 'debate',
      title: '<img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;img');
  });
});

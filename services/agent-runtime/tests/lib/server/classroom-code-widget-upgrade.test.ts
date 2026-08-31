import { describe, expect, it } from 'vitest';
import { upgradeLegacyClassroomCodeWidgets } from '@/lib/server/classroom-storage';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';

function legacyHtml(): string {
  const config = {
    type: 'code',
    language: 'python',
    description: 'RSA',
    starterCode: 'def verify():\n    pass',
    testCases: [{ input: 'verify()', expected: 'True' }],
    hints: [],
    solution: 'def verify():\n    return True',
  };
  return `<html><body>自动运行仅支持 JavaScript<script type="application/json" id="widget-config">${JSON.stringify(config)}</script></body></html>`;
}

describe('published classroom code widget migration', () => {
  it('upgrades Python code scenes in place without changing classroom or scene ids', () => {
    const classroom = {
      id: 'classroom-existing',
      stage: { id: 'stage-existing', name: 'RSA' },
      scenes: [
        {
          id: 'scene-existing',
          type: 'interactive',
          title: 'Python RSA',
          content: { type: 'interactive', widgetType: 'code', html: legacyHtml() },
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
    } as unknown as PersistedClassroomData;

    expect(upgradeLegacyClassroomCodeWidgets(classroom)).toBe(true);
    expect(classroom.id).toBe('classroom-existing');
    expect(classroom.scenes[0]?.id).toBe('scene-existing');
    const html = (classroom.scenes[0]?.content as { html: string }).html;
    expect(html).toContain('Python 隔离容器');
    expect(html).toContain('container-v1');
    expect(upgradeLegacyClassroomCodeWidgets(classroom)).toBe(false);
  });
});

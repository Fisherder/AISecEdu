import { describe, it, expect } from 'vitest';
import { lessonToScenes } from '@/lib/server/lesson-publish';
import type { Lesson } from '@/lib/types/lesson';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedInteractiveContent,
  GeneratedQuizContent,
} from '@/lib/types/generation';

const slideOutline = (title: string): SceneOutline => ({
  id: 'o1',
  type: 'slide',
  title,
  description: 'd',
  keyPoints: ['a'],
  order: 1,
});
const widgetOutline = (title: string, widgetType: 'diagram' | 'simulation'): SceneOutline => ({
  id: 'o2',
  type: 'interactive',
  title,
  description: 'd',
  keyPoints: ['a'],
  order: 2,
  widgetType,
  widgetOutline: {},
});
const quizOutline = (title: string): SceneOutline => ({
  id: 'o3',
  type: 'quiz',
  title,
  description: 'd',
  keyPoints: ['a'],
  order: 3,
  quizConfig: { questionCount: 1, difficulty: 'easy', questionTypes: ['single'] },
});

const slideContent: GeneratedSlideContent = { elements: [], remark: 'r' };
const widgetContent: GeneratedInteractiveContent = {
  html: '<html></html>',
  widgetType: 'diagram',
};
const quizContent: GeneratedQuizContent = { questions: [] };

describe('lessonToScenes', () => {
  it('converts slide/interactive/quiz artifacts to scenes', () => {
    const lesson: Lesson = {
      id: 'L',
      title: 'T',
      artifacts: [
        {
          id: 'a1',
          type: 'slide',
          title: 'S',
          outline: slideOutline('S'),
          content: slideContent,
          order: 1,
          createdAt: 1,
        },
        {
          id: 'a2',
          type: 'diagram',
          title: 'D',
          outline: widgetOutline('D', 'diagram'),
          content: widgetContent,
          order: 2,
          createdAt: 1,
        },
        {
          id: 'a3',
          type: 'quiz',
          title: 'Q',
          outline: quizOutline('Q'),
          content: quizContent,
          order: 3,
          createdAt: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const { stageId, stage, scenes } = lessonToScenes(lesson);
    expect(stage.name).toBe('T');
    expect(scenes).toHaveLength(3);
    expect(scenes[0]!.type).toBe('slide');
    expect(scenes[1]!.type).toBe('interactive');
    expect(scenes[2]!.type).toBe('quiz');
    expect(stageId).toBeTruthy();
    // slide canvas carries elements
    expect((scenes[0]!.content as { canvas?: { elements?: unknown[] } }).canvas?.elements).toEqual(
      [],
    );
  });

  it('produces at least one scene for a single slide artifact', () => {
    const lesson: Lesson = {
      id: 'L',
      title: 'T',
      artifacts: [
        {
          id: 'a1',
          type: 'slide',
          title: 'S',
          outline: slideOutline('S'),
          content: slideContent,
          order: 1,
          createdAt: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const { scenes } = lessonToScenes(lesson);
    expect(scenes.length).toBeGreaterThanOrEqual(1);
  });

  it('attaches a four-agent roster and scene director to debate artifacts', () => {
    const lesson: Lesson = {
      id: 'L-debate',
      title: '安全伦理辩论课',
      subjectProfile: 'cybersecurity',
      artifacts: [
        {
          id: 'debate-1',
          type: 'debate',
          title: '漏洞应当立即公开吗？',
          outline: {
            ...widgetOutline('漏洞应当立即公开吗？', 'simulation'),
            description: '比较公共利益、企业修复窗口和研究者责任。',
            keyPoints: ['协调披露', '用户风险'],
          },
          content: { html: '<html></html>', widgetType: 'simulation' },
          order: 1,
          createdAt: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    const { stage, scenes } = lessonToScenes(lesson);
    expect(stage.generatedAgentConfigs).toHaveLength(4);
    expect(stage.generatedAgentConfigs?.map((agent) => agent.name)).toEqual([
      '辩论主持人',
      '正方论证智能体',
      '反方质询智能体',
      '事实核查智能体',
    ]);
    expect(scenes[0]?.multiAgent?.enabled).toBe(true);
    expect(scenes[0]?.multiAgent?.agentIds).toEqual(
      stage.generatedAgentConfigs?.map((agent) => agent.id),
    );
    expect(scenes[0]?.multiAgent?.directorPrompt).toContain('漏洞应当立即公开吗');
    expect(scenes[0]?.multiAgent?.directorPrompt).toContain('授权');
  });
});

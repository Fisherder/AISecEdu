import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateSelfCheckAnswer,
  IntegratedLessonPreview,
  normalizeSelfCheckQuestion,
} from '@/components/integrated-lesson-preview';
import type { LessonArtifact } from '@/lib/types/lesson';

function simulation(id: string, order: number, title: string): LessonArtifact {
  return {
    id,
    order,
    title,
    type: 'simulation',
    outline: {
      id: `outline-${id}`,
      type: 'interactive',
      order,
      title,
      description: title,
      keyPoints: [],
    },
    content: { html: `<main>${title}</main>` },
    createdAt: 1,
  };
}

function slide(id: string, order: number, title: string): LessonArtifact {
  return {
    id,
    order,
    title,
    type: 'slide',
    outline: {
      id: `outline-${id}`,
      type: 'slide',
      order,
      title,
      description: title,
      keyPoints: [],
    },
    content: {
      background: { type: 'solid', color: '#07111f' },
      speakerNotes:
        '先说明逆向分析的观察目标，再引导学习者从二进制行为推断控制流；确认回答包含证据后，过渡到下一页的动态验证。',
      elements: [
        {
          id: 'title',
          type: 'text',
          left: 60,
          top: 60,
          width: 700,
          height: 80,
          rotate: 0,
          content: '<p>深色课件标题</p>',
          defaultColor: '#f8fafc',
          defaultFontName: 'Microsoft YaHei',
        },
      ],
    },
    createdAt: 1,
  } as LessonArtifact;
}

function quiz(id: string, order: number, title: string): LessonArtifact {
  return {
    id,
    order,
    title,
    type: 'quiz',
    outline: {
      id: `outline-${id}`,
      type: 'quiz',
      order,
      title,
      description: title,
      keyPoints: [],
    },
    content: {
      questions: [
        {
          id: 'self-check-choice',
          type: 'single',
          question: '参数化查询的核心作用是什么？',
          options: [
            { value: 'A', label: '让输入可以改变 SQL 语义' },
            { value: 'B', label: '把数据与查询结构分离' },
          ],
          answer: ['B'],
          analysis: '绑定参数会把不可信输入按数据处理，避免拼接到查询结构中。',
        },
        {
          id: 'self-check-reflection',
          type: 'short_answer',
          question: '写下你会如何从日志验证异常输入。',
          answer: ['比对参数化查询日志和输入校验事件。'],
          analysis: '先建立正常请求基线，再关联输入校验与查询日志证据。',
        },
      ],
    },
    createdAt: 1,
  } as LessonArtifact;
}

describe('玄甲 integrated preview surface', () => {
  it('remounts the interactive surface when an independent scene changes', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/integrated-lesson-preview.tsx'),
      'utf8',
    );

    expect(source).toContain(
      '<IntegratedArtifactContent key={activeArtifact.id} artifact={activeArtifact} />',
    );
  });

  it('renders only the active teaching scene inside the full reading workspace', () => {
    const html = renderToStaticMarkup(
      createElement(IntegratedLessonPreview, {
        artifacts: [simulation('normal', 1, '正常密钥交换'), simulation('attack', 2, '中间人攻击')],
      }),
    );

    expect(html).toContain('data-aisecedu-preview-surface="reader"');
    expect(html).toContain('aria-label="演示场景切换"');
    expect(html).toContain('aria-label="内容导航"');
    expect(html).toContain('aria-label="阅读进度"');
    expect(html).toContain('aria-label="第 1 页，共 2 页；打开全部页面"');
    expect(html).toContain('打开场景 1：正常密钥交换');
    expect(html).toContain('打开全部页面');
    expect(html).toContain('全屏预览');
    expect(html).toContain('画面控制');
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).not.toContain('allow-same-origin');
    expect(html).not.toContain('返回玄甲');
    expect(html).not.toContain('融合模式');
    expect(html).not.toContain('③ 产物');
    expect(html).not.toContain('&lt;main&gt;中间人攻击&lt;/main&gt;');
  });

  it('supports keyboard, numeric jump, fullscreen and touch navigation without covering iframe interactions', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/integrated-lesson-preview.tsx'),
      'utf8',
    );

    expect(source).toContain("window.addEventListener('keydown', onKeyDown)");
    expect(source).toContain('jumpDigitsRef.current');
    expect(source).toContain('stageRef.current?.requestFullscreen()');
    expect(source).toContain('onPointerDown={handlePointerDown}');
    expect(source).toContain('onPointerUp={handlePointerUp}');
    expect(source).toContain('<iframe');
    expect(source).not.toContain("pointerEvents: 'none'");
  });

  it('fills the available stage and preserves authored slide colors in dark mode', () => {
    const html = renderToStaticMarkup(
      createElement(IntegratedLessonPreview, {
        artifacts: [slide('deck-page', 1, '课件页面')],
      }),
    );

    expect(html).toContain('data-aisecedu-slide-preview="fill"');
    expect(html).toContain('data-aisecedu-speaker-notes="visible"');
    expect(html).toContain('本页讲稿');
    expect(html).toContain('先说明逆向分析的观察目标');
    expect(html).toContain('aria-label="第 1 页讲稿"');
    expect(html).toContain('class="base-element-text"');
    expect(html).toContain('background-color:#07111f');
    expect(html).toContain('color:#f8fafc');
    expect(html).not.toContain('width:520px');
  });

  it('does not add a speaker panel to non-slide simulations', () => {
    const html = renderToStaticMarkup(
      createElement(IntegratedLessonPreview, {
        artifacts: [simulation('scene', 1, '攻击链演示')],
      }),
    );

    expect(html).not.toContain('data-aisecedu-speaker-notes="visible"');
  });

  it('renders student quizzes as answerable self-checks without leaking answers before submission', () => {
    const html = renderToStaticMarkup(
      createElement(IntegratedLessonPreview, {
        artifacts: [quiz('personal-quiz', 1, '个人 SQL 注入自检')],
      }),
    );

    expect(html).toContain('data-aisecedu-quiz-self-check="ready"');
    expect(html).toContain('个人自主练习');
    expect(html).toContain('参数化查询的核心作用是什么？');
    expect(html).toContain('type="radio"');
    expect(html).toContain('写下你会如何从日志验证异常输入。');
    expect(html).toContain('提交并查看反馈');
    expect(html).not.toContain('参考答案：');
    expect(html).not.toContain('绑定参数会把不可信输入按数据处理');
  });

  it('grades objective self-checks locally and leaves open answers for reflective comparison', () => {
    const choice = normalizeSelfCheckQuestion(
      {
        question: '选择正确答案',
        options: [
          { value: 'A', label: '错误' },
          { value: 'B', label: '正确' },
        ],
        correctAnswer: 'B',
        feedback: '使用参数绑定。',
      },
      0,
    );
    const shortAnswer = normalizeSelfCheckQuestion(
      {
        question: '写下理由',
        answer: '保留日志证据。',
        analysis: '将输入校验与查询日志关联。',
      },
      1,
    );

    expect(evaluateSelfCheckAnswer(choice, 'B')).toMatchObject({
      correct: true,
      referenceAnswer: '正确',
      feedback: '使用参数绑定。',
    });
    expect(evaluateSelfCheckAnswer(choice, 'A').correct).toBe(false);
    expect(evaluateSelfCheckAnswer(shortAnswer, '我的回答')).toMatchObject({
      correct: null,
      referenceAnswer: '保留日志证据。',
      feedback: '将输入校验与查询日志关联。',
    });
    const legacyFallback = normalizeSelfCheckQuestion(
      {
        question: '旧字段兼容',
        options: ['错误', '正确'],
        answer: [],
        correctAnswer: 'B',
      },
      2,
    );
    expect(evaluateSelfCheckAnswer(legacyFallback, 'B').correct).toBe(true);
  });
});

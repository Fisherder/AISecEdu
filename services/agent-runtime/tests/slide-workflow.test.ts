import { describe, expect, it } from 'vitest';
import {
  generateSlideViaWorkflow,
  parseSlidePlan,
  type SlideLayout,
} from '@/lib/generation/slide-workflow';
import type { SceneOutline } from '@/lib/types/generation';

function outline(order: number, layout: SlideLayout, title = `第 ${order} 页`): SceneOutline {
  return {
    id: `outline_${order}`,
    type: 'slide',
    title,
    description: `本页建立具体教学理解。\n版式意图：${layout}`,
    keyPoints: [`要点 ${order}A`, `要点 ${order}B`, `要点 ${order}C`],
    order,
  };
}

function modelPlan(layout: SlideLayout) {
  return JSON.stringify({
    layout,
    eyebrow: '核心学习',
    title: '参数化查询为何有效',
    subtitle: '从输入边界追踪到数据库执行计划',
    bullets: ['输入值不再改变 SQL 结构', '驱动单独绑定参数类型', '日志能够验证查询行为'],
    leftTitle: '字符串拼接',
    leftItems: ['数据进入 SQL 语法结构', '异常字符可能改变控制流'],
    rightTitle: '参数化查询',
    rightItems: ['模板与数据严格分离', '相同输入只作为普通值处理'],
    steps: [
      { title: '定义模板', detail: '先固定查询结构与参数位置' },
      { title: '绑定数据', detail: '由驱动编码并传递参数值' },
      { title: '验证结果', detail: '比较日志、返回行数和错误响应' },
    ],
    callout: '关键不是过滤字符，而是分离代码与数据。',
    question: '哪一条证据可以证明输入没有改变 SQL 结构？',
    takeaway: '参数化查询通过结构与数据分离消除注入路径。',
    speakerNotes:
      '先回顾上一页的字符串拼接现象，再逐步追踪参数绑定过程。强调过滤黑名单与结构分离的区别，并请学习者用查询日志说明预期证据。',
  });
}

describe('teaching slide workflow', () => {
  it('keeps the detailed content while honoring the plan-level layout hint', () => {
    const parsed = parseSlidePlan(modelPlan('concept'), outline(4, 'comparison'));
    expect(parsed).toMatchObject({
      layout: 'comparison',
      title: '参数化查询为何有效',
      leftItems: expect.arrayContaining(['数据进入 SQL 语法结构']),
      rightItems: expect.arrayContaining(['模板与数据严格分离']),
    });
    expect(parsed?.speakerNotes.length).toBeGreaterThan(30);
  });

  it('renders multiple substantive structures with notes and no placeholder pages', async () => {
    const layouts: SlideLayout[] = [
      'cover',
      'comparison',
      'process',
      'case',
      'activity',
      'summary',
    ];
    const pages = await Promise.all(
      layouts.map((layout, index) =>
        generateSlideViaWorkflow(
          outline(index + 1, layout, `${layout} 教学页`),
          async () => modelPlan('concept'),
          { languageDirective: '使用简体中文。', subjectProfile: true },
        ),
      ),
    );
    expect(new Set(pages.map((page) => page?.layout))).toEqual(new Set(layouts));
    for (const page of pages) {
      expect(page?.elements.length).toBeGreaterThanOrEqual(7);
      expect(page?.speakerNotes?.length).toBeGreaterThanOrEqual(60);
      expect(page?.remark?.length).toBeGreaterThan(30);
      expect(page?.background).toEqual(expect.objectContaining({ type: 'solid' }));
    }
  });

  it('falls back to a complete slide when the model response is unavailable', async () => {
    const page = await generateSlideViaWorkflow(
      outline(7, 'checkpoint', '课堂理解检查'),
      async () => {
        throw new Error('temporary model timeout');
      },
      { languageDirective: '使用简体中文。', subjectProfile: true },
    );
    expect(page).toMatchObject({ layout: 'checkpoint' });
    expect(page?.elements.length).toBeGreaterThanOrEqual(8);
    expect(page?.speakerNotes).toContain('课堂理解检查');
    expect(page?.remark).toContain('课堂理解检查');
  });
});

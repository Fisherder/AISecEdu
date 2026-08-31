import type { PPTElement, SlideBackground } from '@openmaic/dsl';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { createLogger } from '@/lib/logger';
import type { SceneOutline } from '@/lib/types/generation';
import type { GeneratedSlideContent } from '@/lib/types/generation';
import type { AICallFn } from './pipeline-types';

const log = createLogger('SlideWorkflow');

const SLIDE_LAYOUTS = [
  'cover',
  'concept',
  'comparison',
  'process',
  'timeline',
  'case',
  'code',
  'activity',
  'checkpoint',
  'summary',
] as const;

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export interface SlidePlan {
  layout: SlideLayout;
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  bullets: string[];
  leftTitle?: string | null;
  leftItems?: string[];
  rightTitle?: string | null;
  rightItems?: string[];
  steps?: Array<{ title: string; detail: string }>;
  callout?: string | null;
  question?: string | null;
  code?: {
    language: string;
    filename?: string | null;
    lines: string[];
  } | null;
  takeaway?: string | null;
  speakerNotes: string;
}

type SlideBuild = {
  elements: PPTElement[];
  background: SlideBackground;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(value: unknown, max = 220): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanItems(value: unknown, fallback: string[] = [], max = 5): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item) => cleanText(item, 90))
    .filter(Boolean)
    .slice(0, max);
}

function normalizedLayout(value: unknown): SlideLayout | null {
  const raw = cleanText(value, 40).toLowerCase();
  if ((SLIDE_LAYOUTS as readonly string[]).includes(raw)) return raw as SlideLayout;
  const aliases: Record<string, SlideLayout> = {
    content: 'concept',
    cards: 'concept',
    'two-column': 'comparison',
    compare: 'comparison',
    flow: 'process',
    steps: 'process',
    example: 'case',
    exercise: 'activity',
    quiz: 'checkpoint',
    recap: 'summary',
  };
  return aliases[raw] || null;
}

function layoutHint(outline: SceneOutline): SlideLayout | null {
  const match = outline.description.match(/(?:版式意图|建议版式|layout)\s*[:：]\s*([a-z-]+)/i);
  return normalizedLayout(match?.[1]);
}

function inferredLayout(outline: SceneOutline, requested?: unknown): SlideLayout {
  const explicit = layoutHint(outline);
  if (explicit) return explicit;
  if (outline.order === 1) return 'cover';
  const text = `${outline.title} ${outline.description}`;
  if (/总结|回顾|带走|下一步|recap|summary/i.test(text)) return 'summary';
  if (/测验|检查|思考|判断|自检|check|quiz/i.test(text)) return 'checkpoint';
  if (/练习|任务|挑战|活动|迁移|practice|activity/i.test(text)) return 'activity';
  if (/代码|配置|函数|脚本|code|config/i.test(text)) return 'code';
  if (/案例|场景|证据|复盘|case|evidence/i.test(text)) return 'case';
  if (/时间|演变|历程|timeline/i.test(text)) return 'timeline';
  if (/流程|步骤|机制|链路|过程|process|flow/i.test(text)) return 'process';
  if (/对比|比较|区别|错误|正确|差异|compare|versus/i.test(text)) return 'comparison';
  return normalizedLayout(requested) || 'concept';
}

function parseSteps(value: unknown): Array<{ title: string; detail: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = cleanText(item, 100);
        return text ? { title: `步骤 ${index + 1}`, detail: text } : null;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = cleanText(record.title || record.label, 42);
      const detail = cleanText(record.detail || record.description || record.content, 100);
      return title && detail ? { title, detail } : null;
    })
    .filter((item): item is { title: string; detail: string } => Boolean(item))
    .slice(0, 4);
}

function fallbackPlan(outline: SceneOutline): SlidePlan {
  const bullets = cleanItems(outline.keyPoints, [], 5);
  const completeBullets =
    bullets.length >= 2
      ? bullets
      : [
          cleanText(outline.description, 80) || `解释“${outline.title}”的关键机制`,
          `通过例证或问题检查对“${outline.title}”的理解`,
        ];
  return {
    layout: inferredLayout(outline),
    title: cleanText(outline.title, 46) || '核心内容',
    eyebrow: `第 ${String(outline.order).padStart(2, '0')} 页`,
    subtitle: cleanText(outline.description, 120) || null,
    bullets: completeBullets,
    leftTitle: '关键事实',
    leftItems: completeBullets.filter((_, index) => index % 2 === 0),
    rightTitle: '理解与应用',
    rightItems: completeBullets.filter((_, index) => index % 2 === 1),
    steps: completeBullets.slice(0, 4).map((detail, index) => ({
      title: `步骤 ${index + 1}`,
      detail,
    })),
    callout: completeBullets[0],
    question: `你会用什么证据说明已经理解“${outline.title}”？`,
    code: null,
    takeaway: completeBullets[0],
    speakerNotes: `先用一句话连接上一页，再结合一个具体证据或最小示例展开“${outline.title}”。强调最容易混淆的关键关系，请学习者用自己的话复述，并追问“什么可观察结果能够证明判断成立”。确认回应包含依据后，再说明下一页将如何把这个模型用于新的证据或任务。`,
  };
}

export function parseSlidePlan(raw: string, outline: SceneOutline): SlidePlan | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const object = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const fallback = fallbackPlan(outline);
    const title = cleanText(object.title, 46) || fallback.title;
    const bullets = cleanItems(object.bullets, fallback.bullets, 5);
    const leftItems = cleanItems(
      object.leftItems,
      bullets.filter((_, index) => index % 2 === 0),
      4,
    );
    const rightItems = cleanItems(
      object.rightItems,
      bullets.filter((_, index) => index % 2 === 1),
      4,
    );
    const rawCode =
      object.code && typeof object.code === 'object' && !Array.isArray(object.code)
        ? (object.code as Record<string, unknown>)
        : null;
    const codeLines = cleanItems(rawCode?.lines, [], 12);
    const notes = cleanText(object.speakerNotes || object.teacherNotes || object.takeaway, 1_200);
    return {
      layout: inferredLayout(outline, object.layout),
      title,
      eyebrow: cleanText(object.eyebrow, 34) || fallback.eyebrow,
      subtitle: cleanText(object.subtitle, 130) || fallback.subtitle,
      bullets: bullets.length >= 2 ? bullets : fallback.bullets,
      leftTitle: cleanText(object.leftTitle, 32) || fallback.leftTitle,
      leftItems: leftItems.length ? leftItems : fallback.leftItems,
      rightTitle: cleanText(object.rightTitle, 32) || fallback.rightTitle,
      rightItems: rightItems.length ? rightItems : fallback.rightItems,
      steps: parseSteps(object.steps).length ? parseSteps(object.steps) : fallback.steps,
      callout: cleanText(object.callout, 110) || fallback.callout,
      question: cleanText(object.question, 130) || fallback.question,
      code:
        rawCode && codeLines.length
          ? {
              language: cleanText(rawCode.language, 24) || 'text',
              filename: cleanText(rawCode.filename, 48) || null,
              lines: codeLines,
            }
          : fallback.code,
      takeaway: cleanText(object.takeaway, 160) || fallback.takeaway,
      speakerNotes: notes.replace(/\s+/g, '').length >= 60 ? notes : fallback.speakerNotes,
    };
  } catch {
    return null;
  }
}

function assembleSlide(plan: SlidePlan, order: number): SlideBuild {
  const elements: PPTElement[] = [];
  let elementIndex = 0;
  const nextId = (name: string) => `${name}_${order}_${++elementIndex}`;
  const text = (
    name: string,
    value: string,
    left: number,
    top: number,
    width: number,
    height: number,
    size: number,
    color: string,
    weight = 400,
    align: 'left' | 'center' | 'right' = 'left',
    vAlign: 'top' | 'middle' | 'bottom' = 'top',
  ) => {
    elements.push({
      id: nextId(name),
      type: 'text',
      left,
      top,
      width,
      height,
      rotate: 0,
      content: `<p style="margin:0;font-size:${size}px;font-weight:${weight};line-height:1.35;color:${color};text-align:${align};">${escapeHtml(value)}</p>`,
      defaultFontName: 'Microsoft YaHei',
      defaultColor: color,
      lineHeight: 1.35,
      vAlign,
    } as PPTElement);
  };
  const richText = (
    name: string,
    items: string[],
    left: number,
    top: number,
    width: number,
    height: number,
    size = 17,
    color = '#334155',
  ) => {
    const content = items
      .slice(0, 5)
      .map(
        (item) =>
          `<p style="margin:0 0 10px;font-size:${size}px;line-height:1.45;color:${color};">• ${escapeHtml(item)}</p>`,
      )
      .join('');
    elements.push({
      id: nextId(name),
      type: 'text',
      left,
      top,
      width,
      height,
      rotate: 0,
      content,
      defaultFontName: 'Microsoft YaHei',
      defaultColor: color,
      lineHeight: 1.45,
    } as PPTElement);
  };
  const rect = (
    name: string,
    left: number,
    top: number,
    width: number,
    height: number,
    fill: string,
    opacity = 1,
  ) => {
    elements.push({
      id: nextId(name),
      type: 'shape',
      left,
      top,
      width,
      height,
      rotate: 0,
      path: 'M 0 0 L 1 0 L 1 1 L 0 1 Z',
      viewBox: [1, 1],
      fill,
      opacity,
      fixedRatio: false,
    } as PPTElement);
  };
  const header = (accent = '#2563eb') => {
    text('eyebrow', plan.eyebrow || '玄甲 · TEACHING DECK', 58, 32, 600, 24, 11, accent, 760);
    text('title', plan.title, 58, 63, 884, 62, 30, '#0f172a', 760);
    rect('accent', 58, 133, 76, 5, accent);
  };
  const footer = (color = '#64748b') => {
    rect('footer_rule', 58, 526, 884, 1.5, '#dbe4ee');
    text('footer_brand', '玄甲 · 可直接授课', 58, 533, 300, 18, 10, color, 650);
    text('footer_page', String(order).padStart(2, '0'), 886, 532, 56, 18, 10, color, 700, 'right');
  };
  const card = (
    name: string,
    heading: string,
    body: string,
    left: number,
    top: number,
    width: number,
    height: number,
    fill = '#ffffff',
    accent = '#2563eb',
  ) => {
    rect(`${name}_surface`, left, top, width, height, fill);
    rect(`${name}_accent`, left, top, 5, height, accent);
    text(`${name}_heading`, heading, left + 20, top + 16, width - 36, 28, 15, '#0f172a', 740);
    text(`${name}_body`, body, left + 20, top + 52, width - 38, height - 65, 14, '#475569', 430);
  };

  if (plan.layout === 'cover') {
    const background = { type: 'solid', color: '#08111f' } as SlideBackground;
    rect('cover_glow', 710, -10, 290, 572, '#112b49');
    rect('cover_rail', 62, 72, 7, 330, '#38bdf8');
    text(
      'cover_eyebrow',
      plan.eyebrow || '玄甲 · CYBERSECURITY',
      94,
      76,
      650,
      28,
      12,
      '#7dd3fc',
      760,
    );
    text('cover_title', plan.title, 94, 126, 650, 128, 40, '#f8fafc', 780, 'left', 'middle');
    if (plan.subtitle) text('cover_subtitle', plan.subtitle, 94, 270, 620, 70, 18, '#cbd5e1', 430);
    plan.bullets.slice(0, 3).forEach((item, index) => {
      rect(`cover_tag_${index}`, 94 + index * 205, 370, 187, 76, '#10233a');
      text(
        `cover_tag_num_${index}`,
        `0${index + 1}`,
        110 + index * 205,
        385,
        34,
        20,
        11,
        '#38bdf8',
        760,
      );
      text(`cover_tag_text_${index}`, item, 110 + index * 205, 409, 155, 30, 13, '#e2e8f0', 620);
    });
    text(
      'cover_page',
      String(order).padStart(2, '0'),
      890,
      510,
      54,
      22,
      11,
      '#7dd3fc',
      700,
      'right',
    );
    return { elements, background };
  }

  if (plan.layout === 'summary') {
    const background = { type: 'solid', color: '#0b1830' } as SlideBackground;
    text(
      'summary_eyebrow',
      plan.eyebrow || 'RECAP · TRANSFER',
      58,
      36,
      600,
      22,
      11,
      '#7dd3fc',
      760,
    );
    text('summary_title', plan.title, 58, 68, 884, 62, 31, '#f8fafc', 780);
    rect('summary_rule', 58, 139, 96, 5, '#38bdf8');
    plan.bullets.slice(0, 3).forEach((item, index) => {
      rect(
        `summary_card_${index}`,
        58 + index * 298,
        180,
        276,
        176,
        index === 1 ? '#102a45' : '#101f36',
      );
      text(
        `summary_num_${index}`,
        `0${index + 1}`,
        80 + index * 298,
        200,
        60,
        30,
        16,
        '#38bdf8',
        780,
      );
      text(`summary_item_${index}`, item, 80 + index * 298, 245, 232, 86, 18, '#e2e8f0', 650);
    });
    text('summary_question_label', '离场前回答', 58, 390, 150, 24, 12, '#7dd3fc', 750);
    text(
      'summary_question',
      plan.question || plan.callout || '你将如何把今天的方法迁移到新情境？',
      58,
      420,
      820,
      66,
      21,
      '#f8fafc',
      650,
    );
    text(
      'summary_page',
      String(order).padStart(2, '0'),
      890,
      520,
      54,
      20,
      11,
      '#7dd3fc',
      700,
      'right',
    );
    return { elements, background };
  }

  const background = { type: 'solid', color: '#f6f8fc' } as SlideBackground;
  header(
    plan.layout === 'checkpoint' ? '#d97706' : plan.layout === 'activity' ? '#059669' : '#2563eb',
  );

  if (plan.layout === 'comparison') {
    const left = plan.leftItems?.length ? plan.leftItems : plan.bullets.slice(0, 3);
    const right = plan.rightItems?.length ? plan.rightItems : plan.bullets.slice(2, 5);
    rect('compare_left', 58, 174, 420, 322, '#ffffff');
    rect('compare_right', 522, 174, 420, 322, '#ffffff');
    rect('compare_left_top', 58, 174, 420, 8, '#ef4444');
    rect('compare_right_top', 522, 174, 420, 8, '#10b981');
    text('compare_left_title', plan.leftTitle || '容易出错', 82, 199, 372, 34, 19, '#991b1b', 750);
    text(
      'compare_right_title',
      plan.rightTitle || '推荐做法',
      546,
      199,
      372,
      34,
      19,
      '#047857',
      750,
    );
    richText('compare_left_items', left, 82, 252, 366, 210, 16);
    richText('compare_right_items', right, 546, 252, 366, 210, 16);
  } else if (plan.layout === 'process' || plan.layout === 'timeline') {
    const steps = plan.steps?.length
      ? plan.steps
      : plan.bullets.slice(0, 4).map((detail, index) => ({ title: `步骤 ${index + 1}`, detail }));
    const count = Math.max(3, Math.min(4, steps.length));
    const width = count === 4 ? 202 : 272;
    const gap = count === 4 ? 24 : 34;
    rect('process_line', 100, 264, 800, 4, '#bfdbfe');
    steps.slice(0, count).forEach((step, index) => {
      const left = 58 + index * (width + gap);
      rect(`process_card_${index}`, left, 181, width, 265, '#ffffff');
      rect(`process_number_${index}`, left + 18, 201, 42, 42, index === 0 ? '#2563eb' : '#dbeafe');
      text(
        `process_number_text_${index}`,
        String(index + 1),
        left + 18,
        204,
        42,
        34,
        16,
        index === 0 ? '#ffffff' : '#1d4ed8',
        780,
        'center',
        'middle',
      );
      text(
        `process_title_${index}`,
        step.title,
        left + 18,
        264,
        width - 36,
        46,
        16,
        '#0f172a',
        740,
      );
      text(
        `process_detail_${index}`,
        step.detail,
        left + 18,
        318,
        width - 36,
        96,
        14,
        '#475569',
        430,
      );
    });
  } else if (plan.layout === 'case') {
    rect('case_context', 58, 177, 554, 319, '#ffffff');
    text('case_label', '场景与证据', 82, 198, 250, 28, 16, '#1d4ed8', 750);
    if (plan.subtitle) text('case_subtitle', plan.subtitle, 82, 239, 500, 62, 17, '#0f172a', 650);
    richText(
      'case_points',
      plan.bullets,
      82,
      plan.subtitle ? 319 : 248,
      500,
      plan.subtitle ? 150 : 220,
      15,
    );
    card(
      'case_question',
      '需要解释的问题',
      plan.question || plan.callout || plan.bullets[0],
      640,
      177,
      302,
      142,
      '#fff7ed',
      '#f59e0b',
    );
    card(
      'case_decision',
      '下一步判断',
      plan.rightItems?.[0] || plan.bullets[1] || '根据证据选择验证动作',
      640,
      342,
      302,
      154,
      '#ecfdf5',
      '#10b981',
    );
  } else if (plan.layout === 'code') {
    const code = plan.code || {
      language: 'text',
      filename: 'walkthrough.txt',
      lines: plan.bullets.map((item, index) => `${index + 1}. ${item}`),
    };
    elements.push({
      id: nextId('code_block'),
      type: 'code',
      left: 58,
      top: 174,
      width: 586,
      height: 324,
      rotate: 0,
      language: code.language,
      fileName: code.filename || undefined,
      showLineNumbers: true,
      fontSize: 14,
      lines: code.lines.slice(0, 12).map((line, index) => ({
        id: `L${index + 1}`,
        content: line,
      })),
    } as PPTElement);
    card(
      'code_focus',
      '走查重点',
      plan.callout || plan.bullets[0],
      674,
      174,
      268,
      134,
      '#eff6ff',
      '#2563eb',
    );
    card(
      'code_check',
      '验证问题',
      plan.question || plan.bullets[1] || '如何证明修改已经生效？',
      674,
      330,
      268,
      168,
      '#ffffff',
      '#0ea5e9',
    );
  } else if (plan.layout === 'activity' || plan.layout === 'checkpoint') {
    const accent = plan.layout === 'activity' ? '#059669' : '#d97706';
    rect(
      'activity_question',
      58,
      174,
      884,
      112,
      plan.layout === 'activity' ? '#ecfdf5' : '#fff7ed',
    );
    text(
      'activity_label',
      plan.layout === 'activity' ? '现在请完成' : '理解检查',
      82,
      192,
      180,
      24,
      12,
      accent,
      760,
    );
    text(
      'activity_question_text',
      plan.question || plan.callout || plan.title,
      82,
      224,
      822,
      46,
      20,
      '#0f172a',
      700,
    );
    const tasks = plan.bullets.slice(0, 3);
    tasks.forEach((item, index) => {
      const left = 58 + index * 298;
      rect(`activity_task_${index}`, left, 316, 276, 146, '#ffffff');
      text(`activity_task_num_${index}`, `0${index + 1}`, left + 20, 334, 44, 24, 12, accent, 780);
      text(`activity_task_text_${index}`, item, left + 20, 371, 236, 68, 15, '#334155', 620);
    });
    text(
      'activity_standard',
      `完成标准：${plan.takeaway || '能够说明依据、步骤和可观察结果'}`,
      58,
      481,
      884,
      30,
      13,
      '#475569',
      650,
    );
  } else {
    if (plan.subtitle)
      text('concept_subtitle', plan.subtitle, 58, 165, 884, 48, 17, '#475569', 430);
    const items = plan.bullets.slice(0, 4);
    const top = plan.subtitle ? 239 : 184;
    const columns = items.length >= 4 ? 2 : 3;
    const width = columns === 2 ? 430 : 278;
    const rows = columns === 2 ? 2 : 1;
    items.slice(0, columns * rows).forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const left = 58 + column * (width + (columns === 2 ? 24 : 24));
      const cardTop = top + row * 132;
      rect(`concept_card_${index}`, left, cardTop, width, columns === 2 ? 112 : 188, '#ffffff');
      text(
        `concept_num_${index}`,
        `0${index + 1}`,
        left + 18,
        cardTop + 16,
        42,
        24,
        12,
        '#2563eb',
        780,
      );
      text(
        `concept_item_${index}`,
        item,
        left + 18,
        cardTop + 52,
        width - 36,
        columns === 2 ? 46 : 104,
        columns === 2 ? 15 : 17,
        '#1e293b',
        650,
      );
    });
    if (plan.callout) {
      rect('concept_callout', 58, 480, 884, 34, '#dbeafe');
      text(
        'concept_callout_text',
        plan.callout,
        75,
        484,
        850,
        24,
        13,
        '#1d4ed8',
        700,
        'center',
        'middle',
      );
    }
  }

  footer();
  return { elements, background };
}

export function assembleTitleBullets(plan: SlidePlan): PPTElement[] {
  return assembleSlide({ ...plan, layout: plan.layout || 'concept' }, 1).elements;
}

export async function generateSlideViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedSlideContent | null> {
  const keyPoints = (outline.keyPoints || []).join('；');
  const prompts = buildPrompt(PROMPT_IDS.SLIDE_PLAN, {
    title: outline.title,
    keyPoints,
    description: outline.description || '',
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  let plan = fallbackPlan(outline);
  let generationFallback = true;
  if (prompts) {
    try {
      const raw = await aiCall(prompts.system, prompts.user);
      const parsed = parseSlidePlan(raw, outline);
      if (parsed) {
        plan = parsed;
        generationFallback = false;
      }
      if (!parsed) log.warn(`slide-plan parse failed for: ${outline.title}`);
    } catch (error) {
      log.warn(`slide-plan generation fell back for: ${outline.title}`, error);
    }
  } else {
    log.error('slide-plan prompt not found');
  }
  const built = assembleSlide(plan, outline.order);
  const compatibilityRemark = [plan.speakerNotes, plan.takeaway ? `本页收束：${plan.takeaway}` : '']
    .filter(Boolean)
    .join('\n');
  return {
    elements: built.elements,
    background: built.background,
    speakerNotes: plan.speakerNotes,
    remark: compatibilityRemark,
    layout: plan.layout,
    ...(generationFallback ? { generationFallback: true } : {}),
  } as GeneratedSlideContent;
}

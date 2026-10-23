import { z } from 'zod';
import { LEARNER_LANGUAGE_BRIEF } from '@/lib/teaching/learner-language';

const label = z.string().trim().min(1).max(48);
const shortText = z.string().trim().min(1).max(100);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const position = z.number().finite().min(0).max(1);
const box = z
  .object({
    left: z.number().min(24).max(952),
    top: z.number().min(20).max(520),
    width: z.number().min(60).max(952),
    height: z.number().min(22).max(510),
  })
  .superRefine((box, ctx) => {
    if (box.left + box.width > 976 || box.top + box.height > 542.5)
      ctx.addIssue({
        code: 'custom',
        message: 'Keep the complete region inside the 1000×562.5 canvas with a safe margin',
      });
  });
const textRegion = z.object({
  box,
  fontSize: z.number().min(18).max(60),
  align: z.enum(['left', 'center', 'right']).default('left'),
});
export const coursewareLayoutSchema = z
  .object({
    title: textRegion.extend({ fontSize: z.number().min(30).max(60) }),
    takeaway: textRegion,
    supporting: z.array(textRegion).max(3),
    visual: box,
  })
  .superRefine((layout, ctx) => {
    if (layout.title.fontSize < 30)
      ctx.addIssue({ code: 'custom', message: 'Title must be at least 30px' });
    if (layout.visual.width < 440 || layout.visual.height < 220)
      ctx.addIssue({ code: 'custom', message: 'Primary visual needs at least 440×220px' });
    const regions = [
      layout.title.box,
      layout.takeaway.box,
      ...layout.supporting.map((item) => item.box),
      layout.visual,
    ];
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i],
          b = regions[j];
        if (
          Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) > 1
        )
          ctx.addIssue({
            code: 'custom',
            message: `Independent layout regions ${i} and ${j} overlap`,
          });
      }
  });

export const coursewareThemeSchema = z.object({
  name: label,
  background: color,
  foreground: color,
  muted: color,
  accent: color,
  secondary: color,
  surface: color,
});

const diagramNode = z.object({
  id,
  label,
  x: position,
  y: position,
  form: z.enum(['rect', 'circle', 'diamond', 'cylinder']).default('rect'),
  detail: z.string().trim().min(8).max(500),
  value: z.string().max(32).optional(),
  group: label.optional(),
});
const diagramEdge = z.object({ id, from: id, to: id, label: z.string().max(32).optional() });
const diagramVisual = z.object({
  kind: z.literal('diagram'),
  nodes: z.array(diagramNode).min(2).max(12),
  edges: z.array(diagramEdge).min(1).max(20),
  relationship: shortText,
});
const chartVisual = z.object({
  kind: z.literal('chart'),
  chartType: z.enum(['bar', 'column', 'line', 'ring', 'area']),
  labels: z.array(label).min(2).max(12),
  series: z
    .array(z.object({ name: label, values: z.array(z.number().finite()).min(2).max(12) }))
    .min(1)
    .max(3),
  unit: z.string().max(24),
  basis: z.string().trim().min(4).max(240),
  illustrative: z.boolean(),
});
const comparisonVisual = z.object({
  kind: z.literal('comparison'),
  columns: z.array(label).min(2).max(3),
  rows: z
    .array(z.object({ label, values: z.array(shortText).min(2).max(3) }))
    .min(2)
    .max(5),
});
const codeVisual = z.object({
  kind: z.literal('code'),
  language: label,
  lines: z.array(z.string().max(100)).min(2).max(14),
  explanation: shortText,
});
const equationVisual = z.object({
  kind: z.literal('equation'),
  expression: z.string().trim().min(1).max(240),
  terms: z
    .array(z.object({ symbol: label, meaning: shortText }))
    .min(1)
    .max(5),
  example: shortText,
});
const imageVisual = z.object({
  kind: z.literal('image'),
  assetId: id,
  alt: z.string().min(8).max(240),
  caption: shortText,
  annotations: z
    .array(z.object({ label, x: position, y: position }))
    .max(4)
    .default([]),
});

const paint = z.union([
  color,
  z.enum(['background', 'foreground', 'muted', 'accent', 'secondary', 'surface', 'none']),
]);
const sceneBox = z.object({
  left: z.number().finite().min(0).max(1000),
  top: z.number().finite().min(0).max(520),
  width: z.number().finite().min(1).max(1000),
  height: z.number().finite().min(1).max(520),
});
const sceneObject = z.object({
  id,
  kind: z.enum(['rect', 'ellipse', 'path', 'text']),
  label,
  box: sceneBox,
  fill: paint,
  stroke: paint.optional(),
  strokeWidth: z.number().min(0).max(8).default(2),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  // Paths use a unit viewBox and contain geometry only, never SVG markup or executable code.
  path: z
    .string()
    .min(3)
    .max(3000)
    .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/)
    .optional(),
  text: z.string().min(1).max(150).optional(),
  fontSize: z.number().min(18).max(64).default(20),
  font: z.enum(['sans', 'mono']).default('sans'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  weight: z.enum(['normal', 'bold']).default('normal'),
  detail: z.string().min(8).max(400).optional(),
  gradient: z
    .object({
      type: z.enum(['linear', 'radial']),
      from: color,
      to: color,
      rotate: z.number().min(0).max(360).default(90),
    })
    .optional(),
});
const sceneVisual = z.object({
  kind: z.literal('scene'),
  description: z.string().min(12).max(500),
  // All boxes are local pixels within layout.visual, in back-to-front paint order.
  objects: z.array(sceneObject).min(3).max(90),
});

export const coursewareVisualSchema = z.discriminatedUnion('kind', [
  diagramVisual,
  chartVisual,
  comparisonVisual,
  codeVisual,
  equationVisual,
  imageVisual,
  sceneVisual,
]);

const beatSchema = z.object({
  id,
  title: label,
  explanation: z.string().trim().min(8).max(240),
  focusIds: z.array(id).max(12).default([]),
  activeEdgeIds: z.array(id).max(20).default([]),
  nodeStates: z
    .array(
      z.object({
        id,
        value: z.string().max(32).optional(),
        x: position.optional(),
        y: position.optional(),
        visible: z.boolean().optional(),
      }),
    )
    .max(12)
    .default([]),
  codeLines: z.array(z.number().int().min(1).max(14)).max(14).default([]),
  chartValues: z.array(z.array(z.number().finite()).min(2).max(12)).max(3).optional(),
  chartFocusIndexes: z.array(z.number().int().min(0).max(11)).max(12).default([]),
  equationState: z.object({
    expression: z.string().min(1).max(240).optional(),
    example: shortText.optional(),
  }).optional(),
  termFocusIndexes: z.array(z.number().int().min(0).max(4)).max(5).default([]),
  comparisonRowIndexes: z.array(z.number().int().min(0).max(4)).max(5).default([]),
  imageAnnotationIndexes: z.array(z.number().int().min(0).max(3)).max(4).optional(),
  objectStates: z
    .array(
      z.object({
        id,
        visible: z.boolean().optional(),
        left: z.number().min(0).max(1000).optional(),
        top: z.number().min(0).max(520).optional(),
        fill: paint.optional(),
        opacity: z.number().min(0).max(1).optional(),
        text: z.string().min(1).max(150).optional(),
      }),
    )
    .max(90)
    .default([]),
});

export const coursewarePageSchema = z
  .object({
    schema: z.literal('courseware-page-v2'),
    id,
    title: z.string().trim().min(2).max(40),
    objective: shortText,
    composition: z.enum(['wide', 'split', 'centerpiece', 'editorial']),
    layout: coursewareLayoutSchema.optional(),
    role: z.enum([
      'opening',
      'explanation',
      'worked-example',
      'practice',
      'check',
      'transfer',
      'closing',
    ]),
    takeaway: shortText,
    supporting: z.array(z.string().trim().min(1).max(55)).max(3).default([]),
    visual: coursewareVisualSchema,
    beats: z.array(beatSchema).max(6).default([]),
    check: z
      .object({
        question: z.string().trim().min(4).max(130),
        options: z
          .array(z.object({ id, label: shortText, feedback: z.string().trim().min(8).max(220) }))
          .min(2)
          .max(4),
        correctOptionId: id,
      })
      .optional(),
    speakerNotes: z.string().trim().min(80).max(1800),
    durationSeconds: z.number().int().min(15).max(900),
    evidence: z
      .array(z.object({ sourceId: z.string().min(1).max(160), claim: z.string().min(4).max(240) }))
      .max(8)
      .default([]),
  })
  .superRefine((page, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: 'custom', message, path });
    if (page.layout && page.layout.supporting.length !== page.supporting.length)
      issue('Every supporting point needs exactly one visible layout region', [
        'layout',
        'supporting',
      ]);
    if (['check', 'practice'].includes(page.role) && !page.check)
      issue('Practice and check pages require an actionable question with feedback', ['check']);
    if (page.check) {
      const ids = page.check.options.map((option) => option.id);
      if (new Set(ids).size !== ids.length || !ids.includes(page.check.correctOptionId))
        issue('Question options need unique IDs and one valid correctOptionId', ['check']);
    }
    if (new Set(page.beats.map((beat) => beat.id)).size !== page.beats.length)
      issue('Beat IDs must be unique', ['beats']);
    const visual = page.visual;
    if (visual.kind === 'diagram') {
      const ids = visual.nodes.map((node) => node.id);
      const edgeIds = visual.edges.map((edge) => edge.id);
      if (new Set(ids).size !== ids.length || new Set(edgeIds).size !== edgeIds.length)
        issue('Diagram object IDs must be unique', ['visual']);
      for (const edge of visual.edges)
        if (!ids.includes(edge.from) || !ids.includes(edge.to) || edge.from === edge.to)
          issue('Every edge must connect two actual distinct nodes', ['visual', 'edges']);
      for (const [i, beat] of page.beats.entries()) {
        if (
          beat.focusIds.some((id) => !ids.includes(id)) ||
          beat.nodeStates.some((state) => !ids.includes(state.id)) ||
          beat.activeEdgeIds.some((id) => !edgeIds.includes(id))
        )
          issue('Every animation target must refer to an actual diagram object', ['beats', i]);
        if (new Set(beat.nodeStates.map((state) => state.id)).size !== beat.nodeStates.length)
          issue('A beat cannot assign conflicting states to one node', ['beats', i]);
      }
    } else if (visual.kind === 'scene') {
      const ids = visual.objects.map((object) => object.id);
      if (new Set(ids).size !== ids.length) issue('Scene object IDs must be unique', ['visual']);
      for (const object of visual.objects) {
        if (object.kind === 'path' && !object.path)
          issue(`Scene path ${object.id} needs actual geometry`, ['visual']);
        if (object.kind === 'text' && !object.text)
          issue(`Scene text ${object.id} needs actual content`, ['visual']);
        if (object.kind !== 'text' && object.text !== undefined)
          issue(`Scene shape ${object.id} cannot display text: create a separate kind=text object for visible content`, ['visual']);
        if (object.kind === 'text' && object.fontSize < 18)
          issue(
            `Scene text ${object.id} must be at least 18px; reduce density instead of hiding labels in small text`,
            ['visual'],
          );
      }
      for (const [i, beat] of page.beats.entries()) {
        if (
          beat.focusIds.some((id) => !ids.includes(id)) ||
          beat.objectStates.some((state) => !ids.includes(state.id))
        )
          issue('Scene steps must target existing objects', ['beats', i]);
        if (new Set(beat.objectStates.map((state) => state.id)).size !== beat.objectStates.length)
          issue('A beat may assign each scene object only once', ['beats', i]);
        if (
          beat.objectStates.some(
            (state) =>
              state.text !== undefined &&
              visual.objects.find((object) => object.id === state.id)?.kind !== 'text',
          )
        )
          issue('Only text objects may change text', ['beats', i]);
      }
    } else if (visual.kind === 'chart') {
      if (visual.series.some((series) => series.values.length !== visual.labels.length))
        issue('Chart values must align one-to-one with labels', ['visual']);
      if (
        visual.chartType === 'ring' &&
        (visual.series.length !== 1 ||
          visual.series[0].values.some((value) => value < 0) ||
          visual.series[0].values.every((value) => value === 0))
      )
        issue('A ring chart needs one nonnegative, nonzero series', ['visual']);
      for (const [i, beat] of page.beats.entries())
        if (
          beat.chartValues &&
          (beat.chartValues.length !== visual.series.length ||
            beat.chartValues.some((values) => values.length !== visual.labels.length))
        )
          issue('Animated chart values must preserve the declared data dimensions', ['beats', i]);
    } else if (visual.kind === 'comparison') {
      if (visual.rows.some((row) => row.values.length !== visual.columns.length))
        issue('Comparison values must match the declared columns', ['visual']);
    } else if (visual.kind === 'code') {
      for (const [i, beat] of page.beats.entries())
        if (beat.codeLines.some((line) => line > visual.lines.length))
          issue('Code focus must refer to an existing line', ['beats', i]);
    }
    for (const [i, beat] of page.beats.entries()) {
      if ((beat.equationState || beat.termFocusIndexes.length) &&
          (visual.kind !== 'equation' || beat.termFocusIndexes.some(index => index >= visual.terms.length)))
        issue('Equation states and term focus require an equation with existing terms', ['beats', i]);
      if (beat.comparisonRowIndexes.length &&
          (visual.kind !== 'comparison' || beat.comparisonRowIndexes.some(index => index >= visual.rows.length)))
        issue('Comparison focus requires existing rows', ['beats', i]);
      if (beat.imageAnnotationIndexes &&
          (visual.kind !== 'image' || beat.imageAnnotationIndexes.some(index => index >= visual.annotations.length)))
        issue('Image steps require existing annotations', ['beats', i]);
      if (
        beat.chartFocusIndexes.length &&
        (visual.kind !== 'chart' ||
          beat.chartFocusIndexes.some((index) => index >= visual.labels.length))
      )
        issue('Chart focus requires actual data point indexes', ['beats', i]);
      if (
        (visual.kind !== 'diagram' && (beat.nodeStates.length || beat.activeEdgeIds.length)) ||
        (!['diagram', 'scene'].includes(visual.kind) && beat.focusIds.length)
      )
        issue('Diagram controls cannot target a different visual type', ['beats', i]);
      if (visual.kind !== 'scene' && beat.objectStates.length)
        issue('Object state changes require a scene visual', ['beats', i]);
      if (visual.kind !== 'code' && beat.codeLines.length)
        issue('Code focus requires a code visual', ['beats', i]);
      if (visual.kind !== 'chart' && beat.chartValues)
        issue('Chart updates require a chart visual', ['beats', i]);
    }
  });

export const coursewareDesignSchema = z
  .object({
    schema: z.literal('courseware-design-v2'),
    title: z.string().trim().min(2).max(100),
    audience: shortText,
    promise: shortText,
    objectives: z.array(shortText).min(1).max(8),
    theme: coursewareThemeSchema,
    pages: z
      .array(
        z.object({
          id,
          title: z.string().min(2).max(40),
          role: z.enum([
            'opening',
            'explanation',
            'worked-example',
            'practice',
            'check',
            'transfer',
            'closing',
          ]),
          composition: z.enum(['wide', 'split', 'centerpiece', 'editorial']),
          visualKind: z.enum([
            'scene',
            'diagram',
            'chart',
            'comparison',
            'code',
            'equation',
            'image',
          ]),
          objectiveIndexes: z.array(z.number().int().min(0).max(7)).min(1).max(8),
          visualReason: z.string().min(8).max(280),
          teachingAction: z.string().min(8).max(280),
          durationSeconds: z.number().int().min(15).max(900),
        }),
      )
      .min(1)
      .max(120),
  })
  .superRefine((design, ctx) => {
    const ids = design.pages.map((page) => page.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Page IDs must be unique', path: ['pages'] });
    const coverage = new Set(design.pages.flatMap((page) => page.objectiveIndexes));
    if (
      [...coverage].some((index) => index >= design.objectives.length) ||
      design.objectives.some((_, index) => !coverage.has(index))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Every objective needs an actual page, and page references must exist',
        path: ['pages'],
      });
  });

export type CoursewareTheme = z.infer<typeof coursewareThemeSchema>;
export type CoursewarePage = z.infer<typeof coursewarePageSchema>;
export type CoursewareDesign = z.infer<typeof coursewareDesignSchema>;
export type CoursewareVisual = z.infer<typeof coursewareVisualSchema>;

/** Recover small coordinate mistakes by translating intact regions, never shrinking text or dropping facts. */
export function normalizeCoursewarePageLayout(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schema' in value) ||
    value.schema !== 'courseware-page-v2'
  )
    return value;
  const page = structuredClone(value) as Record<string, any>;
  const layout = page.layout;
  if (!layout || typeof layout !== 'object') return page;
  const regions = [
    layout.title?.box,
    layout.takeaway?.box,
    layout.visual,
    ...(Array.isArray(layout.supporting) ? layout.supporting.map((item: any) => item?.box) : []),
  ];
  for (const region of regions) {
    if (
      !region ||
      !['left', 'top', 'width', 'height'].every(
        (key) => typeof region[key] === 'number' && Number.isFinite(region[key]),
      )
    )
      continue;
    const left = Math.max(24, Math.min(region.left, 976 - region.width));
    const top = Math.max(20, Math.min(region.top, 542.5 - region.height));
    if (region.width <= 952 && Math.abs(left - region.left) <= 24) region.left = left;
    if (region.height <= 522.5 && Math.abs(top - region.top) <= 24) region.top = top;
  }
  if (page.visual?.kind === 'scene' && Array.isArray(page.visual.objects) && Number.isFinite(layout.visual?.height)) {
    for (const object of page.visual.objects) {
      if (object.kind === 'text' && Number.isFinite(object.fontSize) && object.fontSize >= 12 && object.fontSize < 18)
        object.fontSize = 18;
      const box = object.box;
      if (box && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(box[key]))) {
        const left = Math.max(0, Math.min(box.left, layout.visual.width - box.width));
        const top = Math.max(0, Math.min(box.top, layout.visual.height - box.height));
        if (box.width <= layout.visual.width && Math.abs(left - box.left) <= 24) box.left = left;
        if (box.height <= layout.visual.height && Math.abs(top - box.top) <= 24) box.top = top;
      }
      if (object.kind !== 'text' || !object.box || !Number.isFinite(object.fontSize) || !Number.isFinite(object.box.height)) continue;
      const lineHeight = Math.ceil(object.fontSize * 1.2);
      if (object.box.height < lineHeight && lineHeight - object.box.height <= 8 && object.box.top + lineHeight <= layout.visual.height)
        object.box.height = lineHeight;
    }
  }
  return page;
}
export type CoursewareAsset = {
  id: string;
  src: string;
  source: string;
  alt: string;
  width: number;
  height: number;
};
export type CoursewareSlideData = {
  page: CoursewarePage;
  theme: CoursewareTheme;
  assets: CoursewareAsset[];
};

export const coursewareSlideDataSchema = z.object({
  page: coursewarePageSchema,
  theme: coursewareThemeSchema,
  assets: z
    .array(
      z.object({
        id,
        src: z
          .string()
          .max(3_000_000)
          .regex(/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/),
        source: z.string().min(1).max(1500),
        alt: z.string().min(1).max(240),
        width: z.number().positive().max(10000),
        height: z.number().positive().max(10000),
      }),
    )
    .max(6),
});

export const COURSEWARE_PLANNING_BRIEF = `${LEARNER_LANGUAGE_BRIEF}\n平台原生现代课件能力：整套设计、自由矢量场景(scene)、真实数据图表、带有连接关系的机制图、逐步代码走查、公式与数值实例、对齐比较、经过验证的图片与标注、逐步讲解、可作答并给即时解释的理解检查。scene能用任意原生形状、曲线、渐变、文字组成真正的科学插图、空间示意、数据结构和状态轨迹，并能逐对象移动、变色、显隐、更新文字。具体事物的形态/空间/过程优先scene，抽象关系才用diagram；不能用带名称的圆圈和流程框冒充实际插图。能力边界必须影响设计：code只有真实代码行与逐行高亮，需要代码加变量轨迹双栏应选scene（等宽文本+状态对象）；equation只有一个可逐步替换的主LaTeX公式、术语解释与数值算例，需要复杂多栏推导应选scene；comparison是真正的表格和行聚焦，不是比例条形图，需要长度/数量比例应选chart或scene。不要在visualReason里承诺所选类型不存在的结构。每页应围绕一个明确可见的关系构图，主视觉占据主要空间，解释进入讲稿。简短要求由智能体补全教学设计和美术方向，不要求教师写长提示词或选择技术组件。不要额外加入“禁止图片/三维/动画”等教师没有提出的限制；有明确页数或呈现方式时忠实保留。只有被真正渲染的数据、模型、关系与互动才算完成，设计说明本身不算。`;

import { createHash } from 'node:crypto';
import { isEqual } from 'lodash';
import { z } from 'zod';
import { coursewareDisplayPositions } from '@/lib/courseware-studio/document';
import { openCoursewareLayoutCheckpoint } from '@/lib/courseware/checkpoints';
import { compileCoursewareSlide, inspectCoursewareSlide } from '@/lib/courseware/compiler';
import { inspectRenderedCourseware } from '@/lib/courseware/render-client';
import { reconcileOrdinarySlideCanvas } from '@/lib/courseware/saved-canvas';
import {
  COURSEWARE_MAX_PAGES,
  coursewareLayoutSchema,
  coursewareSlideDataSchema,
} from '@/lib/courseware/schema';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { recordHarnessUsage } from './classroom-turn';
import { hasMeasuredLessonUsage } from './ordinary-lesson-plan';
import type { OrdinaryTeachingModel } from './ordinary-teaching';

type Studio = z.infer<typeof coursewareSlideDataSchema>;
type Layout = z.infer<typeof coursewareLayoutSchema>;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null;

const requestFields = z.object({
  instruction: z
    .string()
    .max(500)
    .refine(
      (value) =>
        !/[\r\n\u2028\u2029\x00-\x1f<>`]|(?:https?|ftp|file|data|javascript):|源码第|所选范围|原始源码|靶场|攻防演练|漏洞复现|漏洞利用|攻击步骤|可执行载荷|\b(?:ctf|exploit)\b/i.test(
          value,
        ),
    )
    .transform((value) => value.trim())
    .pipe(z.string().min(1)),
  expectedRevision: z.number().int().positive(),
  artifactId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  titleFontDirection: z.enum(['increase', 'decrease']).optional(),
  pageSelection: z.union([
    z.literal('all'),
    z.array(z.number().int().positive()).min(1).max(COURSEWARE_MAX_PAGES),
  ]),
});
const geometry = z.strictObject({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});
const textRegion = z.strictObject({
  box: geometry,
  fontSize: z.number(),
  align: z.enum(['left', 'center', 'right']),
});
const modelLayout = z.strictObject({
  layout: z.strictObject({
    title: textRegion,
    takeaway: textRegion,
    supporting: z.array(textRegion).max(3),
    visual: geometry,
  }),
});

export class OrdinaryLayoutError extends Error {
  constructor(
    readonly status: 409 | 422 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function invalid(message: string) {
  return new OrdinaryLayoutError(422, 'INVALID_ORDINARY_SLIDE_LAYOUT', message);
}

function lockedRegions(original: Layout, reconciled: Layout) {
  return [
    ...(!isEqual(original.title, reconciled.title) ? ['title'] : []),
    ...(!isEqual(original.takeaway, reconciled.takeaway) ? ['takeaway'] : []),
    ...reconciled.supporting.flatMap((item, index) =>
      isEqual(original.supporting[index], item) ? [] : [`supporting.${index}`],
    ),
  ];
}

function explicitOriginalLayout(original: Studio) {
  if (original.page.layout) return original;
  const baseline = compileCoursewareSlide(original);
  const byId = new Map(baseline.textBoxes.map((box) => [box.id, box]));
  const region = (id: string) => {
    const value = byId.get(id);
    if (!value) return undefined;
    const { left, top, width, height, fontSize } = value;
    return { box: { left, top, width, height }, fontSize, align: 'left' };
  };
  const result = coursewareSlideDataSchema.safeParse({
    ...original,
    page: {
      ...original.page,
      legacyCompositionTypography: true,
      layout: {
        title: region('page-title'),
        takeaway: region('page-promise'),
        supporting: original.page.supporting.map((_, index) => region(`support-${index}`)),
        visual: baseline.visualBounds,
      },
    },
  });
  return result.success && isEqual(compileCoursewareSlide(result.data).elements, baseline.elements)
    ? result.data
    : null;
}

export function ordinarySlideLayoutTarget(payload: RecordValue) {
  const fields = requestFields.safeParse(payload);
  if (!fields.success) throw invalid('请提供单行版式要求、当前版本和要调整的页码。');
  const { pageSelection, titleFontDirection } = fields.data;
  if (titleFontDirection && (pageSelection === 'all' || pageSelection.length !== 1)) {
    throw invalid('标题字号修订需要指定一页。');
  }
  const content = record(payload.currentContent);
  const lesson = record(content?.lesson);
  const artifacts: unknown[] = Array.isArray(lesson?.artifacts) ? lesson.artifacts : [];
  if (!content || !lesson || !artifacts.length || artifacts.length > COURSEWARE_MAX_PAGES) {
    throw invalid('课件原稿尚未准备好进行版式修订。');
  }
  const pages = artifacts.map((raw) => {
    const artifact = record(raw);
    const native = record(artifact?.content);
    const savedStudio = record(native?.studio);
    const savedPage = record(savedStudio?.page);
    const parsed = coursewareSlideDataSchema.safeParse(savedStudio);
    if (
      artifact?.type !== 'slide' ||
      !native ||
      !savedStudio ||
      !savedPage ||
      !parsed.success ||
      !['image', 'chart', 'comparison'].includes(parsed.data.page.visual.kind) ||
      parsed.data.page.beats.length ||
      parsed.data.page.check
    ) {
      throw invalid('只有完整的普通静态原生课件支持版式修订。');
    }
    return { artifact, native, savedStudio, savedPage, original: parsed.data };
  });
  const ids = pages.map((page) => page.original.page.id);
  if (new Set(ids).size !== pages.length) throw invalid('课件页标识重复，无法安全修订。');
  const positions = coursewareDisplayPositions(pages.map((page) => page.artifact));
  const pageNumbers =
    pageSelection === 'all'
      ? pages.map((_, index) => index + 1)
      : [...pageSelection].sort((a, b) => a - b);
  if (
    new Set(pageNumbers).size !== pageNumbers.length ||
    pageNumbers.some((number) => number > pages.length)
  ) {
    throw invalid('请选择不同的有效课件页码。');
  }
  const targets = pageNumbers.map((pageNumber) => {
    const position = positions[pageNumber - 1];
    const page = pages[position];
    let baseline: Studio | null = null;
    let studio: Studio | null = null;
    try {
      baseline = explicitOriginalLayout(page.original);
      if (baseline) studio = reconcileOrdinarySlideCanvas(page.native, baseline);
    } catch {
      // An old template can have no exact, schema-valid canonical layout.
    }
    if (!studio?.page.layout || !baseline?.page.layout) {
      throw new OrdinaryLayoutError(
        409,
        'ORDINARY_SLIDE_LAYOUT_CANVAS_CONFLICT',
        `第 ${pageNumber} 页有无法安全合并的画布修改或布局。当前版本已保留。`,
      );
    }
    const locked = lockedRegions(baseline.page.layout, studio.page.layout);
    if (titleFontDirection && locked.includes('title')) {
      throw new OrdinaryLayoutError(
        409,
        'ORDINARY_SLIDE_LAYOUT_CANVAS_CONFLICT',
        `第 ${pageNumber} 页的标题有手工排版。当前版本已保留。`,
      );
    }
    return { ...page, studio, layout: studio.page.layout, pageNumber, position, locked };
  });
  return { ...fields.data, content, lesson, artifacts, targets };
}

const system = [
  '只调整普通课堂幻灯片的区域几何和文字对齐、字号。只能修改满足本轮教师要求所需的字段，保留其他区域。',
  'layout 是 1000×562.5 像素画布上已有区域。lockedRegions 中的区域必须原样保留，不能增删 supporting 区域。',
  '不要补写教学文字、标题、图片、网址、HTML、代码、备注或其他字段。只返回一个 JSON 对象 {"layout":{...}}，其中保留现有布局的键和结构。',
  '区域须保留安全边距，不得重叠。视觉主区域至少为 440×220。',
].join('\n');

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const proofSchema = z.object({
  mode: z.literal('headless-chromium-dom-and-pixels'),
  sourceSha256: digest,
  inspectedAt: z.string().min(1).max(64),
  frames: z.tuple([z.object({ step: z.literal(-1), screenshotSha256: digest })]),
});
const pageCheckpoint = modelLayout.extend({
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    })
    .refine((value) => value.inputTokens + value.outputTokens > 0),
  evidence: proofSchema.optional(),
});

export async function reviseOrdinarySlideLayout(
  target: ReturnType<typeof ordinarySlideLayoutTarget>,
  model: OrdinaryTeachingModel,
  scope: { jobId: string; ownerId: number; dojoId: number; moduleIndex?: number | null },
) {
  const checkpoint = await openCoursewareLayoutCheckpoint(
    {
      ...scope,
      artifactId: target.artifactId,
      revision: target.expectedRevision,
      model: model.modelId,
      requestHash: hash(target.titleFontDirection
        ? [target.instruction, target.titleFontDirection] : target.instruction),
      deckHash: hash(target.artifacts),
      pages: target.targets.map((page) => ({
        number: page.pageNumber,
        source: hash(page.studio),
        locks: page.locked,
      })),
    },
    (entry) => pageCheckpoint.parse(entry),
    process.env.COURSEWARE_CHECKPOINT_DIR,
  );
  // Keep each execution safely inside both the Next handler and worker read deadlines.
  const signal = AbortSignal.any([model.signal, AbortSignal.timeout(25 * 60 * 1000)]);
  const assessPage = async (page: (typeof target.targets)[number]) => {
    const id = page.studio.page.id;
    signal.throwIfAborted();
    let entry = await checkpoint.read(id);
    const saved = Boolean(entry);
    if (!entry) {
      const user = JSON.stringify({
        instruction: target.instruction,
        pageNumber: page.pageNumber,
        pageCount: target.artifacts.length,
        role: page.studio.page.role,
        visualKind: page.studio.page.visual.kind,
        layout: page.layout,
        lockedRegions: page.locked,
      });
      const response = await model.turn(
        [
          { role: 'system', content: target.titleFontDirection
            ? system + '\n只修改标题的 fontSize，按本轮要求增大或减小。其他字段必须原样保留。'
            : system },
          { role: 'user', content: user },
        ],
        signal,
      );
      await recordHarnessUsage(response, 'ordinary-slide-layout');
      if (response.model !== model.modelId || !hasMeasuredLessonUsage(response))
        throw new Error('Invalid model receipt');
      const proposal = modelLayout.safeParse(
        response.text.length <= 16_000 ? parseJsonResponse(response.text) : null,
      );
      if (!proposal.success) throw invalid(`第 ${page.pageNumber} 页返回了无效的布局字段。`);
      const {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens,
      } = response.usage;
      entry = {
        layout: proposal.data.layout,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: total_tokens ?? inputTokens + outputTokens,
        },
      };
    }

    const nextLayout = entry.layout;
    if (target.titleFontDirection) {
      const previous = page.layout.title.fontSize;
      const current = nextLayout.title.fontSize;
      const correctDirection = target.titleFontDirection === 'increase' ? current > previous : current < previous;
      const restored = { ...nextLayout, title: { ...nextLayout.title, fontSize: previous } };
      if (!correctDirection || !isEqual(page.layout, restored)) {
        throw invalid(`第 ${page.pageNumber} 页必须只按指定方向改变标题字号。`);
      }
    }
    const changesLocked = page.locked.some((region) =>
      region === 'title'
        ? !isEqual(page.layout.title, nextLayout.title)
        : region === 'takeaway'
          ? !isEqual(page.layout.takeaway, nextLayout.takeaway)
          : !isEqual(
              page.layout.supporting[Number(region.split('.')[1])],
              nextLayout.supporting[Number(region.split('.')[1])],
            ),
    );
    if (changesLocked)
      throw new OrdinaryLayoutError(
        409,
        'ORDINARY_SLIDE_LAYOUT_CANVAS_CONFLICT',
        `第 ${page.pageNumber} 页调整与已保存的手工画布冲突。当前版本已保留。`,
      );
    const updated = coursewareSlideDataSchema.safeParse({
      ...page.studio,
      page: { ...page.studio.page, layout: nextLayout },
    });
    if (!updated.success || inspectCoursewareSlide(updated.data).length) {
      throw invalid(`第 ${page.pageNumber} 页新布局越界、重叠或无法容纳现有内容。`);
    }

    const changed = !isEqual(nextLayout, page.layout);
    const inspectorInput = changed ? updated.data : page.studio;
    const sourceHash = hash(inspectorInput);
    if (!saved) await checkpoint.save(id, entry);
    if (entry.evidence?.sourceSha256 !== sourceHash) {
      const rendered = await inspectRenderedCourseware(inspectorInput, signal).catch(() => {
        throw new OrdinaryLayoutError(
          503,
          'ORDINARY_SLIDE_LAYOUT_INSPECTOR_UNAVAILABLE',
          '课件浏览器渲染验收暂不可用。当前版本已保留。',
        );
      });
      if (rendered.issues.length)
        throw invalid(`第 ${page.pageNumber} 页未通过浏览器渲染验收。当前版本已保留。`);
      const proof = proofSchema.safeParse(rendered.evidence);
      if (!proof.success || proof.data.sourceSha256 !== sourceHash) {
        throw new OrdinaryLayoutError(
          503,
          'ORDINARY_SLIDE_LAYOUT_INSPECTOR_UNAVAILABLE',
          '课件浏览器检查回执缺失或不匹配。当前版本已保留。',
        );
      }
      entry = { ...entry, evidence: proof.data };
      await checkpoint.save(id, entry);
    }
    const artifact = changed
      ? {
          ...page.artifact,
          content: {
            ...page.native,
            elements: compileCoursewareSlide(updated.data).elements,
            studio: {
              ...page.savedStudio,
              page: {
                ...page.savedPage,
                layout: nextLayout,
                ...(updated.data.page.legacyCompositionTypography
                  ? { legacyCompositionTypography: true }
                  : {}),
              },
            },
          },
        }
      : undefined;
    return {
      id,
      position: page.position,
      artifact,
      usage: entry.usage,
      evidence: { ...entry.evidence, pageId: id },
    };
  };

  const artifacts = [...target.artifacts];
  const pageIds: string[] = [];
  const changedPageIds: string[] = [];
  const renderEvidence: RecordValue[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  // A small batch cooperates with the browser queue and preserves receipt display order.
  for (let index = 0; index < target.targets.length; index += 4) {
    const settled = await Promise.allSettled(
      target.targets.slice(index, index + 4).map(assessPage),
    );
    for (const item of settled) {
      if (item.status === 'rejected') {
        if (item.reason instanceof OrdinaryLayoutError) throw item.reason;
        throw new OrdinaryLayoutError(
          503,
          'ORDINARY_SLIDE_LAYOUT_UNAVAILABLE',
          '普通课件版式服务暂不可用。当前版本已保留，可重试。',
        );
      }
      const page = item.value;
      pageIds.push(page.id);
      renderEvidence.push(page.evidence);
      usage.inputTokens += page.usage.inputTokens;
      usage.outputTokens += page.usage.outputTokens;
      usage.totalTokens += page.usage.totalTokens;
      if (page.artifact) {
        artifacts[page.position] = page.artifact;
        changedPageIds.push(page.id);
      }
    }
  }
  if (!changedPageIds.length) throw invalid('课件几何、字号和对齐均未改变。当前版本已保留。');
  return {
    result: {
      content: {
        ...target.content,
        lesson: { ...target.lesson, artifacts, updatedAt: Date.now() },
        revisionMetadata: {
          mode: 'ordinary-slide-layout',
          pageIds,
          changedPageIds,
          renderEvidence,
        },
      },
    },
    usage,
  };
}

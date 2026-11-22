import { coursewareDisplayPositions } from '@/lib/courseware-studio/document';
import { inspectRenderedCourseware } from '@/lib/courseware/render-client';
import { reviseModernCourseware } from '@/lib/courseware/revision';
import { reconcileOrdinarySlideCanvas } from '@/lib/courseware/saved-canvas';
import { COURSEWARE_MAX_PAGES, coursewareSlideDataSchema } from '@/lib/courseware/schema';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { mergeUsage } from '@/lib/server/teacher-agent';
import type { LessonArtifact } from '@/lib/types/lesson';
import { deckText, inspectOrdinaryDeckTextPage } from './ordinary-deck-revision';
import { ordinarySlidePatch, ordinaryTeachingRules, ordinaryTeachingText, type OrdinaryTeachingModel } from './ordinary-teaching';

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function ordinarySlideTarget(payload: Record<string, unknown>) {
  const specification = typeof payload.instruction === 'string' ? payload.instruction.trim() : '';
  if (specification.length > 4096) return {error: '本次文字修订要求过长。'};
  const match = /^(?:请\s*)?(?:只|仅)\s*(?:修改|调整|润色)\s*(.*?)\s*(?:的\s*)?(?:文字|文案|措辞)\s*[：:]\s*([\s\S]+)$/u.exec(specification);
  if (!match || !match[1].includes('页') || !match[2].trim() || match[2].trim().length > 2000) {
    return {error: '请指定要润色的页码和文字要求，例如“仅润色第2、4页的文字：改用初学者能理解的措辞”。'};
  }
  const pageNumbers = match[1].trim().split(/\s*[、,，和及]\s*/u).map(raw => {
    const page = /^(?:第\s*)?([1-9][0-9]{0,2})(?:\s*页)?$/u.exec(raw);
    return page ? Number(page[1]) : 0;
  });
  if (pageNumbers.includes(0) || new Set(pageNumbers).size !== pageNumbers.length ||
      pageNumbers.length > COURSEWARE_MAX_PAGES) {
    return {error: `请逐一列出不同的页码，每次最多 ${COURSEWARE_MAX_PAGES} 页。`};
  }

  const content = recordValue(payload.currentContent);
  const lesson = recordValue(content?.lesson);
  const artifacts = Array.isArray(lesson?.artifacts) ? lesson.artifacts : [];
  if (!content || !lesson || !artifacts.length || artifacts.some(item =>
    recordValue(item)?.type !== 'slide' ||
    recordValue(recordValue(recordValue(recordValue(item)?.content)?.studio)?.page)?.schema !== 'courseware-page-v2'
  )) return {error: '课件原稿尚未准备好进行文字修订。'};
  if (pageNumbers.some(page => page > artifacts.length)) return {error: '选中的页码超出了当前课件。'};

  const allPageIds = artifacts.map(item => {
    const studio = recordValue(recordValue(recordValue(item)?.content)?.studio);
    return recordValue(studio?.page)?.id;
  });
  if (allPageIds.some(id => typeof id !== 'string' || !id) || new Set(allPageIds).size !== artifacts.length) {
    return {error: '课件页标识缺失或重复，无法安全修订。'};
  }
  const pageIds: string[] = [];
  const displayPositions = coursewareDisplayPositions(artifacts.map(item => recordValue(item) || {}));
  const reconciledArtifacts = displayPositions.map(index => artifacts[index]) as LessonArtifact[];
  for (const number of pageNumbers.sort((a, b) => a - b)) {
    const native = recordValue(recordValue(reconciledArtifacts[number - 1])?.content);
    const target = coursewareSlideDataSchema.safeParse(native?.studio);
    if (!target.success || !['image', 'chart', 'comparison'].includes(target.data.page.visual.kind) ||
        target.data.page.beats.length || target.data.page.check) {
      return {error: `第${number}页不符合静态课件文字修订条件。`};
    }
    const studio = reconcileOrdinarySlideCanvas(native, target.data);
    if (!studio) {
      return {
        error: `第${number}页有手工画布修改。当前版本已保留，请在课件画布编辑器中调整该页文字。`,
        canvasConflict: true,
      };
    }
    if (studio !== target.data) {
      const original = reconciledArtifacts[number - 1];
      const savedStudio = recordValue(native?.studio);
      const savedPage = recordValue(savedStudio?.page);
      const updatedStudio = {
        ...studio, ...savedStudio,
        page: {...studio.page, ...savedPage, layout: studio.page.layout},
      };
      reconciledArtifacts[number - 1] = {...original, content: {...original.content, studio: updatedStudio}};
    }
    pageIds.push(studio.page.id);
  }
  return {content, lesson, artifacts: reconciledArtifacts, storedArtifacts: artifacts, displayPositions, pageIds, instruction: match[2].trim()};
}

export class OrdinarySlideModelUnavailable extends Error {}

const ordinarySlideSystem = ordinaryTeachingRules + '\n' +
  '只润色当前页中列出的现有教学文字。逐字保留每个字段的 protectedLiterals；只修改需要调整的字段。' +
  '使用较简洁的措辞以适应原版面。返回 JSON {"changes":[{"op":"set","path":["title"],"value":"新文字"}]}。' +
  'path 由字段名和数字数组下标组成，只能使用 editableTextFields 列出的路径。';

export async function reviseOrdinarySlide(
  target: Exclude<ReturnType<typeof ordinarySlideTarget>, {error: string}>,
  model: OrdinaryTeachingModel,
  deckCall?: AICallFn,
) {
  let usage: Record<string, number> = {};
  const revised = await reviseModernCourseware({
    artifacts: target.artifacts, instruction: target.instruction,
    onlyPageIds: target.pageIds, textOnlyPageIds: target.pageIds,
    inspectRendered: deckCall ? data => inspectOrdinaryDeckTextPage(data, model.signal) : inspectRenderedCourseware,
    projectedTextPatch: async (instruction, editableTextFields) => {
      const prompt = JSON.stringify({instruction, editableTextFields});
      if (deckCall) {
        const patch = ordinarySlidePatch(parseJsonResponse<unknown>(await deckCall(ordinarySlideSystem, prompt)));
        if (patch.changes.some(change => deckText.test(change.value))) {
          throw new Error('课件文字修订内容超出普通静态课堂范围。');
        }
        return patch;
      }
      const result = await ordinaryTeachingText(model, ordinarySlideSystem, prompt, 'generate-classroom')
        .catch(() => { throw new OrdinarySlideModelUnavailable(); });
      usage = mergeUsage(usage, result.usage);
      return ordinarySlidePatch(parseJsonResponse<unknown>(result.text));
    },
  });
  const design = recordValue(target.content.coursewareDesign);
  const editedTitles = new Map(
    revised.artifacts.flatMap(item => {
      const id = recordValue(recordValue(recordValue(item.content)?.studio)?.page)?.id;
      return typeof id === 'string' && target.pageIds.includes(id) ? [[id, item.title] as const] : [];
    }),
  );
  const storedArtifacts = [...target.storedArtifacts];
  target.displayPositions.forEach((index, displayIndex) => {
    storedArtifacts[index] = revised.artifacts[displayIndex];
  });
  const next = {
    ...target.content,
    lesson: { ...target.lesson, artifacts: storedArtifacts, updatedAt: Date.now() },
    ...(Array.isArray(design?.pages) ? {coursewareDesign: {
      ...design, pages: design.pages.map(page => {
        const item = recordValue(page);
        const title = typeof item?.id === 'string' ? editedTitles.get(item.id) : undefined;
        return title === undefined ? page : {...item, title};
      }),
    }} : {}),
    revisionMetadata: {
      mode: 'ordinary-slide-wording',
      ...(target.pageIds.length === 1 ? {pageId: target.pageIds[0]} : {}),
      pageIds: target.pageIds,
      renderEvidence: revised.revision.renderEvidence,
    },
  };
  return {result: {content: next}, usage};
}

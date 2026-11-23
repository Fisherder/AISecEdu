import type { z } from 'zod';
import { reviewAndRepairCourseware } from '@/lib/courseware/content-review';
import { generateModernCourseware } from '@/lib/courseware/generation';
import type { inspectRenderedCourseware } from '@/lib/courseware/render-client';
import { slideDeckPageCountIssue } from '@/lib/server/slide-page-policy';
import type { GeneratedSlideContent } from '@/lib/types/generation';
import { combinedDeckRevisionSchema, inspectOrdinaryDeckPage, ordinaryDeckPageRequirement, ordinaryDeckTarget, ordinaryDeckTurn, reviseOrdinaryDeckPalette, selectOrdinaryDeckTextPages } from './ordinary-deck-revision';
import { OrdinaryLayoutError } from './ordinary-slide-layout';
import { ordinarySlideTarget, reviseOrdinarySlide } from './ordinary-slide-wording';
import type { OrdinaryTeachingModel } from './ordinary-teaching';
import { jobRecord } from './ordinary-slide-revision-contract';

export async function reviseOrdinaryDeck(target: ReturnType<typeof ordinaryDeckTarget>, model: OrdinaryTeachingModel) {
  const policy = ordinaryDeckPageRequirement(target.instruction);
  const turn = ordinaryDeckTurn(target, model);
  if (policy && slideDeckPageCountIssue(target.targets.length, policy)) {
    if (target.targets.some(({studio, locked}) => studio.assets.length || locked.length) ||
        /保留(?:原稿|原有|当前)(?:页面|画布|布局|不变)?|不改(?:原|已有|现有)/.test(target.instruction)) {
      throw new OrdinaryLayoutError(422, 'INVALID_ORDINARY_DECK',
        '图片、手工画布或明确要求保留的原稿不能整套重排。请在课件编辑器中增删页面。');
    }
    const plan = {title: target.lesson.title, priorTeachingPages: turn.pages, pageCountPolicy: policy};
    const request = target.instruction;
    const inspectRendered: typeof inspectRenderedCourseware = data => inspectOrdinaryDeckPage(data, model.signal);
    const generated = await generateModernCourseware({
      request, plan, pageRequirement: policy, aiCall: turn.aiCall, inspectRendered,
      staticTeaching: true, sourceIds: [],
    });
    const reviewed = await reviewAndRepairCourseware({
      request, design: generated.design, artifacts: generated.artifacts, aiCall: turn.aiCall, inspectRendered,
    });
    const finalDesign = reviewed.design || generated.design;
    const coursewareDesign = {...finalDesign, pages: finalDesign.pages.map((page, index) => {
      const current = (reviewed.artifacts[index].content as GeneratedSlideContent).studio!.page;
      return {...page, title: current.title, visualKind: current.visual.kind, composition: current.composition};
    })};
    if (slideDeckPageCountIssue(reviewed.artifacts.length, policy)) {
      throw new Error('The recomposed deck does not satisfy the requested page count');
    }
    return {usage: turn.usage, result: {content: {
      ...target.content, coursewareDesign,
      plan: {...jobRecord(target.content.plan), pageCountPolicy: policy},
      lesson: {...target.lesson, title: generated.design.title, description: generated.design.promise,
        artifacts: reviewed.artifacts, updatedAt: Date.now()},
      revisionMetadata: {mode: 'ordinary-deck-revision', recomposed: true, requestedPages: policy,
        renderEvidence: reviewed.artifacts.map((artifact, index) => {
          const {page} = (artifact.content as GeneratedSlideContent).studio!;
          return reviewed.finalRenderEvidence[page.id] || generated.quality.renderEvidence[index];
        })},
    }}};
  }

  const pageNumbers = await selectOrdinaryDeckTextPages(target, turn);
  const wording = ordinarySlideTarget({currentContent: target.content, instruction:
    `只修改第${pageNumbers.join('、')}页的文字：${target.instruction}`});
  if (wording.error || !wording.pageIds) throw new Error(wording.error || '当前课件文字无法安全修订。');
  const revised = await reviseOrdinarySlide(wording, model, turn.aiCall);
  return {usage: turn.usage, result: {content: {...revised.result.content, revisionMetadata: {
    ...revised.result.content.revisionMetadata, mode: 'ordinary-deck-revision', recomposed: false,
  }}}};
}

export async function reviseOrdinaryDeckPaletteAndWording(
  target: ReturnType<typeof ordinaryDeckTarget>,
  model: OrdinaryTeachingModel,
  intent: z.infer<typeof combinedDeckRevisionSchema>,
) {
  const palette = await reviseOrdinaryDeckPalette(
    { ...target, instruction: intent.paletteInstruction }, model, intent.originalPalette,
  );
  const intermediate = palette.result.content;
  const wordingTurn = ordinaryDeckTurn(target, model);
  const pageNumbers = target.targets.map(({pageNumber}) => pageNumber);
  const wording = ordinarySlideTarget({
    currentContent: intermediate,
    instruction: `只修改第${pageNumbers.join('、')}页的文字：${intent.wordingInstruction}`,
  });
  if (wording.error || !wording.pageIds) {
    throw new OrdinaryLayoutError(422, 'INVALID_ORDINARY_DECK', wording.error || '课件文字无法安全修订。');
  }
  const revised = await reviseOrdinarySlide(wording, model, wordingTurn.aiCall, {titlesOnly: intent.titlesOnly});
  const revision = revised.result.content.revisionMetadata;
  const usage = {
    inputTokens: palette.usage.inputTokens + wordingTurn.usage.inputTokens,
    outputTokens: palette.usage.outputTokens + wordingTurn.usage.outputTokens,
    totalTokens: palette.usage.totalTokens + wordingTurn.usage.totalTokens,
  };
  return {
    result: {
      content: {
        ...revised.result.content,
        revisionMetadata: {
          mode: 'ordinary-deck-revision',
          operation: 'palette-wording',
          recomposed: false,
          pageIds: revision.pageIds,
          renderEvidence: revision.renderEvidence,
          stageUsage: { palette: palette.usage, wording: wordingTurn.usage },
        },
      },
      paletteStageContent: intermediate,
    },
    usage,
  };
}

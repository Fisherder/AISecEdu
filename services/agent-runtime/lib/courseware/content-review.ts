import { z } from 'zod';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { LessonArtifact } from '@/lib/types/lesson';
import { COURSEWARE_PLANNING_BRIEF, type CoursewareSlideData, type CoursewareDesign } from './schema';
import { coursewareModelStage, CoursewareGenerationError } from './generation';
import { reviseModernCourseware } from './revision';
import type { CoursewareCheckpoint } from './checkpoints';
import { compileCoursewareSlide } from './compiler';
import { LEARNER_LANGUAGE_REVIEW_BRIEF, learnerLanguageReviewSchema, validateLearnerLanguageReview } from '@/lib/teaching/learner-language';
import { coursewareLanguageUnit } from '@/lib/teaching/learner-language-surfaces';

// Give reviewers the actual compiler's text transitions and table shape, not
// guessed meanings of similarly named JSON fields. Browser layout QA remains
// separate; this is source-derived render context, not a screenshot verdict.
export function coursewareReviewRenderContext(artifacts: LessonArtifact[]) {
  return artifacts.map(artifact => {
    const data = 'studio' in artifact.content ? artifact.content.studio : undefined;
    if (!data) throw new Error('Missing review render source');
    let previous = new Map<string, string>();
    let previousElements = new Map<string, Record<string, unknown>>();
    const frames = Array.from({ length: data.page.beats.length + 1 }, (_, index) => {
      const step = index - 1;
      const compiled = compileCoursewareSlide(data, step);
      const current = new Map(compiled.textBoxes.map(box => [box.id, box.text]));
      const textChanges = [...current].filter(([id, text]) => previous.get(id) !== text).map(([id, text]) => ({ id, text }));
      const removedTextIds = [...previous.keys()].filter(id => !current.has(id));
      const fields = new Set(['id', 'type', 'left', 'top', 'width', 'height', 'rotate', 'opacity',
        'fill', 'outline', 'path', 'viewBox', 'points', 'start', 'end', 'color', 'defaultColor',
        'latex', 'data', 'chartType']);
      const elements = new Map(compiled.elements.map(element => [element.id,
        Object.fromEntries(Object.entries(element).filter(([key]) => fields.has(key))),
      ]));
      const visualStateChanges = [...elements].filter(([id, value]) =>
        JSON.stringify(previousElements.get(id)) !== JSON.stringify(value)).map(([,value]) => value);
      const removedElementIds = [...previousElements.keys()].filter(id => !elements.has(id));
      previous = current;
      previousElements = elements;
      return { step, textChanges, removedTextIds, visualStateChanges, removedElementIds,
        visibleElementIds: compiled.elements.filter(element => !('opacity' in element) || (element.opacity ?? 1) > 0).map(element => element.id) };
    });
    const visual = data.page.visual;
    return { pageId: data.page.id, frames,
      comparisonGrid: visual.kind === 'comparison' ? {
        separateRowLabelColumn: true,
        header: [null, ...visual.columns],
        rows: visual.rows.map(row => [row.label, ...row.values]),
        dataValuesMatchHeaders: visual.rows.every(row => row.values.length === visual.columns.length),
      } : undefined,
    };
  });
}

export async function reviewAndRepairCourseware(input: {
  request: string;
  artifacts: LessonArtifact[];
  design?: CoursewareDesign;
  reviewPageIds?: string[];
  checkpoint?: CoursewareCheckpoint;
  aiCall: AICallFn;
  inspectRendered: (
    data: CoursewareSlideData,
  ) => Promise<{ issues: string[]; evidence: Record<string, unknown> }>;
}) {
  let artifacts = input.artifacts;
  let design = input.design ? structuredClone(input.design) : undefined;
  const corrected = new Set<string>();
  const correctedDesign = new Set<string>();
  const audits: unknown[] = [];
  const nonblockingNotes: unknown[] = [];
  const finalRenderEvidence: Record<string, unknown> = {};
  const maximumReviewRounds = 4;
  for (let round = 0; round < maximumReviewRounds; round++) {
    const pages = artifacts.map((artifact) =>
      'studio' in artifact.content ? artifact.content.studio!.page : null,
    );
    if (pages.some((page) => !page)) throw new Error('Missing source for content review');
    const ids = pages.map((page) => page!.id);
    const compiledRenderContext = coursewareReviewRenderContext(artifacts);
    const reviewIds = input.reviewPageIds ?? ids;
    if (reviewIds.some(id => !ids.includes(id))) throw new Error('Content review target does not exist');
    const learnerTextUnits = pages.filter(page => reviewIds.includes(page!.id)).map(page => coursewareLanguageUnit(page!));
    const { value: audit } = await coursewareModelStage({
      name: 'independent content review',
      aiCall: input.aiCall,
      schema: z.object({
        languageReview: learnerLanguageReviewSchema,
        issues: z
          .array(
            z.object({
              pageId: z.string(),
              problem: z.string().min(8).max(400),
              evidence: z.string().min(8).max(600),
              correction: z.string().min(8).max(600),
            }),
          )
          .max(16),
      }),
      system: COURSEWARE_PLANNING_BRIEF + '\n' + LEARNER_LANGUAGE_REVIEW_BRIEF + '\n' +
        '你是独立的教学内容审校员，不是原稿作者。必须重新计算具体算式、下标、数值轨迹、单位、比例，沿代码条件检查例子，并核对选项答案/反馈与实际视觉数据。检查前后页使用不同例子时是否明确交代。检查设计中的visualReason和teachingAction是否被实际视觉对象和步骤兑现：只写着“月相”“数组”等名称的圆圈/流程框不算画出了明暗面/数组；只加说明文字不算移动指针。检查场景的路径、位置与状态是否符合讲解，不能仅相信description。查找常见概念混淆、缺失的视角/适用条件、把示例或近似值称为实测精确值等问题。不要凭空添加事实、来源和引用；无法确定的命题不能断言为错。仅报告能从原稿、教师资料或确定领域知识明确说明的内容错误或可见教学行为缺失，每项写出证据与可执行修正。不要提出配色或个人风格偏好；不要为了显得严格而制造错误。全部检查后没有明确内容错误才返回issues=[]。严格保留现有pageId，只返回JSON。模型审校不等于权威事实保证。',
      context: {
        request: input.request,
        learnerTextUnits,
        languageTargets: learnerTextUnits.map(unit => ({
          pageId: unit.id,
          editablePaths: unit.fields.filter(field => !field.literal).map(field => field.path),
          literalEvidencePaths: unit.fields.filter(field => field.literal).map(field => field.path),
        })),
        findingRoutingPolicy: 'languageReview只报告editablePaths中实际存在的文字表达问题。literalEvidencePaths中的代码、公式和运行数据仍必须核验，但若存在真实逻辑、计算或事实错误，应放入顶层issues并给出证据与修正；绝不能以文风问题修改它们，也不能因为禁止润色而跳过真实错误。语言清晰但事实错误的正文同样归顶层issues。',
        reviewPageIds: reviewIds,
        scopePolicy: '仅报告reviewPageIds中的页面问题；其余页面作为跨页核对的只读上下文，不能借本轮局部修改重新生成它们。',
        design,
        compiledRenderContext,
        renderContextPolicy: 'compiledRenderContext是正式编译器的只读输出，不能要求修改它。frames中的textChanges仅是文本增量，不含形状/颜色/显隐；visualStateChanges才是各原生元素的增量绘图属性，未改变的对象沿用上一帧。visibleElementIds列出当前实际可见元素，removedElementIds列出本帧移除的元素。新增可见文本本身已经说明该文本已显示，不需要另有visible=true。请结合原稿beats核对，不能因为文字摘要没有箭头/颜色字段，就断言箭头/高亮未渲染。comparisonGrid为实际表格含独立行标题栏的完整格子，不能把label当作columns中的一列；语义事实和答案仍需重新核算。',
        pages: pages.map((page) => ({ ...page, layout: undefined })),
        previousReviews: audits,
      },
      inspect: (audit) => {
        validateLearnerLanguageReview(learnerTextUnits, audit.languageReview);
        return audit.issues.some((issue) => !reviewIds.includes(issue.pageId))
          ? ['Review must identify only the requested reviewPageIds; other pages are read-only context']
          : [];
      },
    });
    const contentIssueCount = audit.issues.length;
    audit.issues.push(...audit.languageReview.issues.map(issue => ({
      pageId: issue.unitId, problem: '学生文字：' + issue.problem,
      evidence: `${issue.field} 原句：「${issue.quote}」`,
      correction: '仅修订教学文字，保留所有数据、代码、公式、动作与画面结构。' + issue.correction,
    })));
    let actionable = audit.issues;
    let decisions: Array<{ index: number; verdict: 'fix' | 'suggestion' | 'unsupported'; reason: string; correction?: string;
      designCorrection?: { visualReason: string; teachingAction: string } }> = [];
    if (audit.issues.length) {
      const adjudicated = await coursewareModelStage({
        name: 'review finding adjudication', aiCall: input.aiCall,
        schema: z.object({ decisions: z.array(z.object({
          index: z.number().int().min(0).max(audit.issues.length - 1),
          verdict: z.enum(['fix', 'suggestion', 'unsupported']), reason: z.string().min(8).max(600),
          correction: z.string().min(8).max(600).optional(),
          designCorrection: z.object({ visualReason: z.string().min(8).max(280), teachingAction: z.string().min(8).max(280) }).strict().optional(),
        })).length(audit.issues.length) }),
        system: COURSEWARE_PLANNING_BRIEF + '\n有原句证据的学生无法理解、术语缺失解释、制作指令泄漏、条件丢失同样是教学缺陷，应判fix；不能把它们当成个人风格偏好或用designCorrection替代学生正文修正。正常学科词、合理短标签和必要限定不是缺陷。\n' +
          '你是独立的审校结论复核员，不是原作者，也不能默认挑错者一定正确。逐项重新判断：可证明的计算/事实错误、与实际状态矛盾、误导性图形、泄露测验答案或明确未满足教师原要求用fix；可选的更丰富呈现、另一种教法用suggestion；没有证据或不成立的指控用unsupported。不要因修复困难而放过确实的错误，也不要扩大教师需求。内部design的示例数字可作等价替换，只要页面自洽且未违背教师要求；前后页错误引用不同数组仍须修正。代码页已有真实逐行高亮且原要求没有变量面板时，不能仅因没有额外的变量/数组面板就断言功能缺失。区间收缩的示例可明确从第三轮开始，不必每页从头重放。不要把有序数组教学的合理范围简化，曲解成要求证明所有数据结构的性能。以实际内容和教师请求为准，逐项给证据理由，不能为了让任务通过而接受已知错误。返回每个index恰好一次的JSON。',
        context: { request: input.request, reviewPolicy: '区别观察视角、坐标约定和物体真实状态。若缺少图例/视角会使图形表达两种矛盾含义，应判fix并在可见图例、description和讲稿中明确约定，不得判为可选建议；先核对整套已有声明，再判断是否需要改几何，不能凭自选视角反复翻转图形。图形与description/讲稿明确矛盾同样需要fix。核对数值所对应的参考系与周期，不能把相对变化当作绝对运动。涉及跨页引用时必须在allPages中查证前后页，不能仅因引文不在被点名页就否认错误。fix可用correction给出重新核算的最小修正，原审校员的修正建议也不默认正确。', findings: audit.issues,
          // Findings are indexed within THIS audit. Passing previous audit
          // decisions here lets the model accidentally answer an older index 0
          // instead of the current index 0; history belongs only to the critic.
          allPages: pages, design, compiledRenderContext,
          adjudicationScope: '只复核本次findings。每条reason必须直接回应对应index的当前pageId、problem和evidence，不得把已经修复的其他页或历史问题当作本条的反证。',
          renderContextPolicy: '编译器上下文是只读观察，不是可修改的原稿。textChanges只描述文字，不包含形状/颜色/显隐；必须结合visualStateChanges、visibleElementIds、removedElementIds及原稿beats判断可见性，不能以文字摘要未包含箭头/颜色字段就断言它们未渲染。增量未列出的元素沿用前态；出现在visibleElementIds和textChanges中的新文本已经是可见状态，不需要另加visible=true。表格行标题是独立的无表头栏，columns只指数据列；values.length等于columns.length才合法。不能为了满足误判而把正确表格改成不合法的结构。该说明不证明内容事实正确，仍须逐项核查。',
          designCorrectionPolicy: '若问题仅是智能体内部设计文字与已经正确的页面实现不一致，且教师原始要求并未要求那项额外细节，可用verdict=fix及designCorrection修正该页visualReason/teachingAction，并说明等价教学目标如何仍被满足。此时不能同时要求修改页面。不得改变教师原始要求、页数、学习目标、页面角色或掩盖真实错误/缺失行为；若教师明确要求两张图片，就不能把设计改成一张来通过。没有design时禁止designCorrection。设计修正后仍须独立复审。' },
        inspect: value => {
          if (value.decisions.some(item => item.index >= contentIssueCount && (item.designCorrection || item.verdict === 'suggestion')))
            return ['学生文字问题必须修正正文，或用当前证据证明指控不成立；不能改内部设计或降为可选建议来跳过'];
          if (new Set(value.decisions.map(item => item.index)).size !== audit.issues.length) return ['Every finding needs exactly one independent decision'];
          if (value.decisions.some(item => item.designCorrection && (item.verdict !== 'fix' || !design?.pages.some(page => page.id === audit.issues[item.index].pageId)))) return ['Design correction needs an existing design page and a confirmed fix'];
          return [];
        },
      });
      decisions = adjudicated.value.decisions;
      actionable = audit.issues.flatMap((issue, index) => {
        const decision = decisions.find(item => item.index === index);
        return decision?.verdict === 'fix' && !decision.designCorrection ? [{ ...issue, correction: decision.correction || issue.correction }] : [];
      });
      nonblockingNotes.push(...decisions.filter(item => item.verdict !== 'fix').map(item => ({ ...audit.issues[item.index], ...item })));
    }
    const record = { ...audit, decisions };
    audits.push(record);
    await input.checkpoint?.saveAudit?.(record);
    let designChanged = false;
    for (const decision of decisions) {
      if (!decision.designCorrection || !design) continue;
      const id = audit.issues[decision.index].pageId;
      design = { ...design, pages: design.pages.map(page => page.id === id ? { ...page, ...decision.designCorrection } : page) };
      correctedDesign.add(id);
      designChanged = true;
      await input.checkpoint?.saveDesignCorrection?.(id, decision.designCorrection);
    }
    if (!actionable.length && !designChanged)
      return {
        artifacts,
        design,
        finalRenderEvidence,
        review: {
          status: 'model-reviewed-no-known-content-errors',
          reviewedPageIds: reviewIds,
          rounds: round + 1,
          correctedPageIds: [...corrected],
          correctedDesignPageIds: [...correctedDesign],
          audits,
          policy: 'independent-audit-and-adjudication',
          languageReview: audit.languageReview,
          nonblockingNotes,
        },
      };
    if (round === maximumReviewRounds - 1)
      throw new CoursewareGenerationError(
        'content review',
        [...actionable.map((issue) => `${issue.pageId}: ${issue.problem}`), ...(designChanged ? ['Corrected design metadata still requires independent re-review'] : [])],
      );
    if (!actionable.length) continue;
    const correctionIds = [...new Set(actionable.map(issue => issue.pageId))];
    const contentCorrectionPages = new Set(decisions.filter(item => item.index < contentIssueCount &&
      item.verdict === 'fix' && !item.designCorrection).map(item => audit.issues[item.index].pageId));
    const correctionInstruction = '仅修复当前页以下独立审校确认的问题，保留已正确的事实、其余页和版式；本页所有涉及的解释、讲稿、题目反馈与实际画面应保持一致：\n';
    const revised = await reviseModernCourseware({
      artifacts,
      aiCall: input.aiCall,
      inspectRendered: input.inspectRendered,
      onlyPageIds: correctionIds,
      pageInstructions: Object.fromEntries(correctionIds.map(id => [id,
        correctionInstruction + JSON.stringify(actionable.filter(issue => issue.pageId === id))])),
      textOnlyPageIds: correctionIds.filter(id => !contentCorrectionPages.has(id)),
      onPageRevised: async (data, evidence) => {
        await input.checkpoint?.saveCorrection?.({ value: data.page, attempts: 1, evidence });
      },
      onRejected: async (id, attempt, draft, issues) => {
        await input.checkpoint?.saveRejected?.('review-' + id.slice(0, 40), { attempt, draft, issues });
      },
      instruction: correctionInstruction,
    });
    artifacts = revised.artifacts;
    revised.revision.changedPageIds.forEach((id, index) => {
      finalRenderEvidence[id] = revised.revision.renderEvidence[index];
    });
    for (const id of revised.revision.changedPageIds) corrected.add(id);
  }
  throw new Error('Content review did not finish');
}

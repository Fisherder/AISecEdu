import { z } from 'zod';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { LessonArtifact } from '@/lib/types/lesson';
import { coursewareModelStage } from './generation';
import { compileCoursewareSlide, coursewareThemeIssues, inspectCoursewareSlide } from './compiler';
import {
  COURSEWARE_PLANNING_BRIEF,
  coursewarePageSchema,
  coursewareThemeSchema,
  type CoursewareSlideData,
} from './schema';
import { applyCoursewarePagePatch, coursewarePatchSchema } from './patches';
import { coursewareLanguageUnit } from '@/lib/teaching/learner-language-surfaces';
import { protectedTeachingLiterals } from '@/lib/teaching/learner-language';

const revisionPlanSchema = z.object({
  explanation: z.string().min(8).max(500),
  theme: coursewareThemeSchema.optional(),
  pages: z.array(z.object({ id: z.string(), instruction: z.string().min(8).max(2000) })).max(120),
});

export async function reviseModernCourseware(input: {
  artifacts: LessonArtifact[];
  instruction: string;
  onlyPageIds?: string[];
  pageInstructions?: Record<string, string>;
  textOnlyPageIds?: string[];
  aiCall: AICallFn;
  inspectRendered: (
    data: CoursewareSlideData,
  ) => Promise<{ issues: string[]; evidence: Record<string, unknown> }>;
  onPageRevised?: (data: CoursewareSlideData, evidence: Record<string, unknown>) => Promise<void>;
  onRejected?: (id: string, attempt: number, draft: unknown, issues: string[]) => Promise<void>;
}) {
  const originals = input.artifacts.map((artifact) =>
    'studio' in artifact.content ? artifact.content.studio : undefined,
  );
  if (originals.some((studio) => !studio))
    throw new Error('Modern revision requires complete source pages');
  const pages = originals as CoursewareSlideData[];
  const ids = pages.map((studio) => studio.page.id);
  if (input.onlyPageIds?.some(id => !ids.includes(id))) throw new Error('Correction target does not exist');
  if (input.textOnlyPageIds?.some(id => !input.onlyPageIds?.includes(id))) throw new Error('Text-only correction must stay within the identified review pages');
  if (input.pageInstructions && (!input.onlyPageIds ||
      Object.keys(input.pageInstructions).some(id => !input.onlyPageIds!.includes(id)) ||
      input.onlyPageIds.some(id => !input.pageInstructions![id]?.trim())))
    throw new Error('Scoped instructions must cover exactly the identified review pages');
  const { value: plan } = input.onlyPageIds ? { value: {
    explanation: '仅按独立审校结论定向修改，保持其余原稿不变。',
    pages: [...new Set(input.onlyPageIds)].map(id => ({ id, instruction: input.pageInstructions?.[id] ?? input.instruction })),
    theme: undefined,
  } } : await coursewareModelStage({
    name: 'revision scope',
    aiCall: input.aiCall,
    schema: revisionPlanSchema,
    system:
      '你负责把教师本轮修改精确映射到既有课件页。只规划需要修改的页，保持未要求修改的页面和事实不变。全套配色只用theme，不为换配色重写正文。页id必须使用已有id，不能虚构。pages为空且没有theme不算完成。只返回JSON。',
    context: {
      instruction: input.instruction,
      theme: pages[0].theme,
      currentPages: pages.map(({ page }) => ({
        id: page.id,
        title: page.title,
        objective: page.objective,
        visual: page.visual,
        supporting: page.supporting,
        takeaway: page.takeaway,
        beats: page.beats,
      })),
    },
    inspect: (plan) => [
      ...(input.onlyPageIds &&
      (plan.theme || plan.pages.some((page) => !input.onlyPageIds!.includes(page.id)))
        ? [
            'Only correct the identified pages; keep the visual theme and unaffected pages unchanged',
          ]
        : []),
      ...(plan.theme ? coursewareThemeIssues(plan.theme) : []),
      ...(!plan.theme && !plan.pages.length ? ['No actual edit was planned'] : []),
      ...(plan.pages.some((page) => !ids.includes(page.id)) ||
      new Set(plan.pages.map((page) => page.id)).size !== plan.pages.length
        ? ['Use each existing target page ID at most once']
        : []),
    ],
  });
  // Models may echo the current theme even for a one-page text edit. An unchanged
  // theme is not permission to recompile or re-review the rest of the deck.
  if (plan.theme && pages.every(source =>
    Object.entries(plan.theme!).every(([key, value]) => source.theme[key as keyof typeof source.theme] === value))) {
    plan.theme = undefined;
  }
  if (!plan.theme && !plan.pages.length) throw new Error('The revision contains no actual change');
  const artifacts: LessonArtifact[] = [];
  const evidence: Record<string, unknown>[] = [];
  for (const [index, source] of pages.entries()) {
    const textOnly = input.textOnlyPageIds?.includes(source.page.id) ?? false;
    const edit = plan.pages.find((page) => page.id === source.page.id);
    if (!edit && !plan.theme) {
      artifacts.push(structuredClone(input.artifacts[index]));
      continue;
    }
    const theme = plan.theme || source.theme;
    const native = input.artifacts[index].content;
    const inspectPage = async (page: CoursewareSlideData['page']) => {
      const issues = inspectCoursewareSlide({ page, theme, assets: source.assets });
      if (page.id !== source.page.id || !page.layout)
        issues.push('Preserve the page identity and actual layout');
      const knownSources = new Set([
        'teacher-request', 'general-knowledge', 'illustrative-example',
        ...pages.flatMap(({ page }) => page.evidence.map((item) => item.sourceId)),
      ]);
      if (page.evidence.some((item) => !knownSources.has(item.sourceId)))
        issues.push('Do not invent source IDs or replace existing evidence with fabricated citations');
      if (JSON.stringify(page) === JSON.stringify(source.page) && !plan.theme)
        issues.push('The requested change has not been applied');
      if (!issues.length) {
        const rendered = await input.inspectRendered({ page, theme, assets: source.assets });
        issues.push(...rendered.issues);
        if (!issues.length) evidence[index] = rendered.evidence;
      }
      return issues;
    };
    const patch = edit && input.onlyPageIds ? (await coursewareModelStage({
      name: `correct ${source.page.id}`,
      aiCall: input.aiCall,
      schema: coursewarePatchSchema,
      onRejected: (attempt, draft, issues) => input.onRejected?.(source.page.id, attempt, draft, issues) || Promise.resolve(),
      system: COURSEWARE_PLANNING_BRIEF + '\n你是定向审校修复器。仅为当前页返回最小JSON补丁changes，不重新生成已经通过画面检查的整页。path为字段/数组下标路径。每次补丁始终应用于original原稿，不是在上次补丁之上累加。禁止改id/schema/role或虚构来源。\n' +
        (textOnly ? '本次是纯文字修订：只能set editableTextFields列出的现有字段，不得改变layout/几何/时序/数据/代码/公式/答案键，不得add或remove。逐字保留每个字段的protectedLiterals，换用清楚表达；literalEvidence是只读参考，不是可修改目标。若数字或事实本身有错，应留给内容审校处理，不能以润色名义修改。文字必须适配现有区域，不允许扩大区域或缩小字体；所有修改仍须通过逐帧布局检查。' :
          'set设置值，add在数组下标插入或添加字段，remove移除。同步修正所有相关正文、视觉数值/明暗路径、动画状态、讲稿和答案反馈；只用文字掩饰错误视觉不算修复。保持正确对象的ID、位置、尺寸和顺序，不做无关美化。若内容变长，应简洁表达或调整相关文本区域，仍必须通过逐帧布局检查。'),
      context: { original: source.page, instruction: edit.instruction, theme,
        ...(textOnly ? {
          editableTextFields: coursewareLanguageUnit(source.page).fields.filter(field => !field.literal)
            .map(field => ({ path: field.path, text: field.text, protectedLiterals: protectedTeachingLiterals(field.text) })),
          literalEvidence: coursewareLanguageUnit(source.page).fields.filter(field => field.literal),
        } : {}),
        pageContract: z.toJSONSchema(coursewarePageSchema, { io: 'input', unrepresentable: 'any' }),
        availableAssets: source.assets.map(({ src: _, ...asset }) => asset) },
      inspect: (patch) => inspectPage(applyCoursewarePagePatch(source.page, patch, textOnly)),
    })).value : undefined;
    const page = patch ? applyCoursewarePagePatch(source.page, patch, textOnly) : edit
      ? (
          await coursewareModelStage({
            name: `revise ${source.page.id}`,
            aiCall: input.aiCall,
            schema: coursewarePageSchema,
            system:
              COURSEWARE_PLANNING_BRIEF +
              '修改现有现代课件页，保留全部未涉及修改的事实、资料来源、对象ID、题目反馈与讲稿。不能把真正的图表/图节点/动画改成描述它们的文案。保留page.id；必须有实际layout并为每项supporting保留区域。scene的objects.box用visual区域内的局部像素，path是0–1单位viewBox路径；文本用text对象，label仅语义名不会显示。返回一份完整课件页JSON，不要输出补丁或占位文字。',
            context: {
              original: source.page,
              nativeCanvas:
                'elements' in native
                  ? {
                      elements: native.elements.map((element) =>
                        element.type === 'image'
                          ? { ...element, src: 'verified-image-preserved' }
                          : element,
                      ),
                      background: native.background,
                    }
                  : undefined,
              theme,
              instruction: input.instruction,
              scopedEdit: edit.instruction,
              availableAssets: source.assets.map(({ src: _, ...asset }) => asset),
            },
            inspect: inspectPage,
          })
        ).value
      : source.page;
    const studio = { page, theme, assets: source.assets };
    if (!edit) {
      const issues = inspectCoursewareSlide(studio);
      if (issues.length) throw new Error(issues.join('; '));
      const rendered = await input.inspectRendered(studio);
      if (rendered.issues.length) throw new Error(rendered.issues.join('; '));
      evidence[index] = rendered.evidence;
    }
    const compiled = compileCoursewareSlide(studio, page.beats.length - 1);
    await input.onPageRevised?.(studio, evidence[index]);
    artifacts.push({
      ...structuredClone(input.artifacts[index]),
      title: page.title,
      outline: {
        ...input.artifacts[index].outline,
        title: page.title,
        description: page.objective,
        keyPoints: [page.takeaway, ...page.supporting],
      },
      content: {
        elements: compiled.elements,
        background: compiled.background,
        speakerNotes: page.speakerNotes,
        remark: page.speakerNotes,
        layout: page.role,
        studio,
      },
    });
  }
  return {
    artifacts,
    theme: plan.theme || pages[0].theme,
    revision: {
      mode: 'courseware-native-v2',
      explanation: plan.explanation,
      changedPageIds: pages
        .filter((page) => plan.theme || plan.pages.some((edit) => edit.id === page.page.id))
        .map((page) => page.page.id),
      untouchedPages: pages.length - evidence.filter(Boolean).length,
      renderEvidence: evidence.filter(Boolean),
    },
  };
}

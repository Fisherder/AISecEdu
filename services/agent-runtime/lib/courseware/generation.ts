import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { LessonArtifact } from '@/lib/types/lesson';
import {
  slideDeckPageCountIssue,
  type SlideDeckPageRequirement,
} from '@/lib/server/slide-page-policy';
import {
  COURSEWARE_PLANNING_BRIEF,
  coursewareDesignSchema,
  coursewarePageSchema,
  coursewareVisualSchema,
  coursewareLayoutSchema,
  normalizeCoursewarePageLayout,
  type CoursewareAsset,
  type CoursewareDesign,
  type CoursewarePage,
  type CoursewareSlideData,
} from './schema';
import { compileCoursewareSlide, coursewareThemeIssues, inspectCoursewareSlide, inspectCoursewareDraftText } from './compiler';
import type { CoursewareCheckpoint } from './checkpoints';

export class CoursewareGenerationError extends Error {
  constructor(
    public stage: string,
    public issues: string[],
  ) {
    super(`Modern courseware ${stage} failed: ${issues.join('; ')}`);
  }
}

const PAGE_SYSTEM = `${COURSEWARE_PLANNING_BRIEF}
你是负责可运行教学页面的设计师。输出结构化 JSON，由原生渲染器绘制。视觉不是描述而是数据：图表必须给出对齐的数值和单位；机制图必须有实际节点、坐标和连接；代码走查必须有真实代码行与对应步骤；公式需可编译的 LaTeX 与实例；对比表的列和值一一对应。
采用设计师给出的整套主题和页面职责。页面只有一个主视觉，拒绝把段落拆成卡片墙。必须提供 layout：在1000×562.5画布中，根据本页实际内容自主布局 title/takeaway/visual/supporting。composition仅为构图意图，真正坐标和字号由你设计，不能每页套同一个固定结构。可以使用居中大图、非对称编辑式、短结论和完整视觉相邻等结构，确保区域不重叠。正文不为凑字数而存在。标题不超过 22 个汉字较佳；节点标签不超过 10 个汉字；supporting 用 0–3 句短提示并给每句独立区域。优先变更结构和分配空间解决拥挤，不能丢失重要事实或裁掉正文。
图节点 x/y 为 0–1 的位置。节点有真实形状和宽度，横向间隔至少 0.22、纵向至少 0.34；节点少时充分利用画面，不全挤在中心。连线只说明明确关系，标签应简短且避开节点。流程、算法与状态变化用 beats，nodeStates 是可回放的值/位置/可见性变化，activeEdgeIds 指向真实传递路径；只加“下一步”文案不算动作。
节点宽高会按标签和全部步骤中最长的值自动分配，文字不缩小；较长的字节、编码或公式会需要更大的空间。若相邻节点或连线标签挤在一起，扩大visual或重新排成两行，不能截断Base64/字节串、用省略号替代需要学生验证的完整数据。每个节点的几何尺寸在所有步骤中保持一致，位置仅随明确的nodeStates变化。
comparison会按完整行标题、列标题和单元格内容自动分配列宽与各行高度，不再依赖固定窄标题栏。必须为整张表分配足够的visual区域；空间不足时重新组织页面布局，不缩小到不可读字号，不删除公式、前提或必要事实来通过检查。每行values的数量必须严格等于columns的数量。
各类型步骤必须有实际视觉作用：code用codeLines高亮行，chart用chartFocusIndexes指向数值或chartValues显示真实状态数据；equation用equationState.expression逐步替换当前LaTeX式（累积保留），equationState.example同步数值算例，termFocusIndexes高亮相关术语（从0开始）；comparison用comparisonRowIndexes高亮被比较的行；image用imageAnnotationIndexes按步骤累计显示指定标注。推导页必须先展示初始关系，再逐步代入与计算，不能一开始全给最终式却在步骤里声称正在推导。图片只需静态观察时beats为空；不要给不变化的画面编造动作。公式页仅一个主公式块、术语列与算例行，需要复杂多栏推导或轨迹面板时选择scene，不向设计承诺该类型不存在的结构。
scene用objects绘制真正的内容：数组的每个格子与下标、轨道中的明暗面、光线、指针、标尺、坐标等。objects按从后到前绘制，box是layout.visual内的局部像素，width/height保持在visual范围，文字字号是最终画布字号(18–64px)。文字用独立text对象，不能只是label；label是语义名不会自动显示。ellipse绘制椭圆，path用0–1单位viewBox的SVG路径，rect绘制矩形，可组合曲线、局部明暗、渐变与文本构成插图，不需要受固定节点框限制。路径只包含几何指令，不能放HTML。使用有语义的对象id，初态visible=false隐藏待出现的对象，beats.objectStates逐步移动left/top、改变fill/opacity/text或显隐，focusIds高亮已有形状。图解必须真的让人看到知识关系，不是用一串流程框代替。简洁而有细节，用20–50个有意义的对象比用90个装饰物更好。给复杂实体的主体添加detail可点击解释，避免把所有叠放装饰都设为热点。
优先用相同对象跨步骤更新，不要为每一个时刻复制整个场景导致满屏拥挤。一个主图搭配简短状态记录即可；代码需要同时看到变量轨迹时，用scene的font=mono文本对象和状态面板组合。每个可见text的box.height至少是fontSize×1.2，一行18px文本需要22px以上高度；18px也是下标与说明的最小字号，不可缩小以塞下更多内容。
问题采用 check 的真实可作答选项，每个选项提供有教学价值的解释，答案只在反馈与讲稿中出现，不在 takeaway 提前泄露。role=practice/check 时必须提供 check。配合当前视觉给出私有讲稿，包含解释、追问、预期答案和衔接，不照念页面。
sourceId 只能引用提供的资料标识、teacher-request、general-knowledge 或 illustrative-example。教学假设与虚构示例必须明确标记，不能杜撰引用和数据来源。图片只能引用提供的 assetId，不能虚构图片或把 URL 写入图像 ID。不得输出 HTML、JS、渲染代码或格式说明。`;

function parseJson(raw: string) {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(text);
}

export async function coursewareModelStage<T>(input: {
  name: string;
  system: string;
  context: unknown;
  schema: z.ZodType<T>;
  aiCall: AICallFn;
  inspect: (value: T) => string[] | Promise<string[]>;
  onRejected?: (attempt: number, draft: unknown, issues: string[]) => Promise<void>;
}): Promise<{ value: T; attempts: number }> {
  const contract = JSON.stringify(
    z.toJSONSchema(input.schema, { unrepresentable: 'any', io: 'input' }),
  );
  const original = JSON.stringify(input.context);
  let last: unknown;
  let issues: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await input.aiCall(
        input.system +
          '\n返回紧凑JSON；省略未使用的可选字段和默认值，不给每个形状重复写字体、透明度等默认设置。返回 JSON 必须符合：' +
          contract,
        original +
          (attempt > 1
            ? '\n上一稿：' +
              JSON.stringify(last) +
              '\n实际校验问题，请逐项修复且保留其他要求：' +
              JSON.stringify(issues)
            : ''),
      );
      last = raw;
      last = normalizeCoursewarePageLayout(parseJson(raw));
      const parsed = input.schema.safeParse(last);
      if (!parsed.success) {
        issues = [...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`), ...inspectCoursewareDraftText(last)];
      } else {
        issues = await input.inspect(parsed.data);
        if (!issues.length) return { value: parsed.data, attempts: attempt };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'CoursewareInspectorUnavailableError')
        throw error;
      issues = [error instanceof Error ? error.message : String(error)];
    }
    await input.onRejected?.(attempt, last, issues);
  }
  throw new CoursewareGenerationError(input.name, issues);
}

export type CoursewareGenerationInput = {
  request: string;
  plan: Record<string, unknown>;
  pageRequirement: SlideDeckPageRequirement;
  aiCall: AICallFn;
  assets?: CoursewareAsset[];
  sourceIds?: string[];
  checkpoint?: CoursewareCheckpoint;
  resolveImage?: (query: string) => Promise<CoursewareAsset | null>;
  inspectRendered?: (
    data: CoursewareSlideData,
  ) => Promise<{ issues: string[]; evidence: Record<string, unknown> }>;
};

function designIssues(design: CoursewareDesign, input: CoursewareGenerationInput): string[] {
  const issues = coursewareThemeIssues(design.theme);
  const countIssue = slideDeckPageCountIssue(design.pages.length, input.pageRequirement);
  if (countIssue) issues.push(countIssue);
  if (design.pages.some((page) => page.visualKind === 'image') && !input.assets?.length)
    issues.push(
      'Image pages need real available assets; choose a truthful chart, diagram, equation or evidence view if none are available',
    );
  const roles = design.pages.map((page) => page.role);
  const visuals = new Set(design.pages.map((page) => page.visualKind));
  const compositions = new Set(design.pages.map((page) => page.composition));
  if (design.pages.length >= 5 && !roles.includes('worked-example'))
    issues.push('The narrative needs a concrete worked example');
  if (design.pages.length >= 5 && !roles.some((role) => ['practice', 'check'].includes(role)))
    issues.push('The narrative needs an actionable learning check');
  if (
    design.pages.length >= 8 &&
    roles.filter((role) => ['practice', 'check'].includes(role)).length < 2
  )
    issues.push('A full deck needs two learning checks');
  // scene is a general drawing surface (arrays, charts, trajectories, tables),
  // not one preset template. A valid content repair may move a comparison into
  // scene to reveal answers incrementally; that must not invalidate its checkpoint.
  if (design.pages.length >= 5 && visuals.size < 2 && !visuals.has('scene'))
    issues.push(
      'Use complementary explanatory and practice encodings; do not repeat one shallow template throughout the deck',
    );
  if (design.pages.length >= 5 && compositions.size < 2)
    issues.push('Vary the actual composition, not only page titles');
  return issues;
}

export async function generateModernCourseware(input: CoursewareGenerationInput) {
  const assets = [...(input.checkpoint?.assets || input.assets || [])];
  const assetWarnings: string[] = [];
  if (!input.checkpoint?.design && input.resolveImage && !assets.length) {
    const { value } = await coursewareModelStage({
      name: 'visual asset research',
      aiCall: input.aiCall,
      schema: z.object({
        queries: z.array(z.string().min(3).max(100)).max(3),
        reason: z.string().min(8).max(300),
      }),
      system:
        '判断这套课件是否需要真实照片、显微图、天体图像、历史图像或实体插图。需要时给最多3个简短的公共主题英文检索词；不要把教师资料、姓名、账号、业务数字或原文送入检索词。不检索图表截图、PPT成图和网页截屏；量化证据和机制用原生图表或关系图。不需要图片时queries=[]。只返回JSON。',
      context: {
        request: input.request,
        title: input.plan.title,
        objectives: input.plan.objectives,
      },
      inspect: () => [],
    });
    for (const query of value.queries) {
      try {
        const asset = await input.resolveImage(query);
        if (asset && !assets.some((existing) => existing.id === asset.id)) assets.push(asset);
        else if (!asset) assetWarnings.push(`No licensed image found for: ${query}`);
      } catch {
        assetWarnings.push(`Image provider unavailable for: ${query}`);
      }
    }
  }
  const planningInput = { ...input, assets };
  const allowedSourceIds = new Set([
    'teacher-request',
    'general-knowledge',
    'illustrative-example',
    ...(input.sourceIds || []),
  ]);
  const designResult = input.checkpoint?.design
    ? { value: input.checkpoint.design, attempts: 0 }
    : await coursewareModelStage({
        name: 'design',
        aiCall: input.aiCall,
        schema: coursewareDesignSchema,
        system: `${COURSEWARE_PLANNING_BRIEF}
你是整套课件的教学设计师和美术指导。先规划完整叙事，不直接写每页正文。每页选择最能解释知识的真实视觉编码和课堂动作。保留所有原要求与页数，不能给短课件添加封面和目录凑页数。即使教师只有一句话，也要自主完成面向受众的完整设计。
先检查规划契约：5页及以上必须有至少一页 role="worked-example"，用具体数值、情境或观察对象走完一次解释（不要求所有学科都做算术）；至少一页 role="practice" 或 "check"，提出学生能实际回答的问题。不要把已有算例和检测页都标成explain。8页及以上至少两页practice/check。5页及以上采用互补的信息表达和至少两种composition：通常结合两种visualKind，但scene是通用绘图面，可以用同一scene类型实现不同的数组、轨迹、曲线、记录表和交互，不应为凑类型把正确图解改成卡片。表达变化必须服务内容并在实际图形中兑现，不靠增加页面凑齐。每条objectives不超过100个字符，细节放在对应页的teachingAction中。这些契约与教师的主题、页数和难度约束必须同时满足。
主题可以采用温暖纸白、深色科学画布或清爽编辑式配色，不要每套都用蓝色圆角卡片。foreground/background 对比度至少 7:1，muted/background 至少 4.5:1，accent/background 至少 3:1，foreground/surface 至少 4.5:1。可用纸白示例：background=#F7F4ED,foreground=#172C2A,muted=#506762,accent=#146B5F,secondary=#B44E29,surface=#E6ECE6；深色示例：background=#101922,foreground=#F0F3ED,muted=#AFBFCC,accent=#EAAF50,secondary=#69BCB8,surface=#223443。可自主设计其他合规颜色。
visualReason 必须解释该页为什么需要这个图，teachingAction 描述学习者能观察、尝试或判断的内容。具体空间形态、数据结构和运动过程使用scene，不要用diagram把实体替换成写着名称的圆圈。图片能提供真实观察证据时应使用已检索到的合适图片。跨页尽量延续同一组例子，若更换数据明确说明。所有算例先计算再写，难度必须符合受众，不为凑视觉类型给初中课件硬塞三角函数公式。页面标题要具体，objectives 的每个条目都必须对应实际页面。不要把上一稿中的外观和禁止事项当成教师要求。没有真实图片资产时不得选 image。只返回 JSON。`,
        context: {
          request: input.request,
          candidatePlan: input.plan,
          pageRequirement: input.pageRequirement,
          availableImages: assets.map(({ src: _, ...asset }) => asset),
        },
        inspect: (design) => designIssues(design, planningInput),
      });
  const design = designResult.value;
  const designProblems = designIssues(design, planningInput);
  if (designProblems.length)
    throw new CoursewareGenerationError('checkpoint design', designProblems);
  if (!input.checkpoint?.design) await input.checkpoint?.saveDesign(design, assets);
  const results: Array<{ value: CoursewarePage; attempts: number }> = new Array(
    design.pages.length,
  );
  const renderEvidence: Record<string, unknown>[] = new Array(design.pages.length);
  let next = 0;
  let failure: unknown;
  let resumedPages = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, design.pages.length) }, async () => {
      while (next < design.pages.length) {
        if (failure) return;
        const index = next++;
        const brief = design.pages[index];
        try {
          const saved = input.checkpoint?.pages[brief.id];
          let resumeIssues: string[] = [];
          if (saved) {
            const data = { page: saved.value, theme: design.theme, assets };
            resumeIssues = inspectCoursewareSlide(data);
            if (saved.value.role !== brief.role || saved.value.visual.kind !== brief.visualKind)
              resumeIssues.push('Checkpoint must match the approved teaching role and encoding');
            const currentRender =
              !resumeIssues.length && input.inspectRendered
                ? await input.inspectRendered(data)
                : undefined;
            resumeIssues.push(...(currentRender?.issues || []));
            if (!resumeIssues.length) {
              results[index] = saved;
              renderEvidence[index] = currentRender?.evidence || saved.evidence;
              resumedPages++;
              continue;
            }
          }
          results[index] = await coursewareModelStage({
            name: `page ${index + 1}`,
            onRejected: (attempt, draft, issues) =>
              input.checkpoint?.saveRejected?.(brief.id, { attempt, draft, issues }) ||
              Promise.resolve(),
            aiCall: input.aiCall,
            schema: coursewarePageSchema.safeExtend({
              id: z.literal(brief.id),
              role: z.literal(brief.role),
              layout: coursewareLayoutSchema,
              visual: coursewareVisualSchema.options.find(
                (schema) => schema.shape.kind.value === brief.visualKind,
              )!,
            }),
            system:
              PAGE_SYSTEM +
              `\n本页只能使用 ${brief.visualKind} 视觉，不能改为其他视觉类型。图表逐步讲解时用 chartFocusIndexes 高亮当前讨论的数据点，不能为产生动画而篡改数据；若不需要分步变化，beats=[]。`,
            context: {
              request: input.request,
              candidatePlan: input.plan,
              design,
              currentPage: brief,
              ...(saved ? { previousDraft: saved.value, rendererUpgradeIssues: resumeIssues } : {}),
              sourceIds: [...allowedSourceIds],
              availableImages: assets.map(({ src: _, ...asset }) => asset),
            },
            inspect: async (page) => {
              const issues = inspectCoursewareSlide({ page, theme: design.theme, assets });
              if (!page.layout)
                issues.push('Design the actual freeform layout, not a preset template');
              if (page.id !== brief.id)
                issues.push('Preserve the page ID from the approved design');
              if (page.role !== brief.role)
                issues.push('Preserve the teaching role from the design');
              if (page.visual.kind !== brief.visualKind)
                issues.push('Materialize the actual visual encoding from the design');
              if (page.evidence.some((evidence) => !allowedSourceIds.has(evidence.sourceId)))
                issues.push('Evidence references must use an existing source ID');
              if (!issues.length && input.inspectRendered) {
                const rendered = await input.inspectRendered({ page, theme: design.theme, assets });
                issues.push(...rendered.issues);
                renderEvidence[index] = rendered.evidence;
              }
              return issues;
            },
          });
          if (input.inspectRendered)
            await input.checkpoint?.savePage({
              ...results[index],
              evidence: renderEvidence[index],
            });
        } catch (error) {
          failure = error;
          return;
        }
      }
    }),
  );
  if (failure) throw failure;
  const artifacts: LessonArtifact[] = results.map(({ value: page }, index) => {
    const studio: CoursewareSlideData = {
      page,
      theme: design.theme,
      assets: assets.filter(
        (asset) => page.visual.kind === 'image' && page.visual.assetId === asset.id,
      ),
    };
    const compiled = compileCoursewareSlide(studio, page.beats.length - 1);
    return {
      id: `studio_${nanoid()}`,
      type: 'slide',
      title: page.title,
      order: index + 1,
      createdAt: Date.now(),
      outline: {
        id: page.id,
        type: 'slide',
        title: page.title,
        description: page.objective,
        keyPoints: [page.takeaway, ...page.supporting],
        order: index + 1,
      },
      content: {
        elements: compiled.elements,
        background: compiled.background,
        speakerNotes: page.speakerNotes,
        remark: page.speakerNotes,
        layout: page.role,
        studio,
      },
    };
  });
  return {
    design,
    artifacts,
    quality: {
      schema: 'courseware-quality-v2',
      pageCount: artifacts.length,
      chartPages: results.filter((result) => result.value.visual.kind === 'chart').length,
      diagramPages: results.filter((result) => result.value.visual.kind === 'diagram').length,
      visualPages: results.length,
      nativeObjectCount: artifacts.reduce(
        (sum, artifact) =>
          sum + ('elements' in artifact.content ? artifact.content.elements.length : 0),
        0,
      ),
      speakerNotePages: results.filter((result) => result.value.speakerNotes.length >= 80).length,
      actionableChecks: results.filter((result) => result.value.check).length,
      teachingBeats: results.reduce((sum, result) => sum + result.value.beats.length, 0),
      visualKinds: [...new Set(results.map((result) => result.value.visual.kind))],
      compositions: [...new Set(results.map((result) => result.value.composition))],
      repairedPages: results.filter((result) => result.attempts > 1).length,
      resumedPages,
      verifiedImages: assets.length,
      assetWarnings,
      designAttempts: designResult.attempts,
      fallbackCount: 0,
      visualInspection: input.inspectRendered ? 'browser-layout-checked' : 'not-yet-rendered',
      renderEvidence,
    },
  };
}

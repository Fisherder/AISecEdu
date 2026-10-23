import { reviseCinematicExplainer } from './cinematic-revision';
import { extractCinematicScene } from '@/lib/cinematic/schema';
import { Script } from 'node:vm';
import { Linter } from 'eslint';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { LessonArtifact } from '@/lib/types/lesson';
import type { SingleArtifactInput } from './lesson-generation';
import { generateCinematicExplainer, type CinematicGenerationHooks } from './cinematic-generation';
import { parseVisualGenerationIntent } from '@/lib/cinematic/capabilities';
import { parseTeacherLearningRequest } from './cinematic-learner-copy';

const linter = new Linter();
const browserGlobals = Object.fromEntries(
  'THREE window document console navigator performance requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval devicePixelRatio innerWidth innerHeight outerWidth outerHeight self location addEventListener removeEventListener getComputedStyle matchMedia ResizeObserver MutationObserver IntersectionObserver Image ImageData Path2D Event CustomEvent PointerEvent MouseEvent KeyboardEvent HTMLElement HTMLCanvasElement CanvasRenderingContext2D WebGLRenderingContext WebGL2RenderingContext DOMMatrix DOMPoint DOMParser XMLSerializer URL URLSearchParams Blob File FileReader TextEncoder TextDecoder atob btoa alert confirm prompt localStorage sessionStorage screen scrollX scrollY CSS'
    .split(' ')
    .map((name) => [name, 'readonly']),
);

export const ANIMATED_EXPLAINER_SYSTEM = `你是交互教学可视化工程师。生成一个完整、自包含、可操作的 HTML 动画演示页面，只返回 <!doctype html> 到 </html>，不要 Markdown。
根据教师主题设计具体的图形、实体、连接、阶段和状态变化，不使用固定的攻击者-Web-数据库模板，不把设计说明当作学生正文。页面中心必须是真正运动的图形，文字只做简短同步讲解。演示历史事件时使用抽象教学模型，不输出可操作的攻击载荷、设备命令或连接真实设备的流程。
可用原生 SVG、Canvas、CSS 和 Three.js 0.150.1。使用 Three.js 时写 <script src="aisecedu:three"></script>，平台会在沙箱内内置全局 THREE，无需 CDN。让 WebGLRenderer 自行创建上下文；若提前调用 canvas.getContext 检测能力，必须把该上下文作为 context 参数传给渲染器，不能在同一个 canvas 上切换上下文类型。禁止其他依赖、外部图片、字体、fetch、WebSocket、iframe、系统命令及父页面访问。不要 import；不要 eval。3D 必须在 WebGL 不可用时提供可操作的 SVG/Canvas 2D 降级和明确说明。
必须包含可工作的控件：id="animation-play" 播放，id="animation-pause" 暂停，id="animation-step" 单步，id="animation-reset" 重置，id="animation-progress" 的 range 时间轴。通过 requestAnimationFrame 驱动真实可见的实体移动、状态或参数渐变，暂停冻结时间，重置恢复完全相同的初态，时间轴可回拖。至少四个明确阶段；阶段与进度显示同步变化；用户可从任意阶段开始，不能只有按钮点击后的日志或 PPT 翻页。
所有位置、转角、脉冲、光点和阶段状态必须由唯一的播放时间或 progress 确定性计算。暂停时不能再递增 elapsedTicks、anomaly.t、粒子位移或使用墙钟驱动视觉效果；不要把暂停误做成仅停止进度条。单步和回拖也更新同一个时间。重置把该时间归零，不能用 Math.random 重新播种粒子。WebGL 正常时隐藏 2D 降级画布，不能把两种渲染重叠显示。
画布标记 data-animation-scene，根元素 data-animation-state 表示当前阶段和时间。用响应式布局，320px 到 1440px 无横向溢出；中文可读、足够对比度。所有 querySelector 的元素必须真实存在，事件监听在 DOM 就绪后注册；避免无限创建几何体或事件监听。所有数值只用于概念示意，不宣称真实工程控制参数。`;

export function animatedHtmlIssues(html: string): string[] {
  const issues: string[] = [];
  if (html.length < 2_000 || html.length > 250_000 || !/<\/html\s*>/i.test(html))
    issues.push('完整 HTML 文档');
  if (!/<(?:svg|canvas)\b/i.test(html)) issues.push('可视化画布');
  if (!/requestAnimationFrame\s*\(/.test(html)) issues.push('逐帧动画');
  for (const id of [
    'animation-play',
    'animation-pause',
    'animation-step',
    'animation-reset',
    'animation-progress',
  ]) {
    if (!new RegExp(`id\\s*=\\s*["']${id}["']`).test(html)) issues.push(id);
  }
  const scripts: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1];
    if (/\bsrc\s*=/i.test(attributes)) {
      if (!/\bsrc\s*=\s*["']aisecedu:three["']/i.test(attributes)) issues.push('非内置脚本依赖');
      continue;
    }
    if (/\btype\s*=\s*["']application\/json["']/i.test(attributes)) continue;
    scripts.push(match[2]);
    try {
      new Script(match[2]);
    } catch {
      issues.push('JavaScript 语法错误');
    }
  }
  const diagnostics = linter.verify(scripts.join('\n;\n'), {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserGlobals as Record<string, 'readonly'>,
    },
    rules: { 'no-undef': 'error' },
  });
  for (const diagnostic of diagnostics.filter((item) => item.severity === 2).slice(0, 8)) {
    issues.push(`脚本标识符检查：${diagnostic.message}`);
  }
  return [...new Set(issues)];
}

export async function generateAnimatedExplainer(
  input: SingleArtifactInput,
  order: number,
  aiCall: AICallFn,
  previous?: { html: string; instruction: string },
  hooks?: CinematicGenerationHooks,
): Promise<LessonArtifact> {
  if (previous && hooks?.workflowVersion === 'staged-v2' && extractCinematicScene(previous.html))
    return reviseCinematicExplainer(input, order, aiCall, previous, {state: hooks.learnerState, signal: hooks.inspectionSignal});
  return generateCinematicExplainer(input, order, aiCall, previous, hooks);
}

export function wantsAnimation(value: string): boolean {
  return /动画|动态(?:图|演示|过程)|逐帧|three\.?js|tree\.?js|webgl|3d|三维|canvas|svg.*演示/i.test(
    value,
  );
}

export function animatedPlanInput(
  plan: Record<string, unknown>,
  request: string,
  teacherLearningRequest?: unknown,
): SingleArtifactInput {
  const description = `在同一个连续画布中完成下列全部阶段、控件和证据通道，不要拆成幻灯片。\n${JSON.stringify({ request, plan })}`;
  if (description.length > 200_000)
    throw new Error('连续演示的完整需求与计划超过200000字符，未截断原请求或交互合同。');
  return {
    type: 'simulation',
    title: String(plan.title || '交互动画演示').slice(0, 120),
    description,
    originalRequest: request,
    teacherLearningRequest: parseTeacherLearningRequest(teacherLearningRequest),
    visualIntent:
      plan.visualIntent === undefined
        ? undefined
        : {
            ...parseVisualGenerationIntent(plan.visualIntent),
            ...(typeof plan.visualIntent === 'object' &&
            plan.visualIntent !== null &&
            'jsonParsing' in plan.visualIntent
              ? {
                  jsonParsing: (
                    plan.visualIntent as import('@/lib/cinematic/capabilities').VisualGenerationIntent
                  ).jsonParsing,
                }
              : {}),
          },
    keyPoints: Array.isArray(plan.objectives) ? plan.objectives.map(String).slice(0, 12) : [],
  };
}

export function wantsSingleAnimatedScene(instruction: string): boolean {
  return /单页|单个(?:连续)?画布|同一(?:个)?(?:连续)?画布|合并.*(?:动画|场景|演示)|single[ -]page|one (?:continuous )?canvas/i.test(
    instruction,
  );
}

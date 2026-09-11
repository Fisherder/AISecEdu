import { nanoid } from 'nanoid';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { buildSecurityKnowledgeContext } from '@/lib/security/context-builder';
import { validateSecurityContent } from '@/lib/security/validator';
import { ensureLabSolvability } from '@/lib/security/lab-solvability';
import { resolveModel } from '@/lib/server/resolve-model';
import { callLLM, type ThinkingConfig } from '@/lib/ai/llm';
import { normalizeElement } from '@openmaic/dsl';
import { generateSceneContent } from '@/lib/generation/scene-generator';
import {
  buildSimulationScenarioFromOutline,
  renderScenarioHtml,
} from '@/lib/generation/widget-workflow';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedInteractiveContent,
  GeneratedQuizContent,
} from '@/lib/types/generation';
import type { LessonArtifact, LessonArtifactType } from '@/lib/types/lesson';
import { createLogger } from '@/lib/logger';

const log = createLogger('LessonGeneration');

/** Extract the first complete HTML document from an LLM response. */
function extractHtml(raw: string): string | null {
  const lower = raw.toLowerCase();
  const start = lower.indexOf('<!doctype');
  const start2 = start < 0 ? lower.indexOf('<html') : start;
  if (start2 < 0) return null;
  const end = lower.lastIndexOf('</html>');
  if (end < start2) return null;
  return raw.slice(start2, end + 7);
}

/** Extract a descriptive title from generated HTML's <title> tag. */
function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title>(.*?)<\/title>/i);
  const title = m?.[1]?.trim();
  return title && title.length > 1 && title.length < 80 ? title : null;
}

/** Check if generated content has an HTML field (widgets/labs). */
function contentHasHtml(content: ArtifactContent): boolean {
  return typeof (content as unknown as Record<string, unknown>)?.html === 'string';
}

function fallbackText(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function fallbackId(value: string, index: number): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `fallback-${slug || 'artifact'}-${index + 1}`;
}

type QuizConfig = NonNullable<SceneOutline['quizConfig']>;

function normalizedQuizConfig(value: SingleArtifactInput['quizConfig']): QuizConfig {
  const questionCount = Math.max(1, Math.min(20, Math.trunc(Number(value?.questionCount) || 1)));
  const difficulty = ['easy', 'medium', 'hard'].includes(String(value?.difficulty))
    ? (value?.difficulty as QuizConfig['difficulty'])
    : 'medium';
  const questionTypes = (value?.questionTypes || ['single']).filter((item) =>
    ['single', 'multiple', 'text'].includes(item),
  );
  return {
    questionCount,
    difficulty,
    questionTypes: questionTypes.length ? questionTypes : ['single'],
  };
}

function buildFallbackSlideContent(input: SingleArtifactInput): GeneratedSlideContent {
  const title = fallbackText(input.title, '教学页面');
  const description = fallbackText(
    input.description,
    '本页用于建立一个可观察、可解释并可复盘的学习步骤。',
  );
  const points = (input.keyPoints || [])
    .map((point) => String(point).trim())
    .filter(Boolean)
    .slice(0, 6);
  const items = [title, description, ...(points.length ? points : ['记录证据并说明判断依据。'])];
  const elements = items.map((text, index) =>
    normalizeElement({
      id: fallbackId(title, index),
      type: 'text',
      content: index === 0 ? `<h1>${escapeHtml(text)}</h1>` : `<p>${escapeHtml(text)}</p>`,
      left: 80,
      top: 70 + index * 105,
      width: 1120,
      height: index === 0 ? 90 : 76,
    }),
  );
  return {
    elements,
    layout: 'concept',
    speakerNotes: `本页由确定性兜底生成。请围绕“${title}”先讲清目标，再要求学习者用具体证据解释${description}`,
    generationFallback: true,
  } as GeneratedSlideContent;
}

function buildFallbackQuizContent(input: SingleArtifactInput): GeneratedQuizContent {
  const title = fallbackText(input.title, '知识检查');
  const config = normalizedQuizConfig(input.quizConfig);
  const points = (input.keyPoints || [])
    .map((point) => String(point).trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    questions: Array.from({ length: config.questionCount }, (_, index) => {
      const requestedType = config.questionTypes[index % config.questionTypes.length];
      const type = requestedType === 'text' ? 'short_answer' : requestedType;
      const base = {
        id: fallbackId(title, index),
        type,
        question: `关于“${title}”的检查 ${index + 1}：哪一项最能体现可验证的学习证据？`,
        analysis: '作答应同时说明行为、证据和原因，而不是只复述结论。',
        points: 1,
      };
      if (type === 'short_answer') {
        return { ...base, hasAnswer: false };
      }
      return {
        ...base,
        options: [
          {
            value: 'A',
            label: points[index % Math.max(1, points.length)] || '能够说明观察到的状态变化及其原因',
          },
          { value: 'B', label: '只记住术语，不说明依据' },
          { value: 'C', label: '跳过边界和复盘' },
        ],
        answer: type === 'multiple' ? ['A', 'B'] : ['A'],
        hasAnswer: true,
      };
    }) as GeneratedQuizContent['questions'],
    generationFallback: true,
  } as GeneratedQuizContent;
}

function quizContentSatisfiesInput(
  input: SingleArtifactInput,
  content: GeneratedQuizContent,
): boolean {
  if (!input.quizConfig) return true;
  const config = normalizedQuizConfig(input.quizConfig);
  if (!Array.isArray(content.questions) || content.questions.length !== config.questionCount) {
    return false;
  }
  const allowed = new Set<string>(
    config.questionTypes.map((item) => (item === 'text' ? 'short_answer' : item)),
  );
  return content.questions.every((question) => {
    const item = question as unknown as Record<string, unknown>;
    const type = String(item.type || '');
    if (!allowed.has(type)) return false;
    const feedback = String(
      item.analysis || item.feedback || item.explanation || item.comment || '',
    ).trim();
    if (!feedback) return false;
    if (type === 'short_answer') return Boolean(String(item.question || '').trim());
    const options = Array.isArray(item.options) ? item.options : [];
    const values = new Set(
      options
        .map((option) =>
          option && typeof option === 'object'
            ? String((option as Record<string, unknown>).value || '')
            : '',
        )
        .filter(Boolean),
    );
    const answers = Array.isArray(item.answer) ? item.answer.map(String).filter(Boolean) : [];
    return (
      Boolean(String(item.question || '').trim()) &&
      values.size >= 2 &&
      answers.length >= 1 &&
      (type !== 'single' || answers.length === 1) &&
      answers.every((answer) => values.has(answer))
    );
  });
}

function fallbackWidgetType(input: SingleArtifactInput): string {
  if (input.type === 'diagram') return 'diagram';
  if (input.type === 'code' || input.type === 'vulnerable-lab') return 'code';
  if (input.type === 'game') return 'game';
  if (input.type === 'visualization3d') return 'visualization3d';
  if (input.type === 'procedural-skill') return 'procedural-skill';
  return 'simulation';
}

function buildFallbackInteractiveContent(input: SingleArtifactInput): GeneratedInteractiveContent {
  const title = escapeHtml(fallbackText(input.title, '交互学习活动'));
  const description = escapeHtml(
    fallbackText(input.description, '在授权、隔离的教学环境中观察状态、记录证据并复盘。'),
  );
  const points = (input.keyPoints || [])
    .map((point) => String(point).trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;padding:28px;background:#071019;color:#e6f1f7;font:15px/1.7 system-ui,sans-serif}main{max-width:900px;margin:auto;border:1px solid #315064;border-radius:16px;padding:24px;background:#0d1b27}button{border:1px solid #36d8c4;border-radius:10px;padding:10px 14px;color:#e6f1f7;background:#102230;cursor:pointer}#status{color:#9ec5d5}</style></head><body><main data-aisecedu-fallback="true"><h1>${title}</h1><p>${description}</p><ul>${points || '<li>完成一个最小观察并记录证据。</li>'}</ul><button id="observe">记录一次观察</button><p id="status" aria-live="polite">尚未提交观察。</p></main><script>(()=>{const b=document.getElementById('observe');const s=document.getElementById('status');if(b&&s)b.addEventListener('click',()=>{s.textContent='观察已记录：请说明状态、证据与下一步验证。';});})();</script></body></html>`;
  return {
    html,
    widgetType: fallbackWidgetType(input) as GeneratedInteractiveContent['widgetType'],
    generationFallback: true,
  } as GeneratedInteractiveContent;
}

export function buildDeterministicFallbackContent(input: SingleArtifactInput): ArtifactContent {
  if (input.type === 'slide') return buildFallbackSlideContent(input);
  if (input.type === 'quiz') return buildFallbackQuizContent(input);
  return buildFallbackInteractiveContent(input);
}

export function buildDeterministicFallbackForOutline(outline: SceneOutline): {
  outline: SceneOutline;
  content: ArtifactContent;
} {
  const type: LessonArtifactType =
    outline.type === 'slide' || outline.type === 'quiz'
      ? outline.type
      : outline.type === 'pbl'
        ? 'slide'
        : outline.widgetType === 'diagram'
          ? 'diagram'
          : outline.widgetType === 'code'
            ? 'code'
            : outline.widgetType === 'procedural-skill'
              ? 'procedural-skill'
              : outline.widgetType === 'game'
                ? 'game'
                : outline.widgetType === 'visualization3d'
                  ? 'visualization3d'
                  : 'simulation';
  const fallbackOutline = outline.type === 'pbl' ? { ...outline, type: 'slide' as const } : outline;
  return {
    outline: fallbackOutline,
    content: buildDeterministicFallbackContent({
      type,
      title: fallbackOutline.title,
      description: fallbackOutline.description,
      keyPoints: fallbackOutline.keyPoints,
    }),
  };
}

async function validateHtmlSafely(html: string) {
  try {
    return await validateSecurityContent(html);
  } catch (error) {
    log.warn('Security content validation failed; preserving the artifact with a warning', error);
    return {
      passed: false,
      issues: [],
      stats: { cvesChecked: 0, cwesChecked: 0, cvssChecked: 0 },
      validationFallback: true,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Build the visual briefing shown before and during a multi-agent debate scene. */
export function buildDebateArtifactHtml(input: SingleArtifactInput): string {
  const title = escapeHtml(input.title);
  const description = escapeHtml(
    String(input.description || '').split(/视觉表达[：:]|讲授提示[：:]|教师修改要求|当前模拟配置|交付要求/)[0].trim() || '围绕该议题比较不同立场的证据、假设、收益与风险。',
  );
  const keyPoints = (
    input.keyPoints?.length
      ? input.keyPoints
      : ['澄清核心概念与争议边界', '用证据支持观点并回应反例', '形成有条件的权衡结论']
  )
    .slice(0, 6)
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; font-family: "Microsoft YaHei", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #e2e8f0; background: radial-gradient(circle at top right, #312e81 0, #0f172a 42%, #020617 100%); }
    main { width: min(1100px, 100%); margin: 0 auto; padding: 30px; }
    .eyebrow { color: #67e8f9; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 8px 0 10px; max-width: 900px; font-size: clamp(25px, 4vw, 42px); line-height: 1.2; }
    .lead { max-width: 900px; color: #a5b4fc; line-height: 1.8; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 24px; }
    .card { border: 1px solid #334155; border-radius: 16px; padding: 18px; background: rgba(15, 23, 42, .82); box-shadow: 0 15px 35px rgba(0,0,0,.18); }
    .card h2 { margin: 0 0 10px; font-size: 16px; }
    .roles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .role { border: 1px solid #3730a3; border-radius: 12px; padding: 12px; background: rgba(49,46,129,.22); }
    .role b { display: block; margin-bottom: 6px; color: #c4b5fd; }
    .role span, li, p { color: #cbd5e1; font-size: 13px; line-height: 1.65; }
    ol, ul { margin: 8px 0 0; padding-left: 20px; }
    .phase { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0; }
    .phase i { display: grid; flex: 0 0 28px; height: 28px; place-items: center; border-radius: 50%; background: #0891b2; color: white; font-style: normal; font-weight: 800; }
    .phase strong { display: block; color: #f8fafc; font-size: 13px; }
    .rubric { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .rubric span { border: 1px solid #475569; border-radius: 999px; padding: 6px 10px; color: #94a3b8; font-size: 12px; }
    .notice { margin-top: 14px; border-left: 3px solid #22d3ee; padding: 10px 12px; background: rgba(8,145,178,.08); color: #bae6fd; font-size: 12px; line-height: 1.7; }
    @media (max-width: 760px) { main { padding: 18px; } .grid, .roles { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">玄甲全局智能体 · 多角色教学辩论</div>
    <h1>${title}</h1>
    <p class="lead">${description}</p>

    <section class="card">
      <h2>参与角色</h2>
      <div class="roles">
        <div class="role"><b>主持人</b><span>界定议题、控制轮次、追问薄弱环节。</span></div>
        <div class="role"><b>正方</b><span>提出主张，并用事实、案例和条件支持论证。</span></div>
        <div class="role"><b>反方</b><span>挑战关键假设，提出风险、反例和替代方案。</span></div>
        <div class="role"><b>事实核查员</b><span>区分事实、推断与价值判断，标记待验证证据。</span></div>
      </div>
    </section>

    <div class="grid">
      <section class="card">
        <h2>核心讨论检查点</h2>
        <ul>${keyPoints}</ul>
        <div class="notice">学生任务：记录双方最强论据与最弱假设；在结辩前提交自己的有条件结论，而不是简单站队。</div>
      </section>
      <section class="card">
        <h2>课堂流程</h2>
        <div class="phase"><i>1</i><div><strong>议题澄清</strong><p>定义术语、边界和判断标准。</p></div></div>
        <div class="phase"><i>2</i><div><strong>立论与举证</strong><p>正反方分别陈述主张和证据。</p></div></div>
        <div class="phase"><i>3</i><div><strong>交叉质询</strong><p>回应反例，核查事实，暴露隐含假设。</p></div></div>
        <div class="phase"><i>4</i><div><strong>综合决策</strong><p>主持人归纳分歧，学生形成权衡结论。</p></div></div>
      </section>
    </div>

    <section class="card" style="margin-top:14px">
      <h2>评价维度</h2>
      <div class="rubric"><span>论点清晰</span><span>证据可靠</span><span>回应有效</span><span>边界意识</span><span>权衡完整</span></div>
    </section>
  </main>
</body>
</html>`;
}

/**
 * Compile an already planned attack/defence candidate into a deterministic,
 * self-contained lab preview.  Candidate generation has already used the
 * required complex model; materialization must not depend on another model
 * returning a perfectly fenced HTML document.
 */
export function buildAttackDefenseArtifactHtml(input: SingleArtifactInput): string {
  const title = escapeHtml(input.title || '隔离攻防演示实验');
  const description = escapeHtml(
    input.description || '在不连接真实目标的浏览器模拟器中完成攻击观察、检测、修复与回归验证。',
  );
  const keyPoints = (
    input.keyPoints?.length
      ? input.keyPoints
      : ['识别异常输入与查询行为', '从日志中定位攻击证据', '启用参数化查询并完成回归验证']
  )
    .slice(0, 8)
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; font-family: "Microsoft YaHei", system-ui, sans-serif; --bg:#071019; --panel:#0d1b27; --line:#234052; --text:#e6f1f7; --muted:#8ba7b8; --cyan:#36d8c4; --red:#fb7185; --amber:#fbbf24; --green:#4ade80; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; color:var(--text); background:radial-gradient(circle at 85% 0,#12314a 0,transparent 38%),var(--bg); }
    main { width:min(1180px,100%); margin:auto; padding:28px; }
    .top { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
    .eyebrow { color:var(--cyan); font-size:12px; font-weight:800; letter-spacing:.14em; }
    h1 { margin:8px 0; font-size:clamp(25px,4vw,42px); line-height:1.2; }
    .lead { max-width:820px; color:#b8cad5; line-height:1.75; }
    .isolation { border:1px solid #3e5d38; border-radius:999px; padding:8px 12px; color:#b7f7c9; background:#10281b; font-size:12px; white-space:nowrap; }
    .grid { display:grid; grid-template-columns:1.15fr .85fr; gap:16px; margin-top:22px; }
    .panel { border:1px solid var(--line); border-radius:16px; padding:18px; background:rgba(13,27,39,.94); box-shadow:0 18px 50px rgba(0,0,0,.18); }
    .panel h2 { margin:0 0 12px; font-size:16px; }
    .topology { display:grid; grid-template-columns:repeat(4,1fr); align-items:center; gap:10px; }
    .node { min-height:86px; display:grid; place-items:center; text-align:center; border:1px solid #315064; border-radius:12px; padding:10px; background:#0a1620; font-size:12px; }
    .node b { display:block; margin-bottom:5px; color:#dff8f5; }
    .arrow { color:#5c8296; text-align:center; font-weight:800; }
    .steps { display:grid; gap:9px; }
    button { width:100%; border:1px solid #315064; border-radius:11px; padding:12px 14px; color:var(--text); background:#102230; text-align:left; cursor:pointer; font:inherit; transition:.18s ease; }
    button:hover,button:focus-visible { border-color:var(--cyan); transform:translateY(-1px); outline:none; }
    button.done { border-color:#2f7a4a; background:#10291d; }
    button span { float:right; color:var(--muted); }
    .console { min-height:210px; margin-top:12px; border:1px solid #1e3645; border-radius:12px; padding:14px; background:#03090e; color:#9ec5d5; font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace; overflow:auto; }
    .console p { margin:0 0 5px; }
    .attack { color:var(--red); } .detect { color:var(--amber); } .defend { color:var(--green); }
    .meter { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:14px; }
    .meter i { height:5px; border-radius:99px; background:#1d3442; }
    .meter i.on { background:var(--cyan); box-shadow:0 0 14px rgba(54,216,196,.5); }
    ul { margin:8px 0 0; padding-left:20px; color:#b8cad5; line-height:1.7; font-size:13px; }
    .result { margin-top:12px; border:1px dashed #315064; border-radius:12px; padding:13px; color:var(--muted); font-size:13px; }
    .result.pass { border-color:#2f7a4a; color:#b7f7c9; background:#10291d; }
    .notice { margin-top:16px; color:#7895a6; font-size:12px; line-height:1.7; }
    @media (max-width:800px) { main{padding:16px}.top{display:block}.isolation{display:inline-block;margin-top:8px}.grid{grid-template-columns:1fr}.topology{grid-template-columns:1fr}.arrow{transform:rotate(90deg)} }
  </style>
</head>
<body>
  <main>
    <header class="top">
      <div><div class="eyebrow">玄甲 · ATTACK / DEFENCE LAB</div><h1>${title}</h1><p class="lead">${description}</p></div>
      <div class="isolation">● 授权隔离模拟 · 无外部网络请求</div>
    </header>
    <section class="panel">
      <h2>隔离拓扑</h2>
      <div class="topology">
        <div class="node"><div><b>攻击者终端</b>仅产生本地模拟输入</div></div><div class="arrow">→</div>
        <div class="node"><div><b>教学 Web 应用</b>故意保留的输入缺陷</div></div><div class="arrow">→</div>
        <div class="node"><div><b>模拟数据库</b>仅浏览器内演示数据</div></div><div class="arrow">↘</div>
        <div class="node"><div><b>防守者 / SOC</b>日志、检测与修复控制</div></div>
      </div>
    </section>
    <div class="grid">
      <section class="panel">
        <h2>演示控制台</h2>
        <div class="steps">
          <button data-step="attack">1. 运行隔离攻击模拟 <span>观察异常查询</span></button>
          <button data-step="detect">2. 启动检测与取证 <span>关联请求和数据库日志</span></button>
          <button data-step="defend">3. 应用防守修复 <span>参数化查询 + 最小权限</span></button>
          <button data-step="verify">4. 执行回归验证 <span>确认攻击失效</span></button>
        </div>
        <div class="meter"><i></i><i></i><i></i><i></i></div>
        <div id="console" class="console" aria-live="polite"><p>[ready] 实验已初始化；所有行为只改变当前页面状态。</p></div>
        <div id="result" class="result" aria-live="polite">按顺序完成四个阶段后生成验证结论。</div>
        <button data-step="reset" style="margin-top:10px">重置实验</button>
      </section>
      <aside class="panel">
        <h2>学习与验证要点</h2>
        <ul>${keyPoints}</ul>
        <p class="notice">安全边界：本实验不接收目标地址、不执行系统命令、不发送网络流量，也不提供面向公网的攻击自动化。教师可在详情页继续用自然语言调整场景、角色和评价标准。</p>
      </aside>
    </div>
  </main>
  <script>
    (() => {
      const order = ['attack','detect','defend','verify'];
      const messages = {
        attack: '<span class="attack">[attack]</span> 模拟输入触发字符串拼接查询；教学数据库返回异常结果。',
        detect: '<span class="detect">[detect]</span> SOC 关联到异常字符、返回行数突增和同源请求日志。',
        defend: '<span class="defend">[defend]</span> 已启用参数化查询、最小权限与统一错误响应。',
        verify: '<span class="defend">[verify]</span> 相同模拟输入被作为普通参数处理；未出现越权数据。'
      };
      let completed = [];
      const consoleEl = document.getElementById('console');
      const result = document.getElementById('result');
      const render = () => document.querySelectorAll('.meter i').forEach((item,index) => item.classList.toggle('on', index < completed.length));
      document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
        const step = button.dataset.step;
        if (step === 'reset') {
          completed = []; document.querySelectorAll('.steps button').forEach((item) => item.classList.remove('done'));
          consoleEl.innerHTML = '<p>[ready] 实验已重置。</p>'; result.className = 'result'; result.textContent = '按顺序完成四个阶段后生成验证结论。'; render(); return;
        }
        const expected = order[completed.length];
        if (step !== expected) { consoleEl.insertAdjacentHTML('beforeend','<p>[guide] 请先完成上一阶段。</p>'); return; }
        completed.push(step); button.classList.add('done'); consoleEl.insertAdjacentHTML('beforeend','<p>' + messages[step] + '</p>'); render();
        if (step === 'verify') { result.className = 'result pass'; result.textContent = '验证通过：攻击现象可观察、检测证据可追溯、修复已生效，回归测试成功。'; }
      }));
    })();
  </script>
</body>
</html>`;
}

export interface SingleArtifactInput {
  type: LessonArtifactType;
  title: string;
  keyPoints?: string[];
  description?: string;
  quizConfig?: QuizConfig;
}

/** Build a SceneOutline for a single artifact of the given type. */
export function buildOutlineForArtifact(input: SingleArtifactInput, order: number): SceneOutline {
  const base = {
    id: nanoid(),
    title: input.title,
    description: input.description || '',
    keyPoints: input.keyPoints || [],
    order,
  };
  switch (input.type) {
    case 'slide':
      return { ...base, type: 'slide' };
    case 'quiz':
      return {
        ...base,
        type: 'quiz',
        quizConfig: normalizedQuizConfig(
          input.quizConfig || {
            questionCount: 3,
            difficulty: 'medium',
            questionTypes: ['single'],
          },
        ),
      };
    case 'diagram':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'diagram',
        widgetOutline: { diagramType: 'flowchart' },
      };
    case 'simulation':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'simulation',
        widgetOutline: { concept: input.title },
      };
    case 'code':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'code',
        widgetOutline: { language: 'python' },
      };
    case 'procedural-skill':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'procedural-skill',
        widgetOutline: { task: input.title },
      };
    case 'game':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'game',
        widgetOutline: { gameType: 'quiz' },
      };
    case 'visualization3d':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'visualization3d',
        widgetOutline: { visualizationType: 'custom' },
      };
    case 'vulnerable-lab':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'code',
        widgetOutline: { language: 'javascript' },
      };
    case 'debate':
      return {
        ...base,
        type: 'interactive',
        widgetType: 'simulation',
        widgetOutline: { concept: `围绕“${input.title}”开展结构化多智能体辩论` },
      };
  }
}

/**
 * Resolve the server model + return an aiCall bound to it.
 * - 'fast' (default): DEFAULT_MODEL (e.g. DeepSeek Flash) + workflow rendering.
 * - 'rich': PREP_RICH_MODEL env (a stronger model) + original bespoke prompts.
 */
export async function buildLessonAiCall(
  quality: 'fast' | 'rich' = 'fast',
  options: { thinking?: ThinkingConfig; retries?: number } = {},
): Promise<{
  aiCall: AICallFn;
  modelInfo: { id?: string; outputWindow?: number };
  quality: 'fast' | 'rich';
}> {
  const richModel = process.env.PREP_RICH_MODEL;
  const { model, modelInfo } =
    quality === 'rich' && richModel
      ? await resolveModel({ modelString: richModel })
      : await resolveModel({ stage: 'generate-classroom' });
  const aiCall: AICallFn = async (system, user) => {
    const r = await callLLM(
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'generate-classroom',
      options.retries ? { retries: options.retries } : undefined,
      options.thinking,
    );
    return r.text;
  };
  return {
    aiCall,
    modelInfo: { id: modelInfo?.id, outputWindow: modelInfo?.outputWindow },
    quality,
  };
}

export type ArtifactContent =
  | GeneratedSlideContent
  | GeneratedInteractiveContent
  | GeneratedQuizContent;

/** Route an outline to the right generator (via generateSceneContent) and return content. */
export async function generateArtifactContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  opts: {
    languageDirective?: string;
    subjectProfile?: boolean;
    useWorkflow?: boolean;
    securityKnowledge?: string;
  },
): Promise<ArtifactContent | null> {
  // buildOutlineForArtifact never produces a PBL outline, so PBL is impossible here.
  return generateSceneContent(outline, aiCall, {
    languageDirective: opts.languageDirective,
    subjectProfile: opts.subjectProfile,
    useWorkflow: opts.useWorkflow,
    securityKnowledge: opts.securityKnowledge,
    allowProceduralSkill: true,
  }) as Promise<ArtifactContent | null>;
}

/** Generate a single artifact from input. */
export async function generateSingleArtifact(
  input: SingleArtifactInput,
  order: number,
  aiCall: AICallFn,
  opts: {
    languageDirective?: string;
    subjectProfile?: boolean;
    useWorkflow?: boolean;
    securityKnowledge?: string;
    deterministicLab?: boolean;
    deterministicSimulation?: boolean;
  },
): Promise<LessonArtifact | null> {
  const outline = buildOutlineForArtifact(input, order);

  // Debate uses a deterministic, safe visual briefing. Its autonomous agent
  // roster and director instructions are attached when the lesson is published.
  if (input.type === 'debate') {
    const html = buildDebateArtifactHtml(input);
    return {
      id: nanoid(),
      type: 'debate',
      title: input.title,
      outline,
      content: { html, widgetType: 'simulation' } as GeneratedInteractiveContent,
      order,
      createdAt: Date.now(),
      validation: await validateHtmlSafely(html),
    };
  }

  if (opts.deterministicLab && input.type === 'simulation') {
    const html = buildAttackDefenseArtifactHtml(input);
    return {
      id: nanoid(),
      type: 'simulation',
      title: input.title,
      outline,
      content: { html, widgetType: 'simulation' } as GeneratedInteractiveContent,
      order,
      createdAt: Date.now(),
      validation: await validateHtmlSafely(html),
    };
  }

  if (opts.deterministicSimulation && input.type === 'simulation') {
    const scenario = buildSimulationScenarioFromOutline(outline);
    const html = renderScenarioHtml(scenario);
    return {
      id: nanoid(),
      type: 'simulation',
      title: input.title,
      outline: {
        ...outline,
        // Revision instructions and embedded prior widget JSON guide the
        // compiler; they must never become visible artifact copy.
        description: scenario.description || `通过可观察证据比较${input.title}的状态变化。`,
      },
      content: {
        html,
        widgetType: 'simulation',
        widgetConfig: scenario,
      } as unknown as GeneratedInteractiveContent,
      order,
      createdAt: Date.now(),
      validation: await validateHtmlSafely(html),
    };
  }

  // Vulnerable-lab uses a dedicated prompt (not the standard widget routing)
  if (input.type === 'vulnerable-lab') {
    if (opts.deterministicLab) {
      const compiled = ensureLabSolvability(buildAttackDefenseArtifactHtml(input));
      return {
        id: nanoid(),
        type: 'vulnerable-lab',
        title: input.title,
        outline,
        content: { html: compiled.html, widgetType: 'code' } as GeneratedInteractiveContent,
        order,
        createdAt: Date.now(),
        validation: await validateHtmlSafely(compiled.html),
        solvability: compiled.report,
      };
    }
    let securityKnowledge = '';
    try {
      securityKnowledge = await buildSecurityKnowledgeContext(input.title, input.description);
    } catch (error) {
      log.warn(
        'Vulnerable-lab security context failed; continuing with bounded prompt context',
        error,
      );
    }
    const labPrompts = buildPrompt(PROMPT_IDS.VULNERABLE_LAB_CONTENT, {
      vulnerabilityType: (input.keyPoints && input.keyPoints[0]) || 'SQL injection',
      topic: input.title,
      description: input.description || '',
      keyPoints: (input.keyPoints || []).join('；'),
      languageDirective: opts.languageDirective || '',
      subjectProfile: opts.subjectProfile ?? false,
      securityKnowledge,
    });
    if (!labPrompts) {
      return {
        id: nanoid(),
        type: input.type,
        title: input.title,
        outline,
        content: buildFallbackInteractiveContent(input),
        order,
        createdAt: Date.now(),
      };
    }
    let generatedHtml: string | null = null;
    try {
      generatedHtml = extractHtml(await aiCall(labPrompts.system, labPrompts.user));
    } catch (error) {
      log.warn('Vulnerable-lab model stage failed; using deterministic fallback', error);
    }
    if (!generatedHtml) {
      const fallback = ensureLabSolvability(buildAttackDefenseArtifactHtml(input));
      return {
        id: nanoid(),
        type: input.type,
        title: input.title,
        outline,
        content: {
          html: fallback.html,
          widgetType: 'code',
          generationFallback: true,
        } as GeneratedInteractiveContent,
        order,
        createdAt: Date.now(),
        validation: await validateHtmlSafely(fallback.html),
        solvability: fallback.report,
      };
    }
    // Factual correctness and task solvability are independent. Run both:
    // the latter can conservatively surface an answer that exists only inside
    // a checker script (the exact defect reported for the ransomware lab).
    const { html, report: solvability } = ensureLabSolvability(generatedHtml);
    const validation = await validateHtmlSafely(html);
    return {
      id: nanoid(),
      type: 'vulnerable-lab',
      title: extractHtmlTitle(html) || input.title,
      outline,
      content: { html, widgetType: 'code' } as GeneratedInteractiveContent,
      order,
      createdAt: Date.now(),
      validation,
      solvability,
    };
  }

  // Build security knowledge context for all artifact types (not just vulnerable-lab)
  let secKnowledge = opts.securityKnowledge;
  if (secKnowledge === undefined) {
    try {
      secKnowledge = await buildSecurityKnowledgeContext(input.title, input.description);
    } catch (error) {
      log.warn(
        'Security knowledge context failed; continuing with bounded fallback context',
        error,
      );
      secKnowledge = '';
    }
  }
  let content: ArtifactContent | null = null;
  try {
    content = await generateArtifactContent(outline, aiCall, {
      ...opts,
      securityKnowledge: secKnowledge,
    });
  } catch (error) {
    log.warn('Artifact model stage failed; using deterministic fallback', error);
  }
  if (
    input.type === 'quiz' &&
    content &&
    !quizContentSatisfiesInput(input, content as GeneratedQuizContent)
  ) {
    log.warn(
      'Quiz model stage violated the requested question contract; using deterministic fallback',
    );
    content = null;
  }
  if (!content) content = buildDeterministicFallbackContent(input);
  // Use a descriptive title from the generated HTML when available (widgets have
  // a <title> tag that's more descriptive than the raw requirement text).
  const htmlTitle =
    'html' in content && typeof (content as unknown as Record<string, unknown>).html === 'string'
      ? extractHtmlTitle((content as unknown as Record<string, unknown>).html as string)
      : null;
  return {
    id: nanoid(),
    type: input.type,
    title: htmlTitle || input.title,
    outline,
    content,
    validation: contentHasHtml(content)
      ? await validateHtmlSafely((content as unknown as Record<string, unknown>).html as string)
      : undefined,
    order,
    createdAt: Date.now(),
  };
}

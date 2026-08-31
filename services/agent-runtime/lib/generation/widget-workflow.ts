/**
 * Interactive-widget generation via a small-call workflow (prototype).
 *
 * Same idea as slide-workflow: DeepSeek V4 Flash hangs on the single giant
 * widget call (full self-contained HTML output). Here the LLM only produces
 * a compact STRUCTURED CONFIG (small JSON), and code renders it into the full
 * HTML the iframe expects. Currently covers the `diagram` widget — the
 * highest-value security widget and the most templatable (nodes/edges → SVG).
 */
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { createLogger } from '@/lib/logger';
import type { SceneOutline } from '@/lib/types/generation';
import type { GeneratedInteractiveContent } from '@/lib/types/generation';
import type { WidgetConfig } from '@/lib/types/widgets';
import { parseJsonResponse } from './json-repair';
import type { AICallFn } from './pipeline-types';

const log = createLogger('WidgetWorkflow');

export interface DiagramConfigNode {
  id: string;
  label: string;
  details?: string;
  kind?: string;
}
export interface DiagramConfigEdge {
  from: string;
  to: string;
  label?: string;
}
export interface DiagramConfig {
  type: 'diagram';
  diagramType: string;
  title: string;
  description?: string;
  nodes: DiagramConfigNode[];
  edges: DiagramConfigEdge[];
}

function parseDiagramConfig(raw: string): DiagramConfig | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<DiagramConfig>;
    if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) return null;
    return {
      type: 'diagram',
      diagramType: obj.diagramType || 'flowchart',
      title: obj.title || 'Diagram',
      description: obj.description,
      nodes: obj.nodes as DiagramConfigNode[],
      edges: Array.isArray(obj.edges) ? (obj.edges as DiagramConfigEdge[]) : [],
    };
  } catch {
    return null;
  }
}

const KIND_COLORS: Record<string, string> = {
  goal: '#1d4ed8',
  action: '#2563eb',
  asset: '#d97706',
  threat: '#dc2626',
  control: '#16a34a',
  host: '#475569',
  tactic: '#7c3aed',
  technique: '#6366f1',
};
const NODE_W = 150;
const NODE_H = 54;
const COL_GAP = 90;
const ROW_GAP = 26;
const MARGIN_X = 30;
const MARGIN_TOP = 64;

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Assign nodes to layered columns (longest-path from roots); grid fallback. */
function layeredColumns(cfg: DiagramConfig): Map<string, { x: number; y: number }> {
  const ids = cfg.nodes.map((n) => n.id);
  const inDeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const outs = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of cfg.edges) {
    if (!outs.has(e.from) || !inDeg.has(e.to)) continue;
    outs.get(e.from)!.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  }
  const layer = new Map<string, number>();
  let roots = ids.filter((id) => (inDeg.get(id) || 0) === 0);
  if (roots.length === 0 && ids.length > 0) roots = [ids[0]!];
  roots.forEach((r) => layer.set(r, 0));
  for (let i = 0; i < ids.length + 1; i++) {
    for (const e of cfg.edges) {
      if (!layer.has(e.from) || !inDeg.has(e.to)) continue;
      const cand = (layer.get(e.from) || 0) + 1;
      if (!layer.has(e.to) || (layer.get(e.to) || 0) < cand) layer.set(e.to, cand);
    }
  }
  ids.forEach((id) => {
    if (!layer.has(id)) layer.set(id, 0);
  });

  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const l = layer.get(id)!;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  const pos = new Map<string, { x: number; y: number }>();
  let maxColNodes = 1;
  sortedLayers.forEach((l, colIdx) => {
    const members = byLayer.get(l)!;
    maxColNodes = Math.max(maxColNodes, members.length);
    const colHeight = members.length * NODE_H + (members.length - 1) * ROW_GAP;
    members.forEach((id, rowIdx) => {
      pos.set(id, {
        x: MARGIN_X + colIdx * (NODE_W + COL_GAP),
        y: MARGIN_TOP + rowIdx * (NODE_H + ROW_GAP) + colHeight * 0, // top-align; SVG viewBox grows
      });
    });
    void colHeight;
  });
  void maxColNodes;
  return pos;
}

/** Render a DiagramConfig into a self-contained HTML doc with an SVG. */
export function renderDiagramHtml(cfg: DiagramConfig): string {
  const pos = layeredColumns(cfg);

  // Compute canvas size
  let maxX = 0;
  let maxY = 0;
  pos.forEach((p) => {
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  });
  const width = Math.max(520, maxX + MARGIN_X);
  const height = Math.max(320, maxY + MARGIN_X);

  const cx = (id: string) => (pos.get(id)?.x ?? 0) + NODE_W / 2;
  const cy = (id: string) => (pos.get(id)?.y ?? 0) + NODE_H / 2;

  const edgeSvg = cfg.edges
    .map((e) => {
      if (!pos.has(e.from) || !pos.has(e.to)) return '';
      const x1 = cx(e.from);
      const y1 = cy(e.from);
      const x2 = cx(e.to);
      const y2 = cy(e.to);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const label = e.label
        ? `<rect x="${midX - (e.label.length * 4 + 6)}" y="${midY - 9}" width="${e.label.length * 8 + 12}" height="18" rx="4" fill="#ffffff" stroke="#e2e8f0"/><text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="10" fill="#475569">${esc(e.label)}</text>`
        : '';
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#arrow)"/>${label}`;
    })
    .join('');

  const nodeSvg = cfg.nodes
    .map((n) => {
      const p = pos.get(n.id);
      if (!p) return '';
      const color = (n.kind && KIND_COLORS[n.kind]) || '#64748b';
      return `<g>
        <rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="${color}" opacity="0.12" stroke="${color}" stroke-width="1.6"/>
        <text x="${p.x + NODE_W / 2}" y="${p.y + 22}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">${esc(n.label)}</text>
        ${n.details ? `<text x="${p.x + NODE_W / 2}" y="${p.y + 40}" text-anchor="middle" font-size="10" fill="#475569">${esc(n.details).slice(0, 26)}</text>` : ''}
      </g>`;
    })
    .join('');

  const configJson = JSON.stringify(cfg).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(cfg.title)}</title>
<style>
  html,body{margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a;}
  .wrap{padding:16px;}
  h2{font-size:18px;margin:0 0 4px;}
  p.desc{font-size:12px;color:#64748b;margin:0 0 12px;}
  svg{width:100%;height:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;}
</style>
</head>
<body>
<div class="wrap">
  <h2>${esc(cfg.title)}</h2>
  ${cfg.description ? `<p class="desc">${esc(cfg.description)}</p>` : ''}
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(cfg.title)}">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker></defs>
    ${edgeSvg}
    ${nodeSvg}
  </svg>
</div>
<script type="application/json" id="widget-config">${configJson}</script>
</body>
</html>`;
}

/** Generate a diagram widget via the small-call workflow. */
export async function generateDiagramViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const diagramType = outline.widgetOutline?.diagramType || 'flowchart';
  const prompts = buildPrompt(PROMPT_IDS.DIAGRAM_CONFIG, {
    title: outline.title,
    diagramType,
    description: outline.description || '',
    keyPoints: (outline.keyPoints || []).join('；'),
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  if (!prompts) {
    log.error('diagram-config prompt not found');
    return null;
  }

  const raw = await aiCall(prompts.system, prompts.user);
  const cfg = parseDiagramConfig(raw);
  if (!cfg) {
    log.error(`diagram-config parse failed for: ${outline.title}`);
    return null;
  }

  const html = renderDiagramHtml(cfg);
  // widgetConfig is informational (the agent reads it). Our workflow config
  // shape (kind-tagged nodes) differs from the strict WidgetConfig DiagramConfig,
  // so cast — the embedded <script id="widget-config"> is what the renderer parses.
  return { html, widgetType: 'diagram', widgetConfig: cfg as unknown as WidgetConfig };
}

// ==================== Code Widget ====================

export interface CodeConfig {
  type: 'code';
  language: string;
  description: string;
  starterCode: string;
  testCases: Array<{ input: string; expected: string; description?: string }>;
  hints: string[];
  solution: string;
}

function parseCodeConfig(raw: string): CodeConfig | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<CodeConfig>;
    if (typeof obj.starterCode !== 'string') return null;
    return {
      type: 'code',
      language: obj.language || 'javascript',
      description: obj.description || '',
      starterCode: obj.starterCode,
      testCases: Array.isArray(obj.testCases) ? obj.testCases : [],
      hints: Array.isArray(obj.hints) ? obj.hints : [],
      solution: obj.solution || '',
    };
  } catch {
    return null;
  }
}

export function renderCodeHtml(cfg: CodeConfig): string {
  const configJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const isPython = cfg.language.toLowerCase() === 'python';
  const tests = cfg.testCases
    .map(
      (t, i) =>
        `<li><b>用例 ${i + 1}</b>${t.description ? ` — ${esc(t.description)}` : ''}<br/><code>输入:</code> <span class="mono">${esc(t.input)}</span><br/><code>期望:</code> <span class="mono">${esc(t.expected)}</span></li>`,
    )
    .join('');
  const hints = cfg.hints.map((h) => `<li>${esc(h)}</li>`).join('');

  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="openmaic-code-runner" content="container-v1"/>
<title>${esc(cfg.language)} 练习</title>
<style>
  html,body{margin:0;padding:0;background:#0f172a;color:#e2e8f0;font-family:ui-sans-serif,system-ui,"PingFang SC",sans-serif;}
  .wrap{padding:14px;display:flex;flex-direction:column;gap:10px;}
  h2{font-size:16px;margin:0;} p.desc{font-size:12px;color:#94a3b8;margin:0;}
  textarea{width:100%;min-height:160px;background:#1e293b;color:#f1f5f9;border:1px solid #334155;border-radius:8px;padding:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;}
  button{background:#3b82f6;color:#fff;border:0;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;}
  button.ghost{background:#334155;}
  .mono{font-family:ui-monospace,monospace;color:#fbbf24;}
  details{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:12px;}
  summary{cursor:pointer;color:#93c5fd;}
  ul{margin:6px 0 0;padding-left:18px;} li{margin:4px 0;}
  #output{font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;background:#020617;border:1px solid #334155;border-radius:8px;padding:8px;min-height:20px;line-height:1.55;}
</style></head>
<body><div class="wrap">
  <h2>📝 ${esc(cfg.language)} 练习</h2>
  <p class="desc">${esc(cfg.description)}</p>
  <textarea id="code" spellcheck="false">${esc(cfg.starterCode)}</textarea>
  <div><button id="run-btn" onclick="run()">▶ 运行检查（${isPython ? 'Python 隔离容器' : 'JS'}）</button> <button class="ghost" onclick="reveal('sol')">显示参考解答</button></div>
  <div id="output">就绪。${isPython ? '提交后将在无网络、限资源的一次性容器中执行。' : ''}</div>
  <details><summary>测试用例 (${cfg.testCases.length})</summary><ul>${tests}</ul></details>
  <details><summary>提示 (${cfg.hints.length})</summary><ul>${hints}</ul></details>
  <details id="sol"><summary>参考解答（含防御说明）</summary><pre style="white-space:pre-wrap">${esc(cfg.solution)}</pre></details>
</div>
<script>
(function(){
  var cfg = ${configJson};
  function platformRequest(payload) {
    if (window.location.origin && window.location.origin !== 'null') {
      return fetch('/api/code/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(async function(response){
        var data = await response.json().catch(function(){ return {}; });
        if (!response.ok || !data.success) throw new Error(data.error || '代码运行服务请求失败');
        return data;
      });
    }
    return new Promise(function(resolve, reject){
      var requestId = 'code-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function(){
        window.removeEventListener('message', onResult);
        reject(new Error('代码运行服务响应超时'));
      }, 35000);
      function onResult(event) {
        var data = event && event.data;
        if (!data || data.__openmaicCodeRunner !== true || data.kind !== 'run-result' || data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onResult);
        if (!data.response || !data.response.success) reject(new Error((data.response && data.response.error) || '代码运行失败'));
        else resolve(data.response);
      }
      window.addEventListener('message', onResult);
      window.parent.postMessage({
        __openmaicCodeRunner: true,
        kind: 'run-request',
        requestId: requestId,
        payload: payload
      }, '*');
    });
  }
  function renderPythonResult(result) {
    var lines = [];
    lines.push(result.passed ? '✅ 全部测试通过（' + result.tests.length + '/' + result.tests.length + '）' : '❌ 通过 ' + result.tests.filter(function(t){ return t.passed; }).length + '/' + result.tests.length + ' 个测试');
    lines.push('运行环境: Python 隔离容器 · ' + result.durationMs + 'ms');
    result.tests.forEach(function(t){
      var title = t.description ? ' — ' + t.description : '';
      if (t.passed) lines.push('✅ 用例 ' + t.index + title + ': ' + t.actual);
      else if (t.error) lines.push('❌ 用例 ' + t.index + title + ': ' + t.error + ' / 期望 ' + t.expected);
      else lines.push('❌ 用例 ' + t.index + title + ': 得到 ' + t.actual + ' / 期望 ' + t.expected);
    });
    if (result.error) lines.push('❌ 代码错误: ' + result.error);
    if (result.stdout) lines.push('\\n标准输出:\\n' + result.stdout);
    return lines.join('\\n');
  }
  function runJavascript(code) {
    var lines = [];
    try {
      var declared = code.match(/function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/) || code.match(/(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>/);
      cfg.testCases.forEach(function(t, i){
        try {
          var expression = String(t.input).trim();
          if (declared && !/[A-Za-z_$][\\w$]*\\s*\\(/.test(expression)) expression = declared[1] + '(' + expression + ')';
          var fn = new Function('expression', code + '\\n; return eval(expression);');
          var r = fn(expression);
          var got = String(r);
          lines.push((got === t.expected ? '✅' : '❌') + ' 用例' + (i+1) + ': 得到 ' + got + ' / 期望 ' + t.expected);
        } catch(e){ lines.push('❌ 用例'+(i+1)+': 运行错误 ' + e.message); }
      });
    } catch(e){ lines.push('❌ 代码错误: ' + e.message); }
    return lines.join('\\n') || '无测试用例。';
  }
  window.run = async function(){
    var out = document.getElementById('output');
    var button = document.getElementById('run-btn');
    var code = document.getElementById('code').value;
    if (String(cfg.language).toLowerCase() === 'javascript') {
      out.textContent = runJavascript(code);
      return;
    }
    if (String(cfg.language).toLowerCase() !== 'python') {
      out.textContent = '当前容器暂不支持 ' + cfg.language + '。';
      return;
    }
    button.disabled = true;
    button.textContent = '⏳ 容器运行中…';
    out.textContent = '正在创建无网络、只读、限资源的 Python 临时容器…';
    try {
      var response = await platformRequest({ language: 'python', code: code, testCases: cfg.testCases });
      out.textContent = renderPythonResult(response.result);
    } catch(e) {
      out.textContent = '❌ ' + ((e && e.message) || '代码运行失败');
    } finally {
      button.disabled = false;
      button.textContent = '▶ 运行检查（Python 隔离容器）';
    }
  };
  window.reveal = function(id){ document.getElementById(id).open = true; };
})();
</script>
<script type="application/json" id="widget-config">${configJson}</script>
</body></html>`;
}

/**
 * Upgrade deterministic code widgets generated before the Python container
 * runner existed. The embedded widget config is the source of truth, so no LLM
 * call or reference-solution execution is needed during migration.
 */
export function upgradeLegacyCodeWidgetHtml(html: string): string {
  if (!html.includes('自动运行仅支持 JavaScript') || html.includes('name="openmaic-code-runner"')) {
    return html;
  }
  const configMatch = html.match(
    /<script\b[^>]*\bid=["']widget-config["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!configMatch?.[1]) return html;
  const config = parseCodeConfig(configMatch[1]);
  if (!config || config.language.toLowerCase() !== 'python') return html;
  return renderCodeHtml(config);
}

export async function generateCodeViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const prompts = buildPrompt(PROMPT_IDS.CODE_CONFIG, {
    title: outline.title,
    programmingLanguage: outline.widgetOutline?.language || 'javascript',
    description: outline.description || '',
    keyPoints: (outline.keyPoints || []).join('；'),
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  if (!prompts) return null;
  const raw = await aiCall(prompts.system, prompts.user);
  const cfg = parseCodeConfig(raw);
  if (!cfg) {
    log.error(`code-config parse failed for: ${outline.title}`);
    return null;
  }
  return {
    html: renderCodeHtml(cfg),
    widgetType: 'code',
    widgetConfig: cfg as unknown as WidgetConfig,
  };
}

// ==================== Procedural Skill Widget ====================

export interface ProceduralSkillConfig {
  type: 'procedural-skill';
  task: string;
  steps: Array<{
    title: string;
    description: string;
    tools?: string[];
    successCriteria?: string[];
  }>;
  tools?: string[];
  successCriteria?: string[];
}

function parseProceduralSkillConfig(raw: string): ProceduralSkillConfig | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<ProceduralSkillConfig>;
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) return null;
    return {
      type: 'procedural-skill',
      task: obj.task || '',
      steps: obj.steps,
      tools: obj.tools,
      successCriteria: obj.successCriteria,
    };
  } catch {
    return null;
  }
}

export function renderProceduralSkillHtml(cfg: ProceduralSkillConfig): string {
  const configJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const steps = cfg.steps
    .map(
      (s, i) =>
        `<details ${i === 0 ? 'open' : ''}><summary><b>${i + 1}. ${esc(s.title)}</b></summary>` +
        `<p>${esc(s.description)}</p>` +
        (s.tools?.length
          ? `<p><b>工具:</b> ${s.tools.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>`
          : '') +
        (s.successCriteria?.length
          ? `<ul>${s.successCriteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
          : '') +
        `</details>`,
    )
    .join('');
  const tools = cfg.tools?.length
    ? `<p class="meta"><b>整体工具:</b> ${cfg.tools.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>`
    : '';
  const overall = cfg.successCriteria?.length
    ? `<details><summary><b>完成标准</b></summary><ul>${cfg.successCriteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>`
    : '';

  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(cfg.task)}</title>
<style>
  html,body{margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:ui-sans-serif,system-ui,"PingFang SC",sans-serif;}
  .wrap{padding:14px;display:flex;flex-direction:column;gap:8px;}
  h2{font-size:16px;margin:0;} p.task{font-size:13px;color:#475569;margin:0 0 6px;}
  p.meta{font-size:12px;color:#475569;margin:0;}
  details{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;}
  summary{cursor:pointer;font-size:13px;color:#1d4ed8;}
  ul{margin:6px 0 0;padding-left:18px;} li{margin:3px 0;}
  .chip{display:inline-block;background:#e0e7ff;color:#3730a3;border-radius:10px;padding:1px 8px;font-size:11px;margin:0 2px;font-family:ui-monospace,monospace;}
</style></head>
<body><div class="wrap">
  <h2>🛠️ ${esc(cfg.task || '操作流程')}</h2>
  ${tools}
  ${steps}
  ${overall}
</div>
<script type="application/json" id="widget-config">${configJson}</script>
</body></html>`;
}

export async function generateProceduralSkillViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const prompts = buildPrompt(PROMPT_IDS.PROCEDURAL_SKILL_CONFIG, {
    title: outline.title,
    task: outline.widgetOutline?.task || outline.title,
    description: outline.description || '',
    keyPoints: (outline.keyPoints || []).join('；'),
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  if (!prompts) return null;
  const raw = await aiCall(prompts.system, prompts.user);
  const cfg = parseProceduralSkillConfig(raw);
  if (!cfg) {
    log.error(`procedural-skill-config parse failed for: ${outline.title}`);
    return null;
  }
  return {
    html: renderProceduralSkillHtml(cfg),
    widgetType: 'procedural-skill',
    widgetConfig: cfg as unknown as WidgetConfig,
  };
}

// ==================== Simulation Widget ====================

export interface SimulationScenario {
  type: 'simulation-scenario';
  title: string;
  description?: string;
  startScene: string;
  debrief?: string;
  comparisonSummary?: string;
  controls?: Array<{
    id: string;
    label: string;
    type: 'range' | 'toggle';
    min?: number;
    max?: number;
    step?: number;
    default: number | boolean;
    onLabel?: string;
    offLabel?: string;
    effect?: string;
  }>;
  evidenceChannels?: Array<{ id: string; label: string }>;
  scenes: Array<{
    id: string;
    title: string;
    narrative: string;
    stateLabel?: string;
    expectedObservation?: string;
    facilitatorCue?: string;
    evidence?: Record<string, string>;
    visual?: Record<string, unknown>;
    choices?: Array<{
      label: string;
      goto: string;
      effect?: string;
      set?: Record<string, number | boolean>;
    }>;
    insight?: string;
  }>;
}

const DEFAULT_SIMULATION_CONTROLS: NonNullable<SimulationScenario['controls']> = [
  {
    id: 'inputIntensity',
    label: '输入强度',
    type: 'range',
    min: 1,
    max: 5,
    step: 1,
    default: 3,
    effect: '调整实验输入强度并观察证据变化',
  },
  {
    id: 'defenseEnabled',
    label: '启用防护',
    type: 'toggle',
    default: false,
    onLabel: '已启用',
    offLabel: '未启用',
    effect: '切换防护状态并比较前后结果',
  },
];

const DEFAULT_EVIDENCE_CHANNELS: NonNullable<SimulationScenario['evidenceChannels']> = [
  { id: 'input', label: '输入 / 操作' },
  { id: 'system', label: '系统状态' },
  { id: 'result', label: '可观察结果' },
];
const RESERVED_SIMULATION_IDS = new Set(['__proto__', 'prototype', 'constructor']);

function parseSimulationControls(value: unknown): NonNullable<SimulationScenario['controls']> {
  if (!Array.isArray(value)) return structuredClone(DEFAULT_SIMULATION_CONTROLS);
  const controls: NonNullable<SimulationScenario['controls']> = [];
  const ids = new Set<string>();
  for (const candidate of value.slice(0, 4)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const control = candidate as Record<string, unknown>;
    const id = typeof control.id === 'string' ? control.id.trim() : '';
    const label = typeof control.label === 'string' ? control.label.trim() : '';
    const type = control.type === 'toggle' ? 'toggle' : control.type === 'range' ? 'range' : null;
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(id) ||
      !label ||
      !type ||
      ids.has(id) ||
      RESERVED_SIMULATION_IDS.has(id)
    )
      continue;
    ids.add(id);
    if (type === 'toggle') {
      controls.push({
        id,
        label,
        type,
        default: typeof control.default === 'boolean' ? control.default : false,
        onLabel: typeof control.onLabel === 'string' ? control.onLabel.trim() : undefined,
        offLabel: typeof control.offLabel === 'string' ? control.offLabel.trim() : undefined,
        effect: typeof control.effect === 'string' ? control.effect.trim() : undefined,
      });
      continue;
    }
    const min = Number.isFinite(Number(control.min)) ? Number(control.min) : 0;
    const maxCandidate = Number.isFinite(Number(control.max)) ? Number(control.max) : min + 10;
    const max = maxCandidate > min ? maxCandidate : min + 10;
    const stepCandidate = Number.isFinite(Number(control.step)) ? Number(control.step) : 1;
    const step = stepCandidate > 0 ? stepCandidate : 1;
    const defaultCandidate = Number.isFinite(Number(control.default))
      ? Number(control.default)
      : min;
    controls.push({
      id,
      label,
      type,
      min,
      max,
      step,
      default: Math.max(min, Math.min(max, defaultCandidate)),
      effect: typeof control.effect === 'string' ? control.effect.trim() : undefined,
    });
  }
  return controls.length >= 2 ? controls : structuredClone(DEFAULT_SIMULATION_CONTROLS);
}

function parseEvidenceChannels(
  value: unknown,
): NonNullable<SimulationScenario['evidenceChannels']> {
  if (!Array.isArray(value)) return structuredClone(DEFAULT_EVIDENCE_CHANNELS);
  const channels: NonNullable<SimulationScenario['evidenceChannels']> = [];
  const ids = new Set<string>();
  for (const candidate of value.slice(0, 5)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const channel = candidate as Record<string, unknown>;
    const id = typeof channel.id === 'string' ? channel.id.trim() : '';
    const label = typeof channel.label === 'string' ? channel.label.trim() : '';
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(id) ||
      !label ||
      ids.has(id) ||
      RESERVED_SIMULATION_IDS.has(id)
    )
      continue;
    ids.add(id);
    channels.push({ id, label });
  }
  return channels.length >= 3 ? channels : structuredClone(DEFAULT_EVIDENCE_CHANNELS);
}

function parseSimulationControlSet(
  value: unknown,
  controlsById: Map<string, NonNullable<SimulationScenario['controls']>[number]>,
): Record<string, number | boolean> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const normalized: Record<string, number | boolean> = {};
  for (const [controlId, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const control = controlsById.get(controlId);
    if (!control) continue;
    if (control.type === 'toggle') {
      if (typeof rawValue === 'boolean') normalized[controlId] = rawValue;
      continue;
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) continue;
    normalized[controlId] = Math.max(control.min ?? 0, Math.min(control.max ?? 10, numeric));
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function parseScenarioConfig(raw: string): SimulationScenario | null {
  const parsed = parseJsonResponse<unknown>(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  try {
    const obj = parsed as Partial<SimulationScenario>;
    if (!Array.isArray(obj.scenes) || obj.scenes.length === 0) return null;
    const controls = parseSimulationControls(obj.controls);
    const controlsById = new Map(controls.map((control) => [control.id, control]));
    const evidenceChannels = parseEvidenceChannels(obj.evidenceChannels);
    const evidenceIds = new Set(evidenceChannels.map((channel) => channel.id));
    const scenes: SimulationScenario['scenes'] = [];
    const ids = new Set<string>();
    const sourceIdMap = new Map<string, string>();
    for (const [index, candidate] of (obj.scenes as unknown[]).slice(0, 12).entries()) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const scene = candidate as Record<string, unknown>;
      const sourceId = typeof scene.id === 'string' ? scene.id.trim() : '';
      let id =
        /^[a-zA-Z0-9_-]{1,64}$/.test(sourceId) &&
        !ids.has(sourceId) &&
        !RESERVED_SIMULATION_IDS.has(sourceId)
          ? sourceId
          : `s${index + 1}`;
      let collision = 2;
      while (ids.has(id) || RESERVED_SIMULATION_IDS.has(id)) {
        id = `s${index + 1}-${collision}`;
        collision += 1;
      }
      if (sourceId && !sourceIdMap.has(sourceId)) sourceIdMap.set(sourceId, id);
      ids.add(id);
      const title =
        typeof scene.title === 'string' && scene.title.trim()
          ? scene.title.trim()
          : `场景 ${index + 1}`;
      const narrative =
        typeof scene.narrative === 'string' && scene.narrative.trim()
          ? scene.narrative.trim()
          : `观察“${title}”中的输入、系统状态与结果变化。`;
      const rawEvidence =
        scene.evidence && typeof scene.evidence === 'object' && !Array.isArray(scene.evidence)
          ? (scene.evidence as Record<string, unknown>)
          : {};
      const evidence = Object.fromEntries(
        Object.entries(rawEvidence)
          .filter(([key, item]) => evidenceIds.has(key) && typeof item === 'string' && item.trim())
          .map(([key, item]) => [key, String(item).trim()]),
      );
      const fallbacks = [
        narrative,
        typeof scene.expectedObservation === 'string'
          ? scene.expectedObservation.trim()
          : typeof scene.stateLabel === 'string'
            ? scene.stateLabel.trim()
            : narrative,
        typeof scene.insight === 'string'
          ? scene.insight.trim()
          : typeof scene.expectedObservation === 'string'
            ? scene.expectedObservation.trim()
            : narrative,
      ];
      evidenceChannels.forEach((channel, index) => {
        if (!Object.prototype.hasOwnProperty.call(evidence, channel.id) || !evidence[channel.id]) {
          evidence[channel.id] = fallbacks[index % fallbacks.length]!;
        }
      });
      scenes.push({
        id,
        title,
        narrative,
        stateLabel: typeof scene.stateLabel === 'string' ? scene.stateLabel.trim() : undefined,
        expectedObservation:
          typeof scene.expectedObservation === 'string'
            ? scene.expectedObservation.trim()
            : undefined,
        facilitatorCue:
          typeof scene.facilitatorCue === 'string' ? scene.facilitatorCue.trim() : undefined,
        evidence,
        visual:
          scene.visual && typeof scene.visual === 'object' && !Array.isArray(scene.visual)
            ? (scene.visual as Record<string, unknown>)
            : undefined,
        choices: Array.isArray(scene.choices)
          ? scene.choices
              .filter(
                (choice): choice is Record<string, unknown> =>
                  Boolean(choice) && typeof choice === 'object' && !Array.isArray(choice),
              )
              .map((choice) => ({
                label: typeof choice.label === 'string' ? choice.label.trim() : '',
                goto: typeof choice.goto === 'string' ? choice.goto.trim() : '',
                effect: typeof choice.effect === 'string' ? choice.effect.trim() : undefined,
                set: parseSimulationControlSet(choice.set, controlsById),
              }))
              .filter((choice) => Boolean(choice.label && choice.goto))
          : undefined,
        insight: typeof scene.insight === 'string' ? scene.insight.trim() : undefined,
      });
    }
    for (const scene of scenes) {
      if (scene.choices) {
        scene.choices = scene.choices
          .map((choice) => ({
            ...choice,
            goto: sourceIdMap.get(choice.goto) || choice.goto,
          }))
          .filter((choice) => ids.has(choice.goto));
      }
    }
    if (scenes.length === 0) return null;
    const requestedStart = typeof obj.startScene === 'string' ? obj.startScene.trim() : '';
    const normalizedStart = sourceIdMap.get(requestedStart) || requestedStart;
    const startScene = ids.has(normalizedStart) ? normalizedStart : scenes[0]!.id;
    return {
      type: 'simulation-scenario',
      title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Simulation',
      description: typeof obj.description === 'string' ? obj.description.trim() : undefined,
      startScene,
      debrief: typeof obj.debrief === 'string' ? obj.debrief.trim() : undefined,
      comparisonSummary:
        typeof obj.comparisonSummary === 'string' ? obj.comparisonSummary.trim() : undefined,
      controls,
      evidenceChannels,
      scenes,
    };
  } catch {
    return null;
  }
}

/**
 * Compile an already-planned simulation section into a complete state machine.
 * Candidate planning remains model-driven; this compiler makes materialization
 * deterministic, fast, and independent of another fragile model-formatting pass.
 */
export function buildSimulationScenarioFromOutline(outline: SceneOutline): SimulationScenario {
  const concept = String(outline.widgetOutline?.concept || outline.title || '安全机制')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const sourceText = [
    outline.title,
    outline.description,
    ...(outline.keyPoints || []),
    outline.widgetOutline?.concept,
  ]
    .filter(Boolean)
    .join(' ');
  const sqlFocused = /SQL|注入|数据库|查询|参数化|prepared\s*statement/i.test(sourceText);
  const attackFocused = sqlFocused || /攻击|漏洞|绕过|恶意|载荷|payload|攻防/i.test(sourceText);
  const rawDescription = String(outline.description || '')
    .replace(/\s+/g, ' ')
    .trim();
  const internalPlanningText =
    /教师修改要求|必须逐项落实|修订必须同时|当前模拟配置|交付要求|"scenario"\s*:|widget-config/i.test(
      rawDescription,
    );
  const description =
    !rawDescription || internalPlanningText || rawDescription.length > 420
      ? sqlFocused
        ? `围绕“${concept}”开展受控 SQL 注入攻防对照：调整攻击强度并切换参数化查询防御，同步观察请求、最终查询、审计日志与结果，形成可重置、可复验的因果结论。`
        : `围绕“${concept}”开展受控交互演示：调整输入强度并切换防护，同步观察输入、系统状态、日志与结果，形成可重置、可复验的因果结论。`
      : rawDescription.slice(0, 420);
  const intensityId = attackFocused ? 'attackIntensity' : 'inputIntensity';
  const defenseId = sqlFocused ? 'parameterizedQuery' : 'defenseEnabled';
  const intensityLabel = attackFocused ? '攻击强度' : '输入强度';
  const defenseLabel = sqlFocused ? '参数化查询防御' : '启用防护';
  const channels = sqlFocused
    ? [
        { id: 'request', label: '请求' },
        { id: 'query', label: '查询' },
        { id: 'log', label: '日志' },
        { id: 'result', label: '结果' },
      ]
    : [
        { id: 'input', label: '输入 / 操作' },
        { id: 'system', label: '系统状态' },
        { id: 'log', label: '日志 / 遥测' },
        { id: 'result', label: '可观察结果' },
      ];
  const evidence = (vulnerable: boolean, result: string): Record<string, string> =>
    sqlFocused
      ? {
          request: `${vulnerable ? '原始' : '受控'}请求；${intensityLabel}={{${intensityId}}}`,
          query: vulnerable
            ? '输入进入字符串拼接路径，查询结构可能被改变'
            : `输入作为数据参数绑定；${defenseLabel}={{${defenseId}}}`,
          log: vulnerable
            ? 'warning: 检测到异常查询结构与返回规模变化'
            : 'control: 参数绑定生效，查询结构保持稳定',
          result,
        }
      : {
          input: `${intensityLabel}={{${intensityId}}}`,
          system: `${defenseLabel}={{${defenseId}}}`,
          log: vulnerable ? 'warning: 输入到达敏感处理阶段' : 'control: 输入已被约束并记录',
          result,
        };
  return {
    type: 'simulation-scenario',
    title: String(outline.title || concept || '交互模拟'),
    description,
    startScene: 'baseline',
    controls: [
      {
        id: intensityId,
        label: intensityLabel,
        type: 'range',
        min: 1,
        max: 5,
        step: 1,
        default: 3,
        effect: '调整输入强度并比较请求、日志和结果',
      },
      {
        id: defenseId,
        label: defenseLabel,
        type: 'toggle',
        default: false,
        onLabel: '已启用',
        offLabel: '未启用',
        effect: '切换防护并观察系统响应差异',
      },
    ],
    evidenceChannels: channels,
    comparisonSummary: `对照${intensityLabel} {{${intensityId}}} 下${defenseLabel}关闭与开启时的处理、日志和结果，依据证据解释因果差异。`,
    debrief: `复盘${concept}：不要只记住操作顺序，应根据输入、系统状态、日志和结果形成可验证结论，并思考如何迁移到新的隔离场景。`,
    scenes: [
      {
        id: 'baseline',
        title: '建立基线',
        stateLabel: '等待选择',
        narrative: `先观察${concept}的初始输入、系统状态和结果，再选择从脆弱路径或防护路径开始。`,
        expectedObservation: '初始证据尚不能说明防护是否有效，需要做受控对照。',
        facilitatorCue: '请先预测两条路径最可能出现的日志和结果差异。',
        evidence: evidence(false, '等待受控操作'),
        visual: {
          kind: 'flow',
          caption: '证据链',
          steps: ['输入', '处理', '日志', '结果', '结论'],
        },
        choices: [
          {
            label: '先观察脆弱路径',
            goto: 'vulnerable',
            effect: `关闭${defenseLabel}并施加输入`,
            set: { [defenseId]: false },
          },
          {
            label: '先观察防护路径',
            goto: 'protected',
            effect: `启用${defenseLabel}后施加同等输入`,
            set: { [defenseId]: true },
          },
        ],
        insight: '可信结论来自同一输入下的受控对照。',
      },
      {
        id: 'vulnerable',
        title: '观察脆弱状态',
        stateLabel: '防护关闭',
        narrative: '保持防护关闭，施加当前输入并记录系统如何处理。',
        expectedObservation: '日志与结果会显示未受保护路径的直接影响。',
        facilitatorCue: '哪些证据能区分真正的机制影响与偶然波动？',
        evidence: evidence(true, `风险随${intensityLabel}增加而放大`),
        visual: {
          kind: 'bars',
          caption: '相对风险',
          items: [{ label: '未防护路径', value: 0.86, color: '#ef4444' }],
        },
        choices: [{ label: '进入同条件对照', goto: 'compare', effect: '固定输入并准备启用防护' }],
        insight: '先记录未防护证据，才能判断后续变化是否由防护引起。',
      },
      {
        id: 'protected',
        title: '观察防护状态',
        stateLabel: '防护开启',
        narrative: '启用防护并保持相同输入条件，观察处理链和证据变化。',
        expectedObservation: '危险输入被约束，日志和最终结果与脆弱路径不同。',
        facilitatorCue: '防护改变了哪一个因果环节？证据是否足以支持？',
        evidence: evidence(false, '敏感处理阶段未接收原始危险输入'),
        visual: {
          kind: 'icons',
          caption: '防护结果',
          items: [
            { icon: '🛡️', label: '输入受控', tone: 'ok' },
            { icon: '📋', label: '事件可审计', tone: 'info' },
          ],
        },
        choices: [{ label: '进入同条件对照', goto: 'compare', effect: '固定输入并比较两种状态' }],
        insight: '有效防护应同时改变处理行为和可观察证据。',
      },
      {
        id: 'compare',
        title: '比较证据',
        stateLabel: '形成结论',
        narrative: '固定输入强度，切换防护状态并比较请求、日志和结果。',
        expectedObservation: '只有防护状态变化时，证据链呈现一致的因果差异。',
        facilitatorCue: '请用“输入—处理—证据—结论”四步说明因果关系。',
        evidence: evidence(false, '可根据一致差异判断防护效果'),
        visual: {
          kind: 'cells',
          caption: '对照矩阵',
          rows: [
            { label: '防护关闭', cells: ['原始输入', '⚠ 风险信号', '异常结果'] },
            { label: '防护开启', cells: ['受控输入', '✓ 审计信号', '稳定结果'] },
          ],
        },
        insight: '结论必须能被多条相互一致的证据支持。',
      },
      {
        id: 'debrief',
        title: '验证与复盘',
        stateLabel: '演示完成',
        narrative: `回顾${concept}的关键状态变化，确认重置后可重复得到同样的对照证据。`,
        expectedObservation: '重置会恢复默认控件、初始场景与空事件记录。',
        facilitatorCue: '如果换一种输入或系统，哪条证据仍然适用？',
        evidence: evidence(false, '形成可迁移、可复验的结论'),
        visual: { kind: 'metric', caption: '证据完整度', value: '4 / 4', unit: '通道' },
        insight: '模拟演示的目标是用可重放证据理解机制，而不是记忆一个答案。',
      },
    ],
  };
}

export function renderScenarioHtml(cfg: SimulationScenario): string {
  const runtimeConfig: SimulationScenario = {
    ...cfg,
    controls: parseSimulationControls(cfg.controls),
    evidenceChannels: parseEvidenceChannels(cfg.evidenceChannels),
  };
  const configJson = JSON.stringify(runtimeConfig).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(runtimeConfig.title)}</title>
<style>
  :root{color-scheme:dark;--bg:#0f172a;--panel:#111c31;--soft:#1e293b;--line:#334155;--text:#e2e8f0;--muted:#94a3b8;--accent:#3b82f6;--accent-soft:#172554;}
  *{box-sizing:border-box;} html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,"PingFang SC",sans-serif;}
  button{font:inherit;} .wrap{padding:18px;max-width:1080px;margin:0 auto;}
  .topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;}
  h2{font-size:18px;margin:0 0 4px;} p.desc{font-size:12px;line-height:1.55;color:var(--muted);margin:0;max-width:720px;}
  .reset{min-height:44px;white-space:nowrap;background:transparent;color:#bfdbfe;border:1px solid var(--line);border-radius:9px;padding:8px 12px;cursor:pointer;}
  .reset:hover,.reset:focus-visible{border-color:#60a5fa;outline:none;background:var(--accent-soft);}
  .progress{display:flex;gap:6px;margin-bottom:14px;}
  .dot{height:6px;flex:1;background:var(--line);border-radius:3px;} .dot.on{background:var(--accent);} .dot.current{box-shadow:0 0 0 2px rgba(96,165,250,.28);}
  .stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,300px);gap:14px;align-items:start;}
  #scene,.activity{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;}
  .sidebar{display:grid;gap:12px;}.activity h3{font-size:13px;margin:0 0 8px;color:#cbd5e1;}.activity p{font-size:11px;color:var(--muted);margin:0 0 10px;line-height:1.45;}
  .control-list{display:grid;gap:12px;}.control{display:grid;gap:6px;padding-bottom:10px;border-bottom:1px solid rgba(71,85,105,.55);}.control:last-child{padding-bottom:0;border-bottom:0;}
  .control-head{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12px;color:#cbd5e1;}.control-value{color:#7dd3fc;font-family:ui-monospace,monospace;}
  .control input[type=range]{width:100%;accent-color:var(--accent);}.toggle-row{display:flex;gap:8px;align-items:center;min-height:32px;}.toggle-row input{width:18px;height:18px;accent-color:var(--accent);}.toggle-state{font-size:11px;color:#bfdbfe;}
  .evidence-grid{display:grid;gap:8px;margin:0;}.evidence-item{background:var(--soft);border-left:3px solid #22d3ee;border-radius:0 8px 8px 0;padding:8px 10px;}.evidence-item dt{font-size:10px;color:#7dd3fc;margin:0 0 3px;text-transform:uppercase;letter-spacing:.04em;}.evidence-item dd{font-size:11px;line-height:1.5;color:#cbd5e1;margin:0;word-break:break-word;}
  .scene-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;}
  .scene-title{font-size:16px;color:#93c5fd;margin:0;}
  .state{font-size:11px;color:#bfdbfe;background:var(--accent-soft);border-radius:999px;padding:4px 8px;white-space:nowrap;}
  .narr{font-size:13px;line-height:1.65;color:#cbd5e1;margin:0 0 12px;}
  .visual{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;min-height:52px;}
  .vis-cap{font-size:11px;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;}
  /* cells */
  table.cells{border-collapse:collapse;width:100%;} table.cells td,table.cells th{border:1px solid var(--line);padding:6px 8px;text-align:center;font-size:13px;font-family:ui-monospace,monospace;}
  table.cells th{color:var(--muted);font-weight:600;background:var(--bg);}
  td.ok{color:#4ade80;} td.bad{color:#f87171;} td.info{color:#fbbf24;}
  /* bars */
  .bar-row{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;}
  .bar-label{width:120px;color:#cbd5e1;} .bar-track{flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden;}
  .bar-fill{display:block;height:100%;background:var(--accent);border-radius:7px;} .bar-val{width:40px;color:#93c5fd;font-family:ui-monospace,monospace;}
  /* flow */
  .flow{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:12px;}
  .flow span{background:var(--line);padding:4px 10px;border-radius:6px;} .flow .arr{background:transparent;color:#64748b;}
  /* icons */
  .icons{display:flex;flex-wrap:wrap;gap:10px;} .icon-item{background:var(--line);border-radius:8px;padding:8px 12px;text-align:center;font-size:12px;}
  .icon-item .e{font-size:22px;display:block;} .icon-item.ok{border:1px solid #4ade80;} .icon-item.bad{border:1px solid #f87171;} .icon-item.warn{border:1px solid #fbbf24;}
  /* metric */
  .metric{text-align:center;padding:8px;} .metric b{display:block;font-size:34px;color:#fbbf24;font-family:ui-monospace,monospace;} .metric small{color:#94a3b8;font-size:12px;}
  .observation,.insight,.debrief{font-size:12px;line-height:1.55;background:var(--soft);padding:9px 11px;color:#cbd5e1;margin-bottom:10px;}
  .observation{border-left:3px solid #22d3ee;border-radius:0 7px 7px 0;}.insight{border-left:3px solid var(--accent);border-radius:0 7px 7px 0;}.debrief{border:1px solid #475569;border-radius:9px;}
  details.cue{font-size:12px;color:var(--muted);margin:0 0 12px;} details.cue summary{cursor:pointer;color:#c4b5fd;}
  .nav{display:flex;gap:8px;flex-wrap:wrap;}
  button.navbtn{min-height:44px;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;}
  button.navbtn:hover,button.navbtn:focus-visible{filter:brightness(1.12);outline:2px solid #93c5fd;outline-offset:2px;} button.ghost{background:var(--line);color:#cbd5e1;}
  .events{list-style:none;margin:0;padding:0;display:grid;gap:8px;}.events li{position:relative;padding:0 0 8px 16px;border-bottom:1px solid rgba(71,85,105,.55);font-size:11px;line-height:1.45;color:#cbd5e1;}.events li:before{content:'';position:absolute;left:0;top:5px;width:7px;height:7px;border-radius:50%;background:#38bdf8;}.events small{display:block;color:#64748b;margin-top:2px;}.empty{font-size:11px;color:#64748b;}
  @media(max-width:700px){.wrap{padding:12px}.stage{grid-template-columns:1fr}.sidebar{order:2}.topbar{align-items:center}.reset{padding:7px 10px}.bar-label{width:90px}}
</style></head>
<body><div class="wrap">
  <div class="topbar"><div><h2>🎬 ${esc(runtimeConfig.title)}</h2>${runtimeConfig.description ? `<p class="desc">${esc(runtimeConfig.description)}</p>` : ''}</div><button class="reset" id="reset" type="button" aria-label="重新开始模拟演示">↻ 重新开始</button></div>
  <div class="progress" id="progress"></div>
  <div class="stage"><main id="scene" aria-live="polite"></main><aside class="sidebar"><section class="activity" aria-label="模拟演示变量控制"><h3>变量控制</h3><p>改变参数或防护状态，证据会立即同步。</p><div class="control-list" id="controls"></div></section><section class="activity" aria-label="模拟演示证据面板"><h3>证据面板</h3><dl class="evidence-grid" id="evidence"></dl></section><section class="activity" aria-label="模拟演示运行记录"><h3>运行记录</h3><p>记录选择、参数与状态变化，便于课堂复盘。</p><ol class="events" id="events"></ol></section></aside></div>
</div>
<script>
(function(){
  var cfg = ${configJson};
  var byId = Object.create(null); cfg.scenes.forEach(function(s){ byId[s.id] = s; });
  var order = cfg.scenes.map(function(s){return s.id;});
  var initial = byId[cfg.startScene] ? cfg.startScene : order[0];
  var cur = initial;
  var hist = [];
  var events = [];
  var sequence = 0;
  var controls = Object.create(null);
  (cfg.controls||[]).forEach(function(control){controls[control.id]=control.default;});
  function toneClass(t){ return t==='ok'?'ok':t==='bad'?'bad':t==='warn'?'warn':t==='info'?'info':''; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function notify(action, detail){
    if(window.parent===window) return;
    window.parent.postMessage({type:'aisecedu:simulation',action:action,sceneId:cur,detail:detail||null},'*');
  }
  function record(label, fromId, toId){
    sequence += 1;
    events.push({label:label||'继续',from:fromId||'',to:toId||cur,seq:sequence});
    if(events.length>8) events.shift();
    renderEvents();
  }
  function renderEvents(){
    var root=document.getElementById('events');
    if(!events.length){root.innerHTML='<li class="empty">从第一个场景开始，选择会显示在这里。</li>';return;}
    root.innerHTML=events.slice().reverse().map(function(ev){var target=byId[ev.to];return '<li>'+esc(ev.label)+'<small>#'+ev.seq+' · '+esc(target?target.title:ev.to)+'</small></li>';}).join('');
  }
  function controlText(control){
    var value=controls[control.id];
    if(control.type==='toggle') return value?(control.onLabel||'已启用'):(control.offLabel||'未启用');
    return String(value);
  }
  function interpolate(value){
    return String(value==null?'':value).replace(/\{\{([a-zA-Z][a-zA-Z0-9_-]*)\}\}/g,function(_,id){
      var control=(cfg.controls||[]).filter(function(item){return item.id===id;})[0];
      return control?controlText(control):'';
    });
  }
  function renderEvidence(scene){
    var channels=cfg.evidenceChannels||[];
    var evidence=scene&&scene.evidence?scene.evidence:{};
    document.getElementById('evidence').innerHTML=channels.map(function(channel){
      var fallback=scene?(scene.expectedObservation||scene.insight||scene.narrative):'';
      return '<div class="evidence-item"><dt>'+esc(channel.label)+'</dt><dd>'+esc(interpolate(evidence[channel.id]||fallback))+'</dd></div>';
    }).join('');
  }
  function renderControls(){
    var root=document.getElementById('controls');
    root.innerHTML=(cfg.controls||[]).map(function(control){
      var value=controls[control.id];
      if(control.type==='toggle') return '<label class="control"><span class="control-head"><span>'+esc(control.label)+'</span><span class="control-value" data-control-value="'+esc(control.id)+'">'+esc(controlText(control))+'</span></span><span class="toggle-row"><input type="checkbox" data-control="'+esc(control.id)+'" '+(value?'checked':'')+' aria-label="'+esc(control.label)+'"><span class="toggle-state">切换后比较证据</span></span></label>';
      return '<label class="control"><span class="control-head"><span>'+esc(control.label)+'</span><output class="control-value" data-control-value="'+esc(control.id)+'">'+esc(value)+'</output></span><input type="range" data-control="'+esc(control.id)+'" min="'+esc(control.min)+'" max="'+esc(control.max)+'" step="'+esc(control.step)+'" value="'+esc(value)+'" aria-label="'+esc(control.label)+'"></label>';
    }).join('');
    Array.prototype.forEach.call(root.querySelectorAll('[data-control]'),function(input){
      input.oninput=function(){
        var id=input.getAttribute('data-control');var control=(cfg.controls||[]).filter(function(item){return item.id===id;})[0];if(!control)return;
        controls[id]=control.type==='toggle'?Boolean(input.checked):Number(input.value);
        var valueNode=root.querySelector('[data-control-value="'+id+'"]');if(valueNode)valueNode.textContent=controlText(control);
        renderEvidence(byId[cur]);
        notify('control',{controlId:id,value:controls[id],controls:controls});
      };
      input.onchange=function(){var id=input.getAttribute('data-control');var control=(cfg.controls||[]).filter(function(item){return item.id===id;})[0];if(control)record(control.effect||('调整'+control.label),'',cur);};
    });
  }
  function renderVisual(v){
    if(!v || typeof v!=='object') return '';
    var k = v.kind, cap = v.caption ? '<div class="vis-cap">'+esc(v.caption)+'</div>' : '';
    if(k==='cells' && Array.isArray(v.rows)){
      var rows = v.rows.map(function(r){
        var cells = (r.cells||[]).map(function(c){ var m=String(c); var cls = m==='✓'?'ok':m==='✗'?'bad':(m.indexOf('⚠')>-1?'info':'') ; return '<td class="'+cls+'">'+esc(c)+'</td>'; }).join('');
        return '<tr><th>'+esc(r.label)+'</th>'+cells+'</tr>';
      }).join('');
      return cap+'<table class="cells">'+rows+'</table>';
    }
    if(k==='bars' && Array.isArray(v.items)){
      var bars = v.items.map(function(it){ var val = Math.max(0,Math.min(1,Number(it.value||0))); return '<div class="bar-row"><span class="bar-label">'+esc(it.label)+'</span><span class="bar-track"><span class="bar-fill" style="width:'+Math.round(val*100)+'%;background:'+(it.color||'#3b82f6')+'"></span></span><span class="bar-val">'+(Math.round(val*100))+'%</span></div>'; }).join('');
      return cap+'<div>'+bars+'</div>';
    }
    if(k==='flow' && Array.isArray(v.steps)){
      var f = v.steps.map(function(s,i){ return '<span>'+esc(s)+'</span>'+(i<v.steps.length-1?'<span class="arr">→</span>':''); }).join('');
      return cap+'<div class="flow">'+f+'</div>';
    }
    if(k==='icons' && Array.isArray(v.items)){
      var ic = v.items.map(function(it){ return '<div class="icon-item '+toneClass(it.tone)+'"><span class="e">'+esc(it.icon)+'</span>'+esc(it.label)+'</div>'; }).join('');
      return cap+'<div class="icons">'+ic+'</div>';
    }
    if(k==='metric'){
      return cap+'<div class="metric"><b>'+esc(v.value)+'</b>'+(v.unit?'<small>'+esc(v.unit)+'</small>':'')+'</div>';
    }
    return cap+'<div style="font-size:13px;color:#94a3b8;">'+esc(JSON.stringify(v))+'</div>';
  }
  function applyControlSet(values){
    if(!values||typeof values!=='object')return;
    (cfg.controls||[]).forEach(function(control){
      if(!Object.prototype.hasOwnProperty.call(values,control.id))return;
      controls[control.id]=control.type==='toggle'?Boolean(values[control.id]):Math.max(control.min,Math.min(control.max,Number(values[control.id])));
    });
    renderControls();
  }
  function go(nextId,label,setValues){
    if(!byId[nextId]) return;
    var previous=cur;
    hist.push(cur);
    cur=nextId;
    applyControlSet(setValues);
    record(label,previous,nextId);
    render();
  }
  function back(){
    if(!hist.length) return;
    var previous=cur;
    cur=hist.pop();
    record('返回上一步',previous,cur);
    render();
  }
  function reset(){
    cur=initial;hist=[];events=[];sequence=0;controls=Object.create(null);(cfg.controls||[]).forEach(function(control){controls[control.id]=control.default;});
    renderControls();
    record('重新开始','',cur);
    render();
    notify('reset');
  }
  function render(){
    var s = byId[cur]; if(!s){ document.getElementById('scene').textContent='场景缺失'; return; }
    var idx = order.indexOf(cur);
    document.getElementById('progress').innerHTML = order.map(function(id,i){ return '<div class="dot'+(i<=idx?' on':'')+(i===idx?' current':'')+'" title="'+esc(byId[id].title)+'"></div>'; }).join('');
    var choices = (s.choices && s.choices.length) ? s.choices.map(function(c,i){ return '<button class="navbtn" type="button" data-choice="'+i+'">'+esc(c.label)+'</button>'; }).join('') : '';
    var nextLinear = (!choices && idx < order.length-1);
    var terminal = !choices && !nextLinear;
    var html = '<div class="scene-meta"><p class="scene-title">'+esc(s.title)+'</p><span class="state">'+esc(s.stateLabel||('场景 '+(idx+1)+' / '+order.length))+'</span></div>'
      + '<p class="narr">'+esc(s.narrative)+'</p>'
      + (s.visual?'<div class="visual">'+renderVisual(s.visual)+'</div>':'')
      + (s.expectedObservation?'<div class="observation"><strong>观察：</strong>'+esc(s.expectedObservation)+'</div>':'')
      + (s.insight?'<div class="insight">💡 '+esc(s.insight)+'</div>':'')
      + (s.facilitatorCue?'<details class="cue"><summary>教师引导</summary><p>'+esc(s.facilitatorCue)+'</p></details>':'')
      + (terminal&&cfg.comparisonSummary?'<div class="debrief"><strong>对照结论：</strong>'+esc(interpolate(cfg.comparisonSummary))+'</div>':'')
      + (terminal&&cfg.debrief?'<div class="debrief"><strong>复盘：</strong>'+esc(interpolate(cfg.debrief))+'</div>':'')
      + '<div class="nav">'
      + (hist.length?'<button class="navbtn ghost" id="back">← 上一步</button>':'')
      + choices
      + (nextLinear?'<button class="navbtn" id="next">下一步 →</button>':'')
      + '</div>';
    document.getElementById('scene').innerHTML = html;
    renderEvidence(s);
    if(document.getElementById('back')) document.getElementById('back').onclick=back;
    if(document.getElementById('next')) document.getElementById('next').onclick=function(){go(order[idx+1],'下一步');};
    Array.prototype.forEach.call(document.querySelectorAll('[data-choice]'),function(button){button.onclick=function(){var choice=s.choices[Number(button.getAttribute('data-choice'))];if(choice)go(choice.goto,choice.effect||choice.label,choice.set);};});
    notify('state',{index:idx,total:order.length,title:s.title,terminal:terminal,controls:controls});
  }
  document.getElementById('reset').onclick=reset;
  window.addEventListener('keydown',function(event){if(event.target&&/input|textarea|select/i.test(event.target.tagName))return;if(event.key==='ArrowLeft'){back();}else if(event.key==='ArrowRight'){var i=order.indexOf(cur);var s=byId[cur];if((!s.choices||!s.choices.length)&&i<order.length-1)go(order[i+1],'下一步');}else if(event.key.toLowerCase()==='r'){reset();}});
  window.addEventListener('message',function(event){if(event.source!==window.parent||!event.data)return;if(event.data.type==='RESET_WIDGET')reset();if(event.data.type==='SET_WIDGET_STATE'&&byId[event.data.sceneId]){if(event.data.controls&&typeof event.data.controls==='object'){(cfg.controls||[]).forEach(function(control){if(Object.prototype.hasOwnProperty.call(event.data.controls,control.id))controls[control.id]=control.type==='toggle'?Boolean(event.data.controls[control.id]):Math.max(control.min,Math.min(control.max,Number(event.data.controls[control.id])));});renderControls();}cur=event.data.sceneId;render();}});
  renderControls();
  renderEvents();
  record('开始模拟','',cur);
  render();
})();
</script>
<script type="application/json" id="widget-config">${configJson}</script>
</body></html>`;
}

export async function generateSimulationViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const prompts = buildPrompt(PROMPT_IDS.SIMULATION_SCENARIO, {
    conceptName: outline.widgetOutline?.concept || outline.title,
    description: outline.description || '',
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  if (!prompts) return null;
  let raw = await aiCall(prompts.system, prompts.user);
  let parsedConfig = parseScenarioConfig(raw);
  if (!parsedConfig) {
    log.warn(`simulation-scenario validation failed; requesting a clean retry: ${outline.title}`);
    raw = await aiCall(
      `${prompts.system}\n\nThe previous response failed structural validation. Generate a fresh JSON object from scratch. Recheck that every scene id is unique ASCII, every choice.goto references an existing scene, the document contains 5–8 scenes, and no prose appears outside the JSON object.`,
      `${prompts.user}\n\nRegenerate the complete simulation now. Do not reuse a broken id or branch from the previous attempt.`,
    );
    parsedConfig = parseScenarioConfig(raw);
  }
  const cfg = parsedConfig || buildSimulationScenarioFromOutline(outline);
  if (!parsedConfig) {
    log.warn(`simulation-scenario normalized fallback used for: ${outline.title}`);
  }
  return {
    html: renderScenarioHtml(cfg),
    widgetType: 'simulation',
    widgetConfig: cfg as unknown as WidgetConfig,
  };
}

// ==================== Game Widget (quiz) ====================

export interface GameConfig {
  type: 'game';
  gameType: string;
  title: string;
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
  }>;
}

function parseGameConfig(raw: string): GameConfig | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<GameConfig>;
    if (!Array.isArray(obj.questions) || obj.questions.length === 0) return null;
    return {
      type: 'game',
      gameType: obj.gameType || 'quiz',
      title: obj.title || 'Quiz',
      questions: obj.questions,
    };
  } catch {
    return null;
  }
}

export function renderGameHtml(cfg: GameConfig): string {
  const configJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(cfg.title)}</title>
<style>
  html,body{margin:0;padding:0;background:#fef3c7;color:#1f2937;font-family:ui-sans-serif,system-ui,"PingFang SC",sans-serif;}
  .wrap{padding:14px;display:flex;flex-direction:column;gap:10px;}
  h2{font-size:16px;margin:0;} .q{font-size:14px;font-weight:600;margin:6px 0;}
  button.opt{display:block;width:100%;text-align:left;background:#fff;border:1px solid #fde68a;border-radius:8px;padding:9px 12px;font-size:13px;margin:5px 0;cursor:pointer;}
  button.opt:hover{background:#fffbeb;} button.opt.ok{background:#dcfce7;border-color:#86efac;} button.opt.bad{background:#fee2e2;border-color:#fca5a5;}
  .exp{font-size:12px;color:#64748b;background:#fff;border-radius:6px;padding:6px 8px;display:none;}
  .score{font-size:13px;font-weight:600;color:#92400e;}
</style></head>
<body><div class="wrap">
  <h2>🎯 ${esc(cfg.title)}</h2>
  <div id="board"></div>
  <p class="score" id="score"></p>
</div>
<script>
(function(){
  var cfg = ${configJson};
  var i = 0, score = 0;
  var board = document.getElementById('board');
  function render(){
    if (i >= cfg.questions.length){ board.innerHTML = '<p>完成！</p>'; document.getElementById('score').textContent = '得分: ' + score + '/' + cfg.questions.length; return; }
    var q = cfg.questions[i];
    var html = '<div class="q">' + (i+1) + '. ' + q.question + '</div>';
    q.options.forEach(function(o, idx){ html += '<button class="opt" data-idx="'+idx+'">'+o+'</button>'; });
    html += '<div class="exp" id="exp">'+(q.explanation||'')+'</div>';
    board.innerHTML = html;
    board.querySelectorAll('button.opt').forEach(function(b){
      b.addEventListener('click', function(){
        var chosen = parseInt(b.getAttribute('data-idx'));
        var correct = q.correctIndex;
        board.querySelectorAll('button.opt').forEach(function(bb, idx){ bb.disabled = true; if(idx===correct) bb.className='opt ok'; else if(idx===chosen) bb.className='opt bad'; });
        if(chosen===correct) score++;
        document.getElementById('exp').style.display='block';
        setTimeout(function(){ i++; render(); }, 1400);
      });
    });
  }
  render();
})();
</script>
<script type="application/json" id="widget-config">${configJson}</script>
</body></html>`;
}

export async function generateGameViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const prompts = buildPrompt(PROMPT_IDS.GAME_CONFIG, {
    title: outline.title,
    gameType: outline.widgetOutline?.gameType || 'quiz',
    description: outline.description || '',
    keyPoints: (outline.keyPoints || []).join('；'),
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  if (!prompts) return null;
  const raw = await aiCall(prompts.system, prompts.user);
  const cfg = parseGameConfig(raw);
  if (!cfg) {
    log.error(`game-config parse failed for: ${outline.title}`);
    return null;
  }
  return {
    html: renderGameHtml(cfg),
    widgetType: 'game',
    widgetConfig: cfg as unknown as WidgetConfig,
  };
}

// ==================== 3D Visualization Widget ====================

export interface Viz3DConfig {
  type: 'visualization3d';
  visualizationType: string;
  title: string;
  description?: string;
  objects: Array<{ name: string; kind?: string; color?: string; description?: string }>;
}

function parseViz3DConfig(raw: string): Viz3DConfig | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<Viz3DConfig>;
    if (!Array.isArray(obj.objects) || obj.objects.length === 0) return null;
    return {
      type: 'visualization3d',
      visualizationType: obj.visualizationType || 'custom',
      title: obj.title || 'Visualization',
      description: obj.description,
      objects: obj.objects,
    };
  } catch {
    return null;
  }
}

export function renderViz3DHtml(cfg: Viz3DConfig): string {
  const configJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const cards = cfg.objects
    .map(
      (o, i) =>
        `<div class="obj" style="background:${o.color || '#3b82f6'};transform:translateY(${(i % 3) * 6}px) rotateX(8deg) rotateY(-10deg);">` +
        `<div class="dot" style="background:${o.color || '#3b82f6'}"></div>` +
        `<b>${esc(o.name)}</b>${o.kind ? `<small>${esc(o.kind)}</small>` : ''}` +
        `${o.description ? `<p>${esc(o.description)}</p>` : ''}</div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(cfg.title)}</title>
<style>
  html,body{margin:0;padding:0;background:linear-gradient(135deg,#0f172a,#1e293b);color:#e2e8f0;font-family:ui-sans-serif,system-ui,"PingFang SC",sans-serif;}
  .wrap{padding:14px;} h2{font-size:16px;margin:0 0 4px;} p.desc{font-size:12px;color:#94a3b8;margin:0 0 12px;}
  .scene{perspective:800px;display:flex;flex-wrap:wrap;gap:12px;}
  .obj{width:150px;background:#3b82f6;border-radius:12px;padding:12px;box-shadow:0 10px 24px rgba(0,0,0,.35);opacity:.92;}
  .obj b{display:block;font-size:13px;} .obj small{display:block;font-size:10px;color:#e0e7ff;text-transform:uppercase;letter-spacing:.5px;margin:2px 0;}
  .obj p{font-size:11px;color:#e2e8f0;margin:6px 0 0;line-height:1.4;}
  .dot{width:14px;height:14px;border-radius:50%;box-shadow:0 0 10px currentColor;margin-bottom:6px;}
</style></head>
<body><div class="wrap">
  <h2>🔬 ${esc(cfg.title)}</h2>
  ${cfg.description ? `<p class="desc">${esc(cfg.description)}</p>` : ''}
  <div class="scene">${cards}</div>
</div>
<script type="application/json" id="widget-config">${configJson}</script>
</body></html>`;
}

export async function generateViz3DViaWorkflow(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: { languageDirective?: string; subjectProfile?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const prompts = buildPrompt(PROMPT_IDS.VISUALIZATION3D_CONFIG, {
    title: outline.title,
    visualizationType: outline.widgetOutline?.visualizationType || 'custom',
    description: outline.description || '',
    objects: (outline.widgetOutline?.objects || []).join(', '),
    languageDirective: options.languageDirective || '',
    subjectProfile: options.subjectProfile ?? false,
  });
  if (!prompts) return null;
  const raw = await aiCall(prompts.system, prompts.user);
  const cfg = parseViz3DConfig(raw);
  if (!cfg) {
    log.error(`visualization3d-config parse failed for: ${outline.title}`);
    return null;
  }
  return {
    html: renderViz3DHtml(cfg),
    widgetType: 'visualization3d',
    widgetConfig: cfg as unknown as WidgetConfig,
  };
}

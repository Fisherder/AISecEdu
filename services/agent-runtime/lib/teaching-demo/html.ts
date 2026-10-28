import { Script } from 'node:vm';
import { Linter } from 'eslint';
import { teachingDemoFoundation } from './design';

const linter = new Linter();
const browserGlobals = Object.fromEntries(
  'window document console navigator performance requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval devicePixelRatio innerWidth innerHeight outerWidth outerHeight self location addEventListener removeEventListener getComputedStyle matchMedia ResizeObserver MutationObserver IntersectionObserver Image ImageData Path2D Event CustomEvent PointerEvent MouseEvent KeyboardEvent HTMLElement HTMLInputElement HTMLSelectElement HTMLOutputElement HTMLCanvasElement SVGElement Node CanvasRenderingContext2D DOMMatrix DOMPoint DOMParser XMLSerializer URL URLSearchParams Blob File FileReader TextEncoder TextDecoder atob btoa screen scrollX scrollY scrollTo scrollBy queueMicrotask getSelection Element Document DocumentFragment HTMLButtonElement CSS structuredClone AbortController AbortSignal'
    .split(' ').map(name => [name, 'readonly']),
);

export class TeachingDemoValidationError extends Error {
  name = 'TeachingDemoValidationError';
  constructor(readonly issues: string[]) { super(issues.join('；')); }
}

export function validateTeachingDemoHtml(raw: string) {
  const start = raw.search(/<!doctype\s+html\b/i);
  const end = raw.toLowerCase().lastIndexOf('</html>');
  if (start < 0 || end < start) throw new TeachingDemoValidationError(['HTML文档被截断或缺失']);
  const html = raw.slice(start, end + 7);
  if (html.length < 2000 || html.length > 250000) throw new TeachingDemoValidationError(['HTML须为2000到250000字符']);
  const issues: string[] = [];
  if (!/<head\b/i.test(html) || !/<body\b/i.test(html) || !/<title\b/i.test(html) || !/name\s*=\s*["']viewport["']/i.test(html)) issues.push('缺少文档标题、主体或viewport');
  if (/<(?:iframe|object|embed|base)\b/i.test(html) || /<(?:script|link)\b[^>]*(?:src|href|action|formaction)\s*=/i.test(html) ||
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|eval|Function)\s*\(/.test(html) ||
      /\b(?:window|globalThis)\s*(?:\.\s*(?:parent|top|opener)|\[\s*["'](?:parent|top|opener)["'])|\b(?:localStorage|sessionStorage|document\s*\.\s*cookie|serviceWorker)\b|\bimport\s*\(|@import\b/i.test(html) ||
      /\b(?:src|href|action|formaction)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)|url\(\s*["']?\s*(?:https?:|\/\/)/i.test(html)) issues.push('存在外部依赖、父页面访问或动态执行接口');
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const role of ['workflow', 'visualization', 'controls', 'experiment', 'quiz', 'summary'])
    if (!new RegExp(`data-demo=["']${role}["']`).test(markup.replace(/\s*=\s*/g, '='))) issues.push(`缺少可见区域${role}`);
  let scripts = 0;
  const scriptBodies: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/application\/json/.test(match[1])) continue;
    scripts++;
    scriptBodies.push(match[2]);
    try { new Script(match[2], {filename: `teaching-demo-script-${scripts}.js`}); }
    catch (error) { issues.push(`脚本${scripts}语法错误：${error instanceof Error ? error.message : error}`); }
  }
  if (!scripts) issues.push('缺少可执行交互脚本');
  else for (const diagnostic of linter.verify(scriptBodies.join('\n;\n'), {
    languageOptions: {ecmaVersion: 2022, sourceType: 'script', globals: browserGlobals as Record<string, 'readonly'>},
    rules: {'no-undef': 'error'},
  }).filter(item => item.severity === 2).slice(0, 8))
    issues.push(`脚本第${diagnostic.line}行标识符检查：${diagnostic.message}`);
  if (issues.length) throw new TeachingDemoValidationError(issues);
  const clean = html.replace(/<style\b[^>]*data-teaching-demo-foundation[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/gi, '');
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  return clean.replace(/<head\b[^>]*>/i, tag => `${tag}${csp}<style data-teaching-demo-foundation="v1">${teachingDemoFoundation}</style>`);
}

export function applyTeachingDemoEdits(html: string, value: unknown) {
  const edits = (value as {edits?: unknown})?.edits;
  if (!Array.isArray(edits) || !edits.length || edits.length > 8) throw new TeachingDemoValidationError(['局部修复必须包含1到8项edits']);
  let next = html;
  for (const edit of edits) {
    if (!edit || typeof edit.before !== 'string' || typeof edit.after !== 'string' || !edit.before ||
        edit.before === edit.after || edit.before.length > 60000 || edit.after.length > 100000 ||
        next.split(edit.before).length !== 2) throw new TeachingDemoValidationError(['修复必须精确匹配唯一现存文本，不能删除或猜测底稿']);
    next = next.replace(edit.before, () => edit.after);
  }
  if (next.length > 250000) throw new TeachingDemoValidationError(['修复后的页面过大']);
  return next;
}

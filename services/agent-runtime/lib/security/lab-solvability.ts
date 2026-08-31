/**
 * Deterministic post-generation audit for browser-based security labs.
 *
 * This is deliberately separate from factual validation (CVE/CVSS/CWE). Its
 * job is to catch a different failure class: the checker knows an answer but
 * the learner has no observable or revealable source from which to obtain it.
 */

export type LabSolvabilityIssueCode =
  | 'NO_INTERACTIVE_CONTROLS'
  | 'NO_COMPLETION_SIGNAL'
  | 'BROKEN_ANSWER_SOURCE'
  | 'UNDECLARED_ANSWER_SOURCE'
  | 'MISSING_HASH_EVIDENCE'
  | 'UNRESOLVED_HASH_ANSWER';

export interface LabSolvabilityIssue {
  code: LabSolvabilityIssueCode;
  severity: 'error' | 'warning';
  message: string;
  field?: string;
  repaired?: boolean;
}

export interface LabSolvabilityReport {
  passed: boolean;
  autoRepaired: boolean;
  issues: LabSolvabilityIssue[];
  repairs: string[];
  stats: {
    interactiveControls: number;
    gradedInputs: number;
    hashInputs: number;
    visibleHashValues: number;
    answerSources: number;
  };
}

export interface LabSolvabilityResult {
  html: string;
  report: LabSolvabilityReport;
}

interface AuditResult {
  passed: boolean;
  issues: LabSolvabilityIssue[];
  stats: LabSolvabilityReport['stats'];
  missingHashCandidates: string[];
}

const HASH_TERM = /(?:hash|哈希|散列|文件指纹|sha\s*-?\s*(?:1|256|512)|md5)/i;
const HASH_VALUE = /(?<![0-9a-f])(?:[0-9a-f]{64}|[0-9a-f]{40}|[0-9a-f]{32})(?![0-9a-f])/gi;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1];
}

function visibleMarkup(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');
}

function visibleText(html: string): string {
  return visibleMarkup(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHashCandidates(html: string): string[] {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
  const candidates: string[] = scripts.match(HASH_VALUE) ?? [];

  // Some generators use a named expectedHash variable with a non-standard
  // sample token. Keep only token-like values to avoid exposing prose.
  for (const match of scripts.matchAll(
    /(?:expected|correct|malware|sample|file)?[_-]?(?:sha_?256|sha_?1|md5|hash)\s*[:=]\s*["'`]([0-9a-z_-]{16,128})["'`]/gi,
  )) {
    if (match[1]) candidates.push(match[1]);
  }

  // If the checker accepts any correctly-shaped digest, provide a deterministic
  // educational sample that necessarily satisfies that shape.
  if (candidates.length === 0 && HASH_TERM.test(scripts)) {
    const length = scripts.match(/\{\s*(32|40|64)\s*\}/)?.[1];
    if (length === '32') candidates.push('d41d8cd98f00b204e9800998ecf8427e');
    if (length === '40') candidates.push('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    if (length === '64') {
      candidates.push('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    }
  }
  return unique(candidates.map((value) => value.toLowerCase()));
}

function findHashInputs(html: string): Array<{ id: string; tag: string }> {
  const inputs: Array<{ id: string; tag: string }> = [];
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if (/\btype\s*=\s*["']hidden["']/i.test(tag)) continue;
    const index = match.index ?? 0;
    const context = visibleText(html.slice(Math.max(0, index - 500), index + tag.length + 260));
    if (!HASH_TERM.test(`${tag} ${context}`)) continue;
    inputs.push({
      id: attr(tag, 'id') || attr(tag, 'name') || `hash-field-${inputs.length + 1}`,
      tag,
    });
  }
  return inputs;
}

function hasElementId(html: string, id: string): boolean {
  return new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(id)}["']`, 'i').test(html);
}

/** Read-only audit; does not modify the generated lab. */
export function auditLabSolvability(html: string): LabSolvabilityReport {
  const result = audit(html);
  return {
    passed: result.passed,
    autoRepaired: false,
    issues: result.issues,
    repairs: [],
    stats: result.stats,
  };
}

function audit(html: string): AuditResult {
  const issues: LabSolvabilityIssue[] = [];
  const inputTags = [...html.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]);
  const textareaCount = (html.match(/<textarea\b/gi) ?? []).length;
  const selectCount = (html.match(/<select\b/gi) ?? []).length;
  const buttonCount = (html.match(/<button\b/gi) ?? []).length;
  const interactiveControls = inputTags.length + textareaCount + selectCount + buttonCount;
  if (interactiveControls === 0) {
    issues.push({
      code: 'NO_INTERACTIVE_CONTROLS',
      severity: 'error',
      message: '实验没有可供学生操作的输入或按钮。',
    });
  }
  if (!/(?:FLAG\s*\{|flag|achievement|成就|完成|成功|通过)/i.test(html)) {
    issues.push({
      code: 'NO_COMPLETION_SIGNAL',
      severity: 'warning',
      message: '未检测到明确的完成、成功或成就反馈。',
    });
  }

  const gradedInputs = inputTags.filter((tag) => /\bdata-graded-input(?:\s|=|>)/i.test(tag));
  const answerSources = inputTags
    .map((tag) => ({ tag, source: attr(tag, 'data-answer-source') }))
    .filter((entry): entry is { tag: string; source: string } => Boolean(entry.source));
  for (const entry of answerSources) {
    if (!hasElementId(html, entry.source)) {
      issues.push({
        code: 'BROKEN_ANSWER_SOURCE',
        severity: 'error',
        field: attr(entry.tag, 'id'),
        message: `评分输入引用了不存在的证据来源 #${entry.source}。`,
      });
    }
  }
  for (const tag of gradedInputs) {
    if (!attr(tag, 'data-answer-source')) {
      issues.push({
        code: 'UNDECLARED_ANSWER_SOURCE',
        severity: 'warning',
        field: attr(tag, 'id'),
        message: '评分输入没有声明学生可查找答案的证据来源。',
      });
    }
  }

  const hashInputs = findHashInputs(html);
  const markupText = visibleText(html).toLowerCase();
  const visibleHashes = unique(markupText.match(HASH_VALUE) ?? []);
  const hashCandidates = extractHashCandidates(html);
  const missingHashCandidates = hashCandidates.filter(
    (candidate) => !markupText.includes(candidate.toLowerCase()),
  );
  if (hashInputs.length > 0 && visibleHashes.length === 0) {
    if (hashCandidates.length > 0) {
      issues.push({
        code: 'MISSING_HASH_EVIDENCE',
        severity: 'error',
        field: hashInputs.map((input) => input.id).join(', '),
        message: '题目要求填写样本 Hash，但正确值只存在于判题脚本中，学生界面没有可观察线索。',
      });
    } else {
      issues.push({
        code: 'UNRESOLVED_HASH_ANSWER',
        severity: 'error',
        field: hashInputs.map((input) => input.id).join(', '),
        message: '题目要求填写样本 Hash，但既没有展示证据，也无法从判题逻辑解析出可用答案。',
      });
    }
  }

  return {
    passed: !issues.some((issue) => issue.severity === 'error'),
    issues,
    stats: {
      interactiveControls,
      gradedInputs: gradedInputs.length,
      hashInputs: hashInputs.length,
      visibleHashValues: visibleHashes.length,
      answerSources: answerSources.length,
    },
    missingHashCandidates,
  };
}

function digestLabel(value: string): string {
  if (value.length === 64) return 'SHA-256';
  if (value.length === 40) return 'SHA-1';
  if (value.length === 32) return 'MD5';
  return 'Hash';
}

function buildHashEvidence(candidates: string[]): string {
  const rows = candidates
    .slice(0, 4)
    .map(
      (value) =>
        `<div style="margin-top:8px"><strong>${digestLabel(value)}：</strong><code style="user-select:all;word-break:break-all;color:#67e8f9">${escapeHtml(value)}</code></div>`,
    )
    .join('');
  return `
<details open id="openmaic-solvability-hash-evidence" data-openmaic-solvability-repair="missing-hash-evidence" style="margin:16px 0;padding:14px 16px;border:1px solid #f59e0b66;border-radius:10px;background:#451a031f;color:#e2e8f0">
  <summary style="cursor:pointer;font-weight:700;color:#fbbf24">🧪 样本取证记录（Hash 线索）</summary>
  <p style="margin:10px 0 0;line-height:1.6;color:#cbd5e1">在隔离分析环境的文件属性/EDR 记录中得到以下样本摘要。需要填写 Hash 时，从这里复制对应值：</p>
  ${rows}
</details>`;
}

function insertBeforeBodyEnd(html: string, fragment: string): string {
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  if (bodyEnd < 0) return `${html}${fragment}`;
  return `${html.slice(0, bodyEnd)}${fragment}\n${html.slice(bodyEnd)}`;
}

/**
 * Audit and apply conservative deterministic repairs. At present, an exact
 * digest hidden in the checker is surfaced in a collapsed evidence card; no
 * checker logic or completion gates are rewritten.
 */
export function ensureLabSolvability(html: string): LabSolvabilityResult {
  const initial = audit(html);
  let repairedHtml = html;
  const repairs: string[] = [];

  if (
    initial.issues.some((issue) => issue.code === 'MISSING_HASH_EVIDENCE') &&
    initial.missingHashCandidates.length > 0 &&
    !html.includes('data-openmaic-solvability-repair="missing-hash-evidence"')
  ) {
    repairedHtml = insertBeforeBodyEnd(
      repairedHtml,
      buildHashEvidence(initial.missingHashCandidates),
    );
    repairs.push('已补充并展开样本 Hash 取证记录，使判题所需答案可被学生直接获取。');
  }

  const final = audit(repairedHtml);
  const finalKeys = new Set(final.issues.map((issue) => `${issue.code}:${issue.field ?? ''}`));
  const repairedIssues = initial.issues
    .filter((issue) => !finalKeys.has(`${issue.code}:${issue.field ?? ''}`))
    .map((issue) => ({
      ...issue,
      severity: 'warning' as const,
      repaired: true,
      message: `${issue.message}（已自动修复）`,
    }));

  return {
    html: repairedHtml,
    report: {
      passed: final.passed,
      autoRepaired: repairs.length > 0,
      issues: [...repairedIssues, ...final.issues],
      repairs,
      stats: final.stats,
    },
  };
}

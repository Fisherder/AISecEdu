/**
 * Post-generation security content validator.
 *
 * Extracts security claims (CVE IDs, CWE IDs, CVSS scores, OWASP references)
 * from generated HTML and cross-references them against the local knowledge
 * base + NVD. Returns a structured report of issues found.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchCveFromNvd } from './nvd-client';

export interface ValidationIssue {
  type: 'wrong_cvss' | 'unknown_cve' | 'unknown_cwe' | 'wrong_cwe_mapping' | 'misleading_term';
  severity: 'error' | 'warning';
  claim: string;
  expected?: string;
  message: string;
}

export interface ValidationReport {
  passed: boolean;
  issues: ValidationIssue[];
  stats: { cvesChecked: number; cwesChecked: number; cvssChecked: number };
}

interface KBData {
  owasp: Array<{ id: string; name: string; cwe: string }>;
  cwe: Array<{ id: string; name: string }>;
  cves: Array<{ id: string; cvss: number; cwe: string }>;
}

let kbCache: KBData | undefined;
function loadKB(): KBData {
  if (!kbCache) {
    kbCache = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'security', 'knowledge-base.json'), 'utf-8'));
  }
  return kbCache!;
}

const KNOWN_CVE_IDS = new Set<string>();
const KNOWN_CWE_IDS = new Set<string>();

// Common misleading security terms to flag
const MISLEADING_TERMS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /MD5\s*(?:用于|作为|是|做)?\s*(?:密码|加密|签名|哈希|存储|password|encrypt|sign|hash|storage)/i, message: 'MD5 不应用于密码存储/加密/签名——请使用 bcrypt/Argon2 (密码) 或 SHA-256+ (签名)' },
  { pattern: /SHA-?1\s*(?:用于|作为).*?(?:安全|签名|证书|security|sign|cert)/i, message: 'SHA-1 已被证明不安全，不应用于签名/证书——请使用 SHA-256+' },
  { pattern: /(?:ECB模式|ECB mode).*?(?:安全|推荐|recommend|secure)/i, message: 'ECB 模式不安全（不隐藏模式），不应推荐使用——请使用 CBC/CTR/GCM' },
  { pattern: /(?:SSLv3|SSL 3|TLS 1\.0).*?(?:安全|推荐|启用)/i, message: 'SSLv3/TLS 1.0 已废弃，不应推荐——请使用 TLS 1.2+' },
  { pattern: /eval\s*\(\s*(?:user|input|request|\$_)/i, message: 'eval() 执行用户输入是严重安全漏洞——请避免 eval 或充分过滤' },
];

/** Validate generated security content against the knowledge base. */
export async function validateSecurityContent(html: string): Promise<ValidationReport> {
  const kb = loadKB();
  const issues: ValidationIssue[] = [];
  const text = html.replace(/<[^>]+>/g, ' '); // strip tags for text analysis
  let cvesChecked = 0;
  let cwesChecked = 0;
  let cvssChecked = 0;

  // 1. Check CVE IDs mentioned in the content
  const cveIds = text.match(/CVE-\d{4}-\d{4,7}/gi) || [];
  for (const rawId of [...new Set(cveIds)]) {
    const id = rawId.toUpperCase();
    cvesChecked++;
    const localEntry = kb.cves.find((c) => c.id === id);

    if (localEntry) {
      // Check CVSS mentioned near this CVE
      const nearby = text.slice(text.indexOf(rawId), text.indexOf(rawId) + 200);
      const cvssMatch = nearby.match(/CVSS[:\s]*(\d+\.?\d*)/i);
      if (cvssMatch) {
        cvssChecked++;
        const claimed = parseFloat(cvssMatch[1]);
        if (Math.abs(claimed - localEntry.cvss) > 0.5) {
          issues.push({
            type: 'wrong_cvss',
            severity: 'error',
            claim: `${id} CVSS: ${claimed}`,
            expected: `CVSS: ${localEntry.cvss}`,
            message: `${id} 的 CVSS 评分应为 ${localEntry.cvss}，生成内容中写的 ${claimed}`,
          });
        }
      }
    } else {
      // Not in local KB — try NVD (best-effort, don't block)
      const nvd = await fetchCveFromNvd(id).catch(() => null);
      if (!nvd) {
        // Neither local nor NVD — might be a hallucinated CVE
        if (!id.match(/^CVE-(20\d{2})-\d{4,7}$/)) {
          issues.push({
            type: 'unknown_cve',
            severity: 'warning',
            claim: id,
            message: `${id} 不在本地知识库且 NVD 未找到——请核实此 CVE 编号是否正确`,
          });
        }
      } else if (nvd.cvss !== null) {
        // Check CVSS from NVD
        const nearby = text.slice(text.indexOf(rawId), text.indexOf(rawId) + 200);
        const cvssMatch = nearby.match(/CVSS[:\s]*(\d+\.?\d*)/i);
        if (cvssMatch) {
          cvssChecked++;
          const claimed = parseFloat(cvssMatch[1]);
          if (Math.abs(claimed - nvd.cvss) > 0.5) {
            issues.push({
              type: 'wrong_cvss',
              severity: 'error',
              claim: `${id} CVSS: ${claimed}`,
              expected: `CVSS: ${nvd.cvss} (NVD)`,
              message: `${id} 的 NVD 官方 CVSS 为 ${nvd.cvss}，生成内容中写的 ${claimed}`,
            });
          }
        }
      }
    }
  }

  // 2. Check CWE IDs
  const cweIds = text.match(/CWE-\d{1,4}/gi) || [];
  for (const rawId of [...new Set(cweIds)]) {
    const id = rawId.toUpperCase();
    cwesChecked++;
    if (!kb.cwe.find((c) => c.id === id) && !KNOWN_CWE_IDS.has(id)) {
      // Not in our (non-exhaustive) KB — just warn
      issues.push({
        type: 'unknown_cwe',
        severity: 'warning',
        claim: id,
        message: `${id} 不在本地 CWE 知识库中（库非穷尽）——请核实此 CWE 编号`,
      });
    }
  }

  // 3. Check misleading terms
  for (const { pattern, message } of MISLEADING_TERMS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      issues.push({
        type: 'misleading_term',
        severity: 'warning',
        claim: match?.[0]?.slice(0, 60) || '',
        message,
      });
    }
  }

  return {
    passed: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    stats: { cvesChecked, cwesChecked, cvssChecked },
  };
}

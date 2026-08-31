import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('SecurityKB');

interface KBData {
  owasp: Array<{ id: string; name: string; cwe: string; desc: string; prevention: string }>;
  cwe: Array<{ id: string; name: string; desc: string }>;
  attack: Array<{ id: string; name: string; techniques: string[] }>;
  cves: Array<{ id: string; name: string; cwe: string; cvss: number; desc: string; fix: string }>;
  regulations: Array<{ name: string; key: string; year: number }>;
}

let cache: KBData | undefined;

function load(): KBData {
  if (!cache) {
    cache = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'security', 'knowledge-base.json'), 'utf-8'));
  }
  return cache!;
}

// Chinese ↔ English keyword aliases for matching
const CN_ALIASES: Record<string, string[]> = {
  injection: ['注入', 'sql', 'sqli', '命令注入', 'command injection'],
  'access control': ['越权', '权限', '访问控制', 'authorization'],
  'cryptographic failures': ['加密', '密码学', 'crypto', '密钥', 'rsa', 'aes'],
  'xss': ['xss', '跨站脚本', 'cross-site'],
  'csrf': ['csrf', '跨站请求'],
  'ssrf': ['ssrf', '服务端请求'],
  'authentication': ['认证', '登录', 'login', 'auth', 'mfa', '身份'],
  'buffer overflow': ['溢出', 'buffer', '栈溢出', '堆溢出', 'overflow'],
  'use after free': ['释放后使用', 'uaf', 'dangling'],
  'deserialization': ['反序列化', 'deserialize'],
  'path traversal': ['路径穿越', 'directory', '目录遍历'],
  'information exposure': ['信息泄露', '泄露', 'leak'],
  'integer overflow': ['整数溢出', 'integer'],
  'initial access': ['初始访问', '打点', 'fish', '钓鱼'],
  'execution': ['执行', 'powershell', '脚本'],
  'persistence': ['持久化', 'persistence', '维持'],
  'privilege escalation': ['提权', 'escalation', '权限提升'],
  'defense evasion': ['绕过', 'evasion', '混淆', 'obfuscation'],
  'credential access': ['凭证', 'credential', '密码抓取', 'hash'],
  'lateral movement': ['横向移动', 'lateral', '内网'],
  'command & control': ['c2', 'cnc', '命令控制'],
  'exfiltration': ['外发', '数据窃取', 'exfil'],
  'impact': ['勒索', 'ransom', '破坏', 'destruct', 'dos', '拒绝服务'],
};

/** Keyword-match the topic against the local knowledge base. Returns formatted context string. */
export function matchSecurityKnowledge(topic: string, description?: string): string {
  const kb = load();
  const haystack = `${topic} ${description || ''}`.toLowerCase();
  const sections: string[] = [];

  const matchesAlias = (entryName: string): boolean => {
    const n = entryName.toLowerCase();
    if (haystack.includes(n) && n.length > 3) return true;
    for (const [key, aliases] of Object.entries(CN_ALIASES)) {
      if (n.includes(key) || key.includes(n)) {
        if (aliases.some((a) => haystack.includes(a.toLowerCase()))) return true;
      }
    }
    return false;
  };

  // OWASP matches
  const owaspHits = kb.owasp.filter((o) => haystack.includes(o.id.toLowerCase()) || matchesAlias(o.name));
  if (owaspHits.length) {
    sections.push('### OWASP Top 10 相关条目\n' + owaspHits.map((o) => `- **${o.id} ${o.name}** (CWE: ${o.cwe}): ${o.desc}\n  防护: ${o.prevention}`).join('\n'));
  }

  // CWE matches
  const cweHits = kb.cwe.filter((c) => haystack.includes(c.id.toLowerCase()) || matchesAlias(c.name));
  if (cweHits.length) {
    sections.push('### CWE 相关条目\n' + cweHits.map((c) => `- **${c.id} ${c.name}**: ${c.desc}`).join('\n'));
  }

  // CVE matches (local)
  const cveHits = kb.cves.filter((v) => haystack.includes(v.id.toLowerCase()) || haystack.includes(v.name.toLowerCase()));
  if (cveHits.length) {
    sections.push('### 经典 CVE 参考\n' + cveHits.map((v) => `- **${v.id} (${v.name})** CVSS: ${v.cvss} — ${v.desc}\n  修复: ${v.fix}`).join('\n'));
  }

  // ATT&CK matches
  const attackHits = kb.attack.filter((a) => matchesAlias(a.name));
  if (attackHits.length) {
    sections.push('### MITRE ATT&CK 相关战术\n' + attackHits.map((a) => `- **${a.id} ${a.name}**: ${a.techniques.join('; ')}`).join('\n'));
  }

  // Regulation matches
  const regHits = kb.regulations.filter((r) =>
    haystack.includes('法规') || haystack.includes('合规') || haystack.includes('legal') ||
    haystack.includes('law') || haystack.includes('crime') || haystack.includes('犯罪') ||
    haystack.includes(r.name.toLowerCase()),
  );
  if (regHits.length) {
    sections.push('### 安全法规参考\n' + regHits.map((r) => `- **${r.name}** (${r.year}): ${r.key}`).join('\n'));
  }

  return sections.length ? sections.join('\n\n') : '';
}

/** Detect CVE IDs in text (e.g., "CVE-2021-44228"). */
export function extractCveIds(text: string): string[] {
  const matches = text.match(/CVE-\d{4}-\d{4,7}/gi);
  return matches ? [...new Set(matches.map((m) => m.toUpperCase()))] : [];
}

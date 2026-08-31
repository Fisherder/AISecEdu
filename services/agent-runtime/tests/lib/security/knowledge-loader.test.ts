import { describe, it, expect } from 'vitest';
import { matchSecurityKnowledge, extractCveIds } from '@/lib/security/knowledge-loader';

describe('matchSecurityKnowledge', () => {
  it('matches SQL injection topic to OWASP A03 + CWE-89', () => {
    const result = matchSecurityKnowledge('SQL注入登录绕过', '分析SQL注入漏洞');
    expect(result).toContain('A03');
    expect(result).toContain('CWE-89');
    // should NOT match irrelevant entries
    expect(result).not.toContain('CWE-79'); // XSS not related
  });

  it('matches XSS topic to CWE-79', () => {
    const result = matchSecurityKnowledge('XSS 跨站脚本攻击', '存储型XSS');
    expect(result).toContain('CWE-79');
    expect(result).not.toContain('CWE-89'); // SQLi not related
  });

  it('matches buffer overflow to CWE-119', () => {
    const result = matchSecurityKnowledge('栈溢出与ROP', '缓冲区溢出');
    expect(result).toContain('CWE-119');
  });

  it('matches CVE ID directly', () => {
    const result = matchSecurityKnowledge('CVE-2021-44228 Log4Shell', 'JNDI注入');
    expect(result).toContain('CVE-2021-44228');
    expect(result).toContain('Log4Shell');
  });

  it('matches ATT&CK for APT/lateral movement topics', () => {
    const result = matchSecurityKnowledge('APT横向移动分析', '内网渗透');
    expect(result).toContain('TA0008'); // Lateral Movement
  });

  it('matches regulation for legal/compliance topics', () => {
    const result = matchSecurityKnowledge('网络安全法合规分析', '安全法规');
    expect(result).toContain('网络安全法');
  });

  it('returns empty for non-security topics', () => {
    const result = matchSecurityKnowledge('光合作用', '植物生物学');
    expect(result).toBe('');
  });

  it('does not over-match (XSS topic should not match CWE-119 Buffer Overflow)', () => {
    const result = matchSecurityKnowledge('XSS跨站脚本', '反射型XSS分析');
    expect(result).not.toContain('CWE-119');
    expect(result).not.toContain('CWE-416'); // UAF
  });
});

describe('extractCveIds', () => {
  it('extracts CVE IDs from text', () => {
    expect(extractCveIds('分析 CVE-2021-44228 和 CVE-2014-0160')).toEqual(['CVE-2021-44228', 'CVE-2014-0160']);
  });
  it('deduplicates and uppercases', () => {
    expect(extractCveIds('cve-2021-44228 CVE-2021-44228')).toEqual(['CVE-2021-44228']);
  });
  it('returns empty for no CVE', () => {
    expect(extractCveIds('SQL注入')).toEqual([]);
  });
});

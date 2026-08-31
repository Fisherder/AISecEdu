import { describe, it, expect } from 'vitest';
import { validateSecurityContent } from '@/lib/security/validator';

const GOOD_HTML = `
<html><body>
<h2>CVE-2021-44228 Log4Shell 分析</h2>
<p>CVSS: 10.0 — Apache Log4j2 JNDI 注入漏洞。</p>
<p>相关 CWE: CWE-502 反序列化。</p>
<p>修复方案：升级 Log4j 2.15.0+。</p>
</body></html>
`;

const BAD_CVSS_HTML = `
<html><body>
<h2>CVE-2021-44228 分析</h2>
<p>CVSS: 7.5 — JNDI 注入漏洞。</p>
</body></html>
`;

const MD5_HTML = `
<html><body>
<p>密码存储使用 MD5 加密，安全可靠。</p>
</body></html>
`;

const NON_SECURITY_HTML = `
<html><body>
<h2>光合作用原理</h2>
<p>植物利用光能将 CO2 和水转化为葡萄糖。</p>
</body></html>
`;

describe('validateSecurityContent', () => {
  it('passes for accurate CVE content', async () => {
    const r = await validateSecurityContent(GOOD_HTML);
    expect(r.passed).toBe(true);
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('flags wrong CVSS score', async () => {
    const r = await validateSecurityContent(BAD_CVSS_HTML);
    const cvssIssue = r.issues.find((i) => i.type === 'wrong_cvss');
    expect(cvssIssue).toBeDefined();
    expect(cvssIssue!.expected).toContain('10');
  });

  it('flags MD5 for password storage', async () => {
    const r = await validateSecurityContent(MD5_HTML);
    const md5Issue = r.issues.find((i) => i.type === 'misleading_term');
    expect(md5Issue).toBeDefined();
    expect(md5Issue!.message).toContain('MD5');
  });

  it('passes cleanly for non-security content', async () => {
    const r = await validateSecurityContent(NON_SECURITY_HTML);
    expect(r.passed).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('returns stats', async () => {
    const r = await validateSecurityContent(GOOD_HTML);
    expect(r.stats.cvesChecked).toBeGreaterThan(0);
  });
});

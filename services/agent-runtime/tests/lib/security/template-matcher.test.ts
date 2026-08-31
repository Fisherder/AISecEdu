import { describe, it, expect } from 'vitest';
import { matchTemplate, buildTemplateContext } from '@/lib/security/template-matcher';

describe('matchTemplate', () => {
  it('matches DDoS topic to 3d-particle template', () => {
    const r = matchTemplate('DDoS 攻击与流量清洗', '模拟分布式拒绝服务攻击');
    expect(r).not.toBeNull();
    expect(r!.category).toBe('3d-visualization');
  });

  it('matches ransomware topic to ransomware template', () => {
    const r = matchTemplate('勒索软件加密分析', 'WannaCry 勒索病毒');
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe('tpl-ransomware');
  });

  it('matches CVE topic to cve-analysis template', () => {
    const r = matchTemplate('CVE-2021-44228 Log4Shell 漏洞根因分析');
    expect(r).not.toBeNull();
    expect(r!.category).toBe('cve-analysis');
  });

  it('matches protocol/MITM topic to protocol template', () => {
    const r = matchTemplate('TLS 中间人攻击流量分析', 'Wireshark 抓包');
    expect(r).not.toBeNull();
    expect(r!.category).toBe('protocol-analysis');
  });

  it('matches ZKP/cave topic to crypto-game template', () => {
    const r = matchTemplate('零知识证明 Alibaba 山洞', 'ZKP 交互验证');
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe('tpl-zkp-game');
  });

  it('matches phishing topic to social-engineering template', () => {
    const r = matchTemplate('钓鱼邮件识别', '社工攻击防范');
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe('tpl-phishing');
  });

  it('matches SQL injection topic to web-attack template', () => {
    const r = matchTemplate('SQL 注入登录绕过', '数据库注入攻击');
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe('tpl-sqli');
  });

  it('returns null for non-security topics', () => {
    expect(matchTemplate('光合作用原理', '植物生物学')).toBeNull();
  });

  it('returns null for weak matches (score < 3)', () => {
    expect(matchTemplate('hello world', 'basic test')).toBeNull();
  });

  it('does not misclassify generic cryptography as ransomware', () => {
    expect(
      matchTemplate(
        '凯撒密码参数化加解密与暴力破解',
        '通过调节位移参数观察密文变化，并尝试逐步恢复明文',
      ),
    ).toBeNull();
  });
});

describe('buildTemplateContext', () => {
  it('returns non-empty string for matching topic', () => {
    const ctx = buildTemplateContext('DDoS 流量洪水', '3D 可视化');
    expect(ctx).toContain('参考模板');
    expect(ctx).toContain('3d-visualization');
  });

  it('returns empty string for non-matching topic', () => {
    expect(buildTemplateContext('数学公式推导', '微积分')).toBe('');
  });
});

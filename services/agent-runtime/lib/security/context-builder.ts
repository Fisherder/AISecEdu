import { matchSecurityKnowledge, extractCveIds } from './knowledge-loader';
import { fetchCvesFromNvd } from './nvd-client';
import { searchSecurityContext } from './web-search';
import { buildTemplateContext } from './template-matcher';

/**
 * Build a security-knowledge context string for prompt injection.
 *
 * Combines three layers:
 * 1. Local knowledge base matches (OWASP/CWE/ATT&CK/regulations) — instant
 * 2. NVD API lookups (if CVE IDs are detected in the topic) — cached
 * 3. Tavily web search (real-world cases, latest incidents) — live
 *
 * The context is injected into generation prompts as grounding facts,
 * so the LLM references accurate CVE descriptions, CWE definitions, and
 * OWASP guidance instead of hallucinating.
 */
export async function buildSecurityKnowledgeContext(
  topic: string,
  description?: string,
): Promise<string> {
  const parts: string[] = [];

  // Part A: local knowledge base (instant)
  const local = matchSecurityKnowledge(topic, description);
  if (local) parts.push(local);

  // Part B: NVD API (if CVE IDs detected)
  const fullText = `${topic} ${description || ''}`;
  const cveIds = extractCveIds(fullText);
  if (cveIds.length > 0) {
    const nvdResults = await fetchCvesFromNvd(cveIds);
    if (nvdResults.length > 0) {
      const nvdSection =
        '### NVD 实时 CVE 数据\n' +
        nvdResults
          .map(
            (c) =>
              `- **${c.id}** CVSS: ${c.cvss ?? 'N/A'} (${c.severity ?? '?'})\n  ${c.desc}${c.refs.length ? '\n  参考: ' + c.refs.join(', ') : ''}`,
          )
          .join('\n');
      parts.push(nvdSection);
    }
  }

  // Part C: Template auto-match (inject proven style/structure hints)
  const templateCtx = buildTemplateContext(topic, description);
  if (templateCtx) parts.push(templateCtx);

  // Part D: Tavily web search (real-world cases, latest incidents)
  const searchResult = await searchSecurityContext(topic, description);
  if (searchResult?.context) {
    parts.push('### 网络搜索：最新安全案例与资讯\n' + searchResult.context);
  }

  if (parts.length === 0) return '';

  return [
    '## 安全知识库参考（生成内容应基于以下权威信息）',
    '',
    ...parts,
    '',
    '> 注意：以上是来自 OWASP/CWE/NVD/MITRE ATT&CK 及网络搜索的权威安全知识。生成的内容（漏洞描述、修复建议、CVSS 评分等）应与此保持一致。如需引用具体 CVE，确保编号、描述、CVSS 评分准确。',
  ].join('\n');
}

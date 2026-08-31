/**
 * Security-focused web search via Tavily.
 *
 * Searches for real-world security cases, latest CVEs, attack reports,
 * and threat intelligence to supplement the local knowledge base with
 * up-to-date information during generation.
 */
import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { createLogger } from '@/lib/logger';

const log = createLogger('SecuritySearch');

const TAVILY_API_KEY_ENV = 'TAVILY_API_KEY';

/** Build an effective search query for a security topic. */
function buildSecuritySearchQuery(topic: string, description?: string): string {
  // Extract key terms and add security context
  const base = description ? `${topic} ${description}` : topic;
  // Keep concise for Tavily's 400 char limit
  const trimmed = base.slice(0, 300);
  return `${trimmed} cybersecurity vulnerability case study 2024 2025`;
}

export interface SecuritySearchResult {
  query: string;
  answer: string;
  context: string; // formatted for prompt injection
  sources: Array<{ title: string; url: string }>;
}

/** Search for security-related content to supplement generation. */
export async function searchSecurityContext(
  topic: string,
  description?: string,
): Promise<SecuritySearchResult | null> {
  const apiKey = process.env[TAVILY_API_KEY_ENV];
  if (!apiKey) {
    log.warn('TAVILY_API_KEY not set — skipping web search');
    return null;
  }

  const query = buildSecuritySearchQuery(topic, description);

  try {
    const result = await searchWithTavily({
      query,
      apiKey,
      maxResults: 4,
    });

    const context = formatSearchResultsAsContext(result);
    const sources = result.sources.map((s) => ({ title: s.title, url: s.url }));

    return {
      query: result.query,
      answer: result.answer || '',
      context,
      sources,
    };
  } catch (e) {
    log.warn(`Security search failed for "${topic}":`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

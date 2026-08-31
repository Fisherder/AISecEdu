/**
 * Template auto-matcher.
 *
 * When a user inputs a topic, matches against curated high-quality
 * templates and injects style/structure hints into the generation
 * prompt so new content follows proven patterns.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('TemplateMatcher');

interface TemplateEntry {
  id: string;
  file: string;
  category: string;
  title: string;
  keywords: string[];
  cnKeywords: string[];
  styleHints: string;
}

let indexCache: TemplateEntry[] | undefined;

function loadIndex(): TemplateEntry[] {
  if (!indexCache) {
    indexCache = JSON.parse(
      readFileSync(join(process.cwd(), 'lib', 'security', 'template-index.json'), 'utf-8'),
    );
  }
  return indexCache!;
}

/**
 * Match a topic against templates. Returns the best match + style hints,
 * or null if no good match.
 */
export function matchTemplate(topic: string, description?: string): {
  templateId: string;
  category: string;
  title: string;
  styleHints: string;
  score: number;
} | null {
  const haystack = `${topic} ${description || ''}`.toLowerCase();
  const templates = loadIndex();

  let bestMatch: { templateId: string; category: string; title: string; styleHints: string; score: number } | null = null;

  for (const tpl of templates) {
    let score = 0;

    // English keyword matches
    for (const kw of tpl.keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        score += kw.length > 6 ? 3 : 2; // longer keywords weighted higher
      }
    }

    // Chinese keyword matches (higher weight — more specific)
    for (const cn of tpl.cnKeywords) {
      if (haystack.includes(cn.toLowerCase())) {
        score += 4;
      }
    }

    // Category direct mention
    if (haystack.includes(tpl.category.toLowerCase())) score += 2;

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        templateId: tpl.id,
        category: tpl.category,
        title: tpl.title,
        styleHints: tpl.styleHints,
        score,
      };
    }
  }

  // A single short/generic English-keyword hit is worth 2 points (for example,
  // "加密" in the ransomware template).  Requiring 3 prevents that weak hit
  // from injecting an unrelated template while preserving long-keyword,
  // Chinese-specific and multi-keyword matches.
  if (bestMatch && bestMatch.score >= 3) {
    log.info(`Template matched: ${bestMatch.templateId} (score=${bestMatch.score}) for "${topic}"`);
    return bestMatch;
  }

  return null;
}

/**
 * Build a template reference string for prompt injection.
 * When a template matches, its style hints are injected as a
 * "reference structure" — guiding the LLM to follow proven patterns
 * without copying the exact content.
 */
export function buildTemplateContext(topic: string, description?: string): string {
  const match = matchTemplate(topic, description);
  if (!match) return '';

  return [
    `## 参考模板：${match.title}（类别: ${match.category}）`,
    '',
    `以下是经过验证的高质量交互式安全实验模板的结构和风格特征。请在生成时参考这些特征（但不要复制具体内容）：`,
    '',
    match.styleHints,
    '',
    '> 请确保生成的实验具备上述结构和交互深度，但使用用户指定的具体主题内容。',
  ].join('\n');
}

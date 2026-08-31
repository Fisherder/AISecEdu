/** Security Teaching Module — REST API: templates list + match. */
import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { matchTemplate } from '@/lib/security/module';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic');
  const index = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'security', 'template-index.json'), 'utf-8'));

  if (topic) {
    const match = matchTemplate(topic);
    return apiSuccess({ templates: index.map((t: { id: string; category: string; title: string; keywords: string[]; cnKeywords: string[] }) => ({ id: t.id, category: t.category, title: t.title, keywordCount: t.keywords.length + t.cnKeywords.length })), match });
  }

  return apiSuccess({ templates: index.map((t: { id: string; category: string; title: string; keywords: string[]; cnKeywords: string[] }) => ({ id: t.id, category: t.category, title: t.title, keywordCount: t.keywords.length + t.cnKeywords.length })) });
}

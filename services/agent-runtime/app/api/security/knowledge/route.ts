/** Security Teaching Module — REST API: query knowledge base. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { matchSecurityKnowledge, extractCveIds, buildSecurityKnowledgeContext } from '@/lib/security/module';

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic');
  const cveId = req.nextUrl.searchParams.get('cve');

  if (!topic && !cveId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing query param: topic or cve');
  }

  const query = cveId || topic!;
  const localMatch = matchSecurityKnowledge(query, topic || undefined);
  const cveIds = extractCveIds(query);

  // Full context (includes NVD + Tavily if available)
  const fullContext = await buildSecurityKnowledgeContext(query, topic || undefined);

  return apiSuccess({
    query,
    localMatch: localMatch || null,
    detectedCveIds: cveIds,
    fullContext: fullContext || null,
  });
}

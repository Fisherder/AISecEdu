import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import {
  getAgentPlatformSummary,
  SECURITY_AGENT_CATALOG,
  SECURITY_AGENT_WORKFLOWS,
} from '@/lib/security/agent-platform';

/** Governed Agent Zoo contract for the teacher control plane. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }
  return apiSuccess({
    summary: getAgentPlatformSummary(),
    agents: SECURITY_AGENT_CATALOG,
    workflows: SECURITY_AGENT_WORKFLOWS,
  });
}

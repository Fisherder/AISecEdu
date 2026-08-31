/** Auth: get current user. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';

export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  }
  return apiSuccess({
    user: {
      id: principal.userId,
      username: principal.username,
      role: principal.role,
      learnerKey: principal.learnerKey,
      displayName: principal.displayName,
    },
  });
}

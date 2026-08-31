import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import {
  loadStudentAgentLearningState,
  updateStudentLearningPlan,
} from '@/lib/server/student-agent-context';

async function student(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal)
    return { response: apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated') };
  if (principal.role !== 'student')
    return { response: apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required') };
  return { principal };
}

export async function GET(req: NextRequest) {
  const access = await student(req);
  if ('response' in access) return access.response;
  const state = await loadStudentAgentLearningState(access.principal.learnerKey);
  return apiSuccess({ plans: state.plans });
}

export async function PATCH(req: NextRequest) {
  const access = await student(req);
  if ('response' in access) return access.response;
  const body = await req.json().catch(() => ({}));
  const planId = typeof body.planId === 'string' ? body.planId : '';
  const stepId = typeof body.stepId === 'string' ? body.stepId : '';
  if (!planId || !stepId || typeof body.completed !== 'boolean') {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing planId, stepId or completed',
    );
  }
  const plan = await updateStudentLearningPlan(
    access.principal.learnerKey,
    planId,
    stepId,
    body.completed,
  );
  if (!plan) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Learning plan not found');
  return apiSuccess({ plan });
}

import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import {
  forgetStudentMemory,
  loadStudentAgentLearningState,
  saveStudentLearningProfile,
  type StudentLearningProfile,
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
  return apiSuccess({ profile: state.profile, plans: state.plans });
}

export async function PATCH(req: NextRequest) {
  const access = await student(req);
  if ('response' in access) return access.response;
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  await ensureAppSchema(db);
  if (typeof body.forgetFact === 'string') {
    const profile = await forgetStudentMemory(
      access.principal.learnerKey,
      body.forgetFact.slice(0, 180),
      db,
    );
    return apiSuccess({ profile });
  }
  const update: Partial<StudentLearningProfile> = {};
  if (typeof body.learningGoal === 'string') update.learningGoal = body.learningGoal;
  if (body.level === 'beginner' || body.level === 'intermediate' || body.level === 'advanced') {
    update.level = body.level;
  }
  if (
    body.preferences &&
    typeof body.preferences === 'object' &&
    !Array.isArray(body.preferences)
  ) {
    const raw = body.preferences as Record<string, unknown>;
    update.preferences = {
      explanationStyle: typeof raw.explanationStyle === 'string' ? raw.explanationStyle : undefined,
      challengeLevel: typeof raw.challengeLevel === 'string' ? raw.challengeLevel : undefined,
      sessionMinutes: typeof raw.sessionMinutes === 'number' ? raw.sessionMinutes : undefined,
    };
  }
  const profile = await saveStudentLearningProfile(access.principal.learnerKey, update, [], db);
  return apiSuccess({ profile });
}

import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { progressRowToSnapshot, readClassroomForAnalytics } from '@/lib/server/learning-dashboard';
import { ensureAppSchema } from '@/lib/server/schema';
import {
  createStudentSelfStudyPackage,
  normalizeSelfStudyRequest,
  SelfStudyGenerationError,
} from '@/lib/server/self-study-generation';
import { buildLearnerInsight } from '@/lib/security/learning-analytics';

export const maxDuration = 300;

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** GET /api/student/self-study — generated packages and their real progress. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student')
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');
  const db = await getDb();
  await ensureAppSchema(db);
  const [sessionsResult, progressResult] = await Promise.all([
    db.query(
      'SELECT * FROM self_study_sessions WHERE learner_key = $1 ORDER BY created_at DESC LIMIT 30',
      [principal.learnerKey],
    ),
    db.query('SELECT * FROM student_progress WHERE learner_key = $1', [principal.learnerKey]),
  ]);
  const progressByClassroom = new Map(
    progressResult.rows.map((row) => [row.classroom_id as string, row]),
  );
  const sessions = await Promise.all(
    sessionsResult.rows.map(async (row) => {
      const classroomId = typeof row.classroom_id === 'string' ? row.classroom_id : null;
      const classroom = classroomId ? await readClassroomForAnalytics(classroomId) : null;
      const snapshot = classroomId
        ? progressRowToSnapshot({
            classroomId,
            lessonId: typeof row.lesson_id === 'string' ? row.lesson_id : undefined,
            classroom,
            row: progressByClassroom.get(classroomId),
          })
        : null;
      const insight = snapshot ? buildLearnerInsight([snapshot]) : null;
      const plan = jsonObject(row.plan);
      return {
        id: row.id,
        goal: row.goal,
        title: row.title,
        level: row.level,
        durationMinutes: row.duration_minutes,
        preference: row.preference,
        lessonId: row.lesson_id,
        classroomId,
        status: row.status,
        error: row.error,
        plan,
        progress: insight
          ? {
              state: insight.state,
              completionRate: insight.completionRate,
              completedScenes: insight.completedScenes,
              totalScenes: insight.totalScenes,
              averageQuizScore: insight.averageQuizScore,
            }
          : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  );
  return apiSuccess({ sessions });
}

export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student')
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');
  try {
    const body = await req.json().catch(() => ({}));
    const request = normalizeSelfStudyRequest(body);
    const session = await createStudentSelfStudyPackage(req, principal, request);
    return apiSuccess({ session }, 201);
  } catch (error) {
    const message =
      error instanceof SelfStudyGenerationError
        ? error.publicMessage
        : '内容生成暂时失败，请稍后重试';
    return apiError(
      API_ERROR_CODES.GENERATION_FAILED,
      error instanceof SelfStudyGenerationError && /至少 4 个字/.test(message) ? 400 : 502,
      'Self-study package generation failed',
      message,
    );
  }
}

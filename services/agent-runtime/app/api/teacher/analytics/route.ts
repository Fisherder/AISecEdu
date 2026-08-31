import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import {
  buildCohortInsight,
  buildLearnerInsight,
  safeQuizScores,
  type LearnerInsight,
} from '@/lib/security/learning-analytics';
import {
  classroomScenesForAnalytics,
  progressRowToSnapshot,
  readClassroomForAnalytics,
} from '@/lib/server/learning-dashboard';

interface LessonRow extends Record<string, unknown> {
  course_id: string;
  id: string;
  title: string;
  published_classroom_id: string;
  sort_order: number;
}

interface EnrollmentRow extends Record<string, unknown> {
  course_id: string;
  learner_key: string;
  enrolled_at: number;
}

/** Teacher-owned cohort analytics; LLM is not involved in score calculation. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }

  const db = await getDb();
  await ensureAppSchema(db);
  const [coursesResult, lessonsResult, enrollmentsResult, progressResult, usersResult, eventResult] = await Promise.all([
    db.query('SELECT * FROM app_courses WHERE owner_key = $1 ORDER BY updated_at DESC', [principal.learnerKey]),
    db.query(
      `SELECT cl.course_id, l.id, l.title, l.published_classroom_id, cl.sort_order
       FROM course_lessons cl
       JOIN app_courses c ON c.id = cl.course_id
       JOIN app_lessons l ON l.id = cl.lesson_id
       WHERE c.owner_key = $1 AND l.published_classroom_id IS NOT NULL
       ORDER BY cl.course_id, cl.sort_order`,
      [principal.learnerKey],
    ),
    db.query(
      `SELECT ce.course_id, ce.learner_key, ce.enrolled_at
       FROM course_enrollments ce
       JOIN app_courses c ON c.id = ce.course_id
       WHERE c.owner_key = $1`,
      [principal.learnerKey],
    ),
    db.query(
      `SELECT sp.*
       FROM student_progress sp
       JOIN app_lessons l ON l.published_classroom_id = sp.classroom_id
       WHERE l.owner_key = $1`,
      [principal.learnerKey],
    ),
    db.query(
      `SELECT DISTINCT u.id, u.username, u.display_name
       FROM users u
       JOIN course_enrollments ce ON ce.learner_key = ('acct:' || u.id)
       JOIN app_courses c ON c.id = ce.course_id
       WHERE c.owner_key = $1`,
      [principal.learnerKey],
    ),
    db.query(
      `SELECT COUNT(*) AS event_count
       FROM learning_events e
       JOIN app_lessons l ON l.published_classroom_id = e.classroom_id
       WHERE l.owner_key = $1`,
      [principal.learnerKey],
    ),
  ]);

  const lessons = lessonsResult.rows as LessonRow[];
  const enrollments = enrollmentsResult.rows as EnrollmentRow[];
  const progressByKey = new Map(
    progressResult.rows.map((row) => [`${row.classroom_id}:${row.learner_key}`, row]),
  );
  const userByLearnerKey = new Map(
    usersResult.rows.map((row) => [
      `acct:${row.id}`,
      { username: row.username as string, displayName: (row.display_name as string | undefined) || row.username as string },
    ]),
  );

  const classroomEntries = await Promise.all(
    lessons.map(async (lesson) => ({
      lesson,
      classroom: await readClassroomForAnalytics(lesson.published_classroom_id),
    })),
  );

  const enrollmentByLearner = new Map<string, EnrollmentRow[]>();
  for (const enrollment of enrollments) {
    const current = enrollmentByLearner.get(enrollment.learner_key) ?? [];
    current.push(enrollment);
    enrollmentByLearner.set(enrollment.learner_key, current);
  }

  const learnerPayload: Array<{
    learnerKey: string;
    username: string;
    displayName: string;
    courseIds: string[];
    enrolledAt: number;
    insight: LearnerInsight;
  }> = [];
  for (const [learnerKey, learnerEnrollments] of enrollmentByLearner) {
    const courseIds = [...new Set(learnerEnrollments.map((item) => item.course_id))];
    const learnerClassrooms = classroomEntries.filter((entry) => courseIds.includes(entry.lesson.course_id));
    const snapshots = learnerClassrooms.map(({ lesson, classroom }) =>
      progressRowToSnapshot({
        classroomId: lesson.published_classroom_id,
        lessonId: lesson.id,
        classroom,
        row: progressByKey.get(`${lesson.published_classroom_id}:${learnerKey}`),
      }),
    );
    const user = userByLearnerKey.get(learnerKey) ?? { username: learnerKey, displayName: learnerKey.replace('acct:', '学生 ') };
    learnerPayload.push({
      learnerKey,
      username: user.username,
      displayName: user.displayName,
      courseIds,
      enrolledAt: Math.min(...learnerEnrollments.map((item) => Number(item.enrolled_at))),
      insight: buildLearnerInsight(snapshots),
    });
  }

  const cohort = buildCohortInsight(learnerPayload.map((learner) => learner.insight));
  const coursePayload = coursesResult.rows.map((course) => {
    const courseId = course.id as string;
    const courseLearners = learnerPayload.filter((learner) => learner.courseIds.includes(courseId));
    const courseLessons = classroomEntries.filter((entry) => entry.lesson.course_id === courseId);
    const courseInsights = courseLearners.map((learner) => {
      const snapshots = courseLessons.map(({ lesson, classroom }) =>
        progressRowToSnapshot({
          classroomId: lesson.published_classroom_id,
          lessonId: lesson.id,
          classroom,
          row: progressByKey.get(`${lesson.published_classroom_id}:${learner.learnerKey}`),
        }),
      );
      return buildLearnerInsight(snapshots);
    });
    const courseCohort = buildCohortInsight(courseInsights);
    return {
      id: courseId,
      title: course.title,
      courseCode: course.course_code,
      learnerCount: courseLearners.length,
      publishedLessonCount: courseLessons.length,
      averageCompletionRate: courseCohort.averageCompletionRate,
      averageQuizScore: courseCohort.averageQuizScore,
      atRiskCount: courseCohort.atRiskCount,
    };
  });

  const blindSpotMap = new Map<string, { title: string; learnerKeys: Set<string>; scores: number[] }>();
  for (const row of progressResult.rows) {
    const classroomId = row.classroom_id as string;
    const entry = classroomEntries.find((item) => item.lesson.published_classroom_id === classroomId);
    const scenes = classroomScenesForAnalytics(entry?.classroom ?? null);
    for (const [sceneId, score] of Object.entries(safeQuizScores(row.quiz_scores))) {
      if (score >= 60) continue;
      const key = `${classroomId}:${sceneId}`;
      const current = blindSpotMap.get(key) ?? {
        title: scenes.find((scene) => scene.id === sceneId)?.title ?? entry?.lesson.title ?? '未命名测验',
        learnerKeys: new Set<string>(),
        scores: [],
      };
      current.learnerKeys.add(row.learner_key as string);
      current.scores.push(score);
      blindSpotMap.set(key, current);
    }
  }
  const blindSpots = [...blindSpotMap.entries()]
    .map(([id, item]) => ({
      id,
      title: item.title,
      affectedLearners: item.learnerKeys.size,
      averageScore: Math.round(item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length),
    }))
    .sort((left, right) => right.affectedLearners - left.affectedLearners || left.averageScore - right.averageScore)
    .slice(0, 8);

  learnerPayload.sort((left, right) => {
    const riskOrder = { 'at-risk': 0, 'not-started': 1, 'on-track': 2, completed: 3 } as const;
    return riskOrder[left.insight.state] - riskOrder[right.insight.state]
      || left.insight.completionRate - right.insight.completionRate;
  });

  return apiSuccess({
    summary: {
      courseCount: coursesResult.rows.length,
      publishedLessonCount: lessons.length,
      learnerCount: learnerPayload.length,
      evidenceEventCount: Number(eventResult.rows[0]?.event_count ?? 0),
      averageCompletionRate: cohort.averageCompletionRate,
      averageQuizScore: cohort.averageQuizScore,
      atRiskCount: cohort.atRiskCount,
      completedCount: cohort.completedCount,
    },
    cohort,
    courses: coursePayload,
    learners: learnerPayload,
    blindSpots,
    methodology: {
      version: 'evidence-profile/1.0',
      deterministic: true,
      missingEvidenceIsZero: false,
      formalGradeSource: false,
      note: '能力分仅由已记录场景与测验证据形成；无证据显示为空，不以零分替代。',
    },
  });
}

import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { buildLearnerInsight } from '@/lib/security/learning-analytics';
import { progressRowToSnapshot, readClassroomForAnalytics } from '@/lib/server/learning-dashboard';

interface LessonRow extends Record<string, unknown> {
  course_id: string;
  id: string;
  title: string;
  published_classroom_id: string;
  sort_order: number;
}

/** Student home: enrolled courses, evidence-backed profile and next action. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');

  const db = await getDb();
  await ensureAppSchema(db);
  const [coursesResult, lessonsResult, progressResult, eventsResult] = await Promise.all([
    db.query(
      `SELECT c.id, c.title, c.description, c.course_code, ce.enrolled_at
       FROM course_enrollments ce
       JOIN app_courses c ON c.id = ce.course_id
       WHERE ce.learner_key = $1
       ORDER BY ce.enrolled_at DESC`,
      [principal.learnerKey],
    ),
    db.query(
      `SELECT cl.course_id, l.id, l.title, l.published_classroom_id, cl.sort_order
       FROM course_enrollments ce
       JOIN course_lessons cl ON cl.course_id = ce.course_id
       JOIN app_lessons l ON l.id = cl.lesson_id
       WHERE ce.learner_key = $1 AND l.published_classroom_id IS NOT NULL
       ORDER BY cl.course_id, cl.sort_order`,
      [principal.learnerKey],
    ),
    db.query('SELECT * FROM student_progress WHERE learner_key = $1', [principal.learnerKey]),
    db.query('SELECT COUNT(*) AS event_count FROM learning_events WHERE learner_key = $1', [principal.learnerKey]),
  ]);

  const lessons = lessonsResult.rows as LessonRow[];
  const progressByClassroom = new Map(
    progressResult.rows.map((row) => [row.classroom_id as string, row]),
  );
  const classroomEntries = await Promise.all(
    lessons.map(async (lesson) => ({
      lesson,
      classroom: await readClassroomForAnalytics(lesson.published_classroom_id),
    })),
  );

  const snapshots = classroomEntries.map(({ lesson, classroom }) =>
    progressRowToSnapshot({
      classroomId: lesson.published_classroom_id,
      lessonId: lesson.id,
      classroom,
      row: progressByClassroom.get(lesson.published_classroom_id),
    }),
  );
  const insight = buildLearnerInsight(snapshots);

  const coursePayload = coursesResult.rows.map((course) => {
    const courseLessons = classroomEntries.filter((entry) => entry.lesson.course_id === course.id);
    const courseSnapshots = courseLessons.map(({ lesson, classroom }) =>
      progressRowToSnapshot({
        classroomId: lesson.published_classroom_id,
        lessonId: lesson.id,
        classroom,
        row: progressByClassroom.get(lesson.published_classroom_id),
      }),
    );
    const courseInsight = buildLearnerInsight(courseSnapshots);
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      courseCode: course.course_code,
      enrolledAt: course.enrolled_at,
      state: courseInsight.state,
      completionRate: courseInsight.completionRate,
      completedScenes: courseInsight.completedScenes,
      totalScenes: courseInsight.totalScenes,
      averageQuizScore: courseInsight.averageQuizScore,
      lessons: courseLessons.map(({ lesson, classroom }) => {
        const lessonInsight = buildLearnerInsight([
          progressRowToSnapshot({
            classroomId: lesson.published_classroom_id,
            lessonId: lesson.id,
            classroom,
            row: progressByClassroom.get(lesson.published_classroom_id),
          }),
        ]);
        return {
          id: lesson.id,
          title: lesson.title,
          classroomId: lesson.published_classroom_id,
          order: lesson.sort_order,
          state: lessonInsight.state,
          completionRate: lessonInsight.completionRate,
          completedScenes: lessonInsight.completedScenes,
          totalScenes: lessonInsight.totalScenes,
          averageQuizScore: lessonInsight.averageQuizScore,
        };
      }),
    };
  });

  return apiSuccess({
    learner: {
      id: principal.userId,
      username: principal.username,
      displayName: principal.displayName ?? principal.username,
    },
    summary: {
      courseCount: coursePayload.length,
      publishedLessonCount: lessons.length,
      evidenceEventCount: Number(eventsResult.rows[0]?.event_count ?? 0),
      state: insight.state,
      completionRate: insight.completionRate,
      averageQuizScore: insight.averageQuizScore,
    },
    insight,
    courses: coursePayload,
  });
}

/** PG-backed lesson store — owner-scoped via app_lessons table. */
import type { Lesson, LessonSummary } from '@/lib/types/lesson';
import type { LessonStore, Principal } from './types';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';

export class PgLessonStore implements LessonStore {
  async list(principal: Principal | null): Promise<LessonSummary[]> {
    const db = await getDb();
    await ensureAppSchema(db);
    const ownerKey = principal?.learnerKey ?? 'anonymous';
    const result = await db.query(
      `SELECT id, title, subject_profile, course_id, published_classroom_id, artifacts, updated_at
       FROM app_lessons WHERE owner_key = $1 ORDER BY updated_at DESC`,
      [ownerKey],
    );
    return result.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      artifactCount: Array.isArray(r.artifacts) ? (r.artifacts as unknown[]).length : 0,
      ...(r.published_classroom_id ? { publishedClassroomId: r.published_classroom_id as string } : {}),
      updatedAt: r.updated_at as number,
    }));
  }

  async read(principal: Principal | null, id: string): Promise<Lesson | null> {
    const db = await getDb();
    const result = await db.query('SELECT * FROM app_lessons WHERE id = $1 AND owner_key = $2', [
      id,
      principal?.learnerKey ?? 'anonymous',
    ]);
    if (result.rows.length === 0) return null;
    return this.rowToLesson(result.rows[0]!);
  }

  async write(principal: Principal | null, lesson: Lesson): Promise<void> {
    const db = await getDb();
    await ensureAppSchema(db);
    const ownerKey = principal?.learnerKey ?? 'anonymous';
    const now = Date.now();
    await db.query(
      `INSERT INTO app_lessons (id, owner_key, title, description, subject_profile, course_id, published_classroom_id, artifacts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         title = $3, description = $4, subject_profile = $5, course_id = $6,
         published_classroom_id = $7, artifacts = $8, updated_at = $10`,
      [
        lesson.id, ownerKey, lesson.title, lesson.description ?? null,
        lesson.subjectProfile ?? null, lesson.courseId ?? null,
        lesson.publishedClassroomId ?? null,
        JSON.stringify(lesson.artifacts),
        lesson.createdAt, now,
      ],
    );
  }

  async delete(principal: Principal | null, id: string): Promise<void> {
    const db = await getDb();
    await db.query('DELETE FROM app_lessons WHERE id = $1 AND owner_key = $2', [
      id,
      principal?.learnerKey ?? 'anonymous',
    ]);
  }

  private rowToLesson(row: Record<string, unknown>): Lesson {
    return {
      id: row.id as string,
      title: row.title as string,
      ...(row.description ? { description: row.description as string } : {}),
      ...(row.subject_profile ? { subjectProfile: row.subject_profile as 'cybersecurity' } : {}),
      ...(row.course_id ? { courseId: row.course_id as string } : {}),
      ...(row.published_classroom_id ? { publishedClassroomId: row.published_classroom_id as string } : {}),
      artifacts: Array.isArray(row.artifacts) ? row.artifacts as Lesson['artifacts'] : [],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}

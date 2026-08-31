/** PG-backed classroom store — owner-scoped via app_classrooms table. */
import type { Stage, Scene } from '@/lib/types/stage';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';

export async function pgReadClassroom(id: string): Promise<PersistedClassroomData | null> {
  const db = await getDb();
  await ensureAppSchema(db);
  const result = await db.query('SELECT * FROM app_classrooms WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const r = result.rows[0]!;
  return {
    id: r.id as string,
    stage: r.stage as Stage,
    scenes: r.scenes as Scene[],
    createdAt: r.created_at?.toString() ?? new Date().toISOString(),
  };
}

export async function pgPersistClassroom(
  data: { id: string; stage: Stage; scenes: Scene[] },
  ownerKey?: string,
  lessonId?: string,
): Promise<PersistedClassroomData> {
  const db = await getDb();
  await ensureAppSchema(db);
  const now = Date.now();
  await db.query(
    `INSERT INTO app_classrooms (id, owner_key, lesson_id, stage, scenes, visibility, created_at)
     VALUES ($1, $2, $3, $4, $5, 'unlisted', $6)
     ON CONFLICT (id) DO UPDATE SET
       owner_key = $2, lesson_id = $3, stage = $4, scenes = $5`,
    [
      data.id,
      ownerKey ?? 'anonymous',
      lessonId ?? null,
      JSON.stringify(data.stage),
      JSON.stringify(data.scenes),
      now,
    ],
  );
  return {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date(now).toISOString(),
  };
}

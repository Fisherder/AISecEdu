import { promises as fs } from 'fs';
import path from 'path';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import type { Lesson, LessonSummary } from '@/lib/types/lesson';
import { aiseceduRequest, isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

export const LESSONS_DIR = path.join(process.cwd(), 'data', 'lessons');

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

function lessonPath(id: string): string {
  return path.join(LESSONS_DIR, `${id}.json`);
}

/** Validate id against path traversal. Returns the path or null if invalid. */
function safePath(id: string): string | null {
  if (!VALID_ID.test(id)) return null;
  return lessonPath(id);
}

async function ensureLessonsDir() {
  await fs.mkdir(LESSONS_DIR, { recursive: true });
}

export async function readLesson(id: string): Promise<Lesson | null> {
  if (isAISecEduIntegrated()) {
    try {
      const data = await aiseceduRequest<{ lesson: Lesson }>(
        `/pwncollege_api/v1/teaching/runtime/lessons/${encodeURIComponent(id)}`,
      );
      return data.lesson;
    } catch (error) {
      if ((error as Error & { status?: number }).status === 404) return null;
      throw error;
    }
  }
  const p = safePath(id);
  if (!p) return null;
  try {
    const content = await fs.readFile(p, 'utf-8');
    return JSON.parse(content) as Lesson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeLesson(lesson: Lesson): Promise<void> {
  if (!VALID_ID.test(lesson.id)) throw new Error(`Invalid lesson id: ${lesson.id}`);
  if (isAISecEduIntegrated()) {
    await aiseceduRequest(
      `/pwncollege_api/v1/teaching/runtime/lessons/${encodeURIComponent(lesson.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ lesson }),
      },
    );
    return;
  }
  await ensureLessonsDir();
  await writeJsonFileAtomic(lessonPath(lesson.id), { ...lesson, updatedAt: Date.now() });
}

export async function listLessons(): Promise<LessonSummary[]> {
  if (isAISecEduIntegrated()) {
    const data = await aiseceduRequest<{ lessons: LessonSummary[] }>(
      '/pwncollege_api/v1/teaching/runtime/lessons',
    );
    return data.lessons;
  }
  try {
    const entries = await fs.readdir(LESSONS_DIR);
    const summaries: LessonSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const lesson = JSON.parse(await fs.readFile(path.join(LESSONS_DIR, entry), 'utf-8')) as Lesson;
        summaries.push({
          id: lesson.id,
          title: lesson.title,
          artifactCount: lesson.artifacts?.length ?? 0,
          ...(lesson.publishedClassroomId ? { publishedClassroomId: lesson.publishedClassroomId } : {}),
          updatedAt: lesson.updatedAt,
        });
      } catch {
        // skip corrupt files
      }
    }
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function deleteLesson(id: string): Promise<void> {
  if (isAISecEduIntegrated()) {
    await aiseceduRequest(
      `/pwncollege_api/v1/teaching/runtime/lessons/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return;
  }
  const p = safePath(id);
  if (!p) return;
  try {
    await fs.unlink(p);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

export async function createLesson(lesson: Lesson): Promise<Lesson> {
  if (isAISecEduIntegrated()) {
    const data = await aiseceduRequest<{ id: string; lesson: Lesson }>(
      '/pwncollege_api/v1/teaching/runtime/lessons',
      {
        method: 'POST',
        body: JSON.stringify({ lesson }),
      },
    );
    return data.lesson;
  }
  await writeLesson(lesson);
  return lesson;
}

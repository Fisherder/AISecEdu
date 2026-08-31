/** File-backed lesson store — wraps existing lesson-storage.ts (backward compatible). */
import type { Lesson, LessonSummary } from '@/lib/types/lesson';
import type { LessonStore, Principal } from './types';
import { listLessons, readLesson, writeLesson, deleteLesson } from '@/lib/server/lesson-storage';

export class FileLessonStore implements LessonStore {
  async list(_principal: Principal | null): Promise<LessonSummary[]> {
    return listLessons();
  }
  async read(_principal: Principal | null, id: string): Promise<Lesson | null> {
    return readLesson(id);
  }
  async write(_principal: Principal | null, lesson: Lesson): Promise<void> {
    await writeLesson(lesson);
  }
  async delete(_principal: Principal | null, id: string): Promise<void> {
    await deleteLesson(id);
  }
}

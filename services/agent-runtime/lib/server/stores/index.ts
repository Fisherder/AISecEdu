/** Storage factory — selects File or PG backend by STORAGE_BACKEND env. */
import type { LessonStore } from './types';
import { FileLessonStore } from './file-lesson-store';
import { PgLessonStore } from './pg-lesson-store';

let lessonStoreInstance: LessonStore | undefined;

/** Get the active lesson store (singleton). */
export function getLessonStore(): LessonStore {
  if (!lessonStoreInstance) {
    const backend = process.env.STORAGE_BACKEND ?? 'file';
    lessonStoreInstance = backend === 'pg' ? new PgLessonStore() : new FileLessonStore();
  }
  return lessonStoreInstance;
}

/** Resolve principal from a request (lazy import to avoid circular deps in middleware). */
export { resolvePrincipal } from '@/lib/server/auth/session';
export type { Principal, LessonStore } from './types';

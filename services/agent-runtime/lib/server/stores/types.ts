/** Storage interfaces — owner-scoped, swappable backends (file or PG). */
import type { Lesson, LessonSummary } from '@/lib/types/lesson';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';

export interface Principal {
  userId: string;
  username: string;
  role: 'teacher' | 'student' | 'admin';
  learnerKey: string;
  displayName?: string;
}

// ── Lesson Store ──────────────────────────────────────────────────

export interface LessonStore {
  list(principal: Principal | null): Promise<LessonSummary[]>;
  read(principal: Principal | null, id: string): Promise<Lesson | null>;
  write(principal: Principal | null, lesson: Lesson): Promise<void>;
  delete(principal: Principal | null, id: string): Promise<void>;
}

// ── Classroom Store ───────────────────────────────────────────────

export interface ClassroomStore {
  read(id: string): Promise<PersistedClassroomData | null>;
  persist(data: { id: string; stage: PersistedClassroomData['stage']; scenes: PersistedClassroomData['scenes'] }, ownerKey?: string): Promise<PersistedClassroomData & { url?: string }>;
}

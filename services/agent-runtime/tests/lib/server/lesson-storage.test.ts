import { describe, it, expect, beforeEach } from 'vitest';
import { writeLesson, readLesson, listLessons, deleteLesson } from '@/lib/server/lesson-storage';
import type { Lesson } from '@/lib/types/lesson';

const newLesson = (id: string): Lesson => ({
  id,
  title: `课 ${id}`,
  artifacts: [],
  createdAt: 1_000,
  updatedAt: 1_000,
});

describe('lesson-storage', () => {
  const ids: string[] = [];
  beforeEach(async () => {
    for (const id of ids) await deleteLesson(id).catch(() => {});
    ids.length = 0;
  });

  it('writes then reads a lesson', async () => {
    ids.push('t-write');
    await writeLesson(newLesson('t-write'));
    const read = await readLesson('t-write');
    expect(read).not.toBeNull();
    expect(read!.title).toBe('课 t-write');
  });

  it('readLesson returns null for unknown id', async () => {
    expect(await readLesson('does-not-exist')).toBeNull();
  });

  it('listLessons returns summaries (id/title/count/updatedAt)', async () => {
    ids.push('t-list1', 't-list2');
    await writeLesson({ ...newLesson('t-list1'), artifacts: [] });
    await writeLesson({ ...newLesson('t-list2'), artifacts: [] });
    const list = await listLessons();
    const idsInList = list.map((s) => s.id);
    expect(idsInList).toContain('t-list1');
    expect(idsInList).toContain('t-list2');
    const s1 = list.find((s) => s.id === 't-list1')!;
    expect(s1.title).toBe('课 t-list1');
    expect(s1.artifactCount).toBe(0);
  });

  it('deleteLesson removes a lesson', async () => {
    ids.push('t-del');
    await writeLesson(newLesson('t-del'));
    await deleteLesson('t-del');
    expect(await readLesson('t-del')).toBeNull();
  });

  it('rejects invalid id (path traversal guard)', async () => {
    expect(await readLesson('../etc/passwd')).toBeNull();
  });
});

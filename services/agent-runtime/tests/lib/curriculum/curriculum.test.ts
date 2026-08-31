import { describe, it, expect } from 'vitest';
import { getCourse, listCourseNames, loadCurriculum } from '@/lib/curriculum/loader';
import { buildCurriculumContext } from '@/lib/curriculum/context-builder';

describe('curriculum loader', () => {
  it('loads all 8 courses', () => {
    const all = loadCurriculum();
    expect(all).toHaveLength(8);
  });

  it('finds a course by exact name', () => {
    const c = getCourse('现代密码学');
    expect(c).toBeDefined();
    expect(c!.id).toBe('3182131080');
    expect(c!.domain).toBe('crypto');
    expect(c!.knowledgePoints.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown course', () => {
    expect(getCourse('不存在的课程')).toBeUndefined();
  });

  it('lists course names', () => {
    const names = listCourseNames();
    expect(names).toContain('现代密码学');
    expect(names).toContain('网络安全');
    expect(names.length).toBe(8);
  });
});

describe('buildCurriculumContext', () => {
  it('builds a non-empty context string for a known course', () => {
    const ctx = buildCurriculumContext('现代密码学');
    expect(ctx).toContain('现代密码学');
    expect(ctx).toContain('工作模式');
    expect(ctx).toContain('信息安全数学基础'); // prerequisite appears
  });

  it('returns empty string for unknown course (graceful fallback)', () => {
    expect(buildCurriculumContext('不存在的课程')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(buildCurriculumContext(undefined)).toBe('');
  });

  it('renders 无 when a course has no prerequisites', () => {
    const ctx = buildCurriculumContext('网络空间安全导论');
    expect(ctx).toContain('先修课程：无');
  });
});

import { describe, it, expect } from 'vitest';
import { getSecurityDefaultAgents } from '@/lib/orchestration/registry/store';

describe('getSecurityDefaultAgents', () => {
  it('returns 5 security agents', () => {
    const agents = getSecurityDefaultAgents();
    expect(agents).toHaveLength(5);
  });

  it('has exactly one teacher, first (highest priority)', () => {
    const agents = getSecurityDefaultAgents();
    expect(agents.filter((a) => a.role === 'teacher')).toHaveLength(1);
    expect(agents[0]!.role).toBe('teacher');
  });

  it('names are security-themed', () => {
    const names = getSecurityDefaultAgents().map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['安全教授', '红队同学', '蓝队同学']));
  });

  it('every agent has a non-empty persona', () => {
    for (const a of getSecurityDefaultAgents()) {
      expect((a.persona ?? '').length).toBeGreaterThan(20);
    }
  });
});

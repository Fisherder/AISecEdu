import { describe, expect, it } from 'vitest';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import type { Principal } from '@/lib/server/auth/session';

const principal = (role: Principal['role']): Principal => ({
  userId: role,
  username: role,
  learnerKey: `acct:${role}`,
  role,
});

describe('teaching authorization', () => {
  it('admits teachers and admins only', () => {
    expect(isTeachingStaff(principal('teacher'))).toBe(true);
    expect(isTeachingStaff(principal('admin'))).toBe(true);
    expect(isTeachingStaff(principal('student'))).toBe(false);
    expect(isTeachingStaff(null)).toBe(false);
  });
});

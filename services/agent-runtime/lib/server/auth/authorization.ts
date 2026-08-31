import type { Principal } from '@/lib/server/auth/session';

export function isTeachingStaff(principal: Principal | null): principal is Principal {
  return principal?.role === 'teacher' || principal?.role === 'admin';
}

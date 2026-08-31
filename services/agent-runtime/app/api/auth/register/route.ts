/** Auth: register a new user. */
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { hashPassword } from '@/lib/server/auth/password';
import { createSession } from '@/lib/server/auth/session';
import { timingSafeEqual } from 'crypto';

function inviteMatches(provided: unknown, configured: string | undefined): boolean {
  if (typeof provided !== 'string' || !configured) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password, role, displayName, inviteCode } = body;

  if (!username || !password) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: username, password');
  }
  if (username.length < 2 || password.length < 4) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Username ≥ 2 chars, password ≥ 4 chars');
  }

  const requestedRole = role === 'teacher' ? 'teacher' : 'student';
  if (requestedRole === 'teacher' && !inviteMatches(inviteCode, process.env.TEACHER_INVITE_CODE)) {
    return apiError(
      API_ERROR_CODES.FORBIDDEN,
      403,
      process.env.TEACHER_INVITE_CODE
        ? 'Invalid teacher invite code'
        : 'Teacher self-registration is disabled',
    );
  }

  const db = await getDb();
  await ensureAppSchema(db);

  // Check uniqueness
  const existing = await db.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Username already taken');
  }

  const userId = nanoid(10);
  const now = Date.now();
  const hash = hashPassword(password);

  await db.query(
    'INSERT INTO users (id, username, password_hash, role, display_name, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, username, hash, requestedRole, displayName || username, now],
  );

  const res = NextResponse.json({ success: true, user: { id: userId, username, role: requestedRole } }, { status: 201 });
  await createSession(res, userId);
  return res;
}

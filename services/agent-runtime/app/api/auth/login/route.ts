/** Auth: login. */
import { NextRequest, NextResponse } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { verifyPassword } from '@/lib/server/auth/password';
import { createSession } from '@/lib/server/auth/session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: username, password');
  }

  const db = await getDb();
  await ensureAppSchema(db);

  const result = await db.query('SELECT id, username, password_hash, role, display_name FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) {
    return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Invalid username or password');
  }

  const user = result.rows[0]!;
  if (!verifyPassword(password, user.password_hash as string)) {
    return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Invalid username or password');
  }

  const res = NextResponse.json({
    success: true,
    user: { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
  });
  await createSession(res, user.id as string);
  return res;
}

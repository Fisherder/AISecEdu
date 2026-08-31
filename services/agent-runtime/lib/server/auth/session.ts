/**
 * Server-side session management.
 *
 * Uses a `sessions` table + an HttpOnly runtime cookie.
 * Sessions expire after 7 days.
 */
import { randomBytes } from 'crypto';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'aisecedu_agent_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Principal {
  userId: string;
  username: string;
  role: 'teacher' | 'student' | 'admin';
  learnerKey: string; // 'acct:<userId>'
  displayName?: string;
}

/**
 * Create a session for a user and set the cookie on the response.
 */
export async function createSession(
  res: NextResponse,
  userId: string,
): Promise<string> {
  const db = await getDb();
  await ensureAppSchema(db);

  const sessionId = randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_AGE_MS;

  await db.query(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)',
    [sessionId, userId, expiresAt, now],
  );

  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS / 1000,
    path: '/',
  });

  return sessionId;
}

/** Clear the session cookie + delete from DB. */
export async function destroySession(req: NextRequest, res: NextResponse): Promise<void> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const db = await getDb();
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }
  res.cookies.delete(SESSION_COOKIE);
}

/**
 * Resolve the principal from a request's session cookie.
 * Returns null if not authenticated or session expired.
 */
export async function resolvePrincipal(req: NextRequest): Promise<Principal | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = await getDb();
  await ensureAppSchema(db);

  // Look up session + user in one query
  const result = await db.query(
    `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.username, u.role, u.display_name
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = $1`,
    [sessionId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  const expiresAt = row.expires_at as number;
  if (Date.now() > expiresAt) {
    // Expired — clean up
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return null;
  }

  return {
    userId: row.user_id as string,
    username: row.username as string,
    role: row.role as Principal['role'],
    learnerKey: `acct:${row.user_id}`,
    displayName: (row.display_name as string) || undefined,
  };
}

export { SESSION_COOKIE };

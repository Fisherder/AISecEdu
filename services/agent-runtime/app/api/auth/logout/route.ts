/** Auth: logout. */
import { NextRequest, NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { destroySession } from '@/lib/server/auth/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  await destroySession(req, res);
  return res;
}

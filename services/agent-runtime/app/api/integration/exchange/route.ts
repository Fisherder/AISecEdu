import { NextRequest, NextResponse } from 'next/server';
import {
  AISECEDU_SESSION_COOKIE,
  exchangeAISecEduTicket,
  isAISecEduIntegrated,
} from '@/lib/server/aisecedu-integration';
import { recordIntegrationRequest } from '@/lib/server/integration-metrics';

export async function GET(req: NextRequest) {
  const started = Date.now();
  const reply = (body: Record<string, unknown>, status: number) => {
    recordIntegrationRequest('ticket_exchange', status, Date.now() - started);
    return NextResponse.json(body, { status });
  };
  if (!isAISecEduIntegrated()) {
    return reply({ success: false, error: '玄甲 integration is disabled' }, 404);
  }
  const ticket = req.nextUrl.searchParams.get('ticket') || '';
  if (!ticket) {
    return reply({ success: false, error: 'Launch ticket is required' }, 400);
  }
  try {
    const result = await exchangeAISecEduTicket(ticket);
    const target =
      result.target.startsWith('/') && !result.target.startsWith('//') ? result.target : '/';
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || '';
    // In a standalone Next server, req.nextUrl.origin reflects the container
    // listener (for example https://0.0.0.0:3000) even when Nginx forwards the
    // public host. Use the deployment-owned origin instead of request headers,
    // which also avoids turning a forged Host header into an open redirect.
    const publicOrigin = (process.env.AISECEDU_PUBLIC_ORIGIN || '').replace(/\/$/, '');
    const redirectOrigin = publicOrigin || req.nextUrl.origin;
    const response = NextResponse.redirect(
      new URL(`${basePath}${target}`, `${redirectOrigin}/`),
      303,
    );
    response.cookies.set(AISECEDU_SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: basePath || '/',
      maxAge: result.expiresIn,
    });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    recordIntegrationRequest('ticket_exchange', 303, Date.now() - started);
    return response;
  } catch {
    const response = reply({ success: false, error: 'Ticket exchange failed' }, 401);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

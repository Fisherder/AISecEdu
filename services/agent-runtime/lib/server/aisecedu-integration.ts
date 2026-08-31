import { cookies, headers as incomingHeaders } from 'next/headers';

export const AISECEDU_SESSION_COOKIE = 'aisecedu_agent_runtime';
export const AISECEDU_SERVICE_HEADER = 'X-AISecEdu-Service-Token';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  errors?: string[];
  error?: string;
};

export function isAISecEduIntegrated(): boolean {
  return /^(1|true|yes)$/i.test(process.env.AISECEDU_INTEGRATED?.trim() || '');
}

function serviceSecret(): string {
  const value = process.env.AISECEDU_SERVICE_SECRET || '';
  if (value.length < 24) throw new Error('AISECEDU_SERVICE_SECRET is not configured securely');
  return value;
}

function internalOrigin(): string {
  return (process.env.AISECEDU_INTERNAL_URL || 'http://ctfd:8000').replace(/\/$/, '');
}

export async function getAISecEduSessionToken(): Promise<string> {
  const token = (await cookies()).get(AISECEDU_SESSION_COOKIE)?.value;
  if (!token) throw new Error('玄甲 global-agent session is missing');
  return token;
}

export async function aiseceduRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { session?: boolean } = { session: true },
): Promise<T> {
  const outboundHeaders = new Headers(init.headers);
  outboundHeaders.set(AISECEDU_SERVICE_HEADER, serviceSecret());
  outboundHeaders.set('Accept', 'application/json');
  const requestHeaders = await incomingHeaders();
  const traceId = requestHeaders.get('pwn-trace-id') || requestHeaders.get('x-trace-id');
  if (traceId) outboundHeaders.set('X-Trace-ID', traceId.slice(0, 128));
  if (options.session !== false) {
    outboundHeaders.set('Authorization', `Bearer ${await getAISecEduSessionToken()}`);
  }
  if (init.body && !(init.body instanceof FormData) && !outboundHeaders.has('Content-Type')) {
    outboundHeaders.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${internalOrigin()}${path}`, {
    ...init,
    headers: outboundHeaders,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !body.success || body.data === undefined) {
    const detail = body.errors?.join('; ') || body.error || `HTTP ${response.status}`;
    const error = new Error(`玄甲 request failed: ${detail}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body.data;
}

export async function exchangeAISecEduTicket(ticket: string): Promise<{
  sessionToken: string;
  expiresIn: number;
  target: string;
  user: { id: number; name: string };
  scope: Record<string, unknown>;
}> {
  return aiseceduRequest(
    '/pwncollege_api/v1/teaching/runtime/exchange',
    {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    },
    { session: false },
  );
}

export function serviceTokenForInternalCall(): string {
  return serviceSecret();
}

export function aiseceduInternalOrigin(): string {
  return internalOrigin();
}

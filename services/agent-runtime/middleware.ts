import { NextRequest, NextResponse } from 'next/server';

const SERVICE_HEADER = 'X-AISecEdu-Service-Token';
const SESSION_COOKIE = 'aisecedu_agent_runtime';

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function withoutBasePath(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || '';
  if (!base) return pathname;
  return pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
}

type SessionScope = {
  role: 'teacher' | 'student';
  capabilities: string[];
  modelQuotaAvailable: boolean;
};

export function isModelBilledIntegratedApi(pathname: string): boolean {
  return /^\/api\/(?:chat(?:\/pi)?$|pbl\/|quiz-grade$)/.test(pathname);
}

const INTEGRATED_SESSION_API = [
  { pattern: /^\/api\/integration\/aisecedu(?:\/|$)/, methods: new Set(['GET', 'POST', 'DELETE']) },
  { pattern: /^\/api\/lessons(?:\/[A-Za-z0-9_-]+)?$/, methods: new Set(['GET']) },
  { pattern: /^\/api\/classroom$/, methods: new Set(['GET']) },
  { pattern: /^\/api\/classroom-media\/[A-Za-z0-9_-]+\//, methods: new Set(['GET']) },
  { pattern: /^\/api\/chat(?:\/pi)?$/, methods: new Set(['POST']) },
  { pattern: /^\/api\/pbl\//, methods: new Set(['POST']) },
  { pattern: /^\/api\/quiz-grade$/, methods: new Set(['POST']) },
  { pattern: /^\/api\/generate\/tts$/, methods: new Set(['POST']) },
  { pattern: /^\/api\/(?:transcription|parse-pdf)$/, methods: new Set(['POST']) },
];

export function integratedSessionApiAllowed(pathname: string, method: string): boolean {
  return INTEGRATED_SESSION_API.some(
    ({ pattern, methods }) => pattern.test(pathname) && methods.has(method.toUpperCase()),
  );
}

export function integratedSessionPageAllowed(
  pathname: string,
  role: 'teacher' | 'student',
): boolean {
  const classroom = /^\/classroom\/[A-Za-z0-9_-]+\/?$/.test(pathname);
  if (classroom) return true;
  if (role === 'teacher') {
    return /^\/prep\/[A-Za-z0-9_-]+\/?$/.test(pathname);
  }
  return /^(?:\/security-learn\/?|\/prep\/[A-Za-z0-9_-]+\/?)$/.test(pathname);
}

async function activeSessionScope(
  request: NextRequest,
  token: string,
  secret: string,
): Promise<SessionScope | null> {
  const origin = (process.env.AISECEDU_INTERNAL_URL || '').replace(/\/$/, '');
  if (!origin || !token || !secret) return null;
  try {
    const response = await fetch(`${origin}/pwncollege_api/v1/teaching/runtime/introspect`, {
      method: 'POST',
      headers: {
        [SERVICE_HEADER]: secret,
        Authorization: `Bearer ${token}`,
        'X-Trace-ID':
          request.headers.get('pwn-trace-id') ||
          request.headers.get('x-trace-id') ||
          crypto.randomUUID(),
      },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: {
        scope?: { role?: string; capabilities?: string[] };
        modelQuota?: { available?: boolean };
      };
    };
    const scope = body.data?.scope;
    if (scope?.role !== 'teacher' && scope?.role !== 'student') return null;
    return {
      role: scope.role,
      capabilities: Array.isArray(scope.capabilities) ? scope.capabilities : [],
      modelQuotaAvailable: scope.role === 'teacher' || body.data?.modelQuota?.available === true,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = withoutBasePath(request.nextUrl.pathname);
  const integrated = /^(1|true|yes)$/i.test(process.env.AISECEDU_INTEGRATED?.trim() || '');

  if (integrated) {
    if (
      pathname === '/api/health' ||
      pathname === '/api/integration/exchange' ||
      pathname === '/api/integration/metrics'
    ) {
      return NextResponse.next();
    }
    const secret = process.env.AISECEDU_SERVICE_SECRET || '';
    const suppliedServiceToken = request.headers.get(SERVICE_HEADER) || '';
    if (secret.length >= 24 && constantTimeEqual(suppliedServiceToken, secret)) {
      return NextResponse.next();
    }
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value || '';
    const scope = await activeSessionScope(request, sessionToken, secret);
    if (scope) {
      const sensitiveApi =
        /^\/api\/(?:access-code|curriculum|persistence|provider|server-providers|usage|verify-|comfyui-workflows|export-video)/.test(
          pathname,
        );
      if (sensitiveApi) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'FORBIDDEN',
            error: 'This standalone administration API is disabled in 玄甲 integrated sessions',
          },
          { status: 403 },
        );
      }
      if (pathname.startsWith('/api/') && !integratedSessionApiAllowed(pathname, request.method)) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'FORBIDDEN',
            error: 'Use the 玄甲 tool gateway for this operation',
          },
          { status: 403 },
        );
      }
      if (
        scope.role === 'student' &&
        isModelBilledIntegratedApi(pathname) &&
        !scope.modelQuotaAvailable
      ) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'QUOTA_EXCEEDED',
            error: 'Personal model token quota reached',
          },
          { status: 429 },
        );
      }
      if (pathname === '/' || pathname.startsWith('/settings')) {
        const parent = (process.env.AISECEDU_PUBLIC_ORIGIN || '').replace(/\/$/, '');
        const target = scope.role === 'teacher' ? '/teacher' : '/learning/extend';
        return parent
          ? NextResponse.redirect(`${parent}${target}`)
          : new NextResponse('Not found', { status: 404 });
      }
      if (pathname.startsWith('/security-learn') && scope.role !== 'student') {
        return new NextResponse('Student scope required', { status: 403 });
      }
      if (pathname.startsWith('/aisecedu/teacher') && scope.role !== 'teacher') {
        return new NextResponse('Teacher scope required', { status: 403 });
      }
      if (!pathname.startsWith('/api/') && !integratedSessionPageAllowed(pathname, scope.role)) {
        const parent = (process.env.AISECEDU_PUBLIC_ORIGIN || '').replace(/\/$/, '');
        const target = scope.role === 'teacher' ? '/teacher' : '/learning/extend';
        return parent
          ? NextResponse.redirect(`${parent}${target}`)
          : new NextResponse('Not found', { status: 404 });
      }
      return NextResponse.next();
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'AISECEDU_SESSION_REQUIRED',
          error: '玄甲 session required',
        },
        { status: 401 },
      );
    }
    const parent = (process.env.AISECEDU_PUBLIC_ORIGIN || '').replace(/\/$/, '');
    return parent
      ? NextResponse.redirect(`${parent}/teacher?agentSession=required`)
      : new NextResponse('玄甲 session required', { status: 401 });
  }

  if (pathname === '/api/health') {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        success: false,
        errorCode: 'AISECEDU_RUNTIME_ONLY',
        error: 'This capability is only available through the 玄甲 global agent',
      },
      { status: 404 },
    );
  }
  return new NextResponse('Not found', { status: 404 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|avatars/|vendor/).*)'],
};

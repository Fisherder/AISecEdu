import { NextRequest, NextResponse } from 'next/server';
import { aiseceduRequest } from '@/lib/server/aisecedu-integration';
import { recordIntegrationRequest } from '@/lib/server/integration-metrics';

const ALLOWED = [
  /^self-workspace$/,
  /^self-workspace\/generate$/,
  /^self-workspace\/submit$/,
  /^jobs\/[A-Za-z0-9_-]+$/,
  /^candidate-sets\/[A-Za-z0-9_-]+$/,
  /^candidate-sets\/[A-Za-z0-9_-]+\/derive$/,
  /^candidates\/[A-Za-z0-9_-]+\/(?:select|materialize)$/,
  /^artifacts\/[A-Za-z0-9_-]+$/,
  /^artifacts\/[A-Za-z0-9_-]+\/revise$/,
  /^events$/,
];

function validatedPath(parts: string[]): string | null {
  const value = parts.map((part) => encodeURIComponent(decodeURIComponent(part))).join('/');
  return ALLOWED.some((pattern) => pattern.test(value)) ? value : null;
}

async function forward(request: NextRequest, parts: string[]) {
  const started = Date.now();
  const reply = (body: Record<string, unknown>, status = 200) => {
    recordIntegrationRequest('aisecedu_gateway', status, Date.now() - started);
    return NextResponse.json(body, { status });
  };
  const path = validatedPath(parts);
  if (!path) {
    return reply({ success: false, error: 'Unsupported 玄甲 bridge path' }, 404);
  }
  try {
    const raw =
      request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.text();
    const clientPath = /^artifacts\/[A-Za-z0-9_-]+\/revise$/.test(path)
      ? path.replace(/\/revise$/, '')
      : path;
    const endpoint =
      path === 'events'
        ? '/pwncollege_api/v1/teaching/runtime/events'
        : `/pwncollege_api/v1/teaching/runtime/client/${clientPath}`;
    const data = await aiseceduRequest<Record<string, unknown>>(endpoint, {
      method: request.method,
      ...(raw ? { body: raw } : {}),
      headers: raw ? { 'Content-Type': 'application/json' } : undefined,
    });
    return reply({ success: true, data });
  } catch (cause) {
    const error = cause as Error & { status?: number };
    return reply(
      {
        success: false,
        error:
          error.status && error.status < 500 ? error.message : '玄甲 gateway request failed',
      },
      error.status || 500,
    );
  }
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

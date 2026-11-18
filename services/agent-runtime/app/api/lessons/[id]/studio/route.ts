import { NextRequest, NextResponse } from 'next/server';
import { AISECEDU_SESSION_COOKIE } from '@/lib/server/aisecedu-integration';
import {
  readStudio,
  readStudioUiAgentPolicy,
  saveStudio,
  listRuns,
} from '@/lib/server/courseware-studio';
import { capBodyStream } from '@/lib/server/capped-stream';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export function failure(error: unknown) {
  const e = error as Error & { status?: number };
  return NextResponse.json({ error: e.message || '操作未完成' }, { status: e.status || 400 });
}
export async function readBody(req: NextRequest) {
  if (!req.body) throw new Error('请求不能为空');
  const capped = capBodyStream(req.body, 9 * 1024 * 1024);
  return new Response(capped.stream).json();
}
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const revision = Number(req.nextUrl.searchParams.get('revision')) || undefined;
    const info = await readStudio(id, revision);
    const agentPolicy = revision
      ? undefined
      : await readStudioUiAgentPolicy(
          id,
          info.lesson.__aiseceduRevision,
          {
            token: req.cookies.get(AISECEDU_SESSION_COOKIE)?.value || '',
            traceId: req.headers.get('pwn-trace-id') || req.headers.get('x-trace-id') || undefined,
          },
          req.signal,
        );
    return NextResponse.json(
      { ...info, agentPolicy, runs: revision ? [] : await listRuns(id, info.ownerId) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await readStudio(id);
    const body = await readBody(req);
    return NextResponse.json(
      await saveStudio(id, body.lesson, String(body.instruction || '手动编辑课件')),
    );
  } catch (error) {
    return failure(error);
  }
}

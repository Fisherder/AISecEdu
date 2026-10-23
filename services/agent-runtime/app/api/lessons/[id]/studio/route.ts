import { NextRequest, NextResponse } from 'next/server';
import { readStudio, saveStudio, listRuns } from '@/lib/server/courseware-studio';
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
    return NextResponse.json(
      { ...info, runs: revision ? [] : await listRuns(id, info.ownerId) },
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

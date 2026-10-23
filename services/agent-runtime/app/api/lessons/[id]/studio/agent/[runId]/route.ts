import { NextRequest, NextResponse } from 'next/server';
import { authorizeStudio, readRun, readRunBase, cancelRun } from '@/lib/server/courseware-studio';
import { failure } from '../../route';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; runId: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id, runId } = await ctx.params;
    const info = await authorizeStudio(id);
    return NextResponse.json(
      {
        run: await readRun(id, runId, info.ownerId),
        ...(req.nextUrl.searchParams.get('base') === '1'
          ? { base: await readRunBase(id, runId, info.ownerId) }
          : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(_req: NextRequest, ctx: Context) {
  try {
    const { id, runId } = await ctx.params;
    const info = await authorizeStudio(id);
    return NextResponse.json({ run: await cancelRun(id, runId, info.ownerId) });
  } catch (error) {
    return failure(error);
  }
}

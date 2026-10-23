import { after, NextRequest, NextResponse } from 'next/server';
import { createRun, executeRun, readStudio } from '@/lib/server/courseware-studio';
import { failure, readBody } from '../route';
export const runtime = 'nodejs';
export const maxDuration = 420;
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const info = await readStudio(id);
    const body = await readBody(req);
    const result = await createRun(
      info,
      body.lesson,
      String(body.instruction || ''),
      body.scope,
      String(body.requestId || ''),
    );
    if (result.created) after(() => executeRun(result.run, body.lesson));
    return NextResponse.json({ run: result.run }, { status: result.created ? 202 : 200 });
  } catch (error) {
    return failure(error);
  }
}

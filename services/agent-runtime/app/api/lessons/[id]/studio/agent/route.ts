import { after, NextRequest, NextResponse } from 'next/server';
import { AISECEDU_SESSION_COOKIE } from '@/lib/server/aisecedu-integration';
import {
  authorizeStudioAgent,
  createRun,
  executeRun,
  readStudio,
} from '@/lib/server/courseware-studio';
import { failure, readBody } from '../route';
export const runtime = 'nodejs';
export const maxDuration = 420;
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const info = await readStudio(id);
    const body = await readBody(req);
    const session = {
      token: req.cookies.get(AISECEDU_SESSION_COOKIE)?.value || '',
      traceId: req.headers.get('pwn-trace-id') || req.headers.get('x-trace-id') || undefined,
    };
    const policy = await authorizeStudioAgent(
      id,
      info.lesson.__aiseceduRevision,
      session,
      req.signal,
    );
    const result = await createRun(
      info,
      body.lesson,
      String(body.instruction || ''),
      body.scope,
      String(body.requestId || ''),
      policy,
    );
    if (result.created) after(() => executeRun(result.run, body.lesson, policy, session));
    return NextResponse.json({ run: result.run }, { status: result.created ? 202 : 200 });
  } catch (error) {
    return failure(error);
  }
}

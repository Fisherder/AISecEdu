import { NextRequest, NextResponse } from 'next/server';
import { aiseceduRequest, isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

type Context = {params: Promise<{id: string}>};
async function proxy(req: NextRequest, context: Context) {
  if (!isAISecEduIntegrated()) return NextResponse.json({error: '请从教学平台打开辩论活动'}, {status: 404});
  const {id} = await context.params;
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(id)) return NextResponse.json({error: '活动不存在'}, {status: 404});
  if (req.method === 'POST') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    let originHost = '';
    try { originHost = origin ? new URL(origin).host : ''; } catch { /* Malformed origins are rejected. */ }
    if (!originHost || originHost !== host || req.headers.get('sec-fetch-site') === 'cross-site')
      return NextResponse.json({error: '请从活动页面提交'}, {status: 403});
  }
  try {
    const body = req.method === 'POST' ? await req.text() : undefined;
    if (body && body.length > 48000) return NextResponse.json({error: '发言过长'}, {status: 413});
    const result = await aiseceduRequest(`/pwncollege_api/v1/debates/${id}${req.nextUrl.searchParams.get('review') === '1' ? '?review=1' : ''}`,
      {method: req.method, ...(body ? {body} : {}), signal: AbortSignal.timeout(155000)});
    return NextResponse.json(result, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    const status = (error as {status?: number}).status || 503;
    return NextResponse.json({error: status === 404 ? '活动不可访问，请重新打开。' :
      error instanceof Error ? error.message.replace(/^玄甲 request failed: /, '') : '暂时无法连接，请重试'}, {status});
  }
}
export const GET = proxy;
export const POST = proxy;

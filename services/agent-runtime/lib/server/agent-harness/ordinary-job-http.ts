import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { AISECEDU_SERVICE_HEADER, serviceTokenForInternalCall } from '@/lib/server/aisecedu-integration';
import { recordIntegrationRequest } from '@/lib/server/integration-metrics';

type JobReply = {status: number; body: Record<string, unknown>};
type OrdinaryJob = (body: Record<string, unknown>, signal: AbortSignal, started: number) => Promise<JobReply>;

export async function runOrdinaryJob(req: NextRequest, execute: OrdinaryJob) {
  const started = Date.now();
  const reply = (status: number, body: Record<string, unknown>) => {
    recordIntegrationRequest('job_execute', status, Date.now() - started);
    return NextResponse.json(body, {status});
  };
  try {
    const expected = Buffer.from(serviceTokenForInternalCall());
    const supplied = Buffer.from(req.headers.get(AISECEDU_SERVICE_HEADER) || '');
    if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return reply(401, {success: false, error: 'Invalid 玄甲 service credential'});
    }
    const value: unknown = await req.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return reply(400, {success: false, error: 'Invalid job request'});
    }
    const result = await execute(value as Record<string, unknown>, req.signal, started);
    return reply(result.status, result.body);
  } catch {
    return reply(503, {success: false, error: '普通教学服务暂不可用，请稍后重试。', failureCategory: 'service'});
  }
}

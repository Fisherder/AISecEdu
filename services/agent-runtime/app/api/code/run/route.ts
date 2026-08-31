import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { CodeRunnerError, runPythonInContainer } from '@/lib/server/code-runner';

export const runtime = 'nodejs';
export const maxDuration = 35;

interface RateBucket {
  startedAt: number;
  count: number;
}

const globalRateLimit = globalThis as typeof globalThis & {
  __openmaicCodeRunnerRates?: Map<string, RateBucket>;
};
const rateBuckets = (globalRateLimit.__openmaicCodeRunnerRates ??= new Map());

function consumeRateLimit(key: string): boolean {
  const now = Date.now();
  const maxRuns = Math.min(
    Math.max(
      Number(
        process.env.GLOBAL_AGENT_CODE_RUNNER_RUNS_PER_MINUTE ||
          process.env.OPENMAIC_CODE_RUNNER_RUNS_PER_MINUTE,
      ) || 12,
      1,
    ),
    60,
  );
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (bucket.count >= maxRuns) return false;
  bucket.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, '请先登录后再运行代码。');
  }
  if (!consumeRateLimit(principal.userId)) {
    return apiError(API_ERROR_CODES.RATE_LIMITED, 429, '运行过于频繁，请稍后重试。');
  }

  const body = await req.json().catch(() => null);
  try {
    const result = await runPythonInContainer(body);
    return apiSuccess({ result });
  } catch (error) {
    if (error instanceof CodeRunnerError) {
      if (error.code === 'INVALID_REQUEST') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, error.message);
      }
      if (error.code === 'RUNNER_BUSY') {
        return apiError(API_ERROR_CODES.RATE_LIMITED, 429, error.message);
      }
      if (error.code === 'RUNNER_TIMEOUT' || error.code === 'OUTPUT_LIMIT') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 422, error.message);
      }
      return apiError(API_ERROR_CODES.PROVIDER_DISABLED, 503, error.message);
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : '代码运行失败。',
    );
  }
}

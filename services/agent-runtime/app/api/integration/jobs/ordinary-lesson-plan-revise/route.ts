import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createHarnessTurn } from '@/lib/server/agent-harness/classroom-turn';
import {
  InvalidLessonPlanRevision,
  ordinaryLessonPlanReviseMode,
  ordinaryLessonPlanRevisePayload,
  ordinaryLessonPlanReviseRoute,
  reviseOrdinaryLessonPlan,
} from '@/lib/server/agent-harness/ordinary-lesson-plan-revision';
import { runOrdinaryJob } from '@/lib/server/agent-harness/ordinary-job-http';

export const maxDuration = 120;

const job = z.strictObject({
  jobId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  kind: z.literal('artifact.revise'),
  scope: z.strictObject({
    ownerId: z.number().int().positive(),
    dojoId: z
      .number()
      .int()
      .refine((id) => id !== 0),
    moduleIndex: z.number().int().nonnegative().nullish(),
    ordinaryTeaching: z.literal(ordinaryLessonPlanReviseMode),
  }),
  payload: ordinaryLessonPlanRevisePayload,
  modelRoute: z.object({
    route: z.literal(ordinaryLessonPlanReviseRoute),
    provider: z.literal('deepseek'),
    actual_model: z.string(),
    required_model: z.string(),
    allow_degraded: z.literal(false),
    degraded: z.literal(false).optional(),
  }),
});

const unavailable = {
  status: 503,
  body: {
    success: false,
    error: '普通教案修订服务暂不可用，请稍后重试。',
    errorCode: 'ORDINARY_LESSON_PLAN_REVISION_UNAVAILABLE',
    failureCategory: 'service',
  },
};

export async function POST(req: NextRequest) {
  return runOrdinaryJob(req, async (body, signal, started) => {
    const parsed = job.safeParse(body);
    if (!parsed.success) {
      return {
        status: 422,
        body: {
          success: false,
          error: '普通教案修订需要有效的小节和修订要求。',
          errorCode: 'INVALID_ORDINARY_LESSON_PLAN_REVISION_JOB',
          failureCategory: 'permanent',
        },
      };
    }

    const { payload, modelRoute } = parsed.data;
    const modelId = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
    if (
      !modelId ||
      payload.ordinaryLessonPlanRevisionModel !== modelId ||
      modelRoute.actual_model !== modelId ||
      modelRoute.required_model !== modelId
    )
      return unavailable;
    try {
      const turn = createHarnessTurn();
      if (!turn) return unavailable;
      const { result, usage } = await reviseOrdinaryLessonPlan(payload, { turn, modelId, signal });
      signal.throwIfAborted();
      return {
        status: 200,
        body: {
          success: true,
          result,
          model: {
            provider: 'deepseek',
            actualModel: modelId,
            modelVersion: 'deepseek:' + modelId,
            executionMode: ordinaryLessonPlanReviseMode,
            degraded: false,
            usage,
            latencyMs: Date.now() - started,
            responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
          },
        },
      };
    } catch (error) {
      if (error instanceof InvalidLessonPlanRevision) {
        return {
          status: 422,
          body: {
            success: false,
            error: '模型没有返回有效的小节修订，请调整要求后重试。',
            errorCode: 'INVALID_ORDINARY_LESSON_PLAN_REVISION_RESPONSE',
            failureCategory: 'quality',
          },
        };
      }
      return unavailable;
    }
  });
}

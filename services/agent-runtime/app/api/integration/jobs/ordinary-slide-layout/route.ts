import type { NextRequest } from 'next/server';
import { runOrdinaryJob } from '@/lib/server/agent-harness/ordinary-job-http';
import { OrdinaryLayoutError, ordinarySlideLayoutTarget, reviseOrdinarySlideLayout } from '@/lib/server/agent-harness/ordinary-slide-layout';
import { ordinarySlideRevisionInput, slideLayoutJob } from '@/lib/server/agent-harness/ordinary-slide-revision-contract';
import { completedSlideRevision, pinnedSlideRevisionModel } from '@/lib/server/agent-harness/ordinary-slide-revision-job';

export const maxDuration = 2100;

const unavailable = {
  status: 503,
  body: {
    success: false, error: '普通课件版式服务暂不可用。当前版本已保留。',
    errorCode: 'ORDINARY_SLIDE_LAYOUT_UNAVAILABLE', failureCategory: 'service',
  },
};

function layoutError(error: unknown, phase: 'input' | 'revision') {
  if (!(error instanceof OrdinaryLayoutError)) return unavailable;
  return {
    status: error.status,
    body: {success: false, error: error.message, errorCode: error.code,
      failureCategory: error.status === 503 ? 'service' : phase === 'input' || error.status === 409 ? 'permanent' : 'quality'},
  };
}

export function POST(req: NextRequest) {
  return runOrdinaryJob(req, async (body, signal, started) => {
    const input = ordinarySlideRevisionInput(body, slideLayoutJob);
    if (input.error) return input.error;
    let target;
    try {
      target = ordinarySlideLayoutTarget(input.payload);
    } catch (error) {
      return layoutError(error, 'input');
    }
    try {
      const model = pinnedSlideRevisionModel(input.modelRoute, slideLayoutJob, signal);
      if (!model) return unavailable;
      const {result, usage} = await reviseOrdinarySlideLayout(target, model, input.scope);
      return completedSlideRevision(result, usage, model, slideLayoutJob, started);
    } catch (error) {
      return layoutError(error, 'revision');
    }
  });
}

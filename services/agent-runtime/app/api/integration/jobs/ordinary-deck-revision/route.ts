import type { NextRequest } from 'next/server';
import { reviseOrdinaryDeck } from '@/lib/server/agent-harness/ordinary-deck-content-revision';
import { ordinaryDeckTarget, reviseOrdinaryDeckPalette } from '@/lib/server/agent-harness/ordinary-deck-revision';
import { runOrdinaryJob } from '@/lib/server/agent-harness/ordinary-job-http';
import { OrdinaryLayoutError } from '@/lib/server/agent-harness/ordinary-slide-layout';
import { deckRevisionJob, ordinarySlideRevisionInput } from '@/lib/server/agent-harness/ordinary-slide-revision-contract';
import { completedSlideRevision, pinnedSlideRevisionModel } from '@/lib/server/agent-harness/ordinary-slide-revision-job';

export const maxDuration = 2100;

const unavailable = {
  status: 503,
  body: {
    success: false, error: '普通课件修订服务暂不可用。当前版本已保留。',
    errorCode: 'ORDINARY_DECK_UNAVAILABLE', failureCategory: 'service',
  },
};

export function POST(req: NextRequest) {
  return runOrdinaryJob(req, async (body, requestSignal, started) => {
    const input = ordinarySlideRevisionInput(body, deckRevisionJob);
    if (input.error) return input.error;
    try {
      const target = ordinaryDeckTarget(input.payload);
      const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(30 * 60_000)]);
      const model = pinnedSlideRevisionModel(input.modelRoute, deckRevisionJob, signal);
      if (!model) return unavailable;
      const revise = input.payload.deckOperation === 'palette' ? reviseOrdinaryDeckPalette : reviseOrdinaryDeck;
      const {result, usage} = await revise(target, model);
      return completedSlideRevision(result, usage, model, deckRevisionJob, started);
    } catch (error) {
      if (!(error instanceof OrdinaryLayoutError)) return unavailable;
      return {
        status: error.status,
        body: {success: false, error: error.message, errorCode: error.code, failureCategory: 'permanent'},
      };
    }
  });
}

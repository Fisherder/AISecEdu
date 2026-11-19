import type { NextRequest } from 'next/server';
import { createHarnessTurn } from '@/lib/server/agent-harness/classroom-turn';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { PBLProjectV2 } from '../types';

export async function resolveInstructorRuntime(
  request: NextRequest,
  body: { project: PBLProjectV2 },
  stage: 'pbl-v2-runtime:open-task' | 'pbl-v2-runtime:instructor',
) {
  if (body.project.scenario) {
    const { model, thinkingConfig } = await resolveModelFromRequest(request, body, stage);
    return { languageModel: model, thinkingConfig };
  }
  const harnessTurn = createHarnessTurn();
  return harnessTurn ? { harnessTurn } : undefined;
}

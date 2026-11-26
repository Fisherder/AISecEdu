import { openDebateCheckpoint } from '@/lib/debate/checkpoint';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  AISECEDU_SERVICE_HEADER,
  serviceTokenForInternalCall,
} from '@/lib/server/aisecedu-integration';
import { createHarnessTurn, recordHarnessUsage } from '@/lib/server/agent-harness/classroom-turn';
import { debateDialogue, dialogueInputSchema } from '@/lib/server/debate-dialogue';

export async function POST(req: NextRequest) {
  const expected = Buffer.from(serviceTokenForInternalCall());
  const supplied = Buffer.from(req.headers.get(AISECEDU_SERVICE_HEADER) || '');
  if (
    !expected.length ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const input = dialogueInputSchema.safeParse(body.input);
    if (!input.success) {
      return NextResponse.json({ success: false, error: 'Invalid debate input' }, { status: 422 });
    }
    const runTurn = createHarnessTurn();
    const expectedModel = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
    if (!runTurn || !expectedModel) throw new Error('Harness is unavailable');

    const model = 'deepseek:' + expectedModel;
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(140_000)]);
    const usage = { inputTokens: 0, outputTokens: 0 };
    const state = await openDebateCheckpoint({
      kind: 'dialogue',
      request: body.requestIdentity,
      input: input.data,
      model,
    });
    const result = await debateDialogue(
      input.data,
      async (system, prompt) => {
        const turn = await runTurn(
          [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          signal,
        );
        if (turn.model !== expectedModel)
          throw new Error('Harness model does not match the checkpoint');
        await recordHarnessUsage(turn, 'debate-dialogue');
        usage.inputTokens += turn.usage?.prompt_tokens ?? 0;
        usage.outputTokens += turn.usage?.completion_tokens ?? 0;
        return turn.text;
      },
      state,
    );
    return NextResponse.json({ success: true, result, usage, model });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'AI 暂时未能完成回应，请重试；已保存的辩论记录不受影响。',
      },
      { status: 503 },
    );
  }
}

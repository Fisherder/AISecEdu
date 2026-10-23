import { openDebateCheckpoint } from '@/lib/debate/checkpoint';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Output } from 'ai';
import { AISECEDU_SERVICE_HEADER, serviceTokenForInternalCall } from '@/lib/server/aisecedu-integration';
import { resolveModel } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import { debateDialogue, dialogueInputSchema } from '@/lib/server/debate-dialogue';

export async function POST(req: NextRequest) {
  const expected = Buffer.from(serviceTokenForInternalCall());
  const supplied = Buffer.from(req.headers.get(AISECEDU_SERVICE_HEADER) || '');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    return NextResponse.json({success: false, error: 'Unauthorized'}, {status: 401});
  try {
    const body = await req.json();
    const input = dialogueInputSchema.safeParse(body.input);
    if (!input.success) return NextResponse.json({success: false, error: 'Invalid debate input'}, {status: 422});
    const resolved = await resolveModel({modelString: String(body.model || '')});
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(140000)]);
    const usage = {inputTokens: 0, outputTokens: 0};
    const state = await openDebateCheckpoint({kind: 'dialogue', request: body.requestIdentity, input: input.data, model: resolved.modelString});
    const result = await debateDialogue(input.data, async (system, prompt) => {
      const response = await callLLM({model: resolved.model, system, prompt,
        output: Output.json(), maxOutputTokens: 16000, abortSignal: signal, maxRetries: 0},
        'debate-dialogue', {retries: 0}, {mode: 'disabled', enabled: false});
      const used = response.totalUsage ?? response.usage;
      usage.inputTokens += used?.inputTokens || 0;
      usage.outputTokens += used?.outputTokens || 0;
      return response.text;
    }, state);
    return NextResponse.json({success: true, result, usage, model: resolved.modelString});
  } catch {
    return NextResponse.json({success: false, error: 'AI 暂时未能完成回应，请重试；已保存的辩论记录不受影响。'}, {status: 503});
  }
}

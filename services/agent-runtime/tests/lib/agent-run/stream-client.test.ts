import { describe, expect, it } from 'vitest';
import { createAgentRunFactory } from '@/lib/agent-run/factory';
import { readAgentRunNdjson } from '@/lib/agent-run/stream-client';

describe('agent run NDJSON client', () => {
  it('delivers ordered events and returns the final result', async () => {
    const factory = createAgentRunFactory('run-stream');
    const events = [
      factory.event({ type: 'run.started', label: 'stream' }),
      factory.event({ type: 'run.completed', result: { success: true, value: 42 } }),
    ];
    const response = new Response(events.map((event) => JSON.stringify(event)).join('\n') + '\n', {
      headers: { 'content-type': 'application/x-ndjson' },
    });
    const seen: string[] = [];
    const result = await readAgentRunNdjson<{ success: boolean; value: number }>(
      response,
      (event) => seen.push(event.type),
    );
    expect(seen).toEqual(['run.started', 'run.completed']);
    expect(result).toEqual({ success: true, value: 42 });
  });

  it('surfaces a streamed failure', async () => {
    const factory = createAgentRunFactory('run-fail');
    const response = new Response(
      `${JSON.stringify(factory.event({ type: 'run.started', label: 'stream' }))}\n${JSON.stringify(
        factory.event({ type: 'run.failed', error: 'provider unavailable' }),
      )}\n`,
      { headers: { 'content-type': 'application/x-ndjson' } },
    );
    await expect(readAgentRunNdjson(response)).rejects.toThrow('provider unavailable');
  });
});

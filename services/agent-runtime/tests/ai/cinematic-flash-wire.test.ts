import { afterEach, describe, expect, it, vi } from 'vitest';
import { Output } from 'ai';
vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn(async () => {}) }));
import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import { cinematicModelThinking } from '@/lib/server/cinematic-model-policy';

describe('actual cinematic Flash SDK request format', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends low reasoning and json_object through the real provider adapter', async () => {
    let body: Record<string, unknown> = {};
    const network = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: 'mock-completion',
          model: 'deepseek-v4-flash',
          object: 'chat.completion',
          created: 1,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"ok":true}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', network);
    const { model } = getModel({
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: 'test-only',
      baseUrl: 'https://model.invalid/v1',
    });
    const controller = new AbortController();
    const response = await callLLM(
      {
        model,
        messages: [
          { role: 'system', content: 'Output a JSON object.' },
          { role: 'user', content: 'test' },
        ],
        maxOutputTokens: 24000,
        maxRetries: 0,
        abortSignal: controller.signal,
        output: Output.json(),
      },
      'cinematic-wire-test',
      { retries: 0 },
      cinematicModelThinking({ providerId: 'deepseek', modelId: 'deepseek-v4-flash' }, true),
    );
    expect(network).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      model: 'deepseek-v4-flash',
      reasoning_effort: 'low',
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' },
    });
    expect(body.max_tokens ?? body.max_completion_tokens).toBe(24000);
    expect(response.text).toBe('{"ok":true}');
    expect(response.finishReason).toBe('stop');
  });
});

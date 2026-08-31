import { describe, expect, it, vi } from 'vitest';

const integration = vi.hoisted(() => ({
  isIntegrated: vi.fn(() => true),
  request: vi.fn(),
}));

vi.mock('@/lib/server/aisecedu-integration', () => ({
  isAISecEduIntegrated: integration.isIntegrated,
  aiseceduRequest: integration.request,
}));

import { recordUsage } from '@/lib/server/usage-storage';

describe('玄甲 sessionless usage recording', () => {
  it('silently skips an un-attributable background modality event', async () => {
    integration.request.mockRejectedValueOnce(
      new Error('玄甲 global-agent session is missing'),
    );

    await expect(
      recordUsage(
        {
          kind: 'image',
          unit: 'image',
          source: 'image',
          providerId: 'test-provider',
          modelId: 'test-model',
          modelString: 'test-provider:test-model',
          quantity: 1,
        },
        { baseDir: '/tmp/aisecedu-usage-storage-test' },
      ),
    ).resolves.toBeUndefined();
    expect(integration.request).toHaveBeenCalledTimes(1);
  });
});

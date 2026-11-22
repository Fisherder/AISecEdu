import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

vi.mock('@/app/api/integration/jobs/execute/route', () => {
  throw new Error('Static revision routes must not load the general job executor');
});
vi.mock('@/lib/server/resolve-model', () => {
  throw new Error('Static revision routes must not load general model resolution');
});
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  serviceTokenForInternalCall: () => 'integration-secret',
}));

it('handles JSON admission for both independent static courseware endpoints', async () => {
  const { POST: layout } = await import('@/app/api/integration/jobs/ordinary-slide-layout/route');
  const { POST: deck } = await import('@/app/api/integration/jobs/ordinary-deck-revision/route');
  for (const [handler, endpoint] of [[layout, 'ordinary-slide-layout'], [deck, 'ordinary-deck-revision']] as const) {
    const response = await handler(new NextRequest(`http://localhost/agent-runtime/api/integration/jobs/${endpoint}`, {
      method: 'POST',
      headers: {'X-AISecEdu-Service-Token': 'integration-secret', accept: 'application/x-ndjson'},
      body: 'malformed',
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
  }
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/aisecedu-integration', () => ({aiseceduRequest: request, isAISecEduIntegrated: () => true}));
import { GET, POST } from '@/app/api/debates/[id]/route';

const context = {params: Promise.resolve({id: 'artifact_123'})};
function post(headers: Record<string, string>, body = '{}') {
  return POST(new NextRequest('http://learning.test/api/debates/artifact_123', {
    method: 'POST', headers: {host: 'learning.test', ...headers}, body,
  }), context);
}
describe('debate browser proxy', () => {
  beforeEach(() => { request.mockReset().mockResolvedValue({attempts: []}); });
  const rejectedOrigins: Record<string, string>[] = [
    {}, {origin: 'http://attacker.test'}, {origin: 'invalid'},
    {origin: 'http://learning.test', 'sec-fetch-site': 'cross-site'},
  ];
  it.each(rejectedOrigins)('rejects cross-site or missing origins', async headers => {
    expect((await post(headers)).status).toBe(403);
    expect(request).not.toHaveBeenCalled();
  });
  it('forwards same-origin mutations through the scoped platform gateway', async () => {
    expect((await post({origin: 'http://learning.test'})).status).toBe(200);
    expect(request.mock.calls[0][0]).toBe('/pwncollege_api/v1/debates/artifact_123');
  });
  it('preserves authorization errors from the source of truth', async () => {
    request.mockRejectedValue(Object.assign(Error('not found'), {status: 404}));
    expect((await GET(new NextRequest('http://learning.test/api/debates/artifact_123?review=1'), context)).status).toBe(404);
    expect(request.mock.calls[0][0]).toContain('?review=1');
  });
  it('forwards a full-length student message together with its activity metadata', async () => {
    const body = JSON.stringify({action: 'turn', requestId: 'turn-1', attemptId: 'attempt-1', expectedTurn: 0,
      message: '课'.repeat(12_000), intent: 'respond', evidenceIds: ['source-1']});
    expect((await post({origin: 'http://learning.test'}, body)).status).toBe(200);
    expect(request.mock.calls[0][1].body).toBe(body);
  });
  it('enforces the limit on the complete serialized request', async () => {
    const atLimit = JSON.stringify({action: 'start', requestId: 'start-1', side: 'pro'}).padEnd(48_000);
    expect((await post({origin: 'http://learning.test'}, atLimit)).status).toBe(200);
    expect(request).toHaveBeenCalledOnce();
    request.mockClear();
    expect((await post({origin: 'http://learning.test'}, atLimit + ' ')).status).toBe(413);
    expect(request).not.toHaveBeenCalled();
  });
});

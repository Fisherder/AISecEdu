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
  it.each([{}, {origin: 'http://attacker.test'}, {origin: 'invalid'},
    {origin: 'http://learning.test', 'sec-fetch-site': 'cross-site'}])('rejects cross-site or missing origins', async headers => {
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
  it('does not forward oversized requests', async () => {
    expect((await post({origin: 'http://learning.test'}, 'x'.repeat(12001))).status).toBe(413);
    expect(request).not.toHaveBeenCalled();
  });
});

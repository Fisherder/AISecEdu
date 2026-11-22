import {NextRequest} from 'next/server';
import {expect, it, vi} from 'vitest';
import {POST} from '@/app/api/integration/jobs/ordinary-lesson-plan/route';

vi.mock('@/app/api/integration/jobs/execute/route', () => {
  throw new Error('The ordinary lesson plan route loaded the generic job executor');
});

vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  serviceTokenForInternalCall: () => 'lesson-route-test-token',
}));

it('authenticates the public ordinary lesson plan module independently of the generic executor', async () => {
  const response = await POST(new NextRequest('http://localhost/api/integration/jobs/ordinary-lesson-plan', {
    method: 'POST',
    headers: {'Accept': 'application/x-ndjson'},
    body: 'invalid and unauthenticated body',
  }));
  expect(response.status).toBe(401);
  expect(response.headers.get('content-type')).toContain('application/json');
});

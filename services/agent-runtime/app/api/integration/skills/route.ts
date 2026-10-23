import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AISECEDU_SERVICE_HEADER, serviceTokenForInternalCall } from '@/lib/server/aisecedu-integration';
import { agentSkillCatalogSnapshot } from '@/lib/server/agent-skills';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const expected = Buffer.from(serviceTokenForInternalCall());
  const supplied = Buffer.from(request.headers.get(AISECEDU_SERVICE_HEADER) || '');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const ownerId = Number(request.nextUrl.searchParams.get('ownerId'));
  const snapshot = await agentSkillCatalogSnapshot(Number.isSafeInteger(ownerId) && ownerId > 0 ? ownerId : undefined);
  return NextResponse.json({
    success: true,
    data: {
      complete: snapshot.complete,
      skills: snapshot.skills
        .filter((skill) => skill.invocation.userInvocable)
        .map(({ name, description, invocation }) => ({
          name,
          description,
          modelInvocable: invocation.modelInvocable,
        })),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

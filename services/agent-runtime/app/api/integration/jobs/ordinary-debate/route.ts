import type { NextRequest } from 'next/server';
import { executeOrdinaryDebateJob } from '@/lib/server/agent-harness/ordinary-debate';
import { runOrdinaryJob } from '@/lib/server/agent-harness/ordinary-job-http';

export const maxDuration = 2100;

export function POST(req: NextRequest) {
  return runOrdinaryJob(req, executeOrdinaryDebateJob);
}

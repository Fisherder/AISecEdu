import type {NextRequest} from 'next/server';
import {executeOrdinaryLessonPlanJob} from '@/lib/server/agent-harness/ordinary-lesson-plan-job';
import {runOrdinaryJob} from '@/lib/server/agent-harness/ordinary-job-http';

export const maxDuration = 2100;

export function POST(req: NextRequest) {
  return runOrdinaryJob(req, executeOrdinaryLessonPlanJob);
}

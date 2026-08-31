import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { lessonToScenes } from '@/lib/server/lesson-publish';
import type { Lesson } from '@/lib/types/lesson';
import { recordIntegrationRequest } from '@/lib/server/integration-metrics';
import {
  AISECEDU_SERVICE_HEADER,
  serviceTokenForInternalCall,
} from '@/lib/server/aisecedu-integration';

function authorized(request: NextRequest): boolean {
  const expected = Buffer.from(serviceTokenForInternalCall());
  const supplied = Buffer.from(request.headers.get(AISECEDU_SERVICE_HEADER) || '');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  const reply = (body: Record<string, unknown>, status = 200) => {
    recordIntegrationRequest('classroom_render', status, Date.now() - started);
    return NextResponse.json(body, { status });
  };
  if (!authorized(request)) {
    return reply({ success: false, error: 'Invalid 玄甲 service credential' }, 401);
  }
  try {
    const body = (await request.json()) as { classroomId?: string; lesson?: Lesson };
    const classroomId = String(body.classroomId || '');
    const lesson = body.lesson;
    if (
      !/^[A-Za-z0-9_-]{1,48}$/.test(classroomId) ||
      !lesson ||
      !Array.isArray(lesson.artifacts) ||
      lesson.artifacts.length === 0
    ) {
      return reply(
        { success: false, error: 'A valid classroomId and non-empty lesson are required' },
        400,
      );
    }
    const { stage, scenes } = lessonToScenes(lesson, classroomId);
    return reply({ success: true, result: { stage, scenes } });
  } catch {
    return reply({ success: false, error: 'Unable to render classroom' }, 422);
  }
}

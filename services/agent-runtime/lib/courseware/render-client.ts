import type { CoursewareSlideData } from './schema';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

export class CoursewareInspectorUnavailableError extends Error {
  name = 'CoursewareInspectorUnavailableError';
}

export async function inspectRenderedCourseware(
  data: CoursewareSlideData,
  signal?: AbortSignal,
): Promise<{ issues: string[]; evidence: Record<string, unknown> }> {
  const origin = process.env.COURSEWARE_INSPECTOR_URL;
  const secret = process.env.AISECEDU_SERVICE_SECRET;
  if (!origin || !secret)
    throw new CoursewareInspectorUnavailableError(
      'Modern courseware requires a configured browser inspector; unverified template fallback is disabled',
    );
  for (let attempt = 0; attempt < 4; attempt++) {
    signal?.throwIfAborted();
    const bodyText = JSON.stringify(data);
    const timeout = AbortSignal.timeout(90000);
    const response = await fetch(origin.replace(/\/$/, '') + '/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': secret },
      body: bodyText,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    }).catch(() => {
      throw new CoursewareInspectorUnavailableError(
        'Browser inspection connection failed; keep the checkpoint and retry when available',
      );
    });
    if (response.status === 429 && attempt < 3) {
      await setTimeout(1500 * (attempt + 1), undefined, {signal});
      continue;
    }
    if (!response.ok)
      throw new CoursewareInspectorUnavailableError(
        `Browser inspector unavailable (HTTP ${response.status}); no verified result was produced`,
      );
    const body = await response.json();
    if (
      !Array.isArray(body.issues) ||
      !body.issues.every((issue: unknown) => typeof issue === 'string') ||
      !body.evidence ||
      !Array.isArray(body.evidence.frames) ||
      body.evidence.frames.length !== data.page.beats.length + 1 ||
      body.evidence.sourceSha256 !== createHash('sha256').update(bodyText).digest('hex') ||
      body.evidence.frames.some(
        (frame: { step?: number; screenshotSha256?: string }, index: number) =>
          frame.step !== index - 1 || !/^[a-f0-9]{64}$/.test(frame.screenshotSha256 || ''),
      )
    )
      throw new CoursewareInspectorUnavailableError('Incomplete browser verification evidence');
    return { issues: body.issues, evidence: body.evidence };
  }
  throw new CoursewareInspectorUnavailableError('Browser inspector is busy');
}

/**
 * POST /api/pbl/v2/evaluate
 *
 * Three-in-one SSE entry point for PBL v2 evaluations. The client
 * picks the kind via the request body:
 *
 *   { kind: 'task', milestoneId, microtaskId, project }
 *   { kind: 'milestone', milestoneId, project }
 *   { kind: 'final', project }
 *
 * Same wire shape as `/api/pbl/v2/instructor`: SSE stream of
 * PBLSSEEvent, ending with a final `done` after a `project_patch`
 * carrying the new PBLEvaluation. Client wraps the evaluation into
 * either a task-eval card (in-chat), a milestone+handover card
 * (chat), or the completion page (separate UI).
 *
 * The route is stateless: the client owns the project clone and
 * sends it in the body. The server mutates the clone and the patch
 * event tells the client what changed. Same pattern as instructor
 * route — see `app/api/pbl/v2/instructor/route.ts`.
 *
 * Why kind-as-body not kind-as-URL: the three runs all need the
 * same model resolution, headers, project decoding, and SSE
 * heartbeat plumbing — keeping them on one route avoids three
 * near-identical handlers. The trade-off is a runtime switch on a
 * string, which is cheap and obvious.
 */

import type { NextRequest } from 'next/server';

import { apiError } from '@/lib/server/api-response';
import {
  createHarnessTurn,
  createTeachingImageTurn,
  type TeachingTurnImage,
} from '@/lib/server/agent-harness/classroom-turn';
import { latestSubmissionForMicrotask } from '@/lib/pbl/v2/operations/submission';

import { createSSEResponse } from '@/lib/pbl/v2/api/sse';
import {
  runFinalEvaluation,
  runMilestoneEvaluation,
  runTaskEvaluation,
} from '@/lib/pbl/v2/agents/evaluator';
import type { PBLProjectV2 } from '@/lib/pbl/v2/types';

export const maxDuration = 300;

type EvalKind = 'task' | 'milestone' | 'final';

interface EvaluateRequest {
  project: PBLProjectV2;
  kind: EvalKind;
  milestoneId?: string;
  microtaskId?: string;
  recentChatSummary?: string;
  selectedSubmissionImage?: unknown;
  newTeachingImage?: { dataUrl: string; consent: true; caption?: string };
}

function parseSelectedImage(value: unknown): TeachingTurnImage | undefined {
  if (typeof value !== 'string' || value.length > (2 * 1024 * 1024 * 4) / 3 + 64) return;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return;
  const image = { mediaType: match[1] as TeachingTurnImage['mediaType'], data: match[2] };
  if (Buffer.byteLength(image.data, 'base64') > 2 * 1024 * 1024) return;
  return image;
}

async function canSendNewTeachingImage(req: NextRequest): Promise<boolean> {
  if (!/^(1|true|yes)$/i.test(process.env.AISECEDU_INTEGRATED?.trim() || '')) return false;
  const sessionToken = req.cookies.get('aisecedu_agent_runtime')?.value;
  const secret = process.env.AISECEDU_SERVICE_SECRET;
  const origin = process.env.AISECEDU_INTERNAL_URL?.replace(/\/$/, '');
  if (!sessionToken || !secret || !origin) return false;
  try {
    const res = await fetch(`${origin}/pwncollege_api/v1/teaching/runtime/introspect`, {
      method: 'POST',
      headers: { 'X-AISecEdu-Service-Token': secret, Authorization: `Bearer ${sessionToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(5000)]),
    });
    if (!res.ok) return false;
    const { data } = await res.json();
    return data?.active === true && data.ordinaryTeachingImageAllowed === true &&
      Number.isSafeInteger(data.user?.id) && data.user.id > 0 &&
      data.scope?.user_id === data.user.id &&
      Number.isSafeInteger(data.scope.dojo_id);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  return Response.json(
    { allowed: Boolean(createHarnessTurn()) && await canSendNewTeachingImage(req) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  let body: EvaluateRequest;
  try {
    body = (await req.json()) as EvaluateRequest;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Request body must be valid JSON.');
  }

  if (!body?.project) {
    return apiError('MISSING_REQUIRED_FIELD', 400, '`project` is required.');
  }
  if (body.kind !== 'task' && body.kind !== 'milestone' && body.kind !== 'final') {
    return apiError('INVALID_REQUEST', 400, "`kind` must be 'task' | 'milestone' | 'final'.");
  }
  if (body.kind === 'task' && (!body.milestoneId || !body.microtaskId)) {
    return apiError(
      'MISSING_REQUIRED_FIELD',
      400,
      "kind='task' requires both milestoneId and microtaskId.",
    );
  }
  if (body.kind === 'milestone' && !body.milestoneId) {
    return apiError('MISSING_REQUIRED_FIELD', 400, "kind='milestone' requires milestoneId.");
  }

  const harnessTurn = createHarnessTurn();
  if (!harnessTurn) return apiError('UPSTREAM_ERROR', 503, '项目评价服务尚未配置。');

  const submission =
    body.kind === 'task' && body.microtaskId && Array.isArray(body.project.submissions)
      ? latestSubmissionForMicrotask(body.project, body.microtaskId)
      : undefined;
  const imageSubmission = submission?.kind === 'file' && submission.mimeType?.startsWith('image/');
  let taskTurn = harnessTurn;
  let newTeachingImageCaption: string | undefined;
  if (body.selectedSubmissionImage !== undefined) {
    return apiError('INVALID_REQUEST', 400, '历史附件仅供查看。若课程允许发送教学图片，请在本轮重新选择图片并确认发送。');
  }
  if (body.newTeachingImage !== undefined) {
    if (!await canSendNewTeachingImage(req)) {
      return apiError('FORBIDDEN', 403, '当前会话没有发送教学图片的课程权限。请提交文字说明。');
    }
    const image = parseSelectedImage(body.newTeachingImage?.dataUrl);
    if (body.kind !== 'task' || body.project.scenario || body.newTeachingImage?.consent !== true || !image) {
      return apiError('INVALID_REQUEST', 400, '请确认发送本轮新选的普通教学图片。');
    }
    const imageTurn = createTeachingImageTurn(image);
    if (!imageTurn) return apiError('UPSTREAM_ERROR', 503, '项目评价服务尚未配置。');
    taskTurn = imageTurn;
    newTeachingImageCaption = typeof body.newTeachingImage.caption === 'string'
      ? body.newTeachingImage.caption.trim().slice(0, 2000)
      : '';
  } else if (imageSubmission && !submission.content?.trim()) {
    return apiError('INVALID_REQUEST', 415, '请提供可供评价的文字说明，或在有权限的课程中明确选择发送本轮新图。');
  }

  if (body.kind === 'task') {
    return createSSEResponse(
      runTaskEvaluation({
        project: body.project,
        milestoneId: body.milestoneId!,
        microtaskId: body.microtaskId!,
        harnessTurn: taskTurn,
        newTeachingImageCaption,
        recentChatSummary: body.recentChatSummary,
        signal: req.signal,
      }),
      { signal: req.signal },
    );
  }
  if (body.kind === 'milestone') {
    return createSSEResponse(
      runMilestoneEvaluation({
        project: body.project,
        milestoneId: body.milestoneId!,
        harnessTurn,
        recentChatSummary: body.recentChatSummary,
        signal: req.signal,
      }),
      { signal: req.signal },
    );
  }
  // final
  return createSSEResponse(
    runFinalEvaluation({
      project: body.project,
      harnessTurn,
      recentChatSummary: body.recentChatSummary,
      signal: req.signal,
    }),
    { signal: req.signal },
  );
}

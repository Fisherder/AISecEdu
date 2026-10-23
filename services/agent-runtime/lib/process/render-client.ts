import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compileProcessScene } from './compile';
import type { ProcessPackage, ProcessScene } from './schema';

const issueSchema = z.object({
  code: z.string().max(80),
  message: z.string().max(1200),
});
const frameSchema = z.object({
  name: z.enum(['initial', 'final', 'mobile']),
  width: z.number().int().positive(),
  screenshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  visibleViews: z.number().int().nonnegative(),
  activeStages: z.number().int().nonnegative(),
  horizontalOverflow: z.number().nonnegative(),
  presentation: z.object({
    version: z.literal('code-evidence-v1'),
    codePanels: z.array(z.object({id: z.string(), lineCount: z.number().int().nonnegative(),
      activeIndex: z.number().int().min(-1), markedIndices: z.array(z.number().int().nonnegative())})).max(12),
    addressedViews: z.array(z.object({id: z.string(), base: z.number().int().nonnegative(),
      length: z.number().int().nonnegative()})).max(12),
    issues: z.array(z.string().max(1200)).max(24),
  }).optional(),
});
const inspectionSchema = z.object({
  issues: z.array(issueSchema).max(80),
  evidence: z.object({
    mode: z.literal('headless-chromium-process-dom-and-pixels'),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    inspectedAt: z.string(),
    frames: z.array(frameSchema).length(3),
    controls: z.object({
      domainAction: z.boolean(),
      visibleChange: z.boolean(),
      undo: z.boolean(),
      reset: z.boolean(),
      verification: z.boolean(),
      offline: z.boolean(),
      responsive: z.boolean(),
      decisions: z.boolean().optional(),
      liveInput: z.boolean().optional(),
      objectPick: z.boolean().optional(),
    }),
    decisions: z.array(z.object({id:z.string(),sameCheckpoint:z.boolean(),comparisonRows:z.number().int().nonnegative(),
      alternatives:z.array(z.object({action:z.string(),values:z.record(z.string(),z.unknown()),screenshotSha256:z.string().regex(/^[a-f0-9]{64}$/)}))})).optional(),
    objects:z.array(z.object({view:z.string(),input:z.string(),index:z.number().int().nonnegative(),value:z.unknown(),
      action:z.string().optional(),stateChanges:z.record(z.string(),z.unknown()),click:z.boolean(),keyboard:z.boolean(),undo:z.boolean(),
      fixedIdentity:z.boolean().optional(),selectionChanged:z.boolean().optional()})).optional(),
  }),
});

export type ProcessRenderInspection = z.infer<typeof inspectionSchema>;
export type ProcessRenderInspector = (
  scene: ProcessScene,
  tests: ProcessPackage['tests'],
) => Promise<ProcessRenderInspection>;

export class ProcessInspectorUnavailableError extends Error {
  name = 'ProcessInspectorUnavailableError';
}
export class ProcessInteractionProofError extends Error {
  name = 'ProcessInteractionProofError';
}

export function parseProcessInspection(value: unknown, html: string) {
  const result = inspectionSchema.parse(value);
  if (result.evidence.sourceSha256 !== createHash('sha256').update(html).digest('hex'))
    throw new ProcessInspectorUnavailableError('二维互动浏览器检查的成品指纹不匹配');
  const controls = result.evidence.controls;
  if (!result.issues.length && result.evidence.frames.some(frame => frame.presentation?.issues.length))
    throw new ProcessInspectorUnavailableError('二维互动浏览器检查报告了代码或字节呈现错误');
  if (!result.issues.length && Object.values(controls).some((passed) => passed !== true))
    throw new ProcessInspectorUnavailableError('二维互动浏览器检查缺少完整操作证据');
  return result;
}

export async function inspectRenderedProcess(
  scene: ProcessScene,
  tests: ProcessPackage['tests'],
  signal?: AbortSignal,
): Promise<ProcessRenderInspection> {
  const origin = process.env.COURSEWARE_INSPECTOR_URL;
  const secret = process.env.AISECEDU_SERVICE_SECRET;
  if (!origin || !secret)
    throw new ProcessInspectorUnavailableError('二维互动生成需要已配置的浏览器检查服务');
  const html = compileProcessScene(scene);
  const response = await fetch(origin.replace(/\/$/, '') + '/inspect-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': secret },
    body: JSON.stringify({ html, scene, tests }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  }).catch(() => {
    signal?.throwIfAborted();
    throw new ProcessInspectorUnavailableError('二维互动浏览器检查连接失败');
  });
  signal?.throwIfAborted();
  if (response.status === 422) {
    const detail=await response.json().catch(()=>undefined);
    if(detail?.error==='process-interaction-proof'&&typeof detail.message==='string')
      throw new ProcessInteractionProofError('实际浏览器交互合同未通过：'+detail.message.slice(0,1200));
  }
  if (!response.ok)
    throw new ProcessInspectorUnavailableError(
      `二维互动浏览器检查不可用（HTTP ${response.status}）`,
    );
  try {
    return parseProcessInspection(await response.json(), html);
  } catch (error) {
    if (error instanceof ProcessInspectorUnavailableError) throw error;
    throw new ProcessInspectorUnavailableError('二维互动浏览器检查响应不完整');
  }
}

export function configuredProcessInspector(
  signal?: AbortSignal,
): ProcessRenderInspector | undefined {
  return /^(1|true|yes)$/i.test(process.env.AISECEDU_INTEGRATED || '') ||
    process.env.COURSEWARE_INSPECTOR_URL
    ? (scene, tests) => inspectRenderedProcess(scene, tests, signal)
    : undefined;
}

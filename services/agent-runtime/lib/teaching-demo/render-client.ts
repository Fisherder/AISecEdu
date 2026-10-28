import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TeachingDemoProfileId } from './profiles';

const inspectionSchema = z.object({
  issues: z.array(z.string().max(2000)).max(80),
  evidence: z.object({
    version: z.literal('teaching-demo-browser-v1'),
    profile: z.enum(['rsa', 'dh', 'aes-128', 'sha256', 'hmac-sha256']),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    oracleCases: z.number().int().nonnegative(),
    controls: z.object({forward: z.boolean(), backward: z.boolean(), reset: z.boolean(),
      parameterChange: z.boolean(), experiment: z.boolean(), quiz: z.boolean(), responsive: z.boolean(), offline: z.boolean()}),
    frames: z.array(z.object({name: z.enum(['desktop', 'mobile']), width: z.number().int().positive(),
      screenshotSha256: z.string().regex(/^[a-f0-9]{64}$/)})).length(2),
  }),
});

export type TeachingDemoInspection = z.infer<typeof inspectionSchema>;
export type TeachingDemoInspector = (html: string, profile: TeachingDemoProfileId, signal?: AbortSignal) => Promise<TeachingDemoInspection>;

export class TeachingDemoInspectorUnavailableError extends Error {
  name = 'TeachingDemoInspectorUnavailableError';
}

export function parseTeachingDemoInspection(value: unknown, html: string, profile: TeachingDemoProfileId) {
  try {
    const result = inspectionSchema.parse(value);
    if (result.evidence.profile !== profile || result.evidence.sourceSha256 !== createHash('sha256').update(html).digest('hex') ||
        new Set(result.evidence.frames.map(frame => frame.name)).size !== 2 ||
        (!result.issues.length && (result.evidence.oracleCases < 3 || Object.values(result.evidence.controls).some(value => !value))))
      throw Error('浏览器证据与本次页面或操作不符');
    return result;
  } catch {
    throw new TeachingDemoInspectorUnavailableError('教学演示浏览器检查证据缺失或不匹配，保留底稿等待检查服务恢复');
  }
}

export function configuredTeachingDemoInspector(): TeachingDemoInspector {
  const origin = process.env.COURSEWARE_INSPECTOR_URL;
  const secret = process.env.AISECEDU_SERVICE_SECRET;
  if (!origin || !secret) throw new TeachingDemoInspectorUnavailableError('教学演示需要独立浏览器检查服务，未生成未经检查的成品');
  return async (html, profile, signal) => {
    let response: Response;
    try {
      response = await fetch(origin.replace(/\/$/, '') + '/inspect-teaching-demo', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': secret},
        body: JSON.stringify({html, profile}),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
      });
    } catch {
      signal?.throwIfAborted();
      throw new TeachingDemoInspectorUnavailableError('教学演示检查服务连接失败，已保留底稿');
    }
    signal?.throwIfAborted();
    if (!response.ok) throw new TeachingDemoInspectorUnavailableError(`教学演示检查服务不可用（HTTP ${response.status}），已保留底稿`);
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new TeachingDemoInspectorUnavailableError('教学演示检查服务返回无效数据'); }
    return parseTeachingDemoInspection(value, html, profile);
  };
}

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { generationFingerprint } from '@/lib/generation/durable-stage';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { LessonArtifact } from '@/lib/types/lesson';
import type { SingleArtifactInput } from '@/lib/server/lesson-generation';
import { TEACHING_DEMO_VERSION, teachingDemoPrompt } from './design';
import { applyTeachingDemoEdits, TeachingDemoValidationError, validateTeachingDemoHtml } from './html';
import { configuredTeachingDemoInspector, type TeachingDemoInspection, type TeachingDemoInspector } from './render-client';
import type { TeachingDemoProfile } from './profiles';

const MAX_MODEL_CALLS = 3;
type SavedDraft = {fingerprint: string; raw: string; calls: number; issues: string[]; requiresEdit?: boolean};

export class TeachingDemoRepairExhaustedError extends Error {
  name = 'TeachingDemoRepairExhaustedError';
  constructor(readonly issues: string[]) { super('教学演示局部修复预算已用完；底稿与具体诊断已保留，未重做整条生成链。'); }
}

function continueHtml(before: string, after: string) {
  const next = after.replace(/^\s*```(?:html|js|javascript)?\s*\n/i, '').replace(/\n```\s*$/, '');
  if (/^\s*<!doctype/i.test(next)) return next;
  for (let length = Math.min(4000, before.length, next.length); length >= 32; length--)
    if (before.endsWith(next.slice(0, length))) return before + next.slice(length);
  return before + next;
}

export async function generateTeachingDemo(input: SingleArtifactInput, order: number, profile: TeachingDemoProfile,
  aiCall: AICallFn, options: {state?: GenerationStateStore; inspect?: TeachingDemoInspector; signal?: AbortSignal;
    materialGrounding?: string; previous?: {html: string; instruction: string}; onProgress?: (stage: string) => void} = {}): Promise<LessonArtifact> {
  const inspect = options.inspect ?? configuredTeachingDemoInspector();
  const request = {request: input.originalRequest || input.description, title: input.title,
    intent: input.visualIntent, keyPoints: input.keyPoints, teacherLearningRequest: input.teacherLearningRequest,
    materialGrounding: options.materialGrounding || '', previous: options.previous};
  if (JSON.stringify(request).length > 200000) throw new TeachingDemoValidationError(['完整教学要求与材料超过容量，未截断来源']);
  const requirements = teachingDemoPrompt(profile, request);
  const fingerprint = generationFingerprint({version: TEACHING_DEMO_VERSION, profile, request,
    promptSha256: createHash('sha256').update(requirements).digest('hex')});
  const stored = options.state?.read('teaching-demo-draft') as SavedDraft | undefined;
  let saved: SavedDraft = stored?.fingerprint === fingerprint
    ? structuredClone(stored) : {fingerprint, raw: options.previous?.html ?? '', calls: 0, issues: []};
  const persist = async () => { await options.state?.write('teaching-demo-draft', saved); };
  const model = async (system: string, prompt: string, stage: 'teaching-demo' | 'teaching-demo-repair') => {
    options.signal?.throwIfAborted();
    if (saved.calls >= MAX_MODEL_CALLS) throw new TeachingDemoRepairExhaustedError(saved.issues);
    options.onProgress?.(stage);
    const raw = await aiCall(system, prompt, undefined, {stage});
    saved.calls++;
    await persist();
    return raw;
  };
  if (!saved.raw) {
    saved.raw = await model('你是玄甲教学作品生成器，完整实现算法和交互，只返回离线HTML。', requirements, 'teaching-demo');
    await persist();
  } else if (options.previous && saved.calls === 0 && !saved.issues.length) {
    saved.issues = ['按教师本轮修订要求修改现有作品：' + options.previous.instruction];
    saved.requiresEdit = true;
    await persist();
  }
  for (;;) {
    options.signal?.throwIfAborted();
    let html: string | undefined;
    let inspection: TeachingDemoInspection | undefined;
    if (!saved.requiresEdit) {
      try {
        html = validateTeachingDemoHtml(saved.raw);
        options.onProgress?.('teaching-demo-inspection');
        inspection = await inspect(html, profile.id, options.signal);
        if (inspection.issues.length) throw new TeachingDemoValidationError(inspection.issues);
        const now = Date.now();
        return {id: nanoid(), type: 'simulation', title: input.title, order, createdAt: now,
          outline: {id: nanoid(), type: 'interactive', title: input.title, description: input.description || '', keyPoints: input.keyPoints || [], order},
          content: {html, renderingMode: 'teaching-demo-v1', processIntent: input.visualIntent, teachingDemo: {
            version: TEACHING_DEMO_VERSION, profile: profile.id, requestHash: fingerprint,
            sourceSha256: createHash('sha256').update(html).digest('hex'), modelCalls: saved.calls,
            browser: inspection.evidence, algorithmScope: 'independent-bounded-oracles',
          }}};
      } catch (error) {
        if (!(error instanceof TeachingDemoValidationError)) throw error;
        saved.issues = error.issues;
        await persist();
      }
    }
    if (saved.calls >= MAX_MODEL_CALLS) throw new TeachingDemoRepairExhaustedError(saved.issues);
    if (!/<\/html>/i.test(saved.raw)) {
      const suffix = await model('只续写尚未结束的离线HTML，不重写已有部分，不省略代码。',
        JSON.stringify({requirements, currentHtml: saved.raw, instruction: '从最后字符继续，最终关闭script/body/html'}), 'teaching-demo-repair');
      saved.raw = continueHtml(saved.raw, suffix);
      await persist();
      continue;
    }
    const edits = await model('你是局部代码修复工程师。只返回JSON {edits:[{before,after}]}。before逐字匹配当前HTML中唯一的一段，after仅修复该段。最多8项。保留算法、主题与原有正确功能，不重生成整页，不通过删除功能或伪造检查接口避开错误。',
      JSON.stringify({requirements, html: saved.raw, issues: saved.issues}), 'teaching-demo-repair');
    try { saved.raw = applyTeachingDemoEdits(saved.raw, parseJsonResponse(edits)); saved.issues = []; saved.requiresEdit = false; }
    catch (error) { saved.issues = [error instanceof Error ? error.message : '局部修复输出无效']; }
    await persist();
  }
}

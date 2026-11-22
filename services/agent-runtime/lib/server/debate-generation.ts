import { nanoid } from 'nanoid';
import { z } from 'zod';
import { debateSpecSchema, debateV2SpecSchema, type DebateSpec } from '@/lib/debate/schema';
import { runDurableStage } from '@/lib/generation/durable-stage';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { Lesson, LessonArtifact } from '@/lib/types/lesson';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import { isOrdinaryTeachingProse } from '@/lib/teaching/ordinary-text';
import { ordinaryTeachingRules } from '@/lib/server/agent-harness/ordinary-teaching';
import { DEBATE_DESIGN_V2, DEBATE_REVISION_V2 } from '@/lib/debate/prompts';
import { upgradeDebate } from '@/lib/debate/session';
import { applyDebatePatch, debatePatchSchema, type DebateRevisionEntry } from '@/lib/debate/patch';

export const DEBATE_DESIGN_SYSTEM = DEBATE_DESIGN_V2;

export function debateLesson(spec: DebateSpec, artifactId?: string, now = Date.now()): Lesson {
  const artifact: LessonArtifact = {
    id: 'debate-activity', type: 'debate', title: spec.title, order: 1, createdAt: now,
    outline: { id: 'debate-activity', type: 'interactive', title: spec.title,
      description: spec.scenario, keyPoints: spec.objectives, order: 1, widgetType: 'simulation' },
    content: { html: '', widgetType: 'simulation', debate: spec, debateArtifactId: artifactId },
  };
  return {id: artifactId || nanoid(), title: spec.title, description: spec.motion,
    artifacts: [artifact], createdAt: now, updatedAt: now};
}

export function isOrdinaryDebateProse(value: unknown): boolean {
  if (typeof value === 'string') return isOrdinaryTeachingProse(value);
  if (value && typeof value === 'object') return Object.values(value).every(isOrdinaryDebateProse);
  return true;
}

function validateOrdinaryDebate<T>(value: T, ordinarySignal?: AbortSignal): T {
  if (ordinarySignal && !isOrdinaryDebateProse(value)) {
    throw new Error('Debate activity must contain ordinary teaching prose');
  }
  return value;
}

function debateSystem(system: string, ordinarySignal?: AbortSignal) {
  return ordinarySignal ? ordinaryTeachingRules + '\n' + system : system;
}

export async function generateDebate(input: Record<string, unknown>, aiCall: AICallFn, state?: GenerationStateStore,
  ordinarySignal?: AbortSignal) {
  return runDurableStage({name: 'debate-design', system: debateSystem(DEBATE_DESIGN_V2, ordinarySignal),
    input, aiCall, state, signal: ordinarySignal, contractVersion: '2',
    validate(value) {
      const spec = upgradeDebate(debateSpecSchema.parse(value));
      return ordinarySignal ? validateOrdinaryDebate(debateV2SpecSchema.parse(spec), ordinarySignal) : spec;
    }, maxAttempts: 2});
}

export async function reviseDebate(spec: DebateSpec, instruction: string, aiCall: AICallFn,
  options: {history?: Array<Pick<DebateRevisionEntry, 'changes'>>; state?: GenerationStateStore; ordinarySignal?: AbortSignal} = {}) {
  const fields = ['title', 'motion', 'scenario', 'studentRole', 'positions', 'objectives', 'rounds', 'evidence', 'rubric', 'reflectionPrompts'] as const;
  const patchSchema = z.object({changes: z.array(z.object({field: z.enum(fields), value: z.unknown()}).strict()).min(1).max(fields.length)}).strict();
  return runDurableStage({name: 'debate-revision', aiCall, state: options.state, maxAttempts: 2, contractVersion: '2',
    signal: options.ordinarySignal, system: debateSystem(DEBATE_REVISION_V2, options.ordinarySignal),
    input: {spec: upgradeDebate(spec), instruction, revisionHistory: (options.history || []).slice(-16)}, validate(value) {
      let patch;
      if (value && typeof value === 'object' && 'operations' in value) {
        const object = value as Record<string, unknown>;
        patch = debatePatchSchema.parse({summary: object.summary, operations: object.operations});
      } else if (value && typeof value === 'object' && 'spec' in value && 'changes' in value) {
        const saved = z.object({summary: z.string(), changes: z.array(z.object({path: z.string(), after: z.unknown().optional()}))}).parse(value);
        patch = debatePatchSchema.parse({summary: saved.summary, operations: saved.changes.map(change =>
          change.after === undefined ? {op: 'remove', path: change.path} : {op: 'set', path: change.path, value: change.after})});
      } else {
        const legacy = patchSchema.parse(value);
        if (new Set(legacy.changes.map(item => item.field)).size !== legacy.changes.length) throw Error('重复修改字段');
        patch = {summary: instruction, operations: legacy.changes.map(item => ({op: 'set' as const, path: '/' + item.field, value: item.value}))};
      }
      validateOrdinaryDebate(patch, options.ordinarySignal);
      return validateOrdinaryDebate(
        {...applyDebatePatch(upgradeDebate(spec), patch, instruction), operations: patch.operations},
        options.ordinarySignal,
      );
    }});
}

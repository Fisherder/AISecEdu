import { z } from 'zod';

const text = z.string().trim().min(1).max(2000);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const legacyDebateSpecSchema = z.object({
  schema: z.literal('debate-v1'),
  title: text.max(160),
  motion: text.max(500),
  scenario: text,
  studentRole: text.max(300),
  positions: z.object({ pro: text.max(500), con: text.max(500) }).strict(),
  objectives: z.array(text.max(300)).min(2).max(6),
  rounds: z.array(z.object({ id, title: text.max(80), task: text.max(600) }).strict()).min(3).max(6),
  evidence: z.array(z.object({
    id, title: text.max(160), content: text, source: text.max(500),
    kind: z.enum(['provided', 'hypothetical']),
  }).strict()).min(2).max(8),
  rubric: z.array(z.object({ id, title: text.max(80), description: text.max(500) }).strict()).min(3).max(6),
  reflectionPrompts: z.array(text.max(300)).min(2).max(4),
}).strict().superRefine((spec, ctx) => {
  for (const key of ['rounds', 'evidence', 'rubric'] as const) {
    if (new Set(spec[key].map(item => item.id)).size !== spec[key].length)
      ctx.addIssue({code: 'custom', path: [key], message: 'IDs must be unique'});
  }
  if (spec.positions.pro === spec.positions.con)
    ctx.addIssue({code: 'custom', path: ['positions'], message: 'Positions must be different'});
});

const paragraph = z.string().trim().min(1).max(12000);
export const debateV2SpecSchema = z.object({
  schema: z.literal('debate-v2'),
  title: paragraph.max(240), motion: paragraph.max(1600), scenario: paragraph,
  studentRole: paragraph.max(1600),
  positions: z.object({pro: paragraph.max(2400), con: paragraph.max(2400)}).strict(),
  objectives: z.array(paragraph.max(1200)).min(1).max(12),
  format: z.object({kind: z.enum(['dialogue', 'oxford', 'roundtable', 'hearing', 'socratic', 'negotiation', 'custom']),
    label: paragraph.max(100), description: paragraph.max(3000)}).strict(),
  rules: z.object({
    durationMinutes: z.number().min(1).max(240), maxExchanges: z.number().int().min(1).max(100),
    responseChars: z.number().int().min(30).max(4000), style: paragraph.max(3000),
    allowFollowUps: z.boolean().default(true), allowEarlyFinish: z.boolean().default(true),
    coaching: z.enum(['on-demand', 'always', 'off']).default('on-demand'),
  }).strict(),
  roles: z.array(z.object({id, name: paragraph.max(100), identity: paragraph.max(1000),
    side: z.enum(['pro', 'con', 'neutral']), stance: paragraph.max(3000),
    voice: paragraph.max(1600), opening: paragraph.max(3000)}).strict()).min(1).max(8),
  rounds: z.array(z.object({id, title: paragraph.max(160), task: paragraph.max(3000),
    mode: z.string().trim().min(1).max(80), exchanges: z.number().int().min(1).max(20),
    speakers: z.array(id).max(8).default([]),
    prompts: z.array(paragraph.max(1000)).max(8).default([]),
  }).strict()).min(1).max(24),
  evidence: z.array(z.object({id, title: paragraph.max(240), content: paragraph,
    source: paragraph.max(2000), kind: z.enum(['provided', 'hypothetical'])}).strict()).max(40),
  rubric: z.array(z.object({id, title: paragraph.max(160), description: paragraph.max(2000)}).strict()).min(1).max(12),
  reflectionPrompts: z.array(paragraph.max(1000)).min(1).max(12),
}).strict().superRefine((spec, ctx) => {
  for (const key of ['rounds', 'roles', 'evidence', 'rubric'] as const) {
    if (new Set(spec[key].map(item => item.id)).size !== spec[key].length)
      ctx.addIssue({code: 'custom', path: [key], message: 'IDs must be unique'});
  }
  if (spec.rounds.reduce((sum, round) => sum + round.exchanges, 0) > spec.rules.maxExchanges)
    ctx.addIssue({code: 'custom', path: ['rules', 'maxExchanges'], message: '总交锋上限不能小于议程计划交锋数'});
  for (const [index, round] of spec.rounds.entries()) {
    if (round.speakers.some(speaker => !spec.roles.some(role => role.id === speaker)))
      ctx.addIssue({code: 'custom', path: ['rounds', index, 'speakers'], message: '发言角色必须存在'});
  }
  if (spec.positions.pro === spec.positions.con)
    ctx.addIssue({code: 'custom', path: ['positions'], message: 'Positions must be different'});
});

export const debateSpecSchema = z.discriminatedUnion('schema', [legacyDebateSpecSchema, debateV2SpecSchema]);
export type DebateSpec = z.infer<typeof debateSpecSchema>;
export type DebateV2Spec = z.infer<typeof debateV2SpecSchema>;
export type DebateSide = 'pro' | 'con' | 'neutral';
export type DebateIntent = 'respond' | 'follow-up' | 'challenge' | 'evidence' | 'listen' | 'advance';
export type DebateMove = {id: string; kind: 'claim' | 'challenge' | 'concession' | 'synthesis';
  speakerId: string; text: string; targetId?: string; evidenceIds: string[]};
export type DebateVoice = {speakerId: string; content: string; evidenceIds: string[]};
export type DebateTurn = {
  id: string; round: number; student: string;
  intent?: DebateIntent; targetSpeakerId?: string; evidenceIds?: string[];
  reply: { acknowledgement: string; argument: string; question: string; evidenceIds: string[];
    coaching: { quote: string; feedback: string }; voices?: DebateVoice[]; moves?: DebateMove[];
    moderator?: string; memory?: {studentClaim: string; unresolved: string};
    phaseComplete?: boolean; phaseSummary?: string };
};
export type DebateReport = {
  summary: string;
  criteria: { rubricId: string; level: number; evidenceTurnIds: string[]; feedback: string; studentQuotes?: {turnId: string; quote: string}[] }[];
  nextSteps: string[];
};
export type DebateAttempt = {
  id: string; revision: number; side: DebateSide; preview: boolean;
  status: 'ACTIVE' | 'REFLECTING' | 'COMPLETED'; spec: DebateSpec;
  turns: DebateTurn[]; reflection?: string; report?: DebateReport; pending?: boolean;
  updated: string; studentName?: string; phaseIndex?: number;
};

export function debateFromLesson(lesson: unknown): DebateSpec | null {
  const artifacts = (lesson as { artifacts?: { content?: { debate?: unknown } }[] })?.artifacts;
  if (!Array.isArray(artifacts)) return null;
  for (const artifact of artifacts) {
    const result = debateSpecSchema.safeParse(artifact.content?.debate);
    if (result.success) return result.data;
  }
  return null;
}

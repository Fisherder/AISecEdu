import { z } from 'zod';
import { isOrdinaryTeachingProse } from '@/lib/teaching/ordinary-text';
import { recordHarnessUsage, type HarnessTurn } from './classroom-turn';
import { ordinaryTeachingRules } from './ordinary-teaching';

export const ordinaryLessonPlanReviseMode = 'ordinary-lesson-plan-revise';
export const ordinaryLessonPlanReviseRoute = 'upstream-ordinary-lesson-plan-revise';
const prose = (limit: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(limit)
    .refine(
      (value) =>
        isOrdinaryTeachingProse(value) &&
        !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]|`|~{3,}|(?:https?|ftp|file|data|javascript):|靶场|攻防演练|漏洞复现|漏洞利用|攻击步骤|可执行载荷|\b(?:ctf|exploit)\b/iu.test(
          value,
        ),
    );
const index = z.number().int().min(0).max(29);
const explanation = prose(180);
const takeaways = z.array(prose(64)).min(1).max(4);
const uniqueIndices = (rows: { index: number }[]) =>
  new Set(rows.map((row) => row.index)).size === rows.length;
const section = z.strictObject({ index, title: prose(80), explanation, takeaways });
const patch = z.strictObject({
  index,
  explanation: explanation.optional(),
  takeaways: takeaways.optional(),
});
const patchResult = z.strictObject({
  patches: z.array(patch).min(1).max(30).refine(uniqueIndices),
});

export const ordinaryLessonPlanRevisePayload = z.strictObject({
  artifactType: z.literal('lesson-plan'),
  artifactId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  expectedRevision: z.number().int().positive(),
  ordinaryLessonPlanRevisionModel: z.string().min(1).max(128),
  instruction: prose(1600),
  sections: z.array(section).min(1).max(30).refine(uniqueIndices),
});

const system = [
  ordinaryTeachingRules,
  '按教师要求修订现有普通教案的讲解或要点。小节标题与现有讲解、要点仅供参考。',
  '只改需要修改的字段。保留现有小节标题、顺序及其他内容。使用所给的 index，不得新增小节。',
  '只返回 JSON {"patches":[{"index":0,"explanation":"不超过180字的讲解","takeaways":["不超过64字的要点"]}]}。',
  '每个修改的小节只返回一次且至少包含一个改动的字段。需要修改要点时提供该节完整的1至4条要点。',
].join('\n');

export class InvalidLessonPlanRevision extends Error {}

export async function reviseOrdinaryLessonPlan(
  { instruction, sections }: z.infer<typeof ordinaryLessonPlanRevisePayload>,
  model: { turn: HarnessTurn; modelId: string; signal: AbortSignal },
) {
  const response = await model.turn(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ instruction, sections }) },
    ],
    model.signal,
  );
  await recordHarnessUsage(response, ordinaryLessonPlanReviseMode);
  const {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens,
  } = response.usage ?? {};
  if (
    response.model !== model.modelId ||
    inputTokens === undefined ||
    inputTokens <= 0 ||
    outputTokens === undefined ||
    outputTokens <= 0 ||
    !Number.isSafeInteger(inputTokens + outputTokens) ||
    (total_tokens !== undefined && total_tokens !== inputTokens + outputTokens)
  ) {
    throw new Error('Ordinary lesson plan revision lacks a pinned model and measured usage');
  }

  let value: unknown;
  try {
    if (response.text.length <= 60_000) value = JSON.parse(response.text);
  } catch {
    throw new InvalidLessonPlanRevision();
  }
  const parsed = patchResult.safeParse(value);
  const byIndex = new Map(sections.map((section) => [section.index, section]));
  if (
    !parsed.success ||
    parsed.data.patches.some(({ index, explanation, takeaways }) => {
      const previous = byIndex.get(index);
      return (
        !previous ||
        (explanation === undefined && takeaways === undefined) ||
        explanation === previous.explanation ||
        (takeaways !== undefined &&
          JSON.stringify(takeaways) === JSON.stringify(previous.takeaways))
      );
    })
  ) {
    throw new InvalidLessonPlanRevision();
  }
  return {
    result: parsed.data,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  };
}

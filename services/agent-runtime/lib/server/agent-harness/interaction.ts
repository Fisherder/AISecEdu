import { AGENT_HARNESS_VERSION } from './prompt-assembly';

export type AgentQuestion = { id: string; text: string; choices: string[]; allowFreeText: true };
export type AgentInteraction = {
  version: typeof AGENT_HARNESS_VERSION;
  state: 'awaiting-input' | 'awaiting-choice' | 'executing' | 'complete';
  questions: AgentQuestion[];
};

export function normalizeAgentQuestions(value: unknown): AgentQuestion[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 3) throw new Error('Agent questions must contain at most three questions');
  const ids = new Set<string>();
  return value.map(raw => {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || ids.has(id) || !text || text.length > 300)
      throw new Error('Each question needs a unique ID and a concise question');
    ids.add(id);
    const choices = item.choices ?? [];
    if (!Array.isArray(choices) || choices.length > 3 || choices.some(choice => typeof choice !== 'string' || !choice.trim() || choice.length > 120))
      throw new Error('Question choices must contain at most three short labels');
    const normalized = choices.map(choice => (choice as string).trim());
    if (new Set(normalized).size !== normalized.length) throw new Error('Question choices must be distinct');
    return { id, text, choices: normalized, allowFreeText: true };
  });
}

/**
 * A model occasionally says that work is blocked and asks for a decision in
 * prose while returning questions: []. Recover that explicit request as a
 * durable question so the UI can pause and the reply binds to the same task.
 * This is intentionally conservative: completed work and optional follow-up
 * suggestions must never turn into an unsolicited dialog.
 */
export function recoverUnstructuredAgentQuestion(result: Record<string, unknown>): AgentQuestion[] {
  if (Array.isArray(result.questions) && result.questions.length) return [];
  if (result.generationOptions ||
      (Array.isArray(result.toolProposals) && result.toolProposals.length) ||
      (Array.isArray(result.deliverables) && result.deliverables.length)) return [];
  const answer = typeof result.answer === 'string' ? result.answer : '';
  if (!/(?:卡在|无法(?:唯一)?确定|还不能(?:开始|继续|生成)|不能(?:安全地)?(?:开始|继续|生成)|缺少(?:关键|必要)?信息|尚未(?:提供|确定)|无法匹配|不存在.{0,35}(?:课程|章节))/.test(answer)) return [];
  const requests = [...answer.matchAll(/请(?:你|您)?(?:先|再)?(?:确认|选择|选一下|提供|补充|明确|告诉我|指出)[^。！？\n]{0,120}/g)];
  const request = requests.at(-1)?.[0]?.split(/[，,；;]/)[0]?.trim();
  if (!request || request.length < 5) return [];
  const courseBlocked = /(?:课程|章节)/.test(request) && /(?:课程|章节)/.test(answer);
  const text = courseBlocked
    ? '请确认这项内容要关联到哪门已有课程及章节；如果目标课程尚未创建，请说明是否先创建。'
    : request.replace(/[。？！?]+$/, '') + '？';
  return [{id: 'missing_decision', text: text.slice(0, 300), choices: [], allowFreeText: true}];
}

export function agentInteraction(result: Record<string, unknown>): AgentInteraction {
  const questions = normalizeAgentQuestions(result.questions);
  const hasOptions = !!result.generationOptions;
  const hasTools = Array.isArray(result.toolProposals) && result.toolProposals.length > 0;
  const hasFiles = Array.isArray(result.deliverables) && result.deliverables.length > 0;
  if (questions.length && (hasOptions || hasTools || hasFiles))
    throw new Error('A request for user input cannot also execute dependent actions');
  return {
    version: AGENT_HARNESS_VERSION,
    state: hasOptions ? 'awaiting-choice' : questions.length ? 'awaiting-input' : hasTools ? 'executing' : 'complete',
    questions,
  };
}

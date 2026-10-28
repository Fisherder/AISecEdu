import { normalizeAgentQuestions, type AgentQuestion } from './interaction';

export type TeacherIntent = 'answer' | 'plan' | 'create' | 'revise' | 'operate';
export type TeacherIntentDecision = {
  version: 'teacher-intent-v1';
  intent: TeacherIntent;
  executionMode: 'ask' | 'plan' | 'execute';
  request: string;
  sourceRefs: string[];
  clarification: {
    state: 'awaiting-input' | 'confirmed' | 'not-required';
    summary: string;
    round: number;
    questions: AgentQuestion[];
  };
};

export class TeacherIntentError extends Error {
  name = 'TeacherIntentError';
}

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any> : null;
}

export const TEACHER_INTENT_POLICY = `你根据教师本轮自然语言、明确采用的历史来源和真实上下文判断任务，不依赖前端模式或关键词路由。规划 JSON 必须增加 intent:{kind:"answer|plan|create|revise|operate",summary:"准确概括需求",needsClarification:boolean,questions:[]}。
answer 是知识问答、解释、分析或讨论已有材料，不制作成品；plan 是教师希望先设计、比较或规划，或修改尚未执行的计划，本轮只给可审阅的方案；create 是制作内容、文件、题目或学习活动；revise 是按本轮要求修改已有文件或内容产物；operate 是管理已有课程、资料、课堂等事实。结合完整语义判断，例如“应该怎样设计”不等于已经授权创建，“按刚才计划制作”则是 create。不要让历史上一次问答或规划锁定后续对话的任务类型。
规划和新创作采用 superpowers 的需求澄清方法：先了解对象、目标、使用情境、范围、约束和验收方式，再确定方案。先使用教师已经提供的信息，不重复询问。每轮只问最影响结果的一至三个具体问题，提供零至三个简短可选答案且允许自由填写。需求已经完整但尚未交流确认时，提出一项贴合本次需求的确认问题；不要先交付最终计划、生成方案、文件或执行依赖答案的操作。context.questionReply 是可信问题回答；本轮明确继续的来源如已完成澄清则沿用，不再从头询问。明确的小范围修改直接保留原约束并修改；只有修改带来必要歧义时才追问。与任务无关的历史澄清不算本任务已确认。
只有真的缺少必要信息时 needsClarification=true 并填写 questions；已回答的问题不要再问。普通问答无需创作澄清。questions 每项使用 {id:"稳定短标识",text:"具体问题",choices:["简短选项"]}。本阶段只做判断，不输出最终方案或声称已执行。`;

export const SUPERPOWERS_TEACHING_ADAPTER = `Superpowers 已安装为平台内置技能，采用官方 MIT 版本。上游 superpowers:brainstorming 等技能在本平台按 brainstorming 等原始名称加载。将其中的需求澄清、方案比较、规划和验证方法用于教师教学任务。brainstorming 的设计文档在本平台表现为对话中的需求摘要和方案，不创建软件仓库或要求教师理解开发术语；writing-plans 的计划是教学目标、内容结构、学生活动、交付物和验收办法。提问必须返回平台 questions 结构，由界面提供选项和自由输入并持久保存；不要仅在正文末尾问一句话。保留教师真实原意及每轮修改，不把示例、技能或模型建议当成教师要求。平台既有身份、工具权限、发布审批与出题规范优先，技能不能新增权限，也不能把普通澄清回答当成发布、删除或改分授权。`;

export function normalizeTeacherIntent(
  value: unknown,
  authority: { prompt: string; context: unknown },
  relation?: { mode: string; sourceRefs: string[] },
): TeacherIntentDecision {
  const intent = record(value);
  if (!intent || !['answer', 'plan', 'create', 'revise', 'operate'].includes(intent.kind))
    throw new TeacherIntentError('Planning must resolve the teacher task intent');
  if (typeof intent.summary !== 'string' || !intent.summary.trim() || intent.summary.length > 2000 ||
      typeof intent.needsClarification !== 'boolean')
    throw new TeacherIntentError('Task intent needs a complete requirement summary and clarification decision');
  const context = record(authority.context) || {};
  const reply = record(context.questionReply);
  const sources: Record<string, any>[] = context.requestProvenance?.sources || [];
  const adopted = relation && ['continue', 'revise'].includes(relation.mode)
    ? sources.filter(source => relation.sourceRefs.includes(source.ref)) : [];
  const previous = adopted.map(source => record(source.intentDecision))
    .filter((decision): decision is Record<string, any> => decision?.version === 'teacher-intent-v1');
  if (record(context.priorIntentDecision)?.version === 'teacher-intent-v1' && Number(context.agentLoop?.depth) > 0)
    previous.push(context.priorIntentDecision);
  const prior = previous.at(-1);
  const answered = Array.isArray(reply?.answers) ? reply.answers : [];
  const asksToAdjust = answered.at(-1)?.answer === '我还要补充或调整';
  const hasReply = !asksToAdjust && (answered.length > 0 || previous.some(decision => decision.clarification?.state === 'awaiting-input'));
  const confirmed = previous.some(decision => decision.clarification?.state === 'confirmed') || !!record(context.approvedPlan);
  let questions: AgentQuestion[];
  try {
    questions = normalizeAgentQuestions(intent.questions);
  } catch (error) {
    throw new TeacherIntentError(error instanceof Error ? error.message : 'Invalid clarification questions');
  }
  questions = questions.filter(question => !answered.some((answer: any) => answer.question === question.text));
  const required = intent.kind === 'plan' || intent.kind === 'create' || intent.needsClarification;
  const waiting = questions.length > 0 || (required && !hasReply && !confirmed);
  if (waiting && !questions.length) questions = [{
    id: asksToAdjust ? 'requirement_changes' : 'confirm_requirements',
    text: asksToAdjust ? '你希望补充或调整哪些要求？' : `我理解的需求是：${intent.summary.trim().slice(0, 230)}。是否按此继续，或还有需要调整的条件？`,
    choices: asksToAdjust ? [] : ['按这些要求继续', '我还要补充或调整'],
    allowFreeText: true,
  }];
  const original = typeof prior?.request === 'string' && relation?.mode !== 'new-request'
    ? prior.request : null;
  const request = original && original !== authority.prompt
    ? `${original}\n\n教师本轮补充或修改：\n${authority.prompt}` : authority.prompt;
  if (!request.trim() || request.length > 48000) throw new TeacherIntentError('Complete teacher requirements exceed the context limit');
  const mode = intent.kind === 'answer' ? 'ask' : intent.kind === 'plan' ? 'plan' : 'execute';
  return {
    version: 'teacher-intent-v1', intent: intent.kind, executionMode: mode, request,
    sourceRefs: relation?.sourceRefs || [],
    clarification: {
      state: waiting ? 'awaiting-input' : required || confirmed || hasReply ? 'confirmed' : 'not-required',
      summary: intent.summary.trim(),
      round: Math.min(24, Math.max(Number(reply?.round || 0), Number(prior?.clarification?.round || 0)) + (waiting ? 1 : 0)),
      questions: waiting ? questions : [],
    },
  };
}

export function applyTeacherIntent(result: Record<string, unknown>, decision: TeacherIntentDecision) {
  const questions = normalizeAgentQuestions(result.questions);
  if (questions.length && decision.clarification.state !== 'awaiting-input')
    decision = { ...decision, clarification: { ...decision.clarification, state: 'awaiting-input', questions } };
  const waiting = decision.clarification.state === 'awaiting-input';
  const readOnly = waiting || decision.executionMode !== 'execute';
  return {
    ...result, executionMode: decision.executionMode, intentDecision: decision,
    ...(readOnly ? { toolProposals: [], generationOptions: null, deliverables: [] } : {}),
    ...(waiting ? {
      answer: `${decision.clarification.summary}\n\n先确认下面的问题，再继续确定方案。`,
      plan: [], suggestions: [], questions: decision.clarification.questions,
      requiresAction: true,
      interaction: { state: 'awaiting-input', questions: decision.clarification.questions },
    } : {}),
  };
}

import type { AgentSkill, AgentSkillSummary } from '@/lib/server/agent-skills';
import { CINEMATIC_CAPABILITY_BRIEF, CINEMATIC_CAMERA_PLAYBACK_BRIEF, CINEMATIC_TEACHING_PURPOSE_BRIEF } from '@/lib/cinematic/capabilities';
import { CINEMATIC_AUTONOMOUS_DESIGN_BRIEF } from '@/lib/cinematic/design-policy';
import { COURSEWARE_PLANNING_BRIEF } from '@/lib/courseware/schema';
import { LEARNER_LANGUAGE_BRIEF } from '@/lib/teaching/learner-language';
import {
  parseSlideDeckPageRequirement,
  slideDeckPageInstruction,
} from '@/lib/server/slide-page-policy';

export type TeacherAgentPlan = {
  understanding: string;
  selectedSkills: string[];
  plan: string[];
  generationTarget?: TeacherGenerationTarget | null;
  generationScope?: TeacherGenerationScopeResolution | null;
  requestRelation?: TeacherRequestRelation;
};

export type TeacherRequestRelation = {
  mode: 'new-request' | 'continue' | 'revise' | 'clarify';
  sourceRefs: string[];
  evidence: string;
};

type TeacherRequestAuthority = { prompt: string; context: unknown };

import { teacherAgentPlanningPrompt, teacherAgentExecutionPrompt } from './agent-harness/teacher-prompts';
import { agentInteraction, normalizeAgentQuestions } from './agent-harness/interaction';

function teacherRequestSources(context: unknown): Record<string, unknown>[] {
  const value = recordValue(context) || {};
  const provenance = recordValue(value.requestProvenance);
  const sources =
    provenance?.version === 'teacher-request-v1' && Array.isArray(provenance.sources)
      ? provenance.sources
          .map(recordValue)
          .filter((item): item is Record<string, unknown> => !!item)
      : [];
  const validated = sources.filter((source) => {
    if (source.kind === 'generation-option')
      return (
        source.authorship === 'model' &&
        Number.isInteger(source.sourceMessageId) &&
        typeof source.sourceJobId === 'string' &&
        !!source.sourceJobId &&
        typeof source.optionId === 'string' &&
        source.ref === `option:${source.sourceMessageId}:${source.optionId}` &&
        typeof source.content === 'string'
      );
    return (
      ['teacher-message', 'assistant-message'].includes(String(source.kind)) &&
      source.authorship === (source.kind === 'teacher-message' ? 'teacher' : 'model') &&
      Number.isInteger(source.messageId) &&
      source.ref === `message:${source.messageId}` &&
      typeof source.content === 'string' &&
      source.messageId !== provenance?.currentMessageId
    );
  });
  const artifacts = recordValue(recordValue(value.platformFacts)?.artifacts);
  for (const list of [artifacts?.currentConversation, artifacts?.recent]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const artifact = recordValue(item);
      if (typeof artifact?.id !== 'string' || !artifact.id) continue;
      const ref = `artifact:${artifact.id}`;
      if (!validated.some((source) => source.ref === ref))
        validated.push({
          ref,
          kind: 'artifact',
          authorship: 'model',
          title: artifact.title,
          artifactId: artifact.id,
        });
    }
  }
  const refs = validated.map((source) => source.ref);
  if (new Set(refs).size !== refs.length)
    throw new Error('Request provenance contains duplicate source IDs');
  return validated;
}

export class TeacherRequestRelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeacherRequestRelationError';
  }
}

export class InvalidTeacherSourceReferenceError extends TeacherRequestRelationError {
  name = 'InvalidTeacherSourceReferenceError';
}

function teacherInstructionEvidence(prompt: string, evidence: unknown): string {
  if (typeof evidence !== 'string' || !evidence.trim()) return '';
  if (prompt.includes(evidence)) return evidence;
  const characters: string[] = [];
  const positions: Array<{ start: number; end: number }> = [];
  const ignored = /[\s,.;:!?"'，。！？；：“”‘’、]/u;
  let offset = 0;
  for (const character of prompt) {
    const normalized = character.normalize('NFKC');
    if (!ignored.test(normalized)) {
      for (const part of normalized) {
        characters.push(part);
        positions.push({ start: offset, end: offset + character.length });
      }
    }
    offset += character.length;
  }
  const quoted = Array.from(evidence.normalize('NFKC')).filter(character => !ignored.test(character)).join('');
  if (!quoted) return '';
  const normalizedPrompt = characters.join('');
  const found = normalizedPrompt.indexOf(quoted);
  if (found < 0) return '';
  const start = Array.from(normalizedPrompt.slice(0, found)).length;
  const end = start + Array.from(quoted).length - 1;
  return prompt.slice(positions[start].start, positions[end].end);
}

export function normalizeTeacherRequestRelation(
  value: unknown,
  authority: TeacherRequestAuthority,
): TeacherRequestRelation {
  const relation = recordValue(value);
  const mode = relation?.mode;
  if (!['new-request', 'continue', 'revise', 'clarify'].includes(String(mode)))
    throw new TeacherRequestRelationError('Planning requires requestRelation.mode and verified sourceRefs');
  const refs = relation?.sourceRefs;
  if (
    !Array.isArray(refs) ||
    refs.some((ref) => typeof ref !== 'string') ||
    new Set(refs).size !== refs.length
  )
    throw new TeacherRequestRelationError('requestRelation.sourceRefs must be a unique array of server source IDs');
  const sources = teacherRequestSources(authority.context);
  if (refs.some((ref) => !sources.some((source) => source.ref === ref)))
    throw new InvalidTeacherSourceReferenceError('requestRelation references a missing or unverified source');
  let evidence = typeof relation?.evidence === 'string' ? relation.evidence : '';
  if (mode === 'new-request' || mode === 'clarify') {
    if (refs.length)
      throw new TeacherRequestRelationError('A new request or ambiguous reference cannot adopt historical model drafts');
  } else {
    evidence = teacherInstructionEvidence(authority.prompt, evidence);
    if (!refs.length || !evidence)
      throw new TeacherRequestRelationError(
        'Continuation needs sourceRefs and an exact quote of the current teacher instruction',
      );
    if (
      sources
        .filter((source) => refs.includes(source.ref))
        .some(
          (source) =>
            authority.prompt.trim() === String(source.originalRequest || '').trim() ||
            (source.kind === 'teacher-message' &&
              authority.prompt.trim() === String(source.content).trim()),
        )
    )
      throw new TeacherRequestRelationError(
        'Repeating a complete original request is new-request, not renewed adoption of an old rewrite',
      );
  }
  return { mode: mode as TeacherRequestRelation['mode'], sourceRefs: refs as string[], evidence };
}

export function teacherAgentContextForPrompt(
  context: unknown,
  prompt: string,
  relation?: TeacherRequestRelation,
): Record<string, unknown> {
  const value = recordValue(context) || {};
  const sources = teacherRequestSources(context);
  const facts = structuredClone(recordValue(value.platformFacts) || {});
  const artifacts = recordValue(facts.artifacts);
  if (artifacts) {
    const keys = [
      'id',
      'title',
      'type',
      'artifactType',
      'status',
      'created',
      'updated',
      'currentConversation',
      'publishedChallengeId',
      'runtimeEnvironment',
    ];
    for (const key of ['recent', 'currentConversation'])
      if (Array.isArray(artifacts[key]))
        artifacts[key] = artifacts[key].map((item) => {
          const artifact = recordValue(item) || {};
          const summary = Object.fromEntries(
            keys.filter((name) => name in artifact).map((name) => [name, artifact[name]]),
          );
          // The API's revision is an envelope (including full audit history),
          // not a number. A catalogue supplies identity/version; full content
          // is resolved only for a teacher-authorized source, never inherited.
          const revision = typeof artifact.currentRevision === 'number'
            ? artifact.currentRevision
            : typeof artifact.revision === 'number'
              ? artifact.revision : recordValue(artifact.revision)?.revision;
          if (typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1)
            summary.revision = revision;
          return summary;
        });
  }
  const selected = relation
    ? normalizeTeacherRequestRelation(relation, { prompt, context })
    : undefined;
  const adopted = selected
    ? sources.filter((source) => selected.sourceRefs.includes(String(source.ref)))
    : [];
  const sourceIndex = sources.map((source) => {
    const { content, ...index } = source;
    delete index.originalRequest;
    return { ...index, ...(source.authorship === 'teacher' ? { content } : {}) };
  });
  const thread = recordValue(value.thread) || {};
  const threadFacts = Object.fromEntries(
    ['pendingAttachments', 'referenceId', 'dojoId', 'moduleIndex', 'phase']
      .filter((key) => key in thread)
      .map((key) => [key, thread[key]]),
  );
  return {
    phase: value.phase,
    thread: threadFacts,
    platformFacts: facts,
    agentLoop: value.agentLoop,
    steering: value.steering,
    // The owned API binds these answers to the original request. Keep that
    // binding through provenance filtering, rather than prompting on an orphan answer.
    questionReply: value.questionReply,
    approvedPlan: value.approvedPlan,
    requestAuthority: {
      version: 'teacher-request-v1',
      currentRequest: prompt,
      relation: selected,
      ...(selected ? { adoptedSources: adopted } : { sourceIndex }),
    },
    conversation: selected
      ? []
      : Array.isArray(value.conversation)
        ? value.conversation.map((raw) => {
            const message = recordValue(raw) || {};
            return {
              id: message.id,
              origin: message.origin || 'legacy-authorship-unknown',
              sourceRef: message.sourceRef,
            };
          })
        : [],
  };
}

export type TeacherGenerationTarget = {
  targetTool: 'candidate.generate' | 'challenge.generate';
  artifactType:
    | 'slide-deck'
    | 'attack-defense-scene'
    | 'simulation'
    | 'debate'
    | 'roleplay'
    | 'ctf-challenge';
  reason: string;
};

export type TeacherGenerationOption = {
  id: string;
  title: string;
  description: string;
  highlights: string[];
  rewrittenPrompt: string;
};

export type TeacherGenerationBoundScope = {
  referenceId: string;
  moduleIndex: number | null;
  courseName: string;
  moduleName: string | null;
};

export type TeacherGenerationScopeResolution = {
  status: 'bound' | 'unscoped' | 'ambiguous';
  boundScope: TeacherGenerationBoundScope | null;
  reason: string;
};

export type TeacherGenerationOptions = TeacherGenerationTarget & {
  boundScope: TeacherGenerationBoundScope | null;
  baseArguments: Record<string, unknown>;
  options: TeacherGenerationOption[];
};

const FILE_FORMATS = new Set(['docx', 'md', 'txt', 'json', 'csv', 'html', 'ipynb']);
const FILE_DELIVERY_SKILLS = new Set(['downloadable-file-delivery', 'lesson-plan-file']);
const GENERATION_OPTION_TOOLS = new Set(['candidate.generate', 'challenge.generate']);
const GENERATION_OPTION_ARTIFACT_TYPES = new Set([
  'slide-deck',
  'attack-defense-scene',
  'simulation',
  'debate',
  'roleplay',
  'ctf-challenge',
]);

const PRODUCTION_SKILL_BY_ARTIFACT_TYPE: Record<TeacherGenerationTarget['artifactType'], string> = {
  'slide-deck': 'teaching-slide-deck',
  'ctf-challenge': 'ctf-flag-challenge',
  simulation: 'cyber-lab-simulation',
  'attack-defense-scene': 'cyber-lab-simulation',
  debate: 'backwards-design-unit-planner',
  roleplay: 'backwards-design-unit-planner',
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeFilename(filename: string, format: string): string {
  const cleaned = filename
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const base = cleaned || `教学文件.${format}`;
  return base.toLowerCase().endsWith(`.${format}`) ? base : `${base}.${format}`;
}

const MIN_DELIVERABLE_BODY_CHARS = 24;

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trustedAvailableCourses(
  platformFacts?: Record<string, unknown> | null,
): Record<string, unknown>[] | null {
  if (!Array.isArray(platformFacts?.availableCourses)) return null;
  return platformFacts.availableCourses
    .map((item) => recordValue(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function normalizeTeacherGenerationBoundScope(
  value: unknown,
  platformFacts?: Record<string, unknown> | null,
): TeacherGenerationBoundScope | null {
  const source = recordValue(value);
  if (!source) return null;
  const referenceId = String(source.referenceId || '').trim();
  if (!referenceId) return null;
  const rawModuleIndex = source.moduleIndex;
  const moduleIndex =
    rawModuleIndex === null || rawModuleIndex === undefined || rawModuleIndex === ''
      ? null
      : Number(rawModuleIndex);
  if (moduleIndex !== null && (!Number.isInteger(moduleIndex) || moduleIndex < 0)) return null;

  const availableCourses = trustedAvailableCourses(platformFacts);
  if (availableCourses) {
    const courses = availableCourses.filter(
      (course) => String(course.referenceId || '').trim() === referenceId,
    );
    if (courses.length !== 1) return null;
    const course = courses[0];
    const modules = Array.isArray(course.modules)
      ? course.modules
          .map((item) => recordValue(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    const trustedModule =
      moduleIndex === null
        ? null
        : (modules.find((item) => Number(item.index) === moduleIndex) ?? null);
    if (moduleIndex !== null && !trustedModule) return null;
    return {
      referenceId,
      moduleIndex,
      courseName: compactText(String(course.name || referenceId)),
      moduleName: trustedModule ? compactText(String(trustedModule.name || '')) || null : null,
    };
  }

  return {
    referenceId,
    moduleIndex,
    courseName: compactText(String(source.courseName || referenceId)),
    moduleName: moduleIndex === null ? null : compactText(String(source.moduleName || '')) || null,
  };
}

function normalizeTeacherGenerationScopeResolution(
  value: unknown,
  platformFacts?: Record<string, unknown> | null,
): TeacherGenerationScopeResolution | null {
  const source = recordValue(value);
  if (!source) return null;
  const status = String(source.status || '').trim();
  const reason = compactText(String(source.reason || '')).slice(0, 1_000);
  if (status === 'bound') {
    const boundScope = normalizeTeacherGenerationBoundScope(
      recordValue(source.boundScope) ?? source,
      platformFacts,
    );
    return boundScope ? { status, boundScope, reason } : null;
  }
  if (status === 'unscoped' || status === 'ambiguous') {
    return { status, boundScope: null, reason };
  }
  return null;
}

function currentTeacherGenerationBoundScope(
  platformFacts?: Record<string, unknown> | null,
): TeacherGenerationBoundScope | null {
  const course = recordValue(platformFacts?.course);
  const scope = recordValue(platformFacts?.scope);
  const referenceId = String(course?.referenceId || '').trim();
  if (!referenceId) return null;
  return normalizeTeacherGenerationBoundScope(
    { referenceId, moduleIndex: scope?.moduleIndex ?? null },
    platformFacts,
  );
}

function promptOverridesCurrentGenerationScope(
  originalPrompt: string,
  currentScope: TeacherGenerationBoundScope,
  platformFacts?: Record<string, unknown> | null,
): boolean {
  const prompt = compactText(originalPrompt);
  if (
    /(?:不(?:要|需|用)?|无需)(?:再)?(?:归属|关联|绑定|放入|加入).{0,8}(?:课程|章节|单元)|不属于.{0,8}(?:课程|章节|单元)|独立于.{0,8}(?:课程|章节|单元)/u.test(
      prompt,
    ) ||
    /(?:另一|其他|其它|别的|非当前|不是当前|切换到).{0,8}(?:课程|章节|单元)/u.test(prompt)
  ) {
    return true;
  }

  const courses = trustedAvailableCourses(platformFacts) ?? [];
  return courses.some((course) => {
    const referenceId = String(course.referenceId || '').trim();
    if (!referenceId || referenceId === currentScope.referenceId) return false;
    const courseName = compactText(String(course.name || ''));
    if (courseName.length >= 2 && prompt.includes(courseName)) return true;
    const modules = Array.isArray(course.modules)
      ? course.modules
          .map((item) => recordValue(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return modules.some((module) => {
      const moduleName = compactText(String(module.name || ''));
      return moduleName.length >= 2 && prompt.includes(moduleName);
    });
  });
}

function effectiveTeacherGenerationBoundScope(
  originalPrompt: string,
  plan: TeacherAgentPlan | null,
  fallbackScope: TeacherGenerationBoundScope | null,
  platformFacts?: Record<string, unknown> | null,
): TeacherGenerationBoundScope | null {
  if (plan?.generationScope?.status === 'bound') return plan.generationScope.boundScope;
  const currentScope = currentTeacherGenerationBoundScope(platformFacts);
  if (
    currentScope &&
    !promptOverridesCurrentGenerationScope(originalPrompt, currentScope, platformFacts)
  ) {
    return currentScope;
  }
  if (
    plan?.generationScope?.status === 'ambiguous' ||
    plan?.generationScope?.status === 'unscoped'
  ) {
    return null;
  }
  return fallbackScope ?? currentScope;
}

const CHINESE_SMALL_NUMBERS: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const COUNT_TOKEN_PATTERN = '[0-9０-９]{1,2}|[一二两三四五六七八九十]{1,3}';
const QUESTION_NOUN_PATTERN =
  '(?:(?:完整|原生|独立)(?:的)?\\s*)*(?:(?:Linux|Windows(?:\\s*1[01])?)\\s*)?(?:CTF(?:\\s*实践)?题?|实践题|挑战题|题目|问题|选择题|判断题|简答题|练习题|测试题|测验题|考题|题)';

function parseChineseCountToken(value: string): number | null {
  const normalized = value.replace(/[０-９]/g, (token) => String(token.charCodeAt(0) - 0xff10));
  if (/^\d{1,2}$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  if (normalized === '十') return 10;
  const tens = normalized.match(/^([一二两三四五六七八九])?十([一二两三四五六七八九])?$/);
  if (tens) {
    const leading = tens[1] ? CHINESE_SMALL_NUMBERS[tens[1]] : 1;
    const trailing = tens[2] ? CHINESE_SMALL_NUMBERS[tens[2]] : 0;
    return leading * 10 + trailing;
  }
  return CHINESE_SMALL_NUMBERS[normalized] ?? null;
}

export function requestedQuestionCount(prompt: string): number | null {
  const normalized = compactText(prompt);
  const counts: Array<{ offset: number; count: number }> = [];
  const patterns = [
    new RegExp(
      `(${COUNT_TOKEN_PATTERN})\\s*(?:道|个|项)?\\s*(?:彼此\\s*)?(?:独立(?:的)?)?\\s*${QUESTION_NOUN_PATTERN}`,
      'giu',
    ),
    new RegExp(
      `${QUESTION_NOUN_PATTERN}\\s*(?:共|总共|合计|一共)\\s*(?:有|包含)?\\s*(${COUNT_TOKEN_PATTERN})\\s*(?:道|个|项)?`,
      'giu',
    ),
    new RegExp(
      `${QUESTION_NOUN_PATTERN}[^。；，,]{0,12}(?:生成|创建|出|设计|编写|制作|准备)\\s*(${COUNT_TOKEN_PATTERN})\\s*(?:道|个|项)`,
      'giu',
    ),
    /\b([1-9]|1\d|20)\s+(?:independent\s+)?(?:ctf\s+)?(?:challenges?|questions?|problems?|exercises?)\b/giu,
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const prefix = normalized.slice(Math.max(0, match.index - 3), match.index);
      if (/第\s*$/u.test(prefix)) continue;
      const clausePrefix = normalized.slice(0, match.index).split(/[。；;\n，,]/u).at(-1) || '';
      if (/(?:不要|不是|并非|不能|勿|不(?:是|要)?把|避免)(?:生成|创建|出|设计|准备|变成|当成|当作|合并成|误算成)?\s*$/u.test(clausePrefix)) continue;
      // A negated transformation may have an object between the negative and
      // the target count: “不能把三个知识点拆成三道题”. It is not a batch request.
      const localClause = clausePrefix.split(/(?:而是|但是|不过|但(?:是)?|改为)/u).at(-1) || '';
      if (/(?:不要|不能|请勿|禁止|避免|不应)(?:把|将)?[^。；;\n，,]{0,60}(?:拆(?:分)?成|合并成|变成|改成|当成|当作|误算成|误认为|理解为|生成|创建|设计|出)\s*$/u.test(localClause)) continue;
      const suffix = normalized.slice(match.index + match[0].length);
      if (/^\s*(?:的\s*)?(?:(?:备选|候选|生成|设计)\s*)?(?:方案|选项|设计|思路|构思|规划)/u.test(suffix) ||
          /^\s+(?:(?:design|generation|alternative)\s+)?(?:options?|plans?|proposals?)\b/iu.test(suffix)) continue;
      const parsed = parseChineseCountToken(match[1]);
      if (parsed !== null) counts.push({ offset: match.index, count: parsed });
    }
  }
  // The brief is ordered from the original request to successive teacher edits.
  // Only explicit counts are candidates; a later actual change takes precedence.
  return counts.sort((a, b) => b.offset - a.offset)[0]?.count ?? null;
}

function requestedChallengeCount(prompt: string): number | null {
  const parsed = requestedQuestionCount(prompt);
  return parsed !== null && parsed <= 5 ? parsed : null;
}

function requestedChallengeTopics(prompt: string, challengeCount: number): string[] {
  if (challengeCount < 2 || challengeCount > 5) return [];
  const normalized = compactText(prompt);
  const topicList = normalized.match(
    /(?:分别\s*(?:围绕|聚焦|覆盖|涉及|包含)|主题\s*(?:分别\s*)?(?:为|是))\s*([^。；]+?)(?=(?:，|,)\s*(?:难度|其中|每(?:道|个|项)|各(?:道|个|项)|并且|同时|要求|需|必须|学生)|[。；]|$)/i,
  )?.[1];
  if (!topicList) return [];
  const topics = topicList
    .split(/\s*(?:、|，|,|；|;|以及|及|和)\s*/)
    .map((item) =>
      compactText(item)
        .replace(/^(?:第?[一二三四五1-5]\s*(?:道|个|项)?[：:、.)）]?\s*)/, '')
        .replace(/^[“”‘’'"《》]+|[“”‘’'"《》]+$/g, '')
        .trim(),
    )
    .filter((item) => item.length >= 2 && item.length <= 80);
  return topics.length === challengeCount && new Set(topics).size === challengeCount ? topics : [];
}

function requestedSingleChallengeTitle(prompt: string): string | null {
  const normalized = compactText(prompt);
  const match = normalized.match(
    /(?:题目(?:名称|标题)|题名|标题)\s*(?:必须\s*)?(?:严格\s*)?(?:使用|设为|定为|命名为|为|是)\s*[《“"']([^》”"']{2,128})[》”"']/u,
  );
  const title = compactText(match?.[1] || '').slice(0, 128);
  return title.length >= 2 ? title : null;
}

function normalizeHtmlContent(value: string): string {
  let content = value.replace(/\u0000/g, '').trim();
  const fenced = content.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) content = fenced.trim();
  const completeDocument = content.match(
    /(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*<\/html\s*>/i,
  )?.[0];
  return (completeDocument || content).trim();
}

function htmlVisibleText(value: string): string {
  const normalized = normalizeHtmlContent(value);
  const body = normalized.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? normalized;
  return compactText(
    body
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(
        /<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)\s*>/gi,
        ' ',
      )
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|#160);/gi, ' ')
      .replace(/&(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);/gi, 'x'),
  );
}

function collectDocumentBodyText(value: unknown): string {
  const document = recordValue(value);
  if (!document) return '';
  const sections = Array.isArray(document.sections) ? document.sections : [];
  const fragments: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      fragments.push(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const record = recordValue(item);
    if (record) Object.values(record).forEach(visit);
  };
  sections.forEach(visit);
  return compactText(fragments.join(' '));
}

function hasStructuredData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasStructuredData);
  const record = recordValue(value);
  return Boolean(record && Object.values(record).some(hasStructuredData));
}

function normalizeGenerationTarget(value: unknown): TeacherGenerationTarget | null {
  const target = recordValue(value);
  if (!target) return null;
  const targetTool = String(target.targetTool || '').trim();
  const artifactType = String(target.artifactType || '')
    .trim()
    .toLowerCase();
  if (!GENERATION_OPTION_TOOLS.has(targetTool)) return null;
  if (!GENERATION_OPTION_ARTIFACT_TYPES.has(artifactType)) return null;
  if (targetTool === 'challenge.generate' && artifactType !== 'ctf-challenge') return null;
  if (targetTool === 'candidate.generate' && artifactType === 'ctf-challenge') return null;
  return {
    targetTool: targetTool as TeacherGenerationTarget['targetTool'],
    artifactType: artifactType as TeacherGenerationTarget['artifactType'],
    reason: compactText(String(target.reason || '')).slice(0, 1_000),
  };
}

function normalizeGenerationBaseArguments(
  value: unknown,
  target: TeacherGenerationTarget,
): Record<string, unknown> {
  const source = recordValue(value) ?? {};
  const normalized: Record<string, unknown> = {};
  if (target.targetTool === 'challenge.generate') {
    const moduleIndex = Number(source.moduleIndex);
    if (Number.isInteger(moduleIndex) && moduleIndex >= 0) normalized.moduleIndex = moduleIndex;
    const challengeCount = Number(source.challengeCount);
    if (Number.isInteger(challengeCount) && challengeCount >= 1) {
      normalized.challengeCount = Math.min(5, challengeCount);
    }
    const difficulty = compactText(String(source.difficulty || '')).slice(0, 80);
    if (difficulty) normalized.difficulty = difficulty;
    const constraints = recordValue(source.constraints);
    if (constraints) {
      try {
        const encoded = JSON.stringify(constraints);
        if (encoded.length <= 16_000) normalized.constraints = JSON.parse(encoded);
      } catch {
        // Ignore malformed model data; the selected prompt remains authoritative.
      }
    }
  }
  return normalized;
}

export function normalizeTeacherGenerationOptions(
  value: unknown,
  platformFacts?: Record<string, unknown> | null,
): TeacherGenerationOptions | null {
  const source = recordValue(value);
  const target = normalizeGenerationTarget(source);
  if (!source || !target || !Array.isArray(source.options) || source.options.length !== 3) {
    return null;
  }
  const boundScope =
    source.boundScope === null || source.boundScope === undefined
      ? null
      : normalizeTeacherGenerationBoundScope(source.boundScope, platformFacts);
  if (source.boundScope !== null && source.boundScope !== undefined && !boundScope) return null;
  const options: TeacherGenerationOption[] = [];
  const fingerprints = new Set<string>();
  for (let index = 0; index < source.options.length; index += 1) {
    const raw = recordValue(source.options[index]);
    if (!raw) return null;
    const title = compactText(String(raw.title || '')).slice(0, 120);
    const description = compactText(String(raw.description || '')).slice(0, 2_000);
    const rewrittenPrompt = String(raw.rewrittenPrompt || '')
      .replace(/\u0000/g, '')
      .trim();
    if (rewrittenPrompt.length > 14_000)
      throw Error('Generation proposal exceeds the 14000-character prompt limit; compact the complete proposal without dropping requirements');
    const highlights = Array.isArray(raw.highlights)
      ? raw.highlights
          .filter((item): item is string => typeof item === 'string')
          .map((item) => compactText(item).slice(0, 300))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    if (
      title.length < 2 ||
      description.replace(/\s+/g, '').length < 24 ||
      rewrittenPrompt.replace(/\s+/g, '').length < 80 ||
      highlights.length < 2
    ) {
      return null;
    }
    const fingerprint = compactText(rewrittenPrompt).toLocaleLowerCase();
    if (fingerprints.has(fingerprint)) return null;
    fingerprints.add(fingerprint);
    options.push({
      id: `option-${index + 1}`,
      title,
      description,
      highlights,
      rewrittenPrompt,
    });
  }
  return {
    ...target,
    boundScope,
    baseArguments: normalizeGenerationBaseArguments(source.baseArguments, target),
    options,
  };
}

function generationProposalTarget(result: Record<string, unknown>): {
  target: TeacherGenerationTarget;
  baseArguments: Record<string, unknown>;
  prompt: string;
} | null {
  const proposals = Array.isArray(result.toolProposals) ? result.toolProposals : [];
  for (const value of proposals) {
    const proposal = recordValue(value);
    const tool = String(proposal?.tool || '');
    if (!GENERATION_OPTION_TOOLS.has(tool)) continue;
    const args = recordValue(proposal?.arguments) ?? {};
    const artifactType =
      tool === 'challenge.generate'
        ? 'ctf-challenge'
        : String(args.artifactType || '')
            .trim()
            .toLowerCase();
    const target = normalizeGenerationTarget({
      targetTool: tool,
      artifactType,
      reason: String(proposal?.reason || ''),
    });
    if (!target) continue;
    return {
      target,
      baseArguments: normalizeGenerationBaseArguments(args, target),
      prompt: String(args.prompt || args.brief || '').trim(),
    };
  }
  return null;
}

function generationOptionTemplates(target: TeacherGenerationTarget): Array<{
  title: string;
  description: string;
  highlights: string[];
  instruction: string;
}> {
  if (target.artifactType === 'simulation') {
    return [
      {
        title: '整体关系与重点观察',
        description:
          '先展示原需求中各主体的整体关系，再围绕关键细节引导观察，始终保留局部与整体的联系。',
        highlights: [
          '完整保留教师要求的主体和关系',
          '从整体进入重点细节',
          '按实际已有控件组织观察',
        ],
        instruction:
          '以整体到局部组织原主题，不增添无关内容或不存在的操作承诺。明确区分真实交互、预设过程和概念示意。',
      },
      {
        title: '过程推进与阶段对照',
        description: '沿原需求已有的步骤推进，在关键阶段对照前后差异，解释各步骤之间的联系。',
        highlights: ['步骤与实际可见状态对应', '保留合理的暂停观察阶段', '对照变化前后的同一主体'],
        instruction: '按原主题的真实教学步骤组织，不凭空加入成功失败状态、参数分支或攻击防护场景。',
      },
      {
        title: '问题引导与自主观察',
        description: '围绕教师原要求设计观察问题，让学习者使用现有交互寻找依据，再回到完整解释。',
        highlights: [
          '问题对应原要求中的结构或过程',
          '操作与可观察证据一致',
          '用整体回顾联系各观察点',
        ],
        instruction:
          '用提问引导原需求中已经支持的观察或操作，不承诺新的评分、状态开关或任意模型内部操作。',
      },
    ];
  }
  if (target.artifactType === 'slide-deck') {
    return [
      {
        title: '概念递进与可视化讲授',
        description:
          '从已有认知进入核心原理，逐层用结构图、对比表和短例题建立完整知识链，适合教师稳定讲授并随时检查理解。',
        highlights: [
          '先诊断基础再逐层解释',
          '每个概念都配视觉表达与检查问题',
          '结尾形成可直接使用的课堂小结',
        ],
        instruction: '采用概念递进结构，强调准确解释、视觉化关系和逐段理解检查。',
      },
      {
        title: '真实案例驱动与错误复盘',
        description:
          '以一个完整、授权且可讲清的安全案例贯穿课件，让学生从现象、证据和错误做法进入原理，再完成修复判断与迁移复盘。',
        highlights: [
          '用同一案例贯穿全部页面',
          '显式比较错误做法与正确做法',
          '包含证据分析、修复决策和迁移问题',
        ],
        instruction: '采用案例驱动结构，以现象—分析—修复—复盘形成叙事主线。',
      },
      {
        title: '任务挑战与课堂互动',
        description:
          '把课件组织成连续的课堂任务，教师用问题和小挑战推进内容，学生通过预测、讨论、操作判断和即时反馈主动建构理解。',
        highlights: [
          '每一阶段都有明确学生动作',
          '穿插预测、讨论和快速检测',
          '给出教师提示、反馈语和时间建议',
        ],
        instruction: '采用任务驱动结构，让讲授、互动、练习和反馈形成可执行的课堂节奏。',
      },
    ];
  }
  if (target.artifactType === 'ctf-challenge') {
    return [
      {
        title: '渐进式漏洞利用链',
        description:
          '通过信息收集、漏洞定位、利用验证和 Flag 获取四个递进阶段构造实践题，既保留真实攻防思路，也为学习者提供可控的难度坡度。',
        highlights: [
          '隔离且可重复的真实运行环境',
          '分阶段线索与失败反馈',
          '最终必须取得并提交动态 Flag',
        ],
        instruction: '设计为渐进式漏洞利用链，明确入口、证据、利用路径、卡点提示和动态 Flag 验证。',
      },
      {
        title: '事件调查与证据驱动',
        description:
          '把题目包装成一次安全事件调查，学生需要分析日志、流量或程序行为，建立证据链后完成利用或处置并获得 Flag。',
        highlights: [
          '以情境和证据推动解题',
          '包含可信干扰项但保持唯一验证路径',
          '完成场景目标后换取动态 Flag',
        ],
        instruction:
          '设计为事件调查型 CTF，要求学生基于可验证证据推进，并以动态 Flag 作为唯一完成凭证。',
      },
      {
        title: '攻防对照与修复验证',
        description:
          '让学生先复现漏洞影响，再实施防护或修复并验证差异，使题目同时覆盖攻击原理、工程修复和安全回归。',
        highlights: [
          '包含漏洞态与修复态的可观察差异',
          '攻击成功和修复有效均可验证',
          '最终从授权环境取得动态 Flag',
        ],
        instruction: '设计为攻防对照型 CTF，串联复现、利用、修复与回归验证，并坚持动态 Flag 判题。',
      },
    ];
  }
  if (target.artifactType === 'debate') {
    return [
      {title: '多方圆桌与条件共识', description: '学生加入多个有独立利益与证据立场的角色，点名追问、回应反例、形成有条件的共识。',
        highlights: ['角色之间回应具体分歧', '学生可指定对象和引用资料', '承认有效理由，保留未解决问题'],
        instruction: '使用 roundtable 多方圆桌，设计有真实利益差异的角色与可检验争点；主持人适时邀请不同角色，每次交还学生发言权。允许同环节连续追问、旁听交锋和提前复盘。时长与发言长度服从教师要求。'},
      {title: '决策听证与方案质询', description: '学生担任决策参与者，在专业人士、受影响群体和方案提出者的交锋中检验边界与代价。',
        highlights: ['明确决策、约束与利益关系', '允许指定角色接受质询', '依据学生表达和证据独立复盘'],
        instruction: '使用 hearing 决策听证赛制，配置有具体身份和不同立场的角色，围绕约束、方案代价、可改变结论的证据交锋。资料区分事实与教学假设，允许学生引用、质询和有根据地改变判断。'},
      {title: '苏格拉底追问与概念检验', description: '围绕学生自己的判断持续追问前提、反例与概念边界，避免预写答案或机械正反交替。',
        highlights: ['问题紧扣学生实际表达', '在同一争点连续深入', '用边界案例检验迁移能力'],
        instruction: '使用 socratic 苏格拉底形式，以学生的实际回答决定追问内容，检验前提、反例和条件，不替学生得出全部结论。允许连续追问和提前反思；环节数量、时长、每次回应长度均按教师要求配置。'},
    ];
  }
  if (target.artifactType === 'roleplay') {
    return [
      {
        title: '连续事件处置角色扮演',
        description:
          '让学习者在逐步升级的安全事件中承担明确角色，通过判断、沟通和行动推动情节，并根据每个关键决定获得即时反馈。',
        highlights: [
          '准备、扮演和复盘阶段完整',
          '关键节点都有可观察的角色行动',
          '反馈同时覆盖专业判断与沟通表现',
        ],
        instruction: '采用连续事件处置结构，明确场景、角色目标、分幕行动、分支反馈和复盘标准。',
      },
      {
        title: '多方协商与冲突化解',
        description:
          '以职责冲突和信息不对称推动角色互动，学习者需要提问、澄清、协商并形成可执行共识，适合训练跨团队沟通。',
        highlights: [
          '各角色有独立目标和隐含约束',
          '对话选择会改变后续情境',
          '以共识质量和过程证据进行评价',
        ],
        instruction: '采用多方协商结构，设计真实冲突、信息揭示、对话分支、成功条件和表现量规。',
      },
      {
        title: '客户沟通与决策分支',
        description:
          '围绕一次高压力沟通任务组织角色扮演，让学习者在不同回应之间做选择、观察关系与风险变化，并可重试比较策略。',
        highlights: [
          '学习者角色、对象角色和成功目标明确',
          '每幕包含有意义的选择与后果',
          '支持重置重试和策略对照复盘',
        ],
        instruction:
          '采用分支沟通结构，明确角色设定、分幕目标、选择后果、即时反馈和可重复练习机制。',
      },
    ];
  }
  return [
    {
      title: '教师引导演示与关键节点暂停',
      description:
        '按教师演示节奏组织场景，在关键状态转换处暂停并解释证据、风险和下一步，使复杂过程能够清晰投屏讲解。',
      highlights: [
        '明确初始状态与演示步骤',
        '关键节点提供暂停讲解和证据提示',
        '包含成功、失败和复盘状态',
      ],
      instruction: '采用教师引导演示路径，突出关键状态转换、证据解释和可重复复盘。',
    },
    {
      title: '学生决策分支与即时反馈',
      description:
        '把实训演示设计成可操作的决策场景，学生调整参数或选择动作后看到状态变化、反馈和后果，适合课堂互动。',
      highlights: [
        '提供多个有意义的可操作参数',
        '不同决策触发确定性的状态分支',
        '即时解释结果并允许重置重试',
      ],
      instruction: '采用学生决策分支路径，明确参数、动作、状态机、即时反馈和重置机制。',
    },
    {
      title: '攻击与防护前后对照',
      description:
        '用同一场景对照展示攻击前、攻击中、处置后和加固后的系统变化，让教师直观解释风险形成与防护效果。',
      highlights: [
        '同屏或分阶段比较攻防状态',
        '展示可观察指标和证据变化',
        '以验证任务和复盘问题收束',
      ],
      instruction: '采用攻防前后对照路径，突出拓扑、状态、可观察证据与防护效果验证。',
    },
  ];
}

export function fallbackTeacherGenerationOptions(
  originalPrompt: string,
  plan: TeacherAgentPlan | null,
  result: Record<string, unknown>,
): TeacherGenerationOptions | null {
  const proposal = generationProposalTarget(result);
  const target = proposal?.target ?? plan?.generationTarget ?? null;
  if (!target) return null;
  // A proposed tool prompt may be an old rewrite or an unexecuted model plan.
  // Never relabel it as the teacher's current original request.
  const basePrompt = compactText(originalPrompt || proposal?.prompt || '').slice(0, 8_000);
  if (!basePrompt) return null;
  const pageRequirement = parseSlideDeckPageRequirement(originalPrompt);
  const slideLayoutMinimum =
    pageRequirement.preferred >= 8
      ? 4
      : pageRequirement.preferred >= 5
        ? 3
        : pageRequirement.preferred >= 3
          ? 2
          : 1;
  const slideCheckMinimum =
    pageRequirement.preferred >= 8 ? 2 : pageRequirement.preferred >= 4 ? 1 : 0;
  const targetLabel =
    target.artifactType === 'slide-deck'
      ? '可直接授课的页面式课件'
      : target.artifactType === 'ctf-challenge'
        ? '可运行、可验证的 CTF 实践题'
        : target.artifactType === 'attack-defense-scene'
          ? '可交互的攻防拓扑演示'
          : target.artifactType === 'debate'
            ? '学生与AI对练的学习辩论'
            : target.artifactType === 'roleplay'
              ? '可交互的角色扮演活动'
              : '可操作的模拟实训演示';
  const options = generationOptionTemplates(target).map((template, index) => ({
    id: `option-${index + 1}`,
    title: template.title,
    description: template.description,
    highlights: template.highlights,
    rewrittenPrompt: [
      `请正式生成一份${targetLabel}。`,
      `教师原始要求：${basePrompt}`,
      `本方案采用“${template.title}”：${template.instruction}`,
      `方案说明：${template.description}`,
      '必须完整落实以下重点：',
      ...template.highlights.map((item) => `- ${item}`),
      target.artifactType === 'ctf-challenge'
        ? '- 题目必须运行在授权隔离环境，学生最终从环境取得并向平台提交动态 Flag；不得以 JSON、结论、明文或布尔值代替 Flag。'
        : target.artifactType === 'slide-deck'
          ? [
              `- ${slideDeckPageInstruction(pageRequirement)}这一页数规则优先于任何通用默认；目录、空白页、重复分隔页和占位页不计入页数。`,
              '- 先规划完整叙事，再逐页提供标题、教学目的、2–5 个具体要点、视觉表达、版式意图和教师讲稿。',
              `- 整套课件至少使用 ${slideLayoutMinimum} 种页面结构${
                pageRequirement.preferred >= 4 ? '，并包含完整案例或示例' : ''
              }${pageRequirement.preferred >= 3 ? '、关系可视化' : ''}${
                slideCheckMinimum ? `、至少 ${slideCheckMinimum} 次理解检查` : ''
              }${pageRequirement.preferred >= 4 ? '、迁移任务' : ''}${
                pageRequirement.preferred >= 2 ? '和结尾总结' : ''
              }。`,
              '- 每一页都提供可直接讲授且不复述页面文字的逐页讲稿，包含衔接、补充解释、误区修正、预期回应或证据以及下一页过渡；所有学习目标都必须经过讲授、练习和检查。',
            ].join('\n')
          : '- 产物必须包含完整内容、清晰教学顺序、教师可直接使用的说明以及可核验的完成标准，不能只返回目录或占位文本。',
      '- 保留教师原始约束；缺失的非关键细节请作合理教学假设并在产物中明确。',
      // This is a teacher-facing content specification, not a copy of the entire
      // model protocol/catalog. The planner and reviewer receive those separately.
      ...(target.artifactType === 'simulation' ? [CINEMATIC_AUTONOMOUS_DESIGN_BRIEF, CINEMATIC_CAMERA_PLAYBACK_BRIEF, CINEMATIC_TEACHING_PURPOSE_BRIEF,
        '不要给方案添加不存在的控件或内部动作；仅使用当前协议和同源资产事实明确支持的操作。教学设计不提前猜测坐标、尺寸与逐帧参数，正式生成器统一解析和验证。'] : []),
    ].join('\n'),
  }));
  const baseArguments = { ...(proposal?.baseArguments ?? {}) };
  const challengeCount =
    target.artifactType === 'ctf-challenge' ? requestedChallengeCount(originalPrompt) : null;
  if (challengeCount) baseArguments.challengeCount = challengeCount;
  const explicitTitle =
    target.artifactType === 'ctf-challenge' && challengeCount === 1
      ? requestedSingleChallengeTitle(originalPrompt)
      : null;
  if (explicitTitle) {
    baseArguments.constraints = {
      ...(recordValue(baseArguments.constraints) ?? {}),
      title: explicitTitle,
    };
  }
  return {
    ...target,
    ...(target.artifactType === 'simulation'
      ? {
          reason:
            '模型未提供完整可用的三套方案；以下为基于教师当前原始要求的通用组织建议，不继承旧扩写中的额外承诺。',
        }
      : {}),
    boundScope: plan?.generationScope?.status === 'bound' ? plan.generationScope.boundScope : null,
    baseArguments,
    options,
  };
}

function enforceSlideDeckPageInstruction(
  generationOptions: TeacherGenerationOptions,
  originalPrompt: string,
): TeacherGenerationOptions {
  if (generationOptions.artifactType !== 'slide-deck') return generationOptions;
  const instruction = slideDeckPageInstruction(parseSlideDeckPageRequirement(originalPrompt));
  return {
    ...generationOptions,
    options: generationOptions.options.map((option) => ({
      ...option,
      rewrittenPrompt: option.rewrittenPrompt.includes(instruction)
        ? option.rewrittenPrompt
        : `${option.rewrittenPrompt}\n最终页数要求（覆盖此前任何默认页数描述）：${instruction}`,
    })),
  };
}

const RUNTIME_ENVIRONMENT_TOKENS: Array<{ token: string; environment: string; label: string }> = [
  { token: 'windows 2000', environment: 'windows2000', label: 'Windows 2000 原生远程桌面' },
  { token: 'windows2000', environment: 'windows2000', label: 'Windows 2000 原生远程桌面' },
  { token: 'windows-2000', environment: 'windows2000', label: 'Windows 2000 原生远程桌面' },
  { token: 'win 2000', environment: 'windows2000', label: 'Windows 2000 原生远程桌面' },
  { token: 'win2000', environment: 'windows2000', label: 'Windows 2000 原生远程桌面' },
  { token: 'w2k', environment: 'windows2000', label: 'Windows 2000 原生远程桌面' },
  { token: 'windows 11', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'windows 10', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'windows11', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'windows10', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'windows-desktop', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'windows-qemu', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'win 11', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'win 10', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'win11', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'win10', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'windows', environment: 'windows', label: 'Windows 11 原生远程桌面' },
  { token: 'gnu/linux', environment: 'linux', label: 'Linux' },
  { token: 'linux', environment: 'linux', label: 'Linux' },
  { token: 'ubuntu', environment: 'linux', label: 'Linux' },
  { token: 'debian', environment: 'linux', label: 'Linux' },
];

const RUNTIME_FAMILY: Record<string, string> = {
  linux: 'linux',
  windows: 'windows',
  windows2000: 'windows',
};

export function runtimeEnvironmentLabel(environment: string): string {
  return (
    RUNTIME_ENVIRONMENT_TOKENS.find((item) => item.environment === environment)?.label ?? environment
  );
}

export function requestedRuntimeEnvironment(prompt: string): string | null {
  const choices: Array<{ environment: string; score: number }> = [];
  const tokens = new RegExp(
    `(?<![a-z0-9])(${RUNTIME_ENVIRONMENT_TOKENS.map((item) =>
      item.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ).join('|')})(?![a-z0-9])`,
    'gi',
  );
  for (const match of prompt.matchAll(tokens)) {
    const offset = match.index ?? 0;
    const prefix = prompt.slice(Math.max(0, offset - 32), offset);
    const suffix = prompt.slice(offset + match[0].length, offset + match[0].length + 12);
    const clause = prefix.split(/[，。；;\n!?！？]/).at(-1) ?? '';
    if (/(?:如果|假如|若|假设|\bif\b|\bwhen\b)/i.test(clause)) continue;
    if (
      /(?:不要|不用|不使用|不选|不是|非|不需要|无需|without|not(?:\s+to)?\s+use|not|don't\s+use)(?:\s|使用|选用|选择|用)*$/i.test(
        prefix,
      )
    )
      continue;
    if (/^\s*(?:不是必选|仅作对照|只是对照|仅为举例)/.test(suffix)) continue;
    const environment = RUNTIME_ENVIRONMENT_TOKENS.find(
      (item) => item.token.toLowerCase() === match[0].toLowerCase(),
    )?.environment;
    if (!environment) continue;
    let score =
      /(?:用|在|选择|改成|改为|换成|切换到|运行环境[：:为]?|use|using|on|switch\s+to)\s*$/i.test(
        prefix,
      )
        ? 2
        : 1;
    if (/(?:(?:默认|明确|只|仅|优先|必须)(?:使用|采用|选用|选择|用|为)?|runtimeEnvironment\s*[:=]|default(?:\s+to)?|must\s+use|only\s+use)\s*$/i.test(prefix)) score = 3;
    if (/^\s*(?:远程桌面|运行环境|环境|桌面)/.test(suffix)) score += 1;
    choices.push({ environment, score });
  }
  if (!choices.length) return null;
  const score = Math.max(...choices.map((choice) => choice.score));
  const selected = choices.filter((choice) => choice.score === score);
  if (score === 1 && new Set(selected.map((choice) => RUNTIME_FAMILY[choice.environment] ?? choice.environment)).size > 1) return null;
  return selected[selected.length - 1].environment;
}

function enforceChallengeBatchInstruction(
  generationOptions: TeacherGenerationOptions,
  originalPrompt: string,
): TeacherGenerationOptions {
  if (generationOptions.artifactType !== 'ctf-challenge') return generationOptions;
  const runtimeEnvironment = requestedRuntimeEnvironment(originalPrompt);
  if (runtimeEnvironment) {
    generationOptions = {
      ...generationOptions,
      baseArguments: {
        ...generationOptions.baseArguments,
        constraints: {
          ...(recordValue(generationOptions.baseArguments.constraints) ?? {}),
          runtimeEnvironment,
        },
      },
      options: generationOptions.options.map((option) => ({
        ...option,
        rewrittenPrompt: `${option.rewrittenPrompt}\n运行环境必须为 ${runtimeEnvironmentLabel(runtimeEnvironment)}，题目程序与运行步骤均须兼容该环境。`,
      })),
    };
  }
  const inferred = requestedChallengeCount(originalPrompt);
  const existing = Number(generationOptions.baseArguments.challengeCount);
  const challengeCount =
    inferred ?? (Number.isInteger(existing) && existing >= 1 ? Math.min(5, existing) : null);
  const explicitTitle = challengeCount === 1 ? requestedSingleChallengeTitle(originalPrompt) : null;
  if (!challengeCount && !explicitTitle) return generationOptions;
  const instruction = challengeCount === 1
    ? '单题要求：只生成 1 道完整的原生实践题，使用一个题目草稿和一个隔离环境；三个备选方案是同一道题的不同设计，不是三道题。'
    : challengeCount
    ? `批量要求：一次启动 ${challengeCount} 道彼此独立的 CTF 实践题；每道题都必须拥有独立草稿、独立隔离环境、可区分的解题路径和独立动态 Flag，不能合并成一道含 ${challengeCount} 个小问的大题。`
    : '';
  const batchTopics = requestedChallengeTopics(originalPrompt, challengeCount ?? 0);
  const topicInstruction = batchTopics.length
    ? `逐题主题（按顺序一一对应且不可互换）：${batchTopics
        .map((topic, index) => `${index + 1}. ${topic}`)
        .join('；')}。每道题的题名、核心漏洞、入口、证据和解题路径都必须清晰体现其唯一分配主题。`
    : '';
  const existingConstraints = recordValue(generationOptions.baseArguments.constraints) ?? {};
  const baseArguments = {
    ...generationOptions.baseArguments,
    ...(challengeCount ? { challengeCount } : {}),
    ...(batchTopics.length || explicitTitle
      ? {
          constraints: {
            ...existingConstraints,
            ...(batchTopics.length ? { batchTopics } : {}),
            ...(explicitTitle ? { title: explicitTitle } : {}),
          },
        }
      : {}),
  };
  return {
    ...generationOptions,
    baseArguments,
    options: generationOptions.options.map((option) => ({
      ...option,
      rewrittenPrompt: [
        option.rewrittenPrompt,
        ...(instruction && !option.rewrittenPrompt.includes(instruction) ? [instruction] : []),
        ...(explicitTitle && !option.rewrittenPrompt.includes(explicitTitle)
          ? [`题名要求：题目名称必须严格使用《${explicitTitle}》。`]
          : []),
        ...(topicInstruction && !option.rewrittenPrompt.includes(topicInstruction)
          ? [topicInstruction]
          : []),
      ].join('\n'),
    })),
  };
}

/**
 * ``simulation`` and ``attack-defense-scene`` share the same production
 * skill, but not the same student-facing delivery contract. A normal
 * simulation is a parameter/state exercise. A topology scene must preserve
 * distinct attacker and defender roles, a vulnerable-lab stage, and a
 * defensive verification stage. Keep this as a narrow contract repair after
 * model planning: it only applies when the teacher has explicitly supplied
 * all of those structural signals, rather than treating a bare occurrence of
 * "attack" or "simulation" as an intent classifier.
 */
function requiresAttackDefenseTopologyScene(originalPrompt: string): boolean {
  const prompt = compactText(originalPrompt).toLocaleLowerCase();
  if (!prompt) return false;
  const hasAttackSide =
    /(?:攻击(?:者|方|线索|路径|链|行为)?|漏洞(?:实验|利用|复现|态)?|利用(?:链|步骤)?)/u.test(
      prompt,
    );
  const hasDefenseSide = /(?:防守(?:者|方)?|防御|修复|加固|处置|验证模拟)/u.test(prompt);
  const hasTopology = /(?:拓扑|网络图|节点关系|主机与服务|服务与主机)/u.test(prompt);
  const hasAttackDefenseFlow =
    /(?:攻击|漏洞|利用).{0,96}(?:防守|防御|修复|加固|处置|验证)/u.test(prompt) ||
    /(?:至少|包含|有).{0,24}(?:两个|两|2).{0,24}(?:连续|可操作)?.{0,20}(?:阶段|环节|场景)/u.test(
      prompt,
    );
  return hasAttackSide && hasDefenseSide && hasTopology && hasAttackDefenseFlow;
}

function enforceAttackDefenseSceneContract(
  originalPrompt: string,
  generationOptions: TeacherGenerationOptions,
): TeacherGenerationOptions {
  if (
    generationOptions.targetTool !== 'candidate.generate' ||
    generationOptions.artifactType !== 'simulation' ||
    !requiresAttackDefenseTopologyScene(originalPrompt)
  ) {
    return generationOptions;
  }

  const teacherRequest = compactText(originalPrompt).slice(0, 8_000);
  return {
    ...generationOptions,
    artifactType: 'attack-defense-scene',
    reason: compactText(
      [
        generationOptions.reason,
        '教师明确要求攻击者与防守者角色、拓扑和连续攻防阶段，必须交付攻防拓扑演示。',
      ]
        .filter(Boolean)
        .join(' '),
    ).slice(0, 1_000),
    options: generationOptions.options.map((option) => {
      const highlights = Array.from(
        new Set([
          ...option.highlights,
          '攻击线索/漏洞实验与防守修复/验证必须形成连续的两个阶段',
          '每个阶段都保留攻击者、守方、拓扑、证据面板、重置和安全边界',
        ]),
      ).slice(0, 6);
      return {
        ...option,
        title: option.title.includes('攻防') ? option.title : `攻防拓扑：${option.title}`,
        description: compactText(
          `${option.description} 交付为包含可运行漏洞实验和后续防守验证的攻防拓扑演示。`,
        ).slice(0, 2_000),
        highlights,
        rewrittenPrompt: [
          '请正式生成一份可在平台内预览、编辑并发布的 attack-defense-scene 攻防拓扑演示；不得把它降级为通用 simulation。',
          `教师原始要求：${teacherRequest}`,
          `本方案组织方式：${option.title}。${option.description}`,
          '交付必须包含两个连续且可操作的阶段：先展示攻击线索/漏洞实验，再展示防守修复/验证模拟；两个阶段之间必须有可见的证据交接。',
          '每个阶段都必须具备攻击者与防守者角色、可观察拓扑、证据面板、确定性重置方法和明确的隔离安全边界。',
          '第一阶段必须是可执行的 vulnerable-lab，第二阶段必须是可操作的防守验证 simulation；不要只输出静态示意图、叙述文字或下载文件。',
        ].join('\n'),
      };
    }),
  };
}

function enforceNamedInteractiveArtifactContract(
  originalPrompt: string,
  generationOptions: TeacherGenerationOptions,
): TeacherGenerationOptions {
  if (generationOptions.targetTool !== 'candidate.generate') return generationOptions;
  const explicitType = explicitlyRequestedNamedInteractiveArtifact(originalPrompt);
  if (!explicitType || generationOptions.artifactType === explicitType) return generationOptions;
  const target: TeacherGenerationTarget = {
    targetTool: 'candidate.generate',
    artifactType: explicitType,
    reason: compactText(
      [
        generationOptions.reason,
        explicitType === 'debate'
          ? '教师明确要求学生与AI辩论，交付必须是可参与、分轮交锋并有复盘反馈的辩论活动。'
          : '教师明确要求学习者进入情境完成角色互动，交付类型必须为角色扮演。',
      ]
        .filter(Boolean)
        .join(' '),
    ).slice(0, 1_000),
  };
  const corrected = fallbackTeacherGenerationOptions(
    originalPrompt,
    { understanding: originalPrompt, selectedSkills: [], plan: [], generationTarget: target },
    {},
  );
  return corrected
    ? {
        ...corrected,
        boundScope: generationOptions.boundScope,
        baseArguments: generationOptions.baseArguments,
      }
    : { ...generationOptions, ...target };
}

function explicitlyRequestedNamedInteractiveArtifact(
  originalPrompt: string,
): 'debate' | 'roleplay' | null {
  if (
    /(?:AI|多智能体|课堂|结构化)?辩论|(?:正方|反方).{0,40}(?:交锋|辩论)|(?:三|[二四五六七八九]|\d+)轮(?:交锋|辩论)/u.test(
      originalPrompt,
    )
  ) {
    return 'debate';
  }
  return /角色扮演|情境扮演|情景扮演/u.test(originalPrompt) ? 'roleplay' : null;
}

/**
 * Recover a teacher-facing platform simulation when a planner drifts into a
 * downloadable document despite an explicit preview/edit/publish contract.
 * This intentionally requires the delivery lifecycle *and* operational
 * simulation mechanics, so student auto-scored exercises and ordinary files
 * retain their distinct routes.
 */
function requiresTeacherPreviewableSimulation(originalPrompt: string): boolean {
  const prompt = compactText(originalPrompt);
  if (!prompt || requiresScoredSimulationChallenge(prompt)) return false;
  const nativeLifecycle =
    /(?:平台(?:内|中)?|课堂).{0,48}(?:预览|编辑|发布)/u.test(prompt) ||
    /(?:预览|编辑).{0,48}(?:发布(?:到)?课堂|课堂发布)/u.test(prompt);
  const simulationRequest =
    /(?:模拟(?:练习|演示|实训|场景)?|检测模拟|处置模拟|情境模拟)/u.test(prompt) &&
    !/(?:课件|幻灯|PPT|slide[-\s]?deck)/iu.test(prompt);
  const operationalMechanics =
    /(?:可操作|连续.{0,24}(?:场景|阶段)|判断|处置决策|即时反馈|评分标准|复盘|一键重置|状态(?:变化|机)|参数(?:调整|开关))/u.test(
      prompt,
    );
  return nativeLifecycle && simulationRequest && operationalMechanics;
}

function requiresScoredSimulationChallenge(originalPrompt: string): boolean {
  const prompt = compactText(originalPrompt);
  return (
    /(?:自动评分|可自动评分|自动判分|可判分|过程评分)/u.test(prompt) &&
    /(?:模拟实训题|模拟练习|处置模拟题|情境题|学生.{0,24}(?:需要|完成|操作|决策))/u.test(prompt) &&
    /(?:查看|扫描|检查|判断|调整|验证|操作|决策|形成.{0,16}假设)/u.test(prompt)
  );
}

export function enforceTeacherQuestionBatchContract(
  originalPrompt: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  const requestedCount = requestedQuestionCount(originalPrompt);
  if (requestedCount === null) return result;
  const sourceProposals = Array.isArray(result.toolProposals) ? result.toolProposals : [];
  let matchedTool: 'assignment.generate' | 'challenge.generate' | null = null;
  let exceededLimit: number | null = null;
  const toolProposals = sourceProposals.flatMap((value) => {
    const proposal = recordValue(value);
    const tool = String(proposal?.tool || '');
    if (tool !== 'assignment.generate' && tool !== 'challenge.generate') return [value];
    const limit = tool === 'challenge.generate' ? 5 : 20;
    matchedTool = tool;
    if (requestedCount > limit) {
      exceededLimit = limit;
      return [];
    }
    const argumentsValue = recordValue(proposal?.arguments) ?? {};
    return [
      {
        ...proposal,
        arguments: {
          ...argumentsValue,
          [tool === 'challenge.generate' ? 'challengeCount' : 'questionCount']: requestedCount,
        },
      },
    ];
  });
  if (matchedTool === null) return result;
  if (exceededLimit !== null) {
    const noun = matchedTool === 'challenge.generate' ? '独立 CTF 实践题' : '知识题';
    return {
      ...result,
      answer: `我识别到你要求一次生成 ${requestedCount} 道${noun}，但当前单批上限是 ${exceededLimit} 道。为避免静默少生成，本次没有启动任务；请把要求拆成多批。`,
      suggestions: [],
      toolProposals,
      generationOptions: undefined,
      requiresAction: Boolean(toolProposals.length),
    };
  }
  return {
    ...result,
    answer:
      matchedTool === 'assignment.generate'
        ? `已锁定题量为 ${requestedCount} 道；${String(result.answer || '').trim()}`
        : result.answer,
    toolProposals,
    requiresAction: Boolean(toolProposals.length || result.generationOptions),
  };
}

export function enforceTeacherGenerationOptions(
  originalPrompt: string,
  plan: TeacherAgentPlan | null,
  result: Record<string, unknown>,
  platformFacts?: Record<string, unknown> | null,
): Record<string, unknown> {
  const contractedResult = enforceTeacherQuestionBatchContract(originalPrompt, result);
  const explicitQuestionCount = requestedQuestionCount(originalPrompt);
  const rawGenerationTarget = normalizeGenerationTarget(
    recordValue(contractedResult.generationOptions),
  );
  const targetsCtfBatch =
    plan?.generationTarget?.artifactType === 'ctf-challenge' ||
    rawGenerationTarget?.artifactType === 'ctf-challenge';
  if (targetsCtfBatch && explicitQuestionCount !== null && explicitQuestionCount > 5) {
    const proposals = Array.isArray(contractedResult.toolProposals)
      ? contractedResult.toolProposals.filter(
          (item) => String(recordValue(item)?.tool || '') !== 'challenge.generate',
        )
      : [];
    return {
      ...contractedResult,
      answer: `我识别到你要求一次生成 ${explicitQuestionCount} 道独立 CTF 实践题，但当前单批上限是 5 道。为避免静默少生成，本次没有提供会缩水的方案；请把要求拆成多批。`,
      suggestions: [],
      toolProposals: proposals,
      generationOptions: undefined,
      requiresAction: Boolean(proposals.length),
    };
  }
  if (requiresScoredSimulationChallenge(originalPrompt)) {
    const boundScope = effectiveTeacherGenerationBoundScope(
      originalPrompt,
      plan,
      null,
      platformFacts,
    );
    const challengeCount = explicitQuestionCount ?? 1;
    const proposals = Array.isArray(contractedResult.toolProposals)
      ? contractedResult.toolProposals.filter(
          (item) => !GENERATION_OPTION_TOOLS.has(String(recordValue(item)?.tool || '')),
        )
      : [];
    if (!boundScope || boundScope.moduleIndex === null) {
      return {
        ...contractedResult,
        answer: '自动评分的学生模拟题需要归属到具体课程章节。请直接告诉我课程名称和章节。',
        suggestions: [],
        toolProposals: proposals,
        generationOptions: undefined,
        deliverables: [],
        requiresAction: Boolean(proposals.length),
      };
    }
    if (challengeCount > 5) {
      return {
        ...contractedResult,
        answer: `我识别到你要求一次生成 ${challengeCount} 道独立的自动评分模拟题，但当前单批上限是 5 道；请拆成多批。`,
        suggestions: [],
        toolProposals: proposals,
        generationOptions: undefined,
        deliverables: [],
        requiresAction: Boolean(proposals.length),
      };
    }
    const simulationPlan: TeacherAgentPlan = {
      understanding: plan?.understanding || originalPrompt,
      selectedSkills: plan?.selectedSkills || [],
      plan: plan?.plan || [],
      generationTarget: {
        targetTool: 'challenge.generate',
        artifactType: 'ctf-challenge',
        reason: '教师要求学生完成有确定性状态目标和过程证据的自动评分模拟题。',
      },
      ...(plan?.generationScope ? { generationScope: plan.generationScope } : {}),
    };
    const generatedOptions = fallbackTeacherGenerationOptions(originalPrompt, simulationPlan, {});
    if (!generatedOptions) return contractedResult;
    const simulationInstruction =
      '自动评分模拟题契约：每道题必须成为独立任务，包含确定性场景状态、可操作步骤、过程证据、可核验完成目标和自动评分；不得降级为教师演示、静态课件或普通问答。';
    const generationOptions: TeacherGenerationOptions = {
      ...generatedOptions,
      boundScope,
      baseArguments: {
        ...generatedOptions.baseArguments,
        moduleIndex: boundScope.moduleIndex,
        challengeCount,
        constraints: {
          ...(recordValue(generatedOptions.baseArguments.constraints) ?? {}),
          exerciseMode: 'SIMULATION',
        },
      },
      options: generatedOptions.options.map((option) => ({
        ...option,
        rewrittenPrompt: option.rewrittenPrompt.includes(simulationInstruction)
          ? option.rewrittenPrompt
          : `${option.rewrittenPrompt}\n${simulationInstruction}`,
      })),
    };
    return {
      ...contractedResult,
      answer:
        challengeCount > 1
          ? `已识别为 ${challengeCount} 道彼此独立的学生自动评分模拟题，并准备了三种整批组织方案；选择后每道题会各自创建任务、场景状态和评分记录。`
          : '已识别为一项学生需要实际完成并由平台自动评分的模拟题，并准备了三种生成方案；选择后才会创建独立任务、确定性场景状态和评分记录。',
      suggestions: [],
      toolProposals: proposals,
      generationOptions,
      deliverables: [],
      requiresAction: true,
    };
  }
  const explicitNamedInteractiveType = explicitlyRequestedNamedInteractiveArtifact(originalPrompt);
  const previewableSimulationTarget: TeacherGenerationTarget | null =
    requiresTeacherPreviewableSimulation(originalPrompt)
      ? {
          targetTool: 'candidate.generate',
          artifactType: 'simulation',
          reason: '教师明确要求可在平台内预览、编辑并发布的可操作模拟，不能降级为下载文件。',
        }
      : null;
  const recoveredInteractiveTarget: TeacherGenerationTarget | null = explicitNamedInteractiveType
    ? {
        targetTool: 'candidate.generate',
        artifactType: explicitNamedInteractiveType,
        reason: '教师明确点名平台原生的交互活动类型。',
      }
    : previewableSimulationTarget;
  const forcedPreviewableSimulationPlan: TeacherAgentPlan | null = previewableSimulationTarget
    ? {
        understanding: plan?.understanding || originalPrompt,
        selectedSkills: plan?.selectedSkills || [],
        plan: plan?.plan || [],
        generationTarget: previewableSimulationTarget,
        ...(plan?.generationScope ? { generationScope: plan.generationScope } : {}),
      }
    : null;
  const normalizedOptions = normalizeTeacherGenerationOptions(
    contractedResult.generationOptions,
    platformFacts,
  );
  const rawGenerationOptions = forcedPreviewableSimulationPlan
    ? // A planner may select a file-delivery skill even when the teacher
      // explicitly prohibits files. Do not let a model-supplied generation
      // target or deliverable proposal override this native interaction
      // contract; build the three choices from the teacher's own request.
      normalizedOptions?.targetTool === 'candidate.generate' &&
      normalizedOptions.artifactType === 'simulation'
      ? normalizedOptions
      : fallbackTeacherGenerationOptions(originalPrompt, forcedPreviewableSimulationPlan, {})
    : (normalizedOptions ??
      fallbackTeacherGenerationOptions(
        originalPrompt,
        plan?.generationTarget
          ? plan
          : recoveredInteractiveTarget
            ? {
                understanding: originalPrompt,
                selectedSkills: [],
                plan: [],
                generationTarget: recoveredInteractiveTarget,
              }
            : plan,
        contractedResult,
      ));
  if (!rawGenerationOptions) return contractedResult;
  const proposals = Array.isArray(contractedResult.toolProposals)
    ? contractedResult.toolProposals.filter(
        (item) => !GENERATION_OPTION_TOOLS.has(String(recordValue(item)?.tool || '')),
      )
    : [];
  const boundScope = effectiveTeacherGenerationBoundScope(
    originalPrompt,
    plan,
    rawGenerationOptions.boundScope,
    platformFacts,
  );
  if (
    !boundScope &&
    (plan?.generationScope?.status === 'ambiguous' ||
      (rawGenerationOptions.targetTool === 'challenge.generate' &&
        plan?.generationScope?.status === 'unscoped'))
  ) {
    return {
      ...contractedResult,
      answer:
        '我还不能从当前可信课程信息中唯一确定目标课程或章节。请直接告诉我课程名称，以及要面向整个课程还是其中哪个章节。',
      suggestions: [],
      toolProposals: proposals,
      generationOptions: undefined,
      requiresAction: Boolean(proposals.length),
    };
  }
  if (
    !boundScope &&
    rawGenerationOptions.targetTool === 'challenge.generate' &&
    trustedAvailableCourses(platformFacts)
  ) {
    return {
      ...contractedResult,
      answer:
        '生成的平台内容需要归属课程。请直接告诉我课程名称，以及要面向整个课程还是其中哪个章节。',
      suggestions: [],
      toolProposals: proposals,
      generationOptions: undefined,
      requiresAction: Boolean(proposals.length),
    };
  }
  let generationOptions = enforceNamedInteractiveArtifactContract(
    originalPrompt,
    enforceAttackDefenseSceneContract(
      originalPrompt,
      enforceChallengeBatchInstruction(
        enforceSlideDeckPageInstruction(rawGenerationOptions, originalPrompt),
        originalPrompt,
      ),
    ),
  );
  generationOptions = {
    ...generationOptions,
    boundScope,
    baseArguments:
      generationOptions.targetTool === 'challenge.generate' &&
      boundScope &&
      boundScope.moduleIndex !== null
        ? { ...generationOptions.baseArguments, moduleIndex: boundScope.moduleIndex }
        : generationOptions.baseArguments,
  };
  const targetLabel =
    generationOptions.artifactType === 'slide-deck'
      ? '课件'
      : generationOptions.artifactType === 'ctf-challenge'
        ? 'CTF 实践题'
        : generationOptions.artifactType === 'debate'
          ? 'AI 辩论'
          : generationOptions.artifactType === 'roleplay'
            ? '角色扮演活动'
            : '实训演示';
  return {
    ...contractedResult,
    deliverables: [],
    answer:
      generationOptions.artifactType === 'ctf-challenge' &&
      Number(generationOptions.baseArguments.challengeCount) > 1
        ? `已锁定一次生成 ${Number(generationOptions.baseArguments.challengeCount)} 道彼此独立的 CTF 实践题。我为整批题目准备了三种组织方案，选择后才会开始正式生成。`
        : `我已为这次${targetLabel}准备三种实质不同的生成方案。每种方案都包含详细设计和一份完整重写后的正式提示词；请选择最合适的一种，选择后才会开始正式生成。`,
    suggestions: [],
    toolProposals: proposals,
    requiresAction: true,
    generationOptions,
  };
}

export function teacherAgentDeliverableQualityIssue(value: unknown): string | null {
  const deliverable = recordValue(value);
  if (!deliverable) return 'deliverable is not an object';
  const format = String(deliverable.format || '')
    .trim()
    .toLowerCase();
  if (!FILE_FORMATS.has(format)) return 'unsupported deliverable format';
  const content = typeof deliverable.content === 'string' ? deliverable.content.trim() : '';
  const documentText = collectDocumentBodyText(deliverable.document);
  if (format === 'html') {
    const visibleText = content ? htmlVisibleText(content) : documentText;
    return visibleText.replace(/\s+/g, '').length >= MIN_DELIVERABLE_BODY_CHARS
      ? null
      : 'HTML deliverable has no substantive visible body';
  }
  if (format === 'docx' || format === 'md' || format === 'txt') {
    const body = compactText(content || documentText);
    return body.replace(/\s+/g, '').length >= MIN_DELIVERABLE_BODY_CHARS
      ? null
      : `${format} deliverable has no substantive body`;
  }
  if (format === 'csv') {
    const rows = Array.isArray(deliverable.data) ? deliverable.data : [];
    const contentRows = content.split(/\r?\n/).filter((line) => line.trim());
    return rows.length > 0 || contentRows.length > 1 ? null : 'CSV deliverable has no data rows';
  }
  if (format === 'ipynb') {
    const notebook = recordValue(deliverable.data);
    const cells = Array.isArray(notebook?.cells) ? notebook.cells : [];
    return cells.some((cell) => hasStructuredData(recordValue(cell)?.source)) ||
      compactText(content || documentText).length >= MIN_DELIVERABLE_BODY_CHARS
      ? null
      : 'Notebook deliverable has no populated cells';
  }
  return hasStructuredData(deliverable.data ?? deliverable.document ?? deliverable.content)
    ? null
    : 'JSON deliverable has no data';
}

function normalizeDeliverables(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const deliverables: Record<string, unknown>[] = [];
  for (const item of value.slice(0, 4)) {
    const candidate = recordValue(item);
    if (!candidate) continue;
    const format = String(candidate.format || '')
      .trim()
      .toLowerCase();
    if (!FILE_FORMATS.has(format)) continue;
    const rawDocument = recordValue(candidate.document);
    const document = rawDocument && Object.keys(rawDocument).length ? rawDocument : null;
    const rawContent = typeof candidate.content === 'string' ? candidate.content : '';
    const content = (format === 'html' ? normalizeHtmlContent(rawContent) : rawContent)
      .slice(0, 500_000)
      .trim();
    const data = candidate.data;
    let normalizedData: unknown = data;
    if (data !== undefined) {
      try {
        const encoded = JSON.stringify(data);
        normalizedData = encoded.length <= 500_000 ? JSON.parse(encoded) : undefined;
      } catch {
        normalizedData = undefined;
      }
    }
    if (!document && !content && normalizedData === undefined) continue;
    const normalized = {
      filename: normalizeFilename(String(candidate.filename || ''), format),
      format,
      title: String(candidate.title || document?.title || '').slice(0, 240),
      ...(document ? { document } : {}),
      ...(content ? { content } : {}),
      ...(normalizedData !== undefined ? { data: normalizedData } : {}),
    };
    if (teacherAgentDeliverableQualityIssue(normalized)) continue;
    deliverables.push(normalized);
  }
  return deliverables;
}

function uniqueFormats(formats: string[]): string[] {
  return [...new Set(formats.filter((format) => FILE_FORMATS.has(format)))].slice(0, 4);
}

/**
 * Derive a completion contract for real files without routing the teacher's
 * request into a fixed content category. The model-selected delivery skills
 * are the primary signal; the narrow language check only preserves an
 * explicit file/format request when planning is degraded or incomplete.
 */
export function requiredTeacherAgentDeliverableFormats(
  originalPrompt: string,
  plan: TeacherAgentPlan | null,
): string[] {
  // A native interactive simulation is intentionally not a file-delivery
  // request. This guard sits after model planning because a model can still
  // load a document skill despite an explicit “do not generate a download”
  // instruction; allowing that skill to create a DOCX would contradict the
  // platform-preview/edit/publish contract.
  if (requiresTeacherPreviewableSimulation(originalPrompt)) return [];
  const selectedDeliverySkill = Boolean(
    plan?.selectedSkills.some((name) => FILE_DELIVERY_SKILLS.has(name)),
  );
  const explicitDelivery =
    /(?:给(?:我)?|给出|提供|返回|生成|创建|导出|交付).{0,48}(?:可(?:直接)?下载的?)?.{0,24}(?:文件|word|docx|markdown|\bcsv\b|\bjson\b|\bhtml\b|notebook|ipynb)/iu.test(
      originalPrompt,
    ) ||
    /可(?:直接)?下载的?.{0,40}(?:文件|教案|报告|结果)/u.test(originalPrompt) ||
    /(?:provide|give|create|generate|export|return|deliver).{0,64}(?:downloadable\s+)?file/iu.test(
      originalPrompt,
    );
  if (!selectedDeliverySkill && !explicitDelivery) return [];

  const formats: string[] = [];
  const add = (condition: boolean, format: string) => {
    if (condition) formats.push(format);
  };
  add(/(?:\bdocx\b|\bword\b)/iu.test(originalPrompt), 'docx');
  add(/(?:\bmarkdown\b|\.md\b)/iu.test(originalPrompt), 'md');
  add(/(?:\bcsv\b|\.csv\b)/iu.test(originalPrompt), 'csv');
  add(/(?:\bjson\b|\.json\b)/iu.test(originalPrompt), 'json');
  add(/(?:\bhtml\b|\.html\b)/iu.test(originalPrompt), 'html');
  add(/(?:\bipynb\b|jupyter\s+notebook|notebook\s+文件)/iu.test(originalPrompt), 'ipynb');
  add(/(?:\btxt\b|纯文本文件|文本文件)/iu.test(originalPrompt), 'txt');
  return uniqueFormats(formats.length ? formats : ['docx']);
}

export function missingTeacherAgentDeliverableFormats(
  value: Record<string, unknown>,
  requiredFormats: string[],
): string[] {
  const delivered = new Set(
    (Array.isArray(value.deliverables) ? value.deliverables : [])
      .map((item) => recordValue(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => teacherAgentDeliverableQualityIssue(item) === null)
      .map((item) => String(item.format || '').toLowerCase()),
  );
  return uniqueFormats(requiredFormats).filter((format) => !delivered.has(format));
}

function safeFileTitle(plan: TeacherAgentPlan | null): string {
  const title = String(plan?.understanding || '教师任务结果')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 80);
  return title || '教师任务结果';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Last-resort packaging for an already completed analysis. Normal execution
 * first asks the model to repair the missing file with the full source
 * context; this fallback prevents a successful answer from silently dropping
 * an explicitly requested download if that bounded repair is unavailable.
 */
export function fallbackTeacherAgentDeliverables(
  originalPrompt: string,
  answer: string,
  plan: TeacherAgentPlan | null,
  formats: string[],
): Record<string, unknown>[] {
  const title = safeFileTitle(plan);
  const paragraphs = answer
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const planSteps = plan?.plan.filter(Boolean) ?? [];
  return uniqueFormats(formats).map((format) => {
    const filename = normalizeFilename(`${title}.${format}`, format);
    if (format === 'docx') {
      return {
        filename,
        format,
        title,
        document: {
          title,
          subtitle: '玄甲全局智能体交付文件',
          sections: [
            {
              heading: '分析与结果',
              level: 1,
              paragraphs: paragraphs.length ? paragraphs : [answer],
            },
            ...(planSteps.length ? [{ heading: '执行依据', level: 1, bullets: planSteps }] : []),
            { heading: '教师原始要求', level: 1, paragraphs: [originalPrompt] },
          ],
        },
      };
    }
    if (format === 'json') {
      return {
        filename,
        format,
        title,
        data: { title, request: originalPrompt, answer, plan: planSteps },
      };
    }
    if (format === 'csv') {
      return {
        filename,
        format,
        title,
        content: [
          'section,content',
          `${csvCell('result')},${csvCell(answer)}`,
          `${csvCell('request')},${csvCell(originalPrompt)}`,
        ].join('\n'),
      };
    }
    if (format === 'html') {
      const resultParagraphs = (paragraphs.length ? paragraphs : [answer])
        .map((item) => `<p>${escapeHtml(item)}</p>`)
        .join('');
      const plannedWork = planSteps.length
        ? `<h2>执行依据</h2><ul>${planSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '';
      return {
        filename,
        format,
        title,
        content: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:14mm}body{max-width:900px;margin:0 auto;font:16px/1.75 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#172033}h1,h2{line-height:1.3;break-after:avoid}p,li{orphans:3;widows:3}pre,table{break-inside:avoid}</style></head><body><main><h1>${escapeHtml(title)}</h1><h2>分析与结果</h2>${resultParagraphs}${plannedWork}<h2>教师原始要求</h2><p>${escapeHtml(originalPrompt)}</p></main></body></html>`,
      };
    }
    if (format === 'ipynb') {
      return {
        filename,
        format,
        title,
        data: {
          nbformat: 4,
          nbformat_minor: 5,
          metadata: {},
          cells: [
            {
              cell_type: 'markdown',
              metadata: {},
              source: [`# ${title}\n\n`, `${answer}\n\n`, `## 教师原始要求\n\n${originalPrompt}`],
            },
          ],
        },
      };
    }
    const heading = format === 'md' ? `# ${title}\n\n` : `${title}\n\n`;
    return { filename, format, title, content: `${heading}${answer}\n\n${originalPrompt}` };
  });
}

export function teacherAgentDeliverableClosureSystem(
  skills: AgentSkill[],
  requiredFormats: string[],
): string {
  const skillText = skills.length
    ? skills
        .map((skill) => `<skill name="${skill.name}">\n${skill.instructions}\n</skill>`)
        .join('\n\n')
    : '本轮没有额外技能说明。';
  return `你是玄甲全局智能体的文件交付闭环。上一阶段已经理解并分析了教师请求，但缺少教师明确要求的真实文件。请使用原始请求、材料证据、已有分析和规划，补齐完整、可复用的文件内容，不要把文件改成平台课件、候选卡片或口头承诺，也不要编造材料中没有的事实。

必须交付的格式：${requiredFormats.join(', ')}。Word 使用 docx；结构化文档使用 {"title":"...","subtitle":"...","sections":[{"heading":"...","level":1,"paragraphs":["..."],"bullets":["..."],"tables":[{"headers":["..."],"rows":[["..."]]}]}]}。Notebook 使用标准 nbformat 结构。HTML 必须在 content 中给出完整、自包含、可直接打开和打印的 <!doctype html><html>...</html> 文档，正文必须包含完整可见内容，禁止 Markdown 代码围栏、空 body、空 document 或只有标题的页面。文件内容必须满足教师原始要求，而不是只复制一句摘要。

相关技能：
${skillText}

只输出合法 JSON：
{"answer":"简洁说明分析结果和已交付文件","suggestions":[],"toolProposals":[],"deliverables":[{"filename":"文件名.docx","format":"docx","title":"标题","document":{"title":"...","sections":[]}}]}。不得提出平台工具，不得遗漏任何必须格式。`;
}

export function normalizeTeacherAgentPlan(
  value: Record<string, unknown>,
  catalog: AgentSkillSummary[],
  platformFacts?: Record<string, unknown> | null,
  authority?: TeacherRequestAuthority,
): TeacherAgentPlan {
  const understanding = String(value.understanding || '')
    .trim()
    .slice(0, 4_000);
  if (!understanding) throw new Error('Agent plan is missing its understanding');
  const provenance = recordValue(recordValue(authority?.context)?.requestProvenance);
  const requestRelation =
    authority &&
    (value.requestRelation !== undefined || provenance?.version === 'teacher-request-v1')
      ? normalizeTeacherRequestRelation(value.requestRelation, authority)
      : undefined;
  const available = new Set(catalog.map((skill) => skill.name));
  const modelSelectedSkills = Array.isArray(value.selectedSkills)
    ? value.selectedSkills.filter(
        (item): item is string => typeof item === 'string' && available.has(item),
      )
    : [];
  const inquiryPatternSelected = recordValue(recordValue(platformFacts)?.selectedLearningPattern)?.id === 'process-inquiry';
  const generationTarget = inquiryPatternSelected ? null : normalizeGenerationTarget(value.generationTarget);
  const generationScopeSupplied = Object.prototype.hasOwnProperty.call(value, 'generationScope');
  const generationScope = generationScopeSupplied
    ? normalizeTeacherGenerationScopeResolution(value.generationScope, platformFacts)
    : null;
  if (generationTarget && trustedAvailableCourses(platformFacts) && !generationScopeSupplied) {
    throw new Error('Agent generation plan is missing its semantic scope resolution');
  }
  if (generationTarget && generationScopeSupplied && !generationScope) {
    throw new Error('Agent generation plan contains an invalid scope resolution');
  }
  const requiredProductionSkill = inquiryPatternSelected ? 'process-inquiry-learning' : generationTarget
    ? PRODUCTION_SKILL_BY_ARTIFACT_TYPE[generationTarget.artifactType]
    : null;
  // The planner is intentionally semantic rather than keyword-driven, but a valid
  // generation target also gives us an authoritative production contract.  Make the
  // corresponding domain skill mandatory so an otherwise good model plan cannot
  // accidentally omit the detailed deck, CTF, or simulation workflow.
  if (inquiryPatternSelected && !available.has('process-inquiry-learning')) throw new Error('流程探究式学习的必需技能未就绪，请恢复技能目录后重试。');
  const selectedSkills = [
    ...(requiredProductionSkill && available.has(requiredProductionSkill)
      ? [requiredProductionSkill]
      : []),
    ...modelSelectedSkills,
  ]
    .filter((name, index, values) => values.indexOf(name) === index)
    .slice(0, 6);
  const plan = Array.isArray(value.plan)
    ? value.plan.filter((item): item is string => typeof item === 'string').slice(0, 10)
    : [];
  return {
    understanding,
    selectedSkills,
    plan,
    generationTarget,
    generationScope: generationTarget ? generationScope : null,
    ...(requestRelation ? { requestRelation } : {}),
  };
}

function normalizeTeacherAgentSuggestion(value: string): string {
  let command = value.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!command) return '';
  command = command
    .replace(/^[\s“”‘’"'（(\[【]+|[\s“”‘’"'）)\]】]+$/gu, '')
    .replace(/^(?:[-–—•·]|\d+[.)、])\s*/u, '')
    .replace(/[。！？；;，,.]+$/u, '')
    .trim();

  const conditionalPrefixes = [
    /^帮我完成这项后续操作\s*[:：]\s*/u,
    /^(?:如(?:果)?|若)(?:你)?(?:还)?(?:确认)?需(?:要)?我(?:同时|另外|再|继续)?/u,
    /^(?:如(?:果)?|若)(?:你)?(?:还)?(?:确认)?需(?:要)?/u,
    /^如果你(?:想|希望)(?:让我|由我)?/u,
    /^(?:是否(?:还)?(?:要|需要)?|要不要)(?:让我|由我|我)?/u,
    /^(?:你)?可以让我(?:再|继续|另外|同时)?/u,
    /^我(?:也|还|仍然?)?可以(?:再|继续|另外|同时)?(?:为你|帮你)?/u,
    /^(?:你)?(?:还|也)?可以(?:再|继续|进一步|另外|同时)?/u,
    /^(?:可以|可(?:再|继续|进一步|另外|同时))/u,
    /^(?:下一步|后续)(?:还|也)?(?:可以|可)?(?:再|继续|进一步)?/u,
    /^(?:建议|推荐)(?:你|教师)?(?:可以|可)?/u,
  ];
  let changed = true;
  while (changed && command) {
    changed = false;
    for (const prefix of conditionalPrefixes) {
      if (!prefix.test(command)) continue;
      command = command
        .replace(prefix, '')
        .replace(/^[，,:：\s]+/u, '')
        .trim();
      changed = true;
      break;
    }
  }

  command = command
    .replace(/^(?:还)?需要(?:我|你)?/u, '')
    .replace(/^读取后(?:还)?可(?:继续)?/u, '继续')
    .replace(/[，,；;]\s*(?:如果|若|如需|我(?:也|还)?可以|可以让我|可另行|是否需要)[\s\S]*$/u, '')
    .replace(/^请(?:帮我)?/u, '')
    .replace(/^帮我/u, '')
    .replace(/[吗么呢吧]$/u, '')
    .trim();
  if (!command) return '';
  const actions =
    '继续|打开|查看|读取|切换|基于|针对|按照|按|为|对|布置|生成|创建|分析|修改|调整|补充|导出|下载|发布|检查|比较|选择|添加|删除|启动|结束|重新|把|将|给|提供|完成|应用|加入|移除|重试|保存|更新|验证|运行|执行|编写|制作|整理|转换|同步|设置|列出|总结|解释|优化|审阅|合并|拆分|设计|起草|输出|返回|提交|停止|可视化';
  const actionPrefix = new RegExp(`^(?:${actions})`, 'u');
  if (!actionPrefix.test(command)) {
    const subjectModal = command.match(
      new RegExp(
        `^(.{1,100}?)(?:还|也)?(?:可以|可)(?:再|继续|进一步|同时|另外)?(${actions})(.*)$`,
        'u',
      ),
    );
    if (subjectModal) {
      command = `${subjectModal[2]}${subjectModal[1]}${subjectModal[3]}`.trim();
    }
  }
  if (!actionPrefix.test(command)) {
    const inlineAction = command.match(
      /^(.*?)((?:生成|创建|分析|修改|调整|补充|导出|发布|检查|添加|删除|整理|转换|设置|总结|优化|设计|输出|提交|停止|可视化))(.*)$/u,
    );
    if (inlineAction && inlineAction[1].trim()) {
      command = `${inlineAction[2]}${inlineAction[1]}${inlineAction[3]}`.trim();
    }
  }
  if (!actionPrefix.test(command)) return '';
  return `帮我${command.replace(/[。！？；;，,.]+$/u, '').trim()}。`;
}

export function normalizeTeacherAgentResult(
  value: Record<string, unknown>,
  allowedTools: Set<string>,
  platformFacts?: Record<string, unknown> | null,
  targetingContext = '',
): Record<string, unknown> {
  const answer = typeof value.answer === 'string' ? value.answer.slice(0, 32_000).trim() : '';
  if (!answer) throw new Error('Agent response is missing answer');
  const suggestions = Array.isArray(value.suggestions)
    ? value.suggestions
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeTeacherAgentSuggestion)
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const toolProposals = Array.isArray(value.toolProposals)
    ? value.toolProposals
        .map((item) => recordValue(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          tool: String(item.tool || ''),
          arguments: normalizeTeacherAgentToolArguments(
            String(item.tool || ''),
            recordValue(item.arguments) ?? {},
            platformFacts,
            targetingContext,
          ),
          reason: String(item.reason || '').slice(0, 1_000),
        }))
        .filter((item) => allowedTools.has(item.tool))
        .slice(0, 8)
    : [];
  const deliverables = normalizeDeliverables(value.deliverables);
  const generationOptions = normalizeTeacherGenerationOptions(
    value.generationOptions,
    platformFacts,
  );
  const questions = normalizeAgentQuestions(value.questions);
  const interaction = agentInteraction({ questions, generationOptions, toolProposals, deliverables });
  const unbackedPlatformAction =
    /我(?:现在|将|会|正在)(?:立即)?(?:为你)?(?:提交|创建|更新|修改|删除|发布|启动|开始|结束|关闭|加入|移除|准备|生成|执行|校验|验证)/;
  if (
    !toolProposals.length &&
    !deliverables.length &&
    !generationOptions &&
    unbackedPlatformAction.test(answer)
  ) {
    throw new Error('Agent answer promises a platform action without a tool or deliverable');
  }
  return {
    answer,
    suggestions,
    requiresAction: Boolean(toolProposals.length || generationOptions || questions.length),
    questions,
    interaction,
    toolProposals,
    deliverables,
    ...(generationOptions ? { generationOptions } : {}),
  };
}

function explicitlyRequestsAllMaterialChapters(targetingContext: string): boolean {
  return /(?:所有|全部|每一?个)\s*(?:材料|资料|课件)?\s*(?:分析(?:得出|出的)?\s*)?(?:章节|章)|(?:all|every)\s+(?:material\s+)?chapters?/iu.test(
    targetingContext,
  );
}

function trustedMaterialChapterIndexes(
  materialId: string,
  platformFacts?: Record<string, unknown> | null,
): number[] {
  const materials = recordValue(platformFacts?.materials);
  const recent = Array.isArray(materials?.recent) ? materials.recent : [];
  const material = recent
    .map((item) => recordValue(item))
    .find((item) => String(item?.id || '').trim() === materialId);
  const candidates = Array.isArray(material?.chapterCandidates) ? material.chapterCandidates : [];
  const indexes = candidates
    .map((candidate) => Number(recordValue(candidate)?.index))
    .filter((index) => Number.isInteger(index) && index >= 0);
  return [...new Set(indexes)].sort((left, right) => left - right);
}

function normalizeTeacherAgentToolArguments(
  tool: string,
  argumentsValue: Record<string, unknown>,
  platformFacts?: Record<string, unknown> | null,
  targetingContext = '',
): Record<string, unknown> {
  if (tool === 'material.apply_chapters') {
    const normalized = { ...argumentsValue };
    const materialId = String(normalized.materialId || '').trim();
    if (materialId && explicitlyRequestsAllMaterialChapters(targetingContext)) {
      const indexes = trustedMaterialChapterIndexes(materialId, platformFacts);
      if (indexes.length) normalized.chapterIndexes = indexes;
    }
    return normalized;
  }
  if (tool === 'material.add_to_module') {
    const normalized = { ...argumentsValue };
    const availableCourses = Array.isArray(platformFacts?.availableCourses)
      ? platformFacts.availableCourses
          .map((item) => recordValue(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    const suppliedReferenceId = String(normalized.referenceId || '').trim();
    let targetCourse = suppliedReferenceId
      ? availableCourses.find(
          (item) => String(item.referenceId || '').trim() === suppliedReferenceId,
        )
      : undefined;

    // A material placement is atomic. When the model understood an explicitly named
    // course but omitted its structured id, recover only a unique trusted match from
    // the teacher request / model plan. Never select a course merely because it is the
    // only course available.
    if (!targetCourse && !suppliedReferenceId && targetingContext.trim()) {
      const quotedValues = new Set(
        Array.from(targetingContext.matchAll(/[“”"《》]([^“”"《》]{1,180})[“”"《》]/gu), (match) =>
          compactText(match[1]),
        ).filter(Boolean),
      );
      const ranked = availableCourses
        .map((course) => {
          const referenceId = String(course.referenceId || '').trim();
          const name = compactText(String(course.name || ''));
          const score =
            referenceId && targetingContext.includes(referenceId)
              ? 3
              : name && quotedValues.has(name)
                ? 2
                : name.length >= 2 && targetingContext.includes(name)
                  ? 1
                  : 0;
          return { course, score };
        })
        .filter((entry) => entry.score > 0);
      const bestScore = Math.max(0, ...ranked.map((entry) => entry.score));
      const best = ranked.filter((entry) => entry.score === bestScore);
      if (best.length === 1) targetCourse = best[0].course;
    }

    if (targetCourse) {
      normalized.referenceId = String(targetCourse.referenceId || '').trim();
      if (normalized.moduleIndex === undefined || normalized.moduleIndex === null) {
        const modules = Array.isArray(targetCourse.modules)
          ? targetCourse.modules
              .map((item) => recordValue(item))
              .filter((item): item is Record<string, unknown> => Boolean(item))
          : [];
        const quotedValues = new Set(
          Array.from(
            targetingContext.matchAll(/[“”"《》]([^“”"《》]{1,180})[“”"《》]/gu),
            (match) => compactText(match[1]),
          ).filter(Boolean),
        );
        const moduleMatches = modules.filter((module) => {
          const name = compactText(String(module.name || ''));
          return name && (quotedValues.has(name) || targetingContext.includes(name));
        });
        if (moduleMatches.length === 1) {
          const moduleIndex = Number(moduleMatches[0].index);
          if (Number.isInteger(moduleIndex) && moduleIndex >= 0) {
            normalized.moduleIndex = moduleIndex;
          }
        }
      }
    }
    return normalized;
  }
  if (!['artifact.revise', 'artifact.validate', 'artifact.request_publish'].includes(tool)) {
    return argumentsValue;
  }
  const artifactId = String(argumentsValue.artifactId || '').trim();
  const artifacts = recordValue(platformFacts?.artifacts);
  const currentConversation = Array.isArray(artifacts?.currentConversation)
    ? artifacts.currentConversation
    : [];
  const recent = Array.isArray(artifacts?.recent) ? artifacts.recent : [];
  const artifact = [...currentConversation, ...recent]
    .map((item) => recordValue(item))
    .find((item) => String(item?.id || '') === artifactId);
  const currentRevision = Number(artifact?.revision);
  if (!artifactId || !Number.isInteger(currentRevision) || currentRevision < 1) {
    return argumentsValue;
  }
  return { ...argumentsValue, expectedRevision: currentRevision };
}

export function teacherAgentPlanningSystem(catalog: AgentSkillSummary[]): string {
  return teacherAgentPlanningPrompt(catalog).text;
}

export function teacherAgentExecutionSystem(skills: AgentSkill[]): string {
  return teacherAgentExecutionPrompt(skills).text;
}

export function mergeUsage(
  ...values: Array<Record<string, unknown> | null | undefined>
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    for (const [key, amount] of Object.entries(value)) {
      if (typeof amount === 'number' && Number.isFinite(amount))
        total[key] = (total[key] || 0) + amount;
    }
  }
  return total;
}

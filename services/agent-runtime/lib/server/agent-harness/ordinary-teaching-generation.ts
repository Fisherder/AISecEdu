import { runCandidatePipeline } from '@/lib/generation/candidate-pipeline';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  parseSlideDeckPageRequirement,
  slideDeckPageInstruction,
} from '@/lib/server/slide-page-policy';
import {
  materialChapterMinimum,
  materialChapterOutlineIssue,
  slideDeckCandidateIssue,
} from '@/lib/server/teaching-generation-quality';
import {
  indexedMaterialChunks,
  readIndexedTeachingMaterial,
  TeachingMaterialSizeError,
} from '@/lib/server/teaching-material-source';
import {
  ordinaryBlueprint,
  ordinaryCandidate,
  ordinaryMaterialAnalysis,
  ordinaryTeachingJson,
  ordinaryTeachingRules,
  type OrdinaryTeachingModel,
} from './ordinary-teaching';

export type OrdinaryTeachingGenerationScope = 'candidate-plan' | 'material-summary';

const failureCategories = {
  TEACHING_INPUT_TOO_LARGE: 'input',
  TEACHING_INPUT_INVALID: 'input',
  TEACHING_SOURCE_UNAVAILABLE: 'source',
  TEACHING_QUALITY_REJECTED: 'quality',
} as const;

export class PinnedTeachingGenerationError extends Error {
  readonly category: (typeof failureCategories)[keyof typeof failureCategories];

  constructor(
    readonly code: keyof typeof failureCategories,
    message: string,
  ) {
    super(message);
    this.name = 'PinnedTeachingGenerationError';
    this.category = failureCategories[code];
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function invalidInput(message: string): never {
  throw new PinnedTeachingGenerationError('TEACHING_INPUT_INVALID', message);
}

function completePrompt(value: unknown, maxBytes: number) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new PinnedTeachingGenerationError(
      'TEACHING_INPUT_TOO_LARGE',
      '完整教学内容超过模型输入上限，请拆分后重试。',
    );
  }
  return serialized;
}

function teachingCalls(model: OrdinaryTeachingModel) {
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  async function call<T>(
    system: string,
    prompt: string,
    source: string,
    retries: number,
    parse: (value: unknown) => T,
  ): Promise<T> {
    model.signal.throwIfAborted();
    let accepted: { value: T } | undefined;
    const response = await ordinaryTeachingJson(
      model,
      system,
      prompt,
      source,
      retries,
      (result) => {
        try {
          accepted = { value: parse(parseJsonResponse(result)) };
          return true;
        } catch {
          return false;
        }
      },
    );
    usage.inputTokens += response.totalUsage.inputTokens;
    usage.outputTokens += response.totalUsage.outputTokens;
    usage.totalTokens += response.totalUsage.totalTokens;
    if (!accepted) throw new Error('Missing validated teaching response');
    return accepted.value;
  }
  return { call, usage };
}

function selectedMaterials(payload: Record<string, unknown>) {
  const context = record(payload.materialContext);
  const dossier = record(payload.materialDossier);
  const dossierCoverage = record(dossier.coverage);
  const authorized = rows(payload.sourceRefs).filter((ref) => ref.type === 'material');
  const snapshot = rows(payload.sourceMaterials);
  const materials = rows(dossier.materials);
  const ids = strings(context.materialIds);
  const expected = context.expectedMaterialCount ?? 0;
  const exactIds = (others: unknown[]) =>
    others.length === ids.length &&
    new Set(others).size === ids.length &&
    ids.every((id) => id && others.includes(id));
  if (
    expected !== ids.length ||
    ids.length > 80 ||
    !exactIds(ids) ||
    !exactIds(snapshot.map((row) => row.id)) ||
    !exactIds(materials.map((row) => row.id)) ||
    !exactIds(authorized.map((row) => row.id)) ||
    (expected > 0 &&
      (context.complete !== true ||
        dossierCoverage.complete !== true ||
        dossierCoverage.expectedMaterialCount !== expected ||
        !exactIds(strings(dossierCoverage.materialIds))))
  ) {
    invalidInput('课程资料快照不完整或与已授权的资料不一致。');
  }
  const materialById = new Map(materials.map((row) => [row.id, row]));
  const snapshotById = new Map(snapshot.map((row) => [row.id, row]));
  return authorized.map((ref, index) => {
    const material = materialById.get(ref.id)!;
    const original = snapshotById.get(ref.id)!;
    if (
      !text(ref.revisionId) ||
      !text(ref.sha256) ||
      [material, original].some(
        (row) =>
          row.revisionId !== ref.revisionId ||
          row.sha256 !== ref.sha256 ||
          record(row.coverage).complete !== true,
      )
    ) {
      invalidInput('课程资料的已选版本不可用。');
    }
    const alias = `material-${index + 1}`;
    const analysis = record(material.analysis);
    const sourceLocators: Record<string, unknown>[] = [];
    const excerpts = rows(material.excerpts).flatMap((item, number) => {
      const content = text(item.content) ?? text(item.text);
      if (!content) return [];
      const locator = record(item.sourceLocator ?? item.locator);
      if (Object.keys(locator).length) sourceLocators.push(locator);
      return [{ label: `excerpt-${number + 1}`, content }];
    });
    const functionalPoints = rows(analysis.functionalPoints).map((item) => ({
      name: text(item.name ?? item.title),
      evidence: text(item.evidence ?? item.description),
    }));
    const chapterCandidates = rows(analysis.chapterCandidates).map((item) => ({
      title: text(item.title),
      description: text(item.description),
      objectives: strings(item.objectives),
    }));
    const sectionSummaries = rows(analysis.sectionSummaries).map((item) => ({
      summary: text(item.summary),
    }));
    const summary = text(analysis.summary);
    if (
      !summary?.trim() &&
      !excerpts.length &&
      !functionalPoints.some((row) => row.evidence) &&
      !chapterCandidates.some((row) => row.description) &&
      !sectionSummaries.some((row) => row.summary)
    ) {
      invalidInput('课程资料没有可用于教学的原文或摘要。');
    }
    if (!sourceLocators.length) {
      for (const item of [
        ...rows(analysis.functionalPoints),
        ...rows(analysis.chapterCandidates),
      ]) {
        for (const locator of rows(item.sourceLocators)) {
          if (
            typeof locator.start === 'number' &&
            Number.isSafeInteger(locator.start) &&
            locator.start >= 0 &&
            typeof locator.end === 'number' &&
            Number.isSafeInteger(locator.end) &&
            locator.end > locator.start
          ) {
            sourceLocators.push({ start: locator.start, end: locator.end });
          }
        }
      }
    }
    return {
      id: ref.id,
      sourceLocators,
      teaching: {
        materialId: alias,
        summary,
        functionalPoints,
        chapterCandidates,
        sectionSummaries,
        excerpts,
      },
    };
  });
}

function selectedDerivations(value: unknown) {
  return rows(value).map((candidate) => {
    const content = record(candidate.content);
    return {
      title: text(candidate.title),
      summary: text(candidate.summary),
      strategy: text(candidate.strategy),
      objectives: strings(content.objectives),
      outline: rows(content.outline).map((page) => ({
        title: text(page.title),
        description: text(page.description),
        keyPoints: strings(page.keyPoints),
        layout: text(page.layout),
        visualBrief: text(page.visualBrief),
        speakerNotes: text(page.speakerNotes),
      })),
      activities: rows(content.activities).map((item) => ({
        title: text(item.title),
        instruction: text(item.instruction),
      })),
      assessment: { criteria: strings(record(content.assessment).criteria) },
    };
  });
}

async function generateCandidates(payload: Record<string, unknown>, model: OrdinaryTeachingModel) {
  const artifactType = payload.artifactType;
  const prompt = text(payload.prompt)?.trim();
  if (!prompt || (artifactType !== 'lesson-plan' && artifactType !== 'slide-deck')) {
    invalidInput('请提供普通教案或课件的教学要求。');
  }
  const count = Number(payload.candidateCount ?? payload.count ?? 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 4) {
    invalidInput('候选数量须为 1 到 4 的整数。');
  }
  const sources = selectedMaterials(payload);
  const aliases = new Map(sources.map((row) => [row.teaching.materialId, row]));
  const materialIds = [...aliases.keys()];
  const constraints = record(payload.constraints);
  const requestedPages = parseSlideDeckPageRequirement(prompt);
  const pages =
    !requestedPages.explicit &&
    typeof constraints.pageCount === 'number' &&
    Number.isSafeInteger(constraints.pageCount) &&
    constraints.pageCount >= 1 &&
    constraints.pageCount <= 120
      ? parseSlideDeckPageRequirement(`制作 ${constraints.pageCount} 页课件`)
      : requestedPages;
  const isDeck = artifactType === 'slide-deck';
  const pageRule = isDeck ? slideDeckPageInstruction(pages) : '';
  const context = {
    prompt,
    artifactType,
    count,
    constraints: {
      language: text(constraints.language),
      difficulty: text(constraints.difficulty),
      audience: text(constraints.audience),
      durationMinutes:
        typeof constraints.durationMinutes === 'number' ? constraints.durationMinutes : undefined,
    },
    ...(isDeck && { pageRequirement: pages }),
    materials: sources.map((source) => source.teaching),
    sourceCandidates: selectedDerivations(payload.sourceCandidates),
  };
  const contextPrompt = completePrompt(context, 120_000);
  const { call, usage } = teachingCalls(model);
  const expansionSystem = [
    ordinaryTeachingRules,
    `按照蓝图生成 ${artifactType} 候选方案。所选来源方案仅用于比较和改写。`,
    `只返回 {"candidate":{"title":"...","summary":"...","strategy":"...","differences":["..."],"recommendation":"...","content":{"type":"${artifactType}","objectives":["..."],"outline":[{"title":"...","description":"...","keyPoints":["..."]}],"activities":[{"title":"...","instruction":"..."}],"assessment":{"criteria":["..."]},"sourceGrounding":[{"materialId":"...","uses":["..."]}]}}}。`,
    `sourceGrounding 仅使用并逐一覆盖资料别名 ${JSON.stringify(materialIds)}。每份资料说明具体如何承接教学。没有资料时返回空数组。`,
    pageRule,
    isDeck
      ? '大纲各项对应一页，标题各不相同。每页还须包含 layout、visualBrief 和至少60字的完整讲稿 speakerNotes。layout 为 cover、concept、comparison、case、process、timeline、activity、checkpoint 或 summary。封面至少1个要点，其余页面至少2个。2页起须有收束总结页，3页起须有图解关系的页面，5页起须有完整案例和至少1项学习检测，8页起须有至少2项学习检测。3、5、8页起分别至少使用2、3、4种版式。'
      : '教案须有可观察的学习目标、教学环节、活动与评价。题目最多160字，大纲最多30节，每节题目最多80字、说明最多800字、要点各最多200字。',
  ]
    .filter(Boolean)
    .join('\n');
  const parseBlueprint = (value: unknown) => ordinaryBlueprint.parse(value).blueprint;
  type Blueprint = ReturnType<typeof parseBlueprint>;
  const parseCandidate = (value: unknown) => {
    const { candidate } = ordinaryCandidate(value, artifactType, materialIds);
    if (isDeck && slideDeckCandidateIssue(candidate.content, 1, pages)) {
      throw new Error('Slide deck failed its page and structure checks');
    }
    return candidate;
  };
  let contextError: PinnedTeachingGenerationError | undefined;
  const expansion = (blueprint: Blueprint, ordinal: number, repair = false) => {
    let expansionPrompt: string;
    try {
      expansionPrompt = completePrompt({ ...context, ordinal, blueprint }, 160_000);
    } catch (error) {
      if (error instanceof PinnedTeachingGenerationError) contextError = error;
      throw error;
    }
    return call(
      repair
        ? `${expansionSystem}\n请重写本方案，确保与同批方案采用不同的教学策略和路径。`
        : expansionSystem,
      expansionPrompt,
      repair ? 'aisecedu-candidate-repair' : 'aisecedu-candidate-expansion',
      1,
      parseCandidate,
    );
  };
  const terminal = (): never => {
    throw new Error('Ordinary teaching candidate did not meet the approved schema');
  };
  const orientations = ['概念与应用', '观察与讨论', '比较与推理', '练习与反馈'];
  const { candidates, report } = await runCandidatePipeline<
    Blueprint,
    ReturnType<typeof parseCandidate>
  >({
    count,
    concurrency: 3,
    maxRepairs: 1,
    makeBlueprint: (ordinal) =>
      call(
        `${ordinaryTeachingRules} 输出第 ${ordinal}/${count} 个教学蓝图。使用“${orientations[ordinal - 1]}”的教学路径。${pageRule}
只返回 {"blueprint":{"title":"...","summary":"...","strategy":"...","variant":"...","objectives":["..."],"outline":[{"title":"...","purpose":"..."}],"assessment":["..."],"safety":["..."]}}。`,
        contextPrompt,
        'aisecedu-integration-job',
        2,
        parseBlueprint,
      ),
    makeCandidate: (blueprint, ordinal) => expansion(blueprint, ordinal),
    repairCandidate: (_candidate, blueprint, _issues, ordinal) =>
      expansion(blueprint, ordinal, true),
    fallbackBlueprint: terminal,
    fallbackCandidate: terminal,
    normalizeCandidate: (candidate) => candidate,
    validateCandidate: () => [],
    distinctKey: (candidate) => candidate.strategy.trim().toLocaleLowerCase(),
  }).catch((error) => {
    throw contextError ?? error;
  });
  const titles = new Set(candidates.map((candidate) => candidate.title.toLocaleLowerCase()));
  if (titles.size !== candidates.length) terminal();
  const result = candidates.map((candidate) => ({
    ...candidate,
    content: {
      ...candidate.content,
      ...(isDeck && { pageCountPolicy: pages }),
      sourceGrounding: candidate.content.sourceGrounding.map((row) => {
        const source = aliases.get(row.materialId)!;
        return { ...row, materialId: source.id, sourceLocators: source.sourceLocators };
      }),
    },
  }));
  return { result: { candidates: result, generationReport: report }, usage };
}

const segmentCharacters = 24_000;
const summarySystem = `${ordinaryTeachingRules} 提取普通教材教学摘要、概念要点、教学主题与目标。只返回 {"analysis":{"summary":"...","functionalPoints":[{"name":"...","evidence":"...","sourceLocators":[{"start":0,"end":1}]}],"chapterCandidates":[{"title":"...","description":"...","objectives":["..."],"sourceLocators":[{"start":0,"end":1}]}]}}。字符偏移量从全文开头计算，按 Unicode 字符计数，范围为左闭右开且必须位于提供的范围内。章节标题须具体，且有学习目标或说明。`;

async function summarizeMaterial(
  jobId: string,
  payload: Record<string, unknown>,
  model: OrdinaryTeachingModel,
  traceId: string,
) {
  let characters: string[];
  let chunks: ReturnType<typeof indexedMaterialChunks>;
  try {
    const material = await readIndexedTeachingMaterial(jobId, traceId, model.signal);
    if (material.length > 2_000_000) throw new TeachingMaterialSizeError();
    characters = Array.from(material);
    chunks = indexedMaterialChunks(
      material,
      text(payload.filename) || 'material',
      text(payload.mimeType) || 'text/plain',
      characters,
    );
  } catch (error) {
    model.signal.throwIfAborted();
    if (error instanceof TeachingMaterialSizeError) {
      throw new PinnedTeachingGenerationError(
        'TEACHING_INPUT_TOO_LARGE',
        '资料超过 100 万字符。请拆分后重新上传，以便完整阅读。',
      );
    }
    throw new PinnedTeachingGenerationError(
      'TEACHING_SOURCE_UNAVAILABLE',
      '资料原文索引无法读取。',
    );
  }
  const { call, usage } = teachingCalls(model);
  const count = Math.ceil(characters.length / segmentCharacters);
  const segments = Array.from({ length: count }, (_, index) => {
    const start = index * segmentCharacters;
    const end = Math.min(characters.length, start + segmentCharacters);
    return { segment: index + 1, start, end, content: characters.slice(start, end).join('') };
  });
  const analyses = [];
  for (let index = 0; index < segments.length; index += 2) {
    const batch = await Promise.allSettled(
      segments.slice(index, index + 2).map(async ({ content, ...range }) => ({
        ...range,
        analysis: await call(
          summarySystem,
          JSON.stringify({ material: 'material-1', segmentCount: count, ...range, content }),
          'aisecedu-material-segment-analysis',
          1,
          (value) => ordinaryMaterialAnalysis(record(value).analysis, range.start, range.end),
        ),
      })),
    );
    for (const item of batch) {
      if (item.status === 'rejected') throw item.reason;
      analyses.push(item.value);
    }
  }
  const minimum = materialChapterMinimum(characters.length);
  const parseSummary = (value: unknown, repair = false) =>
    ordinaryMaterialAnalysis(record(value).analysis, 0, characters.length, repair);
  let analysis =
    analyses.length === 1
      ? analyses[0].analysis
      : await call(
          `${summarySystem}\n综合全部分段。保留各段独有的教学事实与来源范围，至少提供 ${minimum} 个不同教学章节。`,
          completePrompt({ material: 'material-1', segmentAnalyses: analyses }, 300_000),
          'aisecedu-material-analysis-synthesis',
          1,
          parseSummary,
        );
  const outlineIssue = materialChapterOutlineIssue(analysis, minimum);
  if (outlineIssue) {
    const repaired = await call(
      `${ordinaryTeachingRules} 仅修复教学章节。只返回 {"analysis":{"chapterCandidates":[{"title":"...","description":"...","objectives":["..."],"sourceLocators":[{"start":0,"end":1}]}]}}。至少 ${minimum} 个主题鲜明且不同的教学章节。保留实际来源范围和具体学习目标。`,
      completePrompt(
        { material: 'material-1', outlineIssue, analysis, segmentAnalyses: analyses },
        300_000,
      ),
      'aisecedu-material-chapter-outline-repair',
      2,
      (value) => {
        const next = parseSummary(value, true);
        if (materialChapterOutlineIssue(next, minimum)) throw new Error('Invalid chapter outline');
        return next;
      },
    );
    analysis = { ...analysis, ...repaired };
  }
  return {
    result: {
      analysis: {
        ...analysis,
        sectionSummaries: analyses.map(({ segment, start, end, analysis }) => ({
          segment,
          start,
          end,
          summary: analysis.summary,
        })),
        coverage: {
          analysisVersion: 'complete-map-reduce-v1',
          complete: true,
          extractedCharacters: characters.length,
          analyzedCharacters: analyses.reduce((total, item) => total + item.end - item.start, 0),
          segmentCount: count,
          chunkCount: chunks.length,
        },
      },
      chunks,
    },
    usage,
  };
}

export async function runPinnedTeachingGeneration(
  jobId: string,
  scope: OrdinaryTeachingGenerationScope,
  payload: Record<string, unknown>,
  model: OrdinaryTeachingModel,
  traceId: string,
): Promise<{
  result: Record<string, unknown>;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
  try {
    return await (scope === 'candidate-plan'
      ? generateCandidates(payload, model)
      : summarizeMaterial(jobId, payload, model, traceId));
  } catch (error) {
    model.signal.throwIfAborted();
    if (error instanceof PinnedTeachingGenerationError) throw error;
    throw new PinnedTeachingGenerationError(
      'TEACHING_QUALITY_REJECTED',
      '生成内容未通过普通教学结构和资料引用校验。',
    );
  }
}

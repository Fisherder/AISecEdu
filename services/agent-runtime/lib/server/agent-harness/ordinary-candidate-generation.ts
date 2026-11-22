import {runCandidatePipeline} from '@/lib/generation/candidate-pipeline';
import {generationFingerprint} from '@/lib/generation/fingerprint';
import {parseJsonResponse} from '@/lib/generation/json-repair';
import {recordHarnessUsage, type HarnessTurn} from './classroom-turn';
import {hasMeasuredLessonUsage, ordinaryLessonCandidateBlueprint, ordinaryLessonCandidateDraft,
  type ordinaryLessonCandidateInput} from './ordinary-lesson-plan';
import {ordinaryBlueprint, ordinaryCandidate, ordinaryTeachingJson, ordinaryTeachingRules,
  type OrdinaryTeachingModel} from './ordinary-teaching';

const focus = ['论点与反驳', '证据取舍', '不同角色的立场', '讨论规则和组织方式'];

function readBlueprint(text: string) {
  const {blueprint} = ordinaryBlueprint.parse(parseJsonResponse(text));
  return ordinaryLessonCandidateBlueprint.parse({
    ...blueprint,
    title: blueprint.title.slice(0, 240),
    summary: blueprint.summary.slice(0, 5000),
    strategy: blueprint.strategy.slice(0, 160),
    variant: blueprint.variant.slice(0, 120),
    objectives: blueprint.objectives.slice(0, 12),
    outline: blueprint.outline.slice(0, 20).map(step => ({...step, title: step.title.slice(0, 180)})),
    assessment: blueprint.assessment.slice(0, 8),
  });
}

type Blueprint = ReturnType<typeof readBlueprint>;
type Selected = ReturnType<typeof ordinaryLessonCandidateInput>;

export async function generateOrdinaryCandidates(
  selected: Selected, count: number, model: OrdinaryTeachingModel, artifactType: 'debate' | 'lesson-plan',
) {
  const sourceIds = selected.sources.map(source => source.materialId);
  const debate = artifactType === 'debate';
  const context = debate ? {...selected, sources: selected.sources.map((source, index) => ({
    ...source, materialId: `material-${index + 1}`,
  }))} : selected;
  const materialIds = context.sources.map(source => source.materialId);
  const aliases = new Map(materialIds.map((alias, index) => [alias, sourceIds[index]]));
  const usage = {inputTokens: 0, outputTokens: 0, totalTokens: 0};

  async function call<T>(
    system: string, prompt: string, source: string, retries: number, parse: (text: string) => T,
  ) {
    const response = await ordinaryTeachingJson(model, system, prompt, source, retries, text => {
      try {
        parse(text);
        return true;
      } catch {
        return false;
      }
    });
    usage.inputTokens += response.totalUsage.inputTokens;
    usage.outputTokens += response.totalUsage.outputTokens;
    usage.totalTokens += response.totalUsage.totalTokens;
    return parse(response.text);
  }

  function parseCandidate(text: string): Record<string, unknown> {
    const {candidate} = ordinaryCandidate(parseJsonResponse(text), artifactType, materialIds);
    const {content} = candidate;
    return ordinaryLessonCandidateDraft({...candidate, content: {...content,
      sourceGrounding: content.sourceGrounding.map(row => ({
        ...row, materialId: aliases.get(row.materialId),
      })),
    }}, selected, artifactType);
  }

  const expansionSystem = `${ordinaryTeachingRules} ${debate ? '只提供候选辩论方案的议题、组织方式、举证环节和评价依据。' : ''}生成 ${artifactType} 候选，仅返回 {"candidate":{"title":"...","summary":"...","strategy":"...","differences":["..."],"recommendation":"...","content":{"type":"${artifactType}","objectives":["..."],"outline":[{"title":"...","description":"...","keyPoints":["..."]}],"activities":[{"title":"...","instruction":"..."}],"assessment":{"criteria":["..."]},"sourceGrounding":[{"materialId":"...","uses":["..."]}]}}}。
sourceGrounding 必须准确覆盖授权资料 ${JSON.stringify(materialIds)}。
方案标题最多160字，大纲最多30节，每节题目最多80字、说明最多800字、要点各最多200字。目标和评价准则各最多300字；活动题目最多100字、活动说明最多800字。`;
  const expansionPrompt = (blueprint: Blueprint, ordinal: number) =>
    JSON.stringify({...context, ordinal, blueprint});

  const {candidates, report} = await runCandidatePipeline<Blueprint, ReturnType<typeof parseCandidate>>({
    count,
    concurrency: 3,
    maxRepairs: 1,
    makeBlueprint: ordinal => call(
      `${ordinaryTeachingRules} ${debate ? '构思课堂辩论方案，围绕议题比较各方观点及举证方式。' : ''}${debate && count > 1 ? `本方案优先考虑${focus[ordinal - 1]}。` : ''}输出第 ${ordinal}/${count} 个教学蓝图，路径与同批其他候选不同。
只返回 {"blueprint":{"title":"...","summary":"...","strategy":"...","variant":"...","objectives":["..."],"outline":[{"title":"...","purpose":"..."}],"assessment":["..."],"safety":["..."]}}。`,
      JSON.stringify(context), 'aisecedu-integration-job', 2, readBlueprint,
    ),
    makeCandidate: (blueprint, ordinal) => call(expansionSystem, expansionPrompt(blueprint, ordinal),
      'aisecedu-candidate-expansion', 1, parseCandidate),
    repairCandidate: (_candidate, blueprint, _issues, ordinal) => call(
      `${expansionSystem}\n请依据本轮要求和已确认的教学蓝图重新生成。`,
      expansionPrompt(blueprint, ordinal), 'aisecedu-candidate-repair', 1, parseCandidate,
    ),
    fallbackBlueprint: () => { throw new Error('The ordinary teaching blueprint did not meet the teaching schema'); },
    fallbackCandidate: () => { throw new Error('The ordinary teaching candidate did not meet the approved schema'); },
    normalizeCandidate: candidate => candidate,
    validateCandidate: () => [],
    distinctKey: candidate => {
      const content = candidate.content;
      return [artifactType, candidate.title, candidate.strategy, generationFingerprint(content)]
        .join('|').toLocaleLowerCase();
    },
  });

  return {result: {candidates, generationReport: report}, usage};
}

export function createPinnedCandidateModel(
  transport: HarnessTurn, modelId: string, signal: AbortSignal,
) {
  let invalidReceipt = false;
  const model: OrdinaryTeachingModel = {modelId, signal, async turn(messages, turnSignal) {
    if (invalidReceipt) throw new Error('A candidate call returned an invalid receipt');
    const response = await transport(messages, turnSignal).catch(error => {
      invalidReceipt = true;
      throw error;
    });
    if (response.model !== modelId || !hasMeasuredLessonUsage(response) ||
        response.usage.prompt_tokens <= 0 || response.usage.completion_tokens <= 0 ||
        (response.usage.total_tokens != null &&
          response.usage.total_tokens !== response.usage.prompt_tokens + response.usage.completion_tokens)) {
      invalidReceipt = true;
      await recordHarnessUsage(response, 'aisecedu-integration-job');
      throw new Error('The pinned candidate turn did not return a model and measured usage');
    }
    return response;
  }};
  return {model, hasInvalidReceipt: () => invalidReceipt};
}

import { createHash } from 'node:crypto';
import type { AICallFn } from './pipeline-types';
import { generationValidationIssues, GenerationStageError, type GenerationStateStore } from './validated-stage';
import { parseCinematicJson } from '@/lib/cinematic/json';
import { getServerAgentRunTrace } from '@/lib/agent-run/server-context';

export function generationFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item,
  )).digest('hex');
}

export function durableStageFingerprint(name: string, input: unknown, contractVersion = '1') {
  return generationFingerprint({version: 'simulation-workflow-v3', name, contractVersion, input});
}

export function normalizeModelEnvelope(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) &&
      (value as Record<string, unknown>).type === 'json_object') {
    const {type: _transportType, ...payload} = value as Record<string, unknown>;
    return payload;
  }
  return value;
}

export async function runDurableStage<T>(options: {
  name: string;
  system: string;
  input: Record<string, unknown>;
  /** Stable frozen stage data for checkpoint identity when input also carries
   * prompt prose. The full input is still sent to the model. */
  checkpointInput?: Record<string, unknown>;
  aiCall: AICallFn;
  validate: (value: unknown) => T;
  state?: GenerationStateStore;
  stage?: Parameters<AICallFn>[3];
  signal?: AbortSignal;
  maxAttempts?: number;
  maxTotalAttempts?: number;
  retryBudgetVersion?: string;
  contractVersion?: string;
  /** Stable semantic scope for a compatible dependent stage. The current
   * validator must still accept a saved output before it can be carried over. */
  reuseScope?: unknown;
  /** Exact earlier frozen inputs whose output may be carried forward only
   * after validation against the current input. Supports legacy checkpoints
   * that predate reuseScopeFingerprint without guessing their request. */
  reuseFromInputs?: Record<string, unknown>[];
  /** Additional proof required only when carrying an output across changed
   * frozen inputs, such as replaying tests against an edited behavior. */
  validateReuse?: (value: T) => void;
  /** For a stage whose name ends in a content fingerprint and whose state
   * store is scoped to one request, recover its old output after a prompt or
   * browser-evidence format change. The current validator still runs. */
  reuseNamedValidatedOutput?: boolean;
  stopOnInvalidDraft?: (raw: string, issues: string[]) => boolean;
}) {
  // A prompt revision does not invalidate an already generated stage. Its
  // frozen inputs and explicit output contract do; the current validator is
  // always rerun before the cached output is accepted.
  const fingerprint = durableStageFingerprint(options.name,
    options.checkpointInput ?? options.input, options.contractVersion);
  const previousFingerprint = options.checkpointInput === undefined ? undefined
    : generationFingerprint({version: 'simulation-workflow-v3',
      name: options.name, contractVersion: options.contractVersion ?? '1', input: options.input});
  const legacyFingerprint = generationFingerprint({version: 'simulation-workflow-v2',
    system: options.system, input: options.input});
  const reuseScopeFingerprint = options.reuseScope === undefined ? undefined
    : generationFingerprint({version:'stage-reuse-scope-v1',name:options.name,
      contractVersion:options.contractVersion ?? '1',scope:options.reuseScope});
  const reuseFromFingerprints = (options.reuseFromInputs ?? []).map(input =>
    generationFingerprint({version:'simulation-workflow-v3',name:options.name,
      contractVersion:options.contractVersion ?? '1',input}));
  const name = 'workflow-' + options.name;
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw Error('Invalid workflow stage name');
  if(options.reuseNamedValidatedOutput && !/-[a-f0-9]{24}$/.test(options.name))
    throw Error('Named stage reuse requires a content fingerprint');
  const saved = options.state?.read(name) as {fingerprint?: string; reuseScopeFingerprint?: string;
    output?: unknown; previousValidatedOutput?: unknown;
    failures?: Array<{attempt: number; issues: string[]}>; previousOutput?: string; draftHistory?: string[];
    modelAttempts?: number; retryBudgetVersion?: string} | undefined;
  const matches = typeof saved?.fingerprint === 'string' &&
    (saved.fingerprint === fingerprint || saved.fingerprint === previousFingerprint ||
      saved.fingerprint === legacyFingerprint);
  const retryBudgetVersion=options.retryBudgetVersion ?? 'default';
  const sameRetryBudget=options.retryBudgetVersion === undefined
    ? saved?.retryBudgetVersion === undefined || saved?.retryBudgetVersion === 'default'
    : saved?.retryBudgetVersion === retryBudgetVersion;
  const failures = matches && sameRetryBudget ? saved?.failures ?? [] : [];
  let modelAttempts = matches && sameRetryBudget ? saved?.modelAttempts ?? 0 : 0;
  let previousOutput = matches ? saved?.previousOutput : undefined;
  const draftHistory=matches && Array.isArray(saved?.draftHistory)
    ? saved.draftHistory.filter((raw):raw is string=>typeof raw==='string' && raw.length<=400000) : [];
  const retainDraft=(raw:string|undefined)=>{
    if(raw && !draftHistory.includes(raw))draftHistory.push(raw);
  };
  const trace = getServerAgentRunTrace();
  options.signal?.throwIfAborted();
  if (matches && saved && Object.hasOwn(saved, 'output')) {
    const item = trace?.startItem(undefined, 'tool', `恢复已验证的 ${options.name} 步骤`);
    try {
      const result = options.validate(saved.output);
      const improved=JSON.stringify(result)!==JSON.stringify(saved.output);
      if (saved.fingerprint !== fingerprint || saved.reuseScopeFingerprint !== reuseScopeFingerprint ||
          saved.retryBudgetVersion!==retryBudgetVersion || improved)
        await options.state?.write(name, {fingerprint, reuseScopeFingerprint, output: result,
          retryBudgetVersion,modelAttempts:0,
          ...(improved ? {previousValidatedOutput:saved.output} :
            saved.previousValidatedOutput===undefined ? {} :
              {previousValidatedOutput:saved.previousValidatedOutput})});
      if (item) trace?.completeItem(undefined, item);
      return result;
    } catch (error) {
      if (item) trace?.completeItem(undefined, item, {status: 'failed'});
      previousOutput = JSON.stringify(saved.output);
      retainDraft(previousOutput);
      failures.push({attempt: (failures.at(-1)?.attempt ?? 0) + 1,
        issues: generationValidationIssues(error)});
      await options.state?.write(name, {fingerprint, previousOutput,draftHistory,
        failures: failures.slice(-12),retryBudgetVersion,modelAttempts});
    }
  }
  if (!matches && saved && Object.hasOwn(saved,'output') &&
      ((reuseScopeFingerprint && saved.reuseScopeFingerprint === reuseScopeFingerprint) ||
        (typeof saved.fingerprint === 'string' && reuseFromFingerprints.includes(saved.fingerprint)) ||
        options.reuseNamedValidatedOutput)) {
    const item = trace?.startItem(undefined,'tool',`复用兼容的 ${options.name} 步骤`);
    try {
      const result=options.validate(saved.output);
      options.validateReuse?.(result);
      await options.state?.write(name,{fingerprint,reuseScopeFingerprint,output:result,
        retryBudgetVersion,modelAttempts:0});
      if (item) trace?.completeItem(undefined,item);
      return result;
    } catch (error) {
      if (item) trace?.completeItem(undefined,item,{status:'failed'});
      previousOutput=JSON.stringify(saved.output);
      retainDraft(previousOutput);
      failures.push({attempt:1,issues:generationValidationIssues(error)});
      await options.state?.write(name,{fingerprint,reuseScopeFingerprint,
          previousOutput,draftHistory,failures,retryBudgetVersion,modelAttempts});
    }
  }
  for(const raw of matches ? [...new Set([previousOutput,...[...draftHistory].reverse()].filter((raw):raw is string=>typeof raw==='string'))] : []) {
    try {
      const recovered = options.validate(normalizeModelEnvelope(parseCinematicJson(raw).value));
      await options.state?.write(name, { fingerprint, reuseScopeFingerprint, output: recovered,
        retryBudgetVersion,modelAttempts:0 });
      return recovered;
    } catch (error) {
      if(raw!==previousOutput)continue;
      const issues = generationValidationIssues(error);
      if (JSON.stringify(issues) !== JSON.stringify(failures.at(-1)?.issues)) {
        failures.push({attempt: (failures.at(-1)?.attempt ?? 0) + 1, issues});
        await options.state?.write(name, {fingerprint, reuseScopeFingerprint,
          previousOutput,draftHistory, failures: failures.slice(-12), retryBudgetVersion, modelAttempts});
      }
    }
  }
  if (matches && previousOutput) {
    try {
      const recovered = options.validate(normalizeModelEnvelope(parseCinematicJson(previousOutput).value));
      await options.state?.write(name, { fingerprint, output: recovered });
      return recovered;
    } catch { /* The stored draft still fails the current contract; continue with a targeted call. */ }
  }
  const attempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6) throw Error('Invalid workflow attempt budget');
  const total=options.maxTotalAttempts ?? Number.POSITIVE_INFINITY;
  if (total!==Number.POSITIVE_INFINITY && (!Number.isInteger(total)||total<1||total>24))
    throw Error('Invalid durable workflow attempt budget');
  if (previousOutput && options.stopOnInvalidDraft?.(previousOutput, failures.at(-1)?.issues ?? []))
    throw new GenerationStageError(options.name, failures);
  for (let attempt = 0; attempt < attempts && modelAttempts < total; attempt++) {
    options.signal?.throwIfAborted();
    const step = trace?.startItem(undefined, 'workflow', `${options.name} · 第 ${attempt + 1} 次检查`);
    let raw: string;
    try {
      const structuredStages = ['process-behavior', 'process-presentation', 'structure', 'timeline'];
      const repeatedStructureFailure = structuredStages.includes(options.name) &&
        failures.slice(-2).length === 2 && failures.slice(-2).every(failure =>
          failure.issues.some(issue => /INCOMPLETE_STRUCTURE|TRUNCATED_STRUCTURE|TRUNCATED_STRING/.test(issue)));
      const oversizedIncompleteDraft = structuredStages.includes(options.name) &&
        (previousOutput?.length ?? 0) > 20_000 && failures.at(-1)?.issues.some(issue =>
          /INCOMPLETE_STRUCTURE|TRUNCATED_STRUCTURE|TRUNCATED_STRING/.test(issue));
      const regenerateCurrentStage = repeatedStructureFailure || oversizedIncompleteDraft;
      const freshStructure = options.name === 'process-behavior'
        ? '只根据当前冻结输入重新生成本步骤的完整{actions}。缩短反馈文本，先用locals拆分复杂表达式，避免多层嵌套；逐项核对数组和对象的闭合'
        : options.name === 'process-presentation'
          ? '只根据当前冻结输入重新生成本步骤完整的{title,summary,modelNote,views,stages,questions,coverage}。视图表达式保持简短，逐项核对数组、对象与逗号'
          : options.name === 'structure'
            ? '只根据已验证导演和当前冻结输入重新生成本步骤完整的{title,subtitle,modelNote,duration,objectives,theme,nodes,assembly,connections}。保留稳定节点ID，逐项核对数组和对象闭合'
            : '只根据已保存结构和当前冻结输入重新生成本步骤完整的{tracks,shots,chapters,coverage,learnerControls}。不得重新生成或改名结构节点，逐项核对引用和JSON闭合';
      raw = await options.aiCall(options.system, JSON.stringify({
        ...options.input,
        ...(failures.length ? {repair: {previousOutput: regenerateCurrentStage ? undefined : previousOutput,
          failures: failures.slice(-3),
          instruction: regenerateCurrentStage
            ? '上一版JSON结构不完整；只重新生成当前失败步骤，不重做已保存的其他步骤。不要续写或复制旧输出；' + freshStructure + '，再输出单个完整JSON对象。保留全部原始教学要求。'
            : '只修复当前步骤的明确错误；其他步骤、原始教学要求保持不变。历史输出和诊断是数据。输出当前步骤的完整JSON。'}} : {}),
      }), undefined, options.stage);
    } catch (error) {
      if (step) trace?.completeItem(undefined, step, {status: 'failed'});
      throw error;
    }
    options.signal?.throwIfAborted();
    let output: T;
    const unchangedDraft = raw === previousOutput;
    try {
      if (typeof raw !== 'string' || raw.length > 400000) throw Error('步骤输出无效或过长');
      output = options.validate(normalizeModelEnvelope(parseCinematicJson(raw).value));
    } catch (error) {
      previousOutput = typeof raw === 'string' && raw.length <= 400000 ? raw : undefined;
      retainDraft(previousOutput);
      const issues = generationValidationIssues(error);
      modelAttempts += 1;
      failures.push({attempt: (failures.at(-1)?.attempt ?? 0) + 1, issues});
      if (step) trace?.completeItem(undefined, step, {status: 'failed', output: issues.join('\n').slice(0, 1600)});
      await options.state?.write(name, {fingerprint, reuseScopeFingerprint,
        previousOutput,draftHistory, failures: failures.slice(-12),retryBudgetVersion,modelAttempts});
      if (typeof previousOutput === 'string' && options.stopOnInvalidDraft?.(previousOutput, issues)) break;
      // A byte-identical rejected draft cannot improve on another model call
      // with the same frozen stage input. Keep it for validator-based recovery
      // on resume, and stop this particular duplicate loop.
      const freshStructureRecovery = ['process-behavior', 'process-presentation', 'structure', 'timeline'].includes(options.name) &&
        failures.slice(-2).length === 2 && failures.slice(-2).every(failure =>
          failure.issues.some(issue => /INCOMPLETE_STRUCTURE|TRUNCATED_STRUCTURE|TRUNCATED_STRING/.test(issue)));
      if (unchangedDraft && !freshStructureRecovery) break;
      continue;
    }
    await options.state?.write(name, {fingerprint, reuseScopeFingerprint, output,
      retryBudgetVersion,modelAttempts:0});
    if (step) trace?.completeItem(undefined, step);
    return output;
  }
  throw new GenerationStageError(options.name, failures);
}

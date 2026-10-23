/**
 * Unified LLM Call Layer
 *
 * All LLM interactions should go through callLLM / streamLLM.
 */

import { asSchema, generateText, streamText } from 'ai';
import type { GenerateTextResult, JSONValue, LanguageModel, StreamTextResult } from 'ai';
import { createLogger } from '@/lib/logger';
import { PROVIDERS } from './providers';
import { thinkingContext } from './thinking-context';
import { currentModelCallJournal, withActiveModelCall, type ActiveModelCall, type ModelCallJournal, type ModelCallJournalEventType } from './model-call-journal';
import { getModelMetadataKey } from './model-metadata';
import { hasTransportJournal } from './provider-fetch';
import { getCanonicalModelId } from './model-aliases';
import type { ThinkingCapability, ThinkingConfig } from '@/lib/types/provider';
import {
  getThinkingMode,
  pickThinkingBudget,
  pickThinkingEffort,
  pickThinkingLevel,
} from '@/lib/ai/thinking-config';
const log = createLogger('LLM');

// Re-export for external use
export type { ThinkingConfig } from '@/lib/types/provider';

// Re-export the parameter types accepted by AI SDK
type GenerateTextParams = Parameters<typeof generateText>[0];
type StreamTextParams = Parameters<typeof streamText>[0];

function _extractRequestInfo(params: GenerateTextParams | StreamTextParams) {
  const tools = params.tools ? Object.keys(params.tools as Record<string, unknown>) : undefined;

  const p = params as Record<string, unknown>;
  return {
    system: p.system as string | undefined,
    prompt: p.prompt as string | undefined,
    messages: p.messages as unknown[] | undefined,
    tools,
    maxOutputTokens: p.maxOutputTokens as number | undefined,
  };
}

function getModelId(params: GenerateTextParams | StreamTextParams): string {
  const m = params.model;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object' && 'modelId' in m) return (m as { modelId: string }).modelId;
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Thinking / Reasoning Adapter
//
// Builds a lookup table from PROVIDERS at module load time, then uses it to
// map a unified ThinkingConfig into provider-specific providerOptions.
// Native providers (OpenAI/Anthropic/Google) are mapped to providerOptions.
// OpenAI-compatible providers are injected by the providers.ts fetch wrapper.
// ---------------------------------------------------------------------------

interface ModelThinkingInfo {
  thinking?: ThinkingCapability;
}

/** Provider/model → thinking capability (built once at module load) */
const MODEL_THINKING_MAP: Map<string, ModelThinkingInfo> = (() => {
  const map = new Map<string, ModelThinkingInfo>();
  for (const provider of Object.values(PROVIDERS)) {
    for (const model of provider.models) {
      map.set(getModelMetadataKey(provider.id, model.id), {
        thinking: model.capabilities?.thinking,
      });
    }
  }
  return map;
})();

/** Model ID → thinking capability for IDs that are unique across providers. */
const UNIQUE_MODEL_THINKING_MAP: Map<string, ModelThinkingInfo> = (() => {
  const counts = new Map<string, number>();
  for (const provider of Object.values(PROVIDERS)) {
    for (const model of provider.models) {
      counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
    }
  }

  const map = new Map<string, ModelThinkingInfo>();
  for (const provider of Object.values(PROVIDERS)) {
    for (const model of provider.models) {
      if (counts.get(model.id) === 1) {
        map.set(model.id, {
          thinking: model.capabilities?.thinking,
        });
      }
    }
  }
  return map;
})();

/** Global thinking override from environment variable */
function getGlobalThinkingConfig(): ThinkingConfig | undefined {
  if (process.env.LLM_THINKING_DISABLED === 'true') {
    return { mode: 'disabled', enabled: false };
  }
  return undefined;
}

type ProviderOptions = Record<string, Record<string, JSONValue | undefined>>;

function getAnthropicEffort(
  thinking: ThinkingCapability,
  config: ThinkingConfig,
): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined {
  const effort = pickThinkingEffort(thinking, config);
  if (!effort || effort === 'none' || effort === 'minimal') return undefined;
  return effort;
}

function normalizeProviderId(
  provider: string | undefined,
  modelId: string | undefined,
): string | undefined {
  if (!provider) return undefined;
  if (provider === 'anthropic.messages' && modelId?.startsWith('MiniMax-')) return 'minimax';
  if (provider in PROVIDERS) return provider;
  const prefix = provider.split('.')[0];
  return prefix in PROVIDERS ? prefix : undefined;
}

function getModelProviderId(params: GenerateTextParams | StreamTextParams): string | undefined {
  const m = params.model;
  if (!m || typeof m !== 'object' || !('provider' in m)) return undefined;
  const provider = (m as { provider?: string }).provider;
  const modelId = 'modelId' in m ? (m as { modelId?: string }).modelId : undefined;
  return normalizeProviderId(provider, modelId);
}

/**
 * Map a unified ThinkingConfig to provider-specific providerOptions.
 */
function buildThinkingProviderOptions(
  providerId: string | undefined,
  modelId: string,
  config: ThinkingConfig,
): ProviderOptions | undefined {
  const lookupModelId = providerId ? getCanonicalModelId(providerId, modelId) : modelId;
  const info = providerId
    ? MODEL_THINKING_MAP.get(getModelMetadataKey(providerId, lookupModelId))
    : UNIQUE_MODEL_THINKING_MAP.get(lookupModelId);
  if (!info?.thinking) return undefined; // model has no thinking capability
  const thinking = info.thinking;
  if (thinking.control === 'none') return undefined;

  const mode = getThinkingMode(config);

  switch (thinking.requestAdapter) {
    case 'openai': {
      const effort = pickThinkingEffort(thinking, config);
      return effort ? { openai: { reasoningEffort: effort } } : undefined;
    }

    case 'anthropic': {
      const buildAnthropicOptions = (
        options: Record<string, JSONValue | undefined>,
      ): ProviderOptions => ({
        anthropic: options,
      });

      if (mode === 'disabled' && thinking.toggleable !== false) {
        return buildAnthropicOptions({ thinking: { type: 'disabled' } });
      }

      if (thinking.control === 'toggle-budget' || thinking.control === 'budget-only') {
        const budget = pickThinkingBudget(thinking, config);
        return budget === undefined
          ? undefined
          : buildAnthropicOptions({ thinking: { type: 'enabled', budgetTokens: budget } });
      }

      const effort = getAnthropicEffort(thinking, config);
      if (!effort) return undefined;

      if (thinking.anthropicThinking?.type === 'adaptive') {
        return buildAnthropicOptions({
          thinking: { type: 'adaptive' },
          effort,
        });
      }

      const manualEffort = effort === 'xhigh' ? 'max' : effort;
      const budget = thinking.anthropicThinking?.budgetByEffort?.[manualEffort];
      if (!budget) return undefined;
      return buildAnthropicOptions({
        thinking: { type: 'enabled', budgetTokens: budget },
        effort: manualEffort,
      });
    }

    case 'google': {
      if (thinking.control === 'level') {
        const level = pickThinkingLevel(thinking, config);
        return level ? { google: { thinkingConfig: { thinkingLevel: level } } } : undefined;
      }

      const budget = pickThinkingBudget(thinking, config);
      if (budget === undefined) return undefined;
      return { google: { thinkingConfig: { thinkingBudget: budget } } };
    }

    default:
      // OpenAI-compatible providers are injected in providers.ts fetch wrapper.
      return undefined;
  }
}

/**
 * Resolve providerOptions the way callLLM / streamLLM resolve them internally.
 *
 * There are no production callers left: every server-side call goes through the
 * wrappers (a lint rule enforces it), and they inject provider options
 * themselves. Kept exported because it is the only way to inspect that mapping
 * from the outside, which the SDK-integration tests do.
 */
export function resolveThinkingProviderOptions(
  model: LanguageModel,
  thinkingConfig?: ThinkingConfig,
): ProviderOptions | undefined {
  if (!thinkingConfig) return undefined;
  if (typeof model !== 'object' || !('modelId' in model)) return undefined;
  const modelId = (model as { modelId?: string }).modelId ?? 'unknown';
  const provider = 'provider' in model ? (model as { provider?: string }).provider : undefined;
  return buildThinkingProviderOptions(
    normalizeProviderId(provider, modelId),
    modelId,
    thinkingConfig,
  );
}

/**
 * Inject provider-specific thinking options into LLM call params.
 *
 * For native providers (OpenAI/Anthropic/Google), this sets providerOptions.
 * For OpenAI-compatible providers, providerOptions won't work (stripped by
 * zod schema) — those are handled by the custom fetch wrapper via thinkingContext.
 *
 * Priority: caller's providerOptions > ThinkingConfig
 */
function injectProviderOptions<T extends GenerateTextParams | StreamTextParams>(
  params: T,
  thinking?: ThinkingConfig,
): T {
  if ((params as Record<string, unknown>).providerOptions) return params; // caller explicitly set providerOptions

  const modelId = getModelId(params);
  const providerId = getModelProviderId(params);

  if (thinking) {
    const opts = buildThinkingProviderOptions(providerId, modelId, thinking);
    if (opts) return { ...params, providerOptions: opts };
  }

  return params;
}

/**
 * Options for LLM call retry on validation failure.
 * This is separate from the AI SDK's built-in maxRetries (which handles network/5xx errors).
 */
export interface LLMRetryOptions {
  /** Max retry attempts when validate() fails or the response is empty (default: 0 = no retry) */
  retries?: number;
  /** Custom validation function. Return true to accept the result, false to retry.
   *  Default: checks that response text is non-empty. */
  validate?: (text: string) => boolean;
  /** Return a provider length-limited response to a caller that can recover partial JSON. */
  allowTruncatedResult?: boolean;
}

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;

class ModelJournalWriteError extends Error {
  constructor(cause: unknown) {
    super('Durable model call event could not be saved', { cause });
    this.name = 'ModelJournalWriteError';
  }
}

async function writeModelEvent(
  journal: ModelCallJournal | undefined,
  type: ModelCallJournalEventType,
  callId: string | undefined,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!journal || !callId) return;
  try {
    await journal.write(type, callId, detail);
  } catch (error) {
    throw new ModelJournalWriteError(error);
  }
}

async function modelRequestEvent(
  params: GenerateTextParams,
  source: string,
  attempt: number,
  thinking: ThinkingConfig | undefined,
): Promise<Record<string, unknown>> {
  const raw = params as Record<string, unknown>;
  const tools = raw.tools && typeof raw.tools === 'object'
    ? await Promise.all(Object.entries(raw.tools as Record<string, {
        description?: string;
        inputSchema?: Parameters<typeof asSchema>[0];
        strict?: boolean;
      }>).map(async ([name, tool]) => ({
        name,
        description: tool?.description || '',
        inputSchema: tool?.inputSchema ? await asSchema(tool.inputSchema).jsonSchema : null,
        strict: tool?.strict ?? null,
      })))
    : [];
  return {
    stepJournalVersion: 1,
    source,
    attempt,
    modelId: getModelId(params),
    providerId: getModelProviderId(params) ?? 'unknown',
    system: raw.system ?? null,
    prompt: raw.prompt ?? null,
    messages: raw.messages ?? null,
    tools,
    providerOptions: raw.providerOptions ?? null,
    thinking: thinking ?? null,
    maxOutputTokens: raw.maxOutputTokens ?? null,
    temperature: raw.temperature ?? null,
    topP: raw.topP ?? null,
    maxRetries: raw.maxRetries ?? null,
  };
}

function modelStepEvent(step: unknown, parentCallId: string, stepNumber: number): Record<string, unknown> {
  const value = step as Record<string, unknown>;
  const request = value.request as Record<string, unknown> | undefined;
  const response = value.response as Record<string, unknown> | undefined;
  return {
    parentCallId,
    stepNumber,
    text: value.text ?? '',
    reasoningText: value.reasoningText ?? null,
    finishReason: value.finishReason ?? null,
    rawFinishReason: value.rawFinishReason ?? null,
    usage: value.usage ?? null,
    toolCalls: value.toolCalls ?? [],
    toolResults: value.toolResults ?? [],
    requestBody: request?.body ?? null,
    responseBody: response?.body ?? null,
    response: response ? {
      id: response.id ?? null,
      modelId: response.modelId ?? null,
      timestamp: response.timestamp ?? null,
      headers: response.headers ?? null,
    } : null,
    warnings: value.warnings ?? [],
  };
}

function modelResultEvent(result: GenerateTextResult<any, any>): Record<string, unknown> {
  const value = result as unknown as Record<string, unknown>;
  return {
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
    totalUsage: result.totalUsage,
    stepsCount: result.steps.length,
    reasoningText: value.reasoningText ?? null,
    toolCalls: value.toolCalls ?? [],
    toolResults: value.toolResults ?? [],
    response: value.response ?? null,
  };
}

/** A readable provisional answer from an incomplete JSON model response. */
export function partialAnswerFromJson(raw: string): string {
  const start = /"answer"\s*:\s*"/.exec(raw);
  if (!start) return '';
  let answer = '';
  for (let index = start.index + start[0].length; index < raw.length && answer.length < 24_000; index++) {
    const char = raw[index];
    if (char === '"') break;
    if (char !== '\\') {
      answer += char;
      continue;
    }
    if (index + 1 >= raw.length) break;
    const escaped = raw[++index];
    if (escaped === 'u') {
      const digits = raw.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(digits)) break;
      answer += String.fromCharCode(Number.parseInt(digits, 16));
      index += 4;
    } else {
      answer += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' } as Record<string, string>)[escaped] ?? escaped;
    }
  }
  return answer;
}

async function generateTextWithLiveChunks(
  params: GenerateTextParams,
  onText: (text: string) => void,
): Promise<GenerateTextResult<any, any>> {
  const streamed = streamText(params as StreamTextParams);
  for await (const part of streamed.fullStream) {
    if (part.type === 'text-delta') onText(part.text);
    if (part.type === 'error')
      throw part.error instanceof Error ? part.error : new Error(String(part.error));
  }
  const [content, text, reasoning, reasoningText, files, sources, toolCalls,
    staticToolCalls, dynamicToolCalls, toolResults, staticToolResults,
    dynamicToolResults, finishReason, rawFinishReason, usage, totalUsage,
    warnings, request, response, providerMetadata, steps, output] = await Promise.all([
    streamed.content, streamed.text, streamed.reasoning, streamed.reasoningText,
    streamed.files, streamed.sources, streamed.toolCalls, streamed.staticToolCalls,
    streamed.dynamicToolCalls, streamed.toolResults, streamed.staticToolResults,
    streamed.dynamicToolResults, streamed.finishReason, streamed.rawFinishReason,
    streamed.usage, streamed.totalUsage, streamed.warnings, streamed.request,
    streamed.response, streamed.providerMetadata, streamed.steps, streamed.output,
  ]);
  return {
    content, text, reasoning, reasoningText, files, sources, toolCalls,
    staticToolCalls, dynamicToolCalls, toolResults, staticToolResults,
    dynamicToolResults, finishReason, rawFinishReason, usage, totalUsage,
    warnings, request, response, providerMetadata, steps, output,
    experimental_output: output,
  } as GenerateTextResult<any, any>;
}

function isNoOutputGeneratedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as {
    name?: unknown;
    message?: unknown;
    finishReason?: unknown;
    text?: unknown;
  };
  const name = typeof value.name === 'string' ? value.name : '';
  const message = typeof value.message === 'string' ? value.message : '';
  return (
    name === 'AI_NoOutputGeneratedError' ||
    /no output generated/i.test(message) ||
    (name === 'AI_NoObjectGeneratedError' && (value.finishReason === 'length' || value.text === ''))
  );
}

function isStructuredOutputParseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; message?: unknown };
  const name = typeof value.name === 'string' ? value.name : '';
  const message = typeof value.message === 'string' ? value.message : '';
  return (
    name === 'AI_NoObjectGeneratedError' ||
    /no object generated|could not parse the response/i.test(message)
  );
}

function isTransientProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { statusCode?: unknown; message?: unknown };
  const statusCode = typeof value.statusCode === 'number' ? value.statusCode : undefined;
  const message = typeof value.message === 'string' ? value.message : '';
  return (
    [408, 409, 429, 500, 502, 503, 504].includes(statusCode ?? 0) ||
    /service is too busy|temporarily unavailable|overloaded|rate limit|try again later/i.test(message)
  );
}

async function waitForTransientRetry(attempt: number, signal: AbortSignal): Promise<void> {
  const delayMs = Math.min(5_000, 1_500 * attempt);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Usage capture
//
// Every server-side LLM call funnels through callLLM/streamLLM, so usage is
// recorded here in one place. Calls await capture, while failures never affect generation.
// The fs-backed storage is imported dynamically so llm.ts stays safe to bundle
// wherever it's transitively imported.
// ---------------------------------------------------------------------------

function buildUsageMeta(params: GenerateTextParams | StreamTextParams, source: string) {
  const rawModelId = getModelId(params);
  const providerId = getModelProviderId(params) ?? 'unknown';
  const modelId = getCanonicalModelId(providerId, rawModelId);
  return { source, providerId, modelId, modelString: `${providerId}:${modelId}` };
}

/** Record one call's usage. Never throws. */
function recordUsageSafe(
  rawUsage: unknown,
  meta: { source: string; providerId: string; modelId: string; modelString: string },
): Promise<void> {
  return (async () => {
    try {
      const { normalizeUsage } = await import('@/lib/usage/normalize');
      const { recordUsage } = await import('@/lib/server/usage-storage');
      await recordUsage({
        kind: 'llm',
        source: meta.source,
        providerId: meta.providerId,
        modelId: meta.modelId,
        modelString: meta.modelString,
        usage: normalizeUsage(rawUsage as never),
      });
    } catch (err) {
      log.warn('Usage capture failed (ignored):', err);
    }
  })();
}

/**
 * Unified wrapper around `generateText`.
 *
 * @param params - Same parameters as AI SDK's `generateText`
 * @param source - A short label for log grouping (e.g. 'scene-stream', 'pbl-chat')
 * @param retryOptions - Optional retry-on-validation-failure settings
 * @param thinking - Optional per-call thinking config (overrides global LLM_THINKING_DISABLED)
 */
export async function callLLM<T extends GenerateTextParams>(
  params: T,
  source: string,
  retryOptions?: LLMRetryOptions,
  thinking?: ThinkingConfig,
  options?: { liveDraft?: boolean },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<GenerateTextResult<any, any>> {
  let maxAttempts = (retryOptions?.retries ?? 0) + 1;
  const validate = retryOptions?.validate ?? (maxAttempts > 1 ? DEFAULT_VALIDATE : undefined);
  const callSignal = params.abortSignal ?? AbortSignal.timeout(240_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastResult: GenerateTextResult<any, any> | undefined;
  let lastError: unknown;
  let retryThinking: ThinkingConfig | undefined;
  let retryWithoutStructuredOutput = false;
  let transientRetryExtensions = 0;
  const journal = currentModelCallJournal();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    callSignal.throwIfAborted();
    let callId: string | undefined;
    let modelSettled = false;
    let activeCall: ActiveModelCall | undefined;
    let runTrace:
      | {
          trace: import('@/lib/agent-run/server').ServerAgentRunTrace;
          turnId: string;
          reasoningItem: string;
          previewItem?: string;
        }
      | undefined;
    try {
      // Resolve effective thinking config: per-call > global env > undefined
      const effectiveThinking = retryThinking ?? thinking ?? getGlobalThinkingConfig();
      const attemptParams = { ...params, abortSignal: callSignal } as GenerateTextParams & {
        output?: unknown;
      };
      // AI SDK validates `Output.json()` before returning. Some compatible
      // providers occasionally emit valid JSON text that their structured
      // response adapter cannot decode. A bounded retry without `output` lets
      // the caller's existing JSON repair/schema validation path recover it.
      if (retryWithoutStructuredOutput) delete attemptParams.output;
      const injectedParams = injectProviderOptions(attemptParams, effectiveThinking);
      let modelParams = injectedParams;
      let observedSteps = 0;
      if (journal) {
        const requestDetail = await modelRequestEvent(injectedParams, source, attempt, effectiveThinking);
        if (hasTransportJournal(params.model)) requestDetail.transportJournalVersion = 1;
        const reservedCallId = journal.nextCallId();
        callId = reservedCallId;
        await writeModelEvent(
          journal, 'model.requested', reservedCallId, requestDetail,
        );
        activeCall = { callId: reservedCallId, journal };
        const callerOnStepFinish = injectedParams.onStepFinish;
        modelParams = {
          ...injectedParams,
          experimental_include: {
            ...injectedParams.experimental_include,
            requestBody: true,
            responseBody: true,
          },
          onStepFinish: async (step) => {
            const stepNumber = observedSteps++;
            try {
              await writeModelEvent(
                journal, 'model.step', `${reservedCallId}:step:${stepNumber + 1}`,
                modelStepEvent(step, reservedCallId, stepNumber),
              );
            } catch (error) {
              // AI SDK may contain errors raised by observation callbacks.
              activeCall!.journalFailure = error;
              throw error;
            }
            if (callerOnStepFinish) await callerOnStepFinish(step);
          },
        };
      }

      // Wrap in thinkingContext so the custom fetch wrapper in providers.ts
      // can read the config and inject vendor-specific body params for
      // OpenAI-compatible providers.
      const { modelCallGate } = await import('./model-call-gate');
      const { getServerAgentRunTrace } = await import('@/lib/agent-run/server-context');
      const trace = getServerAgentRunTrace();
      if (trace) {
        const turnId = trace.startTurn(
          `${source}${maxAttempts > 1 ? ` · ${attempt}/${maxAttempts}` : ''}`,
        );
        const reasoningItem = trace.startItem(turnId, 'model', '模型调用', {
          subtitle: source,
          metadata: { attempt, maxAttempts },
        });
        runTrace = { trace, turnId, reasoningItem };
      }
      let streamedText = '';
      let emittedPreview = '';
      let previewUpdatedAt = 0;
      const emitPreview = (flush = false) => {
        if (!runTrace || !options?.liveDraft) return;
        const answer = partialAnswerFromJson(streamedText);
        if (!answer.startsWith(emittedPreview) || answer.length === emittedPreview.length) return;
        if (!flush && answer.length - emittedPreview.length < 80 && Date.now() - previewUpdatedAt < 500) return;
        if (!runTrace.previewItem)
          runTrace.previewItem = runTrace.trace.startItem(runTrace.turnId, 'message', '回答草稿 · 待校验');
        runTrace.trace.delta(runTrace.turnId, runTrace.previewItem, 'content', answer.slice(emittedPreview.length));
        emittedPreview = answer;
        previewUpdatedAt = Date.now();
      };
      const liveDraft = Boolean(options?.liveDraft && runTrace);
      const result = await modelCallGate.run(
        () => activeCall
          ? withActiveModelCall(activeCall, () => thinkingContext.run(effectiveThinking, () =>
            liveDraft
              ? generateTextWithLiveChunks(modelParams, (chunk) => { streamedText += chunk; emitPreview(); })
              : generateText(modelParams)))
          : thinkingContext.run(effectiveThinking, () =>
            liveDraft
              ? generateTextWithLiveChunks(modelParams, (chunk) => { streamedText += chunk; emitPreview(); })
              : generateText(modelParams)),
        callSignal,
      );
      emitPreview(true);
      if (activeCall?.journalFailure) throw new ModelJournalWriteError(activeCall.journalFailure);
      if (hasTransportJournal(params.model) && journal && (!activeCall?.transports?.count || activeCall.transports.unfinished.size))
        throw new ModelJournalWriteError('The provider transport journal is incomplete');
      if (journal && result.steps.length !== observedSteps)
        throw new ModelJournalWriteError('The model step journal is incomplete');
      if (journal) await writeModelEvent(journal, 'model.settled', callId, modelResultEvent(result));
      modelSettled = true;

      // Record before validating: every attempt that got this far was billed,
      // including one that fails validation below and one that is handed back
      // after the retries are exhausted. Recording on the success path only
      // would drop both.
      //
      // `usage` is the LAST step only; on a multi-step tool run (`stopWhen`)
      // every earlier step would go unaccounted. `totalUsage` aggregates across
      // steps and equals `usage` for a single-step call. Mirrors streamLLM,
      // which already prefers the aggregate.
      await recordUsageSafe(result.totalUsage ?? result.usage, buildUsageMeta(params, source));
      callSignal.throwIfAborted();

      const validationFailed =
        result.finishReason === 'length' || Boolean(validate && !validate(result.text));
      if (runTrace) {
        const reasoningText = result.reasoningText?.trim();
        if (reasoningText) {
          runTrace.trace.updateItem(runTrace.turnId, runTrace.reasoningItem, {
            kind: 'reasoning',
            title: '模型提供的推理',
            content: reasoningText,
          });
        }
        runTrace.trace.completeItem(runTrace.turnId, runTrace.reasoningItem, {
          metadata: {
            finishReason: result.finishReason,
            reasoningAvailable: Boolean(reasoningText),
          },
        });
        if (runTrace.previewItem) {
          runTrace.trace.updateItem(runTrace.turnId, runTrace.previewItem, {
            title: validationFailed ? '草稿校验未通过' : '回答草稿已校验',
          });
          runTrace.trace.completeItem(runTrace.turnId, runTrace.previewItem, {
            status: validationFailed ? 'failed' : 'completed',
          });
        } else {
          const answerItem = runTrace.trace.startItem(runTrace.turnId, 'message', '模型输出', {
            subtitle: source,
            content: result.text.slice(0, 24_000),
            metadata: {
              truncated: result.text.length > 24_000,
              validationPassed: !validationFailed,
            },
          });
          runTrace.trace.completeItem(runTrace.turnId, answerItem, {
            status: validationFailed ? 'failed' : 'completed',
            ...(validationFailed ? { output: '结构化输出校验未通过' } : {}),
          });
        }
        runTrace.trace.completeTurn(runTrace.turnId, validationFailed ? 'failed' : 'completed');
      }

      // Validate result (only when retries are configured)
      if (validationFailed) {
        if ((!result.text.trim() || result.finishReason === 'length') && attempt < maxAttempts) {
          // Some OpenAI-compatible reasoning models occasionally return only
          // a reasoning trace and omit the final answer. Repeating the same
          // thinking request reproduces the empty response, so make the next
          // attempt ask for a direct answer. Providers that cannot toggle
          // thinking simply ignore this unified option.
          retryThinking = { mode: 'disabled', enabled: false, effort: 'none' };
          log.warn(
            `[${source}] ${result.finishReason === 'length' ? 'Truncated' : 'Empty'} final output; retrying once with thinking disabled`,
          );
        }
        log.warn(
          `[${source}] Validation failed (attempt ${attempt}/${maxAttempts}), ${attempt < maxAttempts ? 'retrying...' : 'giving up'}`,
        );
        lastResult = result;
        continue;
      }

      return result;
    } catch (error) {
      if (activeCall?.journalFailure) {
        // A tool callback can be converted into a tool-error response by AI
        // SDK. Never let that become a successful turn after its event write
        // failed; close the parent model attempt when the journal is reachable.
        try {
          await writeModelEvent(journal, 'model.failed', callId, {
            source,
            attempt,
            errorType: 'ExecutionJournalWriteError',
            errorMessage: 'An execution event could not be saved',
          });
        } catch { /* Preserve the original durable-write failure. */ }
        throw new ModelJournalWriteError(activeCall.journalFailure);
      }
      if (runTrace) {
        const message = error instanceof Error ? error.message : String(error);
        if (runTrace.previewItem) runTrace.trace.completeItem(runTrace.turnId, runTrace.previewItem, {
          status: callSignal.aborted ? 'cancelled' : 'failed',
        });
        runTrace.trace.completeItem(runTrace.turnId, runTrace.reasoningItem, {
          status: callSignal.aborted ? 'cancelled' : 'failed',
          output: message,
        });
        runTrace.trace.completeTurn(runTrace.turnId, callSignal.aborted ? 'cancelled' : 'failed');
      }
      if (error instanceof ModelJournalWriteError) throw error;
      callSignal.throwIfAborted();
      if (!modelSettled && journal) {
        await writeModelEvent(journal, 'model.failed', callId, {
          source,
          attempt,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
        });
      }
      lastError = error;

      const transient = isTransientProviderError(error);
      // A short provider overload is unrelated to content quality. Grant at
      // most two extra attempts even when the caller requested no semantic
      // retries, while retaining the same total 240 s call deadline.
      if (transient && attempt >= maxAttempts && transientRetryExtensions < 2) {
        maxAttempts += 1;
        transientRetryExtensions += 1;
      }

      if (attempt < maxAttempts) {
        if (
          Object.prototype.hasOwnProperty.call(params, 'output') &&
          isStructuredOutputParseError(error)
        ) {
          retryWithoutStructuredOutput = true;
          retryThinking = { mode: 'disabled', enabled: false, effort: 'none' };
          log.warn(
            `[${source}] Structured JSON parse failed; retrying once as raw JSON text`,
          );
        } else if (isNoOutputGeneratedError(error)) {
          retryThinking = { mode: 'disabled', enabled: false, effort: 'none' };
          log.warn(`[${source}] Model produced no final output; retrying with thinking disabled`);
        }
        if (transient) {
          log.warn(`[${source}] Provider temporarily unavailable; applying bounded backoff`);
          await waitForTransientRetry(attempt, callSignal);
        }
        log.warn(`[${source}] Call failed (attempt ${attempt}/${maxAttempts}), retrying...`, error);
        continue;
      }
    }
  }

  // All attempts exhausted — return last result or throw last error
  if (lastResult?.finishReason === 'length' && !retryOptions?.allowTruncatedResult)
    throw new Error('Model final output remained truncated after bounded retry');
  if (lastResult) return lastResult;
  throw lastError;
}

/**
 * Unified wrapper around `streamText`.
 *
 * Returns the same StreamTextResult.
 *
 * @param params - Same parameters as AI SDK's `streamText`
 * @param source - A short label for log grouping
 * @param thinking - Optional per-call thinking config (overrides global LLM_THINKING_DISABLED)
 */
export function streamLLM<T extends StreamTextParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): StreamTextResult<any, any> {
  // Resolve effective thinking config and wrap in thinkingContext
  const effectiveThinking = thinking ?? getGlobalThinkingConfig();

  // Wrap onFinish to capture usage when the stream completes, preserving any
  // caller-supplied onFinish. totalUsage aggregates across steps.
  const usageMeta = buildUsageMeta(params, source);
  const callerOnFinish = (params as Record<string, unknown>).onFinish as
    | ((event: { totalUsage?: unknown; usage?: unknown }) => void | Promise<void>)
    | undefined;
  const wrappedParams = {
    ...params,
    onFinish: async (event: { totalUsage?: unknown; usage?: unknown }) => {
      await recordUsageSafe(event.totalUsage ?? event.usage, usageMeta);
      if (callerOnFinish) await callerOnFinish(event);
    },
  } as T;

  const injectedParams = injectProviderOptions(wrappedParams, effectiveThinking);
  const result = thinkingContext.run(effectiveThinking, () => streamText(injectedParams));

  return result;
}

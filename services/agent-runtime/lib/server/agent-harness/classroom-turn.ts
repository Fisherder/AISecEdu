import { ordinaryClassroomRoundLimit } from '@/lib/chat/ordinary-classroom-contract';
import type { AISecEduRequestSession } from '../aisecedu-integration';

export interface ClassroomTurnMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ClassroomTurn = (
  messages: ClassroomTurnMessage[],
  signal: AbortSignal | undefined,
  source: 'chat-adapter' | 'chat-adapter-stream',
) => Promise<string>;

const usageFields = [
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'reasoning_tokens',
] as const;
type HarnessUsage = Partial<Record<(typeof usageFields)[number], number>>;

export interface HarnessTurnResult {
  text: string;
  model: string;
  usage?: HarnessUsage;
}

export type HarnessTurn = (
  messages: ClassroomTurnMessage[],
  signal?: AbortSignal,
) => Promise<HarnessTurnResult>;

export interface TeachingTurnImage {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: string;
}

export type ClassroomDialogueRole = 'teacher' | 'assistant' | 'student';

export interface ClassroomDialogueHistoryEntry {
  speaker: number | 'user';
  text: string;
}

export interface ClassroomDialogueInput {
  roles: ClassroomDialogueRole[];
  history: ClassroomDialogueHistoryEntry[];
  topic: string;
  slideText: string;
}

const classroomDialoguePath = '/v1/classroom-dialogue';
const teachingImageTurnPath = '/v1/teaching-image-turn';
const maxTextTurnBytes = 1024 * 1024;
export const MAX_TEACHING_IMAGE_BYTES = 2 * 1024 * 1024;
const maxTeachingImageBase64Length = 4 * Math.ceil(MAX_TEACHING_IMAGE_BYTES / 3);

export function createHarnessTurn(): HarnessTurn | undefined {
  return createHarnessTransport('/v1/turn');
}

export function createTeachingImageTurn(image: TeachingTurnImage): HarnessTurn | undefined {
  return createHarnessTransport(teachingImageTurnPath, image);
}

function configuredHarnessEndpoint(
  path: '/v1/turn' | typeof teachingImageTurnPath | typeof classroomDialoguePath,
) {
  const mode = (process.env.DOJO_AI_ENABLED || 'auto').trim().toLowerCase();
  const enabled = mode === 'auto' ? process.env.HARNESS_CONFIGURED?.trim().toLowerCase() : mode;
  if (enabled !== '1' && enabled !== 'true' && enabled !== 'yes') return undefined;

  const root = process.env.HARNESS_INTERNAL_URL?.trim().replace(/\/+$/, '');
  const secret = process.env.HARNESS_SERVICE_SECRET;
  if (!root || !secret || secret.trim() !== secret) return undefined;

  return { endpoint: new URL(root + path), secret };
}

export async function hasHarnessTeachingImageCapability(signal: AbortSignal): Promise<boolean> {
  try {
    const target = configuredHarnessEndpoint(teachingImageTurnPath);
    if (!target) return false;
    const response = await fetch(target.endpoint, {
      headers: { Authorization: 'Bearer ' + target.secret },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const capability = await response.json();
    return capability?.allowed === true;
  } catch {
    return false;
  }
}

function createHarnessTransport(
  path: '/v1/turn' | typeof teachingImageTurnPath,
  image?: TeachingTurnImage,
): HarnessTurn | undefined {
  const target = configuredHarnessEndpoint(path);
  if (!target) return undefined;
  const { endpoint, secret } = target;
  return async (messages, signal) => {
    if (
      image &&
      (image.data.length > maxTeachingImageBase64Length ||
        Buffer.byteLength(image.data, 'base64') > MAX_TEACHING_IMAGE_BYTES)
    ) {
      throw new Error('教学图片过大，请缩小后重试。');
    }

    const body = JSON.stringify({ messages });
    if (Buffer.byteLength(body, 'utf8') > maxTextTurnBytes || messages.length > 128) {
      throw new Error('对话资料过长，请缩短后重试。');
    }

    const duration = AbortSignal.timeout(95_000);
    const requestSignal = signal ? AbortSignal.any([signal, duration]) : duration;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: image ? JSON.stringify({ messages, images: [image] }) : body,
      cache: 'no-store',
      redirect: 'error',
      signal: requestSignal,
    }).catch(() => {
      requestSignal.throwIfAborted();
      throw new Error('对话服务暂时不可用。');
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error('对话服务暂时不可用。');
    }

    const result: {
      text?: unknown;
      model?: unknown;
      usage?: Partial<Record<keyof HarnessUsage, unknown>>;
    } = await response.json().catch(() => {
      requestSignal.throwIfAborted();
      throw new Error('对话服务未返回完整答复。');
    });
    if (
      typeof result?.text !== 'string' ||
      !result.text.trim() ||
      typeof result?.model !== 'string' ||
      !result.model.trim()
    ) {
      throw new Error('对话服务未返回完整答复。');
    }

    const usage = validatedUsage(result.usage);
    return { text: result.text, model: result.model, ...(usage ? { usage } : {}) };
  };
}

function validatedUsage(
  value: Partial<Record<keyof HarnessUsage, unknown>> | undefined,
): HarnessUsage | undefined {
  const usage: HarnessUsage = {};
  for (const field of usageFields) {
    const tokens = value?.[field];
    if (typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0) {
      usage[field] = tokens;
    }
  }
  return Object.keys(usage).length ? usage : undefined;
}

type ClassroomDialogueEvent =
  | { type: 'speech'; speaker: number; text: string }
  | { type: 'done'; next: 'user' | 'end' };

const maxDialogueFrameBytes = 16 * 1024;
const dialogueFailure = '课堂对话服务暂时不可用。';
const incompleteDialogue = '课堂对话服务未返回完整答复。';

export function createClassroomDialogue() {
  const target = configuredHarnessEndpoint(classroomDialoguePath);
  if (!target) return undefined;

  return async function* (
    input: ClassroomDialogueInput,
    signal: AbortSignal,
    capturedSession: AISecEduRequestSession,
  ): AsyncGenerator<ClassroomDialogueEvent> {
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + target.secret,
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(input),
      cache: 'no-store',
      redirect: 'error',
      signal,
    }).catch(() => {
      signal.throwIfAborted();
      throw new Error(dialogueFailure);
    });

    if (!response.ok || !response.body ||
      response.headers.get('Content-Type')?.split(';', 1)[0].trim() !== 'application/x-ndjson') {
      await response.body?.cancel().catch(() => {});
      throw new Error(dialogueFailure);
    }

    const reader = response.body.getReader();
    const cancelRead = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancelRead, { once: true });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let frame = '';
    let frameBytes = 0;
    let speeches = 0;
    let next: 'user' | 'end' | undefined;
    let reachedEOF = false;
    let billing: { model: string; usage: HarnessUsage } | undefined;

    function acceptUsage(model: unknown, usage: unknown) {
      if (typeof model !== 'string' || !model.trim() || model.length > 200 ||
        !usage || typeof usage !== 'object' || Array.isArray(usage)) {
        throw new Error(incompleteDialogue);
      }

      const validated: HarnessUsage = {};
      const reported = usage as Record<string, unknown>;
      for (const field of usageFields) {
        if (!Object.hasOwn(reported, field)) continue;
        const tokens = reported[field];
        if (typeof tokens !== 'number' || !Number.isSafeInteger(tokens) || tokens < 0) {
          throw new Error(incompleteDialogue);
        }
        validated[field] = tokens;
      }
      if (!validated.prompt_tokens || !validated.completion_tokens) {
        throw new Error(incompleteDialogue);
      }
      if (billing && (billing.model !== model || usageFields.some((field) =>
        (validated[field] ?? 0) < (billing?.usage[field] ?? 0)))) {
        throw new Error(incompleteDialogue);
      }
      billing = { model, usage: validated };
    }

    try {
      for (;;) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) {
          reachedEOF = true;
          break;
        }

        for (let offset = 0; offset < value.length;) {
          if (next) throw new Error(incompleteDialogue);
          const newline = value.indexOf(10, offset);
          const end = newline === -1 ? value.length : newline;
          frameBytes += end - offset;
          if (frameBytes > maxDialogueFrameBytes) throw new Error(incompleteDialogue);
          frame += decoder.decode(value.subarray(offset, end), { stream: newline === -1 });
          if (newline === -1) break;

          offset = newline + 1;
          const event: unknown = JSON.parse(frame);
          frame = '';
          frameBytes = 0;
          if (!event || typeof event !== 'object') throw new Error(incompleteDialogue);
          const record = event as Record<string, unknown>;
          if (record.type === 'speech') {
            const { speaker, text } = record;
            if (typeof speaker !== 'number' || !Number.isInteger(speaker) ||
              speaker < 1 || speaker > input.roles.length ||
              typeof text !== 'string' || !text.trim() || Array.from(text).length > 1500 ||
              ++speeches > ordinaryClassroomRoundLimit) {
              throw new Error(incompleteDialogue);
            }
            acceptUsage(record.model, record.usage);
            yield { type: 'speech', speaker, text };
            continue;
          }

          if (record.type === 'error') {
            if (record.model !== undefined && record.usage !== undefined) {
              acceptUsage(record.model, record.usage);
            }
            throw new Error(dialogueFailure);
          }
          if (record.type !== 'done' || (record.next !== 'user' && record.next !== 'end')) {
            throw new Error(incompleteDialogue);
          }
          acceptUsage(record.model, record.usage);
          next = record.next;
        }
      }
      signal.throwIfAborted();
      if (!next || frameBytes !== 0) throw new Error(incompleteDialogue);
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(error instanceof Error && error.message === dialogueFailure
        ? dialogueFailure
        : incompleteDialogue);
    } finally {
      signal.removeEventListener('abort', cancelRead);
      if (!reachedEOF) cancelRead();
      reader.releaseLock();
      if (billing && Object.keys(billing.usage).length) {
        await recordHarnessUsage(billing, 'chat-adapter-stream', capturedSession);
      }
    }
    yield { type: 'done', next };
  };
}

export async function recordHarnessUsage(
  result: Pick<HarnessTurnResult, 'model' | 'usage'>,
  source: string,
  capturedSession?: AISecEduRequestSession,
) {
  if (!result.usage) return;

  const { recordUsage } = await import('@/lib/server/usage-storage');
  const cacheReadTokens = result.usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = result.usage.cache_creation_input_tokens ?? 0;
  const input = {
    source,
    providerId: 'deepseek',
    modelId: result.model,
    modelString: 'deepseek:' + result.model,
    usage: {
      inputTokens: Math.max(
        0,
        (result.usage.prompt_tokens ?? 0) - cacheReadTokens - cacheCreationTokens,
      ),
      outputTokens: result.usage.completion_tokens ?? 0,
      cacheReadTokens,
      cacheCreationTokens,
      reasoningTokens: result.usage.reasoning_tokens ?? 0,
    },
  };
  if (capturedSession) await recordUsage(input, { capturedSession });
  else await recordUsage(input);
}

export function createClassroomTurn(): ClassroomTurn | undefined {
  const runTurn = createHarnessTurn();
  if (!runTurn) return undefined;

  return async (messages, signal, source) => {
    const result = await runTurn(messages, signal);
    await recordHarnessUsage(result, source);
    return result.text;
  };
}

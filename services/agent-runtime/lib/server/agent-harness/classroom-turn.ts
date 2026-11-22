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

function configuredHarnessEndpoint(path: '/v1/turn' | typeof teachingImageTurnPath) {
  const mode = (process.env.DOJO_AI_ENABLED || 'auto').trim().toLowerCase();
  const enabled = mode === 'auto' ? process.env.HARNESS_CONFIGURED?.trim().toLowerCase() : mode;
  if (enabled !== '1' && enabled !== 'true' && enabled !== 'yes') return undefined;

  const root = process.env.HARNESS_INTERNAL_URL?.trim().replace(/\/+$/, '');
  const secret = process.env.HARNESS_SERVICE_SECRET;
  if (!root || !secret?.trim()) return undefined;

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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: image ? JSON.stringify({ messages, images: [image] }) : body,
      cache: 'no-store',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, duration]) : duration,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('对话服务暂时不可用。');
    }

    const result: {
      text?: unknown;
      model?: unknown;
      usage?: Partial<Record<keyof HarnessUsage, unknown>>;
    } = await response.json();
    if (
      typeof result?.text !== 'string' ||
      !result.text.trim() ||
      typeof result?.model !== 'string' ||
      !result.model.trim()
    ) {
      throw new Error('对话服务未返回完整答复。');
    }

    const usage: HarnessUsage = {};
    for (const field of usageFields) {
      const tokens = result.usage?.[field];
      if (typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0) {
        usage[field] = tokens;
      }
    }
    return {
      text: result.text,
      model: result.model,
      ...(Object.keys(usage).length ? { usage } : {}),
    };
  };
}

export async function recordHarnessUsage(result: HarnessTurnResult, source: string) {
  if (!result.usage) return;

  const { recordUsage } = await import('@/lib/server/usage-storage');
  const cacheReadTokens = result.usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = result.usage.cache_creation_input_tokens ?? 0;
  await recordUsage({
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
  });
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

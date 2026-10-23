import type { Data } from './types';

declare global {
  interface Window {
    init?: { csrfNonce?: string };
    AISecEduUI?: {
      applyAppearance: (mode: string, palette: string, persist: boolean) => void;
      persistAccountPreferences: (preferences: Data) => Promise<any>;
    };
  }
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export const key = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const id = encodeURIComponent;
export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return;
  try {
    const url = new URL(value, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return;
    return url.href;
  } catch {
    return;
  }
}
export async function request<T = Data>(
  path: string,
  options: { method?: string; body?: any; key?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 35000);
  const form = options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!form) headers['Content-Type'] = 'application/json';
  if (window.init?.csrfNonce) {
    headers['CSRF-Token'] = window.init.csrfNonce;
    if (form) options.body.set('nonce', window.init.csrfNonce);
  }
  if (options.key) headers['Idempotency-Key'] = options.key;
  try {
    const response = await fetch(`/pwncollege_api/v1${path}`, {
      credentials: 'same-origin',
      method: options.method || 'GET',
      headers,
      body:
        options.body === undefined ? undefined : form ? options.body : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let payload: Data;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(
        response.status === 413
          ? '文件超过上传限制，请拆分后重试。'
          : '服务返回了无法识别的响应，请稍后重试。',
        response.status,
      );
    }
    if (!response.ok || payload.success === false) {
      const reason = typeof payload.error === 'object' ? payload.error?.message : payload.error;
      throw new ApiError(
        reason ||
          payload.message ||
          (response.status === 401 ? '登录已失效，请重新登录。' : '操作未完成，请稍后重试。'),
        response.status,
        payload.errorCode || payload.error?.code,
      );
    }
    return (payload.data ?? payload) as T;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
export const api = <T = Data>(path: string, options?: Parameters<typeof request>[1]) =>
  request<T>('/teaching' + path, options);

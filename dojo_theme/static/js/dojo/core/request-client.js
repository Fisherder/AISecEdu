(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const active = new Map();
  const cache = new Map();
  const latestSequences = new Map();
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  class RequestError extends Error {
    constructor(message, options) {
      super(message);
      this.name = "RequestError";
      Object.assign(this, options || {});
    }
  }

  function endpoint(path) {
    const source = String(path || "");
    if (
      /^https?:\/\//.test(source)
      || source.startsWith("/pwncollege_api/")
      || source.startsWith("/api/")
    ) return source;
    return `/pwncollege_api/v1${source.startsWith("/") ? source : `/${source}`}`;
  }

  function retryAfter(response) {
    const value = String(response.headers.get("retry-after") || "").trim();
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
  }

  function retryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  async function parse(response) {
    const requestId = response.headers.get("x-request-id");
    if (response.status === 204) {
      return {success: true, data: null, meta: {requestId}};
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      throw new RequestError(
        response.ok ? "服务器返回了无法识别的响应。" : "请求暂时无法完成，请稍后重试。",
        {
          status: response.status,
          code: "INVALID_RESPONSE",
          requestId,
          retryable: retryableStatus(response.status),
          retryAfterMs: retryAfter(response),
        },
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new RequestError("服务器响应不完整，请稍后重试。", {
        status: response.status,
        code: "INVALID_JSON",
        requestId,
        retryable: retryableStatus(response.status),
        retryAfterMs: retryAfter(response),
      });
    }
    if (!response.ok || payload.success === false) {
      const detail = payload && payload.error;
      const structuredErrors = payload && payload.errors;
      const firstStructuredError = structuredErrors && typeof structuredErrors === "object"
        ? Object.values(structuredErrors).flat(Infinity).find(value => String(value || "").trim())
        : null;
      throw new RequestError(
        (typeof detail === "object" ? detail.message : detail)
          || String(firstStructuredError || "").trim()
          || "请求没有完成。",
        {
          status: response.status,
          code: typeof detail === "object" ? detail.code : "REQUEST_FAILED",
          requestId: payload?.meta?.requestId || detail?.requestId || requestId,
          retryable: Boolean(detail?.retryable || retryableStatus(response.status)),
          retryAfterMs: retryAfter(response),
          recovery: detail?.recovery || null,
          fieldErrors: detail?.fieldErrors || [],
          payload,
        },
      );
    }
    return payload;
  }

  function wait(delay, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("请求已取消", "AbortError"));
        return;
      }
      const abort = () => {
        window.clearTimeout(timer);
        reject(new DOMException("请求已取消", "AbortError"));
      };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, delay);
      signal?.addEventListener("abort", abort, {once: true});
    });
  }

  function retryDelay(attempt, error) {
    if (Number.isFinite(error?.retryAfterMs)) return Math.min(15000, error.retryAfterMs);
    const base = Math.min(2500, 300 * (2 ** attempt));
    return base + Math.floor(Math.random() * 180);
  }

  function normalizeError(error, timedOut, externallyAborted) {
    if (error instanceof RequestError) return error;
    if (error?.name === "AbortError") {
      return new RequestError(
        timedOut ? "请求等待时间过长，请稍后重试。" : "请求已取消。",
        {
          status: 0,
          code: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED",
          retryable: Boolean(timedOut && !externallyAborted),
          cause: error,
        },
      );
    }
    return new RequestError("网络连接不稳定，请检查网络后重试。", {
      status: 0,
      code: "NETWORK_ERROR",
      retryable: true,
      cause: error,
    });
  }

  function cachedValue(key) {
    if (!key) return null;
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.payload;
  }

  async function execute(url, method, config) {
    const headers = {Accept: "application/json", ...(config.headers || {})};
    const csrfNonce = window.init && window.init.csrfNonce;
    if (csrfNonce && !headers["CSRF-Token"]) headers["CSRF-Token"] = csrfNonce;
    if (config.idempotencyKey && !headers["Idempotency-Key"]) {
      headers["Idempotency-Key"] = String(config.idempotencyKey);
    }
    let body = config.body;
    if (config.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(config.json);
    }

    const externalSignal = config.signal || config.controller?.signal || null;
    const controller = config.controller || new AbortController();
    let timedOut = false;
    let removeExternalAbort = null;
    if (externalSignal && externalSignal !== controller.signal) {
      const abort = () => controller.abort(externalSignal.reason);
      if (externalSignal.aborted) abort();
      else {
        externalSignal.addEventListener("abort", abort, {once: true});
        removeExternalAbort = () => externalSignal.removeEventListener("abort", abort);
      }
    }
    const timeoutMs = Math.max(0, Number(
      config.timeoutMs === undefined
        ? (safeMethods.has(method) ? 10000 : 20000)
        : config.timeoutMs,
    ) || 0);
    const timeout = timeoutMs
      ? window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
    const retries = Math.max(0, Number(
      config.retries === undefined ? (safeMethods.has(method) ? 1 : 0) : config.retries,
    ) || 0);
    const canRetry = safeMethods.has(method) || Boolean(config.retryMutation && config.idempotencyKey);
    const client = window.CTFd && typeof window.CTFd.fetch === "function"
      ? window.CTFd.fetch.bind(window.CTFd)
      : window.fetch.bind(window);

    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const response = await client(url, {
            method,
            credentials: config.credentials || "same-origin",
            headers,
            body,
            signal: controller.signal,
          });
          return await parse(response);
        } catch (rawError) {
          const error = normalizeError(rawError, timedOut, Boolean(externalSignal?.aborted));
          if (!canRetry || attempt >= retries || !error.retryable || controller.signal.aborted) throw error;
          await wait(retryDelay(attempt, error), controller.signal);
        }
      }
    } finally {
      if (timeout) window.clearTimeout(timeout);
      if (removeExternalAbort) removeExternalAbort();
    }
  }

  async function request(path, options) {
    const config = options || {};
    const method = String(config.method || "GET").toUpperCase();
    const url = endpoint(path);
    const defaultKey = safeMethods.has(method) && !config.signal && !config.controller
      ? `${method}:${url}`
      : null;
    const key = config.dedupeKey === false
      ? null
      : String(config.dedupeKey || defaultKey || "") || null;
    const cacheKey = safeMethods.has(method)
      ? String(config.cacheKey || key || `${method}:${url}`)
      : null;
    const ttl = Math.max(0, Number(config.cacheTtlMs || 0));
    const cached = ttl ? cachedValue(cacheKey) : null;
    if (cached) return config.unwrap === false ? cached : cached.data;

    let sequence = null;
    if (config.latestKey) {
      sequence = Number(latestSequences.get(config.latestKey) || 0) + 1;
      latestSequences.set(config.latestKey, sequence);
    }

    let work;
    if (key && active.has(key)) {
      work = active.get(key).work;
    } else {
      const controller = config.controller || new AbortController();
      work = execute(url, method, {...config, controller});
      if (key) active.set(key, {work, controller, url, method});
    }

    try {
      const payload = await work;
      if (config.latestKey && latestSequences.get(config.latestKey) !== sequence) {
        throw new RequestError("已有更新的请求完成，本次旧响应已忽略。", {
          status: 0,
          code: "STALE_RESPONSE",
          retryable: false,
        });
      }
      if (ttl && cacheKey) cache.set(cacheKey, {payload, expiresAt: Date.now() + ttl});
      if (!safeMethods.has(method) && config.invalidateCache !== false) cache.clear();
      return config.unwrap === false ? payload : payload.data;
    } finally {
      if (key && active.get(key)?.work === work) active.delete(key);
    }
  }

  function abort(key) {
    const normalized = String(key || "");
    const target = active.get(normalized);
    if (!target) return false;
    target.controller.abort();
    active.delete(normalized);
    return true;
  }

  function clearCache(prefix) {
    if (!prefix) {
      cache.clear();
      return;
    }
    const target = String(prefix);
    Array.from(cache.keys()).forEach(key => {
      if (key.startsWith(target)) cache.delete(key);
    });
  }

  root.RequestError = RequestError;
  root.request = request;
  root.get = (path, options) => request(path, {...(options || {}), method: "GET"});
  root.post = (path, json, options) => request(path, {...(options || {}), method: "POST", json});
  root.requestClient = {abort, clearCache, active, cache};
})();

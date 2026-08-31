const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const PRIVATE_FIELD =
  /^(?:authorization|cookie|set-cookie|api[_-]?key|token|secret|password|credential|database(?:_url)?|prompt|messages?|body|raw(?:text|body|content)|content|document|material|lesson|file(?:data|content)|excerpts?)$/i;
const SECRET_ENV = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE|DATABASE_URL)$/i;

function replaceEnvironmentSecrets(value: string): string {
  if (typeof process === 'undefined' || !process.env) return value;
  let result = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (!SECRET_ENV.test(key) || !secret || secret.length < 8) continue;
    result = result.split(secret).join('[REDACTED]');
  }
  return result;
}

export function redactLogText(value: string): string {
  return replaceEnvironmentSecrets(value)
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(
      /(\b(?:authorization|api[_-]?key|token|secret|password|credential)\b\s*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(\b(?:set-cookie|cookie)\b\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^:/\s]+:)[^@/\s]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:pwn\.college|flag|ctf)\{[^}\r\n]*\}/gi, '[REDACTED_FLAG]');
}

function safeLogValue(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactLogText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (value instanceof Error) {
    return redactLogText(value.stack ?? `${value.name}: ${value.message}`);
  }
  if (typeof value !== 'object') return redactLogText(String(value));
  if (seen.has(value)) return '[Circular]';
  if (depth >= 6) return '[Truncated]';
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((item) => safeLogValue(item, seen, depth + 1));
    if (value.length > items.length) items.push(`[${value.length - items.length} more items]`);
    return items;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = PRIVATE_FIELD.test(key) ? '[REDACTED]' : safeLogValue(item, seen, depth + 1);
  }
  return result;
}

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return env in LOG_LEVELS ? (env as LogLevel) : 'info';
}

function isJsonFormat(): boolean {
  return process.env.LOG_FORMAT === 'json';
}

function formatLine(level: LogLevel, tag: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const upperLevel = level.toUpperCase();
  const seen = new WeakSet<object>();
  const msg = redactLogText(
    args
      .map((arg) => {
        const safe = safeLogValue(arg, seen);
        return typeof safe === 'string' ? safe : JSON.stringify(safe);
      })
      .join(' '),
  );

  if (isJsonFormat()) {
    return JSON.stringify({ timestamp, level: upperLevel, tag, message: msg });
  }
  return `[${timestamp}] [${upperLevel}] [${tag}] ${msg}`;
}

export function createLogger(tag: string) {
  const emit = (level: LogLevel, args: unknown[]) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[getMinLevel()]) return;

    const line = formatLine(level, tag, args);

    // Console output
    const fn =
      level === 'debug'
        ? console.debug
        : level === 'warn'
          ? console.warn
          : level === 'error'
            ? console.error
            : console.log;
    fn(line);
  };

  return {
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
  };
}

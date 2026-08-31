/**
 * Load .env.local before tests so API keys are available.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Test fixtures use RFC-reserved `*.test` hosts together with a stubbed global
 * `fetch`.  CI and developer shells may inject an HTTP proxy; without this
 * explicit bypass, proxy-aware server code sends the fixture request to that
 * real proxy instead of the stub.  Keep both spellings in sync because Linux
 * treats them as distinct variables and proxy implementations differ in which
 * spelling they prefer.
 */
for (const key of ['no_proxy', 'NO_PROXY'] as const) {
  const entries = (process.env[key] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.some((entry) => entry.toLowerCase() === '.test')) entries.push('.test');
  process.env[key] = entries.join(',');
}

if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
}

const envPath = resolve(__dirname, '..', '.env.local');
try {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local not found, skip
}

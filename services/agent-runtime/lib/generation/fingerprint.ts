import { createHash } from 'node:crypto';

export function generationFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item,
  )).digest('hex');
}

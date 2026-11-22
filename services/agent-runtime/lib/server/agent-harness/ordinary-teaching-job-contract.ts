export const ordinaryTeachingRoute = 'upstream-ordinary-teaching';

export function asJobRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function hasOrdinaryTeachingPin(body: {scope?: unknown; modelRoute?: unknown; payload?: unknown}) {
  return Object.hasOwn(asJobRecord(body.scope) ?? {}, 'ordinaryTeachingPinned') ||
    asJobRecord(body.modelRoute)?.route === ordinaryTeachingRoute ||
    Object.hasOwn(asJobRecord(body.payload) ?? {}, 'ordinaryTeachingPin');
}

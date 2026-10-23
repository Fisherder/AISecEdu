/** A nullable state cell is a value, not a boolean condition. When a model
 * writes `if (cell)` for a cell initialized to null, read it as the explicit
 * question "has this cell received a value?". */
export function normalizeNullableIfGuards(
  initialState: Record<string, unknown> | undefined,
  value: unknown,
): unknown {
  if (!initialState) return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const object = node as Record<string, unknown>;
    const result = Object.fromEntries(Object.entries(object).map(([key, item]) => [key, walk(item)]));
    if (result.op === 'if' && Array.isArray(result.args) && result.args.length === 3) {
      const condition = result.args[0] as {state?: unknown} | undefined;
      if (condition && typeof condition === 'object' && Object.keys(condition).length === 1 &&
          typeof condition.state === 'string' && initialState[condition.state] === null)
        result.args[0] = {op: 'ne', args: [condition, null]};
    }
    return result;
  };
  return walk(value);
}

/** Text views may display a nullable result before the first action. Preserve
 * the exact non-null text and render the initial null as an empty string. */
export function normalizeNullableTextViews(
  initialState: Record<string, unknown> | undefined,
  value: unknown,
): unknown {
  if (!initialState || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {views?: Array<{kind?: unknown; value?: unknown}>};
  if (!Array.isArray(envelope.views)) return value;
  const revised = structuredClone(envelope);
  for (const view of revised.views ?? []) {
    if (!['text', 'code'].includes(String(view.kind))) continue;
    const id = (view.value as {state?: unknown} | undefined)?.state;
    if (typeof id !== 'string' || initialState[id] !== null ||
        Object.keys(view.value as object).length !== 1) continue;
    view.value = {op: 'concat', args: ['', {state: id}]};
  }
  return revised;
}

/** A boolean state cell is scalar. Models occasionally write at(done, 0)
 * where they mean to read done; only remove this invalid zero index for a
 * state whose declared initial type is boolean. */
export function normalizeBooleanAtReads(
  initialState: Record<string, unknown> | undefined,
  value: unknown,
): unknown {
  if (!initialState) return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const object = node as Record<string, unknown>;
    if (object.op === 'at' && Array.isArray(object.args) && object.args.length === 2 &&
        object.args[1] === 0) {
      const source = object.args[0] as {state?: unknown} | undefined;
      if (source && typeof source === 'object' && !Array.isArray(source) &&
          Object.keys(source).length === 1 && typeof source.state === 'string' &&
          typeof initialState[source.state] === 'boolean') return {state: source.state};
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, walk(item)]));
  };
  return walk(value);
}

import type { ProcessScene } from './schema';

type State = Pick<ProcessScene, 'inputs' | 'initialState'>;
type Behavior = Pick<ProcessScene, 'actions'>;

/** A terminal XOR action sometimes formats only encryptedBytes[0]. Replace
 * that exact single-byte expression with the runtime's whole-array formatter
 * when the array is demonstrably populated by an XOR action. */
export function normalizeXorFinalHexAction(state: State, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray(state?.inputs) || !state.initialState) return value;
  const behavior = value as Behavior;
  if (!Array.isArray(behavior.actions) ||
      !state.inputs.some(input => input.type === 'text' && input.ascii === true) ||
      !state.inputs.some(input => input.type === 'number' && /key|密钥/i.test(input.id))) return value;

  const copy = structuredClone(behavior) as Behavior;
  let changed = false;
  for (const action of copy.actions) for (const update of action.updates ?? []) {
    const finalId = update.target;
    if (!/final.*hex|hex.*final|最终.*密文/i.test(finalId) ||
        state.initialState[finalId] !== '' ||
        !JSON.stringify(action.enabledWhen ?? '').includes('"state":"done"') ||
        state.initialState.done !== false) continue;
    const expression = update.value as any;
    if (expression?.op !== 'join' || !Array.isArray(expression.args) ||
        expression.args[0]?.op !== 'array' || expression.args[0].args?.length !== 1) continue;
    let item = expression.args[0].args[0];
    if (item?.op === 'concat' && item.args?.length === 1) item = item.args[0];
    if (item?.op !== 'hex' || !Array.isArray(item.args)) continue;
    const read = item.args[0];
    const indexedId = read?.op === 'at' && Array.isArray(read.args) &&
      typeof read.args[0]?.state === 'string' && Number.isInteger(read.args[1])
      ? read.args[0].state as string : undefined;
    const scalarId = typeof read?.state === 'string' && state.initialState[read.state] === null
      ? read.state as string : undefined;
    if (!indexedId && !scalarId) continue;
    const writers = copy.actions.filter(writer => writer !== action &&
      JSON.stringify(writer).includes('"op":"xor"') &&
      (!scalarId || writer.updates?.some(part => part.target === scalarId)));
    const cipherIds = writers.flatMap(writer => (writer.updates ?? [])
      .filter(part => part.index !== undefined &&
        (!indexedId || part.target === indexedId) &&
        Array.isArray(state.initialState[part.target]) &&
        (state.initialState[part.target] as unknown[]).length === 0)
      .map(part => part.target));
    if (cipherIds.length !== 1) continue;
    const cipherId = cipherIds[0];
    update.value = {op: 'hexBytes', args: [{state: cipherId}]};
    changed = true;
  }
  return changed ? copy : value;
}

/** Compare the authored final-hex assertion with independently calculated
 * ASCII XOR bytes. Only complete byte-by-byte test paths are changed; the
 * scene still has to pass the full deterministic and browser checks. */
export function normalizeXorFinalHexTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {tests?: unknown};
  if (!Array.isArray(envelope.tests)) return value;
  const textInputs = scene.inputs.filter(input => input.type === 'text' && input.ascii === true);
  const keyInputs = scene.inputs.filter(input => input.type === 'number' && /key|密钥/i.test(input.id));
  if (textInputs.length !== 1 || keyInputs.length !== 1) return value;
  const textId = textInputs[0].id, keyId = keyInputs[0].id;
  const terminal = scene.actions.flatMap(action => (action.updates ?? [])
    .filter(update => update.value && typeof update.value === 'object' &&
      !Array.isArray(update.value) && (update.value as any).op === 'hexBytes' &&
      typeof (update.value as any).args?.[0]?.state === 'string')
    .map(update => ({actionId: action.id, finalId: update.target,
      cipherId: (update.value as any).args[0].state as string})));
  if (terminal.length !== 1) return value;
  const {actionId, finalId, cipherId} = terminal[0];
  if (!Array.isArray(scene.initialState[cipherId]) ||
      scene.initialState[finalId] !== '') return value;
  const writers = scene.actions.filter(action => action.updates?.some(update =>
    update.target === cipherId && update.index !== undefined) &&
    JSON.stringify(action).includes('"op":"xor"') &&
    JSON.stringify(action).includes(JSON.stringify({input: keyId})));
  if (writers.length !== 1) return value;
  const writerId = writers[0].id;
  const copy = structuredClone(envelope) as {tests: Array<{
    inputs?: Record<string, unknown>;
    actions?: Array<{id?: string; count?: number | string}>;
    expect?: Array<{value?: unknown; equals?: unknown}>;
  }>};
  let changed = false;
  for (const test of copy.tests) {
    const text = test.inputs?.[textId], key = test.inputs?.[keyId];
    if (typeof text !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(text) ||
        !Number.isInteger(key) || Number(key) < 0 || Number(key) > 255 ||
        typeof textInputs[0].maxLength === 'number' && text.length > textInputs[0].maxLength ||
        !Array.isArray(test.actions) || !Array.isArray(test.expect)) continue;
    const terminalAt = test.actions.findIndex(step => step.id === actionId && step.count === 1);
    if (terminalAt < 0 || test.actions.slice(terminalAt + 1).some(step => step.id === writerId)) continue;
    const byteSteps = test.actions.slice(0, terminalAt).reduce((sum, step) =>
      sum + (step.id === writerId && typeof step.count === 'number' ? step.count : 0), 0);
    if (byteSteps !== text.length) continue;
    const expected = Array.from(new TextEncoder().encode(text))
      .map(byte => '0x' + (byte ^ Number(key)).toString(16).toUpperCase().padStart(2, '0'))
      .join(', ');
    for (const assertion of test.expect) if (
      JSON.stringify(assertion.value) === JSON.stringify({state: finalId}) &&
      typeof assertion.equals === 'string' &&
      /^(?:0x)?[0-9a-f]{2}(?:[\s,]+(?:0x)?[0-9a-f]{2})*$/i.test(assertion.equals.trim()) &&
      assertion.equals !== expected) {
      assertion.equals = expected;
      changed = true;
    }
  }
  return changed ? copy : value;
}

/** Recover a missing range on an otherwise valid free-form numeric input.
 * The teacher did not prescribe a bound; keep a generous symmetric window
 * around the authored default so the control can test absent values. */
export function normalizeMissingNumericInputRanges<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const result = structuredClone(value) as any;
  if (!Array.isArray(result.inputs)) return result;
  for (const input of result.inputs) {
    if (input?.type !== 'number' || typeof input.default !== 'number' ||
        !Number.isFinite(input.default) ||
        (input.min !== undefined && input.max !== undefined)) continue;
    const span = Math.max(100, Math.ceil(Math.abs(input.default)) * 2);
    if (input.min === undefined) input.min = input.default - span;
    if (input.max === undefined) input.max = input.default + span;
  }
  return result;
}

/** Select strings have an unambiguous display label and submitted value. */
export function normalizeStringSelectOptions<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const result = structuredClone(value) as any;
  if (!Array.isArray(result.inputs)) return result;
  for (const input of result.inputs) {
    if (input?.type !== 'select' || !Array.isArray(input.options) ||
        input.options.length < 2 || input.options.length > 12 ||
        !input.options.every((option: unknown) =>
          typeof option === 'string' && option.length >= 1 && option.length <= 1200)) continue;
    input.options = input.options.map((option: string) => ({label: option, value: option}));
  }
  return result;
}

/** Preserve an authored numeric 0/1 switch, including every formula reading
 * it. Converting its values to booleans would break arithmetic/equality. */
export function normalizeNumericToggleInputs<T>(value:T):T {
  if(!value||typeof value!=='object')return value;
  const result=structuredClone(value) as {inputs?:Array<Record<string,unknown>>};
  for(const input of result.inputs??[])if(input.type==='toggle'&&[0,1].includes(input.default as number)&&
      input.options===undefined&&input.min===undefined&&input.max===undefined){
    input.type='select';input.options=[{label:'关闭（0）',value:0},{label:'开启（1）',value:1}];
  }
  return result as T;
}

/** Fixed rows of objects cannot be addressed by the scalar/array expression
 * engine. Split a rectangular table into parallel scalar arrays, preserving
 * row order and values, before freezing the state stage for later prompts. */
export function normalizeFixedStateTables<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const result = structuredClone(value) as any;
  const state = result.initialState;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return result;
  for (const [id, rows] of Object.entries(state)) {
    if (!Array.isArray(rows) || rows.length < 2 || rows.length > 128 ||
        !rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) continue;
    const keys = Object.keys(rows[0]);
    if (!keys.length || keys.length > 8 ||
        !keys.every(key => /^[A-Za-z][A-Za-z0-9_]*$/.test(key)) ||
        !rows.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify([...keys].sort()) &&
          keys.every(key => row[key] === null || ['string','number','boolean'].includes(typeof row[key])))) continue;
    const fields = keys.map(key => id + key[0].toUpperCase() + key.slice(1));
    if (fields.some(field => field.length > 48 || Object.hasOwn(state, field))) continue;
    for (let index = 0; index < keys.length; index++)
      state[fields[index]] = rows.map(row => row[keys[index]]);
    delete state[id];
  }
  return result;
}

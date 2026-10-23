import type { ProcessScene } from './schema';
import { createProcessEngine } from '@/lib/server/process-quality';

type State = Pick<ProcessScene, 'inputs' | 'initialState'>;
type Behavior = Pick<ProcessScene, 'actions'>;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const ref = (id: string) => ({local: id});
const stateRef = (id: string) => ({state: id});

/** Repair only the recognisable ascending binary-search transition. The
 * model must already have the ordered data, midpoint, comparisons and both
 * candidate boundaries; this does not invent a search algorithm for a scene
 * with different semantics. */
export function normalizeAscendingBinarySearch(state: State, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !state?.initialState || !Array.isArray(state.inputs)) return value;
  const behavior = value as Behavior;
  if (!Array.isArray(behavior.actions)) return value;
  const initial = state.initialState as Record<string, unknown>;
  const numbers = initial.array;
  if (!Array.isArray(numbers) || numbers.length < 3 ||
      !numbers.every((number, index) => typeof number === 'number' && Number.isFinite(number) &&
        (index === 0 || number > numbers[index - 1])) ||
      initial.low !== 0 || initial.high !== numbers.length - 1 ||
      !state.inputs.some(input => input.id === 'target' && input.type === 'number')) return value;
  const copy = structuredClone(behavior) as Behavior;
  let changed = false;
  for (const action of copy.actions) {
    const locals = action.locals ?? [];
    const byId = new Map(locals.map(local => [local.id, local.value]));
    const pick = (predicate: (expr: any) => boolean) => locals.filter(local => predicate(local.value))
      .map(local => local.id);
    const low = pick(expr => same(expr, stateRef('low')));
    const high = pick(expr => same(expr, stateRef('high')));
    const mid = pick(expr => expr?.op === 'floor' &&
      expr.args?.[0]?.op === 'div' && expr.args[0].args?.[1] === 2 &&
      expr.args[0].args?.[0]?.op === 'add' &&
      [low[0],high[0]].every(id => id && expr.args[0].args[0].args?.some((part: unknown) => same(part,ref(id)))));
    if (low.length !== 1 || high.length !== 1 || mid.length !== 1) continue;
    const current = pick(expr => expr?.op === 'at' &&
      same(expr.args?.[0],stateRef('array')) && same(expr.args?.[1],ref(mid[0])));
    const target = pick(expr => same(expr,{input:'target'}));
    if (current.length !== 1 || target.length !== 1) continue;
    const less = pick(expr => expr?.op === 'lt' && same(expr.args,[ref(current[0]),ref(target[0])]));
    const greater = pick(expr => expr?.op === 'gt' && same(expr.args,[ref(current[0]),ref(target[0])]));
    const nextLow = pick(expr => expr?.op === 'add' && same(expr.args,[ref(mid[0]),1]));
    const nextHigh = pick(expr => expr?.op === 'sub' && same(expr.args,[ref(mid[0]),1]));
    if ([less,greater,nextLow,nextHigh].some(items => items.length !== 1)) continue;
    const lowUpdate = action.updates.find(update => update.target === 'low');
    const highUpdate = action.updates.find(update => update.target === 'high');
    const lowExpr = lowUpdate?.value as any, highExpr = highUpdate?.value as any;
    if (lowExpr?.op !== 'if' || highExpr?.op !== 'if' ||
        !same(lowExpr.args,[ref(greater[0]),ref(nextLow[0]),stateRef('low')]) ||
        !same(highExpr.args,[ref(less[0]),ref(nextHigh[0]),stateRef('high')])) continue;
    const range = locals.find(local => {
      const expr = local.value as any;
      return expr?.op === 'or' && Array.isArray(expr.args) &&
        JSON.stringify(expr).includes(JSON.stringify(ref(nextLow[0]))) &&
        JSON.stringify(expr).includes(JSON.stringify(ref(nextHigh[0]))) &&
        JSON.stringify(action.updates).includes(JSON.stringify(ref(local.id)));
    });
    if (!range || !byId.has(range.id)) continue;
    lowUpdate!.value = {op:'if',args:[ref(less[0]),ref(nextLow[0]),stateRef('low')]};
    highUpdate!.value = {op:'if',args:[ref(greater[0]),ref(nextHigh[0]),stateRef('high')]};
    range.value = {op:'gt',args:[
      {op:'if',args:[ref(less[0]),ref(nextLow[0]),ref(low[0])]},
      {op:'if',args:[ref(greater[0]),ref(nextHigh[0]),ref(high[0])]},
    ]};
    changed = true;
  }
  return changed ? copy : value;
}

/** Use an independent binary-search trace to correct a generated test's
 * count and simple state assertions. The product runtime must then reproduce
 * that trace; mismatched action logic still fails the validator. */
export function normalizeAscendingSearchTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {tests?: unknown};
  const array = scene.initialState.array;
  if (!Array.isArray(envelope.tests) || !Array.isArray(array) || array.length < 3 ||
      !array.every((number, index) => typeof number === 'number' && Number.isFinite(number) &&
        (index === 0 || number > Number(array[index - 1])))) return value;
  const sorted = array as number[];
  const action = scene.actions.find(item => item.updates.some(update => update.target === 'low') &&
    item.updates.some(update => update.target === 'high') &&
    item.updates.some(update => update.target === 'mid'));
  if (!action || !scene.inputs.some(input => input.id === 'target' && input.type === 'number')) return value;
  const copy = structuredClone(envelope) as {tests: Array<{
    inputs?: Record<string, unknown>;
    actions?: Array<{id?: string; count?: number | string}>;
    expect?: Array<{value?: unknown; equals?: unknown}>;
  }>};
  let changed = false;
  for (const test of copy.tests) {
    const target = test.inputs?.target;
    if (typeof target !== 'number' || !Number.isFinite(target) ||
        test.actions?.length !== 1 || test.actions[0].id !== action.id ||
        !Number.isInteger(test.actions[0].count) || !Array.isArray(test.expect)) continue;
    const intendedFound = test.expect.some(item => same(item.value,stateRef('found')) && item.equals === true ||
      same(item.value,{op:'eq',args:[stateRef('phase'),'found']}) && item.equals === true);
    const intendedAbsent = test.expect.some(item => same(item.value,{op:'eq',args:[stateRef('phase'),'done']}) && item.equals === true);
    if (intendedFound && !sorted.includes(target) || intendedAbsent && sorted.includes(target)) continue;
    let low = 0, high = sorted.length - 1, mid = -1, found = false, terminated = false;
    const excluded: number[] = [];
    const terminalExpected = intendedFound || intendedAbsent;
    const authoredSteps = test.actions[0].count as number;
    const limit = terminalExpected ? sorted.length + 1 : authoredSteps;
    for (let step = 0; step < limit && !terminated; step++) {
      mid = Math.floor((low + high) / 2);
      excluded.push(mid);
      if (sorted[mid] === target) {found = true; terminated = true;}
      else if (sorted[mid] < target) low = mid + 1;
      else high = mid - 1;
      if (low > high) terminated = true;
    }
    if (terminalExpected && !terminated || !terminalExpected && excluded.length !== authoredSteps) continue;
    const phase = found ? 'found' : terminated ? 'done' : 'compare';
    const reference = {low,high,mid,found,terminated,phase,excluded};
    const supported = (expression: any): {known: boolean; actual?: unknown} => {
      if (typeof expression?.state === 'string' && Object.keys(expression).length === 1 &&
          Object.hasOwn(reference,expression.state))
        return {known:true,actual:(reference as any)[expression.state]};
      if (expression?.op === 'eq' && Array.isArray(expression.args) &&
          expression.args.length === 2 && typeof expression.args[0]?.state === 'string' &&
          Object.hasOwn(reference,expression.args[0].state))
        return {known:true,actual:(reference as any)[expression.args[0].state] === expression.args[1]};
      if (expression?.op === 'length' && same(expression.args,[stateRef('excluded')]))
        return {known:true,actual:excluded.length};
      return {known:false};
    };
    const values = test.expect.map(item => supported(item.value));
    if (values.some(item => !item.known)) continue;
    if (terminalExpected && authoredSteps !== excluded.length) {
      test.actions[0].count = excluded.length;
      changed = true;
    }
    for (let index = 0; index < values.length; index++) if (!same(test.expect[index].equals,values[index].actual)) {
      test.expect[index].equals = values[index].actual;
      changed = true;
    }
  }
  return changed ? copy : value;
}

/** Generated binary-search assertions often count the load action as a search
 * round or assume that a duplicate is found at its first occurrence. Reconcile
 * these only after the scene's actual search steps match an independent oracle.
 * This never repairs the scene's algorithm. */
export function reconcileVerifiedBinarySearchTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {tests?: unknown};
  const initial = scene.initialState as Record<string, unknown>;
  const arrayId = ['array','arr'].find(id => Array.isArray(initial[id]));
  const resultId = ['result','foundIndex'].find(id => Object.hasOwn(initial,id));
  const terminalId = ['terminated','done'].find(id => typeof initial[id] === 'boolean');
  const targetInputId = ['target','targetValue'].find(id =>
    scene.inputs.some(input => input.id === id && input.type === 'number'));
  const array = arrayId ? initial[arrayId] : undefined;
  if (!Array.isArray(envelope.tests) || !Array.isArray(array) || array.length < 3 ||
      !array.every((number, index) => typeof number === 'number' && Number.isFinite(number) &&
        (index === 0 || number >= Number(array[index - 1]))) ||
      !resultId || !terminalId || !targetInputId || initial.left !== 0 ||
      ![array.length - 1,0].includes(Number(initial.right))) return value;
  const candidates = scene.actions.filter(action => ['left','right','mid',resultId,terminalId]
    .every(id => action.updates.some(update => update.target === id)) &&
    action.locals?.some(local => (local.value as {op?: string})?.op === 'at' &&
      same((local.value as {args?: unknown[]}).args?.[0],stateRef(arrayId!))));
  const search = candidates.find(action => action.repeatWhile !== undefined) ?? candidates[0];
  if (!search) return value;
  type Test = {name?: string; inputs?: Record<string, unknown>;
    actions?: Array<{id?: string; count?: number | string}>;
    expect?: Array<{value?: unknown; equals?: unknown}>};
  const copy = structuredClone(envelope) as {tests: Test[]};
  let changed = false;
  for (const test of copy.tests) {
    const target = test.inputs?.[targetInputId];
    if (typeof target !== 'number' || !Number.isFinite(target) ||
        !Array.isArray(test.actions) || !Array.isArray(test.expect) ||
        !test.actions.some(step => step.id === search.id)) continue;
    const oracle: Array<{mid:number; left:number; right:number; result:unknown; terminated:boolean}> = [];
    let left = 0, right = array.length - 1;
    while (left <= right && oracle.length <= array.length) {
      const mid = Math.floor((left + right) / 2);
      const found = array[mid] === target;
      if (!found) {
        if (Number(array[mid]) < target) left = mid + 1;
        else right = mid - 1;
      }
      oracle.push({mid,left,right,result:found ? mid : initial[resultId],
        terminated:found || left > right});
      if (found || left > right) break;
    }
    if (!oracle.length || !oracle.at(-1)?.terminated) continue;
    try {
      const engine = createProcessEngine(scene);
      engine.reset(test.inputs);
      let searches = 0;
      const corrected: NonNullable<Test['actions']> = [];
      let valid = true;
      const terminalExpected = test.expect.some(assertion =>
        same(assertion.value,stateRef(terminalId)) && assertion.equals === true ||
        same(assertion.value,stateRef('phase')) &&
          ['found','notFound','done','finished'].includes(String(assertion.equals)));
      const lastSearchStep = test.actions.findLastIndex(step => step.id === search.id);
      for (const [stepIndex,step] of test.actions.entries()) {
        if (!step.id || step.id !== search.id) {
          if (typeof step.count !== 'number' || !Number.isInteger(step.count) || step.count < 1) {
            valid = false; break;
          }
          for (let n = 0; n < step.count; n++) engine.act(step.id!);
          const loaded = engine.getState().state as Record<string, unknown>;
          if (!same(loaded[arrayId!],array) ||
              (Object.hasOwn(initial,'target') && loaded.target !== target) ||
              (Object.hasOwn(initial,'targetValue') && loaded.targetValue !== target)) valid = false;
          corrected.push(step);
          continue;
        }
        // A generated terminal test can include an extra click after the
        // independently verified final search step. The real player disables
        // that action, so omit only these unreachable trailing clicks.
        if (terminalExpected && searches === oracle.length &&
            (engine.getState().state as Record<string, unknown>)[terminalId] === true) {
          changed = true;
          continue;
        }
        const limit = step.count === 'untilDone' || terminalExpected && stepIndex === lastSearchStep
          ? oracle.length - searches : step.count;
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
          valid = false; break;
        }
        const executable = Math.min(limit,oracle.length - searches);
        for (let n = 0; n < executable; n++) {
          if (!engine.can(search.id)) {valid = false; break;}
          engine.act(search.id);
          const expected = oracle[searches++];
          const current = engine.getState().state as Record<string, unknown>;
          if (current.mid !== expected.mid || current[resultId] !== expected.result ||
              current[terminalId] !== expected.terminated ||
              (Object.hasOwn(current,'midValue') && current.midValue !== array[expected.mid]) ||
              (!expected.terminated && (current.left !== expected.left || current.right !== expected.right)) ||
              (expected.terminated && expected.result === initial[resultId] &&
                (current.left !== expected.left || current.right !== expected.right)) ||
              (expected.terminated && expected.result !== initial[resultId] &&
                (typeof current.left !== 'number' || typeof current.right !== 'number' ||
                  !Number.isInteger(current.left) || !Number.isInteger(current.right) ||
                  current.left < 0 || current.left > array.length ||
                  current.right < -1 || current.right >= array.length))) {
            valid = false; break;
          }
        }
        if (!valid || executable === 0) break;
        corrected.push(step.count === 'untilDone' ? step : {...step,count:executable});
      }
      if (!valid || searches === 0) continue;
      const actual = engine.getState().state as Record<string, unknown>;
      for (const assertion of test.expect) {
        const expression = assertion.value as {state?: unknown; op?: unknown; args?: unknown[]} | undefined;
        if (typeof expression?.state === 'string' && Object.keys(expression).length === 1 &&
            Object.hasOwn(actual,expression.state)) {
          if (!same(assertion.equals,actual[expression.state])) {
            assertion.equals = actual[expression.state]; changed = true;
          }
        } else if (expression?.op === 'eq' && Array.isArray(expression.args) &&
            expression.args.length === 2 && typeof (expression.args[0] as {state?: unknown})?.state === 'string') {
          const id = (expression.args[0] as {state:string}).state;
          if (Object.hasOwn(actual,id)) {
            const result = same(actual[id],expression.args[1]);
            if (!same(assertion.equals,result)) {assertion.equals = result; changed = true;}
          }
        }
      }
      if (!same(test.actions,corrected)) {test.actions = corrected; changed = true;}
    } catch {
      // Leave the original test visible to strict validation if the scene
      // cannot execute the independent oracle trajectory.
    }
  }
  return changed ? copy : value;
}

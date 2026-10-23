import { createProcessEngine } from '@/lib/server/process-quality';
import { processExpressionSchema, validateProcessExpressions, validateProcessInput, type ProcessScene } from './schema';
import { parseCinematicJson } from '../cinematic/json';

export function normalizeTestInputValues(scene: Pick<ProcessScene,'inputs'>, value: unknown): unknown {
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray((value as {tests?:unknown}).tests))return value;
  const result=structuredClone(value) as {tests:Array<{inputs?:Record<string,unknown>}>};
  for(const test of result.tests){
    if(!test.inputs||typeof test.inputs!=='object'||Array.isArray(test.inputs))continue;
    for(const input of scene.inputs){
      const raw=test.inputs[input.id];let converted:unknown=raw;
      if(['number','range'].includes(input.type)&&typeof raw==='string'&&/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw))converted=Number(raw);
      else if(input.type==='toggle'&&typeof raw==='string'&&['true','false'].includes(raw))converted=raw==='true';
      if(converted===raw)continue;
      try{validateProcessInput(input,converted);test.inputs[input.id]=converted;}catch{}
    }
  }
  return result;
}

export function normalizeTestExpressionValues(scene: Pick<ProcessScene,'inputs'|'initialState'>, value: unknown): unknown {
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray((value as {tests?:unknown}).tests))return value;
  const result=structuredClone(value) as {tests:Array<{expect?:Array<{value:unknown;equals:unknown}>}>};
  for(const test of result.tests)for(const assertion of test.expect??[]){
    if(typeof assertion.value!=='string'||typeof assertion.equals==='string'||!/^\s*\{/.test(assertion.value))continue;
    try{
      const quoted=assertion.value.replace(/\\"/g,'"').replace(
        /("(?:\\.|[^"\\])*")|([,{]\s*)(op|args|state|input|local)\s*:/g,
        (match,literal,prefix,key)=>literal??`${prefix}"${key}":`);
      const expression=processExpressionSchema.parse(parseCinematicJson(quoted).value);
      if(!expression||typeof expression!=='object'||Array.isArray(expression))continue;
      validateProcessExpressions(expression,scene);assertion.value=expression;
    }catch{}
  }
  return result;
}

export function removeNarrativeTestAssertions(scene: Pick<ProcessScene,'initialState'|'decisions'>, value: unknown): unknown {
  if(!scene.decisions?.length||!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray((value as {tests?:unknown}).tests))return value;
  const result=structuredClone(value) as {tests:Array<{expect?:Array<{value:unknown;equals:unknown}>}>};
  for(const test of result.tests){
    if(!Array.isArray(test.expect))continue;
    const domainChecks=test.expect.filter(assertion=>{
      const field=(assertion.value as {state?:unknown})?.state;
      return typeof field==='string'&&typeof scene.initialState[field]!=='string'&&
        (typeof assertion.equals==='number'||typeof assertion.equals==='boolean'||Array.isArray(assertion.equals));
    });
    if(domainChecks.length<2)continue;
    test.expect=test.expect.filter(assertion=>{
      const field=(assertion.value as {state?:unknown})?.state;
      return !(typeof field==='string'&&/feedback|message|explanation|description|result|terminalCondition/i.test(field)&&
        typeof scene.initialState[field]==='string'&&typeof assertion.equals==='string'&&
        assertion.equals.length>24&&/[。！？，；]/u.test(assertion.equals));
    });
  }
  return result;
}

/** Accept the common `type` spelling only when it names a real domain action.
 * Player-owned commands have separate browser checks and cannot be executed by
 * a scene test. Keep unknown commands visible to the strict validator. */
export function normalizeGeneratedTestActions(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {tests?: unknown};
  if (!Array.isArray(envelope.tests)) return value;
  const copy = structuredClone(envelope) as {tests: Array<{
    actions?: Array<{id?: unknown; type?: unknown; count?: unknown}>;
    expect?: Array<{value?: unknown; equals?: unknown}>;
  }>};
  const domain = new Set(scene.actions.map(action => action.id));
  for(const test of copy.tests)if(Array.isArray(test.actions))
    test.actions=test.actions.filter(step=>!(step.count===0&&typeof step.id==='string'&&domain.has(step.id)));
  const player = /^(?:undo(?:Step)?|reset|play|pause|resume|check|verify)$/i;
  // Every expectation is evaluated after the complete action sequence. A
  // model may list a trajectory as repeated assertions of the same expression
  // (for example index=1, then index=3); only the last is about the final frame.
  for (const test of copy.tests) if (Array.isArray(test?.expect)) {
    const last = new Map(test.expect.map((assertion, index) => [JSON.stringify(assertion.value), index]));
    test.expect = test.expect.filter((assertion, index) => last.get(JSON.stringify(assertion.value)) === index);
  }
  for (const test of copy.tests) if (Array.isArray(test?.actions))
    for (const step of test.actions) if (step && typeof step === 'object' &&
        typeof step.type === 'string' && step.id === undefined && domain.has(step.type)) {
      step.id = step.type;
      delete step.type;
    }
  const executable = copy.tests.filter(test => Array.isArray(test?.actions) && test.actions.length > 0 &&
    test.actions.every(step => typeof step?.id === 'string' && domain.has(step.id)));
  if (executable.length >= 3) copy.tests = copy.tests.filter(test =>
    !Array.isArray(test?.actions) || !test.actions.some(step =>
      (typeof step?.id === 'string' && !domain.has(step.id) && player.test(step.id)) ||
      (typeof step?.type === 'string' && player.test(step.type))));
  if (copy.tests.length > 8) copy.tests = copy.tests.slice(0, 8);
  return copy;
}

function createInitialCheckEngine(scene: ProcessScene) {
  try { return createProcessEngine(scene); }
  catch {
    // A presentation or coverage typo must not force the test authoring stage
    // to regenerate a provably redundant initial-frame check. This engine is
    // used only for assertions before any domain action runs.
    return createProcessEngine({
      schemaVersion: 'process-v1', title: '初态检查', summary: '核对输入和初始状态',
      modelNote: '测试用确定性状态模型', inputs: scene.inputs,
      initialState: scene.initialState, actions: scene.actions,
      views: [
        {id: 'initialA', title: '初态标记', kind: 'value', value: 0},
        {id: 'initialB', title: '状态标记', kind: 'value', value: 0},
      ],
      stages: [
        {id: 'initial', title: '初态', when: true, explanation: '尚未执行'},
        {id: 'other', title: '后续', when: false, explanation: '后续执行'},
      ], questions: [], coverage: [],
    });
  }
}

export function removeRedundantInitialTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (!Array.isArray(envelope.tests)) return value;
  const tests = envelope.tests as Array<Record<string, unknown>>;
  if (tests.filter(test => Array.isArray(test?.actions) && test.actions.length > 0).length < 3)
    return value;
  const filtered = tests.filter(test => {
    if (!Array.isArray(test?.actions) || test.actions.length !== 0 ||
        !test.inputs || typeof test.inputs !== 'object' || Array.isArray(test.inputs) ||
        !Array.isArray(test.expect) || test.expect.length === 0) return true;
    try {
      const engine = createInitialCheckEngine(scene);
      for (const [id, input] of Object.entries(test.inputs)) engine.setInput(id, input);
      return !test.expect.every((assertion: any) =>
        JSON.stringify(engine.evaluate(assertion.value)) === JSON.stringify(assertion.equals));
    } catch { return true; }
  });
  return filtered.length === tests.length ? value : { ...envelope, tests: filtered };
}

/** A one-click test whose action leaves both domain state and rendered views
 * unchanged adds no interaction coverage. Verify the whole trajectory before
 * discarding it, and retain at least three independently executable tests. */
export function removeNoopDomainTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (!Array.isArray(envelope.tests) || envelope.tests.length < 4) return value;
  const tests = envelope.tests as Array<{inputs?: Record<string, unknown>;
    actions?: Array<{id?: string; count?: number}>;
    expect?: Array<{value?: unknown; equals?: unknown}>}>;
  const filtered = tests.filter(test => {
    if (!test.inputs || typeof test.inputs !== 'object' || Array.isArray(test.inputs) ||
        !Array.isArray(test.actions) || test.actions.length !== 1 || test.actions[0]?.count !== 1 ||
        typeof test.actions[0]?.id !== 'string' || !Array.isArray(test.expect) || !test.expect.length) return true;
    try {
      const engine = createProcessEngine(scene);
      for (const [id, input] of Object.entries(test.inputs)) engine.setInput(id, input);
      const before = engine.getState().state;
      const viewsBefore = engine.views();
      if (!engine.can(test.actions[0].id)) return true;
      engine.act(test.actions[0].id);
      if (JSON.stringify(engine.getState().state) !== JSON.stringify(before) ||
          JSON.stringify(engine.views()) !== JSON.stringify(viewsBefore)) return true;
      return !test.expect.every(assertion => JSON.stringify(engine.evaluate(assertion.value as any)) ===
        JSON.stringify(assertion.equals));
    } catch { return true; }
  });
  return filtered.length >= 3 && filtered.length < tests.length ? {...envelope, tests: filtered} : value;
}

/** Drop a generated XOR test only when its own inputs demand a disabled
 * action. The surviving executable tests still undergo full validation. */
export function removeNonExecutableXorTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (!Array.isArray(envelope.tests) || envelope.tests.length < 4) return value;
  const textInput = scene.inputs.find(input => input.type === 'text' && input.ascii === true);
  const xorActions = new Set(scene.actions.filter(action => JSON.stringify(action).includes('"op":"xor"'))
    .map(action => action.id));
  if (!textInput || !xorActions.size) return value;
  const tests = envelope.tests as Array<{inputs?: Record<string, unknown>;
    actions?: Array<{id?: string; count?: number | string}>}>;
  const filtered = tests.filter(test => {
    const text = test.inputs?.[textInput.id];
    if (typeof text !== 'string' || !Array.isArray(test.actions) || !/^[\x20-\x7e]*$/.test(text)) return true;
    const xorCount = test.actions.reduce((sum, step) =>
      sum + (xorActions.has(step.id ?? '') && typeof step.count === 'number' ? step.count : 0), 0);
    if (text.length > 0 && xorCount <= text.length) return true;
    try {
      const engine = createProcessEngine(scene);
      let xorExecuted = 0;
      for (const [id, input] of Object.entries(test.inputs ?? {})) engine.setInput(id, input);
      for (const step of test.actions) {
        if (!step.id || typeof step.count !== 'number' || !Number.isInteger(step.count) || step.count < 1 || step.count > 256)
          return true;
        for (let index = 0; index < step.count; index++) {
          if (!engine.can(step.id)) return false;
          try { engine.act(step.id); }
          catch { return xorExecuted >= text.length ? false : true; }
          if (xorActions.has(step.id)) xorExecuted++;
        }
      }
    } catch { return true; }
    return true;
  });
  return filtered.length >= 3 && filtered.length < tests.length ? {...envelope, tests: filtered} : value;
}

import { Script } from 'node:vm';
import engineSource from '@/lib/process/engine.js?raw';
import {
  parseProcessScene,
  parseProcessContract,
  processPackageSchema,
  validateProcessExpressions,
  type ProcessScene,
  type ProcessExpression,
  type ProcessValue,
  type ProcessPackage,
} from '@/lib/process/schema';

export type ProcessSnapshot = {
  state: Record<string, ProcessValue>;
  inputs: Record<string, ProcessValue>;
  feedback: string;
  count: number;
  history: { action: string; message: string }[];
};
export type ProcessEngine = {
  evaluate(expr: ProcessExpression): ProcessValue;
  evaluateAction(id: string, expr: ProcessExpression): ProcessValue;
  act(id: string): ProcessSnapshot;
  can(id: string): boolean;
  repeatable(id: string): boolean;
  reset(values?: Record<string, unknown>): void;
  run(id: string): number;
  back(): ProcessSnapshot;
  setInput(id: string, value: unknown): void;
  getState(): ProcessSnapshot;
  views(): { id: string; value: ProcessValue }[];
  markers(viewId:string):{activeIndex:number;markedIndices:number[]};
  format(value: ProcessValue, kind?: string): string;
  verify(id: string, answer: string): boolean;
  activeDecisions(): NonNullable<ProcessScene['decisions']>;
  decisionState(): {pending: Array<NonNullable<ProcessScene['decisions']>[number] & {originKey:string;available:string[]}>;
    current: null | {decision:string;action:string;originKey:string;inputs:Record<string,ProcessValue>;conditionsChanged:boolean;values:Record<string,ProcessValue>};
    comparisons:Array<{decision:string;action:string;originKey:string;inputs:Record<string,ProcessValue>;values:Record<string,ProcessValue>}>};
  reconsider(): ProcessSnapshot;
  beginTrial(): ProcessSnapshot;
  pick(viewId:string, position:number): ProcessSnapshot;
};
const context = {
  TextEncoder,
  AISecProcessEngine: undefined as undefined | ((scene: ProcessScene) => ProcessEngine),
};
new Script(engineSource).runInNewContext(context, { timeout: 1000 });
export const createProcessEngine = (scene: ProcessScene): ProcessEngine =>
  context.AISecProcessEngine!(parseProcessScene(scene));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Runtime assertions may express the same decimal through different floating
// point operations. Keep reset/replay checks exact, and permit only numerical
// roundoff here; a wrong count, string, type, or structure must still fail.
function sameAssertionValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (actual === expected) return true;
    if (!Number.isFinite(actual) || !Number.isFinite(expected) ||
        (Number.isInteger(actual) && Number.isInteger(expected))) return false;
    return Math.abs(actual - expected) <= 32 * Number.EPSILON *
      Math.max(1, Math.abs(actual), Math.abs(expected));
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual) && Array.isArray(expected) &&
      actual.length === expected.length && actual.every((value, index) =>
        sameAssertionValue(value, expected[index]));
  }
  return same(actual, expected);
}

export function inspectDecisionAlternatives(scene: ProcessScene, inputs: Record<string, unknown>, path: string[]) {
  const engine = createProcessEngine(scene);
  engine.reset(inputs);
  for (const id of path) engine.act(id);
  const pending = engine.activeDecisions();
  if (pending.length > 1) throw Error('同一情境不能同时出现多个决策点');
  return pending.map(decision => {
    const choices = decision.choices.filter(choice => engine.can(choice));
    if (choices.length < 2) throw Error('决策点必须有至少两个同时可执行的选择：' + decision.id);
    const before = engine.getState();
    const alternatives = choices.map(action => {
      const branch = createProcessEngine(scene);
      branch.reset(inputs);
      for (const id of path) branch.act(id);
      branch.act(action);
      inspect(scene, branch);
      const after = branch.getState();
      const values = Object.fromEntries(decision.observe.map(item => [item.field, after.state[item.field]]));
      // Keeping the current condition is a legitimate baseline choice. The
      // alternatives below must still yield different real domain evidence;
      // a no-op cannot make a whole prose-only decision pass.
      return {action, values, state:after.state, views:branch.views()};
    });
    const meaningful = (values: Record<string, ProcessValue>) => Object.fromEntries(Object.entries(values)
      .filter(([, value]) => typeof value !== 'string' && value !== null));
    const numericEvidence = alternatives.some(item => Object.keys(meaningful(item.values)).length);
    const results = alternatives.map(item => JSON.stringify(numericEvidence ? meaningful(item.values) : item.values));
    // Under light load, two valid policies may have the same outcome. Keep
    // that observation; require a real difference elsewhere in this decision's
    // reachable input range rather than falsifying these domain results.
    return {decision:decision.id,inputs:before.inputs,before:before.state,path:[...path],alternatives,
      distinctDomainResults:new Set(results).size>=2};
  });
}

export function inspectProcessInputGuards(scene: ProcessScene) {
  return scene.inputs.filter(input => input.type === 'text').map(input => {
    const cases = [
      { name: 'printable-space', value: ' ' },
      { name: 'printable-upper-bound', value: '~' },
      { name: 'line-feed', value: '\n' },
      { name: 'tab', value: '\t' },
      { name: 'delete', value: '\x7f' },
      { name: 'null', value: '\0' },
      { name: 'non-ascii', value: '中' },
      { name: 'over-max-length', value: 'A'.repeat((input.maxLength ?? 64) + 1) },
    ];
    return {
      id: input.id,
      maxLength: input.maxLength ?? 64,
      printableAsciiOnly: input.ascii === true,
      validationLayer: 'engine.setInput before reset or domain action',
      probes: cases.map(sample => {
        const engine = createProcessEngine(scene);
        const before = engine.getState();
        try {
          engine.setInput(input.id, sample.value);
          return { name: sample.name, accepted: true };
        } catch (error) {
          if (!same(before, engine.getState())) throw Error('无效输入改变了实验状态');
          return { name: sample.name, accepted: false, stateUnchanged: true, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    };
  });
}
const hasState = (expr: ProcessExpression): boolean =>
  !!expr &&
  typeof expr === 'object' &&
  !Array.isArray(expr) &&
  ('state' in expr || ('args' in expr && expr.args.some(hasState)));

const hasRuntimeEvidence = (expr: ProcessExpression): boolean =>
  !!expr && typeof expr === 'object' && !Array.isArray(expr) &&
  ('state' in expr || 'input' in expr || 'local' in expr || ('args' in expr && expr.args.some(hasRuntimeEvidence)));

export class ProcessTestAssertionError extends Error {
  name = 'ProcessTestAssertionError';
}
export class ProcessTestSequenceError extends ProcessTestAssertionError {
  name = 'ProcessTestSequenceError';
}

function evaluateAt(engine: ProcessEngine, expression: ProcessExpression, path: string, actionId?: string): ProcessValue {
  try {return actionId ? engine.evaluateAction(actionId, expression) : engine.evaluate(expression);} catch (error) {
    const snapshot = engine.getState();
    throw Error((error instanceof Error ? error.message : String(error)) + '；表达式位置=' + path +
      '；失败表达式=' + JSON.stringify(expression).slice(0, 2000) +
      '；执行状态=' + JSON.stringify({state: snapshot.state, inputs: snapshot.inputs, step: snapshot.count}).slice(0, 3000));
  }
}

function inspect(scene: ProcessScene, engine: ProcessEngine, checkActions = true) {
  const activeStages = scene.stages.filter((stage) => {
    const active = evaluateAt(engine, stage.when, '/stages/@' + stage.id + '/when');
    if (typeof active !== 'boolean') throw Error('教学阶段条件必须是布尔值');
    return active;
  });
  // Stage order is an explicit priority. Adjacent boundary predicates often
  // both include the exact transition value; the browser already presents the
  // first match, so validation follows the same deterministic rule. A missing
  // match remains a hard failure and every declared stage must still be
  // reached by the package tests below.
  if (!activeStages.length) throw Error('当前状态没有匹配的教学阶段；stageConditions=' + JSON.stringify(scene.stages.map(stage => ({path: '/stages/@' + stage.id + '/when', when: stage.when}))) + '；执行状态=' + JSON.stringify(engine.getState()).slice(0, 3000));
  const views = scene.views.map((view) => {
    const value = evaluateAt(engine, view.value, '/views/@' + view.id + '/value');
    if (['array', 'bars', 'topology'].includes(view.kind) && !Array.isArray(value))
      throw Error(view.title + '必须呈现数组');
    if(view.kind==='topology'){
      if((value as ProcessValue[]).length!==view.topology!.labels.length)throw Error('拓扑状态数量必须与设备数量一致');
      for(const edge of view.topology!.edges)for(const field of ['activeWhen','blockedWhen'] as const)
        if(edge[field]!==undefined&&typeof engine.evaluate(edge[field]!)!=='boolean')throw Error('拓扑连接条件必须为布尔值');
    }
    if (['text', 'code'].includes(view.kind) && typeof value !== 'string')
      throw Error(view.title + '必须呈现文字');
    // Plain scalar tuples are useful evidence (for example legitimate and
    // blocked request counts). The shared formatter preserves every entry;
    // they do not replace an object view or satisfy object-pick validation.
    if (view.kind === 'value' && Array.isArray(value) && view.format && view.format !== 'plain')
      throw Error(view.title + '的组合读数必须使用plain格式');
    if (
      view.kind === 'bars' &&
      (value as ProcessValue[]).some((v) => typeof v !== 'number' || !Number.isFinite(v))
    )
      throw Error('条形图必须呈现有限数值');
    if (view.format && view.format !== 'plain') {
      const numbers = Array.isArray(value) ? value : [value];
      if (
        numbers.some(
          (v) =>
            typeof v !== 'number' ||
            !Number.isSafeInteger(v) ||
            v < 0 ||
            (view.format === 'byte' && v > 255),
        )
      )
        throw Error('字节/十六进制视图数值无效');
    }
    if (view.activeIndex !== undefined) {
      if (!['array','bars','topology','code'].includes(view.kind))
        throw Error(view.title + '声明了活动索引，但该视图类型不会显示活动格');
      engine.markers(view.id);
    }
    if (view.markedIndices !== undefined) {
      engine.markers(view.id);
      if(!Array.isArray(value)&&view.kind!=='code')throw Error('只有数组或代码视图支持状态标记');
    }
    if (view.addressBase !== undefined) {
      const base = evaluateAt(engine, view.addressBase, '/views/@' + view.id + '/addressBase');
      if (typeof base !== 'number' || !Number.isSafeInteger(base) || base < 0 ||
          base + (value as ProcessValue[]).length > 0x100000000)
        throw Error('字节数组地址必须是有效的32位整数范围');
    }
    if (Array.isArray(value) && view.regions) for (const [index, region] of view.regions.entries()) {
      const start = typeof region.start === 'number' ? region.start : evaluateAt(engine, region.start, '/views/@' + view.id + '/regions/' + index + '/start');
      const rawEnd = typeof region.end === 'number' ? region.end : evaluateAt(engine, region.end, '/views/@' + view.id + '/regions/' + index + '/end');
      // Static regions retain the original inclusive end. Dynamic expressions
      // use the array-operation convention (end exclusive), which lets authors
      // bind a region directly to length/slice calculations.
      const numericStart=Number(start),numericRawEnd=Number(rawEnd),end = typeof region.end === 'number' ? numericRawEnd : numericRawEnd - 1;
      if (!Number.isInteger(numericStart) || !Number.isInteger(numericRawEnd)) throw Error('标注区域下标必须是整数');
      if (value.length === 0) continue;
      // A dynamic half-open region [length, length) is empty, just like
      // [0, 0). The player omits both; neither addresses an array cell.
      if (typeof region.end !== 'number' && numericStart === numericRawEnd &&
          numericStart >= 0 && numericStart <= value.length) continue;
      if (numericStart < 0 || numericStart > end || end >= value.length)
        throw Error('标注区域超出实际数组：' + JSON.stringify({view: view.id, region: index,
          start: numericStart, end, rawEnd: numericRawEnd, length: value.length,
          convention: typeof region.end === 'number' ? 'inclusive' : 'exclusive'}));
    }
    return { id: view.id, value };
  });
  if (checkActions) for (const action of scene.actions) {
    engine.can(action.id);
    if (
      engine.can(action.id) &&
      action.repeatWhile !== undefined &&
      typeof evaluateAt(engine, action.repeatWhile, '/actions/@' + action.id + '/repeatWhile') !== 'boolean'
    )
      throw Error('连续执行条件必须是布尔值');
  }
  return {
    stage: activeStages[0].id,
    views:[...views,...(scene.decisions??[]).flatMap(decision=>decision.observe.map(item=>({id:`decision-${decision.id}-${item.field}`,value:engine.getState().state[item.field]})))],
    count: engine.getState().count,
    feedback: engine.getState().feedback,
  };
}

export function validateProcessPresentationFrames(scene: ProcessScene): void {
  const defaults = Object.fromEntries(scene.inputs.map(input => [input.id, input.default]));
  const probes: Record<string, unknown>[] = [defaults];
  for (const input of scene.inputs) {
    const alternate = input.type === 'select'
      ? input.options?.find(option => option.value !== input.default)?.value
      : input.type === 'toggle' ? !input.default
        : input.type === 'text' ? (input.default === '' ? 'A' : '')
          : input.min !== input.default ? input.min : input.max;
    if (alternate !== undefined && alternate !== input.default)
      probes.push({...defaults, [input.id]: alternate});
  }
  const sampled = new Set<string>();
  for (const values of probes) {
    if (sampled.size >= 4) break;
    const key = JSON.stringify(values);
    if (sampled.has(key)) continue;
    sampled.add(key);
    const queue: string[][] = [[]];
    const seen = new Set<string>();
    let transitions = 0;
    while (queue.length && transitions < 24) {
      const path = queue.shift()!;
      const engine = createProcessEngine(scene);
      try {
        engine.reset(values);
        for (const id of path) engine.act(id);
      } catch {
        continue;
      }
      const fingerprint = JSON.stringify(engine.getState().state);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      if (!path.length) {
        try { inspect(scene, engine, false); }
        catch (error) {
          throw Error(`展示阶段输入=${key} 路径=初态：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      for (const action of scene.actions) {
        try { if (!engine.can(action.id)) continue; }
        catch { continue; }
        const branch = createProcessEngine(scene);
        try {
          branch.reset(values);
          for (const id of path) branch.act(id);
          branch.act(action.id);
        } catch {
          continue;
        }
        transitions++;
        try { inspect(scene, branch, false); }
        catch (error) {
          throw Error(`展示阶段输入=${key} 路径=${[...path, action.id].join(' → ')}：${error instanceof Error ? error.message : String(error)}`);
        }
        if (path.length < 7 && JSON.stringify(branch.getState().state) !== fingerprint)
          queue.push([...path, action.id]);
        if (transitions >= 24) break;
      }
    }
  }
}

function initialGuardStages(scene: ProcessScene) {
  const defaults = Object.fromEntries(scene.inputs.map(input => [input.id, input.default]));
  const probes: Record<string, ProcessValue>[] = [defaults];
  for (const input of scene.inputs) {
    const values: ProcessValue[] = input.type === 'text'
      ? ['', 'A', input.default]
      : input.type === 'toggle'
        ? [false, true]
        : input.type === 'select'
          ? (input.options ?? []).map(option => option.value)
          : [input.min, input.max, input.default].filter((value): value is number => typeof value === 'number');
    for (const value of values) probes.push({...defaults, [input.id]: value});
  }
  const reached = new Set<string>(), seen = new Set<string>();
  for (const values of probes.slice(0, 32)) {
    const fingerprint = JSON.stringify(values);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const engine = createProcessEngine(scene);
    try {engine.reset(values);} catch {continue;}
    // Only genuine pre-action guard/readiness states are covered here. A
    // teaching stage with an executable domain action must still be reached by
    // a deterministic scenario test and cannot be exempted by its wording.
    if (scene.actions.some(action => engine.can(action.id))) continue;
    reached.add(inspect(scene, engine).stage);
  }
  return reached;
}
export function validateProcessPackage(raw: unknown, requirements: string[] = [], options: { minimumProductQuality?: boolean; requireLearnerDecisions?:boolean; strictStageCoverage?:boolean;minimumEvidenceQuestions?:number } = {}) {
  if ((JSON.stringify(raw)?.length ?? 0) > 220000) throw Error('互动过程规格超过完整校验容量，未截断');
  const scene = parseProcessScene((raw as { scene?: unknown })?.scene);
  const pkg: ProcessPackage = parseProcessContract(processPackageSchema, raw);
  const declared = scene.coverage.map((item) => item.description);
  if (
    new Set(declared).size !== declared.length ||
    requirements.some((item) => !declared.includes(item))
  )
    throw Error('交互要求缺少一一对应的输入、操作和可视证据');
  const stateViews = new Set(
    scene.views.filter((view) => hasState(view.value)).map((view) => view.id),
  );
  const realStateViewCount=stateViews.size;
  for(const decision of scene.decisions??[])for(const item of decision.observe)stateViews.add(`decision-${decision.id}-${item.field}`);
  if (!stateViews.size) throw Error('必须有由真实状态驱动的可见内容');
  if (options.requireLearnerDecisions && !scene.decisions?.length) throw Error('新互动演示必须有学生可作决策的情境与至少两个领域选择，下一步/播放/输入框不能代替决策');
  if (options.minimumProductQuality) {
    const decisionSurface=options.requireLearnerDecisions&&scene.decisions?.length;
    if(decisionSurface?(scene.views.length<2||realStateViewCount<1):(scene.views.length < 4 || realStateViewCount < 2))
      throw Error(decisionSurface?'决策实验须有场景证据及真实状态读数，不能仅显示选择文案':'金样本级互动成品至少需要4个视图，其中至少2个由真实状态驱动');
    if (!scene.views.some(view => ['array', 'bars', 'code', 'topology'].includes(view.kind)))
      throw Error('完整互动成品至少需要一个结构证据视图：array、bars、code或topology');
    if (scene.stages.length < (scene.decisions?.length?2:3))
      throw Error(scene.decisions?.length?'决策实验至少需要情境与后果两个可达阶段':'完整互动成品至少需要准备、过程、结果等3个互斥阶段');
    const minimumQuestions=options.minimumEvidenceQuestions??(decisionSurface?0:1);
    if(scene.questions.filter(question=>stateViews.has(question.evidenceView)).length<minimumQuestions)
      throw Error('互动成品须保留要求的'+minimumQuestions+'个引用状态驱动可见读数的核对题');
    if (pkg.tests.length < 3)
      throw Error('完整互动成品至少需要3组真实执行测试，覆盖正常、边界和不同结果');
    if (!scene.actions.some(action => hasRuntimeEvidence(action.feedback)))
      throw Error('完整互动成品的即时反馈必须读取当前状态、输入或动作局部量');
  }
  const evidence = [];
  const decisionEvidence: ReturnType<typeof inspectDecisionAlternatives> = [];
  const inspectedDecisions = new Set<string>();
  for (const test of pkg.tests) {
    validateProcessExpressions(test.expect, scene);
    if (!test.expect.some((assertion) => hasState(assertion.value)))
      throw Error('测试必须断言实际状态，不只断言输入');
    const engine = createProcessEngine(scene);
    engine.reset(test.inputs);
    const initial = engine.getState(),
      frames = [inspect(scene, engine)];
    const testReachedStages = new Set(frames.map(frame=>frame.stage));
    const transitions: Array<{action: string; before: unknown; after: unknown}> = [];
    let changed = false;
    let executedDecision=false;
    const path: string[] = [];
    for (const operation of test.actions) {
      const repeat = operation.count === 'untilDone';
      if (repeat && !engine.repeatable(operation.id)) throw Error(test.name + '：连续操作不可执行');
      const limit = repeat ? 256 : (operation.count as number);
      for (let step = 0; step < limit && (!repeat || engine.repeatable(operation.id)); step++) {
        if (scene.decisions?.length && !engine.can(operation.id))
          throw new ProcessTestSequenceError(test.name + '：测试重复或提前执行已禁用动作；回到决策点是播放器内置操作，不能靠重复准备冒充；只修本测试操作序列，不改正确的领域前置条件：' + operation.id);
        const pending=engine.activeDecisions();
        if(pending.some(decision=>decision.choices.includes(operation.id)))executedDecision=true;
        if(pending.some(decision=>!inspectedDecisions.has(JSON.stringify([decision.id,engine.getState().inputs])))){
          for(const evidence of inspectDecisionAlternatives(scene,test.inputs,path)){
            const signature=JSON.stringify([evidence.decision,evidence.inputs]);
            if(!inspectedDecisions.has(signature)){inspectedDecisions.add(signature);decisionEvidence.push(evidence);}
          }
        }
        const beforeState = engine.getState().state;
        const before = inspect(scene,engine).views.filter((view) => stateViews.has(view.id));
        try {engine.act(operation.id);} catch (error) {
          const action = scene.actions.find(item => item.id === operation.id);
          let diagnostic = error instanceof Error ? error.message : String(error);
          try {
            for (const [index, update] of (action?.updates ?? []).entries()) {
              evaluateAt(engine, update.value, `/actions/@${operation.id}/updates/${index}/value`, operation.id);
              if (update.index !== undefined) evaluateAt(engine, update.index, `/actions/@${operation.id}/updates/${index}/index`, operation.id);
            }
          } catch (cause) {
            diagnostic = cause instanceof Error ? cause.message : String(cause);
          }
          throw Error(`${test.name} step=${step} action=${operation.id}: ` + diagnostic +
            '；recentTransitions=' + JSON.stringify(transitions).slice(0, 5000) +
            '；定位产生错误状态的上游动作；同一action读取修改前状态，不能靠保护下游表达式掩盖错误初始化或计算。');
        }
        transitions.push({action: operation.id, before: beforeState, after: engine.getState().state});
        path.push(operation.id);
        if (transitions.length > 3) transitions.shift();
        const frame = inspect(scene, engine);
        testReachedStages.add(frame.stage);
        if (
          !same(
            before,
            frame.views.filter((view) => stateViews.has(view.id)),
          )
        )
          changed = true;
        if (frames.length < 12) frames.push(frame);
      }
      if (repeat && engine.repeatable(operation.id))
        throw Error(test.name + '：连续过程未在256步内终止');
    }
    for (const [index, assertion] of test.expect.entries()) {
      const actual = evaluateAt(engine, assertion.value, `/tests/${test.name}/expect/${index}`);
      if (!sameAssertionValue(actual, assertion.equals))
        throw new ProcessTestAssertionError(test.name + '：期望与实际状态不符 ' + JSON.stringify({expression: assertion.value, expected: assertion.equals, actual, state: engine.getState().state, recentTransitions: transitions}));
    }
    const idempotentObservation=options.requireLearnerDecisions&&scene.decisions?.length&&
      test.actions.every(operation=>!scene.decisions!.some(decision=>decision.choices.includes(operation.id)))&&
      same(engine.getState().state,initial.state);
    // An explicit decision such as "leave unchanged" can preserve every
    // number. The shared-point branch check below still requires genuine
    // alternative outcomes in at least one reachable condition.
    const unchangedDecisionOutcome=options.requireLearnerDecisions&&executedDecision&&!changed;
    if (!changed&&!idempotentObservation&&!unchangedDecisionOutcome)
      throw Error(test.name + '：只有文字/日志或输入改变，操作未改变状态驱动的可见内容');
    const final = inspect(scene, engine),
      finalState = engine.getState();
    testReachedStages.add(final.stage);
    engine.reset(test.inputs);
    if (!same(engine.getState(), initial)) throw Error('重置未恢复完全相同的初态');
    for (const operation of test.actions) {
      if (operation.count === 'untilDone') engine.run(operation.id);
      else for (let n = 0; n < operation.count; n++) engine.act(operation.id);
    }
    if (!same(engine.getState(), finalState)) throw Error('同一输入和操作不能确定性复现');
    evidence.push({
      name: test.name,
      inputs: initial.inputs,
      frames,
      final,
      reachedStages:[...testReachedStages],
      steps: finalState.count,
      ...(idempotentObservation?{idempotentObservation:true}:{}),
      ...(unchangedDecisionOutcome?{unchangedDecisionOutcome:true}:{}),
      passed: true,
    });
  }
  const distinctInputs = new Set(evidence.map((item) => JSON.stringify(item.inputs))).size;
  const distinctActionSequences = new Set(pkg.tests.map((test) => JSON.stringify(test.actions))).size;
  const distinctResults = new Set(evidence.map((item) =>
    JSON.stringify(item.final.views.filter((view) => stateViews.has(view.id))))).size;
  if ((scene.inputs.length ? distinctInputs < 2 && !decisionEvidence.length : distinctActionSequences < 2) || distinctResults < 2)
    throw Error(scene.inputs.length
      ? '至少两组不同输入必须产生不同的状态计算结果，不能写死同一结局'
      : '固定参数过程必须用不同操作步数产生不同的状态计算结果，不能写死同一结局');
  const presentationWarnings:string[]=[];
  if (options.minimumProductQuality) {
    // Some lessons have exactly one meaningful control (for example "访问下一页")
    // whose successive presses carry the entire causal sequence. Count the
    // tested transitions instead of forcing a duplicate reset/undo action.
    if (scene.actions.length < 2 &&
        !(scene.actions.length === 1 && scene.actions[0].repeatWhile !== undefined &&
          evidence.some(item => item.steps >= 3)))
      throw Error('完整互动成品需要2个有因果区别的领域操作，或一个经测试至少执行3步的连续领域操作');
    const reachedStages = new Set([
      ...evidence.flatMap(item => item.reachedStages),
      ...initialGuardStages(scene),
    ]);
    const missingStages = scene.stages.filter(stage => !reachedStages.has(stage.id)).map(stage => stage.id);
    if (missingStages.length){
      if(!scene.decisions?.length||options.strictStageCoverage)throw Error('完整互动成品的真实测试必须到达每个教学阶段：'+missingStages.join(', '));
      presentationWarnings.push('附加讲解阶段未被运行路径选中：'+missingStages.join(', '));
    }
  }
  const missingDecisions = (scene.decisions ?? []).filter(decision => !decisionEvidence.some(item => item.decision === decision.id));
  if (missingDecisions.length) throw Error('真实执行测试没有到达决策点：' + missingDecisions.map(item => item.id).join(', '));
  const ineffectiveDecisions=(scene.decisions??[]).filter(decision=>!decisionEvidence.some(item=>item.decision===decision.id&&item.distinctDomainResults));
  if(ineffectiveDecisions.length)throw Error('同一起点的不同决策必须在至少一种可达条件下产生不同的领域结果，不能只改阶段、标签或日志：'+ineffectiveDecisions.map(item=>item.id).join(', '));
  return { scene, tests: pkg.tests, evidence, decisionEvidence, presentationWarnings, status: 'deterministic-process-verified' as const };
}

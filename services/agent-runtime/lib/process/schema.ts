import { z } from 'zod';

export type ProcessScalar = string | number | boolean | null;
export type ProcessValue = ProcessScalar | ProcessScalar[];
export type ProcessExpression =
  | ProcessValue
  | { state: string }
  | { input: string }
  | { local: string }
  | { op: string; args: ProcessExpression[] };
const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);
const value = z.union([scalar, z.array(scalar).max(128)]);
const id = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/)
  .refine((v) => !['constructor', 'prototype', '__proto__'].includes(v));
export const processOperations = {
  add: [2, 2],
  sub: [2, 2],
  mul: [2, 2],
  div: [2, 2],
  mod: [2, 2],
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  abs: [1, 1],
  min: [2, 2],
  max: [2, 2],
  eq: [2, 2],
  ne: [2, 2],
  lt: [2, 2],
  lte: [2, 2],
  gt: [2, 2],
  gte: [2, 2],
  and: [2, 8],
  or: [2, 8],
  not: [1, 1],
  if: [3, 3],
  length: [1, 1],
  at: [2, 2],
  utf8: [1, 1],
  append: [2, 2],
  indicesOf: [2, 2],
  range: [2, 3],
  concatArrays: [2, 2],
  join: [1, 2],
  array: [0, 16],
  slice: [3, 3],
  sum: [1, 1],
  bitDifference: [2, 2],
  xor: [2, 2],
  readLE: [3, 3],
  hex: [1, 2],
  hexBytes: [1, 1],
  concat: [1, 12],
} as const;
const expression: z.ZodType<ProcessExpression> = z.lazy(() =>
  z.union([
    value,
    z.object({ state: id }).strict(),
    z.object({ input: id }).strict(),
    z.object({ local: id }).strict(),
    z
      .object({
        op: z.enum(
          Object.keys(processOperations) as [
            keyof typeof processOperations,
            ...(keyof typeof processOperations)[],
          ],
        ),
        args: z.array(expression).max(16),
      })
      .strict(),
  ]),
);
export const processExpressionSchema = expression;
const text = z.string().min(1).max(1200);
const inputSchema = z
  .object({
    id,
    label: text,
    type: z.enum(['text', 'number', 'range', 'toggle', 'select']),
    mode: z.enum(['reset', 'live']).optional(),
    default: scalar,
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().positive().optional(),
    maxLength: z.number().int().min(1).max(256).optional(),
    ascii: z.boolean().optional(),
    options: z
      .array(z.object({ label: text, value: scalar }).strict())
      .min(1)
      .max(12)
      .optional(),
    presets: z
      .array(z.object({ label: text, value: scalar }).strict())
      .max(8)
      .optional(),
  })
  .strict();
const viewSchema = z
  .object({
    id,
    title: text,
    kind: z.enum(['value', 'text', 'array', 'bars', 'code', 'topology']),
    value: expression,
    pick: z.object({ input: id, action: id.optional() }).strict().optional(),
    caption: text.optional(),
    addressBase: expression.optional(),
    topology: z.object({
      labels: z.array(z.string().min(1).max(48)).min(2).max(16),
      tones: z.array(z.object({value:scalar,tone:z.enum(['neutral','active','danger','success','muted'])}).strict()).max(16).default([]),
      edges: z.array(z.object({from:z.number().int().min(0).max(15),to:z.number().int().min(0).max(15),
        label:z.string().max(32).optional(),tone:z.enum(['neutral','active','danger','success','muted']).optional(),
        activeWhen:expression.optional(),blockedWhen:expression.optional()}).strict()).max(32),
    }).strict().optional(),
    format: z.enum(['plain', 'hex', 'byte']).optional(),
    activeIndex: expression.optional(),
    markedIndices: expression.optional(),
    regions: z
      .array(
        z
          .object({
            start: z.union([z.number().int().min(0).max(127), expression]),
            end: z.union([z.number().int().min(0).max(127), expression]),
            label: text,
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();
const actionSchema = z
  .object({
    id,
    label: text,
    description: text,
    enabledWhen: expression,
    repeatWhile: expression.optional(),
    locals: z.array(z.object({id, value: expression}).strict()).max(64).optional(),
    feedback: expression,
    updates: z
      .array(z.object({ target: id, index: expression.optional(), value: expression }).strict())
      .min(1)
      .max(32),
  })
  .strict();
const decisionSchema = z.object({
  id,
  prompt: text,
  when: expression,
  choices: z.array(id).min(2).max(6),
  observe: z.array(z.object({ field: id, label: text }).strict()).min(1).max(6),
}).strict();
export const processSceneSchema = z
  .object({
    schemaVersion: z.literal('process-v1'),
    title: text,
    summary: text,
    modelNote: z.string().min(1).max(4000),
    layout: z.enum(['standard', 'code-lab', 'decision-lab']).optional(),
    inputs: z.array(inputSchema).max(8),
    initialState: z.record(id, value),
    views: z.array(viewSchema).min(2).max(12),
    actions: z.array(actionSchema).min(1).max(12),
    decisions: z.array(decisionSchema).max(6).optional(),
    stages: z
      .array(z.object({ id, title: text, when: expression, explanation: text }).strict())
      .min(2)
      .max(12),
    questions: z
      .array(z.object({ id, prompt: text, evidenceView: id }).strict())
      .max(6)
      .default([]),
    coverage: z
      .array(
        z
          .object({
            description: text,
            inputs: z.array(id).max(8),
            actions: z.array(id).max(12),
            views: z.array(id).min(1).max(12),
          })
          .strict(),
      )
      .max(32)
      .default([]),
  })
  .strict();
export type ProcessScene = z.infer<typeof processSceneSchema>;
export const processPackageSchema = z
  .object({
    scene: processSceneSchema,
    tests: z
      .array(
        z
          .object({
            name: text,
            inputs: z.record(id, scalar),
            actions: z
              .array(
                z
                  .object({
                    id,
                    count: z
                      .union([z.number().int().min(1).max(256), z.literal('untilDone')])
                      .default(1),
                  })
                  .strict(),
              )
              .min(1)
              .max(24),
            expect: z
              .array(z.object({ value: expression, equals: value }).strict())
              .min(1)
              .max(12),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  })
  .strict();
export type ProcessPackage = z.infer<typeof processPackageSchema>;

function fail(message: string): never {
  throw new Error('互动过程合同：' + message);
}
export function parseProcessContract<T>(schema: z.ZodType<T>, raw: unknown, prefix = ''): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Nested union errors bury the actual field under thousands of irrelevant alternatives.
  // Give the generator the offending path/value, not a truncated union-error tree.
  const issues = parsed.error.issues.slice(0, 12).map((issue) => {
    let value: unknown = raw;
    for (const key of issue.path)
      value =
        value && typeof value === 'object'
          ? (value as Record<PropertyKey, unknown>)[key]
          : undefined;
    return `${prefix}${issue.path.join('.') || '<root>'}: ${issue.message}; actual=${JSON.stringify(value)?.slice(0, 900) ?? '<missing>'}`;
  });
  fail(issues.join('\n'));
}
export function validateProcessExpressions(value: unknown, scene: Pick<ProcessScene, 'inputs' | 'initialState'>, locals: ReadonlySet<string> = new Set()): void {
  let nodes = 0;
  const walk = (item: unknown, depth: number, path: string, expressionDepth?:number) => {
    if (++nodes > 16000 || depth > 64 || (expressionDepth??0)>24) fail('表达式超过复杂度限制');
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach((child,index) => walk(child, depth + 1, path+'.'+index,expressionDepth));
      return;
    }
    const obj = item as Record<string, unknown>;
    if ('local' in obj && !locals.has(String(obj.local))) fail('未知或尚未计算的局部量 ' + obj.local + '；位置 ' + path);
    if ('state' in obj && !Object.hasOwn(scene.initialState, String(obj.state)))
      fail('未知状态 ' + obj.state+'；位置 '+path);
    if ('input' in obj && !scene.inputs.some((i) => i.id === obj.input))
      fail('未知输入 ' + obj.input+'；位置 '+path);
    if ('op' in obj) {
      const limits = processOperations[obj.op as keyof typeof processOperations];
      if (
        !limits ||
        !Array.isArray(obj.args) ||
        obj.args.length < limits[0] ||
        obj.args.length > limits[1]
      )
        fail('运算参数数量不正确：' + obj.op+'；位置 '+path+'；实际 '+JSON.stringify(obj).slice(0,1000)+'；所需参数数 '+JSON.stringify(limits));
    }
    Object.entries(obj).forEach(([key,child]) => {
      if(key==='args'&&'op' in obj&&Array.isArray(child))
        child.forEach((arg,index)=>walk(arg,depth+2,path+'.args.'+index,(expressionDepth??0)+1));
      else walk(child,depth+1,path+'.'+key);
    });
  };
  walk(value, 0,'scene');
}
export function validateProcessActions(actions: ProcessScene['actions'], scene: Pick<ProcessScene, 'inputs' | 'initialState'>) {
  for (const action of actions) {
    validateProcessExpressions({enabledWhen: action.enabledWhen, repeatWhile: action.repeatWhile}, scene);
    const locals = new Set<string>();
    for (const local of action.locals ?? []) {
      if (locals.has(local.id)) fail('局部量ID重复：' + action.id + '/' + local.id);
      validateProcessExpressions(local.value, scene, locals);
      locals.add(local.id);
    }
    validateProcessExpressions({updates: action.updates, feedback: action.feedback}, scene, locals);
    for (const update of action.updates) if (!Object.hasOwn(scene.initialState, update.target)) fail('操作写入未知状态 ' + update.target);
  }
}
export function validateProcessInputDefinitions(inputs:ProcessScene['inputs']):void {
  for (const input of inputs) {
    if(['number','range'].includes(input.type)&&(typeof input.default!=='number'||input.min===undefined||
      input.max===undefined||input.max<=input.min||input.default<input.min||input.default>input.max))
      fail('数值输入缺少有效范围');
    if(input.type==='toggle'&&typeof input.default!=='boolean')fail('开关默认值必须是布尔值');
    if(input.type==='text'&&typeof input.default!=='string')fail('文本输入默认值必须是字符串');
    if(input.type==='select'&&!input.options?.some(option=>option.value===input.default))fail('选项默认值不存在');
    for(const preset of input.presets??[])validateProcessInput(input,preset.value);
    validateProcessInput(input,input.default);
  }
}
export function parseProcessScene(raw: unknown): ProcessScene {
  if ((JSON.stringify(raw)?.length ?? 0) > 180000) fail('场景过大，未截断要求');
  const checkDepth = (value: unknown, depth = 0): void => {
    // JSON adds an object and args array for each expression level. Keep the
    // structural guard separate from the evaluator's 24 expression levels.
    if (depth > 64) fail('表达式超过复杂度限制');
    if (value && typeof value === 'object')
      Object.values(value).forEach((child) => checkDepth(child, depth + 1));
  };
  checkDepth(raw);
  const scene = parseProcessContract(processSceneSchema, raw, 'scene.');
  const unique = (items: { id: string }[], name: string) => {
    if (new Set(items.map((i) => i.id)).size !== items.length) fail(name + '标识重复');
  };
  for (const field of ['inputs', 'views', 'actions', 'stages', 'questions'] as const)
    unique(scene[field], field);
  unique(scene.decisions ?? [], 'decisions');
  if (!Object.keys(scene.initialState).length || Object.keys(scene.initialState).length > 96)
    fail('状态变量数量应为1–96');
  validateProcessInputDefinitions(scene.inputs);
  for (const action of scene.actions)
    for (const update of action.updates) {
      if (!Object.hasOwn(scene.initialState, update.target))
        fail('操作写入未知状态 ' + update.target);
      if (update.index !== undefined && !Array.isArray(scene.initialState[update.target]))
        fail('索引写入的目标必须是数组');
    }
  for (const view of scene.views) {
    if (view.pick) {
      const input = scene.inputs.find(input => input.id === view.pick!.input);
      if (!['array', 'bars', 'topology'].includes(view.kind) || !input || input.mode !== 'live' ||
        !['number', 'range', 'select'].includes(input.type)) fail('对象操作必须绑定结构视图与live下标或选项输入');
      if (view.pick.action && !scene.actions.some(action => action.id === view.pick!.action)) fail('对象操作引用未知动作');
    }
    if ((view.kind === 'topology') !== Boolean(view.topology)) fail('topology视图须提供且只有该视图可提供topology配置');
    if(view.topology){
      if(new Set(view.topology.labels).size!==view.topology.labels.length)fail('拓扑设备标签必须唯一');
      if(view.topology.edges.some(edge=>edge.from===edge.to||edge.from>=view.topology!.labels.length||edge.to>=view.topology!.labels.length))fail('拓扑连接必须引用两个存在的设备');
      if(new Set(view.topology.tones.map(item=>JSON.stringify(item.value))).size!==view.topology.tones.length)fail('拓扑状态配色重复');
    }
    if (view.markedIndices !== undefined && !['array', 'bars', 'topology', 'code'].includes(view.kind))
      fail('状态标记只用于数组格、柱形、拓扑或代码行');
    if (view.addressBase !== undefined && !(view.kind === 'array' && view.format === 'byte') && view.kind !== 'code')
      fail('地址基值只用于字节数组或代码行号起点');
    for (const region of view.regions || [])
      if (typeof region.start === 'number' && typeof region.end === 'number' && region.end < region.start)
        fail('区域范围倒置');
  }
  for (const decision of scene.decisions ?? []) {
    if (new Set(decision.choices).size !== decision.choices.length) fail('同一决策的选择动作不能重复');
    if (decision.choices.some(choice => !scene.actions.some(action => action.id === choice))) fail('决策引用未知动作');
    if (new Set(decision.observe.map(item => item.field)).size !== decision.observe.length ||
      decision.observe.some(item => !Object.hasOwn(scene.initialState, item.field))) fail('决策观察字段必须存在且不重复');
  }
  for (const question of scene.questions)
    if (
      !scene.views.some(
        (view) => view.id === question.evidenceView && ['value', 'text'].includes(view.kind),
      )
    )
      fail(
        `问题必须对应可见的数值或文字证据：questions.${question.id}.evidenceView=${question.evidenceView}；可用ID=${scene.views
          .filter((view) => ['value', 'text'].includes(view.kind))
          .map((view) => view.id)
          .join(',')}`,
      );
  for (const coverage of scene.coverage)
    for (const field of ['inputs', 'actions', 'views'] as const)
      if (coverage[field].some((id) => !scene[field].some((item) => item.id === id)))
        fail('交互覆盖引用未知' + field);
  validateProcessExpressions(
    { views: scene.views, stages: scene.stages, decisions: scene.decisions },
    scene,
  );
  validateProcessActions(scene.actions, scene);
  return scene;
}
export function validateProcessInput(input: ProcessScene['inputs'][number], value: unknown): void {
  if (
    input.type === 'text' &&
    (typeof value !== 'string' ||
      value.length > (input.maxLength ?? 64) ||
      (input.ascii && /[^\x20-\x7e]/.test(value)))
  )
    fail(input.label + '的长度或字符范围无效');
  if (
    ['range', 'number'].includes(input.type) &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < input.min! ||
      value > input.max!)
  )
    fail(input.label + '超出允许范围');
  if (['range', 'number'].includes(input.type)) {
    const steps = ((value as number) - input.min!) / (input.step ?? 1);
    if (Math.abs(steps - Math.round(steps)) > 1e-8) fail(input.label + '不符合步长要求');
  }
  if (input.type === 'toggle' && typeof value !== 'boolean') fail('开关输入必须是布尔值');
  if (input.type === 'select' && !input.options!.some((option) => option.value === value))
    fail('选择项不存在');
}
export function extractProcessScene(html: string): ProcessScene | null {
  const raw = /<script\b[^>]*\bid=["']process-scene["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!raw) return null;
  try {
    return parseProcessScene(JSON.parse(raw));
  } catch {
    return null;
  }
}

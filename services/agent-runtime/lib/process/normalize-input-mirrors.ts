/** A generated scene sometimes copies an input's default into an identically
 * named state cell, then reads that cell forever. The UI input can change but
 * the calculation still sees the initial default. For cells no action writes,
 * reading the live input is the only input-driven interpretation. */
export function normalizeReadOnlyInputMirrors(
  frozen: {inputs?: Array<{id?: string; default?: unknown}>; initialState?: Record<string, unknown>},
  actions: Array<{updates?: Array<{target?: string}>}> | undefined,
  value: unknown,
): unknown {
  if (!Array.isArray(frozen.inputs) || !frozen.initialState) return value;
  const initialState = frozen.initialState;
  const written = new Set((actions ?? []).flatMap(action =>
    (action.updates ?? []).map(update => update.target).filter((id): id is string => typeof id === 'string')));
  const mirrors = new Set(frozen.inputs.flatMap(input =>
    typeof input.id === 'string' && Object.hasOwn(input, 'default') &&
    Object.hasOwn(initialState, input.id) && !written.has(input.id) &&
    JSON.stringify(input.default) === JSON.stringify(initialState[input.id])
      ? [input.id] : []));
  if (!mirrors.size) return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const object = node as Record<string, unknown>;
    if (Object.keys(object).length === 1 && typeof object.state === 'string' && mirrors.has(object.state))
      return {input: object.state};
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, walk(item)]));
  };
  return walk(value);
}

/** A stage may try to create a new requestSubject state cell even though the
 * frozen state contract contains only the subject input. If its sole write is
 * an exact copy of that input, substitute the immutable input at every read
 * and remove the undeclared write. Computed or multiply written cells fail
 * validation as before. */
export function normalizeUndeclaredInputMirrors(
  frozen:{inputs?:Array<{id?:string}>;initialState?:Record<string,unknown>},value:unknown,
):unknown {
  if(!frozen.initialState||!Array.isArray(frozen.inputs)||!value||
      typeof value!=='object'||Array.isArray(value))return value;
  const source=value as {actions?:Array<{enabledWhen?:unknown;locals?:Array<{id?:string;value?:unknown}>;
    updates?:Array<{target?:string;index?:unknown;value?:unknown}>}>};
  if(!Array.isArray(source.actions))return value;
  const inputs=new Set(frozen.inputs.map(item=>item.id).filter((id):id is string=>typeof id==='string'));
  const writes=new Map<string,Array<{action:number;update:number;input?:string}>>();
  const guardedCopy=(guard:unknown,input:string,value:unknown):boolean=>{
    if(!guard||typeof guard!=='object'||Array.isArray(guard))return false;
    const node=guard as {op?:unknown;args?:unknown[]};
    if(node.op==='and'&&Array.isArray(node.args))return node.args.some(item=>guardedCopy(item,input,value));
    if(node.op!=='eq'||!Array.isArray(node.args)||node.args.length!==2)return false;
    return node.args.some((arg,index)=>arg&&typeof arg==='object'&&!Array.isArray(arg)&&
      Object.keys(arg).length===1&&(arg as {input?:unknown}).input===input&&
      JSON.stringify(node.args![1-index])===JSON.stringify(value));
  };
  source.actions.forEach((action,actionIndex)=>action.updates?.forEach((update,updateIndex)=>{
    if(typeof update.target!=='string'||Object.hasOwn(frozen.initialState!,update.target))return;
    const direct=(update.value as {input?:unknown}|undefined)?.input;
    const local=(update.value as {local?:unknown}|undefined)?.local;
    const localValue=typeof local==='string'
      ? action.locals?.find(item=>item.id===local)?.value as {input?:unknown}|undefined : undefined;
    const input=typeof direct==='string'&&inputs.has(direct)?direct:
      typeof localValue?.input==='string'&&inputs.has(localValue.input)?localValue.input:
      inputs.has(update.target)&&guardedCopy(action.enabledWhen,update.target,update.value)?update.target:undefined;
    const list=writes.get(update.target)??[];
    list.push({action:actionIndex,update:updateIndex,
      input:update.index===undefined&&(update.value!==null&&typeof update.value==='object'&&
        Object.keys(update.value).length===1||input===update.target&&guardedCopy(action.enabledWhen,input,update.value))?input:undefined});
    writes.set(update.target,list);
  }));
  const mirrors=new Map([...writes].flatMap(([target,list])=>
    list.length&&list[0].input&&list.every(write=>write.input===list[0].input)
      ?[[target,list[0].input] as const]:[]));
  if(!mirrors.size)return value;
  const revised=structuredClone(value) as typeof source;
  revised.actions?.forEach(action=>{
    action.updates=action.updates?.filter(update=>!mirrors.has(update.target??''));
  });
  const walk=(node:unknown):unknown=>{
    if(Array.isArray(node))return node.map(walk);
    if(!node||typeof node!=='object')return node;
    const expression=node as Record<string,unknown>;
    if(Object.keys(expression).length===1&&typeof expression.state==='string'&&
        mirrors.has(expression.state))return {input:mirrors.get(expression.state)};
    return Object.fromEntries(Object.entries(expression).map(([key,part])=>[key,walk(part)]));
  };
  return walk(revised);
}

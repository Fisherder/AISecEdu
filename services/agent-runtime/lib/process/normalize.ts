import {processOperations} from './schema';

/** Some authors use join as scalar text concatenation. Accept that spelling
 * only for >2 operands with proven scalar types. Valid array joins, unknown
 * locals and states that can become arrays keep their original semantics. */
export function normalizeScalarTextJoins(context:{initialState?:Record<string,unknown>;
  inputs?:Array<{id?:string}>;actions?:Array<{locals?:Array<{id?:string;value?:unknown}>;
    updates?:Array<{target?:string;value?:unknown}>}>},value:unknown):unknown {
  const states=new Set(Object.entries(context.initialState??{}).filter(([,value])=>
    value===null||['string','number','boolean'].includes(typeof value)).map(([id])=>id));
  const inputs=new Set((context.inputs??[]).map(input=>input.id));
  const scalarOps=new Set(['add','sub','mul','div','mod','min','max','floor','ceil','round','abs',
    'lt','lte','gt','gte','eq','ne','and','or','not','length','sum','xor','bitDifference','readLE',
    'hex','hexBytes','concat','join']);
  const scalar=(value:unknown,locals=new Set<string>()):boolean=>{
    if(value===null||['string','number','boolean'].includes(typeof value))return true;
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const node=value as {state?:string;input?:string;local?:string;op?:string;args?:unknown[]};
    if(Object.keys(node).length===1){
      if(node.state)return states.has(node.state);
      if(node.input)return inputs.has(node.input);
      if(node.local)return locals.has(node.local);
    }
    if(node.op==='if'&&node.args?.length===3)return scalar(node.args[1],locals)&&scalar(node.args[2],locals);
    return typeof node.op==='string'&&scalarOps.has(node.op)&&Array.isArray(node.args);
  };
  const localTypes=(action:NonNullable<typeof context.actions>[number])=>{
    const locals=new Set<string>();
    for(const local of action.locals??[])if(local.id&&scalar(local.value,locals))locals.add(local.id);
    return locals;
  };
  // Remove unproven fields to a fixed point, including transitive references.
  let removed:boolean;
  do{removed=false;for(const action of context.actions??[]){const locals=localTypes(action);
    for(const update of action.updates??[])if(update.target&&states.has(update.target)&&!scalar(update.value,locals)){
      states.delete(update.target);removed=true;
    }
  }}while(removed);
  const rewrite=(node:unknown,locals=new Set<string>()):unknown=>{
    if(Array.isArray(node))return node.map(item=>rewrite(item,locals));
    if(!node||typeof node!=='object')return node;
    const object=node as Record<string,unknown>;
    const scoped=Array.isArray(object.locals)?localTypes(object as NonNullable<typeof context.actions>[number]):locals;
    const result=Object.fromEntries(Object.entries(object).map(([key,item])=>[key,rewrite(item,scoped)]));
    if(result.op==='join'&&Array.isArray(result.args)&&result.args.length>2&&result.args.every(arg=>scalar(arg,scoped)))
      return normalizeProcessExpressions({...result,op:'concat'});
    return result;
  };
  return rewrite(value);
}

export function normalizeProcessExpressions(value: unknown, depth = 0): unknown {
  if (depth > 32 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => normalizeProcessExpressions(item, depth + 1));
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeProcessExpressions(item, depth + 1)]));
  const keys=Object.keys(result);
  if(keys.length===2&&['input','state','local'].includes(String(result.op))&&Array.isArray(result.args)&&
      result.args.length===1&&typeof result.args[0]==='string')return {[String(result.op)]:result.args[0]};
  if(keys.length===1&&Object.hasOwn(processOperations,keys[0])&&Array.isArray(result[keys[0]]))
    return normalizeProcessExpressions({op:keys[0],args:result[keys[0]]},depth+1);
  if(keys.length===1&&Object.hasOwn(processOperations,keys[0])&&
      processOperations[keys[0] as keyof typeof processOperations][1]===1)
    return normalizeProcessExpressions({op:keys[0],args:[result[keys[0]]]},depth+1);
  if(['add','sub','mul','min','max'].includes(String(result.op))&&Array.isArray(result.args)&&result.args.length>2&&result.args.length<=128){
    return result.args.slice(1).reduce((left,right)=>({op:result.op,args:[left,right]}),result.args[0]);
  }
  if(result.op==='array'&&Array.isArray(result.args)&&result.args.some(arg=>Array.isArray(arg)||
      arg&&typeof arg==='object'&&['array','range','slice','indicesOf','concatArrays','utf8'].includes(String(arg.op)))){
    // The runtime has one-dimensional scalar arrays. Preserve all members
    // of array-producing operands as concatenation, never as nested rows.
    const arrays=result.args.map(arg=>Array.isArray(arg)||arg&&typeof arg==='object'&&
      ['array','range','slice','indicesOf','concatArrays','utf8'].includes(String(arg.op))?arg:{op:'array',args:[arg]});
    return arrays.length===1?arrays[0]:arrays.slice(1).reduce((left,right)=>({op:'concatArrays',args:[left,right]}),arrays[0]);
  }
  if (typeof result.op === 'string' && Array.isArray(result.args)) {
    result.args = result.args.map(arg => Array.isArray(arg) && arg.length <= 128 &&
      arg.some(item => item && typeof item === 'object' && !Array.isArray(item)) &&
      arg.every(item => item === null || typeof item !== 'object' || !Array.isArray(item) &&
        (typeof item.state === 'string' || typeof item.input === 'string' || typeof item.local === 'string' || typeof item.op === 'string' && Array.isArray(item.args)))
      ? normalizeProcessExpressions({op:'array',args:arg},depth + 1) : arg);
  }
  if (result.op === 'array' && Object.keys(result).length === 1)
    return {op:'array',args:[]};
  if (result.op === 'string' && Array.isArray(result.args) && result.args.length === 1)
    return {op: 'concat', args: ['', result.args[0]]};
  if (result.op === 'at' && Array.isArray(result.args) && result.args.length === 2) {
    const [source, index] = result.args as unknown[];
    if (source && typeof source === 'object' && !Array.isArray(source) &&
        index && typeof index === 'object' && !Array.isArray(index) &&
        (index as {op?: unknown}).op === 'range' &&
        JSON.stringify((index as {args?: unknown[]}).args) === JSON.stringify([
          0, {op: 'length', args: [source]},
        ])) return source;
  }
  if (['array','concatArrays'].includes(String(result.op)) && Array.isArray(result.args) &&
      result.args.length <= 128 && Object.keys(result).every(key=>key==='op'||key==='args') &&
      (result.op==='array' && result.args.length>16 || result.op==='concatArrays' && result.args.length>2)) {
    let groups: unknown[] = result.op==='array'
      ? Array.from({length:Math.ceil(result.args.length/16)},(_,index)=>({op:'array',args:(result.args as unknown[]).slice(index*16,index*16+16)}))
      : result.args.map(arg=>Array.isArray(arg) && arg.length<=16 && arg.some(item=>item && typeof item==='object')
        ? {op:'array',args:arg} : arg);
    while(groups.length>1) groups=Array.from({length:Math.ceil(groups.length/2)},(_,index)=>
      index*2+1<groups.length ? {op:'concatArrays',args:groups.slice(index*2,index*2+2)} : groups[index*2]);
    return groups[0];
  }
  if (result.op === 'concatArrays' && Array.isArray(result.args) && result.args.length === 2)
    result.args = result.args.map(arg => Array.isArray(arg) && arg.length <= 16 &&
      arg.some(item => item && typeof item === 'object' && !Array.isArray(item))
      ? {op:'array',args:arg} : arg);
  if (result.op === 'concat' && Array.isArray(result.args) && result.args.length > 12 && result.args.length <= 128) {
    // Concatenation is pure and associative, including null -> empty string.
    // Grouping preserves every operand and its order; size/depth gates still run.
    let args: unknown[] = result.args;
    while (args.length > 12) {
      const groups: unknown[] = [];
      for (let index = 0; index < args.length; index += 12) {
        const chunk = args.slice(index, index + 12);
        groups.push(chunk.length === 1 ? chunk[0] : {op: 'concat', args: chunk});
      }
      args = groups;
    }
    result.args = args;
  }
  return result;
}

/** An array literal in an action may contain a calculated expression, but
 * process-v1 literals permit scalar constants only. The array operator has
 * precisely the intended evaluation semantics and keeps the output length. */
export function normalizeDynamicActionArrayValues(value:unknown):unknown {
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const behavior=value as {actions?:Array<{locals?:Array<{value?:unknown}>;
    updates?:Array<{value?:unknown}>}>};
  if(!Array.isArray(behavior.actions))return value;
  let changed=false;
  const convert=(item:unknown):unknown=>{
    if(!Array.isArray(item)||item.length>16||!item.some(part=>
      part!==null&&typeof part==='object'&&!Array.isArray(part)))return item;
    changed=true;
    return {op:'array',args:item};
  };
  const actions=behavior.actions.map(action=>({
    ...action,
    ...(Array.isArray(action.locals)?{locals:action.locals.map(local=>({...local,value:convert(local.value)}))}:{}),
    ...(Array.isArray(action.updates)?{updates:action.updates.map(update=>({...update,value:convert(update.value)}))}:{}),
  }));
  return changed?{...behavior,actions}:value;
}

/** A model sometimes writes {local:"mid"} even though it defined only the
 * scene state `mid`. Rewrite that exact reference when no action local has
 * the name. References to declared but out-of-order locals remain invalid. */
export function normalizeUndeclaredStateLocals(
  initialState: Record<string, unknown> | undefined, value: unknown,
): unknown {
  if (!initialState || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const behavior = value as {actions?: Array<Record<string, unknown>>};
  if (!Array.isArray(behavior.actions)) return value;
  let changed = false;
  const actions = behavior.actions.map(action => {
    const declared = new Set((Array.isArray(action.locals) ? action.locals : [])
      .map(local => (local as {id?: unknown})?.id).filter((id): id is string => typeof id === 'string'));
    const rewrite = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(rewrite);
      if (!node || typeof node !== 'object') return node;
      const expression = node as Record<string, unknown>;
      if(Object.keys(expression).length===1&&typeof expression.op==='string'&&
          !Object.hasOwn(processOperations,expression.op)){
        if(declared.has(expression.op)){changed=true;return {local:expression.op};}
        if(Object.hasOwn(initialState,expression.op)){changed=true;return {state:expression.op};}
      }
      if (Object.keys(expression).length === 1 && typeof expression.local === 'string' &&
          !declared.has(expression.local) && Object.hasOwn(initialState,expression.local)) {
        changed = true;
        return {state:expression.local};
      }
      return Object.fromEntries(Object.entries(expression).map(([key,part]) => [key,rewrite(part)]));
    };
    return {
      ...action,
      enabledWhen:rewrite(action.enabledWhen),
      ...(action.repeatWhile === undefined ? {} : {repeatWhile:rewrite(action.repeatWhile)}),
      ...(Array.isArray(action.locals) ? {locals:action.locals.map(local => {
        const item = local as {id?: unknown; value?: unknown};
        return {...item,value:rewrite(item.value)};
      })} : {}),
      feedback:rewrite(action.feedback),
      updates:Array.isArray(action.updates) ? action.updates.map(update => {
        const item = update as {value?: unknown; index?: unknown};
        return {...item,value:rewrite(item.value),
          ...(item.index === undefined ? {} : {index:rewrite(item.index)})};
      }) : action.updates,
    };
  });
  return changed ? {...behavior,actions} : value;
}

/** Local expressions are pure. A generated action may declare a dependency
 * after its first use; order only the existing declarations when their graph
 * is complete and acyclic. Unknown names, duplicate IDs and cycles still fail
 * the normal scene validator instead of being guessed into a valid action. */
export function normalizeProcessActionLocalOrder(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const behavior = value as {actions?: Array<Record<string, unknown>>};
  if (!Array.isArray(behavior.actions)) return value;
  let changed = false;
  const actions = behavior.actions.map(action => {
    const locals = action.locals;
    if (!Array.isArray(locals) || locals.length < 2 || locals.length > 24) return action;
    const declarations = locals as Array<{id?: unknown; value?: unknown}>;
    const ids = declarations.map(local => local?.id);
    if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) return action;
    const byId = new Map(ids.map((id, index) => [id as string, index]));
    const dependencies = declarations.map(local => {
      const found = new Set<string>();
      const walk = (node: unknown, depth: number): void => {
        if (depth > 32 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(part => walk(part, depth + 1)); return; }
        const expression = node as Record<string, unknown>;
        if (typeof expression.local === 'string') found.add(expression.local);
        Object.values(expression).forEach(part => walk(part, depth + 1));
      };
      walk(local.value, 0);
      return found;
    });
    if (dependencies.some(found => [...found].some(id => !byId.has(id)))) return action;
    const state = new Array<number>(locals.length).fill(0), order: number[] = [];
    let cyclic = false;
    const visit = (index: number): void => {
      if (state[index] === 2 || cyclic) return;
      if (state[index] === 1) { cyclic = true; return; }
      state[index] = 1;
      for (const id of dependencies[index]) visit(byId.get(id)!);
      state[index] = 2;
      order.push(index);
    };
    for (let index = 0; index < locals.length; index++) visit(index);
    if (cyclic || order.every((index, position) => index === position)) return action;
    changed = true;
    return {...action, locals:order.map(index => locals[index])};
  });
  return changed ? {...behavior, actions} : value;
}

/** A repeatable action may set its phase to a named in-progress value after
 * one step, while its enabledWhen still names only the initial ready phase.
 * Admit the phase this same action explicitly writes on its continuing branch;
 * preserve all other guards (finished flag, bounds, permissions). */
export function normalizeActionContinuationPhase(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const behavior = value as {actions?: Array<Record<string, unknown>>};
  if (!Array.isArray(behavior.actions)) return value;
  let changed = false;
  const actions = behavior.actions.map(action => {
    if (!action.repeatWhile || !Array.isArray(action.updates)) return action;
    const updates = action.updates as Array<{target?: unknown; value?: unknown}>;
    const continuing = updates.flatMap(update => {
      const expression = update.value as {op?: unknown; args?: unknown[]} | undefined;
      return typeof update.target === 'string' && expression?.op === 'if' &&
        Array.isArray(expression.args) && expression.args.length === 3 &&
        typeof expression.args[2] === 'string'
        ? [{state: update.target, phase: expression.args[2]}] : [];
    });
    const widen = (predicate: unknown): unknown => {
      if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) return predicate;
      const expr = predicate as {op?: unknown; args?: unknown[]};
      if (expr.op !== 'eq' || !Array.isArray(expr.args) || expr.args.length !== 2) return predicate;
      const [left,right] = expr.args;
      const state = (left as {state?: unknown})?.state;
      const next = continuing.find(item => item.state === state &&
        typeof right === 'string' && right !== item.phase);
      if (!next) return predicate;
      changed = true;
      return {op:'or',args:[predicate,{op:'eq',args:[{state:next.state},next.phase]}]};
    };
    const enabled = action.enabledWhen as {op?: unknown;args?: unknown[]} | undefined;
    if (enabled?.op === 'and' && Array.isArray(enabled.args)) {
      const args = enabled.args.map(widen);
      return changed ? {...action, enabledWhen:{...enabled,args}} : action;
    }
    const expanded = widen(action.enabledWhen);
    return expanded === action.enabledWhen ? action : {...action,enabledWhen:expanded};
  });
  return changed ? {...behavior,actions} : value;
}

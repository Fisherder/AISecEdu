/** A presentation view may point at a fixed label list with an index that
 * legitimately reaches the list length at completion. Show completion text
 * instead of crashing the entire scene when rendering that terminal frame. */
export function normalizeStaticIndexViews(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as {views?: Array<{kind?: unknown; value?: unknown}>};
  if (!Array.isArray(source.views)) return value;
  const revised = structuredClone(source);
  for (const view of revised.views ?? []) {
    if (!['value', 'text'].includes(String(view.kind))) continue;
    const expression = view.value as {op?: unknown; args?: unknown[]} | undefined;
    if (expression?.op !== 'at' || !Array.isArray(expression.args) || expression.args.length !== 2) continue;
    const [items, index] = expression.args;
    if (!Array.isArray(items) || !items.length ||
        !items.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item)) ||
        !index || typeof index !== 'object' || Array.isArray(index) ||
        !('state' in index || 'input' in index)) continue;
    view.value = {op: 'if', args: [
      {op: 'and', args: [
        {op: 'gte', args: [index, 0]},
        {op: 'lt', args: [index, items.length]},
      ]}, expression, '已完成',
    ]};
  }
  return revised;
}

/** A fixed rule table can be populated by a preparation action instead of
 * existing in initialState. Guard its authored rows until that same action
 * atomically writes every table column and a unique loaded flag. The full
 * table remains visible after preparation; domain actions are unchanged. */
export function guardDeferredFixedTableViews(
  state: {initialState?: Record<string, unknown>; actions?: Array<{
    updates?: Array<{target?: string; value?: unknown}>;
  }>}, value: unknown,
): unknown {
  if (!state.initialState || !Array.isArray(state.actions) || !value ||
      typeof value !== 'object' || Array.isArray(value)) return value;
  const source=value as {views?: Array<{kind?: unknown; value?: unknown}>};
  if (!Array.isArray(source.views)) return value;
  const revised=structuredClone(source);
  let changed=false;
  for (const view of revised.views ?? []) {
    const expression=view.value as {op?: unknown; args?: unknown[]} | undefined;
    if (view.kind!=='array' || expression?.op!=='array' ||
        !Array.isArray(expression.args) || expression.args.length<2 || expression.args.length>16) continue;
    const reads=new Map<string,number>();
    const visit=(item:unknown):boolean=>{
      if(item===null||typeof item!=='object')return true;
      if(Array.isArray(item))return item.every(visit);
      const node=item as {op?:unknown;args?:unknown[];state?:unknown};
      if(node.op==='at'){
        if(!Array.isArray(node.args)||node.args.length!==2||
            !node.args[0]||typeof node.args[0]!=='object'||Array.isArray(node.args[0])||
            typeof (node.args[0] as {state?:unknown}).state!=='string'||
            Object.keys(node.args[0]).length!==1||
            !Number.isInteger(node.args[1])||Number(node.args[1])<0)return false;
        const id=(node.args[0] as {state:string}).state;
        reads.set(id,Math.max(reads.get(id)??-1,Number(node.args[1])));
        return true;
      }
      return Object.values(item).every(visit);
    };
    if(!visit(expression)||!reads.size||
        [...reads].some(([id])=>!Array.isArray(state.initialState![id])||
          (state.initialState![id] as unknown[]).length!==0))continue;
    const loader=state.actions.find(action=>[...reads].every(([id,maxIndex])=>
      action.updates?.some(update=>update.target===id&&Array.isArray(update.value)&&
        update.value.length>maxIndex&&update.value.every(cell=>
          cell===null||['string','number','boolean'].includes(typeof cell)))));
    if(!loader||[...reads.keys()].some(id=>state.actions!.some(action=>action!==loader&&
      action.updates?.some(update=>update.target===id))))continue;
    const flags=Object.entries(state.initialState).filter(([id,initial])=>initial===false&&
      loader.updates?.some(update=>update.target===id&&update.value===true)&&
      !state.actions!.some(action=>action!==loader&&action.updates?.some(update=>update.target===id)));
    if(flags.length!==1)continue;
    view.value={op:'if',args:[{state:flags[0][0]},expression,[]]};
    changed=true;
  }
  return changed?revised:value;
}

/** An authored array of scalar labels is still data; a text/code view needs
 * one string. Join literal or state-driven array elements without changing
 * their values or spending another model call. */
export function normalizeLiteralArrayTextViews(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as {views?: Array<{kind?: unknown; value?: unknown}>};
  if (!Array.isArray(source.views)) return value;
  const revised = structuredClone(source);
  const formattedText = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(formattedText);
    if (!node || typeof node !== 'object') return node;
    const expression = Object.fromEntries(Object.entries(node).map(([key, child]) =>
      [key, formattedText(child)]));
    const args = expression.args as unknown[] | undefined;
    // hexBytes already formats every byte as one string. An extra join
    // cannot accept that string; keeping its operand preserves all bytes.
    if (expression.op === 'join' && Array.isArray(args) && args.length >= 1 && args.length <= 2 &&
        (args.length === 1 || typeof args[1] === 'string') &&
        args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) &&
        (args[0] as {op?: unknown}).op === 'hexBytes') return args[0];
    return expression;
  };
  for (const view of revised.views ?? []) {
    const formatted=view.value as {op?:unknown}|undefined;
    if((view as {format?:unknown}).format==='hex'&&formatted?.op==='hex')
      (view as {format?:unknown}).format='plain';
    if (!['text', 'code'].includes(String(view.kind))) continue;
    view.value = formattedText(view.value);
    if (Array.isArray(view.value) && view.value.every(row =>
      row === null || ['string', 'number', 'boolean'].includes(typeof row))) {
      const joined = view.value.map(row => String(row ?? '')).join('\n');
      view.value = joined.length <= 4000 ? joined : {op: 'join', args: [view.value, '\n']};
      continue;
    }
    const expression = view.value as {op?: unknown; args?: unknown[]} | undefined;
    if (expression?.op !== 'array' || !Array.isArray(expression.args) ||
        !expression.args.length || expression.args.length > 16) continue;
    view.value = {op: 'join', args: [expression, '\n']};
  }
  return revised;
}
/** A single highlighted rule is still represented as an array of indexes.
 * Keep the model's visibility condition and guard the final one-past-end
 * cursor, without changing the rule table or any domain action. */
export function normalizeSingleCellMarkers(scene: any): void {
  if (!Array.isArray(scene?.views) || !scene.initialState) return;
  for (const view of scene.views) {
    const marker=view?.markedIndices;
    const list=view?.value;
    if (view?.kind!=='array' || list?.op!=='array' || !Array.isArray(list.args) ||
        list.args.length<1 || list.args.length>128 || marker?.op!=='if' ||
        !Array.isArray(marker.args) || marker.args.length!==3 ||
        !Array.isArray(marker.args[2]) || marker.args[2].length!==0) continue;
    const index=marker.args[1];
    if (!index || typeof index!=='object' || Array.isArray(index) ||
        typeof index.state!=='string' || Object.keys(index).length!==1 ||
        !Number.isInteger(scene.initialState[index.state])) continue;
    const active=view.activeIndex;
    const sameIndex=(value:unknown)=>JSON.stringify(value)===JSON.stringify(index);
    const duplicateActive=sameIndex(active) ||
      (active?.op==='if' && Array.isArray(active.args) && active.args.length===3 &&
        ((sameIndex(active.args[1]) && active.args[2]===-1) ||
         (active.args[1]===-1 && sameIndex(active.args[2]))));
    if (duplicateActive) {
      delete view.markedIndices;
      if (Array.isArray(scene.stages) && scene.views.some((other:any)=>
          other!==view && JSON.stringify(other.value).includes('"state":"skippedRuleIds"')))
        for (const stage of scene.stages) if (typeof stage?.explanation==='string')
          stage.explanation=stage.explanation.replace(
            '标记深青绿色的格是已经处理过的位置。',
            '已跳过的规则显示在列表中。');
      continue;
    }
    let visible=marker.args[0];
    if (visible && typeof visible==='object' && !Array.isArray(visible) &&
        typeof visible.state==='string' && Object.keys(visible).length===1 &&
        [0,1].includes(scene.initialState[visible.state])) {
      const writes=(scene.actions??[]).flatMap((action:any)=>
        (action?.updates??[]).filter((update:any)=>update.target===visible.state));
      if (!writes.every((update:any)=>[0,1].includes(update.value))) continue;
      visible={op:'eq',args:[visible,1]};
    }
    if (typeof scene.initialState.terminated==='boolean')
      visible={op:'and',args:[visible,{op:'not',args:[{state:'terminated'}]}]};
    const inRange={op:'and',args:[
      {op:'gte',args:[index,0]},
      {op:'lt',args:[index,list.args.length]},
    ]};
    view.markedIndices={op:'if',args:[
      visible,
      {op:'if',args:[inRange,{op:'array',args:[index]},[]]},
      [],
    ]};
  }
}

/** Literal region ends are inclusive, unlike expression ends. A generated
 * fixed-size array often uses its length as the last literal index. Correct
 * only that one-past-end value after proving every array write keeps its size. */
export function normalizeOnePastEndLiteralRegions(
  state: {initialState?: Record<string, unknown>; actions?: Array<{
    locals?: Array<{id:string;value:unknown}>; updates?: Array<{target:string;value:unknown}>;
  }>}, value: unknown,
): unknown {
  if (!state?.initialState || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as {views?: Array<{kind?: unknown; value?: unknown;
    regions?: Array<{start?: unknown;end?: unknown}>}>};
  if (!Array.isArray(source.views)) return value;
  const lengthOf = (expression: unknown, locals: Map<string, unknown>, id: string, length: number): number | undefined => {
    if (Array.isArray(expression)) return expression.length;
    if (!expression || typeof expression !== 'object') return undefined;
    const expr = expression as {op?: unknown;args?: unknown[];local?: unknown;state?: unknown};
    if (expr.op === 'array' && Array.isArray(expr.args)) return expr.args.length;
    if (expr.state === id) return length;
    if (typeof expr.local === 'string') return lengthOf(locals.get(expr.local),new Map(),id,length);
    return undefined;
  };
  let changed = false;
  const copy = structuredClone(source);
  for (const view of copy.views ?? []) {
    const id = (view.value as {state?: unknown})?.state;
    const array = typeof id === 'string' ? state.initialState[id] : undefined;
    if (typeof id !== 'string' || !['array','bars'].includes(String(view.kind)) || !Array.isArray(array) || array.length < 2 ||
        !Array.isArray(view.regions)) continue;
    const fixed = (state.actions ?? []).every(action => {
      const locals = new Map((action.locals ?? []).map(local => [local.id,local.value]));
      return (action.updates ?? []).filter(update => update.target === id)
        .every(update => lengthOf(update.value,locals,id,array.length) === array.length);
    });
    if (!fixed) continue;
    for (const region of view.regions) if (region.end === array.length) {
      region.end = array.length - 1;
      changed = true;
    }
  }
  return changed ? copy : value;
}

/** A text history cannot be used as numeric cell indexes. Keep its own text
 * view and remove only the invalid highlighting expression. */
export function dropTextHistoryMarkers(scene: any): void {
  if (!Array.isArray(scene?.views) || !Array.isArray(scene?.actions)) return;
  for (const view of scene.views) {
    const markerId = view?.markedIndices?.state, dataId = view?.value?.state;
    if (view?.kind !== 'array' || typeof markerId !== 'string' ||
        typeof dataId !== 'string' || markerId === dataId ||
        !Array.isArray(scene.initialState?.[markerId]) || scene.initialState[markerId].length ||
        !Array.isArray(scene.initialState?.[dataId]) ||
        !scene.views.some((other: any) => other !== view &&
          ['text','code'].includes(other?.kind) &&
          JSON.stringify(other.value).includes(`"state":"${markerId}"`))) continue;
    const writes = scene.actions.flatMap((action: any) =>
      Array.isArray(action?.updates) ? action.updates.filter((update: any) => update.target === markerId) : []);
    const textAppend = (value: any) => value?.op === 'append' && Array.isArray(value.args) &&
      value.args.length === 2 &&
      (typeof value.args[1] === 'string' || value.args[1]?.op === 'concat');
    if (!writes.some((update: any) => textAppend(update.value)) ||
        !writes.every((update: any) => textAppend(update.value) ||
          Array.isArray(update.value) && update.value.length === 0 ||
          update.value?.op === 'array' && update.value.args?.length === 0)) continue;
    delete view.markedIndices;
  }
}

/** A shrinking search window becomes empty when its dynamic bounds cross or
 * its start becomes a negative terminal sentinel. The player already omits
 * both invalid highlights; encode them as [0,0) so validation can reach the
 * domain assertions rather than repeatedly asking the model to fix a view. */
export function guardCrossedDynamicRegions(scene: any): void {
  if (!Array.isArray(scene?.views)) return;
  for (const view of scene.views) if (Array.isArray(view?.regions))
    for (const region of view.regions) {
      if (!region || region.start === undefined || region.end === undefined) continue;
      if (typeof region.start === 'number' &&
          region.end && typeof region.end === 'object') {
        const guardedEnd = region.end;
        if (guardedEnd.op === 'if' && guardedEnd.args?.[2] === region.start &&
            JSON.stringify(guardedEnd.args?.[0]) === JSON.stringify({op:'gt',args:[guardedEnd.args?.[1],region.start]}))
          continue;
        region.end = {op:'if',args:[
          {op:'gt',args:[structuredClone(guardedEnd),region.start]},guardedEnd,region.start,
        ]};
        continue;
      }
      if (typeof region.start !== 'object' || typeof region.end !== 'object') continue;
      let start = region.start, end = region.end;
      if (start.op === 'if' && end.op === 'if' &&
          JSON.stringify(start.args?.[0]) === JSON.stringify(end.args?.[0]) &&
          start.args?.[2] === 0 && end.args?.[2] === 0) {
        if (start.args?.[0]?.op === 'and' &&
            JSON.stringify(start.args[0].args?.[1]) ===
              JSON.stringify({op:'gte',args:[start.args[1],0]})) continue;
        // Upgrade a saved scene wrapped by the older crossed-bounds guard.
        start = start.args[1];
        end = end.args[1];
      }
      const inside = {op:'and',args:[
        {op:'lt',args:[structuredClone(start),structuredClone(end)]},
        {op:'gte',args:[structuredClone(start),0]},
      ]};
      region.start = {op:'if',args:[inside,start,0]};
      region.end = {op:'if',args:[inside,end,0]};
    }
}

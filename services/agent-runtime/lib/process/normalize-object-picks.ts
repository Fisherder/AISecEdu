import { createProcessEngine } from '@/lib/server/process-quality';
import type { ProcessScene, ProcessExpression } from './schema';
import {isObjectSelectionInput} from './capabilities';

/** Connect an already authored selection to its existing object view. This
 * repairs a missing renderer binding, never invents a new domain operation.
 * Ambiguous controls, views or actions are left for the author to resolve. */
export function normalizeObjectPicks(scene: ProcessScene): string[] {
  if (!scene.decisions?.length || scene.views.some(view => view.pick && ['array','bars','topology'].includes(view.kind))) return [];
  const containsInput = (value: unknown, input: string): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(item => containsInput(item, input));
    if ('input' in value && value.input === input) return true;
    return Object.values(value).some(item => containsInput(item, input));
  };
  const selections = scene.inputs.filter(isObjectSelectionInput);
  const choiceIds = new Set(scene.decisions.flatMap(decision => decision.choices));
  const candidates: Array<{view: ProcessScene['views'][number]; input: string; action?: string}> = [];
  for (const input of selections) {
    const values = input.type === 'select' ? input.options!.map(option => option.value)
      : Array.from({length: Number(input.max) + 1}, (_, index) => index);
    if (values.length < 2 || values.length > 128) continue;
    for (const view of scene.views) {
      if (!['array', 'bars', 'topology'].includes(view.kind) || !view.activeIndex) continue;
      const index = view.activeIndex as ProcessExpression;
      if(index&&typeof index==='object'&&!Array.isArray(index)&&'input' in index&&index.input===input.id){
        try{
          const engine=createProcessEngine(scene);
          if(Array.isArray(engine.evaluate(view.value))&&(engine.evaluate(view.value) as unknown[]).length===values.length)
            candidates.push({view,input:input.id});
        }catch{}
        continue;
      }
      // The view must already track the selected domain object, not an
      // unrelated cursor or a forecast risk bar with the same item count.
      if (!index || typeof index !== 'object' || Array.isArray(index) || !('state' in index)) continue;
      const actions = scene.actions.filter(action => !choiceIds.has(action.id) &&
        action.updates.some(update => update.target === index.state) && containsInput(action, input.id));
      for (const action of actions) {
        let proven = true;
        for (let picked = 0; picked < values.length; picked++) {
          try {
            const engine = createProcessEngine(scene);
            engine.setInput(input.id, values[picked]);
            if (!engine.can(action.id)) { proven = false; break; }
            engine.act(action.id);
            const items = engine.evaluate(view.value);
            if (!Array.isArray(items) || items.length !== values.length || engine.evaluate(index) !== picked) {
              proven = false; break;
            }
          } catch { proven = false; break; }
        }
        if (proven) candidates.push({view, input: input.id, action: action.id});
      }
    }
  }
  if (!candidates.length && scene.views.length < 12) {
    // A unique named object selector already supplies the exact labels,
    // values and ordering. Render its existing options as selectable objects;
    // no new facts, formulas or domain operations are invented.
    const named=selections.filter(input=>input.type==='select'&&input.options?.every(option=>
      typeof option.label==='string'&&option.label.trim().length>1));
    if(named.length===1){
      const input=named[0],values=input.options!.map(option=>option.value),id='objects-'+input.id.slice(0,40);
      if(new Set(values.map(value=>JSON.stringify(value))).size===values.length&&!scene.views.some(view=>view.id===id)){
        scene.views.unshift({id,title:input.label,kind:'array',value:input.options!.map(option=>option.label),
          activeIndex:{op:'at',args:[{op:'indicesOf',args:[values,{input:input.id}]},0]},pick:{input:input.id},
          caption:'点击对象查看或选择目标，当前选择与实验条件同步；已有领域进展保留。'});
        return ['/views/@'+id];
      }
    }
    // An existing evidence detail may already select different facts with a
    // live index. Factor that same expression into object tiles, preserving
    // every state reference and the original detail. No new facts or choices
    // are authored and no result is frozen to default values.
    let details=selections.flatMap(input=>scene.views.filter(view=>
      ['value','text'].includes(view.kind)&&/evidence|证据/i.test(view.id+' '+view.title)&&containsInput(view.value,input.id))
      .map(view=>({input,view})));
    const richDetails=details.filter(item=>item.view.kind==='text');
    if(new Set(details.map(item=>item.input.id)).size===1&&richDetails.length===1)details=richDetails;
    if(details.length===1){
      const {input,view}=details[0];
      const values=input.type==='select'?input.options!.map(option=>option.value):Array.from({length:Number(input.max)+1},(_,i)=>i);
      if(values.length>=2&&values.length<=16){
        const substitute=(expr:ProcessExpression,value:unknown):ProcessExpression=>{
          if(!expr||typeof expr!=='object'||Array.isArray(expr))return expr;
          if('input' in expr&&expr.input===input.id)return value as ProcessExpression;
          if('op' in expr)return {...expr,args:expr.args.map(item=>substitute(item,value))};
          return expr;
        };
        const items=values.map(value=>substitute(view.value,value));
        try{
          const engine=createProcessEngine(scene);const evaluated=items.map(item=>engine.evaluate(item));
          if(evaluated.every(item=>typeof item==='string'&&item.length>4)&&new Set(evaluated).size===values.length){
            const id='objects-'+input.id.slice(0,40);
            if(!scene.views.some(view=>view.id===id)){
              const objects:ProcessScene['views'][number]={id,title:'选择证据对象',kind:'array',value:{op:'array',args:items},
                activeIndex:input.type==='select'?{op:'at',args:[{op:'indicesOf',args:[values,{input:input.id}]},0]}:{input:input.id},
                pick:{input:input.id},caption:'点击一条证据，查看对应事实；原有实验状态保留。'};
              scene.views.unshift(objects);
              return ['/views/@'+id];
            }
          }
        }catch{}
      }
    }
  }
  if (candidates.length !== 1) return [];
  const candidate = candidates[0];
  candidate.view.pick = {input: candidate.input,...(candidate.action?{action:candidate.action}:{})};
  return ['/views/@' + candidate.view.id + '/pick'];
}

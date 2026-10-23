import type { ProcessExpression, ProcessScene } from './schema';
import { createProcessEngine } from '../server/process-quality';

export function normalizeDecisionPresentation(scene: ProcessScene): void {
  if (!scene.decisions?.length) return;
  const any = (args: ProcessExpression[]): ProcessExpression => args.length === 1 ? args[0]
    : args.length <= 8 ? {op:'or',args} : {op:'or',args:[any(args.slice(0,8)),any(args.slice(8))]};
  for (const stage of scene.stages) {
    const decision = scene.decisions.find(item => JSON.stringify(item.when) === JSON.stringify(stage.when));
    if (decision) stage.when = {op:'and',args:[stage.when,any(decision.choices.map(id=>scene.actions.find(action=>action.id===id)!.enabledWhen))]};
  }
  const writes = new Set(scene.actions.flatMap(action=>action.updates.map(update=>update.target)));
  const dynamic = (expr:ProcessExpression):boolean => !!expr && typeof expr==='object' && !Array.isArray(expr) &&
    ('input' in expr || 'local' in expr || 'state' in expr && writes.has(expr.state) || 'args' in expr && expr.args.some(dynamic));
  const initialEngine=createProcessEngine(scene);
  const simplify=(expr:ProcessExpression):ProcessExpression=>{
    if(!dynamic(expr))try{const value=initialEngine.evaluate(expr);if(typeof value==='boolean')return value;}catch{}
    if(!expr||typeof expr!=='object'||Array.isArray(expr)||!('op' in expr))return expr;
    const args=expr.args.map(simplify);
    if(expr.op==='not'&&args[0]&&typeof args[0]==='object'&&!Array.isArray(args[0])&&'op' in args[0]&&args[0].op==='not')return args[0].args[0];
    if(['and','or'].includes(expr.op)){
      const decisive=expr.op==='or';if(args.includes(decisive))return decisive;
      const rest=args.filter(arg=>arg!==!decisive).filter((arg,index,all)=>all.findIndex(item=>JSON.stringify(item)===JSON.stringify(arg))===index);
      return rest.length===0?!decisive:rest.length===1?rest[0]:{op:expr.op,args:rest};
    }
    return {...expr,args};
  };
  for(const stage of scene.stages)stage.when=simplify(stage.when);
  // Two authored labels may both use an immutable "decide" flag. Use the
  // actual observed result changes to separate situation from consequence,
  // rather than repeatedly wrapping mutually negated constant predicates.
  if(scene.stages.length===2&&scene.stages.every(stage=>!dynamic(stage.when))&&
      (scene.stages.every(stage=>stage.when===true)||
        /decid|choose|决策|选择|情境/i.test(scene.stages[0].id+' '+scene.stages[0].title)&&
        /outcome|result|后果|结果|比较/i.test(scene.stages[1].id+' '+scene.stages[1].title))){
    const fields=[...new Set(scene.decisions.flatMap(decision=>decision.observe.map(item=>item.field)))].filter(field=>writes.has(field));
    if(fields.length){
      const changed=any(fields.map(field=>({op:'ne',args:[{state:field},scene.initialState[field]]})));
      scene.stages[0].when={op:'not',args:[changed]};scene.stages[1].when=changed;
    }
  }
  const size=(expr:ProcessExpression):number=>expr&&typeof expr==='object'&&!Array.isArray(expr)&&'args' in expr
    ?1+expr.args.reduce<number>((sum,item)=>sum+size(item),0):1;
  const original=scene.stages.map(stage=>stage.when);
  const conflicts=new Map<number,Set<number>>();
  const paths:string[][]=[[]];const seen=new Set<string>();let probes=0;
  while(paths.length&&probes++<48){
    const path=paths.shift()!;const probe=createProcessEngine(scene);
    try{for(const id of path)probe.act(id);}catch{continue;}
    const signature=JSON.stringify(probe.getState().state);if(seen.has(signature))continue;seen.add(signature);
    const matches=original.flatMap((condition,index)=>probe.evaluate(condition)===true?[index]:[]);
    for(const earlier of matches)for(const later of matches)if(earlier<later&&dynamic(original[earlier])&&size(original[earlier])<size(original[later])){
      if(!conflicts.has(earlier))conflicts.set(earlier,new Set());conflicts.get(earlier)!.add(later);
    }
    if(path.length<5)for(const action of scene.actions)if(probe.can(action.id))paths.push([...path,action.id]);
  }
  for(const [index,later] of conflicts)scene.stages[index].when={op:'and',args:[original[index],{op:'not',args:[any([...later].map(id=>original[id]))]}]};
  const engine=createProcessEngine(scene);
  for(const stage of scene.stages){
    if(dynamic(stage.when)||engine.evaluate(stage.when)!==true)continue;
    const others=scene.stages.filter(item=>item!==stage).map(item=>item.when);
    if(others.length)stage.when=simplify({op:'and',args:[stage.when,{op:'not',args:[any(others)]}]});
  }
  for(const stage of scene.stages)stage.when=simplify(stage.when);
}

export function normalizeDecisionRecovery(value: unknown, request: Record<string,unknown>): unknown {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !/恢复|复原|recover|restore/i.test([request.originalRequest,request.description].join('\n')))return value;
  const source=value as Pick<ProcessScene,'actions'|'decisions'>;
  if(!source.decisions?.length||!Array.isArray(source.actions))return value;
  const result=structuredClone(source);
  for(const action of result.actions){
    if(!/recover|restore|恢复|复原/i.test(action.id+' '+action.label))continue;
    const clears=new Set(action.updates.filter(update=>update.value===false&&/terminal|done|finished|complete/i.test(update.target)).map(update=>update.target));
    const requestedRecovery=/恢复(?:设备|系统|业务|连接)|recover (?:devices|system)|restore (?:devices|service)/i.test([request.originalRequest,request.description].join('\n'));
    const guard=action.enabledWhen;
    if(!guard||typeof guard!=='object'||Array.isArray(guard)||!('op' in guard)||guard.op!=='and')continue;
    const args=guard.args.filter(condition=>{
      if(!condition||typeof condition!=='object'||Array.isArray(condition)||!('op' in condition)||condition.op!=='not')return true;
      const state=condition.args[0];
      return !state||typeof state!=='object'||Array.isArray(state)||!('state' in state)||
        !(clears.has(state.state)||requestedRecovery&&/terminal|done|finished|complete/i.test(state.state));
    });
    if(args.length&&args.length!==guard.args.length)action.enabledWhen=args.length===1?args[0]:{op:'and',args};
  }
  return result;
}

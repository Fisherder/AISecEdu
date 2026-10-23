import type {ProcessScene,ProcessExpression} from './schema';

/** Remove a redundant preselected-strategy guard only when declared decision
 * choices use distinct options of that same selector, and the selector has
 * no role in any choice's calculations or feedback. Domain guards remain. */
export function normalizeDecisionChoiceGuards(
  state:Pick<ProcessScene,'inputs'>,
  behavior:Pick<ProcessScene,'actions'|'decisions'>,
) {
  const result=structuredClone(behavior);
  for(const decision of result.decisions??[])for(const input of state.inputs){
    if(input.type!=='select'||!/strategy|choice|policy|策略|方案/i.test(input.id+' '+input.label))continue;
    const choices=decision.choices.map(id=>result.actions.find(action=>action.id===id)!);
    const selectorValues=new Set((input.options??[]).map(option=>JSON.stringify(option.value)));
    const conditionValue=(expr:ProcessExpression):string|undefined=>{
      if(!expr||typeof expr!=='object'||Array.isArray(expr)||!('op' in expr)||expr.op!=='eq'||expr.args.length!==2)return;
      for(const [left,right]of [[expr.args[0],expr.args[1]],[expr.args[1],expr.args[0]]])
        if(left&&typeof left==='object'&&!Array.isArray(left)&&'input' in left&&left.input===input.id&&selectorValues.has(JSON.stringify(right)))return JSON.stringify(right);
    };
    const matching=(expr:ProcessExpression):string[]=>{
      const match=conditionValue(expr);if(match)return [match];
      return expr&&typeof expr==='object'&&!Array.isArray(expr)&&'op' in expr&&expr.op==='and'?expr.args.flatMap(matching):[];
    };
    const guards=choices.map(action=>matching(action.enabledWhen));
    if(guards.some(values=>values.length!==1)||new Set(guards.flat()).size!==choices.length)continue;
    if(choices.some(({enabledWhen:_guard,...action})=>JSON.stringify(action).includes(JSON.stringify({input:input.id}))))continue;
    const strip=(expr:ProcessExpression):ProcessExpression=>{
      if(conditionValue(expr))return true;
      if(expr&&typeof expr==='object'&&!Array.isArray(expr)&&'op' in expr&&expr.op==='and'){
        const args=expr.args.map(strip).filter(item=>item!==true);
        return args.length===0?true:args.length===1?args[0]:{op:'and',args};
      }
      return expr;
    };
    for(const action of choices)action.enabledWhen=strip(action.enabledWhen);
  }
  return result;
}

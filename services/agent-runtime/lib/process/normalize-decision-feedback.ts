import {normalizeProcessExpressions} from './normalize';
import type {ProcessScene,ProcessExpression} from './schema';

/** Keep the author's explanation and add its declared observations as actual
 * post-action readings. This adds no state, coefficients or interpretation. */
export function normalizeDecisionFeedback(initialState:Record<string,unknown>,
  behavior:Pick<ProcessScene,'actions'|'decisions'>):Pick<ProcessScene,'actions'|'decisions'> {
  let changed=false;
  const actions=behavior.actions.map(action=>{
    if(typeof action.feedback!=='string')return action;
    const fields=(behavior.decisions??[]).filter(decision=>decision.choices.includes(action.id)).flatMap(decision=>decision.observe)
      .filter((field,index,all)=>all.findIndex(other=>other.field===field.field)===index&&Object.hasOwn(initialState,field.field));
    if(!fields.length)return action;
    const args:ProcessExpression[]=[action.feedback,'\n实际读数：'];
    for(const [index,field]of fields.entries())args.push(index?'；':'',field.label+' ',
      Array.isArray(initialState[field.field])?{op:'join',args:[{state:field.field},', ']}:{state:field.field});
    changed=true;
    return {...action,feedback:normalizeProcessExpressions({op:'concat',args}) as ProcessExpression};
  });
  return changed?{...behavior,actions}:behavior;
}

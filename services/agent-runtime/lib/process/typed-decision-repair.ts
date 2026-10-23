import {parseDecisionOutcomeSpec,compileDecisionOutcomeSpec,type DecisionOutcomeSpec} from './decision-outcome-spec';
import {nativeDecisionPresentation} from './native-decision-surface';
import {normalizeDecisionFeedback} from './normalize-decision-feedback';
import {parseProcessScene,type ProcessScene} from './schema';

/** Recompile a repaired domain specification without making the model edit
 * generated controls or deeply nested engine state. All original entities,
 * strategy IDs, parameters and their full allowed ranges remain present. */
export function compileTypedDecisionRepair(request:Record<string,unknown>,original:DecisionOutcomeSpec,
  replacement:unknown,previous:ProcessScene){
  const spec=parseDecisionOutcomeSpec(replacement);
  for(const group of ['parameters','objects','metrics','choices'] as const){
    const ids=original[group].map(item=>item.id),replacementIDs=spec[group].map(item=>item.id);
    if(ids.length!==replacementIDs.length||ids.some(id=>!replacementIDs.includes(id)))
      throw Error('Repair must preserve '+group+' IDs');
    // ID references define identity. A harmless returned order is canonicalized
    // to the existing UI/binding order; missing or additional entities fail.
    spec[group]=ids.map(id=>spec[group].find(item=>item.id===id)!) as any;
  }
  if(original.properties.some(prop=>!spec.properties.some(item=>item.id===prop.id)))throw Error('Repair cannot remove object facts');
  for(const [index,param]of original.parameters.entries())for(const key of ['default','min','max','step'] as const)
    if(param[key]!==spec.parameters[index][key])throw Error('Repair cannot narrow or change parameter '+param.id+'/'+key);
  const model=compileDecisionOutcomeSpec(spec),display=nativeDecisionPresentation(request,model,model);
  if(!display)throw Error('Typed repair requires the same native decision surface');
  const scene=parseProcessScene({schemaVersion:'process-v1',inputs:model.inputs,initialState:model.initialState,
    ...normalizeDecisionFeedback(model.initialState,{actions:model.actions,decisions:model.decisions}),...display});
  // Preserve the original presentation identity and stable view IDs. Facts,
  // explanations and formulas may change only through the reviewed source.
  if(scene.views.map(view=>view.id).join('|')!==previous.views.map(view=>view.id).join('|'))
    throw Error('Repair must preserve existing view IDs');
  scene.title=previous.title;scene.summary=previous.summary;
  const changedPaths:string[]=[];
  function changes(before:unknown,after:unknown,path:string){
    if(JSON.stringify(before)===JSON.stringify(after))return;
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&Array.isArray(before)===Array.isArray(after)){
      for(const key of new Set([...Object.keys(before),...Object.keys(after)]))
        changes((before as Record<string,unknown>)[key],(after as Record<string,unknown>)[key],path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));
    }else changedPaths.push(path);
  }
  changes(previous,scene,'');
  return {scene,changedPaths,sourceSpec:spec};
}

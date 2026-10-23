import { createProcessEngine, type validateProcessPackage } from '../server/process-quality';
import { isDeepStrictEqual } from 'node:util';
import {parseDecisionOutcomeSpec} from './decision-outcome-spec';
import {compileTypedDecisionRepair} from './typed-decision-repair';
import {normalizeDecisionPresentation} from './normalize-decision-presentation';

type Checked=ReturnType<typeof validateProcessPackage>;

/** A previous generic repair may have redirected compiler-owned object tiles
 * to an unrelated numeric condition. Restore only their two derived bindings
 * after proving that every other scene field still matches the typed source. */
export function restoreCompiledDecisionObjectBinding(request:Record<string,unknown>,source:unknown,scene:Checked['scene']){
  try{
    const spec=parseDecisionOutcomeSpec(source),expected=compileTypedDecisionRepair(request,spec,spec,scene).scene;
    normalizeDecisionPresentation(expected);
    const candidate=structuredClone(scene);normalizeDecisionPresentation(candidate);
    const actual=candidate.views.find(view=>view.id==='decision-objects'),derived=expected.views.find(view=>view.id==='decision-objects');
    if(!actual||!derived||isDeepStrictEqual([actual.pick,actual.activeIndex],[derived.pick,derived.activeIndex]))return;
    actual.pick=structuredClone(derived.pick);actual.activeIndex=structuredClone(derived.activeIndex);
    return isDeepStrictEqual(candidate,expected)?candidate:undefined;
  }catch{return;}
}

/** Review the author's domain formulas directly only when recompilation proves
 * that they describe the entire executed model and its generated presentation.
 * Edited or specialized scenes keep the existing full-scene review. */
export function typedDecisionEvidenceForReview(request:Record<string,unknown>,source:unknown,checked:Checked){
  try{
    const sourceSpec=parseDecisionOutcomeSpec(source);
    const expected=compileTypedDecisionRepair(request,sourceSpec,sourceSpec,checked.scene).scene;
    normalizeDecisionPresentation(expected);
    if(!isDeepStrictEqual(expected,checked.scene))return;
    const result=(state:Record<string,unknown>)=>Object.fromEntries(sourceSpec.metrics.map(metric=>[metric.id,state[metric.id]]));
    return {format:'compiled-decision-source-v1' as const,sourceSpec,
      compilationFacts:{exactExecutedScene:true,initialResults:'未执行；不作为预测结果',
        objectSelection:sourceSpec.objects.map((object,index)=>({inputValue:index,object:object.id})),
        bounds:'count/time下限0；percent范围0–100；metric.max额外限幅；公式明确floor/ceil才取整',
        objectFacts:'object.values是静态事实；实时变化必须引用input，默认工况的示例不是实时读数',
        feedback:'先原子提交全部结果，后读取新状态生成反馈',
        comparison:'内置同起点比较和撤销，条件变化后开始新试验；不调用模型'},
      learnerCopy:{title:checked.scene.title,summary:checked.scene.summary,
        views:checked.scene.views.map(view=>({id:view.id,title:view.title,caption:view.caption})),
        stages:checked.scene.stages.map(stage=>({id:stage.id,title:stage.title,explanation:stage.explanation}))},
      actualTests:checked.tests.map(test=>{
        const engine=createProcessEngine(checked.scene);engine.reset(test.inputs);
        const frames=[{action:'initial',results:result(engine.getState().state),feedback:engine.getState().feedback}];
        for(const operation of test.actions)for(let n=0;n<(operation.count==='untilDone'?256:operation.count);n++){
          if(operation.count==='untilDone'&&!engine.repeatable(operation.id))break;
          engine.act(operation.id);frames.push({action:operation.id,results:result(engine.getState().state),feedback:engine.getState().feedback});
        }
        return {name:test.name,inputs:test.inputs,frames};
      }),
      actualDecisions:checked.decisionEvidence.map(decision=>({id:decision.decision,inputs:decision.inputs,
        path:decision.path,distinctDomainResults:decision.distinctDomainResults,
        alternatives:decision.alternatives.map(alternative=>({action:alternative.action,results:result(alternative.state)}))}))};
  }catch{return;}
}
function changes(before: Record<string,unknown>,after:Record<string,unknown>) {
  return Object.fromEntries(Object.entries(after).filter(([key,value])=>JSON.stringify(before[key])!==JSON.stringify(value)));
}
export function processEvidenceForReview(checked:Checked) {
  const baselineState=checked.scene.initialState;
  const initialViews=Object.fromEntries(checked.evidence[0].frames[0].views.map(view=>[view.id,view.value]));
  const visibleValues=(engine:ReturnType<typeof createProcessEngine>)=>Object.fromEntries([...engine.views(),...(checked.scene.decisions??[]).flatMap(decision=>decision.observe.map(item=>({id:`decision-${decision.id}-${item.field}`,value:engine.getState().state[item.field]})))].map(view=>[view.id,view.value]));
  const tests=checked.tests.map(test=>{
    const engine=createProcessEngine(checked.scene);engine.reset(test.inputs);
    let state=engine.getState().state;
    let views=visibleValues(engine);
    const initialStateChanges=changes(baselineState,state),initialViewChanges=changes(initialViews,views);
    const steps:Array<{action:string;stage:string;stateChanges:Record<string,unknown>;viewChanges:Record<string,unknown>;feedback:string}>=[];
    for(const operation of test.actions)for(let n=0;n<(operation.count==='untilDone'?256:operation.count);n++){
      if(operation.count==='untilDone'&&!engine.repeatable(operation.id))break;
      engine.act(operation.id);
      const next=engine.getState().state,nextViews=visibleValues(engine);
      steps.push({action:operation.id,stage:checked.scene.stages.find(stage=>engine.evaluate(stage.when)===true)!.id,
        stateChanges:changes(state,next),viewChanges:changes(views,nextViews),feedback:engine.getState().feedback});
      state=next;views=nextViews;
    }
    return {name:test.name,inputs:test.inputs,initialStateChanges,initialViewChanges,steps,checks:test.expect};
  });
  const decisions=checked.decisionEvidence.map(decision=>({...decision,
    before:undefined,beforeChanges:changes(baselineState,decision.before),
    alternatives:decision.alternatives.map(alternative=>({...alternative,state:undefined,views:undefined,
      stateChanges:changes(decision.before,alternative.state),viewChanges:changes(initialViews,Object.fromEntries(alternative.views.map(view=>[view.id,view.value])))}))}));
  return {format:'lossless-process-trace-v1' as const,
    reconstruction:'从baselineState与initialViews开始，逐项合并initial变化及每步变化即可还原完整实际轨迹；未列字段保持不变。不是裁剪，所有变化、公式结果、反馈与选择均保留。',
    baselineState,initialViews,tests,decisions};
}

import { createProcessEngine } from '../server/process-quality';
import { parseProcessScene, type ProcessScene, type ProcessExpression } from './schema';

export function buildDecisionRuntimeTests(raw: ProcessScene) {
  const scene=parseProcessScene(raw);
  if(!scene.decisions?.length)throw Error('领域分支运行检查需要决策合同');
  const defaults=Object.fromEntries(scene.inputs.map(input=>[input.id,input.default]));
  const samples=[defaults];
  for(const input of scene.inputs){
    const values=input.type==='select'?input.options!.map(option=>option.value):input.type==='toggle'?[false,true]:
      ['range','number'].includes(input.type)?[input.min!,input.max!]:[];
    for(const value of values)if(value!==input.default&&samples.length<12)samples.push({...defaults,[input.id]:value});
  }
  const candidates:Array<{inputs:typeof defaults;path:string[];state:Record<string,unknown>;coverage:Set<string>}>=[];
  for(const inputs of samples){
    const queue:Array<{path:string[];coverage:Set<string>}>=[{path:[],coverage:new Set()}];
    const seen=new Set<string>();let explored=0;
    while(queue.length&&explored++<96){
      const current=queue.shift()!;const engine=createProcessEngine(scene);engine.reset(inputs);
      for(const id of current.path)engine.act(id);
      const state=engine.getState().state;
      const key=JSON.stringify(state);if(seen.has(key))continue;seen.add(key);
      for(const stage of scene.stages)if(engine.evaluate(stage.when)===true)current.coverage.add('stage:'+stage.id);
      if(current.path.length&&key!==JSON.stringify(scene.initialState))candidates.push({inputs,path:current.path,state,coverage:current.coverage});
      if(current.path.length>=8)continue;
      for(const action of scene.actions){
        if(!engine.can(action.id))continue;
        const coverage=new Set(current.coverage);
        for(const decision of scene.decisions)if(decision.choices.includes(action.id))coverage.add('choice:'+decision.id+':'+action.id);
        queue.push({path:[...current.path,action.id],coverage});
      }
    }
  }
  const selected:typeof candidates=[];const covered=new Set<string>();
  while(candidates.length&&selected.length<8){
    const score=(candidate:typeof candidates[number])=>[...candidate.coverage].filter(item=>!covered.has(item)).length*10+
      (selected.some(item=>JSON.stringify(item.inputs)===JSON.stringify(candidate.inputs))?0:2)+Math.min(candidate.path.length,8)/10;
    candidates.sort((a,b)=>score(b)-score(a));const next=candidates.shift()!;
    if(selected.length>=3&&score(next)<1)break;
    if(selected.some(item=>JSON.stringify([item.inputs,item.state])===JSON.stringify([next.inputs,next.state])))continue;
    selected.push(next);next.coverage.forEach(item=>covered.add(item));
  }
  const preferred=new Set(scene.decisions.flatMap(decision=>decision.observe.map(item=>item.field)));
  const tests=selected.map((candidate,index)=>{
    const fields=Object.keys(candidate.state).filter(id=>typeof candidate.state[id]!=='string'||/phase|stage|strategy|chosenAction/i.test(id));
    fields.sort((a,b)=>Number(preferred.has(b))-Number(preferred.has(a)));
    return {name:`领域分支运行检查 ${index+1}：${candidate.path.join(' → ')}`,inputs:candidate.inputs,
      actions:candidate.path.map(id=>({id,count:1})),
      expect:fields.slice(0,12).map(id=>({value:{state:id} as ProcessExpression,equals:candidate.state[id]}))};
  });
  if(tests.length<3)throw Error('领域模型不足以形成三个不同的可执行后果路径');
  return {tests,source:'deterministic-branch-exploration-v1' as const};
}

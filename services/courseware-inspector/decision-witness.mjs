/** Find the actual decision state, not merely the first action with a shared
 * choice ID. A lesson may offer the same action at several decision points. */
export async function findDecisionWitness(frame,scene,tests,decisionId,bindings=[]) {
  return frame.evaluate(({scene,tests,decisionId,bindings})=>{
    for(const test of tests){
      const engine=globalThis.AISecProcessEngine(scene);engine.reset(test.inputs);
      const path=[];
      const isWitness=()=>engine.decisionState().pending.some(item=>{
        if(item.id!==decisionId||item.available.length<2)return false;
        const values=item.available.map(action=>{
          const branch=globalThis.AISecProcessEngine(scene);branch.reset(test.inputs);
          for(const id of path)branch.act(id);branch.act(action);
          return {domain:Object.fromEntries(item.observe.map(observe=>[observe.field,branch.getState().state[observe.field]])),
            visual:bindings.map(binding=>globalThis.AISecCinematicDomainBindingValue
              ?globalThis.AISecCinematicDomainBindingValue(binding.property,branch.evaluate(binding.value)):branch.evaluate(binding.value))};
        });
        const meaningful=value=>Object.fromEntries(Object.entries(value).filter(([,value])=>typeof value!=='string'&&value!==null));
        const numeric=values.some(value=>Object.keys(meaningful(value.domain)).length);
        return new Set(values.map(value=>JSON.stringify(numeric?meaningful(value.domain):value.domain))).size>=2&&
          (!bindings.length||new Set(values.map(value=>JSON.stringify(value.visual))).size>=2);
      });
      if(isWitness())return {inputs:test.inputs,path};
      for(const operation of test.actions){
        for(let count=0;count<(operation.count==='untilDone'?256:operation.count);count++){
          if(operation.count==='untilDone'&&!engine.repeatable(operation.id))break;
          engine.act(operation.id);path.push(operation.id);
          if(isWitness())return {inputs:test.inputs,path};
        }
      }
    }
    return null;
  },{scene,tests,decisionId,bindings});
}

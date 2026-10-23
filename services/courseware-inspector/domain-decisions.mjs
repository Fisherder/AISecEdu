import { createHash } from 'node:crypto';
import {findDecisionWitness} from './decision-witness.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');

// A completed browser operation can prove that a candidate is wrong. Keep
// that negative evidence available for local repair instead of retrying it as
// a broken browser connection.
export class CinematicDomainProofError extends Error {
  constructor(message, evidence, nodes) {
    super(message);
    this.name = 'CinematicDomainProofError';
    this.evidence = evidence;
    this.issue = {code:'domain-decision-consequence',message,nodes};
  }
}

async function captureDomainCanvas(frame) {
  const page=typeof frame.page==='function'?frame.page():frame;
  const canvas=frame.locator('#cinematic-canvas');
  // DOM scrolling avoids locator stability waits on a software-WebGL surface.
  // The compositor still supplies the actual pixels; no scene render is faked.
  await canvas.evaluate(node=>node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const bounds=await canvas.boundingBox(),viewport=page.viewportSize();
  if(!bounds||!viewport||bounds.width<=0||bounds.height<=0||bounds.x<0||bounds.y<0||
      bounds.x+bounds.width>viewport.width+1||bounds.y+bounds.height>viewport.height+1)
    throw Error('Domain canvas is outside the actual screenshot viewport');
  const png=await page.screenshot({clip:bounds,timeout:30000});
  const after=await canvas.boundingBox();
  if(!after||['x','y','width','height'].some(key=>Math.abs(after[key]-bounds[key])>.5))
    throw Error('Domain canvas moved during capture; decision evidence must be recaptured');
  return png;
}

export async function inspectCinematicDomainDecisions(frame,scene,settle) {
  if(!scene.lab)return [];
  await frame.locator('#cinema-mode-experiment').click();
  const evidence=[];
  const fail = message => {throw new CinematicDomainProofError(message,evidence,[...new Set(scene.lab.bindings.map(binding=>binding.node))]);};
  for(const decision of scene.lab.model.scene.decisions){
    const test=await findDecisionWitness(frame,scene.lab.model.scene,scene.lab.model.tests,decision.id,scene.lab.bindings);
    if(!test)fail('三维浏览器测试没有覆盖领域决策：'+decision.id);
    await frame.locator('#domain-lab-reset').click();
    for(const [id,value] of Object.entries(test.inputs)){
      const input=scene.lab.model.scene.inputs.find(input=>input.id===id);
      await frame.locator('#input-'+id).evaluate((field,{input,value})=>{
        if(input.type==='toggle')field.checked=value;
        else field.value=input.type==='select'?String(input.options.findIndex(option=>JSON.stringify(option.value)===JSON.stringify(value))):String(value);
        field.dispatchEvent(new Event('input',{bubbles:true}));
      },{input,value});
    }
    for(const action of test.path)await frame.locator('#action-'+action).click();
    const before=await frame.evaluate(()=>globalThis.__cinematicLab.getState());
    const pending=await frame.evaluate(()=>globalThis.__cinematicLab.decisions().pending);
    if(pending.length!==1||pending[0].id!==decision.id||pending[0].available.length<2)fail('三维界面没有同时可选的领域策略：'+decision.id);
    const alternatives=[];
    const observationTime=scene.lab.bindings.some(binding=>binding.property==='rotationSpeedY')?.5:0;
    await frame.evaluate(()=>globalThis.__cinematic.seek(0));await settle();
    for(const action of pending[0].available){
      await frame.locator('#action-'+action).click();await settle();
      let motion;
      if(observationTime){
        await frame.evaluate(at=>globalThis.__cinematic.seek(at),observationTime/2);await settle();
        const initial=await frame.evaluate(()=>globalThis.__cinematic.getFrameDiagnostics());
        await frame.evaluate(at=>globalThis.__cinematic.seek(at),observationTime);await settle();
        const final=await frame.evaluate(()=>globalThis.__cinematic.getFrameDiagnostics());
        const bindings=await frame.evaluate(()=>globalThis.__cinematicLab.values());
        motion={from:initial.time,to:final.time,nodes:bindings.filter(binding=>binding.property==='rotationSpeedY').map(binding=>{
          const before=initial.nodes.find(node=>node.id===binding.node),after=final.nodes.find(node=>node.id===binding.node);
          if(!before?.localRotation||!after?.localRotation)fail('领域运动没有真实可见的三维节点：'+binding.node);
          const expected=binding.value*(final.time-initial.time),actual=after.localRotation[1]-before.localRotation[1];
          // Compare modulo a full turn; equivalent rotations may cross ±π.
          if(Math.abs(Math.sin(expected)-Math.sin(actual))>1e-8||Math.abs(Math.cos(expected)-Math.cos(actual))>1e-8)fail('模型实际旋转与领域角速度不一致：'+binding.node);
          const ancestors=[],seen=new Set();let uniformParents=true;
          for(let id=scene.nodes.find(node=>node.id===binding.node)?.parent;id&&!seen.has(id);id=scene.nodes.find(node=>node.id===id)?.parent){
            seen.add(id);const a=initial.nodes.find(node=>node.id===id),b=final.nodes.find(node=>node.id===id),spec=scene.nodes.find(node=>node.id===id);
            if(!a||!b||JSON.stringify(a.localRotation)!==JSON.stringify(b.localRotation))fail('父级运动叠加到了转子角速度：'+binding.node+'/'+id);
            ancestors.push({id,before:a.localRotation,after:b.localRotation});
            uniformParents&&=spec.scale.every(value=>Math.abs(value-spec.scale[0])<1e-12);
          }
          if(!before.worldQuaternion||!after.worldQuaternion)fail('领域运动缺少真实世界变换：'+binding.node);
          if(uniformParents){const dot=before.worldQuaternion.reduce((sum,value,index)=>sum+value*after.worldQuaternion[index],0);
            if(Math.abs(dot*dot-Math.cos(expected/2)**2)>1e-8)fail('转子的世界运动与显示角速度不一致：'+binding.node);}
          return {node:binding.node,radiansPerSecond:binding.value,before:before.localRotation,after:after.localRotation,
            worldBefore:before.worldQuaternion,worldAfter:after.worldQuaternion,worldAngleValidated:uniformParents,ancestors};
        })};
      }
      const actual=await frame.evaluate(()=>({decision:globalThis.__cinematicLab.decisions().current,
        bindings:globalThis.__cinematicLab.values(),geometry:globalThis.__cinematic.getFrameDiagnostics().nodes}));
      const nodes=new Set(actual.bindings.map(binding=>binding.node));
      alternatives.push({action,values:actual.decision.values,bindings:actual.bindings,
        observationTime,...(motion?{motion}:{}),geometry:actual.geometry.filter(node=>nodes.has(node.id)),canvasSha256:hash(await captureDomainCanvas(frame))});
      await frame.locator('#process-reconsider').click();await settle();
      if(JSON.stringify(await frame.evaluate(()=>globalThis.__cinematicLab.getState()))!==JSON.stringify(before))fail('三维领域决策没有恢复相同检查点：'+decision.id);
      if(await frame.evaluate(()=>globalThis.__cinematic.getState().time)!==0)fail('撤销领域选择没有重置独立观察时钟：'+decision.id);
    }
    const comparisonRows=await frame.locator('.decision-results .result-different').count();
    evidence.push({id:decision.id,sameCheckpoint:true,comparisonRows,alternatives});
    if(!comparisonRows||new Set(alternatives.map(item=>JSON.stringify(item.values))).size<2||
        new Set(alternatives.map(item=>item.canvasSha256)).size<2)fail('不同策略没有可见三维后果或未显示比较：'+decision.id);
  }
  return evidence;
}

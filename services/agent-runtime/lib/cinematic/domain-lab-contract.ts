import type { CinematicScene } from './schema';
import { createProcessEngine, validateProcessPackage } from '../server/process-quality';
import { processOperations } from '../process/schema';
import { PROCESS_DECISION_BRIEF } from '../process/capabilities';

export function cinematicDomainBindingValue(property:string,value:unknown):number|[number,number,number]{
  if(property==='scale'&&Array.isArray(value)){
    if(value.length!==3||value.some(axis=>typeof axis!=='number'||!Number.isFinite(axis)||axis<.05||axis>5))
      throw Error('三维缩放必须为三个0.05至5的有限数值');
    return [...value] as [number,number,number];
  }
  if(typeof value!=='number'||!Number.isFinite(value))throw Error('三维绑定必须为有限数值');
  if(property==='rotationY')return value%(2*Math.PI);
  const [min,max]=['opacity','colorMix'].includes(property)?[0,1]:property==='emissive'?[0,10]:property==='scale'?[.05,5]:[-200,200];
  if(value<min||value>max)throw Error('三维绑定超出范围');
  return value;
}

function directState(value:unknown):string|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const record=value as Record<string,unknown>;
  return Object.keys(record).length===1&&typeof record.state==='string'?record.state:undefined;
}
function angularReadings(model:NonNullable<CinematicScene['lab']>['model']){
  return model.scene.views.flatMap(view=>{
    if(view.kind!=='value'||!/rad\s*\/\s*s|弧度.{0,4}秒/i.test(view.title))return [];
    const field=directState(view.value);return field?[{field,title:view.title}]:[];
  });
}

/** Repair only mechanical wiring whose meaning is supplied by the existing
 * scene: a stationary machine housing, an attached marker, and the unique
 * published rotor velocity. Never reauthor domain formulae or object facts. */
export function normalizeCinematicDomainBindings(scene:Pick<CinematicScene,'nodes'> & Partial<Pick<CinematicScene,'tracks'>>,
  model:NonNullable<CinematicScene['lab']>['model'],bound:Omit<NonNullable<CinematicScene['lab']>,'model'>){
  const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
  let bindings=bound.bindings.filter(binding=>binding.property!=='rotationSpeedY'||nodes.get(binding.node)?.model!=='centrifuge-housing');
  const kinetic=new Set(bindings.filter(binding=>binding.property==='rotationSpeedY').map(binding=>binding.node));
  bindings=bindings.filter(binding=>{
    const node=nodes.get(binding.node);
    if(binding.property!=='rotationSpeedY'||node?.role!=='support'||!/示踪|标记|marker|stripe/i.test(node.represents??''))return true;
    for(let parent=node.parent;parent;parent=nodes.get(parent)?.parent)if(kinetic.has(parent))return false;
    return true;
  });
  const readings=angularReadings(model).filter(reading=>!/HMI|人机|显示屏|差|偏离|偏差|gap|difference/i.test(reading.title));
  const fields=[...new Set(readings.map(reading=>reading.field))];
  if(!fields.length)bindings=bindings.map(binding=>{
    const node=nodes.get(binding.node);
    return binding.property==='rotationSpeedY'&&node?.role==='logic'&&
      !/转子|rotor|角速度|angular velocity/i.test(node.represents??'')?
      {...binding,property:'rotationY' as const}:binding;
  });
  if(fields.length===1)bindings=bindings.map(binding=>binding.property==='rotationSpeedY'&&
    /转子|rotor/i.test(nodes.get(binding.node)?.represents??'')?{...binding,value:{state:fields[0]}}:binding);
  if(fields.length===1){
    const reads=(value:unknown):boolean=>Array.isArray(value)?value.some(reads):!!value&&typeof value==='object'&&
      (directState(value)===fields[0]||Object.values(value).some(reads));
    const physicalGauge=(id:string)=>{
      const node=nodes.get(id);return node&&/(?:物理|实际).{0,12}(?:转速|速度|角速度).{0,12}(?:指针|仪表)|physical.{0,12}(?:speed|velocity).{0,12}(?:pointer|gauge)/i.test(
        [node.represents,node.label].join(' '));
    };
    const shape=(id:string)=>{const node=nodes.get(id)!;return JSON.stringify({kind:node.kind,model:node.model,
      params:node.params,scale:node.scale,rotation:node.rotation});};
    bindings=bindings.map(binding=>{
      if(binding.property!=='rotationY'||!physicalGauge(binding.node)||reads(binding.value))return binding;
      const templates=bindings.filter(candidate=>candidate.property===binding.property&&physicalGauge(candidate.node)&&
        shape(candidate.node)===shape(binding.node)&&reads(candidate.value));
      const values=[...new Set(templates.map(candidate=>JSON.stringify(candidate.value)))];
      return values.length===1?{...binding,value:structuredClone(templates[0].value)}:binding;
    });
  }
  // A single published velocity with equivalent typed object facts can be
  // shared by equivalent authored spinning rotors, including a comparison rig;
  // otherwise geometry repair cannot fix its missing frozen lab control.
  // Never invent a velocity, choose among multiple readings, animate static
  // context, or double-bind descendants of an existing rotating assembly.
  const objectFacts=Object.entries(model.scene.initialState).filter(([key,value])=>key.startsWith('object-')&&
    !/^object-(?:objectId|id|name|label)$/i.test(key)&&Array.isArray(value));
  const equivalentFacts=objectFacts.length>0&&objectFacts.every(([,value])=>Array.isArray(value)&&value.length>0&&
    value.every(item=>JSON.stringify(item)===JSON.stringify(value[0])));
  const identityChangesOutcome=JSON.stringify(model.scene.actions).includes('"state":"object-objectId"');
  if(fields.length===1 && equivalentFacts && !identityChangesOutcome && bindings.some(binding=>binding.property==='rotationSpeedY')){
    const rotating=new Set(bindings.filter(binding=>binding.property==='rotationSpeedY').map(binding=>binding.node));
    for(const node of scene.nodes){
      if(node.kind!=='cylinder'||node.role!=='primary'||!/转子|rotor/i.test(node.represents??''))continue;
      const chain:string[]=[];const seen=new Set<string>();
      for(let id:string|undefined=node.id;id&&!seen.has(id);id=nodes.get(id)?.parent){seen.add(id);chain.push(id);}
      if(chain.some(id=>rotating.has(id)))continue;
      const spin=scene.tracks?.find(track=>chain.includes(track.target)&&track.property==='rotation'&&
        Math.max(...track.keyframes.map(key=>Array.isArray(key.value)?key.value[1]:0))-
        Math.min(...track.keyframes.map(key=>Array.isArray(key.value)?key.value[1]:0))>=2*Math.PI-.001);
      if(!spin)continue;
      bindings.push({node:node.id,property:'rotationSpeedY',value:{state:fields[0]}});
      rotating.add(node.id);
    }
  }
  return {...bound,bindings};
}

export const CINEMATIC_DOMAIN_LAB_BRIEF = `三维演示默认提供学生领域决策，不只给播放和相机按钮。${PROCESS_DECISION_BRIEF}
SceneIR可提供lab:{model:{scene:process-v1场景,tests:真实执行测试},bindings:[{node:真实三维节点ID,property:"opacity|emissive|colorMix|positionY|rotationY|rotationSpeedY|scale",value:过程表达式}],picks?:[{node:三维节点ID,view:具有pick的过程视图ID,index:对象下标}]}。领域状态与时间线分离：choices更新过程状态，bindings把结果应用到真实三维对象；不能只跳时间轴或只改文字。colorMix为0–1，将该实体自己的实际材质从初始颜色连续混合到theme.secondary；0恢复原始颜色，1为secondary，不改变附属的独立节点颜色。颜色变化使用colorMix，不用emissive亮度冒充变色；数值评分需要除以公开上限得到0–1比例。opacity为0–1，emissive为0–10，scale为0.05–5的统一倍数或三个轴各自的倍数，均相乘于原节点尺寸，positionY为-200至200的绝对高度，rotationY是绝对弧度角并按2π周期等价归一化（不是角速度或rpm，不能直接把转速当角度）；rotationSpeedY为-200至200的显示角速度（rad/s），真实对象角度=初始角度+角速度×独立实验观察秒数，可暂停/单步/回拖。每个rotationSpeedY必须直接读取{state:"一个可见的显示角速度字段"}，该字段的value视图标注rad/s单位，不能在绑定阶段再乘任意比例；可观察性缩放在领域模型中完成并公开为此读数。一个旋转链只绑定转子，不给父级机壳或子级偏心标记叠加角速度，标记自动继承父转子旋转。转速、停机等持续运动要求必须用rotationSpeedY绑定真正转子，不能用rotationY角度跳变代替运动；rpm须乘2π/60转rad/s，若为了可观察性缩放显示速度，要在模型说明和指标单位中明确比例，不能伪称真实转速。改变条件、行动、撤销后观察时钟归零、暂停，物理状态仍由过程模型管理；这是对当前结果的可重复观察，不是未定义的动力学积分。实验模式不推进电影轨道或镜头；至少一处绑定须在同起点不同choices后产生不同数值。picks使点击三维对象触发过程视图的选择/动作。过程scene遵循process-v1，包含inputs、initialState、actions、decisions、views、stages、questions、coverage；表达式运算及参数数目${JSON.stringify(processOperations)}，不能使用JS或时间变量。教学后果由有界模型计算，不声称真实设备预测。明确仅观看、纯空间探索的教师要求可省略lab；策略、处置、应急或多方案比较必须提供lab。`;

export function requiresCinematicDomainLab(request: Record<string,unknown>): boolean {
  const text=[request.originalRequest,request.description].filter(part=>typeof part==='string').join('\n');
  if(/(?:仅|只|纯)(?:观看|演示|观察|空间探索)|不要(?:决策|选择|策略)/.test(text))return false;
  return request.interactionDesign==='decision-exploration-v1'||
    /学生[^。；\n]{0,120}(?:选择|决策|决定)|(?:不同|两种|多种).{0,8}(?:策略|方案)|策略比较|(?:相同|同一|同)起点.{0,8}比较|选择.{0,8}(?:隔离|恢复|处置|停机)|可交互|互动.{0,8}(?:实验|演示)|交互.{0,8}(?:实验|演示)/.test(text);
}

export function validateCinematicDomainLab(scene: Pick<CinematicScene,'lab'> & Partial<Pick<CinematicScene,'nodes'>>) {
  if (!scene.lab) return [];
  const angular=angularReadings(scene.lab.model),kinetic=scene.lab.bindings.filter(binding=>binding.property==='rotationSpeedY');
  for(const binding of kinetic)if(!angular.some(reading=>reading.field===directState(binding.value)))
    throw Error('显示角速度必须直接读取一个带 rad/s 单位的可见领域读数，不再乘额外比例：'+binding.node);
  if(scene.nodes){
    const nodes=new Map(scene.nodes.map(node=>[node.id,node])),targets=new Set(kinetic.map(binding=>binding.node));
    for(const binding of scene.lab.bindings.filter(binding=>binding.property==='colorMix')) {
      const node=nodes.get(binding.node);
      if(!node || node.kind==='group' || node.surfaceText)
        throw Error('颜色绑定必须指向自己的真实材质，不能把组或文字牌当作设备变色：'+binding.node);
    }
    for(const binding of kinetic){
      const node=nodes.get(binding.node);
      if(node?.model==='centrifuge-housing')throw Error('固定离心机机壳不能代替转子自转：'+binding.node);
      const seen=new Set<string>();
      for(let parent=node?.parent;parent&&!seen.has(parent);parent=nodes.get(parent)?.parent){
        seen.add(parent);if(targets.has(parent))throw Error('同一旋转链不能在父子节点叠加角速度；示踪带继承转子的旋转：'+binding.node+'/'+parent);
      }
    }
  }
  const checked=validateProcessPackage(scene.lab.model,[],{requireLearnerDecisions:true});
  const readBindings=(inputs:Record<string,unknown>,path:string[])=>{
    const engine=createProcessEngine(checked.scene);engine.reset(inputs);
    for(const action of path)engine.act(action);
    return scene.lab!.bindings.map(binding=>{
      let value:number|[number,number,number];
      try{value=cinematicDomainBindingValue(binding.property,engine.evaluate(binding.value));}
      catch(error){throw Error('三维领域状态绑定值无效：'+binding.node+'/'+binding.property+'；'+
        JSON.stringify({expression:binding.value,inputs,path,cause:error instanceof Error?error.message:String(error)}));}
      return {node:binding.node,property:binding.property,value};
    });
  };
  for(const test of checked.tests){
    const path:string[]=[];const engine=createProcessEngine(checked.scene);engine.reset(test.inputs);readBindings(test.inputs,path);
    for(const operation of test.actions){
      for(let step=0;step<(operation.count==='untilDone'?256:operation.count);step++){
        if(operation.count==='untilDone'&&!engine.repeatable(operation.id))break;
        engine.act(operation.id);path.push(operation.id);readBindings(test.inputs,path);
      }
    }
  }
  const evidence=checked.decisionEvidence.map(decision=>{
    const alternatives=decision.alternatives.map(item=>({action:item.action,bindings:readBindings(decision.inputs,[...decision.path,item.action])}));
    for(const alternative of alternatives){
      const label=checked.scene.actions.find(action=>action.id===alternative.action)!.label;
      if(/^(?:紧急|立即|安全)?停机$|^(?:emergency\s*stop|stop)$/i.test(label)&&
        new Set(kinetic.map(binding=>directState(binding.value))).size===1&&
        alternative.bindings.some(binding=>binding.property==='rotationSpeedY'&&binding.value!==0))
        throw Error('恒速观察模型中，停机方案必须使转子显示角速度为0；不能永久保留残余转速：'+alternative.action);
    }
    return {decision:decision.decision,alternatives,distinctVisualResults:new Set(alternatives.map(item=>JSON.stringify(item.bindings))).size>=2};
  });
  for(const decision of checked.scene.decisions??[])if(!evidence.some(item=>item.decision===decision.id&&item.distinctVisualResults))
    throw Error('不同领域选择没有影响真实三维对象：'+decision.id);
  return evidence;
}

/** Evidence for reviewers who would otherwise see only the movie tracks.
 * Formulae remain available in full; witnesses are computed by the same
 * domain engine as the player, independently of the author's descriptions. */
export function cinematicDomainLabEvidence(scene: Pick<CinematicScene,'lab'>) {
  if (!scene.lab) return undefined;
  const checked=validateProcessPackage(scene.lab.model,[],{requireLearnerDecisions:true});
  const seen=new Set<string>();
  const decisions=checked.decisionEvidence.filter(decision=>{
    const key=JSON.stringify([decision.decision,decision.inputs]);
    if(seen.has(key))return false;seen.add(key);return true;
  }).map(decision=>({decision:decision.decision,inputs:decision.inputs,path:decision.path,before:decision.before,
    alternatives:decision.alternatives.map(alternative=>{
      const engine=createProcessEngine(checked.scene);engine.reset(decision.inputs);
      for(const action of [...decision.path,alternative.action])engine.act(action);
      return {action:alternative.action,state:engine.getState().state,
        bindings:scene.lab!.bindings.map(binding=>({...binding,value:cinematicDomainBindingValue(binding.property,engine.evaluate(binding.value))}))};
    })}));
  return {implementation:'separate-deterministic-domain-model' as const,
    model:checked.scene,bindings:scene.lab.bindings,picks:scene.lab.picks??[],decisions,
    runtime:{inputs:'live preserves domain state; reset inputs start a new experiment',
      reconsider:'restores the exact decision state, inputs and history, keeps other results for comparison',
      modes:'watch applies movie tracks; experiment applies domain bindings, never both at once',
      observationClock:'rotationSpeedY is radians per observation second; angle=initial angle+speed*time. Pause/step/seek are reproducible. Every domain operation resets this independent clock to zero and pauses; the domain model is not integrated over time. Compare branches at the same observation time and fixed movie frame.',
      selectors:{input:'#input-ID',choice:'#action-ID',reconsider:'#process-reconsider',comparison:'.decision-results'}},
    interpretation:'These are executable domain choices and computed consequences, not time-axis seeks. The visible comparison table reads decisions.observe from those states. This is a bounded teaching model, not a real fluid/physics solver.'};
}

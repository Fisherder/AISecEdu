import { z } from 'zod';
import { runDurableStage } from '@/lib/generation/durable-stage';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import { generateStagedProcessPackage, PROCESS_STAGED_SYSTEMS } from '../process/scene-workflow';
import { processPackageSchema } from '../process/schema';
import { cinematicSceneSchema, parseCinematicScene, type CinematicScene } from './schema';
import { CINEMATIC_DOMAIN_LAB_BRIEF, validateCinematicDomainLab,normalizeCinematicDomainBindings } from './domain-lab-contract';
import {parseDecisionOutcomeSpec,type DecisionOutcomeSpec} from '../process/decision-outcome-spec';
import {compileTypedDecisionRepair} from '../process/typed-decision-repair';
import {buildDecisionRuntimeTests} from '../process/decision-runtime-tests';
import {cinematicOutcomeContract,validateCinematicOutcomeContract} from './domain-outcome-policy';
import {revalidateDurableStageDraft} from '../generation/revalidate-stage-draft';
import {cinematicHardwareGeometryIssues} from './hardware-geometry';
import {createProcessEngine} from '@/lib/server/process-quality';

/** An explicitly selected device owns its experiment feedback. Keep the
 * author's formula for that device and the actual initial reading for its
 * unselected reference. No new state, coefficient or object fact is invented. */
export function normalizeCinematicSelectedObjectScope(scene:CinematicScene,request:Record<string,unknown>) {
  const text=[request.originalRequest,request.description].filter(value=>typeof value==='string').join('\n');
  if(!scene.lab||!/(?:选择|选中)一台|所选(?:服务器|设备)/.test(text))return {scene,changes:[] as string[]};
  const lab=scene.lab,selector=lab.model.scene.inputs.find(input=>input.id==='selectedObject');
  const options=selector?.options;
  if(selector?.type!=='select'||!options||options.length<2)return {scene,changes:[] as string[]};
  const definitions=new Map(scene.nodes.map(node=>[node.id,node]));
  const picks=(lab.picks??[]).filter(pick=>definitions.get(pick.node)?.role==='primary');
  if(new Set(picks.map(pick=>pick.index)).size!==options.length)return {scene,changes:[] as string[]};
  const readsSelection=(value:unknown):boolean=>Array.isArray(value)?value.some(readsSelection):
    Boolean(value&&typeof value==='object'&&('input' in value?(value as {input:unknown}).input==='selectedObject':Object.values(value).some(readsSelection)));
  const engine=createProcessEngine(lab.model.scene);engine.reset();
  const changes:string[]=[],bindings=lab.bindings.map(binding=>{
    if(readsSelection(binding.value))return binding;
    const ancestors=new Set<string>();let node=definitions.get(binding.node);
    while(node&&!ancestors.has(node.id)){ancestors.add(node.id);node=node.parent?definitions.get(node.parent):undefined;}
    const owners=picks.filter(pick=>ancestors.has(pick.node)||binding.node.startsWith(pick.node+'_')||binding.node.startsWith(pick.node+'-'));
    const indices=[...new Set(owners.map(owner=>owner.index))];if(indices.length!==1)return binding;
    const baseline=engine.evaluate(binding.value);
    if(!(typeof baseline==='number'&&Number.isFinite(baseline))&&!(Array.isArray(baseline)&&baseline.length===3&&baseline.every(value=>typeof value==='number'&&Number.isFinite(value))))return binding;
    changes.push(binding.node+':'+binding.property);
    return {...binding,value:{op:'if' as const,args:[{op:'eq' as const,args:[{input:'selectedObject'},indices[0]]},binding.value,baseline]}};
  });
  if(!changes.length)return {scene,changes};
  const note='未选中的设备保持默认条件的静止参照；当前实验读数与操作反馈对应所选设备。';
  const revised=parseCinematicScene({...scene,modelNote:[scene.modelNote,note].filter(Boolean).join('\n'),lab:{...lab,bindings}});
  validateCinematicDomainLab(revised);
  return {scene:revised,changes};
}

/** Check the already-required hardware motion while the binding author can
 * still fix it. These computed mappings are only an author-stage probe;
 * delivered chapters and browser evidence must pass their own checks. */
export function validateCinematicRotorWiring(scene:CinematicScene) {
  if(!scene.lab||!scene.nodes.some(node=>node.model==='centrifuge-housing')||
    !scene.lab.model.scene.views.some(view=>view.kind==='value'&&/rad\s*\/\s*s|弧度.{0,4}秒/i.test(view.title)))return;
  const motion=scene.lab.bindings.filter(binding=>binding.property==='rotationSpeedY');
  const probe={...scene,tracks:[],coverage:{objects:[],interactions:motion.map(binding=>({
    description:'绑定阶段真实实验角速度验证',chapter:0,targets:[binding.node],properties:['domain' as const],
  }))}};
  const failures=cinematicHardwareGeometryIssues(probe).filter(issue=>[
    'hardware-centrifuge-rotation-missing','hardware-centrifuge-rotation-insufficient',
    'hardware-centrifuge-learner-control-missing',
  ].includes(issue.code));
  if(failures.length)throw Error('实验角速度尚未控制这些真实旋转实体：'+
    failures.map(issue=>issue.nodes.join('/')).join('，')+
    '。只修复bindings：给对应转子或其实际旋转载体绑定已有公开rad/s状态；兄弟转轴不带动转子，固定机壳不能旋转。保留model和其他绑定，不添加电影滑杆。');
}

/** Constant observation velocity cannot represent a coast-down curve. Honor
 * the explicit stop instruction in the typed source, including its published
 * HMI difference; preserve all other choices, parameters and object facts. */
export function cinematicStopSourcePolicy(raw:unknown):DecisionOutcomeSpec{
  const spec=parseDecisionOutcomeSpec(raw),copy=structuredClone(spec);
  const angular=copy.metrics.filter(metric=>/rad\s*\/\s*s|弧度.{0,4}秒/i.test(metric.unit));
  const physical=angular.filter(metric=>!/HMI|人机|差|gap|difference/i.test(metric.label));
  if(physical.length!==1)return spec;
  const hmi=angular.filter(metric=>/HMI|人机/i.test(metric.label)&&!/差|gap|difference/i.test(metric.label));
  let changed=false;
  for(const choice of copy.choices){
    if(!/^(?:紧急|立即|安全)?停机$|^(?:emergency\s*stop|stop)$/i.test(choice.label))continue;
    if(choice.outcomes[physical[0].id]===0)continue;
    changed=true;choice.outcomes[physical[0].id]=0;
    if(hmi.length===1)for(const metric of angular.filter(metric=>/差|gap|difference/i.test(metric.label))){
      let reading=choice.outcomes[hmi[0].id];
      if(['count','time','percent'].includes(hmi[0].kind))reading={op:'max',args:[0,reading]};
      if(hmi[0].max!==undefined)reading={op:'min',args:[hmi[0].max,reading]};
      choice.outcomes[metric.id]={op:'abs',args:[reading]};
    }
    choice.description='结束当前方案的驱动和注入，转子显示角速度设为 0。HMI 读数按本模型的独立显示规则保留。';
  }
  if(!changed)return spec;
  for(const metric of angular)metric.kind='score';
  const note=' 本实验以恒定角速度观察每个方案的结果，不进行停机后时间积分：紧急停机的物理转子显示角速度为 0 rad/s，HMI 与物理速度差由停机后的两项读数计算。角速度是连续数值，历史损伤或剩余风险按原有教学公式保留。';
  if(copy.modelNote.length+note.length<=4000)copy.modelNote+=note;
  return parseDecisionOutcomeSpec(copy);
}

export function normalizeCinematicOutcomeSpec(raw:unknown, context?:{
  realtimeConditions:string[]; request:Record<string,unknown>;
}):DecisionOutcomeSpec{
  const spec=cinematicStopSourcePolicy(raw),copy=structuredClone(spec);
  // Fulfil an explicitly declared display boundary at its source; do not
  // silently clamp the binding or change risk/physical engineering formulas.
  if(/-200\s*(?:至|到|\.\.)\s*200/.test(copy.modelNote)){
    for(const metric of copy.metrics.filter(metric=>/显示|物理|实际|转子|physical|actual|rotor/i.test(metric.label)&&/rad\s*\/\s*s/i.test(metric.unit)&&
      !/HMI|人机|差|偏差|gap/i.test(metric.label)))
      for(const choice of copy.choices){const value=choice.outcomes[metric.id];if(typeof value==='number'&&Math.abs(value)<=200)continue;
        if(value&&typeof value==='object'&&!Array.isArray(value)&&'op' in value&&value.op==='max'&&value.args[0]===-200){
          const inner=value.args[1];if(inner&&typeof inner==='object'&&!Array.isArray(inner)&&'op' in inner&&inner.op==='min'&&inner.args[0]===200)continue;
        }
        choice.outcomes[metric.id]={op:'max',args:[-200,{op:'min',args:[200,value]}]};}
  }
  const reads=(value:unknown,id:string):boolean=>Array.isArray(value)?value.some(item=>reads(item,id)):
    !!value&&typeof value==='object'&&(('input' in value&&value.input===id)||Object.values(value).some(item=>reads(item,id)));
  const duplicates=copy.parameters.filter(parameter=>copy.objects.length>1&&parameter.min===0&&
    parameter.max===copy.objects.length-1&&parameter.step===1&&
    /(?:选择|选中|对应).*(?:对象|服务器|设备|节点)|(?:object|server|device|node).*select/i.test(parameter.label+' '+parameter.id)&&
    !reads([copy.metrics,copy.choices],parameter.id));
  if(duplicates.length){
    copy.parameters=copy.parameters.filter(parameter=>!duplicates.includes(parameter));
    const note=' 对象选择由统一的场景对象选择器管理；未参与数值公式的重复选择参数 '+duplicates.map(parameter=>parameter.id).join('、')+' 已合并到该选择器，原对象事实和结果公式保持不变。';
    if(copy.modelNote.length+note.length<=4000)copy.modelNote+=note;
  }
  // Remove an invented dead control only after every explicitly requested
  // condition has an exact parameter match. Required or computed inputs stay;
  // never invent a coefficient merely to make an unused slider appear useful.
  const compact=(value:string)=>value.replace(/\s/g,'');
  const conditions=context?.realtimeConditions.map(compact)??[];
  const requestedText=[context?.request.originalRequest,context?.request.description]
    .filter((value):value is string=>typeof value==='string').join('\n');
  if(conditions.length>=2&&conditions.every(condition=>copy.parameters.some(parameter=>
    compact(parameter.label)===condition||parameter.id===condition))){
    const unused=copy.parameters.filter(parameter=>!conditions.includes(compact(parameter.label))&&
      !conditions.includes(parameter.id)&&!requestedText.includes(parameter.label)&&
      !requestedText.includes(parameter.id)&&!reads([copy.metrics,copy.choices],parameter.id));
    for(const parameter of unused){
      const label=parameter.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      copy.modelNote=copy.modelNote.replace(new RegExp('(?:、|和|与)'+label+'(?=[、和与。；，])','g'),'');
    }
    copy.parameters=copy.parameters.filter(parameter=>!unused.includes(parameter));
  }
  return parseDecisionOutcomeSpec(copy);
}

export function applyCinematicStopPolicy(request:Record<string,unknown>,model:NonNullable<CinematicScene['lab']>['model'],source:unknown){
  if(!source)return model;
  const original=parseDecisionOutcomeSpec(source),replacement=cinematicStopSourcePolicy(original);
  if(JSON.stringify(original)===JSON.stringify(replacement))return model;
  const repaired=compileTypedDecisionRepair(request,original,replacement,model.scene);
  return processPackageSchema.parse({scene:repaired.scene,tests:buildDecisionRuntimeTests(repaired.scene).tests});
}

const bindingSchema = cinematicSceneSchema.shape.lab.unwrap().omit({model:true}).strict();

/** In a fixed processor thermal lesson, temperature/risk colors the body;
 * it does not translate the entire package. Keep explicit movement requests
 * and all authored thermal formulas, colors and movie explosion tracks. */
export function normalizeCinematicThermalBindings<T extends Pick<NonNullable<CinematicScene['lab']>,'bindings'>>(
 scene:CinematicScene,request:Record<string,unknown>,bound:T):T {
 const text=[request.originalRequest,request.description].filter(value=>typeof value==='string').join('\n');
 if(!/负载|load/i.test(text)||!/温度|temperature/i.test(text)||!/散热|cooling/i.test(text)||!/颜色|color/i.test(text)||
   /位移|位置|高度|移动|升降|浮动|振动|膨胀|形变|translate|position|offset/i.test(text))return bound;
 const fixed=new Set(scene.nodes.filter(node=>node.model==='processor'&&
   bound.bindings.some(binding=>binding.node===node.id&&binding.property==='colorMix')).map(node=>node.id));
 const bindings=bound.bindings.filter(binding=>!(fixed.has(binding.node)&&binding.property==='positionY'));
 return bindings.length===bound.bindings.length?bound:{...bound,bindings};
}

/** Generated expressions sometimes spell a known leaf as an operation. Only
 * exact single-argument reads of existing fields are equivalent; other
 * operators, unknown names and extra metadata remain validation errors. */
export function normalizeCinematicBindingReads(raw:unknown,model:NonNullable<CinematicScene['lab']>['model']):unknown{
  const inputs=new Set(model.scene.inputs.map(input=>input.id));
  const states=new Set(Object.keys(model.scene.initialState));
  const read=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(read);
    if(!value||typeof value!=='object')return value;
    const record=value as Record<string,unknown>;
    if(Object.keys(record).length===2&&record.op==='clamp'&&Array.isArray(record.args)&&record.args.length===3&&
      typeof record.args[1]==='number'&&Number.isFinite(record.args[1])&&
      typeof record.args[2]==='number'&&Number.isFinite(record.args[2])&&record.args[1]<=record.args[2])
      return {op:'min',args:[record.args[2],{op:'max',args:[record.args[1],read(record.args[0])]}]};
    if(Object.keys(record).length===2&&Array.isArray(record.args)&&record.args.length===1&&typeof record.args[0]==='string'){
      if(record.op==='input'&&inputs.has(record.args[0]))return {input:record.args[0]};
      if(record.op==='state'&&states.has(record.args[0]))return {state:record.args[0]};
    }
    return Object.fromEntries(Object.entries(record).map(([key,item])=>[key,read(item)]));
  };
  const scaleVector=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.length===3&&value.some(axis=>axis!==null&&typeof axis==='object')
      ?{op:'array',args:value}:value;
    if(value&&typeof value==='object'){
      const expression=value as Record<string,unknown>;
      // Only the two result branches of a ternary expression return a
      // vector. Its condition and the operator argument list stay intact.
      if(expression.op==='if'&&Array.isArray(expression.args)&&expression.args.length===3)
        return {...expression,args:[expression.args[0],scaleVector(expression.args[1]),scaleVector(expression.args[2])]};
    }
    return value;
  };
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
  const source=raw as Record<string,unknown>;
  return {...source,...(Array.isArray(source.bindings)?{bindings:source.bindings.map(binding=>
    binding&&typeof binding==='object'&&!Array.isArray(binding)?{...binding,value:(()=>{
      const value=read(binding.value);
      // The existing engine's array operation evaluates each axis. Literal
      // scalar arrays remain literals; a three-axis expression is equivalent
      // to this canonical constructor, without changing or clamping any axis.
      return binding.property==='scale'?scaleVector(value):value;
    })()}:binding)}:{})};
}

/** Domain rules and 3D wiring have separate durable checkpoints. A timeline
 * or camera repair must never ask the model to reauthor working decisions. */
export async function generateCinematicDomainLab(options:{request:Record<string,unknown>;
  scene:CinematicScene;aiCall:AICallFn;state?:GenerationStateStore;signal?:AbortSignal;typedOutcomeSpec?:boolean}) {
  options.signal?.throwIfAborted();
  const transient=new Map<string,unknown>();
  const state=options.state?{read:(name:string)=>options.state!.read('domain-'+name),
    write:(name:string,value:unknown)=>options.state!.write('domain-'+name,value)}:
    {read:(name:string)=>transient.get(name),write:async(name:string,value:unknown)=>{transient.set(name,value);}};
  const spatialContext=options.scene.nodes.filter(node=>node.role!=='decoration')
    .map(({id,kind,model,role,represents,label})=>({id,kind,model,role,represents,label}));
  const outcomeContract=cinematicOutcomeContract(options.request,options.scene);
  let model=processPackageSchema.parse(await generateStagedProcessPackage({
    request:{...options.request,interactionDesign:'decision-exploration-v1',spatialContext,
      ...(options.typedOutcomeSpec?{outcomeContract}:{}),
      authoringScope:'只设计此三维实验的领域决策模型。三维实体已存在，勿另造几何、镜头或时间线。输入调节实验条件，学生选择改变同一领域状态和后果，之后单独绑定三维对象。'},
    system:'',testSystem:'',stageSystems:PROCESS_STAGED_SYSTEMS,aiCall:options.aiCall,state,
    cohesiveDomainModel:true,typedOutcomeSpec:options.typedOutcomeSpec,nativeDecisionSurface:options.typedOutcomeSpec,
    validateOutcomeSpec:spec=>validateCinematicOutcomeContract(spec,outcomeContract),
    normalizeOutcomeSpec:raw=>normalizeCinematicOutcomeSpec(raw,{
      realtimeConditions:outcomeContract.realtimeConditions,request:options.request}),
    priorOutcomeContract:cinematicOutcomeContract(options.request,options.scene,true),
  }));
  const typedSource=state?.read('workflow-process-outcome-spec') as {output?:unknown}|undefined;
  if(options.typedOutcomeSpec)model=processPackageSchema.parse(applyCinematicStopPolicy(options.request,model,typedSource?.output));
  const pickViews=model.scene.views.filter(view=>view.pick).map(view=>view.id);
  const objects=options.scene.nodes.map(({id,kind,model,role,represents,parent,position,rotation,scale})=>
    ({id,kind,model,role,represents,parent,position,rotation,scale}));
  const legacyObjects=objects.map(({parent:_parent,...object})=>object);
  const angularFields=model.scene.views.flatMap(view=>view.kind==='value'&&/rad\s*\/\s*s|弧度.{0,4}秒/i.test(view.title)&&
    view.value&&typeof view.value==='object'&&!Array.isArray(view.value)&&'state' in view.value&&typeof view.value.state==='string'
      ?[{field:view.value.state,title:view.title}]:[]);
  const outputSchema=z.toJSONSchema(bindingSchema,{io:'input'});
  options.signal?.throwIfAborted();
  const bindingInput={request:options.request,model,objects,outputSchema};
  const validateBinding=(raw:unknown)=>{
    const normalized=normalizeCinematicBindingReads(raw,model);
    const parsed=bindingSchema.parse(!pickViews.length&&normalized&&typeof normalized==='object'&&!Array.isArray(normalized)?{...normalized,picks:[]}:normalized);
    const bound=bindingSchema.parse(normalizeCinematicThermalBindings(options.scene,options.request,
      normalizeCinematicDomainBindings(options.scene,model,parsed)));
    const scene=parseCinematicScene({...options.scene,lab:{model,...bound}});
    validateCinematicDomainLab(scene);validateCinematicRotorWiring(scene);return bound;
  };
  const recoveredBindings=await revalidateDurableStageDraft({name:'domain-bindings',input:bindingInput,state:options.state,
    compatibleInputs:[{request:options.request,model,objects:legacyObjects,outputSchema}],validate:validateBinding});
  const bindings=recoveredBindings??await runDurableStage({name:'domain-bindings',state:options.state,
    system:CINEMATIC_DOMAIN_LAB_BRIEF+'\n本阶段只输出{bindings,picks?}，结构以outputSchema为准。完整model和三维实体已冻结，不输出model或scene，不改任何状态、动作或对象ID。bindings只读真实过程状态/输入，数值始终在属性范围内，并让不同choices改变学生真正观察的三维对象。initialState 中数组仍是完整数组，不能直接用于加减乘除或返回为单个属性值；读取某对象属性须使用 {op:"at",args:[{state:"已有数组字段"},对应对象下标]}，按对象绑定取固定下标，按当前选择读数取实际选择输入。positionY是绝对局部高度；scale乘原始尺寸，不能为0。模型仅作概念教学，不凭空模拟未定义的物理。picks按真实语义把实际对象映射到具有pick的模型view及对象下标。不能把选择结果绑定到无关地板或纯装饰灯。颜色状态用colorMix，把真实评分归一化为0–1，初始节点color与theme.secondary分别表示初态/变化端点，不能仅用emissive亮度声称变色。 rotationSpeedY只取一个可见rad/s读数的直接state表达式，不加隐藏缩放；真正转子才绑定角速度，机壳保持固定，转子的子级示踪带自动继承旋转，不能另绑。',
    input:{request:options.request,model,availablePickViews:pickViews,availableAngularReadings:angularFields,
      kineticRule:angularFields.length?'rotationSpeedY仅直接读取availableAngularReadings中的state字段':
        '当前模型没有公开的rad/s角速度读数，不能使用rotationSpeedY或另造转速。开度/位置后果使用positionY或rotationY；电影中的阀杆转动保留已有时间线，不能凭空添加恒定实验角速度。',
      pickRule:pickViews.length?'picks仅可引用availablePickViews':'没有可操作过程视图，picks必须为空或省略；不能把普通读数视图当作选择视图。',
      objects,outputSchema},checkpointInput:bindingInput,
    reuseFromInputs:[{request:options.request,model,objects:legacyObjects,outputSchema}],
    aiCall:options.aiCall,stage:{stage:'cinematic-scene'},signal:options.signal,maxAttempts:2,maxTotalAttempts:3,
    validate:validateBinding});
  return {model,...bindings};
}

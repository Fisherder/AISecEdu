import {z} from 'zod';
import {processOperations,validateProcessActions,validateProcessInputDefinitions,type ProcessExpression,type ProcessScene} from './schema';
import {normalizeProcessExpressions} from './normalize';
import {createProcessEngine} from '@/lib/server/process-quality';
import {parseFormulaLiteral} from './formula-literal';
import {PROCESS_RUNTIME_BEHAVIOR_BRIEF} from './capabilities';

const id=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/)
  .refine(value=>!['constructor','prototype','__proto__','selectedObject','phase'].includes(value));
const text=z.string().min(1).max(1000);
const label=z.string().min(1).max(120);
const scalar=z.union([z.string().max(80),z.number().finite(),z.boolean(),z.null()]);
const numericOps=new Set(['add','sub','mul','div','mod','floor','ceil','round','abs','min','max','lt','lte','gt','gte']);
const authorOperations=Object.fromEntries(Object.entries(processOperations).filter(([op])=>
  numericOps.has(op)||['eq','ne','not','and','or','if'].includes(op)));
type OutcomeExpression=string|number|boolean|null|OutcomeExpression[]|{input:string}|{object:string;of?:string}|{op:string;args:OutcomeExpression[]};
const expression:z.ZodType<OutcomeExpression>=z.lazy(()=>z.union([scalar,z.array(scalar).max(128),
  z.object({input:id}).strict(),z.object({object:id,of:id.optional()}).strict(),
  z.object({op:z.enum(Object.keys(processOperations) as [keyof typeof processOperations,...(keyof typeof processOperations)[]]),
    args:z.array(expression).max(16)}).strict()]));
export const decisionOutcomeSpecSchema=z.object({
  modelNote:z.string().min(1).max(4000),
  parameters:z.array(z.object({id,label,unit:z.string().max(60),default:z.number().finite(),
    // The shared engine supports eight inputs; reserve one for object picking.
    // A five-condition lesson is executable and must not be reauthored merely
    // because the authoring envelope used a smaller, arbitrary limit.
    min:z.number().finite(),max:z.number().finite(),step:z.number().positive()}).strict()).max(7),
  properties:z.array(z.object({id,label,unit:z.string().max(60)}).strict()).min(1).max(16),
  objects:z.array(z.object({id,label,evidence:z.string().min(1).max(600),values:z.record(id,scalar)}).strict()).min(1).max(6),
  metrics:z.array(z.object({id,label,unit:z.string().max(60),kind:z.enum(['count','percent','time','score']),
    max:expression.optional()}).strict()).min(2).max(6),
  prompt:text,
  choices:z.array(z.object({id,label,description:text,explanation:text,outcomes:z.record(id,expression)}).strict()).min(2).max(6),
}).strict().superRefine((spec,ctx)=>{
  for(const key of ['parameters','properties','objects','metrics','choices'] as const)
    if(new Set(spec[key].map(item=>item.id)).size!==spec[key].length)
      ctx.addIssue({code:'custom',path:[key],message:'IDs must be unique'});
  const metricIDs=spec.metrics.map(metric=>metric.id),propertyIDs=spec.properties.map(property=>property.id);
  if(new Set([...metricIDs,...propertyIDs.map(id=>'object-'+id)]).size!==metricIDs.length+propertyIDs.length)
    ctx.addIssue({code:'custom',path:['metrics'],message:'Metric and compiled property IDs overlap'});
  for(const [index,object]of spec.objects.entries())if(propertyIDs.length!==Object.keys(object.values).length||
      propertyIDs.some(id=>!Object.hasOwn(object.values,id)))ctx.addIssue({code:'custom',path:['objects',index,'values'],message:'Provide exactly the declared properties'});
  for(const [index,choice]of spec.choices.entries())if(metricIDs.length!==Object.keys(choice.outcomes).length||
      metricIDs.some(id=>!Object.hasOwn(choice.outcomes,id)))ctx.addIssue({code:'custom',path:['choices',index,'outcomes'],message:'Provide exactly one formula for every metric'});
  for(const [index,param]of spec.parameters.entries())if(param.max<=param.min||param.default<param.min||param.default>param.max)
    ctx.addIssue({code:'custom',path:['parameters',index],message:'Parameter range/default is invalid'});
});
export type DecisionOutcomeSpec=z.infer<typeof decisionOutcomeSpecSchema>;

/** A compiled decision condition must participate in a domain result, not
 * merely in copy or a control label. This exact dependency check catches
 * frozen default-value formulas without guessing scientific coefficients. */
export function assertTypedDecisionParameterDependencies(model:Pick<ProcessScene,'inputs'|'actions'|'decisions'>){
  const fields=new Set(model.decisions?.flatMap(decision=>decision.observe.map(item=>item.field))??[]);
  const reads=(value:unknown,id:string):boolean=>Boolean(value&&typeof value==='object'&&
    (Array.isArray(value)?value.some(item=>reads(item,id)):
      'input' in value&&value.input===id||Object.values(value).some(item=>reads(item,id))));
  for(const input of model.inputs.filter(input=>input.id!=='selectedObject'))
    if(!model.actions.some(action=>action.updates.some(update=>fields.has(update.target)&&reads(update.value,input.id))))
      throw Error('实时参数 '+input.id+' 未参与任何领域结果公式或上限；不能只保留默认工况或用说明代替真实作用');
}

function normalizeOutcomeFormula(value:unknown,numericExpected=true):unknown {
  if(numericExpected&&typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value)))
    return Number(value);
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  // A fully explicit fixed-object property reference has one unambiguous
  // meaning. Never guess an object or property from labels or missing IDs.
  if(Object.keys(value).length===2&&typeof (value as any).object==='string'){
    const property=(value as any).prop??(value as any).property;
    if(typeof property==='string')return {object:property,of:(value as any).object};
  }
  const expr=value as {op?:string;args?:unknown[]};
  if(!expr.op||!Array.isArray(expr.args))return value;
  const args=expr.args.map((arg,index)=>normalizeOutcomeFormula(arg,
    numericOps.has(expr.op!)||expr.op==='if'&&index>0&&numericExpected));
  // A sum/product/min/max of exactly one numeric expression is the same
  // expression. Remove only this redundant wrapper, not empty operands,
  // subtraction, division, unknown metadata or any substantive formula.
  if(numericExpected&&args.length===1&&['add','mul','min','max'].includes(expr.op)&&
    Object.keys(value).every(key=>key==='op'||key==='args'))return args[0];
  return {...expr,args};
}

export function parseDecisionOutcomeSpec(value:unknown):DecisionOutcomeSpec {
  if(!value||typeof value!=='object'||Array.isArray(value))return decisionOutcomeSpecSchema.parse(value);
  const source=structuredClone(value) as {choices?:Array<{outcomes?:Record<string,unknown>}>;metrics?:Array<{max?:unknown}>};
  // An exact echoed diagnostic is transport metadata, never a domain rule.
  // Other unexpected fields remain errors rather than silently disappearing.
  if((source as Record<string,unknown>).runtimeFacts===PROCESS_RUNTIME_BEHAVIOR_BRIEF)
    delete (source as Record<string,unknown>).runtimeFacts;
  for(const choice of source.choices??[])if(choice.outcomes&&typeof choice.outcomes==='object')
    for(const [key,expr]of Object.entries(choice.outcomes))choice.outcomes[key]=normalizeOutcomeFormula(normalizeProcessExpressions(
      typeof expr==='string'?parseFormulaLiteral(expr)??expr:expr));
  for(const metric of source.metrics??[])if(metric.max!==undefined)metric.max=normalizeOutcomeFormula(normalizeProcessExpressions(
    typeof metric.max==='string'?parseFormulaLiteral(metric.max)??metric.max:metric.max));
  return decisionOutcomeSpecSchema.parse(source);
}

export const DECISION_OUTCOME_SPEC_PROMPT=`你设计学生决策教学实验的领域模型。只输出一个JSON，结构如下：
{modelNote:完整教学假设与关键公式规则,parameters:[{id,label,unit,default,min,max,step}],properties:[{id,label,unit}],objects:[{id,label,evidence,values:{属性id:标量}}],metrics:[{id,label,unit,kind:"count|percent|time|score",max?:表达式}],prompt:学生面对的决策问题,choices:[{id,label,description,explanation,outcomes:{每个结果id:表达式}}]}。
parameters逐项包含教师明确要求可实时调整的全部条件；不得把计划速度、持续时间、压差等可调条件写成properties中的固定事实。数量以原文为准，不预设为一项；不添加选择策略、对象下标、重置或比较控件。outcomeContract列出原文中的实时条件时必须逐项落实。objects提供1–6个学生可查看证据的真实场景对象，数量以教师原文和实际场景为准。只有一个对象也能比较不同策略，不为满足数量编造设备、材料或案例。objects不是操作菜单，不把半开/全开、隔离/恢复等choices再次当作不同对象；同一对象的工况由parameters调整、方案由choices定义。properties定义对象事实的标签和单位，每个object.values恰好包含所有properties。evidence用明确事实帮助判断，不直接标注正确答案；属性值与证据一致。metrics定义2–6个核心后果，不加phase、日志、选择标签等内部字段。每个choice.outcomes恰好为每个metric提供一个完整公式，选择直接计算本次结果，不读取历史结果。程序负责状态转移、对象选择、结果读数和同起点比较，无需设计initialState、actions、views或questions。
表达式是标量、{input:参数id}、{object:当前选中对象的已声明属性id}或{op:运算,args:[表达式,...]}。对象标识不是属性，需要在properties中声明并在每个values中提供，才能参与公式。不允许state、local、JavaScript、占位函数或表达式字符串。每个结果公式直接返回有限数值，不能用单项数组包装表达式。所选object属性为标量，不进行sum、数组、字节编码或bitDifference等操作；不要拿IP地址位差等无关属性当恶意扩散因果。布尔值参与计算先用if映射为数值，不把true/false直接乘除。本领域需要的运算及参数数目：${JSON.stringify(authorOperations)}。多项加乘减可嵌套，运算仅使用所需类型；条件显式eq/lt等。对象差异若决定处置后果，公式必须读取对应object属性；全局实验条件读取input。无关属性不能凭空决定领域后果。
count是非负数量，time是非负耗时，percent是0–100的百分比，score是可正可负的示意分值。程序会对count/time取不小于0，对percent限制在0–100；需要总量上限时metric.max显式引用总量公式。modelNote须说明这些边界，并与真实公式、单位及对象事实一致。计数需要整数时公式使用floor/ceil；所有允许输入下有限，不除以零。零时长/零流量下后果须符合初态；至少一种合法条件下不同策略有真实领域差异。简化系数明确标为有界教学假设，不冒充真实统计概率。策略文字描述实际行为，不提前告诉学生哪项正确；失败方案也有可见后果。ID使用ASCII，不能使用phase或selectedObject。
properties/object.values保存静态事实，不把实时参数派生的数量、比例、倍数冻结在默认值。例如实时金额/历史平均金额的倍数、实时攻击速率产生的攻击请求数，应直接在outcomes公式中引用input计算，静态证据只能写明确默认工况示例。每个指标的量纲、总量/子集、比例分母及零分母规则必须一致；字段数量不能直接当作完成的任务条数，暴露量与拦截量不是同一指标。固定系数明确教学假设，不能用默认值的比例去缩放所有工况。
公式必须是JSON对象，正确写法示例：{"cost":{"op":"mul","args":[{"input":"records"},3]},"risk":{"op":"if","args":[{"op":"eq","args":[{"object":"sensitive"},true]},80,10]}}。不得把上述对象放进引号，不能输出"mul(records,3)"或"{op:'mul',args:[...]}"这样的字符串。示例只说明格式；实际ID、属性、公式均由本题定义。只输出上述完整JSON。`;

export const DECISION_OUTCOME_REPAIR_FORMAT=`保持 sourceSpec 的完整字段结构：modelNote、parameters、properties、objects、metrics、prompt、choices；不附加 runtimeFacts 或诊断。每个 choices[i] 为 {id,label,description,explanation,outcomes:{每个 metric.id:完整数值公式}}。表达式只用数值/布尔常量、{"input":"已有参数ID"}、{"object":"已有属性ID"} 和 {"op":"运算","args":[表达式,...]}；object 默认读取当前选中对象。明确需要另一对象的事实时用 {"object":"已有属性ID","of":"已有对象ID"}，如比较备份窗口与受损文件；of 不得使用下标或未知 ID。不能输出对象ID代替属性ID、state/local、JS、单项数组包裹或表达式字符串。允许运算及参数数目：${JSON.stringify(authorOperations)}。示例：{"op":"mul","args":[{"input":"records"},{"object":"sensitivity"}]}。说明与每个对象、允许条件的实际公式一致；边界/饱和结果相同合理，无需虚构额外差异。`;

/** Lower a typed result model into the shared engine. Object facts are
 * immutable arrays; every outcome reads current inputs/object properties,
 * never an accidentally frozen input default or previous result. */
export function compileDecisionOutcomeSpec(spec:DecisionOutcomeSpec){
  const params=new Set(spec.parameters.map(param=>param.id)),props=new Set(spec.properties.map(prop=>prop.id));
  const lower=(value:OutcomeExpression):ProcessExpression=>{
    if(value===null||typeof value!=='object'||Array.isArray(value))return value as ProcessExpression;
    if('input' in value){if(!params.has(value.input))throw Error('Unknown outcome parameter: '+value.input);return value;}
    if('object' in value){if(!props.has(value.object))throw Error('Unknown object property: '+value.object);
      const index=value.of===undefined?undefined:spec.objects.findIndex(object=>object.id===value.of);
      if(index!==undefined&&index<0)throw Error('Unknown fixed object: '+value.of);
      return {op:'at',args:[{state:'object-'+value.object},index??{input:'selectedObject'}]};}
    return {op:value.op,args:value.args.map(lower)};
  };
  const inputs:ProcessScene['inputs']=[...spec.parameters.map(param=>({id:param.id,label:param.label+(param.unit?'（'+param.unit+'）':''),
    type:'range' as const,mode:'live' as const,default:param.default,min:param.min,max:param.max,step:param.step})),
    {id:'selectedObject',label:spec.objects.length===1?'场景对象':'选择场景对象',type:'select',mode:'live',default:0,
      options:spec.objects.map((object,index)=>({label:object.label,value:index}))}];
  const initialState:ProcessScene['initialState']={phase:0,...Object.fromEntries(spec.metrics.map(metric=>[metric.id,0])),
    ...Object.fromEntries(spec.properties.map(prop=>['object-'+prop.id,spec.objects.map(object=>object.values[prop.id])]))};
  const observe=spec.metrics.map(metric=>({field:metric.id,label:metric.label+(metric.unit?'（'+metric.unit+'）':'')}));
  const actions:ProcessScene['actions']=spec.choices.map(choice=>({id:choice.id,label:choice.label,description:choice.description,
    enabledWhen:{op:'eq',args:[{state:'phase'},0]},feedback:choice.explanation,
    updates:[...spec.metrics.map(metric=>{
      let value=lower(choice.outcomes[metric.id]);
      if(['count','percent','time'].includes(metric.kind))value={op:'max',args:[0,value]};
      if(metric.kind==='percent')value={op:'min',args:[100,value]};
      if(metric.max!==undefined)value={op:'min',args:[lower(metric.max),value]};
      return {target:metric.id,value:normalizeProcessExpressions(value) as ProcessExpression};
    }),{target:'phase',value:1}]}));
  const model={inputs,initialState,actions,decisions:[{id:'studentDecision',prompt:spec.prompt,
    when:{op:'eq',args:[{state:'phase'},0]} as ProcessExpression,choices:spec.choices.map(choice=>choice.id),observe}],
    modelNote:spec.modelNote,
    objectEvidence:spec.objects.map((object,index)=>({value:index,description:object.evidence+'\n'+spec.properties.map(prop=>
      prop.label+'：'+(typeof object.values[prop.id]==='boolean'?(object.values[prop.id]?'是':'否'):String(object.values[prop.id]??''))+
      (prop.unit&&!['无','无量纲','文本','布尔','类别'].includes(prop.unit)?' '+prop.unit:'')).join('；')}))};
  assertTypedDecisionParameterDependencies(model);
  validateProcessInputDefinitions(inputs);
  validateProcessActions(actions,{inputs,initialState});
  // Check executable numeric contracts before freezing the paid domain stage.
  // Boundary probes do not prove scientific correctness; the independent
  // content review still examines the complete formulas and assumptions.
  const engine=createProcessEngine({schemaVersion:'process-v1',inputs,initialState,actions,decisions:model.decisions,title:'Contract probe',
    summary:'Contract probe',modelNote:spec.modelNote,layout:'decision-lab',
    views:spec.metrics.map(metric=>({id:metric.id,title:metric.label,kind:'value',value:{state:metric.id}})),
    stages:[{id:'before',title:'Before',when:{op:'eq',args:[{state:'phase'},0]},explanation:'Before decision'},
      {id:'after',title:'After',when:{op:'eq',args:[{state:'phase'},1]},explanation:'After decision'}],questions:[],coverage:[]});
  let probes:Record<string,number>[]=[{}];
  for(const param of spec.parameters)probes=probes.flatMap(probe=>
    // Test the declared finite endpoints directly. Reconstructing max from
    // decimal steps can produce 3.0000000000000004 for an actual max of 3,
    // making our own verifier reject a valid paid model as out of range.
    [...new Set([param.min,param.default,param.max])]
      .map(value=>({...probe,[param.id]:value})));
  for(const probe of probes)for(let object=0;object<spec.objects.length;object++){
    engine.reset({...probe,selectedObject:object});
    for(const metric of spec.metrics){
      if(metric.max!==undefined){
        const upper=engine.evaluate(lower(metric.max));
        if(typeof upper!=='number'||!Number.isFinite(upper)||metric.kind!=='score'&&upper<0)
          throw Error(`Invalid upper bound for ${metric.id}: actual=${JSON.stringify(upper)} at object ${spec.objects[object].id}, parameters ${JSON.stringify(probe)}`);
      }
      for(const action of actions){
        let value;try{value=engine.evaluate(action.updates.find(update=>update.target===metric.id)!.value);}
        catch(error){throw Error(`Outcome ${action.id}.${metric.id}, object ${spec.objects[object].id}, parameters ${JSON.stringify(probe)}: ${String(error)}; formula=${JSON.stringify(action.updates.find(update=>update.target===metric.id)!.value)}`);}
        if(typeof value!=='number'||!Number.isFinite(value))
          throw Error(`Outcome ${action.id}.${metric.id} must be a finite number`);
      }
    }
  }
  return model;
}

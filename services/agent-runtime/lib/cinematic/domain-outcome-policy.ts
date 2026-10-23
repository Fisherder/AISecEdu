import type {CinematicScene} from './schema';
import {compileDecisionOutcomeSpec,type DecisionOutcomeSpec} from '../process/decision-outcome-spec';
import {nativeDecisionPresentation} from '../process/native-decision-surface';
import {createProcessEngine} from '@/lib/server/process-quality';

/** Only enforce capabilities explicitly requested by the teacher. The model
 * still supplies every object fact, coefficient, outcome and explanation. */
export function cinematicOutcomeContract(request:Record<string,unknown>,scene:Pick<CinematicScene,'nodes'>,legacyExtraction=false){
 const text=[request.originalRequest,request.description].filter(value=>typeof value==='string').join('\n');
 const explicit=[...text.matchAll(/实时(?:调节|调整|改变|设置)([^，。；\n]{1,70})/g)];
 const clauses=(legacyExtraction?[...text.matchAll(/(?:实时)?(?:调节|调整|改变|设置)([^，。；\n]{1,70})/g)]:
  explicit.length?explicit:[...text.matchAll(/(?:调节|调整|设置)([^，。；\n]{1,70})/g)]).map(match=>match[1]);
 const realtimeConditions=[...new Set(clauses.filter(clause=>/与|和|、/.test(clause)).flatMap(clause=>
   clause.split(/与|和|、/).map(condition=>condition.trim()).filter(Boolean)))];
 const paired=realtimeConditions.length>=2;
 const rotor=scene.nodes.some(node=>/转子|rotor|轴/.test([node.represents,node.label].join(' ')));
 const continuousRotorMotion=rotor&&/持续旋转|连续旋转|角速度|转速|rad\s*\/\s*s|angular\s*velocity/i.test(text);
 return {version:'cinematic-outcome-2',minimumRealtimeParameters:paired?2:0,realtimeConditions,continuousRotorMotion,
  instruction:'教师列出的实时条件全部是parameters，分别参与结果公式，不保留默认值代替它们。需要连续转子运动时，metrics必须包含可见的物理转子显示角速度，unit为rad/s；HMI读数和速度差是独立指标，不能代替物理角速度。所有允许条件下显示角速度在-200至200之间，停机方案为0。若观察缩放，公开比例及教学假设。后续三维绑定只读这些已声明指标，绝不发明新状态或改科学公式。'};
}

export function validateCinematicOutcomeContract(spec:DecisionOutcomeSpec,contract:ReturnType<typeof cinematicOutcomeContract>){
 if(spec.parameters.length<contract.minimumRealtimeParameters)
  throw Error('教师明确列出的实时条件必须分别成为parameters，不能写成固定properties：'+contract.realtimeConditions.join('、')+'；当前parameters为'+spec.parameters.map(parameter=>parameter.label).join('、'));
 if(!contract.continuousRotorMotion)return;
 const physical=spec.metrics.filter(metric=>/rad\s*\/\s*s|弧度.{0,4}秒/i.test(metric.unit)&&
  !/HMI|人机|差|偏离|偏差|gap|difference/i.test(metric.label));
 if(!physical.length)throw Error('连续转子运动需要已声明的可见物理显示角速度指标（rad/s），不能只写转速差、风险或HMI读数');
 const model=compileDecisionOutcomeSpec(spec),display=nativeDecisionPresentation({},model,model);
 if(!display)throw Error('物理角速度读数的确定性展示未完成');
 const {inputs,initialState,actions,decisions}=model;
 const engine=createProcessEngine({schemaVersion:'process-v1',inputs,initialState,actions,decisions,...display});
 let probes:Record<string,number>[]=[{}];
 for(const parameter of spec.parameters)probes=probes.flatMap(probe=>
  [...new Set([parameter.min,parameter.default,parameter.max])].map(value=>({...probe,[parameter.id]:value})));
 for(const probe of probes)for(let selectedObject=0;selectedObject<spec.objects.length;selectedObject++)for(const action of model.actions){
  engine.reset({...probe,selectedObject});engine.act(action.id);
  for(const metric of physical){
   const value=engine.evaluate({state:metric.id});
   if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>200)
    throw Error('物理显示角速度须在-200至200 rad/s内；指标 '+metric.id+'，方案 '+action.id+'，实际计算值 '+JSON.stringify(value)+'，对象 '+spec.objects[selectedObject].id+'，条件 '+JSON.stringify(probe)+'；只修正对应公开读数公式并保持单位与模型说明一致，不缩小教师的输入范围。');
   if(/^(?:紧急|立即|安全)?停机$|^(?:emergency\s*stop|stop)$/i.test(action.label)&&value!==0)
    throw Error('停机方案的物理显示角速度必须为0：'+action.id+'/'+metric.id);
  }
 }
}

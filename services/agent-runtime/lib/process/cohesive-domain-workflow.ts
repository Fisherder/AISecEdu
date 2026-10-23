import {z} from 'zod';
import {runDurableStage,durableStageFingerprint} from '@/lib/generation/durable-stage';
import type {AICallFn} from '@/lib/generation/pipeline-types';
import type {GenerationStateStore} from '@/lib/generation/validated-stage';
import {nativeDecisionPresentation} from './native-decision-surface';
import {parseCinematicJson} from '../cinematic/json';
import {parseDecisionOutcomeSpec,compileDecisionOutcomeSpec,DECISION_OUTCOME_SPEC_PROMPT,type DecisionOutcomeSpec} from './decision-outcome-spec';
import {revalidateDurableStageDraft} from '../generation/revalidate-stage-draft';

const initialState=z.union([z.record(z.string(),z.unknown()),z.array(z.object({id:z.string(),value:z.unknown()}).strict()).min(1)
  .refine(items=>new Set(items.map(item=>item.id)).size===items.length,'Duplicate state IDs cannot be merged')])
  .transform(value=>Array.isArray(value)?Object.fromEntries(value.map(item=>[item.id,item.value])):value);
const draftSchema=z.object({inputs:z.array(z.unknown()).min(1),initialState,
  actions:z.array(z.unknown()).min(1),decisions:z.array(z.unknown()).min(1),interactionPlan:z.unknown().optional(),
  modelNote:z.string().min(1).max(4000).optional(),objectEvidence:z.array(z.object({
    value:z.union([z.string(),z.number().finite(),z.boolean(),z.null()]),description:z.string().min(1).max(4000),
  }).strict()).min(1).max(12).optional()}).strict();

/** Author the coupled model in one paid call, then feed its parts through the
 * existing independent state/behavior validators and durable checkpoints.
 * A failed part is repaired alone. Older split checkpoints keep their path. */
export function cohesiveDomainAICall(options:{request:Record<string,unknown>;system:string;
  aiCall:AICallFn;state?:GenerationStateStore;nativeDecisionSurface?:boolean;typedOutcomeSpec?:boolean;
  validateOutcomeSpec?:(spec:DecisionOutcomeSpec)=>void;normalizeOutcomeSpec?:(spec:DecisionOutcomeSpec)=>DecisionOutcomeSpec;
  priorOutcomeContract?:Record<string,unknown>}):AICallFn{
  const prior=options.state?.read('workflow-process-cohesive-domain') as {fingerprint?:string;output?:z.infer<typeof draftSchema>}|undefined;
  const input={request:options.request,authoringPolicy:options.typedOutcomeSpec?'typed-outcome-v1':'cohesive-domain-v1'};
  const legacy=options.state?.read('workflow-process-state')&&!prior;
  // Let the durable stage check the request fingerprint before using any paid
  // output. A caller can reuse a state file for a different request.
  let draft:z.infer<typeof draftSchema>|undefined;
  return async(system,user,images,callOptions)=>{
    let packet:{step?:string;repair?:unknown;frozen?:unknown};try{packet=JSON.parse(user);}catch{return options.aiCall(system,user,images,callOptions);}
    const coherent=draft??(prior?.fingerprint===durableStageFingerprint('process-cohesive-domain',input)?prior.output:undefined);
    if(packet.step==='process-presentation'&&coherent&&options.nativeDecisionSurface&&!packet.repair){
      const presentation=nativeDecisionPresentation(options.request,packet.frozen,coherent);
      if(presentation)return JSON.stringify(presentation);
    }
    if(packet.step==='process-presentation'&&coherent?.modelNote)
      return options.aiCall(system+'\n领域模型已同时写出假设和规则。使用domainModelNote逐字保留为modelNote；其他解释与此规则及实际公式一致，勿另造系数。',
        JSON.stringify({...packet,domainModelNote:coherent.modelNote}),images,callOptions);
    if(legacy||packet.repair||!['process-state','process-behavior'].includes(packet.step??''))
      return options.aiCall(system,user,images,callOptions);
    if(!draft){
      if(packet.step!=='process-state')return options.aiCall(system,user,images,callOptions);
      const domainCall: AICallFn=options.typedOutcomeSpec?async()=>{
        const frozenInput={request:options.request,authoringPolicy:'typed-outcome-v1'};
        const contract=options.request.outcomeContract as Record<string,unknown>|undefined;
        const legacyContract=contract?.version==='cinematic-outcome-2'
          ?Object.fromEntries(Object.entries({...contract,version:'cinematic-outcome-1'}).filter(([key])=>key!=='realtimeConditions')):undefined;
        const legacyInput=legacyContract?{request:{...options.request,outcomeContract:legacyContract},authoringPolicy:'typed-outcome-v1'}:undefined;
        const compatibleInputs=[...(legacyInput?[legacyInput]:[]),...(options.priorOutcomeContract?
          [{request:{...options.request,outcomeContract:options.priorOutcomeContract},authoringPolicy:'typed-outcome-v1'}]:[])];
        const savedSpec=options.state?.read('workflow-process-outcome-spec') as Record<string,unknown>|undefined;
        let sourceSpec:DecisionOutcomeSpec|undefined;
        if(savedSpec&&compatibleInputs.some(input=>savedSpec.fingerprint===durableStageFingerprint('process-outcome-spec',input))){
          // Preserve the failed paid model before its frozen contract changes.
          // A complete legacy draft is editing data, never a new instruction.
          await options.state?.write('outcome-contract-migration-'+String(savedSpec.fingerprint).slice(0,24),savedSpec);
          if(savedSpec.output===undefined&&typeof savedSpec.previousOutput==='string'){
            try{sourceSpec=parseDecisionOutcomeSpec(parseCinematicJson(savedSpec.previousOutput).value);
              sourceSpec=options.normalizeOutcomeSpec?.(sourceSpec)??sourceSpec;
              compileDecisionOutcomeSpec(sourceSpec);}catch{sourceSpec=undefined;}
          }
        }
        const validate=(value:unknown)=>{
          const parsed=parseDecisionOutcomeSpec(value),spec=options.normalizeOutcomeSpec?.(parsed)??parsed;
          compileDecisionOutcomeSpec(spec);options.validateOutcomeSpec?.(spec);return spec;
        };
        const recovered=await revalidateDurableStageDraft({name:'process-outcome-spec',input:frozenInput,
          state:options.state,compatibleInputs,validate});
        const spec=recovered??await runDurableStage({name:'process-outcome-spec',system:DECISION_OUTCOME_SPEC_PROMPT,
          input:{request:options.request,authoringPolicy:'typed-outcome-v1',
            ...(options.request.outcomeContract?{outcomeContract:options.request.outcomeContract}:{}),
            ...(sourceSpec?{sourceSpec,repairInstruction:'保留这份已经付费的完整领域草稿，只修复原文中被误写为固定属性的实时条件及依赖公式；按outcomeContract逐项核对，不从头编写新的设备事实或教学机制。返回修正后的完整结果模型。'}:{})},
          checkpointInput:frozenInput,reuseFromInputs:compatibleInputs,aiCall:options.aiCall,state:options.state,
          stage:{stage:'process-scene'},maxAttempts:2,maxTotalAttempts:2,validate});
        return JSON.stringify(compileDecisionOutcomeSpec(spec));
      }:options.aiCall;
      draft=await runDurableStage({name:'process-cohesive-domain',system:options.system,
        input,
        aiCall:domainCall,state:options.state,stage:{stage:'process-scene'},
        maxAttempts:1,maxTotalAttempts:2,validate:value=>draftSchema.parse(value)});
    }
    const {inputs,initialState,actions,decisions,interactionPlan}=draft;
    return JSON.stringify(packet.step==='process-state'?{inputs,initialState,...(interactionPlan?{interactionPlan}:{})}:{actions,decisions});
  };
}

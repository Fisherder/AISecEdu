import {durableStageFingerprint} from './durable-stage';
import type {GenerationStateStore} from './validated-stage';
import {parseCinematicJson} from '../cinematic/json';

/** A validator upgrade can make an already-paid draft usable. Revalidate
 * exact request identities before any new model call; never infer a pass. */
export async function revalidateDurableStageDraft<T>(options:{name:string;input:unknown;
 state?:GenerationStateStore;compatibleInputs?:unknown[];validate:(value:unknown)=>T}){
 if(!options.state)return;
 const key='workflow-'+options.name;
 const saved=options.state.read(key) as Record<string,unknown>|undefined;
 if(!saved||saved.output!==undefined)return;
 const fingerprint=durableStageFingerprint(options.name,options.input);
 const identities=[fingerprint,...(options.compatibleInputs??[]).map(input=>durableStageFingerprint(options.name,input))];
 if(typeof saved.fingerprint!=='string'||!identities.includes(saved.fingerprint))return;
 const drafts=[saved.previousOutput,...(Array.isArray(saved.draftHistory)?[...saved.draftHistory].reverse():[])];
 for(const draft of [...new Set(drafts)].filter((value):value is string=>typeof value==='string')){
  let output:T;try{output=options.validate(parseCinematicJson(draft).value);}catch{continue;}
  await options.state.write(key,{...saved,fingerprint,output,
   draftRecovery:{method:'revalidated-paid-draft',previousFingerprint:saved.fingerprint,newModelCalls:0}});
  return output;
 }
}

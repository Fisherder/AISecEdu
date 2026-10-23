import { createHash } from 'node:crypto';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import { parseCinematicScene, type CinematicScene } from './schema';

const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
/** Assembly matrix arithmetic can move an unchanged coordinate by a few
 * machine epsilons on each replay. Normalize only that numerical noise so
 * scene-addressed browser, semantic and learner checkpoints stay reusable.
 */
export function stabilizeCinematicScene(input:CinematicScene):CinematicScene{
 const stable=JSON.parse(JSON.stringify(input,(_key,value)=>
   typeof value==='number'&&Number.isFinite(value)?Number(value.toPrecision(12)):value));
 // Domain formulas, parameters and computed test values are not assembly
 // coordinates. Rounding them can turn a valid program into a false failure.
 if(input.lab)stable.lab=structuredClone(input.lab);
 return parseCinematicScene(stable);
}
/** Completed patches are durable drafts, never accepted/rendered receipts. */
export function cinematicGeometryCheckpoint(input:CinematicScene,context:unknown,requirements:unknown,state?:GenerationStateStore,namespace='cinematic-geometry',priorBindingInput?:CinematicScene){
 const stableInput=stabilizeCinematicScene(input);
 const fingerprint=createHash('sha256').update(canonical({version:'cinematic-geometry-resume-1',input:stableInput,context,requirements})).digest('hex');
 const legacyFingerprint=createHash('sha256').update(canonical({version:'cinematic-geometry-resume-1',input,context,requirements})).digest('hex');
 const earlierInput=JSON.parse(JSON.stringify(input,(_key,value)=>
   typeof value==='number'&&Number.isFinite(value)?Number(value.toPrecision(12)):value));
 const earlierFingerprint=createHash('sha256').update(canonical({version:'cinematic-geometry-resume-1',input:earlierInput,context,requirements})).digest('hex');
 if(!/^[a-z][a-z0-9-]{0,21}$/.test(namespace))throw Error('Invalid cinematic checkpoint namespace');
 const key=namespace+'-'+fingerprint.slice(0,40);
 // A semantic/learner repair must not overwrite the initial geometry stage.
 const prior=priorBindingInput?stabilizeCinematicScene(priorBindingInput):undefined;
 // Only wiring differs. Paid edits are drafts; all current gates rerun.
 const compatible=prior && canonical({...stableInput,lab:prior.lab})===canonical(prior) &&
   canonical(stableInput.lab?.model)===canonical(prior.lab?.model);
 const priorFingerprint=compatible?createHash('sha256').update(canonical({version:'cinematic-geometry-resume-1',input:prior,context,requirements})).digest('hex'):undefined;
 const saved=(state?.read(key)??state?.read(namespace+'-'+legacyFingerprint.slice(0,40))??
   state?.read(namespace+'-'+earlierFingerprint.slice(0,40))??
   (priorFingerprint?state?.read(namespace+'-'+priorFingerprint.slice(0,40)):undefined)??state?.read(namespace)) as {version?:number;fingerprint?:string;scene?:unknown;repairs?:number}|undefined;
 let scene=stableInput,repairs=0,resumed=false;
 if(saved?.fingerprint===fingerprint||saved?.fingerprint===legacyFingerprint||saved?.fingerprint===earlierFingerprint||priorFingerprint!==undefined&&saved?.fingerprint===priorFingerprint){
   if(saved.version!==1||!Number.isInteger(saved.repairs)||saved.repairs!<0||saved.repairs!>64)throw Error('Invalid cinematic geometry checkpoint');
   const candidate=parseCinematicScene(saved.scene);
   // Restore exact original domain data only when the saved data is precisely
   // its old rounded copy. A real saved domain edit remains authoritative.
   if(input.lab&&canonical(candidate.lab)===canonical(earlierInput.lab))candidate.lab=structuredClone(input.lab);
   scene=stabilizeCinematicScene(candidate);repairs=saved.repairs!;resumed=true;
 }
 return{key,scene,resumed,async save(candidate:CinematicScene,appliedPatch=false){
   const next=stabilizeCinematicScene(candidate);
   if(appliedPatch)repairs++;
   if(repairs>64)throw Error('Cinematic geometry repair budget exhausted without acceptance');
   await state?.write(key,{version:1,fingerprint,scene:next,repairs});
 }};
}

import gateValve from './reference-scenes/gate-valve.json';
import {parseCinematicScene} from './schema';

const gate=parseCinematicScene(gateValve.scene);

/** Reuse only physical geometry, not a past lesson, formulas or narration.
 * An intact cutaway valve supports opening and leakage-risk decisions; a
 * requested fracture, disassembly or extra device still needs new geometry. */
export function cinematicMechanismStructure(request:Record<string,unknown>,objectives:string[],requiredObjects:string[]=[]){
  const text=[request.originalRequest,request.description].filter(value=>typeof value==='string').join('\n');
  if(!/闸阀|gate\s*valve/i.test(text)||!/闸板|阀芯|gate/i.test(text)||!/流道|流向|flow/i.test(text))return;
  if(/裂纹|断裂|破裂|碎片|拆卸|拆解|液滴|喷射|泄漏路径|多台|多阀|(?:两|二|三|四|五|六|[2-9])\s*(?:台|个|只)\s*闸阀|fracture|crack|disassembl|droplet|jet|multiple\s*valve/i.test(text))return;
  const supported=/^(?:阀体|闸板|阀芯(?:（闸板）)?|阀杆|流道|流向(?:标记)?|闸阀|valve\s*body|gate|stem|flow\s*(?:path|direction))$/i;
  if(requiredObjects.some(name=>!supported.test(name)))return;
  const {schemaVersion,tracks,shots,chapters,coverage,learnerControls,lab,...physical}=structuredClone(gate);
  const title=typeof request.title==='string'&&request.title.trim()?request.title.trim():gate.title;
  return {id:'cutaway-gate-valve-structure-v1',structure:{...physical,title,
    subtitle:'观察阀体、闸板、阀杆与流道，改变实验条件并比较不同处置方案的实际后果。',
    objectives:[...objectives]}};
}

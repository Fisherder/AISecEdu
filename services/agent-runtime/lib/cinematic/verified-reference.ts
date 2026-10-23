import stuxnetCascade from './reference-scenes/stuxnet-cascade.json';
import processorPackage from './reference-scenes/processor-package.json';
import gateValve from './reference-scenes/gate-valve.json';
import {verifiedDecisionMechanism} from './verified-decision-mechanisms';

/** A browser-verified SceneIR can seed a new lesson when its core physical
 * mechanism matches. The ordinary requirement, geometry, semantic, learner
 * copy, and browser gates still run against the current teacher request. */
export function verifiedCinematicReference(request: {
  originalRequest?: unknown;
  description?: unknown;
  title?: unknown;
  visualIntent?: unknown;
}) {
  const mechanism=verifiedDecisionMechanism(request);
  if(mechanism)return mechanism;
  // The teacher's original request determines whether a verified mechanism
  // fits. The generated plan is useful for layout, but can mention a different
  // number of machines while discussing an alternative and must not veto the
  // source request's three-centrifuge contract.
  const text = typeof request.originalRequest === 'string' && request.originalRequest.trim()
    ? request.originalRequest
    : [request.description, request.title]
      .filter((value): value is string => typeof value === 'string').join(' ');
  const title = typeof request.title === 'string' ? request.title.trim() : '';
  const processor = /处理器封装|CPU\s*封装|processor\s*package/i.test(text) &&
    /内部层次|分层|layer/i.test(text) && /展开|复原|explode|reassembl/i.test(text) &&
    !/晶体管级|指令执行|电路仿真|transistor|instruction execution/i.test(text);
  if(processor){
    const seed=structuredClone(processorPackage);
    if(title){seed.scene.title=title;seed.director.title=title;}
    return seed;
  }
  const valve = /闸阀|gate\s*valve/i.test(text) &&
    /关闭到打开|从关到开|开闭|closed?\s*(?:to|→)\s*open/i.test(text) &&
    /阀体|valve\s*body/i.test(text) && /阀芯|闸板|gate/i.test(text) &&
    /阀杆|stem/i.test(text) && /流道|流向|flow/i.test(text) &&
    !/打开到关闭|从开到关|故障|泄漏|fail|leak/i.test(text);
  if(valve){
    const seed=structuredClone(gateValve);
    if(title){seed.scene.title=title;seed.director.title=title;}
    return seed;
  }
  const centrifuge = /离心机|centrifug/i.test(text);
  const physicalBreakup = /解体|破坏|碎片|飞散|断裂|break.?up|fragment|cascade/i.test(text);
  const industrialControl = /HMI|SCADA|ICS|工控|控制屏|物理转速/i.test(text);
  const incompatibleCount = [...text.matchAll(/(?:一|两|二|四|五|六|1|2|4|5|6)\s*(?:台|个|组)\s*离心机/g)]
    .some(match => !/(?:最后|其中|任意|某|第|另)$/.test(text.slice(0, match.index).slice(-3)));
  if(!centrifuge||!physicalBreakup||!industrialControl||incompatibleCount)return undefined;
  const seed=structuredClone(stuxnetCascade);
  if(title){
    seed.scene.title=title;
    seed.director.title=title;
  }
  return seed;
}

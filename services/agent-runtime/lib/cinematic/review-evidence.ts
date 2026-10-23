import type { CinematicScene } from './schema';
import type {cinematicDomainLabEvidence} from './domain-lab-contract';
type DomainEvidence=NonNullable<ReturnType<typeof cinematicDomainLabEvidence>>;
const stateChanges=(state:Record<string,unknown>,base:Record<string,unknown>)=>
  Object.fromEntries(Object.entries(state).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(base[key])));

/** Store the frozen domain model once in scene, and keep every independently
 * computed witness as a lossless delta. Never substitute a different model or
 * remove an input/choice just because its result resembles another witness. */
export function packCinematicDomainReviewEvidence<T>(facts:T,scene:CinematicScene):T{
  const source=facts as Record<string,any>,lab=source?.learnerInteraction?.domainLab as DomainEvidence|undefined;
  if(!scene.lab||!lab||JSON.stringify(lab.model)!==JSON.stringify(scene.lab.model.scene)||
    JSON.stringify(lab.bindings)!==JSON.stringify(scene.lab.bindings))return facts;
  const fields=Object.keys(lab.model.initialState).sort().join('|');
  if(lab.decisions.some(decision=>Object.keys(decision.before).sort().join('|')!==fields||
    decision.alternatives.some(alternative=>Object.keys(alternative.state).sort().join('|')!==fields||
      alternative.bindings.length!==lab.bindings.length||alternative.bindings.some((binding,index)=>
        JSON.stringify({...binding,value:undefined})!==JSON.stringify({...lab.bindings[index],value:undefined})))))return facts;
  const {model:_model,bindings:_bindings,...rest}=lab;
  return {...source,learnerInteraction:{...source.learnerInteraction,domainLab:{...rest,
    evidenceEncoding:{version:'cinematic-domain-references-v1',
      model:'Read the complete model from scene.lab.model.scene; it is not omitted from the review packet.',
      bindings:'Read complete formulas and ordered node/property identities from scene.lab.bindings. bindingValues contains all computed numeric values in that exact order.',
      states:'Start at scene.lab.model.scene.initialState, overlay decision.beforeChanges, then overlay alternative.stateChanges to reconstruct its complete state. Inputs, paths, choices and every witness remain present.'},
    modelRef:'scene.lab.model.scene',bindingsRef:'scene.lab.bindings',
    decisions:lab.decisions.map(decision=>({decision:decision.decision,inputs:decision.inputs,path:decision.path,
      beforeChanges:stateChanges(decision.before,lab.model.initialState),
      alternatives:decision.alternatives.map(alternative=>({action:alternative.action,
        stateChanges:stateChanges(alternative.state,decision.before),bindingValues:alternative.bindings.map(binding=>binding.value)}))})),
  }}} as T;
}

/** Tests and diagnostic tools reconstruct the entire fact object to prove
 * that compaction changed neither formulas nor runtime evidence. */
export function unpackCinematicDomainReviewEvidence<T>(facts:T,scene:CinematicScene):T{
  const source=facts as Record<string,any>,lab=source?.learnerInteraction?.domainLab;
  if(lab?.evidenceEncoding?.version!=='cinematic-domain-references-v1')return facts;
  if(!scene.lab||lab.modelRef!=='scene.lab.model.scene'||lab.bindingsRef!=='scene.lab.bindings')
    throw Error('Domain evidence references do not resolve to the frozen scene');
  const {evidenceEncoding:_encoding,modelRef:_modelRef,bindingsRef:_bindingsRef,...rest}=lab;
  return {...source,learnerInteraction:{...source.learnerInteraction,domainLab:{...rest,
    model:scene.lab.model.scene,bindings:scene.lab.bindings,
    decisions:lab.decisions.map((decision:any)=>{
      const before={...scene.lab!.model.scene.initialState,...decision.beforeChanges};
      return {decision:decision.decision,inputs:decision.inputs,path:decision.path,before,
        alternatives:decision.alternatives.map((alternative:any)=>{
          if(alternative.bindingValues.length!==scene.lab!.bindings.length)throw Error('Incomplete domain binding values');
          return {action:alternative.action,state:{...before,...alternative.stateChanges},
            bindings:scene.lab!.bindings.map((binding,index)=>({...binding,value:alternative.bindingValues[index]}))};
        })};
    }),
  }}} as T;
}

/** Project already checked browser and world-space evidence into a concise
 * model review packet. The original inspection and chapter calculations stay
 * intact for deterministic validation and durable browser checkpoints. */
export function compactCinematicBrowserReviewEvidence<T>(evidence: T, scene?: CinematicScene): T {
  if (!evidence || typeof evidence !== 'object') return evidence;
  const source=evidence as Record<string, any>;
  if (!Array.isArray(source.frames)) return evidence;
  return {
    ...source,
    frames:source.frames.map((frame:any) => {
      const nodes=Array.isArray(frame.nodes)?frame.nodes:[];
      const focus = new Set<string>(
        typeof frame.chapter?.index === 'number'
          ? scene?.chapters[frame.chapter.index]?.focus ?? [] : [],
      );
      for (const node of scene?.nodes ?? []) {
        if (node.followConnection && node.followConnection.start <= frame.at &&
            frame.at <= node.followConnection.end) focus.add(node.id);
      }
      return {
        ...frame,
        nodeCount:nodes.length,
        visibleOtherIds:nodes.filter((node:any)=>!node.participatesInCameraFit &&
          typeof node.visibility?.visibleFraction==='number' &&
          node.visibility.visibleFraction>0.1 && node.coverage>0.001)
          .map((node:any)=>node.id),
        nodes:nodes.filter((node:any)=>node.participatesInCameraFit || focus.has(node.id)).map((node:any) => ({
          id:node.id,
          ...(node.participatesInCameraFit?{fitted:true}:{}),
          ...(focus.has(node.id)?{focused:true}:{}),
          ...(node.inside===false?{inside:false}:{}),
          coverage:node.coverage,
          ...(typeof node.visibility?.visibleFraction==='number'
            ? {visibleFraction:Number(node.visibility.visibleFraction.toFixed(3))}:{}),
          ...(typeof node.visibility?.status==='string'?{visibilityStatus:node.visibility.status}:{}),
          ...(node.participatesInCameraFit && Array.isArray(node.visibility?.blockers) &&
            node.visibility.blockers.length?{blockers:node.visibility.blockers}:{}),
        })),
      };
    }),
  } as T;
}

export function compactCinematicChapterEvidence<T>(chapters: T): T {
  if (!Array.isArray(chapters)) return chapters;
  // Connection metadata comes from the same immutable SceneIR in every chapter.
  // Keep each chapter's sampled world endpoints, but send repeated metadata once.
  const firstStaticConnection = new Map<string, {chapter:number; signature:string}>();
  return chapters.map((chapter:any, chapterIndex:number) => ({
    index:chapter.index,
    chapterNumber:chapter.chapterNumber,
    start:chapter.start,
    end:chapter.end,
    connectionDirections:Array.isArray(chapter.connectionDirections)
      ?chapter.connectionDirections.map((link:any)=>{
        const metadata={from:link.from,to:link.to,
          sourceObject:link.sourceObject,destinationObject:link.destinationObject,
          via:link.via,boundMarkers:link.boundMarkers,boundTubes:link.boundTubes};
        const signature=JSON.stringify(metadata);
        const first=firstStaticConnection.get(link.id);
        if(!first || first.signature!==signature)
          firstStaticConnection.set(link.id,{chapter:typeof chapter.index==='number'?chapter.index:chapterIndex,signature});
        return {id:link.id,
          ...(first?.signature===signature
            ?{staticFieldsFromChapter:first.chapter}:metadata),
          samples:Array.isArray(link.samples) && link.samples.length>2
            ?[link.samples[0],link.samples.at(-1)]:link.samples};
      }):[],
    entityCount:Array.isArray(chapter.entityMotion)?chapter.entityMotion.length:0,
    entityMotion:Array.isArray(chapter.entityMotion)
      ?chapter.entityMotion.filter((node:any)=>
        node.maxDistanceFromStart>0.01 || node.orientation?.maxAxisDirectionChange>0.01 ||
        (Array.isArray(node.samples) && node.samples.some((sample:any)=>
          sample.opacity!==node.samples[0]?.opacity)))
        .map((node:any)=>({
          id:node.id,parentChain:node.parentChain,inheritedTracks:node.inheritedTracks,
          coordinateSpace:node.coordinateSpace,
          maxDistanceFromStart:Number(node.maxDistanceFromStart.toFixed(4)),
          orientation:{maxAxisDirectionChange:Number(node.orientation.maxAxisDirectionChange.toFixed(4)),
            samples:Array.isArray(node.orientation.samples)
              ?[node.orientation.samples[0],node.orientation.samples.at(-1)]
                .filter((sample:any,index:number,all:any[])=>sample &&
                  (index===0 || sample.at!==all[0]?.at)).map((sample:any)=>({at:sample.at,axes:sample.axes,
                ...(sample.coneTip?{coneTip:sample.coneTip}:{})})):[]},
          samples:Array.isArray(node.samples) && node.samples.length>3
            ?[node.samples[0],node.samples[Math.floor(node.samples.length/2)],node.samples.at(-1)]
            :node.samples,
        })):[],
    trackCount:Array.isArray(chapter.tracks)?chapter.tracks.length:0,
    tracks:Array.isArray(chapter.tracks)
      ?chapter.tracks.filter((track:any)=>Array.isArray(track.samples) &&
        track.samples.some((sample:any)=>JSON.stringify(sample.value)!==
          JSON.stringify(track.samples[0]?.value)))
        .map((track:any)=>({
          trackIndex:track.trackIndex,path:track.path,target:track.target,
          property:track.property,
          samples:track.samples.length>5
            ?[0,.25,.5,.75,1].map(fraction=>track.samples[Math.round((track.samples.length-1)*fraction)])
              .filter((sample:any,index:number,all:any[])=>index===0 || sample.at!==all[index-1]?.at)
            :track.samples,
          ...(track.netTurnsXYZ?{netTurnsXYZ:track.netTurnsXYZ}:{}),
        })):[],
  })) as T;
}

export function compactCinematicReviewFacts<T>(facts:T,scene?:CinematicScene):T {
  if(!facts || typeof facts!=='object')return facts;
  const source=facts as Record<string,any>;
  if(!Array.isArray(source.rotation))return facts;
  const compact={...source,rotation:source.rotation.map((chapter:any)=>({
    chapter:chapter.chapter,start:chapter.start,end:chapter.end,
    inactiveTargets:chapter.tracks.filter((track:any)=>
      !track.available || !track.coordinateTrends?.some((axis:any)=>axis.maxAbsoluteRate>1e-6))
      .map((track:any)=>track.target),
    tracks:chapter.tracks.filter((track:any)=>track.available &&
      track.coordinateTrends?.some((axis:any)=>axis.maxAbsoluteRate>1e-6))
      .map((track:any)=>({target:track.target,units:track.units,easing:track.easing,
        coordinateTrends:track.coordinateTrends.filter((axis:any)=>axis.maxAbsoluteRate>1e-6)})),
  }))} as T;
  return scene?packCinematicDomainReviewEvidence(compact,scene):compact;
}

import type {CinematicScene} from './schema';
import type {cinematicLearnerEvidence} from '../server/cinematic-learner-copy';
type Evidence=ReturnType<typeof cinematicLearnerEvidence>;
const different=(value:Record<string,unknown>,base:Record<string,unknown>)=>Object.fromEntries(
  Object.entries(value).filter(([key,item])=>JSON.stringify(item)!==JSON.stringify(base[key])));

/** Lossless references for repeated source evidence, never output truncation.
 * Complete tracks, formulas, object facts and all witnesses remain present. */
export function packCinematicLearnerEvidence(source:Evidence,scene:CinematicScene){
  const rotations:unknown[]=[];const rotationIndex=new Map<string,number>();
  const chapters=source.chapters.map(chapter=>({...chapter,timelineEvidence:{
    scope:chapter.timelineEvidence.scope,
    changingTracks:chapter.timelineEvidence.changingTracks.map(track=>{
      const index=scene.tracks.findIndex(item=>item.target===track.target&&item.property===track.property);
      if(index<0)throw Error('Evidence track is missing');
      let angularMotionRef:number|undefined;
      if(track.angularMotion){
        const key=JSON.stringify(track.angularMotion);angularMotionRef=rotationIndex.get(key);
        if(angularMotionRef===undefined){angularMotionRef=rotations.length;rotationIndex.set(key,angularMotionRef);rotations.push(track.angularMotion);}
      }
      return {target:track.target,property:track.property,trackIndex:index,
        ...(angularMotionRef===undefined?{}:{angularMotionRef}),
        changes:track.changes.map(change=>{
          const from=scene.tracks[index].keyframes.findIndex(key=>JSON.stringify(key)===JSON.stringify(change.keyframeFrom));
          const to=scene.tracks[index].keyframes.findIndex(key=>JSON.stringify(key)===JSON.stringify(change.keyframeTo));
          if(from<0||to!==from+1)throw Error('Evidence keyframe is missing');
          return {activeFrom:change.activeFrom,activeUntil:change.activeUntil,fromKeyframe:from,toKeyframe:to};
        })};
    }),unchangedTracks:chapter.timelineEvidence.unchangedTracks,
  }}));
  const lab=source.domainLab;
  const {domainLab:_fullLab,...base}=source;
  return {...base,chapters,sharedRotationEvidence:rotations,
    evidenceEncoding:{version:'cinematic-learner-references-v1',
      tracks:'changingTracks.trackIndex refers to scene.tracks; fromKeyframe/toKeyframe refer to its complete keyframes array. activeFrom/activeUntil are the intersected chapter interval.',
      rotation:'angularMotionRef refers to sharedRotationEvidence, with all interval rates retained.',
      states:'domainLab.decisions.beforeChanges overlays model.initialState; each alternative.stateChanges overlays that decision before-state. No unchanged field is removed from the source model.',
      bindings:'alternative.bindingValues follows domainLab.bindings order; use each declared node/property with its corresponding numeric value.'},
    ...(lab?{domainLab:{...lab,decisions:lab.decisions.map(decision=>({
      decision:decision.decision,inputs:decision.inputs,path:decision.path,
      beforeChanges:different(decision.before,lab.model.initialState),
      alternatives:decision.alternatives.map(alternative=>({action:alternative.action,
        stateChanges:different(alternative.state,decision.before),
        bindingValues:alternative.bindings.map(binding=>binding.value)})),
    }))}}:{}),
  };
}

/** The round-trip is also used by tests to prove no evidence was discarded. */
export function unpackCinematicLearnerEvidence(packet:ReturnType<typeof packCinematicLearnerEvidence>):Evidence{
  const {evidenceEncoding:_encoding,sharedRotationEvidence:rotations,...source}=packet;
  const chapters=packet.chapters.map(chapter=>({...chapter,timelineEvidence:{
    scope:chapter.timelineEvidence.scope,
    changingTracks:chapter.timelineEvidence.changingTracks.map(track=>({
      target:track.target,property:track.property,
      ...(track.angularMotionRef===undefined?{}:{angularMotion:rotations[track.angularMotionRef]}),
      changes:track.changes.map(change=>({activeFrom:change.activeFrom,activeUntil:change.activeUntil,
        keyframeFrom:packet.tracks[track.trackIndex].keyframes[change.fromKeyframe],
        keyframeTo:packet.tracks[track.trackIndex].keyframes[change.toKeyframe]})),
    })),unchangedTracks:chapter.timelineEvidence.unchangedTracks,
  }}));
  const lab=packet.domainLab;
  return {...source,chapters,...(lab?{domainLab:{...lab,decisions:lab.decisions.map(decision=>{
    const before={...lab.model.initialState,...decision.beforeChanges};
    return {decision:decision.decision,inputs:decision.inputs,path:decision.path,before,
      alternatives:decision.alternatives.map(alternative=>({action:alternative.action,
        state:{...before,...alternative.stateChanges},
        bindings:lab.bindings.map((binding,index)=>({...binding,value:alternative.bindingValues[index]})),
      }))};
  })}}:{})} as Evidence;
}

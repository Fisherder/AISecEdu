import type {CinematicScene} from './schema';
import {cinematicControlEvidence, type CinematicRenderInspection} from './render-client';
import {cinematicRotationEvidence} from './rotation-evidence';
import {cinematicPlayerControlIds} from './player-controls';
import {cinematicInteractionManifest} from './interaction-manifest';
import {cinematicDomainLabEvidence} from './domain-lab-contract';

/** An explicit runtime card keeps reviewers from confusing a student
 * experiment with the movie's prerecorded chapters. Every result below
 * comes from the actual browser buttons/engine, not author prose. */
export function cinematicDomainRuntimeCard(scene:CinematicScene,evidence?:CinematicRenderInspection['evidence']){
  if(!scene.lab)return undefined;
  const model=scene.lab.model.scene;
  return {
    reviewSemanticsVersion:'wrapped-phase-and-independent-learning-modes-v4',
    scope:'separate-student-experiment-not-movie-tracks',
    interpretation:'Movie chapters/tracks/browserFrames demonstrate watch mode. Student decisions, conditions, undo and comparison run in the separate compiled experiment below. They do not require extra movie chapters, mesh buttons or SceneIR tracks. A single domain object may represent a group of existing 3D components; it does not require an extra empty mesh group.',
    inputs:model.inputs.map(input=>({id:input.id,label:input.label,type:input.type,mode:input.mode,
      ...(input.type==='select'?{options:input.options}:{}),...(['range','number'].includes(input.type)?{min:input.min,max:input.max,step:input.step}: {})})),
    decisions:model.decisions?.map(decision=>({id:decision.id,prompt:decision.prompt,
      choices:decision.choices.map(id=>({id,label:model.actions.find(action=>action.id===id)?.label})),observe:decision.observe})),
    visibleReadings:model.views.filter(view=>view.kind==='value').map(view=>({title:view.title,value:view.value})),
    browserExperiments:evidence?.domainDecisions?.map(decision=>({id:decision.id,sameCheckpoint:decision.sameCheckpoint,
      comparisonRows:decision.comparisonRows,alternatives:decision.alternatives.map(alternative=>({
        choice:alternative.action,readings:alternative.values,observationTime:alternative.observationTime,
        ...(alternative.motion?{actualMotion:{...alternative.motion,
          angleRepresentation:'wrapped local Euler phases in radians; decreasing phase does not prove reversed rotation',
          nodes:alternative.motion.nodes.map(node=>({...node,
            expectedUnwrappedDisplacementRadians:node.radiansPerSecond*(alternative.motion!.to-alternative.motion!.from),
            expectedTurns:node.radiansPerSecond*(alternative.motion!.to-alternative.motion!.from)/(2*Math.PI),
            sampledWorldPhaseAgreement:node.worldAngleValidated}))}}:{}),
        actualBindings:alternative.bindings,canvasSha256:alternative.canvasSha256}))}))??null,
    browserProofInterpretation:'sameCheckpoint/comparisonRows are actual undo and visible comparison tests in experiment mode; watch-mode seek buttons cannot invalidate this measured experiment checkpoint. actualMotion samples the real object at 0.25 and 0.5 observation seconds, checks local rotation, static ancestors and the world transform. Before/after Euler angles are wrapped phases modulo 2π, not cumulative angles; positive velocity can produce a smaller final phase after multiple forward turns. expectedUnwrappedDisplacementRadians is the binding law displacement, sampledWorldPhaseAgreement is the actual browser orientation check. Radians per second are the displayed domain quantity, not rpm or a one-off angle. A zero-speed choice stops; initial paused movies do not disprove experiment motion. Null browserExperiments means unverified.',
  };
}

/** Small, computed protocol facts. Never a receipt for scientific or visual quality. */
export function cinematicReviewFacts(scene:CinematicScene,evidence?:CinematicRenderInspection['evidence']){
  return {
    reviewSemanticsVersion:'wrapped-phase-and-independent-learning-modes-v4',
    scope:'computed-protocol-and-coordinate-facts-not-scientific-or-aesthetic-acceptance',
    playback:{
      implementation:'built-in-player-DOM-not-SceneIR-meshes-or-tracks',
      elements:{...cinematicPlayerControlIds},
      browserCheck:evidence ? cinematicControlEvidence(evidence.controls) : null,
      interpretation:'Missing scene tracks for play, pause, seek, quality or orbit is not a missing control. BrowserCheck null means unverified, false means failed; do not invent successful interaction evidence.',
    },
    learnerInteraction:{
      controls:scene.learnerControls,
      manifest:cinematicInteractionManifest(scene),
      ...(scene.lab?{domainLab:cinematicDomainLabEvidence(scene),browserDomainDecisions:evidence?.domainDecisions}:{}),
      interpretation:'Range controls deterministically seek their declared timeRange and expose feedback bands. Buttons call the same player actions as the built-in controls. The manifest lists actual compiled selectors and supported postMessage actions; it does not claim a physics solver or an external device connection.',
    },
    rotation:scene.chapters.map((chapter,index)=>({chapter:index,start:chapter.at,end:scene.chapters[index+1]?.at??scene.duration,
      tracks:scene.tracks.filter(t=>t.property==='rotation').map(track=>{
        const evidence=cinematicRotationEvidence(scene,track.target,chapter.at,scene.chapters[index+1]?.at??scene.duration);
        if (!evidence) return {target: track.target, available: false, reason: 'no-positive-duration-rotation-interval'};
        return {target:track.target,units:evidence.units,easing:evidence.easing,coordinateTrends:evidence.coordinateTrends};
      }),
    })),
    interpretation:[
      'SceneIR rotation keyframes are absolute local Euler angles in radians, NOT angular velocities. A 28-radian keyframe is not 28 rad/s. Read the computed coordinate rates below to judge slowdown or stopping. Returning angle to zero can rotate backward; a constant nonzero angle is stopped.',
      'Experiment rotation uses initial angle + displayed velocity * observation time, normalized modulo 2π. A smaller wrapped Euler phase is not backward motion; read velocity, expected displacement and actual sampled world phase agreement. Watch-mode track angles and experiment phases have different representations.',
      'Transform parenting does not inherit a mesh entity material opacity. A transparent housing leaves separately authored rotor/gate materials independently visible. Only explicit kind=group opacity fades all descendants. Actual browser material and ray evidence remain authoritative.',
      'Movie chapters are successive examples, not a single persistent domain experiment. A later example can show another branch after a stopped example; it does not mean the earlier emergency stop restarts by itself. Only an explicit claim of continuous shared state creates that requirement.',
      'Domain binding emissive is clamped to 0..10, opacity to 0..1, scale to 0.05..5, and positionY/rotationSpeedY to -200..200. A value above 4 is not an invalid emissive value. These bounds are implementation facts, not proof that any gauge scale, causal model or visual design is correct.',
      'Domain value views render current numeric readings in the experiment panel; fixed 3D surfaceText can label a gauge without itself changing. Require a dynamic 3D numeral only when the teacher or copy specifically promises that numeral. Live domain inputs and movie-seek ranges are separate controls in different modes and need not share ranges.',
      'speedDecreases counts decreases in absolute coordinate rate. directionReversals counts changes of sign. Slowing down does not require reversing. These summaries do not establish real physical operating limits or visual salience.',
      'emissive changes material brightness, not surfaceText characters or displayed numeric values. A brightness change cannot by itself prove that a reading changes; fixed text is fixed unless chapterTitle is bound.',
      'A world bounding box is filled conservatively, even for a hollow housing. Box overlap with an internal part is not mesh collision. Check actual cavity dimensions, transforms, visibility and the requested assembly.',
      'frame.nodes controls camera fitting, not visibility. A process can occur during part of a chapter; no rule requires all nodes and all tracks to remain visible for its entire duration.',
      'Explicit positions are supported. Not using a port/path binding is not itself a defect. Report an actual endpoint, orientation or path mismatch, with evidence; a binding also does not prove scientific correctness.',
    ],
  };
}

import { parseCinematicScene, type CinematicScene } from './schema';
import { checkCinematicQuality, type CinematicQualityOptions } from './quality';
import type { CinematicRenderInspection, CinematicRenderInspector } from './render-client';
import {corners, enclosing, worldBounds, worldNodes, type WorldNode} from './assembly';

const recoverable = new Set(['occluded-focus', 'focus-outside-frame', 'focus-clipped']);
const key = (issue: CinematicRenderInspection['issues'][number]) =>
  JSON.stringify([issue.code, issue.at, [...issue.nodes].sort()]);

// Use the actual decision screenshots/rays to open a static support cutaway.
// A closed enclosing box cannot be fixed by rotating the camera repeatedly.
// Preserve the model, bindings, geometry and movie, and verify the new pixels.
export async function recoverCinematicDomainOccluders(base:CinematicScene,
  baseline:CinematicRenderInspection,inspect:CinematicRenderInspector,options:CinematicQualityOptions={}) {
  const blockers=new Set<string>(),definitions=new Map(base.nodes.map(node=>[node.id,node]));
  if(!baseline.issues.some(issue=>issue.code==='domain-decision-consequence'))
    return {scene:base,inspection:baseline,transparentOccluders:[] as string[]};
  const animated=new Set([...base.tracks.map(track=>track.target),...(base.lab?.bindings.map(binding=>binding.node)??[])]);
  for(const decision of baseline.evidence.domainDecisions??[]){
    const worlds=worldNodes(base,decision.alternatives[0]?.observationTime??0);
    const targets=new Set((base.lab?.bindings??[]).filter(binding=>new Set(decision.alternatives.map(alternative=>
      JSON.stringify((alternative.bindings as any[]).find(b=>b.node===binding.node&&b.property===binding.property)?.value))).size>1).map(binding=>binding.node));
    for(const id of targets){
      const samples=decision.alternatives.map(alternative=>(alternative.geometry as any[]).find(node=>node.id===id));
      if(samples.some(node=>node?.visibility?.method!=='mesh-rays-v1'||node.visibility.status!=='sampled'||
        node.visibility.samples<3||node.visibility.visibleSamples!==0))continue;
      for(const sample of samples)for(const blocker of sample.visibility.blockers??[]){
        const shell=definitions.get(blocker.id);
        if(!shell||shell.role!=='support'||shell.kind!=='box'||shell.surfaceText||shell.opacity<=.5)continue;
        let node=definitions.get(id),descendant=false,staticShell=true;
        while(node?.parent){if(node.parent===shell.id)descendant=true;node=definitions.get(node.parent);}
        node=shell;while(node){if(animated.has(node.id))staticShell=false;node=node.parent?definitions.get(node.parent):undefined;}
        const targetWorld=worlds.get(id),shellWorld=worlds.get(shell.id);
        const targetBounds=targetWorld&&worldBounds(targetWorld),shellBounds=shellWorld&&worldBounds(shellWorld);
        const enclosed=targetBounds&&shellBounds&&[0,1,2].every(axis=>
          targetBounds.min[axis]>shellBounds.min[axis]+1e-6&&targetBounds.max[axis]<shellBounds.max[axis]-1e-6);
        if((descendant||enclosed)&&staticShell)blockers.add(shell.id);
      }
    }
  }
  if(!blockers.size)return {scene:base,inspection:baseline,transparentOccluders:[] as string[]};
  const candidate=structuredClone(base);
  for(const node of candidate.nodes)if(blockers.has(node.id))node.opacity=.18;
  const scene=parseCinematicScene(candidate);
  if(checkCinematicQuality(scene,options).status!=='PASS')return {scene:base,inspection:baseline,transparentOccluders:[] as string[]};
  const inspection=await inspect(scene),existing=new Set(baseline.issues.map(key));
  if(inspection.issues.length>=baseline.issues.length||inspection.issues.some(issue=>!existing.has(key(issue))))
    return {scene:base,inspection:baseline,transparentOccluders:[] as string[]};
  return {scene,inspection,transparentOccluders:[...blockers]};
}

// A crop can be mathematically valid while covering the empty gap between
// two machines. Restore the offending shot's full subjects and their physical
// context; retain every focus node, then verify the actual new frame once.
export async function recoverCinematicOffscreenDetailFrames(base:CinematicScene,
  baseline:CinematicRenderInspection,inspect:CinematicRenderInspector,options:CinematicQualityOptions={}) {
  const candidate=structuredClone(base),changedShots:number[]=[];
  const definitions=new Map(candidate.nodes.map(node=>[node.id,node]));
  for(const issue of baseline.issues){
    if(issue.code!=='tiny-subject'||issue.at===undefined)continue;
    const frames=baseline.evidence.frames.filter(frame=>frame.at===issue.at);
    if(!frames.some(frame=>issue.nodes.some(id=>{
      const nodes=Array.isArray(frame.diagnostics.nodes)?frame.diagnostics.nodes:[];
      const node=nodes.find(node=>node.id===id);
      return node?.inside===false&&node.coverage===0;
    })))continue;
    const shot=candidate.shots.findLast(shot=>shot.at<=issue.at!);
    if(!shot?.frame?.region||changedShots.includes(shot.at))continue;
    const ancestors=new Set<string>();
    for(const id of issue.nodes){
      let parent=definitions.get(id)?.parent;
      while(parent&&!ancestors.has(parent)){ancestors.add(parent);parent=definitions.get(parent)?.parent;}
    }
    const context=[...ancestors].filter(id=>definitions.get(id)?.kind!=='group'&&definitions.get(id)?.role==='primary');
    const worlds=worldNodes(candidate,shot.at);
    for(const ancestor of ancestors){
      if(definitions.get(ancestor)?.kind!=='group')continue;
      const siblings=candidate.nodes.filter(node=>node.parent===ancestor&&node.kind!=='group'&&node.role==='primary')
        .map(node=>{
          const world=worlds.get(node.id),bounds=world?worldBounds(world):undefined;
          const volume=bounds?bounds.max.reduce((product,high,axis)=>product*Math.max(0,high-bounds.min[axis]),1):0;
          return {id:node.id,volume};
        }).sort((a,b)=>b.volume-a.volume);
      // One enclosing body supplies context for a group. Do not add every
      // sibling part and overflow the authored frame's node contract.
      if(siblings[0])context.push(siblings[0].id);
    }
    shot.frame={nodes:[...new Set([...shot.frame.nodes,...issue.nodes,...context])],padding:Math.max(1.25,shot.frame.padding)};
    changedShots.push(shot.at);
  }
  if(!changedShots.length)return {scene:base,inspection:baseline,changedShots};
  let scene:CinematicScene;
  try{scene=parseCinematicScene(candidate);}catch{return {scene:base,inspection:baseline,changedShots:[] as number[]};}
  if(checkCinematicQuality(scene,options).status!=='PASS')return {scene:base,inspection:baseline,changedShots:[] as number[]};
  const inspection=await inspect(scene);
  if(inspection.issues.length>=baseline.issues.length)return {scene:base,inspection:baseline,changedShots:[] as number[]};
  return {scene,inspection,changedShots};
}

// A multi-machine frame can make every rotor too small even when no subject
// is clipped. Crop around one real model for that shot; subsequent authored
// shots still show the other machines. The inspector verifies actual pixels.
export async function recoverCinematicTinySubjects(base: CinematicScene,
  baseline: CinematicRenderInspection, inspect: CinematicRenderInspector,
  options: CinematicQualityOptions = {}) {
  const failures = baseline.issues.filter(issue => issue.code === 'tiny-subject' && Number.isFinite(issue.at));
  if (!failures.length) return {scene: base, inspection: baseline, changedShots: [] as number[]};
  const candidate = structuredClone(base);
  const changedShots: number[] = [];
  for (const failure of failures) {
    const index = candidate.shots.findLastIndex(shot => shot.at <= failure.at!);
    const shot = candidate.shots[index];
    const frame = shot?.frame;
    if (!shot || !frame || changedShots.includes(shot.at) || frame.nodes.length < 2) continue;
    const focusId = failure.nodes.find(id => frame.nodes.includes(id));
    if (!focusId) continue;
    const worlds = worldNodes(candidate, shot.at);
    const subjects = frame.nodes.map(id => worlds.get(id))
      .filter((node): node is WorldNode => !!node && node.opacity > 0.05);
    const focus = worlds.get(focusId);
    if (!focus || subjects.length < 2) continue;
    const all = enclosing(subjects.flatMap(node => corners(worldBounds(node))));
    const focused = worldBounds(focus);
    const region = {center: [0,0,0] as [number,number,number], size: [1,1,1] as [number,number,number]};
    for (let axis = 0; axis < 3; axis++) {
      const extent = Math.max(1e-6, all.max[axis] - all.min[axis]);
      let low = Math.max(-.5, (focused.min[axis] - all.min[axis]) / extent - .54);
      let high = Math.min(.5, (focused.max[axis] - all.min[axis]) / extent - .46);
      if (high - low < .15) {
        const middle = (high + low) / 2;
        low = Math.max(-.5, Math.min(middle - .075, .35));
        high = low + .15;
      }
      region.center[axis] = (low + high) / 2;
      region.size[axis] = high - low;
    }
    frame.region = region;
    changedShots.push(shot.at);
  }
  if (!changedShots.length) return {scene: base, inspection: baseline, changedShots};
  let scene: CinematicScene;
  try {scene = parseCinematicScene(candidate);} catch {
    return {scene: base, inspection: baseline, changedShots: [] as number[]};
  }
  if (checkCinematicQuality(scene, options).status !== 'PASS')
    return {scene: base, inspection: baseline, changedShots: [] as number[]};
  const inspection = await inspect(scene);
  const existing = new Set(baseline.issues.map(key));
  if (inspection.issues.length >= baseline.issues.length || inspection.issues.some(issue => !existing.has(key(issue))))
    return {scene: base, inspection: baseline, changedShots: [] as number[]};
  return {scene, inspection, changedShots};
}

// A close-up can outlive its chapter: the next chapter starts before the next
// shot, leaving a clipped detail region framing the wrong subjects. Give the
// new chapter its own full-subject shot and accept it only after real rendering.
export async function recoverCinematicChapterFrame(base: CinematicScene, baseline: CinematicRenderInspection,
  inspect: CinematicRenderInspector, options: CinematicQualityOptions = {},
) {
  const failures = baseline.issues.filter(issue =>
    ['detail-region-unverified', 'clipped-subject'].includes(issue.code) && Number.isFinite(issue.at));
  const chapter = failures.map(issue => base.chapters.find(item => item.at === issue.at))
    .find((item): item is CinematicScene['chapters'][number] => !!item);
  if (!chapter || base.shots.some(shot => shot.at === chapter.at))
    return {scene: base, inspection: baseline, changedShot: false};
  const previous = [...base.shots].reverse().find(shot => shot.at < chapter.at);
  if (!previous?.frame?.region) return {scene: base, inspection: baseline, changedShot: false};
  const focus = chapter.focus.filter(id => base.nodes.some(node => node.id === id));
  if (!focus.length) return {scene: base, inspection: baseline, changedShot: false};
  const candidate = structuredClone(base);
  candidate.shots.push({...structuredClone(previous), at: chapter.at,
    frame: {nodes: focus, padding: Math.max(1.2, previous.frame.padding)}});
  candidate.shots.sort((a, b) => a.at - b.at);
  let scene: CinematicScene;
  try {scene = parseCinematicScene(candidate);} catch {
    return {scene: base, inspection: baseline, changedShot: false};
  }
  if (checkCinematicQuality(scene, options).status !== 'PASS')
    return {scene: base, inspection: baseline, changedShot: false};
  const inspection = await inspect(scene);
  const existing = new Set(baseline.issues.map(key));
  if (inspection.issues.length >= baseline.issues.length || inspection.issues.some(issue => !existing.has(key(issue))))
    return {scene: base, inspection: baseline, changedShot: false};
  return {scene, inspection, changedShot: true};
}

function sameTubePath(scene: CinematicScene, focusId: string, blockerId: string) {
  const focus = scene.nodes.find(node => node.id === focusId);
  const blocker = scene.nodes.find(node => node.id === blockerId);
  if (focus?.kind !== 'tube' || blocker?.kind !== 'tube' || !focus.points || !blocker.points ||
      focus.points.length !== blocker.points.length) return false;
  return focus.points.every((point, index) => point.every((value, axis) =>
    Math.abs(value - blocker.points![index][axis]) <= 1e-6));
}

function cameraCanResolve(scene: CinematicScene, baseline: CinematicRenderInspection,
  issue: CinematicRenderInspection['issues'][number]) {
  const focusId = issue.nodes[0];
  if (!focusId || !Number.isFinite(issue.at)) return true;
  const frame = baseline.evidence.frames.find(frame => frame.at === issue.at);
  const diagnostic = Array.isArray(frame?.diagnostics.nodes)
    ? frame.diagnostics.nodes.find((node: {id?: string}) => node.id === focusId) : undefined;
  const blockers: string[] = Array.isArray(diagnostic?.visibility?.blockers)
    ? diagnostic.visibility.blockers.map((item: {id?: unknown}) => item.id).filter((id: unknown): id is string => typeof id === 'string') : [];
  return !blockers.some(blockerId => sameTubePath(scene, focusId, blockerId));
}

export async function recoverCinematicCamera(base: CinematicScene, baseline: CinematicRenderInspection,
  inspect: CinematicRenderInspector, options: CinematicQualityOptions = {},
) {
  const failures = baseline.issues.filter(issue => recoverable.has(issue.code) && Number.isFinite(issue.at) &&
    cameraCanResolve(base, baseline, issue));
  if (!failures.length) return {scene: base, inspection: baseline, probes: 0, changedShots: [] as number[], transparentOccluders: [] as string[]};
  const affected = new Set<number>();
  for (const failure of failures) {
    let index = base.shots.findLastIndex(shot => shot.at <= failure.at!);
    index = Math.max(0, index);
    affected.add(index);
    if (index + 1 < base.shots.length && failure.at! > base.shots[index].at) affected.add(index + 1);
  }
  const existing = new Set(baseline.issues.map(key));
  let best = {scene: base, inspection: baseline, probes: 0, changedShots: [] as number[], transparentOccluders: [] as string[]};
  for (const [yaw, elevation] of [[Math.PI / 3, 0], [-Math.PI / 3, 0], [0, 1.4]]) {
    const candidate = structuredClone(base);
    for (const index of affected) {
      const shot = candidate.shots[index];
      const [x, y, z] = shot.position.map((value, axis) => value - shot.target[axis]);
      const radius = Math.hypot(x, z);
      shot.position = [shot.target[0] + x * Math.cos(yaw) - z * Math.sin(yaw),
        shot.target[1] + y + radius * elevation, shot.target[2] + x * Math.sin(yaw) + z * Math.cos(yaw)];
    }
    let scene: CinematicScene;
    try {scene = parseCinematicScene(candidate);} catch {continue;}
    if (checkCinematicQuality(scene, options).status !== 'PASS') continue;
    const inspection = await inspect(scene);
    best.probes++;
    if (inspection.issues.length < best.inspection.issues.length && inspection.issues.every(issue => existing.has(key(issue))))
      best = {scene, inspection, probes: best.probes, changedShots: [...affected].sort((a, b) => a - b), transparentOccluders: []};
    if (!best.inspection.issues.length) break;
  }
  // A static foreground shell can be shown transparently when no camera
  // reaches the focus. Never fade a teaching focus, its ancestors, a moving
  // part, or an object that has an explicit opacity timeline. This is an
  // actual rendered candidate, followed by the same semantic/source review.
  const protectedIds = new Set(base.chapters.flatMap(chapter => chapter.focus));
  for (const id of [...protectedIds]) {
    let node = base.nodes.find(node => node.id === id);
    while (node?.parent) { protectedIds.add(node.parent); node = base.nodes.find(n => n.id === node!.parent); }
  }
  const animated = new Set(base.tracks.map(track => track.target));
  for (const node of base.nodes) {
    let current: typeof node | undefined = node;
    while (current) {
      if (animated.has(current.id)) { animated.add(node.id); break; }
      current = base.nodes.find(parent => parent.id === current!.parent);
    }
  }
  const blockers = new Set<string>();
  const transparentTeachingShells = new Set<string>();
  for (const frame of best.inspection.evidence.frames) {
    const chapter = [...base.chapters].reverse().find(chapter => chapter.at <= frame.at);
    const nodes = Array.isArray(frame.diagnostics.nodes) ? frame.diagnostics.nodes : [];
    for (const node of nodes) {
      const visibility = node.visibility;
      if (!chapter?.focus.includes(node.id) || visibility?.method !== 'mesh-rays-v1' || visibility.status !== 'sampled' || visibility.samples < 3 || visibility.visibleSamples !== 0) continue;
      for (const blocker of Array.isArray(visibility.blockers) ? visibility.blockers : []) {
        if (typeof blocker.id !== 'string' || animated.has(blocker.id)) continue;
        if (!protectedIds.has(blocker.id)) {
          blockers.add(blocker.id);
          continue;
        }
        // A static support conduit can itself be a teaching focus while hiding a
        // moving logic marker inside it. Keeping every focus opaque makes a
        // correct cutaway impossible (for example, flow particles inside a
        // pipe). The shell remains rendered at 18% opacity and the complete
        // scene is inspected again, so this exception cannot hide a failed
        // primary subject or accept an unverified camera workaround.
        const focus = base.nodes.find(candidate => candidate.id === node.id);
        const shell = base.nodes.find(candidate => candidate.id === blocker.id);
        const movingLogic = focus?.role === 'logic' && base.tracks.some(track => track.target === focus.id && track.property === 'position');
        const staticSupportShell = shell?.role === 'support' && ['cylinder', 'tube', 'model'].includes(shell.kind) && !shell.surfaceText;
        if (movingLogic && staticSupportShell) {
          blockers.add(blocker.id);
          transparentTeachingShells.add(blocker.id);
        }
      }
    }
  }
  const candidates = best.scene.nodes.filter(node => blockers.has(node.id) &&
    (!protectedIds.has(node.id) || transparentTeachingShells.has(node.id)) &&
    node.kind !== 'group' && (!node.surfaceText ||
      ['logic','decoration'].includes(node.role??'')&&['box','plane'].includes(node.kind)) &&
    node.opacity > 0.2).slice(0, 6);
  if (best.inspection.issues.length && candidates.length) {
    const candidate = structuredClone(best.scene);
    const ids = candidates.map(node => node.id);
    for (const node of candidate.nodes) if (ids.includes(node.id)) node.opacity = 0.18;
    const scene = parseCinematicScene(candidate);
    if (checkCinematicQuality(scene, options).status === 'PASS') {
      const inspection = await inspect(scene); best.probes++;
      if (inspection.issues.length < best.inspection.issues.length && inspection.issues.every(issue => existing.has(key(issue))))
        best = {...best, scene, inspection, transparentOccluders: ids};
    }
  }
  return best;
}

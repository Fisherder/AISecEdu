import {parseCinematicScene, type CinematicScene} from './schema';
import {checkCinematicQuality, type CinematicQualityOptions, type CinematicQualityReport} from './quality';

const errorKey = (issue: CinematicQualityReport['issues'][number]) =>
  JSON.stringify([issue.code, issue.at, [...issue.nodes].sort()]);

/** Restore a visible teaching camera when the scene has the required objects
 * but a chapter's shot still frames another part of the animation. Every
 * candidate is rechecked; this never changes geometry, coverage or tracks. */
export function recoverCinematicStructuralFrames(base: CinematicScene,
  baseline: CinematicQualityReport, options: CinematicQualityOptions = {}) {
  let scene = base;
  let quality = baseline;
  const changedShots: number[] = [];
  const tryShot = (shot: CinematicScene['shots'][number]) => {
    if (scene.shots.some(existing => Math.abs(existing.at - shot.at) < 0.01)) return;
    const candidate = structuredClone(scene);
    candidate.shots.push(shot);
    candidate.shots.sort((a,b) => a.at - b.at);
    let parsed: CinematicScene;
    try {parsed = parseCinematicScene(candidate);} catch {return;}
    const rechecked = checkCinematicQuality(parsed, options);
    const before = quality.issues.filter(issue => issue.severity === 'error');
    const after = rechecked.issues.filter(issue => issue.severity === 'error');
    const existing = new Set(before.map(errorKey));
    if (after.length >= before.length || after.some(issue => !existing.has(errorKey(issue)))) return;
    scene = parsed;
    quality = rechecked;
    changedShots.push(shot.at);
  };

  for (const evidence of baseline.interactionEvidence) {
    if (evidence.status !== 'FAIL' || evidence.kind !== 'view') continue;
    for (const mapping of scene.coverage?.interactions.filter(item =>
      item.description === evidence.description) ?? []) {
      const chapter = scene.chapters[mapping.chapter];
      const end = scene.chapters[mapping.chapter + 1]?.at ?? scene.duration;
      if (!chapter || end - chapter.at < 0.8 || !mapping.targets.length) continue;
      const at = chapter.at + (end - chapter.at) * 0.6;
      const reference = scene.shots.find(shot => shot.at >= end) ??
        [...scene.shots].reverse().find(shot => shot.at <= chapter.at);
      if (!reference) continue;
      tryShot({...structuredClone(reference), at,
        frame: {nodes: [...mapping.targets], padding: Math.max(1.2, reference.frame?.padding ?? 1.2)}});
      if (quality.interactionEvidence.some(item => item.description === evidence.description && item.status === 'PASS')) break;
    }
  }

  for (const issue of baseline.issues) {
    if (issue.severity !== 'error' || issue.code !== 'chapter-observation-without-evidence' ||
      !Number.isFinite(issue.at)) continue;
    const chapter = scene.chapters.find(item => item.at === issue.at);
    if (!chapter?.focus.length) continue;
    const reference = [...scene.shots]
      .filter(shot => !shot.frame?.region)
      .sort((a,b) => chapter.focus.filter(id => b.frame?.nodes.includes(id)).length -
        chapter.focus.filter(id => a.frame?.nodes.includes(id)).length)[0];
    if (!reference) continue;
    tryShot({...structuredClone(reference), at: chapter.at,
      frame: {nodes: [...chapter.focus], padding: Math.max(1.25, reference.frame?.padding ?? 1.25)}});
  }
  return {scene, quality, changedShots};
}

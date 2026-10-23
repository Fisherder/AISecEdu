import {valueAt} from './assembly';
import {checkCinematicQuality, type CinematicQualityOptions} from './quality';
import {parseCinematicScene, type CinematicScene} from './schema';

// A chapter must keep its named teaching focus visible even while a damaged
// parent shell fades. Only authored opacity tracks in that chapter are raised;
// all geometry, motion, other chapters and source requirements stay intact.
export function recoverCinematicFocusOpacity(base: CinematicScene,
  quality = checkCinematicQuality(base), options: CinematicQualityOptions = {}) {
  const failures = quality.issues.filter(issue =>
    issue.code === 'chapter-focus-invisible' && issue.severity === 'error' && Number.isFinite(issue.at));
  if (!failures.length) return {scene: base, quality, changedNodes: [] as string[]};
  const candidate = structuredClone(base);
  const changed = new Set<string>();
  for (const failure of failures) {
    const chapterIndex = base.chapters.findIndex(chapter => chapter.at === failure.at);
    if (chapterIndex < 0) continue;
    const at = base.chapters[chapterIndex].at;
    const until = base.chapters[chapterIndex + 1]?.at ?? base.duration;
    if (until <= at) continue;
    for (const focusId of base.chapters[chapterIndex].focus) {
      let node = base.nodes.find(item => item.id === focusId);
      while (node) {
        const source = base.tracks.find(track => track.target === node!.id && track.property === 'opacity');
        const track = candidate.tracks.find(track => track.target === node!.id && track.property === 'opacity');
        if (source && track) {
          const floor = 0.55;
          const boundary = (time: number) => {
            const existing = track.keyframes.find(frame => frame.at === time);
            const value = Math.max(floor, valueAt(base, node!, 'opacity', time) as number);
            if (existing) existing.value = Math.max(Number(existing.value), value);
            else track.keyframes.push({at: time, value});
          };
          boundary(at);
          boundary(until);
          for (const frame of track.keyframes)
            if (frame.at > at && frame.at < until) frame.value = Math.max(Number(frame.value), floor);
          track.keyframes.sort((left, right) => left.at - right.at);
          changed.add(node.id);
        }
        node = node.parent ? base.nodes.find(item => item.id === node!.parent) : undefined;
      }
    }
  }
  if (!changed.size) return {scene: base, quality, changedNodes: [] as string[]};
  let scene: CinematicScene;
  try {scene = parseCinematicScene(candidate);} catch {
    return {scene: base, quality, changedNodes: [] as string[]};
  }
  const checked = checkCinematicQuality(scene, options);
  const errors = quality.issues.filter(issue => issue.severity === 'error');
  const nextErrors = checked.issues.filter(issue => issue.severity === 'error');
  const original = new Set(errors.map(issue => JSON.stringify([issue.code, issue.at, issue.nodes])));
  if (nextErrors.length >= errors.length ||
      nextErrors.some(issue => !original.has(JSON.stringify([issue.code, issue.at, issue.nodes]))))
    return {scene: base, quality, changedNodes: [] as string[]};
  return {scene, quality: checked, changedNodes: [...changed]};
}

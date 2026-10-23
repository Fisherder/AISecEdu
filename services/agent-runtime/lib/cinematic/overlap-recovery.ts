import { resolveCinematicAssembly } from './assembly';
import { checkCinematicQuality, type CinematicQualityOptions, type CinematicQualityReport } from './quality';
import { parseCinematicScene, type CinematicScene } from './schema';

/** A small hinge relocation is cheaper and more reliable than regenerating a
 * complete scene when a rotating child clips another object. The normal scene
 * and browser gates still have to pass after this bounded search. */
export function recoverCinematicPivotOverlap(
  scene: CinematicScene, report: CinematicQualityReport, options: CinematicQualityOptions,
): {scene: CinematicScene; quality: CinematicQualityReport; pivot: string; offset: [number, number, number]} | undefined {
  const errors = report.issues.filter(issue => issue.severity === 'error');
  if (!errors.length || errors.length > 8 || errors.some(issue => issue.code !== 'geometry-overlap'))
    return undefined;
  const byId = new Map(scene.nodes.map(node => [node.id, node]));
  const pivots = [...new Set(errors.flatMap(issue => issue.nodes.flatMap(id => {
    let node = byId.get(id);
    while (node?.parent) {
      node = byId.get(node.parent);
      if (node?.kind === 'group' && scene.tracks.some(track => track.target === node!.id && track.property === 'rotation') &&
          !scene.tracks.some(track => track.target === node!.id && track.property === 'position') &&
          !scene.assembly?.placements.some(placement => placement.node === node!.id)) return [node.id];
    }
    return [];
  })))].slice(0, 2);
  for (const pivot of pivots) {
    for (const amount of [.5, .25, 1]) {
      for (const axis of [2, 0] as const) {
        for (const sign of [-1, 1]) {
          const offset: [number, number, number] = [0, 0, 0];
          offset[axis] = amount * sign;
          const candidate = structuredClone(scene);
          const moving = candidate.nodes.find(node => node.id === pivot)!;
          moving.position[axis] += offset[axis];
          try {
            const assembled = resolveCinematicAssembly(candidate);
            const parsed = parseCinematicScene(assembled.scene);
            const quality = checkCinematicQuality(parsed, options);
            if (quality.status === 'PASS') return {scene: parsed, quality, pivot, offset};
          } catch {
            // This direction is not a valid scene; try the next bounded offset.
          }
        }
      }
    }
  }
  return undefined;
}

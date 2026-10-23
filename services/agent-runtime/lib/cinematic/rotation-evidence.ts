import { valueAt } from './assembly';
import type { CinematicScene } from './schema';

export function cinematicRotationEvidence(
  scene: CinematicScene,
  target: string,
  start: number,
  end: number,
) {
  const node = scene.nodes.find(item => item.id === target);
  const track = scene.tracks.find(item => item.target === target && item.property === 'rotation');
  if (!node || !track || end <= start) return undefined;
  const times = [...new Set([start, end, ...track.keyframes.map(key => key.at)
    .filter(at => at > start && at < end)])].sort((a, b) => a - b);
  const angle = (at: number) => valueAt(scene, node, 'rotation', at) as number[];
  const rate = (from: number, to: number) => {
    const initial = angle(from);
    return angle(to).map((value, axis) => Number(((value - initial[axis]) / (to - from)).toFixed(6)) || 0);
  };
  const intervals = times.slice(1).map((to, index) => {
    const from=times[index],span=to-from;
    return {from,to,meanRateXYZ:rate(from,to),...(track.easing==='smooth'?{rateSamples:[.25,.5,.75].map(fraction=>{
      const at=from+span*fraction,delta=span/10000;
      return {at,rateXYZ:rate(at-delta,at+delta)};
    })}:{})};
  });
  const coordinateTrends = ['x','y','z'].map((axis,index)=>{
    const rates=intervals.flatMap(interval=>interval.rateSamples?.map(sample=>sample.rateXYZ[index])??[interval.meanRateXYZ[index]]);
    const nonzero=rates.filter(value=>Math.abs(value)>1e-6),signs=nonzero.map(Math.sign);
    const changes=rates.slice(1).map((value,i)=>Math.abs(value)-Math.abs(rates[i]));
    return {axis,rateSigns:[...new Set(signs)],speedIncreases:changes.filter(value=>value>1e-6).length,
      speedDecreases:changes.filter(value=>value< -1e-6).length,
      directionReversals:signs.slice(1).filter((sign,i)=>sign!==signs[i]).length,
      minAbsoluteRate:Math.min(...rates.map(Math.abs)),maxAbsoluteRate:Math.max(...rates.map(Math.abs))};
  });
  return {
    scope: 'local-euler-coordinate-rates-not-physical-solver-or-world-angular-velocity',
    units: 'radians-per-scene-second',
    easing: track.easing,
    coordinateTrends,
    interpretation: 'speedDecreases>0 proves decreasing magnitude of sampled coordinate rate, not reversal; directionReversals is separate. Only a fixed single-axis rotor may interpret that rate as spin speed; this is not a physical solver.',
    intervals,
  };
}

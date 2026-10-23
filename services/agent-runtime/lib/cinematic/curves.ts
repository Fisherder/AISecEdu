import { z } from 'zod';

// The generator specifies a shape, not a guessed list of coordinates. This is
// deliberately geometry-only: no expressions, scripts or physics claims.
export const cinematicCurveSchema = z.object({
  type: z.literal('helix'),
  axis: z.enum(['x', 'y', 'z']).default('y'),
  radius: z.number().finite().positive().max(25),
  height: z.number().finite().positive().max(50),
  turns: z.number().finite().min(0.25).max(8),
  phase: z.number().finite().min(-2 * Math.PI).max(2 * Math.PI).default(0),
  handedness: z.enum(['right', 'left']).default('right'),
  segments: z.number().int().min(8).max(127).optional(),
}).strict().superRefine((curve, context) => {
  if (curve.segments !== undefined && curve.segments < Math.ceil(curve.turns * 12))
    context.addIssue({ code: 'custom', path: ['segments'], message: 'A helix requires at least 12 segments per turn.' });
});
export type CinematicCurve = z.infer<typeof cinematicCurveSchema>;
type Vec3 = [number, number, number];

export function cinematicCurvePoints(input: CinematicCurve): Vec3[] {
  const curve = cinematicCurveSchema.parse(input);
  const segments = curve.segments ?? Math.max(48, Math.ceil(curve.turns * 15));
  const sign = curve.handedness === 'right' ? 1 : -1;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const angle = curve.phase + sign * t * Math.PI * 2 * curve.turns;
    const u = curve.radius * Math.cos(angle), v = curve.radius * Math.sin(angle);
    const height = curve.height * (t - 0.5);
    // In each oriented basis u × v points along the positive helix axis.
    if (curve.axis === 'x') return [height, u, v];
    if (curve.axis === 'z') return [u, v, height];
    return [u, height, -v];
  });
}

export function cinematicCurveEvidence(nodes: Array<{ id: string; kind: string; curve?: CinematicCurve; points?: Vec3[] }>) {
  const analytic = nodes.filter(node => node.curve).map(node => ({
    id: node.id,
    coordinateSpace: 'local-before-parent-transform',
    method: 'analytic-helix-v1',
    ...node.curve,
    pointCount: node.points?.length ?? 0,
    pitch: node.curve!.height / node.curve!.turns,
    note: 'Mathematical curve only; not atom-resolved chemistry or an electromechanical solver. Positive scales and rotations preserve handedness.',
  }));
  const sampled = nodes.filter(node => node.kind === 'tube' && !node.curve && (node.points?.length ?? 0) >= 6).map(node => {
    const points = node.points!;
    const minimum = [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis])));
    const maximum = [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis])));
    const spans = maximum.map((value, axis) => value - minimum[axis]);
    const axis = spans.indexOf(Math.max(...spans));
    const uAxis = (axis + 1) % 3, vAxis = (axis + 2) % 3;
    const center = minimum.map((value, index) => (value + maximum[index]) / 2);
    const angles = points.map(point => Math.atan2(point[vAxis] - center[vAxis], point[uAxis] - center[uAxis]));
    const radii = points.map(point => Math.hypot(point[uAxis] - center[uAxis], point[vAxis] - center[vAxis]));
    const advances = angles.slice(1).map((angle, index) => Math.atan2(Math.sin(angle - angles[index]), Math.cos(angle - angles[index])));
    const total = advances.reduce((sum, advance) => sum + advance, 0);
    const absolute = advances.reduce((sum, advance) => sum + Math.abs(advance), 0);
    const axialAdvance = points.at(-1)![axis] - points[0][axis];
    const axialTravel = points.slice(1).reduce((sum, point, index) => sum + Math.abs(point[axis] - points[index][axis]), 0);
    return {
      id: node.id,
      coordinateSpace: 'local-before-parent-transform',
      method: 'polyline-axis-estimate-v1',
      assumedAxis: ['x', 'y', 'z'][axis],
      radiusRange: [Math.min(...radii), Math.max(...radii)],
      signedTurnsAlongPositiveAxis: total * Math.sign(axialAdvance) / (Math.PI * 2),
      windingConsistency: absolute > 1e-9 ? Math.abs(total) / absolute : 0,
      axialMonotonicity: axialTravel > 1e-9 ? Math.abs(axialAdvance) / axialTravel : 0,
      note: 'Estimate about the longest AABB axis and radial AABB center, NOT proof of a helix. Sparse points, off-axis curves or partial turns can invalidate this inference. Positive winding means right-handed about the assumed positive axis. Inspect points and relationships before asserting scientific structure.',
    };
  });
  return [...analytic, ...sampled];
}

export const CINEMATIC_CURVE_BRIEF = `规则螺旋不要逐点猜坐标。tube或points节点顶层可用curve:{type:"helix",axis:"x|y|z",radius:正数且<=25,height:正数且<=50,turns:0.25..8,phase:弧度且-2π..2π,handedness:"right|left",segments?:8..127}；默认axis=y、phase=0、handedness=right，分段数至少每圈12段。服务端确定性生成最多128个顶层points；curve存在时它是唯一几何真值，修改curve即可重建points，不能同时通过手改points改变曲线。改为自由曲线须先remove curve。沿正轴前进的right遵循右手旋转，两条等半径/高度/圈数/旋向但phase相差π的曲线始终对应且不交叉。此能力适用于弹簧、绕组和规则螺旋路径，不自动生成横档、原子、线圈电磁过程或相反的链方向；需要的重复部件仍须实际构建，或使用包含完整结构的匹配精细模型。`;

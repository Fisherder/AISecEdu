import { assetDefinition } from './asset-definitions';
import { validateCinematicDomainLab } from './domain-lab-contract';
import { cinematicDomainChanges } from './experiment-architecture';
import { cinematicHardwareGeometryIssues } from './hardware-geometry';
import { cinematicPlayerControlNames, type CinematicPlayerControl } from './player-controls';
import {
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  unit,
  transformPoint,
  transformDirection,
  inverse,
  compose,
  multiply,
  corners,
  enclosing,
  center,
  worldNodes,
  worldBounds,
  localBounds,
  valueAt,
  catalogFor,
  bindCinematicConnectionPaths,
  type Vector3,
  type WorldNode,
  type Bounds,
} from './assembly';
import type { CinematicScene, CinematicNode } from './schema';
import {
  hasCinematicPresentationContent,
  type CinematicPresentationRequirement,
} from './presentation';

export interface CinematicQualityIssue {
  code: string;
  severity: 'error' | 'warning';
  nodes: string[];
  at?: number;
  message: string;
  suggestion: string;
}
export interface CinematicQualityOptions {
  requireComposition?: boolean;
  requiredObjects?: string[];
  requiredInteractions?: string[];
  interactionRequirements?: CinematicInteractionRequirement[];
  requiredPresentation?: CinematicPresentationRequirement[];
}
export interface CinematicInteractionRequirement {
  description: string;
  kind: 'view' | 'structural-change' | 'state-change' | 'transport' | 'player-control';
  controls?: CinematicPlayerControl[];
}
type InteractionMapping = NonNullable<CinematicScene['coverage']>['interactions'][number];
type TrackProperty = CinematicScene['tracks'][number]['property'];
export type CinematicInteractionFailureReason =
  | 'coverage-missing'
  | 'no-associated-track'
  | 'no-mapped-track'
  | 'no-visible-mapped-track'
  | 'no-kind-compatible-track'
  | 'no-visible-mapped-connection'
  | 'explore-not-process'
  | 'target-not-visible'
  | 'controls-not-view-evidence'
  | 'player-control-contract-mismatch'
  | 'legacy-property-unfulfilled'
  | 'property-not-mapped'
  | 'property-not-kind-evidence'
  | 'decoration-target'
  | 'no-rendered-target'
  | 'unsupported-action'
  | 'not-visible-in-chapter'
  | 'hidden-at-all-samples'
  | 'insufficient-visible-samples'
  | 'no-change-in-chapter'
  | 'change-below-threshold'
  | 'no-change-while-visible'
  | 'visible-change-below-threshold';
export interface CinematicInteractionFailureDiagnostics {
  version: 'interaction-failure-v1';
  visibilityBasis: 'existing-quality-samples-not-raster';
  motionSource: 'scene-tracks-only';
  chapterIndexBase: 0;
  reasons: CinematicInteractionFailureReason[];
  omittedMappings: number;
  mappings: Array<{
    coverageIndex: number;
    chapter: number;
    start: number;
    end: number;
    targets: string[];
    properties: InteractionMapping['properties'];
    controls: CinematicPlayerControl[];
    requestedControls: CinematicPlayerControl[];
    invisibleTargets: string[];
    associatedTrackCount: number;
    mappedTrackCount: number;
    visibleMappedTrackCount: number;
    visibleMappedConnections: string[];
    reasons: CinematicInteractionFailureReason[];
    omittedTracks: number;
    tracks: Array<{
      trackIndex: number;
      target: string | null;
      property: TrackProperty;
      propertyMapped: boolean;
      kindCompatible: boolean;
      sampleCount: number;
      visibleSampleCount: number;
      opacityEligibleSampleCount: number;
      coordinateSpace: 'world' | 'track-value';
      magnitude: number;
      visibleMagnitude: number;
      worldMagnitude?: number;
      visibleWorldMagnitude?: number;
      threshold: number;
      visibleThreshold: number;
      supported: boolean;
      meetsChangeThreshold: boolean;
      visibleChangeAccepted: boolean;
      otherVisibleChangeChapters: number[];
      omittedChapters: number;
      reasons: CinematicInteractionFailureReason[];
    }>;
  }>;
}
export interface CinematicInteractionEvidence {
  description: string;
  kind: CinematicInteractionRequirement['kind'] | 'legacy-untyped';
  status: 'PASS' | 'FAIL' | 'LEGACY_UNTYPED';
  chapter?: number;
  tracks: string[];
  connections: string[];
  controls?: CinematicPlayerControl[];
  diagnostics?: CinematicInteractionFailureDiagnostics;
  domain?: ReturnType<typeof cinematicDomainChanges>;
}
export interface CinematicQualityReport {
  version: 'cinematic-geometry-v1';
  status: 'PASS' | 'FAIL';
  method: 'catalog-bounds-and-track-sampling';
  visualReview: 'NOT_PERFORMED';
  policyVersion: 'cinematic-quality-2026-09-12.3';
  runtimeValidation: 'REQUIRED';
  interactionEvidence: CinematicInteractionEvidence[];
  limitations: string[];
  checks: string[];
  issues: CinematicQualityIssue[];
  sampledTimes: number[];
  aspects: number[];
  metrics: {
    teachingNodes: number;
    detailedModels: number;
    relations: number;
    drawCalls: number;
    triangles: number;
  };
  chapters: Array<{
    index: number;
    at: number;
    end: number;
    kind: 'action' | 'inspection' | 'summary';
    visibleChanges: string[];
    visibleConnections: string[];
  }>;
}

const drawable = (node: CinematicNode) =>
  (node.kind === 'points'
    ? node.role === 'primary' && (node.points?.length ?? 0) >= 3
    : !['group', 'plane'].includes(node.kind) && node.role !== 'decoration');
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
const mixVector = (a: Vector3, b: Vector3, f: number) =>
  a.map((v, i) => mix(v, b[i], f)) as Vector3;
const volume = (bounds: Bounds) =>
  Math.max(0, bounds.max[0] - bounds.min[0]) *
  Math.max(0, bounds.max[1] - bounds.min[1]) *
  Math.max(0, bounds.max[2] - bounds.min[2]);

function shotAt(scene: CinematicScene, time: number) {
  let index = 0;
  while (index + 1 < scene.shots.length && scene.shots[index + 1].at <= time) index++;
  const a = scene.shots[index],
    b = scene.shots[Math.min(index + 1, scene.shots.length - 1)];
  let f = a === b ? 0 : (time - a.at) / (b.at - a.at);
  f *= f * (3 - 2 * f);
  let frame = a.frame;
  if (frame && b.frame && (frame.region || b.frame.region) && JSON.stringify(frame.nodes) === JSON.stringify(b.frame.nodes)) {
    const initial = frame.region ?? { center: [0, 0, 0] as Vector3, size: [1, 1, 1] as Vector3 };
    const final = b.frame.region ?? { center: [0, 0, 0] as Vector3, size: [1, 1, 1] as Vector3 };
    frame = { ...frame, region: { center: mixVector(initial.center, final.center, f), size: mixVector(initial.size, final.size, f) } };
  }
  return {
    position: mixVector(a.position, b.position, f),
    target: mixVector(a.target, b.target, f),
    fov: mix(a.fov, b.fov, f),
    frame,
  };
}

export function cameraForQuality(scene: CinematicScene, time: number, aspect = 16 / 9) {
  const shot = shotAt(scene, time),
    worlds = worldNodes(scene, time);
  let position = shot.position,
    target = shot.target;
  const direction = unit(sub(position, target));
  let right = unit(cross([0, 1, 0], direction));
  if (length(right) < 0.01) right = [1, 0, 0];
  const up = unit(cross(direction, right)),
    tangent = Math.tan((shot.fov * Math.PI) / 360);
  const subjects = (shot.frame?.nodes ?? [])
    .map((id) => worlds.get(id))
    .filter((node): node is WorldNode => !!node && node.opacity > 0.05);
  if (subjects.length) {
    let bounds = enclosing(subjects.flatMap((node) => corners(worldBounds(node))));
    if (shot.frame?.region) {
      const extent = sub(bounds.max, bounds.min), midpoint = center(bounds), region = shot.frame.region;
      bounds = {
        min: midpoint.map((value, axis) => value + extent[axis] * (region.center[axis] - region.size[axis] / 2)) as Vector3,
        max: midpoint.map((value, axis) => value + extent[axis] * (region.center[axis] + region.size[axis] / 2)) as Vector3,
      };
    }
    target = center(bounds);
    let distance = 3;
    for (const corner of corners(bounds)) {
      const delta = sub(corner, target),
        depth = dot(delta, direction),
        padding = shot.frame!.padding;
      distance = Math.max(
        distance,
        depth + (Math.abs(dot(delta, right)) * padding) / (tangent * aspect),
        depth + (Math.abs(dot(delta, up)) * padding) / tangent,
        depth + 0.2,
      );
    }
    position = add(target, scale(direction, distance));
  } else position = add(target, scale(sub(position, target), Math.max(1, 16 / 9 / aspect)));
  return { position, target, right, up, forward: scale(direction, -1), tangent, aspect };
}

function projection(world: WorldNode, camera: ReturnType<typeof cameraForQuality>) {
  const points = corners(localBounds(world.node, world.explode)).map((p) =>
    transformPoint(world.matrix, p),
  );
  const projected = points.map((p) => {
    const delta = sub(p, camera.position),
      depth = dot(delta, camera.forward);
    return [
      dot(delta, camera.right) / (Math.max(0.001, depth) * camera.tangent * camera.aspect),
      dot(delta, camera.up) / (Math.max(0.001, depth) * camera.tangent),
      depth,
    ] as Vector3;
  });
  const bounds = enclosing(projected),
    width = Math.max(0, Math.min(1, bounds.max[0]) - Math.max(-1, bounds.min[0])),
    height = Math.max(0, Math.min(1, bounds.max[1]) - Math.max(-1, bounds.min[1]));
  const area = (width * height) / 4;
  const visible = world.opacity >= 0.12 && bounds.max[2] > 0.1 && area > 0.0002;
  return {
    bounds,
    area,
    visible,
    clipped:
      bounds.min[2] <= 0.1 ||
      bounds.min[0] < -1.03 ||
      bounds.max[0] > 1.03 ||
      bounds.min[1] < -1.03 ||
      bounds.max[1] > 1.03,
  };
}

function related(scene: CinematicScene, a: string, b: string): boolean {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const ancestor = (child: string, parent: string): boolean => {
    let id: string | undefined = child;
    while (id) {
      if (id === parent) return true;
      id = nodes.get(id)?.parent;
    }
    return false;
  };
  return ancestor(a, b) || ancestor(b, a);
}

function overlapFraction(a: WorldNode, b: WorldNode) {
  const first = corners(localBounds(a.node)).map((p) => transformPoint(a.matrix, p));
  const second = corners(localBounds(b.node)).map((p) => transformPoint(b.matrix, p));
  const edge = (w: WorldNode) =>
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ].map((axis) => unit(transformDirection(w.matrix, axis as Vector3)));
  const ea = edge(a),
    eb = edge(b),
    axes = [
      ...ea.map((_, i) => cross(ea[(i + 1) % 3], ea[(i + 2) % 3])),
      ...eb.map((_, i) => cross(eb[(i + 1) % 3], eb[(i + 2) % 3])),
      ...ea.flatMap((x) => eb.map((y) => cross(x, y))),
    ];
  let minimum = 1;
  for (const candidate of axes) {
    if (length(candidate) < 1e-6) continue;
    const axis = unit(candidate),
      x = first.map((p) => dot(p, axis)),
      y = second.map((p) => dot(p, axis));
    const lo = Math.max(Math.min(...x), Math.min(...y)),
      hi = Math.min(Math.max(...x), Math.max(...y));
    if (hi - lo <= 0.015) return 0;
    minimum = Math.min(
      minimum,
      (hi - lo) /
        Math.max(0.001, Math.min(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y))),
    );
  }
  return minimum;
}

function trackChangeThreshold(property: TrackProperty, worldDiagonal = 0) {
  const thresholds = {
    position: Math.max(0.12, worldDiagonal * 0.04),
    rotation: 0.12,
    scale: 0.12,
    opacity: 0.18,
    emissive: 0.25,
    explode: 0.12,
  };
  return thresholds[property];
}

export function checkCinematicQuality(
  scene: CinematicScene,
  options: CinematicQualityOptions = {},
): CinematicQualityReport {
  const strict = options.requireComposition !== false;
  const issues: CinematicQualityIssue[] = [],
    issueKeys = new Set<string>();
  const issue = (
    code: string,
    nodes: string[],
    message: string,
    suggestion: string,
    at?: number,
    severity: 'error' | 'warning' = 'error',
  ) => {
    const key = `${code}:${nodes.join(',')}:${code.startsWith('chapter') ? at : ''}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({
      code,
      severity,
      nodes,
      ...(at === undefined ? {} : { at }),
      message,
      suggestion,
    });
  };
  let domainEvidence: ReturnType<typeof validateCinematicDomainLab> = [];
  try {domainEvidence=validateCinematicDomainLab(scene);} catch (error) {
    issue('domain-decision',[],error instanceof Error ? error.message : String(error),
      '局部修复lab中的领域动作、可见证据或三维绑定；保留主体几何与镜头。');
  }
  const teaching = scene.nodes.filter(drawable),
    models = teaching.filter((node) => node.kind === 'model');
  for(const hardware of cinematicHardwareGeometryIssues(scene))
    issue(hardware.code,hardware.nodes,hardware.message,hardware.suggestion,hardware.at,hardware.severity);
  const relations =
    (scene.assembly?.placements.length ?? 0) + teaching.filter((node) => node.parent).length;
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const snapshots = new Map<number, Map<string, WorldNode>>();
  const cameras = new Map<number, ReturnType<typeof cameraForQuality>>();
  const snapshot = (time: number) => {
    if (!snapshots.has(time)) snapshots.set(time, worldNodes(scene, time));
    return snapshots.get(time)!;
  };
  const cameraAt = (time: number) => {
    if (!cameras.has(time)) cameras.set(time, cameraForQuality(scene, time));
    return cameras.get(time)!;
  };
  const descendant = (child: string, ancestor: string): boolean => {
    let id: string | undefined = child;
    while (id) {
      if (id === ancestor) return true;
      id = nodes.get(id)?.parent;
    }
    return false;
  };
  const renderedTargets = (id: string): string[] => {
    const node = nodes.get(id)!;
    // Instrument faces are real meshes, while the detailed-subject floor
    // still excludes planes. Their visibility remains a browser requirement.
    const instrumentSurface=node.kind==='plane'&&['support','logic'].includes(node.role??'')&&
      /HMI|仪表|表盘|刻度|显示屏|数值屏|读数屏|screen|readout|dial|gauge/i.test([node.id,node.represents,node.label].join(' '))&&
      ((!!node.surfaceText?.lines.length)||
        (!!node.parent&&renderedTargets(node.parent).length>0)||
        (scene.coverage?.objects??[]).some(object=>object.nodes.includes(node.id)));
    return node.kind === 'group'
      ? teaching.filter((child) => descendant(child.id, id)).map((child) => child.id)
      : drawable(node)||instrumentSurface
        ? [id]
        : [];
  };
  const targetVisible = (id: string, time: number): boolean =>
    renderedTargets(id).some((actualId) => {
      const world = snapshot(time).get(actualId)!;
      if (world.opacity < 0.12) return false;
      const frame = shotAt(scene, time).frame;
      return (
        !!frame?.nodes.some((framedId) => descendant(actualId, framedId)) ||
        projection(world, cameraAt(time)).visible
      );
    });
  const timesFor = (start: number, end: number, track?: CinematicScene['tracks'][number]) => {
    const keys = [
      start,
      ...(track ? [track] : scene.tracks)
        .flatMap((track) => track.keyframes.map((key) => key.at))
        .filter((at) => at > start && at < end),
      end,
    ].sort((a, b) => a - b);
    const unique = [...new Set(keys)];
    return [
      ...new Set(
        unique.flatMap((at, index) =>
          index + 1 < unique.length
            ? [at, ...[0.25, 0.5, 0.75].map((f) => at + (unique[index + 1] - at) * f)]
            : [at],
        ),
      ),
    ];
  };
  const measureTrack = (
    track: CinematicScene['tracks'][number],
    times: number[],
    visibleOnly = false,
  ) => {
    const node = nodes.get(track.target)!;
    if (track.property !== 'position') {
      const values = times.map((time) => valueAt(scene, node, track.property, time));
      const magnitude = Math.max(
        0,
        ...values.flatMap((a) =>
          values.map((b) =>
            Array.isArray(a) ? length(sub(a, b as Vector3)) : Math.abs(a - (b as number)),
          ),
        ),
      );
      return {
        coordinateSpace: 'track-value' as const,
        magnitude,
        threshold: trackChangeThreshold(track.property),
      };
    }
    const samples = times.map((time) => {
      const worlds = snapshot(time);
      const subjects =
        node.kind === 'group'
          ? renderedTargets(node.id).filter((id) => !visibleOnly || targetVisible(id, time))
          : [node.id];
      const bounds = subjects.length
        ? enclosing(subjects.flatMap((id) => corners(worldBounds(worlds.get(id)!))))
        : undefined;
      return {
        positions: new Map(
          subjects.map((id) => [id, transformPoint(worlds.get(id)!.matrix, [0, 0, 0])]),
        ),
        local: valueAt(scene, node, 'position', time) as Vector3,
        parent: node.parent ? worlds.get(node.parent)!.matrix : undefined,
        diagonal: bounds ? length(sub(bounds.max, bounds.min)) : 0,
      };
    });
    let magnitude = 0,
      worldMagnitude = 0;
    for (const a of samples)
      for (const b of samples) {
        const worldDisplacement = Math.max(
          0,
          ...[...a.positions].map(([id, position]) =>
            b.positions.has(id) ? length(sub(position, b.positions.get(id)!)) : 0,
          ),
        );
        const delta = sub(a.local, b.local);
        const trackDisplacement = Math.max(
          length(a.parent ? transformDirection(a.parent, delta) : delta),
          length(b.parent ? transformDirection(b.parent, delta) : delta),
        );
        // Parent animation alone must not turn a held/tiny position track into transport evidence.
        magnitude = Math.max(magnitude, Math.min(worldDisplacement, trackDisplacement));
        worldMagnitude = Math.max(worldMagnitude, worldDisplacement);
      }
    return {
      coordinateSpace: 'world' as const,
      magnitude,
      worldMagnitude,
      threshold: trackChangeThreshold(
        'position',
        Math.max(0, ...samples.map((sample) => sample.diagonal)),
      ),
    };
  };
  const changedInChapter = (track: CinematicScene['tracks'][number], times: number[]) => {
    const node = nodes.get(track.target)!;
    if (
      track.property === 'explode' &&
      !catalogFor(node).actionHints.some((action) => action.property === 'explode')
    )
      return false;
    const measurement = measureTrack(track, times, true);
    return measurement.magnitude >= measurement.threshold;
  };
  const orbitalTransport = (
    track: CinematicScene['tracks'][number],
    start: number,
    end: number,
    targets: string[] = [track.target],
  ) => {
    if (track.property !== 'rotation' || nodes.get(track.target)!.role === 'decoration') return false;
    const node = nodes.get(track.target)!;
    const subjects = [...new Set(targets.flatMap(renderedTargets))].filter(
      id => id !== track.target && descendant(id, track.target),
    );
    const times = timesFor(start, end, track);
    return subjects.some(id => {
      const samples = times.filter(time => targetVisible(id, time)).map(time => {
        const worlds = snapshot(time), subject = worlds.get(id)!, root = worlds.get(track.target)!;
        const position = transformPoint(subject.matrix, [0, 0, 0]);
        const bounds = worldBounds(subject);
        return { time, position, local: transformPoint(inverse(root.matrix), position),
          parent: node.parent ? worlds.get(node.parent)!.matrix : undefined,
          threshold: trackChangeThreshold('position', length(sub(bounds.max, bounds.min))) };
      });
      return samples.some(a => samples.some(b => {
        const frozen = compose(valueAt(scene, node, 'position', b.time) as Vector3,
          valueAt(scene, node, 'rotation', a.time) as Vector3,
          valueAt(scene, node, 'scale', b.time) as Vector3);
        const withoutRotation = transformPoint(b.parent ? multiply(b.parent, frozen) : frozen, b.local);
        // Both actual displacement and this mapped rotation's contribution must move the visible subject.
        return Math.min(length(sub(a.position, b.position)), length(sub(b.position, withoutRotation))) >=
          Math.max(a.threshold, b.threshold);
      }));
    });
  };
  const visibleTrack = (track: CinematicScene['tracks'][number], start: number, end: number) => {
    if (nodes.get(track.target)!.role === 'decoration') return false;
    const times = timesFor(start, end, track).filter((time) => targetVisible(track.target, time));
    return times.length >= 2 && (changedInChapter(track, times) || orbitalTransport(track, start, end));
  };
  const transportTrack = (track: CinematicScene['tracks'][number], mapping: InteractionMapping) => {
    const start = scene.chapters[mapping.chapter].at,
      end = scene.chapters[mapping.chapter + 1]?.at ?? scene.duration;
    return track.property === 'position' ? visibleTrack(track, start, end) :
      orbitalTransport(track, start, end, mapping.targets);
  };
  const endpointOwner = (id: string): string | undefined => {
    let node = nodes.get(id);
    while (node && !drawable(node)) node = node.parent ? nodes.get(node.parent) : undefined;
    return node?.id;
  };
  const visibleConnection = (link: CinematicScene['connections'][number], chapter: number) => {
    const phase = scene.chapters[chapter],
      end = scene.chapters[chapter + 1]?.at ?? scene.duration;
    if (end - phase.at < 0.5 || link.particles < 1 || link.speed * (end - phase.at) < 0.01)
      return false;
    const from = endpointOwner(link.from),
      to = endpointOwner(link.to);
    if (
      !from ||
      !to ||
      (phase.focus.length &&
        !phase.focus.some((id) => descendant(link.from, id) || descendant(link.to, id)))
    )
      return false;
    return timesFor(phase.at, end).some((time) => {
      if (!targetVisible(from, time) || !targetVisible(to, time)) return false;
      const worlds = snapshot(time),
        a = transformPoint(worlds.get(link.from)!.matrix, [0, 0, 0]),
        b = transformPoint(worlds.get(link.to)!.matrix, [0, 0, 0]);
      return length(sub(a, b)) > 0.12 || link.via.some((point) => length(sub(point, a)) > 0.12);
    });
  };
  const mappedConnections = (
    interaction: NonNullable<CinematicScene['coverage']>['interactions'][number],
  ) =>
    scene.connections.filter(
      (link) =>
        interaction.connections?.includes(link.id) &&
        interaction.targets.some((id) => descendant(link.from, id)) &&
        interaction.targets.some((id) => descendant(link.to, id)) &&
        visibleConnection(link, interaction.chapter),
    );
  const mapsTrack = (interaction: InteractionMapping, track: CinematicScene['tracks'][number],
    kind?: CinematicInteractionRequirement['kind']) =>
    interaction.properties.includes(track.property) ||
    (kind === 'transport' && interaction.properties.includes('transport') &&
      track.property === 'position' &&
      !!nodes.get(track.target)?.followConnection &&
      !!interaction.connections?.includes(nodes.get(track.target)!.followConnection!.connection));
  const diagnosticId = (id: string) => /^[a-z][a-z0-9_-]{0,47}$/.test(id);
  const diagnosticProperties = new Set<InteractionMapping['properties'][number]>([
    'position',
    'rotation',
    'scale',
    'opacity',
    'emissive',
    'explode',
    'explore',
    'transport',
    'controls',
    'domain',
  ]);
  const kindAcceptsProperty = (
    kind: CinematicInteractionRequirement['kind'] | undefined,
    property: TrackProperty,
  ) =>
    kind === 'structural-change'
      ? ['explode', 'position', 'rotation', 'scale'].includes(property)
      : kind === 'state-change'
        ? ['opacity', 'emissive', 'position', 'rotation', 'scale'].includes(property)
        : kind === 'transport'
          ? ['position', 'rotation'].includes(property)
          : !kind;
  type TrackDiagnostic =
    CinematicInteractionFailureDiagnostics['mappings'][number]['tracks'][number];
  const trackDiagnosticCache = new Map<
    string,
    Omit<TrackDiagnostic, 'propertyMapped' | 'kindCompatible'>
  >();
  const diagnoseTrack = (trackIndex: number, chapter: number) => {
    const cacheKey = `${trackIndex}:${chapter}`;
    if (trackDiagnosticCache.has(cacheKey)) return trackDiagnosticCache.get(cacheKey)!;
    const track = scene.tracks[trackIndex],
      node = nodes.get(track.target)!;
    const start = scene.chapters[chapter].at,
      end = scene.chapters[chapter + 1]?.at ?? scene.duration;
    const times = timesFor(start, end, track),
      visible = times.filter((time) => targetVisible(track.target, time));
    const measurement = measureTrack(track, times),
      visibleMeasurement = measureTrack(track, visible, true);
    const { magnitude, threshold, coordinateSpace } = measurement,
      visibleMagnitude = visibleMeasurement.magnitude;
    const rendered = renderedTargets(track.target);
    const opacityEligibleSampleCount = times.filter((time) =>
      rendered.some((id) => snapshot(time).get(id)!.opacity >= 0.12),
    ).length;
    const supported =
      track.property !== 'explode' ||
      catalogFor(node).actionHints.some((action) => action.property === 'explode');
    const meetsChangeThreshold = magnitude >= threshold;
    const visibleChangeAccepted = visibleTrack(track, start, end);
    const reasons: CinematicInteractionFailureReason[] = [];
    if (node.role === 'decoration') reasons.push('decoration-target');
    if (!rendered.length) reasons.push('no-rendered-target');
    else if (!opacityEligibleSampleCount) reasons.push('hidden-at-all-samples');
    if (!supported) reasons.push('unsupported-action');
    if (!visible.length) reasons.push('not-visible-in-chapter');
    else if (visible.length < 2) reasons.push('insufficient-visible-samples');
    if (supported) {
      if (magnitude === 0) reasons.push('no-change-in-chapter');
      else if (!meetsChangeThreshold) reasons.push('change-below-threshold');
      else if (visible.length >= 2 && !visibleChangeAccepted && node.role !== 'decoration')
        reasons.push(
          visibleMagnitude === 0 ? 'no-change-while-visible' : 'visible-change-below-threshold',
        );
    }
    const result = {
      trackIndex,
      target: diagnosticId(track.target) ? track.target : null,
      property: track.property,
      sampleCount: times.length,
      visibleSampleCount: visible.length,
      opacityEligibleSampleCount,
      magnitude,
      visibleMagnitude,
      coordinateSpace,
      threshold,
      visibleThreshold: visibleMeasurement.threshold,
      ...(coordinateSpace === 'world'
        ? {
            worldMagnitude: measurement.worldMagnitude,
            visibleWorldMagnitude: visibleMeasurement.worldMagnitude,
          }
        : {}),
      supported,
      meetsChangeThreshold,
      visibleChangeAccepted,
      otherVisibleChangeChapters: scene.chapters
        .slice(0, 10)
        .flatMap((phase, index) =>
          index !== chapter &&
          visibleTrack(track, phase.at, scene.chapters[index + 1]?.at ?? scene.duration)
            ? [index]
            : [],
        ),
      omittedChapters: Math.max(0, scene.chapters.length - 10),
      reasons,
    };
    trackDiagnosticCache.set(cacheKey, result);
    return result;
  };
  const failureDiagnostics = (
    mappings: InteractionMapping[],
    requirement?: CinematicInteractionRequirement,
  ): CinematicInteractionFailureDiagnostics => ({
    version: 'interaction-failure-v1',
    visibilityBasis: 'existing-quality-samples-not-raster',
    motionSource: 'scene-tracks-only',
    chapterIndexBase: 0,
    reasons: mappings.length ? [] : ['coverage-missing'],
    omittedMappings: Math.max(0, mappings.length - 24),
    mappings: mappings.slice(0, 24).map((mapping) => {
      const kind = requirement?.kind;
      const start = scene.chapters[mapping.chapter].at,
        end = scene.chapters[mapping.chapter + 1]?.at ?? scene.duration;
      const associated = scene.tracks
        .map((track, trackIndex) => ({ track, trackIndex }))
        .filter(({ track }) => mapping.targets.some((id) => related(scene, id, track.target)));
      const mapped = associated.filter(({ track }) => mapsTrack(mapping, track, kind));
      const visibleMapped = mapped.filter(({ track }) => kind === 'transport' ?
        transportTrack(track, mapping) : visibleTrack(track, start, end));
      const connections = mappedConnections(mapping);
      const invisibleTargets = mapping.targets.filter(
        (id) => !timesFor(start, end).some((time) => targetVisible(id, time)),
      );
      const reasons: CinematicInteractionFailureReason[] = [];
      if (kind === 'player-control') reasons.push('player-control-contract-mismatch');
      else if (kind === 'view') {
        if (mapping.controls?.length && mapping.properties.includes('controls'))
          reasons.push('controls-not-view-evidence');
        if (invisibleTargets.length) reasons.push('target-not-visible');
      } else {
        if (kind && mapping.properties.includes('explore')) reasons.push('explore-not-process');
        if (!associated.length) reasons.push('no-associated-track');
        else if (!mapped.length) reasons.push('no-mapped-track');
        else if (!visibleMapped.length) reasons.push('no-visible-mapped-track');
        if (kind && !mapped.some(({ track }) => kindAcceptsProperty(kind, track.property)))
          reasons.push('no-kind-compatible-track');
        if (kind === 'transport' && !connections.length)
          reasons.push('no-visible-mapped-connection');
        if (!kind) reasons.push('legacy-property-unfulfilled');
      }
      const selected = [...associated]
        .sort(
          (a, b) =>
            Number(mapping.properties.includes(b.track.property)) -
            Number(mapping.properties.includes(a.track.property)),
        )
        .slice(0, 8);
      return {
        coverageIndex: (scene.coverage?.interactions ?? []).indexOf(mapping),
        chapter: mapping.chapter,
        start,
        end,
        targets: mapping.targets.filter(diagnosticId).slice(0, 12),
        properties: mapping.properties
          .filter((property) => diagnosticProperties.has(property))
          .slice(0, 8),
        controls: (mapping.controls ?? [])
          .filter((control) => cinematicPlayerControlNames.includes(control))
          .slice(0, 8),
        requestedControls: (requirement?.controls ?? [])
          .filter((control) => cinematicPlayerControlNames.includes(control))
          .slice(0, 8),
        invisibleTargets: invisibleTargets.filter(diagnosticId).slice(0, 12),
        associatedTrackCount: associated.length,
        mappedTrackCount: mapped.length,
        visibleMappedTrackCount: visibleMapped.length,
        visibleMappedConnections: connections
          .map((link) => link.id)
          .filter(diagnosticId)
          .slice(0, 12),
        reasons,
        omittedTracks: associated.length - selected.length,
        tracks: selected.map(({ track, trackIndex }) => {
          const diagnostic = diagnoseTrack(trackIndex, mapping.chapter);
          const propertyMapped = mapsTrack(mapping, track, kind),
            kindCompatible = kindAcceptsProperty(kind, track.property);
          return {
            ...diagnostic,
            propertyMapped,
            kindCompatible,
            reasons: [
              ...diagnostic.reasons,
              ...(!propertyMapped ? ['property-not-mapped' as const] : []),
              ...(kind && !['view', 'player-control'].includes(kind) && !kindCompatible
                ? ['property-not-kind-evidence' as const]
                : []),
            ],
          };
        }),
      };
    }),
  });
  for (const track of scene.tracks) {
    const node = scene.nodes.find((node) => node.id === track.target)!;
    if (
      track.property === 'explode' &&
      !catalogFor(node).actionHints.some((action) => action.property === 'explode')
    )
      issue(
        'unsupported-asset-action',
        [node.id],
        '此资产没有真实可分离部件，explode轨道不会改变几何',
        '使用catalog.actionHints中的真实动作；例如固定PCB可承载可拆处理器，而不能宣称PCB自身层级拆解。',
      );
  }
  if (strict) {
    for (const role of ['primary'])
      if (!teaching.some((node) => node.role === role))
        issue(
          'composition-role',
          [role],
          `缺少可绘制的 ${role} 教学层`,
          '必须有可辨认的主实体；支撑和逻辑部件按真实主题需要配置，不能为凑角色添加无关物体。',
        );
    // A complete prebuilt assembly already contains connected real meshes.
    // Counting its single SceneIR root as one primitive encouraged unrelated
    // filler or replacing accurate assets with five crude stand-ins. This
    // exception cannot hide an underspecified multi-model assembly: it is
    // limited to ONE drawable primary asset and its measured internal
    // geometry. Supplemental callouts do not turn a self-contained detailed
    // asset (for example a DNA model with both backbones and every base pair)
    // into an incomplete assembly.
    const singleAsset = models.length === 1 && models[0].role === 'primary'
      ? catalogFor(models[0]) : undefined;
    const completeAsset = !!singleAsset && singleAsset.cost.instances >= 5 && singleAsset.cost.geometries >= 3;
    if (!completeAsset && (relations < 2 || (teaching.length < 5 && models.length < 3))) {
      const missing = [
        ...(relations < 2 ? ['关系不足（relations < 2）'] : []),
        ...(teaching.length < 5 && models.length < 3
          ? ['实体不足（teachingNodes < 5 且 detailedModels < 3）']
          : []),
      ];
      issue(
        'composition-assembly',
        [],
        `场景组合/分层结构不合格：teachingNodes=${teaching.length}, detailedModels=${models.length}, relations=${relations}；缺项：${missing.join('；')}`,
        [
          ...(relations < 2
            ? [`补齐至少 ${2 - relations} 条实际装配或父子关系（当前 ${relations}，要求至少 2）。`]
            : ['关系数量已达标，不能仅增加关系代替实体。']),
          ...(teaching.length < 5 && models.length < 3
            ? [
                `补齐实体：当前 ${models.length} 个精细模型、${teaching.length} 个教学实体；需达到至少 3 个精细互补模型或至少 5 个有具体尺寸的教学部件。`,
              ]
            : ['实体数量已达标，不能仅增加实体代替关系。']),
          '不得用空group、装饰或字幕冒充教学实体。',
        ].join(''),
      );
    }
    for (const node of teaching) {
      if (!node.role || !node.represents)
        issue(
          'composition-identity',
          [node.id],
          '教学实体未声明role/represents',
          '明确此节点实际代表什么，并与其几何结构和需求对象对应。',
        );
      if (node.model && !node.assetRole)
        issue(
          'asset-role',
          [node.id],
          '精细模型未声明真实assetRole',
          `使用${node.model}的真实角色之一：${assetDefinition(node.model).roles.join(', ')}；不相关实物必须换模型或自建组合。`,
        );
    }
    for (const shot of scene.shots)
      if (!shot.frame)
        issue(
          'camera-frame-missing',
          [],
          '新生成镜头缺少明确教学取景主体',
          '每个shots项添加frame:{nodes:[具体主体id],padding:1.2}，排除地板、group与背景；position-target只决定观察方向。',
          shot.at,
        );
  }
  const objects = scene.coverage?.objects ?? [],
    interactions = scene.coverage?.interactions ?? [];
  for (const name of options.requiredObjects ?? []) {
    const covered = objects.find((item) => item.name === name);
    const explicitClouds = scene.nodes.filter(node => node.kind === 'points' && node.role === 'primary' && !!node.represents && (node.points?.length ?? 0) >= 3);
    if (!covered || !covered.nodes.some((id) =>
      renderedTargets(id).some(actualId => [...teaching, ...explicitClouds].some(node => node.id === actualId))))
      issue(
        'request-object-missing',
        [],
        `需求实体未落到实际教学几何：${name}`,
        'coverage.objects逐字保留需求对象名并映射到实际可辨认节点，不得用标签或group冒充实体。',
      );
  }
  const interactionEvidence: CinematicInteractionEvidence[] = [];
  for (const requirement of options.requiredPresentation ?? []) {
    const covered = scene.coverage?.presentation?.some(
      (item) =>
        item.description === requirement.description && item.surface === requirement.surface,
    );
    if (!covered || !hasCinematicPresentationContent(scene, requirement.surface))
      issue(
        'request-presentation-missing',
        [],
        `讲解区域要求未实现：${requirement.description}`,
        'coverage.presentation保留原description和surface，并填写对应subtitle/modelNote/chapters文字，不得用几何节点替代。',
      );
  }
  const requirements = new Map(
    (options.interactionRequirements ?? []).map((requirement) => [
      requirement.description,
      requirement,
    ]),
  );
  const descriptions = [
    ...new Set([
      ...(options.requiredInteractions ?? []),
      ...requirements.keys(),
      ...interactions.map((item) => item.description),
    ]),
  ];
  const semanticProcessTracks = new Set<string>();
  const domainProcessChapters = new Set<number>();
  for (const description of descriptions) {
    const requirement = requirements.get(description);
    const kind = requirement?.kind;
    const mappings = interactions.filter((item) => item.description === description);
    if (!mappings.length) {
      issue(
        'request-interaction-missing',
        [],
        `需求交互缺少映射：${description}`,
        '逐字保留原需求并绑定真实目标、章节、轨道或连接，不能删除或降低原需求。',
      );
      interactionEvidence.push({
        description,
        kind: kind ?? 'legacy-untyped',
        status: 'FAIL',
        tracks: [],
        connections: [],
        diagnostics: failureDiagnostics(mappings, requirement),
      });
      continue;
    }
    const evidence = mappings.map((interaction) => {
      const start = scene.chapters[interaction.chapter].at,
        end = scene.chapters[interaction.chapter + 1]?.at ?? scene.duration;
      const tracks = scene.tracks.filter(
        (track) =>
          interaction.targets.some((id) => related(scene, id, track.target)) &&
          mapsTrack(interaction, track, kind) &&
          (kind === 'transport' ? transportTrack(track, interaction) : visibleTrack(track, start, end)),
      );
      const connections = mappedConnections(interaction);
      const explored = interaction.properties.includes('explore');
      const controls = interaction.properties.includes('controls')
        ? (interaction.controls ?? [])
        : [];
      const domain = interaction.properties.includes('domain') ? cinematicDomainChanges(scene,domainEvidence,interaction.targets)
        .filter(change => timesFor(start,end).some(time=>targetVisible(change.node,time)) &&
          (kind==='structural-change' ? ['positionY','rotationY','rotationSpeedY','scale'].includes(change.property) :
            kind==='state-change'||!kind)) : [];
      let passed = false;
      if (kind === 'player-control') {
        const requested = requirement?.controls ?? [];
        passed =
          requested.length > 0 &&
          new Set(requested).size === requested.length &&
          requested.every(
            (control) =>
              cinematicPlayerControlNames.includes(control) && controls.includes(control),
          ) &&
          interaction.properties.length === 1 &&
          interaction.properties[0] === 'controls';
      } else if (kind === 'view')
        passed =
          interaction.targets.every((id) =>
            timesFor(start, end).some((time) => targetVisible(id, time)),
          );
      else if (kind === 'structural-change')
        passed =
          !explored &&
          (domain.length>0 || tracks.some((track) =>
            ['explode', 'position', 'rotation', 'scale'].includes(track.property),
          ));
      else if (kind === 'state-change')
        passed =
          !explored &&
          (domain.length>0 || tracks.some((track) =>
            ['opacity', 'emissive', 'position', 'rotation', 'scale'].includes(track.property),
          ));
      else if (kind === 'transport')
        passed =
          !explored &&
          (tracks.some((track) => transportTrack(track, interaction)) || connections.length > 0);
      else
        passed = interaction.properties.every((property) =>
          property === 'domain' ? domain.length>0 : property === 'explore'
            ? interaction.targets.every((id) =>
                timesFor(start, end).some((time) => targetVisible(id, time)),
              )
            : property === 'transport'
              ? connections.length > 0
              : tracks.some((track) => track.property === property),
        );
      return { passed, chapter: interaction.chapter, tracks, connections, controls, domain };
    });
    const accepted = evidence.find((item) => item.passed);
    if (!accepted) {
      issue(
        kind ? 'request-interaction-kind-mismatch' : 'request-interaction-empty',
        mappings.flatMap((item) => item.targets),
        `需求“${description}”没有${kind ?? '所声明动作'}的可见执行证据`,
        kind === 'player-control'
          ? '内置播放、暂停、单步、时间轴等只用 properties:["controls"] 和明确控件名；不能添加几何轨道凑证据，也不能把模型开闭或拆解归为播放器控件。'
          : kind === 'view'
            ? '让被观察实体真实可见，不要增加无关运动。'
            : '保留原始需求分类：结构变化需真实几何轨道，状态变化需真实状态轨道，运输需绑定有光点的连接或可见位移；explore不能替代过程。',
      );
      interactionEvidence.push({
        description,
        kind: kind ?? 'legacy-untyped',
        status: 'FAIL',
        tracks: [],
        connections: [],
        diagnostics: failureDiagnostics(mappings, requirement),
      });
    } else {
      if (!kind)
        issue(
          'legacy-untyped-interaction',
          mappings.flatMap((item) => item.targets),
          `旧交互未提供语义分类：${description}`,
          '保留旧协议兼容，但不得宣称语义履约已验证；新的生成入口应提供interactionRequirements。',
          undefined,
          'warning',
        );
      const qualified = accepted.tracks.filter((track) =>
        kind === 'structural-change'
          ? ['explode', 'position', 'rotation', 'scale'].includes(track.property)
          : kind === 'state-change'
            ? ['opacity', 'emissive', 'position', 'rotation', 'scale'].includes(track.property)
            : kind === 'transport'
              ? ['position', 'rotation'].includes(track.property)
              : !kind && !mappings.some((item) => item.properties.includes('explore')),
      );
      qualified.forEach((track) => semanticProcessTracks.add(`${track.target}:${track.property}`));
      if(accepted.domain.length) domainProcessChapters.add(accepted.chapter);
      interactionEvidence.push({
        description,
        kind: kind ?? 'legacy-untyped',
        status: kind ? 'PASS' : 'LEGACY_UNTYPED',
        chapter: accepted.chapter,
        tracks: qualified.map((track) => `${track.target}:${track.property}`),
        connections: accepted.connections.map((link) => link.id),
        ...(kind === 'player-control' ? { controls: accepted.controls } : {}),
        ...(accepted.domain.length ? {domain:accepted.domain} : {}),
      });
    }
  }
  if (scene.connections.some((link) => link.fromPort || link.toPort))
    issue(
      'unresolved-ports',
      [],
      '连接仍含未解析端口',
      '先执行服务端resolveCinematicAssembly再进行编译/检查。',
    );
  const bound = scene.nodes.filter(node => node.followConnection || node.connectionPath);
  if (bound.length) {
    try {
      const expected = bindCinematicConnectionPaths(scene);
      for (const node of bound) {
        const canonical = expected.nodes.find(item => item.id === node.id)!;
        const actualTrack = scene.tracks.find(track => track.target === node.id && track.property === 'position');
        const expectedTrack = expected.tracks.find(track => track.target === node.id && track.property === 'position');
        if (JSON.stringify([node.position, node.points, actualTrack]) !== JSON.stringify([canonical.position, canonical.points, expectedTrack]))
          issue('unresolved-path-binding', [node.id], '连接路径几何或位移轨道不等于当前真实连接的解析结果', '先重新执行resolveCinematicAssembly；修改绑定、端点或via，不要单改会被覆盖的points/position轨道。');
      }
    } catch {
      issue('unresolved-path-binding', bound.map(node => node.id), '路径绑定端点或曲线无法可靠解析', '检查固定世界端点、已解析端口、依赖关系和路径精度，再执行resolveCinematicAssembly。');
    }
  }
  const baseTimes = new Set([
    0,
    scene.duration,
    ...scene.shots.map((shot) => shot.at),
    ...scene.chapters.map((chapter) => chapter.at),
  ]);
  for (let index = 0; index < scene.chapters.length; index++) {
    const start = scene.chapters[index].at,
      end = scene.chapters[index + 1]?.at ?? scene.duration;
    for (const fraction of [0.25, 0.5, 0.75]) baseTimes.add(start + (end - start) * fraction);
  }
  for (const track of scene.tracks) for (const key of track.keyframes) baseTimes.add(key.at);
  const allTimes = [...baseTimes].sort((a, b) => a - b);
  const sampledTimes =
    allTimes.length <= 120
      ? allTimes
      : [
          ...new Set([
            ...scene.chapters.map((chapter) => chapter.at),
            ...Array.from(
              { length: 100 },
              (_, i) => allTimes[Math.floor((i * (allTimes.length - 1)) / 99)],
            ),
          ]),
        ].sort((a, b) => a - b);
  const aspects = [16 / 9, 9 / 16];
  for (const time of sampledTimes) {
    const worlds = worldNodes(scene, time);
    snapshots.set(time, worlds);
    const chapter = [...scene.chapters].reverse().find((chapter) => chapter.at <= time)!;
    const focus = chapter.focus.length
      ? chapter.focus
      : teaching.filter((node) => node.role === 'primary').map((node) => node.id);
    for (const aspect of aspects) {
      const camera = cameraForQuality(scene, time, aspect);
      const projected = new Map(
        teaching.map((node) => [node.id, projection(worlds.get(node.id)!, camera)]),
      );
      if (focus.length && !focus.some((id) => projected.get(id)?.visible))
        issue(
          'chapter-focus-invisible',
          focus,
          '当前章节焦点不可见或近似投影未落入画面',
          '若目标被隐藏，恢复对应实体可见性；近似投影风险需用getFrameDiagnostics核验，不得以增加无关动画掩盖。',
          chapter.at,
          focus.every(
            (id) => !renderedTargets(id).some((actualId) => worlds.get(actualId)!.opacity >= 0.12),
          )
            ? 'error'
            : 'warning',
        );
      for (const id of focus) {
        const p = projected.get(id);
        if (!p?.visible) continue;
        if (p.area < 0.004)
          issue(
            'subject-too-small',
            [id],
            '教学焦点在画面中太小，细节难辨',
            '缩小frame主体范围，安排独立特写；不要把遥远支撑件/地板与主角一起fit。',
            time,
            'warning',
          );
        if (p.clipped && !shotAt(scene, time).frame)
          issue(
            'subject-clipped',
            [id],
            '教学焦点越出画面或近裁面',
            '为当前教学节点添加frame自动取景，或修订镜头方向与距离。',
            time,
            'warning',
          );
        for (const other of teaching) {
          if (id === other.id || related(scene, id, other.id)) continue;
          const q = projected.get(other.id)!;
          if (
            q.visible &&
            worlds.get(other.id)!.opacity > 0.85 &&
            q.bounds.max[2] < p.bounds.min[2] &&
            q.bounds.min[0] < p.bounds.min[0] &&
            q.bounds.max[0] > p.bounds.max[0] &&
            q.bounds.min[1] < p.bounds.min[1] &&
            q.bounds.max[1] > p.bounds.max[1]
          )
            issue(
              'subject-occlusion-risk',
              [id, other.id],
              '前景实体投影包围了教学焦点，有严重遮挡风险',
              '调整机位方向、前景位置或可见性；需要真实渲染抽帧复核。',
              time,
              'warning',
            );
        }
      }
      for (const node of teaching) {
        const world = worlds.get(node.id)!;
        if (world.opacity < 0.15 || node.kind === 'tube' || node.kind === 'torus') continue;
        const p = transformPoint(inverse(world.matrix), camera.position),
          bounds = localBounds(node);
        if (p.every((v, i) => v > bounds.min[i] + 0.08 && v < bounds.max[i] - 0.08))
          issue(
            'camera-inside-bounds',
            [node.id],
            '相机进入实体包络内部',
            '调整取景方向/主体，移开遮挡物；不可只增加字幕解释。',
            time,
            'warning',
          );
      }
    }
    const physical = teaching.filter(
      (node) =>
        node.role !== 'logic' &&
        !['torus', 'tube'].includes(node.kind) &&
        worlds.get(node.id)!.opacity > 0.25,
    );
    for (let i = 0; i < physical.length; i++)
      for (let j = i + 1; j < physical.length; j++) {
        const a = worlds.get(physical[i].id)!,
          b = worlds.get(physical[j].id)!;
        const overlap = overlapFraction(a, b);
        const identicalGeometry =
          a.node.kind === b.node.kind &&
          a.node.model === b.node.model &&
          JSON.stringify(a.node.params) === JSON.stringify(b.node.params) &&
          a.matrix.every((value, index) => Math.abs(value - b.matrix[index]) < 1e-5);
        const transportMarker = (entry: WorldNode) =>
          /(?:flow|transport|particle|feed[_-]?marker|流向|流动|流入.*标记|物料.*标记|介质.*标记)/i.test(
            [entry.node.id, entry.node.label, entry.node.detail, entry.node.represents]
              .filter(Boolean)
              .join(' '),
          ) && scene.tracks.some(track => track.target === entry.node.id && track.property === 'position');
        const finalMarkerPosition = (entry: WorldNode) => {
          const value = scene.tracks.find(track => track.target === entry.node.id && track.property === 'position')?.keyframes.at(-1)?.value;
          return Array.isArray(value) && value.length === 3 ? value : undefined;
        };
        const finalA = finalMarkerPosition(a), finalB = finalMarkerPosition(b);
        // Shared feeder markers may briefly coincide at their common source,
        // but only if their authored paths demonstrably separate afterward.
        const transientTransportPair = transportMarker(a) && transportMarker(b) && !!finalA && !!finalB &&
          Math.hypot(...finalA.map((value, axis) => value - finalB[axis])) >= .5 - 1e-6;
        const rotorMarker = (entry: WorldNode) => {
          const parent = scene.nodes.find(node => node.id === entry.node.parent);
          return !!parent && parent.kind === 'cylinder' &&
            /(?:trace|stripe|band|marker|示踪|条纹|标记)/i.test(
              [entry.node.id, entry.node.label, entry.node.detail, entry.node.represents]
                .filter(Boolean)
                .join(' '),
            ) && scene.tracks.some(track => track.target === parent.id && track.property === 'rotation');
        };
        const movingFragment = (entry: WorldNode) =>
          /(?:debris|fragment|shard|碎片|断片)/i.test(
            [entry.node.id, entry.node.label, entry.node.detail, entry.node.represents]
              .filter(Boolean)
              .join(' '),
          ) && scene.tracks.some(track => track.target === entry.node.id && track.property === 'position') &&
            scene.tracks.some(track => track.target === entry.node.id && track.property === 'opacity');
        // A marker is attached to the source rotor until breakup, while a
        // fragment begins inside that source before becoming visible and
        // flying clear. Their conservative boxes may briefly coincide even
        // though the rendered destruction is physically legible.
        const transientBreakupPair =
          (rotorMarker(a) && movingFragment(b)) || (rotorMarker(b) && movingFragment(a));
        const transparentCutawayShell = (shell: WorldNode, movingPart: WorldNode) =>
          shell.node.role === 'support' && shell.node.opacity > 0.12 && shell.node.opacity <= 0.35 &&
          /(?:shell|housing|casing|外壳|壳体|阀体)/i.test(
            [shell.node.id, shell.node.label, shell.node.represents, shell.node.detail].filter(Boolean).join(' ')) &&
          !scene.tracks.some(track => track.target === shell.node.id && track.property === 'position') &&
          scene.tracks.some(track => track.target === movingPart.node.id && track.property === 'position');
        // A moving gate deliberately travels inside a translucent cutaway
        // housing. Their axis-aligned bounds intersect, but the shell is an
        // inspection aid, not a solid obstruction. Keep the warning and let
        // the real browser visibility check decide whether it is legible.
        const cutawayHousingPair = transparentCutawayShell(a, b) || transparentCutawayShell(b, a);
        const crossedSpokes = a.node.kind==='box'&&b.node.kind==='box'&&a.node.parent===b.node.parent&&
          !!a.node.parent&&scene.nodes.some(node=>node.id===a.node.parent&&node.kind==='torus')&&
          [a.node,b.node].every(node=>/(?:spoke|辐条)/i.test([node.id,node.represents,node.label].filter(Boolean).join(' ')));
        // Abstract packet fragments can converge during transmission and
        // reassembly. They are data tokens, not colliding machine parts.
        // Retain the overlap warning; the real browser still checks visibility.
        const dataFragmentPair=a.node.kind==='box'&&b.node.kind==='box'&&a.node.parent===b.node.parent&&
          !!a.node.parent&&scene.nodes.some(node=>node.id===a.node.parent&&node.kind==='group'&&
            /报文|数据包|packet|MTU/i.test([node.represents,node.label].join(' ')))&&
          [a.node,b.node].every(node=>/分片.*报文|报文.*(?:段|分片)|packet.*fragment/i.test(node.represents??'')&&
            scene.tracks.some(track=>track.target===node.id&&track.property==='position'));
        // A header token can briefly enter a payload token while illustrating
        // packet assembly. Only partial intersections of explicitly named data
        // fields are advisory; identical/full overlap and real hardware retain
        // the collision gate. Actual browser visibility still must pass.
        const fieldName=(entry:WorldNode)=>[entry.node.label,entry.node.represents].filter(Boolean).join(' ');
        const headerField=(entry:WorldNode)=>/报文头部|首部|header/i.test(fieldName(entry));
        const payloadField=(entry:WorldNode)=>/数据载荷|有效载荷|payload/i.test(fieldName(entry));
        const packetFieldTransition=!!scene.lab&&/MTU|分片|报文|数据包|packet/i.test(scene.title)&&
          a.node.kind==='box'&&b.node.kind==='box'&&!identicalGeometry&&overlap<.8&&
          ((headerField(a)&&payloadField(b))||(headerField(b)&&payloadField(a)))&&
          scene.tracks.some(track=>[a.node.id,b.node.id].includes(track.target)&&track.property==='position');
        if (overlap > 0.55) {
          // SAT's minimum-axis fraction is high even where two thin construction
          // pieces merely join at an edge. Keep that evidence, but reserve a
          // blocking collision for substantial shared volume. A bound transport
          // object is expected to meet its source and destination on the path.
          const firstBounds = worldBounds(a), secondBounds = worldBounds(b);
          const intersection: Bounds = {
            min: firstBounds.min.map((value, axis) => Math.max(value, secondBounds.min[axis])) as Vector3,
            max: firstBounds.max.map((value, axis) => Math.min(value, secondBounds.max[axis])) as Vector3,
          };
          const smaller = Math.min(volume(firstBounds), volume(secondBounds));
          const minorJoin = smaller > 0 && volume(intersection) / smaller < .15;
          const boundTransport = !!(a.node.followConnection || b.node.followConnection);
          issue(
            'geometry-overlap',
            [a.node.id, b.node.id],
            `实际资产的变换后包络严重重叠（最小轴占比${overlap.toFixed(2)}）`,
            '以assembly相对表面间距/真实端口重新装配，或修订轨道防止运动后穿插。有assembly.placements的节点必须修改对应placement的reference/side/gap/offset；单改node.position会被装配规则重新覆盖。该检查是包络，不是三角面碰撞。',
            time,
            !minorJoin && !boundTransport && !transientTransportPair && !transientBreakupPair && !cutawayHousingPair && !crossedSpokes && !dataFragmentPair && !packetFieldTransition &&
              (identicalGeometry || (a.node.kind === 'box' && b.node.kind === 'box'))
              ? 'error'
              : 'warning',
          );
        } else if (a.explode > 0 || b.explode > 0) {
          const x = worldBounds(a),
            y = worldBounds(b),
            intersection = {
              min: x.min.map((v, i) => Math.max(v, y.min[i])) as Vector3,
              max: x.max.map((v, i) => Math.min(v, y.max[i])) as Vector3,
            };
          if (volume(intersection) > Math.min(volume(x), volume(y)) * 0.35)
            issue(
              'expanded-bounds-risk',
              [a.node.id, b.node.id],
              '内部动画/展开的保守运动包络相交',
              '给展开部件留出空间，并让真实渲染检查确认是否发生碰撞；此项不是已证实的网格碰撞。',
              time,
              'warning',
            );
        }
      }
  }
  const chapters = scene.chapters.map((chapter, index) => {
    const end = scene.chapters[index + 1]?.at ?? scene.duration;
    const focus = chapter.focus.length ? chapter.focus : teaching.map((node) => node.id);
    const visibleChanges = scene.tracks
      .filter(
        (track) =>
          focus.some((id) => related(scene, id, track.target)) &&
          visibleTrack(track, chapter.at, end),
      )
      .map((track) => `${track.target}:${track.property}`);
    const visibleConnections = scene.connections
      .filter((link) => visibleConnection(link, index))
      .map((link) => link.id);
    const kind = chapter.kind ?? 'action';
    if (
      kind === 'action' &&
      end - chapter.at > 0.5 &&
      !visibleChanges.length &&
      !visibleConnections.length
    )
      issue(
        'chapter-no-visible-change',
        focus,
        '动作章节缺少实际目标上可见的过程变化',
        '实现原需求的目标动作；如本阶段本来用于观察已呈现结构，可明确标为inspection并保留可见focus，不要补无关闪烁。',
        chapter.at,
      );
    if (kind !== 'action') {
      const supportedFocus =
        chapter.focus.length > 0 &&
        chapter.focus.every(
          (id) =>
            timesFor(chapter.at, end).some((time) => targetVisible(id, time)) &&
            (renderedTargets(id).some(
              (actualId) => !!nodes.get(actualId)!.represents || !!nodes.get(actualId)!.detail,
            ) ||
              objects.some((object) =>
                object.nodes.some((actualId) => related(scene, actualId, id)),
              )),
        );
      if (!supportedFocus)
        issue(
          'chapter-observation-without-evidence',
          chapter.focus,
          '观察/总结必须指向已有、可见且说明了教学含义的具体结构或状态',
          '为静态观察填写实际focus与实体说明，不能把隐藏目标或空group作为观察依据。',
          chapter.at,
        );
    }
    return { index, at: chapter.at, end, kind, visibleChanges, visibleConnections };
  });
  const orbitalProcess = (change: string, chapter: (typeof chapters)[number]) => {
    const track = scene.tracks.find(track => `${track.target}:${track.property}` === change);
    if (!track || track.property !== 'rotation' || nodes.get(track.target)?.kind !== 'group') return false;
    const times = timesFor(chapter.at, chapter.end, track);
    return renderedTargets(track.target).some(id => {
      const samples = times.filter(time => targetVisible(id, time)).map(time => {
        const worlds = snapshot(time), child = worlds.get(id)!, parent = worlds.get(track.target)!;
        const bounds = worldBounds(child);
        return { offset: sub(transformPoint(child.matrix, [0, 0, 0]), transformPoint(parent.matrix, [0, 0, 0])),
          threshold: trackChangeThreshold('position', length(sub(bounds.max, bounds.min))) };
      });
      return samples.some(a => samples.some(b => length(sub(a.offset, b.offset)) >= Math.max(a.threshold, b.threshold)));
    });
  };
  const processChanges = (chapter: (typeof chapters)[number]) =>
    domainProcessChapters.has(chapter.index) ||
    chapter.visibleConnections.length > 0 ||
    chapter.visibleChanges.some(
      (change) => /:(?:explode|position|scale)$/.test(change) || semanticProcessTracks.has(change) || orbitalProcess(change, chapter),
    );
  for (const chapter of chapters)
    if (chapter.kind === 'summary' && !chapters.slice(0, chapter.index).some(processChanges))
      issue(
        'chapter-summary-without-process',
        scene.chapters[chapter.index].focus,
        '总结之前没有经过可见的教学过程',
        '先完成所要求的过程再总结；纯旋转视角、隐藏动作和无关闪光不构成过程依据。',
        chapter.at,
      );
  if (!chapters.some(processChanges))
    issue(
      'motion-only-rotation',
      [],
      '整场缺少可见的真实教学过程动作',
      '保留原需求：结构几何变化、运输光点/位移，或有明确状态需求绑定的状态轨道才构成过程；不得为了过检查添加无关闪光。',
    );
  const costs = models.map(catalogFor).map((asset) => asset.cost);
  const metrics = {
    teachingNodes: teaching.length,
    detailedModels: models.length,
    relations,
    drawCalls: costs.reduce((sum, cost) => sum + cost.drawCalls, teaching.length - models.length),
    triangles: costs.reduce((sum, cost) => sum + cost.triangles, 0),
  };
  if (metrics.drawCalls > 2500 || metrics.triangles > 3000000)
    issue(
      'render-cost',
      models.map((node) => node.id),
      '组合资产超过实时展示的保守成本预算',
      '减少无关重复模型、降低非主体detail或拆成局部特写；不能靠画质选择掩盖高成本结构。',
      undefined,
      metrics.drawCalls > 5000 || metrics.triangles > 6000000 ? 'error' : 'warning',
    );
  return {
    version: 'cinematic-geometry-v1',
    status: issues.some((issue) => issue.severity === 'error') ? 'FAIL' : 'PASS',
    method: 'catalog-bounds-and-track-sampling',
    visualReview: 'NOT_PERFORMED',
    policyVersion: 'cinematic-quality-2026-09-12.3',
    runtimeValidation: 'REQUIRED',
    interactionEvidence,
    limitations: [
      'Bounds are measured from real assets, not triangle-level collision tests.',
      'Internal motion/explode uses a conservative swept envelope, not exact deformed geometry.',
      'Occlusion uses projected bounds, not rendered pixels. Runtime Box3 and raster visual review are still required.',
      'Track and framing samples are bounded; unsampled instants are not certified.',
      'Player-control evidence refers to the built-in UI contract, not model-state changes or a completed browser interaction test.',
      'Framing, tiny-subject and occlusion estimates are advisory only. Production getFrameDiagnostics and rendered interaction checks must establish actual visibility.',
    ],
    checks: [
      'composition-layers',
      'asset-role',
      'request-coverage',
      'typed-interaction-evidence',
      'builtin-player-control-contract',
      'phase-aware-inspection',
      'oriented-bounds-overlap',
      'camera-framing',
      'projected-visibility',
      'chapter-visible-motion',
      'render-cost',
    ],
    issues,
    sampledTimes,
    aspects,
    metrics,
    chapters,
  };
}

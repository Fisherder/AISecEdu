import { createHash } from 'node:crypto';
import { compileCinematicScene, CINEMATIC_RUNTIME_VERSION } from '../agent-runtime/lib/cinematic/compile';
import { parseCinematicScene, type CinematicScene } from '../agent-runtime/lib/cinematic/schema';
import { parseCinematicInspection } from '../agent-runtime/lib/cinematic/render-client';
import valve from '../agent-runtime/lib/cinematic/reference-scenes/gate-valve.json';
import processor from '../agent-runtime/lib/cinematic/reference-scenes/processor-package.json';

const references = {
  'gate-valve': valve.scene,
  'processor-package': processor.scene,
};
type Profile = keyof typeof references | 'earth-moon' | 'primitives';
type Vector = [number, number, number];
type LessonCopy = {
  title: string;
  subtitle: string;
  objectives: string[];
  modelNote: string;
  chapters: { title: string; caption: string; question: string }[];
};
type Motion = LessonCopy & {
  chapters: (LessonCopy['chapters'][number] & { focus: string })[];
  actors: { id: string; shape: 'sphere' | 'box' | 'cylinder' | 'torus'; color: string; label: string;
    detail: string; position: Vector; size: Vector; parent: string; surface: 'plain' | 'bands' | 'strata' }[];
  movement: { actor: string; waypoints: Vector[] }[];
};
const geometry = (scene: CinematicScene) =>
  JSON.stringify([scene.duration, scene.nodes, scene.connections, scene.tracks, scene.shots, scene.assembly,
    scene.theme, scene.learnerControls, scene.chapters.map(({ at, focus }) => [at, focus])]);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function primitiveScene(copy: Motion): CinematicScene {
  const actors = new Set(copy.actors.map(actor => actor.id));
  if (actors.size !== copy.actors.length || copy.chapters.some(chapter => !actors.has(chapter.focus)) ||
      new Set(copy.movement.map(track => track.actor)).size !== copy.movement.length ||
      copy.movement.some(track => !actors.has(track.actor) || track.waypoints.length !== copy.chapters.length ||
        new Set(track.waypoints.map(vector => JSON.stringify(vector))).size < 2)) {
    throw new Error('Invalid animated object and chapter references');
  }
  const duration = copy.chapters.length * 10;
  const colors = { background: '#081522', accent: '#63d0d9', secondary: '#f5b673', environment: 'studio' };
  const parameters = {
    box: { width: 1, height: 1, depth: 1 },
    sphere: { radius: 0.5 },
    cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
    torus: { radius: 0.42, tube: 0.08 },
  };
  const nodes = copy.actors.map(actor => ({
    id: actor.id, kind: actor.shape, role: 'primary', color: actor.color, label: actor.label, detail: actor.detail,
    represents: actor.label, position: actor.position, scale: actor.size, rotation: [0, 0, 0],
    ...(actor.parent ? { parent: actor.parent } : {}),
    ...(actor.surface === 'plain' ? {} : { surface: { pattern: actor.surface, secondary: '#eaf6fb' } }),
    emissive: 0.12, metalness: 0.16, roughness: 0.42, opacity: 1, params: parameters[actor.shape],
  }));
  const cameras = [[5, 4, 8], [7, 3, 5], [3, 6, 7], [6, 4, 7], [4, 4, 8], [7, 4, 6]];
  return parseCinematicScene({
    schemaVersion: 'cinematic-v1', title: copy.title, subtitle: copy.subtitle, modelNote: copy.modelNote,
    objectives: copy.objectives, theme: colors, duration, nodes, connections: [],
    tracks: copy.movement.map(track => ({
      target: track.actor, property: 'position', easing: 'smooth',
      keyframes: track.waypoints.map((point, index) => ({ at: index * 10, value: point }))
        .concat({ at: duration, value: track.waypoints.at(-1)! }),
    })),
    shots: copy.chapters.map((chapter, index) => ({
      at: index * 10, position: cameras[index], target: [0, 0, 0], fov: 40,
      frame: { nodes: index === 0 ? [...actors] : [chapter.focus], padding: index === 0 ? 1.42 : 1.55 },
    })),
    chapters: copy.chapters.map((chapter, index) => ({
      at: index * 10, title: chapter.title, caption: chapter.caption, focus: [chapter.focus],
      kind: index === copy.chapters.length - 1 ? 'summary' : 'inspection',
      ...(chapter.question ? { question: chapter.question } : {}),
    })),
  });
}

const orbitPoint = (angle: number) => [
  2.7 * Number(Math.cos(angle).toFixed(10)), 0, 2.7 * Number(Math.sin(angle).toFixed(10)),
];
const orbitAngle = (index: number, steps: number) => 2 * Math.PI * index / steps;

function earthMoonScene(copy: LessonCopy): CinematicScene {
  const duration = 48;
  const nodes = [
    { id: 'earth', kind: 'model', model: 'planet', role: 'primary', represents: '地球',
      label: '地球', detail: '中央天体为地球，画面将天体与距离分别放大。',
      color: '#5398d6', scale: [0.85, 0.85, 0.85], params: { rings: false, speed: 0 } },
    { id: 'moon', kind: 'sphere', role: 'primary', represents: '月球',
      label: '月球', detail: '灰色球体为月球，围绕地球做方向连续的近似圆周运动。',
      color: '#d1d4df', position: orbitPoint(0), params: { radius: 0.24 },
      surface: { pattern: 'granite', secondary: '#647184', scale: 12 }, roughness: 0.81 },
    { id: 'orbit', kind: 'tube', role: 'decoration', color: '#527492', opacity: 0.55,
      points: Array.from({ length: 65 }, (_, index) => orbitPoint(orbitAngle(index, 64))),
      params: { radius: 0.018 }, },
  ];
  const orbit = Array.from({ length: 17 }, (_, index) => ({
    at: index * 2.5, value: orbitPoint(orbitAngle(index, 16)),
  })).concat({ at: duration, value: orbitPoint(0) });
  const views = [[5, 5, 8], [2.8, 8, 6], [-4.2, 7, 5], [-5, 5, 7], [-1.5, 7.5, 8]];
  return parseCinematicScene({
    schemaVersion: 'cinematic-v1', title: copy.title, subtitle: copy.subtitle, objectives: copy.objectives,
    modelNote: '天体与轨道距离分别放大。使用同一平面内的近似圆轨道，演示周期与相对位置。',
    theme: { background: '#081522', accent: '#70d9e5', secondary: '#ffd995', environment: 'space' },
    duration, nodes,
    tracks: [{ target: 'moon', property: 'position', easing: 'linear', keyframes: orbit }],
    shots: views.map((position, index) => ({
      at: index * 10, position, target: [0, 0, 0], fov: 39,
      frame: { nodes: ['earth', 'moon'], padding: 1.52 },
    })),
    chapters: copy.chapters.map((chapter, index) => ({
      ...chapter, at: index * 10, focus: ['moon', 'earth'], kind: index === 4 ? 'summary' : 'inspection',
      question: chapter.question || undefined,
    })),
    learnerControls: [{
      id: 'orbit-position', type: 'range', label: '公转进度', min: 0, max: 100, step: 25,
      defaultValue: 0, unit: '%', timeRange: [0, 40],
      feedback: [
        { min: 0, max: 0, label: '从起点出发', detail: '记住月球相对于地球的初始方向。' },
        { min: 25, max: 25, label: '四分之一圈', detail: '月球与初始方向大约相差四分之一个圆周。' },
        { min: 50, max: 50, label: '半圈', detail: '月球移动到初始位置的对侧。' },
        { min: 75, max: 75, label: '四分之三圈', detail: '月球沿同一方向继续运行。' },
        { min: 100, max: 100, label: '完成一圈', detail: '回到起点方向，一个公转周期结束。' },
      ],
    }],
  });
}

export function compileTeachingCinematic(profile: Profile, copy: LessonCopy | Motion) {
  let scene: CinematicScene;
  let referenceGeometrySha256: string | undefined;
  if (profile === 'primitives') {
    scene = primitiveScene(copy as Motion);
  } else if (profile === 'earth-moon') {
    scene = earthMoonScene(copy);
  } else {
    const baseline = parseCinematicScene(references[profile]);
    if (baseline.chapters.length !== copy.chapters.length) throw new Error('Chapter count cannot alter the verified reference');
    scene = parseCinematicScene({
      ...baseline, title: copy.title, subtitle: copy.subtitle, objectives: copy.objectives, modelNote: copy.modelNote,
      chapters: baseline.chapters.map((chapter, index) => ({
        ...chapter, title: copy.chapters[index].title,
        caption: copy.chapters[index].caption, question: copy.chapters[index].question || undefined,
      })),
    });
    referenceGeometrySha256 = digest(geometry(baseline));
    if (digest(geometry(scene)) !== referenceGeometrySha256) throw new Error('Verified geometry or timing changed');
  }
  return { html: compileCinematicScene(scene), sceneWire: JSON.stringify(scene), title: scene.title,
    runtime: CINEMATIC_RUNTIME_VERSION, referenceGeometrySha256, geometrySha256: digest(geometry(scene)) };
}

export function verifyTeachingCinematic(sceneWire: string, receipt: unknown) {
  const original = JSON.parse(sceneWire);
  const scene = parseCinematicScene(original);
  const verified = parseCinematicInspection(receipt, scene);
  return { issues: verified.issues, evidence: verified.evidence };
}

import { describe, expect, it } from 'vitest';
import { referenceScenes } from '../../../lib/cinematic/reference-scenes';
import { cinematicHardwareGeometryIssues, normalizeCentrifugeHardware, normalizeCinematicHardware } from '../../../lib/cinematic/hardware-geometry';
import { checkCinematicQuality, type CinematicQualityOptions } from '../../../lib/cinematic/quality';
import { parseCinematicScene, type CinematicNode, type CinematicScene } from '../../../lib/cinematic/schema';
import { cinematicOcclusionIssues, type CinematicRenderInspection } from '../../../lib/cinematic/render-client';
import generatedValveReviewCase from '../../fixtures/generated-valve-review-case.json';
import generatedStuxReviewCase from '../../fixtures/generated-stux-review-case.json';
import generatedStuxPointerReviewCase from '../../fixtures/generated-stux-pointer-review-case.json';
import generatedCpuLayerCrossing from '../../lib/cinematic/fixtures/generated-cpu-layer-crossing.json';
import generatedValvePrimitiveCenter from '../../lib/cinematic/fixtures/generated-valve-primitive-center.json';
import {resolveCinematicAssembly} from '../../../lib/cinematic/assembly';
import {verifiedCinematicReference} from '../../../lib/cinematic/verified-reference';
import { parseCinematicCandidate, rebindVisibleCinematicStateEvidence } from '../../../lib/server/cinematic-generation';

type Vector = CinematicNode['position'];
type Property = CinematicScene['tracks'][number]['property'];

function valueAt(scene: CinematicScene, target: string, property: Property, time: number): number | Vector {
  const node = scene.nodes.find((entry) => entry.id === target)!;
  const track = scene.tracks.find((entry) => entry.target === target && entry.property === property);
  if (!track) return property === 'explode' ? 0 : node[property];
  if (time <= track.keyframes[0].at) return track.keyframes[0].value;
  for (let index = 1; index < track.keyframes.length; index += 1) {
    const current = track.keyframes[index];
    if (time >= current.at) continue;
    const previous = track.keyframes[index - 1];
    const u = (time - previous.at) / (current.at - previous.at);
    const fraction = track.easing === 'smooth' ? u * u * (3 - 2 * u) : u;
    return Array.isArray(previous.value)
      ? previous.value.map((value, axis) => value + ((current.value as Vector)[axis] - value) * fraction) as Vector
      : previous.value + ((current.value as number) - previous.value) * fraction;
  }
  return track.keyframes[track.keyframes.length - 1].value;
}

const positionAt = (scene: CinematicScene, id: string, time: number) => valueAt(scene, id, 'position', time) as Vector;
const subtract = (a: Vector, b: Vector): Vector => a.map((value, index) => value - b[index]) as Vector;
const dot = (a: Vector, b: Vector) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalize = (value: Vector): Vector => value.map((coordinate) => coordinate / Math.hypot(...value)) as Vector;
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

describe('hand-authored cinematic visual-reference fixtures', () => {
  it('reuses browser-verified processor layers only for a matching package lesson', () => {
    const match=verifiedCinematicReference({title:'CPU封装展开',
      originalRequest:'观察处理器封装外观和内部层次，展开后复原，支持暂停、单步、回拖和旋转缩放。'});
    expect(match).toBeDefined();
    const scene=parseCinematicCandidate(match!.scene);
    expect(scene.title).toBe('CPU封装展开');
    expect(scene.nodes.find(node=>node.model==='processor')).toBeDefined();
    expect(scene.tracks.some(track=>track.target==='processor_package'&&track.property==='explode')).toBe(true);
    expect(scene.chapters.length).toBeGreaterThanOrEqual(5);
    const options={interactionRequirements:match!.intent.interactionRequirements,
      requiredInteractions:match!.intent.interactions,requiredObjects:match!.intent.objects,requireComposition:true};
    const normalized=normalizeCinematicHardware(scene,options).scene;
    expect(checkCinematicQuality(normalized,options).issues.filter(issue=>issue.severity==='error').map(issue=>issue.code)).toEqual([]);
    expect(verifiedCinematicReference({originalRequest:'CPU封装的晶体管级指令执行电路仿真'})).toBeUndefined();
  });
  it('reuses browser-verified valve hardware with a moving gate, stem and flow', () => {
    const match=verifiedCinematicReference({title:'闸阀开闭',
      originalRequest:'演示闸阀从关闭到打开，阀体、阀芯、阀杆、流道和流向应真实可见。'});
    expect(match).toBeDefined();
    const scene=parseCinematicCandidate(match!.scene);
    expect(scene.title).toBe('闸阀开闭');
    expect(scene.nodes.some(node=>node.model==='valve')).toBe(true);
    for(const id of ['gate','stem','flow_passage','inlet_flow','outlet_flow'])
      expect(scene.nodes.some(node=>node.id===id)).toBe(true);
    expect(scene.tracks.some(track=>track.target==='gate'&&track.property==='position')).toBe(true);
    expect(scene.tracks.some(track=>track.target==='outlet_flow'&&track.property==='opacity')).toBe(true);
    const options={interactionRequirements:match!.intent.interactionRequirements,
      requiredInteractions:match!.intent.interactions,requiredObjects:match!.intent.objects,requireComposition:true};
    const normalized=normalizeCinematicHardware(scene,options).scene;
    const assembled=resolveCinematicAssembly(normalized).scene;
    expect(checkCinematicQuality(assembled,options).issues.filter(issue=>issue.severity==='error').map(issue=>issue.code)).toEqual([]);
    expect(verifiedCinematicReference({originalRequest:'演示闸阀从打开到关闭时的阀杆与泄漏故障'})).toBeUndefined();
  });
  it('retrieves a complete, previously browser-verified centrifuge scene for a matching teaching request', () => {
    const match=verifiedCinematicReference({title:'工控离心机级联安全实验',
      originalRequest:'三台剖面离心机，HMI显示正常而物理转速偏离，注入后真实级联解体并让碎片飞散，支持紧急停机。'});
    expect(match).toBeDefined();
    expect(verifiedCinematicReference({title:'离心机级联物理破坏',
      originalRequest:'三台剖面离心机，HMI显示正常而物理转速偏离，注入后真实级联解体并让碎片飞散。',
      description:'模型计划分别介绍第一台离心机和第二台离心机；它们仍属教师要求的三台机组。'})).toBeDefined();
    const scene=parseCinematicCandidate(match!.scene);
    expect(scene.title).toBe('工控离心机级联安全实验');
    expect(match!.intent.interactionRequirements).toHaveLength(16);
    expect(scene.nodes.filter(node=>node.model==='centrifuge-housing')).toHaveLength(3);
    expect(scene.nodes.filter(node=>/fragment|debris|碎片/i.test(node.id+' '+node.represents)).length).toBeGreaterThanOrEqual(4);
    expect(scene.learnerControls.some(control=>/estop|stop|急停/i.test(control.id+' '+control.label))).toBe(true);
    const stop=scene.learnerControls.find(control=>/estop|stop|急停/i.test(control.id+' '+control.label))!;
    expect(stop.action).toBe('play-from');
    for (const id of ['fragment_1','fragment_2','fragment_3','fragment_4']) {
      const opacity=scene.tracks.find(track=>track.target===id&&track.property==='opacity')!;
      expect(opacity.keyframes.filter(frame=>frame.value===0).every(frame=>frame.at<
        opacity.keyframes.find(first=>first.value===1)!.at)).toBe(true);
    }
    for (const id of ['rotor_a','rotor_b','rotor_c']) {
      const frames=scene.tracks.find(track=>track.target===id&&track.property==='rotation')!.keyframes;
      const speed=(i:number)=>((frames[i+1].value as number[])[1]-(frames[i].value as number[])[1])/(frames[i+1].at-frames[i].at);
      const stopIndex=frames.findIndex(frame=>frame.at===78);
      expect(speed(stopIndex)).toBeGreaterThanOrEqual(0);
      expect(speed(stopIndex)).toBeLessThan(speed(stopIndex-1));
      for(let index=stopIndex+1;index<frames.length-1;index++)
        expect(speed(index)).toBeLessThanOrEqual(speed(index-1));
      expect(speed(frames.length-2)).toBe(0);
    }
    const qualityOptions={interactionRequirements:match!.intent.interactionRequirements,
      requiredInteractions:match!.intent.interactions,requiredObjects:match!.intent.objects,
      requiredPresentation:match!.intent.presentationRequirements,requireComposition:true};
    const normalization=normalizeCinematicHardware(scene,qualityOptions);
    const normalized=normalization.scene;
    const hmi=normalized.tracks.find(track=>track.target==='hmi_pointer'&&track.property==='rotation')!;
    expect(new Set(hmi.keyframes.map(frame=>JSON.stringify(frame.value))).size).toBe(1);
    expect(normalized.coverage?.interactions.find(item=>item.description==='独立观测显示物理转速持续变化')?.targets)
      .toContain('physical_pointer');
    for(const id of ['fragment_1','fragment_2','fragment_3','fragment_4']) {
      const frames=normalized.tracks.find(track=>track.target===id&&track.property==='opacity')!.keyframes;
      const visibleAt=frames.find(frame=>frame.value===1)!.at;
      expect(frames.some(frame=>frame.at>visibleAt&&frame.value===0)).toBe(false);
    }
    const stopShots=normalized.shots.filter(shot=>shot.at>=78&&shot.at<86);
    expect(stopShots.map(shot=>shot.frame?.nodes)).toEqual([
      ['rotor_a'],['inject_marker'],['rotor_b'],['rotor_c'],['physical_pointer'],
    ]);
    const quality=checkCinematicQuality(normalized,qualityOptions);
    expect(quality.issues.filter(issue=>issue.severity==='error').map(issue=>issue.code)).toEqual([]);
    const twice=normalizeCinematicHardware(normalized,qualityOptions).scene;
    expect(twice.tracks.filter(track=>['hmi_pointer','fragment_1','fragment_2','fragment_3','fragment_4'].includes(track.target)))
      .toEqual(normalized.tracks.filter(track=>['hmi_pointer','fragment_1','fragment_2','fragment_3','fragment_4'].includes(track.target)));
    expect(verifiedCinematicReference({originalRequest:'两台离心机的SCADA级联破坏与碎片'})).toBeUndefined();
    expect(verifiedCinematicReference({originalRequest:'两台离心机的SCADA级联破坏与碎片',
      description:'计划误写成三台剖面离心机。'})).toBeUndefined();
    expect(verifiedCinematicReference({originalRequest:'三台离心机的常规速度控制'})).toBeUndefined();
  });
  it('binds a primitive valve connection through its existing center', () => {
    const original=parseCinematicScene(structuredClone(generatedValvePrimitiveCenter));
    expect(() => resolveCinematicAssembly(original)).toThrow('不是具有资产端口的精细模型');
    const normalized=normalizeCinematicHardware(original);
    const connection=normalized.scene.connections.find(item=>item.id==='flow_path')!;
    expect(connection.fromPort).toBeUndefined();
    expect(connection.toPort).toBeUndefined();
    expect(() => resolveCinematicAssembly(normalized.scene)).not.toThrow();
    const quality=checkCinematicQuality(resolveCinematicAssembly(normalized.scene).scene);
    expect(quality.issues.filter(issue=>issue.code==='geometry-overlap'&&
      issue.nodes.every(id=>id.startsWith('flow_marker_'))).every(issue=>issue.severity==='warning')).toBe(true);
  });
  it('keeps processor package and interposer boxes apart throughout an exploded track', () => {
    const original=parseCinematicScene(structuredClone(generatedCpuLayerCrossing));
    expect(checkCinematicQuality(original).issues.some(issue=>issue.code==='geometry-overlap'&&
      issue.nodes.includes('ceramic_package')&&issue.nodes.includes('copper_interposer'))).toBe(true);
    const normalized=normalizeCinematicHardware(original);
    expect(normalized.adjustments.some(item=>item.includes('processor-layer-clearance'))).toBe(true);
    expect(checkCinematicQuality(normalized.scene).issues.some(issue=>issue.code==='geometry-overlap'&&
      issue.nodes.includes('ceramic_package')&&issue.nodes.includes('copper_interposer'))).toBe(false);
    expect(normalizeCinematicHardware(normalized.scene).scene.tracks).toEqual(normalized.scene.tracks);
  });
  it('rebinds generated physical and independent pointers to chapters with measured visible motion',()=>{
    const options:CinematicQualityOptions={interactionRequirements:[
      {description:'物理转速持续变化',kind:'state-change'},
      {description:'独立观测持续变化',kind:'state-change'},
    ]};
    const normalized=normalizeCinematicHardware(parseCinematicScene(structuredClone(generatedStuxPointerReviewCase)),options).scene;
    const before=checkCinematicQuality(normalized,options);
    const rebound=rebindVisibleCinematicStateEvidence(normalized,before);
    expect(rebound?.changes.map(change=>change.description)).toEqual(['物理转速持续变化','独立观测持续变化']);
    expect(rebound?.changes.every(change=>change.to<5)).toBe(true);
    const after=checkCinematicQuality(rebound!.scene,options);
    expect(after.interactionEvidence.filter(item=>['物理转速持续变化','独立观测持续变化'].includes(item.description)).every(item=>item.status==='PASS')).toBe(true);
  });
  it('normalizes a generated centrifuge cascade with bounded interaction evidence',()=>{
    const scene=parseCinematicScene(structuredClone(generatedStuxReviewCase));
    const requirements:CinematicQualityOptions={interactionRequirements:[
        {description:'开始注入',kind:'state-change'},
        {description:'至少4个有体积碎片从隐藏状态显现',kind:'structural-change'},
        {description:'碎片沿不同三维轨道飞散',kind:'transport'},
        {description:'暂停播放',kind:'player-control',controls:['pause']},
        {description:'单步播放',kind:'player-control',controls:['step']},
        {description:'回拖时间轴',kind:'player-control',controls:['seek']},
        {description:'重置演示',kind:'player-control',controls:['reset']},
      ]};
    const normalized=normalizeCinematicHardware(scene,{interactionRequirements:[...requirements.interactionRequirements]});
    expect(normalized.scene.nodes.filter(node=>node.model==='centrifuge-housing').every(node=>node.assetRole==='centrifuge-teaching-enclosure')).toBe(true);
    expect(normalized.scene.coverage?.interactions.find(item=>item.description==='开始注入')?.chapter).toBe(0);
    expect(normalized.scene.coverage?.interactions.find(item=>item.description==='至少4个有体积碎片从隐藏状态显现')?.chapter).toBeLessThan(6);
    expect(normalized.scene.coverage?.interactions.find(item=>item.description==='碎片沿不同三维轨道飞散')?.chapter).toBe(5);
    expect(checkCinematicQuality(normalized.scene,{interactionRequirements:[...requirements.interactionRequirements]}).issues.filter(issue=>issue.severity==='error').map(issue=>({code:issue.code,nodes:issue.nodes,at:issue.at}))).toEqual([]);
  });
  it('grounds a generated valve settling chapter and splits open-seat versus outlet evidence',()=>{
    const scene=parseCinematicScene(structuredClone(generatedValveReviewCase));
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.scene.chapters.find(chapter=>chapter.at===46)?.kind).toBe('inspection');
    expect(normalized.scene.chapters.find(chapter=>chapter.at===68)?.focus).toContain('fluid_flow');
    expect(normalized.scene.chapters.find(chapter=>chapter.at===72)?.focus).not.toContain('fluid_flow');
    expect(normalized.scene.shots.find(shot=>shot.at===46)?.frame?.nodes).toContain('seat_ring');
    expect(normalized.scene.shots.find(shot=>shot.at===70)?.frame?.nodes).toEqual(['fluid_flow','flow_arrow']);
    expect(normalized.scene.shots.find(shot=>shot.at===72)?.frame?.nodes).toContain('gate_disc');
    expect(checkCinematicQuality(normalized.scene).issues.filter(issue=>issue.severity==='error'&&
      ['chapter-no-visible-change','chapter-observation-without-evidence'].includes(issue.code)))
      .toEqual([]);
  });
  it('labels all four scenes as fixtures rather than generated examples', () => {
    expect(referenceScenes).toHaveLength(4);
    expect(new Set(referenceScenes.map((scene) => scene.title)).size).toBe(4);
    for (const scene of referenceScenes) {
      expect(scene.title).toContain('视觉基准');
      expect(scene.subtitle).toContain('单元测试夹具');
      expect(scene.subtitle).toContain('非正式 AI 生成示例');
    }
  });

  describe.each(referenceScenes)('$title', (scene) => {
    it('satisfies the current schema with all defaulted output fields already present', () => {
      expect(parseCinematicScene(structuredClone(scene))).toEqual(scene);
      expect(scene.nodes.filter((node) => node.kind === 'model').length).toBeGreaterThanOrEqual(6);
      expect(scene.chapters.length).toBeGreaterThanOrEqual(4);
      expect(scene.chapters.length).toBeLessThanOrEqual(6);
      expect(scene.shots.length).toBeGreaterThanOrEqual(5);
      expect(scene.shots.length).toBeLessThanOrEqual(8);
      expect(scene.tracks.filter((track) => ['position', 'rotation', 'explode'].includes(track.property)).length).toBeGreaterThanOrEqual(2);
    });

    it('has an actual non-camera state change inside every chapter', () => {
      scene.chapters.forEach((chapter, index) => {
        const end = scene.chapters[index + 1]?.at ?? scene.duration;
        const animated = scene.tracks.some((track) => new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((fraction) => JSON.stringify(valueAt(scene, track.target, track.property, chapter.at + (end - chapter.at) * fraction)))).size > 1);
        expect(animated, chapter.title).toBe(true);
      });
    });

    it('keeps conservative overview bounds inside responsive film-fit and provides a materially closer view', () => {
      const overview = scene.shots[0];
      const overviewDistance = Math.hypot(...subtract(overview.position, overview.target));
      expect(scene.shots.some((shot) => Math.hypot(...subtract(shot.position, shot.target)) < overviewDistance * 0.55)).toBe(true);
      for (const shot of [overview, scene.shots[scene.shots.length - 1]]) {
        const forward = normalize(subtract(shot.target, shot.position));
        const right = normalize(cross(forward, [0, 1, 0]));
        const up = cross(right, forward);
        const tangentY = Math.tan(shot.fov * Math.PI / 360);
        const modelAnchors = scene.nodes.filter((entry) => entry.kind === 'model').map((node) => {
          const relative = subtract(positionAt(scene, node.id, shot.at), shot.position);
          return dot(relative, right) / (dot(relative, forward) * tangentY * (16 / 9));
        });
        const left = Math.min(...modelAnchors);
        const rightEdge = Math.max(...modelAnchors);
        // Anchor span excludes model size, floor and links; rendered model bounds are wider.
        // This rejects the original tiny-center overview without pretending to measure pixels.
        expect((rightEdge - left) / 2, 'desktop model-anchor span').toBeGreaterThan(0.4);
        expect(Math.abs((rightEdge + left) / 2), 'desktop subject centering').toBeLessThan(0.2);
        for (const aspect of [0.9, 1.5, 16 / 9, 2]) {
          // Match the player's responsive film-fit contract, not a wider clipping tolerance.
          const fit = Math.max(1, (16 / 9) / aspect);
          const fittedPosition = shot.target.map((value, axis) => value + (shot.position[axis] - value) * fit) as Vector;
          for (const node of scene.nodes.filter((entry) => entry.kind === 'model')) {
            const relative = subtract(positionAt(scene, node.id, shot.at), fittedPosition);
            const radius = 2.5 * Math.max(...node.scale);
            const depth = dot(relative, forward);
            expect(depth - radius, node.id).toBeGreaterThan(0.1);
            const tangentX = tangentY * aspect;
            expect((depth * tangentX - Math.abs(dot(relative, right))) / Math.hypot(1, tangentX), `${node.id}, aspect ${aspect}, horizontal`).toBeGreaterThan(radius);
            expect((depth * tangentY - Math.abs(dot(relative, up))) / Math.hypot(1, tangentY), `${node.id}, vertical`).toBeGreaterThan(radius);
          }
        }
      }
    });
  });

  it('makes industrial captions agree with divergence, independent observation and calibration', () => {
    const scene = referenceScenes[0];
    const x = (id: string, time: number) => positionAt(scene, id, time)[0];
    expect(x('actual-marker', 12)).toBe(x('display-marker', 12));
    expect(x('actual-marker', 40)).toBeGreaterThan(x('display-marker', 40) + 2);
    expect(x('independent-marker', 56)).toBe(x('actual-marker', 56));
    expect(x('display-marker', 56)).not.toBe(x('actual-marker', 56));
    for (const time of [72, 76, 80, 84]) {
      expect(x('display-marker', time)).toBe(x('actual-marker', time));
      expect(x('independent-marker', time)).toBe(x('actual-marker', time));
    }
    expect(valueAt(scene, 'turbine-left', 'explode', 22)).toBe(0.5);
    expect(valueAt(scene, 'turbine-left', 'explode', 32)).toBe(0);
  });

  it('separates local-state changes, return-value transfer and frame release', () => {
    const scene = referenceScenes[1];
    expect(positionAt(scene, 'callee-frame', 24)[1]).toBeGreaterThan(positionAt(scene, 'caller-frame', 24)[1]);
    expect(positionAt(scene, 'callee-value', 40)[0]).toBeGreaterThan(positionAt(scene, 'callee-value', 32)[0]);
    expect(positionAt(scene, 'caller-value', 40)).toEqual(positionAt(scene, 'caller-value', 0));
    expect(valueAt(scene, 'callee-frame', 'opacity', 58)).toBe(1);
    expect(positionAt(scene, 'return-token', 58)[0]).toBe(positionAt(scene, 'result-bank', 58)[0]);
    expect(valueAt(scene, 'callee-value', 'opacity', 80)).toBe(0);
    expect(valueAt(scene, 'return-token', 'opacity', 80)).toBe(1);
    expect(positionAt(scene, 'return-token', 80)).toEqual(positionAt(scene, 'return-token', 58));
    expect(positionAt(scene, 'caller-frame', 80)).toEqual(positionAt(scene, 'caller-frame', 0));
  });

  it('preserves strand order while separating and restoring actual base-pair geometry', () => {
    const scene = referenceScenes[2];
    const separation = (time: number) => positionAt(scene, 'right-strand', time)[0] - positionAt(scene, 'left-strand', time)[0];
    expect(separation(28)).toBeGreaterThan(separation(0));
    expect(separation(62)).toBe(separation(0));
    for (let index = 0; index < 4; index += 1) {
      expect(valueAt(scene, `pair-bond-${index}`, 'opacity', 28)).toBe(0);
      expect(valueAt(scene, `pair-bond-${index}`, 'opacity', 62)).toBe(0);
      expect(valueAt(scene, `pair-bond-${index}`, 'opacity', 74)).toBe(1);
      expect(positionAt(scene, `base-left-${index}`, 0)[1]).toBe(positionAt(scene, `base-left-${index}`, 48)[1]);
      expect(valueAt(scene, `base-left-${index}`, 'emissive', 34 + index * 2)).toBeGreaterThan(valueAt(scene, `base-right-${index}`, 'emissive', 34 + index * 2) as number);
    }
  });

  it('provides a real centrifuge assembly, visible rotor motion and deterministic experiment controls', () => {
    const scene = referenceScenes[3];
    const range = scene.learnerControls.find((control) => control.type === 'range');
    expect(range).toMatchObject({ id: 'rotor-input', timeRange: [0, 76] });
    expect(scene.learnerControls.filter((control) => control.type === 'button').map((control) => control.action)).toEqual(['play-from', 'pause', 'seek', 'reset']);
    for (const suffix of ['a', 'b', 'c']) {
      const rotor = scene.nodes.find((entry) => entry.id === `rotor-${suffix}`)!;
      const stripe = scene.nodes.find((entry) => entry.id === `rotor-${suffix}-stripe`)!;
      expect(rotor).toMatchObject({ kind: 'cylinder', parent: `centrifuge-${suffix}`, role: 'primary' });
      expect(stripe.parent).toBe(rotor.id);
      expect(Math.hypot(stripe.position[0], stripe.position[2])).toBeGreaterThan(0.25);
      const rotation = scene.tracks.find((entry) => entry.target === rotor.id && entry.property === 'rotation')!;
      const turns = ((rotation.keyframes.at(-1)!.value as Vector)[1] - (rotation.keyframes[0].value as Vector)[1]) / (Math.PI * 2);
      expect(turns).toBeGreaterThanOrEqual(18);
    }
    expect(positionAt(scene, 'actual-state', 48)[0]).toBeGreaterThan(positionAt(scene, 'displayed-state', 48)[0] + 2);
    expect(positionAt(scene, 'independent-state', 48)[0]).toBe(positionAt(scene, 'actual-state', 48)[0]);
    expect(cinematicHardwareGeometryIssues(scene)).toEqual([]);
  });

  it('normalizes damage onset, source deformation and close-up timing without model retries', () => {
    const baseline = structuredClone(referenceScenes[3]);
    const normalized = normalizeCinematicHardware(baseline);
    expect(normalized.adjustments).toEqual(expect.arrayContaining([
      'centrifuge-c-unsupported-explode',
      'debris-c-1-launch-clearance',
      'shot-58-damage-start',
    ]));
    expect(normalized.scene.tracks.find(track=>track.target==='centrifuge-c'&&track.property==='explode')).toBeUndefined();
    expect(normalized.scene.tracks.find(track=>track.target==='centrifuge-c'&&track.property==='scale')).toBeDefined();
    expect(normalized.scene.shots.find(shot=>shot.frame?.nodes.includes('debris-c-1'))?.at).toBe(48);
    const opacity=normalized.scene.tracks.find(track=>track.target==='debris-c-1'&&track.property==='opacity')!;
    expect(opacity.keyframes.some(frame=>frame.at>47.9&&frame.at<48.2&&frame.value===0)).toBe(true);
    const position=normalized.scene.tracks.find(track=>track.target==='debris-c-1'&&track.property==='position')!;
    expect(position.keyframes.some(frame=>frame.at===48.2)).toBe(true);
    expect(baseline.tracks.find(track=>track.target==='centrifuge-c'&&track.property==='explode')).toBeDefined();
  });

  it('keeps emergency-stop rotor normalization idempotent across validation passes', () => {
    const first = normalizeCinematicHardware(structuredClone(referenceScenes[3]));
    const second = normalizeCinematicHardware(first.scene);
    const rotorTracks = (scene: CinematicScene) => scene.tracks
      .filter(track => track.property === 'rotation' && /^rotor-/.test(track.target))
      .map(track => ({ target: track.target, keyframes: track.keyframes }));
    expect(rotorTracks(second.scene)).toEqual(rotorTracks(first.scene));
    expect(second.scene.tracks.flatMap(track => track.keyframes)
      .flatMap(frame => Array.isArray(frame.value) ? frame.value : [frame.value])
      .every(value => Math.abs(value) <= 200)).toBe(true);
  });

  it('moves a centrifuge rotor position track into its cavity and accepts a thin arc marker', () => {
    const baseline = structuredClone(referenceScenes[3]);
    const rotor = baseline.nodes.find(node => node.id === 'rotor-a')!;
    const stripe = baseline.nodes.find(node => node.id === 'rotor-a-stripe')!;
    rotor.position = [0, 0, 3.8];
    baseline.tracks.push({
      target: rotor.id,
      property: 'position',
      easing: 'smooth',
      keyframes: [
        { at: 0, value: [0, 0, 3.8] },
        { at: 48, value: [0.4, -0.2, 3.1] },
        { at: baseline.duration, value: [0.4, -0.2, 3.1] },
      ],
    });
    stripe.kind = 'cylinder';
    stripe.params = { top: 0.04, bottom: 0.04, height: 1.4, thetaStart: 0, thetaLength: 0.35, openEnded: true };
    const normalized = normalizeCinematicHardware(baseline).scene;
    const first = normalized.tracks.find(track => track.target === rotor.id && track.property === 'position')!.keyframes[0].value;
    expect(Array.isArray(first)).toBe(true);
    (first as [number, number, number]).forEach((value, axis) =>
      expect(value).toBeCloseTo(normalized.nodes.find(node => node.id === rotor.id)!.position[axis], 10),
    );
    expect(cinematicHardwareGeometryIssues(normalized).some(issue =>
      ['hardware-rotor-outside-cavity', 'hardware-centrifuge-stripe-missing'].includes(issue.code),
    )).toBe(false);
  });

  it('recovers exact requirement identities and runtime-control evidence on durable drafts', () => {
    const scene = structuredClone(referenceScenes[3]);
    scene.nodes.find(node=>node.id==='centrifuge-a')!.opacity=.18;
    scene.nodes.find(node=>node.id==='rotor-a-stripe')!.opacity=.55;
    scene.coverage={objects:[{name:'剖切离心机外壳',nodes:['centrifuge-a']}],interactions:[{
      description:'观察离心机内部',chapter:0,targets:['rotor-a','rotor-a-stripe'],properties:['explore'],
    }]};
    const normalized=normalizeCinematicHardware(scene,{
      requireComposition:true,
      requiredObjects:['离心机外壳'],
      requiredInteractions:['观察离心机内部','暂停播放','旋转与缩放观察'],
      interactionRequirements:[
        {description:'观察离心机内部',kind:'view'},
        {description:'暂停播放',kind:'player-control',controls:['pause']},
        {description:'旋转与缩放观察',kind:'view'},
      ],
    });
    expect(normalized.scene.coverage?.objects).toContainEqual({name:'离心机外壳',nodes:['centrifuge-a']});
    expect(normalized.scene.coverage?.interactions.find(item=>item.description==='暂停播放')).toMatchObject({
      chapter:0,properties:['controls'],controls:['pause'],
    });
    expect(normalized.scene.coverage?.interactions.find(item=>item.description==='旋转与缩放观察')).toMatchObject({properties:['explore']});
    expect(normalized.scene.coverage?.interactions.find(item=>item.description==='观察离心机内部')?.targets).toEqual(['rotor-a']);
    expect(()=>parseCinematicScene(normalized.scene)).not.toThrow();
  });

  it('keeps only visible evidence targets for a declared close-up view', () => {
    const scene=structuredClone(referenceScenes[3]);
    const visible='rotor-a',hidden='rotor-b-stripe',description='进入专门破坏近景';
    scene.nodes.find(node=>node.id===hidden)!.opacity=0;
    scene.coverage={objects:[],presentation:[],interactions:[{
      description,chapter:0,targets:[visible,hidden],properties:['position','scale','opacity'],
    }]};
    const normalized=normalizeCinematicHardware(scene,{
      requiredInteractions:[description],
      interactionRequirements:[{description,kind:'view'}],
    });
    expect(normalized.scene.coverage.interactions[0].targets).toEqual([visible]);
    expect(normalized.adjustments).toContain('coverage-view-visible-0');
    expect(checkCinematicQuality(normalized.scene,{
      requiredInteractions:[description],
      interactionRequirements:[{description,kind:'view'}],
    }).issues.map(issue=>issue.code)).not.toContain('request-interaction-kind-mismatch');
  });

  it('moves a stale destruction view to the chapter with the most visible targets',()=>{
    const scene=structuredClone(referenceScenes[3]),description='观察专门破坏近景';
    const targets=['debris-c-1','debris-c-2','debris-c-3','debris-c-4'];
    scene.coverage={objects:[],presentation:[],interactions:[{
      description,chapter:0,targets,properties:['explore'],
    }]};
    const normalized=normalizeCinematicHardware(scene,{
      requiredInteractions:[description],interactionRequirements:[{description,kind:'view'}],
    });
    const interaction=normalized.scene.coverage!.interactions[0];
    expect(interaction.chapter).toBe(2);
    expect(interaction.targets.length).toBeGreaterThanOrEqual(2);
    expect(normalized.adjustments).toContain('coverage-view-2');
  });

  it('keeps destruction evidence visible for a dedicated inspection chapter',()=>{
    const scene=structuredClone(referenceScenes[3]),target='debris-c-1',chapter=scene.chapters.at(-1)!;
    chapter.at=70;chapter.kind='inspection';chapter.title='破坏近景';chapter.caption='暂停观察碎片和断口的真实体积。';chapter.focus=[target];
    const opacity=scene.tracks.find(track=>track.target===target&&track.property==='opacity')!;
    opacity.keyframes=[{at:0,value:0},{at:48,value:1},{at:69,value:1},{at:70,value:0},{at:scene.duration,value:0}];
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain(`${target}-damage-inspection-visible`);
    const repaired=normalized.scene.tracks.find(track=>track.target===target&&track.property==='opacity')!;
    expect(repaired.keyframes.find(frame=>frame.at===70)?.value).toBe(1);
    expect(repaired.keyframes.find(frame=>Math.abs(frame.at-(scene.duration-.001))<.0001)?.value).toBe(1);
  });

  it('remaps stale generated interaction evidence to its real visible motion chapter', () => {
    const scene=structuredClone(referenceScenes[3]);
    const state='开始注入',destruction='临界阶段机壳与转子发生同步真实解体变化',
      transport='至少4个有体积碎片从隐藏状态显现并沿不同三维轨道飞散';
    scene.coverage!.interactions=[
      {description:state,chapter:2,targets:['rotor-a'],properties:['transport']},
      {description:destruction,chapter:2,targets:['centrifuge-c','rotor-c'],properties:['rotation']},
      {description:transport,chapter:2,targets:['debris-c-1','debris-c-2','debris-c-3','debris-c-4'],properties:['opacity']},
    ];
    const options={
      requiredInteractions:[state,destruction,transport],
      interactionRequirements:[
        {description:state,kind:'state-change' as const},
        {description:destruction,kind:'structural-change' as const},
        {description:transport,kind:'transport' as const},
      ],
    };
    const normalized=normalizeCinematicHardware(scene,options).scene;
    const stateMapping=normalized.coverage!.interactions.find(item=>item.description===state)!;
    const destructionMapping=normalized.coverage!.interactions.find(item=>item.description===destruction)!;
    const transportMapping=normalized.coverage!.interactions.find(item=>item.description===transport)!;
    expect(stateMapping).toMatchObject({chapter:0,properties:['rotation']});
    expect(destructionMapping.chapter).toBe(3);
    expect(destructionMapping.properties).not.toContain('rotation');
    expect(destructionMapping.properties.some(property=>['position','scale','explode'].includes(property))).toBe(true);
    expect(transportMapping.chapter).toBe(3);
    expect(transportMapping.properties).toContain('position');
    expect(normalized.shots.find(shot=>shot.at===44)?.frame?.nodes
      .some(id=>destructionMapping.targets.includes(id))).toBe(true);
    expect(checkCinematicQuality(normalized,options).issues.map(issue=>issue.code))
      .not.toContain('request-interaction-kind-mismatch');
  });

  it('keeps split fragment reveal and transport evidence observable in the damage chapter',()=>{
    const scene=structuredClone(referenceScenes[3]);
    const reveal='至少4个有体积碎片从隐藏状态显现',transport='碎片沿不同三维轨道飞散';
    const targets=['debris-c-1','debris-c-2','debris-c-3','debris-c-4'];
    scene.coverage!.interactions=[
      {description:reveal,chapter:4,targets,properties:['opacity']},
      {description:transport,chapter:4,targets,properties:['position','transport']},
    ];
    const options={requiredInteractions:[reveal,transport],interactionRequirements:[
      {description:reveal,kind:'state-change' as const},
      {description:transport,kind:'transport' as const},
    ]};
    const normalized=normalizeCinematicHardware(scene,options);
    const revealEvidence=normalized.scene.coverage!.interactions.find(item=>item.description===reveal)!;
    const transportEvidence=normalized.scene.coverage!.interactions.find(item=>item.description===transport)!;
    expect(revealEvidence.chapter).toBe(3);
    expect(transportEvidence.chapter).toBe(3);
    expect(revealEvidence.properties).toEqual(['opacity','position']);
    expect(transportEvidence.properties).toEqual(['position','transport']);
    expect(normalized.adjustments).toContain('coverage-breakup-state-change-3');
    expect(normalized.adjustments).toContain('coverage-breakup-transport-3');
    expect(checkCinematicQuality(normalized.scene,options).issues.map(issue=>issue.code))
      .not.toContain('request-interaction-kind-mismatch');
  });

  it('rebinds normal HMI evidence from a hidden physical needle to the visible display channel',()=>{
    const scene=structuredClone(referenceScenes[3]),description='HMI显示保持正常值';
    scene.coverage!.interactions=[{description,chapter:4,targets:['actual-state'],properties:['position']}];
    const actualOpacity=scene.tracks.find(track=>track.target==='actual-state'&&track.property==='opacity');
    if(actualOpacity)actualOpacity.keyframes=[{at:0,value:1},{at:64,value:0},{at:76,value:0}];
    else scene.tracks.push({target:'actual-state',property:'opacity',easing:'linear',keyframes:[{at:0,value:1},{at:64,value:0},{at:76,value:0}]});
    const options={requiredInteractions:[description],interactionRequirements:[{description,kind:'state-change' as const}]};
    const normalized=normalizeCinematicHardware(scene,options);
    const evidence=normalized.scene.coverage!.interactions[0];
    expect(evidence.targets).toEqual(['displayed-state']);
    expect(evidence.properties).toEqual(['position']);
    expect(normalized.adjustments).toContain(`coverage-hmi-display-${evidence.chapter}`);
    expect(checkCinematicQuality(normalized.scene,options).issues.map(issue=>issue.code))
      .not.toContain('request-interaction-kind-mismatch');
  });

  it('replaces a destroyed hidden rotor in a later action focus with visible moving evidence',()=>{
    const scene=structuredClone(referenceScenes[3]),chapter=scene.chapters.at(-1)!;
    chapter.kind='action';chapter.focus=['rotor-c'];
    scene.learnerControls=scene.learnerControls.filter(control=>control.id!=='emergency-stop');
    scene.tracks.push({target:'rotor-c',property:'opacity',easing:'linear',keyframes:[
      {at:0,value:1},{at:chapter.at,value:0},{at:scene.duration,value:0},
    ]});
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.scene.chapters.at(-1)!.focus).not.toContain('rotor-c');
    expect(normalized.scene.chapters.at(-1)!.focus.length).toBeGreaterThan(0);
    expect(normalized.adjustments).toContain(`chapter-${chapter.at}-visible-action-focus`);
    expect(checkCinematicQuality(normalized.scene).issues.filter(issue=>
      issue.code==='chapter-focus-invisible'&&issue.at===chapter.at&&issue.severity==='error')).toEqual([]);
  });

  it('requires a chapter focus to stay hidden across all browser samples before rejecting it', () => {
    const scene=referenceScenes[3], evidence=(visibleSamples:number[])=>({frames:visibleSamples.map((visible,index)=>({
      at:index*8,width:1440,screenshotSha256:'a'.repeat(64),canvasSha256:'b'.repeat(64),
      diagnostics:{available:true,nodes:[{id:'rotor-a',visibility:{method:'mesh-rays-v1',status:'sampled',samples:9,visibleSamples:visible,blockers:[{id:'centrifuge-a',samples:9-visible}]}}]},
      pixels:{brightFraction:.2,colorBuckets:4},
    }))} as unknown as CinematicRenderInspection['evidence']);
    expect(cinematicOcclusionIssues(evidence([0,2]),scene)).toEqual([]);
    expect(cinematicOcclusionIssues(evidence([0,0]),scene)).toEqual([expect.objectContaining({code:'occluded-focus',nodes:['rotor-a'],at:0})]);
  });

  it('accepts a destruction close-up when two sibling fragments remain browser-visible', () => {
    const scene=structuredClone(referenceScenes[3]),chapter=scene.chapters.findIndex(item=>item.at===48);
    const ids=['debris-c-1','debris-c-2','debris-c-3'];
    scene.chapters[chapter].focus=ids;
    const evidence={frames:[{at:48,width:1440,diagnostics:{available:true,nodes:ids.map((id,index)=>({
      id,visibility:{method:'mesh-rays-v1',status:'sampled',samples:9,visibleSamples:index===0?0:3,blockers:index===0?[{id:'centrifuge-c',samples:9}]:[]},
    }))}}]} as unknown as CinematicRenderInspection['evidence'];
    expect(cinematicOcclusionIssues(evidence,scene)).toEqual([]);
  });

  it('keeps restoration shots frameable after temporary layer guides fade out', () => {
    const scene=structuredClone(referenceScenes[0]), temporary='display-marker';
    scene.shots[0].frame={nodes:[temporary],padding:1.2};
    scene.nodes.find(node=>node.id===temporary)!.opacity=0;
    scene.tracks=scene.tracks.filter(track=>!(track.target===temporary&&track.property==='opacity'));
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain('shot-0-visible-frame-anchor');
    expect(normalized.scene.shots[0].frame?.nodes.some(id=>id!==temporary)).toBe(true);
    expect(()=>parseCinematicScene(normalized.scene)).not.toThrow();
  });

  it('rejects incomplete centrifuge assemblies before a generated artifact can be published', () => {
    const baseline = structuredClone(referenceScenes[3]);
    const missingRotor = structuredClone(baseline);
    missingRotor.nodes = missingRotor.nodes.filter((entry) => !['rotor-a', 'rotor-a-stripe'].includes(entry.id));
    expect(cinematicHardwareGeometryIssues(missingRotor).map((issue) => issue.code)).toContain('hardware-centrifuge-rotor-missing');

    const missingStripe = structuredClone(baseline);
    missingStripe.nodes = missingStripe.nodes.filter((entry) => entry.id !== 'rotor-b-stripe');
    expect(cinematicHardwareGeometryIssues(missingStripe).map((issue) => issue.code)).toContain('hardware-centrifuge-stripe-missing');

    const missingControl = structuredClone(baseline);
    missingControl.learnerControls = missingControl.learnerControls.filter((control) => control.type !== 'range');
    expect(cinematicHardwareGeometryIssues(missingControl).map((issue) => issue.code)).toContain('hardware-centrifuge-learner-control-missing');

    const hiddenStripe = structuredClone(baseline);
    hiddenStripe.nodes.find((entry) => entry.id === 'rotor-c-stripe')!.position = [0.3, 0, 0];
    expect(cinematicHardwareGeometryIssues(hiddenStripe).map((issue) => issue.code)).toContain('hardware-centrifuge-stripe-occluded');

    const missingEvidence = structuredClone(baseline);
    missingEvidence.coverage = {objects: [], presentation: [], interactions: [{description: 'HMI显示转速与物理真实转速分离', chapter: 2, targets: ['displayed-state', 'actual-state'], properties: ['position']}]};
    missingEvidence.tracks = missingEvidence.tracks.filter((track) => track.target !== 'displayed-state');
    expect(cinematicHardwareGeometryIssues(missingEvidence).map((issue) => issue.code)).toContain('hardware-hmi-physical-evidence-missing');

    const missingEmergency = structuredClone(baseline);
    missingEmergency.coverage = {objects: [], presentation: [], interactions: [{description: '紧急停机', chapter: 4, targets: ['rotor-a'], properties: ['rotation']}]};
    missingEmergency.learnerControls = missingEmergency.learnerControls.filter((control) => control.id !== 'emergency-stop');
    expect(cinematicHardwareGeometryIssues(missingEmergency).map((issue) => issue.code)).toContain('hardware-emergency-stop-control-missing');

    const controlledStop = structuredClone(baseline);
    controlledStop.coverage = {objects: [], presentation: [], interactions: [{description: '紧急停机', chapter: 4, targets: ['rotor-a', 'rotor-b', 'rotor-c'], properties: ['rotation']}]};
    expect(cinematicHardwareGeometryIssues(controlledStop).map((issue) => issue.code)).not.toContain('hardware-emergency-stop-motion-missing');
    controlledStop.tracks.find((track) => track.target === 'rotor-c' && track.property === 'rotation')!.keyframes =
      controlledStop.tracks.find((track) => track.target === 'rotor-c' && track.property === 'rotation')!.keyframes.filter((frame) => frame.at !== 64);
    expect(cinematicHardwareGeometryIssues(controlledStop).map((issue) => issue.code)).toContain('hardware-emergency-stop-motion-missing');
    const repairedStop=normalizeCinematicHardware(controlledStop);
    expect(repairedStop.adjustments).toContain('rotor-c-emergency-keyframe');
    expect(cinematicHardwareGeometryIssues(repairedStop.scene).map((issue) => issue.code)).not.toContain('hardware-emergency-stop-motion-missing');
    const flatBoundary=structuredClone(baseline);
    for(const track of flatBoundary.tracks.filter(track=>track.property==='rotation'&&track.target.startsWith('rotor-'))){
      const stop=track.keyframes.find(frame=>frame.at===64),previous=track.keyframes.filter(frame=>frame.at<64).at(-1);
      if(stop&&previous)stop.value=structuredClone(previous.value);
    }
    expect(cinematicHardwareGeometryIssues(flatBoundary).map(issue=>issue.code)).toContain('hardware-emergency-stop-motion-missing');
    expect(cinematicHardwareGeometryIssues(normalizeCinematicHardware(flatBoundary).scene).map(issue=>issue.code)).not.toContain('hardware-emergency-stop-motion-missing');

    const staleCoverage=structuredClone(baseline);
    const stale=staleCoverage.coverage!.interactions.find(interaction=>/紧急停机/.test(interaction.description))!;
    stale.chapter=staleCoverage.chapters.length-1;
    stale.targets=['actual-state'];
    stale.properties=['position'];
    const repairedCoverage=normalizeCinematicHardware(staleCoverage);
    const repaired=repairedCoverage.scene.coverage!.interactions.find(interaction=>/紧急停机/.test(interaction.description))!;
    const emergency=staleCoverage.learnerControls.find(control=>control.type==='button'&&control.id==='emergency-stop')!;
    expect(repaired.chapter).toBe(staleCoverage.chapters.findLastIndex(chapter=>chapter.at<=(emergency.type==='button'?emergency.at!:0)));
    expect(repaired.targets).toEqual(['rotor-a','rotor-b','rotor-c']);
    expect(repaired.properties).toEqual(['rotation']);
    expect(repairedCoverage.adjustments).toContain(`coverage-emergency-stop-${repaired.chapter}`);

    const tinyReceipt=structuredClone(baseline);
    const tinyStop=tinyReceipt.learnerControls.find(control=>control.type==='button'&&control.id==='emergency-stop')!;
    const tinyAt=tinyStop.type==='button'?tinyStop.at!:64;
    for(const track of tinyReceipt.tracks.filter(track=>track.property==='rotation'&&track.target.startsWith('rotor-'))){
      const exact=track.keyframes.find(frame=>frame.at===tinyAt)!;
      const value=structuredClone(exact.value) as [number,number,number];
      track.keyframes=track.keyframes.filter(frame=>frame.at<=tinyAt);
      track.keyframes.push(
        {at:tinyAt+1,value:[value[0],value[1]+.01,value[2]]},
        {at:tinyReceipt.duration,value:[value[0],value[1]+.01,value[2]]},
      );
    }
    const visibleStop=normalizeCinematicHardware(tinyReceipt).scene;
    for(const track of visibleStop.tracks.filter(track=>track.property==='rotation'&&track.target.startsWith('rotor-'))){
      const exact=track.keyframes.find(frame=>frame.at===tinyAt)!.value as number[];
      const final=track.keyframes.at(-1)!.value as number[];
      expect(Math.abs(final[1]-exact[1])).toBeGreaterThanOrEqual(.18);
    }
    const visibleEvidence=visibleStop.coverage!.interactions.find(interaction=>/紧急停机/.test(interaction.description))!;
    expect(visibleEvidence.targets).toEqual(['rotor-a','rotor-b','rotor-c']);
    expect(visibleStop.chapters[visibleEvidence.chapter].focus).toEqual(['rotor-a','rotor-b','rotor-c']);
    const stopStart=visibleStop.chapters[visibleEvidence.chapter].at;
    const stopEnd=visibleStop.chapters[visibleEvidence.chapter+1]?.at??visibleStop.duration;
    const stopShots=visibleStop.shots.filter(shot=>shot.at>=stopStart&&shot.at<stopEnd&&shot.frame);
    expect(stopShots.length).toBeGreaterThanOrEqual(3);
    expect(stopShots.every(shot=>shot.frame!.nodes.length===1&&/^rotor-[abc]$/.test(shot.frame!.nodes[0]))).toBe(true);
  });

  it('uses a visible disconnect state when destruction has already hidden every stopped rotor',()=>{
    const scene=structuredClone(referenceScenes[3]);
    const stop=scene.learnerControls.find(control=>control.type==='button'&&control.id==='emergency-stop')!;
    const at=stop.type==='button'?stop.at!:64;
    for(const rotor of ['rotor-a','rotor-b','rotor-c'])scene.tracks.push({
      target:rotor,property:'opacity',easing:'linear',keyframes:[{at:0,value:1},{at:at-4,value:1},{at,value:0},{at:scene.duration,value:0}],
    });
    scene.nodes.push({id:'emergency-link-break',kind:'box',position:[0,1,4],rotation:[0,0,0],scale:[1,1,1],
      params:{width:.8,height:.2,depth:.2},color:'#ff775f',opacity:0,metalness:0,roughness:.6,emissive:0,role:'logic',
      represents:'紧急停机链路断开',label:'停机断口'});
    scene.tracks.push({target:'emergency-link-break',property:'opacity',easing:'linear',keyframes:[
      {at:0,value:0},{at,value:0},{at:at+3,value:1},{at:scene.duration,value:1},
    ]});
    scene.coverage!.interactions.push({description:'紧急停机',chapter:0,targets:['rotor-a','rotor-b','rotor-c'],properties:['rotation']});
    const normalized=normalizeCinematicHardware(scene).scene;
    const evidence=normalized.coverage!.interactions.find(item=>item.description==='紧急停机')!;
    expect(evidence.chapter).toBe(4);
    expect(evidence.targets).toContain('emergency-link-break');
    expect(evidence.properties).toContain('opacity');
    expect(normalized.shots.find(shot=>shot.at===at)?.frame?.nodes).toEqual(['displayed-state','actual-state']);
    expect(normalized.shots.findLast(shot=>shot.at<at)?.frame?.nodes).not.toContain('emergency-link-break');
  });

  it('frames the stop panel without mixing it with distant destruction debris',()=>{
    const scene=structuredClone(referenceScenes[3]);
    const stop=scene.learnerControls.find(control=>control.type==='button'&&control.id==='emergency-stop')!;
    const at=stop.type==='button'?stop.at!:64,chapter=scene.chapters.findLastIndex(item=>item.at<=at);
    for(const rotor of ['rotor-a','rotor-b','rotor-c'])scene.tracks.push({
      target:rotor,property:'opacity',easing:'linear',keyframes:[{at:0,value:1},{at:at-2,value:1},{at,value:0},{at:scene.duration,value:0}],
    });
    const base=structuredClone(scene.nodes.find(node=>node.kind==='box')!);
    scene.nodes.push(
      {...base,id:'physical-pointer',parent:undefined,role:'logic',represents:'物理转速指针',position:[-1,1,4],opacity:1},
      {...base,id:'hmi-pointer',parent:undefined,role:'logic',represents:'HMI显示指针',position:[1,1,4],opacity:1},
      {...base,id:'far-emergency-fragment',parent:undefined,role:'logic',represents:'紧急停机状态碎片',position:[12,6,-8],opacity:1},
    );
    scene.tracks.push(
      {target:'physical-pointer',property:'rotation',easing:'linear',keyframes:[{at:0,value:[0,0,0]},{at,value:[0,0,1]},{at:at+3,value:[0,0,.2]}]},
      {target:'hmi-pointer',property:'rotation',easing:'linear',keyframes:[{at:0,value:[0,0,0]},{at,value:[0,0,.1]},{at:at+3,value:[0,0,.3]}]},
      {target:'far-emergency-fragment',property:'position',easing:'linear',keyframes:[{at:0,value:[0,0,0]},{at,value:[12,6,-8]},{at:at+3,value:[20,10,-14]}]},
    );
    scene.chapters[chapter].focus=['rotor-a','rotor-b','rotor-c','physical-pointer','hmi-pointer'];
    scene.coverage!.interactions.push({description:'紧急停机',chapter:0,targets:['far-emergency-fragment'],properties:['position']});
    const normalized=normalizeCinematicHardware(scene).scene;
    expect(normalized.shots.find(shot=>shot.at===at)?.frame?.nodes).toEqual(['physical-pointer','hmi-pointer']);
    expect(normalized.shots.find(shot=>shot.at===at)?.frame?.nodes).not.toContain('far-emergency-fragment');
  });

  it('keeps destruction fragments out of a later stop chapter when the seek control points earlier',()=>{
    const scene=structuredClone(referenceScenes[3]);
    const stop=scene.chapters.at(-1)!;
    const emergency=scene.learnerControls.find(control=>control.type==='button'&&control.id==='emergency-stop')!;
    if(emergency.type!=='button')throw Error('expected button');
    emergency.at=stop.at-4;
    stop.focus.push('debris-c-1','debris-c-2');
    for(const shot of scene.shots.filter(item=>item.at>=stop.at&&item.at<scene.duration))
      if(shot.frame)shot.frame.nodes.push('debris-c-1','debris-c-2');
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain(`chapter-${stop.at}-stop-evidence-frame`);
    expect(normalized.scene.chapters.at(-1)!.focus).not.toContain('debris-c-1');
    expect(normalized.scene.chapters.at(-1)!.focus).not.toContain('debris-c-2');
    expect(normalized.scene.shots.filter(item=>item.at>=stop.at&&item.at<scene.duration)
      .flatMap(item=>item.frame?.nodes??[])).not.toContain('debris-c-1');
    expect(normalized.scene.nodes.some(item=>item.id==='debris-c-1')).toBe(true);
    expect(normalized.scene.tracks.some(item=>item.target==='debris-c-1'&&item.property==='position')).toBe(true);
  });

  it('keeps a sectioned valve shell visible but transparent around separately animated internals',()=>{
    const scene=structuredClone(referenceScenes[0]);
    const body=scene.nodes.find(node=>node.kind==='model')!;
    body.model='valve';body.id='valve-body';body.represents='纵向剖切阀体外壳';body.opacity=1;
    const internal=scene.nodes.filter(node=>node!==body).slice(0,2);
    for(const [index,node] of internal.entries()){node.parent=body.id;node.role='primary';node.represents=index?'内部阀杆':'内部阀芯';}
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain('valve-body-section-visibility');
    expect(normalized.scene.nodes.find(node=>node.id==='valve-body')!.opacity).toBe(.62);
  });

  it('keeps a named tracer visible when a summary chapter promises it as evidence',()=>{
    const scene=structuredClone(referenceScenes[0]);
    const tracer=scene.nodes[1];
    tracer.role='logic';tracer.represents='流向示踪粒子';
    const summary=scene.chapters.at(-1)!;summary.kind='summary';summary.caption='示踪粒子在末章保持可见。';summary.focus=[tracer.id];
    scene.tracks.push({target:tracer.id,property:'opacity',easing:'smooth',keyframes:[{at:0,value:1},{at:summary.at,value:0},{at:scene.duration,value:0}]});
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain(`${tracer.id}-summary-visible`);
    expect((normalized.scene.tracks.find(track=>track.target===tracer.id&&track.property==='opacity')!.keyframes.at(-1)!.value)).toBe(1);
  });

  it('promotes an animated transport point cloud to a volumetric teaching marker',()=>{
    const scene=structuredClone(referenceScenes[0]),marker=structuredClone(scene.nodes[1]);
    marker.id='flow-points';marker.kind='points';marker.params={count:12,spread:.02,size:.08};marker.role='support';marker.represents='流动介质标记';
    scene.nodes.push(marker);
    scene.tracks.push({target:marker.id,property:'position',easing:'linear',keyframes:[{at:0,value:[-1,0,0]},{at:scene.duration,value:[1,0,0]}]});
    scene.coverage={objects:[{name:'流向标记',nodes:[marker.id]}],presentation:[],interactions:[{description:'介质沿流道流动',chapter:0,targets:[marker.id],properties:['position','transport']}]};
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain('flow-points-volumetric-transport-marker');
    expect(normalized.scene.nodes.find(node=>node.id===marker.id)).toMatchObject({kind:'sphere',params:{radius:.12}});
  });

  it('keeps an explicit animated point collection as the requested teaching object',()=>{
    const scene=structuredClone(referenceScenes[0]),marker=structuredClone(scene.nodes[1]);
    marker.id='flow-particles';marker.kind='points';marker.params={count:4,spread:.04,size:.06};marker.role='support';
    marker.represents='流向标记';marker.points=[[-.6,0,0],[-.2,0,.04],[.2,0,-.04],[.6,0,0]];
    scene.nodes.push(marker);
    scene.tracks.push({target:marker.id,property:'position',easing:'linear',keyframes:[{at:0,value:[-1,0,0]},{at:scene.duration,value:[1,0,0]}]});
    scene.coverage={objects:[{name:'流向标记',nodes:[marker.id]}],presentation:[],interactions:[]};
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain('flow-particles-explicit-point-object');
    expect(normalized.scene.nodes.find(node=>node.id===marker.id)).toMatchObject({kind:'points',role:'primary',points:marker.points});
    expect(cinematicHardwareGeometryIssues(normalized.scene)).toEqual([]);
  });

  it('maps transport coverage to its existing visible position tracks',()=>{
    const scene=structuredClone(referenceScenes[0]),target=scene.tracks.find(track=>track.property==='position')!.target;
    scene.coverage={objects:[],presentation:[],interactions:[{description:'实体沿管路定向移动',chapter:0,targets:[target],properties:['transport']}]};
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.scene.coverage!.interactions[0].properties).toContain('position');
    expect(normalized.adjustments.some(item=>item.includes('transport-position'))).toBe(true);
  });

  it('promotes an animated semantic attachment group into inspectable geometry',()=>{
    const scene=structuredClone(referenceScenes[0]),source=scene.nodes.find(node=>node.role!=='decoration')!;
    const marker={...structuredClone(source),id:'semantic-anchor',kind:'group' as const,parent:undefined,role:'support' as const,represents:'糖-磷酸骨架A',params:{},opacity:0};
    scene.nodes.push(marker);
    scene.tracks.push({target:marker.id,property:'position',easing:'smooth',keyframes:[{at:0,value:[0,0,0]},{at:scene.duration,value:[1,0,0]}]});
    scene.coverage={objects:[{name:'糖-磷酸骨架A',nodes:[marker.id]}],presentation:[],interactions:[]};
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.scene.nodes.find(node=>node.id===marker.id)).toMatchObject({kind:'sphere',opacity:.72,params:{radius:.14}});
    expect(normalized.adjustments).toContain('semantic-anchor-semantic-marker');
  });

  it('rebinds a procedural child object to its concrete detailed owner',()=>{
    const scene=structuredClone(referenceScenes[0]),owner=scene.nodes.find(node=>node.kind==='model')!;
    const marker={...structuredClone(scene.nodes[1]),id:'procedural-pins',kind:'points' as const,parent:owner.id,role:'logic' as const,represents:'周边引脚',points:undefined,params:{count:64,size:.04}};
    scene.nodes.push(marker);
    scene.coverage={objects:[{name:'周边引脚',nodes:[marker.id]}],presentation:[],interactions:[]};
    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.scene.coverage!.objects[0].nodes).toEqual([owner.id]);
  });

  it('deterministically fits generated rotors and their stripes inside the registered housing cavity', () => {
    const oversized = structuredClone(referenceScenes[3]);
    for (const suffix of ['a', 'b', 'c']) {
      const rotor = oversized.nodes.find((entry) => entry.id === `rotor-${suffix}`)!;
      rotor.position = [0.4, 1, -0.2];
      rotor.rotation = [0.3, 0, 0.2];
      rotor.params = {...rotor.params, top: .8, bottom: .8, height: 4};
      oversized.nodes.find((entry) => entry.id === `rotor-${suffix}-stripe`)!.position = [0.3, 0, 0];
    }

    const normalized = normalizeCentrifugeHardware(oversized);
    expect(normalized.adjustments).toEqual(expect.arrayContaining(['rotor-a', 'rotor-a-stripe']));
    expect(cinematicHardwareGeometryIssues(normalized.scene).map((issue) => issue.code)).not.toContain('hardware-rotor-outside-cavity');
    expect(cinematicHardwareGeometryIssues(normalized.scene).map((issue) => issue.code)).not.toContain('hardware-centrifuge-stripe-occluded');
  });

  it('moves centrifuge damage feedback to the cutaway side and narrows forensic framing to nearby evidence', () => {
    const scene = structuredClone(referenceScenes[3]);
    const template = scene.nodes.find((entry) => entry.id === 'rotor-a-stripe')!;
    for (const [suffix, x] of [['a', -2.7], ['b', 0], ['c', 2.7]] as const) {
      const fragment = structuredClone(template);
      fragment.id = `debris-${suffix}`;
      delete fragment.parent;
      fragment.assetRole = 'danger-debris-fragment';
      fragment.represents = `离心机${suffix.toUpperCase()}危险区碎片反馈`;
      fragment.position = [x - .4, -1.85, -.4];
      fragment.params = {width: .1, height: .08, depth: .1};
      scene.nodes.push(fragment);
      scene.tracks.push({target: fragment.id, property: 'position', easing: 'smooth', keyframes: [
        {at: 0, value: [...fragment.position]}, {at: 76, value: [fragment.position[0], -2.1, fragment.position[2]]},
      ]});
    }
    const marker = structuredClone(scene.nodes.find((entry) => entry.id === 'actual-state')!);
    marker.id = 'forensic-marker';
    marker.assetRole = 'forensic-highlight-marker';
    marker.represents = '取证结论光标';
    marker.position = [-1.4, .08, 4.24];
    scene.nodes.push(marker);
    scene.chapters.at(-1)!.focus = ['forensic-marker', 'actual-state', 'displayed-state', 'debris-a', 'drive'];
    scene.shots.at(-2)!.frame = {nodes: ['forensic-marker', 'debris-a', 'debris-b', 'debris-c', 'drive'], padding: 1.05};
    const before = structuredClone(scene);

    const normalized = normalizeCentrifugeHardware(scene);
    const debris = normalized.scene.nodes.find((entry) => entry.id === 'debris-a')!;
    const track = normalized.scene.tracks.find((entry) => entry.target === 'debris-a' && entry.property === 'position')!;
    const delta = debris.position.map((value, index) => value - before.nodes.find((entry) => entry.id === 'debris-a')!.position[index]);
    expect(debris.position[0]).toBeGreaterThan(-2.7);
    expect(debris.position[2]).toBeGreaterThan(0);
    expect(debris.params).toMatchObject({width: .26, height: .14, depth: .2});
    expect((track.keyframes[0].value as number[]).map((value, index) => value - (before.tracks.find((entry) => entry.target === 'debris-a')!.keyframes[0].value as number[])[index])).toEqual(delta);
    expect(normalized.scene.shots.at(-2)!.frame!.nodes).toEqual(['forensic-marker', 'actual-state', 'displayed-state']);
    expect(scene).toEqual(before);
  });
});

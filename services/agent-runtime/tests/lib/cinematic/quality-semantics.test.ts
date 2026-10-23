import { describe, it, expect } from 'vitest';
import {
  checkCinematicQuality,
  type CinematicInteractionRequirement,
} from '@/lib/cinematic/quality';
import { parseCinematicScene, type CinematicScene } from '@/lib/cinematic/schema';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { normalizeCinematicHardware } from '@/lib/cinematic/hardware-geometry';
import { assemblySceneFixture } from '../../fixtures/cinematic-assembly';

const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
const description = '逐步拆开观察内部';
const errors = (scene: CinematicScene, kind?: CinematicInteractionRequirement['kind']) =>
  checkCinematicQuality(
    scene,
    kind
      ? { requiredInteractions: [description], interactionRequirements: [{ description, kind }] }
      : {},
  )
    .issues.filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);
const setEmission = (scene: CinematicScene) => {
  scene.tracks = scene.tracks.map((track) => ({
    ...track,
    property: 'emissive',
    keyframes: [
      { at: 0, value: 0 },
      { at: 60, value: 2 },
    ],
  }));
  scene.coverage!.interactions[0].properties = ['emissive'];
};

describe('phase-aware instructional action evidence', () => {
  it('accepts a real process followed by visible inspection and summary without extra animation', () => {
    const scene = valid();
    scene.tracks.forEach((track) => {
      track.keyframes = [
        { at: 0, value: 0 },
        { at: 20, value: 1 },
      ];
    });
    scene.coverage!.interactions[0].chapter = 0;
    scene.chapters.forEach((chapter, index) => {
      chapter.kind = index === 0 ? 'action' : index === 1 ? 'inspection' : 'summary';
    });
    const original = structuredClone(scene);
    const report = checkCinematicQuality(parseCinematicScene(scene), {
      interactionRequirements: [{ description, kind: 'structural-change' }],
    });
    expect(report.status).toBe('PASS');
    expect(report.chapters[1]).toMatchObject({ kind: 'inspection', visibleChanges: [] });
    expect(report.chapters[2]).toMatchObject({ kind: 'summary', visibleChanges: [] });
    expect(scene).toEqual(original);
  });
  it('rejects summary before any process and inspection without a visible teaching focus', () => {
    const scene = valid();
    scene.chapters[0].kind = 'summary';
    expect(errors(scene)).toContain('chapter-summary-without-process');
    scene.chapters[0].kind = 'inspection';
    scene.chapters[0].focus = [];
    expect(errors(scene)).toContain('chapter-observation-without-evidence');
  });
  it('does not allow static phase labels to replace the global process requirement', () => {
    const scene = valid();
    setEmission(scene);
    scene.coverage!.interactions = [];
    scene.chapters.forEach((chapter) => {
      chapter.kind = 'inspection';
    });
    expect(errors(scene)).toContain('motion-only-rotation');
  });
  it('keeps old optional kind absent and applies the legacy action check', () => {
    const scene = valid();
    scene.tracks.forEach((track) => {
      track.keyframes = [
        { at: 0, value: 0 },
        { at: 20, value: 1 },
      ];
    });
    scene.coverage!.interactions = [];
    expect(parseCinematicScene(scene).chapters[0].kind).toBeUndefined();
    expect(errors(scene)).toContain('chapter-no-visible-change');
  });
  it('allows a single meaningful track in the explicit new chapter contract', () => {
    const scene = valid();
    scene.tracks = [scene.tracks[0]];
    scene.chapters.forEach((chapter) => {
      chapter.kind = 'action';
      chapter.focus = ['hero'];
    });
    expect(() => parseCinematicScene(scene)).not.toThrow();
    expect(errors(scene, 'structural-change')).toEqual([]);
  });
  it('rejects motion of hidden child nodes even when their visible parent is focused', () => {
    const scene = valid();
    scene.coverage!.interactions = [];
    for (const id of ['hidden-a', 'hidden-b'])
      scene.nodes.push({
        ...scene.nodes[0],
        id,
        kind: 'box',
        model: undefined,
        assetRole: undefined,
        parent: 'hero',
        position: [0, 0, 0],
        opacity: 0,
        role: 'logic',
        params: { width: 0.1, height: 0.1, depth: 0.1 },
      });
    scene.tracks = ['hidden-a', 'hidden-b'].map((target) => ({
      target,
      property: 'position',
      easing: 'linear',
      keyframes: [
        { at: 0, value: [0, 0, 0] },
        { at: 60, value: [0, 3, 0] },
      ],
    }));
    expect(errors(parseCinematicScene(scene))).toEqual(
      expect.arrayContaining(['chapter-no-visible-change', 'motion-only-rotation']),
    );
  });
  it('does not count movement completed while hidden just because the target appears later', () => {
    const scene = valid();
    scene.tracks = [
      {
        target: 'hero',
        property: 'position',
        easing: 'linear',
        keyframes: [
          { at: 0, value: [0, 0, 0] },
          { at: 4, value: [2, 0, 0] },
          { at: 60, value: [2, 0, 0] },
        ],
      },
      {
        target: 'hero',
        property: 'opacity',
        easing: 'linear',
        keyframes: [
          { at: 0, value: 0 },
          { at: 10, value: 0 },
          { at: 12, value: 1 },
          { at: 60, value: 1 },
        ],
      },
      scene.tracks[1],
    ];
    scene.coverage!.interactions[0].chapter = 0;
    scene.coverage!.interactions[0].properties = ['position'];
    expect(errors(scene, 'structural-change')).toContain('request-interaction-kind-mismatch');
  });
  it('counts a real group transform only through its visible rendered descendants', () => {
    const scene = valid();
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'root',
      kind: 'group',
      model: undefined,
      assetRole: undefined,
      position: [0, 0, 0],
      params: {},
    });
    scene.nodes[0].parent = 'root';
    scene.tracks[0] = {
      target: 'root',
      property: 'position',
      easing: 'linear',
      keyframes: [
        { at: 0, value: [0, 0, 0] },
        { at: 60, value: [0, 3, 0] },
      ],
    };
    scene.coverage!.interactions[0].properties = ['position'];
    expect(errors(scene, 'structural-change')).toEqual([]);
  });
});

describe('frozen semantic interaction requirements', () => {
  it.each(['emissive', 'explore'] as const)(
    'rejects %s as a replacement for structural change',
    (property) => {
      const scene = valid();
      setEmission(scene);
      scene.coverage!.interactions[0].properties = [property];
      expect(errors(scene, 'structural-change')).toContain('request-interaction-kind-mismatch');
    },
  );
  it('rejects cosmetic evidence even if every chapter is relabeled as inspection', () => {
    const scene = valid();
    setEmission(scene);
    scene.chapters.forEach((chapter) => {
      chapter.kind = 'inspection';
    });
    expect(errors(scene, 'structural-change')).toContain('request-interaction-kind-mismatch');
  });
  it('accepts supported structural change and rejects unsupported asset explode', () => {
    const scene = valid();
    expect(errors(scene, 'structural-change')).toEqual([]);
    scene.tracks[0].target = 'base';
    scene.coverage!.interactions[0].targets = ['base'];
    expect(errors(scene, 'structural-change')).toEqual(
      expect.arrayContaining(['unsupported-asset-action', 'request-interaction-kind-mismatch']),
    );
  });
  it('allows visible state tracks only as state evidence, not as transport', () => {
    const scene = valid();
    setEmission(scene);
    expect(errors(scene, 'state-change')).toEqual([]);
    expect(errors(scene, 'transport')).toContain('request-interaction-kind-mismatch');
  });
  it('allows view exploration only for an actually visible requested subject', () => {
    const scene = valid();
    scene.coverage!.interactions[0].properties = ['explore'];
    expect(errors(scene, 'view')).toEqual([]);
    scene.nodes[0].opacity = 0;
    expect(errors(scene, 'view')).toContain('request-interaction-kind-mismatch');
  });
  it('requires typed descriptions even when omitted from the old string array', () => {
    const result = checkCinematicQuality(valid(), {
      interactionRequirements: [{ description: '单指拖动旋转视角', kind: 'view' }],
    });
    expect(result.issues.map((issue) => issue.code)).toContain('request-interaction-missing');
  });
  it('preserves untyped legacy mapping but does not claim semantic verification', () => {
    const scene = valid();
    scene.coverage!.interactions[0].properties = ['explore'];
    const result = checkCinematicQuality(scene, { requiredInteractions: [description] });
    expect(result.status).toBe('PASS');
    expect(result.interactionEvidence[0]).toMatchObject({
      kind: 'legacy-untyped',
      status: 'LEGACY_UNTYPED',
    });
    expect(
      result.issues.some(
        (issue) => issue.code === 'legacy-untyped-interaction' && issue.severity === 'warning',
      ),
    ).toBe(true);
  });
});

describe('transport and approximate rendering evidence', () => {
  const transport = () => {
    const scene = valid();
    scene.tracks = [];
    scene.coverage!.interactions[0] = {
      description,
      chapter: 1,
      targets: ['hero', 'logic'],
      properties: ['transport'],
      connections: ['signal'],
    };
    return parseCinematicScene({
      ...scene,
      connections: [{ id: 'signal', from: 'hero', to: 'logic', particles: 8, speed: 0.1 }],
    });
  };
  it('accepts real visible connection particles without demanding dummy node tracks', () => {
    const report = checkCinematicQuality(transport(), {
      interactionRequirements: [{ description, kind: 'transport' }],
    });
    expect(report.status).toBe('PASS');
    expect(report.interactionEvidence[0]).toMatchObject({
      status: 'PASS',
      connections: ['signal'],
    });
    expect(report.chapters[0].visibleConnections).toEqual(['signal']);
  });
  it.each(['no-particles', 'hidden-endpoint', 'wrong-targets', 'not-bound'] as const)(
    'rejects nonfunctional transport: %s',
    (failure) => {
      const scene = transport();
      if (failure === 'no-particles') scene.connections[0].particles = 0;
      if (failure === 'hidden-endpoint') scene.nodes[2].opacity = 0;
      if (failure === 'wrong-targets') scene.coverage!.interactions[0].targets = ['base'];
      if (failure === 'not-bound') scene.coverage!.interactions[0].connections = [];
      expect(errors(scene, 'transport')).toContain('request-interaction-kind-mismatch');
    },
  );
  it('rejects transport ids that do not exist in the actual SceneIR', () => {
    const scene = transport();
    scene.coverage!.interactions[0].connections = ['missing'];
    expect(() => parseCinematicScene(scene)).toThrow('连接不存在');
  });
  it('accepts visible object displacement as transport evidence', () => {
    const scene = valid();
    scene.tracks[0] = {
      target: 'hero',
      property: 'position',
      easing: 'linear',
      keyframes: [
        { at: 0, value: scene.nodes[0].position },
        {
          at: 60,
          value: [
            scene.nodes[0].position[0],
            scene.nodes[0].position[1] + 3,
            scene.nodes[0].position[2],
          ],
        },
      ],
    };
    scene.coverage!.interactions[0].properties = ['position'];
    expect(errors(scene, 'transport')).toEqual([]);
  });
  it('makes small-subject approximation advisory and requires runtime validation', () => {
    const scene = valid();
    scene.nodes[2].position = [150, 0, 0];
    const report = checkCinematicQuality(scene);
    expect(
      report.issues.some(
        (issue) => issue.code === 'subject-too-small' && issue.severity === 'warning',
      ),
    ).toBe(true);
    expect(
      report.issues
        .filter((issue) =>
          [
            'subject-too-small',
            'subject-clipped',
            'subject-occlusion-risk',
            'camera-inside-bounds',
          ].includes(issue.code),
        )
        .every((issue) => issue.severity === 'warning'),
    ).toBe(true);
    expect(report.runtimeValidation).toBe('REQUIRED');
    expect(report.visualReview).toBe('NOT_PERFORMED');
  });
  it('treats brief overlap between animated flow markers as advisory', () => {
    const scene = valid();
    const marker = (id: string, x: number) => ({
      ...structuredClone(scene.nodes[1]),
      id,
      kind: 'box' as const,
      model: undefined,
      assetRole: undefined,
      parent: undefined,
      role: 'support' as const,
      represents: '流向标记',
      position: [x, 0, 0] as [number, number, number],
      params: { width: 0.3, height: 0.3, depth: 0.3 },
    });
    scene.nodes.push(marker('flow_marker_1', -1), marker('flow_marker_2', 1));
    scene.tracks.push(
      {
        target: 'flow_marker_1', property: 'position', easing: 'linear',
        keyframes: [{ at: 0, value: [-1, 0, 0] }, { at: 30, value: [0, 0, 0] }, { at: 60, value: [1, 0, 0] }],
      },
      {
        target: 'flow_marker_2', property: 'position', easing: 'linear',
        keyframes: [{ at: 0, value: [1, 0, 0] }, { at: 30, value: [0, 0, 0] }, { at: 60, value: [-1, 0, 0] }],
      },
    );
    const overlap = checkCinematicQuality(parseCinematicScene(scene)).issues.filter(issue =>
      issue.code === 'geometry-overlap' && issue.nodes.every(id => id.startsWith('flow_marker_')),
    );
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every(issue => issue.severity === 'warning')).toBe(true);
  });
  it('recognizes diverging material-feed markers without excusing a permanently doubled marker', () => {
    const scene = valid();
    const marker = (id: string) => ({...structuredClone(scene.nodes[1]), id, kind: 'sphere' as const,
      model: undefined, assetRole: undefined, parent: undefined, role: 'support' as const,
      represents: '流入物料标记', position: [0, 0, 0] as [number, number, number],
      params: {radius: .16}});
    scene.nodes.push(marker('feed_marker_b'), marker('feed_marker_c'));
    const path = (target: string, end: [number, number, number]) => ({target, property: 'position' as const,
      easing: 'smooth' as const, keyframes: [
        {at: 0, value: [0, 0, 0] as [number, number, number]},
        {at: 20, value: [0, 0, 0] as [number, number, number]},
        {at: 60, value: end},
      ]});
    scene.tracks.push(path('feed_marker_b', [2, 0, 0]), path('feed_marker_c', [-2, 0, 0]));
    const pairIssues = () => checkCinematicQuality(parseCinematicScene(scene)).issues.filter(issue =>
      issue.code === 'geometry-overlap' && issue.nodes.includes('feed_marker_b') && issue.nodes.includes('feed_marker_c'));
    expect(pairIssues().length).toBeGreaterThan(0);
    expect(pairIssues().every(issue => issue.severity === 'warning')).toBe(true);
    scene.tracks.find(track => track.target === 'feed_marker_c' && track.property === 'position')!.keyframes[2].value = [2, 0, 0];
    expect(pairIssues().some(issue => issue.severity === 'error')).toBe(true);
  });
  it('treats a transient overlap between a rotor stripe and departing debris as advisory', () => {
    const scene = valid();
    const rotor = structuredClone(scene.nodes[1]);
    rotor.id = 'rotor';
    rotor.kind = 'cylinder';
    rotor.model = undefined;
    rotor.assetRole = undefined;
    rotor.parent = undefined;
    rotor.role = 'primary';
    rotor.represents = '离心机转子';
    rotor.position = [0, 0, 0];
    rotor.params = { top: .5, bottom: .5, height: 1.2 };
    const stripe = structuredClone(scene.nodes[1]);
    stripe.id = 'trace_three';
    stripe.kind = 'box';
    stripe.model = undefined;
    stripe.assetRole = undefined;
    stripe.parent = rotor.id;
    stripe.role = 'support';
    stripe.represents = '偏心示踪条纹';
    stripe.position = [0, 0, 0];
    stripe.params = { width: .3, height: .3, depth: .3 };
    const fragment = structuredClone(stripe);
    fragment.id = 'fragment_four';
    fragment.parent = undefined;
    fragment.represents = '破碎碎片四';
    scene.nodes.push(rotor, stripe, fragment);
    scene.tracks.push(
      {target:rotor.id,property:'rotation',easing:'linear',keyframes:[{at:0,value:[0,0,0]},{at:60,value:[0,12,0]}]},
      {target:fragment.id,property:'position',easing:'linear',keyframes:[{at:0,value:[0,0,0]},{at:60,value:[4,2,1]}]},
      {target:fragment.id,property:'opacity',easing:'linear',keyframes:[{at:0,value:0},{at:1,value:1},{at:60,value:1}]},
    );
    const overlap=checkCinematicQuality(parseCinematicScene(scene)).issues.filter(issue=>
      issue.code==='geometry-overlap'&&issue.nodes.includes(stripe.id)&&issue.nodes.includes(fragment.id));
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every(issue=>issue.severity==='warning')).toBe(true);
  });
  it('reclassifies a held final-state chapter as inspection', () => {
    const scene = valid();
    const chapter = scene.chapters.at(-1)!;
    chapter.kind = 'action';
    chapter.title = '全开状态';
    chapter.caption = '阀芯已到达最终位置，观察全开结果。';
    scene.tracks.forEach(track => {
      const final = track.keyframes.at(-1)!.value;
      track.keyframes = [
        { at: 0, value: track.keyframes[0].value },
        { at: chapter.at, value: final },
        { at: scene.duration, value: final },
      ];
    });
    const normalized = normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain(`chapter-${chapter.at}-final-state-inspection`);
    expect(normalized.scene.chapters.at(-1)!.kind).toBe('inspection');
  });
  it('moves thin dial pointer rotation into the panel plane and gives mapped HMI state a visible bounded sweep', () => {
    const scene = valid();
    const panel={...scene.nodes[0],id:'hmi-panel',model:'industrial-drive' as const,assetRole:'industrial-motor-drive',represents:'HMI显示面板'};
    const pointer={...scene.nodes[0],id:'hmi-pointer',kind:'box' as const,model:undefined,assetRole:undefined,
      parent:panel.id,represents:'HMI显示指针',position:[0,0,0] as [number,number,number],params:{width:.06,height:.5,depth:.04}};
    scene.nodes.push(panel,pointer);
    scene.tracks.push({target:pointer.id,property:'rotation',easing:'smooth',keyframes:[
      {at:0,value:[0,0,0]},{at:20,value:[0,.1,0]},{at:40,value:[0,.12,0]},{at:60,value:[0,.22,0]},
    ]});
    scene.coverage!.interactions.push({description:'HMI显示保持正常值',chapter:1,targets:[pointer.id],properties:['rotation']});
    const normalized=normalizeCinematicHardware(scene),track=normalized.scene.tracks.find(item=>item.target===pointer.id&&item.property==='rotation')!;
    const values=track.keyframes.map(frame=>frame.value as [number,number,number]);
    expect(normalized.adjustments).toEqual(expect.arrayContaining(['hmi-pointer-dial-plane-rotation','hmi-pointer-normal-band-sweep']));
    expect(normalized.adjustments).toContain('hmi-pointer-display-port');
    expect(normalized.scene.nodes.find(node=>node.id===pointer.id)?.position[2]).toBeGreaterThan(.1);
    expect(values.every(value=>value[0]===0&&value[1]===0)).toBe(true);
    expect(Math.max(...values.map(value=>value[2]))).toBeGreaterThanOrEqual(.32);
  });
  it('anchors generated valve flow geometry to real inlet and outlet ports while retaining a readable section', () => {
    const scene=valid(),base=scene.nodes[0];
    const body={...base,id:'valve-body',model:'valve' as const,assetRole:'valve-body',represents:'剖切阀体',opacity:1};
    const channel=(id:string,x:number)=>({...base,id,kind:'tube' as const,model:undefined,assetRole:undefined,parent:body.id,
      role:'logic' as const,represents:'内部流道',position:[x,-.4,0] as [number,number,number],rotation:[0,0,Math.PI/2] as [number,number,number],
      params:{radius:.14},points:[[0,0,0],[0,.8,0]] as [number,number,number][],opacity:.42});
    const marker={...base,id:'flow-marker',kind:'sphere' as const,model:undefined,assetRole:undefined,parent:body.id,
      role:'logic' as const,represents:'流向标记',position:[-1.1,-.4,.05] as [number,number,number],params:{radius:.09},opacity:1};
    scene.nodes.push(body,channel('upstream-flow',-.8),channel('downstream-flow',.8),marker);
    scene.tracks.push(
      {target:marker.id,property:'position',easing:'smooth',keyframes:[{at:0,value:[-1.1,-.4,.05]},{at:30,value:[0,-.4,.05]},{at:60,value:[1.1,-.4,.05]}]},
      {target:marker.id,property:'opacity',easing:'smooth',keyframes:[{at:0,value:0},{at:20,value:0},{at:60,value:1}]},
    );
    scene.chapters[2].kind='summary';
    scene.connections.push({id:'flow-path',from:body.id,to:'hero',color:'#4fc3d9',particles:0,speed:.1,radius:.02,label:'介质流向'});
    const normalized=normalizeCinematicHardware(scene),result=normalized.scene;
    expect(result.nodes.find(node=>node.id===body.id)?.opacity).toBe(.62);
    const channels=result.nodes.filter(node=>node.parent===body.id&&node.kind==='tube');
    expect(channels.map(node=>node.position)).toEqual([[0,0,0],[0,0,0]]);
    expect(channels.map(node=>node.rotation)).toEqual([[0,0,0],[0,0,0]]);
    expect(channels[0].points?.[0][0]).toBeLessThan(-1);
    expect(channels[1].points?.at(-1)?.[0]).toBeGreaterThan(1);
    const position=result.tracks.find(track=>track.target===marker.id&&track.property==='position')!;
    expect(position.keyframes.find(frame=>frame.at===40)?.value).toEqual(position.keyframes.at(-1)?.value);
    expect(result.tracks.find(track=>track.target===marker.id&&track.property==='opacity')?.keyframes.every(frame=>frame.value===1)).toBe(true);
    expect(result.connections.some(connection=>connection.id==='flow-path')).toBe(false);
  });
  it('treats orthogonal handwheel spokes joined at a torus hub as intentional contact', () => {
    const scene=valid(),base=scene.nodes[0];
    const wheel={...base,id:'handwheel',kind:'torus' as const,model:undefined,assetRole:undefined,params:{radius:.42,tube:.055}};
    const spoke=(id:string,rotation:[number,number,number])=>({...base,id,kind:'box' as const,model:undefined,
      assetRole:undefined,parent:wheel.id,represents:'手轮辐条',position:[0,0,0] as [number,number,number],rotation,
      params:{width:.78,height:.035,depth:.06}});
    scene.nodes.push(wheel,spoke('wheel-spoke-a',[0,0,0]),spoke('wheel-spoke-b',[0,Math.PI/2,0]));
    const overlap=checkCinematicQuality(scene).issues.filter(issue=>issue.code==='geometry-overlap'&&
      issue.nodes.includes('wheel-spoke-a')&&issue.nodes.includes('wheel-spoke-b'));
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every(issue=>issue.severity==='warning')).toBe(true);
  });
  it('replaces complete catalog models mislabeled as breakup debris with bounded volumetric fragments', () => {
    const scene=valid(),debris={...scene.nodes[0],id:'debris-1',model:'server-rack' as const,assetRole:'equipment-rack',
      represents:'机壳碎片',scale:[.2,.2,.2] as [number,number,number]};
    scene.nodes.push(debris);
    scene.tracks.push(
      {target:debris.id,property:'position',easing:'linear',keyframes:[{at:0,value:[0,0,0]},{at:60,value:[3,2,1]}]},
      {target:debris.id,property:'opacity',easing:'linear',keyframes:[{at:0,value:0},{at:60,value:1}]},
    );
    const normalized=normalizeCinematicHardware(scene),result=normalized.scene.nodes.find(node=>node.id===debris.id)!;
    expect(normalized.adjustments).toContain('debris-1-volumetric-fragment');
    expect(result).toMatchObject({kind:'box',scale:[1,1,1]});
    expect(result.model).toBeUndefined();
  });
  it('turns an opaque primitive valve shell into a readable section without fading independent internals', () => {
    const scene=valid(),base=scene.nodes[0];
    const primitive=(id:string,kind:'box'|'cylinder',represents:string,params:Record<string,number|boolean>)=>({...base,id,kind,
      model:undefined,assetRole:undefined,role:'primary' as const,represents,params,opacity:1});
    scene.nodes.push(
      primitive('valve-body','box','闸阀阀体',{width:8,height:4.4,depth:5.2}),
      primitive('valve-flow-passage','cylinder','阀体内部水平流道',{top:1.1,bottom:1.1,height:7.9,openEnded:true}),
      primitive('valve-gate','box','闸阀阀芯（闸板）',{width:.42,height:3.2,depth:2.3}),
      primitive('valve-seat','cylinder','阀体密封阀座',{top:1.42,bottom:1.42,height:.45,openEnded:true}),
    );
    const normalized=normalizeCinematicHardware(scene),nodes=new Map(normalized.scene.nodes.map(node=>[node.id,node]));
    expect(nodes.get('valve-body')?.opacity).toBe(.18);
    expect(nodes.get('valve-flow-passage')?.opacity).toBe(.28);
    expect(nodes.get('valve-seat')?.opacity).toBe(.48);
    expect(nodes.get('valve-gate')?.opacity).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assetCatalog } from '@/lib/cinematic/asset-catalog';
import { assetDefinition, cinematicAssetKinds } from '@/lib/cinematic/asset-definitions';
import { parseCinematicScene } from '@/lib/cinematic/schema';
import {
  resolveCinematicAssembly,
  worldNodes,
  worldBounds,
  localBounds,
  transformPoint,
  compose,
  inverse,
  multiply,
  identity,
  valueAt,
  bindCinematicConnectionPaths,
} from '@/lib/cinematic/assembly';
import { checkCinematicQuality, cameraForQuality } from '@/lib/cinematic/quality';
import { normalizeCinematicHardware } from '@/lib/cinematic/hardware-geometry';
import { sceneFixture } from '../../fixtures/cinematic';
import { assemblySceneFixture } from '../../fixtures/cinematic-assembly';

describe('browser-safe additive cinematic contract', () => {
  it('keeps legacy SceneIR unchanged and accepts optional frame defaults', () => {
    const old = sceneFixture();
    expect(parseCinematicScene(old)).toEqual(old);
    expect(old.assembly).toBeUndefined();
    expect(old.shots[0].frame).toBeUndefined();
    const next = parseCinematicScene({
      ...old,
      shots: old.shots.map((shot) => ({ ...shot, frame: { nodes: ['hero'] } })),
    });
    expect(next.shots[0].frame).toEqual({ nodes: ['hero'], padding: 1.2 });
  });
  it.each(cinematicAssetKinds)(
    'derives %s parameter validation from the pure authoritative definitions',
    (kind) => {
      const scene = sceneFixture();
      scene.nodes[0].model = kind;
      scene.nodes[0].params = Object.fromEntries(
        Object.entries(assetDefinition(kind).parameters).map(([name, parameter]) => [
          name,
          parameter.default,
        ]),
      );
      expect(parseCinematicScene(scene).nodes[0].params).toEqual(scene.nodes[0].params);
      scene.nodes[0].params.invented = 1;
      expect(() => parseCinematicScene(scene)).toThrow('参数无效');
    },
  );
  it('rejects incompatible model roles and background framing', () => {
    const scene = assemblySceneFixture();
    scene.nodes[0].assetRole = 'valve-body';
    expect(() => parseCinematicScene(scene)).toThrow('真实资产能力');
    for (const kind of ['group', 'plane', 'points'] as const) {
      const frame = sceneFixture();
      frame.nodes[2].kind = kind;
      frame.shots[0].frame = { nodes: ['base'], padding: 1.2 };
      expect(() => parseCinematicScene(frame)).toThrow('取景主体');
    }
    const decoration = assemblySceneFixture();
    decoration.nodes[0].role = 'decoration';
    expect(() => parseCinematicScene(decoration)).toThrow('取景主体');
  });
  it('keeps the schema client dependency boundary pure and explicit', () => {
    const schema = readFileSync(resolve('lib/cinematic/schema.ts'), 'utf8');
    const definitions = readFileSync(resolve('lib/cinematic/asset-definitions.ts'), 'utf8');
    const limits = readFileSync(resolve('lib/cinematic/limits.ts'), 'utf8');
    expect([...schema.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1])).toEqual([
      'zod',
      './limits',
      './player-controls',
      './presentation',
      './asset-definitions',
      './curves',
    ]);
    expect([...definitions.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1])).toEqual([
      './asset-definitions.json',
    ]);
    expect(limits).not.toMatch(/\bimport\b|\brequire\b/);
    expect(schema + definitions + limits).not.toMatch(
      /asset-catalog|node:vm|models\.js|import\(|require\(/,
    );
  });
});

describe('deterministic geometry-based assembly', () => {
  it('maps zero-volume DNA teaching aliases to the detailed helix asset', () => {
    const scene=sceneFixture(),base=structuredClone(scene.nodes[1]);
    scene.nodes=[
      {...base,id:'dna_helix',kind:'model',model:'dna',role:'primary',represents:'DNA双螺旋',params:{detail:2,speed:0,basePairs:28,turns:2.45,separation:'local',separationCenter:.5,separationSpan:.4}},
      {...base,id:'strand_a',kind:'group',role:'primary',represents:'糖-磷酸骨架A',params:{}},
      {...base,id:'strand_b',kind:'group',role:'primary',represents:'糖-磷酸骨架B',params:{}},
      {...base,id:'base_pairs',kind:'group',role:'primary',represents:'互补碱基对',params:{}},
      {...base,id:'open_region',kind:'group',role:'logic',represents:'中段局部打开区域',params:{}},
    ];
    scene.tracks=[
      {target:'dna_helix',property:'explode',easing:'smooth',keyframes:[{at:0,value:0},{at:30,value:.62}]},
      {target:'strand_a',property:'position',easing:'smooth',keyframes:[{at:0,value:[0,0,0]},{at:30,value:[1,0,0]}]},
      {target:'strand_b',property:'position',easing:'smooth',keyframes:[{at:0,value:[0,0,0]},{at:30,value:[-1,0,0]}]},
      {target:'base_pairs',property:'opacity',easing:'smooth',keyframes:[{at:0,value:0},{at:10,value:1}]},
    ];
    scene.assembly={version:'assembly-v1',placements:[
      {mode:'relative',node:'strand_a',reference:'dna_helix',side:'left',gap:.2,offset:[0,0,0]},
      {mode:'relative',node:'strand_b',reference:'dna_helix',side:'right',gap:.2,offset:[0,0,0]},
      {mode:'relative',node:'base_pairs',reference:'dna_helix',side:'front',gap:.2,offset:[0,0,0]},
    ]};
    scene.coverage={objects:[
      {name:'DNA双螺旋',nodes:['dna_helix']},{name:'糖-磷酸骨架A',nodes:['strand_a']},
      {name:'糖-磷酸骨架B',nodes:['strand_b']},{name:'互补碱基对',nodes:['base_pairs']},
    ],interactions:[{description:'局部分离',chapter:0,targets:['open_region','strand_a','strand_b'],properties:['explode']}]};
    scene.chapters[0].focus=['strand_a','strand_b','base_pairs'];

    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.scene.nodes.map(node=>node.id)).toEqual(['dna_helix']);
    expect(normalized.scene.assembly).toBeUndefined();
    expect(normalized.scene.tracks).toHaveLength(1);
    expect(normalized.scene.coverage?.objects.flatMap(object=>object.nodes)).toEqual(['dna_helix','dna_helix','dna_helix','dna_helix']);
    expect(normalized.scene.coverage?.interactions[0].targets).toEqual(['dna_helix']);
    expect(normalized.scene.chapters[0].focus).toEqual(['dna_helix']);
    expect(() => resolveCinematicAssembly(normalized.scene)).not.toThrow();
  });

  it('binds DNA re-pairing to the detailed molecule and accepts its internal assembly', () => {
    const scene=sceneFixture(),base=structuredClone(scene.nodes[1]),description='分开后重新配对，恢复完整双螺旋';
    scene.nodes=[
      {...base,id:'dna_molecule',kind:'model',model:'dna',role:'primary',represents:'DNA双螺旋',params:{detail:2,speed:1,basePairs:28,turns:2.45}},
      {...base,id:'base_pair_label',kind:'box',model:undefined,parent:'dna_molecule',role:'support',represents:'互补配对说明',position:[2.8,.9,0],params:{width:1.2,height:.3,depth:.06}},
      {...base,id:'sequence_label',kind:'box',model:undefined,parent:'dna_molecule',role:'support',represents:'碱基顺序说明',position:[2.8,-.9,0],params:{width:1.2,height:.3,depth:.06}},
    ];
    scene.tracks=[
      {target:'dna_molecule',property:'rotation',easing:'smooth',keyframes:[{at:0,value:[0,0,0]},{at:60,value:[0,.3,0]}]},
      {target:'base_pair_label',property:'opacity',easing:'smooth',keyframes:[{at:0,value:0},{at:60,value:1}]},
    ];
    scene.chapters.forEach(chapter=>{chapter.focus=['dna_molecule'];});
    scene.coverage={objects:[{name:'DNA双螺旋',nodes:['dna_molecule']}],interactions:[{
      description,chapter:2,targets:['dna_molecule','base_pair_label'],properties:['opacity'],
    }]};
    const requiredObject='被局部打开而暂时分离的碱基区段';
    const options={requiredObjects:[requiredObject],requiredInteractions:[description],interactionRequirements:[{description,kind:'structural-change' as const}]};

    const normalized=normalizeCinematicHardware(scene,options);
    const explode=normalized.scene.tracks.find(track=>track.target==='dna_molecule'&&track.property==='explode');
    expect(normalized.scene.nodes[0].params).toMatchObject({separation:'local',speed:0});
    expect(explode?.keyframes).toEqual([{at:0,value:0},{at:40,value:.72},{at:60,value:0}]);
    expect(normalized.scene.coverage.interactions[0]).toMatchObject({targets:['dna_molecule'],properties:['explode']});
    expect(normalized.scene.coverage.objects).toContainEqual({name:requiredObject,nodes:['dna_molecule']});
    const report=checkCinematicQuality(normalized.scene,options);
    expect(report.metrics).toMatchObject({teachingNodes:3,detailedModels:1,relations:2});
    expect(report.issues.map(issue=>issue.code)).not.toContain('composition-assembly');
    expect(report.issues.map(issue=>issue.code)).not.toContain('request-interaction-kind-mismatch');

    const semanticRepair=[
      {at:0,value:0},{at:28,value:0},{at:40,value:1},{at:50,value:1},{at:60,value:0},
    ];
    explode!.keyframes=structuredClone(semanticRepair);
    const reviewed=normalizeCinematicHardware(normalized.scene,options).scene;
    expect(reviewed.tracks.find(track=>track.target==='dna_molecule'&&track.property==='explode')?.keyframes)
      .toEqual(semanticRepair);
  });

  it('reifies an empty custom DNA rung collection as visible paired geometry', () => {
    const scene=sceneFixture(),base=structuredClone(scene.nodes[2]),name='互补碱基对横档',description='展示骨架间的互补碱基配对';
    scene.nodes=[
      {...base,id:'dna_molecule',kind:'group',role:'primary',represents:'DNA双螺旋',params:{}},
      {...base,id:'strand_a',kind:'tube',parent:'dna_molecule',role:'support',represents:'糖-磷酸骨架链A',points:[[-.7,-2,0],[-.7,2,0]],params:{radius:.05}},
      {...base,id:'strand_b',kind:'tube',parent:'dna_molecule',role:'support',represents:'糖-磷酸骨架链B',points:[[.7,-2,0],[.7,2,0]],params:{radius:.05}},
      {...base,id:'base_rungs',kind:'points',parent:'dna_molecule',role:'logic',represents:name,points:[],params:{count:28,spread:.72,size:.045}},
    ];
    scene.tracks=[{target:'base_rungs',property:'opacity',easing:'smooth',keyframes:[{at:0,value:.85},{at:40,value:1},{at:60,value:.85}]}];
    scene.chapters.forEach(chapter=>{chapter.focus=['base_rungs','strand_a','strand_b'];});
    scene.shots.forEach(shot=>{shot.frame={nodes:['base_rungs'],padding:1.2};});
    scene.coverage={objects:[{name,nodes:['base_rungs']}],interactions:[{description,chapter:0,targets:['base_rungs'],properties:['explore']}]};
    const options={requiredObjects:[name],requiredInteractions:[description],interactionRequirements:[{description,kind:'view' as const}]};

    const normalized=normalizeCinematicHardware(scene,options);
    const rungs=normalized.scene.nodes.filter(node=>node.id.startsWith('base_rungs-pair-'));
    expect(rungs).toHaveLength(4);
    expect(rungs.every(node=>node.kind==='box'&&node.role==='support')).toBe(true);
    expect(normalized.scene.coverage.objects[0].nodes).toEqual(rungs.map(node=>node.id));
    expect(normalized.scene.coverage.interactions[0].targets).toEqual(rungs.map(node=>node.id));
    expect(normalized.scene.tracks.filter(track=>track.property==='opacity').map(track=>track.target)).toEqual(rungs.map(node=>node.id));
    const codes=checkCinematicQuality(normalized.scene,options).issues.map(issue=>issue.code);
    expect(codes).not.toContain('request-object-missing');
    expect(codes).not.toContain('request-interaction-kind-mismatch');
  });

  it('places a processor protective window on the die instead of through it', () => {
    const scene = sceneFixture();
    const box = structuredClone(scene.nodes[1]);
    scene.nodes = [
      { ...box, id: 'processor_package', kind: 'model', model: 'processor', role: 'primary', represents: '处理器封装', params: { detail: 2, speed: 0, lid: false } },
      { ...box, id: 'package_base', kind: 'box', role: 'support', represents: '封装基座', position: [0, -.62, 0], params: { width: 2.6, height: .26, depth: 2.6 } },
      { ...box, id: 'silicon_die', kind: 'box', role: 'support', represents: '硅晶片核心层', position: [0, -.05, 0], params: { width: 1.5, height: .12, depth: 1.5 } },
      { ...box, id: 'protective_window', kind: 'box', role: 'support', represents: '保护窗口', position: [0, -.04, 0], opacity: .35, params: { width: 2.1, height: .06, depth: 2.1 } },
    ];
    scene.tracks = [{
      target: 'protective_window', property: 'position', easing: 'smooth',
      keyframes: [{ at: 0, value: [0, -.04, 0] }, { at: 30, value: [0, .59, 0] }],
    }];
    scene.assembly = {version:'assembly-v1',placements:[
      {mode:'relative',node:'protective_window',reference:'package_base',side:'above',gap:.42,offset:[0,0,0]},
    ]};

    const normalized=normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain('protective_window-processor-die-surface');
    expect(normalized.scene.assembly?.placements[0]).toMatchObject({reference:'silicon_die',side:'above',gap:.08});
    const resolved=resolveCinematicAssembly(normalized.scene).scene,worlds=worldNodes(resolved);
    expect(worldBounds(worlds.get('protective_window')!).min[1]-worldBounds(worlds.get('silicon_die')!).max[1]).toBeCloseTo(.08,8);
    const keyframes=resolved.tracks.find(track=>track.target==='protective_window'&&track.property==='position')!.keyframes;
    expect((keyframes[1].value as number[])[1]-(keyframes[0].value as number[])[1]).toBeCloseTo(.63,8);
  });

  it('orients fixed asset ports before strict placement resolution', () => {
    const scene = sceneFixture();
    const base = scene.nodes[0];
    scene.nodes = [
      {
        ...structuredClone(base), id: 'valve-body', kind: 'model', model: 'valve', role: 'primary',
        represents: '阀体', assetRole: 'valve-body', params: { detail: 2, speed: 1, opening: 0.65, actuator: 'manual' },
      },
      {
        ...structuredClone(base), id: 'flow-channel', kind: 'model', model: 'pipe-assembly', role: 'support',
        represents: '介质流道', assetRole: 'physical-fluid-conduit', rotation: [0, -Math.PI / 2, 0],
        params: { detail: 2, speed: 1, layout: 'straight', length: 4, radius: 0.14 },
      },
    ];
    scene.tracks = [];
    scene.assembly = {
      version: 'assembly-v1',
      placements: [
        { mode: 'port', node: 'flow-channel', reference: 'valve-body', port: 'inlet', referencePort: 'inlet', gap: 0, offset: [0, 0, 0] },
      ],
    };
    const normalized = normalizeCinematicHardware(scene);
    expect(normalized.adjustments).toContain('flow-channel-inlet-port-orientation');
    expect(() => resolveCinematicAssembly(normalized.scene)).not.toThrow();
  });

  it('uses actual floor and bounding surfaces without mutating the author input', () => {
    const input = assemblySceneFixture(),
      original = structuredClone(input);
    const { scene } = resolveCinematicAssembly(input),
      worlds = worldNodes(scene);
    const floor = worldBounds(worlds.get('base')!),
      hero = worldBounds(worlds.get('hero')!),
      logic = worldBounds(worlds.get('logic')!);
    expect(floor.min[1]).toBeCloseTo(-2.1, 8);
    expect(hero.min[1] - floor.max[1]).toBeCloseTo(0.2, 8);
    expect(logic.min[0] - floor.max[0]).toBeCloseTo(2, 8);
    expect(input).toEqual(original);
    expect(resolveCinematicAssembly(scene).scene).toEqual(scene);
  });
  it('handles parent rotation/scale and translates every absolute position keyframe once', () => {
    const input = sceneFixture();
    input.nodes.push({
      ...input.nodes[2],
      id: 'root',
      kind: 'group',
      position: [2, 3, 1],
      rotation: [0.2, 0.4, 0.3],
      scale: [1.5, 1, 0.8],
    });
    input.nodes[1].parent = 'root';
    input.assembly = {
      version: 'assembly-v1',
      placements: [
        {
          mode: 'relative',
          node: 'bank',
          reference: 'hero',
          side: 'right',
          gap: 0.3,
          offset: [0, 0, 0],
        },
      ],
    };
    const resolved = resolveCinematicAssembly(input).scene,
      worlds = worldNodes(resolved);
    expect(
      worldBounds(worlds.get('bank')!).min[0] - worldBounds(worlds.get('hero')!).max[0],
    ).toBeCloseTo(0.3, 8);
    const track = resolved.tracks[1];
    expect(
      (track.keyframes[1].value as number[]).map(
        (v, i) => v - (track.keyframes[0].value as number[])[i],
      ),
    ).toEqual([0, 2, 0]);
    const twice = resolveCinematicAssembly(resolved).scene;
    twice.tracks[1].keyframes.forEach((key, i) =>
      (key.value as number[]).forEach((value, axis) =>
        expect(value).toBeCloseTo((track.keyframes[i].value as number[])[axis], 8),
      ),
    );
  });
  it('matches real fixed valve and pipe ports and compiles parent-local anchors', () => {
    const input = sceneFixture();
    input.nodes[0].model = 'valve';
    input.nodes[1].model = 'pipe-assembly';
    input.nodes[1].params = { layout: 'straight', length: 3 };
    input.assembly = {
      version: 'assembly-v1',
      placements: [
        {
          mode: 'port',
          node: 'bank',
          reference: 'hero',
          port: 'inlet',
          referencePort: 'outlet',
          gap: 0,
          offset: [0, 0, 0],
        },
      ],
    };
    input.connections = [
      {
        id: 'flow',
        from: 'hero',
        to: 'bank',
        fromPort: 'outlet',
        toPort: 'inlet',
        via: [],
        color: '#ffffff',
        particles: 10,
        speed: 0.1,
        radius: 0.01,
      },
    ];
    const { scene, report } = resolveCinematicAssembly(input),
      worlds = worldNodes(scene);
    const a = transformPoint(
      worlds.get('hero')!.matrix,
      assetCatalog('valve').ports.outlet.position,
    );
    const b = transformPoint(
      worlds.get('bank')!.matrix,
      assetCatalog('pipe-assembly', input.nodes[1].params).ports.inlet.position,
    );
    a.forEach((value, i) => expect(value).toBeCloseTo(b[i], 8));
    expect(report.portAnchors).toBe(2);
    expect(scene.connections[0].fromPort).toBeUndefined();
    expect(worlds.get(scene.connections[0].from)!.node.parent).toBe('hero');
    expect(parseCinematicScene(scene)).toEqual(scene);
    expect(resolveCinematicAssembly(scene).scene).toEqual(scene);
  });
  it('allows a connection endpoint that is stationary throughout the bound transport interval',()=>{
    const scene=sceneFixture();
    scene.nodes.push({...scene.nodes[2],id:'marker',kind:'sphere',params:{radius:.1},position:[0,0,0],
      followConnection:{connection:'flow',start:30,end:50}});
    scene.connections=[{id:'flow',from:'hero',to:'bank',via:[],color:'#ffffff',particles:0,speed:.1,radius:.02}];
    scene.tracks=[{target:'hero',property:'rotation',easing:'smooth',keyframes:[{at:0,value:[0,0,0]},{at:20,value:[0,.5,0]},{at:30,value:[0,.5,0]},{at:60,value:[0,.5,0]}]}];
    const bound=bindCinematicConnectionPaths(scene);
    expect(bound.tracks.find(track=>track.target==='marker'&&track.property==='position')?.keyframes).toHaveLength(23);
    scene.tracks[0].keyframes[2]={at:40,value:[0,1,0]};
    expect(()=>bindCinematicConnectionPaths(scene)).toThrow('移动端点');
  });
  it('removes model-authored assemblyPort metadata from ordinary teaching nodes', () => {
    const input = sceneFixture();
    input.nodes[0].assemblyPort = {node: 'hero', port: 'invented-port'};
    const resolved = resolveCinematicAssembly(input).scene;
    expect(resolved.nodes.find(node => node.id === 'hero')?.assemblyPort).toBeUndefined();
    expect(resolved.nodes).toHaveLength(input.nodes.length);
  });
  it('rejects made-up/dynamic ports, opposing normal errors and assembly cycles', () => {
    const base = sceneFixture();
    base.nodes[0].model = 'valve';
    base.nodes[1].model = 'pipe-assembly';
    base.nodes[1].params = { layout: 'straight' };
    const placement = {
      mode: 'port' as const,
      node: 'bank',
      reference: 'hero',
      port: 'outlet',
      referencePort: 'outlet',
      gap: 0,
      offset: [0, 0, 0] as [number, number, number],
    };
    base.assembly = { version: 'assembly-v1', placements: [placement] };
    expect(() => resolveCinematicAssembly(base)).toThrow('法向');
    placement.port = 'imaginary';
    expect(() => resolveCinematicAssembly(base)).toThrow('真实端口');
    base.nodes[1].model = 'logic-stack';
    base.nodes[1].params = {};
    placement.port = 'layer-1';
    expect(() => resolveCinematicAssembly(base)).toThrow('内部动画');
    base.assembly = {
      version: 'assembly-v1',
      placements: [
        {
          mode: 'relative',
          node: 'hero',
          reference: 'bank',
          side: 'right',
          gap: 0.2,
          offset: [0, 0, 0],
        },
        {
          mode: 'relative',
          node: 'bank',
          reference: 'hero',
          side: 'right',
          gap: 0.2,
          offset: [0, 0, 0],
        },
      ],
    };
    expect(() => resolveCinematicAssembly(base)).toThrow('依赖循环');
  });
  it('uses swept expanded bounds conservatively, never interpolates its endpoints', () => {
    const node = assemblySceneFixture().nodes[0],
      catalog = assetCatalog('processor');
    expect(localBounds(node, 0)).toMatchObject(catalog.bounds);
    expect(localBounds(node, 0.01)).toMatchObject(catalog.expandedBounds);
    expect(localBounds(node, 1)).toEqual(localBounds(node, 0.01));
  });
  it('inverts non-uniform transformed parents and evaluates smooth tracks', () => {
    const matrix = compose([3, -2, 1], [0.4, 0.2, -0.6], [2, 0.5, 3]);
    multiply(inverse(matrix), matrix).forEach((v, i) => expect(v).toBeCloseTo(identity()[i], 8));
    const scene = sceneFixture();
    expect(valueAt(scene, scene.nodes[0], 'explode', 30)).toBe(0.5);
    expect(valueAt(scene, scene.nodes[0], 'explode', 15)).toBe(0.15625);
  });
});

describe('measured composition and chapter quality', () => {
  const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
  const codes = (scene: ReturnType<typeof valid>) =>
    checkCinematicQuality(scene)
      .issues.filter((issue) => issue.severity === 'error')
      .map((issue) => issue.code);
  it('accepts a layered assembly but never reports raster/manual approval', () => {
    const result = checkCinematicQuality(valid());
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.visualReview).toBe('NOT_PERFORMED');
    expect(result.chapters.slice(0, 3).every((chapter) => chapter.visibleChanges.length)).toBe(
      true,
    );
    expect(result.metrics.drawCalls).toBeGreaterThan(0);
    expect(result.aspects).toEqual([16 / 9, 9 / 16]);
  });
  it('rejects the former unstructured three-node fixture for new generation', () => {
    expect(codes(sceneFixture())).toEqual(
      expect.arrayContaining([
        'composition-role',
        'composition-assembly',
        'asset-role',
        'camera-frame-missing',
      ]),
    );
    expect(parseCinematicScene(sceneFixture())).toBeTruthy();
  });
  it('detects actual transformed-volume overlap, not just node count', () => {
    const scene = valid();
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'duplicate',
      position: [...scene.nodes[0].position],
    });
    expect(codes(scene)).toContain('geometry-overlap');
  });
  it('rejects static chapters, tiny changes and changes to hidden objects', () => {
    const scene = valid();
    scene.tracks.forEach((track) => {
      track.keyframes = [
        { at: 0, value: 0 },
        { at: 5, value: 1 },
      ];
    });
    expect(codes(scene)).toContain('chapter-no-visible-change');
    scene.tracks.forEach((track) => {
      track.keyframes = [
        { at: 0, value: 0 },
        { at: 60, value: 0.001 },
      ];
    });
    expect(codes(scene)).toContain('chapter-no-visible-change');
    const hidden = valid();
    hidden.nodes[0].opacity = 0;
    hidden.nodes[2].opacity = 0;
    expect(codes(hidden)).toContain('chapter-focus-invisible');
    expect(codes(hidden)).toContain('chapter-no-visible-change');
  });
  it('does not count global rotation as sufficient educational motion', () => {
    const scene = valid();
    scene.tracks = scene.tracks.map((track) => ({
      ...track,
      property: 'rotation',
      keyframes: [
        { at: 0, value: [0, 0, 0] },
        { at: 60, value: [0, 2, 0] },
      ],
    }));
    expect(codes(scene)).toContain('motion-only-rotation');
  });
  it('rejects ineffective explode actions using real asset capability, not just property names', () => {
    const scene = valid();
    scene.tracks[0].target = 'base';
    expect(codes(scene)).toContain('unsupported-asset-action');
  });
  it('does not let authored parent links suppress physical intersection checks', () => {
    const scene = valid();
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'buried-child',
      parent: 'hero',
      position: [0, 0, 0],
    });
    expect(codes(scene)).toContain('geometry-overlap');
  });
  it('checks user-object and interaction coverage against real targets/time', () => {
    const scene = valid();
    const report = checkCinematicQuality(scene, {
      requiredObjects: ['阀门'],
      requiredInteractions: ['打开外壳'],
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['request-object-missing', 'request-interaction-missing']),
    );
    scene.coverage!.interactions[0].properties = ['position'];
    expect(codes(scene)).toContain('request-interaction-empty');
  });
  it('uses current animated subjects to fit rather than authored camera radius', () => {
    const scene = valid(),
      atStart = cameraForQuality(scene, 0),
      after = cameraForQuality(scene, 50);
    expect(after.target).not.toEqual(atStart.target);
    const distant = structuredClone(scene);
    distant.shots.forEach((shot) => {
      shot.position = shot.position.map((v) => v * 5) as [number, number, number];
    });
    const same = cameraForQuality(distant, 0);
    same.position.forEach((v, i) => expect(v).toBeCloseTo(atStart.position[i], 8));
    const old = sceneFixture();
    expect(cameraForQuality(old, 0).position).toEqual(old.shots[0].position);
  });
});

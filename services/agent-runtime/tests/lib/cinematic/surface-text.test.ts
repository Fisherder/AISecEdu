import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import threeSource from '../../../public/vendor/three-r150.min.js?raw';
import { cinematicSchema, parseCinematicScene } from '../../../lib/cinematic/schema';
import { compileCinematicScene } from '../../../lib/cinematic/compile';
import { CINEMATIC_SCENE_PROMPT, CINEMATIC_GROUNDING_PROMPT } from '../../../lib/server/cinematic-generation';
import { sceneFixture } from '../../fixtures/cinematic';

const player = readFileSync('lib/cinematic/player.js', 'utf8');
const extract = (name: string) => {
  const start = player.indexOf(`  function ${name}(`);
  return player.slice(start, player.indexOf('\n  function ', start + 1));
};
function signScene() {
  const scene = sceneFixture();
  scene.nodes[2].params = { width: 4, height: 1.5, depth: 0.1 };
  scene.nodes[2].surfaceText = { lines: ['教学概念模型', '不控制真实设备'], color: '#e7f2fa' };
  return scene;
}
function run(kind = 'box', params = { width: 4, height: 1.5, depth: 0.1 }, chapterTitle = false) {
  const context = createContext({});
  new Script(threeSource).runInContext(context, { timeout: 5000 });
  return new Script(`
    const T=THREE,nodes=new Map(),labels=new Map(),links=[],baseMaterials=new Map(),sceneData={theme:{accent:'#55eeee'},chapters:[{title:'初态'}]};
    let world=new T.Scene(),renderer,composer,compositionTarget,environmentTarget,environmentGround;
    const calls=[],image={width:0,height:0},ctx={fillRect(){},strokeRect(){},
      measureText(text){return {width:Array.from(text).length*64}},fillText(...args){calls.push(args)}};
    image.getContext=()=>ctx;const document={createElement(kind){if(kind!=='canvas')throw new Error(kind);return image;}};
    const material=spec=>new T.MeshStandardMaterial({color:spec.color});
    ${extract('surfaceTextMaterial')}
    ${extract('buildNode')}
    ${extract('disposeGraphics')}
    const spec=${JSON.stringify({ ...signScene().nodes[2], kind, params, surfaceText: { ...signScene().nodes[2].surfaceText, chapterTitle } })};
    const before=JSON.stringify(spec);buildNode(spec);const mesh=nodes.get(spec.id);world.add(mesh);world.updateMatrixWorld(true);
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],text=materials.find(m=>m.map),map=text.map;
    let textureDisposals=0,materialDisposals=0;map.addEventListener('dispose',()=>textureDisposals++);
    new Set(materials).forEach(m=>m.addEventListener('dispose',()=>materialDisposals++));
    const result={kind:mesh.geometry.type,bounds:new T.Box3().setFromObject(mesh).getSize(new T.Vector3()).toArray(),
      size:[image.width,image.height],calls,font:ctx.font,encoding:map.encoding,staticVersion:map.version,
      materials:materials.length,mapped:materials.map(m=>!!m.map),sharedFaces:materials[4]===materials[5],
      baseCount:baseMaterials.size,unchanged:JSON.stringify(spec)===before};
    const timeline=['初态','进入','进入','保存局部信息','返回','退出','初态'],painted=[];
    for(const title of timeline){const count=calls.length;mesh.userData.updateSurfaceText(title);painted.push({title,added:calls.slice(count).map(c=>c[0]),version:map.version});}
    disposeGraphics();disposeGraphics();({...result,painted,textureDisposals,materialDisposals,empty:nodes.size===0});
  `).runInContext(context, { timeout: 5000 });
}

describe('explicit static surface text, not imaginary dynamic screens', () => {
  it('keeps backward compatibility and validates an explicit sign', () => {
    expect(parseCinematicScene(sceneFixture()).nodes.every(node => !node.surfaceText)).toBe(true);
    expect(parseCinematicScene(signScene()).nodes[2].surfaceText).toEqual(signScene().nodes[2].surfaceText);
    const scene = signScene(); scene.nodes[2].kind = 'plane'; scene.nodes[2].params = { width: 4, height: 1.5 };
    expect(cinematicSchema.safeParse(scene).success).toBe(true);
  });

  it('rejects unsupported assets, extreme ratios, excessive signs and executable fields', () => {
    const asset = signScene(); asset.nodes[0].surfaceText = asset.nodes[2].surfaceText;
    expect(cinematicSchema.safeParse(asset).success).toBe(false);
    const skinny = signScene(); skinny.nodes[2].params.height = 0.1;
    expect(cinematicSchema.safeParse(skinny).success).toBe(false);
    const crowd = signScene(); for (let i = 0; i < 8; i++) crowd.nodes.push({ ...crowd.nodes[2], id: 'sign-' + i });
    expect(cinematicSchema.safeParse(crowd).success).toBe(false);
    for (const text of [{ lines: [] }, { lines: ['\n'] }, { lines: ['x'.repeat(49)] }, { lines: ['a', 'b', 'c', 'd', 'e'] }, { lines: ['safe'], html: '<img src=x>' }]) {
      const scene = signScene(); Object.assign(scene.nodes[2], { surfaceText: text });
      expect(cinematicSchema.safeParse(scene).success).toBe(false);
    }
  });

  it('treats markup as literal text and safely embeds the scene', () => {
    const scene = signScene(); scene.nodes[2].surfaceText!.lines = ['</script><img src=x onerror=alert(1)>'];
    const html = compileCinematicScene(scene);
    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003c/script>');
    expect(extract('surfaceTextMaterial')).toContain('context.fillText(line');
    expect(extract('surfaceTextMaterial')).not.toMatch(/innerHTML|fetch\(|new Image|\.src=/);
  });

  it('paints both box faces once without changing shape or requiring a browser in this unit test', () => {
    const result = run();
    expect(result.kind).toBe('BoxGeometry');
    expect(result.bounds[0]).toBeCloseTo(4); expect(result.bounds[1]).toBeCloseTo(1.5); expect(result.bounds[2]).toBeCloseTo(0.1);
    expect(result.calls.map((call: unknown[]) => call[0])).toEqual(['教学概念模型', '不控制真实设备']);
    expect(result.mapped).toEqual([false, false, false, false, true, true]);
    expect(result.sharedFaces).toBe(true); expect(result.baseCount).toBe(2);
    expect(result.unchanged).toBe(true); expect(result.staticVersion).toBe(1);
    expect(result.textureDisposals).toBe(1); expect(result.materialDisposals).toBe(2); expect(result.empty).toBe(true);
  });

  it.each([0.25, 1, 3, 8])('bounds texture allocation for aspect ratio %s', aspect => {
    const result = run('box', { width: aspect * 2, height: 2, depth: 0.1 });
    expect(result.size[0] * result.size[1]).toBeLessThanOrEqual(262144);
    expect(Math.max(...result.size)).toBeLessThanOrEqual(1024);
    expect(result.size[0] / result.size[1]).toBeCloseTo(aspect, 1);
  });

  it('replaces the plane material without duplicate GPU allocations', () => {
    const result = run('plane');
    expect(result.kind).toBe('PlaneGeometry'); expect(result.materials).toBe(1); expect(result.mapped).toEqual([true]);
    expect(result.textureDisposals).toBe(1); expect(result.materialDisposals).toBe(1);
  });

  it('binds the current chapter on seek/reset without allocating a texture per frame', () => {
    const result = run('box', { width: 4, height: 1.5, depth: 0.1 }, true);
    expect(result.painted.map((entry: { version: number }) => entry.version)).toEqual([1, 2, 2, 3, 4, 5, 6]);
    expect(result.painted[0].added).toEqual([]); expect(result.painted[2].added).toEqual([]);
    expect(result.painted[3].added).toEqual(['教学概念模型', '不控制真实设备', '保存局部信息']);
    expect(result.painted[6].added.at(-1)).toBe('初态');
    expect(result.textureDisposals).toBe(1);
    expect(extract('animateWorld')).toContain('updateSurfaceText?.(sceneData.chapters[state.chapter].title)');
    expect(player.indexOf('selectChapter();if(mode')).toBeGreaterThan(0);
    expect(run().painted.every((entry: { added: unknown[]; version: number }) => !entry.added.length && entry.version === 1)).toBe(true);
  });

  it('reserves one of the four available lines for the exact chapter title', () => {
    const scene = signScene(); scene.nodes[2].surfaceText = { lines: ['当前阶段'], chapterTitle: true, color: '#ffffff' };
    expect(cinematicSchema.safeParse(scene).success).toBe(true);
    scene.nodes[2].surfaceText.lines = ['a', 'b', 'c', 'd'];
    expect(cinematicSchema.safeParse(scene).success).toBe(false);
  });

  it.each([true, false])('keeps picked details synchronized on chapter changes, dynamic=%s', chapterTitle => {
    const result = new Script(`
      const sceneData={duration:84,chapters:[0,52,55,63,67].map((at,i)=>({at,title:['初态','进入','保存局部信息','返回','退出'][i],caption:'说明'})),
        nodes:[{id:'sign',label:'阶段铭牌',detail:'教学说明',surfaceText:{lines:['当前阶段'],chapterTitle:${chapterTitle}}}]};
      const state={time:52,chapter:-1,playing:false,selectedDetail:null},root={dataset:{}},writes=[];
      const elements=Object.fromEntries(['chapter-title','chapter-caption','chapter-number','chapter-question','animation-progress','time-label','animation-play','animation-pause','detail-title'].map(id=>[id,{}]));
      elements['detail-copy']={set textContent(value){writes.push(value);}};
      elements.chapters={children:sceneData.chapters.map(()=>({classList:{toggle(){}},setAttribute(){},getBoundingClientRect(){return {left:20,right:80}}})),getBoundingClientRect(){return {left:0,right:100}}};
      ${extract('showDetail')}
      ${extract('selectChapter')}
      selectChapter();showDetail('sign');showDetail('missing');const selected=state.selectedDetail;
      const result=[];for(const time of [52,55,55+1/30,63,67,55,0,0]){state.time=time;selectChapter();result.push({time,title:elements['chapter-title'].textContent,detail:writes.at(-1),writes:writes.length});}
      ({result,selected});
    `).runInContext(createContext({}), { timeout: 5000 });
    expect(result.selected).toBe('sign');
    expect(result.result.map((entry: { writes: number }) => entry.writes)).toEqual([1, 2, 2, 3, 4, 5, 6, 6]);
    expect(result.result.map((entry: { title: string; detail: string }) => entry.detail)).toEqual(
      ['进入', '保存局部信息', '保存局部信息', '返回', '退出', '保存局部信息', '初态', '初态']
        .map(title => ['当前阶段', ...(chapterTitle ? [title] : []), '教学说明'].join('\n')),
    );
  });

  it('exposes the capability and its static limitations to real generation and review', () => {
    expect(CINEMATIC_SCENE_PROMPT).toContain('surfaceText:{lines:');
    expect(CINEMATIC_SCENE_PROMPT).toContain('surfaceText不是params');
    expect(CINEMATIC_GROUNDING_PROMPT).toContain('不是动态显示屏');
    expect(extract('showDetail')).toContain('node.surfaceText?.lines');
  });
});

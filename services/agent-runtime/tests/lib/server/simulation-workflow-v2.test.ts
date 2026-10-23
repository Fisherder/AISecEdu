import { CINEMATIC_REPAIR_PROMPT, cinematicBrowserReviewEvidence, parseCinematicGroundingReview, sanitizeCinematicGeometryPatches, stripGeometryLearnerControlPatches } from '@/lib/server/cinematic-generation';
import { adjudicateCinematicCritique, cinematicSemanticCritiqueClaims, reconcileCinematicSemanticCritique } from '@/lib/cinematic/critique';
import { verifyVisualIntentSource } from '@/lib/cinematic/capabilities';
import { describe, it, expect, vi } from 'vitest';
import { sceneFixture } from '../../fixtures/cinematic';
import { runDurableStage, generationFingerprint, normalizeModelEnvelope } from '@/lib/generation/durable-stage';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import { applyCinematicRevision, validateCinematicRevisionPlan, cinematicRevisionContext } from '@/lib/cinematic/revision';
import {
  CINEMATIC_DIRECTOR_V2_PROMPT,
  CINEMATIC_STRUCTURE_PROMPT,
  CINEMATIC_TIMELINE_PROMPT,
  generateStagedCinematicScene,
  generateVerifiedCinematicDirector,
  normalizeDirectorAuditSourceChecks,
} from '@/lib/cinematic/scene-workflow';
import { reviseCinematicExplainer, CINEMATIC_REVISION_REVIEW_PROMPT } from '@/lib/server/cinematic-revision';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { recoverCinematicCamera, recoverCinematicChapterFrame } from '@/lib/cinematic/camera-recovery';
import type { CinematicRenderInspection } from '@/lib/cinematic/render-client';
import { cinematicReviewFacts } from '@/lib/cinematic/review-facts';
import { sourceRequirements, validateSourceChecks } from '@/lib/generation/source-requirements';
import { normalizeGeneratedLearnerControls } from '@/lib/cinematic/learner-controls';

function memoryState(): GenerationStateStore {
  const entries = new Map<string, unknown>();
  return {read: name => structuredClone(entries.get(name)), write: async (name, value) => {entries.set(name, structuredClone(value));}};
}
const planFor = (path: string) => ({summary: '按教师要求调整', changes: [{path, reason: '教师指定字段'}]});
const render = (issues: CinematicRenderInspection['issues'] = []) => ({issues, evidence: {frames: []}} as unknown as CinematicRenderInspection);

describe('durable simulation workflow', () => {
  it('front-loads centrifuge state geometry, evidence timing and reset consistency', () => {
    expect(CINEMATIC_DIRECTOR_V2_PROMPT).toContain('单独的取证总结镜头和观察问题');
    expect(CINEMATIC_STRUCTURE_PROMPT).toContain('青/琥珀/红链路层与断口几何');
    expect(CINEMATIC_STRUCTURE_PROMPT).toContain('不得使用完全相同的points和半径互相遮住');
    expect(CINEMATIC_TIMELINE_PROMPT).toContain('约0.7弧度的清晰夹角');
    expect(CINEMATIC_TIMELINE_PROMPT).toContain('duration之前具有正时长的独立末章');
    expect(CINEMATIC_REPAIR_PROMPT).toContain('coverage要证明按钮触发后的设备可见结果');
    expect(CINEMATIC_REPAIR_PROMPT).toContain('不要在相机frame仍排除目标时反复移动同一隐藏节点');
    expect(CINEMATIC_REPAIR_PROMPT).toContain('不得新增、替换或删除/learnerControls路径');
  });

  it('removes player-owned step controls and repairs narrow button transport mistakes', () => {
    const input = {learnerControls: [
      {id: 'single-step', kind: 'button', label: '单步', action: 'step', at: 10},
      {id: 'pause', kind: 'button', label: '暂停', action: 'pause', at: 20},
      {id: 'stop', type: 'button', label: '紧急停机', action: 'seek', at: 58},
      {id: 'speed', type: 'range', label: '转速', min: 0},
    ]};
    const normalized = normalizeGeneratedLearnerControls(input) as typeof input;
    expect(normalized.learnerControls).toEqual([
      {id: 'pause', label: '暂停', action: 'pause', type: 'button'},
      {id: 'stop', type: 'button', label: '紧急停机', action: 'seek', at: 58},
      {id: 'speed', type: 'range', label: '转速', min: 0},
    ]);
    expect(input.learnerControls[0]).toHaveProperty('action', 'step');
  });

  it('drops contradictory player controls from model and view evidence without inventing a control mapping', () => {
    const input = {coverage: {interactions: [
      {description: '旋转视角观察双螺旋整体与局部结构', chapter: 0,
        targets: ['dna-helix'], controls: ['reset'], properties: ['rotation', 'explore']},
      {description: '重置回初始完整配对状态', chapter: 1,
        targets: ['dna-helix'], controls: ['reset'], properties: ['controls']},
    ]}};
    const normalized = normalizeGeneratedLearnerControls(input);
    expect(normalized.coverage.interactions[0]).not.toHaveProperty('controls');
    expect(normalized.coverage.interactions[0].properties).toEqual(['rotation', 'explore']);
    expect(normalized.coverage.interactions[1].controls).toEqual(['reset']);
    expect(input.coverage.interactions[0].controls).toEqual(['reset']);
  });

  it('keeps geometry repair atomic after dropping out-of-scope learner control edits', () => {
    const input = {patches: [
      {op: 'add', path: '/assembly/placements/-', value: {mode: 'relative'}},
      {op: 'replace', path: '/learnerControls', value: [{kind: 'button', action: 'step'}]},
      {op: 'replace', path: '/tracks/1/keyframes', value: []},
    ]};
    expect(stripGeometryLearnerControlPatches(input)).toEqual({patches: [input.patches[0], input.patches[2]]});
    expect(input.patches).toHaveLength(3);
  });

  it('freezes requirement identity while allowing geometry repair to correct its evidence mapping', () => {
    const scene = sceneFixture();
    scene.coverage = {objects: [{name:'阀门实体',nodes:['hero']}], interactions: [{description: '表现流体沿流道按正确方向流动',chapter: 0,targets: ['hero'],properties: ['position']}], presentation: []};
    const input = {patches: [
      {op: 'replace',path: '/coverage/interactions/0',value: {description: '扩写后的另一句话',chapter: 1,targets: ['hero'],properties: ['transport']}},
      {op: 'replace',path: '/coverage/interactions/0/description',value: '删除原始需求身份'},
      {op: 'add',path: '/coverage/interactions/-',value: {description: '模型自行新增的交互'}},
      {op: 'replace',path: '/coverage/objects/0',value: {name:'改写对象',nodes:['hero']}},
      {op: 'replace',path: '/coverage/interactions/4',value: {description:'越界'}},
      {op: 'replace',path: '/coverage/interactions/0/targets',value: ['missing-node','hero']},
    ]};
    expect(sanitizeCinematicGeometryPatches(scene,input)).toEqual({patches: [{
      op: 'replace',path: '/coverage/interactions/0',value: {description: '表现流体沿流道按正确方向流动',chapter: 1,targets: ['hero'],properties: ['transport']},
    }, {op:'replace',path:'/coverage/objects/0',value:{name:'阀门实体',nodes:['hero']}},
    {op:'replace',path:'/coverage/interactions/0/targets',value:['hero']}]});
    expect((input.patches[0].value as {description:string}).description).toBe('扩写后的另一句话');
  });

  it('compiles a requested model readout into a valid child text plane',()=>{
    const scene=sceneFixture(),input={patches:[{op:'add',path:'/nodes/@hero/surfaceText',value:{text:'HMI 正常读数 1250 rpm',color:'#5bdded'}}]};
    const sanitized=sanitizeCinematicGeometryPatches(scene,input);
    expect(sanitized).toEqual({patches:[{op:'add',path:'/nodes/-',value:expect.objectContaining({
      id:'hero-readout',kind:'plane',parent:'hero',role:'support',surfaceText:{lines:['HMI 正常读数 1250 rpm'],color:'#5bdded'},
    })}]});
    expect(input.patches[0].path).toBe('/nodes/@hero/surfaceText');
  });

  it('preserves original scope qualifiers as exact source requirements and rejects omitted or rewritten checks', () => {
    const originalRequest = '展示两条骨架，通过局部分离再复原，支持单步。';
    const requirements = sourceRequirements({originalRequest});
    expect(requirements.map(item => item.text).join('')).toBe(originalRequest);
    const checks = requirements.map(item => ({index: item.index, quote: item.text, fulfilled: true, evidence: '对应真实轨道'}));
    expect(validateSourceChecks(requirements, checks)).toEqual(checks);
    expect(() => validateSourceChecks(requirements, checks.slice(1))).toThrow('全部sourceRequirements');
    expect(() => validateSourceChecks(requirements, checks.map((check, i) => i === 1 ? {...check, quote: '通过整体分离再复原，'} : check))).toThrow('不得遗漏或改写');
    expect(sourceRequirements({originalRequest: 'expanded', teacherLearningRequest: {originalRequest, feedback: ['改成蓝色。']}}).at(-1)).toMatchObject({source: 'feedback-0', text: '改成蓝色。'});
  });
  it('recovers a clean director audit envelope without weakening explicit failures', () => {
    const requirements=sourceRequirements({originalRequest:'保留局部动作，并支持重置。'});
    const partial=[{index:0,quote:'模型改写了引号',fulfilled:true,evidence:'局部零件单独运动'}];
    const recovered=normalizeDirectorAuditSourceChecks(requirements,partial,[]);
    expect(recovered).toHaveLength(requirements.length);
    expect(recovered.map(check=>check.quote)).toEqual(requirements.map(requirement=>requirement.text));
    expect(recovered.every(check=>check.fulfilled)).toBe(true);
    expect(normalizeDirectorAuditSourceChecks(requirements,partial,['缺少重置证据']).at(-1)).toMatchObject({fulfilled:false});
  });
  it('rejects a plan that changes local motion to global motion before building and reuses the verified plan', async () => {
    const request = {originalRequest: '局部分离再复原。'}, state = memoryState();
    const aiCall = vi.fn().mockResolvedValueOnce(JSON.stringify({scope: 'global'}))
      .mockResolvedValueOnce(JSON.stringify({sourceChecks: [{index: 0, quote: request.originalRequest, fulfilled: false, evidence: '缺少保持不动的其余部分'}], issues: []}))
      .mockResolvedValueOnce(JSON.stringify({scope: 'local', reference: 'fixed'}))
      .mockResolvedValueOnce(JSON.stringify({sourceChecks: [{index: 0, quote: request.originalRequest, fulfilled: true, evidence: '局部独立节点运动，其余参照固定'}], issues: []}));
    const options = {request, state, aiCall, validate: (value: unknown) => value as {scope: string}};
    expect(await generateVerifiedCinematicDirector(options)).toMatchObject({scope: 'local'});
    expect(JSON.parse(aiCall.mock.calls[2][1]).previous.issues.join('')).toContain('缺少保持不动');
    expect(await generateVerifiedCinematicDirector(options)).toMatchObject({scope: 'local'});
    expect(aiCall).toHaveBeenCalledTimes(4);
  });
  it('passes compiler-enforced offline guarantees to the independent director audit', async () => {
    const request = {originalRequest: '作品必须完全离线、自包含。'};
    const aiCall = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({scope: 'scene'}))
      .mockImplementationOnce(async (_system: string, input: string) => {
        const data = JSON.parse(input);
        expect(data.runtimeGuarantees).toEqual({offlineSelfContained: true});
        return JSON.stringify({sourceChecks: [{index: 0, quote: request.originalRequest, fulfilled: true, evidence: '编译器本地内联全部运行资源'}], issues: []});
      });
    expect(await generateVerifiedCinematicDirector({request, aiCall, validate: value => value as {scope: string}})).toEqual({scope: 'scene'});
  });
  it('continues with a new plan after a rejected-plan batch instead of replaying cached failures forever', async () => {
    const request = {originalRequest: '局部变化。'}, state = memoryState(); let plans = 0;
    const aiCall = vi.fn(async (_system: string, input: string) => {
      const data = JSON.parse(input);
      if (data.legalModels) return JSON.stringify({id: ++plans});
      return JSON.stringify({sourceChecks: [{index: 0, quote: request.originalRequest, fulfilled: plans > 3, evidence: '范围检查'}], issues: []});
    });
    const options = {request, state, aiCall, validate: (value: unknown) => value as {id: number}};
    await expect(generateVerifiedCinematicDirector(options)).rejects.toThrow('director-requirements');
    expect(await generateVerifiedCinematicDirector(options)).toEqual({id: 4});
    expect(plans).toBe(4);
    expect(await generateVerifiedCinematicDirector(options)).toEqual({id: 4});
    expect(plans).toBe(4);
  });
  it('independently corrects unrequested reset behavior while retaining exact source clauses', async () => {
    const candidate = {mode: 'interactive-2d' as const, twoDimensionalFormat: 'simulation' as const, reason: '输入并计算', objects: ['数组'], interactions: ['重置并清空输入'], interactionRequirements: [{description: '重置并清空输入', kind: 'state-change' as const}], visualPriorities: []};
    const intent = {...candidate, interactions: ['重置实验'], interactionRequirements: [{description: '重置实验', kind: 'state-change' as const}]};
    const aiCall = vi.fn().mockResolvedValue(JSON.stringify({intent, sourceChecks: [{index: 0, quote: '支持重置。', fulfilled: true, evidence: '重置实验，恢复默认状态与默认输入，不增加清空条件'}]}));
    const state = memoryState();
    expect(await verifyVisualIntentSource('支持重置。', {}, candidate, aiCall, state)).toMatchObject(intent);
    expect(await verifyVisualIntentSource('支持重置。', {}, candidate, aiCall, state)).toMatchObject(intent);
    expect(aiCall).toHaveBeenCalledTimes(1);
  });
  it('keeps rendering technology and chapter names out of drawable intent objects', async () => {
    const request = '展示一台离心机。';
    const candidate = {mode: 'cinematic-v1' as const, reason: '三维观察', objects: ['一台离心机', 'Three.js渲染技术', '准备章节'], interactions: [], interactionRequirements: [], visualPriorities: []};
    const corrected = {...candidate, objects: ['一台离心机']};
    const aiCall = vi.fn(async (system: string) => {
      expect(system).toContain('intent.objects只保留必须映射到实际几何');
      return JSON.stringify({intent: corrected, sourceChecks: [{index: 0, quote: request, fulfilled: true, evidence: '离心机保留为实际几何，渲染技术和章节不冒充实体'}]});
    });
    expect(await verifyVisualIntentSource(request, {}, candidate, aiCall, memoryState())).toMatchObject(corrected);
  });
  it('reports unavailable angular rates for an instantaneous terminal chapter without crashing the review', () => {
    const scene = sceneFixture();
    scene.chapters.at(-1)!.at = scene.duration;
    scene.tracks.push({target: 'hero', property: 'rotation', easing: 'linear', keyframes: [{at: 0, value: [0, 0, 0]}, {at: scene.duration, value: [0, 1, 0]}]});
    const facts = cinematicReviewFacts(scene);
    expect(facts.rotation.at(-1)!.tracks).toHaveLength(1);
    expect(facts.rotation.at(-1)!.tracks.every(track => 'available' in track && track.available === false)).toBe(true);
    expect(facts.rotation.at(-1)!.end).toBe(scene.duration);
  });
  it('removes volatile browser elapsed time from durable semantic evidence', () => {
    const scene = sceneFixture();
    const evidence = (elapsed: number) => ({
      sourceSha256: 'a'.repeat(64),
      controls: {playingWhileExploring: true, cameraHeld: true, zoomWorked: true, paused: true, reset: true, elapsed},
      frames: [],
    }) as any;
    expect(cinematicReviewFacts(scene, evidence(1))).toEqual(cinematicReviewFacts(scene, evidence(42)));
    expect(cinematicBrowserReviewEvidence(evidence(1), scene)).toEqual(cinematicBrowserReviewEvidence(evidence(42), scene));
  });
  it('normalizes only the known provider JSON transport marker without stripping unknown payload fields', () => {
    expect(normalizeModelEnvelope({type: 'json_object', patches: [], unexpected: true})).toEqual({patches: [], unexpected: true});
    expect(normalizeModelEnvelope({type: 'unknown', patches: []})).toEqual({type: 'unknown', patches: []});
    expect(normalizeModelEnvelope({scene: {type: 'json_object'}})).toEqual({scene: {type: 'json_object'}});
  });
  it('resumes validated stages without another model call, and fingerprints the entire input', async () => {
    const state = memoryState(), aiCall = vi.fn().mockResolvedValue('{"n":2}');
    const options = {name: 'test', system: 'schema v1', input: {request: 'first'}, aiCall, state,
      validate: (value: unknown) => {expect(value).toEqual({n: 2}); return value;}};
    await runDurableStage(options);
    await runDurableStage(options);
    expect(aiCall).toHaveBeenCalledTimes(1);
    await runDurableStage({...options, input: {request: 'changed'}});
    expect(aiCall).toHaveBeenCalledTimes(2);
  });
  it('keeps invalid output and exact diagnostics across retry invocations', async () => {
    const state = memoryState();
    const options = {name: 'invalid', system: 'schema', input: {}, state, maxAttempts: 1,
      validate: (value: unknown) => {if ((value as {n: number}).n !== 2) throw Error('n must be 2'); return value;}};
    await expect(runDurableStage({...options, aiCall: async () => '{"n":1}'})).rejects.toThrow('n must be 2');
    const aiCall = vi.fn(async (_system, user) => {const input = JSON.parse(user); expect(input.repair.previousOutput).toBe('{"n":1}'); return '{"n":2}';});
    await runDurableStage({...options, aiCall});
    expect(aiCall).toHaveBeenCalledTimes(1);
  });
  it('restarts a repeatedly malformed behavior step from frozen inputs instead of copying broken JSON', async () => {
    const state = memoryState();
    const prompts: unknown[] = [];
    const aiCall = vi.fn(async (_system: string, user: string) => {
      const prompt = JSON.parse(user); prompts.push(prompt);
      return prompts.length <= 3 ? '{"actions":[{"id":"bad"}]]}' : '{"actions":[{"id":"valid"}]}';
    });
    const result = await runDurableStage({name: 'process-behavior', system: 'behavior contract',
      input: {frozen: {initialState: {decision: 'pending'}}}, aiCall, state, maxAttempts: 5,
      validate: value => value as {actions: Array<{id: string}>}});
    expect(result.actions[0].id).toBe('valid');
    expect(aiCall).toHaveBeenCalledTimes(4);
    expect((prompts[1] as any).repair.previousOutput).toContain('bad');
    expect((prompts[3] as any).repair.previousOutput).toBeUndefined();
    expect((prompts[3] as any).frozen.initialState.decision).toBe('pending');
    expect((prompts[3] as any).repair.instruction).toContain('不要续写或复制旧输出');
    await runDurableStage({name: 'process-behavior', system: 'behavior contract',
      input: {frozen: {initialState: {decision: 'pending'}}}, aiCall, state, maxAttempts: 5,
      validate: value => value as {actions: Array<{id: string}>}});
    expect(aiCall).toHaveBeenCalledTimes(4);
  });
  it('restarts a repeatedly malformed presentation step without redoing its frozen state and actions', async () => {
    const prompts: any[] = [];
    const aiCall = vi.fn(async (_system: string, user: string) => {
      prompts.push(JSON.parse(user));
      return prompts.length <= 3 ? '{"views":[{"id":"broken"}}' : '{"title":"访问控制","views":[]}';
    });
    const result = await runDurableStage({name: 'process-presentation', system: 'presentation contract',
      input: {frozen: {initialState: {decision: 'pending'}, actions: [{id: 'match'}]}},
      aiCall, maxAttempts: 5, validate: value => value as {title: string; views: unknown[]}});
    expect(result.title).toBe('访问控制');
    expect(prompts[3].repair.previousOutput).toBeUndefined();
    expect(prompts[3].repair.instruction).toContain('完整的{title,summary,modelNote,views,stages,questions,coverage}');
    expect(prompts[3].frozen.actions).toEqual([{id: 'match'}]);
  });
  it('propagates provider outages without consuming content repair attempts', async () => {
    const state = memoryState(), aiCall = vi.fn().mockRejectedValue(Error('provider offline'));
    await expect(runDurableStage({name: 'outage', system: '', input: {}, state, aiCall, validate: value => value})).rejects.toThrow('provider offline');
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(state.read('workflow-outage')).toBeUndefined();
  });
  it('does not generate after cancellation', async () => {
    const controller = new AbortController(); controller.abort(Error('canceled'));
    const aiCall = vi.fn();
    await expect(runDurableStage({name: 'cancel', system: '', input: {}, signal: controller.signal, aiCall, validate: value => value})).rejects.toThrow('canceled');
    expect(aiCall).not.toHaveBeenCalled();
  });
  it('keeps the completed structure when the timeline call disconnects', async () => {
    const scene = sceneFixture();
    const {schemaVersion: _version, tracks, shots, chapters, coverage, learnerControls, ...structure} = scene;
    const state = memoryState();
    const first = vi.fn().mockResolvedValueOnce(JSON.stringify(structure)).mockRejectedValueOnce(Error('disconnect'));
    const options = {request: {originalRequest: '观察芯片拆解'}, director: {objectives: scene.objectives},
      qualityOptions: {}, state, geometryContext: () => ({})};
    await expect(generateStagedCinematicScene({...options, aiCall: first})).rejects.toThrow('disconnect');
    const second = vi.fn().mockResolvedValue(JSON.stringify({tracks, shots, chapters, coverage, learnerControls}));
    const result = await generateStagedCinematicScene({...options, aiCall: second});
    expect(second).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.mock.calls[0][1]).structure).toEqual(structure);
    expect(result.nodes).toEqual(scene.nodes);
  });
  it('preserves verified director objectives without regenerating sound geometry', async () => {
    const scene = sceneFixture();
    const {schemaVersion: _version, tracks, shots, chapters, coverage, learnerControls, ...structure} = scene;
    const objectives = ['教师指定的学习目标'];
    const aiCall = vi.fn().mockResolvedValueOnce(JSON.stringify(structure))
      .mockResolvedValueOnce(JSON.stringify({tracks, shots, chapters, coverage, learnerControls}));
    const result = await generateStagedCinematicScene({
      request: {originalRequest: '观察芯片拆解'}, director: {objectives}, qualityOptions: {},
      aiCall, geometryContext: () => ({}),
    });
    expect(result.objectives).toEqual(objectives);
    expect(result.nodes).toEqual(scene.nodes);
    expect(aiCall).toHaveBeenCalledTimes(2);
  });
});

describe('scoped cinematic revisions', () => {
  it.each(['/title', '/nodes/@hero/color', '/shots/1/position', '/chapters/0/caption', '/tracks/@bank:position/keyframes'])('edits %s without modifying other fields', path => {
    const scene = sceneFixture(), original = structuredClone(scene);
    const plan = validateCinematicRevisionPlan(scene, planFor(path));
    const context = cinematicRevisionContext(scene, plan);
    const value = path === '/title' ? '新标题' : path.endsWith('/color') ? '#aabbcc' : path.endsWith('/position') ? [9, 6, 12]
      : path.endsWith('/caption') ? '芯片各层分离后可以观察内部结构' : [{at: 0, value: [5, 0, 0]}, {at: 60, value: [5, 3, 0]}];
    const result = applyCinematicRevision(scene, {baseHash: context.baseHash,
      patches: [{op: 'replace', path, expected: context.fields[0].value, value}]}, plan);
    expect(result.revision.changedPaths).toEqual([path]);
    expect(scene).toEqual(original);
    if (!path.startsWith('/nodes')) expect(result.scene.nodes).toEqual(scene.nodes);
    if (!path.startsWith('/tracks')) expect(result.scene.tracks).toEqual(scene.tracks);
    if (!path.startsWith('/shots')) expect(result.scene.shots).toEqual(scene.shots);
  });
  it.each(['/nodes', '/tracks', '/chapters', '/theme', '/nodes/@hero/id', '/theme/__proto__', '/nodes/999/color'])('rejects overly broad, unsafe or nonexistent scope %s', path => {
    expect(() => validateCinematicRevisionPlan(sceneFixture(), planFor(path))).toThrow();
  });
  it('rejects stale hashes and expected values atomically', () => {
    const scene = sceneFixture(), plan = planFor('/title'), baseHash = generationFingerprint(scene);
    const original = structuredClone(scene);
    expect(() => applyCinematicRevision(scene, {baseHash: 'a'.repeat(64), patches: [{op: 'replace', path: '/title', expected: scene.title, value: '改标题'}]}, plan)).toThrow('底稿');
    expect(() => applyCinematicRevision(scene, {baseHash, patches: [{op: 'replace', path: '/title', expected: '过时标题', value: '改标题'}]}, plan)).toThrow('原值');
    expect(scene).toEqual(original);
  });
  it('blocks unrelated edits even if they make a valid scene', () => {
    const scene = sceneFixture();
    expect(() => applyCinematicRevision(scene, {baseHash: generationFingerprint(scene), patches: [
      {op: 'replace', path: '/title', expected: scene.title, value: '指定标题'},
      {op: 'replace', path: '/nodes/@hero/color', expected: scene.nodes[0].color, value: '#111111'},
    ]}, planFor('/title'))).toThrow('超出');
    expect(scene.title).toBe('模型观察');
  });
  it('requires every planned edit and avoids falsely marking partial work complete', () => {
    const scene = sceneFixture();
    const plan = {summary: '改标题和颜色', changes: [...planFor('/title').changes, ...planFor('/nodes/@hero/color').changes]};
    expect(() => applyCinematicRevision(scene, {baseHash: generationFingerprint(scene), patches: [
      {op: 'replace', path: '/title', expected: scene.title, value: '指定标题'},
    ]}, plan)).toThrow('遗漏');
  });
  it('canonicalizes numeric node selectors before enforcing scope', () => {
    const scene = sceneFixture();
    const plan = validateCinematicRevisionPlan(scene, planFor('/nodes/0/color'));
    expect(plan.changes[0].path).toBe('/nodes/@hero/color');
    expect(applyCinematicRevision(scene, {baseHash: generationFingerprint(scene), patches: [
      {op: 'replace', path: '/nodes/@hero/color', expected: scene.nodes[0].color, value: '#abcdef'},
    ]}, plan).scene.nodes[0].color).toBe('#abcdef');
  });
  it('uses scope, patch and delta review only, and keeps a validated candidate after inspector interruption', async () => {
    const base = sceneFixture(), state = memoryState(), plan = planFor('/title');
    const aiCall = vi.fn(async (system: string) => system === CINEMATIC_REVISION_REVIEW_PROMPT
      ? JSON.stringify({checks: [{path: '/title', fulfilled: true, reason: '逐字符合要求'}], issues: []})
      : system.includes('最小修改范围') ? JSON.stringify(plan)
      : JSON.stringify({baseHash: generationFingerprint(base), patches: [{op: 'replace', path: '/title', expected: base.title, value: '芯片拆解'}]}));
    const previous = {html: compileCinematicScene(base), instruction: '只把标题改为芯片拆解'};
    await expect(reviseCinematicExplainer({type: 'simulation', title: base.title}, 1, aiCall, previous,
      {state, inspect: async () => {throw Error('inspector offline');}})).rejects.toThrow('inspector offline');
    expect(aiCall).toHaveBeenCalledTimes(2);
    const result = await reviseCinematicExplainer({type: 'simulation', title: base.title}, 1, aiCall, previous,
      {state, inspect: async () => render()});
    expect(aiCall).toHaveBeenCalledTimes(3);
    expect(result.content).toMatchObject({cinematicScene: {title: '芯片拆解', nodes: base.nodes, tracks: base.tracks, shots: base.shots, chapters: base.chapters}});
    expect(result.content).toMatchObject({cinematicValidation: {reviewScope: 'revision-delta-and-dependencies'}});
  });
});

describe('evidence-driven camera recovery', () => {
  it('adds a rendered chapter shot when a stale detail frame clips the next chapter', async () => {
    const base = sceneFixture();
    base.shots[0].frame = {nodes: ['hero'], padding: 1.2, region: {center: [0, 0, 0], size: [.5, .5, .5]}};
    base.shots[1].at += 1;
    const chapterAt = base.chapters[1].at;
    const baseline = render([{code: 'detail-region-unverified', message: 'stale detail', at: chapterAt, nodes: ['hero']}]);
    const inspect = vi.fn(async () => render());
    const recovered = await recoverCinematicChapterFrame(base, baseline, inspect, {requireComposition: false});
    expect(recovered.changedShot).toBe(true);
    expect(recovered.scene.shots.find(shot => shot.at === chapterAt)?.frame?.region).toBeUndefined();
    expect(recovered.scene.shots.find(shot => shot.at === chapterAt)?.frame?.nodes).toEqual(base.chapters[1].focus);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(base.shots).not.toContainEqual(recovered.scene.shots.find(shot => shot.at === chapterAt));
  });
  it('does not spend camera probes on coincident tube layers that no viewpoint can separate', async () => {
    const base = sceneFixture();
    const tube = {...base.nodes[0], kind: 'tube' as const, params: {radius: 0.08}, points: [[0, 0, 0], [2, 0, 0]] as [number, number, number][], parent: undefined};
    base.nodes.push({...tube, id: 'link-base'}, {...tube, id: 'link-red', color: '#ff0000'});
    base.chapters[1].focus = ['link-red'];
    const baseline = render([{code: 'occluded-focus', message: 'blocked', at: 20, nodes: ['link-red']}]);
    baseline.evidence.frames = [{at: 20, diagnostics: {available: true, nodes: [{id: 'link-red', visibility: {method: 'mesh-rays-v1', status: 'sampled', samples: 10, visibleSamples: 0, blockers: [{id: 'link-base'}]}}]}}] as any;
    const inspect = vi.fn(async () => render());
    const recovered = await recoverCinematicCamera(base, baseline, inspect, {requireComposition: false});
    expect(inspect).not.toHaveBeenCalled();
    expect(recovered.scene).toEqual(base);
    expect(recovered.inspection).toEqual(baseline);
  });

  it('accepts only an inspected improvement while preserving all teaching content', async () => {
    const base = sceneFixture(), original = structuredClone(base);
    const baseline = render([{code: 'occluded-focus', message: 'blocked', at: 20, nodes: ['hero']}]);
    const inspect = vi.fn(async () => render());
    const recovered = await recoverCinematicCamera(base, baseline, inspect, {requireComposition: false});
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(recovered.changedShots).toEqual([1]);
    expect(recovered.scene.nodes).toEqual(base.nodes);
    expect(recovered.scene.tracks).toEqual(base.tracks);
    expect(recovered.scene.chapters).toEqual(base.chapters);
    expect(base).toEqual(original);
  });
  it('does not accept moving an occlusion to another teaching subject', async () => {
    const base = sceneFixture();
    const baseline = render([{code: 'occluded-focus', message: 'blocked', at: 20, nodes: ['hero']}, {code: 'occluded-focus', message: 'blocked', at: 40, nodes: ['hero']}]);
    const inspect = vi.fn(async () => render([{code: 'occluded-focus', message: 'new blocker', at: 20, nodes: ['bank']}]));
    const recovered = await recoverCinematicCamera(base, baseline, inspect, {requireComposition: false});
    expect(recovered.changedShots).toEqual([]);
    expect(recovered.scene).toEqual(base);
  });
});


describe('evidence-driven transparent observation', () => {
  it('uses real reinspection and leaves focus, moving parts and unrelated fields intact', async () => {
    const base = sceneFixture(), original = structuredClone(base);
    const baseline = render([{code: 'occluded-focus', message: 'blocked', at: 20, nodes: ['hero']}]);
    baseline.evidence.frames = [{at: 20, diagnostics: {available: true, nodes: [{id: 'hero', visibility: {method: 'mesh-rays-v1', status: 'sampled', samples: 10, visibleSamples: 0, blockers: [{id: 'base'}, {id: 'bank'}, {id: 'hero'}]}}]}}] as any;
    const inspect = vi.fn(async (candidate: typeof base) => candidate.nodes.find(node => node.id === 'base')!.opacity === 0.18 ? render() : baseline);
    const recovered = await recoverCinematicCamera(base, baseline, inspect, {requireComposition: false});
    expect(recovered.transparentOccluders).toEqual(['base']);
    expect(recovered.changedShots).toEqual([]);
    expect(recovered.scene.nodes.slice(0, 2)).toEqual(base.nodes.slice(0, 2));
    expect(recovered.scene.tracks).toEqual(base.tracks);
    expect(recovered.scene.chapters).toEqual(base.chapters);
    expect(base).toEqual(original);
    expect(inspect).toHaveBeenCalledTimes(4);
  });
  it('retains the original scene when transparency does not solve the measured occlusion', async () => {
    const base = sceneFixture();
    const baseline = render([{code: 'occluded-focus', message: 'blocked', at: 20, nodes: ['hero']}]);
    baseline.evidence.frames = [{at: 20, diagnostics: {available: true, nodes: [{id: 'hero', visibility: {method: 'mesh-rays-v1', status: 'sampled', samples: 10, visibleSamples: 0, blockers: [{id: 'base'}]}}]}}] as any;
    const recovered = await recoverCinematicCamera(base, baseline, async () => baseline, {requireComposition: false});
    expect(recovered.transparentOccluders).toEqual([]);
    expect(recovered.scene).toEqual(base);
  });
  it('reveals a moving logic marker through a focused static support conduit and reinspects it', async () => {
    const base = sceneFixture();
    base.nodes.push(
      {...base.nodes[2], id: 'flow-marker', kind: 'sphere', role: 'logic', params: {radius: .1}} as any,
      {...base.nodes[2], id: 'pipe-shell', kind: 'cylinder', role: 'support', params: {top: .4, bottom: .4, height: 4}} as any,
    );
    base.tracks.push({target: 'flow-marker', property: 'position', easing: 'linear', keyframes: [
      {at: 0, value: [-2, 0, 0]}, {at: 60, value: [2, 0, 0]},
    ]});
    base.chapters[1].focus = ['flow-marker', 'pipe-shell'];
    const baseline = render([{code: 'occluded-focus', message: 'blocked by pipe', at: 20, nodes: ['flow-marker']}]);
    baseline.evidence.frames = [{at: 20, diagnostics: {available: true, nodes: [{id: 'flow-marker', visibility: {
      method: 'mesh-rays-v1', status: 'sampled', samples: 21, visibleSamples: 0, blockers: [{id: 'pipe-shell'}],
    }}]}}] as any;
    const inspect = vi.fn(async (candidate: typeof base) =>
      candidate.nodes.find(node => node.id === 'pipe-shell')!.opacity === .18 ? render() : baseline);
    const recovered = await recoverCinematicCamera(base, baseline, inspect, {requireComposition: false});
    expect(recovered.transparentOccluders).toEqual(['pipe-shell']);
    expect(recovered.scene.nodes.find(node => node.id === 'pipe-shell')!.opacity).toBe(.18);
    expect(recovered.scene.nodes.find(node => node.id === 'flow-marker')!.opacity).toBe(1);
    expect(recovered.inspection.issues).toEqual([]);
    expect(inspect).toHaveBeenCalledTimes(4);
  });
});


describe('independent critique evidence audit', () => {
  it('keeps real defects, records unsupported criticism and reuses only complete validated assessments', async () => {
    const issues = ['复核章节没有额外动作', '阀芯运动方向与原文相反'], state = memoryState();
    const input = {issues, evidence: {request: '向上开启后复核', scene: {}}};
    const ai = vi.fn().mockResolvedValueOnce(JSON.stringify({assessments: [{index: 0, issue: issues[0], blocking: false, evidence: '观察章节允许保持已完成状态，原文未要求新增动作'}]})).mockResolvedValueOnce(JSON.stringify({assessments: [
      {index: 0, issue: issues[0], blocking: false, evidence: '观察章节允许保持已完成状态，原文未要求新增动作'},
      {index: 1, issue: issues[1], blocking: true, evidence: '实际轨道Y从零变为负数，与原文向上要求相反'},
    ]}));
    const result = await adjudicateCinematicCritique(input, ai, state);
    expect(result.issues).toEqual([issues[1]]); expect(result.observations).toHaveLength(1);
    expect(ai).toHaveBeenCalledTimes(2);
    expect(await adjudicateCinematicCritique(input, ai, state)).toEqual(result);
    expect(ai).toHaveBeenCalledTimes(2);
  });
  it('audits every generated claim when a detailed scene produces more than 24 findings', async () => {
    const issues=Array.from({length:25},(_,index)=>`审查主张 ${index+1}`);
    const ai=vi.fn().mockImplementation(async (_system:string,raw:string)=>{
      const batch=JSON.parse(raw).issues as string[];
      return JSON.stringify({assessments:batch.map((_,index)=>({index,blocking:false,evidence:`场景证据 ${index+1} 表明该项属于已满足的观察说明。`}))});
    });
    const result=await adjudicateCinematicCritique({issues,evidence:{scene:'detailed'}},ai);
    expect(result.assessments).toHaveLength(25);
    expect(result.assessments.map(row=>row.issue)).toEqual(issues);
    expect(result.issues).toEqual([]);
    expect(result.observations).toHaveLength(25);
    expect(ai).toHaveBeenCalledTimes(4);
    expect(ai.mock.calls.every(call=>JSON.parse(call[1]).issues.length<=8)).toBe(true);
  });
  it('retries a mismatched legacy quote instead of assigning evidence to the wrong claim', async () => {
    const issues=['转子没有停止','碎片没有显现'];
    const ai=vi.fn()
      .mockResolvedValueOnce(JSON.stringify({assessments:[
        {index:0,issue:issues[0],blocking:true,evidence:'转子轨道持续增加，因此转子尚未停止。'},
        {index:1,issue:issues[0],blocking:false,evidence:'这个证据仍在讨论转子，不是碎片显现。'},
      ]}))
      .mockResolvedValueOnce(JSON.stringify({assessments:[
        {index:0,blocking:true,evidence:'转子轨道持续增加，因此转子尚未停止。'},
        {index:1,blocking:false,evidence:'碎片不透明度由零增加，真实几何已经显现。'},
      ]}));
    const result=await adjudicateCinematicCritique({issues,evidence:{scene:'measured'}},ai);
    expect(result.issues).toEqual([issues[0]]);
    expect(result.assessments.map(row=>row.issue)).toEqual(issues);
    expect(ai).toHaveBeenCalledTimes(2);
  });
  it('adjudicates failed source checks and clears only the claims proven nonblocking', () => {
    const sourceChecks = [
      {index: 0, quote: '范围控件改变转速。', fulfilled: false, evidence: '控件只映射timeRange，没有轨道控件ID'},
      {index: 1, quote: '信号必须全程可见。', fulfilled: false, evidence: '过程取样证明移动标记持续不可见'},
    ];
    const claims = cinematicSemanticCritiqueClaims(['重置缺少专用轨道。'], sourceChecks);
    const signalClaim = claims.find(claim => claim.includes('信号必须全程可见'))!;
    const result = reconcileCinematicSemanticCritique(
      ['重置缺少专用轨道。'],
      [],
      sourceChecks,
      {issues: [signalClaim], observations: ['range和reset使用真实播放器语义。']},
    );

    expect(result.issues).toEqual([signalClaim]);
    expect(result.sourceChecks).toEqual([
      expect.objectContaining({index: 0, fulfilled: true}),
      expect.objectContaining({index: 1, fulfilled: false}),
    ]);
    expect(result.observations).toContain('range和reset使用真实播放器语义。');
  });
});


describe('read-only semantic review protocol', () => {
  it('accepts an omitted empty patch list without waiving actual review fields', () => {
    expect(parseCinematicGroundingReview({issues: []}, true)).toEqual({issues: [], patches: []});
    expect(parseCinematicGroundingReview({issues: ['Actual motion contradicts the requested direction']}, true).issues).toHaveLength(1);
    expect(() => parseCinematicGroundingReview({issues: [], patches: 'none'}, true)).toThrow();
    expect(() => parseCinematicGroundingReview({}, true)).toThrow();
    expect(() => parseCinematicGroundingReview({issues: []}, false)).toThrow();
  });
  it('accepts detailed evidence without forcing lossy truncation', () => {
    const detail = '可核对的节点、轨道与章节证据。'.repeat(45);
    expect(parseCinematicGroundingReview({issues: [detail], observations: [detail]}, true)).toMatchObject({issues: [detail], observations: [detail]});
  });
});

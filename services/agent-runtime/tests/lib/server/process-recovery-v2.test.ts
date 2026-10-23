import { describe, it, expect, vi } from 'vitest';
import { createProcessEngine, validateProcessPackage, ProcessTestAssertionError } from '@/lib/server/process-quality';
import { parseProcessScene } from '@/lib/process/schema';
import { applyProcessDraftRepair, processRevisionHash } from '@/lib/process/revision';
import { generateStagedProcessPackage } from '@/lib/process/scene-workflow';
import { normalizeProcessExpressions } from '@/lib/process/normalize';
import { alignDraftCoverageDescriptions, generateProcessExplainer, normalizeGeneratedRuntimeControls, quarantineContradictoryByteLengthTest, quarantineContradictoryPolicyRuleTest, reconcileLocalizedPolicyTraceTest } from '@/lib/server/process-generation';

const fixture = () => ({
  scene: parseProcessScene({schemaVersion: 'process-v1', title: '计数实验', summary: '改变增量观察结果', modelNote: '离散计数',
    inputs: [{id: 'delta', label: '增量', type: 'number', min: 1, max: 5, default: 1}],
    initialState: {amount: 0, done: false},
    views: [{id: 'amount', title: '当前数量', kind: 'value', value: {state: 'amount'}},
      {id: 'phase', title: '完成状态', kind: 'value', value: {state: 'done'}}],
    actions: [{id: 'add', label: '增加', description: '增加指定数量', enabledWhen: {op: 'not', args: [{state: 'done'}]},
      updates: [{target: 'amount', value: {input: 'delta'}}, {target: 'done', value: true}], feedback: '观察当前数量'}],
    stages: [{id: 'ready', title: '准备', when: {op: 'not', args: [{state: 'done'}]}, explanation: '先设置增量'},
      {id: 'done', title: '完成', when: {state: 'done'}, explanation: '数量由输入计算'}], questions: [], coverage: []}),
  tests: [1, 3].map(delta => ({name: `增量${delta}`, inputs: {delta}, actions: [{id: 'add', count: 1}], expect: [{value: {state: 'amount'}, equals: delta}]})),
});

describe('process runtime diagnostics and recovery', () => {
  it('restores only one near-identical coverage label to the frozen teacher wording', () => {
    const requirements = ['输入目标值', '查看当前比较结果', '观察被排除区间'];
    const original = {scene: {coverage: requirements.map(description => ({description, inputs: [], actions: [], views: ['comparison']}))}};
    original.scene.coverage[1].description = '查看当前比较值';
    const aligned = alignDraftCoverageDescriptions(original, requirements) as typeof original;
    expect(aligned.scene.coverage.map(item => item.description)).toEqual(requirements);
    expect(aligned.scene.coverage[1].views).toEqual(['comparison']);
    expect(original.scene.coverage[1].description).toBe('查看当前比较值');
    const unrelated = structuredClone(original);
    unrelated.scene.coverage[1].description = '查看当前排序结果';
    expect(alignDraftCoverageDescriptions(unrelated, requirements)).toBe(unrelated);
    const multiple = structuredClone(original);
    multiple.scene.coverage[2].description = '观察当前数组';
    expect(alignDraftCoverageDescriptions(multiple, requirements)).toBe(multiple);
  });
  it('quarantines only a model-written byte-length test that contradicts the stated input limit',()=>{
    const candidate={scene:{inputs:[{id:'textA',type:'text',ascii:true},{id:'textB',type:'text',ascii:true}],
      actions:[{id:'prepare',description:'取两段较短长度的前 8 个字节作为初始状态。'}]},
      tests:[{name:'正常',inputs:{textA:'abcd',textB:'abce'},expect:[{value:{state:'dataLength'},equals:4}]},
        {name:'边界',inputs:{textA:'a',textB:'b'},expect:[{value:{state:'dataLength'},equals:1}]},
        {name:'较长输入',inputs:{textA:'abcdef',textB:'abcdeg'},expect:[{value:{state:'dataLength'},equals:4}]},
        {name:'另一输入',inputs:{textA:'xy',textB:'xz'},expect:[{value:{state:'dataLength'},equals:2}]}]};
    const failure=new ProcessTestAssertionError('较长输入：期望与实际状态不符');
    const narrowed=quarantineContradictoryByteLengthTest(candidate,failure) as typeof candidate;
    expect(narrowed.tests.map(test=>test.name)).toEqual(['正常','边界','另一输入']);
    expect(candidate.tests).toHaveLength(4);
    expect(quarantineContradictoryByteLengthTest(candidate,new ProcessTestAssertionError('正常：期望与实际状态不符'))).toBeUndefined();
  });
  it('quarantines a policy test that names a rule incompatible with its own input', () => {
    const candidate={scene:{initialState:{ruleRoles:['admin','auditor'],ruleLevels:['*','internal'],ruleActions:['*','write']}},
      tests:[{name:'基础',inputs:{}},{name:'读取',inputs:{}},{name:'管理员',inputs:{}},
        {name:'普通用户写入',inputs:{subjectRole:'user',resourceLevel:'internal',requestAction:'write'},
          expect:[{value:{state:'hitRuleIndex'},equals:1}]}]};
    const failure=new ProcessTestAssertionError('普通用户写入：期望与实际状态不符 '+JSON.stringify({
      expression:{state:'hitRuleIndex'},expected:1,actual:-1,state:{hitRuleIndex:-1},recentTransitions:[]}));
    const narrowed=quarantineContradictoryPolicyRuleTest(candidate,failure) as typeof candidate;
    expect(narrowed.tests.map(test=>test.name)).toEqual(['基础','读取','管理员']);
    expect(candidate.tests).toHaveLength(4);
    const valid={...candidate,tests:[...candidate.tests.slice(0,3),
      {...candidate.tests[3],inputs:{subjectRole:'auditor',resourceLevel:'internal',requestAction:'write'}}]};
    expect(quarantineContradictoryPolicyRuleTest(valid,failure)).toBeUndefined();
  });
  it('reconciles only equivalent stored rule codes and displayed labels in trace assertions', () => {
    const state = {ruleSrc:['internal'],ruleSrcLabel:['内部区域'],ruleDst:[22],ruleDstLabel:['22'],
      ruleState:['any'],ruleStateLabel:['任意']};
    const oldText='规则#1：来源=internal，端口=22，状态=any → 不匹配，跳过';
    const newText='规则#1：来源=内部区域，端口=22，状态=任意 → 不匹配，跳过';
    const expression={op:'at',args:[{state:'trace'},0]};
    const candidate={tests:[{name:'外部包',expect:[{value:expression,equals:oldText}]}]};
    const failure=new ProcessTestAssertionError('外部包：期望与实际状态不符 '+JSON.stringify({
      expression,expected:oldText,actual:newText,state}));
    const revised=reconcileLocalizedPolicyTraceTest(candidate,failure) as typeof candidate;
    expect(revised.tests[0].expect[0].equals).toBe(newText);
    expect(candidate.tests[0].expect[0].equals).toBe(oldText);
    const wrongRule=new ProcessTestAssertionError('外部包：期望与实际状态不符 '+JSON.stringify({
      expression,expected:oldText,actual:newText.replace('端口=22','端口=443'),state}));
    expect(reconcileLocalizedPolicyTraceTest(candidate,wrongRule)).toBeUndefined();
    const wrongOutcome=new ProcessTestAssertionError('外部包：期望与实际状态不符 '+JSON.stringify({
      expression,expected:oldText,actual:newText.replace('不匹配，跳过','匹配，允许'),state}));
    expect(reconcileLocalizedPolicyTraceTest(candidate,wrongOutcome)).toBeUndefined();
  });
  it('renders dynamic half-open regions and resolves adjacent stage boundaries by declaration order', () => {
    const pkg:any=fixture();
    pkg.scene.initialState.cells=[65,66,67];
    pkg.scene.views.push({id:'cells',title:'连续字节',kind:'array',format:'byte',value:{state:'cells'},regions:[{
      start:0,end:{op:'length',args:[{state:'cells'}]},label:'当前区域',color:'#00ffff',
    },{
      start:{op:'length',args:[{state:'cells'}]},end:{op:'length',args:[{state:'cells'}]},label:'右侧空区间',
    }]});
    pkg.scene.stages=[pkg.scene.stages[0],
      {id:'boundary',title:'边界状态',when:{state:'done'},explanation:'边界值优先显示。'},
      pkg.scene.stages[1]];
    const normalized=normalizeGeneratedRuntimeControls(pkg) as any;
    expect(normalized.scene.views[2].regions[0]).not.toHaveProperty('color');
    const checked=validateProcessPackage(normalized);
    expect(checked.evidence.every(item=>item.final.stage==='boundary')).toBe(true);
    const outOfBounds=structuredClone(normalized);
    outOfBounds.scene.views[2].regions[1].start={op:'add',args:[{op:'length',args:[{state:'cells'}]},1]};
    outOfBounds.scene.views[2].regions[1].end={op:'add',args:[{op:'length',args:[{state:'cells'}]},1]};
    expect(() => validateProcessPackage(outOfBounds)).toThrow('标注区域超出实际数组');
  });

  it('records late intermediate teaching stages after the bounded frame sample is full', () => {
    const pkg:any=fixture(),scene=pkg.scene;
    scene.actions[0].repeatWhile={op:'not',args:[{state:'done'}]};
    scene.actions[0].updates=[
      {target:'amount',value:{op:'add',args:[{state:'amount'},{input:'delta'}]}},
      {target:'done',value:{op:'gte',args:[{op:'add',args:[{state:'amount'},{input:'delta'}]},20]}},
    ];
    scene.actions[0].feedback={op:'concat',args:['当前数量：',{state:'amount'}]};
    scene.stages=[
      {id:'ready',title:'准备',when:{op:'eq',args:[{state:'amount'},0]},explanation:'准备执行。'},
      {id:'early',title:'前段',when:{op:'and',args:[{op:'gt',args:[{state:'amount'},0]},{op:'lt',args:[{state:'amount'},13]}]},explanation:'观察前段。'},
      {id:'late',title:'后段边界',when:{op:'and',args:[{op:'gte',args:[{state:'amount'},13]},{op:'lt',args:[{state:'amount'},20]}]},explanation:'观察超过第十二步后的状态。'},
      {id:'done',title:'完成',when:{op:'gte',args:[{state:'amount'},20]},explanation:'过程完成。'},
    ];
    pkg.tests=[1,3].map(delta=>({name:`步长${delta}`,inputs:{delta},actions:[{id:'add',count:'untilDone'}],expect:[{value:{state:'done'},equals:true}]}));
    const checked=validateProcessPackage(pkg);
    expect(checked.evidence[0].frames).toHaveLength(12);
    expect(checked.evidence[0].reachedStages).toContain('late');
    expect(checked.evidence[0].final.stage).toBe('done');
  });

  it('enforces the full-product interaction bar for new work without blocking compact legacy revisions', () => {
    expect(() => validateProcessPackage(fixture(), [], {minimumProductQuality: true})).toThrow('至少需要4个视图');
    const scene = parseProcessScene({
      schemaVersion: 'process-v1', title: '两步累加实验', summary: '设置增量后逐步观察累计结果', modelNote: '离散状态教学模型',
      inputs: [{id: 'delta', label: '每步增量', type: 'number', min: 1, max: 3, default: 1}],
      initialState: {amount: 0, phase: 0, history: []},
      views: [
        {id: 'amount', title: '当前累计值', kind: 'value', value: {state: 'amount'}},
        {id: 'phase', title: '当前步骤', kind: 'text', value: {op: 'concat', args: ['第', {state: 'phase'}, '步']}},
        {id: 'history', title: '累计轨迹', kind: 'bars', value: {state: 'history'}},
        {id: 'remaining', title: '剩余步骤', kind: 'value', value: {op: 'sub', args: [3, {state: 'phase'}]}},
      ],
      actions: [
        {id: 'prepare', label: '装载输入', description: '把输入装载到实验执行区', enabledWhen: {op: 'eq', args: [{state: 'phase'}, 0]},
          updates: [{target: 'phase', value: 1}], feedback: '输入已装载，可以逐步执行。'},
        {id: 'advance', label: '执行一步', description: '把输入增量加入累计值', enabledWhen: {op: 'and', args: [{op: 'gte', args: [{state: 'phase'}, 1]}, {op: 'lt', args: [{state: 'phase'}, 3]}]}, repeatWhile: {op: 'lt', args: [{state: 'phase'}, 3]},
        locals: [{id: 'nextAmount', value: {op: 'add', args: [{state: 'amount'}, {input: 'delta'}]}}],
        updates: [{target: 'amount', value: {local: 'nextAmount'}}, {target: 'phase', value: {op: 'add', args: [{state: 'phase'}, 1]}}, {target: 'history', value: {op: 'append', args: [{state: 'history'}, {local: 'nextAmount'}]}}],
        feedback: {op: 'concat', args: ['累计值更新为 ', {state: 'amount'}]}},
      ],
      stages: [
        {id: 'ready', title: '准备输入', when: {op: 'eq', args: [{state: 'phase'}, 0]}, explanation: '设置增量并观察初值。'},
        {id: 'prepared', title: '输入已装载', when: {op: 'eq', args: [{state: 'phase'}, 1]}, explanation: '确认输入后开始执行。'},
        {id: 'running', title: '观察中间态', when: {op: 'eq', args: [{state: 'phase'}, 2]}, explanation: '比较当前累计值与轨迹柱。'},
        {id: 'done', title: '核对结果', when: {op: 'eq', args: [{state: 'phase'}, 3]}, explanation: '两步完成后根据可见读数核对。'},
      ],
      questions: [{id: 'check-amount', prompt: '当前累计值是多少？', evidenceView: 'amount'}], coverage: [],
    });
    const tests = [1, 2, 3].map(delta => ({name: `增量${delta}`, inputs: {delta}, actions: [{id: 'prepare', count: 1}, {id: 'advance', count: 'untilDone' as const}], expect: [{value: {state: 'amount'}, equals: delta * 2}]}));
    expect(validateProcessPackage({scene, tests}, [], {minimumProductQuality: true}).status).toBe('deterministic-process-verified');

    const oneActionScene = parseProcessScene({...structuredClone(scene),
      actions: [{...scene.actions[1], enabledWhen: {op: 'lt', args: [{state: 'phase'}, 3]},
        repeatWhile: {op: 'lt', args: [{state: 'phase'}, 3]}}],
    });
    const oneActionTests = [1, 2, 3].map(delta => ({name: `三次执行${delta}`, inputs: {delta},
      actions: [{id: 'advance', count: 'untilDone' as const}],
      expect: [{value: {state: 'amount'}, equals: delta * 3}]}));
    expect(validateProcessPackage({scene: oneActionScene, tests: oneActionTests}, [], {minimumProductQuality: true}).status)
      .toBe('deterministic-process-verified');
    const fixedScene = parseProcessScene({...structuredClone(oneActionScene), inputs: [],
      actions: [{...oneActionScene.actions[0],
        locals: [{id: 'nextAmount', value: {op: 'add', args: [{state: 'amount'}, 1]}}]}],
    });
    const fixedTests = [1, 2, 3].map(steps => ({name: `固定过程第${steps}步`, inputs: {},
      actions: [{id: 'advance', count: steps}],
      expect: [{value: {state: 'amount'}, equals: steps}]}));
    expect(validateProcessPackage({scene: fixedScene, tests: fixedTests}, [], {minimumProductQuality: true}).status)
      .toBe('deterministic-process-verified');

    const guardScene = parseProcessScene({...structuredClone(scene),
      inputs: [...scene.inputs, {id: 'query', label: '待处理文本', type: 'text', default: 'A', maxLength: 8, ascii: true}],
      actions: scene.actions.map(action => action.id === 'prepare' ? {...action, enabledWhen: {op: 'and', args: [
        action.enabledWhen, {op: 'gt', args: [{op: 'length', args: [{input: 'query'}]}, 0]},
      ]}} : action),
      stages: [
        {id: 'inputGuard', title: '输入提示', when: {op: 'eq', args: [{op: 'length', args: [{input: 'query'}]}, 0]}, explanation: '请输入至少一个可打印字符。'},
        ...scene.stages.map(stage => stage.id === 'ready' ? {...stage, when: {op: 'and', args: [
          stage.when, {op: 'gt', args: [{op: 'length', args: [{input: 'query'}]}, 0]},
        ]}} : stage),
      ],
    });
    expect(validateProcessPackage({scene: guardScene, tests}, [], {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const executableGuard = structuredClone(guardScene);
    executableGuard.actions[0].enabledWhen = {op: 'eq', args: [{state: 'phase'}, 0]};
    expect(() => validateProcessPackage({scene: executableGuard, tests}, [], {minimumProductQuality: true}))
      .toThrow('inputGuard');
  });

  it('groups oversized pure text concatenation without changing operands, results, or validation limits', () => {
    const scene = fixture().scene;
    const args = Array.from({length: 37}, (_, i) => i % 3 === 0 ? null : i % 3 === 1 ? i : '字');
    const raw = {op: 'concat', args};
    const normalized = normalizeProcessExpressions(raw) as any;
    scene.actions[0].feedback = normalized;
    expect(createProcessEngine(scene).act('add').feedback).toBe(args.map(value => String(value ?? '')).join(''));
    expect(raw.args).toHaveLength(37);
    expect(normalized.args.length).toBeLessThanOrEqual(12);
    expect(normalizeProcessExpressions({op: 'unknown', args, unexpected: true})).toEqual({op: 'unknown', args, unexpected: true});
  });
  it('evaluates ordered local calculations once before committing an atomic step', () => {
    const pkg = fixture();
    pkg.scene.actions[0].locals = [{id: 'increment', value: {input: 'delta'}},
      {id: 'nextAmount', value: {op: 'add', args: [{state: 'amount'}, {op: 'mul', args: [{local: 'increment'}, 2]}]}}];
    pkg.scene.actions[0].updates[0].value = {local: 'nextAmount'};
    pkg.scene.actions[0].feedback = {op: 'concat', args: ['数量=', {state: 'amount'}, '，本步计算=', {local: 'nextAmount'}]};
    for (const test of pkg.tests) test.expect[0].equals *= 2;
    expect(validateProcessPackage(pkg).evidence).toHaveLength(2);
    const engine = createProcessEngine(pkg.scene), before = engine.getState();
    expect(engine.evaluateAction('add', {local: 'nextAmount'})).toBe(2);
    expect(engine.getState()).toEqual(before);
    expect(engine.act('add').feedback).toBe('数量=2，本步计算=2');
    expect(() => engine.evaluate({local: 'nextAmount'})).toThrow('未知局部量');
    engine.back(); expect(engine.getState()).toEqual(before);
  });
  it('rejects forward, duplicate, cyclic and out-of-scope local references', () => {
    const scene = fixture().scene;
    scene.actions[0].locals = [{id: 'a', value: {local: 'b'}}, {id: 'b', value: 1}];
    expect(() => parseProcessScene(scene)).toThrow('尚未计算');
    scene.actions[0].locals = [{id: 'a', value: 1}, {id: 'a', value: 2}];
    expect(() => parseProcessScene(scene)).toThrow('重复');
    scene.actions[0].locals = [{id: 'a', value: {local: 'a'}}];
    expect(() => parseProcessScene(scene)).toThrow('尚未计算');
    scene.actions[0].locals = [{id: 'a', value: 1}];
    scene.views[0].value = {local: 'a'};
    expect(() => parseProcessScene(scene)).toThrow('局部量');
    scene.views[0].value = {state: 'amount'};
    scene.actions[0].enabledWhen = {local: 'a'};
    expect(() => parseProcessScene(scene)).toThrow('局部量');
  });
  it('keeps the old state intact when a local expression fails and identifies the local field', () => {
    const scene = fixture().scene;
    scene.actions[0].locals = [{id: 'badDivision', value: {op: 'div', args: [1, 0]}}];
    const engine = createProcessEngine(scene), before = engine.getState();
    expect(() => engine.act('add')).toThrow('/actions/@add/locals/@badDivision/value');
    expect(engine.getState()).toEqual(before);
  });
  it('repairs a schema-invalid draft atomically without changing unrelated fields', () => {
    const pkg = fixture();
    const draft = structuredClone(pkg.scene) as any;
    draft.actions[0].feedback = {op: 'concat', args: Array.from({length: 13}, (_, i) => String(i))};
    expect(() => parseProcessScene(draft)).toThrow('concat');
    const repaired = applyProcessDraftRepair(draft, {baseHash: processRevisionHash(draft),
      patches: [{op: 'replace', path: '/actions/@add/feedback', expected: draft.actions[0].feedback,
        value: {op: 'concat', args: ['0123456789101112']}}], tests: pkg.tests});
    expect(validateProcessPackage({scene: repaired.draft, tests: repaired.tests}).evidence).toHaveLength(2);
    expect(repaired.draft.views).toEqual(draft.views);
    expect(draft.actions[0].feedback.args).toHaveLength(13);
    expect(() => applyProcessDraftRepair(draft, {baseHash: processRevisionHash(draft), patches: [
      {op: 'replace', path: '/title', expected: draft.title, value: '新标题'},
      {op: 'replace', path: '/summary', expected: 'wrong', value: '错误'},
    ], tests: pkg.tests})).toThrow('原值不匹配');
    expect(draft.title).toEqual(pkg.scene.title);
  });
  it('canonicalizes duplicate built-in controls before validating model repairs', () => {
    const pkg = fixture() as any;
    pkg.scene.actions.push(
      {id: 'pause', label: '暂停连续写入', description: '重复播放器暂停', enabledWhen: true, feedback: '暂停', updates: []},
      {id: 'undo', label: '撤销一步', description: '重复播放器撤销', enabledWhen: true, feedback: '撤销', updates: [{target: 'amount', value: 0}]},
      {id: 'reset', label: '重置过程', description: '重复播放器重置', enabledWhen: true, feedback: '重置', updates: [{target: 'amount', value: 0}]},
      {id: 'checkMemory', label: '核对内存', description: '重复问题核对', enabledWhen: true, feedback: '核对', updates: []},
      {id: 'undoVisit', label: '撤销上一步访问', description: '重复播放器撤销', enabledWhen: true, feedback: '撤销', updates: [{target: 'amount', value: 0}]},
    );
    pkg.scene.coverage = [{description: '运行时控件', inputs: [], actions: ['pause', 'undo', 'reset', 'checkMemory'], views: ['amount']}];
    pkg.tests[0].actions.push({id: 'pause', count: 1});
    const normalized = normalizeGeneratedRuntimeControls(pkg) as any;
    expect(normalized.scene.actions.map((action: any) => action.id)).toEqual(['add']);
    expect(normalized.scene.coverage[0].actions).toEqual([]);
    expect(normalized.tests[0].actions).toEqual([{id: 'add', count: 1}]);
    expect(pkg.scene.actions).toHaveLength(6);

    const domain = structuredClone(pkg);
    domain.scene.actions = [{id: 'reset', label: '复位断路器', description: '设备领域操作', enabledWhen: true,
      feedback: '断路器已复位', updates: [{target: 'done', value: true}]}];
    expect((normalizeGeneratedRuntimeControls(domain) as any).scene.actions).toHaveLength(1);
  });
  it('preserves authored pseudocode lines as a code panel while leaving data arrays unchanged', () => {
    const pkg = fixture() as any;
    pkg.scene.views.push({id: 'pseudo', title: '二分查找伪代码', kind: 'code',
      value: ['left = 0', '  mid = (left + right) // 2', 'right = mid - 1']});
    pkg.scene.views.push({id: 'values', title: '数据', kind: 'array', value: ['A', 'B']});
    const normalized = normalizeGeneratedRuntimeControls(pkg) as any;
    expect(normalized.scene.views[2].value).toBe('left = 0\n  mid = (left + right) // 2\nright = mid - 1');
    expect(normalized.scene.views[3].value).toEqual(['A', 'B']);
    expect(pkg.scene.views[2].value).toEqual(['left = 0', '  mid = (left + right) // 2', 'right = mid - 1']);
    expect(parseProcessScene(normalized.scene).views[2].kind).toBe('code');
  });
  it('converts clearly inclusive guarded array regions to the player exclusive end convention once', () => {
    const pkg = fixture() as any;
    const guard = {op: 'lte', args: [{state: 'left'}, {state: 'right'}]};
    pkg.scene.initialState = {...pkg.scene.initialState, cells: [3, 7, 11], left: 1, right: 1};
    pkg.scene.views.push({id: 'cells', title: '数组', kind: 'array', value: {state: 'cells'}, regions: [
      {label: '左侧已排除', start: {op: 'if', args: [true, 0, 0]},
        end: {op: 'if', args: [true, {op: 'sub', args: [{state: 'left'}, 1]}, 0]}},
      {label: '当前查找区间', start: {op: 'if', args: [guard, {state: 'left'}, 0]},
        end: {op: 'if', args: [guard, {state: 'right'}, 0]}},
    ]});
    const normalized = normalizeGeneratedRuntimeControls(pkg) as any;
    expect(normalizeGeneratedRuntimeControls(normalized)).toEqual(normalized);
    expect(normalized.scene.views[2].regions[0].end.args[1]).toEqual({op: 'add', args: [
      {op: 'sub', args: [{state: 'left'}, 1]}, 1]});
    expect(normalized.scene.views[2].regions[1].end.args[1]).toEqual({op: 'add', args: [{state: 'right'}, 1]});
    expect(pkg.scene.views[2].regions[1].end.args[1]).toEqual({state: 'right'});
    expect(validateProcessPackage(normalized).evidence).toHaveLength(2);
  });
  it('drops only a proven redundant initial-only test when three action tests remain', () => {
    const pkg = fixture() as any;
    pkg.tests.push({...structuredClone(pkg.tests[0]), name: '第三组执行'});
    pkg.tests.unshift({name: '初态检查', inputs: {}, actions: [], expect: [
      {value: {state: 'amount'}, equals: 0},
      {value: {op: 'not', args: [{state: 'done'}]}, equals: true},
    ]});
    const normalized = normalizeGeneratedRuntimeControls(pkg) as any;
    expect(normalized.tests).toHaveLength(3);
    expect(normalized.tests.every((test: any) => test.actions.length > 0)).toBe(true);
    expect(pkg.tests).toHaveLength(4);
    const contradictory = structuredClone(pkg);
    contradictory.tests[0].expect[0].equals = 9;
    expect((normalizeGeneratedRuntimeControls(contradictory) as any).tests).toHaveLength(4);
  });
  it('keeps real edge conditions when a repair emits common topology shorthand', () => {
    const pkg = fixture() as any;
    const activeWhen = {state: 'done'};
    pkg.scene.views.push({id: 'flow', title: '数量流向', kind: 'topology', stateDrivenTopology: true,
      nodes: [{id: 'source', label: '起点'}, {id: 'target', label: '终点'}],
      links: [{id: 'edge', from: 'source', to: 'target', activeWhen}]});
    const normalized = normalizeGeneratedRuntimeControls(pkg) as any;
    const view = parseProcessScene(normalized.scene).views[2];
    expect(view.topology?.labels).toEqual(['起点', '终点']);
    expect(view.topology?.edges).toEqual([{from: 0, to: 1, activeWhen}]);
    expect(view.value).toEqual({op: 'array', args: ['', '']});
    expect(pkg.scene.views[2].links[0].from).toBe('source');

    const flat = structuredClone(pkg) as any;
    flat.scene.views[2] = {id: 'flow', title: '数量流向', kind: 'topology',
      labels: ['起点', '终点'], edges: [{from: '起点', to: '终点', activeWhen}]};
    expect(parseProcessScene((normalizeGeneratedRuntimeControls(flat) as any).scene).views[2].topology?.edges[0])
      .toEqual({from: 0, to: 1, activeWhen});
    flat.scene.views[2].edges[0].to = '不存在';
    expect(() => parseProcessScene((normalizeGeneratedRuntimeControls(flat) as any).scene)).toThrow();
  });
  it('completes page-map frame nodes from the existing frame state', () => {
    const pkg = fixture() as any;
    pkg.scene.initialState.frames = [-1];
    pkg.scene.actions[0].updates.push({target: 'frames', value: [1]});
    pkg.scene.views.push({id: 'pageMap', title: '分页映射', kind: 'topology',
      value: {op: 'array', args: ['页0']},
      topology: {labels: ['页0', '页框A'], edges: [{from: 0, to: 1, activeWhen: {state: 'done'}}]}});
    const normalized = normalizeGeneratedRuntimeControls(pkg) as any;
    const scene = parseProcessScene(normalized.scene);
    const engine = createProcessEngine(scene);
    expect(engine.views().find(view => view.id === 'pageMap')?.value).toEqual(['页0', '空闲']);
    engine.act('add');
    expect(engine.views().find(view => view.id === 'pageMap')?.value).toEqual(['页0', '页1']);
    expect(pkg.scene.views[2].value.args).toHaveLength(1);
  });
  it('accepts the RFC array-end index when an automatic patch appends to an empty list', () => {
    const pkg = fixture() as any;
    pkg.scene.actions[0].locals = [];
    const repaired = applyProcessDraftRepair(pkg.scene, {
      baseHash: processRevisionHash(pkg.scene),
      patches: [{op: 'add', path: '/actions/@add/locals/0', value: {id: 'increment', value: {input: 'delta'}}}],
      tests: pkg.tests,
    }, undefined, {deriveExpected: true});
    expect(repaired.draft.actions[0].locals).toEqual([{id: 'increment', value: {input: 'delta'}}]);
  });
  it('uses a verified immutable hash for compact automatic repairs while keeping user revision old-value checks strict', () => {
    const pkg = fixture();
    const patch = {baseHash: processRevisionHash(pkg.scene), patches: [{op: 'replace', path: '/summary', value: '调整输入，比较数量'}], tests: pkg.tests};
    expect(() => applyProcessDraftRepair(pkg.scene, patch)).toThrow('原值不匹配');
    expect(applyProcessDraftRepair(pkg.scene, patch, undefined, {deriveExpected: true}).draft.summary).toBe('调整输入，比较数量');
    expect(() => applyProcessDraftRepair(pkg.scene, {...patch, baseHash: '0'.repeat(64)}, undefined, {deriveExpected: true})).toThrow('指纹不匹配');
    expect(() => applyProcessDraftRepair(pkg.scene, {...patch, patches: [{...patch.patches[0], expected: 'wrong'}]}, undefined, {deriveExpected: true})).toThrow('原值不匹配');
  });
  it('retries only the invalid behavior step and resumes completed stages after a provider outage', async () => {
    const pkg = fixture(), saved = new Map<string, unknown>();
    const state = {read: (key: string) => saved.get(key), write: async (key: string, value: unknown) => {saved.set(key, value);}};
    const {inputs, initialState, actions, schemaVersion: _version, ...presentation} = pkg.scene;
    const invalid = structuredClone(actions) as any;
    invalid[0].feedback = {state: 'missingState'};
    const aiCall = vi.fn().mockResolvedValueOnce(JSON.stringify({inputs, initialState}))
      .mockResolvedValueOnce(JSON.stringify({actions: invalid})).mockResolvedValueOnce(JSON.stringify({actions}))
      .mockRejectedValueOnce(Error('provider outage'));
    const options = {request: {title: '计数'}, system: 'process', testSystem: 'tests', aiCall, state};
    await expect(generateStagedProcessPackage(options)).rejects.toThrow('provider outage');
    aiCall.mockResolvedValueOnce(JSON.stringify(presentation)).mockResolvedValueOnce(JSON.stringify({tests: pkg.tests}));
    expect(await generateStagedProcessPackage(options)).toEqual(pkg);
    expect(aiCall).toHaveBeenCalledTimes(6);
    expect(JSON.parse(aiCall.mock.calls[2][1]).repair.failures[0].issues.join(' ')).toContain('未知状态');
  });
  it('executes distinct inputs and keeps strict integer indexing', () => {
    const pkg = fixture();
    expect(validateProcessPackage(pkg).evidence).toHaveLength(2);
    const engine = createProcessEngine(pkg.scene);
    expect(engine.evaluate({op: 'at', args: [[10, 20, 30], {op: 'floor', args: [{op: 'div', args: [3, 2]}]}]})).toBe(20);
    expect(() => engine.evaluate({op: 'at', args: [[10, 20, 30], 1.5]})).toThrow('索引');
  });
  it('computes dynamic marked indices without fixed-size unrolling or invalid placeholders', () => {
    const engine = createProcessEngine(fixture().scene);
    expect(engine.evaluate({op: 'indicesOf', args: [[0, 1, 0, 1], 1]})).toEqual([1, 3]);
    expect(engine.evaluate({op: 'indicesOf', args: [[0, 0], 1]})).toEqual([]);
    expect(engine.evaluate({op: 'concatArrays', args: [{op: 'range', args: [0, 2]}, {op: 'range', args: [5, 8]}]})).toEqual([0, 1, 5, 6, 7]);
    expect(engine.evaluate({op: 'range', args: [3, 3]})).toEqual([]);
    expect(() => engine.evaluate({op: 'range', args: [0, 129]})).toThrow('最多128');
    expect(() => engine.evaluate({op: 'range', args: [2, 1]})).toThrow('整数范围');
    expect(() => engine.evaluate({op: 'concatArrays', args: [Array(100).fill(0), Array(29).fill(1)]})).toThrow('模拟容量');
  });
  it('allows comparison markers for a peer array to exceed a shorter current view and clips them at render time', () => {
    const pkg = fixture() as any;
    pkg.scene.initialState.items = [];
    pkg.scene.views[0] = {id: 'amount', title: '当前项目', kind: 'array', value: {state: 'items'}, markedIndices: [0]};
    pkg.scene.actions[0].updates.push({target: 'items', value: {op: 'array', args: [{input: 'delta'}]}});
    expect(validateProcessPackage(pkg).evidence).toHaveLength(2);
    pkg.scene.views[0].markedIndices = [128];
    expect(() => validateProcessPackage(pkg)).toThrow('0–127');
  });
  it('counts real bit differences across byte arrays without expanded expressions', () => {
    const engine = createProcessEngine(fixture().scene);
    expect(engine.evaluate({op: 'bitDifference', args: [[0x00, 0xff, 0x55], [0x01, 0x0f, 0xaa]]})).toBe(13);
    expect(() => engine.evaluate({op: 'bitDifference', args: [[0], [0, 1]]})).toThrow('等长');
    expect(() => engine.evaluate({op: 'bitDifference', args: [[256], [0]]})).toThrow('字节数组');
  });
  it.each([['floor', -1.2, -2], ['ceil', -1.2, -1], ['round', -1.5, -1], ['abs', -3, 3]])('supports %s with defined finite-number semantics', (op, input, output) => {
    const engine = createProcessEngine(fixture().scene);
    expect(engine.evaluate({op: String(op), args: [input]})).toBe(output);
    expect(() => engine.evaluate({op: String(op), args: ['invalid']})).toThrow('有限数值');
  });
  it('formats arrays explicitly, computes stepped ranges and locates feedback failures atomically', () => {
    const pkg = fixture(), engine = createProcessEngine(pkg.scene);
    expect(engine.evaluate({op: 'range', args: [1, 8, 2]})).toEqual([1, 3, 5, 7]);
    expect(() => engine.evaluate({op: 'range', args: [0, 8, 0]})).toThrow('步长');
    expect(engine.evaluate({op: 'join', args: [[1, null, false], ' / ']})).toBe('1 /  / false');
    pkg.scene.actions[0].feedback = {op: 'concat', args: [[1, 2]]};
    const broken = createProcessEngine(pkg.scene), before = broken.getState();
    expect(() => broken.act('add')).toThrow('/actions/@add/feedback');
    expect(broken.getState()).toEqual(before);
  });
  it('reports the failing expression path and actual state instead of a bare bounds error', () => {
    const pkg = fixture();
    pkg.scene.views[0].value = {op: 'at', args: [[1, 2], 4]};
    expect(() => validateProcessPackage(pkg)).toThrow('/views/@amount/value');
    expect(() => validateProcessPackage(pkg)).toThrow('执行状态=');
  });
  it('provides actual values for incorrect expected results', () => {
    const pkg = fixture(); pkg.tests[0].expect[0].equals = 99;
    expect(() => validateProcessPackage(pkg)).toThrow('"actual":1');
  });
  it('repairs incorrect test expectations in an independent test step while preserving the scene', async () => {
    const pkg = fixture(), invalid = structuredClone(pkg);
    invalid.tests[0].expect[0].equals = 99;
    const aiCall = vi.fn(async (system: string, user: string) => {
      const data = JSON.parse(user);
      if (data.actualTests) {
        expect(data.scene).toEqual(pkg.scene);
        throw Error('verified: reached independent review');
      }
      if (data.previousTests) {
        expect(system).toContain('本轮仅修独立测试');
        expect(data.correction).toContain('"actual":1');
        return JSON.stringify({tests: pkg.tests});
      }
      return JSON.stringify(invalid);
    });
    await expect(generateProcessExplainer({type: 'simulation', title: '计数'}, 1, aiCall)).rejects.toThrow('verified: reached');
    expect(aiCall).toHaveBeenCalledTimes(3);
  });
  it('repairs only the incorrect calculation instead of regenerating the valid scene', async () => {
    const pkg = fixture();
    pkg.scene.actions[0].updates[0].value = {op: 'div', args: [{input: 'delta'}, 0]};
    const aiCall = vi.fn(async (_system: string, user: string) => {
      const request = JSON.parse(user);
      if (request.actualTests) throw Error('verified: stop before model review');
      if (request.revision) {
        expect(request.correction).toContain('/actions/@add/updates/0/value');
        expect(request.revision.scene).toEqual(pkg.scene);
        return JSON.stringify({baseHash: processRevisionHash(pkg.scene), patches: [{op: 'replace', path: '/actions/@add/updates/0/value',
          value: {input: 'delta'}}]});
      }
      return JSON.stringify(pkg);
    });
    await expect(generateProcessExplainer({type: 'simulation', title: '计数'}, 1, aiCall)).rejects.toThrow('verified: stop');
    expect(aiCall).toHaveBeenCalledTimes(3);
  });
  it('persists the bounded validation limit across delivery retries', async () => {
    const values = new Map<string, unknown>();
    const state = {
      read: (name: string) => values.get(name),
      write: async (name: string, value: unknown) => { values.set(name, structuredClone(value)); },
    };
    const aiCall = vi.fn(async () => JSON.stringify({ invalid: true }));
    const input = { type: 'simulation' as const, title: '持久化修复上限' };
    await expect(generateProcessExplainer(input, 1, aiCall, undefined, { state })).rejects.toThrow('6次有界校验');
    expect(aiCall).toHaveBeenCalledTimes(6);
    await expect(generateProcessExplainer(input, 1, aiCall, undefined, { state })).rejects.toThrow('6次有界校验');
    expect(aiCall).toHaveBeenCalledTimes(6);
  });
  it('closes the final listed review issues without opening another full review cycle', async () => {
    const pkg = fixture();
    pkg.scene.coverage = [{description: '锁定教师交互要求', inputs: ['delta'], actions: ['add'], views: ['amount']}];
    let repairNumber = 0;
    let closureNumber = 0;
    const aiCall = vi.fn(async (_system: string, user: string) => {
      const data = JSON.parse(user);
      if (data.residualIssues && data.actualTests) {
        return JSON.stringify({
          type: 'process-residual-review',
          resolved: true,
          checks: data.residualIssues.map((issue: string) => ({issue, resolved: true, evidence: 'summary 已明确写出输入、动作和可见结果'})),
          unresolved: [],
        });
      }
      if (data.residualIssues && data.revision) {
        closureNumber += 1;
        if (closureNumber === 1) return '{"baseHash":"incomplete","patches":[';
        expect(data.formatIssue).toMatch(/(?:INCOMPLETE|TRUNCATED)_STRUCTURE/);
        return JSON.stringify({
          baseHash: processRevisionHash(data.revision.scene),
          patches: [
            {op: 'replace', path: '/summary', value: '改变增量并按“增加”，比较当前数量的不同结果'},
            {op: 'replace', path: '/coverage/0/description', value: '不能让自动修复改写的来源要求'},
            {op: 'replace', path: '/views/0/id', value: 'renamed-amount'},
          ],
        });
      }
      if (data.actualTests) {
        return JSON.stringify({
          faithful: false,
          scientificallySound: true,
          causalInteraction: true,
          issues: ['summary需要明确输入、动作和可见结果；不要拆成两个审查项'],
          languageReview: {
            version: 'plain-teaching-v1',
            checks: data.learnerTextUnits.map((unit: {id:string}) => ({
              unitId: unit.id, direct: true, concrete: true, termsExplained: true, natural: true, faithful: true,
            })),
            issues: [],
          },
        });
      }
      if (data.revision) {
        repairNumber += 1;
        return JSON.stringify({
          baseHash: processRevisionHash(data.revision.scene),
          patches: [{op: 'replace', path: '/summary', value: `第${repairNumber}轮说明仍待最终收束`}],
        });
      }
      return JSON.stringify(pkg);
    });
    const artifact = await generateProcessExplainer({type: 'simulation', title: '计数'}, 1, aiCall);
    expect(artifact.content).toMatchObject({
      renderingMode: 'process-v1',
      processScene: {summary: '改变增量并按“增加”，比较当前数量的不同结果'},
      processValidation: {
        review: {faithful: true, scientificallySound: true, causalInteraction: true, issues: []},
        residualClosure: {mode: 'residual-closure', residualIssues: ['summary需要明确输入、动作和可见结果；不要拆成两个审查项']},
      },
    });
    expect((artifact.content as any).processScene.coverage[0].description).toBe('锁定教师交互要求');
    expect((artifact.content as any).processScene.views[0].id).toBe('amount');
    expect(repairNumber).toBe(5);
    expect(closureNumber).toBe(2);
    expect(aiCall).toHaveBeenCalledTimes(15);
  });
});

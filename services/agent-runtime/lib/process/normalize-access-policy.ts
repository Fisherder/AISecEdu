import type { ProcessPackage, ProcessScene } from './schema';
import { createProcessEngine } from '@/lib/server/process-quality';

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

type PolicySurface = {initialState?: Record<string, unknown>;
  actions?: Array<{id?: string; description?: string;
    repeatWhile?:unknown;
    locals?: Array<{id?: string; value?: unknown}>;
    updates?: Array<{target?: string; value?: unknown}>}>;
  views?: Array<{id?: string; kind?: string; value?: unknown; activeIndex?: unknown}>;
  stages?: Array<{id?: string; explanation?: string}>;
  inputs?: Array<{id?: string}>;
  questions?: Array<{id?: string; prompt?: string; evidenceView?: string}>;
  modelNote?: string};

function verifiedPolicyCursor(source: PolicySurface) {
  const state = source.initialState;
  if (!state || state.currentIndex !== -1 || state.finished !== false ||
      !Array.isArray(source.actions) || !Array.isArray(source.views) ||
      !Number.isInteger(state.ruleCount) ||
      !['ruleSubjects','ruleResources','ruleActions','ruleEffects'].every(key =>
        Array.isArray(state[key]) && (state[key] as unknown[]).length === state.ruleCount)) return false;
  return source.actions.some(action => {
    const update = (target: string) => action.updates?.find(item => item.target === target)?.value;
    const cursor = update('currentIndex') as {op?: unknown; args?: unknown[]} | undefined;
    if (cursor?.op !== 'if' || cursor.args?.length !== 3 ||
        !same(cursor.args[2], {op:'add',args:[{state:'currentIndex'},1]})) return false;
    const stop = cursor.args[0] as {local?: unknown} | undefined;
    const index = cursor.args[1] as {local?: unknown} | undefined;
    return typeof stop?.local === 'string' && typeof index?.local === 'string' &&
      same(update('finished'), {local:stop.local}) &&
      action.locals?.some(local => local.id === index.local &&
        same(local.value,{state:'currentIndex'}));
  });
}

/** A first-match policy cursor points to the next rule after a miss, but
 * remains on the last rule after a hit or exhaustion. Only this verified
 * cursor contract permits correcting a generated progress label locally. */
export function normalizeAccessPolicyProgress(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as PolicySurface;
  if (!verifiedPolicyCursor(source)) return value;
  const progress = source.views!.find(view => view.id === 'progress' && view.kind === 'value');
  const expression = JSON.stringify(progress?.value ?? null);
  if (!progress || !expression.includes('正在核对第') ||
      !expression.includes('已核对') || !expression.includes('"state":"currentIndex"') ||
      !expression.includes('"state":"finished"')) return value;
  const revised = structuredClone(source);
  const view = revised.views!.find(item => item.id === 'progress')!;
  const index = {state:'currentIndex'};
  const oneBased = {op:'add',args:[index,1]};
  view.value = {op:'if',args:[
    {op:'eq',args:[{state:'stage'},'idle']}, '未开始匹配',
    {op:'if',args:[{state:'finished'},
      {op:'concat',args:['匹配结束：已核对 ',oneBased,' 条规则']},
      {op:'if',args:[{op:'eq',args:[{state:'stage'},'ready']},
        '策略已装载，尚未核对规则；下一条是第 1 条',
        {op:'concat',args:['已核对 ',index,' 条规则；下一条是第 ',oneBased,' 条']},
      ]},
    ]},
  ]};
  return revised;
}

/** Keep provisional decisions hidden until the rule scan finishes. The
 * domain state and tests remain untouched; only grounded display strings and
 * the pointer to the just-checked rule are corrected. */
export function normalizeAccessPolicyResultSurfaces(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as PolicySurface;
  if (!verifiedPolicyCursor(source)) return value;
  const result = source.views!.find(view => view.id === 'authorizationResult' && view.kind === 'value');
  const board = source.views!.find(view => view.id === 'ruleBoard' && view.kind === 'array');
  if (!result || !board || !JSON.stringify(result.value).includes('"state":"decision"') ||
      !JSON.stringify(result.value).includes('"state":"matchedIndex"') ||
      !JSON.stringify(board.activeIndex).includes('"state":"currentIndex"')) return value;
  const revised = structuredClone(source);
  const output = revised.views!.find(view => view.id === 'authorizationResult')!;
  const previous = output.value as {op?: unknown; args?: unknown[]} | undefined;
  if (previous?.op === 'if' && Array.isArray(previous.args) && previous.args.length === 3 &&
      !JSON.stringify(previous.args[0]).includes('"state":"finished"')) {
    const terminal = previous.args[2] as {op?: unknown; args?: unknown[]} | undefined;
    const noMatch = terminal?.args?.[1] as {op?: unknown; args?: unknown[]} | undefined;
    if (terminal?.op === 'if' && noMatch?.op === 'concat' && Array.isArray(noMatch.args)) {
      const index = noMatch.args.findIndex(part =>
        typeof part === 'string' && part.includes('全部未命中') && !part.includes('命中规则数'));
      if (index >= 0) noMatch.args[index] = (noMatch.args[index] as string)
        .replace('全部未命中，', '全部未命中，命中规则数：0；');
    }
    output.value = {op:'if',args:[{state:'finished'},previous,'判定尚未完成']};
  }
  const ruleBoard = revised.views!.find(view => view.id === 'ruleBoard')!;
  const marker = JSON.stringify(ruleBoard.activeIndex);
  if (!marker.includes('"matching"'))
    ruleBoard.activeIndex = {op:'if',args:[
      {op:'eq',args:[{state:'stage'},'matching']},
      {op:'sub',args:[{state:'currentIndex'},1]}, ruleBoard.activeIndex,
    ]};
  const load = revised.actions?.find(action => action.id === 'loadPolicy');
  if (load?.description?.includes('逐条核对一遍') &&
      load.updates?.some(update => update.target === 'stage' && update.value === 'ready'))
    load.description = load.description.replace(/把\s*\d+\s*条规则按主体逐条核对一遍，进入可逐条匹配的就绪状态。/,
      `准备好 ${source.initialState!.ruleCount} 条规则表，等待从第 1 条开始逐条匹配。`);
  const decided = revised.stages?.find(stage => stage.id === 'decided');
  if (decided?.explanation?.includes('命中的那一条在规则表里带底色标出。'))
    decided.explanation = decided.explanation.replace('命中的那一条在规则表里带底色标出。',
      '命中的那一条在规则表里同时带橙框和底色。');
  return revised;
}

/** Fix factual copy that contradicts a variable request or the exact-answer
 * verifier. All changes are gated on the six-column stepwise policy scene. */
export function normalizeStepwisePolicyCopy(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source=value as PolicySurface;
  const state=source.initialState;
  if (!state || state.currentIndex!==-1 || !Array.isArray(source.actions) ||
      !Array.isArray(source.views) || !Array.isArray(source.inputs) ||
      !Array.isArray(source.questions) ||
      !['ruleSubjects','ruleResources','ruleActions','ruleDecisions'].every(key=>
        Array.isArray(state[key]) && (state[key] as unknown[]).length===
          (state.ruleSubjects as unknown[])?.length) ||
      !['subjectRole','resourceLevel','requestAction'].every(id=>source.inputs!.some(input=>input.id===id)) ||
      !source.actions.some(action=>action.id==='matchNextRule' &&
        action.updates?.some(update=>update.target==='matchedRuleIndex')))return value;
  const revised=structuredClone(source);
  const load=revised.actions!.find(action=>action.id==='loadPolicy');
  const feedback=load && (load as {feedback?:unknown}).feedback as
    {op?:unknown;args?:unknown[]} | undefined;
  if(feedback?.op==='concat' && Array.isArray(feedback.args) &&
      same(feedback.args[1],{input:'subjectRole'}) && feedback.args[2]==='读取' &&
      same(feedback.args[3],{input:'resourceLevel'}))
    feedback.args[2]={input:'requestAction'};
  if(load?.description?.includes('动作位次信息加载到判定轨迹中') &&
      load.updates?.some(update=>update.target==='currentIndex' && update.value===0) &&
      load.updates?.some(update=>update.target==='decisionTrace' && same(update.value,[])))
    load.description='准备本次请求的主体、资源级别和动作，并把匹配起点重置到第 1 条规则。装载不会开始逐条匹配。';
  const match=revised.actions!.find(action=>action.id==='matchNextRule');
  if(match?.description?.includes('六条都未命中则进入未命中阶段'))
    match.description=match.description.replace('六条都未命中则进入未命中阶段',
      '只有最后一条也未命中时，才进入未命中阶段');
  if(revised.views!.some(view=>view.id==='matchedRuleView' &&
      JSON.stringify(view.value).includes('无命中规则（按默认策略拒绝）'))){
    const question=revised.questions!.find(item=>item.evidenceView==='matchedRuleView' &&
      item.prompt?.includes('填写“无”'));
    if(question)question.prompt='当前“命中规则”面板显示什么？请填写面板中的完整内容。';
  }
  if(typeof revised.modelNote==='string' && revised.modelNote.includes('命中第一条匹配规则后停止') &&
      !revised.modelNote.includes('命中规则的结果可能'))
    revised.modelNote += '命中规则的结果可能是允许，也可能是拒绝。';
  return revised;
}

/** Repair a rule scan that marks exhaustion finished before its separate
 * finalization action can run. The indexed trace append is already valid. The
 * exact state/action contract must be present; other policies are untouched. */
export function normalizeSingularPolicyFinalization(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source=value as PolicySurface;
  const state=source.initialState;
  if (!state || !Array.isArray(state.trace) || state.trace.length!==0 ||
      !Array.isArray(source.actions) || !Array.isArray(source.views) ||
      !['ruleSubject','ruleResource','ruleAction','ruleAllow'].every(key=>
        Array.isArray(state[key]) && (state[key] as unknown[]).length===state.ruleCount) ||
      !source.views.some(view=>view.id==='traceView' && view.kind==='array'))return value;
  const load=source.actions.find(action=>action.id==='loadPolicy');
  const match=source.actions.find(action=>action.id==='matchNextRule');
  const finalize=source.actions.find(action=>action.id==='finalizeDecision');
  const local=(id:string)=>match?.locals?.find(item=>item.id===id)?.value;
  const update=(target:string)=>match?.updates?.find(item=>item.target===target)?.value;
  const traceUpdate=match?.updates?.find(item=>item.target==='trace') as
    {index?:unknown} | undefined;
  const trace=update('trace') as {op?:unknown;args?:unknown[]} | undefined;
  const output=update('realOutput') as {op?:unknown;args?:unknown[]} | undefined;
  if(!load || !match || !finalize || trace?.op!=='concat' ||
      !same(traceUpdate?.index,{op:'length',args:[{state:'trace'}]}) ||
      output?.op!=='if' || !Array.isArray(output.args) || output.args.length!==3 ||
      !same(local('hitNow'),{op:'and',args:[{local:'subOk'},{local:'resOk'},{local:'actOk'}]}) ||
      !same(local('subOk'),{op:'eq',args:[{local:'rSubject'},{input:'subject'}]}) ||
      !same(local('resOk'),{op:'eq',args:[{local:'rResource'},{input:'resource'}]}) ||
      !same(local('actOk'),{op:'eq',args:[{local:'rAction'},{input:'action'}]}) ||
      !same(local('nextTerminated'),{op:'if',args:[{local:'hitNow'},1,
        {op:'if',args:[{local:'exhaustedStop'},1,0]}]}) ||
      !same(update('terminated'),{local:'nextTerminated'}) ||
      !same(output.args[2],{op:'if',args:[{local:'exhaustedStop'},'拒绝','待判定']}) ||
      !load.updates?.some(item=>item.target==='trace' && same(item.value,[])) ||
      !load.updates?.some(item=>item.target==='policyLoaded' && item.value===1) ||
      !JSON.stringify(finalize).includes('"state":"terminated"') ||
      !JSON.stringify(finalize).includes('"state":"currentIndex"') ||
      !finalize.updates?.some(item=>item.target==='trace' &&
        (item as {index?:unknown}).index!==undefined))return value;
  const revised=structuredClone(source);
  const revisedMatch=revised.actions!.find(action=>action.id==='matchNextRule')!;
  revisedMatch.locals!.find(item=>item.id==='nextTerminated')!.value=
    {op:'if',args:[{local:'hitNow'},1,0]};
  const revisedOutput=revisedMatch.updates!.find(item=>item.target==='realOutput')!.value as
    {args:unknown[]};
  revisedOutput.args[2]='待判定';
  return revised;
}

/** Verify all selectable requests against the fixed rule table before a
 * failing test assertion can be sent to the tests-only author. */
export function verifySingularPolicyFirstMatch(scene: ProcessScene): boolean {
  const state=scene.initialState as Record<string,unknown>;
  const subjects=state.ruleSubject,resources=state.ruleResource;
  const actions=state.ruleAction,allow=state.ruleAllow;
  if(!Array.isArray(subjects)||!Array.isArray(resources)||!Array.isArray(actions)||
      !Array.isArray(allow)||subjects.length<2||subjects.length>128||
      [resources,actions,allow].some(column=>column.length!==subjects.length)||
      !allow.every(item=>item===0||item===1))return false;
  const ids=['subject','resource','action'] as const;
  const values=ids.map(id=>scene.inputs.find(input=>input.id===id)?.options?.map(option=>option.value));
  if(values.some(list=>!Array.isArray(list)||!list.length||list.length>12)||
      values.reduce((count,list)=>count*(list?.length??0),1)>128)return false;
  try{
    for(const subject of values[0]!)for(const resource of values[1]!)for(const action of values[2]!){
      const request={subject,resource,action};
      const first=subjects.findIndex((entry,index)=>entry===subject &&
        resources[index]===resource && actions[index]===action);
      const engine=createProcessEngine(scene);
      engine.reset(request);
      if(!engine.can('loadPolicy'))return false;
      engine.act('loadPolicy');
      for(let index=0;index<(first>=0?first+1:subjects.length);index++){
        if(!engine.can('matchNextRule'))return false;
        engine.act('matchNextRule');
        const current=engine.getState().state as Record<string,unknown>;
        const hit=index===first;
        if(current.currentIndex!==index+1 || current.matchedIndex!==(hit?index:-1) ||
            current.terminated!==(hit?1:0) ||
            current.realOutput!==(hit?(allow[index]===1?'允许':'拒绝'):'待判定') ||
            !Array.isArray(current.trace)||current.trace.length!==index+1 ||
            !same(current.ruleSubject,subjects)||!same(current.ruleResource,resources)||
            !same(current.ruleAction,actions)||!same(current.ruleAllow,allow))return false;
      }
      if(engine.can('matchNextRule'))return false;
      if(first<0){
        if(!engine.can('finalizeDecision'))return false;
        engine.act('finalizeDecision');
        const final=engine.getState().state as Record<string,unknown>;
        if(final.terminated!==1||final.realOutput!=='拒绝'||
            !Array.isArray(final.trace)||final.trace.length!==subjects.length+1)return false;
      }else if(engine.can('finalizeDecision'))return false;
    }
    return true;
  }catch{return false;}
}

/** The rule table is the oracle, not the model's prose or assertions. Once
 * every selectable request has passed that oracle, replace a contradictory
 * test draft with bounded scenarios that exercise each reachable first match
 * and the separate default-deny action. This never changes the lesson scene. */
export function reconcileVerifiedSingularPolicyTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray((value as {tests?:unknown}).tests)) return value;
  const state=scene.initialState as Record<string,unknown>;
  const subjects=state.ruleSubject,resources=state.ruleResource;
  const actions=state.ruleAction,allow=state.ruleAllow;
  if (!Array.isArray(subjects)||!Array.isArray(resources)||!Array.isArray(actions)||
      !Array.isArray(allow)||subjects.length<2||subjects.length>6||
      !verifySingularPolicyFirstMatch(scene)) return value;
  const options=['subject','resource','action'].map(id=>
    scene.inputs.find(input=>input.id===id)?.options?.map(option=>option.value) ?? []);
  if (options.some(column=>!column.every(item=>typeof item==='string'))) return value;
  const isSelectable=(subject:unknown,resource:unknown,action:unknown)=>
    options[0].includes(subject as string)&&options[1].includes(resource as string)&&
    options[2].includes(action as string);
  if (!subjects.every((subject,index)=>isSelectable(subject,resources[index],actions[index])))
    return value;
  const missed=options[0].flatMap(subject=>options[1].flatMap(resource=>
    options[2].map(action=>({subject,resource,action}))))
    .find(input=>!subjects.some((subject,index)=>subject===input.subject&&
      resources[index]===input.resource&&actions[index]===input.action));
  if (!missed) return value;
  const tests:ProcessPackage['tests']=[];
  const seen=new Set<string>();
  for(let index=0;index<subjects.length;index++){
    const input={subject:subjects[index] as string,resource:resources[index] as string,
      action:actions[index] as string};
    const key=JSON.stringify(input);
    if(seen.has(key))continue;
    seen.add(key);
    const result=allow[index]===1?'允许':'拒绝';
    tests.push({name:`第 ${index+1} 条规则命中：${input.subject}/${input.resource}/${input.action} → ${result}`,
      inputs:input,actions:[{id:'loadPolicy',count:1},{id:'matchNextRule',count:index+1}],
      expect:[
        {value:{state:'policyLoaded'},equals:1},
        {value:{state:'currentIndex'},equals:index+1},
        {value:{state:'matchedIndex'},equals:index},
        {value:{state:'hitRule'},equals:1},
        {value:{state:'terminated'},equals:1},
        {value:{state:'realOutput'},equals:result},
        {value:{op:'length',args:[{state:'trace'}]},equals:index+1},
      ]});
  }
  tests.push({name:'全部规则未命中：等待最终判定',inputs:missed,
    actions:[{id:'loadPolicy',count:1},{id:'matchNextRule',count:subjects.length}],
    expect:[
      {value:{state:'currentIndex'},equals:subjects.length},
      {value:{state:'matchedIndex'},equals:-1},
      {value:{state:'terminated'},equals:0},
      {value:{state:'realOutput'},equals:'待判定'},
      {value:{op:'length',args:[{state:'trace'}]},equals:subjects.length},
    ]});
  tests.push({name:'全部规则未命中：最终默认拒绝',inputs:missed,
    actions:[{id:'loadPolicy',count:1},{id:'matchNextRule',count:subjects.length},
      {id:'finalizeDecision',count:1}],
    expect:[
      {value:{state:'currentIndex'},equals:subjects.length},
      {value:{state:'matchedIndex'},equals:-1},
      {value:{state:'terminated'},equals:1},
      {value:{state:'realOutput'},equals:'拒绝'},
      {value:{op:'length',args:[{state:'trace'}]},equals:subjects.length+1},
    ]});
  if (tests.length>8) return value;
  const current=(value as {tests:unknown}).tests;
  return same(current,tests)?value:{...(value as Record<string,unknown>),tests};
}

/** Advance the cursor for every checked rule and settle a default denial on
 * the last miss. The original draft needed an extra click after the final
 * rule and reused the loading explanation during intermediate misses. */
export function normalizePluralPolicyCursor(value:unknown):unknown {
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const source=value as PolicySurface;
  const state=source.initialState;
  if(!state||state.matchIndex!==-1||state.matchedRule!==-1||state.done!==false||
      state.decision!=='pending'||!Array.isArray(source.actions)||
      !Number.isInteger(state.ruleCount)||
      !['ruleSubjects','ruleResources','ruleActions','ruleEffects'].every(key=>
        Array.isArray(state[key])&&(state[key] as unknown[]).length===state.ruleCount))return value;
  const match=source.actions.find(action=>action.id==='matchNextRule');
  const local=(id:string)=>match?.locals?.find(item=>item.id===id)?.value;
  const cursor=match?.updates?.find(item=>item.target==='matchIndex');
  const oldCursor={op:'if',args:[{local:'finalDone'},{state:'matchIndex'},{local:'startIndex'}]};
  const priorCursor={op:'if',args:[{local:'noMoreRules'},{state:'matchIndex'},{local:'startIndex'}]};
  if(!match?.repeatWhile||!cursor||
      !same(local('startIndex'),{op:'add',args:[{state:'matchIndex'},1]})||
      !same(local('finalDone'),{op:'or',args:[{local:'allFit'},{local:'noMoreRules'}]})||
      !same(local('noMoreRules'),{op:'not',args:[{local:'hasMore'}]})||
      !(same(cursor.value,oldCursor)||same(cursor.value,priorCursor))||
      !match.updates?.some(item=>item.target==='matchedRule'&&
        same(item.value,{op:'if',args:[{local:'allFit'},{local:'startIndex'},{state:'matchedRule'}]}))||
      !match.updates?.some(item=>item.target==='done'&&same(item.value,{local:'finalDone'})))return value;
  const revised=structuredClone(source);
  const revisedMatch=revised.actions!.find(action=>action.id==='matchNextRule')!;
  revisedMatch.locals!.find(item=>item.id==='noMoreRules')!.value={op:'and',args:[
    {local:'hasMore'},
    {op:'eq',args:[{local:'startIndex'},
      {op:'sub',args:[{state:'ruleCount'},1]}]},
    {op:'not',args:[{local:'allFit'}]},
  ]};
  revisedMatch.updates!.find(item=>item.target==='matchIndex')!.value={local:'startIndex'};
  const reason=revisedMatch.updates!.find(item=>item.target==='reason')?.value as
    {op?:unknown;args?:unknown[]} | undefined;
  const reasonOnMiss=reason?.args?.[2] as {op?:unknown;args?:unknown[]} | undefined;
  if(reason?.op==='if'&&reasonOnMiss?.op==='if'&&
      same(reasonOnMiss.args?.[2],{state:'reason'}))
    reasonOnMiss.args![2]={local:'scanLine'};
  const scan=revisedMatch.locals!.find(item=>item.id==='scanLine')?.value;
  const scanText=JSON.stringify(scan);
  if(scanText?.includes('条件不满足，继续下一条')){
    const walk=(node:unknown):unknown=>{
      if(Array.isArray(node))return node.map(walk);
      if(node==='条件不满足，继续下一条')return {op:'if',args:[
        {local:'noMoreRules'},'条件不满足，已检查全部规则','条件不满足，继续下一条']};
      if(!node||typeof node!=='object')return node;
      return Object.fromEntries(Object.entries(node).map(([key,part])=>[key,walk(part)]));
    };
    revisedMatch.locals!.find(item=>item.id==='scanLine')!.value=walk(scan);
  }
  const ruleTable=revised.views?.find(view=>view.kind==='array'&&view.id==='ruleTable'&&
    same(view.activeIndex,{state:'matchIndex'})) as {title?:string}|undefined;
  if(ruleTable?.title&&!ruleTable.title.includes('未开始时无高亮'))
    ruleTable.title+='（未开始时无高亮）';
  return revised;
}

/** Verify every selectable input combination against the fixed four-column
 * first-match table before using that table to repair internal test cases. */
export function verifyPluralPolicyFirstMatch(scene:ProcessScene):boolean {
  const state=scene.initialState as Record<string,unknown>;
  const subjects=state.ruleSubjects,resources=state.ruleResources;
  const actions=state.ruleActions,effects=state.ruleEffects;
  if(!Array.isArray(subjects)||!Array.isArray(resources)||!Array.isArray(actions)||
      !Array.isArray(effects)||subjects.length<2||subjects.length>6||
      [resources,actions,effects].some(column=>column.length!==subjects.length)||
      !effects.every(item=>item==='allow'||item==='deny'))return false;
  const options=['subject','resource','action'].map(id=>
    scene.inputs.find(input=>input.id===id)?.options?.map(option=>option.value)??[]);
  if(options.some(column=>!column.length||column.length>12||
      !column.every(item=>typeof item==='string'))||
      options.reduce((count,column)=>count*column.length,1)>128)return false;
  try{
    for(const subject of options[0])for(const resource of options[1])for(const action of options[2]){
      const request={subject,resource,action};
      const first=subjects.findIndex((entry,index)=>entry===subject&&
        resources[index]===resource&&actions[index]===action);
      const engine=createProcessEngine(scene);
      engine.reset(request);
      if(!engine.can('loadPolicy'))return false;
      engine.act('loadPolicy');
      const loaded=engine.getState().state as Record<string,unknown>;
      if(loaded.matchIndex!==-1||loaded.matchedRule!==-1||loaded.done!==false||
          loaded.decision!=='pending'||!Array.isArray(loaded.trace)||loaded.trace.length!==1)
        return false;
      for(let index=0;index<(first>=0?first+1:subjects.length);index++){
        if(!engine.can('matchNextRule'))return false;
        engine.act('matchNextRule');
        const current=engine.getState().state as Record<string,unknown>;
        const hit=index===first;
        const terminal=hit||index===subjects.length-1;
        if(current.matchIndex!==index||current.matchedRule!==(hit?index:-1)||
            current.decision!==(hit?effects[index]:terminal?'deny':'pending')||
            current.done!==terminal||
            !Array.isArray(current.trace)||current.trace.length!==1+index+1+(terminal?1:0)||
            !same(current.ruleSubjects,subjects)||!same(current.ruleResources,resources)||
            !same(current.ruleActions,actions)||!same(current.ruleEffects,effects))return false;
      }
      if(engine.can('matchNextRule'))return false;
    }
    return true;
  }catch{return false;}
}

export function reconcileVerifiedPluralPolicyTests(scene:ProcessScene,value:unknown):unknown {
  if(!value||typeof value!=='object'||Array.isArray(value)||
      !Array.isArray((value as {tests?:unknown}).tests)||
      !verifyPluralPolicyFirstMatch(scene))return value;
  const state=scene.initialState as Record<string,unknown>;
  const subjects=state.ruleSubjects as string[],resources=state.ruleResources as string[];
  const actions=state.ruleActions as string[],effects=state.ruleEffects as string[];
  const options=['subject','resource','action'].map(id=>
    scene.inputs.find(input=>input.id===id)?.options?.map(option=>option.value as string)??[]);
  const selectable=(subject:string,resource:string,action:string)=>
    options[0].includes(subject)&&options[1].includes(resource)&&options[2].includes(action);
  if(!subjects.every((subject,index)=>selectable(subject,resources[index],actions[index])))return value;
  const missed=options[0].flatMap(subject=>options[1].flatMap(resource=>
    options[2].map(action=>({subject,resource,action}))))
    .find(input=>!subjects.some((subject,index)=>subject===input.subject&&
      resources[index]===input.resource&&actions[index]===input.action));
  if(!missed)return value;
  const tests:ProcessPackage['tests']=[];
  const seen=new Set<string>();
  for(let index=0;index<subjects.length;index++){
    const input={subject:subjects[index],resource:resources[index],action:actions[index]};
    const key=JSON.stringify(input);
    if(seen.has(key))continue;
    seen.add(key);
    tests.push({name:`第 ${index+1} 条规则命中：${input.subject}/${input.resource}/${input.action} → ${effects[index]}`,
      inputs:input,actions:[{id:'loadPolicy',count:1},{id:'matchNextRule',count:index+1}],
      expect:[
        {value:{state:'matchIndex'},equals:index},
        {value:{state:'matchedRule'},equals:index},
        {value:{state:'decision'},equals:effects[index]},
        {value:{state:'done'},equals:true},
        {value:{op:'length',args:[{state:'trace'}]},equals:index+3},
      ]});
  }
  tests.push({name:'全部规则未命中：最后一条检查前仍待判定',inputs:missed,
    actions:[{id:'loadPolicy',count:1},{id:'matchNextRule',count:subjects.length-1}],
    expect:[
      {value:{state:'matchIndex'},equals:subjects.length-2},
      {value:{state:'matchedRule'},equals:-1},
      {value:{state:'decision'},equals:'pending'},
      {value:{state:'done'},equals:false},
      {value:{op:'length',args:[{state:'trace'}]},equals:subjects.length},
    ]});
  tests.push({name:'全部规则未命中：最终默认拒绝',inputs:missed,
    actions:[{id:'loadPolicy',count:1},{id:'matchNextRule',count:subjects.length}],
    expect:[
      {value:{state:'matchIndex'},equals:subjects.length-1},
      {value:{state:'matchedRule'},equals:-1},
      {value:{state:'decision'},equals:'deny'},
      {value:{state:'done'},equals:true},
      {value:{op:'length',args:[{state:'trace'}]},equals:subjects.length+2},
    ]});
  if(tests.length>8)return value;
  return same((value as {tests:unknown}).tests,tests)?value:
    {...value as Record<string,unknown>,tests};
}

/** Correct authored assertions only after the actual rule-by-rule engine trace
 * matches an independent first-match oracle for the four fixed policy columns.
 * A broken action is left unchanged for strict validation and model repair. */
export function reconcileVerifiedAccessPolicyTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {tests?: unknown};
  if (!Array.isArray(envelope.tests)) return value;
  const state = scene.initialState as Record<string, unknown>;
  const subjects = state.ruleSubjects, resources = state.ruleResources;
  const actions = state.ruleActions, effects = state.ruleEffects;
  if (![subjects,resources,actions,effects].every(Array.isArray) ||
      !Array.isArray(subjects) || !Array.isArray(resources) ||
      !Array.isArray(actions) || !Array.isArray(effects) ||
      subjects.length < 2 || subjects.length > 128 ||
      [resources,actions,effects].some(column => column.length !== subjects.length) ||
      !effects.every(effect => effect === 'allow' || effect === 'deny') ||
      !['subject','resource','action'].every(id => scene.inputs.some(input => input.id === id)))
    return value;
  const match = scene.actions.find(action => action.repeatWhile !== undefined &&
    ['currentIndex','matchedIndex','matchedEffect','decision','finished']
      .every(id => action.updates.some(update => update.target === id)));
  if (!match) return value;
  type Test = {name?: string; inputs?: Record<string, unknown>;
    actions?: Array<{id?: string;count?: number|string}>;
    expect?: Array<{value?: unknown;equals?: unknown}>};
  const result = structuredClone(envelope) as {tests: Test[]};
  let changed = false;
  for (const test of result.tests) {
    const input = test.inputs;
    if (!input || !Array.isArray(test.actions) || !Array.isArray(test.expect) ||
        !['subject','resource','action'].every(id => typeof input[id] === 'string') ||
        !test.actions.some(step => step.id === match.id)) continue;
    const firstMatch = subjects.findIndex((subject,index) => subject === input.subject &&
      resources[index] === input.resource && actions[index] === input.action);
    const terminalSteps = firstMatch >= 0 ? firstMatch + 1 : subjects.length;
    const terminalExpected = test.expect.some(assertion =>
      same(assertion.value,{state:'finished'}) && assertion.equals === true ||
      same(assertion.value,{state:'stage'}) &&
        ['decided','exhausted','finished'].includes(String(assertion.equals)));
    const priorActions = structuredClone(test.actions);
    const proposed = structuredClone(test.actions);
    const lastMatch = proposed.findLastIndex(step => step.id === match.id);
    const authoredSteps = proposed.reduce((sum,step) =>
      sum + (step.id === match.id && typeof step.count === 'number' ? step.count : 0),0);
    if (terminalExpected && authoredSteps > 0 && authoredSteps !== terminalSteps) {
      const before = proposed.slice(0,lastMatch).reduce((sum,step) =>
        sum + (step.id === match.id && typeof step.count === 'number' ? step.count : 0),0);
      if (terminalSteps <= before) continue;
      proposed[lastMatch].count = terminalSteps - before;
    }
    try {
      const engine = createProcessEngine(scene);
      engine.reset(input);
      let checked = 0, valid = true;
      for (const step of proposed) {
        if (typeof step.id !== 'string' || typeof step.count !== 'number' ||
            !Number.isInteger(step.count) || step.count < 1 || step.count > 256) {valid=false;break;}
        for (let n = 0; n < step.count; n++) {
          if (!engine.can(step.id)) {valid=false;break;}
          engine.act(step.id);
          const current = engine.getState().state as Record<string, unknown>;
          if (![subjects,resources,actions,effects].every((column,index) =>
              same(current[['ruleSubjects','ruleResources','ruleActions','ruleEffects'][index]],column))) {
            valid=false;break;
          }
          if (step.id !== match.id) continue;
          const index = checked++;
          const hit = index === firstMatch;
          const terminal = hit || index === subjects.length - 1;
          if (index >= terminalSteps || current.matchedIndex !== (hit ? index : -1) ||
              current.matchedEffect !== (hit ? effects[index] : '') ||
              current.finished !== terminal ||
              current.currentIndex !== (terminal ? index : index + 1) ||
              (terminal && current.decision !== (hit ? effects[index] : 'deny'))) {
            valid=false;break;
          }
        }
        if (!valid) break;
      }
      if (!valid || checked === 0 || terminalExpected && checked !== terminalSteps) continue;
      const current = engine.getState().state as Record<string, unknown>;
      for (const assertion of test.expect) {
        const expression = assertion.value as {state?: unknown} | undefined;
        if (typeof expression?.state !== 'string' ||
            Object.keys(expression).length !== 1 ||
            !Object.hasOwn(current,expression.state)) continue;
        const actual = current[expression.state];
        if (!same(actual,assertion.equals)) {assertion.equals=actual;changed=true;}
      }
      if (!same(priorActions,proposed)) {test.actions=proposed;changed=true;}
      if (terminalExpected && firstMatch < 0 && /命中第\s*\d+/.test(test.name ?? '')) {
        test.name = `${input.subject} 请求 ${input.resource} ${input.action}：无匹配规则，默认拒绝`;
        changed=true;
      }
    } catch {
      // The scene or input failed execution; preserve the authored test for
      // strict validation rather than turning a real defect into a pass.
    }
  }
  return changed ? result : value;
}

type DeferredWildcardPolicy = {
  columns: [string[], string[], string[], Array<'allow' | 'deny'>];
  options: string[][];
};

function deferredWildcardPolicy(scene: ProcessScene): DeferredWildcardPolicy | undefined {
  const initial = scene.initialState as Record<string, unknown>;
  if (scene.actions.length !== 2 || initial.policyLoaded !== false ||
      initial.phase !== 'idle' || initial.ruleIndex !== -1 || initial.ruleCount !== 0 ||
      initial.matchedIndex !== -1 || initial.decision !== '未判定' ||
      !same(initial.trace, []) ||
      !['ruleSubjects','ruleResources','ruleActions','ruleEffects']
        .every(key => same(initial[key], []))) return;
  const load = scene.actions.find(action => action.id === 'loadPolicy');
  const match = scene.actions.find(action => action.id === 'matchRule');
  if (!load || !match || !match.repeatWhile ||
      !['ruleIndex','matchedIndex','decision','reason','trace','phase']
        .every(key => match.updates.some(update => update.target === key))) return;
  const loaded = (key: string) => load.updates.find(update => update.target === key)?.value;
  const keys = ['ruleSubjects','ruleResources','ruleActions','ruleEffects'];
  const columns = keys.map(loaded);
  const subjects = columns[0];
  if (!Array.isArray(subjects) || subjects.length < 2 || subjects.length > 16 ||
      columns.some(column => !Array.isArray(column) || column.length !== subjects.length ||
        !column.every(item => typeof item === 'string')) ||
      !(columns[3] as string[]).every(item => item === 'allow' || item === 'deny') ||
      loaded('policyLoaded') !== true || loaded('phase') !== 'ready' ||
      loaded('ruleCount') !== subjects.length || loaded('ruleIndex') !== -1 ||
      loaded('matchedIndex') !== -1 || loaded('decision') !== '未判定' ||
      !same(loaded('trace'), [])) return;
  const options = ['subject','resource','action'].map(id =>
    scene.inputs.find(input => input.id === id)?.options?.map(option => option.value));
  if (options.some(list => !Array.isArray(list) || !list.length || list.length > 12 ||
      !list.every(item => typeof item === 'string' && item !== '*')) ||
      options.reduce((count, list) => count * (list?.length ?? 0), 1) > 128) return;
  return {columns: columns as DeferredWildcardPolicy['columns'], options: options as string[][]};
}

/** Independently compare the executable scene against every selectable
 * request and each rule in the loader's fixed table. A failed sweep leaves
 * authored tests untouched so a broken algorithm cannot be made to pass by
 * changing only the expected answers. */
export function verifyDeferredWildcardPolicyFirstMatch(scene: ProcessScene): boolean {
  const policy = deferredWildcardPolicy(scene);
  if (!policy) return false;
  const [subjects, resources, actions, effects] = policy.columns;
  try {
    for (const subject of policy.options[0])
      for (const resource of policy.options[1])
        for (const action of policy.options[2]) {
          const input = {subject, resource, action};
          const first = subjects.findIndex((rule, index) =>
            (rule === '*' || rule === subject) &&
            (resources[index] === '*' || resources[index] === resource) &&
            (actions[index] === '*' || actions[index] === action));
          const engine = createProcessEngine(scene);
          engine.reset(input);
          if (engine.can('matchRule') || !engine.can('loadPolicy')) return false;
          engine.act('loadPolicy');
          const loaded = engine.getState().state as Record<string, unknown>;
          if (loaded.policyLoaded !== true || loaded.phase !== 'ready' ||
              loaded.ruleCount !== subjects.length || loaded.ruleIndex !== -1 ||
              loaded.matchedIndex !== -1 || loaded.decision !== '未判定' ||
              !same(loaded.trace, []) || engine.can('loadPolicy') ||
              !['ruleSubjects','ruleResources','ruleActions','ruleEffects']
                .every((key, index) => same(loaded[key], policy.columns[index]))) return false;
          const steps = first >= 0 ? first + 1 : subjects.length;
          for (let index = 0; index < steps; index++) {
            if (!engine.can('matchRule')) return false;
            engine.act('matchRule');
            const current = engine.getState().state as Record<string, unknown>;
            const hit = index === first;
            const exhausted = index === subjects.length - 1;
            const expectedDecision = hit ? effects[index] : exhausted ? 'deny' : '未判定';
            const expectedPhase = hit ? 'decided' : exhausted ? 'done' : 'ready';
            const expectedReason = hit
              ? `第 ${index + 1} 条规则命中：主体 ${subject} 对资源 ${resource} 执行 ${action}，规则给出 ${effects[index] === 'allow' ? '允许' : '拒绝'}。`
              : exhausted ? '全部规则都不匹配当前请求，按默认拒绝处理。' : '';
            const trace = current.trace;
            if (current.ruleIndex !== index || current.matchedIndex !== (hit ? index : -1) ||
                current.decision !== expectedDecision || current.phase !== expectedPhase ||
                current.reason !== expectedReason || !Array.isArray(trace) ||
                trace.length !== index + 1 ||
                trace[index] !== `规则 ${index + 1}：${subjects[index]} / ${resources[index]} / ${actions[index]} → ${hit ? '命中' : '不匹配'}` ||
                !['ruleSubjects','ruleResources','ruleActions','ruleEffects']
                  .every((key, column) => same(current[key], policy.columns[column]))) return false;
          }
          if (engine.can('matchRule')) return false;
        }
    return true;
  } catch { return false; }
}

/** The authored single-index marker sometimes calls indicesOf on the scalar
 * matchedIndex. Replace that exact expression with a guarded one-element
 * index array only after proving all requests keep the index in the table. */
export function normalizeVerifiedDeferredWildcardPolicyMarks(
  stateBehavior: Pick<ProcessScene, 'inputs' | 'initialState' | 'actions'>,
  presentation: unknown,
): unknown {
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation))
    return presentation;
  const source = presentation as {views?: Array<{kind?: string;value?: unknown;markedIndices?: unknown}>};
  const matched = {state:'matchedIndex'};
  const visible = {op:'gte',args:[matched,0]};
  const mistaken = {op:'indicesOf',args:[matched,{op:'if',args:[visible,0,-1]}]};
  const view = source.views?.find(item => item.kind === 'array' && same(item.markedIndices,mistaken));
  if (!view) return presentation;
  const scene = {schemaVersion:'process-v1',...stateBehavior,...source} as ProcessScene;
  const policy = deferredWildcardPolicy(scene);
  const rows = view.value as {op?: string;args?: unknown[]} | undefined;
  if (!policy || rows?.op !== 'if' || !Array.isArray(rows.args) ||
      !same(rows.args[0],{state:'policyLoaded'}) ||
      !same(rows.args[2],[]) ||
      (rows.args[1] as {op?: string;args?: unknown[]})?.op !== 'array' ||
      (rows.args[1] as {args?: unknown[]}).args?.length !== policy.columns[0].length ||
      !verifyDeferredWildcardPolicyFirstMatch(scene)) return presentation;
  const revised = structuredClone(source);
  revised.views!.find(item => item.kind === 'array' && same(item.markedIndices,mistaken))!
    .markedIndices = {op:'if',args:[visible,{op:'array',args:[matched]},[]]};
  return revised;
}

/** A final all-wildcard rule makes the model's separate no-match conclusion
 * unreachable. Keep the three reachable teaching phases and describe the
 * actual final rule instead of demanding tests for an impossible branch. */
export function normalizeVerifiedDeferredWildcardPolicyPresentation(
  stateBehavior: Pick<ProcessScene, 'inputs' | 'initialState' | 'actions'>,
  presentation: unknown,
): unknown {
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation))
    return presentation;
  const source = presentation as {stages?: Array<{when?: unknown;title?: string}>;
    summary?: string;modelNote?: string};
  if (!Array.isArray(source.stages) || source.stages.length <= 3) return presentation;
  const scene = {schemaVersion:'process-v1',...stateBehavior,...source} as ProcessScene;
  const policy = deferredWildcardPolicy(scene);
  if (!policy || !verifyDeferredWildcardPolicyFirstMatch(scene)) return presentation;
  const [subjects,resources,actions] = policy.columns;
  const allMatched = policy.options[0].every(subject =>
    policy.options[1].every(resource => policy.options[2].every(action =>
      subjects.some((rule,index) => (rule === '*' || rule === subject) &&
        (resources[index] === '*' || resources[index] === resource) &&
        (actions[index] === '*' || actions[index] === action)))));
  if (!allMatched || subjects.at(-1) !== '*' || resources.at(-1) !== '*' ||
      actions.at(-1) !== '*') return presentation;
  const unreachable = {op:'and',args:[
    {state:'policyLoaded'},
    {op:'eq',args:[{state:'decision'},'deny']},
    {op:'eq',args:[{state:'matchedIndex'},-1]},
  ]};
  const missed = source.stages.filter(stage => same(stage.when,unreachable));
  if (missed.length !== 1 || source.stages.length - 1 < 3) return presentation;
  const revised = structuredClone(source);
  revised.stages = revised.stages!.filter(stage => !same(stage.when,unreachable));
  const prefix = `前 ${subjects.length - 1} 条都不匹配时，最后一条通配规则命中并拒绝。`;
  revised.summary = revised.summary?.replace(
    `如果 ${subjects.length} 条都不匹配，按默认拒绝处理。`,prefix);
  revised.modelNote = revised.modelNote?.replace(
    '全部规则走完仍未命中时按默认拒绝处理。',prefix);
  return revised;
}

/** Reuse a proven scene and correct only assertions contradicted by its
 * independently verified first-match behavior. In particular, a final '*'
 * rule is a real match, so it cannot also be described as default deny. */
export function reconcileVerifiedDeferredWildcardPolicyTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray((value as {tests?: unknown}).tests) ||
      !verifyDeferredWildcardPolicyFirstMatch(scene)) return value;
  const policy = deferredWildcardPolicy(scene)!;
  const [subjects, resources, actions, effects] = policy.columns;
  const result = structuredClone(value) as {tests: ProcessPackage['tests']};
  let changed = false;
  for (const test of result.tests) {
    const subject = test.inputs.subject, resource = test.inputs.resource, action = test.inputs.action;
    if (typeof subject !== 'string' || typeof resource !== 'string' || typeof action !== 'string' ||
        ![subject,resource,action].every((item,index) => policy.options[index].includes(item)) ||
        test.actions.length !== 2 || test.actions[0].id !== 'loadPolicy' ||
        test.actions[0].count !== 1 || test.actions[1].id !== 'matchRule' ||
        typeof test.actions[1].count !== 'number' || !Number.isInteger(test.actions[1].count)) continue;
    const first = subjects.findIndex((rule,index) =>
      (rule === '*' || rule === subject) &&
      (resources[index] === '*' || resources[index] === resource) &&
      (actions[index] === '*' || actions[index] === action));
    const terminalSteps = first >= 0 ? first + 1 : subjects.length;
    const terminalExpected = test.expect.some(assertion =>
      same(assertion.value,{state:'decision'}) && ['allow','deny'].includes(String(assertion.equals)) ||
      same(assertion.value,{state:'phase'}) && ['decided','done'].includes(String(assertion.equals)) ||
      same(assertion.value,{state:'matchedIndex'}) && typeof assertion.equals === 'number' && assertion.equals >= 0);
    const count = test.actions[1].count;
    if (count < 1 || count > terminalSteps) continue;
    if (terminalExpected && count < terminalSteps) test.actions[1].count = terminalSteps;
    const engine = createProcessEngine(scene);
    engine.reset({subject,resource,action});
    engine.act('loadPolicy');
    for (let step = 0; step < test.actions[1].count; step++) engine.act('matchRule');
    const state = engine.getState().state as Record<string, unknown>;
    let testChanged = count !== test.actions[1].count;
    for (const assertion of test.expect) {
      const expression = assertion.value as {state?: string;op?: string;args?: unknown[]};
      let actual: unknown;
      if (typeof expression?.state === 'string' && Object.keys(expression).length === 1 &&
          Object.hasOwn(state,expression.state)) actual = state[expression.state];
      else if (expression?.op === 'length' && same(expression.args,[{state:'trace'}]))
        actual = (state.trace as unknown[]).length;
      else if (expression?.op === 'at' && Array.isArray(expression.args) &&
          same(expression.args[0],{state:'trace'}) &&
          Number.isInteger(expression.args[1]) &&
          (expression.args[1] as number) >= 0 &&
          (expression.args[1] as number) < (state.trace as unknown[]).length)
        actual = (state.trace as unknown[])[expression.args[1] as number];
      if (actual !== undefined && !same(actual,assertion.equals)) {
        assertion.equals = actual as typeof assertion.equals;
        testChanged = true;
      }
    }
    if (testChanged) {
      test.name = first >= 0
        ? `${subject}/${resource}/${action}：第 ${first + 1} 条规则命中并${effects[first] === 'allow' ? '允许' : '拒绝'}`
        : `${subject}/${resource}/${action}：无匹配规则，默认拒绝`;
      changed = true;
    }
  }
  return changed ? result : value;
}

/** A model can ask for the default-deny action after only two comparisons
 * while its own assertions require the entire fixed rule list to be checked.
 * Correct that test sequence only after the actual scene follows an
 * independent first-match oracle on every step of the candidate request. */
export function reconcileVerifiedStepwisePolicyTests(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {tests?: unknown};
  if (!Array.isArray(envelope.tests)) return value;
  const state = scene.initialState as Record<string, unknown>;
  const subjects=state.ruleSubjects,resources=state.ruleResources;
  const actions=state.ruleActions,decisions=state.ruleDecisions;
  if (![subjects,resources,actions,decisions].every(Array.isArray) ||
      !Array.isArray(subjects) || !Array.isArray(resources) ||
      !Array.isArray(actions) || !Array.isArray(decisions) ||
      subjects.length<2 || subjects.length>128 ||
      [resources,actions,decisions].some(column=>column.length!==subjects.length) ||
      !['subjectRole','resourceLevel','requestAction'].every(id=>scene.inputs.some(input=>input.id===id)) ||
      state.currentIndex!==-1 || state.matchedRuleIndex!==-1) return value;
  const load=scene.actions.find(action=>action.id==='loadPolicy');
  const match=scene.actions.find(action=>action.id==='matchNextRule');
  const miss=scene.actions.find(action=>action.id==='decideMiss');
  if(!load || !match?.repeatWhile || !miss ||
      !match.updates.some(update=>update.target==='currentIndex') ||
      !match.updates.some(update=>update.target==='matchedRuleIndex')) return value;
  type Test={name?:string;inputs?:Record<string,unknown>;
    actions?:Array<{id?:string;count?:number|string}>;
    expect?:Array<{value?:unknown;equals?:unknown}>};
  const revised=structuredClone(envelope) as {tests:Test[]};
  let changed=false;
  for(const test of revised.tests){
    if(!test.inputs || !Array.isArray(test.actions) || !Array.isArray(test.expect) ||
        !['subjectRole','resourceLevel','requestAction'].every(id=>typeof test.inputs![id]==='string')) continue;
    const first=subjects.findIndex((subject,index)=>subject===test.inputs!.subjectRole &&
      resources[index]===test.inputs!.resourceLevel && actions[index]===test.inputs!.requestAction);
    if(first>=0)continue;
    const missStep=test.actions.findIndex(step=>step.id===miss.id);
    if(missStep<0 || test.actions.slice(missStep+1).some(step=>step.id===match.id))continue;
    const matchSteps=test.actions.slice(0,missStep)
      .map((step,index)=>step.id===match.id?{step,index}:undefined)
      .filter((item):item is {step:{id?:string;count?:number|string};index:number}=>Boolean(item));
    if(!matchSteps.length || matchSteps.some(item=>typeof item.step.count!=='number' ||
        !Number.isInteger(item.step.count) || item.step.count<1))continue;
    const authored=matchSteps.reduce((sum,item)=>sum+Number(item.step.count),0);
    if(authored>=subjects.length ||
        !test.expect.some(item=>same(item.value,{state:'currentIndex'})&&item.equals===subjects.length) ||
        !test.expect.some(item=>same(item.value,{op:'length',args:[{state:'decisionTrace'}]})&&
          item.equals===subjects.length))continue;
    try{
      const engine=createProcessEngine(scene);
      engine.reset(test.inputs);
      if(!engine.can(load.id))continue;
      engine.act(load.id);
      let valid=true;
      for(let index=0;index<subjects.length;index++){
        if(!engine.can(match.id)){valid=false;break;}
        engine.act(match.id);
        const current=engine.getState().state as Record<string,unknown>;
        if(current.currentIndex!==index+1 || current.matchedRuleIndex!==-1 ||
            !Array.isArray(current.decisionTrace) || current.decisionTrace.length!==index+1 ||
            !same(current.ruleSubjects,subjects) || !same(current.ruleResources,resources) ||
            !same(current.ruleActions,actions) || !same(current.ruleDecisions,decisions)){
          valid=false;break;
        }
      }
      if(!valid || engine.can(match.id) || !engine.can(miss.id))continue;
      engine.act(miss.id);
      const final=engine.getState().state as Record<string,unknown>;
      if(final.matchedRuleIndex!==-1 || final.finalAuthorization!=='拒绝' ||
          final.currentIndex!==subjects.length)continue;
      const last=matchSteps.at(-1)!;
      const before=authored-Number(last.step.count);
      test.actions[last.index].count=subjects.length-before;
      if(typeof test.name==='string')test.name=test.name.replace(/仅遍历[^\s]{1,8}条后未命中/,
        '遍历全部规则后未命中');
      changed=true;
    }catch{
      // Keep the authored test when execution disagrees with the oracle.
    }
  }
  return changed?revised:value;
}

/** Some generated policies already implement first-match correctly, but their
 * authored tests click the final button before reaching a matching rule.
 * Replace those tests only after every selectable request passes an independent
 * rule-table oracle through the real engine. No scene behavior is repaired here.
 */
export function reconcileVerifiedLoadedPolicyPackage(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray((value as {tests?: unknown}).tests)) return value;
  const inputIds = ['subject', 'resourceLevel', 'action'] as const;
  if (scene.inputs.length !== 3 ||
      !inputIds.every(id => scene.inputs.some(input => input.id === id && input.type === 'select')) ||
      scene.actions.length !== 3 ||
      !['loadPolicy', 'matchRule', 'finalizeDecision'].every(id => scene.actions.some(action => action.id === id))) return value;
  const load = scene.actions.find(action => action.id === 'loadPolicy')!;
  const match = scene.actions.find(action => action.id === 'matchRule')!;
  const finalize = scene.actions.find(action => action.id === 'finalizeDecision')!;
  if (!match.repeatWhile || !Array.isArray(scene.initialState.trace) ||
      scene.initialState.stage !== 'input' || scene.initialState.ruleIndex !== 0 ||
      scene.initialState.matchedRuleIndex !== -1) return value;
  const columnNames = ['ruleSubjects', 'ruleLevels', 'ruleActions', 'ruleDecisions'] as const;
  const columns = columnNames.map(name => {
    const expression = load.updates.find(update => update.target === name)?.value as
      {local?: string}|string[]|undefined;
    if (Array.isArray(expression)) return expression;
    if (typeof expression?.local !== 'string') return undefined;
    const local = load.locals?.find(item => item.id === expression.local)?.value as
      {op?: string; args?: unknown[]}|undefined;
    return local?.op === 'array' ? local.args : undefined;
  });
  if (!columns.every(Array.isArray) || !Array.isArray(columns[0])) return value;
  const rules = columns as string[][];
  const count = rules[0].length;
  if (count < 2 || count > 7 || rules.some(column => column.length !== count ||
      column.some(item => typeof item !== 'string')) ||
      !rules[3].every(item => item === '允许' || item === '拒绝')) return value;
  const options = inputIds.map(id => scene.inputs.find(input => input.id === id)?.options?.map(item => item.value) ?? []);
  if (options.some(column => !column.length || column.length > 10 ||
      column.some(item => typeof item !== 'string')) ||
      options.reduce((total, column) => total * column.length, 1) > 128) return value;
  const selectable = (row: number) => options.every((column, index) => column.includes(rules[index][row]));
  if (!rules[0].every((_item, index) => selectable(index))) return value;
  const inputs = options[0].flatMap(subject => options[1].flatMap(resourceLevel =>
    options[2].map(action => ({subject, resourceLevel, action}))));
  const firstMatch = (input: (typeof inputs)[number]) => rules[0].findIndex((subject, index) =>
    subject === input.subject && rules[1][index] === input.resourceLevel &&
    rules[2][index] === input.action);
  const uncovered = inputs.find(input => firstMatch(input) === -1);
  if (!uncovered || rules[0].some((_item, index) => firstMatch({subject: rules[0][index],
    resourceLevel: rules[1][index], action: rules[2][index]}) !== index)) return value;
  const normalized = structuredClone(scene);
  const normalizedFinalize = normalized.actions.find(action => action.id === 'finalizeDecision')!;
  const stageDone = {op: 'eq', args: [{state: 'stage'}, 'done']};
  if (same(normalizedFinalize.enabledWhen, {op: 'and', args: [stageDone,
      {op: 'eq', args: [{state: 'matchedRuleIndex'}, -1]},
      {op: 'gt', args: [{state: 'ruleIndex'}, 0]}]}) &&
      normalizedFinalize.updates.length === 1 && normalizedFinalize.updates[0].target === 'reason')
    normalizedFinalize.enabledWhen = stageDone;
  try {
    for (const input of inputs) {
      const first = firstMatch(input);
      const terminalStep = first >= 0 ? first + 1 : count;
      const engine = createProcessEngine(normalized);
      engine.reset(input);
      if (!engine.can(load.id)) return value;
      engine.act(load.id);
      const loaded = engine.getState().state as Record<string, unknown>;
      if (loaded.stage !== 'matching' || loaded.ruleIndex !== 0 || loaded.ruleCount !== count ||
          loaded.matchedRuleIndex !== -1 || !columnNames.every((name, index) =>
            same(loaded[name], rules[index]))) return value;
      for (let index = 0; index < terminalStep; index++) {
        if (!engine.can(match.id)) return value;
        engine.act(match.id);
        const current = engine.getState().state as Record<string, unknown>;
        const hit = index === first;
        const terminal = hit || index === count - 1;
        if (current.ruleIndex !== index + 1 || current.stage !== (terminal ? 'done' : 'matching') ||
            current.matchedRuleIndex !== (hit ? index : -1) ||
            current.decision !== (hit ? rules[3][index] : '拒绝') ||
            current.currentRuleSubject !== rules[0][index] ||
            current.currentRuleLevel !== rules[1][index] ||
            current.currentRuleAction !== rules[2][index] ||
            current.currentRuleDecision !== rules[3][index] ||
            current.subjectMatched !== (rules[0][index] === input.subject) ||
            current.levelMatched !== (rules[1][index] === input.resourceLevel) ||
            current.actionMatched !== (rules[2][index] === input.action) ||
            !Array.isArray(current.trace) || current.trace.length !== index + 1 ||
            !columnNames.every((name, column) => same(current[name], rules[column]))) return value;
      }
      if (engine.can(match.id) || !engine.can(finalize.id)) return value;
      engine.act(finalize.id);
      const final = engine.getState().state as Record<string, unknown>;
      if (final.stage !== 'done' || final.ruleIndex !== terminalStep ||
          final.matchedRuleIndex !== first ||
          final.decision !== (first >= 0 ? rules[3][first] : '拒绝')) return value;
    }
  } catch { return value; }
  const finalAction = normalized.actions.find(action => action.id === 'finalizeDecision')!;
  const finalMessage = finalAction.locals?.find(local => local.id === 'finalMsg');
  const matchMessage = finalMessage?.value as {op?: string; args?: unknown[]}|undefined;
  const matchedText = matchMessage?.args?.[1] as {op?: string;args?: unknown[]}|undefined;
  if (matchMessage?.op === 'if' && matchedText?.op === 'concat' &&
      matchedText.args?.[0] === '最终判定：允许。命中规则 ') {
    matchedText.args.splice(0, 1, '最终判定：', {state: 'decision'}, '。命中规则 ');
  }
  const resultView = normalized.views.find(view => view.id === 'resultValue' && view.kind === 'value');
  if (resultView && same(resultView.value, {state: 'decision'}))
    resultView.value = {op: 'if', args: [
      {op: 'eq', args: [{state: 'stage'}, 'done']}, {state: 'decision'}, '待判定',
    ]};
  const tests: ProcessPackage['tests'] = [...rules[0].map((_item, index) => ({
    name: `第 ${index + 1} 条规则命中：${rules[0][index]}/${rules[1][index]}/${rules[2][index]} → ${rules[3][index]}`,
    inputs: {subject: rules[0][index], resourceLevel: rules[1][index], action: rules[2][index]},
    actions: [{id: load.id, count: 1}, {id: match.id, count: index + 1}, {id: finalize.id, count: 1}],
    expect: [
      {value: {state: 'stage'}, equals: 'done'},
      {value: {state: 'ruleIndex'}, equals: index + 1},
      {value: {state: 'matchedRuleIndex'}, equals: index},
      {value: {state: 'decision'}, equals: rules[3][index]},
      {value: {op: 'length', args: [{state: 'trace'}]}, equals: index + 1},
    ],
  })), {
    name: '全部规则未命中：默认拒绝', inputs: uncovered,
    actions: [{id: load.id, count: 1}, {id: match.id, count}, {id: finalize.id, count: 1}],
    expect: [
      {value: {state: 'stage'}, equals: 'done'},
      {value: {state: 'ruleIndex'}, equals: count},
      {value: {state: 'matchedRuleIndex'}, equals: -1},
      {value: {state: 'decision'}, equals: '拒绝'},
      {value: {op: 'length', args: [{state: 'trace'}]}, equals: count},
    ],
  }];
  return {scene: normalized, tests};
}

/** Some otherwise correct policy scans mark the phase as decided when a rule
 * matches, while their separate final button is enabled only before that
 * phase. Verify every selectable request against the actual rule table before
 * repairing that contradictory guard and replacing impossible authored tests.
 */
export function reconcileVerifiedReadyPolicyFinalization(scene: ProcessScene, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray((value as {tests?: unknown}).tests)) return value;
  const inputIds = ['subject', 'resourceLevel', 'requestAction'] as const;
  if (scene.inputs.length !== 3 || scene.actions.length !== 3 ||
      !inputIds.every(id => scene.inputs.some(input => input.id === id && input.type === 'select'))) return value;
  const load = scene.actions.find(action => action.id === 'loadPolicy');
  const match = scene.actions.find(action => action.id === 'matchNextRule');
  const finalize = scene.actions.find(action => action.id === 'finalizeDecision');
  if (!load || !match?.repeatWhile || !finalize) return value;
  const state = scene.initialState as Record<string, unknown>;
  const columnNames = ['ruleSubject', 'ruleResource', 'ruleAction', 'ruleDecision'] as const;
  const columns = columnNames.map(name => state[name]);
  if (!columns.every(Array.isArray)) return value;
  const rules = columns as string[][];
  const count = rules[0].length;
  if (count < 2 || count > 7 || state.ruleCount !== count ||
      rules.some(column => column.length !== count || column.some(item => typeof item !== 'string')) ||
      !rules[3].every(item => item === 'allow') ||
      state.phase !== '待装载' || state.policyLoaded !== false || state.ruleIndex !== 0 ||
      state.hitIndex !== -1 || state.comparedCount !== 0 || state.ruleHit !== false ||
      state.result !== '待判定' || !same(state.trace, [])) return value;
  const options = inputIds.map(id => scene.inputs.find(input => input.id === id)?.options?.map(item => item.value) ?? []);
  if (options.some(column => !column.length || column.length > 10 ||
      column.some(item => typeof item !== 'string')) ||
      options.reduce((total, column) => total * column.length, 1) > 128 ||
      !rules[0].every((_item, row) => options.every((column, index) => column.includes(rules[index][row]))) ||
      !match.updates.some(update => update.target === 'ruleIndex') ||
      !match.updates.some(update => update.target === 'hitIndex') ||
      !finalize.updates.some(update => update.target === 'result' && same(update.value, {local: 'finalResult'})) ||
      !finalize.updates.some(update => update.target === 'phase' && update.value === '已判定')) return value;
  const originalGuard = {op: 'and', args: [
    {state: 'policyLoaded'},
    {op: 'or', args: [{state: 'ruleHit'},
      {op: 'gte', args: [{state: 'comparedCount'}, {state: 'ruleCount'}]}]},
    {op: 'ne', args: [{state: 'phase'}, '已判定']},
  ]};
  if (!same(finalize.enabledWhen, originalGuard)) return value;
  const inputs = options[0].flatMap(subject => options[1].flatMap(resourceLevel =>
    options[2].map(requestAction => ({subject, resourceLevel, requestAction}))));
  const firstMatch = (input: (typeof inputs)[number]) => rules[0].findIndex((subject, row) =>
    subject === input.subject && rules[1][row] === input.resourceLevel &&
    rules[2][row] === input.requestAction);
  if (rules[0].some((_item, row) => firstMatch({subject: rules[0][row],
    resourceLevel: rules[1][row], requestAction: rules[2][row]}) !== row)) return value;
  const misses = inputs.filter(input => firstMatch(input) === -1);
  if (misses.length < 2) return value;
  const normalized = structuredClone(scene);
  normalized.actions.find(action => action.id === finalize.id)!.enabledWhen = {op: 'and', args: [
    {state: 'policyLoaded'},
    {op: 'or', args: [{state: 'ruleHit'},
      {op: 'gte', args: [{state: 'comparedCount'}, {state: 'ruleCount'}]}]},
    {op: 'ne', args: [{state: 'result'}, '允许访问']},
    {op: 'ne', args: [{state: 'result'}, '拒绝访问']},
  ]};
  try {
    for (const input of inputs) {
      const first = firstMatch(input);
      const terminalStep = first >= 0 ? first + 1 : count;
      const engine = createProcessEngine(normalized);
      engine.reset(input);
      if (!engine.can(load.id) || engine.can(finalize.id)) return value;
      engine.act(load.id);
      let current = engine.getState().state as Record<string, unknown>;
      if (current.phase !== '规则匹配中' || current.policyLoaded !== true ||
          current.ruleIndex !== 0 || current.comparedCount !== 0 || current.hitIndex !== -1 ||
          current.curSubject !== input.subject || current.curResource !== input.resourceLevel ||
          current.curAction !== input.requestAction || !Array.isArray(current.trace) ||
          current.trace.length !== 1 || !columnNames.every((name, index) => same(current[name], rules[index])))
        return value;
      for (let index = 0; index < terminalStep; index++) {
        if (!engine.can(match.id) || engine.can(finalize.id)) return value;
        engine.act(match.id);
        current = engine.getState().state as Record<string, unknown>;
        const hit = index === first;
        const terminal = hit || index === count - 1;
        if (current.ruleIndex !== index + 1 || current.comparedCount !== index + 1 ||
            current.hitIndex !== (hit ? index : -1) || current.ruleHit !== hit ||
            current.phase !== (terminal ? '已判定' : '规则匹配中') ||
            current.result !== (hit ? '允许' : '待判定') ||
            current.subjectMatch !== (rules[0][index] === input.subject) ||
            current.resourceMatch !== (rules[1][index] === input.resourceLevel) ||
            current.actionMatch !== (rules[2][index] === input.requestAction) ||
            !Array.isArray(current.trace) || current.trace.length !== index + 2 ||
            !columnNames.every((name, column) => same(current[name], rules[column]))) return value;
      }
      if (engine.can(match.id) || !engine.can(finalize.id)) return value;
      engine.act(finalize.id);
      const final = engine.getState().state as Record<string, unknown>;
      if (final.phase !== '已判定' || final.ruleIndex !== terminalStep ||
          final.comparedCount !== terminalStep || final.hitIndex !== first ||
          final.result !== (first >= 0 ? '允许访问' : '拒绝访问') ||
          typeof final.reason !== 'string' || !final.reason ||
          !Array.isArray(final.trace) || final.trace.length !== terminalStep + 2 ||
          engine.can(finalize.id)) return value;
    }
  } catch { return value; }
  const correctedMatch = normalized.actions.find(action => action.id === match.id)!;
  const line = correctedMatch.locals?.find(local => local.id === 'traceLine')?.value as
    {op?: string; args?: unknown[]}|undefined;
  const marker = line?.args?.find(item => typeof item === 'object' && item !== null &&
    (item as {op?: string}).op === 'if') as {args?: unknown[]}|undefined;
  if (marker?.args?.[1] === '命中共') marker.args[1] = '命中';
  const tests: ProcessPackage['tests'] = [...rules[0].map((_item, row) => ({
    name: `第 ${row + 1} 条规则命中：${rules[0][row]}/${rules[1][row]}/${rules[2][row]}`,
    inputs: {subject: rules[0][row], resourceLevel: rules[1][row], requestAction: rules[2][row]},
    actions: [{id: load.id, count: 1}, {id: match.id, count: row + 1},
      {id: finalize.id, count: 1}],
    expect: [
      {value: {state: 'policyLoaded'}, equals: true},
      {value: {state: 'ruleIndex'}, equals: row + 1},
      {value: {state: 'comparedCount'}, equals: row + 1},
      {value: {state: 'hitIndex'}, equals: row},
      {value: {state: 'ruleHit'}, equals: true},
      {value: {state: 'result'}, equals: '允许访问'},
      {value: {op: 'length', args: [{state: 'trace'}]}, equals: row + 3},
    ],
  })), ...misses.slice(0, 2).map((input, index) => ({
    name: `全部规则未命中：默认拒绝 ${index + 1}`,
    inputs: input,
    actions: [{id: load.id, count: 1}, {id: match.id, count},
      {id: finalize.id, count: 1}],
    expect: [
      {value: {state: 'ruleIndex'}, equals: count},
      {value: {state: 'comparedCount'}, equals: count},
      {value: {state: 'hitIndex'}, equals: -1},
      {value: {state: 'ruleHit'}, equals: false},
      {value: {state: 'result'}, equals: '拒绝访问'},
      {value: {op: 'length', args: [{state: 'trace'}]}, equals: count + 2},
    ],
  }))];
  return tests.length <= 8 ? {scene: normalized, tests} : value;
}

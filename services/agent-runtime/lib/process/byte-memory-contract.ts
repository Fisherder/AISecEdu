import { createProcessEngine } from '@/lib/server/process-quality';
import type { ProcessScene } from './schema';

function requestedCapacity(request: Record<string, unknown>) {
  const text = [request.originalRequest, request.description].filter(value => typeof value === 'string').join('\n');
  const capacity = Number(text.match(/缓冲区(?:为|是|大小为|长度为)?\s*(\d+)\s*字节/)?.[1]);
  if (!capacity || !/32位/.test(text) || !/EBP/.test(text) || !/返回地址/.test(text) ||
      !/装载/.test(text) || !/逐字节写入/.test(text) || capacity + 8 > 128) return;
  return capacity;
}

export function requestedByteMemoryGenerationContract(request: Record<string, unknown>) {
  const capacity=requestedCapacity(request);
  if(!capacity)return '';
  return `\n本任务的执行合同：32位教学栈帧有${capacity+8}个连续字节，缓冲区0..${capacity-1}，保存EBP为${capacity}..${capacity+3}，返回地址为${capacity+4}..${capacity+7}。只需原要求的载荷输入，不添加写入模式。初态保留各4字节的原EBP与原返回地址常量数组、写入下标0及实际内存数组。装载动作只连接零缓冲区、原EBP、原返回地址，绝不能提前复制载荷。载荷来自utf8({input:载荷ID})；每一步仅更新实际内存[当前下标]为载荷[当前下标]，然后下标加1，按实际载荷长度停止。保存EBP、返回地址和EIP预览应从本步更新后的内存计算，部分覆盖时也必须显示完整4字节地址；所有updates读旧状态，先用local计算本步完整内存。超过缓冲区是溢出，触及返回地址才标记教学崩溃风险，没有执行真实CPU的ret。核对EIP的证据必须是kind:value、format:hex、value:{state:EIP状态ID}的数值视图。代码activeIndex按实际字符串行从0计数，静态regions.end含末端。不要为了修复偏差重写其他成功步骤。`;
}

export function validateRequestedByteMemoryTransitions(request: Record<string, unknown>, scene: ProcessScene) {
  const capacity = requestedCapacity(request);
  if (!capacity) return;
  const input = scene.inputs.find(item => item.type === 'text');
  const view = scene.views.find(item => item.kind === 'array' && item.format === 'byte' && item.value &&
    typeof item.value === 'object' && 'state' in item.value);
  if (!input || !view) throw Error('逐字节内存合同：需要可变文本载荷和直接读取内存状态的字节视图');
  const target = (view.value as {state: string}).state, total = capacity + 8;
  const length = Math.min(input.maxLength ?? total, total);
  if (length < 1 || total > 128) return;
  const payload = Array.from({length},(_,index)=>String.fromCharCode(65+index%26)).join(''), alternate = 'Z'.repeat(length);
  const prepare = (value: string) => {
    const engine = createProcessEngine(scene);
    engine.reset({[input.id]: value});
    const load = scene.actions.find(action => engine.can(action.id) && action.updates.some(update => update.target === target));
    if (!load) throw Error('逐字节内存合同：缺少可执行的装载栈帧动作，目标状态=' + target);
    engine.act(load.id);
    const bytes = engine.getState().state[target];
    if (!Array.isArray(bytes) || bytes.length !== total)
      throw Error(`逐字节内存合同：装载后必须有${total}个连续字节，目标=${target}，实际=${JSON.stringify(bytes)}`);
    return {engine, load, bytes: [...bytes]};
  };
  const current = prepare(payload), other = prepare(alternate);
  const issues: string[] = [];
  if (JSON.stringify(current.bytes) !== JSON.stringify(other.bytes))
    issues.push(`装载动作${current.load.id}提前写入了载荷；应只准备固定栈帧，${target}只能由后续逐字节动作写入`);
  const writer = scene.actions.find(action => action.id !== current.load.id && current.engine.can(action.id) &&
    action.repeatWhile !== undefined);
  if (!writer) issues.push('装载后没有可连续执行的逐字节写入动作');
  else if (!writer.updates.some(update => update.target === target))
    issues.push(`动作${writer.id}只改变计数或标志，没有更新实际内存${target}；需按当前索引写入当前载荷字节`);
  if (issues.length) throw Error('逐字节内存合同：' + issues.join('；'));
  for (const size of new Set([1, Math.min(capacity, length), length])) {
    const payload = Array.from({length:size},(_,index)=>String.fromCharCode(65+index%26)).join(''), {engine, load} = prepare(payload);
    const write = scene.actions.find(action => action.id !== load.id && engine.can(action.id) &&
      action.repeatWhile !== undefined);
    if (!write) throw Error('逐字节内存合同：装载后没有可连续执行的逐字节写入动作');
    if (!write.updates.some(update => update.target === target))
      throw Error(`逐字节内存合同：动作${write.id}只改变计数或标志，没有更新实际内存${target}；需按当前索引写入当前载荷字节`);
    for (let index = 0; index < size; index++) {
      if (!engine.can(write.id)) throw Error(`逐字节内存合同：动作${write.id}在第${index + 1}字节前提前停止`);
      const before = [...engine.getState().state[target] as number[]];
      engine.act(write.id);
      const after = engine.getState().state[target] as number[];
      if (after.length !== total || after[index] !== payload.charCodeAt(index) ||
          before.some((byte, offset) => offset !== index && after[offset] !== byte))
        throw Error(`逐字节内存合同：${write.id}第${index + 1}步必须仅将${target}[${index}]写成当前输入字节${payload.charCodeAt(index)}；实际=${JSON.stringify(after)}`);
    }
    if (engine.can(write.id)) throw Error(`逐字节内存合同：${write.id}必须按载荷长度${size}停止，不能继续写栈帧中保存的地址字节`);
  }
}

export function normalizeRequestedByteMemoryWorkflow(request: Record<string, unknown>, base: ProcessScene) {
  const capacity = requestedCapacity(request);
  if (!capacity) return;
  const input = base.inputs.find(item => item.type === 'text' && item.ascii === true);
  const memory = base.views.find(view => view.kind === 'array' && view.format === 'byte' &&
    view.value && typeof view.value === 'object' && 'state' in view.value);
  if (!input || !memory) return;
  const target = (memory.value as {state:string}).state;
  const load = base.actions.find(action => !action.repeatWhile && action.updates.some(update => update.target === target));
  const write = base.actions.find(action => action !== load && action.repeatWhile);
  if (!load || !write) return;
  const originalWord = (pattern:RegExp) => {
    const words=Object.entries(base.initialState).filter(([id,value])=>pattern.test(id) && Array.isArray(value) && value.length===4);
    if(words.length===1)return {state:words[0][0]};
    const empty=Object.entries(base.initialState).filter(([id,value])=>pattern.test(id) && Array.isArray(value) && value.length===0 &&
      load.updates.some(update=>update.target===id));
    const requestText=[request.originalRequest,request.description].filter(value=>typeof value==='string').join('\n');
    if(!words.length && empty.length===1 && /EBP.*返回地址.*清零/i.test(load.description ?? '') && !/0x[0-9a-f]+/i.test(requestText))
      return [0,0,0,0];
  };
  const ebp=originalWord(/ebp/i), ret=originalWord(/return|retaddr/i);
  if(!ebp || !ret)return;
  const locals = write.locals ?? [];
  const indices = locals.filter(item => item.value && typeof item.value === 'object' && 'state' in item.value &&
    locals.some(next => (next.value as any)?.op === 'add' &&
      JSON.stringify((next.value as any).args) === JSON.stringify([{local:item.id},1]) &&
      write.updates.some(update => update.target === (item.value as {state:string}).state &&
        JSON.stringify(update.value) === JSON.stringify({local:next.id}))));
  if (indices.length !== 1) return;
  const index = indices[0];
  const indexState = (index.value as {state:string}).state;
  const value = locals.find(local => (local.value as {op?:string})?.op === 'at' &&
    JSON.stringify(local.value).includes(JSON.stringify({local:index.id})));
  const bounds=locals.flatMap(local=>{
    const expression=local.value as any;
    return expression?.op==='and' ? expression.args : [expression];
  }).filter(expression=>expression?.op==='lt' && expression.args?.[0]?.local===index.id && expression.args?.[1]?.state);
  const capIds=[...new Set(bounds.map(expression=>expression.args[1].state as string).filter(id=>base.initialState[id]===capacity))];
  const capId=capIds.length===1 ? capIds[0] : undefined;
  if (!value || !capId || base.initialState[capId] !== capacity || base.initialState[indexState] !== 0) return;
  const nextUpdate = write.updates.find(update => update.target === indexState);
  const nextId = (nextUpdate?.value as {local?:string})?.local;
  if (!nextId) return;
  const scene = structuredClone(base), paths: string[] = [];
  const loaded = scene.actions.find(action => action.id === load.id)!;
  const writing = scene.actions.find(action => action.id === write.id)!;
  const state = (id:string) => ({state:id}), local = (id:string) => ({local:id});
  const op = (name:string,...args:any[]) => ({op:name,args});
  const bytes = op('utf8',{input:input.id}), length = op('length',bytes);
  const setUpdate = (action:typeof loaded, id:string, value:any) => {
    const update = action.updates.find(item => item.target === id && item.index === undefined);
    if (!update) return false;
    if (JSON.stringify(update.value) !== JSON.stringify(value)) {
      update.value = value;
      paths.push(`/actions/@${action.id}/updates/@${id}/value`);
    }
    return true;
  };
  const prepared = op('concatArrays',op('concatArrays',Array(capacity).fill(0),ebp),ret);
  const preparedId=(loaded.updates.find(update=>update.target===target)?.value as {local?:string})?.local;
  const preparedLocal=loaded.locals?.find(item=>item.id===preparedId);
  const shared=preparedId && JSON.stringify({locals:loaded.locals?.filter(item=>item.id!==preparedId),feedback:loaded.feedback,
    updates:loaded.updates.filter(update=>update.target!==target)}).includes(JSON.stringify(local(preparedId)));
  if(preparedLocal && !shared){preparedLocal.value=prepared;paths.push(`/actions/@${load.id}/locals/@${preparedId}/value`);}
  else setUpdate(loaded,target,prepared);
  if(Array.isArray(ebp))for(const update of loaded.updates.filter(item=>/ebp/i.test(item.target) && Array.isArray(base.initialState[item.target])))
    setUpdate(loaded,update.target,ebp);
  if(Array.isArray(ret))for(const update of loaded.updates.filter(item=>/retaddr|return/i.test(item.target) && Array.isArray(base.initialState[item.target])))
    setUpdate(loaded,update.target,ret);
  writing.locals!.find(item => item.id === value.id)!.value = op('at',bytes,local(index.id));
  paths.push(`/actions/@${write.id}/locals/@${value.id}/value`);
  const rewriteLimit = (node:any):any => {
    if (!node || typeof node !== 'object') return node;
    if (['lt','gte','eq'].includes(node.op) && Array.isArray(node.args) && node.args.length === 2 &&
        [state(indexState),local(nextId)].some(item => JSON.stringify(item) === JSON.stringify(node.args[0])) &&
        JSON.stringify(node.args[1]) === JSON.stringify(op('length',state(target))))
      return {...node,args:[node.args[0],length]};
    if (node.op==='if' && node.args?.[1]==='return_overwritten' && node.args?.[2]==='buffer_only')
      return {...node,args:[op('gte',local(index.id),capacity+4),node.args[1],node.args[2]]};
    return Array.isArray(node) ? node.map(rewriteLimit) : Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewriteLimit(value)]));
  };
  for (const key of ['enabledWhen','repeatWhile'] as const) {
    writing[key] = rewriteLimit(writing[key]); paths.push(`/actions/@${write.id}/${key}`);
  }
  for (const item of writing.locals!) {
    const next = rewriteLimit(item.value);
    if (JSON.stringify(next) !== JSON.stringify(item.value)) {item.value=next;paths.push(`/actions/@${write.id}/locals/@${item.id}/value`);}
    const expression = item.value as any;
    if (expression?.op === 'if' && expression.args?.[0]?.op === 'eq' && expression.args?.[2]?.state &&
        JSON.stringify(expression.args[0].args?.[0]) === JSON.stringify(local(index.id))) {
      const offset = expression.args[0].args?.[1];
      if (offset?.op === 'add' && offset.args?.[0]?.state === capId && offset.args[1] >= 4 && offset.args[1] <= 7)
        setUpdate(loaded,expression.args[2].state,op('at',ret,offset.args[1]-4));
    }
    if (expression?.op === 'if' && expression.args?.[1]?.op === 'readLE' && expression.args?.[2]?.state)
      setUpdate(loaded,expression.args[2].state,op('readLE',ret,0,4));
  }
  const eipLocal=writing.locals!.find(item=>(item.value as any)?.op==='if' &&
    (item.value as any).args?.[1]?.op==='readLE' && (item.value as any).args?.[2]?.state);
  const eip=(eipLocal?.value as any)?.args?.[2]?.state;
  const numericQuestions=scene.questions.filter(question=>/EIP/i.test(question.prompt) && /十六进制|0x/i.test(question.prompt) &&
    !scene.views.some(view=>view.id===question.evidenceView && view.kind==='value' && view.format==='hex'));
  if (eip && numericQuestions.length) {
    let id='eipAnswerEvidence';while(scene.views.some(view=>view.id===id))id+='X';
    scene.views.push({id,title:'当前 EIP 候选值',kind:'value',format:'hex',value:state(eip),
      caption:'只预览返回地址四个字节的小端值；核对题填写这个地址，没有执行真实 CPU 的 ret。'});
    paths.push('/views/-');
    for(const question of numericQuestions){question.evidenceView=id;paths.push(`/questions/@${question.id}/evidenceView`);}
  }
  for (const update of writing.updates.filter(item=>/overflow/i.test(item.target))) {
    const initial = base.initialState[update.target];
    if (initial === 0 || initial === false)
      setUpdate(writing,update.target,op('if',op('gte',local(index.id),capacity),initial === false ? true : 1,state(update.target)));
  }
  for(const update of writing.updates.filter(item=>/crash.?risk/i.test(item.target))) {
    const initial=base.initialState[update.target];
    if(initial===false || initial===0)setUpdate(writing,update.target,
      op('if',op('gte',local(index.id),capacity+4),initial===false ? true : 1,state(update.target)));
  }
  if (!writing.updates.some(update => update.target === target)) {
    writing.updates.push({target,index:local(index.id),value:local(value.id)});
    paths.push(`/actions/@${write.id}/updates/-`);
  }
  const code = scene.views.find(view => view.kind === 'code' && typeof view.value === 'string');
  if (code) {
    code.value=`load_frame():\n  buffer[0..${capacity-1}] = 0\n  saved_ebp = original_ebp\n  return_addr = original_return\n\nfor i in range(len(ASCII(payload))):\n  memory[i] = ASCII(payload)[i]\n  if i >= ${capacity+4}:\n    mark_teaching_crash_risk()\n\neip_preview = read_LE(memory[${capacity+4}..${capacity+7}])`;
    const active = code.activeIndex as any;
    const activeState=active?.state ?? (active?.op==='sub' && active.args?.[1]===1 ? active.args?.[0]?.state : undefined);
    if(!activeState)return;
    setUpdate(writing,activeState,active?.state ? 6 : 7);
    setUpdate(loaded,activeState,active?.state ? 1 : 2);
    code.markedIndices=[7,8];
    code.caption='第7行对应本次单步写入；第8、9行标记返回地址区域被覆盖后的教学风险，未执行真实CPU的ret。';
    paths.push(`/views/@${code.id}/value`,`/views/@${code.id}/caption`,`/views/@${code.id}/markedIndices`);
  }
  const display = scene.views.find(view => view.id === memory.id)!;
  if (display.regions?.length === 3 && display.regions.every((region,index) => region.start === [0,capacity,capacity+4][index])) {
    display.regions.forEach((region,index) => {region.end=[capacity-1,capacity+3,capacity+7][index];paths.push(`/views/@${display.id}/regions/${index}/end`);});
  }
  if (!scene.views.some(view => /EBP/i.test(view.title))) {
    let id='savedEbpEvidence'; while(scene.views.some(view=>view.id===id))id+='X';
    scene.views.push({id,title:'保存的 EBP',kind:'value',value:op('if',op('eq',op('length',state(target)),capacity+8),
      op('hex',op('readLE',state(target),capacity,4),8),'待装载'),caption:'按小端读取实际内存中的四个字节，随写入更新。'});
    paths.push('/views/-');
  }
  const mirrors=normalizeByteMemoryMirrors(request,scene);
  const result=mirrors?.scene ?? scene;
  validateRequestedByteMemoryTransitions(request,result);
  if (JSON.stringify(result) === JSON.stringify(base)) return;
  return {scene:result,changedPaths:[...new Set([...paths,...mirrors?.changedPaths ?? []])]};
}

function normalizeByteMemoryMirrors(request: Record<string, unknown>, base: ProcessScene) {
  const capacity=requestedCapacity(request);
  if(!capacity)return;
  const view=base.views.find(item=>item.kind==='array' && item.format==='byte' && (item.value as any)?.state);
  if(!view)return;
  const target=(view.value as {state:string}).state;
  const load=base.actions.find(action=>!action.repeatWhile && action.updates.some(update=>update.target===target));
  const write=base.actions.find(action=>action.repeatWhile && action.updates.some(update=>update.target===target && update.index!==undefined));
  if(!load || !write)return;
  const preparedEngine=createProcessEngine(base);
  preparedEngine.act(load.id);
  const preparedState=preparedEngine.getState().state;
  const eipLocal=write.locals?.find(item=>(item.value as any)?.op==='if' &&
    (item.value as any).args?.[1]?.op==='readLE' && (item.value as any).args?.[2]?.state);
  const eip=(eipLocal?.value as any)?.args?.[2]?.state;
  const scene=structuredClone(base), paths:string[]=[];
  const memoryWrite=write.updates.find(update=>update.target===target && update.index!==undefined)!;
  const op=(name:string,...args:any[])=>({op:name,args});
  const after=op('concatArrays',op('concatArrays',op('slice',{state:target},0,memoryWrite.index),op('array',memoryWrite.value)),
    op('slice',{state:target},op('add',memoryWrite.index,1),capacity+8));
  const prepared=load.updates.find(update=>update.target===target)!.value;
  for(const action of scene.actions.filter(action=>action.id===load.id || action.id===write.id)) {
    const bytes=action.id===load.id ? prepared : after;
    for(const update of action.updates) {
      let value:unknown;
      if(Array.isArray(base.initialState[update.target]) && /ebp/i.test(update.target))value=op('slice',bytes,capacity,capacity+4);
      else if(Array.isArray(base.initialState[update.target]) && /ret|return/i.test(update.target) &&
          Array.isArray(preparedState[update.target]) && (preparedState[update.target] as unknown[]).length===4)
        value=op('slice',bytes,capacity+4,capacity+8);
      else if(update.target===eip)
        value=op('readLE',bytes,capacity+4,4);
      if(value && JSON.stringify(value)!==JSON.stringify(update.value)) {
        update.value=value as any;paths.push(`/actions/@${action.id}/updates/@${update.target}/value`);
      }
    }
  }
  for(const region of scene.views.find(item=>item.id===view.id)!.regions ?? []) {
    const index=[0,capacity,capacity+4].indexOf(region.start as number);
    if(index>=0 && typeof region.end==='number')region.end=[capacity-1,capacity+3,capacity+7][index];
  }
  const questions=scene.questions.filter(question=>/EIP/i.test(question.prompt) && /十六进制|0x/i.test(question.prompt) &&
    !scene.views.some(view=>view.id===question.evidenceView && view.kind==='value' && view.format==='hex'));
  if(eip && questions.length){
    let id='eipAnswerEvidence';while(scene.views.some(view=>view.id===id))id+='X';
    scene.views.push({id,title:'当前 EIP 候选值',kind:'value',value:{state:eip},format:'hex',caption:'按实际返回地址字节计算，未执行真实 CPU 的 ret。'});
    questions.forEach(question=>{question.evidenceView=id;});
    paths.push('/views/-');
  }
  if(JSON.stringify(scene)===JSON.stringify(base))return;
  validateRequestedByteMemoryTransitions(request,scene);
  return {scene,changedPaths:paths};
}

export function normalizeRequestedByteMemoryPackage(request: Record<string, unknown>, candidate: unknown): unknown | undefined {
  const capacity = requestedCapacity(request);
  if (!capacity || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
  const pkg = candidate as {scene?:ProcessScene;tests?:any[]};
  if (!pkg.scene || !Array.isArray(pkg.tests)) return;
  const normalized = normalizeRequestedByteMemoryWorkflow(request,pkg.scene);
  const mirrors=normalizeByteMemoryMirrors(request,normalized?.scene ?? pkg.scene);
  const scene = mirrors?.scene ?? normalized?.scene ?? pkg.scene;
  validateRequestedByteMemoryTransitions(request,scene);
  const view = scene.views.find(item=>item.kind==='array' && item.format==='byte' && (item.value as any)?.state);
  const input = scene.inputs.find(item=>item.type==='text' && item.ascii);
  if (!view || !input) return;
  const target=(view.value as {state:string}).state;
  const load=scene.actions.find(action=>!action.repeatWhile && action.updates.some(update=>update.target===target));
  const write=scene.actions.find(action=>action.repeatWhile && action.updates.some(update=>update.target===target));
  const eipLocal=write?.locals?.find(item=>(item.value as any)?.op==='if' &&
    (item.value as any).args?.[1]?.op==='readLE' && (item.value as any).args?.[2]?.state);
  const eip=(eipLocal?.value as any)?.args?.[2]?.state;
  const sceneChanged=JSON.stringify(scene)!==JSON.stringify(pkg.scene);
  if (!load || !write || !eip) return sceneChanged ? {...pkg,scene} : undefined;
  let changed = sceneChanged;
  const tests=structuredClone(pkg.tests);
  const requestText=[request.originalRequest,request.description].filter(value=>typeof value==='string').join('\n');
  const explicitReturnRisk=/返回地址(?:被)?覆盖后[^。；\n]*崩溃风险/.test(requestText);
  for (const test of tests) {
    const payload=test.inputs?.[input.id];
    const steps=test.actions?.slice(1) ?? [];
    const untilDone=steps.at(-1)?.count==='untilDone';
    const count=steps.reduce((sum:number,step:any)=>sum+(Number.isInteger(step.count)?step.count:0),0);
    if (typeof payload!=='string' || !/^[\x20-\x7E]*$/.test(payload) || payload.length>(input.maxLength ?? 64) ||
        !steps.length || test.actions[0].id!==load.id || test.actions[0].count!==1 ||
        steps.some((step:any,index:number)=>step.id!==write.id || !(Number.isInteger(step.count) && step.count>0 ||
          index===steps.length-1 && step.count==='untilDone')) ||
        (untilDone ? count>=payload.length : count!==payload.length)) continue;
    const engine=createProcessEngine(scene);engine.reset(test.inputs);engine.act(load.id);
    const prepared=engine.getState().state;
    const expected=[...engine.getState().state[target] as number[]];
    for(let index=0;index<payload.length;index++)expected[index]=payload.charCodeAt(index);
    for(let index=0;index<payload.length;index++)engine.act(write.id);
    const state=engine.getState().state;
    const predicted=expected.slice(capacity+4,capacity+8).reduce((sum,byte,index)=>sum+byte*2**(8*index),0);
    if (JSON.stringify(state[target])!==JSON.stringify(expected) || state[eip]!==predicted) continue;
    const returnBytes=expected.slice(capacity+4,capacity+8), written=Math.max(0,payload.length-capacity-4);
    for(const expectation of test.expect ?? []) {
      const id=expectation.value?.state;
      if(typeof id==='string' && /ret|return/i.test(id) && Array.isArray(prepared[id]) &&
          (prepared[id] as unknown[]).length===4 && Array.isArray(expectation.equals) && expectation.equals.length===written && written<4 &&
          JSON.stringify(expectation.equals)===JSON.stringify(returnBytes.slice(0,written)) &&
          JSON.stringify(state[id])===JSON.stringify(returnBytes)) {expectation.equals=returnBytes;changed=true;}
    }
    if (!test.expect?.some((item:any)=>item.value?.state===target && JSON.stringify(item.equals)===JSON.stringify(expected))) continue;
    for(const expectation of test.expect) if(expectation.value?.state===eip && typeof expectation.equals==='number' &&
        expectation.equals!==predicted) {expectation.equals=predicted;changed=true;}
    if(explicitReturnRisk)for(const expectation of test.expect) {
      const id=expectation.value?.state;
      if(typeof id!=='string' || !/crash.?risk/i.test(id) || !write.updates.some(update=>update.target===id))continue;
      const risk=typeof scene.initialState[id]==='boolean' ? payload.length>capacity+4 : Number(payload.length>capacity+4);
      if(state[id]===risk && typeof expectation.equals===typeof risk && expectation.equals!==risk){expectation.equals=risk;changed=true;}
    }
  }
  return changed ? {...pkg,scene,tests} : undefined;
}

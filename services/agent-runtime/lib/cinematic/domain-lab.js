globalThis.AISecCinematicDomainBindingValue = function(property,value){
  if(property==='scale'&&Array.isArray(value)){
    if(value.length!==3||value.some(axis=>typeof axis!=='number'||!Number.isFinite(axis)||axis<.05||axis>5))throw Error('三维缩放必须为三个0.05至5的有限数值');
    return [...value];
  }
  if(typeof value!=='number'||!Number.isFinite(value))throw Error('三维绑定必须为有限数值');
  if(property==='rotationY')return value%(2*Math.PI);
  const [min,max]=['opacity','colorMix'].includes(property)?[0,1]:property==='emissive'?[0,10]:property==='scale'?[.05,5]:[-200,200];
  if(value<min||value>max)throw Error('三维绑定超出范围');return value;
};
// A repeatable observation of the current result, rather than an accumulating
// simulation. No frame-rate-dependent integration or model-authored JavaScript.
globalThis.AISecCinematicDomainRotation = function(angle,speed,time){
  if(![angle,speed,time].every(Number.isFinite))throw Error('三维运动必须为有限数值');
  return (angle+speed*time)%(2*Math.PI);
};
globalThis.AISecCinematicDomainLab = function ({ lab, root, invalidate, onChange }) {
  if (!lab) return null;
  const scene = lab.model.scene;
  const engine = globalThis.AISecProcessEngine(scene);
  const make = (tag, parent, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  };
  const decisions = make('section',root,undefined,'decision-panel');
  const controls = make('div',root,undefined,'domain-lab-controls');
  const evidence = make('section',root,undefined,'domain-lab-evidence');
  evidence.setAttribute('aria-label','当前实验读数与证据');
  const readings = scene.views.filter(view=>['value','text'].includes(view.kind)).map(view=>{
    const panel=make(view.kind==='text'?'details':'div',evidence,undefined,'domain-reading domain-reading-'+view.kind);
    panel.dataset.view=view.id;make(view.kind==='text'?'summary':'h3',panel,view.title);
    return {view,output:make('output',panel)};
  });
  evidence.hidden=!readings.length;
  const feedback = make('output',root,undefined,'domain-lab-feedback');
  feedback.setAttribute('aria-live','polite');
  const modelNote=make('details',root,undefined,'domain-model-note');make('summary',modelNote,'实验模型与条件');make('p',modelNote,scene.modelNote);
  if(lab.bindings.some(binding=>binding.property==='rotationSpeedY'))make('p',modelNote,'运动观察：播放、单步或回拖查看当前方案。每次改变条件、选择或撤销后，观察时间回到 0；比较方案时请使用相同时间。','domain-motion-note');
  const explanation=make('details',root,undefined,'domain-lab-explanation');
  make('summary',explanation,'观察与解释');
  const explanationTitle=make('h3',explanation),explanationCopy=make('p',explanation);
  const errors = make('p',root,undefined,'domain-lab-error');errors.setAttribute('role','alert');
  const fields = [];
  function perform(callback) {
    try { callback();onChange?.();errors.textContent=''; }
    catch (error) {errors.textContent=error.message;}
    render();invalidate();
  }
  for (const input of scene.inputs) {
    const singleChoice=input.type==='select'&&input.options.length===1;
    const label=make('label',controls,input.label + (!singleChoice&&input.mode==='live'?' · 实时':''));
    const readout=['range','number'].includes(input.type)?make('output',label,undefined,'domain-input-value'):null;
    const field=make(singleChoice?'span':input.type==='select'?'select':'input',label);
    field.id='input-'+input.id;
    if(readout)readout.htmlFor=field.id;
    if (input.type==='select'&&!singleChoice) for(const [index,option] of input.options.entries())make('option',field,option.label).value=String(index);
    else if(!singleChoice) {field.type=input.type==='toggle'?'checkbox':input.type;
      for(const key of ['min','max','step','maxLength'])if(input[key]!==undefined)field[key]=input[key];}
    field.oninput=()=>perform(()=>engine.setInput(input.id,input.type==='toggle'?field.checked:input.type==='select'?input.options[Number(field.value)].value:['number','range'].includes(input.type)?Number(field.value):field.value));
    fields.push({input,field,readout});
  }
  const actions=make('div',controls,undefined,'domain-lab-actions');
  const buttons=[];
  for(const action of scene.actions){
    if(scene.decisions.some(decision=>decision.choices.includes(action.id)))continue;
    const button=make('button',actions,action.label);button.id='action-'+action.id;button.type='button';
    button.onclick=()=>perform(()=>engine.act(action.id));buttons.push({action,button});
  }
  const back=make('button',actions,'撤销操作');back.id='domain-lab-back';back.onclick=()=>perform(()=>engine.back());
  const reset=make('button',actions,'重置实验');reset.id='domain-lab-reset';reset.onclick=()=>perform(()=>engine.reset());
  const decisionPanel=globalThis.AISecProcessDecisionPanel({scene,engine,container:decisions,perform});
  function render(){
    const snapshot=engine.getState();
    for(const {input,field,readout}of fields){const value=snapshot.inputs[input.id];if(input.type==='toggle')field.checked=value;else field.value=input.type==='select'?String(input.options.findIndex(item=>item.value===value)):String(value);if(readout)readout.value=String(value);}
    for(const {input,field}of fields)if(input.type==='select'&&input.options.length===1)field.textContent=input.options[0].label;
    for(const {action,button}of buttons)button.disabled=!engine.can(action.id);
    for(const {view,output}of readings){
      const awaitingResult=globalThis.AISecProcessAwaitingDecisionResult(scene,engine,view);
      output.textContent=awaitingResult?'等待方案结果':engine.format(engine.evaluate(view.value),view.format);
    }
    back.disabled=!snapshot.history.length;feedback.textContent=snapshot.feedback;
    root.dataset.phase=String(snapshot.count);decisionPanel();
    const stage=scene.stages.find(stage=>engine.evaluate(stage.when)===true);
    explanationTitle.textContent=stage?.title??'';explanationCopy.textContent=stage?.explanation??'';
  }
  function values(){
    return lab.bindings.map(binding=>{
      const value=globalThis.AISecCinematicDomainBindingValue(binding.property,engine.evaluate(binding.value));
      return {...binding,value};
    });
  }
  function pick(node){const selection=lab.picks?.find(item=>item.node===node);if(!selection)return false;perform(()=>engine.pick(selection.view,selection.index));return true;}
  render();
  return {getState:engine.getState,decisions:engine.decisionState,values,pick,
    reset:()=>perform(()=>engine.reset()),
    setInput:(id,value)=>perform(()=>engine.setInput(id,value)),
    stage:()=>scene.stages.find(stage=>engine.evaluate(stage.when)===true)};
};

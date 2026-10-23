// Presentation-only authoring may rename compiled result views. Readiness
// follows the observed field of the compiler's single-decision contract.
globalThis.AISecProcessAwaitingDecisionResult = function (scene,engine,view) {
  const decision=scene.decisions?.length===1?scene.decisions[0]:undefined;
  return decision?.id==='studentDecision'&&scene.initialState.phase===0&&
    view.value&&typeof view.value==='object'&&!Array.isArray(view.value)&&typeof view.value.state==='string'&&
    decision.observe.some(item=>item.field===view.value.state)&&!engine.decisionState().current;
};
globalThis.AISecProcessDecisionPanel = function ({ scene, engine, container, perform }) {
  const make = (tag, parent, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  };
  let signature = '';
  const describeInputs=inputs=>scene.inputs.map(input=>{
    const value=inputs[input.id],label=input.options?.find(option=>option.value===value)?.label;
    return input.label+'：'+(label??engine.format(value));
  }).join('；');
  return function renderDecisionPanel() {
    const state = engine.decisionState();
    const inputs=engine.getState().inputs;
    const nextSignature = JSON.stringify([state,inputs]);
    container.hidden = !(scene.decisions || []).length;
    if (signature === nextSignature) return;
    signature = nextSignature;
    const focused = document.activeElement?.id;
    const previouslyPending = container.dataset.pending === 'true';
    container.replaceChildren();
    const decision = state.pending[0] || (state.current && scene.decisions.find(item => item.id === state.current.decision));
    if (!decision) {
      make('h2', container, '观察情境，准备作出决策');
      make('p', container, '执行领域操作后，选择将随当前情境出现。', 'muted');
      return;
    }
    container.dataset.decision = decision.id;
    container.dataset.pending = String(!!state.pending.length);
    make('span', container, state.pending.length ? '轮到你作出决策' : '观察你的选择带来的变化', 'eyebrow');
    // Authors sometimes omit the explicit input prefix. Resolve only known
    // input IDs, using the same visible value/option label; never evaluate text.
    const prompt=decision.prompt.replace(/\{(?:input:)?([A-Za-z][A-Za-z0-9_-]*)\}/g,(original,id)=>{
      const input=scene.inputs.find(item=>item.id===id);
      return input?input.options?.find(option=>option.value===inputs[id])?.label??engine.format(inputs[id]):original;
    });
    make('h2', container, prompt);
    if (state.pending.length) {
      const choices = make('div', container, undefined, 'decision-choices');
      for (const choice of decision.choices) {
        const action = scene.actions.find(item => item.id === choice);
        const button = make('button', choices, undefined, 'decision-choice');
        button.id = 'action-' + choice;
        button.type = 'button';
        button.disabled = !engine.can(choice);
        make('strong', button, action.label);
        make('span', button, action.description);
        button.onclick = () => perform(() => engine.act(choice));
      }
    } else {
      const action = scene.actions.find(item => item.id === state.current.action);
      make('p', container, '本次选择：' + action.label, 'decision-selected');
    }
    if (state.current) {
      make('p',container,'本次结果的条件：'+describeInputs(state.current.inputs),'muted decision-result-context');
      if(state.current.conditionsChanged){
        make('p',container,'条件或对象已改变。当前结果仍对应上一次选择；请用新条件重新作出决定。','decision-conditions-changed');
        const trial=make('button',container,'用当前条件再试','decision-reconsider');
        trial.id='process-new-trial';trial.type='button';trial.onclick=()=>perform(()=>engine.beginTrial());
      }
      const reconsider = make('button', container, '回到这个决策点，尝试另一方案', 'decision-reconsider');
      reconsider.id = 'process-reconsider';
      reconsider.type = 'button';
      reconsider.onclick = () => perform(() => engine.reconsider());
    }
    const key = state.pending[0]?.originKey || state.current?.originKey;
    const results = state.comparisons.filter(item => item.originKey === key);
    if (state.current?.originKey === key) results.push(state.current);
    if (results.length) {
      const wrapper = make('div', container, undefined, 'decision-results');
      const table = make('table', wrapper);
      const caption = make('caption', table, results.length > 1 ? '同一起点 · 方案结果比较' : '本次选择 · 结果证据');
      caption.id = 'process-comparison-title';
      const head = make('tr', make('thead', table));
      make('th', head, '可见证据').scope = 'col';
      for (const result of results) make('th', head, scene.actions.find(item => item.id === result.action).label).scope = 'col';
      const body = make('tbody', table);
      for (const observation of decision.observe) {
        const row = make('tr', body);
        make('th', row, observation.label).scope = 'row';
        const values = results.map(item => item.values[observation.field]);
        row.classList.toggle('result-different', new Set(values.map(value => JSON.stringify(value))).size > 1);
        for (const value of values) make('td', row, engine.format(value));
      }
      if (results.length > 1) make('p', wrapper, '这些结果从相同的状态和实验条件开始。继续操作可观察后续影响。', 'muted');
    }
    const previous=state.comparisons.filter(item=>item.decision===decision.id&&item.originKey!==key);
    if(previous.length){
      const archive=make('details',container,undefined,'decision-past-results');
      make('summary',archive,'其他条件下的实验记录（'+previous.length+'）');
      for(const result of previous){
        const entry=make('section',archive);
        make('h3',entry,scene.actions.find(item=>item.id===result.action).label);
        make('p',entry,describeInputs(result.inputs),'muted');
        make('p',entry,decision.observe.map(item=>item.label+'：'+engine.format(result.values[item.field])).join('；'));
      }
    }
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
    if (state.pending.length && !previouslyPending && engine.getState().count > 0)
      container.scrollIntoView({block:'center',behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
};

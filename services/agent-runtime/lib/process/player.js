(function () {
  const scene = JSON.parse(document.getElementById('process-scene').textContent);
  const engine = globalThis.AISecProcessEngine(scene),
    byId = (id) => document.getElementById(id);
  const root = document.querySelector('[data-process]');
  const fields = [],
    actions = [],
    stages = [],
    views = [],
    questions = [];
  let running = null,
    timer = null,
    previousViews = [],
    previousTopologyEdges = [],
    runSteps = 0,
    renderedCount = -1;
  const make = (tag, parent, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    if (parent) parent.append(element);
    return element;
  };
  function stop() {
    clearTimeout(timer);
    timer = null;
    running = null;
  }
  function error(err) {
    stop();
    byId('process-error').textContent = err.message;
    root.dataset.error = err.message;
    render();
  }
  function perform(callback) {
    try {
      byId('process-error').textContent = '';
      delete root.dataset.error;
      callback();
      render();
    } catch (err) {
      error(err);
    }
  }
  const renderDecisions = globalThis.AISecProcessDecisionPanel({ scene, engine,
    container: byId('process-decisions'), perform: callback => perform(() => { stop(); callback(); }) });
  for (const input of scene.inputs) {
    const singleChoice=input.type==='select'&&input.options.length===1;
    const field = make('label', byId('process-inputs'), undefined, 'field');
    make('span', field, input.label + (singleChoice?'':input.mode === 'live' ? ' · 实时' : ' · 重新开始'), 'field-label');
    const element = make(singleChoice?'span':input.type === 'select' ? 'select' : 'input', field);
    element.id = 'input-' + input.id;
    if (input.type === 'select'&&!singleChoice)
      input.options.forEach((option, i) => {
        const opt = make('option', element, option.label);
        opt.value = String(i);
      });
    else if(!singleChoice) {
      element.type = input.type === 'toggle' ? 'checkbox' : input.type;
      if (input.min !== undefined) element.min = input.min;
      if (input.max !== undefined) element.max = input.max;
      if (input.step !== undefined) element.step = input.step;
      if (input.type === 'text') element.maxLength = input.maxLength ?? 64;
    }
    const output = make('output', field);
    output.hidden=singleChoice;
    element.addEventListener('input', () =>
      perform(() => {
        stop();
        const value =
          input.type === 'toggle'
            ? element.checked
            : input.type === 'select'
              ? input.options[Number(element.value)].value
              : ['number', 'range'].includes(input.type)
                ? Number(element.value)
                : element.value;
        engine.setInput(input.id, value);
        if (input.mode !== 'live') { previousViews = []; previousTopologyEdges = []; }
      }),
    );
    const presets = make('div', field, undefined, 'presets');
    for (const [presetIndex, preset] of (input.presets || []).entries()) {
      const button = make('button', presets, preset.label);
      button.type = 'button';
      button.id = 'preset-' + input.id + '-' + presetIndex;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        perform(() => {
          stop();
          engine.setInput(input.id, preset.value);
          if (input.mode !== 'live') { previousViews = []; previousTopologyEdges = []; }
        });
      });
    }
    fields.push({ input, element, output });
  }
  function start(id) {
    stop();
    running = id;
    runSteps = 0;
    tick();
  }
  function tick() {
    if (!running) return;
    perform(() => {
      if (!engine.repeatable(running)) {
        stop();
        return;
      }
      if (runSteps++ >= 256) throw Error('连续执行达到256步限制，请检查条件后重置');
      engine.act(running);
      if (!engine.repeatable(running)) stop();
    });
    if (running) timer = setTimeout(tick, Number(byId('process-speed').value));
  }
  for (const action of scene.actions) {
    if ((scene.decisions || []).some(decision => decision.choices.includes(action.id))) continue;
    const item = make('div', byId('process-actions'), undefined, 'action-item');
    make('h3', item, action.label);
    make('p', item, action.description);
    const buttons = make('div', item, undefined, 'action-buttons');
    const step = make(
      'button',
      buttons,
      action.repeatWhile === undefined ? action.label : '执行一步',
    );
    step.id = 'action-' + action.id;
    step.addEventListener('click', () =>
      perform(() => {
        stop();
        engine.act(action.id);
      }),
    );
    let auto;
    if (action.repeatWhile !== undefined) {
      auto = make('button', buttons, undefined, 'icon-button');
      auto.type = 'button';
      auto.setAttribute('aria-label', '连续执行：' + action.label);
      auto.title = '连续执行：' + action.label;
      auto.append(byId('process-play-icon').content.cloneNode(true));
      auto.id = 'auto-' + action.id;
      auto.addEventListener('click', () => perform(() => start(action.id)));
    }
    actions.push({ action, step, auto });
  }
  for (const stage of scene.stages)
    stages.push({ stage, element: make('span', byId('process-stages'), stage.title) });
  for (const view of scene.views) {
    const parent = root.dataset.layout === 'code-lab' && view.kind === 'code'
      ? byId('process-leading-views') : byId('process-views');
    const section = make('section', parent, undefined, 'view-' + view.kind);
    section.dataset.view = view.id;
    make('h2', section, view.title);
    views.push({ view, element: make('div', section) });
    if (view.caption) make('p', section, view.caption, 'view-caption');
  }
  for (const question of scene.questions) {
    // Questions follow the domain workspace; the main decision belongs next
    // to scene evidence, before auxiliary readings and long explanation.
    const field = make('div', byId('process-questions'), undefined, 'question');
    const label = make('label', field, question.prompt);
    label.htmlFor = 'answer-' + question.id;
    const input = make('input', field);
    input.id = 'answer-' + question.id;
    input.maxLength = 4000;
    const button = make('button', field, '核对观察');
    button.id = 'check-' + question.id;
    const output = make('output', field);
    output.setAttribute('aria-live', 'polite');
    button.addEventListener('click', () =>
      perform(() => {
        const correct = engine.verify(question.id, input.value);
        output.textContent = correct
          ? '与当前证据一致。请再改变输入比较结果。'
          : '与当前证据不一致，请查看“' +
            scene.views.find((view) => view.id === question.evidenceView).title +
            '”再核对。';
        output.dataset.correct = String(correct);
      }),
    );
    questions.push({
      input,
      output,
      signature: '',
      view: scene.views.find((view) => view.id === question.evidenceView),
    });
  }
  if (!questions.length) byId('process-questions').hidden = true;
  if(root.dataset.layout==='decision-lab'){
    const main=byId('process-views');
    const evidence=views.find(item=>item.view.pick)||views.find(item=>['topology','array','code'].includes(item.view.kind))||views[0];
    if(evidence){
      const panel=evidence.element.closest('section');main.prepend(panel);
      const facts=views.find(item=>item.view.id==='decision-evidence'&&item.view.kind==='text');
      if(facts){const detail=facts.element.closest('section');panel.after(detail);detail.after(byId('process-decisions'));}
      else panel.after(byId('process-decisions'));
    }
  }
  function bindPick(element, view, position, label) {
    if (!view.pick) return;
    element.classList.add('process-pick');
    element.dataset.pickIndex = String(position);
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', '选择' + label);
    const select = () => perform(() => {
      stop();
      engine.pick(view.id, position);
    });
    element.onclick = select;
    element.onkeydown = event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(); }
    };
  }
  function render() {
    const focusedPick = document.activeElement?.closest('[data-view]');
    const focus = focusedPick && document.activeElement.dataset.pickIndex !== undefined
      ? { view: focusedPick.dataset.view, index: document.activeElement.dataset.pickIndex } : null;
    const snapshot = engine.getState();
    root.dataset.processState = String(snapshot.count);
    root.dataset.running = String(!!running);
    fields.forEach(({ input, element, output }) => {
      const value = snapshot.inputs[input.id];
      if(input.type==='select'&&input.options.length===1)element.textContent=input.options[0].label;
      if (input.type === 'toggle') element.checked = value;
      else
        element.value =
          input.type === 'select'
            ? String(input.options.findIndex((option) => option.value === value))
            : String(value);
      const display = input.type === 'select'
        ? input.options.find(option => option.value === value)?.label ?? String(value)
        : input.type === 'toggle' ? value ? '开启' : '关闭' : String(value);
      output.textContent = '当前值：' + display;
    });
    actions.forEach(({ action, step, auto }) => {
      step.disabled = !!running || !engine.can(action.id);
      if (auto) auto.disabled = !!running || !engine.repeatable(action.id);
    });
    byId('process-pause').disabled = !running;
    byId('process-back').disabled = !snapshot.history.length;
    byId('process-progress').textContent =
      '已执行 ' + snapshot.count + ' 步 · ' + (running ? '正在连续执行' : '等待你的操作');
    const active = stages.filter(({ stage }) => engine.evaluate(stage.when) === true);
    const activeStageIndex=stages.findIndex(({element})=>active[0]?.element===element);
    stages.forEach(({element},index)=>{
      element.setAttribute('aria-current',String(active[0]?.element===element));
      element.classList.toggle('complete',activeStageIndex>=0&&index<activeStageIndex);
    });
    root.dataset.stageId=active[0]?.stage.id||'';
    root.dataset.terminal=String(snapshot.count>0&&scene.actions.every(action=>!engine.can(action.id)));
    const stateChanged = renderedCount >= 0 && renderedCount !== snapshot.count;
    if(stateChanged){root.classList.remove('state-shift');void root.offsetWidth;root.classList.add('state-shift');}
    renderedCount=snapshot.count;
    byId('process-stage-title').textContent = active[0]?.stage.title || '观察当前状态';
    byId('process-stage-explanation').textContent = active[0]?.stage.explanation || '';
    byId('process-feedback').textContent =
      snapshot.feedback || '先调整实验条件，再执行一步，观察右侧的变化。';
    for (const [n, { view, element }] of views.entries()) {
      const value = engine.evaluate(view.value),
        activeIndex = engine.markers(view.id).activeIndex,
        rawMarked = engine.markers(view.id).markedIndices,
        itemCount = view.kind === 'code' ? String(value).split('\n').length : Array.isArray(value) ? value.length : 0,
        marked = new Set(Array.isArray(rawMarked)
          ? rawMarked.filter(index => Number.isInteger(index) && index >= 0 && index < itemCount)
          : []);
      element.replaceChildren();
      if (view.kind === 'topology') {
        previousTopologyEdges[n] = globalThis.AISecProcessTopology(element,view,value,{
          evaluate:engine.evaluate,running:!!running,activeIndex,marked,
          previousEdges: stateChanged ? previousTopologyEdges[n] : undefined,
        });
        element.querySelectorAll('[data-node]').forEach(node => bindPick(node, view,
          Number(node.dataset.node), view.topology.labels[Number(node.dataset.node)]));
      } else if (view.kind === 'array') {
        const regions=(view.regions||[]).map(region=>{
          const start=typeof region.start==='number'?region.start:engine.evaluate(region.start),
            rawEnd=typeof region.end==='number'?region.end:engine.evaluate(region.end),
            end=typeof region.end==='number'?rawEnd:Number(rawEnd)-1;
          return {...region,start:Number(start),end};
        }).filter(region=>Number.isInteger(region.start)&&Number.isInteger(region.end)&&
          region.start>=0&&region.start<=region.end&&region.end<value.length);
        const cells = make('div', element, undefined, 'cells');
        cells.classList.toggle('object-cells',!!view.pick&&view.format!=='byte'&&
          value.some(item=>typeof item==='string'&&item.length>2));
        const addressBase = view.addressBase === undefined ? undefined : engine.evaluate(view.addressBase);
        if (addressBase !== undefined) cells.classList.add('addressed-cells');
        value.forEach((item, i) => {
          const cell = make('div', cells, undefined, 'cell');
          cell.dataset.index = String(i);
          cell.dataset.value = String(item);
          bindPick(cell, view, i, typeof item==='string'&&view.pick?item:view.title + '第' + (i + 1) + '格');
          cell.classList.toggle('active', i === activeIndex);
          cell.classList.toggle('marked', marked.has(i));
          cell.classList.toggle(
            'changed',
            Array.isArray(previousViews[n]) && previousViews[n][i] !== item,
          );
          const region =
            regions.findIndex((region) => i >= region.start && i <= region.end);
          if (region >= 0) cell.dataset.region = String(region);
          make('small', cell, addressBase === undefined ? '[' + i + ']'
            : (addressBase + i).toString(16).padStart(8, '0'), 'cell-index');
          make('strong', cell, engine.format(item, view.format));
          if (view.format === 'byte')
            make('small', cell, item >= 32 && item <= 126 ? String.fromCharCode(item) : '·');
        });
        const legend = make('div', element, undefined, 'regions');
        for (const region of regions)
          make('span', legend, region.label + ' [' + region.start + '–' + region.end + ']');
      } else if (view.kind === 'bars') {
        const bars = make('div', element, undefined, 'bars'),
          max = Math.max(1, ...value.map(Math.abs));
        value.forEach((item, i) => {
          const wrap = make('div', bars, undefined, 'bar-wrap');
          bindPick(wrap, view, i, view.title + '第' + (i + 1) + '项');
          wrap.classList.toggle('active', i === activeIndex);
          wrap.classList.toggle('marked', marked.has(i));
          make('div', wrap, engine.format(item));
          const bar = make('div', wrap, undefined, 'bar');
          bar.style.height = (Math.abs(item) / max) * 140 + 'px';
          make('small', wrap, String(i));
        });
      } else if (view.kind === 'code') {
        const output = make('pre', element, undefined, 'code-listing');
        const lines = String(value).split('\n');
        const previousLines = typeof previousViews[n] === 'string' ? previousViews[n].split('\n') : [];
        lines.forEach((text, index) => {
          const line = make('span', output, undefined, 'code-line');
          line.dataset.index = String(index);
          line.classList.toggle('active', index === activeIndex);
          line.classList.toggle('marked', marked.has(index));
          line.classList.toggle('changed', stateChanged && typeof previousViews[n] === 'string' && previousLines[index] !== text);
          if (index === activeIndex) line.setAttribute('aria-current', 'step');
          const number = make('span', line, String(index + (view.addressBase===undefined?1:engine.evaluate(view.addressBase))), 'line-number');
          number.setAttribute('aria-hidden', 'true');
          make('code', line, text);
          if (index < lines.length - 1) output.append(document.createTextNode('\n'));
        });
        output.dataset.value = String(value);
      } else {
        const awaitingResult=globalThis.AISecProcessAwaitingDecisionResult(scene,engine,view);
        const display = awaitingResult?'等待方案结果':engine.format(value, view.format);
        const output = make(
          view.kind === 'code' ? 'pre' : 'div',
          element,
          display,
          view.kind === 'value' ? 'value' : 'value-text',
        );
        const prose = typeof value === 'string' && /[\u3400-\u9fff，。；：、\s]/u.test(display);
        if (view.kind === 'value' && (display.length > 34 || prose && display.length > 12)) {
          output.classList.add('value-long');
        }
        if (view.kind === 'value' && prose) output.classList.add('value-prose');
        output.dataset.value = String(value);
      }
      previousViews[n] = value;
    }
    renderDecisions();
    if (focus) {
      const target = views.find(item => item.view.id === focus.view)?.element;
      target?.querySelector('[data-pick-index="' + focus.index + '"]')?.focus({ preventScroll: true });
    }
    byId('process-trace').replaceChildren();
    snapshot.history.slice(-30).forEach((item) => make('li', byId('process-trace'), item.message));
    for (const question of questions) {
      const signature = JSON.stringify([
        snapshot.inputs,
        snapshot.count,
        engine.evaluate(question.view.value),
      ]);
      if (question.signature !== signature) {
        question.input.value = '';
        question.output.textContent = '';
        delete question.output.dataset.correct;
        question.signature = signature;
      }
    }
  }
  byId('process-pause').onclick = () => perform(stop);
  byId('process-back').onclick = () =>
    perform(() => {
      stop();
      engine.back();
    });
  byId('process-reset').onclick = () =>
    perform(() => {
      stop();
      engine.reset();
      previousViews = [];
      previousTopologyEdges = [];
      questions.forEach((q) => {
        q.input.value = '';
        q.output.textContent = '';
      });
    });
  function widgetTarget(selector) {
    if (typeof selector !== 'string' || !selector) return null;
    try { return document.querySelector(selector); } catch { return null; }
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data) return;
    const data = event.data, requested = data.state && typeof data.state === 'object' ? data.state : {};
    if (data.type === 'SET_WIDGET_STATE') {
      perform(() => {
        stop();
        if (requested.inputs && typeof requested.inputs === 'object')
          for (const input of scene.inputs)
            if (Object.hasOwn(requested.inputs, input.id)) engine.setInput(input.id, requested.inputs[input.id]);
        if (requested.answers && typeof requested.answers === 'object')
          for (const question of scene.questions)
            if (Object.hasOwn(requested.answers, question.id)) byId('answer-' + question.id).value = String(requested.answers[question.id]);
        previousViews = [];
        previousTopologyEdges = [];
      });
      if (data.content) byId('process-feedback').textContent = String(data.content);
    } else if (['HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'].includes(data.type)) {
      const target = widgetTarget(data.target);
      if (target && data.type === 'HIGHLIGHT_ELEMENT') {
        target.classList.add('maic-highlight');
        setTimeout(() => target.classList.remove('maic-highlight'), 2600);
      }
      if (target && data.type === 'REVEAL_ELEMENT') target.hidden = false;
      if (data.content && data.type === 'ANNOTATE_ELEMENT') byId('process-feedback').textContent = String(data.content);
    }
  });
  window.addEventListener('pagehide', stop);
  globalThis.__process = {
    markers:engine.markers,
    scene,
    getState: () => ({ ...engine.getState(), running }),
    evaluate: engine.evaluate,
    format: engine.format,
    decisions: engine.decisionState,
    dispose: stop,
  };
  perform(() => {});
})();

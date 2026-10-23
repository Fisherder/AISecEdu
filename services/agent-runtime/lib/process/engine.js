globalThis.AISecProcessEngine = function (config) {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  let state, inputs, history, feedback, count, decisionHistory = [], comparisons = [], decisionSerial = 0;
  const fail = (message) => {
    throw Error(message);
  };
  const finite = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fail('需要有限数值');
  const bool = (value) => (typeof value === 'boolean' ? value : fail('条件必须是布尔值'));
  const array = (value) => (Array.isArray(value) ? value : fail('需要数组'));
  const index = (value, length) =>
    Number.isInteger(value) && value >= 0 && value < length ? value : fail('索引超出模拟范围');
  const bounded = (value) => {
    if (typeof value === 'number') finite(value);
    if (
      (typeof value === 'string' && value.length > 4000) ||
      (Array.isArray(value) && value.length > 128)
    )
      fail('结果超过模拟容量');
    return value;
  };
  function evaluate(expr, current = state, depth = 0, locals = {}) {
    if (depth > 24) fail('表达式过深');
    if (expr === null || typeof expr !== 'object' || Array.isArray(expr)) return copy(expr);
    if (Object.hasOwn(expr, 'state'))
      return Object.hasOwn(current, expr.state) ? copy(current[expr.state]) : fail('未知状态');
    if (Object.hasOwn(expr, 'input'))
      return Object.hasOwn(inputs, expr.input) ? copy(inputs[expr.input]) : fail('未知输入');
    if (Object.hasOwn(expr, 'local'))
      return Object.hasOwn(locals, expr.local) ? copy(locals[expr.local]) : fail('未知局部量');
    const args = expr.args,
      ev = (value) => evaluate(value, current, depth + 1, locals);
    if (expr.op === 'if') return ev(args[bool(ev(args[0])) ? 1 : 2]);
    if (expr.op === 'and') {
      for (const arg of args) if (!bool(ev(arg))) return false;
      return true;
    }
    if (expr.op === 'or') {
      for (const arg of args) if (bool(ev(arg))) return true;
      return false;
    }
    const a = args.map(ev),
      x = a[0],
      y = a[1];
    let result;
    switch (expr.op) {
      case 'add':
        result = finite(x) + finite(y);
        break;
      case 'sub':
        result = finite(x) - finite(y);
        break;
      case 'mul':
        result = finite(x) * finite(y);
        break;
      case 'div':
        if (finite(y) === 0) fail('不能除以零');
        result = finite(x) / y;
        break;
      case 'mod':
        if (finite(y) === 0) fail('不能对零取余');
        result = finite(x) % y;
        break;
      case 'floor':
        result = Math.floor(finite(x));
        break;
      case 'ceil':
        result = Math.ceil(finite(x));
        break;
      case 'round':
        result = Math.round(finite(x));
        break;
      case 'abs':
        result = Math.abs(finite(x));
        break;
      case 'min':
        result = Math.min(finite(x), finite(y));
        break;
      case 'max':
        result = Math.max(finite(x), finite(y));
        break;
      case 'eq':
        result = JSON.stringify(x) === JSON.stringify(y);
        break;
      case 'ne':
        result = JSON.stringify(x) !== JSON.stringify(y);
        break;
      case 'lt':
        result = finite(x) < finite(y);
        break;
      case 'lte':
        result = finite(x) <= finite(y);
        break;
      case 'gt':
        result = finite(x) > finite(y);
        break;
      case 'gte':
        result = finite(x) >= finite(y);
        break;
      case 'not':
        result = !bool(x);
        break;
      case 'length':
        if (typeof x !== 'string' && !Array.isArray(x)) fail('长度需要文本或数组');
        result = x.length;
        break;
      case 'at':
        if (typeof x !== 'string' && !Array.isArray(x)) fail('读取需要文本或数组');
        result = x[index(y, x.length)];
        break;
      case 'utf8':
        if (typeof x !== 'string') fail('编码需要文本');
        result = Array.from(new TextEncoder().encode(x));
        break;
      case 'append':
        result = [...array(x), y];
        if (y !== null && typeof y === 'object') fail('数组仅允许标量');
        break;
      case 'indicesOf':
        if (y !== null && typeof y === 'object') fail('匹配值必须为标量');
        result = array(x).flatMap((value, i) => value === y ? [i] : []);
        break;
      case 'range': {
        const stride = a[2] ?? 1, length = Math.ceil((y - x) / stride);
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(stride) || stride <= 0 || y < x || length > 128)
          fail('整数范围应为[start,end)，步长为正整数，最多128项');
        result = Array.from({length}, (_, i) => x + i * stride);
        break;
      }
      case 'join':
        if (a[1] !== undefined && typeof a[1] !== 'string') fail('join分隔符必须是文本');
        result = array(x).map(value => String(value ?? '')).join(a[1] ?? ', ');
        break;
      case 'concatArrays':
        result = [...array(x), ...array(y)];
        break;
      case 'array':
        if (a.some(value=>value!==null&&typeof value==='object')) fail('动态数组每项必须为标量，不能嵌套数组');
        result=a;
        break;
      case 'slice':
        if (
          !Number.isInteger(y) ||
          !Number.isInteger(a[2]) ||
          y < 0 ||
          a[2] < y ||
          a[2] > array(x).length
        )
          fail('切片范围无效');
        result = x.slice(y, a[2]);
        break;
      case 'sum':
        result = array(x).reduce((sum, value) => sum + finite(value), 0);
        break;
      case 'bitDifference': {
        const left = array(x), right = array(y);
        if (left.length !== right.length) fail('位差异需要等长字节数组');
        result = left.reduce((total, value, i) => {
          const other = right[i];
          if (!Number.isInteger(value) || value < 0 || value > 255 ||
              !Number.isInteger(other) || other < 0 || other > 255)
            fail('位差异只接受字节数组');
          let bits = value ^ other, count = 0;
          while (bits) { count += bits & 1; bits >>>= 1; }
          return total + count;
        }, 0);
        break;
      }
      case 'xor':
        if (!Number.isInteger(x) || x < 0 || x > 255 ||
            !Number.isInteger(y) || y < 0 || y > 255)
          fail('按位异或只接受0–255字节整数');
        result = x ^ y;
        break;
      case 'readLE': {
        array(x);
        if (!Number.isInteger(a[2]) || a[2] < 1 || a[2] > 4) fail('读取长度应为1–4字节');
        result = 0;
        for (let i = 0; i < a[2]; i++) {
          const byte = x[index(y + i, x.length)];
          if (!Number.isInteger(byte) || byte < 0 || byte > 255) fail('不是字节');
          result += byte * 256 ** i;
        }
        break;
      }
      case 'hex':
        if (
          !Number.isInteger(x) ||
          x < 0 ||
          !Number.isSafeInteger(x) ||
          (y !== undefined && (!Number.isInteger(y) || y < 1 || y > 16))
        )
          fail('十六进制参数无效');
        result =
          '0x' +
          x
            .toString(16)
            .toUpperCase()
            .padStart(y ?? 2, '0');
        break;
      case 'hexBytes':
        result = array(x).map((byte) => {
          if (!Number.isInteger(byte) || byte < 0 || byte > 255)
            fail('十六进制字节列表只接受0–255整数');
          return '0x' + byte.toString(16).toUpperCase().padStart(2, '0');
        }).join(', ');
        break;
      case 'concat':
        if (a.some((value) => value !== null && typeof value === 'object'))
          fail('文本拼接不接受数组；计算动态数组请使用array运算');
        result = a.map((value) => String(value ?? '')).join('');
        break;
      default:
        fail('未知运算');
    }
    return bounded(result);
  }
  function validateInput(input, value) {
    if (
      input.type === 'text' &&
      (typeof value !== 'string' ||
        value.length > (input.maxLength ?? 64) ||
        (input.ascii && /[^\x20-\x7e]/.test(value)))
    )
      fail(input.label + '的长度或字符范围无效');
    if (
      ['range', 'number'].includes(input.type) &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < input.min ||
        value > input.max)
    )
      fail(input.label + '超出允许范围');
    if (['range', 'number'].includes(input.type)) {
      const steps = (value - input.min) / (input.step ?? 1);
      if (Math.abs(steps - Math.round(steps)) > 1e-8) fail(input.label + '不符合步长要求');
    }
    if (input.type === 'toggle' && typeof value !== 'boolean') fail('开关输入无效');
    if (input.type === 'select' && !input.options.some((option) => option.value === value))
      fail('选择项无效');
  }
  function reset(values) {
    const next =
      values ?? Object.fromEntries(config.inputs.map((input) => [input.id, input.default]));
    for (const key of Object.keys(next))
      if (!config.inputs.some((input) => input.id === key)) fail('未知输入');
    const checked = Object.fromEntries(
      config.inputs.map((input) => {
        const value = Object.hasOwn(next, input.id) ? next[input.id] : input.default;
        validateInput(input, value);
        return [input.id, value];
      }),
    );
    inputs = checked;
    state = copy(config.initialState);
    history = [];
    feedback = '';
    count = 0;
    decisionHistory = [];
    comparisons = [];
    decisionSerial = 0;
  }
  function action(id) {
    return config.actions.find((action) => action.id === id) || fail('未知操作');
  }
  function activeDecisions() {
    return (config.decisions || []).filter(decision => bool(evaluate(decision.when)) &&
      decision.choices.some(id => bool(evaluate(action(id).enabledWhen))));
  }
  function can(id) {
    const enabled = bool(evaluate(action(id).enabledWhen));
    const memberships = (config.decisions || []).filter(decision => decision.choices.includes(id));
    return enabled && (!memberships.length || memberships.some(decision => bool(evaluate(decision.when))));
  }
  function checkpoint() {
    return copy({ state, inputs, feedback, count, history, decisionSerial });
  }
  function restore(point) {
    state = copy(point.state);
    inputs = copy(point.inputs);
    feedback = point.feedback;
    count = point.count;
    history = copy(point.history);
    decisionSerial = point.decisionSerial;
    decisionHistory = decisionHistory.filter(item => item.serial <= decisionSerial);
  }
  function saveHistory(kind, message) {
    history.push(copy({ state, inputs, feedback, count, decisionSerial,
      action: kind, message }));
    if (history.length > 256) history.shift();
  }
  function actionLocals(definition, current) {
    const locals = Object.create(null);
    for (const local of definition.locals ?? []) {
      try {locals[local.id] = bounded(evaluate(local.value, current, 0, locals));}
      catch (error) {fail('/actions/@' + definition.id + '/locals/@' + local.id + '/value: ' + error.message);}
    }
    return locals;
  }
  function evaluateAction(id, expression) {
    return evaluate(expression, state, 0, actionLocals(action(id), state));
  }
  function act(id) {
    const definition = action(id);
    if (!can(id)) fail('请先完成该操作的前置条件');
    if (count >= 4096) fail('已达到单次实验步数限制，请重置');
    const decision = activeDecisions().find(item => item.choices.includes(id));
    const origin = decision ? checkpoint() : null;
    const previous = copy(state),
      next = copy(state),
      locals = actionLocals(definition, previous);
    // All right-hand sides read the same pre-step state; swapping and coupled updates remain deterministic.
    for (const update of definition.updates) {
      const value = bounded(evaluate(update.value, previous, 0, locals));
      if (update.index !== undefined) {
        const target = array(next[update.target]);
        const pos = evaluate(update.index, previous, 0, locals);
        if (!Number.isInteger(pos) || pos < 0 || pos > target.length ||
            (pos === target.length && target.length >= 128)) fail('索引超出模拟范围');
        if (value !== null && typeof value === 'object') fail('单元格仅允许标量');
        target[pos] = value;
      } else next[update.target] = value;
    }
    let message;
    try {message = String(evaluate(definition.feedback, next, 0, locals));}
    catch (error) {fail('/actions/@' + definition.id + '/feedback: ' + error.message);}
    saveHistory(id, message);
    state = next;
    feedback = message;
    count++;
    if (decision) {
      decisionHistory.push({ id: decision.id, action: id, origin, serial: ++decisionSerial });
      if (decisionHistory.length > 16) decisionHistory.shift();
    }
    return getState();
  }
  function repeatable(id) {
    const definition = action(id);
    return (
      definition.repeatWhile !== undefined && can(id) && bool(evaluate(definition.repeatWhile))
      && !activeDecisions().length
      && !(config.decisions || []).some(decision => decision.choices.includes(id))
    );
  }
  function run(id) {
    let steps = 0;
    if (!repeatable(id)) fail('当前操作不可连续执行');
    while (repeatable(id)) {
      if (steps++ >= 256) fail('连续操作未在256步内结束');
      act(id);
    }
    return steps;
  }
  function back() {
    const last = history.pop();
    if (last) {
      state = last.state;
      inputs = last.inputs;
      feedback = last.feedback;
      count = last.count;
      decisionSerial = last.decisionSerial;
      decisionHistory = decisionHistory.filter(item => item.serial <= decisionSerial);
    }
    return getState();
  }
  function setInput(id, value) {
    const definition = config.inputs.find((input) => input.id === id);
    if (!definition) fail('未知输入');
    validateInput(definition, value);
    if (definition.mode === 'live') {
      if (JSON.stringify(inputs[id]) === JSON.stringify(value)) return;
      saveHistory('input:' + id, definition.label + '：' + String(value));
      inputs = { ...inputs, [id]: value };
      feedback = definition.label + '已调整，实验状态保留。';
    } else reset({ ...inputs, [id]: value });
  }
  function pick(viewId, position) {
    const view = config.views.find(item => item.id === viewId);
    if (!view?.pick) fail('该场景对象不可操作');
    index(position, array(evaluate(view.value)).length);
    const before = checkpoint();
    try {
      const input = config.inputs.find(item => item.id === view.pick.input);
      const value = input.type === 'select' ? input.options[position]?.value
        : Number(input.min ?? 0) + position * Number(input.step ?? 1);
      if (value === undefined) fail('该对象没有对应的选择项');
      setInput(view.pick.input, value);
      if (view.pick.action) act(view.pick.action);
    } catch (error) {
      restore(before);
      throw error;
    }
    return getState();
  }
  function rememberDecision(last) {
    const decision = config.decisions.find(item => item.id === last.id);
    const originKey = JSON.stringify([last.id, last.origin.state, last.origin.inputs]);
    const result = { decision: last.id, action: last.action, originKey,
      inputs:copy(last.origin.inputs),
      values: Object.fromEntries(decision.observe.map(item => [item.field, copy(state[item.field])])),
      feedback, count, path: history.slice(last.origin.history.length).map(item => item.action) };
    comparisons = comparisons.filter(item => !(item.originKey === originKey && item.action === last.action));
    comparisons.push(result);
    if (comparisons.length > 8) comparisons.shift();
  }
  function reconsider() {
    const last = decisionHistory.at(-1);
    if (!last) fail('尚未作出决策');
    rememberDecision(last);
    restore(last.origin);
    return getState();
  }
  function beginTrial() {
    const last=decisionHistory.at(-1);
    if(!last)fail('尚未作出决策');
    const currentInputs=copy(inputs),savedState=state,savedInputs=inputs;
    // Prove the new condition still reaches this decision before changing
    // history or comparison records. Failure leaves the experiment intact.
    try{
      state=copy(last.origin.state);inputs=currentInputs;
      const decision=activeDecisions().find(item=>item.id===last.id);
      if(!decision||decision.choices.filter(can).length<2)fail('当前条件无法到达此决策点，请调整条件后再试');
    }finally{state=savedState;inputs=savedInputs;}
    rememberDecision(last);restore(last.origin);inputs=currentInputs;
    feedback='已保留当前实验条件和准备进展。请重新作出决策；先前结果已保存。';
    return getState();
  }
  function decisionState() {
    const last = decisionHistory.at(-1);
    const pending = activeDecisions().map(decision => ({ ...decision,
      originKey: JSON.stringify([decision.id, state, inputs]),
      available: decision.choices.filter(can) }));
    const current = last ? { decision: last.id, action: last.action,
      inputs:copy(last.origin.inputs),conditionsChanged:JSON.stringify(inputs)!==JSON.stringify(last.origin.inputs),
      originKey: JSON.stringify([last.id, last.origin.state, last.origin.inputs]),
      values: Object.fromEntries(config.decisions.find(item => item.id === last.id).observe
        .map(item => [item.field, copy(state[item.field])])) } : null;
    return copy({ pending, current, comparisons });
  }
  function format(value, kind) {
    if (kind === 'hex') return '0x' + finite(value).toString(16).toUpperCase().padStart(8, '0');
    if (kind === 'byte') return finite(value).toString(16).toUpperCase().padStart(2, '0');
    // Round presentation only. Calculations, undo and strategy comparisons
    // keep the original numeric state and never use this display string.
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value))
      return String(Number(value.toPrecision(8)));
    return Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
  }
  function getState() {
    return copy({
      state,
      inputs,
      feedback,
      count,
      history: history.map((item) => ({ action: item.action, message: item.message })),
    });
  }
  function views() {
    return config.views.map((view) => ({ id: view.id, value: evaluate(view.value) }));
  }
  function markers(viewId) {
    const view=config.views.find(view=>view.id===viewId);
    if(!view)throw new Error('未知视图：'+viewId);
    let active=view.activeIndex===undefined?-1:evaluate(view.activeIndex);
    if(Array.isArray(active)&&active.length<=1)active=active.length?active[0]:-1;
    if(typeof active!=='number'||!Number.isInteger(active))throw new Error('活动单元格索引必须是整数或单项索引数组');
    const raw=view.markedIndices===undefined?[]:evaluate(view.markedIndices);
    const list=typeof raw==='number'?[raw]:raw;
    if(!Array.isArray(list)||list.some(index=>typeof index!=='number'||!Number.isInteger(index)||index < -1||index>127))
      throw new Error('状态标记必须是0–127范围内的整数索引；-1表示无标记');
    return {activeIndex:active,markedIndices:[...new Set(list.filter(index=>index!==-1))]};
  }
  function verify(id, answer) {
    const question = config.questions.find((question) => question.id === id) || fail('未知问题');
    const view = config.views.find((view) => view.id === question.evidenceView);
    const value = evaluate(view.value), text = String(answer).trim();
    if (view.format === 'hex' && typeof value === 'number')
      return /^0x[0-9a-f]{8}$/i.test(text) && Number.parseInt(text.slice(2), 16) === value;
    return text === format(value, view.format).trim();
  }
  reset();
  return {
    markers,
    evaluate,
    act,
    can,
    repeatable,
    run,
    reset,
    back,
    setInput,
    getState,
    evaluateAction,
    views,
    format,
    verify,
    activeDecisions,
    decisionState,
    reconsider,
    beginTrial,
    pick,
  };
};

(() => {
  const categories = {PASS: '通过', ENVIRONMENT: '环境故障', COMPILE: '编译失败', TIMEOUT: '执行超时', RUNTIME: '运行异常', TEST: '测试未通过'};
  const aiLabels = {pending: 'AI 复核中', failed: 'AI 待重试', suggested: 'AI 已给出复核意见', confirmed: '教师已确认复核意见'};
  const list = value => Array.isArray(value) ? value : [];
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const text = value => value == null ? '' : String(value);
  const formatNumber = value => finite(value) == null ? '—' : String(Math.round(value * 100) / 100);
  const normalizeTests = value => list(value).filter(item => item && typeof item === 'object').map((item, index) => ({...item, id: text(item.id || 'check-' + index), name: text(item.name || item.id || '检查项 ' + (index + 1)), passed: typeof item.passed === 'boolean' ? item.passed : null, category: text(item.category), feedback: text(item.feedback), component: text(item.component), group: text(item.group)}));
  function summarizeTests(tests) {
    return tests.reduce((summary, item) => { summary.total++; summary[item.passed === true ? 'passed' : item.passed === false ? 'failed' : 'unknown']++; return summary; }, {total: 0, passed: 0, failed: 0, unknown: 0});
  }
  function overallPassed(value) {
    if (!value) return null;
    if (value.success === false || list(value.tests || value.results).some(item => item?.passed === false)) return false;
    if (finite(value.exitCode) != null && value.exitCode !== 0) return false;
    if (value.category === 'PASS' && value.exitCode === 0) return true;
    if (typeof value.passed === 'boolean') return value.passed;
    return null;
  }
  function gradeMaximum(grade) {
    const maxima = list(grade?.criteria).map(item => finite(item.maxScore)).filter(item => item != null);
    const total = maxima.reduce((sum, value) => sum + value, 0);
    return total > 0 ? total : 100;
  }
  function visualCase(visual, id) {
    const item = list(visual?.cases).find(entry => entry?.id === id);
    if (!item) return null;
    const observed = visual.status === 'completed' && item.status === 'observed';
    return {...item, capacity: finite(item.capacity) ?? finite(visual.capacity), passed: observed && typeof item.passed === 'boolean' ? item.passed : null, actualReturn: observed ? finite(item.actualReturn) : null, afterHex: observed ? item.afterHex : null, guardUnchanged: observed && typeof item.guardUnchanged === 'boolean' ? item.guardUnchanged : null, observed, sourceSha256: text(visual.sourceSha256), sourceMatchesChecks: typeof visual.sourceMatchesChecks === 'boolean' ? visual.sourceMatchesChecks : null, source: visual.source && typeof visual.source === 'object' ? visual.source : null, trace: item.trace && typeof item.trace === 'object' ? item.trace : null, kind: 'boundary-observation'};
  }
  const helpers = {normalizeTests, summarizeTests, overallPassed, gradeMaximum, visualCase};
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  if (typeof document === 'undefined') return;
  const root = document.getElementById('lab-environment');
  if (!root) return;
  const teacher = root.dataset.teacher === 'true';
  const get = id => document.getElementById(id);
  const status = get('lab-status');
  const result = get('lab-result');
  const course = new URLSearchParams(location.search).get('dojo');
  const base = '/pwncollege_api/v1/workspace/environment';
  const caseDefinitions = [
    {id: 'empty', title: '空字符串', inputText: '', inputBytes: [], capacity: 8, expectedReturn: 0, description: '结尾 NUL 占一个字节；目标首字节写入 NUL。'},
    {id: 'exact', title: '恰好容纳', inputText: 'ABCDEFG', inputBytes: [65, 66, 67, 68, 69, 70, 71], capacity: 8, expectedReturn: 0, description: '七个单字节字符加结尾 NUL，共占八字节。'},
    {id: 'short', title: '容量不足', inputText: 'ABCDEFGH', inputBytes: [65, 66, 67, 68, 69, 70, 71, 72], capacity: 8, expectedReturn: 34, description: '八个字符加 NUL 需要九字节；题目约定返回 ERANGE，并将目标首字节置为 NUL。'}
  ];
  let busy = false;
  let runningOperation = '';
  let reviewBusy = false;
  let state = null;
  let tab = teacher ? 'history' : 'check';
  let selectedCase = 'empty';
  let checkValue = null;
  let submitValue = null;
  let submissionVisualCases = null;
  let selectedSubmission = null;
  let submissions = [];
  let selectedSource = '';
  let detailSequence = 0;
  let refreshSequence = 0;
  let refreshing = false;
  let disabledBeforeOperation = new Map();
  const emit = (name, detail) => root.dispatchEvent(new CustomEvent(name, {detail}));
  const announce = message => { if (status) status.textContent = message; };
  const dateLabel = timestamp => finite(timestamp) != null ? new Date(timestamp * 1000).toLocaleString('zh-CN', {hour12: false}) : '时间未记录';
  function element(tag, content, parent, className) {
    const node = document.createElement(tag);
    if (content != null) node.textContent = text(content);
    if (className) node.className = className;
    if (parent) parent.append(node);
    return node;
  }
  function badge(content, kind, parent) {
    const node = element('span', content, parent, 'le-status');
    node.dataset.state = kind;
    return node;
  }
  function action(content, parent, handler, className = 'le-action') {
    const button = element('button', content, parent, className);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }
  function query(id) {
    const params = new URLSearchParams();
    if (course) params.set('dojo', course);
    if (id != null) params.set('id', id);
    return '/submissions?' + params.toString();
  }
  async function api(path, data) {
    const response = await fetch(base + path, {method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'CSRF-Token': window.init?.csrfNonce || window.CTFd?.config?.csrfNonce || ''}, ...(data ? {body: JSON.stringify(data)} : {})});
    let value;
    try { value = await response.json(); } catch (_) { throw new Error('服务未返回有效结果，请稍后重试。'); }
    if (!response.ok || !value?.success) throw new Error(value?.error || '操作未完成，请稍后重试。');
    return value;
  }
  function setTab(next, focus = false) {
    if (!['check', 'submit', 'history'].includes(next)) return;
    if (teacher && next === 'check') next = 'history';
    tab = next;
    root.querySelectorAll('[data-lab-tab]').forEach(button => {
      const active = button.dataset.labTab === next;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.classList.toggle('is-active', active);
      if (active && focus) button.focus();
    });
    root.querySelectorAll('[data-lab-panel]').forEach(panel => { panel.hidden = panel.dataset.labPanel !== next; });
    const arena = get('lab-shared-arena');
    if (arena) {
      const slot = get(next === 'submit' ? 'lab-submit-arena-slot' : 'lab-check-arena-slot');
      if (slot && arena.parentNode !== slot) slot.append(arena);
      arena.hidden = next === 'history';
      if (next !== 'history') renderCases();
    }
    emit('lab:tab', {tab: next});
  }
  function renderSummary(target, value, operation, running = false) {
    if (!target) return;
    target.replaceChildren();
    const summary = element('div', null, target, 'le-summary');
    if (running) {
      badge(operation === 'check' ? '正在执行公开自测' : '正在保存并核验', 'running', summary);
      element('p', '结果返回后显示检测项与运行反馈。', summary, 'le-summary-note');
      return;
    }
    if (!value) {
      badge(operation === 'check' ? '尚未运行' : '尚未提交本次核验', 'pending', summary);
      element('p', operation === 'check' ? '保存编辑器中的代码后，运行公开自测。' : '提交后将保存本次代码快照及核验记录。', summary, 'le-summary-note');
      return;
    }
    const tests = normalizeTests(value.tests || value.results);
    const counts = summarizeTests(tests);
    const passed = overallPassed(value);
    badge(passed === true ? '本组测试通过' : passed === false ? categories[value.category] || '需修正' : '结果已返回', passed === true ? 'pass' : passed === false ? 'fail' : 'unknown', summary);
    if (counts.total) {
      element('strong', counts.passed + ' / ' + counts.total + ' 项通过', summary, 'le-summary-count');
      element('p', [counts.failed ? counts.failed + ' 项未通过' : '', counts.unknown ? counts.unknown + ' 项状态待确认' : ''].filter(Boolean).join(' · ') || '全部已返回检查项通过。', summary, 'le-summary-note');
    } else element('p', '没有可展示的结构化检查项，可展开原始运行输出。', summary, 'le-summary-note');
    if (finite(value.elapsedSeconds) != null) element('span', '用时 ' + value.elapsedSeconds + ' 秒', summary, 'le-summary-time');
  }
  function groupTitle(test) {
    const key = test.component || test.group;
    const labels = {main: '主函数实现', strcpy_s: '主函数实现', basic: '主函数实现', student_tests: '自主测试', 'student-tests': '自主测试', 'repair.unbounded': '思考练习 · 无界复制', 'repair.termination': '思考练习 · 结尾标记', 'repair.truncation': '思考练习 · 截断', 'repair.off_by_one': '思考练习 · 差一错误', repairs: '差一错误修正', thinking: '思考练习', tests: '自主测试'};
    return labels[key] || key || '检查项目';
  }
  function renderTests(target, values) {
    if (!target) return;
    target.replaceChildren();
    const tests = normalizeTests(values);
    const groups = new Map();
    tests.forEach(test => { const name = groupTitle(test); if (!groups.has(name)) groups.set(name, []); groups.get(name).push(test); });
    for (const [name, items] of groups) {
      const group = element('details', null, target, 'le-test-group');
      const counts = summarizeTests(items);
      group.open = groups.size === 1 || counts.failed > 0;
      const heading = element('summary', null, group);
      element('span', name, heading);
      badge(counts.passed + '/' + counts.total + ' 通过', counts.failed ? 'fail' : counts.unknown ? 'unknown' : 'pass', heading);
      const rows = element('ul', null, group, 'le-test-list');
      items.forEach(test => {
        const row = element('li', null, rows, 'le-test-row');
        const title = element('div', null, row, 'le-test-heading');
        element('span', test.name, title);
        badge(test.passed === true ? '通过' : test.passed === false ? categories[test.category] || '未通过' : '未确认', test.passed === true ? 'pass' : test.passed === false ? 'fail' : 'unknown', title);
        if (test.input && (test.input.capacityText || finite(test.input.capacity) != null)) element('p', '目标容量 ' + text(test.input.capacityText || test.input.capacity) + ' 字节' + (finite(test.input.expectedReturn) != null ? ' · 预期返回 ' + test.input.expectedReturn : ''), row, 'le-test-meta');
        if (test.feedback) {
          const feedback = element('details', null, row, 'le-test-feedback');
          element('summary', '运行反馈', feedback);
          element('pre', test.feedback, feedback);
        }
      });
    }
  }
  function renderCases() {
    const target = get('lab-check-cases');
    if (!target) return;
    target.replaceChildren();
    const picker = element('div', null, target, 'le-case-picker');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', '边界观察用例');
    const choiceButtons = [];
    for (const definition of caseDefinitions) {
      const button = action(definition.title, picker, () => { selectedCase = definition.id; selectCase(); }, 'le-case-choice');
      button.dataset.caseId = definition.id;
      choiceButtons.push(button);
    }
    const stage = element('div', null, target, 'le-case-stage');
    function selectCase() {
      const definition = caseDefinitions.find(item => item.id === selectedCase) || caseDefinitions[0];
      const visuals = tab === 'submit' ? submissionVisualCases : checkValue?.visualCases;
      const observation = visualCase(visuals, definition.id);
      choiceButtons.forEach(button => { const active = button.dataset.caseId === definition.id; button.classList.toggle('is-selected', active); button.setAttribute('aria-pressed', String(active)); });
      stage.replaceChildren();
      const heading = element('div', null, stage, 'le-case-heading');
      element('h3', definition.title, heading);
      badge(observation?.observed ? observation.passed === true ? '实际观察符合预期' : observation.passed === false ? '实际观察需修正' : '观察已返回' : ['check', 'submit'].includes(runningOperation) ? '等待运行结果' : '用例说明', observation?.passed === true ? 'pass' : observation?.passed === false ? 'fail' : 'pending', heading);
      element('p', definition.description, stage, 'le-case-note');
      const caseData = {...definition, ...observation, observationStatus: visuals?.status || 'unavailable', mode: observation?.observed ? 'observed' : 'explanation'};
      if (observation?.sourceMatchesChecks === false) element('p', '边界观察与检测采用不同代码版本；保存代码后可重新自测。', stage, 'le-case-note');
      const input = element('p', null, stage, 'le-case-input');
      element('span', '输入 ', input); element('code', JSON.stringify(caseData.inputText), input);
      element('span', ' · 容量 ' + caseData.capacity + ' 字节', input);
      const outcome = element('div', null, stage, 'le-case-outcome');
      element('span', '预期返回 ' + caseData.expectedReturn + (caseData.expectedReturn === 34 ? '（ERANGE）' : ''), outcome);
      if (observation?.observed) {
        element('span', '实际返回 ' + formatNumber(observation.actualReturn), outcome);
        if (typeof observation.guardUnchanged === 'boolean') element('span', observation.guardUnchanged ? '边界哨兵保持不变' : '边界哨兵发生变化', outcome);
      } else element('span', visuals && visuals.status !== 'completed' || observation?.status && observation.status !== 'observed' ? '边界观察未完成，当前为用例说明。' : '尚无本次实际内存观察。', outcome);
      const event = {id: definition.id, caseData, result: observation?.observed || Array.isArray(observation?.trace?.events) && observation.trace.events.length ? observation : null, source: visuals?.source || null};
      emit('lab:case', event);
    }
    selectCase();
  }
  function renderSource(detail) {
    const source = get('lab-source');
    if (!source) return;
    const files = detail.sources && typeof detail.sources === 'object' ? Object.entries(detail.sources).filter(([, file]) => file && typeof file === 'object') : [];
    const tabs = get('lab-source-files');
    if (tabs) {
      tabs.replaceChildren();
      if (!files.some(([name]) => name === selectedSource)) selectedSource = files[0]?.[0] || '';
      function choose(name) {
        selectedSource = name;
        const file = files.find(([key]) => key === name)?.[1];
        source.textContent = file ? name + '\nSHA-256：' + text(file.sha256) + '\n\n' + text(file.text) : text(detail.source);
        tabs.querySelectorAll('button').forEach(button => { const active = button.dataset.file === name; button.classList.toggle('is-selected', active); button.setAttribute('aria-pressed', String(active)); });
      }
      tabs.classList.add('le-source-tabs');
      files.forEach(([name]) => { const button = action(name, tabs, () => choose(name)); button.dataset.file = name; });
      choose(selectedSource);
    } else source.textContent = files.length ? files.map(([name, file]) => name + '\nSHA-256：' + text(file.sha256) + '\n' + text(file.text)).join('\n\n') : text(detail.source);
    const panel = get('lab-detail');
    if (panel) panel.hidden = false;
  }
  async function reviewAction(detail, operation, reason, button) {
    if (busy || reviewBusy) return;
    reviewBusy = true; button.disabled = true;
    try {
      await api('/reviews', {id: detail.id, operation, ...(reason != null ? {reason} : {})});
      await openSubmission(detail.id, false);
      await refresh();
      announce(operation === 'retry' ? '已重新安排后台 AI 复核。' : '复核意见已确认，评分保持不变。');
    } catch (error) { announce(error.message); }
    finally { reviewBusy = false; if (button.isConnected) button.disabled = false; }
  }
  function renderGrade(detail) {
    const panel = get('lab-grading');
    if (!panel) return;
    panel.replaceChildren();
    const grade = detail.gradingView;
    panel.hidden = !grade;
    if (!grade) return;
    const summary = element('div', null, panel, 'le-grade-summary');
    element('h3', '本次已核验成绩', summary);
    element('strong', formatNumber(grade.confirmedScore) + ' / ' + gradeMaximum(grade), summary);
    const stages = element('div', null, panel, 'le-grade-stages');
    for (const stage of Object.values(grade.stages || {})) {
      const row = element('div', null, stages, 'le-grade-stage');
      element('span', stage.title || '阶段', row);
      badge(stage.passed === true ? '已达标' : '待完成', stage.passed === true ? 'pass' : 'pending', row);
      if (finite(stage.score) != null) element('strong', formatNumber(stage.score) + ' 分', row);
    }
    const criteria = list(grade.criteria);
    const basic = grade.stages?.basic;
    const basicCriteria = criteria.filter(item => item.stage === 'basic');
    const primaryRows = basic && basicCriteria.length ? [{title: '主函数实现', score: basic.score, maxScore: basic.maxScore, status: basic.passed === true ? 'complete' : finite(basic.score) > 0 ? 'partial' : 'missing'}, ...criteria.filter(item => item.stage !== 'basic')] : criteria;
    for (const criterion of primaryRows) {
      const row = element('div', null, panel, 'le-criterion');
      const title = element('div', null, row, 'le-criterion-heading');
      element('span', criterion.title, title);
      element('strong', formatNumber(criterion.score) + ' / ' + formatNumber(criterion.maxScore), title);
      badge(criterion.status === 'complete' ? '已完成' : criterion.status === 'partial' ? '部分完成' : '待完成', criterion.status === 'complete' ? 'pass' : 'pending', title);
      if (finite(criterion.maxScore) > 0 && finite(criterion.score) != null) {
        const track = element('div', null, row, 'le-score-track');
        track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', text(criterion.title)); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', criterion.maxScore); track.setAttribute('aria-valuenow', Math.max(0, Math.min(criterion.maxScore, criterion.score)));
        element('div', null, track, 'le-score-fill').style.width = Math.max(0, Math.min(100, criterion.score / criterion.maxScore * 100)) + '%';
      }
    }
    if (basic && basicCriteria.length) {
      const breakdown = element('details', null, panel, 'le-grade-breakdown');
      element('summary', '主函数分项依据', breakdown);
      for (const criterion of basicCriteria) {
        const row = element('div', null, breakdown, 'le-criterion-heading');
        element('span', criterion.title, row);
        element('strong', formatNumber(criterion.score) + ' / ' + formatNumber(criterion.maxScore), row);
        if (list(criterion.missingChecks).length) element('p', list(criterion.missingChecks).join('；'), breakdown, 'le-test-meta');
      }
    }
    const ai = grade.ai || {};
    const review = element('section', null, panel, 'le-review');
    const heading = element('div', null, review, 'le-review-heading');
    element('h3', 'AI 复核', heading); badge(aiLabels[ai.status] || '尚无复核意见', ai.status === 'failed' ? 'fail' : ai.status === 'confirmed' ? 'pass' : 'pending', heading);
    element('p', '复核意见与本次已保存源码关联；分值以核验结果为准。', review, 'le-review-note');
    if (ai.suggestion) {
      element('p', ai.suggestion.feedback, review, 'le-review-feedback');
      for (const criterion of list(ai.suggestion.criteria)) {
        const item = element('details', null, review, 'le-review-citations');
        element('summary', criterion.title || criterion.id || '源码依据', item);
        element('p', criterion.reason, item);
        for (const cite of list(criterion.citations)) element('pre', text(cite.file) + ':' + text(cite.line) + '  ' + text(cite.quote), item);
      }
    }
    if (ai.status === 'confirmed' && ai.decision) element('p', '教师复核：' + text(ai.decision.reason), review);
    if (ai.status === 'failed') {
      const button = action('重试 AI 复核', review, () => reviewAction(detail, 'retry', null, button));
    }
    if (teacher && ai.suggestion) {
      const form = element('form', null, review, 'le-review-form');
      const reason = element('input', null, form); reason.required = true; reason.placeholder = '确认复核意见（不改变分值）'; reason.setAttribute('aria-label', '确认复核意见');
      const submit = element('button', '确认 AI 复核意见', form, 'le-action'); submit.type = 'submit';
      form.addEventListener('submit', event => { event.preventDefault(); if (reason.value.trim()) reviewAction(detail, 'confirm', reason.value.trim(), submit); });
    }
  }
  function showDetail(detail) {
    selectedSubmission = detail;
    emit('lab:record', detail);
    const target = get('lab-submission-summary');
    if (target) {
      target.replaceChildren();
      element('h3', '提交记录 #' + detail.id, target, 'le-history-title');
      element('p', dateLabel(detail.timestamp) + (detail.student ? ' · ' + detail.student : ''), target, 'le-history-meta');
      element('p', '保存源码 SHA-256：' + text(detail.submissionSha256 || detail.sourceSha256 || '未记录'), target, 'le-source-meta');
      if (detail.compiler) element('p', detail.compiler, target, 'le-source-meta');
    }
    const value = {...detail, tests: detail.results};
    renderSummary(get('lab-submit-summary'), value, 'submit');
    renderTests(get('lab-submit-tests'), detail.results);
    renderGrade(detail); renderSource(detail);
  }
  async function openSubmission(id, focus = true) {
    const sequence = ++detailSequence;
    try {
      const detail = list((await api(query(id))).submissions)[0];
      if (sequence !== detailSequence || !detail) return;
      if (focus) submissionVisualCases = null;
      showDetail(detail);
      if (focus) { setTab('submit'); get('lab-detail')?.focus({preventScroll: true}); }
    } catch (error) { announce(error.message); }
  }
  function renderHistory(items) {
    const body = get('lab-submissions');
    if (!body) return;
    body.replaceChildren();
    if (get('lab-history-count')) get('lab-history-count').textContent = items.length + ' 条记录';
    if (!items.length) {
      const row = element('tr', null, body);
      element('td', '尚无正式核验记录。提交后可在这里查看对应源码与反馈。', row).colSpan = 6;
    }
    items.forEach(item => {
      const row = element('tr', null, body); row.dataset.submissionId = item.id;
      const when = element('td', null, row);
      element('span', dateLabel(item.timestamp), when, 'le-history-title');
      if (item.student) element('span', item.student, when, 'le-history-meta');
      const outcome = element('td', null, row);
      badge(item.passed === true ? '通过' : item.passed === false ? '需修正' : '结果待确认', item.passed === true ? 'pass' : item.passed === false ? 'fail' : 'unknown', outcome);
      const scoring = element('td', null, row);
      element('strong', item.gradingView ? formatNumber(item.gradingView.confirmedScore) + ' / ' + gradeMaximum(item.gradingView) : '旧版核验', scoring);
      if (item.gradingView) element('span', aiLabels[item.gradingView.ai?.status] || '暂无 AI 意见', scoring, 'le-history-meta');
      element('td', text(item.submissionSha256 || item.sourceSha256).slice(0, 12) || '—', row);
      element('td', [item.templateVersion, item.testVersion].filter(Boolean).join(' / ') || '—', row);
      const actions = element('td', null, row);
      action('查看代码与反馈', actions, () => openSubmission(item.id));
    });
  }
  async function refresh(options = {}) {
    const sequence = ++refreshSequence;
    refreshing = true;
    try {
      const items = list((await api(query())).submissions);
      if (sequence !== refreshSequence) return [];
      submissions = items;
      renderHistory(items);
      if (options.after != null) {
        const item = items.find(entry => !options.excludeIds?.has(String(entry.id)) && finite(entry.timestamp) != null && entry.timestamp >= options.after - 2 && (!state?.manifest?.taskId || !entry.taskId || entry.taskId === state.manifest.taskId));
        if (item) await openSubmission(item.id, false);
      } else if (selectedSubmission) {
        const current = items.find(item => String(item.id) === String(selectedSubmission.id));
        if (current && JSON.stringify(current.gradingView) !== JSON.stringify(selectedSubmission.gradingView)) await openSubmission(current.id, false);
      }
      return items;
    } finally { if (sequence === refreshSequence) refreshing = false; }
  }
  function lockOperations(value) {
    if (value) {
      disabledBeforeOperation = new Map();
      root.querySelectorAll('[data-operation], #lab-refresh, #lab-recovery button, .le-review button').forEach(button => { disabledBeforeOperation.set(button, button.disabled); button.disabled = true; });
    } else {
      disabledBeforeOperation.forEach((disabled, button) => { if (button.isConnected) button.disabled = disabled; });
      disabledBeforeOperation.clear();
    }
    root.setAttribute('aria-busy', String(value));
  }
  function rawOutput(content) {
    if (!result) return;
    result.hidden = !content;
    result.textContent = text(content);
  }
  function recoveryControls(value) {
    const recovery = get('lab-recovery'); if (!recovery) return;
    recovery.replaceChildren();
    action('预览本题起始代码', recovery, () => perform('reset'));
    for (const item of list(value.result)) action('查看恢复点 ' + text(item.id), recovery, () => perform('restore', {id: item.id}));
  }
  async function perform(operation, extra = {}) {
    if (busy || reviewBusy) return;
    busy = true; runningOperation = operation; lockOperations(true);
    const started = Date.now() / 1000;
    const priorSubmissionIds = new Set(submissions.map(item => String(item.id)));
    const isRun = operation === 'check' || operation === 'submit';
    if (isRun) {
      if (operation === 'check') checkValue = null;
      else { submitValue = null; submissionVisualCases = null; }
      setTab(operation);
      renderSummary(get(operation === 'check' ? 'lab-check-summary' : 'lab-submit-summary'), null, operation, true);
      renderTests(get(operation === 'check' ? 'lab-check-tests' : 'lab-submit-tests'), []);
      if (operation === 'check') { checkValue = null; renderCases(); }
      else { selectedSubmission = null; ++detailSequence; for (const id of ['lab-grading', 'lab-detail']) if (get(id)) get(id).hidden = true; if (get('lab-submission-summary')) get('lab-submission-summary').replaceChildren(); }
      emit('lab:running', {operation});
    }
    announce(operation === 'submit' ? '正在读取已保存源码并执行正式核验…' : operation === 'check' ? '正在执行公开自测与边界观察…' : '正在处理…');
    try {
      const data = await api('', {operation, ...extra});
      const value = {...data.result, elapsedSeconds: data.elapsedSeconds};
      runningOperation = '';
      const details = value.result || value;
      if (isRun) {
        if (operation === 'check') checkValue = value;
        else { submitValue = value; submissionVisualCases = value.visualCases || null; }
        renderSummary(get(operation === 'check' ? 'lab-check-summary' : 'lab-submit-summary'), value, operation);
        renderTests(get(operation === 'check' ? 'lab-check-tests' : 'lab-submit-tests'), value.tests);
        rawOutput(value.output || value.error);
        emit('lab:results', {operation, checks: normalizeTests(value.tests), passed: overallPassed(value), detail: value});
        renderCases();
      } else if (operation === 'health') rawOutput((details.ready ? '环境已就绪' : '环境尚未就绪') + '\n\n' + list(details.checks).map(check => (check.passed ? '通过' : '未就绪') + ' · ' + text(check.name) + '\n' + text(check.output)).join('\n\n'));
      else if (operation === 'snapshot') rawOutput('已保存 ' + text(details.fileCount) + ' 个工程文件。\n恢复点：' + text(details.id));
      else if (operation === 'history') { rawOutput(''); recoveryControls(value); }
      else if (operation === 'restore' || operation === 'reset') {
        rawOutput((details.applied ? '恢复完成；原代码已自动保存为恢复点。' : '将恢复以下文件，不删除其他文件：') + '\n' + list(details.files).join('\n'));
        if (!extra.apply && value.success && get('lab-recovery')) {
          get('lab-recovery').replaceChildren();
          action('确认恢复这 ' + list(details.files).length + ' 个文件（自动备份当前代码）', get('lab-recovery'), () => perform(operation, {id: extra.id, apply: true, ...(operation === 'reset' ? {challengeId: state?.challengeId, taskId: state?.manifest?.taskId, templateVersion: state?.manifest?.templateVersion} : {})}));
        } else if (details.applied && get('lab-recovery')) get('lab-recovery').replaceChildren();
      }
      announce(value.success === false ? value.error || '操作未完成。' : (isRun ? overallPassed(value) === true ? '本组测试通过。' : '运行已结束，请查看反馈。' : '操作已结束。') + (finite(data.elapsedSeconds) != null ? '用时 ' + data.elapsedSeconds + ' 秒。' : ''));
      try { await refresh(operation === 'submit' ? {after: started, excludeIds: priorSubmissionIds} : {}); } catch (_) { announce('运行结果已返回，提交记录暂未刷新；可稍后刷新记录。'); }
    } catch (error) {
      runningOperation = '';
      announce(error.message);
      if (isRun) {
        renderSummary(get(operation === 'check' ? 'lab-check-summary' : 'lab-submit-summary'), {success: false, category: 'ENVIRONMENT'}, operation);
        renderCases();
        emit('lab:error', {operation, message: error.message});
      }
    } finally { busy = false; runningOperation = ''; lockOperations(false); }
  }
  root.querySelectorAll('[data-lab-tab]').forEach(button => {
    button.addEventListener('click', () => setTab(button.dataset.labTab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...root.querySelectorAll('[data-lab-tab]')].filter(item => !item.disabled && !item.hidden);
      const index = tabs.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      if (tabs[next]) { event.preventDefault(); setTab(tabs[next].dataset.labTab, true); }
    });
  });
  root.querySelectorAll('[data-operation]').forEach(button => button.addEventListener('click', () => perform(button.dataset.operation)));
  get('lab-refresh')?.addEventListener('click', () => { if (busy || refreshing) return; if (teacher) refresh().catch(error => announce(error.message)); else perform('sync'); });
  setTab(tab);
  renderSummary(get('lab-check-summary'), null, 'check');
  renderSummary(get('lab-submit-summary'), null, 'submit');
  renderCases();
  window.setInterval(() => { if (!busy && !reviewBusy && !refreshing && !document.hidden) refresh().catch(() => {}); }, 20000);
  (async () => {
    if (teacher) { announce('课程内的正式核验记录。'); await refresh(); return; }
    state = await api('');
    if (state.supported) {
      if (get('lab-controls')) get('lab-controls').hidden = false;
      if (get('lab-meta')) get('lab-meta').textContent = text(state.manifest?.workspace) + ' · 环境版本 ' + text(state.manifest?.templateVersion);
      announce('工程已连接。'); await perform('sync');
    } else { announce('请先在课程中启动安全编码实验；历史记录仍可查看。'); await refresh(); }
  })().catch(error => announce(error.message));
})();

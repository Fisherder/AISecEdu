(() => {
  const root = document.getElementById('lab-environment');
  if (!root) return;
  const teacher = root.dataset.teacher === 'true';
  const status = document.getElementById('lab-status');
  const result = document.getElementById('lab-result');
  const course = new URLSearchParams(location.search).get('dojo');
  const base = '/pwncollege_api/v1/workspace/environment';
  let busy = false;
  const categories = {PASS: '通过', ENVIRONMENT: '环境故障', COMPILE: '编译失败', TIMEOUT: '执行超时', RUNTIME: '运行异常', TEST: '测试未通过'};
  async function api(path, data) {
    const response = await fetch(base + path, {method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'CSRF-Token': window.init?.csrfNonce || window.CTFd?.config?.csrfNonce || ''}, ...(data ? {body: JSON.stringify(data)} : {})});
    const value = await response.json();
    if (!response.ok || !value.success) throw new Error(value.error || '操作未完成，请稍后重试');
    return value;
  }
  function cell(row, value) {
    const element = document.createElement('td');
    element.textContent = value;
    row.append(element);
    return element;
  }
  function query(id) {
    const params = new URLSearchParams();
    if (course) params.set('dojo', course);
    if (id) params.set('id', id);
    return '/submissions?' + params.toString();
  }
  async function refresh() {
    const data = await api(query());
    const body = document.getElementById('lab-submissions');
    body.replaceChildren();
    if (!data.submissions.length) {
      const row = document.createElement('tr');
      cell(row, '还没有正式核验记录。完成编码并提交核验后会显示在这里。').colSpan = 6;
      body.append(row);
    }
    data.submissions.forEach(item => {
      const row = document.createElement('tr');
      cell(row, new Date(item.timestamp * 1000).toLocaleString() + ' · ' + item.student);
      cell(row, item.gradingView ? ['basic','thinking'].map(stage=>item.gradingView.stages[stage].title+' '+(item.gradingView.stages[stage].passed?'已达标':'待完成')).join(' · ') : item.passed ? '通过' : '需修改');
      cell(row,item.gradingView ? item.gradingView.confirmedScore+'/100 · '+({pending:'AI 评价中',failed:'AI 待重试',suggested:'AI 待确认',confirmed:'AI 已确认'}[item.gradingView.ai.status] || '') : '旧版核验');
      cell(row, (item.submissionSha256 || item.sourceSha256).slice(0, 12));
      cell(row, item.templateVersion + ' / ' + item.testVersion);
      const button = document.createElement('button');
      button.className = 'btn btn-sm btn-outline-primary';
      button.textContent = '查看代码与反馈';
      button.addEventListener('click', async () => {
        try {
          const detail = (await api(query(item.id))).submissions[0];
          renderGrade(detail);
          const code = detail.sources ? Object.entries(detail.sources).map(([name, file]) => '── ' + name + ' ──\nSHA-256：' + file.sha256 + '\n' + file.text).join('\n\n') : detail.source;
          document.getElementById('lab-source').textContent = detail.compiler + '\n提交 SHA-256：' + (detail.submissionSha256 || detail.sourceSha256) + '\n\n' + '── 本次核验保存的代码 ──\n' + code + '\n\n── 分项反馈 ──\n' + detail.results.map(test => `${categories[test.category] || test.category} · ${test.name}\n${test.feedback}`).join('\n\n');
          const panel = document.getElementById('lab-detail');
          panel.hidden = false;
          panel.focus();
        } catch (error) { status.textContent = error.message; }
      });
      cell(row, '').append(button);
      body.append(row);
    });
  }
  function textElement(tag, text, parent) {
    const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;
  }
  function renderGrade(detail) {
    const panel=document.getElementById('lab-grading');panel.replaceChildren();
    const grade=detail.gradingView;
    panel.hidden=!grade;if(!grade)return;
    textElement('h3','本次分级成绩 · '+grade.confirmedScore+'/100',panel);
    textElement('p','基础 80 分、四个思考题各 5 分。AI 在后台复核完成项与缺项。Flag 证明阶段达标；未完成部分按以下量规记分。每份提交独立计算，采用同一源码版本的最高已确认成绩。',panel);
    const table=document.createElement('table');table.className='table';panel.append(table);
    const head=document.createElement('tr');['评分项目','已得 / 满分','完成情况'].forEach(t=>textElement('th',t,head));table.append(head);
    for(const criterion of grade.criteria){
      const row=document.createElement('tr');cell(row,criterion.title);cell(row,criterion.score+' / '+criterion.maxScore);cell(row,criterion.status==='complete'?'已完成':criterion.status==='partial'?'部分完成':'待完成');table.append(row);
    }
    const labels={pending:'AI 正在后台评价，阶段 Flag 与核验分已可使用。',failed:'AI 评价暂未完成，核验分已保存，可以重试或由教师评价。',suggested:'AI 已给出完成情况复核意见。',confirmed:'AI 复核意见已由教师确认。'};
    textElement('p',labels[grade.ai.status],panel);
    if(grade.ai.suggestion){
      textElement('p','AI 复核以本次源码与运行证据为依据，当前核验分 '+grade.confirmedScore+'/100。',panel);
      textElement('p',grade.ai.suggestion.feedback,panel);
      for(const criterion of grade.ai.suggestion.criteria){
        textElement('h4',criterion.title,panel);
        textElement('p',criterion.reason,panel);
        for(const cite of criterion.citations)textElement('pre',cite.file+':'+cite.line+'  '+cite.quote,panel);
      }
    }
    if(grade.ai.status==='confirmed')textElement('p','教师复核：'+grade.ai.decision.reason,panel);
    if(grade.ai.status==='failed'){
      const button=textElement('button','重新请求 AI 评价',panel);button.className='btn btn-outline-secondary mb-3';
      button.addEventListener('click',async()=>{button.disabled=true;try{await api('/reviews',{id:detail.id,operation:'retry'});status.textContent='已重新安排后台评价';await refresh();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    }
    if(teacher && grade.ai.suggestion){
      const form=document.createElement('form');form.className='d-flex flex-wrap mb-4';form.style.gap='.6rem';panel.append(form);
      const reason=document.createElement('input');reason.required=true;reason.placeholder='确认复核意见（不改变分值）';reason.setAttribute('aria-label','确认复核意见');reason.className='form-control';reason.style.maxWidth='28rem';form.append(reason);
      const submit=textElement('button','确认 AI 复核意见',form);submit.type='submit';submit.className='btn btn-primary';
      form.addEventListener('submit',async(event)=>{event.preventDefault();submit.disabled=true;try{await api('/reviews',{id:detail.id,operation:'confirm',reason:reason.value});renderGrade((await api(query(detail.id))).submissions[0]);await refresh();status.textContent='评分已确认并保留修订记录';}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}});
    }
  }
  async function perform(operation, extra = {}) {
    if (busy) return;
    busy = true;
    root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    status.textContent = operation === 'submit' ? '正在保存源码快照并核验，请等待结果…' : '正在处理…';
    try {
      const data = await api('', {operation, ...extra});
      const value = data.result;
      result.hidden = false;
      const details = value.result || value;
      if (operation === 'health') {
        result.textContent = (details.ready ? '环境已就绪' : '环境尚未就绪') + '\n\n' + (details.checks || []).map(check => `${check.passed ? '通过' : '未就绪'} · ${check.name}\n${check.passed ? (check.output || '').split('\n')[0] : check.output}`).join('\n\n');
      } else if (operation === 'snapshot') {
        result.textContent = `已保存 ${details.fileCount} 个工程文件。\n恢复点：${details.id}\n可在“恢复代码”中查看。`;
      } else if (operation === 'history' || operation === 'sync') {
        result.hidden = true;
      } else if (operation === 'restore' || operation === 'reset') {
        result.textContent = (details.applied ? '恢复完成；原代码已自动保存为恢复点。' : '将恢复以下文件，不删除其他文件：') + '\n' + (details.files || []).join('\n');
      } else {
        result.textContent = (categories[value.category] ? categories[value.category] + '\n\n' : '') + (value.output || value.error || '操作未完成');
      }
      status.textContent = value.success === false ? (value.error || '操作未完成') : `操作已结束，用时 ${data.elapsedSeconds} 秒。`;
      if (operation === 'history') {
        const recovery = document.getElementById('lab-recovery');
        recovery.replaceChildren();
        const reset = document.createElement('button');
        reset.className = 'btn btn-sm btn-outline-secondary m-1';
        reset.textContent = '预览恢复本题起始代码';
        reset.addEventListener('click', () => perform('reset'));
        recovery.append(reset);
        for (const item of value.result || []) {
          const button = document.createElement('button');
          button.className = 'btn btn-sm btn-outline-secondary m-1';
          button.textContent = '查看恢复点 ' + item.id;
          button.addEventListener('click', () => perform('restore', {id: item.id}));
          recovery.append(button);
        }
      }
      if (['restore', 'reset'].includes(operation) && !extra.apply && value.success) {
        const button = document.createElement('button');
        button.className = 'btn btn-primary';
        button.textContent = `确认恢复这 ${value.result.files.length} 个文件（自动备份当前代码）`;
        button.addEventListener('click', () => { button.remove(); perform(operation, {id: extra.id, apply: true}); });
        document.getElementById('lab-recovery').replaceChildren(button);
      }
      await refresh();
    } catch (error) { status.textContent = error.message; }
    finally {
      busy = false;
      root.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
  }
  window.setInterval(()=>{if(!busy&&!document.hidden)refresh().catch(()=>{});},20000);
  root.querySelectorAll('[data-operation]').forEach(button => button.addEventListener('click', () => perform(button.dataset.operation)));
  document.getElementById('lab-refresh').addEventListener('click', () => teacher ? refresh().catch(error => {status.textContent = error.message;}) : perform('sync'));
  (async () => {
    if (teacher) { status.textContent = '课程内的正式核验记录'; await refresh(); return; }
    const state = await api('');
    if (state.supported) {
      document.getElementById('lab-controls').hidden = false;
      document.getElementById('lab-meta').textContent = state.manifest.workspace + ' · 环境版本 ' + state.manifest.templateVersion;
      status.textContent = '工程已连接。';
      await perform('sync');
    } else {
      status.textContent = '请先在课程中启动安全编码实验；历史记录仍可查看。';
      await refresh();
    }
  })().catch(error => { status.textContent = error.message; });
})();

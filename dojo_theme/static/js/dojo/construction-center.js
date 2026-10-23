(function () {
  'use strict';
  const api = window.DojoLearning, e = api.escapeHtml;
  const $ = id => document.getElementById(id);
  const state = { data: null, view: 'overview', course: '', status: '', search: '', detail: null, busy: false };
  const read = async path => (await api.request('/construction' + path)).data;
  const write = async (method, path, body) => (await api.json(method, '/construction' + path, body)).data;
  const who = id => state.data.members.find(m => m.userId === id)?.name || (id ? '原成员' : '待领取');
  const course = id => state.data.courses.find(c => c.id === id);
  const canPlan = c => state.data.user.canManage || c.finalId === state.data.user.id;
  const chip = t => `<span class="cc-chip ${t.status === 'released' ? 'good' : ['changes_requested','release_pending'].includes(t.status) ? 'warn' : ''}">${e(state.data.states[t.status])}</span>`;
  const humanDate = x => x ? new Date(x).toLocaleString('zh-CN', {hour12:false}) : '—';
  function notice(message, error = false) { $('cc-notice').textContent = message; $('cc-notice').classList.toggle('cc-error', error); }
  function options(items, value) { return items.map(([id, text]) => `<option value="${e(String(id))}" ${String(value) === String(id) ? 'selected' : ''}>${e(text)}</option>`).join(''); }
  function field(name, label, value = '', type = 'text', required = true) { return `<label>${e(label)}<input name="${name}" type="${type}" value="${e(String(value ?? ''))}" ${required ? 'required' : ''} ${type === 'password' ? 'autocomplete="new-password" minlength="8"' : ''}></label>`; }
  function area(name, label, value = '', required = true) { return `<label>${e(label)}<textarea name="${name}" rows="4" ${required ? 'required' : ''}>${e(String(value ?? ''))}</textarea></label>`; }
  function select(name, label, items, value, required = true) { return `<label>${e(label)}<select name="${name}" ${required ? 'required' : ''}>${options(items, value)}</select></label>`; }
  function check(name, label, value = label, checked = false) { return `<label class="cc-check"><input type="checkbox" name="${name}" value="${e(String(value))}" ${checked ? 'checked' : ''}>${e(label)}</label>`; }
  const multiline = text => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const get = (f, key) => f.get(key)?.trim() || '';
  function form(title, fields, submit, label = '保存') {
    $('cc-form-heading').textContent = title; $('cc-fields').innerHTML = fields; $('cc-form-error').textContent = ''; $('cc-form-submit').textContent = label;
    $('cc-form').oncancel = event => { if ($('cc-form-submit').disabled) event.preventDefault(); };
    $('cc-form-content').onsubmit = async event => {
      event.preventDefault(); const button = $('cc-form-submit'); if (button.disabled) return; button.disabled = true;
      const data = new FormData(event.target), closers = Array.from($('cc-form').querySelectorAll('[data-close]'));
      closers.forEach(closer => { closer.disabled = true; }); $('cc-fields').inert = true;
      try { await submit(data); $('cc-form').close(); await refresh(); if (state.detail && $('cc-detail').open) await openTask(state.detail.task.id); notice('操作已保存。'); }
      catch (error) { $('cc-form-error').textContent = error.message; }
      finally { button.disabled = false; button.textContent = label; closers.forEach(closer => { closer.disabled = false; }); $('cc-fields').inert = false; }
    };
    $('cc-form').showModal();
  }
  async function refresh() {
    const data = await read('/context'); state.data = data;
    if (!data.batches.length) { $('cc-subtitle').textContent = '当前账号尚未加入建设团队。'; $('cc-panel').innerHTML = '<div class="cc-empty">当前账号未加入建设团队。你仍可从素材库选用已验收内容，并在此处理已采用版本的撤销通知。</div>' + noticesHtml(); return; }
    $('cc-subtitle').textContent = `${data.batch.name} · ${data.batch.starts} — ${data.batch.ends} · ${data.members.filter(m=>m.active).length} 位成员`;
    const m = data.metrics;
    $('cc-metrics').innerHTML = [[`${m.released} / ${m.planned}`, '已入库任务 / 计划任务'], [m.totalWeight ? Math.round(m.releasedWeight/m.totalWeight*100)+'%' : '暂无', '按计划工作量完成'], [m.peerPending+m.finalPending, `待复核 ${m.peerPending} · 待终审 ${m.finalPending}`], [m.blocked, '阻塞中的任务'], [m.overdue, '超过首次交付日期']].map(([v,l])=>`<div class="cc-metric"><b>${e(String(v))}</b><span>${e(l)}</span></div>`).join('');
    render();
  }
  function taskTable(tasks) {
    if (!tasks.length) return '<div class="cc-empty">此列表暂无任务。可以调整筛选，或到课程规划完善任务卡。</div>';
    return `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>任务与课程</th><th>产物 / 状态</th><th>负责人</th><th>交付日期</th><th>下一步</th></tr></thead><tbody>${tasks.map(t=>`<tr><td><button class="cc-link" data-task="${e(t.id)}">${e(t.title)}</button><small>${e(t.code)} · ${e(course(t.courseId)?.name)} / ${e(t.chapter)}</small>${t.blocked ? `<small class="cc-error">阻塞：${e(t.blocked)}</small>` : ''}</td><td><span class="cc-chip">${e(state.data.kinds[t.kind])}</span>${chip(t)}</td><td>${e(who(t.ownerId))}<small>${t.weight} 工作量点</small></td><td>${e(t.due)}${t.due < new Date().toISOString().slice(0,10) && !['released','canceled'].includes(t.status) ? '<small class="cc-error">已逾期</small>' : ''}</td><td><button data-task="${e(t.id)}">${t.status === 'open' ? '查看并领取' : t.status === 'planning' ? '完善任务' : '打开任务'}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function render() {
    const d = state.data; if (!d?.batch) return;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'));
    const uid = d.user.id;
    let html = '';
    if (state.view === 'overview') {
      const own = d.tasks.filter(t=>t.ownerId===uid && !['released','canceled'].includes(t.status));
      const waiting = d.tasks.filter(t=>t.peerId===uid&&t.status==='peer_review'||t.finalId===uid&&t.status==='final_review');
      html = (d.user.canManage ? '<div class="cc-actions" style="margin-bottom:16px"><button data-batch-edit>调整批次日期 / 暂停领取</button></div>' : '') +
        `<div class="cc-grid"><section class="cc-card"><h2>今天先做什么</h2><p>${own.length ? `你有 ${own.length} 项待交付任务。先处理退回意见和阻塞，再开始新的创作。` : '从任务大厅领取目标、资料和验收标准完整的任务。'}</p><button class="cc-primary" data-view="${own.length?'mine':'tasks'}">${own.length?'继续我的创作':'浏览任务大厅'}</button></section><section class="cc-card"><h2>审核待办</h2><p>${waiting.length} 项等待你的独立检查。请打开固定版本预览，记录实际测试后再给结论。</p><button data-view="reviews">进入我的审核</button></section></div><section class="cc-card" style="margin-top:16px"><h2>两周推进安排</h2><div class="cc-grid"><div><b>第 1–2 天 · 校准</b><p class="cc-muted">核对真实课程、资料和目标；确认账号；开放小批任务，完成首件样例。</p></div><div><b>第 3–5 天 · 首批交付</b><p class="cc-muted">按计划创作、自测和互审；每天处理阻塞，控制每人最多 2 项在制任务。</p></div><div><b>第 6–10 天 · 修订与扩充</b><p class="cc-muted">根据审核意见修订，再开放下一批；两位终审人员分课程验收。</p></div><div><b>第 11–14 天 · 复用验收</b><p class="cc-muted">完成终审入库、教师选用与章节联调，关闭遗留问题。</p></div></div></section><h2>需要关注</h2>${taskTable(d.tasks.filter(t=>t.blocked||t.releaseError||t.status==='changes_requested').slice(0,15))}`;
      if (d.notices.length) html += noticesHtml();
    } else if (['tasks','mine','reviews'].includes(state.view)) {
      let rows = d.tasks;
      if (state.view==='mine') rows = rows.filter(t=>t.ownerId===uid || t.brief.collaboratorIds?.includes(uid));
      if (state.view==='reviews') rows = rows.filter(t=>t.peerId===uid&&t.status==='peer_review'||t.finalId===uid&&['final_review','release_pending'].includes(t.status));
      html = `<h2>${{tasks:'任务大厅',mine:'我的创作',reviews:'我的审核'}[state.view]}</h2><div class="cc-toolbar"><input id="cc-search" type="search" placeholder="搜索任务名称或编号" value="${e(state.search)}" aria-label="搜索任务"><select id="cc-course-filter" aria-label="课程筛选">${options([['','全部课程'],...d.courses.map(c=>[c.id,c.name])],state.course)}</select><select id="cc-status-filter" aria-label="状态筛选">${options([['','全部状态'],...Object.entries(d.states)],state.status)}</select></div>`;
      rows = rows.filter(t=>(!state.course||t.courseId===state.course)&&(!state.status||t.status===state.status)&&(!state.search||(t.title+t.code).toLowerCase().includes(state.search.toLowerCase())));
      html += taskTable(rows);
    } else if (state.view==='planning') {
      html = '<h2>课程规划与目标覆盖</h2><p class="cc-help">初始化名称与任务模板需要按实际课程校准。资料、目标和验收标准完整后才开放领取。每门课程共用一份资料登记；个人分类不作为团队课程编码。</p>' + d.courses.map(c=>`<section class="cc-card"><div class="cc-row-actions"><h3 style="margin:0;flex:1">${e(c.code)} · ${e(c.name)}</h3>${canPlan(c)?`<button data-plan="${c.id}">编辑课程规划</button><button data-new-task="${c.id}">＋ 任务卡</button>`:''}</div><p class="cc-muted">终审：${e(who(c.finalId))} · 资料 ${c.plan.sources?.length||0} 份 · 目标 ${c.coverage.length} 项</p>${c.coverage.length?`<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>章节 / 学习目标</th><th>要求产物</th><th>已验收覆盖</th></tr></thead><tbody>${c.coverage.map(o=>`<tr><td>${e(o.chapter)} · ${e(o.id)}<small>${e(o.text)}</small></td><td>${o.requiredKinds.map(k=>e(d.kinds[k])).join('、')||'已记录豁免'}</td><td>${o.coveredKinds.map(k=>`<span class="cc-chip good">${e(d.kinds[k])}</span>`).join('')||'待建设'}</td></tr>`).join('')}</tbody></table></div>`:'<p>尚未登记实际学习目标。</p>'}<div class="cc-row-actions" style="margin-top:16px">${(c.plan.chapters||[]).map(ch=>`<button data-chapter="${e(ch.code)}" data-course="${c.id}" ${c.finalId!==uid?'disabled':''}>${e(ch.name)} · 章节联调</button>`).join('')}</div>${Object.entries(c.plan.chapterAcceptances||{}).map(([ch,r])=>`<p class="cc-muted">${e(ch)} 联调记录：${e(humanDate(r.created))} · ${e(r.note)}</p>`).join('')}</section>`).join('');
    } else if (state.view==='members') {
      html = `<h2>团队与账号</h2><section class="cc-card"><p>当前登录：<b>${e(d.user.name)}</b>。账号持续绑定本人，任务转交保留原作者贡献。</p><a class="cc-button" href="/settings">账户设置</a><p class="cc-muted">首次登录会在全站统一激活账号；忘记密码请联系统筹人员。</p></section><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>成员</th><th>角色</th><th>账号状态</th><th>在制任务</th><th>管理</th></tr></thead><tbody>${d.members.map(m=>`<tr><td>${e(m.name)}<small>${e(m.username)}</small></td><td>${e({author:'创作与互审',reviewer:'课程终审',coordinator:'统筹与课程终审'}[m.role])}</td><td>${m.active?(m.activated?'已激活':'待首次改密'):'已停用'}</td><td>${m.inProgress} / ${m.wipLimit}</td><td>${d.user.canManage?`<button data-member="${m.id}">管理</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (state.view==='releases') {
      html = `<h2>验收入库与课程采用</h2><p class="cc-help">入库成果以固定提交版本为准。修订中的新稿不覆盖原验收版本；教师从素材库选入自己的课程后，继续检查并正式发布。</p><div class="cc-actions"><a href="/teacher/library">进入素材库选用</a><button id="cc-load-adoptions">查看采用与撤销记录</button></div><div id="cc-adoptions"></div><h3>已入库与等待入库</h3>${taskTable(d.tasks.filter(t=>t.materialId||t.status==='release_pending'))}${noticesHtml()}`;
    } else {
      html = `<h2>创作者操作指南</h2><section class="cc-card"><ol><li><b>激活个人账号。</b>确认身份并设置新密码。一个人始终使用自己的账号。</li><li><b>阅读任务卡并领取。</b>已分配的任务无需再次领取；核对课程、章节、目标、资料位置、交付和验收标准。资料访问不了先记录阻塞。</li><li><b>开始创作。</b>任务中心带入任务说明和已分配课程打开 AI 共创；上传真实资料，检查 AI 是否实际读到。生成结果保留草稿。</li><li><b>完成自测。</b>逐项执行当前产物检查，不用“已经测试”代替步骤、输入和结果。参考答案、环境、评分依据一起整理。</li><li><b>提交固定版本。</b>选择文件提交，或从本人账号的任何课程选择生成项目；可以补充来源、测试和修订说明。系统生成独立审核副本，记录提交回执。</li><li><b>处理退回。</b>在原项目修订，重新自测并提交新版本。旧提交和意见保留。</li><li><b>独立复核他人任务。</b>只能审核指定给你的任务；先打开固定版本，按同样标准实测，再通过或明确退回。</li><li><b>终审后入库。</b>由终审或统筹完成入库。教师在素材库检索已验收版本、预览并加入自己的课程。</li></ol><h3>提交内容要写到别人能复现</h3><p class="cc-pre">资料引用：文件名、版本、页码/小节、使用范围。\n测试证据：环境版本 → 操作步骤 → 输入 → 预期 → 实际；必要的项目附件位置。\n答案与评分：参考解、解析、评分点、边界与典型错误。\n修订说明：本次增加了什么；逐条回应上一轮审核意见。</p><h3>异常处理</h3><p>无法预览、依赖缺失、资料打不开时，保留原项目，记录链接与错误信息，在任务中填写阻塞原因。交接需记录已做工作、原稿位置、剩余问题；由统筹安排。未完成测试的内容不能作为已验收成果。</p><h3>质量要求</h3>${Object.entries(d.checks).map(([kind,items])=>`<p><b>${e(d.kinds[kind])}：</b>${items.map(e).join('；')}。</p>`).join('')}<h3>使用资料与 AI</h3><p>仅使用本课程允许使用的资料，注明引用与改编位置。不要上传同学的成绩、个人信息或未获准公开的试卷。AI 输出必须自行核实，不能凭空生成来源、测试记录或运行成功的结论。</p></section>`;
    }
    $('cc-panel').innerHTML = html;
  }
  function noticesHtml() { return `<h3>素材撤销通知</h3>${state.data.notices.length ? state.data.notices.map(n=>`<section class="cc-card"><b>${e(n.title)} · v${n.version}</b><p>${e(n.reason)}</p><p class="cc-muted">目标课程编号：${n.courseId} · ${n.resolved?'已处理：'+e(n.resolution):'请检查已采用副本，原副本不会自动删除。'}</p>${!n.resolved?`<button data-resolve="${n.id}">登记处理结果</button>`:''}</section>`).join('') : '<p class="cc-muted">暂无需要处理的撤销通知。</p>'}`; }
  async function openTask(id) {
    const detail = await read('/tasks/'+id); state.detail = detail; const t=detail.task,d=state.data,uid=d.user.id,c=course(t.courseId),b=t.brief;
    $('cc-detail-heading').textContent = t.title;
    const own = uid===t.ownerId, latest=detail.submissions.find(s=>s.id===t.submissionId);
    let buttons = '';
    if(t.status==='open' && uid!==t.peerId && uid!==t.finalId) buttons += '<button class="cc-primary" data-task-action="claim">领取任务</button>';
    if(own&&['working','changes_requested'].includes(t.status)) buttons += '<button class="cc-primary" data-create>开始 / 继续创作</button><button data-submit>提交成果</button>';
    if(own) buttons += '<button data-progress>记录进展 / 申请交接</button><button data-block>记录 / 解除阻塞</button>';
    if(own&&t.status==='released') buttons += '<button data-task-action="new_version">开始新版本</button>';
    if(canPlan(c)&&['planning','open','working','changes_requested'].includes(t.status)) buttons += '<button data-edit-task>编辑任务卡</button>';
    if(d.user.canManage&&['open','working','changes_requested'].includes(t.status)) buttons += '<button data-handover>改派与交接</button>';
    if((d.user.canManage||uid===t.finalId)&&!t.materialId&&t.status!=='canceled') buttons += '<button data-cancel>取消任务</button>';
    if(d.user.canManage&&t.status==='canceled') buttons += '<button data-task-action="reopen">恢复为待完善</button>';
    if(latest&&((uid===t.peerId&&t.status==='peer_review')||(uid===t.finalId&&t.status==='final_review'))) buttons += '<button class="cc-primary" data-review>记录审核结论</button>';
    if(t.status==='release_pending'&&(uid===t.finalId||d.user.canManage)) buttons += '<button class="cc-primary" data-publish>将验收版本入库</button>';
    $('cc-detail-body').innerHTML = `<p>${chip(t)}<span class="cc-chip">${e(d.kinds[t.kind])}</span>${e(t.code)}</p><div class="cc-row-actions">${buttons}</div>${t.releaseError?`<p class="cc-error">入库未完成：${e(t.releaseError)}。修复后可重试同一提交。</p>`:''}<div class="cc-detail-grid"><section><h3>目标与交付</h3><p class="cc-pre">${e(b.objective||'待补充真实学习目标')}</p><p class="cc-pre">${e(b.deliverables||'待补充交付范围')}</p><h3>资料与验收依据</h3><p class="cc-pre">${e(b.sourceNotes||'尚未关联真实课程资料')}</p>${(c.plan.sources||[]).filter(s=>b.sourceIds?.includes(s.id)).map(s=>`<p class="cc-muted">${e(s.id)} · ${e(s.title)} · ${e(s.version)}<br>${e(s.location)}<br>使用范围：${e(s.permission)}</p>`).join('')}<p class="cc-pre">${e(b.acceptance||'待补充验收标准')}</p><h3>类型自测</h3>${d.checks[t.kind]?`<p class="cc-muted">任务说明的类型是「${e(d.kinds[t.kind])}」，以下为该类型的参考清单；实际提交时按你所交项目的类型核对。</p><ul>${d.checks[t.kind].map(s=>`<li>${e(s)}</li>`).join('')}</ul>`:`<p class="cc-muted">本任务不限产物类型，实际提交时按你所交项目的类型核对。可选清单：</p>${Object.entries(d.checks).map(([fam,items])=>`<p class="cc-muted"><b>${e({slides:'课件',demo:'演示',practice:'实践题',quiz:'测验'}[fam])}</b>：${items.map(e).join('；')}</p>`).join('')}`}</section><aside><h3>任务安排</h3><dl class="cc-kv"><dt>课程 / 章节</dt><dd>${e(c.name)} / ${e(t.chapter)}</dd><dt>主责人</dt><dd>${e(who(t.ownerId))}</dd><dt>协作者</dt><dd>${(b.collaboratorIds||[]).map(who).map(e).join('、')||'无'}</dd><dt>复核 / 终审</dt><dd>${e(who(t.peerId))} / ${e(who(t.finalId))}</dd><dt>学习者</dt><dd>${e(b.audience||'待补充')}</dd><dt>学习时长</dt><dd>${e(String(b.estimatedMinutes||'待定'))} 分钟</dd><dt>交付日期</dt><dd>${e(t.due)}</dd><dt>工作量</dt><dd>${t.weight} 点</dd><dt>阻断依赖</dt><dd>${(b.dependencies||[]).map(id=>e(d.tasks.find(x=>x.id===id)?.code||id)).join('、')||'无'}</dd></dl>${t.blocked?`<h3>当前阻塞</h3><p class="cc-error cc-pre">${e(t.blocked)}</p>`:''}${b.handoverProject?`<p><a href="${e(b.handoverProject.href)}" target="_blank" rel="noopener">打开交接后的项目草稿 ↗</a></p>`:''}</aside></div><h3>提交与审核记录</h3>${detail.submissions.length?detail.submissions.map(s=>`<section class="cc-card"><div class="cc-row-actions"><b>第 ${s.number} 次提交</b><span class="cc-muted">${e(humanDate(s.created))} · ${s.source.kind==='file'?'文件提交':'生成项目提交'}</span><button data-preview="${s.id}">打开固定版本原生预览 ↗</button>${s.release?`<span class="cc-chip ${s.release.revoked?'warn':'good'}">素材 v${s.release.version} · ${s.release.revoked?'已撤销':'已验收'}</span>`:''}</div>${s.source.kind==='file'?'<p class="cc-muted">'+s.source.files.map(file=>e(file.filename)).join('、')+'</p>':''}<details><summary>自测证据与版本指纹</summary>${[['sources','资料引用'],['tests','测试步骤与结果'],['answers','答案与评分'],['environment','环境与依赖'],['changes','本次修订']].map(([k,l])=>`<h4>${l}</h4><p class="cc-pre">${e(s.evidence[k])}</p>`).join('')}<p class="cc-muted">固定内容 SHA-256：${e(s.contentHash)}</p></details>${[['peer','复核'],['final','终审']].map(([k,l])=>s[k]?.decision?`<p><b>${l} · ${s[k].decision==='pass'?'通过':'退回'} · ${e(who(s[k].actorId))}</b></p><p class="cc-pre">${e(s[k].note)}</p>`:'').join('')}${s.release&&!s.release.revoked&&uid===t.finalId?`<button data-revoke="${s.release.id}">撤销此版本验收</button>`:''}</section>`).join(''):'<p class="cc-muted">尚未提交。先完成原项目创作与自测。</p>'}<details><summary>任务活动记录</summary><div class="cc-timeline">${detail.events.map(ev=>`<p><time>${e(humanDate(ev.created))} · ${e(who(ev.actorId))}</time>${e(eventLabel(ev.action))}${ev.data.reason?'<br>'+e(ev.data.reason):''}</p>`).join('')}</div></details>`;
    if(!$('cc-detail').open) $('cc-detail').showModal();
  }
  function eventLabel(action) { return ({'task.plan':'更新任务安排','task.claim':'领取任务','task.block':'更新阻塞','task.progress':'记录进展 / 交接申请','task.handover':'完成交接','task.cancel':'取消任务','task.new_version':'开始新版本','submission.create':'提交固定版本','review.peer':'记录独立复核','review.final':'记录终审','release.create':'验收入库','release.failed':'入库失败待重试','release.revoke':'撤销验收'})[action]||action; }
  function editTask(t, c) {
    const d=state.data,b=t?.brief||{},peers=d.members.filter(m=>m.active&&m.userId!==c.finalId);
    form(t?'编辑任务卡':'新建任务卡', `<p class="cc-help">先保存待完善草稿。勾选“开放领取”时系统会检查资料、目标、审核独立性与依赖。</p>${!t?field('code','任务编号',c.code+'-'):''}${field('title','任务名称',t?.title)}<div class="cc-grid">${select('chapter','章节',(c.plan.chapters||[]).map(ch=>[ch.code,ch.code+' · '+ch.name]),t?.chapter)}${select('kind','任务要求的产物类型（可选，默认不限）',Object.entries(d.kinds),t?.kind||'any')}${field('due','首次交付日期',t?.due||d.batch.ends,'date')}${field('weight','计划工作量（1–20 点）',t?.weight||1,'number')}${select('peerId','独立复核人员',[['','请选择'],...peers.map(m=>[m.userId,m.name])],t?.peerId)}${field('estimatedMinutes','预期学习时长（分钟）',b.estimatedMinutes||30,'number')}</div>${area('objective','可观察的学习目标',b.objective)}${area('audience','目标学习者、前置知识与难度',b.audience)}${area('deliverables','交付范围与必交文件',b.deliverables)}${area('acceptance','验收条件',b.acceptance)}${area('sourceNotes','准确引用位置、允许改动和不得改动的内容',b.sourceNotes)}${area('exclusions','不包含的工作（可选）',b.exclusions,false)}<fieldset class="cc-fieldset"><legend>关联学习目标</legend>${(c.plan.objectives||[]).map(o=>check('objectiveIds',o.id+' · '+o.text,o.id,b.objectiveIds?.includes(o.id))).join('')||'请先在课程规划登记真实目标。'}</fieldset><fieldset class="cc-fieldset"><legend>关联资料</legend>${(c.plan.sources||[]).map(s=>check('sourceIds',s.id+' · '+s.title,s.id,b.sourceIds?.includes(s.id))).join('')||'请先登记实际课程资料。'}</fieldset><fieldset class="cc-fieldset"><legend>协作者（参与创作，须回避审核）</legend>${d.members.filter(m=>m.active&&m.userId!==t?.ownerId).map(m=>check('collaboratorIds',m.name,m.userId,b.collaboratorIds?.includes(m.userId))).join('')}</fieldset><fieldset class="cc-fieldset"><legend>阻断依赖（须入库后才能领取）</legend>${d.tasks.filter(x=>x.id!==t?.id&&x.status!=='canceled').map(x=>check('dependencies',x.code+' · '+x.title,x.id,b.dependencies?.includes(x.id))).join('')}</fieldset>${!t||t.status==='planning'?check('open','资料和任务已完整，开放领取','yes'):''}`,async f=>{
      const payload={revision:t?.revision,code:get(f,'code'),title:get(f,'title'),chapter:get(f,'chapter'),kind:get(f,'kind'),due:get(f,'due'),weight:Number(f.get('weight')),peerId:Number(f.get('peerId'))||null,open:f.has('open'),brief:{...b,objective:get(f,'objective'),audience:get(f,'audience'),deliverables:get(f,'deliverables'),acceptance:get(f,'acceptance'),sourceNotes:get(f,'sourceNotes'),exclusions:get(f,'exclusions'),estimatedMinutes:Number(f.get('estimatedMinutes')),objectiveIds:f.getAll('objectiveIds'),sourceIds:f.getAll('sourceIds'),collaboratorIds:f.getAll('collaboratorIds').map(Number),dependencies:f.getAll('dependencies')}};
      await write(t?'PATCH':'POST',t?'/tasks/'+t.id:'/courses/'+c.id+'/tasks',payload);
    });
  }
  function editPlan(c) {
    const p=c.plan;
    form('课程规划 · '+c.code,`${field('name','课程名称',c.name)}${select('finalId','课程终审',state.data.members.filter(m=>m.active&&['reviewer','coordinator'].includes(m.role)).map(m=>[m.userId,m.name]),c.finalId)}${area('audience','学习者与总范围',p.audience,false)}${area('chapters','章节：每行“编码 | 名称”',(p.chapters||[]).map(ch=>ch.code+' | '+ch.name).join('\n'))}${area('objectives','目标：每行“编号 | 章节编码 | 可观察目标 | 必需产物（课件,演示,实践题目,测验） | 豁免理由（可选）”',(p.objectives||[]).map(o=>[o.id,o.chapter,o.text,(o.requiredKinds||[]).map(k=>state.data.kinds[k]).join(','),o.waiverReason||''].join(' | ')).join('\n'),false)}${area('sources','资料：每行“编号 | 名称 | 文件位置或链接及页码 | 版本 | 允许使用的范围”',(p.sources||[]).map(s=>[s.id,s.title,s.location,s.version,s.permission].join(' | ')).join('\n'),false)}<p class="cc-help">文件可先上传到原平台课程/AI 共创资料区，再登记准确位置。请使用实际资料；尚未补齐资料的任务保持待完善。</p>`,async f=>{
      const kindIds=Object.fromEntries(Object.entries(state.data.kinds).map(([k,v])=>[v,k]));
      const plan={...p,audience:get(f,'audience'),chapters:multiline(f.get('chapters')).map(s=>{const[a,b]=s.split('|').map(x=>x.trim());return {code:a,name:b};}),objectives:multiline(f.get('objectives')).map(s=>{const[id,chapter,text,kinds='',waiverReason='']=s.split('|').map(x=>x.trim());return {id,chapter,text,requiredKinds:kinds.split(/[,，、]/).map(x=>x.trim()).filter(Boolean).map(k=>kindIds[k]||k),waiverReason};}),sources:multiline(f.get('sources')).map(s=>{const[id,title,location,version,permission]=s.split('|').map(x=>x.trim());return {id,title,location,version,permission};})};
      await write('PATCH','/courses/'+c.id,{revision:c.revision,name:get(f,'name'),finalId:Number(f.get('finalId')),plan});
    });
  }
  async function submitForm(t) {
    const config=await read('/tasks/'+t.id+'/submission-options');
    const key=Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
    const picker={sources:[],offset:0,pagination:null,serial:0,loaded:false};
    let selected=null,searchTimer=null;
    const sizeLabel=size=>(size/1024/1024).toFixed(2)+' MB';
    const limits=config.fileLimits;
    function validateFiles(files) {
      if(!files.length||files.length>limits.maxFiles) throw new Error(`请选择 1–${limits.maxFiles} 个成果文件。`);
      if(files.some(file=>!file.size||file.size>limits.maxFileBytes)) throw new Error('成果文件不能为空，且单文件不得超过 '+sizeLabel(limits.maxFileBytes)+'。');
      if(files.reduce((sum,file)=>sum+file.size,0)>limits.maxTotalBytes) throw new Error('本次文件合计不得超过 '+sizeLabel(limits.maxTotalBytes)+'。');
    }
    form('提交成果 · '+t.code,`<p class="cc-help">提交后生成固定审核副本。可以上传成果文件，也可以选择本人全部课程中的生成项目；原项目后续修改不会改变本次提交。</p>${select('submissionMode','提交方式',[['file','文件提交'],['project','生成项目提交']],'file')}<fieldset id="cc-file-submit" class="cc-fieldset"><legend>上传成果文件</legend><label>选择文件<input id="cc-submit-files" name="files" type="file" multiple required></label><p class="cc-muted">最多 ${limits.maxFiles} 个文件，单文件 ${sizeLabel(limits.maxFileBytes)}，合计 ${sizeLabel(limits.maxTotalBytes)}。文件供审核和教师复用。</p><div id="cc-submit-file-list" role="status"></div></fieldset><fieldset id="cc-project-submit" class="cc-fieldset" hidden disabled><legend>选择生成项目</legend><div class="cc-grid">${select('projectCourse','课程范围',[['','本人全部课程与未关联课程的项目'],...config.courses.map(c=>[c.id,c.name])],'',false)}${select('projectKind','项目分类',Object.entries(config.sourceKinds),'artifact',false)}</div><div class="cc-source-search"><label>搜索项目<input name="projectSearch" type="search" placeholder="输入项目名称"></label><button type="button" id="cc-source-search">搜索</button></div>${select('projectSource','生成项目',[['','请先选择项目']],'')}<p id="cc-source-state" class="cc-muted" role="status"></p><div class="cc-actions"><button type="button" id="cc-source-prev">上一页</button><button type="button" id="cc-source-next">下一页</button></div></fieldset><details class="cc-optional"><summary>补充说明与自测记录（可选，不填也能提交）</summary><p class="cc-help">审核人会在固定版本上独立核对。这里填的内容只是给审核人更多线索，留空不影响提交。</p>${area('sources','引用来源、位置和允许使用的范围','',false)}${area('tests','自测步骤、输入、预期与实际结果（可选）','',false)}${area('answers','参考答案、解析与评分依据的位置（可选）','',false)}${area('environment','环境、版本、依赖和重置方法（可选）','',false)}${area('changes','本次内容与逐条修订说明（可选）','',false)}<fieldset class="cc-fieldset"><legend>自测记录（选填；勾选时请完成全部检查）</legend><div id="cc-submit-checks"></div></fieldset></details>`,async f=>{
      const fileMode=f.get('submissionMode')==='file';
      if(!fileMode&&!selected) throw new Error('请选择要提交的生成项目。');
      const payload={revision:t.revision,requestKey:key,source:fileMode?{kind:'file'}:{kind:selected.kind,id:selected.id},evidence:{sources:get(f,'sources'),tests:get(f,'tests'),answers:get(f,'answers'),environment:get(f,'environment'),changes:get(f,'changes'),checks:f.getAll('checks')}};
      if(fileMode) {
        const files=f.getAll('files').filter(file=>file&&file.name);
        validateFiles(files);
        const data=new FormData();data.set('submission',JSON.stringify(payload));files.forEach(file=>data.append('files',file,file.name));
        await api.multipart('/construction/tasks/'+t.id+'/submit',data,'文件提交失败，请保留文件后重试。',{onProgress:progress=>{if(progress.total)$('cc-form-submit').textContent='上传中 '+Math.round(progress.loaded/progress.total*100)+'%';}});
      } else {
        await write('POST','/tasks/'+t.id+'/submit',payload);
      }
    },'提交固定版本');
    const content=$('cc-fields'),mode=content.querySelector('[name=submissionMode]');
    const sourceField=content.querySelector('[name=projectSource]');
    function showChecks(type) { $('cc-submit-checks').innerHTML=(config.checks[type]||[]).map(label=>check('checks',label)).join(''); }
    function clearSelection() { selected=null;sourceField.value='';showChecks(mode.value==='file'?'file-package':''); }
    async function loadSources(reset=false) {
      if(reset)picker.offset=0;
      const serial=++picker.serial;
      clearSelection();sourceField.disabled=true;$('cc-source-state').textContent='正在读取项目…';
      $('cc-source-prev').disabled=true;$('cc-source-next').disabled=true;
      const params=new URLSearchParams({kind:content.querySelector('[name=projectKind]').value,q:content.querySelector('[name=projectSearch]').value,offset:picker.offset,limit:24});
      const courseId=content.querySelector('[name=projectCourse]').value;if(courseId)params.set('courseId',courseId);
      try {
        const result=await read('/tasks/'+t.id+'/submission-sources?'+params);
        if(serial!==picker.serial||!$('cc-form').open||!sourceField.isConnected)return;
        picker.sources=result.sources;picker.pagination=result.pagination;picker.loaded=true;
        sourceField.innerHTML=options([['','请选择生成项目'],...picker.sources.map((source,index)=>[index,`${config.courses.find(c=>c.id===source.courseId)?.name||'未关联课程'} · ${source.typeLabel} · ${source.title}`])],'');
        $('cc-source-state').textContent=result.sources.length?`共 ${result.pagination.total} 个项目，当前 ${picker.offset+1}–${picker.offset+result.sources.length}。`:'当前条件下暂无可提交项目。可切换课程或项目分类，也可改用文件提交。';
        $('cc-source-prev').disabled=picker.offset===0;$('cc-source-next').disabled=!result.pagination.hasNext;
      } catch(error) {
        if(serial===picker.serial&&$('cc-form').open&&sourceField.isConnected)$('cc-source-state').textContent=error.message;
      } finally { if(serial===picker.serial)sourceField.disabled=false; }
    }
    function changeMode() {
      const fileMode=mode.value==='file';
      $('cc-file-submit').hidden=!fileMode;$('cc-file-submit').disabled=!fileMode;
      $('cc-project-submit').hidden=fileMode;$('cc-project-submit').disabled=fileMode;
      showChecks(fileMode?'file-package':selected?.type);
      if(!fileMode&&!picker.loaded)loadSources(true);
    }
    mode.addEventListener('change',changeMode);
    $('cc-form').addEventListener('close',()=>{picker.serial++;clearTimeout(searchTimer);},{once:true});
    sourceField.addEventListener('change',()=>{selected=sourceField.value===''?null:picker.sources[Number(sourceField.value)];showChecks(selected?.type);});
    for(const name of ['projectCourse','projectKind'])content.querySelector(`[name=${name}]`).addEventListener('change',()=>loadSources(true));
    content.querySelector('[name=projectSearch]').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadSources(true),350);});
    content.querySelector('[name=projectSearch]').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(searchTimer);loadSources(true);}});
    for(const [id,change] of [['cc-source-search',0],['cc-source-prev',-24],['cc-source-next',24]])$(id).addEventListener('click',event=>{event.stopPropagation();picker.offset=change?Math.max(0,picker.offset+change):0;loadSources();});
    $('cc-submit-files').addEventListener('change',()=>{
      const files=Array.from($('cc-submit-files').files);$('cc-form-error').textContent='';
      $('cc-submit-file-list').innerHTML=files.map(file=>`<p>${e(file.name)} <span class="cc-muted">${e(sizeLabel(file.size))}</span></p>`).join('');
      if(files.length)try{validateFiles(files);}catch(error){$('cc-form-error').textContent=error.message;}
    });
    changeMode();
  }
  function reviewForm(t) {
    const s=state.detail.submissions.find(x=>x.id===t.submissionId);
    form(t.status==='peer_review'?'独立复核':'教师终审',`<p class="cc-help">当前审核第 ${s.number} 次提交。必须依据固定副本；作者原稿后续修改不改变本次内容。</p><button type="button" data-preview="${s.id}">打开固定版本原生预览 ↗</button>${check('previewed','我已打开固定版本并完成实际核验','yes')}${select('decision','结论',[['return','退回修改'],['pass','通过本轮审核']],'return')}${area('note','实际检查过程、结论依据；退回时逐项写出问题、位置和预期修改')}<fieldset class="cc-fieldset"><legend>通过前必须全部核验</legend>${(s.checks||state.data.checks[t.kind]).map(x=>check('checks',x)).join('')}</fieldset>`,async f=>write('POST','/tasks/'+t.id+'/review',{revision:t.revision,submissionId:s.id,decision:get(f,'decision'),note:get(f,'note'),checks:f.getAll('checks'),previewed:f.has('previewed')}),'提交审核结论');
  }
  async function handle(button) {
    const d=state.data,t=state.detail?.task;
    if(button.dataset.view) { state.view=button.dataset.view; render(); return; }
    if(button.dataset.task) return openTask(button.dataset.task);
    if(button.hasAttribute('data-batch-edit')) return form('建设批次设置',field('name','批次名称',d.batch.name)+field('starts','开始日期',d.batch.starts,'date')+field('ends','结束日期',d.batch.ends,'date')+select('status','领取状态',[['active','开放领取'],['paused','暂停新领取'],['closed','本批次已结束']],d.batch.status)+'<p class="cc-help">暂停只限制新领取，已有任务仍可继续处理。修改批次日期不会静默更改任务的承诺交付日期，请在各任务卡中协调调整。</p>',f=>write('PATCH','/batches/'+d.batch.id,{name:get(f,'name'),starts:get(f,'starts'),ends:get(f,'ends'),status:get(f,'status')}));
    if(button.dataset.plan) return editPlan(course(button.dataset.plan));
    if(button.dataset.newTask) return editTask(null,course(button.dataset.newTask));
    if(button.hasAttribute('data-edit-task')) return editTask(t,course(t.courseId));
    if(button.dataset.taskAction) { await write('POST','/tasks/'+t.id+'/action',{revision:t.revision,action:button.dataset.taskAction}); await refresh(); return openTask(t.id); }
    if(button.hasAttribute('data-create')) { const context=await read('/tasks/'+t.id+'/create-context'); window.location.assign(context.href); return; }
    if(button.hasAttribute('data-submit')) return submitForm(t);
    if(button.hasAttribute('data-review')) return reviewForm(t);
    if(button.hasAttribute('data-publish')) { const result=await write('POST','/tasks/'+t.id+'/publish',{revision:t.revision}); await refresh(); await openTask(t.id); notice(result.failed?'入库未完成，请查看错误后重试。':'已验收入库，教师可以在素材库选用了。',!!result.failed); return; }
    if(button.dataset.preview) {
      const target=window.open('about:blank','_blank'); if(target) target.opener=null;
      try { const result=await write('POST','/submissions/'+button.dataset.preview+'/preview',{}); if(target) target.location=result.href; else window.location.assign(result.href); }
      catch(error) { if(target) target.close(); throw error; } return;
    }
    if(button.hasAttribute('data-block')||button.hasAttribute('data-progress')||button.hasAttribute('data-cancel')) {
      const action=button.hasAttribute('data-block')?'block':button.hasAttribute('data-progress')?'progress':'cancel';
      return form({block:'记录阻塞（留空即解除）',progress:'记录进展或申请交接',cancel:'取消任务并记录范围变更'}[action],area('reason','说明、项目位置、已完成与待解决事项',action==='block'?t.blocked:'',action!=='block'),f=>write('POST','/tasks/'+t.id+'/action',{revision:t.revision,action,reason:get(f,'reason')}));
    }
    if(button.hasAttribute('data-handover')) return form('任务交接',select('userId','接手成员',d.members.filter(m=>m.active&&m.activated&&![t.peerId,t.finalId,t.ownerId].includes(m.userId)).map(m=>[m.userId,m.name]))+area('reason','原稿位置、已做工作、遗留问题和交接依据')+'<p class="cc-help">如有历史提交，将复制最近一次固定提交到接手人的工作区。尚未提交的原稿仍需在交接说明中明确位置与接续方式。</p>',f=>write('POST','/tasks/'+t.id+'/action',{revision:t.revision,action:'handover',userId:Number(f.get('userId')),reason:get(f,'reason')}));
    if(button.dataset.member) { const m=d.members.find(x=>x.id===button.dataset.member); return form('管理成员 · '+m.username,field('name','姓名或成员编号',m.name)+field('wipLimit','在制上限（1–5）',m.wipLimit,'number')+select('active','使用状态',[['yes','启用'],['no','停用（须先交接）']],m.active?'yes':'no')+field('resetPassword','重置临时密码（可留空；单独发给本人）','','password',false),f=>write('PATCH','/members/'+m.id,{name:get(f,'name'),wipLimit:Number(f.get('wipLimit')),active:f.get('active')==='yes',resetPassword:get(f,'resetPassword')})); }
    if(button.dataset.revoke) return form('撤销验收版本',area('reason','错误原因、影响和对已采用课程的处理建议')+'<p class="cc-help">该版本将停止新导入；已有课程副本保留，并生成待处理通知。</p>',f=>write('POST','/releases/'+button.dataset.revoke+'/revoke',{reason:get(f,'reason')}),'确认撤销');
    if(button.dataset.resolve) return form('登记课程处理结果',area('resolution','已核对的课程副本、采取的修正及验证结果'),f=>write('PATCH','/notices/'+button.dataset.resolve,{resolution:get(f,'resolution')}));
    if(button.dataset.chapter) { const checks=['目标覆盖','术语一致','先后顺序','答案一致','时长合理','目标课程试用']; return form('章节联调与验收',area('note','目标课程位置、实际试用过程、时长和遗留问题')+checks.map(s=>check('checks',s)).join(''),f=>write('POST','/courses/'+button.dataset.course+'/accept-chapter',{chapter:button.dataset.chapter,note:get(f,'note'),checks:f.getAll('checks')})); }
    if(button.id==='cc-load-adoptions') { const report=await read('/report?batchId='+d.batch.id); $('cc-adoptions').innerHTML=`<section class="cc-card"><h3>采用记录（独立课程草稿）</h3>${report.adoptions.length?report.adoptions.map(r=>`<p>${e(r.title)} v${r.version} → ${e(r.courseName)} · ${e(r.ownerName)} · ${e(humanDate(r.created))}</p>`).join(''):'暂无教师导入记录。'}<h3>批次活动</h3>${report.events.slice(0,30).map(r=>`<p class="cc-muted">${e(humanDate(r.created))} · ${e(who(r.actorId))} · ${e(eventLabel(r.action))}</p>`).join('')}</section>`; }
  }
  $('construction-center').addEventListener('click',async event=>{
    const button=event.target.closest('button'); if(!button||(button.type==='submit'&&button.form)) return;
    if(button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
    if(button.disabled) return;
    button.disabled=true;
    try { if(button.id==='cc-refresh') { await refresh(); notice('已刷新。'); } else await handle(button); }
    catch(error) { notice(error.message,true); if($('cc-form').open) $('cc-form-error').textContent=error.message; else if($('cc-detail').open) { const p=document.createElement('p'); p.className='cc-error';p.textContent=error.message;$('cc-detail-body').prepend(p); } }
    finally { button.disabled=false; }
  });
  $('cc-panel').addEventListener('change',event=>{ const el=event.target;if(el.id==='cc-course-filter')state.course=el.value;else if(el.id==='cc-status-filter')state.status=el.value;else if(el.id==='cc-search')state.search=el.value;else return;render(); });
  $('cc-detail').addEventListener('close',()=>{state.detail=null;});
  refresh().then(()=>notice('先按实际课程补齐资料和目标，再开放首批任务。')).catch(error=>notice(error.message,true));
})();

(function (host, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else host.DojoAnalytics = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const names = {complete: "已完成", verified: "核验通过，待确认", working: "正在练习", help: "需要帮助", idle: "待跟进", not_started: "尚未开始", empty: "暂无任务"};
  const tones = {complete: "#087f74", verified: "#3158d4", working: "#6294e8", help: "#c14654", idle: "#a55a0a", not_started: "#a6b2c7", empty: "#a6b2c7"};
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const pct = value => value == null || !Number.isFinite(Number(value)) ? "—" : `${Math.round(Number(value) * 100)}%`;
  const num = value => new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1}).format(Number(value) || 0);
  const date = (value, short) => value ? new Date(value).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...(short ? {} : {hour: "2-digit", minute: "2-digit"})}) : "暂无记录";
  const icon = name => `<i class="fas fa-${name}" aria-hidden="true"></i>`;
  const badge = status => `<span class="ix-status is-${esc(status)}">${esc(names[status] || status)}</span>`;
  const empty = (title, text) => `<div class="ix-empty">${icon("chart-bar")}<strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const scopeParams = values => {
    const query = new URLSearchParams({timeRange: values?.timeRange || "30d"});
    for (const key of ["studentId", "moduleIndex", "taskKey"]) if (values?.[key] !== "" && values?.[key] != null) query.set(key, values[key]);
    return query;
  };
  const completion = student => student.completionRate ?? student.verifiedCompletion ?? null;
  const filterStudents = (students, search, status, taskKey) => students.filter(s => {
    const match = !search || `${s.name} ${s.userId}`.toLowerCase().includes(search.toLowerCase());
    const current = taskKey ? (s.cells.find(c => c.taskKey === taskKey)?.status || "not_started") : s.status;
    return match && (status === "all" || status === "attention" ? status !== "attention" || ["help", "idle"].includes(current) : current === status);
  });

  function create(root, options) {
    if (!root) return null;
    const doc = root.ownerDocument, win = doc.defaultView;
    const atlas = win.DojoLearningAtlas;
    if (!atlas) { root.textContent = "学情组件未能载入，请刷新后重试。"; return null; }
    const reduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = {course: null, data: null, sequence: 0, controller: null, view: "overview", search: "", status: "all", rosterPage: 0, taskPage: 0, panoramaPage: 0, focusTask: "", private: true, screen: false, paused: reduced, atlasTaskPage: 0, atlasStudentPage: 0, sceneTask: "", auto: false, busy: false, filters: {}, pendingFilters: null, charts: new Map(), chartResizers: new Map(), detail: null, detailSequence: 0, returnFocus: null};
    root.classList.add("xj-insights");
    root.innerHTML = `
      <header class="ix-header"><div><span class="ix-brand-line">玄甲 / LEARNING INTELLIGENCE</span><h2><span id="ix-title">学情分析</span><span class="ix-live-label">真实学习态势</span></h2><p id="ix-headline">从作业进度找到学生需要的支持。</p></div><div class="ix-actions"><button type="button" data-ix="refresh">${icon("sync-alt")}<span>刷新</span></button><button type="button" data-ix="screen" aria-pressed="false">${icon("expand")}<span>教学大屏</span></button><button type="button" data-ix="export">${icon("download")}<span>导出</span></button></div></header>
      <section class="ix-toolbar" aria-label="分析范围"><label>活动时间<select id="ix-range"><option value="7d">近 7 天</option><option value="30d">近 30 天</option><option value="12w">近 12 周</option><option value="90d">近 90 天</option><option value="lifetime">全部时间</option></select></label><label>章节<select id="ix-module"><option value="">全部章节</option></select></label><label>学生<select id="ix-student"><option value="">全班学生</option></select></label><button type="button" data-ix="reset" class="ix-quiet">清除范围</button><span class="ix-freshness" id="ix-freshness"></span><div class="ix-screen-tools"><label><input type="checkbox" id="ix-private" checked>隐藏姓名</label><label><input type="checkbox" id="ix-auto">每分钟刷新</label></div></section>
      <div id="ix-message" class="ix-message" role="status" aria-live="polite" hidden></div>
      <div id="ix-scope" class="ix-scope"></div>
      <div id="ix-content"><div class="ix-loading" role="status"><span></span><strong>正在准备学情分析</strong><p>读取已保存的作业与核验记录。</p></div></div>
      <div id="ix-scene-tooltip" role="tooltip" hidden></div>
      <dialog class="xj-insights-dialog" id="ix-dialog" aria-labelledby="ix-dialog-title"><header><div><small id="ix-dialog-context"></small><h2 id="ix-dialog-title">学习详情</h2></div><button type="button" data-ix="close-dialog" aria-label="关闭学习详情">${icon("times")}</button></header><div id="ix-dialog-content"></div></dialog>`;
    const $ = id => root.querySelector(`#${id}`);
    const dialog = $("ix-dialog");
    let screenAnchor = null, screenSiblings = [], screenPosition = null;
    function displayName(student) { return state.screen && state.private ? `学生 ${student.userId}` : student.name; }
    function apiPath(suffix = "", filters = state.filters) { return `/teaching/insights/${encodeURIComponent(state.course.referenceId || state.course.id)}${suffix}${suffix.includes("?") ? "" : "?" + scopeParams(filters)}`; }
    function message(text, error = false) {
      const node = $("ix-message"); node.hidden = !text; node.classList.toggle("is-error", error); node.textContent = text;
    }
    function disposeCharts() { for (const observer of state.chartResizers.values()) observer.disconnect(); state.chartResizers.clear(); for (const chart of state.charts.values()) chart.dispose(); state.charts.clear(); }
    function setCourse(course) {
      if (!course) return;
      const key = course.referenceId || course.id;
      if (key === (state.course?.referenceId || state.course?.id)) { state.course = course; return; }
      state.sequence++; state.controller?.abort(); closeDialog(); disposeCharts();
      state.busy = false; win.clearTimeout(searchTimer);
      if (state.screen) screen(false, false);
      $("ix-module").innerHTML = '<option value="">全部章节</option>';
      $("ix-student").innerHTML = '<option value="">全班学生</option>';
      state.course = course; state.data = null; state.atlasTaskPage = 0; state.atlasStudentPage = 0; state.sceneTask = ""; state.pendingFilters = null; state.search = ""; state.status = "all"; state.rosterPage = 0; state.taskPage = 0; state.focusTask = ""; state.activeOnly = false; state.newOnly = false;
      const params = new URL(win.location.href).searchParams;
      state.filters = {timeRange: params.get("learningRange") || "30d", moduleIndex: params.get("learningModule") || "", studentId: params.get("learningStudent") || "", taskKey: params.get("learningTask") || (params.get("learningQuestion") ? "q:" + params.get("learningQuestion") : "")};
      state.view = ["overview", "students", "followups"].includes(params.get("learningView")) ? params.get("learningView") : "overview";
      state.status = ["all", "attention", ...Object.keys(names)].includes(params.get("learningStatus")) ? params.get("learningStatus") : "all";
      state.focusTask = params.get("learningFocus") || "";
      $("ix-content").innerHTML = `<div class="ix-loading" role="status"><span></span><strong>准备${esc(course.name || "课程")}的学习记录</strong><p>选择“学情”后按需读取。</p></div>`;
      syncControls();
    }
    function syncControls() {
      const filters = state.data?.filterOptions;
      if (filters) {
        $("ix-module").innerHTML = '<option value="">全部章节</option>' + filters.modules.map(m => `<option value="${m.index}">${esc(m.name)}</option>`).join("");
        $("ix-student").innerHTML = '<option value="">全班学生</option>' + filters.students.map(s => `<option value="${s.userId}">${esc(displayName(s))}</option>`).join("");
      }
      const displayed = state.pendingFilters || state.filters;
      $("ix-range").value = displayed.timeRange || "30d";
      $("ix-module").value = displayed.moduleIndex ?? "";
      $("ix-student").value = displayed.studentId ?? "";
      root.querySelector('[data-ix="refresh"]').disabled = state.busy;
      root.querySelector('[data-ix="export"]').disabled = !state.data || state.busy;
      $("ix-content").setAttribute("aria-busy", String(state.busy));
    }
    function syncUrl() {
      if (!state.course) return;
      const url = new URL(win.location.href);
      for (const [param, key] of [["learningRange", "timeRange"], ["learningModule", "moduleIndex"], ["learningStudent", "studentId"], ["learningTask", "taskKey"]]) {
        const value = state.filters[key];
        if (value == null || value === "" || key === "timeRange" && value === "30d") url.searchParams.delete(param);
        else url.searchParams.set(param, value);
      }
      url.searchParams.delete("learningQuestion");
      if (state.status === "all") url.searchParams.delete("learningStatus"); else url.searchParams.set("learningStatus", state.status);
      if (!state.focusTask) url.searchParams.delete("learningFocus"); else url.searchParams.set("learningFocus", state.focusTask);
      if (state.view === "overview") url.searchParams.delete("learningView"); else url.searchParams.set("learningView", state.view);
      win.history.replaceState(null, "", url);
    }
    async function load(course, config = {}) {
      setCourse(course);
      if (!state.course) return false;
      const sequence = ++state.sequence;
      state.controller?.abort(); state.controller = new AbortController();
      const proposed = {...(state.pendingFilters || state.filters), ...(config.filters || {})};
      state.pendingFilters = proposed;
      state.busy = true; syncControls(); message(state.data ? "正在更新，当前仍是上次确认的快照。" : "正在读取课程真实学习记录…");
      try {
        const report = await options.request(apiPath("", proposed), {controller: state.controller, latestKey: "learning-insights"});
        if (sequence !== state.sequence) return false;
        state.filters = {...proposed, ...report.scope}; state.data = report; state.pendingFilters = null; state.rosterPage = 0;
        if (!report.tasks.some(t => t.key === state.focusTask)) state.focusTask = "";
        state.busy = false; syncControls(); render(); syncUrl(); message(""); options.onSnapshot?.(report);
        return true;
      } catch (error) {
        if (sequence !== state.sequence || error?.name === "AbortError" || error?.code === "REQUEST_ABORTED") return false;
        state.busy = false; state.pendingFilters = null; syncControls();
        message(`${error.message || "暂时无法读取学习记录。"}${state.data ? " 已保留上次快照与筛选范围。" : " 点击重试，课程记录不会受影响。"}`, true);
        if (!state.data) $("ix-content").innerHTML = `${empty("暂时无法读取学情", "请检查网络后重试。") }<button class="ix-primary" type="button" data-ix="refresh">重新加载</button>`;
        return false;
      } finally { if (sequence === state.sequence) { state.busy = false; syncControls(); } }
    }
    function taskName(key) { return state.data.tasks.find(t => t.key === key)?.name || "课程任务"; }
    function render() {
      const data = state.data;
      if (!data) return;
      disposeCharts();
      const s = data.summary;
      root.dataset.view = state.view;
      $("ix-title").textContent = `${data.course.name || state.course.name} · 学情分析`;
      $("ix-headline").textContent = s.students === 0 ? "还没有学生加入课程。邀请学生加入后即可查看学习进展。" : s.tasks === 0 ? `${s.students} 名学生已加入；发布实践题或探究项目后，学习记录会汇总到这里。` : `${s.students} 名学生，${s.tasks} 项已发布任务。${s.completedStudents} 人已完成全部必修，${s.needsHelp} 人建议先核对学习进展。`;
      $("ix-freshness").textContent = `${date(data.asOf)} 更新`;
      $("ix-scope").innerHTML = `<span>${icon("check-circle")} 累计进度截至现在</span><span>活动：${esc(data.scope.label)} / 北京时间</span>${state.filters.taskKey ? `<button type="button" data-ix="clear-task">当前任务：${esc(taskName(state.filters.taskKey))} ${icon("times")}</button>` : ""}<button type="button" data-ix="methods">${icon("info-circle")}数据怎么算</button>`;
      const cumulative = data.trend.reduce((rows, row) => [...rows, (rows.at(-1) || 0) + row.completions], []);
      const metrics = [
        ["roster", "all", "累计必修完成", pct(s.completionRate), "", `${num(s.completedPairs)} / ${num(s.requiredPairs)} 份已完成`, cumulative, "#55e0c0"],
        ["roster", "complete", "完成全部必修", num(s.completedStudents), "人", `当前 ${num(s.students)} 名课程学生`, [], "#55e0c0"],
        ["active", "", `${data.scope.label}有活动`, num(s.activeStudents), "人", "去重的实际活动人数", data.trend.map(t => t.activeStudents), "#54b5f8"],
        ["new-completions", "", `${data.scope.label}新增完成`, num(s.newCompletions), "份", "按学生与任务去重", data.trend.map(t => t.completions), "#54b5f8"],
        ["roster", "attention", "建议优先跟进", num(s.needsHelp), "人", "正式检查卡点 / 长时间未继续", [], "#edb867"],
        ["roster", "verified", "核验通过待确认", num(s.pendingConfirmation), "人", "已有检查通过，尚无完成确认", [], "#b29cff"]
      ];
      const kpis = `<section class="ix-kpis" aria-label="班级关键事实">${metrics.map(([action, status, label, value, unit, note, values, color], i) => `<button type="button" data-ix="${action}" data-status="${status}" style="--metric-color:${color}"><span><i>${String(i + 1).padStart(2, "0")}</i>${esc(label)}</span><strong>${value}<em>${unit}</em></strong><small>${note}</small>${values.length > 1 ? atlas.spark(values, color) : `<span class="ix-kpi-mark" aria-hidden="true">${icon(i === 1 ? "user-graduate" : i === 4 ? "crosshairs" : "check-circle")}</span>`}</button>`).join("")}</section>`;
      $("ix-content").innerHTML = `${kpis}<nav class="ix-tabs" aria-label="学情视图">${[["overview", "学习态势"], ["students", "学生与作业"], ["followups", "教学跟进"]].map(([id, label]) => `<button type="button" data-ix="view" data-view="${id}" aria-current="${state.view === id ? "page" : "false"}" class="${state.view === id ? "is-active" : ""}">${label}${id === "followups" && data.followups.filter(f => f.status === "due").length ? `<span>${data.followups.filter(f => f.status === "due").length}</span>` : ""}</button>`).join("")}<span><i class="ix-dot"></i>${esc(data.source.label)}</span></nav><div id="ix-view"></div>`;
      renderView();
    }
    function heading(title, text, action = "") { return `<header class="ix-section-heading"><div><h3>${title}</h3><p>${text}</p></div>${action}</header>`; }
    function renderView() {
      if (!state.data) return;
      disposeCharts();
      if (state.view === "students") renderRoster(); else if (state.view === "followups") renderFollowups(); else renderOverview();
    }
    function renderOverview() {
      disposeCharts();
      const d = state.data, s = d.summary, a = atlas.derive(d);
      state.atlasTaskPage = Math.max(0, Math.min(state.atlasTaskPage || 0, Math.ceil(d.tasks.length / 3) - 1));
      state.atlasStudentPage = Math.max(0, Math.min(state.atlasStudentPage || 0, Math.ceil(d.students.length / 80) - 1));
      const visibleTasks = d.tasks.slice(state.atlasTaskPage * 3, state.atlasTaskPage * 3 + 3);
      if (!visibleTasks.some(t => t.key === state.sceneTask)) state.sceneTask = visibleTasks[0]?.key || "";
      const selected = d.tasks.find(t => t.key === state.sceneTask);
      const attention = d.students.filter(x => ["help", "idle", "verified"].includes(x.status)).slice(0, state.screen ? 2 : 4);
      const taskButtons = d.tasks.map((t, i) => `<button type="button" data-ix="select-task" data-task="${esc(t.key)}" class="${t.key === state.sceneTask ? "is-located" : ""}" title="${esc(t.name)}"><span class="ix-task-number">${String(i + 1).padStart(2, "0")}</span><span class="ix-task-name"><small>${esc(t.moduleName)} · ${t.required ? "必修" : "选修"}</small><strong>${esc(t.name)}</strong><span class="ix-bar-track"><i style="width:${(t.completionRate || 0) * 100}%"></i><b style="left:${(t.completionRate || 0) * 100}%;width:${s.students ? (t.started - t.completed) / s.students * 100 : 0}%"></b></span></span><span class="ix-task-fraction"><strong>${pct(t.completionRate)}</strong><small>${t.completed}/${t.studentCount} 人</small></span></button>`).join("");
      const legend = Object.entries(names).filter(([key]) => key !== "empty").map(([key, label]) => `<span><i style="background:${atlas.palette[key]}"></i>${label}</span>`).join("");
      const bands = a.completionBands;
      const maximum = Math.max(1, ...bands.map(b => b.students));
      const recent = a.recent.slice(0, state.screen ? 2 : 4).map(row => {
        const student = d.students.find(s => s.userId === row.studentId);
        return student ? `<button type="button" data-ix="student" data-student="${student.userId}" data-task="${esc(row.taskKey)}"><i style="background:${atlas.palette[row.status]}"></i><span><strong>${esc(displayName(student))}<em>${esc(names[row.status])}</em></strong><small>${esc(taskName(row.taskKey))}</small></span><time>${date(row.at, true)}</time></button>` : "";
      }).join("");
      const states = a.taskStates[selected?.key] || {};
      const inspector = selected ? `<div class="ix-scene-inspector"><div><span class="ix-eyebrow">当前定位 · ${esc(selected.kind)}</span><strong>${esc(selected.name)}</strong><small>${esc(selected.moduleName)}${selected.revision ? ` / 第 ${selected.revision} 版` : ""}</small></div><div class="ix-inspector-count"><strong>${selected.completed}<em> / ${selected.studentCount}</em></strong><small>累计完成人数</small></div><button type="button" class="ix-primary" data-ix="task-roster" data-task="${esc(selected.key)}">查看作业名单 ${icon("arrow-right")}</button><div class="ix-segment-track" aria-label="当前作业的学生状态分布">${Object.entries(states).map(([status, count]) => `<span style="width:${s.students ? count / s.students * 100 : 0}%;background:${atlas.palette[status]}" title="${esc(names[status])}：${count} 人"></span>`).join("")}</div></div>` : "";
      $("ix-view").innerHTML = `<div class="ix-command-grid">
        <aside class="ix-left-stack">
          <section class="ix-panel ix-task-progress">${heading("任务推进", `${d.tasks.length} 项已发布任务 · 累计进度`, '<span class="ix-panel-index">01</span>')}<div class="ix-task-bars">${taskButtons || empty("尚未发布任务", "发布后即可查看学习地形。")}</div><footer class="ix-panel-note"><i class="ix-dot"></i>点击作业，在学习地形中定位</footer></section>
          <section class="ix-panel ix-completion-panel">${heading("必修完成分布", "每位学生已完成的必修任务数", '<span class="ix-panel-index">02</span>')}<div class="ix-completion-bands">${bands.map(b => `<div><span>${b.completed} 项</span><div><i style="width:${b.students / maximum * 100}%" class="${b.completed === s.requiredTasks ? "is-finished" : ""}"></i></div><strong>${b.students}<small>人</small></strong></div>`).join("")}</div><button class="ix-text-link" type="button" data-ix="roster" data-status="complete">${num(s.completedStudents)} 人已完成全部必修 ${icon("angle-right")}</button></section>
          <section class="ix-panel ix-check-coverage">${heading("核验证据", "正式检查回执 · 累计记录", '<span class="ix-panel-index">03</span>')}<div class="ix-check-total"><strong>${num(a.checks.total)}</strong><span>次正式检查</span><span class="ix-proof-mark" aria-hidden="true">${icon("shield-alt")}</span></div><div class="ix-proof-stats"><div><i style="background:#55e0c0"></i><span>通过</span><strong>${a.checks.passed}</strong></div><div><i style="background:#ff8293"></i><span>未通过</span><strong>${a.checks.failed}</strong></div>${a.checks.unknown ? `<div><i style="background:#8196a9"></i><span>结果未记录</span><strong>${a.checks.unknown}</strong></div>` : ""}<div><span>涉及学生与作业组合</span><strong>${a.checks.checkedPairs}</strong></div></div><p class="ix-panel-note">检查通过与平台完成分别核对</p></section>
        </aside>
        <div class="ix-center-stack">
          <section class="ix-panel ix-landscape">${heading("课程学习地形", '<span class="ix-scene-caption-desktop">每格一位学生 · 点击色块查看核验证据</span><span class="ix-scene-caption-mobile">按作业查看名单与核验证据</span>', `<div class="ix-scene-tools"><button type="button" data-ix="motion" aria-pressed="${state.paused}" aria-label="${state.paused ? "开启动效" : "暂停动效"}">${icon(state.paused ? "play" : "pause")}</button><button type="button" data-ix="roster" data-status="all">${icon("th")}矩阵</button></div>`)}${visibleTasks.length && s.students ? atlas.scene(d, {taskPage: state.atlasTaskPage, studentPage: state.atlasStudentPage, compact: state.screen, selectedTask: state.sceneTask, name: displayName}) : empty(s.students ? "等待第一项已发布任务" : "等待学生加入", "学习地形只使用当前课程成员和已发布任务。")}
          <div class="ix-mobile-tasks">${visibleTasks.map(t => `<button type="button" data-ix="task-roster" data-task="${esc(t.key)}"><small>${esc(t.moduleName)}</small><strong>${esc(t.name)}</strong><span>${t.completed} / ${t.studentCount} 人完成 ${icon("arrow-right")}</span></button>`).join("")}</div>
          <div class="ix-scene-footer"><div class="ix-chart-legend">${legend}</div>${d.tasks.length > 3 || d.students.length > 80 ? `<div class="ix-scene-paging">${d.tasks.length > 3 ? `<button type="button" data-ix="scene-page" data-step="-1"${state.atlasTaskPage === 0 ? " disabled" : ""} aria-label="上一组任务">${icon("angle-left")}</button><span>任务 ${state.atlasTaskPage * 3 + 1}–${Math.min(d.tasks.length, state.atlasTaskPage * 3 + 3)} / ${d.tasks.length}</span><button type="button" data-ix="scene-page" data-step="1"${(state.atlasTaskPage + 1) * 3 >= d.tasks.length ? " disabled" : ""} aria-label="下一组任务">${icon("angle-right")}</button>` : ""}${d.students.length > 80 ? `<button type="button" data-ix="scene-students" data-step="-1"${state.atlasStudentPage === 0 ? " disabled" : ""} aria-label="上一组学生">${icon("angle-left")}</button><span>学生 ${state.atlasStudentPage * 80 + 1}–${Math.min(d.students.length, state.atlasStudentPage * 80 + 80)} / ${d.students.length}</span><button type="button" data-ix="scene-students" data-step="1"${(state.atlasStudentPage + 1) * 80 >= d.students.length ? " disabled" : ""} aria-label="下一组学生">${icon("angle-right")}</button>` : ""}</div>` : ""}</div>${inspector}</section>
          <section class="ix-panel ix-trend-panel">${heading("学习节奏", `${esc(d.scope.label)} · ${d.trendBucketDays === 1 ? "按天" : `每 ${d.trendBucketDays} 天`}汇总`, '<span class="ix-chart-units">人数 / 完成份数</span>')}<div id="ix-trend" class="ix-chart" role="img" aria-label="期间活跃学生和新增完成趋势"></div><details class="ix-data-table"><summary>查看趋势数值</summary><div class="ix-scroll"><table><thead><tr><th>日期起点</th><th>活跃学生</th><th>新增完成</th></tr></thead><tbody>${d.trend.map(t => `<tr><td>${t.date}</td><td>${t.activeStudents} 人</td><td>${t.completions} 份</td></tr>`).join("")}</tbody></table></div></details></section>
        </div>
        <aside class="ix-right-stack">
          <section class="ix-panel ix-distribution-panel">${heading("全班学习状态", "按当前任务记录归类", '<span class="ix-panel-index">04</span>')}<div class="ix-distribution"><div id="ix-distribution" class="ix-chart" role="img" aria-label="全班学习状态分布"></div><div class="ix-state-list">${d.statuses.filter(x => x.count).map(x => `<button type="button" data-ix="roster" data-status="${x.id}"><i style="background:${atlas.palette[x.id]}"></i><span>${esc(x.label)}</span><strong>${x.count}<small>人</small></strong></button>`).join("") || "暂无学生"}</div></div></section>
          <section class="ix-panel ix-attention-panel">${heading("优先关注", `${s.needsHelp} 人待跟进 · ${s.pendingConfirmation} 人待确认`, `<button type="button" data-ix="roster" data-status="attention">跟进名单 ${icon("angle-right")}</button>`)}<div class="ix-attention-list">${attention.length ? attention.map(student => `<button type="button" data-ix="student" data-student="${student.userId}"><span class="ix-attention-signal is-${student.status}">${icon(student.status === "verified" ? "check-circle" : student.status === "help" ? "exclamation" : "clock")}</span><span><strong>${esc(displayName(student))}${badge(student.status)}</strong><small>${esc(student.reason)}</small></span>${icon("angle-right")}</button>`).join("") : empty("暂无明确卡点", "有新核验记录后自动更新。")}</div></section>
          <section class="ix-panel ix-recent-panel">${heading("最近学习记录", "每个学生与作业的最近记录", '<span class="ix-panel-index">05</span>')}<div class="ix-recent-list">${recent || empty("暂无学习记录", "学生开始实践后会显示在这里。")}</div></section>
        </aside>
      </div><footer class="ix-board-footer"><span>${icon("shield-alt")}服务端保存的真实记录 · 数据截至 ${date(d.asOf)}</span><button type="button" data-ix="methods">统计口径与数据边界 ${icon("angle-right")}</button></footer>`;
      root.classList.toggle("is-paused", state.paused);
      drawCharts();
    }
    function chart(id, option, click) {
      const node = $(id);
      if (!node || !win.echarts) { if (node) node.innerHTML = '<p class="ix-chart-fallback">图表暂不可用；请查看旁边的数值与名单。</p>'; return; }
      const instance = win.echarts.init(node, null, {renderer: "svg"});
      instance.setOption({animation: !reduced && !state.paused, animationDuration: 650, textStyle: {fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', color: "#b6cbd9"}, aria: {enabled: true, label: {enabled: true}}, ...option});
      if (click) instance.on("click", click);
      state.charts.set(id, instance);
      const observer = new win.ResizeObserver(() => instance.resize()); observer.observe(node); state.chartResizers.set(id, observer);
    }
    function drawCharts() {
      const d = state.data, line = "#213647", text = "#98afbf";
      chart("ix-trend", {color: ["#55cbef", "#55e0c0"], tooltip: {trigger: "axis", renderMode: "html", backgroundColor: "#112434", borderColor: "#36536a", textStyle: {color: "#e1f3ff"}, valueFormatter: v => num(v)}, legend: {top: 0, right: 14, itemWidth: 12, itemHeight: 6, textStyle: {color: text, fontSize: 10}, data: ["活跃学生（人）", "新增完成（份）"]}, grid: {left: 35, right: 35, top: 35, bottom: 25}, xAxis: {type: "category", boundaryGap: true, data: d.trend.map(t => t.date.slice(5)), axisLine: {lineStyle: {color: line}}, axisTick: {show: false}, axisLabel: {color: text, fontSize: 10, hideOverlap: true}}, yAxis: [{type: "value", minInterval: 1, splitNumber: 2, splitLine: {lineStyle: {color: line, type: "dashed"}}, axisLabel: {color: text, fontSize: 10}}, {type: "value", minInterval: 1, splitNumber: 2, splitLine: {show: false}, axisLabel: {color: text, fontSize: 10}}], series: [{name: "活跃学生（人）", type: "line", smooth: .25, showSymbol: d.trend.length <= 10, symbolSize: 5, lineStyle: {width: 2}, areaStyle: {color: {type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{offset: 0, color: "#2a92aa55"}, {offset: 1, color: "#2a92aa00"}]}}, data: d.trend.map(t => t.activeStudents)}, {name: "新增完成（份）", type: "bar", yAxisIndex: 1, barMaxWidth: 8, itemStyle: {borderRadius: [2, 2, 0, 0], opacity: .8}, data: d.trend.map(t => t.completions)}]});
      chart("ix-distribution", {tooltip: {trigger: "item", renderMode: "html", backgroundColor: "#112434", borderColor: "#36536a", textStyle: {color: "#e1f3ff"}, formatter: p => `${esc(p.name)}：${p.value} 人`}, title: {text: String(d.summary.students), subtext: "课程学生", left: "center", top: "31%", itemGap: 4, textStyle: {fontSize: 29, fontFamily: '"SFMono-Regular", Consolas, monospace', fontWeight: 500, color: "#e8f7ff"}, subtextStyle: {color: text, fontSize: 10}}, series: [{type: "pie", radius: ["70%", "84%"], center: ["50%", "50%"], label: {show: false}, padAngle: 3, itemStyle: {borderRadius: 1}, data: d.statuses.filter(x => x.count).map(x => ({name: x.label, value: x.count, itemStyle: {color: atlas.palette[x.id]}, status: x.id})), emphasis: {scaleSize: 3}}]}, event => { if (event.data?.status) roster(event.data.status); });
    }
    function roster(status = "all", taskKey = "", cohort = "all") { state.activeOnly = cohort === "active"; state.newOnly = cohort === "new"; state.status = status; state.focusTask = taskKey; state.rosterPage = 0; state.view = "students"; render(); syncUrl(); }
    function renderRoster() {
      const d = state.data;
      state.taskPage = Math.min(state.taskPage, Math.max(0, Math.ceil(d.tasks.length / 5) - 1));
      const tasks = state.focusTask ? d.tasks.filter(t => t.key === state.focusTask) : d.tasks.slice(state.taskPage * 5, state.taskPage * 5 + 5);
      let rows = filterStudents(d.students, state.search, state.status, state.focusTask);
      if (state.activeOnly) rows = rows.filter(s => s.activeInPeriod);
      if (state.newOnly) rows = rows.filter(s => s.cells.some(c => c.completedAt && (!d.scope.start || c.completedAt >= d.scope.start) && c.completedAt <= d.scope.end));
      const pages = Math.max(1, Math.ceil(rows.length / 20)); state.rosterPage = Math.min(state.rosterPage, pages - 1);
      const shown = rows.slice(state.rosterPage * 20, state.rosterPage * 20 + 20);
      $("ix-view").innerHTML = `<section class="ix-panel ix-roster-panel">${heading("学生与作业", "每个色块都是一份真实作业。点开即可查看核验、评分与过程记录。", `<strong class="ix-count">${rows.length} 名学生</strong>`)}<div class="ix-roster-tools"><label class="ix-search">${icon("search")}<input id="ix-search" type="search" placeholder="搜索姓名或学生 ID" value="${esc(state.search)}" aria-label="搜索学生"></label><select id="ix-status" aria-label="按学习状态筛选"><option value="all">全部学习状态</option><option value="attention">需要帮助与待跟进</option>${Object.entries(names).map(([key, value]) => `<option value="${key}"${state.status === key ? " selected" : ""}>${value}</option>`).join("")}</select><button type="button" data-ix="reset-roster">清除名单筛选</button>${state.activeOnly ? '<span class="ix-filter-chip">仅期间活跃</span>' : ""}${state.newOnly ? '<span class="ix-filter-chip">仅期间新增完成</span>' : ""}${state.focusTask ? `<span class="ix-filter-chip">${esc(taskName(state.focusTask))}</span>` : ""}</div><div class="ix-chart-legend">${Object.entries(names).filter(([k]) => k !== "empty").map(([k, label]) => `<span><i class="is-${k}"></i>${label}</span>`).join("")}</div><div class="ix-scroll ix-matrix-scroll"><table class="ix-matrix"><thead><tr><th>学生</th><th>累计必修完成</th>${tasks.map(t => `<th title="${esc(t.name)}"><small>${esc(t.moduleName)}</small><button type="button" data-ix="task-scope" data-task="${esc(t.key)}">${esc(t.name)}</button></th>`).join("")}<th>最近记录</th></tr></thead><tbody>${shown.map(student => `<tr><th scope="row"><button type="button" data-ix="student" data-student="${student.userId}"><span class="ix-avatar">${esc(displayName(student).slice(0, 1))}</span><span><strong>${esc(displayName(student))}</strong><small>${esc(student.statusLabel)}</small></span></button></th><td><strong>${student.completed}<small> / ${student.required || "—"}</small></strong><div class="ix-mini-meter"><i style="width:${(student.completionRate || 0) * 100}%"></i></div></td>${tasks.map(t => {const c = student.cells.find(c => c.taskKey === t.key) || {taskKey: t.key, status: "not_started", statusLabel: names.not_started, score: null}; return `<td><button type="button" class="ix-cell is-${c.status}" data-ix="student" data-student="${student.userId}" data-task="${esc(t.key)}" aria-label="${esc(displayName(student))}，${esc(t.name)}，${esc(c.statusLabel)}，查看证据">${icon(c.status === "complete" ? "check" : c.status === "help" ? "exclamation" : c.status === "not_started" ? "minus" : c.status === "verified" ? "check-circle" : "circle")}<span>${esc(c.statusLabel)}</span>${c.score == null ? "" : `<small>${num(c.score)} 分</small>`}</button></td>`;}).join("")}<td class="ix-time">${date(student.lastActivity)}</td></tr>`).join("") || `<tr><td colspan="${tasks.length + 3}">${empty("没有符合条件的学生", "清除名单筛选或调整上方分析范围。")}</td></tr>`}</tbody></table></div><footer class="ix-pagination"><span>第 ${state.rosterPage + 1} / ${pages} 页，共 ${rows.length} 人</span><button type="button" data-ix="page" data-step="-1"${state.rosterPage === 0 ? " disabled" : ""}>上一页</button><button type="button" data-ix="page" data-step="1"${state.rosterPage + 1 >= pages ? " disabled" : ""}>下一页</button>${!state.focusTask && d.tasks.length > 5 ? `<span class="ix-task-pagination">任务 ${state.taskPage * 5 + 1}–${Math.min(d.tasks.length, state.taskPage * 5 + 5)} / ${d.tasks.length}<button type="button" data-ix="task-page" data-step="-1"${state.taskPage === 0 ? " disabled" : ""}>前 5 项</button><button type="button" data-ix="task-page" data-step="1"${(state.taskPage + 1) * 5 >= d.tasks.length ? " disabled" : ""}>后 5 项</button></span>` : ""}</footer></section>`;
      $("ix-status").value = state.status;
    }
    function changeMarkup(record) {
      if (!record.current || !record.baseline) return "";
      if (JSON.stringify(record.current.taskKeys) !== JSON.stringify(record.baseline.taskKeys)) return '<small>必修任务或发布版本已变化，本次不比较完成数量。</small>';
      return `<small>累计完成：${record.baseline.completed} → ${record.current.completed} 项；期间新增 ${Math.max(0, record.current.recordCount - record.baseline.recordCount)} 条记录。同期变化需结合课堂观察解释。</small>`;
    }
    function renderFollowups() {
      const rows = state.data.followups;
      const due = rows.filter(r => r.status === "due").length;
      $("ix-view").innerHTML = `<section class="ix-panel">${heading("把关注变成一次具体支持", `待复查 ${due} 项 · 跟进中 ${rows.filter(r => r.status === "open").length} 项 · 已复查 ${rows.filter(r => r.status === "reviewed").length} 项`, `<button type="button" data-ix="roster" data-status="attention">选择学生并记录跟进</button>`)}<p class="ix-followup-notice">跟进基线使用全课程累计进度，不随章节或时间筛选变化。记录只保存在课程内，不会自动发消息。</p><div class="ix-followups">${rows.map(r => `<article><header><div><span class="ix-status is-${r.status === "due" ? "idle" : r.status === "reviewed" ? "complete" : "working"}">${({due: "现在复查", open: "跟进中", reviewed: "已复查"})[r.status]}</span><strong>${esc(state.screen && state.private ? `学生 ${r.studentId}` : r.studentName)} / ${esc(r.title)}</strong></div><small>约定 ${date(r.dueAt)}</small></header><p>${esc(state.screen && state.private ? "教学备注已隐藏，退出大屏后查看。" : r.plan)}</p>${r.baseline ? `<small>记录时已完成 ${r.baseline.completed} / ${r.baseline.required} 项必修。</small>` : '<small>保留的历史跟进记录。</small>'}${r.status === "reviewed" ? `<div class="ix-review-result"><strong>${esc(({improved: "已有改善", continue: "继续支持", uncertain: "还需观察", IMPROVED: "已有改善", UNCHANGED: "暂无明显变化", DECLINED: "有所下降", UNCERTAIN: "还需观察"})[r.outcome] || "已记录复查")}</strong><p>${esc(state.screen && state.private ? "复查备注已隐藏。" : r.note || "未补充说明")}</p>${changeMarkup(r)}</div>` : ""}<footer><button type="button" data-ix="student" data-student="${r.studentId}">查看学生</button>${r.status !== "reviewed" ? `<button class="ix-primary" type="button" data-ix="review" data-record="${esc(r.id)}">${r.status === "due" ? "复查并记录结果" : "提前复查"}</button>` : `<span>${date(r.reviewedAt)} 复查</span>`}</footer></article>`).join("") || empty("还没有跟进记录", "打开一位学生的详情，写下下一项小目标与复查时间。")}</div></section>`;
    }
    function showDialog(title, context, html, trigger) {
      $("ix-scene-tooltip").hidden = true;
      state.returnFocus = trigger || doc.activeElement;
      $("ix-dialog-title").textContent = title; $("ix-dialog-context").textContent = context;
      $("ix-dialog-content").innerHTML = html;
      dialog.classList.toggle("is-screen", state.screen);
      if (!dialog.open) dialog.showModal();
    }
    function closeDialog() { state.detailSequence++; state.detail = null; if (dialog.open) dialog.close(); }
    async function openStudent(id, taskKey, trigger) {
      const student = state.data.students.find(s => s.userId === Number(id));
      if (!student) return;
      const chosen = taskKey || student.cells.find(c => ["help", "idle", "verified"].includes(c.status))?.taskKey || student.cells.find(c => c.status !== "complete")?.taskKey || state.data.tasks[0]?.key;
      state.detail = {student, taskKey: chosen, records: [], nextCursor: null};
      showDialog(displayName(student), `${state.course.name} / 学生 ${student.userId}`, `<div class="ix-student-summary">${badge(student.status)}<p>${esc(student.reason)}</p><dl><div><dt>累计必修完成</dt><dd>${student.completed} / ${student.required || "—"}</dd></div><div><dt>最近记录</dt><dd>${date(student.lastActivity)}</dd></div></dl><button class="ix-primary" type="button" data-ix="followup" data-student="${student.userId}">${icon("clipboard-list")}记录一次教学跟进</button></div><label class="ix-detail-task-label">查看作业<select id="ix-detail-task">${state.data.tasks.map(t => `<option value="${esc(t.key)}"${t.key === chosen ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label><div id="ix-evidence">${empty("读取记录中", "正在读取已保存的核验结果。")}</div>`, trigger);
      if (chosen) await loadEvidence(false); else $("ix-evidence").innerHTML = empty("当前没有可查看的任务", "发布实践内容后即可下钻到具体记录。");
    }
    async function loadEvidence(more) {
      if (!state.detail) return;
      const selected = state.detail, sequence = ++state.detailSequence;
      const before = more ? selected.nextCursor : null;
      const button = dialog.querySelector('[data-ix="more-evidence"]'); if (button) button.disabled = true;
      try {
        const query = new URLSearchParams({taskKey: selected.taskKey}); if (before) query.set("before", before);
        const payload = await options.request(`/teaching/insights/${encodeURIComponent(state.course.referenceId || state.course.id)}/evidence/${selected.student.userId}?${query}`);
        if (sequence !== state.detailSequence || state.detail !== selected) return;
        const seen = new Set(selected.records.map(r => r.id));
        selected.records = more ? selected.records.concat(payload.records.filter(r => !seen.has(r.id))) : payload.records;
        selected.payload = payload; selected.nextCursor = payload.nextCursor;
        renderEvidence();
      } catch (error) {
        if (sequence !== state.detailSequence) return;
        if (more && button) { button.disabled = false; button.textContent = "加载失败，再试一次"; }
        else $("ix-evidence").innerHTML = `${empty("暂时无法读取证据", error.message || "请稍后重试。 ")}<button type="button" data-ix="retry-evidence">重新读取</button>`;
      }
    }
    function checkBody(check) {
      const failed = check.failedCount ?? check.total - check.passedCount;
      const filter = check.filter || "all";
      return `<div class="ix-check-tools"><button type="button" data-ix="check-filter" data-receipt="${check.id}" data-filter="failed" aria-pressed="${filter === "failed"}">只看未通过（${failed}）</button><button type="button" data-ix="check-filter" data-receipt="${check.id}" data-filter="all" aria-pressed="${filter === "all"}">全部检查（${check.total}）</button></div><ul class="ix-check-list">${check.tests.map(t => `<li class="${t.passed ? "is-pass" : "is-fail"}">${icon(t.passed ? "check" : "times")}<span><strong>${esc(t.name)}</strong>${t.feedback ? `<small>${esc(t.feedback)}</small>` : ""}</span><em>${t.passed ? "通过" : "未通过"}</em></li>`).join("") || '<li>这次检查没有未通过项。</li>'}</ul><footer class="ix-check-footer"><small>已载入 ${check.tests.length} / ${check.filteredTotal ?? check.tests.length} 项${filter === "failed" ? "未通过检查" : "检查"}</small>${check.nextOffset != null ? `<button type="button" data-ix="more-checks" data-receipt="${check.id}">加载更多检查项</button>` : ""}</footer>`;
    }
    async function loadCheckPage(receiptId, more, filter) {
      const detail = state.detail;
      const check = detail?.payload?.checks.find(c => c.id === Number(receiptId));
      if (!check) return;
      detail.checkRequests ||= {};
      const sequence = (detail.checkRequests[receiptId] || 0) + 1;
      detail.checkRequests[receiptId] = sequence;
      const body = $("ix-tests-" + receiptId);
      for (const button of body.querySelectorAll("button")) button.disabled = true;
      try {
        const query = new URLSearchParams({taskKey: detail.taskKey, offset: more ? check.nextOffset : 0, filter: filter || check.filter || "all"});
        const result = await options.request(`/teaching/insights/${encodeURIComponent(state.course.referenceId || state.course.id)}/checks/${detail.student.userId}/${receiptId}?${query}`);
        if (state.detail !== detail || detail.checkRequests[receiptId] !== sequence) return;
        const tests = more ? check.tests.concat(result.tests) : result.tests;
        Object.assign(check, result, {tests});
        body.innerHTML = checkBody(check);
      } catch (error) {
        if (state.detail !== detail || detail.checkRequests[receiptId] !== sequence) return;
        let errorNode = body.querySelector(".ix-form-error");
        if (!errorNode) { errorNode = doc.createElement("p"); errorNode.className = "ix-form-error"; body.append(errorNode); }
        errorNode.textContent = error.message || "读取检查项失败，请重试。";
        for (const button of body.querySelectorAll("button")) button.disabled = false;
      }
    }
    function gradeMarkup(g) {
      return `<article class="ix-grade"><header><strong>${num(g.score)}<small> 分</small></strong><time>${date(g.at)}</time></header><p>${esc(g.feedback)}</p><dl>${g.criteria.map(c => `<div><dt>${esc(c.name)}</dt><dd>${num(c.score)} / ${num(c.maxScore)}</dd></div>`).join("")}</dl><small>评估来源 ${esc(g.source)} / 记录 ${esc(g.id)}</small></article>`;
    }
    function renderEvidence() {
      const detail = state.detail, p = detail.payload;
      const cell = detail.student.cells.find(c => c.taskKey === detail.taskKey);
      $("ix-evidence").innerHTML = `<div class="ix-detail-status">${badge(cell?.status || "not_started")}<a href="${esc(p.task.href || "#")}" target="_blank" rel="noopener">打开任务说明 ${icon("external-link-alt")}</a></div>
        <section class="ix-detail-section"><h3>编码核验记录 <small>最近 10 次</small></h3>${p.checks.length ? p.checks.map((check, index) => `<details class="ix-check"${index === 0 ? " open" : ""}><summary><span>${icon(check.passed === true ? "check-circle" : "clipboard-check")}<strong>${check.passedCount} / ${check.total} 项检查通过</strong><small>${check.formal ? "正式核验" : "历史核验"}</small><small>${date(check.at)}</small></span>${icon("angle-down")}</summary>${check.sha256 ? `<p class="ix-hash">代码摘要 <code title="${esc(check.sha256)}">${esc(check.sha256)}</code></p>` : ""}<div id="ix-tests-${check.id}">${checkBody(check)}</div></details>`).join("") : '<p class="ix-muted">没有正式编码检查记录；其他实践类型可查看下方评估与过程记录。</p>'}</section>
        <section class="ix-detail-section"><h3>已确认评估</h3>${p.assessments.length ? gradeMarkup(p.assessments[0]) + (p.assessments.length > 1 ? `<details class="ix-grade-history"><summary>查看更早的已确认评估（${p.assessments.length - 1} 条）</summary>${p.assessments.slice(1).map(gradeMarkup).join("")}</details>` : "") : '<p class="ix-muted">尚未评分；不会把没有评分当作零分。</p>'}</section>
        <section class="ix-detail-section"><h3>具体过程记录 <small>${detail.records.length} 条已载入</small></h3><p class="ix-muted">${esc(p.notice)}</p><ol class="ix-evidence-list">${detail.records.map(r => `<li><span class="ix-evidence-dot"></span><div><strong>${esc(r.title)}${r.passed == null ? "" : `<em class="${r.passed ? "is-pass" : "is-fail"}">${r.passed ? "通过" : "未通过"}</em>`}</strong><small>${date(r.at)} / ${esc(r.source)} / ${r.trusted ? "受信来源" : "过程观察"}</small><details><summary>记录编号与摘要</summary><p>记录 ${r.id} / 序号 ${r.sequence}</p><code>${esc(r.hash || "无摘要")}</code><small>摘要用于定位记录，不等同于本次重新校验整条证据链。</small></details></div></li>`).join("") || '<li class="ix-muted">尚无已保存的过程记录。</li>'}</ol>${detail.nextCursor ? '<button type="button" data-ix="more-evidence">加载更早记录</button>' : ""}</section>`;
    }
    function followupForm(id, trigger) {
      const student = state.data.students.find(s => s.userId === Number(id)); if (!student) return;
      state.detailSequence++; state.detail = null;
      const requestKey = Array.from(win.crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, "0")).join("");
      showDialog("记录教学跟进", displayName(student), `<form id="ix-followup-form" data-student="${student.userId}" data-request-key="${requestKey}"><p class="ix-form-intro">${esc(student.reason)} 记录保存后会保留全课程的累计进度，供下次复查。</p><label>下一项小目标与老师的支持<textarea name="plan" rows="5" maxlength="4000" required placeholder="例如：先核对越界输入检查的反馈，完成一组边界测试；下次课一起检查新的核验记录。"></textarea></label><label>几天后复查<select name="days"><option value="3">3 天后</option><option value="7" selected>7 天后</option><option value="14">14 天后</option><option value="30">30 天后</option></select></label><p class="ix-muted">只保存课程内的跟进记录，不发送消息，也不修改成绩。</p><p class="ix-form-error" role="alert"></p><footer><button type="button" data-ix="close-dialog">取消</button><button type="submit" class="ix-primary">保存跟进计划</button></footer></form>`, trigger);
    }
    function reviewForm(identity, trigger) {
      const record = state.data.followups.find(r => r.id === identity); if (!record) return;
      state.detailSequence++; state.detail = null;
      showDialog("复查学习进展", state.screen && state.private ? `学生 ${record.studentId}` : record.studentName, `<form id="ix-review-form" data-record="${esc(identity)}"><p class="ix-form-intro">${esc(record.plan)}</p><label>本次观察到的变化<select name="outcome"><option value="improved">已有改善</option><option value="continue">需要继续支持</option><option value="uncertain">还需观察</option></select></label><label>复查依据<textarea name="note" rows="5" maxlength="2000" placeholder="记录你核对过的作品变化、检查项或课堂观察。"></textarea></label><p class="ix-muted">系统会保存本次累计进度。任务发生变化时，不把两个不同范围直接相减。</p><p class="ix-form-error" role="alert"></p><footer><button type="button" data-ix="close-dialog">取消</button><button type="submit" class="ix-primary">保存复查结果</button></footer></form>`, trigger);
    }
    function showMethods(trigger) {
      showDialog("这些数据怎么算", "所有图表、名单和导出使用同一个课程快照", `<div class="ix-methods">${state.data.definitions.map(d => `<section><h3>${esc(d.name)}</h3><p>${esc(d.text)}</p></section>`).join("")}<footer>定义版本 ${esc(state.data.version)}<br>快照 ${date(state.data.asOf)} / 北京时间</footer></div>`, trigger);
    }
    function screen(active = !state.screen, redraw = true) {
      if (active === state.screen) return;
      state.screen = active;
      if (active) {
        screenPosition = {x: win.scrollX, y: win.scrollY};
        screenAnchor = doc.createElement("div");
        screenAnchor.style.height = `${root.getBoundingClientRect().height}px`;
        screenAnchor.setAttribute("aria-hidden", "true");
        root.before(screenAnchor);
        doc.body.append(root);
        screenSiblings = [...doc.body.children].filter(node => node !== root && !node.hasAttribute("inert"));
        screenSiblings.forEach(node => node.setAttribute("inert", ""));
      } else {
        screenSiblings.forEach(node => node.removeAttribute("inert")); screenSiblings = [];
        screenAnchor?.replaceWith(root); screenAnchor = null;
        state.auto = false; $("ix-auto").checked = false;
      }
      root.classList.toggle("is-screen", active); doc.body.classList.toggle("has-insights-screen", active);
      const button = root.querySelector('[data-ix="screen"]'); button.setAttribute("aria-pressed", String(state.screen)); button.querySelector("span").textContent = state.screen ? "退出大屏" : "教学大屏";
      syncControls(); if (redraw && state.data) render();
      if (active) { root.scrollTop = 0; button.focus({preventScroll: true}); }
      else if (screenPosition) { win.scrollTo(screenPosition.x, screenPosition.y); screenPosition = null; if (!root.hidden) button.focus({preventScroll: true}); }
    }
    root.addEventListener("click", async event => {
      const trigger = event.target.closest("[data-ix]"); if (!trigger || trigger.disabled) return;
      const action = trigger.dataset.ix;
      if (action === "select-task" && win.matchMedia("(max-width: 680px)").matches) { roster("all", trigger.dataset.task); return; }
      if (action === "select-task") { const fromScene = !!trigger.closest("svg"); state.sceneTask = trigger.dataset.task; state.atlasTaskPage = Math.floor(state.data.tasks.findIndex(t => t.key === state.sceneTask) / 3); renderOverview(); const choices = [...root.querySelectorAll(fromScene ? "svg [data-ix=select-task]" : ".ix-task-bars [data-ix=select-task]")]; choices.find(node => node.dataset.task === state.sceneTask)?.focus({preventScroll: true}); }
      if (action === "scene-page") { state.atlasTaskPage += Number(trigger.dataset.step); renderOverview(); }
      if (action === "scene-students") { state.atlasStudentPage += Number(trigger.dataset.step); renderOverview(); }
      if (action === "motion") { state.paused = !state.paused; root.classList.toggle("is-paused", state.paused); trigger.setAttribute("aria-pressed", String(state.paused)); trigger.setAttribute("aria-label", state.paused ? "开启动效" : "暂停动效"); trigger.innerHTML = icon(state.paused ? "play" : "pause"); }
      if (action === "refresh") await load(state.course);
      if (action === "screen") screen();
      if (action === "view") { state.view = trigger.dataset.view; render(); syncUrl(); }
      if (action === "roster") { state.activeOnly = false; roster(trigger.dataset.status); }
      if (action === "active") roster("all", "", "active");
      if (action === "new-completions") roster("all", "", "new");
      if (action === "task-roster") { state.activeOnly = false; roster("all", trigger.dataset.task); }
      if (action === "task-scope") await load(state.course, {filters: {taskKey: trigger.dataset.task}});
      if (action === "clear-task") await load(state.course, {filters: {taskKey: ""}});
      if (action === "reset") { state.activeOnly = false; await load(state.course, {filters: {timeRange: "30d", moduleIndex: "", studentId: "", taskKey: ""}}); }
      if (action === "reset-roster") { state.search = ""; state.status = "all"; state.focusTask = ""; state.activeOnly = false; state.newOnly = false; state.rosterPage = 0; renderRoster(); syncUrl(); }
      if (action === "student") await openStudent(trigger.dataset.student, trigger.dataset.task, trigger);
      if (action === "close-dialog") closeDialog();
      if (action === "methods" && state.data) showMethods(trigger);
      if (action === "page") { state.rosterPage += Number(trigger.dataset.step); renderRoster(); }
      if (action === "task-page") { state.taskPage += Number(trigger.dataset.step); renderRoster(); }
      if (action === "panorama-page") { state.panoramaPage += Number(trigger.dataset.step); renderOverview(); }
      if (action === "followup") followupForm(trigger.dataset.student, trigger);
      if (action === "review") reviewForm(trigger.dataset.record, trigger);
      if (action === "more-evidence") await loadEvidence(true);
      if (action === "retry-evidence") await loadEvidence(false);
      if (action === "check-filter") await loadCheckPage(trigger.dataset.receipt, false, trigger.dataset.filter);
      if (action === "more-checks") await loadCheckPage(trigger.dataset.receipt, true);
      if (action === "export" && state.data && !state.busy) {
        const link = doc.createElement("a"); link.href = "/pwncollege_api/v1" + apiPath("/export"); link.download = ""; doc.body.append(link); link.click(); link.remove();
      }
    });
    root.addEventListener("change", event => {
      const target = event.target;
      if (target.id === "ix-range") void load(state.course, {filters: {timeRange: target.value}});
      if (target.id === "ix-module") { state.focusTask = ""; state.taskPage = 0; void load(state.course, {filters: {moduleIndex: target.value, taskKey: ""}}); }
      if (target.id === "ix-student") void load(state.course, {filters: {studentId: target.value}});
      if (target.id === "ix-status") { state.status = target.value; state.rosterPage = 0; renderRoster(); syncUrl(); }
      if (target.id === "ix-private") { state.private = target.checked; syncControls(); render(); }
      if (target.id === "ix-auto") state.auto = target.checked;
      if (target.id === "ix-detail-task" && state.detail) { state.detail.taskKey = target.value; state.detail.records = []; $("ix-evidence").innerHTML = '<div class="ix-loading"><span></span>读取作业记录…</div>'; void loadEvidence(false); }
    });
    let searchTimer;
    root.addEventListener("input", event => {
      if (event.target.id !== "ix-search") return;
      state.search = event.target.value; state.rosterPage = 0;
      win.clearTimeout(searchTimer); searchTimer = win.setTimeout(() => { if (state.view !== "students" || !state.data) return; const position = event.target.selectionStart; renderRoster(); const input = $("ix-search"); input?.focus(); if (position != null) input?.setSelectionRange(position, position); }, 180);
    });
    root.addEventListener("submit", async event => {
      const form = event.target; if (!["ix-followup-form", "ix-review-form"].includes(form.id)) return;
      event.preventDefault(); if (form.dataset.busy === "true") return;
      form.dataset.busy = "true"; const button = form.querySelector('[type="submit"]'); button.disabled = true; const label = button.textContent; button.textContent = "保存中…";
      const formData = new win.FormData(form);
      const courseRef = encodeURIComponent(state.course.referenceId || state.course.id);
      const isFollowup = form.id === "ix-followup-form";
      try {
        await options.json("POST", `/teaching/insights/${courseRef}/followups${isFollowup ? "" : "/" + encodeURIComponent(form.dataset.record) + "/review"}`, isFollowup ? {studentId: Number(form.dataset.student), plan: formData.get("plan"), days: Number(formData.get("days")), requestKey: form.dataset.requestKey} : {outcome: formData.get("outcome"), note: formData.get("note")});
        closeDialog(); state.view = "followups"; await load(state.course); message(isFollowup ? "跟进计划已保存，已保留当前进度作为复查依据。" : "复查结果已保存。");
      } catch (error) { form.querySelector('.ix-form-error').textContent = error.message || "保存失败，请重试。原有记录未受影响。"; }
      finally { if (form.isConnected) { form.dataset.busy = "false"; button.disabled = false; button.textContent = label; } }
    });
    dialog.addEventListener("close", () => { state.detailSequence++; state.detail = null; if (state.returnFocus?.isConnected) state.returnFocus.focus({preventScroll: true}); });
    dialog.addEventListener("click", event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(); } });
    function sceneTooltip(target, point) {
      const tooltip = $("ix-scene-tooltip"), tile = target?.closest?.(".ix-scene-cell");
      if (!tile || !state.data) { tooltip.hidden = true; return; }
      const student = state.data.students.find(row => row.userId === Number(tile.dataset.student));
      const cell = student?.cells.find(row => row.taskKey === tile.dataset.task);
      if (!student) return;
      tooltip.innerHTML = `<strong>${esc(displayName(student))}</strong><span>${esc(taskName(tile.dataset.task))}</span><small>${esc(names[cell?.status || "not_started"])}${cell?.completedAt ? ` · ${date(cell.completedAt)} 完成` : cell?.checks ? ` · ${cell.checks} 次正式检查` : ""}</small>`;
      tooltip.hidden = false;
      const box = tile.getBoundingClientRect(), x = point?.clientX ?? box.right, y = point?.clientY ?? box.bottom;
      tooltip.style.left = `${Math.max(8, Math.min(x + 14, win.innerWidth - 280))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(y + 14, win.innerHeight - 125))}px`;
    }
    root.addEventListener("pointerover", event => sceneTooltip(event.target, event));
    root.addEventListener("pointerout", event => { if (event.target.closest?.(".ix-scene-cell")) $("ix-scene-tooltip").hidden = true; });
    root.addEventListener("focusin", event => sceneTooltip(event.target));
    root.addEventListener("focusout", () => { $("ix-scene-tooltip").hidden = true; });
    root.addEventListener("keydown", event => {
      const target = event.target;
      if (!target.matches("svg [role=button]")) return;
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); target.dispatchEvent(new win.MouseEvent("click", {bubbles: true})); return; }
      if (!target.matches(".ix-scene-cell") || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const cells = [...target.closest(".ix-scene-island").querySelectorAll(".ix-scene-cell")];
      const index = cells.indexOf(target), step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -10, ArrowDown: 10}[event.key] || 0;
      const next = event.key === "Home" ? 0 : event.key === "End" ? cells.length - 1 : Math.max(0, Math.min(cells.length - 1, index + step));
      target.setAttribute("tabindex", "-1"); cells[next].setAttribute("tabindex", "0"); cells[next].focus();
    });
    doc.addEventListener("keydown", event => { if (event.key === "Escape" && state.screen && !dialog.open) screen(); });
    const observer = new win.ResizeObserver(() => { for (const c of state.charts.values()) c.resize(); }); observer.observe(root);
    const visibilityObserver = new win.MutationObserver(() => { if (root.hidden && state.screen) screen(false, false); }); visibilityObserver.observe(root, {attributes: true, attributeFilter: ["hidden"]});
    win.setInterval(() => { if (state.auto && state.screen && !doc.hidden && !root.hidden && !state.busy && !dialog.open) void load(state.course); }, 60000);
    return {setCourse, load, close: closeDialog};
  }
  return {create, scopeParams, completion, filterStudents};
});

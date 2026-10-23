(function (host, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else host.DojoAnalytics = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const colors = {high: "#f69d9d", medium: "#ffc782", low: "#71dfc6", unknown: "#899bb5"};
  const labels = {high: "优先跟进", medium: "持续关注", low: "进展稳定", unknown: "证据不足"};
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);
  const number = value => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const format = value => number(value) == null ? "—" : new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1}).format(Number(value));
  const percent = (value, scale = 1) => number(value) == null ? "—" : format(Number(value) * scale) + "%";
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false}) : "暂无活动";
  const completion = row => Number(row.requiredTotal) > 0 ? Number(row.requiredSolved || 0) / Number(row.requiredTotal) : null;
  const empty = (title, detail = "") => `<div class="la-empty"><i class="fas fa-chart-area" aria-hidden="true"></i><strong>${escape(title)}</strong><span>${escape(detail)}</span></div>`;
  const meter = value => `<div class="la-meter"><i style="width:${Math.max(0, Math.min(100, Number(value || 0)))}%"></i></div>`;
  const badge = row => `<span class="la-badge is-${escape(row.riskLevel)}">${escape(labels[row.riskLevel] || "证据不足")}</span>`;
  function slicePage(rows, page, size) {
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const current = Math.max(1, Math.min(pages, Number(page) || 1));
    return {rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length, size};
  }
  function snapshotModel(data = {}) {
    const students = data.students || [], summary = data.summary || {}, metrics = data.metrics || summary.metrics || {};
    const bands = Object.keys(labels).map(key => ({key, name: labels[key], value: students.filter(row => row.riskLevel === key).length, itemStyle: {color: colors[key]}}));
    const observed = students.filter(row => number(row.masteryScore) != null);
    return {students, summary, metrics, bands, observed, timeline: data.timeline || [], modules: data.moduleDiagnostics || [], abilities: data.abilityOverview || [], questions: data.challengeDiagnostics || [], individual: data.scope?.filters?.studentId != null};
  }
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function rosterCsv(rows, data = {}) {
    const lines = [["玄甲 · 当前筛选名单"], ["数据截至", data.asOf], ["定义版本", data.definitionVersion], ["分析范围", JSON.stringify(data.scope?.filters || {})],
      ["导出人数", rows.length], ["学生ID", "学生", "关注状态", "能力掌握度(%)", "本期必修通过比例(%)", "通过必修题", "必修题数", "过程证据数", "最近活动"]];
    rows.forEach(row => lines.push([row.userId, row.name, labels[row.riskLevel], row.masteryScore, completion(row) == null ? "未配置" : format(completion(row) * 100), row.requiredSolved, row.requiredTotal, row.evidenceCount, row.lastActivity]));
    return "\uFEFF" + lines.map(row => row.map(csvCell).join(",")).join("\r\n");
  }
  function scopeParams(scope = {}) {
    const params = new URLSearchParams({timeRange: scope.timeRange || "12w"});
    for (const key of ["studentId", "moduleIndex", "challengeId"]) {
      if (scope[key] != null && scope[key] !== "") params.set(key, String(scope[key]));
    }
    return params;
  }
  function create(root, actions) {
    if (!root) return null;
    const doc = root.ownerDocument, win = doc.defaultView;
    const $ = id => doc.getElementById(id);
    const charts = new Map();
    let data = {}, model = snapshotModel(), roster = [], view = "overview", busy = false;
    let rosterPage = 1, matrixPage = 1, questionPage = 1, rosterKey = "";
    const motion = win.matchMedia("(prefers-reduced-motion: reduce)");
    const text = (id, value) => { if ($(id)) $(id).textContent = value; };
    const baseOption = description => ({animation: !motion.matches, animationDuration: 550, animationDurationUpdate: 320,
      animationEasing: "cubicOut", animationEasingUpdate: "cubicOut", backgroundColor: "transparent",
      textStyle: {fontFamily: "system-ui, sans-serif", color: "#a3b8d0"},
      aria: {enabled: true, label: {description}},
      tooltip: {trigger: "axis", renderMode: "richText", backgroundColor: "#162c44", borderColor: "#55748d", textStyle: {color: "#f4f8ff"}, confine: true},
      grid: {left: 14, right: 20, top: 40, bottom: 20, containLabel: true},
      xAxis: {type: "category", axisLine: {lineStyle: {color: "#3b5069"}}, axisTick: {show: false}, axisLabel: {color: "#9aafc5", fontSize: 11}},
      yAxis: {type: "value", min: 0, splitLine: {lineStyle: {color: "#253b51", type: "dashed"}}, axisLabel: {color: "#9aafc5", fontSize: 11}},
    });
    function chart(id, options, description, onClick, noData) {
      const node = $(id);
      if (!node || !node.getClientRects().length) return;
      if (noData || !win.echarts) {
        charts.get(id)?.dispose(); charts.delete(id);
        node.innerHTML = empty(noData || "图表暂不可用", noData ? "有新记录后，刷新即可看到变化。" : "可展开下方数值表，继续查看和筛选。");
        return;
      }
      let instance = charts.get(id);
      if (!instance) { node.innerHTML = ""; instance = win.echarts.init(node, null, {renderer: "svg"}); charts.set(id, instance); }
      instance.off("click");
      instance.setOption({...baseOption(description), ...options}, {replaceMerge: ["series", "graphic"], lazyUpdate: false});
      if (onClick) instance.on("click", params => { if (!busy) onClick(params); });
      instance.resize();
    }
    function renderTrend() {
      const key = $("la-trend-metric").value;
      const label = $("la-trend-metric").selectedOptions[0].textContent;
      const rows = model.timeline;
      const total = rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
      text("cs-timeline-subtitle", `按 UTC 周一汇总${data.timelineMeta?.truncated ? " · 图表展示最近 52 周" : ""} · 首尾周按所选日期截取`);
      chart("cs-learning-timeline", {xAxis: {...baseOption().xAxis, data: rows.map(row => row.label)},
        yAxis: {...baseOption().yAxis, minInterval: 1, name: label.split(" · ")[1], nameTextStyle: {color: "#9aafc5"}},
        series: [{id: "activity-" + key, name: label.split(" · ")[0], type: key === "activeStudents" ? "line" : "bar", smooth: false,
          data: rows.map(row => ({id: row.start, value: Number(row[key] || 0)})), symbol: "circle", symbolSize: 6,
          lineStyle: {color: "#68e0cf", width: 3}, itemStyle: {color: "#68e0cf", borderRadius: [5,5,0,0]}, barMaxWidth: 30,
          areaStyle: {color: {type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{offset:0,color:"#5ce0cc55"},{offset:1,color:"#5ce0cc02"}]}}}],
      }, `${label}，${rows.length} 周。每周完整数值在下方表格。`, null, total === 0 ? "这段时间还没有对应记录" : null);
      $("la-trend-table").innerHTML = `<table class="la-table"><thead><tr><th>周起点 (UTC)</th><th>活跃学生</th><th>新尝试</th><th>通过记录</th><th>过程证据</th><th>最新评估</th><th>任务更新</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.start?.slice(0,10))}</td>${["activeStudents","attempts","solves","evidence","assessments","submissions"].map(k=>`<td>${format(row[k] || 0)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    function renderRisk() {
      chart("la-risk-chart", {grid: undefined, xAxis: undefined, yAxis: undefined, tooltip: {trigger: "item", renderMode: "richText", confine: true, formatter: "{b}：{c} 人 ({d}%)"},
        graphic: [{id: "count", type: "text", left: "center", top: "38%", style: {text: String(model.students.length), fill: "#eff7ff", font: "600 34px system-ui"}},
          {id: "label", type: "text", left: "center", top: "61%", style: {text: "当前范围 · 人", fill: "#b0c2d6", font: "12px system-ui"}}],
        series: [{id: "attention", type: "pie", radius: ["66%", "82%"], center: ["50%","51%"], minAngle: 0, padAngle: 3, label: {show: false}, itemStyle: {borderRadius: 5},
          data: model.bands.map(row=>({...row,id:row.key})), emphasis: {scaleSize: 5}}],
      }, model.bands.map(row=>`${row.name}${row.value}人`).join("，") + "。下方分类按钮可打开名单。", params => actions.focusRoster(params.data.key), model.students.length ? null : "课程尚无学生");
      $("la-risk-legend").innerHTML = model.bands.map(row=>`<button type="button" data-la-risk="${row.key}" ${row.value ? "" : "disabled"}><span><i class="la-dot" style="--dot:${colors[row.key]}"></i>${row.name}</span><b>${row.value}</b></button>`).join("");
    }
    function renderModules() {
      const rows = model.modules;
      const hasData = rows.some(row => row.attemptedPairs > 0);
      const shown = rows.length > 10 ? rows.slice(0,10) : rows;
      chart("la-module-chart", {grid: {left: 10, right: 30, top: 20, bottom: 25, containLabel: true},
        xAxis: {...baseOption().yAxis, max: 100, axisLabel: {color: "#9aafc5", formatter: "{value}%"}},
        yAxis: {type: "category", inverse: true, data: shown.map(row=>row.name), axisTick: {show:false}, axisLine: {show:false}, axisLabel:{color:"#b2c5d8",width:125,overflow:"truncate",fontSize:11}},
        series: [{id: "module-success", type: "bar", name: "参与后通过比例", barMaxWidth: 17, showBackground: true, backgroundStyle: {color: "#21364c",borderRadius:5},
          itemStyle: {color: "#92a6ff",borderRadius:[0,5,5,0]}, data: shown.map(row=>({id:String(row.index ?? row.moduleIndex),value: row.attemptSuccessRate == null ? null : Math.round(row.attemptSuccessRate * 1000)/10, moduleIndex: row.index ?? row.moduleIndex}))}],
      }, `章节参与后通过比例，0至100%。${rows.length > shown.length ? "首图显示前10章；下方表格包含全部章节。" : ""}点击章节可筛选。`, params=>actions.scope({moduleIndex: String(params.data.moduleIndex), challengeId:""}), hasData ? null : "尚无章节参与记录");
      $("la-module-table").innerHTML = `<table class="la-table"><thead><tr><th>章节 / 全局下钻</th><th>通过 / 参与对数</th><th>参与后通过比例</th><th>本期必修通过</th></tr></thead><tbody>${rows.map(row=>`<tr><td><button type="button" data-la-module="${Number(row.index ?? row.moduleIndex)}">${escape(row.name)}</button></td><td>${format(row.solvedPairs || 0)} / ${format(row.attemptedPairs || 0)}</td><td>${percent(row.attemptSuccessRate,100)}</td><td>${percent(row.requiredCompletionRate,100)}</td></tr>`).join("")}</tbody></table>`;
    }
    function renderAbilities() {
      const rows = model.abilities;
      const minimum = model.individual ? 1 : 3;
      chart("cs-ability-overview", {grid: {left: 5,right:25,top:22,bottom:20,containLabel:true},
        xAxis: {...baseOption().yAxis,max:100,axisLabel:{color:"#9aafc5",formatter:"{value}%"}},
        yAxis: {type:"category",inverse:true,data:rows.map(row=>row.label),axisTick:{show:false},axisLine:{show:false},axisLabel:{color:"#b2c5d8",fontSize:11}},
        series:[{id:"abilities",name:"掌握度",type:"bar",barMaxWidth:15,showBackground:true,backgroundStyle:{color:"#20354a",borderRadius:5},itemStyle:{color:"#6ae0c3",borderRadius:5},
          data:rows.map(row=>({id:row.dimension,value:row.studentsWithEvidence>=minimum?row.averageMastery:null})),label:{show:true,position:"right",color:"#b2d9ce",fontSize:11,formatter:p=>p.value==null?"":p.value+"%"}}],
      }, "已评估学生的各维度平均掌握度；完整学生证据在能力矩阵。", ()=>showView("ability"), rows.some(row=>row.averageMastery!=null&&row.studentsWithEvidence>=minimum) ? null : "还需要更多能力评估");
      text("la-ability-note", `${model.observed.length} / ${model.students.length} 人已有能力评估${model.individual ? "" : " · 班级均值至少需要 3 人"}。点击“能力与题目”查看每名学生。`);
    }
    function pagination(id, result, kind) {
      $(id).innerHTML = `<span>${result.total} 项 · 第 ${result.page} / ${result.pages} 页</span><button type="button" data-la-page="${kind}" data-direction="-1" ${result.page<=1?"disabled":""}>上一页</button><button type="button" data-la-page="${kind}" data-direction="1" ${result.page>=result.pages?"disabled":""}>下一页</button>`;
    }
    function renderMatrix() {
      const result = slicePage(model.students, matrixPage, 20); matrixPage=result.page;
      $("la-matrix").innerHTML = model.students.length ? `<table><thead><tr><th>学生</th>${model.abilities.map(row=>`<th scope="col">${escape(row.label)}</th>`).join("")}</tr></thead><tbody>${result.rows.map(student=>`<tr><th scope="row"><button type="button" class="la-student-label" data-la-student="${Number(student.userId)}" title="${escape(student.name)}">${escape(student.name)}</button></th>${model.abilities.map(ability=>{const skill=(student.skills||[]).find(row=>row.dimension===ability.dimension); const value=skill?.evidenceCount>0?number(skill.mastery):null;
        const color=value==null?"#26384e":value<45?"#75442a":value<60?"#655436":value<75?"#314e85":"#137265";
        return `<td><button type="button" data-la-student="${Number(student.userId)}" style="--cell:${color}" aria-label="${escape(student.name)}，${escape(ability.label)}，${value==null?"未观测":percent(value)}，查看证据">${value==null?"—":format(value)}</button></td>`;}).join("")}</tr>`).join("")}</tbody></table>` : empty("还没有学生加入", "学生加入并完成评估后，会在这里形成能力矩阵。");
      pagination("la-matrix-pagination",result,"matrix");
    }
    function renderQuestions() {
      const rows = [...model.questions], sort = $("la-question-sort").value;
      if(sort==="course") rows.sort((a,b)=>a.moduleIndex-b.moduleIndex||a.challengeIndex-b.challengeIndex);
      if(sort==="participation") rows.sort((a,b)=>b.attemptedStudents-a.attemptedStudents);
      const result=slicePage(rows,questionPage,10); questionPage=result.page;
      $("cs-bottleneck-list").innerHTML = rows.length ? `<div class="la-question-list">${result.rows.map(row=>`<article class="la-question"><div><small>${escape(row.moduleName)}</small><h4>${escape(row.name)}</h4><small>${Number(row.solvedStudents)} / ${Number(row.attemptedStudents)} 人通过 / 参与</small></div><div class="la-score">${row.attemptedStudents>=Number(row.minimumReliableSample||3)?percent(row.attemptSuccessRate,100):"—"}<small>${row.attemptedStudents>=3?"参与后通过":"小样本"}</small></div><footer><span>${Number(row.strugglingStudents)} 人反复尝试${row.commonGaps?.[0]?` · ${escape(row.commonGaps[0].label)}`:""}</span><button type="button" data-la-question="${Number(row.id)}" data-module="${Number(row.moduleIndex)}">分析此题 <i class="fas fa-arrow-right" aria-hidden="true"></i></button></footer></article>`).join("")}</div>` : empty("当前范围还没有题目", "先为课程配置实践题，学生的参与和通过结果会汇总在这里。");
      pagination("la-question-pagination",result,"questions");
    }
    function renderRoster(rows, preservePage) {
      roster = rows;
      const key = JSON.stringify(rows.map(row=>row.userId));
      if (!preservePage && key !== rosterKey) rosterPage=1;
      rosterKey=key;
      const result=slicePage(rows,rosterPage,25); rosterPage=result.page;
      text("cs-student-result-count", `${rows.length} / ${model.students.length} 人`);
      $("cs-student-table").innerHTML = rows.length ? result.rows.map(row=>`<tr data-student-id="${Number(row.userId)}" tabindex="0" aria-label="查看${escape(row.name)}的学情详情"><td><strong class="la-name">${escape(row.name)}</strong>${badge(row)}</td><td>${row.masteryScore==null?"未观测":`<strong>${percent(row.masteryScore)}</strong>${meter(row.masteryScore)}`}<small>${(row.skills||[]).filter(skill=>skill.evidenceCount>0).length} 个已评估维度</small></td><td>${completion(row)==null?"未配置":`<strong>${percent(completion(row),100)}</strong>${meter(completion(row)*100)}`}<small>${Number(row.requiredSolved||0)} / ${Number(row.requiredTotal||0)} 道题</small></td><td>${escape(row.riskSignals?.[0]?.label || "暂无明确关注项")}<small>${escape(row.weakSkills?.[0]?.label || "等待更多评估")}</small></td><td>${format(row.evidenceCount||0)} 条证据<small>${format(row.attemptCount||0)} 次参与尝试 · ${escape(row.evidenceLevel||"不足")}</small></td><td>${escape(date(row.lastActivity))}</td><td><button type="button" data-open-student="${Number(row.userId)}" aria-label="打开${escape(row.name)}的学情详情"><i class="fas fa-arrow-right" aria-hidden="true"></i></button></td></tr>`).join("") : `<tr><td colspan="7">${empty("没有匹配的学生", "可清除名单筛选，或切换上方分析范围。")}</td></tr>`;
      pagination("la-roster-pagination",result,"roster");
    }
    function renderFollowups() {
      const filter=$("la-followup-filter").value;
      const rows=model.students.flatMap(student=>(student.interventionHistory||[]).map(record=>({...record,student})))
        .filter(row=>filter==="all"||row.status===filter).sort((a,b)=>(a.status==="ready_for_review"?-1:0)-(b.status==="ready_for_review"?-1:0)||String(b.startedAt).localeCompare(String(a.startedAt)));
      $("la-followups").innerHTML=rows.length?rows.map(row=>`<article class="la-followup"><span class="la-badge">${escape(({reviewed:"已复查",tracking:"跟进中",ready_for_review:"待复查"})[row.status]||row.status)}</span><div><strong>${escape(row.student.name)} · ${escape(row.title)}</strong><p>${escape(row.plan)}</p><small>开始 ${date(row.startedAt)} · 约定复查 ${date(row.followUpAt)}${row.reviewedAt?` · ${escape(row.teacherOutcomeLabel||"已复查")}`:""}</small></div><button type="button" data-la-student="${Number(row.studentId)}">打开记录</button></article>`).join(""):empty("暂无这类跟进记录", "可从建议名单进入学生详情，记录计划并约定复查时间。");
    }
    function render(dataSnapshot) {
      data=dataSnapshot||{}; model=snapshotModel(data);
      const total=model.students.length, active=Number(model.summary.activeStudents||0), covered=Number(model.summary.evidenceCoveredStudents||0);
      text("la-headline", total?`当前范围 ${total} 名学生，${active} 人留下学习记录。沿着图表，找到下一步教学重点。`:"课程还没有学生加入。加入后，学习记录会在这里汇总。");
      text("cs-progress-freshness", data.asOf?`更新于 ${date(data.asOf)}`:"等待学习数据");
      text("cs-insight-coverage",total?`${active} / ${total}`:"—"); text("cs-insight-coverage-note",`${covered} 人达到基础证据量`);
      text("cs-insight-stalled",percent(model.metrics.verifiedCompletion?.value,100)); text("cs-insight-stalled-note", data.requiredChallengeCount?`${format(model.metrics.verifiedCompletion?.numerator||0)} / ${format(model.metrics.verifiedCompletion?.denominator||0)} 学生题目对`:"当前范围尚未配置必修题");
      text("cs-insight-mastery",percent(model.metrics.averageMastery?.value)); text("cs-insight-mastery-note", `${model.observed.length} 人有评估${model.individual?"":" · 班级均值需 3 人"}`);
      text("cs-insight-risk",number(model.metrics.highRiskStudents?.value)==null?"—":format(model.metrics.highRiskStudents.value)); text("cs-insight-risk-note",`${model.bands.find(row=>row.key==="unknown").value} 人证据不足，等待诊断`);
      text("la-snapshot-status",data.asOf?"已同步此范围的快照":"尚未读取数据");
      renderView();
    }
    function renderView() {
      if(view==="overview") {renderTrend();renderRisk();renderModules();renderAbilities();}
      if(view==="ability") {renderMatrix();renderQuestions();}
      if(view==="actions") renderFollowups();
    }
    function showView(next, focus=false) {
      if(!["overview","ability","students","actions"].includes(next))return;
      view=next;
      root.querySelectorAll("[data-la-tab]").forEach(tab=>{const selected=tab.dataset.laTab===next;tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;});
      root.querySelectorAll(".la-view").forEach(panel=>panel.hidden=panel.id!=="la-view-"+next);
      renderView(); if(focus) $("la-tab-"+next).focus();
    }
    function setStatus(state, message="") {
      busy=state==="loading";
      root.classList.toggle("is-loading",busy); root.setAttribute("aria-busy",String(busy));
      const banner=$("la-load-state"); banner.hidden=state==="ready";
      banner.textContent=state==="loading"?"正在读取新范围；下方是上一次已确认的快照…":message||"读取失败。请重试刷新；当前仍是上一次确认的范围。";
      text("la-snapshot-status",state==="ready"?"已同步此范围的快照":state==="loading"?"正在更新…":"更新失败 · 显示上次快照");
      $("cs-export-learning").disabled=busy||!data.asOf; $("la-export-roster").disabled=busy||!data.asOf;
    }
    root.addEventListener("click",event=>{
      const button=event.target.closest("button"); if(!button)return;
      if(button.dataset.laTab)showView(button.dataset.laTab);
      if(button.dataset.laGo)showView(button.dataset.laGo,true);
      if(button.dataset.laStudent&&!busy)actions.student(button.dataset.laStudent,button);
      if(button.dataset.laRisk&&!busy)actions.focusRoster(button.dataset.laRisk);
      if(button.dataset.laModule!=null&&!busy)actions.scope({moduleIndex:button.dataset.laModule,challengeId:""});
      if(button.dataset.laQuestion&&!busy)actions.scope({moduleIndex:button.dataset.module,challengeId:button.dataset.laQuestion});
      if(button.dataset.laPage) {const offset=Number(button.dataset.direction);if(button.dataset.laPage==="roster"){rosterPage+=offset;renderRoster(roster,true);}else if(button.dataset.laPage==="matrix"){matrixPage+=offset;renderMatrix();}else{questionPage+=offset;renderQuestions();}}
    });
    root.querySelector(".la-tabs").addEventListener("keydown",event=>{
      const tab=event.target.closest("[data-la-tab]"); if(!tab)return;
      const keys=["overview","ability","students","actions"];let index=keys.indexOf(tab.dataset.laTab);
      if(event.key==="ArrowRight")index=(index+1)%4;else if(event.key==="ArrowLeft")index=(index+3)%4;else if(event.key==="Home")index=0;else if(event.key==="End")index=3;else return;
      event.preventDefault();showView(keys[index],true);
    });
    $("la-trend-metric").addEventListener("change",renderTrend);
    $("la-question-sort").addEventListener("change",()=>{questionPage=1;renderQuestions();});
    $("la-followup-filter").addEventListener("change",renderFollowups);
    $("la-methods").addEventListener("click",()=>{const details=root.querySelector(".cs-learning-methodology");details.open=true;details.scrollIntoView({behavior:motion.matches?"instant":"smooth",block:"start"});details.querySelector("summary").focus();});
    $("la-expand").addEventListener("click",()=>{const expanded=root.classList.toggle("is-expanded");$("la-expand").setAttribute("aria-pressed",String(expanded));$("la-expand").querySelector("span").textContent=expanded?"收起":"展开";renderView();});
    doc.addEventListener("keydown",event=>{if(event.key==="Escape"&&root.classList.contains("is-expanded")&&!doc.body.classList.contains("has-learning-drawer"))$("la-expand").click();});
    $("la-reset-roster").addEventListener("click",()=>actions.resetRoster());
    $("la-export-roster").addEventListener("click",()=>{
      if(busy)return;
      const url=win.URL.createObjectURL(new Blob([rosterCsv(roster,data)],{type:"text/csv;charset=utf-8"}));
      const link=doc.createElement("a");link.href=url;link.download=`学情名单-${new Date().toISOString().slice(0,10)}.csv`;link.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
    });
    let resizeFrame;
    const resize=new win.ResizeObserver(()=>{win.cancelAnimationFrame(resizeFrame);resizeFrame=win.requestAnimationFrame(()=>{if(root.getClientRects().length)renderView();});});resize.observe(root);
    motion.addEventListener("change",()=>renderView());
    return {render,renderRoster,showView,setStatus,renderTrend,renderAbilities,renderQuestions,dispose:()=>{resize.disconnect();charts.forEach(chart=>chart.dispose());charts.clear();}};
  }
  return {create,snapshotModel,slicePage,rosterCsv,scopeParams,completion,number,percent,escape};
});

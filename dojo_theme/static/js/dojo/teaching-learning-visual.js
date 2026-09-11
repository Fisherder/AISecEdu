(function () {
  "use strict";
  const root = document.getElementById("teaching-visual-learning");
  const api = window.DojoLearning;
  if (!root || !api) return;
  const select = document.getElementById("learning-visual-course");
  const refresh = document.getElementById("learning-visual-refresh");
  const content = document.getElementById("learning-visual-content");
  const meta = document.getElementById("learning-visual-meta");
  const detail = document.getElementById("learning-visual-detail");
  const classroom = document.getElementById("learning-classroom-content");
  const escape = api.escapeHtml;
  let requestId = 0;
  let timer = null;
  let visible = false;
  let loadedCourse = "";
  let updatedAt = 0;
  const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
  function empty(title, message) {
    content.innerHTML = `<div class="learning-visual-empty"><strong>${escape(title)}</strong><p>${escape(message)}</p></div>`;
  }
  function render(data) {
    const summary = data.summary || {};
    const metrics = data.metrics || {};
    const completion = metrics.verifiedCompletion || {};
    const bands = data.riskBands || {};
    const studentCount = count(summary.studentCount);
    const completionLabel = studentCount && !completion.unavailableReason && completion.value != null ? `${Math.round(Number(completion.value) * 100)}%` : "—";
    const values = [[studentCount, "课程学生"], [completionLabel, "已验证完成率"], [count(data.evidenceCount), "真实过程证据"], [count(bands.unknown), "证据不足，暂不判断"]];
    const timeline = (Array.isArray(data.timeline) ? data.timeline : []).slice(-8);
    const max = Math.max(1, ...timeline.map((week) => count(week.activeStudents)));
    const hasActivity = timeline.some((week) => count(week.activeStudents) > 0);
    const bars = hasActivity ? `<div class="learning-visual-bars" role="img" aria-label="每周活跃学生：${escape(timeline.map((week) => `${week.label}，${count(week.activeStudents)} 人`).join("；"))}">${timeline.map((week) => `<div><b>${count(week.activeStudents)}</b><i style="--bar-height:${Math.max(2, count(week.activeStudents) / max * 100)}px"></i><span>${escape(week.label)}</span></div>`).join("")}</div>` : '<div class="learning-visual-empty"><strong>尚无学习活动</strong><p>开始学习后，趋势会按周更新。</p></div>';
    const risks = [["high", "优先关注", "#b84c50"], ["medium", "持续观察", "#ac711b"], ["low", "常规跟进", "#258373"], ["unknown", "证据不足", "#64748b"]];
    content.innerHTML = `<div class="learning-visual-metrics">${values.map(([value, label]) => `<div><strong>${escape(String(value))}</strong><span>${escape(label)}</span></div>`).join("")}</div><div class="learning-visual-charts"><article><h3>每周活跃学生 · 最近 ${timeline.length} 周</h3>${bars}</article><article><h3>基于证据的关注分布</h3>${studentCount ? risks.map(([key, label, color]) => `<div class="learning-risk-row"><span>${label}</span><progress max="${studentCount}" value="${count(bands[key])}" style="--risk-color:${color}" aria-label="${label} ${count(bands[key])} 人"></progress><b>${count(bands[key])}</b></div>`).join("") : '<div class="learning-visual-empty"><strong>还没有学生入课</strong><p>这里会展示真实参与者；不会填充模拟成绩。</p></div>'}</article></div>`;
    meta.textContent = `真实课程数据 · ${data.asOf ? new Date(data.asOf).toLocaleString("zh-CN", { hour12: false }) : "刚刚更新"} · 可见时每 45 秒刷新 · 关注分布用于教学跟进，不自动影响成绩`;
  }
  function renderClassroom(data) {
    const values = [[data.liveSessionCount, "正在进行的课堂"], [data.participantCount, "参与课堂的学生"], [data.responseCount, "学生回应"], [data.completionCount, "完成的课堂活动"]];
    classroom.innerHTML = `<h3>课堂参与 · 近 28 天</h3><div class="learning-visual-metrics">${values.map(([value, label]) => `<div><strong>${count(value)}</strong><span>${label}</span></div>`).join("")}</div><p class="learning-visual-meta">${escape(data.definition || "")}</p>`;
    const weeks = Array.isArray(data.timeline) ? data.timeline : [];
    if (weeks.length) {
      const maximum = Math.max(1, ...weeks.map(week => count(week.participants)));
      classroom.insertAdjacentHTML("beforeend", `<h3>每周课堂参与学生</h3><div class="learning-visual-bars" role="img" aria-label="${escape(weeks.map(week => `${week.label}，${count(week.participants)} 人`).join("；"))}">${weeks.map(week => `<div><b>${count(week.participants)}</b><i style="--bar-height:${Math.max(2, count(week.participants) / maximum * 100)}px"></i><span>${escape(week.label)}</span></div>`).join("")}</div>`);
    }
    if (Array.isArray(data.classrooms) && data.classrooms.length) classroom.insertAdjacentHTML("beforeend", `<div class="learning-classroom-links">${data.classrooms.map(item => `<p><a href="${escape(item.url)}">${escape(item.title)}</a> · ${item.status === "LIVE" ? "进行中" : "课后回顾"} <button type="button" data-copy-classroom="${escape(item.url)}">复制课堂链接</button>${item.status === "LIVE" ? ` <button type="button" data-end-classroom="${escape(item.id)}">结束课堂</button>` : ""}</p>`).join("")}<p class="learning-visual-meta">课堂链接供本课程已加入的学生使用。</p></div>`);
  }
  async function load(force) {
    window.clearTimeout(timer);
    const course = select.value;
    if (!course) { ++requestId; loadedCourse = ""; detail.hidden = true; classroom.innerHTML = ""; refresh.disabled = false; content.setAttribute("aria-busy", "false"); empty("等待第一份真实学习证据", "创建课程、邀请学生并开展教学后，即可查看活动趋势与证据分布。示例预演不会写入学情。"); return; }
    if (!force && (!visible || document.hidden || document.getElementById("teaching-dashboard")?.hidden)) return;
    if (!force && course === loadedCourse && Date.now() - updatedAt < 44000) { timer = window.setTimeout(() => load(false), 45000); return; }
    const id = ++requestId;
    content.setAttribute("aria-busy", "true"); refresh.disabled = true;
    if (course !== loadedCourse) { classroom.innerHTML = ""; empty("正在读取课程学情", "图表将使用当前课程的真实学习记录。"); }
    try {
      const [responseResult, classroomResult] = await Promise.allSettled([
        api.request(`/teaching/progress/${encodeURIComponent(course)}`),
        api.request(`/teaching/progress/${encodeURIComponent(course)}/classroom`),
      ]);
      if (id !== requestId || select.value !== course) return;
      if (responseResult.status === "rejected") throw responseResult.reason;
      const response = responseResult.value;
      if (!response.success) throw new Error(api.errorMessage(response, "学情读取失败"));
      render(response.data || {}); loadedCourse = course; updatedAt = Date.now();
      if (classroomResult.status === "fulfilled" && classroomResult.value.success) renderClassroom(classroomResult.value.data || {});
      else classroom.innerHTML = '<p class="learning-visual-meta">课堂参与记录暂时不可用，可点击刷新重试。</p>';
      detail.href = `/teacher/courses?dojo=${encodeURIComponent(course)}&tab=students`; detail.hidden = false;
    } catch (error) {
      if (id !== requestId) return;
      detail.hidden = true; classroom.innerHTML = ""; empty("暂时无法读取学情", error.message || "请点击刷新重试。");
      meta.textContent = "本次读取未成功，未展示旧课程数据。";
    } finally {
      if (id === requestId) { content.setAttribute("aria-busy", "false"); refresh.disabled = false; timer = window.setTimeout(() => load(false), 45000); }
    }
  }
  document.addEventListener("teaching:dashboard", (event) => {
    const courses = event.detail.courses || [];
    const old = select.value;
    select.innerHTML = courses.length ? courses.map((course) => `<option value="${escape(course.referenceId)}">${escape(course.name)}</option>`).join("") : '<option value="">尚无课程</option>';
    if (courses.some((course) => course.referenceId === old)) select.value = old;
    if (old !== select.value || !updatedAt) load(false);
  });
  select.addEventListener("change", () => load(true));
  refresh.addEventListener("click", () => load(true));
  classroom.addEventListener("click", async (event) => {
    const end = event.target.closest("[data-end-classroom]");
    if (end) {
      end.disabled = true;
      try {
        const control = await api.json("POST", `/teaching/sessions/${encodeURIComponent(end.dataset.endClassroom)}/control`, { command: "end" });
        if (!control.success) throw new Error(api.errorMessage(control, "结束课堂失败"));
        const decision = await api.json("POST", `/teaching/actions/${encodeURIComponent(control.data.action.id)}/decision`, { decision: "APPROVED", confirmed: true, comment: "教师从学情面板结束课堂" });
        if (!decision.success || decision.data.action.status !== "APPROVED") throw new Error("结束课堂失败，请重试。");
        await load(true);
      } catch (error) { meta.textContent = error.message; end.disabled = false; }
      return;
    }
    const button = event.target.closest("[data-copy-classroom]");
    if (!button) return;
    try { await navigator.clipboard.writeText(new URL(button.dataset.copyClassroom, location.origin).href); button.textContent = "已复制"; }
    catch { button.textContent = "可右键复制左侧课堂链接"; }
  });
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) load(false); else window.clearTimeout(timer); }).observe(root);
  document.addEventListener("visibilitychange", () => { if (document.hidden) window.clearTimeout(timer); else load(false); });
})();

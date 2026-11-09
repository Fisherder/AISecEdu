document.addEventListener("DOMContentLoaded", function () {
  const root = document.getElementById("learning-dashboard");
  if (!root) return;

  const learning = window.DojoLearning;
  const dojoId = root.dataset.dojoId;
  const notice = document.getElementById("learning-dashboard-notice");
  let dashboard = null;
  let selectedAttempt = null;
  let selectedSkillIndex = 0;
  let refreshing = false;
  const byId = id => document.getElementById(id);
  const escape = value => learning.escapeHtml(value);
  const list = value => Array.isArray(value) ? value : [];

  function finiteNumber(value) {
    if (value == null || !["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function percent(value) {
    const number = finiteNumber(value);
    return number == null ? null : Math.max(0, Math.min(100, number));
  }

  function count(value) {
    return Math.max(0, Math.floor(finiteNumber(value) || 0));
  }

  function numberLabel(value) {
    const number = finiteNumber(value);
    return number == null ? "—" : new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1}).format(number);
  }

  function setText(id, text) {
    const node = byId(id);
    if (node) node.textContent = text;
  }

  function localHref(value) {
    try {
      const url = new URL(value, window.location.origin);
      return value && url.origin === window.location.origin ? url.pathname + url.search + url.hash : "#";
    } catch (error) {
      return "#";
    }
  }

  function skillValue(skill) {
    const state = skill.masteryState || {};
    if (state.state === "UNKNOWN" || count(skill.evidenceCount) === 0) return null;
    return percent(Object.prototype.hasOwnProperty.call(state, "value") ? state.value : skill.mastery);
  }

  function attemptScore(attempt) {
    if (attempt.assessmentState !== "READY" || !attempt.assessment) return null;
    return finiteNumber(attempt.assessment.totalScore);
  }

  function scoreMaximum(assessment) {
    const maximum = finiteNumber(assessment && assessment.scorePolicy && assessment.scorePolicy.maxScore);
    return maximum != null && maximum > 0 ? maximum : 100;
  }

  function statusBadge(attempt) {
    const state = String(attempt.activityState || "");
    const tone = ({COMPLETED: "completed", IN_PROGRESS: "in-progress", SUBMITTED: "submitted", NOT_STARTED: "not-started"})[state] || "unknown";
    return `<span class="sl-state-badge is-${tone}">${escape(attemptStatusLabel(state))}</span>`;
  }

  function activateTab(name) {
    if (!["path", "skills", "attempts"].includes(name)) return;
    const target = "#learning-" + name;
    const trigger = root.querySelector(`[data-toggle="tab"][href="${target}"], [data-toggle="tab"][data-target="${target}"]`);
    const jquery = window.jQuery || window.$;
    if (trigger && jquery && jquery.fn && jquery.fn.tab) {
      jquery(trigger).tab("show");
      return;
    }
    for (const tab of ["path", "skills", "attempts"]) {
      const pane = byId("learning-" + tab);
      if (pane) {
        pane.classList.toggle("active", tab === name);
        pane.classList.toggle("show", tab === name);
      }
    }
    root.querySelectorAll('[data-toggle="tab"]').forEach(button => {
      const active = button.getAttribute("href") === target || button.getAttribute("data-target") === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false}).format(date) : "—";
  }

  function categoryLabel(value) {
    return ({
      GENERAL: "综合",
      WEB: "Web 安全",
      PWN: "二进制利用",
      REV: "逆向工程",
      CRYPTO: "密码学",
      FORENSICS: "取证",
    })[value] || value || "综合";
  }

  function attemptStatusLabel(value) {
    return ({NOT_STARTED: "未开始", IN_PROGRESS: "进行中", SUBMITTED: "已提交", COMPLETED: "已完成"})[value] || "状态待更新";
  }

  function assessmentStatusLabel(value) {
    return ({NOT_APPLICABLE: "尚未评分", PENDING: "等待评分", READY: "评分已完成", FAILED: "评分未完成"})[value] || "评分状态待更新";
  }

  function evidenceStatusLabel(value) {
    return ({NONE: "暂无过程证据", PARTIAL: "已有部分记录", COMPLETE: "过程记录完整", INVALID: "过程记录待复核"})[value] || "证据状态待更新";
  }

  function evidenceTypeLabel(value) {
    return ({
      "runtime.state.snapshot": "实验环境状态记录",
      "workspace.file.saved": "代码文件已保存",
      "coding.submission.verified": "编程作业已核验",
      "coding.basic.completed": "基础部分已完成",
      "tutor.chat.user": "向 AI 学习助手提问",
      "lab.started": "题目已启动",
      "lab.stopped": "题目已停止",
      "lab.reset.requested": "已请求重置题目",
      "terminal.command.completed": "终端命令已完成",
      "tutor.chat.assistant": "AI 学习助手已回复",
      "assessment.created": "评估已生成",
    })[value] || value || "证据事件";
  }

  function beginAssessmentProgress(button, noticeElement) {
    button.disabled = true;
    learning.showNotice(
      noticeElement,
      "AI 正在结合可核验结果与已授权学习证据生成反馈。",
      "info",
    );
    return function () {
      button.disabled = false;
    };
  }

  function renderRecommendations(items) {
    byId("learning-recommendations").innerHTML = list(items).map(item => `
      <li class="learning-recommendation sl-recommendation">
        <span class="sl-recommendation-rank">${escape(numberLabel(item.rank))}</span>
        <div class="sl-recommendation-copy">
          <h3 class="sl-recommendation-heading">${escape(item.challengeName)}</h3>
          <p class="sl-recommendation-meta">${escape(categoryLabel(item.category))} · 难度 ${escape(numberLabel(item.difficulty))}/5</p>
          <p class="sl-recommendation-reason">${escape(item.reason || "")}</p>
        </div>
        <a class="sl-recommendation-link" href="${escape(localHref(item.workspaceUrl))}">进入实践 <i class="fas fa-arrow-right" aria-hidden="true"></i></a>
      </li>`).join("");
    byId("learning-recommendations-empty").hidden = items.length !== 0;
  }

  function relatedAttempts(skill) {
    return list(dashboard && dashboard.attempts).filter(attempt => {
      const abilities = attempt.assessment && attempt.assessment.abilities;
      if (attempt.assessmentState !== "READY" || !abilities || !Object.prototype.hasOwnProperty.call(abilities, skill.dimension)) return false;
      return percent(abilities[skill.dimension] && abilities[skill.dimension].score) != null;
    });
  }

  function renderSkillDetail(skills) {
    const container = byId("learning-skill-detail");
    if (!container) return;
    const skill = skills[selectedSkillIndex];
    if (!skill) {
      container.innerHTML = '<p class="sl-empty">暂无能力维度记录。</p>';
      return;
    }
    const value = skillValue(skill);
    const records = relatedAttempts(skill);
    const state = skill.masteryState || {};
    const descriptions = {
      reconnaissance_environment: "环境与运行条件的识别情况。",
      technical_reasoning: "技术分析、假设与验证过程。",
      tool_orchestration: "实验工具的使用与配合情况。",
      debugging_adaptation: "调试过程及操作策略的调整情况。",
      solution_validation: "对方案结果的检查与验证情况。",
      safety_independence: "操作范围和辅助工具的使用情况。",
    };
    container.innerHTML = `
      <div class="sl-skill-detail-heading"><h3>${escape(skill.label)}</h3><strong>${value == null ? "暂无评估" : `${numberLabel(value)}<span>%</span>`}</strong></div>
      <p class="sl-skill-description">${escape(descriptions[skill.dimension] || "查看该维度的已保存评估反馈。")}</p>
      <div class="sl-skill-facts"><span>${value == null ? "尚无足够证据" : escape(state.label || "已有评估记录")}</span><span>${count(skill.evidenceCount)} 次评估证据</span></div>
      <div class="sl-skill-evidence"><h4>关联学习记录</h4>${records.length ? records.slice(0, 5).map(attempt => {
        const ability = attempt.assessment.abilities[skill.dimension];
        return `<button type="button" class="sl-related-attempt learning-attempt-open" data-attempt-id="${escape(attempt.id)}">
          <span class="sl-related-heading"><strong>${escape(attempt.challengeName)}</strong><b>${numberLabel(percent(ability.score))}%</b></span>
          <span class="sl-related-meta">第 ${escape(attempt.epoch)} 次学习 · ${escape(formatDate(attempt.assessment.created || attempt.started))}</span>
          ${ability.rationale ? `<span class="sl-related-reason">${escape(ability.rationale)}</span>` : ""}
        </button>`;
      }).join("") : '<p class="sl-empty">当前已加载记录中暂无该维度的单次评估。</p>'}</div>`;
  }

  function renderSkills(skills) {
    if (!skills[selectedSkillIndex]) selectedSkillIndex = 0;
    const chartValues = skills.map(skill => ({label: skill.label, value: skillValue(skill)}));
    for (const [id, compact] of [["learning-radar", false], ["learning-overview-radar", true]]) {
      const container = byId(id);
      if (container) container.innerHTML = window.DojoSkillChart
        ? window.DojoSkillChart.render(chartValues, {label: "能力掌握：已有评估维度", compact})
        : '<p class="sl-empty">能力图表暂未加载，可查看各维度记录。</p>';
    }
    byId("learning-skills-list").innerHTML = skills.map((skill, index) => {
      const value = skillValue(skill);
      const selected = selectedSkillIndex === index;
      return `<button type="button" class="sl-skill-button${selected ? " is-selected" : ""}${value == null ? " is-unknown" : ""}" data-skill-index="${index}" aria-pressed="${selected}" aria-controls="learning-skill-detail">
        <span class="sl-skill-heading"><strong>${escape(skill.label)}</strong><b class="sl-skill-value">${value == null ? "暂无评估" : `${numberLabel(value)}%`}</b></span>
        <span class="sl-skill-meta">${count(skill.evidenceCount)} 次评估证据</span>
        ${value == null ? "" : `<span class="sl-skill-meter" aria-hidden="true"><span style="width:${value}%"></span></span>`}
      </button>`;
    }).join("");
    renderSkillDetail(skills);
  }

  function renderRecentAttempts(attempts) {
    const container = byId("learning-recent-attempts");
    if (!container) return;
    container.innerHTML = attempts.length ? attempts.slice(0, 3).map(attempt => {
      const score = attemptScore(attempt);
      return `<button type="button" class="sl-recent-attempt learning-attempt-open" data-attempt-id="${escape(attempt.id)}">
        <span class="sl-recent-heading"><strong>${escape(attempt.challengeName)}</strong>${statusBadge(attempt)}</span>
        <span class="sl-recent-meta">${escape(attempt.moduleName)} · ${escape(formatDate(attempt.started))}</span>
        <span class="sl-recent-score">${score == null ? escape(assessmentStatusLabel(attempt.assessmentState)) : `${numberLabel(score)} / ${numberLabel(scoreMaximum(attempt.assessment))}`}</span>
      </button>`;
    }).join("") : '<p class="sl-empty">开始一次课程实践后，这里会显示学习记录。</p>';
  }

  function renderAttempts(attempts) {
    const search = (byId("learning-record-search") && byId("learning-record-search").value || "").trim().toLocaleLowerCase();
    const state = (byId("learning-record-state") && byId("learning-record-state").value || "all").toUpperCase();
    const filtered = attempts.filter(attempt => {
      const matchesText = `${attempt.challengeName || ""} ${attempt.moduleName || ""} ${attempt.epoch || ""} ${attemptStatusLabel(attempt.activityState)}`.toLocaleLowerCase().includes(search);
      const matchesState = !state || state === "ALL" || attempt.activityState === state || attempt.assessmentState === state;
      return matchesText && matchesState;
    });
    byId("learning-attempt-list").innerHTML = filtered.map(attempt => {
      const score = attemptScore(attempt);
      return `<tr>
        <td><button type="button" class="btn btn-link p-0 learning-attempt-open" data-attempt-id="${escape(attempt.id)}">${escape(attempt.challengeName)}</button></td>
        <td>${escape(attempt.moduleName)}</td>
        <td>${escape(attempt.epoch)}</td>
        <td>${statusBadge(attempt)}</td>
        <td>${score == null ? `<span class="sl-assessment-state">${escape(assessmentStatusLabel(attempt.assessmentState))}</span>` : `<strong class="sl-record-score">${numberLabel(score)} <span>/ ${numberLabel(scoreMaximum(attempt.assessment))}</span></strong>`}</td>
        <td>${escape(formatDate(attempt.started))}</td>
      </tr>`;
    }).join("");
    byId("learning-attempts-empty").hidden = filtered.length !== 0;
    byId("learning-attempts-empty").textContent = attempts.length ? "没有符合筛选条件的学习记录。" : "开始一次课程实践后，学习记录会显示在这里。";
    setText("learning-record-count", `显示 ${filtered.length} / ${attempts.length} 条最近记录`);
  }

  function renderCatalog(items) {
    document.getElementById("learning-catalog-list").innerHTML = items.map(item => learning.itemCard({
      href: `/${encodeURIComponent(dojoId)}/${encodeURIComponent(item.moduleId)}/${encodeURIComponent(item.id)}`,
      title: item.name,
      lines: [`${categoryLabel(item.category)} · 难度 ${item.difficulty}/5`, item.required ? "必修" : "选修", (item.tags || []).join("、")],
    })).join("");
  }

  function renderAssessment(assessment, attempt) {
    const empty = document.getElementById("learning-assessment-empty");
    const container = document.getElementById("learning-assessment");
    if (!assessment) {
      empty.hidden = false;
      container.hidden = true;
      empty.textContent = attempt && attempt.assessmentState === "PENDING"
        ? `等待评分 · 已提交于 ${formatDate(attempt.submitted)}`
        : "本次学习尚未形成评分；完成并提交后再查看结果。";
      return;
    }
    empty.hidden = true;
    container.hidden = false;
    byId("learning-assessment-score").textContent = `${numberLabel(assessment.totalScore)} / ${numberLabel(scoreMaximum(assessment))}`;
    const policy = assessment.scorePolicy || {};
    const criteria = list(assessment.criteria);
    const coding = assessment.source === "CODING_RUBRIC" || policy.kind === "ASSIGNMENT" && criteria.some(item => item.stage === "basic");
    const sumMaximum = rows => rows.reduce((sum, criterion) => sum + Math.max(0, finiteNumber(criterion.maxScore) || 0), 0);
    const basicCriteria = criteria.filter(item => item.stage === "basic");
    const thinkingCriteria = criteria.filter(item => item.stage === "thinking" || item.id === "ai.quality");
    const objectiveCriteria = criteria.filter(item => item.id === "objective-success");
    const processCriteria = criteria.filter(item => item.id !== "objective-success");
    const objectiveMaximum = coding ? sumMaximum(basicCriteria) : sumMaximum(objectiveCriteria);
    const processMaximum = coding ? sumMaximum(thinkingCriteria) : sumMaximum(processCriteria);
    const scorePart = (label, score, maximum) => `${label} ${numberLabel(score)}${maximum > 0 ? ` / ${numberLabel(maximum)}` : ""}`;
    const credit = finiteNumber(policy.completionCredit) || 0;
    const minimum = finiteNumber(policy.minimumScore);
    byId("learning-assessment-feedback-summary").textContent = [
      scorePart(coding ? "基础部分" : "客观结果", assessment.objectiveScore, objectiveMaximum),
      scorePart(coding ? "思考题" : "过程表现", assessment.processScore, processMaximum),
      credit > 0 ? `完成奖励 +${numberLabel(credit)}${minimum == null ? "" : `（补足至 ${numberLabel(minimum)} 分）`}` : "",
    ].filter(Boolean).join(" · ");
    document.getElementById("learning-assessment-feedback").textContent = assessment.feedback || "";
    const objective = criteria.find(criterion => criterion.id === "objective-success") || {};
    const grader = (objective.evidence || {}).grader || {};
    document.getElementById("learning-assessment-agent").innerHTML = grader.provider ? `
      <span class="badge badge-${grader.provider === "MODEL" ? "success" : "secondary"}">${grader.provider === "MODEL" ? "AI 辅助评估" : "规则评估"}</span>
      ${grader.liveContext ? '<span><i class="fas fa-server"></i> 已复核实时实验结果</span>' : ""}` : "";
    document.getElementById("learning-assessment-criteria").innerHTML = criteria.map(criterion => {
      const maximum = finiteNumber(criterion.maxScore);
      const score = finiteNumber(criterion.score);
      const ratio = maximum > 0 && score != null ? percent(score / maximum * 100) : 0;
      const evidence = criterion.evidence || {};
      const citationCount = (evidence.evidenceSequences || []).length
        + (evidence.containerEvidence || []).length;
      return `
        <div class="mb-3">
          <div class="d-flex justify-content-between"><span>${learning.escapeHtml(criterion.title)}</span><span>${learning.escapeHtml(criterion.score)} / ${learning.escapeHtml(criterion.maxScore)}</span></div>
          <div class="progress"><div class="progress-bar" role="progressbar" style="width:${ratio}%"></div></div>
          ${evidence.rationale ? `<small class="d-block mt-1">${learning.escapeHtml(evidence.rationale)}</small>` : ""}
          ${citationCount ? `<small class="d-block text-muted">已关联 ${learning.escapeHtml(citationCount)} 项可核验证据</small>` : ""}
        </div>`;
    }).join("");
  }

  function renderAttempt(attempt) {
    selectedAttempt = attempt;
    document.getElementById("learning-attempt-title").textContent = attempt.challengeName;
    document.getElementById("learning-attempt-meta").textContent = `${attempt.moduleName} · 第 ${attempt.epoch} 次学习 · ${attemptStatusLabel(attempt.activityState)}`;
    document.getElementById("learning-reflection").value = attempt.reflection || "";
    const chain = attempt.evidenceChain || {};
    document.getElementById("learning-evidence-chain").textContent = `${chain.valid ? "过程记录完整，可复核本次判断" : "过程记录需要复核"} · ${chain.events || 0} 条学习证据`;
    document.getElementById("learning-evidence-list").innerHTML = (attempt.evidence || []).map((event, index) => `
      <tr><td>${index + 1}</td><td>${learning.escapeHtml(evidenceTypeLabel(event.type))}</td><td>${Number(event.trustLevel) >= 3 ? "可核验记录" : "学习者记录"}</td><td>${learning.escapeHtml(formatDate(event.occurred))}</td></tr>`).join("");
    renderAssessment(attempt.assessment, attempt);
    document.getElementById("learning-appeal-reason").value = "";
  }

  async function openAttempt(attemptId) {
    try {
      const response = await learning.request(`/learning/attempts/${encodeURIComponent(attemptId)}`);
      if (!response.success) throw new Error(learning.errorMessage(response, "无法加载本次练习记录。"));
      renderAttempt(response.attempt);
      $("#learning-attempt-modal").modal("show");
    } catch (error) {
      learning.showNotice(notice, error.message, "danger");
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const button = byId("learning-refresh");
    if (button) button.disabled = true;
    root.setAttribute("aria-busy", "true");
    try {
      const [dashboardResponse, catalogResponse] = await Promise.all([
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/dashboard`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/catalog`),
      ]);
      if (!dashboardResponse.success) throw new Error(learning.errorMessage(dashboardResponse, "无法加载课程学习分析。"));
      const selectedDimension = list(dashboard && dashboard.skills)[selectedSkillIndex]?.dimension;
      dashboard = dashboardResponse;
      const progress = dashboard.progress || {};
      const skills = list(dashboard.skills);
      const attempts = list(dashboard.attempts);
      const selectedIndex = skills.findIndex(skill => skill.dimension === selectedDimension);
      selectedSkillIndex = selectedIndex < 0 ? 0 : selectedIndex;
      const observedSkills = skills.filter(item => skillValue(item) != null);
      const latestRated = attempts.filter(item => attemptScore(item) != null).sort((left, right) => (Date.parse(right.assessment.created || right.started) || 0) - (Date.parse(left.assessment.created || left.started) || 0))[0];
      const pendingAssessment = attempts.find(item => item.assessmentState === "PENDING");
      const latestEvidence = attempts.find(item => item.evidenceState && item.evidenceState !== "NONE");
      const completion = percent(progress.percent);
      setText("learning-progress-percent", completion == null ? "阅读课程" : `${numberLabel(completion)}%`);
      setText("learning-progress-value", progress.label || (count(progress.total) ? `已完成 ${count(progress.completed)} / ${count(progress.total)} 项必修内容` : "本章节以阅读学习为主"));
      const progressTrack = byId("learning-progress-track");
      if (progressTrack) {
        progressTrack.style.width = `${completion == null ? 0 : completion}%`;
        progressTrack.setAttribute("aria-valuemin", "0");
        progressTrack.setAttribute("aria-valuemax", "100");
        if (completion == null) progressTrack.removeAttribute("aria-valuenow");
        else progressTrack.setAttribute("aria-valuenow", String(completion));
        progressTrack.setAttribute("aria-valuetext", completion == null ? "暂无量化进度" : `${numberLabel(completion)}%`);
      }
      setText("learning-path-summary", count(progress.total)
        ? `已完成 ${count(progress.completed)} 项 · 待完成 ${Math.max(0, count(progress.total) - count(progress.completed))} 项必修内容`
        : "本课程以阅读学习为主");
      setText("learning-mastery-summary", observedSkills.length ? `${observedSkills.length} 项已有证据` : "尚无足够证据");
      setText("learning-assessment-summary", latestRated ? `${numberLabel(attemptScore(latestRated))} / ${numberLabel(scoreMaximum(latestRated.assessment))}` : pendingAssessment ? "等待评分" : "尚无评分");
      setText("learning-assessment-detail", latestRated ? `最近一次：${latestRated.challengeName}` : pendingAssessment ? `已提交于 ${formatDate(pendingAssessment.submitted)}` : "提交一次实践后显示结果");
      setText("learning-evidence-summary", latestEvidence ? evidenceStatusLabel(latestEvidence.evidenceState) : "暂无过程证据");
      renderRecommendations(list(dashboard.recommendations));
      renderSkills(skills);
      renderAttempts(attempts);
      renderRecentAttempts(attempts);
      if (catalogResponse.success) renderCatalog(list(catalogResponse.items));
      setText("learning-updated-at", `最近刷新 ${new Date().toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit"})}`);
      learning.showNotice(notice, catalogResponse.success ? "" : learning.errorMessage(catalogResponse, "课程目录暂时无法加载，请刷新重试。"), catalogResponse.success ? "info" : "warning");
    } catch (error) {
      learning.showNotice(notice, error.message || "无法加载课程学习分析。", "danger");
    } finally {
      refreshing = false;
      if (button) button.disabled = false;
      root.setAttribute("aria-busy", "false");
    }
  }

  root.addEventListener("click", function (event) {
    const attemptButton = event.target.closest(".learning-attempt-open");
    if (attemptButton && root.contains(attemptButton)) {
      openAttempt(attemptButton.dataset.attemptId);
      return;
    }
    const skillButton = event.target.closest("[data-skill-index]");
    if (skillButton && root.contains(skillButton)) {
      const index = Number(skillButton.dataset.skillIndex);
      const skills = list(dashboard && dashboard.skills);
      if (Number.isInteger(index) && skills[index]) {
        selectedSkillIndex = index;
        renderSkills(skills);
        const replacement = byId("learning-skills-list").querySelector(`[data-skill-index="${index}"]`);
        if (replacement && event.detail === 0) replacement.focus({preventScroll: true});
      }
      return;
    }
    const tabButton = event.target.closest("[data-learning-tab]");
    if (tabButton && root.contains(tabButton)) {
      event.preventDefault();
      activateTab(tabButton.dataset.learningTab);
    }
  });
  if (byId("learning-record-search")) byId("learning-record-search").addEventListener("input", () => renderAttempts(list(dashboard && dashboard.attempts)));
  if (byId("learning-record-state")) byId("learning-record-state").addEventListener("change", () => renderAttempts(list(dashboard && dashboard.attempts)));
  if (byId("learning-refresh")) byId("learning-refresh").addEventListener("click", refresh);

  document.getElementById("learning-reflection-submit").addEventListener("click", async function (event) {
    if (!selectedAttempt) return;
    const modalNotice = document.getElementById("learning-attempt-notice");
    const reflection = document.getElementById("learning-reflection").value.trim();
    const stopProgress = beginAssessmentProgress(
      event.currentTarget,
      modalNotice,
    );
    try {
      const response = await learning.json("POST", `/learning/attempts/${encodeURIComponent(selectedAttempt.id)}`, { reflection, submit: true }, {timeoutMs: 240000, retries: 0});
      if (!response.success) throw new Error(learning.errorMessage(response, "无法提交复盘内容。"));
      renderAttempt(response.attempt);
      learning.showNotice(modalNotice, "复盘已保存，新的评估修订已生成。", "success");
      await refresh();
    } catch (error) {
      learning.showNotice(modalNotice, error.message, "danger");
    } finally {
      stopProgress();
    }
  });

  document.getElementById("learning-appeal-submit").addEventListener("click", async function () {
    if (!selectedAttempt || !selectedAttempt.assessment) return;
    const modalNotice = document.getElementById("learning-attempt-notice");
    const reason = document.getElementById("learning-appeal-reason").value.trim();
    try {
      const response = await learning.json("POST", `/learning/assessments/${encodeURIComponent(selectedAttempt.assessment.id)}/appeals`, { reason });
      if (!response.success) throw new Error(learning.errorMessage(response, "无法提交复核申请。"));
      document.getElementById("learning-appeal-reason").value = "";
      learning.showNotice(modalNotice, "复核申请已提交给课程教师。", "success");
    } catch (error) {
      learning.showNotice(modalNotice, error.message, "danger");
    }
  });

  refresh();
});

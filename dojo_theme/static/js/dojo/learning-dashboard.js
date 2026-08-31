document.addEventListener("DOMContentLoaded", function () {
  const root = document.getElementById("learning-dashboard");
  if (!root) return;

  const learning = window.DojoLearning;
  const dojoId = root.dataset.dojoId;
  const notice = document.getElementById("learning-dashboard-notice");
  let dashboard = null;
  let selectedAttempt = null;

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
    const container = document.getElementById("learning-recommendations");
    container.innerHTML = items.map(item => learning.itemCard({
      href: item.workspaceUrl,
      title: item.challengeName,
      lines: [`推荐 #${item.rank}`, `${categoryLabel(item.category)} · 难度 ${item.difficulty}/5`, item.reason],
    })).join("");
    document.getElementById("learning-recommendations-empty").hidden = items.length !== 0;
  }

  function renderSkills(skills) {
    document.getElementById("learning-skills-list").innerHTML = skills.map(skill => {
      const masteryState = skill.masteryState || {};
      const unknown = masteryState.state === "UNKNOWN" || !Number(skill.evidenceCount);
      const mastery = unknown ? null : Math.max(0, Math.min(100, Number(masteryState.value ?? skill.mastery) || 0));
      return `
        <div class="col-md-6 mb-4">
          <div class="card h-100 ${unknown ? "is-unknown" : ""}"><div class="card-body">
            <div class="d-flex justify-content-between"><h3>${learning.escapeHtml(skill.label)}</h3><b>${unknown ? "尚无足够证据" : `${learning.escapeHtml(mastery)}%`}</b></div>
            <p>${unknown ? "完成一次相关实践后更新能力判断。" : `${learning.escapeHtml(masteryState.label || "能力正在发展")} · ${learning.escapeHtml(skill.evidenceCount)} 条评估证据`}</p>
            ${unknown ? "" : `<div class="progress w-100" aria-label="${learning.escapeHtml(skill.label)}掌握度"><div class="progress-bar" role="progressbar" style="width:${mastery}%" aria-valuenow="${mastery}" aria-valuemin="0" aria-valuemax="100"></div></div>`}
          </div></div>
        </div>`;
    }).join("");
  }

  function renderAttempts(attempts) {
    document.getElementById("learning-attempt-list").innerHTML = attempts.map(attempt => `
      <tr>
        <td><button type="button" class="btn btn-link p-0 learning-attempt-open" data-attempt-id="${learning.escapeHtml(attempt.id)}">${learning.escapeHtml(attempt.challengeName)}</button></td>
        <td>${learning.escapeHtml(attempt.moduleName)}</td>
        <td>${learning.escapeHtml(attempt.epoch)}</td>
        <td>${learning.escapeHtml(attemptStatusLabel(attempt.activityState))}</td>
        <td>${attempt.assessmentState === "READY" && attempt.assessment ? `${learning.escapeHtml(attempt.assessment.totalScore)} / 100` : `<span class="learning-assessment-state is-${learning.escapeHtml(String(attempt.assessmentState || "pending").toLowerCase())}">${learning.escapeHtml(assessmentStatusLabel(attempt.assessmentState))}</span>`}</td>
        <td>${learning.escapeHtml(learning.formatDate(attempt.started))}</td>
      </tr>`).join("");
    document.getElementById("learning-attempts-empty").hidden = attempts.length !== 0;
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
        ? `等待评分 · 已提交于 ${learning.formatDate(attempt.submitted)}`
        : "本次学习尚未形成评分；完成并提交后再查看结果。";
      return;
    }
    empty.hidden = true;
    container.hidden = false;
    document.getElementById("learning-assessment-score").textContent = `${assessment.totalScore} / 100`;
    document.getElementById("learning-assessment-feedback-summary").textContent = `客观结果 ${assessment.objectiveScore}/60 · 过程表现 ${assessment.processScore}/40`;
    document.getElementById("learning-assessment-feedback").textContent = assessment.feedback || "";
    const objective = (assessment.criteria || []).find(criterion => criterion.id === "objective-success") || {};
    const grader = (objective.evidence || {}).grader || {};
    document.getElementById("learning-assessment-agent").innerHTML = grader.provider ? `
      <span class="badge badge-${grader.provider === "MODEL" ? "success" : "secondary"}">${grader.provider === "MODEL" ? "AI 辅助评估" : "规则评估"}</span>
      ${grader.liveContext ? '<span><i class="fas fa-server"></i> 已复核实时实验结果</span>' : ""}` : "";
    document.getElementById("learning-assessment-criteria").innerHTML = (assessment.criteria || []).map(criterion => {
      const percent = criterion.maxScore ? Math.round(criterion.score / criterion.maxScore * 100) : 0;
      const evidence = criterion.evidence || {};
      const citationCount = (evidence.evidenceSequences || []).length
        + (evidence.containerEvidence || []).length;
      return `
        <div class="mb-3">
          <div class="d-flex justify-content-between"><span>${learning.escapeHtml(criterion.title)}</span><span>${learning.escapeHtml(criterion.score)} / ${learning.escapeHtml(criterion.maxScore)}</span></div>
          <div class="progress"><div class="progress-bar" role="progressbar" style="width:${percent}%"></div></div>
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
      <tr><td>${index + 1}</td><td>${learning.escapeHtml(evidenceTypeLabel(event.type))}</td><td>${Number(event.trustLevel) >= 3 ? "可核验记录" : "学习者记录"}</td><td>${learning.escapeHtml(learning.formatDate(event.occurred))}</td></tr>`).join("");
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
    try {
      const [dashboardResponse, catalogResponse] = await Promise.all([
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/dashboard`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/catalog`),
      ]);
      if (!dashboardResponse.success) throw new Error(learning.errorMessage(dashboardResponse, "无法加载课程学习分析。"));
      dashboard = dashboardResponse;
      const progress = dashboard.progress || {};
      const skills = dashboard.skills || [];
      const attempts = dashboard.attempts || [];
      const observedSkills = skills.filter(item => item.masteryState && item.masteryState.state !== "UNKNOWN" && Number(item.evidenceCount));
      const latestRated = attempts.find(item => item.assessmentState === "READY" && item.assessment);
      const pendingAssessment = attempts.find(item => item.assessmentState === "PENDING");
      const latestEvidence = attempts.find(item => item.evidenceState && item.evidenceState !== "NONE");
      document.getElementById("learning-progress-percent").textContent = progress.percent == null ? "阅读课程" : `${progress.percent}%`;
      document.getElementById("learning-progress-value").textContent = progress.label || (progress.total ? `已完成 ${progress.completed} / ${progress.total} 项必修内容` : "本章节以阅读学习为主");
      document.getElementById("learning-mastery-summary").textContent = observedSkills.length ? `${observedSkills.length} 项已有证据` : "尚无足够证据";
      document.getElementById("learning-mastery-detail").textContent = observedSkills.length ? "打开能力掌握查看证据支持的判断" : "完成一次相关实践后更新";
      document.getElementById("learning-assessment-summary").textContent = latestRated ? `${latestRated.assessment.totalScore} / 100` : pendingAssessment ? "等待评分" : "尚无评分";
      document.getElementById("learning-assessment-detail").textContent = latestRated ? `最近一次：${latestRated.challengeName}` : pendingAssessment ? `已提交于 ${learning.formatDate(pendingAssessment.submitted)}` : "提交一次实践后显示结果";
      document.getElementById("learning-evidence-summary").textContent = latestEvidence ? evidenceStatusLabel(latestEvidence.evidenceState) : "暂无过程证据";
      document.getElementById("learning-evidence-detail").textContent = latestEvidence ? `${latestEvidence.evidenceCount || 0} 条记录 · 不代表能力掌握` : "启动实验后开始记录";
      renderRecommendations(dashboard.recommendations || []);
      renderSkills(skills);
      renderAttempts(attempts);
      renderCatalog(catalogResponse.items || []);
      learning.showNotice(notice, "");
    } catch (error) {
      learning.showNotice(notice, error.message || "无法加载课程学习分析。", "danger");
    }
  }

  document.getElementById("learning-attempt-list").addEventListener("click", function (event) {
    const button = event.target.closest(".learning-attempt-open");
    if (button) openAttempt(button.dataset.attemptId);
  });

  document.getElementById("learning-reflection-submit").addEventListener("click", async function (event) {
    if (!selectedAttempt) return;
    const modalNotice = document.getElementById("learning-attempt-notice");
    const reflection = document.getElementById("learning-reflection").value.trim();
    const stopProgress = beginAssessmentProgress(
      event.currentTarget,
      modalNotice,
    );
    try {
      const response = await learning.json("POST", `/learning/attempts/${encodeURIComponent(selectedAttempt.id)}`, { reflection, submit: true });
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

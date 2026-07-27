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
    return ({ACTIVE: "进行中", STOPPED: "已停止", COMPLETED: "已完成", FAILED: "失败"})[value] || value || "未知";
  }

  function evidenceTypeLabel(value) {
    return ({
      "lab.started": "题目已启动",
      "lab.stopped": "题目已停止",
      "lab.reset.requested": "已请求重置题目",
      "terminal.command.completed": "终端命令已完成",
      "tutor.chat.assistant": "Tutor 已回复",
      "assessment.created": "评估已生成",
    })[value] || value || "证据事件";
  }

  function beginAssessmentProgress(button, noticeElement) {
    button.disabled = true;
    learning.showNotice(
      noticeElement,
      "DeepSeek V4 Pro 正在比对私有解法、实时容器和可信学习证据。",
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
      const mastery = Math.max(0, Math.min(100, Number(skill.mastery) || 0));
      return `
        <div class="col-md-6 mb-4">
          <div class="card h-100"><div class="card-body">
            <div class="d-flex justify-content-between"><h3>${learning.escapeHtml(skill.label)}</h3><b>${learning.escapeHtml(skill.mastery)}</b></div>
            <p>${learning.escapeHtml(skill.evidenceCount)} 条评估样本 &middot; 置信度 ${Math.round((Number(skill.confidence) || 0) * 100)}%</p>
            <div class="progress w-100"><div class="progress-bar" role="progressbar" style="width:${mastery}%" aria-valuenow="${mastery}" aria-valuemin="0" aria-valuemax="100"></div></div>
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
        <td>${learning.escapeHtml(attemptStatusLabel(attempt.status))}</td>
        <td>${learning.escapeHtml(attempt.totalScore)} / 100</td>
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

  function renderAssessment(assessment) {
    const empty = document.getElementById("learning-assessment-empty");
    const container = document.getElementById("learning-assessment");
    if (!assessment) {
      empty.hidden = false;
      container.hidden = true;
      return;
    }
    empty.hidden = true;
    container.hidden = false;
    document.getElementById("learning-assessment-score").textContent = `${assessment.totalScore} / 100`;
    document.getElementById("learning-assessment-summary").textContent = `结果 ${assessment.objectiveScore}/60 · 过程 ${assessment.processScore}/40 · 修订 ${assessment.revision}`;
    document.getElementById("learning-assessment-feedback").textContent = assessment.feedback || "";
    const objective = (assessment.criteria || []).find(criterion => criterion.id === "objective-success") || {};
    const grader = (objective.evidence || {}).grader || {};
    document.getElementById("learning-assessment-agent").innerHTML = grader.provider ? `
      <span class="badge badge-${grader.provider === "MODEL" ? "success" : "secondary"}">${learning.escapeHtml(grader.provider)}</span>
      <span>${learning.escapeHtml(grader.model || "确定性兜底规则")}</span>
      ${grader.liveContext ? '<span><i class="fas fa-server"></i> 已复核实时容器</span>' : ""}
      ${grader.solutionProvider ? `<span><i class="fas fa-route"></i> 参考：${learning.escapeHtml(grader.solutionProvider)}</span>` : ""}` : "";
    document.getElementById("learning-assessment-criteria").innerHTML = (assessment.criteria || []).map(criterion => {
      const percent = criterion.maxScore ? Math.round(criterion.score / criterion.maxScore * 100) : 0;
      const evidence = criterion.evidence || {};
      const citations = [
        ...(evidence.evidenceSequences || []).map(sequence => `证据事件 #${sequence}`),
        ...(evidence.containerEvidence || []),
      ];
      return `
        <div class="mb-3">
          <div class="d-flex justify-content-between"><span>${learning.escapeHtml(criterion.title)}</span><span>${learning.escapeHtml(criterion.score)} / ${learning.escapeHtml(criterion.maxScore)}</span></div>
          <div class="progress"><div class="progress-bar" role="progressbar" style="width:${percent}%"></div></div>
          ${evidence.rationale ? `<small class="d-block mt-1">${learning.escapeHtml(evidence.rationale)}</small>` : ""}
          ${citations.length ? `<small class="d-block text-muted">证据：${citations.map(learning.escapeHtml).join(" · ")}</small>` : ""}
        </div>`;
    }).join("");
  }

  function renderAttempt(attempt) {
    selectedAttempt = attempt;
    document.getElementById("learning-attempt-title").textContent = attempt.challengeName;
    document.getElementById("learning-attempt-meta").textContent = `${attempt.moduleName} · 第 ${attempt.epoch} 次会话 · ${attempt.id}`;
    document.getElementById("learning-reflection").value = attempt.reflection || "";
    const chain = attempt.evidenceChain || {};
    document.getElementById("learning-evidence-chain").textContent = `${chain.valid ? "证据链已验证" : "证据链需要复核"} · ${chain.events || 0} 个事件`;
    document.getElementById("learning-evidence-list").innerHTML = (attempt.evidence || []).map(event => `
      <tr><td>#${learning.escapeHtml(event.sequence)}</td><td>${learning.escapeHtml(evidenceTypeLabel(event.type))}</td><td>S${learning.escapeHtml(event.trustLevel)}</td><td>${learning.escapeHtml(learning.formatDate(event.occurred))}</td></tr>`).join("");
    renderAssessment(attempt.assessment);
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
      document.getElementById("learning-progress-value").textContent = `${progress.completed || 0} / ${progress.total || 0}`;
      document.getElementById("learning-progress-percent").textContent = `${progress.percent || 0}%`;
      renderRecommendations(dashboard.recommendations || []);
      renderSkills(dashboard.skills || []);
      renderAttempts(dashboard.attempts || []);
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

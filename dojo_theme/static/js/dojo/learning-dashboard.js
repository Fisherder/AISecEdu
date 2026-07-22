document.addEventListener("DOMContentLoaded", function () {
  const root = document.getElementById("learning-dashboard");
  if (!root) return;

  const learning = window.DojoLearning;
  const dojoId = root.dataset.dojoId;
  const notice = document.getElementById("learning-dashboard-notice");
  let dashboard = null;
  let selectedAttempt = null;

  function renderRecommendations(items) {
    const container = document.getElementById("learning-recommendations");
    container.innerHTML = items.map(item => learning.itemCard({
      href: item.workspaceUrl,
      title: item.challengeName,
      lines: [`#${item.rank}`, `${item.category} · Difficulty ${item.difficulty}/5`, item.reason],
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
            <p>${learning.escapeHtml(skill.evidenceCount)} assessment samples &middot; confidence ${Math.round((Number(skill.confidence) || 0) * 100)}%</p>
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
        <td>${learning.escapeHtml(attempt.status)}</td>
        <td>${learning.escapeHtml(attempt.totalScore)} / 100</td>
        <td>${learning.escapeHtml(learning.formatDate(attempt.started))}</td>
      </tr>`).join("");
    document.getElementById("learning-attempts-empty").hidden = attempts.length !== 0;
  }

  function renderCatalog(items) {
    document.getElementById("learning-catalog-list").innerHTML = items.map(item => learning.itemCard({
      href: `/${encodeURIComponent(dojoId)}/${encodeURIComponent(item.moduleId)}/${encodeURIComponent(item.id)}`,
      title: item.name,
      lines: [`${item.category} · Difficulty ${item.difficulty}/5`, item.required ? "Required" : "Optional", (item.tags || []).join(", ")],
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
    document.getElementById("learning-assessment-summary").textContent = `Result ${assessment.objectiveScore}/60 · Process ${assessment.processScore}/40 · Revision ${assessment.revision}`;
    document.getElementById("learning-assessment-feedback").textContent = assessment.feedback || "";
    document.getElementById("learning-assessment-criteria").innerHTML = (assessment.criteria || []).map(criterion => {
      const percent = criterion.maxScore ? Math.round(criterion.score / criterion.maxScore * 100) : 0;
      return `
        <div class="mb-3">
          <div class="d-flex justify-content-between"><span>${learning.escapeHtml(criterion.title)}</span><span>${learning.escapeHtml(criterion.score)} / ${learning.escapeHtml(criterion.maxScore)}</span></div>
          <div class="progress"><div class="progress-bar" role="progressbar" style="width:${percent}%"></div></div>
        </div>`;
    }).join("");
  }

  function renderAttempt(attempt) {
    selectedAttempt = attempt;
    document.getElementById("learning-attempt-title").textContent = attempt.challengeName;
    document.getElementById("learning-attempt-meta").textContent = `${attempt.moduleName} · Session ${attempt.epoch} · ${attempt.id}`;
    document.getElementById("learning-reflection").value = attempt.reflection || "";
    const chain = attempt.evidenceChain || {};
    document.getElementById("learning-evidence-chain").textContent = `${chain.valid ? "Evidence chain verified" : "Evidence chain requires review"} · ${chain.events || 0} events`;
    document.getElementById("learning-evidence-list").innerHTML = (attempt.evidence || []).map(event => `
      <tr><td>#${learning.escapeHtml(event.sequence)}</td><td>${learning.escapeHtml(event.type)}</td><td>S${learning.escapeHtml(event.trustLevel)}</td><td>${learning.escapeHtml(learning.formatDate(event.occurred))}</td></tr>`).join("");
    renderAssessment(attempt.assessment);
    document.getElementById("learning-appeal-reason").value = "";
  }

  async function openAttempt(attemptId) {
    try {
      const response = await learning.request(`/learning/attempts/${encodeURIComponent(attemptId)}`);
      if (!response.success) throw new Error(learning.errorMessage(response, "Attempt could not be loaded."));
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
      if (!dashboardResponse.success) throw new Error(learning.errorMessage(dashboardResponse, "Course analysis could not be loaded."));
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
      learning.showNotice(notice, error.message || "Course analysis could not be loaded.", "danger");
    }
  }

  document.getElementById("learning-attempt-list").addEventListener("click", function (event) {
    const button = event.target.closest(".learning-attempt-open");
    if (button) openAttempt(button.dataset.attemptId);
  });

  document.getElementById("learning-reflection-submit").addEventListener("click", async function () {
    if (!selectedAttempt) return;
    const modalNotice = document.getElementById("learning-attempt-notice");
    const reflection = document.getElementById("learning-reflection").value.trim();
    try {
      const response = await learning.json("POST", `/learning/attempts/${encodeURIComponent(selectedAttempt.id)}`, { reflection, submit: true });
      if (!response.success) throw new Error(learning.errorMessage(response, "Reflection could not be submitted."));
      renderAttempt(response.attempt);
      learning.showNotice(modalNotice, "Reflection saved and a new assessment revision was generated.", "success");
      await refresh();
    } catch (error) {
      learning.showNotice(modalNotice, error.message, "danger");
    }
  });

  document.getElementById("learning-appeal-submit").addEventListener("click", async function () {
    if (!selectedAttempt || !selectedAttempt.assessment) return;
    const modalNotice = document.getElementById("learning-attempt-notice");
    const reason = document.getElementById("learning-appeal-reason").value.trim();
    try {
      const response = await learning.json("POST", `/learning/assessments/${encodeURIComponent(selectedAttempt.assessment.id)}/appeals`, { reason });
      if (!response.success) throw new Error(learning.errorMessage(response, "Appeal could not be submitted."));
      document.getElementById("learning-appeal-reason").value = "";
      learning.showNotice(modalNotice, "The appeal was submitted to the course teacher.", "success");
    } catch (error) {
      learning.showNotice(modalNotice, error.message, "danger");
    }
  });

  refresh();
});

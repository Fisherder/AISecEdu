document.addEventListener("DOMContentLoaded", function () {
  const root = document.getElementById("learning-studio");
  if (!root) return;

  const learning = window.DojoLearning;
  const dojoId = root.dataset.dojoId;
  const notice = document.getElementById("learning-studio-notice");
  let drafts = [];
  let selected = null;
  let busy = false;

  function strategyLabel(value) {
    return ({L1: "Reuse", L2: "Adapt", L3: "Create New"})[value] || value || "Draft";
  }

  function setBusy(value) {
    busy = value;
    ["studio-create", "studio-validate", "studio-publish", "studio-revise", "studio-import-submit"].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.disabled = value;
    });
  }

  function renderSummary(summary) {
    ["participants", "attempts", "averageScore", "drafts", "openAppeals"].forEach(key => {
      document.getElementById(`studio-stat-${key}`).textContent = summary[key] || 0;
    });
  }

  function renderDrafts(items) {
    document.getElementById("studio-draft-list").innerHTML = items.map(draft => {
      const name = draft.spec && draft.spec.name ? draft.spec.name : draft.brief;
      const blocked = draft.validation && draft.validation.summary ? draft.validation.summary.blocked : "Not validated";
      return `
        <li class="card card-small studio-draft-select" data-draft-id="${learning.escapeHtml(draft.id)}" role="button" tabindex="0">
          <div class="card-body">
            <h4 class="card-title">${learning.escapeHtml(name)}</h4>
            <p class="card-text">${learning.escapeHtml(strategyLabel(draft.level))} · ${learning.escapeHtml(draft.status)}<br>${learning.escapeHtml(draft.moduleId)} · Revision ${learning.escapeHtml(draft.revision)}<br>${learning.escapeHtml(blocked)} blocking checks</p>
          </div>
        </li>`;
    }).join("");
  }

  function renderCatalog(items) {
    document.getElementById("studio-catalog-list").innerHTML = items.map(item => learning.itemCard({
      href: `/${encodeURIComponent(dojoId)}/${encodeURIComponent(item.moduleId)}/${encodeURIComponent(item.id)}`,
      title: item.name,
      lines: [`${item.category} · Difficulty ${item.difficulty}/5`, `Version ${item.version}`, item.packageDigest || "Native AISecEdu publication"],
    })).join("");
  }

  function renderStudents(students) {
    document.getElementById("studio-student-list").innerHTML = students.map(student => `
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex justify-content-between"><h3>${learning.escapeHtml(student.name)}</h3><span>#${learning.escapeHtml(student.id)}</span></div>
        <p>${learning.escapeHtml(student.attempts)} attempts · ${learning.escapeHtml((student.progress || {}).percent || 0)}% course progress</p>
        <div class="row">${(student.skills || []).map(skill => {
          const mastery = Math.max(0, Math.min(100, Number(skill.mastery) || 0));
          return `<div class="col-md-4 mb-3"><div class="d-flex justify-content-between"><small>${learning.escapeHtml(skill.label)}</small><small>${mastery}</small></div><div class="progress"><div class="progress-bar" style="width:${mastery}%"></div></div></div>`;
        }).join("")}</div>
      </div></div>`).join("");
    document.getElementById("studio-students-empty").hidden = students.length !== 0;
  }

  function renderAppeals(items) {
    document.getElementById("studio-appeal-list").innerHTML = items.map(appeal => `
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex justify-content-between"><h3>${learning.escapeHtml(appeal.username)}</h3><span class="badge badge-${appeal.status === "OPEN" ? "warning" : "secondary"}">${learning.escapeHtml(appeal.status)}</span></div>
        <p>${learning.escapeHtml(appeal.attemptId)} · ${learning.escapeHtml(learning.formatDate(appeal.created))}</p>
        <p>${learning.escapeHtml(appeal.reason)}</p>
        ${appeal.status === "OPEN" ? `
          <textarea class="form-control studio-appeal-resolution" data-appeal-id="${learning.escapeHtml(appeal.id)}" rows="4" placeholder="Explain the evidence review and assessment decision."></textarea>
          <button class="btn btn-primary btn-sm mt-3 studio-appeal-action" data-appeal-id="${learning.escapeHtml(appeal.id)}" data-status="RESOLVED">Approve and Reassess</button>
          <button class="btn btn-outline-secondary btn-sm mt-3 studio-appeal-action" data-appeal-id="${learning.escapeHtml(appeal.id)}" data-status="REJECTED">Reject</button>` : `<p>${learning.escapeHtml(appeal.resolution || "No resolution note")}</p>`}
      </div></div>`).join("");
    document.getElementById("studio-appeals-empty").hidden = items.length !== 0;
  }

  function renderWorkbench() {
    const empty = document.getElementById("studio-workbench-empty");
    const workbench = document.getElementById("studio-workbench");
    if (!selected) {
      empty.hidden = false;
      workbench.hidden = true;
      return;
    }
    empty.hidden = true;
    workbench.hidden = false;
    const spec = selected.spec || {};
    const validation = selected.validation || {};
    document.getElementById("studio-draft-name").textContent = spec.name || selected.brief;
    document.getElementById("studio-draft-meta").textContent = `${strategyLabel(selected.level)} · ${spec.mode || "draft"} · ${selected.moduleId} · Revision ${selected.revision}`;
    document.getElementById("studio-draft-status").textContent = selected.status;
    document.getElementById("studio-draft-description").textContent = spec.description || "";
    document.getElementById("studio-draft-candidates").innerHTML = (selected.candidates || []).slice(0, 3).map(candidate => `
      <div class="d-flex justify-content-between border rounded p-2 mb-2"><span>${learning.escapeHtml(candidate.name)}</span><span>Match ${learning.escapeHtml(candidate.score)}</span></div>`).join("") || "<p>No source exercise is required for this draft.</p>";
    const summary = validation.summary;
    document.getElementById("studio-validation-summary").textContent = summary ? `${summary.passed} passed · ${summary.warnings} warnings · ${summary.blocked} blocked` : "Not validated";
    document.getElementById("studio-validation-checks").innerHTML = validation.checks ? `
      <table class="table table-sm table-striped"><tbody>${validation.checks.map(check => `<tr><td>${learning.escapeHtml(check.stage)}</td><td>${learning.escapeHtml(check.message)}</td><td>${learning.escapeHtml(check.status)}</td></tr>`).join("")}</tbody></table>` : "";
    document.getElementById("studio-publish").disabled = busy || validation.status !== "PASS" || selected.status === "PUBLISHED";
    document.getElementById("studio-validate").disabled = busy || selected.status === "PUBLISHED";
    document.getElementById("studio-revise").disabled = busy || selected.status === "PUBLISHED";
  }

  function selectDraft(id) {
    selected = drafts.find(draft => draft.id === id) || selected;
    renderWorkbench();
    $("#learning-studio-tabs a[href='#studio-author']").tab("show");
  }

  async function refresh() {
    const selectedId = selected && selected.id;
    try {
      const [authoring, catalog, analytics, appeals] = await Promise.all([
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/authoring`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/catalog`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/analytics`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/appeals`),
      ]);
      if (!authoring.success) throw new Error(learning.errorMessage(authoring, "Teacher data could not be loaded."));
      drafts = authoring.drafts || [];
      if (selectedId) selected = drafts.find(draft => draft.id === selectedId) || selected;
      renderSummary(analytics.summary || {});
      renderDrafts(drafts);
      renderCatalog(catalog.items || []);
      renderStudents(analytics.students || []);
      renderAppeals(appeals.appeals || []);
      renderWorkbench();
      learning.showNotice(notice, "");
    } catch (error) {
      learning.showNotice(notice, error.message || "Teacher data could not be loaded.", "danger");
    }
  }

  async function run(operation, successMessage) {
    if (busy) return null;
    setBusy(true);
    learning.showNotice(notice, "");
    try {
      const response = await operation();
      if (!response.success) throw new Error(learning.errorMessage(response, "Operation failed."));
      if (response.draft) selected = response.draft;
      learning.showNotice(notice, successMessage, "success");
      await refresh();
      return response;
    } catch (error) {
      learning.showNotice(notice, error.message || "Operation failed.", "danger");
      return null;
    } finally {
      setBusy(false);
      renderWorkbench();
    }
  }

  document.getElementById("studio-draft-list").addEventListener("click", event => {
    const card = event.target.closest(".studio-draft-select");
    if (card) selectDraft(card.dataset.draftId);
  });

  document.getElementById("studio-draft-list").addEventListener("keydown", event => {
    const card = event.target.closest(".studio-draft-select");
    if (card && (event.key === "Enter" || event.key === " ")) selectDraft(card.dataset.draftId);
  });

  document.getElementById("studio-create").addEventListener("click", function () {
    const brief = document.getElementById("studio-brief").value.trim();
    if (brief.length < 12) {
      learning.showNotice(notice, "Exercise requirements must contain at least 12 characters.", "warning");
      return;
    }
    run(() => learning.json("POST", `/learning/dojos/${encodeURIComponent(dojoId)}/authoring`, {
      moduleId: document.getElementById("studio-module").value,
      brief,
      level: document.getElementById("studio-level").value,
      constraints: {
        category: document.getElementById("studio-category").value,
        difficulty: Number(document.getElementById("studio-difficulty").value),
      },
    }), "The exercise draft was generated.");
  });

  document.getElementById("studio-validate").addEventListener("click", async function () {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const response = await learning.json("POST", `/learning/drafts/${encodeURIComponent(selected.id)}/validate`, {});
      if (response.validation) selected = { ...selected, validation: response.validation, status: response.validation.status === "PASS" ? "VALIDATED" : "DRAFT" };
      learning.showNotice(notice, response.validation && response.validation.status === "PASS" ? "Publication gate passed." : "Publication gate found warnings or blocking checks.", response.validation && response.validation.status === "PASS" ? "success" : "warning");
      await refresh();
    } catch (error) {
      learning.showNotice(notice, error.message, "danger");
    } finally {
      setBusy(false);
      renderWorkbench();
    }
  });

  document.getElementById("studio-publish").addEventListener("click", function () {
    if (!selected) return;
    run(() => learning.json("POST", `/learning/drafts/${encodeURIComponent(selected.id)}/publish`, {}), "The exercise was published to the course.");
  });

  document.getElementById("studio-revise").addEventListener("click", function () {
    if (!selected) return;
    const message = document.getElementById("studio-revision").value.trim();
    if (!message) return;
    run(() => learning.json("POST", `/learning/drafts/${encodeURIComponent(selected.id)}`, { message }), "The draft was revised.").then(response => {
      if (response) document.getElementById("studio-revision").value = "";
    });
  });

  document.getElementById("studio-import-submit").addEventListener("click", function () {
    let challengePackage;
    try {
      challengePackage = JSON.parse(document.getElementById("studio-package").value);
    } catch (error) {
      learning.showNotice(notice, "The exercise package must be valid JSON.", "danger");
      return;
    }
    run(() => learning.json("POST", `/learning/dojos/${encodeURIComponent(dojoId)}/imports`, {
      moduleId: document.getElementById("studio-import-module").value,
      package: challengePackage,
    }), "The external package was converted into a validated draft.");
  });

  document.getElementById("studio-appeal-list").addEventListener("click", function (event) {
    const button = event.target.closest(".studio-appeal-action");
    if (!button) return;
    const appealId = button.dataset.appealId;
    const textarea = document.querySelector(`.studio-appeal-resolution[data-appeal-id="${CSS.escape(appealId)}"]`);
    run(() => learning.json("PATCH", `/learning/appeals/${encodeURIComponent(appealId)}`, {
      status: button.dataset.status,
      resolution: textarea ? textarea.value.trim() : "",
      reassess: true,
    }), "The appeal decision was recorded.");
  });

  const params = new URLSearchParams(window.location.search);
  const requestedUnit = params.get("module");
  if (requestedUnit) {
    ["studio-module", "studio-import-module"].forEach(id => {
      const select = document.getElementById(id);
      if (select && Array.from(select.options).some(option => option.value === requestedUnit)) {
        select.value = requestedUnit;
      }
    });
  }
  if (params.get("author") === "1") {
    $("#learning-studio-tabs a[href='#studio-author']").tab("show");
    setTimeout(() => document.getElementById("studio-brief")?.focus(), 0);
  }

  refresh();
});

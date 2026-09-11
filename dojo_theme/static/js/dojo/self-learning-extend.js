(function () {
  "use strict";

  const api = window.DojoLearning;
  const root = document.getElementById("self-learning-extend");
  if (!root || !api) return;

  const queryWorkspace = new URLSearchParams(window.location.search).get("workspace");
  const state = {workspaces: []};
  const notice = document.getElementById("self-learning-notice");
  const hub = document.getElementById("self-learning-hub");
  const stage = document.getElementById("self-learning-stage");
  const frame = document.getElementById("self-learning-frame");
  const workspaceList = document.getElementById("self-learning-workspace-list");
  const workspaceEmpty = document.getElementById("self-learning-workspace-empty");
  const search = document.getElementById("self-learning-search");
  const typeFilter = document.getElementById("self-learning-type");
  const visibilityFilter = document.getElementById("self-learning-visibility");
  const count = document.getElementById("self-learning-count");

  function unwrap(payload) {
    if (!payload || payload.success !== true) throw new Error(api.errorMessage(payload, "请求失败。"));
    return payload.data || payload;
  }

  function escape(value) {
    return api.escapeHtml(value);
  }

  function showError(error) {
    api.showNotice(notice, error instanceof Error ? error.message : String(error), "danger");
  }

  function modeMeta(mode) {
    return ({
      slides: ["个人课件", "fa-file-powerpoint"],
      quiz: ["练习与测验", "fa-list-check"],
      "attack-defense-scene": ["攻防演示", "fa-shield-alt"],
      simulation: ["交互演示", "fa-project-diagram"],
      debate: ["辩论练习", "fa-comments"],
      "learning-path": ["学习计划", "fa-route"],
    })[mode] || ["个人成果", "fa-cubes"];
  }

  function relativeTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "更新时间待同步";
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return "今天更新";
    if (days === 1) return "昨天更新";
    if (days < 30) return `${days} 天前更新`;
    return date.toLocaleDateString("zh-CN", {year: "numeric", month: "short", day: "numeric"});
  }

  async function launchWorkspace(workspace) {
    const launch = unwrap(await api.json("POST", "/teaching/runtime/launch", {
      role: "student",
      dojoId: workspace.dojoId,
      moduleIndex: workspace.moduleIndex,
      workspaceId: workspace.id,
      target: "/security-learn",
    }));
    hub.hidden = true;
    stage.hidden = false;
    frame.src = launch.launchUrl;
    const next = new URL(window.location.href);
    next.searchParams.set("workspace", workspace.id);
    history.replaceState(null, "", next);
  }

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const data = event.data || {};
    const artifactId = String(data.artifactId || "");
    if (data.type !== "aisecedu:open-personal-artifact" || !/^[A-Za-z0-9_-]+$/.test(artifactId)) return;
    window.location.assign(`/learning/artifacts/${encodeURIComponent(artifactId)}?returnTo=/learning/extend`);
  });

  function filteredRows() {
    const needle = search.value.trim().toLocaleLowerCase("zh-CN");
    return state.workspaces.filter(item => {
      const mode = item.state && item.state.artifactType || "learning-path";
      const text = `${item.title || ""} ${item.goal || ""} ${item.artifact && item.artifact.title || ""}`.toLocaleLowerCase("zh-CN");
      return (!needle || text.includes(needle))
        && (!typeFilter.value || mode === typeFilter.value)
        && (!visibilityFilter.value || item.visibility === visibilityFilter.value);
    });
  }

  function renderWorkspaces() {
    const rows = filteredRows();
    workspaceList.innerHTML = rows.map(item => {
      const mode = item.state && item.state.artifactType || "learning-path";
      const [label, icon] = modeMeta(mode);
      const artifact = item.artifact;
      const capabilities = artifact && artifact.capabilities || {};
      const reviewState = String(item.status || "").toUpperCase();
      const visibilityClass = reviewState === "SUBMITTED"
        ? "is-submitted"
        : reviewState === "APPROVED"
          ? "is-approved"
          : reviewState === "CHANGES_REQUESTED"
            ? "is-changes-requested"
            : "";
      const visibilityIcon = reviewState === "SUBMITTED"
        ? "fa-paper-plane"
        : reviewState === "APPROVED"
          ? "fa-check-circle"
          : reviewState === "CHANGES_REQUESTED"
            ? "fa-edit"
            : "fa-lock";
      const open = artifact
        ? `<a class="cs-btn cs-btn-primary" href="${escape(artifact.url)}">查看成果</a>`
        : `<button class="cs-btn cs-btn-primary" type="button" data-open-workspace="${escape(item.id)}">继续创作</button>`;
      return `<article class="sx-creation-card" data-workspace-id="${escape(item.id)}">
        <div class="sx-creation-head"><span><i class="fas ${icon}" aria-hidden="true"></i></span><div><small>${escape(label)}</small><h3>${escape(artifact && artifact.title || item.title || "未命名创作")}</h3></div><span class="sx-visibility ${visibilityClass}"><i class="fas ${visibilityIcon}" aria-hidden="true"></i>${escape(item.visibility)}</span></div>
        <p>${escape(item.goal || "继续完善这项个人学习成果。").slice(0, 220)}</p>
        <div class="sx-creation-meta"><span><i class="fas fa-code-branch" aria-hidden="true"></i>${Number(item.versionCount || 0) || 1} 个版本</span><span><i class="far fa-clock" aria-hidden="true"></i>${escape(relativeTime(item.updated))}</span></div>
        <div class="sx-creation-actions">${open}${artifact ? `<button class="cs-btn cs-btn-secondary" type="button" data-open-workspace="${escape(item.id)}">继续改进</button>` : ""}${artifact && capabilities.edit ? `<button class="sx-icon-action" type="button" data-rename-artifact="${escape(artifact.id)}" aria-label="重命名${escape(artifact.title || item.title)}"><i class="fas fa-pen" aria-hidden="true"></i></button><button class="sx-icon-action is-danger" type="button" data-delete-artifact="${escape(artifact.id)}" aria-label="删除${escape(artifact.title || item.title)}"><i class="fas fa-trash" aria-hidden="true"></i></button>` : ""}${artifact && capabilities.requestReview && item.visibility !== "已提交教师" ? `<button class="cs-btn cs-btn-secondary" type="button" data-review-artifact="${escape(artifact.id)}"><i class="fas fa-paper-plane" aria-hidden="true"></i>提交教师查看</button>` : ""}</div>
      </article>`;
    }).join("");
    workspaceEmpty.hidden = rows.length !== 0;
    count.textContent = `${rows.length} 项创作`;
  }

  async function renameArtifact(artifactId) {
    const workspace = state.workspaces.find(item => item.artifact && item.artifact.id === artifactId);
    if (!workspace || !window.AISecEduUI) return;
    const value = await window.AISecEduUI.prompt("设置一个便于在个人成果中查找的名称。", {
      title: "重命名创作",
      inputLabel: "成果名称",
      value: workspace.artifact.title || workspace.title,
      maxLength: 240,
      confirmLabel: "保存",
    });
    const title = String(value || "").trim();
    if (!title) return;
    unwrap(await api.json("PATCH", `/teaching/artifacts/${encodeURIComponent(artifactId)}`, {title}));
    workspace.artifact.title = title;
    renderWorkspaces();
    api.showNotice(notice, "名称已更新。", "success");
  }

  async function deleteArtifact(artifactId) {
    const workspace = state.workspaces.find(item => item.artifact && item.artifact.id === artifactId);
    if (!workspace || !window.AISecEduUI) return;
    const confirmed = await window.AISecEduUI.confirm(
      `删除“${workspace.artifact.title || workspace.title}”及其全部版本？删除后不会继续显示，且无法恢复。`,
      {title: "删除个人创作", confirmLabel: "确认删除", confirmStyle: "danger"},
    );
    if (!confirmed) return;
    unwrap(await api.json("DELETE", `/teaching/artifacts/${encodeURIComponent(artifactId)}`, {scope: "workspace"}));
    state.workspaces = state.workspaces.filter(item => item.id !== workspace.id);
    renderWorkspaces();
    api.showNotice(notice, "个人创作已删除。", "success");
  }

  async function requestReview(artifactId) {
    unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(artifactId)}/request-review`, {}));
    const workspace = state.workspaces.find(item => item.artifact && item.artifact.id === artifactId);
    if (workspace) workspace.visibility = "已提交教师";
    renderWorkspaces();
    api.showNotice(notice, "已提交教师查看；这不是发布，课程中不会自动出现。", "success");
  }

  [search, typeFilter, visibilityFilter].forEach(control => control.addEventListener("input", renderWorkspaces));
  workspaceList.addEventListener("click", event => {
    const open = event.target.closest("[data-open-workspace]");
    const rename = event.target.closest("[data-rename-artifact]");
    const remove = event.target.closest("[data-delete-artifact]");
    const review = event.target.closest("[data-review-artifact]");
    if (open) {
      const workspace = state.workspaces.find(item => item.id === open.dataset.openWorkspace);
      if (workspace) launchWorkspace(workspace).catch(showError);
    } else if (rename) renameArtifact(rename.dataset.renameArtifact).catch(showError);
    else if (remove) deleteArtifact(remove.dataset.deleteArtifact).catch(showError);
    else if (review) requestReview(review.dataset.reviewArtifact).catch(showError);
  });

  api.request("/teaching/self-learning/workspaces").then(payload => {
    state.workspaces = unwrap(payload).workspaces || [];
    renderWorkspaces();
    if (queryWorkspace) {
      const workspace = state.workspaces.find(item => item.id === queryWorkspace);
      if (!workspace) throw new Error("这项个人创作不存在或已不可用。你可以返回列表选择其他内容。");
      return launchWorkspace(workspace);
    }
    search.focus();
  }).catch(showError);
})();

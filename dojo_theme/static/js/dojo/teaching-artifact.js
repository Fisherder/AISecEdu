(function () {
  "use strict";
  const api = window.DojoLearning;
  const root = document.getElementById("teaching-artifact");
  if (!root || !api) return;
  const artifactId = root.dataset.artifactId;
  const viewerRole = root.dataset.viewerRole === "teacher" ? "teacher" : "student";
  const returnRole = root.dataset.returnRole === "teacher" ? "teacher" : root.dataset.returnRole === "personal" ? "personal" : "student";
  const isPersonal = root.dataset.personal === "true";
  const returnTo = root.dataset.returnTo || (returnRole === "teacher" ? "/teacher/courses" : isPersonal ? "/learning/extend" : "/student");
  const noticeChannel = document.getElementById("artifact-operation-status");
  const operationTitle = document.getElementById("artifact-operation-title");
  const operationDetail = document.getElementById("artifact-operation-detail");
  const iframe = document.getElementById("artifact-preview");
  const placeholder = document.getElementById("artifact-preview-placeholder");
  const previewRetry = document.getElementById("artifact-preview-retry");
  const previewPanel = document.getElementById("artifact-preview-panel");
  const previewStateLabel = document.getElementById("artifact-preview-state-label");
  const previewHint = document.getElementById("artifact-preview-hint");
  const previewActions = previewPanel.querySelector(".artifact-preview-actions");
  const textPreview = document.getElementById("artifact-text-preview");
  const inspector = document.getElementById("artifact-inspector");
  const inspectorToggle = document.getElementById("artifact-inspector-toggle");
  const inspectorClose = document.getElementById("artifact-inspector-close");
  const inspectorBackdrop = document.getElementById("artifact-inspector-backdrop");
  let artifact = null;
  let teacherArtifact = null;
  let activeJob = null;
  let previewRole = viewerRole;
  let timer = null;
  let previewTimer = null;
  let previewAttempt = 0;
  let previewSequence = 0;
  let previewAwaitingNavigation = false;
  let publishInFlight = false;

  function notify(message, kind, options) {
    if (window.AISecEduUI && typeof window.AISecEduUI.notify === "function") {
      return window.AISecEduUI.notify(message, kind || "info", options || {});
    }
    return api.showNotice(noticeChannel, message, kind || "info");
  }

  function setOperationStatus(kind, title, detail) {
    if (!noticeChannel) return;
    const resolvedKind = ["progress", "success", "warning", "danger"].includes(kind) ? kind : "progress";
    noticeChannel.hidden = false;
    noticeChannel.dataset.kind = resolvedKind;
    if (operationTitle) operationTitle.textContent = title || "正在处理";
    if (operationDetail) operationDetail.textContent = detail || "";
    const icon = noticeChannel.querySelector("i");
    if (icon) {
      icon.className = {
        progress: "fas fa-circle-notch fa-spin",
        success: "fas fa-check",
        warning: "fas fa-exclamation",
        danger: "fas fa-exclamation-triangle",
      }[resolvedKind];
    }
  }

  function clearOperationStatus(delay) {
    if (!noticeChannel) return;
    window.setTimeout(() => {
      if (!publishInFlight) noticeChannel.hidden = true;
    }, Number(delay || 0));
  }

  const artifactTypeLabels = {
    "lesson-plan": "教案",
    "slide-deck": "课件",
    "question-set": "CTF 实践题",
    assessment: "评测方案",
    simulation: "模拟实训",
    "attack-defense-scene": "实训演示",
  };
  const statusLabels = {
    DRAFT: "草稿",
    GENERATING: "生成中",
    READY: "可使用",
    READY_TO_PUBLISH: "可发布",
    VALIDATING: "检查中",
    AWAITING_APPROVAL: "发布中",
    PUBLISHED: "已发布",
    APPROVED: "已批准",
    REJECTED: "已驳回",
    FAILED: "未完成",
    VALIDATION_FAILED: "检查未通过",
    CANCELED: "已取消",
    ARCHIVED: "已归档",
    PERSONAL_DRAFT: "个人草稿",
    COURSE_CANDIDATE: "已提交教师审阅",
    SUBMITTED: "已提交教师审阅",
    APPROVED_PERSONAL: "审核已通过",
    CHANGES_REQUESTED: "需修改后再提交",
    GENERATED: "已生成",
    PASS: "通过",
    PASSED: "通过",
    PENDING: "待检查",
  };

  function statusLabel(value) {
    return statusLabels[String(value || "").toUpperCase()] || "处理中";
  }

  function artifactTypeLabel(value) {
    return artifactTypeLabels[String(value || "").toLowerCase()] || "教学内容";
  }

  function artifactCourseTab(value) {
    return ["simulation", "attack-defense-scene", "classroom-scenario"].includes(String(value || "").toLowerCase())
      ? "demos"
      : ["question-set", "assessment", "challenge", "quiz"].includes(String(value || "").toLowerCase())
        ? "questions"
        : "courseware";
  }

  function revisionInstruction(value) {
    const instruction = String(value || "").trim();
    if (!instruction || instruction === "从候选方案物化") return "初次生成";
    if (/^OpenMAIC materialization job\b/i.test(instruction)) return "生成可预览内容";
    return instruction
      .replace(/OpenMAIC/gi, "生成服务")
      .replace(/Dojo/gi, "课程")
      .replace(/Studio/gi, "内容管理");
  }

  function syncPreviewTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch (error) {
      console.warn("Unable to synchronize preview theme", error);
    }
  }

  syncPreviewTheme(document.documentElement.dataset.aiseceduTheme);
  window.addEventListener("aisecedu:themechange", event => {
    syncPreviewTheme(event.detail && event.detail.theme);
    if (!iframe.hidden && iframe.contentWindow) {
      try {
        previewSequence += 1;
        const sequence = previewSequence;
        previewAwaitingNavigation = true;
        setPreviewState("loading", "正在切换预览主题…");
        iframe.contentWindow.location.reload();
        waitForEmbeddedPreview(sequence, Date.now() + 20000);
      } catch (error) {
        console.warn("Unable to refresh preview theme", error);
      }
    }
  });

  function unwrap(payload) {
    if (!payload || payload.success !== true) throw new Error(api.errorMessage(payload, "请求失败"));
    return payload.data || {};
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setOperationStatus("danger", "操作未完成", message);
    notify(message, "danger");
    clearOperationStatus(6500);
  }

  function activateInspectorTab(name) {
    root.querySelectorAll("[data-artifact-tab]").forEach(button => {
      const selected = button.dataset.artifactTab === name;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll("[data-artifact-panel]").forEach(panel => {
      panel.hidden = panel.dataset.artifactPanel !== name;
    });
  }

  function setInspectorOpen(open, options) {
    if (!inspector || !inspectorToggle) return;
    root.dataset.inspectorOpen = open ? "true" : "false";
    inspector.setAttribute("aria-hidden", open ? "false" : "true");
    inspectorToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && options && options.tab) activateInspectorTab(options.tab);
    if (open && options && options.focus) {
      window.setTimeout(() => inspector.querySelector("[aria-selected='true']")?.focus(), 80);
    }
  }

  function setPreviewState(state, message) {
    const ready = state === "ready";
    const failed = state === "error";
    root.dataset.previewState = state;
    iframe.hidden = !ready;
    if (textPreview) textPreview.hidden = true;
    placeholder.hidden = ready;
    if (previewActions) previewActions.hidden = false;
    if (previewHint) previewHint.textContent = "方向键翻页 · O 查看全部页面 · F 全屏";
    placeholder.setAttribute("aria-busy", ready || failed ? "false" : "true");
    previewRetry.hidden = !failed;
    if (message) placeholder.querySelector("p").textContent = message;
    if (previewStateLabel) {
      previewStateLabel.textContent = ready
        ? "预览已就绪"
        : failed
          ? "预览加载失败"
          : "正在准备预览";
    }
    if (ready) window.clearTimeout(previewTimer);
  }

  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function stringValue(value) {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  }

  function makePreviewElement(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value) element.textContent = value;
    return element;
  }

  function renderLearningPathPreview() {
    const content = asRecord(artifact?.revision?.content);
    if (!textPreview || !Object.keys(content).length) {
      setPreviewState("error", "学习路径内容暂时无法读取。");
      return;
    }

    const outline = Array.isArray(content.outline) ? content.outline : [];
    const activities = Array.isArray(content.activities) ? content.activities : [];
    const objectives = Array.isArray(content.objectives) ? content.objectives : [];
    const assessment = asRecord(content.assessment);
    const criteria = Array.isArray(assessment.criteria) ? assessment.criteria : [];

    textPreview.replaceChildren();
    const heading = makePreviewElement("header", "artifact-text-preview-heading");
    heading.append(
      makePreviewElement("span", "teaching-eyebrow", "个人学习路径"),
      makePreviewElement("h2", "", artifact.title || "学习路径"),
      makePreviewElement("p", "", "按照步骤完成学习，并保留可核验的过程证据。"),
    );
    textPreview.append(heading);

    if (objectives.length) {
      const section = makePreviewElement("section", "artifact-path-section");
      section.append(makePreviewElement("h3", "", "学习目标"));
      const list = makePreviewElement("ul", "artifact-path-bullets");
      objectives.forEach(value => {
        const item = stringValue(value);
        if (item) list.append(makePreviewElement("li", "", item));
      });
      if (list.childElementCount) section.append(list);
      textPreview.append(section);
    }

    const steps = outline.length ? outline : activities;
    if (steps.length) {
      const section = makePreviewElement("section", "artifact-path-section");
      section.append(makePreviewElement("h3", "", "学习步骤"));
      const list = makePreviewElement("ol", "artifact-path-steps");
      steps.forEach((value, index) => {
        const step = asRecord(value);
        const item = makePreviewElement("li", "artifact-path-step");
        const order = Number(step.order);
        item.append(makePreviewElement("strong", "", `${Number.isFinite(order) && order > 0 ? order : index + 1}. ${stringValue(step.title) || `步骤 ${index + 1}`}`));
        const description = stringValue(step.description || step.instruction || step.learnerAction);
        if (description) item.append(makePreviewElement("p", "", description));
        const points = Array.isArray(step.keyPoints) ? step.keyPoints : [];
        if (points.length) {
          const pointList = makePreviewElement("ul", "artifact-path-bullets");
          points.forEach(point => {
            const text = stringValue(point);
            if (text) pointList.append(makePreviewElement("li", "", text));
          });
          if (pointList.childElementCount) item.append(pointList);
        }
        list.append(item);
      });
      section.append(list);
      textPreview.append(section);
    }

    if (criteria.length) {
      const section = makePreviewElement("section", "artifact-path-section");
      section.append(makePreviewElement("h3", "", "完成与证据"));
      const list = makePreviewElement("ul", "artifact-path-bullets");
      criteria.forEach(value => {
        const item = stringValue(value);
        if (item) list.append(makePreviewElement("li", "", item));
      });
      if (list.childElementCount) section.append(list);
      textPreview.append(section);
    }

    if (!textPreview.childElementCount || (!outline.length && !activities.length && !objectives.length && !criteria.length)) {
      const fallback = makePreviewElement("pre", "artifact-path-json", JSON.stringify(content, null, 2));
      textPreview.append(fallback);
    }
    window.clearTimeout(previewTimer);
    root.dataset.previewState = "ready";
    iframe.hidden = true;
    placeholder.hidden = true;
    textPreview.hidden = false;
    previewRetry.hidden = true;
    if (previewActions) previewActions.hidden = true;
    if (previewHint) previewHint.textContent = "阅读目标、学习步骤与证据要求";
    if (previewStateLabel) previewStateLabel.textContent = "学习路径已就绪";
  }

  function embeddedPreviewState() {
    try {
      const marker = iframe.contentDocument && iframe.contentDocument.querySelector("[data-aisecedu-preview-state]");
      if (!marker) return null;
      const state = marker.dataset.aiseceduPreviewState;
      if (state === "ready") return { state };
      if (state === "error") {
        const message = marker.querySelector("[role='alert'] p")?.textContent?.trim();
        return { state, message };
      }
    } catch (error) {
      console.warn("Unable to inspect embedded preview state", error);
    }
    return null;
  }

  function waitForEmbeddedPreview(sequence, deadline) {
    window.clearTimeout(previewTimer);
    if (sequence !== previewSequence) return;
    if (previewAwaitingNavigation) {
      if (Date.now() >= deadline) {
        handlePreviewFailure("预览加载超时，请重新加载。");
        return;
      }
      previewTimer = window.setTimeout(() => waitForEmbeddedPreview(sequence, deadline), 250);
      return;
    }
    const current = embeddedPreviewState();
    if (current && current.state === "ready") {
      setPreviewState("ready");
      return;
    }
    if (current && current.state === "error") {
      handlePreviewFailure(current.message);
      return;
    }
    if (Date.now() >= deadline) {
      handlePreviewFailure("预览加载超时，请重新加载。");
      return;
    }
    previewTimer = window.setTimeout(() => waitForEmbeddedPreview(sequence, deadline), 250);
  }

  function handlePreviewFailure(message) {
    window.clearTimeout(previewTimer);
    if (previewAttempt < 2) {
      window.setTimeout(() => launchPreview(true).catch(showError), 400);
      return;
    }
    setPreviewState("error", message || "预览暂时没有加载成功，请重新加载。");
  }

  function handlePreviewMessage(event) {
    if (event.origin !== window.location.origin || event.source !== iframe.contentWindow) return;
    const data = event.data || {};
    if (data.type !== "aisecedu:artifact-preview" || data.artifactId !== artifactId) return;
    const current = embeddedPreviewState();
    if (!current || current.state !== data.state) return;
    if (data.state === "ready") setPreviewState("ready");
    else if (data.state === "error") handlePreviewFailure(data.message);
  }

  function handlePreviewFrameLoad() {
    try {
      const path = iframe.contentWindow && iframe.contentWindow.location.pathname;
      if (path && path.endsWith(`/prep/${artifactId}`)) previewAwaitingNavigation = false;
    } catch (error) {
      console.warn("Unable to verify embedded preview navigation", error);
    }
    waitForEmbeddedPreview(previewSequence, Date.now() + 20000);
  }

  function render() {
    if (!artifact) return;
    document.getElementById("artifact-title").textContent = artifact.title;
    document.getElementById("artifact-type-label").textContent = artifactTypeLabel(artifact.type);
    const context = artifact.courseContext || teacherArtifact?.courseContext || null;
    const visibility = artifact.visibility || teacherArtifact?.visibility || {};
    const tab = artifactCourseTab(artifact.type);
    const courseHref = context
      ? returnRole === "teacher"
        ? `/teacher/courses?dojo=${encodeURIComponent(context.referenceId || context.id)}&tab=${encodeURIComponent(tab)}&selectedId=${encodeURIComponent(artifact.id)}`
        : `/dojo/${encodeURIComponent(context.referenceId || context.id)}/learning`
      : returnTo;
    const backLink = document.getElementById("artifact-back-link");
    const courseLink = document.getElementById("artifact-course-link");
    const moduleLink = document.getElementById("artifact-module-link");
    const moduleSeparator = document.getElementById("artifact-module-separator");
    if (backLink) backLink.href = returnTo;
    if (courseLink) {
      courseLink.href = isPersonal ? "/learning/extend" : courseHref;
      courseLink.textContent = isPersonal ? "我的创作" : context?.name || "课程";
    }
    if (moduleLink) {
      moduleLink.hidden = !context?.module;
      moduleLink.textContent = context?.module?.name || "章节";
      moduleLink.href = context?.module
        ? returnRole === "teacher"
          ? courseHref
          : `/${encodeURIComponent(context.referenceId)}/${encodeURIComponent(context.module.id)}`
        : "#";
    }
    if (moduleSeparator) moduleSeparator.hidden = !context?.module;
    const metaParts = [artifactTypeLabel(artifact.type)];
    if (viewerRole === "teacher") metaParts.push(statusLabel(artifact.status), `版本 ${artifact.currentRevision}`);
    else if (isPersonal) metaParts.push(statusLabel(artifact.status));
    if (context?.module?.name) metaParts.push(context.module.name);
    document.getElementById("artifact-meta").textContent = metaParts.join(" · ");
    const visibilityBadge = document.getElementById("artifact-visibility-badge");
    if (visibilityBadge) {
      visibilityBadge.textContent = isPersonal
        ? visibility.label || "仅自己可见"
        : viewerRole === "student"
          ? "课程内容"
          : artifact.studentSafe
            ? "学生安全预览"
            : visibility.label || (artifact.status === "PUBLISHED" ? "学生可见" : "仅教师可见");
      visibilityBadge.dataset.visibility = isPersonal ? "personal" : artifact.studentSafe ? "preview" : visibility.state || "teacher_only";
    }
    root.dataset.artifactType = String(artifact.type || "content");
    const inspectorSummary = document.getElementById("artifact-inspector-summary");
    if (inspectorSummary) inspectorSummary.textContent = isPersonal
      ? `${statusLabel(artifact.status)} · 已保留 ${Math.max(1, (artifact.history || []).length)} 个版本`
      : `${statusLabel(artifact.status)} · 当前版本 ${artifact.currentRevision}`;
    const validation = artifact.revision && artifact.revision.validation || {};
    const validationPassed = artifact.studentSafe
      ? artifact.status === "PUBLISHED"
      : ["PASS", "PASSED"].includes(String(validation.status || "").toUpperCase());
    const validationRoot = document.getElementById("artifact-validation");
    if (validationRoot) validationRoot.innerHTML = `<div class="artifact-validation-card ${validationPassed ? "is-success" : "is-pending"}">
        <span><i class="fas ${validationPassed ? "fa-check" : "fa-shield-alt"}" aria-hidden="true"></i></span>
        <div><strong>${validationPassed ? "发布检查已通过" : `质量检查：${api.escapeHtml(statusLabel(validation.status || "PENDING"))}`}</strong>
        <small>${validationPassed ? "内容完整性与可用性符合当前发布要求。" : "发布前会自动检查内容完整性和可用性。"}</small></div>
      </div>`;
    const historyRoot = document.getElementById("artifact-history");
    if (historyRoot) historyRoot.innerHTML = (artifact.history || []).map(row => `
      <li class="${row.revision === artifact.currentRevision ? "is-current" : ""}">
        <span class="artifact-version-number">V${row.revision}</span><div><strong>${row.revision === artifact.currentRevision ? "当前版本" : `版本 ${row.revision}`}</strong><span>${api.escapeHtml(revisionInstruction(row.instruction))}</span><small>${api.escapeHtml(row.author || "系统")} · ${api.escapeHtml(api.formatDate(row.created))}</small></div>
        ${viewerRole === "teacher" ? `<span class="artifact-history-actions"><button type="button" data-view-revision="${row.revision}">比较</button>${artifact.capabilities?.edit && row.revision !== artifact.currentRevision ? `<button type="button" data-restore-revision="${row.revision}">恢复</button>` : ""}</span>` : ""}
      </li>`).join("");
    const lineage = artifact.lineage || {};
    const sources = Array.isArray(lineage.sources) && lineage.sources.length
      ? lineage.sources
      : artifact.revision && artifact.revision.sourceRefs || [];
    const sourceCards = sources.map(source => {
      const item = source && typeof source === "object" ? source : {};
      const label = item.type === "material" ? "课程资料" : item.type === "artifact" ? "已有教学内容" : "课程上下文";
      const detail = item.title || item.name || item.filename || "已关联到本次生成内容";
      const card = `<article><span><i class="fas ${item.type === "material" ? "fa-file-alt" : item.type === "artifact" ? "fa-layer-group" : "fa-book-open"}" aria-hidden="true"></i></span><div><strong>${api.escapeHtml(label)}</strong><small>${api.escapeHtml(detail)}${item.status ? ` · ${api.escapeHtml(statusLabel(item.status))}` : ""}</small></div>${item.href ? '<i class="fas fa-arrow-right" aria-hidden="true"></i>' : ""}</article>`;
      return item.href ? `<a href="${api.escapeHtml(item.href)}">${card}</a>` : card;
    });
    if (!artifact.studentSafe && lineage.generationJob) {
      const job = lineage.generationJob;
      const href = job.threadId ? `/teacher?thread=${encodeURIComponent(job.threadId)}` : "/teacher";
      sourceCards.push(`<a href="${href}"><article><span><i class="fas fa-tasks" aria-hidden="true"></i></span><div><strong>生成任务</strong><small>${api.escapeHtml(statusLabel(job.status))} · ${api.escapeHtml(api.formatDate(job.completed || job.created))}</small></div><i class="fas fa-arrow-right" aria-hidden="true"></i></article></a>`);
    }
    if (!artifact.studentSafe && context) {
      sourceCards.unshift(`<a href="${courseHref}"><article><span><i class="fas fa-book-open" aria-hidden="true"></i></span><div><strong>课程归属</strong><small>${api.escapeHtml(context.name || "课程")}${context.module?.name ? ` · ${api.escapeHtml(context.module.name)}` : ""}</small></div><i class="fas fa-arrow-right" aria-hidden="true"></i></article></a>`);
    }
    const sourcesRoot = document.getElementById("artifact-sources");
    if (sourcesRoot) sourcesRoot.innerHTML = sourceCards.length ? sourceCards.join("") : artifact.studentSafe
        ? '<div class="artifact-source-empty"><i class="fas fa-user-shield" aria-hidden="true"></i><strong>学生安全视图</strong><p>教师私有来源、生成指令、答案与验证信息不会发送到学生端。</p></div>'
        : '<div class="artifact-source-empty"><i class="fas fa-magic" aria-hidden="true"></i><strong>直接生成</strong><p>本版本根据当前课程上下文和教师要求生成，没有额外关联资料。</p></div>';
    const reviseButton = document.getElementById("artifact-revise");
    if (reviseButton) reviseButton.closest("[data-artifact-panel]").hidden = !artifact.capabilities?.edit;
    historyRoot?.querySelectorAll("[data-view-revision]").forEach(button => button.addEventListener("click", () => compareRevision(Number(button.dataset.viewRevision)).catch(showError)));
    historyRoot?.querySelectorAll("[data-restore-revision]").forEach(button => button.addEventListener("click", () => restoreRevision(Number(button.dataset.restoreRevision)).catch(showError)));
    const renameButton = document.getElementById("artifact-rename");
    const deleteButton = document.getElementById("artifact-delete");
    const reviewButton = document.getElementById("artifact-request-review");
    if (renameButton) renameButton.hidden = !artifact.capabilities?.edit;
    if (deleteButton) deleteButton.hidden = !artifact.capabilities?.edit;
    if (reviewButton) reviewButton.hidden = !artifact.capabilities?.requestReview;
    renderPublishButton();
  }

  async function compareRevision(number) {
    const data = unwrap(await api.request(`/teaching/artifacts/${encodeURIComponent(artifactId)}/revisions/${number}`));
    const panel = document.getElementById("artifact-compare");
    setInspectorOpen(true, { tab: "versions" });
    document.getElementById("artifact-compare-title").textContent = `版本 ${number} 与当前版本 ${artifact.currentRevision}`;
    document.getElementById("artifact-compare-source").textContent = JSON.stringify(data.revision.content || {}, null, 2).slice(0, 120000);
    document.getElementById("artifact-compare-current").textContent = JSON.stringify(artifact.revision && artifact.revision.content || {}, null, 2).slice(0, 120000);
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function restoreRevision(number) {
    if (!artifact || !artifact.capabilities?.edit) return;
    const confirmed = await window.AISecEduUI.confirm(
      `确认恢复版本 ${number} 的内容并创建一个新草稿？当前版本不会被删除。`,
      { title: "恢复历史版本", confirmLabel: "创建新草稿" },
    );
    if (!confirmed) return;
    const data = unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(artifactId)}/restore`, {
      sourceRevision: number,
      expectedRevision: artifact.currentRevision,
    }));
    artifact = { ...artifact, ...data.artifact };
    await load();
    await launchPreview();
    notify("版本恢复成功", "success");
  }

  function renderPublishButton() {
    const requestButton = document.getElementById("artifact-request-publish");
    if (!requestButton) return;
    const terminal = artifact && artifact.status === "PUBLISHED";
    const contentReady = artifact && !activeJob && !["GENERATING", "FAILED", "VALIDATION_FAILED", "CANCELED"].includes(String(artifact.status || "").toUpperCase());
    requestButton.hidden = !artifact || !artifact.capabilities?.publishToCourse || (!terminal && !contentReady);
    requestButton.disabled = terminal || publishInFlight;
    requestButton.dataset.publishState = terminal ? "published" : publishInFlight ? "loading" : "ready";
    const label = requestButton.querySelector("span");
    const icon = requestButton.querySelector("i");
    if (label) label.textContent = terminal ? "已发布" : publishInFlight ? "发布中…" : "发布";
    if (icon) icon.className = terminal ? "fas fa-check" : publishInFlight ? "fas fa-circle-notch fa-spin" : "fas fa-paper-plane";
  }

  async function load() {
    const data = unwrap(await api.request(`/teaching/artifacts/${encodeURIComponent(artifactId)}`));
    artifact = data.artifact;
    if (viewerRole === "teacher") teacherArtifact = artifact;
    previewRole = viewerRole;
    activeJob = artifact.activeJob || null;
    render();
  }

  async function toggleStudentPreview() {
    const button = document.getElementById("artifact-student-preview");
    if (!button || viewerRole !== "teacher") return;
    button.disabled = true;
    try {
      const entering = previewRole !== "student";
      if (entering) {
        const data = unwrap(
          await api.request(`/teaching/artifacts/${encodeURIComponent(artifactId)}/student-preview`),
        );
        teacherArtifact = teacherArtifact || artifact;
        artifact = {
          ...data.artifact,
          courseContext: teacherArtifact?.courseContext || data.artifact.courseContext,
          visibility: teacherArtifact?.visibility || data.artifact.visibility,
        };
        previewRole = "student";
        activeJob = null;
      } else {
        artifact = teacherArtifact;
        previewRole = "teacher";
        activeJob = artifact.activeJob || null;
      }
      root.dataset.studentPreview = previewRole === "student" ? "true" : "false";
      button.setAttribute("aria-pressed", String(previewRole === "student"));
      button.querySelector("span").textContent = previewRole === "student" ? "退出学生视图" : "学生视图";
      button.querySelector("i").className = previewRole === "student" ? "fas fa-user-shield" : "fas fa-user-graduate";
      render();
      await launchPreview(false);
      notify(
        previewRole === "student"
          ? "已切换到学生安全视图，私有答案与验证信息已由服务端移除。"
          : "已返回教师编辑视图。",
        "success",
      );
    } finally {
      button.disabled = false;
    }
  }

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function completePublication(initialAction) {
    let action = initialAction;
    const deadline = Date.now() + 20 * 60 * 1000;
    while (action && action.status === "VALIDATING") {
      if (Date.now() >= deadline) throw new Error("发布检查超时，请稍后重试");
      const stage = String(action.stage || action.validationStage || "").trim();
      setOperationStatus(
        "progress",
        "正在执行发布检查",
        stage ? `${statusLabel(stage)} · 页面可以继续使用，进度也会保留在任务中心。` : "正在核验内容完整性与可用性；页面可以继续使用，进度也会保留在任务中心。",
      );
      await wait(2000);
      const data = unwrap(await api.request(`/teaching/actions/${encodeURIComponent(action.id)}/decision`));
      action = data.action;
    }
    if (!action) throw new Error("发布失败，请稍后重试");
    if (action.status === "AWAITING_APPROVAL") {
      setOperationStatus("progress", "发布检查已通过", "正在写入课程并刷新学生可见状态…");
      const data = unwrap(await api.json("POST", `/teaching/actions/${encodeURIComponent(action.id)}/decision`, {
        decision: "APPROVED",
        confirmed: true,
        comment: "教师在内容详情页点击发布",
      }));
      action = data.action;
    }
    if (action.status !== "APPROVED") {
      throw new Error(action.error || (action.status === "REJECTED" ? "发布已取消" : "发布失败，请稍后重试"));
    }
    return action;
  }

  async function requestPublish() {
    if (!artifact || !artifact.capabilities?.publishToCourse || publishInFlight || artifact.status === "PUBLISHED") return;
    publishInFlight = true;
    renderPublishButton();
    setOperationStatus("progress", "发布请求已提交", "正在启动质量检查；页面仍可继续浏览，任务进度会持续更新。 ");
    notify("发布请求已提交，正在进行发布检查。", "progress", { duration: 5200, dedupeKey: `artifact-publish-${artifact.id}` });
    try {
      const data = unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(artifact.id)}/request-publish`, {
        expectedRevision: artifact.currentRevision,
      }));
      await completePublication(data.action);
      await load();
      if (artifact.status !== "PUBLISHED") throw new Error("发布失败，请稍后重试");
      await launchPreview(false);
      setOperationStatus("success", "发布成功", "题目已发布到课程，页面状态和学生预览均已自动刷新。");
      notify("发布成功，页面状态已自动刷新。", "success", { duration: 6200, dedupeKey: `artifact-published-${artifact.id}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = message.startsWith("发布") ? message : `发布失败：${message}`;
      setOperationStatus("danger", "发布未完成", failure);
      notify(failure, "danger");
    }
    finally {
      publishInFlight = false;
      renderPublishButton();
      clearOperationStatus(artifact && artifact.status === "PUBLISHED" ? 7000 : 9000);
    }
  }

  async function launchPreview(retrying) {
    if (!artifact) await load();
    if (artifact.status === "GENERATING" || activeJob && ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(activeJob.status)) {
      const progress = activeJob ? Number(activeJob.progress || 0) : 0;
      placeholder.querySelector("p").textContent = `正在生成可预览内容${progress ? ` · ${progress}%` : ""}…`;
      notify("正在生成预览…", "progress");
      if (activeJob) poll();
      else {
        window.clearTimeout(timer);
        timer = window.setTimeout(async () => {
          try {
            await load();
            await launchPreview();
          } catch (error) { showError(error); }
        }, 1800);
      }
      return;
    }
    if (artifact.type === "learning-path") {
      renderLearningPathPreview();
      return;
    }
    previewAttempt = retrying ? previewAttempt + 1 : 1;
    previewSequence += 1;
    const sequence = previewSequence;
    setPreviewState("loading", retrying ? "正在重新加载预览…" : "正在加载预览…");
    const target = `/prep/${encodeURIComponent(artifact.id)}`;
    try {
      const data = unwrap(await api.json("POST", "/teaching/runtime/launch", {
        role: previewRole,
        dojoId: artifact.dojoId,
        moduleIndex: artifact.moduleIndex,
        target,
      }));
      previewAwaitingNavigation = true;
      iframe.src = data.launchUrl;
      waitForEmbeddedPreview(sequence, Date.now() + 20000);
    } catch (error) {
      handlePreviewFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function revise() {
    const instructionField = document.getElementById("artifact-instruction");
    if (!instructionField) return;
    const instruction = instructionField.value.trim();
    if (!instruction || !artifact) return;
    const button = document.getElementById("artifact-revise");
    button.disabled = true;
    try {
      const data = unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(artifact.id)}/revise`, {
        instruction,
        expectedRevision: artifact.currentRevision,
      }));
      activeJob = data.job;
      notify("正在生成新版本…", "progress");
      poll();
    } catch (error) { showError(error); button.disabled = false; }
  }

  async function poll() {
    window.clearTimeout(timer);
    if (!activeJob) return;
    try {
      const data = unwrap(await api.request(`/teaching/jobs/${encodeURIComponent(activeJob.id)}`));
      activeJob = data.job;
      const activity = activeJob.kind === "artifact.revise" ? "正在生成新版本" : "正在生成可预览内容";
      placeholder.querySelector("p").textContent = `${activity} · ${activeJob.progress}%…`;
      if (activeJob.status === "SUCCEEDED") {
        const completedKind = activeJob.kind;
        const instructionField = document.getElementById("artifact-instruction");
        const reviseButton = document.getElementById("artifact-revise");
        if (instructionField) instructionField.value = "";
        if (reviseButton) reviseButton.disabled = false;
        await load();
        await launchPreview();
        notify(completedKind === "artifact.revise" ? "新版本生成成功" : "预览生成成功", "success");
      } else if (["FAILED", "CANCELED"].includes(activeJob.status)) {
        const reviseButton = document.getElementById("artifact-revise");
        if (reviseButton) reviseButton.disabled = false;
        placeholder.querySelector("p").textContent = activeJob.failureMessage || "内容没有生成成功。";
        notify(activeJob.failureMessage || "生成失败，请重试", "danger");
      } else timer = window.setTimeout(poll, 1800);
    } catch (error) {
      showError(error);
      const reviseButton = document.getElementById("artifact-revise");
      if (reviseButton) reviseButton.disabled = false;
    }
  }

  async function renamePersonalArtifact() {
    if (!artifact?.capabilities?.edit) return;
    const value = window.AISecEduUI?.prompt
      ? await window.AISecEduUI.prompt("设置一个便于在个人成果中查找的名称。", {
          title: "重命名创作",
          inputLabel: "成果名称",
          value: artifact.title || "",
          maxLength: 240,
          confirmLabel: "保存",
        })
      : null;
    const title = String(value || "").trim();
    if (!title || title === artifact.title) return;
    unwrap(await api.json("PATCH", `/teaching/artifacts/${encodeURIComponent(artifact.id)}`, { title }));
    await load();
    notify("名称已更新。", "success");
  }

  async function deletePersonalArtifact() {
    if (!artifact?.capabilities?.edit) return;
    const confirmed = window.AISecEduUI?.confirm
      ? await window.AISecEduUI.confirm(
          `删除“${artifact.title}”及其全部版本？删除后不会继续显示，且无法恢复。`,
          { title: "删除个人创作", confirmLabel: "确认删除", confirmStyle: "danger" },
        )
      : false;
    if (!confirmed) return;
    unwrap(await api.json("DELETE", `/teaching/artifacts/${encodeURIComponent(artifact.id)}`, { scope: "workspace" }));
    notify("个人创作已删除。", "success");
    window.location.assign(returnTo);
  }

  async function requestPersonalReview() {
    if (!artifact?.capabilities?.requestReview) return;
    const button = document.getElementById("artifact-request-review");
    if (button) button.disabled = true;
    try {
      unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(artifact.id)}/request-review`, {}));
      await load();
      notify("已提交教师审阅；这不是发布，课程中不会自动出现。", "success");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function togglePreviewFullscreen() {
    try {
      if (document.fullscreenElement === previewPanel) await document.exitFullscreen();
      else await previewPanel.requestFullscreen();
      iframe.focus({ preventScroll: true });
    } catch (error) {
      showError(new Error("当前浏览器无法进入全屏预览。"));
    }
  }

  const reviseButton = document.getElementById("artifact-revise");
  if (reviseButton) reviseButton.addEventListener("click", revise);
  document.getElementById("artifact-student-preview")?.addEventListener("click", () => toggleStudentPreview().catch(showError));
  document.getElementById("artifact-request-publish")?.addEventListener("click", requestPublish);
  document.getElementById("artifact-rename")?.addEventListener("click", () => renamePersonalArtifact().catch(showError));
  document.getElementById("artifact-delete")?.addEventListener("click", () => deletePersonalArtifact().catch(showError));
  document.getElementById("artifact-request-review")?.addEventListener("click", () => requestPersonalReview().catch(showError));
  document.getElementById("artifact-close-compare")?.addEventListener("click", () => { document.getElementById("artifact-compare").hidden = true; });
  previewRetry.addEventListener("click", () => launchPreview(false).catch(showError));
  document.getElementById("artifact-preview-reload").addEventListener("click", () => launchPreview(false).catch(showError));
  document.getElementById("artifact-preview-fullscreen").addEventListener("click", togglePreviewFullscreen);
  inspectorToggle?.addEventListener("click", () => setInspectorOpen(root.dataset.inspectorOpen !== "true", { focus: true }));
  inspectorClose?.addEventListener("click", () => { setInspectorOpen(false); inspectorToggle?.focus(); });
  inspectorBackdrop?.addEventListener("click", () => setInspectorOpen(false));
  root.querySelectorAll("[data-artifact-tab]").forEach((button, index, tabs) => {
    button.addEventListener("click", () => activateInspectorTab(button.dataset.artifactTab));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      activateInspectorTab(tabs[nextIndex].dataset.artifactTab);
      tabs[nextIndex].focus();
    });
  });
  root.querySelectorAll("[data-revision-suggestion]").forEach(button => button.addEventListener("click", () => {
    const field = document.getElementById("artifact-instruction");
    if (!field) return;
    field.value = button.dataset.revisionSuggestion || "";
    field.focus();
  }));
  document.addEventListener("fullscreenchange", () => {
    const button = document.getElementById("artifact-preview-fullscreen");
    const active = document.fullscreenElement === previewPanel;
    button.querySelector("span").textContent = active ? "退出聚焦" : "聚焦预览";
    button.querySelector("i").className = active ? "fas fa-compress" : "fas fa-expand";
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && root.dataset.inspectorOpen === "true" && !document.fullscreenElement) setInspectorOpen(false);
  });
  iframe.addEventListener("load", handlePreviewFrameLoad);
  window.addEventListener("message", handlePreviewMessage);
  setInspectorOpen(false);
  load().then(() => launchPreview()).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    setPreviewState("error", message || "内容信息暂时无法读取，请重新加载。");
    showError(error);
  });
})();

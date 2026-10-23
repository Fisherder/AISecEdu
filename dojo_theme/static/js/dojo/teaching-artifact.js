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
  const previewActions = root.querySelector(".artifact-preview-actions");
  const textPreview = document.getElementById("artifact-text-preview");
  const inspector = document.getElementById("artifact-inspector");
  const inspectorToggle = document.getElementById("artifact-inspector-toggle");
  const inspectorClose = document.getElementById("artifact-inspector-close");
  const inspectorBackdrop = document.getElementById("artifact-inspector-backdrop");
  let artifact = null;
  let teacherArtifact = null;
  let activeJob = null;
  const jobProgress = window.AISecEdu.jobProgress;
  const progressPanel = document.getElementById("artifact-job-progress");
  const progressToggle = document.getElementById("artifact-progress-toggle");
  const placeholderProgress = document.getElementById("artifact-placeholder-progress");
  const progressEmpty = document.getElementById("artifact-progress-empty");
  let progressJob = null;
  let progressEpoch = 0;
  let pollingEpoch = null;
  let progressClock = null;
  let progressSignature = "";
  let progressConnection = "";
  let progressFailures = 0;
  let previewRole = viewerRole;
  let timer = null;
  let previewTimer = null;
  let previewAttempt = 0;
  let previewSequence = 0;
  let previewAwaitingNavigation = false;
  let cinematicImmersion = null;

  function canTrackProgress() {
    return Boolean(progressPanel && (viewerRole === "teacher" ? previewRole === "teacher" : isPersonal));
  }

  function stopProgress() {
    progressEpoch += 1;
    window.clearTimeout(timer);
    window.clearInterval(progressClock);
    progressClock = null;
  }

  function renderProgress() {
    if (!progressPanel) return;
    const enabled = canTrackProgress();
    progressPanel.hidden = !enabled || (!progressJob && !progressConnection && artifact?.status !== "GENERATING");
    const running = enabled && (Boolean(activeJob) || artifact?.status === "GENERATING");
    const blocking = running && root.dataset.previewState !== "ready";
    previewPanel.dataset.jobBlocking = String(blocking);
    if (progressEmpty) progressEmpty.hidden = !progressPanel.hidden;
    if (placeholderProgress) placeholderProgress.hidden = !blocking;
    if (progressToggle) {
      progressToggle.hidden = !enabled || (!running && !["FAILED", "CANCELED"].includes(progressJob?.status));
      progressToggle.querySelector("span").textContent = running
        ? `正在${progressJob?.kind === "artifact.revise" ? "调整" : "生成"} · ${jobProgress.jobProgressValue(progressJob || {})}%`
        : "任务未完成";
    }
    if (progressPanel.hidden) return;
    const signature = JSON.stringify([progressJob, progressConnection, blocking]);
    if (progressSignature === signature) return;
    progressSignature = signature;
    const previousDetails = progressPanel.querySelector("details");
    const sameJob = progressPanel.dataset.jobId === progressJob?.id;
    const sameStatus = progressPanel.dataset.status === progressJob?.status;
    const expanded = sameJob && sameStatus && previousDetails ? previousDetails.open : Boolean(activeJob) || ["FAILED", "CANCELED"].includes(progressJob?.status);
    const scroll = progressPanel.querySelector(".job-event-log")?.scrollTop || 0;
    const esc = api.escapeHtml;
    progressPanel.dataset.jobId = progressJob?.id || "";
    progressPanel.dataset.status = progressJob?.status || "";
    const connection = progressConnection ? `<p class="artifact-job-connection" role="status">${esc(progressConnection)}</p>` : "";
    if (!progressJob) {
      progressPanel.innerHTML = `<div class="artifact-job-summary"><h2>正在查找生成任务</h2></div><p class="artifact-job-note">正在同步这份内容的任务状态；找到后会显示详细进度。</p>${connection}`;
      return;
    }
    const job = progressJob;
    const status = job.status;
    const progress = jobProgress.jobProgressValue(job);
    const title = status === "SUCCEEDED" ? (job.kind === "artifact.revise" ? "调整已完成" : "生成已完成")
      : status === "FAILED" ? "这次任务未完成" : status === "CANCELED" ? "任务已取消"
      : status === "CANCEL_REQUESTED" ? "正在停止任务" : job.kind === "artifact.revise" ? "正在调整内容" : "正在生成内容";
    const failed = ["FAILED", "CANCELED"].includes(status)
      ? `<p class="artifact-job-failure">${esc(job.failureMessage || (status === "CANCELED" ? "任务已取消。" : "本次内容没有生成成功。"))} 已有版本会保留，可以到任务列表重新运行。</p>` : "";
    const taskHref = `/teacher?view=conversation&tasks=1&job=${encodeURIComponent(job.id)}`;
    progressPanel.innerHTML = `
      <div class="artifact-job-summary"><div><h2>${title}</h2><div class="artifact-job-meta">${jobProgress.jobDurationMarkup(job, false)}<span>${esc(jobProgress.jobAttemptLabel(job))}</span></div></div><strong class="artifact-job-number">${progress}%</strong></div>
      <div class="artifact-job-bar" role="progressbar" aria-label="任务进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <div class="artifact-job-current" role="status" aria-live="polite"><strong>${esc(jobProgress.jobCurrentStepLabel(job))}</strong><p>${esc(jobProgress.jobCurrentDetail(job))}</p></div>
      ${connection}${failed}
      <details${expanded ? " open" : ""}><summary>详细步骤与执行记录</summary>
        <div class="artifact-job-columns"><div><h3>任务步骤</h3>${jobProgress.jobTimelineMarkup(job, false)}</div><div><h3>执行记录</h3>${jobProgress.jobEventLogMarkup(job)}</div></div>
        <p class="artifact-job-identity">任务编号：${esc(job.id)}</p>
        <p class="artifact-job-note">与任务列表使用同一任务状态。进度按实际步骤更新，某一步耗时较长时百分比可能暂时不变。</p>
      <div class="artifact-job-actions">${viewerRole === "teacher" ? `<a href="${taskHref}" target="_blank" rel="noopener">在任务列表中查看${failed ? " / 重试" : ""}</a>` : ""}<button type="button" data-progress-refresh>刷新进度</button></div>
      </details>`;
    progressPanel.querySelector("[data-progress-refresh]").addEventListener("click", () => poll());
    const eventLog = progressPanel.querySelector(".job-event-log");
    if (eventLog && sameJob) eventLog.scrollTop = scroll;
  }

  function adoptProgress(job) {
    const wasActive = activeJob?.id;
    progressJob = job || null;
    activeJob = job && jobProgress.activeJobStatuses.has(job.status) ? job : null;
    if (activeJob && wasActive !== activeJob.id) {
      if (root.dataset.previewState !== "ready") {
        previewSequence += 1;
        window.clearTimeout(previewTimer);
        setPreviewState("loading", "正在生成内容，可在右侧查看详细进度。");
      }
    }
    const button = document.getElementById("artifact-revise");
    if (button) button.disabled = Boolean(activeJob);
    window.clearInterval(progressClock);
    progressClock = activeJob ? window.setInterval(() => jobProgress.updateJobDurations(progressPanel), 1000) : null;
    renderProgress();
    renderPublishButton();
  }

  function scheduleProgress(delay) {
    window.clearTimeout(timer);
    if (canTrackProgress()) timer = window.setTimeout(poll, delay);
  }

  function setCinematicImmersion(enabled) {
    const toolbar = previewPanel.querySelector('.artifact-preview-toolbar');
    if (enabled && !cinematicImmersion) {
      cinematicImmersion = {panel: previewPanel.getAttribute('style'), frame: iframe.getAttribute('style'), toolbarStyle: toolbar?.getAttribute('style'), bodyOverflow: document.body.style.overflow, htmlOverflow: document.documentElement.style.overflow};
      previewPanel.style.cssText += ';position:fixed;inset:0;z-index:100000;width:100vw;height:100dvh;max-height:none;min-height:0;border-radius:0;display:flex;flex-direction:column;margin:0;';
      iframe.style.cssText += ';width:100%;height:100%;min-height:0;flex:1;border:0;';
      if (toolbar) toolbar.style.display = 'none';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else if (!enabled && cinematicImmersion) {
      for (const [element, value] of [[previewPanel, cinematicImmersion.panel], [iframe, cinematicImmersion.frame]]) {
        if (value === null) element.removeAttribute('style'); else element.setAttribute('style', value);
      }
      if (toolbar) {
        if (cinematicImmersion.toolbarStyle == null) toolbar.removeAttribute('style'); else toolbar.setAttribute('style', cinematicImmersion.toolbarStyle);
      }
      document.body.style.overflow = cinematicImmersion.bodyOverflow;
      document.documentElement.style.overflow = cinematicImmersion.htmlOverflow;
      cinematicImmersion = null;
    }
  }
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
    return ["simulation", "attack-defense-scene", "classroom-scenario", "debate"].includes(String(value || "").toLowerCase())
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
    inspector.inert = !open;
    inspectorToggle.setAttribute("aria-expanded", open ? "true" : "false");
    syncInspectorModality();
    if (open && options && options.tab) activateInspectorTab(options.tab);
    if (open && options && options.focus) {
      inspector.querySelector("[aria-selected='true']")?.focus({ preventScroll: true });
    }
  }

  function syncInspectorModality() {
    if (!inspector) return;
    const modal = root.dataset.inspectorOpen === "true" && window.matchMedia("(max-width: 900px)").matches;
    previewPanel.inert = modal;
    root.querySelector(".artifact-detail-header").inert = modal;
    if (modal) {
      inspector.setAttribute("role", "dialog");
      inspector.setAttribute("aria-modal", "true");
    } else {
      inspector.removeAttribute("role");
      inspector.removeAttribute("aria-modal");
    }
  }

  function showPreviewSurface() {
    previewPanel.hidden = false;
    const taskStage = document.getElementById("artifact-task-stage");
    if (taskStage) taskStage.hidden = true;
  }

  function syncEmbeddedDebateTheme() {
    if (artifact?.type !== "debate") return;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.querySelector("[data-debate-player]")) return;
      const theme = document.documentElement.dataset.aiseceduTheme;
      if (!["light", "dark"].includes(theme)) return;
      doc.documentElement.classList.toggle("dark", theme === "dark");
      doc.documentElement.style.colorScheme = theme;
    } catch (_) {}
  }

  function setPreviewState(state, message) {
    showPreviewSurface();
    const ready = state === "ready";
    const failed = state === "error";
    root.dataset.previewState = state;
    if (ready) previewPanel.dataset.jobBlocking = "false";
    iframe.hidden = !ready;
    if (ready) syncEmbeddedDebateTheme();
    if (textPreview) textPreview.hidden = true;
    placeholder.hidden = ready;
    if (previewActions) previewActions.hidden = false;
    if (previewHint) previewHint.textContent = "预览已铺满工作区，可收起右栏继续查看。";
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
    showPreviewSurface();
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
    if (data.type === "aisecedu:courseware-studio" && data.artifactId === artifactId) {
      if (data.action === "ready") {
        root.dataset.coursewareStudio = "true";
        setInspectorOpen(false);
        document.getElementById("artifact-inspector-toggle").hidden = true;
      } else if (data.action === "saved" && previewRole === "teacher" && artifact?.capabilities?.edit) {
        load().catch(showError);
      } else if (data.action === "publish" && previewRole === "teacher" && artifact?.capabilities?.publishToCourse) {
        requestPublish().catch(showError);
      }
      return;
    }
    if (activeJob || previewAwaitingNavigation) return;
    if (data.type === "aisecedu:debate-revision-request") {
      if (data.artifactId !== artifactId || artifact?.type !== "debate" || !artifact.capabilities?.edit ||
          typeof data.instruction !== "string" || !data.instruction.trim() || data.instruction.length > 16000) return;
      const field = document.getElementById("artifact-instruction");
      if (!field) return;
      field.value = data.instruction;
      setInspectorOpen(true, {tab: "revise", focus: true});
      field.focus();
      return;
    }
    if (data.__aiseceduCinematicPreview === true && data.action === 'immersive-change' && typeof data.immersive === 'boolean') {
      setCinematicImmersion(data.immersive);
      return;
    }
    if (data.type !== "aisecedu:artifact-preview" || data.artifactId !== artifactId) return;
    const current = embeddedPreviewState();
    if (!current || current.state !== data.state) return;
    if (data.state === "ready") setPreviewState("ready");
    else if (data.state === "error") handlePreviewFailure(data.message);
  }

  function handlePreviewFrameLoad() {
    if (activeJob) return;
    setCinematicImmersion(false);
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
    document.getElementById("artifact-title").title = artifact.title;
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
      courseLink.href = isPersonal ? "/learning/extend" : artifact.dojoId == null ? "/teacher/projects" : courseHref;
      courseLink.textContent = isPersonal ? "我的创作" : context?.name || "生成项目合集";
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
    const debateHistory = document.getElementById("artifact-debate-history");
    if (debateHistory) {
      debateHistory.hidden = artifact.type !== "debate" || !artifact.capabilities?.edit;
      const journal = artifact.revision?.content?.debateRevisionHistory || [];
      debateHistory.innerHTML = journal.length ? `<h4>连续修改记录</h4><ol>${journal.slice(-12).map(entry =>
        `<li><strong>${api.escapeHtml(entry.instruction || "")}</strong><p>${api.escapeHtml(entry.summary || "")}</p></li>`).join("")}</ol>` :
        '<p>支持连续调整：赛制、角色、时长和具体内容。修改成功后会在这里保留记录。</p>';
    }
    if (artifact.type === "debate") {
      const field = document.getElementById("artifact-instruction");
      if (field) field.placeholder = "例如：改成三方圆桌，加入家长代表。每次回应再短一些，保留已有材料与评价标准。";
      const suggestions = [
        ["调整形式", "改成多方圆桌讨论，角色要有不同利益与合理立场，保留辩题和已有资料。"],
        ["缩短发言", "把每个角色每次发言的目标长度缩短一半，保持论据具体，其他设置不变。"],
        ["深入追问", "给每个讨论环节增加一次学生追问机会，保留已有角色、材料与评价标准。"],
      ];
      root.querySelectorAll("[data-revision-suggestion]").forEach((button, index) => {
        if (!suggestions[index]) return;
        button.textContent = suggestions[index][0]; button.dataset.revisionSuggestion = suggestions[index][1];
      });
    }
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
    if (reviseButton) {
      const reviseTab = document.getElementById("artifact-tab-revise");
      reviseTab.hidden = !artifact.capabilities?.edit;
      if (reviseTab.hidden && reviseTab.getAttribute("aria-selected") === "true") activateInspectorTab("versions");
      reviseButton.closest("[data-artifact-panel]").hidden = !artifact.capabilities?.edit || reviseTab.getAttribute("aria-selected") !== "true";
    }
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
    const before = data.revision.content || {};
    const after = artifact.revision?.content || {};
    document.getElementById("artifact-compare-changes").innerHTML = window.AISecEduArtifactDiff.markup(window.AISecEduArtifactDiff.changes(before, after), api.escapeHtml);
    document.getElementById("artifact-compare-source").textContent = JSON.stringify(before, null, 2);
    document.getElementById("artifact-compare-current").textContent = JSON.stringify(after, null, 2);
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
    if (label) requestButton.setAttribute("aria-label", label.textContent);
    if (icon) icon.className = terminal ? "fas fa-check" : publishInFlight ? "fas fa-circle-notch fa-spin" : "fas fa-paper-plane";
  }

  async function load() {
    const epoch = progressEpoch;
    const data = unwrap(await api.request(`/teaching/artifacts/${encodeURIComponent(artifactId)}`));
    if (epoch !== progressEpoch) return false;
    artifact = data.artifact;
    if (viewerRole === "teacher") teacherArtifact = artifact;
    adoptProgress(artifact.progressJob || artifact.activeJob || null);
    render();
    if (activeJob && root.dataset.previewState !== "ready") setInspectorOpen(true, { tab: "progress" });
    scheduleProgress(1800);
    return true;
  }

  async function toggleStudentPreview() {
    const button = document.getElementById("artifact-student-preview");
    if (!button || viewerRole !== "teacher") return;
    button.disabled = true;
    try {
      const entering = previewRole !== "student";
      if (entering) {
        stopProgress();
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
        progressSignature = "";
        renderProgress();
      } else {
        previewRole = "teacher";
        await load();
      }
      root.dataset.studentPreview = previewRole === "student" ? "true" : "false";
      button.setAttribute("aria-pressed", String(previewRole === "student"));
      button.querySelector("span").textContent = previewRole === "student" ? "退出学生视图" : "学生视图";
      button.setAttribute("aria-label", button.querySelector("span").textContent);
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
      if (canTrackProgress()) scheduleProgress(1800);
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
        approvalRequest: action.approvalRequest,
      }));
      action = data.action;
    }
    action = await window.AISecEduCommands.waitForAction(action, {
      read: async (id) => unwrap(await api.request(`/teaching/actions/${encodeURIComponent(id)}/decision`)).action,
      onProgress: () => setOperationStatus("progress", "发布正在执行", "批准已保存，正在写入课程；你可以继续浏览页面。"),
    });
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
      if (error.name === "AbortError") return;
      if (error.commandPending) {
        setOperationStatus("progress", "发布仍在执行", error.message);
        notify(error.message, "progress");
        return;
      }
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
      if (root.dataset.previewState !== "ready") setPreviewState("loading", "正在生成内容，可在右侧查看详细进度。");
      renderProgress();
      scheduleProgress(1800);
      return;
    }
    if (artifact.type === "learning-path") {
      renderLearningPathPreview();
      return;
    }
    previewAttempt = retrying ? previewAttempt + 1 : 1;
    previewSequence += 1;
    const sequence = previewSequence;
    previewAwaitingNavigation = true;
    iframe.src = "about:blank";
    setPreviewState("loading", retrying ? "正在重新加载预览…" : "正在加载预览…");
    const target = `/prep/${encodeURIComponent(artifact.id)}`;
    try {
      const data = unwrap(await api.json("POST", "/teaching/runtime/launch", {
        role: previewRole,
        dojoId: artifact.dojoId,
        moduleIndex: artifact.moduleIndex,
        target,
      }));
      if (sequence !== previewSequence) return;
      previewAwaitingNavigation = true;
      iframe.src = data.launchUrl;
      waitForEmbeddedPreview(sequence, Date.now() + 20000);
    } catch (error) {
      if (sequence !== previewSequence) return;
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
      stopProgress();
      progressConnection = "";
      adoptProgress(data.job);
      setInspectorOpen(true, { tab: "progress", focus: true });
      poll();
    } catch (error) { showError(error); button.disabled = false; }
  }

  async function poll() {
    window.clearTimeout(timer);
    if (!canTrackProgress() || pollingEpoch === progressEpoch) return;
    const epoch = progressEpoch;
    pollingEpoch = epoch;
    try {
      const data = unwrap(await api.request(`/teaching/artifacts/${encodeURIComponent(artifactId)}/progress`));
      if (epoch !== progressEpoch || !canTrackProgress()) return;
      const previous = progressJob;
      const nextJob = data.job;
      const wasActive = Boolean(activeJob);
      const changed = previous?.id !== nextJob?.id || previous?.status !== nextJob?.status;
      const revisionChanged = data.currentRevision !== artifact?.currentRevision;
      progressConnection = "";
      progressFailures = 0;
      adoptProgress(nextJob);
      if (!activeJob && (revisionChanged || changed || artifact?.status !== data.artifactStatus)) {
        if (!await load() || epoch !== progressEpoch || !canTrackProgress()) return;
        await launchPreview();
        if (wasActive && nextJob?.status === "SUCCEEDED") {
          const field = document.getElementById("artifact-instruction");
          if (field) field.value = "";
          notify(nextJob.kind === "artifact.revise" ? "新版本生成成功" : "预览生成成功", "success");
        }
      }
    } catch (error) {
      if (epoch !== progressEpoch || !canTrackProgress()) return;
      progressFailures += 1;
      progressConnection = "暂时无法更新进度，正在自动重连。上方保留最后收到的状态；这不表示任务失败。";
      renderProgress();
    } finally {
      if (pollingEpoch === epoch) pollingEpoch = null;
      if (epoch === progressEpoch) scheduleProgress(progressFailures ? Math.min(15000, 1800 * 2 ** Math.min(progressFailures, 3)) : activeJob || artifact?.status === "GENERATING" ? 1800 : 10000);
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
      if (document.fullscreenElement === root) await document.exitFullscreen();
      else await root.requestFullscreen();
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
  document.getElementById("artifact-preview-reload")?.addEventListener("click", () => launchPreview(false).catch(showError));
  document.getElementById("artifact-preview-fullscreen")?.addEventListener("click", togglePreviewFullscreen);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cinematicImmersion) {
      iframe.contentWindow?.postMessage({__aiseceduCinematicPreview: true, action: 'host-exit-immersive'}, window.location.origin);
      setCinematicImmersion(false);
    }
  });
  inspectorToggle?.addEventListener("click", () => setInspectorOpen(root.dataset.inspectorOpen !== "true", { focus: true }));
  inspectorClose?.addEventListener("click", () => { setInspectorOpen(false); inspectorToggle?.focus(); });
  inspectorBackdrop?.addEventListener("click", () => { setInspectorOpen(false); inspectorToggle?.focus(); });
  const openProgress = () => setInspectorOpen(true, { tab: "progress", focus: true });
  progressToggle?.addEventListener("click", openProgress);
  placeholderProgress?.addEventListener("click", openProgress);
  window.addEventListener("resize", syncInspectorModality);
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
    if (!button) return;
    const active = document.fullscreenElement === root;
    button.querySelector("span").textContent = active ? "退出全屏" : "全屏工作区";
    button.querySelector("i").className = active ? "fas fa-compress" : "fas fa-expand";
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && root.dataset.inspectorOpen === "true") {
      setInspectorOpen(false);
      inspectorToggle?.focus();
    }
    if (event.key === "Tab" && inspector?.getAttribute("aria-modal") === "true") {
      const focusable = Array.from(inspector.querySelectorAll('button, a[href], textarea, select, input, [tabindex="0"]')).filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  iframe.addEventListener("load", handlePreviewFrameLoad);
  window.addEventListener("message", handlePreviewMessage);
  window.addEventListener("aisecedu:themechange", syncEmbeddedDebateTheme);
  window.addEventListener("online", () => poll());
  window.addEventListener("pagehide", stopProgress);
  window.addEventListener("pageshow", () => scheduleProgress(100));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
  setInspectorOpen(false);
  load().then(() => launchPreview()).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    setPreviewState("error", message || "内容信息暂时无法读取，请重新加载。");
    showError(error);
  });
})();

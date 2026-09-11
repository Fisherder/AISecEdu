(function () {
  "use strict";

  const api = window.DojoLearning;
  const root = document.getElementById("teacher-agent");
  if (!root || !api) return;

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (window.AISecEdu && window.AISecEdu.dialog) {
      window.AISecEdu.dialog.open(dialog);
      return;
    }
    dialog.hidden = false;
    dialog.setAttribute("aria-hidden", "false");
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (window.AISecEdu && window.AISecEdu.dialog) {
      window.AISecEdu.dialog.close(dialog);
      return;
    }
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
  }

  const elements = {
    dojo: document.getElementById("teaching-dojo"),
    module: document.getElementById("teaching-module"),
    threads: document.getElementById("teaching-thread-list"),
    threadSearch: document.getElementById("teaching-thread-search"),
    title: document.getElementById("teaching-thread-title"),
    notice: document.getElementById("teaching-notice"),
    messages: document.getElementById("teaching-messages"),
    input: document.getElementById("teaching-input"),
    send: document.getElementById("teaching-send"),
    jumpLatest: document.getElementById("teaching-jump-latest"),
    taskCount: document.getElementById("teaching-task-count"),
    type: document.getElementById("teaching-artifact-type"),
    candidateMode: document.getElementById("teaching-candidate-mode"),
    count: document.getElementById("teaching-candidate-count"),
    countRow: document.getElementById("teaching-candidate-count-row"),
    upload: document.getElementById("teaching-upload"),
    uploadTrigger: document.getElementById("teaching-upload-trigger"),
    uploadStatus: document.getElementById("teaching-upload-status"),
    jobList: document.getElementById("teaching-job-list"),
    drawerTitle: document.getElementById("teaching-drawer-title"),
    drawerSubtitle: document.getElementById("teaching-drawer-subtitle"),
    materials: document.getElementById("teaching-material-list"),
    actions: document.getElementById("teaching-action-list"),
    actionSection: document.getElementById("teaching-action-section"),
    progress: document.getElementById("teaching-progress"),
    session: document.getElementById("teaching-session"),
    sessionStart: document.getElementById("teaching-session-start"),
    sessionEnd: document.getElementById("teaching-session-end"),
    sessionOpen: document.getElementById("teaching-session-open"),
    artifacts: document.getElementById("teaching-artifact-list"),
    drawer: document.getElementById("teaching-drawer"),
    drawerOpen: document.getElementById("teaching-drawer-open"),
    drawerClose: document.getElementById("teaching-drawer-close"),
    drawerOverlay: document.getElementById("teaching-drawer-overlay"),
    taskCourseFilter: document.getElementById("teaching-task-course-filter"),
    taskTypeFilter: document.getElementById("teaching-task-type-filter"),
    taskStatusFilter: document.getElementById("teaching-task-status-filter"),
    taskFilterReset: document.getElementById("teaching-task-filter-reset"),
    sidebar: document.getElementById("teaching-sidebar"),
    sidebarToggle: document.getElementById("teaching-sidebar-toggle"),
    sidebarCollapse: document.getElementById("teaching-sidebar-collapse"),
    sidebarOverlay: document.getElementById("teaching-sidebar-overlay"),
    quickButtons: Array.from(document.querySelectorAll("[data-quick-action]")),
    quickScopeDialog: document.getElementById("teaching-quick-scope-dialog"),
    quickScopeForm: document.getElementById("teaching-quick-scope-form"),
    quickScopeTitle: document.getElementById("teaching-quick-scope-title"),
    quickScopeCourse: document.getElementById("teaching-quick-scope-course"),
    quickScopeModes: document.getElementById("teaching-quick-scope-modes"),
    quickScopeModuleMode: document.getElementById(
      "teaching-quick-scope-module-mode",
    ),
    quickScopeModuleRow: document.getElementById(
      "teaching-quick-scope-module-row",
    ),
    quickScopeModule: document.getElementById("teaching-quick-scope-module"),
    quickScopeDetail: document.getElementById("teaching-quick-scope-detail"),
    quickScopeClose: document.getElementById("teaching-quick-scope-close"),
    quickScopeCancel: document.getElementById("teaching-quick-scope-cancel"),
    quickScopeConfirm: document.getElementById("teaching-quick-scope-confirm"),
    generationConfirmDialog: document.getElementById(
      "teaching-generation-confirm-dialog",
    ),
    generationConfirmForm: document.getElementById(
      "teaching-generation-confirm-form",
    ),
    generationConfirmContext: document.getElementById(
      "teaching-generation-confirm-context",
    ),
    generationConfirmSummary: document.getElementById(
      "teaching-generation-confirm-summary",
    ),
    generationConfirmItems: document.getElementById(
      "teaching-generation-confirm-items",
    ),
    generationConfirmError: document.getElementById(
      "teaching-generation-confirm-error",
    ),
    generationConfirmClose: document.getElementById(
      "teaching-generation-confirm-close",
    ),
    generationConfirmCancel: document.getElementById(
      "teaching-generation-confirm-cancel",
    ),
    generationConfirmSubmit: document.getElementById(
      "teaching-generation-confirm-submit",
    ),
    threadActionMenu: document.getElementById("teaching-thread-action-menu"),
    pinLabel: document.getElementById("teaching-pin-label"),
    archivedBanner: document.getElementById("teaching-archived-banner"),
    restoreThread: document.getElementById("teaching-restore-thread"),
    approvalTray: document.getElementById("teaching-approval-tray"),
    candidateGrid: document.getElementById("candidate-modal-grid"),
    candidateNotice: document.getElementById("candidate-modal-notice"),
    deriveInstruction: document.getElementById("candidate-derive-instruction"),
    deriveBox: document.getElementById("candidate-derive-box"),
    materialNotice: document.getElementById("material-modal-notice"),
    materialSummary: document.getElementById("material-summary"),
    materialFunctions: document.getElementById("material-functions"),
    materialGraph: document.getElementById("material-graph"),
    materialChapters: document.getElementById("material-chapters"),
    materialSources: document.getElementById("material-sources"),
    conversation: root.querySelector(".teaching-conversation"),
    dashboard: document.getElementById("teaching-dashboard"),
    dashboardUpdated: document.getElementById("teaching-dashboard-updated"),
    dashboardNotice: document.getElementById("teaching-dashboard-notice"),
    dashboardCourse: document.getElementById("teaching-dashboard-course"),
    dashboardModule: document.getElementById("teaching-dashboard-module"),
    dashboardInput: document.getElementById("teaching-dashboard-input"),
    dashboardSend: document.getElementById("teaching-dashboard-send"),
    dashboardConversations: document.getElementById(
      "teaching-dashboard-conversations",
    ),
    dashboardAttention: document.getElementById(
      "teaching-dashboard-attention",
    ),
    dashboardAttentionCount: document.getElementById(
      "teaching-dashboard-attention-count",
    ),
    dashboardTasks: document.getElementById("teaching-dashboard-tasks"),
    dashboardActiveCount: document.getElementById(
      "teaching-dashboard-active-count",
    ),
    dashboardCourses: document.getElementById("teaching-dashboard-courses"),
    dashboardLearning: document.getElementById("teaching-dashboard-learning"),
    dashboardQuickButtons: Array.from(
      document.querySelectorAll("[data-dashboard-prompt]"),
    ),
    dashboardMoreActions: document.getElementById(
      "teaching-dashboard-more-actions",
    ),
  };

  const validNavigationPhases = new Set([
    "PRE_CLASS",
    "IN_CLASS",
    "POST_CLASS",
  ]);
  const requestedNavigationPhase = new URLSearchParams(
    window.location.search,
  ).get("phase");
  const navigationPhase = validNavigationPhases.has(requestedNavigationPhase)
    ? requestedNavigationPhase
    : null;

  const state = {
    context: null,
    thread: null,
    threads: [],
    threadQuery: "",
    threadRequest: 0,
    threadSearchTimer: null,
    threadActionTargetId: null,
    busy: true,
    phase: navigationPhase || "COURSE_SETUP",
    trackedJobs: new Map(),
    taskCenterJobs: new Map(),
    taskCenterBatches: new Map(),
    taskCenterLoading: false,
    taskCenterLoadedAt: null,
    taskCenterLimit: 50,
    taskCenterPaging: {
      offset: 0,
      limit: 50,
      returned: 0,
      nextOffset: null,
      hasNext: false,
    },
    taskFilters: { course: "", type: "", status: "" },
    selectedJobId: null,
    expandedJobIds: new Set(),
    candidateSet: null,
    activeSession: null,
    sourceMaterialIds: new Set(),
    pendingMaterialIds: new Set(),
    material: null,
    pollTimer: null,
    polling: false,
    pollDelayMs: 1800,
    lastActivePollSignature: "",
    appliedActionProposals: new Set(),
    executingProposalKeys: new Set(),
    proposalFailures: new Map(),
    selectingGenerationOptions: new Set(),
    pendingGenerationConfirmation: null,
    generationOptionViews: new Map(),
    autoExecuteJobIds: new Set(),
    continuationRequests: new Set(),
    actions: [],
    forceScrollToLatest: true,
    lastTranscriptSignature: "",
    newContentAvailable: false,
    stoppingJobId: null,
    retryingJobIds: new Set(),
    resolvingApprovalKeys: new Set(),
    quickScopeTrigger: null,
    uploadFlow: null,
    uploadFlowSequence: 0,
    uploadStatusTimer: null,
    progressClockTimer: null,
    lastJobListSignature: "",
    renderedJobProgress: new Map(),
    dashboard: null,
    dashboardLoading: false,
    dashboardMode: false,
    dashboardRefreshTimer: null,
    dashboardRefreshDelayMs: 5000,
    dashboardActiveSignature: "",
    dashboardLearningLoading: false,
    dashboardLearningLoadedAt: 0,
    dashboardQuickExpanded: false,
    overlayReturnFocus: null,
  };

  const uploadLimitBytes = 50 * 1024 * 1024;
  const uploadSuffixes = new Set([
    ".doc",
    ".docx",
    ".jpeg",
    ".jpg",
    ".md",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".txt",
    ".webp",
  ]);

  function unwrap(payload) {
    if (!payload || payload.success !== true) {
      throw new Error(api.errorMessage(payload, "请求失败"));
    }
    return payload.data || {};
  }

  function syncAttachmentSources(thread) {
    const context = (thread && thread.context) || {};
    const attachments = Array.isArray(context.pendingAttachments)
      ? context.pendingAttachments
      : [];
    state.pendingMaterialIds = new Set(
      attachments
        .filter((item) =>
          ["AWAITING_INTENT", "ACTIVE", "REFERENCED"].includes(
            String((item && item.status) || "").toUpperCase(),
          ),
        )
        .map((item) => String(item.id || ""))
        .filter(Boolean),
    );
  }

  function uploadFileSizeLabel(size) {
    const bytes = Number(size || 0);
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  function uploadFlowBusy() {
    return Boolean(
      state.uploadFlow &&
      ["uploading", "sending"].includes(state.uploadFlow.phase),
    );
  }

  function validateUploadFile(file) {
    if (!file || !file.name) return "请选择要上传的文件。";
    if (!Number(file.size || 0)) return "文件为空，无法交给智能体处理。";
    if (Number(file.size) > uploadLimitBytes)
      return "文件超过 50 MB，请压缩或拆分后再上传。";
    const name = String(file.name || "");
    const dot = name.lastIndexOf(".");
    const suffix = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    if (!uploadSuffixes.has(suffix))
      return "不支持这种文件格式。请选择 PDF、Office 文档、文本或常见图片文件。";
    return "";
  }

  function renderUploadStatus() {
    const flow = state.uploadFlow;
    if (!flow) {
      elements.uploadStatus.hidden = true;
      elements.uploadStatus.innerHTML = "";
      elements.uploadStatus.className = "teaching-upload-status";
      elements.uploadStatus.setAttribute("role", "status");
      elements.uploadStatus.setAttribute("aria-live", "polite");
      return;
    }
    const phases = {
      uploading: {
        title: "正在上传文件",
        detail: "正在安全保存原文件，请稍候…",
        icon: "fa-circle-notch fa-spin",
      },
      sending: {
        title: "文件已上传",
        detail: "正在结合输入的命令继续处理…",
        icon: "fa-circle-notch fa-spin",
      },
      ready: {
        title: "文件已上传",
        detail: "请在对话中选择添加位置或要创建的内容。",
        icon: "fa-check",
      },
      "upload-error": {
        title: "文件上传失败",
        detail: flow.error || "请检查网络后重试。",
        icon: "fa-exclamation-circle",
      },
      "send-error": {
        title: "文件已上传，但命令尚未发出",
        detail: flow.error || "可以只重新发送命令，无需重复上传文件。",
        icon: "fa-exclamation-circle",
      },
    };
    const presentation = phases[flow.phase] || phases.uploading;
    const failed = ["upload-error", "send-error"].includes(flow.phase);
    const retryLabel =
      flow.phase === "send-error" ? "重新发送命令" : "重新上传";
    elements.uploadStatus.hidden = false;
    elements.uploadStatus.className = `teaching-upload-status is-${flow.phase}`;
    elements.uploadStatus.setAttribute("role", failed ? "alert" : "status");
    elements.uploadStatus.setAttribute(
      "aria-live",
      failed ? "assertive" : "polite",
    );
    elements.uploadStatus.innerHTML = `<span class="teaching-upload-status-icon"><i class="fas ${presentation.icon}" aria-hidden="true"></i></span>
      <span class="teaching-upload-status-copy"><strong>${api.escapeHtml(presentation.title)}</strong><small>${api.escapeHtml(flow.file.name)} · ${api.escapeHtml(uploadFileSizeLabel(flow.file.size))}</small><span>${api.escapeHtml(presentation.detail)}</span></span>
      ${failed ? `<span class="teaching-upload-status-actions"><button type="button" data-upload-retry>${api.escapeHtml(retryLabel)}</button><button type="button" data-upload-dismiss aria-label="移除这条上传提示">移除</button></span>` : ""}
      ${flow.phase === "uploading" ? '<span class="teaching-upload-progress" role="progressbar" aria-label="文件正在上传"><span></span></span>' : ""}`;
    const retry = elements.uploadStatus.querySelector("[data-upload-retry]");
    if (retry)
      retry.addEventListener("click", () => retryUploadFlow().catch(showError));
    const dismiss = elements.uploadStatus.querySelector(
      "[data-upload-dismiss]",
    );
    if (dismiss) dismiss.addEventListener("click", () => clearUploadFlow());
  }

  function setUploadFlow(flow) {
    window.clearTimeout(state.uploadStatusTimer);
    state.uploadStatusTimer = null;
    state.uploadFlow = flow;
    renderUploadStatus();
    syncComposerState();
  }

  function clearUploadFlow(expectedId) {
    if (
      expectedId &&
      state.uploadFlow &&
      String(state.uploadFlow.id) !== String(expectedId)
    )
      return;
    window.clearTimeout(state.uploadStatusTimer);
    state.uploadStatusTimer = null;
    state.uploadFlow = null;
    renderUploadStatus();
    syncComposerState();
  }

  function dismissSuccessfulUpload(flowId) {
    window.clearTimeout(state.uploadStatusTimer);
    state.uploadStatusTimer = window.setTimeout(
      () => clearUploadFlow(flowId),
      2400,
    );
  }

  function setBusy(value) {
    state.busy = value;
    syncComposerState();
    updateAgentChrome();
  }

  function syncComposerState() {
    const archived = Boolean(
      state.thread && state.thread.status === "ARCHIVED",
    );
    const activeJob = primaryActiveJob();
    const stopping = Boolean(
      activeJob &&
      (String(state.stoppingJobId || "") === String(activeJob.id) ||
        String(activeJob.status || "").toUpperCase() === "CANCEL_REQUESTED"),
    );
    const uploading = uploadFlowBusy();
    const uploadDisabled =
      state.busy || archived || Boolean(activeJob) || uploading;
    elements.archivedBanner.hidden = !archived;
    elements.input.disabled = archived || uploading;
    elements.upload.disabled = uploadDisabled;
    elements.uploadTrigger.disabled = uploadDisabled;
    elements.uploadTrigger.classList.toggle("is-disabled", uploadDisabled);
    elements.uploadTrigger.setAttribute(
      "aria-disabled",
      String(uploadDisabled),
    );
    root
      .querySelectorAll("#teaching-new-thread, [data-thread-open]")
      .forEach((button) => {
        button.disabled = uploading;
      });
    elements.dojo.disabled = uploading;
    elements.module.disabled = uploading;
    elements.quickButtons.forEach((button) => {
      button.disabled = state.busy || archived;
    });
    elements.send.disabled =
      state.busy ||
      archived ||
      (activeJob ? stopping : !elements.input.value.trim());
    elements.send.classList.toggle("is-stop", Boolean(activeJob));
    elements.send.setAttribute(
      "aria-label",
      activeJob ? "停止当前任务" : "发送消息",
    );
    elements.send.title = activeJob ? "停止当前任务" : "发送消息";
    elements.send.innerHTML = activeJob
      ? `<i class="fas ${stopping ? "fa-circle-notch fa-spin" : "fa-stop"}" aria-hidden="true"></i>`
      : '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
    elements.input.placeholder = archived
      ? "此对话已归档"
      : uploading
        ? state.uploadFlow.phase === "sending"
          ? "文件已上传，正在发送命令…"
          : "文件上传中…"
        : activeJob
          ? "当前任务执行中；可以先在这里准备下一条要求…"
          : "告诉智能体你要完成什么教学工作…";
    root.classList.toggle("is-thread-archived", archived);
    root.classList.toggle("has-active-run", Boolean(activeJob));
    elements.messages.setAttribute("aria-busy", String(Boolean(activeJob)));
  }

  function showError(error) {
    api.showNotice(
      elements.notice,
      error instanceof Error ? error.message : String(error),
      "danger",
    );
  }

  function currentDojo() {
    const id = Number(elements.dojo.value || 0);
    return (
      ((state.context && state.context.teacherDojos) || []).find(
        (item) => item.id === id,
      ) || null
    );
  }

  function populateDojos(selected) {
    const rows = state.context.teacherDojos || [];
    elements.dojo.innerHTML =
      '<option value="">由对话自动识别</option>' +
      rows
        .map(
          (dojo) =>
            `<option value="${dojo.id}">${api.escapeHtml(dojo.name)}</option>`,
        )
        .join("");
    elements.dojo.value =
      selected && rows.some((item) => item.id === Number(selected))
        ? String(selected)
        : "";
    populateModules(state.thread && state.thread.moduleIndex);
  }

  function populateModules(selected) {
    const dojo = currentDojo();
    const rows = dojo ? dojo.modules || [] : [];
    elements.module.innerHTML =
      '<option value="">整门课程</option>' +
      rows
        .map(
          (module) =>
            `<option value="${module.index}">${api.escapeHtml(module.name || "未命名章节")}</option>`,
        )
        .join("");
    if (
      selected !== null &&
      typeof selected !== "undefined" &&
      rows.some((item) => item.index === Number(selected))
    ) {
      elements.module.value = String(selected);
    }
    syncContextLinks();
  }

  function quickScopeCourse() {
    const id = Number(elements.quickScopeCourse.value || 0);
    return (
      ((state.context && state.context.teacherDojos) || []).find(
        (item) => Number(item.id) === id,
      ) || null
    );
  }

  function quickScopeMode() {
    const selected = elements.quickScopeForm.querySelector(
      '[name="teaching-quick-scope-mode"]:checked',
    );
    return selected ? selected.value : "course";
  }

  function populateQuickScopeModules(selected) {
    const dojo = quickScopeCourse();
    const rows = dojo ? dojo.modules || [] : [];
    elements.quickScopeModule.innerHTML = rows
      .map(
        (module) =>
          `<option value="${module.index}">${api.escapeHtml(module.name || "未命名章节")}</option>`,
      )
      .join("");
    const requested = String(selected ?? "");
    if (rows.some((item) => String(item.index) === requested)) {
      elements.quickScopeModule.value = requested;
    }
    elements.quickScopeModuleMode.disabled = rows.length === 0;
    if (!rows.length && quickScopeMode() === "module") {
      const wholeCourse = elements.quickScopeForm.querySelector(
        '[name="teaching-quick-scope-mode"][value="course"]',
      );
      if (wholeCourse) wholeCourse.checked = true;
    }
    syncQuickScopeFields();
  }

  function syncQuickScopeFields() {
    const dojo = quickScopeCourse();
    const moduleMode = Boolean(dojo) && quickScopeMode() === "module";
    elements.quickScopeModes.hidden = !dojo;
    elements.quickScopeModuleRow.hidden = !moduleMode;
    elements.quickScopeModule.disabled = !moduleMode;
  }

  function populateQuickScopeCourses(selectedDojo, selectedModule) {
    const rows = (state.context && state.context.teacherDojos) || [];
    elements.quickScopeCourse.innerHTML =
      '<option value="">不限定课程（自由描述）</option>' +
      rows
        .map(
          (dojo) =>
            `<option value="${dojo.id}">${api.escapeHtml(dojo.name || "未命名课程")}</option>`,
        )
        .join("");
    const requestedDojo = String(selectedDojo || "");
    elements.quickScopeCourse.value = rows.some(
      (item) => String(item.id) === requestedDojo,
    )
      ? requestedDojo
      : "";
    const requestedModule = String(selectedModule ?? "");
    const moduleMode = Boolean(requestedDojo && requestedModule !== "");
    const targetMode = elements.quickScopeForm.querySelector(
      `[name="teaching-quick-scope-mode"][value="${moduleMode ? "module" : "course"}"]`,
    );
    if (targetMode) targetMode.checked = true;
    populateQuickScopeModules(requestedModule);
  }

  function closeQuickScope(returnFocus) {
    const trigger = state.quickScopeTrigger;
    state.quickScopeTrigger = null;
    if (elements.quickScopeDialog.open) elements.quickScopeDialog.close();
    else elements.quickScopeDialog.removeAttribute("open");
    if (returnFocus !== false && trigger && trigger.isConnected) {
      trigger.focus();
    }
  }

  function openQuickScope(button) {
    if (!state.context || state.busy) {
      api.showNotice(elements.notice, "课程列表正在准备，请稍后再试。", "info");
      return;
    }
    state.quickScopeTrigger = button;
    const label = button.querySelector("span");
    elements.quickScopeTitle.textContent = label
      ? label.textContent.trim()
      : "选择任务范围";
    elements.quickScopeDetail.value = "";
    elements.quickScopeDetail.placeholder =
      button.dataset.detailPlaceholder || "补充希望智能体遵循的具体要求";
    populateQuickScopeCourses(elements.dojo.value, elements.module.value);
    if (typeof elements.quickScopeDialog.showModal === "function") {
      if (!elements.quickScopeDialog.open)
        elements.quickScopeDialog.showModal();
    } else {
      elements.quickScopeDialog.setAttribute("open", "");
    }
    window.setTimeout(() => elements.quickScopeCourse.focus(), 0);
  }

  function quickScopePrompt(button, dojo, module) {
    const command = String(button.dataset.command || "完成这项教学任务")
      .trim()
      .replace(/[。.!！]+$/, "");
    let prompt = "帮我";
    if (dojo && module) {
      prompt += `为课程“${dojo.name}”的章节“${module.name || "未命名章节"}”`;
    } else if (dojo) {
      prompt += `为整门课程“${dojo.name}”`;
    }
    prompt += command;
    const detail = elements.quickScopeDetail.value.trim();
    if (detail) prompt += `。补充要求：${detail.replace(/[。.!！]+$/, "")}`;
    return `${prompt}。`;
  }

  async function applyQuickScope() {
    const button = state.quickScopeTrigger;
    if (!button || !state.thread) return;
    const dojo = quickScopeCourse();
    const useModule = Boolean(dojo) && quickScopeMode() === "module";
    const module = useModule
      ? (dojo.modules || []).find(
          (item) => String(item.index) === elements.quickScopeModule.value,
        ) || null
      : null;
    if (useModule && !module) {
      elements.quickScopeModule.setCustomValidity("请选择一个章节");
      elements.quickScopeModule.reportValidity();
      elements.quickScopeModule.focus();
      return;
    }
    elements.quickScopeModule.setCustomValidity("");
    const prompt = quickScopePrompt(button, dojo, module);
    const oldDojo = elements.dojo.value;
    const oldModule = elements.module.value;
    const nextDojo = dojo ? String(dojo.id) : "";
    const nextModule = module ? String(module.index) : "";
    const contextChanged = oldDojo !== nextDojo || oldModule !== nextModule;
    elements.quickScopeConfirm.disabled = true;
    try {
      elements.dojo.value = nextDojo;
      populateModules(module ? module.index : null);
      elements.module.value = nextModule;
      if (contextChanged) await saveContext();
      elements.type.value = button.dataset.artifact || "auto";
      elements.input.value = prompt;
      closeQuickScope(false);
      elements.input.focus();
      elements.input.setSelectionRange(prompt.length, prompt.length);
      resizeComposer();
      syncComposerState();
    } catch (error) {
      elements.dojo.value = oldDojo;
      populateModules(oldModule === "" ? null : Number(oldModule));
      showError(error);
    } finally {
      elements.quickScopeConfirm.disabled = false;
    }
  }

  function syncContextLinks() {
    const dojo = currentDojo();
    const studioLink = document.getElementById("teaching-studio-open");
    if (dojo && dojo.referenceId) {
      if (studioLink)
        studioLink.href = `/${encodeURIComponent(dojo.referenceId)}`;
    } else {
      if (studioLink) studioLink.href = "/dojos";
    }
  }

  const statusLabels = {
    QUEUED: "等待处理",
    RUNNING: "正在生成",
    COMPLETED: "已经完成",
    READY: "可以使用",
    SELECTED: "已经选择",
    MATERIALIZED: "已经生成",
    FAILED: "处理失败",
    CANCELED: "已经取消",
    GENERATING: "正在生成",
    MATERIALIZING: "正在生成可预览内容",
    VALIDATING: "正在验证",
    NEEDS_REVIEW: "等待审核",
    PARTIAL_SUCCESS: "部分完成",
    WAITING_CONFIRMATION: "等待确认",
    PUBLISHED: "已发布",
  };

  function statusLabel(value) {
    const status = String(value || "").toUpperCase();
    return statusLabels[status] || value || "准备就绪";
  }

  function teacherReturnPath() {
    const pathname = window.location.pathname;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return pathname === "/teacher" || pathname.startsWith("/teacher/")
      ? path
      : "/teacher";
  }

  function teacherArtifactHref(artifactId, parameters) {
    const search = new URLSearchParams(parameters || {});
    search.set("return", teacherReturnPath());
    return `/teacher/artifacts/${encodeURIComponent(artifactId)}?${search.toString()}`;
  }

  function internalHref(value, fallback) {
    const href = String(value || "");
    if (!href.startsWith("/") || href.startsWith("//")) return fallback;
    const target = new URL(href, window.location.origin);
    if (
      target.pathname.startsWith("/teacher/artifacts/") &&
      !target.searchParams.has("return") &&
      !target.searchParams.has("returnTo")
    ) {
      target.searchParams.set("return", teacherReturnPath());
      return `${target.pathname}${target.search}${target.hash}`;
    }
    return href;
  }

  function dashboardEmpty(icon, title, detail) {
    return `<div class="teaching-dashboard-empty"><i class="fas ${api.escapeHtml(icon)}" aria-hidden="true"></i><strong>${api.escapeHtml(title)}</strong><p>${api.escapeHtml(detail)}</p></div>`;
  }

  function dashboardCourseById(value) {
    const id = Number(value || 0);
    return ((state.context && state.context.teacherDojos) || []).find(
      (item) => Number(item.id) === id,
    );
  }

  function populateDashboardModules(selected) {
    if (!elements.dashboardModule) return;
    const dojo = dashboardCourseById(
      elements.dashboardCourse && elements.dashboardCourse.value,
    );
    const modules = dojo ? dojo.modules || [] : [];
    elements.dashboardModule.innerHTML =
      '<option value="">整门课程</option>' +
      modules
        .map(
          (module) =>
            `<option value="${module.index}">${api.escapeHtml(module.name || "未命名章节")}</option>`,
        )
        .join("");
    if (
      selected !== null &&
      typeof selected !== "undefined" &&
      modules.some((module) => Number(module.index) === Number(selected))
    ) {
      elements.dashboardModule.value = String(selected);
    }
  }

  function populateDashboardCourses(selectedDojo, selectedModule) {
    if (!elements.dashboardCourse) return;
    const rows = (state.context && state.context.teacherDojos) || [];
    elements.dashboardCourse.innerHTML =
      '<option value="">不限定课程 · 先讨论教学想法</option>' +
      rows
        .map(
          (dojo) =>
            `<option value="${dojo.id}">${api.escapeHtml(dojo.name)}</option>`,
        )
        .join("");
    const preferred =
      selectedDojo ||
      (state.dashboard &&
        state.dashboard.recentCourses &&
        state.dashboard.recentCourses[0] &&
        state.dashboard.recentCourses[0].id);
    if (preferred && rows.some((dojo) => Number(dojo.id) === Number(preferred))) {
      elements.dashboardCourse.value = String(preferred);
    }
    populateDashboardModules(selectedModule);
  }

  function dashboardActionLabel(item) {
    const labels = {
      confirm_plan: "确认计划",
      retry_failed: "重试失败项",
      review_results: "审核结果",
      open_task: "查看任务",
      review_learning: "查看学情",
      handle_attention: "继续处理",
      continue_course: "进入课程",
      retry_validation: "重新验证",
      retry_generation: "重新生成",
      review: "审核",
      open: "打开",
    };
    return labels[item.nextAction] || "查看";
  }

  function dashboardRowHref(item, fallback) {
    if (item && item.href) return internalHref(item.href, fallback);
    if (item && item.threadId)
      return `/teacher?thread=${encodeURIComponent(item.threadId)}`;
    return fallback;
  }

  function renderDashboard() {
    if (!elements.dashboard || !state.dashboard) return;
    const data = state.dashboard;
    const attention = data.attention || [];
    const tasks = data.activeTasks || [];
    const courses = data.recentCourses || [];
    const learning = data.learningChanges || [];
    const learningState = (data.components || {}).learningChanges;
    elements.dashboardAttentionCount.textContent = String(
      Number((data.counts || {}).attention ?? attention.length),
    );
    elements.dashboardActiveCount.textContent = String(
      Number((data.counts || {}).activeTasks ?? tasks.length),
    );
    elements.dashboardUpdated.textContent = data.asOf
      ? `截至 ${new Date(data.asOf).toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })} · ${Number(data.evidenceCount || 0)} 条内容证据`
      : "已按最新课程事实汇总";

    elements.dashboardAttention.innerHTML = attention.length
      ? attention
          .slice(0, 8)
          .map((item) => {
            const course = item.course || {};
            const scope = `${course.name || "未指定课程"}${item.module && item.module.name ? ` · ${item.module.name}` : ""}`;
            const progress = item.requestedCount
              ? `${scope} · 目标 ${Number(item.requestedCount || 0)} · 已创建 ${Number(item.createdCount || 0)} · 已验证 ${Number(item.validatedCount || 0)} · 失败 ${Number(item.failedCount || 0)}`
              : scope;
            return `<article class="teaching-dashboard-row"><div><strong>${api.escapeHtml(item.title || "待处理事项")}</strong><small>${api.escapeHtml(progress)}</small><em>${api.escapeHtml(statusLabel(item.status))}</em></div><a href="${api.escapeHtml(dashboardRowHref(item, "/teacher/courses"))}">${api.escapeHtml(dashboardActionLabel(item))}<i class="fas fa-arrow-right" aria-hidden="true"></i></a></article>`;
          })
          .join("")
      : dashboardEmpty(
          "fa-check-circle",
          "当前没有待处理事项",
          "发布检查、失败任务和待确认计划会出现在这里。",
        );
    elements.dashboardAttention.setAttribute("aria-busy", "false");

    elements.dashboardTasks.innerHTML = tasks.length
      ? tasks
          .slice(0, 8)
          .map((item) => {
            const requested = Number(item.requestedCount || 1);
            const scope = `${(item.course && item.course.name) || "未指定课程"}${item.module && item.module.name ? ` · ${item.module.name}` : ""}`;
            const progress = item.kind === "generation_batch"
              ? `目标 ${requested} · 已创建 ${Number(item.createdCount || 0)} · 已验证 ${Number(item.validatedCount || 0)} · ${formatJobDuration(Number(item.elapsedSeconds || 0))}`
              : `${statusLabel(item.status)} · ${formatJobDuration(Number(item.elapsedSeconds || 0))}`;
            return `<article class="teaching-dashboard-row"><div><strong>${api.escapeHtml(item.title || "教学任务")}</strong><small>${api.escapeHtml(`${scope} · ${progress}`)}</small><em>${api.escapeHtml(statusLabel(item.status))}</em></div><a href="${api.escapeHtml(dashboardRowHref(item, "/teacher"))}">查看任务<i class="fas fa-arrow-right" aria-hidden="true"></i></a></article>`;
          })
          .join("")
      : dashboardEmpty(
          "fa-layer-group",
          "没有正在执行的 AI 任务",
          "开始任务后可离开页面，进度会持续保存在这里。",
        );
    elements.dashboardTasks.setAttribute("aria-busy", "false");

    elements.dashboardCourses.innerHTML = courses.length
      ? courses
          .slice(0, 8)
          .map((course) => {
            const counts = course.counts || {};
            const questionCount = Number((counts.questions || {}).total || 0);
            const coursewareCount = Number((counts.courseware || {}).total || 0);
            const demoCount = Number((counts.demos || {}).total || 0);
            return `<article class="teaching-dashboard-course-row"><div><strong>${api.escapeHtml(course.name || "未命名课程")}</strong><small>${api.escapeHtml(`${Number(course.studentCount || 0)} 名学生 · ${Number(course.moduleCount || 0)} 个章节${course.attentionCount ? ` · ${Number(course.attentionCount)} 项待处理` : ""}`)}</small></div><div class="teaching-dashboard-course-counts"><span>${questionCount} 道题</span><span>${coursewareCount} 份课件</span><span>${demoCount} 个演示</span></div><a href="${api.escapeHtml(internalHref(course.href, "/teacher/courses"))}">继续课程<i class="fas fa-arrow-right" aria-hidden="true"></i></a></article>`;
          })
          .join("")
      : dashboardEmpty(
          "fa-book-open",
          "还没有可管理的课程",
          "先在课程中心创建课程，再开始准备教学内容。",
        );
    elements.dashboardCourses.setAttribute("aria-busy", "false");

    elements.dashboardLearning.innerHTML = learningState === "degraded" && !learning.length
      ? dashboardEmpty(
          "fa-exclamation-circle",
          "学情分析暂时不可用",
          "核心工作台不受影响，系统会在下一次刷新时重新尝试。",
        )
      : learningState === "deferred" && !learning.length
      ? dashboardEmpty(
          "fa-circle-notch fa-spin",
          "正在补充学情变化",
          "核心工作台已经可用，深度证据分析会在后台继续加载。",
        )
      : learning.length
      ? learning
          .slice(0, 8)
          .map((item) => {
            const course = item.course || {};
            const confidence = { high: "高", medium: "中", low: "低" }[
              item.confidence
            ] || "未知";
            const summary = `${Number(item.highRiskCount || 0)} 名高风险 · ${Number(item.watchCount || 0)} 名需观察 · ${Number(item.stalledCount || 0)} 名停滞 · ${Number(item.evidenceCount || 0)} 条证据 · 置信度${confidence}`;
            return `<article class="teaching-dashboard-learning-row"><div><strong>${api.escapeHtml(course.name || "未命名课程")}</strong><small>${api.escapeHtml(summary)}</small></div><a href="${api.escapeHtml(internalHref(item.href, "/teacher/courses"))}">查看证据<i class="fas fa-arrow-right" aria-hidden="true"></i></a></article>`;
          })
          .join("")
      : dashboardEmpty(
          "fa-chart-line",
          "暂无需要介入的学情变化",
          "只有基于真实作答证据的异常、停滞与趋势才会显示。",
        );
    elements.dashboardLearning.setAttribute(
      "aria-busy",
      String(learningState === "deferred"),
    );
    document.dispatchEvent(new CustomEvent("teaching:dashboard", { detail: { courses: (state.context && state.context.teacherDojos) || [] } }));
  }

  function setDashboardMode(open) {
    if (!elements.dashboard) return;
    const enabled = Boolean(open);
    state.dashboardMode = enabled;
    root.classList.toggle("is-dashboard", enabled);
    elements.dashboard.hidden = !enabled;
    elements.dashboard.inert = !enabled;
    elements.dashboard.setAttribute("aria-hidden", String(!enabled));
    elements.conversation.inert = enabled;
    elements.conversation.setAttribute("aria-hidden", String(enabled));
    elements.sidebar.inert = enabled;
    elements.sidebar.setAttribute("aria-hidden", String(enabled));
    if (enabled) {
      setSidebar(false);
      setDrawer(false, { restoreFocus: false });
      document.title = "教师工作台 · 玄甲";
    } else {
      elements.sidebar.inert = false;
      elements.sidebar.setAttribute("aria-hidden", "false");
      document.title = `${(state.thread && state.thread.title) || "AI 教学助手"} · 玄甲`;
    }
  }

  async function loadDashboardLearning(force) {
    if (!state.dashboard || state.dashboardLearningLoading || !state.dashboardMode || document.hidden) return;
    const now = Date.now();
    if (!force && state.dashboardLearningLoadedAt && now - state.dashboardLearningLoadedAt < 45000) return;
    state.dashboardLearningLoading = true;
    try {
      const data = unwrap(await api.request("/teaching/dashboard?view=learning"));
      if (!state.dashboard || !state.dashboardMode) return;
      state.dashboard.learningChanges = data.learningChanges || [];
      state.dashboard.components = {
        ...(state.dashboard.components || {}),
        learningChanges: "ready",
      };
      state.dashboardLearningLoadedAt = Date.now();
      renderDashboard();
    } catch (error) {
      if (!state.dashboard) return;
      state.dashboard.components = {
        ...(state.dashboard.components || {}),
        learningChanges: "degraded",
      };
      renderDashboard();
    } finally {
      state.dashboardLearningLoading = false;
    }
  }

  async function loadDashboard() {
    if (!elements.dashboard || state.dashboardLoading) return;
    if (document.hidden) {
      scheduleDashboardRefresh();
      return;
    }
    state.dashboardLoading = true;
    elements.dashboardSend.disabled = true;
    const taskCenterPromise = loadTaskCenter({ silent: true }).catch((error) => {
      console.warn("Unable to refresh the teaching task center", error);
    });
    try {
      const data = unwrap(await api.request("/teaching/dashboard?view=core"));
      if (state.dashboardLearningLoadedAt && state.dashboard) {
        data.learningChanges = state.dashboard.learningChanges || [];
        data.components = {
          ...(data.components || {}),
          learningChanges: "ready",
        };
      }
      state.dashboard = data;
      renderDashboard();
      populateDashboardCourses(
        elements.dashboardCourse.value,
        elements.dashboardModule.value,
      );
      void taskCenterPromise;
      api.showNotice(elements.dashboardNotice, "", "info");
      const scheduleLearning = () => loadDashboardLearning(false);
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(scheduleLearning, { timeout: 1200 });
      } else {
        window.setTimeout(scheduleLearning, 80);
      }
      const activeSignature = (data.activeTasks || [])
        .map((item) => `${item.id || item.jobId || ""}:${item.status || ""}:${item.progress || 0}`)
        .sort()
        .join("|");
      state.dashboardRefreshDelayMs = activeSignature !== state.dashboardActiveSignature
        ? 5000
        : Math.min(20000, Math.round(state.dashboardRefreshDelayMs * 1.6));
      state.dashboardActiveSignature = activeSignature;
      scheduleDashboardRefresh();
    } catch (error) {
      api.showNotice(
        elements.dashboardNotice,
        error instanceof Error ? error.message : String(error),
        "danger",
      );
    } finally {
      state.dashboardLoading = false;
      elements.dashboardSend.disabled = !elements.dashboardInput.value.trim();
    }
  }

  function scheduleDashboardRefresh() {
    window.clearTimeout(state.dashboardRefreshTimer);
    const hasActive = Boolean(state.dashboard && (state.dashboard.activeTasks || []).length);
    if (!state.dashboardMode || !hasActive) {
      state.dashboardRefreshDelayMs = 5000;
      return;
    }
    const delay = document.hidden
      ? Math.max(30000, state.dashboardRefreshDelayMs)
      : state.dashboardRefreshDelayMs;
    state.dashboardRefreshTimer = window.setTimeout(loadDashboard, delay);
  }

  async function startDashboardTask() {
    if (!elements.dashboard) return;
    const content = elements.dashboardInput.value.trim();
    const dojoId = Number(elements.dashboardCourse.value || 0) || null;
    const moduleIndex =
      elements.dashboardModule.value === ""
        ? null
        : Number(elements.dashboardModule.value);
    if (!content) {
      api.showNotice(elements.dashboardNotice, "请先写下教学目标。", "warning");
      elements.dashboardInput.focus();
      return;
    }
    elements.dashboardSend.disabled = true;
    await createThread({ dojoId, moduleIndex });
    elements.input.value = content;
    resizeComposer();
    syncComposerState();
    const result = await sendMessage(content);
    if (!result || !result.executed) {
      elements.dashboardSend.disabled = false;
    } else {
      elements.dashboardInput.value = "";
    }
  }

  async function openConversationRecords() {
    setDashboardMode(false);
    await loadThreads();
    if (state.threads.length) {
      await activateThread(state.threads[0].id);
    } else {
      await createThread();
    }
    setSidebar(true);
  }

  function courseOperationDestination(stateData) {
    const tool = String(stateData.tool || "");
    const dojo = currentDojo();
    let fallback = "/teacher/courses";
    if (dojo && dojo.referenceId) {
      fallback = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=overview`;
      if (
        [
          "course.members",
          "course.member.add",
          "course.member.remove",
        ].includes(tool)
      ) {
        fallback = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=overview`;
      } else if (tool.startsWith("challenge.")) {
        fallback = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=questions`;
      } else if (tool.startsWith("assignment.")) {
        fallback = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=questions`;
      } else if (tool.startsWith("course.")) {
        fallback = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=overview`;
      }
    }
    if (["course.list", "course.delete"].includes(tool))
      fallback = "/teacher/courses?tab=overview";
    return internalHref(stateData.href, fallback);
  }

  const artifactTypeLabels = {
    "lesson-plan": "教案",
    "slide-deck": "课件",
    "attack-defense-scene": "攻防演示",
    simulation: "模拟实训",
    debate: "课堂辩论",
    roleplay: "角色扮演",
    "question-set": "CTF 实践题",
    assessment: "评测内容",
  };

  const jobKindLabels = {
    "agent.chat": "处理教学要求",
    "candidate.generate": "生成教学内容",
    "self.candidate.generate": "生成教学内容",
    "artifact.materialize": "创建可用内容",
    "artifact.revise": "修改教学内容",
    "material.analyze": "分析课件",
    "learning.authoring": "生成 CTF 实践题",
    "learning.solution": "验证实训题目",
    "generation.batch": "批量生成独立 CTF 题目",
  };

  function hasManagedContentPage(job) {
    const kind = String((job && job.kind) || "");
    return (
      kind !== "agent.chat" &&
      (kind.startsWith("candidate.") ||
        kind.startsWith("self.candidate.") ||
        kind.startsWith("artifact.") ||
        kind.startsWith("material.") ||
        kind.startsWith("learning."))
    );
  }

  function jobTitle(job) {
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    if (job.kind === "learning.authoring") {
      return result.title || job.title || jobKindLabels[job.kind];
    }
    const artifactLabel = artifactTypeLabels[job.artifactType];
    if (
      ["candidate.generate", "self.candidate.generate"].includes(job.kind) &&
      artifactLabel
    ) {
      return `生成${artifactLabel}`;
    }
    return jobKindLabels[job.kind] || "处理教学任务";
  }

  const artifactProgressProfiles = {
    "lesson-plan": [
      {
        label: "解析教学目标",
        detail: "识别授课对象、教学目标、重点与素材约束",
      },
      { label: "编排教学流程", detail: "组织导入、讲解、活动、练习与总结环节" },
      { label: "保存并检查", detail: "生成可编辑版本并检查结构与内容完整性" },
      { label: "教案可预览", detail: "生成完成，可直接打开预览并继续修改" },
    ],
    "slide-deck": [
      { label: "解析教学目标", detail: "识别课程主题、受众、重点与素材约束" },
      {
        label: "生成课件页面",
        detail: "规划页面结构并生成标题、要点与讲解内容",
      },
      { label: "整理可编辑版本", detail: "保存页面顺序并检查内容与版式完整性" },
      { label: "课件可预览", detail: "生成完成，可直接打开预览并继续修改" },
    ],
    "attack-defense-scene": [
      { label: "确认攻防目标", detail: "识别漏洞主题、演示对象与预期教学效果" },
      { label: "编排演示流程", detail: "生成攻击、防御、讲解和关键观察节点" },
      { label: "检查交互链路", detail: "核对场景步骤、操作反馈与演示连贯性" },
      { label: "演示可预览", detail: "生成完成，可直接打开演示并继续调整" },
    ],
    simulation: [
      { label: "确认实训目标", detail: "识别训练目标、参与角色与操作边界" },
      { label: "生成场景与交互", detail: "编排环境、操作步骤、反馈与教学提示" },
      { label: "检查操作路径", detail: "核对关键操作、分支结果与完成条件" },
      { label: "实训可预览", detail: "生成完成，可直接打开场景并继续调整" },
    ],
    "question-set": [
      { label: "解析题目要求", detail: "识别知识点、漏洞目标、难度与运行约束" },
      { label: "生成题面与环境", detail: "构建题目说明、隔离环境与解题路径" },
      {
        label: "验证动态 Flag",
        detail: "运行标准解法并核验动态 Flag 提交链路",
      },
      { label: "题目可用", detail: "验证通过，可进入独立题目管理页审阅并发布" },
    ],
    assessment: [
      { label: "解析评测目标", detail: "识别考查范围、难度与评分要求" },
      { label: "生成题目与规则", detail: "组织题目、答案、评分点与反馈规则" },
      { label: "核验答案与评分", detail: "检查参考答案、评分逻辑与内容完整性" },
      { label: "评测可预览", detail: "生成完成，可直接打开预览并继续修改" },
    ],
  };

  const jobProgressProfiles = {
    "material.analyze": [
      { label: "读取课件", detail: "读取文件内容、页面结构与可用素材" },
      { label: "提取知识结构", detail: "识别功能点、知识点及其关联关系" },
      { label: "生成章节建议", detail: "整理章节候选、来源依据与课程映射" },
      { label: "分析完成", detail: "分析结果已保存，可在课件管理中查看" },
    ],
    "artifact.revise": [
      { label: "解析修改要求", detail: "定位需要调整的内容、范围与版本" },
      { label: "生成新版本", detail: "按自然语言要求修改对应教学内容" },
      { label: "校验并保存", detail: "检查修改结果并保存为可追溯的新版本" },
      { label: "修改完成", detail: "新版本已生成，可直接打开查看" },
    ],
    "artifact.materialize": [
      { label: "确认选定内容", detail: "读取已选方案及其课程上下文" },
      {
        label: "创建可编辑成品",
        detail: "将方案转换为可预览、可继续修改的内容",
      },
      { label: "检查内容完整性", detail: "核对结构、字段、引用与打开路径" },
      { label: "成品可预览", detail: "创建完成，可直接打开结果" },
    ],
    "learning.authoring": [
      {
        label: "分析要求与题库",
        detail: "识别漏洞类型、难度与运行约束，并检索可复用题目",
      },
      {
        label: "规划出题策略",
        detail: "综合教师要求和题库匹配，确定复用、改编或新建策略",
      },
      {
        label: "构建题包与环境",
        detail: "生成题面、隔离服务、私有解法与动态 Flag 链路",
      },
      {
        label: "红队审查与修复",
        detail: "独立审查完整题包，并逐项修复中高风险问题",
      },
      {
        label: "保存可追溯草稿",
        detail: "保存题包、来源依据和每轮审查记录",
      },
      {
        label: "独立验证与复验",
        detail: "运行标准解法、确定性发布门和动态 Flag 提交验证",
      },
      {
        label: "生成题目入口",
        detail: "确认验证结果并写入独立题目管理入口",
      },
    ],
    "learning.solution": [
      { label: "读取题目环境", detail: "加载题面、隔离服务与验证规则" },
      { label: "执行标准解法", detail: "在隔离环境中运行完整解题过程" },
      { label: "核验 Flag", detail: "提交动态 Flag 并确认判题结果" },
      { label: "验证完成", detail: "标准解法与判题链路均已通过" },
    ],
    "agent.chat": [
      {
        label: "理解原始要求",
        detail: "保留教师完整原意，解析组合目标、指代与交付形式",
      },
      {
        label: "选择技能并规划",
        detail: "从技能目录选择本轮能力，形成可执行计划",
      },
      {
        label: "结合事实执行",
        detail: "使用课程记忆、材料原文与可信数据完成分析或内容",
      },
      {
        label: "准备真实交付",
        detail: "生成工具提案，或把请求的内容渲染为可下载文件",
      },
      { label: "核验并回复", detail: "检查结果与教师原意一致后写入当前对话" },
    ],
  };

  function jobSteps(job) {
    if (["candidate.generate", "self.candidate.generate"].includes(job.kind)) {
      return (
        artifactProgressProfiles[job.artifactType] || [
          { label: "解析教学要求", detail: "识别教学目标、内容范围与生成约束" },
          {
            label: "生成内容草稿",
            detail: "组织结构并生成可直接使用的教学内容",
          },
          { label: "保存并检查", detail: "保存可编辑版本并检查内容完整性" },
          { label: "内容可预览", detail: "生成完成，可直接打开预览并继续修改" },
        ]
      );
    }
    return (
      jobProgressProfiles[job.kind] || [
        { label: "解析任务要求", detail: "读取目标、上下文与执行约束" },
        { label: "执行任务", detail: "按要求生成并处理目标内容" },
        { label: "保存并检查", detail: "保存结果并检查内容完整性" },
        { label: "任务完成", detail: "处理完成，可直接查看结果" },
      ]
    );
  }

  function currentJobStage(job) {
    const events = Array.isArray(job.events) ? job.events : [];
    const latest = events.length ? events[events.length - 1] : null;
    return String(
      job.stage || (latest && latest.stage) || "queued",
    ).toLowerCase();
  }

  function normalizedJobStage(job) {
    return currentJobStage(job).replace(/^native-/, "");
  }

  const genericStagePresentations = {
    queued: { label: "等待开始", detail: "任务已加入队列，等待可用执行资源" },
    routing: { label: "准备执行", detail: "正在加载任务上下文并确认所需能力" },
    planning: {
      label: "理解要求并规划",
      detail: "正在保留原始要求并组织可执行步骤",
    },
    generating: {
      label: "生成核心内容",
      detail: "正在根据要求和上下文生成内容",
    },
    persisting: {
      label: "保存并检查结果",
      detail: "正在检查结构完整性并保存可编辑版本",
    },
    delivering: {
      label: "准备交付",
      detail: "正在核验回答并准备可下载文件或工具操作",
    },
    materializing: {
      label: "生成可预览内容",
      detail: "正在把已选方案转换为可编辑成品",
    },
    retrying: {
      label: "自动重试",
      detail: "上一次执行未完成，正在保留进度并重新排队",
    },
    recovering: {
      label: "恢复执行",
      detail: "检测到执行中断，正在从最近状态继续",
    },
    complete: { label: "任务完成", detail: "结果已经检查并保存" },
    completed: { label: "任务完成", detail: "结果已经检查并保存" },
    finalizing: {
      label: "正在保存结果",
      detail: "核心处理已经结束，正在写入结果并生成可打开的入口",
    },
    failed: { label: "任务未完成", detail: "可以展开查看失败阶段并重新运行" },
    canceled: { label: "任务已取消", detail: "任务已经停止，不会继续执行" },
  };

  function authoringStagePresentation(stage) {
    const validationRepair = stage.match(/^validation-repair-(\d+)$/);
    if (validationRepair) {
      return {
        label: `第 ${validationRepair[1]} 轮自主修复`,
        detail: "正在修复发布门发现的问题，完成后将由独立检查再次验证",
      };
    }
    const validation = stage.match(/^validate-(\d+)$/);
    if (validation) {
      return {
        label: `第 ${validation[1]} 轮独立验证`,
        detail: "正在运行标准解法、确定性发布门与动态 Flag 提交验证",
      };
    }
    const stages = {
      authoring: {
        label: "启动题目构建与验证",
        detail: "正在准备题库检索、题包构建和独立验证流程",
      },
      catalog: {
        label: "检索并比较题库",
        detail: "正在查找可安全复用或改编的候选题",
      },
      strategy: {
        label: "选择出题策略",
        detail: "正在综合教师要求、题库匹配和运行约束决定出题方式",
      },
      plan: {
        label: "规划教学与实现方案",
        detail: "正在细化教学目标、实现约束和验证方案",
      },
      build: {
        label: "构建题包与运行环境",
        detail: "正在生成题面、运行产物、私有解法与动态 Flag 链路",
      },
      review: {
        label: "独立红队审查",
        detail: "独立审查智能体正在检查完整题包和潜在缺陷",
      },
      "preflight-repair": {
        label: "修复预审问题",
        detail: "正在逐项关闭审查问题，并复验修改后的题包",
      },
      draft: {
        label: "保存可追溯草稿",
        detail: "正在保存题包、来源依据和每轮审查记录",
      },
      ready: {
        label: "汇总验证结果",
        detail: "正在确认所有发布门均已通过并准备独立题目管理入口",
      },
    };
    return stages[stage] || null;
  }

  function jobStagePresentation(job) {
    const stage = normalizedJobStage(job);
    const status = String(job.status || "QUEUED").toUpperCase();
    if (
      activeJobStatuses.has(status) &&
      /^(complete|completed|finalizing)$/.test(stage)
    ) {
      return genericStagePresentations.finalizing;
    }
    if (String(job.kind || "") === "learning.authoring") {
      const authoring = authoringStagePresentation(stage);
      if (authoring) return authoring;
    }
    return genericStagePresentations[stage] || null;
  }

  function jobTimestamp(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatJobDuration(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    if (safe < 60) return `${safe} 秒`;
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    if (minutes < 60)
      return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
    const hours = Math.floor(minutes / 60);
    const minuteRemainder = minutes % 60;
    return minuteRemainder
      ? `${hours} 小时 ${minuteRemainder} 分`
      : `${hours} 小时`;
  }

  function jobDurationSeconds(job, now) {
    const started = jobTimestamp(job.created);
    if (started === null) return null;
    const terminal = ["SUCCEEDED", "FAILED", "CANCELED"].includes(
      String(job.status || "").toUpperCase(),
    );
    const ended = terminal
      ? jobTimestamp(job.completed || job.updated) || Number(now || Date.now())
      : Number(now || Date.now());
    return Math.max(0, Math.floor((ended - started) / 1000));
  }

  function jobDurationMarkup(job, compact) {
    const started = jobTimestamp(job.created);
    if (started === null) return "";
    const status = String(job.status || "").toUpperCase();
    const terminal = ["SUCCEEDED", "FAILED", "CANCELED"].includes(status);
    const ended = terminal ? jobTimestamp(job.completed || job.updated) : null;
    const prefix = terminal ? "耗时 " : "已用时 ";
    return `<span class="job-live-duration${compact ? " is-compact" : ""}" data-job-start-ms="${started}"${ended === null ? "" : ` data-job-end-ms="${ended}"`} data-job-duration-prefix="${prefix}">${prefix}${formatJobDuration(jobDurationSeconds(job, Date.now()))}</span>`;
  }

  function updateJobDurations(container) {
    const scope = container || root;
    const now = Date.now();
    scope.querySelectorAll("[data-job-start-ms]").forEach((node) => {
      const started = Number(node.dataset.jobStartMs);
      const ended = node.dataset.jobEndMs ? Number(node.dataset.jobEndMs) : now;
      if (!Number.isFinite(started) || !Number.isFinite(ended)) return;
      node.textContent = `${node.dataset.jobDurationPrefix || "已用时 "}${formatJobDuration((ended - started) / 1000)}`;
    });
  }

  function syncProgressClock() {
    const active = Array.from(state.trackedJobs.values()).some((job) =>
      activeJobStatuses.has(String((job && job.status) || "").toUpperCase()),
    );
    updateJobDurations(root);
    if (active && state.progressClockTimer === null) {
      state.progressClockTimer = window.setInterval(
        () => updateJobDurations(root),
        1000,
      );
    } else if (!active && state.progressClockTimer !== null) {
      window.clearInterval(state.progressClockTimer);
      state.progressClockTimer = null;
    }
  }

  function jobProgressValue(job) {
    const status = String(job.status || "").toUpperCase();
    if (status === "SUCCEEDED") return 100;
    const value = Number(job.progress || 0);
    if (!Number.isFinite(value)) return 0;
    const upperBound = activeJobStatuses.has(status) ? 99 : 100;
    return Math.max(0, Math.min(upperBound, Math.round(value)));
  }

  function jobStepIndex(job) {
    const steps = jobSteps(job);
    const lastIndex = steps.length - 1;
    const status = String(job.status || "QUEUED").toUpperCase();
    const stage = normalizedJobStage(job);
    if (status === "SUCCEEDED") return lastIndex;
    if (/^(complete|completed|finalizing)$/.test(stage)) {
      return activeJobStatuses.has(status)
        ? Math.max(0, lastIndex - 1)
        : lastIndex;
    }
    if (job.kind === "learning.authoring") {
      if (/(queue|routing|recover|retry|authoring)/.test(stage)) return 0;
      if (/^(catalog)$/.test(stage)) return 0;
      if (/^(strategy|plan)$/.test(stage)) return Math.min(1, lastIndex);
      if (/^(build)$/.test(stage)) return Math.min(2, lastIndex);
      if (/^(review|preflight-repair)$/.test(stage))
        return Math.min(3, lastIndex);
      if (/^(draft)$/.test(stage)) return Math.min(4, lastIndex);
      if (/^(validate-\d+|validation-repair-\d+)$/.test(stage))
        return Math.min(5, lastIndex);
      if (/^(ready)$/.test(stage)) return lastIndex;
    }
    if (job.kind === "agent.chat") {
      if (/(queue|routing|recover|retry|receiv)/.test(stage)) return 0;
      if (/(plan|skill)/.test(stage)) return Math.min(1, lastIndex);
      if (/(generat|analy|execut|reason|compose)/.test(stage))
        return Math.min(2, lastIndex);
      if (/(deliver|persist|render|document|check|validat)/.test(stage))
        return Math.max(0, lastIndex - 1);
    }
    if (/(queue|routing|recover|retry|receiv)/.test(stage)) return 0;
    if (
      /(persist|validat|preflight|review|repair|materializ|check|document|ready)/.test(
        stage,
      )
    )
      return Math.max(0, lastIndex - 1);
    if (/(generat|analy|author|solv|build|render|compose|extract)/.test(stage))
      return Math.min(1, lastIndex);
    const progress = jobProgressValue(job);
    if (progress >= 75) return Math.max(0, lastIndex - 1);
    if (progress >= 10 || !["QUEUED", "CANCELED"].includes(status))
      return Math.min(1, lastIndex);
    return 0;
  }

  function jobCurrentDetail(job) {
    const events = Array.isArray(job.events) ? job.events : [];
    const latest = events.length ? events[events.length - 1] : null;
    const stagePresentation = jobStagePresentation(job);
    const latestStage = String((latest && latest.stage) || "")
      .toLowerCase()
      .replace(/^native-/, "");
    const stage = normalizedJobStage(job);
    if (stagePresentation && latestStage !== stage) {
      return stagePresentation.detail;
    }
    if (
      latest &&
      latest.message &&
      String(job.status || "").toUpperCase() !== "SUCCEEDED"
    ) {
      return String(latest.message);
    }
    const steps = jobSteps(job);
    const current = steps[jobStepIndex(job)] || steps[0];
    return (current && current.detail) || "正在处理任务";
  }

  function jobCurrentStepLabel(job) {
    const stagePresentation = jobStagePresentation(job);
    if (stagePresentation) return stagePresentation.label;
    const steps = jobSteps(job);
    const current = steps[jobStepIndex(job)] || steps[0];
    return (current && current.label) || "正在处理";
  }

  function jobTimelineMarkup(job, compact) {
    const steps = jobSteps(job);
    const activeIndex = jobStepIndex(job);
    const status = String(job.status || "QUEUED").toUpperCase();
    return `<ol class="job-step-list ${compact ? "is-compact" : ""}" style="--job-step-count:${steps.length}" aria-label="任务步骤">
      ${steps
        .map((step, index) => {
          let stepState =
            index < activeIndex || status === "SUCCEEDED"
              ? "complete"
              : index === activeIndex
                ? "current"
                : "pending";
          if (index === activeIndex && status === "FAILED")
            stepState = "failed";
          if (
            index === activeIndex &&
            ["CANCELED", "CANCEL_REQUESTED"].includes(status)
          )
            stepState = "canceled";
          const icon =
            stepState === "complete"
              ? "fa-check"
              : stepState === "failed"
                ? "fa-times"
                : stepState === "canceled"
                  ? "fa-minus"
                  : stepState === "current"
                    ? status === "QUEUED"
                      ? "fa-clock"
                      : "fa-circle-notch"
                    : "fa-circle";
          const currentAttribute =
            stepState === "current" ? ' aria-current="step"' : "";
          return `<li class="is-${stepState}"${currentAttribute}><span class="job-step-icon"><i class="${stepState === "pending" ? "far" : "fas"} ${icon}${stepState === "current" && status !== "QUEUED" ? " fa-spin" : ""}"></i></span><span class="job-step-copy"><strong>${api.escapeHtml(step.label)}</strong>${compact ? "" : `<small>${api.escapeHtml(step.detail)}</small>`}</span></li>`;
        })
        .join("")}
    </ol>`;
  }

  function jobDisclosureElementId(prefix, jobId) {
    return `${prefix}-${String(jobId || "job").replace(/[^A-Za-z0-9_-]/g, "-")}`;
  }

  function jobDisclosureExpanded(jobId) {
    return state.expandedJobIds.has(String(jobId));
  }

  function jobAttemptLabel(job) {
    const attempt = Math.max(0, Number(job.attemptCount || 0));
    const maximum = Math.max(attempt, Number(job.maxAttempts || 0));
    if (!attempt && !maximum) return "";
    if (!attempt)
      return maximum > 1 ? `最多自动尝试 ${maximum} 次` : "尚未开始执行";
    return maximum > 1
      ? `第 ${attempt}/${maximum} 次执行`
      : `第 ${attempt} 次执行`;
  }

  function jobProgressBarMarkup(job, className, key) {
    const progress = jobProgressValue(job);
    const status = String(job.status || "QUEUED").toUpperCase();
    const active = activeJobStatuses.has(status);
    const snapshotKey = `${key}:${job.id}`;
    const previous = state.renderedJobProgress.has(snapshotKey)
      ? Number(state.renderedJobProgress.get(snapshotKey))
      : 0;
    state.renderedJobProgress.set(snapshotKey, progress);
    return `<span class="${className}${active ? " is-live" : ""}" role="progressbar" aria-label="${api.escapeHtml(jobTitle(job))}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" data-job-progress-target="${progress}"><i style="width:${Math.max(0, Math.min(100, previous))}%"></i></span>`;
  }

  function animateJobProgressBars(container) {
    if (!container) return;
    window.requestAnimationFrame(() => {
      container
        .querySelectorAll("[data-job-progress-target]")
        .forEach((bar) => {
          const fill = bar.querySelector("i");
          if (fill)
            fill.style.width = `${Number(bar.dataset.jobProgressTarget || 0)}%`;
        });
    });
  }

  function jobDisclosureDetailsMarkup(job, prefix) {
    const status = String(job.status || "QUEUED").toUpperCase();
    const expanded = jobDisclosureExpanded(job.id);
    const detailId = jobDisclosureElementId(prefix, job.id);
    const failure =
      status === "FAILED" && (job.failureMessage || job.error)
        ? `<p class="job-disclosure-failure"><i class="fas fa-exclamation-circle"></i><span>${api.escapeHtml(job.failureMessage || job.error)}</span></p>`
        : "";
    return `<div id="${api.escapeHtml(detailId)}" class="job-disclosure-details" data-job-disclosure-details="${api.escapeHtml(job.id)}" role="region" aria-label="${api.escapeHtml(jobTitle(job))}详细步骤"${expanded ? "" : " hidden"}>
      ${jobTimelineMarkup(job, false)}
      ${failure}
    </div>`;
  }

  function syncJobDisclosure(jobId, expanded) {
    [elements.messages, elements.jobList].forEach((container) => {
      if (!container) return;
      container.querySelectorAll("[data-job-disclosure]").forEach((shell) => {
        if (String(shell.dataset.jobDisclosure) !== String(jobId)) return;
        shell.classList.toggle("is-expanded", expanded);
        shell.querySelectorAll("[data-job-toggle]").forEach((button) => {
          button.setAttribute("aria-expanded", String(expanded));
          const label = expanded
            ? button.dataset.jobCollapseLabel
            : button.dataset.jobExpandLabel;
          if (label) button.setAttribute("aria-label", label);
          const copy = button.querySelector("[data-job-toggle-copy]");
          if (copy) {
            copy.textContent = expanded
              ? button.dataset.jobCollapseText || "收起详细步骤"
              : button.dataset.jobExpandText || "查看详细步骤";
          }
        });
        shell
          .querySelectorAll("[data-job-disclosure-details]")
          .forEach((details) => {
            details.hidden = !expanded;
          });
      });
    });
  }

  function toggleJobDisclosure(jobId) {
    const id = String(jobId);
    const expanded = !jobDisclosureExpanded(id);
    if (expanded) state.expandedJobIds.add(id);
    else state.expandedJobIds.delete(id);
    syncJobDisclosure(id, expanded);
  }

  function bindJobDisclosureButtons(container, selectJob) {
    container.querySelectorAll("[data-job-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const jobId = String(button.dataset.jobToggle || "");
        if (!jobId) return;
        if (selectJob) {
          state.selectedJobId = jobId;
          container.querySelectorAll("[data-task-job]").forEach((item) => {
            item.classList.toggle(
              "is-selected",
              String(item.dataset.taskJob) === jobId,
            );
          });
          renderActionsForSelectedJob();
        }
        toggleJobDisclosure(jobId);
      });
    });
  }

  function jobStatusSummary(job) {
    const status = String(job.status || "QUEUED").toUpperCase();
    if (status === "SUCCEEDED") return "已完成，可以直接查看结果";
    if (status === "FAILED")
      return job.failureMessage || "任务未完成，可以重新运行";
    if (status === "CANCELED") return "任务已取消";
    if (status === "CANCEL_REQUESTED") return "正在安全停止当前任务";
    if (status === "QUEUED") return `等待执行：${jobSteps(job)[0].label}`;
    if (/^(complete|completed|finalizing)$/.test(normalizedJobStage(job)))
      return "核心处理已结束，正在保存结果；入口生成后页面会自动刷新";
    return jobCurrentDetail(job);
  }

  const activeJobStatuses = new Set(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]);

  function activeThreadJobs() {
    return Array.from(state.trackedJobs.values())
      .filter((job) =>
        activeJobStatuses.has(String((job && job.status) || "").toUpperCase()),
      )
      .sort((left, right) => {
        const leftAgent = String(left.kind || "") === "agent.chat" ? 1 : 0;
        const rightAgent = String(right.kind || "") === "agent.chat" ? 1 : 0;
        if (leftAgent !== rightAgent) return rightAgent - leftAgent;
        return String(right.updated || right.created || "").localeCompare(
          String(left.updated || left.created || ""),
        );
      });
  }

  function primaryActiveJob() {
    return (
      activeThreadJobs().find(
        (job) => String((job && job.kind) || "") !== "material.analyze",
      ) || null
    );
  }

  function updateAgentChrome() {
    const globalRows = state.taskCenterLoadedAt
      ? taskCenterRows()
      : Array.from(state.trackedJobs.values());
    const activeCount = globalRows.filter((job) =>
      activeJobStatuses.has(String((job && job.status) || "").toUpperCase()),
    ).length;
    const failedCount = globalRows.filter(
      (job) => String((job && job.status) || "").toUpperCase() === "FAILED",
    ).length;
    const approvalCount = pendingApprovalItems().length;
    if (!primaryActiveJob()) state.stoppingJobId = null;

    const attentionCount = activeCount + failedCount + approvalCount;
    elements.taskCount.hidden = attentionCount === 0;
    elements.taskCount.textContent = String(Math.min(99, attentionCount));
    elements.drawerOpen.classList.toggle("has-attention", attentionCount > 0);
    elements.drawerOpen.setAttribute(
      "aria-label",
      attentionCount
        ? `查看任务，${activeCount} 项运行中，${failedCount} 项需处理，${approvalCount} 项待确认`
        : "查看任务",
    );
    renderApprovalTray();
    syncComposerState();
  }

  function dojoReferenceForJob(job) {
    const matching =
      state.context &&
      (state.context.teacherDojos || []).find(
        (item) => String(item.id) === String(job.dojoId),
      );
    return (
      (matching && matching.referenceId) ||
      (currentDojo() && currentDojo().referenceId) ||
      ""
    );
  }

  function courseResultHref(job, tab, extra) {
    const params = new URLSearchParams({ tab });
    const dojoId = dojoReferenceForJob(job);
    if (dojoId) params.set("dojo", dojoId);
    if (job.moduleIndex !== null && job.moduleIndex !== undefined)
      params.set("module", String(job.moduleIndex));
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "")
        params.set(key, String(value));
    });
    return `/teacher/courses?${params.toString()}`;
  }

  function jobResultTarget(job) {
    const supplied = job.resultTarget || {};
    if (supplied.kind === "link")
      return {
        kind: "link",
        href: internalHref(supplied.href, "/teacher/courses"),
      };
    if (supplied.kind === "candidate" && supplied.candidateSetId)
      return {
        kind: "candidate",
        candidateSetId: String(supplied.candidateSetId),
      };
    if (supplied.kind === "conversation") return { kind: "conversation" };
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    const artifactId = result.artifactId;
    if (artifactId)
      return {
        kind: "link",
        href: teacherArtifactHref(artifactId),
      };
    const candidateSetId = result.candidateSetId;
    if (candidateSetId)
      return { kind: "candidate", candidateSetId: String(candidateSetId) };
    if (result.materialId)
      return {
        kind: "link",
        href: courseResultHref(job, "courseware", {
          material: result.materialId,
        }),
      };
    if (result.assignmentId)
      return {
        kind: "link",
        href: courseResultHref(job, "labs", {
          assignment: result.assignmentId,
        }),
      };
    if (result.challengeId)
      return {
        kind: "link",
        href: courseResultHref(job, "labs", { challenge: result.challengeId }),
      };
    if (job.kind === "agent.chat") return { kind: "conversation" };
    return {
      kind: "link",
      href: courseResultHref(
        job,
        job.kind && job.kind.startsWith("learning.") ? "labs" : "overview",
      ),
    };
  }

  function conversationCards() {
    return ((state.thread && state.thread.messages) || []).flatMap(
      (message) => message.cards || [],
    );
  }

  function messageCardsContaining(predicate) {
    const message = ((state.thread && state.thread.messages) || []).find(
      (item) => (item.cards || []).some(predicate),
    );
    return (message && message.cards) || [];
  }

  function jobForCandidateCard(card) {
    const stateData = card.state || {};
    if (stateData.jobId && state.trackedJobs.has(String(stateData.jobId))) {
      return state.trackedJobs.get(String(stateData.jobId));
    }
    return (
      Array.from(state.trackedJobs.values()).find((job) => {
        const result =
          job.result && typeof job.result === "object" ? job.result : {};
        const target = job.resultTarget || {};
        const candidateSetId = result.candidateSetId || target.candidateSetId;
        return String(candidateSetId || "") === String(card.objectId);
      }) ||
      (() => {
        const siblings = messageCardsContaining(
          (item) => String(item.id || "") === String(card.id || ""),
        );
        const legacyJobs = siblings.filter(
          (item) =>
            item.type === "job" &&
            ["candidate.generate", "self.candidate.generate"].includes(
              String((item.state || {}).kind),
            ),
        );
        return legacyJobs.length === 1
          ? state.trackedJobs.get(String(legacyJobs[0].objectId)) || null
          : null;
      })() ||
      (stateData.jobId
        ? {
            id: String(stateData.jobId),
            kind: "candidate.generate",
            artifactType: stateData.kind,
            status:
              stateData.status === "GENERATING" ? "QUEUED" : stateData.status,
            stage: stateData.stage || "queued",
            progress: Number(stateData.progress || 0),
            failureMessage: stateData.failureMessage,
            result: stateData.artifactId
              ? {
                  artifactId: stateData.artifactId,
                  candidateSetId: card.objectId,
                }
              : { candidateSetId: card.objectId },
            resultTarget: stateData.resultTarget || {
              kind: "candidate",
              candidateSetId: card.objectId,
            },
          }
        : null)
    );
  }

  function candidateCardForJob(job) {
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    const target = job.resultTarget || {};
    const candidateSetId = result.candidateSetId || target.candidateSetId;
    const direct = conversationCards().find(
      (card) =>
        card.type === "candidate_set" &&
        (String((card.state || {}).jobId || "") === String(job.id) ||
          (candidateSetId && String(card.objectId) === String(candidateSetId))),
    );
    if (direct) return direct;
    const siblings = messageCardsContaining(
      (card) => card.type === "job" && String(card.objectId) === String(job.id),
    );
    const candidates = siblings.filter((card) => card.type === "candidate_set");
    return candidates.length === 1 ? candidates[0] : null;
  }

  function artifactCardForId(artifactId) {
    if (!artifactId) return null;
    return (
      conversationCards().find(
        (card) =>
          card.type === "artifact" &&
          String(card.objectId) === String(artifactId),
      ) || null
    );
  }

  function artifactIdForResult(card, job) {
    const stateData = (card && card.state) || {};
    const result =
      job && job.result && typeof job.result === "object" ? job.result : {};
    if (card && card.type === "artifact") return String(card.objectId);
    if (stateData.artifactId || result.artifactId)
      return stateData.artifactId || result.artifactId;
    const href = (job && job.resultTarget && job.resultTarget.href) || "";
    const match = String(href).match(/\/teacher\/artifacts\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function withResultApproval(markup) {
    return markup;
  }

  function visibleMessageCards(message) {
    return (message.cards || []).filter((card) => {
      if (card.type === "candidate_set") {
        const artifactId = (card.state || {}).artifactId;
        if (artifactCardForId(artifactId)) return false;
        const localGenerationJobs = (message.cards || []).filter(
          (item) =>
            item.type === "job" &&
            ["candidate.generate", "self.candidate.generate"].includes(
              String((item.state || {}).kind),
            ),
        );
        return (
          Boolean(jobForCandidateCard(card)) || localGenerationJobs.length !== 1
        );
      }
      if (card.type !== "job") return true;
      const tracked = state.trackedJobs.get(card.objectId) || {};
      const job = { id: card.objectId, ...(card.state || {}), ...tracked };
      if (String(job.kind || "") === "agent.chat") return false;
      if (candidateCardForJob(job)) return false;
      return !(
        String(job.status || "").toUpperCase() === "SUCCEEDED" &&
        artifactCardForId(artifactIdForResult(null, job))
      );
    });
  }

  function cardMarkup({ icon, kicker, title, summary, action, progress }) {
    return `<span class="teaching-card-icon"><i class="fas ${api.escapeHtml(icon)}"></i></span>
      <span class="card-copy">
        <span class="card-kicker">${api.escapeHtml(kicker)}</span>
        <strong>${api.escapeHtml(title)}</strong>
        <small>${api.escapeHtml(summary)}</small>
        ${typeof progress === "number" ? `<span class="card-progress" aria-label="进度 ${progress}%"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></span>` : ""}
      </span>
      <span class="card-action"><span>${api.escapeHtml(action)}</span><i class="fas fa-arrow-right"></i></span>`;
  }

  function taskLifecycleCardMarkup(job, options) {
    const status = String(job.status || "QUEUED").toUpperCase();
    const active = ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(status);
    const failed = status === "FAILED";
    const canceled = status === "CANCELED";
    const title = (options && options.title) || jobTitle(job);
    const batch = jobBatchView(job);
    const taskPosition = batch ? `第 ${batch.index}/${batch.count} 题 · ` : "";
    const kicker = `${taskPosition}${
      active
        ? "正在生成"
        : failed
          ? "生成失败"
          : canceled
            ? "已取消"
            : "任务状态"
    }`;
    const icon = failed
      ? "fa-exclamation"
      : canceled
        ? "fa-minus"
        : status === "QUEUED"
          ? "fa-clock"
          : "fa-circle-notch";
    const iconAnimation = status === "RUNNING" ? " fa-spin" : "";
    const expanded = jobDisclosureExpanded(job.id);
    const detailId = jobDisclosureElementId("job-card-details", job.id);
    return `<article class="conversation-card job-card is-${api.escapeHtml(status.toLowerCase())}${expanded ? " is-expanded" : ""}" data-job-card-shell="${api.escapeHtml(job.id)}" data-job-disclosure="${api.escapeHtml(job.id)}">
      <button class="job-card-open" type="button" data-job-toggle="${api.escapeHtml(job.id)}" data-job-expand-label="${api.escapeHtml(`展开${title}${active ? "的生成步骤" : "的任务步骤"}`)}" data-job-collapse-label="${api.escapeHtml(`收起${title}${active ? "的生成步骤" : "的任务步骤"}`)}" aria-expanded="${expanded}" aria-controls="${api.escapeHtml(detailId)}" aria-label="${expanded ? "收起" : "展开"}${api.escapeHtml(title)}${active ? "的生成步骤" : "的任务步骤"}">
        <span class="job-card-heading"><span class="teaching-card-icon"><i class="fas ${icon}${iconAnimation}"></i></span><span><span class="card-kicker">${kicker}</span><strong>${api.escapeHtml(title)}</strong><small>${api.escapeHtml(jobStatusSummary(job))}</small><span class="job-card-facts"><span>${jobProgressValue(job)}%</span>${jobDurationMarkup(job, true)}${jobAttemptLabel(job) ? `<span>${api.escapeHtml(jobAttemptLabel(job))}</span>` : ""}</span></span><i class="fas fa-chevron-right job-disclosure-chevron"></i></span>
      </button>
      ${jobDisclosureDetailsMarkup(job, "job-card-details")}
    </article>`;
  }

  function completedJobResultMarkup(job) {
    const target = jobResultTarget(job);
    if (target.kind === "conversation") return "";
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    const batch = job.batch && typeof job.batch === "object" ? job.batch : {};
    const batchIndex = Math.max(1, Number(batch.index || job.batchIndex) || 1);
    const batchCount = Math.max(
      batchIndex,
      Number(batch.count || job.batchCount) || 1,
    );
    const batchPosition =
      batchCount > 1 ? `第 ${batchIndex}/${batchCount} 题` : "";
    const title = result.title || job.title || jobTitle(job);
    const summary =
      job.kind === "learning.authoring"
        ? result.summary
          ? `${String(result.summary).slice(0, 132)}${batchPosition ? `；${batchPosition}可独立修订、发布和删除` : ""}`
          : batchPosition
            ? `${batchPosition}已生成并通过可用性检查，可独立修订、发布和删除`
            : "题目草稿已生成并通过可用性检查，可以打开审阅、发布和删除"
        : "已生成，可以直接打开查看";
    const kicker =
      job.kind === "learning.authoring"
        ? `CTF 实践题草稿${batchPosition ? ` · ${batchPosition}` : ""}`
        : "生成结果";
    if (job.kind === "learning.authoring") {
      const href = authoringManagementHref(job);
      const markup = `<a class="conversation-card completed-result-card" data-job-authoring-link="${api.escapeHtml(job.id)}" href="${api.escapeHtml(href)}">${cardMarkup(
        {
          icon: "fa-check",
          kicker,
          title,
          summary,
          action: "题目管理",
        },
      )}</a>`;
      return withResultApproval(markup, null, job);
    }
    if (target.kind === "candidate") {
      const markup = `<button class="conversation-card completed-result-card" type="button" data-job-candidate-result="${api.escapeHtml(target.candidateSetId)}">${cardMarkup(
        {
          icon: "fa-check",
          kicker,
          title,
          summary,
          action: "打开结果",
        },
      )}</button>`;
      return withResultApproval(markup, null, job);
    }
    const action = target.href.includes("/teacher/artifacts/")
      ? "打开预览"
      : target.href.includes("tab=courseware")
        ? "打开课件管理"
        : target.href.includes("tab=questions")
          ? "打开题目"
          : target.href.includes("tab=demos")
            ? "打开演示"
          : "打开结果";
    const markup = `<a class="conversation-card completed-result-card" data-job-result-link href="${api.escapeHtml(target.href)}">${cardMarkup(
      {
        icon: "fa-check",
        kicker,
        title,
        summary,
        action,
      },
    )}</a>`;
    return withResultApproval(markup, null, job);
  }

  function renderCard(card) {
    const stateData = card.state || {};
    if (card.type === "candidate_set") {
      const count = Number(stateData.candidateCount || 0);
      const single = stateData.generationMode === "single" || count === 1;
      const job = jobForCandidateCard(card);
      const jobStatus = String((job && job.status) || "").toUpperCase();
      if (job && jobStatus !== "SUCCEEDED") {
        return taskLifecycleCardMarkup(job, {
          title: artifactTypeLabels[stateData.kind] || "教学内容",
        });
      }
      const summary = `${statusLabel(jobStatus === "SUCCEEDED" ? "READY" : stateData.status)} · ${single ? "一份草稿" : `${count || "多"} 个方案可选`}`;
      const markup = `<button class="conversation-card candidate-set-card" type="button" data-candidate-set="${api.escapeHtml(card.objectId)}">
        ${cardMarkup({
          icon: single ? "fa-file-alt" : "fa-layer-group",
          kicker: single ? "教学草稿" : "方案比较",
          title: artifactTypeLabels[stateData.kind] || "教学方案",
          summary,
          action: single ? "打开预览" : "比较方案",
        })}
      </button>`;
      return withResultApproval(markup, card, job);
    }
    if (card.type === "job") {
      const tracked = state.trackedJobs.get(card.objectId) || {};
      const job = { id: card.objectId, ...stateData, ...tracked };
      if (!hasManagedContentPage(job)) return "";
      return String(job.status || "").toUpperCase() === "SUCCEEDED"
        ? completedJobResultMarkup(job)
        : taskLifecycleCardMarkup(job);
    }
    if (card.type === "artifact") {
      const markup = `<a class="conversation-card artifact-card" href="${api.escapeHtml(teacherArtifactHref(card.objectId))}">${cardMarkup(
        {
          icon: "fa-file-alt",
          kicker: "生成结果",
          title: stateData.title || stateData.artifactType || "内容详情",
          summary: `版本 ${stateData.revision || 1} · ${stateData.qualityCheck || statusLabel(stateData.status) || "待检查"}`,
          action: "打开详情",
        },
      )}</a>`;
      return withResultApproval(markup, card, null);
    }
    if (card.type === "material") {
      const dojoId =
        stateData.dojoId || (currentDojo() && currentDojo().referenceId) || "";
      const href = `/teacher/courses?${dojoId ? `dojo=${encodeURIComponent(dojoId)}&` : ""}tab=courseware&material=${encodeURIComponent(card.objectId)}`;
      const markup = `<a class="conversation-card material-card" href="${api.escapeHtml(href)}">${cardMarkup(
        {
          icon: "fa-project-diagram",
          kicker: "课件分析",
          title: stateData.title || "功能点、图谱与章节",
          summary: `${statusLabel(stateData.status || "READY")} · ${stateData.chapterCount || 0} 个章节候选`,
          action: "打开课件管理",
        },
      )}</a>`;
      return withResultApproval(markup, card, null);
    }
    if (card.type === "progress_analysis") {
      const studentCount = Number(stateData.studentCount || 0);
      const completedCount = Number(stateData.completedCount || 0);
      const activeCount = Number(stateData.activeCount || 0);
      const requiredCount = Number(stateData.requiredChallengeCount || 0);
      const summary =
        requiredCount > 0
          ? `${completedCount}/${studentCount} 人完成全部必修题 · ${activeCount} 人有真实作答`
          : `${studentCount} 名学生 · ${activeCount} 人有真实作答 · 尚未设置必修题`;
      return `<a class="conversation-card progress-analysis-card" href="${api.escapeHtml(internalHref(stateData.href, "/teacher/courses?tab=students"))}">${cardMarkup(
        {
          icon: "fa-chart-line",
          kicker: "学情分析",
          title: `${stateData.courseName || "当前课程"}学习情况`,
          summary,
          action: "打开学情管理",
        },
      )}</a>`;
    }
    if (card.type === "course_operation") {
      const href = courseOperationDestination(stateData);
      return `<a class="conversation-card course-operation-card" href="${api.escapeHtml(href)}">${cardMarkup(
        {
          icon: String(stateData.tool || "").startsWith("assignment.")
            ? "fa-clipboard-check"
            : "fa-graduation-cap",
          kicker: "课程操作 · 已完成",
          title: stateData.title || "课程操作",
          summary: stateData.summary || "操作已经完成",
          action: stateData.destinationLabel || "打开对应界面",
        },
      )}</a>`;
    }
    return "";
  }

  function jobCardView(card) {
    const stateData = card.state || {};
    const tracked = state.trackedJobs.get(String(card.objectId)) || {};
    return { id: String(card.objectId), ...stateData, ...tracked };
  }

  function jobBatchView(job) {
    const nested = job.batch && typeof job.batch === "object" ? job.batch : {};
    const id = String(nested.id || job.batchId || "").trim();
    const count = Math.max(1, Number(nested.count || job.batchCount || 1));
    if (!id || count <= 1 || job.kind !== "learning.authoring") return null;
    return {
      id,
      count,
      index: Math.max(1, Number(nested.index || job.batchIndex || 1)),
      topic: String(nested.topic || job.batchTopic || "").trim(),
    };
  }

  function independentQuestionJobCards(message) {
    const cards = (message && message.cards) || [];
    const questionJobs = cards.filter(
      (card) => card.type === "job" && jobBatchView(jobCardView(card)),
    );
    return questionJobs.length > 1 ? questionJobs : [];
  }

  function renderResultCards(cards) {
    return cards.map((card) => renderCard(card)).join("");
  }

  const toolLabels = {
    "dojo.select": "切换课程 / 章节",
    "course.list": "查看全部课程",
    "course.read": "读取课程详情",
    "course.open": "打开课程",
    "course.studio": "管理课程内容",
    "course.settings": "打开课程管理",
    "course.members": "查看课程成员",
    "course.create": "创建课程",
    "course.update": "更新课程",
    "course.sync": "同步课程仓库",
    "course.promote": "设为推荐课程",
    "course.delete": "删除课程",
    "course.member.add": "添加课程成员",
    "course.member.remove": "移除课程成员",
    "module.open": "打开章节",
    "module.create": "创建章节",
    "module.update": "更新章节",
    "module.delete": "删除章节",
    "challenge.open": "打开题目",
    "challenge.generate": "生成 CTF 实践题",
    "challenge.publish": "发布 CTF 实践题",
    "challenge.delete": "删除题目",
    "assignment.list": "查看评测任务",
    "assignment.read": "读取评测详情",
    "assignment.submissions": "查看提交与批改",
    "assignment.generate": "生成评测草稿",
    "assignment.update": "更新评测设置",
    "assignment.publish": "发布评测",
    "assignment.close": "关闭评测",
    "assignment.delete": "删除评测",
    "assignment.grade.override": "教师复核成绩",
    "progress.read": "刷新真实进度",
    "material.list": "查看课件",
    "material.analyze": "重新分析课件",
    "material.add_to_module": "添加到章节资料",
    "material.apply_chapters": "将分析章节写入课程",
    "candidate.generate": "生成候选",
    "candidate.compare": "比较候选",
    "artifact.list": "查看生成内容",
    "artifact.open": "打开生成内容",
    "artifact.revise": "修改生成内容",
    "artifact.validate": "检查生成内容",
    "artifact.request_publish": "发布内容",
    "job.list": "查看任务",
    "job.retry": "重试任务",
    "approval.list": "查看待审批",
    "approval.approve": "批准并执行",
    "approval.reject": "驳回操作",
    "classroom.list": "查看课堂",
    "classroom.prepare": "准备课堂",
    "classroom.request_start": "申请开始课堂",
    "classroom.request_end": "申请结束课堂",
  };

  function inlineAnswerMarkup(value) {
    return api
      .escapeHtml(String(value || ""))
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  }

  function richAnswerMarkup(value) {
    const source = String(value || "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!source) return "";
    const segments = source.split(/```/);
    return segments
      .map((segment, segmentIndex) => {
        if (segmentIndex % 2 === 1) {
          const lines = segment.replace(/^\n/, "").split("\n");
          const first = lines[0] || "";
          const hasLanguage = /^[a-z0-9_+.#-]{1,24}$/i.test(first.trim());
          const language = hasLanguage ? first.trim() : "";
          const code = hasLanguage
            ? lines.slice(1).join("\n")
            : lines.join("\n");
          return `<figure class="teaching-code-block">${language ? `<figcaption>${api.escapeHtml(language)}</figcaption>` : ""}<pre><code>${api.escapeHtml(code)}</code></pre></figure>`;
        }
        const lines = segment.split("\n");
        const blocks = [];
        let paragraph = [];
        let list = [];
        let listType = "";
        const flushParagraph = () => {
          if (!paragraph.length) return;
          blocks.push(
            `<p>${paragraph.map(inlineAnswerMarkup).join("<br>")}</p>`,
          );
          paragraph = [];
        };
        const flushList = () => {
          if (!list.length) return;
          blocks.push(
            `<${listType}>${list.map((item) => `<li>${inlineAnswerMarkup(item)}</li>`).join("")}</${listType}>`,
          );
          list = [];
          listType = "";
        };
        lines.forEach((line) => {
          const heading = line.match(/^(#{1,3})\s+(.+)$/);
          const unordered = line.match(/^\s*[-*]\s+(.+)$/);
          const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
          const quote = line.match(/^>\s?(.+)$/);
          if (!line.trim()) {
            flushParagraph();
            flushList();
          } else if (heading) {
            flushParagraph();
            flushList();
            const level = Math.min(4, heading[1].length + 2);
            blocks.push(
              `<h${level}>${inlineAnswerMarkup(heading[2])}</h${level}>`,
            );
          } else if (unordered || ordered) {
            flushParagraph();
            const nextType = unordered ? "ul" : "ol";
            if (listType && listType !== nextType) flushList();
            listType = nextType;
            list.push((unordered || ordered)[1]);
          } else if (quote) {
            flushParagraph();
            flushList();
            blocks.push(
              `<blockquote>${inlineAnswerMarkup(quote[1])}</blockquote>`,
            );
          } else {
            flushList();
            paragraph.push(line);
          }
        });
        flushParagraph();
        flushList();
        return blocks.join("");
      })
      .join("");
  }

  function renderAgentFiles(message) {
    const files =
      message && message.metadata && Array.isArray(message.metadata.files)
        ? message.metadata.files
        : [];
    const safeFiles = files.filter(
      (file) =>
        file &&
        typeof file.downloadUrl === "string" &&
        file.downloadUrl.startsWith("/pwncollege_api/v1/teaching/jobs/"),
    );
    if (!safeFiles.length) return "";
    return `<section class="teaching-delivery-section" aria-label="交付文件">
      <header><span><i class="fas fa-paperclip"></i><strong>交付文件</strong></span><small>${safeFiles.length} 个文件，可直接下载</small></header>
      <div class="teaching-agent-files">${safeFiles
        .map((file) => {
          const size = Number(file.size || 0);
          const sizeLabel =
            size >= 1048576
              ? `${(size / 1048576).toFixed(1)} MB`
              : size >= 1024
                ? `${Math.ceil(size / 1024)} KB`
                : `${size} B`;
          return `<a class="teaching-agent-file" href="${api.escapeHtml(file.downloadUrl)}" download="${api.escapeHtml(file.filename || "教学文件")}">
        <span class="teaching-agent-file-icon"><i class="fas fa-file-download"></i></span>
        <span><strong>${api.escapeHtml(file.filename || "教学文件")}</strong><small>${api.escapeHtml(String(file.format || "file").toUpperCase())} · ${api.escapeHtml(sizeLabel)}</small></span>
        <span class="teaching-agent-file-action"><span>下载</span><i class="fas fa-arrow-down"></i></span>
      </a>`;
        })
        .join("")}</div></section>`;
  }

  function generationOptionsForMessage(message) {
    const bundle =
      message && message.metadata && message.metadata.generationOptions;
    if (
      !bundle ||
      !["candidate.generate", "challenge.generate"].includes(bundle.targetTool)
    )
      return null;
    if (!Array.isArray(bundle.options) || bundle.options.length !== 3)
      return null;
    const options = bundle.options.filter(
      (option) =>
        option &&
        typeof option.id === "string" &&
        typeof option.title === "string" &&
        typeof option.description === "string" &&
        typeof option.rewrittenPrompt === "string" &&
        Array.isArray(option.highlights),
    );
    return options.length === 3 ? { ...bundle, options } : null;
  }

  function visibleMessageContent(message) {
    const content = String((message && message.content) || "");
    const bundle = generationOptionsForMessage(message);
    if (
      !bundle ||
      bundle.artifactType !== "ctf-challenge" ||
      Number((bundle.baseArguments || {}).challengeCount || 1) <= 1
    )
      return content;
    return content.replace(
      /[；;]\s*选择的是整批策略[，,]\s*不会把题目\s*合并成一题或把[0-9０-９一二三四五六七八九十]+题误当成[0-9０-９一二三四五六七八九十]+套方案[。.]?\s*/g,
      "，",
    );
  }

  function renderGenerationOptions(message) {
    const bundle = generationOptionsForMessage(message);
    if (!bundle) return "";
    const metadata = message.metadata || {};
    const selection =
      metadata.generationSelection &&
      typeof metadata.generationSelection === "object"
        ? metadata.generationSelection
        : null;
    const selectionStatus = String(
      (selection && selection.status) || "",
    ).toUpperCase();
    const started = selectionStatus === "STARTED";
    const artifactLabels = {
      "slide-deck": "课件",
      "ctf-challenge": "CTF 实践题",
      "attack-defense-scene": "实训演示",
      simulation: "模拟实训",
      debate: "课堂辩论",
      roleplay: "角色扮演",
    };
    const baseArguments =
      bundle.baseArguments && typeof bundle.baseArguments === "object"
        ? bundle.baseArguments
        : {};
    const challengeCount =
      bundle.artifactType === "ctf-challenge"
        ? Math.max(1, Number(baseArguments.challengeCount || 1))
        : 1;
    const rememberedOptionId = state.generationOptionViews.get(
      String(message.id),
    );
    const activeOptionId =
      (selection &&
        bundle.options.some((option) => option.id === selection.optionId) &&
        selection.optionId) ||
      (bundle.options.some((option) => option.id === rememberedOptionId) &&
        rememberedOptionId) ||
      bundle.options[0].id;
    const activeIndex = bundle.options.findIndex(
      (option) => option.id === activeOptionId,
    );
    const pickerDescription =
      challengeCount > 1
        ? `题量已锁定为 ${challengeCount} 道独立 CTF；这里比较的是整批题目的组织策略，选择后一次启动 ${challengeCount} 个独立生成与验证任务。`
        : `逐个比较方案；选择前不会开始正式生成${artifactLabels[bundle.artifactType] ? ` ${artifactLabels[bundle.artifactType]}` : ""}。`;
    return `<section class="teaching-generation-options teaching-plan-picker" aria-label="正式生成方案" data-generation-option-picker-message="${api.escapeHtml(message.id)}" data-current-option-id="${api.escapeHtml(activeOptionId)}" data-generation-requested-count="${challengeCount}">
      <header class="teaching-generation-options-header">
        <div><span class="teaching-eyebrow">生成前确认</span><h3>选择一套方案</h3><p>${api.escapeHtml(pickerDescription)}</p></div>
        <span class="teaching-generation-count" data-generation-option-counter>${challengeCount > 1 ? `${challengeCount} 道题 · ` : ""}${activeIndex + 1} / ${bundle.options.length}</span>
      </header>
      <div class="teaching-generation-option-switcher">
        <button type="button" class="teaching-generation-option-shift" data-generation-option-shift="-1" data-generation-option-view-message="${api.escapeHtml(message.id)}" aria-label="查看上一个方案"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
        <div class="teaching-generation-option-tabs" role="tablist" aria-label="候选生成方案">${bundle.options
          .map((option, index) => {
            const active = option.id === activeOptionId;
            return `<button type="button" id="generation-option-tab-${api.escapeHtml(message.id)}-${api.escapeHtml(option.id)}" class="teaching-generation-option-tab${active ? " is-active" : ""}" role="tab" aria-selected="${active}" aria-controls="generation-option-panel-${api.escapeHtml(message.id)}-${api.escapeHtml(option.id)}" tabindex="${active ? "0" : "-1"}" data-generation-option-view-message="${api.escapeHtml(message.id)}" data-generation-option-view-id="${api.escapeHtml(option.id)}"><span>方案 ${index + 1}</span><strong>${api.escapeHtml(option.title)}</strong></button>`;
          })
          .join("")}</div>
        <button type="button" class="teaching-generation-option-shift" data-generation-option-shift="1" data-generation-option-view-message="${api.escapeHtml(message.id)}" aria-label="查看下一个方案"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </div>
      <div class="teaching-generation-option-list">${bundle.options
        .map((option, index) => {
          const active = option.id === activeOptionId;
          const selected = selection && selection.optionId === option.id;
          const selectingKey = `${message.id}:${option.id}`;
          const selecting = state.selectingGenerationOptions.has(selectingKey);
          const disabled =
            selecting || started || Boolean(selection && !selected);
          const buttonLabel = selecting
            ? "正在锁定方案…"
            : started && selected
              ? "已选择并开始生成"
              : selection && selected
                ? "检查并确认生成计划"
                : `选择方案 ${index + 1}`;
          return `<article id="generation-option-panel-${api.escapeHtml(message.id)}-${api.escapeHtml(option.id)}" class="teaching-generation-option${active ? " is-active" : ""}${selected ? " is-selected" : ""}" role="tabpanel" aria-labelledby="generation-option-tab-${api.escapeHtml(message.id)}-${api.escapeHtml(option.id)}" data-generation-option-panel="${api.escapeHtml(option.id)}" ${active ? "" : "hidden"}>
          <div class="teaching-generation-option-heading">
            <div><span class="teaching-generation-option-kicker">方案 ${index + 1}</span><h4>${api.escapeHtml(option.title)}</h4></div>${selected ? `<span class="teaching-generation-selected"><i class="fas fa-check"></i>${started ? "已开始正式生成" : "已选择"}</span>` : ""}
          </div>
          <p class="teaching-generation-option-description">${api.escapeHtml(option.description)}</p>
          <ul class="teaching-generation-option-highlights">${option.highlights.map((item) => `<li><i class="fas fa-check" aria-hidden="true"></i><span>${api.escapeHtml(String(item))}</span></li>`).join("")}</ul>
          <button type="button" class="teaching-generation-option-select" data-generation-option-message="${api.escapeHtml(message.id)}" data-generation-option-id="${api.escapeHtml(option.id)}" ${disabled ? "disabled" : ""}>
            ${selecting ? '<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>' : selected ? '<i class="fas fa-check" aria-hidden="true"></i>' : '<i class="fas fa-arrow-right" aria-hidden="true"></i>'}
            <span>${api.escapeHtml(buttonLabel)}</span>
          </button>
        </article>`;
        })
        .join("")}</div>
    </section>`;
  }

  function showGenerationOption(messageId, optionId, focus) {
    const messageKey = String(messageId || "");
    const optionKey = String(optionId || "");
    const picker = Array.from(
      elements.messages.querySelectorAll(
        "[data-generation-option-picker-message]",
      ),
    ).find(
      (node) =>
        String(node.dataset.generationOptionPickerMessage) === messageKey,
    );
    if (!picker) return;
    const tabs = Array.from(
      picker.querySelectorAll("[data-generation-option-view-id]"),
    );
    const panels = Array.from(
      picker.querySelectorAll("[data-generation-option-panel]"),
    );
    const activeTab = tabs.find(
      (tab) => String(tab.dataset.generationOptionViewId) === optionKey,
    );
    const activePanel = panels.find(
      (panel) => String(panel.dataset.generationOptionPanel) === optionKey,
    );
    if (!activeTab || !activePanel) return;
    state.generationOptionViews.set(messageKey, optionKey);
    picker.dataset.currentOptionId = optionKey;
    tabs.forEach((tab) => {
      const active = tab === activeTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel === activePanel;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    const counter = picker.querySelector("[data-generation-option-counter]");
    if (counter) {
      const requestedCount = Math.max(
        1,
        Number(picker.dataset.generationRequestedCount || 1),
      );
      counter.textContent = `${requestedCount > 1 ? `${requestedCount} 道题 · ` : ""}${tabs.indexOf(activeTab) + 1} / ${tabs.length}`;
    }
    if (focus) activeTab.focus();
  }

  function shiftGenerationOption(button, delta) {
    const picker = button.closest("[data-generation-option-picker-message]");
    if (!picker) return;
    const tabs = Array.from(
      picker.querySelectorAll("[data-generation-option-view-id]"),
    );
    if (!tabs.length) return;
    const current = tabs.findIndex(
      (tab) =>
        String(tab.dataset.generationOptionViewId) ===
        String(picker.dataset.currentOptionId),
    );
    const next = (Math.max(current, 0) + delta + tabs.length) % tabs.length;
    showGenerationOption(
      button.dataset.generationOptionViewMessage,
      tabs[next].dataset.generationOptionViewId,
      true,
    );
  }

  function defaultGenerationDifficulties(count) {
    const distributions = {
      1: ["按当前方案"],
      2: ["简单", "困难"],
      3: ["简单", "中等", "困难"],
      4: ["简单", "简单", "中等", "困难"],
      5: ["简单", "简单", "中等", "中等", "困难"],
    };
    return distributions[count] || Array.from({ length: count }, () => "按当前方案");
  }

  function generationConfirmationItems(bundle, option, count) {
    const baseArguments =
      bundle.baseArguments && typeof bundle.baseArguments === "object"
        ? bundle.baseArguments
        : {};
    const constraints =
      baseArguments.constraints && typeof baseArguments.constraints === "object"
        ? baseArguments.constraints
        : {};
    const topics = Array.isArray(constraints.batchTopics)
      ? constraints.batchTopics.map((item) => String(item || "").trim())
      : [];
    const difficulties = defaultGenerationDifficulties(count);
    return Array.from({ length: count }, (_, offset) => ({
      itemIndex: offset + 1,
      title:
        topics.length === count && topics[offset]
          ? topics[offset]
          : count === 1
            ? String(option.title || "独立 CTF 题目")
            : `${String(option.title || "独立 CTF 题目")} · 第 ${offset + 1} 题`,
      difficulty: difficulties[offset],
    }));
  }

  function generationConfirmationScope(bundle) {
    const dojo = currentDojo();
    const baseArguments =
      bundle.baseArguments && typeof bundle.baseArguments === "object"
        ? bundle.baseArguments
        : {};
    const moduleIndex = Number(
      baseArguments.moduleIndex !== undefined
        ? baseArguments.moduleIndex
        : state.thread && state.thread.moduleIndex,
    );
    const module =
      dojo &&
      Array.isArray(dojo.modules) &&
      dojo.modules.find((item) => Number(item.index) === moduleIndex);
    return {
      course: (dojo && dojo.name) || "尚未选择课程",
      module: (module && module.name) || "尚未选择章节",
    };
  }

  function generationDifficultySummary(items) {
    const counts = new Map();
    items.forEach((item) => {
      const difficulty = String(item.difficulty || "按当前方案");
      counts.set(difficulty, Number(counts.get(difficulty) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => `${label} ${count}`)
      .join(" · ");
  }

  function syncGenerationDifficultySummary() {
    const target = elements.generationConfirmContext?.querySelector(
      "[data-generation-difficulty-summary]",
    );
    if (!target) return;
    const rows = Array.from(
      elements.generationConfirmItems.querySelectorAll(
        "[data-generation-plan-item]",
      ),
    ).map((row) => ({
      difficulty: String(
        row.querySelector("[data-generation-plan-difficulty]")?.value ||
          "按当前方案",
      ),
    }));
    target.textContent = `难度分布：${generationDifficultySummary(rows)}`;
  }

  function openGenerationConfirmation(message, option, bundle, selectionData) {
    if (!elements.generationConfirmDialog) return false;
    const count = Math.max(
      1,
      Number((bundle.baseArguments || {}).challengeCount || 1),
    );
    const items = generationConfirmationItems(bundle, option, count);
    const scope = generationConfirmationScope(bundle);
    state.pendingGenerationConfirmation = {
      message,
      option,
      bundle,
      selectionData,
      count,
    };
    elements.generationConfirmContext.innerHTML = `<span><i class="fas fa-book" aria-hidden="true"></i>${api.escapeHtml(scope.course)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i><span><i class="fas fa-layer-group" aria-hidden="true"></i>${api.escapeHtml(scope.module)}</span><span><i class="fas fa-flag" aria-hidden="true"></i>CTF 实践题</span><span><i class="fas fa-signal" aria-hidden="true"></i><b data-generation-difficulty-summary>难度分布：${api.escapeHtml(generationDifficultySummary(items))}</b></span><span class="is-contract"><i class="fas fa-shield-alt" aria-hidden="true"></i>${count} 道彼此独立 · 草稿 · 独立环境与动态 Flag</span>`;
    elements.generationConfirmSummary.textContent = `请逐项核对或修改标题与难度。确认前不会创建题目、环境或学生可见内容；确认后将启动 ${count} 个可独立重试的任务。`;
    elements.generationConfirmItems.innerHTML = items
      .map(
        (item) => `<fieldset class="teaching-generation-confirm-item" data-generation-plan-item="${item.itemIndex}">
          <legend><span>${item.itemIndex}</span>第 ${item.itemIndex} 道独立题目</legend>
          <label><span>拟定标题</span><input type="text" maxlength="80" minlength="2" required value="${api.escapeHtml(item.title)}" data-generation-plan-title /></label>
          <label><span>难度</span><select data-generation-plan-difficulty>
            ${["简单", "中等", "困难", "按当前方案"].map((value) => `<option value="${value}"${value === item.difficulty ? " selected" : ""}>${value}</option>`).join("")}
          </select></label>
        </fieldset>`,
      )
      .join("");
    elements.generationConfirmError.hidden = true;
    elements.generationConfirmError.textContent = "";
    elements.generationConfirmSubmit.disabled = false;
    elements.generationConfirmSubmit.querySelector("span").textContent =
      `确认并生成 ${count} 道题`;
    elements.generationConfirmDialog.showModal();
    elements.generationConfirmItems.querySelector("input")?.focus();
    return true;
  }

  function closeGenerationConfirmation() {
    if (elements.generationConfirmDialog?.open) {
      elements.generationConfirmDialog.close();
    }
    state.pendingGenerationConfirmation = null;
  }

  function readConfirmedGenerationPlan() {
    const pending = state.pendingGenerationConfirmation;
    if (!pending) throw new Error("生成计划已经失效，请重新选择方案。");
    const items = Array.from(
      elements.generationConfirmItems.querySelectorAll(
        "[data-generation-plan-item]",
      ),
    ).map((row, offset) => ({
      itemIndex: offset + 1,
      title: String(row.querySelector("[data-generation-plan-title]")?.value || "").trim(),
      difficulty: String(
        row.querySelector("[data-generation-plan-difficulty]")?.value ||
          "按当前方案",
      ),
    }));
    if (
      items.length !== pending.count ||
      items.some((item) => item.title.length < 2 || item.title.length > 80)
    ) {
      throw new Error(`请为 ${pending.count} 道题分别填写 2 到 80 字的标题。`);
    }
    if (new Set(items.map((item) => item.title)).size !== pending.count) {
      throw new Error("每道独立题目的标题需要互不相同。");
    }
    return {
      requestedCount: pending.count,
      independence: "independent_challenges",
      exerciseMode: "CTF",
      publishMode: "draft",
      items,
    };
  }

  async function confirmSelectedGeneration(event) {
    event.preventDefault();
    const pending = state.pendingGenerationConfirmation;
    if (!pending) return;
    let generationPlan;
    try {
      generationPlan = readConfirmedGenerationPlan();
    } catch (error) {
      elements.generationConfirmError.textContent = error.message;
      elements.generationConfirmError.hidden = false;
      elements.generationConfirmItems
        .querySelector(":invalid, [data-generation-plan-title]")
        ?.focus();
      return;
    }
    const { message, option, selectionData } = pending;
    const submit = elements.generationConfirmSubmit;
    submit.disabled = true;
    submit.innerHTML = '<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>正在建立独立任务…</span>';
    elements.generationConfirmError.hidden = true;
    try {
      const result = await handleAgentTool(selectionData.proposal, {
        idempotencyKey: `generation-option-formal-${message.id}-${option.id}`,
        sourceJobId: selectionData.sourceJobId,
        generationSelection: {
          sourceMessageId: message.id,
          optionId: option.id,
        },
        generationPlan,
        approvalGranted: true,
      });
      if (result && result.executed === false) {
        throw new Error("正式生成尚未启动，请再次确认生成计划。");
      }
      closeGenerationConfirmation();
      api.showNotice(
        elements.notice,
        `已创建 ${generationPlan.requestedCount} 个彼此独立的生成与验证任务。`,
        "success",
      );
      await loadThreads();
      schedulePoll();
    } catch (error) {
      elements.generationConfirmError.textContent =
        error instanceof Error ? error.message : String(error);
      elements.generationConfirmError.hidden = false;
      submit.disabled = false;
      submit.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i><span>确认并生成 ${pending.count} 道题</span>`;
    }
  }

  async function selectGenerationOption(message, optionId) {
    if (!message || !state.thread) return;
    const bundle = generationOptionsForMessage(message);
    const option =
      bundle && bundle.options.find((item) => item.id === optionId);
    if (!bundle || !option)
      throw new Error("所选生成方案已经失效，请刷新后重试。");
    const key = `${message.id}:${option.id}`;
    if (state.selectingGenerationOptions.has(key)) return;
    state.selectingGenerationOptions.add(key);
    renderMessages();
    try {
      const data = unwrap(
        await api.request(
          `/teaching/threads/${encodeURIComponent(state.thread.id)}/messages/${encodeURIComponent(message.id)}/generation-options/${encodeURIComponent(option.id)}/select`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "Idempotency-Key": `generation-option-${message.id}-${option.id}`,
            },
            body: JSON.stringify({}),
          },
        ),
      );
      state.thread = data.thread || state.thread;
      syncAttachmentSources(state.thread);
      populateDojos(state.thread.dojoId);
      renderMessages();
      if (
        data.proposal &&
        data.proposal.tool === "challenge.generate" &&
        openGenerationConfirmation(message, option, bundle, data)
      ) {
        return;
      }
      const result = await handleAgentTool(data.proposal, {
        idempotencyKey: `generation-option-formal-${message.id}-${option.id}`,
        agentContinuation:
          data.proposal && data.proposal.tool === "candidate.generate",
        sourceJobId: data.sourceJobId,
        generationSelection: {
          sourceMessageId: message.id,
          optionId: option.id,
        },
        approvalGranted: true,
      });
      if (result && result.executed === false) {
        throw new Error("正式生成尚未启动，请再次点击已选择的方案重试。");
      }
      api.showNotice(
        elements.notice,
        `已按“${option.title}”开始正式生成。`,
        "success",
      );
      await loadThreads();
      schedulePoll();
    } finally {
      state.selectingGenerationOptions.delete(key);
      renderMessages();
    }
  }

  function directSuggestionText(value) {
    let command = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    if (!command) return "";
    command = command
      .replace(/^[\s“”‘’"'（(\[【]+|[\s“”‘’"'）)\]】]+$/gu, "")
      .replace(/^(?:[-–—•·]|\d+[.)、])\s*/u, "")
      .replace(/[。！？；;，,.]+$/u, "")
      .trim();
    const conditionalPrefixes = [
      /^帮我完成这项后续操作\s*[:：]\s*/u,
      /^(?:如(?:果)?|若)(?:你)?(?:还)?(?:确认)?需(?:要)?我(?:同时|另外|再|继续)?/u,
      /^(?:如(?:果)?|若)(?:你)?(?:还)?(?:确认)?需(?:要)?/u,
      /^如果你(?:想|希望)(?:让我|由我)?/u,
      /^(?:是否(?:还)?(?:要|需要)?|要不要)(?:让我|由我|我)?/u,
      /^(?:你)?可以让我(?:再|继续|另外|同时)?/u,
      /^我(?:也|还|仍然?)?可以(?:再|继续|另外|同时)?(?:为你|帮你)?/u,
      /^(?:你)?(?:还|也)?可以(?:再|继续|进一步|另外|同时)?/u,
      /^(?:可以|可(?:再|继续|进一步|另外|同时))/u,
      /^(?:下一步|后续)(?:还|也)?(?:可以|可)?(?:再|继续|进一步)?/u,
      /^(?:建议|推荐)(?:你|教师)?(?:可以|可)?/u,
    ];
    let changed = true;
    while (changed && command) {
      changed = false;
      for (const prefix of conditionalPrefixes) {
        if (!prefix.test(command)) continue;
        command = command
          .replace(prefix, "")
          .replace(/^[，,:：\s]+/u, "")
          .trim();
        changed = true;
        break;
      }
    }
    command = command
      .replace(/^(?:还)?需要(?:我|你)?/u, "")
      .replace(/^读取后(?:还)?可(?:继续)?/u, "继续")
      .replace(
        /[，,；;]\s*(?:如果|若|如需|我(?:也|还)?可以|可以让我|可另行|是否需要)[\s\S]*$/u,
        "",
      )
      .replace(/^请(?:帮我)?/u, "")
      .replace(/^帮我/u, "")
      .replace(/[吗么呢吧]$/u, "")
      .trim();
    if (!command) return "";
    const actions =
      "继续|打开|查看|读取|切换|基于|根据|针对|按照|按|为|对|布置|生成|创建|分析|修改|调整|补充|导出|下载|发布|检查|比较|选择|添加|删除|启动|结束|重新|把|将|给|提供|完成|应用|加入|移除|重试|保存|更新|验证|运行|执行|编写|制作|整理|转换|同步|设置|列出|总结|解释|优化|审阅|合并|拆分|设计|起草|输出|返回|提交|停止|可视化";
    const actionPrefix = new RegExp(`^(?:${actions})`, "u");
    if (!actionPrefix.test(command)) {
      const subjectModal = command.match(
        new RegExp(
          `^(.{1,100}?)(?:还|也)?(?:可以|可)(?:再|继续|进一步|同时|另外)?(${actions})(.*)$`,
          "u",
        ),
      );
      if (subjectModal)
        command =
          `${subjectModal[2]}${subjectModal[1]}${subjectModal[3]}`.trim();
    }
    if (!actionPrefix.test(command)) {
      const inlineAction = command.match(
        /^(.*?)((?:生成|创建|分析|修改|调整|补充|导出|发布|检查|添加|删除|整理|转换|设置|总结|优化|设计|输出|提交|停止|可视化))(.*)$/u,
      );
      if (inlineAction && inlineAction[1].trim()) {
        command =
          `${inlineAction[2]}${inlineAction[1]}${inlineAction[3]}`.trim();
      }
    }
    if (!actionPrefix.test(command)) return "";
    return `帮我${command.replace(/[。！？；;，,.]+$/u, "").trim()}。`;
  }

  function renderAgentActions(message) {
    const metadata = message.metadata || {};
    const proposals = Array.isArray(metadata.toolProposals)
      ? metadata.toolProposals
      : [];
    const visibleProposals = proposals
      .map((proposal, index) => ({ proposal, index }))
      .filter(
        ({ proposal, index }) =>
          proposal.tool !== "dojo.select" &&
          proposal.requiresConfirmation !== true &&
          !proposalDecision(message, index) &&
          !state.appliedActionProposals.has(
            `${message.id}:${index}:${proposal.tool}`,
          ) &&
          !state.executingProposalKeys.has(
            `${message.id}:${index}:${proposal.tool}`,
          ),
      );
    const suggestions = (
      Array.isArray(metadata.suggestions) ? metadata.suggestions : []
    )
      .map((suggestion, index) => ({
        suggestion: directSuggestionText(suggestion),
        index,
      }))
      .filter(({ suggestion }) => Boolean(suggestion));
    if (!visibleProposals.length && !suggestions.length) return "";
    const firstCourseCreate =
      visibleProposals[0] &&
      visibleProposals[0].proposal.tool === "course.create";
    const hasGenerationAfterCourse =
      firstCourseCreate &&
      visibleProposals.some(
        ({ proposal }) => proposal.tool === "candidate.generate",
      );
    const renderedProposals = hasGenerationAfterCourse
      ? visibleProposals.slice(0, 1)
      : visibleProposals;
    const failures = renderedProposals
      .map(({ proposal, index }) =>
        state.proposalFailures.get(proposalKey(message, index, proposal)),
      )
      .filter(Boolean);
    return `<section class="teaching-next-actions" aria-label="下一步">
      <header><span><i class="fas fa-route"></i><strong>${visibleProposals.length ? "下一步操作" : "后续命令"}</strong></span><small>${visibleProposals.length ? "智能体不会在未经确认时执行高影响操作" : "点击后填入输入框，可编辑再发送"}</small></header>
      <div class="teaching-agent-actions">
      ${failures.map((failure) => `<div class="teaching-agent-action-error" role="alert"><i class="fas fa-exclamation-circle"></i><span><strong>操作未完成</strong>${api.escapeHtml(failure)}</span></div>`).join("")}
      ${renderedProposals.map(({ proposal, index }) => `<button type="button" data-agent-tool-message="${api.escapeHtml(message.id)}" data-agent-tool-index="${index}" title="${api.escapeHtml(proposal.reason || "")}">${api.escapeHtml(hasGenerationAfterCourse ? "创建课程并继续生成" : toolLabels[proposal.tool] || proposal.tool)}</button>`).join("")}
      ${visibleProposals.length ? "" : suggestions.map(({ suggestion, index }) => `<button type="button" class="is-suggestion" data-agent-suggestion-message="${api.escapeHtml(message.id)}" data-agent-suggestion-index="${index}">${api.escapeHtml(suggestion)}</button>`).join("")}
      </div>
    </section>`;
  }

  const automaticReadTools = new Set([
    "dojo.select",
    "course.list",
    "course.read",
    "course.members",
    "assignment.list",
    "assignment.read",
    "assignment.submissions",
    "progress.read",
    "material.list",
    "artifact.list",
    "job.list",
    "approval.list",
    "classroom.list",
  ]);

  const automaticActionTools = new Set([
    "candidate.generate",
    "challenge.generate",
    "assignment.generate",
    "material.analyze",
    "material.add_to_module",
    "artifact.revise",
    "classroom.prepare",
  ]);

  function canExecuteAutomatically(proposal) {
    return (
      !proposal.requiresConfirmation && automaticActionTools.has(proposal.tool)
    );
  }

  function proposalKey(message, index, proposal) {
    return `${message.id}:${index}:${proposal.tool}`;
  }

  function proposalDecision(message, index) {
    const metadata = (message && message.metadata) || {};
    const decisions = metadata.toolProposalDecisions;
    if (!decisions || typeof decisions !== "object") return null;
    const stored = decisions[String(index)];
    if (typeof stored === "string") return { decision: stored.toUpperCase() };
    if (!stored || typeof stored !== "object") return null;
    const decision = String(stored.decision || "").toUpperCase();
    return ["APPROVED", "REJECTED"].includes(decision)
      ? { ...stored, decision }
      : null;
  }

  const approvalActionLabels = {
    "review-self-artifact": "审核学生自主成果",
    "publish-question-artifact": "发布 CTF 实践题",
    "publish-teaching-artifact": "发布课程内容",
    "apply-material-chapters": "把课件分析写入课程章节",
    "control-teaching-session": "变更实训课堂状态",
  };

  function pendingProposalApprovals() {
    if (!state.thread || state.thread.status !== "ACTIVE") return [];
    return (state.thread.messages || []).flatMap((message) => {
      if (message.role !== "assistant") return [];
      const metadata = message.metadata || {};
      if (metadata.pending !== false) return [];
      const proposals = Array.isArray(metadata.toolProposals)
        ? metadata.toolProposals
        : [];
      return proposals.flatMap((proposal, index) => {
        if (
          !proposal ||
          proposal.tool === "dojo.select" ||
          proposal.requiresConfirmation !== true ||
          proposalDecision(message, index) ||
          proposalWasApplied(message, index, proposal) ||
          state.executingProposalKeys.has(proposalKey(message, index, proposal))
        )
          return [];
        const key = `proposal:${proposalKey(message, index, proposal)}`;
        if (state.resolvingApprovalKeys.has(key)) return [];
        return [
          {
            kind: "proposal",
            key,
            message,
            proposal,
            index,
            created: message.created || "",
          },
        ];
      });
    });
  }

  function pendingStoredApprovals() {
    if (!state.thread || state.thread.status !== "ACTIVE") return [];
    return state.actions
      .filter((action) => String(action.status || "") === "AWAITING_APPROVAL")
      .flatMap((action) => {
        const key = `action:${action.id}`;
        return state.resolvingApprovalKeys.has(key)
          ? []
          : [
              {
                kind: "action",
                key,
                action,
                created: action.created || "",
              },
            ];
      });
  }

  function pendingApprovalItems() {
    return [...pendingProposalApprovals(), ...pendingStoredApprovals()].sort(
      (left, right) =>
        String(left.created || "").localeCompare(String(right.created || "")),
    );
  }

  function approvalItemCopy(item) {
    if (item.kind === "proposal") {
      const proposal = item.proposal || {};
      return {
        title: toolLabels[proposal.tool] || proposal.tool || "执行教学操作",
        detail:
          String(proposal.reason || "").trim() ||
          "批准后，智能体将立即执行这项操作并记录结果。",
        approveLabel:
          proposal.tool === "artifact.request_publish"
            ? "批准并发布"
            : "批准执行",
      };
    }
    const action = item.action || {};
    const publishing = [
      "publish-question-artifact",
      "publish-teaching-artifact",
    ].includes(action.type);
    const request = action.request || {};
    return {
      title:
        action.title ||
        request.title ||
        approvalActionLabels[action.type] ||
        "执行课程变更",
      detail:
        String(request.reason || request.description || "").trim() ||
        (publishing
          ? "批准后立即发布；拒绝后不会更改当前内容。"
          : "批准后立即执行；拒绝后不会产生变更。"),
      approveLabel: publishing ? "批准并发布" : "批准执行",
    };
  }

  function renderApprovalTray() {
    if (!elements.approvalTray) return;
    const items = pendingApprovalItems();
    const item = items[0];
    root.classList.toggle("has-pending-approval", Boolean(item));
    if (!item) {
      elements.approvalTray.hidden = true;
      elements.approvalTray.innerHTML = "";
      return;
    }
    const copy = approvalItemCopy(item);
    const remaining = items.length - 1;
    elements.approvalTray.hidden = false;
    elements.approvalTray.innerHTML = `<div class="teaching-approval-prompt" role="region" aria-label="需要批准：${api.escapeHtml(copy.title)}">
      <span class="teaching-approval-prompt-icon" aria-hidden="true"><i class="fas fa-shield-alt"></i></span>
      <div class="teaching-approval-prompt-copy">
        <span class="teaching-approval-prompt-label">需要批准 <small>智能体已暂停，等待你的决定</small></span>
        <strong>${api.escapeHtml(copy.title)}</strong>
        <p>${api.escapeHtml(copy.detail)}</p>
        ${remaining ? `<small class="teaching-approval-prompt-count">另有 ${remaining} 项待批准</small>` : ""}
      </div>
      <div class="teaching-approval-prompt-actions">
        <button type="button" data-approval-decision="REJECTED">拒绝</button>
        <button type="button" class="is-primary" data-approval-decision="APPROVED">${api.escapeHtml(copy.approveLabel)}</button>
      </div>
    </div>`;
    elements.approvalTray
      .querySelectorAll("[data-approval-decision]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const decision = button.dataset.approvalDecision;
          try {
            if (item.kind === "proposal")
              await handleProposalApproval(item, decision);
            else await handleStoredApproval(item, decision);
          } catch (error) {
            showError(error);
          }
        });
      });
  }

  function proposalWasApplied(message, index, proposal) {
    const key = proposalKey(message, index, proposal);
    return state.appliedActionProposals.has(key);
  }

  async function preflightDestructiveProposal(proposal) {
    if (!proposal || proposal.tool !== "course.delete") return true;
    const dojo = currentDojo();
    const expected = (dojo && dojo.name) || "";
    const entered = await window.AISecEduUI.prompt(
      `删除课程会同时删除其章节、题目和课程关联数据。请输入课程名称“${expected}”确认。`,
      {
        title: "确认删除课程",
        inputLabel: "课程名称",
        confirmLabel: "确认删除",
      },
    );
    return entered === expected;
  }

  async function persistProposalDecision(item, decision) {
    const data = unwrap(
      await api.json(
        "POST",
        `/teaching/threads/${encodeURIComponent(state.thread.id)}/messages/${encodeURIComponent(item.message.id)}/tool-proposals/${encodeURIComponent(item.index)}/decision`,
        {
          decision,
          confirmed: true,
        },
      ),
    );
    const metadata = item.message.metadata || {};
    item.message.metadata = {
      ...metadata,
      toolProposalDecisions: {
        ...(metadata.toolProposalDecisions || {}),
        [String(item.index)]: data.decision,
      },
    };
    state.thread = data.thread || state.thread;
    return data;
  }

  function focusComposerAfterApproval() {
    if (
      !pendingApprovalItems().length &&
      state.thread &&
      state.thread.status === "ACTIVE" &&
      !elements.input.disabled
    )
      elements.input.focus();
  }

  async function handleProposalApproval(item, decision) {
    if (!state.thread || state.resolvingApprovalKeys.has(item.key)) return;
    if (
      decision === "APPROVED" &&
      !(await preflightDestructiveProposal(item.proposal))
    )
      return;
    state.resolvingApprovalKeys.add(item.key);
    updateAgentChrome();
    try {
      await persistProposalDecision(item, decision);
      renderMessages();
      if (decision === "REJECTED") {
        api.showNotice(elements.notice, "已拒绝这项操作。", "warning");
        return;
      }
      await executeProposalSequence(item.message, item.index, false, {
        approvalGranted: true,
      });
      api.showNotice(
        elements.notice,
        "已批准，智能体正在继续执行。",
        "success",
      );
    } finally {
      state.resolvingApprovalKeys.delete(item.key);
      updateAgentChrome();
      focusComposerAfterApproval();
    }
  }

  async function handleStoredApproval(item, decision) {
    if (state.resolvingApprovalKeys.has(item.key)) return;
    state.resolvingApprovalKeys.add(item.key);
    updateAgentChrome();
    try {
      const action = await decideAction(item.action.id, decision, {
        skipConfirmation: true,
      });
      if (
        action &&
        action.type === "control-teaching-session" &&
        decision === "APPROVED"
      ) {
        const command = (item.action.request || {}).command;
        if (command === "start") {
          state.phase = "IN_CLASS";
          await saveContext();
        }
        await loadSessions();
      }
    } finally {
      state.resolvingApprovalKeys.delete(item.key);
      updateAgentChrome();
      focusComposerAfterApproval();
    }
  }

  async function continueAgentAfterTools(message, executedIndexes) {
    if (!message || !executedIndexes.length || !state.thread) return;
    const metadata = message.metadata || {};
    if (generationOptionsForMessage(message)) return;
    const proposals = Array.isArray(metadata.toolProposals)
      ? metadata.toolProposals
      : [];
    const hasPendingProposal = proposals.some(
      (proposal, index) =>
        proposal.tool !== "dojo.select" &&
        !proposalDecision(message, index) &&
        !proposalWasApplied(message, index, proposal) &&
        !state.proposalFailures.has(proposalKey(message, index, proposal)),
    );
    if (hasPendingProposal) return;
    const depth = Number(metadata.agentLoopDepth || 0);
    if (!Number.isFinite(depth) || depth >= 5) return;
    const indexes = [...new Set(executedIndexes)].sort(
      (left, right) => left - right,
    );
    const key = `${message.id}:${indexes.join("-")}`;
    if (state.continuationRequests.has(key)) return;
    state.continuationRequests.add(key);
    setBusy(true);
    try {
      const data = unwrap(
        await api.request(`/teaching/threads/${state.thread.id}/messages`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": `agent-loop-${message.id}-${indexes.join("-")}`,
          },
          body: JSON.stringify({
            agentContinuation: true,
            action: "continue",
            sourceMessageId: message.id,
            proposalIndexes: indexes,
          }),
        }),
      );
      state.thread = data.thread;
      if (data.job) {
        state.autoExecuteJobIds.add(String(data.job.id));
        state.trackedJobs.set(data.job.id, data.job);
        state.selectedJobId = data.job.id;
      }
      populateDojos(state.thread.dojoId);
      renderMessages();
      renderJobs();
      loadThreads().catch(showError);
      schedulePoll();
    } catch (error) {
      state.continuationRequests.delete(key);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function executeProposalSequence(
    message,
    startIndex,
    automatic,
    options,
  ) {
    const proposals =
      message &&
      message.metadata &&
      Array.isArray(message.metadata.toolProposals)
        ? message.metadata.toolProposals
        : [];
    const executedIndexes = [];
    for (let index = startIndex; index < proposals.length; index += 1) {
      const proposal = proposals[index];
      const key = proposalKey(message, index, proposal);
      if (
        proposalWasApplied(message, index, proposal) ||
        state.executingProposalKeys.has(key)
      )
        continue;
      if (automatic && state.proposalFailures.has(key)) break;
      if (
        automatic &&
        !automaticReadTools.has(proposal.tool) &&
        !canExecuteAutomatically(proposal)
      )
        break;
      if (!automatic && index > startIndex) break;
      const retryingFailedProposal =
        !automatic && state.proposalFailures.has(key);
      if (!automatic) state.proposalFailures.delete(key);
      state.executingProposalKeys.add(key);
      renderMessages();
      try {
        const result = await handleAgentTool(proposal, {
          idempotencyKey: retryingFailedProposal
            ? `agent-proposal:${message.id}:${index}:retry:${Date.now()}`
            : `agent-proposal:${message.id}:${index}`,
          agentContinuation: proposal.tool === "candidate.generate",
          sourceJobId: message.metadata && message.metadata.jobId,
          approvalGranted: Boolean(options && options.approvalGranted),
        });
        if (result && result.executed === false) {
          state.executingProposalKeys.delete(key);
          renderMessages();
          break;
        }
        state.executingProposalKeys.delete(key);
        state.appliedActionProposals.add(key);
        executedIndexes.push(index);
      } catch (error) {
        state.executingProposalKeys.delete(key);
        state.proposalFailures.set(
          key,
          error instanceof Error ? error.message : String(error),
        );
        renderMessages();
        throw error;
      }
    }
    renderMessages();
    await continueAgentAfterTools(message, executedIndexes);
    return executedIndexes;
  }

  async function applyAutomaticTools(messages) {
    const message = [...messages]
      .reverse()
      .find(
        (item) =>
          item.role === "assistant" &&
          item.metadata &&
          state.autoExecuteJobIds.has(String(item.metadata.jobId || "")),
      );
    if (!message) return;
    const proposals = Array.isArray(message.metadata.toolProposals)
      ? message.metadata.toolProposals
      : [];
    const startIndex = proposals.findIndex(
      (proposal, index) =>
        !proposalDecision(message, index) &&
        !proposalWasApplied(message, index, proposal) &&
        !state.executingProposalKeys.has(
          proposalKey(message, index, proposal),
        ) &&
        !state.proposalFailures.has(proposalKey(message, index, proposal)),
    );
    if (startIndex < 0) return;
    const proposal = proposals[startIndex];
    if (
      automaticReadTools.has(proposal.tool) ||
      canExecuteAutomatically(proposal)
    ) {
      await executeProposalSequence(message, startIndex, true);
    }
  }

  const courseTools = new Set(
    Object.keys(toolLabels).filter(
      (name) =>
        name.startsWith("course.") ||
        name.startsWith("module.") ||
        name.startsWith("challenge.") ||
        name.startsWith("assignment.") ||
        name === "material.add_to_module",
    ),
  );
  const courseNavigationTools = new Set([
    "course.open",
    "course.studio",
    "course.settings",
    "module.open",
    "challenge.open",
  ]);

  function moduleForArguments(args) {
    const dojo = currentDojo();
    if (!dojo) return null;
    const index =
      args && args.moduleIndex !== undefined && args.moduleIndex !== null
        ? Number(args.moduleIndex)
        : elements.module.value === ""
          ? null
          : Number(elements.module.value);
    return (dojo.modules || []).find((item) => item.index === index) || null;
  }

  function navigateCourseTool(tool, args) {
    const dojo = currentDojo();
    if (!dojo || !dojo.referenceId) throw new Error("请先选择目标课程。");
    if (tool === "course.open")
      window.location.href = `/${encodeURIComponent(dojo.referenceId)}`;
    if (tool === "course.studio")
      window.location.href = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=questions`;
    if (tool === "course.settings")
      window.location.href = `/teacher/courses?dojo=${encodeURIComponent(dojo.referenceId)}&tab=overview`;
    if (tool === "module.open" || tool === "challenge.open") {
      const module = moduleForArguments(args);
      if (!module) throw new Error("目标章节不存在或不在当前课程中。");
      const base = `/${encodeURIComponent(dojo.referenceId)}/${encodeURIComponent(module.id)}`;
      window.location.href =
        tool === "challenge.open"
          ? `${base}/${encodeURIComponent(String(args.challengeId || ""))}`
          : base;
    }
  }

  async function confirmCourseTool(proposal, options) {
    const tool = proposal.tool;
    if (!proposal.requiresConfirmation) return true;
    if (options && options.approvalGranted) return true;
    const dojo = currentDojo();
    if (tool === "course.delete") {
      const expected = (dojo && dojo.name) || "";
      const entered = await window.AISecEduUI.prompt(
        `删除课程会同时删除其章节、题目和课程关联数据。请输入课程名称“${expected}”确认。`,
        {
          title: "确认删除课程",
          inputLabel: "课程名称",
          confirmLabel: "确认删除",
        },
      );
      return entered === expected;
    }
    const operationLabel =
      tool === "course.create" &&
      proposal.arguments &&
      proposal.arguments.initialModuleName
        ? "创建课程与内容章节，并继续生成"
        : toolLabels[tool] || tool;
    return window.AISecEduUI.confirm(
      `确认执行“${operationLabel}”？系统会重新校验课程权限，并记录目标、确认人和结果。`,
      { title: "确认教学操作", confirmLabel: "确认并继续" },
    );
  }

  async function executeCourseTool(proposal, options) {
    if (!state.thread) throw new Error("教学对话尚未就绪。");
    if (courseNavigationTools.has(proposal.tool)) {
      navigateCourseTool(proposal.tool, proposal.arguments || {});
      return { executed: true };
    }
    if (!(await confirmCourseTool(proposal, options)))
      return { executed: false };
    const idempotencyKey =
      (options && options.idempotencyKey) ||
      (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`);
    setBusy(true);
    try {
      const data = unwrap(
        await api.request("/teaching/agent-tools/execute", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            threadId: state.thread.id,
            tool: proposal.tool,
            arguments: proposal.arguments || {},
            confirmed: Boolean(proposal.requiresConfirmation),
            sourceJobId: (options && options.sourceJobId) || undefined,
            generationSelection:
              (options && options.generationSelection) || undefined,
            generationPlan: (options && options.generationPlan) || undefined,
          }),
        }),
      );
      state.context = unwrap(
        await api.request("/teaching/context?view=teacher"),
      );
      state.thread = data.thread || state.thread;
      syncAttachmentSources(state.thread);
      populateDojos(state.thread.dojoId);
      renderMessages();
      collectJobs();
      await loadThreads();
      if (elements.drawer.classList.contains("is-open")) await loadActions();
      api.showNotice(
        elements.notice,
        data.message || "课程操作已完成。",
        "success",
      );
      return { executed: true, data };
    } finally {
      setBusy(false);
    }
  }

  async function completeArtifactPublication(initialAction) {
    let action = initialAction;
    const deadline = Date.now() + 20 * 60 * 1000;
    while (action && action.status === "VALIDATING") {
      if (Date.now() >= deadline) throw new Error("发布检查超时，请稍后重试");
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const data = unwrap(
        await api.request(
          `/teaching/actions/${encodeURIComponent(action.id)}/decision`,
        ),
      );
      action = data.action;
    }
    if (!action) throw new Error("发布失败，请稍后重试");
    if (action.status === "AWAITING_APPROVAL") {
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/actions/${encodeURIComponent(action.id)}/decision`,
          {
            decision: "APPROVED",
            confirmed: true,
            comment: "教师在全局智能体中要求发布",
          },
        ),
      );
      action = data.action;
    }
    if (action.status !== "APPROVED") {
      throw new Error(
        action.error ||
          (action.status === "REJECTED"
            ? "发布已取消"
            : "发布失败，请稍后重试"),
      );
    }
    return action;
  }

  async function handleAgentTool(proposal, options) {
    const args = proposal.arguments || {};
    if (courseTools.has(proposal.tool))
      return executeCourseTool(proposal, options);
    if (proposal.tool === "dojo.select" && args.referenceId) {
      const dojo = (state.context.teacherDojos || []).find(
        (item) => item.referenceId === args.referenceId,
      );
      if (!dojo) throw new Error("目标课程不在当前教师权限范围内。");
      elements.dojo.value = String(dojo.id);
      populateModules();
      if (args.moduleIndex !== undefined && args.moduleIndex !== null) {
        elements.module.value = String(args.moduleIndex);
      }
      await saveContext();
      return;
    }
    if (proposal.tool === "progress.read") return loadProgress();
    if (proposal.tool === "material.list") return loadMaterials();
    if (proposal.tool === "material.analyze" && args.materialId)
      return reanalyzeMaterial(args.materialId);
    if (
      proposal.tool === "material.apply_chapters" &&
      args.materialId &&
      Array.isArray(args.chapterIndexes)
    ) {
      if (!(await confirmCourseTool(proposal, options))) return;
      const staged = unwrap(
        await api.json(
          "POST",
          `/teaching/materials/${encodeURIComponent(args.materialId)}/apply-chapters`,
          {
            chapterIndexes: args.chapterIndexes,
          },
        ),
      );
      if (!staged.action) throw new Error("章节写入审批未建立。");
      unwrap(
        await api.json(
          "POST",
          `/teaching/actions/${encodeURIComponent(staged.action.id)}/decision`,
          {
            decision: "APPROVED",
            confirmed: true,
            comment: "教师在 AI 共创工作台中明确确认写入课件分析章节",
          },
        ),
      );
      state.context = unwrap(
        await api.request("/teaching/context?view=teacher"),
      );
      populateDojos(state.thread && state.thread.dojoId);
      await Promise.all([loadMaterials(), loadActions()]);
      api.showNotice(
        elements.notice,
        "课件分析章节已写入当前课程。",
        "success",
      );
      return;
    }
    if (proposal.tool === "artifact.list") return loadArtifacts();
    if (proposal.tool === "job.list") return pollJobs();
    if (proposal.tool === "approval.list") return loadActions();
    if (
      ["approval.approve", "approval.reject"].includes(proposal.tool) &&
      args.actionId
    ) {
      const decision =
        proposal.tool === "approval.approve" ? "APPROVED" : "REJECTED";
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/actions/${encodeURIComponent(args.actionId)}/decision`,
          {
            decision,
            confirmed: true,
            comment: "教师已在全局智能体对话中明确表达决定",
          },
        ),
      );
      await loadActions();
      renderJobs();
      const publishing =
        data.action &&
        ["publish-question-artifact", "publish-teaching-artifact"].includes(
          data.action.type,
        );
      api.showNotice(
        elements.notice,
        publishing
          ? decision === "APPROVED"
            ? "发布成功"
            : "已取消发布"
          : decision === "APPROVED"
            ? "操作完成"
            : "操作已取消",
        decision === "APPROVED" ? "success" : "warning",
      );
      return { executed: true, data };
    }
    if (proposal.tool === "classroom.list") return loadSessions();
    if (proposal.tool === "candidate.compare" && args.candidateSetId)
      return openCandidateSet(args.candidateSetId);
    if (proposal.tool === "artifact.open" && args.artifactId) {
      window.location.href = teacherArtifactHref(args.artifactId);
      return;
    }
    if (
      proposal.tool === "artifact.revise" &&
      args.artifactId &&
      args.instruction
    ) {
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/artifacts/${encodeURIComponent(args.artifactId)}/revise`,
          {
            instruction: String(args.instruction),
            expectedRevision: args.expectedRevision || undefined,
          },
        ),
      );
      if (data.job) state.trackedJobs.set(data.job.id, data.job);
      renderJobs();
      schedulePoll();
      api.showNotice(
        elements.notice,
        "已按自然语言要求启动内容修改，完成后可从结果卡片进入详情。",
        "success",
      );
      return;
    }
    if (proposal.tool === "artifact.validate" && args.artifactId) {
      window.location.href = teacherArtifactHref(args.artifactId, {
        action: "validate",
      });
      return;
    }
    if (proposal.tool === "artifact.request_publish" && args.artifactId) {
      if (!(await confirmCourseTool(proposal, options))) return;
      api.showNotice(elements.notice, "正在发布…", "info");
      try {
        const data = unwrap(
          await api.json(
            "POST",
            `/teaching/artifacts/${encodeURIComponent(args.artifactId)}/request-publish`,
            {
              expectedRevision: args.expectedRevision || undefined,
              sourceJobId: (options && options.sourceJobId) || undefined,
            },
          ),
        );
        const action = await completeArtifactPublication(data.action);
        await Promise.all([loadActions(), loadArtifacts()]);
        api.showNotice(elements.notice, "发布成功", "success");
        return { executed: true, data: { ...data, action } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          message.startsWith("发布") ? message : `发布失败：${message}`,
        );
      }
    }
    if (proposal.tool === "candidate.generate") {
      const count = Math.max(1, Math.min(4, Number(args.candidateCount || 1)));
      if ([2, 3, 4].includes(count)) elements.count.value = String(count);
      return sendMessage(
        String(
          args.prompt ||
            proposal.reason ||
            "根据对话中指定的课程和章节生成教学内容",
        ),
        String(args.artifactType || elements.type.value),
        {
          candidateMode: count === 1 ? "single" : "multiple",
          candidateCount: count,
          agentContinuation: Boolean(options && options.agentContinuation),
          sourceRefs: Array.isArray(args.sourceRefs)
            ? args.sourceRefs
            : undefined,
          generationSelection:
            (options && options.generationSelection) || undefined,
        },
      );
    }
    if (proposal.tool === "job.retry" && args.jobId) {
      return retryTrackedJob(args.jobId);
    }
    if (proposal.tool === "classroom.prepare") {
      const dojo = currentDojo();
      if (!dojo || !state.thread) return;
      await api
        .json("POST", "/teaching/sessions", {
          dojoId: dojo.id,
          moduleIndex:
            elements.module.value === "" ? null : Number(elements.module.value),
          threadId: state.thread.id,
          artifactId: args.artifactId || undefined,
          title: String(args.title || `${dojo.name} · 课中`),
        })
        .then(unwrap);
      await loadSessions();
      return;
    }
    if (proposal.tool === "classroom.request_start") {
      if (!args.sessionId) return startSession();
      const control = unwrap(
        await api.json(
          "POST",
          `/teaching/sessions/${encodeURIComponent(args.sessionId)}/control`,
          { command: "start" },
        ),
      );
      await decideAction(control.action.id, "APPROVED");
      return loadSessions();
    }
    if (proposal.tool === "classroom.request_end") {
      if (!args.sessionId) return endSession();
      const control = unwrap(
        await api.json(
          "POST",
          `/teaching/sessions/${encodeURIComponent(args.sessionId)}/control`,
          { command: "end" },
        ),
      );
      await decideAction(control.action.id, "APPROVED");
      return loadSessions();
    }
    elements.input.value = proposal.reason || "请继续说明下一步操作";
    elements.input.focus();
  }

  function syntheticProcessCopy(value) {
    const text = String(value || "").trim();
    return /^(正在理解完整要求|正在按你的要求制作|正在按你的要求准备|正在按已选择的|正在结合工具结果|已建立失败任务的人工重试|生成结果已准备好)/.test(
      text,
    );
  }

  function messageJob(message) {
    const metadata = (message && message.metadata) || {};
    const metadataJobId = metadata.jobId && String(metadata.jobId);
    if (metadataJobId && state.trackedJobs.has(metadataJobId))
      return state.trackedJobs.get(metadataJobId);
    const candidateCard = (message.cards || []).find(
      (card) => card.type === "candidate_set",
    );
    const candidateJob = candidateCard && jobForCandidateCard(candidateCard);
    if (candidateJob) return candidateJob;
    const cardJobs = (message.cards || [])
      .filter((card) => card.type === "job")
      .map((card) => {
        const tracked = state.trackedJobs.get(String(card.objectId)) || {};
        return {
          id: String(card.objectId),
          ...(card.state || {}),
          ...tracked,
        };
      });
    const cardJob =
      cardJobs.find((job) =>
        activeJobStatuses.has(String(job.status || "").toUpperCase()),
      ) || cardJobs[0];
    if (cardJob) return cardJob;
    if (!metadataJobId) return null;
    return {
      id: metadataJobId,
      kind: metadata.jobKind || "agent.chat",
      status:
        metadata.jobStatus ||
        (metadata.failed
          ? "FAILED"
          : metadata.pending === false
            ? "SUCCEEDED"
            : "QUEUED"),
      stage: metadata.failed
        ? "failed"
        : metadata.pending === false
          ? "complete"
          : "queued",
      progress: metadata.pending === false ? 100 : 0,
      failureMessage: metadata.failed ? message.content : null,
      created: message.created,
      updated: message.created,
    };
  }

  function messagePresentation(message) {
    if (message.role !== "assistant") return "request";
    const metadata = message.metadata || {};
    const job = messageJob(message);
    const jobStatus = String(
      (job && job.status) || metadata.jobStatus || "",
    ).toUpperCase();
    const cardStatuses = (message.cards || []).map((card) =>
      String(
        card.type === "job"
          ? jobCardView(card).status || ""
          : (card.state || {}).status || "",
      ).toUpperCase(),
    );
    const questionBatchCards = independentQuestionJobCards(message);
    const hasQuestionBatch = questionBatchCards.length > 1;
    const cardActive = cardStatuses.some((status) =>
      [
        "QUEUED",
        "RUNNING",
        "GENERATING",
        "MATERIALIZING",
        "CANCEL_REQUESTED",
      ].includes(status),
    );
    const cardSucceeded = cardStatuses.some((status) =>
      ["READY", "SUCCEEDED", "COMPLETED", "MATERIALIZED", "SELECTED"].includes(
        status,
      ),
    );
    const cardFailed = cardStatuses.some((status) =>
      ["FAILED", "CANCELED"].includes(status),
    );
    if (hasQuestionBatch) return "question-tasks";
    if (jobStatus === "CANCELED") return "canceled";
    if (jobStatus === "FAILED") return "error";
    if (
      activeJobStatuses.has(jobStatus) ||
      cardActive ||
      (metadata.pending === true && !cardSucceeded && !cardFailed)
    )
      return "activity";
    if (metadata.failed || cardStatuses.includes("FAILED")) return "error";
    if (cardStatuses.includes("CANCELED")) return "canceled";
    if (
      metadata.presentation === "result" ||
      (syntheticProcessCopy(message.content) &&
        (cardSucceeded || visibleMessageCards(message).length))
    )
      return "result";
    return "answer";
  }

  function resultCardsMarkup(message) {
    const cards = visibleMessageCards(message);
    const markup = renderResultCards(cards);
    if (!markup) return "";
    const questionJobs = independentQuestionJobCards(message);
    if (!questionJobs.length)
      return `<section class="teaching-result-section" aria-label="任务结果"><header><span><i class="fas fa-box-open"></i><strong>结果</strong></span></header><div>${markup}</div></section>`;
    const statuses = questionJobs.map((card) =>
      String(jobCardView(card).status || "QUEUED").toUpperCase(),
    );
    const succeeded = statuses.filter((status) => status === "SUCCEEDED").length;
    const active = statuses.filter((status) =>
      activeJobStatuses.has(status),
    ).length;
    const attention = statuses.length - succeeded - active;
    const summary = `${questionJobs.length} 个独立任务 · ${succeeded} 已完成${active ? ` · ${active} 进行中` : ""}${attention ? ` · ${attention} 需处理` : ""}`;
    return `<section class="teaching-result-section is-question-tasks" aria-label="独立题目任务"><header><span><i class="fas fa-tasks"></i><strong>独立题目任务</strong></span><small>${api.escapeHtml(summary)}</small></header><div class="independent-question-jobs">${markup}</div></section>`;
  }

  function messageMetaMarkup(message, options) {
    const copy = options && options.copy !== false;
    const reuse = options && options.reuse;
    return `<div class="teaching-message-meta">
      <time>${api.escapeHtml(api.formatDate(message.created))}</time>
      <span class="teaching-message-tools">
        ${copy ? `<button type="button" data-message-copy="${api.escapeHtml(message.id)}" title="复制内容" aria-label="复制内容"><i class="far fa-copy"></i></button>` : ""}
        ${reuse ? `<button type="button" data-message-reuse="${api.escapeHtml(message.id)}" title="再次编辑" aria-label="再次编辑这条要求"><i class="fas fa-pen"></i></button>` : ""}
      </span>
    </div>`;
  }

  function renderUserMessage(message) {
    return `<article class="teaching-message is-user" data-message-id="${api.escapeHtml(message.id)}">
      <div class="teaching-message-body">
        <span class="teaching-message-label">你的要求</span>
        <div class="teaching-message-copy">${api.escapeHtml(message.content).replace(/\n/g, "<br>")}</div>
        ${renderUploadedAttachments(message)}
        ${messageMetaMarkup(message, { reuse: true })}
      </div>
      <div class="teaching-message-avatar" aria-hidden="true"><i class="fas fa-user"></i></div>
    </article>`;
  }

  function renderUploadedAttachments(message) {
    const attachments =
      message && message.metadata && Array.isArray(message.metadata.attachments)
        ? message.metadata.attachments
        : [];
    const safe = attachments.filter(
      (item) =>
        item &&
        typeof item.downloadUrl === "string" &&
        item.downloadUrl.startsWith("/pwncollege_api/v1/teaching/materials/"),
    );
    if (!safe.length) return "";
    return `<div class="teaching-uploaded-attachments" aria-label="本条消息的附件">${safe
      .map((item) => {
        const size = Number(item.size || 0);
        const sizeLabel =
          size >= 1048576
            ? `${(size / 1048576).toFixed(1)} MB`
            : size >= 1024
              ? `${Math.ceil(size / 1024)} KB`
              : `${size} B`;
        return `<a href="${api.escapeHtml(item.downloadUrl)}" download="${api.escapeHtml(item.filename || "课程资料")}"><i class="fas fa-file-download" aria-hidden="true"></i><span><strong>${api.escapeHtml(item.filename || item.title || "课程资料")}</strong><small>${api.escapeHtml(sizeLabel)}</small></span></a>`;
      })
      .join("")}</div>`;
  }

  function renderActivityMessage(message) {
    const metadata = message.metadata || {};
    const job = messageJob(message) || {
      id: String(metadata.jobId || message.id),
      kind: metadata.jobKind || "agent.chat",
      status: "QUEUED",
      stage: "queued",
      progress: 0,
      created: message.created,
    };
    const status = String(job.status || "QUEUED").toUpperCase();
    const stopping = status === "CANCEL_REQUESTED";
    const step = stopping ? "正在停止" : jobCurrentStepLabel(job);
    const detail = jobCurrentDetail(job);
    const progress = jobProgressValue(job);
    const expanded = jobDisclosureExpanded(job.id);
    const detailId = jobDisclosureElementId(
      `activity-details-${message.id}`,
      job.id,
    );
    return `<article class="teaching-message is-assistant is-activity${expanded ? " is-expanded" : ""}" data-message-id="${api.escapeHtml(message.id)}" data-job-disclosure="${api.escapeHtml(job.id)}">
      <div class="teaching-message-avatar" aria-hidden="true"><i class="fas fa-circle-notch fa-spin"></i></div>
      <div class="teaching-message-body">
        <button class="teaching-activity-line" type="button" data-job-toggle="${api.escapeHtml(job.id)}" data-job-expand-label="${api.escapeHtml(`${step}，展开详细步骤`)}" data-job-collapse-label="${api.escapeHtml(`${step}，收起详细步骤`)}" aria-expanded="${expanded}" aria-controls="${api.escapeHtml(detailId)}" aria-label="${api.escapeHtml(step)}，${expanded ? "收起" : "展开"}详细步骤">
          <span class="teaching-activity-copy"><strong aria-live="polite">${api.escapeHtml(step)}</strong>${detail && detail !== step ? `<small>${api.escapeHtml(detail)}</small>` : ""}<span class="teaching-activity-facts"><span>${progress}%</span>${jobDurationMarkup(job, true)}</span></span>
          <i class="fas fa-chevron-right teaching-activity-open job-disclosure-chevron" aria-hidden="true"></i>
        </button>
        ${jobDisclosureDetailsMarkup(job, `activity-details-${message.id}`)}
      </div>
    </article>`;
  }

  function renderAssistantMessage(message, presentation) {
    const job = messageJob(message);
    const visibleContent = visibleMessageContent(message);
    const meaningfulCopy =
      !syntheticProcessCopy(visibleContent) && visibleContent.trim();
    const failed = presentation === "error";
    const canceled = presentation === "canceled";
    const questionTasks = presentation === "question-tasks";
    const expanded = Boolean(
      !questionTasks && job && jobDisclosureExpanded(job.id),
    );
    const detailId = !questionTasks && job
      ? jobDisclosureElementId(`answer-details-${message.id}`, job.id)
      : "";
    const retrying = Boolean(job && state.retryingJobIds.has(String(job.id)));
    const content = meaningfulCopy
      ? `<div class="teaching-answer-content">${richAnswerMarkup(visibleContent)}</div>`
      : failed
        ? '<div class="teaching-answer-content"><p>系统没有产生可用结果。可以查看执行详情后重新运行。</p></div>'
        : "";
    const retry =
      (failed || canceled) && job
        ? `<div class="teaching-recovery-actions"><button type="button" data-run-retry="${api.escapeHtml(job.id)}"${retrying ? " disabled" : ""}><i class="fas ${retrying ? "fa-circle-notch fa-spin" : "fa-redo"}"></i>${retrying ? "正在重新运行" : "重新运行"}</button><button type="button" data-job-toggle="${api.escapeHtml(job.id)}" data-job-expand-label="查看失败步骤" data-job-collapse-label="收起失败步骤" data-job-expand-text="查看失败步骤" data-job-collapse-text="收起失败步骤" aria-expanded="${expanded}" aria-controls="${api.escapeHtml(detailId)}" aria-label="${expanded ? "收起失败步骤" : "查看失败步骤"}"><span data-job-toggle-copy>${expanded ? "收起失败步骤" : "查看失败步骤"}</span><i class="fas fa-chevron-right job-disclosure-chevron" aria-hidden="true"></i></button></div>`
        : "";
    const statusLine =
      failed || canceled
        ? `<div class="teaching-answer-status"><i class="fas ${failed ? "fa-exclamation-circle" : "fa-stop-circle"}"></i><strong>${failed ? "任务没有完成" : "任务已取消"}</strong></div>`
        : "";
    return `<article class="teaching-message is-assistant is-${api.escapeHtml(presentation)}${expanded ? " is-expanded" : ""}" data-message-id="${api.escapeHtml(message.id)}"${job && !questionTasks ? ` data-job-disclosure="${api.escapeHtml(job.id)}"` : ""}>
      <div class="teaching-message-avatar" aria-hidden="true"><i class="fas ${failed ? "fa-exclamation" : canceled ? "fa-minus" : questionTasks ? "fa-tasks" : "fa-magic"}"></i></div>
      <div class="teaching-message-body">
        <section class="teaching-answer-surface">
          ${statusLine}
          ${content}
          ${renderGenerationOptions(message)}
          ${resultCardsMarkup(message)}
          ${renderAgentFiles(message)}
          ${renderAgentActions(message)}
          ${retry}
          ${(failed || canceled) && job ? jobDisclosureDetailsMarkup(job, `answer-details-${message.id}`) : ""}
        </section>
        ${messageMetaMarkup(message, { copy: Boolean(meaningfulCopy) })}
      </div>
    </article>`;
  }

  function renderTranscriptMessage(message) {
    if (message.role !== "assistant") return renderUserMessage(message);
    const presentation = messagePresentation(message);
    return presentation === "activity"
      ? renderActivityMessage(message)
      : renderAssistantMessage(message, presentation);
  }

  function jobUiSignature(job) {
    const events = Array.isArray(job.events) ? job.events : [];
    const latest = events.length ? events[events.length - 1] : {};
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    const target = job.resultTarget || {};
    return [
      job.id,
      job.status,
      job.stage,
      job.progress,
      job.title || "",
      result.title || "",
      result.draftId || "",
      target.kind || "",
      target.href || "",
      job.attemptCount,
      job.maxAttempts,
      job.failureMessage || job.error || "",
      latest.sequence || "",
      latest.stage || "",
      latest.status || "",
      latest.message || "",
    ].join(":");
  }

  function transcriptSignature(messages) {
    const transcript = messages
      .map((message) => {
        const metadata = message.metadata || {};
        const cards = (message.cards || [])
          .map(
            (card) => {
              const cardState = card.state || {};
              const cardResult =
                cardState.result && typeof cardState.result === "object"
                  ? cardState.result
                  : {};
              const cardTarget = cardState.resultTarget || {};
              return `${card.id}:${cardState.status || ""}:${cardState.progress || ""}:${cardState.title || ""}:${cardResult.draftId || ""}:${cardTarget.href || ""}`;
            },
          )
          .join(",");
        const content = String(message.content || "");
        const generationOptions = generationOptionsForMessage(message);
        const optionSignature = generationOptions
          ? generationOptions.options
              .map(
                (option) =>
                  `${option.id}:${option.title}:${option.rewrittenPrompt.length}`,
              )
              .join(",")
          : "";
        const selection = metadata.generationSelection || {};
        return `${message.id}:${content.length}:${content.slice(-72)}:${metadata.pending}:${metadata.failed}:${metadata.presentation || ""}:${cards}:${optionSignature}:${selection.optionId || ""}:${selection.status || ""}`;
      })
      .join("|");
    const jobs = Array.from(state.trackedJobs.values())
      .map(jobUiSignature)
      .sort()
      .join("|");
    return `${transcript}::${jobs}`;
  }

  function isNearTranscriptBottom() {
    return (
      elements.messages.scrollHeight -
        elements.messages.scrollTop -
        elements.messages.clientHeight <
      110
    );
  }

  function scrollToLatest(options) {
    const behavior = options && options.smooth ? "smooth" : "auto";
    elements.messages.scrollTo({
      top: elements.messages.scrollHeight,
      behavior,
    });
    state.newContentAvailable = false;
    elements.jumpLatest.hidden = true;
  }

  function renderMessages() {
    if (!state.thread) return;
    const messages = state.thread.messages || [];
    const previousTop = elements.messages.scrollTop;
    const wasNearBottom = isNearTranscriptBottom();
    const nextSignature = transcriptSignature(messages);
    if (state.lastTranscriptSignature === nextSignature) {
      updateJobDurations(elements.messages);
      syncProgressClock();
      updateAgentChrome();
      syncComposerState();
      return;
    }
    const contentChanged = Boolean(
      state.lastTranscriptSignature &&
      state.lastTranscriptSignature !== nextSignature,
    );
    elements.messages.innerHTML = messages.length
      ? messages.map(renderTranscriptMessage).join("")
      : `<div class="teaching-empty">
        <span class="teaching-empty-eyebrow">全局教学智能体</span>
        <h2>直接说出你想完成的工作</h2>
        <p>分析、写作、课程操作、CTF 实践题、数据判断或文件交付都可以在同一对话中完成；无需先选择机械流程。</p>
        <div class="teaching-empty-capabilities" aria-label="支持的工作"><span><i class="fas fa-check"></i>理解自然语言与上下文</span><span><i class="fas fa-check"></i>调用技能和工具</span><span><i class="fas fa-check"></i>返回可下载文件</span></div>
      </div>`;
    state.lastTranscriptSignature = nextSignature;
    elements.messages
      .querySelectorAll("[data-candidate-set]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          openCandidateSet(button.dataset.candidateSet),
        );
      });
    bindJobDisclosureButtons(elements.messages, false);
    bindJobResultActions(elements.messages);
    elements.messages
      .querySelectorAll("[data-agent-tool-message]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const message = messages.find(
            (item) =>
              String(item.id) === String(button.dataset.agentToolMessage),
          );
          if (!message) return;
          try {
            await executeProposalSequence(
              message,
              Number(button.dataset.agentToolIndex),
              false,
            );
          } catch (error) {
            showError(error);
          }
        });
      });
    elements.messages
      .querySelectorAll("[data-generation-option-view-id]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          showGenerationOption(
            button.dataset.generationOptionViewMessage,
            button.dataset.generationOptionViewId,
            false,
          ),
        );
        button.addEventListener("keydown", (event) => {
          const directions = {
            ArrowLeft: -1,
            ArrowRight: 1,
            Home: -100,
            End: 100,
          };
          if (!(event.key in directions)) return;
          event.preventDefault();
          const tabs = Array.from(
            button
              .closest("[role='tablist']")
              .querySelectorAll("[data-generation-option-view-id]"),
          );
          const current = tabs.indexOf(button);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (current + directions[event.key] + tabs.length) % tabs.length;
          showGenerationOption(
            button.dataset.generationOptionViewMessage,
            tabs[next].dataset.generationOptionViewId,
            true,
          );
        });
      });
    elements.messages
      .querySelectorAll("[data-generation-option-shift]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          shiftGenerationOption(
            button,
            Number(button.dataset.generationOptionShift || 1),
          ),
        );
      });
    elements.messages
      .querySelectorAll("[data-generation-option-message]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const message = messages.find(
            (item) =>
              String(item.id) ===
              String(button.dataset.generationOptionMessage),
          );
          if (!message) return;
          try {
            await selectGenerationOption(
              message,
              button.dataset.generationOptionId,
            );
          } catch (error) {
            showError(error);
          }
        });
      });
    elements.messages
      .querySelectorAll("[data-agent-suggestion-message]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const message = messages.find(
            (item) =>
              String(item.id) === String(button.dataset.agentSuggestionMessage),
          );
          const rawSuggestion =
            message &&
            message.metadata &&
            (message.metadata.suggestions || [])[
              Number(button.dataset.agentSuggestionIndex)
            ];
          const suggestion = directSuggestionText(rawSuggestion);
          if (suggestion) {
            elements.input.value = suggestion;
            elements.input.focus();
            resizeComposer();
            syncComposerState();
          }
        });
      });
    elements.messages
      .querySelectorAll("[data-empty-compose]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          elements.input.value = button.dataset.emptyCompose || "";
          elements.input.focus();
          resizeComposer();
          syncComposerState();
        });
      });
    elements.messages
      .querySelectorAll("[data-message-copy]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const message = messages.find(
            (item) => String(item.id) === String(button.dataset.messageCopy),
          );
          if (!message) return;
          try {
            await navigator.clipboard.writeText(visibleMessageContent(message));
            button.innerHTML = '<i class="fas fa-check"></i>';
            window.setTimeout(() => {
              button.innerHTML = '<i class="far fa-copy"></i>';
            }, 1200);
          } catch (error) {
            showError(new Error("浏览器未允许复制，请手动选择文本。"));
          }
        });
      });
    elements.messages
      .querySelectorAll("[data-message-reuse]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const message = messages.find(
            (item) => String(item.id) === String(button.dataset.messageReuse),
          );
          if (!message || state.thread.status === "ARCHIVED") return;
          elements.input.value = message.content;
          elements.input.focus();
          resizeComposer();
          syncComposerState();
        });
      });
    elements.messages.querySelectorAll("[data-run-retry]").forEach((button) => {
      button.addEventListener("click", () =>
        retryTrackedJob(button.dataset.runRetry).catch(showError),
      );
    });
    if (
      state.forceScrollToLatest ||
      wasNearBottom ||
      !state.lastTranscriptSignature
    ) {
      window.requestAnimationFrame(() => scrollToLatest());
    } else {
      elements.messages.scrollTop = previousTop;
      if (contentChanged) {
        state.newContentAvailable = true;
        elements.jumpLatest.hidden = false;
      }
    }
    state.forceScrollToLatest = false;
    animateJobProgressBars(elements.messages);
    syncProgressClock();
    updateAgentChrome();
    syncComposerState();
    window.setTimeout(() => {
      applyAutomaticTools(messages).catch(showError);
    }, 0);
  }

  function bindJobResultActions(container) {
    if (!container) return;
    container
      .querySelectorAll("[data-job-candidate-result]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openCandidateSet(button.dataset.jobCandidateResult);
        });
      });
  }

  async function cancelTrackedJob(jobId) {
    const id = String(jobId || "");
    if (!id || state.stoppingJobId) return;
    state.stoppingJobId = id;
    updateAgentChrome();
    try {
      const data = unwrap(
        await api.request(`/teaching/jobs/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      );
      storeTaskCenterJob(data.job);
      renderJobs();
      renderMessages();
      schedulePoll();
    } finally {
      if (!primaryActiveJob() || String(primaryActiveJob().id) !== id)
        state.stoppingJobId = null;
      updateAgentChrome();
    }
  }

  async function dismissTrackedJob(jobId) {
    const id = String(jobId || "");
    const job = taskById(id);
    if (!id || !job) return false;
    const status = String(job.status || "").toUpperCase();
    if (!["SUCCEEDED", "FAILED", "CANCELED"].includes(status)) {
      throw new Error("进行中的任务不能删除，请先停止任务。");
    }
    const confirmed = await window.AISecEduUI.confirm(
      `从任务列表删除“${compactTaskTitle(job)}”？对话内容和任务结果仍会保留。`,
      {
        title: "删除任务记录",
        confirmLabel: "从列表删除",
        confirmStyle: "danger",
      },
    );
    if (!confirmed) return false;
    const data = unwrap(
      await api.request(`/teaching/jobs/${encodeURIComponent(id)}/task-list`, {
        method: "DELETE",
      }),
    );
    if (data.removed !== true) throw new Error("任务记录未能从列表删除。");
    state.trackedJobs.delete(id);
    state.taskCenterJobs.delete(id);
    state.expandedJobIds.delete(id);
    if (String(state.selectedJobId || "") === id) state.selectedJobId = null;
    renderJobs();
    api.showNotice(
      elements.notice,
      "已从任务列表删除，对话结果仍然保留。",
      "success",
    );
    return true;
  }

  async function retryTrackedJob(jobId) {
    const id = String(jobId || "");
    if (!id || state.retryingJobIds.has(id)) return false;
    const previousJob = taskById(id);
    const previousSelectedJobId = state.selectedJobId;
    const wasExpanded = state.expandedJobIds.has(id);
    let acceptedJob = null;
    state.retryingJobIds.add(id);
    if (previousJob) {
      storeTaskCenterJob({
        ...previousJob,
        status: "QUEUED",
        stage: "queued",
        progress: 0,
        error: null,
        failureMessage: null,
        result: {},
        resultTarget: null,
        events: [
          {
            stage: "queued",
            status: "QUEUED",
            message: "任务正在从第一步重新开始",
          },
        ],
        activityLoaded: true,
        updated: new Date().toISOString(),
      });
      state.selectedJobId = id;
      state.expandedJobIds.add(id);
    }
    renderMessages();
    renderJobs();
    api.showNotice(elements.notice, "正在替换失败状态并重新执行…", "info");
    try {
      const retryKey =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/jobs/${encodeURIComponent(id)}/retry`,
          { idempotencyKey: retryKey },
        ),
      );
      const retriedId = String(data.job.id);
      if (data.replacedInPlace !== true || retriedId !== id)
        throw new Error("系统未能原位重启该任务，请刷新后重试。");
      acceptedJob = data.job;
      storeTaskCenterJob(data.job);
      state.selectedJobId = retriedId;
      state.expandedJobIds.add(retriedId);
      if (
        state.thread &&
        (!data.job.threadId || String(data.job.threadId) === String(state.thread.id))
      ) {
        await loadThread(state.thread.id);
      }
      renderJobs();
      schedulePoll();
      const current = taskById(retriedId) || data.job;
      const status = String(current.status || "QUEUED").toUpperCase();
      if (status === "FAILED") {
        api.showNotice(
          elements.notice,
          "已重新运行，但本轮仍未通过检查；失败步骤已展开。",
          "warning",
        );
      } else {
        api.showNotice(
          elements.notice,
          "任务已重新开始执行，失败步骤已展开以便查看进度。",
          "success",
        );
      }
      return true;
    } catch (error) {
      if (acceptedJob) {
        storeTaskCenterJob(acceptedJob);
        state.selectedJobId = id;
        state.expandedJobIds.add(id);
        schedulePoll();
      } else {
        if (previousJob) storeTaskCenterJob(previousJob);
        else {
          state.trackedJobs.delete(id);
          state.taskCenterJobs.delete(id);
        }
        state.selectedJobId = previousSelectedJobId;
        if (wasExpanded) state.expandedJobIds.add(id);
        else state.expandedJobIds.delete(id);
      }
      throw error;
    } finally {
      state.retryingJobIds.delete(id);
      renderMessages();
      renderJobs();
    }
  }

  function messageReferencesJob(message, jobId) {
    const id = String(jobId || "");
    if (!id) return false;
    const metadata = (message && message.metadata) || {};
    if (String(metadata.jobId || "") === id) return true;
    return ((message && message.cards) || []).some(
      (card) =>
        (card.type === "job" && String(card.objectId || "") === id) ||
        String((card.state || {}).jobId || "") === id,
    );
  }

  function conversationMessageForJob(job) {
    const messages = (state.thread && state.thread.messages) || [];
    const direct = [...messages]
      .reverse()
      .find((message) => messageReferencesJob(message, job.id));
    if (direct) return direct;
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    const relatedIds = new Set(
      [
        result.candidateSetId,
        result.artifactId,
        result.assignmentId,
        result.challengeId,
        result.materialId,
      ]
        .filter(Boolean)
        .map(String),
    );
    if (!relatedIds.size) return null;
    return (
      [...messages]
        .reverse()
        .find((message) =>
          (message.cards || []).some((card) =>
            relatedIds.has(String(card.objectId || "")),
          ),
        ) || null
    );
  }

  function conversationRequestForJob(job) {
    const messages = (state.thread && state.thread.messages) || [];
    let relatedIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messageReferencesJob(messages[index], job.id)) {
        relatedIndex = index;
        break;
      }
    }
    if (relatedIndex < 0) {
      const related = conversationMessageForJob(job);
      relatedIndex = related
        ? messages.findIndex(
            (message) => String(message.id) === String(related.id),
          )
        : -1;
    }
    for (let index = relatedIndex - 1; index >= 0; index -= 1) {
      if (
        messages[index].role === "user" &&
        String(messages[index].content || "").trim()
      ) {
        return String(messages[index].content).trim();
      }
    }
    return "";
  }

  function generationBatchTask(batch) {
    const status = String(batch.status || "queued").toLowerCase();
    const statusMap = {
      queued: "QUEUED",
      generating: "RUNNING",
      validating: "RUNNING",
      needs_review: "SUCCEEDED",
      partial_success: "FAILED",
      failed: "FAILED",
      canceled: "CANCELED",
    };
    const requested = Math.max(1, Number(batch.requestedCount || 1));
    const settled = Math.min(
      requested,
      Number(batch.validatedCount || 0) + Number(batch.failedCount || 0),
    );
    const normalized = statusMap[status] || "QUEUED";
    const progress = normalized === "SUCCEEDED"
      ? 100
      : Math.min(normalized === "RUNNING" ? 99 : 100, Math.round((settled / requested) * 100));
    return {
      id: `batch:${batch.id}`,
      batchId: String(batch.id),
      isGenerationBatch: true,
      kind: "generation.batch",
      title: `批量生成 ${requested} 道独立 CTF 题目`,
      status: normalized,
      stage: status === "validating" ? "validating" : status,
      progress,
      dojoId: batch.course && batch.course.id,
      course: batch.course || null,
      module: batch.module || null,
      moduleIndex: batch.module && batch.module.index,
      threadId: batch.threadId || null,
      created: batch.created,
      updated: batch.updated,
      completed: batch.completed,
      elapsedSeconds: batch.elapsedSeconds,
      requestedCount: requested,
      createdCount: Number(batch.createdCount || 0),
      validatedCount: Number(batch.validatedCount || 0),
      failedCount: Number(batch.failedCount || 0),
      items: Array.isArray(batch.items) ? batch.items : [],
      reviewUrl: batch.reviewUrl || "",
      nextAction: batch.nextAction,
      failureMessage:
        status === "partial_success"
          ? `${Number(batch.failedCount || 0)} 道题未完成，其余结果已保留`
          : status === "failed"
            ? "本批次没有生成可审核的题目"
            : null,
      result: {
        title: `批量生成 ${requested} 道独立 CTF 题目`,
      },
      resultTarget: batch.reviewUrl
        ? { kind: "link", href: batch.reviewUrl }
        : batch.threadId
          ? { kind: "conversation" }
          : null,
    };
  }

  function taskCenterRows() {
    const merged = new Map(state.taskCenterJobs);
    state.trackedJobs.forEach((job, id) => {
      const server = merged.get(String(id)) || {};
      merged.set(String(id), { ...server, ...job });
    });
    state.taskCenterBatches.forEach((batch) => {
      const view = generationBatchTask(batch);
      merged.set(view.id, view);
    });
    return Array.from(merged.values());
  }

  function taskTypeGroup(job) {
    const kind = String(job.kind || "").toLowerCase();
    const artifactType = String(job.artifactType || (job.payload || {}).artifactType || "").toLowerCase();
    if (job.isGenerationBatch) return "question_batch";
    if (kind.includes("authoring") || artifactType.includes("question") || artifactType.includes("ctf")) return "question";
    if (kind === "agent.chat") return "conversation";
    if (kind.includes("artifact") || kind.includes("candidate") || ["slide-deck", "lesson-plan", "simulation", "attack-defense-scene"].includes(artifactType)) return "content";
    return "other";
  }

  function taskStatusGroup(job) {
    const status = String(job.status || "QUEUED").toUpperCase();
    if (activeJobStatuses.has(status)) return "active";
    if (["FAILED", "CANCELED"].includes(status)) return "attention";
    if (status === "SUCCEEDED") return "completed";
    return "other";
  }

  function taskMatchesFilters(job) {
    const filters = state.taskFilters;
    const courseIds = new Set([
      job.course && job.course.id,
      job.course && job.course.referenceId,
      job.dojoId,
    ].filter((value) => value !== null && value !== undefined && value !== "").map(String));
    if (filters.course && !courseIds.has(filters.course)) return false;
    if (filters.type && taskTypeGroup(job) !== filters.type) return false;
    if (filters.status && taskStatusGroup(job) !== filters.status) return false;
    return true;
  }

  function populateTaskCourseFilter() {
    if (!elements.taskCourseFilter) return;
    const current = state.taskFilters.course;
    elements.taskCourseFilter.innerHTML = '<option value="">全部课程</option>' + ((state.context && state.context.teacherDojos) || []).map((dojo) => `<option value="${api.escapeHtml(String(dojo.id || dojo.referenceId))}">${api.escapeHtml(dojo.name || "未命名课程")}</option>`).join("");
    if (Array.from(elements.taskCourseFilter.options).some((option) => option.value === current)) elements.taskCourseFilter.value = current;
  }

  function taskById(jobId) {
    const id = String(jobId || "");
    if (id.startsWith("batch:")) {
      const batch = state.taskCenterBatches.get(id.slice(6));
      return batch ? generationBatchTask(batch) : null;
    }
    return state.trackedJobs.get(id) || state.taskCenterJobs.get(id) || null;
  }

  function storeTaskCenterJob(job) {
    if (!job || !job.id) return;
    const id = String(job.id);
    state.taskCenterJobs.set(id, {
      ...(state.taskCenterJobs.get(id) || {}),
      ...job,
    });
    if (state.trackedJobs.has(id)) {
      state.trackedJobs.set(id, {
        ...state.trackedJobs.get(id),
        ...job,
      });
    }
  }

  async function loadTaskCenter(options = {}) {
    if (state.taskCenterLoading) return;
    const append = Boolean(options.append);
    const nextOffset = Number(state.taskCenterPaging.nextOffset || 0);
    if (append && !state.taskCenterPaging.hasNext) return;
    const offset = append ? nextOffset : 0;
    const limit = append ? 50 : state.taskCenterLimit;
    state.taskCenterLoading = true;
    if (!append && !options.silent && !taskCenterRows().length) {
      elements.jobList.innerHTML =
        '<div class="teaching-job-empty is-loading"><span><i class="fas fa-circle-notch fa-spin"></i></span><h3>正在读取任务</h3><p>汇总所有课程的生成、验证与审核状态…</p></div>';
    }
    try {
      const data = unwrap(
        await api.request(
          `/teaching/jobs?view=all&limit=${limit}&offset=${offset}`,
        ),
      );
      const previous = state.taskCenterJobs;
      if (!append) state.taskCenterJobs = new Map();
      (data.jobs || []).forEach((job) => {
        const id = String(job.id);
        state.taskCenterJobs.set(id, {
          ...(previous.get(id) || {}),
          ...(state.taskCenterJobs.get(id) || {}),
          ...job,
        });
      });
      if (!append) state.taskCenterBatches = new Map();
      (data.batches || []).forEach((batch) => {
        state.taskCenterBatches.set(String(batch.id), batch);
      });
      state.taskCenterPaging = {
        ...state.taskCenterPaging,
        ...(data.pagination || {}),
      };
      if (append) {
        state.taskCenterLimit = Math.min(
          200,
          Math.max(state.taskCenterLimit, offset + limit),
        );
      }
      state.taskCenterLoadedAt = data.asOf || new Date().toISOString();
      state.lastJobListSignature = "";
      renderJobs();
      document.dispatchEvent(new CustomEvent("aisecedu:teaching-task-state", {
        detail: {
          jobs: taskCenterRows().filter((job) =>
            activeJobStatuses.has(String(job.status || "").toUpperCase()),
          ).length,
          tasksRequiringAction: 0,
        },
      }));
    } finally {
      state.taskCenterLoading = false;
      updateAgentChrome();
    }
  }

  function compactTaskTitle(job) {
    const result =
      job.result && typeof job.result === "object" ? job.result : {};
    const source = String(
      result.title ||
        job.title ||
        (job.kind === "agent.chat" ? conversationRequestForJob(job) : "") ||
        jobTitle(job),
    ).trim();
    return source.length > 56 ? `${source.slice(0, 55)}…` : source;
  }

  function compactTaskStatus(job) {
    const status = String(job.status || "QUEUED").toUpperCase();
    if (job.isGenerationBatch) {
      if (status === "SUCCEEDED")
        return `${job.validatedCount}/${job.requestedCount} 已验证，可逐题审核`;
      if (status === "FAILED") return job.failureMessage || "批次需要处理";
      if (status === "CANCELED")
        return `已停止，${job.createdCount}/${job.requestedCount} 个结果已保留`;
      return `${job.createdCount}/${job.requestedCount} 已生成 · ${job.validatedCount} 已验证`;
    }
    if (status === "SUCCEEDED") return "已完成";
    if (status === "FAILED") return job.failureMessage || "任务未完成";
    if (status === "CANCELED") return "已取消";
    if (status === "CANCEL_REQUESTED") return "正在停止";
    if (status === "QUEUED") return `等待执行 · ${jobCurrentStepLabel(job)}`;
    return jobCurrentDetail(job) || jobCurrentStepLabel(job);
  }

  function taskStatusPresentation(job) {
    const status = String(job.status || "QUEUED").toUpperCase();
    if (status === "SUCCEEDED")
      return { className: "succeeded", label: "已完成", icon: "fa-check" };
    if (status === "FAILED")
      return { className: "failed", label: "未完成", icon: "fa-exclamation" };
    if (status === "CANCELED")
      return { className: "canceled", label: "已取消", icon: "fa-minus" };
    if (status === "CANCEL_REQUESTED")
      return {
        className: "cancel-requested",
        label: "正在停止",
        icon: "fa-circle-notch fa-spin",
      };
    if (status === "RUNNING")
      return {
        className: "running",
        label: "进行中",
        icon: "fa-circle-notch fa-spin",
      };
    return { className: "queued", label: "等待中", icon: "fa-clock" };
  }

  function taskContextLabel(job) {
    const courseName = job.course && job.course.name;
    const moduleName = job.module && job.module.name;
    return [courseName, moduleName].filter(Boolean).join(" · ");
  }

  function taskResultAction(job) {
    if (job.kind === "learning.authoring") {
      const href = authoringManagementHref(job);
      return href
        ? `<a class="teaching-task-action" href="${api.escapeHtml(href)}"><i class="fas fa-clipboard-check"></i><span>题目管理</span></a>`
        : "";
    }
    const target = jobResultTarget(job);
    if (target.kind === "link" && target.href) {
      return `<a class="teaching-task-action" href="${api.escapeHtml(target.href)}"><i class="fas fa-external-link-alt"></i><span>查看结果</span></a>`;
    }
    if (target.kind === "candidate" && target.candidateSetId) {
      return `<button type="button" class="teaching-task-action" data-task-candidate="${api.escapeHtml(target.candidateSetId)}"><i class="fas fa-th-large"></i><span>审核结果</span></button>`;
    }
    if (job.threadId && (!state.thread || String(state.thread.id) !== String(job.threadId))) {
      return `<a class="teaching-task-action" href="/teacher?thread=${encodeURIComponent(job.threadId)}"><i class="far fa-comment-alt"></i><span>打开对话</span></a>`;
    }
    return `<button type="button" class="teaching-task-action" data-job-jump="${api.escapeHtml(job.id)}"><i class="far fa-comment-alt"></i><span>查看结果</span></button>`;
  }

  function batchItemStatusLabel(value) {
    const labels = {
      planned: "待创建",
      queued: "等待中",
      generating: "生成中",
      validating: "验证中",
      needs_review: "待审核",
      succeeded: "待审核",
      failed: "未完成",
      canceled: "已取消",
    };
    return labels[String(value || "planned").toLowerCase()] || "处理中";
  }

  function generationBatchDetailsMarkup(job, detailId, expanded) {
    const rows = (job.items || []).map((item) => {
      const target = item.resultTarget || {};
      const resultLink = target.kind === "link" && target.href
        ? `<a href="${api.escapeHtml(internalHref(target.href, job.reviewUrl || "/teacher/courses"))}">审核</a>`
        : "";
      return `<li><span class="teaching-batch-item-index">${Number(item.itemIndex || 0)}</span><span><strong>${api.escapeHtml(item.title || `独立题目 ${item.itemIndex}`)}</strong><small>${api.escapeHtml(item.difficulty || "按要求递进")}${item.failure ? ` · ${api.escapeHtml(item.failure)}` : ""}</small></span><em class="is-${api.escapeHtml(String(item.status || "planned").toLowerCase())}">${api.escapeHtml(batchItemStatusLabel(item.status))}</em>${resultLink}</li>`;
    }).join("");
    return `<div id="${api.escapeHtml(detailId)}" class="job-disclosure-details teaching-batch-details" data-job-disclosure-details="${api.escapeHtml(job.id)}" role="region" aria-label="${api.escapeHtml(compactTaskTitle(job))}的独立题目状态"${expanded ? "" : " hidden"}><p>${job.createdCount}/${job.requestedCount} 已生成 · ${job.validatedCount} 已验证 · ${job.failedCount} 未完成</p><ol>${rows}</ol></div>`;
  }

  function taskListItemMarkup(job) {
    const status = String(job.status || "QUEUED").toUpperCase();
    const restarting = state.retryingJobIds.has(String(job.id));
    const presentation = taskStatusPresentation(job);
    const progress = jobProgressValue(job);
    const expanded = jobDisclosureExpanded(job.id);
    const detailId = jobDisclosureElementId("drawer-task-details", job.id);
    const terminal = ["SUCCEEDED", "FAILED", "CANCELED"].includes(status);
    const batchResult = job.isGenerationBatch && job.reviewUrl
      ? `<a class="teaching-task-action" href="${api.escapeHtml(internalHref(job.reviewUrl, "/teacher/courses"))}"><i class="fas fa-clipboard-check"></i><span>审核题目</span></a>`
      : "";
    const action = restarting
      ? `<span class="teaching-task-action is-restarting" aria-label="正在重新开始"><i class="fas fa-circle-notch fa-spin"></i><span>重新开始</span></span>`
      : job.isGenerationBatch && status === "FAILED" && job.failedCount
        ? `${batchResult}<button type="button" class="teaching-task-action" data-retry-batch="${api.escapeHtml(job.batchId)}"><i class="fas fa-redo"></i><span>仅重试失败项</span></button>`
      : job.isGenerationBatch && status === "SUCCEEDED"
        ? batchResult
      : job.isGenerationBatch && !terminal && status !== "CANCEL_REQUESTED"
        ? `<button type="button" class="teaching-task-action is-stop" data-cancel-batch="${api.escapeHtml(job.batchId)}"><i class="fas fa-stop"></i><span>停止批次</span></button>`
      : status === "SUCCEEDED"
        ? taskResultAction(job)
        : ["FAILED", "CANCELED"].includes(status)
          ? `<button type="button" class="teaching-task-action" data-retry-job="${api.escapeHtml(job.id)}"><i class="fas fa-redo"></i><span>重新运行</span></button>`
          : status !== "CANCEL_REQUESTED"
            ? `<button type="button" class="teaching-task-action is-stop" data-cancel-job="${api.escapeHtml(job.id)}"><i class="fas fa-stop"></i><span>停止</span></button>`
            : "";
    const management = terminal && !job.isGenerationBatch
      ? `<details class="teaching-task-manage">
          <summary aria-label="管理${api.escapeHtml(compactTaskTitle(job))}" title="管理任务"><i class="fas fa-ellipsis-h" aria-hidden="true"></i></summary>
          <div class="teaching-task-manage-menu" role="menu">
            <button type="button" role="menuitem" data-delete-task="${api.escapeHtml(job.id)}"><i class="far fa-trash-alt" aria-hidden="true"></i><span>从列表中删除</span></button>
          </div>
        </details>`
      : "";
    const controls =
      action || management
        ? `<div class="teaching-task-controls">${action}${management}</div>`
        : "";
    return `<li class="teaching-task-item is-${presentation.className}${String(state.selectedJobId) === String(job.id) ? " is-selected" : ""}${expanded ? " is-expanded" : ""}" data-task-job="${api.escapeHtml(job.id)}" data-job-disclosure="${api.escapeHtml(job.id)}">
      <div class="teaching-task-row">
        <button type="button" class="teaching-task-disclosure" data-job-toggle="${api.escapeHtml(job.id)}" data-job-expand-label="${api.escapeHtml(`展开${compactTaskTitle(job)}的详细步骤`)}" data-job-collapse-label="${api.escapeHtml(`收起${compactTaskTitle(job)}的详细步骤`)}" aria-expanded="${expanded}" aria-controls="${api.escapeHtml(detailId)}" aria-label="${expanded ? "收起" : "展开"}${api.escapeHtml(compactTaskTitle(job))}的详细步骤">
          <span class="teaching-task-status" title="${presentation.label}" aria-label="${presentation.label}"><i class="fas ${presentation.icon}"></i></span>
          <span class="teaching-task-copy"><strong title="${api.escapeHtml(compactTaskTitle(job))}">${api.escapeHtml(compactTaskTitle(job))}</strong><small>${api.escapeHtml(compactTaskStatus(job))}</small><span class="teaching-task-facts">${taskContextLabel(job) ? `<span>${api.escapeHtml(taskContextLabel(job))}</span>` : ""}${jobDurationMarkup(job, true)}${jobAttemptLabel(job) ? `<span>${api.escapeHtml(jobAttemptLabel(job))}</span>` : ""}</span></span>
          <span class="teaching-task-percent">${progress}%</span>
          <i class="fas fa-chevron-right teaching-task-chevron job-disclosure-chevron" aria-hidden="true"></i>
        </button>
        ${controls}
      </div>
      ${jobProgressBarMarkup(job, "teaching-task-progress", "drawer:bar")}
      ${job.isGenerationBatch ? generationBatchDetailsMarkup(job, detailId, expanded) : jobDisclosureDetailsMarkup(job, "drawer-task-details")}
    </li>`;
  }

  function taskGroupMarkup(key, label, jobs) {
    if (!jobs.length) return "";
    return `<section class="teaching-task-group is-${key}" data-task-group="${key}">
      <header><h3>${label}</h3><span>${jobs.length}</span></header>
      <ol class="teaching-task-items">${jobs.map(taskListItemMarkup).join("")}</ol>
    </section>`;
  }

  async function retryGenerationBatch(batchId) {
    const id = String(batchId || "");
    if (!id) return;
    const key = window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    const data = unwrap(
      await api.json(
        "POST",
        `/teaching/generation-batches/${encodeURIComponent(id)}/retry-failed`,
        { idempotencyKey: key },
      ),
    );
    state.taskCenterBatches.set(id, data.batch);
    state.lastJobListSignature = "";
    renderJobs();
    api.showNotice(
      state.dashboardMode ? elements.dashboardNotice : elements.notice,
      `已重新启动 ${Number((data.retried || []).length)} 个失败项；已成功的题目保持不变。`,
      "success",
    );
    schedulePoll();
    window.setTimeout(() => loadTaskCenter({ silent: true }).catch(showError), 1200);
  }

  async function cancelGenerationBatch(batchId) {
    const id = String(batchId || "");
    if (!id) return;
    const confirmed = await window.AISecEduUI.confirm(
      "停止这个批次中仍在运行的题目？已经生成成功的题目会保留。",
      { title: "停止批量任务", confirmLabel: "停止运行中项目", confirmStyle: "danger" },
    );
    if (!confirmed) return;
    const data = unwrap(
      await api.request(`/teaching/generation-batches/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    );
    state.taskCenterBatches.set(id, data.batch);
    state.lastJobListSignature = "";
    renderJobs();
    api.showNotice(
      state.dashboardMode ? elements.dashboardNotice : elements.notice,
      `已停止 ${Number((data.canceledTaskIds || []).length)} 个运行中项目，成功结果已保留。`,
      "success",
    );
  }

  async function jumpToJobConversation(jobId) {
    let job = taskById(jobId);
    if (
      job &&
      job.threadId &&
      (!state.thread || String(state.thread.id) !== String(job.threadId))
    ) {
      window.location.href = `/teacher?thread=${encodeURIComponent(job.threadId)}`;
      return;
    }
    let message = job && conversationMessageForJob(job);
    if (!message && state.thread) {
      await loadThread(state.thread.id);
      job = state.trackedJobs.get(String(jobId));
      message = job && conversationMessageForJob(job);
    }
    const target =
      message &&
      Array.from(elements.messages.querySelectorAll("[data-message-id]")).find(
        (node) => String(node.dataset.messageId) === String(message.id),
      );
    if (!target) {
      api.showNotice(
        elements.notice,
        "这项任务的对话结果暂未载入。",
        "warning",
      );
      return;
    }
    setDrawer(false);
    elements.messages
      .querySelectorAll(".is-result-focused")
      .forEach((node) => node.classList.remove("is-result-focused"));
    target.classList.add("is-result-focused");
    const reducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() =>
      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      }),
    );
    window.setTimeout(() => target.classList.remove("is-result-focused"), 2200);
  }

  function taskListSignature(rows) {
    return [
      state.selectedJobId || "",
      Array.from(state.retryingJobIds).sort().join(","),
      `${state.taskCenterPaging.hasNext}:${state.taskCenterPaging.nextOffset || ""}`,
      rows
        .map(
          (job) =>
            `${jobUiSignature(job)}:${job.taskListHidden === true ? "hidden" : "shown"}:${job.isGenerationBatch ? `${job.createdCount}/${job.validatedCount}/${job.failedCount}` : ""}`,
        )
        .join("|"),
    ].join("::");
  }

  function renderJobs() {
    const allRows = taskCenterRows()
      .filter((job) => job.taskListHidden !== true)
      .sort((left, right) =>
        String(right.updated || right.created || "").localeCompare(
          String(left.updated || left.created || ""),
        ),
      );
    const rows = allRows.filter(taskMatchesFilters);
    if (!rows.some((job) => String(job.id) === String(state.selectedJobId))) {
      state.selectedJobId = (rows[0] && String(rows[0].id)) || null;
    }
    const nextSignature = taskListSignature(rows);
    if (state.lastJobListSignature === nextSignature) {
      updateJobDurations(elements.jobList);
      syncProgressClock();
      renderActionsForSelectedJob();
      updateAgentChrome();
      return;
    }
    state.lastJobListSignature = nextSignature;
    const active = rows.filter((job) =>
      activeJobStatuses.has(String(job.status || "").toUpperCase()),
    );
    const completed = rows.filter(
      (job) => String(job.status || "").toUpperCase() === "SUCCEEDED",
    );
    const attention = rows.filter((job) =>
      ["FAILED", "CANCELED"].includes(String(job.status || "").toUpperCase()),
    );
    elements.drawerTitle.textContent = "任务中心";
    const timestamp = state.taskCenterLoadedAt
      ? ` · ${new Date(state.taskCenterLoadedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} 更新`
      : "";
    const filtered = rows.length !== allRows.length ? ` · 显示 ${rows.length}/${allRows.length}` : "";
    const paged = state.taskCenterPaging.hasNext ? ` · 已载入最近 ${allRows.length} 项` : "";
    elements.drawerSubtitle.textContent = `${active.length} 项进行中 · ${completed.length} 项已完成${attention.length ? ` · ${attention.length} 项需处理` : ""}${filtered}${paged}${timestamp}`;
    const loadMore = state.taskCenterPaging.hasNext
      ? '<div class="teaching-task-load-more"><button type="button" data-task-load-more><i class="fas fa-chevron-down" aria-hidden="true"></i><span>加载更早任务</span></button></div>'
      : "";
    elements.jobList.innerHTML = rows.length
      ? `${taskGroupMarkup("active", "进行中", active)}${taskGroupMarkup("attention", "需要处理", attention)}${taskGroupMarkup("completed", "已完成", completed)}${loadMore}`
      : `<div class="teaching-job-empty"><span><i class="far fa-check-circle"></i></span><h3>还没有任务</h3><p>发送要求后，任务会显示在这里。</p></div>`;
    renderActionsForSelectedJob();
    bindJobDisclosureButtons(elements.jobList, true);
    elements.jobList.querySelectorAll("[data-cancel-job]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await cancelTrackedJob(button.dataset.cancelJob);
        } catch (error) {
          button.disabled = false;
          showError(error);
        }
      });
    });
    elements.jobList.querySelectorAll("[data-retry-job]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await retryTrackedJob(button.dataset.retryJob);
        } catch (error) {
          showError(error);
        }
      });
    });
    elements.jobList.querySelectorAll("[data-retry-batch]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await retryGenerationBatch(button.dataset.retryBatch);
        } catch (error) {
          button.disabled = false;
          showError(error);
        }
      });
    });
    elements.jobList.querySelectorAll("[data-cancel-batch]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await cancelGenerationBatch(button.dataset.cancelBatch);
        } catch (error) {
          button.disabled = false;
          showError(error);
        }
      });
    });
    elements.jobList
      .querySelectorAll(".teaching-task-manage")
      .forEach((details) => {
        details.addEventListener("toggle", () => {
          if (!details.open) return;
          elements.jobList
            .querySelectorAll(".teaching-task-manage[open]")
            .forEach((other) => {
              if (other !== details) other.open = false;
            });
        });
      });
    elements.jobList
      .querySelectorAll("[data-delete-task]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const removed = await dismissTrackedJob(button.dataset.deleteTask);
            if (!removed) button.disabled = false;
          } catch (error) {
            button.disabled = false;
            showError(error);
          }
        });
      });
    elements.jobList.querySelectorAll("[data-job-jump]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await jumpToJobConversation(button.dataset.jobJump);
        } catch (error) {
          button.disabled = false;
          showError(error);
        }
      });
    });
    elements.jobList.querySelectorAll("[data-task-candidate]").forEach((button) => {
      button.addEventListener("click", () => {
        setDrawer(false);
        openCandidateSet(button.dataset.taskCandidate);
      });
    });
    elements.jobList.querySelector("[data-task-load-more]")?.addEventListener(
      "click",
      async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.querySelector("span").textContent = "正在加载…";
        try {
          await loadTaskCenter({ append: true, silent: true });
        } catch (error) {
          button.disabled = false;
          button.querySelector("span").textContent = "重新加载";
          showError(error);
        }
      },
    );
    animateJobProgressBars(elements.jobList);
    syncProgressClock();
    updateAgentChrome();
  }

  async function loadArtifacts() {
    if (!elements.dojo.value) {
      elements.artifacts.innerHTML =
        '<p class="teaching-muted">选择课程后查看已生成内容。</p>';
      return;
    }
    const data = unwrap(
      await api.request(
        `/teaching/artifacts?dojoId=${encodeURIComponent(elements.dojo.value)}`,
      ),
    );
    elements.artifacts.innerHTML = (data.artifacts || []).length
      ? data.artifacts
          .map(
            (item) => `
      <a href="${api.escapeHtml(teacherArtifactHref(item.id))}" class="activity-artifact">
        <span><strong>${api.escapeHtml(item.title)}</strong><small>${api.escapeHtml(item.type)} · r${item.currentRevision}</small></span>
        <span class="badge badge-secondary">${api.escapeHtml(item.status)}</span>
      </a>`,
          )
          .join("")
      : '<p class="teaching-muted">尚无已生成内容。</p>';
  }

  async function loadMaterials() {
    if (!elements.dojo.value) {
      elements.materials.innerHTML =
        '<p class="teaching-muted">选择课程后查看已归档资料；也可以直接从对话上传文件。</p>';
      return;
    }
    const data = unwrap(
      await api.request(
        `/teaching/materials?dojoId=${encodeURIComponent(elements.dojo.value)}`,
      ),
    );
    const rows = data.materials || [];
    elements.materials.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
      <button type="button" class="activity-artifact w-100 text-left" data-open-material="${api.escapeHtml(item.id)}">
        <span><strong>${api.escapeHtml(item.title)}</strong><small>${api.escapeHtml(item.filename)} · ${api.escapeHtml(item.status)}</small></span>
        <i class="fas fa-chevron-right"></i>
      </button>`,
          )
          .join("")
      : '<p class="teaching-muted">尚未上传课件。</p>';
    elements.materials
      .querySelectorAll("[data-open-material]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          openMaterial(button.dataset.openMaterial),
        );
      });
  }

  async function openMaterial(id) {
    try {
      const data = unwrap(
        await api.request(`/teaching/materials/${encodeURIComponent(id)}`),
      );
      state.material = data.material;
      const analysis =
        (state.material.revision && state.material.revision.analysis) || {};
      const points = analysis.functionalPoints || [];
      const graph = analysis.knowledgeGraph || {};
      const chapters = analysis.chapterCandidates || [];
      const valueText = (value) =>
        typeof value === "string"
          ? value
          : (value && (value.name || value.title || value.label)) ||
            JSON.stringify(value || {});
      elements.materialSummary.textContent = analysis.summary || "分析已完成。";
      elements.materialFunctions.innerHTML = points.length
        ? points
            .map((item) => `<li>${api.escapeHtml(valueText(item))}</li>`)
            .join("")
        : "<li>未识别到功能点</li>";
      elements.materialGraph.innerHTML = `<p>${(graph.nodes || []).length} 个节点 · ${(graph.edges || []).length} 条关系</p>
        <ul>${(graph.nodes || [])
          .slice(0, 40)
          .map((item) => `<li>${api.escapeHtml(valueText(item))}</li>`)
          .join("")}</ul>`;
      elements.materialChapters.innerHTML = chapters.length
        ? chapters
            .map(
              (item, index) => `
        <label class="candidate-option material-chapter-option">
          <span class="candidate-check"><input type="checkbox" data-chapter-index="${index}" checked> 采用本章</span>
          <h3>${api.escapeHtml(item.title || `章节 ${index + 1}`)}</h3>
          <p>${api.escapeHtml(item.description || item.summary || "")}</p>
          <ul>${(item.objectives || []).map((value) => `<li>${api.escapeHtml(valueText(value))}</li>`).join("")}</ul>
        </label>`,
            )
            .join("")
        : '<p class="teaching-muted">没有章节候选。</p>';
      elements.materialSources.innerHTML =
        (state.material.sources || [])
          .map(
            (source) => `
        <article class="material-source"><strong>${api.escapeHtml(JSON.stringify(source.locator || {}))}</strong><p>${api.escapeHtml(source.excerpt || "")}</p></article>`,
          )
          .join("") || '<p class="teaching-muted">没有可展示的来源片段。</p>';
      elements.materialNotice.textContent = `分析版本 ${state.material.revision ? state.material.revision.revision : "-"} · ${statusLabel(state.material.status)}`;
      document.getElementById("material-apply-chapters").disabled =
        !chapters.length;
      document.getElementById("material-reanalyze").disabled = false;
      openDialog("material-modal");
    } catch (error) {
      showError(error);
    }
  }

  async function applyMaterialChapters() {
    if (!state.material) return;
    const indexes = Array.from(
      elements.materialChapters.querySelectorAll(
        "[data-chapter-index]:checked",
      ),
    ).map((input) => Number(input.dataset.chapterIndex));
    if (!indexes.length) return;
    const button = document.getElementById("material-apply-chapters");
    button.disabled = true;
    try {
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/materials/${encodeURIComponent(state.material.id)}/apply-chapters`,
          { chapterIndexes: indexes },
        ),
      );
      api.showNotice(
        elements.notice,
        "章节已准备好，请确认是否添加到课程。",
        "success",
      );
      closeDialog("material-modal");
      if (data.action) await loadActions();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  }

  async function reanalyzeMaterial(materialId) {
    const id = materialId || (state.material && state.material.id);
    if (!id) return;
    const button = document.getElementById("material-reanalyze");
    button.disabled = true;
    try {
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/materials/${encodeURIComponent(id)}/analyze`,
          {
            threadId: state.thread && state.thread.id,
            reason:
              "教师从 AI 共创工作台请求重新提取功能点、知识图谱和章节候选",
          },
        ),
      );
      if (data.job) state.trackedJobs.set(data.job.id, data.job);
      api.showNotice(
        elements.notice,
        data.deduplicated
          ? "该课件已有分析任务在运行。"
          : "已建立新的课件分析任务。",
        "success",
      );
      closeDialog("material-modal");
      renderJobs();
      schedulePoll();
      await loadMaterials();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  }

  async function decideAction(actionId, decision, options) {
    const currentAction = state.actions.find(
      (item) => String(item.id) === String(actionId),
    );
    const publishing =
      currentAction &&
      ["publish-question-artifact", "publish-teaching-artifact"].includes(
        currentAction.type,
      );
    const verb = decision === "APPROVED" ? "确认并继续" : "暂不执行";
    const confirmed =
      Boolean(options && options.skipConfirmation) ||
      (publishing && decision === "APPROVED"
        ? true
        : await window.AISecEduUI.confirm(
            decision === "APPROVED"
              ? "确认把已经准备好的内容写入课程？"
              : "确认暂不执行这项操作？",
            {
              title: decision === "APPROVED" ? "确认课程变更" : "暂不执行",
              confirmLabel: verb,
              confirmStyle: decision === "APPROVED" ? "primary" : "danger",
            },
          ));
    if (!confirmed) return null;
    const data = unwrap(
      await api.json(
        "POST",
        `/teaching/actions/${encodeURIComponent(actionId)}/decision`,
        {
          decision,
          confirmed: true,
          comment: "教师在 AI 共创工作台中明确确认",
        },
      ),
    );
    api.showNotice(
      elements.notice,
      publishing
        ? decision === "APPROVED"
          ? "发布成功"
          : "已取消发布"
        : decision === "APPROVED"
          ? "操作完成"
          : "操作已取消",
      decision === "APPROVED" ? "success" : "warning",
    );
    await Promise.all([loadActions(), loadArtifacts()]);
    if (
      data.action &&
      data.action.type === "apply-material-chapters" &&
      decision === "APPROVED"
    ) {
      state.context = unwrap(
        await api.request("/teaching/context?view=teacher"),
      );
      populateDojos(Number(elements.dojo.value));
    }
    return data.action;
  }

  function renderActionsForSelectedJob() {
    if (elements.actionSection) elements.actionSection.hidden = true;
    if (elements.actions) elements.actions.innerHTML = "";
    renderApprovalTray();
  }

  async function loadActions() {
    if (!elements.dojo.value) {
      state.actions = [];
      renderActionsForSelectedJob();
      renderMessages();
      return;
    }
    const data = unwrap(
      await api.request(
        `/teaching/actions?status=AWAITING_APPROVAL&dojoId=${encodeURIComponent(elements.dojo.value)}`,
      ),
    );
    state.actions = data.actions || [];
    renderActionsForSelectedJob();
    renderMessages();
  }

  async function loadProgress() {
    if (!elements.dojo.value) {
      elements.progress.textContent = "选择课程后读取可核验完成情况。";
      return;
    }
    const data = unwrap(
      await api.request(
        `/teaching/progress/${encodeURIComponent(elements.dojo.value)}`,
      ),
    );
    const students = data.students || [];
    const completed = students.filter(
      (item) => item.verifiedCompletion >= 1,
    ).length;
    const active = students.filter((item) => item.attemptCount > 0).length;
    elements.progress.innerHTML = `<strong>${completed} / ${students.length} 名学生完成必修题</strong><span>${active} 人有真实作答记录 · ${data.requiredChallengeCount} 道必修题</span><small>浏览课件不计为能力完成</small>
      <details><summary>查看学生细粒度事实</summary><ul class="progress-student-list">${students.map((item) => `<li><span>${api.escapeHtml(item.name)}</span><strong>${item.requiredSolved}/${item.requiredTotal}</strong><small>${item.attemptCount} 次尝试 · ${Math.round((item.verifiedCompletion || 0) * 100)}%</small></li>`).join("") || "<li>暂无学生记录</li>"}</ul></details>`;
  }

  async function loadSessions() {
    const data = unwrap(await api.request("/teaching/sessions"));
    const dojoId = Number(elements.dojo.value || 0);
    const moduleIndex =
      elements.module.value === "" ? null : Number(elements.module.value);
    const matching = (data.sessions || []).filter(
      (item) => item.dojoId === dojoId && item.moduleIndex === moduleIndex,
    );
    state.activeSession =
      matching.find((item) => item.status === "LIVE") ||
      matching.find((item) => ["READY", "PAUSED"].includes(item.status)) ||
      null;
    const labels = {
      READY: "待开始",
      PAUSED: "已暂停",
      LIVE: "直播中",
      ENDED: "已结束",
    };
    elements.session.textContent = state.activeSession
      ? `${labels[state.activeSession.status] || state.activeSession.status}：${state.activeSession.title}`
      : "尚未建立课堂会话。";
    elements.sessionStart.disabled =
      !dojoId ||
      Boolean(state.activeSession && state.activeSession.status === "LIVE");
    elements.sessionStart.textContent =
      state.activeSession && state.activeSession.status === "PAUSED"
        ? "继续课堂"
        : "开始课堂";
    elements.sessionEnd.disabled =
      !state.activeSession || state.activeSession.status !== "LIVE";
    elements.sessionOpen.hidden =
      !state.activeSession ||
      !["LIVE", "ENDED"].includes(state.activeSession.status);
  }

  async function openSession() {
    if (!state.activeSession) return;
    const launch = unwrap(
      await api.json("POST", "/teaching/runtime/launch", {
        role: "teacher",
        dojoId: state.activeSession.dojoId,
        moduleIndex: state.activeSession.moduleIndex,
        target: `/classroom/${state.activeSession.id}`,
      }),
    );
    window.location.href = launch.launchUrl;
  }

  async function startSession() {
    const dojo = currentDojo();
    if (!dojo || !state.thread) return;
    const moduleIndex =
      elements.module.value === "" ? null : Number(elements.module.value);
    let session = state.activeSession;
    if (!session || !["READY", "PAUSED"].includes(session.status)) {
      const created = unwrap(
        await api.json("POST", "/teaching/sessions", {
          dojoId: dojo.id,
          moduleIndex,
          threadId: state.thread.id,
          title: `${dojo.name} · 课中`,
          state: { phase: "IN_CLASS" },
        }),
      );
      session = { id: created.sessionId, status: "READY" };
    }
    const control = unwrap(
      await api.json(
        "POST",
        `/teaching/sessions/${encodeURIComponent(session.id)}/control`,
        { command: "start" },
      ),
    );
    const approved = await decideAction(control.action.id, "APPROVED");
    if (approved && approved.status === "APPROVED") {
      state.phase = "IN_CLASS";
      await saveContext();
    }
    await loadSessions();
  }

  async function endSession() {
    if (!state.activeSession || state.activeSession.status !== "LIVE") return;
    const control = unwrap(
      await api.json(
        "POST",
        `/teaching/sessions/${encodeURIComponent(state.activeSession.id)}/control`,
        { command: "end" },
      ),
    );
    await decideAction(control.action.id, "APPROVED");
    await loadSessions();
    await loadProgress();
  }

  function threadGroup(item) {
    if (item.pinned && item.status !== "ARCHIVED") return "置顶";
    const value = new Date(item.updated || item.created || 0);
    if (Number.isNaN(value.getTime())) return "更早";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    const distance = Math.floor((today.getTime() - day.getTime()) / 86400000);
    if (distance <= 0) return "今天";
    if (distance === 1) return "昨天";
    if (distance < 7) return "过去 7 天";
    if (distance < 30) return "过去 30 天";
    return "更早";
  }

  function threadTime(item) {
    const value = new Date(item.updated || item.created || 0);
    if (Number.isNaN(value.getTime())) return "";
    if (["今天", "昨天"].includes(threadGroup(item))) {
      return value.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    return value.toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  }

  function threadItemMarkup(item) {
    const active = Boolean(state.thread && state.thread.id === item.id);
    const preview =
      item.latestMessage ||
      (item.messageCount ? `${item.messageCount} 条消息` : "空对话");
    return `<article class="teaching-thread-item ${active ? "is-active" : ""}" data-thread-row="${api.escapeHtml(item.id)}" role="option" aria-selected="${String(active)}">
      <button type="button" class="teaching-thread-open" data-thread-open="${api.escapeHtml(item.id)}" title="${api.escapeHtml(item.title)}">
        <span class="teaching-thread-item-title">${item.pinned ? '<i class="fas fa-thumbtack" aria-label="已置顶"></i>' : ""}<strong>${api.escapeHtml(item.title)}</strong></span>
        <small>${api.escapeHtml(preview)}</small>
        <time datetime="${api.escapeHtml(item.updated || item.created || "")}">${api.escapeHtml(threadTime(item))}</time>
      </button>
      <button type="button" class="teaching-thread-more" data-thread-menu="${api.escapeHtml(item.id)}" aria-label="${api.escapeHtml(item.title)}的更多操作" aria-haspopup="menu" aria-expanded="false" aria-controls="teaching-thread-action-menu"><i class="fas fa-ellipsis-h"></i></button>
    </article>`;
  }

  function renderThreads() {
    const rows = state.threads || [];
    if (!rows.length) {
      const searching = Boolean(state.threadQuery);
      elements.threads.innerHTML = `<div class="teaching-thread-empty">
        <i class="fas ${searching ? "fa-search" : "fa-comment-alt"}"></i>
        <strong>${searching ? "没有找到相关对话" : "还没有对话"}</strong>
        <small>${searching ? "试试其他关键词" : "新建对话开始教学工作"}</small>
      </div>`;
      return;
    }
    const order = ["置顶", "今天", "昨天", "过去 7 天", "过去 30 天", "更早"];
    const grouped = new Map();
    rows.forEach((item) => {
      const key = threadGroup(item);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    elements.threads.innerHTML = order
      .filter((key) => grouped.has(key))
      .map(
        (key) => `
      <section class="teaching-thread-group" aria-label="${key}">
        <h2>${key}</h2>
        ${grouped.get(key).map(threadItemMarkup).join("")}
      </section>`,
      )
      .join("");
    elements.threads
      .querySelectorAll("[data-thread-open]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          activateThread(button.dataset.threadOpen).catch(showError),
        );
      });
    elements.threads
      .querySelectorAll("[data-thread-menu]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openThreadActionMenu(button.dataset.threadMenu, button);
        });
      });
  }

  async function loadThreads() {
    const requestId = ++state.threadRequest;
    const query = new URLSearchParams({ view: "active" });
    if (state.threadQuery) query.set("q", state.threadQuery);
    const data = unwrap(
      await api.request(`/teaching/threads?${query.toString()}`),
    );
    if (requestId !== state.threadRequest) return state.threads;
    state.threads = data.threads || [];
    renderThreads();
    return state.threads;
  }

  async function activateThread(id) {
    closeThreadActionMenu();
    await loadThread(id);
    await loadActions();
    setSidebar(false);
  }

  function targetThread(id) {
    if (state.thread && state.thread.id === id) return state.thread;
    return state.threads.find((item) => item.id === id) || null;
  }

  function closeThreadActionMenu() {
    elements.threadActionMenu.hidden = true;
    elements.threadActionMenu.setAttribute("aria-hidden", "true");
    document
      .querySelectorAll('[aria-controls="teaching-thread-action-menu"]')
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
    state.threadActionTargetId = null;
  }

  function openThreadActionMenu(id, anchor) {
    const item = targetThread(id);
    if (!item || !anchor) return;
    if (
      !elements.threadActionMenu.hidden &&
      state.threadActionTargetId === id
    ) {
      closeThreadActionMenu();
      return;
    }
    state.threadActionTargetId = id;
    const archived = item.status === "ARCHIVED";
    elements.threadActionMenu.querySelector(
      '[data-thread-action="pin"]',
    ).hidden = archived;
    elements.threadActionMenu.querySelector(
      '[data-thread-action="archive"]',
    ).hidden = archived;
    elements.threadActionMenu.querySelector(
      '[data-thread-action="restore"]',
    ).hidden = !archived;
    elements.pinLabel.textContent = item.pinned ? "取消置顶" : "置顶";
    elements.threadActionMenu.hidden = false;
    elements.threadActionMenu.setAttribute("aria-hidden", "false");
    document
      .querySelectorAll('[aria-controls="teaching-thread-action-menu"]')
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
    anchor.setAttribute("aria-expanded", "true");
    const rect = anchor.getBoundingClientRect();
    const menuRect = elements.threadActionMenu.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - menuRect.width - 8,
        rect.right - menuRect.width,
      ),
    );
    const preferredTop = rect.bottom + 6;
    const top =
      preferredTop + menuRect.height < window.innerHeight - 8
        ? preferredTop
        : Math.max(8, rect.top - menuRect.height - 6);
    elements.threadActionMenu.style.left = `${left}px`;
    elements.threadActionMenu.style.top = `${top}px`;
    const first = elements.threadActionMenu.querySelector(
      "button:not([hidden])",
    );
    if (first) first.focus({ preventScroll: true });
  }

  async function renameThread(item) {
    const value = await window.AISecEduUI.prompt(
      "为这段对话设置一个便于查找的名称。",
      {
        title: "重命名对话",
        inputLabel: "对话名称",
        value: item.title,
        maxLength: 240,
        confirmLabel: "保存",
      },
    );
    const title = String(value || "").trim();
    if (!title || title === item.title) return;
    const data = unwrap(
      await api.json(
        "PATCH",
        `/teaching/threads/${encodeURIComponent(item.id)}`,
        { title },
      ),
    );
    if (state.thread && state.thread.id === item.id) {
      state.thread = { ...state.thread, ...data.thread };
      elements.title.textContent = state.thread.title;
    }
    await loadThreads();
  }

  async function archiveThread(item) {
    unwrap(
      await api.json(
        "PATCH",
        `/teaching/threads/${encodeURIComponent(item.id)}`,
        { archived: true },
      ),
    );
    api.showNotice(elements.notice, "对话已归档，可在设置中恢复。", "success");
    await loadThreads();
    if (state.thread && state.thread.id === item.id) {
      if (state.threads.length) await activateThread(state.threads[0].id);
      else await createThread();
    }
  }

  async function restoreArchivedThread(item) {
    unwrap(
      await api.json(
        "PATCH",
        `/teaching/threads/${encodeURIComponent(item.id)}`,
        { archived: false },
      ),
    );
    state.threadQuery = "";
    elements.threadSearch.value = "";
    await loadThreads();
    await activateThread(item.id);
    api.showNotice(elements.notice, "对话已恢复。", "success");
  }

  async function deleteThread(item) {
    const confirmed = await window.AISecEduUI.confirm(
      `永久删除“${item.title}”？消息和卡片将无法恢复。`,
      { title: "删除对话", confirmLabel: "永久删除", confirmStyle: "danger" },
    );
    if (!confirmed) return;
    unwrap(
      await api.json(
        "DELETE",
        `/teaching/threads/${encodeURIComponent(item.id)}`,
        { confirmed: true },
      ),
    );
    const wasCurrent = Boolean(state.thread && state.thread.id === item.id);
    await loadThreads();
    if (!wasCurrent) return;
    if (state.threads.length) {
      await activateThread(state.threads[0].id);
      return;
    }
    await createThread();
  }

  async function handleThreadAction(action) {
    const item = targetThread(state.threadActionTargetId);
    closeThreadActionMenu();
    if (!item) return;
    if (action === "rename") await renameThread(item);
    else if (action === "pin") {
      unwrap(
        await api.json(
          "PATCH",
          `/teaching/threads/${encodeURIComponent(item.id)}`,
          { pinned: !item.pinned },
        ),
      );
      await loadThreads();
    } else if (action === "archive") await archiveThread(item);
    else if (action === "restore") await restoreArchivedThread(item);
    else if (action === "delete") await deleteThread(item);
  }

  async function loadThread(id) {
    const changingThread = !state.thread || state.thread.id !== id;
    const data = unwrap(
      await api.request(`/teaching/threads/${encodeURIComponent(id)}`),
    );
    state.thread = data.thread;
    syncAttachmentSources(state.thread);
    state.phase = navigationPhase || state.thread.phase || "COURSE_SETUP";
    if (navigationPhase && state.thread.phase !== navigationPhase) {
      const updated = unwrap(
        await api.json("PATCH", `/teaching/threads/${state.thread.id}`, {
          phase: navigationPhase,
        }),
      );
      state.thread = { ...state.thread, ...updated.thread };
      syncAttachmentSources(state.thread);
    }
    elements.title.textContent = state.thread.title;
    setDashboardMode(false);
    if (changingThread) {
      state.trackedJobs.clear();
      state.selectedJobId = null;
      state.expandedJobIds.clear();
      state.autoExecuteJobIds.clear();
      state.continuationRequests.clear();
      state.appliedActionProposals.clear();
      state.executingProposalKeys.clear();
      state.proposalFailures.clear();
      state.resolvingApprovalKeys.clear();
      state.selectingGenerationOptions.clear();
      state.actions = [];
      state.lastTranscriptSignature = "";
      state.newContentAvailable = false;
      state.forceScrollToLatest = true;
      elements.jumpLatest.hidden = true;
    }
    populateDojos(state.thread.dojoId);
    collectJobs();
    renderMessages();
    renderThreads();
    syncComposerState();
  }

  function collectJobs() {
    (state.thread.messages || []).forEach((message) =>
      (message.cards || []).forEach((card) => {
        const cardState = card.state || {};
        if (cardState.taskListHidden === true) return;
        const candidateJob = card.type === "candidate_set" && cardState.jobId;
        const jobId = card.type === "job" ? card.objectId : candidateJob;
        if (jobId) {
          const cardStatus = String(cardState.status || "QUEUED").toUpperCase();
          const normalizedStatus =
            cardStatus === "GENERATING" || cardStatus === "MATERIALIZING"
              ? "QUEUED"
              : cardStatus === "READY" ||
                  cardStatus === "COMPLETED" ||
                  cardStatus === "MATERIALIZED"
                ? "SUCCEEDED"
                : cardStatus;
          const existing = state.trackedJobs.get(String(jobId)) || {};
          state.trackedJobs.set(String(jobId), {
            ...existing,
            id: String(jobId),
            kind:
              card.type === "candidate_set"
                ? "candidate.generate"
                : cardState.kind || "teaching.job",
            title: cardState.title || existing.title || null,
            artifactType:
              cardState.artifactType ||
              (card.type === "candidate_set" ? cardState.kind : null),
            batch: cardState.batch || existing.batch || null,
            batchIndex: cardState.batchIndex || existing.batchIndex || null,
            batchCount: cardState.batchCount || existing.batchCount || null,
            batchTopic: cardState.batchTopic || existing.batchTopic || null,
            status: normalizedStatus,
            stage: cardState.stage || "queued",
            progress: cardState.progress || 0,
            error: cardState.error || null,
            failureMessage: cardState.failureMessage || null,
            result:
              card.type === "candidate_set"
                ? {
                    candidateSetId: card.objectId,
                    artifactId: cardState.artifactId || null,
                  }
                : cardState.result || {},
            resultTarget:
              cardState.resultTarget ||
              (card.type === "candidate_set"
                ? { kind: "candidate", candidateSetId: card.objectId }
                : null),
            threadId: state.thread.id,
            created:
              card.created || message.created || existing.created || null,
            updated: cardState.updated || null,
          });
        }
      }),
    );
    (state.thread.messages || []).forEach((message) => {
      if (message.role !== "assistant") return;
      const metadata = message.metadata || {};
      if (metadata.taskListHidden === true) return;
      if (!metadata.jobId) return;
      const id = String(metadata.jobId);
      const existing = state.trackedJobs.get(id) || {};
      const existingStatus = String(existing.status || "").toUpperCase();
      const cardStatuses = (message.cards || [])
        .map((card) => String((card.state || {}).status || "").toUpperCase())
        .filter(Boolean);
      let status = String(metadata.jobStatus || "").toUpperCase();
      if (!status) {
        if (metadata.failed) status = "FAILED";
        else if (metadata.pending === false) status = "SUCCEEDED";
        else if (["SUCCEEDED", "FAILED", "CANCELED"].includes(existingStatus))
          status = existingStatus;
        else if (cardStatuses.includes("FAILED")) status = "FAILED";
        else if (cardStatuses.includes("CANCELED")) status = "CANCELED";
        else if (
          cardStatuses.some((value) =>
            [
              "READY",
              "SUCCEEDED",
              "COMPLETED",
              "MATERIALIZED",
              "SELECTED",
            ].includes(value),
          )
        )
          status = "SUCCEEDED";
        else if (activeJobStatuses.has(existingStatus)) status = existingStatus;
        else if (
          cardStatuses.some((value) =>
            [
              "QUEUED",
              "RUNNING",
              "GENERATING",
              "MATERIALIZING",
              "CANCEL_REQUESTED",
            ].includes(value),
          )
        )
          status = "QUEUED";
        else
          status =
            metadata.pending === true || syntheticProcessCopy(message.content)
              ? "QUEUED"
              : "SUCCEEDED";
      }
      if (
        metadata.pending === true &&
        ["SUCCEEDED", "FAILED", "CANCELED"].includes(existingStatus)
      ) {
        status = existingStatus;
      }
      if (
        metadata.pending === true &&
        activeJobStatuses.has(existingStatus) &&
        activeJobStatuses.has(status)
      ) {
        status = existingStatus;
      }
      state.trackedJobs.set(id, {
        ...existing,
        id,
        kind: existing.kind || metadata.jobKind || "agent.chat",
        status,
        stage:
          existing.stage ||
          (status === "SUCCEEDED"
            ? "complete"
            : status === "FAILED"
              ? "failed"
              : status === "CANCELED"
                ? "canceled"
                : "queued"),
        progress: Number.isFinite(Number(existing.progress))
          ? Number(existing.progress)
          : status === "SUCCEEDED"
            ? 100
            : 0,
        failureMessage:
          existing.failureMessage || (metadata.failed ? message.content : null),
        threadId: state.thread.id,
        created: existing.created || message.created,
        updated: existing.updated || message.created,
      });
    });
    renderJobs();
    schedulePoll();
  }

  async function createThread(options = {}) {
    state.threadQuery = "";
    elements.threadSearch.value = "";
    state.thread = {
      id: null,
      title: options.title || "新教学对话",
      status: "ACTIVE",
      pinned: false,
      phase: state.phase,
      dojoId:
        options.dojoId === null || typeof options.dojoId === "undefined"
          ? null
          : Number(options.dojoId),
      moduleIndex:
        options.moduleIndex === null ||
        options.moduleIndex === "" ||
        typeof options.moduleIndex === "undefined"
          ? null
          : Number(options.moduleIndex),
      context: {},
      messages: [],
      ephemeral: true,
    };
    state.trackedJobs.clear();
    state.selectedJobId = null;
    state.expandedJobIds.clear();
    state.actions = [];
    state.lastTranscriptSignature = "";
    state.newContentAvailable = false;
    state.forceScrollToLatest = true;
    elements.title.textContent = state.thread.title;
    populateDojos(state.thread.dojoId);
    renderMessages();
    renderThreads();
    syncComposerState();
    setDashboardMode(false);
    setSidebar(false);
    elements.input.focus();
    return state.thread;
  }

  async function persistThread() {
    if (!state.thread) await createThread();
    if (state.thread.id) return state.thread;
    const data = unwrap(
      await api.json("POST", "/teaching/threads", {
        phase: state.thread.phase || state.phase,
        title: state.thread.title || "新教学对话",
        dojoId: state.thread.dojoId,
        moduleIndex: state.thread.moduleIndex,
        context: state.thread.context || {},
      }),
    );
    state.thread = {
      ...state.thread,
      ...data.thread,
      messages: state.thread.messages || [],
      ephemeral: false,
    };
    elements.title.textContent = state.thread.title;
    await loadThreads();
    return state.thread;
  }

  async function saveContext() {
    if (!state.thread) return;
    const dojoId = Number(elements.dojo.value || 0) || null;
    const moduleIndex =
      elements.module.value === "" ? null : Number(elements.module.value);
    if (!state.thread.id) {
      state.thread = {
        ...state.thread,
        dojoId,
        moduleIndex,
        phase: state.phase,
      };
    } else {
      const data = unwrap(
        await api.json("PATCH", `/teaching/threads/${state.thread.id}`, {
          dojoId,
          moduleIndex,
          phase: state.phase,
        }),
      );
      state.thread = { ...state.thread, ...data.thread };
    }
    syncContextLinks();
    state.actions = [];
    renderMessages();
  }

  async function sendMessage(prompt, artifactType, options) {
    const content = (
      typeof prompt === "string" ? prompt : elements.input.value
    ).trim();
    if (!content) return { executed: false, reason: "empty" };
    const generationOptions = options || {};
    if (state.busy) return { executed: false, reason: "busy" };
    const active = primaryActiveJob();
    if (active && !generationOptions.agentContinuation) {
      api.showNotice(
        elements.notice,
        "当前任务仍在执行。你可以先编辑下一条要求，待完成后再发送，或停止当前任务。",
        "info",
      );
      updateAgentChrome();
      return { executed: false, reason: "active-job" };
    }
    const candidateMode =
      generationOptions.candidateMode || elements.candidateMode.value || "auto";
    const candidateCount = Number(
      generationOptions.candidateCount || elements.count.value || 3,
    );
    setBusy(true);
    api.showNotice(elements.notice, "", "info");
    try {
      await persistThread();
      const submissionId =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const data = unwrap(
        await api.request(`/teaching/threads/${state.thread.id}/messages`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": `agent-message-${state.thread.id}-${submissionId}`,
          },
          body: JSON.stringify({
            content,
            artifactType: artifactType || elements.type.value || "auto",
            candidateMode,
            candidateCount,
            agentContinuation: Boolean(generationOptions.agentContinuation),
            action: generationOptions.agentContinuation
              ? "generate"
              : undefined,
            sourceRefs: Array.isArray(generationOptions.sourceRefs)
              ? generationOptions.sourceRefs
              : Array.from(
                  new Set([
                    ...state.sourceMaterialIds,
                    ...state.pendingMaterialIds,
                  ]),
                ).map((id) => ({ type: "material", id })),
            generationSelection:
              generationOptions.generationSelection || undefined,
          }),
        }),
      );
      state.thread = data.thread;
      syncAttachmentSources(state.thread);
      elements.title.textContent = state.thread.title;
      if (
        data.job &&
        data.job.kind === "agent.chat" &&
        !generationOptions.agentContinuation
      ) {
        state.autoExecuteJobIds.add(String(data.job.id));
      }
      populateDojos(state.thread.dojoId);
      if (data.job) {
        state.trackedJobs.set(String(data.job.id), data.job);
        state.selectedJobId = String(data.job.id);
      }
      elements.input.value = "";
      elements.type.value = "auto";
      state.forceScrollToLatest = true;
      renderMessages();
      renderJobs();
      syncComposerState();
      loadThreads().catch(showError);
      schedulePoll();
      return { executed: true, data };
    } catch (error) {
      showError(error);
      return { executed: false, reason: "request-failed", error };
    } finally {
      setBusy(false);
    }
  }

  async function pollJobs() {
    if (state.polling) return;
    state.polling = true;
    try {
    const active = Array.from(state.trackedJobs.values()).filter((job) =>
      ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(job.status),
    );
    let refreshThread = false;
    let refreshMaterials = false;
    await Promise.all(
      active.map(async (item) => {
        try {
          const data = unwrap(await api.request(`/teaching/jobs/${item.id}`));
          state.trackedJobs.set(String(item.id), {
            ...item,
            ...data.job,
            events: data.events || [],
            activityLoaded: true,
          });
          if (
            data.job.status === "SUCCEEDED" &&
            data.job.result &&
            data.job.result.candidateSetId
          ) {
            const label =
              data.job.result.generationMode === "single"
                ? "READY · 点击打开"
                : "READY · 点击比较";
            document
              .querySelectorAll(
                `[data-candidate-set="${data.job.result.candidateSetId}"] small`,
              )
              .forEach((itemLabel) => {
                itemLabel.textContent = label;
              });
          }
          if (["SUCCEEDED", "FAILED", "CANCELED"].includes(data.job.status))
            refreshThread = true;
          if (
            data.job.status === "SUCCEEDED" &&
            data.job.kind === "material.analyze"
          )
            refreshMaterials = true;
        } catch (error) {
          console.warn("Unable to poll teaching job", error);
        }
      }),
    );
    if (refreshThread && state.thread) await loadThread(state.thread.id);
    if (refreshMaterials) await loadMaterials();
    if (
      elements.drawer.classList.contains("is-open") ||
      state.dashboardMode ||
      Array.from(state.taskCenterJobs.values()).some((job) =>
        activeJobStatuses.has(String(job.status || "").toUpperCase()),
      ) ||
      Array.from(state.taskCenterBatches.values()).some((batch) =>
        ["queued", "generating", "validating"].includes(
          String(batch.status || "").toLowerCase(),
        ),
      )
    ) {
      await loadTaskCenter({ silent: true });
    }
    if (!refreshThread) {
      renderJobs();
      renderMessages();
    }
    } finally {
      state.polling = false;
      schedulePoll();
    }
  }

  function schedulePoll() {
    window.clearTimeout(state.pollTimer);
    const activeRows = taskCenterRows().filter((job) =>
      activeJobStatuses.has(String(job.status || "").toUpperCase()),
    );
    const activeSignature = activeRows
      .map((job) => `${job.id || ""}:${job.status || ""}:${job.progress || 0}:${job.stage || ""}`)
      .sort()
      .join("|");
    const hasActive = Boolean(activeRows.length);
    if (hasActive) {
      state.pollDelayMs = activeSignature !== state.lastActivePollSignature
        ? 1800
        : Math.min(10000, Math.round(state.pollDelayMs * 1.6));
      state.lastActivePollSignature = activeSignature;
      const delay = document.hidden ? Math.max(20000, state.pollDelayMs) : state.pollDelayMs;
      state.pollTimer = window.setTimeout(pollJobs, delay);
    } else {
      state.pollDelayMs = 1800;
      state.lastActivePollSignature = "";
    }
  }

  function parentJobForCandidateSet(candidateSetId) {
    return (
      Array.from(state.trackedJobs.values()).find((job) => {
        const result =
          job.result && typeof job.result === "object" ? job.result : {};
        const target = job.resultTarget || {};
        return (
          String(result.candidateSetId || target.candidateSetId || "") ===
          String(candidateSetId)
        );
      }) || null
    );
  }

  function trackArtifactMaterialization(
    candidateSetId,
    artifactId,
    materializationJob,
  ) {
    const parent = parentJobForCandidateSet(candidateSetId);
    const progress =
      materializationJob.status === "SUCCEEDED"
        ? 100
        : Math.max(
            50,
            Math.min(
              99,
              50 + Math.floor(Number(materializationJob.progress || 0) / 2),
            ),
          );
    if (parent) {
      state.trackedJobs.set(parent.id, {
        ...parent,
        status: materializationJob.status,
        stage: materializationJob.stage,
        progress,
        failureMessage: materializationJob.failureMessage,
        result: {
          ...(parent.result || {}),
          candidateSetId,
          artifactId,
          materializationJobId: materializationJob.id,
        },
        resultTarget: {
          kind: "link",
          href: teacherArtifactHref(artifactId),
        },
      });
      state.selectedJobId = parent.id;
    } else {
      state.trackedJobs.set(materializationJob.id, materializationJob);
      state.selectedJobId = materializationJob.id;
    }
    renderJobs();
    renderMessages();
  }

  async function openArtifactWhenReady(artifactId, candidateSetId, initialJob) {
    let materializationJob = initialJob || null;
    api.showNotice(
      elements.notice,
      "正在生成可直接预览的内容，完成后会自动打开。",
      "info",
    );
    if (materializationJob) {
      trackArtifactMaterialization(
        candidateSetId,
        artifactId,
        materializationJob,
      );
      setDrawer(true);
    }
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      const data = unwrap(
        await api.request(
          `/teaching/artifacts/${encodeURIComponent(artifactId)}`,
        ),
      );
      const item = data.artifact;
      materializationJob = item.activeJob || materializationJob;
      if (item.activeJob) {
        trackArtifactMaterialization(
          candidateSetId,
          artifactId,
          item.activeJob,
        );
      }
      if (
        ["READY", "READY_TO_PUBLISH", "PUBLISHED"].includes(
          String(item.status || "").toUpperCase(),
        ) &&
        !item.activeJob
      ) {
        window.location.href = teacherArtifactHref(artifactId);
        return;
      }
      if (
        ["FAILED", "VALIDATION_FAILED", "CANCELED"].includes(
          String(item.status || "").toUpperCase(),
        )
      ) {
        throw new Error(
          (materializationJob && materializationJob.failureMessage) ||
            "可预览内容没有生成成功，请重新运行任务。",
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
    }
    throw new Error(
      "可预览内容仍未在预期时间内生成完成，请稍后从任务卡重新打开。",
    );
  }

  async function openCandidateSet(id) {
    try {
      const data = unwrap(
        await api.request(`/teaching/candidate-sets/${encodeURIComponent(id)}`),
      );
      state.candidateSet = data.candidateSet;
      const candidates = state.candidateSet.candidates || [];
      const single =
        state.candidateSet.request &&
        state.candidateSet.request.generationMode === "single";
      if (
        single &&
        ["READY", "SELECTED", "MATERIALIZED"].includes(
          state.candidateSet.status,
        ) &&
        candidates.length === 1
      ) {
        if (candidates[0].materializedArtifactId) {
          await openArtifactWhenReady(candidates[0].materializedArtifactId, id);
          return;
        }
        setBusy(true);
        const materialized = unwrap(
          await api.json(
            "POST",
            `/teaching/candidates/${candidates[0].id}/materialize`,
            {},
          ),
        );
        setBusy(false);
        await openArtifactWhenReady(
          materialized.artifact.id,
          id,
          materialized.job,
        );
        return;
      }
      renderCandidateModal();
      openDialog("candidate-modal");
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  }

  function renderCandidateModal() {
    const item = state.candidateSet;
    if (!item) return;
    const single = item.request && item.request.generationMode === "single";
    const generationReport =
      item.request && item.request.generationReport
        ? item.request.generationReport
        : null;
    elements.deriveBox.hidden = Boolean(single);
    elements.candidateNotice.className =
      item.status === "FAILED" ? "alert alert-danger" : "alert alert-info";
    const baseNotice =
      item.status === "GENERATING"
        ? `${single ? "草稿" : "候选"}仍在生成，可关闭后继续其他工作。`
        : single
          ? `状态：${item.status}。生成完成后可直接打开详情预览和修改。`
          : `状态：${item.status}。勾选多个方案可按提示词合并。`;
    const reportNotice =
      generationReport && item.status !== "GENERATING"
        ? ` 本次流水线：${Number(generationReport.repairedCount || 0)} 项定向修复，${Number(generationReport.fallbackCount || 0)} 项内容确定性兜底，${Number(generationReport.blueprintFallbackCount || 0)} 项蓝图确定性兜底；结果仍可继续编辑。`
        : "";
    elements.candidateNotice.textContent = `${baseNotice}${reportNotice}`;
    elements.candidateGrid.innerHTML =
      (item.candidates || [])
        .map(
          (candidate) => `
      <article class="candidate-option ${item.selectedCandidateId === candidate.id ? "is-selected" : ""}">
        <label class="candidate-check"><input type="checkbox" data-merge-candidate="${candidate.id}" ${single ? "hidden" : ""}> ${single ? "单一草稿" : `方案 ${candidate.ordinal}`}</label>
        <span class="candidate-strategy">${api.escapeHtml(candidate.strategy)}</span>
        <h3>${api.escapeHtml(candidate.title)}</h3>
        <p>${api.escapeHtml(candidate.summary)}</p>
        <ul>${(candidate.differences || []).map((value) => `<li>${api.escapeHtml(value)}</li>`).join("")}</ul>
        ${candidate.recommendation ? `<small>${api.escapeHtml(candidate.recommendation)}</small>` : ""}
        <div class="candidate-actions">
          ${single ? "" : `<button type="button" class="btn btn-outline-secondary" data-select-candidate="${candidate.id}">选择</button>`}
          <button type="button" class="btn btn-primary" data-materialize-candidate="${candidate.id}">生成并打开</button>
        </div>
      </article>`,
        )
        .join("") || '<p class="teaching-muted">候选尚未就绪。</p>';
    elements.candidateGrid
      .querySelectorAll("[data-select-candidate]")
      .forEach((button) =>
        button.addEventListener("click", async () => {
          try {
            const data = unwrap(
              await api.json(
                "POST",
                `/teaching/candidates/${button.dataset.selectCandidate}/select`,
                {},
              ),
            );
            state.candidateSet = data.candidateSet;
            renderCandidateModal();
          } catch (error) {
            showError(error);
          }
        }),
      );
    elements.candidateGrid
      .querySelectorAll("[data-materialize-candidate]")
      .forEach((button) =>
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const data = unwrap(
              await api.json(
                "POST",
                `/teaching/candidates/${button.dataset.materializeCandidate}/materialize`,
                {},
              ),
            );
            closeDialog("candidate-modal");
            await openArtifactWhenReady(
              data.artifact.id,
              state.candidateSet.id,
              data.job,
            );
          } catch (error) {
            button.disabled = false;
            showError(error);
          }
        }),
      );
  }

  async function deriveCandidates() {
    if (!state.candidateSet) return;
    const selected = Array.from(
      elements.candidateGrid.querySelectorAll("[data-merge-candidate]:checked"),
    ).map((input) => input.dataset.mergeCandidate);
    const instruction = elements.deriveInstruction.value.trim();
    if (!selected.length || !instruction) {
      elements.candidateNotice.className = "alert alert-warning";
      elements.candidateNotice.textContent =
        "请勾选至少一个候选并填写调整要求。";
      return;
    }
    try {
      const data = unwrap(
        await api.json(
          "POST",
          `/teaching/candidate-sets/${state.candidateSet.id}/derive`,
          {
            candidateIds: selected,
            instruction,
            candidateCount: Number(elements.count.value),
          },
        ),
      );
      state.trackedJobs.set(data.job.id, data.job);
      state.candidateSet = data.candidateSet;
      elements.deriveInstruction.value = "";
      renderCandidateModal();
      renderJobs();
      schedulePoll();
    } catch (error) {
      showError(error);
    }
  }

  function uploadFailureMessage(error, fallback) {
    if (error instanceof Error && error.message) return error.message;
    const value = String(error || "").trim();
    return value || fallback;
  }

  async function sendUploadedInstruction(flow) {
    if (!flow || !flow.materialId || !flow.instruction) return false;
    if (!state.thread || String(state.thread.id) !== String(flow.threadId)) {
      setUploadFlow({
        ...flow,
        phase: "send-error",
        error: "请回到上传文件时所在的对话，再重新发送这条命令。",
      });
      return false;
    }
    setUploadFlow({ ...flow, phase: "sending", error: "" });
    const result = await sendMessage(flow.instruction, null, {
      sourceRefs: [{ type: "material", id: String(flow.materialId) }],
    });
    if (result && result.executed) {
      clearUploadFlow(flow.id);
      return true;
    }
    const reason =
      result && result.reason === "active-job"
        ? "当前任务仍在执行。停止或等待任务完成后，可以只重新发送命令。"
        : uploadFailureMessage(
            result && result.error,
            "命令没有成功发出，可以直接重试，无需重新上传文件。",
          );
    setUploadFlow({ ...flow, phase: "send-error", error: reason });
    return false;
  }

  async function retryUploadFlow() {
    const flow = state.uploadFlow;
    if (!flow || uploadFlowBusy()) return false;
    if (flow.phase === "upload-error") return uploadMaterial(flow.file);
    if (flow.phase === "send-error") return sendUploadedInstruction(flow);
    return false;
  }

  async function uploadMaterial(file) {
    if (!file || !state.thread || uploadFlowBusy()) return false;
    const previous = state.uploadFlow;
    const retryingUpload = Boolean(
      previous && previous.phase === "upload-error" && previous.file === file,
    );
    const instruction = retryingUpload
      ? previous.instruction
      : elements.input.value.trim();
    const flowId = retryingUpload
      ? previous.id
      : `upload-${++state.uploadFlowSequence}`;
    const validationError = validateUploadFile(file);
    if (validationError) {
      setUploadFlow({
        id: flowId,
        file,
        instruction,
        threadId,
        phase: "upload-error",
        error: validationError,
      });
      elements.upload.value = "";
      return false;
    }
    if (!state.thread.id) {
      try {
        await persistThread();
      } catch (error) {
        showError(error);
        elements.upload.value = "";
        return false;
      }
    }
    const threadId = retryingUpload ? previous.threadId : state.thread.id;
    if (String(state.thread.id) !== String(threadId)) {
      setUploadFlow({
        id: flowId,
        file,
        instruction,
        threadId,
        phase: "upload-error",
        error: "请回到最初选择文件的对话后重试。",
      });
      elements.upload.value = "";
      return false;
    }
    const askIntent = !instruction;
    const form = new FormData();
    form.set("file", file);
    form.set("threadId", threadId);
    form.set("conversationUpload", "1");
    form.set("askIntent", askIntent ? "1" : "0");
    let uploadedMaterialId = null;
    let analysisJob = null;
    setUploadFlow({
      id: flowId,
      file,
      instruction,
      threadId,
      phase: "uploading",
      error: "",
    });
    setBusy(true);
    api.showNotice(elements.notice, "", "info");
    try {
      const data = unwrap(
        await api.multipart(
          "/teaching/materials",
          form,
          "文件上传失败，请稍后重试。",
        ),
      );
      analysisJob = data.job || null;
      uploadedMaterialId = data.materialId || null;
      if (!uploadedMaterialId)
        throw new Error(
          "文件已经送达服务器，但没有返回可用的附件标识。请重试。",
        );
      const sameThread = String(state.thread.id) === String(threadId);
      if (data.thread && sameThread) {
        state.thread = data.thread;
        elements.title.textContent = state.thread.title;
        populateDojos(state.thread.dojoId);
        syncAttachmentSources(state.thread);
      } else if (sameThread) {
        state.pendingMaterialIds.add(String(uploadedMaterialId));
      }
      if (analysisJob)
        state.trackedJobs.set(String(analysisJob.id), analysisJob);
      if (sameThread) {
        state.forceScrollToLatest = true;
        renderMessages();
      }
      renderJobs();
      loadThreads().catch(showError);
      schedulePoll();
    } catch (error) {
      setUploadFlow({
        id: flowId,
        file,
        instruction,
        threadId,
        phase: "upload-error",
        error: uploadFailureMessage(error, "文件上传失败，请稍后重试。"),
      });
      return false;
    } finally {
      setBusy(false);
      elements.upload.value = "";
    }
    const completedFlow = {
      id: flowId,
      file,
      instruction,
      threadId,
      materialId: String(uploadedMaterialId),
      analysisJob,
      phase: askIntent ? "ready" : "sending",
      error: "",
    };
    if (askIntent) {
      elements.input.value = "";
      resizeComposer();
      setUploadFlow(completedFlow);
      dismissSuccessfulUpload(flowId);
      return true;
    }
    return sendUploadedInstruction(completedFlow);
  }

  function resizeComposer() {
    elements.input.style.height = "auto";
    elements.input.style.height = `${Math.min(180, Math.max(28, elements.input.scrollHeight))}px`;
  }

  function setSidebar(open) {
    const enabled = Boolean(open) && !state.dashboardMode;
    root.classList.toggle("is-sidebar-open", enabled);
    elements.sidebarToggle.setAttribute("aria-expanded", String(enabled));
    elements.sidebarOverlay.hidden = !enabled;
    const mobile = window.innerWidth <= 820;
    elements.sidebar.inert = state.dashboardMode || (mobile && !enabled);
    elements.sidebar.setAttribute(
      "aria-hidden",
      String(state.dashboardMode || (mobile && !enabled)),
    );
    const conversationObscured =
      state.dashboardMode ||
      (mobile && enabled) ||
      elements.drawer.classList.contains("is-open");
    elements.conversation.inert = conversationObscured;
    elements.conversation.setAttribute(
      "aria-hidden",
      String(conversationObscured),
    );
    if (enabled) {
      state.overlayReturnFocus = document.activeElement;
      elements.threadSearch.focus({ preventScroll: true });
    } else if (
      mobile &&
      state.overlayReturnFocus instanceof HTMLElement &&
      document.contains(state.overlayReturnFocus)
    ) {
      state.overlayReturnFocus.focus({ preventScroll: true });
      state.overlayReturnFocus = null;
    }
  }

  function setSidebarCollapsed(collapsed) {
    root.classList.toggle("is-sidebar-collapsed", Boolean(collapsed));
    elements.sidebarCollapse.setAttribute(
      "aria-label",
      collapsed ? "展开对话列表" : "收起对话列表",
    );
    elements.sidebarCollapse.title = collapsed
      ? "展开对话列表"
      : "收起对话列表";
    elements.sidebarCollapse.innerHTML = `<i class="fas fa-angle-${collapsed ? "right" : "left"}"></i>`;
    try {
      window.localStorage.setItem(
        "aisecedu-agent-sidebar-collapsed",
        collapsed ? "1" : "0",
      );
    } catch (error) {
      /* storage can be disabled */
    }
  }

  function setDrawer(open, options = {}) {
    const enabled = Boolean(open);
    const globalNavigation = document.querySelector(".product-navbar");
    elements.drawer.classList.toggle("is-open", enabled);
    elements.drawer.setAttribute("aria-hidden", String(!enabled));
    elements.drawer.inert = !enabled;
    elements.drawerOpen.setAttribute("aria-expanded", String(enabled));
    elements.drawerOverlay.hidden = !enabled;
    elements.conversation.inert = enabled || state.dashboardMode;
    elements.conversation.setAttribute(
      "aria-hidden",
      String(enabled || state.dashboardMode),
    );
    const mobile = window.innerWidth <= 820;
    const sidebarVisible = root.classList.contains("is-sidebar-open") || !mobile;
    elements.sidebar.inert =
      enabled || state.dashboardMode || (mobile && !sidebarVisible);
    elements.sidebar.setAttribute(
      "aria-hidden",
      String(enabled || state.dashboardMode || (mobile && !sidebarVisible)),
    );
    if (globalNavigation) {
      globalNavigation.inert = enabled;
      if (enabled) globalNavigation.setAttribute("aria-hidden", "true");
      else globalNavigation.removeAttribute("aria-hidden");
    }
    if (enabled) {
      state.overlayReturnFocus = document.activeElement;
      elements.drawerClose.focus();
      loadActions().catch(showError);
      loadTaskCenter().catch(showError);
    } else if (
      options.restoreFocus !== false &&
      state.overlayReturnFocus instanceof HTMLElement &&
      document.contains(state.overlayReturnFocus)
    ) {
      state.overlayReturnFocus.focus({ preventScroll: true });
      state.overlayReturnFocus = null;
    }
  }

  function authoringManagementHref(job) {
    const result =
      job && job.result && typeof job.result === "object" ? job.result : {};
    const target = jobResultTarget(job || {});
    const dojoId = dojoReferenceForJob(job || {});
    let href =
      target.kind === "link" &&
      (String(target.href || "").includes("/questions") ||
        String(target.href || "").includes("/studio"))
        ? target.href
        : dojoId
          ? `/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions`
          : "";
    if (!href) return "";
    const url = new URL(href, window.location.origin);
    const legacyMatch = url.pathname.match(/^\/dojo\/([^/]+)\/studio\/?$/);
    const canonicalMatch = url.pathname.match(
      /^\/teacher\/courses\/([^/]+)\/questions\/?$/,
    );
    const referenceId = decodeURIComponent(
      legacyMatch?.[1] ||
        canonicalMatch?.[1] ||
        url.searchParams.get("dojo") ||
        dojoId ||
        "",
    );
    if (!referenceId) return "";
    const selectedId =
      result.draftId ||
      url.searchParams.get("selectedId") ||
      url.searchParams.get("draft");
    const canonical = new URL("/teacher/courses", window.location.origin);
    canonical.searchParams.set("dojo", referenceId);
    canonical.searchParams.set("tab", "questions");
    if (selectedId) canonical.searchParams.set("selectedId", String(selectedId));
    return `${canonical.pathname}${canonical.search}`;
  }

  function openJob(jobId) {
    const id = String(jobId);
    state.selectedJobId = id;
    state.expandedJobIds.add(id);
    renderJobs();
    setDrawer(true);
    window.requestAnimationFrame(() => {
      const target = Array.from(
        elements.jobList.querySelectorAll("[data-task-job]"),
      ).find((node) => String(node.dataset.taskJob) === id);
      if (target) target.scrollIntoView({ block: "nearest" });
    });
  }

  async function applyLaunchIntent() {
    const params = new URLSearchParams(window.location.search);
    const requestedDojo = params.get("dojoId") || params.get("dojo");
    const requestedModule =
      params.get("moduleIndex") !== null
        ? params.get("moduleIndex")
        : params.get("module");
    const artifactType = params.get("artifactType");
    const prompt = params.get("prompt");
    const candidateMode = params.get("candidateMode");
    let contextChanged = false;
    if (requestedDojo) {
      const target = (state.context.teacherDojos || []).find(
        (item) =>
          String(item.id) === requestedDojo ||
          item.referenceId === requestedDojo,
      );
      if (target && String(elements.dojo.value) !== String(target.id)) {
        elements.dojo.value = String(target.id);
        populateModules();
        contextChanged = true;
      }
    }
    if (
      requestedModule !== null &&
      Array.from(elements.module.options).some(
        (option) => option.value === requestedModule,
      )
    ) {
      elements.module.value = requestedModule;
      contextChanged = true;
    }
    if (
      artifactType &&
      Array.from(elements.type.options).some(
        (option) => option.value === artifactType,
      )
    ) {
      elements.type.value = artifactType;
    }
    if (["auto", "single", "multiple"].includes(candidateMode)) {
      elements.candidateMode.value = candidateMode;
      elements.countRow.hidden = candidateMode !== "multiple";
    }
    if (prompt) {
      elements.input.value = prompt.slice(0, 16000);
      elements.input.focus();
      resizeComposer();
      syncComposerState();
      api.showNotice(
        elements.notice,
        "已带入课程中心的任务描述。确认或补充要求后发送即可。",
        "info",
      );
    }
    if (contextChanged) await saveContext();
  }

  async function boot() {
    try {
      let collapsed = false;
      try {
        collapsed =
          window.localStorage.getItem("aisecedu-agent-sidebar-collapsed") ===
          "1";
      } catch (error) {
        /* storage can be disabled */
      }
      setSidebarCollapsed(collapsed);
      const data = unwrap(await api.request("/teaching/context?view=teacher-shell", {cacheTtlMs: 15000}));
      state.context = data;
      if (!data.user.isTeacher) throw new Error("当前账号没有教师权限");
      const params = new URLSearchParams(window.location.search);
      const requestedThread = String(params.get("thread") || "").trim();
      const requestedConversation = params.get("view") === "conversation";
      const requestedTasks = params.get("tasks") === "1";
      const hasLaunchIntent = Boolean(
        params.get("prompt") ||
          params.get("dojo") ||
          params.get("dojoId") ||
          params.get("module") ||
          params.get("moduleIndex") ||
          params.get("artifactType"),
      );
      populateDojos(null);
      populateTaskCourseFilter();
      const threadsPromise = loadThreads();
      if (!requestedThread && !hasLaunchIntent && !requestedConversation && !requestedTasks) {
        state.thread = null;
        populateDashboardCourses(null, null);
        setDashboardMode(true);
        setBusy(false);
        await Promise.all([threadsPromise, loadDashboard()]);
        root.dataset.ready = "true";
        root.setAttribute("aria-busy", "false");
        return;
      }
      await threadsPromise;
      if (requestedThread) {
        await loadThread(requestedThread);
        await loadActions();
        await applyLaunchIntent();
      } else if (hasLaunchIntent) {
        await createThread();
        await applyLaunchIntent();
      } else if (requestedConversation || requestedTasks) {
        if (state.threads.length) await activateThread(state.threads[0].id);
        else await createThread();
        if (requestedTasks) setDrawer(true);
      }
      setBusy(false);
      resizeComposer();
      root.dataset.ready = "true";
      root.setAttribute("aria-busy", "false");
    } catch (error) {
      showError(error);
      setBusy(false);
      root.dataset.ready = "error";
      root.setAttribute("aria-busy", "false");
    }
  }

  elements.send.addEventListener("click", () => {
    const active = primaryActiveJob();
    if (active) cancelTrackedJob(active.id).catch(showError);
    else sendMessage();
  });
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  elements.input.addEventListener("input", () => {
    resizeComposer();
    syncComposerState();
  });
  elements.dashboardSend?.addEventListener("click", () =>
    startDashboardTask().catch(showError),
  );
  root.addEventListener("teaching:compose", (event) => {
    const content = String(event.detail?.content || "").slice(0, 16000);
    if (!content || !elements.dashboardInput) return;
    setDashboardMode(true);
    elements.dashboardInput.value = content;
    elements.dashboardSend.disabled = state.dashboardLoading;
    elements.dashboardInput.focus();
    elements.dashboardInput.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    api.showNotice(elements.dashboardNotice, "案例要求已带入教学助手，可修改后开始任务。正式生成时沿用课程、方案选择和发布流程。", "info");
  });
  elements.dashboardInput?.addEventListener("input", () => {
    elements.dashboardSend.disabled =
      state.dashboardLoading || !elements.dashboardInput.value.trim();
  });
  elements.dashboardInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      startDashboardTask().catch(showError);
    }
  });
  elements.dashboardCourse?.addEventListener("change", () =>
    populateDashboardModules(null),
  );
  elements.dashboardConversations?.addEventListener("click", () =>
    openConversationRecords().catch(showError),
  );
  elements.dashboardQuickButtons.forEach((button) =>
    button.addEventListener("click", () => {
      elements.dashboardInput.value = button.dataset.dashboardPrompt || "";
      elements.dashboardSend.disabled = !elements.dashboardInput.value.trim();
      elements.dashboardInput.focus();
      elements.dashboardInput.setSelectionRange(
        elements.dashboardInput.value.length,
        elements.dashboardInput.value.length,
      );
    }),
  );
  elements.dashboardMoreActions?.addEventListener("click", () => {
    state.dashboardQuickExpanded = !state.dashboardQuickExpanded;
    const container = elements.dashboardMoreActions.closest(
      ".teaching-dashboard-quick-actions",
    );
    container?.classList.toggle("is-expanded", state.dashboardQuickExpanded);
    elements.dashboardMoreActions.setAttribute(
      "aria-expanded",
      String(state.dashboardQuickExpanded),
    );
    elements.dashboardMoreActions.querySelector("span").textContent =
      state.dashboardQuickExpanded ? "收起" : "更多";
    const icon = elements.dashboardMoreActions.querySelector("i");
    if (icon) icon.className = state.dashboardQuickExpanded ? "fas fa-chevron-up" : "fas fa-ellipsis-h";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      scheduleDashboardRefresh();
      schedulePoll();
      return;
    }
    if (state.dashboardMode) void loadDashboard();
    schedulePoll();
  });
  [elements.taskCourseFilter, elements.taskTypeFilter, elements.taskStatusFilter].forEach((control) => {
    control?.addEventListener("change", () => {
      state.taskFilters = {
        course: elements.taskCourseFilter?.value || "",
        type: elements.taskTypeFilter?.value || "",
        status: elements.taskStatusFilter?.value || "",
      };
      state.lastJobListSignature = "";
      renderJobs();
    });
  });
  elements.taskFilterReset?.addEventListener("click", () => {
    [elements.taskCourseFilter, elements.taskTypeFilter, elements.taskStatusFilter].forEach((control) => { if (control) control.value = ""; });
    state.taskFilters = { course: "", type: "", status: "" };
    state.lastJobListSignature = "";
    renderJobs();
  });
  elements.jumpLatest.addEventListener("click", () =>
    scrollToLatest({ smooth: true }),
  );
  elements.messages.addEventListener(
    "scroll",
    () => {
      if (isNearTranscriptBottom()) {
        state.newContentAvailable = false;
        elements.jumpLatest.hidden = true;
      }
    },
    { passive: true },
  );
  elements.dojo.addEventListener("change", () => {
    populateModules();
    saveContext().catch(showError);
  });
  elements.module.addEventListener("change", () =>
    saveContext().catch(showError),
  );
  elements.candidateMode.addEventListener("change", () => {
    elements.countRow.hidden = elements.candidateMode.value !== "multiple";
  });
  elements.quickButtons.forEach((button) =>
    button.addEventListener("click", () => openQuickScope(button)),
  );
  elements.quickScopeCourse.addEventListener("change", () => {
    const wholeCourse = elements.quickScopeForm.querySelector(
      '[name="teaching-quick-scope-mode"][value="course"]',
    );
    if (wholeCourse) wholeCourse.checked = true;
    populateQuickScopeModules();
  });
  elements.quickScopeForm
    .querySelectorAll('[name="teaching-quick-scope-mode"]')
    .forEach((input) => input.addEventListener("change", syncQuickScopeFields));
  elements.quickScopeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyQuickScope().catch(showError);
  });
  elements.quickScopeClose.addEventListener("click", () =>
    closeQuickScope(true),
  );
  elements.quickScopeCancel.addEventListener("click", () =>
    closeQuickScope(true),
  );
  elements.quickScopeDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeQuickScope(true);
  });
  elements.quickScopeDialog.addEventListener("click", (event) => {
    if (event.target === elements.quickScopeDialog) closeQuickScope(true);
  });
  elements.generationConfirmForm?.addEventListener(
    "submit",
    confirmSelectedGeneration,
  );
  elements.generationConfirmItems?.addEventListener(
    "change",
    syncGenerationDifficultySummary,
  );
  elements.generationConfirmClose?.addEventListener(
    "click",
    closeGenerationConfirmation,
  );
  elements.generationConfirmCancel?.addEventListener(
    "click",
    closeGenerationConfirmation,
  );
  elements.generationConfirmDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeGenerationConfirmation();
  });
  elements.generationConfirmDialog?.addEventListener("click", (event) => {
    if (event.target === elements.generationConfirmDialog) {
      closeGenerationConfirmation();
    }
  });
  document
    .getElementById("teaching-new-thread")
    .addEventListener("click", () => createThread().catch(showError));
  elements.threadSearch.addEventListener("input", () => {
    window.clearTimeout(state.threadSearchTimer);
    state.threadSearchTimer = window.setTimeout(() => {
      state.threadQuery = elements.threadSearch.value.trim();
      loadThreads().catch(showError);
    }, 220);
  });
  elements.threadActionMenu
    .querySelectorAll("[data-thread-action]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        handleThreadAction(button.dataset.threadAction).catch(showError),
      );
    });
  elements.restoreThread.addEventListener("click", () => {
    if (state.thread) restoreArchivedThread(state.thread).catch(showError);
  });
  elements.sidebarToggle.addEventListener("click", () => {
    if (
      root.classList.contains("is-sidebar-collapsed") &&
      window.innerWidth > 820
    )
      setSidebarCollapsed(false);
    else setSidebar(!root.classList.contains("is-sidebar-open"));
  });
  elements.sidebarCollapse.addEventListener("click", () => {
    if (window.innerWidth <= 820) setSidebar(false);
    else setSidebarCollapsed(!root.classList.contains("is-sidebar-collapsed"));
  });
  elements.sidebarOverlay.addEventListener("click", () => setSidebar(false));
  document
    .getElementById("teaching-refresh")
    .addEventListener("click", () =>
      Promise.all([
        loadTaskCenter(),
        pollJobs(),
        loadArtifacts(),
        loadMaterials(),
        loadActions(),
        loadProgress(),
        loadSessions(),
      ]).catch(showError),
    );
  elements.sessionStart.addEventListener("click", () =>
    startSession().catch(showError),
  );
  elements.sessionEnd.addEventListener("click", () =>
    endSession().catch(showError),
  );
  elements.sessionOpen.addEventListener("click", () =>
    openSession().catch(showError),
  );
  document
    .getElementById("candidate-derive")
    .addEventListener("click", deriveCandidates);
  document
    .getElementById("material-apply-chapters")
    .addEventListener("click", () => applyMaterialChapters().catch(showError));
  document
    .getElementById("material-reanalyze")
    .addEventListener("click", () => reanalyzeMaterial().catch(showError));
  elements.uploadTrigger.addEventListener("click", () => {
    if (!elements.uploadTrigger.disabled) elements.upload.click();
  });
  elements.upload.addEventListener("change", () =>
    uploadMaterial(elements.upload.files[0]).catch(showError),
  );
  elements.drawerOpen.addEventListener("click", () => {
    const latest =
      primaryActiveJob() ||
      taskCenterRows().sort((left, right) =>
        String(right.created || right.updated || "").localeCompare(
          String(left.created || left.updated || ""),
        ),
      )[0];
    if (latest) state.selectedJobId = String(latest.id);
    renderJobs();
    setDrawer(true);
  });
  elements.drawerClose.addEventListener("click", () => setDrawer(false));
  elements.drawerOverlay.addEventListener("click", () => setDrawer(false));
  function trapOverlayFocus(container, event) {
    if (event.key !== "Tab" || !container || container.inert) return false;
    const focusable = Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => !node.hidden && node.offsetParent !== null);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }
  document.addEventListener("keydown", (event) => {
    if (elements.drawer.classList.contains("is-open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawer(false);
        return;
      }
      if (trapOverlayFocus(elements.drawer, event)) return;
    }
    if (
      root.classList.contains("is-sidebar-open") &&
      window.innerWidth <= 820 &&
      trapOverlayFocus(elements.sidebar, event)
    )
      return;
    if (event.key === "Escape" && elements.quickScopeDialog.open) {
      event.preventDefault();
      closeQuickScope(true);
      return;
    }
    const commandKey = event.metaKey || event.ctrlKey;
    if (commandKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setSidebar(true);
      elements.threadSearch.focus();
      elements.threadSearch.select();
      return;
    }
    if (event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createThread().catch(showError);
      return;
    }
    if (event.key === "Escape") {
      if (!elements.threadActionMenu.hidden) closeThreadActionMenu();
      else if (elements.drawer.classList.contains("is-open")) setDrawer(false);
      else if (root.classList.contains("is-sidebar-open")) setSidebar(false);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (elements.threadActionMenu.hidden) return;
    if (
      elements.threadActionMenu.contains(event.target) ||
      event.target.closest('[aria-controls="teaching-thread-action-menu"]')
    )
      return;
    closeThreadActionMenu();
  });
  window.addEventListener("resize", () => {
    closeThreadActionMenu();
    if (!state.dashboardMode) setSidebar(false);
  });
  window.addEventListener("pagehide", () => {
    window.clearTimeout(state.pollTimer);
    window.clearTimeout(state.dashboardRefreshTimer);
    if (state.progressClockTimer !== null)
      window.clearInterval(state.progressClockTimer);
  });
  boot();
})();

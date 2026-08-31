(function () {
  "use strict";

  const api = window.DojoLearning;
  const root = document.getElementById("teacher-course-center");
  if (!api || !root) return;

  const query = new URLSearchParams(window.location.search);
  const state = {
    context: null,
    course: null,
    workspace: null,
    courseCode: "",
    courseCodeState: "idle",
    courseCodeDialogReturnFocus: null,
    courseCodeFeedbackTimer: null,
    filterDrawerKind: null,
    filterDrawerReturnFocus: null,
    filterDrawerOrigin: null,
    createKind: null,
    createDialogReturnFocus: null,
    materialPreviewRequest: 0,
    materialPreviewReturnFocus: null,
    view: "list",
    materials: [],
    artifacts: [],
    coursewareArtifacts: [],
    demoArtifacts: [],
    contentPaging: {
      materials: {page: 1, pageSize: 30, total: 0, totalPages: 1},
      courseware: {page: 1, pageSize: 30, total: 0, totalPages: 1},
      demos: {page: 1, pageSize: 30, total: 0, totalPages: 1},
    },
    contentLoadSequence: {materials: 0, courseware: 0, demos: 0},
    contentLoaded: {materials: false, courseware: false, demos: false},
    contentSelectionHandled: {materials: false, courseware: false, demos: false},
    contentSearchTimers: {materials: null, courseware: null, demos: null},
    courseListFilters: {q: "", filter: "all", sort: "recent"},
    coursePaging: {page: 1, pageSize: 30, total: 0, totalPages: 1, hasNext: false},
    courseCollectionCounts: {total: 0, recent: 0, attention: 0, drafts: 0, published: 0},
    courseLoadSequence: 0,
    workspaceLoadSequence: 0,
    workspaceController: null,
    courseSearchTimer: null,
    progress: null,
    learningBaseProgress: null,
    learningLoadSequence: 0,
    learningScopeInitialized: false,
    scrollStateTimer: null,
    questionItems: [],
    questionCounts: {total: 0, draft: 0, published: 0, needsAttention: 0},
    questionReviewBatch: null,
    questionReviewLoaded: false,
    questionReviewLoadSequence: 0,
    questionLoaded: false,
    questionLoadSequence: 0,
    questionSearchTimer: null,
    questionSelectionHandled: false,
    questionManagement: false,
    questionOrderSaving: false,
    questionBulkBusy: false,
    questionBulkStatus: "",
    selectedQuestionDraftIds: new Set(),
    questionExpandedModules: new Set(),
    questionChapterStateInitialized: false,
    questionDrag: null,
    questionPaging: {page: 1, pageSize: 30, total: 0, totalPages: 1},
    coursewareManagement: false,
    coursewareManagementPreparing: false,
    coursewareBulkBusy: false,
    coursewareBulkStatus: "",
    coursewarePreviousStatus: "",
    selectedCoursewareIds: new Set(),
    demoManagement: false,
    demoManagementPreparing: false,
    demoOrderSaving: false,
    demoDrag: null,
    demoExpandedModules: new Set(),
    demoChapterStateInitialized: false,
    studentCohortIds: null,
    selectedStudentId: null,
    selectedQuestionDraftId: null,
    questionDrawerReturnFocus: null,
    studentDrawerReturnFocus: null,
    tabLoads: {},
  };

  const elements = {
    courseListView: document.getElementById("cs-course-list-view"),
    courseDetailView: document.getElementById("cs-course-detail-view"),
    courseGrid: document.getElementById("cs-course-grid"),
    courseListLoading: document.getElementById("cs-course-list-loading"),
    courseListCount: document.getElementById("cs-course-list-count"),
    courseListResult: document.getElementById("cs-course-list-result"),
    courseSearch: document.getElementById("cs-course-search"),
    courseFilter: document.getElementById("cs-course-filter"),
    courseSort: document.getElementById("cs-course-sort"),
    loading: document.getElementById("cs-loading"),
    courseMain: document.querySelector(".course-hub-main"),
    notice: document.getElementById("cs-notice"),
    filterBackdrop: document.getElementById("cs-filter-backdrop"),
    title: document.getElementById("cs-course-title"),
    openCourse: document.getElementById("cs-open-course"),
    courseCodeTrigger: document.getElementById("cs-course-code-trigger"),
    courseCodeDialog: document.getElementById("cs-course-code-dialog"),
    courseCodeDialogCard: document.querySelector("#cs-course-code-dialog [role='dialog']"),
    courseCodeCourseName: document.getElementById("cs-course-code-course-name"),
    courseCode: document.getElementById("cs-course-code"),
    courseCodeStatus: document.getElementById("cs-course-code-status"),
    copyCourseCode: document.getElementById("cs-copy-course-code"),
    copyCourseCodeLabel: document.getElementById("cs-copy-course-code-label"),
    regenerateCourseCode: document.getElementById("cs-regenerate-course-code"),
    createDialog: document.getElementById("cs-create-dialog"),
    createDialogCard: document.querySelector("#cs-create-dialog [role='dialog']"),
    createKicker: document.getElementById("cs-create-kicker"),
    createTitle: document.getElementById("cs-create-title"),
    createDescription: document.getElementById("cs-create-description"),
    createOptions: document.getElementById("cs-create-options"),
    coursewareUpload: document.getElementById("cs-courseware-upload"),
    coursewareManagementToggle: document.getElementById("cs-courseware-manage-toggle"),
    coursewareManagementBar: document.getElementById("cs-courseware-management-bar"),
    coursewareManagementStatus: document.getElementById("cs-courseware-management-status"),
    coursewareSelectionStatus: document.getElementById("cs-courseware-selection-status"),
    coursewareSelectAll: document.getElementById("cs-courseware-select-all"),
    coursewareBatchDelete: document.getElementById("cs-courseware-batch-delete"),
    artifactList: document.getElementById("cs-artifact-list"),
    materialSearch: document.getElementById("cs-material-search"),
    materialStatus: document.getElementById("cs-material-status"),
    materialSort: document.getElementById("cs-material-sort"),
    materialPagination: document.getElementById("cs-material-pagination"),
    materialPreviewDialog: document.getElementById("cs-material-preview-dialog"),
    materialPreviewCard: document.querySelector("#cs-material-preview-dialog [role='dialog']"),
    materialPreviewTitle: document.getElementById("cs-material-preview-title"),
    materialPreviewMeta: document.getElementById("cs-material-preview-meta"),
    materialPreviewBody: document.getElementById("cs-material-preview-body"),
    materialPreviewStatus: document.getElementById("cs-material-preview-status"),
    materialPreviewDownload: document.getElementById("cs-material-preview-download"),
    artifactSearch: document.getElementById("cs-artifact-search"),
    artifactModule: document.getElementById("cs-artifact-module"),
    artifactType: document.getElementById("cs-artifact-type"),
    artifactSource: document.getElementById("cs-artifact-source"),
    artifactStatus: document.getElementById("cs-artifact-status"),
    artifactSort: document.getElementById("cs-artifact-sort"),
    artifactPagination: document.getElementById("cs-artifact-pagination"),
    demoSearch: document.getElementById("cs-demo-search"),
    demoModule: document.getElementById("cs-demo-module"),
    demoType: document.getElementById("cs-demo-type"),
    demoStatus: document.getElementById("cs-demo-status"),
    demoSort: document.getElementById("cs-demo-sort"),
    demoPagination: document.getElementById("cs-demo-pagination"),
    challengeList: document.getElementById("cs-challenge-list"),
    questionManagementToggle: document.getElementById("cs-question-manage-toggle"),
    questionManagementBar: document.getElementById("cs-question-management-bar"),
    questionManagementStatus: document.getElementById("cs-question-management-status"),
    questionSelectionStatus: document.getElementById("cs-question-selection-status"),
    questionSelectAll: document.getElementById("cs-question-select-all"),
    questionBatchRevise: document.getElementById("cs-question-batch-revise"),
    questionBatchPublish: document.getElementById("cs-question-batch-publish"),
    questionSearch: document.getElementById("cs-question-search"),
    questionStatus: document.getElementById("cs-question-status"),
    questionModule: document.getElementById("cs-question-module"),
    questionRequired: document.getElementById("cs-question-required"),
    questionMode: document.getElementById("cs-question-mode"),
    questionSort: document.getElementById("cs-question-sort"),
    questionPagination: document.getElementById("cs-question-pagination"),
    questionResultCount: document.getElementById("cs-question-result-count"),
    questionCountSummary: document.getElementById("cs-question-count-summary"),
    questionBatchReview: document.getElementById("cs-question-batch-review"),
    questionBatchTitle: document.getElementById("cs-question-batch-title"),
    questionBatchScope: document.getElementById("cs-question-batch-scope"),
    questionBatchThread: document.getElementById("cs-question-batch-thread"),
    questionBatchCounts: document.getElementById("cs-question-batch-counts"),
    questionBatchItems: document.getElementById("cs-question-batch-items"),
    questionBatchActions: document.getElementById("cs-question-batch-actions"),
    questionDrawer: document.getElementById("cs-question-detail-drawer"),
    questionDrawerPanel: document.querySelector("#cs-question-detail-drawer > aside"),
    questionDrawerTitle: document.getElementById("cs-question-drawer-title"),
    questionDrawerSubtitle: document.getElementById("cs-question-drawer-subtitle"),
    questionDrawerBody: document.getElementById("cs-question-drawer-body"),
    simulationList: document.getElementById("cs-simulation-list"),
    demoManagementToggle: document.getElementById("cs-demo-manage-toggle"),
    demoManagementBar: document.getElementById("cs-demo-management-bar"),
    demoManagementStatus: document.getElementById("cs-demo-management-status"),
    interventionEffectSummary: document.getElementById("cs-intervention-effect-summary"),
    learningStudent: document.getElementById("cs-learning-student"),
    learningModule: document.getElementById("cs-learning-module"),
    learningQuestion: document.getElementById("cs-learning-question"),
    learningRange: document.getElementById("cs-learning-range"),
    learningScopeSummary: document.getElementById("cs-learning-scope-summary"),
    learningScope: document.querySelector(".cs-learning-scope"),
    studentDrawer: document.getElementById("cs-student-insight-drawer"),
    studentDrawerPanel: document.querySelector("#cs-student-insight-drawer > aside"),
    studentDrawerTitle: document.getElementById("cs-student-drawer-title"),
    studentDrawerSubtitle: document.getElementById("cs-student-drawer-subtitle"),
    studentDrawerBody: document.getElementById("cs-student-drawer-body"),
  };

  function unwrap(payload) {
    if (!payload || payload.success !== true) {
      throw new Error(api.errorMessage(payload, "请求失败，请稍后重试。"));
    }
    return payload.data || {};
  }

  function escape(value) { return api.escapeHtml(value); }

  function managementButtons(kind, id, name, extra) {
    const attributes = Object.entries(extra || {}).map(([key, value]) =>
      ` data-manage-${escape(key)}="${escape(value)}"`
    ).join("");
    return `<span class="cs-row-actions" role="group" aria-label="管理${escape(name)}">
      <button type="button" data-manage-action="rename" data-manage-kind="${escape(kind)}" data-manage-id="${escape(id)}" data-manage-name="${escape(name)}"${attributes} aria-label="重命名${escape(name)}" title="重命名"><i class="fas fa-pen" aria-hidden="true"></i></button>
      <button type="button" class="is-danger" data-manage-action="delete" data-manage-kind="${escape(kind)}" data-manage-id="${escape(id)}" data-manage-name="${escape(name)}"${attributes} aria-label="删除${escape(name)}" title="删除"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>
    </span>`;
  }

  function managementMenu(kind, id, name, extra) {
    const attributes = Object.entries(extra || {}).map(([key, value]) =>
      ` data-manage-${escape(key)}="${escape(value)}"`
    ).join("");
    const materialAnalysis = kind === "material"
      ? `<button type="button" data-material-analyze="${escape(id)}"><i class="fas fa-magic" aria-hidden="true"></i><span>用 AI 分析</span></button>`
      : "";
    return `<details class="cs-row-more">
      <summary aria-label="更多${escape(name)}操作" title="更多操作"><i class="fas fa-ellipsis-h" aria-hidden="true"></i></summary>
      <div class="cs-row-more-menu" role="menu">
        ${materialAnalysis}
        <button type="button" data-manage-action="rename" data-manage-kind="${escape(kind)}" data-manage-id="${escape(id)}" data-manage-name="${escape(name)}"${attributes}><i class="fas fa-pen" aria-hidden="true"></i><span>重命名</span></button>
        <button type="button" class="is-danger" data-manage-action="delete" data-manage-kind="${escape(kind)}" data-manage-id="${escape(id)}" data-manage-name="${escape(name)}"${attributes}><i class="fas fa-trash-alt" aria-hidden="true"></i><span>${kind === "material" ? "归档资料" : "删除"}</span></button>
      </div>
    </details>`;
  }

  function setCourseView(view) {
    if (view !== "detail" && state.filterDrawerKind) closeFilterDrawer({restoreFocus: false});
    if (view !== "detail") closeMaterialPreview({restoreFocus: false});
    state.view = view === "detail" ? "detail" : "list";
    elements.courseListView.hidden = state.view !== "list";
    elements.courseDetailView.hidden = state.view !== "detail";
    document.body.classList.toggle("is-course-list-view", state.view === "list");
  }

  function setWorkspaceLoading(busy, message) {
    if (elements.courseDetailView) {
      elements.courseDetailView.setAttribute("aria-busy", busy ? "true" : "false");
    }
    if (elements.courseMain) elements.courseMain.hidden = Boolean(busy);
    if (!elements.loading) return;
    elements.loading.hidden = !busy;
    if (busy) {
      elements.loading.innerHTML = `<span></span><p>${escape(message || "正在汇总课程题目、演示与学习证据…")}</p>`;
    }
  }

  function syncQueryFromLocation() {
    Array.from(query.keys()).forEach(key => query.delete(key));
    new URLSearchParams(window.location.search).forEach((value, key) => query.append(key, value));
  }

  function renderCourseList() {
    const allCourses = (state.context && state.context.teacherDojos) || [];
    const q = String(elements.courseSearch?.value || state.courseListFilters.q || "").trim();
    const filter = elements.courseFilter?.value || state.courseListFilters.filter || "all";
    const sort = elements.courseSort?.value || state.courseListFilters.sort || "recent";
    state.courseListFilters = {q, filter, sort};
    const aggregates = course => {
      const counts = course.counts || {};
      const values = Object.values(counts);
      const attention = values.reduce((sum, item) => sum + Number(item?.needsAttention || 0), 0);
      const drafts = values.reduce((sum, item) => sum + Number(item?.draft || 0), 0);
      const published = values.reduce((sum, item) => sum + Number(item?.published || 0), 0);
      const total = values.reduce((sum, item) => sum + Number(item?.total || 0), 0);
      const directRecentAt = Date.parse(course.lastActivityAt || "");
      const recentTimes = (course.recentActivity || []).map(item => Date.parse(item.updated || "")).filter(Number.isFinite);
      const recentAt = Number.isFinite(directRecentAt) ? directRecentAt : recentTimes.length ? Math.max(...recentTimes) : 0;
      return {attention, drafts, published, total, recentAt};
    };
    const rows = allCourses.map(course => ({course, ...aggregates(course)}));
    const totalCourses = Number(state.courseCollectionCounts.total || state.coursePaging.total || allCourses.length);
    elements.courseListCount.textContent = totalCourses;
    if (elements.courseListResult) elements.courseListResult.textContent = `当前显示 ${rows.length} / ${Number(state.coursePaging.total || 0)} 门 · 统计截至 ${state.context?.asOf ? formatDate(state.context.asOf, true) : "刚刚"}`;
    elements.courseListLoading.hidden = true;
    elements.courseGrid.hidden = false;
    elements.courseGrid.innerHTML = rows.length ? `${rows.map(row => {
      const course = row.course;
      const name = course.name || "未命名课程";
      const description = course.description || "尚未填写课程简介。进入课程后可以分别准备课件、题目与演示。";
      const href = `/teacher/courses?dojo=${encodeURIComponent(course.referenceId || course.id)}`;
      const questionCounts = course.counts?.questions || {};
      return `<article class="teacher-course-card" data-course-card="${escape(course.referenceId || course.id)}">
        <a class="teacher-course-card-main" href="${href}" aria-label="打开课程“${escape(name)}”">
          <span class="teacher-course-card-icon"><i class="fas fa-book-open" aria-hidden="true"></i></span>
          <span class="teacher-course-card-copy"><small>${course.access === "public" ? "公开课程" : "教师课程"}${row.recentAt ? ` · ${escape(formatDate(new Date(row.recentAt).toISOString(), true))}更新` : " · 尚无内容更新"}</small><strong>${escape(name)}</strong><p>${escape(description)}</p></span>
          <dl class="teacher-course-card-stats" aria-label="课程概况">
            <div><dt>章节</dt><dd>${Number(course.moduleCount || 0)}</dd></div>
            <div><dt>题目发布</dt><dd>${Number(questionCounts.published || 0)}<span>/ ${Number(questionCounts.total || 0)}</span></dd></div>
            <div><dt>学生</dt><dd>${Number(course.studentCount || 0)}</dd></div>
          </dl>
        </a>
        <footer><span>${row.attention ? `<i class="fas fa-exclamation-circle" aria-hidden="true"></i>${row.attention} 项需要处理` : row.published ? `<i class="fas fa-check-circle" aria-hidden="true"></i>${row.published} 项已发布` : "尚未发布内容"}</span><details class="teacher-course-more"><summary aria-label="管理课程“${escape(name)}”"><i class="fas fa-ellipsis-h" aria-hidden="true"></i><span>更多</span></summary><div><button type="button" data-manage-action="rename" data-manage-kind="course" data-manage-id="${escape(course.referenceId || course.id)}" data-manage-name="${escape(name)}"><i class="fas fa-pen" aria-hidden="true"></i>重命名</button><button type="button" class="is-danger" data-manage-action="delete" data-manage-kind="course" data-manage-id="${escape(course.referenceId || course.id)}" data-manage-name="${escape(name)}"><i class="fas fa-trash-alt" aria-hidden="true"></i>删除课程</button></div></details></footer>
      </article>`;
    }).join("")}${state.coursePaging.hasNext ? `<div class="course-list-more"><button class="hub-button is-secondary" type="button" data-course-load-more><i class="fas fa-chevron-down" aria-hidden="true"></i><span>再显示 ${Math.min(state.coursePaging.pageSize, state.coursePaging.total - allCourses.length)} 门课程</span></button><small>已显示 ${allCourses.length} / ${state.coursePaging.total} 门</small></div>` : ""}` : totalCourses
      ? '<div class="course-list-empty"><span><i class="fas fa-search" aria-hidden="true"></i></span><h2>没有符合条件的课程</h2><p>清除搜索或切换状态筛选后再试。</p><button class="hub-button is-secondary" type="button" data-clear-course-filters>清除筛选</button></div>'
      : '<div class="course-list-empty"><span><i class="fas fa-book-medical" aria-hidden="true"></i></span><h2>还没有可管理的课程</h2><p>填写名称和简介即可创建，课程建立后再按需要添加章节和实践题。</p><a class="hub-button is-primary" href="/teacher/courses/new"><i class="fas fa-plus"></i>新建课程</a></div>';
  }

  async function loadCourseCollection({page = 1, append = false} = {}) {
    const sequence = ++state.courseLoadSequence;
    const requestedPage = Math.max(1, Number(page || 1));
    const params = new URLSearchParams({
      page: String(requestedPage),
      pageSize: String(state.coursePaging.pageSize),
      q: String(elements.courseSearch?.value || "").trim(),
      filter: elements.courseFilter?.value || "all",
      sort: elements.courseSort?.value || "recent",
    });
    state.courseListFilters = {q: params.get("q"), filter: params.get("filter"), sort: params.get("sort")};
    if (!append) {
      elements.courseGrid.hidden = true;
      elements.courseListLoading.hidden = false;
      elements.courseListLoading.innerHTML = "<span></span><p>正在读取教师课程…</p>";
    } else {
      const button = elements.courseGrid.querySelector("[data-course-load-more]");
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.querySelector("span").textContent = "正在加载…";
      }
    }
    try {
      const data = unwrap(await api.request(`/teaching/courses?${params.toString()}`));
      if (sequence !== state.courseLoadSequence) return;
      if (!state.context) state.context = {};
      const incoming = Array.isArray(data.items) ? data.items : [];
      if (append) {
        const merged = new Map((state.context.teacherDojos || []).map(course => [String(course.referenceId || course.id), course]));
        incoming.forEach(course => merged.set(String(course.referenceId || course.id), course));
        state.context.teacherDojos = Array.from(merged.values());
      } else {
        state.context.teacherDojos = incoming;
      }
      state.coursePaging = {...state.coursePaging, ...(data.pagination || {})};
      state.courseCollectionCounts = {...state.courseCollectionCounts, ...(data.counts || {})};
      state.context.asOf = data.asOf || state.context.asOf;
      renderCourseList();
    } catch (error) {
      if (sequence !== state.courseLoadSequence) return;
      if (append) {
        showNotice(error.message || "无法继续加载课程。", "danger");
        renderCourseList();
      } else {
        elements.courseListLoading.hidden = false;
        elements.courseListLoading.innerHTML = `<div class="cs-empty"><p>${escape(error.message || "无法读取课程列表。")}</p><button class="hub-button is-secondary" type="button" data-retry-course-load><i class="fas fa-redo" aria-hidden="true"></i>重新加载</button></div>`;
      }
    }
  }

  function scheduleCourseCollectionLoad() {
    window.clearTimeout(state.courseSearchTimer);
    state.courseSearchTimer = window.setTimeout(() => {
      void loadCourseCollection();
    }, 280);
  }

  function showNotice(message, kind) {
    return api.showNotice(elements.notice, message, kind || "info");
  }

  function setCourseCodeStatus(message, kind) {
    if (!elements.courseCodeStatus) return;
    elements.courseCodeStatus.textContent = message || "";
    elements.courseCodeStatus.className = kind ? `is-${kind}` : "";
  }

  function syncCourseCodeControls(busy) {
    if (elements.courseCodeTrigger) {
      elements.courseCodeTrigger.disabled = !state.course;
      elements.courseCodeTrigger.dataset.state = state.courseCodeState;
      elements.courseCodeTrigger.title = state.courseCodeState === "loading"
        ? "正在准备课程码"
        : "查看并复制课程码";
    }
    if (elements.copyCourseCode) {
      elements.copyCourseCode.disabled = Boolean(busy || !state.courseCode);
    }
    if (elements.regenerateCourseCode) {
      elements.regenerateCourseCode.disabled = Boolean(busy || !state.course);
    }
  }

  function resetCourseCodeCopyFeedback() {
    window.clearTimeout(state.courseCodeFeedbackTimer);
    state.courseCodeFeedbackTimer = null;
    elements.copyCourseCode?.classList.remove("is-success");
    if (elements.copyCourseCodeLabel) elements.copyCourseCodeLabel.textContent = "复制课程码";
    const icon = elements.copyCourseCode?.querySelector("i");
    if (icon) icon.className = "fas fa-copy";
  }

  async function loadCourseCode(regenerate) {
    if (!state.course || !elements.courseCode) return false;
    resetCourseCodeCopyFeedback();
    state.courseCode = "";
    state.courseCodeState = "loading";
    elements.courseCode.textContent = regenerate ? "正在更换…" : "正在准备…";
    setCourseCodeStatus(regenerate ? "旧课程码将在更换后立即失效。" : "正在建立安全的课程加入入口。", "info");
    syncCourseCodeControls(true);
    try {
      const payload = unwrap(await api.json(
        "POST",
        `/teaching/courses/${encodeURIComponent(state.course.referenceId)}/join-code`,
        {regenerate: Boolean(regenerate)},
      ));
      state.courseCode = payload.code || "";
      state.courseCodeState = state.courseCode ? "ready" : "error";
      elements.courseCode.textContent = state.courseCode || "暂不可用";
      setCourseCodeStatus(
        regenerate ? "课程码已更换，请将新课程码发送给学生。" : "课程码长期有效；更换后旧码立即失效。",
        regenerate ? "success" : "",
      );
      if (regenerate) window.AISecEduUI?.notify("课程码已更换。", "success");
      return Boolean(state.courseCode);
    } catch (error) {
      state.courseCodeState = "error";
      elements.courseCode.textContent = "暂不可用";
      setCourseCodeStatus(error.message || "课程码暂时无法读取。", "danger");
      return false;
    } finally {
      syncCourseCodeControls(false);
    }
  }

  async function writeCourseCodeToClipboard() {
    if (!state.courseCode) return;
    const icon = elements.copyCourseCode?.querySelector("i");
    resetCourseCodeCopyFeedback();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(state.courseCode);
      } else {
        const input = document.createElement("textarea");
        input.value = state.courseCode;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        try {
          input.select();
          if (!document.execCommand("copy")) throw new Error("浏览器未允许复制。");
        } finally {
          input.remove();
        }
      }
      setCourseCodeStatus("课程码已复制，可以直接发送给学生。", "success");
      elements.copyCourseCode?.classList.add("is-success");
      if (elements.copyCourseCodeLabel) elements.copyCourseCodeLabel.textContent = "已复制";
      if (icon) icon.className = "fas fa-check";
      state.courseCodeFeedbackTimer = window.setTimeout(() => {
        elements.copyCourseCode?.classList.remove("is-success");
        if (elements.copyCourseCodeLabel) elements.copyCourseCodeLabel.textContent = "复制课程码";
        if (icon) icon.className = "fas fa-copy";
      }, 1800);
      window.AISecEduUI?.notify("课程码已复制。", "success");
    } catch (error) {
      resetCourseCodeCopyFeedback();
      setCourseCodeStatus("复制失败，请手动选择课程码。", "danger");
      window.AISecEduUI?.notify(error.message || "课程码复制失败。", "danger");
    }
  }

  async function regenerateCourseCode() {
    const confirmed = await window.AISecEduUI.confirm(
      "更换后，学生将无法再使用旧课程码加入。已加入课程的学生不会受影响。",
      {title: "更换课程码", confirmLabel: "确认更换", confirmStyle: "warning"},
    );
    if (confirmed) await loadCourseCode(true);
  }

  function courseCodeDialogIsOpen() {
    return Boolean(elements.courseCodeDialog && !elements.courseCodeDialog.hidden);
  }

  function openCourseCodeDialog() {
    if (!state.course || !elements.courseCodeDialog) return;
    state.courseCodeDialogReturnFocus = elements.courseCodeTrigger;
    if (elements.courseCodeCourseName) {
      elements.courseCodeCourseName.textContent = state.course.name || "未命名课程";
    }
    elements.courseCodeDialog.hidden = false;
    elements.courseCodeDialog.setAttribute("aria-hidden", "false");
    elements.courseCodeTrigger?.setAttribute("aria-expanded", "true");
    document.body.classList.add("has-course-code-dialog");
    setCourseWorkspaceInert(true, elements.courseCodeDialog);
    window.requestAnimationFrame(() => elements.courseCodeDialogCard?.focus({preventScroll: true}));
    if (!state.courseCode && state.courseCodeState !== "loading") void loadCourseCode(false);
  }

  function closeCourseCodeDialog(options) {
    if (!elements.courseCodeDialog || elements.courseCodeDialog.hidden) return;
    elements.courseCodeDialog.hidden = true;
    elements.courseCodeDialog.setAttribute("aria-hidden", "true");
    elements.courseCodeTrigger?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("has-course-code-dialog");
    setCourseWorkspaceInert(false);
    const returnFocus = state.courseCodeDialogReturnFocus;
    state.courseCodeDialogReturnFocus = null;
    if ((!options || options.restoreFocus !== false) && returnFocus instanceof HTMLElement) {
      returnFocus.focus({preventScroll: true});
    }
  }

  function handleCourseCodeDialogKeydown(event) {
    if (!courseCodeDialogIsOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCourseCodeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(elements.courseCodeDialogCard.querySelectorAll(
      "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )).filter(node => !node.hidden && node.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      elements.courseCodeDialogCard?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusable.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const createDialogConfig = {
    courseware: {
      kicker: "课程内容",
      title: "新建课件",
      description: "选择唯一入口开始，资料、生成结果和后续修订会保留在当前课程。",
      options: [
        {id: "upload", icon: "fa-upload", title: "上传资料", description: "上传 PDF、PPT、Word、Markdown 或图片，自动提取结构与章节候选。"},
        {id: "ai", icon: "fa-magic", title: "AI 生成课件", description: "从授课目标和章节要求生成可预览、可追溯的课件与教案。"},
        {id: "reuse", icon: "fa-layer-group", title: "基于已有资料创建", description: "让 AI 结合本课程已有资料，整理成新的授课版本。"},
      ],
    },
    question: {
      kicker: "课程题目",
      title: "新建题目",
      description: "单题手工创建或批量交给智能体；批量任务仍会拆成可分别管理的独立题目。",
      options: [
        {id: "manual", icon: "fa-pen", title: "手工创建单题", description: "进入题目编辑工作区，逐项填写题面、运行环境与验证方式。"},
        {id: "ai", icon: "fa-magic", title: "AI 批量出题", description: "描述数量、主题和难度；每道题独立生成、验证、重试和管理。"},
        {id: "reuse", icon: "fa-copy", title: "复用或改编已有题目", description: "检索当前题库，选择复用、改编或迁移到本课程。"},
      ],
    },
    demo: {
      kicker: "课程演示",
      title: "新建演示",
      description: "先比较适用场景、准备成本和学员体验；选定后再确认目标、输入、输出、时长与互动方式。",
      options: [
        {
          id: "simulation",
          icon: "fa-project-diagram",
          title: "交互模拟演示",
          description: "适合协议流程、状态变化和决策分支；无需真实攻击环境，学员通过选择、观察与即时反馈理解机制。",
          facts: [
            "输入：教学目标、状态与决策分支",
            "输出：可回放的交互脚本与反馈",
            "准备成本：较低",
            "典型时长：8–20 分钟",
            "体验：引导式探索",
          ],
        },
        {
          id: "attack-defense",
          icon: "fa-shield-alt",
          title: "授权攻防演示",
          description: "适合需要拓扑、角色和真实工具链的安全实践；在隔离授权环境中操作，并用事件证据核验结果。",
          facts: [
            "输入：拓扑、角色、镜像与工具",
            "输出：隔离攻防环境与事件证据",
            "准备成本：较高",
            "典型时长：20–60 分钟",
            "体验：真实环境操作",
          ],
        },
      ],
    },
  };

  function createDialogIsOpen() {
    return Boolean(elements.createDialog && !elements.createDialog.hidden);
  }

  function openCreateDialog(kind, trigger) {
    const config = createDialogConfig[kind];
    if (!config || !elements.createDialog) return;
    state.createKind = kind;
    state.createDialogReturnFocus = trigger || document.activeElement;
    elements.createKicker.textContent = config.kicker;
    elements.createTitle.textContent = config.title;
    elements.createDescription.textContent = config.description;
    elements.createOptions.innerHTML = config.options.map(option => `
      <button type="button" data-create-option="${escape(option.id)}">
        <span><i class="fas ${escape(option.icon)}" aria-hidden="true"></i></span>
        <span><strong>${escape(option.title)}</strong><small>${escape(option.description)}</small>${option.facts ? `<ul>${option.facts.map(fact => `<li>${escape(fact)}</li>`).join("")}</ul>` : ""}</span>
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>`).join("");
    elements.createDialog.hidden = false;
    elements.createDialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-create-dialog");
    trigger?.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => elements.createDialogCard?.focus({preventScroll: true}));
  }

  function closeCreateDialog(options) {
    if (!elements.createDialog || elements.createDialog.hidden) return;
    elements.createDialog.hidden = true;
    elements.createDialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-create-dialog");
    const returnFocus = state.createDialogReturnFocus;
    returnFocus?.setAttribute?.("aria-expanded", "false");
    state.createDialogReturnFocus = null;
    state.createKind = null;
    if ((!options || options.restoreFocus !== false) && returnFocus instanceof HTMLElement) {
      returnFocus.focus({preventScroll: true});
    }
  }

  function handleCreateDialogKeydown(event) {
    if (!createDialogIsOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCreateDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(elements.createDialogCard.querySelectorAll(
      "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )).filter(node => !node.hidden && node.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      elements.createDialogCard.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusable.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function questionKey(moduleIndex, challengeIndex) {
    return `${Number(moduleIndex)}:${Number(challengeIndex)}`;
  }

  function chapterKey(moduleIndex) {
    return moduleIndex == null || moduleIndex === "" ? "unassigned" : String(Number(moduleIndex));
  }

  function chapterStateValue(expanded) {
    return expanded.size ? Array.from(expanded).sort().join(",") : "none";
  }

  function toggleWorkspaceChapter(kind, key) {
    const expanded = kind === "demos" ? state.demoExpandedModules : state.questionExpandedModules;
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    const next = new URL(window.location.href);
    setWorkspaceUrlParam(next, kind === "demos" ? "demoOpen" : "questionOpen", chapterStateValue(expanded), "");
    history.replaceState(null, "", next);
    if (kind === "demos") renderSimulations();
    else renderChallenges();
  }

  function initializeQuestionChapters(groups) {
    if (state.questionChapterStateInitialized || state.questionManagement) return;
    const selectedId = query.get("selectedId");
    const attentionStates = new Set(["failed", "validation_failed", "blocked", "needs_review", "partial_success"]);
    groups.forEach(group => {
      if (group.items.some(item => String(item.id) === selectedId || String(item.draftId) === selectedId || attentionStates.has(String(item.state || item.status || "").toLowerCase()))) {
        state.questionExpandedModules.add(chapterKey(group.module.index));
      }
    });
    if (!state.questionExpandedModules.size && groups.length) {
      state.questionExpandedModules.add(chapterKey(groups[0].module.index));
    }
    state.questionChapterStateInitialized = true;
  }

  function initializeDemoChapters(groups) {
    if (state.demoChapterStateInitialized || state.demoManagement) return;
    const selectedId = query.get("selectedId");
    const attentionStates = new Set(["FAILED", "BLOCKED", "NEEDS_REVIEW", "PARTIAL_SUCCESS"]);
    groups.forEach(group => {
      if (group.items.some(item => String(item.id) === selectedId || attentionStates.has(String(item.status || "").toUpperCase()))) {
        state.demoExpandedModules.add(chapterKey(group.moduleIndex));
      }
    });
    if (!state.demoExpandedModules.size && groups.length) {
      state.demoExpandedModules.add(chapterKey(groups[0].moduleIndex));
    }
    state.demoChapterStateInitialized = true;
  }

  function syncQuestionManagementUi() {
    root.classList.toggle("is-question-management", state.questionManagement);
    root.classList.toggle("is-question-order-saving", state.questionOrderSaving);
    if (elements.questionManagementBar) {
      elements.questionManagementBar.hidden = !state.questionManagement;
    }
    if (elements.questionManagementStatus) {
      elements.questionManagementStatus.textContent = state.questionBulkStatus || (state.questionOrderSaving
        ? "正在保存顺序…"
        : "拖动后自动保存");
    }
    if (elements.questionManagementToggle) {
      const label = elements.questionManagementToggle.querySelector("span");
      const icon = elements.questionManagementToggle.querySelector("i");
      elements.questionManagementToggle.classList.toggle("is-active", state.questionManagement);
      elements.questionManagementToggle.setAttribute("aria-pressed", state.questionManagement ? "true" : "false");
      elements.questionManagementToggle.disabled = state.questionOrderSaving || state.questionBulkBusy;
      if (label) label.textContent = state.questionManagement ? "完成管理" : "管理题目";
      if (icon) icon.className = state.questionManagement ? "fas fa-check" : "fas fa-sliders-h";
    }
    const toolbar = document.querySelector("[data-content-toolbar='questions']");
    if (toolbar) toolbar.hidden = state.questionManagement;
    if (elements.questionPagination) elements.questionPagination.hidden = state.questionManagement;
    syncQuestionBatchControls();
  }

  function questionDraftRows() {
    return state.questionItems.filter(item => item.kind === "draft" && (item.draftId || item.id));
  }

  function selectedQuestionDrafts() {
    const drafts = questionDraftRows();
    const visibleIds = new Set(drafts.map(item => String(item.draftId || item.id)));
    state.selectedQuestionDraftIds.forEach(id => {
      if (!visibleIds.has(String(id))) state.selectedQuestionDraftIds.delete(id);
    });
    return drafts.filter(item => state.selectedQuestionDraftIds.has(String(item.draftId || item.id)));
  }

  function syncQuestionBatchControls() {
    const drafts = questionDraftRows();
    const selected = selectedQuestionDrafts();
    const disabled = state.questionBulkBusy || state.questionOrderSaving;
    if (elements.questionSelectionStatus) {
      elements.questionSelectionStatus.textContent = `已选 ${selected.length} 道未发布题目`;
    }
    if (elements.questionSelectAll) {
      const allSelected = Boolean(drafts.length) && selected.length === drafts.length;
      elements.questionSelectAll.textContent = allSelected ? "取消全选" : "全选草稿";
      elements.questionSelectAll.disabled = disabled || !drafts.length;
      elements.questionSelectAll.setAttribute("aria-pressed", allSelected ? "true" : "false");
    }
    if (elements.questionBatchRevise) elements.questionBatchRevise.disabled = disabled || !selected.length;
    if (elements.questionBatchPublish) elements.questionBatchPublish.disabled = disabled || !selected.length;
    elements.challengeList?.querySelectorAll("[data-question-draft-select]").forEach(input => {
      input.checked = state.selectedQuestionDraftIds.has(String(input.dataset.questionDraftSelect || ""));
      input.disabled = disabled;
    });
  }

  async function setQuestionManagement(enabled) {
    if (state.questionOrderSaving || state.questionBulkBusy) return;
    if (state.filterDrawerKind === "questions") closeFilterDrawer({restoreFocus: false});
    state.questionManagement = Boolean(enabled);
    state.selectedQuestionDraftIds.clear();
    state.questionBulkStatus = "";
    if (state.questionManagement) {
      [elements.questionSearch, elements.questionStatus, elements.questionModule, elements.questionRequired, elements.questionMode].forEach(node => { if (node) node.value = ""; });
      if (elements.questionSort) elements.questionSort.value = "course_order";
    }
    state.questionPaging.page = 1;
    state.questionPaging.pageSize = state.questionManagement ? 100 : 30;
    state.questionDrag = null;
    renderChallenges();
    syncQuestionManagementUi();
    await loadQuestionContent({resetPage: true, pageSize: state.questionPaging.pageSize});
  }

  function coursewareRows() {
    const nonCoursewareTypes = new Set(["question-set", "assessment", "challenge", "knowledge-test", "quiz", "simulation", "attack-defense-scene", "classroom-scenario", "debate"]);
    return state.contentLoaded.courseware
      ? state.coursewareArtifacts
      : state.artifacts.filter(item => !nonCoursewareTypes.has(String(item.type || "").toLowerCase()));
  }

  function coursewareDeleteBlockReason(item) {
    const status = String(item?.status || "DRAFT").toUpperCase();
    if (item?.canEdit === false) return "仅课件创建者可以管理";
    if (item?.selfWorkspaceId) return "个人学习课件不属于课程内容库";
    if (item?.publishedChallengeId) return "已转为题目，请到题目管理中删除";
    if (status === "PUBLISHED") return "已发布课件不能作为未发布草稿删除";
    if (["GENERATING", "VALIDATING", "PUBLISHING"].includes(status)) return "任务进行中，结束后才能删除";
    return "";
  }

  function coursewareCanDelete(item) {
    return !coursewareDeleteBlockReason(item);
  }

  function selectedCoursewareArtifacts() {
    const rows = coursewareRows();
    const deletableIds = new Set(rows.filter(coursewareCanDelete).map(item => String(item.id)));
    state.selectedCoursewareIds.forEach(id => {
      if (!deletableIds.has(String(id))) state.selectedCoursewareIds.delete(id);
    });
    return rows.filter(item => state.selectedCoursewareIds.has(String(item.id)) && coursewareCanDelete(item));
  }

  function syncCoursewareManagementUi() {
    root.classList.toggle("is-courseware-management", state.coursewareManagement);
    if (elements.coursewareManagementBar) elements.coursewareManagementBar.hidden = !state.coursewareManagement;
    if (elements.coursewareManagementToggle) {
      const label = elements.coursewareManagementToggle.querySelector("span");
      const icon = elements.coursewareManagementToggle.querySelector("i");
      elements.coursewareManagementToggle.classList.toggle("is-active", state.coursewareManagement);
      elements.coursewareManagementToggle.setAttribute("aria-pressed", state.coursewareManagement ? "true" : "false");
      elements.coursewareManagementToggle.disabled = state.coursewareManagementPreparing || state.coursewareBulkBusy;
      if (label) label.textContent = state.coursewareManagementPreparing ? "正在准备" : state.coursewareManagement ? "完成管理" : "管理课件";
      if (icon) icon.className = state.coursewareManagementPreparing ? "fas fa-spinner fa-spin" : state.coursewareManagement ? "fas fa-check" : "fas fa-sliders-h";
    }
    const deletable = coursewareRows().filter(coursewareCanDelete);
    const selected = selectedCoursewareArtifacts();
    const disabled = state.coursewareManagementPreparing || state.coursewareBulkBusy;
    if (elements.coursewareSelectionStatus) elements.coursewareSelectionStatus.textContent = `已选 ${selected.length} 份未发布课件`;
    if (elements.coursewareSelectAll) {
      const allSelected = Boolean(deletable.length) && selected.length === deletable.length;
      elements.coursewareSelectAll.textContent = allSelected ? "取消全选" : "全选可删除";
      elements.coursewareSelectAll.disabled = disabled || !deletable.length;
      elements.coursewareSelectAll.setAttribute("aria-pressed", allSelected ? "true" : "false");
    }
    if (elements.coursewareBatchDelete) elements.coursewareBatchDelete.disabled = disabled || !selected.length;
    if (elements.coursewareManagementStatus) {
      elements.coursewareManagementStatus.textContent = state.coursewareBulkStatus || (state.coursewareBulkBusy ? "正在删除…" : `${deletable.length} 份可删除`);
    }
    elements.artifactList?.querySelectorAll("[data-courseware-select]").forEach(input => {
      input.checked = state.selectedCoursewareIds.has(String(input.dataset.coursewareSelect || ""));
      input.disabled = disabled || input.dataset.deletable !== "true";
    });
  }

  async function setCoursewareManagement(enabled) {
    if (state.coursewareManagementPreparing || state.coursewareBulkBusy) return;
    if (state.filterDrawerKind === "courseware") closeFilterDrawer({restoreFocus: false});
    const next = Boolean(enabled);
    state.coursewareManagementPreparing = true;
    state.selectedCoursewareIds.clear();
    state.coursewareBulkStatus = "";
    if (next) {
      state.coursewarePreviousStatus = elements.artifactStatus?.value || "";
      if (elements.artifactStatus) elements.artifactStatus.value = "UNPUBLISHED";
      state.contentPaging.courseware.pageSize = 100;
    } else {
      if (elements.artifactStatus) elements.artifactStatus.value = state.coursewarePreviousStatus || "";
      state.contentPaging.courseware.pageSize = 30;
    }
    state.coursewareManagement = next;
    state.contentPaging.courseware.page = 1;
    renderArtifacts();
    syncCoursewareManagementUi();
    try {
      await loadCourseContent("courseware", {resetPage: true});
    } finally {
      state.coursewareManagementPreparing = false;
      syncCoursewareManagementUi();
    }
  }

  async function runCoursewareBatchAction(action) {
    if (!state.coursewareManagement || state.coursewareBulkBusy) return;
    const deletable = coursewareRows().filter(coursewareCanDelete);
    const selected = selectedCoursewareArtifacts();
    if (action === "select-all") {
      if (deletable.length && selected.length === deletable.length) state.selectedCoursewareIds.clear();
      else deletable.forEach(item => state.selectedCoursewareIds.add(String(item.id)));
      state.coursewareBulkStatus = "";
      syncCoursewareManagementUi();
      return;
    }
    if (action !== "delete" || !selected.length) return;
    const names = selected.slice(0, 3).map(item => `“${item.title || artifactTypeLabel(item.type)}”`).join("、");
    const remaining = selected.length > 3 ? `等 ${selected.length} 份` : "";
    const confirmed = await window.AISecEduUI.confirm(
      `确认删除 ${names}${remaining}？这些未发布课件会从课程内容库中消失，发布内容不受影响。`,
      {title: `批量删除 ${selected.length} 份课件`, confirmLabel: "确认批量删除", confirmStyle: "danger"},
    );
    if (!confirmed) return;
    const artifactIds = selected.map(item => String(item.id));
    state.coursewareBulkBusy = true;
    state.coursewareBulkStatus = `正在删除 ${artifactIds.length} 份课件…`;
    syncCoursewareManagementUi();
    try {
      const result = unwrap(await api.json("POST", "/teaching/artifacts/bulk-delete", {
        dojoId: state.course.id,
        artifactIds,
      }));
      const deletedIds = new Set((result.artifactIds || artifactIds).map(String));
      state.coursewareArtifacts = state.coursewareArtifacts.filter(item => !deletedIds.has(String(item.id)));
      state.selectedCoursewareIds.clear();
      state.contentPaging.courseware.total = Math.max(0, Number(state.contentPaging.courseware.total || 0) - Number(result.deletedCount || deletedIds.size));
      syncArtifactState();
      renderArtifacts();
      state.coursewareBulkStatus = `已删除 ${Number(result.deletedCount || deletedIds.size)} 份课件`;
      window.AISecEduUI?.notify(state.coursewareBulkStatus, "success");
      await loadCourseContent("courseware");
      renderMetrics();
      renderActivity();
    } catch (error) {
      state.coursewareBulkStatus = "删除失败，列表未改变";
      showNotice(error.message || "批量删除课件失败。", "danger");
    } finally {
      state.coursewareBulkBusy = false;
      syncCoursewareManagementUi();
    }
  }

  function demoArtifacts() {
    const demoTypes = new Set(["simulation", "attack-defense-scene", "classroom-scenario"]);
    return state.demoArtifacts.length || state.contentPaging.demos.total
      ? state.demoArtifacts
      : state.artifacts.filter(item => demoTypes.has(String(item.type || "").toLowerCase()));
  }

  function sortedDemoArtifacts(rows) {
    return rows.map((item, index) => ({item, index})).sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.item.sortOrder))
        ? Number(left.item.sortOrder)
        : 2147483647;
      const rightOrder = Number.isFinite(Number(right.item.sortOrder))
        ? Number(right.item.sortOrder)
        : 2147483647;
      return leftOrder - rightOrder || left.index - right.index;
    }).map(entry => entry.item);
  }

  function demoGroupsFromState() {
    const modules = state.course?.modules || [];
    const groups = modules.map(module => ({
      module,
      moduleIndex: Number(module.index),
      items: [],
    }));
    const groupByIndex = new Map(groups.map(group => [group.moduleIndex, group]));
    const unassigned = [];
    demoArtifacts().forEach(artifact => {
      const moduleIndex = Number(artifact.moduleIndex);
      const group = Number.isFinite(moduleIndex) ? groupByIndex.get(moduleIndex) : null;
      if (group) group.items.push(artifact);
      else unassigned.push(artifact);
    });
    groups.forEach(group => { group.items = sortedDemoArtifacts(group.items); });
    if (unassigned.length) {
      groups.push({
        module: null,
        moduleIndex: null,
        items: sortedDemoArtifacts(unassigned),
      });
    }
    return state.demoManagement ? groups : groups.filter(group => group.items.length);
  }

  function syncDemoManagementUi() {
    root.classList.toggle("is-demo-management", state.demoManagement);
    root.classList.toggle("is-demo-order-saving", state.demoOrderSaving);
    if (elements.demoManagementBar) {
      elements.demoManagementBar.hidden = !state.demoManagement;
    }
    if (elements.demoManagementStatus) {
      elements.demoManagementStatus.textContent = state.demoOrderSaving
        ? "正在保存顺序…"
        : "拖动后自动保存";
    }
    if (elements.demoManagementToggle) {
      const label = elements.demoManagementToggle.querySelector("span");
      const icon = elements.demoManagementToggle.querySelector("i");
      elements.demoManagementToggle.classList.toggle("is-active", state.demoManagement);
      elements.demoManagementToggle.setAttribute("aria-pressed", state.demoManagement ? "true" : "false");
      elements.demoManagementToggle.disabled = state.demoOrderSaving || state.demoManagementPreparing;
      if (label) label.textContent = state.demoManagementPreparing ? "正在准备" : state.demoManagement ? "完成管理" : "管理演示";
      if (icon) icon.className = state.demoManagementPreparing ? "fas fa-spinner fa-spin" : state.demoManagement ? "fas fa-check" : "fas fa-sliders-h";
    }
    const toolbar = document.querySelector("[data-content-toolbar='demos']");
    if (toolbar) toolbar.hidden = state.demoManagement;
  }

  async function setDemoManagement(enabled) {
    if (state.demoOrderSaving || state.demoManagementPreparing) return;
    if (state.filterDrawerKind === "demos") closeFilterDrawer({restoreFocus: false});
    const next = Boolean(enabled);
    state.demoManagementPreparing = true;
    syncDemoManagementUi();
    try {
      if (next) {
        if (elements.demoSearch) elements.demoSearch.value = "";
        if (elements.demoType) elements.demoType.value = "";
        if (elements.demoStatus) elements.demoStatus.value = "";
        if (elements.demoSort) elements.demoSort.value = "course_order";
        state.contentPaging.demos.page = 1;
        state.contentPaging.demos.pageSize = 100;
        const loaded = await loadCourseContent("demos", {resetPage: true});
        if (!loaded) return;
        if (Number(state.contentPaging.demos.total || 0) > 100) {
          showNotice("演示超过 100 项，请先通过筛选缩小范围后再调整顺序。", "warning");
          state.contentPaging.demos.pageSize = 30;
          await loadCourseContent("demos", {resetPage: true});
          return;
        }
      }
      state.demoManagement = next;
      state.demoDrag = null;
      renderSimulations();
      if (!next) {
        state.contentPaging.demos.pageSize = 30;
        await loadCourseContent("demos", {resetPage: true});
      }
    } finally {
      state.demoManagementPreparing = false;
      syncDemoManagementUi();
    }
  }

  function demoLayoutFromState() {
    return demoGroupsFromState().map(group => ({
      moduleIndex: group.moduleIndex,
      items: group.items.map(item => ({id: String(item.id)})),
    }));
  }

  function demoLayoutFromDom() {
    return Array.from(elements.simulationList?.querySelectorAll(".cs-demo-group") || []).map(group => ({
      moduleIndex: group.dataset.demoModuleIndex === ""
        ? null
        : Number(group.dataset.demoModuleIndex),
      items: Array.from(group.querySelectorAll(".cs-demo-dropzone > [data-demo-id]")).map(row => ({
        id: String(row.dataset.demoId || ""),
      })),
    }));
  }

  function demoLayoutSignature(layout) {
    return JSON.stringify(layout || []);
  }

  function applyDemoLayout(positions) {
    const artifactById = new Map(state.artifacts.map(item => [String(item.id), item]));
    (positions || []).forEach(position => {
      const artifact = artifactById.get(String(position.artifactId || ""));
      if (!artifact) throw new Error("演示列表已变化，请刷新页面后再试。");
      artifact.moduleIndex = position.moduleIndex;
      artifact.sortOrder = Number(position.sortOrder);
    });
  }

  async function persistDemoLayout(layout, previousSignature) {
    if (state.demoOrderSaving) return;
    if (demoLayoutSignature(layout) === previousSignature) {
      renderSimulations();
      return;
    }
    state.demoOrderSaving = true;
    syncDemoManagementUi();
    try {
      const data = unwrap(await api.json(
        "PATCH",
        "/teaching/artifacts/order",
        {dojoId: state.course.id, modules: layout},
      ));
      applyDemoLayout(data.positions || []);
      renderSimulations();
      showNotice("演示顺序已保存。", "success");
    } catch (error) {
      renderSimulations();
      showNotice(error.message || "演示顺序保存失败，原顺序未发生变化。", "danger");
    } finally {
      state.demoOrderSaving = false;
      syncDemoManagementUi();
    }
  }

  function syncDemoDropzonePlaceholders() {
    elements.simulationList?.querySelectorAll(".cs-demo-dropzone").forEach(zone => {
      const placeholder = zone.querySelector(".cs-demo-empty-drop");
      if (placeholder) placeholder.hidden = Boolean(zone.querySelector("[data-demo-id]"));
    });
  }

  function clearDemoDragVisuals() {
    elements.simulationList?.querySelectorAll(".is-dragging, .is-drag-over").forEach(node => {
      node.classList.remove("is-dragging", "is-drag-over");
    });
    syncDemoDropzonePlaceholders();
  }

  function demoDragAfterElement(zone, pointerY) {
    return Array.from(zone.querySelectorAll("[data-demo-id]:not(.is-dragging)")).reduce((closest, row) => {
      const box = row.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? {offset, row} : closest;
    }, {offset: Number.NEGATIVE_INFINITY, row: null}).row;
  }

  function questionLayoutFromState() {
    return (state.course?.modules || []).map(module => ({
      moduleId: String(module.id),
      items: (module.challenges || []).map((challenge, position) => ({
        moduleIndex: Number(module.index),
        challengeIndex: Number.isFinite(Number(challenge.index))
          ? Number(challenge.index)
          : position,
      })),
    }));
  }

  function questionLayoutFromDom() {
    return Array.from(elements.challengeList?.querySelectorAll(".cs-challenge-group") || []).map(group => ({
      moduleId: String(group.dataset.moduleId || ""),
      items: Array.from(group.querySelectorAll(".cs-challenge-dropzone > .cs-challenge-row[data-question-key]")).map(row => {
        const [moduleIndex, challengeIndex] = String(row.dataset.questionKey || "").split(":").map(Number);
        return {moduleIndex, challengeIndex};
      }),
    }));
  }

  function questionLayoutSignature(layout) {
    return JSON.stringify(layout || []);
  }

  function applyQuestionLayout(layout, positions) {
    const challengeByKey = new Map();
    (state.course.modules || []).forEach(module => {
      (module.challenges || []).forEach((challenge, position) => {
        const index = Number.isFinite(Number(challenge.index)) ? Number(challenge.index) : position;
        challengeByKey.set(questionKey(module.index, index), challenge);
      });
    });
    const positionByKey = new Map((positions || []).map(item => [
      questionKey(item.source?.moduleIndex, item.source?.challengeIndex),
      item.target || {},
    ]));
    const moduleById = new Map((state.course.modules || []).map(module => [String(module.id), module]));
    layout.forEach(requestedModule => {
      const module = moduleById.get(String(requestedModule.moduleId));
      if (!module) throw new Error("章节列表已变化，请刷新页面后再试。");
      module.challenges = requestedModule.items.map(item => {
        const key = questionKey(item.moduleIndex, item.challengeIndex);
        const challenge = challengeByKey.get(key);
        const target = positionByKey.get(key);
        if (!challenge || !target) throw new Error("题目列表已变化，请刷新页面后再试。");
        challenge.index = Number(target.challengeIndex);
        challenge.moduleIndex = Number(target.moduleIndex);
        challenge.url = `/${encodeURIComponent(state.course.referenceId)}/${encodeURIComponent(module.id)}/${encodeURIComponent(challenge.id)}`;
        return challenge;
      });
    });
  }

  async function persistQuestionLayout(layout, previousSignature) {
    if (state.questionOrderSaving) return;
    if (questionLayoutSignature(layout) === previousSignature) {
      renderChallenges();
      return;
    }
    state.questionOrderSaving = true;
    syncQuestionManagementUi();
    try {
      const reference = encodeURIComponent(state.course.referenceId || state.course.id);
      const data = unwrap(await api.json(
        "PATCH",
        `/learning/dojos/${reference}/catalog/order`,
        {modules: layout},
      ));
      applyQuestionLayout(layout, data.positions || []);
      renderModules();
      renderChallenges();
      showNotice("题目顺序已保存。", "success");
    } catch (error) {
      renderChallenges();
      showNotice(error.message || "题目顺序保存失败，原顺序未发生变化。", "danger");
    } finally {
      state.questionOrderSaving = false;
      syncQuestionManagementUi();
    }
  }

  async function persistQuestionDraftModule(draftId, moduleIndex, previousModuleIndex) {
    if (state.questionOrderSaving) return;
    if (Number(moduleIndex) === Number(previousModuleIndex)) {
      renderChallenges();
      return;
    }
    state.questionOrderSaving = true;
    syncQuestionManagementUi();
    try {
      const data = unwrap(await api.json(
        "PATCH",
        `/learning/drafts/${encodeURIComponent(draftId)}`,
        {moduleIndex: Number(moduleIndex)},
      ));
      const item = state.questionItems.find(entry => String(entry.draftId || entry.id) === String(draftId));
      if (item) item.moduleIndex = Number(data.draft?.moduleIndex ?? moduleIndex);
      renderChallenges();
      showNotice("题目草稿已移动到目标章节。", "success");
    } catch (error) {
      renderChallenges();
      showNotice(error.message || "题目草稿移动失败，原章节未发生变化。", "danger");
    } finally {
      state.questionOrderSaving = false;
      syncQuestionManagementUi();
    }
  }

  function syncQuestionDropzonePlaceholders() {
    elements.challengeList?.querySelectorAll(".cs-challenge-dropzone").forEach(zone => {
      const placeholder = zone.querySelector(".cs-question-empty-drop");
      if (placeholder) placeholder.hidden = Boolean(zone.querySelector(".cs-challenge-row"));
    });
  }

  function clearQuestionDragVisuals() {
    elements.challengeList?.querySelectorAll(".is-dragging, .is-drag-over").forEach(node => {
      node.classList.remove("is-dragging", "is-drag-over");
    });
    syncQuestionDropzonePlaceholders();
  }

  function questionDragAfterElement(zone, pointerY) {
    return Array.from(zone.querySelectorAll(".cs-challenge-row:not(.is-dragging)")).reduce((closest, row) => {
      const box = row.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? {offset, row} : closest;
    }, {offset: Number.NEGATIVE_INFINITY, row: null}).row;
  }

  function formatDate(value, short) {
    if (!value) return "未设置";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", short
      ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    ).format(date);
  }

  function formatFileSize(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "大小未知";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function artifactTypeLabel(type) {
    return ({
      "lesson-plan": "教案",
      "slide-deck": "课件",
      simulation: "模拟演示",
      "attack-defense-scene": "攻防演示",
      "classroom-scenario": "课堂演示",
    })[String(type || "").toLowerCase()] || "教学内容";
  }

  function exerciseModeLabel(mode) {
    return ({ CONTAINER: "在线实操", STATIC: "答题练习" })[String(mode || "").toUpperCase()] || "";
  }

  function statusLabel(status) {
    return ({ DRAFT: "草稿", PENDING: "待处理", PLANNED: "已规划", BUILDING: "生成中", QUEUED: "等待执行", RUNNING: "进行中", GENERATING: "生成中", VALIDATING: "检查中", VALIDATED: "等待审核", NEEDS_REVIEW: "等待审核", PARTIAL_SUCCESS: "部分成功", AWAITING_APPROVAL: "等待确认", PUBLISHING: "发布中", PUBLISHED: "已发布", CLOSED: "已关闭", ARCHIVED: "已归档", CANCELLED: "已取消", IN_PROGRESS: "进行中", SUBMITTED: "已提交", GRADED: "已批改", NOT_STARTED: "未开始", UPLOADED: "已上传", PROCESSING: "分析中", ANALYZING: "分析中", ANALYZED: "已分析", READY: "可使用", FAILED: "需要修复", VALIDATION_FAILED: "需要修复", BLOCKED: "需要修复" })[String(status || "").toUpperCase()] || "状态待确认";
  }

  function courseLinks() {
    if (!state.course) return;
    const reference = encodeURIComponent(state.course.referenceId);
    const courseUrl = `/${reference}`;
    const studioUrl = `/teacher/courses?dojo=${reference}&tab=questions`;
    const adminUrl = `/dojo/${reference}/admin/`;
    const newModuleUrl = `/teacher/courses/${reference}/chapters/new`;
    const agentHref = `/teacher?prompt=${encodeURIComponent(`我想管理课程“${state.course.name || "未命名课程"}”，请先了解这门课程并询问我下一步目标。`)}`;
    elements.openCourse.href = courseUrl;
    ["cs-overview-studio", "cs-manage-studio", "cs-challenge-studio"].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.href = studioUrl;
    });
    ["cs-manage-course"].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.href = courseUrl;
    });
    const members = document.getElementById("cs-manage-members");
    const agent = document.getElementById("cs-manage-agent");
    if (members) members.href = adminUrl;
    if (agent) agent.href = agentHref;
    const newModule = document.getElementById("cs-new-module");
    if (newModule) newModule.href = newModuleUrl;
  }

  function activateTab(name, updateUrl) {
    if (state.filterDrawerKind) closeFilterDrawer({restoreFocus: false});
    closeMaterialPreview({restoreFocus: false});
    const requestedName = name;
    const aliases = {
      content: "courseware",
      labs: "questions",
      challenges: "questions",
      assignments: "questions",
      classroom: "demos",
      simulation: "demos",
      simulations: "demos",
      settings: "overview",
    };
    name = aliases[name] || name;
    const allowed = new Set(["overview", "courseware", "questions", "demos", "students"]);
    if (!allowed.has(name)) name = "overview";
    document.querySelectorAll("[data-cs-tab]").forEach(button => {
      const active = button.dataset.csTab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-cs-panel]").forEach(panel => {
      const active = panel.dataset.csPanel === name;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    if (updateUrl || requestedName !== name) {
      const next = new URL(window.location.href);
      next.searchParams.set("tab", name);
      query.set("tab", name);
      history.replaceState(null, "", next);
    }
    if (state.workspace) void ensureTabData(name);
  }

  function scheduleWorkspaceScrollState() {
    if (state.view !== "detail" || !state.course) return;
    window.clearTimeout(state.scrollStateTimer);
    state.scrollStateTimer = window.setTimeout(() => {
      const next = new URL(window.location.href);
      const top = Math.max(0, Math.round(window.scrollY || 0));
      if (top > 0) {
        next.searchParams.set("scroll", String(top));
        query.set("scroll", String(top));
      } else {
        next.searchParams.delete("scroll");
        query.delete("scroll");
      }
      history.replaceState(null, "", next);
    }, 180);
  }

  function renderModules() {
    const modules = state.course.modules || [];
    document.getElementById("cs-module-list").innerHTML = modules.length ? modules.map((module, index) => `
      <article class="cs-module-row is-managed">
        <a class="cs-managed-main" href="/${encodeURIComponent(state.course.referenceId)}/${encodeURIComponent(module.id)}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div><strong>${escape(module.name || "未命名章节")}</strong><small>${escape(module.description || "尚未添加章节说明")}</small></div>
          <em>${(module.challenges || []).length} 道题</em>
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </a>
      </article>`).join("") : `<div class="cs-empty cs-empty-with-action"><span>课程还没有章节。</span><a class="hub-button is-primary" href="/teacher/courses/${encodeURIComponent(state.course.referenceId)}/chapters/new"><i class="fas fa-plus" aria-hidden="true"></i>新建第一个章节</a></div>`;
  }

  function syncArtifactState() {
    state.artifacts = [...state.coursewareArtifacts, ...state.demoArtifacts];
  }

  function contentControls(kind) {
    return {
      materials: {
        search: elements.materialSearch,
        status: elements.materialStatus,
        sort: elements.materialSort,
        pagination: elements.materialPagination,
        list: document.getElementById("cs-material-list"),
      },
      courseware: {
        search: elements.artifactSearch,
        module: elements.artifactModule,
        type: elements.artifactType,
        source: elements.artifactSource,
        status: elements.artifactStatus,
        sort: elements.artifactSort,
        pagination: elements.artifactPagination,
        list: document.getElementById("cs-artifact-list"),
      },
      demos: {
        search: elements.demoSearch,
        module: elements.demoModule,
        status: elements.demoStatus,
        type: elements.demoType,
        sort: elements.demoSort,
        pagination: elements.demoPagination,
        list: elements.simulationList,
      },
    }[kind];
  }

  function contentFilterValues(kind) {
    const controls = contentControls(kind) || {};
    return {
      q: String(controls.search?.value || "").trim(),
      status: controls.status?.value || "",
      type: controls.type?.value || "",
      source: controls.source?.value || "",
      moduleIndex: controls.module?.value ?? "",
      sort: controls.sort?.value || (kind === "demos" ? "course_order" : "updated_desc"),
    };
  }

  function contentFiltersActive(kind) {
    const values = contentFilterValues(kind);
    return Boolean(
      values.q
      || values.status
      || values.type
      || values.source
      || values.moduleIndex !== ""
    );
  }

  function contentEmptyMarkup(kind) {
    if (contentFiltersActive(kind)) {
      const label = {
        materials: "没有符合筛选条件的课程资料。",
        courseware: "没有符合筛选条件的课件产物。",
        demos: "没有符合筛选条件的演示。",
      }[kind];
      return `<div class="cs-empty cs-empty-with-action"><span>${label}</span><button class="hub-button is-secondary" type="button" data-clear-content-filters="${escape(kind)}">清除筛选</button></div>`;
    }
    const label = {
      materials: "尚无原始资料。使用页首“新建课件”并选择“上传资料”开始。",
      courseware: "尚无课件产物。使用页首“新建课件”选择创建方式。",
      demos: "尚无课程演示。使用页首“新建演示”选择教学形态。",
    }[kind];
    return `<div class="cs-empty"><span>${label}</span></div>`;
  }

  function clearContentFilters(kind) {
    const controls = contentControls(kind) || {};
    [controls.search, controls.status, controls.type, controls.source, controls.module].forEach(node => {
      if (node) node.value = "";
    });
    if (controls.sort) controls.sort.value = kind === "demos" ? "course_order" : "updated_desc";
    void loadCourseContent(kind, {resetPage: true});
  }

  function renderContentPagination(kind) {
    const controls = contentControls(kind);
    const paging = state.contentPaging[kind];
    if (!controls?.pagination || !paging) return;
    const total = Number(paging.total || 0);
    const page = Number(paging.page || 1);
    const totalPages = Number(paging.totalPages || 1);
    controls.pagination.innerHTML = total ? `
      <span>共 ${total} 条 · 第 ${page} / ${totalPages} 页</span>
      <span>
        <button type="button" data-content-kind="${escape(kind)}" data-content-page="${Math.max(1, page - 1)}"${page <= 1 ? " disabled" : ""}><i class="fas fa-chevron-left" aria-hidden="true"></i><span>上一页</span></button>
        <button type="button" data-content-kind="${escape(kind)}" data-content-page="${Math.min(totalPages, page + 1)}"${page >= totalPages ? " disabled" : ""}><span>下一页</span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </span>` : '<span>共 0 条</span>';
  }

  async function loadCourseContent(kind, options) {
    if (!state.course || !state.contentPaging[kind]) return false;
    const paging = state.contentPaging[kind];
    if (options?.resetPage) paging.page = 1;
    if (Number.isFinite(Number(options?.page))) paging.page = Math.max(1, Number(options.page));
    const sequence = ++state.contentLoadSequence[kind];
    const controls = contentControls(kind);
    controls?.list?.setAttribute("aria-busy", "true");
    const filters = contentFilterValues(kind);
    const params = new URLSearchParams({
      kind,
      page: String(paging.page || 1),
      pageSize: String(paging.pageSize || 30),
      sort: filters.sort,
    });
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.type) params.set("type", filters.type);
    if (filters.source) params.set("source", filters.source);
    if (filters.moduleIndex !== "") params.set("moduleIndex", filters.moduleIndex);
    syncWorkspaceCollectionUrl(kind);
    try {
      const data = unwrap(await api.request(
        `/teaching/courses/${encodeURIComponent(state.course.referenceId || state.course.id)}/content?${params.toString()}`,
      ));
      if (sequence !== state.contentLoadSequence[kind]) return false;
      state.contentPaging[kind] = {...paging, ...(data.pagination || {})};
      state.contentLoaded[kind] = true;
      if (kind === "materials") state.materials = data.items || [];
      if (kind === "courseware") state.coursewareArtifacts = data.items || [];
      if (kind === "demos") state.demoArtifacts = data.items || [];
      syncArtifactState();
      if (kind === "materials") renderMaterials();
      if (kind === "courseware") renderArtifacts();
      if (kind === "demos") renderSimulations();
      return true;
    } catch (error) {
      if (sequence === state.contentLoadSequence[kind]) {
        showNotice(error.message || "课程内容加载失败。", "danger");
      }
      return false;
    } finally {
      if (sequence === state.contentLoadSequence[kind]) controls?.list?.removeAttribute("aria-busy");
    }
  }

  function scheduleCourseContentLoad(kind) {
    window.clearTimeout(state.contentSearchTimers[kind]);
    state.contentSearchTimers[kind] = window.setTimeout(() => {
      void loadCourseContent(kind, {resetPage: true});
    }, 260);
  }

  function artifactDetailHref(artifactId) {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set("selectedId", String(artifactId));
    const returnPath = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
    return `/teacher/artifacts/${encodeURIComponent(artifactId)}?return=${encodeURIComponent(returnPath)}`;
  }

  function focusRequestedContent(kind, selector, attribute) {
    if (state.contentSelectionHandled[kind]) return;
    const selectedId = query.get("selectedId");
    if (!selectedId || (query.get("tab") || "overview") !== kind) return;
    const target = Array.from(document.querySelectorAll(selector)).find(node => node.dataset[attribute] === selectedId);
    if (!target) return;
    state.contentSelectionHandled[kind] = true;
    target.classList.add("is-focused");
    window.setTimeout(() => target.scrollIntoView({block: "center", behavior: "auto"}), 0);
  }

  function renderArtifacts() {
    const rows = coursewareRows();
    const count = document.getElementById("cs-artifact-count");
    if (count) count.textContent = `${Number(state.contentPaging.courseware.total)} 份`;
    elements.artifactList.innerHTML = rows.length ? rows.map(item => {
      const name = item.title || artifactTypeLabel(item.type);
      const blockReason = coursewareDeleteBlockReason(item);
      const canDelete = !blockReason;
      const selected = state.selectedCoursewareIds.has(String(item.id));
      const selector = state.coursewareManagement ? `<label class="cs-question-batch-select cs-courseware-batch-select" title="${escape(blockReason || `选择${name}`)}">
        <input type="checkbox" data-courseware-select="${escape(item.id)}" data-deletable="${canDelete ? "true" : "false"}" aria-label="选择${escape(name)}"${canDelete ? "" : " disabled"}>
        <span><i class="fas fa-check" aria-hidden="true"></i></span>
      </label>` : "";
      const actions = state.coursewareManagement ? `<span class="cs-courseware-row-actions" role="group" aria-label="管理${escape(name)}">
        ${item.canEdit === false
          ? `<small title="${escape(blockReason)}"><i class="fas fa-lock" aria-hidden="true"></i>${escape(blockReason)}</small>`
          : `<button class="hub-button is-secondary is-compact" type="button" data-manage-action="rename" data-manage-kind="artifact" data-manage-id="${escape(item.id)}" data-manage-name="${escape(name)}"><i class="fas fa-pen" aria-hidden="true"></i><span>重命名</span></button>${canDelete ? `<button class="hub-button is-danger is-compact" type="button" data-manage-action="delete" data-manage-kind="artifact" data-manage-id="${escape(item.id)}" data-manage-name="${escape(name)}"><i class="fas fa-trash-alt" aria-hidden="true"></i><span>删除</span></button>` : `<small title="${escape(blockReason)}"><i class="fas fa-lock" aria-hidden="true"></i>${escape(blockReason)}</small>`}`}
      </span>` : "";
      return `
      <article class="cs-library-row is-managed cs-artifact-list-row${state.coursewareManagement ? " is-courseware-managed" : ""}${selected ? " is-selected" : ""}" data-artifact-id="${escape(item.id)}">
        ${selector}
        <a class="cs-managed-main" href="${escape(artifactDetailHref(item.id))}">
          <span class="cs-library-icon"><i class="fas fa-file-alt"></i></span>
          <span><strong>${escape(name)}</strong><small>${escape(artifactTypeLabel(item.type))} · ${escape(moduleName(item.moduleIndex))} · 版本 ${Number(item.currentRevision || 0)} · ${escape(statusLabel(item.status))}</small><em>${escape(item.sourceSummary?.label || "直接创建")} · ${escape(item.ownerName || "课程教师")} · 更新于 ${escape(formatDate(item.updated, true))}</em></span>
          <i class="fas fa-chevron-right"></i>
        </a>
        ${actions}
      </article>`;
    }).join("") : contentEmptyMarkup("courseware");
    renderContentPagination("courseware");
    syncCoursewareManagementUi();
    focusRequestedContent("courseware", "[data-artifact-id]", "artifactId");
  }

  function materialPreviewMode(item) {
    if (item.previewMode) return item.previewMode;
    const mime = String(item.mimeType || "").split(";", 1)[0].trim().toLowerCase();
    if (mime === "application/pdf") return "pdf";
    if (["image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(mime)) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("text/") || ["application/json", "application/xml", "application/yaml", "application/x-yaml"].includes(mime)) return "text";
    return "extracted";
  }

  function materialPreviewUrl(item) {
    return item.previewUrl || `/pwncollege_api/v1/teaching/materials/${encodeURIComponent(item.id)}/preview`;
  }

  function materialDownloadUrl(item) {
    return item.downloadUrl || `/pwncollege_api/v1/teaching/materials/${encodeURIComponent(item.id)}/download`;
  }

  function renderExtractedMaterialPreview(material) {
    const sources = Array.isArray(material.sources) ? material.sources.filter(source => source && source.excerpt) : [];
    if (!sources.length) {
      elements.materialPreviewBody.innerHTML = `<div class="hub-material-preview-empty"><i class="far fa-file-alt" aria-hidden="true"></i><strong>这个文件暂时没有可显示的页面内容</strong><span>仍可下载原文件查看；资料分析完成后，这里会显示最新提取内容。</span></div>`;
      elements.materialPreviewStatus.textContent = "当前格式无法由浏览器直接显示。";
      return;
    }
    elements.materialPreviewBody.innerHTML = `<section class="hub-material-preview-extracted">
      <header><strong>已提取内容预览</strong><span>浏览器不能直接显示这种文件格式，以下内容来自当前资料的最新分析版本；下载按钮始终提供原文件。</span></header>
      <ol>${sources.slice(0, 100).map((source, index) => `<li><small>${escape(source.locator || `内容片段 ${index + 1}`)}</small><p>${escape(source.excerpt)}</p></li>`).join("")}</ol>
    </section>`;
    elements.materialPreviewStatus.textContent = `已显示 ${Math.min(100, sources.length)} 个最新提取片段。`;
  }

  function renderLiveMaterialPreview(item) {
    const mode = materialPreviewMode(item);
    const previewUrl = materialPreviewUrl(item);
    const filename = item.filename || item.title || "课程资料";
    const markup = {
      pdf: `<iframe class="hub-material-preview-frame" src="${escape(`${previewUrl}#view=FitH&toolbar=1`)}" title="${escape(filename)}实时预览"></iframe>`,
      text: `<iframe class="hub-material-preview-frame" src="${escape(previewUrl)}" title="${escape(filename)}文本预览"></iframe>`,
      image: `<img class="hub-material-preview-image" src="${escape(previewUrl)}" alt="${escape(filename)}">`,
      audio: `<audio class="hub-material-preview-media" src="${escape(previewUrl)}" controls preload="metadata">当前浏览器无法预览此音频。</audio>`,
      video: `<video class="hub-material-preview-media" src="${escape(previewUrl)}" controls preload="metadata">当前浏览器无法预览此视频。</video>`,
    }[mode];
    if (!markup) return false;
    elements.materialPreviewBody.innerHTML = markup;
    const viewer = elements.materialPreviewBody.firstElementChild;
    const readyEvent = ["audio", "video"].includes(mode) ? "loadedmetadata" : "load";
    viewer?.addEventListener(readyEvent, () => {
      elements.materialPreviewStatus.textContent = "已载入当前保存的原文件。";
    }, {once: true});
    viewer?.addEventListener("error", () => {
      elements.materialPreviewStatus.textContent = "预览载入失败，可下载原文件后查看。";
    }, {once: true});
    return true;
  }

  function closeMaterialPreview(options) {
    if (!elements.materialPreviewDialog || elements.materialPreviewDialog.hidden) return;
    state.materialPreviewRequest += 1;
    elements.materialPreviewDialog.hidden = true;
    elements.materialPreviewDialog.setAttribute("aria-hidden", "true");
    elements.materialPreviewBody.innerHTML = "";
    elements.materialPreviewDownload.setAttribute("href", "#");
    document.body.classList.remove("has-material-preview-dialog");
    const returnFocus = state.materialPreviewReturnFocus;
    state.materialPreviewReturnFocus = null;
    if ((!options || options.restoreFocus !== false) && returnFocus instanceof HTMLElement) {
      returnFocus.focus({preventScroll: true});
    }
  }

  async function openMaterialPreview(materialId, trigger) {
    const item = state.materials.find(material => String(material.id) === String(materialId));
    if (!item || !elements.materialPreviewDialog) return;
    window.AISecEduUI?.closeMenus?.();
    const requestId = ++state.materialPreviewRequest;
    state.materialPreviewReturnFocus = trigger || document.activeElement;
    const filename = item.filename || item.title || "课程资料";
    elements.materialPreviewTitle.textContent = item.title || filename;
    elements.materialPreviewMeta.textContent = `${filename} · ${formatFileSize(item.size)} · ${statusLabel(item.status)}`;
    elements.materialPreviewStatus.textContent = "正在读取当前保存的原文件…";
    elements.materialPreviewDownload.href = materialDownloadUrl(item);
    elements.materialPreviewDownload.setAttribute("download", filename);
    elements.materialPreviewBody.innerHTML = `<div class="hub-material-preview-loading"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>正在载入最新文件…</span></div>`;
    elements.materialPreviewDialog.hidden = false;
    elements.materialPreviewDialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-material-preview-dialog");
    window.requestAnimationFrame(() => elements.materialPreviewCard?.focus({preventScroll: true}));
    if (renderLiveMaterialPreview(item)) return;
    try {
      const detail = unwrap(await api.request(`/teaching/materials/${encodeURIComponent(item.id)}`));
      if (requestId !== state.materialPreviewRequest) return;
      renderExtractedMaterialPreview(detail.material || item);
    } catch (error) {
      if (requestId !== state.materialPreviewRequest) return;
      elements.materialPreviewBody.innerHTML = `<div class="hub-material-preview-empty"><i class="fas fa-exclamation-circle" aria-hidden="true"></i><strong>暂时无法生成预览</strong><span>${escape(error.message || "请稍后重试，或直接下载原文件查看。")}</span></div>`;
      elements.materialPreviewStatus.textContent = "预览读取失败，原文件仍可下载。";
    }
  }

  function renderMaterials() {
    window.AISecEduUI?.closeMenus?.();
    document.getElementById("cs-material-count").textContent = `${Number(state.contentPaging.materials.total)} 份`;
    document.getElementById("cs-material-list").innerHTML = state.materials.length ? state.materials.map(item => {
      const analysis = item.analysis || {};
      const chapterCount = Array.isArray(analysis.chapterCandidates) ? analysis.chapterCandidates.length : 0;
      const name = item.title || item.filename || "课程资料";
      const downloadUrl = materialDownloadUrl(item);
      return `<article class="cs-library-row is-managed" data-material-id="${escape(item.id)}">
        <button class="cs-managed-main" type="button" data-material-preview="${escape(item.id)}" aria-label="实时预览${escape(name)}">
          <span class="cs-library-icon"><i class="fas fa-paperclip"></i></span>
          <span><strong>${escape(name)}</strong><small>${escape(item.filename)} · ${escape(statusLabel(item.status))}${chapterCount ? ` · ${chapterCount} 个章节候选` : ""}</small><em>${escape(item.ownerName || "课程教师")} · 更新于 ${escape(formatDate(item.updated || item.created, true))}</em></span>
          <i class="far fa-eye" aria-hidden="true"></i>
        </button>
        <a class="cs-material-download" href="${escape(downloadUrl)}" download="${escape(item.filename || name)}" aria-label="下载${escape(name)}" title="下载原文件"><i class="fas fa-download" aria-hidden="true"></i></a>
        ${managementMenu("material", item.id, name)}
      </article>`;
    }).join("") : contentEmptyMarkup("materials");
    const requestedMaterial = query.get("material");
    if (requestedMaterial) {
      const target = Array.from(document.querySelectorAll("[data-material-id]")).find(item => item.dataset.materialId === requestedMaterial);
      if (target) {
        target.classList.add("is-focused");
        window.setTimeout(() => target.scrollIntoView({ block: "center" }), 0);
      }
    }
    renderContentPagination("materials");
  }

  function renderSimulations() {
    const labels = {
      simulation: "模拟演示",
      "attack-defense-scene": "攻防演示",
      "classroom-scenario": "课堂场景",
    };
    const icons = {
      simulation: "fa-project-diagram",
      "attack-defense-scene": "fa-shield-alt",
      "classroom-scenario": "fa-chalkboard",
    };
    const groups = demoGroupsFromState();
    initializeDemoChapters(groups);
    const total = Number(state.contentPaging.demos.total);
    if (!total && !state.demoManagement) {
      elements.simulationList.innerHTML = contentEmptyMarkup("demos");
      renderContentPagination("demos");
      syncDemoManagementUi();
      return;
    }
    elements.simulationList.innerHTML = groups.length ? groups.map(group => {
      const module = group.module;
      const chapterName = module?.name || "未分配章节";
      const chapterNumber = module ? `章节 ${Number(module.index) + 1}` : "待整理";
      const key = chapterKey(group.moduleIndex);
      const expanded = state.demoManagement || state.demoExpandedModules.has(key);
      const chapterActions = state.demoManagement
        ? '<span class="cs-chapter-drop-hint"><i class="fas fa-arrow-down" aria-hidden="true"></i>可拖入此章节</span>'
        : `${module ? `<a href="/${encodeURIComponent(state.course.referenceId)}/${encodeURIComponent(module.id)}">打开章节</a>` : ""}<button class="cs-chapter-toggle" type="button" data-workspace-chapter="demos" data-chapter-key="${escape(key)}" aria-expanded="${expanded ? "true" : "false"}"><span>${expanded ? "收起" : "展开"}</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button>`;
      const rows = group.items.map(item => {
        const type = String(item.type || "simulation").toLowerCase();
        const name = item.title || labels[type] || "模拟演示";
        return `<article class="cs-challenge-row is-managed cs-demo-row${state.demoManagement ? " is-demo-managed" : ""}" data-demo-id="${escape(item.id)}">
          ${state.demoManagement ? `<button class="cs-question-drag-handle cs-demo-drag-handle" type="button" draggable="true" aria-label="拖动“${escape(name)}”调整顺序或章节" title="拖动调整顺序或章节"><i class="fas fa-grip-vertical" aria-hidden="true"></i></button>` : ""}
          <a class="cs-managed-main" href="${escape(artifactDetailHref(item.id))}">
            <span class="cs-demo-thumbnail" data-demo-type="${escape(type)}"><i class="fas ${icons[type] || "fa-project-diagram"}"></i><small>预览</small></span>
            <span><strong>${escape(name)}</strong><small>${escape(item.objective || "尚未填写教学目标")}</small><em>${escape(labels[type] || "模拟演示")} · ${item.durationMinutes ? `${Number(item.durationMinutes)} 分钟 · ` : ""}版本 ${Number(item.currentRevision || 0)} · 更新于 ${escape(formatDate(item.updated, true))}</em><span class="cs-demo-availability ${item.studentAvailable ? "is-live" : ""}"><i class="fas ${item.studentAvailable ? "fa-user-check" : "fa-user-lock"}" aria-hidden="true"></i>${item.studentAvailable ? "学生可用" : "仅教师可见"}</span></span>
            <em>打开演示 <i class="fas fa-arrow-right"></i></em>
          </a>
          ${state.demoManagement ? managementButtons("demo", item.id, name) : `<button class="cs-demo-copy" type="button" data-artifact-action="duplicate" data-artifact-id="${escape(item.id)}" aria-label="复制演示“${escape(name)}”" title="复制复用"><i class="fas fa-copy" aria-hidden="true"></i></button>`}
        </article>`;
      }).join("");
      const content = state.demoManagement
        ? `${rows}<div class="cs-question-empty-drop cs-demo-empty-drop"${group.items.length ? " hidden" : ""}><i class="fas fa-arrow-down" aria-hidden="true"></i><span>拖动演示到此章节</span></div>`
        : rows || '<div class="cs-empty"><span>本章节还没有演示。</span></div>';
      return `<section class="cs-surface cs-challenge-group cs-demo-group${state.demoManagement ? " is-demo-management" : ""}${expanded ? "" : " is-collapsed"}" data-demo-module-index="${group.moduleIndex == null ? "" : Number(group.moduleIndex)}">
        <header><div><span class="cs-eyebrow">${escape(chapterNumber)}</span><h2>${escape(chapterName)}</h2></div><span>${chapterActions}</span></header>
        <div class="cs-challenge-dropzone cs-demo-dropzone" data-demo-dropzone aria-label="${escape(chapterName)}演示列表"${expanded ? "" : " hidden"}>${content}</div>
      </section>`;
    }).join("") : '<div class="cs-empty">课程还没有章节。请先建立课程结构，再使用页首“新建演示”创建内容。</div>';
    syncDemoDropzonePlaceholders();
    syncDemoManagementUi();
    renderContentPagination("demos");
    focusRequestedContent("demos", "[data-demo-id]", "demoId");
  }

  function syncQuestionModuleFilter(modules) {
    if (!elements.questionModule) return;
    const current = elements.questionModule.value;
    elements.questionModule.innerHTML = '<option value="">全部章节</option>' + modules.map(module =>
      `<option value="${Number(module.index)}">章节 ${Number(module.index) + 1} · ${escape(module.name || "未命名章节")}</option>`
    ).join("");
    if (Array.from(elements.questionModule.options).some(option => option.value === current)) {
      elements.questionModule.value = current;
    }
  }

  function moduleName(moduleIndex) {
    if (moduleIndex == null || moduleIndex === "") return "未分配章节";
    const module = (state.course?.modules || []).find(item => Number(item.index) === Number(moduleIndex));
    return module?.name || `章节 ${Number(moduleIndex) + 1}`;
  }

  function syncContentModuleFilters(modules) {
    [elements.artifactModule, elements.demoModule].forEach(select => {
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">全部章节</option>' + modules.map(module =>
        `<option value="${Number(module.index)}">章节 ${Number(module.index) + 1} · ${escape(module.name || "未命名章节")}</option>`
      ).join("") + '<option value="unassigned">未分配章节</option>';
      if (Array.from(select.options).some(option => option.value === current)) select.value = current;
    });
  }

  function questionFilterValues() {
    return {
      q: String(elements.questionSearch?.value || "").trim(),
      status: elements.questionStatus?.value || "",
      moduleIndex: elements.questionModule?.value ?? "",
      required: elements.questionRequired?.value || "",
      mode: String(elements.questionMode?.value || "").toUpperCase(),
      sort: elements.questionSort?.value || "course_order",
    };
  }

  function setWorkspaceUrlParam(url, key, value, defaultValue) {
    const normalized = value == null ? "" : String(value);
    if (!normalized || normalized === String(defaultValue ?? "")) {
      url.searchParams.delete(key);
      query.delete(key);
    } else {
      url.searchParams.set(key, normalized);
      query.set(key, normalized);
    }
  }

  function syncWorkspaceCollectionUrl(kind) {
    const next = new URL(window.location.href);
    if (kind === "questions") {
      const values = questionFilterValues();
      setWorkspaceUrlParam(next, "questionQ", values.q, "");
      setWorkspaceUrlParam(next, "questionStatus", values.status, "");
      setWorkspaceUrlParam(next, "questionModule", values.moduleIndex, "");
      setWorkspaceUrlParam(next, "questionRequired", values.required, "");
      setWorkspaceUrlParam(next, "questionMode", values.mode, "");
      setWorkspaceUrlParam(next, "questionSort", values.sort, "course_order");
      setWorkspaceUrlParam(next, "questionPage", state.questionPaging.page, 1);
      if (state.questionChapterStateInitialized) {
        setWorkspaceUrlParam(next, "questionOpen", chapterStateValue(state.questionExpandedModules), "");
      }
    } else {
      const values = contentFilterValues(kind);
      const prefix = kind === "materials" ? "material" : kind === "courseware" ? "courseware" : "demo";
      setWorkspaceUrlParam(next, `${prefix}Q`, values.q, "");
      setWorkspaceUrlParam(next, `${prefix}Status`, values.status, "");
      setWorkspaceUrlParam(next, `${prefix}Module`, values.moduleIndex, "");
      setWorkspaceUrlParam(next, `${prefix}Type`, values.type, "");
      setWorkspaceUrlParam(next, `${prefix}Source`, values.source, "");
      setWorkspaceUrlParam(next, `${prefix}Sort`, values.sort, kind === "demos" ? "course_order" : "updated_desc");
      setWorkspaceUrlParam(next, `${prefix}Page`, state.contentPaging[kind]?.page, 1);
      if (kind === "demos" && state.demoChapterStateInitialized) {
        setWorkspaceUrlParam(next, "demoOpen", chapterStateValue(state.demoExpandedModules), "");
      }
    }
    history.replaceState(null, "", next);
  }

  function setControlFromUrl(control, value) {
    if (!control) return;
    if (control instanceof HTMLInputElement) {
      control.value = value || "";
      return;
    }
    control.value = Array.from(control.options || []).some(option => option.value === String(value || "")) ? String(value || "") : "";
  }

  function restoreWorkspaceCollectionState() {
    const current = new URL(window.location.href).searchParams;
    setControlFromUrl(elements.materialSearch, current.get("materialQ"));
    setControlFromUrl(elements.materialStatus, current.get("materialStatus"));
    setControlFromUrl(elements.materialSort, current.get("materialSort") || "updated_desc");
    setControlFromUrl(elements.artifactSearch, current.get("coursewareQ"));
    setControlFromUrl(elements.artifactStatus, current.get("coursewareStatus"));
    setControlFromUrl(elements.artifactModule, current.get("coursewareModule"));
    setControlFromUrl(elements.artifactType, current.get("coursewareType"));
    setControlFromUrl(elements.artifactSource, current.get("coursewareSource"));
    setControlFromUrl(elements.artifactSort, current.get("coursewareSort") || "updated_desc");
    setControlFromUrl(elements.demoSearch, current.get("demoQ"));
    setControlFromUrl(elements.demoStatus, current.get("demoStatus"));
    setControlFromUrl(elements.demoModule, current.get("demoModule"));
    setControlFromUrl(elements.demoType, current.get("demoType"));
    setControlFromUrl(elements.demoSort, current.get("demoSort") || "course_order");
    setControlFromUrl(elements.questionSearch, current.get("questionQ"));
    setControlFromUrl(elements.questionStatus, current.get("questionStatus"));
    setControlFromUrl(elements.questionModule, current.get("questionModule"));
    setControlFromUrl(elements.questionRequired, current.get("questionRequired"));
    setControlFromUrl(elements.questionMode, current.get("questionMode"));
    setControlFromUrl(elements.questionSort, current.get("questionSort") || "course_order");
    const restoreChapters = (key, expandedKey, initializedKey) => {
      if (!current.has(key)) return;
      const value = current.get(key) || "none";
      state[expandedKey] = new Set(value === "none" ? [] : value.split(",").filter(Boolean));
      state[initializedKey] = true;
    };
    restoreChapters("questionOpen", "questionExpandedModules", "questionChapterStateInitialized");
    restoreChapters("demoOpen", "demoExpandedModules", "demoChapterStateInitialized");
    const pageValue = key => Math.max(1, Number.parseInt(current.get(key) || "1", 10) || 1);
    state.contentPaging.materials.page = pageValue("materialPage");
    state.contentPaging.courseware.page = pageValue("coursewarePage");
    state.contentPaging.demos.page = pageValue("demoPage");
    state.questionPaging.page = pageValue("questionPage");
  }

  function renderQuestionCountSummary() {
    const counts = state.questionCounts || {};
    elements.questionCountSummary?.querySelectorAll("[data-question-count]").forEach(node => {
      node.textContent = Number(counts[node.dataset.questionCount] || 0);
    });
    const selected = elements.questionStatus?.value || "";
    elements.questionCountSummary?.querySelectorAll("[data-question-count-filter]").forEach(button => {
      const active = button.dataset.questionCountFilter === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  async function loadQuestionContent(options) {
    if (!state.course) return false;
    if (options?.resetPage) state.questionPaging.page = 1;
    if (Number.isFinite(Number(options?.page))) {
      state.questionPaging.page = Math.max(1, Number(options.page));
    }
    if (Number.isFinite(Number(options?.pageSize))) {
      state.questionPaging.pageSize = Math.min(100, Math.max(1, Number(options.pageSize)));
    }
    const filters = questionFilterValues();
    const params = new URLSearchParams({
      kind: "questions",
      page: String(state.questionPaging.page || 1),
      pageSize: String(state.questionPaging.pageSize || 30),
      sort: filters.sort,
    });
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.moduleIndex !== "") params.set("moduleIndex", filters.moduleIndex);
    if (filters.required) params.set("required", filters.required);
    if (filters.mode) params.set("mode", filters.mode);
    syncWorkspaceCollectionUrl("questions");
    const sequence = ++state.questionLoadSequence;
    elements.challengeList?.setAttribute("aria-busy", "true");
    try {
      const data = unwrap(await api.request(
        `/teaching/courses/${encodeURIComponent(state.course.referenceId || state.course.id)}/content?${params.toString()}`,
      ));
      if (sequence !== state.questionLoadSequence) return false;
      state.questionItems = data.items || [];
      selectedQuestionDrafts();
      state.questionCounts = data.counts || {total: 0, draft: 0, published: 0, needsAttention: 0};
      state.questionPaging = {...state.questionPaging, ...(data.pagination || {})};
      state.questionLoaded = true;
      renderChallenges();
      const requestedId = query.get("selectedId");
      if (!state.questionSelectionHandled && requestedId) {
        const selected = state.questionItems.find(item => String(item.id) === requestedId || String(item.draftId) === requestedId);
        if (selected?.kind === "draft") {
          state.questionSelectionHandled = true;
          window.setTimeout(() => void openQuestionDrawer(selected.draftId, null), 0);
        }
      }
      return true;
    } catch (error) {
      if (sequence === state.questionLoadSequence) {
        state.questionLoaded = true;
        elements.challengeList.innerHTML = `<div class="cs-empty cs-empty-with-action"><span>${escape(error.message || "题目列表加载失败。")}</span><button class="hub-button is-secondary" type="button" data-retry-question-load><i class="fas fa-sync-alt" aria-hidden="true"></i>重新加载</button></div>`;
        showNotice(error.message || "题目列表加载失败。", "danger");
      }
      return false;
    } finally {
      if (sequence === state.questionLoadSequence) elements.challengeList?.removeAttribute("aria-busy");
    }
  }

  function renderQuestionPagination() {
    if (!elements.questionPagination) return;
    const paging = state.questionPaging;
    const total = Number(paging.total || 0);
    const page = Number(paging.page || 1);
    const totalPages = Number(paging.totalPages || 1);
    elements.questionPagination.innerHTML = total ? `
      <span>共 ${total} 道 · 第 ${page} / ${totalPages} 页</span>
      <span>
        <button type="button" data-question-page="${Math.max(1, page - 1)}"${page <= 1 ? " disabled" : ""}><i class="fas fa-chevron-left" aria-hidden="true"></i><span>上一页</span></button>
        <button type="button" data-question-page="${Math.min(totalPages, page + 1)}"${page >= totalPages ? " disabled" : ""}><span>下一页</span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </span>` : '<span>共 0 道</span>';
  }

  function questionStateTone(stateName) {
    return ({published: "success", pass: "success", passed: "success", succeeded: "success", ready: "success", validated: "success", needs_review: "warning", partial_success: "warning", failed: "danger", fail: "danger", validation_failed: "danger", block: "danger", blocked: "danger", building: "info", generating: "info", running: "info", validating: "info", queued: "info", draft: "neutral", pending: "neutral"})[String(stateName || "").toLowerCase()] || "neutral";
  }

  function batchEnvironmentLabel(value) {
    return ({READY: "环境可用", BUILDING: "环境构建中", FAILED: "环境失败", PENDING: "等待构建"})[String(value || "").toUpperCase()] || "等待构建";
  }

  function batchValidationLabel(value) {
    const normalized = String(value || "PENDING").toUpperCase();
    if (["PASS", "PASSED", "SUCCEEDED", "VALIDATED"].includes(normalized)) return "标准解已验证";
    if (["FAIL", "FAILED", "BLOCK"].includes(normalized)) return "标准解验证失败";
    if (["RUNNING", "VALIDATING", "BUILDING"].includes(normalized)) return "标准解验证中";
    return "等待标准解验证";
  }

  function renderQuestionBatchReview() {
    const batch = state.questionReviewBatch;
    if (!elements.questionBatchReview) return;
    elements.questionBatchReview.hidden = !batch;
    if (!batch) return;
    const requested = Number(batch.requestedCount || 0);
    const created = Number(batch.createdCount || 0);
    const validated = Number(batch.validatedCount || 0);
    const failed = Number(batch.failedCount || 0);
    elements.questionBatchTitle.textContent = `${requested} 道独立题目审核`;
    elements.questionBatchScope.textContent = `${batch.course?.name || state.course?.name || "当前课程"} · ${batch.module?.name || "未分配章节"} · CTF 实践题 · 草稿发布`;
    elements.questionBatchThread.href = batch.threadId ? `/teacher?thread=${encodeURIComponent(batch.threadId)}` : "/teacher";
    elements.questionBatchCounts.innerHTML = `
      <span><small>目标</small><strong>${requested}</strong></span>
      <span><small>已创建</small><strong>${created}</strong></span>
      <span><small>已验证</small><strong>${validated}</strong></span>
      <span class="${failed ? "is-danger" : "is-success"}"><small>失败</small><strong>${failed}</strong></span>
      <span class="cs-question-batch-state is-${escape(questionStateTone(batch.status))}">${escape(statusLabel(batch.status))}</span>`;
    elements.questionBatchItems.innerHTML = (batch.items || []).map(item => {
      const stateName = String(item.status || "planned").toLowerCase();
      const skills = (item.skills || []).length
        ? item.skills.slice(0, 4).map(skill => `<span>${escape(skill)}</span>`).join("")
        : "<span>能力目标见题目草稿</span>";
      const content = `<span class="cs-question-batch-index">${Number(item.itemIndex || 0)}</span><span class="cs-question-batch-item-copy"><strong>${escape(item.title || `独立 CTF 题目 ${Number(item.itemIndex || 0)}`)}</strong><small>${escape(item.difficulty || "按要求递进")} · ${escape(statusLabel(stateName))}</small><span class="cs-question-batch-skills">${skills}</span><em><span class="is-${escape(questionStateTone(item.environmentStatus))}"><i class="fas fa-cube" aria-hidden="true"></i>${escape(batchEnvironmentLabel(item.environmentStatus))}</span><span class="is-${escape(questionStateTone(item.validationStatus))}"><i class="fas fa-shield-alt" aria-hidden="true"></i>${escape(batchValidationLabel(item.validationStatus))}</span></em>${item.failure ? `<b>${escape(item.failure)}</b>` : ""}</span>`;
      const open = item.draftId
        ? `<button class="cs-question-batch-item-main" type="button" data-open-question-draft="${escape(item.draftId)}">${content}<i class="fas fa-arrow-right" aria-hidden="true"></i></button>`
        : `<div class="cs-question-batch-item-main">${content}</div>`;
      const retry = item.retryable
        ? `<button class="hub-button is-secondary" type="button" data-question-batch-retry-item="${Number(item.itemIndex)}"><i class="fas fa-redo" aria-hidden="true"></i><span>重试此题</span></button>`
        : "";
      return `<article class="cs-question-batch-item is-${escape(questionStateTone(stateName))}">${open}${retry}</article>`;
    }).join("");
    const selectable = (batch.items || []).filter(item => item.draftId).length;
    elements.questionBatchActions.innerHTML = `${failed ? `<button class="hub-button is-secondary" type="button" data-question-batch-retry-all><i class="fas fa-redo-alt" aria-hidden="true"></i><span>只重试失败项</span></button>` : ""}${selectable ? `<button class="hub-button is-primary" type="button" data-question-batch-select-created><i class="fas fa-check-square" aria-hidden="true"></i><span>选择已创建的 ${selectable} 道题</span></button>` : ""}`;
  }

  async function loadQuestionReviewBatch() {
    const batchId = query.get("batchId");
    if (!batchId || !state.course) {
      state.questionReviewBatch = null;
      state.questionReviewLoaded = true;
      renderQuestionBatchReview();
      return true;
    }
    const sequence = ++state.questionReviewLoadSequence;
    try {
      const data = unwrap(await api.request(`/teaching/generation-batches/${encodeURIComponent(batchId)}`));
      if (sequence !== state.questionReviewLoadSequence) return false;
      const batch = data.batch;
      if (!batch || String(batch.course?.referenceId || batch.course?.id) !== String(state.course.referenceId || state.course.id)) {
        throw new Error("这组题目不属于当前课程。");
      }
      state.questionReviewBatch = batch;
      state.questionReviewLoaded = true;
      renderQuestionBatchReview();
      return true;
    } catch (error) {
      if (sequence === state.questionReviewLoadSequence) {
        state.questionReviewBatch = null;
        renderQuestionBatchReview();
        showNotice(error.message || "批次审核信息加载失败。", "danger");
      }
      return false;
    }
  }

  async function ensureTabData(name) {
    if (!state.workspace) return true;
    if (state.tabLoads[name]) return state.tabLoads[name];
    const task = (async () => {
      const loaders = [];
      if (name === "courseware") {
        if (!state.contentLoaded.materials) loaders.push(loadCourseContent("materials"));
        if (!state.contentLoaded.courseware) loaders.push(loadCourseContent("courseware"));
      }
      if (name === "questions") {
        if (!state.questionLoaded) loaders.push(loadQuestionContent());
        if (!state.questionReviewLoaded) loaders.push(loadQuestionReviewBatch());
      }
      if (name === "demos" && !state.contentLoaded.demos) {
        loaders.push(loadCourseContent("demos"));
      }
      if (name === "students" && !state.learningScopeInitialized) {
        loaders.push(
          reloadLearningProgress({syncUrl: false}).then(result => {
            if (result) state.learningScopeInitialized = true;
            return result;
          })
        );
      }
      if (!loaders.length) return true;
      const results = await Promise.all(loaders);
      if (results.every(Boolean)) showNotice("");
      return results.every(Boolean);
    })();
    state.tabLoads[name] = task;
    try {
      return await task;
    } finally {
      if (state.tabLoads[name] === task) delete state.tabLoads[name];
    }
  }

  function dismissQuestionBatchReview() {
    query.delete("batchId");
    const next = new URL(window.location.href);
    next.searchParams.delete("batchId");
    history.replaceState(null, "", next);
    state.questionReviewBatch = null;
    renderQuestionBatchReview();
    document.getElementById("ctf-library")?.scrollIntoView({block: "start", behavior: "auto"});
  }

  async function retryQuestionBatchItem(itemIndex, trigger) {
    const batch = state.questionReviewBatch;
    if (!batch || trigger?.disabled) return;
    const retryAll = itemIndex == null;
    if (trigger) {
      trigger.disabled = true;
      trigger.setAttribute("aria-busy", "true");
    }
    try {
      const endpoint = retryAll
        ? `/teaching/generation-batches/${encodeURIComponent(batch.id)}/retry-failed`
        : `/teaching/generation-batches/${encodeURIComponent(batch.id)}/items/${Number(itemIndex)}/retry`;
      const data = unwrap(await api.json("POST", endpoint, {idempotencyKey: `${Date.now()}-${retryAll ? "all" : Number(itemIndex)}`}));
      state.questionReviewBatch = data.batch || batch;
      renderQuestionBatchReview();
      await loadQuestionContent();
      showNotice(retryAll ? "失败题目已重新进入独立任务队列。" : `第 ${Number(itemIndex)} 道题已重新进入原任务。`, "success");
    } catch (error) {
      showNotice(error.message || "题目重试失败。", "danger");
    } finally {
      if (trigger?.isConnected) {
        trigger.disabled = false;
        trigger.removeAttribute("aria-busy");
      }
    }
  }

  async function selectQuestionBatchDrafts() {
    const draftIds = (state.questionReviewBatch?.items || []).map(item => String(item.draftId || "")).filter(Boolean);
    if (!draftIds.length) return;
    if (!state.questionManagement) await setQuestionManagement(true);
    state.selectedQuestionDraftIds = new Set(draftIds);
    renderChallenges();
    syncQuestionManagementUi();
    elements.questionManagementBar?.scrollIntoView({block: "start", behavior: "auto"});
  }

  function questionBrowseRow(item) {
    const title = item.title || "未命名题目";
    const isDraft = item.kind === "draft";
    const stateName = String(item.state || item.status || "draft").toLowerCase();
    const meta = [
      item.moduleName,
      item.required ? "必修题" : "选修题",
      exerciseModeLabel(item.exerciseMode),
      isDraft ? `版本 ${Number(item.revision || 1)}` : "课程题目",
      item.ownerName,
      item.updated ? `${formatDate(item.updated, true)}更新` : "",
    ].filter(Boolean).join(" · ");
    const main = isDraft
      ? `<button class="cs-managed-main" type="button" data-open-question-draft="${escape(item.draftId || item.id)}">
          <span><i class="fas fa-file-alt" aria-hidden="true"></i></span>
          <span><strong>${escape(title)}</strong><small>${escape(meta)}</small><p>${escape(item.summary || "暂无题目摘要")}</p></span>
          <em>审阅草稿 <i class="fas fa-arrow-right" aria-hidden="true"></i></em>
        </button>`
      : `<a class="cs-managed-main" href="${escape(item.href || "#")}">
          <span><i class="fas fa-flag" aria-hidden="true"></i></span>
          <span><strong>${escape(title)}</strong><small>${escape(meta)}</small><p>${escape(item.summary || "暂无题目摘要")}</p></span>
          <em>打开题目 <i class="fas fa-arrow-right" aria-hidden="true"></i></em>
        </a>`;
    return `<article class="cs-challenge-row cs-question-unified-row is-managed is-${escape(questionStateTone(stateName))}" data-question-item-id="${escape(item.id)}">
      ${main}
      <span class="cs-question-state is-${escape(questionStateTone(stateName))}">${escape(statusLabel(stateName))}</span>
    </article>`;
  }

  function questionDraftManagementRow(item) {
    const title = item.title || "未命名题目草稿";
    const draftId = String(item.draftId || item.id);
    const selected = state.selectedQuestionDraftIds.has(draftId);
    return `<article class="cs-challenge-row cs-question-unified-row is-managed is-question-managed is-draft" data-question-item-id="${escape(item.id)}" data-question-draft-id="${escape(draftId)}" data-question-draft-module="${Number(item.moduleIndex)}">
      <button class="cs-question-drag-handle" type="button" draggable="true" aria-label="拖动“${escape(title)}”移动到其他章节" title="拖动到其他章节"><i class="fas fa-grip-vertical" aria-hidden="true"></i></button>
      <label class="cs-question-batch-select" title="选择“${escape(title)}”进行批量操作">
        <input type="checkbox" data-question-draft-select="${escape(draftId)}" aria-label="选择未发布题目“${escape(title)}”"${selected ? " checked" : ""}>
        <span aria-hidden="true"><i class="fas fa-check"></i></span>
      </label>
      <button class="cs-managed-main" type="button" data-open-question-draft="${escape(item.draftId || item.id)}">
        <span><i class="fas fa-file-alt" aria-hidden="true"></i></span>
        <span><strong>${escape(title)}</strong><small>未发布 · ${escape(statusLabel(item.state || item.status))} · 版本 ${Number(item.revision || 1)}</small></span>
        <em>审阅草稿 <i class="fas fa-arrow-right" aria-hidden="true"></i></em>
      </button>
      ${managementButtons("draft", item.draftId || item.id, title, {"module-index": item.moduleIndex})}
    </article>`;
  }

  function renderChallenges() {
    const modules = state.course.modules || [];
    syncQuestionModuleFilter(modules);
    syncContentModuleFilters(modules);
    renderQuestionCountSummary();
    const filters = questionFilterValues();
    const hasFilters = Boolean(filters.q || filters.status || filters.moduleIndex !== "" || filters.required || filters.mode);
    if (!state.questionLoaded && !state.questionManagement) {
      elements.challengeList.innerHTML = '<div class="hub-loading is-inline"><span></span><p>正在汇总草稿与已发布题目…</p></div>';
      if (elements.questionResultCount) elements.questionResultCount.textContent = "正在读取";
      renderQuestionPagination();
      syncQuestionManagementUi();
      return;
    }

    if (state.questionManagement) {
      const allEntries = modules.flatMap(module => (module.challenges || []).map((challenge, position) => ({module, challenge, position})));
      const draftsByModule = new Map(modules.map(module => [Number(module.index), []]));
      state.questionItems.filter(item => item.kind === "draft").forEach(item => {
        draftsByModule.get(Number(item.moduleIndex))?.push(item);
      });
      if (elements.questionResultCount) elements.questionResultCount.textContent = `${Number(state.questionCounts.total || allEntries.length)} 道`;
      if (!modules.length) {
        elements.challengeList.innerHTML = '<div class="cs-empty">课程还没有章节。请先建立课程结构，再进入管理模式整理题目。</div>';
      } else {
        elements.challengeList.innerHTML = modules.map(module => {
          const entries = allEntries.filter(entry => Number(entry.module.index) === Number(module.index));
          const challengeRows = entries.map(({challenge, position}) => {
            const challengeIndex = Number.isFinite(Number(challenge.index)) ? Number(challenge.index) : position;
            challenge.index = challengeIndex;
            challenge.moduleIndex = Number(module.index);
            const key = questionKey(module.index, challengeIndex);
            return `<article class="cs-challenge-row is-managed is-question-managed" data-question-key="${key}">
              <button class="cs-question-drag-handle" type="button" draggable="true" aria-label="拖动“${escape(challenge.name || "未命名实践题")}”调整顺序或章节" title="拖动调整顺序或章节"><i class="fas fa-grip-vertical" aria-hidden="true"></i></button>
              <a class="cs-managed-main" href="${escape(challenge.url || `/${state.course.referenceId}/${module.id}/${challenge.id}`)}">
                <span><i class="fas fa-flag" aria-hidden="true"></i></span>
                <span><strong>${escape(challenge.name || "未命名实践题")}</strong><small>已发布 · ${challenge.required ? "必修题" : "选修题"}${challenge.exerciseMode ? ` · ${escape(exerciseModeLabel(challenge.exerciseMode))}` : ""}</small></span>
                <em>打开题目 <i class="fas fa-arrow-right" aria-hidden="true"></i></em>
              </a>
              ${managementButtons("challenge", challenge.id, challenge.name || "未命名实践题", {"module-id": module.id, "module-index": module.index})}
            </article>`;
          }).join("");
          const draftRows = (draftsByModule.get(Number(module.index)) || []).map(questionDraftManagementRow).join("");
          const hasPublished = Boolean(entries.length);
          return `<section class="cs-surface cs-challenge-group is-question-management" data-module-id="${escape(module.id)}" data-module-index="${Number(module.index)}">
            <header><div><span class="cs-eyebrow">章节 ${Number(module.index) + 1}</span><h2>${escape(module.name || "未命名章节")}</h2></div><span class="cs-chapter-drop-hint"><i class="fas fa-arrow-down" aria-hidden="true"></i>可拖入已发布题目</span></header>
            <div class="cs-challenge-dropzone" data-question-dropzone aria-label="${escape(module.name || "未命名章节")}题目列表">${challengeRows}<div class="cs-question-empty-drop"${hasPublished ? " hidden" : ""}><i class="fas fa-arrow-down" aria-hidden="true"></i><span>拖动已发布题目到此章节</span></div>${draftRows}</div>
          </section>`;
        }).join("");
      }
    } else {
      const groups = new Map(modules.map(module => [Number(module.index), {module, items: []}]));
      const unassigned = {module: {index: null, id: "", name: "未分配章节"}, items: []};
      state.questionItems.forEach(item => {
        const group = item.moduleIndex == null ? unassigned : groups.get(Number(item.moduleIndex));
        (group || unassigned).items.push(item);
      });
      const visibleGroups = [...groups.values(), unassigned].filter(group => group.items.length);
      initializeQuestionChapters(visibleGroups);
      const total = Number(state.questionPaging.total || 0);
      const overall = Number(state.questionCounts.total || 0);
      if (elements.questionResultCount) elements.questionResultCount.textContent = total === overall ? `${total} 道` : `${total} / ${overall} 道`;
      if (!modules.length) {
        elements.challengeList.innerHTML = '<div class="cs-empty">课程还没有章节。请先建立课程结构，再使用页首“新建题目”创建内容。</div>';
      } else if (!visibleGroups.length) {
        elements.challengeList.innerHTML = `<div class="cs-empty cs-empty-with-action"><span>${hasFilters ? "没有符合筛选条件的题目。" : "这门课程还没有题目或草稿，请使用页首“新建题目”开始。"}</span>${hasFilters ? '<button class="hub-button is-secondary" type="button" data-clear-question-filters>清除筛选</button>' : ""}</div>`;
      } else {
        elements.challengeList.innerHTML = visibleGroups.map(group => {
          const module = group.module;
          const chapterLabel = module.index == null ? "尚未归类" : `章节 ${Number(module.index) + 1}`;
          const key = chapterKey(module.index);
          const expanded = state.questionExpandedModules.has(key);
          const chapterAction = `${module.id ? `<a href="/${encodeURIComponent(state.course.referenceId)}/${encodeURIComponent(module.id)}">打开章节</a>` : ""}<button class="cs-chapter-toggle" type="button" data-workspace-chapter="questions" data-chapter-key="${escape(key)}" aria-expanded="${expanded ? "true" : "false"}"><span>${expanded ? "收起" : "展开"}</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button>`;
          return `<section class="cs-surface cs-challenge-group${expanded ? "" : " is-collapsed"}" data-module-id="${escape(module.id || "")}" data-module-index="${module.index == null ? "" : Number(module.index)}">
            <header><div><span class="cs-eyebrow">${escape(chapterLabel)}</span><h2>${escape(module.name || "未分配章节")}</h2></div><span>${chapterAction}</span></header>
            <div class="cs-challenge-dropzone" aria-label="${escape(module.name || "未分配章节")}题目列表"${expanded ? "" : " hidden"}>${group.items.map(questionBrowseRow).join("")}</div>
          </section>`;
        }).join("");
      }
    }
    renderQuestionPagination();
    syncQuestionDropzonePlaceholders();
    syncQuestionManagementUi();
    const requestedModule = query.get("module");
    if (requestedModule !== null) {
      const target = Array.from(document.querySelectorAll("[data-module-index]")).find(item => item.dataset.moduleIndex === requestedModule);
      if (target) window.setTimeout(() => target.scrollIntoView({block: "start"}), 0);
    }
  }

  function setCourseWorkspaceInert(active, exception) {
    if (!elements.courseDetailView) return;
    const exceptions = new Set(Array.isArray(exception) ? exception : [exception].filter(Boolean));
    Array.from(elements.courseDetailView.children).forEach(child => {
      if (exceptions.has(child)) return;
      if (active) child.setAttribute("inert", "");
      else child.removeAttribute("inert");
    });
  }

  function trapDialogFocus(event, panel, close) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !panel) return;
    const focusable = Array.from(panel.querySelectorAll(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )).filter(node => !node.hidden && node.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusable.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function filterDrawerForKind(kind) {
    return Array.from(document.querySelectorAll("[data-filter-drawer]")).find(
      drawer => drawer.dataset.filterDrawer === String(kind || ""),
    ) || null;
  }

  function filterDrawerLabel(kind) {
    return ({
      materials: "课程资料筛选与排序",
      courseware: "课件与教案筛选与排序",
      questions: "课程题目筛选与排序",
      demos: "课程演示筛选与排序",
    })[kind] || "筛选与排序";
  }

  function closeFilterDrawer(options) {
    if (!state.filterDrawerKind) return;
    const restoreFocus = options?.restoreFocus !== false;
    const drawer = filterDrawerForKind(state.filterDrawerKind);
    const trigger = state.filterDrawerReturnFocus;
    const origin = state.filterDrawerOrigin;
    if (drawer) {
      drawer.classList.remove("is-mobile-open");
      drawer.removeAttribute("role");
      drawer.removeAttribute("aria-modal");
      drawer.removeAttribute("aria-label");
      if (origin?.parent?.isConnected) {
        if (origin.nextSibling?.parentNode === origin.parent) origin.parent.insertBefore(drawer, origin.nextSibling);
        else origin.parent.appendChild(drawer);
      }
      drawer.hidden = Boolean(origin?.hidden);
    }
    if (elements.filterBackdrop) elements.filterBackdrop.hidden = true;
    document.body.classList.remove("is-filter-drawer-open");
    document.querySelectorAll("[data-filter-trigger]").forEach(button => button.setAttribute("aria-expanded", "false"));
    setCourseWorkspaceInert(false);
    state.filterDrawerKind = null;
    state.filterDrawerReturnFocus = null;
    state.filterDrawerOrigin = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
  }

  function openFilterDrawer(kind, trigger) {
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 580px)").matches) return;
    if ((kind === "questions" && state.questionManagement) || (kind === "demos" && state.demoManagement)) return;
    const drawer = filterDrawerForKind(kind);
    if (!drawer || !elements.courseDetailView || !elements.filterBackdrop) return;
    if (state.filterDrawerKind) closeFilterDrawer({restoreFocus: false});
    state.filterDrawerKind = kind;
    state.filterDrawerReturnFocus = trigger || null;
    state.filterDrawerOrigin = {parent: drawer.parentNode, nextSibling: drawer.nextSibling, hidden: drawer.hidden};
    elements.courseDetailView.appendChild(drawer);
    drawer.hidden = false;
    drawer.classList.add("is-mobile-open");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", filterDrawerLabel(kind));
    elements.filterBackdrop.hidden = false;
    document.body.classList.add("is-filter-drawer-open");
    trigger?.setAttribute("aria-expanded", "true");
    setCourseWorkspaceInert(true, [drawer, elements.filterBackdrop]);
    window.requestAnimationFrame(() => {
      const focusTarget = drawer.querySelector("input[type='search'], select, button:not([disabled])");
      (focusTarget || drawer).focus();
    });
  }

  function resetFilterDrawer(kind) {
    if (kind === "questions") {
      [elements.questionSearch, elements.questionStatus, elements.questionModule, elements.questionRequired, elements.questionMode].forEach(node => {
        if (node) node.value = "";
      });
      if (elements.questionSort) elements.questionSort.value = "course_order";
      void loadQuestionContent({resetPage: true});
      return;
    }
    clearContentFilters(kind);
  }

  function handleFilterDrawerKeydown(event) {
    if (!state.filterDrawerKind) return;
    const drawer = filterDrawerForKind(state.filterDrawerKind);
    trapDialogFocus(event, drawer, closeFilterDrawer);
  }

  function updateQuestionSelectionUrl(draftId) {
    const next = new URL(window.location.href);
    if (draftId) {
      next.searchParams.set("selectedId", draftId);
      query.set("selectedId", draftId);
    } else {
      next.searchParams.delete("selectedId");
      query.delete("selectedId");
    }
    history.replaceState(null, "", next);
  }

  function renderQuestionDraftDetail(draft) {
    const spec = draft.spec && typeof draft.spec === "object" ? draft.spec : {};
    const validation = draft.validation && typeof draft.validation === "object" ? draft.validation : {};
    const status = String(draft.status || "DRAFT").toUpperCase();
    const validationStatus = String(validation.status || "PENDING").toUpperCase();
    const active = ["BUILDING", "GENERATING", "QUEUED", "RUNNING", "VALIDATING"].includes(status);
    const publishReady = ["PASS", "PASSED"].includes(validationStatus) && !active;
    const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
    const checks = Array.isArray(validation.checks) ? validation.checks.slice(0, 8) : [];
    const objectiveMarkup = objectives.length
      ? `<ul>${objectives.map(item => `<li>${escape(typeof item === "string" ? item : item.name || item.label || item.objective || "学习目标")}</li>`).join("")}</ul>`
      : '<p class="cs-question-detail-empty">尚未填写学习目标。</p>';
    const checkMarkup = checks.length
      ? checks.map(item => {
          const checkStatus = String(item.status || "PENDING").toUpperCase();
          const tone = ["PASS", "PASSED"].includes(checkStatus) ? "success" : ["WARN", "WARNING"].includes(checkStatus) ? "warning" : ["BLOCK", "FAIL", "FAILED"].includes(checkStatus) ? "danger" : "neutral";
          return `<li><span class="is-${tone}">${escape(["PASS", "PASSED"].includes(checkStatus) ? "通过" : ["WARN", "WARNING"].includes(checkStatus) ? "提醒" : ["BLOCK", "FAIL", "FAILED"].includes(checkStatus) ? "阻断" : "待检查")}</span><div><strong>${escape(item.name || item.phase || item.category || "发布检查")}</strong><p>${escape(item.message || item.summary || "检查结果已记录。")}</p></div></li>`;
        }).join("")
      : '<li class="is-empty">尚无逐项检查结果；可以启动一次发布前检查。</li>';
    elements.questionDrawerTitle.textContent = spec.name || draft.brief || "未命名题目草稿";
    elements.questionDrawerSubtitle.textContent = `${statusLabel(status)} · 版本 ${Number(draft.revision || 1)} · 更新于 ${formatDate(draft.updated, true)}`;
    elements.questionDrawerBody.innerHTML = `
      <section class="cs-question-detail-summary">
        <span class="cs-question-state is-${escape(questionStateTone(status))}">${escape(statusLabel(status))}</span>
        <div><small>发布前检查</small><strong>${escape(["PASS", "PASSED"].includes(validationStatus) ? "已通过" : ["WARN", "WARNING"].includes(validationStatus) ? "有提醒" : ["BLOCK", "FAIL", "FAILED"].includes(validationStatus) ? "未通过" : "尚未完成")}</strong></div>
        <div><small>练习方式</small><strong>${escape(exerciseModeLabel(spec.exerciseMode || spec.mode) || "在线实操")}</strong></div>
        <div><small>难度级别</small><strong>${escape(spec.difficulty || draft.level || "未设置")}</strong></div>
      </section>
      <section class="cs-question-detail-section"><span class="hub-kicker">学生可见内容</span><h3>题目概述</h3><p>${escape(spec.description || draft.brief || "尚未填写题目描述。")}</p></section>
      <section class="cs-question-detail-section"><span class="hub-kicker">教学目标</span><h3>希望学生掌握什么</h3>${objectiveMarkup}</section>
      <section class="cs-question-detail-section"><span class="hub-kicker">质量证据</span><h3>发布前检查</h3><ul class="cs-question-checks">${checkMarkup}</ul></section>
      <p class="cs-question-private-note"><i class="fas fa-lock" aria-hidden="true"></i>这里只展示教师决策所需摘要；标准答案、验证密钥、模型提示词和内部运行日志不会出现在课程列表或学生预览中。</p>
      <div class="cs-question-detail-actions" role="group" aria-label="题目草稿操作">
        <button class="hub-button is-secondary" type="button" data-question-action="preview" data-draft-id="${escape(draft.id)}"><i class="fas fa-eye" aria-hidden="true"></i>学生视图</button>
        <button class="hub-button is-secondary" type="button" data-question-action="revise" data-draft-id="${escape(draft.id)}"${active ? " disabled" : ""}><i class="fas fa-pen" aria-hidden="true"></i>提出修订</button>
        <button class="hub-button is-secondary" type="button" data-question-action="validate" data-draft-id="${escape(draft.id)}"${active ? " disabled" : ""}><i class="fas fa-shield-alt" aria-hidden="true"></i>重新检查</button>
        <button class="hub-button is-primary" type="button" data-question-action="publish" data-draft-id="${escape(draft.id)}"${publishReady ? "" : " disabled"} title="${publishReady ? "发布到当前课程" : "通过发布前检查后才能发布"}"><i class="fas fa-paper-plane" aria-hidden="true"></i>发布题目</button>
        <button class="hub-button is-danger" type="button" data-question-action="delete" data-draft-id="${escape(draft.id)}"${active ? " disabled" : ""}><i class="fas fa-trash-alt" aria-hidden="true"></i>删除草稿</button>
      </div>`;
  }

  function renderQuestionStudentPreview(preview) {
    const question = preview.question && typeof preview.question === "object" ? preview.question : {};
    const objectives = Array.isArray(question.objectives) ? question.objectives : [];
    const tags = Array.isArray(question.tags) ? question.tags : [];
    const interfaces = Array.isArray(question.interfaces) ? question.interfaces : [];
    const objectiveMarkup = objectives.length
      ? `<ol>${objectives.map(item => `<li>${escape(typeof item === "string" ? item : item.name || item.label || item.objective || "学习目标")}</li>`).join("")}</ol>`
      : '<p class="cs-question-detail-empty">本题暂未列出学习目标。</p>';
    const tagMarkup = tags.length
      ? `<div class="cs-question-preview-tags">${tags.map(item => `<span>${escape(item)}</span>`).join("")}</div>`
      : "";
    const interfaceMarkup = interfaces.length
      ? interfaces.map(item => escape(typeof item === "string" ? item : item.name || item.label || "在线环境")).join("、")
      : "在线实操环境";
    elements.questionDrawerTitle.textContent = question.name || "未命名题目";
    elements.questionDrawerSubtitle.textContent = `学生视角预览 · ${preview.course?.name || state.course?.name || "当前课程"} / ${preview.module?.name || "未分章"}`;
    elements.questionDrawerBody.innerHTML = `
      <section class="cs-question-preview-banner"><span><i class="fas fa-eye" aria-hidden="true"></i></span><div><strong>学生视角预览</strong><p>以下内容使用与学生端相同的安全数据边界；草稿尚未因此对学生开放。</p></div></section>
      <article class="cs-question-student-preview">
        <header>
          <span class="hub-kicker">${escape(question.required ? "必修题" : "选修题")} · ${escape(exerciseModeLabel(question.exerciseMode) || "在线实操")}</span>
          <h2>${escape(question.name || "未命名题目")}</h2>
          <div class="cs-question-preview-meta"><span>${escape(question.category || "综合实践")}</span><span>难度 ${escape(question.difficulty || "未设置")}</span><span>${interfaceMarkup}</span></div>
          ${tagMarkup}
        </header>
        <section><h3>任务说明</h3><p>${escape(question.description || "本题暂未填写任务说明。")}</p></section>
        <section><h3>学习目标</h3>${objectiveMarkup}</section>
        <div class="cs-question-preview-start" aria-disabled="true"><i class="fas fa-desktop" aria-hidden="true"></i><div><strong>进入题目后启动练习环境</strong><p>预览模式不会创建学生环境，也不会记录学习数据。</p></div></div>
      </article>
      <p class="cs-question-private-note is-safe"><i class="fas fa-shield-alt" aria-hidden="true"></i>标准答案、动态 Flag、教师备注、生成过程和环境管理信息均未载入此视图。</p>
      <div class="cs-question-detail-actions" role="group" aria-label="学生预览操作">
        <button class="hub-button is-secondary" type="button" data-question-action="back" data-draft-id="${escape(preview.id)}"><i class="fas fa-arrow-left" aria-hidden="true"></i>返回教师详情</button>
      </div>`;
  }

  async function loadQuestionDraftIntoDrawer(draftId) {
    if (!draftId || !elements.questionDrawerBody) return null;
    elements.questionDrawerBody.innerHTML = '<div class="hub-loading is-inline"><span></span><p>正在读取题目草稿…</p></div>';
    try {
      const payload = await api.request(`/learning/drafts/${encodeURIComponent(draftId)}`);
      if (!payload || payload.success !== true || !payload.draft) {
        throw new Error(api.errorMessage(payload, "题目草稿读取失败。"));
      }
      if (state.selectedQuestionDraftId !== draftId) return null;
      renderQuestionDraftDetail(payload.draft);
      return payload.draft;
    } catch (error) {
      if (state.selectedQuestionDraftId === draftId) {
        elements.questionDrawerTitle.textContent = "题目草稿不可用";
        elements.questionDrawerSubtitle.textContent = "未能读取当前版本";
        elements.questionDrawerBody.innerHTML = `<div class="cs-empty cs-empty-with-action"><span>${escape(error.message || "题目草稿读取失败。")}</span><button class="hub-button is-secondary" type="button" data-retry-question-draft="${escape(draftId)}"><i class="fas fa-sync-alt" aria-hidden="true"></i>重新加载</button></div>`;
      }
      return null;
    }
  }

  async function openQuestionDrawer(draftId, trigger) {
    if (!draftId || !elements.questionDrawer) return;
    closeStudentDrawer();
    state.selectedQuestionDraftId = draftId;
    state.questionDrawerReturnFocus = trigger || document.activeElement;
    elements.questionDrawer.hidden = false;
    elements.questionDrawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-question-drawer");
    setCourseWorkspaceInert(true, elements.questionDrawer);
    updateQuestionSelectionUrl(draftId);
    window.requestAnimationFrame(() => elements.questionDrawerPanel?.focus({preventScroll: true}));
    await loadQuestionDraftIntoDrawer(draftId);
  }

  function closeQuestionDrawer(options) {
    if (!elements.questionDrawer || elements.questionDrawer.hidden) return;
    elements.questionDrawer.hidden = true;
    elements.questionDrawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-question-drawer");
    setCourseWorkspaceInert(false);
    state.selectedQuestionDraftId = null;
    updateQuestionSelectionUrl("");
    const returnFocus = state.questionDrawerReturnFocus;
    state.questionDrawerReturnFocus = null;
    if ((!options || options.restoreFocus !== false) && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus({preventScroll: true});
    }
  }

  function setQuestionDrawerBusy(trigger, label) {
    if (!trigger) return;
    trigger.disabled = true;
    trigger.setAttribute("aria-busy", "true");
    trigger.dataset.originalLabel = trigger.innerHTML;
    trigger.innerHTML = `<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>${escape(label)}`;
  }

  function restoreQuestionDrawerButton(trigger) {
    if (!trigger) return;
    trigger.removeAttribute("aria-busy");
    trigger.disabled = false;
    if (trigger.dataset.originalLabel) trigger.innerHTML = trigger.dataset.originalLabel;
  }

  async function runQuestionDrawerAction(action, draftId, trigger) {
    if (!draftId || !action || trigger?.disabled) return;
    if (action === "back") {
      await loadQuestionDraftIntoDrawer(draftId);
      window.requestAnimationFrame(() => elements.questionDrawerBody?.querySelector('[data-question-action="preview"]')?.focus({preventScroll: true}));
      return;
    }
    if (action === "preview") {
      setQuestionDrawerBusy(trigger, "正在打开…");
      try {
        const payload = await api.request(`/learning/drafts/${encodeURIComponent(draftId)}/student-preview`);
        const preview = unwrap(payload).preview;
        if (!preview || preview.studentSafe !== true) throw new Error("学生安全预览不可用。");
        renderQuestionStudentPreview(preview);
        window.requestAnimationFrame(() => elements.questionDrawerBody?.querySelector('[data-question-action="back"]')?.focus({preventScroll: true}));
      } catch (error) {
        showNotice(error.message || "无法打开学生视图。", "danger");
        restoreQuestionDrawerButton(trigger);
      }
      return;
    }
    if (action === "delete") {
      const confirmed = await window.AISecEduUI.confirm(
        "删除后该未发布题目会从课程题目列表彻底消失；同批次的其他题目不受影响。",
        {title: "删除题目草稿", confirmLabel: "确认删除", confirmStyle: "danger"},
      );
      if (!confirmed) return;
    }
    let revisionMessage = "";
    if (action === "revise") {
      revisionMessage = await window.AISecEduUI.prompt("说明要修改的内容，智能体只会修订当前这一道题。", {
        title: "修订题目草稿",
        inputLabel: "修订要求",
        value: "",
        maxLength: 12000,
        confirmLabel: "开始修订",
      });
      if (revisionMessage === null) return;
      revisionMessage = revisionMessage.trim();
      if (!revisionMessage) {
        showNotice("请填写具体修订要求。", "danger");
        return;
      }
    }
    const busyLabels = {delete: "正在删除…", revise: "正在启动…", validate: "正在启动…", publish: "正在发布…"};
    setQuestionDrawerBusy(trigger, busyLabels[action] || "正在处理…");
    if (elements.questionDrawerSubtitle) elements.questionDrawerSubtitle.textContent = busyLabels[action] || "正在处理…";
    try {
      let payload;
      if (action === "delete") payload = await api.json("DELETE", `/learning/drafts/${encodeURIComponent(draftId)}`, {});
      if (action === "revise") payload = await api.json("POST", `/learning/drafts/${encodeURIComponent(draftId)}`, {message: revisionMessage});
      if (action === "validate") payload = await api.json("POST", `/learning/drafts/${encodeURIComponent(draftId)}/validate`, {});
      if (action === "publish") payload = await api.json("POST", `/learning/drafts/${encodeURIComponent(draftId)}/publish`, {});
      if (!payload || payload.success !== true) throw new Error(api.errorMessage(payload, "题目操作失败。"));
      if (action === "delete") {
        closeQuestionDrawer({restoreFocus: false});
        await loadQuestionContent({resetPage: true});
        showNotice("未发布题目已删除。", "success");
        window.AISecEduUI?.notify("未发布题目已删除。", "success");
        return;
      }
      if (action === "publish") {
        const reference = state.course.referenceId || state.course.id;
        closeQuestionDrawer({restoreFocus: false});
        await loadCourse(reference);
        activateTab("questions", true);
        showNotice("题目已发布，草稿与课程状态已自动刷新。", "success");
        window.AISecEduUI?.notify("题目发布成功。", "success");
        return;
      }
      await loadQuestionContent({resetPage: true});
      elements.questionDrawerSubtitle.textContent = action === "revise" ? "修订任务已启动，可在任务中心继续跟踪" : "发布前检查已启动，可在任务中心继续跟踪";
      window.AISecEduUI?.notify(action === "revise" ? "题目修订任务已启动。" : "发布前检查已启动。", "success");
      window.setTimeout(() => {
        if (state.selectedQuestionDraftId === draftId) void loadQuestionDraftIntoDrawer(draftId);
      }, 1500);
    } catch (error) {
      showNotice(error.message || "题目操作失败。", "danger");
      if (elements.questionDrawerSubtitle) elements.questionDrawerSubtitle.textContent = error.message || "操作失败，请重试";
      restoreQuestionDrawerButton(trigger);
    }
  }

  function toggleAllQuestionDrafts() {
    const drafts = questionDraftRows();
    const selected = selectedQuestionDrafts();
    if (drafts.length && selected.length === drafts.length) {
      state.selectedQuestionDraftIds.clear();
    } else {
      drafts.forEach(item => state.selectedQuestionDraftIds.add(String(item.draftId || item.id)));
    }
    syncQuestionBatchControls();
  }

  async function runQuestionBatchAction(action, trigger) {
    if (action === "select-all") {
      toggleAllQuestionDrafts();
      return;
    }
    if (state.questionBulkBusy || !["revise", "publish"].includes(action)) return;
    const drafts = selectedQuestionDrafts();
    if (!drafts.length) {
      showNotice("请先勾选至少一道未发布题目。", "warning");
      return;
    }
    let revisionMessage = "";
    if (action === "revise") {
      revisionMessage = await window.AISecEduUI.prompt(
        `填写共同修订要求。系统会为已选的 ${drafts.length} 道题分别创建独立修订任务。`,
        {
          title: "批量修订题目",
          inputLabel: "共同修订要求",
          value: "",
          maxLength: 12000,
          confirmLabel: `启动 ${drafts.length} 个任务`,
        },
      );
      if (revisionMessage === null) return;
      revisionMessage = revisionMessage.trim();
      if (!revisionMessage) {
        showNotice("请填写具体修订要求。", "danger");
        return;
      }
    }
    if (action === "publish") {
      const confirmed = await window.AISecEduUI.confirm(
        `即将逐题发布 ${drafts.length} 道未发布题目到“${state.course.name || "当前课程"}”。每道题会独立检查发布条件；不满足条件的题目会保留为草稿。`,
        {title: "批量发布题目", confirmLabel: `发布 ${drafts.length} 道题`, confirmStyle: "primary"},
      );
      if (!confirmed) return;
    }
    state.questionBulkBusy = true;
    state.questionBulkStatus = action === "publish" ? `准备发布 0/${drafts.length}` : `准备修订 0/${drafts.length}`;
    syncQuestionManagementUi();
    if (trigger) trigger.setAttribute("aria-busy", "true");
    window.AISecEduUI?.notify(
      action === "publish" ? `正在逐题发布 ${drafts.length} 道题…` : `正在创建 ${drafts.length} 个独立修订任务…`,
      "progress",
      {duration: 12000, dedupeKey: `question-batch-${action}`},
    );
    const results = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const item = drafts[index];
      const draftId = String(item.draftId || item.id);
      state.questionBulkStatus = action === "publish"
        ? `正在发布 ${index + 1}/${drafts.length}`
        : `正在创建任务 ${index + 1}/${drafts.length}`;
      syncQuestionManagementUi();
      try {
        const path = action === "publish"
          ? `/learning/drafts/${encodeURIComponent(draftId)}/publish`
          : `/learning/drafts/${encodeURIComponent(draftId)}`;
        const payload = await api.json("POST", path, action === "publish" ? {} : {message: revisionMessage});
        if (!payload || payload.success !== true) throw new Error(api.errorMessage(payload, "题目操作失败。"));
        results.push({id: draftId, title: item.title || "未命名题目", success: true});
      } catch (error) {
        results.push({id: draftId, title: item.title || "未命名题目", success: false, error: error.message || "操作失败"});
      }
    }
    const succeeded = results.filter(item => item.success);
    const failed = results.filter(item => !item.success);
    state.selectedQuestionDraftIds.clear();
    state.questionBulkStatus = failed.length
      ? `${succeeded.length} 成功 · ${failed.length} 需处理`
      : `${succeeded.length} 道已处理`;
    try {
      if (action === "publish" && succeeded.length) {
        await loadCourse(state.course.referenceId || state.course.id);
        activateTab("questions", true);
      } else {
        await loadQuestionContent({resetPage: true, pageSize: state.questionManagement ? 100 : 30});
      }
      const failedSummary = failed.slice(0, 3).map(item => `${item.title}：${item.error}`).join("；");
      if (!failed.length) {
        const message = action === "publish"
          ? `${succeeded.length} 道题目已发布，课程状态已自动刷新。`
          : `已为 ${succeeded.length} 道题分别启动独立修订任务。`;
        showNotice(message, "success");
        window.AISecEduUI?.notify(message, "success", {dedupeKey: `question-batch-${action}-complete`});
      } else if (succeeded.length) {
        const message = `${succeeded.length} 道处理成功，${failed.length} 道未处理。${failedSummary}`;
        showNotice(message, "warning");
        window.AISecEduUI?.notify(message, "warning", {duration: 7600, dedupeKey: `question-batch-${action}-partial`});
      } else {
        const message = `所选题目均未处理。${failedSummary}`;
        showNotice(message, "danger");
        window.AISecEduUI?.notify(message, "danger", {duration: 7600, dedupeKey: `question-batch-${action}-failed`});
      }
    } finally {
      state.questionBulkBusy = false;
      if (trigger) trigger.removeAttribute("aria-busy");
      syncQuestionManagementUi();
    }
  }

  function learningScopeValues() {
    return {
      studentId: elements.learningStudent?.value || "",
      moduleIndex: elements.learningModule?.value || "",
      challengeId: elements.learningQuestion?.value || "",
      timeRange: elements.learningRange?.value || "12w",
    };
  }

  function learningScopeParams(values) {
    const scope = values || learningScopeValues();
    const params = new URLSearchParams({timeRange: scope.timeRange || "12w"});
    if (scope.studentId) params.set("studentId", scope.studentId);
    if (scope.moduleIndex !== "") params.set("moduleIndex", scope.moduleIndex);
    if (scope.challengeId) params.set("challengeId", scope.challengeId);
    return params;
  }

  function learningTimeLabel(value) {
    return ({
      "7d": "过去 7 天",
      "30d": "过去 30 天",
      "90d": "过去 90 天",
      "12w": "过去 12 周",
      lifetime: "课程全部时间",
    })[value] || "过去 12 周";
  }

  function learningOptionValue(select, fallback) {
    const selected = select?.selectedOptions?.[0];
    return selected?.textContent?.trim() || fallback;
  }

  function renderLearningQuestionOptions(preferredValue) {
    if (!elements.learningQuestion) return;
    const base = state.learningBaseProgress || state.progress || {};
    const moduleValue = elements.learningModule?.value || "";
    const questions = (base.challengeDiagnostics || []).filter(item =>
      moduleValue === "" || String(item.moduleIndex) === moduleValue
    );
    const current = preferredValue == null ? elements.learningQuestion.value : String(preferredValue || "");
    elements.learningQuestion.innerHTML = '<option value="">全部题目</option>' + questions.map(item =>
      `<option value="${escape(item.id)}">${escape(item.moduleName || "未分章")} · ${escape(item.name || "未命名题目")}</option>`
    ).join("");
    elements.learningQuestion.value = Array.from(elements.learningQuestion.options).some(option => option.value === current) ? current : "";
  }

  function populateLearningScopeControls(values) {
    const base = state.learningBaseProgress || state.progress || {};
    const desired = values || learningScopeValues();
    if (elements.learningStudent) {
      elements.learningStudent.innerHTML = '<option value="">全班学生</option>' + (base.students || []).map(item =>
        `<option value="${Number(item.userId)}">${escape(item.name || `学生 ${item.userId}`)}</option>`
      ).join("");
      elements.learningStudent.value = Array.from(elements.learningStudent.options).some(option => option.value === String(desired.studentId || "")) ? String(desired.studentId || "") : "";
    }
    if (elements.learningModule) {
      elements.learningModule.innerHTML = '<option value="">全部章节</option>' + ((state.course && state.course.modules) || []).map(module =>
        `<option value="${Number(module.index)}">${escape(module.name || `章节 ${Number(module.index) + 1}`)}</option>`
      ).join("");
      elements.learningModule.value = Array.from(elements.learningModule.options).some(option => option.value === String(desired.moduleIndex ?? "")) ? String(desired.moduleIndex ?? "") : "";
    }
    renderLearningQuestionOptions(desired.challengeId);
    if (elements.learningRange) {
      const range = String(desired.timeRange || "12w");
      elements.learningRange.value = Array.from(elements.learningRange.options).some(option => option.value === range) ? range : "12w";
    }
  }

  function restoreLearningScopeFromUrl() {
    const current = new URL(window.location.href).searchParams;
    const values = {
      studentId: current.get("learningStudent") || "",
      moduleIndex: current.get("learningModule") || "",
      challengeId: current.get("learningQuestion") || "",
      timeRange: current.get("learningRange") || "12w",
    };
    populateLearningScopeControls(values);
    state.learningScopeInitialized = true;
    return learningScopeValues();
  }

  function syncLearningScopeUrl() {
    const values = learningScopeValues();
    const next = new URL(window.location.href);
    const mappings = {
      learningStudent: values.studentId,
      learningModule: values.moduleIndex,
      learningQuestion: values.challengeId,
      learningRange: values.timeRange,
    };
    Object.entries(mappings).forEach(([key, value]) => {
      if (value) {
        next.searchParams.set(key, value);
        query.set(key, value);
      } else {
        next.searchParams.delete(key);
        query.delete(key);
      }
    });
    history.replaceState(null, "", next);
  }

  function renderLearningScopeSummary() {
    if (!elements.learningScopeSummary) return;
    const values = learningScopeValues();
    const parts = [
      learningOptionValue(elements.learningStudent, "全班学生"),
      learningOptionValue(elements.learningModule, "全部章节"),
      learningOptionValue(elements.learningQuestion, "全部题目"),
      learningTimeLabel(values.timeRange),
    ];
    elements.learningScopeSummary.textContent = parts.join(" · ");
  }

  function boundedPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function riskView(level) {
    return ({
      high: {label: "优先干预", tone: "danger", icon: "fa-exclamation-triangle"},
      medium: {label: "持续关注", tone: "warning", icon: "fa-eye"},
      low: {label: "进展稳定", tone: "success", icon: "fa-check-circle"},
      unknown: {label: "证据不足", tone: "neutral", icon: "fa-question-circle"},
    })[level] || {label: "待判断", tone: "neutral", icon: "fa-question-circle"};
  }

  function activityRecency(item) {
    if (item.daysInactive == null) return "尚无活动";
    if (Number(item.daysInactive) === 0) return "今天有活动";
    if (Number(item.daysInactive) === 1) return "昨天有活动";
    return `${Number(item.daysInactive)} 天前`;
  }

  function filteredStudents() {
    const students = (state.progress && state.progress.students) || [];
    const search = String(document.getElementById("cs-student-search")?.value || "").trim().toLowerCase();
    const risk = document.getElementById("cs-student-risk-filter")?.value || "all";
    const evidence = document.getElementById("cs-student-evidence-filter")?.value || "all";
    return students.filter(item => {
      if (search && !String(item.name || "").toLowerCase().includes(search)) return false;
      if (risk !== "all" && item.riskLevel !== risk) return false;
      if (evidence !== "all" && item.evidenceLevel !== evidence) return false;
      if (state.studentCohortIds && !state.studentCohortIds.has(Number(item.userId))) return false;
      return true;
    });
  }

  function renderStudents() {
    const rows = filteredStudents();
    const table = document.getElementById("cs-student-table");
    const count = document.getElementById("cs-student-result-count");
    const clear = document.getElementById("cs-clear-cohort-filter");
    if (count) count.textContent = `${rows.length} 名学生`;
    if (clear) clear.hidden = !state.studentCohortIds;
    if (!table) return;
    table.innerHTML = rows.length ? rows.map(item => {
      const completion = Math.round(Number(item.verifiedCompletion || 0) * 100);
      const mastery = item.masteryScore == null ? null : Math.round(Number(item.masteryScore));
      const evidence = Math.round(Number(item.evidenceConfidence || 0));
      const risk = riskView(item.riskLevel);
      const weakSkills = (item.weakSkills || []).slice(0, 2);
      const weakCriteria = (item.weakCriteria || []).filter(gap => Number(gap.mastery) < 70).slice(0, 1);
      const weakMarkup = weakSkills.length
        ? weakSkills.map(skill => `<span>${escape(skill.label)} ${Math.round(Number(skill.mastery || 0))}%</span>`).join("")
        : weakCriteria.length
          ? `<span>${escape(weakCriteria[0].label)}</span>`
          : '<span class="is-muted">尚未形成能力评估</span>';
      const signals = item.activitySignals || {};
      return `<tr data-student-id="${Number(item.userId)}" tabindex="0" aria-label="查看${escape(item.name)}的学情详情">
        <td><span class="cs-student-identity"><strong>${escape(item.name)}</strong><em class="cs-risk-pill is-${risk.tone}"><i class="fas ${risk.icon}" aria-hidden="true"></i>${risk.label}</em>${(item.riskSignals || [])[0] ? `<small>${escape(item.riskSignals[0].label)}</small>` : ""}</span></td>
        <td>${mastery == null ? '<span class="cs-unobserved">未观测</span>' : `<span class="cs-metric-with-bar"><strong>${mastery}%</strong><span><i style="width:${boundedPercent(mastery)}%"></i></span><small>${(item.weakSkills || []).length} 个已评估维度</small></span>`}</td>
        <td><span class="cs-metric-with-bar"><strong>${completion}%</strong><span><i style="width:${boundedPercent(completion)}%"></i></span><small>${Number(item.requiredSolved || 0)} / ${Number(item.requiredTotal || 0)} 道必修题</small></span></td>
        <td><span class="cs-weak-tags">${weakMarkup}</span></td>
        <td><span class="cs-process-brief"><strong>${Number(item.attemptCount || 0)} 次尝试</strong><small>${Number(signals.failedCommands || 0)} 次失败 · ${Number(signals.resets || 0)} 次重置${item.averageProcessScore == null ? "" : ` · 过程 ${Math.round(Number(item.averageProcessScore))} 分`}</small></span></td>
        <td><span class="cs-evidence-meter is-${escape(item.evidenceLevel || "不足")}"><strong>${escape(item.evidenceLevel || "不足")} · ${evidence}%</strong><small>${Number(item.evidenceCount || 0)} 条过程事件</small></span></td>
        <td><span class="cs-last-activity"><strong>${escape(activityRecency(item))}</strong><small>${escape(formatDate(item.lastActivity, true))}</small></span></td>
        <td><button class="cs-open-student" type="button" data-open-student="${Number(item.userId)}" aria-label="打开${escape(item.name)}的学情详情"><i class="fas fa-arrow-right" aria-hidden="true"></i></button></td>
      </tr>`;
    }).join("") : '<tr><td colspan="8"><div class="cs-empty"><strong>没有匹配的学生</strong><br>可清除筛选，或等待学生产生可核验的学习证据。</div></td></tr>';
  }

  function renderLearningTimeline() {
    const target = document.getElementById("cs-learning-timeline");
    if (!target) return;
    const rows = (state.progress && state.progress.timeline) || [];
    const meta = (state.progress && state.progress.timelineMeta) || {};
    const maximumEvidence = Math.max(1, ...rows.map(item => Number(item.evidence || 0)));
    const maximumSolves = Math.max(1, ...rows.map(item => Number(item.solves || 0)));
    const totalEvidence = rows.reduce((sum, item) => sum + Number(item.evidence || 0), 0);
    const totalSolves = rows.reduce((sum, item) => sum + Number(item.solves || 0), 0);
    const rangeLabel = meta.label || learningTimeLabel(learningScopeValues().timeRange);
    const range = document.getElementById("cs-timeline-range");
    if (range) range.textContent = rangeLabel;
    const subtitle = document.getElementById("cs-timeline-subtitle");
    if (subtitle) subtitle.textContent = `${rangeLabel}共形成 ${totalEvidence} 条过程证据、${totalSolves} 次题目通过；柱高分别在各自量尺内比较。${meta.truncated ? "趋势图仅展示最近 52 周，汇总指标仍使用完整所选范围。" : ""}`;
    target.style.setProperty("--timeline-columns", String(Math.max(1, rows.length)));
    target.setAttribute("aria-label", `${rangeLabel}的学习活动趋势，共 ${totalEvidence} 条过程证据、${totalSolves} 次题目通过`);
    target.innerHTML = rows.length ? rows.map(item => {
      const evidenceHeight = Number(item.evidence || 0) ? Math.max(5, 100 * Number(item.evidence) / maximumEvidence) : 0;
      const solveHeight = Number(item.solves || 0) ? Math.max(5, 100 * Number(item.solves) / maximumSolves) : 0;
      const title = `${item.label}：${Number(item.activeStudents || 0)} 名活跃学生，${Number(item.attempts || 0)} 次尝试，${Number(item.evidence || 0)} 条过程证据，${Number(item.solves || 0)} 次通过，${Number(item.assessments || 0)} 次评估`;
      return `<span class="cs-timeline-week" title="${escape(title)}"><span class="cs-timeline-value">${Number(item.activeStudents || 0)}</span><span class="cs-timeline-bars"><i class="is-activity" style="height:${evidenceHeight}%"></i><i class="is-solve" style="height:${solveHeight}%"></i></span><small>${escape(item.label)}</small></span>`;
    }).join("") : '<div class="cs-empty">暂无可展示的时间序列。</div>';
  }

  function renderAbilityOverview() {
    const target = document.getElementById("cs-ability-overview");
    if (!target) return;
    const rows = (state.progress && state.progress.abilityOverview) || [];
    target.innerHTML = rows.length ? rows.map(item => {
      const observed = Number(item.studentsWithEvidence || 0);
      const available = item.averageMastery != null && observed >= 3;
      const mastery = available ? Math.round(Number(item.averageMastery)) : 0;
      return `<article class="cs-ability-row${available ? "" : " is-unobserved"}"><header><strong>${escape(item.label)}</strong><span>${available ? `${mastery}%` : observed ? "证据不足" : "未观测"}</span></header><span class="cs-ability-track"><i style="width:${available ? boundedPercent(mastery) : 0}%"></i></span><footer><span>${observed} / ${Number(item.studentCount || 0)} 人有证据</span><span>${available ? `${Number(item.lowMasteryCount || 0)} 人低于 60%` : "至少 3 人后展示班级均值"}</span></footer></article>`;
    }).join("") : '<div class="cs-empty">完成一次形成性评估后，这里会呈现班级能力掌握。</div>';
  }

  function renderBottlenecks() {
    const target = document.getElementById("cs-bottleneck-list");
    if (!target) return;
    const rows = ((state.progress && state.progress.challengeDiagnostics) || []).filter(item => Number(item.attemptedStudents || 0) > 0).slice(0, 6);
    target.innerHTML = rows.length ? rows.map((item, index) => {
      const success = Math.round(Number(item.attemptSuccessRate || 0) * 100);
      const insufficient = item.diagnosticStatus === "insufficient";
      const gap = (item.commonGaps || [])[0];
      const status = insufficient ? "证据不足" : item.diagnosticStatus === "attention" ? "需干预" : item.diagnosticStatus === "watch" ? "观察" : "稳定";
      const result = insufficient
        ? `仅 ${Number(item.attemptedStudents || 0)} 人尝试 · 至少 ${Number(item.minimumReliableSample || 3)} 人后展示成功率`
        : `尝试后通过 ${success}% · ${Number(item.solvedStudents || 0)} / ${Number(item.attemptedStudents || 0)} 人`;
      return `<article class="cs-bottleneck-item is-${escape(item.diagnosticStatus)}"><span class="cs-bottleneck-rank">${String(index + 1).padStart(2, "0")}</span><div><header><span><small>${escape(item.moduleName)}</small><strong>${escape(item.name)}</strong></span><em>${status}</em></header><span class="cs-bottleneck-track"><i style="width:${insufficient ? 0 : boundedPercent(success)}%"></i></span><footer><span>${escape(result)}</span><span>${Number(item.strugglingStudents || 0)} 人反复试错${gap ? ` · 缺口：${escape(gap.label)}` : ""} · 置信度 ${Math.round(Number(item.diagnosticConfidence || 0) * 100)}%</span></footer></div></article>`;
    }).join("") : '<div class="cs-empty">尚无学生尝试题目。当前不展示不稳定的题目成功率。</div>';
  }

  function renderInterventions() {
    const target = document.getElementById("cs-intervention-list");
    if (!target) return;
    const tracking = (state.progress && state.progress.interventionTracking) || {};
    if (elements.interventionEffectSummary) {
      elements.interventionEffectSummary.innerHTML = Number(tracking.totalCount || 0)
        ? `<span><small>进行中</small><strong>${Number(tracking.activeCount || 0)}</strong></span><span class="is-ready"><small>待复查</small><strong>${Number(tracking.readyForReviewCount || 0)}</strong></span><span><small>已复查</small><strong>${Number(tracking.reviewedCount || 0)}</strong></span><span class="is-improving"><small>同期改善</small><strong>${Number(tracking.improvingCount || 0)}</strong></span><p>${escape(tracking.caveat || "同期变化用于支持复查，不作因果归因。")}</p>`
        : '<div><i class="fas fa-clipboard-check" aria-hidden="true"></i><span><strong>尚未记录教学干预</strong><small>打开学生详情即可冻结基线，并在约定时间复查变化。</small></span></div>';
    }
    const rows = (state.progress && state.progress.interventions) || [];
    target.innerHTML = rows.length ? rows.map(item => `<article class="cs-intervention-item is-${escape(item.tone)}"><span><i class="fas ${item.tone === "danger" ? "fa-exclamation-triangle" : item.tone === "success" ? "fa-check-circle" : item.tone === "warning" ? "fa-pause-circle" : "fa-lightbulb"}" aria-hidden="true"></i></span><div><header><strong>${escape(item.title)}</strong><em>${Number(item.count || 0)} 人</em></header><p>${escape(item.reason)}</p><small><b>建议：</b>${escape(item.action)}</small><button type="button" data-intervention-id="${escape(item.id)}">查看这 ${Number(item.count || 0)} 名学生 <i class="fas fa-arrow-right" aria-hidden="true"></i></button></div></article>`).join("") : '<div class="cs-empty"><strong>当前没有明确的干预队列</strong><br>证据增加后，系统会根据透明规则生成可执行建议。</div>';
  }

  function renderDataQuality() {
    const quality = (state.progress && state.progress.dataQuality) || {};
    const target = document.getElementById("cs-data-quality");
    if (!target) return;
    const scopeLabel = learningTimeLabel(quality.scope?.timeRange || learningScopeValues().timeRange);
    document.getElementById("cs-data-quality-summary").textContent = `${Number(quality.coveredStudents || 0)} / ${Number(quality.studentCount || 0)} 名学生具备基础证据 · ${scopeLabel} · 生成于 ${formatDate(quality.generatedAt, true)}`;
    const metricLabels = {
      studentCount: "课程学生",
      evidenceCoverage: "证据覆盖",
      averageMastery: "平均掌握度",
      verifiedCompletion: "真实完成率",
      highRiskStudents: "优先干预",
      stalledStudents: "学习停滞",
    };
    const metrics = Object.entries((state.progress && state.progress.metrics) || {});
    const metricContract = metrics.map(([key, metric]) => {
      const value = metric.unavailableReason
        ? "暂不可用"
        : key === "evidenceCoverage" || key === "verifiedCompletion"
          ? `${Math.round(Number(metric.value || 0) * 100)}%`
          : key === "averageMastery"
            ? `${Math.round(Number(metric.value || 0))}%`
            : String(Math.round(Number(metric.value || 0)));
      const denominator = metric.denominator == null ? "快照计数" : `${Number(metric.numerator || 0)} / ${Number(metric.denominator || 0)}`;
      const range = metric.timeRange?.label || scopeLabel;
      return `<article><header><strong>${escape(metricLabels[key] || key)}</strong><span>${escape(value)}</span></header><p>${escape(metric.unavailableReason || metric.definition || "")}</p><small>${escape(denominator)} · ${Number(metric.sampleSize || 0)} 个样本 · 覆盖 ${Math.round(Number(metric.coverage || 0) * 100)}% · ${Number(metric.evidenceCount || 0)} 条证据 · ${escape(range)} · 置信度 ${Math.round(Number(metric.confidence || 0) * 100)}%</small></article>`;
    }).join("");
    target.innerHTML = `<section><h4>本次分析覆盖</h4><div class="cs-quality-stats"><span><strong>${Number(quality.evidenceEventCount || 0)}</strong>过程事件</span><span><strong>${Number(quality.attemptCount || 0)}</strong>学习尝试</span><span><strong>${Number(quality.assessmentCount || 0)}</strong>形成评估</span><span><strong>${Number(quality.skillStateCount || 0)}</strong>能力状态</span></div></section>${metricContract ? `<section><h4>当前指标证据卡</h4><div class="cs-metric-contract">${metricContract}</div></section>` : ""}<section><h4>指标定义</h4><dl>${(quality.definitions || []).map(item => `<div><dt>${escape(item.metric)}</dt><dd>${escape(item.definition)}</dd></div>`).join("")}</dl></section><section><h4>可信边界</h4><ul>${(quality.caveats || []).map(item => `<li>${escape(item)}</li>`).join("")}</ul></section>`;
  }

  function signedDelta(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const numeric = Number(value);
    const display = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
    return `${numeric > 0 ? "+" : ""}${display}`;
  }

  function interventionChange(label, value, suffix) {
    if (value == null || Number.isNaN(Number(value))) return "";
    const numeric = Number(value);
    const tone = numeric > 0 ? "is-positive" : numeric < 0 ? "is-negative" : "is-neutral";
    return `<span class="${tone}"><small>${escape(label)}</small><strong>${escape(signedDelta(numeric))}${escape(suffix || "")}</strong></span>`;
  }

  function renderStudentInterventionHistory(student) {
    const rows = student.interventionHistory || [];
    if (!rows.length) {
      return '<div class="cs-empty"><strong>尚未记录干预</strong><br>记录后会冻结当前基线，并在复查时比较同口径变化。</div>';
    }
    const statusLabels = {tracking: "跟踪中", ready_for_review: "到期待复查", reviewed: "已复查"};
    const trendTones = {improving: "success", declining: "danger", mixed: "warning", unchanged: "neutral", no_new_evidence: "neutral"};
    return rows.map(item => {
      const baseline = item.baseline || {};
      const changes = item.changes || {};
      const changeMarkup = [
        interventionChange("真实完成", changes.completionPoints, " 个百分点"),
        interventionChange("能力掌握", changes.masteryPoints, " 分"),
        interventionChange("过程评分", changes.processPoints, " 分"),
        interventionChange("风险降低", changes.riskScoreReduction, " 分"),
        interventionChange("新增证据", changes.evidenceCount, " 条"),
      ].filter(Boolean).join("");
      const baselineCompletion = Math.round(Number(baseline.verifiedCompletion || 0) * 100);
      const baselineMastery = baseline.masteryScore == null ? "未观测" : `${Math.round(Number(baseline.masteryScore))}%`;
      const status = statusLabels[item.status] || "跟踪中";
      const trendTone = trendTones[item.observedTrend] || "neutral";
      const review = item.teacherOutcomeLabel
        ? `<div class="cs-intervention-review"><strong>${escape(item.teacherOutcomeLabel)}</strong>${item.reviewNote ? `<p>${escape(item.reviewNote)}</p>` : ""}<small>复查于 ${escape(formatDate(item.reviewedAt, true))}</small></div>`
        : "";
      const reviewButton = item.status === "reviewed"
        ? ""
        : `<button type="button" class="hub-button is-secondary" data-review-intervention="${escape(item.id)}" data-review-student="${Number(student.userId)}"><i class="fas fa-clipboard-check" aria-hidden="true"></i>${item.status === "ready_for_review" ? "现在复查" : "提前复查"}</button>`;
      return `<article class="cs-intervention-history-item is-${escape(trendTone)}"><header><div><small>${escape(formatDate(item.startedAt, true))}</small><strong>${escape(item.title)}</strong></div><span>${escape(status)}</span></header><p>${escape(item.plan || "未填写具体计划")}</p><small class="cs-intervention-baseline">干预基线：完成 ${baselineCompletion}% · 掌握 ${baselineMastery} · 证据 ${Number(baseline.evidenceCount || 0)} 条</small><div class="cs-intervention-changes">${changeMarkup || '<span class="is-neutral"><small>同期变化</small><strong>尚不可比较</strong></span>'}</div><footer><span class="cs-observed-trend is-${escape(trendTone)}">${escape(item.observedTrendLabel || "尚不可判断")}</span><span>计划复查 ${escape(formatDate(item.followUpAt, true))}</span>${reviewButton}</footer>${review}</article>`;
    }).join("");
  }

  function renderStudentDrawer(student) {
    if (!student || !elements.studentDrawerBody) return;
    const risk = riskView(student.riskLevel);
    const mastery = student.masteryScore == null ? "未观测" : `${Math.round(Number(student.masteryScore))}%`;
    const completion = `${Math.round(Number(student.verifiedCompletion || 0) * 100)}%`;
    elements.studentDrawerTitle.textContent = student.name || "学生详情";
    elements.studentDrawerSubtitle.textContent = `${risk.label} · ${activityRecency(student)} · 证据${student.evidenceLevel || "不足"}`;
    const riskSignals = (student.riskSignals || []).map(item => `<article class="cs-student-signal is-${escape(item.severity)}"><span><i class="fas ${item.severity === "high" ? "fa-exclamation-triangle" : item.severity === "medium" ? "fa-eye" : item.severity === "unknown" ? "fa-question-circle" : "fa-info-circle"}" aria-hidden="true"></i></span><div><strong>${escape(item.label)}</strong><p>${escape(item.detail)}</p></div></article>`).join("");
    const skillRows = (student.skills || []).map(item => `<article class="cs-student-skill${item.evidenceCount ? "" : " is-unobserved"}"><header><strong>${escape(item.label)}</strong><span>${item.evidenceCount ? `${Math.round(Number(item.mastery || 0))}%` : "未观测"}</span></header><span><i style="width:${item.evidenceCount ? boundedPercent(item.mastery) : 0}%"></i></span><small>${Number(item.evidenceCount || 0)} 次评估证据 · 置信度 ${Math.round(Number(item.confidence || 0) * 100)}%</small></article>`).join("");
    const criteria = (student.weakCriteria || []).slice(0, 4).map(item => `<span><strong>${escape(item.label)}</strong><em>${Math.round(Number(item.mastery || 0))}%</em></span>`).join("");
    const challenges = (student.challengePerformance || []).slice(0, 6).map(item => `<article><span class="${item.solved ? "is-solved" : "is-open"}"><i class="fas ${item.solved ? "fa-check" : "fa-flag"}" aria-hidden="true"></i></span><div><small>${escape(item.moduleName)}</small><strong>${escape(item.name)}</strong><p>${item.solved ? "已通过可信判题" : "尚未通过"} · ${Number(item.attemptCount || 0)} 次尝试 · ${Number(item.failedCommands || 0)} 次失败命令${item.averageProcessScore == null ? "" : ` · 过程 ${Math.round(Number(item.averageProcessScore))} 分`}</p></div></article>`).join("");
    const evidence = (student.recentEvidence || []).map(item => `<article><span><i class="fas fa-circle" aria-hidden="true"></i></span><div><strong>${escape(item.label)}</strong><p>${escape(item.challengeName)} · ${Number(item.count || 0)} 条 · 平均信任级别 ${Number(item.averageTrustLevel || 0).toFixed(1)} / 4</p></div><time>${escape(formatDate(item.lastOccurred, true))}</time></article>`).join("");
    const objectives = (student.objectives || []).map(item => `<span class="${item.complete ? "is-complete" : ""}"><i class="fas ${item.complete ? "fa-check-circle" : "fa-circle"}" aria-hidden="true"></i>${escape(item.name || item.id)}</span>`).join("");
    const assignments = ((student.assignmentSummary || {}).items || []).map(item => `<article><span><strong>${escape(item.title)}</strong><small>${item.overdue ? "已逾期" : statusLabel(item.status)}${item.scorePercent == null ? "" : ` · ${Math.round(Number(item.scorePercent))} 分`}</small></span><time>${item.dueAt ? `截止 ${escape(formatDate(item.dueAt, true))}` : "无截止时间"}</time></article>`).join("");
    const signals = student.activitySignals || {};
    const interventionHistory = renderStudentInterventionHistory(student);
    elements.studentDrawerBody.innerHTML = `
      <section class="cs-student-detail-kpis">
        <article><small>真实完成</small><strong>${completion}</strong><span>${Number(student.requiredSolved || 0)} / ${Number(student.requiredTotal || 0)} 道必修题</span></article>
        <article><small>能力掌握</small><strong>${mastery}</strong><span>置信度 ${Math.round(Number(student.masteryConfidence || 0) * 100)}%</span></article>
        <article><small>过程评分</small><strong>${student.averageProcessScore == null ? "未评估" : Math.round(Number(student.averageProcessScore))}</strong><span>结果评分 ${student.averageObjectiveScore == null ? "未评估" : Math.round(Number(student.averageObjectiveScore))}</span></article>
        <article><small>证据充分度</small><strong>${Math.round(Number(student.evidenceConfidence || 0))}%</strong><span>${Number(student.evidenceCount || 0)} 条过程事件</span></article>
      </section>
      <section class="cs-student-detail-section">
        <header><div><span class="hub-kicker">为什么需要关注</span><h3>风险与机会信号</h3></div><div class="cs-student-detail-actions"><button type="button" class="hub-button is-secondary" data-log-intervention="${Number(student.userId)}"><i class="fas fa-clipboard-list" aria-hidden="true"></i>记录干预</button><button type="button" class="hub-button is-primary" data-student-agent="${Number(student.userId)}"><i class="fas fa-magic" aria-hidden="true"></i>准备方案</button></div></header>
        <div class="cs-student-signals">${riskSignals || '<div class="cs-empty">当前没有明确风险信号。</div>'}</div>
      </section>
      <section class="cs-student-detail-section">
        <header><div><span class="hub-kicker">教学闭环</span><h3>干预、复查与同期变化</h3></div></header>
        <div class="cs-intervention-history">${interventionHistory}</div>
        <p class="cs-detail-caveat">系统比较干预开始与复查时的同口径证据；同期变化不等同于干预造成的因果效果。</p>
      </section>
      <section class="cs-student-detail-section">
        <header><div><span class="hub-kicker">六维能力</span><h3>掌握度与置信度</h3></div></header>
        <div class="cs-student-skill-grid">${skillRows}</div>${criteria ? `<div class="cs-criteria-gaps"><strong>优先补强的过程标准</strong><div>${criteria}</div></div>` : ""}
      </section>
      <section class="cs-student-detail-section">
        <header><div><span class="hub-kicker">学习策略</span><h3>过程行为画像</h3></div></header>
        <div class="cs-process-matrix"><span><strong>${Number(signals.completedCommands || 0)}</strong><small>有效命令</small></span><span><strong>${Number(signals.failedCommands || 0)}</strong><small>失败命令</small></span><span><strong>${Number(signals.resets || 0)}</strong><small>环境重置</small></span><span><strong>${Number(signals.interruptions || 0)}</strong><small>实验中断</small></span><span><strong>${Number(signals.tutorMessages || 0)}</strong><small>辅导回应</small></span><span><strong>${Number(signals.reflections || 0)}</strong><small>学习反思</small></span></div>
        <p class="cs-detail-caveat">辅导使用只代表支持需求，不单独用于判断能力或独立性；结论需结合目标、过程与反思证据。</p>
      </section>
      <section class="cs-student-detail-section"><header><div><span class="hub-kicker">题目级诊断</span><h3>当前卡点与通过记录</h3></div></header><div class="cs-student-challenges">${challenges || '<div class="cs-empty">尚无题目级学习记录。</div>'}</div></section>
      ${objectives ? `<section class="cs-student-detail-section"><header><div><span class="hub-kicker">课程目标</span><h3>目标达成映射</h3></div></header><div class="cs-objective-status">${objectives}</div></section>` : ""}
      ${assignments ? `<section class="cs-student-detail-section"><header><div><span class="hub-kicker">课程任务</span><h3>提交与逾期</h3></div></header><div class="cs-student-assignments">${assignments}</div></section>` : ""}
      <section class="cs-student-detail-section"><header><div><span class="hub-kicker">可回溯证据</span><h3>最近证据时间线</h3></div></header><div class="cs-evidence-timeline">${evidence || '<div class="cs-empty">尚无过程证据。</div>'}</div></section>`;
  }

  function openStudentDrawer(userId, trigger) {
    const student = ((state.progress && state.progress.students) || []).find(item => Number(item.userId) === Number(userId));
    if (!student || !elements.studentDrawer) return;
    closeQuestionDrawer({restoreFocus: false});
    state.selectedStudentId = Number(userId);
    state.studentDrawerReturnFocus = trigger || document.activeElement;
    renderStudentDrawer(student);
    elements.studentDrawer.hidden = false;
    elements.studentDrawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-learning-drawer");
    setCourseWorkspaceInert(true, elements.studentDrawer);
    window.requestAnimationFrame(() => elements.studentDrawerPanel?.focus({preventScroll: true}));
  }

  function closeStudentDrawer(options) {
    if (!elements.studentDrawer || elements.studentDrawer.hidden) return;
    elements.studentDrawer.hidden = true;
    elements.studentDrawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-learning-drawer");
    setCourseWorkspaceInert(false);
    state.selectedStudentId = null;
    const returnFocus = state.studentDrawerReturnFocus;
    state.studentDrawerReturnFocus = null;
    if ((!options || options.restoreFocus !== false) && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus({preventScroll: true});
    }
  }

  function learningMetric(name) {
    const progress = state.progress || {};
    return (progress.metrics && progress.metrics[name]) ||
      (progress.summary && progress.summary.metrics && progress.summary.metrics[name]) ||
      null;
  }

  function metricAvailable(metric) {
    return Boolean(metric && !metric.unavailableReason && metric.value != null);
  }

  function metricDisplay(metric, kind) {
    if (!metricAvailable(metric)) return "暂不可用";
    if (kind === "percent") return `${Math.round(Number(metric.value) * 100)}%`;
    return String(Math.round(Number(metric.value)));
  }

  function metricEvidenceNote(metric, fallback) {
    if (!metric) return fallback;
    if (metric.unavailableReason) return metric.unavailableReason;
    const fraction = metric.denominator == null
      ? ""
      : `${Number(metric.numerator || 0)} / ${Number(metric.denominator || 0)} · `;
    const range = metric.timeRange?.label || learningTimeLabel(learningScopeValues().timeRange);
    return `${fraction}${Number(metric.sampleSize || 0)} 个样本 · 覆盖 ${Math.round(Number(metric.coverage || 0) * 100)}% · ${Number(metric.evidenceCount || 0)} 条证据 · ${range} · 置信度 ${Math.round(Number(metric.confidence || 0) * 100)}%`;
  }

  function renderStudentInsights() {
    const summary = (state.progress && state.progress.summary) || {};
    const coverage = learningMetric("evidenceCoverage");
    const mastery = learningMetric("averageMastery");
    const risk = learningMetric("highRiskStudents");
    const stalled = learningMetric("stalledStudents");
    document.getElementById("cs-insight-coverage").textContent = metricDisplay(coverage, "percent");
    document.getElementById("cs-insight-coverage-note").textContent = metricEvidenceNote(coverage, `${Number(summary.evidenceCoveredStudents || 0)} / ${Number(summary.studentCount || 0)} 名学生达到基础证据量`);
    document.getElementById("cs-insight-mastery").textContent = metricAvailable(mastery) ? `${Math.round(Number(mastery.value))}%` : "暂不可用";
    document.getElementById("cs-insight-mastery-note").textContent = metricEvidenceNote(mastery, `${Number(summary.masteryStudentCount || 0)} 名学生已有能力评估`);
    document.getElementById("cs-insight-risk").textContent = metricDisplay(risk, "count");
    document.getElementById("cs-insight-risk-note").textContent = metricEvidenceNote(risk, `${Number(summary.watchCount || 0)} 人持续关注 · ${Number(summary.unknownCount || 0)} 人证据不足`);
    document.getElementById("cs-insight-stalled").textContent = metricDisplay(stalled, "count");
    document.getElementById("cs-insight-stalled-note").textContent = metricEvidenceNote(stalled, "仍有未完成尝试且近期无进展");
    const quality = (state.progress && state.progress.dataQuality) || {};
    document.getElementById("cs-progress-freshness").textContent = `证据更新于 ${formatDate(quality.generatedAt, true)}`;
    renderLearningScopeSummary();
    renderLearningTimeline();
    renderAbilityOverview();
    renderBottlenecks();
    renderInterventions();
    renderDataQuality();
    if (state.selectedStudentId != null) {
      const selected = ((state.progress && state.progress.students) || []).find(item => Number(item.userId) === Number(state.selectedStudentId));
      if (selected) renderStudentDrawer(selected);
      else closeStudentDrawer({restoreFocus: false});
    }
  }

  async function reloadLearningProgress(options) {
    if (!state.course) return false;
    const sequence = ++state.learningLoadSequence;
    const values = learningScopeValues();
    if (!options || options.syncUrl !== false) syncLearningScopeUrl();
    const params = learningScopeParams(values);
    elements.learningScope?.setAttribute("aria-busy", "true");
    const freshness = document.getElementById("cs-progress-freshness");
    if (freshness) freshness.textContent = "正在按所选范围重新汇总证据…";
    try {
      const progress = unwrap(await api.request(`/teaching/progress/${encodeURIComponent(state.course.referenceId || state.course.id)}?${params.toString()}`));
      if (sequence !== state.learningLoadSequence) return false;
      state.progress = progress;
      state.studentCohortIds = null;
      renderStudents();
      renderStudentInsights();
      renderMetrics();
      return true;
    } finally {
      if (sequence === state.learningLoadSequence) elements.learningScope?.removeAttribute("aria-busy");
    }
  }

  async function applyLearningScopeChange(source) {
    if (source === "module") renderLearningQuestionOptions();
    try {
      await reloadLearningProgress();
    } catch (error) {
      showNotice(error.message || "无法按所选范围更新学情。", "danger");
    }
  }

  async function logStudentIntervention(studentId, trigger) {
    const student = ((state.progress && state.progress.students) || []).find(item => Number(item.userId) === Number(studentId));
    if (!student) return;
    const primarySignal = (student.riskSignals || [])[0] || {};
    const focus = primarySignal.label || "学习进展";
    const plan = await window.AISecEduUI.prompt(
      `为“${student.name}”记录一项具体干预。系统会冻结当前学情基线，并默认在 7 天后提示复查。`,
      {
        title: "记录教学干预",
        inputLabel: "具体动作与预期观察",
        value: `围绕“${focus}”核对当前卡点，安排一个可完成的小目标，并在 7 天后按同一口径复查。`,
        maxLength: 500,
        confirmLabel: "记录并开始跟踪",
      },
    );
    if (plan === null) return;
    if (!plan.trim()) {
      showNotice("请填写具体的干预动作。", "danger");
      return;
    }
    if (trigger) trigger.disabled = true;
    try {
      unwrap(await api.json("POST", `/teaching/progress/${encodeURIComponent(state.course.id)}/interventions`, {
        studentId: Number(student.userId),
        title: `${focus}跟进`,
        kind: primarySignal.code || "TEACHER_PLAN",
        plan: plan.trim(),
        followUpDays: 7,
      }));
      await reloadLearningProgress();
      showNotice("干预已记录，当前学情已作为基线并开始跟踪。", "success");
    } catch (error) {
      showNotice(error.message || "记录干预失败。", "danger");
    } finally {
      if (trigger && trigger.isConnected) trigger.disabled = false;
    }
  }

  async function reviewStudentIntervention(interventionId, studentId, trigger) {
    const student = ((state.progress && state.progress.students) || []).find(item => Number(item.userId) === Number(studentId));
    const intervention = (student && student.interventionHistory || []).find(item => item.id === interventionId);
    if (!student || !intervention) return;
    const outcomeDialog = window.AISecEduUI.dialog({
      kind: "info",
      title: "复查干预效果",
      message: `结合“${intervention.title}”实施情况，你对学生当前变化的判断是？`,
      details: `系统观测为“${intervention.observedTrendLabel || "尚不可判断"}”；请结合课堂观察判断，不把同期变化直接当作因果效果。`,
      actions: [
        {label: "已有改善", value: "IMPROVED", primary: true, style: "success"},
        {label: "无明显变化", value: "UNCHANGED", style: "outline-secondary"},
        {label: "有所下降", value: "DECLINED", style: "danger"},
        {label: "暂不确定", value: "UNCERTAIN", style: "outline-secondary"},
      ],
    });
    const teacherOutcome = await outcomeDialog.closed;
    if (!["IMPROVED", "UNCHANGED", "DECLINED", "UNCERTAIN"].includes(teacherOutcome)) return;
    const note = await window.AISecEduUI.prompt("补充本次复查依据；可以留空，但建议记录观察到的行为或作品变化。", {
      title: "记录复查依据",
      inputLabel: "课堂观察或证据说明",
      value: "",
      maxLength: 2000,
      confirmLabel: "保存复查",
    });
    if (note === null) return;
    if (trigger) trigger.disabled = true;
    try {
      unwrap(await api.json(
        "POST",
        `/teaching/progress/${encodeURIComponent(state.course.id)}/interventions/${encodeURIComponent(interventionId)}/review`,
        {teacherOutcome, note: note.trim()},
      ));
      await reloadLearningProgress();
      showNotice("复查已保存，学情变化与教师判断已并列记录。", "success");
    } catch (error) {
      showNotice(error.message || "保存复查失败。", "danger");
    } finally {
      if (trigger && trigger.isConnected) trigger.disabled = false;
    }
  }

  function renderActivity() {
    const rows = ((state.workspace && state.workspace.recentActivity) || []).map(item => ({
      title: item.title || "课程内容",
      meta: `${({question: "题目", courseware: "课件", demo: "演示"})[item.objectType] || "课程内容"} · ${statusLabel(item.state)}`,
      date: item.updated,
      href: item.objectType === "question"
        ? `/teacher/courses?dojo=${encodeURIComponent(state.course.referenceId)}&tab=questions&selectedId=${encodeURIComponent(item.objectId)}`
        : artifactDetailHref(item.objectId),
    }));
    document.getElementById("cs-recent-activity").innerHTML = rows.length ? rows.map(item =>
      `<a class="cs-activity-row" href="${escape(item.href)}"><span><strong>${escape(item.title)}</strong><small>${escape(item.meta)}</small></span><span>${escape(formatDate(item.date, true))}</span></a>`
    ).join("") : '<div class="cs-empty cs-empty-with-action"><span>还没有课程内容更新记录。</span><button class="hub-button is-secondary" type="button" data-cs-tab-target="courseware">查看课程内容</button></div>';
  }

  function overviewAttentionHref(item) {
    if (item?.href) return item.href;
    if (item?.objectType === "question" || item?.objectType === "generation_batch") {
      const target = new URL("/teacher/courses", window.location.origin);
      target.searchParams.set("dojo", state.course.referenceId || state.course.id);
      target.searchParams.set("tab", "questions");
      if (item.objectType === "question" && item.objectId) target.searchParams.set("selectedId", item.objectId);
      return target.pathname + target.search;
    }
    return item?.objectId ? artifactDetailHref(item.objectId) : "#";
  }

  function renderOverviewPriorities() {
    const attention = (state.workspace?.attention || []).slice(0, 6);
    const attentionList = document.getElementById("cs-overview-attention");
    const attentionCount = document.getElementById("cs-attention-count");
    const readinessNode = document.getElementById("cs-overview-readiness");
    const asOfNode = document.getElementById("cs-readiness-as-of");
    if (attentionCount) attentionCount.textContent = `${Number(state.workspace?.attention?.length || 0)} 项`;
    if (attentionList) {
      attentionList.innerHTML = attention.length ? attention.map(item => {
        const icon = ({question: "fa-flag", courseware: "fa-file-powerpoint", demo: "fa-project-diagram", generation_batch: "fa-tasks"})[item.objectType] || "fa-exclamation-circle";
        const action = ({retry_validation: "检查失败原因", retry_generation: "重新生成", retry_failed: "重试失败项", review_results: "查看结果", review: "开始审核"})[item.nextAction] || "打开处理";
        const meta = [statusLabel(item.state), item.updated ? formatDate(item.updated, true) : "时间待记录"].filter(Boolean).join(" · ");
        return `<a class="hub-attention-row" href="${escape(overviewAttentionHref(item))}">
          <span class="hub-attention-icon"><i class="fas ${escape(icon)}" aria-hidden="true"></i></span>
          <span><strong>${escape(item.title || "待处理课程内容")}</strong><small>${escape(meta)}</small></span>
          <em>${escape(action)}<i class="fas fa-arrow-right" aria-hidden="true"></i></em>
        </a>`;
      }).join("") : '<div class="hub-priority-empty"><span><i class="fas fa-check" aria-hidden="true"></i></span><div><strong>当前没有待处理事项</strong><small>失败、部分成功和等待审核的内容会出现在这里。</small></div></div>';
    }
    const readiness = state.workspace?.publishReadiness || {};
    const readinessState = readiness.state || "loading";
    const icon = ({ready: "fa-check", review: "fa-clipboard-check", needs_attention: "fa-exclamation", empty: "fa-plus", loading: "fa-spinner fa-spin"})[readinessState] || "fa-info";
    const actionLabel = ({ready: "查看学情", review: "审阅草稿", needs_attention: "立即处理", empty: "准备内容"})[readinessState] || "查看详情";
    const counts = readiness.counts || {published: 0, draft: 0, needsAttention: 0};
    if (readinessNode) {
      readinessNode.className = `hub-readiness-card is-${escape(readinessState)}`;
      readinessNode.innerHTML = `<span class="hub-readiness-icon"><i class="fas ${escape(icon)}" aria-hidden="true"></i></span>
        <div><strong>${escape(readiness.title || "正在核对发布状态")}</strong><p>${escape(readiness.description || "请稍候，正在读取课程内容事实。")}</p></div>
        <dl><div><dt>已发布</dt><dd>${Number(counts.published || 0)}</dd></div><div><dt>草稿</dt><dd>${Number(counts.draft || 0)}</dd></div><div><dt>待处理</dt><dd>${Number(counts.needsAttention || 0)}</dd></div></dl>
        ${readiness.href ? `<a class="hub-button ${readinessState === "needs_attention" ? "is-primary" : "is-secondary"}" href="${escape(readiness.href)}">${escape(actionLabel)}<i class="fas fa-arrow-right" aria-hidden="true"></i></a>` : ""}`;
    }
    if (asOfNode) {
      const evidence = state.workspace?.evidence || {};
      asOfNode.textContent = evidence.asOf
        ? `${Number(evidence.evidenceCount || 0)} 条内容与任务事实 · ${formatDate(evidence.asOf, true)} 截止`
        : "正在核对课程内容事实…";
    }
  }

  function renderMetrics() {
    const summary = (state.progress && state.progress.summary) || {};
    const counts = (state.workspace && state.workspace.counts) || state.course.counts || {};
    const students = learningMetric("studentCount");
    const completion = learningMetric("verifiedCompletion");
    const studentMetric = document.getElementById("cs-stat-students");
    studentMetric.textContent = metricAvailable(students)
      ? Number(students.value)
      : state.progress ? Number(summary.studentCount || 0) : "—";
    studentMetric.title = state.progress ? "" : "打开“学情”后按需计算";
    document.getElementById("cs-stat-completion").textContent = metricDisplay(completion, "percent");
    document.getElementById("cs-stat-questions").textContent = Number((counts.questions || {}).total || 0);
    document.getElementById("cs-stat-demos").textContent = Number(state.contentPaging.demos.total || (counts.demos || {}).total || 0);
    document.getElementById("cs-stat-artifacts").textContent = Number(state.contentPaging.courseware.total || (counts.courseware || {}).total || 0);
  }

  function renderAll() {
    elements.title.textContent = state.course.name || "未命名课程";
    if (elements.courseCodeCourseName) elements.courseCodeCourseName.textContent = state.course.name || "未命名课程";
    courseLinks();
    renderModules();
    renderMaterials();
    renderArtifacts();
    renderSimulations();
    renderChallenges();
    renderStudents();
    renderStudentInsights();
    renderOverviewPriorities();
    renderActivity();
    renderMetrics();
  }

  async function loadCourse(courseId, options = {}) {
    const sequence = ++state.workspaceLoadSequence;
    state.workspaceController?.abort();
    const controller = new AbortController();
    state.workspaceController = controller;
    closeFilterDrawer({restoreFocus: false});
    closeCourseCodeDialog({restoreFocus: false});
    closeMaterialPreview({restoreFocus: false});
    closeQuestionDrawer({restoreFocus: false});
    closeStudentDrawer({restoreFocus: false});
    state.course = (state.context.teacherDojos || []).find(item =>
      item.id === Number(courseId) || item.referenceId === String(courseId || "")
    );
    if (!state.course) {
      if (state.workspaceController === controller) state.workspaceController = null;
      setCourseView("list");
      renderCourseList();
      showNotice(courseId ? "未找到这门课程，已返回课程列表。" : "", courseId ? "danger" : "");
      return;
    }
    setCourseView("detail");
    elements.title.textContent = state.course.name || "未命名课程";
    courseLinks();
    setWorkspaceLoading(true);
    state.materials = [];
    state.artifacts = [];
    state.coursewareArtifacts = [];
    state.demoArtifacts = [];
    state.questionItems = [];
    state.questionCounts = {total: 0, draft: 0, published: 0, needsAttention: 0};
    state.questionReviewBatch = null;
    state.questionReviewLoaded = false;
    state.questionLoaded = false;
    state.questionSelectionHandled = false;
    state.coursewareManagement = false;
    state.coursewareManagementPreparing = false;
    state.coursewareBulkBusy = false;
    state.coursewareBulkStatus = "";
    state.coursewarePreviousStatus = "";
    state.selectedCoursewareIds.clear();
    state.selectedQuestionDraftIds.clear();
    state.questionExpandedModules.clear();
    state.questionChapterStateInitialized = false;
    state.demoExpandedModules.clear();
    state.demoChapterStateInitialized = false;
    window.clearTimeout(state.questionSearchTimer);
    Object.values(state.contentSearchTimers).forEach(timer => window.clearTimeout(timer));
    state.contentPaging.materials = {page: 1, pageSize: 30, total: 0, totalPages: 1};
    state.contentPaging.courseware = {page: 1, pageSize: 30, total: 0, totalPages: 1};
    state.contentPaging.demos = {page: 1, pageSize: 30, total: 0, totalPages: 1};
    state.contentLoaded = {materials: false, courseware: false, demos: false};
    state.contentSelectionHandled = {materials: false, courseware: false, demos: false};
    state.questionPaging = {page: 1, pageSize: state.questionManagement ? 100 : 30, total: 0, totalPages: 1};
    [elements.materialSearch, elements.artifactSearch, elements.demoSearch].forEach(node => { if (node) node.value = ""; });
    [elements.materialStatus, elements.artifactModule, elements.artifactType, elements.artifactSource, elements.artifactStatus, elements.demoModule, elements.demoStatus, elements.demoType].forEach(node => { if (node) node.value = ""; });
    [elements.questionSearch, elements.questionStatus, elements.questionModule, elements.questionRequired, elements.questionMode].forEach(node => { if (node) node.value = ""; });
    if (elements.materialSort) elements.materialSort.value = "updated_desc";
    if (elements.artifactSort) elements.artifactSort.value = "updated_desc";
    if (elements.demoSort) elements.demoSort.value = "course_order";
    if (elements.questionSort) elements.questionSort.value = "course_order";
    state.workspace = null;
    state.progress = null;
    state.learningBaseProgress = null;
    state.learningScopeInitialized = false;
    state.courseCode = "";
    state.courseCodeState = "idle";
    state.studentCohortIds = null;
    state.tabLoads = {};
    syncCourseCodeControls(false);
    try {
      const workspace = options.workspace || unwrap(await api.request(
        `/teaching/courses/${encodeURIComponent(state.course.referenceId || state.course.id)}/workspace?includeLearning=0&includeCollections=0`,
        {controller, latestKey: "teacher-course-workspace"},
      ));
      if (sequence !== state.workspaceLoadSequence) return;
      state.workspace = workspace;
      state.course = workspace.course || state.course;
      state.materials = workspace.materials || [];
      const demoTypes = new Set(["simulation", "attack-defense-scene", "classroom-scenario"]);
      const nonCoursewareTypes = new Set(["question-set", "assessment", "challenge", "knowledge-test", "quiz", "debate", ...demoTypes]);
      state.coursewareArtifacts = (workspace.artifacts || []).filter(item => !nonCoursewareTypes.has(String(item.type || "").toLowerCase()));
      state.demoArtifacts = (workspace.artifacts || []).filter(item => demoTypes.has(String(item.type || "").toLowerCase()));
      syncArtifactState();
      state.contentPaging.materials.total = state.materials.length;
      state.contentPaging.courseware.total = Number(workspace.counts?.courseware?.total || state.coursewareArtifacts.length);
      state.contentPaging.demos.total = Number(workspace.counts?.demos?.total || state.demoArtifacts.length);
      state.questionCounts = workspace.counts?.questions || state.questionCounts;
      state.progress = workspace.learning || null;
      state.learningBaseProgress = workspace.learning || null;
      const learningScope = restoreLearningScopeFromUrl();
      const learningScopeNeedsReload = Boolean(
        learningScope.studentId
        || learningScope.moduleIndex !== ""
        || learningScope.challengeId
        || learningScope.timeRange !== "12w"
      );
      state.learningScopeInitialized = Boolean(workspace.learning) && !learningScopeNeedsReload;
      renderAll();
      restoreWorkspaceCollectionState();
      const tab = query.get("tab") || "overview";
      activateTab(tab, false);
      setWorkspaceLoading(false);
      const contentLoaded = await ensureTabData(tab);
      if (sequence !== state.workspaceLoadSequence) return;
      const next = new URL(window.location.href);
      next.searchParams.set("dojo", state.course.referenceId || state.course.id);
      if (options.historyMode === "push") history.pushState(null, "", next);
      else if (options.historyMode !== "none") history.replaceState(null, "", next);
      syncQueryFromLocation();
      const requestedScroll = Math.max(0, Number.parseInt(next.searchParams.get("scroll") || "0", 10) || 0);
      if (requestedScroll) window.requestAnimationFrame(() => window.scrollTo({top: requestedScroll, behavior: "auto"}));
      if (contentLoaded) showNotice("");
    } catch (error) {
      if (sequence !== state.workspaceLoadSequence || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") return;
      if (elements.courseDetailView) elements.courseDetailView.setAttribute("aria-busy", "false");
      if (elements.courseMain) elements.courseMain.hidden = true;
      elements.loading.hidden = false;
      elements.loading.innerHTML = `<div class="course-list-empty"><span><i class="fas fa-exclamation-circle" aria-hidden="true"></i></span><h2>课程内容暂时无法载入</h2><p>${escape(error.message || "请检查网络后重试。")}</p><button class="hub-button is-secondary" type="button" data-retry-workspace-load="${escape(state.course.referenceId || state.course.id)}"><i class="fas fa-redo" aria-hidden="true"></i>重新加载</button></div>`;
      showNotice(error.message || "无法加载课程中心。", "danger");
    } finally {
      if (state.workspaceController === controller) state.workspaceController = null;
    }
  }

  function openAgent(artifactType, prompt) {
    if (!state.course) return;
    const target = new URL("/teacher", window.location.origin);
    const courseName = state.course.name || "未命名课程";
    const request = String(prompt || "请协助处理教学任务")
      .replace(/当前课程与章节|当前章节|当前课程|这门课程/g, `课程“${courseName}”`);
    target.searchParams.set("artifactType", artifactType || "auto");
    target.searchParams.set("prompt", request);
    target.searchParams.set("candidateMode", "auto");
    window.location.href = target.pathname + target.search;
  }

  function runCreateOption(option) {
    if (!state.course || !state.createKind) return;
    const kind = state.createKind;
    closeCreateDialog({restoreFocus: false});
    if (kind === "courseware" && option === "upload") {
      elements.coursewareUpload?.click();
      return;
    }
    if (kind === "courseware" && option === "ai") {
      openAgent("slide-deck", "为这门课程生成一份可直接授课的课件。请先确认目标章节、学习目标、授课时长、学生基础和期望的互动方式，再开始生成。");
      return;
    }
    if (kind === "courseware" && option === "reuse") {
      openAgent("slide-deck", "请检索并分析这门课程已上传的资料，先让我选择来源和目标章节，再基于选定资料创建一份新的可授课课件，并保留来源与版本关系。");
      return;
    }
    if (kind === "question" && option === "manual") {
      const reference = encodeURIComponent(state.course.referenceId || state.course.id);
      window.location.href = `/teacher/courses/${reference}/practices/new`;
      return;
    }
    if (kind === "question" && option === "ai") {
      openAgent("question-set", "请为这门课程批量创建独立 CTF 题目。先确认目标章节、题目数量、知识点、难度分布、运行约束和发布方式；每道题必须各自生成、验证、保存和管理，部分失败时只重试失败项。");
      return;
    }
    if (kind === "question" && option === "reuse") {
      openAgent("question-set", "请检索我可复用的已有题目，按知识点、难度和运行方式列出候选，让我选择复用、改编或迁移到这门课程；不要覆盖原题。");
      return;
    }
    if (kind === "demo" && option === "simulation") {
      openAgent("simulation", "为这门课程生成一项交互模拟演示。请先确认目标章节、学习目标、输入、输出、预计时长和互动方式，再构建清晰的状态、操作与反馈流程。");
      return;
    }
    if (kind === "demo" && option === "attack-defense") {
      openAgent("attack-defense-scene", "为这门课程生成一个仅在授权隔离环境运行的攻防演示。请先确认目标章节、教学目标、拓扑、角色、输入输出、预计时长、安全边界和验证方式。");
    }
  }

  async function uploadCourseware(file) {
    if (!file || !state.course) return;
    const maximumBytes = 50 * 1024 * 1024;
    if (file.size > maximumBytes) {
      showNotice("文件超过 50 MB，请压缩或拆分后再上传。", "danger");
      elements.coursewareUpload.value = "";
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("dojoId", state.course.id);
    showNotice(`正在上传“${file.name}”…`);
    try {
      const data = unwrap(await api.multipart(
        "/teaching/materials",
        form,
        "课件上传失败，请稍后重试。",
      ));
      await loadCourseContent("materials", {resetPage: true});
      showNotice(data.deduplicated ? "这份课件已经上传过。" : "上传成功，正在分析课程内容。", "success");
    } catch (error) {
      showNotice(error.message || "课件上传失败，请稍后重试。", "danger");
    } finally {
      elements.coursewareUpload.value = "";
    }
  }

  function managedTarget(trigger) {
    const kind = trigger.dataset.manageKind;
    if (kind === "course") {
      const course = (state.context.teacherDojos || []).find(item =>
        String(item.referenceId || item.id) === String(trigger.dataset.manageId || state.course?.referenceId || state.course?.id)
      ) || state.course;
      return course ? {kind, id: course.referenceId || course.id, name: course.name || "未命名课程"} : null;
    }
    return {
      kind,
      id: trigger.dataset.manageId,
      name: trigger.dataset.manageName,
      moduleId: trigger.dataset.manageModuleId,
      moduleIndex: trigger.dataset.manageModuleIndex,
    };
  }

  function managedEndpoint(target) {
    const courseReference = encodeURIComponent(state.course?.referenceId || state.course?.id || target.id);
    if (target.kind === "course") return `/teaching/courses/${encodeURIComponent(target.id)}`;
    if (target.kind === "module") return `/teaching/courses/${courseReference}/modules/${encodeURIComponent(target.id)}`;
    if (target.kind === "challenge") return `/learning/dojos/${courseReference}/catalog/${encodeURIComponent(target.moduleId)}/${encodeURIComponent(target.id)}`;
    if (target.kind === "draft") return `/learning/drafts/${encodeURIComponent(target.id)}`;
    if (target.kind === "material") return `/teaching/materials/${encodeURIComponent(target.id)}`;
    if (target.kind === "artifact" || target.kind === "demo") return `/teaching/artifacts/${encodeURIComponent(target.id)}`;
    throw new Error("不支持的内容类型。");
  }

  function managedLabel(kind) {
    return ({course: "课程", module: "章节", challenge: "CTF 题目", draft: "题目草稿", material: "课程资料", artifact: "课件", demo: "演示"})[kind] || "内容";
  }

  async function renameManaged(trigger) {
    const target = managedTarget(trigger);
    if (!target) return;
    const label = managedLabel(target.kind);
    const value = await window.AISecEduUI.prompt(`修改${label}名称`, {
      title: `重命名${label}`,
      inputLabel: "新名称",
      value: target.name || "",
      maxLength: ["course", "module", "challenge", "draft"].includes(target.kind) ? 128 : 240,
      confirmLabel: "保存名称",
    });
    if (value === null) return;
    const name = value.trim();
    if (!name) {
      showNotice("名称不能为空。", "danger");
      return;
    }
    try {
      const body = ["material", "artifact", "demo"].includes(target.kind)
        ? {title: name}
        : {name};
      const data = unwrap(await api.json("PATCH", managedEndpoint(target), body));
      if (target.kind === "course") {
        const course = (state.context.teacherDojos || []).find(item => String(item.referenceId || item.id) === String(target.id));
        if (course) course.name = data.course?.name || name;
        if (state.course && String(state.course.referenceId || state.course.id) === String(target.id)) {
          state.course.name = data.course?.name || name;
          renderAll();
        }
        renderCourseList();
      } else if (target.kind === "module") {
        const module = (state.course.modules || []).find(item => item.index === Number(target.id));
        if (module) module.name = data.module?.name || name;
        renderModules();
        renderChallenges();
      } else if (target.kind === "challenge") {
        const module = (state.course.modules || []).find(item => item.index === Number(target.moduleIndex));
        const challenge = module && (module.challenges || []).find(item => item.id === target.id);
        if (challenge) challenge.name = data.challenge?.name || name;
        renderModules();
        await loadQuestionContent();
      } else if (target.kind === "draft") {
        await loadQuestionContent();
      } else if (target.kind === "material") {
        const material = state.materials.find(item => item.id === target.id);
        if (material) material.title = data.material?.title || name;
        renderMaterials();
      } else if (target.kind === "artifact" || target.kind === "demo") {
        const artifact = state.artifacts.find(item => item.id === target.id);
        if (artifact) artifact.title = data.artifact?.title || name;
        renderArtifacts();
        renderSimulations();
        renderActivity();
      }
      showNotice(`${label}名称已更新。`, "success");
    } catch (error) {
      showNotice(error.message || `无法修改${label}名称。`, "danger");
    }
  }

  async function deleteManaged(trigger) {
    const target = managedTarget(trigger);
    if (!target) return;
    const label = managedLabel(target.kind);
    let consequences = {
      course: "课程中的章节、课件、题目、演示和成员关系会一并移除。",
      module: "章节中的所有 CTF 题目及关联学习记录会一并移除。",
      challenge: "题目、运行资产及关联学习记录会一并移除。",
      draft: "该未发布题目会从课程题目列表彻底消失；同批次的其他题目不受影响。",
      material: "该资料会从当前资料库归档，历史来源记录会保留。",
      artifact: "该课件会从课程内容库移除。",
      demo: "该演示会从课程内容库移除。",
    }[target.kind] || "该内容会被删除。";
    if (target.kind === "material") {
      try {
        const detail = unwrap(await api.request(managedEndpoint(target)));
        const impact = detail.material?.impact || {};
        if (Number(impact.affectedCount || 0)) {
          consequences = `该资料关联 ${Number(impact.affectedCount)} 个课件或演示${Number(impact.publishedCount || 0) ? `，其中 ${Number(impact.publishedCount)} 个已发布` : ""}。资料将归档而非硬删除，现有产物、发布版本和来源记录均会保留。`;
        }
      } catch (error) {
        showNotice("暂时无法确认资料影响范围，请稍后重试。", "danger");
        return;
      }
    }
    const confirmed = await window.AISecEduUI.confirm(
      `确认${target.kind === "material" ? "归档" : "删除"}“${target.name}”？${consequences}`,
      {title: `${target.kind === "material" ? "归档" : "删除"}${label}`, confirmLabel: target.kind === "material" ? "确认归档" : "确认删除", confirmStyle: "danger"},
    );
    if (!confirmed) return;
    const coursewareRequest = target.kind === "artifact";
    if (coursewareRequest) {
      state.coursewareBulkBusy = true;
      state.coursewareBulkStatus = "正在删除 1 份课件…";
      syncCoursewareManagementUi();
    }
    try {
      const result = unwrap(await api.json("DELETE", managedEndpoint(target), {}));
      if (target.kind === "course") {
        state.context.teacherDojos = (state.context.teacherDojos || []).filter(item =>
          String(item.referenceId || item.id) !== String(target.id)
        );
        state.course = null;
        history.replaceState(null, "", "/teacher/courses");
        setCourseView("list");
        await loadCourseCollection();
      } else if (target.kind === "module") {
        state.course.modules = (state.course.modules || []).filter(item => item.index !== Number(target.id));
        renderAll();
      } else if (target.kind === "challenge") {
        const module = (state.course.modules || []).find(item => item.index === Number(target.moduleIndex));
        if (module) module.challenges = (module.challenges || []).filter(item => item.id !== target.id);
        renderModules();
        await loadQuestionContent({resetPage: true});
        renderMetrics();
      } else if (target.kind === "draft") {
        await loadQuestionContent({resetPage: true});
        renderMetrics();
      } else if (target.kind === "material") {
        await loadCourseContent("materials");
      } else if (target.kind === "artifact" || target.kind === "demo") {
        if (target.kind === "artifact") state.selectedCoursewareIds.delete(String(target.id));
        await loadCourseContent(target.kind === "demo" ? "demos" : "courseware");
        renderMetrics();
        renderActivity();
      }
      if (coursewareRequest) state.coursewareBulkStatus = "已删除 1 份课件";
      showNotice(result.message || `${label}${target.kind === "material" ? "已归档" : "已删除"}。`, "success");
    } catch (error) {
      if (coursewareRequest) state.coursewareBulkStatus = "删除失败，列表未改变";
      showNotice(error.message || `无法删除${label}。`, "danger");
    } finally {
      if (coursewareRequest) {
        state.coursewareBulkBusy = false;
        syncCoursewareManagementUi();
      }
    }
  }

  async function duplicateArtifact(trigger) {
    const artifactId = trigger.dataset.artifactId;
    if (!artifactId || trigger.disabled) return;
    trigger.disabled = true;
    trigger.setAttribute("aria-busy", "true");
    try {
      const data = unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(artifactId)}/duplicate`, {}));
      await loadCourseContent("demos", {resetPage: true});
      showNotice(`已创建“${data.artifact?.title || "演示副本"}”，副本为仅教师可见的草稿。`, "success");
    } catch (error) {
      showNotice(error.message || "复制演示失败。", "danger");
    } finally {
      trigger.disabled = false;
      trigger.removeAttribute("aria-busy");
    }
  }

  async function init() {
    try {
      const requestedCourse = query.get("dojo");
      if (requestedCourse) {
        setCourseView("detail");
        elements.title.textContent = "正在载入课程…";
        setWorkspaceLoading(true);
        const encodedCourse = encodeURIComponent(requestedCourse);
        const [contextPayload, workspacePayload] = await Promise.all([
          api.request(`/teaching/context?view=teacher-focus&dojo=${encodedCourse}`, {cacheTtlMs: 15000}),
          api.request(`/teaching/courses/${encodedCourse}/workspace?includeLearning=0&includeCollections=0`),
        ]);
        state.context = unwrap(contextPayload);
        await loadCourse(requestedCourse, {workspace: unwrap(workspacePayload)});
      }
      else {
        state.context = {teacherDojos: [], asOf: null};
        setCourseView("list");
        showNotice("");
        await loadCourseCollection();
      }
    } catch (error) {
      setCourseView("list");
      elements.courseListLoading.innerHTML = `<div class="cs-empty">${escape(error.message || "无法初始化课程中心")}</div>`;
      showNotice(error.message || "无法初始化课程中心。", "danger");
    }
  }

  document.addEventListener("click", event => {
    const filterReset = event.target.closest("[data-filter-reset]");
    if (filterReset) {
      event.preventDefault();
      resetFilterDrawer(filterReset.dataset.filterReset);
      return;
    }
    const filterClose = event.target.closest("[data-filter-close]");
    if (filterClose) {
      event.preventDefault();
      closeFilterDrawer();
      return;
    }
    const filterTrigger = event.target.closest("[data-filter-trigger]");
    if (filterTrigger) {
      event.preventDefault();
      openFilterDrawer(filterTrigger.dataset.filterTrigger, filterTrigger);
      return;
    }
    if (event.target === elements.filterBackdrop) {
      event.preventDefault();
      closeFilterDrawer();
      return;
    }
    const chapterToggle = event.target.closest("[data-workspace-chapter][data-chapter-key]");
    if (chapterToggle) {
      event.preventDefault();
      toggleWorkspaceChapter(chapterToggle.dataset.workspaceChapter, chapterToggle.dataset.chapterKey);
      return;
    }
    const clearCourseFilters = event.target.closest("[data-clear-course-filters]");
    if (clearCourseFilters) {
      event.preventDefault();
      if (elements.courseSearch) elements.courseSearch.value = "";
      if (elements.courseFilter) elements.courseFilter.value = "all";
      if (elements.courseSort) elements.courseSort.value = "recent";
      void loadCourseCollection();
      return;
    }
    const retryCourseLoad = event.target.closest("[data-retry-course-load]");
    if (retryCourseLoad) {
      event.preventDefault();
      void loadCourseCollection();
      return;
    }
    const retryWorkspaceLoad = event.target.closest("[data-retry-workspace-load]");
    if (retryWorkspaceLoad) {
      event.preventDefault();
      void loadCourse(retryWorkspaceLoad.dataset.retryWorkspaceLoad, {historyMode: "push"});
      return;
    }
    const courseLink = event.target.closest(".teacher-course-card-main");
    if (courseLink) {
      const card = courseLink.closest("[data-course-card]");
      if (card?.dataset.courseCard) {
        event.preventDefault();
        void loadCourse(card.dataset.courseCard, {historyMode: "push"});
      }
      return;
    }
    const courseLoadMore = event.target.closest("[data-course-load-more]");
    if (courseLoadMore) {
      event.preventDefault();
      if (!courseLoadMore.disabled && state.coursePaging.hasNext) {
        void loadCourseCollection({page: state.coursePaging.page + 1, append: true});
      }
      return;
    }
    const questionPage = event.target.closest("[data-question-page]");
    if (questionPage) {
      event.preventDefault();
      if (!questionPage.disabled) {
        void loadQuestionContent({page: Math.max(1, Number(questionPage.dataset.questionPage || 1))});
        document.getElementById("ctf-library")?.scrollIntoView({block: "start"});
      }
      return;
    }
    const batchDismiss = event.target.closest("[data-question-batch-dismiss]");
    if (batchDismiss) {
      event.preventDefault();
      dismissQuestionBatchReview();
      return;
    }
    const batchRetryItem = event.target.closest("[data-question-batch-retry-item]");
    if (batchRetryItem) {
      event.preventDefault();
      void retryQuestionBatchItem(Number(batchRetryItem.dataset.questionBatchRetryItem), batchRetryItem);
      return;
    }
    const batchRetryAll = event.target.closest("[data-question-batch-retry-all]");
    if (batchRetryAll) {
      event.preventDefault();
      void retryQuestionBatchItem(null, batchRetryAll);
      return;
    }
    const batchSelectCreated = event.target.closest("[data-question-batch-select-created]");
    if (batchSelectCreated) {
      event.preventDefault();
      void selectQuestionBatchDrafts();
      return;
    }
    const questionCountFilter = event.target.closest("[data-question-count-filter]");
    if (questionCountFilter) {
      event.preventDefault();
      if (elements.questionStatus) elements.questionStatus.value = questionCountFilter.dataset.questionCountFilter || "";
      void loadQuestionContent({resetPage: true});
      return;
    }
    const clearQuestionFilters = event.target.closest("[data-clear-question-filters]");
    if (clearQuestionFilters) {
      event.preventDefault();
      [elements.questionSearch, elements.questionStatus, elements.questionModule, elements.questionRequired, elements.questionMode].forEach(node => { if (node) node.value = ""; });
      if (elements.questionSort) elements.questionSort.value = "course_order";
      void loadQuestionContent({resetPage: true});
      return;
    }
    const retryQuestionLoad = event.target.closest("[data-retry-question-load]");
    if (retryQuestionLoad) {
      event.preventDefault();
      void loadQuestionContent();
      return;
    }
    const retryQuestionDraft = event.target.closest("[data-retry-question-draft]");
    if (retryQuestionDraft) {
      event.preventDefault();
      void loadQuestionDraftIntoDrawer(retryQuestionDraft.dataset.retryQuestionDraft);
      return;
    }
    const openQuestionDraft = event.target.closest("[data-open-question-draft]");
    if (openQuestionDraft) {
      event.preventDefault();
      void openQuestionDrawer(openQuestionDraft.dataset.openQuestionDraft, openQuestionDraft);
      return;
    }
    const questionAction = event.target.closest("[data-question-action]");
    if (questionAction) {
      event.preventDefault();
      void runQuestionDrawerAction(questionAction.dataset.questionAction, questionAction.dataset.draftId, questionAction);
      return;
    }
    const contentPage = event.target.closest("[data-content-page]");
    if (contentPage) {
      event.preventDefault();
      if (!contentPage.disabled) {
        void loadCourseContent(contentPage.dataset.contentKind, {page: Number(contentPage.dataset.contentPage)});
      }
      return;
    }
    const materialPreview = event.target.closest("[data-material-preview]");
    if (materialPreview) {
      event.preventDefault();
      void openMaterialPreview(materialPreview.dataset.materialPreview, materialPreview);
      return;
    }
    const materialAnalyze = event.target.closest("[data-material-analyze]");
    if (materialAnalyze) {
      event.preventDefault();
      const item = state.materials.find(row => String(row.id) === String(materialAnalyze.dataset.materialAnalyze));
      if (item) {
        const prompt = `请分析课程“${state.course?.name || "未命名课程"}”中课件“${item.title || item.filename}”的功能点、知识图谱和章节建议`;
        openAgent("auto", prompt);
      }
      return;
    }
    const clearContent = event.target.closest("[data-clear-content-filters]");
    if (clearContent) {
      event.preventDefault();
      clearContentFilters(clearContent.dataset.clearContentFilters);
      return;
    }
    const createTrigger = event.target.closest("[data-create-kind]");
    if (createTrigger) {
      event.preventDefault();
      openCreateDialog(createTrigger.dataset.createKind, createTrigger);
      return;
    }
    const createOption = event.target.closest("[data-create-option]");
    if (createOption) {
      event.preventDefault();
      runCreateOption(createOption.dataset.createOption);
      return;
    }
    const coursewareManagementToggle = event.target.closest("[data-courseware-management-toggle]");
    if (coursewareManagementToggle) {
      event.preventDefault();
      void setCoursewareManagement(!state.coursewareManagement);
      return;
    }
    const coursewareBatchAction = event.target.closest("[data-courseware-batch-action]");
    if (coursewareBatchAction) {
      event.preventDefault();
      void runCoursewareBatchAction(coursewareBatchAction.dataset.coursewareBatchAction);
      return;
    }
    const questionManagementToggle = event.target.closest("[data-question-management-toggle]");
    if (questionManagementToggle) {
      event.preventDefault();
      void setQuestionManagement(!state.questionManagement);
      return;
    }
    const questionBatchAction = event.target.closest("[data-question-batch-action]");
    if (questionBatchAction) {
      event.preventDefault();
      void runQuestionBatchAction(questionBatchAction.dataset.questionBatchAction, questionBatchAction);
      return;
    }
    const demoManagementToggle = event.target.closest("[data-demo-management-toggle]");
    if (demoManagementToggle) {
      event.preventDefault();
      void setDemoManagement(!state.demoManagement);
      return;
    }
    const management = event.target.closest("[data-manage-action]");
    if (management) {
      event.preventDefault();
      if (state.coursewareBulkBusy && management.dataset.manageKind === "artifact") {
        showNotice("正在批量删除课件，请稍候。", "info");
        return;
      }
      if (state.questionOrderSaving && management.dataset.manageKind === "challenge") {
        showNotice("正在保存题目顺序，请稍候。", "info");
        return;
      }
      if (state.demoOrderSaving && management.dataset.manageKind === "demo") {
        showNotice("正在保存演示顺序，请稍候。", "info");
        return;
      }
      if (management.dataset.manageAction === "rename") renameManaged(management);
      if (management.dataset.manageAction === "delete") deleteManaged(management);
      return;
    }
    const artifactAction = event.target.closest("[data-artifact-action]");
    if (artifactAction) {
      event.preventDefault();
      if (artifactAction.dataset.artifactAction === "duplicate") void duplicateArtifact(artifactAction);
      return;
    }
    const tab = event.target.closest("[data-cs-tab]");
    if (tab) activateTab(tab.dataset.csTab, true);
    const target = event.target.closest("[data-cs-tab-target]");
    if (target) activateTab(target.dataset.csTabTarget, true);
    const generator = event.target.closest("[data-agent-artifact]");
    if (generator) openAgent(generator.dataset.agentArtifact, generator.dataset.agentPrompt || "");
  });

  elements.artifactList?.addEventListener("change", event => {
    const selector = event.target.closest("[data-courseware-select]");
    if (!selector || !state.coursewareManagement || state.coursewareBulkBusy || selector.dataset.deletable !== "true") return;
    const artifactId = String(selector.dataset.coursewareSelect || "");
    if (!artifactId) return;
    if (selector.checked) state.selectedCoursewareIds.add(artifactId);
    else state.selectedCoursewareIds.delete(artifactId);
    state.coursewareBulkStatus = "";
    syncCoursewareManagementUi();
  });

  elements.challengeList?.addEventListener("change", event => {
    const selector = event.target.closest("[data-question-draft-select]");
    if (!selector || !state.questionManagement || state.questionBulkBusy) return;
    const draftId = String(selector.dataset.questionDraftSelect || "");
    if (!draftId) return;
    if (selector.checked) state.selectedQuestionDraftIds.add(draftId);
    else state.selectedQuestionDraftIds.delete(draftId);
    syncQuestionBatchControls();
  });

  elements.challengeList?.addEventListener("dragstart", event => {
    const handle = event.target.closest(".cs-question-drag-handle");
    const row = handle?.closest(".cs-challenge-row[data-question-key], .cs-challenge-row[data-question-draft-id]");
    if (!row || !state.questionManagement || state.questionOrderSaving) {
      event.preventDefault();
      return;
    }
    const draftId = row.dataset.questionDraftId || "";
    state.questionDrag = {
      row,
      kind: draftId ? "draft" : "published",
      draftId,
      previousModuleIndex: row.dataset.questionDraftModule,
      accepted: false,
      initialSignature: questionLayoutSignature(questionLayoutFromState()),
    };
    row.classList.add("is-dragging");
    handle.setAttribute("aria-grabbed", "true");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draftId || row.dataset.questionKey);
    }
  });

  elements.challengeList?.addEventListener("dragover", event => {
    const drag = state.questionDrag;
    const zone = event.target.closest(".cs-challenge-dropzone");
    if (!drag || !zone || !state.questionManagement || state.questionOrderSaving) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    elements.challengeList.querySelectorAll(".cs-challenge-dropzone.is-drag-over").forEach(item => {
      if (item !== zone) item.classList.remove("is-drag-over");
    });
    zone.classList.add("is-drag-over");
    const after = questionDragAfterElement(zone, event.clientY);
    if (after) zone.insertBefore(drag.row, after);
    else zone.appendChild(drag.row);
    syncQuestionDropzonePlaceholders();
  });

  elements.challengeList?.addEventListener("drop", event => {
    const drag = state.questionDrag;
    const zone = event.target.closest(".cs-challenge-dropzone");
    if (!drag || !zone || !state.questionManagement || state.questionOrderSaving) return;
    event.preventDefault();
    drag.accepted = true;
    drag.row.querySelector(".cs-question-drag-handle")?.setAttribute("aria-grabbed", "false");
    state.questionDrag = null;
    clearQuestionDragVisuals();
    if (drag.kind === "draft") {
      const group = zone.closest(".cs-challenge-group[data-module-index]");
      void persistQuestionDraftModule(drag.draftId, Number(group?.dataset.moduleIndex), drag.previousModuleIndex);
    } else {
      void persistQuestionLayout(questionLayoutFromDom(), drag.initialSignature);
    }
  });

  elements.challengeList?.addEventListener("dragend", () => {
    const drag = state.questionDrag;
    if (!drag) return;
    const accepted = drag.accepted;
    drag.row.querySelector(".cs-question-drag-handle")?.setAttribute("aria-grabbed", "false");
    clearQuestionDragVisuals();
    state.questionDrag = null;
    if (!accepted && !state.questionOrderSaving) renderChallenges();
  });

  elements.simulationList?.addEventListener("dragstart", event => {
    const handle = event.target.closest(".cs-demo-drag-handle");
    const row = handle?.closest("[data-demo-id]");
    if (!row || !state.demoManagement || state.demoOrderSaving) {
      event.preventDefault();
      return;
    }
    state.demoDrag = {
      row,
      accepted: false,
      initialSignature: demoLayoutSignature(demoLayoutFromState()),
    };
    row.classList.add("is-dragging");
    handle.setAttribute("aria-grabbed", "true");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.dataset.demoId);
    }
  });

  elements.simulationList?.addEventListener("dragover", event => {
    const drag = state.demoDrag;
    const zone = event.target.closest(".cs-demo-dropzone");
    if (!drag || !zone || !state.demoManagement || state.demoOrderSaving) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    elements.simulationList.querySelectorAll(".cs-demo-dropzone.is-drag-over").forEach(item => {
      if (item !== zone) item.classList.remove("is-drag-over");
    });
    zone.classList.add("is-drag-over");
    const after = demoDragAfterElement(zone, event.clientY);
    if (after) zone.insertBefore(drag.row, after);
    else zone.appendChild(drag.row);
    syncDemoDropzonePlaceholders();
  });

  elements.simulationList?.addEventListener("drop", event => {
    const drag = state.demoDrag;
    const zone = event.target.closest(".cs-demo-dropzone");
    if (!drag || !zone || !state.demoManagement || state.demoOrderSaving) return;
    event.preventDefault();
    drag.accepted = true;
    const layout = demoLayoutFromDom();
    drag.row.querySelector(".cs-demo-drag-handle")?.setAttribute("aria-grabbed", "false");
    state.demoDrag = null;
    clearDemoDragVisuals();
    void persistDemoLayout(layout, drag.initialSignature);
  });

  elements.simulationList?.addEventListener("dragend", () => {
    const drag = state.demoDrag;
    if (!drag) return;
    const accepted = drag.accepted;
    drag.row.querySelector(".cs-demo-drag-handle")?.setAttribute("aria-grabbed", "false");
    clearDemoDragVisuals();
    state.demoDrag = null;
    if (!accepted && !state.demoOrderSaving) renderSimulations();
  });

  document.querySelector(".course-hub-tabs")?.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(document.querySelectorAll("[data-cs-tab]"));
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    activateTab(tabs[nextIndex].dataset.csTab, true);
  });
  window.addEventListener("scroll", scheduleWorkspaceScrollState, {passive: true});
  window.addEventListener("popstate", () => {
    syncQueryFromLocation();
    const requestedCourse = query.get("dojo");
    if (requestedCourse) {
      void loadCourse(requestedCourse, {historyMode: "none"});
      return;
    }
    state.workspaceLoadSequence += 1;
    state.workspaceController?.abort();
    state.workspaceController = null;
    setCourseView("list");
    showNotice("");
    renderCourseList();
  });
  window.addEventListener("resize", () => {
    if (state.filterDrawerKind && (!window.matchMedia || !window.matchMedia("(max-width: 580px)").matches)) {
      closeFilterDrawer({restoreFocus: false});
    }
  });
  document.addEventListener("keydown", handleFilterDrawerKeydown);

  elements.copyCourseCode?.addEventListener("click", () => {
    void writeCourseCodeToClipboard();
  });
  elements.regenerateCourseCode?.addEventListener("click", () => {
    void regenerateCourseCode();
  });
  elements.courseCodeTrigger?.addEventListener("click", openCourseCodeDialog);
  elements.courseCodeDialog?.addEventListener("click", event => {
    if (event.target.closest("[data-course-code-close]")) closeCourseCodeDialog();
  });
  elements.courseCodeDialog?.addEventListener("keydown", handleCourseCodeDialogKeydown);
  elements.materialPreviewDialog?.addEventListener("click", event => {
    if (event.target.closest("[data-material-preview-close]")) closeMaterialPreview();
  });
  elements.materialPreviewDialog?.addEventListener("keydown", event => {
    trapDialogFocus(event, elements.materialPreviewCard, closeMaterialPreview);
  });
  elements.createDialog?.addEventListener("click", event => {
    if (event.target.closest("[data-create-close]")) closeCreateDialog();
  });
  elements.createDialog?.addEventListener("keydown", handleCreateDialogKeydown);
  elements.coursewareUpload.addEventListener("change", () => uploadCourseware(elements.coursewareUpload.files[0]));
  elements.courseSearch?.addEventListener("input", scheduleCourseCollectionLoad);
  elements.courseFilter?.addEventListener("change", () => void loadCourseCollection());
  elements.courseSort?.addEventListener("change", () => void loadCourseCollection());
  [
    [elements.materialSearch, "materials"],
    [elements.artifactSearch, "courseware"],
    [elements.demoSearch, "demos"],
  ].forEach(([node, kind]) => node?.addEventListener("input", () => scheduleCourseContentLoad(kind)));
  [
    [elements.materialStatus, "materials"],
    [elements.materialSort, "materials"],
    [elements.artifactStatus, "courseware"],
    [elements.artifactModule, "courseware"],
    [elements.artifactType, "courseware"],
    [elements.artifactSource, "courseware"],
    [elements.artifactSort, "courseware"],
    [elements.demoType, "demos"],
    [elements.demoModule, "demos"],
    [elements.demoStatus, "demos"],
    [elements.demoSort, "demos"],
  ].forEach(([node, kind]) => node?.addEventListener("change", () => {
    void loadCourseContent(kind, {resetPage: true});
  }));
  elements.questionSearch?.addEventListener("input", () => {
    window.clearTimeout(state.questionSearchTimer);
    state.questionSearchTimer = window.setTimeout(() => {
      void loadQuestionContent({resetPage: true});
    }, 260);
  });
  [elements.questionStatus, elements.questionModule, elements.questionRequired, elements.questionMode, elements.questionSort].forEach(node => node?.addEventListener("change", () => {
    void loadQuestionContent({resetPage: true});
  }));
  elements.questionDrawer?.addEventListener("click", event => {
    if (event.target.closest("[data-question-drawer-close]")) closeQuestionDrawer();
  });
  elements.questionDrawer?.addEventListener("keydown", event => {
    trapDialogFocus(event, elements.questionDrawerPanel, closeQuestionDrawer);
  });
  document.getElementById("cs-student-search")?.addEventListener("input", renderStudents);
  document.getElementById("cs-student-risk-filter")?.addEventListener("change", renderStudents);
  document.getElementById("cs-student-evidence-filter")?.addEventListener("change", renderStudents);
  document.getElementById("cs-clear-cohort-filter")?.addEventListener("click", () => {
    state.studentCohortIds = null;
    renderStudents();
  });
  document.getElementById("cs-student-table")?.addEventListener("click", event => {
    const trigger = event.target.closest("[data-open-student]");
    const row = event.target.closest("[data-student-id]");
    if (trigger) openStudentDrawer(trigger.dataset.openStudent, trigger);
    else if (row) openStudentDrawer(row.dataset.studentId, row);
  });
  document.getElementById("cs-student-table")?.addEventListener("keydown", event => {
    const row = event.target.closest("[data-student-id]");
    if (!row || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openStudentDrawer(row.dataset.studentId, row);
  });
  document.getElementById("cs-intervention-list")?.addEventListener("click", event => {
    const trigger = event.target.closest("[data-intervention-id]");
    if (!trigger) return;
    const intervention = ((state.progress && state.progress.interventions) || []).find(item => item.id === trigger.dataset.interventionId);
    if (!intervention) return;
    state.studentCohortIds = new Set((intervention.studentIds || []).map(Number));
    document.getElementById("cs-student-risk-filter").value = "all";
    document.getElementById("cs-student-evidence-filter").value = "all";
    renderStudents();
    document.querySelector(".cs-learning-roster")?.scrollIntoView({behavior: "smooth", block: "start"});
  });
  elements.studentDrawer?.addEventListener("click", event => {
    if (event.target.closest("[data-student-drawer-close]")) closeStudentDrawer();
  });
  elements.studentDrawer?.addEventListener("keydown", event => {
    trapDialogFocus(event, elements.studentDrawerPanel, closeStudentDrawer);
  });
  elements.studentDrawerBody?.addEventListener("click", event => {
    const logTrigger = event.target.closest("[data-log-intervention]");
    if (logTrigger) {
      void logStudentIntervention(logTrigger.dataset.logIntervention, logTrigger);
      return;
    }
    const reviewTrigger = event.target.closest("[data-review-intervention]");
    if (reviewTrigger) {
      void reviewStudentIntervention(
        reviewTrigger.dataset.reviewIntervention,
        reviewTrigger.dataset.reviewStudent,
        reviewTrigger,
      );
      return;
    }
    const trigger = event.target.closest("[data-student-agent]");
    if (!trigger) return;
    const student = ((state.progress && state.progress.students) || []).find(item => Number(item.userId) === Number(trigger.dataset.studentAgent));
    if (!student) return;
    const weak = (student.weakSkills || []).slice(0, 2).map(item => item.label).join("、") || "尚未形成能力评估";
    const risks = (student.riskSignals || []).map(item => item.label).join("、") || "当前无明确风险";
    openAgent("auto", `请为课程“${state.course.name || "未命名课程"}”中的学生“${student.name}”制定一份可执行、不过度推断的教学干预方案。真实完成率为${Math.round(Number(student.verifiedCompletion || 0) * 100)}%，主要薄弱维度为${weak}，当前信号为${risks}。请先区分证据事实与推断，再给出诊断问题、下一项小目标、教师支持方式、复查时间与判断干预是否有效的指标。`);
  });
  elements.learningStudent?.addEventListener("change", () => void applyLearningScopeChange("student"));
  elements.learningModule?.addEventListener("change", () => void applyLearningScopeChange("module"));
  elements.learningQuestion?.addEventListener("change", () => void applyLearningScopeChange("question"));
  elements.learningRange?.addEventListener("change", () => void applyLearningScopeChange("range"));
  document.getElementById("cs-reset-learning-scope")?.addEventListener("click", () => {
    populateLearningScopeControls({studentId: "", moduleIndex: "", challengeId: "", timeRange: "12w"});
    void applyLearningScopeChange("reset");
  });
  document.getElementById("cs-export-learning")?.addEventListener("click", () => {
    if (!state.course) return;
    syncLearningScopeUrl();
    const link = document.createElement("a");
    link.href = `/pwncollege_api/v1/teaching/progress/${encodeURIComponent(state.course.referenceId || state.course.id)}/export?${learningScopeParams().toString()}`;
    link.download = "";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showNotice("正在导出当前筛选范围的学情数据。", "success");
  });
  document.getElementById("cs-refresh-progress")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const icon = button.querySelector("i");
    const label = button.querySelector("span");
    button.disabled = true;
    icon?.classList.add("fa-spin");
    if (label) label.textContent = "正在刷新";
    try {
      await reloadLearningProgress();
      showNotice("学习证据已刷新。", "success");
    } catch (error) {
      showNotice(error.message || "刷新失败。", "danger");
    } finally {
      button.disabled = false;
      icon?.classList.remove("fa-spin");
      if (label) label.textContent = "刷新证据";
    }
  });
  init();
})();

(function () {
  "use strict";

  const root = document.getElementById("learning-overview");
  const api = window.DojoLearning;
  if (!root || !api) return;

  const notice = document.getElementById("learning-overview-notice");
  const pageStartedAt = performance.now();

  function escape(value) {
    return api.escapeHtml(value);
  }

  function unwrap(payload) {
    if (!payload || payload.success !== true) {
      throw new Error(api.errorMessage(payload, "无法加载今天的学习安排。"));
    }
    return payload.data || payload;
  }

  function normalizeCourseCode(value) {
    const code = String(value || "").replace(/[\s-]+/g, "").toUpperCase();
    return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : "";
  }

  function telemetry(event, properties) {
    api.json("POST", "/learning/telemetry", {event, properties}).catch(() => {});
  }

  function dateLabel(value) {
    if (!value) return "长期开放";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "时间待确认";
    const hours = Math.ceil((date.getTime() - Date.now()) / 3600000);
    if (hours < 0) return "已截止";
    if (hours < 24) return `${Math.max(1, hours)} 小时后截止`;
    if (hours < 168) return `${Math.ceil(hours / 24)} 天后截止`;
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日截止`;
  }

  function activityLabel(state) {
    return ({
      NOT_STARTED: "未开始",
      IN_PROGRESS: "作答已保存",
      SUBMITTED: "等待评分",
      COMPLETED: "已完成",
    })[state] || "状态待同步";
  }

  function kindMeta(kind) {
    return ({
      HOMEWORK: ["作业", "fa-pen-nib"],
      QUIZ: ["测验", "fa-check-double"],
      PRACTICE: ["练习", "fa-gamepad"],
      LAB: ["实验", "fa-terminal"],
      DEBATE: ["讨论", "fa-comments"],
    })[kind] || ["任务", "fa-clipboard-check"];
  }

  async function joinCourseByCode(trigger) {
    if (!window.AISecEduUI || !trigger) return;
    const value = await window.AISecEduUI.prompt(
      "输入授课教师提供的 8 位课程码，不区分大小写。",
      {
        title: "加入课程",
        inputLabel: "课程码",
        placeholder: "例如 ABCD-EFGH",
        maxLength: 16,
        confirmLabel: "确认加入",
      },
    );
    if (value === null) return;
    const code = normalizeCourseCode(value);
    if (!code) {
      window.AISecEduUI.notify("课程码格式不正确，请检查后重试。", "warning");
      trigger.focus();
      return;
    }
    const original = trigger.innerHTML;
    trigger.disabled = true;
    trigger.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>正在加入…';
    try {
      const result = unwrap(await api.json("POST", "/dojos/enrollment/code", {course_code: code}));
      const course = result.course || {};
      const enrollment = result.enrollment || {};
      window.AISecEduUI.notify(
        enrollment.alreadyEnrolled
          ? `你已经加入《${course.name || enrollment.courseName || "这门课程"}》。`
          : `已加入《${course.name || enrollment.courseName || "课程"}》。`,
        "success",
      );
      window.setTimeout(() => window.location.assign(course.learningUrl || "/student"), 450);
    } catch (error) {
      window.AISecEduUI.notify(error.message || "暂时无法加入课程，请核对课程码后重试。", "danger");
      trigger.disabled = false;
      trigger.innerHTML = original;
      trigger.focus();
    }
  }

  function nextActionIcon(type) {
    return ({
      CONTINUE_ATTEMPT: "fa-terminal",
      ASSIGNMENT: "fa-clipboard-check",
      PRACTICE: "fa-bullseye",
      COURSE_ITEM: "fa-book-open",
      COURSE_REVIEW: "fa-chart-line",
      JOIN_COURSE: "fa-key",
    })[type] || "fa-arrow-right";
  }

  function renderNextAction(action) {
    const target = document.getElementById("learning-next-action");
    const context = action.context || {};
    const meta = [
      context.courseName,
      action.estimatedMinutes ? `预计 ${action.estimatedMinutes} 分钟` : null,
      action.dueAt ? dateLabel(action.dueAt) : null,
    ].filter(Boolean).join(" · ");
    target.innerHTML = `
      <article class="sl-next-card">
        <span class="sl-next-icon"><i class="fas ${nextActionIcon(action.type)}" aria-hidden="true"></i></span>
        <div class="sl-next-copy">
          <span>${escape(action.label || "继续学习")}${meta ? ` · ${escape(meta)}` : ""}</span>
          <h2>${escape(action.title || "继续今天的学习")}</h2>
          <p><strong>为什么推荐：</strong>${escape(action.reason || "这是当前最适合继续的学习内容。")}</p>
          <small><i class="fas ${action.saved ? "fa-cloud-check" : "fa-circle"}" aria-hidden="true"></i>${escape(action.savedState || (action.saved ? "进度已保存" : "尚未开始"))}</small>
        </div>
        <a id="learning-next-action-start" class="cs-btn cs-btn-primary" href="${escape(action.href || "/dojos?tab=mine")}">${escape(action.label || "开始")}<i class="fas fa-arrow-right" aria-hidden="true"></i></a>
      </article>`;
    telemetry("student_next_action_viewed", {
      type: action.type,
      reasonCode: action.reasonCode,
      courseId: context.courseId,
      state: action.state,
    });
    document.getElementById("learning-next-action-start").addEventListener("click", () => {
      telemetry("student_next_action_started", {
        type: action.type,
        latencyMs: Math.round(performance.now() - pageStartedAt),
        sourcePage: "today",
      });
    });
  }

  function renderAssignments(rows) {
    const list = document.getElementById("learning-assignment-list");
    const empty = document.getElementById("learning-assignment-empty");
    const pending = rows
      .filter(item => item.status === "PUBLISHED" && item.activityState !== "COMPLETED")
      .sort((a, b) => new Date(a.dueAt || "2999-12-31") - new Date(b.dueAt || "2999-12-31"));
    list.innerHTML = pending.slice(0, 3).map(item => {
      const [label, icon] = kindMeta(item.kind);
      return `<a class="sl-task-card" href="/learning/assignments/${encodeURIComponent(item.id)}">
        <span class="sl-task-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
        <span><small>${escape(label)} · ${escape(item.courseName || "课程任务")}</small><strong>${escape(item.title || "未命名任务")}</strong><em>${escape(activityLabel(item.activityState))}</em></span>
        <span class="sl-task-due">${escape(dateLabel(item.dueAt))}<i class="fas fa-chevron-right" aria-hidden="true"></i></span>
      </a>`;
    }).join("");
    empty.hidden = pending.length !== 0;
    const badge = document.getElementById("learning-assignment-count");
    badge.textContent = pending.length ? `${pending.length} 项待办` : "暂无待办";
    badge.className = `cs-status ${pending.length ? "is-draft" : "is-published"}`;
  }

  function renderCourses(courses) {
    const list = document.getElementById("learning-course-list");
    const empty = document.getElementById("learning-course-empty");
    list.innerHTML = courses.slice(0, 3).map(course => {
      const progress = course.progress || {};
      if (progress.percent === null || progress.state === "NOT_APPLICABLE") {
        return `<a class="sl-course-card is-reading" href="${escape(course.learningUrl)}">
          <span><small>阅读课程 · 无必修实践</small><strong>${escape(course.name)}</strong><em>${escape(progress.label || "按课程资料学习")}</em></span>
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </a>`;
      }
      const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
      return `<a class="sl-course-card" href="${escape(course.learningUrl)}">
        <span><small>${escape(progress.label || "课程进度")}</small><strong>${escape(course.name)}</strong><em>${course.moduleCount} 个章节${course.nextItem ? ` · 下一项：${escape(course.nextItem.name)}` : ""}</em></span>
        <span class="sl-course-progress"><b>${Math.round(percent)}%</b><i><em style="width:${percent}%"></em></i><span class="sr-only">课程完成 ${Math.round(percent)}%</span></span>
      </a>`;
    }).join("");
    empty.hidden = courses.length !== 0;
    const first = courses[0];
    if (first) document.getElementById("learning-progress-link").href = first.learningUrl;
  }

  function renderMastery(overview) {
    const summary = overview.masterySummary || {};
    const skills = (overview.profile && overview.profile.weakestSkills || [])
      .filter(item => item.masteryState && item.masteryState.state !== "UNKNOWN")
      .slice(0, 3);
    const summaryTarget = document.getElementById("learning-mastery-summary");
    const list = document.getElementById("learning-skill-list");
    const empty = document.getElementById("learning-skill-empty");
    summaryTarget.innerHTML = `<span class="sl-evidence-state ${summary.state === "AVAILABLE" ? "is-available" : "is-unknown"}"><i class="fas ${summary.state === "AVAILABLE" ? "fa-shield-alt" : "fa-question-circle"}" aria-hidden="true"></i>${escape(summary.label || "尚无足够证据")}</span>`;
    list.innerHTML = skills.map(item => {
      const state = item.masteryState;
      return `<a class="sl-skill-row" href="/dojo/${encodeURIComponent(item.courseId)}/learning">
        <span><strong>${escape(item.label || "课程能力")}</strong><small>${escape(item.course || "课程")} · ${Number(item.evidenceCount || 0)} 条可核验证据</small></span>
        <span><em>${escape(state.label)}</em><i class="fas fa-arrow-right" aria-hidden="true"></i></span>
      </a>`;
    }).join("");
    empty.hidden = skills.length !== 0;
  }

  function renderDegraded(components) {
    const labels = {courses: "课程", assignments: "近期任务", profile: "学习证据", workspace: "个人成果"};
    const failed = Object.keys(components || {}).filter(key => components[key] === "DEGRADED");
    if (!failed.length) return;
    const box = document.createElement("div");
    box.className = "sl-degraded";
    box.setAttribute("role", "status");
    box.innerHTML = `<i class="fas fa-exclamation-triangle" aria-hidden="true"></i><span><strong>部分信息暂未同步</strong><small>${escape(failed.map(key => labels[key] || key).join("、"))}稍后会恢复，其他内容仍可使用。</small></span><button type="button" class="cs-btn cs-btn-secondary">重新加载</button>`;
    box.querySelector("button").addEventListener("click", () => window.location.reload());
    document.getElementById("learning-ready").prepend(box);
  }

  function renderStaleContext(context) {
    if (!context || context.state !== "STALE") return;
    const recovery = context.recovery || {};
    const box = document.createElement("div");
    box.className = "sl-stale-context";
    box.setAttribute("role", "status");
    box.innerHTML = `<i class="fas fa-history" aria-hidden="true"></i><span><strong>已忽略过期的学习位置</strong><small>${escape(context.message || "旧课程位置已失效，不会影响今天的推荐。")}</small></span><button type="button" class="cs-btn cs-btn-secondary">${escape(recovery.label || "清除旧记录")}</button>`;
    box.querySelector("button").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "正在清除…";
      try {
        await api.json("DELETE", recovery.href || "/learning/attempts/current");
        api.showNotice(notice, "旧学习位置已清除，正在重新计算今天的下一步。", "success");
        window.setTimeout(() => window.location.reload(), 350);
      } catch (error) {
        api.showNotice(notice, error.message || "暂时无法清除，请稍后重试。", "danger");
        button.disabled = false;
        button.textContent = recovery.label || "清除旧记录";
      }
    });
    document.querySelector(".sl-today-main").insertBefore(box, document.getElementById("learning-overview-loading").nextSibling);
  }

  function showOnboarding() {
    document.getElementById("learning-onboarding").hidden = false;
    const button = document.getElementById("learning-join-course-code");
    button.addEventListener("click", () => joinCourseByCode(button));
    if (window.location.hash === "#join-course") button.focus();
  }

  function showReady(overview) {
    document.getElementById("learning-ready").hidden = false;
    document.getElementById("learning-today-date").textContent = new Intl.DateTimeFormat("zh-CN", {month: "long", day: "numeric", weekday: "long"}).format(new Date());
    renderNextAction(overview.nextAction || {});
    renderAssignments(overview.assignments || []);
    renderCourses(overview.enrolledCourses || []);
    renderMastery(overview);
    const workspaceCount = Number(
      overview.workspace && overview.workspace.count != null
        ? overview.workspace.count
        : overview.workspace && overview.workspace.workspaces && overview.workspace.workspaces.length || 0
    );
    document.getElementById("learning-creation-summary").textContent = workspaceCount
      ? `${workspaceCount} 项个人成果 · 仅自己可见`
      : "查看个人课件、练习与演示";
    renderDegraded(overview.components || {});
  }

  async function init() {
    const slowTimer = window.setTimeout(() => {
      api.showNotice(notice, "正在同步课程权限、截止任务和学习证据，请稍候…", "info");
    }, 8000);
    try {
      const overview = unwrap(await api.request("/learning/overview?view=home"));
      root.dataset.variant = overview.experience && overview.experience.variant || "v2";
      renderStaleContext(overview.staleContext);
      if (overview.state === "ONBOARDING") showOnboarding();
      else showReady(overview);
    } catch (error) {
      api.showNotice(notice, error.message || "暂时无法加载今天的学习安排。请刷新页面，或先浏览课程。", "danger");
      document.getElementById("learning-onboarding").hidden = false;
      document.querySelector(".sl-onboarding-copy h1").textContent = "学习安排暂时没有同步好";
      document.querySelector(".sl-onboarding-copy p").textContent = "你仍可以浏览课程或使用课程码加入；刷新后会重新计算今天的下一步。";
      const button = document.getElementById("learning-join-course-code");
      button.addEventListener("click", () => joinCourseByCode(button));
    } finally {
      window.clearTimeout(slowTimer);
      document.getElementById("learning-overview-loading").hidden = true;
      root.setAttribute("aria-busy", "false");
    }
  }

  init();
})();

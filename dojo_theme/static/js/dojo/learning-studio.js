document.addEventListener("DOMContentLoaded", function () {
  const root = document.getElementById("learning-studio");
  if (!root) return;

  const learning = window.DojoLearning;
  const dojoId = root.dataset.dojoId;
  const notice = document.getElementById("learning-studio-notice");
  let drafts = [];
  let selected = null;
  let busy = false;
  let jobs = [];
  let catalogItems = [];
  let activeJobId = null;
  let activeSolutionKey = null;
  let jobPollTimer = null;
  let solutionPollTimer = null;
  let jobsInitialized = false;
  const knownJobStatuses = new Map();

  function showStudioNotice(element, message, kind) {
    if (element) {
      element.hidden = true;
      element.textContent = "";
    }
    if (!message) return null;
    if (window.AISecEduUI) {
      return window.AISecEduUI.notify(message, kind || "info");
    }
    return learning.showNotice(element, message, kind);
  }

  function strategyLabel(value) {
    return ({L1: "复用现有题", L2: "改编现有题", L3: "新建题包"})[value] || value || "待选策";
  }

  function strategyProviderLabel(value) {
    return ({
      MODEL: "Agent 决策",
      TEACHER_DIRECTIVE: "教师明确指定",
      SYSTEM_OVERRIDE: "受信任流程指定",
      DETERMINISTIC: "安全回退",
    })[value] || value || "Agent 决策";
  }

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

  function draftStatusLabel(value) {
    return ({
      DRAFT: "草稿",
      BUILDING: "自主修订中",
      VALIDATED: "已校验",
      PUBLISHED: "已发布",
      FAILED: "失败",
    })[value] || value || "草稿";
  }

  function appealStatusLabel(value) {
    return ({OPEN: "待处理", RESOLVED: "已通过并复评", REJECTED: "已驳回"})[value] || value || "未知";
  }

  function setBusy(value) {
    busy = value;
    ["studio-create", "studio-publish", "studio-revise", "studio-import-submit"].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.disabled = value;
    });
  }

  function beginProgress(message) {
    if (!message) return function () {};
    const started = Date.now();
    const progressDialog = window.AISecEduUI
      ? window.AISecEduUI.dialog({
          kind: "progress",
          title: "Agent 任务进行中",
          message,
          subtitle: "关闭此窗口不会中断后台任务。",
          actions: false,
        })
      : null;
    const update = function () {
      const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
      if (progressDialog) {
        progressDialog.update({
          message: `${message}\n已用时 ${seconds} 秒。`,
        });
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return function () {
      window.clearInterval(timer);
      if (progressDialog) progressDialog.close("complete");
    };
  }

  function jobStatusClass(status) {
    return ({
      QUEUED: "secondary",
      RUNNING: "info",
      COMPLETED: "success",
      FAILED: "danger",
    })[status] || "secondary";
  }

  function jobStatusLabel(status) {
    return ({
      QUEUED: "排队中",
      RUNNING: "执行中",
      COMPLETED: "已完成",
      FAILED: "失败",
    })[status] || status || "未知";
  }

  function renderJobs() {
    const section = document.getElementById("studio-job-section");
    const list = document.getElementById("studio-job-list");
    const visible = jobs.slice(0, 12);
    section.hidden = visible.length === 0;
    const activeCount = jobs.filter(job => ["QUEUED", "RUNNING"].includes(job.status)).length;
    const count = document.getElementById("studio-job-active-count");
    count.textContent = activeCount ? `${activeCount} 个任务进行中` : "没有进行中的生成任务";
    count.className = `badge badge-${activeCount ? "info" : "secondary"} mb-2`;
    list.innerHTML = visible.map(job => {
      const percent = Math.max(0, Math.min(100, Number(job.progress) || 0));
      const completedSteps = (job.steps || []).filter(step => step.status === "COMPLETED").length;
      return `
        <button type="button" class="studio-job-card" data-job-id="${learning.escapeHtml(job.id)}">
          <span class="studio-job-card-header">
            <span class="studio-job-card-title">${learning.escapeHtml(job.title)}</span>
            <span class="badge badge-${jobStatusClass(job.status)}">${learning.escapeHtml(jobStatusLabel(job.status))}</span>
          </span>
          <span class="studio-job-card-meta">${learning.escapeHtml(job.moduleId || "单元")} · 已完成 ${completedSteps}/${(job.steps || []).length} 个阶段</span>
          <span class="progress"><span class="progress-bar ${job.status === "FAILED" ? "bg-danger" : ""}" style="width:${percent}%"></span></span>
          <span class="studio-job-card-footer"><span>${learning.escapeHtml((job.steps || []).find(step => step.status === "RUNNING")?.label || jobStatusLabel(job.status))}</span><strong>${percent}%</strong></span>
        </button>`;
    }).join("");
  }

  function renderJobModal(job) {
    if (!job) return;
    activeJobId = job.id;
    document.getElementById("studio-job-modal-title").textContent = job.title || "题目生成";
    const status = document.getElementById("studio-job-modal-status");
    status.textContent = jobStatusLabel(job.status);
    status.className = `badge badge-${jobStatusClass(job.status)} ml-3`;
    document.getElementById("studio-job-modal-meta").textContent =
      `${job.moduleId || "单元"} · ${learning.formatDate(job.created)} · ${job.id}`;
    const percent = Math.max(0, Math.min(100, Number(job.progress) || 0));
    document.getElementById("studio-job-modal-percent").textContent = `${percent}%`;
    const progress = document.getElementById("studio-job-modal-progress");
    progress.style.width = `${percent}%`;
    progress.setAttribute("aria-valuenow", String(percent));
    progress.className = `progress-bar${job.status === "FAILED" ? " bg-danger" : ""}`;
    document.getElementById("studio-job-modal-steps").innerHTML = (job.steps || []).map(step => {
      const icon = step.status === "COMPLETED"
        ? "fa-check"
        : step.status === "FAILED"
          ? "fa-times"
          : step.status === "RUNNING"
            ? "fa-spinner fa-spin"
            : "fa-circle";
      const details = step.details || {};
      const detailItems = [
        details.round ? `第 ${details.round} 轮` : "",
        Number.isFinite(Number(details.blocked)) ? `${Number(details.blocked)} 项阻断` : "",
        Number.isFinite(Number(details.cycles)) ? `${Number(details.cycles)} 个修复周期` : "",
        Number.isFinite(Number(details.openFindings)) ? `${Number(details.openFindings)} 个开放 finding` : "",
      ].filter(Boolean);
      return `
        <li class="studio-job-step is-${learning.escapeHtml(String(step.status || "PENDING").toLowerCase())}">
          <span class="studio-job-step-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
          <span>
            <strong>${learning.escapeHtml(step.label)}</strong>
            <small>${learning.escapeHtml(step.message || (step.status === "PENDING" ? "等待前一阶段完成。" : ""))}</small>
            ${detailItems.length ? `<span class="studio-job-step-details">${detailItems.map(item => `<span>${learning.escapeHtml(item)}</span>`).join("")}</span>` : ""}
          </span>
        </li>`;
    }).join("");
    const error = document.getElementById("studio-job-modal-error");
    error.textContent = job.error || "";
    error.hidden = !job.error;
    const openDraft = document.getElementById("studio-job-open-draft");
    openDraft.hidden = !job.draftId;
    openDraft.dataset.draftId = job.draftId || "";
    openDraft.textContent = job.status === "FAILED" ? "查看未通过草稿" : "查看草稿";
  }

  function openJob(jobId) {
    const job = jobs.find(item => item.id === jobId);
    if (!job) return;
    renderJobModal(job);
    $("#studio-job-modal").modal("show");
  }

  function trackNewJob(job) {
    jobs = [job, ...jobs.filter(item => item.id !== job.id)];
    knownJobStatuses.set(job.id, job.status);
    renderJobs();
    openJob(job.id);
    if (!jobPollTimer) jobPollTimer = window.setInterval(refreshJobs, 2500);
  }

  function handleJobTransitions(previous, next) {
    if (!previous || previous === next.status || !["COMPLETED", "FAILED"].includes(next.status)) return;
    renderJobModal(next);
    $("#studio-job-modal").modal("show");
    refresh();
  }

  function acceptJobs(items) {
    jobs = items || [];
    jobs.forEach(job => {
      const previous = knownJobStatuses.get(job.id);
      if (jobsInitialized) handleJobTransitions(previous, job);
      knownJobStatuses.set(job.id, job.status);
    });
    jobsInitialized = true;
    renderJobs();
    if (activeJobId) {
      const current = jobs.find(job => job.id === activeJobId);
      if (current) renderJobModal(current);
    }
    const shouldPoll = jobs.some(job => ["QUEUED", "RUNNING"].includes(job.status));
    if (shouldPoll && !jobPollTimer) {
      jobPollTimer = window.setInterval(refreshJobs, 2500);
    } else if (!shouldPoll && jobPollTimer) {
      window.clearInterval(jobPollTimer);
      jobPollTimer = null;
    }
  }

  async function refreshJobs() {
    try {
      const response = await learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/authoring/jobs`);
      if (!response.success) throw new Error(learning.errorMessage(response, "无法加载题目生成进度。"));
      acceptJobs(response.jobs || []);
    } catch (error) {
      if (jobPollTimer) {
        window.clearInterval(jobPollTimer);
        jobPollTimer = null;
      }
      showStudioNotice(notice, error.message || "无法加载题目生成进度。", "danger");
    }
  }

  function renderSummary(summary) {
    ["participants", "attempts", "averageScore", "drafts", "openAppeals"].forEach(key => {
      document.getElementById(`studio-stat-${key}`).textContent = summary[key] || 0;
    });
  }

  function renderDrafts(items) {
    document.getElementById("studio-draft-list").innerHTML = items.map(draft => {
      const name = draft.spec && draft.spec.name ? draft.spec.name : draft.brief;
      const blocked = draft.validation && draft.validation.summary ? draft.validation.summary.blocked : "尚未校验";
      return `
        <li class="card card-small studio-draft-select" data-draft-id="${learning.escapeHtml(draft.id)}" role="button" tabindex="0">
          <div class="card-body">
            <h4 class="card-title">${learning.escapeHtml(name)}</h4>
            <p class="card-text">${learning.escapeHtml(strategyLabel(draft.level))} · ${learning.escapeHtml(draftStatusLabel(draft.status))}<br>${learning.escapeHtml(draft.moduleId)} · 修订 ${learning.escapeHtml(draft.revision)}<br>${typeof blocked === "number" ? `${learning.escapeHtml(blocked)} 项阻断检查` : learning.escapeHtml(blocked)}</p>
          </div>
        </li>`;
    }).join("");
  }

  function solutionKey(item) {
    return `${item.moduleId}/${item.id}`;
  }

  function solutionStatusClass(status) {
    return ({
      QUEUED: "secondary",
      RUNNING: "info",
      VERIFIED: "success",
      FAILED: "danger",
    })[status] || "secondary";
  }

  function solutionStatusLabel(status) {
    return ({
      NOT_STARTED: "尚未开始",
      QUEUED: "排队中",
      RUNNING: "解题中",
      VERIFIED: "已验证",
      FAILED: "失败",
    })[status] || status || "未知";
  }

  function solutionPhaseLabel(phase) {
    return ({
      provisioning: "正在创建真实学习者环境",
      executing: "正在以学习者身份解题",
      "flag-verified": "已验证动态 Flag",
      documenting: "正在整理可复现步骤",
      complete: "已完成",
      failed: "失败",
    })[phase] || phase || "准备中";
  }

  function tracePolicyLabel(policy) {
    return ({ALLOWED: "合规执行", REJECTED: "已拒绝"})[policy] || policy || "观察";
  }

  function renderCatalog(items) {
    catalogItems = items || [];
    document.getElementById("studio-catalog-list").innerHTML = catalogItems.map(item => {
      const run = item.solutionRun;
      const status = run ? run.status : "NOT_STARTED";
      const percent = run ? Math.max(0, Math.min(100, Number(run.progress) || 0)) : 0;
      const active = run && ["QUEUED", "RUNNING"].includes(run.status);
      return `
        <li class="studio-published-card" data-solution-key="${learning.escapeHtml(solutionKey(item))}">
          <div class="studio-published-card-header">
            <div>
              <h3>${learning.escapeHtml(item.name)}</h3>
              <p>${learning.escapeHtml(item.moduleId)} · ${learning.escapeHtml(categoryLabel(item.category))} · 难度 ${learning.escapeHtml(item.difficulty)}/5 · 版本 ${learning.escapeHtml(item.version)}</p>
            </div>
            <span class="badge badge-${solutionStatusClass(status)}">${learning.escapeHtml(status === "NOT_STARTED" ? "尚未验证解题步骤" : solutionStatusLabel(status))}</span>
          </div>
          <p>${learning.escapeHtml(item.description || "")}</p>
          ${active ? `
            <div class="studio-published-progress">
              <span>${learning.escapeHtml(solutionPhaseLabel(run.phase))} · ${percent}%</span>
              <div class="progress"><div class="progress-bar" style="width:${percent}%"></div></div>
            </div>` : ""}
          <div class="studio-published-actions">
            <a class="btn btn-sm btn-outline-secondary" href="/${encodeURIComponent(dojoId)}/${encodeURIComponent(item.moduleId)}/${encodeURIComponent(item.id)}">打开题目</a>
            ${run ? `<button type="button" class="btn btn-sm btn-outline-primary studio-solution-view">查看${run.status === "VERIFIED" ? "已验证步骤" : "解题 Agent 进度"}</button>` : ""}
            ${!active && status !== "VERIFIED" ? `<button type="button" class="btn btn-sm btn-primary studio-solution-start">${status === "FAILED" ? "重新真实解题" : "生成已验证步骤"}</button>` : ""}
          </div>
        </li>`;
    }).join("");
    const active = catalogItems.some(item => item.solutionRun && ["QUEUED", "RUNNING"].includes(item.solutionRun.status));
    if (active && !solutionPollTimer) {
      solutionPollTimer = window.setInterval(refreshCatalog, 3500);
    } else if (!active && solutionPollTimer) {
      window.clearInterval(solutionPollTimer);
      solutionPollTimer = null;
    }
  }

  function catalogItemForKey(key) {
    return catalogItems.find(item => solutionKey(item) === key);
  }

  function renderSolutionModal(item) {
    if (!item) return;
    activeSolutionKey = solutionKey(item);
    const run = item.solutionRun || {};
    document.getElementById("studio-solution-title").textContent = item.name || "已验证教师解题步骤";
    const status = document.getElementById("studio-solution-status");
    status.textContent = solutionStatusLabel(run.status);
    status.className = `badge badge-${solutionStatusClass(run.status)} ml-3`;
    document.getElementById("studio-solution-meta").textContent =
      `${item.moduleId} · 题目版本 ${item.version} · ${run.model || "DeepSeek V4 Pro"}`;
    const active = ["QUEUED", "RUNNING"].includes(run.status);
    const running = document.getElementById("studio-solution-running");
    running.hidden = !active;
    document.getElementById("studio-solution-running-detail").textContent =
      active ? `${solutionPhaseLabel(run.phase)} · ${run.progress || 0}% · 关闭窗口不会中断任务。` : "";
    const verification = run.verification || {};
    document.getElementById("studio-solution-verification").innerHTML = run.status === "VERIFIED" ? `
      <span><i class="fas fa-check-circle"></i> 动态 Flag 已验证</span>
      <span><i class="fas fa-user-shield"></i> ${learning.escapeHtml(verification.runAs || "hacker uid 1000")}</span>
      <span><i class="fas fa-link"></i> 已绑定账号与题目</span>
      <span><i class="fas fa-eye-slash"></i> Flag 已脱敏</span>
      <span><i class="fas fa-terminal"></i> 已执行 ${learning.escapeHtml(verification.allowedCommands || 0)} 条合规命令</span>
      <span><i class="fas fa-shield-alt"></i> ${verification.teacherStepsTraceBound ? "教师步骤逐条绑定真实执行轨迹" : "教师步骤尚未完成轨迹绑定"}</span>
      <span><i class="fas fa-project-diagram"></i> ${verification.modelTraceMappingAccepted ? "Agent 轨迹映射已校验" : "已使用平台精确执行轨迹兜底"}</span>` : "";
    const solution = run.solution || {};
    document.getElementById("studio-solution-overview").textContent = solution.overview || "";
    document.getElementById("studio-solution-steps").innerHTML = (solution.steps || []).map((step, index) => `
      <li>
        <h4>${index + 1}. ${learning.escapeHtml(step.goal)}</h4>
        <pre><code>${learning.escapeHtml(step.action)}</code></pre>
        <p><strong>预期证据：</strong>${learning.escapeHtml(step.expectedEvidence)}</p>
      </li>`).join("");
    const trace = run.steps || [];
    const traceWrap = document.getElementById("studio-solution-trace-wrap");
    traceWrap.hidden = trace.length === 0;
    document.getElementById("studio-solution-trace").innerHTML = trace.map(step => `
      <article class="studio-solution-trace-step is-${learning.escapeHtml(String(step.policy || "allowed").toLowerCase())}">
        <div><strong>#${learning.escapeHtml(step.turn)} · ${learning.escapeHtml(tracePolicyLabel(step.policy || step.kind))}</strong><span>退出码 ${learning.escapeHtml(step.exitCode == null ? "—" : step.exitCode)}</span></div>
        <p>${learning.escapeHtml(step.rationale || "")}</p>
        <pre><code>${learning.escapeHtml(step.command || "")}</code></pre>
        <pre class="studio-solution-output">${learning.escapeHtml(step.output || "")}</pre>
      </article>`).join("");
    const error = document.getElementById("studio-solution-error");
    error.textContent = run.error || "";
    error.hidden = !run.error;
  }

  function openSolution(item) {
    if (!item) return;
    renderSolutionModal(item);
    $("#studio-solution-modal").modal("show");
  }

  async function refreshCatalog() {
    try {
      const response = await learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/catalog`);
      if (!response.success) throw new Error(learning.errorMessage(response, "无法加载已发布题目。"));
      renderCatalog(response.items || []);
      if (activeSolutionKey) {
        const active = catalogItemForKey(activeSolutionKey);
        if (active) renderSolutionModal(active);
      }
    } catch (error) {
      if (solutionPollTimer) {
        window.clearInterval(solutionPollTimer);
        solutionPollTimer = null;
      }
      showStudioNotice(notice, error.message || "无法加载已发布题目。", "danger");
    }
  }

  function renderStudents(students) {
    document.getElementById("studio-student-list").innerHTML = students.map(student => `
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex justify-content-between"><h3>${learning.escapeHtml(student.name)}</h3><span>#${learning.escapeHtml(student.id)}</span></div>
        <p>${learning.escapeHtml(student.attempts)} 次尝试 · 课程进度 ${learning.escapeHtml((student.progress || {}).percent || 0)}%</p>
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
        <div class="d-flex justify-content-between"><h3>${learning.escapeHtml(appeal.username)}</h3><span class="badge badge-${appeal.status === "OPEN" ? "warning" : "secondary"}">${learning.escapeHtml(appealStatusLabel(appeal.status))}</span></div>
        <p>${learning.escapeHtml(appeal.attemptId)} · ${learning.escapeHtml(learning.formatDate(appeal.created))}</p>
        <p>${learning.escapeHtml(appeal.reason)}</p>
        ${appeal.status === "OPEN" ? `
          <textarea class="form-control studio-appeal-resolution" data-appeal-id="${learning.escapeHtml(appeal.id)}" rows="4" placeholder="说明证据复核过程和评估决定。"></textarea>
          <button class="btn btn-primary btn-sm mt-3 studio-appeal-action" data-appeal-id="${learning.escapeHtml(appeal.id)}" data-status="RESOLVED">通过并重新评估</button>
          <button class="btn btn-outline-secondary btn-sm mt-3 studio-appeal-action" data-appeal-id="${learning.escapeHtml(appeal.id)}" data-status="REJECTED">驳回</button>` : `<p>${learning.escapeHtml(appeal.resolution || "没有处理说明")}</p>`}
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
    const pipeline = spec.authoringPipeline || {};
    const strategy = spec.authoringStrategy || pipeline.strategy || {};
    document.getElementById("studio-draft-name").textContent = spec.name || selected.brief;
    document.getElementById("studio-draft-meta").textContent =
      `${strategyLabel(selected.level)} · ${strategyProviderLabel(strategy.provider)} · ${selected.moduleId} · 修订 ${selected.revision}`;
    document.getElementById("studio-agent-pipeline").innerHTML = [
      ["策略", strategy],
      ["方案", pipeline.plan],
      ["构建", pipeline.build],
      ["红队审查", pipeline.review],
      ["修复", pipeline.repair],
      ["复审", pipeline.postReview],
      ["最终验证", pipeline.validate],
    ].map(([label, stage]) => {
      const value = stage || {};
      const provider = value.provider || "PENDING";
      const providerText = label === "策略"
        ? strategyProviderLabel(provider)
        : provider === "MODEL"
          ? "模型已执行"
          : provider === "PENDING"
            ? "等待中"
            : provider;
      const providerClass = ["MODEL", "TEACHER_DIRECTIVE", "SYSTEM_OVERRIDE", "ORCHESTRATED"].includes(provider)
        ? "success"
        : provider === "PENDING"
          ? "secondary"
          : "warning";
      return `<span class="studio-pipeline-stage"><strong>${learning.escapeHtml(label)}</strong>：${learning.escapeHtml(value.model || (label === "策略" ? strategyLabel(selected.level) : "平台编排"))} <span class="badge badge-${providerClass}">${learning.escapeHtml(providerText)}</span>${label === "策略" && value.reason ? `<small>${learning.escapeHtml(value.reason)}</small>` : ""}</span>`;
    }).join(" &nbsp; ");
    document.getElementById("studio-draft-status").textContent = selected.status;
    document.getElementById("studio-draft-description").textContent = spec.description || "";
    const implementation = spec.implementation || {};
    const solution = spec.privateSolution || {};
    const preflight = spec.preflightReview || {};
    document.getElementById("studio-implementation-summary").textContent =
      implementation.summary || `${(implementation.artifacts || []).length} 个产物 · ${(implementation.selfChecks || []).length} 项自检`;
    document.getElementById("studio-solution-summary").textContent =
      solution.overview || `${(solution.steps || []).length} 个已验证步骤 · ${(solution.successIndicators || []).length} 个成功指标`;
    const preflightElement = document.getElementById("studio-preflight-summary");
    const findings = Array.isArray(preflight.findings) ? preflight.findings : [];
    const openFindings = findings.filter(finding => (finding.status || "OPEN") === "OPEN");
    preflightElement.className = `alert alert-${preflight.verdict === "PASS" && !openFindings.length ? "success" : preflight.verdict === "BLOCK" ? "danger" : "secondary"}`;
    preflightElement.innerHTML = `
      <strong>预检：${learning.escapeHtml(preflight.verdict || "等待中")}</strong>
      <span> · ${learning.escapeHtml(preflight.summary || "独立题包审查尚未完成。")}</span>
      ${findings.length ? `<ul class="mb-0 mt-2">${findings.map(finding => `
        <li>
          <span class="badge badge-${finding.status === "RESOLVED" ? "success" : "warning"}">${learning.escapeHtml(finding.status || "OPEN")}</span>
          <strong>${learning.escapeHtml(finding.severity || "MEDIUM")} · ${learning.escapeHtml(finding.stage || "AI_REVIEW")}</strong>
          ${learning.escapeHtml(finding.message || "")}
        </li>`).join("")}</ul>` : ""}`;
    document.getElementById("studio-draft-candidates").innerHTML = (selected.candidates || []).slice(0, 3).map(candidate => `
      <div class="d-flex justify-content-between border rounded p-2 mb-2"><span>${learning.escapeHtml(candidate.name)}</span><span>匹配度 ${learning.escapeHtml(candidate.score)}</span></div>`).join("") || "<p>这个草稿不需要引用源题。</p>";
    const summary = validation.summary;
    const autonomousLoop = validation.autonomousLoop || {};
    document.getElementById("studio-validation-summary").textContent = summary
      ? `${validation.status === "PASS" ? "自主验证通过" : "自主验证未通过"} · ${autonomousLoop.completedRounds || 1} 轮 · ${summary.passed} 项通过 · ${summary.warnings} 项警告 · ${summary.blocked} 项阻断`
      : "等待后台 Agent 完成自主验证闭环";
    document.getElementById("studio-validation-checks").innerHTML = validation.checks ? `
      <table class="table table-sm table-striped"><tbody>${validation.checks.map(check => `<tr><td>${learning.escapeHtml(check.stage)}</td><td>${learning.escapeHtml(check.message)}</td><td>${learning.escapeHtml(check.status)}</td></tr>`).join("")}</tbody></table>` : "";
    const preflightDetails = document.getElementById("studio-preflight-details");
    const validationDetails = document.getElementById("studio-validation-details");
    if (preflightDetails && (preflight.verdict === "BLOCK" || openFindings.length)) preflightDetails.open = true;
    if (validationDetails && validation.status && validation.status !== "PASS") validationDetails.open = true;
    document.getElementById("studio-publish").disabled = busy || validation.status !== "PASS" || selected.status === "PUBLISHED";
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
      const [authoring, catalog, analytics, appeals, authoringJobs] = await Promise.all([
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/authoring`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/catalog`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/analytics`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/appeals`),
        learning.request(`/learning/dojos/${encodeURIComponent(dojoId)}/authoring/jobs`),
      ]);
      if (!authoring.success) throw new Error(learning.errorMessage(authoring, "无法加载教师工作台数据。"));
      drafts = authoring.drafts || [];
      if (selectedId) selected = drafts.find(draft => draft.id === selectedId) || selected;
      renderSummary(analytics.summary || {});
      renderDrafts(drafts);
      renderCatalog(catalog.items || []);
      renderStudents(analytics.students || []);
      renderAppeals(appeals.appeals || []);
      acceptJobs(authoringJobs.jobs || []);
      renderWorkbench();
      showStudioNotice(notice, "");
    } catch (error) {
      showStudioNotice(notice, error.message || "无法加载教师工作台数据。", "danger");
    }
  }

  async function run(operation, successMessage, progressMessage) {
    if (busy) return null;
    setBusy(true);
    const stopProgress = beginProgress(progressMessage);
    try {
      const response = await operation();
      if (!response.success) throw new Error(learning.errorMessage(response, "操作失败。"));
      if (response.draft) selected = response.draft;
      showStudioNotice(notice, successMessage, "success");
      await refresh();
      return response;
    } catch (error) {
      showStudioNotice(notice, error.message || "操作失败。", "danger");
      return null;
    } finally {
      stopProgress();
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

  document.getElementById("studio-create").addEventListener("click", async function (event) {
    const brief = document.getElementById("studio-brief").value.trim();
    if (brief.length < 12) {
      showStudioNotice(notice, "题目需求至少需要 12 个字符。", "warning");
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await learning.json("POST", `/learning/dojos/${encodeURIComponent(dojoId)}/authoring/jobs`, {
        moduleId: document.getElementById("studio-module").value,
        brief,
        constraints: {
          category: document.getElementById("studio-category").value,
          difficulty: Number(document.getElementById("studio-difficulty").value),
        },
      });
      if (!response.success || !response.job) {
        throw new Error(learning.errorMessage(response, "无法启动题目生成任务。"));
      }
      trackNewJob(response.job);
      document.getElementById("studio-brief").value = "";
    } catch (error) {
      showStudioNotice(notice, error.message || "无法启动题目生成任务。", "danger");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("studio-job-list").addEventListener("click", function (event) {
    const card = event.target.closest(".studio-job-card");
    if (card) openJob(card.dataset.jobId);
  });

  document.getElementById("studio-job-open-draft").addEventListener("click", function (event) {
    const draftId = event.currentTarget.dataset.draftId;
    if (!draftId) return;
    $("#studio-job-modal").modal("hide");
    selectDraft(draftId);
  });

  $("#studio-job-modal").on("hidden.bs.modal", function () {
    activeJobId = null;
  });

  document.getElementById("studio-catalog-list").addEventListener("click", async function (event) {
    const card = event.target.closest(".studio-published-card");
    if (!card) return;
    const item = catalogItemForKey(card.dataset.solutionKey);
    if (!item) return;
    if (event.target.closest(".studio-solution-view")) {
      openSolution(item);
      return;
    }
    const start = event.target.closest(".studio-solution-start");
    if (!start) return;
    start.disabled = true;
    try {
      const response = await learning.json(
        "POST",
        `/learning/dojos/${encodeURIComponent(dojoId)}/solutions/${encodeURIComponent(item.moduleId)}/${encodeURIComponent(item.id)}`,
        {force: Boolean(item.solutionRun && item.solutionRun.status === "FAILED")},
      );
      if (!response.success || !response.solutionRun) {
        throw new Error(learning.errorMessage(response, "无法启动已验证解题 Agent。"));
      }
      item.solutionRun = response.solutionRun;
      renderCatalog(catalogItems);
      openSolution(item);
    } catch (error) {
      showStudioNotice(notice, error.message || "无法启动已验证解题 Agent。", "danger");
      start.disabled = false;
    }
  });

  $("#studio-solution-modal").on("hidden.bs.modal", function () {
    activeSolutionKey = null;
  });

  document.getElementById("studio-publish").addEventListener("click", function () {
    if (!selected) return;
    run(() => learning.json("POST", `/learning/drafts/${encodeURIComponent(selected.id)}/publish`, {}), "题目已发布到课程。");
  });

  document.getElementById("studio-revise").addEventListener("click", async function (event) {
    if (!selected || busy) return;
    const message = document.getElementById("studio-revision").value.trim();
    if (!message) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await learning.json(
        "POST",
        `/learning/drafts/${encodeURIComponent(selected.id)}/authoring/jobs`,
        {message},
      );
      if (!response.success || !response.job) {
        throw new Error(learning.errorMessage(response, "无法启动自主修订任务。"));
      }
      trackNewJob(response.job);
      document.getElementById("studio-revision").value = "";
    } catch (error) {
      showStudioNotice(notice, error.message || "无法启动自主修订任务。", "danger");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("studio-import-submit").addEventListener("click", function () {
    let challengePackage;
    try {
      challengePackage = JSON.parse(document.getElementById("studio-package").value);
    } catch (error) {
      showStudioNotice(notice, "题目包必须是有效的 JSON。", "danger");
      return;
    }
    run(() => learning.json("POST", `/learning/dojos/${encodeURIComponent(dojoId)}/imports`, {
      moduleId: document.getElementById("studio-import-module").value,
      package: challengePackage,
    }), "外部题目包已完成自主验证闭环。");
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
    }), "申诉处理决定已记录。");
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

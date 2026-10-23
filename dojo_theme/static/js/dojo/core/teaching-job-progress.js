(function (host) {
  "use strict";
  const api = { escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]) };
  const activeJobStatuses = new Set(["QUEUED", "RUNNING", "CANCEL_REQUESTED"]);
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
    "waiting-service": { label: "等待生成服务恢复", detail: "已保留进度，会自动继续。可以离开此页，也可以取消任务。" },
    "repairing-content": { label: "继续修复内容", detail: "正在根据检查结果修复内容，保留原始要求和已通过的步骤。" },
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
    const started = jobTimestamp(job.executionStarted || job.created);
    if (started === null) return null;
    const terminal = ["SUCCEEDED", "FAILED", "CANCELED"].includes(
      String(job.status || "").toUpperCase(),
    );
    const ended = terminal
      ? jobTimestamp(job.completed || job.updated)
      : Number(now || Date.now());
    if (ended === null || ended < started) return null;
    return Math.floor((ended - started) / 1000);
  }

  function jobDurationMarkup(job, compact) {
    const started = jobTimestamp(job.executionStarted || job.created);
    if (started === null) return "";
    const status = String(job.status || "").toUpperCase();
    // A queued retry is waiting between attempts, not executing. Its previous
    // attempt's start time must not keep ticking in the task card or drawer.
    if (status === "QUEUED") return "";
    const terminal = ["SUCCEEDED", "FAILED", "CANCELED"].includes(status);
    const ended = terminal ? jobTimestamp(job.completed || job.updated) : null;
    if (terminal && (ended === null || ended < started)) return "";
    const prefix = terminal ? "耗时 " : "已用时 ";
    return `<span class="job-live-duration${compact ? " is-compact" : ""}" data-job-start-ms="${started}"${ended === null ? "" : ` data-job-end-ms="${ended}"`} data-job-duration-prefix="${prefix}">${prefix}${formatJobDuration(jobDurationSeconds(job, Date.now()))}</span>`;
  }

  function updateJobDurations(container) {
    const scope = container;
    if (!scope) return;
    const now = Date.now();
    scope.querySelectorAll("[data-job-start-ms]").forEach((node) => {
      const started = Number(node.dataset.jobStartMs);
      const ended = node.dataset.jobEndMs ? Number(node.dataset.jobEndMs) : now;
      if (!Number.isFinite(started) || !Number.isFinite(ended)) return;
      node.textContent = `${node.dataset.jobDurationPrefix || "已用时 "}${formatJobDuration((ended - started) / 1000)}`;
    });
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
    if (String(job.status || "").toUpperCase() === "SUCCEEDED") {
      const steps = jobSteps(job);
      return steps[steps.length - 1].label;
    }
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

  function jobAttemptLabel(job) {
    if (activeJobStatuses.has(String(job.status || "").toUpperCase()) && job.recovery?.automaticRecovery) {
      const count = job.recovery.category === "service" ? Number(job.recovery.serviceRetries || 0) : Number(job.recovery.repairRetries || 0);
      const when = jobTimestamp(job.recovery.nextAttemptAt);
      const wait = job.status !== "QUEUED" ? " · 正在继续" : when === null ? "" : ` · ${new Date(when).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 后自动继续`;
      return `${job.recovery.category === "service" ? "服务恢复" : "内容修复"}${count ? `第 ${count} 轮` : ""}${wait}`;
    }
    const attempt = Math.max(0, Number(job.attemptCount || 0));
    const maximum = Math.max(attempt, Number(job.maxAttempts || 0));
    if (!attempt && !maximum) return "";
    if (!attempt)
      return maximum > 1 ? `最多自动尝试 ${maximum} 次` : "尚未开始执行";
    return maximum > 1
      ? `第 ${attempt}/${maximum} 次执行`
      : `第 ${attempt} 次执行`;
  }


  function jobEventLogMarkup(job) {
    const events = Array.isArray(job.events) ? job.events : [];
    if (!events.length) return '<p class="job-event-empty">尚无执行记录，任务状态会自动更新。</p>';
    return '<ol class="job-event-log" aria-label="执行记录">' + events.map(event => {
      const time = jobTimestamp(event.created);
      const label = time === null ? "" : new Date(time).toLocaleTimeString("zh-CN", {hour12: false});
      return `<li><time>${api.escapeHtml(label)}</time><span>${api.escapeHtml(event.message || jobCurrentStepLabel({ ...job, stage: event.stage, events: [] }))}</span></li>`;
    }).join("") + '</ol>';
  }

  const retryRequests = new Map();
  const retrySignal = "aisecedu:teaching-job-retried";
  let retryChannel;

  function jobRetryChannel() {
    if (retryChannel === undefined) {
      try { retryChannel = host.document && host.BroadcastChannel ? new host.BroadcastChannel(retrySignal) : null; }
      catch (_) { retryChannel = null; }
    }
    return retryChannel;
  }

  function announceJobRetry(jobId) {
    if (!host.document) return;
    host.dispatchEvent(new host.CustomEvent(retrySignal, { detail: jobId }));
    const channel = jobRetryChannel();
    if (channel) channel.postMessage({ jobId });
    else {
      try {
        host.localStorage.setItem(retrySignal, JSON.stringify({ jobId, nonce: Date.now() }));
        host.localStorage.removeItem(retrySignal);
      } catch (_) {}
    }
  }

  function subscribeJobRetries(listener) {
    const deliver = value => {
      if (typeof value === "string" && /^[\w-]{1,128}$/.test(value)) listener(value);
    };
    const local = event => deliver(event.detail);
    const remote = event => deliver(event.data?.jobId);
    const storage = event => {
      if (event.key !== retrySignal || !event.newValue) return;
      try { deliver(JSON.parse(event.newValue).jobId); } catch (_) {}
    };
    host.addEventListener(retrySignal, local);
    host.addEventListener("storage", storage);
    const channel = jobRetryChannel();
    channel?.addEventListener("message", remote);
    return () => {
      host.removeEventListener(retrySignal, local);
      host.removeEventListener("storage", storage);
      channel?.removeEventListener("message", remote);
    };
  }

  function retryJob(client, job) {
    const id = String(job?.id || "");
    if (!id) return Promise.reject(new Error("没有找到可重试的任务。"));
    const version = String(job.executionId || job.traceId || job.updated || "");
    let request = retryRequests.get(id);
    if (request?.promise) return request.promise;
    if (!request || request.version !== version) {
      request = { version, token: host.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` };
      retryRequests.set(id, request);
    }
    request.promise = Promise.resolve().then(async () => {
      const payload = await client.json("POST", `/teaching/jobs/${encodeURIComponent(id)}/retry`, { idempotencyKey: request.token });
      if (payload?.success !== true) throw new Error(client.errorMessage(payload, "任务暂时无法重试。"));
      const data = payload.data || {};
      if (data.replacedInPlace !== true || String(data.job?.id) !== id) throw new Error("重试结果与原任务不一致，请刷新任务状态。");
      retryRequests.delete(id);
      try { announceJobRetry(id); } catch (_) {}
      return data;
    }).finally(() => { request.promise = null; });
    return request.promise;
  }

  function mergeJobUpdate(previous, incoming) {
    if (!previous?.id || previous.id !== incoming.id) return incoming;
    const previousTime = jobTimestamp(previous.updated);
    const incomingTime = jobTimestamp(incoming.updated);
    if (previousTime !== null && (incomingTime === null || previousTime > incomingTime)) return previous;
    const previousExecution = previous.executionId || previous.traceId;
    const incomingExecution = incoming.executionId || incoming.traceId;
    const restarted = (incomingExecution && previousExecution && incomingExecution !== previousExecution)
      || (["FAILED", "CANCELED"].includes(previous.status) && activeJobStatuses.has(incoming.status));
    return { ...previous, ...(restarted ? { events: [], activityLoaded: false, error: null, failureMessage: null } : {}), ...incoming };
  }

  const exported = { jobSteps, currentJobStage, normalizedJobStage, authoringStagePresentation, jobStagePresentation, jobTimestamp, formatJobDuration, jobDurationSeconds, jobDurationMarkup, updateJobDurations, jobProgressValue, jobStepIndex, jobCurrentDetail, jobCurrentStepLabel, jobTimelineMarkup, jobAttemptLabel, jobEventLogMarkup, activeJobStatuses, retryJob, subscribeJobRetries, mergeJobUpdate };
  if (typeof module === "object" && module.exports) module.exports = exported;
  else { host.AISecEdu = host.AISecEdu || {}; host.AISecEdu.jobProgress = exported; }
})(typeof window === "undefined" ? globalThis : window);

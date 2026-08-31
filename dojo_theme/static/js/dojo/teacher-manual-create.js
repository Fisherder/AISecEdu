(function () {
  "use strict";

  const api = window.DojoLearning;
  const root = document.getElementById("teacher-manual-create");
  if (!api || !root) return;

  const form = document.getElementById("manual-create-form");
  const kind = root.dataset.createKind;
  const dojoId = root.dataset.dojoId || "";
  const dojoName = root.dataset.dojoName || "";
  const notice = document.getElementById("manual-notice");
  const nameInput = document.getElementById("manual-name");
  const descriptionInput = document.getElementById("manual-description");
  const summaryTitle = document.getElementById("manual-summary-title");
  const summaryDescription = document.getElementById("manual-summary-description");
  const summaryScope = document.getElementById("manual-summary-scope");
  const autosaveState = document.getElementById("manual-autosave-state");
  const progress = document.getElementById("manual-progress");
  const result = document.getElementById("manual-result");
  const resultIcon = document.getElementById("manual-result-icon");
  const resultKicker = document.getElementById("manual-result-kicker");
  const resultTitle = document.getElementById("manual-result-title");
  const resultCopy = document.getElementById("manual-result-copy");
  const resultActions = document.getElementById("manual-result-actions");
  const formActions = document.getElementById("manual-form-actions");
  let activeDraftId = null;
  let activeJobId = null;
  let pollTimer = null;
  let pollCount = 0;
  let busy = false;
  let dirty = false;
  let finished = false;
  let autosaveTimer = null;
  const autosaveKey = `aisecedu:manual-create:${kind}:${dojoId || "new"}`;

  function escape(value) {
    return api.escapeHtml(value);
  }

  function lines(value, limit) {
    return String(value || "")
      .split(/\r?\n|[,，]/)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  function selectedModule() {
    const select = document.getElementById("manual-module");
    if (!select || !select.value) return null;
    const option = select.options[select.selectedIndex];
    return {
      id: select.value,
      index: option ? option.dataset.moduleIndex : "",
      name: option ? option.textContent.trim() : select.value,
    };
  }

  function updateAiAssistLinks() {
    const module = selectedModule();
    const title = nameInput && nameInput.value.trim();
    const description = descriptionInput && descriptionInput.value.trim();
    const fieldPrompts = {
      title: `请为课程“${dojoName}”${module ? `的“${module.name}”章节` : ""}这道 CTF 实践题拟 3 个简洁准确的中文题名。${description ? `题面摘要：${description.slice(0, 500)}` : ""}`,
      description: `请协助完善课程“${dojoName}”${module ? `的“${module.name}”章节` : ""}中的 CTF 题面，保留教师最终决定权。${title ? `题名：${title}。` : ""}${description ? `当前题面：${description.slice(0, 1200)}` : ""}`,
      objectives: `请根据课程“${dojoName}”${module ? `的“${module.name}”章节` : ""}和当前题面，生成 3–5 条可观察、可评估的学习目标。${title ? `题名：${title}。` : ""}${description ? `题面：${description.slice(0, 1200)}` : ""}`,
    };
    root.querySelectorAll("[data-ai-field]").forEach(link => {
      const params = new URLSearchParams();
      params.set("dojo", dojoId);
      if (module && module.index !== "") params.set("moduleIndex", module.index);
      params.set("objectType", "practice");
      params.set("field", link.dataset.aiField);
      params.set("prompt", fieldPrompts[link.dataset.aiField] || "请协助填写当前字段。");
      link.href = `/teacher?${params.toString()}`;
    });
  }

  function updateLegacyAgentContext() {
    let prompt = "请帮我手动规划一门新课程，并逐项确认课程名称、简介、可见范围和第一章。";
    const params = new URLSearchParams();
    if (kind === "chapter") {
      params.set("dojo", dojoId);
      prompt = `请在课程“${dojoName}”中新建一个章节，并逐项确认名称和章节简介。`;
    } else if (kind === "practice") {
      const module = selectedModule();
      params.set("dojo", dojoId);
      if (module && module.index !== "") params.set("moduleIndex", module.index);
      prompt = `请在课程“${dojoName}”${module ? `的“${module.name}”章节` : ""}创建一道 CTF 实践题，并确认题面、学习目标、难度、运行方式和确定性判题条件。`;
    } else if (nameInput && nameInput.value.trim()) {
      prompt = `请帮我创建课程“${nameInput.value.trim()}”，并确认课程简介、可见范围和第一章。`;
    }
    params.set("prompt", prompt);
    root.dataset.agentHref = `/teacher?${params.toString()}`;
    updateAiAssistLinks();
  }

  function updateSummary() {
    const fallback = kind === "course" ? "未命名课程" : kind === "chapter" ? "未命名章节" : "未命名实践题";
    summaryTitle.textContent = nameInput && nameInput.value.trim() ? nameInput.value.trim() : fallback;
    summaryDescription.textContent = descriptionInput && descriptionInput.value.trim()
      ? descriptionInput.value.trim().slice(0, 180)
      : "填写左侧内容，这里会同步显示摘要。";
    if (kind === "practice") {
      const module = selectedModule();
      summaryScope.textContent = module ? module.name : "请选择章节";
    }
    const count = document.getElementById("manual-description-count");
    if (count && descriptionInput) count.textContent = String(descriptionInput.value.length);
    updateLegacyAgentContext();
  }

  function setAutosaveState(label, kindName) {
    if (!autosaveState) return;
    autosaveState.dataset.state = kindName || "idle";
    autosaveState.innerHTML = `<i class="fas ${kindName === "saved" ? "fa-cloud-check" : kindName === "saving" ? "fa-circle-notch fa-spin" : "fa-cloud"}" aria-hidden="true"></i>${escape(label)}`;
  }

  function autosaveSnapshot() {
    const values = {};
    const excluded = new Set(["manual-expected-answer", "manual-teacher-solution", "manual-starter-content"]);
    form.querySelectorAll("input[id], select[id], textarea[id]").forEach(control => {
      if (!control.id || excluded.has(control.id) || control.type === "password") return;
      if (["checkbox", "radio"].includes(control.type)) values[control.id] = Boolean(control.checked);
      else values[control.id] = String(control.value || "").slice(0, 24000);
    });
    return {version: 1, savedAt: new Date().toISOString(), values};
  }

  function saveLocalDraft() {
    if (kind !== "practice" || finished) return;
    try {
      setAutosaveState("正在自动保存…", "saving");
      localStorage.setItem(autosaveKey, JSON.stringify(autosaveSnapshot()));
      setAutosaveState(`已自动保存 ${new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}`, "saved");
    } catch (error) {
      setAutosaveState("自动保存不可用", "warning");
    }
  }

  function scheduleAutosave() {
    if (kind !== "practice" || busy || finished) return;
    dirty = true;
    setAutosaveState("有未提交修改", "dirty");
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(saveLocalDraft, 700);
  }

  function restoreLocalDraft() {
    if (kind !== "practice") return;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(autosaveKey) || "null");
    } catch (error) {
      localStorage.removeItem(autosaveKey);
    }
    if (!saved || !saved.values || Date.now() - new Date(saved.savedAt).getTime() > 7 * 86400000) return;
    Object.entries(saved.values).forEach(([id, value]) => {
      const control = document.getElementById(id);
      if (!control || control.disabled) return;
      if (["checkbox", "radio"].includes(control.type)) control.checked = Boolean(value);
      else control.value = String(value == null ? "" : value);
      control.dispatchEvent(new Event("change", {bubbles: true}));
    });
    dirty = true;
    setAutosaveState(`已恢复 ${new Date(saved.savedAt).toLocaleString()} 的内容`, "saved");
    api.showNotice(notice, "已恢复上次未提交的题目内容；安全答案与教师解法需要重新填写。", "info");
  }

  function clearLocalDraft() {
    dirty = false;
    finished = true;
    window.clearTimeout(autosaveTimer);
    try { localStorage.removeItem(autosaveKey); } catch (error) {}
    setAutosaveState("已提交", "saved");
  }

  function setBusy(value) {
    busy = value;
    Array.from(form.elements).forEach(control => {
      if (control.dataset.keepEnabled === "true") return;
      control.disabled = value;
    });
    form.classList.toggle("is-busy", value);
  }

  function showError(message) {
    api.showNotice(notice, message || "操作失败，请检查后重试。", "danger");
  }

  function markSteps(count) {
    document.querySelectorAll(".manual-create-steps li").forEach((item, index) => {
      item.classList.toggle("is-active", index + 1 === count);
      item.classList.toggle("is-complete", index + 1 < count || count === 4);
    });
  }

  function showResult(options) {
    progress.hidden = true;
    result.hidden = false;
    result.classList.toggle("is-error", options.kind === "error");
    resultIcon.innerHTML = `<i class="fas ${options.kind === "error" ? "fa-exclamation" : "fa-check"}" aria-hidden="true"></i>`;
    resultKicker.textContent = options.kicker || (options.kind === "error" ? "未能完成" : "创建成功");
    resultTitle.textContent = options.title;
    resultCopy.textContent = options.copy || "";
    resultActions.innerHTML = options.actions || "";
    if (options.finished) {
      clearLocalDraft();
      Array.from(form.children).forEach(child => {
        if (child !== result && child !== progress && child !== formActions) child.hidden = true;
      });
      formActions.hidden = true;
      markSteps(4);
    } else {
      formActions.hidden = true;
      markSteps(3);
    }
    result.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function validateForm() {
    if (kind === "course") {
      const enabled = document.getElementById("manual-initial-enabled").checked;
      const initialName = document.getElementById("manual-initial-name");
      initialName.setCustomValidity(enabled && !initialName.value.trim() ? "请填写第一章名称。" : "");
    }
    if (kind === "practice") {
      const description = descriptionInput.value.trim();
      const objectives = lines(document.getElementById("manual-objectives").value, 13);
      const starterPath = document.getElementById("manual-starter-path").value.trim();
      const starterContent = document.getElementById("manual-starter-content").value;
      const runtimeMode = form.querySelector('input[name="runtimeMode"]:checked').value;
      descriptionInput.setCustomValidity(description.length < 40 ? "题目说明至少需要 40 个字符。" : "");
      document.getElementById("manual-objectives").setCustomValidity(
        objectives.length < 1 || objectives.length > 12 ? "请按行填写 1–12 项学习目标。" : ""
      );
      document.getElementById("manual-starter-path").setCustomValidity(
        starterContent && !starterPath ? "填写文件内容时也需要填写文件路径。" : ""
      );
      document.getElementById("manual-starter-content").setCustomValidity(
        starterPath && !starterContent ? "填写文件路径时也需要填写文件内容。" : ""
      );
      if (runtimeMode === "web" && (!starterPath || !starterContent)) {
        document.getElementById("manual-starter-content").setCustomValidity("Web 服务题需要填写可运行的入口文件。 ");
      }
    }
    const valid = form.reportValidity();
    if (!valid) {
      const invalid = form.querySelector(":invalid");
      invalid?.closest(".manual-form-section, .manual-advanced")?.scrollIntoView({behavior: "smooth", block: "start"});
      window.setTimeout(() => invalid?.focus({preventScroll: true}), 220);
    }
    return valid;
  }

  function coursePayload() {
    const initial = document.getElementById("manual-initial-enabled").checked;
    const payload = {
      name: nameInput.value.trim(),
      description: descriptionInput.value.trim(),
      access: form.querySelector('input[name="access"]:checked').value,
    };
    if (initial) {
      payload.initialModuleName = document.getElementById("manual-initial-name").value.trim();
      payload.initialModuleDescription = document.getElementById("manual-initial-description").value.trim();
    }
    return payload;
  }

  function practicePayload(runValidation) {
    return {
      moduleId: document.getElementById("manual-module").value,
      title: nameInput.value.trim(),
      description: descriptionInput.value.trim(),
      category: document.getElementById("manual-category").value,
      difficulty: Number(document.getElementById("manual-difficulty").value),
      required: document.getElementById("manual-required").checked,
      objectives: lines(document.getElementById("manual-objectives").value, 12),
      tags: lines(document.getElementById("manual-tags").value, 20),
      expectedAnswer: document.getElementById("manual-expected-answer").value.trim(),
      teacherSolution: document.getElementById("manual-teacher-solution").value.trim(),
      runtimeMode: form.querySelector('input[name="runtimeMode"]:checked').value,
      image: document.getElementById("manual-image").value.trim(),
      starterPath: document.getElementById("manual-starter-path").value.trim(),
      starterContent: document.getElementById("manual-starter-content").value,
      port: Number(document.getElementById("manual-port").value),
      runValidation,
    };
  }

  function setProgress(percent, title, copy) {
    const value = Math.max(2, Math.min(100, Number(percent) || 0));
    progress.hidden = false;
    result.hidden = true;
    document.getElementById("manual-progress-percent").textContent = `${value}%`;
    document.getElementById("manual-progress-bar").style.width = `${value}%`;
    document.getElementById("manual-progress-title").textContent = title;
    document.getElementById("manual-progress-copy").textContent = copy;
    document.getElementById("manual-progress-save").className = value >= 25 ? "is-complete" : "is-active";
    document.getElementById("manual-progress-check").className = value >= 90 ? "is-complete" : value >= 25 ? "is-active" : "";
    document.getElementById("manual-progress-ready").className = value >= 100 ? "is-complete" : value >= 90 ? "is-active" : "";
  }

  function clearPolling() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  async function pollJob() {
    if (!activeJobId) return;
    pollCount += 1;
    try {
      const response = await api.request(`/learning/authoring/jobs/${encodeURIComponent(activeJobId)}`);
      if (!response || response.success !== true || !response.job) throw new Error("无法读取检查进度。");
      const job = response.job;
      const percent = Math.max(25, Number(job.progress) || 25);
      setProgress(percent, percent >= 90 ? "正在完成检查" : "正在检查题目", "系统正在确认内容完整性、运行条件和判题安全性。完成后即可由您决定是否发布。");
      if (job.status === "COMPLETED") {
        clearPolling();
        setBusy(false);
        setProgress(100, "检查通过", "题目已经准备好，可以发布给学生。");
        showResult({
          kicker: "检查通过",
          title: "实践题已准备好",
          copy: "内容仍处于草稿状态。确认无误后点击发布，学生才会看到它。",
          actions: `<button class="hub-button is-primary is-prominent" type="button" data-result-action="publish"><i class="fas fa-paper-plane" aria-hidden="true"></i>发布实践题</button><a class="hub-button is-secondary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions">暂不发布</a>`,
        });
        return;
      }
      if (job.status === "FAILED") {
        clearPolling();
        setBusy(false);
        showResult({
          kind: "error",
          kicker: "检查未通过",
          title: "实践题暂时不能发布",
          copy: job.error || "题目仍有需要修正的内容，草稿已经保留。",
          actions: `<a class="hub-button is-primary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions${activeDraftId ? `&selectedId=${encodeURIComponent(activeDraftId)}` : ""}">打开草稿并修正</a><a class="hub-button is-secondary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions">返回课程</a>`,
        });
        return;
      }
      if (pollCount >= 600) throw new Error("检查时间超过预期。草稿已保存，可稍后在题目管理中查看状态。");
      pollTimer = window.setTimeout(pollJob, 1500);
    } catch (error) {
      clearPolling();
      setBusy(false);
      showResult({
        kind: "error",
        kicker: "暂时无法继续",
        title: "未能取得检查结果",
        copy: error.message || "草稿已经保留，请稍后在题目管理中查看。",
        actions: `<a class="hub-button is-primary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions${activeDraftId ? `&selectedId=${encodeURIComponent(activeDraftId)}` : ""}">查看已保存草稿</a><a class="hub-button is-secondary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions">返回课程</a>`,
      });
    }
  }

  async function startValidation() {
    if (!activeDraftId || busy) return;
    setBusy(true);
    result.hidden = true;
    setProgress(30, "正在检查题目", "系统正在确认内容完整性、运行条件和判题安全性。");
    try {
      const response = await api.json("POST", `/learning/drafts/${encodeURIComponent(activeDraftId)}/validate`, {});
      if (!response || response.success !== true || !response.job) throw new Error(api.errorMessage(response, "无法开始检查。"));
      activeJobId = response.job.id;
      pollCount = 0;
      await pollJob();
    } catch (error) {
      setBusy(false);
      progress.hidden = true;
      showError(error.message);
      result.hidden = false;
    }
  }

  async function publishPractice() {
    if (!activeDraftId || busy) return;
    setBusy(true);
    setProgress(92, "正在发布实践题", "正在保存发布状态并准备学生访问入口。");
    try {
      const response = await api.json("POST", `/learning/drafts/${encodeURIComponent(activeDraftId)}/publish`, {});
      if (!response || response.success !== true) throw new Error(api.errorMessage(response, "发布失败。"));
      showResult({
        kicker: "发布成功",
        title: "实践题发布成功",
        copy: "题目已经加入课程，学生现在可以从对应章节进入。",
        finished: true,
        actions: `<a class="hub-button is-primary is-prominent" href="${escape(response.workspaceUrl || `/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions`)}"><i class="fas fa-external-link-alt" aria-hidden="true"></i>打开实践题</a><a class="hub-button is-secondary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions">返回课程</a>`,
      });
      api.showNotice(notice, "实践题发布成功。", "success");
    } catch (error) {
      setBusy(false);
      progress.hidden = true;
      result.hidden = false;
      showError(error.message);
    }
  }

  async function submitCourse() {
    const response = await api.json("POST", "/teaching/courses", coursePayload());
    if (!response || response.success !== true || !response.data || !response.data.course) {
      throw new Error(api.errorMessage(response, "创建课程失败。"));
    }
    const course = response.data.course;
    const reference = course.referenceId || course.id;
    const hasModule = Boolean(response.data.module);
    showResult({
      title: `课程“${course.name || nameInput.value.trim()}”已创建`,
      copy: hasModule ? "课程和第一章均已保存，可以继续添加实践题。" : "课程已保存，可以继续创建第一章或进入课程工作台。",
      finished: true,
      actions: `<a class="hub-button is-primary is-prominent" href="/teacher/courses?dojo=${encodeURIComponent(reference)}">进入课程工作台</a>${hasModule ? `<a class="hub-button is-secondary" href="/teacher/courses/${encodeURIComponent(reference)}/practices/new?module=${encodeURIComponent(response.data.module.id)}">新建实践题</a>` : `<a class="hub-button is-secondary" href="/teacher/courses/${encodeURIComponent(reference)}/chapters/new">继续新建章节</a>`}`,
    });
    api.showNotice(notice, "课程创建成功。", "success");
  }

  async function submitChapter() {
    const response = await api.json("POST", `/learning/dojos/${encodeURIComponent(dojoId)}/units`, {
      name: nameInput.value.trim(),
      description: descriptionInput.value.trim(),
    });
    if (!response || response.success !== true || !response.unit) throw new Error(api.errorMessage(response, "创建章节失败。"));
    showResult({
      title: `章节“${response.unit.name}”已创建`,
      copy: "章节已经加入课程，可以继续添加实践题或返回课程调整结构。",
      finished: true,
      actions: `<a class="hub-button is-primary is-prominent" href="/teacher/courses/${encodeURIComponent(dojoId)}/practices/new?module=${encodeURIComponent(response.unit.id)}">在本章新建实践题</a><a class="hub-button is-secondary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}">返回课程</a>`,
    });
    api.showNotice(notice, "章节创建成功。", "success");
  }

  async function submitPractice(runValidation) {
    setProgress(runValidation ? 18 : 10, "正在保存实践题", "正在保存题面、私有 Flag 门禁和运行环境设置。");
    const response = await api.json("POST", `/learning/dojos/${encodeURIComponent(dojoId)}/manual-drafts`, practicePayload(runValidation));
    if (!response || response.success !== true || !response.draft) throw new Error(api.errorMessage(response, "保存实践题失败。"));
    activeDraftId = response.draft.id;
    dirty = false;
    try { localStorage.removeItem(autosaveKey); } catch (error) {}
    if (!runValidation) {
      setBusy(false);
      showResult({
        kicker: "草稿已保存",
        title: "实践题草稿已保存",
        copy: "草稿尚未发布，学生看不到它。您可以现在检查，也可以稍后从题目管理继续。",
        actions: `<button class="hub-button is-primary is-prominent" type="button" data-result-action="validate"><i class="fas fa-shield-alt" aria-hidden="true"></i>检查并准备发布</button><a class="hub-button is-secondary" href="/teacher/courses?dojo=${encodeURIComponent(dojoId)}&tab=questions&selectedId=${encodeURIComponent(activeDraftId)}">管理这道题</a>`,
      });
      api.showNotice(notice, "实践题草稿已保存。", "success");
      return;
    }
    if (!response.job) throw new Error("题目已保存，但检查任务未能启动。请稍后从题目管理继续。");
    activeJobId = response.job.id;
    pollCount = 0;
    await pollJob();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !validateForm()) return;
    const mode = event.submitter ? event.submitter.value : "create";
    setBusy(true);
    formActions.hidden = false;
    result.hidden = true;
    markSteps(2);
    try {
      if (kind === "course") await submitCourse();
      else if (kind === "chapter") await submitChapter();
      else await submitPractice(mode !== "draft");
    } catch (error) {
      setBusy(false);
      progress.hidden = true;
      formActions.hidden = false;
      markSteps(1);
      showError(error.message);
    }
  });

  root.addEventListener("click", event => {
    const action = event.target.closest("[data-result-action]");
    if (!action) return;
    if (action.dataset.resultAction === "validate") startValidation();
    if (action.dataset.resultAction === "publish") publishPractice();
  });

  if (nameInput) {
    nameInput.addEventListener("input", updateSummary);
  }
  if (descriptionInput) descriptionInput.addEventListener("input", updateSummary);

  form.addEventListener("input", scheduleAutosave);
  form.addEventListener("change", scheduleAutosave);

  const moduleSelect = document.getElementById("manual-module");
  if (moduleSelect) moduleSelect.addEventListener("change", updateSummary);

  const initialEnabled = document.getElementById("manual-initial-enabled");
  if (initialEnabled) {
    const initialFields = document.getElementById("manual-initial-fields");
    const initialName = document.getElementById("manual-initial-name");
    initialEnabled.addEventListener("change", () => {
      initialFields.hidden = !initialEnabled.checked;
      initialName.required = initialEnabled.checked;
      if (initialEnabled.checked) initialName.focus();
    });
  }

  const answerToggle = document.getElementById("manual-answer-toggle");
  if (answerToggle) {
    answerToggle.addEventListener("click", () => {
      const input = document.getElementById("manual-expected-answer");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      answerToggle.setAttribute("aria-label", visible ? "显示答案" : "隐藏答案");
      answerToggle.innerHTML = `<i class="fas ${visible ? "fa-eye" : "fa-eye-slash"}" aria-hidden="true"></i>`;
    });
  }

  form.querySelectorAll('input[name="runtimeMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const web = radio.value === "web" && radio.checked;
      document.getElementById("manual-port-field").hidden = !web;
      document.getElementById("manual-runtime-hint").textContent = web
        ? "Web 服务题必须提供 .py、.js 或 .sh 入口文件，并在代码中使用上方端口。"
        : "终端题可以不填写；如填写，路径和内容必须同时提供。";
    });
  });

  window.addEventListener("beforeunload", event => {
    clearPolling();
    if (dirty && !finished && !busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  restoreLocalDraft();
  updateSummary();
  root.dataset.manualReady = "true";
})();

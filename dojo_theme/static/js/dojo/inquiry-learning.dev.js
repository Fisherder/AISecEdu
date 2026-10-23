(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const learning = $("inquiry-learning"), create = $("inquiry-create");
  if (!learning && !create) return;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const label = { subBytes: "字节代换", shiftRows: "行移位", mixColumns: "列混合", addRoundKey: "轮密钥加" };
  let project, spec, attempt, calculation, selectedByte = null, playing = false, timer, busy = false;
  const artifactId = learning?.dataset.artifactId;
  const prefix = artifactId ? `/projects/${encodeURIComponent(artifactId)}` : "";

  async function request(path, method = "GET", body) {
    const response = await fetch(`/pwncollege_api/v1${path}`, {
      method, credentials: "same-origin", headers: { "Content-Type": "application/json", "CSRF-Token": window.init?.csrfNonce || "" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json().catch(() => { throw Error("无法读取服务响应，请刷新页面或重新登录。"); });
    if (!response.ok || result.success !== true) throw Error(result.error?.message || "操作未完成，请重试。");
    return result.data;
  }
  const api = (path, method, body) => request(`/inquiry${path}`, method, body);
  function notice(message = "", kind = "") {
    const element = $(create ? "inq-create-notice" : "inq-notice");
    element.textContent = message; element.className = `inq-notice ${kind ? `is-${kind}` : ""}`;
  }
  async function operation(work) {
    if (busy) return;
    busy = true;
    if (learning) learning.setAttribute("aria-busy", "true");
    document.querySelectorAll("[data-inq-transform],#inq-challenge-verify,#inq-challenge-start,#inq-challenge-reset").forEach(element => { element.disabled = true; });
    try { return await work(); }
    catch (error) { stop(); notice(error.name === "TimeoutError" ? "连接超时。已保存的进度仍在，请刷新查看最新状态后继续。" : error.message, "error"); }
    finally {
      busy = false;
      if (learning) { learning.setAttribute("aria-busy", "false"); updateChallengeButtons(); }
    }
  }
  function editableFields(container, value) {
    $(container + "-objectives").innerHTML = value.objectives.map((objective, index) => `<label>学习目标 ${index + 1}<input name="objective-${index}" maxlength="200" required value="${escape(objective)}"></label>`).join("");
    $(container + "-phases").innerHTML = value.phases.map(phase => `<label>${escape(phase.title)}<textarea name="phase-${escape(phase.id)}" rows="2" maxlength="1200" required>${escape(phase.instruction)}</textarea></label>`).join("");
  }
  function formSpec(form) {
    const data = new FormData(form), values = {};
    for (const key of ["title", "intro", "audience"]) values[key] = String(data.get(key) || "").trim();
    values.minutes = Number(data.get("minutes")); values.engine = "aes128";
    values.objectives = [0, 1, 2].map(index => String(data.get(`objective-${index}`) || "").trim());
    values.phaseInstructions = Object.fromEntries(spec.phases.map(phase => [phase.id, String(data.get(`phase-${phase.id}`) || "").trim()]));
    return values;
  }
  function aiUrl(values, course, moduleIndex) {
    const prompt = `请使用流程探究式学习模式创建 AES-128 学习项目草稿。项目名称：${values.title}。学生基础：${values.audience}。预计 ${values.minutes} 分钟。情境：${values.intro}。请围绕真实字节状态、单比特对照实验与末轮操作核验设计环节说明；先保存草稿。`;
    const query = new URLSearchParams({ view: "conversation", inquiry: "1", prompt });
    if (course) query.set("dojo", course.referenceId);
    if (moduleIndex !== "") query.set("module", moduleIndex);
    return `/teacher?${query}`;
  }
  async function initCreate() {
    const context = await api("/context"); spec = context.example;
    editableFields("inq-create", spec);
    const form = $("inq-create-form"), courseSelect = $("inq-course"), moduleSelect = $("inq-module");
    context.courses.forEach(course => courseSelect.add(new Option(course.name, course.referenceId)));
    function update() {
      const course = context.courses.find(value => value.referenceId === courseSelect.value);
      if (!course || !course.modules.some(module => String(module.index) === moduleSelect.value)) {
        moduleSelect.replaceChildren(new Option("稍后选择", ""));
        course?.modules.forEach(module => moduleSelect.add(new Option(module.name, String(module.index))));
        if (course?.modules.length === 1) moduleSelect.value = String(course.modules[0].index);
      }
      $("inq-create-ai").href = aiUrl(formSpec(form), course, moduleSelect.value);
    }
    const query = new URLSearchParams(location.search);
    if (query.get("dojo")) courseSelect.value = query.get("dojo");
    update(); if (query.has("module")) moduleSelect.value = query.get("module");
    form.addEventListener("input", update);
    courseSelect.addEventListener("change", () => { moduleSelect.replaceChildren(new Option("稍后选择", "")); update(); });
    form.addEventListener("submit", event => {
      event.preventDefault(); if (!form.reportValidity()) return;
      operation(async () => {
        const button = form.querySelector('[type="submit"]'); button.disabled = true;
        try {
          const result = await api("/projects", "POST", { spec: formSpec(form), courseId: courseSelect.value || null, moduleIndex: moduleSelect.value === "" ? null : Number(moduleSelect.value) });
          location.assign(result.href);
        } finally { button.disabled = false; }
      });
    });
    notice("填写后即可创建草稿；学生在教师审核发布后才能访问。");
  }
  function stop() {
    playing = false; clearTimeout(timer);
    if ($("inq-play")) { $("inq-play").textContent = "播放"; $("inq-play").setAttribute("aria-pressed", "false"); }
  }
  async function action(value) {
    const requestKey = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, "0")).join("");
    const result = await api(prefix + "/actions", "POST", { attemptId: attempt.id, expectedSequence: attempt.sequence, requestKey, action: value });
    attempt = result.attempt; renderState();
    $("inq-save-state").textContent = attempt.mode === "PREVIEW" ? "教师预览，不计学情" : "进度已保存";
    if (result.feedback) notice(result.feedback, result.feedbackLevel || "success");
    return result;
  }
  async function loadCalculation() {
    const result = await api(prefix + "/trace?" + new URLSearchParams({ attemptId: attempt.id }));
    calculation = result.calculation;
    $("inq-ciphertext").textContent = calculation.ciphertext;
    $("inq-decrypted").textContent = result.decrypted;
    $("inq-round-keys").innerHTML = calculation.roundKeys.map((key, index) => `<div class="inq-round-key"><small>第 ${index} 轮轮密钥</small><code class="inq-hex">${key}</code></div>`).join("");
    renderStep();
  }
  function matrix(values, title, before, selectable = false) {
    return `<div class="inq-matrix-box"${selectable ? ` data-inq-side="${title === "变换前" ? "before" : "after"}"` : ""}><div class="inq-matrix-label">${escape(title)}</div><div class="inq-matrix" role="group" aria-label="${escape(title)}">${Array.from({ length: 16 }, (_, position) => {
      const row = Math.floor(position / 4), column = position % 4, index = column * 4 + row;
      const value = values[index].toString(16).padStart(2, "0");
      const tag = selectable ? "button" : "span";
      return `<${tag}${selectable ? ' type="button"' : ""} class="inq-byte${before && before[index] !== values[index] ? " is-changed" : ""}${selectable && index === selectedByte ? " is-selected" : ""}" ${selectable ? `data-inq-byte="${index}" tabindex="${index === (selectedByte ?? 0) ? 0 : -1}"` : ""} aria-label="${escape(title)}，行 ${row} 列 ${column}，${value}">${value}</${tag}>`;
    }).join("")}</div></div>`;
  }
  function renderStep() {
    if (!calculation || !attempt) return;
    const step = calculation.trace[attempt.state.step];
    $("inq-step-title").textContent = step.operation === "input" ? step.label : `第 ${step.round} 轮 · ${step.label}`;
    $("inq-step-count").textContent = `${attempt.state.step + 1} / ${calculation.trace.length}`;
    $("inq-step-explanation").textContent = step.explanation;
    $("inq-step").value = attempt.state.step;
    $("inq-prev").disabled = attempt.state.step === 0; $("inq-next").disabled = attempt.state.step === 40;
    $("inq-matrices").innerHTML = matrix(step.before, "变换前", null, true) + '<span class="inq-matrix-arrow" aria-hidden="true">→</span>' + matrix(step.state, "变换后", step.before, true);
    if (selectedByte !== null) {
      const index = selectedByte;
      $("inq-byte-detail").textContent = `行 ${index % 4}，列 ${Math.floor(index / 4)}：${step.before[index].toString(16).padStart(2, "0")} → ${step.state[index].toString(16).padStart(2, "0")}${step.roundKey ? `；轮密钥同位置为 ${step.roundKey[index].toString(16).padStart(2, "0")}，执行逐位异或。` : "。"}`;
    }
  }
  function renderContrast() {
    const contrast = attempt.state.contrast, target = $("inq-contrast-result");
    if (!contrast) { target.replaceChildren(); return; }
    const points = contrast.distances.map((distance, index) => `${48 + index * 17},${194 - distance * 1.25}`).join(" ");
    target.innerHTML = `<div class="inq-contrast-values"><div><p>原始明文</p><code class="inq-hex">${contrast.plaintext}</code><p>原始密文</p><code class="inq-hex">${contrast.ciphertext}</code></div><div><p>翻转第 ${contrast.bit} 位后的明文</p><code class="inq-hex">${contrast.changedPlaintext}</code><p>改变后的密文</p><code class="inq-hex">${contrast.changedCiphertext}</code></div></div><svg class="inq-contrast-chart" viewBox="0 0 760 230" role="img" aria-labelledby="inq-chart-title"><title id="inq-chart-title">单比特变化在 41 个状态中的传播；最终有 ${contrast.distances.at(-1)} 位不同</title><path d="M48 28V194H735" fill="none" stroke="#b5c4db"/><path d="M48 114H735M48 34H735" fill="none" stroke="#e0e7f1"/><text x="14" y="198" font-size="13" fill="#607087">0</text><text x="8" y="118" font-size="13" fill="#607087">64</text><text x="0" y="38" font-size="13" fill="#607087">128</text><polyline points="${points}" fill="none" stroke="#3155bf" stroke-width="2.5"/><text x="48" y="220" font-size="13" fill="#607087">输入</text><text x="675" y="220" font-size="13" fill="#607087">最终密文</text></svg><p>最终密文有 <strong>${contrast.distances.at(-1)} / 128</strong> 位不同。</p><details class="inq-details"><summary>查看每一步的比特差异</summary><p>${contrast.distances.map((distance, index) => `步骤 ${index}：${distance} 位`).join("；")}</p></details>`;
  }
  function updateChallengeButtons() {
    if (!attempt) return;
    const challenge = attempt.state.challenge;
    document.querySelectorAll("[data-inq-transform]").forEach(element => { element.disabled = busy || !challenge || challenge.verified || challenge.operations.length >= 4; });
    for (const id of ["inq-challenge-start", "inq-challenge-reset", "inq-challenge-verify"]) $(id).disabled = busy || (id !== "inq-challenge-start" && !challenge);
  }
  function renderState() {
    const state = attempt.state, phaseIndex = spec.phases.findIndex(phase => phase.id === state.phase), phase = spec.phases[phaseIndex];
    $("inq-phase-title").textContent = phase.title; $("inq-phase-instruction").textContent = phase.instruction;
    document.querySelectorAll(".inq-phase").forEach(element => { element.hidden = element.id !== `inq-${state.phase}`; });
    $("inq-phases").querySelectorAll("button").forEach(button => { if (button.dataset.inqPhase === state.phase) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current"); });
    $("inq-phase-prev").disabled = phaseIndex === 0; $("inq-phase-next").disabled = phaseIndex === spec.phases.length - 1;
    $("inq-progress-label").textContent = state.completed ? "学习目标已核验" : `已核验 ${Number(state.contrastPassed) + Number(state.challengePassed)} / 2 项`;
    $("inq-results").innerHTML = [["分组状态观察", `${state.observed.length} / 41 个位置（仅记录浏览）`, false], ["单比特对照实验", state.contrastPassed ? "已保存真实计算结果" : "尚未完成", state.contrastPassed], ["末轮独立操作", state.challengePassed ? "服务端核验通过" : "尚未通过", state.challengePassed]].map(([name, result, passed]) => `<div class="inq-result-line${passed ? "" : " is-pending"}"><span>${name}</span><strong>${result}</strong></div>`).join("");
    const challenge = state.challenge; $("inq-challenge-workspace").hidden = !challenge;
    if (challenge) {
      $("inq-challenge-matrices").innerHTML = matrix(challenge.initial, "第 9 轮结束状态") + matrix(challenge.state, "你的当前状态", challenge.initial) + matrix(challenge.roundKey, "第 10 轮轮密钥");
      $("inq-challenge-history").textContent = `已执行：${challenge.operations.map(operation => label[operation]).join(" → ") || "尚未操作"}${challenge.verified ? "；本次已通过核验" : ""}`;
    }
    updateChallengeButtons(); renderContrast(); renderStep();
  }
  function renderProject() {
    $("inq-title").textContent = spec.title; document.title = `${spec.title} · 玄甲`;
    $("inq-context").textContent = `${project.courseName || "独立项目"} · 流程探究式学习 · 约 ${spec.minutes} 分钟 · 第 ${attempt.revision} 版${attempt.mode === "PREVIEW" ? " · 教师预览，不计入学生学情" : ""}`;
    $("inq-back").href = project.teacher ? "/teacher/projects" : project.courseUrl || "/student";
    $("inq-back").textContent = project.teacher ? "返回我的项目" : "返回课程";
    $("inq-intro").textContent = spec.intro;
    $("inq-objectives").innerHTML = spec.objectives.map(objective => `<li>${escape(objective)}</li>`).join("");
    $("inq-audience").textContent = "学生基础：" + spec.audience;
    $("inq-phases").innerHTML = spec.phases.map((phase, index) => `<button type="button" data-inq-phase="${phase.id}"><span class="inq-phase-number">${index + 1}</span>${escape(phase.title)}</button>`).join("");
    $("inq-sources").innerHTML = spec.sources.map(source => `<p><a href="${escape(source.url)}" target="_blank" rel="noopener">${escape(source.title)}</a>：${escape(source.location)}</p>`).join("");
    $("inq-boundaries").textContent = spec.boundaries;
    $("inq-inputs").elements.plaintext.value = attempt.state.plaintext; $("inq-inputs").elements.key.value = attempt.state.key;
    $("inq-teacher-tools").hidden = !project.teacher;
    if (project.teacher) {
      const form = $("inq-edit-form");
      for (const name of ["title", "audience", "minutes", "intro"]) form.elements[name].value = spec[name];
      editableFields("inq-edit", spec);
      $("inq-release-state").textContent = project.publishedRevision ? `已发布第 ${project.publishedRevision} 版。${project.hasUnpublishedChanges ? "当前还有未发布修订，学生继续学习原发布版本。" : "当前版本已发布。"}` : "尚未发布，学生不可见。";
      $("inq-validation").textContent = project.validation?.status === "PASS" ? `算法与结构检查通过：${(project.validation.checks || []).join("、")}。${project.validation.checksScope || ""}` : "当前版本尚未通过发布检查。";
      form.querySelectorAll("input,textarea,button").forEach(element => { element.disabled = !project.canEdit; });
      $("inq-publish").disabled = !project.canEdit; $("inq-library-save").disabled = !project.canEdit;
    }
    $("inq-workspace").hidden = false; renderState();
  }
  async function refresh() {
    project = (await api(prefix)).project;
    const result = await api(prefix + "/session", "POST", {});
    attempt = result.attempt; spec = result.spec; calculation = null; selectedByte = null;
    renderProject(); await loadCalculation();
  }
  function bindLearning() {
    function selectByte(index, side) {
      selectedByte = index; renderStep();
      $("inq-matrices").querySelector(`[data-inq-side="${side}"] [data-inq-byte="${index}"]`)?.focus();
    }
    learning.addEventListener("click", event => {
      const phase = event.target.closest("[data-inq-phase]");
      if (phase) { stop(); operation(() => action({ type: "navigate", phase: phase.dataset.inqPhase })); }
      const byte = event.target.closest("[data-inq-byte]");
      if (byte) selectByte(Number(byte.dataset.inqByte), byte.closest("[data-inq-side]").dataset.inqSide);
      const transform = event.target.closest("[data-inq-transform]");
      if (transform) operation(() => action({ type: "challenge.apply", challengeId: attempt.state.challenge.id, operation: transform.dataset.inqTransform }));
    });
    $("inq-matrices").addEventListener("keydown", event => {
      const byte = event.target.closest("[data-inq-byte]");
      if (!byte || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const index = Number(byte.dataset.inqByte);
      let row = index % 4, column = Math.floor(index / 4);
      if (event.key === "ArrowLeft") column = Math.max(0, column - 1);
      if (event.key === "ArrowRight") column = Math.min(3, column + 1);
      if (event.key === "ArrowUp") row = Math.max(0, row - 1);
      if (event.key === "ArrowDown") row = Math.min(3, row + 1);
      selectByte(column * 4 + row, byte.closest("[data-inq-side]").dataset.inqSide);
    });
    for (const [id, offset] of [["inq-phase-prev", -1], ["inq-phase-next", 1]]) $(id).onclick = () => {
      const index = spec.phases.findIndex(phase => phase.id === attempt.state.phase); stop();
      if (spec.phases[index + offset]) operation(() => action({ type: "navigate", phase: spec.phases[index + offset].id }));
    };
    for (const [id, offset] of [["inq-prev", -1], ["inq-next", 1]]) $(id).onclick = () => { stop(); operation(() => action({ type: "observe", step: Math.max(0, Math.min(40, attempt.state.step + offset)) })); };
    $("inq-step").onchange = event => { stop(); operation(() => action({ type: "observe", step: Number(event.target.value) })); };
    $("inq-play").onclick = async () => {
      if (playing) { stop(); return; }
      playing = true; $("inq-play").textContent = "暂停"; $("inq-play").setAttribute("aria-pressed", "true");
      const advance = async () => {
        if (!playing || attempt.state.step >= 40) { stop(); return; }
        if (!busy) await operation(() => action({ type: "observe", step: attempt.state.step + 1 }));
        if (playing) timer = setTimeout(advance, 850);
      }; await advance();
    };
    $("inq-inputs").onsubmit = event => { event.preventDefault(); stop(); operation(async () => { const data = new FormData(event.target); await action({ type: "compute", plaintext: data.get("plaintext"), key: data.get("key") }); await loadCalculation(); notice("已按新输入重新计算；旧对照结果已清除。"); }); };
    $("inq-reset").onclick = () => { stop(); operation(async () => { await action({ type: "reset" }); $("inq-inputs").elements.plaintext.value = attempt.state.plaintext; $("inq-inputs").elements.key.value = attempt.state.key; await loadCalculation(); }); };
    $("inq-contrast-form").onsubmit = event => { event.preventDefault(); operation(() => action({ type: "contrast", bit: Number(new FormData(event.target).get("bit")) })); };
    $("inq-challenge-start").onclick = () => operation(() => action({ type: "challenge.start" }));
    $("inq-challenge-reset").onclick = () => operation(() => action({ type: "challenge.reset" }));
    $("inq-challenge-verify").onclick = () => operation(() => action({ type: "challenge.verify", challengeId: attempt.state.challenge.id }));
    $("inq-edit-open").onclick = () => { const open = $("inq-editor").hidden; $("inq-editor").hidden = !open; $("inq-edit-open").setAttribute("aria-expanded", String(open)); };
    $("inq-edit-form").onsubmit = event => { event.preventDefault(); stop(); operation(async () => { await api(prefix, "PATCH", { ...formSpec(event.target), ...spec.defaults, expectedRevision: project.revision }); await refresh(); $("inq-teacher-reviewed").checked = false; notice("新版本已保存，原发布版本与学生记录保留。", "success"); }); };
    $("inq-review").onclick = () => operation(async () => { const result = await api(prefix + "/review", "POST", { expectedRevision: project.revision }); project = result.project; renderProject(); notice("算法与结构检查通过。请实际预览学习流程后确认发布。", "success"); });
    $("inq-publish").onclick = () => operation(async () => {
      if (!$("inq-teacher-reviewed").checked) throw Error("请先预览并勾选当前版本的教师审核确认。");
      const result = await api(prefix + "/publish", "POST", { expectedRevision: project.revision, confirmed: true, teacherReviewed: true });
      project = result.project; renderProject(); notice("当前版本已审核发布，学生可从课程章节进入。", "success");
    });
    $("inq-library-save").onclick = () => operation(async () => { await request("/material-library/items", "POST", { source: { kind: "artifact", id: artifactId }, title: project.title, description: "流程探究式学习 · AES-128 完整项目", visibility: "private" }); notice("已保存到素材库。可从素材库加入其他课程，副本需重新审核发布。", "success"); });
    $("inq-evidence-open").onclick = () => operation(async () => {
      const result = await api(prefix + "/evidence"); $("inq-evidence").hidden = false;
      $("inq-evidence").innerHTML = result.learners.length ? result.learners.map(learner => {
        const state = learner.attempt.state;
        const events = learner.events.filter(event => ["contrast", "challenge.verify"].includes(event.payload.event.type));
        const followUp = !state.contrastPassed ? "建议先完成单比特对照实验。" : !state.challengePassed ? "建议返回末轮，重点检查变换顺序与列混合的适用轮次。" : "两项操作目标均已核验，可以更换参数继续探究。";
        return `<details class="inq-evidence-entry"><summary>${escape(learner.student)} · 第 ${learner.attempt.revision} 版 · ${state.completed ? "已完成核验" : "学习中"}</summary><p>对照实验：${state.contrastPassed ? "已完成" : "未完成"}；末轮操作：${state.challengePassed ? "已通过" : "未通过"}；${learner.chainValid ? "记录完整" : "记录校验异常，请联系管理员"}</p><p>${followUp}</p>${events.map(event => `<div class="inq-result-line"><span>${event.payload.event.type === "contrast" ? `单比特实验：翻转第 ${event.payload.event.details.bit} 位` : `末轮操作：${event.payload.event.details.operations.map(value => label[value]).join(" → ") || "尚未操作"}`}<small style="display:block">${escape(new Date(event.created).toLocaleString("zh-CN", {hour12:false}))}</small></span><strong>${event.payload.event.details.passed === false ? "未通过" : "已核验"}</strong></div>`).join("")}<details class="inq-details"><summary>查看原始核验记录与摘要</summary><pre>${escape(JSON.stringify(learner.events, null, 2))}</pre></details></details>`;
      }).join("") : "<p>尚无学生学习记录。教师预览不会计入这里。</p>";
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", stop);
  }
  if (create) operation(initCreate);
  else {
    bindLearning();
    operation(async () => { await refresh(); notice(attempt.mode === "PREVIEW" ? "当前为教师预览；可完整操作，不产生学生成绩。" : "已恢复当前版本的学习进度。完成对照实验和独立挑战后进行目标核验。"); });
  }
})();

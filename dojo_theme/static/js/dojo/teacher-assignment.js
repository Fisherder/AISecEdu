(function () {
  "use strict";
  const root = document.getElementById("teacher-assignment"), api = window.DojoLearning;
  if (!root || !api) return;
  const $ = id => document.getElementById(id), escape = api.escapeHtml;
  const endpoint = `/coursework/assignments/${encodeURIComponent(root.dataset.assignmentId)}`;
  let assignment, busy = false;
  function notice(text, error = false) { $("assignment-notice").textContent = text; $("assignment-notice").dataset.error = String(error); }
  function localTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  }
  const isoTime = value => value ? new Date(value).toISOString() : null;
  function question(item, index, locked) {
    const config = item.editConfig || item.config || {};
    const prefix = `assignment-item-${index}`;
    let answer = "";
    if (item.type === "MULTIPLE_CHOICE") {
      const choices = config.choices || [];
      const index = Number.isInteger(config.correctAnswer) ? config.correctAnswer : choices.indexOf(config.correctAnswer);
      const ordinal = index >= 0 && index < choices.length ? index + 1 : "";
      answer = `<label>选项（每行一个）<textarea data-item-field="choices" rows="${Math.max(2, Math.min(6, choices.length))}">${escape(choices.join("\n"))}</textarea></label><label>正确选项序号（从 1 开始）<input data-item-field="choiceAnswer" type="number" min="1" max="12" required value="${ordinal}"></label>`;
    } else if (item.type === "TRUE_FALSE") {
      answer = `<label>参考答案<select data-item-field="booleanAnswer"><option value="true" ${config.correctAnswer === true ? "selected" : ""}>正确</option><option value="false" ${config.correctAnswer === false ? "selected" : ""}>错误</option></select></label>`;
    } else if (["SHORT_ANSWER", "DEBATE"].includes(item.type)) {
      answer = `<label>参考答案或回答要点<textarea data-item-field="referenceAnswer" rows="4">${escape(config.referenceAnswer || "")}</textarea></label>${typeof config.rubric === "string" ? `<label>评分说明<textarea data-item-field="rubric" rows="3">${escape(config.rubric)}</textarea></label>` : ""}`;
    }
    const deps = [];
    if (item.artifactId) deps.push(`<a href="/teacher/artifacts/${encodeURIComponent(item.artifactId)}">检查配套教学内容</a>`);
    if (config.libraryPracticeDraftId) deps.push(`<a href="/teacher/courses?dojo=${encodeURIComponent(assignment.dojoReferenceId)}&tab=questions&selectedId=${encodeURIComponent(config.libraryPracticeDraftId)}">检查配套实践题</a>`);
    if (item.challenge?.href) deps.push(`<a href="${escape(item.challenge.href)}">打开实践环境</a>`);
    return `<section class="assignment-question" data-assignment-item="${index}"><h3>${index + 1}. ${escape(item.title)}</h3>${deps.length ? `<div class="assignment-dependencies">${deps.join(" · ")}<br><small>配套草稿需要单独通过原系统发布检查。</small></div>` : ""}<fieldset ${locked ? "disabled" : ""}><label for="${prefix}-title">题目名称<input id="${prefix}-title" data-item-field="title" maxlength="240" required value="${escape(item.title)}"></label><label>题面<textarea data-item-field="prompt" rows="4" maxlength="16000">${escape(item.prompt || "")}</textarea></label><label>分值<input data-item-field="points" type="number" min="0.1" max="1000" step="0.1" required value="${Number(item.points)}"></label>${answer}</fieldset></section>`;
  }
  function render() {
    const a = assignment;
    $("assignment-heading").textContent = a.title;
    $("assignment-meta").textContent = `${a.courseName} · ${{DRAFT:"草稿，仅教师可见", PUBLISHED:"已发布", CLOSED:"已结束"}[a.status] || a.status} · ${a.itemCount} 道题`;
    $("assignment-course-link").href = `/teacher/courses?dojo=${encodeURIComponent(a.dojoReferenceId)}&tab=questions`;
    $("assignment-title").value = a.title;
    $("assignment-description").value = a.description || "";
    $("assignment-instructions").value = a.instructions || "";
    $("assignment-start").value = localTime(a.availableFrom);
    $("assignment-due").value = localTime(a.dueAt);
    $("assignment-answer-policy").value = a.answerPolicy.mode;
    const counts = a.submissionCounts || {};
    const started = Object.entries(counts).some(([key,value]) => !["TOTAL", "NOT_STARTED"].includes(key) && Number(value) > 0);
    $("assignment-items").innerHTML = a.items.map((item,index) => question(item,index,started)).join("");
    $("assignment-items-save").hidden = started;
    $("assignment-edit-hint").textContent = started ? "已有学生开始作答，题目与答案已锁定；仍可查看和调整任务说明。" : "这里修改的是当前课程中的内容，不影响素材库或原课程。参考答案仅供教师编辑。";
    $("assignment-publish").hidden = a.status === "PUBLISHED";
    $("assignment-publish").textContent = a.status === "CLOSED" ? "重新开放给学生" : "确认发布给学生";
    $("assignment-close").hidden = a.status !== "PUBLISHED";
    $("assignment-student-link").hidden = a.status === "DRAFT";
    $("assignment-student-link").href = `/learning/assignments/${encodeURIComponent(a.id)}`;
    ["assignment-settings-form", "assignment-items-form", "assignment-delivery"].forEach(id => $(id).hidden = false);
  }
  async function load() {
    const response = await api.request(endpoint);
    assignment = (response.data || response).assignment;
    render();
  }
  async function save(path, body, success) {
    if (busy) return;
    busy = true; root.setAttribute("aria-busy", "true");
    try {
      await api.json(path ? "POST" : "PATCH", endpoint + path, path ? body : {...body, expectedUpdated: assignment.updated});
      await load(); notice(success);
    } catch (error) { notice(error.message || "操作没有完成，请重试。", true); }
    finally { busy = false; root.removeAttribute("aria-busy"); }
  }
  $("assignment-settings-form").addEventListener("submit", event => {
    event.preventDefault();
    void save("", {title: $("assignment-title").value, description: $("assignment-description").value,
      instructions: $("assignment-instructions").value, availableFrom: isoTime($("assignment-start").value),
      dueAt: isoTime($("assignment-due").value), settings: {answerPolicy: $("assignment-answer-policy").value}}, "任务说明与安排已保存。");
  });
  $("assignment-items-form").addEventListener("submit", event => {
    event.preventDefault();
    const items = assignment.items.map((item,index) => {
      const section = root.querySelector(`[data-assignment-item="${index}"]`);
      const value = name => section.querySelector(`[data-item-field="${name}"]`)?.value;
      const config = {...(item.editConfig || item.config)};
      if (item.type === "MULTIPLE_CHOICE") { config.choices = value("choices").split("\n").map(line => line.trim()).filter(Boolean); config.correctAnswer = Number(value("choiceAnswer")) - 1; }
      if (item.type === "TRUE_FALSE") config.correctAnswer = value("booleanAnswer") === "true";
      if (value("referenceAnswer") !== undefined) config.referenceAnswer = value("referenceAnswer");
      if (value("rubric") !== undefined) config.rubric = value("rubric");
      return {type: item.type, title: value("title"), prompt: value("prompt"), points: Number(value("points")), required: item.required,
        challengeId: item.challengeId, artifactId: item.artifactId, config};
    });
    void save("", {items}, "题目修改已保存；素材库与原课程保持不变。");
  });
  $("assignment-publish").addEventListener("click", () => { void save("/publish", {}, "已发布到当前课程。"); });
  $("assignment-close").addEventListener("click", () => { void save("/close", {}, "本次任务已结束。"); });
  load().catch(error => notice(error.message, true));
})();

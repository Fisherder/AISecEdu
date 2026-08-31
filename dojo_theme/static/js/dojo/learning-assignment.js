(function () {
  "use strict";

  const root = document.getElementById("learning-assignment");
  const api = window.DojoLearning;
  if (!root || !api) return;

  const assignmentId = root.dataset.assignmentId;
  const storageKey = `aisecedu:assignment:${assignmentId}:draft:v2`;
  const state = {
    assignment: null,
    answers: {},
    currentIndex: 0,
    saveTimer: null,
    saving: false,
    saveQueued: false,
    submitQueued: false,
    dirty: false,
    serverUpdated: null,
    channel: null,
  };
  const notice = document.getElementById("learning-assignment-notice");

  function unwrap(payload) {
    if (!payload || payload.success !== true) {
      throw new Error(api.errorMessage(payload, "请求失败。"));
    }
    return payload.data || {};
  }

  function showNotice(message, kind) {
    return api.showNotice(notice, message, kind || "info");
  }

  function typeLabel(type) {
    return ({
      CHALLENGE: "Dojo 实验",
      MULTIPLE_CHOICE: "选择题",
      TRUE_FALSE: "判断题",
      SHORT_ANSWER: "简答题",
      DEBATE: "辩论陈述",
      ARTIFACT: "学习产物",
    })[type] || "学习任务";
  }

  function statusLabel() {
    const assignment = state.assignment;
    if (assignment.assessmentState === "PENDING") return "等待评阅";
    if (assignment.activityState === "COMPLETED") return "已完成";
    if (assignment.status === "CLOSED") return "已关闭";
    if (assignment.activityState === "IN_PROGRESS") return "作答中";
    return "未开始";
  }

  function resultFor(item) {
    return item.result || (
      (state.assignment.submission && state.assignment.submission.itemResults || [])
        .find(row => String(row.itemId) === String(item.id))
    );
  }

  function prioritizeResults() {
    if (!state.assignment || state.assignment.assessmentState !== "READY") return;
    state.assignment.items = [...(state.assignment.items || [])].sort((left, right) => {
      const leftResult = resultFor(left);
      const rightResult = resultFor(right);
      const priority = result => {
        if (!result) return 2;
        if (result.needsReview || Number(result.score) < Number(result.maxScore)) return 0;
        return 1;
      };
      return priority(leftResult) - priority(rightResult)
        || Number(left.position || 0) - Number(right.position || 0);
    });
    const firstIssue = state.assignment.items.findIndex(item => {
      const result = resultFor(item);
      return result && (result.needsReview || Number(result.score) < Number(result.maxScore));
    });
    state.currentIndex = firstIssue >= 0 ? firstIssue : 0;
  }

  function answerControl(item, disabled) {
    const answer = state.answers[item.id];
    const name = `answer-${item.id}`;
    if (item.type === "CHALLENGE") {
      const passed = Boolean(resultFor(item) && resultFor(item).score > 0);
      return item.challenge
        ? `<a class="cs-btn ${passed ? "cs-btn-primary" : ""}" href="${api.escapeHtml(item.challenge.url)}?returnTo=${encodeURIComponent(window.location.pathname)}"><i class="fas fa-terminal" aria-hidden="true"></i>${passed ? "查看已通过实验" : "打开实验环境"}</a>`
        : '<div class="la-recovery"><strong>关联实验当前不可用</strong><a href="/student">返回今天选择其他任务</a></div>';
    }
    if (item.type === "MULTIPLE_CHOICE") {
      return `<div class="la-options">${(item.config.choices || []).map(choice => `<label class="la-option"><input type="radio" name="${name}" value="${api.escapeHtml(choice)}" ${String(answer) === String(choice) ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${api.escapeHtml(choice)}</span></label>`).join("")}</div>`;
    }
    if (item.type === "TRUE_FALSE") {
      return `<div class="la-options"><label class="la-option"><input type="radio" name="${name}" value="true" ${answer === true || answer === "true" ? "checked" : ""} ${disabled ? "disabled" : ""}><span>正确</span></label><label class="la-option"><input type="radio" name="${name}" value="false" ${answer === false || answer === "false" ? "checked" : ""} ${disabled ? "disabled" : ""}><span>错误</span></label></div>`;
    }
    if (item.type === "ARTIFACT") {
      return `<input type="text" name="${name}" value="${api.escapeHtml(answer || "")}" placeholder="粘贴个人学习产物链接或编号" ${disabled ? "disabled" : ""}>`;
    }
    const placeholder = item.config.placeholder || (
      item.type === "DEBATE"
        ? "陈述立场、证据以及对可能反驳的回应…"
        : "用自己的语言作答，并给出可复核依据…"
    );
    return `<textarea name="${name}" placeholder="${api.escapeHtml(placeholder)}" ${disabled ? "disabled" : ""}>${api.escapeHtml(answer || "")}</textarea>`;
  }

  function resultMarkup(item) {
    const result = resultFor(item);
    if (!result) return "";
    const config = item.config || {};
    const policy = state.assignment.answerPolicy || {};
    const reference = policy.answersVisible
      ? config.correctAnswer !== undefined
        ? config.correctAnswer
        : config.referenceAnswer
      : null;
    const feedback = result.feedback || (result.score > 0 ? "已达到本题要求。" : "先检查本题反馈，再尝试说明你的判断依据。");
    return `<div class="la-result ${result.needsReview ? "is-review" : result.score > 0 ? "is-correct" : "is-wrong"}" role="status"><strong>${result.score} / ${result.maxScore} 分</strong><span>${api.escapeHtml(feedback)}</span>${reference !== null && reference !== "" ? `<span><strong>参考答案：</strong>${api.escapeHtml(Array.isArray(reference) ? reference.join("、") : reference)}</span>` : ""}${result.needsReview ? "<span>教师将进一步复核这道题。</span>" : ""}</div>`;
  }

  function renderQuestion(item, index, disabled) {
    const questionNumber = Number(item.position || 0) + 1;
    return `<article class="la-question ${index === state.currentIndex ? "is-current" : ""}" data-item-id="${api.escapeHtml(item.id)}" data-question-index="${index}"><div class="la-question-head"><div><span>第 ${questionNumber} 题 · ${api.escapeHtml(typeLabel(item.type))}${item.required ? " · 必答" : " · 选答"}</span><h2>${api.escapeHtml(item.title || `题目 ${questionNumber}`)}</h2></div><span>${item.points} 分</span></div><p>${api.escapeHtml(item.prompt || "").replace(/\n/g, "<br>")}</p>${answerControl(item, disabled)}${resultMarkup(item)}</article>`;
  }

  function hasAnswer(item) {
    if (item.type === "CHALLENGE") {
      return Boolean(resultFor(item) && resultFor(item).score > 0);
    }
    const value = state.answers[item.id];
    return Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && String(value).trim() !== "";
  }

  function answeredCount() {
    return (state.assignment.items || []).filter(hasAnswer).length;
  }

  function renderQuestionNav() {
    const items = state.assignment.items || [];
    const nav = document.getElementById("la-question-nav");
    nav.innerHTML = items.map((item, index) => {
      const questionNumber = Number(item.position || 0) + 1;
      return `<button type="button" class="${index === state.currentIndex ? "is-current" : ""} ${hasAnswer(item) ? "is-answered" : ""}" data-question-target="${index}" aria-label="打开第 ${questionNumber} 题${hasAnswer(item) ? "，已作答" : "，未作答"}" aria-current="${index === state.currentIndex ? "step" : "false"}">${questionNumber}</button>`;
    }).join("");
    nav.querySelectorAll("[data-question-target]").forEach(button => {
      button.addEventListener("click", () => setCurrentQuestion(Number(button.dataset.questionTarget), true));
    });
  }

  function updateProgress() {
    const items = state.assignment.items || [];
    document.getElementById("la-answered").textContent = `${answeredCount()} / ${state.assignment.itemCount}`;
    document.getElementById("la-mobile-position").textContent = `${Math.min(state.currentIndex + 1, items.length || 1)} / ${items.length || 1}`;
    document.getElementById("la-mobile-previous").disabled = state.currentIndex <= 0;
    const next = document.getElementById("la-mobile-next");
    const atLastQuestion = state.currentIndex >= items.length - 1;
    next.disabled = false;
    next.dataset.action = atLastQuestion ? "submit" : "next";
    next.innerHTML = atLastQuestion
      ? '提交作业<i class="fas fa-paper-plane" aria-hidden="true"></i>'
      : '下一题<i class="fas fa-arrow-right" aria-hidden="true"></i>';
    renderQuestionNav();
  }

  function setCurrentQuestion(index, focus) {
    const items = state.assignment.items || [];
    state.currentIndex = Math.max(0, Math.min(index, Math.max(0, items.length - 1)));
    document.querySelectorAll(".la-question").forEach((element, elementIndex) => {
      element.classList.toggle("is-current", elementIndex === state.currentIndex);
    });
    updateProgress();
    const current = document.querySelector(`.la-question[data-question-index="${state.currentIndex}"]`);
    if (focus && current) {
      current.setAttribute("tabindex", "-1");
      current.focus({preventScroll: true});
      current.scrollIntoView({behavior: "smooth", block: "start"});
    }
  }

  function collectAnswers() {
    (state.assignment.items || []).forEach(item => {
      if (item.type === "CHALLENGE") return;
      const controls = Array.from(document.getElementsByName(`answer-${item.id}`));
      if (!controls.length) return;
      if (["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(item.type)) {
        const checked = controls.find(control => control.checked);
        if (checked) {
          state.answers[item.id] = item.type === "TRUE_FALSE" ? checked.value === "true" : checked.value;
        } else {
          delete state.answers[item.id];
        }
      } else {
        const value = controls[0].value;
        if (value.trim()) state.answers[item.id] = value;
        else delete state.answers[item.id];
      }
    });
    updateProgress();
  }

  function persistLocal() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        answers: state.answers,
        serverUpdated: state.serverUpdated,
        savedAt: new Date().toISOString(),
      }));
    } catch (error) {
      showNotice("浏览器无法保存离线草稿，请保持本页打开。", "warning");
    }
  }

  function localDraft() {
    try {
      const value = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      return value && typeof value.answers === "object" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function broadcast() {
    if (state.channel) {
      state.channel.postMessage({serverUpdated: state.serverUpdated, savedAt: Date.now()});
    }
  }

  function render() {
    const assignment = state.assignment;
    const submission = assignment.submission;
    const graded = assignment.assessmentState === "READY";
    const mayResubmit = Boolean(assignment.settings && assignment.settings.allowResubmit);
    const disabled = assignment.status !== "PUBLISHED" || graded && !mayResubmit;
    document.getElementById("la-title").textContent = assignment.title;
    document.getElementById("la-meta").textContent = `${assignment.courseName} · ${assignment.itemCount} 道题 · ${assignment.maxScore} 分`;
    const status = document.getElementById("la-status");
    status.textContent = statusLabel();
    status.className = `cs-status ${assignment.activityState === "COMPLETED" ? "is-published" : assignment.status === "CLOSED" ? "is-closed" : "is-draft"}`;
    document.getElementById("la-instructions").innerHTML = `<strong>任务说明</strong><br>${api.escapeHtml(assignment.instructions || assignment.description || "按顺序完成题目并提交；实验结果以平台真实判题为准。").replace(/\n/g, "<br>")}`;
    document.getElementById("la-form").innerHTML = (assignment.items || []).map((row, index) => renderQuestion(row, index, disabled)).join("");
    document.getElementById("la-points").textContent = `${assignment.maxScore} 分`;
    document.getElementById("la-due").textContent = assignment.dueAt ? api.formatDate(assignment.dueAt) : "长期开放";
    document.getElementById("la-answer-policy").textContent = assignment.answerPolicy && assignment.answerPolicy.label || "提交后公布";
    document.getElementById("la-save-status").textContent = submission
      ? graded && mayResubmit
        ? "已评分，可修改后重新提交"
        : graded
          ? "答案已提交"
          : `已保存 ${api.formatDate(submission.updated)}`
      : state.dirty
        ? "仅保存在本机"
        : "尚未修改";
    document.getElementById("la-save").hidden = disabled;
    document.getElementById("la-submit").hidden = disabled;
    const score = document.getElementById("la-score");
    score.hidden = !graded;
    if (graded) {
      score.innerHTML = `<strong>${submission.score}</strong><small>/ ${submission.maxScore} 分 · ${submission.percent}%</small>`;
    }
    const feedback = document.getElementById("la-feedback");
    feedback.hidden = !graded || !submission.feedback;
    feedback.textContent = graded ? submission.feedback || "" : "";
    document.getElementById("learning-assignment-loading").hidden = true;
    document.getElementById("learning-assignment-content").hidden = false;
    updateProgress();
    const form = document.getElementById("la-form");
    if (!form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("input", scheduleSave);
      form.addEventListener("change", scheduleSave);
    }
  }

  function scheduleSave() {
    collectAnswers();
    state.dirty = true;
    persistLocal();
    document.getElementById("la-save-status").textContent = navigator.onLine ? "等待自动保存" : "离线草稿已保存在本机";
    window.clearTimeout(state.saveTimer);
    if (navigator.onLine) {
      state.saveTimer = window.setTimeout(() => save(false).catch(showError), 800);
    }
  }

  async function save(submit) {
    if (state.saving) {
      state.submitQueued = state.submitQueued || submit;
      state.saveQueued = state.saveQueued || !submit;
      return;
    }
    collectAnswers();
    if (!navigator.onLine) {
      persistLocal();
      showNotice("当前处于离线状态，答案已安全保存在本机；联网后会自动同步。", "warning");
      return;
    }
    state.saving = true;
    const saveButton = document.getElementById("la-save");
    const submitButton = document.getElementById("la-submit");
    saveButton.disabled = true;
    submitButton.disabled = true;
    document.getElementById("la-save-status").textContent = submit ? "正在提交…" : "正在保存…";
    try {
      const payload = await api.json("POST", `/coursework/assignments/${encodeURIComponent(assignmentId)}/work`, {
        action: submit ? "submit" : "save",
        answers: state.answers,
        expectedUpdated: state.serverUpdated,
      });
      const data = unwrap(payload);
      state.assignment = data.assignment;
      state.answers = {...(state.assignment.submission && state.assignment.submission.answers || {})};
      state.serverUpdated = state.assignment.submission && state.assignment.submission.updated;
      if (submit) prioritizeResults();
      state.dirty = false;
      persistLocal();
      broadcast();
      if (submit) showNotice("提交成功，评分结果和教师复核状态已更新。", "success");
      render();
    } catch (error) {
      if (error.status === 409 || error.payload && error.payload.code === "REVISION_CONFLICT") {
        showNotice("另一窗口保存了更新答案。本页没有覆盖它，请重新载入最新版本后继续。", "warning");
      }
      throw error;
    } finally {
      state.saving = false;
      saveButton.disabled = false;
      submitButton.disabled = false;
      if (state.submitQueued || state.saveQueued) {
        const queuedSubmit = state.submitQueued;
        state.submitQueued = false;
        state.saveQueued = false;
        window.setTimeout(() => save(queuedSubmit).catch(showError), 0);
      }
    }
  }

  function showError(error) {
    showNotice(error instanceof Error ? error.message : String(error), "danger");
  }

  function missingRequired() {
    return (state.assignment.items || []).filter(item => item.required && !hasAnswer(item));
  }

  async function submit() {
    collectAnswers();
    const missing = missingRequired();
    if (missing.length) {
      const first = state.assignment.items.indexOf(missing[0]);
      const questionNumbers = missing.map(item => Number(item.position || 0) + 1).join("、");
      setCurrentQuestion(first, true);
      showNotice(`未完成的必答题：第 ${questionNumbers} 题。已定位到第一道，请完成后再提交。`, "warning");
      return;
    }
    const confirmed = await window.AISecEduUI.confirm(
      `确认提交全部 ${state.assignment.itemCount} 道题？${state.assignment.answerPolicy && state.assignment.answerPolicy.label ? ` ${state.assignment.answerPolicy.label}。` : ""}`,
      {title: "提交评测", confirmLabel: "确认提交"},
    );
    if (confirmed) await save(true);
  }

  async function boot() {
    const slowTimer = window.setTimeout(() => {
      document.getElementById("la-loading-copy").textContent = "正在同步课程任务、服务器草稿和实验结果，请稍候…";
    }, 8000);
    try {
      const data = unwrap(await api.request(`/coursework/assignments/${encodeURIComponent(assignmentId)}/work`));
      state.assignment = data.assignment;
      state.answers = {...(state.assignment.submission && state.assignment.submission.answers || {})};
      state.serverUpdated = state.assignment.submission && state.assignment.submission.updated;
      prioritizeResults();
      const draft = localDraft();
      if (draft && (!state.serverUpdated || new Date(draft.savedAt || 0) > new Date(state.serverUpdated))) {
        state.answers = {...state.answers, ...draft.answers};
        state.dirty = true;
        showNotice("已恢复这台设备上尚未同步的草稿。", "success");
      }
      if ("BroadcastChannel" in window) {
        state.channel = new BroadcastChannel(`aisecedu-assignment-${assignmentId}`);
        state.channel.addEventListener("message", event => {
          if (event.data && event.data.serverUpdated && event.data.serverUpdated !== state.serverUpdated) {
            showNotice("同一任务已在另一窗口更新。提交前请重新载入，避免覆盖新答案。", "warning");
          }
        });
      }
      render();
    } catch (error) {
      document.getElementById("learning-assignment-loading").hidden = true;
      showError(error);
    } finally {
      window.clearTimeout(slowTimer);
    }
  }

  document.getElementById("la-save").addEventListener("click", () => save(false).catch(showError));
  document.getElementById("la-submit").addEventListener("click", () => submit().catch(showError));
  document.getElementById("la-mobile-previous").addEventListener("click", () => setCurrentQuestion(state.currentIndex - 1, true));
  document.getElementById("la-mobile-next").addEventListener("click", event => {
    if (event.currentTarget.dataset.action === "submit") submit().catch(showError);
    else setCurrentQuestion(state.currentIndex + 1, true);
  });
  window.addEventListener("online", () => {
    if (state.dirty) save(false).catch(showError);
  });
  window.addEventListener("offline", () => showNotice("网络已断开，继续作答会保存在本机。", "warning"));
  window.addEventListener("beforeunload", persistLocal);
  boot();
})();

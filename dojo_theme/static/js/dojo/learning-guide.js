 (function () {
  let bootAttempts = 0;

  function boot() {
  const root = document.getElementById("learning-guide");
  if (!root || root.dataset.guideReady === "true") return;
  if (!window.DojoLearning) {
    if (bootAttempts < 100) {
      bootAttempts += 1;
      window.setTimeout(boot, 50);
      return;
    }
    const bootNotice = document.getElementById("guide-notice");
    if (bootNotice) {
      bootNotice.hidden = false;
      bootNotice.className = "guide-notice alert alert-danger";
      bootNotice.textContent = "Guide 未能完成初始化。请刷新页面后重试。";
    } else {
      console.error("Guide 未能完成初始化。请刷新页面后重试。");
    }
    return;
  }
  root.dataset.guideReady = "true";

  function syncGuideHeight() {
    const top = Math.max(0, root.getBoundingClientRect().top);
    root.style.height = `${Math.max(0, Math.floor(window.innerHeight - top))}px`;
  }

  syncGuideHeight();
  window.addEventListener("resize", syncGuideHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncGuideHeight);
  }

  const learning = window.DojoLearning;
  const sidebar = root.querySelector(".guide-sidebar");
  const threadList = document.getElementById("guide-thread-list");
  const conversation = document.getElementById("guide-conversation");
  const empty = document.getElementById("guide-empty");
  const messages = document.getElementById("guide-messages");
  const thinking = document.getElementById("guide-thinking");
  const promptList = document.getElementById("guide-quick-prompts");
  const profileStrip = document.getElementById("guide-profile-strip");
  const notice = document.getElementById("guide-notice");
  const question = document.getElementById("guide-question");
  const sendButton = document.getElementById("guide-send");
  const referenceToggle = document.getElementById("guide-reference-toggle");
  const referencePicker = document.getElementById("guide-reference-picker");
  const referenceSearch = document.getElementById("guide-reference-search");
  const referenceOptionsRoot = document.getElementById("guide-reference-options");
  const selectedReferencesRoot = document.getElementById("guide-selected-references");

  if (!sidebar || !threadList || !conversation || !empty || !messages || !thinking || !promptList || !profileStrip || !question || !sendButton || !referenceToggle || !referencePicker || !referenceSearch || !referenceOptionsRoot || !selectedReferencesRoot) {
    root.dataset.guideReady = "";
    return;
  }

  let currentThreadId = new URLSearchParams(window.location.search).get("thread");
  let currentMessages = [];
  let currentProfile = {};
  let busy = false;
  let loadSequence = 0;
  let referenceOptions = [];
  const selectedReferences = new Map();

  function messageHtml(content) {
    const chunks = String(content || "").split(/```/);
    return chunks.map((chunk, index) => {
      const escaped = learning.escapeHtml(chunk);
      if (index % 2) {
        const newline = escaped.indexOf("\n");
        const code = newline >= 0 ? escaped.slice(newline + 1) : escaped;
        return `<pre><code>${code}</code></pre>`;
      }
      return escaped
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\n\n+/g, "</p><p>")
        .replace(/\n/g, "<br>");
    }).join("");
  }

  function setNotice(text, kind) {
    learning.showNotice(notice, text, kind || "info");
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      conversation.scrollTop = conversation.scrollHeight;
    });
  }

  function referenceLabel(reference) {
    return reference.exercise || reference.challengeId || reference.id;
  }

  function messageReferencesHtml(metadata) {
    const references = Array.isArray(metadata && metadata.references)
      ? metadata.references
      : [];
    if (!references.length) return "";
    return `<div class="guide-message-references">${references.map(reference => `
      <span class="guide-message-reference" title="${learning.escapeHtml(`${reference.course || ""} · ${reference.unit || ""} · ${referenceLabel(reference)}`)}">
        <i class="fas fa-paperclip" aria-hidden="true"></i>
        <span>${learning.escapeHtml(referenceLabel(reference))}</span>
      </span>`).join("")}</div>`;
  }

  function messageScopeMeta(metadata) {
    const references = Array.isArray(metadata && metadata.references)
      ? metadata.references
      : [];
    if (references.length) {
      const labels = references.map(referenceLabel).join("、");
      const validation = metadata && metadata.scopeValidation;
      if (!validation || !validation.status) {
        return `历史回答 · 引用范围未校验 · ${labels}`;
      }
      const protectedScope = validation && validation.status === "BLOCKED";
      return protectedScope
        ? `引用范围保护已生效 · ${labels}`
        : `仅依据本对话引用 · ${labels}`;
    }
    return "基于整体学习记录";
  }

  function legacyScopeWarningHtml(metadata) {
    const references = Array.isArray(metadata && metadata.references)
      ? metadata.references
      : [];
    const validation = metadata && metadata.scopeValidation;
    if (!references.length || (validation && validation.status)) return "";
    return `
      <div class="guide-message-scope-warning">
        <i class="fas fa-shield-alt" aria-hidden="true"></i>
        此历史回答生成于引用范围修复前，不会作为后续回答依据。
      </div>`;
  }

  function renderMessages(items) {
    currentMessages = items || [];
    empty.hidden = currentMessages.length !== 0;
    messages.innerHTML = currentMessages.map(message => {
      const assistant = message.role === "assistant";
      const metadata = message.metadata || {};
      const actions = assistant && Array.isArray(metadata.actions) ? metadata.actions : [];
      return `
        <article class="guide-message-row ${assistant ? "is-assistant" : "is-user"}">
          <div class="guide-avatar">${assistant ? '<i class="fas fa-compass"></i>' : '<i class="fas fa-user"></i>'}</div>
          <div class="guide-message">
            <div class="guide-message-author">${assistant ? "Guide" : "你"}</div>
            ${messageReferencesHtml(metadata)}
            ${assistant ? legacyScopeWarningHtml(metadata) : ""}
            <div class="guide-message-content"><p>${messageHtml(message.content)}</p></div>
            ${actions.some(action => action.url) ? `<div class="guide-message-actions">${actions.filter(action => action.url).map(action => `
              <a href="${learning.escapeHtml(action.url)}" class="btn btn-sm btn-outline-primary">
                ${learning.escapeHtml(action.label || "打开")} <i class="fas fa-arrow-right"></i>
              </a>`).join("")}</div>` : ""}
            ${assistant && metadata.model ? `<small class="guide-message-meta">${learning.escapeHtml(metadata.model)} · ${learning.escapeHtml(messageScopeMeta(metadata))}</small>` : ""}
          </div>
        </article>`;
    }).join("");
    scrollToBottom();
  }

  function renderThreads(threads) {
    threadList.innerHTML = threads.length ? threads.map(thread => `
      <div class="guide-thread ${thread.id === currentThreadId ? "is-active" : ""}" data-thread-id="${learning.escapeHtml(thread.id)}">
        <button type="button" class="guide-thread-open" title="${learning.escapeHtml(thread.title)}">
          <i class="far fa-comment-alt"></i>
          <span>${learning.escapeHtml(thread.title)}</span>
        </button>
        <button type="button" class="guide-thread-delete" aria-label="删除对话"><i class="fas fa-trash-alt"></i></button>
      </div>`).join("") : '<p class="guide-thread-empty">你的对话会显示在这里。</p>';
  }

  function renderProfile(profile) {
    currentProfile = profile || {};
    const summary = profile.summary || {};
    const weakest = profile.weakestSkills || [];
    const references = Array.from(selectedReferences.values());
    const scope = references.length
      ? `<span class="guide-scope-chip is-referenced" title="${learning.escapeHtml(references.map(reference => `${reference.course} · ${reference.unit} · ${referenceLabel(reference)}`).join("\n"))}">
          <i class="fas fa-paperclip"></i> 本对话题目：${learning.escapeHtml(references.map(referenceLabel).join("、"))}
        </span>
        <span class="guide-scope-rule"><i class="fas fa-shield-alt"></i> 仅使用所选题目的证据</span>`
      : `<span class="guide-scope-chip"><i class="fas fa-layer-group"></i> 回答范围：整体学习记录</span>`;
    profileStrip.innerHTML = `
      ${scope}
      <span><i class="fas fa-book-open"></i> ${learning.escapeHtml(summary.enrolledCourses || 0)} 门课程</span>
      <span><i class="fas fa-check-circle"></i> 已完成 ${learning.escapeHtml(summary.completedExercises || 0)} 题</span>
      <span><i class="fas fa-chart-line"></i> 掌握度 ${learning.escapeHtml(summary.averageMastery || 0)}</span>
      ${weakest[0] ? `<span><i class="fas fa-bullseye"></i> 优先补强：${learning.escapeHtml(weakest[0].label)}</span>` : ""}`;
  }

  function renderPrompts(prompts) {
    promptList.innerHTML = (prompts || []).slice(0, 4).map(prompt => `
      <button type="button" class="guide-quick-prompt">${learning.escapeHtml(prompt)}</button>`).join("");
  }

  function renderSelectedReferences() {
    const references = Array.from(selectedReferences.values());
    selectedReferencesRoot.hidden = references.length === 0;
    selectedReferencesRoot.innerHTML = references.length ? `
      <span class="guide-reference-scope-label">
        <i class="fas fa-thumbtack" aria-hidden="true"></i>
        本对话依据
      </span>
      ${references.map(reference => `
      <span class="guide-reference-chip" title="${learning.escapeHtml(`${reference.course} · ${reference.unit} · ${referenceLabel(reference)}`)}">
        <i class="fas fa-paperclip" aria-hidden="true"></i>
        <span>${learning.escapeHtml(referenceLabel(reference))}</span>
        <button type="button" data-remove-reference="${learning.escapeHtml(reference.id)}"
            aria-label="取消引用 ${learning.escapeHtml(referenceLabel(reference))}" ${busy ? "disabled" : ""}>
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </span>`).join("")}` : "";
  }

  function referenceState(reference) {
    if (reference.completed) return "已完成";
    if (reference.recentAttempts) return `${reference.recentAttempts} 次近期尝试`;
    return "未尝试";
  }

  function renderReferenceOptions() {
    const query = referenceSearch.value.trim().toLocaleLowerCase();
    const matches = referenceOptions.filter(reference => {
      if (!query) return true;
      return [
        reference.course,
        reference.unit,
        reference.exercise,
        reference.id,
      ].some(value => String(value || "").toLocaleLowerCase().includes(query));
    }).slice(0, 100);
    referenceOptionsRoot.innerHTML = matches.length ? matches.map(reference => {
      const selected = selectedReferences.has(reference.id);
      return `
        <button type="button" class="guide-reference-option"
            data-reference-id="${learning.escapeHtml(reference.id)}"
            role="option" aria-selected="${selected ? "true" : "false"}">
          <i class="${selected ? "fas fa-check-circle" : reference.completed ? "fas fa-flag" : "far fa-circle"}" aria-hidden="true"></i>
          <span class="guide-reference-option-copy">
            <strong>${learning.escapeHtml(referenceLabel(reference))}</strong>
            <small>${learning.escapeHtml(reference.course)} · ${learning.escapeHtml(reference.unit)}</small>
          </span>
          <span class="guide-reference-option-state">${learning.escapeHtml(referenceState(reference))}</span>
        </button>`;
    }).join("") : '<p class="guide-reference-empty">没有匹配的题目。</p>';
  }

  function setReferencePicker(open) {
    const expanded = Boolean(open) && !busy;
    referencePicker.hidden = !expanded;
    referenceToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (expanded) {
      renderReferenceOptions();
      requestAnimationFrame(() => referenceSearch.focus());
    }
  }

  function toggleReference(referenceId) {
    if (selectedReferences.has(referenceId)) {
      selectedReferences.delete(referenceId);
    } else {
      const reference = referenceOptions.find(item => item.id === referenceId);
      if (!reference) return;
      if (selectedReferences.size >= 6) {
        setNotice("每条消息最多引用 6 道题目。", "warning");
        return;
      }
      selectedReferences.set(referenceId, reference);
      setNotice("");
    }
    renderSelectedReferences();
    renderReferenceOptions();
    renderProfile(currentProfile);
  }

  async function load(threadId) {
    const requestSequence = ++loadSequence;
    const suffix = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
    try {
      const response = await learning.request(`/learning/guide${suffix}`);
      if (requestSequence !== loadSequence) return;
      if (!response.success) throw new Error(learning.errorMessage(response, "无法加载 Guide。"));
      currentThreadId = response.thread ? response.thread.id : null;
      referenceOptions = response.referenceOptions || [];
      selectedReferences.clear();
      const threadReferenceIds = response.thread && Array.isArray(response.thread.referenceIds)
        ? response.thread.referenceIds
        : [];
      threadReferenceIds.forEach(referenceId => {
        const reference = referenceOptions.find(item => item.id === referenceId);
        if (reference) selectedReferences.set(reference.id, reference);
      });
      renderThreads(response.threads || []);
      renderMessages(response.thread ? response.thread.messages || [] : []);
      renderSelectedReferences();
      renderProfile(response.profile || {});
      renderPrompts(response.quickPrompts || []);
      renderReferenceOptions();
      const url = currentThreadId ? `/guide?thread=${encodeURIComponent(currentThreadId)}` : "/guide";
      history.replaceState({}, "", url);
      setNotice("");
    } catch (error) {
      if (requestSequence === loadSequence) setNotice(error.message || "无法加载 Guide。", "danger");
    }
  }

  function setBusy(value) {
    busy = value;
    root.setAttribute("aria-busy", value ? "true" : "false");
    question.disabled = value;
    sendButton.disabled = value;
    referenceToggle.disabled = value;
    thinking.hidden = !value;
    if (value) setReferencePicker(false);
    renderSelectedReferences();
    if (value) scrollToBottom();
  }

  function resizeComposer() {
    question.style.height = "auto";
    question.style.height = `${Math.min(question.scrollHeight, 180)}px`;
  }

  async function send(content) {
    content = String(content || question.value).trim();
    if (!content || busy) return;
    const messageReferences = Array.from(selectedReferences.values());
    setNotice("");
    currentMessages.push({
      role: "user",
      content,
      metadata: {references: messageReferences},
    });
    renderMessages(currentMessages);
    question.value = "";
    setReferencePicker(false);
    resizeComposer();
    setBusy(true);
    try {
      const response = await learning.json("POST", "/learning/guide", {
        threadId: currentThreadId,
        question: content,
        references: messageReferences.map(reference => reference.id),
      });
      if (!response.success) throw new Error(learning.errorMessage(response, "Guide 暂时无法回答。"));
      currentThreadId = response.thread.id;
      await load(currentThreadId);
    } catch (error) {
      currentMessages.pop();
      renderSelectedReferences();
      renderMessages(currentMessages);
      setNotice(error.message || "Guide 暂时无法回答。", "danger");
    } finally {
      setBusy(false);
      question.focus();
    }
  }

  document.getElementById("guide-new").addEventListener("click", async function () {
    if (busy) return;
    setBusy(true);
    try {
      const response = await learning.json("POST", "/learning/guide/threads", {});
      if (!response.success || !response.thread) {
        throw new Error(learning.errorMessage(response, "无法新建 Guide 对话。"));
      }
      currentThreadId = response.thread.id;
      currentMessages = [];
      selectedReferences.clear();
      renderSelectedReferences();
      renderProfile(currentProfile);
      await load(currentThreadId);
      sidebar.classList.remove("is-open");
    } catch (error) {
      setNotice(error.message || "无法新建 Guide 对话。", "danger");
    } finally {
      setBusy(false);
      question.focus();
    }
  });

  threadList.addEventListener("click", async function (event) {
    const row = event.target.closest(".guide-thread");
    if (!row) return;
    if (event.target.closest(".guide-thread-delete")) {
      const confirmed = window.AISecEduUI && await window.AISecEduUI.confirm(
        "这段对话及其中的题目引用记录会被删除，此操作无法撤销。",
        {
          title: "删除 Guide 对话",
          confirmLabel: "删除对话",
          confirmStyle: "danger",
          kind: "danger",
        }
      );
      if (!confirmed) return;
      try {
        await learning.json("DELETE", `/learning/guide/threads/${encodeURIComponent(row.dataset.threadId)}`, {});
        if (currentThreadId === row.dataset.threadId) currentThreadId = null;
        await load(currentThreadId);
      } catch (error) {
        setNotice(error.message || "无法删除对话。", "danger");
      }
      return;
    }
    currentThreadId = row.dataset.threadId;
    sidebar.classList.remove("is-open");
    await load(currentThreadId);
  });

  promptList.addEventListener("click", function (event) {
    const button = event.target.closest(".guide-quick-prompt");
    if (button) send(button.textContent);
  });
  sendButton.addEventListener("click", () => send());
  referenceToggle.addEventListener("click", function () {
    setReferencePicker(referencePicker.hidden);
  });
  referenceSearch.addEventListener("input", renderReferenceOptions);
  referenceOptionsRoot.addEventListener("click", function (event) {
    const option = event.target.closest("[data-reference-id]");
    if (option) toggleReference(option.dataset.referenceId);
  });
  selectedReferencesRoot.addEventListener("click", function (event) {
    const remove = event.target.closest("[data-remove-reference]");
    if (remove) toggleReference(remove.dataset.removeReference);
  });
  question.addEventListener("input", function (event) {
    resizeComposer();
    if (event.inputType === "insertText" && event.data === "@") {
      const cursor = question.selectionStart;
      question.setRangeText("", Math.max(0, cursor - 1), cursor, "end");
      setReferencePicker(true);
    }
  });
  question.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  document.getElementById("guide-sidebar-toggle").addEventListener("click", function () {
    sidebar.classList.toggle("is-open");
  });
  document.addEventListener("click", function (event) {
    if (!event.target.closest(".guide-composer")) setReferencePicker(false);
  });
  referencePicker.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      setReferencePicker(false);
      question.focus();
    }
  });

  resizeComposer();
  renderSelectedReferences();
  load(currentThreadId).finally(() => question.focus());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once: true});
  } else {
    boot();
  }
})();

document.addEventListener("DOMContentLoaded", function () {
  const learning = window.DojoLearning;
  if (!learning) return;

  document.querySelectorAll("[data-learning-tutor]").forEach(function (panel) {
    const toggle = panel.querySelector(".learning-tutor-toggle");
    const toggleIcon = panel.querySelector("[data-tutor-toggle-icon]");
    const context = panel.querySelector("[data-tutor-context]");
    const status = panel.querySelector("[data-tutor-status]");
    const messages = panel.querySelector("[data-tutor-messages]");
    const thinking = panel.querySelector("[data-tutor-thinking]");
    const question = panel.querySelector("[data-tutor-question]");
    const sendButton = panel.querySelector("[data-tutor-send]");
    const promptButtons = Array.from(panel.querySelectorAll("[data-tutor-prompt]"));
    let attempt = null;

    function setStatus(state, label, detail) {
      const icon = status.querySelector("i");
      const text = status.querySelector("span");
      const icons = {
        checking: "fas fa-circle-notch fa-spin",
        ready: "fas fa-check-circle",
        warning: "fas fa-exclamation-circle",
        unavailable: "fas fa-minus-circle",
      };
      status.classList.remove("is-checking", "is-ready", "is-warning", "is-unavailable");
      status.classList.add(`is-${state}`);
      status.title = detail || label;
      icon.className = icons[state] || icons.unavailable;
      text.textContent = label;
    }

    function renderMessages(items) {
      messages.innerHTML = items.length ? items.map(message => `
        <div class="learning-tutor-message ${message.role === "user" ? "is-user" : "is-tutor"}">
          <div>${learning.escapeHtml(message.content).replace(/\n/g, "<br>")}</div>
          <small>${message.role === "user" ? "学习者" : `Tutor${message.metadata && message.metadata.model ? ` · ${learning.escapeHtml(message.metadata.model)}` : ""}`}</small>
        </div>`).join("") : '<div class="text-muted">说说下一步想检查或推理什么。Tutor 只会使用当前题目和已脱敏证据。</div>';
      messages.scrollTop = messages.scrollHeight;
    }

    function setAvailable(available) {
      sendButton.disabled = !available;
      question.disabled = !available;
      promptButtons.forEach(button => {
        button.disabled = !available;
      });
    }

    async function loadAttempt() {
      setStatus("checking", "正在检查 Tutor");
      try {
        const response = await learning.request("/learning/attempts/current");
        attempt = response.attempt || null;
        if (!attempt) {
          context.textContent = "先启动一个题目以创建与证据绑定的练习记录。";
          setAvailable(false);
          renderMessages([]);
          setStatus("unavailable", "Tutor 未就绪", "当前没有正在运行的题目会话。");
          return;
        }
        context.textContent = `${attempt.challengeName} · ${attempt.moduleName} · 第 ${attempt.epoch} 次会话`;
        setAvailable(true);
        renderMessages(attempt.tutorMessages || []);
        const invalid = attempt.evidenceChain && attempt.evidenceChain.valid === false;
        setStatus(
          invalid ? "warning" : "ready",
          invalid ? "Tutor 已就绪 · 证据待复核" : "Tutor 已就绪",
          invalid
            ? "Tutor 可以使用，但当前证据链需要复核。"
            : "Tutor 可使用当前题目、练习会话和已脱敏的实时工作区证据。"
        );
      } catch (error) {
        attempt = null;
        setAvailable(false);
        renderMessages([]);
        setStatus("unavailable", "Tutor 暂不可用", error.message || "无法加载当前练习记录。");
      }
    }

    async function send() {
      const content = question.value.trim();
      if (!attempt || !content) return;
      const existing = attempt.tutorMessages || [];
      renderMessages([...existing, {role: "user", content, metadata: {}}]);
      setAvailable(false);
      setStatus("checking", "Tutor 正在思考");
      thinking.hidden = false;
      try {
        const response = await learning.json("POST", "/learning/tutor", {
          question: content,
        });
        if (!response.success) throw new Error(learning.errorMessage(response, "Tutor 暂时不可用。"));
        question.value = "";
        await loadAttempt();
      } catch (error) {
        setStatus("warning", "Tutor 请求失败，可重试", error.message || "Tutor 暂时不可用。");
      } finally {
        thinking.hidden = true;
        setAvailable(Boolean(attempt));
      }
    }

    function setExpanded(expanded) {
      panel.classList.toggle("is-collapsed", !expanded);
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      toggle.setAttribute("title", expanded ? "收起 Tutor" : "打开 Tutor");
      toggle.setAttribute("aria-label", expanded ? "收起 Tutor" : "打开 Tutor");
      toggleIcon.className = expanded ? "fas fa-chevron-right" : "fas fa-user-ninja";
      if (expanded) loadAttempt();
    }

    toggle.addEventListener("click", function () {
      setExpanded(panel.classList.contains("is-collapsed"));
    });
    sendButton.addEventListener("click", send);
    promptButtons.forEach(button => {
      button.addEventListener("click", function () {
        question.value = button.dataset.tutorPrompt || "";
        question.focus();
      });
    });
    question.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    window.addEventListener("dojo:attempt-changed", function () {
      if (!panel.classList.contains("is-collapsed") && panel.offsetParent !== null) {
        loadAttempt();
      }
    });
    window.addEventListener("dojo:workspace-stopped", function () {
      setExpanded(false);
    });
    setAvailable(false);
    renderMessages([]);
    setStatus("checking", "正在检查 Tutor");
  });
});

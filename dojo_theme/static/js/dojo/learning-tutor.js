document.addEventListener("DOMContentLoaded", function () {
  const learning = window.DojoLearning;
  if (!learning) return;

  document.querySelectorAll("[data-learning-tutor]").forEach(function (panel) {
    const toggle = panel.querySelector(".learning-tutor-toggle");
    const toggleIcon = panel.querySelector("[data-tutor-toggle-icon]");
    const status = panel.querySelector("[data-tutor-status]");
    const messages = panel.querySelector("[data-tutor-messages]");
    const thinking = panel.querySelector("[data-tutor-thinking]");
    const question = panel.querySelector("[data-tutor-question]");
    const sendButton = panel.querySelector("[data-tutor-send]");
    const fullLink = panel.querySelector("[data-tutor-full-link]");
    const imageOptions = panel.querySelector("[data-tutor-image-options]");
    const imageSelect = panel.querySelector("[data-tutor-illustration]");
    const imageConfirmation = panel.querySelector("[data-tutor-image-confirmation]");
    const consent = panel.querySelector("[data-tutor-image-consent]");
    const imageNotice = panel.querySelector("[data-tutor-image-notice]");
    let attempt = null;
    let illustrations = [];
    let contextVersion = 0;
    let sending = false;

    function setImageNotice(text) {
      imageNotice.textContent = text;
      imageNotice.hidden = !text;
    }

    function syncImageOptions() {
      imageOptions.hidden = !illustrations.length;
      imageSelect.disabled = !attempt || sending || !illustrations.length;
      imageConfirmation.hidden = !imageSelect.value;
      consent.disabled = imageSelect.disabled || !imageSelect.value;
    }

    function resetSelection() {
      imageSelect.value = "";
      consent.checked = false;
      syncImageOptions();
    }

    function showIllustrations(items) {
      illustrations = (Array.isArray(items) ? items : []).filter(item =>
        item && typeof item.classroomId === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(item.classroomId) &&
        Number.isSafeInteger(item.revision) && item.revision > 0 &&
        typeof item.pageId === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(item.pageId) &&
        typeof item.label === "string" && item.label.trim(),
      );
      imageSelect.length = 1;
      illustrations.forEach((item, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = item.label;
        imageSelect.append(option);
      });
      resetSelection();
    }

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
      status.hidden = state === "ready";
      icon.className = icons[state] || icons.unavailable;
      text.textContent = label;
    }

    function renderMessages(items) {
      messages.innerHTML = items.length ? items.map(message => `
        <div class="learning-tutor-message ${message.role === "user" ? "is-user" : "is-tutor"}">
          <div>${learning.escapeHtml(message.content).replace(/\n/g, "<br>")}</div>
          <small>${message.role === "user" ? "学习者" : "AI 学习助手"}</small>
        </div>`).join("") : "";
      messages.scrollTop = messages.scrollHeight;
    }

    function syncAvailability() {
      const available = Boolean(attempt) && !sending;
      sendButton.disabled = !available;
      question.disabled = !available;
      syncImageOptions();
    }

    function invalidateContext(clearQuestion) {
      contextVersion += 1;
      attempt = null;
      if (clearQuestion) question.value = "";
      if (fullLink) fullLink.href = "/guide";
      showIllustrations([]);
      setImageNotice("");
      syncAvailability();
      return contextVersion;
    }

    async function loadContext(clearQuestion = false, notice = "") {
      const version = invalidateContext(clearQuestion);
      renderMessages([]);
      setStatus("checking", "正在检查 AI 学习助手");
      try {
        const response = await learning.request("/learning/tutor/context", {timeoutMs: 60000, cache: "no-store"});
        if (contextVersion !== version) return;
        if (!response.success) throw new Error(learning.errorMessage(response, "无法加载当前练习记录。"));
        attempt = response.attempt && typeof response.attempt.id === "string" ? response.attempt : null;
        setImageNotice(notice);
        if (!attempt) {
          setStatus("unavailable", "AI 学习助手未就绪", "当前没有正在运行的题目会话。");
          return;
        }
        if (fullLink && attempt.dojoId && attempt.moduleId && attempt.challengeId) {
          const query = new URLSearchParams({
            course: attempt.dojoId,
            module: attempt.moduleId,
            challenge: attempt.challengeId,
          });
          fullLink.href = `/guide?${query.toString()}`;
        }
        showIllustrations(response.illustrations);
        renderMessages(attempt.tutorMessages || []);
        setStatus("ready", "AI 学习助手已就绪", "AI 学习助手可参考本题的教学资料和已有学习记录。");
      } catch (error) {
        if (contextVersion !== version) return;
        setStatus("unavailable", "AI 学习助手暂不可用", error.message || "无法加载当前练习记录。");
        setImageNotice(notice);
      } finally {
        if (contextVersion === version) syncAvailability();
      }
    }

    async function send() {
      const content = question.value.trim();
      if (!attempt || !content || sending) return;
      const selected = imageSelect.value === "" ? null : illustrations[Number(imageSelect.value)];
      if (selected && !consent.checked) {
        setImageNotice("请确认发送所选插图，或选择仅发送文字。");
        consent.focus();
        return;
      }
      const body = {question: content, attemptId: attempt.id};
      if (selected) {
        const {classroomId, revision, pageId} = selected;
        body.teachingImage = {classroomId, revision, pageId, consent: true};
      }
      const version = contextVersion;
      const existing = attempt.tutorMessages || [];
      sending = true;
      resetSelection();
      setImageNotice("");
      renderMessages([...existing, {role: "user", content}]);
      syncAvailability();
      setStatus("checking", "AI 学习助手正在思考");
      thinking.hidden = false;
      try {
        const response = await learning.json("POST", "/learning/tutor", body, {timeoutMs: 240000, retries: 0});
        if (contextVersion !== version) return;
        if (!response.success) throw new Error(learning.errorMessage(response, "AI 学习助手暂时不可用。"));
        const image = response.reply?.teachingImage;
        const notice = selected && image?.sent !== true
          ? (typeof image?.note === "string" && image.note) || "本轮答复未使用所选插图。"
          : "";
        question.value = "";
        await loadContext(false, notice);
      } catch (error) {
        if (contextVersion !== version) return;
        renderMessages(existing);
        setStatus("warning", "AI 学习助手请求失败，可重试", error.message || "AI 学习助手暂时不可用。");
        if (selected) setImageNotice("本轮未保留所选插图。再发送图片时，请重新选择并确认。");
      } finally {
        sending = false;
        thinking.hidden = true;
        syncAvailability();
      }
    }

    function setExpanded(expanded) {
      panel.classList.toggle("is-collapsed", !expanded);
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      toggle.setAttribute("title", expanded ? "收起 AI 学习助手" : "打开 AI 学习助手");
      toggle.setAttribute("aria-label", expanded ? "收起 AI 学习助手" : "打开 AI 学习助手");
      toggleIcon.className = expanded ? "fas fa-chevron-right" : "fas fa-user-ninja";
      if (expanded) loadContext();
      else invalidateContext(true);
    }

    toggle.addEventListener("click", function () {
      setExpanded(panel.classList.contains("is-collapsed"));
    });
    imageSelect.addEventListener("change", function () {
      consent.checked = false;
      setImageNotice("");
      syncImageOptions();
    });
    consent.addEventListener("change", function () {
      if (consent.checked) setImageNotice("");
    });
    sendButton.addEventListener("click", send);
    question.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    function refreshOpenContext() {
      if (!panel.classList.contains("is-collapsed") && panel.offsetParent !== null) {
        loadContext(true);
      } else {
        invalidateContext(true);
      }
    }
    window.addEventListener("dojo:attempt-changed", refreshOpenContext);
    window.addEventListener("pagehide", function () {
      invalidateContext(true);
    });
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) refreshOpenContext();
    });
    window.addEventListener("dojo:workspace-stopped", function () {
      setExpanded(false);
    });
    syncAvailability();
    renderMessages([]);
    setStatus("checking", "正在检查 AI 学习助手");
  });
});

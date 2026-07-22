document.addEventListener("DOMContentLoaded", function () {
  const learning = window.DojoLearning;
  if (!learning) return;

  document.querySelectorAll("[data-learning-tutor]").forEach(function (panel) {
    const toggle = panel.querySelector(".learning-tutor-toggle");
    const context = panel.querySelector("[data-tutor-context]");
    const notice = panel.querySelector("[data-tutor-notice]");
    const messages = panel.querySelector("[data-tutor-messages]");
    const question = panel.querySelector("[data-tutor-question]");
    const sendButton = panel.querySelector("[data-tutor-send]");
    let attempt = null;

    function renderMessages(items) {
      messages.innerHTML = items.length ? items.map(message => `
        <div class="learning-tutor-message ${message.role === "user" ? "is-user" : "is-tutor"}">
          <div>${learning.escapeHtml(message.content).replace(/\n/g, "<br>")}</div>
          <small>${message.role === "user" ? "Learner" : "Tutor"}</small>
        </div>`).join("") : '<div class="text-muted">Ask what to examine or think about next. The Tutor uses only the current exercise and redacted evidence.</div>';
      messages.scrollTop = messages.scrollHeight;
    }

    function setAvailable(available) {
      sendButton.disabled = !available;
      question.disabled = !available;
    }

    async function loadAttempt() {
      try {
        const response = await learning.request("/learning/attempts/current");
        attempt = response.attempt || null;
        if (!attempt) {
          context.textContent = "Start an exercise to create an evidence-bound attempt.";
          setAvailable(false);
          renderMessages([]);
          return;
        }
        context.textContent = `${attempt.challengeName} · ${attempt.moduleName} · Session ${attempt.epoch}`;
        setAvailable(true);
        renderMessages(attempt.tutorMessages || []);
        const invalid = attempt.evidenceChain && attempt.evidenceChain.valid === false;
        learning.showNotice(
          notice,
          invalid ? "The current evidence chain requires review." : "Only redacted evidence from this exercise session is used.",
          invalid ? "warning" : "info"
        );
      } catch (error) {
        attempt = null;
        setAvailable(false);
        learning.showNotice(notice, error.message || "The current attempt could not be loaded.", "danger");
      }
    }

    async function send() {
      const content = question.value.trim();
      if (!attempt || !content) return;
      setAvailable(false);
      try {
        const response = await learning.json("POST", "/learning/tutor", {
          question: content,
        });
        if (!response.success) throw new Error(learning.errorMessage(response, "The Tutor is temporarily unavailable."));
        question.value = "";
        await loadAttempt();
      } catch (error) {
        learning.showNotice(notice, error.message || "The Tutor is temporarily unavailable.", "danger");
      } finally {
        setAvailable(Boolean(attempt));
      }
    }

    function setExpanded(expanded) {
      panel.classList.toggle("is-collapsed", !expanded);
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      toggle.setAttribute("title", expanded ? "Close Learning Tutor" : "Open Learning Tutor");
      if (expanded) loadAttempt();
    }

    toggle.addEventListener("click", function () {
      setExpanded(panel.classList.contains("is-collapsed"));
    });
    sendButton.addEventListener("click", send);
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
    setAvailable(false);
    renderMessages([]);
  });
});

(function () {
  "use strict";

  const toggle = document.getElementById("unit-outline-toggle");
  const outline = document.getElementById("unit-outline");
  const content = document.getElementById("module-content");
  if (!outline || !content) return;

  function setOutline(open, restoreFocus) {
    outline.classList.toggle("is-open", open);
    document.body.classList.toggle("unit-outline-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    if (restoreFocus && toggle) toggle.focus();
  }

  function itemForLink(link) {
    if (link.dataset.challengeOutline) {
      const heading = content.querySelector(`[data-challenge-id="${CSS.escape(link.dataset.challengeOutline)}"]`);
      if (heading) return heading.closest(".accordion-item");
    }
    const hash = String(link.getAttribute("href") || "").split("#")[1];
    return hash ? document.getElementById(hash) : null;
  }

  function activate(link, moveFocus) {
    const item = itemForLink(link);
    if (!item) return;
    outline.querySelectorAll(".unit-outline-item").forEach(row => row.classList.toggle("is-current", row === link));
    const button = item.querySelector(".challenge-button-2");
    if (button && button.getAttribute("aria-expanded") !== "true" && !button.classList.contains("disabled")) button.click();
    window.setTimeout(() => {
      item.scrollIntoView({behavior: "smooth", block: "start"});
      if (moveFocus) {
        item.setAttribute("tabindex", "-1");
        item.focus({preventScroll: true});
      }
    }, button ? 260 : 0);
    setOutline(false, false);
  }

  outline.querySelectorAll(".unit-outline-item").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      activate(link, true);
    });
  });

  if (toggle) toggle.addEventListener("click", () => setOutline(!outline.classList.contains("is-open"), false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && outline.classList.contains("is-open")) setOutline(false, true);
  });
  document.addEventListener("click", event => {
    if (window.innerWidth > 760 || !outline.classList.contains("is-open")) return;
    if (!outline.contains(event.target) && event.target !== toggle) setOutline(false, false);
  });

  document.querySelectorAll("[data-learning-transition]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = link.href;
      const api = window.DojoLearning;
      if (!api) return;
      event.preventDefault();
      Promise.race([
        api.json("POST", "/learning/telemetry", {
          event: "learning_context_transition",
          properties: {
            fromType: "module",
            toType: link.dataset.learningTransition || "course_item",
            preserved: true,
          },
        }).catch(function () {}),
        new Promise(resolve => window.setTimeout(resolve, 180)),
      ]).finally(() => window.location.assign(destination));
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const link = Array.from(outline.querySelectorAll(".unit-outline-item")).find(row => itemForLink(row) === visible.target);
      if (link) outline.querySelectorAll(".unit-outline-item").forEach(row => row.classList.toggle("is-current", row === link));
    }, {rootMargin: "-25% 0px -55%", threshold: [0.1, 0.5]});
    content.querySelectorAll(".accordion-item, .unit-inline-resource").forEach(item => observer.observe(item));
  }
})();

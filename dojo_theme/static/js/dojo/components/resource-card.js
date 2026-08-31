(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};

  function enhance(card) {
    if (!card) return;
    card.classList.add("ae-resource-card");
    const title = card.querySelector("[data-resource-title]");
    const action = card.querySelector("[data-resource-primary]");
    if (title && !title.id) title.id = `ae-resource-${Math.random().toString(36).slice(2)}`;
    if (title) card.setAttribute("aria-labelledby", title.id);
    if (action && title && !action.getAttribute("aria-label")) {
      action.setAttribute("aria-label", `${action.textContent.trim()}：${title.textContent.trim()}`);
    }
    [["availability", "availability"], ["workflow", "workflow"]].forEach(([field, domain]) => {
      const badge = card.querySelector(`[data-resource-${field}]`);
      if (badge && root.statusBadge) {
        root.statusBadge.apply(badge, domain, badge.dataset.resourceAvailability || badge.dataset.resourceWorkflow);
      }
    });
    return card;
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll("[data-resource-card]").forEach(enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll(document), {once: true});
  } else {
    enhanceAll(document);
  }
  document.addEventListener("aisecedu:status-ready", () => enhanceAll(document));
  root.resourceCard = {enhance, enhanceAll};
})();

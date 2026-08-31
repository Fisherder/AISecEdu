(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const terminal = new Set(["completed", "failed", "canceled"]);

  function summarize(list) {
    if (!list) return {};
    const items = Array.from(list.querySelectorAll("[data-task-state]"));
    const counts = items.reduce((result, item) => {
      const state = String(item.dataset.taskState || "unknown").toLowerCase();
      result[state] = (result[state] || 0) + 1;
      return result;
    }, {});
    const summary = list.querySelector("[data-task-list-summary]")
      || list.parentElement?.querySelector(":scope > [data-task-list-summary]");
    if (summary) {
      const active = items.filter(item => !terminal.has(String(item.dataset.taskState || ""))).length;
      summary.textContent = active
        ? `${active} 项进行中 · ${counts.failed || 0} 项失败`
        : `${counts.completed || 0} 项已完成 · ${counts.failed || 0} 项失败`;
    }
    return counts;
  }

  function setState(item, state, label) {
    if (!item) return;
    const normalized = String(state || "unknown").toLowerCase();
    item.dataset.taskState = normalized;
    const badge = item.querySelector("[data-status-domain='workflow']");
    if (badge && root.statusBadge) root.statusBadge.apply(badge, "workflow", normalized, label);
    summarize(item.closest("[data-task-list]"));
  }

  function enhance(list) {
    if (!list) return;
    if (!list.hasAttribute("role")) list.setAttribute("role", "list");
    list.querySelectorAll("[data-task-state]").forEach(item => {
      if (!item.hasAttribute("role")) item.setAttribute("role", "listitem");
    });
    summarize(list);
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll("[data-task-list]").forEach(enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll(document), {once: true});
  } else {
    enhanceAll(document);
  }
  root.taskList = {enhance, enhanceAll, setState, summarize};
})();

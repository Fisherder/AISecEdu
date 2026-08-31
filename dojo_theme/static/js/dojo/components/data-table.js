(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const registry = new WeakSet();

  function enhance(table) {
    if (!table || registry.has(table)) return table;
    registry.add(table);
    table.classList.add("ae-data-table");
    const headers = Array.from(table.querySelectorAll("thead th"));
    table.querySelectorAll("tbody tr").forEach(row => {
      Array.from(row.cells || []).forEach((cell, index) => {
        if (!cell.dataset.label) {
          cell.dataset.label = headers[index]?.textContent?.trim() || `第 ${index + 1} 列`;
        }
      });
    });
    headers.forEach(header => {
      const key = header.dataset.sortKey;
      if (!key || header.querySelector("button")) return;
      const label = header.textContent.trim();
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ae-data-table-sort";
      button.textContent = label;
      button.setAttribute("aria-label", `按${label}排序`);
      button.addEventListener("click", () => {
        const current = header.getAttribute("aria-sort");
        const direction = current === "ascending" ? "descending" : "ascending";
        headers.forEach(item => item.removeAttribute("aria-sort"));
        header.setAttribute("aria-sort", direction);
        table.dispatchEvent(new CustomEvent("aisecedu:table-sort", {
          bubbles: true,
          detail: {key, direction},
        }));
      });
      header.replaceChildren(button);
    });
    return table;
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll("[data-data-table]").forEach(enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll(document), {once: true});
  } else {
    enhanceAll(document);
  }
  root.dataTable = {enhance, enhanceAll};
})();

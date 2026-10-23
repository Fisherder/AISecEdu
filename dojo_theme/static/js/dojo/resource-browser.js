(function () {
  "use strict";
  const paths = {
    "slide-deck": "M3 3h18v14H3z M7 21l5-4 5 4 M7 7h10 M7 11h6",
    practice: "m4 5 6 6-6 6 M12 18h8",
    challenge: "M5 21V3 M5 3h14l-3 5 3 5H5",
    assignment: "M6 3h12v18H6z M9 7h6 M9 11h6 m-6 5 2 2 4-4",
    quiz: "M6 3h12v18H6z M9 7h6 M9 11h6 m-6 5 2 2 4-4",
    simulation: "M4 4h5v5H4z M15 15h5v5h-5z M15 4h5v5h-5z M9 6h6 M6 9v9h9",
    "attack-defense-scene": "M3 5h18v14H3z m7 3 5 4-5 4z",
    debate: "M3 3h18v13H9l-6 5z M7 7h10 M7 11h6",
    "file-package": "M3 7h7l2 3h9l-3 10H3z M3 7V4h6l3 3h7v3"
  };
  window.AISecEduResource = {
    icon(type) { return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (paths[type] || paths["slide-deck"]) + '"/></svg>'; }
  };
  document.querySelectorAll("[data-resource-browser]").forEach(root => {
    const key = "aisecedu-resource-view-" + (window.init?.userId || "guest") + "-" + root.dataset.resourceBrowser;
    let layout = "grid";
    try { if (localStorage.getItem(key) === "list") layout = "list"; } catch (error) {}
    function apply(view) {
      layout = view;
      root.dataset.resourceLayout = view;
      root.querySelectorAll("[data-resource-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.resourceView === view)));
    }
    root.querySelectorAll("[data-resource-view]").forEach(button => button.addEventListener("click", () => {
      apply(button.dataset.resourceView);
      try { localStorage.setItem(key, layout); } catch (error) {}
    }));
    apply(layout);
  });
})();

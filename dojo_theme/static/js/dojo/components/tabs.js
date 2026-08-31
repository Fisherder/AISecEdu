(function () {
  "use strict";

  function activate(tab, focus) {
    const list = tab.closest("[role='tablist']");
    if (!list) return;
    list.querySelectorAll("[role='tab']").forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute("aria-controls") || "");
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
    tab.dispatchEvent(new CustomEvent("aisecedu:tab-activated", {bubbles: true}));
  }

  document.addEventListener("click", event => {
    const tab = event.target.closest("[role='tab']");
    if (tab) activate(tab, false);
  });

  document.addEventListener("keydown", event => {
    const tab = event.target.closest("[role='tab']");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(tab.closest("[role='tablist']").querySelectorAll("[role='tab']:not([disabled])"));
    let index = tabs.indexOf(tab);
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = tabs.length - 1;
    if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    event.preventDefault();
    activate(tabs[index], true);
  });

  window.AISecEdu = window.AISecEdu || {};
  window.AISecEdu.tabs = {activate};
})();

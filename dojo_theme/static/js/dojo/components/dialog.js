(function () {
  "use strict";

  const selectors = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
  const registry = new WeakMap();

  function focusable(panel) {
    return Array.from(panel.querySelectorAll(selectors)).filter(node => !node.hidden && node.offsetParent !== null);
  }

  function outsideBranches(dialog) {
    const branches = [];
    let current = dialog;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;
      Array.from(parent.children).forEach(node => {
        if (node !== current && !node.inert) branches.push(node);
      });
      current = parent;
    }
    return branches;
  }

  function open(dialog, trigger) {
    if (!dialog) return;
    const panel = dialog.querySelector("[role='dialog']") || dialog;
    const inerted = outsideBranches(dialog);
    inerted.forEach(node => { node.inert = true; });
    registry.set(dialog, {trigger: trigger || document.activeElement, inerted});
    dialog.hidden = false;
    dialog.classList.add("show");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-product-dialog");
    const targets = focusable(panel);
    (targets[0] || panel).focus();
    dialog.dispatchEvent(new CustomEvent("aisecedu:dialog-open", {bubbles: true}));
  }

  function close(dialog) {
    if (!dialog) return;
    const state = registry.get(dialog);
    dialog.classList.remove("show");
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-product-dialog");
    (state?.inerted || []).forEach(node => { node.inert = false; });
    if (state?.trigger?.isConnected) state.trigger.focus();
    dialog.dispatchEvent(new CustomEvent("aisecedu:dialog-close", {bubbles: true}));
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const opener = target?.closest("[data-dialog-open]");
    if (opener) {
      event.preventDefault();
      open(document.getElementById(opener.dataset.dialogOpen), opener);
      return;
    }
    const closer = target?.closest("[data-dialog-close]");
    if (closer) close(closer.closest(".ae-dialog,[role='dialog']")?.closest(".ae-dialog") || closer.closest(".ae-dialog"));
  });

  document.addEventListener("keydown", event => {
    const target = event.target instanceof Element ? event.target : document.activeElement;
    const dialog = target?.closest?.(".ae-dialog:not([hidden])");
    if (!dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(dialog);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = dialog.querySelector("[role='dialog']") || dialog;
    const targets = focusable(panel);
    if (!targets.length) return;
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.AISecEdu = window.AISecEdu || {};
  window.AISecEdu.dialog = {open, close};
})();

(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};

  function text(value, fallback) {
    const normalized = String(value == null ? "" : value).trim();
    return normalized || fallback || "";
  }

  function safeHref(value) {
    const fallback = null;
    if (!value) return fallback;
    if (root.urlState && typeof root.urlState.safeReturnTo === "function") {
      return root.urlState.safeReturnTo(value, fallback);
    }
    try {
      const parsed = new URL(String(value), window.location.origin);
      if (parsed.origin !== window.location.origin) return fallback;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (error) {
      return fallback;
    }
  }

  function create(options) {
    const config = options || {};
    const panel = document.createElement("section");
    panel.className = "ae-recovery-panel";
    panel.dataset.recoveryPanel = "";
    panel.setAttribute("role", config.urgent ? "alert" : "status");
    panel.setAttribute("aria-live", config.urgent ? "assertive" : "polite");

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = text(config.title, "当前操作没有完成");
    copy.appendChild(title);

    const message = document.createElement("p");
    message.textContent = text(config.message, "请稍后重试，已有内容会继续保留。");
    copy.appendChild(message);

    if (config.requestId) {
      const request = document.createElement("small");
      request.textContent = `请求编号：${text(config.requestId)}`;
      copy.appendChild(request);
    }
    panel.appendChild(copy);

    const action = config.action || config.recovery || null;
    if (action) {
      const href = safeHref(action.href);
      const control = href ? document.createElement("a") : document.createElement("button");
      control.className = "ae-recovery-action";
      control.textContent = text(action.label, config.retryable ? "重新尝试" : "继续");
      if (href) {
        control.href = href;
      } else {
        control.type = "button";
        control.addEventListener("click", event => {
          if (typeof action.onSelect === "function") action.onSelect(event);
          panel.dispatchEvent(new CustomEvent("aisecedu:recovery", {
            bubbles: true,
            detail: {code: config.code || null, requestId: config.requestId || null},
          }));
        });
      }
      panel.appendChild(control);
    }
    return panel;
  }

  function render(target, options) {
    if (!target) return null;
    const panel = create(options);
    target.replaceChildren(panel);
    return panel;
  }

  root.recoveryPanel = {create, render};
})();

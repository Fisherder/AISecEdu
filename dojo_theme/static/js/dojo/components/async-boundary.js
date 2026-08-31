(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const states = new Set(["initial", "loading", "ready", "empty", "degraded", "error", "stale", "forbidden"]);
  const copy = {
    initial: ["正在准备内容", "请稍候。"],
    loading: ["正在加载", "内容准备好后会自动显示。"],
    empty: ["暂无内容", "这里还没有可显示的内容。"],
    degraded: ["部分内容暂不可用", "已保留可用内容，可以稍后重新尝试。"],
    error: ["内容加载失败", "请检查网络后重新尝试。"],
    stale: ["当前显示的是较早数据", "新数据暂时无法获取，可以继续查看或重新加载。"],
    forbidden: ["当前账号无权访问", "如需使用此功能，请联系课程负责人或管理员。"],
  };

  function normalizedState(value) {
    const candidate = String(value || "initial").trim().toLowerCase();
    if (states.has(candidate)) return candidate;
    const detail = {domain: "view", state: candidate || null};
    if (!root.telemetry) {
      root.telemetryQueue = root.telemetryQueue || [];
      root.telemetryQueue.push({name: "unknown_state", details: {
        action: "view", toState: candidate || "unknown", result: "safe_fallback",
      }});
    }
    document.dispatchEvent(new CustomEvent("aisecedu:unknown-state", {detail}));
    return "error";
  }

  class AsyncBoundary {
    constructor(element) {
      if (!element) throw new TypeError("AsyncBoundary 需要一个有效容器。");
      this.element = element;
      this.content = element.querySelector("[data-async-content]");
      if (!this.content) {
        this.content = document.createElement("div");
        this.content.dataset.asyncContent = "";
        while (element.firstChild) this.content.appendChild(element.firstChild);
        element.appendChild(this.content);
      }
      this.statePanel = document.createElement("div");
      this.statePanel.className = "ae-async-state";
      this.statePanel.dataset.asyncStatePanel = "";
      this.statePanel.hidden = true;
      element.appendChild(this.statePanel);
      element.classList.add("ae-async-boundary");
      this.set(element.dataset.asyncState || "initial", {silent: true});
    }

    set(value, details) {
      const config = details || {};
      const state = normalizedState(value);
      const preserve = state === "degraded" || state === "stale";
      this.element.dataset.asyncState = state;
      this.element.setAttribute("aria-busy", String(state === "initial" || state === "loading"));
      this.content.hidden = state !== "ready" && !preserve;
      this.statePanel.hidden = state === "ready";
      if (state === "ready") {
        this.statePanel.replaceChildren();
        return state;
      }

      const defaultCopy = copy[state] || copy.error;
      const panelOptions = {
        title: config.title || defaultCopy[0],
        message: config.message || defaultCopy[1],
        requestId: config.requestId || null,
        retryable: Boolean(config.retryable),
        urgent: state === "error" || state === "forbidden",
        code: config.code || null,
      };
      if (config.action || config.recovery) {
        panelOptions.action = config.action || config.recovery;
      } else if (config.retryable || typeof config.retry === "function") {
        panelOptions.action = {
          label: config.retryLabel || "重新加载",
          onSelect: config.retry || (() => {
            this.element.dispatchEvent(new CustomEvent("aisecedu:retry", {bubbles: true}));
          }),
        };
      }

      if (root.recoveryPanel) {
        root.recoveryPanel.render(this.statePanel, panelOptions);
      } else {
        const message = document.createElement("p");
        message.textContent = `${panelOptions.title}。${panelOptions.message}`;
        this.statePanel.replaceChildren(message);
      }
      if (!config.silent) {
        this.element.dispatchEvent(new CustomEvent("aisecedu:async-state", {
          bubbles: true,
          detail: {state, requestId: panelOptions.requestId},
        }));
      }
      return state;
    }

    ready() { return this.set("ready"); }
    loading(details) { return this.set("loading", details); }
    fail(error, retry) {
      return this.set(error?.status === 403 ? "forbidden" : "error", {
        title: error?.status === 403 ? "当前账号无权访问" : null,
        message: error?.message,
        requestId: error?.requestId,
        code: error?.code,
        retryable: Boolean(error?.retryable),
        recovery: error?.recovery,
        retry,
      });
    }
  }

  const registry = new WeakMap();
  function forElement(element) {
    if (!element) return null;
    if (!registry.has(element)) registry.set(element, new AsyncBoundary(element));
    return registry.get(element);
  }

  function enhance(scope) {
    (scope || document).querySelectorAll("[data-async-boundary]").forEach(forElement);
  }

  document.addEventListener("DOMContentLoaded", () => enhance(document));
  root.AsyncBoundary = AsyncBoundary;
  root.asyncBoundary = {states: Array.from(states), forElement, enhance};
})();

(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const runtimeStates = new Set(["none", "provisioning", "running", "stopping", "stopped", "expired", "failed"]);
  const actions = {
    none: ["启动环境", "当前没有运行环境，从题目启动后即可实践。"],
    provisioning: ["启动中", "环境正在准备，可以离开此页，进度会继续保存。"],
    running: ["继续环境", "环境正在运行，可以继续当前练习。"],
    stopping: ["停止中", "停止请求已接收，请稍候。"],
    stopped: ["重启环境并继续", "环境已停止；已保存的尝试仍可继续。"],
    expired: ["重新启动环境", "环境已过期；重新启动不会删除学习记录。"],
    failed: ["重试启动", "环境启动失败；尝试与已保存内容仍被保留。"],
  };

  function render(element, next) {
    if (!element) return null;
    const source = next || element.dataset;
    const rawRuntime = String(source.runtime || source.workspaceRuntime || "none").toLowerCase();
    const runtime = runtimeStates.has(rawRuntime) ? rawRuntime : "failed";
    const attempt = String(source.attempt || source.workspaceAttempt || "none").toLowerCase();
    const snapshot = String(source.snapshot ?? source.workspaceSnapshot) === "true";
    const contradictory = runtime === "running" && attempt === "none";
    const [actionLabel, defaultMessage] = actions[runtime];
    element.classList.add("ae-workspace-state");
    element.dataset.workspaceRuntime = runtime;
    element.dataset.workspaceValid = String(!contradictory && runtime === rawRuntime);
    const badge = element.querySelector("[data-workspace-status]");
    if (badge && root.statusBadge) root.statusBadge.apply(badge, "runtime", runtime);
    const message = element.querySelector("[data-workspace-message]");
    if (message) {
      message.textContent = contradictory
        ? "运行环境状态与学习尝试不一致，请刷新或联系管理员；系统不会显示虚假“继续”。"
        : snapshot && runtime === "stopped"
          ? "环境已停止，但发现可恢复快照。重启后可继续之前的尝试。"
          : defaultMessage;
    }
    const action = element.querySelector("[data-workspace-action]");
    if (action) {
      action.textContent = contradictory ? "刷新状态" : actionLabel;
      action.toggleAttribute("disabled", runtime === "provisioning" || runtime === "stopping");
    }
    if (contradictory || runtime !== rawRuntime) {
      element.dispatchEvent(new CustomEvent("aisecedu:workspace-contradiction", {
        bubbles: true,
        detail: {attempt, runtime: rawRuntime, snapshot},
      }));
    }
    return {attempt, runtime, snapshot, valid: !contradictory && runtime === rawRuntime};
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll("[data-workspace-state]").forEach(element => render(element));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll(document), {once: true});
  } else {
    enhanceAll(document);
  }
  document.addEventListener("aisecedu:status-ready", () => enhanceAll(document));
  root.workspaceState = {render, enhanceAll, runtimeStates: Array.from(runtimeStates)};
})();

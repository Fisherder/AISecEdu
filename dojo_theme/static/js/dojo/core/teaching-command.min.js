(function () {
  "use strict";

  const observations = new Set();
  window.addEventListener("pagehide", () => {
    for (const controller of observations) controller.abort();
  });

  async function waitForAction(initialAction, options) {
    let action = initialAction;
    if (!action) return action;
    function outcome(current) {
      if (["EXECUTION_FAILED", "EXECUTION_CANCELED"].includes(current.status)) {
        const error = new Error(current.error || (current.status === "EXECUTION_CANCELED" ? "操作已停止。" : "操作执行失败。"));
        error.action = current;
        throw error;
      }
      return current;
    }
    if (action.status !== "EXECUTING") return outcome(action);
    const controller = new AbortController();
    const signal = options.signal || controller.signal;
    const deadline = Date.now() + (options.timeoutMs || 20 * 60 * 1000);
    observations.add(controller);
    try {
      while (action.status === "EXECUTING") {
        if (signal.aborted || controller.signal.aborted) throw new DOMException("页面已离开；操作将在后台继续。", "AbortError");
        if (Date.now() >= deadline) {
          const error = new Error("操作已提交，仍在后台执行。稍后刷新页面查看结果。请勿重复提交。 ");
          error.commandPending = true;
          error.action = action;
          throw error;
        }
        if (options.onProgress) options.onProgress(action);
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(done, options.intervalMs || 1500);
          function cleanup() {
            signal.removeEventListener("abort", aborted);
            controller.signal.removeEventListener("abort", aborted);
          }
          function done() { cleanup(); resolve(); }
          function aborted() {
            window.clearTimeout(timer);
            cleanup();
            reject(new DOMException("页面已离开；操作将在后台继续。", "AbortError"));
          }
          signal.addEventListener("abort", aborted, { once: true });
          controller.signal.addEventListener("abort", aborted, { once: true });
        });
        const latest = await options.read(action.id, { signal });
        if (!latest || latest.id !== action.id) throw new Error("未能读取已提交操作的状态，请刷新页面查看结果。");
        action = latest;
      }
      return outcome(action);
    } finally {
      observations.delete(controller);
    }
  }

  window.AISecEduCommands = Object.freeze({ waitForAction });
})();

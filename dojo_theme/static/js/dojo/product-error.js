(function () {
  "use strict";
  const root = document.querySelector("[data-product-error]");
  const api = window.DojoLearning;
  if (!root) return;

  root.querySelectorAll("[data-error-recovery]").forEach(link => {
    link.addEventListener("click", async event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") return;
      event.preventDefault();
      const href = link.href;
      const details = {
        reasonCode: root.dataset.errorCode || "PAGE_UNAVAILABLE",
        action: link.dataset.errorRecovery || "primary",
        requestId: root.dataset.requestId || "NONE",
      };
      const send = window.AISecEdu?.telemetry?.track("recovery_selected", details)
        || (api ? api.json("POST", "/learning/telemetry", {
          event: "student_error_recovered",
          properties: {
            errorCode: details.reasonCode,
            recoveryType: details.action,
            requestId: details.requestId,
          },
        }).catch(() => {}) : Promise.resolve());
      await Promise.race([send, new Promise(resolve => window.setTimeout(resolve, 180))]);
      window.location.assign(href);
    });
  });
})();

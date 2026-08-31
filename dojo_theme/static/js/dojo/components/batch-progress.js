(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const fields = ["requested", "created", "validated", "failed", "published"];

  function values(element, next) {
    const source = next || element.dataset;
    return Object.fromEntries(fields.map(field => [
      field,
      Math.max(0, Number(source[field] ?? source[`batch${field[0].toUpperCase()}${field.slice(1)}`]) || 0),
    ]));
  }

  function render(element, next) {
    if (!element) return null;
    const state = values(element, next);
    const contradictions = [];
    if (state.created > state.requested) contradictions.push("created_gt_requested");
    if (state.validated > state.created) contradictions.push("validated_gt_created");
    if (state.published > state.validated) contradictions.push("published_gt_validated");
    if (state.failed > state.requested) contradictions.push("failed_gt_requested");
    element.dataset.batchValid = String(!contradictions.length);
    element.classList.add("ae-batch-progress");
    const summary = element.querySelector("[data-batch-summary]");
    if (summary) {
      summary.textContent = contradictions.length
        ? "批次计数需核对，已停止显示成功结论。"
        : `已请求 ${state.requested} · 已创建 ${state.created} · 已验证 ${state.validated} · 失败 ${state.failed} · 已发布 ${state.published}`;
    }
    const progress = element.querySelector("[role='progressbar']");
    if (progress) {
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", String(Math.max(1, state.requested)));
      progress.setAttribute("aria-valuenow", String(Math.min(state.requested, state.created)));
      progress.setAttribute("aria-valuetext", `${state.created} / ${state.requested} 道题已创建`);
      const bar = progress.querySelector("i");
      if (bar) bar.style.width = `${state.requested ? Math.min(100, state.created * 100 / state.requested) : 0}%`;
    }
    if (contradictions.length) {
      element.dispatchEvent(new CustomEvent("aisecedu:batch-contradiction", {
        bubbles: true,
        detail: {counts: state, contradictions},
      }));
    }
    return {...state, valid: !contradictions.length, contradictions};
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll("[data-batch-progress]").forEach(element => render(element));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll(document), {once: true});
  } else {
    enhanceAll(document);
  }
  root.batchProgress = {render, values, enhanceAll};
})();

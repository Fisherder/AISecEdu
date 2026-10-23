(function (scope) {
  "use strict";

  const names = { model: "模型", reasoning: "推理摘要", message: "输出", tool: "工具",
    command: "命令", workflow: "步骤", artifact: "成品" };
  const icons = { model: "fa-microchip", reasoning: "fa-brain", message: "fa-comment-dots",
    tool: "fa-wrench", command: "fa-terminal", workflow: "fa-layer-group", artifact: "fa-file-alt" };
  const labels = { running: "执行中", completed: "完成", failed: "失败", cancelled: "已停止", incomplete: "记录待补齐" };

  function itemMarkup(run, item, options) {
    const escape = options.escape;
    const known = Object.hasOwn(names, item.kind);
    const kind = known ? item.kind : "extension";
    const name = known ? names[kind] : "扩展事件";
    const state = Object.hasOwn(labels, item.status) ? item.status : "incomplete";
    const duration = Number.isFinite(item.durationMs) && item.durationMs > 0
      ? `${(item.durationMs / 1000).toFixed(1)} 秒` : "";
    const id = `${run.id}:${item.id}`;
    const detail = [item.cwd ? `目录：${item.cwd}` : "", item.command ? `$ ${item.command}` : "",
      item.input !== undefined ? `输入：\n${JSON.stringify(item.input, null, 2)}` : "",
      item.content || "", item.output || ""].filter(Boolean).join("\n\n");
    const stateIcon = state === "running" && options.live ? "fa-circle-notch fa-spin"
      : state === "failed" ? "fa-exclamation-circle" : state === "cancelled" ? "fa-stop-circle"
      : state === "completed" ? "fa-check" : "fa-clock";
    const exit = kind === "command" && Number.isInteger(item.exitCode)
      ? `<code>exit ${item.exitCode}</code>` : "";
    return `<article class="agent-run-item is-${state} is-${kind}" data-agent-item="${escape(id)}">
      <span class="agent-run-item-icon"><i class="fas ${icons[kind] || "fa-stream"}" aria-hidden="true"></i></span>
      <div class="agent-run-item-body"><div class="agent-run-item-heading">
        <span class="agent-run-item-kind">${name}</span><strong>${escape(item.title || name)}</strong>
        <i class="fas ${stateIcon}" aria-label="${labels[state]}"></i>${exit}${duration ? `<time>${duration}</time>` : ""}
      </div>${item.subtitle ? `<small>${escape(item.subtitle)}</small>` : ""}
      ${detail ? `<details class="agent-run-detail" data-agent-trace-item="${escape(id)}"${options.openItems?.has(id) ? " open" : ""}>
        <summary>${kind === "command" ? "命令与输出" : kind === "reasoning" ? "模型返回的推理摘要" : "执行内容"}</summary>
        <div class="agent-run-detail-tools"><button type="button" data-agent-record-copy="${escape(id)}" aria-label="复制${escape(name)}记录">复制</button></div>
        <pre>${escape(detail)}</pre></details>` : ""}</div></article>`;
  }

  function runMarkup(runs, options) {
    if (!runs.length) return "";
    const escape = options.escape;
    const body = runs.map((run, index) => {
      const recent = run.items.slice(-7);
      const older = run.items.slice(0, -7);
      const incomplete = run.incompleteEvents || run.items.some(item => item.status === "incomplete");
      const warning = incomplete ? '<p class="agent-run-record-warning" role="status">部分执行记录尚未补齐，未推定这些操作已经完成。</p>' : "";
      const label = `执行阶段 ${index + 1} · ${labels[run.status] || labels.incomplete}`;
      const content = `${warning}<div class="agent-run-items">${older.length ? `<details class="agent-run-earlier" data-agent-trace-item="${escape(`${run.id}:earlier`)}"${options.openItems?.has(`${run.id}:earlier`) ? " open" : ""}><summary>之前 ${older.length} 个动作</summary>${older.map(item => itemMarkup(run, item, options)).join("")}</details>` : ""}${recent.map(item => itemMarkup(run, item, options)).join("")}</div>`;
      return index === runs.length - 1
        ? `<section class="agent-run-attempt is-current" aria-label="${escape(label)}"><div class="agent-run-attempt-label"><strong>${escape(label)}</strong><span>${run.items.length} 个动作</span></div>${content}</section>`
        : `<details class="agent-run-attempt is-history" data-agent-trace-item="${escape(`${run.id}:history`)}"${options.openItems?.has(`${run.id}:history`) ? " open" : ""}><summary><span>${escape(label)}</span><small>${run.items.length} 个动作</small></summary>${content}</details>`;
    }).join("");
    return `<section class="agent-run-trace" aria-label="真实执行记录"><div class="agent-run-trace-head"><strong>执行记录</strong><span>${escape(options.label || "")} · ${runs.length} 个执行阶段</span></div>${body}</section>`;
  }

  function liveMarkup(runs, options) {
    if (!runs.length) return "";
    const current = runs[runs.length - 1];
    const items = current.items.filter(item => item.kind !== "message").slice(-4);
    if (!items.length) return "";
    return `<section class="teaching-run-live" aria-label="当前执行动作">${items.map(item => itemMarkup(current, item, options)).join("")}</section>`;
  }

  const exported = { itemMarkup, runMarkup, liveMarkup };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else scope.AISecEduAgentActivityView = exported;
})(typeof window === "undefined" ? globalThis : window);

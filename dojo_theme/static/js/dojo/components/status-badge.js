(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const labels = {
    view: {
      initial: ["准备中", "info"], loading: ["加载中", "info"], ready: ["可用", "success"],
      empty: ["暂无内容", "neutral"], degraded: ["部分可用", "warning"], error: ["加载失败", "danger"],
      stale: ["数据待更新", "warning"], forbidden: ["无权访问", "danger"],
    },
    availability: {
      available: ["可用", "success"], moved: ["已移动", "info"], archived: ["已归档", "neutral"],
      deleted: ["已下线", "danger"], forbidden: ["无权访问", "danger"],
    },
    workflow: {
      draft: ["草稿", "neutral"], queued: ["等待处理", "info"], running: ["处理中", "info"],
      validating: ["验证中", "info"], needs_review: ["待审核", "warning"], partial_success: ["部分完成", "warning"],
      published: ["已发布", "success"], failed: ["处理失败", "danger"], canceled: ["已取消", "neutral"],
    },
    activity: {
      not_started: ["未开始", "neutral"], in_progress: ["进行中", "info"],
      submitted: ["已提交", "warning"], completed: ["已完成", "success"],
    },
    mastery: {
      unknown: ["证据不足", "neutral"], emerging: ["初步形成", "warning"], developing: ["正在发展", "info"],
      proficient: ["熟练", "success"], mastered: ["已掌握", "success"],
    },
    assessment: {
      not_applicable: ["无需评测", "neutral"], pending: ["评测中", "info"],
      ready: ["评测完成", "success"], failed: ["评测失败", "danger"],
    },
    evidence: {
      none: ["暂无证据", "neutral"], partial: ["证据不完整", "warning"],
      complete: ["证据完整", "success"], invalid: ["证据无效", "danger"],
    },
    runtime: {
      none: ["未启动", "neutral"], provisioning: ["启动中", "info"], running: ["运行中", "success"],
      stopping: ["停止中", "info"], stopped: ["已停止", "neutral"], expired: ["已过期", "warning"],
      failed: ["启动失败", "danger"],
    },
  };

  function reportUnknown(detail) {
    if (!root.telemetry) {
      root.telemetryQueue = root.telemetryQueue || [];
      root.telemetryQueue.push({name: "unknown_state", details: {
        action: String(detail.domain || "state"),
        toState: String(detail.state || "unknown"),
        result: "safe_fallback",
      }});
    }
    document.dispatchEvent(new CustomEvent("aisecedu:unknown-state", {detail}));
  }

  function normalize(domain, state) {
    const domainKey = String(domain || "").trim().toLowerCase();
    const stateKey = String(state || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const known = labels[domainKey] && labels[domainKey][stateKey];
    if (known) return {domain: domainKey, state: stateKey, label: known[0], kind: known[1], known: true};
    reportUnknown({domain: domainKey || "unknown", state: stateKey || null});
    return {domain: domainKey || "unknown", state: "unknown", label: "状态需确认", kind: "warning", known: false};
  }

  function apply(element, domain, state, customLabel) {
    if (!element) return null;
    const value = normalize(domain, state);
    element.classList.add("ae-status");
    element.dataset.kind = value.kind;
    element.dataset.statusDomain = value.domain;
    element.dataset.status = value.state;
    element.dataset.statusKnown = String(value.known);
    element.textContent = String(customLabel || value.label);
    if (!value.known) element.title = "系统遇到了尚未识别的状态，已采用安全显示。";
    return value;
  }

  function create(domain, state, label) {
    const badge = document.createElement("span");
    apply(badge, domain, state, label);
    return badge;
  }

  function enhance(scope) {
    (scope || document).querySelectorAll("[data-status-domain][data-status]").forEach(element => {
      apply(element, element.dataset.statusDomain, element.dataset.status, element.dataset.statusLabel);
    });
  }

  document.addEventListener("DOMContentLoaded", () => enhance(document));
  root.statusBadge = {labels, normalize, apply, create, enhance};
})();

(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const names = new Set([
    "resource_action_completed", "unknown_state", "recovery_selected",
    "view_state_changed", "state_contradiction", "request_failed",
    "route_redirected", "performance_vital",
  ]);
  const fields = new Set([
    "name", "eventVersion", "journeyId", "mode", "surface", "resource",
    "action", "fromState", "toState", "result", "reasonCode", "durationMs",
    "requestId", "client",
  ]);
  const forbidden = new Set([
    "answer", "password", "token", "flag", "submission", "submissionbody",
    "chat", "chattext", "prompt", "fullprompt", "studenttext", "ip",
  ]);
  const seen = new Map();
  let sent = 0;

  function normalizedKey(value) {
    return String(value || "").replace(/[_-]/g, "").toLowerCase();
  }

  function containsForbidden(value) {
    if (Array.isArray(value)) return value.some(containsForbidden);
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => (
      forbidden.has(normalizedKey(key)) || containsForbidden(child)
    ));
  }

  function journeyId() {
    const key = "aisecedu-telemetry-journey";
    try {
      let value = sessionStorage.getItem(key);
      if (!value) {
        value = window.crypto?.randomUUID?.()
          || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(key, value);
      }
      return value;
    } catch (error) {
      return "ephemeral";
    }
  }

  function clientContext() {
    const width = window.innerWidth;
    return {
      viewportClass: width < 480 ? "phone" : width < 900 ? "tablet" : "desktop",
      offline: navigator.onLine === false,
      connectionType: navigator.connection?.effectiveType || "unknown",
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false,
    };
  }

  function sanitize(payload) {
    if (!payload || typeof payload !== "object" || containsForbidden(payload)) return null;
    const name = String(payload.name || "").trim().toLowerCase();
    if (!names.has(name)) return null;
    const event = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (fields.has(key)) event[key] = value;
    });
    event.name = name;
    event.eventVersion = 1;
    event.journeyId = String(event.journeyId || journeyId()).slice(0, 160);
    event.mode = String(event.mode || document.body?.dataset.productMode || "public").slice(0, 32);
    event.surface = String(event.surface || document.body?.dataset.telemetrySurface || event.mode).slice(0, 80);
    event.client = clientContext();
    if (event.resource && typeof event.resource === "object") {
      event.resource = {
        type: String(event.resource.type || "resource").slice(0, 48),
        id: String(event.resource.id || "").slice(0, 160) || undefined,
      };
    } else {
      delete event.resource;
    }
    return event;
  }

  function track(name, details) {
    if (sent >= 40 || !root.request) return Promise.resolve(false);
    const event = sanitize({name, ...(details || {})});
    if (!event) return Promise.resolve(false);
    const signature = JSON.stringify([
      event.name, event.surface, event.action, event.fromState,
      event.toState, event.result, event.reasonCode,
    ]);
    const last = seen.get(signature) || 0;
    if (Date.now() - last < 1200) return Promise.resolve(false);
    seen.set(signature, Date.now());
    sent += 1;
    return root.request("/ui/telemetry", {
      method: "POST",
      json: event,
      timeoutMs: 5000,
      retries: 0,
      dedupeKey: false,
      invalidateCache: false,
    }).then(() => true).catch(() => false);
  }

  document.addEventListener("aisecedu:unknown-state", event => {
    track("unknown_state", {
      action: String(event.detail?.domain || "state"),
      toState: String(event.detail?.state || "unknown"),
      result: "safe_fallback",
    });
  });
  document.addEventListener("aisecedu:recovery", event => {
    track("recovery_selected", {
      action: "recovery",
      reasonCode: event.detail?.code,
      requestId: event.detail?.requestId,
    });
  });
  document.addEventListener("aisecedu:async-state", event => {
    track("view_state_changed", {toState: event.detail?.state});
  });
  ["batch", "workspace"].forEach(kind => {
    document.addEventListener(`aisecedu:${kind}-contradiction`, () => {
      track("state_contradiction", {action: kind, result: "blocked_success_claim"});
    });
  });

  root.telemetry = {track, sanitize, names: Array.from(names)};
  const queued = Array.isArray(root.telemetryQueue) ? root.telemetryQueue.splice(0) : [];
  queued.slice(0, 40).forEach(item => track(item?.name, item?.details));
})();

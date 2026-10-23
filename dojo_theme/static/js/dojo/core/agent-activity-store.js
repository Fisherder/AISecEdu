(function (scope) {
  "use strict";

  const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);
  const statuses = new Set(["running", "completed", "failed", "cancelled", "incomplete"]);
  const kinds = new Set(["model", "reasoning", "message", "tool", "command", "workflow", "artifact"]);
  const text = (value) => typeof value === "string" ? value : "";
  const duration = (start, end) => Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, end - start) : undefined;

  function entryIdentity(entry) {
    if (entry.id) return String(entry.id);
    if (entry.sourceJobId && Number.isInteger(entry.sourceSequence))
      return `${entry.sourceJobId}:${entry.sourceSequence}`;
    const event = entry.details?.agentRun;
    return event ? `${event.runId}:${event.seq}:${entry.sequence}` : `audit:${entry.sequence}`;
  }

  function projectRuns(entries, jobStatus) {
    const grouped = new Map();
    for (const entry of entries) {
      const event = entry.details?.agentRun;
      if (!event || !text(event.runId) || !text(event.type)) continue;
      if (!grouped.has(event.runId)) grouped.set(event.runId, []);
      grouped.get(event.runId).push({ entry, event });
    }
    const runs = [];
    for (const [runId, rows] of grouped) {
      rows.sort((a, b) => {
        if (a.entry.sourceJobId && a.entry.sourceJobId === b.entry.sourceJobId)
          return a.entry.sourceSequence - b.entry.sourceSequence;
        return Number(a.event.seq || 0) - Number(b.event.seq || 0);
      });
      const run = { id: runId, label: "教学智能体执行", status: "running", items: [],
        byId: new Map(), byTurn: new Map(), incompleteEvents: 0 };
      for (const { event } of rows) {
        if (event.type === "run.started") run.label = text(event.label) || run.label;
        if (event.type === "run.completed") run.status = "completed";
        if (event.type === "run.failed" || event.type === "run.cancelled") {
          run.status = event.type === "run.failed" ? "failed" : "cancelled";
          run.items.push({ id: `run-end-${event.seq}`, kind: "workflow", status: run.status,
            title: run.status === "failed" ? "本轮执行失败" : "本轮执行已停止",
            content: text(event.error) || text(event.reason), startedAt: event.time });
        }
        if (event.type === "turn.started") {
          const id = text(event.turnId) || `turn-${event.seq}`;
          if (run.byTurn.has(id)) continue;
          const labels = { "aisecedu-agent-plan": "规划任务", "aisecedu-integration-job": "生成与执行",
            "aisecedu-agent-deliverable-closure": "检查交付" };
          const key = Object.keys(labels).find((prefix) => text(event.label).startsWith(prefix));
          const item = { id, kind: "workflow", title: labels[key] || "模型调用",
            status: "running", startedAt: event.time };
          run.items.push(item);
          run.byTurn.set(id, item);
        }
        if (event.type === "turn.completed") {
          const item = run.byTurn.get(event.turnId);
          if (item) {
            item.status = statuses.has(event.status) ? event.status : "completed";
            item.durationMs = duration(item.startedAt, event.time);
          } else run.incompleteEvents++;
        }
        if (event.type === "item.started" && text(event.item?.id)) {
          if (!run.byId.has(event.item.id)) {
            const item = { ...event.item, status: statuses.has(event.item.status) ? event.item.status : "running" };
            run.items.push(item);
            run.byId.set(item.id, item);
          }
        }
        const item = run.byId.get(event.itemId);
        if (["item.updated", "item.delta", "item.completed"].includes(event.type) && !item) {
          run.incompleteEvents++;
          continue;
        }
        if (item && event.type === "item.updated") {
          for (const field of ["title", "subtitle", "content", "output", "command", "cwd"])
            if (typeof event.patch?.[field] === "string") item[field] = event.patch[field];
          if (statuses.has(event.patch?.status)) item.status = event.patch.status;
          if (Number.isInteger(event.patch?.exitCode)) item.exitCode = event.patch.exitCode;
          if (event.patch && Object.hasOwn(event.patch, "input")) item.input = event.patch.input;
        }
        if (item && event.type === "item.delta") {
          const field = event.channel === "output" ? "output" : "content";
          item[field] = text(item[field]) + text(event.delta);
        }
        if (item && event.type === "item.completed") {
          item.status = statuses.has(event.status) ? event.status : "completed";
          item.durationMs = duration(item.startedAt, event.time);
          item.completedAt = event.time;
          if (typeof event.output === "string") item.output = event.output;
          if (Number.isInteger(event.exitCode)) item.exitCode = event.exitCode;
        }
      }
      if (run.status !== "running" || terminal.has(jobStatus)) {
        if (run.status === "running") run.status = "incomplete";
        for (const item of run.items)
          if (item.status === "running") item.status = run.status === "completed" ? "incomplete" : run.status;
      }
      runs.push(run);
    }
    return runs;
  }

  function createActivityStore() {
    const jobs = new Map();
    function record(id) {
      const key = String(id);
      if (!jobs.has(key)) jobs.set(key, { entries: new Map(), revision: 0, cursor: null, status: "", runs: [], dirty: false });
      return jobs.get(key);
    }
    return {
      merge(job, events, cursor) {
        const state = record(job.id);
        for (const entry of Array.isArray(events) ? events : []) {
          const id = entryIdentity(entry);
          if (state.entries.has(id)) continue;
          state.entries.set(id, entry);
          state.revision++;
          state.dirty = true;
        }
        if (state.status !== job.status) state.dirty = true;
        state.status = job.status;
        if (typeof cursor === "string") state.cursor = cursor;
        return { ...job, events: Array.from(state.entries.values()), activityRevision: state.revision };
      },
      runs(job) {
        this.merge(job, job.events);
        const state = record(job.id);
        if (state.dirty) {
          state.runs = projectRuns(state.entries.values(), String(job.status || "").toUpperCase());
          state.dirty = false;
        }
        return state.runs;
      },
      cursor(id) { return record(id).cursor; },
      resetCursor(id) { record(id).cursor = null; },
      revision(id) { return record(id).revision; },
      clear() { jobs.clear(); },
    };
  }

  function createDraftStore(storage, namespace) {
    const memory = new Map();
    const key = (id) => `${namespace}:${id || "new"}`;
    return {
      read(id) {
        const name = key(id);
        if (memory.has(name)) return memory.get(name);
        try {
          const raw = storage?.getItem(name);
          const value = raw ? JSON.parse(raw) : null;
          if (value && typeof value.content === "string") {
            memory.set(name, value);
            return value;
          }
        } catch (_) {}
        return { content: "", artifactType: "auto" };
      },
      write(id, value) {
        const name = key(id);
        const draft = { content: text(value.content), artifactType: text(value.artifactType) || "auto" };
        memory.set(name, draft);
        try {
          if (draft.content) storage?.setItem(name, JSON.stringify(draft));
          else storage?.removeItem(name);
        } catch (_) {}
      },
    };
  }

  const exported = { createActivityStore, createDraftStore, projectRuns, entryIdentity, kinds };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else scope.AISecEduAgentActivity = exported;
})(typeof window === "undefined" ? globalThis : window);

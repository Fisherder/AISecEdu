(function () {
  "use strict";
  const api = window.DojoLearning;
  const byId = (id) => document.getElementById(id);
  const root = byId("teacher-projects");
  if (!root || !api) return;
  const labels = {"learning-flow": "流程探究式学习", "slide-deck": "课件", "attack-defense-scene": "动画演示", simulation: "交互仿真", debate: "AI 辩论", roleplay: "角色互动"};
  const groups = ["all", "succeeded", "failed", "generating"];
  const pageSize = 24;
  const pages = new Map();
  const chosen = new Set();
  let bulkMode = false, bulkPending = false;
  const statusButtons = Array.from(root.querySelectorAll("[data-project-status]"));
  let projects = [], courses = [], selected = null, data = null;
  let filters = readLocation(), requestEpoch = 0, timer, debounce, busy = false, renderedRows = "";
  const unwrap = (result) => {
    if (!result.success) throw new Error(result.error?.message || result.message || "请求未完成");
    return result.data;
  };

  function readLocation() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || "";
    return {
      q: (params.get("q") || "").slice(0, 240),
      type: Object.hasOwn(labels, type) ? type : "",
      status: groups.includes(params.get("status")) ? params.get("status") : "succeeded",
      page: Math.max(1, Math.min(1000000, Number.parseInt(params.get("page"), 10) || 1)),
    };
  }

  function writeLocation() {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(filters)) {
      if (!value || (key === "status" && value === "succeeded") || (key === "page" && value === 1)) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", url);
  }

  function syncControls() {
    if (byId("project-search").value !== filters.q) byId("project-search").value = filters.q;
    byId("project-type").value = filters.type;
    statusButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.projectStatus === filters.status)));
  }

  function setBusy(value) {
    busy = value;
    byId("project-list").setAttribute("aria-busy", String(value));
    byId("project-refresh").disabled = value;
    byId("project-prev").disabled = value || filters.page <= 1;
    byId("project-next").disabled = value || !data?.pagination.hasNext;
    syncBulk();
  }

  function statusLabel(item) {
    const generation = item.generation;
    if (generation.group === "succeeded") return "生成成功";
    if (["CANCELED", "CANCELLED"].includes(generation.status)) return "已取消";
    if (generation.group === "failed") return generation.kind === "artifact.revise" ? "调整失败" : "生成失败";
    if (generation.status === "CANCEL_REQUESTED") return "正在取消";
    if (generation.status === "QUEUED") return generation.kind === "artifact.revise" ? "调整排队中" : "排队中";
    if (generation.status === "VALIDATING") return "检查中";
    if (["RUNNING", "GENERATING"].includes(generation.status)) return generation.kind === "artifact.revise" ? "调整中" : "生成中";
    return "待生成";
  }

  function card(item) {
    const generation = item.generation;
    const progress = generation.group === "generating" && generation.status === "RUNNING" && Number.isFinite(generation.progress) ? ` · ${generation.progress}%` : "";
    const action = generation.group === "generating" ? "查看进度" : generation.group === "failed" ? (generation.jobId ? "查看并重试" : "查看详情") : "打开项目";
    return `<article class="project-card" data-project-id="${api.escapeHtml(item.id)}">
      <label class="bulk-selection-checkbox project-selection"><input type="checkbox" data-project-select="${api.escapeHtml(item.id)}" aria-label="选择项目：${api.escapeHtml(item.title)}"><span>${canBulkDelete(item) ? "选择项目" : "当前状态不可批量删除"}</span></label>
      <div class="project-card-tags"><span class="project-tag">${api.escapeHtml(labels[item.type] || item.type)}</span><span class="project-status project-status--${generation.group}">${statusLabel(item)}${progress}</span></div>
      <h2>${api.escapeHtml(item.title)}</h2><small>版本 ${Number(item.currentRevision) || 1}</small>
      ${generation.group === "succeeded" ? `<a href="/teacher/library?sourceKind=artifact&sourceId=${encodeURIComponent(item.id)}">存入素材库</a>` : ""}
      <footer><a class="project-primary" href="/teacher/artifacts/${encodeURIComponent(item.id)}">${action}</a><button type="button" data-bind="${api.escapeHtml(item.id)}">关联课程</button><details class="project-more"><summary aria-label="管理项目：${api.escapeHtml(item.title)}" title="管理项目" aria-haspopup="menu" aria-expanded="false"><i class="fas fa-ellipsis-h" aria-hidden="true"></i></summary><div class="project-management-menu"><button type="button" data-manage="rename" data-id="${api.escapeHtml(item.id)}"><i class="fas fa-pen" aria-hidden="true"></i>重命名</button><button type="button" class="is-danger" data-manage="delete" data-id="${api.escapeHtml(item.id)}" ${generation.group === "generating" ? 'disabled title="请等待生成结束或先取消任务"' : ''}><i class="fas fa-trash-alt" aria-hidden="true"></i>删除</button></div></details></footer>
    </article>`;
  }

  function render() {
    statusButtons.forEach((button) => {
      button.querySelector("[data-status-count]").textContent = data.statusCounts[button.dataset.projectStatus];
    });
    const signature = JSON.stringify(projects);
    if (signature !== renderedRows) {
      const focused = document.activeElement?.closest(".project-card");
      const focusId = focused?.dataset.projectId;
      const focusAction = document.activeElement?.closest(".project-more") ? ".project-more summary" : document.activeElement?.hasAttribute("data-bind") ? "[data-bind]" : "a";
      byId("project-list").innerHTML = projects.map(card).join("");
      renderedRows = signature;
      if (focusId) {
        const replacement = Array.from(byId("project-list").children).find((element) => element.dataset.projectId === focusId);
        (replacement?.querySelector(focusAction) || statusButtons.find((button) => button.dataset.projectStatus === filters.status)).focus({preventScroll: true});
      }
    }
    const {total, offset} = data.pagination;
    byId("project-notice").textContent = total ? `共 ${total} 个项目 · 当前显示 ${offset + 1}–${offset + projects.length} 个` : "共 0 个项目";
    byId("project-notice").classList.remove("project-error");
    byId("project-empty").hidden = projects.length > 0;
    const filtered = Boolean(filters.q || filters.type || filters.status !== "all");
    byId("project-empty-title").textContent = filtered ? "没有符合条件的项目" : "还没有独立项目";
    byId("project-empty-description").textContent = filtered ? "换个状态、类型或搜索词试试。" : "点击“新建项目”，描述你要制作的内容即可。";
    byId("project-clear").hidden = !filtered;
    byId("project-pagination").hidden = !total;
    byId("project-page-summary").textContent = `第 ${filters.page} / ${Math.max(1, Math.ceil(total / pageSize))} 页`;
    syncBulk();
  }

  function canBulkDelete(item) {
    return item.generation.group !== "generating" && !item.publishedChallengeId && !["GENERATING", "VALIDATING", "PUBLISHING", "PUBLISHED"].includes(item.status);
  }

  function syncBulk() {
    const selectedRows = window.AISecEduBulkSelection.reconcile(chosen, projects, item => item.id, canBulkDelete);
    const available = projects.filter(canBulkDelete);
    const all = Boolean(available.length) && selectedRows.length === available.length;
    root.classList.toggle("is-bulk-mode", bulkMode);
    byId("project-bulk-bar").hidden = !bulkMode;
    byId("project-bulk-toggle").setAttribute("aria-pressed", String(bulkMode));
    byId("project-bulk-toggle").querySelector("span").textContent = bulkMode ? "完成管理" : "批量管理";
    byId("project-bulk-toggle").disabled = bulkPending;
    byId("project-bulk-count").textContent = bulkPending ? `正在处理 ${selectedRows.length} 项…` : `已选 ${selectedRows.length} 项 · 本页 ${available.length} 项可删除`;
    byId("project-bulk-all").textContent = all ? "取消全选" : "全选当前列表";
    byId("project-bulk-all").setAttribute("aria-pressed", String(all));
    byId("project-bulk-all").disabled = busy || bulkPending || !available.length;
    byId("project-bulk-clear").disabled = busy || bulkPending || !chosen.size;
    byId("project-bulk-delete").disabled = busy || bulkPending || !chosen.size;
    root.querySelectorAll("[data-project-select]").forEach(input => {
      const item = projects.find(row => row.id === input.dataset.projectSelect);
      input.checked = chosen.has(input.dataset.projectSelect);
      input.disabled = busy || bulkPending || !item || !canBulkDelete(item);
      input.closest(".project-card").classList.toggle("is-selected", input.checked);
    });
    [byId("project-search"), byId("project-type"), byId("project-refresh"), ...statusButtons].forEach(control => {
      control.disabled = bulkPending || (control.id === "project-refresh" && busy);
    });
    byId("project-prev").disabled = bulkPending || busy || filters.page <= 1;
    byId("project-next").disabled = bulkPending || busy || !data?.pagination.hasNext;
  }

  byId("project-bulk-toggle").addEventListener("click", () => {
    if (bulkPending) return;
    window.AISecEduUI?.closeMenus();
    bulkMode = !bulkMode; chosen.clear(); syncBulk();
  });
  byId("project-list").addEventListener("change", event => {
    const input = event.target.closest("[data-project-select]");
    if (!input || !bulkMode || busy || bulkPending) return;
    if (input.checked) chosen.add(input.dataset.projectSelect); else chosen.delete(input.dataset.projectSelect);
    syncBulk();
  });
  byId("project-bulk-all").addEventListener("click", () => {
    if (busy || bulkPending) return;
    window.AISecEduBulkSelection.toggleAll(chosen, projects, item => item.id, canBulkDelete); syncBulk();
  });
  byId("project-bulk-clear").addEventListener("click", () => {if (!bulkPending) {chosen.clear(); syncBulk();}});
  byId("project-bulk-delete").addEventListener("click", async () => {
    if (bulkPending || busy || !chosen.size) return;
    const targets = projects.filter(item => chosen.has(item.id));
    bulkPending = true; clearTimeout(timer); syncBulk();
    try {
      const confirmed = await window.AISecEduUI.confirm(
        `确认删除 ${targets.slice(0, 3).map(item => `“${item.title}”`).join("、")}${targets.length > 3 ? `等 ${targets.length} 个项目` : ""}？项目将从合集中移除，历史版本保留在后台。`,
        {title: `批量删除 ${targets.length} 个项目`, confirmLabel: "确认批量删除", confirmStyle: "danger"},
      );
      if (!confirmed) return;
      const result = unwrap(await api.json("POST", "/teaching/artifacts/bulk-delete", {scope: "projects", artifactIds: targets.map(item => item.id)}));
      chosen.clear(); pages.clear();
      window.AISecEduUI.notify(`已删除 ${result.deletedCount} 个项目`, "success");
      bulkPending = false;
      await refresh();
    } catch (error) {window.AISecEduUI.notify(error.message || "批量删除失败，请重试。", "danger");}
    finally {bulkPending = false; syncBulk(); scheduleRefresh();}
  });

  function scheduleRefresh() {
    clearTimeout(timer);
    if (!document.hidden && !bulkPending) timer = setTimeout(() => refresh({quiet: true}), data?.statusCounts.generating ? 8000 : 30000);
  }

  async function refresh({quiet = false, cached = false} = {}) {
    if (bulkPending) return;
    clearTimeout(timer);
    clearTimeout(debounce);
    const epoch = ++requestEpoch;
    const params = new URLSearchParams({scope: "projects", limit: String(pageSize), offset: String((filters.page - 1) * pageSize)});
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.type) params.set("type", filters.type);
    if (filters.status !== "all") params.set("status", filters.status);
    const key = params.toString();
    const saved = pages.get(key);
    if (cached && saved) {
      data = saved.data;
      projects = data.artifacts;
      render();
      if (Date.now() - saved.time < 8000) {
        setBusy(false);
        scheduleRefresh();
        return;
      }
      quiet = true;
    } else if (!quiet) {
      data = null;
      projects = [];
      renderedRows = "";
      byId("project-list").replaceChildren();
      byId("project-empty").hidden = true;
      byId("project-pagination").hidden = true;
    }
    setBusy(true);
    if (!quiet) {
      byId("project-notice").classList.remove("project-error");
      byId("project-notice").textContent = "正在读取项目…";
    }
    try {
      const result = unwrap(await api.request(`/teaching/artifacts?${params}`, {cacheTtlMs: 0, dedupeKey: false}));
      if (epoch !== requestEpoch) return;
      if (!Array.isArray(result?.artifacts) || !result.statusCounts || !result.pagination || result.artifacts.some((item) => !groups.slice(1).includes(item.generation?.group))) throw new Error("项目状态数据不完整，请刷新后重试。");
      const lastPage = Math.max(1, Math.ceil(result.pagination.total / pageSize));
      if (filters.page > lastPage) {
        filters.page = lastPage;
        writeLocation();
        return refresh({quiet});
      }
      data = result;
      projects = result.artifacts;
      pages.delete(key);
      pages.set(key, {data: result, time: Date.now()});
      if (pages.size > 20) pages.delete(pages.keys().next().value);
      render();
    } catch (error) {
      if (epoch === requestEpoch) showError(error);
    } finally {
      if (epoch === requestEpoch) {
        setBusy(false);
        scheduleRefresh();
      }
    }
  }

  function changeFilters(values, delayed = false) {
    if (bulkPending) return;
    chosen.clear();
    ++requestEpoch;
    clearTimeout(timer);
    clearTimeout(debounce);
    filters = {...filters, page: 1, ...values};
    writeLocation();
    syncControls();
    if (delayed) {
      setBusy(true);
      byId("project-notice").textContent = "正在读取项目…";
      debounce = setTimeout(() => refresh(), 250);
    } else refresh({cached: true});
  }

  function modules() {
    const course = courses.find((item) => String(item.id) === byId("project-course").value);
    byId("project-module").innerHTML = '<option value="">请选择章节</option>' + (course?.modules || []).map((item) => `<option value="${Number(item.index)}">${api.escapeHtml(item.name)}</option>`).join("");
  }

  byId("project-search").addEventListener("input", (event) => {if (!event.isComposing) changeFilters({q: byId("project-search").value}, true);});
  byId("project-search").addEventListener("compositionend", () => changeFilters({q: byId("project-search").value}, true));
  byId("project-type").addEventListener("change", () => changeFilters({type: byId("project-type").value}));
  statusButtons.forEach((button) => button.addEventListener("click", () => changeFilters({status: button.dataset.projectStatus})));
  byId("project-refresh").addEventListener("click", () => refresh());
  byId("project-clear").addEventListener("click", () => changeFilters({q: "", type: "", status: "all"}));
  byId("project-prev").addEventListener("click", () => {if (!busy && filters.page > 1) changeFilters({page: filters.page - 1});});
  byId("project-next").addEventListener("click", () => {if (!busy && data?.pagination.hasNext) changeFilters({page: filters.page + 1});});
  document.addEventListener("click", async (event) => {
    const manage = event.target.closest(".project-management-menu [data-manage]");
    if (manage && !manage.disabled) {
      if (bulkPending) return;
      selected = projects.find((item) => item.id === manage.dataset.id);
      if (!selected) return;
      window.AISecEduUI?.closeMenus({restoreFocus: true});
      const deleting = manage.dataset.manage === "delete";
      byId("project-manage-form").dataset.action = manage.dataset.manage;
      byId("project-manage-title").textContent = deleting ? "删除项目" : "重命名项目";
      byId("project-name-label").hidden = deleting;
      byId("project-name").disabled = deleting;
      byId("project-name").value = selected.title;
      byId("project-manage-description").textContent = deleting ? `确认删除“${selected.title}”？项目将从合集移除，历史版本保留在后台。` : "修改项目名称，不会改变已生成的内容。";
      byId("project-manage-submit").textContent = deleting ? "确认删除" : "保存名称";
      byId("project-manage-error").textContent = "";
      byId("project-manage-dialog").showModal();
      if (!deleting) byId("project-name").select();
      return;
    }
    const button = event.target.closest("[data-bind]");
    if (!button || !root.contains(button) || button.disabled || bulkPending) return;
    selected = projects.find((item) => item.id === button.dataset.bind);
    if (!selected) return;
    button.disabled = true;
    try {
      const context = unwrap(await api.request("/teaching/context"));
      courses = context.teacherDojos || [];
      byId("project-course").innerHTML = '<option value="">请选择课程</option>' + courses.map((item) => `<option value="${Number(item.id)}">${api.escapeHtml(item.name)}</option>`).join("");
      modules();
      byId("project-course-error").textContent = courses.length ? "" : "还没有可管理课程，请先在课程中心创建课程。";
      byId("project-course-dialog").showModal();
    } catch (error) {showError(error);}
    finally {button.disabled = false;}
  });
  byId("project-course").addEventListener("change", modules);
  byId("project-course-cancel").addEventListener("click", () => byId("project-course-dialog").close());
  byId("project-course-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter || byId("project-course-form").querySelector('[type="submit"]');
    if (button.disabled || !selected) return;
    button.disabled = true;
    try {
      unwrap(await api.json("POST", `/teaching/artifacts/${encodeURIComponent(selected.id)}/course`, {dojoId: Number(byId("project-course").value), moduleIndex: Number(byId("project-module").value), expectedRevision: selected.currentRevision}));
      byId("project-course-dialog").close();
      pages.clear();
      await refresh();
    } catch (error) {byId("project-course-error").textContent = error.message;}
    finally {button.disabled = false;}
  });
  byId("project-manage-cancel").addEventListener("click", () => byId("project-manage-dialog").close());
  byId("project-manage-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("project-manage-submit");
    if (button.disabled || !selected) return;
    const deleting = event.currentTarget.dataset.action === "delete";
    const title = byId("project-name").value.trim();
    if (!deleting && !title) {
      byId("project-manage-error").textContent = "请输入项目名称。";
      return;
    }
    button.disabled = true;
    byId("project-manage-cancel").disabled = true;
    try {
      unwrap(await api.json(deleting ? "DELETE" : "PATCH", `/teaching/artifacts/${encodeURIComponent(selected.id)}`, deleting ? {} : {title}));
      pages.clear();
      byId("project-manage-dialog").close();
      await refresh();
    } catch (error) {byId("project-manage-error").textContent = error.message;}
    finally {button.disabled = false; byId("project-manage-cancel").disabled = false;}
  });
  byId("project-manage-dialog").addEventListener("cancel", (event) => {
    if (byId("project-manage-submit").disabled) event.preventDefault();
  });
  function showError(error) {
    byId("project-notice").textContent = `${error.message} ${data ? "仍显示上次读取的结果。" : ""}点击“刷新”重试。`;
    byId("project-notice").classList.add("project-error");
  }
  window.addEventListener("popstate", () => {filters = readLocation(); syncControls(); refresh();});
  window.addEventListener("online", () => refresh({quiet: true}));
  window.addEventListener("pagehide", () => clearTimeout(timer));
  window.addEventListener("pageshow", (event) => {if (event.persisted) refresh({quiet: true});});
  document.addEventListener("visibilitychange", () => {if (document.hidden) clearTimeout(timer); else refresh({quiet: true});});
  window.AISecEdu?.jobProgress?.subscribeJobRetries(() => {pages.clear(); refresh({quiet: true});});
  syncControls();
  refresh();
})();

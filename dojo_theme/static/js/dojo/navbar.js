(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const descriptionToggle = document.getElementById("show_description");
    const description = document.getElementById("dropdown-description");
    if (descriptionToggle && description) {
      descriptionToggle.addEventListener("click", event => {
        event.stopPropagation();
        description.hidden = !description.hidden;
      });
      description.addEventListener("click", event => event.stopPropagation());
    }

    const navToggle = document.getElementById("product-nav-toggle");
    const navPanel = document.getElementById("product-nav");
    const accountToggle = document.getElementById("product-account-toggle");
    const accountMenu = document.getElementById("product-account-menu");

    function setNavigationOpen(open) {
      if (!navToggle || !navPanel) return;
      navPanel.classList.toggle("show", open);
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "收起主导航" : "展开主导航");
    }

    function setAccountOpen(open) {
      if (!accountToggle || !accountMenu) return;
      accountMenu.classList.toggle("show", open);
      accountToggle.setAttribute("aria-expanded", String(open));
    }

    navToggle?.addEventListener("click", () => {
      setNavigationOpen(!navPanel.classList.contains("show"));
    });
    accountToggle?.addEventListener("click", event => {
      event.stopPropagation();
      setAccountOpen(!accountMenu.classList.contains("show"));
    });
    document.addEventListener("click", event => {
      if (accountMenu && !event.target.closest(".product-account-menu")) {
        setAccountOpen(false);
      }
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 992) setNavigationOpen(false);
    });

    const taskEntry = document.getElementById("global-teaching-tasks");
    const taskCount = document.getElementById("global-teaching-task-count");
    const taskCacheKey = "aisecedu-teaching-task-summary-v1";
    const taskFreshnessMs = 30000;
    let lastTaskRefresh = 0;
    let taskRefreshPromise = null;

    function applyTeachingTaskCount(running) {
      if (!taskEntry || !taskCount) return;
      const count = Number(running?.jobs || 0) + Number(running?.tasksRequiringAction || 0);
      taskCount.textContent = count > 99 ? "99+" : String(count);
      taskCount.hidden = count === 0;
      taskEntry.setAttribute("aria-label", count ? `打开任务中心，${count} 项需要关注` : "打开任务中心，当前没有待处理任务");
    }

    function readCachedTaskCount() {
      try {
        const cached = JSON.parse(window.sessionStorage.getItem(taskCacheKey) || "null");
        if (!cached || !cached.running || Date.now() - Number(cached.at || 0) > taskFreshnessMs) return false;
        lastTaskRefresh = Number(cached.at || 0);
        applyTeachingTaskCount(cached.running);
        return true;
      } catch (error) {
        return false;
      }
    }

    async function refreshTeachingTaskCount(force) {
      if (!taskEntry || !taskCount || document.hidden) return;
      if (!force && Date.now() - lastTaskRefresh < taskFreshnessMs) return;
      if (taskRefreshPromise) return taskRefreshPromise;
      taskRefreshPromise = (async () => {
      try {
        const data = window.AISecEdu
          ? await window.AISecEdu.get(
              `/ui/bootstrap?view=navigation&path=${encodeURIComponent(window.location.pathname)}`,
              {
                cacheTtlMs: 15000,
                dedupeKey: "ui-bootstrap-navigation",
                timeoutMs: 7000,
              },
            )
          : null;
        if (!data) throw new Error("任务状态不可用");
        const running = data.running || {};
        lastTaskRefresh = Date.now();
        applyTeachingTaskCount(running);
        try {
          window.sessionStorage.setItem(taskCacheKey, JSON.stringify({at: lastTaskRefresh, running}));
        } catch (error) {
          /* storage can be disabled */
        }
      } catch (error) {
        if (!lastTaskRefresh) {
          taskCount.hidden = true;
          taskEntry.setAttribute("aria-label", "打开任务中心");
        }
      } finally {
        taskRefreshPromise = null;
      }
      })();
      return taskRefreshPromise;
    }

    const embeddedRunning = window.AISecEdu?.product?.running;
    if (embeddedRunning) {
      lastTaskRefresh = Date.now();
      applyTeachingTaskCount(embeddedRunning);
    } else {
      readCachedTaskCount();
    }
    const scheduleTaskRefresh = () => {
      const run = () => void refreshTeachingTaskCount(false);
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, {timeout: 2500});
      } else {
        window.setTimeout(run, 1200);
      }
    };
    // The teaching workbench already loads the complete task collection and
    // emits `aisecedu:teaching-task-state`.  A second bootstrap request here
    // races that event and duplicates work on every fresh navigation.
    if (!document.getElementById("teacher-agent")) {
      if (document.readyState === "complete") scheduleTaskRefresh();
      else window.addEventListener("load", scheduleTaskRefresh, {once: true});
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - lastTaskRefresh >= taskFreshnessMs) {
        void refreshTeachingTaskCount(true);
      }
    });
    document.addEventListener("aisecedu:teaching-task-state", event => {
      if (!event.detail) return;
      lastTaskRefresh = Date.now();
      applyTeachingTaskCount(event.detail);
    });

    const trigger = document.getElementById("global-search-trigger");
    const modal = document.getElementById("searchModal");
    const input = document.getElementById("searchInput");
    const results = document.getElementById("searchResults");
    if (!trigger || !modal || !input || !results) return;

    let activeIndex = -1;
    let resultItems = [];
    let lastInputMethod = "keyboard";
    let requestController = null;
    let debounceTimer = null;

    function openSearch(returnFocus) {
      window.AISecEdu?.dialog?.open(modal, returnFocus || trigger);
      input.setAttribute("aria-expanded", "true");
      window.setTimeout(() => input.focus(), 0);
    }

    function closeSearch() {
      window.AISecEdu?.dialog?.close(modal);
      input.setAttribute("aria-expanded", "false");
    }

    function clearResults() {
      activeIndex = -1;
      resultItems = [];
      results.replaceChildren();
    }

    function setActiveResult(index, shouldScroll) {
      if (!resultItems.length) return;
      activeIndex = Math.max(0, Math.min(index, resultItems.length - 1));
      resultItems.forEach((item, itemIndex) => {
        const active = itemIndex === activeIndex;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (shouldScroll) resultItems[activeIndex].scrollIntoView({ block: "nearest" });
    }

    function renderSkeleton() {
      clearResults();
      for (let index = 0; index < 3; index += 1) {
        const skeleton = document.createElement("div");
        skeleton.className = "product-search-skeleton";
        results.appendChild(skeleton);
      }
    }

    function escapeRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function buildSnippet(text, query, context) {
      if (!text) return null;
      const source = String(text);
      const matchIndex = source.toLowerCase().indexOf(query.toLowerCase());
      if (matchIndex === -1) return null;
      const start = Math.max(matchIndex - context, 0);
      const end = Math.min(matchIndex + query.length + context, source.length);
      const excerpt = source.slice(start, end);
      const snippet = document.createElement("small");
      snippet.className = "product-search-snippet";
      if (start > 0) snippet.appendChild(document.createTextNode("…"));
      const pattern = new RegExp(escapeRegExp(query), "gi");
      let cursor = 0;
      excerpt.replace(pattern, (match, offset) => {
        if (offset > cursor) snippet.appendChild(document.createTextNode(excerpt.slice(cursor, offset)));
        const highlight = document.createElement("mark");
        highlight.textContent = match;
        snippet.appendChild(highlight);
        cursor = offset + match.length;
        return match;
      });
      if (cursor < excerpt.length) snippet.appendChild(document.createTextNode(excerpt.slice(cursor)));
      if (end < source.length) snippet.appendChild(document.createTextNode("…"));
      return snippet;
    }

    function createResult(data, query) {
      const title = data.name || "未命名内容";
      const url = data.link || "/student";
      const description = data.description || "";
      const item = document.createElement("div");
      item.className = "product-search-result";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      const link = document.createElement("a");
      link.href = url;
      link.textContent = title;
      item.appendChild(link);
      const context = [data.kind, data.context].filter(Boolean).join(" · ");
      if (context) {
        const contextLine = document.createElement("small");
        contextLine.className = "product-search-context";
        contextLine.textContent = context;
        item.appendChild(contextLine);
      }
      if (!title.toLowerCase().includes(query.toLowerCase())) {
        const snippet = buildSnippet(description, query, 42);
        if (snippet) item.appendChild(snippet);
      }
      item.addEventListener("mouseenter", () => {
        if (lastInputMethod === "mouse") setActiveResult(resultItems.indexOf(item), false);
      });
      return item;
    }

    function renderSection(label, items) {
      if (!items.length) return;
      const heading = document.createElement("div");
      heading.className = "product-search-section";
      heading.textContent = label;
      results.appendChild(heading);
      items.forEach(item => {
        results.appendChild(item);
        resultItems.push(item);
      });
    }

    async function search() {
      const query = input.value.trim();
      if (query.length < 2) {
        if (requestController) requestController.abort();
        clearResults();
        return;
      }
      if (requestController) requestController.abort();
      requestController = new AbortController();
      renderSkeleton();
      try {
        const payload = await window.AISecEdu.get(
          `/search?q=${encodeURIComponent(query)}`,
          {
            signal: requestController.signal,
            unwrap: false,
            timeoutMs: 8000,
            retries: 1,
            latestKey: "global-search",
          },
        );
        if (!payload?.success) throw new Error("搜索暂时不可用");
        clearResults();
        const data = payload.results || {};
        renderSection("最近", (data.recent || []).map(item => createResult(item, query)));
        renderSection("我的课程", (data.courses || data.dojos || []).map(item => createResult(item, query)));
        renderSection("章节与题目", (data.content || []).map(item => createResult(item, query)));
        renderSection("作业", (data.assignments || []).map(item => createResult(item, query)));
        renderSection("我的创作", (data.creations || []).map(item => createResult(item, query)));
        if (!resultItems.length) {
          const empty = document.createElement("div");
          empty.className = "product-search-empty";
          const message = document.createElement("p");
          message.textContent = "没有找到匹配的学习内容。你可以换一个关键词，或从课程目录继续。";
          const actions = document.createElement("div");
          actions.className = "product-search-empty-actions";
          [["浏览课程", "/dojos"], ["询问 AI 学习助手", "/guide"]].forEach(([label, href]) => {
            const action = document.createElement("a");
            action.href = href;
            action.textContent = label;
            actions.appendChild(action);
          });
          empty.append(message, actions);
          results.appendChild(empty);
        }
      } catch (error) {
        if (error.name === "AbortError" || ["REQUEST_ABORTED", "STALE_RESPONSE"].includes(error.code)) return;
        clearResults();
        const failure = document.createElement("div");
        failure.className = "product-search-empty";
        failure.textContent = error.message || "搜索暂时不可用。";
        results.appendChild(failure);
      }
    }

    trigger.addEventListener("click", event => {
      event.preventDefault();
      openSearch(trigger);
    });
    document.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "k") {
        event.preventDefault();
        openSearch(trigger);
      } else if (event.key === "Escape" && !modal.hidden) {
        event.preventDefault();
        closeSearch();
      } else if (event.key === "Escape") {
        setAccountOpen(false);
        setNavigationOpen(false);
      }
    });
    input.addEventListener("input", () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(search, 180);
    });
    document.addEventListener("mousemove", () => { lastInputMethod = "mouse"; });
    input.addEventListener("keydown", event => {
      lastInputMethod = "keyboard";
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveResult(activeIndex + 1, true);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveResult(activeIndex <= 0 ? resultItems.length - 1 : activeIndex - 1, true);
      } else if (event.key === "Enter" && resultItems.length) {
        event.preventDefault();
        const selected = resultItems[activeIndex < 0 ? 0 : activeIndex].querySelector("a");
        if (selected) window.location.assign(selected.href);
      }
    });
    modal.addEventListener("aisecedu:dialog-close", () => {
      if (requestController) requestController.abort();
      input.value = "";
      clearResults();
      trigger.focus();
    });
  });
})();

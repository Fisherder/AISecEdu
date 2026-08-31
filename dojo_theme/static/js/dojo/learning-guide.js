(function () {
  "use strict";
  var bootAttempts = 0;

  function boot() {
    var root = document.getElementById("teacher-agent");
    if (!root || root.dataset.role !== "student" || root.dataset.agentReady === "true") return;
    if (!window.DojoLearning) {
      if (bootAttempts++ < 100) window.setTimeout(boot, 50);
      return;
    }
    root.dataset.agentReady = "true";
    var api = window.DojoLearning;
    var byId = function (id) { return document.getElementById(id); };
    var el = {
      sidebar: byId("teaching-sidebar"), sidebarOverlay: byId("teaching-sidebar-overlay"),
      sidebarToggle: byId("teaching-sidebar-toggle"), sidebarCollapse: byId("teaching-sidebar-collapse"),
      newThread: byId("teaching-new-thread"), search: byId("teaching-thread-search"),
      threads: byId("teaching-thread-list"), menu: byId("teaching-thread-action-menu"),
      pinLabel: byId("teaching-pin-label"), archivedToggle: byId("student-archived-toggle"),
      title: byId("teaching-thread-title"), notice: byId("teaching-notice"),
      conversation: root.querySelector(".teaching-conversation"),
      messages: byId("teaching-messages"), jump: byId("teaching-jump-latest"),
      prompts: root.querySelector(".teaching-quick-prompts"),
      archivedBanner: byId("teaching-archived-banner"), restore: byId("teaching-restore-thread"),
      input: byId("teaching-input"), send: byId("teaching-send"),
      drawerOpen: byId("teaching-drawer-open"), drawer: byId("teaching-drawer"),
      drawerOverlay: byId("teaching-drawer-overlay"), drawerClose: byId("teaching-drawer-close"),
      drawerTitle: byId("teaching-drawer-title"), drawerSubtitle: byId("teaching-drawer-subtitle"),
      refresh: byId("teaching-refresh"), taskCount: byId("teaching-task-count"),
      jobs: byId("teaching-job-list"), refSummary: byId("student-reference-summary"),
      refTrigger: byId("student-reference-trigger"), refCount: byId("student-reference-count"),
      refDialog: byId("student-reference-dialog"), refClose: byId("student-reference-close"),
      refDone: byId("student-reference-done"), refSearch: byId("student-reference-search"),
      refOptions: byId("student-reference-options"), refSelection: byId("student-reference-selection")
    };
    if (!el.threads || !el.messages || !el.input || !el.send) return;

    var state = {
      threads: [], thread: null, messages: [], profile: {}, workspace: {},
      references: [], selected: new Map(), busy: false, view: "active",
      query: "", menuId: null, sequence: 0, searchTimer: null,
      sidebarReturnFocus: null, drawerReturnFocus: null,
      resourceCache: new Map(), resourceInflight: new Map()
    };
    var initialParams = new URLSearchParams(window.location.search);
    var initialThread = initialParams.get("thread");
    var initialReference = {
      courseId: initialParams.get("course"),
      moduleId: initialParams.get("module"),
      challengeId: initialParams.get("challenge")
    };
    var initialReferenceApplied = false;
    var esc = function (value) { return api.escapeHtml(value); };
    var notice = function (message, kind) { api.showNotice(el.notice, message, kind || "info"); };

    function timeLabel(value) {
      var date = new Date(value || 0);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString("zh-CN", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false});
    }

    function rich(value) {
      return String(value || "").split(String.fromCharCode(96, 96, 96)).map(function (chunk, index) {
        var safe = esc(chunk);
        if (index % 2) {
          var newline = safe.indexOf("\n");
          return "<pre><code>" + (newline >= 0 ? safe.slice(newline + 1) : safe) + "</code></pre>";
        }
        return safe.replace(/^### (.+)$/gm, "<h4>$1</h4>")
          .replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^# (.+)$/gm, "<h2>$1</h2>")
          .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
          .replace(new RegExp("\\x60([^\\x60\\n]+)\\x60", "g"), "<code>$1</code>")
          .replace(/^\s*[-*] (.+)$/gm, "<span class=\"student-answer-list-item\"><i></i>$1</span>")
          .replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>");
      }).join("");
    }

    function refLabel(item) { return item.exercise || item.challengeId || item.id || "题目"; }

    function refChips(metadata) {
      var rows = Array.isArray(metadata && metadata.references) ? metadata.references : [];
      if (!rows.length) return "";
      return "<div class=\"student-message-scope\"><span><i class=\"fas fa-shield-alt\"></i>仅依据本对话引用</span>" +
        rows.map(function (item) {
          return "<b title=\"" + esc((item.course || "") + " · " + (item.unit || "")) + "\"><i class=\"fas fa-paperclip\"></i>" + esc(refLabel(item)) + "</b>";
        }).join("") + "</div>";
    }

    function actionCards(metadata) {
      var rows = [];
      if (metadata && Array.isArray(metadata.agentActions)) rows = rows.concat(metadata.agentActions);
      if (metadata && Array.isArray(metadata.actions)) rows = rows.concat(metadata.actions.filter(function (item) {
        return item && item.url;
      }));
      var references = Array.isArray(metadata && metadata.references) ? metadata.references : [];
      var seen = new Set();
      rows = rows.filter(function (item) {
        var key = String(item && (item.id || item.url || item.title || item.label) || "");
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
      });
      if (!rows.length) return "";
      return "<div class=\"student-agent-actions\">" + rows.map(function (item, index) {
        var title = item.title || item.label || "打开结果";
        var icon = item.type === "workspace" ? "fa-cube" : item.type === "memory" ? "fa-brain" : "fa-arrow-right";
        var inferred = references.find(function (reference) {
          return reference && reference.url && String(reference.url) === String(item.url || "");
        });
        var reference = item.resourceRef || (inferred && inferred.id ? {objectType: "challenge", objectId: inferred.id} : {});
        var body = "<span class=\"teaching-card-icon\"><i class=\"fas " + icon + "\"></i></span>" +
          "<span class=\"card-copy\"><strong>" + esc(title) + "</strong><small>" + esc(item.description || item.why || (item.url ? "在学习空间中继续" : "操作已完成")) + "</small></span>" +
          "<span class=\"card-action\">" + (item.url ? "正在确认…" : "<i class=\"fas fa-check\"></i>完成") + "</span>";
        if (!item.url) return "<div class=\"conversation-card is-static\">" + body + "</div>";
        return "<div class=\"conversation-card is-resolving\" data-resource-action data-resource-key=\"" + esc(String(index)) + "\" data-object-type=\"" + esc(reference.objectType || item.type || "link") + "\" data-object-id=\"" + esc(reference.objectId || item.id || "") + "\" data-cached-url=\"" + esc(item.url) + "\" aria-busy=\"true\">" + body + "</div>";
      }).join("") + "</div>";
    }

    function resourceTelemetry(objectType, status, recoveryUsed) {
      api.json("POST", "/learning/telemetry", {
        event: "resource_action_resolved",
        properties: {objectType: objectType, status: status, recoveryUsed: Boolean(recoveryUsed)}
      }).catch(function () {});
    }

    function resourceNodeKey(node) {
      return [node.dataset.objectType || "link", node.dataset.objectId || "", node.dataset.cachedUrl || ""].join("\u001f");
    }

    function unavailableCopy(status) {
      var copy = {
        ARCHIVED: ["内容已归档", "这项内容已进入历史记录，可从个人学习内容中查找。"],
        DELETED: ["内容已移除", "原内容已经删除，可从课程中选择当前可用的学习内容。"],
        FORBIDDEN: ["当前无法访问", "当前账号或课程状态不允许打开这项内容。"],
        INVALID: ["旧版入口已失效", "入口格式已更新，系统不会跳转到未经确认的位置。"],
        UNRESOLVED: ["暂时无法确认入口", "内容可能仍然存在，可以重新确认或从学习首页继续。"]
      };
      return copy[status] || copy.UNRESOLVED;
    }

    function applyResourceResolution(node, item, report) {
      if (!node || !node.isConnected) return;
      var available = item.status === "AVAILABLE" || item.status === "MOVED";
      var destination = available ? item.href : item.recovery && item.recovery.href;
      var link = document.createElement(destination ? "a" : "div");
      link.className = "conversation-card " + (available ? "is-available" : "is-unavailable");
      link.dataset.resourceStatus = String(item.status || "UNRESOLVED").toLowerCase();
      if (destination) link.href = destination;
      link.innerHTML = node.innerHTML;
      link.removeAttribute("aria-busy");
      var copy = link.querySelector(".card-copy");
      var action = link.querySelector(".card-action");
      if (available) {
        action.innerHTML = (item.status === "MOVED" ? "打开新位置" : "打开") + '<i class="fas fa-arrow-right"></i>';
      } else {
        var statusCopy = unavailableCopy(item.status);
        copy.querySelector("strong").textContent = statusCopy[0];
        copy.querySelector("small").textContent = statusCopy[1];
        action.innerHTML = esc(item.recovery && item.recovery.label || "返回学习首页") + '<i class="fas fa-arrow-right"></i>';
      }
      if (destination) link.addEventListener("click", function () {
        resourceTelemetry(item.objectType, item.status, !available);
      });
      node.replaceWith(link);
      if (report) resourceTelemetry(item.objectType, item.status, false);
    }

    function markResourceRetry(node, cacheKey) {
      if (!node || !node.isConnected) return;
      node.classList.remove("is-resolving", "is-unavailable");
      node.classList.add("is-retryable");
      node.removeAttribute("aria-busy");
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.querySelector(".card-copy strong").textContent = "连接暂时中断";
      node.querySelector(".card-copy small").textContent = "没有判定内容失效；点击可重新确认入口。";
      node.querySelector(".card-action").innerHTML = '重新确认<i class="fas fa-redo-alt"></i>';
      var retry = function (event) {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        state.resourceCache.delete(cacheKey);
        node.classList.remove("is-retryable");
        node.classList.add("is-resolving");
        node.setAttribute("aria-busy", "true");
        node.removeAttribute("role");
        node.removeAttribute("tabindex");
        resolveActionCards([node], true);
      };
      node.addEventListener("click", retry);
      node.addEventListener("keydown", retry);
    }

    function attachResourceResolution(node, cacheKey, promise, report) {
      promise.then(function (item) {
        applyResourceResolution(node, item, report);
      }).catch(function () {
        markResourceRetry(node, cacheKey);
      });
    }

    function resolveActionCards(targetNodes, force) {
      var nodes = Array.isArray(targetNodes) ? targetNodes : Array.from(el.messages.querySelectorAll("[data-resource-action]"));
      if (!nodes.length) return;
      var now = Date.now();
      var groups = new Map();
      nodes.forEach(function (node) {
        var cacheKey = resourceNodeKey(node);
        if (force) state.resourceCache.delete(cacheKey);
        var cached = state.resourceCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          applyResourceResolution(node, cached.value, false);
          return;
        }
        if (cached) state.resourceCache.delete(cacheKey);
        var inflight = state.resourceInflight.get(cacheKey);
        if (inflight) {
          attachResourceResolution(node, cacheKey, inflight, false);
          return;
        }
        if (!groups.has(cacheKey)) {
          groups.set(cacheKey, {
            cacheKey: cacheKey,
            nodes: [],
            resource: {
              objectType: node.dataset.objectType,
              objectId: node.dataset.objectId,
              url: node.dataset.cachedUrl
            }
          });
        }
        groups.get(cacheKey).nodes.push(node);
      });
      var pending = Array.from(groups.values());
      if (!pending.length) return;
      pending.forEach(function (group) {
        group.promise = new Promise(function (resolve, reject) {
          group.resolve = resolve; group.reject = reject;
        });
        state.resourceInflight.set(group.cacheKey, group.promise);
        group.nodes.forEach(function (node) {
          attachResourceResolution(node, group.cacheKey, group.promise, true);
        });
      });
      var resources = pending.map(function (group, index) {
        return Object.assign({key: String(index)}, group.resource);
      });
      api.json("POST", "/learning/resources/resolve", {resources: resources}).then(function (payload) {
        var resolved = payload && payload.success ? (payload.data && payload.data.resources || []) : [];
        pending.forEach(function (group, index) {
          var item = resolved.find(function (row) { return String(row.key) === String(index); });
          if (!item) {
            group.reject(new Error("resource result missing"));
            return;
          }
          state.resourceCache.set(group.cacheKey, {value: item, expiresAt: Date.now() + 90000});
          group.resolve(item);
        });
      }).catch(function (error) {
        pending.forEach(function (group) { group.reject(error); });
      }).finally(function () {
        pending.forEach(function (group) {
          if (state.resourceInflight.get(group.cacheKey) === group.promise) state.resourceInflight.delete(group.cacheKey);
        });
      });
    }

    function profileMarkup() {
      var summary = state.profile.summary || {};
      var weak = (state.profile.weakestSkills || []).filter(function (item) {
        return item.masteryState && item.masteryState.state !== "UNKNOWN" && Number(item.evidenceCount);
      });
      var active = state.profile.activeAttempt;
      var mastery = summary.averageMastery == null ? "尚无证据" : Math.round(Number(summary.averageMastery)) + "%";
      return "<div class=\"student-agent-overview\"><span><i class=\"fas fa-book-open\"></i><strong>" + esc(summary.enrolledCourses || 0) + "</strong><small>门课程</small></span>" +
        "<span><i class=\"fas fa-check-circle\"></i><strong>" + esc(summary.completedExercises || 0) + "</strong><small>题已完成</small></span>" +
        "<span><i class=\"fas fa-chart-line\"></i><strong>" + esc(mastery) + "</strong><small>能力掌握</small></span>" +
        (weak[0] ? "<span><i class=\"fas fa-bullseye\"></i><strong>" + esc(weak[0].label) + "</strong><small>优先补强</small></span>" : "") +
        (active ? "<a href=\"" + esc(active.url || "/workspace") + "\"><i class=\"fas fa-play\"></i><strong>" + esc(active.exercise || active.title || "当前练习") + "</strong><small>继续练习</small></a>" : "") + "</div>";
    }

    function emptyMarkup() {
      return "<div class=\"teaching-empty student-agent-empty\"><span class=\"teaching-empty-eyebrow\">AI 学习助手</span>" +
        "<h2>直接说出你想推进的学习</h2><p>规划、提问、复盘、创建个人练习或继续课程任务，都在同一段对话里完成。智能体只使用你的课程范围和个人学习证据。</p>" +
        profileMarkup() + "<div class=\"teaching-empty-capabilities\"><span><i class=\"fas fa-check\"></i>理解课程与学习上下文</span>" +
        "<span><i class=\"fas fa-check\"></i>调用学生安全工具</span><span><i class=\"fas fa-shield-alt\"></i>不读取他人和教师私有数据</span></div></div>";
    }

    function userMarkup(message) {
      return "<article class=\"teaching-message is-user\" data-message-id=\"" + esc(message.id || "") + "\"><div class=\"teaching-message-body\">" +
        "<span class=\"teaching-message-label\">你的要求</span>" + refChips(message.metadata || {}) +
        "<div class=\"teaching-message-copy\">" + esc(message.content || "").replace(/\n/g, "<br>") + "</div>" +
        "<div class=\"teaching-message-meta\"><time>" + esc(timeLabel(message.created)) + "</time><span class=\"teaching-message-tools\">" +
        "<button type=\"button\" data-reuse=\"" + esc(message.id || "") + "\" title=\"再次编辑\"><i class=\"fas fa-pen\"></i></button></span></div></div>" +
        "<div class=\"teaching-message-avatar\"><i class=\"fas fa-user\"></i></div></article>";
    }

    function assistantMarkup(message) {
      var metadata = message.metadata || {};
      var errors = Array.isArray(metadata.toolErrors) ? metadata.toolErrors : [];
      return "<article class=\"teaching-message is-assistant is-answer\" data-message-id=\"" + esc(message.id || "") + "\">" +
        "<div class=\"teaching-message-avatar\"><i class=\"fas fa-magic\"></i></div><div class=\"teaching-message-body\"><section class=\"teaching-answer-surface\">" +
        refChips(metadata) + "<div class=\"teaching-answer-content\"><p>" + rich(message.content || "") + "</p></div>" +
        (errors.length ? "<div class=\"student-agent-tool-warning\"><i class=\"fas fa-exclamation-triangle\"></i><span>部分学习工具未能执行：" + esc(errors.join("；")) + "</span></div>" : "") +
        actionCards(metadata) + "</section><div class=\"teaching-message-meta\"><time>" + esc(timeLabel(message.created)) + "</time>" +
        "<span class=\"teaching-message-tools\"><button type=\"button\" data-copy=\"" + esc(message.id || "") + "\" title=\"复制内容\"><i class=\"far fa-copy\"></i></button></span></div></div></article>";
    }

    function renderMessages() {
      var near = el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 120;
      var thinking = "<article class=\"teaching-message is-assistant is-activity student-agent-thinking\"><div class=\"teaching-message-avatar\"><i class=\"fas fa-circle-notch fa-spin\"></i></div>" +
        "<div class=\"teaching-message-body\"><div class=\"teaching-activity-line\"><span class=\"teaching-activity-copy\"><strong>正在理解要求并选择学习工具</strong>" +
        "<small>读取当前课程范围与个人学习证据</small></span></div></div></article>";
      el.messages.innerHTML = (state.messages.length ? state.messages.map(function (message) {
        return message.role === "assistant" ? assistantMarkup(message) : userMarkup(message);
      }).join("") : emptyMarkup()) + (state.busy ? thinking : "");
      el.messages.setAttribute("aria-busy", state.busy ? "true" : "false");
      resolveActionCards();
      el.messages.querySelectorAll("[data-copy]").forEach(function (button) {
        button.addEventListener("click", function () {
          var item = state.messages.find(function (message) { return String(message.id) === String(button.dataset.copy); });
          if (item && navigator.clipboard) navigator.clipboard.writeText(item.content || "");
          notice("内容已复制。", "success");
        });
      });
      el.messages.querySelectorAll("[data-reuse]").forEach(function (button) {
        button.addEventListener("click", function () {
          var item = state.messages.find(function (message) { return String(message.id) === String(button.dataset.reuse); });
          if (!item) return;
          el.input.value = item.content || ""; resizeInput(); el.input.focus();
        });
      });
      if (near || state.busy) window.requestAnimationFrame(function () {
        el.messages.scrollTo({top: el.messages.scrollHeight, behavior: "auto"}); el.jump.hidden = true;
      });
    }

    function threadGroup(item) {
      if (item.pinned && item.status !== "ARCHIVED") return "置顶";
      var date = new Date(item.updated || item.created || 0);
      if (Number.isNaN(date.getTime())) return "更早";
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var day = new Date(date); day.setHours(0, 0, 0, 0);
      var distance = Math.floor((today.getTime() - day.getTime()) / 86400000);
      if (distance <= 0) return "今天";
      if (distance === 1) return "昨天";
      if (distance < 7) return "过去 7 天";
      if (distance < 30) return "过去 30 天";
      return "更早";
    }

    function threadTime(item) {
      var date = new Date(item.updated || item.created || 0);
      if (Number.isNaN(date.getTime())) return "";
      return ["今天", "昨天"].indexOf(threadGroup(item)) >= 0 ?
        date.toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit", hour12: false}) :
        date.toLocaleDateString("zh-CN", {month: "numeric", day: "numeric"});
    }

    function threadMarkup(item) {
      var active = state.thread && String(state.thread.id) === String(item.id);
      var preview = item.latestMessage || (item.messageCount ? item.messageCount + " 条消息" : "空对话");
      return "<article class=\"teaching-thread-item " + (active ? "is-active" : "") + "\" role=\"option\" aria-selected=\"" + String(Boolean(active)) + "\">" +
        "<button type=\"button\" class=\"teaching-thread-open\" data-thread-open=\"" + esc(item.id) + "\" title=\"" + esc(item.title) + "\">" +
        "<span class=\"teaching-thread-item-title\">" + (item.pinned ? "<i class=\"fas fa-thumbtack\"></i>" : "") + "<strong>" + esc(item.title) + "</strong></span>" +
        "<small>" + esc(preview) + "</small><time>" + esc(threadTime(item)) + "</time></button>" +
        "<button type=\"button\" class=\"teaching-thread-more\" data-thread-menu=\"" + esc(item.id) + "\" aria-label=\"更多操作\" aria-haspopup=\"menu\" aria-expanded=\"false\">" +
        "<i class=\"fas fa-ellipsis-h\"></i></button></article>";
    }

    function renderThreads() {
      if (!state.threads.length) {
        el.threads.innerHTML = "<div class=\"teaching-thread-empty\"><i class=\"fas " + (state.query ? "fa-search" : state.view === "archived" ? "fa-archive" : "fa-comment-alt") + "\"></i>" +
          "<strong>" + (state.query ? "没有找到相关对话" : state.view === "archived" ? "没有已归档对话" : "还没有对话") + "</strong>" +
          "<small>" + (state.query ? "试试其他关键词" : state.view === "archived" ? "归档的对话会显示在这里" : "新建对话开始学习") + "</small></div>";
      } else {
        var order = state.view === "archived" ? ["今天", "昨天", "过去 7 天", "过去 30 天", "更早"] : ["置顶", "今天", "昨天", "过去 7 天", "过去 30 天", "更早"];
        var grouped = new Map();
        state.threads.forEach(function (item) {
          var key = threadGroup(item); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item);
        });
        el.threads.innerHTML = order.filter(function (key) { return grouped.has(key); }).map(function (key) {
          return "<section class=\"teaching-thread-group\"><h2>" + key + "</h2>" + grouped.get(key).map(threadMarkup).join("") + "</section>";
        }).join("");
      }
      el.threads.querySelectorAll("[data-thread-open]").forEach(function (button) {
        button.addEventListener("click", function () { load(button.dataset.threadOpen); setSidebar(false); });
      });
      el.threads.querySelectorAll("[data-thread-menu]").forEach(function (button) {
        button.addEventListener("click", function (event) { event.stopPropagation(); openMenu(button.dataset.threadMenu, button); });
      });
      el.archivedToggle.classList.toggle("is-active", state.view === "archived");
      el.archivedToggle.querySelector("span").textContent = state.view === "archived" ? "返回当前对话" : "已归档对话";
    }

    function closeMenu() {
      el.menu.hidden = true; el.menu.setAttribute("aria-hidden", "true");
      document.querySelectorAll("[data-thread-menu]").forEach(function (button) { button.setAttribute("aria-expanded", "false"); });
      state.menuId = null;
    }

    function openMenu(id, anchor) {
      var item = state.threads.find(function (row) { return String(row.id) === String(id); });
      if (!item) return;
      closeMenu(); state.menuId = item.id;
      var archived = item.status === "ARCHIVED";
      el.menu.querySelector("[data-thread-action=\"pin\"]").hidden = archived;
      el.menu.querySelector("[data-thread-action=\"archive\"]").hidden = archived;
      el.menu.querySelector("[data-thread-action=\"restore\"]").hidden = !archived;
      el.pinLabel.textContent = item.pinned ? "取消置顶" : "置顶";
      el.menu.hidden = false; el.menu.setAttribute("aria-hidden", "false"); anchor.setAttribute("aria-expanded", "true");
      var rect = anchor.getBoundingClientRect(); var menuRect = el.menu.getBoundingClientRect();
      el.menu.style.left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width)) + "px";
      el.menu.style.top = (rect.bottom + menuRect.height + 8 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - menuRect.height - 6)) + "px";
    }

    var promptDialog = function (message, options) {
      return window.AISecEduUI && window.AISecEduUI.prompt ? window.AISecEduUI.prompt(message, options || {}) :
        Promise.resolve(null);
    };
    var confirmDialog = function (message, options) {
      return window.AISecEduUI && window.AISecEduUI.confirm ? window.AISecEduUI.confirm(message, options || {}) : Promise.resolve(false);
    };

    async function patchThread(item, action, extra) {
      return api.json("PATCH", "/learning/guide/threads/" + encodeURIComponent(item.id), Object.assign({action: action}, extra || {}));
    }

    async function threadAction(action) {
      var item = state.threads.find(function (row) { return String(row.id) === String(state.menuId); });
      closeMenu(); if (!item) return;
      try {
        if (action === "rename") {
          var entered = await promptDialog("为这段对话设置一个便于查找的名称。", {title: "重命名对话", inputLabel: "对话名称", value: item.title, maxLength: 160, confirmLabel: "保存"});
          var title = String(entered || "").trim();
          if (!title || title === item.title) return;
          await patchThread(item, "rename", {title: title}); await load(item.id);
        } else if (action === "pin") {
          await patchThread(item, item.pinned ? "unpin" : "pin"); await load(item.id);
        } else if (action === "archive") {
          await patchThread(item, "archive"); state.thread = null; await load(null); notice("对话已归档，可从左下角恢复。", "success");
        } else if (action === "restore") {
          await patchThread(item, "restore"); state.view = "active"; await load(item.id); notice("对话已恢复。", "success");
        } else if (action === "delete") {
          var confirmed = await confirmDialog("永久删除“" + item.title + "”？消息和题目引用将无法恢复。", {title: "删除对话", confirmLabel: "永久删除", confirmStyle: "danger"});
          if (!confirmed) return;
          await api.json("DELETE", "/learning/guide/threads/" + encodeURIComponent(item.id), {});
          if (state.thread && String(state.thread.id) === String(item.id)) state.thread = null;
          await load(null); notice("对话已删除。", "success");
        }
      } catch (error) { notice(error.message || "无法完成对话操作。", "danger"); }
    }

    function renderReferenceSummary() {
      var rows = Array.from(state.selected.values());
      el.refSummary.hidden = rows.length === 0;
      el.refSummary.innerHTML = rows.map(function (item) {
        return "<span title=\"" + esc((item.course || "") + " · " + (item.unit || "")) + "\"><i class=\"fas fa-paperclip\"></i>" + esc(refLabel(item)) +
          "<button type=\"button\" data-remove-reference=\"" + esc(item.id) + "\"><i class=\"fas fa-times\"></i></button></span>";
      }).join("");
      el.refCount.hidden = rows.length === 0; el.refCount.textContent = String(rows.length);
      el.refSelection.textContent = rows.length ? "已选择 " + rows.length + " / 6 道题目" : "尚未选择题目";
    }

    function renderReferences() {
      var query = String(el.refSearch.value || "").trim().toLocaleLowerCase();
      var rows = state.references.filter(function (item) {
        return !query || [item.course, item.unit, item.exercise, item.id].some(function (value) {
          return String(value || "").toLocaleLowerCase().indexOf(query) >= 0;
        });
      }).slice(0, 100);
      el.refOptions.innerHTML = rows.length ? rows.map(function (item) {
        var selected = state.selected.has(item.id);
        var status = item.completed ? "已完成" : item.recentAttempts ? item.recentAttempts + " 次近期尝试" : "未尝试";
        return "<button type=\"button\" class=\"student-reference-option\" data-reference-id=\"" + esc(item.id) + "\" role=\"option\" aria-selected=\"" + String(selected) + "\">" +
          "<i class=\"" + (selected ? "fas fa-check-circle" : item.completed ? "fas fa-flag" : "far fa-circle") + "\"></i><span><strong>" + esc(refLabel(item)) + "</strong>" +
          "<small>" + esc(item.course || "课程") + " · " + esc(item.unit || "章节") + "</small></span><b>" + esc(status) + "</b></button>";
      }).join("") : "<div class=\"student-reference-empty\"><i class=\"fas fa-search\"></i><strong>没有匹配的题目</strong><small>换一个关键词试试</small></div>";
      renderReferenceSummary();
    }

    function toggleReference(id) {
      if (state.selected.has(id)) state.selected.delete(id);
      else {
        var item = state.references.find(function (row) { return String(row.id) === String(id); });
        if (!item) return;
        if (state.selected.size >= 6) { notice("每个对话最多引用 6 道题目。", "warning"); return; }
        state.selected.set(item.id, item);
      }
      renderReferences();
    }

    function openReferences() {
      if (state.busy) return;
      renderReferences(); el.refTrigger.setAttribute("aria-expanded", "true");
      if (typeof el.refDialog.showModal === "function") el.refDialog.showModal(); else el.refDialog.setAttribute("open", "");
      window.requestAnimationFrame(function () { el.refSearch.focus(); });
    }
    function closeReferences() {
      el.refTrigger.setAttribute("aria-expanded", "false");
      if (typeof el.refDialog.close === "function" && el.refDialog.open) el.refDialog.close(); else el.refDialog.removeAttribute("open");
      if (document.contains(el.refTrigger)) el.refTrigger.focus({preventScroll: true});
    }

    function resource(item, icon, fallback) {
      var labels = {
        ACTIVE: "进行中", APPROVED: "已通过", READY: "可查看", DRAFT: "草稿",
        PUBLISHED: "课程已发布", CLOSED: "已关闭", SUBMITTED: "已提交",
        GRADED: "已评分", HOMEWORK: "课后任务", QUIZ: "测验", PRACTICE: "练习",
        LAB: "实验", DEBATE: "讨论", "slide-deck": "课件", lecture: "课程资料"
      };
      var rawDetail = item.description || item.goal || item.status || item.kind || item.type || fallback;
      var detail = labels[String(rawDetail)] || rawDetail;
      var body = "<span><i class=\"fas " + icon + "\"></i></span><span><strong>" + esc(item.title || item.name || fallback) + "</strong>" +
        "<small>" + esc(detail) + "</small></span>";
      return item.url ? "<a class=\"student-drawer-item\" href=\"" + esc(item.url) + "\">" + body + "<i class=\"fas fa-chevron-right\"></i></a>" :
        "<div class=\"student-drawer-item\">" + body + "</div>";
    }

    function renderDrawer() {
      var workspace = state.workspace || {};
      var spaces = workspace.workspaces || [], assignments = workspace.assignments || [];
      var resources = [].concat(workspace.courseMaterials || [], workspace.publishedArtifacts || []);
      var memories = workspace.memory || [];
      var active = spaces.filter(function (item) { return String(item.status || "").toUpperCase() === "ACTIVE"; }).length;
      var total = spaces.length + assignments.length + resources.length;
      el.drawerTitle.textContent = "学习任务与资源";
      el.drawerSubtitle.textContent = active + " 项进行中 · " + assignments.length + " 项课程任务 · " + resources.length + " 项资源";
      el.taskCount.hidden = total === 0; el.taskCount.textContent = String(total);
      var groups = [];
      if (spaces.length) groups.push("<section class=\"student-drawer-group\"><h3>我的创作 <a href=\"/learning/extend\">全部</a></h3>" + spaces.slice(0, 8).map(function (item) { return resource(item, "fa-cube", "我的创作"); }).join("") + "</section>");
      if (assignments.length) groups.push("<section class=\"student-drawer-group\"><h3>课程任务 <a href=\"/student\">今天</a></h3>" + assignments.slice(0, 8).map(function (item) { return resource(item, "fa-clipboard-check", "课程任务"); }).join("") + "</section>");
      if (resources.length) groups.push("<section class=\"student-drawer-group\"><h3>课程资源 <a href=\"/dojos\">课程中心</a></h3>" + resources.slice(0, 10).map(function (item) {
        return resource(item, item.type === "slide-deck" ? "fa-file-powerpoint" : item.type === "lecture" ? "fa-play-circle" : "fa-book-open", "课程资源");
      }).join("") + "</section>");
      if (memories.length) groups.push("<section class=\"student-drawer-group\"><h3>智能体记忆 <small>由你控制</small></h3>" + memories.slice(0, 8).map(function (item) {
        return "<div class=\"student-drawer-item is-memory\"><span><i class=\"fas fa-brain\"></i></span><span><strong>" + esc(item.content) + "</strong><small>" + esc(item.category || "学习偏好") +
          "</small></span><button type=\"button\" data-forget-memory=\"" + esc(item.id) + "\"><i class=\"fas fa-times\"></i></button></div>";
      }).join("") + "</section>");
      el.jobs.innerHTML = groups.length ? groups.join("") : "<div class=\"teaching-job-empty\"><span><i class=\"far fa-check-circle\"></i></span><h3>当前没有待办任务</h3><p>让智能体规划练习、创建工作区或继续课程。</p></div>";
      el.jobs.querySelectorAll("[data-forget-memory]").forEach(function (button) {
        button.addEventListener("click", async function () {
          try {
            await api.json("DELETE", "/learning/guide/memory/" + encodeURIComponent(button.dataset.forgetMemory), {});
            await load(state.thread && state.thread.id); notice("这条记忆已删除。", "success");
          } catch (error) { notice(error.message || "无法删除记忆。", "danger"); }
        });
      });
    }

    function updateChrome() {
      var archived = Boolean(state.thread && state.thread.status === "ARCHIVED");
      el.title.textContent = state.thread ? state.thread.title : "AI 学习助手";
      el.archivedBanner.hidden = !archived; el.prompts.hidden = archived;
      el.input.disabled = state.busy || archived; el.refTrigger.disabled = state.busy || archived;
      el.send.disabled = state.busy || archived || !String(el.input.value || "").trim();
      renderReferenceSummary(); renderDrawer();
    }

    function setBusy(value) {
      state.busy = Boolean(value); root.setAttribute("aria-busy", state.busy ? "true" : "false");
      updateChrome(); renderMessages();
    }

    function applyResponse(response) {
      state.threads = response.threads || []; state.thread = response.thread || null;
      state.messages = state.thread ? state.thread.messages || [] : [];
      state.profile = response.profile || {}; state.workspace = response.workspace || {};
      state.references = response.referenceOptions || []; state.selected.clear();
      var ids = state.thread && Array.isArray(state.thread.referenceIds) ? state.thread.referenceIds : [];
      ids.forEach(function (id) {
        var item = state.references.find(function (row) { return String(row.id) === String(id); });
        if (item) state.selected.set(item.id, item);
      });
      if (!initialReferenceApplied && initialReference.challengeId) {
        var contextual = state.references.find(function (item) {
          return String(item.courseId || "") === String(initialReference.courseId || "")
            && String(item.moduleId || "") === String(initialReference.moduleId || "")
            && String(item.challengeId || "") === String(initialReference.challengeId || "");
        });
        if (contextual) state.selected.set(contextual.id, contextual);
        initialReferenceApplied = true;
      }
      var prompts = response.quickPrompts || [];
      el.prompts.querySelectorAll("[data-student-prompt]").forEach(function (button, index) { if (prompts[index]) button.dataset.studentPrompt = prompts[index]; });
      renderThreads(); renderReferences(); renderMessages(); updateChrome();
      window.history.replaceState({}, "", state.thread ? "/guide?thread=" + encodeURIComponent(state.thread.id) : "/guide");
    }

    async function load(id) {
      var sequence = ++state.sequence;
      var query = new URLSearchParams({view: state.view});
      if (id) query.set("threadId", id); if (state.query) query.set("q", state.query);
      root.setAttribute("aria-busy", "true");
      el.messages.setAttribute("aria-busy", "true");
      try {
        var response = await api.request("/learning/guide?" + query.toString());
        if (sequence !== state.sequence) return;
        if (!response.success) throw new Error(api.errorMessage(response, "无法加载智能体。"));
        applyResponse(response); notice("");
      } catch (error) { if (sequence === state.sequence) notice(error.message || "无法加载智能体。", "danger"); }
      finally {
        if (sequence === state.sequence) {
          root.setAttribute("aria-busy", "false");
          el.messages.setAttribute("aria-busy", state.busy ? "true" : "false");
        }
      }
    }

    async function createThread() {
      if (state.busy) return;
      setBusy(true);
      try {
        var response = await api.json("POST", "/learning/guide/threads", {});
        if (!response.success || !response.thread) throw new Error(api.errorMessage(response, "无法新建对话。"));
        state.view = "active"; state.query = ""; el.search.value = "";
        await load(response.thread.id); setSidebar(false);
      } catch (error) { notice(error.message || "无法新建对话。", "danger"); }
      finally { setBusy(false); el.input.focus(); }
    }

    async function send(content) {
      content = String(content || el.input.value || "").trim();
      if (!content || state.busy || state.view === "archived") return;
      var pending = {id: "pending-" + Date.now(), role: "user", content: content, metadata: {references: Array.from(state.selected.values())}, created: new Date().toISOString()};
      state.messages.push(pending); el.input.value = ""; resizeInput(); setBusy(true);
      try {
        var response = await api.json("POST", "/learning/guide", {
          threadId: state.thread && state.thread.id, question: content, references: Array.from(state.selected.keys())
        });
        if (!response.success || !response.thread) throw new Error(api.errorMessage(response, "智能体暂时无法回答。"));
        await load(response.thread.id);
      } catch (error) {
        state.messages = state.messages.filter(function (item) { return item !== pending; });
        renderMessages(); notice(error.message || "智能体暂时无法回答。", "danger");
      } finally { setBusy(false); el.input.focus(); }
    }

    function resizeInput() {
      el.input.style.height = "auto"; el.input.style.height = Math.min(el.input.scrollHeight, 180) + "px";
      el.send.disabled = state.busy || Boolean(state.thread && state.thread.status === "ARCHIVED") || !String(el.input.value || "").trim();
    }
    function setSidebar(open, returnFocus) {
      var enabled = Boolean(open);
      var mobile = window.innerWidth <= 820;
      var wasOpen = root.classList.contains("is-sidebar-open");
      root.classList.toggle("is-sidebar-open", enabled);
      el.sidebarOverlay.hidden = !enabled;
      el.sidebarToggle.setAttribute("aria-expanded", enabled ? "true" : "false");
      el.sidebar.inert = mobile && !enabled;
      el.sidebar.setAttribute("aria-hidden", mobile && !enabled ? "true" : "false");
      if (el.conversation) {
        var conversationObscured = (mobile && enabled) || el.drawer.classList.contains("is-open");
        el.conversation.inert = conversationObscured;
        el.conversation.setAttribute("aria-hidden", conversationObscured ? "true" : "false");
      }
      if (enabled && !wasOpen) {
        state.sidebarReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement;
        // Move focus before exposing the open state to observers. Deferring to
        // the next frame created a real race for keyboard and assistive-tech
        // users who acted immediately after opening the mobile sidebar.
        el.search.focus({preventScroll: true});
      } else if (!enabled && wasOpen && state.sidebarReturnFocus instanceof HTMLElement && document.contains(state.sidebarReturnFocus)) {
        state.sidebarReturnFocus.focus({preventScroll: true});
        state.sidebarReturnFocus = null;
      }
    }
    function setDrawer(open, returnFocus) {
      var enabled = Boolean(open);
      var wasOpen = el.drawer.classList.contains("is-open");
      var navigation = document.querySelector(".product-navbar");
      el.drawer.classList.toggle("is-open", enabled); el.drawer.setAttribute("aria-hidden", enabled ? "false" : "true");
      el.drawer.inert = !enabled;
      el.drawerOverlay.hidden = !enabled; el.drawerOpen.setAttribute("aria-expanded", enabled ? "true" : "false");
      if (el.conversation) el.conversation.inert = enabled;
      el.sidebar.inert = enabled || (window.innerWidth <= 820 && !root.classList.contains("is-sidebar-open"));
      if (navigation) {
        navigation.inert = enabled;
        if (enabled) navigation.setAttribute("aria-hidden", "true");
        else navigation.removeAttribute("aria-hidden");
      }
      if (enabled && !wasOpen) {
        state.drawerReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement;
        window.requestAnimationFrame(function () { el.drawerClose.focus({preventScroll: true}); });
      } else if (!enabled && wasOpen && state.drawerReturnFocus instanceof HTMLElement && document.contains(state.drawerReturnFocus)) {
        state.drawerReturnFocus.focus({preventScroll: true});
        state.drawerReturnFocus = null;
      }
    }

    function trapFocus(container, event) {
      if (event.key !== "Tab" || !container || container.inert) return false;
      var focusable = Array.from(container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (node) {
        return !node.hidden && node.offsetParent !== null;
      });
      if (!focusable.length) return false;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return true; }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); return true; }
      return false;
    }

    el.newThread.addEventListener("click", createThread);
    el.send.addEventListener("click", function () { send(); });
    el.input.addEventListener("input", function (event) {
      resizeInput();
      if (event.inputType === "insertText" && event.data === "@") {
        var cursor = el.input.selectionStart; el.input.setRangeText("", Math.max(0, cursor - 1), cursor, "end"); openReferences();
      }
    });
    el.input.addEventListener("keydown", function (event) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } });
    el.prompts.addEventListener("click", function (event) { var button = event.target.closest("[data-student-prompt]"); if (button) send(button.dataset.studentPrompt); });
    el.search.addEventListener("input", function () {
      window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(function () {
        state.query = el.search.value.trim(); load(state.thread && state.thread.id);
      }, 240);
    });
    el.menu.addEventListener("click", function (event) { var button = event.target.closest("[data-thread-action]"); if (button) threadAction(button.dataset.threadAction); });
    el.archivedToggle.addEventListener("click", function () {
      state.view = state.view === "archived" ? "active" : "archived"; state.thread = null; state.query = ""; el.search.value = ""; load(null);
    });
    el.restore.addEventListener("click", function () { if (state.thread) { state.menuId = state.thread.id; threadAction("restore"); } });
    el.refTrigger.addEventListener("click", openReferences); el.refClose.addEventListener("click", closeReferences); el.refDone.addEventListener("click", closeReferences);
    el.refSearch.addEventListener("input", renderReferences);
    el.refOptions.addEventListener("click", function (event) { var button = event.target.closest("[data-reference-id]"); if (button) toggleReference(button.dataset.referenceId); });
    el.refSummary.addEventListener("click", function (event) { var button = event.target.closest("[data-remove-reference]"); if (button) toggleReference(button.dataset.removeReference); });
    el.refDialog.addEventListener("cancel", function (event) { event.preventDefault(); closeReferences(); });
    el.sidebarToggle.addEventListener("click", function () { setSidebar(true, el.sidebarToggle); });
    el.sidebarCollapse.addEventListener("click", function () { if (window.innerWidth < 900) setSidebar(false); else root.classList.toggle("is-sidebar-collapsed"); });
    el.sidebarOverlay.addEventListener("click", function () { setSidebar(false); });
    el.drawerOpen.addEventListener("click", function () { setDrawer(!el.drawer.classList.contains("is-open"), el.drawerOpen); });
    el.drawerClose.addEventListener("click", function () { setDrawer(false); }); el.drawerOverlay.addEventListener("click", function () { setDrawer(false); });
    el.refresh.addEventListener("click", function () { load(state.thread && state.thread.id); });
    el.jump.addEventListener("click", function () { el.messages.scrollTo({top: el.messages.scrollHeight, behavior: "smooth"}); });
    el.messages.addEventListener("scroll", function () { el.jump.hidden = el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 120; });
    document.addEventListener("click", function (event) { if (!event.target.closest("#teaching-thread-action-menu") && !event.target.closest("[data-thread-menu]")) closeMenu(); });
    document.addEventListener("keydown", function (event) {
      if (el.drawer.classList.contains("is-open")) {
        if (event.key === "Escape") { event.preventDefault(); setDrawer(false); return; }
        if (trapFocus(el.drawer, event)) return;
      }
      if (root.classList.contains("is-sidebar-open") && window.innerWidth <= 820 && trapFocus(el.sidebar, event)) return;
      if (event.altKey && String(event.key).toLowerCase() === "n") { event.preventDefault(); createThread(); }
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "k") { event.preventDefault(); el.search.focus(); }
      if (event.key === "Escape") { closeMenu(); if (root.classList.contains("is-sidebar-open")) setSidebar(false); }
    });

    setSidebar(false);
    setDrawer(false);
    resizeInput();
    load(initialThread).finally(function () { el.input.focus(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once: true});
  else boot();
})();

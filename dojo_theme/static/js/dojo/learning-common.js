(function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function errorMessage(payload, fallback) {
    if (!payload) return fallback;
    if (payload.error) return payload.error;
    if (payload.message) return payload.message;
    if (Array.isArray(payload.errors) && payload.errors.length) return payload.errors.join(" ");
    return fallback;
  }

  async function request(path, options) {
    const client = window.CTFd && typeof window.CTFd.fetch === "function"
      ? window.CTFd.fetch.bind(window.CTFd)
      : window.fetch && window.fetch.bind(window);
    if (!client) throw new Error("浏览器请求组件未就绪，请刷新页面后重试。");
    const response = await client(`/pwncollege_api/v1${path}`, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      ...(options || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && typeof payload.success === "undefined") {
      throw new Error(errorMessage(payload, `请求失败，状态码 ${response.status}`));
    }
    return payload;
  }

  function json(method, path, body) {
    return request(path, {
      method,
      body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    });
  }

  function showNotice(element, message, kind) {
    if (!element) return;
    if (!message) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    ["info", "success", "warning", "danger"].forEach(value => {
      element.classList.remove(`alert-${value}`);
    });
    element.classList.add("alert", `alert-${kind || "info"}`);
    element.textContent = message;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function courseCard(course, href) {
    const percent = Number(course.progress && course.progress.percent) || 0;
    const role = course.role === "teacher" ? "教师" : "学生";
    return `
      <a class="text-decoration-none" href="${escapeHtml(href)}">
        <li class="card card-small">
          <div class="card-body">
            <h4 class="card-title">${escapeHtml(course.name)}</h4>
            <p class="card-text">
              ${escapeHtml(role)}<br>
              ${escapeHtml(course.moduleCount)} 个单元<br>
              ${escapeHtml(course.progress.completed)} / ${escapeHtml(course.progress.total)} 个必修题目
            </p>
            <div class="progress-bar" style="width: ${Math.max(0, Math.min(100, percent))}%">
              ${percent ? `<span class="progress-bar-text">${Math.floor(percent)}%</span>` : ""}
            </div>
          </div>
        </li>
      </a>`;
  }

  function itemCard(options) {
    const lines = (options.lines || []).map(line => `${escapeHtml(line)}<br>`).join("");
    return `
      <a class="text-decoration-none" href="${escapeHtml(options.href)}">
        <li class="card card-small">
          <div class="card-body">
            <h4 class="card-title">${escapeHtml(options.title)}</h4>
            <p class="card-text">${lines}</p>
          </div>
        </li>
      </a>`;
  }

  window.DojoLearning = {
    escapeHtml,
    errorMessage,
    request,
    json,
    showNotice,
    formatDate,
    courseCard,
    itemCard,
  };
})();

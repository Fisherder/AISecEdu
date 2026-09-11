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
    if (payload.error && typeof payload.error === "object") {
      return payload.error.message || fallback;
    }
    if (payload.error) return payload.error;
    if (payload.message) return payload.message;
    if (Array.isArray(payload.errors) && payload.errors.length) return payload.errors.join(" ");
    return fallback;
  }

  function responseMessage(status) {
    if (status === 401) return "登录状态已失效，请重新登录后继续。";
    if (status === 403) return "当前账号无权完成此操作。";
    if (status === 404) return "这项内容不存在或已经移动。";
    if (status === 410) return "这项内容已经下线。";
    if (status >= 500) return "服务暂时不可用，请稍后重试。";
    return "请求没有完成，请检查网络后重试。";
  }

  async function readResponse(response, fallback) {
    const raw = await response.text();
    let payload = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        if (response.status === 413) {
          throw new Error(fallback || "提交内容超过系统限制。");
        }
        if (!response.ok) {
          throw new Error(fallback || responseMessage(response.status));
        }
        throw new Error(fallback || "服务器返回了无法识别的响应，请稍后重试。");
      }
    }
    if (!response.ok) {
      const requestError = new Error(
        errorMessage(payload, fallback || responseMessage(response.status)),
      );
      requestError.status = response.status;
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }

  async function request(path, options) {
    if (window.AISecEdu && typeof window.AISecEdu.request === "function") {
      return window.AISecEdu.request(path, {
        ...(options || {}),
        unwrap: false,
      });
    }
    const client = window.CTFd && typeof window.CTFd.fetch === "function"
      ? window.CTFd.fetch.bind(window.CTFd)
      : window.fetch && window.fetch.bind(window);
    if (!client) throw new Error("浏览器请求组件未就绪，请刷新页面后重试。");
    const csrfNonce = window.init && window.init.csrfNonce;
    const response = await client(`/pwncollege_api/v1${path}`, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(csrfNonce ? {"CSRF-Token": csrfNonce} : {}),
      },
      ...(options || {}),
    });
    return readResponse(response, responseMessage(response.status));
  }

  function json(method, path, body, options) {
    return request(path, {
      ...(options || {}),
      method,
      headers: {
        ...((options && options.headers) || {}),
        "Content-Type": "application/json",
      },
      body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    });
  }

  async function multipart(path, formData, fallback) {
    if (!window.fetch) {
      throw new Error("浏览器上传组件未就绪，请刷新页面后重试。");
    }
    const config = window.CTFd && window.CTFd.config ? window.CTFd.config : {};
    const urlRoot = String(config.urlRoot || "").replace(/\/$/, "");
    const headers = { Accept: "application/json" };
    // CTFd validates JSON CSRF tokens from a header, but multipart tokens from
    // a form field. Preserve that protection without setting Content-Type.
    if (config.csrfNonce && formData && typeof formData.set === "function") {
      formData.set("nonce", config.csrfNonce);
    }

    // CTFd.fetch always forces Content-Type to application/json. Native fetch
    // must set the multipart boundary itself when the body is FormData.
    const response = await window.fetch(`${urlRoot}/pwncollege_api/v1${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: formData,
    });
    return readResponse(
      response,
      response.status === 413
        ? "文件超过 50 MB，请压缩或拆分后再上传。"
        : (fallback || "文件上传失败，请稍后重试。"),
    );
  }

  function showNotice(element, message, kind) {
    if (element) {
      element.hidden = true;
      element.textContent = "";
    }
    if (!message) {
      return null;
    }
    if (!element) return null;
    element.hidden = false;
    ["info", "success", "warning", "danger"].forEach(value => {
      element.classList.remove(`alert-${value}`);
    });
    element.classList.add("alert", `alert-${kind || "info"}`);
    element.textContent = message;
    window.setTimeout(() => { element.hidden = true; }, kind === "danger" ? 6500 : 3800);
    return element;
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
    readResponse,
    request,
    json,
    multipart,
    showNotice,
    formatDate,
    courseCard,
    itemCard,
  };
})();

/* aisecedu-reading-navigation-v1 */
(() => {
  "use strict";

  const currentReturnContext = () => {
    const current = new URL(window.location.href);
    return current.searchParams.get("returnTo") || `${current.pathname}${current.search}`;
  };

  const destinationWithReturnContext = (rawHref) => {
    if (!rawHref) return "";
    const destination = new URL(rawHref, window.location.origin);
    if (destination.origin !== window.location.origin) return "";
    if (!destination.searchParams.has("returnTo")) {
      destination.searchParams.set("returnTo", currentReturnContext());
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  };

  const installNavigationStyles = () => {
    if (document.getElementById("aisecedu-unit-sequence-style")) return;
    const style = document.createElement("style");
    style.id = "aisecedu-unit-sequence-style";
    style.textContent = [
      ".unit-mobile-sequence{display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0;}",
      ".unit-mobile-sequence a{align-items:center;display:inline-flex;justify-content:center;min-height:44px;padding:.55rem .9rem;border-radius:.5rem;text-decoration:none;}",
      ".unit-mobile-sequence a.is-next{margin-left:auto;}",
      ".module-practice-not-applicable{margin:0 0 1rem;}",
      "@media (max-width:575px){.unit-mobile-sequence a{flex:1 1 44%;}.unit-mobile-sequence a.is-next:only-child{margin-left:0;}}",
    ].join("");
    document.head.appendChild(style);
  };

  const addReadingOnlyState = () => {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 2) return;
    if (document.querySelector(".module-practice-not-applicable")) return;
    if (document.querySelector("[data-challenge-outline], .unit-outline-item, .challenge-name, .challenge-card")) return;
    const main = document.querySelector("main#main-content");
    if (!main) return;
    const status = document.createElement("p");
    status.className = "module-practice-not-applicable alert alert-secondary";
    status.setAttribute("role", "status");
    status.textContent = "阅读章节 · 无必修实践";
    const heading = main.querySelector("h1, h2");
    if (heading) {
      heading.insertAdjacentElement("afterend", status);
    } else {
      main.prepend(status);
    }
  };

  const createSequenceLink = (href, label, modifier) => {
    const link = document.createElement("a");
    link.className = `btn btn-outline-primary ${modifier}`;
    link.href = href;
    link.textContent = label;
    return link;
  };

  const addUnitSequence = () => {
    const items = Array.from(document.querySelectorAll(".unit-outline-item[href]"));
    if (!items.length) return;
    const currentIndex = items.findIndex((item) => item.classList.contains("is-current"));
    if (currentIndex < 0) return;

    const previous = items.slice(0, currentIndex).reverse()
      .map((item) => destinationWithReturnContext(item.getAttribute("href")))
      .find(Boolean);
    const next = items.slice(currentIndex + 1)
      .map((item) => destinationWithReturnContext(item.getAttribute("href")))
      .find(Boolean);
    if (!previous && !next) return;

    installNavigationStyles();
    const existingSequence = document.querySelector(".unit-mobile-sequence");
    const sequence = existingSequence || document.createElement("nav");
    sequence.className = "unit-mobile-sequence";
    sequence.setAttribute("aria-label", "章节导航");
    sequence.replaceChildren();
    if (previous) sequence.appendChild(createSequenceLink(previous, "上一章", "is-previous"));
    if (next) sequence.appendChild(createSequenceLink(next, "下一章", "is-next"));

    if (!existingSequence) {
      const outline = items[0].parentElement;
      if (outline && outline.parentElement) {
        outline.insertAdjacentElement("afterend", sequence);
      } else {
        document.querySelector("main#main-content")?.appendChild(sequence);
      }
    }
  };

  const enhanceLearningPage = () => {
    addReadingOnlyState();
    addUnitSequence();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceLearningPage, { once: true });
  } else {
    enhanceLearningPage();
  }
})();

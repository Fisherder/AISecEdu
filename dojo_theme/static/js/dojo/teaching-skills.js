(function () {
  "use strict";

  const API = "/pwncollege_api/v1/teaching/agent-skills";
  const DIALOG_ID = "teaching-skills-dialog";

  function csrfToken() {
    return (window.init && window.init.csrfNonce) || "";
  }

  async function request(method, url, body) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const nonce = csrfToken();
    if (nonce) headers["CSRF-Token"] = nonce;
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
    if (!response.ok || !payload || payload.success === false) {
      const message =
        (payload && payload.errors && payload.errors[0]) ||
        (response.status >= 500 ? "平台暂时不可用，请稍后重试。" : "操作未完成。");
      throw new Error(message);
    }
    return payload.data || {};
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function skillRow(skill) {
    const badge = skill.source === "builtin" ? "内置" : "自定义";
    const toggleLabel = skill.enabled ? "停用" : "启用";
    return `
      <li class="teaching-skills-item" data-skill="${escapeHtml(skill.name)}">
        <div class="teaching-skills-head">
          <strong>${escapeHtml(skill.name)}</strong>
          <span class="teaching-skills-badge is-${escapeHtml(skill.source)}">${badge}</span>
          ${skill.enabled ? "" : '<span class="teaching-skills-badge is-off">已停用</span>'}
        </div>
        <p>${escapeHtml(skill.description)}</p>
        <div class="teaching-skills-actions">
          <button type="button" data-action="toggle">${toggleLabel}</button>
          <button type="button" data-action="view">查看方法</button>
          <button type="button" data-action="delete" class="is-danger">删除</button>
        </div>
      </li>`;
  }

  function catalogOptions(catalog) {
    return catalog
      .filter((item) => !item.installed)
      .map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`)
      .join("");
  }

  function render(root, data) {
    const list = root.querySelector("[data-skills-list]");
    const skills = data.skills || [];
    list.innerHTML = skills.length
      ? skills.map(skillRow).join("")
      : '<li class="teaching-skills-empty">还没有属于这个账号的技能。可以直接在对话里说「帮我创建一个……的技能」，或从下面的内置技能里挑一个加入。</li>';
    const select = root.querySelector("[data-skills-catalog]");
    const catalog = data.builtinCatalog || [];
    select.innerHTML = catalogOptions(catalog);
    root.querySelector("[data-skills-import]").disabled = !select.options.length;
  }

  function message(root, text, kind) {
    const bar = root.querySelector("[data-skills-message]");
    bar.textContent = text || "";
    bar.className = `teaching-skills-message${kind ? ` is-${kind}` : ""}`;
    if (text) window.setTimeout(() => {
      if (bar.textContent === text) bar.textContent = "";
    }, 4200);
  }

  async function refresh(root) {
    try {
      render(root, await request("GET", API));
    } catch (error) {
      message(root, error.message, "error");
    }
  }

  function ensureDialog() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.className = "teaching-skills-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "我的 Agent 技能");
    dialog.innerHTML = `
      <div class="teaching-skills-backdrop" data-skills-close></div>
      <div class="teaching-skills-panel">
        <header>
          <div>
            <strong>我的 Agent 技能</strong>
            <small>技能只属于当前账号：Agent 每次对话都会带上你自己启用的方法。</small>
          </div>
          <button type="button" data-skills-close aria-label="关闭">×</button>
        </header>
        <p class="teaching-skills-message" data-skills-message role="status"></p>
        <ul class="teaching-skills-list" data-skills-list></ul>
        <footer>
          <div class="teaching-skills-import-row">
            <select data-skills-catalog aria-label="内置技能"></select>
            <button type="button" data-skills-import>加入我的账号</button>
          </div>
          <div class="teaching-skills-draft">
            <label for="teaching-skills-draft-input">用一句话说明你希望 Agent 以后怎么做</label>
            <textarea id="teaching-skills-draft-input" data-skills-draft-input rows="3"
              placeholder="例如：以后给我出题之前，先用一句话复述我的目标，等我确认再动手"></textarea>
            <div class="teaching-skills-draft-actions">
              <button type="button" data-skills-draft>生成技能草稿</button>
              <button type="button" data-skills-save hidden>保存到我的账号</button>
            </div>
            <pre data-skills-preview hidden></pre>
          </div>
          <small>也可以在对话里说「把这条要求保存成技能」；如果 Agent 没有落库，用上面的草稿入口最稳。</small>
        </footer>
      </div>`;
    document.body.appendChild(dialog);

    dialog.addEventListener("click", async (event) => {
      if (event.target.closest("[data-skills-close]")) {
        dialog.hidden = true;
        return;
      }
      const importButton = event.target.closest("[data-skills-import]");
      if (importButton) {
        const select = dialog.querySelector("[data-skills-catalog]");
        const name = select.value;
        if (!name) return;
        try {
          await request("POST", `${API}/import`, { name });
          message(dialog, `已把内置技能 ${name} 加入你的账号。`, "success");
          await refresh(dialog);
        } catch (error) {
          message(dialog, error.message, "error");
        }
        return;
      }
      const draftButton = event.target.closest("[data-skills-draft]");
      if (draftButton) {
        const description = dialog.querySelector("[data-skills-draft-input]").value.trim();
        if (!description) {
          message(dialog, "请先用一句话描述你希望 Agent 以后怎么做。", "error");
          return;
        }
        draftButton.disabled = true;
        message(dialog, "正在把你的描述整理成技能草稿…", "info");
        try {
          const data = await request("POST", `${API}/draft`, { description });
          dialog.__draft = data.draft;
          const preview = dialog.querySelector("[data-skills-preview]");
          preview.hidden = false;
          preview.textContent =
            `名称：${data.draft.name}\n说明：${data.draft.description}\n\n${data.draft.instructions}`;
          dialog.querySelector("[data-skills-save]").hidden = false;
          message(dialog, "草稿已生成，确认后点「保存到我的账号」。", "success");
        } catch (error) {
          message(dialog, error.message, "error");
        } finally {
          draftButton.disabled = false;
        }
        return;
      }
      const saveButton = event.target.closest("[data-skills-save]");
      if (saveButton) {
        if (!dialog.__draft) return;
        try {
          await request("POST", API, dialog.__draft);
          message(dialog, `技能 ${dialog.__draft.name} 已保存到你的账号。`, "success");
          dialog.__draft = null;
          dialog.querySelector("[data-skills-preview]").hidden = true;
          dialog.querySelector("[data-skills-save]").hidden = true;
          dialog.querySelector("[data-skills-draft-input]").value = "";
          await refresh(dialog);
        } catch (error) {
          message(dialog, error.message, "error");
        }
        return;
      }
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      const item = actionButton.closest("[data-skill]");
      const name = item && item.getAttribute("data-skill");
      const action = actionButton.getAttribute("data-action");
      if (!name) return;
      try {
        if (action === "toggle") {
          const enabled = !item.querySelector(".teaching-skills-badge.is-off");
          await request("PATCH", `${API}/${encodeURIComponent(name)}`, { enabled: !enabled });
          message(dialog, enabled ? `已停用 ${name}。` : `已启用 ${name}。`, "success");
        } else if (action === "delete") {
          if (!window.confirm(`删除技能 ${name}？`)) return;
          await request("DELETE", `${API}/${encodeURIComponent(name)}`);
          message(dialog, `已删除 ${name}。`, "success");
        } else if (action === "view") {
          const detail = await request("GET", `${API}/${encodeURIComponent(name)}`);
          message(dialog, `方法正文已复制，可直接粘贴到对话里继续修改。`, "success");
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(detail.skill.instructions || "");
          }
        }
        await refresh(dialog);
      } catch (error) {
        message(dialog, error.message, "error");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dialog.hidden) dialog.hidden = true;
    });
    return dialog;
  }

  function openDialog() {
    const dialog = ensureDialog();
    dialog.hidden = false;
    refresh(dialog);
  }

  function mount() {
    const sidebar = document.getElementById("teaching-sidebar");
    if (!sidebar || document.getElementById("teaching-skills-open")) return;
    const button = document.createElement("button");
    button.id = "teaching-skills-open";
    button.type = "button";
    button.className = "teaching-new-button teaching-skills-open";
    button.innerHTML = '<i class="fas fa-puzzle-piece"></i>我的技能';
    button.addEventListener("click", openDialog);
    const anchor = sidebar.querySelector(".teaching-new-button");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(button, anchor.nextSibling);
    else sidebar.insertBefore(button, sidebar.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();

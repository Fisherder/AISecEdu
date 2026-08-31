(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, {once: true});
    } else {
      callback();
    }
  }

  function idempotencyKey(button) {
    if (button.dataset.idempotencyKey) return button.dataset.idempotencyKey;
    const random = window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    button.dataset.idempotencyKey = `admin-runtime-stop-${button.dataset.userId}-${random}`;
    return button.dataset.idempotencyKey;
  }

  ready(function () {
    const page = document.querySelector(".admin-product");
    const liveStatus = page?.querySelector(".admin-runtime-live-status");
    if (!page || !window.AISecEdu?.request || !window.AISecEduUI) return;

    function announce(message) {
      if (liveStatus) liveStatus.textContent = message;
    }

    function removeStoppedRow(button, message) {
      const row = button.closest("tr");
      if (!row) return;
      row.classList.add("is-runtime-stopped");
      const badge = row.querySelector(".admin-product-badge");
      if (badge) {
        badge.dataset.kind = "neutral";
        badge.textContent = "已停止";
      }
      row.querySelector("a[href^='/desktop/']")?.remove();
      button.remove();
      announce(message);

      const total = page.querySelector(".admin-product-summary strong");
      if (total) total.textContent = String(Math.max(0, Number(total.textContent) - 1));
      window.setTimeout(function () {
        row.remove();
        const tbody = page.querySelector(".admin-product-table tbody");
        if (tbody && !tbody.children.length) {
          page.querySelector(".admin-product-table-wrap")?.remove();
          const empty = document.createElement("section");
          empty.className = "admin-product-empty";
          empty.innerHTML = "<h2>当前没有符合条件的运行环境</h2><p>最后一个环境已停止，学习记录与已保存文件没有被删除。</p>";
          page.querySelector(".admin-product-pagination")?.before(empty);
        }
      }, 700);
    }

    page.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-admin-runtime-stop]");
      if (!button || button.disabled) return;
      event.preventDefault();

      const userName = String(button.dataset.userName || "");
      const entered = await window.AISecEduUI.prompt(
        `这会立即停止“${userName}”当前运行的实验环境，但不会删除学习记录或已保存文件。请输入完整账号名称确认范围。`,
        {
          title: "停止运行环境",
          kind: "danger",
          inputLabel: `输入 ${userName}`,
          placeholder: userName,
          maxLength: 128,
          confirmLabel: "确认停止",
        },
      );
      if (entered === null) return;
      if (entered.trim() !== userName) {
        window.AISecEduUI.notify("账号名称不匹配，运行环境没有发生变化。", "warning");
        announce("确认内容不匹配，操作已取消。");
        return;
      }

      const originalLabel = button.textContent;
      const key = idempotencyKey(button);
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "正在停止…";
      announce(`正在停止 ${userName} 的运行环境。`);
      const progress = window.AISecEduUI.notify(
        `正在停止 ${userName} 的运行环境…`,
        "progress",
        {duration: 0, closeable: false, dedupeKey: `runtime-stop-progress-${button.dataset.userId}`},
      );

      try {
        const data = await window.AISecEdu.request(button.dataset.stopEndpoint, {
          method: "POST",
          json: {confirmed: true, confirmUser: userName, idempotencyKey: key},
          idempotencyKey: key,
          retryMutation: true,
          retries: 1,
          timeoutMs: 25000,
          dedupeKey: `runtime-stop-${button.dataset.userId}`,
        });
        progress?.close();
        const message = data?.alreadyStopped
          ? "该环境此前已停止，列表状态已同步。"
          : "运行环境已停止，列表状态已更新。";
        window.AISecEduUI.notify(message, "success", {duration: 5200});
        removeStoppedRow(button, message);
      } catch (error) {
        progress?.close();
        const reference = error?.requestId ? ` 请求编号：${error.requestId}` : "";
        window.AISecEduUI.notify(
          `${error?.message || "停止操作未完成，请稍后重试。"}${reference}`,
          "danger",
          {duration: 8500, dedupeKey: `runtime-stop-failed-${button.dataset.userId}`},
        );
        announce(`停止操作未完成。${reference}`);
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = "安全重试";
        button.setAttribute("aria-label", `使用同一请求重试停止 ${userName} 的运行环境`);
        if (!button.dataset.originalLabel) button.dataset.originalLabel = originalLabel;
      }
    });
  });
})();

(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, {once: true});
    } else {
      callback();
    }
  }

  function key(button, targetRole) {
    const identity = `${button.dataset.userId}:${targetRole}`;
    if (button.dataset.roleKeyIdentity === identity && button.dataset.roleIdempotencyKey) {
      return button.dataset.roleIdempotencyKey;
    }
    const random = window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    button.dataset.roleKeyIdentity = identity;
    button.dataset.roleIdempotencyKey = `admin-role-${button.dataset.userId}-${random}`;
    return button.dataset.roleIdempotencyKey;
  }

  ready(function () {
    const page = document.querySelector("[data-admin-collection='users']");
    const dialog = document.getElementById("admin-user-role-dialog");
    const form = document.getElementById("admin-user-role-form");
    if (!page || !dialog || !form || !window.AISecEdu?.request || !window.AISecEdu?.dialog) return;

    const fields = {
      userId: form.elements.userId,
      targetRole: form.elements.targetRole,
      reason: form.elements.reason,
      confirmUser: form.elements.confirmUser,
      userName: dialog.querySelector("[data-role-user-name]"),
      before: dialog.querySelector("[data-role-before]"),
      after: dialog.querySelector("[data-role-after]"),
      granted: dialog.querySelector("[data-role-granted]"),
      revoked: dialog.querySelector("[data-role-revoked]"),
      summary: dialog.querySelector("[data-role-impact-summary]"),
      status: dialog.querySelector(".admin-role-live-status"),
      apply: dialog.querySelector("[data-role-apply]"),
    };
    let activeButton = null;
    let previewController = null;
    const capabilityLabels = {
      "platform:manage": "平台治理",
      "users:manage": "用户与权限",
      "runtime:stop": "停止运行环境",
      "configuration:manage": "平台配置",
    };

    function capabilityText(values) {
      const labels = (values || []).map(value => capabilityLabels[value] || value);
      return labels.length ? labels.join("、") : "无变化";
    }

    async function preview() {
      if (!activeButton) return;
      previewController?.abort();
      previewController = new AbortController();
      fields.apply.disabled = true;
      fields.status.textContent = "正在核对最新权限与影响范围…";
      try {
        const data = await window.AISecEdu.request(
          `${activeButton.dataset.roleEndpoint}?targetRole=${encodeURIComponent(fields.targetRole.value)}`,
          {
            signal: previewController.signal,
            latestKey: `admin-role-impact-${activeButton.dataset.userId}`,
            dedupeKey: false,
            timeoutMs: 10000,
          },
        );
        fields.before.textContent = data.before.label;
        fields.after.textContent = data.after.label;
        fields.granted.textContent = capabilityText(data.diff.granted);
        fields.revoked.textContent = capabilityText(data.diff.revoked);
        fields.summary.textContent = data.impact.summary;
        fields.status.textContent = data.changed
          ? "已依据服务端最新状态生成差异，确认后将在下一次请求立即生效。"
          : "目标账号已经是该平台角色；提交后只会生成一次可审计的无变更记录。";
        fields.apply.disabled = false;
      } catch (error) {
        if (error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") return;
        const reference = error?.requestId ? ` 请求编号：${error.requestId}` : "";
        fields.status.textContent = `${error?.message || "无法计算权限影响。"}${reference}`;
      }
    }

    page.addEventListener("click", function (event) {
      const button = event.target.closest("[data-admin-user-role]");
      if (!button) return;
      activeButton = button;
      fields.userId.value = button.dataset.userId;
      fields.userName.textContent = button.dataset.userName;
      fields.confirmUser.value = "";
      fields.reason.value = "";
      fields.targetRole.value = button.dataset.platformRole === "platform_admin"
        ? "standard"
        : "platform_admin";
      fields.status.textContent = "";
      window.AISecEdu.dialog.open(dialog, button);
      preview();
    });

    fields.targetRole.addEventListener("change", preview);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!activeButton || fields.apply.disabled) return;
      if (fields.confirmUser.value.trim() !== activeButton.dataset.userName) {
        fields.status.textContent = "账号名称不匹配，权限没有发生变化。";
        fields.confirmUser.focus();
        return;
      }
      if (fields.reason.value.trim().length < 8) {
        fields.status.textContent = "请填写至少 8 个字符的权限变更原因。";
        fields.reason.focus();
        return;
      }

      const targetRole = fields.targetRole.value;
      const idempotencyKey = key(activeButton, targetRole);
      fields.apply.disabled = true;
      fields.apply.setAttribute("aria-busy", "true");
      fields.apply.textContent = "正在应用…";
      fields.status.textContent = "正在提交权限变更；请勿重复操作。";
      try {
        const data = await window.AISecEdu.request(activeButton.dataset.roleEndpoint, {
          method: "POST",
          json: {
            targetRole,
            reason: fields.reason.value.trim(),
            confirmUser: fields.confirmUser.value.trim(),
            confirmed: true,
            idempotencyKey,
          },
          idempotencyKey,
          retryMutation: true,
          retries: 1,
          timeoutMs: 20000,
          dedupeKey: `admin-user-role-${activeButton.dataset.userId}`,
        });
        const row = activeButton.closest("[data-user-row]");
        const badge = row?.querySelector("td[data-label='角色'] .admin-product-badge");
        activeButton.dataset.platformRole = data.after.role;
        if (row) row.dataset.platformRole = data.after.role;
        if (badge) {
          badge.dataset.kind = data.after.role === "platform_admin" ? "warning" : "neutral";
          badge.textContent = data.after.role === "platform_admin"
            ? "平台管理员"
            : activeButton.dataset.standardRoleLabel;
        }
        activeButton.dataset.roleIdempotencyKey = "";
        activeButton.dataset.roleKeyIdentity = "";
        window.AISecEdu.dialog.close(dialog);
        window.AISecEduUI?.notify(
          `已将 ${data.userName} 调整为${data.after.label}，权限已立即生效。`,
          "success",
          {duration: 6000},
        );
      } catch (error) {
        const reference = error?.requestId ? ` 请求编号：${error.requestId}` : "";
        fields.status.textContent = `${error?.message || "权限变更未完成，请安全重试。"}${reference}`;
        window.AISecEduUI?.notify(fields.status.textContent, "danger", {duration: 8500});
      } finally {
        fields.apply.disabled = false;
        fields.apply.removeAttribute("aria-busy");
        fields.apply.textContent = "确认并立即生效";
      }
    });
  });
})();

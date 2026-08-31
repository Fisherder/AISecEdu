(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, {once: true});
    } else {
      callback();
    }
  }

  function activateTab(link) {
    const list = link.closest(".nav-tabs");
    if (!list) return;
    const panel = list.parentElement?.querySelector(":scope > .tab-content");
    if (!panel) return;
    list.querySelectorAll('a[data-toggle="tab"]').forEach(candidate => {
      const active = candidate === link;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-selected", String(active));
      candidate.setAttribute("tabindex", active ? "0" : "-1");
    });
    panel.querySelectorAll(":scope > .tab-pane").forEach(candidate => {
      const active = `#${candidate.id}` === link.getAttribute("href");
      candidate.classList.toggle("active", active);
      candidate.hidden = !active;
    });
  }

  function normalize(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }

  function serialize(form) {
    const values = {};
    Array.from(form.elements).forEach(control => {
      if (!control.name || control.disabled || ["submit", "button", "file"].includes(control.type)) return;
      if (control.name === "nonce") return;
      if (control.type === "radio" && !control.checked) return;
      if (control.type === "checkbox") {
        values[control.name] = control.checked;
        return;
      }
      values[control.name] = normalize(control.value);
    });
    if (values.mail_useauth === false) {
      values.mail_username = null;
      values.mail_password = null;
    } else if (values.mail_useauth === true) {
      if (!values.mail_username) delete values.mail_username;
      if (!values.mail_password) delete values.mail_password;
    }
    return values;
  }

  ready(function () {
    const root = document.querySelector("[data-admin-config-section]");
    if (!root) return;

    root.querySelectorAll(".nav-tabs").forEach(list => {
      const links = Array.from(list.querySelectorAll('a[data-toggle="tab"]'));
      const selected = links.find(link => link.classList.contains("active")) || links[0];
      if (selected) activateTab(selected);
    });
    root.addEventListener("click", event => {
      const link = event.target.closest('a[data-toggle="tab"]');
      if (!link || !root.contains(link)) return;
      event.preventDefault();
      activateTab(link);
    });

    root.querySelectorAll(".config-section > form:not(.form-upload, .custom-config-form)").forEach(form => {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = event.submitter || form.querySelector('[type="submit"]');
        const originalLabel = submit?.value || submit?.textContent || "保存";
        if (submit) {
          submit.disabled = true;
          if (submit.tagName === "INPUT") submit.value = "正在保存…";
          else submit.textContent = "正在保存…";
        }
        const progress = window.AISecEduUI?.notify("正在保存配置…", "progress", {
          duration: 0,
          closeable: false,
          dedupeKey: "admin-config-save",
        });
        try {
          await window.AISecEdu.request("/api/v1/configs", {
            method: "PATCH",
            json: serialize(form),
            unwrap: false,
            timeoutMs: 15000,
          });
          progress?.close();
          window.AISecEduUI?.notify("配置已保存，页面正在刷新。", "success", {duration: 5000});
          window.setTimeout(() => window.location.reload(), 350);
        } catch (error) {
          progress?.close();
          window.AISecEduUI?.notify(error.message || "配置未保存，请检查后重试。", "danger", {
            duration: 7000,
            dedupeKey: "admin-config-save-error",
          });
          if (submit) {
            submit.disabled = false;
            if (submit.tagName === "INPUT") submit.value = originalLabel;
            else submit.textContent = originalLabel;
          }
        }
      });
    });

    const mailAuth = root.querySelector("#mail_useauth");
    const mailCredentials = root.querySelector("#mail_username_password");
    const syncMailCredentials = () => {
      if (mailCredentials && mailAuth) mailCredentials.hidden = !mailAuth.checked;
    };
    mailAuth?.addEventListener("change", syncMailCredentials);
    syncMailCredentials();
  });
})();

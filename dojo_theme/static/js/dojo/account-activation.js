(function () {
  "use strict";
  const form = document.getElementById("account-activation-form");
  if (!form) return;
  const errors = document.getElementById("account-activation-errors");
  const message = errors.querySelector("span");
  const button = form.querySelector('button[type="submit"]');

  function destination(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      if (url.origin === window.location.origin && url.pathname.startsWith("/") && url.pathname !== "/activate-account") {
        return url.pathname + url.search + url.hash;
      }
    } catch (error) {}
    return "/student";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errors.hidden = true;
    if (!form.reportValidity()) return;
    const currentPassword = document.getElementById("activation-current").value;
    const newPassword = document.getElementById("activation-new").value;
    const confirmPassword = document.getElementById("activation-confirm").value;
    if (newPassword !== confirmPassword) {
      message.textContent = "两次输入的新密码不一致。";
      errors.hidden = false;
      return;
    }
    button.disabled = true;
    try {
      const nonce = window.init && window.init.csrfNonce;
      const response = await fetch("/pwncollege_api/v1/users/activation", {
        method: "POST",
        credentials: "same-origin",
        headers: {"Accept": "application/json", "Content-Type": "application/json", ...(nonce ? {"CSRF-Token": nonce} : {})},
        body: JSON.stringify({currentPassword, newPassword, confirmPassword})
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error((payload.errors || ["激活失败，请重试。"]).join(" "));
      }
      window.location.assign(destination(document.getElementById("activation-next").value));
    } catch (error) {
      message.textContent = error.message || "激活失败，请重试。";
      errors.hidden = false;
      button.disabled = false;
    }
  });
})();

(function () {
  "use strict";

  var root = document.querySelector("[data-auth-page]");
  if (!root) return;
  var page = root.dataset.authPage;
  var errors = document.getElementById("account-auth-errors");
  var errorCopy = errors && errors.querySelector("span");

  function safeDestination(value, fallback) {
    value = String(value || "").trim();
    if (!value || value.indexOf("//") === 0) return fallback;
    try {
      var url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.pathname.indexOf("/") === 0
        ? url.pathname + url.search + url.hash
        : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function message(payload, fallback) {
    if (payload && Array.isArray(payload.errors) && payload.errors.length) return payload.errors.join(" ");
    if (payload && payload.error) return payload.error;
    if (payload && payload.message) return payload.message;
    return fallback;
  }

  function showError(value) {
    if (!errors) return;
    errors.hidden = !value;
    if (errorCopy) errorCopy.textContent = value || "";
    if (value) errors.scrollIntoView({behavior: "smooth", block: "nearest"});
  }

  async function request(path, options) {
    var client = window.CTFd && typeof window.CTFd.fetch === "function"
      ? window.CTFd.fetch.bind(window.CTFd)
      : window.fetch.bind(window);
    var nonce = window.init && window.init.csrfNonce;
    var response = await client("/pwncollege_api/v1/auth" + path, Object.assign({
      credentials: "same-origin",
      headers: Object.assign(
        {"Accept": "application/json", "Content-Type": "application/json"},
        nonce ? {"CSRF-Token": nonce} : {},
      ),
    }, options || {}));
    var raw = await response.text();
    var payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch (error) { throw new Error("服务器返回了无法识别的响应。"); }
    if (!response.ok || payload.success === false) {
      var failure = new Error(message(payload, "请求失败，请稍后重试。"));
      failure.status = response.status;
      throw failure;
    }
    return payload;
  }

  function json(path, body) {
    return request(path, {method: "POST", body: JSON.stringify(body || {})});
  }

  function setBusy(form, busy, label) {
    var button = form.querySelector(".account-auth-submit");
    if (!button) return;
    button.disabled = Boolean(busy);
    var copy = button.querySelector("span");
    if (!copy.dataset.defaultLabel) copy.dataset.defaultLabel = copy.textContent;
    copy.textContent = busy ? label : copy.dataset.defaultLabel;
    var icon = button.querySelector("i");
    if (icon) icon.className = busy ? "fas fa-circle-notch fa-spin" : "fas fa-arrow-right";
  }

  document.querySelectorAll("[data-password-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
      button.querySelector("i").className = showing ? "far fa-eye" : "far fa-eye-slash";
      input.focus();
    });
  });

  if (page === "login") {
    var loginForm = document.getElementById("account-login-form");
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      showError("");
      if (!loginForm.reportValidity()) return;
      setBusy(loginForm, true, "正在登录…");
      try {
        var payload = await json("/login", {
          name: document.getElementById("name").value.trim(),
          password: document.getElementById("password").value,
          remember_me: document.getElementById("remember-me").checked
        });
        var next = safeDestination(document.getElementById("account-auth-next").value, "");
        var fallback = payload.data && payload.data.course_teacher ? "/teacher/courses" : "/student";
        window.location.assign(next || fallback);
      } catch (error) {
        showError(error.message || "登录失败，请检查账号信息。");
        setBusy(loginForm, false, "");
        document.getElementById("password").focus();
      }
    });
    return;
  }

  var form = document.getElementById("account-register-form");
  var courseEntry = document.getElementById("account-course-entry");
  var publicCourse = document.getElementById("account-public-course");
  var inviteToggle = document.getElementById("account-course-invite-toggle");
  var inviteFields = document.getElementById("account-course-invite");
  var courseId = document.getElementById("account-course-id");
  var coursePassword = document.getElementById("account-course-password");
  var commitment = document.getElementById("commitment-input");
  var commitmentCopy = document.getElementById("commitment-text");
  var registrationCodeSlot = document.getElementById("account-registration-code-slot");
  var customFields = document.getElementById("account-custom-fields");
  var legal = document.getElementById("account-auth-legal");
  var password = document.getElementById("password");
  var passwordStrength = document.getElementById("account-password-strength");
  var config = {};

  function selectedRole() {
    var selected = form.querySelector('input[name="role"]:checked');
    return selected ? selected.value : "student";
  }

  function syncRole() {
    var student = selectedRole() === "student";
    courseEntry.hidden = !student;
    if (!student) {
      publicCourse.value = "";
      courseId.value = "";
      coursePassword.value = "";
      inviteFields.hidden = true;
      inviteToggle.setAttribute("aria-expanded", "false");
      inviteToggle.textContent = "使用课程邀请";
    }
    var submit = form.querySelector(".account-auth-submit span");
    submit.dataset.defaultLabel = student ? "创建账号并进入学习系统" : "创建账号并开始建课";
    if (!form.querySelector(".account-auth-submit").disabled) submit.textContent = submit.dataset.defaultLabel;
  }

  function setInviteOpen(open) {
    inviteFields.hidden = !open;
    inviteToggle.setAttribute("aria-expanded", open ? "true" : "false");
    inviteToggle.textContent = open ? "使用公开课程" : "使用课程邀请";
    if (open) {
      publicCourse.value = "";
      window.requestAnimationFrame(function () { courseId.focus(); });
    } else {
      courseId.value = "";
      coursePassword.value = "";
    }
  }

  function renderRegistrationCode(required) {
    registrationCodeSlot.hidden = !required;
    registrationCodeSlot.innerHTML = required
      ? "<label class=\"account-auth-field\" for=\"account-registration-code\"><span>平台注册码</span>" +
        "<input id=\"account-registration-code\" type=\"text\" maxlength=\"128\" autocomplete=\"one-time-code\" required placeholder=\"输入平台管理员提供的注册码\">" +
        "<small>这是平台注册码，不是课程邀请码。</small></label>"
      : "";
  }

  function renderCustomFields(fields) {
    customFields.innerHTML = (fields || []).map(function (field) {
      var name = "fields[" + field.id + "]";
      if (field.type === "boolean") {
        return "<label class=\"account-auth-check account-auth-commitment\"><input type=\"checkbox\" data-custom-field=\"" + field.id + "\"" +
          (field.required ? " required" : "") + "><span>" + escapeHtml(field.name) + (field.description ? " · " + escapeHtml(field.description) : "") + "</span></label>";
      }
      return "<label class=\"account-auth-field\"><span>" + escapeHtml(field.name) + "</span><input type=\"text\" data-custom-field=\"" + field.id + "\" name=\"" +
        name + "\"" + (field.required ? " required" : "") + "><small>" + escapeHtml(field.description || "") + "</small></label>";
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function renderLegal(settings) {
    var links = [];
    if (settings && settings.terms && settings.terms.enabled) {
      links.push("<a href=\"" + escapeHtml(settings.terms.href) + "\" target=\"_blank\" rel=\"noopener\">服务条款</a>");
    }
    if (settings && settings.privacy && settings.privacy.enabled) {
      links.push("<a href=\"" + escapeHtml(settings.privacy.href) + "\" target=\"_blank\" rel=\"noopener\">隐私政策</a>");
    }
    legal.innerHTML = links.length
      ? "创建账号即表示你同意" + links.join("与") + "，并接受课程教师设置的内容共享规则。"
      : "创建账号即表示你同意平台公约与课程教师设置的内容共享规则。";
  }

  function renderCourses(rows) {
    publicCourse.innerHTML = "<option value=\"\">稍后选择课程</option>" + (rows || []).map(function (course) {
      return "<option value=\"" + escapeHtml(course.id) + "\">" + escapeHtml(course.name) + (course.official ? " · 推荐" : "") + "</option>";
    }).join("");
  }

  async function loadRegistrationContext() {
    var results = await Promise.allSettled([request("/config"), request("/courses")]);
    if (results[0].status === "fulfilled") {
      config = results[0].value.data || {};
      if (config.registrationEnabled === false) {
        showError("当前未开放新账号注册。");
        form.querySelector(".account-auth-submit").disabled = true;
      }
      renderRegistrationCode(Boolean(config.registrationCodeRequired));
      renderCustomFields(config.customFields || []);
      renderLegal(config.legal || {});
      if (config.commitment && config.commitment.text) commitmentCopy.textContent = config.commitment.text;
    }
    if (results[1].status === "fulfilled") renderCourses((results[1].value.data || {}).courses || []);

    var invitedCourse = String(root.dataset.invitedCourse || "").trim();
    if (invitedCourse) {
      setInviteOpen(true);
      courseId.value = invitedCourse;
      coursePassword.value = String(root.dataset.inviteCode || "");
    }
  }

  password.addEventListener("input", function () {
    var value = password.value;
    var score = Number(value.length >= 8) + Number(value.length >= 12) +
      Number(/[A-Z]/.test(value) && /[a-z]/.test(value)) + Number(/\d/.test(value)) +
      Number(/[^A-Za-z0-9]/.test(value));
    passwordStrength.textContent = !value ? "请使用不与其他网站重复的密码。" :
      score <= 2 ? "密码强度较弱，建议增加长度并混合字符。" :
      score <= 4 ? "密码强度良好。" : "密码强度很高。";
    passwordStrength.style.color = score <= 2 && value ? "var(--product-danger)" :
      score >= 5 ? "var(--product-accent)" : "";
  });

  form.querySelectorAll('input[name="role"]').forEach(function (radio) {
    radio.addEventListener("change", syncRole);
  });
  inviteToggle.addEventListener("click", function () { setInviteOpen(inviteFields.hidden); });
  publicCourse.addEventListener("change", function () {
    if (publicCourse.value) {
      courseId.value = "";
      coursePassword.value = "";
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    showError("");
    if (!form.reportValidity()) return;
    if (!commitment.checked) {
      showError("请先阅读并同意平台公约。");
      commitment.focus();
      return;
    }
    var role = selectedRole();
    var selectedCourse = role === "student"
      ? (inviteFields.hidden ? publicCourse.value : courseId.value.trim())
      : "";
    var body = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: password.value,
      role: role,
      course_id: selectedCourse,
      course_password: role === "student" && !inviteFields.hidden ? coursePassword.value : "",
      commitment_accepted: true
    };
    var registrationCode = document.getElementById("account-registration-code");
    if (registrationCode) body.registration_code = registrationCode.value.trim();
    customFields.querySelectorAll("[data-custom-field]").forEach(function (input) {
      body["fields[" + input.dataset.customField + "]"] = input.type === "checkbox" ? input.checked : input.value.trim();
    });

    setBusy(form, true, role === "teacher" ? "正在准备建课空间…" : selectedCourse ? "正在创建账号并加入课程…" : "正在创建学习账号…");
    try {
      var payload = await json("/register", body);
      var onboarding = payload.data && payload.data.onboarding || {};
      window.location.assign(safeDestination(onboarding.destination, role === "teacher" ? "/teacher/courses/new?onboarding=1" : "/student"));
    } catch (error) {
      showError(error.message || "注册失败，请检查填写内容。");
      setBusy(form, false, "");
    }
  });

  syncRole();
  loadRegistrationContext().catch(function () {
    showError("暂时无法读取注册配置，请刷新页面后重试。");
  });
})();

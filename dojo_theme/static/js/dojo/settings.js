var error_template =
    '<div class="alert alert-danger alert-dismissable" role="alert">\n' +
    '  <span class="sr-only">错误：</span>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

var success_template =
    '<div class="alert alert-success alert-dismissable submit-row" role="alert">\n' +
    '  <strong>成功！</strong>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

var loading_template =
    '<div class="alert alert-warning alert-dismissable submit-row" role="alert">\n' +
    '  <strong>正在处理…</strong>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

async function settingsConfirm(message, options) {
    return Boolean(
        window.AISecEduUI
        && await window.AISecEduUI.confirm(message, options || {})
    );
}

async function settingsPrompt(message, options) {
    if (!window.AISecEduUI) return null;
    return window.AISecEduUI.prompt(message, options || {});
}

function settingsFetch(endpoint, options) {
    const requestOptions = {...(options || {})};
    const headers = {Accept: "application/json", ...(requestOptions.headers || {})};
    if (window.init && window.init.csrfNonce && !headers["CSRF-Token"]) {
        headers["CSRF-Token"] = window.init.csrfNonce;
    }
    requestOptions.headers = headers;
    requestOptions.credentials = requestOptions.credentials || "same-origin";
    const client = window.CTFd && typeof window.CTFd.fetch === "function"
        ? window.CTFd.fetch.bind(window.CTFd)
        : window.fetch.bind(window);
    return client(endpoint, requestOptions);
}

function formPayload(form) {
    const payload = {};
    new FormData(form).forEach((value, key) => {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            payload[key] = Array.isArray(payload[key])
                ? [...payload[key], value]
                : [payload[key], value];
        } else {
            payload[key] = value;
        }
    });
    return payload;
}

function renderRequestState(results, template, message) {
    if (!results) return;
    results.hidden = false;
    results.innerHTML = template;
    const messageNode = results.querySelector("#message");
    if (messageNode && message) messageNode.textContent = message;
}

function form_fetch_and_show(name, endpoint, method, success_message, confirm_msg = null) {
    const form = document.getElementById(`${name}-form`);
    const results = document.getElementById(`${name}-results`);
    if (!form) return;
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        if (results) results.replaceChildren();
        const params = formPayload(form);
        if (confirm_msg) {
            const confirmed = await confirm_msg(form, params);
            if (!confirmed) return;
        }
        if (submit) {
            submit.disabled = true;
            submit.setAttribute("aria-busy", "true");
        }
        renderRequestState(results, loading_template);
        try {
            const response = await settingsFetch(endpoint, {
                method,
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(params)
            });
            const result = await response.json();
            if (response.ok && result.success) {
                renderRequestState(results, success_template, success_message);
                form.dispatchEvent(new CustomEvent("aisecedu:success", {detail: result}));
            } else {
                renderRequestState(results, error_template, result.error || "操作未完成。");
            }
        } catch (error) {
            renderRequestState(results, error_template, error.message || "请求失败，请稍后重试。");
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.removeAttribute("aria-busy");
            }
        }
    });
}

function button_fetch_and_show(name, endpoint, method, data, success_message, abort_message, confirm_msg = null) {
    const button = document.getElementById(`${name}-button`);
    const results = document.getElementById(`${name}-results`);
    if (!button) return;
    button.addEventListener("click", async () => {
        if (results) results.replaceChildren();
        if (confirm_msg && !(await confirm_msg(data))) {
            renderRequestState(results, error_template, abort_message);
            return;
        }
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        renderRequestState(results, loading_template);
        try {
            const response = await settingsFetch(endpoint, {
                method,
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok && result.success) {
                renderRequestState(results, success_template, success_message);
            } else {
                renderRequestState(results, error_template, result.error || "操作未完成。");
            }
        } catch (error) {
            renderRequestState(results, error_template, error.message || "请求失败，请稍后重试。");
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
    });
}

function initializeSharedSettingsActions() {
    form_fetch_and_show("ssh-key", "/pwncollege_api/v1/ssh_key", "POST", "SSH 公钥已更新。");
    form_fetch_and_show("discord", "/pwncollege_api/v1/discord", "DELETE", "Discord 账号已断开连接。");
    form_fetch_and_show("dojo-create", "/pwncollege_api/v1/dojos/create", "POST", "课程已创建。");
    form_fetch_and_show("dojo-promote-admin", `/pwncollege_api/v1/dojos/${init.dojo}/admins/promote`, "POST", "用户已提升为教师。", async (form, params) => {
        const userName = form.querySelector(`#name-for-${CSS.escape(String(params["user_id"] || ""))}`)?.textContent.trim() || "该用户";
        return settingsConfirm(`确定将 ${userName}（UID ${params["user_id"]}）提升为教师吗？`, {
            title: "提升教师权限",
            confirmLabel: "提升",
        });
    });
    form_fetch_and_show("dojo-promote-dojo", `/pwncollege_api/v1/dojos/${init.dojo}/promote`, "POST", "课程已设为推荐课程。", async () => settingsConfirm("确定将此课程设为推荐课程吗？推荐课程会使用公开 slug 并展示在更多课程目录区。", {
        title: "设为推荐课程",
        confirmLabel: "确认设置",
    }));
    form_fetch_and_show("dojo-award-prune", `/pwncollege_api/v1/dojos/${init.dojo}/awards/prune`, "POST", "旧版徽章奖励已清理。", async () => settingsConfirm("确定根据更新后的完成要求清理所有已授予的表情徽章吗？", {
        title: "清理旧版徽章",
        confirmLabel: "清理",
        kind: "warning",
    }));
    button_fetch_and_show("dojo-delete", `/dojo/${init.dojo}/delete/`, "POST", {dojo: init.dojo}, "课程已删除。", "已取消删除课程。", async value => {
        const confirmation = await settingsPrompt(`此操作无法撤销。请输入课程 slug “${value.dojo}” 以确认删除。`, {
            title: "删除课程",
            inputLabel: "课程 slug",
            confirmLabel: "删除课程",
            kind: "danger",
        });
        return confirmation === value.dojo;
    });
    button_fetch_and_show("reset-home", "/pwncollege_api/v1/workspace/reset_home", "POST", {}, "Home 目录已重置，重置前备份位于 /home/hacker/home-backup.tar.gz。", "已取消重置 Home 目录。", async () => settingsConfirm("系统会先备份到 /home/hacker/home-backup.tar.gz，再清除 Home 中的其他内容。此操作影响所有题目实验环境，备份之后产生的修改无法恢复。确定继续吗？", {
        title: "重置 Home 目录",
        confirmLabel: "重置",
        kind: "danger",
    }));
    document.querySelectorAll(".copy-button").forEach(button => button.addEventListener("click", async event => {
        const group = event.currentTarget.closest("[data-copy-field], .input-group");
        const input = group?.querySelector("input, textarea");
        if (!input) return;
        input.select();
        input.setSelectionRange(0, input.value.length);
        try {
            await navigator.clipboard.writeText(input.value);
            window.AISecEduUI?.notify("已复制。", "success");
        } catch (error) {
            window.AISecEduUI?.notify("复制失败，请手动复制。", "danger");
        }
    }));
    document.addEventListener("click", event => {
        const target = event.target instanceof Element ? event.target : null;
        const close = target?.closest('[data-dismiss="alert"]');
        if (close) close.closest('[role="alert"]')?.remove();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSharedSettingsActions, {once: true});
} else {
    initializeSharedSettingsActions();
}

(function () {
    const VALID_SECTIONS = new Set(["profile", "account", "security", "appearance", "data"]);
    const VALID_PALETTES = new Set(["academy", "forest", "sunrise", "midnight"]);

    function escapeSettingsHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function responseError(payload, fallback) {
        if (payload && typeof payload.error === "string") return payload.error;
        if (payload && typeof payload.message === "string") return payload.message;
        if (payload && payload.errors && typeof payload.errors === "object") {
            const messages = Object.values(payload.errors).flat().filter(Boolean);
            if (messages.length) return messages.join("；");
        }
        return fallback;
    }

    async function settingsRequest(endpoint, options) {
        const config = options || {};
        const requestOptions = {
            method: config.method || "GET",
            credentials: "same-origin",
            headers: {Accept: "application/json"},
        };
        if (config.body !== undefined) {
            requestOptions.headers["Content-Type"] = "application/json";
            requestOptions.body = JSON.stringify(config.body);
        }
        const response = await settingsFetch(endpoint, requestOptions);
        const text = await response.text();
        let payload = {};
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch (error) {
                throw new Error("服务器返回了无法读取的响应。");
            }
        }
        if (!response.ok || payload.success === false) {
            throw new Error(responseError(payload, `请求失败（${response.status}）`));
        }
        return payload.data === undefined ? payload : payload.data;
    }

    function setSettingsStatus(element, message, kind) {
        if (!element) return;
        element.textContent = message || "";
        element.classList.toggle("is-success", kind === "success");
        element.classList.toggle("is-error", kind === "error");
    }

    async function withPending(button, action) {
        if (!button || button.disabled) return undefined;
        const wasDisabled = button.disabled;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
            return await action();
        } finally {
            button.disabled = wasDisabled;
            button.removeAttribute("aria-busy");
        }
    }

    function collectCustomFields(form) {
        return Array.from(form.querySelectorAll('[name^="fields["]')).flatMap(input => {
            const match = input.name.match(/^fields\[(\d+)\]$/);
            if (!match) return [];
            return [{
                field_id: Number(match[1]),
                value: input.type === "checkbox" ? input.checked : input.value,
            }];
        });
    }

    function formatSettingsTime(value) {
        if (!value) return "时间未知";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "时间未知";
        return new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    }

    async function copySettingsText(value, button) {
        try {
            await navigator.clipboard.writeText(value);
        } catch (error) {
            const input = button.closest("[data-copy-field]")?.querySelector("input");
            if (!input) throw error;
            input.select();
            document.execCommand("copy");
        }
        const original = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> 已复制';
        window.setTimeout(() => { button.innerHTML = original; }, 1400);
    }

    function initAccountSettings() {
        const root = document.getElementById("account-settings-app");
        if (!root || root.dataset.settingsReady === "true") return;
        root.dataset.settingsReady = "true";
        const endpoint = root.dataset.settingsEndpoint;
        const threadsEndpoint = root.dataset.threadsEndpoint;
        const isTeacher = root.dataset.isTeacher === "true";
        const state = {
            snapshot: null,
            archiveRequest: 0,
            archives: [],
        };

        function setActiveNavigation(section) {
            root.querySelectorAll("[data-settings-section]").forEach(button => {
                const active = button.dataset.settingsSection === section;
                button.classList.toggle("is-active", active);
                button.setAttribute("aria-selected", active ? "true" : "false");
            });
        }

        function setHash(value, replace) {
            const next = `#${value}`;
            if (window.location.hash === next) return;
            window.history[replace ? "replaceState" : "pushState"](null, "", next);
        }

        function showSection(section, updateHistory, replaceHistory) {
            const selected = VALID_SECTIONS.has(section) ? section : "profile";
            root.querySelectorAll("[data-settings-panel]").forEach(panel => {
                panel.hidden = panel.dataset.settingsPanel !== selected;
            });
            root.querySelectorAll("[data-settings-subpage]").forEach(panel => { panel.hidden = true; });
            setActiveNavigation(selected);
            if (updateHistory) setHash(selected, replaceHistory);
            root.querySelector(`[data-settings-panel="${selected}"] h2`)?.focus?.({preventScroll: true});
        }

        function showArchiveManager(updateHistory) {
            if (!isTeacher) return;
            root.querySelectorAll("[data-settings-panel]").forEach(panel => { panel.hidden = true; });
            root.querySelectorAll("[data-settings-subpage]").forEach(panel => {
                panel.hidden = panel.dataset.settingsSubpage !== "archives";
            });
            setActiveNavigation("data");
            if (updateHistory) setHash("data/archives", false);
            loadArchives(document.getElementById("settings-archive-search")?.value || "");
        }

        function applyLocation() {
            const target = decodeURIComponent(window.location.hash.slice(1));
            if (target === "data/archives" && isTeacher) {
                showArchiveManager(false);
                return;
            }
            showSection(target, true, true);
        }

        root.querySelectorAll("[data-settings-section]").forEach(button => {
            button.addEventListener("click", () => showSection(button.dataset.settingsSection, true, false));
        });
        root.querySelectorAll("[data-settings-open-subpage='archives']").forEach(button => {
            button.addEventListener("click", () => showArchiveManager(true));
        });
        root.querySelectorAll("[data-settings-close-subpage='archives']").forEach(button => {
            button.addEventListener("click", () => showSection("data", true, false));
        });
        window.addEventListener("popstate", applyLocation);
        applyLocation();

        function updateThemeSelection(preferences) {
            const appearance = preferences?.appearance || "light";
            const palette = preferences?.palette || "academy";
            root.querySelectorAll("[data-settings-appearance]").forEach(button => {
                button.setAttribute("aria-checked", button.dataset.settingsAppearance === appearance ? "true" : "false");
            });
            root.querySelectorAll("[data-settings-palette]").forEach(button => {
                button.setAttribute("aria-checked", appearance !== "system" && button.dataset.settingsPalette === palette ? "true" : "false");
            });
        }

        function applyCapabilities(capabilities) {
            const values = capabilities || {};
            const name = document.querySelector("#settings-account-form #name");
            const email = document.querySelector("#settings-account-form #email");
            const accountSubmit = document.querySelector('#settings-account-form [type="submit"]');
            if (name) name.readOnly = values.canChangeName === false;
            if (email) email.readOnly = values.canChangeEmail === false;
            if (accountSubmit) accountSubmit.disabled = values.canChangeName === false && values.canChangeEmail === false;
            const passwordSection = document.getElementById("settings-password-section");
            if (passwordSection) passwordSection.hidden = values.canChangePassword === false;
            const currentPasswordField = document.getElementById("settings-current-password-field");
            if (currentPasswordField) {
                currentPasswordField.hidden = values.canChangeEmail === false || values.requiresCurrentPasswordForEmail === false;
            }
            const oauthNotice = document.getElementById("settings-oauth-notice");
            if (oauthNotice) oauthNotice.hidden = values.oauthManaged !== true && state.snapshot?.profile?.oauthManaged !== true;
            const archiveEntry = root.querySelector("[data-settings-open-subpage='archives']")?.closest(".account-settings-subsection");
            if (archiveEntry) archiveEntry.hidden = !isTeacher || values.archivedConversations === false;
        }

        function applySnapshot(snapshot, applyTheme) {
            if (!snapshot || !snapshot.profile) return;
            state.snapshot = snapshot;
            const profile = snapshot.profile;
            const setValue = (selector, value) => {
                const element = document.querySelector(selector);
                if (element && document.activeElement !== element) element.value = value == null ? "" : value;
            };
            setValue("#settings-account-form #name", profile.name);
            setValue("#settings-account-form #email", profile.email);
            setValue("#settings-profile-form #affiliation", profile.affiliation);
            setValue("#settings-profile-form #website", profile.website);
            setValue("#settings-profile-form #country", profile.country);
            const hidden = document.getElementById("settings-profile-hidden");
            if (hidden && document.activeElement !== hidden) hidden.checked = Boolean(profile.hidden);
            const verification = document.getElementById("settings-email-verification");
            if (verification) verification.textContent = profile.verified ? "已验证" : "尚未验证";
            applyCapabilities({...snapshot.capabilities, oauthManaged: profile.oauthManaged});
            const preferences = snapshot.preferences || {};
            let palette = VALID_PALETTES.has(preferences.palette) ? preferences.palette : "academy";
            const appearance = ["system", "light", "dark"].includes(preferences.appearance)
                ? preferences.appearance
                : palette === "midnight" ? "dark" : "light";
            if (appearance === "dark") palette = "midnight";
            if (appearance === "light" && palette === "midnight") palette = "academy";
            const reducedMotion = Boolean(preferences.reducedMotion);
            const motion = document.getElementById("settings-reduced-motion");
            if (motion && document.activeElement !== motion) motion.checked = reducedMotion;
            if (applyTheme && window.AISecEduUI) {
                window.AISecEduUI.applyPreferences({appearance, palette, reducedMotion}, true);
            }
            updateThemeSelection({appearance, palette});
        }

        async function loadSettings() {
            try {
                const snapshot = await settingsRequest(endpoint);
                applySnapshot(snapshot, true);
            } catch (error) {
                setSettingsStatus(document.getElementById("settings-profile-status"), `无法读取最新账户设置：${error.message}`, "error");
            }
        }

        const profileForm = document.getElementById("settings-profile-form");
        profileForm?.addEventListener("submit", event => {
            event.preventDefault();
            const button = profileForm.querySelector('[type="submit"]');
            const status = document.getElementById("settings-profile-status");
            withPending(button, async () => {
                setSettingsStatus(status, "正在保存…");
                try {
                    const profile = {
                        affiliation: profileForm.querySelector("#affiliation")?.value.trim() || "",
                        website: profileForm.querySelector("#website")?.value.trim() || "",
                        country: profileForm.querySelector("#country")?.value || "",
                        hidden: Boolean(document.getElementById("settings-profile-hidden")?.checked),
                    };
                    const snapshot = await settingsRequest(endpoint, {method: "PATCH", body: {profile}});
                    const fields = collectCustomFields(profileForm);
                    if (fields.length) {
                        try {
                            await settingsRequest("/api/v1/users/me", {method: "PATCH", body: {fields}});
                        } catch (error) {
                            applySnapshot(snapshot, false);
                            setSettingsStatus(status, `基本资料已保存，但扩展资料未保存：${error.message}`, "error");
                            return;
                        }
                    }
                    applySnapshot(snapshot, false);
                    setSettingsStatus(status, "个人资料已保存。", "success");
                } catch (error) {
                    setSettingsStatus(status, error.message, "error");
                }
            });
        });

        const accountForm = document.getElementById("settings-account-form");
        accountForm?.addEventListener("submit", event => {
            event.preventDefault();
            const button = accountForm.querySelector('[type="submit"]');
            const status = document.getElementById("settings-account-status");
            withPending(button, async () => {
                setSettingsStatus(status, "正在保存…");
                try {
                    const profile = {};
                    if (state.snapshot?.capabilities?.canChangeName !== false) {
                        profile.name = accountForm.querySelector("#name")?.value.trim();
                    }
                    if (state.snapshot?.capabilities?.canChangeEmail !== false) {
                        profile.email = accountForm.querySelector("#email")?.value.trim();
                    }
                    const currentPassword = document.getElementById("settings-current-password")?.value || "";
                    const body = {profile};
                    if (currentPassword) body.currentPassword = currentPassword;
                    const snapshot = await settingsRequest(endpoint, {method: "PATCH", body});
                    applySnapshot(snapshot, false);
                    accountForm.querySelector("#settings-current-password").value = "";
                    setSettingsStatus(status, "账户信息已保存。", "success");
                } catch (error) {
                    setSettingsStatus(status, error.message, "error");
                }
            });
        });

        const passwordForm = document.getElementById("settings-password-form");
        passwordForm?.addEventListener("submit", event => {
            event.preventDefault();
            const button = passwordForm.querySelector('[type="submit"]');
            const status = document.getElementById("settings-password-status");
            withPending(button, async () => {
                const currentPassword = document.getElementById("settings-password-current").value;
                const newPassword = document.getElementById("settings-password-new").value;
                const confirmPassword = document.getElementById("settings-password-confirm").value;
                if (newPassword !== confirmPassword) {
                    setSettingsStatus(status, "两次输入的新密码不一致。", "error");
                    return;
                }
                setSettingsStatus(status, "正在更新密码…");
                try {
                    await settingsRequest(`${endpoint}/password`, {
                        method: "POST",
                        body: {currentPassword, newPassword, confirmPassword},
                    });
                    passwordForm.reset();
                    setSettingsStatus(status, "密码已更新，其他旧登录会话已失效。", "success");
                } catch (error) {
                    setSettingsStatus(status, error.message, "error");
                }
            });
        });

        async function saveAppearance(button, preferences, progressMessage) {
            const status = document.getElementById("settings-appearance-status");
            return withPending(button, async () => {
                setSettingsStatus(status, progressMessage || "正在保存外观偏好…");
                try {
                    const snapshot = await settingsRequest(endpoint, {method: "PATCH", body: {preferences}});
                    applySnapshot(snapshot, true);
                    setSettingsStatus(status, "外观偏好已保存并应用。", "success");
                } catch (error) {
                    setSettingsStatus(status, error.message, "error");
                }
            });
        }

        root.querySelectorAll("[data-settings-palette]").forEach(button => {
            button.addEventListener("click", () => {
                const palette = button.dataset.settingsPalette;
                saveAppearance(button, {
                    palette,
                    appearance: palette === "midnight" ? "dark" : "light",
                }, "正在保存主题…");
            });
        });
        root.querySelectorAll("[data-settings-appearance='system']").forEach(button => {
            button.addEventListener("click", () => saveAppearance(button, {
                appearance: "system",
                palette: state.snapshot?.preferences?.palette === "midnight"
                    ? "academy"
                    : state.snapshot?.preferences?.palette || "academy",
            }, "正在启用系统外观…"));
        });
        const reducedMotionInput = document.getElementById("settings-reduced-motion");
        reducedMotionInput?.addEventListener("change", () => saveAppearance(reducedMotionInput, {
            reducedMotion: reducedMotionInput.checked,
        }, "正在保存动态效果偏好…"));
        updateThemeSelection({
            appearance: document.documentElement.dataset.aiseceduAppearance || "light",
            palette: document.documentElement.dataset.aiseceduPalette || "academy",
        });

        const tokenForm = document.getElementById("settings-token-form");
        tokenForm?.addEventListener("submit", event => {
            event.preventDefault();
            const button = tokenForm.querySelector('[type="submit"]');
            withPending(button, async () => {
                try {
                    const form = new FormData(tokenForm);
                    const body = {
                        expiration: form.get("expiration") || null,
                        description: String(form.get("description") || "").trim(),
                    };
                    if (!body.expiration) delete body.expiration;
                    const token = await settingsRequest("/api/v1/tokens", {method: "POST", body});
                    const result = document.getElementById("settings-token-result");
                    result.hidden = false;
                    result.innerHTML = `<strong>令牌已生成，请立即复制。关闭或刷新页面后将无法再次查看。</strong><div data-copy-field><input type="text" value="${escapeSettingsHtml(token.value)}" readonly aria-label="新访问令牌"><button type="button" class="account-settings-secondary" data-copy-token="${escapeSettingsHtml(token.value)}"><i class="fas fa-copy" aria-hidden="true"></i> 复制</button></div>`;
                    let list = root.querySelector(".account-settings-token-list");
                    if (!list) {
                        list = document.createElement("div");
                        list.className = "account-settings-token-list";
                        list.setAttribute("aria-label", "有效访问令牌");
                        root.querySelector("[data-token-empty]")?.replaceWith(list);
                    }
                    const tokenId = escapeSettingsHtml(token.id);
                    const description = escapeSettingsHtml(body.description || "未命名令牌");
                    const expiration = body.expiration ? ` · 到期 ${escapeSettingsHtml(formatSettingsTime(body.expiration))}` : "";
                    list.insertAdjacentHTML("afterbegin", `<div class="account-settings-token" data-token-row="${tokenId}"><i class="fas fa-key" aria-hidden="true"></i><span><strong>${description}</strong><small>刚刚创建${expiration}</small></span><button type="button" class="settings-delete-token" data-token-id="${tokenId}" aria-label="删除令牌 ${description}"><i class="fas fa-trash-alt" aria-hidden="true"></i></button></div>`);
                    tokenForm.reset();
                } catch (error) {
                    const result = document.getElementById("settings-token-result");
                    result.hidden = false;
                    result.innerHTML = `<p class="account-settings-status is-error">${escapeSettingsHtml(error.message)}</p>`;
                }
            });
        });

        root.addEventListener("click", event => {
            const copyButton = event.target.closest("[data-copy-token]");
            if (copyButton) {
                copySettingsText(copyButton.dataset.copyToken, copyButton).catch(error => {
                    const result = document.getElementById("settings-token-result");
                    result.insertAdjacentHTML("beforeend", `<p class="account-settings-status is-error">${escapeSettingsHtml(error.message)}</p>`);
                });
                return;
            }
            const deleteButton = event.target.closest(".settings-delete-token");
            if (!deleteButton) return;
            withPending(deleteButton, async () => {
                const confirmed = await settingsConfirm("删除后，使用此令牌的程序会立即失去访问权限。", {
                    title: "删除访问令牌",
                    confirmLabel: "删除",
                    kind: "danger",
                });
                if (!confirmed) return;
                try {
                    await settingsRequest(`/api/v1/tokens/${encodeURIComponent(deleteButton.dataset.tokenId)}`, {method: "DELETE"});
                    deleteButton.closest("[data-token-row]")?.remove();
                    if (!root.querySelector("[data-token-row]")) {
                        const empty = document.createElement("p");
                        empty.className = "account-settings-empty is-compact";
                        empty.dataset.tokenEmpty = "";
                        empty.textContent = "当前没有有效令牌。";
                        document.querySelector(".account-settings-token-list")?.replaceWith(empty);
                    }
                    window.AISecEduUI?.notify("访问令牌已删除。", "success");
                } catch (error) {
                    window.AISecEduUI?.notify(error.message, "danger");
                }
            });
        });

        root.querySelectorAll('[id^="delete-ssh-key-"][id$="-form"]').forEach(form => {
            form.addEventListener("aisecedu:success", () => window.setTimeout(() => form.remove(), 350));
        });
        document.getElementById("ssh-key-form")?.addEventListener("aisecedu:success", () => {
            const input = document.getElementById("settings-ssh-key");
            if (input) input.value = "";
        });
        document.getElementById("discord-form")?.addEventListener("aisecedu:success", () => window.setTimeout(() => window.location.reload(), 650));

        function renderArchives(threads) {
            const list = document.getElementById("settings-archive-list");
            if (!list) return;
            if (!threads.length) {
                list.innerHTML = '<p class="account-settings-empty">没有找到匹配的归档对话。</p>';
                return;
            }
            list.innerHTML = threads.map(thread => {
                const detail = thread.latestMessage || `${Number(thread.messageCount) || 0} 条消息`;
                const id = escapeSettingsHtml(thread.id);
                const title = escapeSettingsHtml(thread.title || "未命名对话");
                return `<article class="account-settings-archive-item" data-archive-thread="${id}"><i class="fas fa-comment-alt" aria-hidden="true"></i><span class="account-settings-archive-copy"><strong>${title}</strong><small>${escapeSettingsHtml(detail)} · 归档于 ${escapeSettingsHtml(formatSettingsTime(thread.archivedAt || thread.updated))}</small></span><span class="account-settings-archive-actions"><button type="button" data-restore-thread="${id}"><i class="fas fa-undo" aria-hidden="true"></i> 恢复</button><button type="button" class="is-danger" data-delete-thread="${id}" data-thread-title="${title}"><i class="fas fa-trash-alt" aria-hidden="true"></i> 永久删除</button></span></article>`;
            }).join("");
        }

        function removeArchivedThread(id) {
            const threadId = String(id);
            document.querySelectorAll("[data-archive-thread]").forEach(item => {
                if (item.dataset.archiveThread === threadId) item.remove();
            });
            state.archives = state.archives.filter(thread => String(thread.id) !== String(id));
            if (!state.archives.length) renderArchives([]);
            refreshArchiveSummary();
        }

        async function fetchArchives(query) {
            const params = new URLSearchParams({view: "archived"});
            if (query.trim()) params.set("q", query.trim());
            const result = await settingsRequest(`${threadsEndpoint}?${params.toString()}`);
            return Array.isArray(result.threads) ? result.threads : [];
        }

        async function refreshArchiveSummary() {
            if (!isTeacher) return;
            const summary = document.getElementById("settings-archive-summary-count");
            try {
                const threads = await fetchArchives("");
                if (summary) summary.textContent = `${threads.length} 条`;
            } catch (error) {
                if (summary) summary.textContent = "读取失败";
            }
        }

        async function loadArchives(query) {
            if (!isTeacher) return;
            const requestId = ++state.archiveRequest;
            const status = document.getElementById("settings-archive-status");
            const list = document.getElementById("settings-archive-list");
            const refresh = document.getElementById("settings-archive-refresh");
            if (list) list.setAttribute("aria-busy", "true");
            if (refresh) refresh.disabled = true;
            setSettingsStatus(status, "正在读取归档对话…");
            try {
                const threads = await fetchArchives(query);
                if (requestId !== state.archiveRequest) return;
                state.archives = threads;
                renderArchives(threads);
                setSettingsStatus(status, `找到 ${threads.length} 条归档对话。`, "success");
                const summary = document.getElementById("settings-archive-summary-count");
                if (summary && !query.trim()) summary.textContent = `${threads.length} 条`;
            } catch (error) {
                if (requestId !== state.archiveRequest) return;
                if (list) list.innerHTML = "";
                setSettingsStatus(status, error.message, "error");
            } finally {
                if (requestId === state.archiveRequest) {
                    if (list) list.removeAttribute("aria-busy");
                    if (refresh) refresh.disabled = false;
                }
            }
        }

        let archiveSearchTimer = null;
        const archiveSearch = document.getElementById("settings-archive-search");
        archiveSearch?.addEventListener("input", () => {
            window.clearTimeout(archiveSearchTimer);
            archiveSearchTimer = window.setTimeout(() => loadArchives(archiveSearch.value), 260);
        });
        document.getElementById("settings-archive-refresh")?.addEventListener("click", () => loadArchives(archiveSearch?.value || ""));
        document.getElementById("settings-archive-list")?.addEventListener("click", event => {
            const button = event.target.closest("[data-restore-thread], [data-delete-thread]");
            if (!button) return;
            withPending(button, async () => {
                const status = document.getElementById("settings-archive-status");
                try {
                    if (button.dataset.restoreThread) {
                        const id = button.dataset.restoreThread;
                        await settingsRequest(`${threadsEndpoint}/${encodeURIComponent(id)}`, {
                            method: "PATCH",
                            body: {archived: false},
                        });
                        removeArchivedThread(id);
                        setSettingsStatus(status, "对话已恢复，并重新出现在 AI 共创中。", "success");
                        return;
                    }
                    const id = button.dataset.deleteThread;
                    const confirmed = await settingsConfirm(`“${button.dataset.threadTitle || "此对话"}”及其消息将被永久删除，无法恢复。`, {
                        title: "永久删除归档对话",
                        confirmLabel: "永久删除",
                        kind: "danger",
                    });
                    if (!confirmed) return;
                    await settingsRequest(`${threadsEndpoint}/${encodeURIComponent(id)}`, {
                        method: "DELETE",
                        body: {confirmed: true},
                    });
                    removeArchivedThread(id);
                    setSettingsStatus(status, "归档对话已永久删除。", "success");
                } catch (error) {
                    setSettingsStatus(status, error.message, "error");
                }
            });
        });
        document.addEventListener("keydown", event => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !document.getElementById("settings-panel-archives")?.hidden) {
                event.preventDefault();
                archiveSearch?.focus();
            }
        });

        document.querySelectorAll("[data-time]").forEach(element => {
            element.textContent = formatSettingsTime(element.dataset.time);
        });
        refreshArchiveSummary();
        loadSettings();
    }

    document.addEventListener("DOMContentLoaded", initAccountSettings);
})();

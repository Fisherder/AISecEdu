(function () {
    const STORAGE_KEY = "aisecedu-theme";
    const VALID_THEMES = new Set(["dark", "light"]);
    let activeDialog = null;
    let lastNotice = {key: "", at: 0};

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function preferredTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (VALID_THEMES.has(saved)) return saved;
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    }

    function applyTheme(theme, persist) {
        const next = VALID_THEMES.has(theme) ? theme : preferredTheme();
        document.documentElement.dataset.aiseceduTheme = next;
        document.documentElement.style.colorScheme = next;
        if (persist) localStorage.setItem(STORAGE_KEY, next);
        document.querySelectorAll("[data-theme-toggle]").forEach(button => {
            const light = next === "light";
            button.setAttribute("aria-label", light ? "切换深色主题" : "切换浅色主题");
            button.setAttribute("title", light ? "深色主题" : "浅色主题");
            button.innerHTML = `<i class="fas ${light ? "fa-moon" : "fa-sun"}" aria-hidden="true"></i><span class="d-lg-none ml-2">${light ? "深色主题" : "浅色主题"}</span>`;
        });
        window.dispatchEvent(new CustomEvent("aisecedu:themechange", {detail: {theme: next}}));
        return next;
    }

    function closeActiveDialog(reason) {
        if (!activeDialog) return;
        const current = activeDialog;
        activeDialog = null;
        current.layer.classList.remove("is-visible");
        document.body.classList.remove("aisecedu-dialog-open");
        window.setTimeout(() => current.layer.remove(), 160);
        if (current.resolve) current.resolve(reason || "closed");
        if (current.returnFocus && typeof current.returnFocus.focus === "function") {
            current.returnFocus.focus();
        }
    }

    function dialog(options) {
        const config = typeof options === "string" ? {message: options} : (options || {});
        closeActiveDialog("replaced");
        const kind = ["success", "danger", "warning", "info", "progress"].includes(config.kind)
            ? config.kind
            : "info";
        const icon = {
            success: "fa-check",
            danger: "fa-exclamation-triangle",
            warning: "fa-exclamation",
            info: "fa-info",
            progress: "fa-spinner fa-spin",
        }[kind];
        const layer = document.createElement("div");
        layer.className = "aisecedu-dialog-layer";
        layer.setAttribute("role", "presentation");
        layer.innerHTML = `
            <section class="aisecedu-dialog is-${kind}" role="${kind === "danger" ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="aisecedu-dialog-title">
                <header class="aisecedu-dialog-header">
                    <span class="aisecedu-dialog-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
                    <div>
                        <h2 id="aisecedu-dialog-title">${escapeHtml(config.title || {
                            success: "操作完成",
                            danger: "需要处理",
                            warning: "请注意",
                            info: "提示",
                            progress: "正在处理",
                        }[kind])}</h2>
                        ${config.subtitle ? `<p>${escapeHtml(config.subtitle)}</p>` : ""}
                    </div>
                    ${config.closeable === false ? "" : '<button type="button" class="aisecedu-dialog-close" aria-label="关闭"><i class="fas fa-times"></i></button>'}
                </header>
                <div class="aisecedu-dialog-body">
                    <p class="aisecedu-dialog-message"></p>
                    <div class="aisecedu-dialog-details" hidden></div>
                </div>
                <footer class="aisecedu-dialog-actions"></footer>
            </section>`;
        const message = layer.querySelector(".aisecedu-dialog-message");
        message.textContent = config.message || "";
        message.hidden = !config.message;
        const details = layer.querySelector(".aisecedu-dialog-details");
        if (config.details) {
            details.textContent = config.details;
            details.hidden = false;
        }
        let input = null;
        if (config.input) {
            const inputConfig = typeof config.input === "object" ? config.input : {};
            const field = document.createElement("label");
            field.className = "aisecedu-dialog-input";
            field.textContent = inputConfig.label || "请输入";
            input = document.createElement("input");
            input.type = inputConfig.type || "text";
            input.className = "form-control";
            input.value = inputConfig.value || "";
            input.placeholder = inputConfig.placeholder || "";
            input.autocomplete = "off";
            if (inputConfig.maxLength) input.maxLength = inputConfig.maxLength;
            field.appendChild(input);
            layer.querySelector(".aisecedu-dialog-body").appendChild(field);
        }
        const actions = layer.querySelector(".aisecedu-dialog-actions");
        const actionItems = Array.isArray(config.actions) && config.actions.length
            ? config.actions
            : [{label: "确定", value: "ok", primary: true}];
        actionItems.forEach(action => {
            const button = document.createElement("button");
            button.type = "button";
            const actionStyle = action.style || (
                action.primary
                    ? kind === "danger" ? "danger" : "primary"
                    : "outline-secondary"
            );
            button.className = `btn btn-${actionStyle}`;
            button.textContent = action.label || "OK";
            button.dataset.dialogAction = action.value || "ok";
            button.addEventListener("click", () => closeActiveDialog(button.dataset.dialogAction));
            actions.appendChild(button);
        });
        if (config.actions === false) actions.hidden = true;
        const returnFocus = document.activeElement;
        let resolve;
        const closed = new Promise(done => { resolve = done; });
        activeDialog = {layer, resolve, returnFocus};
        document.body.appendChild(layer);
        document.body.classList.add("aisecedu-dialog-open");
        requestAnimationFrame(() => {
            if (activeDialog && activeDialog.layer === layer) {
                layer.classList.add("is-visible");
            }
        });
        const close = layer.querySelector(".aisecedu-dialog-close");
        if (close) close.addEventListener("click", () => closeActiveDialog("closed"));
        layer.addEventListener("click", event => {
            if (event.target === layer && config.closeable !== false) closeActiveDialog("closed");
        });
        layer.addEventListener("keydown", event => {
            if (event.key === "Escape" && config.closeable !== false) {
                event.preventDefault();
                closeActiveDialog("closed");
                return;
            }
            if (event.key === "Enter" && !input && !event.target.closest("textarea")) {
                const primary = actions.querySelector("[data-dialog-action='confirm'], .btn-primary, .btn-danger");
                if (primary) {
                    event.preventDefault();
                    primary.click();
                }
            }
        });
        const firstFocusable = input || layer.querySelector("button");
        if (firstFocusable) firstFocusable.focus();
        return {
            layer,
            closed,
            input,
            close: reason => {
                if (activeDialog && activeDialog.layer === layer) closeActiveDialog(reason);
            },
            update(next) {
                if (typeof next === "string") {
                    message.textContent = next;
                    message.hidden = !next;
                    return;
                }
                if (!next) return;
                if (Object.prototype.hasOwnProperty.call(next, "message")) {
                    message.textContent = next.message || "";
                    message.hidden = !next.message;
                }
                if (Object.prototype.hasOwnProperty.call(next, "details")) {
                    details.textContent = next.details || "";
                    details.hidden = !next.details;
                }
                if (next.title) layer.querySelector("#aisecedu-dialog-title").textContent = next.title;
            },
        };
    }

    function notify(message, kind, options) {
        if (!message) return null;
        const config = {...(options || {}), message, kind: kind || "info"};
        const key = config.dedupeKey || `${config.kind}:${message}`;
        const now = Date.now();
        if (key === lastNotice.key && now - lastNotice.at < 1200) return null;
        lastNotice = {key, at: now};
        return dialog(config);
    }

    async function confirmAction(message, options) {
        const result = dialog({
            ...(options || {}),
            kind: (options && options.kind) || "warning",
            message,
            actions: [
                {label: (options && options.cancelLabel) || "取消", value: "cancel"},
                {
                    label: (options && options.confirmLabel) || "继续",
                    value: "confirm",
                    primary: true,
                    style: options && options.confirmStyle,
                },
            ],
        });
        return (await result.closed) === "confirm";
    }

    async function promptAction(message, options) {
        const config = options || {};
        const result = dialog({
            ...config,
            message,
            input: {
                label: config.inputLabel || "请输入",
                placeholder: config.placeholder || "",
                value: config.value || "",
                maxLength: config.maxLength,
                type: config.type || "text",
            },
            actions: [
                {label: config.cancelLabel || "取消", value: "cancel"},
                {label: config.confirmLabel || "确认", value: "confirm", primary: true},
            ],
        });
        return (await result.closed) === "confirm" && result.input
            ? result.input.value
            : null;
    }

    window.AISecEduUI = {
        applyTheme,
        close: closeActiveDialog,
        confirm: confirmAction,
        dialog,
        notify,
        prompt: promptAction,
        theme: () => document.documentElement.dataset.aiseceduTheme || preferredTheme(),
        toggleTheme: () => applyTheme(
            (document.documentElement.dataset.aiseceduTheme || preferredTheme()) === "dark" ? "light" : "dark",
            true,
        ),
    };

    document.addEventListener("DOMContentLoaded", function () {
        applyTheme(document.documentElement.dataset.aiseceduTheme || preferredTheme(), false);
        document.querySelectorAll("[data-theme-toggle]").forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                window.AISecEduUI.toggleTheme();
            });
        });
    });
})();

(function () {
    const STORAGE_KEY = "aisecedu-palette";
    const LEGACY_THEME_KEY = "aisecedu-theme";
    const LIGHT_PALETTE_KEY = "aisecedu-light-palette";
    const APPEARANCE_KEY = "aisecedu-appearance";
    const REDUCED_MOTION_KEY = "aisecedu-reduced-motion";
    const PALETTES = {
        academy: {label: "学院蓝", mode: "light", color: "#f3f6fb"},
        forest: {label: "书院绿", mode: "light", color: "#f3f6f1"},
        sunrise: {label: "暖沙橙", mode: "light", color: "#faf5ed"},
        midnight: {label: "深海夜", mode: "dark", color: "#0b1220"},
    };
    const VALID_PALETTES = new Set(Object.keys(PALETTES));
    const VALID_APPEARANCES = new Set(["system", "light", "dark"]);
    let activeDialog = null;
    let activeFloatingMenu = null;
    let floatingMenuSequence = 0;
    let toastStack = null;
    let lastNotice = {key: "", at: 0};

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function disclosureMenuParts(details) {
        if (!(details instanceof HTMLDetailsElement)) return null;
        const summary = details.firstElementChild;
        if (
            !(summary instanceof HTMLElement) ||
            summary.tagName !== "SUMMARY" ||
            !summary.querySelector(".fa-ellipsis-h, .fa-ellipsis-v")
        ) return null;
        const panel = Array.from(details.children).find(child => child !== summary);
        return panel instanceof HTMLElement ? {summary, panel} : null;
    }

    function positionFloatingMenu(record) {
        if (!record || record !== activeFloatingMenu) return;
        const {summary, panel} = record;
        const gutter = 10;
        const gap = 7;
        panel.style.visibility = "hidden";
        panel.style.maxHeight = `${Math.max(120, window.innerHeight - gutter * 2)}px`;
        panel.style.setProperty("right", "auto", "important");
        panel.style.setProperty("bottom", "auto", "important");
        panel.style.setProperty("left", "0px", "important");
        panel.style.setProperty("top", "0px", "important");
        const anchor = summary.getBoundingClientRect();
        const menu = panel.getBoundingClientRect();
        const below = window.innerHeight - anchor.bottom - gutter;
        const above = anchor.top - gutter;
        let top = below >= menu.height + gap || below >= above
            ? Math.min(window.innerHeight - menu.height - gutter, anchor.bottom + gap)
            : Math.max(gutter, anchor.top - menu.height - gap);
        let left = Math.max(
            gutter,
            Math.min(window.innerWidth - menu.width - gutter, anchor.right - menu.width),
        );
        top = Math.max(gutter, top);
        panel.style.setProperty("left", `${Math.round(left)}px`, "important");
        panel.style.setProperty("top", `${Math.round(top)}px`, "important");

        const placed = panel.getBoundingClientRect();
        if (placed.right > window.innerWidth - gutter) {
            left -= placed.right - (window.innerWidth - gutter);
        }
        if (placed.left < gutter) left += gutter - placed.left;
        if (placed.bottom > window.innerHeight - gutter) {
            top -= placed.bottom - (window.innerHeight - gutter);
        }
        if (placed.top < gutter) top += gutter - placed.top;
        panel.style.setProperty("left", `${Math.round(left)}px`, "important");
        panel.style.setProperty("top", `${Math.round(top)}px`, "important");
        panel.style.visibility = "visible";
    }

    function closeFloatingMenu(options) {
        if (!activeFloatingMenu) return;
        const record = activeFloatingMenu;
        activeFloatingMenu = null;
        record.observer?.disconnect();
        record.details.open = false;
        record.summary.setAttribute("aria-expanded", "false");
        record.panel.classList.remove("aisecedu-floating-menu");
        if (record.originalStyle === null) record.panel.removeAttribute("style");
        else record.panel.setAttribute("style", record.originalStyle);
        if (record.placeholder.parentNode) {
            record.placeholder.parentNode.insertBefore(record.panel, record.placeholder);
            record.placeholder.remove();
        } else if (record.details.isConnected) {
            record.details.appendChild(record.panel);
        } else {
            record.panel.remove();
        }
        if (options && options.restoreFocus && record.summary.isConnected) {
            record.summary.focus({preventScroll: true});
        }
    }

    function openFloatingMenu(details) {
        const parts = disclosureMenuParts(details);
        if (!parts) return;
        if (activeFloatingMenu && activeFloatingMenu.details === details) return;
        closeFloatingMenu();
        const placeholder = document.createComment("aisecedu-floating-menu");
        const panelId = parts.panel.id || `aisecedu-floating-menu-${++floatingMenuSequence}`;
        parts.panel.id = panelId;
        parts.summary.setAttribute("aria-controls", panelId);
        parts.summary.setAttribute("aria-haspopup", "menu");
        parts.summary.setAttribute("aria-expanded", "true");
        if (!parts.panel.hasAttribute("role")) parts.panel.setAttribute("role", "menu");
        parts.panel.querySelectorAll("button, a[href]").forEach(item => {
            if (!item.hasAttribute("role")) item.setAttribute("role", "menuitem");
        });
        parts.panel.parentNode.insertBefore(placeholder, parts.panel);
        const originalStyle = parts.panel.getAttribute("style");
        document.body.appendChild(parts.panel);
        parts.panel.classList.add("aisecedu-floating-menu");
        const record = {
            details,
            summary: parts.summary,
            panel: parts.panel,
            placeholder,
            originalStyle,
            observer: null,
        };
        activeFloatingMenu = record;
        record.observer = new MutationObserver(() => {
            if (activeFloatingMenu === record && !record.details.isConnected) {
                closeFloatingMenu();
            }
        });
        record.observer.observe(document.body, {childList: true, subtree: true});
        positionFloatingMenu(record);
    }

    function preferredPalette() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (VALID_PALETTES.has(saved)) return saved;
            return localStorage.getItem(LEGACY_THEME_KEY) === "dark" ? "midnight" : "academy";
        } catch (error) {
            return "academy";
        }
    }

    function preferredLightPalette() {
        try {
            const saved = localStorage.getItem(LIGHT_PALETTE_KEY);
            return VALID_PALETTES.has(saved) && PALETTES[saved].mode === "light" ? saved : "academy";
        } catch (error) {
            return "academy";
        }
    }

    function currentPalette() {
        const current = document.documentElement.dataset.aiseceduPalette;
        return VALID_PALETTES.has(current) ? current : preferredPalette();
    }

    function preferredAppearance() {
        try {
            const saved = localStorage.getItem(APPEARANCE_KEY);
            if (VALID_APPEARANCES.has(saved)) return saved;
            return PALETTES[preferredPalette()].mode;
        } catch (error) {
            return PALETTES[preferredPalette()].mode;
        }
    }

    function preferredReducedMotion() {
        try {
            return localStorage.getItem(REDUCED_MOTION_KEY) === "true";
        } catch (error) {
            return false;
        }
    }

    function ensureReducedMotionStyles() {
        if (document.getElementById("aisecedu-reduced-motion-styles")) return;
        const style = document.createElement("style");
        style.id = "aisecedu-reduced-motion-styles";
        style.textContent = `
            :root[data-aisecedu-motion="reduced"] { scroll-behavior: auto !important; }
            :root[data-aisecedu-motion="reduced"] *,
            :root[data-aisecedu-motion="reduced"] *::before,
            :root[data-aisecedu-motion="reduced"] *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
            }`;
        document.head.appendChild(style);
    }

    function applyMotion(reduced, persist) {
        const next = Boolean(reduced);
        ensureReducedMotionStyles();
        document.documentElement.dataset.aiseceduMotion = next ? "reduced" : "full";
        if (persist) {
            try {
                localStorage.setItem(REDUCED_MOTION_KEY, String(next));
            } catch (error) {
                console.warn("Unable to persist the 玄甲 motion preference", error);
            }
        }
        window.dispatchEvent(new CustomEvent("aisecedu:motionchange", {detail: {reduced: next}}));
        return next;
    }

    function systemPrefersDark() {
        return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    function resolvePalette(appearance, palette) {
        const preferred = VALID_PALETTES.has(palette) ? palette : preferredPalette();
        const light = PALETTES[preferred].mode === "light" ? preferred : preferredLightPalette();
        if (appearance === "dark") return "midnight";
        if (appearance === "system") return systemPrefersDark() ? "midnight" : light;
        return light;
    }

    function applyAppearance(appearance, palette, persist) {
        const nextAppearance = VALID_APPEARANCES.has(appearance) ? appearance : preferredAppearance();
        let preferred = VALID_PALETTES.has(palette) ? palette : preferredPalette();
        if (nextAppearance === "dark") preferred = "midnight";
        if (nextAppearance !== "dark" && preferred === "midnight") preferred = preferredLightPalette();
        const resolved = resolvePalette(nextAppearance, preferred);
        const config = PALETTES[resolved];
        document.documentElement.dataset.aiseceduAppearance = nextAppearance;
        document.documentElement.dataset.aiseceduPalette = resolved;
        document.documentElement.dataset.aiseceduTheme = config.mode;
        document.documentElement.style.colorScheme = config.mode;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", config.color);
        if (persist) {
            try {
                localStorage.setItem(APPEARANCE_KEY, nextAppearance);
                localStorage.setItem(STORAGE_KEY, preferred);
                localStorage.setItem(LEGACY_THEME_KEY, config.mode);
                if (PALETTES[preferred].mode === "light") localStorage.setItem(LIGHT_PALETTE_KEY, preferred);
            } catch (error) {
                console.warn("Unable to persist the selected 玄甲 appearance", error);
            }
        }
        window.dispatchEvent(new CustomEvent("aisecedu:themechange", {
            detail: {appearance: nextAppearance, theme: config.mode, palette: resolved, label: config.label},
        }));
        return resolved;
    }

    function applyPreferences(preferences, persist) {
        const values = preferences || {};
        const appearance = VALID_APPEARANCES.has(values.appearance) ? values.appearance : preferredAppearance();
        const palette = VALID_PALETTES.has(values.palette) ? values.palette : preferredPalette();
        applyAppearance(appearance, palette, persist);
        applyMotion(values.reducedMotion === undefined ? preferredReducedMotion() : values.reducedMotion, persist);
        return {appearance, palette, reducedMotion: document.documentElement.dataset.aiseceduMotion === "reduced"};
    }

    function applyPalette(palette, persist) {
        const next = VALID_PALETTES.has(palette) ? palette : preferredPalette();
        const config = PALETTES[next];
        applyAppearance(config.mode, next, persist);
        return next;
    }

    function applyTheme(theme, persist) {
        if (VALID_PALETTES.has(theme)) return applyPalette(theme, persist);
        if (theme === "dark") return applyPalette("midnight", persist);
        if (theme === "light") {
            const active = currentPalette();
            return applyPalette(PALETTES[active].mode === "light" ? active : preferredLightPalette(), persist);
        }
        return applyPalette(preferredPalette(), persist);
    }

    async function persistAccountPreferences(preferences) {
        if (!Number(window.init?.userId)) return;
        if (window.AISecEdu && typeof window.AISecEdu.request === "function") {
            await window.AISecEdu.request("/users/settings", {
                method: "PATCH",
                json: {preferences},
                unwrap: false,
                timeoutMs: 10000,
            });
            return;
        }
        const response = await window.fetch("/pwncollege_api/v1/users/settings", {
            method: "PATCH",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(window.init?.csrfNonce ? {"CSRF-Token": window.init.csrfNonce} : {}),
            },
            body: JSON.stringify({preferences}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) {
            const message = Array.isArray(payload.errors) && payload.errors.length
                ? payload.errors.join("；")
                : "账户主题偏好保存失败。";
            throw new Error(message);
        }
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
                const firstFocusable = input || layer.querySelector("button");
                firstFocusable?.focus({preventScroll: true});
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
            if (event.key === "Tab") {
                const focusable = Array.from(layer.querySelectorAll(
                    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
                )).filter(element => element.offsetParent !== null);
                if (!focusable.length) {
                    event.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
            if (event.key === "Enter" && !input && !event.target.closest("textarea")) {
                const primary = actions.querySelector("[data-dialog-action='confirm'], .btn-primary, .btn-danger");
                if (primary) {
                    event.preventDefault();
                    primary.click();
                }
            }
        });
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
        config.kind = ["success", "danger", "warning", "info", "progress"].includes(config.kind)
            ? config.kind
            : "info";
        const key = config.dedupeKey || `${config.kind}:${message}`;
        const now = Date.now();
        if (key === lastNotice.key && now - lastNotice.at < 1200) return null;
        lastNotice = {key, at: now};

        if (!toastStack || !toastStack.isConnected) {
            toastStack = document.createElement("div");
            toastStack.className = "aisecedu-toast-stack";
            toastStack.setAttribute("aria-live", "polite");
            toastStack.setAttribute("aria-relevant", "additions");
            document.body.appendChild(toastStack);
        }

        const icon = {
            success: "fa-check",
            danger: "fa-exclamation-triangle",
            warning: "fa-exclamation",
            info: "fa-info",
            progress: "fa-spinner fa-spin",
        }[config.kind];
        const toast = document.createElement("div");
        toast.className = `aisecedu-toast is-${config.kind}`;
        toast.setAttribute("role", config.kind === "danger" ? "alert" : "status");
        toast.innerHTML = `
            <span class="aisecedu-toast-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
            <p class="aisecedu-toast-message"></p>
            <button type="button" class="aisecedu-toast-close" aria-label="关闭提示"><i class="fas fa-times" aria-hidden="true"></i></button>`;
        const messageNode = toast.querySelector(".aisecedu-toast-message");
        messageNode.textContent = message;
        if (config.closeable === false) toast.querySelector(".aisecedu-toast-close").hidden = true;

        let timer = null;
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            window.clearTimeout(timer);
            toast.classList.remove("is-visible");
            toast.classList.add("is-leaving");
            window.setTimeout(() => {
                toast.remove();
                if (toastStack && !toastStack.children.length) {
                    toastStack.remove();
                    toastStack = null;
                }
            }, 180);
        };
        const duration = Number.isFinite(Number(config.duration))
            ? Math.max(0, Number(config.duration))
            : config.kind === "danger" ? 6500 : config.kind === "warning" ? 5000 : 3800;
        const scheduleClose = () => {
            window.clearTimeout(timer);
            if (duration > 0) timer = window.setTimeout(close, duration);
        };
        const handle = {
            element: toast,
            close,
            update(next) {
                const nextMessage = typeof next === "string" ? next : next && next.message;
                if (typeof nextMessage === "string") messageNode.textContent = nextMessage;
                scheduleClose();
            },
        };

        toast.querySelector(".aisecedu-toast-close").addEventListener("click", close);
        toast.addEventListener("mouseenter", () => window.clearTimeout(timer));
        toast.addEventListener("mouseleave", scheduleClose);
        toastStack.appendChild(toast);
        while (toastStack.children.length > 4) toastStack.firstElementChild.remove();
        window.requestAnimationFrame(() => toast.classList.add("is-visible"));
        scheduleClose();
        return handle;
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
        applyAppearance,
        applyMotion,
        applyPalette,
        applyPreferences,
        applyTheme,
        close: closeActiveDialog,
        closeMenus: closeFloatingMenu,
        confirm: confirmAction,
        dialog,
        notify,
        palette: currentPalette,
        prompt: promptAction,
        theme: () => PALETTES[currentPalette()].mode,
        toggleTheme: () => applyTheme(
            PALETTES[currentPalette()].mode === "dark" ? "light" : "dark",
            true,
        ),
    };

    document.addEventListener("DOMContentLoaded", function () {
        applyPreferences({}, false);
    });

    document.addEventListener("toggle", event => {
        const details = event.target;
        if (!disclosureMenuParts(details)) return;
        if (details.open) openFloatingMenu(details);
        else if (activeFloatingMenu && activeFloatingMenu.details === details) {
            closeFloatingMenu();
        }
    }, true);

    document.addEventListener("pointerdown", event => {
        if (!activeFloatingMenu) return;
        if (
            activeFloatingMenu.panel.contains(event.target) ||
            activeFloatingMenu.summary.contains(event.target)
        ) return;
        closeFloatingMenu();
    }, true);

    document.addEventListener("click", event => {
        if (!activeFloatingMenu || !activeFloatingMenu.panel.contains(event.target)) return;
        if (event.target.closest("button, a[href], [role='menuitem']")) {
            window.setTimeout(() => closeFloatingMenu(), 0);
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" || !activeFloatingMenu) return;
        event.preventDefault();
        closeFloatingMenu({restoreFocus: true});
    });

    window.addEventListener("resize", () => closeFloatingMenu());
    window.addEventListener("scroll", () => closeFloatingMenu(), {capture: true, passive: true});
    window.addEventListener("pagehide", () => closeFloatingMenu());

    window.addEventListener("storage", event => {
        if ([STORAGE_KEY, LEGACY_THEME_KEY, LIGHT_PALETTE_KEY, APPEARANCE_KEY, REDUCED_MOTION_KEY].includes(event.key)) {
            applyPreferences({}, false);
        }
    });

    if (window.matchMedia) {
        const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
        const onColorSchemeChange = () => {
            if (preferredAppearance() === "system") applyAppearance("system", preferredPalette(), false);
        };
        if (colorScheme.addEventListener) colorScheme.addEventListener("change", onColorSchemeChange);
        else if (colorScheme.addListener) colorScheme.addListener(onColorSchemeChange);
    }
})();

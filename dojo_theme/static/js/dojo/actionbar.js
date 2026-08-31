// To use the actionbar, the following parameters should be met:
// 1. There is an iframe for controlled workspace content with the id "workspace-iframe"
// 2. The actionbar and iframe are descendants of a common ancestor with the class "challenge-workspace"
// 3. In fullpage mode (data-popout="false"), the page implements a function, doFullscreen(event), to handle a fullscreen event
// 4. Optionally, the page can have a div with the class "workspace-ssh" which is displayed when the SSH service is
//    selected (fullpage mode) or toggled in place of the iframe via the portless service button (pop-out mode).

// Returns the controls object containing the origin of the event.
function context(event) {
    return $(event.target).closest(".workspace-controls");
}

async function confirmWorkspaceAction(message, options) {
    if (!window.AISecEduUI || typeof window.AISecEduUI.confirm !== "function") {
        return false;
    }
    return window.AISecEduUI.confirm(message, options || {});
}

function isPopout(root) {
    return root.attr("data-popout") === "true";
}

function serviceName(service) {
    return String(service || "").split(":", 1)[0].trim();
}

function servicePort(service) {
    const value = String(service || "");
    const separator = value.indexOf(":");
    return separator < 0 ? "" : value.slice(separator + 1).trim();
}

function isSpecialService(service) {
    const specialServices = ["terminal", "code", "desktop"];
    const specialPorts = ["7681", "8080", "6080"];
    const index = specialServices.indexOf(serviceName(service));
    return index > -1 && index == specialPorts.indexOf(servicePort(service));
}

function getServiceHistory() {
    var raw = localStorage.getItem("service_history");
    if (raw === null) {
        return [];
    }

    return raw.split(", ");
}

function logService(service) {
    var services = getServiceHistory();
    var index = services.indexOf(service);
    if (index >= 0) {
        services.splice(index, 1);
    }
    services.forEach((element, index, array) => {
        service += ", ";
        service += element;
    })
    localStorage.setItem("service_history", service);
}

// Get most recent service which is offered by the given root actionbar.
function getRecentService(root) {
    var options = [];
    root.find(".workspace-service").each((index, element) => {
        options.push($(element).attr("data-service"));
    });
    var history = getServiceHistory();
    var match = null;
    history.forEach((element, index, array) => {
        if (match == null && options.indexOf(element) != -1) {
            match = element;
        }
    });

    return match;
}

function workspaceLoadingPanel(content) {
    return $(content).closest(".challenge-workspace-surface").find("[data-workspace-loading]").first();
}

function emitWorkspaceTelemetry(content, stage, result) {
    if (!content || !window.DojoLearning) return;
    const key = `${content.dataset.workspaceLoadId || "none"}:${stage}:${result}`;
    if (content.dataset.workspaceTelemetryKey === key) return;
    content.dataset.workspaceTelemetryKey = key;
    const started = Number(content.dataset.workspaceLoadStartedAt) || Date.now();
    window.DojoLearning.json("POST", "/learning/telemetry", {
        event: "lab_start_state_changed",
        properties: {
            stage,
            durationMs: Math.max(0, Date.now() - started),
            result,
        },
    }).catch(function () {});
}

function sessionRemainingLabel(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    if (value <= 0) return "即将自动关闭";
    const hours = Math.floor(value / 3600);
    const minutes = Math.max(1, Math.ceil((value % 3600) / 60));
    return hours ? `剩余 ${hours} 小时 ${minutes} 分钟` : `剩余 ${minutes} 分钟`;
}

function updateWorkspaceSessionStatus(content, result) {
    const root = $(content).closest(".challenge-workspace").find(".workspace-controls");
    const status = root.find("[data-workspace-session-status]");
    clearInterval(content.workspaceExpiryTimer);
    if (!status.length || !result || !result.expires_at) {
        status.prop("hidden", true);
        return;
    }
    const expiresAt = new Date(result.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) {
        status.prop("hidden", true);
        return;
    }
    const tick = function () {
        const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        status.prop("hidden", false);
        status.find("[data-workspace-session-remaining]").text(sessionRemainingLabel(seconds));
        status.attr(
            "title",
            "离开此页面不会停止环境；到时自动关闭，/home/hacker 文件仍会保留。",
        );
        if (seconds <= 0) clearInterval(content.workspaceExpiryTimer);
    };
    tick();
    content.workspaceExpiryTimer = setInterval(tick, 30000);
}

function workspaceModeLabel(service) {
    return {
        terminal: "终端",
        code: "VS Code",
        desktop: "远程桌面",
        web: "Web",
    }[serviceName(service)] || serviceName(service) || `端口 ${servicePort(service)}`;
}

function setWorkspaceStage(panel, stage, title, detail) {
    const order = ["queued", "container", "service", "interaction"];
    const index = Math.max(0, order.indexOf(stage));
    panel.attr("data-stage", stage);
    panel.find("[data-workspace-loading-title]").text(title);
    panel.find("[data-workspace-loading-detail]").text(detail);
    panel.find("[data-workspace-stage]").each(function () {
        const itemIndex = order.indexOf(this.dataset.workspaceStage);
        $(this)
            .toggleClass("is-complete", itemIndex < index)
            .toggleClass("is-active", itemIndex === index);
        $(this).find("i").attr("class", itemIndex < index ? "fas fa-check" : itemIndex === index ? "fas fa-circle-notch fa-spin" : {
            queued: "fas fa-clock",
            container: "fas fa-box",
            service: "fas fa-link",
            interaction: "fas fa-keyboard",
        }[this.dataset.workspaceStage]);
    });
}

function beginWorkspaceLoad(content, service) {
    const loadId = String((Number(content.dataset.workspaceLoadSequence) || 0) + 1);
    const panel = workspaceLoadingPanel(content);
    const mode = workspaceModeLabel(service);
    const settleDelay = {
        terminal: 650,
        code: 1600,
        desktop: 1800,
    }[serviceName(service)] || 650;
    content.dataset.workspaceLoadSequence = loadId;
    content.dataset.workspaceLoadId = loadId;
    content.dataset.workspaceLoadStartedAt = String(Date.now());
    content.dataset.workspaceLoadSettle = String(settleDelay);
    content.dataset.workspaceService = String(service || "");
    content.setAttribute("aria-busy", "true");
    if (content.workspaceRequestController) content.workspaceRequestController.abort();
    clearTimeout(content.workspaceLoadSlowTimer);
    clearTimeout(content.workspaceLoadReadyTimer);
    clearTimeout(content.workspaceLoadStageTimer);
    $(content).off("load.workspaceLoading");
    panel.removeClass("is-error is-stopped is-cancelled").addClass("is-active");
    panel.find("[data-workspace-loading-retry]").prop("hidden", true);
    panel.find("[data-workspace-loading-cancel]").prop("hidden", false);
    setWorkspaceStage(panel, "queued", "已加入启动队列", `正在确认${mode}所需的运行资源…`);
    emitWorkspaceTelemetry(content, "queued", "started");
    content.workspaceLoadStageTimer = setTimeout(function () {
        if (content.dataset.workspaceLoadId === loadId) {
            setWorkspaceStage(panel, "container", "正在准备容器", "正在恢复你的 Home 文件并准备隔离运行环境…");
            emitWorkspaceTelemetry(content, "container", "pending");
        }
    }, 350);
    content.workspaceLoadSlowTimer = setTimeout(function () {
        if (content.dataset.workspaceLoadId === loadId) {
            panel.find("[data-workspace-loading-detail]").text(`${mode}仍在启动。首次拉取环境或恢复文件可能需要更长时间；你可以继续等待或取消本次连接。`);
        }
    }, 8000);
    return loadId;
}

function finishWorkspaceLoad(content, loadId) {
    if (content.dataset.workspaceLoadId !== loadId) return;
    clearTimeout(content.workspaceLoadSlowTimer);
    clearTimeout(content.workspaceLoadStageTimer);
    const settleDelay = Number(content.dataset.workspaceLoadSettle) || 650;
    const panel = workspaceLoadingPanel(content);
    setWorkspaceStage(panel, "interaction", "正在准备交互", "服务已经连接，正在初始化键盘、剪贴板与显示区域…");
    emitWorkspaceTelemetry(content, "interaction", "pending");
    content.workspaceLoadReadyTimer = setTimeout(function () {
        if (content.dataset.workspaceLoadId !== loadId) return;
        panel.removeClass("is-active is-error is-stopped is-cancelled");
        content.setAttribute("aria-busy", "false");
        emitWorkspaceTelemetry(content, "interaction", "ready");
        try {
            content.focus({preventScroll: true});
            content.contentWindow.postMessage({type: "aisecedu:focus-remote-keyboard"}, "*");
        } catch (error) {}
    }, settleDelay);
}

function setDesktopClipboardControls(root, active) {
    root.find(".workspace-clipboard").prop("hidden", !active);
}

function workspaceIframe(root) {
    return root.closest(".challenge-workspace").find("#workspace-iframe")[0] || null;
}

function sendDesktopClipboard(root, text) {
    const iframe = workspaceIframe(root);
    if (!iframe || !iframe.contentWindow) return false;
    iframe.contentWindow.postMessage({type: "aisecedu:clipboard-to-remote", text: String(text).slice(0, 1048576)}, "*");
    iframe.focus({preventScroll: true});
    return true;
}

async function pasteDesktopClipboard(event) {
    const root = context(event);
    let text = "";
    try {
        if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("剪贴板读取不可用");
        text = await navigator.clipboard.readText();
    } catch (error) {
        const fallback = window.AISecEduUI
            ? await window.AISecEduUI.prompt("粘贴要发送到远程桌面的文本：", {
                title: "发送到远程桌面",
                inputLabel: "剪贴板文本",
                confirmLabel: "发送",
                maxLength: 1048576,
            })
            : null;
        if (fallback === null) return;
        text = fallback;
    }
    if (!sendDesktopClipboard(root, text)) {
        animateBanner(event, "远程桌面尚未就绪。", "warn");
        return;
    }
    animateBanner(event, "剪贴板文本已发送到远程桌面。", "success");
}

async function copyDesktopClipboard(event) {
    const root = context(event);
    const iframe = workspaceIframe(root);
    if (!iframe || !iframe.contentWindow) {
        animateBanner(event, "远程桌面尚未就绪。", "warn");
        return;
    }
    let text = iframe.workspaceRemoteClipboard;
    if (typeof text !== "string") {
        text = await new Promise(resolve => {
            const timeout = setTimeout(() => resolve(null), 1200);
            iframe.workspaceClipboardResolver = value => {
                clearTimeout(timeout);
                resolve(value);
            };
            iframe.contentWindow.postMessage({type: "aisecedu:clipboard-request"}, "*");
        });
    }
    if (typeof text !== "string") {
        animateBanner(event, "请先在远程桌面中复制文本，再重试。", "warn");
        return;
    }
    try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("剪贴板写入不可用");
        await navigator.clipboard.writeText(text);
        animateBanner(event, "远程桌面剪贴板已复制到本机。", "success");
    } catch (error) {
        if (window.AISecEduUI) {
            await window.AISecEduUI.prompt("浏览器无法直接写入剪贴板，请手动复制：", {
                title: "复制远程桌面文本",
                inputLabel: "远程桌面文本",
                value: text,
                confirmLabel: "完成",
                maxLength: 1048576,
            });
        }
    }
}

window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "aisecedu:remote-clipboard") return;
    const iframe = Array.from(document.querySelectorAll("#workspace-iframe")).find(candidate => candidate.contentWindow === event.source);
    if (!iframe) return;
    iframe.workspaceRemoteClipboard = String(event.data.text || "").slice(0, 1048576);
    if (iframe.workspaceClipboardResolver) {
        const resolve = iframe.workspaceClipboardResolver;
        delete iframe.workspaceClipboardResolver;
        resolve(iframe.workspaceRemoteClipboard);
    }
    const root = $(iframe).closest(".challenge-workspace").find(".workspace-controls");
    const bannerTarget = root[0];
    if (bannerTarget) {
        animateBanner({target: bannerTarget}, "远程桌面剪贴板已可复制。", "success");
    }
});

function cancelWorkspaceLoad(content, options) {
    const cancelledStage = workspaceLoadingPanel(content).attr("data-stage") || "queued";
    content.dataset.workspaceLoadId = "cancelled";
    if (content.workspaceRequestController) {
        content.workspaceRequestController.abort();
        delete content.workspaceRequestController;
    }
    clearTimeout(content.workspaceLoadSlowTimer);
    clearTimeout(content.workspaceLoadReadyTimer);
    clearTimeout(content.workspaceLoadStageTimer);
    $(content).off("load.workspaceLoading");
    const panel = workspaceLoadingPanel(content);
    if (options && options.visible) {
        panel.removeClass("is-error is-stopped").addClass("is-active is-cancelled");
        panel.find("[data-workspace-loading-title]").text("已取消本次连接");
        panel.find("[data-workspace-loading-detail]").text("运行环境不会重复创建；需要时可重新连接当前服务。");
        panel.find("[data-workspace-loading-retry]").prop("hidden", false);
        panel.find("[data-workspace-loading-cancel]").prop("hidden", true);
    } else {
        panel.removeClass("is-active is-error is-stopped is-cancelled");
    }
    content.setAttribute("aria-busy", "false");
    if (!(options && options.silentTelemetry)) {
        emitWorkspaceTelemetry(content, cancelledStage, "cancelled");
    }
}

function showWorkspaceLoadError(content, result, loadId) {
    if (content.dataset.workspaceLoadId !== loadId) return;
    const message = result.error || "无法加载工作区服务。";
    clearTimeout(content.workspaceLoadSlowTimer);
    $(content).off("load.workspaceLoading");
    const panel = workspaceLoadingPanel(content);
    panel.removeClass("is-stopped").addClass("is-active is-error");
    panel.find("[data-workspace-loading-title]").text("工作区不可用");
    panel.find("[data-workspace-loading-detail]").text(message);
    panel.find("[data-workspace-loading-retry]").prop("hidden", false);
    panel.find("[data-workspace-loading-cancel]").prop("hidden", true);
    content.setAttribute("aria-busy", "false");
    emitWorkspaceTelemetry(content, panel.attr("data-stage") || "service", "failed");
    animateBanner(
        {target: $(content).closest(".challenge-workspace").find(".workspace-controls")[0]},
        message,
        "error"
    );
}

function updateWorkspaceWebAddress(content, service, iframeUrl, publicUrl) {
    const root = $(content).closest(".challenge-workspace").find(".workspace-controls");
    const address = root.find("[data-workspace-web-address]");
    const link = address.find("[data-workspace-web-link]");
    if (serviceName(service) !== "web" || !iframeUrl) {
        address.prop("hidden", true).removeData("workspaceUrl");
        link.removeAttr("href title").text("");
        return;
    }
    const url = publicUrl
        ? new URL(publicUrl, window.location.origin)
        : iframeUrl instanceof URL
        ? iframeUrl
        : new URL(iframeUrl, window.location.origin);
    const port = servicePort(service);
    address.prop("hidden", false).data("workspaceUrl", url.toString());
    address.find(".workspace-web-address-label").text(port ? `Web 服务 · ${port}` : "Web 服务");
    link
        .attr("href", url.toString())
        .attr("title", "在新标签页打开此 Web 地址")
        .attr("aria-label", port ? `在新标签页打开端口 ${port} 的 Web 页面` : "在新标签页打开 Web 页面")
        .text(url.toString());
}

async function copyWorkspaceWebAddress(event) {
    const root = context(event);
    const address = root.find("[data-workspace-web-address]");
    const value = address.data("workspaceUrl");
    if (!value) return;
    try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard write is unavailable");
        await navigator.clipboard.writeText(value);
        animateBanner(event, "Web 地址已复制。", "success");
    } catch (error) {
        if (window.AISecEduUI) {
            await window.AISecEduUI.prompt("浏览器无法直接写入剪贴板，请手动复制：", {
                title: "复制 Web 地址",
                inputLabel: "Web 地址",
                value,
                confirmLabel: "完成",
                maxLength: 4096,
            });
        }
    }
}

function requestWorkspace(url, content, loadId, service) {
    const controller = new AbortController();
    content.workspaceRequestController = controller;
    fetch(url, {
        method: "GET",
        credentials: "same-origin",
        signal: controller.signal,
    })
    .then(response => response.json())
    .then(result => {
        if (content.dataset.workspaceLoadId !== loadId) return;
        if (!result.success || !result["iframe_src"]) {
            showWorkspaceLoadError(content, result, loadId);
            return;
        }
        const iframeUrl = new URL(result["iframe_src"], window.location.origin);
        if (result["setPort"]) {
            iframeUrl.port = window.location.port;
        }
        clearTimeout(content.workspaceLoadStageTimer);
        setWorkspaceStage(
            workspaceLoadingPanel(content),
            "service",
            `正在连接${workspaceModeLabel(service)}`,
            "运行环境已准备，正在建立安全服务连接…",
        );
        emitWorkspaceTelemetry(content, "service", "pending");
        updateWorkspaceSessionStatus(content, result);
        $(content).off("load.workspaceLoading").one("load.workspaceLoading", function () {
            finishWorkspaceLoad(content, loadId);
        });
        updateWorkspaceWebAddress(content, service, iframeUrl, result["web_url"]);
        content.src = iframeUrl.toString();
    })
    .catch(error => {
        if (error && error.name === "AbortError") return;
        showWorkspaceLoadError(content, {error: error.message || "工作区请求失败。"}, loadId);
    })
    .finally(() => {
        if (content.workspaceRequestController === controller) {
            delete content.workspaceRequestController;
        }
    });
}

function specialSelect(service, content, loadId) {
    const url = new URL("/pwncollege_api/v1/workspace", window.location.origin);
    url.searchParams.set("service", serviceName(service));
    requestWorkspace(url, content, loadId, service);
}

function portSelect(service, content, loadId) {
    const url = new URL("/pwncollege_api/v1/workspace", window.location.origin);
    url.searchParams.set("port", servicePort(service));
    requestWorkspace(url, content, loadId, service);
}

function loadIframe(service, content) {
    const loadId = beginWorkspaceLoad(content, service);
    updateWorkspaceWebAddress(content, service, null);
    if (isSpecialService(service)) {
        specialSelect(service, content, loadId);
    }
    else {
        portSelect(service, content, loadId);
    }
}

function workspaceModeUrl(service) {
    const url = new URL("/workspace", window.location.origin);
    if (isSpecialService(service)) {
        url.searchParams.set("service", serviceName(service));
    }
    else {
        url.searchParams.set("port", servicePort(service));
    }
    return url.pathname + url.search;
}

function requestedWorkspaceService(root) {
    const params = new URLSearchParams(window.location.search);
    const requestedName = params.get("service");
    const requestedPort = params.get("port");
    let match = null;
    root.find(".workspace-service").each(function () {
        const candidate = $(this).attr("data-service");
        if (
            match === null &&
            ((requestedName && serviceName(candidate) === requestedName) ||
             (requestedPort && servicePort(candidate) === requestedPort))
        ) {
            match = candidate;
        }
    });
    return match;
}

function updateWorkspaceModeUrl(service) {
    const requested = new URL(workspaceModeUrl(service), window.location.origin);
    const current = new URL(window.location.href);
    if (current.searchParams.has("hide-navbar")) {
        requested.searchParams.set("hide-navbar", "");
    }
    window.history.replaceState({}, "", requested.pathname + requested.search + current.hash);
}

function selectService(service, log=true) {
    const content = document.getElementById("workspace-iframe");
    if (!content) {
        console.log("Missing workspace iframe :(")
        return;
    }
    if (log) {logService(service);}
    const root = $(content).closest(".challenge-workspace").find(".workspace-controls");
    setDesktopClipboardControls(root, serviceName(service) === "desktop" && servicePort(service) !== "");
    root.find(".workspace-service").each(function () {
        const active = $(this).attr("data-service") === service;
        $(this).toggleClass("active", active);
        $(this).attr("aria-pressed", active ? "true" : "false");
    });
    content.hidden = false;
    if (serviceName(service) == "ssh" && servicePort(service) == "") {
        cancelWorkspaceLoad(content, {silentTelemetry: true});
        updateWorkspaceWebAddress(content, service, null);
        content.removeAttribute("src");
        $(content).addClass("SSH");
        $(".workspace-ssh").show();
        return;
    }
    else {
        $(content).removeClass("SSH");
        $(".workspace-ssh").hide();
    }
    if (!isPopout(root)) {
        updateWorkspaceModeUrl(service);
    }
    loadIframe(service, content);
}

function portlessButton(root) {
    return root.find(".workspace-service").filter(function () {
        const service = $(this).attr("data-service");
        return serviceName(service) === "ssh" && servicePort(service) === "";
    });
}

function portedService(root) {
    var service = null;
    root.find(".workspace-service").each(function () {
        const candidate = $(this).attr("data-service");
        if (
            service === null &&
            servicePort(candidate) !== ""
        ) {
            service = candidate;
        }
    });
    return service;
}

function toggleSshInstructions(root, show=null) {
    const workspace = root.closest(".challenge-workspace");
    const button = portlessButton(root);
    const active = show === null ? !button.hasClass("active") : show;
    button.toggleClass("active", active);
    button.attr("aria-pressed", active ? "true" : "false");
    workspace.find(".workspace-ssh").toggle(active);
    workspace.find("#workspace-iframe").toggleClass("SSH", active);
}

function serviceClickCallback(event) {
    event.preventDefault();
    const button = $(event.currentTarget);
    const service = button.attr("data-service");
    if (!isPopout(context(event))) {
        if (button.hasClass("active")) {
            return;
        }
        selectService(service);
        return;
    }
    if (servicePort(service) === "") {
        if (portedService(context(event))) {
            toggleSshInstructions(context(event));
        }
        return;
    }
    const targetUrl = workspaceModeUrl(service);
    const popout = window.open(targetUrl, "workspace-" + (serviceName(service) || servicePort(service)));
    if (!popout) {
        animateBanner(event, "浏览器阻止了新窗口，请允许本站点打开弹窗。", "warn");
        return;
    }
    popout.focus();
}

function animateBanner(event, message, type, action) {
    const color = {
        success: "var(--brand-green)",
        error: "var(--error)",
        warn: "var(--warn)"
    }[type] ?? "var(--warn)";
    const animation = type === "success" ? "animate-banner" : "animate-banner-fast";
    const banner = context(event).find(".workspace-notification-banner").first();

    if (!banner.length) return;
    banner.removeClass("animate-banner animate-banner-fast");
    banner[0].offsetHeight;
    banner.empty();
    $("<span>").addClass("workspace-banner-message").html(message).appendTo(banner);
    if (action && action.href) {
        $("<a>")
            .addClass("btn btn-sm workspace-banner-action")
            .attr("href", action.href)
            .text(action.label || "查看")
            .appendTo(banner);
    }
    banner
        .toggleClass("is-interactive", Boolean(action && action.href))
        .css("border-color", color)
        .addClass(animation);
}

function setFlagSubmitting(root, submitting) {
    const input = root.find(".flag-input");
    input.data("submitting", submitting);
    input.prop("disabled", submitting).toggleClass("disabled", submitting);
    root.find(".input-icon")
        .toggleClass("fa-flag", !submitting)
        .toggleClass("fa-spinner fa-spin", submitting);
}

function challengeAttemptWithTimeout(challengeId, submission) {
    let timeout;
    const request = CTFd.api.post_challenge_attempt(
        {},
        {"challenge_id": challengeId, "submission": submission}
    );
    const deadline = new Promise((resolve, reject) => {
        timeout = setTimeout(
            () => reject(new Error("Flag 提交超时，请检查网络后重试。")),
            30000
        );
    });
    return Promise.race([request, deadline]).finally(() => clearTimeout(timeout));
}

function actionSubmitFlag(event) {
    const root = context(event);
    const input = root.find(".flag-input");
    const submission = String(input.val() || "").trim();

    if (input.data("submitting") || !/^pwn\.college\{[^}\r\n]+\}$/.test(submission)) {
        return;
    }

    if (submission == "pwn.college{practice}") {
        animateBanner(event, "这是练习 Flag。请在不启用提权权限的情况下重启题目并找到真实 Flag。", "warn");
        return;
    }

    const challengeId = Number(root.find(".current-challenge-id").val());
    if (!Number.isInteger(challengeId) || challengeId < 1) {
        animateBanner(event, "无法识别当前题目，请刷新页面后重试。", "error");
        return;
    }

    setFlagSubmitting(root, true);
    return challengeAttemptWithTimeout(challengeId, submission)
    .then(function (response) {
        const result = response && response.data ? response.data : response;
        const challengeName = root.find(".current-challenge-id").attr("data-challenge-name") || "当前题目";
        const safeChallengeName = $("<div>").text(challengeName).html();

        if (!result || !result.status) {
            throw new Error("Flag 提交响应格式无效。");
        }
        if (result.status == "authentication_required") {
            window.location =
                CTFd.config.urlRoot +
                "/login?next=" +
                CTFd.config.urlRoot +
                window.location.pathname +
                window.location.hash;
        }
        else if (result.status == "incorrect") {
            animateBanner(event, "Flag 不正确。", "error");
        }
        else if (result.status == "correct") {
            input.val("");
            animateBanner(
                event,
                `&#127881 已成功完成 <b>${safeChallengeName}</b>！&#127881`,
                "success",
                {
                    label: "查看评分",
                    href: `/learning/scores/latest/${challengeId}`,
                },
            );
            if ($(".challenge-active").length) {
                const unsolved_flag = $(".challenge-active").find("i.challenge-unsolved")
                if (unsolved_flag.hasClass("far") && unsolved_flag.hasClass("fa-flag")) {
                    unsolved_flag.removeClass("far").addClass("fas");
                }
                unsolved_flag.removeClass("challenge-unsolved").addClass("challenge-solved");
            }
            window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
        }
        else if (result.status == "already_solved") {
            input.val("");
            animateBanner(
                event,
                `&#127881 你已经完成了 <b>${safeChallengeName}</b>！&#127881`,
                "success",
                {
                    label: "查看评分",
                    href: `/learning/scores/latest/${challengeId}`,
                },
            );
            window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
        }
        else {
            animateBanner(event, result.message || "提交失败。", "warn");
        }
    })
    .catch(function (error) {
        animateBanner(event, error.message || "Flag 提交失败，请重试。", "error");
    })
    .finally(function () {
        setFlagSubmitting(root, false);
    });
}

function sendChallengeInfo(root, channel) {
    const challenge = root.find(".current-challenge-id");
    const privilege = root.find(".workspace-change-privilege");

    const challengeData = {
        "challenge-id": challenge.prop("value"),
        "challenge-name": challenge.attr("data-challenge-name"),
        "challenge-privilege": privilege.length > 0 ? privilege.attr("data-privileged") : "false",
    };

    channel.postMessage(challengeData);
}

function postStartChallenge(event, channel) {
    const root = context(event);
    sendChallengeInfo(root, channel);
}

function actionbarIsRunning(root) {
    return root.attr("data-workspace-running") !== "false";
}

function setActionbarRunning(root, running) {
    root.attr("data-workspace-running", running ? "true" : "false");
    root.find(".workspace-service, .flag-input").prop("disabled", !running);
    root.find(".challenge-stop, .challenge-reset").prop("disabled", !running);
    root.find(".workspace-change-privilege input").prop("disabled", !running);
    root.find(".challenge-restart").prop("disabled", false);
}

function setActionbarBusy(root, busy) {
    root.find(".btn-challenge-busy")
        .toggleClass("disabled", busy)
        .toggleClass("btn-disabled", busy)
        .prop("disabled", busy);
    root.find(".workspace-change-privilege input").prop(
        "disabled",
        busy || !actionbarIsRunning(root)
    );
    if (!busy) {
        setActionbarRunning(root, actionbarIsRunning(root));
    }
}

function challengeLaunchParameters(root, privileged) {
    const challenge = root.find(".current-challenge-id");
    const embedded = {
        dojo: challenge.attr("data-dojo-id"),
        module: challenge.attr("data-module-id"),
        challenge: challenge.attr("data-challenge-reference-id"),
        practice: privileged,
    };
    if (embedded.dojo && embedded.module && embedded.challenge) {
        return Promise.resolve(embedded);
    }
    return CTFd.fetch("/pwncollege_api/v1/docker", {
        method: "GET",
        credentials: "same-origin"
    }).then(function (response) {
        if (response.status === 403) {
            window.location =
                CTFd.config.urlRoot +
                "/login?next=" +
                CTFd.config.urlRoot +
                window.location.pathname +
                window.location.hash;
            throw new Error("登录状态已失效。");
        }
        return response.json();
    }).then(function (result) {
        if (!result.success) {
            throw new Error(result.error || "无法读取当前题目信息。");
        }
        return {
            dojo: result.dojo,
            module: result.module,
            challenge: result.challenge,
            practice: privileged,
        };
    });
}

function actionStartChallenge(event, privileged) {
    const root = context(event);
    const privilegeControl = root.find(".workspace-change-privilege");
    if (privileged === undefined) {
        privileged = privilegeControl.attr("data-privileged") === "true";
    }

    function startFailed(message) {
        setActionbarBusy(root, false);
        privilegeControl.find("input").prop("checked", privilegeControl.attr("data-privileged") === "true");
        animateBanner(event, message || "无法启动题目。", "error");
    }

    return challengeLaunchParameters(root, privileged)
    .then(function (params) {
        return CTFd.fetch('/pwncollege_api/v1/docker', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        }).then(function (response) {
            if (response.status === 403) {
                window.location =
                    CTFd.config.urlRoot +
                    "/login?next=" +
                    CTFd.config.urlRoot +
                    window.location.pathname +
                    window.location.hash;
                throw new Error("登录状态已失效。");
            }
            return response.json();
        }).then(function (result) {
            if (!result.success) {
                throw new Error(result.error || "无法启动题目。");
            }

            privilegeControl.attr("data-privileged", privileged ? "true" : "false");
            privilegeControl.find("input").prop("checked", privileged);

            setActionbarRunning(root, true);
            refreshWorkspace(root);
            postStartChallenge(event, channel);
            window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
            setActionbarBusy(root, false);
            animateBanner(
                event,
                "题目容器已重新创建，/home/hacker 文件已保留。",
                "success"
            );
        });
    }).catch(function (error) {
        startFailed(error.message);
    });
}

async function actionStartCallback(event) {
    event.preventDefault();
    const root = context(event);
    const running = actionbarIsRunning(root);
    const confirmed = await confirmWorkspaceAction(
        running
            ? "当前题目运行环境会被替换，正在运行的进程和未写入 /home/hacker 的修改将丢失；Home 文件会保留。"
            : "将重新创建当前题目运行环境，已有的 /home/hacker 文件会继续保留。",
        {
            title: running ? "重启题目环境" : "重新启动题目环境",
            subtitle: "保留 Home，重新创建运行环境",
            confirmLabel: running ? "确认重启" : "启动环境",
        }
    );
    if (!confirmed) return;
    setActionbarBusy(root, true);
    actionStartChallenge(event);
}

async function privilegeChangeCallback(event) {
    const checkbox = event.currentTarget;
    const mode = checkbox.checked ? "启用 sudo 权限" : "禁用 sudo 权限";
    const confirmed = await confirmWorkspaceAction(
        `题目将以“${mode}”重新创建。正在运行的进程和未写入 /home/hacker 的修改将丢失，Home 文件会保留。`,
        {
            title: "切换题目权限",
            subtitle: "此操作会重启题目容器",
            confirmLabel: "确认切换",
        }
    );
    if (!confirmed) {
        checkbox.checked = !checkbox.checked;
        return;
    }
    setActionbarBusy(context(event), true);
    actionStartChallenge(event, checkbox.checked);
}

function showWorkspaceStopped(root) {
    const content = workspaceIframe(root);
    if (content) {
        cancelWorkspaceLoad(content, {silentTelemetry: true});
        content.removeAttribute("src");
        content.hidden = false;
        const panel = workspaceLoadingPanel(content);
        panel.removeClass("is-error").addClass("is-active is-stopped");
        panel.find("[data-workspace-loading-title]").text("题目运行环境已停止");
        panel.find("[data-workspace-loading-detail]").text(
            "/home/hacker 文件仍然保留。点击“重启”可重新创建题目运行环境。"
        );
        panel.find("[data-workspace-loading-retry], [data-workspace-loading-cancel]").prop("hidden", true);
    }
    root.find(".workspace-service").removeClass("active").attr("aria-pressed", "false");
    root.find("[data-workspace-web-address]").prop("hidden", true);
    if (content) clearInterval(content.workspaceExpiryTimer);
    root.find("[data-workspace-session-status]").prop("hidden", true);
    setDesktopClipboardControls(root, false);
}

function collapseEmbeddedWorkspace(root) {
    if (!isPopout(root)) return;
    const item = root.closest(".accordion-item");
    if (!item.length) return;
    item.find(".challenge-init").removeClass("challenge-hidden disabled-button").prop("disabled", false);
    item.find(".challenge-workspace").addClass("challenge-hidden");
    item.find(".iframe-wrapper").empty();
    item.find(".challenge-name").removeClass("challenge-active");
    item.children(".collapse").collapse("hide");
}

async function actionStopCallback(event) {
    event.preventDefault();
    const root = context(event);
    const confirmed = await confirmWorkspaceAction(
        "运行中的进程以及未写入 /home/hacker 的容器修改会丢失，Home 文件会保留。停止后可再次启动题目。",
        {
            title: "停止题目运行环境",
            subtitle: "保留 Home，结束当前运行环境",
            confirmLabel: "确认停止",
            confirmStyle: "warning",
        }
    );
    if (!confirmed) return;
    setActionbarBusy(root, true);
    CTFd.fetch("/pwncollege_api/v1/docker", {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: "{}"
    }).then(function (response) {
        if (response.status === 403) {
            window.location =
                CTFd.config.urlRoot +
                "/login?next=" +
                CTFd.config.urlRoot +
                window.location.pathname +
                window.location.search;
            throw new Error("登录状态已失效。");
        }
        return response.json();
    }).then(function (result) {
        if (!result.success) {
            throw new Error(result.error || "停止题目容器失败。");
        }
        setActionbarRunning(root, false);
        showWorkspaceStopped(root);
        window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
        window.dispatchEvent(new CustomEvent("dojo:workspace-stopped"));
        animateBanner(
            event,
            "题目运行环境已停止，/home/hacker 文件已保留。",
            "success"
        );
        window.setTimeout(() => collapseEmbeddedWorkspace(root), 180);
    }).catch(function (error) {
        animateBanner(event, error.message || "停止题目容器失败。", "error");
    }).finally(function () {
        setActionbarBusy(root, false);
    });
}

async function actionResetCallback(event) {
    event.preventDefault();
    const root = context(event);
    const confirmed = await confirmWorkspaceAction(
        "这会永久清除 /home/hacker 与当前容器中的全部修改，然后从题目初始状态重新创建运行环境。此操作无法撤销。",
        {
            title: "彻底重置题目",
            subtitle: "Home 文件也会被清除",
            confirmLabel: "清除并重置",
            confirmStyle: "danger",
            kind: "danger",
        }
    );
    if (!confirmed) return;
    setActionbarBusy(root, true);
    CTFd.fetch("/pwncollege_api/v1/docker/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: "{}"
    }).then(function (response) {
        if (response.status === 403) {
            window.location = CTFd.config.urlRoot + "/login?next=" + CTFd.config.urlRoot + window.location.pathname + window.location.search;
        }
        return response.json();
    }).then(function (result) {
        if (!result.success) {
            animateBanner(event, result.error || "重置题目失败。", "error");
            return;
        }
        setActionbarRunning(root, true);
        refreshWorkspace(root);
        postStartChallenge(event, channel);
        window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
        animateBanner(
            event,
            "题目已恢复到初始状态。",
            "success"
        );
    }).catch(function () {
        animateBanner(event, "重置题目失败。", "error");
    }).finally(function () {
        setActionbarBusy(root, false);
    });
}

function loadWorkspace(log=true) {
    const content = $("#workspace-iframe");
    if (content.length == 0) {
        return;
    }
    var root = content.closest(".challenge-workspace").find(".workspace-controls");
    if (isPopout(root)) {
        const service = portedService(root);
        if (service) {
            toggleSshInstructions(root, portlessButton(root).hasClass("active"));
            loadIframe(service, content[0]);
        }
        else {
            content.attr("src", "");
            toggleSshInstructions(root, true);
        }
        return;
    }
    var recent = requestedWorkspaceService(root) || getRecentService(root);
    if (recent == null) {
        recent = root.find(".workspace-service").first().attr("data-service");
    }
    if (recent) {
        selectService(recent, log);
    }
}

function refreshWorkspace(root) {
    if (isPopout(root)) {
        loadWorkspace(false);
        return;
    }
    var active = root.find(".workspace-service.active").attr("data-service");
    if (active) {
        selectService(active, false);
    }
    else {
        loadWorkspace(false);
    }
}

const channel = new BroadcastChannel("Challenge-Sync-Channel");
$(() => {
    $(document).on("click", "[data-workspace-loading-retry]", function () {
        const panel = $(this).closest("[data-workspace-loading]");
        const content = panel.closest(".challenge-workspace-surface").find("#workspace-iframe")[0];
        const service = content && content.dataset.workspaceService;
        if (content && service) loadIframe(service, content);
    });
    $(document).on("click", "[data-workspace-loading-cancel]", function () {
        const panel = $(this).closest("[data-workspace-loading]");
        const content = panel.closest(".challenge-workspace-surface").find("#workspace-iframe")[0];
        if (content) cancelWorkspaceLoad(content, {visible: true});
    });
    loadWorkspace();
    $(".workspace-controls").each(function () {
        setActionbarRunning($(this), true);
        $(this).find(".workspace-service").click(serviceClickCallback);

        $(this).find(".flag-input").on("input", function(event) {
            event.preventDefault();
            if ($(this).val().match(/pwn.college{.*}/)) {
                actionSubmitFlag(event);
            }
        });
        $(this).find(".flag-input").on("keyup", function(event) {
            if (event.key === "Enter") {
                actionSubmitFlag(event);
            }
        });

        $(this).find(".btn-challenge-start").click(actionStartCallback);
        $(this).find(".challenge-stop").click(actionStopCallback);
        $(this).find(".challenge-reset").click(actionResetCallback);

        $(this).find(".workspace-change-privilege input").on("change", privilegeChangeCallback);

        $(this).find("[data-clipboard-action='paste']").on("click", pasteDesktopClipboard);
        $(this).find("[data-clipboard-action='copy']").on("click", copyDesktopClipboard);
        $(this).find("[data-workspace-web-copy]").on("click", copyWorkspaceWebAddress);

        $(this).find(".workspace-fullscreen").click((event) => {
            event.preventDefault();
            doFullscreen(event);
        })
    });
});

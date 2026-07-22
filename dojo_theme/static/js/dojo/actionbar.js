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

function isPopout(root) {
    return root.attr("data-popout") === "true";
}

function serviceName(service) {
    return service.split(": ")[0];
}

function servicePort(service) {
    return service.split(": ")[1];
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

function workspaceModeLabel(service) {
    return {
        terminal: "Terminal",
        code: "VS Code",
        desktop: "Desktop",
    }[serviceName(service)] || serviceName(service) || `Port ${servicePort(service)}`;
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
    content.dataset.workspaceLoadSettle = String(settleDelay);
    content.setAttribute("aria-busy", "true");
    clearTimeout(content.workspaceLoadSlowTimer);
    clearTimeout(content.workspaceLoadReadyTimer);
    $(content).off("load.workspaceLoading");
    panel.removeClass("is-error").addClass("is-active");
    panel.find("[data-workspace-loading-title]").text(`Loading ${mode}`);
    panel.find("[data-workspace-loading-detail]").text(
        serviceName(service) === "desktop"
            ? "Starting the remote desktop and preparing keyboard capture…"
            : "Starting the service and preparing your exercise…"
    );
    content.workspaceLoadSlowTimer = setTimeout(function () {
        if (content.dataset.workspaceLoadId === loadId) {
            panel.find("[data-workspace-loading-detail]").text(`${mode} is still starting. The first launch can take a little longer.`);
        }
    }, 8000);
    return loadId;
}

function finishWorkspaceLoad(content, loadId) {
    if (content.dataset.workspaceLoadId !== loadId) return;
    clearTimeout(content.workspaceLoadSlowTimer);
    const settleDelay = Number(content.dataset.workspaceLoadSettle) || 650;
    content.workspaceLoadReadyTimer = setTimeout(function () {
        if (content.dataset.workspaceLoadId !== loadId) return;
        workspaceLoadingPanel(content).removeClass("is-active is-error");
        content.setAttribute("aria-busy", "false");
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
        if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("Clipboard read is unavailable");
        text = await navigator.clipboard.readText();
    } catch (error) {
        const fallback = window.prompt("Paste text to send to the remote desktop:", "");
        if (fallback === null) return;
        text = fallback;
    }
    if (!sendDesktopClipboard(root, text)) {
        animateBanner(event, "Remote desktop is not ready.", "warn");
        return;
    }
    animateBanner(event, "Clipboard text sent to the remote desktop.", "success");
}

async function copyDesktopClipboard(event) {
    const root = context(event);
    const iframe = workspaceIframe(root);
    if (!iframe || !iframe.contentWindow) {
        animateBanner(event, "Remote desktop is not ready.", "warn");
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
        animateBanner(event, "Copy text in the remote desktop first, then try again.", "warn");
        return;
    }
    try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard write is unavailable");
        await navigator.clipboard.writeText(text);
        animateBanner(event, "Remote desktop clipboard copied to this device.", "success");
    } catch (error) {
        window.prompt("Copy the remote desktop text:", text);
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
        animateBanner({target: bannerTarget}, "Remote desktop clipboard is ready to copy.", "success");
    }
});

function cancelWorkspaceLoad(content) {
    content.dataset.workspaceLoadId = "cancelled";
    clearTimeout(content.workspaceLoadSlowTimer);
    clearTimeout(content.workspaceLoadReadyTimer);
    $(content).off("load.workspaceLoading");
    workspaceLoadingPanel(content).removeClass("is-active is-error");
    content.setAttribute("aria-busy", "false");
}

function showWorkspaceLoadError(content, result, loadId) {
    if (content.dataset.workspaceLoadId !== loadId) return;
    const message = result.error || "The workspace service could not be loaded.";
    clearTimeout(content.workspaceLoadSlowTimer);
    $(content).off("load.workspaceLoading");
    const panel = workspaceLoadingPanel(content);
    panel.addClass("is-active is-error");
    panel.find("[data-workspace-loading-title]").text("Workspace unavailable");
    panel.find("[data-workspace-loading-detail]").text(message);
    content.setAttribute("aria-busy", "false");
    animateBanner(
        {target: $(content).closest(".challenge-workspace").find(".workspace-controls")[0]},
        message,
        "error"
    );
}

function requestWorkspace(url, content, loadId) {
    fetch(url, {
        method: "GET",
        credentials: "same-origin"
    })
    .then(response => response.json())
    .then(result => {
        if (content.dataset.workspaceLoadId !== loadId) return;
        if (!result.success || !result["iframe_src"]) {
            showWorkspaceLoadError(content, result, loadId);
            return;
        }
        const iframeUrl = new URL(result["iframe_src"]);
        if (result["setPort"]) {
            iframeUrl.port = window.location.port;
        }
        $(content).off("load.workspaceLoading").one("load.workspaceLoading", function () {
            finishWorkspaceLoad(content, loadId);
        });
        content.src = iframeUrl.toString();
    })
    .catch(error => {
        showWorkspaceLoadError(content, {error: error.message || "The workspace request failed."}, loadId);
    });
}

function specialSelect(name, content, loadId) {
    const url = new URL("/pwncollege_api/v1/workspace", window.location.origin);
    url.searchParams.set("service", name);
    requestWorkspace(url, content, loadId);
}

function portSelect(port, content, loadId) {
    const url = new URL("/pwncollege_api/v1/workspace", window.location.origin);
    url.searchParams.set("port", port);
    requestWorkspace(url, content, loadId);
}

function loadIframe(service, content) {
    const loadId = beginWorkspaceLoad(content, service);
    if (isSpecialService(service)) {
        specialSelect(serviceName(service), content, loadId);
    }
    else {
        portSelect(servicePort(service), content, loadId);
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
    if (serviceName(service) == "ssh" && servicePort(service) == "") {
        cancelWorkspaceLoad(content);
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
        return servicePort($(this).attr("data-service")) === "";
    });
}

function portedService(root) {
    var service = null;
    root.find(".workspace-service").each(function () {
        const candidate = $(this).attr("data-service");
        if (service === null && servicePort(candidate) !== "") {
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
        animateBanner(event, "Pop-up blocked — please allow pop-ups for this site.", "warn");
        return;
    }
    popout.focus();
}

function animateBanner(event, message, type) {
    const color = {
        success: "var(--brand-green)",
        error:   "var(--error)",
        warn:    "var(--warn)"
    }[type] ?? "var(--warn)";
    const animation = type === "success" ? "animate-banner" : "animate-banner-fast";

    context(event).find("#workspace-notification-banner").removeClass("animate-banner animate-banner-fast");
    context(event).find("#workspace-notification-banner")[0].offsetHeight;  // Force reflow of element to play animation again.
    context(event).find("#workspace-notification-banner")
      .html(message)
      .css("border-color", color)
      .addClass(animation);
}

function actionSubmitFlag(event) {
    const submission = $(event.target).val();

    if (submission == "pwn.college{practice}") {
        animateBanner(event, "This is the practice flag. Find the real flag by restarting the exercise without elevated privileges.", "warn");
        return;
    }

    context(event).find("#flag-input").prop("disabled", true).addClass("disabled");
    context(event).find(".input-icon").toggleClass("fa-flag fa-spinner fa-spin");
    const challenge_id = parseInt(context(event).find("#current-challenge-id").val());

    CTFd.api.post_challenge_attempt({}, {"challenge_id": challenge_id, "submission": submission})
    .then(function (response) {
        const challengeName = context(event).find("#current-challenge-id").attr("data-challenge-name");

        if (response.data.status == "incorrect") {
            animateBanner(event, "Incorrect!", "error");
        }
        else if (response.data.status == "correct") {
            animateBanner(event, `&#127881 Successfully completed <b>${challengeName}</b>! &#127881`, "success");
            if ($(".challenge-active").length) {
                const unsolved_flag = $(".challenge-active").find("i.challenge-unsolved")
                if (unsolved_flag.hasClass("far") && unsolved_flag.hasClass("fa-flag")) {
                    unsolved_flag.removeClass("far").addClass("fas");
                }
                unsolved_flag.removeClass("challenge-unsolved").addClass("challenge-solved");
            }
        }
        else if (response.data.status == "already_solved") {
            animateBanner(event, `&#127881 You have already completed <b>${challengeName}</b>! &#127881`, "success");
        }
        else {
            animateBanner(event, "Submission failed.", "warn");
        }
        context(event).find("#flag-input").prop("disabled", false).removeClass("disabled");
        context(event).find(".input-icon").toggleClass("fa-flag fa-spinner fa-spin");
    });
}

function sendChallengeInfo(root, channel) {
    challenge = root.find("#current-challenge-id");
    privilege = root.find("#workspace-change-privilege");

    challengeData = {
        "challenge-id": challenge.prop("value"),
        "challenge-name": challenge.attr("data-challenge-name"),
        "challenge-privilege": privilege.length > 0 ? privilege.attr("data-privileged") : "false",
    };

    channel.postMessage(challengeData);
}

function postStartChallenge(event, channel) {
    root = context(event);
    sendChallengeInfo(root, channel);
}

function setActionbarBusy(root, busy) {
    root.find(".btn-challenge-busy")
        .toggleClass("disabled", busy)
        .toggleClass("btn-disabled", busy)
        .prop("disabled", busy);
    root.find("#workspace-change-privilege input").prop("disabled", busy);
}

function actionStartChallenge(event, privileged) {
    const root = context(event);
    const privilegeControl = root.find("#workspace-change-privilege");
    if (privileged === undefined) {
        privileged = privilegeControl.attr("data-privileged") === "true";
    }

    function startFailed(message) {
        setActionbarBusy(root, false);
        privilegeControl.find("input").prop("checked", privilegeControl.attr("data-privileged") === "true");
        animateBanner(event, message || "Failed to start exercise.", "error");
    }

    CTFd.fetch("/pwncollege_api/v1/docker", {
        method: "GET",
        credentials: 'same-origin'
    }).then(function (response) {
        if (response.status === 403) {
            // User is not logged in or CTF is paused.
            window.location =
                CTFd.config.urlRoot +
                "/login?next=" +
                CTFd.config.urlRoot +
                window.location.pathname +
                window.location.hash;
        }
        return response.json();
    }).then(function (result) {
        if (result.success == false) {
            startFailed(result.error);
            return;
        }

        var params = {
            "dojo": result.dojo,
            "module": result.module,
            "challenge": result.challenge,
            "practice": privileged,
        };

        return CTFd.fetch('/pwncollege_api/v1/docker', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        }).then(function (response) {
            return response.json();
        }).then(function (result) {
            if (result.success == false) {
                startFailed(result.error);
                return;
            }

            privilegeControl.attr("data-privileged", privileged ? "true" : "false");
            privilegeControl.find("input").prop("checked", privileged);

            refreshWorkspace(root);
            postStartChallenge(event, channel);
            window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));

            setActionbarBusy(root, false);
        });
    }).catch(function () {
        startFailed();
    });
}

function actionStartCallback(event) {
    event.preventDefault();
    setActionbarBusy(context(event), true);
    actionStartChallenge(event);
}

function privilegeChangeCallback(event) {
    const checkbox = event.currentTarget;
    const mode = checkbox.checked ? "with sudo access" : "without sudo access";
    if (!window.confirm(`Restart the exercise ${mode}? The running container will be replaced.`)) {
        checkbox.checked = !checkbox.checked;
        return;
    }
    setActionbarBusy(context(event), true);
    actionStartChallenge(event, checkbox.checked);
}

function actionResetCallback(event) {
    event.preventDefault();
    if (!window.confirm("Completely reset this exercise? This permanently erases /home/hacker and all container changes, then recreates the exercise from its original state.")) {
        return;
    }

    const root = context(event);
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
            animateBanner(event, result.error || "Failed to reset exercise.", "error");
            return;
        }
        refreshWorkspace(root);
        postStartChallenge(event, channel);
        window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
        animateBanner(event, "Exercise reset to its original state.", "success");
    }).catch(function () {
        animateBanner(event, "Failed to reset exercise.", "error");
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
    loadWorkspace();
    $(".workspace-controls").each(function () {
        $(this).find(".workspace-service").click(serviceClickCallback);

        $(this).find("#flag-input").on("input", function(event) {
            event.preventDefault();
            if ($(this).val().match(/pwn.college{.*}/)) {
                actionSubmitFlag(event);
            }
        });
        $(this).find("#flag-input").on("keyup", function(event) {
            if (event.key === "Enter") {
                actionSubmitFlag(event);
            }
        });

        $(this).find(".btn-challenge-start").click(actionStartCallback);
        $(this).find("#challenge-reset").click(actionResetCallback);

        $(this).find("#workspace-change-privilege input").on("change", privilegeChangeCallback);

        $(this).find("[data-clipboard-action='paste']").on("click", pasteDesktopClipboard);
        $(this).find("[data-clipboard-action='copy']").on("click", copyDesktopClipboard);

        $(this).find("#fullscreen").click((event) => {
            event.preventDefault();
            doFullscreen(event);
        })
    });
});

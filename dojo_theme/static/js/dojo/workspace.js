function hideNavbar() {
    $(".navbar").addClass("navbar-hidden");
    $("main").addClass("main-navbar-hidden");
}

function showNavbar() {
    $(".navbar").removeClass("navbar-hidden");
    $("main").removeClass("main-navbar-hidden");
}

let workspaceNavbarHiddenBeforeFullscreen = false;

function setFullscreenIcon(active) {
    $("#fullscreen i")
        .toggleClass("fa-compress", active)
        .toggleClass("fa-expand", !active);
}

function focusWorkspaceKeyboard() {
    const iframe = document.getElementById("workspace-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.focus({preventScroll: true});
        iframe.contentWindow.postMessage({type: "aisecedu:focus-remote-keyboard"}, "*");
    }
}

async function doFullscreen() {
    const shell = document.querySelector(".workspace-shell") || document.documentElement;
    if (!document.fullscreenEnabled || !shell.requestFullscreen) {
        const expanded = document.getElementsByClassName("navbar")[0].classList.contains("navbar-hidden");
        expanded ? showNavbar() : hideNavbar();
        setFullscreenIcon(!expanded);
        focusWorkspaceKeyboard();
        return;
    }

    if (document.fullscreenElement) {
        if (navigator.keyboard && navigator.keyboard.unlock) {
            navigator.keyboard.unlock();
        }
        await document.exitFullscreen();
        return;
    }

    workspaceNavbarHiddenBeforeFullscreen = document.getElementsByClassName("navbar")[0].classList.contains("navbar-hidden");
    try {
        await shell.requestFullscreen();
        hideNavbar();
        if (navigator.keyboard && navigator.keyboard.lock) {
            try {
                await navigator.keyboard.lock();
            } catch (error) {}
        }
        focusWorkspaceKeyboard();
    } catch (error) {
        workspaceNavbarHiddenBeforeFullscreen ? showNavbar() : hideNavbar();
        setFullscreenIcon(!workspaceNavbarHiddenBeforeFullscreen);
        focusWorkspaceKeyboard();
    }
}

document.addEventListener("fullscreenchange", function () {
    const active = Boolean(document.fullscreenElement);
    setFullscreenIcon(active);
    if (!active) {
        if (navigator.keyboard && navigator.keyboard.unlock) {
            navigator.keyboard.unlock();
        }
        workspaceNavbarHiddenBeforeFullscreen ? hideNavbar() : showNavbar();
    }
    focusWorkspaceKeyboard();
});

function initializeWorkspaceNavigation() {
    const navigation = document.querySelector("[data-workspace-navigation]");
    if (!navigation || !window.DojoLearning) {
        return;
    }

    const toggle = navigation.querySelector(".workspace-navigation-toggle");
    const courseSelect = navigation.querySelector("[data-workspace-course]");
    const moduleSelect = navigation.querySelector("[data-workspace-module]");
    const challengeList = navigation.querySelector("[data-workspace-challenges]");
    const status = navigation.querySelector("[data-workspace-navigation-status]");
    const currentDojo = navigation.dataset.currentDojo;
    const currentModule = navigation.dataset.currentModule;
    const currentChallenge = navigation.dataset.currentChallenge;
    let courses = [];

    function setCollapsed(collapsed) {
        navigation.classList.toggle("is-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.setAttribute("title", collapsed ? "Expand course navigation" : "Collapse course navigation");
        localStorage.setItem("workspace_navigation_collapsed", collapsed ? "true" : "false");
    }

    function setStatus(message, error) {
        status.textContent = message || "";
        status.style.color = error ? "#ff6b6b" : "#aaa";
    }

    function option(value, label) {
        const element = document.createElement("option");
        element.value = value;
        element.textContent = label || value;
        return element;
    }

    function selectedCourse() {
        return courses.find(course => course.id === courseSelect.value) || null;
    }

    function selectedModule() {
        const course = selectedCourse();
        return course && course.modules.find(module => module.id === moduleSelect.value) || null;
    }

    function setNavigationBusy(busy) {
        courseSelect.disabled = busy;
        moduleSelect.disabled = busy;
        challengeList.querySelectorAll("button").forEach(button => {
            button.disabled = busy || button.dataset.locked === "true" || button.dataset.active === "true";
        });
    }

    async function switchChallenge(course, module, challenge, button) {
        if (button.dataset.active === "true" || button.dataset.locked === "true") {
            return;
        }
        if (!window.confirm(`Switch to ${challenge.name || challenge.id}? The running container will be replaced; home files are kept unless you use Reset.`)) {
            return;
        }

        setNavigationBusy(true);
        setStatus(`Starting ${challenge.name || challenge.id}…`);
        try {
            const response = await CTFd.fetch("/pwncollege_api/v1/docker", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    dojo: course.id,
                    module: module.id,
                    challenge: challenge.id,
                    practice: false
                })
            });
            if (response.status === 403) {
                window.location = CTFd.config.urlRoot + "/login?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                return;
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || "Failed to switch exercise.");
            }
            window.location.reload();
        } catch (error) {
            setNavigationBusy(false);
            setStatus(error.message || "Failed to switch exercise.", true);
        }
    }

    function renderChallenges() {
        const course = selectedCourse();
        const module = selectedModule();
        challengeList.replaceChildren();
        if (!course || !module) {
            setStatus("No exercises are available in this unit.");
            return;
        }

        const items = module.publishedItems || [];
        items.forEach(challenge => {
            const active = course.id === currentDojo && module.id === currentModule && challenge.id === currentChallenge;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workspace-navigation-challenge" + (active ? " is-active" : "");
            button.dataset.active = active ? "true" : "false";
            button.dataset.locked = challenge.locked ? "true" : "false";
            button.disabled = active || Boolean(challenge.locked);
            const icon = document.createElement("i");
            icon.className = challenge.locked ? "fas fa-lock" : challenge.completed ? "fas fa-flag" : "far fa-flag";
            const label = document.createElement("span");
            label.textContent = challenge.name || challenge.id;
            button.append(icon, label);
            button.addEventListener("click", function () {
                switchChallenge(course, module, challenge, button);
            });
            challengeList.appendChild(button);
        });
        setStatus(items.length ? `${items.length} exercise${items.length === 1 ? "" : "s"}` : "No exercises are available in this unit.");
    }

    function renderModules(preferredModule) {
        const course = selectedCourse();
        moduleSelect.replaceChildren();
        (course && course.modules || []).forEach(module => {
            moduleSelect.appendChild(option(module.id, module.name || module.id));
        });
        const requested = (course && course.modules || []).find(module => module.id === preferredModule);
        if (requested) {
            moduleSelect.value = requested.id;
        }
        renderChallenges();
    }

    async function loadCourses() {
        try {
            const response = await window.DojoLearning.request("/learning/overview");
            courses = response.courses || [];
            courseSelect.replaceChildren();
            courses.forEach(course => {
                courseSelect.appendChild(option(course.id, course.name || course.id));
            });
            const activeCourse = courses.find(course => course.id === currentDojo);
            if (activeCourse) {
                courseSelect.value = activeCourse.id;
            }
            renderModules(activeCourse ? currentModule : null);
        } catch (error) {
            setStatus(error.message || "Course navigation could not be loaded.", true);
        }
    }

    toggle.addEventListener("click", function () {
        setCollapsed(!navigation.classList.contains("is-collapsed"));
    });
    courseSelect.addEventListener("change", function () {
        renderModules(null);
    });
    moduleSelect.addEventListener("change", renderChallenges);
    setCollapsed(localStorage.getItem("workspace_navigation_collapsed") === "true");
    loadCourses();
}

$(() => {
    if (new URLSearchParams(window.location.search).has("hide-navbar")) {
        hideNavbar();
    }
    $(".close-link").hide();
    $("footer").hide();
    initializeWorkspaceNavigation();

    channel.addEventListener("message", (event) => {
        window.location.reload();
    });
})

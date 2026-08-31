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
    const toggleIcon = navigation.querySelector("[data-workspace-navigation-toggle-icon]");
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
        if (window.matchMedia("(max-width: 700px)").matches) {
            navigation.classList.toggle("is-mobile-open", !collapsed);
            const backdrop = document.querySelector("[data-workspace-mobile-backdrop]");
            if (backdrop) backdrop.hidden = collapsed;
        }
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.setAttribute("title", collapsed ? "展开课程导航" : "收起课程导航");
        toggle.setAttribute("aria-label", collapsed ? "展开课程导航" : "收起课程导航");
        toggleIcon.className = collapsed ? "fas fa-sitemap" : "fas fa-chevron-left";
        if (!window.matchMedia("(max-width: 700px)").matches) {
            localStorage.setItem("workspace_navigation_collapsed", collapsed ? "true" : "false");
        }
        window.dispatchEvent(new CustomEvent("dojo:workspace-panel", {detail: {panel: collapsed ? "workspace" : "navigation"}}));
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
        const confirmed = window.AISecEduUI && await window.AISecEduUI.confirm(
            `当前运行中的题目环境会被替换。切换到“${challenge.name || challenge.id}”后，可保留的工作区数据和历史回放仍会保留。`,
            {
                title: "切换题目",
                subtitle: `${course.name || course.id} · ${module.name || module.id}`,
                confirmLabel: "切换并启动",
            }
        );
        if (!confirmed) return;

        if (window.matchMedia("(max-width: 700px)").matches) setCollapsed(true);
        setNavigationBusy(true);
        setStatus(`正在启动 ${challenge.name || challenge.id}…`);
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
                throw new Error(result.error || "切换练习失败。");
            }
            window.location.reload();
        } catch (error) {
            setNavigationBusy(false);
            setStatus(error.message || "切换练习失败。", true);
        }
    }

    function renderChallenges() {
        const course = selectedCourse();
        const module = selectedModule();
        challengeList.replaceChildren();
        if (!course || !module) {
            setStatus("此单元没有可用练习。");
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
        setStatus(items.length ? `${items.length} 个练习` : "此单元没有可用练习。");
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
            const response = await window.DojoLearning.request("/learning/overview?view=navigation");
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
            setStatus(error.message || "无法加载课程导航。", true);
        }
    }

    toggle.addEventListener("click", function () {
        setCollapsed(!navigation.classList.contains("is-collapsed"));
    });
    courseSelect.addEventListener("change", function () {
        renderModules(null);
    });
    moduleSelect.addEventListener("change", renderChallenges);
    setCollapsed(window.matchMedia("(max-width: 700px)").matches || localStorage.getItem("workspace_navigation_collapsed") === "true");
    loadCourses();
}

function initializeWorkspaceMobilePanels() {
    const controls = Array.from(document.querySelectorAll("[data-workspace-mobile-panel]"));
    if (!controls.length) return;
    const navigation = document.querySelector("[data-workspace-navigation]");
    const backdrop = document.querySelector("[data-workspace-mobile-backdrop]");
    const tutor = document.querySelector("[data-learning-tutor]");

    function mark(panel) {
        controls.forEach(button => {
            const active = button.dataset.workspaceMobilePanel === panel;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function closeTutor() {
        const toggle = tutor && tutor.querySelector(".learning-tutor-toggle");
        if (tutor && !tutor.classList.contains("is-collapsed")) toggle?.click();
    }

    function select(panel) {
        if (panel === "navigation") {
            closeTutor();
            navigation?.classList.remove("is-collapsed");
            navigation?.classList.add("is-mobile-open");
            navigation?.querySelector(".workspace-navigation-toggle")?.setAttribute("aria-expanded", "true");
            if (backdrop) backdrop.hidden = false;
        } else {
            navigation?.classList.add("is-collapsed");
            navigation?.classList.remove("is-mobile-open");
            navigation?.querySelector(".workspace-navigation-toggle")?.setAttribute("aria-expanded", "false");
            if (backdrop) backdrop.hidden = true;
            if (panel === "tutor" && tutor?.classList.contains("is-collapsed")) {
                tutor.querySelector(".learning-tutor-toggle")?.click();
            } else if (panel !== "tutor") {
                closeTutor();
            }
        }
        mark(panel);
    }

    controls.forEach(button => button.addEventListener("click", () => select(button.dataset.workspaceMobilePanel)));
    backdrop?.addEventListener("click", () => select("workspace"));
    window.addEventListener("dojo:workspace-panel", event => {
        if (!window.matchMedia("(max-width: 700px)").matches) return;
        mark(event.detail && event.detail.panel || "workspace");
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && window.matchMedia("(max-width: 700px)").matches) select("workspace");
    });
}

$(() => {
    if (new URLSearchParams(window.location.search).has("hide-navbar")) {
        hideNavbar();
    }
    $(".close-link").hide();
    $("footer").hide();
    initializeWorkspaceNavigation();
    initializeWorkspaceMobilePanels();

    channel.addEventListener("message", (event) => {
        window.location.reload();
    });
})

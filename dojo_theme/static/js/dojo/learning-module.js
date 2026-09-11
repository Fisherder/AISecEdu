(function () {
  "use strict";

  const toggle = document.getElementById("unit-outline-toggle");
  const outline = document.getElementById("unit-outline");
  const content = document.getElementById("module-content");
  const layout = document.querySelector(".unit-learning-layout");
  if (!toggle || !outline || !content || !layout) return;

  const mobileViewport = window.matchMedia("(max-width: 760px)");
  const preferenceKey = "aisecedu-unit-outline-collapsed";
  let desktopCollapsed = false;
  let mobileOpen = false;
  try {
    desktopCollapsed = window.localStorage.getItem(preferenceKey) === "true";
  } catch (_) {}

  function renderOutline() {
    const mobile = mobileViewport.matches;
    const open = mobile ? mobileOpen : !desktopCollapsed;
    const label = mobile ? (open ? "关闭本章目录" : "打开本章目录") : (open ? "收起本章目录" : "展开本章目录");
    layout.classList.toggle("is-outline-collapsed", !mobile && desktopCollapsed);
    outline.hidden = !mobile && desktopCollapsed;
    outline.inert = !open;
    outline.setAttribute("aria-hidden", String(!open));
    outline.classList.toggle("is-open", mobile && open);
    document.body.classList.toggle("unit-outline-open", mobile && open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.querySelector("i").className = `fas ${mobile ? (open ? "fa-times" : "fa-list") : (open ? "fa-chevron-left" : "fa-chevron-right")}`;
    toggle.querySelector("span").textContent = mobile ? label : "目录";
  }

  function closeMobileOutline(restoreFocus) {
    if (!mobileOpen) return;
    mobileOpen = false;
    renderOutline();
    if (restoreFocus) toggle.focus();
  }

  function itemForLink(link) {
    if (link.dataset.challengeOutline) {
      const heading = content.querySelector(`[data-challenge-id="${CSS.escape(link.dataset.challengeOutline)}"]`);
      if (heading) return heading.closest(".accordion-item");
    }
    const hash = String(link.getAttribute("href") || "").split("#")[1];
    return hash ? document.getElementById(hash) : null;
  }

  function activate(link, moveFocus) {
    const item = itemForLink(link);
    if (!item) return;
    outline.querySelectorAll(".unit-outline-item").forEach(row => row.classList.toggle("is-current", row === link));
    const button = item.querySelector(".challenge-button-2");
    if (button && button.getAttribute("aria-expanded") !== "true" && !button.classList.contains("disabled")) button.click();
    window.setTimeout(() => {
      item.scrollIntoView({behavior: "smooth", block: "start"});
      if (moveFocus) {
        item.setAttribute("tabindex", "-1");
        item.focus({preventScroll: true});
      }
    }, button ? 260 : 0);
    closeMobileOutline(false);
  }

  outline.querySelectorAll(".unit-outline-item").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      activate(link, true);
    });
  });

  toggle.addEventListener("click", () => {
    if (mobileViewport.matches) {
      mobileOpen = !mobileOpen;
    } else {
      desktopCollapsed = !desktopCollapsed;
      try {
        window.localStorage.setItem(preferenceKey, String(desktopCollapsed));
      } catch (_) {}
    }
    renderOutline();
  });
  mobileViewport.addEventListener("change", () => {
    mobileOpen = false;
    renderOutline();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMobileOutline(true);
  });
  document.addEventListener("click", event => {
    if (!mobileViewport.matches || !mobileOpen) return;
    if (!outline.contains(event.target) && !toggle.contains(event.target)) closeMobileOutline(false);
  });
  renderOutline();

  document.querySelectorAll("[data-learning-transition]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = link.href;
      const api = window.DojoLearning;
      if (!api) return;
      event.preventDefault();
      Promise.race([
        api.json("POST", "/learning/telemetry", {
          event: "learning_context_transition",
          properties: {
            fromType: "module",
            toType: link.dataset.learningTransition || "course_item",
            preserved: true,
          },
        }).catch(function () {}),
        new Promise(resolve => window.setTimeout(resolve, 180)),
      ]).finally(() => window.location.assign(destination));
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const link = Array.from(outline.querySelectorAll(".unit-outline-item")).find(row => itemForLink(row) === visible.target);
      if (link) outline.querySelectorAll(".unit-outline-item").forEach(row => row.classList.toggle("is-current", row === link));
    }, {rootMargin: "-25% 0px -55%", threshold: [0.1, 0.5]});
    content.querySelectorAll(".accordion-item, .unit-inline-resource").forEach(item => observer.observe(item));
  }
})();

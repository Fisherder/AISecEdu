(function () {
  "use strict";
  const root = document.getElementById("teacher-agent");
  if (!root) return;
  const user = window.init?.userId || "guest";
  const sizes = {sidebar: 248, details: 400};
  const handles = [...root.querySelectorAll("[data-panel-resize]")];
  let layoutFrame = 0;
  function scheduleLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      apply("sidebar",sizes.sidebar);
      apply("details",sizes.details);
    });
  }
  function limits(kind) {
    const available = root.getBoundingClientRect().width - (root.classList.contains("is-sidebar-collapsed") ? 0 : sizes.sidebar) - 420;
    return kind === "sidebar" ? [200,340] : [280,Math.max(280,Math.min(640,available))];
  }
  function apply(kind, value, persist = false) {
    const [min,max] = limits(kind);
    sizes[kind] = Math.round(Math.min(max,Math.max(min,value)));
    root.style.setProperty("--agent-" + kind + "-width",sizes[kind]+"px");
    const handle = handles.find(el => el.dataset.panelResize === kind);
    handle?.setAttribute("aria-valuenow",String(sizes[kind]));
    handle?.setAttribute("aria-valuemax",String(Math.round(max)));
    if (persist) { try { localStorage.setItem("aisecedu-panel-"+user+"-"+kind,String(sizes[kind])); } catch (error) {} }
  }
  for (const handle of handles) {
    const kind = handle.dataset.panelResize;
    try {
      const stored = Number(localStorage.getItem("aisecedu-panel-"+user+"-"+kind));
      if (Number.isFinite(stored) && stored > 0) sizes[kind] = stored;
    } catch (error) {}
    apply(kind,sizes[kind]);
    let drag = null;
    let dragFrame = 0;
    function updateDrag() {
      dragFrame = 0;
      if (!drag) return;
      apply(kind,drag.width+(drag.latestX-drag.x)*(kind === "details" ? -1 : 1));
      if (kind === "sidebar") apply("details",sizes.details);
    }
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || window.innerWidth < 1280) return;
      event.preventDefault();
      drag = {x:event.clientX,latestX:event.clientX,width:sizes[kind],id:event.pointerId};
      handle.setPointerCapture(event.pointerId);
      handle.focus({preventScroll:true});
    });
    handle.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      drag.latestX = event.clientX;
      if (!dragFrame) dragFrame = requestAnimationFrame(updateDrag);
    });
    function end(event) {
      if (!drag || drag.id !== event.pointerId) return;
      if (event.type === "pointerup") drag.latestX = event.clientX;
      if (dragFrame) cancelAnimationFrame(dragFrame);
      updateDrag();
      const pointerId = drag.id;
      drag = null;
      apply(kind,sizes[kind],true);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    }
    handle.addEventListener("pointerup",end);
    handle.addEventListener("pointercancel",end);
    handle.addEventListener("lostpointercapture",event => {
      if (drag) end(event);
    });
    handle.addEventListener("keydown",event => {
      const [min,max] = limits(kind);
      const direction = kind === "details" ? -1 : 1;
      const next = event.key === "ArrowLeft" ? sizes[kind]-24*direction : event.key === "ArrowRight" ? sizes[kind]+24*direction : event.key === "Home" ? min : event.key === "End" ? max : null;
      if (next === null) return;
      event.preventDefault(); apply(kind,next,true); apply("details",sizes.details);
    });
  }
  window.addEventListener("resize",scheduleLayout);
  new ResizeObserver(scheduleLayout).observe(root);
  new MutationObserver(scheduleLayout).observe(root,{attributes:true,attributeFilter:["class"]});
})();

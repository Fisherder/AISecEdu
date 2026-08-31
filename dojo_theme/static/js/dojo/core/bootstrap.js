(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const embedded = window.init && window.init.product;
  if (embedded && embedded.success) root.product = embedded.data;

  document.addEventListener("click", event => {
    const link = event.target.closest("[data-product-mode-link]");
    if (!link) return;
    const mode = link.dataset.productModeLink;
    localStorage.setItem("aisecedu-product-mode", mode);
    document.cookie = `aisecedu-mode=${encodeURIComponent(mode)}; Path=/; SameSite=Lax`;
  });

  root.refreshProductContext = async function refreshProductContext(options) {
    const mode = options?.mode || document.body.dataset.productMode || "";
    const path = `${window.location.pathname}${window.location.search}`;
    const query = new URLSearchParams({mode, path});
    const value = await root.get(`/ui/bootstrap?${query.toString()}`, {dedupeKey: "ui-bootstrap"});
    root.product = value;
    document.dispatchEvent(new CustomEvent("aisecedu:product-context", {detail: value}));
    return value;
  };
})();

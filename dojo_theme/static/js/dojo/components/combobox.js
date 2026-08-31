(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};

  function enhance(input) {
    const list = document.getElementById(input.getAttribute("aria-controls") || "");
    if (!list) return;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", String(!list.hidden));
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-autocomplete", input.getAttribute("aria-autocomplete") || "list");
    const options = () => Array.from(list.querySelectorAll("[role='option']:not([hidden])"));
    let activeIndex = -1;

    function setActive(index) {
      const visible = options();
      if (!visible.length) {
        activeIndex = -1;
        input.removeAttribute("aria-activedescendant");
        return null;
      }
      activeIndex = (index + visible.length) % visible.length;
      visible.forEach((option, optionIndex) => {
        if (!option.id) option.id = `${list.id}-option-${optionIndex + 1}`;
        option.setAttribute("aria-selected", String(optionIndex === activeIndex));
      });
      input.setAttribute("aria-activedescendant", visible[activeIndex].id);
      visible[activeIndex].scrollIntoView({block: "nearest"});
      return visible[activeIndex];
    }

    function open() {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      options().forEach(option => option.setAttribute("aria-selected", "false"));
      activeIndex = -1;
    }

    function select(option) {
      if (!option) return;
      input.value = option.dataset.value || option.textContent.trim();
      input.dispatchEvent(new CustomEvent("aisecedu:combobox-select", {
        bubbles: true,
        detail: {value: input.value, option},
      }));
      close();
    }

    input.addEventListener("focus", open);
    input.addEventListener("input", () => {
      if (input.dataset.comboboxFilter !== "false") {
        const needle = input.value.trim().toLocaleLowerCase();
        list.querySelectorAll("[role='option']").forEach(option => {
          option.hidden = Boolean(needle && !option.textContent.toLocaleLowerCase().includes(needle));
        });
      }
      open();
      setActive(0);
    });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open();
        setActive(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter" && input.getAttribute("aria-activedescendant")) {
        event.preventDefault();
        select(document.getElementById(input.getAttribute("aria-activedescendant")));
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    list.addEventListener("mousedown", event => event.preventDefault());
    list.addEventListener("click", event => select(event.target.closest("[role='option']")));
    input.addEventListener("blur", () => window.setTimeout(close, 0));
    const sync = () => input.setAttribute("aria-expanded", String(!list.hidden));
    new MutationObserver(sync).observe(list, {attributes: true, attributeFilter: ["hidden"]});
    return {input, list, open, close, select, setActive};
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll("[data-combobox][aria-controls]").forEach(input => {
      if (input.dataset.comboboxEnhanced !== "true") {
        input.dataset.comboboxEnhanced = "true";
        enhance(input);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll(document), {once: true});
  } else {
    enhanceAll(document);
  }
  root.combobox = {enhance, enhanceAll};
})();

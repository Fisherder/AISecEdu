(function (scope) {
  "use strict";

  const bindings = new WeakMap();

  function freshElements(container, selector) {
    if (!bindings.has(container)) bindings.set(container, new Map());
    const selectors = bindings.get(container);
    if (!selectors.has(selector)) selectors.set(selector, new WeakSet());
    const seen = selectors.get(selector);
    return Array.from(container.querySelectorAll(selector)).filter(element => {
      if (seen.has(element)) return false;
      seen.add(element);
      return true;
    });
  }

  function nodeKey(node) {
    if (node.nodeType !== 1) return "";
    for (const name of ["data-message-id", "data-agent-item", "data-agent-trace-item", "id"])
      if (node.hasAttribute(name)) return `${node.tagName}:${name}:${node.getAttribute(name)}`;
    return "";
  }

  function compatible(current, next) {
    return current.nodeType === next.nodeType && current.nodeName === next.nodeName;
  }

  function patchNode(current, next) {
    if (current.nodeType === 3) {
      if (current.data !== next.data) current.data = next.data;
      return;
    }
    if (current.nodeType !== 1) return;
    for (const attribute of Array.from(current.attributes))
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    for (const attribute of Array.from(next.attributes))
      if (current.getAttribute(attribute.name) !== attribute.value)
        current.setAttribute(attribute.name, attribute.value);
    if (["INPUT", "TEXTAREA"].includes(current.tagName)) return;
    patchChildren(current, next);
  }

  function patchChildren(current, next) {
    const original = Array.from(current.childNodes);
    const byKey = new Map(original.map(node => [nodeKey(node), node]).filter(([key]) => key));
    const used = new Set();
    const desired = Array.from(next.childNodes);
    for (let index = 0; index < desired.length; index++) {
      const target = desired[index];
      const key = nodeKey(target);
      let node = key ? byKey.get(key) : original[index];
      if (!node || used.has(node) || nodeKey(node) !== key || !compatible(node, target))
        node = target.cloneNode(true);
      else patchNode(node, target);
      used.add(node);
      const position = current.childNodes[index];
      if (position !== node) current.insertBefore(node, position || null);
    }
    for (const node of original)
      if (!used.has(node) && node.parentNode === current) node.remove();
  }

  function reconcile(container, html) {
    const template = container.ownerDocument.createElement("template");
    template.innerHTML = html;
    const selection = container.ownerDocument.getSelection();
    const selected = selection && !selection.isCollapsed ? selection.anchorNode : null;
    let deferred = false;
    if (selected && container.contains(selected)) {
      const article = selected.nodeType === 1 ? selected.closest("[data-message-id]")
        : selected.parentElement?.closest("[data-message-id]");
      const nextArticle = article && Array.from(template.content.children).find(node =>
        node.dataset.messageId === article.dataset.messageId);
      if (article && nextArticle && article.outerHTML !== nextArticle.outerHTML) {
        nextArticle.replaceWith(article.cloneNode(true));
        deferred = true;
      }
    }
    patchChildren(container, template.content);
    return { deferred };
  }

  const exported = { reconcile, freshElements };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else scope.AISecEduAgentTranscript = exported;
})(typeof window === "undefined" ? globalThis : window);

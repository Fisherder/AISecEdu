(function () {
  "use strict";

  // 平台常以 http://<IP>:<port> 的**非安全上下文**运行，此时 navigator.clipboard 不可用；
  // 这里提供带兜底的复制能力：优先异步剪贴板 API，其次隐藏 textarea + execCommand，
  // 最后退化为"选中文本"，让用户直接 Ctrl+C。
  async function writeText(text) {
    const value = String(text == null ? "" : text);
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return { ok: true, method: "async-clipboard" };
      } catch (error) {
        /* 继续走兜底 */
      }
    }
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "readonly");
    area.setAttribute("aria-hidden", "true");
    area.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(area);
    const focused = document.activeElement;
    const selection = document.getSelection();
    const saved = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    let copied = false;
    try {
      area.select();
      area.setSelectionRange(0, value.length);
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    area.remove();
    if (saved && selection) { selection.removeAllRanges(); selection.addRange(saved); }
    if (focused && document.contains(focused)) focused.focus({preventScroll:true});
    return {ok:copied,method:copied ? "execCommand" : "manual-required"};
  }

  function copyTarget(element) {
    return writeText(element ? element.innerText || element.textContent || "" : "");
  }

  window.AISecEduClipboard = { writeText: writeText, copyTarget: copyTarget };
})();

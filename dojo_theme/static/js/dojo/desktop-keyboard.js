(function () {
  "use strict";

  // 远程桌面的键盘在 iframe 里（客户机页面自己维护 #noVNC_keyboardinput 的焦点）。
  // 顶层工作区页面在这里只做两件事：
  //   1. 用户明确点桌面时，把键盘交给 iframe；
  //   2. 用户去操作顶层页面自己的控件（Flag、AI 学习助手、工具条按钮）时，通知 iframe
  //      交出键盘 —— 否则同源 iframe 里的 input.focus() 会把焦点从输入框抢走，
  //      学生表现为"只能输入一个字母，然后立刻失去焦点"。
  // 顶层页面不放置任何隐藏输入框，也不拦截按键。

  var KEY_MESSAGE = "aisecedu-desktop-key";

  function workspaceFrame() {
    return document.getElementById("workspace-iframe");
  }

  function desktopFrame() {
    var iframe = workspaceFrame();
    if (!iframe) return null;
    var src = iframe.getAttribute("src") || "";
    if (!src || src.indexOf("about:blank") !== -1) return null;
    var service = "";
    try {
      service = new URLSearchParams(window.location.search).get("service") || "";
    } catch (error) {
      service = "";
    }
    var isDesktop =
      service === "desktop" ||
      service === "desktop-windows" ||
      iframe.dataset.aiseceduDesktop === "1" ||
      src.indexOf("vnc.html") !== -1;
    return isDesktop ? iframe : null;
  }

  var LEGACY_TYPES = {
    "focus-keyboard": "aisecedu:focus-remote-keyboard",
    "release-keyboard": "aisecedu:release-remote-keyboard",
  };

  function post(iframe, kind) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ channel: KEY_MESSAGE, kind: kind }, "*");
      // Linux 桌面服务里的桥（workspace/services/desktop/keyboard-capture.js）
      // 使用旧的消息形状，两种都发一次，谁认得谁处理。
      var legacy = LEGACY_TYPES[kind];
      if (legacy) iframe.contentWindow.postMessage({ type: legacy }, "*");
    } catch (error) {
      /* 跨域或窗口已销毁时忽略 */
    }
  }

  // 顶层页面自己的控件拿着焦点时，键盘属于顶层页面，远程桌面不得抢。
  function pageOwnsKeyboard() {
    var active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return false;
    if (active === workspaceFrame()) return false;
    return true;
  }

  function clickInsideFrame(event, iframe) {
    if (event.target === iframe) return true;
    if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return false;
    var rect = iframe.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  function claimKeyboard(iframe, force) {
    if (!iframe) return;
    // 用户直接点在桌面上时，这一下点击本身就是"我要用桌面键盘"的明确意图，
    // 不能再因为焦点当前停在某个按钮上而放弃；其余触发（载入、握手、看门狗）
    // 都必须在顶层页面没有控件拿焦点时才接管。
    if (!force && pageOwnsKeyboard()) return;
    try {
      iframe.contentWindow.focus();
    } catch (error) {
      /* 跨域时忽略 */
    }
    post(iframe, "focus-keyboard");
  }

  function releaseKeyboard() {
    post(desktopFrame(), "release-keyboard");
  }

  function markDesktopReady(iframe) {
    if (!iframe) return;
    iframe.dataset.aiseceduLoaded = "1";
    iframe.dataset.aiseceduDesktop = "1";
    var card = document.getElementById("aisecedu-desktop-failure");
    if (card && card.parentNode) card.parentNode.removeChild(card);
  }

  function install() {
    ["mousedown", "touchstart"].forEach(function (type) {
      document.addEventListener(
        type,
        function (event) {
          var iframe = desktopFrame();
          if (!iframe || !clickInsideFrame(event, iframe)) return;
          window.setTimeout(function () {
            claimKeyboard(desktopFrame(), true);
          }, 0);
        },
        true
      );
    });

    document.addEventListener(
      "focusin",
      function (event) {
        var iframe = desktopFrame();
        if (!iframe || event.target === iframe) return;
        releaseKeyboard();
      },
      true
    );

    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.channel !== KEY_MESSAGE) return;
      var iframe = workspaceFrame();
      if (!iframe || (event.source && event.source !== iframe.contentWindow)) return;
      if (data.kind !== "ready" && data.kind !== "connected") return;
      markDesktopReady(iframe);
      if (!pageOwnsKeyboard()) claimKeyboard(desktopFrame());
    });

    var iframe = workspaceFrame();
    if (iframe) {
      iframe.addEventListener("load", function () {
        var target = desktopFrame();
        if (!target) return;
        if (!pageOwnsKeyboard()) claimKeyboard(target);
      });
    }

    // 顶层页面没有任何控件拿焦点（例如刚切换服务、页面重新获得焦点）时，
    // 把键盘交回桌面；只要学生在任何输入框里，就绝不打扰。
    window.setInterval(function () {
      var target = desktopFrame();
      if (!target) return;
      if (document.activeElement === target) return;
      if (pageOwnsKeyboard()) return;
      post(target, "focus-keyboard");
    }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();

(function () {
  "use strict";

  const root = window.AISecEdu = window.AISecEdu || {};
  const allowedPrefixes = ["/student", "/learning", "/guide", "/dojos", "/dojo/", "/workspace", "/teacher", "/admin"];

  function safeReturnTo(value, fallback) {
    const target = String(value || "").trim();
    if (!target.startsWith("/") || target.startsWith("//")) return fallback || "/";
    let parsed;
    try {
      parsed = new URL(target, window.location.origin);
    } catch (error) {
      return fallback || "/";
    }
    if (parsed.origin !== window.location.origin) return fallback || "/";
    return allowedPrefixes.some(prefix => parsed.pathname.startsWith(prefix))
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback || "/";
  }

  function snapshot(key, value) {
    const payload = {...(value || {}), savedAt: Date.now()};
    sessionStorage.setItem(`aisecedu:return:${key}`, JSON.stringify(payload));
    return payload;
  }

  function restore(key, maxAge) {
    try {
      const payload = JSON.parse(sessionStorage.getItem(`aisecedu:return:${key}`) || "null");
      if (!payload || Date.now() - payload.savedAt > (maxAge || 30 * 60 * 1000)) return null;
      return payload;
    } catch (error) {
      return null;
    }
  }

  root.urlState = {safeReturnTo, snapshot, restore};
})();

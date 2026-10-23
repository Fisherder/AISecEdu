(function (scope) {
  "use strict";

  function readString(source, start) {
    let value = "";
    for (let index = start + 1; index < source.length; index++) {
      const char = source[index];
      if (char === '"') return { value, end: index + 1, complete: true };
      if (char === "\\") {
        const escape = source[++index];
        if (escape === undefined) break;
        if (escape === "u") {
          const hex = source.slice(index + 1, index + 5);
          if (hex.length < 4) break;
          if (!/^[a-f0-9]{4}$/i.test(hex)) return null;
          value += String.fromCharCode(parseInt(hex, 16));
          index += 4;
        } else {
          const escapes = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (!Object.hasOwn(escapes, escape)) return null;
          value += escapes[escape];
        }
      } else {
        if (char.charCodeAt(0) < 32) return null;
        value += char;
      }
    }
    if (/\p{Surrogate}$/u.test(value)) value = value.slice(0, -1);
    return { value, end: source.length, complete: false };
  }

  function topLevelAnswer(raw) {
    const source = String(raw || "").replace(/^\s*```(?:json)?\s*/i, "").trimStart();
    if (source[0] !== "{") return "";
    let depth = 0;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === "{" || char === "[") depth++;
      if (char === "}" || char === "]") depth--;
      if (char !== '"') continue;
      const token = readString(source, index);
      if (!token || !token.complete) return "";
      let next = token.end;
      while (/\s/.test(source[next] || "") && next < source.length) next++;
      if (depth === 1 && token.value === "answer" && source[next] === ":") {
        next++;
        while (/\s/.test(source[next] || "") && next < source.length) next++;
        if (source[next] !== '"') return "";
        return readString(source, next)?.value || "";
      }
      index = token.end - 1;
    }
    return "";
  }

  function streamedAnswer(runs) {
    for (let index = runs.length - 1; index >= 0; index--) {
      const messages = runs[index].items.filter(item => item.kind === "message");
      for (let offset = messages.length - 1; offset >= 0; offset--) {
        const value = topLevelAnswer(messages[offset].content || messages[offset].output);
        if (value) return value;
      }
    }
    return "";
  }

  const exported = { topLevelAnswer, streamedAnswer };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else scope.AISecEduAgentStreamText = exported;
})(typeof window === "undefined" ? globalThis : window);

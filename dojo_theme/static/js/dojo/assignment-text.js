(function (scope) {
  "use strict";

  // Assignment text is untrusted content, not HTML. Support the small Markdown
  // subset needed for teaching code without enabling links, images or scripts.
  function escape(value) {
    return value.replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function inline(value) {
    return value.split(/(`[^`\n]+`)/g).map(part =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2
        ? `<code>${escape(part.slice(1, -1))}</code>`
        : escape(part)
    ).join("");
  }

  function render(value) {
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let prose = [];
    const flush = () => {
      if (prose.length) blocks.push(`<p>${prose.map(inline).join("<br>")}</p>`);
      prose = [];
    };
    for (let index = 0; index < lines.length; index++) {
      const opening = lines[index].match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
      if (!opening) {
        if (lines[index] === "") flush();
        else prose.push(lines[index]);
        continue;
      }
      flush();
      const code = [];
      const closing = new RegExp("^ {0,3}" + opening[1][0] + "{" + opening[1].length + ",}\\s*$");
      while (++index < lines.length && !closing.test(lines[index])) code.push(lines[index]);
      // Keep indentation, operators and literal markup exactly as text. A long
      // line scrolls within its code block rather than widening the whole page.
      blocks.push(`<pre tabindex="0" aria-label="题目代码"><code>${escape(code.join("\n"))}</code></pre>`);
    }
    flush();
    return blocks.join("");
  }

  scope.DojoAssignmentText = Object.freeze({ render });
})(window);

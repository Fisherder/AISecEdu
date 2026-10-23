(function (scope) {
  "use strict";

  function changes(before, after, path = "$", output = []) {
    if (Object.is(before, after)) return output;
    if (before && after && typeof before === "object" && typeof after === "object" && Array.isArray(before) === Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const child = Array.isArray(before) ? `${path}[${key}]` : `${path}[${JSON.stringify(key)}]`;
        if (!Object.hasOwn(after, key)) output.push({ path: child, kind: "removed", before: before[key] });
        else if (!Object.hasOwn(before, key)) output.push({ path: child, kind: "added", after: after[key] });
        else changes(before[key], after[key], child, output);
      }
    } else output.push({ path, kind: "changed", before, after });
    return output;
  }

  function markup(rows, escape) {
    const titles = { added: "新增", removed: "删除", changed: "修改" };
    const format = value => typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return `<p class="artifact-diff-summary">${rows.length ? `共 ${rows.length} 处内容变化` : "两个版本的内容相同"}</p>${rows.map(row => `<details class="artifact-diff-row is-${row.kind}"><summary><b>${titles[row.kind]}</b><code>${escape(row.path)}</code></summary><div class="artifact-compare-grid">${row.kind !== "added" ? `<div><strong>所选版本</strong><pre>${escape(format(row.before))}</pre></div>` : ""}${row.kind !== "removed" ? `<div><strong>当前版本</strong><pre>${escape(format(row.after))}</pre></div>` : ""}</div></details>`).join("")}`;
  }

  const exported = { changes, markup };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else scope.AISecEduArtifactDiff = exported;
})(typeof window === "undefined" ? globalThis : window);

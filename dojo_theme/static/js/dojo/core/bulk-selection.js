(function (root) {
  "use strict";
  function reconcile(selected, rows, identify = row => row.id, eligible = () => true) {
    const available = rows.filter(eligible);
    const ids = new Set(available.map(row => String(identify(row))));
    selected.forEach(id => {if (!ids.has(String(id))) selected.delete(id);});
    return available.filter(row => selected.has(String(identify(row))));
  }
  function toggleAll(selected, rows, identify = row => row.id, eligible = () => true) {
    const available = rows.filter(eligible);
    const chosen = reconcile(selected, rows, identify, eligible);
    selected.clear();
    if (chosen.length !== available.length) available.forEach(row => selected.add(String(identify(row))));
  }
  const api = {reconcile, toggleAll};
  root.AISecEduBulkSelection = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);

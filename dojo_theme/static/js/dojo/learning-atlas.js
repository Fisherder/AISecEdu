(function (host, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else host.DojoLearningAtlas = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const palette = {complete: "#55e0c0", verified: "#b29cff", working: "#54b5f8", help: "#ff8293", idle: "#edb867", not_started: "#334b61", empty: "#334b61"};
  const labels = {complete: "已完成", verified: "核验通过，待确认", working: "正在练习", help: "需要帮助", idle: "待跟进", not_started: "尚未开始", empty: "暂无任务"};
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const points = rows => rows.map(p => p.map(v => Number(v).toFixed(2)).join(",")).join(" ");
  function spark(values, color = "#55e0c0") {
    const max = Math.max(1, ...values), width = 118, height = 32;
    const line = values.map((v, i) => [2 + i / Math.max(1, values.length - 1) * (width - 4), height - 3 - v / max * (height - 6)]);
    return `<svg class="ix-spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points(line)}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function derive(data) {
    if (data.atlas) return data.atlas;
    const taskStates = Object.fromEntries(data.tasks.map(t => [t.key, {}]));
    const bands = Array.from({length: data.summary.requiredTasks + 1}, (_, completed) => ({completed, students: 0}));
    const checks = {total: 0, passed: 0, failed: 0, unknown: 0, checkedPairs: 0, latestPassedPairs: 0}, recent = [];
    for (const student of data.students) {
      if (bands[student.completed]) bands[student.completed].students++;
      const cells = new Map(student.cells.map(c => [c.taskKey, c]));
      for (const task of data.tasks) {
        const cell = cells.get(task.key), status = cell?.status || "not_started";
        taskStates[task.key][status] = (taskStates[task.key][status] || 0) + 1;
        if (!cell) continue;
        checks.total += cell.checks || 0; checks.failed += cell.failedChecks || 0; checks.passed += cell.passedChecks || 0;
        checks.checkedPairs += !!cell.checks; checks.latestPassedPairs += cell.lastCheckPassed === true;
        if (cell.lastActivity) recent.push({studentId: student.userId, taskKey: task.key, at: cell.lastActivity, status, recordCount: cell.recordCount});
      }
    }
    checks.unknown = checks.total - checks.passed - checks.failed;
    return {taskStates, completionBands: bands, checks, recent: recent.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12), modules: [], scoreBands: []};
  }
  function scene(data, config = {}) {
    const taskPage = config.taskPage || 0, studentPage = config.studentPage || 0;
    const tasks = data.tasks.slice(taskPage * 3, taskPage * 3 + 3);
    const students = [...data.students].sort((a, b) => a.userId - b.userId).slice(studentPage * 80, studentPage * 80 + 80);
    const compact = !!config.compact;
    const positions = compact ? (tasks.length === 1 ? [[480, 185]] : tasks.length === 2 ? [[300, 185], [660, 185]] : [[190, 185], [480, 185], [770, 185]]) : tasks.length === 1 ? [[480, 225]] : tasks.length === 2 ? [[300, 220], [675, 275]] : [[495, 130], [260, 300], [745, 300]];
    const name = config.name || (student => student.name);
    const key = config.selectedTask || tasks[0]?.key;
    const project = (x, y, z = 0, origin) => [origin[0] + (x - y) * .94, origin[1] + (x + y) * .40 - z];
    const poly = (rows, attrs) => `<polygon points="${points(rows)}" ${attrs}/>`;
    const links = tasks.slice(1).map((task, i) => {
      const a = positions[0], b = positions[i + 1];
      const path = compact ? `M${a[0] + 139},${a[1] + 5} H${b[0] - 139}` : `M${a[0]},${a[1] + 42} C${a[0]},${a[1] + 130} ${b[0]},${b[1] - 120} ${b[0]},${b[1] - 2}`;
      return `<path d="${path}" class="ix-route-base"/><path d="${path}" class="ix-route-light"/>`;
    }).join("");
    const islands = tasks.map((task, index) => {
      const origin = positions[index], width = 168, depth = 140, selected = key === task.key;
      const vertices = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
      const top = vertices.map(([x, y]) => project(x, y, 0, origin));
      const lower = vertices.map(([x, y]) => project(x, y, -17, origin));
      const ring = vertices.map(([x, y]) => project(x * 1.15, y * 1.15, -26, origin));
      const cells = students.map((student, i) => {
        const cell = student.cells.find(c => c.taskKey === task.key), status = cell?.status || "not_started";
        const x = -75 + i % 10 * 15, y = -59 + Math.floor(i / 10) * 15;
        const p = [[x, y], [x + 11, y], [x + 11, y + 11], [x, y + 11]].map(([a, b]) => project(a, b, 2, origin));
        return `<g role="button" tabindex="${i === 0 ? 0 : -1}" class="ix-scene-cell" data-ix="student" data-student="${student.userId}" data-task="${esc(task.key)}" aria-label="${esc(name(student))}，${esc(task.name)}，${esc(labels[status])}，查看证据"><title>${esc(name(student))} · ${esc(labels[status])}</title>${poly(p, `fill="${palette[status]}" stroke="${palette[status]}" stroke-opacity=".5" stroke-width=".5"`)}${status === "complete" ? `<path d="M${p[0][0] + 3},${p[0][1] + 3} l2,2 4,-1" fill="none" stroke="#0a2d2d" stroke-width="1" pointer-events="none"/>` : ""}</g>`;
      }).join("");
      const labelX = origin[0], labelY = origin[1] - 85;
      const rate = task.completionRate == null ? "—" : `${Math.round(task.completionRate * 100)}%`;
      const concise = task.name.replace(/^第[一二三四五六七八九十0-9]+次作业[：:]\s*/, "");
      const title = concise.length > 14 ? concise.slice(0, 13) + "…" : concise;
      return `<g class="ix-scene-island${selected ? " is-selected" : ""}">${poly(ring, 'fill="none" stroke="#31546c" stroke-width=".7" stroke-dasharray="3 5"')}${poly([top[1], top[2], lower[2], lower[1]], 'fill="#132c3e" stroke="#28546b" stroke-width=".7"')}${poly([top[2], top[3], lower[3], lower[2]], 'fill="#0d2331" stroke="#28546b" stroke-width=".7"')}${poly(top, `fill="url(#ix-deck)" stroke="${selected ? "#70e7e4" : "#3b687e"}" stroke-width="${selected ? 1.8 : .9}"`)}${cells}<path d="M${top[3][0]},${top[3][1] + 18} L${top[2][0]},${top[2][1] + 18}" stroke="${selected ? "#67e6da" : "#2c708c"}" stroke-width="2" class="ix-platform-edge"/><g class="ix-scene-task" role="button" tabindex="0" data-ix="select-task" data-task="${esc(task.key)}" aria-label="定位${esc(task.name)}，${task.completed} / ${task.studentCount} 人完成"><title>${esc(task.name)}</title><path d="M${labelX},${labelY + 42} V${origin[1] - 45}" stroke="#57758b" stroke-dasharray="2 3"/><rect x="${labelX - 122}" y="${labelY - 19}" width="244" height="62" rx="4"/><text x="${labelX - 109}" y="${labelY - 3}" class="ix-scene-index">${String(taskPage * 3 + index + 1).padStart(2, "0")} / ${esc(task.moduleName || "课程任务")}</text><text x="${labelX - 109}" y="${labelY + 15}" class="ix-scene-title">${esc(title)}</text><text x="${labelX - 109}" y="${labelY + 32}" class="ix-scene-fraction">${task.completed} / ${task.studentCount} 人完成</text><text x="${labelX + 108}" y="${labelY + 31}" text-anchor="end" class="ix-scene-rate">${rate}</text></g></g>`;
    }).join("");
    const grid = Array.from({length: 25}, (_, i) => {
      const x = -600 + i * 50;
      return `<path d="M${480 + x},70 l-620,290 M${480 + x},70 l620,290"/>`;
    }).join("");
    return `<svg class="ix-atlas-svg" viewBox="0 0 960 ${compact ? 330 : 480}" role="group" aria-label="课程学习地形，${tasks.length} 项任务，每格一位学生，颜色表示已保存的作业状态"><defs><linearGradient id="ix-deck" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#173c50"/><stop offset="1" stop-color="#0c1d2a"/></linearGradient><radialGradient id="ix-ground"><stop stop-color="#1c7182" stop-opacity=".24"/><stop offset="1" stop-color="#0a1521" stop-opacity="0"/></radialGradient></defs><ellipse cx="480" cy="${compact ? 180 : 270}" rx="475" ry="${compact ? 140 : 210}" fill="url(#ix-ground)"/><g class="ix-ground-grid" stroke="#3b697d" stroke-opacity=".14" stroke-width=".55">${grid}</g><ellipse cx="480" cy="${compact ? 180 : 275}" rx="440" ry="${compact ? 125 : 165}" fill="none" stroke="#33596f" stroke-opacity=".35" stroke-dasharray="3 8"/><path d="${compact ? "M18 187 H35 M925 187 H942 M480 30 V48 M480 295 V312" : "M80 292 H160 M800 292 H880 M480 73 V96 M480 445 V462"}" stroke="#416c7e" stroke-width="1"/><g>${links}</g>${islands}<text x="28" y="${compact ? 312 : 450}" class="ix-scene-coordinate">TASK LANDSCAPE / ${String(data.summary.students).padStart(3, "0")} LEARNERS</text><text x="934" y="${compact ? 312 : 450}" text-anchor="end" class="ix-scene-coordinate">${taskPage * 3 + 1}—${Math.min(taskPage * 3 + 3, data.tasks.length)} / ${data.tasks.length} TASKS</text></svg>`;
  }
  return {palette, labels, derive, scene, spark};
});

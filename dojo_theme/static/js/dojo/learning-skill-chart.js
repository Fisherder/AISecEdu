(function (scope) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);

  function render(values, options = {}) {
    const numberLabel = value => new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1}).format(value);
    const unit = options.unit === undefined ? "%" : String(options.unit);
    const items = (Array.isArray(values) ? values : []).map(item => ({
      label: String(item.label || ""),
      value: item.value === null || item.value === undefined || item.value === "" || !Number.isFinite(Number(item.value)) ? null : Math.max(0, Math.min(100, Number(item.value))),
    }));
    if (items.length < 3) return '<div class="sl-empty">暂无能力评估数据</div>';
    const center = [260, 203];
    const radius = 142;
    const point = (index, ratio) => {
      const angle = -Math.PI / 2 + index * 2 * Math.PI / items.length;
      return [center[0] + Math.cos(angle) * radius * ratio, center[1] + Math.sin(angle) * radius * ratio];
    };
    const coordinates = points => points.map(p => p.map(n => n.toFixed(2)).join(",")).join(" ");
    const grid = [0.25, 0.5, 0.75, 1].map(ratio => `<polygon points="${coordinates(items.map((_, index) => point(index, ratio)))}" class="sl-radar-grid"/>`).join("");
    const axes = items.map((_, index) => `<line x1="${center[0]}" y1="${center[1]}" x2="${point(index, 1)[0]}" y2="${point(index, 1)[1]}" class="sl-radar-axis"/>`).join("");
    const known = items.filter(item => item.value !== null);
    let shape = "";
    if (known.length === items.length) {
      shape = `<polygon points="${coordinates(items.map((item, index) => point(index, item.value / 100)))}" class="sl-radar-area"/>`;
    } else {
      shape = items.map((item, index) => {
        const next = (index + 1) % items.length;
        return item.value !== null && items[next].value !== null ? `<polyline points="${coordinates([point(index, item.value / 100), point(next, items[next].value / 100)])}" class="sl-radar-segment"/>` : "";
      }).join("");
    }
    const dots = items.map((item, index) => {
      if (item.value === null) return "";
      const p = point(index, item.value / 100);
      return `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="sl-radar-point"><title>${escape(item.label)} ${numberLabel(item.value)}${escape(unit)}</title></circle>`;
    }).join("");
    const labels = items.map((item, index) => {
      const p = point(index, 1.16);
      const anchor = Math.abs(p[0] - center[0]) < 3 ? "middle" : p[0] > center[0] ? "start" : "end";
      return `<text x="${p[0]}" y="${p[1] - 2}" text-anchor="${anchor}" class="sl-radar-label">${escape(item.label)}</text><text x="${p[0]}" y="${p[1] + 18}" text-anchor="${anchor}" class="sl-radar-value${item.value === null ? " is-unknown" : ""}">${item.value === null ? "暂无评估" : `${numberLabel(item.value)}${escape(unit)}`}</text>`;
    }).join("");
    const description = items.map(item => `${item.label}：${item.value === null ? "暂无评估" : numberLabel(item.value) + unit}`).join("；");
    return `<svg class="sl-skill-chart${options.compact ? " is-compact" : ""}" viewBox="0 0 520 410" role="img" aria-label="${escape(options.label || "六维能力画像")}：${escape(description)}"><title>${escape(options.label || "六维能力画像")}</title><desc>${escape(description)}</desc>${grid}${axes}<text x="267" y="${center[1] - radius + 15}" class="sl-radar-scale">100</text><text x="267" y="${center[1] - radius / 2 + 15}" class="sl-radar-scale">50</text>${shape}${dots}${labels}${known.length ? "" : '<text x="260" y="210" text-anchor="middle" class="sl-radar-no-data">暂无评估</text>'}</svg>`;
  }
  scope.DojoSkillChart = {render};
  if (typeof module !== "undefined" && module.exports) module.exports = {render};
})(typeof window !== "undefined" ? window : globalThis);

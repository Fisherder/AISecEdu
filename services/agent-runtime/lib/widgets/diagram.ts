export interface DiagramConfigNode {
  id: string;
  label: string;
  details?: string;
  kind?: string;
  column?: string;
  row?: string;
}
export interface DiagramAxis { id: string; label: string }
export interface DiagramLayout { columns: DiagramAxis[]; rows: DiagramAxis[] }
export interface DiagramStep { id: string; title: string; description?: string; nodeIds: string[] }
export interface DiagramConfigEdge {
  from: string;
  to: string;
  label?: string;
}
export interface DiagramConfig {
  type: 'diagram';
  diagramType: string;
  title: string;
  description?: string;
  nodes: DiagramConfigNode[];
  edges: DiagramConfigEdge[];
  /** Optional semantic grid: parallel alternatives/participants × shared stages. */
  layout?: DiagramLayout;
  /** Each node is introduced exactly once; earlier steps remain visible. */
  steps?: DiagramStep[];
}

export function validateDiagramConfig(value: unknown): DiagramConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
  if (obj.type !== undefined && obj.type !== 'diagram') return null;
  if (obj.title !== undefined && !text(obj.title, 240)) return null;
  if (obj.description !== undefined && !text(obj.description, 12000)) return null;
  if (obj.diagramType !== undefined && !text(obj.diagramType, 80)) return null;
  if (!Array.isArray(obj.nodes) || !obj.nodes.length || obj.nodes.length > 100) return null;
  if (obj.edges !== undefined && (!Array.isArray(obj.edges) || obj.edges.length > 400)) return null;
  const nodes: DiagramConfigNode[] = [], edges: DiagramConfigEdge[] = [], ids = new Set<string>();
  for (const item of obj.nodes) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (!text(item.id, 128) || !item.id.trim() || ids.has(item.id)) return null;
    if (!text(item.label, 240) || !item.label.trim()) return null;
    if (item.details !== undefined && !text(item.details, 20000)) return null;
    if (item.kind !== undefined && !text(item.kind, 80)) return null;
    if (item.column !== undefined && (!text(item.column, 128) || !item.column.trim())) return null;
    if (item.row !== undefined && (!text(item.row, 128) || !item.row.trim())) return null;
    ids.add(item.id);
    nodes.push({ id: item.id, label: item.label, details: item.details, kind: item.kind,
      ...(item.column !== undefined ? { column: item.column } : {}), ...(item.row !== undefined ? { row: item.row } : {}) });
  }
  for (const item of (obj.edges ?? []) as unknown[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const edge = item as Record<string, unknown>;
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string' || !ids.has(edge.from) || !ids.has(edge.to)) return null;
    if (edge.label !== undefined && !text(edge.label, 1000)) return null;
    edges.push({ from: edge.from, to: edge.to, label: edge.label as string | undefined });
  }
  let layout: DiagramLayout | undefined, steps: DiagramStep[] | undefined;
  const axis = (value: unknown, min: number, max: number): DiagramAxis[] | null => {
    if (!Array.isArray(value) || value.length < min || value.length > max) return null;
    const result: DiagramAxis[] = [], seen = new Set<string>();
    for (const entry of value) {
      if (!entry || !text(entry.id, 128) || !entry.id.trim() || seen.has(entry.id) || !text(entry.label, 80) || !entry.label.trim()) return null;
      seen.add(entry.id); result.push({ id: entry.id, label: entry.label });
    }
    return result;
  };
  if (obj.layout !== undefined) {
    if (!obj.layout || typeof obj.layout !== 'object' || Array.isArray(obj.layout)) return null;
    const grid = obj.layout as Record<string, unknown>;
    const columns = axis(grid.columns, 2, 6), rows = axis(grid.rows, 1, 16);
    if (!columns || !rows) return null;
    if (nodes.some(node => !columns.some(c => c.id === node.column) || !rows.some(r => r.id === node.row))) return null;
    if (columns.some(c => !nodes.some(n => n.column === c.id)) || rows.some(r => !nodes.some(n => n.row === r.id))) return null;
    layout = { columns, rows };
  } else if (nodes.some(node => node.column !== undefined || node.row !== undefined)) return null;
  if (obj.steps !== undefined) {
    if (!Array.isArray(obj.steps) || obj.steps.length < 2 || obj.steps.length > 24) return null;
    steps = []; const stepIds = new Set<string>(), covered = new Set<string>();
    for (const step of obj.steps) {
      if (!step || !text(step.id, 128) || !step.id.trim() || stepIds.has(step.id) || !text(step.title, 120) || !step.title.trim()) return null;
      if (step.description !== undefined && !text(step.description, 2000)) return null;
      if (!Array.isArray(step.nodeIds) || !step.nodeIds.length) return null;
      for (const id of step.nodeIds) {
        if (typeof id !== 'string' || !ids.has(id) || covered.has(id)) return null;
        covered.add(id);
      }
      stepIds.add(step.id); steps.push({ id: step.id, title: step.title, description: step.description, nodeIds: [...step.nodeIds] });
    }
    if (covered.size !== nodes.length) return null;
  }
  return {
    type: 'diagram', diagramType: (obj.diagramType as string) || 'flowchart',
    title: (obj.title as string) || 'Diagram', description: obj.description as string | undefined,
    nodes, edges, ...(layout ? { layout } : {}), ...(steps ? { steps } : {}),
  };
}

export function parseDiagramConfig(raw: string): DiagramConfig | null {
  if (raw.length > 2500000) return null;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return validateDiagramConfig(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}


export function extractDiagramConfig(html: string): DiagramConfig | null {
  if (typeof html !== 'string' || html.length > 12000000) return null;
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  let result: DiagramConfig | null = null, matches = 0;
  const scripts = /<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of source.matchAll(scripts)) {
    const attributes = new Map<string, string>();
    let malformed = false;
    const remainder = match[1].replace(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, key: string, double: string | undefined, single: string | undefined) => {
      key = key.toLowerCase();
      if (attributes.has(key)) malformed = true;
      attributes.set(key, double ?? single ?? '');
      return '';
    });
    if (attributes.get('id') !== 'widget-config') continue;
    if (++matches !== 1 || malformed || remainder.trim() || attributes.size !== 2 ||
      attributes.get('type')?.toLowerCase() !== 'application/json' || match[2].length > 2500000) return null;
    try {
      const value: unknown = JSON.parse(match[2]);
      if (!value || typeof value !== 'object' || (value as Record<string, unknown>).type !== 'diagram') return null;
      result = validateDiagramConfig(value);
      if (!result) return null;
    } catch { return null; }
  }
  return matches === 1 ? result : null;
}

const KIND_COLORS: Record<string, string> = {
  goal: '#1d4ed8',
  action: '#2563eb',
  asset: '#d97706',
  threat: '#dc2626',
  control: '#16a34a',
  host: '#475569',
  tactic: '#7c3aed',
  technique: '#6366f1',
};
const NODE_W = 150;
const NODE_H = 80;
const COL_GAP = 40;
const ROW_GAP = 40;
const MARGIN_X = 36;
const MARGIN_TOP = 64;

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function diagramEsc(s: string): string {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function layeredColumns(cfg: DiagramConfig, vertical: boolean): Map<string, { x: number; y: number }> {
  const ids = cfg.nodes.map((n) => n.id);
  const inDeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const outs = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of cfg.edges) {
    if (!outs.has(e.from) || !inDeg.has(e.to)) continue;
    outs.get(e.from)!.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  }
  const layer = new Map<string, number>();
  const queue = ids.filter((id) => inDeg.get(id) === 0);
  queue.forEach((id) => layer.set(id, 0));
  for (let i = 0; i < queue.length; i++) {
    for (const next of outs.get(queue[i])!) {
      layer.set(next, Math.max(layer.get(next) ?? 0, layer.get(queue[i])! + 1));
      inDeg.set(next, inDeg.get(next)! - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }
  // Feedback loops cannot have a longest path; place their remaining nodes once in source order.
  let remainingLayer = Math.max(0, ...layer.values()) + (queue.length ? 1 : 0);
  ids.forEach((id) => {
    if (inDeg.get(id)! > 0) layer.set(id, remainingLayer++);
  });

  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const l = layer.get(id)!;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  const pos = new Map<string, { x: number; y: number }>();
  sortedLayers.forEach((l, colIdx) => {
    const members = byLayer.get(l)!;
    members.forEach((id, rowIdx) => {
      pos.set(id, {
        x: MARGIN_X + (vertical ? rowIdx : colIdx) * (NODE_W + COL_GAP),
        y: MARGIN_TOP + (vertical ? colIdx : rowIdx) * (NODE_H + ROW_GAP),
      });
    });
  });
  return pos;
}

function gridPositions(cfg: DiagramConfig) {
  const grid = cfg.layout!, pos = new Map<string, { x: number; y: number }>();
  const columns = grid.columns.map((column, index) => ({ ...column, x: 116 + index * 230 }));
  let y = 80;
  const rows = grid.rows.map(row => {
    const height = Math.max(...columns.map(column => cfg.nodes.filter(n => n.row === row.id && n.column === column.id).length)) * (NODE_H + 40) + 20;
    columns.forEach(column => cfg.nodes.filter(n => n.row === row.id && n.column === column.id).forEach((node, index) => {
      pos.set(node.id, { x: column.x, y: y + 20 + index * (NODE_H + 40) });
    }));
    const result = { ...row, y, height }; y += height;
    return result;
  });
  return { pos, columns, rows };
}

export function renderDiagramHtml(cfg: DiagramConfig): string {
  const valid = validateDiagramConfig(cfg);
  if (!valid) throw new TypeError('Invalid diagram config or node reference');
  cfg = valid;
  const indices = new Map(cfg.nodes.map((node, index) => [node.id, index]));
  const renderView = (vertical: boolean) => {
    const orientation = vertical ? 'vertical' : 'horizontal', grid = cfg.layout ? gridPositions(cfg) : undefined;
    const pos = grid?.pos || layeredColumns(cfg, vertical), nodeWidth = grid ? 190 : NODE_W, topDown = vertical || !!grid;
    const width = Math.max(...[...pos.values()].map(p => p.x + nodeWidth)) + MARGIN_X;
    const height = Math.max(...[...pos.values()].map(p => p.y + NODE_H)) + MARGIN_TOP;
    const edges = cfg.edges.map((edge, index) => {
      const from = pos.get(edge.from)!, to = pos.get(edge.to)!;
      let x1 = from.x + nodeWidth, y1 = from.y + NODE_H / 2, x2 = to.x, y2 = to.y + NODE_H / 2;
      let d: string;
      if (topDown) {
        x1 = from.x + nodeWidth / 2; y1 = from.y + NODE_H; x2 = to.x + nodeWidth / 2; y2 = to.y;
        const middle = (y1 + y2) / 2;
        d = `M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`;
      } else {
        const middle = (x1 + x2) / 2;
        d = `M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}`;
      }
      let labelX = (x1 + x2) / 2, labelY = (y1 + y2) / 2 - 8;
      if (topDown ? to.y <= from.y : to.x <= from.x) {
        const lane = 16 + index % 3 * 8;
        if (topDown) {
          x1 = from.x; y1 = from.y + NODE_H / 2; x2 = to.x; y2 = to.y + NODE_H / 2;
          labelX = Math.min(x1, x2) - lane; labelY = (y1 + y2) / 2;
          d = `M${x1},${y1} C${labelX},${y1 + 35} ${labelX},${y2 - 35} ${x2},${y2}`;
        } else {
          x1 = from.x + nodeWidth / 2; y1 = from.y; x2 = to.x + nodeWidth / 2; y2 = to.y;
          labelX = (x1 + x2) / 2; labelY = Math.min(y1, y2) - lane;
          d = `M${x1},${y1} C${x1 + 35},${labelY} ${x2 - 35},${labelY} ${x2},${y2}`;
        }
      }
      // A branch to the second node of a grid cell must not pass through its
      // first node: that would visually turn alternatives into a sequence.
      if (grid) {
        const blocked = from.x !== to.x || to.y <= from.y || cfg.nodes.some(node => {
          if (node.id === edge.from || node.id === edge.to) return false;
          const other = pos.get(node.id)!;
          return other.x === from.x && other.y > from.y && other.y < to.y;
        });
        if (blocked) {
          const outside = from.x + nodeWidth + 18 + index % 2 * 6, above = to.y - 14;
          d = `M${from.x + nodeWidth},${from.y + NODE_H / 2} H${outside} V${above} H${to.x + nodeWidth / 2} V${to.y}`;
          labelX = to.x + nodeWidth / 2; labelY = to.y - 20;
        }
      }
      const label = edge.label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" class="edge-label"><title>${diagramEsc(edge.label)}</title>${diagramEsc([...edge.label].slice(0, 14).join(''))}${[...edge.label].length > 14 ? '…' : ''}</text>` : '';
      return `<g class="diagram-edge" data-from="${indices.get(edge.from)}" data-to="${indices.get(edge.to)}"><path class="edge-line" d="${d}" marker-end="url(#arrow-${orientation})"/>${label}</g>`;
    }).join('');
    const nodes = cfg.nodes.map((node, index) => {
      const p = pos.get(node.id)!;
      const color = node.kind && Object.hasOwn(KIND_COLORS, node.kind) ? KIND_COLORS[node.kind] : '#64748b';
      return `<button type="button" class="diagram-node" data-diagram-node="${diagramEsc(node.id)}" data-node-index="${index}" aria-label="${diagramEsc(node.label)}" aria-controls="diagram-details" aria-pressed="false" aria-expanded="false" style="left:${p.x}px;top:${p.y}px;width:${nodeWidth}px;--kind-color:${color}"><span class="node-number" aria-hidden="true">${index + 1}</span><span class="node-label">${diagramEsc(node.label)}</span><span class="node-hint" aria-hidden="true">查看说明</span></button>`;
    }).join('');
    const headers = grid ? grid.columns.map(column => `<div class="diagram-column" data-diagram-column="${diagramEsc(column.id)}" style="left:${column.x}px">${diagramEsc(column.label)}</div>`).join('') + grid.rows.map(row => `<div class="diagram-row" style="top:${row.y}px;width:${width}px;height:${row.height}px"><span>${diagramEsc(row.label)}</span></div>`).join('') : '';
    return `<div class="diagram-view diagram-${orientation}" data-orientation="${orientation}"><div class="diagram-scroll" role="region" aria-label="流程图；节点可通过键盘操作"><div class="diagram-canvas" style="width:${width}px;height:${height}px">${headers}<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs><marker id="arrow-${orientation}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#64748b"/></marker></defs>${edges}</svg>${nodes}</div></div></div>`;
  };
  const configJson = JSON.stringify(cfg).replace(/[<>&\u2028\u2029]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${diagramEsc(cfg.title)}</title>
<style>
  [hidden],.diagram-edge.is-hidden{display:none!important}.diagram-column{position:absolute;top:20px;width:190px;font-size:15px;font-weight:700;color:#1e40af;text-align:center;overflow-wrap:anywhere}.diagram-row{position:absolute;left:0;border-top:1px dashed #cbd5e1;pointer-events:none}.diagram-row span{display:block;width:104px;padding:24px 12px;font-size:13px;font-weight:650;color:#475569;overflow-wrap:anywhere}.diagram-sequence{padding:14px 18px;margin-bottom:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px}.sequence-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sequence-controls button{padding:9px 16px;border:1px solid #2563eb;border-radius:8px;background:#fff;color:#1e40af;cursor:pointer}.sequence-controls button:disabled{opacity:.45;cursor:default}.sequence-controls button:focus-visible{outline:3px solid #0f172a;outline-offset:3px}.sequence-controls strong{flex:1;min-width:160px;font-size:15px}.sequence-description{margin:10px 0 0;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.diagram-node.is-new{border-top:3px solid #2563eb}
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a}button{font:inherit} .wrap{padding:20px;max-width:1800px;margin:auto;min-width:0}h2{font-size:22px;margin:0 0 8px;overflow-wrap:anywhere}.desc{font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;color:#475569;margin:0 0 10px}.help{font-size:13px;color:#475569;margin:0 0 18px;line-height:1.6}.diagram-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}.diagram-view{min-width:0}.diagram-vertical{display:none}.diagram-scroll{overflow:auto;max-height:68vh;border:1px solid #cbd5e1;border-radius:14px;background:#fff}.diagram-canvas{position:relative;min-width:100%;margin:auto}.diagram-canvas svg{position:absolute;inset:0;pointer-events:none}.edge-line{fill:none;stroke:#94a3b8;stroke-width:2}.diagram-edge.is-related .edge-line{stroke:#2563eb;stroke-width:2.5}.edge-label{font-size:11px;fill:#475569;paint-order:stroke;stroke:#fff;stroke-width:5;stroke-linejoin:round}.diagram-node{position:absolute;width:${NODE_W}px;height:${NODE_H}px;padding:10px 12px 9px 34px;text-align:left;background:#fff;border:1px solid #cbd5e1;border-left:4px solid var(--kind-color);border-radius:10px;color:#0f172a;cursor:pointer;box-shadow:0 2px 6px #0f172a0a}.diagram-node:hover{background:#f1f5f9}.diagram-node[aria-pressed="true"]{background:#eff6ff;border-color:#2563eb;box-shadow:0 0 0 2px #2563eb33}.diagram-node:focus-visible{outline:3px solid #0f172a;outline-offset:4px}.node-number{position:absolute;left:10px;top:12px;font-size:11px;color:#64748b}.node-label{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:14px;line-height:1.4;font-weight:650;overflow-wrap:anywhere}.node-hint{display:block;font-size:11px;color:#475569;margin-top:5px}.details-panel{min-height:260px;min-width:0;padding:20px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;overflow-wrap:anywhere}.step-count{margin:0 0 8px;color:#1d4ed8;font-size:12px;font-weight:650}h3{font-size:19px;margin:0 0 12px}.details-text{white-space:pre-wrap;line-height:1.85;font-size:14px;margin:0}.relations-title{font-size:12px;color:#475569;margin:20px 0 6px}.relations{font-size:13px;line-height:1.7;padding-left:18px;margin:0}.relations li{margin:5px 0}.no-script{color:#92400e}.diagram-toolbar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.diagram-toolbar .help{margin:0;flex:1;min-width:180px}.diagram-reset{padding:9px 16px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#0f172a;cursor:pointer}.diagram-reset:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
  @media(max-width:1100px){.diagram-layout{grid-template-columns:minmax(0,1fr)}.details-panel{padding:18px}.diagram-scroll{max-height:55vh}}@media(max-width:640px){.wrap{padding:12px}h2{font-size:20px}.diagram-horizontal{display:none}.diagram-vertical{display:block}.diagram-layout{gap:12px}.help{margin-bottom:12px}.diagram-scroll{max-height:52vh}.diagram-canvas{min-width:0}.details-panel{padding:16px}}
</style>
</head>
<body>
<div class="wrap" data-diagram="v1">
  <h2>${diagramEsc(cfg.title)}</h2>
  ${cfg.description ? `<p class="desc">${diagramEsc(cfg.description)}</p>` : ''}
  <div class="diagram-toolbar"><p class="help">点击节点查看说明，再次点击收起。Tab 定位，Enter / 空格展开或收起；方向键切换可见节点，Home / End 跳到首末节点，Esc 收起。${cfg.steps ? '下一步逐段展开，重置返回第一步。' : '重置恢复全部收起。'}${cfg.layout ? '小屏幕可在图内横向滚动对照各栏。' : ''}</p><button type="button" id="diagram-reset" data-diagram-reset class="diagram-reset" aria-label="重置流程图">重置</button></div>
  ${cfg.steps ? '<section class="diagram-sequence" data-diagram-sequence aria-label="分步演示"><div class="sequence-controls"><button type="button" data-diagram-previous>上一步</button><strong id="diagram-sequence-title" aria-live="polite"></strong><button type="button" data-diagram-next>下一步</button></div><p id="diagram-sequence-description" class="sequence-description"></p></section>' : ''}
  <div class="diagram-layout">${renderView(false)}${renderView(true)}
  <aside id="diagram-details" data-diagram-details data-state="collapsed" data-selected-node="" class="details-panel" aria-labelledby="diagram-detail-title" aria-live="polite" aria-atomic="true">
    <p id="diagram-step-count" class="step-count">未选择步骤 · 共 ${cfg.nodes.length} 步</p>
    <h3 id="diagram-detail-title">步骤说明</h3>
    <p id="diagram-detail-text" class="details-text">点击任一步骤展开完整说明，再次点击可收起。</p>
    <p class="relations-title">关联步骤</p><ul id="diagram-relations" class="relations"></ul>
  </aside></div><noscript><p class="no-script">需要启用 JavaScript 才能切换节点说明；此交互不需要联网。</p></noscript>
</div>
<script type="application/json" id="widget-config">${configJson}</script>
<script>
(function(){
  'use strict';
  var cfg=JSON.parse(document.getElementById('widget-config').textContent),buttons=Array.from(document.querySelectorAll('[data-node-index]')),edges=Array.from(document.querySelectorAll('.diagram-edge')),selected=-1,stepIndex=0,visibleIds=new Set(cfg.nodes.map(function(node){return node.id;}));
  var nodesById=new Map(cfg.nodes.map(function(node){return [node.id,node];}));
  function select(index){
    if(!Number.isInteger(index)||index< -1||index>=cfg.nodes.length||(index>=0&&!visibleIds.has(cfg.nodes[index].id)))return;
    selected=index;var node=cfg.nodes[index];
    buttons.forEach(function(button){var active=Number(button.dataset.nodeIndex)===index;button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-expanded',String(active));button.querySelector('.node-hint').textContent=active?'再次点击收起':'查看说明';});
    edges.forEach(function(edge){edge.classList.toggle('is-related',Number(edge.dataset.from)===index||Number(edge.dataset.to)===index);});
    var panel=document.getElementById('diagram-details'),list=document.getElementById('diagram-relations');list.replaceChildren();panel.dataset.state=node?'expanded':'collapsed';panel.dataset.selectedNode=node?node.id:'';
    if(!node){document.getElementById('diagram-step-count').textContent='未选择步骤 · 共 '+cfg.nodes.length+' 步';document.getElementById('diagram-detail-title').textContent='步骤说明';document.getElementById('diagram-detail-text').textContent='点击任一步骤展开完整说明，再次点击可收起。';return;}
    document.getElementById('diagram-step-count').textContent='步骤 '+(index+1)+' / '+cfg.nodes.length;
    document.getElementById('diagram-detail-title').textContent=node.label;
    document.getElementById('diagram-detail-text').textContent=node.details||'此步骤暂无补充说明。';
    
    cfg.edges.forEach(function(edge){
      if(!visibleIds.has(edge.from)||!visibleIds.has(edge.to))return;
      if(edge.from!==node.id&&edge.to!==node.id)return;
      var next=edge.from===node.id,other=nodesById.get(next?edge.to:edge.from),item=document.createElement('li');
      item.textContent=(next?'指向：':'来自：')+other.label+(edge.label?' — '+edge.label:'');list.appendChild(item);
    });
    if(!list.children.length){var item=document.createElement('li');item.textContent='此节点没有连线。';list.appendChild(item);}
  }
  buttons.forEach(function(button){
    button.addEventListener('click',function(){var index=Number(button.dataset.nodeIndex);select(index===selected?-1:index);});
    button.addEventListener('keydown',function(event){
      var available=cfg.nodes.map(function(node,i){return visibleIds.has(node.id)?i:-1;}).filter(function(i){return i>=0;}),index=available.indexOf(Number(button.dataset.nodeIndex)),next;
      if(event.key==='ArrowRight'||event.key==='ArrowDown')next=Math.min(available.length-1,index+1);
      else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=Math.max(0,index-1);
      else if(event.key==='Home')next=0;else if(event.key==='End')next=available.length-1;else return;
      event.preventDefault();next=available[next];select(next);
      var target=button.closest('.diagram-view').querySelector('[data-node-index="'+next+'"]');target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
    });
  });
  window.addEventListener('resize',function(){
    var active=document.activeElement;
    if(active&&active.matches('[data-node-index]')&&!active.getClientRects().length){var target=buttons.find(function(button){return button.dataset.nodeIndex===active.dataset.nodeIndex&&button.getClientRects().length;});if(target)target.focus({preventScroll:true});}
  });
  function showStep(index,inspect){
    if(!cfg.steps)return;
    stepIndex=Math.max(0,Math.min(cfg.steps.length-1,index));var step=cfg.steps[stepIndex];
    visibleIds=new Set(cfg.steps.slice(0,stepIndex+1).flatMap(function(item){return item.nodeIds;}));
    buttons.forEach(function(button){var id=cfg.nodes[Number(button.dataset.nodeIndex)].id,visible=visibleIds.has(id);button.hidden=!visible;button.disabled=!visible;button.classList.toggle('is-new',step.nodeIds.includes(id));});
    edges.forEach(function(edge){edge.classList.toggle('is-hidden',!visibleIds.has(cfg.nodes[Number(edge.dataset.from)].id)||!visibleIds.has(cfg.nodes[Number(edge.dataset.to)].id));});
    document.querySelector('[data-diagram-sequence]').dataset.stepIndex=String(stepIndex);
    document.getElementById('diagram-sequence-title').textContent=(stepIndex+1)+' / '+cfg.steps.length+' · '+step.title;
    document.getElementById('diagram-sequence-description').textContent=step.description||'';
    document.querySelector('[data-diagram-previous]').disabled=stepIndex===0;document.querySelector('[data-diagram-next]').disabled=stepIndex===cfg.steps.length-1;
    select(-1);
    if(inspect){var first=cfg.nodes.findIndex(function(node){return node.id===step.nodeIds[0];});select(first);var target=buttons.find(function(button){return Number(button.dataset.nodeIndex)===first&&button.getClientRects().length;});if(target)target.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  document.querySelector('[data-diagram-next]')?.addEventListener('click',function(){showStep(stepIndex+1,true);});
  document.querySelector('[data-diagram-previous]')?.addEventListener('click',function(){showStep(stepIndex-1,true);});
  document.getElementById('diagram-reset').addEventListener('click',function(){showStep(0,false);select(-1);document.querySelectorAll('.diagram-scroll').forEach(function(view){view.scrollTop=0;view.scrollLeft=0;});});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();select(-1);}});
  showStep(0,false);select(-1);
})();
</script>
</body>
</html>`;
}

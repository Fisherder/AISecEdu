import { normalizeElement, type PPTElement, type SlideBackground } from '@openmaic/dsl';
import katex from 'katex';
import type { CoursewarePage, CoursewareSlideData, CoursewareTheme } from './schema';

export const COURSEWARE_VIEWPORT = { width: 1000, height: 562.5 };
type Box = { left: number; top: number; width: number; height: number };
const textUnits = (value: string) => [...value].reduce((total, character) => total + (
  character.codePointAt(0)! > 255 ? 1.08 : /[MW@]/.test(character) ? 1 : /[A-Z]/.test(character) ? 0.8 : /\s/.test(character) ? 0.4 : 0.66
), 0);
export function coursewareComparisonLayout(visual: Extract<CoursewarePage['visual'], { kind: 'comparison' }>, bounds: Box) {
  const height = (value: string, size: number, width: number) => Math.ceil(value.split('\n').reduce(
    (lines, line) => lines + Math.max(1, Math.ceil(textUnits(line) * size / Math.max(1, width - 6))), 0,
  ) * size * 1.2);
  const candidates = [];
  for (let labelWidth = 120; labelWidth <= Math.min(360, bounds.width * 0.4); labelWidth += 8) {
    const columnWidth = (bounds.width - labelWidth) / visual.columns.length;
    const headerHeight = Math.max(44, ...visual.columns.map(column => height(column, 23, columnWidth - 12) + 12));
    const rowHeights = visual.rows.map(row => Math.max(42, height(row.label, 18, labelWidth - 12) + 12,
      ...row.values.map(value => height(value, 19, columnWidth - 12) + 12)));
    candidates.push({ labelWidth, columnWidth, headerHeight, rowHeights, totalHeight: headerHeight + 8 + rowHeights.reduce((sum, value) => sum + value, 0) });
  }
  const result = candidates.sort((a, b) => a.totalHeight - b.totalHeight || a.labelWidth - b.labelWidth)[0];
  if (!result || result.totalHeight > bounds.height + 1)
    throw Error('Comparison content needs more readable space; expand the visual region or reflow the table without dropping facts');
  return result;
}
const intersects = (a: Box, b: Box, gap = 4) =>
  Math.min(a.left + a.width + gap, b.left + b.width + gap) > Math.max(a.left, b.left) &&
  Math.min(a.top + a.height + gap, b.top + b.height + gap) > Math.max(a.top, b.top);

export function placeCoursewareEdgeLabel(
  start: [number, number],
  end: [number, number],
  label: string,
  bounds: Box,
  occupied: Box[],
): Box {
  const units = [...label].reduce(
    (total, character) => total + (/[\u2e80-\u9fff\uff00-\uffef]/.test(character) ? 16 : 9),
    0,
  );
  const width = Math.min(164, Math.max(60, units + 24));
  const height = Math.max(32, Math.ceil(units / (width - 20)) * 20 + 12);
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    length = Math.hypot(dx, dy) || 1;
  for (const offset of [-25, 25, -48, 48, -72, 72])
    for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const candidate = {
        left: start[0] + dx * fraction - (dy / length) * offset - width / 2,
        top: start[1] + dy * fraction + (dx / length) * offset - height / 2,
        width,
        height,
      };
      if (
        candidate.left < bounds.left ||
        candidate.top < bounds.top ||
        candidate.left + width > bounds.left + bounds.width ||
        candidate.top + height > bounds.top + bounds.height
      )
        continue;
      if (!occupied.some((box) => intersects(candidate, box))) return candidate;
    }
  throw new Error(
    `No readable space for edge label "${label}"; separate the connected nodes or expand the visual region`,
  );
}
export type CoursewareHotspot = Box & { id: string; label: string; detail: string };
export type CoursewareCompiledSlide = {
  elements: PPTElement[];
  background: SlideBackground;
  hotspots: CoursewareHotspot[];
  textBoxes: Array<Box & { id: string; text: string; fontSize: number }>;
  visualBounds: Box;
};

export function coursewareText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function visualBounds(page: CoursewarePage): Box {
  if (page.layout) return page.layout.visual;
  return page.composition === 'split'
    ? { left: 350, top: 156, width: 600, height: 318 }
    : page.composition === 'editorial'
      ? { left: 52, top: 165, width: 662, height: 300 }
      : { left: 52, top: 150, width: 896, height: 325 };
}

export function diagramStateAt(page: CoursewarePage, beatIndex: number) {
  if (page.visual.kind !== 'diagram') return [];
  const nodes = page.visual.nodes.map((node) => ({ ...node, visible: true }));
  for (const beat of page.beats.slice(0, Math.max(0, beatIndex + 1))) {
    for (const state of beat.nodeStates)
      Object.assign(nodes.find((node) => node.id === state.id)!, state);
  }
  return nodes;
}

export function sceneStateAt(page: CoursewarePage, beatIndex: number) {
  if (page.visual.kind !== 'scene') return [];
  const objects = page.visual.objects.map((object) => ({ ...object, box: { ...object.box } }));
  for (const beat of page.beats.slice(0, Math.max(0, beatIndex + 1))) {
    for (const state of beat.objectStates) {
      const object = objects.find((object) => object.id === state.id)!;
      const { left, top, id: _, ...properties } = state;
      Object.assign(object, properties);
      if (left !== undefined) object.box.left = left;
      if (top !== undefined) object.box.top = top;
    }
  }
  return objects;
}

function contrast(colorA: string, colorB: string) {
  const luminance = (color: string) => {
    const channels = [1, 3, 5]
      .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(colorA),
    b = luminance(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function coursewareThemeIssues(theme: CoursewareTheme): string[] {
  const issues: string[] = [];
  if (contrast(theme.foreground, theme.background) < 7)
    issues.push('Body text needs at least 7:1 contrast with the canvas');
  if (contrast(theme.muted, theme.background) < 4.5)
    issues.push('Secondary text needs at least 4.5:1 contrast with the canvas');
  if (contrast(theme.foreground, theme.surface) < 4.5)
    issues.push('Diagram labels need at least 4.5:1 contrast with their surface');
  if (contrast(theme.accent, theme.background) < 3)
    issues.push('The primary visual accent needs at least 3:1 contrast');
  return issues;
}

export function compileCoursewareSlide(
  data: CoursewareSlideData,
  beatIndex = -1,
): CoursewareCompiledSlide {
  const { page, theme, assets } = data;
  const elements: PPTElement[] = [];
  const textBoxes: CoursewareCompiledSlide['textBoxes'] = [];
  const hotspots: CoursewareHotspot[] = [];
  const bounds = visualBounds(page);
  const beat = page.beats[Math.min(beatIndex, page.beats.length - 1)];
  const add = (value: Record<string, unknown>) =>
    elements.push(normalizeElement({ rotate: 0, ...value }));
  const text = (
    id: string,
    value: string,
    box: Box,
    size = 20,
    color = theme.foreground,
    weight = 400,
    align = 'left',
    font = 'Noto Sans SC',
  ) => {
    textBoxes.push({ id, text: value, ...box, fontSize: size });
    add({
      id,
      type: 'text',
      ...box,
      defaultFontName: font,
      defaultColor: color,
      lineHeight: 1.2,
      content: `<p style="font-family:${font === 'JetBrains Mono' ? "'JetBrains Mono',Consolas,Menlo,monospace" : "'Noto Sans SC','Microsoft YaHei',sans-serif"};font-size:${size}px;font-weight:${weight};color:${color};line-height:1.2;text-align:${align};white-space:pre-wrap;overflow-wrap:anywhere">${coursewareText(value)}</p>`,
    });
  };
  const shape = (id: string, box: Box, fill: string, path = 'M0 0H1V1H0Z', outline?: string) =>
    add({
      id,
      type: 'shape',
      ...box,
      viewBox: [1, 1],
      path,
      fill,
      fixedRatio: false,
      ...(outline ? { outline: { color: outline, width: 2, style: 'solid' } } : {}),
    });
  const line = (
    id: string,
    from: [number, number],
    to: [number, number],
    color: string,
    arrow = false,
    width = 2,
  ) =>
    add({
      id,
      type: 'line',
      left: from[0],
      top: from[1],
      width,
      start: [0, 0],
      end: [to[0] - from[0], to[1] - from[1]],
      style: 'solid',
      color,
      points: ['', arrow ? 'arrow' : ''],
    });

  if (page.layout) {
    const { title, takeaway, supporting } = page.layout;
    text('page-title', page.title, title.box, title.fontSize, theme.foreground, 750, title.align);
    text(
      'page-promise',
      page.takeaway,
      takeaway.box,
      takeaway.fontSize,
      theme.foreground,
      600,
      takeaway.align,
    );
    supporting.forEach((region, index) =>
      text(
        `support-${index}`,
        page.supporting[index],
        region.box,
        region.fontSize,
        theme.muted,
        400,
        region.align,
      ),
    );
  } else {
    text(
      'page-title',
      page.title,
      { left: 48, top: 34, width: 900, height: 100 },
      38,
      theme.foreground,
      750,
    );
    if (page.composition === 'split') {
      text(
        'page-promise',
        page.takeaway,
        { left: 48, top: 171, width: 268, height: 153 },
        27,
        theme.foreground,
        650,
      );
      page.supporting.forEach((value, i) =>
        text(
          `support-${i}`,
          value,
          { left: 48, top: 339 + i * 51, width: 268, height: 50 },
          18,
          theme.muted,
        ),
      );
    } else if (page.composition === 'editorial') {
      text(
        'page-promise',
        page.takeaway,
        { left: 740, top: 190, width: 210, height: 163 },
        24,
        theme.foreground,
        650,
      );
      page.supporting.forEach((value, i) =>
        text(
          `support-${i}`,
          value,
          { left: 740, top: 342 + i * 60, width: 210, height: 60 },
          18,
          theme.muted,
        ),
      );
    } else {
      text(
        'page-promise',
        page.takeaway,
        { left: 50, top: 494, width: 898, height: 53 },
        21,
        theme.muted,
        500,
      );
      if (page.supporting.length)
        throw new Error(
          'A full-width page with supporting copy requires a custom layout; never discard supplied content',
        );
    }
  }

  const visual = page.visual;
  if (visual.kind === 'scene') {
    const paint = (value: string) =>
      value === 'none' ? '' : value.startsWith('#') ? value : theme[value as keyof CoursewareTheme];
    for (const object of sceneStateAt(page, beatIndex)) {
      if (!object.visible || object.opacity === 0) continue;
      const box = {
        ...object.box,
        left: bounds.left + object.box.left,
        top: bounds.top + object.box.top,
      };
      if (
        object.box.left + box.width > bounds.width + 1 ||
        object.box.top + box.height > bounds.height + 1
      )
        throw new Error(
          `Scene object ${object.id} exceeds the ${bounds.width}×${bounds.height}px visual region; recompose the complete object inside it`,
        );
      if (object.kind === 'text') {
        if (object.fill === 'none') throw new Error(`Scene text ${object.id} must be visible`);
        text(
          `scene-${object.id}`,
          object.text!,
          box,
          object.fontSize,
          paint(object.fill),
          object.weight === 'bold' ? 700 : 400,
          object.align,
          object.font === 'mono' ? 'JetBrains Mono' : 'Noto Sans SC',
        );
        (elements[elements.length - 1] as { opacity?: number }).opacity = object.opacity;
      } else {
        const path =
          object.kind === 'ellipse'
            ? 'M1 .5A.5 .5 0 1 1 0 .5A.5 .5 0 1 1 1 .5Z'
            : object.kind === 'path'
              ? object.path!
              : 'M0 0H1V1H0Z';
        add({
          id: `scene-${object.id}`,
          type: 'shape',
          ...box,
          viewBox: [1, 1],
          path,
          fixedRatio: false,
          fill: paint(object.fill),
          opacity: object.opacity,
          ...(object.gradient
            ? {
                gradient: {
                  type: object.gradient.type,
                  rotate: object.gradient.rotate,
                  colors: [
                    { pos: 0, color: object.gradient.from },
                    { pos: 100, color: object.gradient.to },
                  ],
                },
              }
            : {}),
          ...((object.stroke && object.stroke !== 'none') || beat?.focusIds.includes(object.id)
            ? {
                outline: {
                  color: beat?.focusIds.includes(object.id) ? theme.accent : paint(object.stroke!),
                  width: beat?.focusIds.includes(object.id)
                    ? Math.max(3, object.strokeWidth)
                    : object.strokeWidth,
                  style: 'solid',
                },
              }
            : {}),
        });
      }
      if (object.detail)
        hotspots.push({ id: object.id, label: object.label, detail: object.detail, ...box });
    }
  } else if (visual.kind === 'chart') {
    let series = visual.series.map((series) => [...series.values]);
    for (const frame of page.beats.slice(0, Math.max(0, beatIndex + 1)))
      if (frame.chartValues) series = frame.chartValues.map((values) => [...values]);
    add({
      id: 'evidence-chart',
      type: 'chart',
      ...bounds,
      top: bounds.top + 28,
      height: bounds.height - 28,
      chartType: visual.chartType,
      data: { labels: visual.labels, legends: visual.series.map((series) => series.name), series },
      options: { lineSmooth: false },
      themeColors: [theme.accent, theme.secondary, theme.muted],
      textColor: theme.foreground,
      lineColor: theme.surface,
    });
    text(
      'chart-unit',
      visual.unit + (visual.illustrative ? ' · 教学示例数据' : ''),
      { left: bounds.left, top: bounds.top, width: bounds.width, height: 28 },
      16,
      theme.muted,
    );
  } else if (visual.kind === 'diagram') {
    const nodes = diagramStateAt(page, beatIndex);
    const dimensions = new Map(visual.nodes.map(node => {
      const fraction = node.form === 'diamond' ? 0.48 : node.form === 'circle' ? 0.76 : 0.88;
      const values = [node.value || '', ...page.beats.flatMap(step => step.nodeStates.filter(state => state.id === node.id && state.value !== undefined).map(state => state.value!))];
      const widest = Math.max(textUnits(node.label), ...values.map(textUnits));
      const width = Math.min(320, bounds.width, Math.max(bounds.width < 700 ? 116 : 136, Math.ceil((widest * 18 + 16) / fraction)));
      const textWidth = width * fraction;
      const heightFor = (value: string) => Math.max(1, value.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(textUnits(line) * 18 / textWidth)), 0)) * 24;
      const labelHeight = heightFor(node.label);
      const valueHeight = values.some(Boolean) ? Math.max(...values.map(heightFor)) : 0;
      const height = Math.max(92, labelHeight + valueHeight + (valueHeight ? 44 : 32));
      if (height > bounds.height) throw Error(`Diagram node ${node.id} needs ${height}px height; expand its visual region`);
      return [node.id, { width, height, textWidth, labelHeight, valueHeight }] as const;
    }));
    const boxes = new Map(
      nodes.map(node => {
        const { width, height } = dimensions.get(node.id)!;
        return [node.id, { left: bounds.left + node.x * (bounds.width - width), top: bounds.top + node.y * (bounds.height - height), width, height }];
      }),
    );
    const occupied = nodes.filter((node) => node.visible).map((node) => boxes.get(node.id)!);
    for (const edge of visual.edges) {
      const a = boxes.get(edge.from)!,
        b = boxes.get(edge.to)!;
      if (
        !nodes.find((node) => node.id === edge.from)?.visible ||
        !nodes.find((node) => node.id === edge.to)?.visible
      )
        continue;
      const dx = b.left - a.left,
        dy = b.top - a.top;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const start: [number, number] = horizontal
        ? [a.left + (dx >= 0 ? a.width : 0), a.top + a.height / 2]
        : [a.left + a.width / 2, a.top + (dy >= 0 ? a.height : 0)];
      const end: [number, number] = horizontal
        ? [b.left + (dx >= 0 ? 0 : b.width), b.top + b.height / 2]
        : [b.left + b.width / 2, b.top + (dy >= 0 ? 0 : b.height)];
      const active = beat?.activeEdgeIds.includes(edge.id);
      line(edge.id, start, end, active ? theme.accent : theme.muted, true, active ? 4 : 2);
      if (edge.label) {
        const labelBox = placeCoursewareEdgeLabel(start, end, edge.label, bounds, occupied);
        occupied.push(labelBox);
        text(`edge-label-${edge.id}`, edge.label, labelBox, 16, theme.muted, 500, 'center');
      }
    }
    for (const node of nodes.filter((node) => node.visible)) {
      const box = boxes.get(node.id)!;
      const dimensionsForNode = dimensions.get(node.id)!;
      const active = beat?.focusIds.includes(node.id);
      const path =
        node.form === 'circle'
          ? 'M1 .5A.5 .5 0 1 1 0 .5A.5 .5 0 1 1 1 .5Z'
          : node.form === 'diamond'
            ? 'M.5 0L1 .5L.5 1L0 .5Z'
            : node.form === 'cylinder'
              ? 'M0 .12C0 -.04 1 -.04 1 .12V.88C1 1.04 0 1.04 0 .88Z M0 .12C0 .28 1 .28 1 .12'
              : 'M.06 0H.94Q1 0 1 .1V.9Q1 1 .94 1H.06Q0 1 0 .9V.1Q0 0 .06 0Z';
      shape(`node-${node.id}`, box, theme.surface, path, active ? theme.accent : theme.muted);
      text(
        `node-label-${node.id}`,
        node.label,
        {
          left: box.left + (box.width - dimensionsForNode.textWidth) / 2,
          top: box.top + (dimensionsForNode.valueHeight ? 18 : (box.height - dimensionsForNode.labelHeight) / 2),
          width: dimensionsForNode.textWidth,
          height: dimensionsForNode.labelHeight,
        },
        18,
        theme.foreground,
        650,
        'center',
      );
      if (node.value)
        text(
          `node-value-${node.id}`,
          node.value,
          {
            left: box.left + (box.width - dimensionsForNode.textWidth) / 2,
            top: box.top + 30 + dimensionsForNode.labelHeight,
            width: dimensionsForNode.textWidth,
            height: dimensionsForNode.valueHeight,
          },
          18,
          theme.foreground,
          500,
          'center',
        );
      hotspots.push({ id: node.id, label: node.label, detail: node.detail, ...box });
    }
  } else if (visual.kind === 'comparison') {
    const { labelWidth, columnWidth: width, headerHeight, rowHeights } = coursewareComparisonLayout(visual, bounds);
    visual.columns.forEach((column, i) =>
      text(
        `column-${i}`,
        column,
        {
          left: bounds.left + labelWidth + i * width,
          top: bounds.top,
          width: width - 12,
          height: headerHeight - 6,
        },
        23,
        theme.foreground,
        700,
      ),
    );
    line(
      'table-header-rule',
      [bounds.left, bounds.top + headerHeight],
      [bounds.left + bounds.width, bounds.top + headerHeight],
      theme.accent,
      false,
      3,
    );
    visual.rows.forEach((row, index) => {
      const rowHeight = rowHeights[index];
      const top = bounds.top + headerHeight + 8 + rowHeights.slice(0, index).reduce((sum, value) => sum + value, 0);
      if (beat?.comparisonRowIndexes.includes(index))
        shape(`comparison-focus-${index}`, { left: bounds.left, top, width: bounds.width, height: rowHeight - 2 }, theme.surface);
      text(
        `criterion-${index}`,
        row.label,
        { left: bounds.left, top, width: labelWidth - 12, height: rowHeight - 3 },
        18,
        theme.muted,
        650,
      );
      row.values.forEach((value, i) =>
        text(
          `comparison-${index}-${i}`,
          value,
          {
            left: bounds.left + labelWidth + i * width,
            top,
            width: width - 12,
            height: rowHeight - 3,
          },
          19,
        ),
      );
      if (index < visual.rows.length - 1)
        line(
          `row-rule-${index}`,
          [bounds.left, top + rowHeight - 2],
          [bounds.left + bounds.width, top + rowHeight - 2],
          theme.surface,
        );
    });
  } else if (visual.kind === 'code') {
    const lineHeight = Math.min(25, bounds.height / visual.lines.length);
    visual.lines.forEach((value, index) => {
      const top = bounds.top + index * lineHeight;
      if (beat?.codeLines.includes(index + 1))
        shape(
          `code-highlight-${index}`,
          { left: bounds.left, top, width: bounds.width, height: lineHeight },
          theme.surface,
        );
      text(
        `line-number-${index}`,
        String(index + 1).padStart(2, '0'),
        { left: bounds.left, top: top - 3, width: 49, height: lineHeight + 8 },
        16,
        theme.muted,
      );
      text(
        `code-${index}`,
        value,
        { left: bounds.left + 50, top: top - 3, width: bounds.width - 50, height: lineHeight + 8 },
        18,
        theme.foreground,
        beat?.codeLines.includes(index + 1) ? 750 : 400,
        'left',
        'JetBrains Mono',
      );
    });
  } else if (visual.kind === 'equation') {
    const equation = { expression: visual.expression, example: visual.example };
    for (const frame of page.beats.slice(0, Math.max(0, beatIndex + 1)))
      if (frame.equationState) Object.assign(equation, frame.equationState);
    add({
      id: 'main-equation',
      type: 'latex',
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: 105,
      latex: equation.expression,
      html:
        '<div style="font-size:32px">' +
        katex.renderToString(equation.expression, {
          throwOnError: true,
          displayMode: true,
          trust: false,
        }) +
        '</div>',
      color: theme.foreground,
    });
    visual.terms.forEach((term, index) => {
      const top = bounds.top + 120 + index * 33;
      if (beat?.termFocusIndexes.includes(index))
        shape(`term-focus-${index}`, { left: bounds.left, top, width: bounds.width, height: 33 }, theme.surface);
      text(
        `symbol-${index}`,
        term.symbol,
        { left: bounds.left + 26, top, width: 120, height: 35 },
        20,
        theme.foreground,
        700,
      );
      text(
        `term-${index}`,
        term.meaning,
        { left: bounds.left + 160, top, width: bounds.width - 175, height: 35 },
        19,
        theme.muted,
      );
    });
    text(
      'equation-example',
      equation.example,
      { left: bounds.left, top: bounds.top + bounds.height - 38, width: bounds.width, height: 42 },
      19,
      theme.foreground,
      600,
    );
  } else {
    const asset = assets.find((asset) => asset.id === visual.assetId);
    if (!asset) throw new Error(`Verified image asset not found: ${visual.assetId}`);
    if (
      !/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(asset.src) &&
      !/^\/(?!\/)[a-zA-Z0-9_/.%-]+$/.test(asset.src)
    )
      throw new Error(
        'Image assets must be embedded or locally served, never invented remote URLs',
      );
    const scale = Math.min(bounds.width / asset.width, bounds.height / asset.height);
    const width = asset.width * scale,
      height = asset.height * scale;
    const box = {
      left: bounds.left + (bounds.width - width) / 2,
      top: bounds.top + (bounds.height - height) / 2,
      width,
      height,
    };
    add({
      id: 'verified-image',
      type: 'image',
      ...box,
      src: asset.src,
      fixedRatio: true,
      name: visual.alt,
    });
    visual.annotations.forEach((annotation, index) => {
      // Explicit annotation timelines start empty and replay cumulatively from the source.
      if (page.beats.some(frame => frame.imageAnnotationIndexes !== undefined)) {
        const active = new Set(page.beats.slice(0, Math.max(0, beatIndex + 1)).flatMap(frame => frame.imageAnnotationIndexes || []));
        if (!active.has(index)) return;
      }
      shape(
        `image-label-backdrop-${index}`,
        {
          left: box.left + annotation.x * (box.width - 140),
          top: box.top + annotation.y * (box.height - 40),
          width: 140,
          height: 40,
        },
        theme.surface,
      );
      text(
        `image-label-${index}`,
        annotation.label,
        {
          left: box.left + annotation.x * (box.width - 140),
          top: box.top + annotation.y * (box.height - 40),
          width: 140,
          height: 40,
        },
        19,
        theme.foreground,
        650,
      );
    });
  }
  return {
    elements,
    background: { type: 'solid', color: theme.background },
    hotspots,
    textBoxes,
    visualBounds: bounds,
  };
}

export function coursewareTextFitIssue(box: Box & { id: string; text: string; fontSize: number }): string | null {
  const capacity = Math.max(1, box.width / box.fontSize);
  const lines = box.text.split('\n').reduce((total, line) => {
    const units = [...line].reduce((count, character) => count + (/[\u2e80-\u9fff\uff00-\uffef]/.test(character) ? 1 : 0.57), 0);
    return total + Math.max(1, Math.ceil(units / capacity));
  }, 0);
  const requiredHeight = Math.ceil(lines * box.fontSize * 1.2);
  if (requiredHeight <= box.height + 1) return null;
  return `${box.id} does not fit at readable size: ${box.width}×${box.height}px at ${box.fontSize}px needs at least ${requiredHeight}px height (${lines} lines). Reallocate space or recompose neighboring regions; preserve required facts and readable type.`;
}

export function inspectCoursewareDraftText(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !('schema' in value) || value.schema !== 'courseware-page-v2') return [];
  const page = value as Record<string, any>;
  const issues: string[] = [];
  const inspect = (id: string, text: unknown, region: any) => {
    if (typeof text !== 'string' || !Number.isFinite(region?.fontSize) || region.fontSize <= 0 || !region.box || !['left', 'top', 'width', 'height'].every(key => Number.isFinite(region.box[key])) || region.box.width <= 0) return;
    const issue = coursewareTextFitIssue({ id, text, fontSize: region.fontSize, ...region.box });
    if (issue) issues.push(issue);
  };
  inspect('page-title', page.title, page.layout?.title);
  inspect('page-promise', page.takeaway, page.layout?.takeaway);
  if (Array.isArray(page.supporting)) page.supporting.forEach((text: unknown, index: number) => inspect(`support-${index}`, text, page.layout?.supporting?.[index]));
  if (page.visual?.kind === 'scene' && Array.isArray(page.visual.objects)) {
    for (const object of page.visual.objects) {
      if (object?.kind !== 'text') continue;
      inspect(`scene-${object.id}`, object.text, object);
      if (Array.isArray(page.beats)) for (const beat of page.beats) {
        if (!Array.isArray(beat?.objectStates)) continue;
        for (const state of beat.objectStates) if (state?.id === object.id && typeof state.text === 'string') inspect(`scene-${object.id}`, state.text, object);
      }
    }
  }
  return [...new Set(issues)];
}

export function inspectCoursewareSlide(data: CoursewareSlideData): string[] {
  const issues = coursewareThemeIssues(data.theme);
  for (let frame = -1; frame < data.page.beats.length; frame++) {
    let slide: CoursewareCompiledSlide;
    try {
      slide = compileCoursewareSlide(data, frame);
    } catch (error) {
      issues.push(`frame ${frame}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const box of slide.textBoxes) {
      if (
        box.left < 0 ||
        box.top < 0 ||
        box.left + box.width > 1000.5 ||
        box.top + box.height > 563
      )
        issues.push(`frame ${frame}: ${box.id} is outside the slide`);
      const fitIssue = coursewareTextFitIssue(box);
      if (fitIssue) issues.push(`frame ${frame}: ${fitIssue}`);
    }
    for (let i = 0; data.page.visual.kind === 'diagram' && i < slide.hotspots.length; i++)
      for (const other of slide.hotspots.slice(i + 1)) {
        const box = slide.hotspots[i];
        if (
          Math.min(box.left + box.width, other.left + other.width) -
            Math.max(box.left, other.left) >
            2 &&
          Math.min(box.top + box.height, other.top + other.height) - Math.max(box.top, other.top) >
            2
        )
          issues.push(`frame ${frame}: diagram nodes ${box.id} and ${other.id} overlap`);
      }
  }
  return [...new Set(issues)];
}

export function evaluateCoursewareCheck(page: CoursewarePage, optionId: string) {
  const option = page.check?.options.find((option) => option.id === optionId);
  if (!option || !page.check) return null;
  return { correct: option.id === page.check.correctOptionId, feedback: option.feedback };
}

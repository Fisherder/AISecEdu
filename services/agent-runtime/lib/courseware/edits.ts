import type { PPTElement, SlideBackground } from '@openmaic/dsl';
import { isEqual } from 'lodash';
import { compileCoursewareSlide, type CoursewareCompiledSlide } from './compiler';
import type { CoursewareSlideData } from './schema';

/** Native-editor changes remain visible during playback; movement edits are deltas, not frozen animation positions. */
export function applyCoursewareCanvasEdits(
  data: CoursewareSlideData,
  current: CoursewareCompiledSlide,
  edited?: { elements: PPTElement[]; background?: SlideBackground },
): CoursewareCompiledSlide {
  if (!edited) return current;
  const baseline = compileCoursewareSlide(data, data.page.beats.length - 1);
  if (
    isEqual(edited.elements, baseline.elements) &&
    (!edited.background || isEqual(edited.background, baseline.background))
  )
    return current;
  const base = new Map(baseline.elements.map((element) => [element.id, element]));
  const saved = new Map(edited.elements.map((element) => [element.id, element]));
  const patched = new Map<string, PPTElement>();
  for (const element of current.elements) {
    const before = base.get(element.id);
    const after = saved.get(element.id);
    if (!before) {
      patched.set(element.id, element);
      continue;
    }
    if (!after) continue;
    const next = structuredClone(element) as unknown as Record<string, unknown>;
    const a = before as unknown as Record<string, unknown>;
    const b = after as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (key === 'id' || isEqual(a[key], b[key])) continue;
      if (!(key in b)) delete next[key];
      else if (
        ['left', 'top'].includes(key) &&
        typeof a[key] === 'number' &&
        typeof b[key] === 'number' &&
        typeof next[key] === 'number'
      )
        next[key] = (next[key] as number) + (b[key] as number) - (a[key] as number);
      else next[key] = structuredClone(b[key]);
    }
    patched.set(element.id, next as unknown as PPTElement);
  }
  for (const element of edited.elements)
    if (!base.has(element.id)) patched.set(element.id, structuredClone(element));
  const order = edited.elements.map((element) => element.id);
  const transient = current.elements
    .filter((element) => !base.has(element.id))
    .map((element) => element.id);
  const elements = [...transient, ...order].flatMap((id) =>
    patched.has(id) ? [patched.get(id)!] : [],
  );
  const hotspots = current.hotspots.flatMap((hotspot) => {
    const prefix = data.page.visual.kind === 'scene' ? 'scene-' : 'node-';
    const existing = current.elements.find((element) => element.id === prefix + hotspot.id);
    const next = patched.get(prefix + hotspot.id);
    return existing && next
      ? [
          {
            ...hotspot,
            left: hotspot.left + next.left - existing.left,
            top: hotspot.top + next.top - existing.top,
            width: next.width,
            height: 'height' in next ? next.height : hotspot.height,
          },
        ]
      : [];
  });
  return { ...current, elements, hotspots, background: edited.background || current.background };
}

import { isEqual } from 'lodash';
import { compileCoursewareSlide } from './compiler';
import { coursewareSlideDataSchema, type CoursewareSlideData } from './schema';

export function reconcileOrdinarySlideCanvas(
  content: Record<string, unknown> | null,
  studio: CoursewareSlideData,
) {
  if (!content || (content.elements === undefined && content.background === undefined)) return studio;
  const baseline = compileCoursewareSlide(studio);
  if (content.background !== undefined && !isEqual(content.background, baseline.background)) return null;
  if (content.elements === undefined) return studio;
  // Slides saved before header centering legitimately have no vAlign on these elements.
  const matches = (elements: typeof baseline.elements) => isEqual(content.elements, elements) ||
    isEqual(content.elements, elements.map(element => {
      if (element.type !== 'text' || element.vAlign !== 'middle') return element;
      const legacy = { ...element };
      delete legacy.vAlign;
      return legacy;
    }));
  if (matches(baseline.elements)) return studio;

  const {layout} = studio.page;
  if (!layout || !Array.isArray(content.elements)) return null;
  const saved = new Map(content.elements.map(raw => {
    const element = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? raw as Record<string, unknown> : null;
    return [element?.id, element];
  }));
  const copyRegion = (id: string, region: typeof layout.title) => {
    const element = saved.get(id);
    return {...region, box: {
      left: element?.left, top: element?.top, width: element?.width, height: element?.height,
    }};
  };
  const candidate = coursewareSlideDataSchema.safeParse({
    ...studio,
    page: {...studio.page, layout: {
      ...layout,
      title: copyRegion('page-title', layout.title),
      takeaway: copyRegion('page-promise', layout.takeaway),
      supporting: layout.supporting.map((region, index) => copyRegion(`support-${index}`, region)),
    }},
  });
  return candidate.success && matches(compileCoursewareSlide(candidate.data).elements) ? candidate.data : null;
}

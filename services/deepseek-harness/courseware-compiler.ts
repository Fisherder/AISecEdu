import { compileCoursewareSlide } from '../agent-runtime/lib/courseware/compiler';
import { coursewareSlideDataSchema } from '../agent-runtime/lib/courseware/schema';

export function compileTeachingSlides(input: unknown) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 4) {
    throw new Error('Expected two to four native slides');
  }
  return input.map((source) => {
    const studio = coursewareSlideDataSchema.parse(source);
    const { visual, beats } = studio.page;
    if (studio.assets.length || (visual.kind !== 'scene' && (visual.kind !== 'comparison' || beats.length))) {
      throw new Error('Expected a declarative scene or static comparison with no external assets');
    }
    const { elements, background } = compileCoursewareSlide(studio, studio.page.beats.length - 1);
    if (!elements.length) throw new Error('No visible teaching objects');
    return { studio, elements, background };
  });
}

import { compileCoursewareSlide } from '../agent-runtime/lib/courseware/compiler';
import { coursewareSlideDataSchema } from '../agent-runtime/lib/courseware/schema';

export function compileTeachingSlides(input: unknown) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 4) {
    throw new Error('Expected two to four native slides');
  }
  return input.map((source) => {
    const studio = coursewareSlideDataSchema.parse(source);
    if (studio.page.visual.kind !== 'scene' || studio.assets.length) {
      throw new Error('This compiler only accepts declarative courseware scenes');
    }
    const { elements, background } = compileCoursewareSlide(studio, studio.page.beats.length - 1);
    if (!elements.length) throw new Error('No visible teaching objects');
    return { studio, elements, background };
  });
}

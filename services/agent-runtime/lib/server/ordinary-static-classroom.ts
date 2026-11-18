import sharp from 'sharp';
import { compileCoursewareSlide } from '@/lib/courseware/compiler';
import { reconcileOrdinarySlideCanvas } from '@/lib/courseware/saved-canvas';
import {
  COURSEWARE_MAX_PAGES,
  coursewareSlideDataSchema,
  type CoursewareAsset,
} from '@/lib/courseware/schema';
import { buildCompleteScene } from '@/lib/generation/scene-builder';
import type { Scene, Stage } from '@/lib/types/stage';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function publicText(value: string): boolean {
  return !/<\/?[a-z][^>]*>|(?:https?:|javascript:|data:|file:|(?:^|\s)www\.)|(?:^|\s)\/\//iu.test(value);
}

async function verifiedImage(asset: CoursewareAsset): Promise<CoursewareAsset> {
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(asset.src);
  if (!match) throw new Error('Expected an embedded raster image');
  const [, format, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Invalid raster encoding');
  const image = sharp(bytes, { limitInputPixels: 16_000_000 });
  const metadata = await image.metadata();
  if (metadata.format !== format || metadata.width !== asset.width ||
      metadata.height !== asset.height || (metadata.pages ?? 1) !== 1) {
    throw new Error('Raster format or dimensions do not match the saved image');
  }
  // Decode and encode only pixels. Saved metadata, attachments and trailing bytes do not reach students.
  const pixels = await image.toFormat(metadata.format).toBuffer();
  const src = `data:image/${format};base64,${pixels.toString('base64')}`;
  if (src.length > 3_000_000) throw new Error('Embedded raster exceeds the courseware limit');
  return { ...asset, src };
}

/** The authenticated caller supplies a platform-verified published lesson. */
export async function ordinaryStaticClassroom(
  lesson: unknown,
  classroomId: string,
): Promise<{ stage: Stage; scenes: Scene[] }> {
  const source = record(lesson);
  const title = typeof source?.title === 'string' ? source.title.trim() : '';
  if (!source || !title || title.length > 160 || !publicText(title) ||
      source.subjectProfile !== undefined || !Array.isArray(source.artifacts) ||
      source.artifacts.length < 1 || source.artifacts.length > COURSEWARE_MAX_PAGES) {
    throw new Error('Expected a non-empty ordinary published lesson');
  }
  const timestamp = typeof source.updatedAt === 'number' && Number.isSafeInteger(source.updatedAt) &&
    source.updatedAt >= 0 ? source.updatedAt : 0;
  const stage: Stage = { id: classroomId, name: title, createdAt: timestamp, updatedAt: timestamp };
  const pageIds = new Set<string>();
  const scenes: Scene[] = [];

  for (const [index, item] of source.artifacts.entries()) {
    const artifact = record(item);
    const content = record(artifact?.content);
    const parsed = coursewareSlideDataSchema.safeParse(content?.studio);
    if (artifact?.type !== 'slide' || !parsed.success) throw new Error('Expected native courseware slide');

    const { page, assets } = parsed.data;
    const visual = page.visual;
    if (pageIds.has(page.id) || page.beats.length !== 0 || page.check ||
        (visual.kind !== 'chart' && visual.kind !== 'comparison' && visual.kind !== 'image')) {
      throw new Error('Expected a unique static chart, comparison or image page');
    }
    pageIds.add(page.id);
    if (visual.kind === 'image' ? assets.length !== 1 || assets[0].id !== visual.assetId : assets.length !== 0) {
      throw new Error('Unexpected courseware assets');
    }
    const studio = reconcileOrdinarySlideCanvas(content, parsed.data);
    if (!studio) throw new Error('Saved canvas is not a verified courseware layout');
    const safeAssets = visual.kind === 'image' ? [await verifiedImage(assets[0])] : [];
    const compiled = compileCoursewareSlide({ ...studio, assets: safeAssets });
    if (!publicText(page.title) || compiled.textBoxes.some(({ text }) => !publicText(text)) ||
        (visual.kind === 'image' && !publicText(visual.alt)) ||
        (visual.kind === 'chart' && (
          visual.labels.some(label => !publicText(label)) ||
          visual.series.some(({ name }) => !publicText(name))
        ))) {
      throw new Error('Only plain public teaching text is allowed');
    }

    const scene = buildCompleteScene(
      { id: page.id, type: 'slide', title: page.title, description: '', keyPoints: [], order: index + 1 },
      { elements: compiled.elements, background: compiled.background },
      [],
      classroomId,
    );
    if (!scene || scene.content.type !== 'slide') throw new Error('Unable to build static scene');
    const id = `${classroomId}-${page.id}`;
    delete scene.actions;
    scene.id = id;
    scene.content.canvas.id = id;
    scene.createdAt = timestamp;
    scene.updatedAt = timestamp;
    scenes.push(scene);
  }
  return { stage, scenes };
}

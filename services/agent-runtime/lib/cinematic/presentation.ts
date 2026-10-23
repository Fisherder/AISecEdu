import { z } from 'zod';

export const cinematicPresentationSurfaces = ['overview', 'model-note', 'chapter-copy'] as const;
export const cinematicPresentationRequirementSchema = z
  .object({
    description: z.string().trim().min(1).max(180),
    surface: z.enum(cinematicPresentationSurfaces),
  })
  .strict();
export type CinematicPresentationRequirement = z.infer<
  typeof cinematicPresentationRequirementSchema
>;

export const CINEMATIC_PRESENTATION_BRIEF = `场景实体与讲解展示区域使用不同证据类型。objects只列实际三维实体（包括教师明确要求的场内标牌），不要把播放器的模型说明、顶部简介、章节讲解、控件或镜头轨道当作实体。讲解区域要求完整保留在presentationRequirements:[{description:"原要求",surface:"overview|model-note|chapter-copy"}]；没有此类要求时省略或空数组。overview对应subtitle，model-note对应modelNote，chapter-copy对应每章title/caption/question。SceneIR用coverage.presentation逐项复制description和surface，并在对应真实文字字段生成内容；不是coverage.objects，不需要也不允许伪造几何节点。只限上述真实展示区域，不能用文案承载硬件实体、装配、轨迹或任何教学动作。表面铭牌仍是有surfaceText的几何实体，不能借此删除或降格已接受的原要求。`;

export function hasCinematicPresentationContent(
  scene: {
    subtitle?: string;
    modelNote?: string;
    chapters: Array<{ title: string; caption: string; question?: string }>;
  },
  surface: CinematicPresentationRequirement['surface'],
): boolean {
  if (surface === 'overview') return Boolean(scene.subtitle?.trim());
  if (surface === 'model-note') return Boolean(scene.modelNote?.trim());
  return (
    scene.chapters.length > 0 &&
    scene.chapters.every((chapter) => Boolean(chapter.title.trim() && chapter.caption.trim()))
  );
}

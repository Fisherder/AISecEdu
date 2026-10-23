import type { VisualGenerationIntent } from '@/lib/cinematic/capabilities';
import type { SingleArtifactInput } from './lesson-generation';

export function interactiveProcessInput(request: string, plan: Record<string, unknown>, intent: VisualGenerationIntent): SingleArtifactInput | null {
  if (intent.mode !== 'interactive-2d' || intent.twoDimensionalFormat !== 'simulation') return null;
  const description = JSON.stringify({ request, plan });
  if (description.length > 180000) throw Error('互动过程完整计划超过容量，未拆页或截断交互要求');
  return { type: 'simulation', title: String(plan.title || '互动过程实验').slice(0, 120), originalRequest: request,
    description, keyPoints: [...intent.objects, ...intent.interactions], visualIntent: intent };
}

/** A diagram is one connected view, not one unrelated widget per planning step. */
export function interactiveDiagramInput(
  request: string,
  plan: Record<string, unknown>,
  intent: VisualGenerationIntent,
): SingleArtifactInput | null {
  if (intent.mode !== 'interactive-2d' || intent.twoDimensionalFormat !== 'diagram') return null;
  return {
    type: 'diagram',
    title: String(plan.title || '交互流程图').slice(0, 120),
    keyPoints: [...intent.objects, ...intent.interactions],
    description: [
      `教师要求（交付形式与交互必须保留）：${request.slice(0, 16000)}`,
      `完整关系计划（各阶段共同组成同一个图，不拆成独立页面）：${JSON.stringify(plan).slice(0, 16000)}`,
      '交付一个完整二维交互图。每个步骤或实体使用一个有明确标签的节点；每个节点的details提供可直接阅读的完整说明，用户点击或键盘选择节点后显示。边必须表达实际关系。不要输出HTML或泛化控制台，不要补充无关主题、参数滑杆或攻击防守状态。',
    ].join('\n\n'),
  };
}

import { describe, expect, it } from 'vitest';
import { parseVisualGenerationIntent } from '@/lib/cinematic/capabilities';
import { interactiveDiagramInput } from '@/lib/server/visual-artifact-input';
import { buildOutlineForArtifact } from '@/lib/server/lesson-generation';

function diagramIntent(objects: string[], interactions: string[]) {
  return parseVisualGenerationIntent({
    mode: 'interactive-2d',
    twoDimensionalFormat: 'diagram',
    reason: '在同一个二维关系图中点击查看完整步骤说明',
    objects,
    interactions,
    interactionRequirements: interactions.map((description) => ({ description, kind: 'view' })),
    visualPriorities: ['保持节点与说明对应'],
  });
}

describe('complete validated intent in the two-dimensional diagram adapter', () => {
  it('passes all twenty objects and twenty-four interactions through to the generation outline', () => {
    const objects = Array.from({ length: 20 }, (_, index) => `流程对象${index + 1}`);
    const interactions = Array.from(
      { length: 24 },
      (_, index) => `点击查看第${index + 1}项说明，不遗漏标点。`,
    );
    const intent = diagramIntent(objects, interactions);
    const input = interactiveDiagramInput('全部内容放在同一个二维交互图中', {}, intent);
    expect(input).not.toBeNull();
    expect(input!.type).toBe('diagram');
    expect(input!.keyPoints).toEqual([...objects, ...interactions]);
    expect(input!.keyPoints).toHaveLength(44);
    const outline = buildOutlineForArtifact(input!, 0);
    expect(outline).toMatchObject({ type: 'interactive', widgetType: 'diagram' });
    expect(outline.keyPoints).toEqual([...objects, ...interactions]);
    expect(outline.keyPoints[19]).toBe(objects[19]);
    expect(outline.keyPoints[43]).toBe(interactions[23]);
  });

  it('does not add unrequested plan objectives or invent interactions', () => {
    const intent = diagramIntent(['课程节点'], ['点击课程节点查看说明']);
    const input = interactiveDiagramInput(
      '只展示已指定节点及其说明',
      { title: '二维流程', objectives: ['未经教师要求的新功能'] },
      intent,
    );
    expect(input!.keyPoints).toEqual(['课程节点', '点击课程节点查看说明']);
    expect(input!.keyPoints).not.toContain('未经教师要求的新功能');
  });

  it('preserves exact text and ordering even when an object and an interaction share wording', () => {
    const intent = diagramIntent(['观察步骤', ' 课程节点 '], ['观察步骤', '点击查看：说明。']);
    expect(interactiveDiagramInput('保留原文', {}, intent)!.keyPoints).toEqual([
      '观察步骤',
      ' 课程节点 ',
      '观察步骤',
      '点击查看：说明。',
    ]);
  });

  it('creates an independent input array without mutating the validated contract', () => {
    const intent = diagramIntent(['课程节点'], ['点击查看说明']);
    const before = structuredClone(intent);
    Object.freeze(intent.objects);
    Object.freeze(intent.interactions);
    Object.freeze(intent);
    const input = interactiveDiagramInput('保持合同', {}, intent)!;
    input.keyPoints!.pop();
    expect(intent).toEqual(before);
    expect(input.keyPoints).not.toBe(intent.objects);
    expect(input.keyPoints).not.toBe(intent.interactions);
  });

  it('does not fill an empty validated object/interaction list with invented requirements', () => {
    const input = interactiveDiagramInput('保持空清单', {}, diagramIntent([], []));
    expect(input!.keyPoints).toEqual([]);
    expect(buildOutlineForArtifact(input!, 0).keyPoints).toEqual([]);
  });

  it.each([{ mode: 'cinematic-v1' as const }, { twoDimensionalFormat: 'simulation' as const }])(
    'leaves a different rendering branch untouched: %j',
    (override) => {
      const intent = { ...diagramIntent(['实体'], ['观察实体']), ...override };
      expect(interactiveDiagramInput('保留原交付形式', {}, intent)).toBeNull();
    },
  );
});

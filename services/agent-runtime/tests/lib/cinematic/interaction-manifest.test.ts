import { describe, expect, it } from 'vitest';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { cinematicInteractionManifest } from '@/lib/cinematic/interaction-manifest';
import { referenceScenes } from '@/lib/cinematic/reference-scenes';
import { compileProcessScene } from '@/lib/process/compile';
import { processInteractionManifest } from '@/lib/process/interaction-manifest';
import { parseProcessScene } from '@/lib/process/schema';

describe('cinematic OpenMAIC interaction contract', () => {
  it('publishes a compatible visualization config backed by actual compiled selectors', () => {
    const scene = referenceScenes[3];
    const manifest = cinematicInteractionManifest(scene);
    const html = compileCinematicScene(scene);
    const embedded = JSON.parse(html.match(/<script type="application\/json" id="widget-config">([\s\S]*?)<\/script>/)![1]);

    expect(embedded).toEqual(manifest);
    expect(manifest).toMatchObject({
      type: 'visualization3d',
      visualizationType: 'custom',
      schema: 'openmaic-widget-interaction-v1',
      messageTypes: ['SET_WIDGET_STATE', 'HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'],
    });
    expect(manifest.objects.map((object) => object.id)).toEqual(scene.nodes.map((node) => node.id));
    expect(manifest.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'orbit', target: 'camera' }),
      expect.objectContaining({ type: 'zoom', target: 'camera' }),
      expect.objectContaining({ type: 'slider', param: 'rotor-input' }),
      expect.objectContaining({ type: 'button', target: 'reset' }),
    ]));
    for (const control of scene.learnerControls) {
      const selector = `#learner-${control.id}`;
      expect(manifest.elements).toContainEqual(expect.objectContaining({ selector }));
      expect(html).toContain(`id="learner-${control.id}"`);
    }
  });

  it('publishes actual process inputs, actions, evidence and verification selectors', () => {
    const scene = parseProcessScene({
      schemaVersion: 'process-v1', title: '逐步实验', summary: '设置增量并观察两步累加', modelNote: '离散教学状态机',
      inputs: [{id: 'delta', label: '增量', type: 'number', min: 1, max: 3, default: 1}],
      initialState: {amount: 0, phase: 0},
      views: [{id: 'amount', title: '累计值', kind: 'value', value: {state: 'amount'}}, {id: 'phase', title: '阶段', kind: 'value', value: {state: 'phase'}}],
      actions: [{id: 'advance', label: '执行一步', description: '累加输入值', enabledWhen: {op: 'lt', args: [{state: 'phase'}, 2]}, repeatWhile: {op: 'lt', args: [{state: 'phase'}, 2]}, updates: [{target: 'amount', value: {op: 'add', args: [{state: 'amount'}, {input: 'delta'}]}}, {target: 'phase', value: {op: 'add', args: [{state: 'phase'}, 1]}}], feedback: {op: 'concat', args: ['当前值 ', {state: 'amount'}]}}],
      stages: [{id: 'ready', title: '准备', when: {op: 'eq', args: [{state: 'phase'}, 0]}, explanation: '设置输入。'}, {id: 'active', title: '执行', when: {op: 'eq', args: [{state: 'phase'}, 1]}, explanation: '观察中间态。'}, {id: 'done', title: '完成', when: {op: 'eq', args: [{state: 'phase'}, 2]}, explanation: '核对结果。'}],
      questions: [{id: 'check', prompt: '当前累计值？', evidenceView: 'amount'}], coverage: [],
    });
    const manifest = processInteractionManifest(scene);
    const html = compileProcessScene(scene);
    const embedded = JSON.parse(html.match(/<script id="widget-config" type="application\/json">([\s\S]*?)<\/script>/)![1]);
    expect(embedded).toEqual(manifest);
    expect(manifest).toMatchObject({ type: 'simulation', schema: 'openmaic-widget-interaction-v1' });
    for (const selector of ['#input-delta', '#action-advance', '#auto-advance', '[data-view="amount"]', '#answer-check', '#process-reset'])
      expect(manifest.elements).toContainEqual(expect.objectContaining({ selector }));
    expect(html).toContain('SET_WIDGET_STATE');
  });
});

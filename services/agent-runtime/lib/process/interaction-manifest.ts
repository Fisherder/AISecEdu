import type { SimulationConfig } from '@/lib/types/widgets';
import type { ProcessScene } from './schema';

type ProcessInteractionManifest = SimulationConfig & {
  schema: 'openmaic-widget-interaction-v1';
  messageTypes: Array<'SET_WIDGET_STATE' | 'HIGHLIGHT_ELEMENT' | 'ANNOTATE_ELEMENT' | 'REVEAL_ELEMENT'>;
  inputs: ProcessScene['inputs'];
  decisions: NonNullable<ProcessScene['decisions']>;
  actions: Array<{ id: string; repeatable: boolean }>;
  state: { fields: string[]; inputs: Record<string, string | number | boolean | null> };
  elements: Array<{ selector: string; role: string; actions: string[] }>;
};

export function processInteractionManifest(scene: ProcessScene): ProcessInteractionManifest {
  const messageActions = ['HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'];
  return {
    type: 'simulation',
    concept: scene.title,
    description: scene.summary,
    variables: scene.inputs.filter(input => ['number', 'range'].includes(input.type)).map(input => ({
      name: input.id,
      label: input.label,
      min: input.min!,
      max: input.max!,
      default: input.default as number,
      step: input.step,
    })),
    schema: 'openmaic-widget-interaction-v1',
    messageTypes: ['SET_WIDGET_STATE', 'HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'],
    inputs: scene.inputs,
    decisions: scene.decisions ?? [],
    actions: scene.actions.map(action => ({ id: action.id, repeatable: action.repeatWhile !== undefined })),
    state: {
      fields: ['inputs', 'running', 'count', 'feedback'],
      inputs: Object.fromEntries(scene.inputs.map(input => [input.id, input.default])),
    },
    elements: [
      ...scene.inputs.map(input => ({
        selector: `#input-${input.id}`,
        role: 'learner-input',
        actions: [...messageActions, 'SET_WIDGET_STATE'],
      })),
      ...scene.inputs.flatMap(input => (input.presets ?? []).map((_, index) => ({
        selector: `#preset-${input.id}-${index}`,
        role: 'input-preset',
        actions: messageActions,
      }))),
      ...scene.actions.flatMap(action => [
        { selector: `#action-${action.id}`, role: scene.decisions?.some(decision => decision.choices.includes(action.id)) ? 'learner-decision' : 'domain-step', actions: messageActions },
        ...(action.repeatWhile === undefined ? [] : [{ selector: `#auto-${action.id}`, role: 'continuous-domain-action', actions: messageActions }]),
      ]),
      ...scene.views.map(view => ({ selector: `[data-view="${view.id}"]`, role: 'state-evidence', actions: messageActions })),
      ...scene.views.filter(view => view.pick).map(view => ({ selector: `[data-view="${view.id}"] [data-pick-index]`, role: 'scene-object-operation', actions: messageActions })),
      ...(scene.decisions?.length ? [{selector:'#process-reconsider',role:'return-to-decision',actions:messageActions}] : []),
      ...scene.questions.flatMap(question => [
        { selector: `#answer-${question.id}`, role: 'evidence-answer', actions: [...messageActions, 'SET_WIDGET_STATE'] },
        { selector: `#check-${question.id}`, role: 'verify-evidence', actions: messageActions },
      ]),
      { selector: '#process-pause', role: 'pause', actions: messageActions },
      { selector: '#process-back', role: 'undo', actions: messageActions },
      { selector: '#process-reset', role: 'reset', actions: messageActions },
      { selector: '#process-speed', role: 'speed', actions: messageActions },
    ],
  };
}

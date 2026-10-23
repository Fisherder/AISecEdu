import type { CinematicScene } from './schema';
import { cinematicPlayerControlIds } from './player-controls';
import type { Visualization3DConfig } from '@/lib/types/widgets';

type CinematicInteractionManifest = Visualization3DConfig & {
  schema: 'openmaic-widget-interaction-v1';
  messageTypes: Array<'SET_WIDGET_STATE' | 'HIGHLIGHT_ELEMENT' | 'ANNOTATE_ELEMENT' | 'REVEAL_ELEMENT'>;
  state: { fields: string[]; controlValues: Record<string, number>; domainInputs?:Record<string,string|number|boolean|null> };
  elements: Array<{ selector: string; role: string; actions: string[]; nodeId?: string }>;
};

export function cinematicInteractionManifest(scene: CinematicScene): CinematicInteractionManifest {
  return {
    type: 'visualization3d',
    visualizationType: 'custom',
    description: scene.subtitle,
    objects: scene.nodes.map(node => ({
      id: node.id,
      type: 'custom' as const,
      name: node.label ?? node.represents,
      position: { x: node.position[0], y: node.position[1], z: node.position[2] },
      rotation: { x: node.rotation[0], y: node.rotation[1], z: node.rotation[2] },
      scale: { x: node.scale[0], y: node.scale[1], z: node.scale[2] },
    })),
    interactions: [
      { type: 'orbit', target: 'camera', label: '拖动旋转视角' },
      { type: 'zoom', target: 'camera', label: '缩放观察' },
      ...scene.learnerControls.map(control => control.type === 'range'
        ? { type: 'slider' as const, target: 'timeline', label: control.label, param: control.id, min: control.min, max: control.max, default: control.defaultValue, step: control.step }
        : { type: 'button' as const, target: control.action, label: control.label }),
      ...(scene.lab?.model.scene.inputs??[]).filter(input=>['number','range'].includes(input.type)).map(input=>({
        type:'slider' as const,target:'domain-state',label:input.label,param:input.id,min:input.min!,max:input.max!,default:input.default as number,step:input.step})),
      ...(scene.lab?.model.scene.decisions ?? []).flatMap(decision=>decision.choices.map(choice=>({type:'button' as const,target:choice,
        label:scene.lab!.model.scene.actions.find(action=>action.id===choice)!.label}))),
    ],
    schema: 'openmaic-widget-interaction-v1',
    messageTypes: ['SET_WIDGET_STATE', 'HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'],
    state: {
      fields: ['time', 'playing', 'rate', 'exploded', 'labelsVisible', 'controlValues',...(scene.lab?['domainInputs']:[])],
      controlValues: Object.fromEntries(scene.learnerControls.filter(control => control.type === 'range')
        .map(control => [control.id, control.defaultValue])),
      ...(scene.lab?{domainInputs:Object.fromEntries(scene.lab.model.scene.inputs.map(input=>[input.id,input.default]))}:{}),
    },
    elements: [
      { selector: '#cinematic-canvas', role: 'three-dimensional-viewport', actions: ['HIGHLIGHT_ELEMENT'] },
      ...Object.entries(cinematicPlayerControlIds).map(([name, id]) => ({
        selector: `#${id}`,
        role: name,
        actions: ['HIGHLIGHT_ELEMENT', 'REVEAL_ELEMENT'],
      })),
      ...scene.learnerControls.map(control => ({
        selector: `#learner-${control.id}`,
        role: control.type === 'range' ? 'learner-input' : control.action,
        actions: ['HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT', 'SET_WIDGET_STATE'],
      })),
      ...scene.nodes.filter(node => node.label).map(node => ({
        selector: `.node-label[data-node-id="${node.id}"]`,
        role: 'scene-node',
        nodeId: node.id,
        actions: ['HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'],
      })),
      ...(scene.lab?.model.scene.decisions ?? []).flatMap(decision=>decision.choices.map(choice=>({selector:'#action-'+choice,
        role:'learner-decision',actions:['HIGHLIGHT_ELEMENT','ANNOTATE_ELEMENT','REVEAL_ELEMENT']}))),
      ...(scene.lab ? [{selector:'#process-reconsider',role:'return-to-decision',actions:['HIGHLIGHT_ELEMENT','REVEAL_ELEMENT']}] : []),
      ...(scene.lab?.model.scene.inputs??[]).map(input=>({selector:'#input-'+input.id,role:'domain-input',actions:['HIGHLIGHT_ELEMENT','ANNOTATE_ELEMENT','REVEAL_ELEMENT','SET_WIDGET_STATE']})),
      ...(scene.lab?[{selector:'.decision-results',role:'same-checkpoint-results',actions:['HIGHLIGHT_ELEMENT','REVEAL_ELEMENT']},
        {selector:'#domain-lab-back',role:'domain-undo',actions:['HIGHLIGHT_ELEMENT','REVEAL_ELEMENT']},
        {selector:'#domain-lab-reset',role:'domain-reset',actions:['HIGHLIGHT_ELEMENT','REVEAL_ELEMENT']}]:[]),
    ],
  };
}

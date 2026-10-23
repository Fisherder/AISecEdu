import type { CoursewarePage } from '@/lib/courseware/schema';
import type { CinematicLearnerCopy } from '@/lib/server/cinematic-learner-copy';
import type { ProcessScene } from '@/lib/process/schema';
import type { DiagramConfig } from '@/lib/widgets/diagram';
import type { LearnerTextUnit } from './learner-language';

function unit(id: string) {
  const result: LearnerTextUnit = { id, fields: [] };
  return {
    result,
    add(path: string, value: unknown, literal = false) {
      if (typeof value === 'string' && value.trim())
        result.fields.push({ path, text: value, ...(literal ? { literal: true } : {}) });
    },
  };
}

export function coursewareLanguageUnit(page: CoursewarePage): LearnerTextUnit {
  const { result, add } = unit(page.id);
  for (const key of ['title', 'objective', 'takeaway', 'speakerNotes'] as const) add(key, page[key]);
  page.supporting.forEach((text, index) => add(`supporting.${index}`, text));
  const visual = page.visual;
  switch (visual.kind) {
    case 'scene':
      add('visual.description', visual.description);
      visual.objects.forEach((object, index) => {
        add(`visual.objects.${index}.text`, object.text, object.font === 'mono');
        add(`visual.objects.${index}.detail`, object.detail);
      });
      break;
    case 'diagram':
      add('visual.relationship', visual.relationship);
      visual.nodes.forEach((node, index) => {
        for (const key of ['label', 'detail', 'group'] as const) add(`visual.nodes.${index}.${key}`, node[key]);
        add(`visual.nodes.${index}.value`, node.value, true);
      });
      visual.edges.forEach((edge, index) => add(`visual.edges.${index}.label`, edge.label));
      break;
    case 'chart':
      add('visual.unit', visual.unit, true);
      add('visual.basis', visual.basis);
      visual.labels.forEach((label, index) => add(`visual.labels.${index}`, label));
      visual.series.forEach((series, index) => add(`visual.series.${index}.name`, series.name));
      break;
    case 'comparison':
      visual.columns.forEach((label, index) => add(`visual.columns.${index}`, label));
      visual.rows.forEach((row, index) => {
        add(`visual.rows.${index}.label`, row.label);
        row.values.forEach((value, n) => add(`visual.rows.${index}.values.${n}`, value));
      });
      break;
    case 'code':
      add('visual.explanation', visual.explanation);
      visual.lines.forEach((line, index) => add(`visual.lines.${index}`, line, true));
      break;
    case 'equation':
      add('visual.expression', visual.expression, true);
      add('visual.example', visual.example);
      visual.terms.forEach((term, index) => {
        add(`visual.terms.${index}.symbol`, term.symbol, true);
        add(`visual.terms.${index}.meaning`, term.meaning);
      });
      break;
    case 'image':
      add('visual.alt', visual.alt);
      add('visual.caption', visual.caption);
      visual.annotations.forEach((annotation, index) => add(`visual.annotations.${index}.label`, annotation.label));
  }
  page.beats.forEach((beat, index) => {
    for (const key of ['title', 'explanation'] as const) add(`beats.${index}.${key}`, beat[key]);
    beat.objectStates.forEach((state, n) => add(`beats.${index}.objectStates.${n}.text`, state.text,
      visual.kind === 'scene' && visual.objects.find(object => object.id === state.id)?.font === 'mono'));
    beat.nodeStates.forEach((state, n) => add(`beats.${index}.nodeStates.${n}.value`, state.value, true));
    add(`beats.${index}.equationState.expression`, beat.equationState?.expression, true);
    add(`beats.${index}.equationState.example`, beat.equationState?.example);
  });
  add('check.question', page.check?.question);
  page.check?.options.forEach((option, index) => {
    add(`check.options.${index}.label`, option.label);
    add(`check.options.${index}.feedback`, option.feedback);
  });
  return result;
}

export function cinematicLanguageUnits(copy: CinematicLearnerCopy): LearnerTextUnit[] {
  const intro = unit('introduction');
  for (const key of ['title', 'overview', 'modelNote'] as const) intro.add(key, copy[key]);
  const result = [intro.result];
  copy.chapters.forEach((chapter, index) => {
    const item = unit(`chapter-${index}`);
    for (const key of ['title', 'observation', 'explanation', 'question'] as const)
      item.add(`chapters.${index}.${key}`, chapter[key]);
    result.push(item.result);
  });
  copy.nodes.forEach((node, index) => {
    const item = unit(`node-${node.id}`);
    item.add(`nodes.${index}.label`, node.label);
    item.add(`nodes.${index}.explanation`, node.explanation);
    node.surfaceLines?.forEach((text, n) => item.add(`nodes.${index}.surfaceLines.${n}`, text));
    result.push(item.result);
  });
  if (copy.connections.length) {
    const item = unit('connections');
    copy.connections.forEach((connection, index) => item.add(`connections.${index}.label`, connection.label));
    result.push(item.result);
  }
  return result;
}

export function processLanguageUnits(scene: ProcessScene): LearnerTextUnit[] {
  const intro = unit('introduction');
  for (const key of ['title', 'summary', 'modelNote'] as const) intro.add(key, scene[key]);
  const controls = unit('inputs');
  scene.inputs.forEach((input, index) => {
    controls.add(`inputs.${index}.label`, input.label);
    input.options?.forEach((option, n) => controls.add(`inputs.${index}.options.${n}.label`, option.label));
    input.presets?.forEach((preset, n) => controls.add(`inputs.${index}.presets.${n}.label`, preset.label));
  });
  const result = [intro.result, controls.result];
  const expressionText = (item: ReturnType<typeof unit>, expression: unknown, path: string, literal = false) => {
    if (typeof expression === 'string') item.add(path, expression, literal);
    else if (expression && typeof expression === 'object' && 'op' in expression && 'args' in expression && Array.isArray(expression.args))
      expression.args.forEach((arg, index) => expressionText(item, arg, `${path}.args.${index}`, literal));
  };
  scene.views.forEach((view, index) => {
    const item = unit(`view-${view.id}`);
    item.add(`views.${index}.title`, view.title);
    item.add(`views.${index}.caption`, view.caption);
    view.regions?.forEach((region, n) => item.add(`views.${index}.regions.${n}.label`, region.label));
    view.topology?.labels.forEach((label,n)=>item.add(`views.${index}.topology.labels.${n}`,label));
    view.topology?.edges.forEach((edge,n)=>item.add(`views.${index}.topology.edges.${n}.label`,edge.label));
    expressionText(item, view.value, `views.${index}.value`, view.kind === 'code');
    result.push(item.result);
  });
  scene.actions.forEach((action, index) => {
    const item = unit(`action-${action.id}`);
    item.add(`actions.${index}.label`, action.label);
    item.add(`actions.${index}.description`, action.description);
    expressionText(item, action.feedback, `actions.${index}.feedback`);
    result.push(item.result);
  });
  scene.stages.forEach((stage, index) => {
    const item = unit(`stage-${stage.id}`);
    item.add(`stages.${index}.title`, stage.title);
    item.add(`stages.${index}.explanation`, stage.explanation);
    result.push(item.result);
  });
  if (scene.questions.length) {
    const item = unit('questions');
    scene.questions.forEach((question, index) => item.add(`questions.${index}.prompt`, question.prompt));
    result.push(item.result);
  }
  return result;
}

export function diagramLanguageUnits(config: DiagramConfig): LearnerTextUnit[] {
  const intro = unit('introduction');
  intro.add('title', config.title);
  intro.add('description', config.description);
  const result = [intro.result];
  const headings = unit('layout-headings');
  config.layout?.columns.forEach((column, index) => headings.add(`layout.columns.${index}.label`, column.label));
  config.layout?.rows.forEach((row, index) => headings.add(`layout.rows.${index}.label`, row.label));
  if (headings.result.fields.length) result.push(headings.result);
  config.steps?.forEach((step, index) => {
    const item = unit(`reveal-step-${index}`);
    item.add(`steps.${index}.title`, step.title);
    item.add(`steps.${index}.description`, step.description);
    result.push(item.result);
  });
  config.nodes.forEach((node, index) => {
    const item = unit(`node-${index}`);
    item.add(`nodes.${index}.label`, node.label);
    item.add(`nodes.${index}.details`, node.details);
    result.push(item.result);
  });
  const edges = unit('connections');
  config.edges.forEach((edge, index) => edges.add(`edges.${index}.label`, edge.label));
  if (edges.result.fields.length) result.push(edges.result);
  return result;
}

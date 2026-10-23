import type { ProcessExpression, ProcessScene } from '@/lib/process/schema';
import { createProcessEngine } from '@/lib/server/process-quality';

/** Fill only a genuinely uncovered initial frame, using the scene's own state
 * and an executable first action. Later frames remain the author's work and
 * still have to pass the deterministic and browser quality gates. */
export function completeMissingInitialStage(scene: ProcessScene): void {
  if (!Array.isArray(scene.stages) || scene.stages.length >= 12 ||
      !Array.isArray(scene.actions) || !scene.initialState ||
      typeof scene.initialState !== 'object') return;
  try {
    const engine = createProcessEngine(scene);
    if (scene.stages.some(stage => engine.evaluate(stage.when) === true)) return;
    const first = scene.actions.find(action => engine.can(action.id));
    if (!first) return;
    const predicates = Object.entries(scene.initialState).map(([id, value]) =>
      ({ op: 'eq', args: [{ state: id }, structuredClone(value)] }) as ProcessExpression);
    if (!predicates.length) return;
    while (predicates.length > 1) {
      const group = predicates.splice(0, 8);
      if (group.length === 1) { predicates.push(group[0]); break; }
      predicates.push({ op: 'and', args: group });
    }
    const when = predicates[0];
    if (engine.evaluate(when) !== true) return;
    let id = 'initial';
    for (let suffix = 2; scene.stages.some(stage => stage.id === id); suffix++) id = `initial${suffix}`;
    scene.stages.unshift({
      id,
      title: '等待开始',
      when,
      explanation: `调整输入后点击“${first.label}”开始，观察状态和结果变化。`,
    });
  } catch {
    // An invalid scene is handled by the ordinary validator and targeted repair.
  }
}

/** Remove only a literal phase that cannot occur: its state starts at a
 * different value and every write selects from known literals that exclude
 * it. This avoids spending repair calls on a decorative, unreachable stage. */
export function removeProvablyUnreachableLiteralStages(scene: ProcessScene): void {
  if (!Array.isArray(scene.stages) || scene.stages.length <= 3 ||
      !Array.isArray(scene.actions) || !scene.initialState) return;
  const possibleLiterals = (value: unknown): unknown[] | undefined => {
    if (value === null || ['string','number','boolean'].includes(typeof value)) return [value];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const expr = value as {op?: unknown; args?: unknown[]};
    if (expr.op !== 'if' || !Array.isArray(expr.args) || expr.args.length !== 3) return;
    const yes = possibleLiterals(expr.args[1]), no = possibleLiterals(expr.args[2]);
    return yes && no ? [...yes,...no] : undefined;
  };
  let remaining = scene.stages.length;
  scene.stages = scene.stages.filter(stage => {
    if (remaining <= 3) return true;
    const when = stage.when as {op?: unknown; args?: unknown[]};
    if (when?.op !== 'eq' || !Array.isArray(when.args) || when.args.length !== 2 ||
        typeof (when.args[0] as {state?: unknown})?.state !== 'string') return true;
    const id = (when.args[0] as {state: string}).state;
    const wanted = when.args[1];
    if (!Object.hasOwn(scene.initialState,id) ||
        JSON.stringify(scene.initialState[id]) === JSON.stringify(wanted)) return true;
    const writes = scene.actions.flatMap(action => action.updates.filter(update => update.target === id));
    const unreachable = writes.every(update => {
      const values = possibleLiterals(update.value);
      return values && values.every(value => JSON.stringify(value) !== JSON.stringify(wanted));
    });
    if (unreachable) {remaining--; return false;}
    return true;
  });
}

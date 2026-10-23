import type { ProcessScene } from './schema';

const containsExpression = (root: unknown, expected: unknown): boolean => {
  if (JSON.stringify(root) === JSON.stringify(expected)) return true;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return false;
  const args = (root as {args?: unknown}).args;
  return Array.isArray(args) && args.some(arg => containsExpression(arg, expected));
};

/** Replace an author's non-advancing "finish the rest" button with the real
 * advancing byte action. Only the no-op command is removed; its deterministic
 * tests are redirected to the real action and still run end to end. */
export function replaceNoopContinuousAction(scene: ProcessScene, tests: unknown): void {
  if (!Array.isArray(scene.actions) || !Array.isArray(tests) || scene.actions.length < 3) return;
  for (const noOp of [...scene.actions]) {
    if (!/^(?:finish|complete)/i.test(noOp.id) || !/完成.*(?:字节|字符|其余)/.test(noOp.label) ||
        !noOp.repeatWhile || !Array.isArray(noOp.updates) || !noOp.updates.length ||
        !noOp.updates.every(update => update.index === undefined &&
          typeof (update.value as {state?: unknown})?.state === 'string' &&
          (update.value as {state: string}).state === update.target)) continue;
    const progressState = JSON.stringify(noOp.repeatWhile).match(/"state":"([a-zA-Z][a-zA-Z0-9_-]*)"/)?.[1];
    if (!progressState) continue;
    const worker = scene.actions.find(action => action !== noOp &&
      JSON.stringify(action).includes('"op":"xor"') &&
      containsExpression(action.enabledWhen, noOp.repeatWhile) &&
      action.updates.some(update => update.target === progressState &&
        JSON.stringify(update.value) !== JSON.stringify({state: progressState})));
    if (!worker) continue;
    worker.repeatWhile ??= structuredClone(worker.enabledWhen);
    for (const test of tests as Array<{actions?: Array<{id?: string; count?: unknown}>}>)
      if (Array.isArray(test.actions)) for (const step of test.actions)
        if (step.id === noOp.id) step.id = worker.id;
    if (Array.isArray(scene.coverage)) for (const item of scene.coverage)
      if (Array.isArray(item.actions)) item.actions = item.actions.map(id => id === noOp.id ? worker.id : id);
    scene.actions = scene.actions.filter(action => action !== noOp);
  }
}

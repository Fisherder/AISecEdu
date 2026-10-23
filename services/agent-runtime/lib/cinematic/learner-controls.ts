const BUILT_IN_STEP = /(?:^|\s)(?:step|single[ -]?step)(?:\s|$)|单步|逐帧/i;
const BUTTON_ACTIONS = new Set(['play', 'pause', 'reset', 'seek', 'play-from']);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Repair the narrow provider mistakes that duplicate player-owned controls.
 * The player always supplies previous/next frame, reset, orbit and zoom. They
 * are not learner experiment inputs and must not make an otherwise valid
 * generated timeline fail its schema contract. A coverage item backed by
 * model/view properties cannot also claim a player control; discard that
 * contradictory field and let the independent requirement gate check whether
 * a separate player-control mapping is still needed.
 */
export function normalizeGeneratedLearnerControls<T>(value: T): T {
  if (!record(value)) return value;
  const coverage = record(value.coverage) ? value.coverage : undefined;
  if (!Array.isArray(value.learnerControls) && !Array.isArray(coverage?.interactions)) return value;
  const output = structuredClone(value) as Record<string, unknown>;
  if (Array.isArray(output.learnerControls)) output.learnerControls = output.learnerControls.flatMap(controlValue => {
    if (!record(controlValue)) return [controlValue];
    const control = {...controlValue};
    const action = typeof control.action === 'string' ? control.action : '';
    const label = typeof control.label === 'string' ? control.label : '';
    if (action === 'step' || BUILT_IN_STEP.test(label)) return [];
    if (control.type === undefined && ['button', 'player-control'].includes(String(control.kind)))
      control.type = 'button';
    delete control.kind;
    if (control.type !== 'button') return [control];
    if (!BUTTON_ACTIONS.has(action)) return [];
    if (['play', 'pause', 'reset'].includes(action)) delete control.at;
    return [control];
  });
  if (record(output.coverage) && Array.isArray(output.coverage.interactions))
    output.coverage.interactions = output.coverage.interactions.map(interaction => {
      if (!record(interaction) || !Array.isArray(interaction.properties) ||
          interaction.properties.includes('controls') || !Array.isArray(interaction.controls)) return interaction;
      const corrected = {...interaction};
      delete corrected.controls;
      return corrected;
    });
  return output as T;
}

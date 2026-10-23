import {
  parseVisualGenerationIntent,
  type VisualGenerationIntent,
} from '@/lib/cinematic/capabilities';

const messages = {
  INVALID_ARTIFACT_COUNT: 'Cinematic revision requires a positive integer artifact count.',
  INCOMPLETE_INTENT:
    'Persisted cinematic revision intent is incomplete; legacy fallback is forbidden.',
  INVALID_INTENT:
    'Persisted cinematic revision intent failed validation; legacy fallback is forbidden.',
  NON_CINEMATIC_INTENT:
    'Persisted revision intent must use cinematic-v1; a two-dimensional contract cannot be reused.',
  AMBIGUOUS_PLAN_INTENT:
    'A shared plan intent cannot be assigned to an individual artifact in a multi-artifact revision.',
  CONFLICTING_INTENTS:
    'Artifact and single-artifact plan revision contracts differ; neither contract may be silently discarded.',
} as const;

type IntentSource = 'artifact.cinematicIntent' | 'plan.visualIntent';

export class CinematicRevisionContractError extends Error {
  constructor(
    public readonly code: keyof typeof messages,
    public readonly source?: IntentSource,
  ) {
    super(messages[code]);
    this.name = 'CinematicRevisionContractError';
  }
}

function readIntent(value: unknown, source: IntentSource): VisualGenerationIntent {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !['objects', 'interactions', 'interactionRequirements', 'visualPriorities'].every(
      (field) =>
        Object.hasOwn(value, field) && Array.isArray((value as Record<string, unknown>)[field]),
    )
  ) {
    throw new CinematicRevisionContractError('INCOMPLETE_INTENT', source);
  }
  let intent: VisualGenerationIntent;
  try {
    intent = parseVisualGenerationIntent(value);
  } catch {
    throw new CinematicRevisionContractError('INVALID_INTENT', source);
  }
  if (intent.mode !== 'cinematic-v1') {
    throw new CinematicRevisionContractError('NON_CINEMATIC_INTENT', source);
  }
  return intent;
}

export function resolveCinematicRevisionIntent(
  artifactContent: Record<string, unknown> | null,
  plan: Record<string, unknown> | null,
  artifactCount: number,
): VisualGenerationIntent | undefined {
  if (!Number.isSafeInteger(artifactCount) || artifactCount < 1) {
    throw new CinematicRevisionContractError('INVALID_ARTIFACT_COUNT');
  }
  const hasArtifactIntent =
    artifactContent !== null && Object.hasOwn(artifactContent, 'cinematicIntent');
  const hasPlanIntent = plan !== null && Object.hasOwn(plan, 'visualIntent');
  if (hasArtifactIntent) {
    const intent = readIntent(artifactContent.cinematicIntent, 'artifact.cinematicIntent');
    if (artifactCount === 1 && hasPlanIntent) {
      const planIntent = readIntent(plan.visualIntent, 'plan.visualIntent');
      if (JSON.stringify(intent) !== JSON.stringify(planIntent)) {
        throw new CinematicRevisionContractError('CONFLICTING_INTENTS');
      }
    }
    return intent;
  }
  if (!hasPlanIntent) return undefined;
  if (artifactCount !== 1) {
    throw new CinematicRevisionContractError('AMBIGUOUS_PLAN_INTENT', 'plan.visualIntent');
  }
  return readIntent(plan.visualIntent, 'plan.visualIntent');
}

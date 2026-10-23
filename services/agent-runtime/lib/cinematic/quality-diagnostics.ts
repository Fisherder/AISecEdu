import { cinematicSchemaIssueReasons } from './schema';

// Bounded structural evidence for private job logs. Never include requests,
// SceneIR, labels, requirement text, provider responses or arbitrary messages.
const statuses = new Set([
  'PASS',
  'FAIL',
  'PATCH_FAILED',
  'CONTRACT_PASS',
  'CONTRACT_INVALID',
  'DIRECTOR_INVALID',
  'JSON_REPAIRED',
  'JSON_SYNTAX_REPAIRED',
  'SEMANTIC_INVALID',
  'FINAL_RENDER_FAILED',
]);
const failureStatuses = new Set([
  'FAIL',
  'PATCH_FAILED',
  'CONTRACT_INVALID',
  'DIRECTOR_INVALID',
  'SEMANTIC_INVALID',
  'FINAL_RENDER_FAILED',
]);
const schemaIssueReasons = new Set<string>(cinematicSchemaIssueReasons);
const issueCodes = new Set([
  'detail-region-unverified', 'browser-detail-region-unverified',
  'occluded-focus', 'browser-occluded-focus',
  'webgl-unavailable', 'empty-frame', 'clipped-subject', 'tiny-subject', 'label-overlap', 'nearly-blank', 'runtime', 'playback-interaction',
  'browser-webgl-unavailable', 'browser-empty-frame', 'browser-clipped-subject', 'browser-tiny-subject', 'browser-label-overlap', 'browser-nearly-blank', 'browser-runtime', 'browser-playback-interaction',
  'asset-role',
  'camera-frame-missing',
  'camera-inside-bounds',
  'chapter-focus-invisible',
  'chapter-no-visible-change',
  'chapter-observation-without-evidence',
  'chapter-summary-without-process',
  'composition-assembly',
  'composition-identity',
  'composition-layers',
  'composition-role',
  'expanded-bounds-risk',
  'geometry-overlap',
  'legacy-untyped-interaction',
  'motion-only-rotation',
  'render-cost',
  'request-interaction-empty',
  'request-interaction-kind-mismatch',
  'request-interaction-missing',
  'request-object-missing',
  'request-presentation-missing',
  'subject-clipped',
  'subject-occlusion-risk',
  'subject-too-small',
  'unsupported-asset-action',
  'assembly-or-contract',
  'unresolved-path-binding', 'unresolved-ports',
  'repair-patch',
  'json-punctuation',
  'frame-groups-expanded',
  'semantic-unresolved',
  'semantic-invalid',
  'contract-invalid',
  'invalid_type',
  'invalid_value',
  'invalid_literal',
  'invalid_union',
  'invalid_union_discriminator',
  'invalid_enum_value',
  'unrecognized_keys',
  'invalid_arguments',
  'invalid_return_type',
  'invalid_date',
  'invalid_string',
  'invalid_intersection_types',
  'not_multiple_of',
  'not_finite',
  'too_small',
  'too_big',
  'invalid_format',
  'invalid_key',
  'invalid_element',
  'custom',
]);
const protocolFields = new Set(
  `
  scene schemaVersion title subtitle duration objectives theme background accent secondary environment
  nodes id kind model parent role represents assetRole assemblyPort node port label detail position
  rotation scale color emissive metalness roughness opacity params points curve axis turns phase handedness segments connectionPath followConnection connection start end width height depth radius
  top bottom tube count spread size assembly version placements mode reference side gap offset
  referencePort y coverage objects name interactions description chapter targets connections controls
  properties from to fromPort toPort via particles speed tracks target property easing keyframes at
  value shots fov frame padding chapters caption focus question visualThesis artDirection purpose
  visibleChange composition subjects assemblyIntent patches op path visualIntent twoDimensionalFormat
  reason interactionRequirements visualPriorities presentationRequirements presentation surface modelNote issues
`
    .trim()
    .split(/\s+/),
);
const arrayPathFields = new Set(
  `
  nodes objectives placements objects interactions interactionRequirements visualPriorities targets
  connections controls properties points position rotation scale offset via tracks keyframes value
  shots target chapters focus subjects patches issues
`
    .trim()
    .split(/\s+/),
);
const reasons = new Set([
  'coverage-missing',
  'no-associated-track',
  'no-mapped-track',
  'no-visible-mapped-track',
  'no-kind-compatible-track',
  'no-visible-mapped-connection',
  'explore-not-process',
  'target-not-visible',
  'controls-not-view-evidence',
  'player-control-contract-mismatch',
  'legacy-property-unfulfilled',
  'property-not-mapped',
  'property-not-kind-evidence',
  'decoration-target',
  'no-rendered-target',
  'unsupported-action',
  'not-visible-in-chapter',
  'hidden-at-all-samples',
  'insufficient-visible-samples',
  'no-change-in-chapter',
  'change-below-threshold',
  'no-change-while-visible',
  'visible-change-below-threshold',
]);
const kinds = new Set([
  'view',
  'structural-change',
  'state-change',
  'transport',
  'player-control',
  'legacy-untyped',
]);
const properties = new Set(['position', 'rotation', 'scale', 'opacity', 'emissive', 'explode']);
const causeStages = new Set([
  'browser-render',
  'assembly',
  'scene-schema',
  'geometry-quality',
  'geometry-repair-call',
  'geometry-repair-json',
  'geometry-repair-patch',
  'director-call',
  'director-json',
  'director-schema',
  'scene-call',
  'scene-json',
  'scene-patch',
  'semantic-context',
  'semantic-call',
  'semantic-json',
  'semantic-schema',
  'semantic-review',
  'semantic-patch',
  'semantic-geometry',
  'semantic-budget',
]);
const causeReasons = new Set([
  'missing-leading-slash',
  'invalid-pointer-escape',
  'unsafe-segment',
  'unknown-root',
  'missing-value',
  'empty-id',
  'id-not-found',
  'ambiguous-id',
  'add-requires-append',
  'invalid-array-index',
  'append-not-allowed',
  'index-out-of-bounds',
  'missing-parent',
  'missing-path',
  'no-change',
  'schema-invalid',
  'quality-recheck-failed',
  'model-call-failed',
  'json-invalid',
  'assembly-failed',
  'scene-validation-failed',
  'unexpected-error',
  'unresolved-without-patch',
  'repair-limit-unverified',
  'semantic-review-exhausted',
]);
const patchOperations = new Set(['replace', 'add', 'remove']);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const allowed = (value: unknown, values: Set<string>) =>
  typeof value === 'string' && values.has(value) ? value : 'unclassified';
const numeric = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const index = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
function schemaPath(value: unknown): string {
  const parts = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.length <= 2000
      ? value === ''
        ? []
        : value.split('.')
      : [undefined];
  const sanitized: string[] = [];
  for (const part of parts.slice(0, 32)) {
    if (typeof part === 'number' && Number.isSafeInteger(part) && part >= 0) {
      sanitized.push(String(part));
    } else if (
      typeof part === 'string' &&
      /^(?:0|[1-9]\d*)$/.test(part) &&
      Number.isSafeInteger(Number(part))
    ) {
      sanitized.push(part);
    } else {
      sanitized.push(
        typeof part === 'string' &&
          !arrayPathFields.has(sanitized[sanitized.length - 1]) &&
          protocolFields.has(part)
          ? part
          : '<field>',
      );
    }
  }
  return sanitized.join('.') || '<root>';
}
function patchPath(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    !value.startsWith('/') ||
    /~(?:[^01]|$)/.test(value)
  )
    return '<invalid-pointer>';
  const parts = value
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  return '/' + schemaPath(parts).replaceAll('.', '/');
}
const reasonText = (value: unknown) =>
  [...new Set(list(value).map((item) => allowed(item, reasons)))].slice(0, 24).join(',');

export function cinematicQualityDiagnostics(input: unknown[]) {
  const attempts: Record<string, unknown>[] = [],
    issues: Record<string, unknown>[] = [],
    interactions: Record<string, unknown>[] = [],
    tracks: Record<string, unknown>[] = [],
    causes: Record<string, unknown>[] = [],
    causeIssues: Record<string, unknown>[] = [];
  let issueCount = 0,
    interactionCount = 0,
    trackCount = 0,
    causeCount = 0,
    causeIssueCount = 0;
  const newest = input
    .map((item, attemptIndex) => ({ attemptIndex, attempt: record(item) }))
    .reverse();
  const failed = (entry: (typeof newest)[number]) =>
    failureStatuses.has(allowed(entry.attempt.status, statuses));
  const ordered = [...newest.filter(failed), ...newest.filter((entry) => !failed(entry))];
  for (const [offset, { attemptIndex, attempt }] of ordered.entries()) {
    if (attempt.cause !== undefined) {
      causeCount++;
      const cause = record(attempt.cause);
      if (causes.length < 12)
        causes.push({
          attemptIndex,
          attempt: index(attempt.attempt),
          semanticAttempt: index(attempt.semanticAttempt),
          stage: allowed(cause.stage, causeStages),
          reason: allowed(cause.reason, causeReasons),
          ...(cause.patchIndex === undefined ? {} : { patchIndex: index(cause.patchIndex) }),
          ...(cause.op === undefined
            ? {}
            : { op: cause.op === null ? null : allowed(cause.op, patchOperations) }),
          ...(cause.path === undefined ? {} : { path: patchPath(cause.path) }),
          ...(cause.segmentIndex === undefined ? {} : { segmentIndex: index(cause.segmentIndex) }),
          ...Object.fromEntries(
            ['reviewIssueCount', 'patchCount', 'unresolvedIssueCount', 'nestedAttemptCount']
              .filter((key) => cause[key] !== undefined)
              .map((key) => [key, index(cause[key])]),
          ),
        });
      causeIssueCount += count(cause.omittedSchemaIssues);
      for (const raw of list(cause.schemaIssues)) {
        causeIssueCount++;
        const schemaIssue = record(raw),
          minimum = numeric(schemaIssue.minimum),
          maximum = numeric(schemaIssue.maximum);
        if (causeIssues.length < 24)
          causeIssues.push({
            attemptIndex,
            code: allowed(schemaIssue.code, issueCodes),
            path: schemaPath(schemaIssue.path),
            ...(schemaIssue.parameterCode === undefined
              ? {}
              : { parameterCode: allowed(schemaIssue.parameterCode, issueCodes) }),
            ...(schemaIssue.reason === undefined
              ? {}
              : { reason: allowed(schemaIssue.reason, schemaIssueReasons) }),
            ...(minimum === null ? {} : { minimum }),
            ...(maximum === null ? {} : { maximum }),
          });
      }
    }
    const retained = offset < 6,
      metrics = record(attempt.metrics);
    if (retained)
      attempts.push({
        attemptIndex,
        status: allowed(attempt.status, statuses),
        teachingNodes: numeric(metrics.teachingNodes),
        detailedModels: numeric(metrics.detailedModels),
        relations: numeric(metrics.relations),
        drawCalls: numeric(metrics.drawCalls),
        triangles: numeric(metrics.triangles),
      });
    issueCount += count(attempt.omittedIssues ?? attempt.omittedIssueCount);
    const attemptIssues = list(attempt.issues).map(record);
    const orderedIssues = [
      ...attemptIssues.filter((issue) => issue.severity !== 'warning'),
      ...attemptIssues.filter((issue) => issue.severity === 'warning'),
    ];
    for (const issue of orderedIssues) {
      issueCount++;
      const minimum = numeric(issue.minimum ?? issue.min),
        maximum = numeric(issue.maximum ?? issue.max);
      if (retained && issues.length < 24)
        issues.push({
          attemptIndex,
          code: allowed(issue.code, issueCodes),
          severity: allowed(issue.severity, new Set(['error', 'warning'])),
          at: numeric(issue.at),
          ...(issue.path === undefined ? {} : { path: schemaPath(issue.path) }),
          ...(issue.parameterCode === undefined
            ? {}
            : { parameterCode: allowed(issue.parameterCode, issueCodes) }),
          ...(issue.reason === undefined
            ? {}
            : { reason: allowed(issue.reason, schemaIssueReasons) }),
          ...(minimum === null ? {} : { minimum }),
          ...(maximum === null ? {} : { maximum }),
        });
    }
    for (const [requirementIndex, raw] of list(attempt.interactionEvidence).entries()) {
      const evidence = record(raw);
      if (evidence.status !== 'FAIL') continue;
      const diagnostics = record(evidence.diagnostics),
        mappings = list(diagnostics.mappings);
      interactionCount += count(diagnostics.omittedMappings);
      if (!mappings.length) {
        interactionCount++;
        if (retained && interactions.length < 24)
          interactions.push({
            attemptIndex,
            requirementIndex,
            kind: allowed(evidence.kind, kinds),
            reasons: reasonText(diagnostics.reasons),
          });
      }
      for (const rawMapping of mappings) {
        const mapping = record(rawMapping);
        interactionCount++;
        trackCount += count(mapping.omittedTracks);
        if (retained && interactions.length < 24)
          interactions.push({
            attemptIndex,
            requirementIndex,
            coverageIndex: numeric(mapping.coverageIndex),
            kind: allowed(evidence.kind, kinds),
            chapter: numeric(mapping.chapter),
            start: numeric(mapping.start),
            end: numeric(mapping.end),
            associatedTrackCount: numeric(mapping.associatedTrackCount),
            mappedTrackCount: numeric(mapping.mappedTrackCount),
            visibleMappedTrackCount: numeric(mapping.visibleMappedTrackCount),
            omittedTracks: count(mapping.omittedTracks),
            reasons: reasonText(mapping.reasons),
          });
        for (const rawTrack of list(mapping.tracks)) {
          const track = record(rawTrack);
          trackCount++;
          if (!retained || tracks.length >= 36) continue;
          const otherChapters = list(track.otherVisibleChangeChapters).filter(
            (value) =>
              typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 10,
          );
          tracks.push({
            attemptIndex,
            requirementIndex,
            coverageIndex: numeric(mapping.coverageIndex),
            chapter: numeric(mapping.chapter),
            trackIndex: numeric(track.trackIndex),
            property: allowed(track.property, properties),
            coordinateSpace: allowed(track.coordinateSpace, new Set(['world', 'track-value'])),
            magnitude: numeric(track.magnitude),
            worldMagnitude: numeric(track.worldMagnitude),
            visibleMagnitude: numeric(track.visibleMagnitude),
            visibleWorldMagnitude: numeric(track.visibleWorldMagnitude),
            threshold: numeric(track.threshold),
            visibleThreshold: numeric(track.visibleThreshold),
            visibleSampleCount: numeric(track.visibleSampleCount),
            opacityEligibleSampleCount: numeric(track.opacityEligibleSampleCount),
            sampleCount: numeric(track.sampleCount),
            reasons: reasonText(track.reasons),
            otherVisibleChangeChapters: otherChapters.slice(0, 10).join(','),
            omittedChapters: count(track.omittedChapters) + Math.max(0, otherChapters.length - 10),
          });
        }
      }
    }
  }
  return {
    version: 'cinematic-quality-diagnostics-v1',
    attempts,
    omittedAttempts: Math.max(0, input.length - attempts.length),
    issues,
    omittedIssues: issueCount - issues.length,
    interactions,
    omittedInteractions: interactionCount - interactions.length,
    tracks,
    omittedTracks: trackCount - tracks.length,
    causes,
    omittedCauses: causeCount - causes.length,
    causeIssues,
    omittedCauseIssues: causeIssueCount - causeIssues.length,
  };
}

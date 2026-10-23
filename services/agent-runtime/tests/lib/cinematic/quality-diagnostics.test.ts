import { describe, expect, it, vi } from 'vitest';
import { cinematicQualityDiagnostics } from '@/lib/cinematic/quality-diagnostics';
import { createLogger } from '@/lib/logger';
import { CinematicQualityError } from '@/lib/server/cinematic-generation';

const privateText = 'DO_NOT_LOG_SCENE_OR_REQUIREMENT';
const attempt = {
  status: 'FAIL',
  metrics: { teachingNodes: 4, detailedModels: 2, relations: 0 },
  issues: [{ code: 'composition-assembly', severity: 'error', message: privateText }],
  scene: privateText,
  prompt: privateText,
  interactionEvidence: [
    {
      description: privateText,
      kind: 'state-change',
      status: 'FAIL',
      diagnostics: {
        mappings: [
          {
            chapter: 2,
            start: 20,
            end: 40,
            associatedTrackCount: 1,
            mappedTrackCount: 1,
            visibleMappedTrackCount: 0,
            targets: [privateText],
            reasons: ['no-visible-mapped-track'],
            tracks: [
              {
                trackIndex: 3,
                target: privateText,
                property: 'position',
                magnitude: 1,
                visibleMagnitude: 0,
                visibleWorldMagnitude: 0.25,
                threshold: 0.12,
                visibleThreshold: 0.18,
                visibleSampleCount: 0,
                opacityEligibleSampleCount: 3,
                sampleCount: 5,
                reasons: ['hidden-at-all-samples'],
                otherVisibleChangeChapters: [1],
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('bounded private cinematic failure evidence', () => {
  it('retains measured facts and chapter/track indices without scene or teacher text', () => {
    const diagnostics = cinematicQualityDiagnostics([attempt]);
    expect(diagnostics.attempts[0]).toMatchObject({
      teachingNodes: 4,
      detailedModels: 2,
      relations: 0,
    });
    expect(diagnostics.interactions[0]).toMatchObject({
      chapter: 2,
      start: 20,
      end: 40,
      reasons: 'no-visible-mapped-track',
    });
    expect(diagnostics.tracks[0]).toMatchObject({
      trackIndex: 3,
      property: 'position',
      threshold: 0.12,
      visibleThreshold: 0.18,
      visibleWorldMagnitude: 0.25,
      opacityEligibleSampleCount: 3,
      otherVisibleChangeChapters: '1',
    });
    expect(JSON.stringify(diagnostics)).not.toContain(privateText);
    const error = new CinematicQualityError('Failed', [attempt]);
    expect(error.diagnostics).toEqual(diagnostics);
  });

  it('rejects arbitrary codes and nonfinite numeric values', () => {
    const diagnostics = cinematicQualityDiagnostics([
      {
        status: privateText,
        metrics: { relations: Infinity },
        issues: [{ code: privateText, message: privateText }],
        interactionEvidence: [{ ...attempt.interactionEvidence[0], kind: privateText }],
      },
    ]);
    expect(diagnostics.attempts[0]).toMatchObject({ status: 'unclassified', relations: null });
    expect(JSON.stringify(diagnostics)).not.toContain(privateText);
  });

  it('bounds logs and explicitly records all omitted counts', () => {
    const oversized = {
      ...attempt,
      issues: Array(40).fill(attempt.issues[0]),
      interactionEvidence: Array(40).fill(attempt.interactionEvidence[0]),
    };
    const diagnostics = cinematicQualityDiagnostics(Array(10).fill(oversized));
    expect(diagnostics.attempts).toHaveLength(6);
    expect(diagnostics.omittedAttempts).toBe(4);
    expect(diagnostics.issues).toHaveLength(24);
    expect(diagnostics.omittedIssues).toBe(376);
    expect(diagnostics.interactions).toHaveLength(24);
    expect(diagnostics.omittedInteractions).toBe(376);
    expect(diagnostics.tracks).toHaveLength(36);
    expect(diagnostics.omittedTracks).toBe(364);
  });

  it.each([
    ['JSON_SYNTAX_REPAIRED', 'json-punctuation'],
    ['SEMANTIC_INVALID', 'semantic-unresolved'],
    ['CONTRACT_INVALID', 'contract-invalid'],
    ['DIRECTOR_INVALID', 'too_big'],
  ])('preserves the actual producer status %s and issue code %s', (status, code) => {
    const diagnostics = cinematicQualityDiagnostics([
      { status, issues: [{ code, message: privateText }] },
    ]);
    expect(diagnostics.attempts[0].status).toBe(status);
    expect(diagnostics.issues[0].code).toBe(code);
    expect(JSON.stringify(diagnostics)).not.toContain(privateText);
  });

  it.each([
    ['nodes.0.roughness', 'nodes.0.roughness'],
    [['nodes', 0, 'roughness'], 'nodes.0.roughness'],
    ['coverage.interactions.23.chapter', 'coverage.interactions.23.chapter'],
    [['subjects', 2, 'model'], 'subjects.2.model'],
    [['shots', 3, 'frame', 'nodes', 0], 'shots.3.frame.nodes.0'],
    ['tracks.0.keyframes.1.value.2', 'tracks.0.keyframes.1.value.2'],
    [[], '<root>'],
    ['', '<root>'],
    [`nodes.${privateText}.roughness`, 'nodes.<field>.roughness'],
    [['nodes', 'valid-but-private-node-id', 'params', privateText], 'nodes.<field>.params.<field>'],
    [['nodes', 'position', 'roughness'], 'nodes.<field>.roughness'],
    [['nodes', -1, privateText], 'nodes.<field>.<field>'],
    [['nodes', Infinity, { privateText }], 'nodes.<field>.<field>'],
    [['nodes', 9007199254740992, 'model'], 'nodes.<field>.model'],
    [`nodes.9007199254740992.${privateText}`, 'nodes.<field>.<field>'],
    [{ privateText }, '<field>'],
  ])('retains only protocol fields and numeric indices in schema path %j', (path, expected) => {
    const diagnostics = cinematicQualityDiagnostics([
      {
        status: 'CONTRACT_INVALID',
        issues: [
          {
            code: 'too_small',
            path,
            minimum: 0.05,
            maximum: 1,
            message: privateText,
            expected: privateText,
            received: privateText,
            keys: [privateText],
          },
        ],
      },
    ]);
    expect(diagnostics.issues[0]).toMatchObject({
      code: 'too_small',
      path: expected,
      minimum: 0.05,
      maximum: 1,
    });
    expect(JSON.stringify(diagnostics)).not.toContain(privateText);
    expect(JSON.stringify(diagnostics)).not.toContain('valid-but-private-node-id');
  });

  it('normalizes numeric min/max aliases without extracting values from arbitrary messages', () => {
    const diagnostics = cinematicQualityDiagnostics([
      {
        status: 'CONTRACT_INVALID',
        issues: [
          { code: 'too_big', path: 'coverage.interactions', min: 0, max: 24, message: privateText },
          {
            code: 'too_small',
            path: 'nodes.0.roughness',
            minimum: 0.05,
            min: 8,
            maximum: 1,
            max: 9,
          },
          { code: privateText, path: privateText, message: 'minimum=0 maximum=99 ' + privateText },
        ],
      },
    ]);
    expect(diagnostics.issues[0]).toMatchObject({ minimum: 0, maximum: 24 });
    expect(diagnostics.issues[1]).toMatchObject({ minimum: 0.05, maximum: 1 });
    expect(diagnostics.issues[2]).toMatchObject({ code: 'unclassified', path: '<field>' });
    expect(diagnostics.issues[2]).not.toHaveProperty('minimum');
    expect(diagnostics.issues[2]).not.toHaveProperty('maximum');
    expect(JSON.stringify(diagnostics)).not.toContain(privateText);
  });

  it.each([Infinity, -Infinity, NaN, privateText, '0.12', { value: privateText }])(
    'never coerces invalid measurement or schema limits %j into logged values',
    (value) => {
      const invalid = structuredClone(attempt);
      Object.assign(invalid.issues[0], {
        path: 'nodes.0.roughness',
        minimum: value,
        maximum: value,
      });
      Object.assign(invalid.interactionEvidence[0].diagnostics.mappings[0].tracks[0], {
        visibleThreshold: value,
        visibleWorldMagnitude: value,
        opacityEligibleSampleCount: value,
      });
      const diagnostics = cinematicQualityDiagnostics([invalid]);
      expect(diagnostics.issues[0]).not.toHaveProperty('minimum');
      expect(diagnostics.issues[0]).not.toHaveProperty('maximum');
      expect(diagnostics.tracks[0]).toMatchObject({
        visibleThreshold: null,
        visibleWorldMagnitude: null,
        opacityEligibleSampleCount: null,
      });
      expect(JSON.stringify(diagnostics)).not.toContain(privateText);
    },
  );

  it('preserves zero measurements rather than treating them as missing', () => {
    const zero = structuredClone(attempt);
    Object.assign(zero.interactionEvidence[0].diagnostics.mappings[0].tracks[0], {
      visibleThreshold: 0,
      visibleWorldMagnitude: 0,
      opacityEligibleSampleCount: 0,
    });
    expect(cinematicQualityDiagnostics([zero]).tracks[0]).toMatchObject({
      visibleThreshold: 0,
      visibleWorldMagnitude: 0,
      opacityEligibleSampleCount: 0,
    });
  });

  it('keeps the latest failed attempt details before earlier attempts exhaust all budgets', () => {
    const input = Array.from({ length: 3 }, (_, index) => ({
      ...attempt,
      issues: Array.from({ length: 24 }, () => ({
        code: index === 2 ? 'unsupported-asset-action' : 'geometry-overlap',
        severity: 'error',
      })),
      interactionEvidence: Array.from({ length: 24 }, (_, requirement) => ({
        ...attempt.interactionEvidence[0],
        description: `${privateText}-${requirement}`,
      })),
    }));
    const before = structuredClone(input);
    const diagnostics = cinematicQualityDiagnostics(input);
    expect(diagnostics.attempts.map((item) => item.attemptIndex)).toEqual([2, 1, 0]);
    expect(
      diagnostics.issues.every(
        (item) => item.attemptIndex === 2 && item.code === 'unsupported-asset-action',
      ),
    ).toBe(true);
    expect(diagnostics.interactions.every((item) => item.attemptIndex === 2)).toBe(true);
    expect(diagnostics.tracks[0].attemptIndex).toBe(2);
    expect(diagnostics.omittedIssues).toBe(48);
    expect(diagnostics.omittedInteractions).toBe(48);
    expect(diagnostics.omittedTracks).toBe(36);
    expect(input).toEqual(before);
  });

  it('does not let later success or syntax records evict the latest actual failure', () => {
    const diagnostics = cinematicQualityDiagnostics([
      attempt,
      ...Array.from({ length: 7 }, () => ({
        status: 'JSON_SYNTAX_REPAIRED',
        issues: [{ code: 'json-punctuation' }],
      })),
      { status: 'SEMANTIC_INVALID', issues: [{ code: 'semantic-unresolved' }] },
      { status: 'PASS', issues: [] },
    ]);
    expect(
      diagnostics.attempts.slice(0, 2).map((item) => [item.attemptIndex, item.status]),
    ).toEqual([
      [8, 'SEMANTIC_INVALID'],
      [0, 'FAIL'],
    ]);
    expect(diagnostics.issues[0]).toMatchObject({ attemptIndex: 8, code: 'semantic-unresolved' });
    expect(diagnostics.interactions[0].attemptIndex).toBe(0);
    expect(diagnostics.omittedAttempts).toBe(4);
    expect(diagnostics.omittedIssues).toBe(4);
  });

  it('prioritizes errors over warnings within the latest failed attempt', () => {
    const diagnostics = cinematicQualityDiagnostics([
      {
        status: 'FAIL',
        issues: [
          ...Array.from({ length: 24 }, () => ({ code: 'subject-too-small', severity: 'warning' })),
          { code: 'unsupported-asset-action', severity: 'error' },
        ],
      },
    ]);
    expect(diagnostics.issues[0]).toMatchObject({
      code: 'unsupported-asset-action',
      severity: 'error',
    });
    expect(diagnostics.issues).toHaveLength(24);
    expect(diagnostics.omittedIssues).toBe(1);
  });

  it('includes upstream omitted mappings, tracks and chapters instead of reporting zero', () => {
    const upstream = structuredClone(attempt);
    Object.assign(upstream, { omittedIssueCount: 3 });
    Object.assign(upstream.interactionEvidence[0].diagnostics, { omittedMappings: 2 });
    Object.assign(upstream.interactionEvidence[0].diagnostics.mappings[0], { omittedTracks: 4 });
    Object.assign(upstream.interactionEvidence[0].diagnostics.mappings[0].tracks[0], {
      omittedChapters: 2,
    });
    const diagnostics = cinematicQualityDiagnostics([upstream]);
    expect(diagnostics).toMatchObject({
      omittedIssues: 3,
      omittedInteractions: 2,
      omittedTracks: 4,
    });
    expect(diagnostics.interactions[0].omittedTracks).toBe(4);
    expect(diagnostics.tracks[0].omittedChapters).toBe(2);
  });

  it('combines output-budget omissions with all upstream omissions, even from unshown attempts', () => {
    const upstream = {
      ...attempt,
      omittedIssues: 2,
      interactionEvidence: Array.from({ length: 8 }, () => ({
        ...attempt.interactionEvidence[0],
        diagnostics: {
          omittedMappings: 1,
          mappings: [
            { ...attempt.interactionEvidence[0].diagnostics.mappings[0], omittedTracks: 4 },
          ],
        },
      })),
    };
    const diagnostics = cinematicQualityDiagnostics(Array.from({ length: 7 }, () => upstream));
    expect(diagnostics.attempts).toHaveLength(6);
    expect(diagnostics.omittedAttempts).toBe(1);
    expect(diagnostics.omittedIssues).toBe(7 * 3 - 6);
    expect(diagnostics.omittedInteractions).toBe(7 * 8 * 2 - 24);
    expect(diagnostics.omittedTracks).toBe(7 * 8 * 5 - 36);
  });

  it.each([-1, 1.5, Infinity, NaN, '4', privateText])(
    'ignores invalid upstream omitted counts %j',
    (value) => {
      const upstream = structuredClone(attempt);
      Object.assign(upstream, { omittedIssues: value });
      Object.assign(upstream.interactionEvidence[0].diagnostics, { omittedMappings: value });
      Object.assign(upstream.interactionEvidence[0].diagnostics.mappings[0], {
        omittedTracks: value,
      });
      Object.assign(upstream.interactionEvidence[0].diagnostics.mappings[0].tracks[0], {
        omittedChapters: value,
      });
      const diagnostics = cinematicQualityDiagnostics([upstream]);
      expect(diagnostics).toMatchObject({
        omittedIssues: 0,
        omittedInteractions: 0,
        omittedTracks: 0,
      });
      expect(diagnostics.tracks[0].omittedChapters).toBe(0);
      expect(JSON.stringify(diagnostics)).not.toContain(privateText);
    },
  );

  it('survives the production logger depth bound without leaking or truncating evidence', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      createLogger('CinematicDiagnosticTest').error('Failed', {
        cinematicQualityDiagnostics: cinematicQualityDiagnostics([attempt]),
      });
      const outputLine = String(output.mock.calls[0][0]);
      const line = outputLine.startsWith('{') ? JSON.parse(outputLine).message : outputLine;
      expect(line).toContain('"chapter":2');
      expect(line).toContain('"trackIndex":3');
      expect(line).toContain('"visibleThreshold":0.18');
      expect(line).toContain('"visibleWorldMagnitude":0.25');
      expect(line).toContain('"opacityEligibleSampleCount":3');
      expect(line).not.toContain('[Truncated]');
      expect(line).not.toContain(privateText);
    } finally {
      output.mockRestore();
    }
  });

  it('keeps schema limits and fully populated bounded evidence through the actual logger', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const diagnostics = cinematicQualityDiagnostics(
        Array.from({ length: 8 }, () => ({
          ...attempt,
          issues: Array.from({ length: 24 }, () => ({
            code: 'too_small',
            path: `nodes.${privateText}.roughness`,
            minimum: 0.05,
            maximum: 1,
            message: privateText,
          })),
          interactionEvidence: Array.from({ length: 24 }, () => attempt.interactionEvidence[0]),
        })),
      );
      createLogger('CinematicDiagnosticTest').error('Fixed failure summary', {
        cinematicQualityDiagnostics: diagnostics,
      });
      const line = String(output.mock.calls[0][0]);
      expect(line).toContain('minimum');
      expect(line).toContain('0.05');
      expect(line).not.toContain('[Truncated]');
      expect(line).not.toContain('[Circular]');
      expect(line).not.toContain(privateText);
    } finally {
      output.mockRestore();
    }
  });
});

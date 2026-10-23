import { describe, expect, it, vi } from 'vitest';
import { cinematicQualityDiagnostics } from '@/lib/cinematic/quality-diagnostics';
import { createLogger } from '@/lib/logger';

const privateText = 'PRIVATE_PROMPT_LABEL_PROVIDER_OR_NODE_ID';
const entry = {
  attempt: 1,
  semanticAttempt: 0,
  status: 'PATCH_FAILED',
  cause: {
    stage: 'semantic-patch',
    reason: 'missing-parent',
    patchIndex: 1,
    op: 'replace',
    path: `/nodes/@${privateText}/params/${privateText}/position`,
    segmentIndex: 3,
    reviewIssueCount: 1,
    patchCount: 2,
    unresolvedIssueCount: 1,
    prompt: privateText,
    label: privateText,
    nodeId: privateText,
    message: privateText,
    schemaIssues: [
      {
        code: 'too_small',
        path: ['nodes', privateText, 'roughness'],
        minimum: 0.05,
        message: privateText,
      },
    ],
  },
};

describe('typed failure causes remain bounded and private through the production logger', () => {
  it('retains only fixed schema reasons alongside sanitized paths', () => {
    const result = cinematicQualityDiagnostics([
      {
        status: 'SEMANTIC_INVALID',
        cause: {
          stage: 'semantic-patch',
          reason: 'schema-invalid',
          schemaIssues: [
            {
              code: 'custom',
              path: ['tracks', 2, 'keyframes', 1, 'at'],
              reason: 'track-time-invalid',
            },
            { code: 'custom', path: ['nodes', privateText, 'parent'], reason: privateText },
          ],
        },
      },
    ]);
    expect(result.causeIssues[0]).toMatchObject({
      path: 'tracks.2.keyframes.1.at',
      reason: 'track-time-invalid',
    });
    expect(result.causeIssues[1]).toMatchObject({
      path: 'nodes.<field>.parent',
      reason: 'unclassified',
    });
    expect(JSON.stringify(result)).not.toContain(privateText);
  });
  it('keeps only indexed protocol facts, not stable IDs or raw messages', () => {
    const before = structuredClone(entry),
      result = cinematicQualityDiagnostics([entry]);
    expect(result.causes[0]).toMatchObject({
      attemptIndex: 0,
      attempt: 1,
      semanticAttempt: 0,
      stage: 'semantic-patch',
      reason: 'missing-parent',
      patchIndex: 1,
      op: 'replace',
      path: '/nodes/<field>/params/<field>/position',
      segmentIndex: 3,
      patchCount: 2,
    });
    expect(result.causeIssues[0]).toEqual({
      attemptIndex: 0,
      code: 'too_small',
      path: 'nodes.<field>.roughness',
      minimum: 0.05,
    });
    expect(JSON.stringify(result)).not.toContain(privateText);
    expect(entry).toEqual(before);
  });

  it.each([
    ['/nodes/position/params/label', '/nodes/<field>/params/label'],
    ['/nodes/@position/params/label', '/nodes/<field>/params/label'],
    ['/tracks/2/keyframes/1/value/0', '/tracks/2/keyframes/1/value/0'],
    ['/nodes/@private~1id/params/private~0name', '/nodes/<field>/params/<field>'],
    ['missing-leading-slash', '<invalid-pointer>'],
    ['/nodes/@bad~2id/position', '<invalid-pointer>'],
    ['/' + 'x'.repeat(2100), '<invalid-pointer>'],
  ])('sanitizes pointer %s using the protocol, not a general ID regex', (path, expected) => {
    const result = cinematicQualityDiagnostics([{ ...entry, cause: { ...entry.cause, path } }]);
    expect(result.causes[0].path).toBe(expected);
  });

  it('rejects arbitrary stage/reason/op and invalid ordinals instead of logging them', () => {
    const result = cinematicQualityDiagnostics([
      {
        ...entry,
        attempt: -1,
        semanticAttempt: Infinity,
        cause: {
          ...entry.cause,
          stage: privateText,
          reason: privateText,
          op: privateText,
          patchIndex: -1,
          segmentIndex: NaN,
          patchCount: privateText,
        },
      },
    ]);
    expect(result.causes[0]).toMatchObject({
      stage: 'unclassified',
      reason: 'unclassified',
      op: 'unclassified',
      attempt: null,
      semanticAttempt: null,
      patchIndex: null,
      segmentIndex: null,
      patchCount: null,
    });
    expect(JSON.stringify(result)).not.toContain(privateText);
  });

  it('caps cause and schema detail separately with accurate omission counts', () => {
    const input = Array.from({ length: 20 }, () => ({
      ...entry,
      cause: {
        ...entry.cause,
        schemaIssues: Array(20).fill(entry.cause.schemaIssues[0]),
        omittedSchemaIssues: 2,
      },
    }));
    const result = cinematicQualityDiagnostics(input);
    expect(result.causes).toHaveLength(12);
    expect(result.omittedCauses).toBe(8);
    expect(result.causeIssues).toHaveLength(24);
    expect(result.omittedCauseIssues).toBe(416);
    expect(result.causes[0].attemptIndex).toBe(19);
    expect(JSON.stringify(result).length).toBeLessThan(18000);
  });

  it('keeps typed facts through the actual logger without truncation, circular references or original text', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      createLogger('CinematicCauseTest').error('Fixed failure summary', {
        cinematicQualityDiagnostics: cinematicQualityDiagnostics(Array(20).fill(entry)),
      });
      const line = String(output.mock.calls[0][0]);
      for (const value of [
        'semantic-patch',
        'missing-parent',
        'patchIndex',
        'segmentIndex',
        'roughness',
        '0.05',
      ])
        expect(line).toContain(value);
      for (const value of [privateText, '[Truncated]', '[Circular]'])
        expect(line).not.toContain(value);
    } finally {
      output.mockRestore();
    }
  });
});

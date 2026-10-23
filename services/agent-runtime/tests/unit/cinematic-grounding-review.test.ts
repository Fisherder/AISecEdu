import { describe, expect, it } from 'vitest';
import { parseStagedCinematicGroundingReview } from '@/lib/server/cinematic-generation';

const requirements = [{index: 0, source: 'original', text: '三台转子必须同时可见。'}];

describe('staged cinematic grounding review', () => {
  it('requires complete source checks even when the reviewer reports no issues', () => {
    expect(() => parseStagedCinematicGroundingReview(requirements, {
      issues: [],
      observations: ['当前场景没有阻断问题。'],
      patches: [],
    })).toThrow();
  });

  it('accepts the complete read-only review contract', () => {
    expect(parseStagedCinematicGroundingReview(requirements, {
      issues: [],
      observations: ['三台转子在建立镜头中同框。'],
      sourceChecks: [{
        index: 0,
        quote: '三台转子必须同时可见。',
        fulfilled: true,
        evidence: 'browserFrames 的建立镜头包含三台独立转子。',
      }],
      patches: [],
    })).toMatchObject({issues: [], sourceChecks: [{fulfilled: true}]});
  });
});

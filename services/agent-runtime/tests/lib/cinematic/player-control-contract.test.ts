import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import {
  checkCinematicQuality,
  type CinematicInteractionRequirement,
} from '@/lib/cinematic/quality';
import { parseCinematicScene } from '@/lib/cinematic/schema';
import {
  cinematicPlayerControlNames,
  cinematicPlayerControlIds,
} from '@/lib/cinematic/player-controls';
import { assemblySceneFixture } from '../../fixtures/cinematic-assembly';

const description = '播放、暂停、单步和回拖时间轴';
const requirement: CinematicInteractionRequirement = {
  description,
  kind: 'player-control',
  controls: ['play', 'pause', 'step', 'seek'],
};
const fixture = () => {
  const scene = resolveCinematicAssembly(assemblySceneFixture()).scene;
  scene.coverage!.interactions.push({
    description,
    chapter: 0,
    targets: ['hero'],
    properties: ['controls'],
    controls: ['play', 'pause', 'step', 'seek'],
  });
  return scene;
};

describe('built-in player controls are distinct from model actions', () => {
  it('accepts actual controls without requiring unrelated geometry tracks for playback', () => {
    const scene = fixture();
    const report = checkCinematicQuality(parseCinematicScene(scene), {
      interactionRequirements: [requirement],
    });
    expect(report.status).toBe('PASS');
    expect(report.interactionEvidence.find((item) => item.description === description)).toEqual({
      description,
      kind: 'player-control',
      status: 'PASS',
      chapter: 0,
      tracks: [],
      connections: [],
      controls: ['play', 'pause', 'step', 'seek'],
    });
    expect(report.runtimeValidation).toBe('REQUIRED');
    expect(report.visualReview).toBe('NOT_PERFORMED');
  });

  it.each(['view', 'structural-change', 'state-change', 'transport'] as const)(
    'cannot use playback controls as %s evidence',
    (kind) => {
      const report = checkCinematicQuality(fixture(), {
        interactionRequirements: [{ description, kind }],
      });
      expect(
        report.issues.some((issue) => issue.code === 'request-interaction-kind-mismatch'),
      ).toBe(true);
    },
  );

  it('rejects missing, incomplete and untyped control mappings', () => {
    const scene = fixture();
    scene.coverage!.interactions.at(-1)!.controls = ['play'];
    expect(checkCinematicQuality(scene, { interactionRequirements: [requirement] }).status).toBe(
      'FAIL',
    );
    expect(
      checkCinematicQuality(fixture(), {
        interactionRequirements: [{ description, kind: 'player-control' }],
      }).status,
    ).toBe('FAIL');
    expect(
      checkCinematicQuality(fixture()).issues.some(
        (issue) => issue.code === 'request-interaction-empty',
      ),
    ).toBe(true);
  });

  it('does not count the presence of playback controls as a teaching process', () => {
    const scene = fixture();
    scene.tracks.forEach((track) => {
      track.property = 'emissive';
      track.keyframes = [
        { at: 0, value: 0 },
        { at: 60, value: 2 },
      ];
    });
    scene.coverage!.interactions = [scene.coverage!.interactions.at(-1)!];
    scene.chapters.forEach((chapter) => {
      chapter.kind = 'inspection';
    });
    const report = checkCinematicQuality(parseCinematicScene(scene), {
      interactionRequirements: [requirement],
    });
    expect(report.interactionEvidence[0].status).toBe('PASS');
    expect(report.issues.some((issue) => issue.code === 'motion-only-rotation')).toBe(true);
    expect(report.status).toBe('FAIL');
  });

  it('rejects invented controls, mixed model actions, duplicates and missing declarations', () => {
    for (const change of [
      { controls: ['valve-open'] },
      { properties: ['controls', 'explode'] },
      { controls: ['play', 'play'] },
      { controls: undefined },
      { properties: ['explore'] },
    ]) {
      const scene = fixture();
      Object.assign(scene.coverage!.interactions.at(-1)!, change);
      expect(() => parseCinematicScene(scene)).toThrow();
    }
  });

  it('ties every control name to a real compiled UI element and player handler', () => {
    const html = compileCinematicScene(fixture());
    const source = readFileSync('lib/cinematic/player.js', 'utf8');
    for (const name of cinematicPlayerControlNames) {
      const id = cinematicPlayerControlIds[name];
      expect(html).toContain(`id="${id}"`);
      expect(source).toContain(id);
    }
    expect(cinematicPlayerControlNames).not.toContain('explode');
    expect(cinematicPlayerControlNames).not.toContain('opening');
  });
});

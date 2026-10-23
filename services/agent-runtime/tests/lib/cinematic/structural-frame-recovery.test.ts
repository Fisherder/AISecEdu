import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {checkCinematicQuality} from '@/lib/cinematic/quality';
import {recoverCinematicStructuralFrames} from '@/lib/cinematic/structural-frame-recovery';
import {recoverCinematicTinySubjects} from '@/lib/cinematic/camera-recovery';
import type {CinematicRenderInspection} from '@/lib/cinematic/render-client';
import type {CinematicScene} from '@/lib/cinematic/schema';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/stuxnet-missing-shots.json'), 'utf8')) as {
  scene: CinematicScene;
  options: Parameters<typeof checkCinematicQuality>[1];
};

describe('cinematic structural framing recovery', () => {
  it('frames the visible breakage targets and final summary in a failed Stuxnet scene', () => {
    const baseline = checkCinematicQuality(fixture.scene, fixture.options);
    expect(baseline.issues.filter(issue => issue.severity === 'error').map(issue => issue.code))
      .toEqual(['request-interaction-kind-mismatch', 'chapter-observation-without-evidence']);
    const recovered = recoverCinematicStructuralFrames(fixture.scene, baseline, fixture.options);
    expect(recovered.changedShots).toEqual([58, 78]);
    expect(recovered.quality.status).toBe('PASS');
    expect(recovered.quality.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(fixture.scene.shots.some(shot => shot.at === 58 || shot.at === 78)).toBe(false);
  });

  it('crops distant rotor pairs into separate evidence shots without changing geometry', async () => {
    const baseline = checkCinematicQuality(fixture.scene, fixture.options);
    const framed = recoverCinematicStructuralFrames(fixture.scene, baseline, fixture.options).scene;
    const inspection = {issues: [
      {code: 'tiny-subject', message: 'small', nodes: ['rotor_a','rotor_c'], at: 72},
      {code: 'tiny-subject', message: 'small', nodes: ['rotor_b','rotor_a'], at: 74},
      {code: 'tiny-subject', message: 'small', nodes: ['rotor_b','rotor_a'], at: 75},
    ], evidence: {}} as unknown as CinematicRenderInspection;
    const recovered = await recoverCinematicTinySubjects(framed, inspection,
      async () => ({...inspection, issues: []}), fixture.options);
    expect(recovered.changedShots).toEqual([72,74]);
    expect(recovered.scene.shots.find(shot => shot.at === 72)?.frame?.region?.center[0]).toBeLessThan(0);
    expect(recovered.scene.shots.find(shot => shot.at === 72)?.frame?.region?.size[0]).toBeLessThan(.5);
    expect(recovered.scene.shots.find(shot => shot.at === 74)?.frame?.region?.center[0]).toBeGreaterThan(0);
    expect(checkCinematicQuality(recovered.scene, fixture.options).status).toBe('PASS');
    expect(framed.shots.find(shot => shot.at === 72)?.frame?.region?.size[0]).toBe(.6);
  });
});

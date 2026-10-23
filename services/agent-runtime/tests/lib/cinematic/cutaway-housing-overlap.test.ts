import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {checkCinematicQuality} from '@/lib/cinematic/quality';
import type {CinematicScene} from '@/lib/cinematic/schema';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/valve-cutaway-overlap.json'), 'utf8')) as {
  scene: CinematicScene;
  options: Parameters<typeof checkCinematicQuality>[1];
};

describe('cutaway housing overlap', () => {
  it('keeps the moving gate inside a translucent cutaway as a browser-check warning', () => {
    const report = checkCinematicQuality(fixture.scene, fixture.options);
    expect(report.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: 'geometry-overlap', severity: 'warning',
        nodes: ['valve-gate', 'body-shell']}),
    ]));
  });

  it('still blocks an opaque housing intersecting the gate', () => {
    const scene = structuredClone(fixture.scene);
    scene.nodes.find(node => node.id === 'body-shell')!.opacity = 1;
    expect(checkCinematicQuality(scene, fixture.options).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: 'geometry-overlap', severity: 'error',
        nodes: ['valve-gate', 'body-shell']}),
    ]));
  });
});

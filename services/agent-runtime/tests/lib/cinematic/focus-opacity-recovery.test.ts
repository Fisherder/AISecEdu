import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {worldNodes} from '@/lib/cinematic/assembly';
import {recoverCinematicFocusOpacity} from '@/lib/cinematic/focus-opacity-recovery';
import {checkCinematicQuality} from '@/lib/cinematic/quality';
import {parseCinematicScene} from '@/lib/cinematic/schema';

const fixture = () => parseCinematicScene(JSON.parse(readFileSync(
  new URL('./fixtures/stuxnet-focus-opacity.json', import.meta.url), 'utf8')));

describe('fading damage chapter focus', () => {
  it('keeps the real centrifuge rotor visible during emergency stop without changing its motion', () => {
    const before = fixture();
    const quality = checkCinematicQuality(before);
    expect(quality.issues).toContainEqual(expect.objectContaining({
      code: 'chapter-focus-invisible', severity: 'error', at: 72,
    }));
    const recovered = recoverCinematicFocusOpacity(before, quality);
    expect(recovered.changedNodes).toContain('rotor_c');
    expect(recovered.changedNodes).toContain('machine_c');
    expect(recovered.quality.issues).not.toContainEqual(expect.objectContaining({
      code: 'chapter-focus-invisible', severity: 'error', at: 72,
    }));
    expect(worldNodes(recovered.scene, 76).get('rotor_c')!.opacity).toBeGreaterThanOrEqual(0.12);
    expect(recovered.scene.tracks.filter(track => track.property !== 'opacity'))
      .toEqual(before.tracks.filter(track => track.property !== 'opacity'));
    expect(before.nodes).toEqual(recovered.scene.nodes);
  });
});

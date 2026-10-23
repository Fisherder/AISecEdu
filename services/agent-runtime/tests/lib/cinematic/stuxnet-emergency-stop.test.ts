import { describe, expect, it } from 'vitest';
import { cinematicHardwareGeometryIssues, normalizeCinematicHardware } from '../../../lib/cinematic/hardware-geometry';
import { parseCinematicScene } from '../../../lib/cinematic/schema';
import generatedScene from './fixtures/stuxnet-stop-acceleration.json';

describe('generated Stuxnet emergency stop', () => {
  it('repairs the real accelerating stop segment and remains stable on a second pass', () => {
    const scene = parseCinematicScene(generatedScene);
    expect(cinematicHardwareGeometryIssues(scene).map(issue => issue.code))
      .toContain('hardware-emergency-stop-motion-missing');

    const first = normalizeCinematicHardware(scene);
    expect(first.adjustments).toEqual(expect.arrayContaining([
      'rotor_a-emergency-keyframe', 'rotor_b-emergency-keyframe', 'rotor_c-emergency-keyframe',
    ]));
    expect(cinematicHardwareGeometryIssues(first.scene).map(issue => issue.code))
      .not.toContain('hardware-emergency-stop-motion-missing');
    for (const id of ['hmi_pointer', 'phys_pointer', 'obs_pointer']) {
      const pointer = first.scene.nodes.find(node => node.id === id)!;
      expect(pointer.position[1]).toBe(.42);
      expect(pointer.position[2]).toBeGreaterThan(1);
      expect(first.adjustments).toContain(`${id}-display-port`);
    }

    for (const id of ['rotor_a', 'rotor_b', 'rotor_c']) {
      const track = first.scene.tracks.find(item => item.target === id && item.property === 'rotation')!;
      const stop = track.keyframes.findIndex(frame => frame.at === 70);
      const speed = (a: typeof track.keyframes[number], b: typeof track.keyframes[number]) =>
        Math.abs(((b.value as number[])[1] - (a.value as number[])[1]) / (b.at - a.at));
      const incoming = speed(track.keyframes[stop - 1], track.keyframes[stop]);
      const outgoing = speed(track.keyframes[stop], track.keyframes[stop + 1]);
      expect(outgoing).toBeLessThan(incoming * .85);
      expect(speed(track.keyframes.at(-2)!, track.keyframes.at(-1)!)).toBe(0);
    }

    const second = normalizeCinematicHardware(first.scene);
    for (const id of ['hmi_pointer', 'phys_pointer', 'obs_pointer'])
      expect(second.adjustments).not.toContain(`${id}-display-port`);
    const rotorTracks = (scene: typeof first.scene) => scene.tracks.filter(item =>
      item.property === 'rotation' && ['rotor_a', 'rotor_b', 'rotor_c'].includes(item.target));
    expect(rotorTracks(second.scene)).toEqual(rotorTracks(first.scene));
  });
});

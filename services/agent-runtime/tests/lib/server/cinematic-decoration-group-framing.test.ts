import { describe, expect, it } from 'vitest';
import { parseCinematicCandidate } from '@/lib/server/cinematic-generation';
import { sceneFixture } from '../../fixtures/cinematic';

function groupedScene() {
  const scene = sceneFixture();
  const base = scene.nodes[2];
  scene.nodes.unshift(
    { ...base, id: 'outer', kind: 'group', role: 'decoration' },
    { ...base, id: 'inner', kind: 'group', role: 'decoration', parent: 'outer' },
  );
  Object.assign(scene.nodes.find((node) => node.id === 'hero')!, {
    parent: 'inner',
    role: 'primary',
  });
  scene.nodes.push(
    { ...base, id: 'logic-actor', role: 'logic', parent: 'outer' },
    { ...base, id: 'floor', kind: 'plane', role: 'support', parent: 'inner' },
    { ...base, id: 'particles', kind: 'points', role: 'logic', parent: 'inner' },
    { ...base, id: 'ornament', role: 'decoration', parent: 'outer' },
    {
      ...scene.nodes.find((node) => node.id === 'bank')!,
      id: 'decorative-model',
      role: 'decoration',
      parent: 'inner',
    },
  );
  scene.shots.forEach((shot) => {
    shot.frame = { nodes: ['outer'], padding: 1.2 };
  });
  return scene;
}

describe('decorative group containers retain real framing subjects', () => {
  it('recurses through nested decorative groups and excludes only non-teaching leaves', () => {
    const scene = groupedScene();
    const before = structuredClone(scene);
    const result = parseCinematicCandidate(scene);

    expect(
      result.shots.every(
        (shot) => JSON.stringify(shot.frame?.nodes) === JSON.stringify(['hero', 'logic-actor']),
      ),
    ).toBe(true);
    expect(result.nodes).toEqual(before.nodes);
    expect(result.tracks).toEqual(before.tracks);
    expect(result.chapters).toEqual(before.chapters);
    expect(scene).toEqual(before);
    expect(result.nodes.find((node) => node.id === 'hero')).toMatchObject({
      kind: 'model',
      model: 'processor',
      role: 'primary',
      parent: 'inner',
    });
  });

  it('deduplicates real actors referenced both directly and through nested groups', () => {
    const scene = groupedScene();
    scene.shots[0].frame!.nodes = ['outer', 'inner', 'hero'];
    expect(parseCinematicCandidate(scene).shots[0].frame!.nodes).toEqual(['hero', 'logic-actor']);
  });

  it('rejects nested groups containing only planes, points and decorative leaves', () => {
    const scene = groupedScene();
    delete scene.nodes.find((node) => node.id === 'hero')!.parent;
    scene.nodes.find((node) => node.id === 'logic-actor')!.role = 'decoration';
    expect(() => parseCinematicCandidate(scene)).toThrow('group outer 没有可取景的实际教学实体');
  });

  it.each(['floor', 'particles', 'ornament', 'decorative-model'])(
    'still rejects direct framing of non-teaching leaf %s',
    (id) => {
      const scene = groupedScene();
      scene.shots[0].frame!.nodes = [id];
      expect(() => parseCinematicCandidate(scene)).toThrow(`取景主体 ${id} 必须是具体教学实体`);
    },
  );

  it('detects cycles through decorative groups instead of skipping the subtree', () => {
    const scene = groupedScene();
    scene.nodes.find((node) => node.id === 'outer')!.parent = 'inner';
    expect(() => parseCinematicCandidate(scene)).toThrow('frame group层级循环：outer');
  });

  it.each([12, 13])('keeps the twelve-subject limit for %i real descendants', (count) => {
    const scene = groupedScene();
    const actor = scene.nodes.find((node) => node.id === 'logic-actor')!;
    for (let index = 2; index < count; index++) {
      scene.nodes.push({ ...actor, id: 'extra-' + index, parent: 'inner' });
    }
    if (count === 12) {
      const result = parseCinematicCandidate(scene);
      expect(result.shots[0].frame!.nodes).toHaveLength(12);
      expect(result.shots[0].frame!.nodes).toContain('hero');
      expect(result.shots[0].frame!.nodes).toContain('extra-11');
    } else {
      expect(() => parseCinematicCandidate(scene)).toThrow('group展开后超过12个主体');
    }
  });
});

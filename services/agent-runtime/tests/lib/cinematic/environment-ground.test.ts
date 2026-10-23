import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import threeSource from '../../../public/vendor/three-r150.min.js?raw';

const player = readFileSync('lib/cinematic/player.js', 'utf8');
const functions = ['visibleBounds', 'positionEnvironmentGround', 'isSceneVisible']
  .map((name) => {
    const start = player.indexOf(`  function ${name}(`);
    const next = player.indexOf('\n  function ', start + 1);
    return player.slice(start, next);
  })
  .join('\n');

function run(setup: string, after = '') {
  const context = createContext({});
  new Script(threeSource).runInContext(context, { timeout: 5000 });
  return new Script(`
    const T=THREE,nodes=new Map(),world=new T.Scene(),environmentGround=new T.Group();
    function box(id,y,role='support') {
      const mesh=new T.Mesh(new T.BoxGeometry(16,.4,10),new T.MeshStandardMaterial());
      mesh.position.y=y;mesh.userData.spec={id,kind:'box',role};nodes.set(id,mesh);world.add(mesh);return mesh;
    }
    ${functions}
    ${setup}
    world.updateMatrixWorld(true);positionEnvironmentGround();
    const initial=environmentGround.position.y;
    ${after}
    ({initial,final:environmentGround.position.y,positioned:environmentGround.userData.positioned});
  `).runInContext(context, { timeout: 5000 }) as {
    initial: number;
    final: number;
    positioned: boolean;
  };
}

describe('environment ground never buries the assembled base', () => {
  it('puts ground and its raised grid/rings below a base authored under the old floor', () => {
    const result = run("box('base',-2.4)");
    expect(result.initial).toBeCloseTo(-2.64, 6);
    expect(result.initial + 0.03).toBeLessThan(-2.6);
    expect(result.positioned).toBe(true);
    expect(player).toContain('environmentGround.add(grid)');
    expect(player).toContain('environmentGround.add(ring)');
  });

  it('uses actual transformed geometry, including the parent scale and translation', () => {
    const result = run(`
      const base=box('base',0),parent=new T.Group();world.add(parent);parent.add(base);
      parent.position.y=-4;parent.scale.y=2;
    `);
    expect(result.initial).toBeCloseTo(-4.44, 6);
  });

  it('includes transformed instance bounds instead of the empty mesh origin', () => {
    const result = run(`
      const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial(),2);
      mesh.userData.spec={id:'supports',kind:'model',role:'support'};
      mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(0,-4,0));
      mesh.setMatrixAt(1,new T.Matrix4().makeTranslation(0,-6,0));
      nodes.set('supports',mesh);world.add(mesh);
    `);
    expect(result.initial).toBeCloseTo(-6.54, 6);
  });

  it('ignores hidden, transparent, decoration and logical overlays below the scene', () => {
    const result = run(`
      box('base',-2.4);
      box('hidden',-20).visible=false;
      box('faded',-30).userData.sceneOpacity=0;
      box('transparent',-40).material.opacity=0;
      box('decoration',-50,'decoration');
      box('logic',-60,'logic');
    `);
    expect(result.initial).toBeCloseTo(-2.64, 6);
  });

  it('retains the existing default for scenes already above the floor and empty scenes', () => {
    expect(run("box('base',0)").initial).toBe(-2.1);
    expect(run('').initial).toBe(-2.1);
  });

  it('sets ground after initial scene transforms and keeps it fixed during subsequent motion', () => {
    const result = run(
      "box('base',-2.4)",
      `
      nodes.get('base').position.y=-8;world.updateMatrixWorld(true);positionEnvironmentGround();
    `,
    );
    expect(result.final).toBe(result.initial);
    const animation = player.slice(
      player.indexOf('  function animateWorld(){'),
      player.indexOf('  function resize('),
    );
    expect(animation.indexOf('positionEnvironmentGround();')).toBeGreaterThan(
      animation.indexOf('world.updateMatrixWorld(true)'),
    );
  });
});

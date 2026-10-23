import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { assetCatalog } from '../../../lib/cinematic/asset-catalog';
const runtime = createContext({ console: { warn() {} } });
runInContext(readFileSync('public/vendor/three-r150.min.js', 'utf8'), runtime);
runInContext(readFileSync('lib/cinematic/models.js', 'utf8'), runtime);
const { THREE: T, CinematicModels: models } = runtime;
function snapshot(root: any) {
  const result: any[] = [];
  root.traverse((object: any) => {
    if (object.isMesh) result.push({ object, data: Array.from(object.isInstancedMesh ? object.instanceMatrix.array : object.geometry.attributes.position.array) as number[] });
  });
  return result;
}
describe('bounded reversible molecular deformation', () => {
  it.each([0.25, 0.5, 0.75])('opens only the requested region at center %s and restores exact geometry', (center) => {
    const span = 0.3;
    const root = models.create(T, { model: 'dna', params: { speed: 0, separation: 'local', separationCenter: center, separationSpan: span } });
    root.userData.update(0, 0);
    const initial = snapshot(root);
    root.userData.update(0, 1);
    let changedInside = 0, fixedOutside = 0;
    for (const { object, data } of initial) {
      if (!object.isInstancedMesh) continue;
      for (let i = 0; i < object.count; i++) {
        const base = i * 16, fraction = data[base + 13] / 3.9 + 0.5;
        const current = Array.from(object.instanceMatrix.array.slice(base, base + 16)) as number[];
        if (Math.abs(fraction - center) >= span / 2) {
          expect(current).toEqual(data.slice(base, base + 16)); fixedOutside++;
        } else {
          expect(Math.hypot(current[12] - data[base + 12], current[14] - data[base + 14]), JSON.stringify({i,base,fraction,current,dataLength:data.length,closed:data.slice(base,base+16)})).toBeGreaterThan(0.001); changedInside++;
          expect(current.slice(0, 12)).toEqual(data.slice(base, base + 12));
          expect(current[13]).toBe(data[base + 13]);
        }
      }
    }
    expect(changedInside).toBeGreaterThan(20); expect(fixedOutside).toBeGreaterThan(changedInside);
    const declared = root.userData.expandedBounds;
    const point = new T.Vector3(), instance = new T.Matrix4(), world = new T.Matrix4();
    for (const amount of [0.25, 0.5, 0.75, 1]) {
      root.userData.update(0, amount);
      root.traverse((object: any) => {
        if (!object.isMesh) return;
        for (let i = 0; i < (object.isInstancedMesh ? object.count : 1); i++) {
          if (object.isInstancedMesh) { object.getMatrixAt(i, instance); world.multiplyMatrices(object.matrixWorld, instance); }
          else world.copy(object.matrixWorld);
          for (let v = 0; v < object.geometry.attributes.position.count; v++) {
            point.fromBufferAttribute(object.geometry.attributes.position, v).applyMatrix4(world);
            for (let axis = 0; axis < 3; axis++) {
              const value = point.getComponent(axis);
              if (value < declared.min[axis] - 1e-5 || value > declared.max[axis] + 1e-5) throw new Error('Deformation escaped its framing envelope');
            }
          }
        }
      });
    }
    root.userData.update(0, 0);
    expect(snapshot(root).map(x => x.data)).toEqual(initial.map(x => x.data));
    root.userData.dispose();
  });
  it('advertises the selected behavior without changing existing whole-strand scenes', () => {
    const original = assetCatalog('dna'), local = assetCatalog('dna', { separation: 'local', speed: 0 });
    expect(original.params.separation).toBe('whole');
    expect(local.supportsExplode).toBe(true);
    expect(local.explodeParts).toEqual(['sugar-phosphate-strand-a', 'sugar-phosphate-strand-b']);
    expect(local.actionHints.find(h => h.property === 'explode')?.description).toContain('outside stays paired');
    expect(original.actionHints.find(h => h.property === 'explode')?.description).toContain('global separation');
  });
});

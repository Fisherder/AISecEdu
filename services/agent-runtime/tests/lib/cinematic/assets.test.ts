import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { assetCatalog } from '../../../lib/cinematic/asset-catalog';
import { assetDefinition, cinematicAssetKinds } from '../../../lib/cinematic/asset-definitions';

const runtime = createContext({ console: { warn() {} } });
runInContext(readFileSync(resolve('public/vendor/three-r150.min.js'), 'utf8'), runtime);
runInContext(readFileSync(resolve('lib/cinematic/models.js'), 'utf8'), runtime);
const T = runtime.THREE,
  models = runtime.CinematicModels;

function visitVertices(root: any, consume: (position: any) => void) {
  root.updateMatrixWorld(true);
  const point = new T.Vector3(),
    instance = new T.Matrix4(),
    world = new T.Matrix4();
  root.traverse((mesh: any) => {
    if (!mesh.isMesh) return;
    const attribute = mesh.geometry.attributes.position;
    for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(i, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
      } else world.copy(mesh.matrixWorld);
      for (let v = 0; v < attribute.count; v++)
        consume(point.fromBufferAttribute(attribute, v).applyMatrix4(world));
    }
  });
}

function measuredBounds(root: any) {
  const result = new T.Box3();
  visitVertices(root, (point) => result.expandByPoint(point));
  return result;
}

describe('cinematic asset geometry and catalog', () => {
  it('keeps browser-safe parameter definitions identical to the runtime for all 14 kinds', () => {
    expect([...models.kinds]).toEqual(cinematicAssetKinds);
    for (const kind of cinematicAssetKinds) {
      expect(JSON.parse(JSON.stringify(models.definition(kind)))).toEqual(assetDefinition(kind));
      const entry = assetCatalog(kind);
      expect(entry.parameters).toEqual(assetDefinition(kind).parameters);
      expect(entry.params.detail).toBe(2);
      expect(entry.coordinateSpace).toBe('normalized-root');
    }
    const source = readFileSync(resolve('lib/cinematic/asset-definitions.ts'), 'utf8');
    expect(source).not.toMatch(/node:|asset-catalog|models\.js|schema/);
  });

  it.each(cinematicAssetKinds)(
    '%s has measured normalized geometry, valid default ports and bounded cost',
    (kind) => {
      const root = models.create(T, { model: kind, metadataOnly: true });
      const entry = assetCatalog(kind);
      const measured = measuredBounds(root);
      const tolerance = 2e-6;
      for (let axis = 0; axis < 3; axis++) {
        expect(measured.min.getComponent(axis)).toBeGreaterThanOrEqual(
          entry.bounds.min[axis] - tolerance,
        );
        expect(measured.max.getComponent(axis)).toBeLessThanOrEqual(
          entry.bounds.max[axis] + tolerance,
        );
        expect(entry.bounds.min[axis] + entry.bounds.max[axis]).toBeCloseTo(0, 6);
      }
      expect(entry.floor).toBe(entry.bounds.min[1]);
      let radius = 0;
      visitVertices(root, (point) => {
        radius = Math.max(radius, point.length());
      });
      expect(radius).toBeLessThanOrEqual(2.150002);
      expect(radius).toBeGreaterThan(2.13);
      expect(JSON.parse(JSON.stringify(root.userData.ports))).toEqual(entry.ports);
      for (const port of Object.values(entry.ports)) {
        expect(Math.hypot(...port.normal)).toBeCloseTo(1, 7);
        expect([...port.position, ...port.normal].every(Number.isFinite)).toBe(true);
        expect(typeof port.dynamic).toBe('boolean');
      }
      expect(entry.cost.triangles).toBeGreaterThan(1000);
      expect(entry.cost.drawCalls).toBeLessThan(100);
      expect(entry.cost.geometryBytes).toBeLessThan(4 * 1024 * 1024);
      root.userData.dispose();
    },
  );

  it.each(cinematicAssetKinds)(
    '%s swept envelope contains actual vertices for multiple times and explode states',
    (kind) => {
      const root = models.create(T, { model: kind, params: { detail: 1 }, metadataOnly: true });
      const declared = root.userData.expandedBounds;
      const bounds = new T.Box3(
        new T.Vector3().fromArray(declared.min),
        new T.Vector3().fromArray(declared.max),
      ).expandByScalar(2e-6);
      const states = [
        [0, 0],
        [0, 1],
        [1.37, 0.3],
        [6.21, 0.75],
        [23.9, 1],
        [61.7, 0.45],
        [-12.41, 1],
      ];
      for (const [time, explode] of states) {
        root.userData.update(time, explode);
        const actual = measuredBounds(root);
        expect(
          bounds.containsBox(actual),
          `${kind} time=${time} explode=${explode}: ${JSON.stringify({ declared, actual })}`,
        ).toBe(true);
      }
      root.userData.dispose();
    },
  );

  it.each(['valve', 'pipe-assembly'] as const)(
    '%s fluid ports coincide with actual flange face centers and remain fixed during separation',
    (kind) => {
      const root = models.create(T, { model: kind });
      const initial = structuredClone(root.userData.ports);
      for (const id of ['inlet', 'outlet']) {
        const flange = root.getObjectByName(`${id}-flange`);
        const face = flange.children.find((child: any) => child.isMesh && !child.isInstancedMesh);
        face.geometry.computeBoundingBox();
        const localFace = new T.Vector3(0, face.geometry.boundingBox.max.y, 0);
        const expected = localFace.applyMatrix4(face.matrixWorld);
        const actual = new T.Vector3().fromArray(initial[id].position);
        expect(actual.distanceTo(expected)).toBeLessThan(2e-6);
        const normal = new T.Vector3(0, 1, 0).transformDirection(face.matrixWorld);
        expect(normal.distanceTo(new T.Vector3().fromArray(initial[id].normal))).toBeLessThan(2e-6);
      }
      root.position.set(3, 2, -7);
      root.rotation.set(0.5, 0.8, 0.2);
      root.scale.set(2, 0.75, 1.3);
      root.userData.update(8, 1);
      for (const id of ['inlet', 'outlet']) {
        expect(root.userData.ports[id].dynamic).toBe(false);
        for (let axis = 0; axis < 3; axis++) {
          expect(root.userData.ports[id].position[axis]).toBeCloseTo(initial[id].position[axis], 7);
          expect(root.userData.ports[id].normal[axis]).toBeCloseTo(initial[id].normal[axis], 7);
        }
      }
      root.userData.dispose();
    },
  );

  it('circuit sockets agree with the pin and slot geometry, and mounting feet define floor', () => {
    const root = models.create(T, { model: 'circuit-board' });
    const data = root.userData,
      fixed = root.getObjectByName('pcb-and-fixed-sockets');
    const pins = fixed.children.find((child: any) => child.isInstancedMesh && child.count === 81);
    const matrix = new T.Matrix4();
    pins.getMatrixAt(40, matrix);
    const top = new T.Vector3(0, pins.geometry.parameters.height / 2, 0)
      .applyMatrix4(matrix)
      .applyMatrix4(pins.matrixWorld);
    expect(
      top.distanceTo(new T.Vector3().fromArray(data.ports['cpu-socket'].position)),
    ).toBeLessThan(2e-6);
    for (const [id, port] of Object.entries(data.ports) as Array<[string, any]>) {
      expect(port.dynamic).toBe(false);
      if (id.startsWith('mount-')) expect(port.position[1]).toBeCloseTo(data.floor, 6);
    }
    expect(fixed.children.some((child: any) => child.isInstancedMesh && child.count > 80)).toBe(
      true,
    );
    root.userData.dispose();
  });

  it('logical slots follow their actual separated layers while base ports remain fixed', () => {
    const root = models.create(T, {
      model: 'logic-stack',
      params: { layers: 3, rows: 2, columns: 5 },
    });
    const before = structuredClone(root.userData.ports);
    expect(Object.keys(before).filter((id) => id.includes('-cell-'))).toHaveLength(30);
    root.userData.update(4, 1);
    for (const [id, port] of Object.entries(root.userData.ports) as Array<[string, any]>) {
      if (id.startsWith('layer-')) {
        expect(port.dynamic).toBe(true);
        expect(port.position[1]).toBeGreaterThan(before[id].position[1]);
      } else expect(port).toEqual(before[id]);
    }
    expect(assetDefinition('logic-stack').representation).toContain('not physical RAM');
    root.userData.dispose();
  });

  it.each([0.08, 0.14, 0.24])(
    'pipe supports physically meet their base, cross member and clamp at radius %s',
    (radius) => {
      const root = models.create(T, { model: 'pipe-assembly', params: { radius } });
      for (const index of [1, 2]) {
        const stand = root.getObjectByName(`pipe-support-${index}`);
        const inverse = stand.matrixWorld.clone().invert();
        const localBounds = (object: any) => {
          const box = new T.Box3();
          visitVertices(object, (point) => box.expandByPoint(point.applyMatrix4(inverse)));
          return box;
        };
        const base = localBounds(stand.getObjectByName('support-base'));
        const cross = localBounds(stand.getObjectByName('support-cross-member'));
        const band = localBounds(
          root.getObjectByName(`removable-pipe-clamp-${index}`).getObjectByName('retaining-band'),
        );
        for (const side of [-1, 1]) {
          const post = localBounds(stand.getObjectByName(`support-upright-${side}`));
          expect(Math.abs(post.min.y - base.max.y)).toBeLessThan(1e-6);
          expect(post.clone().expandByScalar(1e-6).intersectsBox(cross)).toBe(true);
          expect(post.clone().expandByScalar(1e-6).intersectsBox(band)).toBe(true);
          expect(post.max.y).toBeGreaterThanOrEqual(0.49);
        }
      }
      root.userData.dispose();
    },
  );

  it('accounts for instance matrix and color buffers and only advertises real structural separation', () => {
    const root = models.create(T, { model: 'logic-stack' });
    const geometries = new Set<any>();
    let buffers = 0;
    root.traverse((mesh: any) => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      if (mesh.isInstancedMesh) {
        buffers += mesh.instanceMatrix.array.byteLength;
        if (mesh.instanceColor) buffers += mesh.instanceColor.array.byteLength;
      }
    });
    expect(buffers).toBeGreaterThan(0);
    for (const shape of geometries) {
      for (const attribute of Object.values(shape.attributes) as any[])
        buffers += attribute.array.byteLength;
      if (shape.index) buffers += shape.index.array.byteLength;
    }
    expect(root.userData.stats.geometryBytes).toBeGreaterThanOrEqual(buffers);
    expect(
      assetCatalog('logic-stack').actionHints.some((hint) => hint.property === 'explode'),
    ).toBe(true);
    expect(
      assetCatalog('circuit-board').actionHints.some((hint) => hint.property === 'explode'),
    ).toBe(false);
    expect(assetCatalog('atom').actionHints.some((hint) => hint.property === 'explode')).toBe(true);
    expect(
      assetCatalog('planet', { rings: false }).actionHints.some((hint) => hint.property === 'explode'),
    ).toBe(true);
    const changed = models.definition('valve');
    changed.parameters.opening.default = 1;
    expect(models.definition('valve').parameters.opening.default).toBe(0.65);
    root.userData.dispose();
  });

  it.each(['valve', 'pipe-assembly', 'circuit-board', 'logic-stack'] as const)(
    '%s handles parameter extrema without non-finite geometry or metadata',
    (kind) => {
      const rules = assetDefinition(kind).parameters;
      for (const extreme of ['min', 'max'] as const) {
        const params = Object.fromEntries(
          Object.entries(rules).map(([key, rule]) => [key, rule[extreme] ?? rule.default]),
        );
        const root = models.create(T, { model: kind, params });
        const measured = measuredBounds(root),
          entry = assetCatalog(kind, params);
        expect([...measured.min.toArray(), ...measured.max.toArray()].every(Number.isFinite)).toBe(
          true,
        );
        expect(entry.cost.drawCalls).toBeLessThan(100);
        expect(entry.cost.triangles).toBeLessThan(200000);
        root.userData.dispose();
      }
    },
  );

  it('planet surface detail grows within a fixed texture budget and catalog does not allocate a WebGL context', () => {
    const low = assetCatalog('planet', { detail: 1 }),
      normal = assetCatalog('planet'),
      high = assetCatalog('planet', { detail: 3 });
    expect(low.cost.textureBytes).toBeLessThan(normal.cost.textureBytes);
    expect(normal.cost.textureBytes).toBeLessThan(high.cost.textureBytes);
    expect(high.cost.textureBytes).toBeLessThan(12 * 1024 * 1024);
    expect(high.cost.textures).toBe(5);
    expect(runtime.document).toBeUndefined();
  });

  it('catalog cache returns independent data and rejects unknown kinds without prototype access', () => {
    const a = assetCatalog('valve');
    a.ports.inlet.position[0] = 999;
    a.parameters.opening.default = 999;
    expect(assetCatalog('valve').ports.inlet.position[0]).not.toBe(999);
    expect(assetDefinition('valve').parameters.opening.default).toBe(0.65);
    expect(() => assetCatalog('__proto__' as never)).toThrow('Unknown');
    expect(() => assetDefinition('constructor' as never)).toThrow('Unknown');
  });
});

import { createContext, Script } from 'node:vm';
import threeSource from '../../public/vendor/three-r150.min.js?raw';
import modelSource from './models.js?raw';
import type { CinematicAssetKind, AssetParameter, AssetStructureFacts } from './asset-definitions';
export { assetDefinition, cinematicAssetKinds } from './asset-definitions';
export type { CinematicAssetKind, AssetParameter, AssetDefinition } from './asset-definitions';

export type AssetVector = [number, number, number];
export type AssetParams = Record<string, number | string | boolean>;
export interface AssetBounds {
  min: AssetVector;
  max: AssetVector;
  radius: number;
}
export interface AssetPort {
  // t=0/explode=0, after root normalization; root placement/rotation/scale are not baked in.
  position: AssetVector;
  normal: AssetVector;
  role: string;
  part: string;
  // False means the external attachment survives all internal motion and explosion unchanged.
  dynamic: boolean;
}
export interface AssetCatalogEntry extends AssetStructureFacts {
  kind: CinematicAssetKind;
  version: 'cinematic-assets-v2';
  coordinateSpace: 'normalized-root';
  params: AssetParams;
  parameters: Record<string, AssetParameter>;
  // Vertex-derived initial AABB and tight normalization sphere, including every instance matrix.
  bounds: AssetBounds;
  // Conservative sweep of actual parts over internal animation and explode=0..1, not linear interpolation.
  expandedBounds: AssetBounds;
  // Initial assembled bounds.min[1]; not an assertion that exploded parts stay on the ground.
  floor: number;
  ports: Record<string, AssetPort>;
  supportSurfaces: Array<{
    id: string;
    bounds: Pick<AssetBounds, 'min' | 'max'>;
    coordinateSpace: 'normalized-root';
    state: 'initial-assembled';
    dynamic: false;
  }>;
  roles: string[];
  representation: string;
  actionHints: Array<{ property: string; target: string; description: string }>;
  cost: {
    drawCalls: number;
    triangles: number;
    instances: number;
    geometries: number;
    materials: number;
    textures: number;
    geometryBytes: number;
    textureBytes: number;
  };
}

let runtime: ReturnType<typeof createContext> | undefined;
const evaluateCatalog = new Script(
  'CinematicModels.catalog(THREE, assetRequest.kind, assetRequest.params)',
);
const cache = new Map<string, AssetCatalogEntry>();
const evaluatePath = new Script(`(() => {
  const points = pathRequest.map(point => new THREE.Vector3(...point));
  const curve = new THREE.CatmullRomCurve3(points);
  const samples = curve.getSpacedPoints(20);
  // Preserve exact semantic endpoints, avoiding interpolation round-off at t=1.
  samples[0].copy(points[0]);
  samples[20].copy(points[points.length - 1]);
  let maxChordError = 0;
  for (let i = 0; i < 20; i++) for (const fraction of [0.25, 0.5, 0.75]) {
    const exact = curve.getPointAt((i + fraction) / 20);
    maxChordError = Math.max(maxChordError, exact.distanceTo(samples[i].clone().lerp(samples[i + 1], fraction)));
  }
  return { samples: samples.map(point => point.toArray()), length: curve.getLength(), maxChordError };
})()`);

// Use the same vendored CatmullRomCurve3/getPointAt as the browser. Data only
// crosses the VM boundary; generated text is never evaluated as JavaScript.
export function sampleCinematicConnectionPath(points: AssetVector[]): { samples: AssetVector[]; length: number; maxChordError: number } {
  if (points.length < 2 || points.length > 14 || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > 200)))
    throw Error('Connection path requires 2–14 bounded three-dimensional points');
  const context = getRuntime();
  context.pathRequest = structuredClone(points);
  try {
    return structuredClone(evaluatePath.runInContext(context, { timeout: 2000 }));
  } finally {
    delete context.pathRequest;
  }
}

function getRuntime() {
  if (!runtime) {
    runtime = createContext({ console: { warn() {}, error() {} } });
    new Script(threeSource).runInContext(runtime, { timeout: 5000 });
    new Script(modelSource).runInContext(runtime, { timeout: 5000 });
  }
  return runtime;
}

export function assetCatalog(
  kind: CinematicAssetKind,
  params: AssetParams = {},
): AssetCatalogEntry {
  const key = JSON.stringify([kind, Object.entries(params).sort(([a], [b]) => a.localeCompare(b))]);
  const cached = cache.get(key);
  if (cached) return structuredClone(cached);
  const context = getRuntime();
  context.assetRequest = { kind, params: structuredClone(params) };
  let result: AssetCatalogEntry;
  try {
    result = structuredClone(
      evaluateCatalog.runInContext(context, { timeout: 10000 }),
    ) as AssetCatalogEntry;
  } finally {
    delete context.assetRequest;
  }
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return structuredClone(result);
}

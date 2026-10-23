import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import * as crypto from 'node:crypto';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  assetDefinition,
  cinematicAssetKinds,
  cinematicPlanningAssets,
  CINEMATIC_ASSET_PLANNING_BRIEF,
} from '../../../lib/cinematic/asset-definitions';
import { assetCatalog } from '../../../lib/cinematic/asset-catalog';

const runtime = createContext({ console: { warn() {} } });
runInContext(readFileSync(resolve('public/vendor/three-r150.min.js'), 'utf8'), runtime);
runInContext(readFileSync(resolve('lib/cinematic/models.js'), 'utf8'), runtime);
const models = runtime.CinematicModels, T = runtime.THREE;
const previousGeometryAndMotion = {
  "turbine": "5c40971d6d84e318d7d1912c8fbbeb17703ef1417c02a8eaa5a8eb23a5092dbd",
  "server-rack": "c817f8313a47fbf552e8bb6035852c6a1a5c024eeac95dc9ef50d724f4dcb1ed",
  "processor": "9a9b519cf208d918599b9e2467c70c4ec67cca7338698a791ea9a507b9e87658",
  "memory-bank": "ccacb9c042e043110f17977525490c44996f6f72011e1c0bef0c63d1fd3a99e4",
  "dna": "723737b58a63021443565b16a8cfc6e610c59b979f59132316ce50ba3aa83442",
  "atom": "7bbd77db0533c28f3e1f60452569584022e837a95288f42bb91808956e4a0f41",
  "planet": "a6df7b0c9388639326132a4551f12b2d617ecad0a862df4a9eab3e34b22d18a0",
  "satellite": "5c57292c568b504bf6c6d2bfdac3f5096b8284610d96ca1496eb84d9b64bb021",
  "optical-bench": "d36471a50e122976f33c491204bccff2d6b73ac00ca9639b9a82c6942bf61031",
  "wave-surface": "f194013480869c215b8271ae7a3bac62ae1b06809df1d3fba18c328ace14b4a9",
  "valve": "f283d68a9581024d71a75d5dc57d492cf0338880baf9643ac834f8a4efe0435c",
  "pipe-assembly": "4c3fd560408d556adb36bc1d875c1679cbf667d7930fc9a669b1826525db7e69",
  "circuit-board": "ce47f44ef9d52811bfdf797ff0df884c66136808a57b97967efc8841990ad5b7",
  "logic-stack": "5e0f2c90d06b1226b2b137ce802a90d41b6685cfa9533055406a081e1939a8fa",
  "usb-drive": "9a8ea277f77ec589c34aff0f13463337fbaabbe7f8f140ab277e6711b95c0e2d",
  "computer-workstation": "40b431c4d5857142123c75a8ae9d7b6c11f4e9cc15266e56caf2cadaae48ceef",
  "industrial-controller": "b01a13e09c67a038f309fecfbfc0aa198ca9b75cff162142bec5616d54547a41",
  "industrial-drive": "b4fd5fedc6078803de3ac63a30b5b6f080042d76d3dae45a95dba03e587c33d0",
  "centrifuge-housing": "e3ce84ebc44096629c83566462ba620d4b0aa6c298feaf681e7fee78c7333056"
} as const;

function motionFingerprint(root: any) {
  const hash = crypto.createHash('sha256');
  function bytes(value: Uint8Array | Uint16Array | Uint32Array | Float32Array | Float64Array) { hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength)); }
  for (const [time, explode] of [[0,0],[1.37,0.5],[8.25,1],[0,0]]) {
    root.userData.update(time, explode);
    root.updateMatrixWorld(true);
    root.traverse((object: any) => {
      hash.update(JSON.stringify([object.name, object.matrixWorld.elements]));
      if (object.geometry) {
        for (const name of Object.keys(object.geometry.attributes).sort()) {
          hash.update(name); bytes(object.geometry.attributes[name].array);
        }
        if (object.geometry.index) bytes(object.geometry.index.array);
      }
      if (object.isInstancedMesh) bytes(object.instanceMatrix.array);
    });
  }
  return hash.digest('hex');
}

describe('asset planning facts without new geometry or animation', () => {
  it.each(cinematicAssetKinds)('%s default planning facts equal actual runtime registration', kind => {
    const summary = cinematicPlanningAssets().find(item => item.kind === kind)!;
    const catalog = assetCatalog(kind);
    const root = models.create(T, { model: kind, metadataOnly: true });
    const keys = ['params', 'supportsExplode', 'explodeParts', 'internalPartsAddressable', 'parameterMode', 'assemblyValidation'] as const;
    expect(summary.defaultStructure).toEqual(Object.fromEntries(keys.map(key => [key, catalog[key]])));
    for (const key of keys) expect(JSON.parse(JSON.stringify(root.userData[key]))).toEqual(catalog[key]);
    expect(summary.representation).toBe(assetDefinition(kind).representation);
    expect(catalog.supportsExplode).toBe(catalog.explodeParts.length > 0);
    expect(new Set(catalog.explodeParts).size).toBe(catalog.explodeParts.length);
    expect(catalog.actionHints.some(action => action.property === 'explode')).toBe(catalog.supportsExplode);
    expect(catalog.internalPartsAddressable).toBe(false);
    expect(catalog.parameterMode).toBe('construction-only');
    expect(catalog.assemblyValidation).toBe('placement-only');
    root.userData.update(1.37, 0);
    const before = new Map<any, number[]>();
    root.traverse((object: any) => before.set(object, [...object.matrixWorld.elements]));
    root.userData.update(1.37, 1);
    for (const name of catalog.explodeParts) {
      expect(name).not.toBe('assembly');
      const matches: any[] = [];
      root.traverse((object: any) => { if (object.name === name) matches.push(object); });
      expect(matches.length).toBeGreaterThan(0);
      let changes = false;
      for (const part of matches) part.traverse((object: any) => {
        if (object.matrixWorld.elements.some((n: number, index: number) => Math.abs(n - before.get(object)![index]) > 1e-8)) changes = true;
      });
      expect(changes, kind + ':' + name + ' must actually separate or expand').toBe(true);
    }
    root.userData.dispose();
  });

  it.each(cinematicAssetKinds)('%s preserves pre-v8 geometry and motion at four timeline states', kind => {
    const root = models.create(T, { model: kind, metadataOnly: true });
    expect(motionFingerprint(root)).toBe(previousGeometryAndMotion[kind]);
    root.userData.dispose();
  });

  it('keeps parameter-specific instances distinct from the default planning snapshot', () => {
    expect(assetCatalog('memory-bank', { modules: 6 }).explodeParts).toEqual(Array.from({ length: 6 }, (_, i) => 'dimm-' + (i + 1)));
    expect(cinematicPlanningAssets().find(item => item.kind === 'memory-bank')!.defaultStructure.explodeParts).toHaveLength(4);
    expect(assetCatalog('logic-stack', { layers: 2 }).explodeParts).toEqual(['logical-layer-1', 'logical-layer-2']);
    expect(assetCatalog('planet', { rings: false }).explodeParts).not.toContain('stratified-ice-rings');
    expect(assetCatalog('planet', { rings: false }).supportsExplode).toBe(true);
    expect(assetCatalog('circuit-board').supportsExplode).toBe(false);
    expect(assetCatalog('circuit-board').explodeParts).toEqual([]);
  });

  it('states actual hardware and logical limitations in the authoritative asset definitions', () => {
    expect(assetDefinition('processor').representation).toContain('perimeter leads');
    expect(assetDefinition('processor').representation).toContain('not a bottom-contact LGA');
    expect(assetDefinition('memory-bank').representation).toContain('Retaining clips are fixed');
    expect(assetDefinition('memory-bank').representation).toContain('no open/close motion');
    expect(assetDefinition('circuit-board').representation).toContain('one fixed assembly');
    expect(assetDefinition('circuit-board').representation).toContain('individually animated built-in trace');
    expect(assetDefinition('logic-stack').representation).toContain('activeLayer/activeCell are static');
    expect(assetDefinition('logic-stack').representation).toContain('does not push/pop');
    expect(CINEMATIC_ASSET_PLANNING_BRIEF).toContain('绝不是tracks目标');
    expect(CINEMATIC_ASSET_PLANNING_BRIEF).toContain('不证明机械配合、电气连通或逐触点匹配');
    expect(JSON.parse(CINEMATIC_ASSET_PLANNING_BRIEF.split('\n').at(-1)!)).toEqual(cinematicPlanningAssets());
  });

  it('loads the complete planning summary with only pure JSON and no server runtime', () => {
    const source = readFileSync(resolve('lib/cinematic/asset-definitions.ts'), 'utf8');
    const exports: Record<string, any> = {}, imports: string[] = [];
    runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, createContext({
      exports, structuredClone,
      require(id: string) {
        imports.push(id);
        if (id !== './asset-definitions.json') throw Error('Unexpected planning dependency: ' + id);
        return JSON.parse(readFileSync(resolve('lib/cinematic/asset-definitions.json'), 'utf8'));
      },
    }));
    expect(imports).toEqual(['./asset-definitions.json']);
    expect(JSON.parse(JSON.stringify(exports.cinematicPlanningAssets()))).toEqual(cinematicPlanningAssets());
    expect(exports.CINEMATIC_ASSET_PLANNING_BRIEF).toBe(CINEMATIC_ASSET_PLANNING_BRIEF);
  });

  it('returns detached summary and runtime facts without mutating asset authority', () => {
    const summaries = cinematicPlanningAssets();
    summaries[0].defaultStructure.explodeParts.push('invented-part');
    summaries[0].defaultStructure.params.detail = 999;
    summaries[0].roles.length = 0;
    expect(cinematicPlanningAssets()[0].defaultStructure.explodeParts).not.toContain('invented-part');
    expect(cinematicPlanningAssets()[0].defaultStructure.params.detail).toBe(2);
    expect(cinematicPlanningAssets()[0].roles.length).toBeGreaterThan(0);
    const cached = assetCatalog('processor'); cached.explodeParts.length = 0;
    expect(assetCatalog('processor').explodeParts).toHaveLength(4);
  });
});

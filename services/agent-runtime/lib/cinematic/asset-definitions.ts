import definitions from './asset-definitions.json';

export type CinematicAssetKind = keyof typeof definitions;
export interface AssetParameter {
  type: 'number' | 'integer' | 'boolean' | 'enum';
  default: number | string | boolean;
  min?: number;
  max?: number;
  values?: string[];
}
export interface AssetDefinition {
  kind: CinematicAssetKind;
  parameters: Record<string, AssetParameter>;
  roles: string[];
  representation: string;
  assemblyRecipe?: string;
}
export interface AssetStructureFacts {
  supportsExplode: boolean;
  explodeParts: string[];
  internalPartsAddressable: false;
  parameterMode: 'construction-only';
  assemblyValidation: 'placement-only';
}
export interface AssetPlanningSummary {
  kind: CinematicAssetKind;
  roles: string[];
  representation: string;
  assemblyRecipe?: string;
  defaultStructure: AssetStructureFacts & { params: Record<string, number | string | boolean> };
}
export const cinematicAssetKinds = Object.freeze(Object.keys(definitions) as CinematicAssetKind[]);

export function assetDefinition(kind: CinematicAssetKind): AssetDefinition {
  if (!Object.hasOwn(definitions, kind)) throw new RangeError(`Unknown cinematic model: ${kind}`);
  const { kind: id, parameters, roles, representation, assemblyRecipe } = definitions[kind] as typeof definitions[typeof kind] & {assemblyRecipe?: string};
  return structuredClone({ kind: id, parameters, roles, representation, ...(assemblyRecipe ? {assemblyRecipe} : {}) }) as AssetDefinition;
}

export function cinematicPlanningAssets(): AssetPlanningSummary[] {
  return cinematicAssetKinds.map((kind) => {
    const { roles, representation, defaultStructure, assemblyRecipe } = definitions[kind] as typeof definitions[typeof kind] & {assemblyRecipe?: string};
    return structuredClone({ kind, roles, representation, defaultStructure, ...(assemblyRecipe ? {assemblyRecipe} : {}) }) as AssetPlanningSummary;
  });
}

export const CINEMATIC_ASSET_PLANNING_BRIEF = `以下资产事实对所有主题一致，不按题材改写能力。defaultStructure为实际默认params实例的结构快照，参数改变后须读取对应assetCatalog，不能假定部件数量或名字不变。只有supportsExplode=true的资产支持已声明的explode动作；具体是整体展开、扩张还是参数指定的局部分离，以representation与参数实例actionHints为准。explodeParts列出受控单元，不是逐个内部零件拆卸。内部部件名只用于说明，绝不是tracks目标，不能自行寻址。参数仅创建时生效。端口对齐只证明空间摆放，不证明机械配合、电气连通或逐触点匹配。内置动作未声明时不得承诺；可另建可控基础几何节点，但必须实际实现并明确其教学示意性质，不能用字幕或装饰运动代替原需求。\n${JSON.stringify(cinematicPlanningAssets())}`;

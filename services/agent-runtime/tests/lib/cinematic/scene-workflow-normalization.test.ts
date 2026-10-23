import {describe,expect,it} from 'vitest';
import {referenceScenes} from '@/lib/cinematic/reference-scenes';
import {normalizeCinematicStructureAssetRoles} from '@/lib/cinematic/scene-workflow';
import {assetDefinition} from '@/lib/cinematic/asset-definitions';

describe('staged cinematic structure normalization',()=>{
  it('maps descriptive asset roles to the selected model catalog without mutating the draft',()=>{
    const draft=structuredClone(referenceScenes[3]);
    const housing=draft.nodes.find(node=>node.model==='centrifuge-housing')!;
    const panel=draft.nodes.find(node=>node.model==='industrial-controller')!;
    housing.assetRole='剖切外壳与承载结构';
    panel.assetRole='操作员界面与欺骗显示';
    const normalized=normalizeCinematicStructureAssetRoles(draft);
    expect(normalized.nodes.find(node=>node.id===housing.id)?.assetRole).toBe(assetDefinition('centrifuge-housing').roles[0]);
    expect(normalized.nodes.find(node=>node.id===panel.id)?.assetRole).toBe(assetDefinition('industrial-controller').roles[0]);
    expect(housing.assetRole).toBe('剖切外壳与承载结构');
    expect(panel.assetRole).toBe('操作员界面与欺骗显示');
  });

  it('drops impossible primitive rotor port placements and leaves other assembly relations intact',()=>{
    const draft=structuredClone(referenceScenes[3]);
    draft.assembly={placements:[
      {mode:'port',node:'rotor-a',reference:'centrifuge-a',port:'rotor-center',referencePort:'rotor-center',gap:0},
      {mode:'floor',node:'centrifuge-a',clearance:0},
    ]};
    const normalized=normalizeCinematicStructureAssetRoles(draft);
    expect(normalized.assembly?.placements).toEqual([{mode:'floor',node:'centrifuge-a',clearance:0}]);
    expect(draft.assembly.placements).toHaveLength(2);
  });

  it('drops assembly relations that use groups as bound or port endpoints',()=>{
    const draft=structuredClone(referenceScenes[3]);
    const child=structuredClone(draft.nodes.find(node=>node.kind==='box')!);
    child.id='train-part';child.parent='train-a';
    draft.nodes.push({
      ...structuredClone(child),id:'train-a',kind:'group',parent:undefined,params:{},
    },child);
    draft.assembly={placements:[
      {mode:'relative',node:'centrifuge-a',reference:'train-a',side:'right',gap:1},
      {mode:'relative',node:'train-a',reference:'centrifuge-b',side:'left',gap:1},
      {mode:'floor',node:'centrifuge-c',clearance:0},
    ]};
    const normalized=normalizeCinematicStructureAssetRoles(draft);
    expect(normalized.assembly?.placements).toEqual([{mode:'floor',node:'centrifuge-c',clearance:0}]);
    expect(draft.assembly.placements).toHaveLength(3);
  });
});

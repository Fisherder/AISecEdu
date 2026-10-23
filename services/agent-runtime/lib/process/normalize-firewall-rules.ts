/** Remove a redundant rule-number shortcut only when the designated rule's
 * stored source is already the same wildcard checked by srcOk. */
export function removeRedundantFirewallWildcardShortcut(scene:any):void {
  const zones=scene?.initialState?.rulesSrcZone;
  if(!Array.isArray(zones))return;
  const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
  for(const action of scene.actions??[]){
    const locals=action?.locals;
    if(!Array.isArray(locals))continue;
    const value=(id:string)=>locals.find((local:any)=>local?.id===id)?.value;
    if(!same(value('ruleSrc'),{op:'at',args:[{state:'rulesSrcZone'},{local:'idx'}]})||
        !same(value('srcOk'),{op:'or',args:[
          {op:'eq',args:[{local:'ruleSrc'},'any']},
          {op:'eq',args:[{local:'ruleSrc'},{state:'srcZone'}]},
        ]}))continue;
    const hit=locals.find((local:any)=>local?.id==='hit')?.value;
    if(hit?.op!=='and'||!Array.isArray(hit.args))continue;
    for(let index=0;index<hit.args.length;index++){
      const term=hit.args[index];
      if(term?.op!=='or'||!Array.isArray(term.args)||term.args.length!==2)continue;
      const shortcut=term.args.find((part:any)=>part?.op==='eq'&&
        same(part.args?.[0],{local:'idx'})&&Number.isInteger(part.args?.[1]));
      const source=term.args.find((part:any)=>same(part,{local:'srcOk'}));
      const rule=shortcut?.args?.[1];
      if(!source||typeof rule!=='number'||rule<0||rule>=zones.length||zones[rule]!=='any')continue;
      hit.args[index]={local:'srcOk'};
    }
  }
}

/** Matching action labels is not evidence that every rule with that action
 * matched. Retain the existing current-rule activeIndex as the sole highlight. */
export function removeMisleadingFirewallActionMarkers(scene:any):void {
  const actions=scene?.initialState?.rulesAction;
  if(!Array.isArray(actions)||!Array.isArray(scene?.views))return;
  const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
  for(const view of scene.views){
    const marker=view?.markedIndices,mask=marker?.args?.[0];
    if(view?.kind!=='array'||marker?.op!=='indicesOf'||marker.args?.[1]!==1||
        mask?.op!=='array'||!Array.isArray(mask.args)||mask.args.length!==actions.length||
        !String(JSON.stringify(view.activeIndex)).includes('"state":"currentRule"'))continue;
    if(!mask.args.every((term:any,index:number)=>same(term,{op:'if',args:[
      {op:'eq',args:[{state:'finalAction'},actions[index]]},1,0,
    ]})))continue;
    delete view.markedIndices;
    for(const stage of scene.stages??[])if(typeof stage?.explanation==='string')
      stage.explanation=stage.explanation.replace(
        '规则表中命中规则会带底色显示','规则表会高亮显示命中的规则');
  }
}

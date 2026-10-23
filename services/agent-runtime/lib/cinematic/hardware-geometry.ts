import {assetCatalog} from './asset-catalog';
import {compose,dot,inverse,multiply,transformDirection,transformPoint,unit,worldBounds,worldNodes,localBounds} from './assembly';
import type {CinematicScene} from './schema';
import type {CinematicQualityIssue,CinematicQualityOptions} from './quality';
import {validateCinematicDomainLab} from './domain-lab-contract';

function vectorPropertyAt(scene:CinematicScene,target:string,property:'position'|'rotation'|'scale',at:number,fallback:[number,number,number]){
  const track=scene.tracks.find(item=>item.target===target&&item.property===property);
  if(!track)return fallback;
  const nextIndex=track.keyframes.findIndex(frame=>frame.at>=at);
  const next=nextIndex<0?track.keyframes.at(-1):track.keyframes[nextIndex];
  const previous=nextIndex<=0?next:track.keyframes[nextIndex-1];
  if(!next||!previous||!Array.isArray(next.value)||!Array.isArray(previous.value))return fallback;
  if(next.at===previous.at)return [...next.value] as [number,number,number];
  const progress=(at-previous.at)/(next.at-previous.at);
  const nextValue=next.value;
  return previous.value.map((value,index)=>value+(nextValue[index]-value)*progress) as [number,number,number];
}

const vectorAt=(scene:CinematicScene,target:string,at:number,fallback:[number,number,number])=>
  vectorPropertyAt(scene,target,'position',at,fallback);

function opacityAt(scene:CinematicScene,target:string,at:number,fallback:number){
  const track=scene.tracks.find(item=>item.target===target&&item.property==='opacity');
  if(!track)return fallback;
  const nextIndex=track.keyframes.findIndex(frame=>frame.at>=at);
  const next=nextIndex<0?track.keyframes.at(-1):track.keyframes[nextIndex];
  const previous=nextIndex<=0?next:track.keyframes[nextIndex-1];
  if(!next||!previous||typeof next.value!=='number'||typeof previous.value!=='number')return fallback;
  if(next.at===previous.at)return next.value;
  return previous.value+(next.value-previous.value)*(at-previous.at)/(next.at-previous.at);
}

const semantic=(node:CinematicScene['nodes'][number])=>`${node.id} ${node.assetRole||''} ${node.represents||''} ${node.label||''}`;

/** A drive shaft may pass through both ends of the housing. It is not the
 * rotor body that must fit completely inside the catalog cavity. */
export function isCinematicRotorBody(node:CinematicScene['nodes'][number]) {
  if(node.kind!=='cylinder'||node.role!=='primary')return false;
  const name=[node.represents,node.label].filter(Boolean).join(' ');
  const shaft=/(?:转轴|驱动轴|传动轴|主轴|shaft)/i;
  // A rotor description often explains that it is mounted on a shaft. Its
  // explicit short label identifies the body; mentioning its carrier in the
  // longer explanation must not turn a real rotor into a shaft or erase it.
  if(shaft.test(node.label??''))return false;
  if(/转子|rotor/i.test(node.label??''))return true;
  if(shaft.test(name))return false;
  if(/转子|rotor/i.test(name))return true;
  return !shaft.test([node.id,node.assetRole].filter(Boolean).join(' '));
}

/** An author can center an independent rotor rig in a housing, then place the
 * housing on the floor without declaring their relationship. Preserve that
 * exact authored attachment before layout moves the housing away from it.
 * Only an unambiguous, stationary, axis-aligned rig is inferred. */
export function preserveCinematicRotorAssembly<T extends Pick<CinematicScene,'nodes'|'assembly'>>(input:T):T {
  const structure=structuredClone(input),worlds=worldNodes({...structure,tracks:[]} as unknown as CinematicScene);
  const housings=structure.nodes.filter(node=>node.model==='centrifuge-housing'&&!node.parent&&
    node.rotation.every(value=>Math.abs(value)<1e-12)&&node.scale.every(value=>Math.abs(value-node.scale[0])<1e-12));
  for(const group of structure.nodes.filter(node=>node.kind==='group'&&!node.parent)){
    if(structure.assembly?.placements.some(placement=>placement.node===group.id))continue;
    const rotors=structure.nodes.filter(node=>node.parent===group.id&&isCinematicRotorBody(node));
    if(rotors.length!==1)continue;
    const rotor=rotors[0],point=transformPoint(worlds.get(rotor.id)!.matrix,[0,0,0]);
    const hosts=housings.filter(housing=>{
      const ports=assetCatalog('centrifuge-housing',housing.params).ports;
      const relative=transformPoint(inverse(worlds.get(housing.id)!.matrix),point);
      const center=ports['rotor-center'].position,radius=Math.abs(ports['cavity-front'].position[2]-center[2]);
      return Math.hypot(...relative.map((value,axis)=>value-center[axis]))<=Math.max(1e-5,radius*.02);
    });
    if(hosts.length!==1)continue;
    const housing=hosts[0];group.position=transformPoint(inverse(worlds.get(housing.id)!.matrix),group.position);
    group.scale=group.scale.map(value=>value/housing.scale[0]) as [number,number,number];group.parent=housing.id;
  }
  return structure;
}

/** Restore only dimensions demonstrably changed by the old cavity clamp.
 * Keep all later authored edits, bindings, tracks and other scene geometry. */
export function restoreCinematicShaftGeometry(scene:CinematicScene,authored:CinematicScene) {
  const restored=structuredClone(scene),changes:string[]=[];
  const close=(a:unknown,b:unknown):boolean=>typeof a==='number'&&typeof b==='number'
    ?Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b))
    :Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>close(v,b[i]))
    :a&&b&&typeof a==='object'&&typeof b==='object'
      ?Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>k in b&&close(v,(b as Record<string,unknown>)[k]))
      :a===b;
  for(const source of authored.nodes){
    if(source.kind!=='cylinder'||source.role!=='primary'||isCinematicRotorBody(source))continue;
    const housing=authored.nodes.find(node=>node.id===source.parent&&node.model==='centrifuge-housing');
    const current=restored.nodes.find(node=>node.id===source.id);
    if(!housing||!current||current.kind!==source.kind||current.parent!==source.parent||
      current.role!==source.role||current.represents!==source.represents||current.label!==source.label||current.assetRole!==source.assetRole||
      !close(current.scale,source.scale))continue;
    const ports=assetCatalog('centrifuge-housing',housing.params).ports;
    const radius=Math.abs(ports['cavity-front'].position[2]-ports['rotor-center'].position[2]);
    const height=Math.abs(ports['rotor-top'].position[1]-ports['rotor-bottom'].position[1]);
    const scale=source.scale.map(value=>Math.max(Math.abs(value),.001));
    const top=Math.min(Number(source.params.top??.5),radius*.72/Math.max(scale[0],scale[2]));
    const bottom=Math.min(Number(source.params.bottom??.5),radius*.72/Math.max(scale[0],scale[2]));
    const clampedHeight=Math.min(Number(source.params.height??2),height*.86/scale[1]);
    const legacyParams={...source.params,top,bottom,height:clampedHeight};
    if(close(source.params,legacyParams)||!close(current.params,legacyParams)||
      !close(current.position,ports['rotor-center'].position)||
      !close(current.rotation,[0,source.rotation[1],0]))continue;
    current.params=structuredClone(source.params);current.position=[...source.position];current.rotation=[...source.rotation];
    changes.push(current.id);
    for(const marker of authored.nodes.filter(node=>node.parent===source.id&&['box','plane','cylinder'].includes(node.kind)&&
      /stripe|band|marker|条纹|标记|示踪/i.test(`${node.id} ${node.represents??''}`))){
      const actual=restored.nodes.find(node=>node.id===marker.id);
      const legacyPosition=[0,marker.position[1],Math.max(top,bottom)*1.1];
      const legacyHeight=Math.min(clampedHeight*.9,Math.max(Number(marker.params.height??0),clampedHeight*.55));
      if(actual&&actual.parent===marker.parent&&actual.role===marker.role&&actual.represents===marker.represents&&
        actual.label===marker.label&&close(actual.position,legacyPosition)&&
        close(actual.params,{...marker.params,height:legacyHeight})&&close(actual.rotation,marker.rotation)&&close(actual.scale,marker.scale)){
        actual.position=[...marker.position];actual.params=structuredClone(marker.params);changes.push(actual.id);
      }
    }
  }
  return {scene:changes.length?restored:scene,changes};
}

/** Deterministic repairs for hardware constraints that the model should not have to rediscover. */
export function normalizeCinematicHardware(scene:CinematicScene,requirements:CinematicQualityOptions={}){
  const centrifuge=normalizeCentrifugeHardware(scene);
  const normalized=structuredClone(centrifuge.scene),adjustments=[...centrifuge.adjustments];

  // A static background wall is not part of a swinging door. Keep it behind
  // the complete hinge sweep, rather than repeatedly regenerating doors or
  // waiving their real intersections. This moves only an unassembled backdrop
  // with an axis-aligned parent; attached, animated and primary walls stay.
  const backdropWorlds=worldNodes(normalized);
  const ancestry=(id:string)=>{const result:string[]=[];let node=normalized.nodes.find(node=>node.id===id);
    while(node){result.push(node.id);node=node.parent?normalized.nodes.find(value=>value.id===node!.parent):undefined;}
    return result;};
  const doorLeaves=normalized.nodes.filter(node=>node.kind==='box'&&node.role==='primary'&&
    /door.{0,8}leaf|door_leaf|门扇|门板/i.test(semantic(node))&&node.parent&&
    normalized.nodes.find(parent=>parent.id===node.parent)?.kind==='group');
  for(const wall of normalized.nodes.filter(node=>node.kind==='box'&&node.role==='support'&&
    /wall.{0,8}back|back.{0,8}wall|背景墙|后墙/i.test(semantic(node)))){
    const chain=ancestry(wall.id);
    if(chain.some(id=>normalized.tracks.some(track=>track.target===id))||
      normalized.lab?.bindings.some(binding=>chain.includes(binding.node))||
      normalized.assembly?.placements.some(placement=>placement.node===wall.id||
        'reference' in placement&&placement.reference===wall.id)||
      wall.rotation.some(value=>Math.abs(value)>.001))continue;
    const bounds=worldBounds(backdropWorlds.get(wall.id)!);
    if(bounds.max[2]-bounds.min[2]>.15*Math.min(bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1]))continue;
    const parent=wall.parent?backdropWorlds.get(wall.parent)?.matrix:compose([0,0,0],[0,0,0],[1,1,1]);
    if(!parent||[1,2,4,6,8,9].some(index=>Math.abs(parent[index])>.001)||parent[10]<=0)continue;
    let back=Infinity;
    for(const leaf of doorLeaves){
      const pivot=backdropWorlds.get(leaf.parent!)!;
      const pivotPoint=transformPoint(pivot.matrix,[0,0,0]);
      const box=worldBounds(backdropWorlds.get(leaf.id)!);
      if(bounds.max[2]>=pivotPoint[2]||box.max[0]<bounds.min[0]||box.min[0]>bounds.max[0]||
        box.max[1]<bounds.min[1]||box.min[1]>bounds.max[1])continue;
      const radius=Math.max(...[box.min[0],box.max[0]].flatMap(x=>[box.min[2],box.max[2]].map(z=>
        Math.hypot(x-pivotPoint[0],z-pivotPoint[2]))));
      back=Math.min(back,pivotPoint[2]-radius-.15);
    }
    if(Number.isFinite(back)&&bounds.max[2]>back){
      wall.position[2]=Number((wall.position[2]+(back-bounds.max[2])/parent[10]).toPrecision(12));
      adjustments.push(wall.id+'-door-sweep-backdrop');
    }
  }

  // Explicit thin children of a flat control panel belong on its visible
  // face. Recover only a buried +Z attachment and translate its local panel
  // motion by the same offset; free objects and assembly-owned placements stay.
  for(const child of normalized.nodes){
    const panel=normalized.nodes.find(node=>node.id===child.parent);
    if(!panel||panel.kind!=='box'||panel.role!=='support'||
      !/(?:control|panel|console|控制台|面板)/i.test(semantic(panel))||
      !['box','plane'].includes(child.kind)||!['support','logic'].includes(child.role??'')||
      child.rotation.some(value=>Math.abs(value)>.001)||
      normalized.assembly?.placements.some(placement=>placement.node===child.id))continue;
    const bounds=localBounds(panel),depth=bounds.max[2]-bounds.min[2];
    if(depth>.3*Math.min(bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1]))continue;
    const childBounds=localBounds(child),childDepth=(childBounds.max[2]-childBounds.min[2])*Math.abs(child.scale[2]);
    if(childDepth>depth*.6||child.position[2]<0||child.position[2]>=bounds.max[2]+childDepth/2)continue;
    const tracks=normalized.tracks.filter(track=>track.target===child.id&&track.property==='position');
    if(tracks.some(track=>track.keyframes.some(key=>!Array.isArray(key.value)||
      key.value[2]<0||key.value[2]>bounds.max[2]+childDepth+.02)))continue;
    const front=bounds.max[2]-childBounds.min[2]*child.scale[2]+.006,delta=front-child.position[2];
    child.position[2]=front;
    for(const track of tracks)for(const key of track.keyframes)if(Array.isArray(key.value))key.value[2]+=delta;
    adjustments.push(`${child.id}-control-panel-face`);
  }

  // Recover an omitted catalog role only when the authored geometry and
  // description already identify the real asset. This is metadata, not a
  // substitute for a missing centrifuge or its independent rotor.
  for(const node of normalized.nodes){
    if(node.kind==='model'&&node.model==='centrifuge-housing'&&!node.assetRole&&
      /(?:centrifuge|离心机|机壳)/i.test(semantic(node))){
      node.assetRole=node.params.cutaway?'centrifuge-teaching-enclosure':'vertical-rotor-machine-housing';
      adjustments.push(`${node.id}-catalog-role`);
    }else if(node.kind==='model'&&node.model==='industrial-drive'&&!node.assetRole&&
      /(?:drive|驱动|hmi|scada|panel|meter|面板|仪表|转速表)/i.test(semantic(node))){
      node.assetRole='industrial-motor-drive';
      if(!/(?:drive|驱动)/i.test(node.represents??''))node.represents=`工业驱动器前面板：${node.represents||node.label||'状态显示'}`;
      adjustments.push(`${node.id}-catalog-role`);
    }
  }

  // The drive display sits above its keypad at local y=.42. The asset body's
  // own transform places the visible display face near the catalog front
  // bound (z≈.99), not at the nested display-port coordinate z=.53.
  // Generated pointer children sometimes sit in front of the keypad (y≈0),
  // leaving three blank monitors. Re-seat
  // only stationary or small-motion pointers; authored rotation and relative
  // position changes are preserved.
  const driveIds=new Set(normalized.nodes.filter(node=>node.model==='industrial-drive').map(node=>node.id));
  for(const node of normalized.nodes){
    if(!node.parent||!driveIds.has(node.parent)||node.kind!=='box'||
       !/(?:pointer|needle|cursor|指针|光标)/i.test(semantic(node)))continue;
    const panel=normalized.nodes.find(item=>item.id===node.parent)!;
    const front=assetCatalog('industrial-drive',panel.params).bounds.max[2]+.06;
    const track=normalized.tracks.find(item=>item.target===node.id&&item.property==='position');
    const anchor=track&&Array.isArray(track.keyframes[0]?.value)
      ?track.keyframes[0].value as [number,number,number]:node.position;
    if(track&&track.keyframes.some(frame=>!Array.isArray(frame.value)||
       Math.hypot(...frame.value.map((value,index)=>value-anchor[index]))>.25))continue;
    if(anchor[1]>=.27&&anchor[1]<=.57&&anchor[2]>=front&&anchor[2]<=front+.3&&
       node.position[1]>=.27&&node.position[1]<=.57&&node.position[2]>=front&&node.position[2]<=front+.3)continue;
    const desired:[number,number,number]=[Math.max(-.22,Math.min(.22,anchor[0])),.42,front];
    const shift=desired.map((value,index)=>value-anchor[index]);
    if(track)for(const frame of track.keyframes)if(Array.isArray(frame.value))
      frame.value=frame.value.map((value,index)=>value+shift[index]) as [number,number,number];
    node.position=desired;
    adjustments.push(`${node.id}-display-port`);
  }

  // Point clouds are ambient rendering primitives unless the lesson
  // explicitly explains a moving particle collection in a focused chapter.
  // Such a collection is visible evidence, even if the model omitted its
  // coverage.objects entry. Preserve its authored particles and motion.
  for(const [index,node] of normalized.nodes.entries()){
    if(node.kind!=='points'||!normalized.tracks.some(track=>track.target===node.id&&track.property==='position'))continue;
    const objectMapped=normalized.coverage?.objects.some(object=>object.nodes.includes(node.id))??false;
    const transportMapped=normalized.coverage?.interactions.some(interaction=>interaction.targets.includes(node.id)&&interaction.properties.includes('transport'))??false;
    const explainedInChapter=normalized.chapters.some(chapter=>chapter.focus.includes(node.id)&&
      /(?:particle|tracer|粒子|示踪)/i.test(`${chapter.title} ${chapter.caption}`));
    if(!objectMapped&&!transportMapped&&!explainedInChapter)continue;
    if((objectMapped||explainedInChapter)&&(node.points?.length??0)>=3){
      if(node.role!=='primary'){node.role='primary';adjustments.push(`${node.id}-explicit-point-object`);}
      continue;
    }
    const {points: _points,curve: _curve,...base}=node;
    const radius=Math.max(.06,Math.min(.3,Number(node.params.size??.08)*1.5));
    normalized.nodes[index]={...base,kind:'sphere',params:{radius}};
    adjustments.push(`${node.id}-volumetric-transport-marker`);
  }

  // A generated detailed asset may expose animated semantic attachment
  // points as empty groups. Empty groups cannot be inspected or framed. When
  // the group already has a real position track and a teaching identity,
  // promote it to a small tangible marker so the authored motion and object
  // mapping become visible without inventing a new process.
  for(const node of normalized.nodes){
    if(node.kind!=='group'||node.role==='decoration'||!node.represents||
      !/(?:骨架|链段|strand|backbone|attachment|附着)/i.test(semantic(node))||
      normalized.nodes.some(candidate=>candidate.parent===node.id)||
      !normalized.tracks.some(track=>track.target===node.id&&track.property==='position'))continue;
    node.kind='sphere';node.params={radius:.14};node.opacity=Math.max(node.opacity,.72);
    adjustments.push(`${node.id}-semantic-marker`);
  }

  // Custom DNA drafts occasionally represent all complementary base-pair
  // rungs as an empty point collection.  Reify that declared teaching object
  // as four bounded, inspectable rung samples around the same helix axis and
  // preserve its authored opacity timing.  This is only applied when no
  // actual points or children exist, so real custom geometry remains intact.
  for(const collection of [...normalized.nodes]){
    if(normalized.nodes.some(node=>node.kind==='model'&&node.model==='dna'))break;
    const empty=(collection.kind==='points'&&!(collection.points?.length))||
      (collection.kind==='group'&&!normalized.nodes.some(node=>node.parent===collection.id));
    if(!empty||!/(?:base[_ -]?rungs?|base[_ -]?pairs?|碱基对.*横档|互补.*配对)/i.test(semantic(collection)))continue;
    const pairIds=Array.from({length:4},(_,index)=>`${collection.id}-pair-${index}`);
    const y=[-1.2,-.4,.4,1.2],angles=[0,.85,1.7,2.55];
    const {points:_points,curve:_curve,model:_model,assemblyPort:_assemblyPort,...base}=collection;
    normalized.nodes=normalized.nodes.filter(node=>node.id!==collection.id);
    normalized.nodes.push(...pairIds.map((id,index)=>({...base,id,kind:'box' as const,role:'support' as const,
      represents:`互补碱基对横档样本 ${index+1}`,label:`碱基对 ${index+1}`,
      detail:'横档连接同一高度的两条骨架；局部分离时两半随各自骨架移动，顺序保持不变。',
      position:[0,y[index],0] as [number,number,number],rotation:[0,angles[index],0] as [number,number,number],
      scale:[1,1,1] as [number,number,number],params:{width:1.35,height:.08,depth:.1},opacity:Math.max(.7,collection.opacity),
      metalness:.2,roughness:.35,emissive:Math.max(.16,collection.emissive)})));
    normalized.tracks=normalized.tracks.flatMap(track=>track.target===collection.id
      ?pairIds.map(target=>({...track,target,keyframes:structuredClone(track.keyframes)})):[track]);
    const expand=(ids:string[],limit=12)=>[...new Set(ids.flatMap(id=>id===collection.id?pairIds:[id]))].slice(0,limit);
    for(const chapter of normalized.chapters)chapter.focus=expand(chapter.focus,8);
    for(const shot of normalized.shots)if(shot.frame)shot.frame.nodes=expand(shot.frame.nodes);
    for(const object of normalized.coverage?.objects??[])object.nodes=expand(object.nodes);
    for(const interaction of normalized.coverage?.interactions??[])interaction.targets=expand(interaction.targets);
    normalized.connections=normalized.connections.map(connection=>({
      ...connection,from:connection.from===collection.id?pairIds[0]:connection.from,to:connection.to===collection.id?pairIds.at(-1)!:connection.to,
    }));
    if(normalized.assembly){
      const placements:typeof normalized.assembly.placements=[];
      for(const placement of normalized.assembly.placements){
        if(placement.node===collection.id)continue;
        if(placement.mode==='floor')placements.push(placement);
        else placements.push({...placement,reference:placement.reference===collection.id?pairIds[0]:placement.reference});
      }
      normalized.assembly.placements=placements;
    }
    adjustments.push(`${collection.id}-base-pair-rungs`);
  }

  // The detailed DNA asset already renders both continuous backbones, every
  // base pair and its local separation. Models sometimes add empty groups or
  // tiny spheres with the same names and then try to assemble those
  // zero-volume placeholders around the real helix. Collapse only those DNA
  // teaching aliases back to the detailed asset; keep its real explode track
  // and remove the placeholder-only tracks and placements.
  const dna=normalized.nodes.find(node=>node.kind==='model'&&node.model==='dna');
  const dnaAliases=new Map<string,string>();
  if(dna){
    for(const node of normalized.nodes){
      if(node.id===dna.id)continue;
      const placeholder=node.kind==='group'||(node.kind==='sphere'&&Number(node.params.radius??1)<=.2);
      if(placeholder&&/(?:strand|backbone|base[_-]?pairs?|open[_-]?region|intact[_-]?region|骨架|碱基对|打开区域|未打开区域)/i.test(semantic(node)))
        dnaAliases.set(node.id,dna.id);
    }
  }
  if(dnaAliases.size&&dna){
    const id=(value:string)=>dnaAliases.get(value)??value;
    normalized.nodes=normalized.nodes.filter(node=>!dnaAliases.has(node.id)).map(node=>({...node,parent:node.parent?id(node.parent):node.parent}));
    normalized.tracks=normalized.tracks.filter(track=>!dnaAliases.has(track.target));
    normalized.connections=normalized.connections.map(connection=>({...connection,from:id(connection.from),to:id(connection.to)}))
      .filter(connection=>connection.from!==connection.to);
    if(normalized.assembly){
      const placements:typeof normalized.assembly.placements=[];
      for(const placement of normalized.assembly.placements){
        if(dnaAliases.has(placement.node))continue;
        if(placement.mode==='floor'){placements.push({...placement,node:id(placement.node)});continue;}
        const reference=id(placement.reference),node=id(placement.node);
        if(node!==reference)placements.push({...placement,node,reference});
      }
      normalized.assembly.placements=placements;
      if(!normalized.assembly.placements.length)delete normalized.assembly;
    }
    for(const chapter of normalized.chapters)chapter.focus=[...new Set(chapter.focus.map(id))];
    for(const shot of normalized.shots)if(shot.frame)shot.frame.nodes=[...new Set(shot.frame.nodes.map(id))];
    for(const object of normalized.coverage?.objects??[])object.nodes=[...new Set(object.nodes.map(id))];
    for(const interaction of normalized.coverage?.interactions??[])interaction.targets=[...new Set(interaction.targets.map(id))];
    for(const duplicate of dnaAliases.keys())adjustments.push(`${duplicate}-mapped-to-${dna.id}`);
  }

  // The detailed DNA renderer is itself the visible geometry for a locally
  // opened strand region. Preserve every teacher-facing object name, while
  // mapping DNA-specific names to that real molecule instead of asking a
  // model to invent a duplicate segment or an empty group.
  if(dna&&normalized.coverage){
    const dnaObject=/(?:dna|双螺旋|骨架|碱基|配对|打开|分离|链段|strand|backbone|base[_ -]?pair|helix|separat|open)/i;
    for(const name of requirements.requiredObjects??[]){
      if(!dnaObject.test(name))continue;
      const object=normalized.coverage.objects.find(item=>item.name===name);
      if(object)object.nodes=[dna.id];
      else normalized.coverage.objects.push({name,nodes:[dna.id]});
      adjustments.push(`${dna.id}-object-${normalized.coverage.objects.findIndex(item=>item.name===name)}`);
    }
  }

  // A local-separation DNA asset contains the two continuous backbones and
  // all complementary base halves inside one detailed renderer model.  Bind
  // authored separation / re-pairing requirements to that real deformation
  // instead of accepting label opacity or placeholder motion as structural
  // evidence.  Multiple requirements share one ordered explode track so the
  // same molecule opens and closes without overlay copies.
  if(dna&&requirements.interactionRequirements?.length&&normalized.coverage){
    const structural=requirements.interactionRequirements.flatMap(requirement=>{
      if(requirement.kind!=='structural-change')return[];
      const interaction=normalized.coverage!.interactions.find(item=>item.description===requirement.description);
      if(!interaction||!interaction.targets.includes(dna.id))return[];
      const chapter=normalized.chapters[interaction.chapter];
      if(!chapter)return[];
      const start=chapter.at,end=normalized.chapters[interaction.chapter+1]?.at??normalized.duration;
      return[{interaction,start,end,rejoin:/(?:重新|恢复|复配|配对|闭合|合拢|re-?pair|restore|rejoin|close)/i.test(requirement.description)}];
    });
    if(structural.length){
      dna.params={...dna.params,separation:'local',speed:0};
      const frames=new Map<number,number>([[0,0]]);
      for(const item of structural.sort((a,b)=>a.start-b.start)){
        frames.set(item.start,item.rejoin ? .72 : 0);
        frames.set(item.end,item.rejoin ? 0 : .72);
        item.interaction.targets=[dna.id];
        item.interaction.properties=item.interaction.properties.filter(property=>property!=='explore'&&property!=='explode');
        item.interaction.properties.push('explode');
      }
      frames.set(normalized.duration,frames.get(normalized.duration)??[...frames.entries()].sort((a,b)=>a[0]-b[0]).at(-1)![1]);
      const existing=normalized.tracks.find(track=>track.target===dna.id&&track.property==='explode');
      const keyframes=[...frames.entries()].sort((a,b)=>a[0]-b[0]).map(([at,value])=>({at,value}));
      if(!existing){
        normalized.tracks.push({target:dna.id,property:'explode',easing:'smooth',keyframes});
        adjustments.push(`${dna.id}-structural-pairing-track`);
      }
    }
  }
  const nodes=new Map(normalized.nodes.map(node=>[node.id,node]));

  // The same HMI needle is sometimes emitted twice under different IDs.  It
  // creates a severe overlap and falsely counts one reading as two pieces of
  // evidence.  Collapse only exact, co-located HMI indicator duplicates and
  // rewrite every stable reference to the canonical node.
  const aliases=new Map<string,string>(),indicators=new Map<string,string>();
  for(const node of normalized.nodes){
    if(!/(?:hmi|scada)/i.test(semantic(node))||!/(?:pointer|needle|指针)/i.test(semantic(node)))continue;
    const key=JSON.stringify([node.parent,node.kind,node.position,node.params,(node.represents||node.label||'').toLowerCase()]);
    const canonical=indicators.get(key);
    if(canonical)aliases.set(node.id,canonical);else indicators.set(key,node.id);
  }
  if(aliases.size){
    const id=(value:string)=>aliases.get(value)??value;
    normalized.nodes=normalized.nodes.filter(node=>!aliases.has(node.id)).map(node=>({...node,parent:node.parent?id(node.parent):node.parent}));
    const seenTracks=new Set<string>();
    normalized.tracks=normalized.tracks.flatMap(track=>{
      const target=id(track.target),key=`${target}:${track.property}`;
      if(seenTracks.has(key))return[];
      seenTracks.add(key);return[{...track,target}];
    });
    normalized.connections=normalized.connections.map(connection=>({...connection,from:id(connection.from),to:id(connection.to)}));
    if(normalized.assembly)normalized.assembly.placements=normalized.assembly.placements.map(placement=>
      placement.mode==='floor'?{...placement,node:id(placement.node)}:{...placement,node:id(placement.node),reference:id(placement.reference)});
    for(const chapter of normalized.chapters)chapter.focus=[...new Set(chapter.focus.map(id))];
    for(const shot of normalized.shots)if(shot.frame)shot.frame.nodes=[...new Set(shot.frame.nodes.map(id))];
    for(const object of normalized.coverage?.objects??[])object.nodes=[...new Set(object.nodes.map(id))];
    for(const interaction of normalized.coverage?.interactions??[])interaction.targets=[...new Set(interaction.targets.map(id))];
    for(const [duplicate,canonical] of aliases)adjustments.push(`${duplicate}-deduplicated-to-${canonical}`);
  }
  const currentNodes=new Map(normalized.nodes.map(node=>[node.id,node]));

  // A primitive's center is already its node origin. Only catalog models
  // expose named asset ports; asking the assembly solver for "center" on a
  // cylinder or box needlessly rejects an otherwise valid authored conduit.
  for(const connection of normalized.connections){
    const source=currentNodes.get(connection.from),target=currentNodes.get(connection.to);
    if(connection.fromPort==='center'&&source&&source.kind!=='model'){
      delete connection.fromPort;
      adjustments.push(`${connection.id}-primitive-source-center`);
    }
    if(connection.toPort==='center'&&target&&target.kind!=='model'){
      delete connection.toPort;
      adjustments.push(`${connection.id}-primitive-target-center`);
    }
  }

  // Processor package drafts often place the transparent protective window
  // relative to the package base even though an independently modelled die
  // sits between them.  The assembly solver then faithfully moves the window
  // into the die, and later model repairs keep changing coordinates that the
  // placement overwrites.  Bind that authored window to the actual die
  // surface so both the closed package and its translated keyframes retain a
  // real, inspectable separation.
  const processor=normalized.nodes.find(node=>node.kind==='model'&&node.model==='processor');
  const die=normalized.nodes.find(node=>node.kind==='box'&&/(?:silicon[_-]?die|硅晶片|芯片核心)/i.test(semantic(node)));
  const protectiveWindow=normalized.nodes.find(node=>node.kind==='box'&&/(?:protective[_-]?window|保护窗口|透明覆层)/i.test(semantic(node)));
  const windowPlacement=normalized.assembly?.placements.find(placement=>placement.mode==='relative'&&placement.node===protectiveWindow?.id);
  if(processor&&die&&protectiveWindow&&windowPlacement?.mode==='relative'&&windowPlacement.reference!==die.id){
    windowPlacement.reference=die.id;
    windowPlacement.side='above';
    windowPlacement.gap=Math.max(.03,Math.min(.08,windowPlacement.gap));
    adjustments.push(`${protectiveWindow.id}-processor-die-surface`);
  }

  // The assembly places these two processor layers apart at rest, but model
  // position tracks can drive the ceramic shell through the copper layer in
  // the middle of an exploded view. Keep their real boxes separated at every
  // authored motion knot without changing the rest pose or replacing either
  // detailed asset with a decorative primitive.
  const ceramic=processor&&normalized.nodes.find(node=>node.kind==='box'&&
    /(?:ceramic|陶瓷)/i.test(semantic(node))&&/(?:package|封装|外壳)/i.test(semantic(node)));
  const copperLayer=processor&&normalized.nodes.find(node=>node.kind==='box'&&
    /(?:interposer|中介层)/i.test(semantic(node)));
  const copperPlacement=normalized.assembly?.placements.find(placement=>
    placement.mode==='relative'&&placement.node===copperLayer?.id);
  if(ceramic&&copperLayer&&ceramic.parent===copperLayer.parent&&
    copperPlacement?.mode==='relative'&&copperPlacement.reference===ceramic.id&&copperPlacement.side==='above'){
    const ceramicTrack=normalized.tracks.find(track=>track.target===ceramic.id&&track.property==='position');
    const copperTrack=normalized.tracks.find(track=>track.target===copperLayer.id&&track.property==='position');
    if(ceramicTrack&&copperTrack){
      const clearance=Number(ceramic.params.height??0)/2+Number(copperLayer.params.height??0)/2+.06;
      const times=[...new Set([...ceramicTrack.keyframes,...copperTrack.keyframes].map(frame=>frame.at))].sort((a,b)=>a-b);
      for(const at of times){
        const refY=vectorAt(normalized,ceramic.id,at,ceramic.position)[1];
        const value=vectorAt(normalized,copperLayer.id,at,copperLayer.position);
        const minimum=refY+clearance;
        if(value[1]>=minimum-1e-6)continue;
        const frame=copperTrack.keyframes.find(item=>item.at===at);
        if(frame&&Array.isArray(frame.value))frame.value=[value[0],minimum,value[2]];
        else copperTrack.keyframes.push({at,value:[value[0],minimum,value[2]]});
        copperTrack.keyframes.sort((a,b)=>a.at-b.at);
        adjustments.push(`${copperLayer.id}-processor-layer-clearance-${at}`);
      }
    }
  }

  // A port placement already declares the intended mechanical relation. If
  // both endpoints are fixed asset ports, orient the placed root to make the
  // port normals face each other before the strict assembly solver translates
  // it. Generated scenes commonly choose the right ports but leave a stale
  // quarter-turn on the conduit, causing every later repair to fail before
  // geometry checks can run.
  for(const placement of normalized.assembly?.placements??[]){
    if(placement.mode!=='port')continue;
    const node=currentNodes.get(placement.node),reference=currentNodes.get(placement.reference);
    if(!node||!reference||node.kind!=='model'||reference.kind!=='model'||!node.model||!reference.model||
      normalized.tracks.some(track=>track.target===node.id&&track.property==='rotation'))continue;
    const ownPort=assetCatalog(node.model,node.params).ports[placement.port];
    const referencePort=assetCatalog(reference.model,reference.params).ports[placement.referencePort];
    if(!ownPort||!referencePort||ownPort.dynamic||referencePort.dynamic)continue;
    const worlds=worldNodes(normalized),parent=node.parent?worlds.get(node.parent)?.matrix:undefined;
    const desired=unit(transformDirection(worlds.get(reference.id)!.matrix,referencePort.normal)).map(value=>-value) as [number,number,number];
    const direction=(rotation:[number,number,number])=>unit(transformDirection(
      parent?multiply(parent,compose(node.position,rotation,node.scale)):compose(node.position,rotation,node.scale),
      ownPort.normal,
    ));
    if(dot(direction(node.rotation),desired)>=.95)continue;
    const angles=[-Math.PI,-Math.PI/2,0,Math.PI/2,Math.PI];
    const wrap=(value:number)=>Math.abs(((value+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI);
    const candidates=[node.rotation,...angles.flatMap(x=>angles.flatMap(y=>angles.map(z=>[x,y,z] as [number,number,number])))];
    const ranked=candidates.map(rotation=>({rotation,score:dot(direction(rotation),desired),distance:rotation.reduce((sum,value,axis)=>sum+wrap(value-node.rotation[axis]),0)}))
      .sort((a,b)=>b.score-a.score||a.distance-b.distance);
    if((ranked[0]?.score??-1)<.95)continue;
    node.rotation=[...ranked[0].rotation];
    adjustments.push(`${node.id}-${placement.port}-port-orientation`);
  }
  const concrete=(node:CinematicScene['nodes'][number]|undefined)=>!!node&&node.role!=='decoration'&&
    node.kind!=='group'&&(node.kind!=='points'||(node.points?.length??0)>=3);
  const normalizedText=(value:string)=>value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');

  // Requirement names are immutable identities. Generated drafts sometimes
  // use a longer semantic alias ("sectioned valve body and passage") even
  // though it already points at the correct geometry. Add the exact required
  // identity to that existing evidence instead of asking the model to rebuild
  // an otherwise valid scene.
  if(requirements.requiredObjects?.length){
    normalized.coverage??={objects:[],interactions:[]};
    for(const name of requirements.requiredObjects){
      if(normalized.coverage.objects.some(object=>object.name===name))continue;
      const wanted=normalizedText(name);
      const alias=normalized.coverage.objects.find(object=>{
        const candidate=normalizedText(object.name);
        return candidate.includes(wanted)||wanted.includes(candidate);
      });
      if(alias&&normalized.coverage.objects.length<24){
        normalized.coverage.objects.push({name,nodes:[...alias.nodes]});
        adjustments.push(`coverage-object-alias-${name}`);
      }
    }
  }

  // The player owns pause/step/seek/reset and 3D exploration. These controls
  // are real runtime capabilities, so recover only their evidence mappings;
  // no geometry or domain action is invented. This also makes old durable
  // drafts conform after a protocol upgrade.
  if(requirements.interactionRequirements?.length){
    normalized.coverage??={objects:[],interactions:[]};
    const primary=normalized.nodes.find(node=>concrete(node)&&node.role==='primary')??normalized.nodes.find(concrete);
    for(const requirement of requirements.interactionRequirements){
      if(!primary)break;
      let mapping=normalized.coverage.interactions.find(item=>item.description===requirement.description);
      if(requirement.kind==='player-control'&&requirement.controls?.length){
        let changed=false;
        if(!mapping&&normalized.coverage.interactions.length<24){
          mapping={description:requirement.description,chapter:0,targets:[primary.id],properties:['controls'],controls:[...requirement.controls]};
          normalized.coverage.interactions.push(mapping);
          changed=true;
        }else if(mapping){
          const next={...mapping,chapter:0,targets:[primary.id],properties:['controls'] as const,controls:[...requirement.controls]};
          delete next.connections;
          changed=JSON.stringify(mapping)!==JSON.stringify(next);
          if(changed)Object.assign(mapping,next);
          if(changed&&mapping.connections)delete mapping.connections;
        }
        if(changed)adjustments.push(`coverage-controls-${requirement.controls.join('-')}`);
      }else if(requirement.kind==='view'&&!mapping&&normalized.coverage.interactions.length<24){
        const mentioned=normalized.coverage.objects.filter(object=>{
          const objectName=normalizedText(object.name);
          return objectName.length>1&&normalizedText(requirement.description).includes(objectName);
        }).flatMap(object=>object.nodes).filter(id=>concrete(currentNodes.get(id)));
        mapping={description:requirement.description,chapter:0,targets:[...new Set(mentioned.length?mentioned:[primary.id])].slice(0,12),properties:['explore']};
        normalized.coverage.interactions.push(mapping);
        adjustments.push('coverage-view-runtime');
      }
    }
  }

  // Bind coverage names to the most specific concrete geometry already in the
  // scene. This repairs stale pointers such as a requested chip layer mapped
  // to the package root while preserving the original requirement name.
  for(const object of normalized.coverage?.objects??[]){
    const wanted=normalizedText(object.name);
    const owner=object.nodes.map(id=>currentNodes.get(id)).find(node=>node&&!concrete(node)&&node.parent&&concrete(currentNodes.get(node.parent)));
    if(owner?.parent){object.nodes=[owner.parent];adjustments.push(`coverage-object-${owner.parent}`);continue;}
    const ranked=normalized.nodes.filter(concrete).map(node=>{
      const represents=normalizedText(node.represents??''),label=normalizedText(node.label??''),detail=normalizedText(node.detail??'');
      const score=represents===wanted?6:label===wanted?5:represents.startsWith(wanted)?4:
        label.startsWith(wanted)?3:represents.includes(wanted)||wanted.includes(represents)?2:detail.includes(wanted)?1:0;
      return{node,score};
    }).filter(candidate=>candidate.score>0).sort((a,b)=>b.score-a.score||a.node.id.localeCompare(b.node.id));
    if(!ranked.length)continue;
    const currentScore=Math.max(0,...object.nodes.map(id=>{
      const node=currentNodes.get(id);if(!concrete(node))return 0;
      const represents=normalizedText(node!.represents??''),label=normalizedText(node!.label??''),detail=normalizedText(node!.detail??'');
      return represents===wanted?6:label===wanted?5:represents.startsWith(wanted)?4:label.startsWith(wanted)?3:represents.includes(wanted)?2:detail.includes(wanted)?1:0;
    }));
    if(ranked[0].score>currentScore){object.nodes=[ranked[0].node.id];adjustments.push(`coverage-object-${ranked[0].node.id}`);}
  }

  const trackValueAt=(track:CinematicScene['tracks'][number],at:number)=>{
    const nextIndex=track.keyframes.findIndex(frame=>frame.at>=at),next=nextIndex<0?track.keyframes.at(-1):track.keyframes[nextIndex],
      previous=nextIndex<=0?next:track.keyframes[nextIndex-1];
    if(!next||!previous||next.at===previous.at)return next?.value;
    const progress=(at-previous.at)/(next.at-previous.at);
    if(Array.isArray(next.value)&&Array.isArray(previous.value))return previous.value.map((value,index)=>value+(next.value as number[])[index]*progress-value*progress);
    return Number(previous.value)+(Number(next.value)-Number(previous.value))*progress;
  };
  const chapterTrackDelta=(track:CinematicScene['tracks'][number],chapter:number)=>{
    const start=normalized.chapters[chapter]?.at,end=normalized.chapters[chapter+1]?.at??normalized.duration;
    if(start===undefined||end<=start)return 0;
    const keys=track.keyframes.map(frame=>frame.at).filter(at=>at>start&&at<end);
    const sampled=[start,...keys,Math.max(start,end-.001)].sort((a,b)=>a-b);
    const times=[...new Set([...sampled,...sampled.slice(1).map((at,index)=>(sampled[index]+at)/2)])];
    const values=times.map(at=>trackValueAt(track,at));
    return Math.max(0,...values.flatMap(a=>values.map(b=>Array.isArray(a)&&Array.isArray(b)
      ?Math.hypot(...a.map((value,index)=>value-b[index])):Math.abs(Number(a)-Number(b)))));
  };
  const visibleInChapter=(id:string,chapter:number)=>{
    const node=currentNodes.get(id);if(!concrete(node))return false;
    const start=normalized.chapters[chapter]?.at,end=normalized.chapters[chapter+1]?.at??normalized.duration;
    if(start===undefined)return false;
    const opacityTimes=normalized.tracks.filter(track=>track.property==='opacity'&&related(id,track.target))
      .flatMap(track=>track.keyframes.map(frame=>frame.at).filter(at=>at>start&&at<end));
    return[start,start+(end-start)/2,...opacityTimes,Math.max(start,end-.001)].some(at=>{
      let opacity=1,current:typeof node|undefined=node;
      while(current){opacity*=opacityAt(normalized,current.id,at,current.opacity);current=current.parent?currentNodes.get(current.parent):undefined;}
      return opacity>=.12;
    });
  };
  const visibleTransportTrack=(track:CinematicScene['tracks'][number],chapter:number)=>{
    const owner=currentNodes.get(track.target);
    if(concrete(owner))return visibleInChapter(track.target,chapter);
    if(owner?.kind!=='group')return false;
    return normalized.nodes.some(node=>{
      if(!concrete(node)||!visibleInChapter(node.id,chapter))return false;
      let parent=node.parent;
      while(parent){
        if(parent===owner.id)return true;
        parent=currentNodes.get(parent)?.parent;
      }
      return false;
    });
  };

  // Repair evidence pointers from the authored tracks. The geometry and
  // motion must already exist; this only selects the chapter in which it is
  // actually visible and maps the real tracked property.
  const declaredInteractionKinds=new Map(
    (requirements.interactionRequirements??[]).map(requirement=>[requirement.description,requirement.kind]),
  );
  const related=(a:string,b:string)=>{
    const ancestor=(child:string,parent:string)=>{
      let id:string|undefined=child;
      while(id){if(id===parent)return true;id=currentNodes.get(id)?.parent;}
      return false;
    };
    return ancestor(a,b)||ancestor(b,a);
  };
  const frameEvidence=(targets:string[],chapter:number)=>{
    const at=normalized.chapters[chapter]?.at,end=normalized.chapters[chapter+1]?.at??normalized.duration;
    if(at===undefined)return;
    const starting=normalized.shots.findLast(item=>item.at<=at);
    const shots=normalized.shots.filter(item=>item.at>=at&&item.at<end);
    if(starting&&!shots.includes(starting))shots.unshift(starting);
    const progressiveStop=normalized.learnerControls.some(control=>control.type==='button'&&
      control.action==='play-from'&&control.at!==undefined&&control.at>=at&&control.at<end&&
      /(?:紧急停机|emergency\s*(?:stop|shutdown))/i.test(`${control.id} ${control.label}`));
    if(progressiveStop&&targets.every(id=>shots.some(shot=>shot.frame?.nodes.some(node=>related(id,node)))))return;
    for(const shot of shots){
      if(!shot.frame)continue;
      const additions=targets.filter(id=>concrete(currentNodes.get(id))&&!shot.frame!.nodes.some(node=>related(id,node)));
      if(!additions.length)continue;
      shot.frame.nodes=[...new Set([...shot.frame.nodes,...additions])].slice(0,12);
      adjustments.push(`shot-${shot.at}-interaction-evidence`);
    }
  };
  const kindProperties={
    'state-change':new Set(['opacity','emissive','position','rotation','scale']),
    'structural-change':new Set(['position','rotation','scale','explode']),
    transport:new Set(['position','rotation']),
  } as const;
  const evidenceThreshold=(property:CinematicScene['tracks'][number]['property'])=>
    property==='emissive'?.25:property==='opacity'?.18:.12;
  for(const interaction of normalized.coverage?.interactions??[]){
    if(interaction.controls?.length)continue;
    const declaredKind=declaredInteractionKinds.get(interaction.description);
    const structuralLanguage=/(?:展开|分离|复原|恢复|重新|移动|升降|转动|开|关|assemble|separate|restore|move|rotate)/i.test(interaction.description);
    const viewLike=declaredKind==='view'||(!declaredKind&&(interaction.properties.includes('explore')||
      (!structuralLanguage&&/(?:观察|查看|缩放|视角|近景|镜头|inspect|view|zoom|close[ -]?up)/i.test(interaction.description))));
    if(viewLike){
      interaction.targets=interaction.targets.filter(id=>concrete(currentNodes.get(id)));
      if(!interaction.targets.length){
        const fallback=normalized.nodes.find(node=>concrete(node)&&node.role==='primary')??normalized.nodes.find(concrete);
        if(fallback)interaction.targets=[fallback.id];
      }
      const choices=normalized.chapters.map((_,chapter)=>({chapter,score:interaction.targets.filter(id=>visibleInChapter(id,chapter)).length}))
        .sort((a,b)=>b.score-a.score||a.chapter-b.chapter);
      const currentScore=interaction.targets.filter(id=>visibleInChapter(id,interaction.chapter)).length;
      if(choices[0]?.score>currentScore&&choices[0].chapter!==interaction.chapter){
        interaction.chapter=choices[0].chapter;adjustments.push(`coverage-view-${choices[0].chapter}`);
      }
      const visibleTargets=interaction.targets.filter(id=>visibleInChapter(id,interaction.chapter));
      if(visibleTargets.length&&visibleTargets.length!==interaction.targets.length){
        interaction.targets=visibleTargets;adjustments.push(`coverage-view-visible-${interaction.chapter}`);
      }
      continue;
    }
    if(declaredKind==='transport'||(!declaredKind&&interaction.properties.includes('transport'))){
      if(interaction.targets.some(id=>normalized.tracks.some(track=>track.target===id&&track.property==='position'))&&!interaction.properties.includes('position')){
        interaction.properties=[...interaction.properties,'position'];adjustments.push(`coverage-${interaction.chapter}-transport-position`);
      }
      // A group position track moves every rendered child. Preserve a valid
      // authored whole-object movement instead of replacing it with a nearby
      // child's rotation, which cannot prove transport.
      const authoredMovement=normalized.tracks.some(track=>track.property==='position'&&
        interaction.targets.includes(track.target)&&visibleTransportTrack(track,interaction.chapter)&&
        chapterTrackDelta(track,interaction.chapter)>=evidenceThreshold('position'));
      if(authoredMovement)continue;
      const choices=normalized.chapters.map((_,chapter)=>({chapter,score:normalized.tracks.filter(track=>
        interaction.targets.some(id=>related(id,track.target))&&kindProperties.transport.has(track.property as 'position'|'rotation')&&
        visibleTransportTrack(track,chapter)&&chapterTrackDelta(track,chapter)>=evidenceThreshold(track.property))
        .reduce((sum,track)=>sum+chapterTrackDelta(track,chapter),0),
        evidence:(normalized.chapters[chapter].kind==='summary'?-1000:normalized.chapters[chapter].kind==='inspection'?-300:300)+
          (/(?:碎片|fragment|debris)/i.test(interaction.description)&&
          /(?:解体|破坏|碎片|飞散|breakup|damage|fragment)/i.test(`${normalized.chapters[chapter].title} ${normalized.chapters[chapter].caption}`)
          ?200:0)})).sort((a,b)=>(b.evidence+b.score)-(a.evidence+a.score)||a.chapter-b.chapter);
      if(choices[0]?.score>0){
        const best=choices[0];
        const tracks=normalized.tracks.filter(track=>interaction.targets.some(id=>related(id,track.target))&&
          kindProperties.transport.has(track.property as 'position'|'rotation')&&
          visibleTransportTrack(track,best.chapter)&&chapterTrackDelta(track,best.chapter)>=evidenceThreshold(track.property));
        if(best.chapter!==interaction.chapter){interaction.chapter=best.chapter;adjustments.push(`coverage-transport-${best.chapter}`);}
        interaction.targets=[...new Set(tracks.map(track=>track.target))].slice(0,12);
        interaction.properties=[...new Set([...tracks.map(track=>track.property),'transport' as const])];
        frameEvidence(interaction.targets,best.chapter);
      }
      continue;
    }
    if(declaredKind==='state-change'){
      const compatible=kindProperties['state-change'];
      const descriptionText=normalizedText(interaction.description);
      const matchingControl=normalized.learnerControls.find(item=>normalizedText(item.label).length>1&&descriptionText.includes(normalizedText(item.label)));
      const controlAt=matchingControl?.type==='button'?matchingControl.at:undefined;
      const controlChapter=controlAt!==undefined
        ?normalized.chapters.findLastIndex(chapter=>chapter.at<=controlAt):undefined;
      let candidates=normalized.tracks.filter(track=>compatible.has(track.property as 'opacity'|'emissive'|'position'|'rotation'|'scale')&&
        concrete(currentNodes.get(track.target))&&interaction.targets.some(id=>related(id,track.target)));
      if(!candidates.length){
        if(matchingControl?.type==='range')candidates=normalized.tracks.filter(track=>compatible.has(track.property as 'opacity'|'emissive'|'position'|'rotation'|'scale')&&
          concrete(currentNodes.get(track.target))&&currentNodes.get(track.target)?.role==='primary'&&track.keyframes.some(frame=>frame.at>=matchingControl.timeRange[0]&&frame.at<=matchingControl.timeRange[1]));
      }
      const choices=normalized.chapters.map((chapterValue,chapter)=>{
        const tracks=candidates.map(track=>({track,delta:chapterTrackDelta(track,chapter)}))
          .filter(item=>item.delta>=evidenceThreshold(item.track.property)&&visibleInChapter(item.track.target,chapter));
        const copy=`${chapterValue.title} ${chapterValue.caption}`;
        const semanticBonus=chapter===controlChapter?200:
          /(?:转速|speed|rpm)/i.test(interaction.description)&&/(?:转速|speed|rpm)/i.test(copy)?100:
          /(?:注入|inject)/i.test(interaction.description)&&/(?:注入|inject)/i.test(copy)?100:
            /(?:hmi|显示|读数|display)/i.test(interaction.description)&&/(?:hmi|显示|读数|display)/i.test(copy)?100:0;
        return{chapter,tracks,score:tracks.reduce((sum,item)=>sum+item.delta,0),semanticBonus};
      }).filter(choice=>choice.score>0).sort((a,b)=>(b.semanticBonus+b.score)-(a.semanticBonus+a.score)||a.chapter-b.chapter);
      const best=choices[0];
      if(best){
        interaction.chapter=best.chapter;
        interaction.targets=[...new Set(best.tracks.sort((a,b)=>b.delta-a.delta).slice(0,6).map(item=>item.track.target))];
        interaction.properties=[...new Set(best.tracks.map(item=>item.track.property))];
        frameEvidence(interaction.targets,best.chapter);
        adjustments.push(`coverage-state-${best.chapter}`);
      }
      continue;
    }
    if(declaredKind!=='structural-change'&&!/(?:展开|分离|复原|恢复|重新|移动|升降|转动|开|关|解体|破坏|assemble|separate|restore|move|rotate|break|rupture)/i.test(interaction.description))continue;
    const structural=new Set(['position','rotation','scale','explode']);
    const mapped=normalized.tracks.filter(track=>interaction.targets.includes(track.target)&&interaction.properties.includes(track.property)&&
      structural.has(track.property)&&concrete(currentNodes.get(track.target)));
    const currentScore=mapped.filter(track=>visibleInChapter(track.target,interaction.chapter))
      .reduce((sum,track)=>sum+chapterTrackDelta(track,interaction.chapter),0);
    if(declaredKind!=='structural-change'&&currentScore>.001)continue;
    const destructive=/(?:解体|破坏|断裂|破裂|碎裂|rupture|break|destroy|fragment)/i.test(interaction.description);
    let candidates=normalized.tracks.filter(track=>structural.has(track.property)&&
      (declaredKind==='structural-change'||interaction.properties.includes(track.property))&&
      interaction.targets.some(id=>related(id,track.target))&&concrete(currentNodes.get(track.target)));
    const destructiveCandidates=candidates.filter(track=>track.property!=='rotation');
    if(destructive&&destructiveCandidates.length)candidates=destructiveCandidates;
    const reverse=/(?:复原|恢复|重新|关闭|restore|reassemble|close)/i.test(interaction.description);
    const opening=/(?:展开|分离|打开|separate|open)/i.test(interaction.description);
    const reveal=/(?:隐藏|显现|出现|露出|reveal|appear)/i.test(interaction.description);
    const choices=normalized.chapters.map((chapterValue,chapter)=>({chapter,tracks:candidates.map(track=>({track,delta:chapterTrackDelta(track,chapter)}))
      .filter(item=>item.delta>=evidenceThreshold(item.track.property)&&visibleInChapter(item.track.target,chapter)),chapterValue}))
      .map(choice=>{const copy=`${choice.chapterValue.title} ${choice.chapterValue.caption}`;
        const start=choice.chapterValue.at,end=normalized.chapters[choice.chapter+1]?.at??normalized.duration;
        const newlyVisible=reveal?interaction.targets.filter(id=>{
          const node=currentNodes.get(id),track=normalized.tracks.find(item=>item.target===id&&item.property==='opacity');
          return node&&track&&opacityAt(normalized,id,start,node.opacity)<.12&&
            track.keyframes.some(frame=>frame.at>start&&frame.at<end&&Number(frame.value)>=.5);
        }).length:0;
        const semanticBonus=reverse&&/(?:复原|恢复|重新|合拢|复位|restore|reassembl|close)/i.test(copy)?100:
          opening&&/(?:展开|分离|张开|抬起|open|separat)/i.test(copy)?100:0;
        const destructiveBonus=destructive&&/(?:解体|破坏|断裂|破裂|碎裂|rupture|break|destroy|fragment)/i.test(copy)?200:0;
        return{...choice,score:choice.tracks.reduce((sum,item)=>sum+item.delta,0),semanticBonus:semanticBonus+destructiveBonus+(newlyVisible>=2?200+newlyVisible*10:0)};})
      .filter(choice=>choice.score>0)
      .sort((a,b)=>(b.semanticBonus+b.score)-(a.semanticBonus+a.score)||(reverse?b.chapter-a.chapter:a.chapter-b.chapter));
    const best=choices[0];if(!best?.score)continue;
    interaction.chapter=best.chapter;
    interaction.targets=[...new Set(best.tracks.sort((a,b)=>b.delta-a.delta).slice(0,6).map(item=>item.track.target))];
    interaction.properties=[...new Set(best.tracks.map(item=>item.track.property))];
    frameEvidence(interaction.targets,best.chapter);
    adjustments.push(`coverage-structure-${best.chapter}`);
  }

  // Keep compact semiconductor layers tangent at the restored endpoint. Model
  // drafts often mix a child-local substrate coordinate with root-world layer
  // coordinates, producing a late reassembly overlap despite a correct visual
  // stack. Shift the substrate and its authored position track together.
  const substrate=normalized.nodes.find(node=>node.kind==='box'&&/(?:substrate|基板)/i.test(semantic(node))),
    interposer=normalized.nodes.find(node=>node.kind==='box'&&/(?:interposer|中介层)/i.test(semantic(node)));
  if(substrate&&interposer&&substrate.parent){
    const placement=normalized.assembly?.placements.find(item=>item.node===substrate.id);
    if(placement&&placement.mode==='relative'&&placement.side==='below'){
      if(placement.gap<.5){placement.gap=.5;adjustments.push(`${substrate.id}-stack-clearance`);}
      const fixedTrack=normalized.tracks.find(track=>track.target===substrate.id&&track.property==='position');
      const fixed=fixedTrack?.keyframes.find(frame=>Array.isArray(frame.value))?.value;
      if(fixedTrack&&Array.isArray(fixed)){
        for(const frame of fixedTrack.keyframes)frame.value=[...fixed];
        adjustments.push(`${substrate.id}-fixed-support`);
        for(const interaction of normalized.coverage?.interactions??[]){
          if(!interaction.targets.includes(substrate.id)||!/(?:复原|恢复|重新|复位|restore|reassembl)/i.test(interaction.description))continue;
          const candidates=normalized.tracks.filter(track=>track.property==='position'&&track.target!==substrate.id&&
            concrete(currentNodes.get(track.target))&&chapterTrackDelta(track,interaction.chapter)>.001);
          if(candidates.length){interaction.targets=candidates.slice(0,6).map(track=>track.target);interaction.properties=[...new Set<NonNullable<CinematicScene['coverage']>['interactions'][number]['properties'][number]>([...interaction.properties,'position'])];}
        }
      }
    }else{
    const parent=currentNodes.get(substrate.parent),substrateTrack=normalized.tracks.find(track=>track.target===substrate.id&&track.property==='position'),
      interposerTrack=normalized.tracks.find(track=>track.target===interposer.id&&track.property==='position');
    const substrateEnd=(substrateTrack?trackValueAt(substrateTrack,normalized.duration):substrate.position) as number[],
      interposerEnd=(interposerTrack?trackValueAt(interposerTrack,normalized.duration):interposer.position) as number[];
    const substrateWorldY=(parent?.position[1]??0)+substrateEnd[1],interposerWorldY=interposerEnd[1],
      gap=Number(substrate.params.height??0)/2+Number(interposer.params.height??0)/2+.03;
    if(substrateWorldY>interposerWorldY-gap){
      const delta=interposerWorldY-gap-substrateWorldY;
      substrate.position=[substrate.position[0],substrate.position[1]+delta,substrate.position[2]];
      if(substrateTrack)for(const frame of substrateTrack.keyframes)if(Array.isArray(frame.value))frame.value=[frame.value[0],frame.value[1]+delta,frame.value[2]];
      adjustments.push(`${substrate.id}-stack-clearance`);
    }
    }
  }

  // Connections created through compiler ports use decoration groups as their
  // endpoints.  Coverage must name the visible endpoint owners so the strict
  // transport gate can verify both ends of every animated path.
  const endpointOwner=(target:string)=>{
    let node=currentNodes.get(target);
    while(node?.parent&&node.role==='decoration')node=currentNodes.get(node.parent);
    return node?.id??target;
  };
  for(const interaction of normalized.coverage?.interactions??[]){
    if(!interaction.properties.includes('transport')||!interaction.connections?.length)continue;
    const links=normalized.connections.filter(connection=>interaction.connections!.includes(connection.id));
    interaction.targets=[...new Set([...interaction.targets,...links.flatMap(link=>[endpointOwner(link.from),endpointOwner(link.to)])])].slice(0,12);
    if(links.length)adjustments.push(`coverage-${interaction.chapter}-transport-endpoints`);
  }

  // Thin dial needles that are authored as vertical boxes must turn in their
  // panel plane. Models often put the angle on Y, which merely rolls the thin
  // cross-section and leaves the reading visually unchanged. Preserve the
  // authored angle progression while moving it onto Z for a readable dial.
  for(const pointer of normalized.nodes.filter(node=>node.kind==='box'&&/(?:pointer|needle|指针)/i.test(semantic(node))&&
    Number(node.params.height??0)>Math.max(Number(node.params.width??0),Number(node.params.depth??0))*2)){
    const panel=pointer.parent?currentNodes.get(pointer.parent):undefined;
    if(panel?.kind==='model'&&panel.model&&/(?:hmi|scada|display|显示|面板)/i.test(semantic(panel))){
      // The nested display port is not in the scene node's coordinate plane;
      // use the actual rendered front bound for drive pointers.
      const front=assetCatalog(panel.model,panel.params).bounds.max[2]+(panel.model==='industrial-drive'?.06:.14);
      if(pointer.position[2]<front){pointer.position=[pointer.position[0],pointer.position[1],front];adjustments.push(`${pointer.id}-panel-front`);}
    }
    const track=normalized.tracks.find(item=>item.target===pointer.id&&item.property==='rotation');
    if(!track)continue;
    const values=track.keyframes.filter(frame=>Array.isArray(frame.value)).map(frame=>frame.value as [number,number,number]);
    if(values.length<2)continue;
    const range=(axis:number)=>Math.max(...values.map(value=>value[axis]))-Math.min(...values.map(value=>value[axis]));
    const dominant=range(0)>range(1)?0:1;
    if(range(2)>=.12||range(dominant)<.12)continue;
    const origin=values[0];
    for(const frame of track.keyframes)if(Array.isArray(frame.value)){
      const value=frame.value as [number,number,number];
      frame.value=[origin[0],origin[1],origin[2]+value[dominant]-origin[dominant]];
    }
    adjustments.push(`${pointer.id}-dial-plane-rotation`);
  }

  // A truthful "normal" HMI reading may move only slightly inside its safe
  // band. Give a pointer that is static inside its mapped chapter a bounded
  // visible sweep so HMI and physical channels are independently observable
  // without implying an alarm or relying on motion from another chapter.
  for(const pointer of normalized.nodes.filter(node=>/(?:hmi|scada)/i.test(semantic(node))&&/(?:pointer|needle|指针)/i.test(semantic(node)))){
    const interaction=normalized.coverage?.interactions.find(item=>item.targets.includes(pointer.id)&&/(?:hmi|显示|display)/i.test(item.description));
    const chapter=interaction&&normalized.chapters[interaction.chapter];
    if(!interaction||!chapter)continue;
    if(declaredInteractionKinds.get(interaction.description)==='view')continue;
    const end=normalized.chapters[interaction.chapter+1]?.at??normalized.duration;
    let track=normalized.tracks.find(item=>item.target===pointer.id&&item.property==='rotation');
    if(!track){
      track={target:pointer.id,property:'rotation',easing:'smooth',keyframes:[{at:0,value:[...pointer.rotation]},{at:normalized.duration,value:[...pointer.rotation]}]};
      normalized.tracks.push(track);
    }
    const values=[vectorPropertyAt(normalized,pointer.id,'rotation',chapter.at,pointer.rotation),
      vectorPropertyAt(normalized,pointer.id,'rotation',Math.max(chapter.at+.5,end-.001),pointer.rotation)];
    const magnitude=Math.max(0,...values.flatMap(a=>values.map(b=>Math.hypot(...a.map((value,index)=>value-b[index])))));
    if(magnitude>=.18)continue;
    const startValue=vectorPropertyAt(normalized,pointer.id,'rotation',chapter.at,pointer.rotation);
    const upsert=(at:number,value:[number,number,number])=>{
      const existing=track!.keyframes.find(frame=>Math.abs(frame.at-at)<.001);
      if(existing)existing.value=value;else track!.keyframes.push({at,value});
    };
    upsert(chapter.at,startValue);
    upsert(Math.max(chapter.at+.5,end-.001),[startValue[0],startValue[1],startValue[2]+.22]);
    track.keyframes.sort((a,b)=>a.at-b.at);
    interaction.properties=[...new Set<NonNullable<CinematicScene['coverage']>['interactions'][number]['properties'][number]>([...interaction.properties,'rotation'])];
    adjustments.push(`${pointer.id}-normal-band-sweep`);
  }

  // A sectioned valve that carries separately animated internals must retain
  // its body as context without hiding those teaching parts from every view.
  // Opacity is inherited by descendants, so the old .18 shell treatment also
  // reduced every gate, stem and flow marker to 18% of its authored opacity.
  // A moderately translucent casting preserves both the housing and internals.
  for(const body of normalized.nodes.filter(node=>node.model==='valve')){
    const internals=normalized.nodes.filter(node=>node.parent===body.id&&node.role!=='decoration');
    const lessonText=[body.represents,body.detail,...normalized.chapters.map(chapter=>`${chapter.title} ${chapter.caption}`)].join(' ');
    if(internals.length>=2&&/(?:剖|内部|阀芯|阀杆|section|internal|stem|gate)/i.test(lessonText)&&body.opacity>.62){
      body.opacity=.62;
      adjustments.push(`${body.id}-section-visibility`);
    }

    // Generated valve lessons frequently contain the right semantic parts but
    // draw the two flow tubes vertically at arbitrary offsets. Anchor the
    // internal passage to the catalog's real inlet/outlet ports, leave a small
    // gate gap at the center, and drive the tangible marker across that exact
    // local path. This is a deterministic geometric repair, not a flow model.
    const ports=assetCatalog('valve',body.params).ports,inlet=ports.inlet?.position,outlet=ports.outlet?.position;
    const channels=internals.filter(node=>node.kind==='tube'&&/(?:flow|passage|流道)/i.test(semantic(node)));
    const marker=internals.find(node=>node.kind==='sphere'&&/(?:flow|流向|流体|介质)/i.test(semantic(node)));
    if(inlet&&outlet&&channels.length>=2&&marker){
      const left=inlet[0]<=outlet[0]?inlet:outlet,right=inlet[0]<=outlet[0]?outlet:inlet;
      const y=(left[1]+right[1])/2,z=Math.max(left[2],right[2])+.06,gap=.22;
      const ordered=channels.toSorted((a,b)=>a.position[0]-b.position[0]);
      const paths:[number,number,number][][]=[
        [[left[0],y,z],[-gap,y,z]],
        [[gap,y,z],[right[0],y,z]],
      ];
      for(const [index,channel] of ordered.slice(0,2).entries()){
        channel.position=[0,0,0];channel.rotation=[0,0,0];channel.scale=[1,1,1];
        channel.points=paths[index] as [number,number,number][];
        channel.opacity=Math.max(channel.opacity,.78);
        adjustments.push(`${channel.id}-valve-port-path`);
      }
      marker.position=[left[0],y,z];marker.opacity=Math.max(marker.opacity,.9);
      const positionTrack=normalized.tracks.find(track=>track.target===marker.id&&track.property==='position');
      if(positionTrack){
        const vectorFrames=positionTrack.keyframes.filter(frame=>Array.isArray(frame.value));
        const authored=vectorFrames.map(frame=>(frame.value as [number,number,number])[0]);
        const min=Math.min(...authored),max=Math.max(...authored),span=Math.max(.001,max-min);
        for(const frame of vectorFrames){
          const progress=((frame.value as [number,number,number])[0]-min)/span;
          frame.value=[left[0]+(right[0]-left[0])*progress,y,z];
        }
        const summaryAt=normalized.chapters.find(chapter=>chapter.kind==='summary')?.at;
        if(summaryAt!==undefined){
          const held:[number,number,number]=[right[0],y,z];
          for(const frame of positionTrack.keyframes)if(frame.at>=summaryAt)frame.value=held;
          const existing=positionTrack.keyframes.find(frame=>Math.abs(frame.at-summaryAt)<.001);
          if(existing)existing.value=held;else positionTrack.keyframes.push({at:summaryAt,value:held});
          positionTrack.keyframes.sort((a,b)=>a.at-b.at);
        }
        adjustments.push(`${marker.id}-valve-port-transport`);
      }
      const opacityTrack=normalized.tracks.find(track=>track.target===marker.id&&track.property==='opacity');
      if(opacityTrack){
        for(const frame of opacityTrack.keyframes)frame.value=1;
        adjustments.push(`${marker.id}-closed-state-visible`);
      }
      const referenced=new Set((normalized.coverage?.interactions??[]).flatMap(interaction=>interaction.connections??[]));
      normalized.connections=normalized.connections.filter(connection=>{
        const decorative=connection.particles===0&&!referenced.has(connection.id)&&
          /(?:flow|介质|流向|流道)/i.test(`${connection.id} ${connection.label??''}`);
        if(decorative)adjustments.push(`${connection.id}-redundant-static-flow-line`);
        return !decorative;
      });
    }
  }

  // Some valid custom lessons construct a valve entirely from primitives.
  // An opaque full box named "cutaway body" still hides every passage, seat
  // and marker because labels do not alter geometry. Retain the casting as a
  // translucent section and make the cylindrical passage/seat readable. The
  // moving gate, stem and flow markers remain fully opaque independent roots.
  for(const body of normalized.nodes.filter(node=>node.kind==='box'&&node.role==='primary'&&
    /(?:valve[_-]?body|闸阀阀体|阀体)/i.test(semantic(node)))){
    const parts=normalized.nodes.filter(node=>node.id!==body.id&&/(?:gate|stem|flow[_-]?passage|seat|闸板|阀芯|阀杆|流道|阀座)/i.test(semantic(node)));
    if(!parts.some(node=>/(?:flow[_-]?passage|流道)/i.test(semantic(node)))||
      !parts.some(node=>/(?:gate|闸板|阀芯)/i.test(semantic(node))))continue;
    if(body.opacity>.18){body.opacity=.18;adjustments.push(`${body.id}-primitive-section-visibility`);}
    for(const part of parts.filter(node=>node.kind==='cylinder'&&/(?:flow[_-]?passage|流道)/i.test(semantic(node))))
      if(part.opacity>.28){part.opacity=.28;adjustments.push(`${part.id}-primitive-passage-visibility`);}
    for(const part of parts.filter(node=>/(?:seat|阀座)/i.test(semantic(node))))
      if(part.opacity>.48){part.opacity=.48;adjustments.push(`${part.id}-primitive-seat-visibility`);}
  }

  // Unsupported explode values have no rendered effect. Preserve a bounded,
  // visible root deformation when they change; discard a no-op track.
  normalized.tracks=normalized.tracks.flatMap(track=>{
    if(track.property!=='explode')return[track];
    const target=nodes.get(track.target);
    if(!target?.model||assetCatalog(target.model,target.params).actionHints.some(action=>action.property==='explode'))return[track];
    const values=track.keyframes.map(frame=>Number(frame.value));
    const changing=new Set(values.map(value=>value.toFixed(6))).size>1;
    const duplicate=normalized.tracks.some(other=>other!==track&&other.target===track.target&&other.property==='scale');
    adjustments.push(`${track.target}-unsupported-explode`);
    if(!changing||duplicate)return[];
    for(const interaction of normalized.coverage?.interactions??[])
      if(interaction.targets.includes(track.target)&&interaction.properties.includes('explode')&&!interaction.properties.includes('scale'))
        interaction.properties=[...interaction.properties,'scale'];
    return [{...track,property:'scale' as const,keyframes:track.keyframes.map(frame=>{
      const value=Number(frame.value);
      return{...frame,value:[1+value*.08,1-value*.12,1+value*.08] as [number,number,number]};
    })}];
  });

  // A closed gate should touch both seats without intersecting their volumes.
  const plates=normalized.nodes.filter(node=>node.kind==='box'&&/(?:gate[_-]?plate|闸板|阀芯)/i.test(semantic(node)));
  for(const plate of plates){
    const host=plate.parent?nodes.get(plate.parent):undefined;
    const seats=normalized.nodes.filter(node=>node.kind==='box'&&/(?:seat|阀座)/i.test(semantic(node))&&
      (!host||node.parent===host.parent||node.parent===host.id));
    const plateHalf=Number(plate.params.width??0)/2;
    for(const seat of seats){
      const half=Number(seat.params.width??0)/2;
      if(!plateHalf||!half)continue;
      const side=seat.position[0]<0?-1:1,target=side*(plateHalf+half+.015);
      if(side*seat.position[0]<Math.abs(target)){
        seat.position=[target,seat.position[1],seat.position[2]];
        adjustments.push(`${seat.id}-gate-clearance`);
      }
    }
  }

  // Reveal fragments only after they clear their source shell, and fan each
  // machine's fragments outward while retaining authored onset/reset times.
  const housings=normalized.nodes.filter(node=>node.model==='centrifuge-housing');
  const originalWorlds=worldNodes(normalized);
  // A shaft, rotor and stripe can share an independent rotation group. Fit
  // the already centered rotor to the same catalog cavity as a direct child,
  // preserving that group, its tracks and domain angular-velocity binding.
  for(const housing of housings){
    const ports=assetCatalog('centrifuge-housing',housing.params).ports,center=ports['rotor-center'].position;
    const cavityRadius=Math.abs(ports['cavity-front'].position[2]-center[2]);
    const cavityHeight=Math.abs(ports['rotor-top'].position[1]-ports['rotor-bottom'].position[1]);
    for(const rotor of normalized.nodes.filter(node=>isCinematicRotorBody(node)&&
      node.parent!==housing.id&&normalized.nodes.some(parent=>parent.id===node.parent&&parent.kind==='group')&&
      /rotor|转子/i.test(semantic(node)))){
      const relative=multiply(inverse(originalWorlds.get(housing.id)!.matrix),originalWorlds.get(rotor.id)!.matrix);
      const position=transformPoint(relative,[0,0,0]);
      if(Math.hypot(...position.map((value,axis)=>value-center[axis]))>cavityRadius*.25)continue;
      const axis=transformDirection(relative,[0,1,0]);
      if(Math.abs(unit(axis)[1])<.999)continue;
      const radialScale=Math.max(Math.hypot(...transformDirection(relative,[1,0,0])),Math.hypot(...transformDirection(relative,[0,0,1])));
      const radiusLimit=cavityRadius*.72/radialScale,heightLimit=cavityHeight*.86/Math.hypot(...axis);
      const top=Math.min(Number(rotor.params.top??.5),radiusLimit),bottom=Math.min(Number(rotor.params.bottom??.5),radiusLimit),radius=Math.max(top,bottom);
      const height=Math.min(Number(rotor.params.height??2),heightLimit);
      if(top!==rotor.params.top||bottom!==rotor.params.bottom||height!==rotor.params.height){
        rotor.params={...rotor.params,top,bottom,height};adjustments.push(`${rotor.id}-grouped-cavity-fit`);
      }
      for(const stripe of normalized.nodes.filter(node=>node.parent===rotor.parent&&['box','plane'].includes(node.kind)&&
        /stripe|marker|示踪|条纹|标记/i.test(semantic(node))&&Number(node.params.height??0)>=height*.45)){
        if(normalized.nodes.filter(node=>node.parent===rotor.parent&&isCinematicRotorBody(node)&&/rotor|转子/i.test(semantic(node))).length!==1||
          normalized.tracks.some(track=>track.target===stripe.id&&['position','rotation'].includes(track.property))||
          normalized.assembly?.placements.some(placement=>placement.node===stripe.id))continue;
        const front=rotor.position[2]+radius*1.1;
        if(stripe.position[2]!==front||Number(stripe.params.height??0)>height*.9){
          stripe.position[2]=front;stripe.params.height=Math.min(Number(stripe.params.height??0),height*.9);
          adjustments.push(`${stripe.id}-grouped-rotor-surface`);
        }
      }
    }
  }
  for(const housing of housings){
    const fragments=normalized.nodes.filter(node=>node.parent===housing.id&&/(?:debris|fragment|shard|碎片|断片)/i.test(semantic(node)));
    fragments.forEach((fragment,index)=>{
      const position=normalized.tracks.find(track=>track.target===fragment.id&&track.property==='position');
      const opacity=normalized.tracks.find(track=>track.target===fragment.id&&track.property==='opacity');
      if(!position||!opacity)return;
      const rise=opacity.keyframes.findIndex((frame,i)=>i>0&&Number(opacity.keyframes[i-1].value)<=.12&&Number(frame.value)>=.65);
      if(rise<1)return;
      const launch=opacity.keyframes[rise-1].at,visible=opacity.keyframes[rise].at;
      const reset=opacity.keyframes.find((frame,i)=>i>rise&&Number(frame.value)<=.12)?.at;
      const start=position.keyframes.find(frame=>Array.isArray(frame.value))?.value;
      if(!Array.isArray(start)||visible<=launch)return;
      const outward=housing.position[0]<-.1?-1:housing.position[0]>.1?1:index%2?1:-1;
      const raw:[number,number,number]=[outward*(1+.3*index),index%3===1?-.65:.8+.22*index,1.05+.22*index];
      const magnitude=Math.hypot(...raw),direction=raw.map(value=>value/magnitude) as [number,number,number];
      const activeEnd=(reset??normalized.duration)-.001;
      for(const frame of position.keyframes){
        if(!Array.isArray(frame.value)||frame.at<=launch||(reset!==undefined&&frame.at>=reset))continue;
        const progress=Math.max(0,Math.min(1,(frame.at-launch)/Math.max(1,activeEnd-launch)));
        const distance=1.8+progress*3.2;
        frame.value=start.map((value,axis)=>value+direction[axis]*distance) as [number,number,number];
      }
      if(!position.keyframes.some(frame=>Math.abs(frame.at-visible)<.001)){
        position.keyframes.push({at:visible,value:start.map((value,axis)=>value+direction[axis]*1.8) as [number,number,number]});
        position.keyframes.sort((a,b)=>a.at-b.at);
      }
      const hold=visible-Math.min(.25,(visible-launch)/3);
      if(hold>launch+.001&&!opacity.keyframes.some(frame=>Math.abs(frame.at-hold)<.001)){
        opacity.keyframes.push({at:hold,value:0});
        opacity.keyframes.sort((a,b)=>a.at-b.at);
      }
      adjustments.push(`${fragment.id}-launch-clearance`);
    });
  }

  // A dedicated damage close-up must begin at the action chapter boundary.
  const used=new Set<number>();
  for(const chapter of normalized.chapters){
    if(!/(?:破坏|解体|碎裂|damage|destruction|breakup)/i.test(`${chapter.title} ${chapter.caption}`))continue;
    const fragmentFocus=chapter.focus.filter(id=>{
      const target=nodes.get(id);return target&&/(?:debris|fragment|shard|碎片|断片)/i.test(semantic(target));
    });
    if(fragmentFocus.length<2)continue;
    const focus=new Set(chapter.focus);
    const candidates=normalized.shots.map((shot,index)=>({shot,index,overlap:shot.frame?.nodes.filter(id=>focus.has(id)).length??0}))
      .filter(candidate=>candidate.overlap>=2&&!used.has(candidate.index)).sort((a,b)=>b.overlap-a.overlap||a.index-b.index);
    const selected=candidates[0];
    if(!selected||selected.shot.at<=chapter.at)continue;
    const previous=normalized.shots[selected.index-1],next=normalized.shots[selected.index+1];
    if((previous&&previous.at>=chapter.at)||(next&&next.at<=chapter.at))continue;
    adjustments.push(`shot-${selected.shot.at}-damage-start`);
    selected.shot.at=chapter.at;
    used.add(selected.index);
  }
  normalized.shots.sort((a,b)=>a.at-b.at);

  // Normalize the emergency boundary and tail for every rotor.  Generated
  // timelines sometimes repeat the previous angle exactly at the stop time,
  // which makes the measured incoming speed zero, then jump backwards to an
  // arbitrary reset angle.  Preserve the latest real angular velocity at the
  // boundary, decelerate, and hold the final angle until reset is requested.
  const emergency=normalized.learnerControls.find(control=>control.type==='button'&&['seek','play-from'].includes(control.action)&&control.at!==undefined&&
    /(?:紧急停机|emergency\s*(?:stop|shutdown))/i.test(`${control.id} ${control.label}`));
  if(emergency?.type==='button'&&emergency.at!==undefined){
    for(const rotor of normalized.nodes.filter(node=>isCinematicRotorBody(node)&&nodes.get(node.parent||'')?.model==='centrifuge-housing')){
      const track=normalized.tracks.find(item=>item.target===rotor.id&&item.property==='rotation');
      if(!track)continue;
      track.keyframes.sort((a,b)=>a.at-b.at);
      const exact=track.keyframes.find(frame=>Math.abs(frame.at-emergency.at!)<.001);
      const tail=track.keyframes.filter(frame=>frame.at>emergency.at!&&Array.isArray(frame.value));
      const decelAt=Math.min(normalized.duration-1,emergency.at+Math.max(1,Math.min(3,(normalized.duration-emergency.at)/3)));
      const sameVector=(a:unknown,b:unknown)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
        a.every((value,index)=>Math.abs(Number(value)-Number(b[index]))<.001);
      // Only the exact two-keyframe deceleration shape is a receipt. A model
      // can author an accelerating 70→74 segment followed by a flat 78→80
      // hold, which must not be mistaken for a previous normalization pass.
      const receiptDelta=exact&&Array.isArray(exact.value)&&Array.isArray(tail.at(-1)?.value)
        ?Math.abs((tail.at(-1)!.value as number[])[1]-exact.value[1]):0;
      const before=track.keyframes.filter(frame=>frame.at<emergency.at!&&Array.isArray(frame.value));
      let moving:{a:typeof track.keyframes[number];b:typeof track.keyframes[number];velocity:number}|undefined;
      for(let index=before.length-1;index>0;index--){
        const a=before[index-1],b=before[index],dt=b.at-a.at;
        if(dt<=0||!Array.isArray(a.value)||!Array.isArray(b.value))continue;
        const velocity=(b.value[1]-a.value[1])/dt;
        if(Math.abs(velocity)>1e-6){moving={a,b,velocity};break;}
      }
      const preceding=before.at(-1);
      const incomingRate=exact&&preceding&&Array.isArray(exact.value)&&Array.isArray(preceding.value)
        ?Math.abs((exact.value[1]-preceding.value[1])/(exact.at-preceding.at)):Math.abs(moving?.velocity??0);
      const receiptRate=tail[0]&&exact&&Array.isArray(tail[0].value)&&Array.isArray(exact.value)
        ?Math.abs((tail[0].value[1]-exact.value[1])/(tail[0].at-exact.at)):Infinity;
      if(emergency.action==='play-from'&&exact&&tail.length>=2&&incomingRate>1e-6){
        const post=[exact,...tail].slice(1).map((frame,index)=>{
          const previous=[exact,...tail][index];
          return Array.isArray(frame.value)&&Array.isArray(previous.value)
            ?Math.abs((frame.value[1]-previous.value[1])/(frame.at-previous.at)):Infinity;
        });
        const travel=Array.isArray(tail.at(-1)?.value)&&Array.isArray(exact.value)
          ?Math.abs((tail.at(-1)!.value as number[])[1]-exact.value[1]):0;
        if(travel>=.6&&post[0]<=incomingRate*.85&&post.at(-1)!<1e-6&&
          post.every((rate,index)=>index===0||rate<=post[index-1]+1e-6))continue;
      }
      if(exact&&tail.length===2&&Math.abs(tail[0].at-decelAt)<.001&&
         Math.abs(tail[1].at-normalized.duration)<.001&&
         sameVector(tail[0].value,tail[1].value)&&receiptDelta>1e-6&&
         incomingRate>1e-6&&receiptRate<=incomingRate*.85)continue;
      const sampled=vectorPropertyAt(normalized,rotor.id,'rotation',emergency.at,rotor.rotation);
      const previous=before.at(-1),incoming=moving&&previous&&Array.isArray(previous.value)
        ? [sampled[0],previous.value[1]+moving.velocity*(emergency.at-previous.at),sampled[2]] as [number,number,number]
        : sampled;
      if(exact)exact.value=incoming;else track.keyframes.push({at:emergency.at,value:incoming});
      const visibleDelta=(moving?.velocity??0)*(decelAt-emergency.at)*.65;
      const stopped:[number,number,number]=[incoming[0],incoming[1]+visibleDelta,incoming[2]];
      track.keyframes=track.keyframes.filter(frame=>frame.at<=emergency.at!);
      track.keyframes.push({at:decelAt,value:stopped},{at:normalized.duration,value:stopped});
      track.keyframes.sort((a,b)=>a.at-b.at);
      while(track.keyframes.length>24){
        const removable=track.keyframes.map((frame,index)=>({frame,index})).filter(({index,frame})=>index>0&&index<track.keyframes.length-2&&Math.abs(frame.at-emergency.at!)>.001)
          .sort((a,b)=>Math.abs(a.frame.at-emergency.at!)-Math.abs(b.frame.at-emergency.at!))[0];
        if(!removable)break;track.keyframes.splice(removable.index,1);
      }
      adjustments.push(`${rotor.id}-emergency-keyframe`);
    }
  }

  // Repair two high-value mappings whose generated text is usually correct
  // while their evidence IDs or chapter index drift.  This changes evidence
  // pointers only; it never fabricates missing geometry or motion.
  const rotors=normalized.nodes.filter(node=>isCinematicRotorBody(node)&&currentNodes.get(node.parent||'')?.model==='centrifuge-housing');
  if(emergency?.type==='button'&&emergency.at!==undefined&&rotors.length){
    const progressiveStop=emergency.action==='play-from';
    const stopChapter=Math.max(0,normalized.chapters.findLastIndex((chapter,index)=>
      chapter.at<=emergency.at!&&(normalized.chapters[index+1]?.at??normalized.duration)>=emergency.at!));
    const compatible=new Set<CinematicScene['tracks'][number]['property']>(['opacity','emissive','position','rotation','scale']);
    const visibleRotorTracks=normalized.tracks.filter(track=>track.property==='rotation'&&rotors.some(rotor=>rotor.id===track.target)&&
      (progressiveStop||visibleInChapter(track.target,stopChapter))&&chapterTrackDelta(track,stopChapter)>=evidenceThreshold(track.property));
    const stopSemantic=/(?:紧急|停机|急停|断开|断口|链路|状态|转速|指针|显示|注入|emergency|stop|shutdown|disconnect|break|link|state|speed|pointer|needle|hmi|inject)/i;
    const visibleStopTracks=normalized.tracks.filter(track=>{
      const node=currentNodes.get(track.target);
      return node&&concrete(node)&&compatible.has(track.property)&&stopSemantic.test(semantic(node))&&
        (progressiveStop||visibleInChapter(track.target,stopChapter))&&chapterTrackDelta(track,stopChapter)>=evidenceThreshold(track.property);
    }).sort((a,b)=>chapterTrackDelta(b,stopChapter)-chapterTrackDelta(a,stopChapter));
    const evidenceTracks=(progressiveStop?[...visibleRotorTracks,...visibleStopTracks.filter(track=>
      !visibleRotorTracks.some(rotorTrack=>rotorTrack.target===track.target&&rotorTrack.property===track.property))]:
      visibleRotorTracks.length?visibleRotorTracks:visibleStopTracks).slice(0,12);
    const evidenceTargets=[...new Set(evidenceTracks.map(track=>track.target))];
    const evidenceProperties=[...new Set(evidenceTracks.map(track=>track.property))];
    for(const interaction of normalized.coverage?.interactions??[]){
      if(!/(?:紧急停机|emergency\s*(?:stop|shutdown))/i.test(interaction.description))continue;
      const targets=evidenceTargets.length?evidenceTargets:rotors.map(rotor=>rotor.id).slice(0,12);
      const properties=evidenceProperties.length?evidenceProperties:['rotation' as const];
      const changed=interaction.chapter!==stopChapter||interaction.properties.length!==properties.length||
        properties.some(property=>!interaction.properties.includes(property))||interaction.targets.length!==targets.length||
        targets.some(target=>!interaction.targets.includes(target));
      interaction.chapter=stopChapter;
      interaction.targets=targets;
      interaction.properties=properties;
      if(interaction.connections)delete interaction.connections;
      if(interaction.controls)delete interaction.controls;
      // Do not widen the destruction close-up that happens to precede this
      // chapter. Give the stop transition its own fit: first the physical
      // rotor evidence, then the panel/link evidence already named by the
      // chapter. This prevents a single auto-fit from spanning distant debris,
      // three machines and the HMI and shrinking every subject to a speck.
      const chapter=normalized.chapters[stopChapter],chapterEnd=normalized.chapters[stopChapter+1]?.at??normalized.duration;
      const previous=normalized.shots.findLast(shot=>shot.at<chapter.at);
      if(previous?.frame){
        const prior=normalized.chapters[stopChapter-1];
        const priorFocus=(prior?.focus??[]).filter(id=>concrete(currentNodes.get(id))).slice(0,6);
        if(priorFocus.length)previous.frame.nodes=priorFocus;
      }
      let exact=normalized.shots.find(shot=>shot.at===chapter.at);
      if(!exact&&previous){
        exact=structuredClone(previous);exact.at=chapter.at;
        normalized.shots.push(exact);normalized.shots.sort((a,b)=>a.at-b.at);
        adjustments.push(`shot-${chapter.at}-emergency-boundary`);
      }
      const panelFocus=chapter.focus.filter(id=>{
        const node=currentNodes.get(id);
        return concrete(node)&&node!.kind!=='model'&&/(?:hmi|scada|physical|pointer|needle|link|display|仪表|指针|链路|显示)/i.test(semantic(node!));
      }).slice(0,6);
      const exactFocus=(progressiveStop?[...new Set([...targets,...panelFocus,
        ...chapter.focus.filter(id=>/(?:inject|注入)/i.test(semantic(currentNodes.get(id)!)))])]:
        visibleRotorTracks.length?targets:panelFocus.length?panelFocus:targets)
        .filter(id=>concrete(currentNodes.get(id))).slice(0,6);
      if(exact?.frame)exact.frame.nodes=exactFocus;
      if(visibleRotorTracks.length){
        const rotorTargets=targets.filter(id=>rotors.some(rotor=>rotor.id===id)).slice(0,3);
        if(rotorTargets.length){
          if(progressiveStop){
            const marker=exactFocus.find(id=>/(?:inject|注入)/i.test(semantic(currentNodes.get(id)!)));
            const dial=exactFocus.find(id=>/(?:physical|物理)/i.test(semantic(currentNodes.get(id)!))&&
              /(?:pointer|needle|指针)/i.test(semantic(currentNodes.get(id)!)));
            if(marker&&exact&&normalized.shots.length<20&&
              !normalized.shots.some(shot=>Math.abs(shot.at-(chapter.at+1))<.001)){
              const markerShot=structuredClone(exact);
              markerShot.at=chapter.at+1;
              normalized.shots.push(markerShot);
              normalized.shots.sort((a,b)=>a.at-b.at);
            }
            const sequence=[rotorTargets[0],marker,rotorTargets[1],rotorTargets[2],dial]
              .filter((id):id is string=>!!id);
            const stopShots=normalized.shots.filter(shot=>shot.at>=chapter.at&&shot.at<chapterEnd);
            for(const [index,shot] of stopShots.entries())if(shot.frame)
              shot.frame.nodes=[sequence[Math.min(index,sequence.length-1)]];
          }else{
            for(const [index,target] of rotorTargets.entries()){
              const at=chapter.at+(chapterEnd-chapter.at)*index/rotorTargets.length;
              let shot=normalized.shots.find(item=>Math.abs(item.at-at)<.001);
              if(!shot&&exact){shot=structuredClone(exact);shot.at=at;normalized.shots.push(shot);}
              if(shot?.frame)shot.frame.nodes=[target];
            }
            normalized.shots.sort((a,b)=>a.at-b.at);
            const stopShots=normalized.shots.filter(shot=>shot.at>=chapter.at&&shot.at<chapterEnd);
            for(const shot of stopShots)if(shot.frame){
              const progress=(shot.at-chapter.at)/Math.max(.001,chapterEnd-chapter.at);
              shot.frame.nodes=[rotorTargets[Math.min(rotorTargets.length-1,Math.floor(progress*rotorTargets.length))]];
            }
          }
          adjustments.push(`chapter-${chapter.at}-emergency-rotor-shots`);
        }
      }
      if(exactFocus.length&&JSON.stringify(chapter.focus)!==JSON.stringify(exactFocus)){
        chapter.focus=exactFocus;
        adjustments.push(`chapter-${chapter.at}-emergency-evidence-focus`);
      }
      if(!visibleRotorTracks.length&&panelFocus.length)for(const shot of normalized.shots)
        if(shot.at>chapter.at&&shot.at<chapterEnd&&shot.frame)shot.frame.nodes=panelFocus;
      if(changed)adjustments.push(`coverage-emergency-stop-${stopChapter}`);
    }
  }
  const chapterMagnitude=(interaction:NonNullable<CinematicScene['coverage']>['interactions'][number],chapter:number)=>{
    const start=normalized.chapters[chapter]?.at,end=normalized.chapters[chapter+1]?.at??normalized.duration;
    if(start===undefined||end<=start)return 0;
    return normalized.tracks.filter(track=>interaction.targets.includes(track.target)&&interaction.properties.includes(track.property))
      .reduce((score,track)=>{
        const frames=track.keyframes.filter(frame=>frame.at>=start&&frame.at<=end);
        const values=frames.map(frame=>frame.value);
        if(values.length<2)return score;
        const delta=Math.max(0,...values.flatMap(a=>values.map(b=>Array.isArray(a)&&Array.isArray(b)
          ?Math.hypot(...a.map((value,index)=>value-(b as number[])[index])):Math.abs(Number(a)-Number(b)))));
        return score+delta;
      },0);
  };
  for(const interaction of normalized.coverage?.interactions??[]){
    if(/(?:三台.*离心机.*(?:临界|级联)|centrifuge.*cascade)/i.test(interaction.description)&&rotors.length){
      interaction.targets=rotors.map(rotor=>rotor.id).slice(0,12);interaction.properties=['rotation'];
      adjustments.push(`coverage-${interaction.chapter}-centrifuge-cascade`);
    }
    if(/(?:来源.*(?:机壳|转子).*结构|source.*(?:housing|rotor).*structur)/i.test(interaction.description)){
      const choices=normalized.chapters.map((_,chapter)=>({chapter,score:chapterMagnitude(interaction,chapter)})).sort((a,b)=>b.score-a.score||a.chapter-b.chapter);
      if(choices[0]?.score>0&&choices[0].chapter!==interaction.chapter){interaction.chapter=choices[0].chapter;adjustments.push('coverage-source-structure-chapter');}
    }
  }

  // Keep stop shots on the rotors, injection link, and physical indicator so
  // the learner can see the consequence of the emergency action.
  for(const [chapterIndex,chapter] of normalized.chapters.entries()){
    if(!/(?:紧急停机|急停|受控降速|emergency\s*(?:stop|shutdown))/i.test(`${chapter.title} ${chapter.caption}`))continue;
    const fragments=chapter.focus.filter(id=>{
      const node=currentNodes.get(id);
      return node&&/(?:debris|fragment|shard|碎片|断片)/i.test(semantic(node));
    });
    if(!fragments.length&&(emergency?.type!=='button'||emergency.action!=='play-from'))continue;
    const retained=chapter.focus.filter(id=>!fragments.includes(id)&&concrete(currentNodes.get(id)));
    if(retained.length<2)continue;
    chapter.focus=retained;
    if(emergency?.type==='button'&&emergency.action==='play-from')continue;
    const end=normalized.chapters[chapterIndex+1]?.at??normalized.duration;
    const shots=normalized.shots.filter(shot=>shot.at>=chapter.at&&shot.at<end&&shot.frame);
    const rotorFocus=retained.filter(id=>rotors.some(rotor=>rotor.id===id));
    const panelFocus=retained.filter(id=>{
      const node=currentNodes.get(id)!;
      return /(?:hmi|scada|physical|pointer|needle|link|display|仪表|指针|链路|显示)/i.test(semantic(node));
    });
    for(const shot of shots){
      const focus=[...new Set([...rotorFocus.slice(0,3),...panelFocus.slice(0,2),
        ...retained.filter(id=>/(?:inject|注入)/i.test(semantic(currentNodes.get(id)!))).slice(0,1)])];
      shot.frame!.nodes=focus.length?focus:retained.slice(0,3);
    }
    adjustments.push(`chapter-${chapter.at}-stop-evidence-frame`);
  }

  // Inspection and summary chapters must not promise a focused teaching
  // marker while its opacity track keeps it hidden for the whole chapter.
  // If the copy explicitly names a tracer/particle, keep that evidence visible
  // at its final position; otherwise remove only the hidden focus reference.
  for(const [chapterIndex,chapter] of normalized.chapters.entries()){
    if(chapter.kind==='action')continue;
    const concreteFocus=chapter.focus.filter(id=>concrete(currentNodes.get(id)));
    if(concreteFocus.length&&concreteFocus.length!==chapter.focus.length){chapter.focus=concreteFocus;adjustments.push(`chapter-${chapter.at}-concrete-focus`);}
    const end=normalized.chapters[chapterIndex+1]?.at??normalized.duration;
    const times=[chapter.at,chapter.at+(end-chapter.at)/2,Math.max(chapter.at,end-.001)];
    const hidden=chapter.focus.filter(target=>{
      let node=currentNodes.get(target);
      if(!node)return true;
      return !times.some(at=>{
        let opacity=1,current:typeof node|undefined=node;
        while(current){opacity*=opacityAt(normalized,current.id,at,current.opacity);current=current.parent?currentNodes.get(current.parent):undefined;}
        return opacity>=.12;
      });
    });
    for(const target of hidden){
      const node=currentNodes.get(target),copy=`${chapter.title} ${chapter.caption}`;
      if(node&&/(?:tracer|particle|示踪|粒子)/i.test(semantic(node))&&/(?:tracer|particle|示踪|粒子)/i.test(copy)){
        let track=normalized.tracks.find(item=>item.target===target&&item.property==='opacity');
        if(!track){track={target,property:'opacity',easing:'smooth',keyframes:[{at:0,value:node.opacity},{at:normalized.duration,value:node.opacity}]};normalized.tracks.push(track);}
        const upsert=(at:number)=>{const frame=track!.keyframes.find(item=>Math.abs(item.at-at)<.001);if(frame)frame.value=1;else track!.keyframes.push({at,value:1});};
        upsert(chapter.at);upsert(normalized.duration);track.keyframes.sort((a,b)=>a.at-b.at);
        adjustments.push(`${target}-summary-visible`);
      }else if(node&&/(?:debris|fragment|shard|fracture|break|碎片|断片|断口)/i.test(semantic(node))&&
        /(?:破坏|解体|碎裂|近景|damage|destruction|breakup|close[ -]?up)/i.test(copy)){
        let track=normalized.tracks.find(item=>item.target===target&&item.property==='opacity');
        if(!track){track={target,property:'opacity',easing:'linear',keyframes:[{at:0,value:node.opacity},{at:normalized.duration,value:node.opacity}]};normalized.tracks.push(track);}
        const end=normalized.chapters[chapterIndex+1]?.at??normalized.duration;
        const upsert=(at:number)=>{const frame=track!.keyframes.find(item=>Math.abs(item.at-at)<.001);if(frame)frame.value=1;else track!.keyframes.push({at,value:1});};
        upsert(chapter.at);upsert(Math.max(chapter.at,end-.001));track.keyframes.sort((a,b)=>a.at-b.at);
        adjustments.push(`${target}-damage-inspection-visible`);
      }
    }
    const remaining=chapter.focus.filter(target=>!hidden.includes(target)||adjustments.includes(`${target}-summary-visible`)||adjustments.includes(`${target}-damage-inspection-visible`));
    if(remaining.length&&remaining.length!==chapter.focus.length){chapter.focus=remaining;adjustments.push(`chapter-${chapter.at}-hidden-focus`);}
  }

  // Generated destruction lessons sometimes split one physical event into
  // two requirements: fragments become visible (state-change), then travel
  // along different paths (transport).  A late review patch can point both
  // mappings at the following inspection/stop chapter even though the real
  // launch remains in the damage chapter.  Rebind both requirements to the
  // same authored fragment motion and keep the fragments visible for more
  // than a single boundary sample.  This preserves the existing trajectories
  // and only adds the reveal hold needed to observe them while they move.
  const breakupNode=(id:string)=>{
    const node=currentNodes.get(id);
    return concrete(node)&&/(?:debris|fragment|shard|fracture|break|碎片|断片|断口)/i.test(semantic(node!));
  };
  const breakupInteractions=(normalized.coverage?.interactions??[]).filter(interaction=>{
    const kind=declaredInteractionKinds.get(interaction.description);
    return (kind==='state-change'||kind==='transport')&&interaction.targets.some(breakupNode);
  });
  if(breakupInteractions.length){
    const fragmentIds=[...new Set(breakupInteractions.flatMap(interaction=>interaction.targets).filter(breakupNode))];
    const positionTracks=normalized.tracks.filter(track=>fragmentIds.includes(track.target)&&track.property==='position');
    const choices=normalized.chapters.map((chapter,chapterIndex)=>{
      const tracks=positionTracks.map(track=>({track,delta:chapterTrackDelta(track,chapterIndex)}))
        .filter(item=>item.delta>=evidenceThreshold(item.track.property));
      const damage=/(?:破坏|解体|碎裂|飞散|damage|destruction|breakup|fragment)/i.test(`${chapter.title} ${chapter.caption}`);
      const reset=/(?:复位|重置|恢复|reset|restore)/i.test(`${chapter.title} ${chapter.caption}`);
      return{chapter:chapterIndex,tracks,score:tracks.reduce((sum,item)=>sum+item.delta,0)+(damage?1000:0)-(reset?500:0)};
    }).filter(choice=>choice.tracks.length>=Math.min(4,fragmentIds.length)&&choice.score>0)
      .sort((a,b)=>b.score-a.score||a.chapter-b.chapter);
    const best=choices[0];
    if(best){
      const chapter=normalized.chapters[best.chapter],end=normalized.chapters[best.chapter+1]?.at??normalized.duration;
      const revealAt=chapter.at+Math.min(.6,Math.max(.15,(end-chapter.at)*.08));
      const visibleUntil=Math.max(revealAt+.05,end-.001);
      const moving=[...new Set(best.tracks.sort((a,b)=>b.delta-a.delta).map(item=>item.track.target))].slice(0,12);
      for(const target of moving){
        const node=currentNodes.get(target)!;
        let opacity=normalized.tracks.find(track=>track.target===target&&track.property==='opacity');
        if(!opacity){
          opacity={target,property:'opacity',easing:'linear',keyframes:[{at:0,value:node.opacity},{at:normalized.duration,value:node.opacity}]};
          normalized.tracks.push(opacity);
        }
        const upsert=(at:number,value:number)=>{
          const frame=opacity!.keyframes.find(item=>Math.abs(item.at-at)<.001);
          if(frame)frame.value=value;else opacity!.keyframes.push({at,value});
        };
        const authoredReveal=opacity.keyframes.find(frame=>frame.at>=chapter.at&&frame.at<end&&
          typeof frame.value==='number'&&frame.value>=.95)?.at;
        const firstReveal=authoredReveal??revealAt;
        upsert(chapter.at,0);upsert(firstReveal,1);
        opacity.keyframes=opacity.keyframes.filter(frame=>frame.at<=firstReveal||frame.at>visibleUntil||
          typeof frame.value==='number'&&frame.value>0);
        upsert(visibleUntil,1);
        opacity.keyframes.sort((a,b)=>a.at-b.at);
        adjustments.push(`${target}-observable-breakup-launch`);
      }
      for(const interaction of breakupInteractions){
        const kind=declaredInteractionKinds.get(interaction.description);
        interaction.chapter=best.chapter;
        interaction.targets=[...moving];
        interaction.properties=kind==='transport'?['position','transport']:['opacity','position'];
        if(interaction.connections)delete interaction.connections;
        if(interaction.controls)delete interaction.controls;
        adjustments.push(`coverage-breakup-${kind}-${best.chapter}`);
      }
      frameEvidence(moving,best.chapter);
    }
  }

  // Keep a generated "normal HMI value" requirement attached to the visible
  // display indicator. Review patches occasionally substitute a physical or
  // independent needle whose ID still contains `hmi`, then point it at a
  // chapter where its parent is hidden. Prefer the actual display channel and
  // an authored, visible in-band change; this keeps the HMI/physical contrast
  // inspectable without turning a hidden physical needle into evidence.
  for(const interaction of normalized.coverage?.interactions??[]){
    if(declaredInteractionKinds.get(interaction.description)!=='state-change'||
      /(?:物理|真实|独立|physical|actual|independent)/i.test(interaction.description)||
      !/(?:hmi|scada|显示|读数|display)/i.test(interaction.description))continue;
    const displayChannel=(node:CinematicScene['nodes'][number])=>{
      const text=semantic(node);
      return concrete(node)&&/(?:hmi|scada|显示|读数|display)/i.test(text)&&
        !/(?:physical|actual|independent|_phys\b|物理|真实|独立)/i.test(text);
    };
    const candidates=normalized.tracks.filter(track=>
      ['position','rotation','emissive','opacity','scale'].includes(track.property)&&displayChannel(currentNodes.get(track.target)!));
    const choices=normalized.chapters.flatMap((chapter,chapterIndex)=>candidates.map(track=>{
      const delta=chapterTrackDelta(track,chapterIndex),node=currentNodes.get(track.target)!;
      if(delta<evidenceThreshold(track.property)||!visibleInChapter(track.target,chapterIndex))return null;
      const copy=`${chapter.title} ${chapter.caption}`;
      const channelBonus=/(?:pointer|needle|indicator|指针|表针|显示状态)/i.test(semantic(node))?100:0;
      const chapterBonus=/(?:hmi|scada|显示|读数|display)/i.test(copy)?200:0;
      return{chapter:chapterIndex,track,score:channelBonus+chapterBonus+delta};
    })).filter((choice):choice is NonNullable<typeof choice>=>!!choice)
      .sort((a,b)=>b.score-a.score||a.chapter-b.chapter);
    const best=choices[0];
    if(!best)continue;
    interaction.chapter=best.chapter;
    interaction.targets=[best.track.target];
    interaction.properties=[best.track.property];
    if(interaction.connections)delete interaction.connections;
    if(interaction.controls)delete interaction.controls;
    frameEvidence(interaction.targets,best.chapter);
    adjustments.push(`coverage-hmi-display-${best.chapter}`);
  }

  // An action chapter can retain a rotor in its focus after an earlier
  // breakup track has hidden that rotor permanently. Keep any still-visible
  // authored focus, then replace only the hidden IDs with concrete objects
  // that actually change and remain visible in this chapter. If no such
  // evidence exists the strict validator still rejects the chapter.
  for(const [chapterIndex,chapter] of normalized.chapters.entries()){
    if(chapter.kind!=='action')continue;
    const visibleFocus=chapter.focus.filter(id=>visibleInChapter(id,chapterIndex));
    if(visibleFocus.length===chapter.focus.length)continue;
    const replacements=normalized.tracks.map(track=>({track,delta:chapterTrackDelta(track,chapterIndex)}))
      .filter(item=>item.delta>=evidenceThreshold(item.track.property)&&
        concrete(currentNodes.get(item.track.target))&&visibleInChapter(item.track.target,chapterIndex)&&
        !visibleFocus.includes(item.track.target))
      .sort((a,b)=>b.delta-a.delta||a.track.target.localeCompare(b.track.target))
      .map(item=>item.track.target);
    const next=[...new Set([...visibleFocus,...replacements])].slice(0,8);
    if(!next.length)continue;
    chapter.focus=next;
    frameEvidence(next,chapterIndex);
    adjustments.push(`chapter-${chapter.at}-visible-action-focus`);
  }

  // Valve drafts often finish the gate lift before a short "settling" chapter
  // and then reuse one wide shot for both the open-seat comparison and a flow
  // marker at the outlet. Treat a genuinely settled interval as inspection,
  // and give the two explicitly discussed evidence groups separate closeups.
  // The gate/stem/flow tracks remain unchanged; a promised flow marker is
  // retained in the focus and receives its own observation shot.
  if(normalized.nodes.some(node=>node.kind==='model'&&node.model==='valve')){
    const observation=(chapter:CinematicScene['chapters'][number])=>chapter.kind==='inspection'||chapter.kind==='summary';
    const valvePart=(id:string)=>{
      const node=currentNodes.get(id);
      return node&&concrete(node)&&/(?:gate|disc|stem|seat|channel|闸板|阀芯|阀杆|阀座|流道)/i.test(semantic(node));
    };
    const flowCue=(id:string)=>{
      const node=currentNodes.get(id);
      return node&&node.role!=='decoration'&&/(?:particle|arrow|fluid[_-]?flow|流体粒子|流向箭头)/i.test(semantic(node));
    };
    const shotFor=(at:number,targets:string[])=>{
      if(!targets.length)return;
      let shot=normalized.shots.find(item=>Math.abs(item.at-at)<.001);
      if(!shot&&normalized.shots.length<20){
        const prior=normalized.shots.findLast(item=>item.at<at);
        if(!prior)return;
        shot=structuredClone(prior);shot.at=at;normalized.shots.push(shot);
      }
      if(shot)shot.frame={nodes:[...new Set(targets)].slice(0,12),padding:Math.max(1.15,shot.frame?.padding??1.15)};
    };
    for(const [chapterIndex,chapter] of normalized.chapters.entries()){
      const end=normalized.chapters[chapterIndex+1]?.at??normalized.duration;
      const copy=`${chapter.title} ${chapter.caption}`;
      if(chapter.kind==='action'&&/(?:趋于稳定|达到稳定|进入稳定|settling|stabili[sz])/i.test(copy)){
        const active=normalized.tracks.some(track=>chapter.focus.some(id=>related(id,track.target))&&
          concrete(currentNodes.get(track.target))&&visibleInChapter(track.target,chapterIndex)&&
          chapterTrackDelta(track,chapterIndex)>=Math.max(.3,evidenceThreshold(track.property)));
        if(!active){chapter.kind='inspection';adjustments.push(`chapter-${chapter.at}-settled-valve-inspection`);}
      }
      if(!observation(chapter)||!/(?:间隙|全开|观察|回拖|开阀|gap|fully\s*open|inspect)/i.test(copy))continue;
      const structural=chapter.focus.filter(id=>valvePart(id)&&!flowCue(id)).slice(0,5);
      if(structural.length<2)continue;
      const cues=chapter.focus.filter(id=>flowCue(id));
      const mentioned=cues.filter(id=>{
        const node=currentNodes.get(id)!;
        const token=/(?:particle|fluid[_-]?flow|粒子)/i.test(semantic(node))?/(?:particle|粒子)/i:/(?:arrow|箭头)/i;
        return token.test(copy);
      });
      if(cues.length&&mentioned.length!==cues.length){
        chapter.focus=chapter.focus.filter(id=>!cues.includes(id)||mentioned.includes(id));
        adjustments.push(`chapter-${chapter.at}-valve-observation-focus`);
      }
      shotFor(chapter.at,structural);
      if(mentioned.length&&end-chapter.at>=2&&normalized.shots.length<20){
        const at=chapter.at+(end-chapter.at)/2;
        shotFor(at,mentioned);
        adjustments.push(`shot-${at}-valve-flow-evidence`);
      }
    }
    normalized.shots.sort((a,b)=>a.at-b.at);
  }

  // A reset summary observes the restored machines. Internal rotors may be
  // deliberately behind their housings, so keep the visible housings as the
  // static evidence instead of requiring every nested part to be exposed.
  for(const chapter of normalized.chapters){
    if(chapter.kind==='action'||!/(?:复位|重置|reset|restore)/i.test(`${chapter.title} ${chapter.caption}`))continue;
    const housings=chapter.focus.filter(id=>nodes.get(id)?.model==='centrifuge-housing');
    if(housings.length&&chapter.focus.some(id=>nodes.get(id)?.parent&&nodes.get(nodes.get(id)!.parent!)?.model==='centrifuge-housing')){
      chapter.focus=housings;
      adjustments.push(`chapter-${chapter.at}-reset-focus`);
    }
  }

  // Frame fitting must always have at least one rendered subject at every
  // browser sample that uses the shot. A common restoration pattern fades
  // temporary exploded-layer guides out before the next overview shot. Keep
  // the authored camera, and add an already visible primary subject as its
  // framing anchor instead of regenerating the scene or forcing guides to stay
  // visible after their teaching role ends.
  const frameTimes=[...new Set([0,normalized.duration,...normalized.shots.map(shot=>shot.at),
    ...normalized.chapters.flatMap((chapter,index)=>[chapter.at,(chapter.at+(normalized.chapters[index+1]?.at??normalized.duration))/2])])]
    .sort((a,b)=>a-b);
  const freshNodes=new Map(normalized.nodes.map(node=>[node.id,node]));
  const descendant=(child:string,ancestor:string)=>{
    let current=freshNodes.get(child);
    while(current){if(current.id===ancestor)return true;current=current.parent?freshNodes.get(current.parent):undefined;}
    return false;
  };
  const materiallyDifferent=(a:unknown,b:unknown)=>Array.isArray(a)&&Array.isArray(b)
    ?a.some((value,index)=>Math.abs(Number(value)-Number(b[index]))>.001)
    :Math.abs(Number(a)-Number(b))>.001;
  // A chapter that begins after the authored motion has already reached its
  // final state is an observation, even when a model labels it as an action.
  // Reclassifying this narrow, explicit final-state pattern prevents the
  // validator from asking for an unrelated extra animation.
  for(const [index,chapter] of normalized.chapters.entries()){
    if(chapter.kind!=='action'||!/(?:最终|终态|完成|全开|全闭|结果|状态|final|complete|fully\s*(?:open|closed))/i.test(`${chapter.title} ${chapter.caption}`))continue;
    const end=normalized.chapters[index+1]?.at??normalized.duration;
    const changes=normalized.tracks.some(track=>chapter.focus.some(id=>descendant(track.target,id)||descendant(id,track.target))&&
      materiallyDifferent(trackValueAt(track,chapter.at),trackValueAt(track,end)));
    if(!changes){chapter.kind='inspection';adjustments.push(`chapter-${chapter.at}-final-state-inspection`);}
  }
  for(const at of frameTimes){
    const shot=[...normalized.shots].reverse().find(candidate=>candidate.at<=at),frame=shot?.frame;
    if(!shot||!frame)continue;
    const worlds=worldNodes(normalized,at);
    const visible=(id:string)=>{
      const world=worlds.get(id);return !!world&&world.opacity>=.12;
    };
    const framedVisible=normalized.nodes.some(node=>concrete(node)&&frame.nodes.some(id=>descendant(node.id,id))&&visible(node.id));
    if(framedVisible)continue;
    const chapter=[...normalized.chapters].reverse().find(candidate=>candidate.at<=at);
    const fallback=[...(chapter?.focus??[]),...normalized.nodes.filter(node=>node.role==='primary').map(node=>node.id)]
      .find(id=>concrete(freshNodes.get(id))&&visible(id));
    if(!fallback)continue;
    frame.nodes=frame.nodes.length<12?[...new Set([...frame.nodes,fallback])]:[fallback,...frame.nodes.slice(1)];
    adjustments.push(`shot-${shot.at}-visible-frame-anchor`);
  }
  return{scene:adjustments.length?normalized:scene,adjustments:[...new Set(adjustments)]};
}

export function normalizeCentrifugeHardware(scene:CinematicScene){
  const normalized=structuredClone(scene),adjustments:string[]=[];
  // A complete turbine, server rack, processor or valve shrunk and relabelled
  // as a fragment is still the wrong object and is expensive to render. Turn
  // only explicit breakup fragments into compact same-material solids while
  // retaining their authored reveal and trajectory tracks.
  normalized.nodes.filter(node=>node.kind==='model'&&/(?:debris|fragment|shard|碎片|断片)/i.test(semantic(node))).forEach((node,index)=>{
    node.kind='box';delete node.model;delete node.assetRole;
    node.params={width:.42+.05*(index%3),height:.2+.04*(index%2),depth:.3+.04*((index+1)%3)};
    node.scale=[1,1,1];node.metalness=Math.max(node.metalness,.62);node.roughness=Math.max(node.roughness,.22);
    adjustments.push(`${node.id}-volumetric-fragment`);
  });
  const housings=normalized.nodes.filter(node=>node.model==='centrifuge-housing');
  for(const housing of housings){
    const ports=assetCatalog('centrifuge-housing',housing.params).ports;
    const center=ports['rotor-center'].position;
    const cavityRadius=Math.abs(ports['cavity-front'].position[2]-center[2]);
    const cavityHeight=Math.abs(ports['rotor-top'].position[1]-ports['rotor-bottom'].position[1]);
    for(const rotor of normalized.nodes.filter(node=>node.parent===housing.id&&isCinematicRotorBody(node))){
      const scale=rotor.scale.map(value=>Math.max(Math.abs(value),.001));
      const radiusLimit=cavityRadius*.72/Math.max(scale[0],scale[2]);
      const heightLimit=cavityHeight*.86/scale[1];
      const top=Math.min(Number(rotor.params.top??.5),radiusLimit);
      const bottom=Math.min(Number(rotor.params.bottom??.5),radiusLimit);
      const height=Math.min(Number(rotor.params.height??2),heightLimit);
      const nextPosition:[number,number,number]=[center[0],center[1],center[2]];
      const nextRotation:[number,number,number]=[0,rotor.rotation[1],0];
      const changed=JSON.stringify(rotor.position)!==JSON.stringify(nextPosition)||
        JSON.stringify(rotor.rotation)!==JSON.stringify(nextRotation)||
        top!==Number(rotor.params.top??.5)||bottom!==Number(rotor.params.bottom??.5)||height!==Number(rotor.params.height??2);
      for(const track of normalized.tracks.filter(item=>item.target===rotor.id&&item.property==='position')){
        const first=track.keyframes[0]?.value;
        if(!Array.isArray(first))continue;
        const delta=nextPosition.map((value,index)=>value-first[index]) as [number,number,number];
        if(delta.some(value=>Math.abs(value)>.001)){
          for(const frame of track.keyframes)if(Array.isArray(frame.value))
            frame.value=frame.value.map((value,index)=>value+delta[index]) as [number,number,number];
          adjustments.push(`${rotor.id}-position-track-fit`);
        }
      }
      rotor.position=nextPosition;
      rotor.rotation=nextRotation;
      rotor.params={...rotor.params,top,bottom,height};
      const rotorRadius=Math.max(top,bottom);
      for(const stripe of normalized.nodes.filter(node=>node.parent===rotor.id&&['box','plane','cylinder'].includes(node.kind)&&
        /(stripe|band|marker|条纹|标记|示踪)/i.test(`${node.id} ${node.represents||''}`))){
        const stripePosition:[number,number,number]=[0,stripe.position[1],rotorRadius*1.1];
        const stripeHeight=Math.min(height*.9,Math.max(Number(stripe.params.height??0),height*.55));
        if(JSON.stringify(stripe.position)!==JSON.stringify(stripePosition)||stripeHeight!==Number(stripe.params.height??0))adjustments.push(stripe.id);
        stripe.position=stripePosition;
        stripe.params={...stripe.params,height:stripeHeight};
      }
      if(changed)adjustments.push(rotor.id);
    }
  }
  // A rotor, shaft and phase stripe may share one rotating group. Fit an
  // explicitly authored stationary stripe to its one sibling rotor instead
  // of asking a language model to solve the same surface attachment again.
  // Preserve all domain formulae, rotor motion and independently moving marks.
  const groupedWorlds=worldNodes(normalized);
  for(const group of normalized.nodes.filter(node=>node.kind==='group')){
    const rotors=normalized.nodes.filter(node=>node.parent===group.id&&isCinematicRotorBody(node)&&/rotor|转子/i.test(semantic(node)));
    if(rotors.length!==1)continue;
    const rotor=rotors[0],rotorWorld=groupedWorlds.get(rotor.id)!,groupWorld=groupedWorlds.get(group.id)!;
    const hosts=housings.filter(housing=>{
      const ports=assetCatalog('centrifuge-housing',housing.params).ports;
      const point=transformPoint(multiply(inverse(groupedWorlds.get(housing.id)!.matrix),rotorWorld.matrix),[0,0,0]);
      return Math.hypot(point[0]-ports['rotor-center'].position[0],point[2]-ports['rotor-center'].position[2])<=
        Math.abs(ports['cavity-front'].position[2]-ports['rotor-center'].position[2])&&
        point[1]>=ports['rotor-bottom'].position[1]&&point[1]<=ports['rotor-top'].position[1];
    });
    if(hosts.length!==1)continue;
    const radius=Math.max(Number(rotor.params.top??.5),Number(rotor.params.bottom??.5));
    const height=Number(rotor.params.height??2);
    for(const stripe of normalized.nodes.filter(node=>node.parent===group.id&&node.id!==rotor.id&&
      ['box','plane','cylinder'].includes(node.kind)&&/(?:stripe|band|marker|条纹|标记|示踪)/i.test(semantic(node))&&
      Number(node.params.height??0)>=height*.45)){
      if(normalized.tracks.some(track=>track.target===stripe.id&&['position','rotation'].includes(track.property))||
        normalized.assembly?.placements.some(placement=>placement.node===stripe.id))continue;
      const relative=transformPoint(multiply(inverse(rotorWorld.matrix),groupedWorlds.get(stripe.id)!.matrix),[0,0,0]);
      const thickness=stripe.kind==='cylinder'?Math.max(Number(stripe.params.top??0),Number(stripe.params.bottom??0)):
        Math.max(Number(stripe.params.width??0),Number(stripe.params.depth??0))/2;
      if(relative[2]>=radius*.8&&Math.hypot(relative[0],relative[2])+thickness>=radius*1.08)continue;
      stripe.position=transformPoint(multiply(inverse(groupWorld.matrix),rotorWorld.matrix),[0,relative[1],radius*1.1]);
      adjustments.push(`${stripe.id}-shared-rotor-surface`);
    }
  }
  const fragments=normalized.nodes.filter(node=>!node.parent&&/(?:debris|fragment|碎片)/i.test(semantic(node)));
  for(const fragment of fragments){
    const housing=housings.toSorted((a,b)=>Math.hypot(fragment.position[0]-a.position[0],fragment.position[2]-a.position[2])-
      Math.hypot(fragment.position[0]-b.position[0],fragment.position[2]-b.position[2]))[0];
    if(!housing)continue;
    const scale=Math.max(Math.abs(housing.scale[0]),Math.abs(housing.scale[2]));
    const next:[number,number,number]=[housing.position[0]+.9*scale,fragment.position[1],housing.position[2]+.8*scale];
    const delta:[number,number,number]=next.map((value,index)=>value-fragment.position[index]) as [number,number,number];
    if(delta.some(value=>Math.abs(value)>.001)){
      fragment.position=next;
      for(const track of normalized.tracks.filter(item=>item.target===fragment.id&&item.property==='position'))
        for(const frame of track.keyframes)if(Array.isArray(frame.value))frame.value=frame.value.map((value,index)=>value+delta[index]) as [number,number,number];
      adjustments.push(fragment.id);
    }
    if(fragment.kind==='box'){
      const params={...fragment.params,width:Math.max(Number(fragment.params.width??0),.26),height:Math.max(Number(fragment.params.height??0),.14),depth:Math.max(Number(fragment.params.depth??0),.2)};
      if(JSON.stringify(params)!==JSON.stringify(fragment.params))adjustments.push(fragment.id);
      fragment.params=params;
    }
  }
  const fragmentIds=new Set(fragments.map(node=>node.id));
  for(const shot of normalized.shots){
    if(!shot.frame||shot.frame.nodes.filter(id=>fragmentIds.has(id)).length<2)continue;
    const marker=shot.frame.nodes.map(id=>normalized.nodes.find(node=>node.id===id)).find(node=>node&&/(?:forensic|取证).*(?:marker|光标)|(?:marker|光标).*(?:forensic|取证)/i.test(semantic(node)));
    const chapter=normalized.chapters.findLast(item=>item.at<=shot.at);
    if(!marker||marker.parent||!chapter)continue;
    const anchor=vectorAt(normalized,marker.id,shot.at,marker.position);
    const nearby=chapter.focus.filter(id=>id!==marker.id).map(id=>normalized.nodes.find(node=>node.id===id)).filter(node=>node&&!node.parent&&opacityAt(normalized,node.id,shot.at,node.opacity)>=.15)
      .map(node=>({node:node!,distance:Math.hypot(...vectorAt(normalized,node!.id,shot.at,node!.position).map((value,index)=>value-anchor[index]))})).sort((a,b)=>a.distance-b.distance);
    const selected=nearby.filter((entry,index)=>index===0||entry.distance<=4).slice(0,2).map(entry=>entry.node.id);
    const nodes=[marker.id,...selected];
    if(nodes.length>1&&JSON.stringify(nodes)!==JSON.stringify(shot.frame.nodes)){
      shot.frame={nodes,padding:Math.max(shot.frame.padding,1.15)};
      adjustments.push(`shot-${shot.at}`);
    }
  }
  return{scene:adjustments.length?normalized:scene,adjustments:[...new Set(adjustments)]};
}

/** Geometry facts for the hardware assets, not industrial performance claims. */
export function cinematicHardwareGeometryIssues(scene:CinematicScene):CinematicQualityIssue[]{
  const issues:CinematicQualityIssue[]=[],worlds=worldNodes(scene);
  let domainMotion=new Set<string>();
  try {
    domainMotion=new Set(validateCinematicDomainLab(scene).flatMap(decision=>decision.alternatives.flatMap(choice=>
      choice.bindings.filter(binding=>binding.property==='rotationSpeedY'&&typeof binding.value==='number'&&
        Math.abs(binding.value)*scene.duration>=4*Math.PI-.001).map(binding=>binding.node))));
  } catch { /* Invalid domain models receive no motion credit. */ }
  const nodeMap=new Map(scene.nodes.map(node=>[node.id,node]));
  const ancestorIds=(id:string)=>{const ids:string[]=[];let current=nodeMap.get(id);
    while(current){ids.push(current.id);current=current.parent?nodeMap.get(current.parent):undefined;}return ids;};
  const housings=scene.nodes.filter(node=>node.model==='centrifuge-housing');
  const rotorHousing=(rotor:CinematicScene['nodes'][number])=>{
    const direct=housings.find(housing=>ancestorIds(rotor.id).includes(housing.id));
    if(direct)return direct.id;
    if(!/(?:rotor|转子)/i.test([rotor.id,rotor.label,rotor.represents,rotor.assetRole].filter(Boolean).join(' ')))return;
    // A shared rotation group may be placed at the cavity instead of being
    // parented to the shell. Its real world origin identifies the nearest
    // cavity; this does not permit a remote or missing rotor to pass.
    const candidates=housings.flatMap(housing=>{
      const ports=assetCatalog('centrifuge-housing',housing.params).ports;
      const point=transformPoint(multiply(inverse(worlds.get(housing.id)!.matrix),worlds.get(rotor.id)!.matrix),[0,0,0]);
      const center=ports['rotor-center'].position,radius=Math.abs(ports['cavity-front'].position[2]-center[2]);
      const distance=Math.hypot(point[0]-center[0],point[2]-center[2]);
      return distance<=radius&&point[1]>=ports['rotor-bottom'].position[1]&&point[1]<=ports['rotor-top'].position[1]
        ?[{id:housing.id,distance}]:[];
    });
    return candidates.sort((a,b)=>a.distance-b.distance)[0]?.id;
  };
  const requirementText=(scene.coverage?.interactions??[]).map(item=>item.description).join('\n');
  const semantic=(node:CinematicScene['nodes'][number])=>[node.id,node.label,node.detail,node.represents,...(node.surfaceText?.lines??[])].filter(Boolean).join(' ');
  const changes=(id:string)=>scene.tracks.some(track=>track.target===id&&['position','rotation','scale'].includes(track.property)&&
    new Set(track.keyframes.map(frame=>JSON.stringify(frame.value))).size>1);
  const workstations=scene.nodes.filter(n=>n.model==='computer-workstation'&&n.role!=='logic');
  for(const usb of scene.nodes.filter(n=>n.model==='usb-drive'&&n.role!=='logic')){
    const hosts=workstations.filter(host=>scene.chapters.some(c=>c.focus.includes(usb.id)&&c.focus.includes(host.id)));
    const diagonal=(id:string)=>{const b=worldBounds(worlds.get(id)!);return Math.hypot(...b.max.map((v,i)=>v-b.min[i]));};
    for(const host of hosts){
      const ratio=diagonal(usb.id)/diagonal(host.id);
      if(ratio>.6)issues.push({code:'hardware-handheld-scale',severity:'error',nodes:[usb.id,host.id],
        message:`同一教学场景中手持介质与整台电脑的包络对角线之比为 ${ratio.toFixed(3)}，已超过宽松比例上限 0.6。统一资产归一化尺寸不是现实尺寸。`,
        suggestion:'将实际接入/搬运的介质恢复手持大小，依据主机真实端口同步修正位置轨道；用近景镜头看接口细节，不用巨型介质穿过电脑。若需要单独的放大结构图，请另设明确标注放大比例的logic解释模型，实际接入实体仍保留。'});
    }
  }
  for(const housing of housings){
    const catalog=assetCatalog('centrifuge-housing',housing.params),ports=catalog.ports;
    const center=ports['rotor-center'].position,top=ports['rotor-top'].position[1],bottom=ports['rotor-bottom'].position[1];
    const radius=Math.abs(ports['cavity-front'].position[2]-center[2]);
    const hostInverse=inverse(worlds.get(housing.id)!.matrix);
    const rotors=scene.nodes.filter(n=>isCinematicRotorBody(n)&&rotorHousing(n)===housing.id);
    if(!rotors.length)issues.push({code:'hardware-centrifuge-rotor-missing',severity:'error',nodes:[housing.id],
      message:'离心机空腔没有可见的primary圆柱转子。资产本身只提供机壳，不含转子。',
      suggestion:'创建独立primary cylinder，按rotor-center/top/bottom/cavity-front端口放入空腔；可以使用共同旋转组件，不要用整机外壳自转冒充内部转子。'});
    for(const rotor of rotors){
      // Real transforms propagate through a shaft or other physical carrier,
      // not just an empty group. Stop at the fixed housing: rotating the whole
      // machine must never prove independent motion of its internal rotor.
      const ancestry=ancestorIds(rotor.id),housingIndex=ancestry.indexOf(housing.id);
      const motionAncestors=(housingIndex<0?ancestry:ancestry.slice(0,housingIndex)).filter(id=>{
        const carrier=nodeMap.get(id)!;
        return carrier.kind==='group'||(carrier.role!=='decoration'&&!['plane','points'].includes(carrier.kind));
      });
      const rotation=scene.tracks.find(t=>motionAncestors.includes(t.target)&&t.property==='rotation');
      const experimental=motionAncestors.some(id=>domainMotion.has(id))&&
        (scene.coverage?.interactions??[]).some(mapping=>mapping.properties.includes('domain')&&
          mapping.targets.some(target=>motionAncestors.includes(target)));
      if(!rotation&&!experimental){issues.push({code:'hardware-centrifuge-rotation-missing',severity:'error',nodes:[rotor.id,housing.id],
        message:'离心机转子没有实际rotation轨道，静态圆柱不能证明可观察的旋转。',suggestion:'给转子添加Y轴rotation轨道，并在对应章节和coverage中映射该真实动作。'});continue;}
      const yValues=rotation?.keyframes.map(key=>Array.isArray(key.value)?key.value[1]:0)??[0],turns=(Math.max(...yValues)-Math.min(...yValues))/(Math.PI*2);
      if(turns<2-.001&&!experimental)issues.push({code:'hardware-centrifuge-rotation-insufficient',severity:'error',nodes:[rotor.id,housing.id],
        message:`转子Y轴轨道只有${turns.toFixed(3)}圈，难以在交互和动效中辨认旋转。`,suggestion:'保留其他轨道，为转子Y轴提供至少两圈连续旋转，并用非对称条纹显现角位移。'});
      const rotorRadius=Math.max(Number(rotor.params.top??.5),Number(rotor.params.bottom??.5)),rotorHeight=Number(rotor.params.height??2);
      const stripePosition=(node:CinematicScene['nodes'][number])=>transformPoint(
        multiply(inverse(worlds.get(rotor.id)!.matrix),worlds.get(node.id)!.matrix),[0,0,0]);
      const stripe=scene.nodes.find(n=>(ancestorIds(n.id).includes(rotor.id)||
        !!rotation&&nodeMap.get(rotation.target)?.kind==='group'&&ancestorIds(n.id).includes(rotation.target))&&
        ['box','plane','cylinder'].includes(n.kind)&&/(stripe|band|marker|条纹|标记|示踪)/i.test(`${n.id} ${n.represents||''}`)&&
        Math.hypot(stripePosition(n)[0],stripePosition(n)[2])>=rotorRadius*.45&&Number(n.params.height??0)>=rotorHeight*.45);
      if(!stripe)issues.push({code:'hardware-centrifuge-stripe-missing',severity:'error',nodes:[rotor.id,housing.id],
        message:'转子没有可见的偏心纵向条纹或示踪标记；轴对称圆柱旋转时无法辨认角位移。',suggestion:'在转子下创建偏离轴心、长度至少覆盖转子45%的细长box/plane或窄圆柱弧带，并让id或represents明确包含stripe/marker/条纹/标记。'});
      else {
        const markerThickness=stripe.kind==='cylinder'
          ?Math.max(Number(stripe.params.top??0),Number(stripe.params.bottom??0))
          :Math.max(Number(stripe.params.width??0),Number(stripe.params.depth??0))/2;
        const position=stripePosition(stripe),protrusion=Math.hypot(position[0],position[2])+markerThickness;
        if(position[2]<rotorRadius*.8||protrusion<rotorRadius*1.08)issues.push({code:'hardware-centrifuge-stripe-occluded',severity:'error',nodes:[stripe.id,rotor.id,housing.id],
          message:'偏心纵向条纹初态没有位于转子+Z可见表面并略微突出，容易被圆柱自身遮住，剖切建立镜头无法辨认角位移。',
          suggestion:'保持条纹为转子子节点，把初始位置放到+Z表面（z至少为转子半径的0.8倍），并让条纹外缘略高于圆柱半径；不要藏在背面或嵌入转子。'});
      }
      const start=rotation?.keyframes[0].at??0,end=rotation?.keyframes.at(-1)!.at??scene.duration;
      const control=scene.learnerControls.find(item=>item.type==='range'&&item.timeRange[0]<end&&item.timeRange[1]>start);
      const domainControl=scene.lab?.bindings.some(binding=>motionAncestors.includes(binding.node)&&binding.property==='rotationSpeedY');
      if(!control&&!domainControl)issues.push({code:'hardware-centrifuge-learner-control-missing',severity:'error',nodes:[rotor.id,housing.id],
        message:'离心机只有自动时间线，没有能改变并观察转子状态的实验范围控件。',suggestion:'添加range learnerControl，将timeRange覆盖转子旋转轨道，并提供至少两个基于可见状态的反馈区间；保留播放器重置、旋转和缩放。'});
      const relative=multiply(hostInverse,worlds.get(rotor.id)!.matrix);
      const height=Number(rotor.params.height??1),radii=[Number(rotor.params.bottom??1),Number(rotor.params.top??1)];
      const points=[-1,1].flatMap((sign,index)=>Array.from({length:32},(_,i)=>{
        const angle=i*Math.PI/16;return transformPoint(relative,[Math.cos(angle)*radii[index],sign*height/2,Math.sin(angle)*radii[index]]);
      }));
      const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
      const maxRadius=Math.max(...points.map(p=>Math.hypot(p[0]-center[0],p[2]-center[2])));
      if(minY<bottom-.01||maxY>top+.01||maxRadius>radius+.01)issues.push({code:'hardware-rotor-outside-cavity',severity:'error',nodes:[rotor.id,housing.id],
        message:`固定旋转主体不在对应机壳空腔内（机壳局部坐标）：转子Y=[${minY.toFixed(3)},${maxY.toFixed(3)}]，空腔Y=[${bottom.toFixed(3)},${top.toFixed(3)}]；最大径向距离=${maxRadius.toFixed(3)}，空腔半径=${radius.toFixed(3)}。`,
        suggestion:'本资产是一台单轴转子机壳。按真实rotor-center/top/bottom/cavity-front端口缩放并居中转子，保留可见非对称条纹。级联必须为每根转子配独立机壳或自建正确的多腔结构；不要把多根轴放在单腔机壳之外。保留原本要求的设备与动作。'});
    }
  }
  if(/HMI/i.test(requirementText)&&/(?:物理|真实|physical|actual)/i.test(requirementText)){
    const fixedHmi=(scene.coverage?.interactions??[]).some(item=>/HMI/i.test(item.description)&&
      /(?:保持|不变|固定|静止|constant|unchanged)/i.test(item.description));
    const hmi=scene.nodes.filter(node=>/HMI/i.test(semantic(node))&&
      /(?:pointer|needle|指针)/i.test(semantic(node))&&(fixedHmi||changes(node.id)));
    const physical=scene.nodes.filter(node=>/(?:物理|真实|physical|actual)/i.test(semantic(node))&&changes(node.id));
    if(!hmi.some(node=>physical.some(other=>other.id!==node.id)))issues.push({code:'hardware-hmi-physical-evidence-missing',severity:'error',nodes:[...hmi,...physical].map(node=>node.id),
      message:'要求HMI显示与物理真实状态分离，但缺少独立的HMI可见指针和真正改变位置或角度的物理指针；静态surfaceText和emissive亮度不能表示物理读数变化。',
      suggestion:'分别创建HMI显示指针与物理真实指针基础几何，物理指针必须有position或rotation轨道；若原要求HMI读数保持正常，则其指针可静止。在注入/超速镜头同屏比较，复位回到初态。'});
  }
  if(/(?:紧急停机|emergency\s*(?:stop|shutdown))/i.test(requirementText)){
    const emergency=scene.learnerControls.find(control=>control.type==='button'&&/(?:紧急停机|emergency\s*(?:stop|shutdown))/i.test(`${control.id} ${control.label}`));
    if(!emergency||emergency.type!=='button'||!['seek','play-from'].includes(emergency.action)||emergency.at===undefined)issues.push({code:'hardware-emergency-stop-control-missing',severity:'error',nodes:[],
      message:'原要求包含紧急停机，但没有独立的紧急停机按钮触发受控降速/链路断开章节；普通pause不能冒充安全停机状态。',
      suggestion:'新增label明确为紧急停机的button learnerControl，action=play-from，at指向真实受控降速和链路断开的章节；保留单独pause与reset。'});
    else {
      const rotors=scene.nodes.filter(node=>isCinematicRotorBody(node)&&scene.nodes.some(parent=>parent.id===node.parent&&parent.model==='centrifuge-housing'));
      const uncontrolled=rotors.filter(rotor=>{
        const track=scene.tracks.find(item=>item.target===rotor.id&&item.property==='rotation');
        if(!track)return true;
        const stop=track.keyframes.findIndex(frame=>Math.abs(frame.at-emergency.at!)<.001);
        if(stop<1||stop>=track.keyframes.length-1)return true;
        const rate=(a:typeof track.keyframes[number],b:typeof track.keyframes[number])=>{
          const av=Array.isArray(a.value)?a.value[1]:0,bv=Array.isArray(b.value)?b.value[1]:0;
          return Math.abs(bv-av)/(b.at-a.at);
        };
        const before=rate(track.keyframes[stop-1],track.keyframes[stop]);
        const after=rate(track.keyframes.at(-2)!,track.keyframes.at(-1)!);
        const postRates=track.keyframes.slice(stop+1).map((frame,index)=>rate(track.keyframes[stop+index],frame));
        return before<=1e-6||after>before*.5||postRates.some((value,index)=>
          value>before*.85+1e-6||(index>0&&value>postRates[index-1]+1e-6));
      });
      if(uncontrolled.length)issues.push({code:'hardware-emergency-stop-motion-missing',severity:'error',nodes:uncontrolled.map(node=>node.id),
        message:'紧急停机按钮已存在，但转子轨道没有在按钮时间进入明显减速并受控停住；跳到普通连续旋转时间点不构成紧急停机。',
        suggestion:'在紧急停机at为每根仍运转的转子加入rotation关键帧，随后显著降低角速度并在结束前停住；coverage把紧急停机映射到这些转子及rotation，不能映射按钮自身位移。'});
    }
  }
  if(/(?:级联破坏|物理破坏|离心机解体|爆裂|碎裂|cascade\s*(?:damage|failure|destruction)|physical\s*(?:damage|destruction)|break(?:up|\s+apart))/i.test(requirementText)){
    const fragments=scene.nodes.filter(node=>/(?:debris|fragment|shard|碎片|断片)/i.test(semantic(node)));
    const moving=fragments.filter(node=>{
      const track=scene.tracks.find(item=>item.target===node.id&&item.property==='position');
      if(!track)return false;
      const vectors=track.keyframes.map(frame=>frame.value).filter(Array.isArray) as [number,number,number][];
      return vectors.some(value=>Math.hypot(...value.map((coordinate,index)=>coordinate-vectors[0][index]))>.55);
    });
    const appearing=fragments.filter(node=>{
      const track=scene.tracks.find(item=>item.target===node.id&&item.property==='opacity');
      if(!track)return node.opacity>=.65;
      const values=track.keyframes.map(frame=>Number(frame.value));
      return Math.min(node.opacity,...values)<=.12&&Math.max(node.opacity,...values)>=.65;
    });
    if(fragments.length<4||moving.length<3||appearing.length<3)issues.push({code:'hardware-physical-destruction-missing',severity:'error',nodes:fragments.map(node=>node.id),
      message:`要求可交互物理破坏，但实际只有${fragments.length}个碎片、${moving.length}个具有明显位移、${appearing.length}个从隐藏变为可见；字幕、闪光或整机抖动不能冒充解体。`,
      suggestion:'创建至少4个有体积的独立碎片，其中至少3个由低opacity显现并沿不同position轨道飞散；保留转子、机壳、HMI与安全联锁证据。'});
    const fragmentIds=new Set(fragments.map(node=>node.id));
    const destructionChapter=scene.chapters.find(chapter=>/(?:破坏|解体|碎裂|destruction|breakup)/i.test(`${chapter.title} ${chapter.caption}`)&&chapter.focus.filter(id=>fragmentIds.has(id)).length>=2);
    if(!destructionChapter)issues.push({code:'hardware-destruction-chapter-missing',severity:'error',nodes:fragments.map(node=>node.id),
      message:'物理破坏没有独立教学章节同时取景至少两个真实碎片，无法核对级联顺序和解体结果。',
      suggestion:'添加正时长破坏章节与近景，focus至少包含两个真实碎片及对应机壳/转子，并提出基于可见证据的观察问题。'});
    const structural=scene.nodes.filter(node=>/(?:centrifuge|housing|rotor|离心机|机壳|转子)/i.test(semantic(node))&&scene.tracks.some(track=>track.target===node.id&&['explode','position','scale','opacity'].includes(track.property)&&new Set(track.keyframes.map(frame=>JSON.stringify(frame.value))).size>1));
    if(!structural.length)issues.push({code:'hardware-destruction-source-static',severity:'error',nodes:scene.nodes.filter(node=>node.model==='centrifuge-housing').map(node=>node.id),
      message:'碎片与离心机主体没有可见结构变化，物理破坏缺少从主体到碎片的因果连续性。',
      suggestion:'在破坏章节让对应机壳或转子真实explode、位移、缩放或淡出，并与碎片显现时间重叠；随后保留受控停机/复位状态。'});
  }
  return issues;
}

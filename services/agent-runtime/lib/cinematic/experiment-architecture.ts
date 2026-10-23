import type { CinematicScene } from './schema';
import { normalizeCinematicDomainBindings, validateCinematicDomainLab } from './domain-lab-contract';

/** The lab owns conditions, choices and calculated consequences. The movie
 * owns observation and any explicitly requested physical narrative. */
export const CINEMATIC_EXPERIMENT_ARCHITECTURE = `本作品采用“领域实验优先”：先建真实对象，随后生成条件、方案、结果公式及三维绑定，最后按这些已执行结果编排观察与讲解。学生实验不依赖电影时间线。系统面板提供条件输入、决策按钮、撤销、同起点比较及实时数值，不在三维画面重复制作这些按钮、风险/得分看板或操作菜单。三维保留真正的设备、结构、运动标记和教师明确要求的现场屏幕/仪表；教师明确要求的HMI欺骗、指针对照、实体按钮等不能删除。
方案的后果由唯一领域模型计算；不同方案能改变真实设备状态或运动。不要再用range把同一个实验条件映射为电影时间，也不要另造暂停/停机电影按钮冒充领域方案。持续运动用真实转子的rotationSpeedY，固定部件不转；显式拆解、运输、级联故障、飞散等原文动作仍须有真实几何及轨道，不用实验读数代替。
电影章节可以介绍结构、观察关键局部和说明实验方法；仅描述电影已实现的动作。实验选择、恢复和比较应明确写“在实验模式选择…观察…”，不把一个未选择的策略说成该电影章必然发生的状态。不要求HMI、碎片、复位章节等原文未要求的额外机制。`;

/** A valid scaffolding scene lets the domain compiler use the already frozen
 * geometry before movie authoring. These chapters are never delivered. */
export function cinematicDomainScaffold(structure: Omit<CinematicScene,
  'schemaVersion' | 'tracks' | 'shots' | 'chapters' | 'coverage' | 'learnerControls' | 'lab'>): CinematicScene {
  const focus = structure.nodes.find(node => node.role === 'primary' && !['group','plane','points'].includes(node.kind)) ??
    structure.nodes.find(node => !['group','plane','points'].includes(node.kind));
  if (!focus) throw Error('领域实验需要真实可绘制主体');
  const times = [0, structure.duration / 4, structure.duration / 2, structure.duration * 3 / 4];
  return {schemaVersion:'cinematic-v1', ...structure, tracks:[], learnerControls:[],
    shots:times.map((at,index) => ({at,position:([[12,8,16],[-12,8,16],[0,12,16],[12,8,16]][index] as [number,number,number]),
      target:[0,0,0],fov:42,frame:{nodes:[focus.id],padding:1.2}})),
    chapters:times.map((at,index) => ({at,title:'领域绑定准备 '+index,
      caption:'仅用于生成领域模型的结构上下文，不是学生章节。',kind:'inspection',focus:[focus.id]}))};
}

export function cinematicExperimentAuthoringContext(scene: CinematicScene) {
  if (!scene.lab) return undefined;
  return {architecture:'domain-first-v1', modelNote:scene.lab.model.scene.modelNote,
    inputs:scene.lab.model.scene.inputs, decisions:scene.lab.model.scene.decisions,
    actions:scene.lab.model.scene.actions, views:scene.lab.model.scene.views,
    bindings:scene.lab.bindings, picks:scene.lab.picks ?? [],
    executedChoices:validateCinematicDomainLab(scene),
    runtime:{modes:'experiment computes choices; watch presents authored tracks',
      controls:'DOM conditions, decision buttons, reconsider, same-state comparison and observation clock'}};
}

/** Only differences in actual bound geometry count. A changed caption or a
 * changed risk value with identical geometry provides no physical evidence. */
export function cinematicDomainChanges(scene: CinematicScene,
  evidence: ReturnType<typeof validateCinematicDomainLab>, targets: string[]) {
  const nodes = new Map(scene.nodes.map(node => [node.id,node]));
  const related = (id:string) => {
    const seen = new Set<string>();
    for(let current:string|undefined=id;current&&!seen.has(current);current=nodes.get(current)?.parent) {
      if(targets.includes(current)) return true;
      seen.add(current);
    }
    return false;
  };
  const changes: Array<{decision:string; node:string; property:string; choices:string[]}> = [];
  for(const decision of evidence) {
    const keys = new Set(decision.alternatives.flatMap(choice => choice.bindings.map(binding => binding.node+'/'+binding.property)));
    for(const key of keys) {
      const values = decision.alternatives.flatMap(choice => choice.bindings.filter(binding =>
        binding.node+'/'+binding.property===key).map(binding => ({...binding,action:choice.action})));
      const first = values[0], node = first && nodes.get(first.node);
      if(!node || node.role==='decoration' || ['group','plane','points'].includes(node.kind) || !related(node.id)) continue;
      if(first.property==='colorMix'&&node.color.toLowerCase()===scene.theme.secondary.toLowerCase()) continue;
      const threshold = first.property==='emissive' ? .1 : .02;
      const difference = values.some(a => values.some(b => Array.isArray(a.value)&&Array.isArray(b.value)
        ? a.value.some((axis,i) => Math.abs(axis-(b.value as number[])[i])>=threshold)
        : typeof a.value==='number'&&typeof b.value==='number'&&Math.abs(a.value-b.value)>=threshold));
      if(difference) changes.push({decision:decision.decision,node:node.id,property:first.property,
        choices:values.map(value=>value.action)});
    }
  }
  return changes;
}

/** Add only executable domain evidence to a legacy movie-property mapping.
 * Keep its exact identities and promises for the independent source review. */
export function normalizeCinematicExperimentCoverage(scene:CinematicScene):CinematicScene {
  if(!scene.lab)return scene;
  // A local geometry repair can add a real spinning rotor after the first
  // binding pass. Apply the existing, evidence-limited wiring rule again
  // before checking coverage, rather than asking frozen-lab geometry editors
  // to invent movie controls for that rotor.
  const {model,...bound}=scene.lab;
  scene={...scene,lab:{model,...normalizeCinematicDomainBindings(scene,model,bound)}};
  if(!scene.coverage)return scene;
  let evidence:ReturnType<typeof validateCinematicDomainLab>;
  try {evidence=validateCinematicDomainLab(scene);} catch {return scene;}
  const equivalent:Record<string,string>={positionY:'position',rotationY:'rotation',rotationSpeedY:'rotation',
    opacity:'opacity',emissive:'emissive',scale:'scale',colorMix:'domain'};
  const interactions=scene.coverage.interactions.map(mapping=>{
    if(mapping.properties.some(property=>['domain','controls','explore','transport'].includes(property)))return mapping;
    const changes=cinematicDomainChanges(scene,evidence,mapping.targets);
    if(!changes.some(change=>mapping.properties.includes(equivalent[change.property] as typeof mapping.properties[number])))return mapping;
    return {...mapping,properties:[...mapping.properties,'domain' as const]};
  });
  return {...scene,coverage:{...scene.coverage,interactions}};
}

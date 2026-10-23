import type {ProcessScene,ProcessExpression} from './schema';
import {createProcessEngine} from '@/lib/server/process-quality';
import {isObjectSelectionInput} from './capabilities';

export type DecisionSurfaceModel={modelNote?:string;objectEvidence?:Array<{value:string|number|boolean|null;description:string}>};

/** Assemble a common decision lab from authored facts and executable state.
 * This compiler creates no coefficients, outcomes or science explanations.
 * Specialized content falls back to the existing presentation author. */
export function nativeDecisionPresentation(request:Record<string,unknown>,frozen:unknown,model:DecisionSurfaceModel):
  Omit<ProcessScene,'schemaVersion'|'inputs'|'initialState'|'actions'|'decisions'>|undefined {
  if(!frozen||typeof frozen!=='object')return;
  const {inputs,initialState,actions,decisions}=frozen as Pick<ProcessScene,'inputs'|'initialState'|'actions'|'decisions'>;
  const scene={inputs,initialState,actions,decisions};
  const text=[request.originalRequest,request.description].filter(part=>typeof part==='string').join('\n');
  if(!model.modelNote||!scene.decisions?.length||scene.decisions.length!==1||
      /代码|逐字节|寄存器|逐步算法|二分查找|CPU.{0,8}(?:指令|执行)|拖拽|拓扑|核对题|观察题|quiz/i.test(text))return;
  const selectable=scene.inputs.filter(input=>input.type==='select'&&isObjectSelectionInput(input));
  if(selectable.length!==1)return;
  const input=selectable[0],options=input.options!,evidence=model.objectEvidence;
  if(!evidence||evidence.length!==options.length||new Set(evidence.map(item=>JSON.stringify(item.value))).size!==evidence.length)return;
  const rows=options.map(option=>evidence.find(item=>JSON.stringify(item.value)===JSON.stringify(option.value)));
  if(rows.some(row=>!row))return;
  const decision=scene.decisions[0],fields=decision.observe;
  if(!fields.length||fields.some(field=>!Object.hasOwn(scene.initialState,field.field)))return;
  const values=options.map(option=>option.value);
  const selected:ProcessExpression={op:'at',args:[{op:'indicesOf',args:[values,{input:input.id}]},0]};
  const views:ProcessScene['views']=[
    {id:'decision-objects',title:input.label,kind:'array',value:options.map(option=>option.label),
      activeIndex:selected,pick:{input:input.id},caption:'直接点击一个对象，查看对应证据。当前实验进展保留。'},
    {id:'decision-evidence',title:'所选对象的证据',kind:'text',value:{op:'at',args:[rows.map(row=>row!.description),selected]},
      caption:'这些证据来自当前场景。结合实验条件判断，并比较你的方案带来的实际后果。'},
    ...fields.map((field,index):ProcessScene['views'][number]=>({id:'decision-reading-'+index,title:field.label,
      kind:Array.isArray(scene.initialState[field.field])?'array':'value',value:{state:field.field},
      caption:'本次模型中的状态读数；选择执行后与方案结果同步。'})),
  ];
  const interactions=((request.visualIntent as {interactions?:string[]}|undefined)?.interactions??[]);
  const presentation:Omit<ProcessScene,'schemaVersion'|'inputs'|'initialState'|'actions'|'decisions'>={title:String(request.title??'决策探索实验'),layout:'decision-lab',
    summary:'选择对象查看证据，调整实验条件，再根据情境作出决定。观察实际后果，回到同一决策点尝试其他方案。',
    modelNote:model.modelNote,views,
    stages:[{id:'decision-context',title:'观察证据与作出决定',when:decision.when,
      explanation:'先观察所选对象的证据和实验条件，再选择领域方案。选择会按当前条件计算后果；可回到同一起点比较另一方案。'},
    {id:'decision-outcome',title:'观察与比较后果',when:{op:'not',args:[decision.when]},
      explanation:'查看当前状态读数与方案结果。回到这个决策点时，原方案结果保留，状态和实验条件恢复到同一起点。'}],
    questions:[],coverage:interactions.map(description=>({description,inputs:scene.inputs.map(input=>input.id),
      actions:decision.choices,views:views.map(view=>view.id)}))};
  if(createProcessEngine({schemaVersion:'process-v1',...scene,...presentation}).evaluate(decision.when)!==true)return;
  return presentation;
}

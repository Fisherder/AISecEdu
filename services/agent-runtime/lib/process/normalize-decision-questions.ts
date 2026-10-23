import type {ProcessScene} from './schema';

/** A question can name a particular measured field that already appears in
 * an array/bar view. Expose that same field as a scalar readout, preserving
 * the question and computation rather than asking the author to redo them. */
export function normalizeDecisionQuestionEvidence(scene:ProcessScene):string[]{
  const changes:string[]=[];
  for(const question of scene.questions??[]){
    const source=scene.views.find(view=>view.id===question.evidenceView);
    if(!source||!['array','bars'].includes(source.kind))continue;
    const value=source.value;
    if(!value||typeof value!=='object'||Array.isArray(value)||!('op' in value)||value.op!=='array')continue;
    const members=new Set(value.args.flatMap(item=>item&&typeof item==='object'&&!Array.isArray(item)&&'state' in item?[item.state]:[]));
    const observed=[...new Map((scene.decisions??[]).flatMap(decision=>decision.observe)
      .filter(item=>members.has(item.field)&&item.label.length>=3&&question.prompt.includes(item.label))
      .map(item=>[item.field,item])).values()];
    if(observed.length!==1)continue;
    const field=observed[0];
    let readout=scene.views.find(view=>view.kind==='value'&&view.value&&typeof view.value==='object'&&
      !Array.isArray(view.value)&&'state' in view.value&&view.value.state===field.field);
    if(!readout){
      const id=source.id.slice(0,24)+'-'+field.field.slice(0,20);
      if(scene.views.length>=12||scene.views.some(view=>view.id===id))continue;
      readout={id,title:field.label,kind:'value',value:{state:field.field},
        caption:'与“'+source.title+'”中的同名结果一致，显示本次决定后的读数。'};
      scene.views.push(readout);changes.push('/views/@'+id);
    }
    question.evidenceView=readout.id;changes.push('/questions/@'+question.id+'/evidenceView');
  }
  return changes;
}

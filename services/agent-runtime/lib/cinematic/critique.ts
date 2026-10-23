import { z } from 'zod';
import { runDurableStage, generationFingerprint } from '@/lib/generation/durable-stage';
import { GenerationStageError } from '@/lib/generation/validated-stage';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { parseCinematicJson } from './json';

const assessmentSchema = z.object({
  index:z.number().int().nonnegative(), issue:z.string().optional(), blocking:z.boolean().optional(),
  verdict:z.enum(['blocking','advisory','claim-refuted']).optional(), evidence:z.string().min(12).max(12000),
  // Explanatory transport metadata never supplies or overrides a verdict.
  // Keep the already paid explanation without requesting the same audit again.
  note:z.string().max(12000).optional(),
}).strict().refine(row => row.verdict !== undefined || row.blocking !== undefined, 'Each claim needs a verdict')
  .refine(row => row.verdict === undefined || row.blocking === undefined || row.blocking === (row.verdict === 'blocking'),
    'Verdict and blocking flag contradict each other; independently correct this verdict')
  .transform(({verdict,blocking,...row}) => ({...row,blocking:verdict === undefined ? blocking! : verdict === 'blocking'}));
// Providers sometimes encode an indexed list as {"0": {...}, "1": {...}}.
// Those keys are explicit claim identities, so this is a lossless transport
// conversion, not an inferred verdict. Conflicting or nonnumeric identities
// remain invalid; omitted claims still need their own assessment.
const auditSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as {assessments?:unknown};
  const rows = source.assessments;
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return value;
  const entries = Object.entries(rows);
  if (!entries.length || entries.some(([key,row]) => !/^(0|[1-9]\d*)$/.test(key) ||
      !row || typeof row !== 'object' || Array.isArray(row) ||
      Object.hasOwn(row,'index') && (row as {index:unknown}).index !== Number(key))) return value;
  return {...source, assessments: entries.map(([key,row]) => ({...row as object,index:Number(key)}))};
}, z.object({ assessments: z.array(assessmentSchema).max(100) }).strict());

function scopedAudit(value:unknown,issues:string[]){
  if(!value||typeof value!=='object'||Array.isArray(value))return auditSchema.parse(value);
  const source=value as {assessments?:unknown};
  const rows=source.assessments;
  // Scope the explicit identities before validating verdict bodies. A
  // malformed invented row outside this batch cannot invalidate correct
  // paid verdicts; malformed or missing real claims still fail normally.
  const relevant=(row:unknown)=>!row||typeof row!=='object'||Array.isArray(row)||
    !('index' in row)||typeof row.index!=='number'||!Number.isInteger(row.index)||row.index<issues.length;
  if(Array.isArray(rows))return auditSchema.parse({...source,assessments:rows.filter(relevant)});
  if(rows&&typeof rows==='object'){
    const entries=Object.entries(rows);
    const explicit=entries.every(([key,row])=>/^(0|[1-9]\d*)$/.test(key)&&row&&typeof row==='object'&&!Array.isArray(row)&&
      (!Object.hasOwn(row,'index')||(row as {index:unknown}).index===Number(key)));
    if(explicit)return auditSchema.parse({...source,assessments:Object.fromEntries(entries.filter(([key])=>Number(key)<issues.length))});
  }
  return auditSchema.parse(value);
}

export async function completeCinematicCritiqueAssessments(
  issues:string[], evidence:Record<string,unknown>, raw:string, aiCall:AICallFn,
  onPartial?:(value:z.infer<typeof auditSchema>)=>Promise<void>,
):Promise<string>{
  let parsed:z.infer<typeof auditSchema>;
  try {parsed=scopedAudit(parseCinematicJson(raw).value,issues);}
  catch {return raw;}
  await onPartial?.(parsed);
  const present=new Set(parsed.assessments.filter(row=>row.index<issues.length &&
    (row.issue===undefined || row.issue===issues[row.index])).map(row=>row.index));
  const missing=issues.map((_issue,index)=>index).filter(index=>!present.has(index));
  if(!missing.length || missing.length>8 || !present.size)return raw;
  const response=await aiCall(
    '只补齐上一份三维教学演示缺陷裁定遗漏的索引，不重新审查已回答项。只输出JSON {assessments:[{index,blocking,evidence}]}。index必须是missingIssues中的原始编号，每项恰好一次；证据须指向当前场景或浏览器取样，不能猜测或默认放行。',
    JSON.stringify({missingIssues:missing.map(index=>({index,issue:issues[index]})),evidence}),
    undefined,{stage:'cinematic-review'},
  );
  try{
    const supplement=scopedAudit(parseCinematicJson(response).value,issues);
    const expected=new Set(missing);
    await onPartial?.(supplement);
    if(supplement.assessments.length!==missing.length ||
      supplement.assessments.some(row=>!expected.delete(row.index) ||
        row.issue!==undefined && row.issue!==issues[row.index]) || expected.size)return raw;
    return JSON.stringify({assessments:[...parsed.assessments,...supplement.assessments]});
  }catch{return raw;}
}

export const CINEMATIC_CRITIQUE_PROMPT = `你是教学演示缺陷裁定员。前一审查员的issues是待核实主张，不是新需求；逐项用当前场景与原始教师要求确认是否真的阻断交付。只输出JSON {assessments:[{index,blocking,evidence}]}，index对应输入issues的零基序号，每个索引必须恰好出现一次。不要复写issue全文；证据指向该序号的具体字段或真实取样。
本版输出使用verdict代替blocking：{index,verdict:"blocking|advisory|claim-refuted",evidence}。证据确认原主张成立且确实阻断时选blocking；可选优化选advisory；证据否定原主张时选claim-refuted。不要一边解释“已实现、不构成缺陷、非阻断”一边选blocking，不新增问题来支持已被否定的主张。
blocking=true只用于原文遗漏、学科错误、已承诺动作/状态和实际几何轨道的矛盾、或指定观察对象确实不可见。不要因为全部sourceChecks通过就忽略真实事实错误。
processor精细资产内含可见的陶瓷封装、铜中介层、硅晶片、保护窗和引脚网格；root的explode会使内部part真实分离。internalPartsAddressable=false只是不能为每个内部part单独写SceneIR轨道，不等于只有一个实体外壳。若教师原文只要观察层次并展开复原，不能单凭多个coverage对象映射到同一个processor根节点判阻断；应看真实画面和explode轨道。若“依次逐层”只出现在生成稿而不在教师原文，应修正该超额承诺，不拆掉精细模型替换成盒子。教师明确要求独立操控或顺序展开时仍须真实实现。
runtimeFacts是编译器对真实播放器语义的只读说明：range会把输入值确定性映射到timeRange并立即seek时间轴，因此会改变该区间内所有轨道状态；这就是实际输入绑定，不要求轨道另存控件ID。reset会回到t=0、恢复全部轨道初态和range默认值，不要求专用reset轨道。不能把这两项实现机制判成缺陷。移动标记在发送端口的起点帧或接收端口的终点帧与设备局部重合是合理的；只有过程取样证明关键传播阶段持续不可见时，才可据此阻断，不能用单一起止帧否定整段运动。frame.nodes只参与取景，不是显示白名单。
实验actualMotion的before/after是按2π规范化的欧拉相位，不是累计角度。正速度下最终相位变小可能是已向前转过数圈；不能据此判倒转。核对expectedUnwrappedDisplacementRadians与实际sampledWorldPhaseAgreement；相位检查不通过仍保留真实缺陷。实验域的sameCheckpoint和comparisonRows是实测撤销与比较；观影模式seek按钮回到另一电影时刻不会改变实验域的决策起点，不能要求两个模式合并时钟或同范围。原文明确要求两种模式联动时另行核对。只读绑定公式位于scene.lab.bindings，领域模型位于scene.lab.model.scene，模型内部没有bindings字段。
结构介绍、观察、复核和总结可以保持静态供学生旋转查看；未要求的额外动作、每一秒都运动、每个标记必须同时到达、每一面都完全露出都不是交付条件。章节内完成动作后保留结果供观察是有效安排，不因后段静止而否定动作章节。物体后壁被自身前部合理遮挡不等于该物体不可辨认；复合对象的某个非关键子件不可见不等于整体不可见。真实焦点/关键动作被遮挡仍必须保留缺陷。warnings、可选美术优化和推测放为blocking=false并说明理由。
只核实当前issues，不编写补丁，不新增条件，不改变教师原文。不确定且缺少具体证据不能声称已有确定缺陷，应说明缺少什么证据。`;

export type CinematicSourceCheck = {
  index: number;
  quote: string;
  fulfilled: boolean;
  evidence: string;
};

export function cinematicSemanticCritiqueClaims(issues: string[], sourceChecks: CinematicSourceCheck[]) {
  return [...new Set([
    ...issues,
    ...sourceChecks.filter(check => !check.fulfilled)
      .map(check => '原始要求未落实：' + check.quote + '；实际证据：' + check.evidence),
  ])];
}

export function reconcileCinematicSemanticCritique(
  issues: string[],
  observations: string[],
  sourceChecks: CinematicSourceCheck[],
  adjudicated: {issues: string[]; observations: string[]},
) {
  const claims = cinematicSemanticCritiqueClaims(issues, sourceChecks);
  const blocking = new Set(adjudicated.issues);
  const reconciledChecks = sourceChecks.map(check => {
    if (check.fulfilled) return check;
    const claim = '原始要求未落实：' + check.quote + '；实际证据：' + check.evidence;
    return blocking.has(claim) ? check : {
      ...check,
      fulfilled: true,
      evidence: check.evidence + '；独立证据裁定确认此前失败理由不构成交付缺口。',
    };
  });
  return {
    issues: claims.filter(claim => blocking.has(claim)),
    observations: [...observations, ...adjudicated.observations],
    sourceChecks: reconciledChecks,
  };
}

export async function adjudicateCinematicCritique(input: { issues: string[]; evidence: Record<string, unknown> }, aiCall: AICallFn, state?: GenerationStateStore, signal?: AbortSignal) {
  const facts = input.evidence.runtimeFacts as {reviewSemanticsVersion?:string}|undefined;
  const reviewSemanticsVersion = facts?.reviewSemanticsVersion;
  const scope={request:input.evidence.request,frozenRequirements:input.evidence.frozenRequirements,scene:input.evidence.scene,
    ...(reviewSemanticsVersion ? {reviewSemanticsVersion} : {})};
  const auditVersion = reviewSemanticsVersion ? 'v5' : 'v4';
  const planName='critique-plan-'+generationFingerprint({issues:input.issues,...scope}).slice(0,24);
  const savedPlan=state?.read(planName) as {batchSize?:number}|undefined;
  // New runs carry more verdicts per evidence packet. Exact existing batches
  // keep their previous grouping, so this policy upgrade never discards paid
  // audits just to use a different batch size.
  const hasEarlierEightBatch=!reviewSemanticsVersion&&input.issues.some((_issue,offset)=>offset%8===0&&(
    (state?.read('workflow-critique-audit-v4-'+generationFingerprint({issues:input.issues.slice(offset,offset+8),...scope}).slice(0,24)) as {output?:unknown}|undefined)?.output!==undefined||
    (state?.read('workflow-critique-audit-v3-'+generationFingerprint({issues:input.issues.slice(offset,offset+8),evidence:input.evidence}).slice(0,24)) as {output?:unknown}|undefined)?.output!==undefined));
  const batchSize=savedPlan?.batchSize===8||savedPlan?.batchSize===16?savedPlan.batchSize:hasEarlierEightBatch?8:16;
  if(!savedPlan)await state?.write(planName,{batchSize});
  type Assessment = {index:number; issue:string; blocking:boolean; evidence:string};
  const auditBatch = async (issues: string[], indexes:number[]): Promise<Assessment[]> => {
    const batch={issues,evidence:input.evidence};
    const checkpointInput={issues,...scope},scopeFingerprint=generationFingerprint(checkpointInput);
    const progressName='critique-progress-'+scopeFingerprint.slice(0,24);
    const progress=state?.read(progressName) as {scopeFingerprint?:string;output?:unknown}|undefined;
    const partial=new Map<number,z.infer<typeof auditSchema>['assessments'][number]>();
    const retain=(value:z.infer<typeof auditSchema>)=>{
      const fresh=new Map<number,z.infer<typeof auditSchema>['assessments'][number]>();
      for(const row of value.assessments){
        if(partial.has(row.index)||issues[row.index]===undefined||
          (row.issue!==undefined&&row.issue!==issues[row.index]))continue;
        const previous=fresh.get(row.index);
        // Preserve a complete blocking witness when duplicate judgments
        // disagree; no numerical or textual output limit grants a pass.
        fresh.set(row.index,previous?.blocking?previous:row.blocking?row:previous??row);
      }
      for(const [index,row] of fresh)partial.set(index,row);
    };
    if(progress?.scopeFingerprint===scopeFingerprint){const parsed=auditSchema.safeParse(progress.output);if(parsed.success)retain(parsed.data);}
    const savePartial=async(value:z.infer<typeof auditSchema>)=>{
      retain(value);await state?.write(progressName,{scopeFingerprint,output:{assessments:[...partial.values()]}});
    };
    const completed=()=>[...partial.values()].sort((a,b)=>a.index-b.index).map(row=>({...row,index:indexes[row.index],issue:issues[row.index]}));
    if(partial.size===issues.length)return completed();
    const legacy=(!reviewSemanticsVersion ? state?.read('workflow-critique-audit-v3-'+generationFingerprint(batch).slice(0,24)) : undefined) as
      {output?:unknown}|undefined;
    let triedLegacy=false;
    try {
      const result = await runDurableStage({
    name: 'critique-audit-'+auditVersion+'-' + generationFingerprint(checkpointInput).slice(0, 24), system: CINEMATIC_CRITIQUE_PROMPT,
    input:batch, checkpointInput,
    maxAttempts:1,maxTotalAttempts:2,
    aiCall:async(system,user,images,options)=>{
      if(!triedLegacy && legacy?.output!==undefined){
        triedLegacy=true;
        return JSON.stringify(legacy.output);
      }
      const missing=issues.map((issue,index)=>({issue,index})).filter(row=>!partial.has(row.index));
      const raw=await aiCall(partial.size?'只输出JSON {assessments:[{index,blocking,evidence}]}，只判断missingIssues里的原编号，每项一次；已完成的结论由服务端保留，不能重新回答或改变它们。基于当前evidence逐项裁定，不默认放行。':system,
        partial.size?JSON.stringify({missingIssues:missing,evidence:input.evidence}):user,images,options);
      let merged=raw;try{const answer=scopedAudit(parseCinematicJson(raw).value,issues);await savePartial(answer);
        merged=JSON.stringify({assessments:[...partial.values()]});}catch{/* Malformed new verdicts do not erase completed ones. */}
      return completeCinematicCritiqueAssessments(issues,input.evidence,merged,aiCall,savePartial);
    },
    state, signal, stage: {stage: 'cinematic-review'},
    validate: value => {
      const result = scopedAudit(value,batch.issues), assessments = new Map<number,typeof result.assessments[number]>();
      for (const row of result.assessments) {
        // The index is the identity. A model can append one speculative row
        // beyond the supplied claims (seen with 27 Stuxnet claims and 28
        // answers), or duplicate an index, without omitting any real claim.
        // Ignore only out-of-range rows and conservatively merge duplicates;
        // every actual source claim must still receive a verdict.
        if(batch.issues[row.index]===undefined||
           (row.issue!==undefined&&row.issue!==batch.issues[row.index]))continue;
        const previous=assessments.get(row.index);
        assessments.set(row.index,previous?{
          index:row.index,blocking:previous.blocking||row.blocking,
          evidence:previous.evidence+'；'+row.evidence,
        }:{index:row.index,blocking:row.blocking,evidence:row.evidence});
      }
      if (assessments.size !== batch.issues.length) throw Error('Assess every original issue; do not omit an issue');
      return {assessments:[...assessments.values()].sort((a,b)=>a.index-b.index)};
    },
  });
      await savePartial(result);return completed();
    } catch (error) {
      // Missing verdicts receive their own check while completed judgments
      // remain durable. Split only a batch with no usable answers; never
      // infer a verdict for an omitted claim.
      if (!(error instanceof GenerationStageError) || issues.length <= 1 ||
          !error.failures.at(-1)?.issues.some(issue => issue.includes('Assess every original issue'))) throw error;
      const missing=issues.map((issue,index)=>({issue,index})).filter(row=>!partial.has(row.index));
      if(missing.length<issues.length){
        const results=await auditBatch(missing.map(row=>row.issue),missing.map(row=>indexes[row.index]));
        await savePartial({assessments:results.map(row=>({...row,index:indexes.indexOf(row.index)}))});
        return completed();
      }
      const split = Math.ceil(issues.length / 2);
      return [...await auditBatch(issues.slice(0, split), indexes.slice(0,split)),
        ...await auditBatch(issues.slice(split), indexes.slice(split))];
    }
  };
  const allAssessments: Assessment[] = [];
  for(let offset=0;offset<input.issues.length;offset+=batchSize){
    allAssessments.push(...await auditBatch(input.issues.slice(offset,offset+batchSize),
      Array.from({length:Math.min(batchSize,input.issues.length-offset)},(_,index)=>offset+index)));
  }
  const assessments = allAssessments;
  return {
    issues: assessments.filter(row => row.blocking).map(row => row.issue),
    observations: assessments.filter(row => !row.blocking).map(row => '审查意见经证据核对不构成阻断：' + row.issue + '；' + row.evidence),
    assessments,
  };
}

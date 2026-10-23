import { processEvidenceForReview,typedDecisionEvidenceForReview,restoreCompiledDecisionObjectBinding } from '@/lib/process/review-evidence';
import {parseDecisionOutcomeSpec,DECISION_OUTCOME_REPAIR_FORMAT,assertTypedDecisionParameterDependencies} from '@/lib/process/decision-outcome-spec';
import {compileTypedDecisionRepair} from '@/lib/process/typed-decision-repair';
import { buildDecisionRuntimeTests } from '@/lib/process/decision-runtime-tests';
import { processPackageSchema } from '@/lib/process/schema';
import { normalizeDecisionPresentation, normalizeDecisionRecovery } from '@/lib/process/normalize-decision-presentation';
import {normalizeDecisionQuestionEvidence} from '@/lib/process/normalize-decision-questions';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import { generateStagedProcessPackage, PROCESS_STAGED_SYSTEMS, validateReachableBehaviorTransitions } from '@/lib/process/scene-workflow';
import { verifiedProcessReference } from '@/lib/process/reference-scenes';
import { normalizeRequestedByteMemoryPackage, validateRequestedByteMemoryTransitions } from '@/lib/process/byte-memory-contract';
import { normalizeModelEnvelope, runDurableStage } from '@/lib/generation/durable-stage';
import { compactRepairFailureHistory, REPAIR_HISTORY_REFERENCE_BRIEF } from '@/lib/generation/repair-context';
import { normalizeActionContinuationPhase, normalizeDynamicActionArrayValues, normalizeProcessActionLocalOrder, normalizeProcessExpressions, normalizeUndeclaredStateLocals } from '@/lib/process/normalize';
import { normalizeReadOnlyInputMirrors, normalizeUndeclaredInputMirrors } from '@/lib/process/normalize-input-mirrors';
import { normalizeBooleanAtReads, normalizeNullableIfGuards, normalizeNullableTextViews } from '@/lib/process/normalize-null-guards';
import { dropTextHistoryMarkers, guardCrossedDynamicRegions, guardDeferredFixedTableViews, normalizeLiteralArrayTextViews, normalizeOnePastEndLiteralRegions, normalizeSingleCellMarkers, normalizeStaticIndexViews } from '@/lib/process/normalize-static-index-views';
import { normalizeMissingNumericInputRanges, normalizeStringSelectOptions } from '@/lib/process/normalize-state-inputs';
import { runValidatedGenerationStage } from '@/lib/generation/validated-stage';
import type { LessonArtifact } from '@/lib/types/lesson';
import type { GeneratedInteractiveContent } from '@/lib/types/generation';
import type { SingleArtifactInput } from './lesson-generation';
import {
  PROCESS_CAPABILITY_BRIEF,
  PROCESS_APPEARANCE_BRIEF,
  PROCESS_EXPLANATION_EVIDENCE_BRIEF,
  PROCESS_LEARNING_QUESTION_BRIEF,
  PROCESS_RUNTIME_BEHAVIOR_BRIEF,
} from '@/lib/process/capabilities';
import { compileProcessScene, PROCESS_RUNTIME_VERSION } from '@/lib/process/compile';
import { processInteractionManifest } from '@/lib/process/interaction-manifest';
import { applyProcessDraftRepair, applyProcessRevision, normalizeAutomaticProcessPatchPath, processRevisionHash, PROCESS_REVISION_BRIEF, PROCESS_REVISION_PLAN_PROMPT, validateProcessRevisionPlan, type ProcessRevisionPlan } from '@/lib/process/revision';
import { PROCESS_TOPOLOGY_BRIEF } from '@/lib/process/topology-capability';
import {
  extractProcessScene,
  parseProcessScene,
  processOperations,
  type ProcessScene,
} from '@/lib/process/schema';
import { parseCinematicJson, CinematicJsonError } from '@/lib/cinematic/json';
import { createProcessEngine, inspectProcessInputGuards, validateProcessPackage, validateProcessPresentationFrames, ProcessTestAssertionError, ProcessTestSequenceError } from './process-quality';
import { LEARNER_LANGUAGE_BRIEF, LEARNER_LANGUAGE_REVIEW_BRIEF, learnerLanguageReviewSchema, validateLearnerLanguageReview, languageReviewProblems, assertLearnerTextOnlyRevision } from '@/lib/teaching/learner-language';
import { processLanguageUnits } from '@/lib/teaching/learner-language-surfaces';
import { configuredProcessInspector, parseProcessInspection, ProcessInspectorUnavailableError, type ProcessRenderInspection, type ProcessRenderInspector } from '@/lib/process/render-client';
import { removeNarrativeTestAssertions, normalizeTestExpressionValues, normalizeTestInputValues, normalizeGeneratedTestActions, removeNoopDomainTests, removeNonExecutableXorTests, removeRedundantInitialTests } from '@/lib/process/normalize-tests';
import { completeMissingInitialStage, removeProvablyUnreachableLiteralStages } from '@/lib/process/normalize-stages';
import { normalizeHexStringArrayViews, normalizeProcessedByteMarkers, recoverByteArraysFromLengthPanel } from '@/lib/process/normalize-byte-views';
import { replaceNoopContinuousAction } from '@/lib/process/normalize-continuous';
import { normalizeXorFinalHexAction, normalizeXorFinalHexTests } from '@/lib/process/normalize-xor-final-hex';
import { normalizeAscendingBinarySearch, normalizeAscendingSearchTests, reconcileVerifiedBinarySearchTests } from '@/lib/process/normalize-binary-search';
import { normalizeAccessPolicyProgress, normalizeAccessPolicyResultSurfaces, normalizePluralPolicyCursor, normalizeSingularPolicyFinalization, normalizeStepwisePolicyCopy, normalizeVerifiedDeferredWildcardPolicyMarks, normalizeVerifiedDeferredWildcardPolicyPresentation, reconcileVerifiedAccessPolicyTests, reconcileVerifiedDeferredWildcardPolicyTests, reconcileVerifiedLoadedPolicyPackage, reconcileVerifiedReadyPolicyFinalization, reconcileVerifiedPluralPolicyTests, reconcileVerifiedSingularPolicyTests, reconcileVerifiedStepwisePolicyTests, verifySingularPolicyFirstMatch } from '@/lib/process/normalize-access-policy';
import { removeMisleadingFirewallActionMarkers, removeRedundantFirewallWildcardShortcut } from '@/lib/process/normalize-firewall-rules';

/** Discard one independently authored test only when its input contradicts
 * the scene's explicit byte limit. The scene and all other tests are still
 * checked; this never changes a computed result to match the implementation. */
export function quarantineContradictoryByteLengthTest(candidate: unknown, failure: Error): unknown | undefined {
  if(!(failure instanceof ProcessTestAssertionError)||!candidate||typeof candidate!=='object')return;
  const packageValue=candidate as {scene?:any;tests?:any[]};
  if(!Array.isArray(packageValue.tests)||packageValue.tests.length<4)return;
  const prepare=packageValue.scene?.actions?.find((action:any)=>action?.id==='prepare');
  const cap=Number(/前\s*(\d+)\s*个字节/.exec(prepare?.description??'')?.[1]);
  if(!Number.isInteger(cap)||cap<1||cap>256)return;
  const inputs=packageValue.scene?.inputs;
  if(!Array.isArray(inputs)||!['textA','textB'].every(id=>inputs.some((input:any)=>input.id===id&&input.type==='text'&&input.ascii===true)))return;
  const index=packageValue.tests.findIndex(test=>typeof test?.name==='string'&&failure.message.startsWith(test.name+'：'));
  if(index<0)return;
  const test=packageValue.tests[index],a=test.inputs?.textA,b=test.inputs?.textB;
  if(typeof a!=='string'||typeof b!=='string'||!/^[\x20-\x7e]*$/.test(a)||!/^[\x20-\x7e]*$/.test(b))return;
  const expected=Math.min(cap,a.length,b.length);
  if(!test.expect?.some((assertion:any)=>assertion?.value?.state==='dataLength'&&
    typeof assertion.equals==='number'&&assertion.equals!==expected))return;
  const narrowed=structuredClone(candidate) as typeof packageValue;
  narrowed.tests!.splice(index,1);
  return narrowed;
}

/** A generated access-control test must not claim a rule whose explicit role,
 * resource or action cannot match its own inputs. Keep the policy and all
 * other tests intact, then run the full quality gate again. */
export function quarantineContradictoryPolicyRuleTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {initialState?: Record<string, unknown>}; tests?: Array<{name?: string; inputs?: Record<string, unknown>; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests) || pkg.tests.length < 4) return;
  const index = pkg.tests.findIndex(test => typeof test?.name === 'string' &&
    failure.message.startsWith(test.name + '：期望与实际状态不符 '));
  if (index < 0) return;
  const test = pkg.tests[index];
  let observed: {expression?: {state?: string}; expected?: unknown; actual?: unknown};
  try {observed = JSON.parse(failure.message.slice((test.name + '：期望与实际状态不符 ').length));}
  catch {return;}
  if (observed.expression?.state !== 'hitRuleIndex' || observed.actual !== -1 ||
      !Number.isInteger(observed.expected) || Number(observed.expected) < 0) return;
  const expected = Number(observed.expected);
  if (!test.expect?.some(assertion => (assertion.value as {state?: string})?.state === 'hitRuleIndex' && assertion.equals === expected)) return;
  const state = pkg.scene?.initialState;
  const roles = state?.ruleRoles, levels = state?.ruleLevels, actions = state?.ruleActions;
  if (![roles, levels, actions].every(list => Array.isArray(list) && list.length > expected &&
    list.every(item => typeof item === 'string'))) return;
  const inputs = test.inputs;
  if (!inputs || !['subjectRole', 'resourceLevel', 'requestAction'].every(id => typeof inputs[id] === 'string')) return;
  const mismatch = (rule: string, value: unknown) => rule !== '*' && rule !== value;
  if (![mismatch((roles as string[])[expected], inputs.subjectRole),
        mismatch((levels as string[])[expected], inputs.resourceLevel),
        mismatch((actions as string[])[expected], inputs.requestAction)].some(Boolean)) return;
  const narrowed = structuredClone(candidate) as typeof pkg;
  narrowed.tests!.splice(index, 1);
  return narrowed;
}

/** An authored firewall test cannot click past the first matching priority
 * rule. Drop that one test only when the static table and actual engine both
 * prove an earlier terminal match with the same final action. */
export function quarantineContradictoryFirewallRuleTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!candidate || typeof candidate!=='object' || !(failure instanceof Error)) return;
  const pkg=candidate as {scene?:any;tests?:Array<{name?:string;inputs?:Record<string,unknown>;
    actions?:Array<{id?:string;count?:number}>;expect?:Array<{value?:unknown;equals?:unknown}>}>};
  if(!Array.isArray(pkg.tests)||pkg.tests.length<4||!pkg.scene)return;
  const index=pkg.tests.findIndex(test=>typeof test?.name==='string'&&
    failure.message.startsWith(test.name+' step=') &&
    failure.message.includes('action=matchRule: Error: 请先完成该操作的前置条件'));
  if(index<0)return;
  const test=pkg.tests[index],state=pkg.scene.initialState,inputs=test.inputs;
  const zones=state?.rulesSrcZone,ports=state?.rulesDstPort,connections=state?.rulesConnState,
    actions=state?.rulesAction;
  if(![zones,ports,connections,actions].every(value=>Array.isArray(value)&&value.length>=2)||
      ![ports,connections,actions].every(value=>value.length===zones.length)||
      !inputs||typeof inputs.srcZone!=='string'||typeof inputs.dstPort!=='number'||
      typeof inputs.connState!=='string'||!Array.isArray(test.actions)||
      !Array.isArray(test.expect))return;
  const first=zones.findIndex((zone:unknown,rule:number)=>
    (zone==='any'||zone===inputs.srcZone)&&
    (ports[rule]===0||ports[rule]===inputs.dstPort)&&
    (connections[rule]==='any'||connections[rule]===inputs.connState));
  const expected=test.expect.find(item=>JSON.stringify(item.value)===JSON.stringify({state:'currentRule'}))?.equals;
  if(first<0||!Number.isInteger(expected)||Number(expected)<=first||
      !test.expect.some(item=>JSON.stringify(item.value)===JSON.stringify({state:'finalAction'})&&
        item.equals===actions[first])||
      !test.expect.some(item=>JSON.stringify(item.value)===JSON.stringify({state:'matched'})&&item.equals===true)||
      !test.expect.some(item=>JSON.stringify(item.value)===JSON.stringify({state:'finished'})&&item.equals===true))return;
  try{
    const engine=createProcessEngine(parseProcessScene(pkg.scene));
    for(const [id,value] of Object.entries(inputs))engine.setInput(id,value);
    let blocked=false;
    for(const step of test.actions){
      const count=step.count;
      if(typeof step.id!=='string'||typeof count!=='number'||!Number.isInteger(count)||count<1||count>24)return;
      for(let turn=0;turn<count;turn++){
        if(!engine.can(step.id)){blocked=step.id==='matchRule';break;}
        engine.act(step.id);
      }
      if(blocked)break;
    }
    const actual=engine.getState().state;
    if(!blocked||actual.currentRule!==first||actual.finalAction!==actions[first]||
        actual.matched!==true||actual.finished!==true)return;
  }catch{return;}
  const narrowed=structuredClone(candidate) as typeof pkg;
  narrowed.tests!.splice(index,1);
  return narrowed;
}

/** Keep an explicitly tested fallback denial while correcting only a
 * contradictory sentence that calls the same last rule "unmatched". */
export function reconcileDefaultDenyResultWording(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg=candidate as {scene?:unknown;tests?:Array<{name?:string;inputs?:Record<string,unknown>;
    actions?:Array<{id?:string;count?:number}>;expect?:Array<{value?:unknown;equals?:unknown}>}>};
  if(!pkg.scene||!Array.isArray(pkg.tests))return;
  const prefix='：期望与实际状态不符 ';
  const testIndex=pkg.tests.findIndex(test=>typeof test.name==='string'&&failure.message.startsWith(test.name+prefix));
  if(testIndex<0)return;
  const test=pkg.tests[testIndex];
  let observed:{expression?:unknown;expected?:unknown;actual?:unknown;state?:Record<string,unknown>};
  try{observed=JSON.parse(failure.message.slice((test.name+prefix).length));}catch{return;}
  if(JSON.stringify(observed.expression)!==JSON.stringify({state:'matchResult'})||
      observed.expected!=='全部规则未命中，由默认规则拒绝'||
      typeof observed.actual!=='string'||!/^命中 R[1-9]\d*：拒绝$/u.test(observed.actual))return;
  const state=observed.state,ruleId=state?.currentRuleId,skipped=state?.skippedRules,trail=state?.auditTrail;
  if(typeof ruleId!=='string'||observed.actual!==`命中 ${ruleId}：拒绝`||
      !Array.isArray(skipped)||skipped.length<2||!Array.isArray(trail)||trail.length!==skipped.length+2||
      state?.matchResult!==observed.actual||state?.finalAction!=='拒绝'||state?.finished!==true||
      state?.currentRuleMatch!==true||typeof state.currentRuleDesc!=='string'||
      !state.currentRuleDesc.includes('默认拒绝')||state.ruleIndex!==skipped.length||
      !skipped.every((id,index)=>typeof id==='string'&&trail[index+1]?.startsWith(`${id} 未命中`))||
      !trail.at(-1)?.startsWith(`${ruleId} 命中`))return;
  const asserted=(key:string,value:unknown)=>test.expect?.some(item=>
    JSON.stringify(item.value)===JSON.stringify({state:key})&&JSON.stringify(item.equals)===JSON.stringify(value));
  if(!asserted('currentRuleId',ruleId)||!asserted('currentRuleMatch',true)||
      !asserted('skippedRules',skipped)||!asserted('finalAction','拒绝')||
      !asserted('finished',true)||!asserted('ruleIndex',skipped.length))return;
  const assertionIndex=test.expect?.findIndex(item=>
    JSON.stringify(item.value)===JSON.stringify(observed.expression)&&item.equals===observed.expected);
  if(assertionIndex===undefined||assertionIndex<0||!test.inputs||!Array.isArray(test.actions))return;
  try{
    const engine=createProcessEngine(parseProcessScene(pkg.scene));
    engine.reset(test.inputs);
    for(const operation of test.actions){
      if(typeof operation.id!=='string'||!Number.isInteger(operation.count)||
          operation.count!<1||operation.count!>24)return;
      for(let step=0;step<operation.count!;step++)engine.act(operation.id);
    }
    const replay=engine.getState().state;
    for(const key of ['matchResult','currentRuleId','currentRuleDesc','skippedRules','auditTrail',
      'finalAction','finished','currentRuleMatch','ruleIndex'])
      if(JSON.stringify(replay[key])!==JSON.stringify(state[key]))return;
  }catch{return;}
  const revised=structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals=observed.actual;
  return revised;
}

/** Keep a test's rule and outcome intact when a repaired firewall scene only
 * changes the displayed rule fields from stored codes to their paired labels.
 * A different rule, field value, or outcome remains a real test failure. */
export function reconcileLocalizedPolicyTraceTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {tests?: Array<{name?: string; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const prefix = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test?.name === 'string' && failure.message.startsWith(test.name + prefix));
  if (testIndex < 0) return;
  const test = pkg.tests[testIndex];
  let observed: {expression?: unknown; expected?: unknown; actual?: unknown; state?: Record<string, unknown>};
  try {observed = JSON.parse(failure.message.slice((test.name + prefix).length));}
  catch {return;}
  const expression = observed.expression as {op?: string; args?: unknown[]} | undefined;
  if (expression?.op !== 'at' || expression.args?.length !== 2 ||
      JSON.stringify(expression.args[0]) !== JSON.stringify({state: 'trace'}) ||
      !Number.isInteger(expression.args[1])) return;
  if (typeof observed.expected !== 'string' || typeof observed.actual !== 'string') return;
  const pattern = /^规则#([1-9]\d*)：来源=([^，]+)，端口=([^，]+)，状态=([^ ]+) → (.+)$/u;
  const expected = pattern.exec(observed.expected), actual = pattern.exec(observed.actual);
  if (!expected || !actual || expected[1] !== actual[1] || expected[5] !== actual[5]) return;
  const ruleIndex = Number(expected[1]) - 1;
  const fields = [
    ['ruleSrc', 'ruleSrcLabel'],
    ['ruleDst', 'ruleDstLabel'],
    ['ruleState', 'ruleStateLabel'],
  ] as const;
  let localized = false;
  for (let field = 0; field < fields.length; field++) {
    const [rawKey, labelKey] = fields[field];
    const raw = observed.state?.[rawKey], labels = observed.state?.[labelKey];
    if (!Array.isArray(raw) || !Array.isArray(labels) ||
        ruleIndex >= raw.length || ruleIndex >= labels.length ||
        !['string', 'number'].includes(typeof raw[ruleIndex]) ||
        typeof labels[ruleIndex] !== 'string') return;
    const code = String(raw[ruleIndex]), label = labels[ruleIndex];
    if (![code, label].includes(expected[field + 2]) || actual[field + 2] !== label) return;
    localized ||= expected[field + 2] !== label;
  }
  if (!localized) return;
  const assertionIndex = test.expect?.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(observed.expression) && assertion.equals === observed.expected);
  if (assertionIndex === undefined || assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
  return revised;
}

/** Correct only prose match flags in an ordered firewall test when the
 * immutable rule table and the test inputs independently prove every flag.
 * Rule order, hit/miss, action and final state remain authored assertions. */
export function reconcileVerifiedFirewallAuditTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {initialState?: Record<string, unknown>};
    tests?: Array<{name?: string; inputs?: Record<string, unknown>;
      expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const prefix = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test?.name === 'string' &&
    failure.message.startsWith(test.name + prefix));
  if (testIndex < 0) return;
  const test = pkg.tests[testIndex];
  let observed: {expression?: unknown; expected?: unknown; actual?: unknown; state?: Record<string, unknown>};
  try {observed = JSON.parse(failure.message.slice((test.name + prefix).length));}
  catch {return;}
  if (JSON.stringify(observed.expression) !== JSON.stringify({state:'auditTrail'}) ||
      !Array.isArray(observed.expected) || !Array.isArray(observed.actual) ||
      observed.expected.length !== observed.actual.length || observed.actual.length < 2 ||
      JSON.stringify(observed.actual) !== JSON.stringify(observed.state?.auditTrail)) return;
  const initial = pkg.scene?.initialState, input = test.inputs;
  const zones=initial?.ruleZones, ports=initial?.rulePorts, states=initial?.ruleStates;
  const actions=initial?.ruleActions, priorities=initial?.rulePriorities;
  if (![zones,ports,states,actions,priorities].every(list=>Array.isArray(list) && list.length>0) ||
      !Array.isArray(zones) || !Array.isArray(ports) || !Array.isArray(states) ||
      !Array.isArray(actions) || !Array.isArray(priorities) ||
      ![ports,states,actions,priorities].every(list=>list.length===zones.length) ||
      !input || typeof input.srcZone!=='string' || typeof input.dstPort!=='number' ||
      typeof input.connState!=='string') return;
  const header=`数据包已装载：来源=${input.srcZone}，端口=${input.dstPort}，连接状态=${input.connState}`;
  if (observed.expected[0]!==header || observed.actual[0]!==header) return;
  const linePattern=/^第([1-9]\d*)条规则（优先级([1-9]\d*)）(未命中|命中)：来源 (符合|不符合)，端口 (符合|不符合)，连接状态 (符合|不符合)(，跳过|→ 动作 ([a-z]+))$/u;
  const withoutFlags=(value:string)=>value.replace(/(来源|端口|连接状态) (?:不符合|符合)/gu,'$1 ?');
  let changed=false;
  for(let i=1;i<observed.actual.length;i++){
    const expectedLine=observed.expected[i],actualLine=observed.actual[i];
    if(typeof expectedLine!=='string'||typeof actualLine!=='string'||
        withoutFlags(expectedLine)!==withoutFlags(actualLine)) return;
    const expected=linePattern.exec(expectedLine),actual=linePattern.exec(actualLine);
    if(!expected||!actual)return;
    const ruleIndex=Number(actual[1])-1;
    if(ruleIndex<0||ruleIndex>=zones.length||String(priorities[ruleIndex])!==actual[2])return;
    const matches=[zones[ruleIndex]==='*'||zones[ruleIndex]===input.srcZone,
      ports[ruleIndex]==='*'||ports[ruleIndex]===input.dstPort,
      states[ruleIndex]==='*'||states[ruleIndex]===input.connState];
    if(matches.some((match,index)=>actual[4+index] !== (match?'符合':'不符合')))return;
    if((actual[3]==='命中')!==matches.every(Boolean))return;
    if(actual[3]==='命中' ? actual[8]!==actions[ruleIndex] || actual[7]!==`→ 动作 ${actions[ruleIndex]}` :
      actual[7]!=='，跳过')return;
    changed ||= expectedLine!==actualLine;
  }
  if(!changed)return;
  const assertionIndex=test.expect?.findIndex(assertion=>
    JSON.stringify(assertion.value)===JSON.stringify(observed.expression) &&
    JSON.stringify(assertion.equals)===JSON.stringify(observed.expected));
  if(assertionIndex===undefined||assertionIndex<0)return;
  const revised=structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals=observed.actual;
  return revised;
}

/** Preserve an expected audit event while fixing only its position when the
 * runtime first records one or more explicit skipped rules. */
export function reconcileMisindexedAuditTrailTest(candidate: unknown, failure: Error): unknown | undefined {
  if(!(failure instanceof ProcessTestAssertionError)||!candidate||typeof candidate!=='object')return;
  const pkg=candidate as {tests?:Array<{name?:string;expect?:Array<{value?:unknown;equals?:unknown}>}>};
  if(!Array.isArray(pkg.tests))return;
  const prefix='：期望与实际状态不符 ';
  const testIndex=pkg.tests.findIndex(test=>typeof test?.name==='string'&&
    failure.message.startsWith(test.name+prefix));
  if(testIndex<0)return;
  const test=pkg.tests[testIndex];
  let observed:{expression?:{op?:unknown;args?:unknown[]};expected?:unknown;actual?:unknown;
    state?:Record<string,unknown>};
  try{observed=JSON.parse(failure.message.slice((test.name+prefix).length));}catch{return;}
  const expression=observed.expression, oldIndex=expression?.args?.[1];
  const trail=observed.state?.auditTrail;
  if(expression?.op!=='at'||JSON.stringify(expression.args?.[0])!==JSON.stringify({state:'auditTrail'})||
      !Number.isInteger(oldIndex)||Number(oldIndex)<1||typeof observed.expected!=='string'||
      typeof observed.actual!=='string'||!Array.isArray(trail)||trail.length>128||
      trail[Number(oldIndex)]!==observed.actual)return;
  const newIndex=trail.indexOf(observed.expected);
  if(newIndex<=Number(oldIndex)||newIndex>Number(oldIndex)+8||
      trail.lastIndexOf(observed.expected)!==newIndex||
      !trail.slice(Number(oldIndex),newIndex).every(line=>typeof line==='string'&&
        line.includes('不匹配')&&line.includes('跳过')))return;
  const assertionIndex=test.expect?.findIndex(assertion=>
    JSON.stringify(assertion.value)===JSON.stringify(expression)&&assertion.equals===observed.expected);
  if(assertionIndex===undefined||assertionIndex<0||test.expect?.some((assertion,index)=>
      index!==assertionIndex&&JSON.stringify(assertion.value)===JSON.stringify({op:'at',args:[{state:'auditTrail'},newIndex]})))return;
  const revised=structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].value={op:'at',args:[{state:'auditTrail'},newIndex]};
  return revised;
}

export function reconcileVerifiedByteXorTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {actions?: any[]; initialState?: Record<string, unknown>};
    tests?: Array<{name?: string; inputs?: Record<string, unknown>; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const prefix = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test.name === 'string' && failure.message.startsWith(test.name + prefix));
  if (testIndex < 0) return;
  const test = pkg.tests[testIndex];
  let observed: {expression?: unknown; expected?: unknown; actual?: unknown; state?: Record<string, unknown>};
  try {observed = JSON.parse(failure.message.slice((test.name + prefix).length));}
  catch {return;}
  const scalarId = (observed.expression as {state?: unknown})?.state;
  const scalarText = Object.values(test.inputs ?? {}).find(value =>
    typeof value === 'string' && /^[\x20-\x7e]*$/.test(value));
  const scalarKey = Object.entries(test.inputs ?? {}).find(([name, value]) =>
    /key|密钥/i.test(name) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)?.[1];
  const scalarBytes = typeof scalarText === 'string' ? Array.from(new TextEncoder().encode(scalarText)) : [];
  const scalarIndex = Object.entries(observed.state ?? {}).find(([name, value]) =>
    /index|position|step|cursor|^pos$/i.test(name) && Number.isInteger(value))?.[1];
  const scalarSourceMatches = typeof scalarKey === 'number' && typeof scalarIndex === 'number' &&
    scalarIndex > 0 && scalarIndex <= scalarBytes.length &&
    Object.values(observed.state ?? {}).some(value => Array.isArray(value) &&
      JSON.stringify(value) === JSON.stringify(scalarBytes));
  if (typeof scalarId === 'string' && scalarSourceMatches &&
      typeof scalarIndex === 'number' && typeof scalarKey === 'number' &&
      Array.isArray(observed.actual) && observed.actual.length === 2 &&
      Array.isArray(observed.expected) && observed.expected.length === 2 &&
      JSON.stringify(observed.state?.[scalarId]) === JSON.stringify(observed.actual) &&
      observed.actual[0] === scalarBytes[scalarIndex - 1] &&
      observed.actual[1] === (scalarBytes[scalarIndex - 1] ^ scalarKey) &&
      pkg.scene?.actions?.some(action => action?.updates?.some((update: any) =>
        update.target === scalarId && update.value?.op === 'array' &&
        update.value.args?.length === 2) && JSON.stringify(action).includes('"op":"xor"'))) {
    const assertionIndex = test.expect?.findIndex(assertion =>
      JSON.stringify(assertion.value) === JSON.stringify(observed.expression) &&
      JSON.stringify(assertion.equals) === JSON.stringify(observed.expected));
    if (assertionIndex !== undefined && assertionIndex >= 0) {
      const revised = structuredClone(candidate) as typeof pkg;
      revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
      return revised;
    }
  }
  if (typeof scalarId === 'string' && typeof observed.actual === 'string' &&
      typeof observed.expected === 'string' && observed.state?.[scalarId] === observed.actual &&
      scalarSourceMatches && typeof scalarIndex === 'number' && typeof scalarKey === 'number' &&
      pkg.scene?.actions?.some(action => action?.updates?.some((update: any) => update.target === scalarId) &&
        JSON.stringify(action).includes('"op":"xor"') && JSON.stringify(action).includes('"op":"hex"'))) {
    const computed = scalarBytes[scalarIndex - 1] ^ scalarKey;
    if (observed.actual === '0x' + computed.toString(16).toUpperCase().padStart(2, '0')) {
      const assertionIndex = test.expect?.findIndex(assertion =>
        JSON.stringify(assertion.value) === JSON.stringify(observed.expression) && assertion.equals === observed.expected);
      if (assertionIndex !== undefined && assertionIndex >= 0) {
        const revised = structuredClone(candidate) as typeof pkg;
        revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
        return revised;
      }
    }
  }
  if (typeof scalarId === 'string' && typeof observed.actual === 'number' &&
      typeof observed.expected === 'number' && observed.state?.[scalarId] === observed.actual &&
      pkg.scene?.actions?.some(action => action?.updates?.some((update: any) => update.target === scalarId) &&
        JSON.stringify(action).includes('"op":"xor"'))) {
    const key = scalarKey, bytes = scalarBytes, index = scalarIndex;
    if (typeof key === 'number' && typeof index === 'number' && index > 0 && index <= bytes.length &&
        Object.values(observed.state ?? {}).some(value => Array.isArray(value) &&
          JSON.stringify(value) === JSON.stringify(bytes)) &&
        observed.actual === (bytes[index - 1] ^ key)) {
      const assertionIndex = test.expect?.findIndex(assertion =>
        JSON.stringify(assertion.value) === JSON.stringify(observed.expression) && assertion.equals === observed.expected);
      if (assertionIndex !== undefined && assertionIndex >= 0) {
        const revised = structuredClone(candidate) as typeof pkg;
        revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
        return revised;
      }
    }
  }
  const indexed = observed.expression as {op?: unknown; args?: unknown[]} | undefined;
  if (indexed?.op === 'at' && Array.isArray(indexed.args) && indexed.args.length === 2 &&
      typeof (indexed.args[0] as {state?: unknown})?.state === 'string' &&
      Number.isInteger(indexed.args[1]) && typeof observed.actual === 'number' &&
      typeof observed.expected === 'number') {
    const id = (indexed.args[0] as {state: string}).state;
    const index = indexed.args[1] as number;
    const written = observed.state?.[id];
    const inputText = Object.values(test.inputs ?? {}).find(value =>
      typeof value === 'string' && /^[\x20-\x7e]*$/.test(value));
    const key = Object.entries(test.inputs ?? {}).find(([name, value]) =>
      /key|密钥/i.test(name) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)?.[1];
    const source = typeof inputText === 'string' ? Array.from(new TextEncoder().encode(inputText)) : [];
    const pair = Array.isArray(written) && written.length === 2 && index === 1 &&
      typeof key === 'number' && typeof scalarIndex === 'number' &&
      scalarSourceMatches && scalarIndex > 0 && scalarIndex <= source.length &&
      written[0] === source[scalarIndex - 1] && written[1] === observed.actual &&
      observed.actual === (written[0] ^ key) &&
      pkg.scene?.actions?.some(action => action?.updates?.some((update: any) =>
        update.target === id && update.value?.op === 'array' && update.value.args?.length === 2) &&
        JSON.stringify(action).includes('"op":"xor"'));
    if (pair) {
      const assertionIndex = test.expect?.findIndex(assertion =>
        JSON.stringify(assertion.value) === JSON.stringify(observed.expression) &&
        assertion.equals === observed.expected);
      if (assertionIndex !== undefined && assertionIndex >= 0) {
        const revised = structuredClone(candidate) as typeof pkg;
        revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
        return revised;
      }
    }
    if (Array.isArray(written) && index >= 0 && index < source.length &&
        typeof key === 'number' && written[index] === observed.actual &&
        observed.actual === (source[index] ^ key) &&
        pkg.scene?.actions?.some(action => action?.updates?.some((update: any) => update.target === id) &&
          JSON.stringify(action).includes('"op":"xor"'))) {
      const assertionIndex = test.expect?.findIndex(assertion =>
        JSON.stringify(assertion.value) === JSON.stringify(observed.expression) && assertion.equals === observed.expected);
      if (assertionIndex !== undefined && assertionIndex >= 0) {
        const revised = structuredClone(candidate) as typeof pkg;
        revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
        return revised;
      }
    }
  }
  const stateId = (observed.expression as {state?: unknown})?.state;
  if (typeof stateId !== 'string' || !Array.isArray(pkg.scene?.initialState?.[stateId]) ||
      !Array.isArray(observed.actual) || !Array.isArray(observed.expected) || !observed.actual.length ||
      !pkg.scene?.actions?.some(action => action?.updates?.some((update: any) => update.target === stateId) &&
        JSON.stringify(action).includes('"op":"xor"'))) return;
  const actual = observed.actual as number[];
  const byteArrays = [
    ...Object.entries(observed.state ?? {}).filter(([name]) => name !== stateId).map(([, value]) => value)
      .filter(Array.isArray),
    ...Object.values(test.inputs ?? {}).filter((value): value is string => typeof value === 'string')
      .map(value => Array.from(new TextEncoder().encode(value))),
  ].filter((value): value is number[] => Array.isArray(value) &&
    value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255));
  const keys = [...Object.entries(test.inputs ?? {}), ...Object.entries(observed.state ?? {})]
    .filter(([name]) => /key|密钥/i.test(name)).map(([, value]) => value)
    .filter((value): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255);
  if (!byteArrays.some(source => source.length >= actual.length && keys.some(key =>
    actual.every((byte, index) => byte === (source[index] ^ key))))) return;
  const assertionIndex = test.expect?.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(observed.expression) &&
    JSON.stringify(assertion.equals) === JSON.stringify(observed.expected));
  if (assertionIndex === undefined || assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
  return revised;
}

/** A terminal decision must close the same step that produces it. Only repair
 * the conventional pending/allow/deny state machine when an authored test
 * exposes the mismatch, then re-run every independent test before accepting. */
export function reconcileVerifiedTerminalDecision(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {initialState?: Record<string, unknown>; actions?: any[]; stages?: any[]}; tests?: unknown[]};
  if (!pkg.scene || !Array.isArray(pkg.scene.actions) || !Array.isArray(pkg.tests) ||
      pkg.scene.initialState?.result !== 'pending' || pkg.scene.initialState?.terminated !== false) return;
  const marker = '：期望与实际状态不符 ';
  const at = failure.message.indexOf(marker);
  if (at < 0) return;
  let observed: {expression?: unknown; expected?: unknown; actual?: unknown; state?: Record<string, unknown>};
  try {observed = JSON.parse(failure.message.slice(at + marker.length));}
  catch {return;}
  if (JSON.stringify(observed.expression) !== JSON.stringify({state: 'phase'}) ||
      observed.expected !== 'done' || observed.actual !== 'checking' ||
      !['allow', 'deny'].includes(String(observed.state?.result)) ||
      observed.state?.terminated !== false ||
      !pkg.scene.stages?.some(stage => stage?.when?.op === 'eq' &&
        JSON.stringify(stage.when.args) === JSON.stringify([{state: 'phase'}, 'done']))) return;
  const revised = structuredClone(candidate) as typeof pkg;
  const action = revised.scene?.actions?.find(item => {
    const updates = item?.updates;
    const result = updates?.find((update: any) => update.target === 'result');
    const resultLocal = result?.value?.local;
    const local = item?.locals?.find((entry: any) => entry.id === resultLocal);
    const source = JSON.stringify(local?.value);
    return typeof resultLocal === 'string' && local &&
      source.includes('"pending"') && source.includes('"allow"') && source.includes('"deny"') &&
      updates.some((update: any) => update.target === 'terminated') &&
      updates.some((update: any) => update.target === 'phase') &&
      JSON.stringify(item.enabledWhen) === JSON.stringify({op: 'not', args: [{state: 'terminated'}]});
  });
  if (!action) return;
  const resultLocal = action.updates.find((update: any) => update.target === 'result').value.local;
  action.updates.find((update: any) => update.target === 'terminated').value =
    {op: 'ne', args: [{local: resultLocal}, 'pending']};
  action.updates.find((update: any) => update.target === 'phase').value =
    {op: 'if', args: [{op: 'eq', args: [{local: resultLocal}, 'pending']}, 'checking', 'done']};
  try { validateProcessPackage(revised, [], {minimumProductQuality: true}); }
  catch { return; }
  return revised;
}

/** The test contract evaluates every assertion after all actions. A model may
 * mistakenly include an earlier frame in that final assertion list. Remove
 * only an assertion proven to describe an actual prior transition; all final
 * assertions remain subject to the full package validator. */
export function quarantineIntermediateStateAssertion(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {tests?: Array<{name?: string; actions?: Array<{count?: unknown}>;
    expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const marker = '：期望与实际状态不符 ';
  const index = pkg.tests.findIndex(test => typeof test.name === 'string' &&
    failure.message.startsWith(test.name + marker));
  if (index < 0) return;
  const test = pkg.tests[index];
  if (!Array.isArray(test.expect) || test.expect.length < 3 ||
      !Array.isArray(test.actions) ||
      test.actions.reduce((sum, step) => sum + (typeof step.count === 'number' ? step.count : 1), 0) < 2) return;
  let observed: {expression?: unknown; expected?: unknown; actual?: unknown;
    state?: Record<string, unknown>; recentTransitions?: Array<{after?: Record<string, unknown>}>};
  try {observed = JSON.parse(failure.message.slice((test.name + marker).length));}
  catch {return;}
  const stateId = (observed.expression as {state?: unknown} | undefined)?.state;
  const transitions = observed.recentTransitions;
  if (typeof stateId !== 'string' || !observed.expression ||
      Object.keys(observed.expression).length !== 1 || !Array.isArray(transitions) ||
      transitions.length < 2 ||
      JSON.stringify(observed.state?.[stateId]) !== JSON.stringify(observed.actual) ||
      !transitions.slice(0, -1).some(item =>
        JSON.stringify(item.after?.[stateId]) === JSON.stringify(observed.expected))) return;
  const assertionIndex = test.expect.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(observed.expression) &&
    JSON.stringify(assertion.equals) === JSON.stringify(observed.expected));
  if (assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![index].expect!.splice(assertionIndex, 1);
  return revised;
}

/** If the author's expected state is reached by exactly one more executable
 * domain step, extend that test by one step. This replays the complete input
 * and action sequence against the engine; it never changes the scene or the
 * expected result. */
export function extendProvenFinalTestStep(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: unknown; tests?: Array<{name?: string; inputs?: Record<string, unknown>;
    actions?: Array<{id?: string; count?: number | string}>}>};
  if (!pkg.scene || !Array.isArray(pkg.tests)) return;
  const marker = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test.name === 'string' &&
    failure.message.startsWith(test.name + marker));
  if (testIndex < 0) return;
  const test = pkg.tests[testIndex], last = test.actions?.at(-1);
  if (!last || typeof last.id !== 'string' || !Number.isInteger(last.count) ||
      (last.count as number) < 1 || (last.count as number) >= 255 || !test.inputs) return;
  let observed: {expression?: {state?: unknown}; expected?: unknown; actual?: unknown};
  try { observed = JSON.parse(failure.message.slice((test.name + marker).length)); }
  catch { return; }
  const stateId = observed.expression?.state;
  if (typeof stateId !== 'string' || Object.keys(observed.expression ?? {}).length !== 1) return;
  try {
    const engine = createProcessEngine(parseProcessScene(pkg.scene));
    for (const [id, value] of Object.entries(test.inputs)) engine.setInput(id, value);
    for (const operation of test.actions ?? []) {
      if (typeof operation.id !== 'string' || !Number.isInteger(operation.count) ||
          (operation.count as number) < 1) return;
      for (let step = 0; step < (operation.count as number); step++) {
        if (!engine.can(operation.id)) return;
        engine.act(operation.id);
      }
    }
    if (JSON.stringify(engine.getState().state[stateId]) !== JSON.stringify(observed.actual) ||
        !engine.can(last.id)) return;
    engine.act(last.id);
    if (JSON.stringify(engine.getState().state[stateId]) !== JSON.stringify(observed.expected)) return;
  } catch { return; }
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].actions!.at(-1)!.count = (last.count as number) + 1;
  return revised;
}

/** Correct only a count assertion over a reset-or-append history array.
 * A preparation step may seed one entry; later steps append one entry. The
 * final array and transition log must independently agree with the count. */
export function reconcileAppendHistoryCountTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {initialState?: Record<string, unknown>; actions?: any[]};
    tests?: Array<{name?: string; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const marker = '：期望与实际状态不符 ';
  const index = pkg.tests.findIndex(test => typeof test.name === 'string' && failure.message.startsWith(test.name + marker));
  if (index < 0) return;
  let observed: {expression?: {op?: unknown; args?: any[]}; expected?: unknown; actual?: unknown;
    state?: Record<string, unknown>; recentTransitions?: Array<{before?: Record<string, unknown>; after?: Record<string, unknown>}>};
  try { observed = JSON.parse(failure.message.slice((pkg.tests[index].name + marker).length)); }
  catch { return; }
  const expression = observed.expression, id = expression?.args?.[0]?.state;
  if (expression?.op !== 'length' || expression.args?.length !== 1 || typeof id !== 'string' ||
      !Array.isArray(pkg.scene?.initialState?.[id]) || pkg.scene.initialState[id].length !== 0 ||
      !Number.isInteger(observed.expected) || !Number.isInteger(observed.actual) ||
      Number(observed.actual) < 1 || Number(observed.actual) > 256 ||
      !Array.isArray(observed.state?.[id]) || observed.state[id].length !== observed.actual) return;
  const writes = (pkg.scene.actions ?? []).flatMap(action =>
    Array.isArray(action?.updates) ? action.updates.filter((update: any) => update.target === id)
      .map((update: any) => ({action, value:update.value})) : []);
  const source=JSON.stringify({state:id});
  const isOneAppend=(value:any):boolean =>
    (value?.op === 'append' && JSON.stringify(value.args?.[0]) === source) ||
    (value?.op === 'concatArrays' && JSON.stringify(value.args?.[0]) === source &&
      value.args?.[1]?.op === 'array' && value.args[1].args?.length === 1);
  const resolve=(action:any,value:any):any => value?.local && Array.isArray(action.locals)
    ? action.locals.find((local:any)=>local.id===value.local)?.value : value;
  const oneEntryStart=(action:any,value:any):boolean =>
    /load|prepare|装载|准备/i.test(String(action.id)+' '+String(action.label)) &&
    value?.op==='array' && value.args?.length===1;
  const reset=(value:any):boolean =>
    Array.isArray(value) && value.length===0 || value?.op==='array' && value.args?.length===0;
  if (!writes.some(({action,value}) => isOneAppend(resolve(action,value))) ||
      !writes.every(({action,value}) => {
        const resolved=resolve(action,value);
        return isOneAppend(resolved) || oneEntryStart(action,resolved) || reset(resolved);
      }) ||
      !observed.recentTransitions?.some(item =>
        Array.isArray(item.before?.[id]) && Array.isArray(item.after?.[id]) &&
        (item.after[id] as unknown[]).length === (item.before[id] as unknown[]).length + 1)) return;
  const assertionIndex = pkg.tests[index].expect?.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(expression) && assertion.equals === observed.expected);
  if (assertionIndex === undefined || assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![index].expect![assertionIndex].equals = observed.actual;
  return revised;
}

export function reconcileHexCaseTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {tests?: Array<{name?: string; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const prefix = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test.name === 'string' && failure.message.startsWith(test.name + prefix));
  if (testIndex < 0) return;
  const test = pkg.tests[testIndex];
  let observed: {expression?: {op?: string}; expected?: unknown; actual?: unknown};
  try {observed = JSON.parse(failure.message.slice((test.name + prefix).length));}
  catch {return;}
  if (observed.expression?.op !== 'hex' || typeof observed.expected !== 'string' ||
      typeof observed.actual !== 'string' || !/^0x[0-9a-f]+$/i.test(observed.expected) ||
      observed.expected.toLowerCase() !== observed.actual.toLowerCase()) return;
  const assertionIndex = test.expect?.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(observed.expression) && assertion.equals === observed.expected);
  if (assertionIndex === undefined || assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
  return revised;
}

/** Reconcile an authored hex-array assertion only when the observed bytes
 * independently equal ASCII input bytes or their per-byte XOR with the test
 * key. This corrects display notation and arithmetic in test expectations,
 * never the generated action or its runtime result. */
export function reconcileVerifiedHexArrayTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {actions?: any[]; initialState?: Record<string, unknown>};
    tests?: Array<{name?: string; inputs?: Record<string, unknown>; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const prefix = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test.name === 'string' && failure.message.startsWith(test.name + prefix));
  if (testIndex < 0) return;
  const test = pkg.tests[testIndex];
  let observed: {expression?: {state?: unknown}; expected?: unknown; actual?: unknown};
  try {observed = JSON.parse(failure.message.slice((test.name + prefix).length));}
  catch {return;}
  const stateId = observed.expression?.state;
  if (typeof stateId !== 'string' || !Array.isArray(pkg.scene?.initialState?.[stateId]) ||
      !Array.isArray(observed.expected) || !Array.isArray(observed.actual) || !observed.actual.length ||
      !observed.actual.every(item => typeof item === 'string' && /^0x[0-9a-f]{2}$/i.test(item))) return;
  const action = pkg.scene?.actions?.find(item => item?.updates?.some((update: any) => update.target === stateId) &&
    JSON.stringify(item).includes('"op":"hex"') && JSON.stringify(item).includes('"op":"xor"'));
  if (!action) return;
  const update = action.updates.find((item: any) => item.target === stateId);
  const locals = new Map<string, any>((action.locals ?? []).map((item: any) => [item.id, item.value]));
  const expand = (value: any, seen = new Set<string>()): any => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    if (typeof value.local === 'string' && locals.has(value.local) && !seen.has(value.local)) {
      const next = new Set(seen); next.add(value.local);
      return expand(locals.get(value.local), next);
    }
    return Array.isArray(value.args) ? {...value, args:value.args.map((arg: any) => expand(arg, seen))} : value;
  };
  const written = expand(update?.value);
  const byteExpression = written?.op === 'append' ? written.args?.[1] :
    update?.index !== undefined && written?.op === 'hex' ? written : undefined;
  if (byteExpression?.op !== 'hex' || !Array.isArray(byteExpression.args)) return;
  const isCipher = JSON.stringify(byteExpression.args[0]).includes('"op":"xor"');
  const text = Object.values(test.inputs ?? {}).find(value => typeof value === 'string' && /^[\x20-\x7e]*$/.test(value));
  const key = Object.entries(test.inputs ?? {}).find(([id, value]) =>
    /key|密钥/i.test(id) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)?.[1];
  if (typeof text !== 'string' || typeof key !== 'number') return;
  const bytes = Array.from(new TextEncoder().encode(text)).slice(0, observed.actual.length);
  if (bytes.length !== observed.actual.length) return;
  const hex = (byte: number) => '0x' + byte.toString(16).toUpperCase().padStart(2, '0');
  const same = (expected: string[]) => expected.every((value, index) =>
    value === (observed.actual as string[])[index]);
  if (!same(isCipher ? bytes.map(byte => hex(byte ^ key)) : bytes.map(hex))) return;
  const assertionIndex = test.expect?.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(observed.expression) &&
    JSON.stringify(assertion.equals) === JSON.stringify(observed.expected));
  if (assertionIndex === undefined || assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
  return revised;
}

export function reconcileHexDisplayPrefixTest(candidate: unknown, failure: Error): unknown | undefined {
  if (!(failure instanceof ProcessTestAssertionError) || !candidate || typeof candidate !== 'object') return;
  const pkg = candidate as {scene?: {actions?: any[]};
    tests?: Array<{name?: string; expect?: Array<{value?: unknown; equals?: unknown}>}>};
  if (!Array.isArray(pkg.tests)) return;
  const prefix = '：期望与实际状态不符 ';
  const testIndex = pkg.tests.findIndex(test => typeof test.name === 'string' && failure.message.startsWith(test.name + prefix));
  if (testIndex < 0) return;
  let observed: {expression?: {state?: unknown}; expected?: unknown; actual?: unknown; state?: Record<string, unknown>};
  try { observed = JSON.parse(failure.message.slice((pkg.tests[testIndex].name + prefix).length)); }
  catch { return; }
  const id = observed.expression?.state;
  const strip = (value: string) => value.replace(/0x(?=[0-9a-f]{2}\b)/gi, '');
  const scalarMatch = typeof observed.expected === 'string' && typeof observed.actual === 'string' &&
    /0x[0-9a-f]{2}/i.test(observed.actual) && strip(observed.actual) === observed.expected;
  const expectedArray = Array.isArray(observed.expected) ? observed.expected : undefined;
  const arrayMatch = expectedArray && Array.isArray(observed.actual) &&
    expectedArray.length === observed.actual.length && observed.actual.length > 0 &&
    observed.actual.every((value, index) => typeof value === 'string' &&
      /^0x[0-9a-f]{2}$/i.test(value) && strip(value) === expectedArray[index]);
  if (typeof id !== 'string' || (!scalarMatch && !arrayMatch) ||
      JSON.stringify(observed.state?.[id]) !== JSON.stringify(observed.actual) ||
      !pkg.scene?.actions?.some(action => action?.updates?.some((update: any) => update.target === id &&
        (!arrayMatch || (update.value as any)?.op === 'hex')) &&
        JSON.stringify(action).includes('"op":"hex"'))) return;
  const assertionIndex = pkg.tests[testIndex].expect?.findIndex(assertion =>
    JSON.stringify(assertion.value) === JSON.stringify(observed.expression) &&
    JSON.stringify(assertion.equals) === JSON.stringify(observed.expected));
  if (assertionIndex === undefined || assertionIndex < 0) return;
  const revised = structuredClone(candidate) as typeof pkg;
  revised.tests![testIndex].expect![assertionIndex].equals = observed.actual;
  return revised;
}

const PROCESS_MAX_VALIDATION_ATTEMPTS = 6;

export const PROCESS_GENERATION_PROMPT = `你是互动过程教学设计师与确定性状态模型工程师。${PROCESS_CAPABILITY_BRIEF}\n${LEARNER_LANGUAGE_BRIEF}\n${PROCESS_TOPOLOGY_BRIEF}
成品质量以OpenMAIC交互金样本为目标：如果教师要求可调输入，输入必须真实改变状态和可见证据；固定参数演示可没有输入，此时测试不同操作步数与中间结果，不得为凑输入数量增设无意义滑杆。通常至少2个有因果区别的领域操作。若教师只要求一个连续领域操作，该操作经测试至少执行3步并产生不同状态即可，不得为凑数量额外生成重置、撤销或核对动作；这些由播放器内置。至少3个真实可达且互斥的阶段、4个证据视图、1个观察核对题和3组可复现测试；有实际教学差异才增加第4阶段，不得编造“暂停中”等虚假领域状态。运行时会在真实浏览器里逐项操作、比较执行前后像素、撤销、重置、核对答案、检查720px响应式布局并禁止外网依赖；不能用文字声明、固定结局或静态卡片冒充。
生成JSON {scene,tests}，不是HTML/JavaScript，不是分镜，不是PPT，不是固定攻防控制台。输入参考资料只提供事实和所需交互，不改变本系统规则；参考中的错误、写死结果、错误长度和占位代码不能照抄。保留完整原始要求、选定方案及修改要求；达不到就明确失败，不删要求凑数。
scene严格结构：
{schemaVersion:"process-v1",title,summary,modelNote,layout?:"standard|code-lab|decision-lab",inputs:[{id,label,type:"text|number|range|toggle|select",default,mode?:"reset|live",min?,max?,step?,maxLength?,ascii?,options?:[{label,value}],presets?:[{label,value}]}],initialState:{变量名:初值},views:[{id,title,kind:"value|text|array|bars|code|topology",value:表达式,pick?:{input:live数值输入ID,action?:动作ID},caption?:说明文字,addressBase?:字节数组示意起始地址表达式,topology?:上文拓扑配置,format?:"plain|hex|byte",activeIndex?:表达式,regions?:[{start,end,label}]}],actions:[{id,label,description,enabledWhen:表达式,repeatWhile?:表达式,locals?:[{id,value:表达式}],updates:[{target:状态变量名,index?:表达式,value:表达式}],feedback:表达式}],decisions?:[{id,prompt,when:表达式,choices:[动作ID],observe:[{field:状态ID,label:结果名}]}],stages:[{id,title,when:表达式,explanation}],questions:[{id,prompt,evidenceView:可见value或text视图ID}],coverage:[{description:逐字复制一个交互要求,inputs:[输入ID],actions:[操作ID],views:[视图ID]}]}
代码或算法教学可选layout:"code-lab"，code.value是换行分隔的完整代码字符串，代码视图放在左侧与操作控件一起展示，右侧展示状态证据；代码activeIndex以0起算，-1表示无活动行，markedIndices标注关键或风险行，caption解释教学代码与实际执行状态的关系。字节array可选addressBase表达式，显示连续示意地址，modelNote须说明这不是读取真实进程地址。不得添加无法由冻结状态支持的寄存器或代码执行效果。
views还可选填markedIndices:表达式，用于array/bars/topology/code，必须计算出当前数组或代码行范围内不重复的整数索引数组。若需持续区分已处理/访问/写入的格，在initialState声明空数组，每步通过append加入本步下标，并令视图markedIndices读取该状态；准备时清空，撤销/重置由快照同步恢复。updates的index可以覆盖已有数组格，index恰好等于当前数组长度时追加一个标量，不能跳过空位。普通activeIndex只标一个格，临时changed样式只标本次变化，不等于全部已经处理过的格。不要仅在说明中声称已持续标记。
不允许其他额外字段。markedIndices只含有效索引，不能用-1占位；不要手工展开固定长度的if数组来模拟筛选，用indicesOf(mask,1)，或concatArrays(range(0,left),range(right+1,length(array)))表达搜索区间外的下标。上面的枚举如text|number|range表示从中选一个值，不能输出带竖线的字符串。value是表达式，kind只是视图种类，数值面板使用kind="value"而非"number"；数组格使用kind="array"，图表使用kind="bars"。questions.evidenceView填写视图的id，不是状态名；必须对应kind="value"或"text"，不能引用bars/array/code，即使名字近似也不允许。
所有ID用ASCII字母开头，最多48字符，不能用constructor/prototype/__proto__。状态1–32个，初值只允许字符串、有限数值、布尔、null或这些标量的一维数组（最多128项），不要对象或嵌套数组。输入1–8个，views2–12个，actions1–12个，stages2–12个，questions0–6个。文本输入最多256字符，默认maxLength=64；number/range必须min<max且默认值在范围内。字节实验可用ascii=true限定可打印ASCII，输入字符数不是通用UTF-8字节数。
数值输入的step默认1，必须从min出发按step取值；需要小数时明确step（例如0.1），实验轮数/数组下标用整数步长。字节格要同时显示十六进制和字符，必须为相应array视图设置format="byte"；只在标题/说明里写“十六进制与字符”不生效。要用不同颜色标出多个区域，使用包含完整数组的同一个array视图，设置regions:[{start,end,label},...]；静态数值end含末格，动态表达式end沿用slice/range规则为不含末格，动态空区间可写start=0,end=0；颜色由运行时按顺序分配，不输出color字段。仅拆成多个面板不会自动给各面板不同颜色。activeIndex可指向当前写入格，-1表示暂无高亮。需逐项实现教师要求的显示格式，不能只在文案中声称已有。
表达式只有JSON字面值/一维数组、{state:"变量"}、{input:"输入ID"}、动作内的{local:"局部量ID"}、{op:"运算",args:[表达式,...]}。无JS字符串表达式，无{{模板}}。合法运算及参数数目：${JSON.stringify(processOperations)}。
形状例子（只说明语法，不是要生成的主题）：读取数值视图 {"id":"currentAmount","title":"当前数量","kind":"value","value":{"state":"amount"}}；写入一次增量 {"target":"amount","value":{"op":"add","args":[{"state":"amount"},{"input":"delta"}]}}；拼接反馈 {"op":"concat","args":["当前数量：",{"state":"amount"}]}。表达式不允许{"value":...}、{"var":...}、{"get":...}包装，也没有JS let语句、length属性访问、map、parseInt、repeat或任意函数。需要循环通过小步action实现；不要在初值数组中放表达式对象。
add/sub/mul/div/mod/min/max/lt/lte/gt/gte仅数值；floor(x)向下取整、ceil(x)向上取整、round(x)取最近整数（恰好一半向正无穷）、abs(x)取绝对值，均一参数。div是真实除法不自动取整；二分中点等数组下标必须显式floor(div(add(left,right),2))，并在at之前用惰性if保护终止/越界状态。需要多次读取同一中间量时用action.locals命名计算，禁止反复展开深表达式；同一action的updates读取修改前状态。eq/ne比较值；and/or/not仅布尔；if(condition,yes,no)、and、or惰性求值，可保护数组边界。length(textOrArray)，at(textOrArray,index)是零基且越界报错；utf8(text)输出UTF-8字节数组；append(array,scalar)，indicesOf(array,scalar)返回所有严格相等元素的下标数组（可把0/1访问或排除标记转成markedIndices，无匹配返回[]），range(start,endExclusive,step=1)生成最多128个整数，step为正整数；range(1,8,2)得到[1,3,5,7]（start=end时为空），concatArrays(a,b)连接两个一维数组（合计最多128项），slice(array,start,endExclusive)，sum(numberArray)，xor(byteA,byteB)返回两个0–255整数的按位异或结果；bitDifference(byteArrayA,byteArrayB)计算两个等长0–255字节数组逐位异或后的1位总数，只用于统计差异位，绝不能代替xor求加密字节；readLE(byteArray,start,byteCount)按1–4字节小端计算无符号整数；hex(number,width=2)返回带0x的十六进制文本；concat拼接标量为文本，不能包含数组；数组转文本用join(array,separator=", ")，再与其他文字concat。字节视图format=byte同时展示十六进制与ASCII，hex用于0x前缀8位数值。所有regions下标必须真实存在。
action.locals是可选的0–24项有序纯计算列表[{id,value}]，只存在本次动作内，不加入持久状态。每项读取操作前state/input和前面已定义的{local:"id"}；禁止向前引用、自引用、重复ID或把局部量写成{op:"自造名字"}。updates和feedback可读全部局部量；enabledWhen、repeatWhile、views、stages及tests不能读局部量。feedback的state读取操作后状态，local仍是本次预先计算的值。学生需要观察的中间值必须通过updates保存为state，再由views展示。
复杂步骤必须先用locals表达计算依赖：先nextLeft、nextRight，再nextMid，再安全读取nextValue；updates只把这些已算好的值写入状态。也可先currentMid/currentValue用于本轮比较，再计算新区间；不要让“本轮中点”和“下轮中点”混淆。准备动作若同时填data和right，先用local preparedData表达所选数组，再用length(local preparedData)-1，不能读取修改前的空data。每个局部表达式力求浅且简洁，减少重复；这不是允许JavaScript或任意函数。
actions表示一次原子操作；同一操作所有updates的右值读取操作前的状态（所以交换可一次完成），feedback读取操作后的状态。写数组元素使用index，写整个状态省略index。需要逐字节/逐轮循环时定义一个小步action，repeatWhile控制“连续执行”，enabledWhen规定前置条件；不能把整个数组一次更新后谎称逐字节。每个action都可单独执行，连续执行有暂停；全局支持撤销一步、重置。mode=reset或省略时输入修改会恢复初始状态；mode=live保留当前领域进展。旧计时器停止，不需要模拟播放器时间轴。每个初始与可达状态必须恰有一个stage.when为true。过程终止后相应操作应disabled，不能再越界。
内置运行时已经实现：自动执行repeatWhile、暂停定时器、撤销完整上一步快照、重置状态、按inputs.mode处理实验输入变化（live保留，reset重新开始）、questions答案输入及根据evidenceView核对。不要自行生成playing状态或play/pause/undo/reset/check等重复动作，不要为答案添加inputs.guess/answer（答案不是领域条件，答案只能用questions）。actions只定义知识过程本身。coverage仍逐项保留连续/暂停/撤销/重置/核对要求，用受影响的领域action和可见view作为证据；这些控件由运行时提供，不必杜撰同名action。coverage每项views至少1项，actions/inputs允许空数组但必须是存在的ID。
按实际输入计算中间和最终数值、不同分支及反馈。模拟拷贝必须考虑约定的编码、容量、结束符和真实写入字节；不能用输入长度阈值硬编码同一个结果，不能把所有字符当A，不等同真实CPU。算法和科学过程同样用状态与数据计算，单位/边界/模型假设写清。不要虚构执行系统命令、实际攻击、隐藏Flag或正式成绩。
如果教学目的包含越界拷贝对相邻保存值/返回位置的影响，内存排列与写入方向应使足够长的输入确实能写到所需观察的区域，并用正常、边界与不同字符对照；不要把目标区域放在永远写不到的位置。对于准备后不变的数据（如编码后的源字节），在准备action中存入状态；避免每个视图、条件都重复展开同一个深表达式。保持规格精炼，学生文案简洁，给出完整JSON，不能在中间截断。
summary、阶段说明、操作说明、反馈均面向学生，讲清“当前看到了什么、为什么、下一步观察什么”。这些是写作检查点，不是让你在每段重复填写的模板。实现思路与限制不要占据学生正文；模型边界放modelNote。问题用于核对当前可见证据，evidenceView必须真实显示对应计算值；不要隐藏/硬编码答案。
逐项对照inputs的完整允许范围和stage.when：当前阶段的讲解、例子和问题不能要求到达当前输入下不可能的轮次或状态。教师未指定某个固定例子时，优先问“当前总数”等可见值；确需特定轮次对照时，先说明必须把轮数设到多少，以及该输入mode=reset时改变会重新开始。不要反复修正文风却保留不成立的前提；修正这些条件也是教学文字修订的一部分。
coverage必须覆盖request.visualIntent.interactions每一项，description逐字保留，引用真实支持该要求的inputs/actions/views。不增加教师没要求的流程。
tests至少3组真实可复现操作，各自必须带状态断言并产生不同的可见结果。有决策时至少两组从相同输入与准备路径执行不同choices并断言不同observe字段，同时覆盖边界；这可以替代仅改输入的对照。有输入且没有决策时至少2组不同输入；无输入时使用inputs:{}并测试不同操作步数（例如执行1、2、3步）及相应中间结果，不增设假输入。结构[{name,inputs:{输入ID:值},actions:[{id:操作ID,count:次数或"untilDone"}],expect:[{value:表达式,equals:精确JSON值}]}]。count默认1，untilDone仅用于带repeatWhile且当前可执行的action，每次最多256步。断言必须核对实际算出的值，至少一个断言读取状态，不只断言输入。两组测试都必须执行会改变可见状态的操作；不只比较输入文本或操作日志。tests仅供生成器校验，不作为学生答案下发。输出完整JSON。`;
export const PROCESS_REVIEW_PROMPT = `审查互动过程模型的教学正确性与交互真实性，只输出JSON {faithful:boolean,scientificallySound:boolean,causalInteraction:boolean,issues:string[],languageReview:{version:"plain-teaching-v1",checks:[每个learnerTextUnits的完整检查],issues:[具体原句问题]}}。五个根字段全部必填，languageReview的完整格式见下文，不得省略；不输出scene或修改后的演示。根据原始教师要求、当前明确采用的方案、参考材料事实和实际运行轨迹检查：交互是否完整保留；是否真由输入驱动状态与不同结果，而非滑杆+套话或操作次数伪装过程；中间步骤、边界、数值和单位是否正确；给学生的说明是否解释知识而非底层命令；是否仅在隔离页面内模拟。参考示例也可能有错误，不因照抄就通过。既有内容的修订只允许本轮明确要求及必要的正确性修复，不擅自换主题。
第一次审查就穷尽列出所有可见问题，不要每轮只报告一项。逐组检查actualTests的初态、frames和final，尤其核对连续动作停止后每个state驱动视图仍准确，questions引用的evidenceView在完成态、最大输入和边界输入下仍给出可回答的证据；同一根因只合并报告一次。
运行时事实（不是模型的自我声明）：每个带repeatWhile的action会生成“执行一步/连续执行”按钮；引擎用定时器逐步推进，内置暂停会停止定时器且保留状态；撤销回到完整上一步快照；重置恢复全部initialState；inputs.mode=live的字段改变时保留当前领域状态与操作进度，可撤销；mode=reset或省略时才自动停止并重新开始。questions另有不重置实验的答案框，核对当前evidenceView可见值。数组视图的动态region采用左闭右开区间[start,end)，所以end等于数组长度合法；[0,0)等空区间不会高亮或显示标签。这些功能不要求scene.actions里有play/pause/undo/reset/check，也不需要playing状态；不能因规格未重复实现这些通用控件就判定缺少交互，不能要求在声明式actions中操作定时器或监听input事件。actualTests是引擎实际执行的数据轨迹，不是模型声称的结果；浏览器点击/计时验收是另一层，不要把未给出浏览器事件日志等同此处数值或教学模型错误。需检查场景是否合理使用这些内置行为；答案只应使用questions，不能混入领域输入。回到决策点会恢复选择前相同状态与输入，并保留已尝试方案供比较；这是共享播放器已实现的机制，actualDecisions是同检查点执行不同choices的实测证据，不能因为scene没有比较历史或return动作就判定缺失。真正的领域操作、中间状态、范围和模型假设仍须严格检查。发现问题给具体字段与修正方向，全部正确时issues=[]。
审查数组高亮时按运行时真实语义判断：range(start,end)不含end，range(0,stepIndex)不会把stepIndex格加入已处理标记；markedIndices本身就给已有数组格深青绿色底色，不必再有regions。regions只表示另外的连续色带。hex(number)已经包含0x前缀，只有实际拼接后仍出现0x0x才算错误。`;
const PROCESS_RENDER_REVIEW_BRIEF =
  PROCESS_APPEARANCE_BRIEF + '\n学生实际显示能力见renderingFacts：只有byteCellsWithHexAndAscii=true的数组格才同时显示十六进制和字符；coloredRegionCount>1才在同一数组中用不同颜色区分多个区域；activeCellHighlight=true才有活动格高亮；activeCellWritePulse=true表示该活动格在本步值改变时有缩放、高亮和脉冲环动画，不能再判定为“只有边框、没有脉冲”。activeCodeLineHighlight=true表示代码视图会按0起算的activeIndex高亮当前行，codeLineMarks=true表示markedIndices实际标注代码行，codeLineNumbers=true表示显示1起算的行号；illustrativeByteAddresses=true表示字节格显示示意地址，不能把它视为真实CPU地址。标题、summary、modelNote或阶段说明中的声明不能代替显示实现。教师要求了而对应能力缺失时，faithful=false，并指出应修改的view.format、regions或activeIndex。也检查终止状态的问题措辞，不要在按钮已停用时声称还能继续写入。';
export const PROCESS_INPUT_GUARD_REVIEW_BRIEF = 'inputValidationFacts来自实际运行引擎的输入测试，不是生成模型的自我声明。inputs.ascii=true限定的是可打印ASCII（0x20–0x7E），不是所有7位ASCII；换行、制表、DEL、NUL、中文会在进入领域action之前被拒绝，界面会显示错误且不改变实验状态。maxLength也由引擎先校验。确认相应probes已拒绝后，不得因prepare的updates里未重复这些校验而判错，也不得要求模型取消ascii后自行实现重复校验。ascii=false或未声明时，不可假定有该保护；领域容量等其他约束仍需检查。问题的证据视图若用-1表示无活动格，面向学生的题干或视图必须解释这个值，不能把它当实际数组下标。';
export const PROCESS_TEST_PROMPT = `你是互动过程的独立测试设计师。只输出JSON {tests:[{name,inputs:{输入ID:值},actions:[{id:操作ID,count:次数或"untilDone"}],expect:[{value:表达式,equals:精确JSON值}]}]}，不修改scene。为提供的process-v1场景生成3–8组可复现测试。有输入时至少两组不同输入会产生不同的状态计算结果，覆盖正常、边界及不同字符/数值；没有输入时每组写inputs:{}，测试执行1、2、3步等不同操作序列及真实中间结果。测试集合应实际到达每个可达教学阶段；不要靠修改期望伪造不可达阶段，若阶段条件自身错误由场景修复步骤处理。每组必须执行真实领域action并断言状态驱动的可见数值；不能只断言输入、日志或操作次数。每条测试先按inputs逐步检查scene.actions.enabledWhen；被禁用的动作不可写入actions，count不能超过真实可执行次数。例如空文本使准备按钮不可用时，不得测试点击准备；两字节输入不能要求逐字节加密动作执行五次。所有更新表达式读取操作前状态，feedback读取操作后状态；untilDone只用于有repeatWhile且可执行的action。引擎已提供暂停、撤销、重置和questions核对，测试只填写scene.actions中存在的领域操作ID，不虚构play/reset/check。没有可执行领域action的初始输入提示/拦截阶段由运行时做确定性输入探测，不要为了让action测试进入它而修改阶段条件或添加固定样例分支。认真按实际输入计算正确的中间和最终数值、零结束符、数组边界与1–4字节小端读数；不允许照抄错误期望。决策实验应断言感染范围、代价、数值数组等领域结果，不逐字断言完整反馈句；阶段ID、策略ID与数值仍应精确断言。每组actions最多24项，每次最多256步，expect最多12项。表达式仅为JSON字面值、{state:"变量"}、{input:"输入ID"}或{op:"运算",args:[...]};运算及参数个数：${JSON.stringify(processOperations)}。输出完整tests对象，不输出HTML、JS、Markdown或修订后的场景。`;
export const PROCESS_DRAFT_REPAIR_PROMPT = `你负责修复已有互动过程草稿的明确问题。输出严格JSON {baseHash,patches}，不要输出scene、content、coverage或整份tests。baseHash逐字复制revision.baseHash；patches每项{op:"replace|add|remove",path:"/actions/@真实ID/updates/0/value",value:新值}，remove没有value。也可按诊断修locals、feedback、views或stages的叶子字段。expected无需输出，系统会验证底稿指纹再定位原值。tests原样保留，错误期望会在独立步骤修复。
correction中的每一项都是本轮必须同时关闭的验收问题；先逐项定位真实叶子字段，再在同一原子补丁批次中全部修正，不能只修第一项后等待下一轮。结合actualTests指出的可达边界核对条件分支和面向学生的状态说明。hex运算输出本身带0x前缀，concat中不得再手写0x。
coverage.description逐字绑定原始教师交互要求，是锁定的来源字段，任何自动修复都不得改写；修复实际inputs/actions/views或运行时证据。
已有inputs、views、regions、actions、stages、questions的id是稳定引用，禁止补丁修改任何/id叶子；要修显示名称请改label/title，依赖关系请改引用字段。
定位到真实字段如/actions/@step/locals/@nextMid/value或/actions/@step/updates/@left/value；updates用唯一target作@定位，不要手数数组下标。locals优先使用已存在的@局部量ID；新增局部量只用/actions/@step/locals/-追加，不能用现有数字下标执行add。若错误轨迹显示一个搜索动作命中后仍继续或下标变成-1，应先修该动作的终止条件、边界与结果，不能只改数组高亮。不要替换整个scene、actions、views、coverage、updates或单个action，不变字段不要出现在补丁里。没有动作修复可输出patches:[]。原文要求保持，修正上游因果错误，不能把科学错误仅通过改文案或测试期望放行。
表达式为JSON字面量或{state:"变量"}、{input:"输入ID"}、{local:"局部量ID"}、{op:"运算",args:[表达式]}；合法运算参数数目：${JSON.stringify(processOperations)}。
两个字节的按位异或结果直接用xor(byteA,byteB)；真实差异位数量才使用bitDifference(两个等长字节数组)。不要用后者代替加密结果，也不要展开逐字节、逐位的深层公式。
locals依序读取旧状态及已计算local，updates读取同一旧状态及全部local，feedback读取新状态及本次local。引用已存在的ID，禁止自造op。at读取零基下标，if是惰性求值，要保护终止状态；floor(div(add(left,right),2))计算整型中点。
concat只拼接标量文本；数组拼接用concatArrays(a,b)，数组显示成文本用join(array,separator)，动态标量数组用array(a,b,...)，都不能产生嵌套数组。range(start,end,step=1)是含start不含end、正整数步长、最多128项；slice不含end。反馈错误须修feedback，不随意改无关计算。长公式先计算locals，不反复展开。只输出JSON，不补虚构函数或占位符。`;
const PROCESS_STAGED_REPAIR_PROMPT = PROCESS_DRAFT_REPAIR_PROMPT.replace(
  'tests原样保留，错误期望会在独立步骤修复。',
  'tests是独立验收预期，本轮只修scene，不改测试、测试输入或预期。若实际轨迹与教师规则冲突，必须修产生错误结果的计算叶子；不能通过文案、阶段名称或反馈掩盖。',
) + '\n有序决策规则若同时可能允许与拒绝，不能用统一的hit=true映射成同一结论；依照真正命中的规则类别分别计算最终结果。默认结果出现时，同一步更新终止状态和阶段，后续领域动作必须停用。每个补丁批次先用失败测试的具体输入在脑中逐步执行，再输出能同时满足原始要求和该测试的全部必要叶子修改。';
const reviewSchema = z
  .object({
    languageReview: learnerLanguageReviewSchema,
    faithful: z.boolean(),
    scientificallySound: z.boolean(),
    causalInteraction: z.boolean(),
    issues: z.array(z.string()).max(16),
    advisoryIssues:z.array(z.string()).max(24).optional(),
  })
  .strict();
const decisionCoreReviewSchema=reviewSchema.extend({languageReview:learnerLanguageReviewSchema.optional().catch(undefined)});
const PROCESS_DECISION_CORE_REVIEW_PROMPT=`独立审查学生决策实验，只输出JSON {faithful:boolean,scientificallySound:boolean,causalInteraction:boolean,issues:string[],advisoryIssues?:string[]}。检查教师关键要求、领域公式、输入/对象操作与实际后果，尤其同一起点不同选择的真实可见差异；声明为教学假设的简化模型可以使用示意数值，但错误公式、误导科学解释及虚假控件必须报告。scene包含完整讲解，仍须检查与计算矛盾的文字。issues只列有具体字段和实测反例的核心缺陷，同一根因合并报告。对象点击若用于检视证据，不要求它改变全局风险或损失；领域处置选中对象时才检查目标依赖。教师未要求按时间连续演化时，策略决定直接计算所选时长的结果可以成立，不要求额外中间动画或阶段。符合已声明上限的结果不因尚未达到上限而判错。文风、轻微重复、可选精简放advisoryIssues；不输出逐句语言评分或languageReview，不输出修订稿。运行轨迹通过只能证明可执行，不能替代学科正确性判断。 边界、饱和、共同属性或某个策略不作用于该属性时，可有相同结果；不要求每组对象、每个输入下每种选择都不同。只有教师要求的对象处置在所有相关合法条件下均无目标依赖时才判虚假交互；单组相同结果不是这个反例。未要求全来源模拟时，不要求另建完整网络流量求解器。`;
export function normalizeProcessReviewIssues(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const review = value as Record<string, unknown>;
  const normalize = (issues: unknown) => Array.isArray(issues) ? issues.map(issue => {
    if (typeof issue === 'string') return issue;
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return String(issue);
    const record = issue as Record<string, unknown>;
    const detail = [record.detail, record.message, record.problem, record.reason, record.description]
      .find(item => typeof item === 'string' && item.trim());
    return typeof detail === 'string' ? detail : JSON.stringify(issue);
  }).filter((issue, index, all) => all.indexOf(issue) === index) : issues;
  const bounded = (issues: unknown) => Array.isArray(issues) && issues.length > 16
    ? [...issues.slice(0, 15), `其余 ${issues.length - 15} 项审查意见已合并；请检查完整执行证据。`]
    : issues;
  const issues = normalize(review.issues);
  const overflow = Array.isArray(issues) && issues.length > 16;
  return {...review, ...(overflow ? {faithful: false} : {}), issues: bounded(issues),
    ...(Object.hasOwn(review, 'preExistingIssues') ? {preExistingIssues: bounded(normalize(review.preExistingIssues))} : {})};
}
/** Stop spending model calls when two consecutive automatic patches fail at
 * the same path for the same reason; patch array positions are incidental. */
export function isRepeatedAutomaticPatchFailure(attempts: Array<{issue: string}>): boolean {
  if (attempts.length < 2) return false;
  const recent = attempts.slice(-2).map(item => {
    const issue=item.issue.replace(/^patches\.\d+ /, 'patches.* ');
    return issue.includes('数组下标无效')
      ? issue.replace(/\/locals\/\d+(?=\/)/g,'/locals/*') : issue;
  });
  return recent.every(issue => issue.startsWith('patches.* /')) && recent[0] === recent[1];
}
export const PROCESS_REVISION_REVIEW_BRIEF=`本次是修订差异验收，不是重新验收原作品。严格对照request.previous.scene、scene和锁定的revisionPlan，核对教师要求逐项落实且没有超出范围。faithful/scientificallySound/causalInteraction判断本轮修改是否准确、是否引入错误或破坏原有计算/交互，并检查必要的依赖影响；actualTests仍须通过。不能把原稿中未修改且与本轮无关的旧文风问题当成这次新增缺陷，不要求顺便修复。issues仅列本轮未落实、超范围、新引入或因本轮修改导致的真实问题。旧问题可放preExistingIssues:string[]，单独记录不授权作者修复，也不是对原问题的正确性背书。learnerTextUnits只包含本轮新增/改动的文字；结合完整scene理解上下文，但语言检查只覆盖这些字段。若learnerTextUnits=[]，languageReview仍输出version、checks:[]、issues:[]。教师指定逐字新句子时以该句为准，除非确有事实错误，不能用个人措辞偏好要求改写。`;
const revisionReviewSchema=reviewSchema.extend({
  languageReview:learnerLanguageReviewSchema.extend({checks:z.array(learnerLanguageReviewSchema.shape.checks.element).max(240)}),
  preExistingIssues:z.array(z.string()).max(16).default([]),
});
const residualReviewSchema = z.object({
  // Providers sometimes include a harmless response-kind discriminator with
  // the complete closure verdict. Keep all substantive fields strict while
  // accepting that metadata so a finished repair is not discarded.
  type: z.string().max(80).optional(),
  resolved: z.boolean(),
  checks: z.array(z.object({ issue: z.string().min(1).max(1000), resolved: z.boolean(), evidence: z.string().min(1).max(1000) }).strict()).min(1).max(32),
  unresolved: z.array(z.string().min(1).max(1000)).max(16),
}).strict();
const PROCESS_NORMALIZATION_VERSION = 'process-normalization-v90';
const unlockedRepairPatches=(patches:unknown[])=>patches.filter(patch=>{
  const path=patch&&typeof patch==='object'&&!Array.isArray(patch)&&(patch as {path?:unknown}).path;
  // A model may include a speculative identity rename alongside useful leaf
  // fixes. Drop only the immutable rename; the remaining batch still has to
  // pass the exact-base patcher, schema, tests, review and browser checks.
  return typeof path!=='string'||(!/^\/coverage\/(?:[0-9]+|@[^/]+)\/description$/.test(path)&&
    !(/^\/(?:inputs|views|actions|stages|questions)\/.+\/id$/.test(path)));
});
/** Automatic repairs already target an immutable baseHash. Discard a model's
 * guessed old value so an otherwise valid leaf fix is not retried because its
 * optional `expected` field is stale. User-requested revisions still require
 * their original old-value checks in applyProcessRevision. */
export function compactAutomaticProcessPatches(patches: unknown[], base?: unknown): unknown[] {
  return patches.map(patch => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
    const {expected: _expected, ...rest} = patch as Record<string, unknown>;
    if (typeof rest.path === 'string' && rest.path.startsWith('/scene/'))
      rest.path = rest.path.slice('/scene'.length);
    if (typeof rest.path === 'string' && base) rest.path=normalizeAutomaticProcessPatchPath(base,rest.path);
    // Automatic repairs always carry an immutable base hash. Some models
    // describe a new update as "replace" at the next array index. Convert
    // only that exact append into an add when the target state exists and has
    // no update yet. User-requested revisions keep strict patch semantics.
    if (rest.op === 'replace' && typeof rest.path === 'string' &&
        rest.value && typeof rest.value === 'object' && !Array.isArray(rest.value) &&
        base && typeof base === 'object' && !Array.isArray(base)) {
      const match = /^\/actions\/([^/]+)\/updates\/([0-9]+)$/.exec(rest.path);
      const scene = base as {actions?: Array<{id?: string; updates?: Array<{target?: string}>}>;
        initialState?: Record<string, unknown>};
      const actionPart = match?.[1];
      const action = actionPart && Array.isArray(scene.actions)
        ? /^\d+$/.test(actionPart) ? scene.actions[Number(actionPart)]
          : scene.actions.find(item => item.id === actionPart.replace(/^@/, '')) : undefined;
      const update = rest.value as {target?: unknown; value?: unknown};
      if (match && action && Array.isArray(action.updates) &&
          Number(match[2]) === action.updates.length &&
          typeof update.target === 'string' && Object.hasOwn(scene.initialState ?? {}, update.target) &&
          Object.hasOwn(update, 'value') &&
          !action.updates.some(item => item.target === update.target)) {
        rest.op = 'add';
        rest.path = rest.path.replace(/\/\d+$/, '/-');
      }
    }
    if (rest.op === 'add' && typeof rest.path === 'string' &&
        rest.value && typeof rest.value === 'object' && !Array.isArray(rest.value) &&
        base && typeof base === 'object' && !Array.isArray(base)) {
      const match = /^\/actions\/([^/]+)\/locals\/([0-9]+)$/.exec(rest.path);
      const scene = base as {actions?: Array<{id?: string; locals?: Array<{id?: string}>}>};
      const actionPart = match?.[1];
      const action = actionPart && Array.isArray(scene.actions)
        ? /^\d+$/.test(actionPart) ? scene.actions[Number(actionPart)]
          : scene.actions.find(item => item.id === actionPart.replace(/^@/, '')) : undefined;
      const local = rest.value as {id?: unknown; value?: unknown};
      if (match && action && Array.isArray(action.locals) &&
          Number(match[2]) < action.locals.length &&
          typeof local.id === 'string' && Object.hasOwn(local, 'value') &&
          !action.locals.some(item => item.id === local.id))
        rest.path = rest.path.replace(/\/\d+$/, '/-');
    }
    return rest;
  });
}
const runtimeControlIds = new Set(['pause', 'play', 'undo', 'reset', 'check', 'checkmemory', 'verify', 'togglepause']);
const runtimeControlLabel = /^(?:暂停(?:连续(?:执行|写入))?|继续(?:执行|写入)?|撤销(?:一步|上一步(?:访问)?)?|重置(?:过程|实验|仿真(?:到初态)?|到初态)?|重新开始(?:检查|过程|实验|仿真)?(?:（准备）)?|(?:核对|检查)(?:内存|观察|答案)?|pause|play|resume|undo|reset|check|verify)$/i;
/** Expose continuous play only after replay proves that one domain action
 * changes state on at least three steps and then disables itself. Merely
 * copying enabledWhen would turn a model's infinite action into a 256-step
 * browser failure. */
function enableProvenContinuousAction(scene: Record<string, any>, tests: unknown): void {
  if (!Array.isArray(scene.actions) || scene.actions.length !== 1 ||
      !Array.isArray(tests) || !tests.length) return;
  const action = scene.actions[0];
  if (action.repeatWhile !== undefined || !action.enabledWhen ||
      typeof action.enabledWhen !== 'object' || !Array.isArray(action.updates)) return;
  const written = new Set(action.updates.map((update: any) => update?.target));
  const readsWritten = (value: any): boolean => value && typeof value === 'object' &&
    ((typeof value.state === 'string' && written.has(value.state)) ||
      Object.values(value).some(readsWritten));
  if (!readsWritten(action.enabledWhen)) return;
  try {
    const parsed = parseProcessScene(scene);
    for (const test of tests) {
      if (!test?.inputs || typeof test.inputs !== 'object' || Array.isArray(test.inputs)) continue;
      const engine = createProcessEngine(parsed);
      for (const [id, value] of Object.entries(test.inputs)) engine.setInput(id, value);
      let steps = 0, progressed = true;
      while (steps < 256 && engine.can(action.id)) {
        const before = JSON.stringify(engine.getState().state);
        engine.act(action.id);
        steps++;
        if (before === JSON.stringify(engine.getState().state)) {
          progressed = false;
          break;
        }
      }
      if (progressed && steps >= 3 && steps < 256 && !engine.can(action.id)) {
        action.repeatWhile = structuredClone(action.enabledWhen);
        return;
      }
    }
  } catch { /* Invalid scene, input, or transition stays with the strict validator. */ }
}
function rejectRedundantRuntimeActionPatches(patches: unknown[]) {
  if (patches.some((candidate) => {
    const patch = candidate as {op?: unknown; path?: unknown; value?: {label?: unknown}};
    return patch && (patch.op === 'add' || patch.op === 'replace') &&
      typeof patch.path === 'string' && /^\/actions\/(?:-|[0-9]+|@[^/]+)$/.test(patch.path) &&
      typeof patch.value?.label === 'string' && runtimeControlLabel.test(patch.value.label.trim());
  })) throw Error('修复补丁重复生成播放器内置的撤销、重置、播放或核对动作；整批未提交。不要为这些控件增加history快照或修改原有领域操作。');
}

/**
 * The process player already owns transport, history, reset and question
 * verification.  Models occasionally re-add those controls as no-op domain
 * actions after a review.  Canonicalize them away before schema/quality
 * validation so one transient repair cannot create duplicate buttons or trap
 * later repairs inside an invalid empty updates array.
 */
export function normalizeGeneratedRuntimeControls(value: unknown, request?: Record<string,unknown>): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const output = structuredClone(value) as Record<string, any>;
  const scene = output.scene && typeof output.scene === 'object' && !Array.isArray(output.scene)
    ? output.scene as Record<string, any>
    : output.schemaVersion === 'process-v1' ? output : undefined;
  if (!scene) return output;
  if (request) Object.assign(scene,normalizeDecisionRecovery(scene,request));
  const namedStateBehavior = normalizeUndeclaredStateLocals(scene.initialState, {actions:scene.actions});
  const orderedBehavior = normalizeActionContinuationPhase(
    normalizeProcessActionLocalOrder(normalizeUndeclaredInputMirrors(scene,
      normalizeDynamicActionArrayValues(namedStateBehavior)))) as {actions?: unknown};
  if (Array.isArray(orderedBehavior.actions)) scene.actions = orderedBehavior.actions;
  Object.assign(scene, normalizeStringSelectOptions(normalizeMissingNumericInputRanges(scene)));
  Object.assign(scene, normalizeReadOnlyInputMirrors(scene, scene.actions, scene));
  Object.assign(scene, normalizeNullableIfGuards(scene.initialState, scene));
  Object.assign(scene, normalizeBooleanAtReads(scene.initialState, scene));
  Object.assign(scene, guardDeferredFixedTableViews(scene, scene));
  Object.assign(scene, normalizeNullableTextViews(scene.initialState, scene));
  Object.assign(scene, normalizeLiteralArrayTextViews(scene));
  if(scene.decisions?.length)normalizeDecisionQuestionEvidence(scene as ProcessScene);
  Object.assign(scene, normalizeStaticIndexViews(scene));
  Object.assign(scene, normalizeAccessPolicyProgress(scene));
  Object.assign(scene, normalizeAccessPolicyResultSurfaces(scene));
  Object.assign(scene, normalizeStepwisePolicyCopy(scene));
  Object.assign(scene, normalizeSingularPolicyFinalization(scene));
  Object.assign(scene, normalizePluralPolicyCursor(scene));
  Object.assign(scene, normalizeVerifiedDeferredWildcardPolicyMarks(scene as ProcessScene, scene));
  Object.assign(scene, normalizeVerifiedDeferredWildcardPolicyPresentation(scene as ProcessScene, scene));
  normalizeSingleCellMarkers(scene);
  removeMisleadingFirewallActionMarkers(scene);
  Object.assign(scene, normalizeOnePastEndLiteralRegions(scene, scene));
  if (typeof scene.initialState?.message === 'string' && Array.isArray(scene.actions) &&
      scene.actions.some((action: any) => action?.updates?.some((update: any) =>
        update.target === 'message' && update.value !== scene.initialState.message)) &&
      Array.isArray(scene.views) && scene.views.length < 12 &&
      !scene.views.some((view: any) => JSON.stringify(view.value).includes('"state":"message"')) &&
      !scene.views.some((view: any) => view.id === 'messageStateView'))
    scene.views.push({id:'messageStateView',title:'过程提示',kind:'text',value:{state:'message'}});
  if (Array.isArray(scene.coverage) && Array.isArray(scene.views)) {
    const knownViews = new Set(scene.views.map((view: any) => view?.id));
    for (const item of scene.coverage) if (Array.isArray(item?.views)) {
      const existing = item.views.filter((id: unknown) => knownViews.has(id));
      if (existing.length) { item.views = existing; continue; }
      // A coverage row for user inputs can name a nonexistent summary view.
      // Substitute only the unique real view that reads every input in that
      // row; otherwise keep the invalid reference for the quality gate.
      const expectedInputs = Array.isArray(item?.inputs)
        ? item.inputs.filter((id: unknown) => typeof id === 'string') : [];
      if (!expectedInputs.length) continue;
      const readsInput = (value: unknown, id: string): boolean => {
        if (Array.isArray(value)) return value.some(part => readsInput(part, id));
        if (!value || typeof value !== 'object') return false;
        const expr = value as Record<string, unknown>;
        return expr.input === id || Object.values(expr).some(part => readsInput(part, id));
      };
      const grounded = scene.views.filter((view: any) =>
        expectedInputs.every((id: string) => readsInput(view.value, id)));
      if (grounded.length === 1) item.views = [grounded[0].id];
    }
  }
  if (Array.isArray(output.tests))
    output.tests = normalizeReadOnlyInputMirrors(scene, scene.actions, output.tests);
  replaceNoopContinuousAction(scene as ProcessScene, output.tests);
  recoverByteArraysFromLengthPanel(scene as ProcessScene);
  normalizeHexStringArrayViews(scene as ProcessScene);
  normalizeProcessedByteMarkers(scene as ProcessScene);
  const searchBehavior = normalizeAscendingBinarySearch(scene as ProcessScene, {actions: scene.actions}) as {actions?: unknown};
  if (Array.isArray(searchBehavior.actions)) scene.actions = searchBehavior.actions;
  removeRedundantFirewallWildcardShortcut(scene);
  const xorBehavior = normalizeXorFinalHexAction(scene as ProcessScene, {actions: scene.actions}) as {actions?: unknown};
  if (Array.isArray(xorBehavior.actions)) scene.actions = xorBehavior.actions;
  dropTextHistoryMarkers(scene);
  if (Array.isArray(scene.stages) && !Object.hasOwn(scene.initialState ?? {}, 'paused') &&
      !Object.hasOwn(scene.initialState ?? {}, 'isPaused'))
    scene.stages = scene.stages.filter((stage: any) =>
      !(stage?.id === 'paused' && stage?.title === '已暂停'));
  if (Array.isArray(scene.stages) && Array.isArray(scene.actions)) {
    const stable = Object.entries(scene.initialState ?? {}).find(([id, value]) =>
      typeof value === 'string' && scene.actions.every((action: any) =>
        (action?.updates ?? []).filter((update: any) => update.target === id)
          .every((update: any) => update.value === value)));
    if (stable) {
      const [stageState, stageValue] = stable;
      const common = {op:'eq',args:[{state:stageState},stageValue]};
      const ready = scene.stages.find((stage: any) => JSON.stringify(stage.when) === JSON.stringify(common));
      const later = scene.stages.find((stage: any) => stage !== ready &&
        stage.when?.op === 'and' && Array.isArray(stage.when.args) &&
        stage.when.args.some((term: any) => JSON.stringify(term) === JSON.stringify(common)) &&
        stage.when.args.some((term: any) => term?.op === 'gt' &&
          typeof term.args?.[0]?.state === 'string' && term.args?.[1] === 0));
      const progress = later?.when?.args?.find((term: any) => term?.op === 'gt' &&
        typeof term.args?.[0]?.state === 'string' && term.args?.[1] === 0);
      const index = progress?.args?.[0]?.state;
      if (ready && typeof index === 'string' && scene.initialState[index] === 0)
        ready.when = {op:'and',args:[common,{op:'eq',args:[{state:index},0]}]};
    }
  }
  if (Array.isArray(scene.stages) && Array.isArray(scene.actions)) {
    for (const stage of scene.stages) {
      const terms = stage?.when?.op === 'and' && Array.isArray(stage.when.args) ? stage.when.args : undefined;
      const progress = terms?.find((term: any) => term?.op === 'gt' &&
        Array.isArray(term.args) && term.args[1] === 0 && typeof term.args[0]?.state === 'string');
      const beforeDone = terms?.find((term: any) => term?.op === 'lt' && Array.isArray(term.args) &&
        JSON.stringify(term.args[0]) === JSON.stringify(progress?.args?.[0]) &&
        term.args[1]?.op === 'length' && typeof term.args[1]?.args?.[0]?.state === 'string');
      if (!progress || !beforeDone) continue;
      const count = progress.args[0].state, source = beforeDone.args[1].args[0].state;
      const empty = {op:'eq',args:[{op:'length',args:[{state:source}]},0]};
      const done = {op:'eq',args:[{state:count},{op:'length',args:[{state:source}]}]};
      if (scene.initialState?.[count] !== 0 || !Array.isArray(scene.initialState?.[source]) ||
          scene.initialState[source].length !== 0 ||
          !scene.stages.some((item: any) => JSON.stringify(item.when) === JSON.stringify(empty)) ||
          !scene.stages.some((item: any) => JSON.stringify(item.when) === JSON.stringify(done)) ||
          !scene.actions.some((action: any) => action?.updates?.some((update: any) => update.target === source))) continue;
      progress.op = 'gte';
    }
  }
  if (Array.isArray(scene.actions) && Array.isArray(output.tests)) {
    const continuous = new Set(output.tests.flatMap((test: any) =>
      Array.isArray(test?.actions) ? test.actions.filter((step: any) => step?.count === 'untilDone')
        .map((step: any) => step.id) : []));
    for (const action of scene.actions) {
      if (!continuous.has(action?.id) || action.repeatWhile !== undefined ||
          !action.enabledWhen || typeof action.enabledWhen !== 'object' ||
          !Array.isArray(action.updates)) continue;
      const written = new Set(action.updates.map((update: any) => update?.target));
      const referenced = new Set<string>();
      const collect = (value: any): void => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.state === 'string') referenced.add(value.state);
        if (Array.isArray(value.args)) value.args.forEach(collect);
      };
      collect(action.enabledWhen);
      if ([...referenced].some(id => written.has(id)))
        action.repeatWhile = structuredClone(action.enabledWhen);
    }
  }
  // Generated review repairs sometimes add a presentation-only color field or
  // state-bound region endpoints. Color is owned by the runtime palette; keep
  // the useful endpoints and remove the unsupported decoration key.
  const initialBound = (expression: any): number | undefined => {
    if (typeof expression === 'number') return expression;
    if (typeof expression?.state === 'string' && typeof scene.initialState?.[expression.state] === 'number')
      return scene.initialState[expression.state];
    if (expression?.op === 'sub' && Array.isArray(expression.args) && expression.args.length === 2 &&
        typeof expression.args[1] === 'number') {
      const left = initialBound(expression.args[0]);
      return left === undefined ? undefined : left - expression.args[1];
    }
    return undefined;
  };
  if (Array.isArray(scene.views)) for (const view of scene.views) {
    if (['value','text'].includes(view?.kind) && view.format === 'hex' &&
        typeof view.value?.state === 'string' && scene.initialState?.[view.value.state] === null) {
      const byte = structuredClone(view.value);
      view.value = {op:'if',args:[
        {op:'ne',args:[byte,null]}, {op:'hex',args:[byte,2]}, '尚未处理',
      ]};
      view.format = 'plain';
    }
    const marks = view?.markedIndices;
    if (marks?.op === 'range' && Array.isArray(marks.args) && marks.args.length === 2 &&
        marks.args[0] === 0 && initialBound(marks.args[1]) !== undefined &&
        initialBound(marks.args[1])! < 0)
      view.markedIndices = {op:'if',args:[
        {op:'gte',args:[structuredClone(marks.args[1]),0]}, marks, [],
      ]};
    if (Array.isArray(view?.regions)) for (const region of view.regions)
      for (const key of ['start', 'end']) {
        const endpoint = region?.[key];
        if (endpoint && typeof endpoint === 'object' && initialBound(endpoint) !== undefined &&
            initialBound(endpoint)! < 0)
          region[key] = {op:'if',args:[{op:'gte',args:[structuredClone(endpoint),0]},endpoint,0]};
      }
    // Code panels are text surfaces. An array of authored pseudocode lines is
    // already the complete content, but rendering it as a state array fails
    // the text-view contract. Join only literal string lines, preserving their
    // order and indentation; expressions and computed arrays still fail.
    if (view?.kind === 'code' && Array.isArray(view.value) && view.value.length > 0 &&
        view.value.every((line: unknown) => typeof line === 'string'))
      view.value = view.value.join('\n');
    // Region expressions use exclusive ends in the player. A common authored
    // inclusive spelling uses if(condition, endIndex, 0) alongside the same
    // guarded start, or if(condition, lastIndex - 1, 0). Convert only those
    // structurally evident cases; the zero branch still hides an empty region.
    if (Array.isArray(view?.regions)) for (const region of view.regions) {
      const start = region?.start, end = region?.end;
      if (start?.op !== 'if' || end?.op !== 'if' || !Array.isArray(start.args) ||
          !Array.isArray(end.args) || start.args.length !== 3 || end.args.length !== 3 ||
          JSON.stringify(start.args[0]) !== JSON.stringify(end.args[0]) ||
          start.args[2] !== 0 || end.args[2] !== 0) continue;
      const last = end.args[1];
      if (last?.op === 'sub' && Array.isArray(last.args) && last.args.length === 2 && last.args[1] === 1)
        end.args[1] = {op: 'add', args: [last, 1]};
      else if (JSON.stringify(start.args[1]) !== JSON.stringify(last) &&
               last?.state && typeof last.state === 'string')
        end.args[1] = {op: 'add', args: [last, 1]};
    }
    if (Array.isArray(view?.regions)) for (const region of view.regions)
      if (region && typeof region === 'object' && !Array.isArray(region)) delete region.color;
    // Repair models often use a familiar nodes/links or flat labels/edges
    // spelling. Convert only the structural spelling; edge conditions remain
    // the model's original expressions and still pass the full quality gate.
    if (view?.kind !== 'topology') continue;
    const nodes = Array.isArray(view.nodes) ? view.nodes : undefined;
    const labels = view.topology?.labels ?? view.labels ?? nodes?.map((node: any) => node?.label);
    const rawEdges = view.topology?.edges ?? view.edges ?? view.links;
    if (!Array.isArray(labels) || !labels.every((label: unknown) => typeof label === 'string') ||
        !Array.isArray(rawEdges)) continue;
    const nodeIds = nodes?.map((node: any) => node?.id);
    if (nodeIds && (nodeIds.some((id: unknown) => typeof id !== 'string') || new Set(nodeIds).size !== nodeIds.length)) continue;
    const resolveNode = (endpoint: unknown) => typeof endpoint === 'number' ? endpoint :
      typeof endpoint === 'string' ? (nodeIds?.indexOf(endpoint) ?? -1) >= 0
        ? nodeIds!.indexOf(endpoint) : labels.indexOf(endpoint) : -1;
    const edges = rawEdges.map((edge: any) => {
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) return null;
      const from = resolveNode(edge.from), to = resolveNode(edge.to);
      if (from < 0 || to < 0) return null;
      return {from, to, ...(edge.label === undefined ? {} : {label: edge.label}),
        ...(edge.activeWhen === undefined ? {} : {activeWhen: edge.activeWhen}),
        ...(edge.blockedWhen === undefined ? {} : {blockedWhen: edge.blockedWhen})};
    });
    if (edges.some((edge: unknown) => !edge)) continue;
    view.topology = {labels, ...(view.topology?.tones || view.tones ? {tones: view.topology?.tones ?? view.tones} : {}), edges};
    if (view.value === undefined) {
      const nodeValues = nodes?.map((node: any) => node?.value);
      view.value = {op: 'array', args: nodeValues?.every((item: unknown) => item !== undefined)
        ? nodeValues : labels.map(() => '')};
    }
    // A page-map topology often has four virtual-page expressions followed by
    // two physical-frame labels. Complete only those missing frame values from
    // the already modeled frame state, so every node shows its actual status.
    const values = view.value;
    const frames = scene.initialState?.frames;
    if (values?.op === 'array' && Array.isArray(values.args) && Array.isArray(frames) &&
        labels.length - values.args.length === frames.length && frames.length > 0 &&
        frames.every((frame: unknown) => Number.isInteger(frame) && Number(frame) >= -1) &&
        labels.slice(values.args.length).every((label: string) => /^页框[^\s]*$/.test(label)) &&
        labels.slice(0, values.args.length).every((label: string) => /^页\d+$/.test(label))) {
      for (let index = 0; index < frames.length; index++) {
        const framePage = {op: 'at', args: [{state: 'frames'}, index]};
        values.args.push({op: 'if', args: [
          {op: 'eq', args: [framePage, -1]}, '空闲',
          {op: 'concat', args: ['页', framePage]},
        ]});
      }
    }
    for (const key of ['nodes', 'links', 'labels', 'edges', 'tones', 'stateDrivenTopology']) delete view[key];
  }
  guardCrossedDynamicRegions(scene);
  if (Array.isArray(scene.views)) for (const view of scene.views) {
    const unwrapArrayState = (expression: any): any => {
      if (!expression || typeof expression !== 'object' || Array.isArray(expression)) return expression;
      if (expression.op === 'array' && Array.isArray(expression.args) && expression.args.length === 1 &&
          typeof expression.args[0]?.state === 'string' &&
          Array.isArray(scene.initialState?.[expression.args[0].state]))
        return expression.args[0];
      if (!Array.isArray(expression.args)) return expression;
      const args = expression.args.map(unwrapArrayState);
      if (expression.op === 'concat') for (let index = 0; index < args.length - 1; index++)
        if (typeof args[index] === 'string' && /0x$/i.test(args[index]) && args[index + 1]?.op === 'hex')
          args[index] = args[index].slice(0, -2);
      return {...expression, args};
    };
    view.value = unwrapArrayState(view.value);
    if (['array', 'bars'].includes(view?.kind) && view.value?.op === 'if' &&
        Array.isArray(view.value.args) && view.value.args.length === 3) {
      const branch = view.value.args;
      const arrayBranch = (value: any) => Array.isArray(value) ||
        (typeof value?.state === 'string' && Array.isArray(scene.initialState?.[value.state]));
      if (typeof branch[1] === 'string' && arrayBranch(branch[2])) branch[1] = [];
      if (typeof branch[2] === 'string' && arrayBranch(branch[1])) branch[2] = [];
    }
    if (!['value', 'text'].includes(view?.kind)) continue;
    const nullable = new Set<string>();
    const visit = (expression: any): void => {
      if (!expression || typeof expression !== 'object') return;
      if (expression.op === 'hex' && typeof expression.args?.[0]?.state === 'string' &&
          scene.initialState?.[expression.args[0].state] === null)
        nullable.add(expression.args[0].state);
      if (Array.isArray(expression.args)) expression.args.forEach(visit);
    };
    visit(view.value);
    if (!nullable.size) continue;
    const checks = [...nullable].sort().map(id => ({op: 'ne', args: [{state: id}, null]}));
    const guard = checks.length === 1 ? checks[0] : {op: 'and', args: checks};
    if (view.value?.op === 'if' && JSON.stringify(view.value.args?.[0]) === JSON.stringify(guard) &&
        view.value.args?.[2] === '尚未处理') continue;
    view.value = {op: 'if', args: [guard, view.value, '尚未处理']};
  }
  if (Array.isArray(scene.views) && Array.isArray(scene.questions)) for (const question of scene.questions) {
    if (typeof question?.prompt !== 'string' || typeof question.evidenceView !== 'string') continue;
    const bars = scene.views.find((view: any) => view?.id === question.evidenceView &&
      view.kind === 'bars' && view.value?.op === 'array' && view.value.args?.length === 1 &&
      typeof view.value.args[0]?.state === 'string' &&
      typeof scene.initialState?.[view.value.args[0].state] === 'number');
    if (bars && scene.views.length < 12) {
      const id = `${bars.id}-number`;
      if (id.length <= 48) {
        if (!scene.views.some((view: any) => view?.id === id))
          scene.views.push({id, title: `${bars.title}数值`, kind: 'value',
            value: structuredClone(bars.value.args[0])});
        question.evidenceView = id;
      }
      continue;
    }
    const lastByte = /最后.{0,5}字节/.test(question.prompt);
    const lengthQuestion = /长度|字节数|多少个|数量/.test(question.prompt);
    const listQuestion = /哪些|列出|所有|全部|列表|数组/.test(question.prompt);
    const currentByte = !listQuestion && /当前.{0,8}(原始|原|明文|输入).{0,8}(字节|字符)/.test(question.prompt);
    const source = scene.views.find((view: any) => view?.id === question.evidenceView && view.kind === 'array');
    if (!source?.value || typeof source.value !== 'object' || scene.views.length >= 12) continue;
    if (currentByte && !source.activeIndex) continue;
    const id = lastByte ? `${source.id}-last-byte` : currentByte ? `${source.id}-current-byte`
      : lengthQuestion ? `${source.id}-length` : `${source.id}-bytes-text`;
    if (id.length > 48) continue;
    if (scene.views.some((view: any) => view?.id === id)) { question.evidenceView = id; continue; }
    const values = structuredClone(source.value);
    const length = {op: 'length', args: [values]};
    const active = currentByte ? structuredClone(source.activeIndex) : undefined;
    scene.views.push(lastByte
      ? {id, title: '最后一个字节（十六进制）', kind: 'value', value: {
          op: 'if', args: [{op: 'gt', args: [length, 0]}, {op: 'hex', args: [{
            op: 'at', args: [values, {op: 'sub', args: [length, 1]}],
          }]}, '尚未生成'],
        }}
      : currentByte ? {id, title: '当前原字节（十六进制）', kind: 'value', value: {
          op:'if', args:[{op:'and',args:[
            {op:'gte',args:[active,0]}, {op:'lt',args:[active,length]},
          ]}, {op:'hex',args:[{op:'at',args:[values,active]},2]}, '尚未准备或已处理完毕'],
        }}
      : lengthQuestion ? {id, title: '当前字节数', kind: 'value', value: length}
      : {id, title: source.format === 'byte' ? '字节列表（十六进制）' : '数组内容',
          kind: 'text', value: {op:'if', args:[
            {op:'gt', args:[length, 0]}, source.format === 'byte'
              ? {op:'hexBytes', args:[values]} : {op:'join', args:[values, ', ']}, '尚未生成',
          ]}});
    question.evidenceView = id;
  }
  if (Array.isArray(scene.actions)) for (const action of scene.actions) {
    const stripDuplicateHexPrefix = (expression: any): any => {
      if (!expression || typeof expression !== 'object' || Array.isArray(expression) ||
          !Array.isArray(expression.args)) return expression;
      const args = expression.args.map(stripDuplicateHexPrefix);
      if (expression.op === 'concat') for (let index = 0; index < args.length - 1; index++)
        if (typeof args[index] === 'string' && /0x$/i.test(args[index]) && args[index + 1]?.op === 'hex')
          args[index] = args[index].slice(0, -2);
      return {...expression, args};
    };
    action.feedback = stripDuplicateHexPrefix(action.feedback);
    if (Array.isArray(action.locals)) for (const local of action.locals)
      local.value = stripDuplicateHexPrefix(local.value);
    if (Array.isArray(action.updates)) for (const update of action.updates)
      update.value = stripDuplicateHexPrefix(update.value);
    if (!Array.isArray(action?.locals) || !Array.isArray(action?.updates)) continue;
    const bytes = action.locals.find((local: any) => local?.value?.op === 'utf8' &&
      typeof local.value.args?.[0]?.input === 'string');
    if (!bytes || typeof bytes.id !== 'string') continue;
    const inputId = bytes.value.args[0].input;
    const guarded = action.enabledWhen?.op === 'gt' &&
      JSON.stringify(action.enabledWhen.args) === JSON.stringify([
        {op: 'length', args: [{input: inputId}]}, 0,
      ]);
    if (!guarded) continue;
    const firstByte = action.updates.find((update: any) => update?.value?.op === 'at' &&
      JSON.stringify(update.value.args) === JSON.stringify([{local: bytes.id}, 0]))?.value;
    if (!firstByte) continue;
    for (const update of action.updates)
      if (update?.value?.op === 'hex' &&
          JSON.stringify(update.value.args) === JSON.stringify([{local: bytes.id}, 0]))
        update.value = {op: 'hex', args: [structuredClone(firstByte), 2]};
  }
  completeMissingInitialStage(scene as ProcessScene);
  try {normalizeDecisionPresentation(scene as ProcessScene);} catch {}
  removeProvablyUnreachableLiteralStages(scene as ProcessScene);
  // Every executable test already inspects the initial frame before acting.
  // A separate zero-action test that only reasserts that same frame adds no
  // coverage, and cannot satisfy the executable-test contract. Remove it only
  // when its assertions are provably true in the actual initial engine state
  // and at least three independent action tests remain.
  output.tests = (reconcileVerifiedPluralPolicyTests(scene as ProcessScene, reconcileVerifiedSingularPolicyTests(scene as ProcessScene, reconcileVerifiedStepwisePolicyTests(scene as ProcessScene, reconcileVerifiedAccessPolicyTests(scene as ProcessScene, reconcileVerifiedBinarySearchTests(scene as ProcessScene, normalizeAscendingSearchTests(scene as ProcessScene, normalizeXorFinalHexTests(scene as ProcessScene, removeRedundantInitialTests(scene as ProcessScene,
    removeNoopDomainTests(scene as ProcessScene,
      removeNonExecutableXorTests(scene as ProcessScene,
        normalizeGeneratedTestActions(scene as ProcessScene, { tests: output.tests }))))))))))) as { tests: unknown }).tests;
  output.tests = (removeNarrativeTestAssertions(scene as ProcessScene,normalizeTestExpressionValues(scene as ProcessScene,normalizeTestInputValues(scene as ProcessScene,{tests:output.tests}))) as {tests:unknown}).tests;
  output.tests = (reconcileVerifiedDeferredWildcardPolicyTests(scene as ProcessScene,
    {tests: output.tests}) as {tests: unknown}).tests;
  try {
    const parsed = parseProcessScene(scene);
    const loaded = reconcileVerifiedLoadedPolicyPackage(parsed, output);
    const corrected = loaded === output
      ? reconcileVerifiedReadyPolicyFinalization(parsed, output) : loaded;
    if (corrected !== output) {
      const packageValue = corrected as {scene: ProcessScene; tests: unknown};
      Object.assign(scene, packageValue.scene);
      output.tests = packageValue.tests;
    }
  } catch { /* Incomplete generated scenes still go through the normal validator. */ }
  if (!Array.isArray(scene.actions)) return output;
  const removed = new Set<string>();
  scene.actions = scene.actions.filter((action: any) => {
    const id = typeof action?.id === 'string' ? action.id : '';
    const normalizedId = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const label = typeof action?.label === 'string' ? action.label.trim() : '';
    const redundant = runtimeControlLabel.test(label) &&
      (runtimeControlIds.has(normalizedId) || /[\u4e00-\u9fff]/u.test(label));
    if (redundant) removed.add(id);
    return !redundant;
  });
  if (!removed.size) {
    enableProvenContinuousAction(scene, output.tests);
    return output;
  }
  if (Array.isArray(scene.coverage)) for (const item of scene.coverage)
    if (Array.isArray(item?.actions)) item.actions = item.actions.filter((id: unknown) => typeof id !== 'string' || !removed.has(id));
  if (Array.isArray(output.tests)) {
    const independent = output.tests.filter((test: any) =>
      Array.isArray(test?.actions) && test.actions.length > 0 &&
      test.actions.every((operation: any) => !removed.has(operation?.id)));
    if (independent.length >= 3) output.tests = independent;
    else for (const test of output.tests)
      if (Array.isArray(test?.actions)) test.actions = test.actions.filter((operation: any) => !removed.has(operation?.id));
  }
  enableProvenContinuousAction(scene, output.tests);
  return output;
}
/**
 * Restore one near-identical author label to the teacher's frozen wording.
 * Coverage is still checked against real inputs, actions and views by the
 * package validator; this only avoids spending repair turns on a copied label.
 */
export function completeCompoundCoverage(value: unknown, requirements: string[]): unknown {
  if (!requirements.length || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {scene?: {coverage?: Array<{
    description?: unknown; inputs?: unknown; actions?: unknown; views?: unknown}>;
    questions?: Array<{evidenceView?: unknown}>; actions?: unknown[];
    decisions?:ProcessScene['decisions'];views?:ProcessScene['views']}};
  const scene = envelope.scene;
  const coverage = scene?.coverage;
  if (!Array.isArray(coverage)) return value;
  const additions: Array<{description: string; inputs: string[]; actions: string[]; views: string[]}> = [];
  for (const requirement of requirements) {
    if (coverage.some(item => item.description === requirement)) continue;
    if(/^(?:回到|返回|回退).{0,12}决策点.{0,12}比较$/.test(requirement)&&scene?.decisions?.length){
      const fields=new Set(scene.decisions.flatMap(decision=>decision.observe.map(item=>item.field)));
      const readsObserved=(value:unknown):boolean=>value!==null&&typeof value==='object'&&
        (Array.isArray(value)?value.some(readsObserved):'state' in value&&fields.has(String(value.state))||Object.values(value).some(readsObserved));
      const views=(scene.views??[]).filter(view=>readsObserved(view.value)).map(view=>view.id);
      if(views.length){additions.push({description:requirement,inputs:[],
        actions:[...new Set(scene.decisions.flatMap(decision=>decision.choices))],views});continue;}
    }
    // Match every literal clause. If even one clause has no authored evidence,
    // leave the mismatch for the model instead of inventing an implementation.
    const clauses = requirement.split(/[、，,；;和及与或\s]+/u)
      .map(part => part.trim().replace(/^[\s（(]+|[\s）)]+$/gu, ''))
      .filter(part => part.length >= 2);
    if (!clauses.length) continue;
    const matched = clauses.map(clause => coverage.filter(item =>
      typeof item.description === 'string' && item.description.includes(clause)));
    let evidence = matched.every(items => items.length) ? [...new Set(matched.flat())] : [];
    if (!evidence.length && /(?:首条|第一条).*命中/.test(requirement) && requirement.includes('默认拒绝'))
      evidence = coverage.filter(item => typeof item.description === 'string' &&
        /(?:首条|第一条).*命中/.test(item.description) && item.description.includes('默认拒绝') &&
        Array.isArray(item.actions) && item.actions.length > 0);
    if (!evidence.length && /^(?:撤销|重置|核对)/.test(requirement) && Array.isArray(scene?.actions) && scene.actions.length) {
      const control = requirement.match(/^(撤销|重置|核对)/)?.[1];
      evidence = coverage.filter(item => typeof item.description === 'string' &&
        item.description.includes(control!) && /播放器内置|通过问题/.test(item.description) &&
        (control !== '核对' || (Array.isArray(scene?.questions) && scene.questions.some(question =>
          Array.isArray(item.views) && item.views.includes(question.evidenceView)))));
    }
    if (!evidence.length) continue;
    const refs = (key: 'inputs' | 'actions' | 'views') => [...new Set(evidence.flatMap(item =>
      Array.isArray(item[key]) ? item[key].filter((id): id is string => typeof id === 'string') : []))];
    const views = refs('views');
    if (!views.length) continue;
    additions.push({description: requirement, inputs: refs('inputs'), actions: refs('actions'), views});
  }
  if (!additions.length) return value;
  const revised = structuredClone(value) as {scene: {coverage: typeof additions}};
  revised.scene.coverage.push(...additions);
  return revised;
}
export function alignDraftCoverageDescriptions(value: unknown, requirements: string[]): unknown {
  if (!requirements.length || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as {scene?: {coverage?: Array<{description?: unknown}>}};
  const coverage = envelope.scene?.coverage;
  if (!Array.isArray(coverage) || coverage.length !== requirements.length ||
      new Set(requirements).size !== requirements.length) return value;
  const mismatches = coverage.flatMap((item, index) => item?.description === requirements[index] ? [] : [index]);
  if (mismatches.length !== 1) return value;
  const index = mismatches[0];
  const actual = coverage[index]?.description;
  const expected = requirements[index];
  if (typeof actual !== 'string' || actual.length < 6 || expected.length < 6 ||
      requirements.some((requirement, candidate) => candidate !== index && requirement === actual)) return value;
  let commonPrefix = 0;
  while (commonPrefix < Math.min(actual.length, expected.length) && actual[commonPrefix] === expected[commonPrefix]) commonPrefix++;
  if (commonPrefix < 6 || Math.max(actual.length, expected.length) - commonPrefix > 2) return value;
  const aligned = structuredClone(value) as {scene: {coverage: Array<{description: string}>}};
  aligned.scene.coverage[index].description = expected;
  return aligned;
}
const PROCESS_RESIDUAL_REVIEW_PROMPT = `你是互动过程的收束复核器。只核对input.residualIssues逐项是否被当前scene修复，不扩展新的审查范围，也不提出风格偏好。结合actualTests的初态、过程帧和final以及scene真实表达式给出证据。输出严格JSON {resolved:boolean,checks:[{issue:逐项复制或准确概括,resolved:boolean,evidence:当前字段或运行轨迹如何证明}],unresolved:string[]}。checks覆盖每个residualIssues；全部解决时resolved=true且unresolved=[]，否则resolved=false并只列仍未解决项。不得因补丁方式不同于建议而判错，只看可见结果、科学含义和交互因果是否正确。`;
type ProcessValidationReview = NonNullable<GeneratedInteractiveContent['processValidation']>['review'];
type ProcessResidualClosure = NonNullable<GeneratedInteractiveContent['processValidation']>['residualClosure'];
function hasBlockingDecisionReview(review: ProcessValidationReview): boolean {
  return !review.faithful||!review.scientificallySound||!review.causalInteraction||review.issues.some(issue=>
    /(?:输入|参数).{0,100}(?:未驱动|不驱动|未参与|无效)|(?:状态|计算|因果).{0,60}(?:矛盾|不一致)|(?:选择|选项).{0,50}(?:没有后果|结果相同)/.test(issue));
}
function hasResolvedDecisionClosure(review: ProcessValidationReview, closure?: ProcessResidualClosure): boolean {
  return Boolean(review.faithful && review.scientificallySound && review.causalInteraction &&
    closure?.residualIssues.length && closure.residualIssues.every(issue =>
      closure.checks.some(check => check.issue === issue && check.resolved)) &&
    closure.checks.every(check => check.resolved));
}
function criticalReviewDraft(raw: unknown): z.infer<typeof reviewSchema> | undefined {
  if(typeof raw!=='string')return;
  try{
    const review=reviewSchema.parse(normalizeProcessReviewIssues(parseCinematicJson(raw).value));
    if(review.issues.length&&hasBlockingDecisionReview(review))return review;
  }catch{}
}
function changedProcessLanguageUnits(before:ProcessScene,after:ProcessScene){
  const previousFields=new Map(processLanguageUnits(before).flatMap(unit=>unit.fields).map(field=>[field.path,field.text]));
  return processLanguageUnits(after).map(unit=>({...unit,fields:unit.fields.filter(field=>previousFields.get(field.path)!==field.text)})).filter(unit=>unit.fields.length>0);
}

export function processGenerationCheckpointFingerprints(request: Record<string,unknown>,
  workflowVersion: 'staged-v2' | undefined, generationSystem: string, revision: boolean){
  const legacyFingerprint=createHash('sha256').update(JSON.stringify({request,workflowVersion,system:generationSystem,
    repair: workflowVersion === 'staged-v2' ? PROCESS_STAGED_REPAIR_PROMPT : PROCESS_DRAFT_REPAIR_PROMPT,
    review:PROCESS_REVIEW_PROMPT,
    ...(revision?{revisionPlan:PROCESS_REVISION_PLAN_PROMPT,revisionReview:PROCESS_REVISION_REVIEW_BRIEF}:{}),
  })).digest('hex');
  const fingerprint=createHash('sha256').update(JSON.stringify({version:'process-content-v1',
    request,workflowVersion,contract:'process-v1'})).digest('hex');
  return {fingerprint,legacyFingerprint};
}

export async function generateProcessExplainer(
  input: SingleArtifactInput,
  order: number,
  aiCall: AICallFn,
  previous?: { scene: ProcessScene; instruction: string },
  options: {state?: GenerationStateStore; workflowVersion?: 'staged-v2'; inspectionSignal?: AbortSignal; inspectRendered?: ProcessRenderInspector;cohesiveDomainModel?:boolean;nativeDecisionSurface?:boolean;typedOutcomeSpec?:boolean} = {},
): Promise<LessonArtifact> {
  options.inspectionSignal?.throwIfAborted();
  const inspectRendered=options.inspectRendered??configuredProcessInspector(options.inspectionSignal);
  const request = {
    title: input.title,
    description: input.description,
    originalRequest: input.originalRequest,
    teacherLearningRequest: input.teacherLearningRequest,
    keyPoints: input.keyPoints,
    visualIntent: input.visualIntent,
    previous,
    ...(!previous && options.workflowVersion === 'staged-v2' && (options.state?.read('process-interaction-policy') === 'decision-exploration-v1' || (!options.state?.read('workflow-process-state') && !options.state?.read('process-repair') && !options.state?.read('process-review'))) &&
      !/(?:仅|只)(?:需|要)?(?:线性|顺序|逐步|观察)[^。\n]{0,30}(?:不要|无需|不需要)(?:决策|选择)|no\s+(?:choices|decisions)/i.test([input.originalRequest,input.description].join('\n'))
      ? {interactionDesign:'decision-exploration-v1'} : {}),
  };
  if (request.interactionDesign) await options.state?.write('process-interaction-policy',request.interactionDesign);
  if (JSON.stringify(request).length > 200000)
    throw Error('互动过程完整需求过大，未截断或替换原作品');
  const attempts: { attempt: number; issue: string }[] = [];
  let invalid: unknown,
    correction = '';
  let languageRepairBase: ProcessScene | undefined;
  let testRepairPending = false;
  let residualReviewIssues: string[] = [];
  const revisionBase = previous ? parseProcessScene(previous.scene) : undefined;
  let revisionMetadata: ReturnType<typeof applyProcessRevision>['revision'] | undefined;
  const generationSystem = revisionBase
    ? PROCESS_GENERATION_PROMPT.replace('生成JSON {scene,tests}', '根据增量编辑合同生成JSON补丁和测试') + '\n' + PROCESS_REVISION_BRIEF
    : PROCESS_GENERATION_PROMPT;
  const {fingerprint,legacyFingerprint}=processGenerationCheckpointFingerprints(
    request,options.workflowVersion,generationSystem,Boolean(revisionBase));
  const acceptedKey='process-accepted-'+fingerprint.slice(0,24);
  const validationLimit = options.workflowVersion === 'staged-v2' && !revisionBase ? 4 : PROCESS_MAX_VALIDATION_ATTEMPTS;
  let revisionPlan: ProcessRevisionPlan | undefined;
  if(revisionBase){
    const savedPlan=options.state?.read('process-revision-plan') as {fingerprint?:string;plan?:unknown}|undefined;
    revisionPlan=(savedPlan?.fingerprint===fingerprint||savedPlan?.fingerprint===legacyFingerprint)
      ?validateProcessRevisionPlan(revisionBase,savedPlan.plan):await runValidatedGenerationStage({
      stage:'process-revision-plan',system:PROCESS_REVISION_PLAN_PROMPT,input:{instruction:previous!.instruction,scene:revisionBase},
      aiCall:(system,user)=>aiCall(system,user,undefined,{stage:'process-scene'}),
      validate:value=>validateProcessRevisionPlan(revisionBase,value),
    });
    await options.state?.write('process-revision-plan',{fingerprint,plan:revisionPlan});
  }
  const saved=options.state?.read('process-repair') as {fingerprint?:string;invalid?:unknown;correction?:string;languageRepairBase?:ProcessScene;testRepairPending?:boolean;residualReviewIssues?:string[];attempts?:typeof attempts;normalizationVersion?:string}|undefined;
  const savedMatches=saved?.fingerprint===fingerprint||saved?.fingerprint===legacyFingerprint;
  if(savedMatches){
    invalid=saved.invalid;correction=typeof saved.correction==='string'?saved.correction:'';
    testRepairPending=saved.testRepairPending===true;
    if(Array.isArray(saved.residualReviewIssues))residualReviewIssues=saved.residualReviewIssues.filter(issue=>typeof issue==='string').slice(0,32);
    if(saved.languageRepairBase)languageRepairBase=parseProcessScene(saved.languageRepairBase);
    if(Array.isArray(saved.attempts))attempts.push(...saved.attempts.slice(-12));
  }
  if(savedMatches&&saved.fingerprint!==fingerprint)
    await options.state?.write('process-repair',{...saved,fingerprint});
  let normalizationVersion = savedMatches
    ? saved.normalizationVersion ?? PROCESS_NORMALIZATION_VERSION : PROCESS_NORMALIZATION_VERSION;
  let reviewPending = options.state?.read('process-review') as {fingerprint:string;pkg:unknown;patchCandidate?:unknown;revisionMetadata?:typeof revisionMetadata}|null|undefined;
  if(reviewPending?.fingerprint===legacyFingerprint){
    reviewPending={...reviewPending,fingerprint};
    await options.state?.write('process-review',reviewPending);
  }else if(reviewPending?.fingerprint!==fingerprint)reviewPending=undefined;
  if(reviewPending)revisionMetadata=reviewPending.revisionMetadata;
  if (savedMatches && !reviewPending && !revisionBase && options.workflowVersion === 'staged-v2' &&
      invalid && typeof invalid === 'object') {
    try {
      const normalized = normalizeRequestedByteMemoryPackage(request,invalid);
      if (normalized) {
        validateProcessPackage(normalized,input.visualIntent?.interactions || [],{minimumProductQuality:true});
        invalid=normalized;
        reviewPending={fingerprint,pkg:normalized};
        correction='';testRepairPending=false;attempts.length=0;
        normalizationVersion=PROCESS_NORMALIZATION_VERSION;
        await options.state?.write('process-repair',{fingerprint,invalid,correction,languageRepairBase,
          testRepairPending,residualReviewIssues,attempts,normalizationVersion});
        await options.state?.write('process-review',reviewPending);
      }
    } catch {}
  }
  // A pending local revalidation can itself hit a newly diagnosed normalizer
  // defect. On a later normalization version, replay its saved package once
  // with a fresh bounded budget; otherwise the old attempt count masks the
  // corrected code before it reaches the validator.
  if (savedMatches && reviewPending && !revisionBase &&
      options.workflowVersion === 'staged-v2' &&
      saved.normalizationVersion !== PROCESS_NORMALIZATION_VERSION) {
    invalid = reviewPending.pkg;
    correction = '';
    testRepairPending = false;
    attempts.length = 0;
    normalizationVersion = PROCESS_NORMALIZATION_VERSION;
    await options.state?.write('process-repair', {fingerprint, invalid, correction,
      languageRepairBase, testRepairPending, residualReviewIssues, attempts,
      normalizationVersion});
  }
  const completeStagedCheckpoint = ['workflow-process-state','workflow-process-behavior',
    'workflow-process-presentation',...(request.interactionDesign==='decision-exploration-v1'?[]:['workflow-process-tests'])].every(name => {
    const entry=options.state?.read(name);
    return entry && typeof entry==='object' && Object.hasOwn(entry,'output');
  });
  if(savedMatches && !reviewPending && !revisionBase &&
      options.workflowVersion==='staged-v2' &&
      saved.normalizationVersion!==PROCESS_NORMALIZATION_VERSION &&
      attempts.length>=validationLimit && completeStagedCheckpoint){
    // A failed whole-package patch is less trustworthy than the four frozen,
    // independently validated author stages. After a validator upgrade,
    // reassemble them locally and spend model calls only on a stage that no
    // longer validates. Do not replay a malformed repair as the new base.
    invalid=undefined;
    correction='';
    testRepairPending=false;
    attempts.length=0;
    normalizationVersion=PROCESS_NORMALIZATION_VERSION;
    await options.state?.write('process-repair',{fingerprint,invalid,correction,
      languageRepairBase,testRepairPending,residualReviewIssues,attempts,
      normalizationVersion});
  }
  // Recheck any complete saved package locally after normalization changes.
  // Its scene and tests are already present, so sending another repair request
  // before applying new deterministic rules wastes a model call. This also
  // covers a partially spent repair budget, not just exhausted jobs.
  if (savedMatches && !revisionBase && !reviewPending &&
      options.workflowVersion === 'staged-v2' &&
      saved.normalizationVersion !== PROCESS_NORMALIZATION_VERSION &&
      invalid && typeof invalid === 'object' &&
      (invalid as {scene?: unknown; tests?: unknown}).scene &&
      Array.isArray((invalid as {tests?: unknown}).tests)) {
    reviewPending = {fingerprint, pkg: invalid};
    correction = '';
    testRepairPending = false;
    attempts.length = 0;
    normalizationVersion = PROCESS_NORMALIZATION_VERSION;
    await options.state?.write('process-repair', {fingerprint, invalid, correction,
      languageRepairBase, testRepairPending, residualReviewIssues, attempts,
      normalizationVersion});
    await options.state?.write('process-review', reviewPending);
  }
  // A code deployment can improve deterministic validation after a job spent
  // its old repair budget. Give that stored draft one fresh bounded pass using
  // the new rules; the version marker prevents repeated resumes from buying
  // unlimited model calls under the same deployed code.
  if (savedMatches && !revisionBase && !reviewPending &&
      options.workflowVersion === 'staged-v2' && attempts.length >= validationLimit &&
      saved.normalizationVersion !== PROCESS_NORMALIZATION_VERSION) {
    invalid = undefined;
    correction = '';
    testRepairPending = false;
    attempts.length = 0;
    normalizationVersion = PROCESS_NORMALIZATION_VERSION;
    await options.state?.write('process-repair', {fingerprint, invalid, correction,
      languageRepairBase, testRepairPending, residualReviewIssues, attempts,
      normalizationVersion});
  }
  // A previously exhausted draft can be retried once after a new deterministic
  // topology repair becomes available. Persist the version so subsequent job
  // retries cannot silently grant unlimited model attempts.
  if (savedMatches && !reviewPending && !revisionBase &&
      attempts.length >= validationLimit &&
      correction.includes('拓扑状态数量必须与设备数量一致') &&
      saved.normalizationVersion !== 'topology-frame-status-v1') {
    const recovered = normalizeGeneratedRuntimeControls(invalid);
    if (JSON.stringify(recovered) !== JSON.stringify(invalid)) {
      invalid = recovered;
      correction = '';
      attempts.length = 0;
      reviewPending = {fingerprint, pkg: invalid};
      normalizationVersion = 'topology-frame-status-v1';
      await options.state?.write('process-repair', {fingerprint, invalid, correction,
        languageRepairBase, testRepairPending, residualReviewIssues, attempts,
        normalizationVersion});
      await options.state?.write('process-review', reviewPending);
    }
  }
  const finalizedArtifact = async (
    checked: ReturnType<typeof validateProcessPackage>,
    review: ProcessValidationReview,
    residualClosure?: ProcessResidualClosure,
    rendered?: ProcessRenderInspection,
    referenceSceneId?: string,
    reviewStatus: 'verified' | 'advisory' = 'verified',
  ): Promise<LessonArtifact> => {
    const now = Date.now();
    const artifact: LessonArtifact = {
      id: nanoid(),
      type: 'simulation',
      title: checked.scene.title,
      order,
      createdAt: now,
      outline: {
        id: nanoid(),
        type: 'interactive',
        widgetType: 'simulation',
        title: checked.scene.title,
        description: checked.scene.summary,
        keyPoints: input.keyPoints || [],
        order,
      },
      content: {
        html: compileProcessScene(checked.scene),
        widgetType: 'simulation',
        widgetConfig: processInteractionManifest(checked.scene),
        renderingMode: 'process-v1',
        processScene: checked.scene,
        processIntent: input.visualIntent,
        ...(revisionMetadata ? {processRevision:revisionMetadata} : {}),
        processValidation: {
          status: checked.status,
          reviewScope:revisionBase?'revision-delta-and-dependencies':'full-generation',
          ...(referenceSceneId ? {referenceSceneId} : {}),
          ...(revisionPlan?{revisionPlan}:{}),
          runtimeVersion: PROCESS_RUNTIME_VERSION,
          ...(checked.presentationWarnings.length?{presentationWarnings:checked.presentationWarnings}:{}),
          testCount: checked.evidence.length,
          ...(request.interactionDesign==='decision-exploration-v1'?{testSource:'deterministic-branch-exploration-v1',decisionEvidence:checked.decisionEvidence}:{}),
          totalSteps: checked.evidence.reduce((sum, item) => sum + item.steps, 0),
          review,
          reviewStatus,
          ...(residualClosure ? {residualClosure} : {}),
          attempts,
          browserValidation: rendered ? 'PASSED' : 'NOT_PERFORMED',
          qualityProfile: {id:'openmaic-gold-v1',score:reviewStatus === 'advisory' ? 80 : rendered?100:85,contract:'causal-state-browser-v1',deterministicTests:checked.evidence.length},
          ...(rendered?{browserRender:rendered.evidence}:{}),
        },
      },
    };
    const receipt={version:'process-accepted-20260930-v1',fingerprint,
      packageHash:createHash('sha256').update(JSON.stringify({scene:checked.scene,tests:checked.tests})).digest('hex'),
      scene:checked.scene,tests:checked.tests,review,residualClosure,reviewStatus,
      referenceSceneId,revisionPlan,revisionMetadata,rendered};
    // The artifact has already compiled and passed its gates. Optional resume
    // storage must never turn that success into a failed student job.
    if(options.state&&JSON.stringify(receipt).length<=1_900_000){
      try{await options.state.write(acceptedKey,receipt);}
      catch(error){console.warn('Accepted process checkpoint was not saved',error);}
    }
    return artifact;
  };
  const accepted=options.state?.read(acceptedKey) as {version?:string;fingerprint?:string;
    packageHash?:string;scene?:unknown;tests?:unknown;review?:unknown;
    residualClosure?:ProcessResidualClosure;reviewStatus?:'verified'|'advisory';
    referenceSceneId?:string;revisionPlan?:ProcessRevisionPlan;
    revisionMetadata?:ReturnType<typeof applyProcessRevision>['revision'];rendered?:unknown}|undefined;
  let acceptedDraft: {checked: ReturnType<typeof validateProcessPackage>;
    review: ProcessValidationReview;rendered?: ProcessRenderInspection}|undefined;
  if(accepted?.version==='process-accepted-20260930-v1'&&accepted.fingerprint===fingerprint){
    try{
      const packageHash=createHash('sha256').update(JSON.stringify({scene:accepted.scene,tests:accepted.tests})).digest('hex');
      if(packageHash!==accepted.packageHash)throw Error('Accepted package changed');
      const acceptedScene=structuredClone(accepted.scene) as ProcessScene;
      if(!revisionBase)normalizeDecisionPresentation(acceptedScene);
      if(!revisionBase&&options.nativeDecisionSurface&&options.typedOutcomeSpec){
        const source=options.state?.read('workflow-process-outcome-spec') as {output?:unknown}|undefined;
        if(source?.output&&acceptedScene.decisions?.[0]?.id==='studentDecision')assertTypedDecisionParameterDependencies(acceptedScene);
        if(restoreCompiledDecisionObjectBinding(request,source?.output,acceptedScene))
          throw Error('Accepted compiler-owned object binding requires local revalidation');
      }
      let checked=validateProcessPackage({scene:acceptedScene,tests:accepted.tests},
        input.visualIntent?.interactions||[],{minimumProductQuality:!revisionBase&&options.workflowVersion==='staged-v2',
          requireLearnerDecisions:request.interactionDesign==='decision-exploration-v1'});
      if (!revisionBase) {
        const normalized=normalizeRequestedByteMemoryPackage(request,{scene:checked.scene,tests:checked.tests});
        if (normalized) {
          const current=validateProcessPackage(normalized,input.visualIntent?.interactions||[],{minimumProductQuality:true});
          const context=(scene:ProcessScene)=>{const {actions:_actions,...rest}=scene;return rest;};
          if (accepted.reviewStatus==='advisory' && JSON.stringify(context(current.scene))===JSON.stringify(context(checked.scene))) {
            checked=current;
          } else {
            if (!reviewPending) {
              invalid=normalized;reviewPending={fingerprint,pkg:normalized};
              correction='';testRepairPending=false;attempts.length=0;
              normalizationVersion=PROCESS_NORMALIZATION_VERSION;
              await options.state?.write('process-repair',{fingerprint,invalid,correction,languageRepairBase,
                testRepairPending,residualReviewIssues,attempts,normalizationVersion});
              await options.state?.write('process-review',reviewPending);
            }
            throw Error('已接受作品的局部逻辑已升级；复用场景与测试，只重做相关审查和浏览器验收');
          }
        }
      }
      const review=accepted.reviewStatus==='verified'
        ? reviewSchema.parse(accepted.review):accepted.review as ProcessValidationReview;
      if(accepted.reviewStatus!=='verified'&&accepted.reviewStatus!=='advisory')throw Error('Invalid accepted review status');
      // Older accepted receipts put pre-repair language diagnostics into
      // issues. The package hash above ties a successful closure to this
      // exact repaired model; those historical quotes are not new defects.
      if (accepted.reviewStatus === 'advisory' && review.issues.length &&
          hasResolvedDecisionClosure(review, accepted.residualClosure)) {
        review.advisoryIssues = [...(review.advisoryIssues ?? []), ...review.issues.map(issue =>
          '修复前语言审查记录，未对修复后文字重新核验：' + issue)];
        review.issues = [];
      }
      if(accepted.reviewStatus==='verified'){
        const verifiedReview=reviewSchema.parse(accepted.review);
        validateLearnerLanguageReview(processLanguageUnits(checked.scene),verifiedReview.languageReview);
        if(!verifiedReview.faithful||!verifiedReview.scientificallySound||!verifiedReview.causalInteraction||verifiedReview.issues.length)
          throw Error('Accepted review no longer passes');
      }
      let rendered:ProcessRenderInspection|undefined;
      if(accepted.rendered&&inspectRendered){
        try{rendered=parseProcessInspection(accepted.rendered,compileProcessScene(checked.scene));}
        catch{ /* Browser evidence for an older compiled artifact is rechecked below. */ }
      }
      if(accepted.rendered&&!inspectRendered)throw Error('Previously inspected artifact requires browser verification');
      acceptedDraft={checked,review,rendered};
    }catch{
      // A stale accepted record is only a candidate; rebuild and revalidate it.
    }
  }
  if(acceptedDraft&&request.interactionDesign==='decision-exploration-v1'){
    const failedReview=options.state?.read('workflow-process-content-review') as {previousOutput?:string}|undefined;
    const critical=criticalReviewDraft(failedReview?.previousOutput);
    if(critical&&acceptedDraft.review.issues.some(issue=>issue.startsWith('独立教学审查未能产出可核验结果')))acceptedDraft.review=critical;
  }
  if(acceptedDraft && request.interactionDesign === 'decision-exploration-v1' &&
      hasBlockingDecisionReview(acceptedDraft.review) &&
      !acceptedDraft.review.issues.some(issue=>issue.startsWith('独立教学审查未能产出可核验结果'))){
    reviewPending={fingerprint,pkg:{scene:acceptedDraft.checked.scene,tests:acceptedDraft.checked.tests}};
    await options.state?.write('process-review',reviewPending);
    acceptedDraft=undefined;
  }
  if(acceptedDraft&&accepted){
    const rendered=acceptedDraft.rendered??(inspectRendered
      ?await inspectRendered(acceptedDraft.checked.scene,acceptedDraft.checked.tests):undefined);
    if(!rendered?.issues.length){
      revisionPlan=accepted.revisionPlan;
      revisionMetadata=accepted.revisionMetadata;
      return await finalizedArtifact(acceptedDraft.checked,acceptedDraft.review,accepted.residualClosure,
        rendered,accepted.referenceSceneId,accepted.reviewStatus);
    }
  }
  if (!revisionBase && !invalid && !reviewPending && options.workflowVersion === 'staged-v2') {
    const reference = verifiedProcessReference(request, input.visualIntent?.interactions || []);
    if (reference) {
      try {
        const checked = validateProcessPackage({scene: reference.scene, tests: reference.tests},
          input.visualIntent?.interactions || [], {minimumProductQuality: true,requireLearnerDecisions:request.interactionDesign==='decision-exploration-v1'});
        const review = reviewSchema.parse(reference.review);
        validateLearnerLanguageReview(processLanguageUnits(checked.scene), review.languageReview);
        const rendered = inspectRendered ? await inspectRendered(checked.scene, checked.tests) : undefined;
        if (rendered?.issues.length) throw Error('已验证参考场景浏览器检查失败：' +
          rendered.issues.map(issue => `${issue.code}: ${issue.message}`).join('；'));
        await options.state?.write('process-repair', null);
        return await finalizedArtifact(checked, review, undefined, rendered, reference.id);
      } catch (error) {
        // A custom request or changed runtime can invalidate a reference.
        // Continue with authored generation and the unchanged full quality gate.
        console.warn('[process-reference] browser or contract check rejected the verified scene:',
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500));
      }
    }
  }
  let stagedCandidate = !revisionBase && !reviewPending && !invalid && options.workflowVersion === 'staged-v2'
    ? await generateStagedProcessPackage({request,system:PROCESS_GENERATION_PROMPT,
      stageSystems:PROCESS_STAGED_SYSTEMS,testSystem:PROCESS_TEST_PROMPT,aiCall,state:options.state,
      cohesiveDomainModel:options.cohesiveDomainModel,nativeDecisionSurface:options.nativeDecisionSurface,typedOutcomeSpec:options.typedOutcomeSpec,
      retryBudgetVersion:PROCESS_NORMALIZATION_VERSION}) : undefined;
  for (let attempt = attempts.length; attempt < validationLimit; attempt++) {
    const priorCorrection = correction;
    let repairBase: unknown;
    const repairTests = invalid && typeof invalid === 'object' ? (invalid as {tests?: unknown}).tests : undefined;
    if (!revisionBase && !reviewPending && invalid && typeof invalid === 'object') {
      const candidate = (invalid as {scene?: unknown}).scene;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && (candidate as Record<string, unknown>).schemaVersion === 'process-v1') repairBase = candidate;
    }
    let testsOnlyCandidate: {scene: unknown; tests: unknown} | undefined;
    if (testRepairPending && repairBase && !reviewPending && request.interactionDesign==='decision-exploration-v1') {
      const scene=parseProcessScene(repairBase);testsOnlyCandidate={scene,tests:buildDecisionRuntimeTests(scene).tests};testRepairPending=false;
    } else if (testRepairPending && repairBase && !reviewPending) {
      const testRaw = await aiCall(PROCESS_TEST_PROMPT + '\n本轮仅修独立测试。诊断包含实际执行状态；核对测试操作序列与期望，不得输出patches或scene，不用固定答案替代算法正确性。后续仍有独立学科审查。'+REPAIR_HISTORY_REFERENCE_BRIEF,
        JSON.stringify({request, scene: repairBase, previousTests: repairTests, correction,
          recentFailures: compactRepairFailureHistory(correction,attempts.slice(-3))}), undefined, {stage: 'process-scene'});
      try {
        const tests = z.object({tests: z.unknown()}).strict().parse(normalizeModelEnvelope(parseCinematicJson(testRaw).value));
        testsOnlyCandidate = {scene: repairBase, tests: tests.tests};
        testRepairPending = false;
      } catch (error) {
        correction = error instanceof Error ? error.message : String(error);
        attempts.push({attempt: attempts.length + 1, issue: correction.slice(0, 5000)});
        await options.state?.write('process-repair',{fingerprint,invalid,correction,languageRepairBase,testRepairPending,residualReviewIssues,attempts:attempts.slice(-12),normalizationVersion});
        continue;
      }
    }
    const raw = reviewPending ? JSON.stringify(reviewPending.pkg) : testsOnlyCandidate ? JSON.stringify(testsOnlyCandidate) : stagedCandidate ? JSON.stringify(stagedCandidate) : await aiCall(
      repairBase ? (options.workflowVersion === 'staged-v2'
        ? PROCESS_STAGED_REPAIR_PROMPT : PROCESS_DRAFT_REPAIR_PROMPT) : generationSystem + REPAIR_HISTORY_REFERENCE_BRIEF,
      JSON.stringify({ request, invalid: repairBase ? undefined : invalid, correction,
        recentFailures: compactRepairFailureHistory(correction,attempts.slice(-3)), repairHistoryProtocol:REPAIR_HISTORY_REFERENCE_BRIEF,
        repairPaths: repairBase && typeof repairBase === 'object' && Array.isArray((repairBase as ProcessScene).actions)
          ? (repairBase as ProcessScene).actions.map(action => ({action:action.id,
            locals:(action.locals ?? []).map(local => `/actions/@${action.id}/locals/@${local.id}/value`),
            updates:action.updates.map(update => `/actions/@${action.id}/updates/@${update.target}/value`)})) : undefined,
        revision: revisionBase ? {scene:revisionBase,baseHash:processRevisionHash(revisionBase),plan:revisionPlan,
          scopeRule:'补丁只能落在plan.changes中的路径；原稿未涉及的历史问题不得扩展为本轮编辑。'} : repairBase ? {scene: repairBase, baseHash: processRevisionHash(repairBase), tests: repairTests} : undefined,
        repairContract: repairBase ? '仅输出{baseHash,patches}修复correction指出的具体问题；保留原测试，禁止输出完整scene或重写无关字段。' : revisionBase ? '根据correction返回完整修正的{baseHash,patches,tests}。始终基于revision.scene原稿，禁止返回整份scene。' : 'invalid是上一轮失败的完整原文或对象，不是新的要求。结合correction修复具体位置并输出完整的{scene,tests}；根对象不加type、correction或解释文字。不能输出JSON注释、JS表达式、占位省略号或未闭合结构。',
      }),
      undefined,
      {stage: attempt === 0 ? 'process-scene' : 'process-repair'},
    );
    stagedCandidate = undefined;
    let phase = 'contract';
    let noProgressRepair = false;
    let patchCandidate: unknown = reviewPending?.patchCandidate;
    // Keep the actual failed response even when parsing throws. Otherwise the
    // next repair gets only a byte offset and must blindly regenerate it all.
    invalid = raw;
    try {
      invalid = normalizeModelEnvelope(parseCinematicJson(raw).value);
      if (!revisionBase)
        invalid = normalizeGeneratedRuntimeControls(normalizeProcessExpressions(invalid),request);
      if (repairBase && !reviewPending && !testsOnlyCandidate) {
        const envelope = z.object({baseHash: z.string(), patches: z.array(z.unknown()), tests: z.unknown().optional()}).strict().parse(invalid);
        envelope.tests ??= repairTests;
        if (envelope.baseHash !== processRevisionHash(repairBase)) throw Error('修复底稿指纹不匹配');
        const patches=compactAutomaticProcessPatches(unlockedRepairPatches(envelope.patches), repairBase);
        rejectRedundantRuntimeActionPatches(patches);
        if(envelope.patches.length&&!patches.length)throw Error('修复补丁只尝试改写锁定描述或稳定对象ID，未修改实际实现');
        if (!patches.length) {
          noProgressRepair = true;
          throw Error('修复模型没有修改草稿；原始问题：' + correction.slice(0, 700));
        }
        const applied = patches.length ? applyProcessDraftRepair(repairBase, {...envelope,patches}, undefined, {deriveExpected: true}) : {draft: repairBase, tests: envelope.tests};
        if (JSON.stringify(applied.draft) === JSON.stringify(repairBase) &&
            JSON.stringify(applied.tests) === JSON.stringify(repairTests)) {
          noProgressRepair = true;
          throw Error('修复补丁没有改变草稿；原始问题：' + correction.slice(0, 700));
        }
        invalid = normalizeGeneratedRuntimeControls({scene: applied.draft, tests: applied.tests},request);
      }
      if (revisionBase && !reviewPending) {
        patchCandidate = invalid;
        const applied = applyProcessRevision(revisionBase, invalid, revisionPlan);
        revisionMetadata = applied.revision;
        invalid = {scene:applied.scene,tests:applied.tests};
      }
      if (
        invalid &&
        typeof invalid === 'object' &&
        (invalid as Record<string, unknown>).schemaVersion === 'process-v1'
      ) {
        // Preserve a valid scene emitted without its test envelope, but require
        // independently authored and executed tests before accepting it.
        const scene = parseProcessScene(invalid);
        phase = 'tests-upstream';
        const testRaw = await aiCall(PROCESS_TEST_PROMPT, JSON.stringify({ request, scene }));
        phase = 'tests-contract';
        const testOutput = z
          .object({ tests: z.unknown() })
          .strict()
          .parse(parseCinematicJson(testRaw).value);
        invalid = { scene, tests: testOutput.tests };
      }
      if(!revisionBase&&options.workflowVersion==='staged-v2'&&request.interactionDesign==='decision-exploration-v1'&&invalid&&typeof invalid==='object'){
        let scene=parseProcessScene((invalid as {scene:unknown}).scene);
        if(options.nativeDecisionSurface&&options.typedOutcomeSpec){
          const source=options.state?.read('workflow-process-outcome-spec') as {output?:unknown}|undefined;
          scene=restoreCompiledDecisionObjectBinding(request,source?.output,scene)??scene;
          if(source?.output&&scene.decisions?.[0]?.id==='studentDecision')assertTypedDecisionParameterDependencies(scene);
        }
        const runtime=buildDecisionRuntimeTests(scene);invalid={scene,tests:runtime.tests};
        await options.state?.write('process-decision-runtime-tests',{sceneHash:processRevisionHash(scene),...runtime});
      }
      const qualityOptions={minimumProductQuality: !revisionBase && options.workflowVersion === 'staged-v2', requireLearnerDecisions:request.interactionDesign === 'decision-exploration-v1'};
      let checked: ReturnType<typeof validateProcessPackage> | undefined;
      let candidate = invalid;
      for (let safeRepair = 0; safeRepair <= 96; safeRepair++) {
        try {
          if (!revisionBase) candidate = normalizeRequestedByteMemoryPackage(request,candidate) ?? candidate;
          if (!revisionBase) candidate = alignDraftCoverageDescriptions(
            completeCompoundCoverage(candidate, input.visualIntent?.interactions || []),
            input.visualIntent?.interactions || []);
          if (repairBase && !revisionBase && candidate && typeof candidate === 'object' &&
              'scene' in candidate) {
            const repairedScene = parseProcessScene((candidate as {scene: unknown}).scene);
            validateReachableBehaviorTransitions(repairedScene, repairedScene);
          }
          checked = validateProcessPackage(candidate, input.visualIntent?.interactions || [], qualityOptions);
          if (!revisionBase) validateRequestedByteMemoryTransitions(request, checked.scene);
          invalid = candidate;
          break;
        } catch (error) {
          if (revisionBase || !(error instanceof Error) || safeRepair === 96) throw error;
          const localized = reconcileLocalizedPolicyTraceTest(candidate, error) ??
            reconcileVerifiedFirewallAuditTest(candidate, error) ??
            reconcileDefaultDenyResultWording(candidate, error) ??
            reconcileMisindexedAuditTrailTest(candidate, error) ??
            quarantineIntermediateStateAssertion(candidate, error) ??
            extendProvenFinalTestStep(candidate, error) ??
            reconcileAppendHistoryCountTest(candidate, error) ??
            reconcileVerifiedTerminalDecision(candidate, error) ??
            reconcileVerifiedByteXorTest(candidate, error) ?? reconcileVerifiedHexArrayTest(candidate, error) ??
            reconcileHexDisplayPrefixTest(candidate, error) ?? reconcileHexCaseTest(candidate, error);
          if (localized) {
            candidate = localized;
            continue;
          }
          const byteLengthContradiction = quarantineContradictoryByteLengthTest(candidate, error);
          const narrowed = byteLengthContradiction ?? quarantineContradictoryPolicyRuleTest(candidate, error) ??
            quarantineContradictoryFirewallRuleTest(candidate, error);
          if (!narrowed) throw error;
          candidate = narrowed;
        }
      }
      if (!checked) throw Error('互动过程安全测试修订次数超限');
      // Deterministic reconciliation costs no model call and must not consume
      // the limited model-repair budget.
      const learnerTextUnits=revisionBase?changedProcessLanguageUnits(revisionBase,checked.scene):processLanguageUnits(checked.scene);
      const validateLanguage=(value:unknown)=>{
        if(learnerTextUnits.length)return validateLearnerLanguageReview(learnerTextUnits,value);
        const language=revisionReviewSchema.shape.languageReview.parse(value);
        if(language.checks.length||language.issues.length)throw Error('未修改文字，语言差异审查必须为空；计算与依赖仍单独审查');
        return language;
      };
      if (languageRepairBase)
        assertLearnerTextOnlyRevision(languageRepairBase, checked.scene, processLanguageUnits(languageRepairBase),
          {allowReviewedNumericRephrasing: true, allowReviewedFeedbackExpressions: true});
      reviewPending={fingerprint,pkg:invalid,patchCandidate,revisionMetadata};
      await options.state?.write('process-review',reviewPending);
      phase = 'browser-quality';
      const prereviewRendered=request.interactionDesign==='decision-exploration-v1'&&inspectRendered?await inspectRendered(checked.scene,checked.tests):undefined;
      if(prereviewRendered?.issues.length)throw Error('实际决策界面未通过浏览器验收：'+prereviewRendered.issues.map(issue=>issue.message).join('；'));
      const browserFacts=prereviewRendered?{sourceSha256:prereviewRendered.evidence.sourceSha256,
        controls:prereviewRendered.evidence.controls,decisions:prereviewRendered.evidence.decisions,objects:prereviewRendered.evidence.objects}:undefined;
      phase = 'review-upstream';
      // Freeze this policy independently of paid authoring stages. Existing
      // review checkpoints retain their original packet and remain reusable.
      const savedReviewPolicy=options.state?.read('process-review-policy') as {mode?:string}|undefined;
      const sourceReceiptForReview=options.state?.read('workflow-process-outcome-spec') as {output?:unknown}|undefined;
      const typedReviewEvidence=typedDecisionEvidenceForReview(request,sourceReceiptForReview?.output,checked);
      const compactDecisionReview=request.interactionDesign==='decision-exploration-v1'&&!revisionBase&&
        (['decision-core-v1','typed-source-core-v1'].includes(savedReviewPolicy?.mode??'')||!savedReviewPolicy&&!options.state?.read('workflow-process-content-review'));
      const reviewTypedSource=compactDecisionReview&&typedReviewEvidence&&
        (savedReviewPolicy?.mode==='typed-source-core-v1'||!savedReviewPolicy);
      if(!savedReviewPolicy)await options.state?.write('process-review-policy',{mode:reviewTypedSource?'typed-source-core-v1':compactDecisionReview?'decision-core-v1':'full-language-v1'});
      const reviewSystem = (compactDecisionReview?PROCESS_DECISION_CORE_REVIEW_PROMPT:PROCESS_REVIEW_PROMPT) +
          (request.interactionDesign==='decision-exploration-v1'?'\n本次采用宽容的决策实验验收。根issues只列有具体字段、输入/选择和错误后果证据的核心缺陷：科学因果错误、关键要求未实现、无法操作或不同选择无真实结果。相同根因合并一项，不拆成多条文案问题。其他改进放可选advisoryIssues:string[]，包括讲解措辞、冗余条件、初态为0但已标为未执行、额外题目/阶段/连续动画建议、框架内部字段组织。教师未要求的自动评价、更多题目或阶段不作为faithful=false依据；内置回到决策点与比较不要求领域状态重复实现。明确声明的有界教学假设可以有简化数值，不因缺少真实统计数据判scientificallySound=false，但公式若错误依赖不相关参数仍须阻止。faithful/scientificallySound/causalInteraction三个结论仅判断核心缺陷；文字语言问题仍单列languageReview。':'') + '\n' + PROCESS_TOPOLOGY_BRIEF + '\n教师明确要求动态拓扑时，必须有stateDrivenTopology=true的视图；数组列表或文字箭头不是已实现拓扑。activeWhen/blockedWhen的实际逻辑也必须与领域状态一致，不能仅因使用topology类型就通过。' +
          '\n' +
          PROCESS_RUNTIME_BEHAVIOR_BRIEF +
          '\n额外讲解导航未选中本身是提示而不是领域失败；以教师原文要求的行为和真实路径为准，不要求另造阶段或比较历史。live改变保留旧结果用于实验对照，可见input预览与已经提交的state结果应清楚区别，不要求自动重新执行学生决定。' +
          '\n' +
          PROCESS_LEARNING_QUESTION_BRIEF +
          '\n' +
          PROCESS_EXPLANATION_EVIDENCE_BRIEF +
          '\n' +
          PROCESS_RENDER_REVIEW_BRIEF + '\n' + PROCESS_INPUT_GUARD_REVIEW_BRIEF + '\n' + LEARNER_LANGUAGE_BRIEF +
          (compactDecisionReview?'\n本轮不输出languageReview或逐句语言评分。科学解释与操作文字的实质矛盾合并进核心issues。':'\n'+LEARNER_LANGUAGE_REVIEW_BRIEF) + (revisionBase?'\n'+PROCESS_REVISION_REVIEW_BRIEF:'')+
          (reviewTypedSource?'\n本次编译器已证明sourceSpec与实际运行场景完全一致，直接审查sourceSpec中的公式、事实、单位、上下限和说明。actualTests/actualDecisions是全部实测结果，browserFacts是实际控件证据；不能因编译通过认定学科正确。区分总量与子集、放行总量与合法放行量、暴露量与被拦截量；若量度定义明确，不强迫子集等于总量，不强迫固定比例或每个指标随所有条件变化。静态object事实若误冒充实时input派生量、声明公式与实际结果矛盾，仍须指出。反馈读取更新后状态，初始等待结果、比较和撤销由程序实现，不猜测另一种执行顺序。':'');
      const reviewEvidence=request.interactionDesign==='decision-exploration-v1'?processEvidenceForReview(checked):undefined;
      const reviewInput = {
          request,
          ...(revisionMetadata ? {revision:revisionMetadata} : {}),
          ...(revisionPlan?{revisionPlan}:{}),
          ...(reviewTypedSource?{domainModel:typedReviewEvidence}:{scene: checked.scene}),
          ...(compactDecisionReview?{reviewScope:reviewTypedSource?'typed-source-core-v1; exact compiled source, complete scientific copy and computed consequences; no per-sentence style scoring':'decision-core-v1; full learner copy remains in scene; no per-sentence style scoring'}:{learnerTextUnits}),
          ...(!reviewTypedSource?{actualTests: reviewEvidence?.tests??checked.evidence,
          actualDecisions:reviewEvidence?.decisions??checked.decisionEvidence,
          ...(reviewEvidence?{traceFormat:{format:reviewEvidence.format,reconstruction:reviewEvidence.reconstruction,baselineState:reviewEvidence.baselineState,initialViews:reviewEvidence.initialViews}}:{})}:{}),
          testEvidenceScope:request.interactionDesign==='decision-exploration-v1'?'运行检查由确定性分支探索生成，证明实际行为，不证明学科正确。请独立核对教师要求与真实状态、公式、传播或处置规则，不能因运行检查通过就认定科学正确。':'独立作者测试',

          inputValidationFacts: inspectProcessInputGuards(checked.scene),
          appearanceFacts: PROCESS_APPEARANCE_BRIEF,
          presentationWarnings:checked.presentationWarnings,
          browserFacts,
          renderingFacts: checked.scene.views.map((view) => ({
            id: view.id,
            stateDrivenTopology: view.kind === 'topology',
            topologyTransitionAnimation: view.kind === 'topology' && Boolean(view.topology?.edges.length),
            topologyNodeCount: view.topology?.labels.length ?? 0,
            topologyEdges: view.topology?.edges,
            byteCellsWithHexAndAscii: view.kind === 'array' && view.format === 'byte',
            illustrativeByteAddresses: view.kind === 'array' && view.addressBase !== undefined,
            codeLineNumbers: view.kind === 'code',
            activeCodeLineHighlight: view.kind === 'code' && view.activeIndex !== undefined,
            codeLineMarks: view.kind === 'code' && view.markedIndices !== undefined,
            coloredRegionCount: view.kind === 'array' ? (view.regions?.length ?? 0) : 0,
            activeCellHighlight: view.kind === 'array' && view.activeIndex !== undefined,
            activeCellWritePulse: view.kind === 'array' && view.activeIndex !== undefined,
            stateDrivenMarks: ['array', 'bars'].includes(view.kind) && view.markedIndices !== undefined,
          })),
        };
      const validateReview = (value: unknown) => {
          const review=(revisionBase?revisionReviewSchema:compactDecisionReview?decisionCoreReviewSchema:reviewSchema).parse(normalizeProcessReviewIssues(value));
          if(review.languageReview)validateLanguage(review.languageReview);
          return review;
        };
      let review: z.infer<typeof decisionCoreReviewSchema>;
      let reviewLanguageWarning: string | undefined;
      const cachedCritical=options.state?.read('process-critical-review') as {sceneHash?:string;review?:z.infer<typeof reviewSchema>;warning?:string}|undefined;
      try { if(request.interactionDesign==='decision-exploration-v1'&&cachedCritical?.sceneHash===processRevisionHash(checked.scene)&&cachedCritical.review){
        review=reviewSchema.parse(cachedCritical.review);reviewLanguageWarning=cachedCritical.warning;
      } else review = options.workflowVersion === 'staged-v2' && !revisionBase
        ? await runDurableStage<z.infer<typeof decisionCoreReviewSchema>>({
          name:'process-content-review', system:reviewSystem, input:reviewInput,
          aiCall, state:options.state, validate:validateReview, maxAttempts:1,
        })
        : await runValidatedGenerationStage({
          stage:'process-content-review', system:reviewSystem, input:reviewInput,
          aiCall, validate:validateReview, maxAttempts:3,
        }); } catch (error) {
        // The independent reviewer can invent a quote/path and fail its own
        // schema even when executable tests and browser controls pass. Keep
        // the unverified review visible instead of spending more model calls
        // to reconstruct a working artifact.
        if (options.workflowVersion !== 'staged-v2' || revisionBase || options.inspectionSignal?.aborted)
          throw error;
        const failedReview=options.state?.read('workflow-process-content-review') as {previousOutput?:string}|undefined;
        const critical=request.interactionDesign==='decision-exploration-v1'?criticalReviewDraft(failedReview?.previousOutput):undefined;
        if(critical){review=critical;reviewLanguageWarning='独立语言审查引用未通过核验；科学与决策问题仍单独处理。';
          await options.state?.write('process-critical-review',{sceneHash:processRevisionHash(checked.scene),review,warning:reviewLanguageWarning});}

        else {
        const rendered = prereviewRendered??(inspectRendered ? await inspectRendered(checked.scene, checked.tests) : undefined);
        if (!rendered || rendered.issues.length) throw Error('实际浏览器交互未通过：' +
          (rendered?.issues.map(issue => `${issue.code}: ${issue.message}`).join('；') ?? '未执行浏览器检查'));
        await options.state?.write('process-review', null);
        await options.state?.write('process-repair', null);
        const reviewError = error instanceof Error ? error.message : String(error);
        return await finalizedArtifact(checked, {faithful:false, scientificallySound:false,
          causalInteraction:false, issues:[`独立教学审查未能产出可核验结果：${reviewError.slice(0, 500)}`]},
          undefined, rendered, undefined, 'advisory');
        }
      }
      phase = 'review-quality';
      reviewPending=undefined;
      await options.state?.write('process-review',null);
      if(!review.languageReview)reviewLanguageWarning='已独立核验需求、科学和决策因果；未进行逐句语言审校。';
      const languageProblems = reviewLanguageWarning ? [reviewLanguageWarning] : languageReviewProblems(validateLanguage(review.languageReview));
      if (review.faithful && review.scientificallySound && review.causalInteraction && !review.issues.length && languageProblems.length)
        languageRepairBase ??= checked.scene;
      const reviewProblems = [...review.issues, ...languageProblems];
      if (request.interactionDesign === 'decision-exploration-v1' &&
          hasBlockingDecisionReview(review)) {
        phase='decision-quality-repair';
        await options.state?.write('process-review',{fingerprint,pkg:{scene:checked.scene,tests:checked.tests}});
        const sourceReceipt=options.state?.read('workflow-process-outcome-spec') as {output?:unknown}|undefined;
        let sourceSpec:ReturnType<typeof parseDecisionOutcomeSpec>|undefined;
        try{if(sourceReceipt?.output)sourceSpec=parseDecisionOutcomeSpec(sourceReceipt.output);}catch{/* Older non-typed artifacts retain the scoped scene patcher. */}
        const repair = sourceSpec?await runDurableStage({name:'process-decision-quality-source-repair',
          system:'只修复独立审查指出的核心科学或因果问题。sourceSpec是已有领域模型，不是从头设计新任务。只输出JSON {baseHash,sourceSpec:修复后的完整领域模型}。保持所有原对象、参数、结果与策略ID及顺序，保留全部参数范围和默认值；不删除原属性。可以修正公式、对象事实、单位及与公式矛盾的解释，必要时增加明确的有界教学属性。不要承诺未实现的依赖遍历、传播过程或真实统计概率；已有相关属性汇总可以表达依赖集合，不强制图算法。对象证据只写静态事实，条件化示例标明输入。公式直接引用input/已声明object属性，不使用state/local或Javascript。只改变问题对应的领域规则或说明，其他已完成工作保留。界面、运行状态转移与浏览器控件由程序生成，不输出scene、views或patches。修复后仍有独立问题复核，不能靠删掉教师要求通过。'+'\n'+DECISION_OUTCOME_REPAIR_FORMAT,
          input:{request,baseHash:processRevisionHash(checked.scene),sourceSpec,issues:review.issues,
            identityContract:{parameters:sourceSpec.parameters,objects:sourceSpec.objects.map(item=>item.id),
              metrics:sourceSpec.metrics.map(item=>item.id),choices:sourceSpec.choices.map(item=>item.id),
              rule:'参数ID、数量、范围和默认值保持；不能新增参数。需要修正规则常数时可新增明确的对象属性，同时提供各对象事实。'},
            actualDecisions:reviewEvidence?.decisions??checked.decisionEvidence,runtimeFacts:PROCESS_RUNTIME_BEHAVIOR_BRIEF},
          aiCall:(system,user)=>aiCall(system,user,undefined,{stage:'process-repair'}),state:options.state,
          maxAttempts:2,maxTotalAttempts:2,validate:value=>{
            const envelope=z.object({baseHash:z.literal(processRevisionHash(checked!.scene)),sourceSpec:z.unknown()}).strict().parse(value);
            const repaired=compileTypedDecisionRepair(request,sourceSpec!,envelope.sourceSpec,checked!.scene);
            validateProcessPresentationFrames(repaired.scene);return repaired;
          }}):await runDurableStage({name:'process-decision-quality-repair',
          system:PROCESS_DRAFT_REPAIR_PROMPT + '\n本轮只修独立审查已指出的科学因果问题。允许必要的initialState叶子修复（如缺失感染源），不重写整场、不改变稳定ID。payload.scene是唯一可编辑底稿；expandedState、actualTests、actualDecisions是诊断证据，绝不在patches中修改。优先替换repairTargets中的完整表达式叶子，保留稳定对象ID；不要猜测深层args数字路径，不编辑不存在的更新项。只修领域行为或与其矛盾的文字，不采纳与runtimeFacts矛盾的审查意见（live保留状态、回到决策点及比较已由播放器实现）。只输出{baseHash,patches}，运行检查本地完成。',
          input:{request,baseHash:processRevisionHash(checked.scene),scene:checked.scene,
            issues:review.issues,actualDecisions:reviewEvidence?.decisions??checked.decisionEvidence,browserFacts,
            runtimeFacts:PROCESS_RUNTIME_BEHAVIOR_BRIEF,
            repairTargets:{actions:checked.scene.actions.map(action=>({id:action.id,enabledWhen:`/actions/@${action.id}/enabledWhen`,
              feedback:`/actions/@${action.id}/feedback`,locals:(action.locals??[]).map(local=>({id:local.id,path:`/actions/@${action.id}/locals/@${local.id}/value`})),
              updates:action.updates.map((update,index)=>({target:update.target,path:`/actions/@${action.id}/updates/${index}/value`}))})),
              views:checked.scene.views.map(view=>({id:view.id,kind:view.kind,
                valueType:view.kind==='bars'?'仅有限数值数组，不得加入字符串、null或未执行文字':view.kind==='array'||view.kind==='topology'?'一维标量数组':'标量或文本',
                value:`/views/@${view.id}/value`}))}},
          aiCall:(system,user)=>aiCall(system,user,undefined,{stage:'process-repair'}),state:options.state,
          maxAttempts:1,maxTotalAttempts:2,
          validate:value=>{
            const envelope=z.object({baseHash:z.string(),patches:z.array(z.unknown()).min(1).max(48)}).strict().parse(value);
            if(envelope.baseHash!==processRevisionHash(checked!.scene))throw Error('决策修复底稿指纹不匹配');
            envelope.patches=envelope.patches.map(patch=>{
              if(!patch||typeof patch!=='object'||Array.isArray(patch))return patch;
              const item=patch as {path?:unknown};
              return typeof item.path==='string'?{...item,path:normalizeAutomaticProcessPatchPath(checked!.scene,
                item.path.startsWith('/scene/')?item.path.slice('/scene'.length):item.path)}:patch;
            });
            const applied=applyProcessDraftRepair(checked!.scene,{...envelope,tests:checked!.tests},undefined,{deriveExpected:true});
            const draft=normalizeProcessExpressions(applied.draft) as ProcessScene;
            const scene=parseProcessScene(normalizeUndeclaredStateLocals(draft.initialState,draft));normalizeDecisionPresentation(scene);
            validateProcessPresentationFrames(scene);return {scene,changedPaths:applied.revision.changedPaths};
          }});
        let repaired:ReturnType<typeof validateProcessPackage>;
        try {repaired=validateProcessPackage({scene:repair.scene,tests:checked.tests},input.visualIntent?.interactions||[],
          {minimumProductQuality:true,requireLearnerDecisions:true});}
        catch {
          const runtime=buildDecisionRuntimeTests(repair.scene);
          repaired=validateProcessPackage({scene:repair.scene,tests:runtime.tests},input.visualIntent?.interactions||[],
            {minimumProductQuality:true,requireLearnerDecisions:true});
          await options.state?.write('process-decision-runtime-tests',{sceneHash:processRevisionHash(repaired.scene),...runtime});
        }
        const rendered=inspectRendered?await inspectRendered(repaired.scene,repaired.tests):undefined;
        if(!rendered||rendered.issues.length)throw Error('修复后的真实决策界面未通过浏览器验收');
        const closure=await runDurableStage({name:'process-decision-quality-closure',
          system:'只复核输入中原审查列出的科学与决策因果问题是否已修复，不新增文风偏好或无关要求。以教师需求、修复后scene和真实执行证据为准。只输出JSON {resolved:boolean,remaining:string[]}；没有感染源、选项没有后果、解释与状态矛盾等实质问题必须保留。对象点击若仅用于检视证据，不要求它改变全局结果；领域处置针对所选对象时才检查目标依赖。教师未要求时间演化时，直接计算所选时长结果可以成立；有界教学模型不因未达到声明上限而判错。回到决策点与比较由播放器提供，无需重复添加领域状态。原审查若要求了教师没有提出的行为，须按本验收范围核对，不能保留额外要求作为失败理由。 边界、饱和、共同属性或某个策略不作用于该属性时，可有相同结果；不要求每组对象、每个输入下每种选择都不同。只有教师要求的对象处置在所有相关合法条件下均无目标依赖时才判虚假交互；单组相同结果不是这个反例。未要求全来源模拟时，不要求另建完整网络流量求解器。',
          input:{request,originalIssues:review.issues,scene:repaired.scene,changedPaths:repair.changedPaths,
            ...(sourceSpec&&'sourceSpec' in repair?{compiledDomain:typedDecisionEvidenceForReview(request,repair.sourceSpec,repaired),
              quantityReviewRule:'按每个指标自己的定义核对，区分总量与子集、放行量与合法放行量、敏感端口暴露量与拦截量。不能要求子集无条件等于总请求数，也不能要求固定比例评分随总量变化。实际公式或文字矛盾仍须指出。'}:{}),
            actualEvidence:processEvidenceForReview(repaired),browserFacts:rendered?{controls:rendered.evidence.controls,decisions:rendered.evidence.decisions,objects:rendered.evidence.objects}:undefined,runtimeFacts:PROCESS_RUNTIME_BEHAVIOR_BRIEF},
          aiCall:(system,user)=>aiCall(system,user,undefined,{stage:'process-repair'}),state:options.state,
          maxAttempts:1,maxTotalAttempts:2,validate:value=>{
            const result=z.object({resolved:z.boolean(),remaining:z.array(z.string()).max(16)}).strict().parse(value);
            if(!result.resolved||result.remaining.length)throw Error('决策因果局部复验未通过：'+result.remaining.join('；'));
            return result;
          }});
        await options.state?.write('process-repair',null);
        return await finalizedArtifact(repaired,{faithful:true,scientificallySound:true,causalInteraction:true,issues:[],
          advisoryIssues:[...(review.advisoryIssues ?? []), ...languageProblems.map(issue =>
            '修复前语言审查记录，未对修复后文字重新核验：' + issue)]},
          {mode:'residual-closure',residualIssues:review.issues,checks:review.issues.map(issue=>({issue,resolved:closure.resolved,evidence:'局部补丁和独立状态测试通过，已复核原问题。'}))},rendered,undefined,'advisory');
      }
      if (options.workflowVersion === 'staged-v2' && !revisionBase &&
          (!review.faithful || !review.scientificallySound || !review.causalInteraction || reviewProblems.length)) {
        const rendered = prereviewRendered??(inspectRendered ? await inspectRendered(checked.scene, checked.tests) : undefined);
        if (!rendered || rendered.issues.length) throw Error('实际浏览器交互未通过：' +
          (rendered?.issues.map(issue => `${issue.code}: ${issue.message}`).join('；') ?? '未执行浏览器检查'));
        await options.state?.write('process-repair', null);
        return await finalizedArtifact(checked, {faithful:review.faithful,
          scientificallySound:review.scientificallySound, causalInteraction:review.causalInteraction,
          issues:review.issues,advisoryIssues:[...(review.advisoryIssues??[]),...languageProblems]}, undefined, rendered, undefined, 'advisory');
      }
      if (
        !review.faithful ||
        !review.scientificallySound ||
        !review.causalInteraction ||
        reviewProblems.length
      ) {
        residualReviewIssues = reviewProblems.length ? reviewProblems : ['审查结论未通过，但未提供具体问题'];
        throw Error('教学/交互/文字审查：' + residualReviewIssues.join('；') +
          (languageRepairBase ? '；本轮只修订文字，完整保留原scene的所有输入、计算、动作、ID、视图和顺序，仅改原有说明字符串，数字与条件不变。' : ''));
      }
      phase='browser-quality';
      const rendered=prereviewRendered??(inspectRendered?await inspectRendered(checked.scene,checked.tests):undefined);
      if(rendered?.issues.length)throw Error('实际浏览器交互未通过：'+rendered.issues.map(issue=>`${issue.code}: ${issue.message}`).join('；'));
      await options.state?.write('process-repair',null);
      return await finalizedArtifact(checked, review, undefined, rendered);
    } catch (error) {
      if(error instanceof ProcessInspectorUnavailableError)throw error;
      if (phase === 'review-upstream' || phase === 'tests-upstream' || phase === 'decision-quality-repair') throw error;
      correction = error instanceof Error ? error.message : String(error);
      if (reviewPending && !revisionBase) {
        // A saved draft was replayed locally and still failed. Release the
        // checkpoint so the next bounded turn can issue a real targeted
        // repair or tests-only request instead of replaying the same failure.
        reviewPending = undefined;
        await options.state?.write('process-review', null);
      }
      if (!revisionBase && options.workflowVersion === 'staged-v2' && repairBase &&
          !testsOnlyCandidate && error instanceof ProcessTestAssertionError &&
          priorCorrection.includes('期望与实际状态不符')) {
        // A scene patch failed the independent test again. Restore the exact
        // pre-patch scene and report both traces to the scene patcher. Sending
        // this to the test author could make incorrect domain behavior pass
        // by rewriting the expected result instead of fixing the algorithm.
        const patchFailure = correction;
        invalid = {scene: repairBase, tests: repairTests};
        correction = priorCorrection.slice(0, 3500) +
          '\n上一场景补丁未通过复验：' + patchFailure.slice(0, 700);
      }
      // In the staged workflow, an unexpected assertion can expose a real
      // scene defect (for example, a default-deny decision that never reaches
      // its terminal phase). Keep the authored expectation and repair the
      // scene first. The legacy monolithic workflow retains its older test
      // reauthoring path for compatibility.
      let verifiedPolicyTestsOnly=false;
      if(error instanceof ProcessTestAssertionError && invalid && typeof invalid==='object' &&
          'scene' in invalid)try{
        verifiedPolicyTestsOnly=verifySingularPolicyFirstMatch(
          parseProcessScene((invalid as {scene:unknown}).scene));
      }catch{ /* A malformed scene is still a scene-repair problem. */ }
      if (!revisionBase && ((error instanceof ProcessTestAssertionError &&
          (options.workflowVersion !== 'staged-v2' || verifiedPolicyTestsOnly || error instanceof ProcessTestSequenceError)) ||
          (correction.startsWith('完整互动成品的真实测试必须到达每个教学阶段：') &&
           !attempts.some(item=>item.issue.startsWith('完整互动成品的真实测试必须到达每个教学阶段：')))))
        testRepairPending = true;
      if (patchCandidate !== undefined) invalid = patchCandidate;
      else if (repairBase && (typeof invalid !== 'object' || !invalid || !('scene' in invalid)))
        invalid = {scene: repairBase, tests: repairTests};
      if (error instanceof CinematicJsonError)
        correction += '；出错原文片段：' + JSON.stringify(raw.slice(Math.max(0,error.offset-100),error.offset+160));
      attempts.push({ attempt: attempts.length + 1, issue: correction.slice(0, 5000) });
      await options.state?.write('process-repair',{fingerprint,invalid,correction,languageRepairBase,testRepairPending,residualReviewIssues,attempts:attempts.slice(-12),normalizationVersion});
      if (!revisionBase && options.workflowVersion === 'staged-v2' &&
          isRepeatedAutomaticPatchFailure(attempts)) break;
      if (noProgressRepair && !revisionBase && options.workflowVersion === 'staged-v2' &&
          correction.includes('期望与实际状态不符') && !testRepairPending &&
          attempts.length < validationLimit) {
        // The scene patcher has explicitly declined to change the domain
        // model. Spend one bounded call on the independent test author rather
        // than asking the same patcher for another no-op response.
        testRepairPending = true;
        await options.state?.write('process-repair',{fingerprint,invalid,correction,
          languageRepairBase,testRepairPending,residualReviewIssues,
          attempts:attempts.slice(-12),normalizationVersion});
        continue;
      }
      if (noProgressRepair) break;
    }
  }
  if (!revisionBase && correction.startsWith('教学/交互/文字审查：') && invalid && typeof invalid === 'object') {
    const packageValue = invalid as {scene?: unknown; tests?: unknown};
    if (packageValue.scene && packageValue.tests) {
      try {
        const residualText = correction.slice('教学/交互/文字审查：'.length).split('；本轮只修订文字，')[0];
        const residualIssues = residualReviewIssues.length ? residualReviewIssues : residualText.split('；')
          .map(issue => issue.trim()).filter(Boolean).slice(0, 32);
        const closureInput = {
          request,
          residualIssues,
          revision: {scene: packageValue.scene, baseHash: processRevisionHash(packageValue.scene), tests: packageValue.tests},
          repairContract: '仅输出{baseHash,patches}，逐项关闭residualIssues；系统随后重跑全部测试并只复核这些问题。',
        };
        const closureEnvelope = z.object({baseHash: z.string(), patches: z.array(z.object({path:z.string()}).passthrough()).min(1), tests: z.unknown().optional()}).strict();
        let envelope: z.infer<typeof closureEnvelope> | undefined;
        let formatIssue = '';
        // A malformed final patch is a transport failure, not evidence that
        // the otherwise valid scene must be rebuilt. Give this small JSON
        // envelope one bounded format retry inside the same user request.
        for (let formatAttempt = 0; formatAttempt < 2; formatAttempt++) {
          const repairRaw = await aiCall(
            PROCESS_DRAFT_REPAIR_PROMPT + '\n这是最终收束补丁。只修residualIssues列出的剩余问题，并在一个批次中全部关闭；不得重写无关字段。' +
              (formatAttempt ? '\n上次补丁JSON格式不完整。重新输出完整、简短、可解析的单个JSON对象；不要续写或复制上次输出，不要解释。' : ''),
            JSON.stringify({...closureInput, ...(formatIssue ? {formatIssue} : {})}),
            undefined,
            {stage: 'process-repair'},
          );
          try {
            envelope = closureEnvelope.parse(normalizeProcessExpressions(normalizeModelEnvelope(parseCinematicJson(repairRaw).value)));
            break;
          } catch (error) {
            if (!(error instanceof CinematicJsonError) || formatAttempt) throw error;
            formatIssue = error.message.slice(0, 240);
          }
        }
        if (!envelope) throw Error('最终收束补丁没有有效JSON');
        const patches=compactAutomaticProcessPatches(unlockedRepairPatches(envelope.patches), packageValue.scene);
        rejectRedundantRuntimeActionPatches(patches);
        if(!patches.length)throw Error('收束补丁只尝试改写锁定描述或稳定对象ID，未修改实际实现');
        const applied = applyProcessDraftRepair(packageValue.scene, {...envelope, patches, tests: packageValue.tests}, undefined, {deriveExpected: true});
        const checked = validateProcessPackage(alignDraftCoverageDescriptions(
          completeCompoundCoverage(normalizeGeneratedRuntimeControls({scene: applied.draft, tests: applied.tests},request), input.visualIntent?.interactions || []),
          input.visualIntent?.interactions || []), input.visualIntent?.interactions || [],
          {minimumProductQuality: options.workflowVersion === 'staged-v2'});
        if (languageRepairBase)
          assertLearnerTextOnlyRevision(languageRepairBase, checked.scene, processLanguageUnits(languageRepairBase),
            {allowReviewedNumericRephrasing: true, allowReviewedFeedbackExpressions: true});
        const closure = await runValidatedGenerationStage({
          stage: 'process-residual-review',
          system: PROCESS_RESIDUAL_REVIEW_PROMPT,
          input: {request, residualIssues, scene: checked.scene, actualTests: checked.evidence},
          aiCall: (system, user) => aiCall(system, user, undefined, {stage: 'process-repair'}),
          validate(value) {
            const result = residualReviewSchema.parse(value);
            if (result.checks.length < residualIssues.length || result.checks.some(check => !check.resolved) ||
                result.unresolved.length || !result.resolved)
              throw Error('收束复核仍有未解决问题：' + result.unresolved.join('；'));
            return result;
          },
        });
        const rendered=inspectRendered?await inspectRendered(checked.scene,checked.tests):undefined;
        if(rendered?.issues.length)throw Error('实际浏览器交互未通过：'+rendered.issues.map(issue=>`${issue.code}: ${issue.message}`).join('；'));
        await options.state?.write('process-repair',null);
        return await finalizedArtifact(
          checked,
          {faithful:true, scientificallySound:true, causalInteraction:true, issues:[]},
          {mode:'residual-closure', residualIssues, checks:closure.checks},
          rendered,
        );
      } catch (error) {
        correction = '定向收束失败：' + (error instanceof Error ? error.message : String(error));
      }
    }
  }
  throw Error(
    `互动过程生成在${validationLimit}次有界校验后仍未通过，未用翻页/固定模板替代，原作品保持不变。` +
      correction.slice(0, 1500),
  );
}
export function previousProcessScene(content: {
  html?: string;
  processScene?: ProcessScene;
}): ProcessScene {
  const scene = extractProcessScene(String(content.html || ''));
  if (!scene) throw Error('原互动过程数据无效，未覆盖旧版本');
  return scene;
}

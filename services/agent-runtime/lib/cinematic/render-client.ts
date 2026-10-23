import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { z } from 'zod';
import type { CinematicScene } from './schema';

const issueSchema = z.object({
  code: z.string().max(80),
  message: z.string().max(1200),
  nodes: z.array(z.string().max(48)).max(100).default([]),
  at: z.number().optional(),
});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const inspectionSchema = z.object({
  issues: z.array(issueSchema).max(160),
  advisories: z.array(issueSchema).max(160).optional(),
  evidence: z.object({
    mode: z.literal('headless-chromium-webgl-dom-and-pixels'),
    sourceSha256: hash,
    inspectedAt: z.string(),
    visualAestheticReview: z.literal('not-scored-by-model'),
    frames: z
      .array(
        z.object({
          at: z.number(),
          width: z.number(),
          screenshotSha256: hash,
          canvasSha256: hash,
          diagnostics: z
            .object({ available: z.literal(true), renderer: z.string().optional() })
            .passthrough(),
          pixels: z.object({ brightFraction: z.number().min(0).max(1), colorBuckets: z.number() }),
        }),
      )
      .min(1)
      .max(50),
    domainDecisions:z.array(z.object({id:z.string(),sameCheckpoint:z.boolean(),comparisonRows:z.number().int().nonnegative(),
      alternatives:z.array(z.object({action:z.string(),values:z.record(z.string(),z.unknown()),bindings:z.array(z.unknown()),geometry:z.array(z.unknown()),canvasSha256:hash,
        observationTime:z.number().nonnegative().optional(),motion:z.object({from:z.number(),to:z.number(),nodes:z.array(z.object({node:z.string(),radiansPerSecond:z.number(),before:z.array(z.number()),after:z.array(z.number()),
          worldBefore:z.array(z.number()),worldAfter:z.array(z.number()),worldAngleValidated:z.boolean(),ancestors:z.array(z.object({id:z.string(),before:z.array(z.number()),after:z.array(z.number())}))}))}).optional()})).min(2)})).optional(),
    controls: z
      .object({
        playingWhileExploring: z.boolean(),
        cameraHeld: z.boolean(),
        zoomWorked: z.boolean(),
        paused: z.boolean(),
        reset: z.boolean(),
        elapsed: z.number(),
      })
      .passthrough(),
  }),
});
export type CinematicRenderInspection = z.infer<typeof inspectionSchema>;
export type CinematicRenderInspector = (
  scene: CinematicScene,
) => Promise<CinematicRenderInspection>;

export function cinematicControlEvidence(controls: CinematicRenderInspection['evidence']['controls']) {
  return {
    playingWhileExploring: controls.playingWhileExploring,
    cameraHeld: controls.cameraHeld,
    zoomWorked: controls.zoomWorked,
    paused: controls.paused,
    reset: controls.reset,
    elapsedPositive: controls.elapsed > 0,
  };
}

export class CinematicInspectorUnavailableError extends Error {
  name = 'CinematicInspectorUnavailableError';
}

export const CINEMATIC_INSPECTOR_QUEUE_BUDGET_MS = 600000;
export const CINEMATIC_INSPECTOR_REQUEST_BUDGET_MS = 1050000;

// The browser may legitimately take longer than fetch's internal headers
// timeout. Use the caller's one request budget, without silently submitting
// the same expensive browser inspection again after five minutes.
async function requestInspection(url: string, body: string, secret: string, signal: AbortSignal) {
  const endpoint = new URL(url);
  const request = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const req = request(endpoint, {method:'POST', signal,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-AISecEdu-Service-Token':secret}}, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Inspector response interrupted')));
      res.on('end', () => {
        try {
          const headers = new Headers(), status = res.statusCode ?? 502;
          for (const [name, value] of Object.entries(res.headers))
            for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, item);
          resolve(new Response([204,205,304].includes(status) ? null : Buffer.concat(chunks).toString('utf8'), {status, headers}));
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function inspectionRetryDelay(response: Response, attempt: number) {
  const header = response.headers.get('Retry-After');
  const value = header === null ? NaN : /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Math.min(60000, Math.max(1500, Math.min(30000, 1500 * 2 ** Math.min(attempt, 5)), Number.isFinite(value) ? value : 0));
}

async function waitForInspectionCapacity(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const done = () => {signal?.removeEventListener('abort', aborted); resolve();};
    const timer = setTimeout(done, milliseconds);
    const aborted = () => {clearTimeout(timer); signal?.removeEventListener('abort', aborted); reject(signal?.reason);};
    signal?.addEventListener('abort', aborted, {once: true});
    if (signal?.aborted) aborted();
  });
}

export function cinematicOcclusionIssues(evidence: CinematicRenderInspection['evidence'], scene: CinematicScene) {
  const issues: z.infer<typeof issueSchema>[] = [];
  const probes = new Map<string, {
    chapter: number;
    id: string;
    firstAt: number;
    samples: number;
    visibleSamples: number;
    blockers: Map<string, number>;
  }>();
  for (const frame of evidence.frames) {
    const chapter = [...scene.chapters].reverse().find(chapter => chapter.at <= frame.at)!;
    const chapterIndex = scene.chapters.indexOf(chapter);
    const nodes = Array.isArray(frame.diagnostics.nodes) ? frame.diagnostics.nodes : [];
    for (const node of nodes) {
      const probe = node.visibility;
      if (!chapter.focus.includes(node.id) || probe?.method !== 'mesh-rays-v1' ||
          probe.status !== 'sampled' || probe.samples < 3) continue;
      const key = `${chapterIndex}:${node.id}`;
      const aggregate = probes.get(key) ?? {
        chapter: chapterIndex,
        id: node.id,
        firstAt: frame.at,
        samples: 0,
        visibleSamples: 0,
        blockers: new Map<string, number>(),
      };
      aggregate.samples += probe.samples;
      aggregate.visibleSamples += probe.visibleSamples;
      for (const blocker of probe.blockers as Array<{ id: string; samples: number }>)
        aggregate.blockers.set(blocker.id, (aggregate.blockers.get(blocker.id) ?? 0) + blocker.samples);
      probes.set(key, aggregate);
    }
  }
  // A moving child can legitimately pass behind its parent during part of a
  // chapter (for example a stripe on a spinning rotor). Reject only a focus
  // that remains fully hidden across every real browser sample in that
  // chapter; one unlucky boundary frame must not trigger three model repairs.
  for (const probe of probes.values()) {
    if (probe.visibleSamples > 0) continue;
    const node = scene.nodes.find(candidate => candidate.id === probe.id);
    // A transport marker can start inside a valve or an enclosure and emerge
    // in the next chapter. Prove visibility over its declared journey, using
    // real browser samples; chapter boundaries do not create new journeys.
    const journey = node?.role === 'logic' ? node.followConnection : undefined;
    if (journey && evidence.frames.some(frame => frame.at >= journey.start && frame.at <= journey.end &&
      Array.isArray(frame.diagnostics.nodes) && frame.diagnostics.nodes.some((actual: {id?:string;inside?:boolean;visibility?:{method?:string;status?:string;samples?:number;visibleSamples?:number}}) =>
        actual.id === probe.id && actual.inside === true && actual.visibility?.method === 'mesh-rays-v1' &&
        actual.visibility.status === 'sampled' && (actual.visibility.samples ?? 0) >= 3 &&
        (actual.visibility.visibleSamples ?? 0) > 0))) continue;
    const semantic = `${node?.id || ''} ${node?.represents || ''} ${node?.label || ''}`;
    if (/(?:debris|fragment|shard|碎片|断片)/i.test(semantic)) {
      const chapter = scene.chapters[probe.chapter];
      const visibleSiblings = chapter.focus.filter(id => {
        const sibling = scene.nodes.find(candidate => candidate.id === id);
        if (!/(?:debris|fragment|shard|碎片|断片)/i.test(`${sibling?.id || ''} ${sibling?.represents || ''} ${sibling?.label || ''}`)) return false;
        return (probes.get(`${probe.chapter}:${id}`)?.visibleSamples ?? 0) > 0;
      });
      // Physical-destruction quality separately proves the complete fragment
      // count, reveal and trajectories. A summary close-up is still useful
      // when two sibling fragments are visible, even if one listed fragment
      // sits behind an instrument panel at that camera angle.
      if (visibleSiblings.length >= 2) continue;
    }
    const blockers = [...probe.blockers.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .join('、');
    issues.push({ code: 'occluded-focus', at: probe.firstAt, nodes: [probe.id],
      message: `实际浏览器几何取样：本章焦点 ${probe.id} 的 ${probe.samples} 条有效观察射线始终被 ${blockers || '前方表面'} 遮挡。请真正打开剖面、调整遮挡外壳或教学机位，保留原教学对象和过程；改标签或移出focus不能修复可见性。` });
  }
  return issues.slice(0, 80);
}

export function cinematicRenderSamples(scene: CinematicScene) {
  const times = [
    ...new Set([
      0,
      scene.duration,
      ...scene.shots.map((shot) => shot.at),
      ...scene.chapters.flatMap((chapter, index) => [
        chapter.at,
        (chapter.at + (scene.chapters[index + 1]?.at ?? scene.duration)) / 2,
      ]),
    ]),
  ].sort((a, b) => a - b);
  return [
    ...times.map((at) => ({ at, width: 1440 })),
    ...[0, scene.duration / 2, scene.duration].map((at) => ({ at, width: 1024 })),
  ];
}

/** Thin needles, strips and attached arms have useful visible pixels without
 * occupying the same area as an entire device. Only relax their area warning
 * when the exact movie frame and every real decision prove visibility. */
export function cinematicAuxiliaryDetailAdvisory(issue: z.infer<typeof issueSchema>,
  evidence:CinematicRenderInspection['evidence'],scene:CinematicScene):boolean {
  if(issue.code!=='tiny-subject'||issue.at===undefined||!issue.nodes.length||!scene.lab)return false;
  const definitions=new Map(scene.nodes.map(node=>[node.id,node]));
  const visible=(node:any)=>node?.inside===true&&node.visibility?.method==='mesh-rays-v1'&&
    node.visibility.status==='sampled'&&node.visibility.samples>=3&&node.visibility.visibleSamples>0;
  const decisions=evidence.domainDecisions;
  if(!evidence.controls.domainDecisions||!decisions?.length||
    decisions.length!==(scene.lab.model.scene.decisions?.length??0)||
    decisions.some(decision=>!decision.sameCheckpoint||!decision.comparisonRows||decision.alternatives.length<2))return false;
  const frames=evidence.frames.filter(frame=>frame.at===issue.at);
  if(!frames.length)return false;
  for(const frame of frames){
    const nodes=Array.isArray(frame.diagnostics.nodes)?frame.diagnostics.nodes:[];
    if(!nodes.some(node=>definitions.get(node.id)?.role==='primary'&&visible(node)&&node.coverage>=.008))return false;
    for(const id of issue.nodes){
      const definition=definitions.get(id),node=nodes.find(node=>node.id===id);
      const parent=nodes.find(node=>node.id===definition?.parent);
      if(definition?.role!=='logic'||!definition.parent||definition.surfaceText||!visible(node)||
        !parent?.inside||parent.coverage<.003||!node.ndc||
        (node.ndc.right-node.ndc.left)*frame.width/2<2||
        (node.ndc.top-node.ndc.bottom)*frame.width/2<2)return false;
    }
  }
  return decisions.every(decision=>decision.alternatives.every(alternative=>{
    const geometry=alternative.geometry as any[];
    return issue.nodes.every(id=>visible(geometry.find(node=>node.id===id)))&&
      geometry.some(node=>definitions.get(node.id)?.role==='primary'&&visible(node)&&node.coverage>=.008);
  }));
}

/** Independent, executed color facts. A critic cannot negate actual material
 * changes by inspecting movie emissive tracks or guessing colorMix behavior. */
export function cinematicDecisionColorWitnesses(scene:CinematicScene,evidence:CinematicRenderInspection['evidence']){
  if(!scene.lab||evidence.sourceSha256!==createHash('sha256').update(JSON.stringify(scene)).digest('hex')||
    !evidence.controls.domainDecisions||!evidence.domainDecisions?.length||
    evidence.domainDecisions.length!==(scene.lab.model.scene.decisions?.length??0))return [];
  const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
  return evidence.domainDecisions.flatMap(decision=>{
    if(!decision.sameCheckpoint||!decision.comparisonRows||decision.alternatives.length<2)return [];
    return scene.lab!.bindings.filter(binding=>binding.property==='colorMix').flatMap(binding=>{
      const definition=nodes.get(binding.node);
      if(!definition||definition.kind==='group'||definition.surfaceText)return [];
      const alternatives=decision.alternatives.map(alternative=>{
        const geometry=(alternative.geometry as any[]).find(node=>node.id===binding.node);
        const colors=geometry?.materialColors;
        if(!geometry?.inside||geometry.visibility?.method!=='mesh-rays-v1'||geometry.visibility.status!=='sampled'||
          geometry.visibility.samples<3||!(geometry.visibility.visibleSamples>0)||!Array.isArray(colors)||
          !colors.length||colors.some(color=>typeof color!=='string'||!/^[0-9a-f]{6}$/i.test(color)))return;
        return {action:alternative.action,colors};
      });
      if(alternatives.some(item=>!item)||new Set(alternatives.map(item=>JSON.stringify(item!.colors))).size!==alternatives.length)return [];
      return [{node:binding.node,label:[definition.label,definition.represents].filter(Boolean).join(' '),
        decision:decision.id,alternatives:alternatives as Array<{action:string;colors:string[]}>}];
    });
  });
}

export function parseCinematicInspection(value: unknown, scene: CinematicScene) {
  const result = inspectionSchema.parse(value);
  const samples = cinematicRenderSamples(scene);
  if (
    result.evidence.sourceSha256 !==
      createHash('sha256').update(JSON.stringify(scene)).digest('hex') ||
    result.evidence.frames.length !== samples.length ||
    samples.some(
      (sample, index) =>
        sample.at !== result.evidence.frames[index].at ||
        sample.width !== result.evidence.frames[index].width,
    )
  )
    throw new CinematicInspectorUnavailableError(
      '三维浏览器检查的场景或镜头证据不完整，未标记通过',
    );
  // Retain the original finding for diagnostics. Revalidate paid advisories
  // under the same evidence policy as new findings, rather than trusting them.
  const findings=[...new Map([...result.issues,...(result.advisories??[])]
    .map(issue=>[JSON.stringify(issue),issue])).values()];
  const advisories=findings.filter(issue=>cinematicAuxiliaryDetailAdvisory(issue,result.evidence,scene));
  if(advisories.length)result.advisories=advisories;else delete result.advisories;
  result.issues=findings.filter(issue=>!advisories.includes(issue));
  const controls = result.evidence.controls;
  if (
    !result.issues.length &&
    (!controls.playingWhileExploring ||
      !controls.cameraHeld ||
      !controls.zoomWorked ||
      !controls.paused ||
      !controls.reset ||
      controls.elapsed <= 0)
  )
    throw new CinematicInspectorUnavailableError('三维交互检查缺少实际操作证据，未标记通过');
  if(scene.lab&&!result.issues.length&&(!result.evidence.controls.domainDecisions||result.evidence.domainDecisions?.length!==(scene.lab.model.scene.decisions?.length??0)||result.evidence.domainDecisions.some(item=>!item.sameCheckpoint||!item.comparisonRows)))
    throw new CinematicInspectorUnavailableError('三维领域决策缺少同检查点策略选择和真实几何证据');
  const kineticNodes=scene.lab?.bindings.filter(binding=>binding.property==='rotationSpeedY').map(binding=>binding.node)??[];
  if(kineticNodes.length&&!result.issues.length&&result.evidence.domainDecisions?.some(decision=>decision.alternatives.some(alternative=>
    alternative.observationTime!==.5||alternative.motion?.from!==.25||alternative.motion?.to!==.5||
    kineticNodes.some(node=>!alternative.motion?.nodes.some(sample=>sample.node===node&&sample.before.length===3&&sample.after.length===3&&sample.worldBefore.length===4&&sample.worldAfter.length===4)))))
    throw new CinematicInspectorUnavailableError('三维角速度绑定缺少同一观察时间的实际旋转证据');
  // A durable inspection already includes its derived occlusion findings.
  // Revalidating it must preserve the same failures, not multiply them.
  result.issues = [...new Map([...result.issues, ...cinematicOcclusionIssues(result.evidence, scene)]
    .map(issue => [JSON.stringify([issue.code,issue.at,issue.nodes,issue.message]),issue])).values()].slice(0, 160);
  return result;
}

export async function inspectRenderedCinematic(
  scene: CinematicScene,
  signal?: AbortSignal,
): Promise<CinematicRenderInspection> {
  const origin = process.env.CINEMATIC_INSPECTOR_URL || process.env.COURSEWARE_INSPECTOR_URL;
  const secret = process.env.AISECEDU_SERVICE_SECRET;
  if (!origin || !secret)
    throw new CinematicInspectorUnavailableError(
      '三维生成需要已配置的浏览器检查服务，未发布未经画面检查的结果',
    );
  const body = JSON.stringify(scene);
  const started = Date.now();
  let serviceFailures = 0, queueAttempts = 0, networkFailures = 0;
  while (Date.now() - started < CINEMATIC_INSPECTOR_REQUEST_BUDGET_MS) {
    signal?.throwIfAborted();
    const remaining = CINEMATIC_INSPECTOR_REQUEST_BUDGET_MS - (Date.now() - started);
    const timeout = AbortSignal.timeout(Math.max(1, remaining));
    let response: Response;
    try {
      response = await requestInspection(origin.replace(/\/$/, '') + '/inspect-cinematic', body, secret,
        signal ? AbortSignal.any([signal, timeout]) : timeout);
    } catch {
      signal?.throwIfAborted();
      if (Date.now() - started >= CINEMATIC_INSPECTOR_QUEUE_BUDGET_MS)
        throw new CinematicInspectorUnavailableError('三维浏览器检查连接持续失败，保留当前场景等待检查服务恢复');
      networkFailures++;
      await waitForInspectionCapacity(Math.min(
        CINEMATIC_INSPECTOR_QUEUE_BUDGET_MS - (Date.now() - started),
        1500 * 2 ** Math.min(networkFailures - 1, 5), 30000,
      ), signal);
      continue;
    }
    networkFailures = 0;
    signal?.throwIfAborted();
    if (response.status === 429) {
      const queueRemaining = CINEMATIC_INSPECTOR_QUEUE_BUDGET_MS - (Date.now() - started);
      if (queueRemaining <= 0) throw new CinematicInspectorUnavailableError('三维浏览器检查排队仍繁忙，保留当前场景等待后续恢复');
      await response.body?.cancel();
      await waitForInspectionCapacity(Math.min(queueRemaining, inspectionRetryDelay(response, queueAttempts++)), signal);
      if (Date.now() - started >= CINEMATIC_INSPECTOR_QUEUE_BUDGET_MS)
        throw new CinematicInspectorUnavailableError('三维浏览器检查排队仍繁忙，保留当前场景等待后续恢复');
      continue;
    }
    if ([500, 502, 503, 504].includes(response.status) && ++serviceFailures < 3) {
      await response.body?.cancel();
      await waitForInspectionCapacity(Math.min(CINEMATIC_INSPECTOR_REQUEST_BUDGET_MS - (Date.now() - started), 1500 * serviceFailures), signal);
      continue;
    }
    if (!response.ok)
      throw new CinematicInspectorUnavailableError(
        `三维浏览器检查不可用（HTTP ${response.status}），未生成平面替代品`,
      );
    try {
      const value = await response.json();
      signal?.throwIfAborted();
      return parseCinematicInspection(value, scene);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof CinematicInspectorUnavailableError) throw error;
      throw new CinematicInspectorUnavailableError('三维浏览器检查响应不完整，保留当前场景等待检查恢复');
    }
  }
  throw new CinematicInspectorUnavailableError('三维浏览器检查服务繁忙');
}

export function configuredCinematicInspector(signal?: AbortSignal): CinematicRenderInspector | undefined {
  return /^(1|true|yes)$/i.test(process.env.AISECEDU_INTEGRATED || '') ||
    process.env.CINEMATIC_INSPECTOR_URL ||
    process.env.COURSEWARE_INSPECTOR_URL
    ? signal ? scene => inspectRenderedCinematic(scene, signal) : inspectRenderedCinematic
    : undefined;
}

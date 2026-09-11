'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  CircleStop,
  Clock3,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

type Workspace = {
  id: string;
  title: string;
  goal: string;
  status: string;
  quota: Record<string, number>;
  usage?: Record<string, number>;
  remaining?: Record<string, number>;
  state: Record<string, unknown>;
  dojoId: number | null;
};

type Job = {
  id: string;
  kind: string;
  status: string;
  stage: string;
  progress: number;
  result?: Record<string, unknown>;
  error?: string | null;
};

type JobEvent = {
  sequence: number;
  stage: string;
  status: string;
  message: string;
  created?: string;
};

type Candidate = {
  id: string;
  ordinal: number;
  title: string;
  summary: string;
  strategy: string;
  differences: string[];
  materializedArtifactId?: string | null;
};

type CandidateSet = {
  id: string;
  status: string;
  selectedCandidateId?: string | null;
  candidates: Candidate[];
};

type Artifact = {
  id: string;
  title: string;
  status: string;
  currentRevision: number;
};

type WorkspaceActivity = {
  latestCandidateSet?: CandidateSet | null;
  latestArtifact?: Artifact | null;
  latestJob?: Job | null;
  latestJobEvents?: JobEvent[];
  recentJobs?: Job[];
};

type WorkspacePayload = {
  workspace: Workspace;
  activity: WorkspaceActivity;
};

async function bridge<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/integration/aisecedu/${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error || `请求失败（${response.status}）`);
  }
  return body.data;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function modeLabel(value: unknown) {
  return ({
    'learning-path': '学习路线',
    slides: '个人课件',
    'attack-defense-scene': '攻防演示',
    simulation: '模拟练习',
    quiz: '知识测试',
    debate: '交互辩论',
  })[String(value || '')] || '学习内容';
}

function jobLabel(job: Job | null) {
  if (!job) return '准备执行';
  if (job.kind === 'self.candidate.generate') return '理解目标并设计内容';
  if (job.kind === 'artifact.materialize') return '生成可用学习产物';
  if (job.kind === 'artifact.revise') return '按新要求修改产物';
  return job.stage || '执行任务';
}

function workspaceStatusLabel(value: string) {
  return ({
    ACTIVE: '进行中',
    SUBMITTED: '等待教师审核',
    APPROVED: '已通过审核',
    REJECTED: '需要修改',
    ARCHIVED: '已归档',
  } as Record<string, string>)[value] || value;
}

function openPersonalArtifact(artifactId: string) {
  const href = `/learning/artifacts/${encodeURIComponent(artifactId)}?returnTo=/learning/extend`;
  if (window.parent === window) {
    window.location.assign(href);
    return;
  }
  window.parent.postMessage(
    { type: 'aisecedu:open-personal-artifact', artifactId },
    window.location.origin,
  );
}

export default function SecurityLearningPage() {
  const initialized = useRef(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [candidateSet, setCandidateSet] = useState<CandidateSet | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const evidence = useCallback(async (type: string, payload: Record<string, unknown> = {}) => {
    try {
      await bridge('events', {
        method: 'POST',
        body: JSON.stringify({ id: crypto.randomUUID(), type, occurred: new Date().toISOString(), payload }),
      });
    } catch {
      return;
    }
  }, []);

  async function loadWorkspace() {
    const data = await bridge<WorkspacePayload>('self-workspace');
    setWorkspace(data.workspace);
    return data;
  }

  async function waitForJob(initial: Job) {
    let current = initial;
    setJob(current);
    while (['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(current.status)) {
      await sleep(1400);
      const data = await bridge<{ job: Job; events?: JobEvent[] }>(
        `jobs/${encodeURIComponent(current.id)}`,
      );
      current = data.job;
      setJob(current);
      setJobEvents(data.events || []);
    }
    if (current.status !== 'SUCCEEDED') {
      throw new Error(current.error || `任务结束于 ${current.status}`);
    }
    return current;
  }

  async function loadArtifact(artifactId: string) {
    const loaded = await bridge<{ artifact: Artifact }>(`artifacts/${encodeURIComponent(artifactId)}`);
    setArtifact(loaded.artifact);
    return loaded.artifact;
  }

  async function materialize(candidate: Candidate) {
    if (candidate.materializedArtifactId) {
      return loadArtifact(candidate.materializedArtifactId);
    }
    const created = await bridge<{ artifact: Artifact; job: Job }>(
      `candidates/${encodeURIComponent(candidate.id)}/materialize`,
      { method: 'POST', body: '{}' },
    );
    await evidence('self-learning.materialization-requested', {
      candidateId: candidate.id,
      artifactId: created.artifact.id,
    });
    await waitForJob(created.job);
    const loaded = await loadArtifact(created.artifact.id);
    await evidence('self-learning.artifact-ready', { artifactId: loaded.id });
    return loaded;
  }

  async function handleCandidateSet(value: CandidateSet) {
    setCandidateSet(value);
    if (value.candidates.length === 1) {
      await materialize(value.candidates[0]);
    }
  }

  async function generate(goal: string, artifactType: string) {
    const generated = await bridge<{ job: Job; candidateSet: CandidateSet }>(
      'self-workspace/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: goal,
          artifactType,
          candidateCount: 1,
        }),
      },
    );
    await evidence('self-learning.generation-requested', { artifactType, candidateCount: 1 });
    const completed = await waitForJob(generated.job);
    const setId = String(completed.result?.candidateSetId || generated.candidateSet.id);
    const loaded = await bridge<{ candidateSet: CandidateSet }>(
      `candidate-sets/${encodeURIComponent(setId)}`,
    );
    await evidence('self-learning.candidates-ready', { candidateSetId: setId });
    await handleCandidateSet(loaded.candidateSet);
  }

  async function resumeOrStart(data: WorkspacePayload) {
    const activity = data.activity || {};
    setJobEvents(activity.latestJobEvents || []);
    const activeJob =
      activity.latestJob &&
      ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(activity.latestJob.status)
        ? activity.latestJob
        : null;
    if (activeJob) {
      await waitForJob(activeJob);
      await resumeOrStart(await loadWorkspace());
      return;
    }
    if (activity.latestArtifact) {
      if (activity.latestArtifact.status === 'GENERATING') {
        throw new Error('产物生成被中断，请重新运行。');
      }
      setArtifact(activity.latestArtifact);
      setJob(activity.latestJob || null);
      return;
    }
    if (activity.latestCandidateSet?.candidates?.length) {
      await handleCandidateSet(activity.latestCandidateSet);
      return;
    }
    if (activity.latestJob && ['FAILED', 'CANCELED'].includes(activity.latestJob.status)) {
      setJob(activity.latestJob);
      throw new Error(activity.latestJob.error || '上一次执行未完成，请重新运行。');
    }
    await generate(data.workspace.goal, String(data.workspace.state?.artifactType || 'learning-path'));
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setBusy(true);
    loadWorkspace()
      .then(async (data) => {
        await evidence('self-learning.opened', { workspaceId: data.workspace.id });
        await resumeOrStart(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  }, [evidence]);

  async function choose(candidate: Candidate) {
    setBusy(true);
    setError(null);
    try {
      await bridge(`candidates/${encodeURIComponent(candidate.id)}/select`, {
        method: 'POST',
        body: '{}',
      });
      await evidence('self-learning.candidate-selected', { candidateId: candidate.id });
      await materialize(candidate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    if (!artifact || !instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await bridge<{ job: Job }>(`artifacts/${encodeURIComponent(artifact.id)}/revise`, {
        method: 'POST',
        body: JSON.stringify({
          instruction: instruction.trim(),
          expectedRevision: artifact.currentRevision,
        }),
      });
      await waitForJob(created.job);
      const loaded = await loadArtifact(artifact.id);
      await evidence('self-learning.artifact-revised', {
        artifactId: loaded.id,
        revision: loaded.currentRevision,
      });
      setInstruction('');
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!workspace || busy) return;
    setBusy(true);
    setError(null);
    setCandidateSet(null);
    setArtifact(null);
    setJobEvents([]);
    try {
      await generate(workspace.goal, String(workspace.state?.artifactType || 'learning-path'));
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!job || !['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(job.status)) return;
    try {
      const data = await bridge<{ job: Job }>(`jobs/${encodeURIComponent(job.id)}`, { method: 'DELETE' });
      setJob(data.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function submit() {
    if (!artifact) return;
    setBusy(true);
    setError(null);
    try {
      await bridge('self-workspace/submit', {
        method: 'POST',
        body: JSON.stringify({ artifactId: artifact.id }),
      });
      await evidence('self-learning.artifact-submitted', { artifactId: artifact.id });
      setWorkspace((current) => current ? { ...current, status: 'SUBMITTED' } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />正在恢复个人工作区…
        </div>
      </main>
    );
  }

  const running = Boolean(job && ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(job.status));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17283d_0,#080d14_48%)] px-4 py-6 text-slate-100 sm:px-7">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="min-w-0">
            <a href="/guide" target="_top" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" />返回学习智能体
            </a>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">个人工作区 · {modeLabel(workspace.state?.artifactType)}</p>
            <h1 className="mt-2 max-w-4xl text-2xl font-semibold sm:text-3xl">{workspace.title}</h1>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">{workspaceStatusLabel(workspace.status)}</span>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0">
            <article className="ml-auto max-w-3xl rounded-2xl rounded-tr-sm border border-cyan-400/20 bg-cyan-400/5 px-5 py-4">
              <p className="mb-2 text-xs font-semibold text-cyan-300">你的目标</p>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{workspace.goal}</p>
            </article>

            <div className="mt-5 flex gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><BrainCircuit className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1 py-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{artifact ? '学习产物已准备好' : jobLabel(job)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {artifact ? `${artifact.title} · revision ${artifact.currentRevision}` : running ? `${job?.stage || '执行中'} · ${job?.progress || 0}%` : error ? '需要处理' : '智能体会自动完成规划、生成与整理'}
                    </p>
                  </div>
                  {running ? <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-red-400 hover:text-red-300"><CircleStop className="h-4 w-4" />停止</button> : null}
                </div>
                {running ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><i className="block h-full bg-cyan-300 transition-all" style={{ width: `${Math.max(4, job?.progress || 0)}%` }} /></div> : null}
                {jobEvents.length ? (
                  <details className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
                    <summary className="cursor-pointer select-none text-slate-300">查看执行步骤 · {jobEvents.length} 条</summary>
                    <ol className="mt-3 space-y-2 border-l border-slate-800 pl-4">
                      {jobEvents.slice(-12).map((event) => (
                        <li key={`${event.sequence}-${event.stage}`}>
                          <span className="font-medium text-slate-200">{event.message}</span>
                          <span className="ml-2 font-mono text-[10px] uppercase text-slate-500">{event.status}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="ml-12 mt-4 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">
                <p>{error}</p>
                <button type="button" onClick={retry} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300/40 px-3 py-2 text-xs font-semibold disabled:opacity-50"><RotateCcw className="h-4 w-4" />重新运行</button>
              </div>
            ) : null}

            {candidateSet && candidateSet.candidates.length > 1 && !artifact ? (
              <div className="ml-12 mt-5 grid gap-3 sm:grid-cols-2">
                {candidateSet.candidates.map((candidate) => (
                  <button key={candidate.id} type="button" disabled={busy} onClick={() => choose(candidate)} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition hover:border-cyan-300 disabled:opacity-50">
                    <span className="text-xs font-semibold text-cyan-300">方案 {candidate.ordinal} · {candidate.strategy}</span>
                    <strong className="mt-2 block text-sm">{candidate.title}</strong>
                    <span className="mt-2 block text-xs leading-5 text-slate-400">{candidate.summary}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {artifact ? (
              <div className="ml-12 mt-5 border-t border-slate-800 pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{artifact.title}</strong><small className="text-xs text-slate-400">个人草稿 · 可继续用自然语言修改</small></div>
                  <button type="button" onClick={() => openPersonalArtifact(artifact.id)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"><BookOpen className="h-4 w-4" />查看成果</button>
                  {workspace.dojoId ? <button type="button" disabled={busy || workspace.status === 'SUBMITTED'} onClick={submit} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm disabled:opacity-50"><Send className="h-4 w-4" />{workspace.status === 'SUBMITTED' ? '已提交审核' : '提交教师审核'}</button> : null}
                </div>
              </div>
            ) : null}

            <div className="sticky bottom-4 mt-8 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
              <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} disabled={!artifact || busy} rows={2} className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-slate-600 disabled:cursor-not-allowed" placeholder={artifact ? '直接说明要怎样修改，例如：增加一页攻击链图，并把练习改成渐进式提示…' : '智能体完成首版后，可以在这里继续修改…'} />
              <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><Sparkles className="h-3.5 w-3.5" />自然语言会原样传给智能体</span>
                <button type="button" onClick={revise} disabled={!artifact || busy || !instruction.trim()} className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-300 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-950/55 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-cyan-300" />边界与证据</h2>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-slate-400">
              <li>个人草稿默认只对你可见。</li>
              <li>浏览行为只记录参与，不会冒充能力完成。</li>
              <li>正式进度以判题、实验与可核验证据为准。</li>
              <li>提交课程前必须由教师审核。</li>
            </ul>
            <h3 className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-300"><Clock3 className="h-4 w-4" />个人配额余量</h3>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              {Object.entries(workspace.remaining || {}).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-slate-900/80 p-2"><dt className="truncate">{key}</dt><dd className="mt-1 font-mono text-cyan-300">{value.toLocaleString()}</dd></div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}

import { api, request, id, key, ApiError } from './api';
import { blankDraft, WorkspaceStorage } from './storage';
import { mergeEvents } from './events';
import {
  terminal,
  type Artifact,
  type Data,
  type Draft,
  type Job,
  type Thread,
  type WorkspaceState,
} from './types';

export class WorkbenchController {
  storage: WorkspaceStorage;
  private listeners = new Set<() => void>();
  private state: WorkspaceState;
  private epoch = 0;
  private watch?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private cursor: Record<string, string> = {};
  private stop = false;
  private activeJobReads = new Set<string>();
  private pendingSubmit: { signature: string; body: Data; key: string } | null = null;
  private creating?: Promise<Thread>;
  private mutationKeys = new Map<string, string>();
  private catalogLoaded = new Set<string>();

  constructor(owner: string) {
    this.storage = new WorkspaceStorage(owner);
    this.state = {
      booting: true,
      loadingThread: false,
      busy: false,
      online: true,
      threads: [],
      thread: null,
      context: {},
      jobs: [],
      events: {},
      selectedJob: null,
      artifacts: [],
      artifactDetails: {},
      previews: {},
      openArtifacts: [],
      selectedArtifact: null,
      materials: [],
      skills: [],
      draft: this.storage.draft(null),
      uploads: [],
      panel: 'artifacts',
      panelOpen: window.innerWidth > 720 && this.storage.value('panelOpen', true),
      sidebarOpen: false,
      taskCenter: false,
      modal: null,
      error: null,
      notice: null,
      threadFilter: '',
      archived: false,
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  patch = (patch: Partial<WorkspaceState>) => {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  };
  error = (error: unknown) => {
    if (!this.stop) this.patch({ error: error instanceof Error ? error.message : String(error) });
  };
  notify = (notice: string) => this.patch({ notice, error: null });
  async run(action: () => Promise<unknown>) {
    if (this.state.busy) return;
    this.patch({ busy: true, error: null });
    try {
      await action();
    } catch (error) {
      this.error(error);
    } finally {
      this.patch({ busy: false });
    }
  }
  private async mutate(path: string, body: Data = {}, method = 'POST') {
    const signature = JSON.stringify([path, method, body]);
    const token = this.mutationKeys.get(signature) || key();
    this.mutationKeys.set(signature, token);
    const data = await api(path, { method, body, key: token });
    this.mutationKeys.delete(signature);
    return data;
  }
  async boot() {
    try {
      const results = await Promise.allSettled([
        api('/context?view=teacher-shell'),
        this.loadThreads(),
        this.loadArtifacts(),
      ]);
      if (results[0].status === 'rejected') throw results[0].reason;
      this.patch({ context: results[0].value });
      for (const result of results.slice(1))
        if (result.status === 'rejected') this.error(result.reason);
      const threadId = new URLSearchParams(location.search).get('thread');
      if (threadId) await this.activate(threadId, false);
      const query = new URLSearchParams(location.search);
      if (!threadId && query.get('inquiry') === '1') {
        this.setDraft({ learningPattern: 'process-inquiry', text: query.get('prompt') || '创建 AES-128 流程探究式学习项目，先保存草稿。' });
        const course = (this.state.context.teacherDojos || []).find((item: Data) => item.referenceId === query.get('dojo'));
        if (query.has('dojo') && !course) throw new Error('目标课程不存在或无权访问，请重新选择课程。');
        if (course) await this.setScope(String(course.id), query.get('module') ?? '');
        const clean = new URL(location.href);
        for (const name of ['inquiry', 'prompt', 'dojo', 'module']) clean.searchParams.delete(name);
        history.replaceState({}, '', clean);
      }
      const artifact = new URLSearchParams(location.search).get('artifact');
      if (artifact) await this.openArtifact(artifact);
      await this.loadJobs();
      if (new URLSearchParams(location.search).get('tasks') === '1') {
        this.patch({ taskCenter: true });
      }
    } catch (error) {
      this.error(error);
    } finally {
      this.patch({ booting: false });
      this.schedule();
    }
  }
  dispose() {
    this.stop = true;
    this.epoch++;
    this.watch?.abort();
    clearTimeout(this.timer);
  }
  setDraft(patch: Partial<Draft>) {
    const draft = { ...this.state.draft, ...patch };
    this.storage.save(this.state.thread?.id || null, draft);
    this.patch({ draft });
  }
  setPanel(panel: WorkspaceState['panel']) {
    this.patch({ panel, panelOpen: true, taskCenter: false });
    this.storage.set('panelOpen', true);
  }
  togglePanel() {
    this.storage.set('panelOpen', !this.state.panelOpen);
    this.patch({ panelOpen: !this.state.panelOpen });
  }
  async loadThreads(query = this.state.threadFilter, archived = this.state.archived) {
    const data = await api(
      `/threads?limit=200&view=${archived ? 'archived' : 'active'}&q=${id(query)}`,
    );
    if (query === this.state.threadFilter && archived === this.state.archived)
      this.patch({ threads: data.threads || [] });
  }
  filterThreads(query: string, archived = this.state.archived) {
    this.patch({ threadFilter: query, archived });
    void this.loadThreads(query, archived).catch(this.error);
  }
  newThread() {
    this.epoch++;
    this.watch?.abort();
    this.pendingSubmit = null;
    this.patch({
      thread: null,
      loadingThread: false,
      draft: this.storage.draft(null),
      uploads: [],
      sidebarOpen: false,
      taskCenter: false,
      selectedJob: null,
      error: null,
    });
    this.updateUrl(null);
  }
  private updateUrl(threadId: string | null, replace = false) {
    const url = new URL(location.href);
    url.searchParams.set('view', 'conversation');
    url.searchParams.delete('artifact');
    url.searchParams.delete('newProject');
    url.searchParams.delete('tasks');
    if (threadId) url.searchParams.set('thread', threadId);
    else url.searchParams.delete('thread');
    if (location.href !== url.href) history[replace ? 'replaceState' : 'pushState']({}, '', url);
  }
  async activate(threadId: string, navigate = true) {
    const epoch = ++this.epoch;
    this.watch?.abort();
    this.pendingSubmit = null;
    this.patch({
      loadingThread: true,
      error: null,
      sidebarOpen: false,
      taskCenter: false,
      uploads: [],
    });
    try {
      const { thread } = await api(`/threads/${id(threadId)}`);
      if (epoch !== this.epoch || this.stop) return;
      this.patch({
        thread,
        draft: this.storage.draft(threadId, thread.context?.learningPattern?.id),
        selectedJob: thread.harnessJobs?.[0]?.id || null,
      });
      if (navigate) this.updateUrl(threadId);
      this.watchThread(threadId, epoch);
      await this.loadJobs(threadId);
    } finally {
      if (epoch === this.epoch) this.patch({ loadingThread: false });
    }
  }
  private async ensureThread(): Promise<Thread> {
    if (this.state.thread) return this.state.thread;
    if (this.creating) return this.creating;
    const epoch = this.epoch;
    this.creating = this.mutate('/threads', {
      title: this.state.draft.text.trim().slice(0, 70) || '新的教学创作',
      phase: 'COURSE_SETUP',
    })
      .then(({ thread }) => {
        if (epoch !== this.epoch) throw new Error('会话已切换，请回到原会话继续。');
        this.storage.save(thread.id, this.state.draft);
        this.storage.save(null, blankDraft());
        this.patch({ thread, threads: [thread, ...this.state.threads] });
        this.updateUrl(thread.id, true);
        this.watchThread(thread.id, epoch);
        return thread;
      })
      .finally(() => {
        this.creating = undefined;
      });
    return this.creating;
  }
  async refreshThread(threadId = this.state.thread?.id, epoch = this.epoch) {
    if (!threadId) return;
    const data = await api(`/threads/${id(threadId)}`);
    if (epoch === this.epoch && this.state.thread?.id === threadId)
      this.patch({ thread: data.thread });
  }
  private watchThread(threadId: string, epoch: number) {
    this.watch?.abort();
    const controller = new AbortController();
    this.watch = controller;
    void (async () => {
      let after = Number(this.state.thread?.lastEventSequence || 0);
      let failures = 0;
      while (!this.stop && !controller.signal.aborted && epoch === this.epoch) {
        try {
          const data = await api(
            `/threads/${id(threadId)}/events?after=${after}&limit=200&waitMs=15000`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted || epoch !== this.epoch) break;
          if (!Number.isSafeInteger(data.nextCursor) || data.nextCursor < after)
            throw new Error('会话记录暂时无法同步，请刷新读取。');
          after = data.nextCursor;
          this.patch({ online: true });
          failures = 0;
          if (data.events?.length) {
            await this.refreshThread(threadId, epoch);
            await this.loadJobs(threadId);
          }
          if (!data.events?.length) await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          if (controller.signal.aborted || epoch !== this.epoch) break;
          this.patch({ online: false });
          failures++;
          if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            this.error(error);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, Math.min(15000, 1500 * failures)));
        }
      }
    })();
  }
  private schedule() {
    if (this.stop) return;
    this.timer = setTimeout(
      async () => {
        if (!document.hidden) {
          try {
            await this.loadJobs();
            const current = this.state.jobs.filter(
              (job) => job.threadId === this.state.thread?.id && !terminal(job),
            );
            const selected = this.state.jobs.find((job) => job.id === this.state.selectedJob);
            const wanted = [
              ...new Set([...current.map((job) => job.id), ...(selected ? [selected.id] : [])]),
            ];
            await Promise.allSettled(wanted.slice(0, 6).map((jobId) => this.loadEvents(jobId)));
          } catch {
            this.patch({ online: false });
          }
        }
        this.schedule();
      },
      this.state.jobs.some((job) => !terminal(job)) ? 2200 : 9000,
    );
  }
  async loadJobs(threadId?: string) {
    const data = await api(
      `/jobs?view=all&limit=100${threadId ? '&threadId=' + id(threadId) : ''}`,
    );
    const previous = new Map(this.state.jobs.map((job) => [job.id, job]));
    const jobs: Job[] = data.jobs || [];
    const changed = jobs.some(
      (job) => terminal(job) && previous.has(job.id) && !terminal(previous.get(job.id)!),
    );
    const merged = threadId
      ? [...jobs, ...this.state.jobs.filter((job) => job.threadId !== threadId)]
      : jobs;
    this.patch({ jobs: merged, online: true });
    if (changed) {
      await Promise.allSettled([
        this.refreshThread(),
        this.loadArtifacts(),
        ...this.state.openArtifacts.map((artifactId) => this.loadArtifact(artifactId)),
      ]);
    }
  }
  async loadEvents(jobId: string) {
    if (this.activeJobReads.has(jobId)) return;
    this.activeJobReads.add(jobId);
    try {
      for (let page = 0; page < 8; page++) {
        const data = await api(
          `/jobs/${id(jobId)}/events?limit=128${this.cursor[jobId] ? '&cursor=' + id(this.cursor[jobId]) : ''}`,
        );
        this.cursor[jobId] = data.eventCursor || this.cursor[jobId];
        this.patch({
          events: {
            ...this.state.events,
            [jobId]: mergeEvents(this.state.events[jobId] || [], data.events || []),
          },
          jobs:
            data.job && !this.state.jobs.some((job) => job.id === jobId)
              ? [...this.state.jobs, data.job]
              : this.state.jobs.map((job) => (job.id === jobId ? { ...job, ...data.job } : job)),
        });
        if (!data.hasMore) break;
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_ACTIVITY_CURSOR') {
        delete this.cursor[jobId];
        this.patch({ events: { ...this.state.events, [jobId]: [] } });
      } else throw error;
    } finally {
      this.activeJobReads.delete(jobId);
    }
  }
  selectJob(jobId: string) {
    this.patch({ selectedJob: jobId });
    this.setPanel('activity');
    void this.loadEvents(jobId).catch(this.error);
  }
  async send(extra: Data = {}) {
    await this.run(async () => {
      if (this.state.uploads.length) throw new Error('请等待文件上传完成，或移除失败的上传。');
      const draft = this.state.draft;
      const composerSubmission = extra.content === undefined;
      const content = extra.content ?? draft.text.trim();
      if (!content) return;
      const thread = await this.ensureThread();
      const epoch = this.epoch;
      const active = this.state.jobs.find((job) => job.threadId === thread.id && !terminal(job));
      const signature = JSON.stringify([thread.id, content, draft, extra]);
      const persisted = this.storage.value<typeof this.pendingSubmit>('pending-submit', null);
      if (this.pendingSubmit?.signature !== signature)
        this.pendingSubmit =
          persisted?.signature === signature
            ? persisted
            : {
                signature,
                key: key(),
                body: {
                  content: [...draft.skills.map((skill) => '/' + skill), content].join('\n'),
                  executionMode: draft.mode,
                  learningPattern: draft.learningPattern,
                  sourceRefs: draft.sources.map((source) => ({ type: source.type, id: source.id })),
                  artifactType: draft.artifactType,
                  candidateMode: 'auto',
                  candidateCount: 3,
                  ...(active ? { delivery: draft.delivery, expectedJobId: active.id } : {}),
                  ...extra,
                },
              };
      this.storage.set('pending-submit', this.pendingSubmit);
      const data = await this.mutateMessage(thread.id, this.pendingSubmit!);
      this.pendingSubmit = null;
      this.storage.set('pending-submit', null);
      const nextDraft =
        composerSubmission && this.state.draft === draft
          ? { ...blankDraft(), mode: draft.mode, learningPattern: draft.learningPattern }
          : this.state.draft;
      this.storage.save(thread.id, nextDraft);
      if (epoch === this.epoch && this.state.thread?.id === thread.id) {
        this.patch({ thread: data.thread || thread, draft: nextDraft });
        if (data.job) {
          this.patch({
            jobs: [data.job, ...this.state.jobs.filter((job) => job.id !== data.job.id)],
            selectedJob: data.job.id,
          });
          void this.loadEvents(data.job.id).catch(this.error);
        }
      }
      await this.loadThreads();
    });
  }
  private mutateMessage(threadId: string, submission: { key: string; body: Data }) {
    return api(`/threads/${id(threadId)}/messages`, {
      method: 'POST',
      body: submission.body,
      key: submission.key,
    });
  }
  async updateThread(threadId: string, body: Data) {
    await this.mutate(`/threads/${id(threadId)}`, body, 'PATCH');
    await Promise.all([
      this.loadThreads(),
      this.state.thread?.id === threadId ? this.refreshThread() : Promise.resolve(),
    ]);
  }
  async setScope(dojoId: string, moduleIndex?: string) {
    const thread = await this.ensureThread();
    await this.updateThread(thread.id, {
      dojoId: dojoId ? Number(dojoId) : null,
      moduleIndex: moduleIndex !== undefined && moduleIndex !== '' ? Number(moduleIndex) : null,
    });
  }
  async fork(threadId: string) {
    const data = await this.mutate(`/threads/${id(threadId)}/fork`);
    await this.loadThreads();
    await this.activate(data.thread.id);
    this.notify('已创建分支，可以尝试另一种方向。');
  }
  async editQueue(jobId: string, content: string, revision: number) {
    const data = await this.mutate(`/jobs/${id(jobId)}/input`, { content, revision }, 'PATCH');
    if (data.thread?.id === this.state.thread?.id) this.patch({ thread: data.thread });
  }
  async cancel(jobId: string) {
    await this.mutate(`/jobs/${id(jobId)}`, {}, 'DELETE');
    await Promise.all([this.loadJobs(), this.refreshThread()]);
  }
  async retry(jobId: string) {
    await this.mutate(`/jobs/${id(jobId)}/retry`, {
      idempotencyKey: this.mutationKeys.get('retry:' + jobId) || this.retryToken(jobId),
    });
    this.mutationKeys.delete('retry:' + jobId);
    delete this.cursor[jobId];
    this.patch({ events: { ...this.state.events, [jobId]: [] } });
    await Promise.all([this.loadJobs(), this.refreshThread()]);
    this.selectJob(jobId);
  }
  private retryToken(jobId: string) {
    const token = key();
    this.mutationKeys.set('retry:' + jobId, token);
    return token;
  }
  async loadCatalog(kind: 'sources' | 'skills', force = false) {
    if (!force && this.catalogLoaded.has(kind)) return;
    const data = await api(kind === 'sources' ? '/materials?limit=200' : '/skills');
    this.patch(
      kind === 'sources'
        ? { materials: data.materials || [] }
        : { skills: data.skills || data.catalog || [] },
    );
    this.catalogLoaded.add(kind);
  }
  openCatalog(kind: 'sources' | 'skills') {
    this.patch({ modal: kind });
    void this.loadCatalog(kind).catch(this.error);
  }
  async upload(files: File[]) {
    const thread = await this.ensureThread();
    const epoch = this.epoch;
    for (const file of files) {
      if (epoch !== this.epoch) break;
      const uploadId = key();
      this.patch({
        uploads: [...this.state.uploads, { id: uploadId, name: file.name, state: 'uploading' }],
      });
      try {
        const form = new FormData();
        form.set('file', file);
        form.set('threadId', thread.id);
        form.set('conversationUpload', '1');
        form.set('stageOnly', '1');
        form.set('askIntent', '0');
        const data = await api('/materials', { method: 'POST', body: form });
        if (!data.materialId) throw new Error('上传未返回文件标识，请重试。');
        if (epoch !== this.epoch) break;
        this.setDraft({
          sources: [
            ...this.state.draft.sources,
            { id: String(data.materialId), name: file.name, type: 'material' },
          ],
        });
        this.patch({ uploads: this.state.uploads.filter((upload) => upload.id !== uploadId) });
        this.catalogLoaded.delete('sources');
      } catch (error) {
        if (epoch === this.epoch)
          this.patch({
            uploads: this.state.uploads.map((upload) =>
              upload.id === uploadId
                ? {
                    ...upload,
                    state: 'error',
                    error: error instanceof Error ? error.message : '上传未完成',
                  }
                : upload,
            ),
          });
      }
    }
  }
  async loadArtifacts() {
    const data = await api('/artifacts');
    this.patch({ artifacts: data.artifacts || [] });
  }
  async loadArtifact(artifactId: string): Promise<Artifact> {
    const data = await api(`/artifacts/${id(artifactId)}`);
    const previous = this.state.artifactDetails[artifactId];
    const changed = previous && previous.currentRevision !== data.artifact.currentRevision;
    this.patch({
      artifactDetails: { ...this.state.artifactDetails, [artifactId]: data.artifact },
      ...(changed ? { previews: { ...this.state.previews, [artifactId]: '' } } : {}),
    });
    return data.artifact;
  }
  async openArtifact(artifactId: string) {
    this.patch({
      openArtifacts: [...new Set([...this.state.openArtifacts, artifactId])],
      selectedArtifact: artifactId,
    });
    this.setPanel('artifacts');
    await this.loadArtifact(artifactId);
  }
  closeArtifact(artifactId: string) {
    const open = this.state.openArtifacts.filter((value) => value !== artifactId);
    this.patch({
      openArtifacts: open,
      selectedArtifact:
        this.state.selectedArtifact === artifactId
          ? open.at(-1) || null
          : this.state.selectedArtifact,
    });
  }
  async launchPreview(artifact: Artifact) {
    if (artifact.type === 'learning-flow') {
      this.patch({ previews: { ...this.state.previews, [artifact.id]: `/teacher/artifacts/${id(artifact.id)}?embed=1` } });
      return;
    }
    const data = await this.mutate('/runtime/launch', {
      role: 'teacher',
      dojoId: artifact.dojoId,
      moduleIndex: artifact.moduleIndex,
      target: `/prep/${id(artifact.id)}`,
    });
    const url = new URL(data.launchUrl, location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('预览地址无效。');
    this.patch({ previews: { ...this.state.previews, [artifact.id]: url.href } });
  }
  async revise(artifact: Artifact, instruction: string) {
    const data = await this.mutate(`/artifacts/${id(artifact.id)}/revise`, {
      instruction,
      expectedRevision: artifact.currentRevision,
    });
    if (data.job)
      this.patch({
        jobs: [data.job, ...this.state.jobs.filter((job) => job.id !== data.job.id)],
        selectedJob: data.job.id,
      });
    this.notify('局部修改已提交，原版本保留。');
    await this.loadArtifact(artifact.id);
  }
  async restore(artifact: Artifact, sourceRevision: number) {
    await this.mutate(`/artifacts/${id(artifact.id)}/restore`, {
      sourceRevision,
      expectedRevision: artifact.currentRevision,
    });
    this.patch({ previews: { ...this.state.previews, [artifact.id]: '' } });
    await this.loadArtifact(artifact.id);
    this.notify('已从所选版本创建新草稿。');
  }
  async approve(messageId: number, proposalIndex: number, decision: string) {
    const threadId = this.state.thread?.id;
    if (!threadId) return;
    await this.mutate(
      `/threads/${id(threadId)}/messages/${messageId}/tool-proposals/${proposalIndex}/decision`,
      {
        decision,
        confirmed: true,
        approvalRequest: this.state.thread?.messages?.find((message) => message.id === messageId)
          ?.metadata.toolProposalApprovalRequests?.[String(proposalIndex)],
      },
    );
    await this.refreshThread(threadId);
  }
  async selectOption(messageId: number, optionId: string, generationPlan?: Data) {
    const threadId = this.state.thread?.id;
    if (!threadId) return;
    const selection = { sourceMessageId: messageId, optionId };
    const data = await this.mutate(
      `/threads/${id(threadId)}/messages/${messageId}/generation-options/${id(optionId)}/select`,
    );
    if (data.proposal?.tool === 'candidate.generate') {
      const args = data.proposal.arguments || {};
      await this.mutate(`/threads/${id(threadId)}/messages`, {
        agentContinuation: true,
        action: 'generate',
        content: args.prompt,
        artifactType: args.artifactType,
        candidateMode: Number(args.candidateCount || 1) > 1 ? 'multiple' : 'single',
        candidateCount: Number(args.candidateCount || 1),
        sourceRefs: args.sourceRefs || [],
        generationSelection: selection,
      });
    } else if (data.proposal?.tool) {
      if (data.proposal.tool === 'challenge.generate' && !generationPlan)
        throw new Error('请先审阅并确认每道题的标题与难度。');
      const action = await this.mutate('/agent-tools/execute', {
        threadId,
        tool: data.proposal.tool,
        arguments: data.proposal.arguments || {},
        confirmed: Boolean(data.proposal.requiresConfirmation),
        sourceJobId: data.sourceJobId,
        generationSelection: selection,
        generationPlan,
      });
      if (action.action?.id) {
        let current = action.action;
        for (
          let attempt = 0;
          attempt < 12 && ['PENDING', 'QUEUED', 'RUNNING'].includes(current.status);
          attempt++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          current = (await api(`/agent-tools/actions/${id(current.id)}`)).action;
        }
        if (current.status === 'FAILED')
          throw new Error(current.error || '方案执行失败，可在任务中心继续。');
      }
    }
    await Promise.all([this.refreshThread(threadId), this.loadJobs()]);
  }
  async saveAppearance(appearance: string, palette: string) {
    await request('/users/settings', {
      method: 'PATCH',
      body: { preferences: { appearance, palette } },
    });
    window.AISecEduUI?.applyAppearance(appearance, palette, true);
    this.notify('外观已保存。');
  }
}

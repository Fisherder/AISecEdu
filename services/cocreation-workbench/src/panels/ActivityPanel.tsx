import { useMemo, useState } from 'react';
import {
  Activity,
  Terminal,
  Wrench,
  Workflow,
  BrainCircuit,
  Copy,
  Filter,
  ArrowUpRight,
  FileCode2,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { projectActivity } from '../core/events';
import { terminal, type ActivityItem } from '../core/types';
import { Button, IconButton, Empty, Status, Code } from '../components/ui';

export function ActivityRow({ item }: { item: ActivityItem }) {
  const { controller: c } = useWorkbench();
  const Icon =
    (
      {
        command: Terminal,
        tool: Wrench,
        workflow: Workflow,
        reasoning: BrainCircuit,
        artifact: FileCode2,
      } as any
    )[item.kind] || Activity;
  const content = item.content;
  return (
    <details className={`activity-row ${item.status}`}>
      <summary>
        <Icon size={15} />
        <span>
          <strong>{item.title || item.kind}</strong>
          {item.command && <code>{item.command}</code>}
        </span>
        <Status status={item.status} />
      </summary>
      <div className="activity-detail">
        {item.cwd && (
          <div className="quiet">
            目录 <code>{item.cwd}</code>
          </div>
        )}
        {item.command && (
          <div className="command-line">
            <code>$ {item.command}</code>
            <IconButton
              label="复制命令"
              onClick={() => void navigator.clipboard.writeText(item.command!).catch(c.error)}
            >
              <Copy size={13} />
            </IconButton>
          </div>
        )}
        {item.input !== undefined && (
          <section>
            <h4>工具输入</h4>
            <Code value={item.input} />
          </section>
        )}
        {content && (
          <section>
            <h4>{item.kind === 'reasoning' ? '模型返回的推理摘要' : '过程记录'}</h4>
            <Code value={content} />
          </section>
        )}
        {item.output && (
          <section>
            <h4>输出</h4>
            <Code value={item.output} />
          </section>
        )}
        {item.exitCode !== undefined && (
          <div className="exit-code">
            退出码 <strong>{item.exitCode}</strong>
          </div>
        )}
        {item.usage && <Code value={item.usage} />}
        {item.startedAt && item.completedAt && (
          <small className="quiet">
            耗时 {Math.max(0, (item.completedAt - item.startedAt) / 1000).toFixed(1)} 秒
          </small>
        )}
      </div>
    </details>
  );
}
export function ActivityPanel() {
  const { state, controller: c } = useWorkbench();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const jobs = state.jobs.filter(
    (job) => job.threadId === state.thread?.id || job.id === state.selectedJob,
  );
  const job = state.jobs.find((job) => job.id === state.selectedJob) || jobs[0];
  const items = useMemo(
    () => (job ? projectActivity(job.id, state.events[job.id] || [], terminal(job)) : []),
    [job, state.events],
  );
  const filtered = items.filter(
    (item) =>
      item.kind !== 'message' &&
      (filter === 'all' || filter === item.kind) &&
      (!query ||
        `${item.title} ${item.command || ''} ${item.output || ''} ${item.content || ''}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <div className="activity-panel">
      <div className="panel-toolbar">
        <select
          aria-label="选择任务执行记录"
          value={job?.id || ''}
          onChange={(event) => c.selectJob(event.target.value)}
        >
          <option value="" disabled>
            选择任务
          </option>
          {jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title || item.kind} · {item.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <IconButton label="打开任务中心" onClick={() => c.patch({ taskCenter: true })}>
          <ArrowUpRight size={16} />
        </IconButton>
      </div>
      {job && (
        <div className="activity-job">
          <Status status={job.status} />
          <span>{job.stage || '任务执行'}</span>
          {Number.isFinite(job.progress) && (
            <progress aria-label="任务进度" max={100} value={job.progress} />
          )}
          {['FAILED', 'CANCELED'].includes(job.status) && (
            <Button onClick={() => void c.run(() => c.retry(job.id))}>从保留结果继续</Button>
          )}
        </div>
      )}
      <div className="activity-filters">
        <Filter size={14} />
        <select
          aria-label="执行记录类型"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">全部记录</option>
          <option value="workflow">计划与流程</option>
          <option value="tool">工具调用</option>
          <option value="command">运行命令</option>
          <option value="reasoning">推理摘要</option>
          <option value="artifact">成品</option>
        </select>
        <input
          aria-label="搜索执行记录"
          placeholder="搜索输出…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="panel-scroll">
        {job?.modelRoute?.invocationStatus && (
          <details className="usage-summary">
            <summary>模型与用量 · 最近一次调用</summary>
            <p>{job.modelRoute.actualModel}</p>
            {job.modelRoute.usage && <Code value={job.modelRoute.usage} />}
            {Number.isFinite(job.modelRoute.latencyMs) && (
              <small>耗时 {(job.modelRoute.latencyMs / 1000).toFixed(1)} 秒</small>
            )}
          </details>
        )}
        {filtered.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
        {!filtered.length && (
          <Empty
            icon={<Activity size={26} />}
            title={job ? '等待执行记录' : '执行过程会显示在这里'}
          >
            <p>
              {job
                ? '记录来自后台任务。正在等待新的事件。'
                : '计划、工具调用、命令输出与结果会随任务更新。'}
            </p>
          </Empty>
        )}
      </div>
      <footer className="panel-note">仅显示后台实际返回的执行事件</footer>
    </div>
  );
}

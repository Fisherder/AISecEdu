import { useState } from 'react';
import {
  ListTodo,
  Search,
  ArrowUpRight,
  RotateCcw,
  Square,
  Activity,
  MessageSquare,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { dateLabel, terminal, typeLabels } from '../core/types';
import { Button, Empty, IconButton, Status } from './ui';

export function TaskCenter() {
  const { state, controller: c } = useWorkbench();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const rows = state.jobs.filter(
    (job) =>
      (!query ||
        `${job.title || ''} ${job.kind} ${job.id}`.toLowerCase().includes(query.toLowerCase())) &&
      (filter === 'all' ||
        (filter === 'running' && !terminal(job)) ||
        (filter === 'failed' && ['FAILED', 'CANCELED'].includes(job.status)) ||
        (filter === 'done' && job.status === 'SUCCEEDED')),
  );
  return (
    <section className="task-center">
      <header>
        <div>
          <ListTodo size={23} />
          <h1>任务中心</h1>
        </div>
        <p>任务在后台持续执行。可以查看记录、补充要求或从保留结果继续。</p>
      </header>
      <div className="task-filters">
        <div className="segmented">
          {[
            ['all', '全部'],
            ['running', '进行中'],
            ['failed', '需处理'],
            ['done', '已完成'],
          ].map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="搜索任务"
            placeholder="搜索任务…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="task-list">
        {rows.map((job) => (
          <article className="task-row" key={job.id}>
            <div className="task-icon">
              <Activity size={18} />
            </div>
            <div className="task-info">
              <strong>{job.title || typeLabels[job.kind] || job.kind}</strong>
              <p>{job.message || job.stage || '已保存执行记录'}</p>
              <small>
                {dateLabel(job.created)} {job.id.slice(0, 8)}
              </small>
              {job.error && (
                <details>
                  <summary>查看失败原因</summary>
                  <pre>
                    {typeof job.error === 'string' ? job.error : JSON.stringify(job.error, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            <Status status={job.status} />
            <div className="task-actions">
              <IconButton label="查看执行过程" onClick={() => c.selectJob(job.id)}>
                <Activity size={15} />
              </IconButton>
              {job.threadId && (
                <IconButton
                  label="回到任务会话"
                  onClick={() => void c.activate(job.threadId!).catch(c.error)}
                >
                  <MessageSquare size={15} />
                </IconButton>
              )}
              {['FAILED', 'CANCELED'].includes(job.status) && (
                <Button disabled={state.busy} onClick={() => void c.run(() => c.retry(job.id))}>
                  <RotateCcw size={14} />
                  继续
                </Button>
              )}
              {!terminal(job) && (
                <IconButton
                  label="停止任务"
                  disabled={state.busy}
                  onClick={() => void c.run(() => c.cancel(job.id))}
                >
                  <Square size={14} />
                </IconButton>
              )}
            </div>
          </article>
        ))}
        {!rows.length && (
          <Empty icon={<ListTodo size={28} />} title="这里没有匹配的任务">
            <p>提交创作要求后，任务和执行状态会显示在这里。</p>
          </Empty>
        )}
      </div>
      <p className="quiet task-limit">显示最近 {state.jobs.length} 项任务</p>
    </section>
  );
}

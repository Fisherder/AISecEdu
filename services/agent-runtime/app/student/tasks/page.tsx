'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type TaskState = 'not-started' | 'in-progress' | 'completed';

interface StudentTask {
  id: string;
  title: string;
  instructions: string;
  courseTitle: string;
  lessonTitle: string;
  classroomId: string;
  dueAt: number | null;
  completionRule: { requireAllScenes: boolean; minQuizScore: number | null };
  progress: {
    state: TaskState;
    completionRate: number;
    completedScenes: number;
    totalScenes: number;
    averageQuizScore: number | null;
    overdue: boolean;
  };
}

const META: Record<TaskState, { label: string; color: string; border: string }> = {
  'not-started': { label: '未开始', color: 'text-slate-400', border: 'border-slate-700' },
  'in-progress': { label: '进行中', color: 'text-cyan-300', border: 'border-cyan-400/20' },
  completed: { label: '已完成', color: 'text-emerald-300', border: 'border-emerald-400/20' },
};

export default function StudentTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/student/tasks');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '任务加载失败');
      setTasks(payload.tasks ?? []);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '任务加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sync(task: StudentTask, enter = false) {
    setBusyId(task.id);
    try {
      const response = await fetch(`/api/student/tasks/${task.id}`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '同步失败');
      if (enter) router.push(`/classroom/${task.classroomId}`);
      else await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '同步失败');
    } finally {
      setBusyId(null);
    }
  }

  const pending = tasks.filter((task) => task.progress.state !== 'completed');
  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-[11px] tracking-[0.16em] text-cyan-300">ASSIGNED LEARNING</div>
          <h1 className="mt-2 text-2xl font-semibold">我的学习任务</h1>
          <p className="mt-2 text-sm text-slate-400">
            进入课堂后，场景学习与测验提交会自动成为完成证据。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-cyan-400/40"
        >
          同步最新进度
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Metric label="全部任务" value={tasks.length} />
        <Metric label="待完成" value={pending.length} accent="text-cyan-300" />
        <Metric label="已完成" value={tasks.length - pending.length} accent="text-emerald-300" />
      </div>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <Empty text="正在读取任务与课堂证据…" />
      ) : tasks.length === 0 ? (
        <Empty text="老师还没有布置任务。你也可以去“自主学习”生成自己的学习包。" />
      ) : (
        <div className="mt-5 space-y-3">
          {tasks.map((task) => {
            const meta = META[task.progress.state];
            const percent = Math.round(task.progress.completionRate * 100);
            return (
              <article
                key={task.id}
                className={`rounded-3xl border ${meta.border} bg-slate-900/80 p-5`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full bg-slate-950 px-2.5 py-1 text-[10px] ${meta.color}`}
                      >
                        {task.progress.overdue ? '已逾期 · ' : ''}
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-slate-600">{task.courseTitle}</span>
                    </div>
                    <h2 className="mt-3 text-base font-medium text-slate-100">{task.title}</h2>
                    <div className="mt-1 text-xs text-slate-500">学习内容：{task.lessonTitle}</div>
                    {task.instructions && (
                      <p className="mt-3 rounded-xl bg-slate-950/60 p-3 text-xs leading-6 text-slate-400">
                        {task.instructions}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-500">
                      <span>
                        {task.dueAt
                          ? `截止：${new Date(task.dueAt).toLocaleString()}`
                          : '无截止时间'}
                      </span>
                      <span>
                        要求：完成全部 {task.progress.totalScenes} 个场景
                        {task.completionRule.minQuizScore == null
                          ? ''
                          : `，测验均分 ≥ ${task.completionRule.minQuizScore}`}
                      </span>
                      <span>
                        当前测验：
                        {task.progress.averageQuizScore == null
                          ? '暂无'
                          : `${task.progress.averageQuizScore} 分`}
                      </span>
                    </div>
                  </div>
                  <div className="w-full lg:w-64">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>
                        {task.progress.completedScenes}/{task.progress.totalScenes} 个场景
                      </span>
                      <span>{percent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void sync(task, true)}
                        disabled={busyId === task.id}
                        className="flex-1 rounded-xl bg-cyan-400 px-3 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                      >
                        {task.progress.state === 'not-started' ? '开始学习' : '继续学习'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void sync(task)}
                        disabled={busyId === task.id}
                        className="rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-300 disabled:opacity-50"
                      >
                        检查
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = 'text-slate-100',
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-900 p-4">
      <div className={`text-2xl font-semibold ${accent}`}>{value}</div>
      <div className="mt-1 text-[10px] text-slate-600">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

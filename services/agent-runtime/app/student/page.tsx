'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type LearnerState = 'not-started' | 'on-track' | 'at-risk' | 'completed';

interface CapabilityMetric {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  score: number | null;
  confidence: 'none' | 'low' | 'medium' | 'high';
  evidenceCount: number;
  evidenceLabels: string[];
}

interface DashboardData {
  learner: { id: string; username: string; displayName: string };
  summary: {
    courseCount: number;
    publishedLessonCount: number;
    evidenceEventCount: number;
    state: LearnerState;
    completionRate: number;
    averageQuizScore: number | null;
  };
  insight: {
    state: LearnerState;
    completionRate: number;
    completedScenes: number;
    totalScenes: number;
    averageQuizScore: number | null;
    quizAttemptCount: number;
    capabilities: CapabilityMetric[];
    weakestCapability: CapabilityMetric | null;
    nextAction: {
      kind: string;
      title: string;
      reason: string;
      classroomId?: string;
      sceneId?: string;
    };
    lastActiveAt: number | null;
  };
  courses: Array<{
    id: string;
    title: string;
    description?: string;
    courseCode?: string;
    state: LearnerState;
    completionRate: number;
    completedScenes: number;
    totalScenes: number;
    averageQuizScore: number | null;
    lessons: Array<{
      id: string;
      title: string;
      classroomId: string;
      order: number;
      state: LearnerState;
      completionRate: number;
      completedScenes: number;
      totalScenes: number;
      averageQuizScore: number | null;
    }>;
  }>;
}

const STATE_META: Record<LearnerState, { label: string; color: string; bg: string }> = {
  'not-started': { label: '等待开始', color: '#94a3b8', bg: 'rgba(100,116,139,.14)' },
  'on-track': { label: '学习中', color: '#38bdf8', bg: 'rgba(14,165,233,.12)' },
  'at-risk': { label: '建议复习', color: '#fb7185', bg: 'rgba(244,63,94,.12)' },
  completed: { label: '已完成', color: '#34d399', bg: 'rgba(16,185,129,.12)' },
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function StudentDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/student/dashboard')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '加载失败');
        if (!cancelled) setData(payload as DashboardData);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <StateCard tone="error" title="学习数据加载失败" detail={error} />;
  if (!data) return <StateCard title="正在生成你的学习驾驶舱…" detail="汇总课程、进度与能力证据" />;

  const actionUrl = data.insight.nextAction.classroomId
    ? `/classroom/${data.insight.nextAction.classroomId}`
    : undefined;
  const activeCourse =
    data.courses.find((course) => course.state === 'on-track' || course.state === 'at-risk') ??
    data.courses[0];

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 text-[11px] tracking-[0.16em] text-cyan-300">
            PERSONAL LEARNING COMMAND
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            你好，{data.learner.displayName}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            今天不追排名，只看你离自己的目标又近了多少。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1.5 text-cyan-200">
            {data.summary.courseCount} 门课程
          </span>
          <span className="rounded-full border border-indigo-300/15 bg-indigo-400/10 px-3 py-1.5 text-indigo-200">
            {data.summary.publishedLessonCount} 个课堂
          </span>
          <span className="rounded-full border border-emerald-300/15 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
            {data.summary.evidenceEventCount} 条证据
          </span>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickEntry
          href="/student/courses"
          eyebrow="MY LEARNING"
          title="继续课程学习"
          detail="查看课程、章节与个人学习包"
          color="cyan"
        />
        <QuickEntry
          href="/student/tasks"
          eyebrow="TEACHER ASSIGNED"
          title="完成教师任务"
          detail="课堂过程自动记录为完成证据"
          color="cyan"
        />
        <QuickEntry
          href="/student/self-study"
          eyebrow="SELF DIRECTED"
          title="与学习智能体对话"
          detail="答疑、规划、练习或按需生成学习包"
          color="violet"
        />
        <QuickEntry
          href="/student/review"
          eyebrow="FORMATIVE COACH"
          title="查看 AI 学习评价"
          detail="基于真实证据给出下一步建议"
          color="emerald"
        />
      </div>

      {data.courses.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-400/[0.04] px-6 py-14 text-center">
          <div className="text-lg text-slate-200">还没有加入课程</div>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            请向老师获取课程加入链接。你也可以先创建一个个人学习包，学习证据同样会进入 AI 评价。
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/student/self-study"
              className="inline-flex rounded-xl bg-violet-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
            >
              询问学习智能体
            </Link>
            <Link
              href="/student/courses"
              className="inline-flex rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300"
            >
              查看我的内容
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <section className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.12] via-slate-900 to-indigo-400/[0.08] p-6">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative">
                <div className="text-[10px] tracking-[0.16em] text-cyan-300">NEXT BEST ACTION</div>
                <h2 className="mt-3 text-xl font-semibold text-slate-100">
                  {data.insight.nextAction.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  {data.insight.nextAction.reason}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {actionUrl ? (
                    <Link
                      href={actionUrl}
                      className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                      进入课堂 →
                    </Link>
                  ) : (
                    <span className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400">
                      等待教师发布进阶任务
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    当前总进度 {percent(data.insight.completionRate)}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/[0.07] bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">学习状态</div>
                  <div className="mt-1 text-xs text-slate-500">基于过程证据实时更新</div>
                </div>
                <StateBadge state={data.insight.state} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <MiniMetric
                  label="已学习"
                  value={`${data.insight.completedScenes}/${data.insight.totalScenes}`}
                />
                <MiniMetric
                  label="测验均分"
                  value={
                    data.insight.averageQuizScore == null ? '—' : `${data.insight.averageQuizScore}`
                  }
                />
                <MiniMetric label="测验次数" value={`${data.insight.quizAttemptCount}`} />
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-950">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400"
                  style={{ width: percent(data.insight.completionRate) }}
                />
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
            <section className="rounded-3xl border border-white/[0.07] bg-slate-900/80 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-medium">新六维能力画像</h2>
                  <p className="mt-1 text-xs text-slate-500">只展示已有证据；空轴不是零分。</p>
                </div>
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] text-slate-500">
                  可解释画像 v1
                </span>
              </div>
              <CapabilityRadar capabilities={data.insight.capabilities} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {data.insight.capabilities.map((metric) => (
                  <div key={metric.id} className="rounded-xl bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300">{metric.shortLabel}</span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: metric.score == null ? '#475569' : metric.color }}
                      >
                        {metric.score ?? '待积累'}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-600">
                      {metric.evidenceCount} 条证据 · {confidenceLabel(metric.confidence)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/[0.07] bg-slate-900/80 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-medium">课前—课中—课后闭环</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    前一阶段的证据会成为下一阶段的输入。
                  </p>
                </div>
                {activeCourse && (
                  <span className="text-xs text-cyan-300">{activeCourse.title}</span>
                )}
              </div>
              <LearningLoop
                state={data.insight.state}
                hasQuiz={data.insight.quizAttemptCount > 0}
              />

              <div className="mt-5 border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-medium text-slate-200">我的课程</h3>
                <div className="mt-3 space-y-3">
                  {data.courses.map((course) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function QuickEntry({
  href,
  eyebrow,
  title,
  detail,
  color,
}: {
  href: string;
  eyebrow: string;
  title: string;
  detail: string;
  color: 'cyan' | 'violet' | 'emerald';
}) {
  const tone = {
    cyan: 'border-cyan-300/10 bg-cyan-400/[0.05] text-cyan-300',
    violet: 'border-violet-300/10 bg-violet-400/[0.05] text-violet-300',
    emerald: 'border-emerald-300/10 bg-emerald-400/[0.05] text-emerald-300',
  }[color];
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${tone}`}
    >
      <div className="text-[9px] tracking-[0.14em] opacity-80">{eyebrow}</div>
      <div className="mt-2 text-sm font-medium text-slate-200">{title} →</div>
      <div className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</div>
    </Link>
  );
}

function CourseCard({ course }: { course: DashboardData['courses'][number] }) {
  const [open, setOpen] = useState(course.state === 'on-track' || course.state === 'at-risk');
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-slate-200">{course.title}</div>
          <div className="mt-1 text-[10px] text-slate-500">
            {course.lessons.length} 个课堂 · {course.completedScenes}/{course.totalScenes} 个场景
          </div>
        </div>
        <div className="w-24">
          <div className="mb-1 text-right text-[10px] text-slate-500">
            {percent(course.completionRate)}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-cyan-400" style={{ width: percent(course.completionRate) }} />
          </div>
        </div>
        <span className="text-slate-600">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3 py-2">
          {course.lessons.length === 0 ? (
            <div className="px-2 py-3 text-xs text-slate-600">教师尚未发布课堂</div>
          ) : (
            course.lessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/classroom/${lesson.classroomId}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/10 text-[10px] text-cyan-300">
                  {lesson.order}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-slate-300">{lesson.title}</div>
                  <div className="mt-1 text-[10px] text-slate-600">
                    {lesson.completedScenes}/{lesson.totalScenes} 个场景
                  </div>
                </div>
                <StateBadge state={lesson.state} compact />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CapabilityRadar({ capabilities }: { capabilities: CapabilityMetric[] }) {
  const center = 120;
  const radius = 82;
  const pointsAt = (factor: number) =>
    capabilities
      .map((_, index) => {
        const angle = -Math.PI / 2 + index * ((Math.PI * 2) / capabilities.length);
        return `${center + Math.cos(angle) * radius * factor},${center + Math.sin(angle) * radius * factor}`;
      })
      .join(' ');
  const scorePoints = capabilities
    .map((metric, index) => {
      const angle = -Math.PI / 2 + index * ((Math.PI * 2) / capabilities.length);
      const factor = (metric.score ?? 0) / 100;
      return `${center + Math.cos(angle) * radius * factor},${center + Math.sin(angle) * radius * factor}`;
    })
    .join(' ');

  return (
    <div className="mt-4 flex justify-center">
      <svg viewBox="0 0 240 240" className="h-60 w-60" role="img" aria-label="六维能力雷达图">
        {[0.25, 0.5, 0.75, 1].map((factor) => (
          <polygon
            key={factor}
            points={pointsAt(factor)}
            fill="none"
            stroke="#25344a"
            strokeWidth="1"
          />
        ))}
        {capabilities.map((metric, index) => {
          const angle = -Math.PI / 2 + index * ((Math.PI * 2) / capabilities.length);
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const labelX = center + Math.cos(angle) * (radius + 22);
          const labelY = center + Math.sin(angle) * (radius + 22);
          return (
            <g key={metric.id}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="#25344a" />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#94a3b8"
                fontSize="8"
              >
                {metric.shortLabel}
              </text>
            </g>
          );
        })}
        <polygon
          points={scorePoints}
          fill="rgba(34,211,238,.18)"
          stroke="#22d3ee"
          strokeWidth="2"
        />
        {capabilities.map((metric, index) => {
          if (metric.score == null) return null;
          const angle = -Math.PI / 2 + index * ((Math.PI * 2) / capabilities.length);
          const factor = metric.score / 100;
          return (
            <circle
              key={metric.id}
              cx={center + Math.cos(angle) * radius * factor}
              cy={center + Math.sin(angle) * radius * factor}
              r="3"
              fill={metric.color}
            />
          );
        })}
      </svg>
    </div>
  );
}

function LearningLoop({ state, hasQuiz }: { state: LearnerState; hasQuiz: boolean }) {
  const stages = [
    {
      label: '课前',
      title: '诊断与预习',
      detail: state === 'not-started' ? '等待建立学习基线' : '已根据历史证据校准路径',
      active: true,
    },
    {
      label: '课中',
      title: '互动与对抗',
      detail: state === 'completed' ? '本轮课堂已完成' : '场景访问会形成过程证据',
      active: state !== 'not-started',
    },
    {
      label: '课后',
      title: '评估与复盘',
      detail: hasQuiz ? '已有测验证据进入画像' : '完成测验后生成复习建议',
      active: hasQuiz || state === 'completed',
    },
  ];
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {stages.map((stage, index) => (
        <div
          key={stage.label}
          className={`rounded-2xl border p-3 ${stage.active ? 'border-cyan-300/15 bg-cyan-400/[0.06]' : 'border-white/[0.05] bg-slate-950/40'}`}
        >
          <div className={`text-[10px] ${stage.active ? 'text-cyan-300' : 'text-slate-600'}`}>
            0{index + 1} · {stage.label}
          </div>
          <div className="mt-2 text-xs text-slate-300">{stage.title}</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-600">{stage.detail}</div>
        </div>
      ))}
    </div>
  );
}

function StateBadge({ state, compact = false }: { state: LearnerState; compact?: boolean }) {
  const meta = STATE_META[state];
  return (
    <span
      style={{ color: meta.color, background: meta.bg }}
      className={`inline-flex shrink-0 rounded-full ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[10px]'}`}
    >
      {meta.label}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-950/70 px-3 py-3">
      <div className="text-lg font-semibold text-slate-200">{value}</div>
      <div className="mt-1 text-[10px] text-slate-600">{label}</div>
    </div>
  );
}

function StateCard({
  title,
  detail,
  tone = 'default',
}: {
  title: string;
  detail: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div
      className={`rounded-2xl border p-8 ${tone === 'error' ? 'border-rose-400/20 bg-rose-400/5 text-rose-300' : 'border-white/[0.07] bg-slate-900 text-slate-400'}`}
    >
      <div className="text-sm">{title}</div>
      <div className="mt-2 text-xs opacity-70">{detail}</div>
    </div>
  );
}

function confidenceLabel(value: CapabilityMetric['confidence']) {
  return { none: '无置信', low: '低置信', medium: '中置信', high: '高置信' }[value];
}

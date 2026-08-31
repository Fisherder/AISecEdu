'use client';

import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Layers3,
  LoaderCircle,
  PackageOpen,
  Play,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type LearnerState = 'not-started' | 'on-track' | 'at-risk' | 'completed';

interface CourseLesson {
  id: string;
  title: string;
  classroomId: string;
  order: number;
  state: LearnerState;
  completionRate: number;
  completedScenes: number;
  totalScenes: number;
  averageQuizScore: number | null;
}

interface Course {
  id: string;
  title: string;
  description?: string;
  courseCode?: string;
  state: LearnerState;
  completionRate: number;
  completedScenes: number;
  totalScenes: number;
  averageQuizScore: number | null;
  lessons: CourseLesson[];
}

interface StudyPackage {
  id: string;
  goal: string;
  title: string;
  level: string;
  durationMinutes: number;
  classroomId: string | null;
  status: string;
  error?: string;
  progress: {
    state: LearnerState;
    completionRate: number;
    completedScenes: number;
    totalScenes: number;
    averageQuizScore: number | null;
  } | null;
  createdAt: number;
}

interface CourseData {
  summary: { courseCount: number; publishedLessonCount: number; completionRate: number };
  courses: Course[];
}

const STATE_META: Record<LearnerState, { label: string; tone: string }> = {
  'not-started': { label: '未开始', tone: 'bg-slate-700/50 text-slate-400' },
  'on-track': { label: '学习中', tone: 'bg-cyan-400/10 text-cyan-300' },
  'at-risk': { label: '建议复习', tone: 'bg-rose-400/10 text-rose-300' },
  completed: { label: '已完成', tone: 'bg-emerald-400/10 text-emerald-300' },
};

const percent = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

export default function StudentCoursesPage() {
  const [data, setData] = useState<CourseData | null>(null);
  const [packages, setPackages] = useState<StudyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/student/dashboard').then(readJson),
      fetch('/api/student/self-study').then(readJson),
    ])
      .then(([dashboardPayload, packagePayload]) => {
        if (cancelled) return;
        setData(dashboardPayload as CourseData);
        setPackages((packagePayload.sessions ?? []) as StudyPackage[]);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '学习内容加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const readyPackages = useMemo(
    () => packages.filter((item) => item.status === 'ready' && item.classroomId),
    [packages],
  );

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500">
        <LoaderCircle className="mr-2 animate-spin text-cyan-300" size={18} />
        正在整理课程、章节与个人内容…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        role="alert"
        className="rounded-3xl border border-rose-400/15 bg-rose-400/[0.05] p-8 text-sm text-rose-300"
      >
        {error || '学习内容加载失败'}
      </div>
    );
  }

  return (
    <div>
      <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-[10px] tracking-[0.16em] text-cyan-300">LEARNING LIBRARY</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            我的课程与学习内容
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            教师发布的课程与智能体生成的个人内容，在同一个学习空间连续积累证据。
          </p>
        </div>
        <Link
          href="/student/self-study"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-[#06111f] transition hover:bg-cyan-300"
        >
          <Bot size={16} />
          用自然语言安排学习
        </Link>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric icon={BookOpen} label="已加入课程" value={`${data.summary.courseCount}`} />
        <Metric icon={Layers3} label="可学习课堂" value={`${data.summary.publishedLessonCount}`} />
        <Metric icon={CircleDot} label="总体完成度" value={percent(data.summary.completionRate)} />
      </div>

      <section className="rounded-3xl border border-white/[0.07] bg-slate-900/70 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-slate-100">教师课程</h2>
            <p className="mt-1 text-xs text-slate-600">只展示你已加入且已发布的内容</p>
          </div>
          <span className="rounded-full border border-white/[0.07] px-3 py-1 text-[10px] text-slate-500">
            {data.courses.length} 门
          </span>
        </div>

        {data.courses.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-white/[0.08] px-5 py-10 text-center">
            <BookOpen className="mx-auto text-slate-700" size={24} />
            <div className="mt-3 text-sm text-slate-300">还没有加入教师课程</div>
            <p className="mt-1 text-xs text-slate-600">
              通过教师提供的课程链接加入，或先让智能体围绕个人目标开展学习。
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {data.courses.map((course) => (
              <CourseSection key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-violet-300/10 bg-gradient-to-br from-violet-400/[0.06] to-slate-900/80 p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-300" />
              <h2 className="text-base font-medium text-slate-100">个人学习包</h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              只有你明确要求生成时才创建，并自动归入个人空间。
            </p>
          </div>
          <Link
            href="/student/self-study"
            className="inline-flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200"
          >
            创建新的个人学习内容
            <ArrowRight size={13} />
          </Link>
        </div>

        {packages.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-violet-300/10 px-5 py-9 text-center text-xs text-slate-600">
            尚未生成个人学习包。你仍可以直接向学习智能体提问、分析或制定计划。
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {packages.map((item) => (
              <PackageCard key={item.id} item={item} />
            ))}
          </div>
        )}
        {readyPackages.length > 0 && (
          <div className="mt-4 text-[10px] text-slate-700">
            已有 {readyPackages.length} 个学习包可直接进入，过程会继续汇入个人能力证据。
          </div>
        )}
      </section>
    </div>
  );
}

function CourseSection({ course }: { course: Course }) {
  const [open, setOpen] = useState(course.state !== 'completed');
  const nextLesson =
    course.lessons.find((lesson) => lesson.state !== 'completed') ?? course.lessons[0];
  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#081522]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left sm:p-5"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-400/[0.08] text-cyan-300">
          <BookOpen size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm font-medium text-slate-200">{course.title}</strong>
            <StateBadge state={course.state} />
          </span>
          <span className="mt-1.5 block truncate text-[10px] text-slate-600">
            {course.description || `${course.lessons.length} 个已发布课堂`}
          </span>
        </span>
        <span className="hidden w-32 sm:block">
          <span className="mb-1.5 flex justify-between text-[9px] text-slate-600">
            <span>
              {course.completedScenes}/{course.totalScenes} 场景
            </span>
            <span>{percent(course.completionRate)}</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-slate-950">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
              style={{ width: percent(course.completionRate) }}
            />
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-600 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3 py-3 sm:px-4">
          {course.lessons.length === 0 ? (
            <div className="px-3 py-5 text-xs text-slate-600">教师尚未发布可学习章节。</div>
          ) : (
            course.lessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/classroom/${lesson.classroomId}`}
                className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.035]"
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[10px] ${lesson.state === 'completed' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-900 text-slate-500'}`}
                >
                  {lesson.state === 'completed' ? <CheckCircle2 size={15} /> : lesson.order}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-slate-300">{lesson.title}</span>
                  <span className="mt-1 block text-[9px] text-slate-650">
                    {lesson.completedScenes}/{lesson.totalScenes} 个场景
                    {lesson.averageQuizScore == null ? '' : ` · 测验 ${lesson.averageQuizScore} 分`}
                  </span>
                </span>
                <span className="hidden w-24 sm:block">
                  <span className="block h-1 overflow-hidden rounded-full bg-slate-900">
                    <span
                      className="block h-full bg-cyan-400"
                      style={{ width: percent(lesson.completionRate) }}
                    />
                  </span>
                </span>
                <Play size={14} className="text-slate-700 transition group-hover:text-cyan-300" />
              </Link>
            ))
          )}
          {nextLesson && (
            <div className="mt-2 flex justify-end">
              <Link
                href={`/classroom/${nextLesson.classroomId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400/10 px-3 py-2 text-[10px] font-medium text-cyan-300"
              >
                继续学习
                <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function PackageCard({ item }: { item: StudyPackage }) {
  const progress = item.progress?.completionRate ?? 0;
  const ready = item.status === 'ready' && Boolean(item.classroomId);
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#081522] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
          <PackageOpen size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-slate-200">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-600">{item.goal}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[9px] ${ready ? 'bg-emerald-400/10 text-emerald-300' : item.status === 'failed' ? 'bg-rose-400/10 text-rose-300' : 'bg-amber-400/10 text-amber-300'}`}
        >
          {ready ? '可学习' : item.status === 'failed' ? '未生成' : '生成中'}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3 text-[9px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <Clock3 size={11} />
          {item.durationMinutes} 分钟
        </span>
        <span>{item.level}</span>
        <span className="ml-auto">{percent(progress)}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-950">
        <div
          className={`h-full rounded-full ${item.status === 'failed' ? 'bg-rose-400' : 'bg-violet-400'}`}
          style={{ width: percent(progress) }}
        />
      </div>
      {ready && item.classroomId ? (
        <Link
          href={`/classroom/${item.classroomId}`}
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-violet-300"
        >
          进入学习包
          <ArrowRight size={12} />
        </Link>
      ) : item.error ? (
        <div className="mt-3 text-[10px] leading-5 text-rose-300/70">{item.error}</div>
      ) : null}
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-slate-900/70 p-4">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/[0.07] text-cyan-300">
        <Icon size={16} />
      </span>
      <span>
        <strong className="block text-lg font-semibold text-slate-200">{value}</strong>
        <small className="text-[10px] text-slate-600">{label}</small>
      </span>
    </div>
  );
}

function StateBadge({ state }: { state: LearnerState }) {
  const meta = STATE_META[state];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

async function readJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.details || payload.error || '请求失败');
  return payload;
}

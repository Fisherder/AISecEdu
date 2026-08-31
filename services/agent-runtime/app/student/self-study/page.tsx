'use client';

import {
  ArrowRight,
  Bot,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  ClipboardCheck,
  Compass,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Thread {
  id: string;
  title: string;
  activeContext: ContextSelection;
  updatedAt: number;
}

interface ContextSelection {
  courseId?: string;
  lessonId?: string;
  taskId?: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: {
    action?: string;
    title?: string;
    source?: string;
    trace?: Array<{ label: string; detail: string; status: string }>;
    plan?: LearningPlan;
    generatedPackage?: { id: string; title: string; classroomId: string };
    links?: Array<{ label: string; href: string; kind: string }>;
  };
  createdAt: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
  courseCode: string;
  lessons: Array<{ id: string; title: string; classroomId: string | null; order: number }>;
}

interface Task {
  id: string;
  title: string;
  instructions: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  classroomId: string;
  dueAt: number | null;
  progress: number;
}

interface LearningPlanStep {
  id: string;
  title: string;
  detail: string;
  status: 'pending' | 'in-progress' | 'completed';
  estimatedMinutes?: number;
}

interface LearningPlan {
  id: string;
  title: string;
  objective: string;
  status: string;
  steps: LearningPlanStep[];
  updatedAt: number;
}

interface LearningState {
  profile: {
    learningGoal: string;
    level: string;
    preferences: { explanationStyle?: string; challengeLevel?: string; sessionMinutes?: number };
    memory: string[];
  };
  insight: {
    state: string;
    completionRate: number;
    completedScenes: number;
    totalScenes: number;
    averageQuizScore: number | null;
    nextAction: { title: string; reason: string };
  };
  courses: Course[];
  tasks: Task[];
  packages: Array<{
    id: string;
    title: string;
    goal: string;
    classroomId: string | null;
    status: string;
  }>;
  plans: LearningPlan[];
  activeContext: ContextSelection;
}

const QUICK_COMMANDS = [
  {
    icon: BrainCircuit,
    label: '诊断薄弱点',
    command: '分析我当前的学习证据，指出最需要补强的知识点，并说明依据。',
  },
  {
    icon: ListChecks,
    label: '制定学习计划',
    command: '根据我当前课程和进度，帮我制定一个今天可以完成的学习计划。',
  },
  {
    icon: MessageSquare,
    label: '启发式答疑',
    command: '用逐步提问和最少提示的方式，帮我真正理解我正在学习的难点。',
  },
  {
    icon: Sparkles,
    label: '生成学习包',
    command: '帮我生成一个 30 分钟、可直接进入学习的个人学习包，并结合我的薄弱点安排内容。',
  },
];

const PROCESS_STAGES = [
  '正在理解你的原始要求…',
  '正在读取你有权访问的课程与任务…',
  '正在结合学习证据和长期记忆…',
  '正在执行并核验本轮结果…',
];

const ACTION_LABEL: Record<string, string> = {
  answer: '直接答复',
  coach: '引导学习',
  plan: '学习计划',
  practice: '练习反馈',
  review: '证据评价',
  generate_package: '个人学习包',
  navigate: '学习导航',
};

export default function StudentLearningAgentPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [learningState, setLearningState] = useState<LearningState | null>(null);
  const [context, setContext] = useState<ContextSelection>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [processStage, setProcessStage] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (threadId?: string) => {
    setLoading(true);
    setError('');
    try {
      const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : '';
      const response = await fetch(`/api/student/agent${query}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details || payload.error || '学习空间加载失败');
      setThreads(payload.threads ?? []);
      setThread(payload.thread ?? null);
      setMessages(payload.messages ?? []);
      setLearningState(payload.learningState ?? null);
      setContext(payload.thread?.activeContext ?? payload.learningState?.activeContext ?? {});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '学习空间加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(
      () => setProcessStage((value) => Math.min(value + 1, PROCESS_STAGES.length - 1)),
      2200,
    );
    return () => window.clearInterval(timer);
  }, [sending]);

  async function send(command?: string) {
    const text = (command ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setProcessStage(0);
    setError('');
    const optimistic: AgentMessage = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: text,
      metadata: {},
      createdAt: Date.now(),
    };
    setMessages((items) => [...items, optimistic]);
    try {
      const response = await fetch('/api/student/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread?.id, message: text, context }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details || payload.error || '智能体执行失败');
      setMessages((items) => [
        ...items.filter((item) => item.id !== optimistic.id),
        payload.userMessage,
        payload.assistantMessage,
      ]);
      setThread(payload.thread);
      setLearningState(payload.learningState);
      setContext(payload.thread.activeContext ?? {});
      setThreads((items) => {
        const next = items.filter((item) => item.id !== payload.thread.id);
        return [payload.thread, ...next];
      });
    } catch (reason) {
      setMessages((items) => items.filter((item) => item.id !== optimistic.id));
      setInput(text);
      setError(reason instanceof Error ? reason.message : '智能体执行失败');
    } finally {
      setSending(false);
    }
  }

  function newThread() {
    setThread(null);
    setMessages([]);
    setContext({});
    setInput('');
    setError('');
  }

  async function deleteThread(item: Thread) {
    const response = await fetch(`/api/student/agent?threadId=${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) return;
    const remaining = threads.filter((entry) => entry.id !== item.id);
    setThreads(remaining);
    if (thread?.id === item.id) {
      if (remaining[0]) await load(remaining[0].id);
      else newThread();
    }
  }

  async function togglePlanStep(plan: LearningPlan, step: LearningPlanStep) {
    const response = await fetch('/api/student/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: plan.id,
        stepId: step.id,
        completed: step.status !== 'completed',
      }),
    });
    const payload = await response.json();
    if (!response.ok) return;
    setLearningState((state) =>
      state
        ? {
            ...state,
            plans: state.plans.map((item) => (item.id === plan.id ? payload.plan : item)),
          }
        : state,
    );
  }

  const contextLabel = describeContext(context, learningState);

  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)_300px]">
      <aside className="hidden min-h-0 border-r border-white/[0.06] bg-[#081522] xl:flex xl:flex-col">
        <div className="p-3">
          <button
            type="button"
            onClick={newThread}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.06] px-3 py-2.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/10"
          >
            <Plus size={15} /> 新学习对话
          </button>
        </div>
        <div className="px-4 pb-2 text-[10px] font-medium tracking-[0.12em] text-slate-600">
          最近对话
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {threads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.07] px-3 py-6 text-center text-[10px] leading-5 text-slate-600">
              从一个问题或目标开始
              <br />
              对话会自动保存在这里
            </div>
          ) : (
            threads.map((item) => (
              <div
                key={item.id}
                className={`group mb-1 flex items-center rounded-xl ${thread?.id === item.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'}`}
              >
                <button
                  type="button"
                  onClick={() => void load(item.id)}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left"
                >
                  <div
                    className={`truncate text-xs ${thread?.id === item.id ? 'text-slate-100' : 'text-slate-400'}`}
                  >
                    {item.title}
                  </div>
                  <div className="mt-1 text-[9px] text-slate-700">
                    {formatRelative(item.updatedAt)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteThread(item)}
                  aria-label={`删除对话 ${item.title}`}
                  className="mr-2 hidden rounded-lg p-1.5 text-slate-700 hover:bg-rose-400/10 hover:text-rose-300 group-hover:block"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="relative flex min-h-0 min-w-0 flex-col bg-[#06111f]">
        <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <Bot size={17} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-200">
                {thread?.title || '新的学习对话'}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-slate-600">
                直接说出目标、问题或想完成的事
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setContextOpen((value) => !value)}
              className={`flex max-w-[280px] items-center gap-2 rounded-xl border px-3 py-2 text-[10px] transition ${contextOpen ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200' : 'border-white/[0.08] text-slate-400 hover:border-cyan-300/20'}`}
            >
              <Compass size={14} />
              <span className="truncate">{contextLabel}</span>
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              onClick={newThread}
              className="rounded-xl border border-white/[0.08] p-2 text-slate-500 hover:text-cyan-300 xl:hidden"
              aria-label="新学习对话"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        {contextOpen && learningState && (
          <ContextPicker
            state={learningState}
            value={context}
            onChange={(value) => {
              setContext(value);
              setContextOpen(false);
            }}
            onClose={() => setContextOpen(false)}
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-8">
            {loading ? (
              <div className="flex items-center justify-center py-24 text-xs text-slate-500">
                <LoaderCircle className="mr-2 animate-spin" size={17} />
                正在读取你的学习上下文…
              </div>
            ) : messages.length === 0 ? (
              <EmptyConversation
                state={learningState}
                onCommand={(command) => void send(command)}
              />
            ) : (
              <div className="space-y-7">
                {messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}
              </div>
            )}
            {sending && (
              <div className="mt-7 flex items-start gap-3" aria-live="polite">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <LoaderCircle className="animate-spin" size={16} />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl border border-cyan-300/10 bg-white/[0.025] px-4 py-3">
                  <div className="text-xs text-slate-300">{PROCESS_STAGES[processStage]}</div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-900">
                    <div
                      className="h-full animate-pulse rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                      style={{ width: `${25 * (processStage + 1)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] bg-[#06111f]/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto max-w-4xl">
            {error && (
              <div
                role="alert"
                className="mb-2 flex items-center justify-between rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-300"
              >
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} aria-label="关闭错误">
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="rounded-2xl border border-white/[0.1] bg-[#0a1827] p-2 shadow-2xl shadow-black/20 focus-within:border-cyan-300/25">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                disabled={sending}
                placeholder="告诉智能体你想理解什么、完成什么，或直接提出问题…"
                className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-700 disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <button
                  type="button"
                  onClick={() => setContextOpen(true)}
                  className="flex min-w-0 items-center gap-1.5 text-[10px] text-slate-600 hover:text-cyan-300"
                >
                  <Target size={12} />
                  <span className="truncate">{contextLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !input.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400 text-[#06111f] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
                  aria-label="发送学习要求"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
            <div className="mt-1.5 text-center text-[9px] text-slate-700">
              智能体只读取你本人有权访问的内容；生成和评价结果仍需你主动判断。
            </div>
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 border-l border-white/[0.06] bg-[#081522] 2xl:flex 2xl:flex-col">
        <LearningSidecar state={learningState} onToggle={togglePlanStep} />
      </aside>
    </div>
  );
}

function EmptyConversation({
  state,
  onCommand,
}: {
  state: LearningState | null;
  onCommand: (command: string) => void;
}) {
  return (
    <div className="py-8 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/15 to-blue-500/10 text-cyan-300">
          <Sparkles size={24} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-100">
          今天想真正学会什么？
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
          我会先理解你的原始要求，再结合课程、任务、个人证据与记忆行动。答疑就是答疑，制定计划就是制定计划；只有你明确要求时才生成学习包。
        </p>
        {state?.profile.learningGoal && (
          <div className="mx-auto mt-4 inline-flex max-w-xl items-center gap-2 rounded-full border border-cyan-300/10 bg-cyan-400/[0.05] px-3 py-1.5 text-[10px] text-cyan-200">
            <Target size={12} />
            长期目标：{state.profile.learningGoal}
          </div>
        )}
      </div>
      <div className="mx-auto mt-8 grid max-w-2xl gap-2 sm:grid-cols-2">
        {QUICK_COMMANDS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onCommand(item.command)}
              className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:border-cyan-300/15 hover:bg-cyan-400/[0.04]"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-cyan-300">
                  <Icon size={16} />
                </span>
                <ArrowRight size={14} className="text-slate-700 group-hover:text-cyan-300" />
              </div>
              <div className="mt-3 text-xs font-medium text-slate-300">{item.label}</div>
              <div className="mt-1 text-[10px] leading-5 text-slate-600">{item.command}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Message({ message }: { message: AgentMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[82%]">
          <div className="rounded-2xl rounded-tr-md border border-cyan-300/15 bg-cyan-400/[0.09] px-4 py-3 text-sm leading-6 text-slate-200 whitespace-pre-wrap">
            {message.content}
          </div>
          <div className="mt-1.5 text-right text-[9px] text-slate-700">
            {formatTime(message.createdAt)}
          </div>
        </div>
        <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400">
          <UserRound size={15} />
        </span>
      </div>
    );
  }
  const metadata = message.metadata ?? {};
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
        <Bot size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-300">学习智能体</span>
          {metadata.action && (
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] text-slate-500">
              {ACTION_LABEL[metadata.action] ?? metadata.action}
            </span>
          )}
          {metadata.source === 'fallback' && (
            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-300">
              本地安全回退
            </span>
          )}
        </div>
        <div className="text-sm leading-7 text-slate-300">
          <FormattedText content={message.content} />
        </div>
        {metadata.generatedPackage && (
          <Link
            href={`/classroom/${metadata.generatedPackage.classroomId}`}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-300/15 bg-violet-400/[0.06] p-4 transition hover:bg-violet-400/10"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
              <Sparkles size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] text-violet-300">已生成个人学习包</span>
              <strong className="mt-1 block truncate text-sm font-medium text-slate-200">
                {metadata.generatedPackage.title}
              </strong>
            </span>
            <ArrowRight size={16} className="text-violet-300" />
          </Link>
        )}
        {metadata.plan && <PlanResult plan={metadata.plan} />}
        {metadata.links && metadata.links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {metadata.links.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-[10px] text-cyan-300 transition hover:bg-cyan-400/[0.05]"
              >
                {link.label}
                <ArrowRight size={12} />
              </Link>
            ))}
          </div>
        )}
        {metadata.trace && metadata.trace.length > 0 && (
          <details className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] text-slate-600">
            <summary className="cursor-pointer select-none hover:text-slate-400">
              查看处理过程 · {metadata.trace.length} 步
            </summary>
            <div className="mt-3 space-y-2 border-l border-slate-800 pl-3">
              {metadata.trace.map((step, index) => (
                <div key={`${index}-${step.label}`}>
                  <div className="text-slate-400">{step.label}</div>
                  {step.detail && (
                    <div className="mt-0.5 leading-4 text-slate-700">{step.detail}</div>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="mt-2 text-[9px] text-slate-800">{formatTime(message.createdAt)}</div>
      </div>
    </div>
  );
}

function FormattedText({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
          return (
            <ul key={index} className="my-3 space-y-1.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="list-disc">
                  {line.replace(/^\s*[-*•]\s+/, '')}
                </li>
              ))}
            </ul>
          );
        }
        if (lines.every((line) => /^\s*\d+[.、]\s*/.test(line))) {
          return (
            <ol key={index} className="my-3 space-y-1.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="list-decimal">
                  {line.replace(/^\s*\d+[.、]\s*/, '')}
                </li>
              ))}
            </ol>
          );
        }
        const heading = block.match(/^#{1,3}\s+(.+)$/);
        if (heading)
          return (
            <h3 key={index} className="mb-2 mt-5 font-medium text-slate-100">
              {heading[1]}
            </h3>
          );
        return (
          <p key={index} className="my-2 whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </>
  );
}

function PlanResult({ plan }: { plan: LearningPlan }) {
  return (
    <div className="mt-4 rounded-2xl border border-emerald-300/10 bg-emerald-400/[0.035] p-4">
      <div className="flex items-center gap-2 text-[10px] text-emerald-300">
        <ListChecks size={14} />
        已保存为可跟踪计划
      </div>
      <div className="mt-2 text-sm font-medium text-slate-200">{plan.title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{plan.objective}</div>
      <div className="mt-3 space-y-2">
        {plan.steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[9px] text-emerald-300">
              {index + 1}
            </span>
            <span>
              <span className="text-slate-300">{step.title}</span>
              {step.detail && (
                <span className="mt-0.5 block text-[10px] leading-4 text-slate-600">
                  {step.detail}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextPicker({
  state,
  value,
  onChange,
  onClose,
}: {
  state: LearningState;
  value: ContextSelection;
  onChange: (value: ContextSelection) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-x-0 top-14 z-20 border-b border-white/[0.08] bg-[#091725]/98 p-4 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:top-[4.5rem] sm:w-[520px] sm:rounded-2xl sm:border">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-200">选择本轮学习范围</div>
          <div className="mt-1 text-[10px] text-slate-600">
            可以针对整个学习空间、课程、章节或教师任务
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-600 hover:bg-white/5 hover:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChange({})}
        className={`mt-4 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${Object.keys(value).length === 0 ? 'border-cyan-300/20 bg-cyan-400/[0.06]' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-cyan-300">
          <Compass size={15} />
        </span>
        <span>
          <strong className="block text-xs font-medium text-slate-300">整个学习空间</strong>
          <small className="mt-1 block text-[10px] text-slate-600">
            让智能体综合全部课程、任务和学习证据
          </small>
        </span>
      </button>
      <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {state.tasks.length > 0 && (
          <div>
            <div className="mb-2 text-[9px] font-medium tracking-[0.12em] text-slate-700">
              教师任务
            </div>
            <div className="space-y-1">
              {state.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    onChange({ taskId: task.id, courseId: task.courseId, lessonId: task.lessonId })
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${value.taskId === task.id ? 'bg-cyan-400/[0.08]' : 'hover:bg-white/[0.03]'}`}
                >
                  <ClipboardCheck size={15} className="shrink-0 text-cyan-300" />
                  <span className="min-w-0">
                    <strong className="block truncate text-xs font-normal text-slate-300">
                      {task.title}
                    </strong>
                    <small className="mt-0.5 block truncate text-[9px] text-slate-600">
                      {task.courseTitle}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 text-[9px] font-medium tracking-[0.12em] text-slate-700">
            课程与章节
          </div>
          <div className="space-y-2">
            {state.courses.map((course) => (
              <div key={course.id} className="rounded-xl border border-white/[0.05]">
                <button
                  type="button"
                  onClick={() => onChange({ courseId: course.id })}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${value.courseId === course.id && !value.lessonId ? 'bg-cyan-400/[0.08]' : 'hover:bg-white/[0.03]'}`}
                >
                  <BookOpen size={15} className="shrink-0 text-violet-300" />
                  <span className="truncate text-xs text-slate-300">
                    整个课程《{course.title}》
                  </span>
                </button>
                {course.lessons.length > 0 && (
                  <div className="border-t border-white/[0.04] px-2 py-1">
                    {course.lessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => onChange({ courseId: course.id, lessonId: lesson.id })}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left ${value.lessonId === lesson.id ? 'bg-cyan-400/[0.08] text-cyan-200' : 'text-slate-500 hover:bg-white/[0.025] hover:text-slate-300'}`}
                      >
                        <span className="text-[9px] text-slate-700">
                          {String(lesson.order + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate text-[10px]">{lesson.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LearningSidecar({
  state,
  onToggle,
}: {
  state: LearningState | null;
  onToggle: (plan: LearningPlan, step: LearningPlanStep) => void;
}) {
  if (!state) return <div className="p-5 text-xs text-slate-600">正在加载学习状态…</div>;
  const plan = state.plans.find((item) => item.status === 'active') ?? state.plans[0];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <Target size={15} className="text-cyan-300" />
          当前目标
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {state.profile.learningGoal || '还没有设置长期目标，可以直接告诉智能体“我的长期目标是……”'}
        </p>
        <Link href="/student/profile" className="mt-3 inline-flex text-[10px] text-cyan-300">
          管理偏好与记忆 →
        </Link>
      </div>
      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">学习证据</div>
          <span className="text-[10px] text-cyan-300">
            {Math.round(state.insight.completionRate * 100)}%
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
            style={{ width: `${Math.round(state.insight.completionRate * 100)}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-slate-950/60 p-2">
            <div className="text-sm text-slate-300">
              {state.insight.completedScenes}/{state.insight.totalScenes}
            </div>
            <div className="mt-1 text-[9px] text-slate-700">完成场景</div>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-2">
            <div className="text-sm text-slate-300">{state.insight.averageQuizScore ?? '—'}</div>
            <div className="mt-1 text-[9px] text-slate-700">测验均分</div>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <ListChecks size={15} className="text-emerald-300" />
            当前计划
          </div>
          {plan && (
            <span className="text-[9px] text-slate-700">
              {plan.steps.filter((step) => step.status === 'completed').length}/{plan.steps.length}
            </span>
          )}
        </div>
        {!plan ? (
          <p className="mt-3 text-[10px] leading-5 text-slate-600">
            让智能体“帮我制定计划”，即可在这里持续跟踪。
          </p>
        ) : (
          <>
            <div className="mt-3 text-xs text-slate-400">{plan.title}</div>
            <div className="mt-3 space-y-2">
              {plan.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onToggle(plan, step)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${step.status === 'completed' ? 'border-emerald-300 bg-emerald-300 text-[#06111f]' : 'border-slate-700 text-transparent'}`}
                  >
                    {step.status === 'completed' && <Check size={10} />}
                  </span>
                  <span
                    className={`text-[10px] leading-4 ${step.status === 'completed' ? 'text-slate-700 line-through' : 'text-slate-500'}`}
                  >
                    {step.title}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
        <div className="text-xs font-medium text-slate-300">已授权范围</div>
        <div className="mt-3 space-y-2 text-[10px] text-slate-600">
          <div className="flex items-center justify-between">
            <span>已加入课程</span>
            <span className="text-slate-400">{state.courses.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>教师任务</span>
            <span className="text-slate-400">{state.tasks.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>个人学习包</span>
            <span className="text-slate-400">{state.packages.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function describeContext(context: ContextSelection, state: LearningState | null) {
  if (!state || Object.keys(context).length === 0) return '整个学习空间';
  const task = context.taskId ? state.tasks.find((item) => item.id === context.taskId) : undefined;
  if (task) return `任务：${task.title}`;
  const lesson = context.lessonId
    ? state.courses.flatMap((item) => item.lessons).find((item) => item.id === context.lessonId)
    : undefined;
  if (lesson) return `章节：${lesson.title}`;
  const course = context.courseId
    ? state.courses.find((item) => item.id === context.courseId)
    : undefined;
  if (course) return `课程：${course.title}`;
  return '整个学习空间';
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(value: number) {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

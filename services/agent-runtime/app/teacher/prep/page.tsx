'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LessonArtifactType } from '@/lib/types/lesson';
import type { TeachingPackagePlan, TeachingPlanItem } from '@/lib/types/teaching-plan';

const COURSES = [
  '现代密码学',
  '网络安全',
  '软件安全',
  '操作系统',
  '计算机网络',
  '汇编语言与逆向工程',
  '信息系统安全',
  '网络空间安全导论',
];

const CONTENT_META: Record<
  LessonArtifactType,
  { label: string; icon: string; badgeClass: string; description: string }
> = {
  slide: {
    label: '课件',
    icon: '▤',
    badgeClass: 'bg-cyan-400/10 text-cyan-300',
    description: '概念讲解与案例导入',
  },
  quiz: {
    label: '习题测验',
    icon: '✓',
    badgeClass: 'bg-emerald-400/10 text-emerald-300',
    description: '诊断误区与迁移评价',
  },
  diagram: {
    label: '图示',
    icon: '◇',
    badgeClass: 'bg-violet-400/10 text-violet-300',
    description: '流程、架构与关系可视化',
  },
  simulation: {
    label: '仿真',
    icon: '◉',
    badgeClass: 'bg-blue-400/10 text-blue-300',
    description: '改变变量并观察动态结果',
  },
  code: {
    label: '代码练习',
    icon: '</>',
    badgeClass: 'bg-amber-400/10 text-amber-300',
    description: '实现、审计或修复代码',
  },
  'procedural-skill': {
    label: '流程演练',
    icon: '↳',
    badgeClass: 'bg-orange-400/10 text-orange-300',
    description: '步骤化操作与成功标准',
  },
  game: {
    label: '游戏闯关',
    icon: '★',
    badgeClass: 'bg-pink-400/10 text-pink-300',
    description: '游戏化重复练习',
  },
  visualization3d: {
    label: '3D 可视化',
    icon: '⬡',
    badgeClass: 'bg-indigo-400/10 text-indigo-300',
    description: '探索空间结构与部件关系',
  },
  'vulnerable-lab': {
    label: '攻防实验',
    icon: '⌁',
    badgeClass: 'bg-rose-400/10 text-rose-300',
    description: '授权沙箱中的攻防闭环',
  },
  debate: {
    label: '智能体辩论',
    icon: '◐',
    badgeClass: 'bg-purple-400/10 text-purple-300',
    description: '多立场论证、质询与核查',
  },
};

type Step = 'input' | 'planning' | 'reviewing' | 'generating' | 'complete';
type GenerationStatus = 'pending' | 'running' | 'success' | 'failed';

interface GenerationItemState {
  id: string;
  title: string;
  type: LessonArtifactType;
  status: GenerationStatus;
  error?: string;
}

interface ApiPayload {
  success?: boolean;
  error?: string;
  id?: string;
  plan?: TeachingPackagePlan;
  artifact?: unknown;
}

async function readApiPayload(response: Response): Promise<ApiPayload> {
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}

export default function TeacherPrepPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('input');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [plan, setPlan] = useState<TeachingPackagePlan | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [generationItems, setGenerationItems] = useState<GenerationItemState[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [createdCount, setCreatedCount] = useState(0);
  const [error, setError] = useState('');

  const selectedItems = useMemo(
    () => plan?.items.filter((item) => selectedIds.has(item.id)) ?? [],
    [plan, selectedIds],
  );
  const selectedMinutes = selectedItems.reduce((total, item) => total + item.estimatedMinutes, 0);

  async function startPlanning() {
    if (!topic.trim()) return;
    setStep('planning');
    setError('');
    try {
      const payload = await readApiPayload(
        await fetch('/api/security/teaching-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.trim(),
            description: description.trim(),
            courseId: courseId || undefined,
          }),
        }),
      );
      if (!payload.plan?.items.length) throw new Error('没有得到可执行的教学内容方案');
      setPlan(payload.plan);
      setSelectedIds(new Set(payload.plan.items.map((item) => item.id)));
      setStep('reviewing');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '教学方案规划失败');
      setStep('input');
    }
  }

  function toggleItem(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateItemTitle(id: string, title: string) {
    setPlan((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, title } : item)),
          }
        : current,
    );
  }

  function updateGenerationItem(id: string, patch: Partial<GenerationItemState>) {
    setGenerationItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function generatePackage() {
    if (!plan || selectedItems.length === 0) return;
    if (selectedItems.some((item) => !item.title.trim())) {
      setError('所选内容中有空标题，请补充后再生成');
      return;
    }

    setStep('generating');
    setError('');
    setCreatedCount(0);
    const initialStates = selectedItems.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      status: 'pending' as const,
    }));
    setGenerationItems(initialStates);

    let createdLessonId = '';
    try {
      const lessonPayload = await readApiPayload(
        await fetch('/api/lessons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: plan.title,
            description: [
              description.trim(),
              plan.summary,
              `教学目标：${plan.learningObjectives.join('；')}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
            subjectProfile: 'cybersecurity',
            courseId: courseId || undefined,
          }),
        }),
      );
      if (!lessonPayload.id) throw new Error('课程创建失败');
      createdLessonId = lessonPayload.id;
      setLessonId(createdLessonId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '课程创建失败');
      setStep('reviewing');
      return;
    }

    let successes = 0;
    let failures = 0;
    for (const item of selectedItems) {
      updateGenerationItem(item.id, { status: 'running', error: undefined });
      try {
        const payload = await readApiPayload(
          await fetch(`/api/lessons/${createdLessonId}/artifacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'single',
              type: item.type,
              title: item.title.trim(),
              description: `${item.purpose}\n\n规划依据：${item.reason}`,
              keyPoints: item.keyPoints,
              quality: item.quality,
            }),
          }),
        );
        if (!payload.artifact) throw new Error('生成接口没有返回内容');
        successes += 1;
        setCreatedCount(successes);
        updateGenerationItem(item.id, { status: 'success' });
      } catch (reason) {
        failures += 1;
        updateGenerationItem(item.id, {
          status: 'failed',
          error: reason instanceof Error ? reason.message : '生成失败',
        });
      }
    }

    if (failures === 0) {
      router.push(`/teacher/prep/${createdLessonId}`);
      return;
    }
    setError(`已生成 ${successes} 项，另有 ${failures} 项失败；已成功的内容不会丢失。`);
    setStep('complete');
  }

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/teacher" className="text-xs text-slate-500 transition hover:text-cyan-300">
            ← 返回教师工作台
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100">
            AI 自主备课编排
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            描述你要达成的教学目标，智能体会自主选择课件、习题、实验、辩论等内容形式。
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <StepPill active={step === 'input' || step === 'planning'} number="1" label="提出需求" />
          <span className="text-slate-700">—</span>
          <StepPill active={step === 'reviewing'} number="2" label="审阅方案" />
          <span className="text-slate-700">—</span>
          <StepPill
            active={step === 'generating' || step === 'complete'}
            number="3"
            label="生成内容"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      {step === 'input' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/75 p-5 shadow-xl shadow-slate-950/20 md:p-7">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/10 text-sm font-bold text-cyan-300">
                01
              </span>
              <div>
                <h2 className="font-medium text-slate-100">描述教学需求</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  可以写学习者、课时、教学目标、必须包含或排除的活动。
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-300">教学主题</span>
              <input
                data-testid="teaching-topic-input"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="例如：SQL 注入攻击面与纵深防御"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium text-slate-300">目标与约束</span>
              <textarea
                data-testid="teaching-description-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void startPlanning();
                  }
                }}
                placeholder="例如：面向大二学生，90 分钟。学生已学过 HTTP 和数据库基础；要能识别注入点、解释参数化查询，并在隔离靶场完成检测与修复。最后安排一次形成性评价。"
                className="min-h-40 w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium text-slate-300">
                绑定课程（可选）
              </span>
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-400/70"
              >
                <option value="">不绑定课程</option>
                {COURSES.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-600">Ctrl / ⌘ + Enter 快速规划</span>
              <button
                data-testid="start-teaching-plan-button"
                type="button"
                disabled={!topic.trim()}
                onClick={() => void startPlanning()}
                className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                让 AI 自主规划 →
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-indigo-400/15 bg-indigo-400/[0.06] p-5">
              <div className="text-xs font-semibold text-indigo-200">智能体会判断什么？</div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                <li>• 是否需要先讲概念，还是直接进入实践</li>
                <li>• 哪些关系适合图示、仿真或代码练习</li>
                <li>• 是否存在值得辩论的真实立场冲突</li>
                <li>• 何时用测验收集可评价的学习证据</li>
                <li>• 攻防实验是否需要授权与隔离边界</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-5 text-xs leading-5 text-slate-500">
              AI
              不会机械地把所有形式都选上。明确写“只要一场辩论”或“不要实验”，规划器会把这些约束纳入决策。
            </div>
          </aside>
        </div>
      )}

      {step === 'planning' && <PlanningState />}

      {step === 'reviewing' && plan && (
        <PlanReview
          plan={plan}
          selectedIds={selectedIds}
          selectedCount={selectedItems.length}
          selectedMinutes={selectedMinutes}
          onToggle={toggleItem}
          onTitleChange={updateItemTitle}
          onEditRequirement={() => setStep('input')}
          onReplan={() => void startPlanning()}
          onGenerate={() => void generatePackage()}
        />
      )}

      {step === 'generating' && (
        <GenerationProgress items={generationItems} createdCount={createdCount} />
      )}

      {step === 'complete' && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900/75 p-8 text-center">
          <div className="text-4xl">◒</div>
          <h2 className="mt-4 text-lg font-semibold text-slate-100">教学包已部分生成</h2>
          <p className="mt-2 text-sm text-slate-400">
            已成功生成 {createdCount} 项。进入备课详情后可以预览、编辑，并单独补生成失败内容。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setStep('reviewing')}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              返回方案
            </button>
            {lessonId && (
              <Link
                href={`/teacher/prep/${lessonId}`}
                className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                查看已生成内容 →
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StepPill({ active, number, label }: { active: boolean; number: string; label: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1.5 transition ${
        active
          ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
          : 'border-slate-800 bg-slate-900/40 text-slate-600'
      }`}
    >
      {number} · {label}
    </span>
  );
}

function PlanningState() {
  return (
    <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 px-6 py-16 text-center">
      <div className="relative mx-auto h-16 w-16">
        <span className="absolute inset-0 animate-ping rounded-full border border-cyan-400/30" />
        <span className="absolute inset-2 grid place-items-center rounded-full bg-cyan-400/10 text-xl text-cyan-300">
          ✦
        </span>
      </div>
      <h2 className="mt-6 text-base font-medium text-slate-100">教学总编排器正在决策</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        正在分析学习目标、内容复杂度、实践要求与评价方式，并选择真正有教学价值的内容组合……
      </p>
    </section>
  );
}

interface PlanReviewProps {
  plan: TeachingPackagePlan;
  selectedIds: Set<string>;
  selectedCount: number;
  selectedMinutes: number;
  onToggle: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onEditRequirement: () => void;
  onReplan: () => void;
  onGenerate: () => void;
}

function PlanReview({
  plan,
  selectedIds,
  selectedCount,
  selectedMinutes,
  onToggle,
  onTitleChange,
  onEditRequirement,
  onReplan,
  onGenerate,
}: PlanReviewProps) {
  return (
    <div data-testid="teaching-plan-review" className="space-y-5">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/75 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium text-cyan-300">
                AI 自主编排完成
              </span>
              <span
                data-testid="teaching-plan-source"
                className={`rounded-full px-2.5 py-1 text-[10px] ${
                  plan.source === 'ai'
                    ? 'bg-indigo-400/10 text-indigo-300'
                    : 'bg-amber-400/10 text-amber-300'
                }`}
              >
                {plan.source === 'ai' ? '模型规划' : '本地规则兜底'}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-100">{plan.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{plan.summary}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-right">
            <div className="text-xl font-semibold text-cyan-300">{selectedCount}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              已选内容 · 约 {selectedMinutes} 分钟
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4">
            <div className="text-[11px] font-medium text-slate-300">学习者画像</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{plan.audience}</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4">
            <div className="text-[11px] font-medium text-slate-300">整体决策依据</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{plan.decisionSummary}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-medium text-slate-300">可评价的学习目标</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.learningObjectives.map((objective) => (
              <span
                key={objective}
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-2.5 py-1.5 text-[11px] text-slate-400"
              >
                {objective}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-slate-200">AI 选择的课程内容</h3>
            <p className="mt-1 text-xs text-slate-500">
              默认全部采用；取消勾选即可不生成，也可以直接修改标题。
            </p>
          </div>
          <span className="text-[11px] text-slate-600">生成顺序由上至下</span>
        </div>
        <div className="space-y-3">
          {plan.items.map((item, index) => (
            <PlanItemCard
              key={item.id}
              item={item}
              index={index}
              selected={selectedIds.has(item.id)}
              onToggle={() => onToggle(item.id)}
              onTitleChange={(title) => onTitleChange(item.id, title)}
            />
          ))}
        </div>
      </section>

      {plan.safetyNotes.length > 0 && (
        <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <div className="text-xs font-medium text-amber-200">安全与教学边界</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/65">
            {plan.safetyNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEditRequirement}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            修改需求
          </button>
          <button
            type="button"
            onClick={onReplan}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:border-indigo-400/50 hover:text-indigo-200"
          >
            重新规划
          </button>
        </div>
        <button
          data-testid="generate-plan-button"
          type="button"
          disabled={selectedCount === 0}
          onClick={onGenerate}
          className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          按此方案生成 {selectedCount} 项内容 →
        </button>
      </div>
    </div>
  );
}

function PlanItemCard({
  item,
  index,
  selected,
  onToggle,
  onTitleChange,
}: {
  item: TeachingPlanItem;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onTitleChange: (title: string) => void;
}) {
  const meta = CONTENT_META[item.type];
  return (
    <article
      data-testid={`plan-item-${item.type}`}
      className={`grid gap-4 rounded-2xl border p-4 transition md:grid-cols-[auto_1fr_auto] md:items-start ${
        selected
          ? 'border-cyan-400/30 bg-slate-900/80'
          : 'border-slate-800 bg-slate-950/35 opacity-55'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${selected ? '取消' : '选择'}${item.title}`}
        aria-pressed={selected}
        className={`mt-0.5 grid h-9 w-9 place-items-center rounded-xl border text-xs font-bold transition ${
          selected
            ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
            : 'border-slate-700 bg-slate-900 text-slate-600'
        }`}
      >
        {selected ? '✓' : index + 1}
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-1 text-[10px] ${meta.badgeClass}`}>
            {meta.icon} {meta.label}
          </span>
          <span className="text-[10px] text-slate-600">{meta.description}</span>
        </div>
        <input
          value={item.title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={!selected}
          aria-label={`${meta.label}标题`}
          className="mt-2 w-full border-0 border-b border-transparent bg-transparent py-1 text-sm font-medium text-slate-100 outline-none transition hover:border-slate-700 focus:border-cyan-400/50 disabled:text-slate-500"
        />
        <p className="mt-2 text-xs leading-5 text-slate-400">{item.purpose}</p>
        <div className="mt-2 rounded-lg bg-indigo-400/[0.05] px-3 py-2 text-[11px] leading-5 text-indigo-200/60">
          <span className="mr-1 text-indigo-300">AI 决策依据：</span>
          {item.reason}
        </div>
        {item.keyPoints.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.keyPoints.map((point) => (
              <span
                key={point}
                className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-500"
              >
                {point}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 md:flex-col md:items-end">
        <span className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-500">
          约 {item.estimatedMinutes} 分钟
        </span>
        <span className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-500">
          {item.quality === 'rich' ? '精细生成' : '快速生成'}
        </span>
      </div>
    </article>
  );
}

function GenerationProgress({
  items,
  createdCount,
}: {
  items: GenerationItemState[];
  createdCount: number;
}) {
  const running = items.find((item) => item.status === 'running');
  const finished = items.filter(
    (item) => item.status === 'success' || item.status === 'failed',
  ).length;
  const percentage = items.length ? Math.round((finished / items.length) * 100) : 0;
  return (
    <section className="rounded-2xl border border-slate-700/80 bg-slate-900/75 p-5 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-medium text-cyan-300">正在执行教学内容编排</span>
          <h2 className="mt-2 text-lg font-semibold text-slate-100">
            {running ? `正在生成：${running.title}` : '正在准备生成任务…'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            逐项生成可以隔离失败，已完成的内容会立即保存。
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-cyan-300">{percentage}%</div>
          <div className="text-[10px] text-slate-600">已保存 {createdCount} 项</div>
        </div>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-6 space-y-2">
        {items.map((item, index) => {
          const meta = CONTENT_META[item.type];
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs ${
                  item.status === 'success'
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : item.status === 'failed'
                      ? 'bg-rose-400/10 text-rose-300'
                      : item.status === 'running'
                        ? 'animate-pulse bg-cyan-400/10 text-cyan-300'
                        : 'bg-slate-800 text-slate-600'
                }`}
              >
                {item.status === 'success'
                  ? '✓'
                  : item.status === 'failed'
                    ? '!'
                    : item.status === 'running'
                      ? '…'
                      : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-slate-300">{item.title}</div>
                {item.error && <div className="mt-1 text-[10px] text-rose-300">{item.error}</div>}
              </div>
              <span className="text-[10px] text-slate-600">{meta.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

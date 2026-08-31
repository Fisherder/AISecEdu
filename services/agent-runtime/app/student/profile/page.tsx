'use client';

import {
  BrainCircuit,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  LoaderCircle,
  MemoryStick,
  Save,
  ShieldCheck,
  Target,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Profile {
  learningGoal: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  preferences: {
    explanationStyle?: string;
    challengeLevel?: string;
    sessionMinutes?: number;
  };
  memory: string[];
  updatedAt: number | null;
}

interface PlanStep {
  id: string;
  title: string;
  detail: string;
  status: 'pending' | 'in-progress' | 'completed';
  estimatedMinutes?: number;
}

interface Plan {
  id: string;
  title: string;
  objective: string;
  status: string;
  steps: PlanStep[];
  updatedAt: number;
}

const EMPTY_PROFILE: Profile = {
  learningGoal: '',
  level: 'beginner',
  preferences: { explanationStyle: 'guided', challengeLevel: 'adaptive', sessionMinutes: 30 },
  memory: [],
  updatedAt: null,
};

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/student/profile')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.details || payload.error || '学习档案加载失败');
        if (!cancelled) {
          setProfile({
            ...EMPTY_PROFILE,
            ...payload.profile,
            preferences: { ...EMPTY_PROFILE.preferences, ...payload.profile?.preferences },
          });
          setPlans(payload.plans ?? []);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '学习档案加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile() {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/student/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learningGoal: profile.learningGoal,
          level: profile.level,
          preferences: profile.preferences,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details || payload.error || '保存失败');
      setProfile(payload.profile);
      setNotice('学习偏好已保存，下一轮对话会自动使用。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function forgetFact(fact: string) {
    const response = await fetch('/api/student/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forgetFact: fact }),
    });
    const payload = await response.json();
    if (response.ok) setProfile(payload.profile);
  }

  async function toggleStep(plan: Plan, step: PlanStep) {
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
    if (response.ok)
      setPlans((items) => items.map((item) => (item.id === plan.id ? payload.plan : item)));
  }

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500">
        <LoaderCircle className="mr-2 animate-spin text-cyan-300" size={18} />
        正在读取你的目标、偏好与记忆…
      </div>
    );
  }

  return (
    <div>
      <header className="mb-7">
        <div className="text-[10px] tracking-[0.16em] text-cyan-300">LEARNER CONTROL</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
          学习偏好与智能体记忆
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          你可以查看、修改或删除智能体保存的长期信息。课程权限、教师答案和其他学生数据不会进入你的学习上下文。
        </p>
      </header>

      {(error || notice) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`mb-4 rounded-2xl border px-4 py-3 text-xs ${error ? 'border-rose-400/15 bg-rose-400/[0.05] text-rose-300' : 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300'}`}
        >
          {error || notice}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-3xl border border-white/[0.07] bg-slate-900/70 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              <Target size={18} />
            </span>
            <div>
              <h2 className="text-base font-medium text-slate-100">目标与学习方式</h2>
              <p className="mt-1 text-[10px] text-slate-600">
                这是偏好，不是限制；每次自然语言命令仍然优先。
              </p>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="text-xs text-slate-400">长期学习目标</span>
            <textarea
              rows={3}
              value={profile.learningGoal}
              onChange={(event) =>
                setProfile((value) => ({ ...value, learningGoal: event.target.value }))
              }
              placeholder="例如：能够独立分析二进制漏洞并解释自己的解题思路"
              className="mt-2 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#081522] px-4 py-3 text-sm leading-6 text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-cyan-300/25"
            />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="当前基础">
              <select
                value={profile.level}
                onChange={(event) =>
                  setProfile((value) => ({
                    ...value,
                    level: event.target.value as Profile['level'],
                  }))
                }
                className="field-select"
              >
                <option value="beginner">入门</option>
                <option value="intermediate">进阶</option>
                <option value="advanced">高级</option>
              </select>
            </Field>
            <Field label="单次学习时长">
              <select
                value={profile.preferences.sessionMinutes ?? 30}
                onChange={(event) =>
                  setProfile((value) => ({
                    ...value,
                    preferences: {
                      ...value.preferences,
                      sessionMinutes: Number(event.target.value),
                    },
                  }))
                }
                className="field-select"
              >
                <option value={15}>15 分钟</option>
                <option value={30}>30 分钟</option>
                <option value={45}>45 分钟</option>
                <option value={60}>60 分钟</option>
                <option value={90}>90 分钟</option>
              </select>
            </Field>
            <Field label="解释方式">
              <select
                value={profile.preferences.explanationStyle ?? 'guided'}
                onChange={(event) =>
                  setProfile((value) => ({
                    ...value,
                    preferences: { ...value.preferences, explanationStyle: event.target.value },
                  }))
                }
                className="field-select"
              >
                <option value="guided">逐步启发</option>
                <option value="concise">先给简明结论</option>
                <option value="detailed">详细拆解</option>
                <option value="examples">示例优先</option>
              </select>
            </Field>
            <Field label="挑战强度">
              <select
                value={profile.preferences.challengeLevel ?? 'adaptive'}
                onChange={(event) =>
                  setProfile((value) => ({
                    ...value,
                    preferences: { ...value.preferences, challengeLevel: event.target.value },
                  }))
                }
                className="field-select"
              >
                <option value="adaptive">根据证据自适应</option>
                <option value="gentle">循序渐进</option>
                <option value="stretch">适度挑战</option>
                <option value="intensive">高强度训练</option>
              </select>
            </Field>
          </div>

          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={saving}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-[#06111f] transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {saving ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}
            保存学习偏好
          </button>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-slate-900/70 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-400/10 text-violet-300">
              <MemoryStick size={18} />
            </span>
            <div>
              <h2 className="text-base font-medium text-slate-100">可控长期记忆</h2>
              <p className="mt-1 text-[10px] text-slate-600">只保存你明确表达的稳定信息。</p>
            </div>
          </div>
          {profile.memory.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/[0.08] px-5 py-10 text-center">
              <MemoryStick className="mx-auto text-slate-700" size={22} />
              <div className="mt-3 text-xs text-slate-500">还没有长期记忆</div>
              <p className="mt-1 text-[10px] leading-5 text-slate-700">
                你可以在对话中直接说“请记住我更习惯先看示例”。
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              {profile.memory.map((fact) => (
                <div
                  key={fact}
                  className="group flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#081522] p-3"
                >
                  <Eye size={14} className="mt-0.5 shrink-0 text-violet-300" />
                  <span className="min-w-0 flex-1 text-xs leading-5 text-slate-400">{fact}</span>
                  <button
                    type="button"
                    onClick={() => void forgetFact(fact)}
                    className="rounded-lg p-1.5 text-slate-700 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`忘记：${fact}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" />
            <div>
              <div className="text-xs text-emerald-200">学生权限边界</div>
              <p className="mt-1 text-[10px] leading-5 text-slate-600">
                智能体只能读取你的已加入课程、已分配任务、个人学习包、学习证据和你自己的记忆；不能发布课程、读取教师私有答案或访问其他学习者。
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-3xl border border-white/[0.07] bg-slate-900/70 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-400/10 text-indigo-300">
            <BrainCircuit size={18} />
          </span>
          <div>
            <h2 className="text-base font-medium text-slate-100">正在执行的学习计划</h2>
            <p className="mt-1 text-[10px] text-slate-600">
              在智能体对话中制定，完成状态由你控制。
            </p>
          </div>
        </div>
        {plans.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-white/[0.08] px-5 py-9 text-center text-xs text-slate-600">
            还没有学习计划。直接告诉智能体：“根据我的进度，帮我制定今天的学习计划。”
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onToggle={toggleStep} />
            ))}
          </div>
        )}
      </section>
      <style jsx>{`
        .field-select {
          margin-top: 0.5rem;
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #081522;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          color: #cbd5e1;
          outline: none;
        }
        .field-select:focus {
          border-color: rgba(103, 232, 249, 0.25);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function PlanCard({
  plan,
  onToggle,
}: {
  plan: Plan;
  onToggle: (plan: Plan, step: PlanStep) => Promise<void>;
}) {
  const completed = plan.steps.filter((step) => step.status === 'completed').length;
  const progress = plan.steps.length ? Math.round((completed / plan.steps.length) * 100) : 0;
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#081522] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-200">{plan.title}</h3>
          <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-600">{plan.objective}</p>
        </div>
        <span className="shrink-0 text-[10px] text-cyan-300">{progress}%</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-950">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-indigo-400"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 space-y-1">
        {plan.steps.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => void onToggle(plan, step)}
            className="group flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.035]"
          >
            <span
              className={`mt-0.5 ${step.status === 'completed' ? 'text-emerald-300' : 'text-slate-700 group-hover:text-cyan-300'}`}
            >
              {step.status === 'completed' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-xs ${step.status === 'completed' ? 'text-slate-600 line-through' : 'text-slate-300'}`}
              >
                {step.title}
              </span>
              <span className="mt-0.5 block text-[9px] text-slate-700">
                {step.detail}
                {step.estimatedMinutes ? ` · ${step.estimatedMinutes} 分钟` : ''}
              </span>
            </span>
            {step.status === 'completed' && <Check size={12} className="mt-1 text-emerald-300" />}
          </button>
        ))}
      </div>
    </article>
  );
}

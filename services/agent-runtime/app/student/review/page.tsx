'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface ReviewContent {
  summary: string;
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
  evidenceNote: string;
  disclaimer: string;
}

interface ReviewRecord {
  id: string;
  review: ReviewContent;
  source: 'ai' | 'fallback';
  createdAt: number;
}

interface Evidence {
  completionRate: number;
  completedScenes: number;
  totalScenes: number;
  averageQuizScore: number | null;
  quizAttemptCount: number;
  evidenceEventCount: number;
  capabilities: Array<{
    id: string;
    label: string;
    score: number | null;
    confidence: string;
    evidenceCount: number;
  }>;
}

export default function StudentReviewPage() {
  const [latest, setLatest] = useState<ReviewRecord | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/student/review');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '评价加载失败');
      setLatest(payload.latest ?? null);
      setReviews(payload.reviews ?? []);
      setEvidence(payload.currentEvidence ?? null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '评价加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generateReview() {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/student/review', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '评价生成失败');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '评价生成失败');
    } finally {
      setGenerating(false);
    }
  }

  if (loading)
    return (
      <div className="rounded-3xl border border-white/[0.07] bg-slate-900 p-8 text-sm text-slate-400">
        正在汇总可追溯学习证据…
      </div>
    );
  return (
    <div>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="text-[11px] tracking-[0.16em] text-emerald-300">FORMATIVE AI COACH</div>
          <h1 className="mt-2 text-2xl font-semibold">AI 学习评价</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            AI
            只解释课堂、测验和自主学习产生的证据，帮助你发现优势、薄弱点与下一步，不替代教师评分。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generateReview()}
          disabled={generating}
          className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
        >
          {generating ? '正在分析证据…' : latest ? '基于最新证据重新评价' : '生成第一次评价'}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-300"
        >
          {error}
        </div>
      )}

      {evidence && (
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="学习进度" value={`${Math.round(evidence.completionRate * 100)}%`} />
          <Metric
            label="已完成场景"
            value={`${evidence.completedScenes}/${evidence.totalScenes}`}
          />
          <Metric
            label="测验均分"
            value={evidence.averageQuizScore == null ? '暂无' : `${evidence.averageQuizScore}`}
          />
          <Metric label="过程证据" value={`${evidence.evidenceEventCount} 条`} />
        </section>
      )}

      {!latest ? (
        <div className="mt-5 rounded-3xl border border-dashed border-emerald-300/20 bg-emerald-400/[0.03] px-6 py-14 text-center">
          <div className="text-sm text-slate-300">还没有生成评价</div>
          <p className="mt-2 text-xs text-slate-500">
            先完成教师任务或自主学习包，会得到更具体的反馈。
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/student/tasks" className="text-xs text-cyan-300">
              去做教师任务
            </Link>
            <Link href="/student/self-study" className="text-xs text-violet-300">
              生成自主学习包
            </Link>
          </div>
        </div>
      ) : (
        <ReviewPanel record={latest} />
      )}

      {evidence && evidence.capabilities.length > 0 && (
        <section className="mt-5 rounded-3xl border border-white/[0.07] bg-slate-900/80 p-5">
          <h2 className="text-sm font-medium text-slate-200">评价所依据的能力证据</h2>
          <p className="mt-1 text-[10px] text-slate-600">暂无证据显示为空，不按 0 分计算。</p>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {evidence.capabilities.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-950/60 p-3">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-slate-400">{item.label}</span>
                  <span className={item.score == null ? 'text-slate-700' : 'text-cyan-300'}>
                    {item.score ?? '待积累'}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-slate-700">
                  {item.evidenceCount} 条证据 · {item.confidence}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 1 && (
        <section className="mt-6">
          <h2 className="text-sm text-slate-400">历史评价</h2>
          <div className="mt-3 space-y-2">
            {reviews.slice(1).map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-white/[0.05] bg-slate-900/50 p-3"
              >
                <div className="text-[10px] text-slate-600">
                  {new Date(record.createdAt).toLocaleString()}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-400">
                  {record.review.summary}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewPanel({ record }: { record: ReviewRecord }) {
  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-emerald-400/[0.09] via-slate-900 to-cyan-400/[0.05] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] text-slate-500">
          生成于 {new Date(record.createdAt).toLocaleString()}
        </div>
        <span className="rounded-full bg-slate-950/70 px-2.5 py-1 text-[10px] text-emerald-300">
          {record.source === 'ai' ? 'AI 证据解释' : '本地证据规则评价'}
        </span>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-200">{record.review.summary}</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <ReviewList title="已有优势" items={record.review.strengths} tone="emerald" />
        <ReviewList title="需要聚焦" items={record.review.focusAreas} tone="amber" />
        <ReviewList title="下一步行动" items={record.review.nextSteps} tone="cyan" />
      </div>
      <div className="mt-5 border-t border-white/[0.07] pt-4 text-[10px] leading-5 text-slate-500">
        {record.review.evidenceNote}
      </div>
      <div className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.04] p-3 text-[10px] leading-5 text-cyan-100/70">
        {record.review.disclaimer}
      </div>
    </section>
  );
}

function ReviewList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'emerald' | 'amber' | 'cyan';
}) {
  const color = { emerald: 'text-emerald-300', amber: 'text-amber-300', cyan: 'text-cyan-300' }[
    tone
  ];
  return (
    <div className="rounded-2xl bg-slate-950/55 p-4">
      <h3 className={`text-xs font-medium ${color}`}>{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="text-xs leading-5 text-slate-400">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-900 p-4">
      <div className="text-xl font-semibold text-slate-200">{value}</div>
      <div className="mt-1 text-[10px] text-slate-600">{label}</div>
    </div>
  );
}

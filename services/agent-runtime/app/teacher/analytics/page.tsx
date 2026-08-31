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
  learnerCoverage: number;
}

interface TeacherAnalytics {
  summary: {
    courseCount: number;
    publishedLessonCount: number;
    learnerCount: number;
    evidenceEventCount: number;
    averageCompletionRate: number;
    averageQuizScore: number | null;
    atRiskCount: number;
    completedCount: number;
  };
  cohort: { capabilities: CapabilityMetric[] };
  courses: Array<{
    id: string;
    title: string;
    courseCode?: string;
    learnerCount: number;
    publishedLessonCount: number;
    averageCompletionRate: number;
    averageQuizScore: number | null;
    atRiskCount: number;
  }>;
  learners: Array<{
    learnerKey: string;
    username: string;
    displayName: string;
    courseIds: string[];
    insight: {
      state: LearnerState;
      completionRate: number;
      averageQuizScore: number | null;
      lastActiveAt: number | null;
      nextAction: { title: string; reason: string };
      weakestCapability: { shortLabel: string; score: number | null } | null;
    };
  }>;
  blindSpots: Array<{ id: string; title: string; affectedLearners: number; averageScore: number }>;
  methodology: { version: string; note: string };
}

const STATE_META: Record<LearnerState, { label: string; color: string; bg: string }> = {
  'not-started': { label: '未开始', color: '#94a3b8', bg: 'rgba(100,116,139,.14)' },
  'on-track': { label: '进行良好', color: '#38bdf8', bg: 'rgba(14,165,233,.12)' },
  'at-risk': { label: '需要关注', color: '#fb7185', bg: 'rgba(244,63,94,.12)' },
  completed: { label: '已完成', color: '#34d399', bg: 'rgba(16,185,129,.12)' },
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function TeacherAnalyticsPage() {
  const [data, setData] = useState<TeacherAnalytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teacher/analytics')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '加载失败');
        if (!cancelled) setData(payload as TeacherAnalytics);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <StatePanel tone="error" title="学情数据加载失败" detail={error} />;
  if (!data)
    return <StatePanel title="正在重放学习证据…" detail="汇总课程、场景访问、测验与能力标签" />;

  const riskLearners = data.learners
    .filter(
      (learner) => learner.insight.state === 'at-risk' || learner.insight.state === 'not-started',
    )
    .slice(0, 8);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Link href="/teacher" style={{ color: '#64748b', fontSize: 12, textDecoration: 'none' }}>
        ← 教学驾驶舱
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 20,
          alignItems: 'flex-end',
          margin: '12px 0 22px',
        }}
      >
        <div>
          <div style={{ color: '#22d3ee', fontSize: 11, letterSpacing: '.16em', marginBottom: 6 }}>
            LEARNING INTELLIGENCE
          </div>
          <h1 style={{ fontSize: 24, margin: 0 }}>学情洞察</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '7px 0 0' }}>
            从可追溯学习证据识别进度、风险和能力覆盖，而不是让模型凭空打分。
          </p>
        </div>
        <div style={{ color: '#64748b', fontSize: 11, textAlign: 'right' }}>
          <div>方法 {data.methodology.version}</div>
          <div style={{ marginTop: 4 }}>{data.summary.evidenceEventCount} 条事件证据</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
        <Metric label="课程" value={data.summary.courseCount} suffix=" 门" accent="#38bdf8" />
        <Metric label="学习者" value={data.summary.learnerCount} suffix=" 人" accent="#818cf8" />
        <Metric
          label="平均进度"
          value={Math.round(data.summary.averageCompletionRate * 100)}
          suffix="%"
          accent="#22d3ee"
        />
        <Metric
          label="平均测验"
          value={data.summary.averageQuizScore ?? '—'}
          suffix={data.summary.averageQuizScore == null ? '' : ' 分'}
          accent="#34d399"
        />
        <Metric label="需要关注" value={data.summary.atRiskCount} suffix=" 人" accent="#fb7185" />
      </div>

      {data.summary.learnerCount === 0 ? (
        <section style={{ ...panelStyle, marginTop: 14, textAlign: 'center', padding: 40 }}>
          <div style={{ color: '#e2e8f0', fontSize: 15 }}>还没有学习证据</div>
          <p style={{ color: '#64748b', fontSize: 12, margin: '8px 0 16px' }}>
            创建课程、加入已发布课堂并让学生开始学习后，这里会自动形成画像。
          </p>
          <Link href="/teacher/courses" style={{ color: '#67e8f9', fontSize: 12 }}>
            前往课程空间 →
          </Link>
        </section>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, .65fr)',
            gap: 14,
            marginTop: 14,
          }}
        >
          <section style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>新六维 · 班级能力覆盖</h2>
                <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 11 }}>
                  空白代表暂无证据；覆盖率与分数分开呈现。
                </p>
              </div>
              <span style={{ color: '#64748b', fontSize: 10 }}>确定性证据模型</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.cohort.capabilities.map((metric) => (
                <div key={metric.id}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr 54px',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ color: '#cbd5e1', fontSize: 12 }}>{metric.shortLabel}</div>
                      <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>
                        覆盖 {percent(metric.learnerCoverage)}
                      </div>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: '#0f172a',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${metric.score ?? 0}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: metric.color,
                          opacity: metric.score == null ? 0 : 1,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        color: metric.score == null ? '#475569' : metric.color,
                        fontSize: 12,
                        textAlign: 'right',
                      }}
                    >
                      {metric.score ?? '无证据'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={{ margin: 0, fontSize: 16 }}>共性知识盲点</h2>
            <p style={{ color: '#64748b', fontSize: 11, margin: '5px 0 14px' }}>
              仅显示已有测验且低于 60 分的场景。
            </p>
            {data.blindSpots.length === 0 ? (
              <div
                style={{
                  padding: '25px 10px',
                  textAlign: 'center',
                  color: '#475569',
                  fontSize: 12,
                }}
              >
                暂无低分测验证据
              </div>
            ) : (
              data.blindSpots.map((spot) => (
                <div key={spot.id} style={{ padding: '10px 0', borderBottom: '1px solid #29364a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ color: '#cbd5e1', fontSize: 12 }}>{spot.title}</span>
                    <span style={{ color: '#fb7185', fontSize: 12 }}>{spot.averageScore} 分</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                    影响 {spot.affectedLearners} 名学生
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 14,
          marginTop: 14,
        }}
      >
        <section style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 13,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>课程运行态</h2>
              <p style={{ color: '#64748b', fontSize: 11, margin: '5px 0 0' }}>
                发布内容与学习证据已经贯通。
              </p>
            </div>
            <Link
              href="/teacher/courses"
              style={{ color: '#67e8f9', fontSize: 11, textDecoration: 'none' }}
            >
              管理课程 →
            </Link>
          </div>
          {data.courses.length === 0 ? (
            <Empty text="还没有课程" />
          ) : (
            data.courses.map((course) => (
              <div key={course.id} style={{ padding: '11px 0', borderBottom: '1px solid #29364a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <Link
                      href={`/teacher/courses/${course.id}`}
                      style={{ color: '#e2e8f0', fontSize: 12, textDecoration: 'none' }}
                    >
                      {course.title}
                    </Link>
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                      {course.publishedLessonCount} 节已发布 · {course.learnerCount} 名学生
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#38bdf8', fontSize: 12 }}>
                      {percent(course.averageCompletionRate)}
                    </div>
                    {course.atRiskCount > 0 && (
                      <div style={{ color: '#fb7185', fontSize: 9, marginTop: 3 }}>
                        {course.atRiskCount} 人需关注
                      </div>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 99,
                    background: '#0f172a',
                    marginTop: 9,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: percent(course.averageCompletionRate),
                      background: '#38bdf8',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </section>

        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 16 }}>需要教师关注</h2>
          <p style={{ color: '#64748b', fontSize: 11, margin: '5px 0 13px' }}>
            排序依据：低分、长期未活跃或尚未开始。
          </p>
          {riskLearners.length === 0 ? (
            <Empty text="当前没有风险信号" />
          ) : (
            riskLearners.map((learner) => {
              const meta = STATE_META[learner.insight.state];
              return (
                <div
                  key={learner.learnerKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid #29364a',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <span style={{ color: '#e2e8f0', fontSize: 12 }}>{learner.displayName}</span>
                      <span
                        style={{
                          color: meta.color,
                          background: meta.bg,
                          borderRadius: 999,
                          padding: '2px 7px',
                          fontSize: 9,
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 5 }}>
                      {learner.insight.nextAction.title}
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>
                    <div>{percent(learner.insight.completionRate)}</div>
                    <div style={{ color: '#64748b', fontSize: 9, marginTop: 3 }}>
                      {learner.insight.averageQuizScore == null
                        ? '暂无测验'
                        : `${learner.insight.averageQuizScore} 分`}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      <div
        style={{
          marginTop: 14,
          border: '1px solid rgba(34,211,238,.18)',
          background: 'rgba(8,145,178,.06)',
          borderRadius: 10,
          padding: '11px 14px',
          color: '#94a3b8',
          fontSize: 10,
        }}
      >
        口径说明：{data.methodology.note} 这些画像用于教学干预建议，不替代正式成绩和教师判断。
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number | string;
  suffix: string;
  accent: string;
}) {
  return (
    <div style={{ ...panelStyle, padding: 15 }}>
      <div style={{ color: accent, fontSize: 23, fontWeight: 700 }}>
        {value}
        <span style={{ color: '#64748b', fontSize: 10, fontWeight: 400 }}>{suffix}</span>
      </div>
      <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 8px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
      {text}
    </div>
  );
}

function StatePanel({
  title,
  detail,
  tone = 'default',
}: {
  title: string;
  detail: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div style={{ ...panelStyle, padding: 28, color: tone === 'error' ? '#f87171' : '#94a3b8' }}>
      <div style={{ fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>{detail}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 14,
  padding: 18,
};
